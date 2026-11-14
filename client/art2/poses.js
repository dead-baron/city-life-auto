// Emotes and poses on the body (the owner, 2026-11-13: "emotes are body animations first"; 11-14: "animate into those
// poses instead of pop into them. And then have a subtle idle to it ... not a super repetitive loop"). Every emote's frames
// for client/art2/people.js (registered in its POSES and MORE_POSES) and when each shows (SEQ: emoteAt / emoteFrame,
// game/peds.js - host.js draws them). Loaded the first time someone near emotes (game/peds.js loadPoses: they stand as
// they are for that moment), never with the renderer itself, and out of the chunk bake's reach (peds.js is in ART_SKIP).
// The people.js body units: x to the right, y forward, z up.
// - the way in: a few frames from standing (sitting down, lying back, kneeling, toppling over) - and back out, the same
//   frames the other way (or the pose's own: getting up off the face), when you move or its time is up;
// - a lasting pose (shared/chatdefs.js hold: sit, lie down, sleep, the phone, lean, crouch, kneel) held, with small beats
//   now and then - a breath, a glance, the thumb on the phone, the weight shifted, a scratch - picked by the ped's id and
//   the time since it began: never a fixed loop, and roughly the same for everyone watching (they saw it start together);
// - a gesture (wave, cheer, a laugh...) loops its four frames after a frame on the way up;
// - a faceplant: stiff as a board, over onto the face, a bounce, and lying there (a twitch, a weak hand up now and then).
import { POSES, MORE_POSES as GAITS2, SEATS, PERSON_CAM } from './people.js';
import { EMOTE_FPS } from './dances.js';

const vadd = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const vlerp = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
const mv = (M, v) => [M[0] * v[0] + M[1] * v[1] + M[2] * v[2], M[3] * v[0] + M[4] * v[1] + M[5] * v[2], M[6] * v[0] + M[7] * v[1] + M[8] * v[2]];
const rx = (a) => { const c = Math.cos(a), s = Math.sin(a); return [1, 0, 0, 0, c, s, 0, -s, c]; };   // (people.js: pitch forward)
const SIDE_B = [0, 1, 0, 0, 0, -1, -1, 0, 0];     // on the right side, the head where the back was (lain down from sitting)
const SEAT = SEATS.sitlow / PERSON_CAM.zScale;    // sat on the ground (people.js sitlow)
const HEAD = (S, x, y, z) => vadd(S.head, mv(S.SP, [x, y, z]));    // a hand by the head
const DCH = (S, x, y, z) => vadd(S.chest, mv(S.SP, [x, y, z]));    // a hand in front of the chest
const DHIP = (D, S, s) => vadd(S.pel, [s * (D.pelR[0] + 1.2), 0.8, 2.6]);   // a hand on the hip (s: the side)
const DUP = (S, s, x, z) => vadd(S[s < 0 ? 'shL' : 'shR'], [s * x, 2, z]);   // a hand up over a shoulder
const hang = (D, S, s) => vadd(S[s < 0 ? 'shL' : 'shR'], mv(S.SP, [s * (2.2 + D.belly * 1.6), 1.6 + D.belly, -D.reach * 0.93]));   // (people.js solve)
const b0 = (P) => { P.acc = false; P.splay = 0.18; };
const phone = (P) => { P.item = { kind: 'phone', axis: [0, 1, 0], vdir: [0, 0, -1], two: false }; };   // (people.js setItem: flat in the hand, the screen up)

// ---- in between two poses: k of the way from a to b (builders (D, P)) - the way into a pose ---------------------------
const NUM = ['lean', 'twist', 'tilt', 'headYaw', 'headPitch', 'breath', 'toeL', 'toeR', 'splay', 'pelYaw', 'rise'];
const VEC = ['pel', 'fL', 'fR', 'kneeL', 'kneeR'];
const fresh = (P) => { const Q = { ...P }; for (const k of [...VEC, 'elL', 'elR']) Q[k] = P[k].slice(); return Q; };
const STAND = () => {};
function blend(D, P, a, b, k) {
  const A = fresh(P), B = fresh(P);
  a(D, A); b(D, B);
  for (const q of NUM) P[q] = (A[q] || 0) + ((B[q] || 0) - (A[q] || 0)) * k;
  for (const q of VEC) P[q] = vlerp(A[q], B[q], k);
  const W = k < 0.5 ? A : B;
  P.acc = false; P.eyes = W.eyes; P.root = W.root; P.pivot = W.pivot; P.ground = W.ground;
  P.hands = (S) => {
    if (A.hands) A.hands(S);
    if (B.hands) B.hands(S);
    for (const s of ['L', 'R']) {
      const g = s === 'L' ? -1 : 1;
      P['h' + s] = vlerp(A['h' + s] || hang(D, S, g), B['h' + s] || hang(D, S, g), k);
      P['el' + s] = vlerp(A['el' + s], B['el' + s], k);
      P['open' + s] = W['open' + s];
    }
    P.item = W.item;
  };
}
const toward = (b, k) => (D, P) => blend(D, P, STAND, b, k);

// ---- when each frame shows ------------------------------------------------------------------------------------------
// SEQ[pose]: in - the frames on the way in (inS s each); then loop (fps), or once ([frame, s] played through) and a held
// base frame with beats: now and then (p: the odds in each slot s long) one of them - [frame, s] in turn - and back to
// base. out: the frames on the way back out (outS s each; the way in backwards when not given).
const SEQ = {};
const IN_S = 0.11, OUT_S = 0.1;
const strHash = (s) => { let h = 7; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193); return h >>> 0; };
const mix = (a, b, c) => { let x = Math.imul(a ^ Math.imul((b + 0x632be5ab) | 0, 0x85ebca6b), 0xc2b2ae35) ^ c; x ^= x >>> 15; x = Math.imul(x, 0x2c1b3c6d); x ^= x >>> 12; x = Math.imul(x, 0x297a2d39); x ^= x >>> 15; return x >>> 0; };
function def(name, frames, Q) {
  POSES[name] = frames.length;
  GAITS2[name] = (D, P, f) => frames[f](D, P);
  Q.in = Q.in || []; Q.out = Q.out || [...Q.in].reverse(); Q.h = strHash(name);
  SEQ[name] = Q; EMOTE_FPS[name] = Q.fps || 1;
}
function beat(Q, t, id) {
  if (!Q.beats) return Q.base;
  const sl = Q.slot || 1.6, u = t + (id % 11) * 0.13, s0 = Math.floor(u / sl);
  for (let s = s0; s >= 1 && s > s0 - 8; s--) {   // (the latest beat begun: still going, or over - then the base)
    const h = mix(id | 0, s, Q.h);
    if ((h & 1023) >= Q.p * 1024) continue;
    let v = u - s * sl;
    for (const [f, d] of Q.beats[(h >>> 10) % Q.beats.length]) { if (v < d) return f; v -= d; }
    return Q.base;
  }
  return Q.base;
}
// the frame of an emote's pose t s after it began, for ped id
export function emoteFrame(pose, t, id = 0) {
  const Q = SEQ[pose];
  if (!Q) return 0;
  t = Math.max(0, t);
  const inS = Q.inS || IN_S;
  if (t < Q.in.length * inS) return Q.in[Math.floor(t / inS)];
  t -= Q.in.length * inS;
  if (Q.loop) return Q.loop[Math.floor(t * Q.fps) % Q.loop.length];
  if (Q.once) { for (const [f, d] of Q.once) { if (t < d) return f; t -= d; } }
  return beat(Q, t, id);
}
// The pose and frame to draw person p as now (p._emQ, p._emF) - true while an emote is on (pose: the pose the game picked,
// an emote's from game/peds.js personaPose) or on its way back out (standing, walking off: the way out's frames; anything
// else - knocked down, a dive - cuts it).
export function emoteAt(p, pose, now) {
  const Q = SEQ[pose];
  if (Q) {
    if (p._emP !== pose) { p._emP = pose; p._emT = now; }
    p._emQ = pose; p._emF = emoteFrame(pose, now - p._emT, p.id | 0); p._emX = null; p._emL = now;
    return true;
  }
  const q = p._emP;
  if (!q) return false;
  if (p._emX === null || p._emX === undefined) p._emX = now - p._emL > 0.3 ? -1e9 : now;   // (gone a while, out of sight: no way out)
  const O = SEQ[q].out, k = Math.floor((now - p._emX) / (SEQ[q].outS || OUT_S));
  if (k >= O.length || !(pose === 'idle' || pose.startsWith('walk'))) { p._emP = null; p._emX = null; return false; }
  p._emQ = q; p._emF = O[k];
  return true;
}

// ==== the gestures: four frames looped (and one on the way up) ===========================================================
// a wave, both arms up, a laugh shaking the body, a thumbs up, a point, a shrug, a clap, a facepalm, a salute, a bow, a
// stomp; love (the hands over the heart), huh? (scratching the head), wow! (a jump back), an idea (a finger up); and the
// Poses tab's flex, cry, come here, the watch, air guitar, a stretch
function gesture(name, fps, fn, Q = {}) {
  const fr = [0, 1, 2, 3].map((f) => (D, P) => fn(D, P, f));
  def(name, [...fr, toward((D, P) => fn(D, P, 0), 0.5)], { in: [4], loop: Q.once ? null : [0, 1, 2, 3], fps, ...Q });
}
gesture('emwave', 5, (D, P, f) => {   // the right hand up by the head, open, waving side to side; the head tipped toward it
  b0(P);
  P.headYaw = 0.1; P.headPitch = -0.1; P.tilt = -0.06; P.pel = [-0.4, 0, D.pelZ - 0.1];
  P.hands = (S) => { P.hR = vadd(S.shR, [[7.6, 3.4, 1.4, 3.4][f], 2.6, [10.6, 12.6, 11.0, 12.6][f]]); P.openR = 1; P.elR = [1, -0.2, -0.5]; };
});
gesture('emcheer', 4, (D, P, f) => {   // both arms up, fists high; up on the toes and down, the head back
  b0(P);
  const up = !(f & 1), w = [0.6, 0, -0.6, 0][f];
  P.pel = [w * 0.6, 0, D.pelZ - (up ? 0 : 1.4) + (up ? 0.8 : 0)]; P.headPitch = up ? -0.4 : -0.15; P.lean = -0.06;
  P.fL = [-D.hipX - 1.6, 0.3, D.ank + (up ? 0.8 : 0)]; P.fR = [D.hipX + 1.6, 0.3, D.ank + (up ? 0.8 : 0)]; P.toeL = P.toeR = up ? 0.5 : 0;
  P.kneeL = [-0.3, 1, 0]; P.kneeR = [0.3, 1, 0];
  P.hands = (S) => { P.hL = DUP(S, -1, up ? 6.0 : 4.2, up ? 14.6 : 13.4); P.hR = DUP(S, 1, up ? 6.0 : 4.2, up ? 14.6 : 13.4); P.openL = P.openR = up ? 1 : 0; P.elL = [-1, -0.2, -0.3]; P.elR = [1, -0.2, -0.3]; };
});
gesture('emlaugh', 6, (D, P, f) => {   // the head thrown back, the body shaking, the hands on the belly
  b0(P);
  const k = [0, 1, 0, 1][f], s = f < 2 ? 1 : -1;
  P.lean = k ? -0.18 : 0.08; P.headPitch = k ? -0.46 : -0.18; P.headYaw = s * 0.08; P.pel = [s * 0.4, 0, D.pelZ - (k ? 0.2 : 1.1)]; P.tilt = s * 0.05;
  P.hands = (S) => { P.hL = DCH(S, -3.0, 5.4, -6.6 + k * 0.6); P.hR = DCH(S, 3.0, 5.4, -6.0 + k * 0.6); P.openL = P.openR = 1; P.elL = [-1, -0.3, -0.5]; P.elR = [1, -0.3, -0.5]; };
});
gesture('emthumbs', 3, (D, P, f) => {   // the right fist held out high in front, nodding along
  b0(P);
  P.headPitch = [0, 0.14, 0, 0.1][f]; P.headYaw = 0.06; P.lean = -0.03;
  P.hands = (S) => { P.hR = vadd(S.shR, [2.4, 8.2, [3.4, 4.2, 4.6, 3.8][f]]); P.elR = [1, -0.4, -0.5]; };
});
gesture('empoint', 3, (D, P, f) => {   // the right arm out straight in front, jabbing; the left hand on the hip
  b0(P);
  P.twist = -0.12; P.headPitch = -0.04; P.lean = 0.06;
  P.fL = [-D.hipX - 1.4, -0.6, D.ank]; P.fR = [D.hipX + 1.4, 1.6, D.ank];
  P.hands = (S) => { P.hR = vadd(S.shR, [0.4, D.reach * [0.8, 0.96, 0.92, 0.86][f], 2.4]); P.elR = [1, 0, -0.2]; P.hL = DHIP(D, S, -1); P.elL = [-1, -0.2, -0.3]; };
});
gesture('emshrug', 3, (D, P, f) => {   // the shoulders up, the hands turned out wide at the sides, the head on one side
  b0(P);
  const k = [0, 1, 1, 0.5][f];
  P.headYaw = k * 0.14; P.headPitch = -0.06 + k * 0.04; P.tilt = k * 0.07; P.pel = [0, 0, D.pelZ - 0.1 + k * 0.5]; P.breath = k * 0.6;
  P.hands = (S) => { P.hL = vadd(S.shL, [-4.4 - k * 3.4, 4.6, -6.4 + k * 2.4]); P.hR = vadd(S.shR, [4.4 + k * 3.4, 4.6, -6.4 + k * 2.4]); P.openL = P.openR = 1; P.elL = [-0.4, -0.6, -1]; P.elR = [0.4, -0.6, -1]; };
});
gesture('emclap', 6, (D, P, f) => {   // the hands meeting in front of the chest and apart again
  b0(P);
  const hit = f & 1;
  P.headPitch = hit ? 0.02 : -0.06; P.pel = [0, 0, D.pelZ - 0.1 - hit * 0.3];
  P.hands = (S) => { const x = hit ? 0.9 : [4.2, 0, 4.8, 0][f]; P.hL = DCH(S, -x, 7.2, -1.2); P.hR = DCH(S, x, 7.2, -1.2); P.openL = P.openR = 1; P.elL = [-1, -0.3, -0.5]; P.elR = [1, -0.3, -0.5]; };
});
gesture('emfacepalm', 2.5, (D, P, f) => {   // the head down into the right hand, shaking slowly
  b0(P);
  P.lean = 0.14; P.headPitch = 0.36; P.headYaw = [0, -0.14, 0.14, -0.06][f];
  P.hands = (S) => { P.hR = HEAD(S, 0.6, 6.2, -1.0); P.openR = 1; P.elR = [0.6, -0.2, -1]; P.hL = DCH(S, -2.8, 5.0, -5.6); P.elL = [-1, -0.3, -0.5]; };
});
gesture('emsalute', 2.5, (D, P, f) => {   // stood straight, the heels together, the right hand to the brow
  b0(P); P.splay = 0.08; P.lean = 0;
  P.headPitch = [-0.06, -0.1, -0.1, -0.06][f]; P.pel = [0, 0, D.pelZ + 0.2];
  P.fL = [-D.hipX - 0.4, 0.3, D.ank]; P.fR = [D.hipX + 0.4, 0.3, D.ank];
  P.hands = (S) => { P.hR = HEAD(S, 3.0, 4.8, f & 1 ? 1.6 : 1.2); P.openR = 1; P.elR = [1, 0.1, 0.1]; P.hL = vadd(S.shL, [-1.4, 0.4, -D.reach * 0.95]); P.elL = [-0.3, -1, -0.2]; };
});
gesture('emsorry', 2.5, (D, P, f) => {   // a bow from the waist, the head down, the hands together in front
  b0(P);
  const b = [0.3, 0.42, 0.46, 0.38][f];
  P.lean = b; P.headPitch = 0.2 + b * 0.5; P.pel = [0, -b * 2.4, D.pelZ - b * 1.2]; P.splay = 0.1;
  P.fL = [-D.hipX - 0.8, 0.3, D.ank]; P.fR = [D.hipX + 0.8, 0.3, D.ank];
  P.hands = (S) => { P.hL = vadd(S.pel, mv(S.SP, [-1.0, 4.8, 1.6])); P.hR = vadd(S.pel, mv(S.SP, [1.0, 5.0, 2.0])); P.openL = P.openR = 1; P.elL = [-1, -0.4, -0.4]; P.elR = [1, -0.4, -0.4]; };
});
gesture('emangry', 5, (D, P, f) => {   // a stomp, one foot then the other, the fists clenched down at the sides shaking
  b0(P);
  const s = f < 2 ? 1 : -1, lift = !(f & 1);
  P.lean = 0.16; P.headPitch = 0.18; P.twist = s * 0.06; P.pel = [s * 0.5, 0, D.pelZ - (lift ? 0.6 : 1.4)];
  P.fL = [-D.hipX - 1.8, 0.4, D.ank + (lift && s < 0 ? 3.8 : 0)]; P.fR = [D.hipX + 1.8, 0.4, D.ank + (lift && s > 0 ? 3.8 : 0)];
  P.kneeL = [-0.3, 1, 0]; P.kneeR = [0.3, 1, 0];
  P.hands = (S) => { const z = -D.reach * (lift ? 0.7 : 0.78); P.hL = vadd(S.shL, [-4.0, 1.6, z]); P.hR = vadd(S.shR, [4.0, 1.6, z]); P.elL = [-1, -0.6, 0]; P.elR = [1, -0.6, 0]; };
});
gesture('emlove', 2.5, (D, P, f) => {   // the hands crossed over the heart, the head tipped, swaying side to side
  b0(P);
  const s = f < 2 ? 1 : -1;
  P.headYaw = s * 0.12; P.headPitch = -0.14; P.tilt = s * 0.06; P.pel = [s * 0.5, 0, D.pelZ - 0.2];
  P.hands = (S) => { P.hL = DCH(S, 1.6, 4.8, 1.6); P.hR = DCH(S, -0.2, 5.2, 0.6 + (f & 1) * 0.4); P.openL = P.openR = 1; P.elL = [-1, -0.2, -0.4]; P.elR = [1, -0.2, -0.4]; };
});
gesture('emhuh', 3, (D, P, f) => {   // a hand scratching the side of the head, the head tipped, the other hand on the hip
  b0(P);
  const k = f & 1;
  P.headYaw = -0.12; P.tilt = 0.08; P.headPitch = 0.04; P.pel = [-0.4, 0, D.pelZ - 0.1];
  P.hands = (S) => { P.hR = HEAD(S, 3.6, 0.8, 2.2 + k * 1.0); P.elR = [1, 0.2, 0.1]; P.hL = DHIP(D, S, -1); P.elL = [-1, -0.2, -0.3]; };
});
gesture('emwow', 5, (D, P, f) => {   // a jump back, the hands flung up open by the face; landing and staying startled
  b0(P);
  const air = f === 0;
  P.lean = air ? -0.24 : -0.14; P.headPitch = -0.16; P.pel = [0, -1.2, D.pelZ + (air ? 2.6 : -0.6)];
  P.fL = [-D.hipX - 2.0, -1.6, D.ank + (air ? 2.4 : 0)]; P.fR = [D.hipX + 2.0, -1.0, D.ank + (air ? 2.8 : 0)]; P.kneeL = [-0.4, 1, 0]; P.kneeR = [0.4, 1, 0];
  P.hands = (S) => { const u = f === 3 ? 0.6 : 0; P.hL = vadd(S.shL, [-4.2, 3.4, 7.6 - u]); P.hR = vadd(S.shR, [4.2, 3.4, 7.6 - u]); P.openL = P.openR = 1; P.elL = [-1, -0.2, -0.4]; P.elR = [1, -0.2, -0.4]; };
}, { in: [], once: [[0, 0.2], [1, 0.2], [2, 0.2]], base: 3 });   // (startled: no way up - it's a jump)
gesture('emidea', 3, (D, P, f) => {   // a finger up by the head, the chin up; the other hand on the hip
  b0(P);
  const k = f & 1;
  P.headPitch = -0.26; P.lean = -0.04; P.pel = [0, 0, D.pelZ + (k ? 0.4 : 0)];
  P.hands = (S) => { P.hR = vadd(S.shR, [2.2, 2.4, 14.6 + k * 1.0]); P.elR = [1, -0.2, -0.6]; P.hL = DHIP(D, S, -1); P.elL = [-1, -0.2, -0.3]; };
});
gesture('emflex', 2.2, (D, P, f) => {   // a double-biceps flex, the fists by the ears; then the arms down and in, a crab flex
  b0(P);
  const up = f < 2, k = f & 1;
  P.splay = 0.3; P.headPitch = up ? -0.08 : 0.1; P.pel = [0, 0, D.pelZ - 0.6 - k * 0.6]; P.breath = up ? 0.6 : 0.2; P.lean = up ? -0.04 : 0.12;
  P.fL = [-D.hipX - 2.6, 0.6, D.ank]; P.fR = [D.hipX + 2.6, 0.6, D.ank]; P.kneeL = [-0.4, 1, 0]; P.kneeR = [0.4, 1, 0];
  P.hands = (S) => {
    if (up) { P.hL = vadd(S.shL, [-6.6 + k * 0.6, 1.6, 6.6]); P.hR = vadd(S.shR, [6.6 - k * 0.6, 1.6, 6.6]); P.elL = [-1, 0, -0.4]; P.elR = [1, 0, -0.4]; }
    else { P.hL = DCH(S, -2.0, 6.4, -5.8 + k); P.hR = DCH(S, 2.0, 6.4, -5.8 + k); P.elL = [-1, 0.2, 0.3]; P.elR = [1, 0.2, 0.3]; }
  };
});
gesture('emcry', 4, (D, P, f) => {   // the face in the hands, the head down, the shoulders shaking
  b0(P);
  const k = f & 1;
  P.lean = 0.16; P.headPitch = 0.38; P.pel = [0, 0, D.pelZ - 0.4 - k * 0.6]; P.breath = k ? 0.7 : 0; P.tilt = (f < 2 ? 1 : -1) * 0.04;
  P.hands = (S) => { P.hL = HEAD(S, -1.4, 4.4, -0.8 - k * 0.4); P.hR = HEAD(S, 1.4, 4.4, -0.8 - k * 0.4); P.openL = P.openR = 1; P.elL = [-0.6, -0.2, -1]; P.elR = [0.6, -0.2, -1]; };
});
gesture('embeckon', 4, (D, P, f) => {   // come here: the right hand out in front, palm up - then pulled back in to the chest, curled
  b0(P);
  const k = f & 1;
  P.headYaw = 0.08; P.tilt = -0.04; P.lean = k ? -0.04 : 0.06; P.headPitch = -0.06;
  P.hands = (S) => { P.hR = k ? DCH(S, 3.2, 4.6, 0.6) : vadd(S.shR, [0.6, 10.2, 0.4]); P.openR = k ? 0 : 1; P.elR = [1, -0.3, -0.6]; P.hL = DHIP(D, S, -1); P.elL = [-1, -0.2, -0.3]; };
});
gesture('emwatch', 1.6, (D, P, f) => {   // the left wrist up in front of the face, the elbow out, a look down at it; tapping it
  b0(P);
  P.headPitch = 0.3; P.headYaw = -0.12; P.lean = 0.04;
  P.hands = (S) => {
    P.hL = DCH(S, -0.6, 7.2, 3.4); P.elL = [-1, 0, 0.2];
    P.hR = f === 2 ? DCH(S, -0.2, 7.6, 4.6) : vadd(S.shR, [1.4, 0.4, -D.reach * 0.94]); P.elR = [1, -0.3, -0.4];
  };
});
gesture('emguitar', 6, (D, P, f) => {   // air guitar: a wide stance, the left hand out on the neck, the right strumming at the hip, the head banging
  b0(P);
  const k = f & 1;
  P.splay = 0.34; P.lean = -0.1 + k * 0.16; P.headPitch = k ? 0.34 : -0.2; P.twist = -0.22; P.pel = [0, 0, D.pelZ - 2.2 - k * 0.6];
  P.fL = [-D.hipX - 3.4, 1.6, D.ank]; P.fR = [D.hipX + 3.0, -1.2, D.ank]; P.kneeL = [-0.5, 1, 0]; P.kneeR = [0.5, 1, 0];
  P.hands = (S) => {
    P.hL = vadd(S.shL, mv(S.SP, [-6.6, 7.4, -1.0 + (f >> 1) * 0.8])); P.openL = 1; P.elL = [-1, -0.4, -0.5];
    P.hR = vadd(S.pel, mv(S.SP, [3.2, 5.0, 4.4 + (k ? -2.2 : 1.6)])); P.elR = [1, -0.2, -0.6];
  };
});
gesture('emstretch', 1.4, (D, P, f) => {   // the arms up over the head, the fingers laced; a bend to one side, up, the other
  b0(P);
  const s = [0, -1, 0, 1][f];
  P.tilt = s * 0.18; P.headPitch = -0.2; P.pel = [-s * 0.7, 0, D.pelZ + (s ? 0 : 0.4)]; P.breath = s ? 0 : 0.6;
  P.fL = [-D.hipX - 1.4, 0.3, D.ank + (s ? 0 : 0.4)]; P.fR = [D.hipX + 1.4, 0.3, D.ank + (s ? 0 : 0.4)]; P.toeL = P.toeR = s ? 0 : 0.5;
  P.hands = (S) => { P.hL = vadd(S.shL, [1.8, 1.0, 16.4]); P.hR = vadd(S.shR, [-1.8, 1.0, 16.4]); P.openL = P.openR = 1; P.elL = [-1, 0, 0.2]; P.elR = [1, 0, 0.2]; };
});

// ==== the lasting poses: the way down, the pose, its beats ===============================================================
// sat on the ground, knees up, leaning back on the hands; v: breath, glance (a look round and up), hug (the arms round the
// knees), scr / scr2 (a scratch of the head)
const sitB = (v) => (D, P) => {
  b0(P);
  P.lean = -0.22; P.headPitch = -0.06; P.pel = [0, -0.6, SEAT + 3.7];
  P.fL = [-D.hipX - 2.4, 7.4, D.ank]; P.fR = [D.hipX + 2.4, 6.8, D.ank]; P.kneeL = [-0.8, 0.5, 1]; P.kneeR = [0.8, 0.5, 1];
  if (v === 'breath') P.breath = 0.6;
  if (v === 'glance') { P.headYaw = 0.55; P.headPitch = -0.2; }
  const hug = v === 'hug', scr = v === 'scr' || v === 'scr2';
  if (hug) { P.lean = 0.24; P.headPitch = 0.02; P.fL = [-D.hipX - 1.0, 6.0, D.ank]; P.fR = [D.hipX + 1.0, 5.8, D.ank]; }
  if (scr) { P.headYaw = -0.12; P.tilt = 0.06; }
  P.hands = (S) => {
    P.hL = vadd(S.pel, [-5.2, -5.4, -SEAT - 1.6]); P.hR = vadd(S.pel, [5.2, -5.4, -SEAT - 1.6]); P.openL = P.openR = 1; P.elL = [-1, -0.6, 0]; P.elR = [1, -0.6, 0];
    if (hug) { P.hL = [-1.6, 9.6, D.ank + 5.0]; P.hR = [1.6, 9.4, D.ank + 5.6]; P.openL = P.openR = 0; P.elL = [-1, 0, -0.2]; P.elR = [1, 0, -0.2]; }
    if (scr) { P.hR = HEAD(S, 3.6, 0.6, v === 'scr2' ? 3.0 : 2.0); P.openR = 0; P.elR = [1, 0.2, 0.1]; }
  };
};
// leaning back from sitting, on the elbows (the way down to lying)
const elbowsB = (D, P) => {
  sitB()(D, P);
  P.lean = -0.95; P.headPitch = -0.55; P.pel = [0, -0.6, SEAT + 2.8];
  P.fL = [-D.hipX - 1.6, 10.4, D.ank]; P.fR = [D.hipX + 1.6, 9.0, D.ank];
  P.hands = (S) => { P.hL = vadd(S.pel, [-4.6, -8.0, -SEAT - 0.8]); P.hR = vadd(S.pel, [4.6, -8.0, -SEAT - 0.8]); P.openL = P.openR = 1; P.elL = [-1, -0.6, -0.4]; P.elR = [1, -0.6, -0.4]; };
};
def('emsit', [(D, P) => blend(D, P, STAND, crouchB(), 0.6), (D, P) => blend(D, P, crouchB(), sitB(), 0.55), sitB(), sitB('breath'), sitB('glance'), sitB('hug'), sitB('scr'), sitB('scr2')], {
  in: [0, 1], base: 2, p: 0.42, slot: 1.6,
  beats: [[[3, 1.0]], [[4, 1.8]], [[5, 3.6]], [[6, 0.2], [7, 0.2], [6, 0.2], [7, 0.2], [6, 0.2]], [[3, 0.9], [4, 1.4]]],
});
// flat on the back (lain back from sitting: the head where the back was), the hands behind the head, a knee up; v: breath,
// turn (the head to the side), cross (the legs out, the ankles crossed), chest (a hand on the chest)
const lieB = (v) => (D, P) => {
  b0(P); P.ground = true; P.rise = 0;
  P.lean = -1.5; P.headPitch = -0.78; P.pel = [0, -0.6, SEAT + 2.6];
  P.fL = [-D.hipX - 1.2, 12.6, D.ank]; P.fR = [D.hipX + 1.4, 6.4, D.ank]; P.kneeR = [0.3, 0.4, 1];
  if (v === 'breath') P.breath = 0.6;
  if (v === 'turn') P.headYaw = 0.7;
  if (v === 'cross') { P.fL = [-0.6, 13.0, D.ank + 0.6]; P.fR = [0.8, 13.2, D.ank]; P.kneeR = [0, 0.4, 1]; }
  P.hands = (S) => {
    P.hL = HEAD(S, -3.4, -2.4, 0.6); P.hR = HEAD(S, 3.4, -2.4, 0.6); P.elL = [-1, 0.2, 0.6]; P.elR = [1, 0.2, 0.6];
    if (v === 'chest') { P.hR = DCH(S, 1.2, 5.2, -1.2); P.openR = 1; P.elR = [1, 0, -0.2]; }
  };
};
def('emlie', [toward(sitB(), 0.5), sitB(), elbowsB, lieB(), lieB('breath'), lieB('turn'), lieB('cross'), lieB('chest')], {
  in: [0, 1, 2], inS: 0.13, base: 3, p: 0.36, slot: 1.8,
  beats: [[[4, 1.1]], [[5, 2.2]], [[6, 4.4]], [[7, 3.2]], [[4, 1.0], [5, 1.6]]],
});
// asleep on the side (lain down from sitting), curled a little, a hand under the head, the eyes shut; v: breath (slow,
// deep), curl (the knees drawn up), nuzzle (the head down into the hand)
const sleepB = (v) => (D, P) => {
  b0(P); P.ground = true; P.eyes = 0; P.lean = 0.26; P.headPitch = 0.3;
  P.fL = [-D.hipX, 5.0, D.ank + 2.4]; P.fR = [D.hipX, 6.6, D.ank + 4.4]; P.kneeL = P.kneeR = [0, 1, 0.4];
  if (v === 'breath') P.breath = 0.8;
  if (v === 'curl') { P.lean = 0.42; P.fL = [-D.hipX, 7.2, D.ank + 5.4]; P.fR = [D.hipX, 8.2, D.ank + 6.8]; }
  if (v === 'nuzzle') P.headPitch = 0.5;
  P.hands = (S) => { P.hL = HEAD(S, -1.6, 1.6, -2.4); P.hR = DCH(S, 2.6, 6.8, v === 'curl' ? -2.6 : -4.6); P.openL = P.openR = 1; P.elL = [-1, 0, -0.3]; P.elR = [1, 0, -0.5]; };
  P.root = SIDE_B; P.pivot = P.pel.slice();
};
def('emsleep', [toward(sitB(), 0.5), sitB(), elbowsB, sleepB(), sleepB('breath'), sleepB('curl'), sleepB('nuzzle')], {
  in: [0, 1, 2], inS: 0.14, base: 3, p: 0.5, slot: 2.2,
  beats: [[[4, 1.6]], [[4, 1.4], [3, 0.6], [4, 1.4]], [[5, 4.5]], [[6, 1.4]]],
});
// the head down over the phone in both hands; v: swipe (the thumb up the screen: the hand up a touch), tap (the phone
// dips), shift (the weight onto the right leg, the left knee loose), shift2 (that, swiping), up (a look up and round)
const phoneB = (v) => (D, P) => {
  b0(P);
  const sh = v === 'shift' || v === 'shift2', sw = v === 'swipe' || v === 'shift2';
  P.headPitch = 0.44; P.lean = 0.06; P.pel = [0.3, 0, D.pelZ - 0.2];
  if (sh) { P.pel = [1.5, 0, D.pelZ - 0.5]; P.tilt = -0.06; P.fL = [-D.hipX - 1.0, 1.4, D.ank + 0.5]; P.toeL = 0.45; P.kneeL = [0.2, 1, 0]; P.fR = [D.hipX + 1.2, 0.2, D.ank]; P.headYaw = 0.08; }
  if (v === 'tap') P.headPitch = 0.5;
  if (v === 'up') { P.headPitch = -0.06; P.headYaw = 0.45; }
  P.hands = (S) => {
    const t = sw ? 0.8 : v === 'tap' ? -0.5 : v === 'up' ? -1.2 : 0;
    P.hR = DCH(S, 1.2, 6.6 + (sw ? 0.4 : 0), -2.2 + t); P.hL = DCH(S, -0.6, 6.4, -2.8 + (v === 'up' ? -1.0 : 0)); P.elR = [1, -0.5, -0.6]; P.elL = [-1, -0.5, -0.6]; phone(P);
  };
};
def('emphone', [toward(phoneB(), 0.5), phoneB(), phoneB('swipe'), phoneB('tap'), phoneB('shift'), phoneB('shift2'), phoneB('up')], {
  in: [0], base: 1, p: 0.62, slot: 1.4,
  beats: [[[2, 0.18], [1, 0.26], [2, 0.18], [1, 0.3], [2, 0.18]], [[3, 0.22], [1, 0.3], [3, 0.22]], [[2, 0.2]],
    [[4, 1.3], [5, 0.18], [4, 0.36], [5, 0.18], [4, 1.1]], [[6, 1.5]]],
});
// back to the wall, a foot up on it, the arms folded (people.js lean); v: glance (along the street), breath, tap (the foot
// on the wall tapping), chin (a hand up to the chin), other (a look the other way)
const leanB = (v) => (D, P) => {
  GAITS2.lean(D, P, v === 'glance' ? 1 : 0, null, null);
  P.acc = false;
  if (v === 'breath') P.breath = 0.5;
  if (v === 'tap') { P.fR = vadd(P.fR, [0, 1.0, -1.8]); }
  if (v === 'other') P.headYaw = -0.6;
  if (v === 'chin') { P.headPitch = 0.08; const h = P.hands; P.hands = (S) => { h(S); P.hR = HEAD(S, 1.2, 4.0, -3.4); P.elR = [1, -0.2, -0.8]; }; }
};
def('emlean', [toward(leanB(), 0.5), leanB(), leanB('glance'), leanB('breath'), leanB('tap'), leanB('chin'), leanB('other')], {
  in: [0], base: 1, p: 0.45, slot: 1.7,
  beats: [[[2, 1.6]], [[3, 1.0]], [[4, 0.2], [1, 0.2], [4, 0.2], [1, 0.2], [4, 0.2]], [[5, 2.4]], [[6, 1.4]], [[2, 1.0], [6, 1.0]]],
});
// down on the heels, the knees wide, the forearms on the knees, looking ahead; v: breath, glL / glR (a look aside), shift
// (the weight to one side), touch (a hand down to the ground)
const crouchB = (v) => (D, P) => {
  b0(P);
  P.lean = 0.24; P.headPitch = -0.22; P.pel = [0, -2.8, D.ank + 3.6];
  P.fL = [-D.hipX - 2.6, 2.4, D.ank]; P.fR = [D.hipX + 2.6, 2.2, D.ank]; P.toeL = P.toeR = 0.5; P.kneeL = [-0.6, 1, 0.6]; P.kneeR = [0.6, 1, 0.6];
  if (v === 'breath') P.breath = 0.5;
  if (v === 'glL') P.headYaw = 0.55;
  if (v === 'glR') P.headYaw = -0.55;
  if (v === 'shift') { P.pel = [1.2, -2.8, D.ank + 3.4]; P.tilt = 0.08; P.headYaw = -0.15; }
  P.hands = (S) => {
    P.hL = vadd(S.pel, [-2.2, 9.6, 3.0]); P.hR = vadd(S.pel, [2.2, 9.6, 2.8]); P.elL = [-1, 0, -0.2]; P.elR = [1, 0, -0.2];
    if (v === 'touch') { P.hR = [2.2, 9.4, 1.6]; P.openR = 1; P.elR = [1, 0.2, -0.2]; }
  };
};
def('emcrouch', [toward(crouchB(), 0.5), crouchB(), crouchB('breath'), crouchB('glL'), crouchB('glR'), crouchB('shift'), crouchB('touch')], {
  in: [0], inS: 0.12, base: 1, p: 0.45, slot: 1.6,
  beats: [[[2, 1.0]], [[3, 1.4]], [[4, 1.4]], [[3, 0.9], [1, 0.3], [4, 0.9]], [[5, 2.6]], [[6, 0.7], [1, 0.2], [6, 0.7]]],
});
// down on the right knee, upright, the left forearm on the left knee; v: breath, bow (the head down), glance, chin (the
// chin on the left hand, thinking)
const kneelB = (v) => (D, P) => {
  b0(P);
  P.pel = [0, -1.6, 9.8]; P.lean = 0.12; P.headPitch = 0.04; P.pelYaw = -0.25;
  P.fR = [D.hipX + 0.6, -7.0, 1.9]; P.toeR = 1.25; P.kneeR = [0.2, 1, -0.3];
  P.fL = [-D.hipX - 2.6, 6.2, D.ank]; P.kneeL = [-0.5, 1, 0.6];
  if (v === 'breath') P.breath = 0.5;
  if (v === 'bow') { P.headPitch = 0.55; P.lean = 0.24; }
  if (v === 'glance') { P.headYaw = 0.55; P.headPitch = -0.1; }
  if (v === 'chin') { P.lean = 0.3; P.headPitch = 0.1; }
  P.hands = (S) => {
    P.hL = [-D.hipX - 2.6, 6.4, 12.6]; P.hR = vadd(S.pel, [D.hipX + 2.2, 1.8, 0.4]); P.openL = 1; P.elL = [-1, 0, -0.3]; P.elR = [1, -0.4, -0.2];
    if (v === 'chin') { P.hL = HEAD(S, -0.6, 4.2, -3.4); P.openL = 0; P.elL = [-0.4, 0.2, -1]; }
  };
};
def('emkneel', [toward(kneelB(), 0.5), kneelB(), kneelB('breath'), kneelB('bow'), kneelB('glance'), kneelB('chin')], {
  in: [0], inS: 0.13, base: 1, p: 0.42, slot: 1.7,
  beats: [[[2, 1.0]], [[3, 2.4]], [[4, 1.6]], [[5, 3.2]]],
});

// ==== a faceplant: stiff as a board, over onto the face ==================================================================
// 0-2 toppling forward from the feet (the arms flung back, then stiff at the sides - nothing breaks the fall); 3 the
// smack (the legs bounce up); 4 flat on the face; 5 a foot twitches; 6 a weak hand up off the ground ("I'm OK"); 7 the
// way up: pushed up on the hands, the knees down
const fpB = (v) => (D, P) => {
  b0(P); P.lean = 0; P.splay = 0.06;
  P.fL = [-D.hipX - 0.2, 0.4, D.ank]; P.fR = [D.hipX + 0.2, 0.4, D.ank];
  const side = (S, x, y) => { P.hL = vadd(S.shL, [-x, y, -D.reach * 0.9]); P.hR = vadd(S.shR, [x, y, -D.reach * 0.9]); P.openL = P.openR = 1; P.elL = [-1, 0, 0]; P.elR = [1, 0, 0]; };
  if (v < 3) {
    P.root = rx([0.28, 0.78, 1.28][v]); P.pivot = [0, 1.6, 0]; P.headPitch = -0.3;
    P.hands = v === 0 ? (S) => { P.hL = vadd(S.shL, [-4.4, -3.6, 4.4]); P.hR = vadd(S.shR, [4.4, -3.2, 5.0]); P.openL = P.openR = 1; P.elL = [-1, -0.4, 0]; P.elR = [1, -0.4, 0]; } : (S) => side(S, 1.2, -1.4);
    return;
  }
  P.ground = true; P.rise = 0; P.headPitch = 0.12;
  P.root = rx(Math.PI / 2 + (v === 3 ? 0.08 : 0.02)); P.pivot = [0, 1.6, 0];   // (over from the feet: they stay where they stood)
  if (v === 3) { P.fL = [-D.hipX - 0.4, -5.6, D.ank + 6.0]; P.fR = [D.hipX + 0.4, -4.8, D.ank + 6.8]; P.kneeL = P.kneeR = [0, 1, -0.2]; P.headPitch = 0.02; }
  if (v === 5) { P.fR = [D.hipX + 0.6, -3.8, D.ank + 3.6]; P.kneeR = [0, 1, -0.2]; }
  P.hands = (S) => {
    side(S, 1.4, -0.6);
    if (v === 3) side(S, 2.6, -3.0);
    if (v === 6) { P.hR = vadd(S.shR, [2.6, -6.2, -3.0]); P.elR = [1, -0.4, 0.4]; }
  };
  if (v === 7) {
    P.root = rx(Math.PI / 2 - 0.62); P.pivot = null; P.headPitch = -0.3; P.lean = -0.25;
    P.fL = [-D.hipX, -3.0, D.ank + 6.6]; P.fR = [D.hipX, -3.4, D.ank + 6.0]; P.kneeL = P.kneeR = [0, 1, 0];
    P.hands = (S) => { P.hL = vadd(S.shL, [-1.2, 10.2, 1.4]); P.hR = vadd(S.shR, [1.2, 10.2, 1.4]); P.openL = P.openR = 1; P.elL = [-1, 0.4, 0]; P.elR = [1, 0.4, 0]; };
  }
};
def('emfaceplant', [0, 1, 2, 3, 4, 5, 6, 7].map(fpB), {
  in: [0, 1, 2], inS: 0.1, once: [[3, 0.14]], base: 4, p: 0.4, slot: 1.2,
  beats: [[[5, 0.22], [4, 0.2], [5, 0.22]], [[6, 1.1]]],
  out: [7], outS: 0.2,
});
// push-ups: down on the knees, the hands to the ground (the way in and out); then up, halfway, down, halfway
const puB = (v) => (D, P) => {
  b0(P);
  if (v === 0) { fpB(7)(D, P); return; }
  const dn = [0, 0.36, 0.22, 0.1][v];
  P.ground = true; P.lean = 0; P.headPitch = -0.3;
  P.root = rx(Math.PI / 2 - dn);
  P.fL = [-D.hipX + 0.6, 1.2, D.ank]; P.fR = [D.hipX - 0.6, 1.2, D.ank];
  const y = [0, 8.4, 6.2, 4.2][v];
  P.hands = (S) => { P.hL = vadd(S.shL, [-1.4, y, 1.2]); P.hR = vadd(S.shR, [1.4, y, 1.2]); P.elL = [-1, v === 3 ? 0.5 : 0, 0.2]; P.elR = [1, v === 3 ? 0.5 : 0, 0.2]; P.openL = P.openR = 1; };
};
def('empushups', [0, 1, 2, 3].map(puB), { in: [0], inS: 0.16, loop: [1, 2, 3, 2], fps: 4.4 });
