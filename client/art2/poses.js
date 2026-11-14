// Emotes round 2 (the owner, 2026-11-13: "emotes are body animations first"): the new emotes' and the poses' frames for
// client/art2/people.js, registered in its POSES and MORE_POSES - and their speed in dances.js EMOTE_FPS. Loaded the
// first time someone near does one (game/peds.js personaPose: they stand as they are for that moment), never with the
// renderer itself, and kept out of the chunk bake's reach like dances.js. Four frames each, the people.js body units:
// x to the right, y forward, z up.
// - emotes: love (the hands over the heart), huh? (scratching the head), wow! (a jump back, the hands up), an idea (a
//   finger up);
// - lasting poses (shared/chatdefs.js hold - a slow breath, a glance now and then): sit on the ground, lie on the back,
//   asleep on the side, scrolling the phone, leaning back, crouched, on one knee;
// - the rest: a faceplant (down, and staying down: EMOTE_ONCE), push-ups, a double-biceps flex, crying into the hands,
//   beckoning (come here), a look at the watch, air guitar, a stretch.
import { POSES, MORE_POSES as GAITS2, SEATS, PERSON_CAM } from './people.js';
import { EMOTE_FPS, EMOTE_ONCE } from './dances.js';

const vadd = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mv = (M, v) => [M[0] * v[0] + M[1] * v[1] + M[2] * v[2], M[3] * v[0] + M[4] * v[1] + M[5] * v[2], M[6] * v[0] + M[7] * v[1] + M[8] * v[2]];
const rx = (a) => { const c = Math.cos(a), s = Math.sin(a); return [1, 0, 0, 0, c, s, 0, -s, c]; };   // (people.js: pitch forward)
const BACK = [-1, 0, 0, 0, 0, 1, 0, 1, 0];          // flat on the back (people.js downB, dead)
const SIDE = [0, -1, 0, 0, 0, 1, -1, 0, 0];         // on the side (people.js deadS)
const SEAT = SEATS.sitlow / PERSON_CAM.zScale;      // sat on the ground (people.js sitlow)
const HEAD = (S, x, y, z) => vadd(S.head, mv(S.SP, [x, y, z]));    // a hand by the head
const DCH = (S, x, y, z) => vadd(S.chest, mv(S.SP, [x, y, z]));    // a hand in front of the chest
const DHIP = (D, S, s) => vadd(S.pel, [s * (D.pelR[0] + 1.2), 0.8, 2.6]);   // a hand on the hip (s: the side)
const base = (P) => { P.acc = false; P.splay = 0.18; };
const phone = (P) => { P.item = { kind: 'phone', axis: [0, 1, 0], vdir: [0, 0, -1], two: false }; };   // (people.js setItem: flat in the hand, the screen up)

const FPS = {
  emlove: 2.5, emhuh: 3, emwow: 5, emidea: 3,
  emsit: 0.7, emlie: 0.6, emsleep: 0.8, emphone: 1.6, emlean: 0.5, emcrouch: 0.8, emkneel: 0.8,
  emfaceplant: 5, empushups: 2.4, emflex: 2.2, emcry: 4, embeckon: 4, emwatch: 1.6, emguitar: 6, emstretch: 1.4,
};
for (const k of Object.keys(FPS)) POSES[k] = 4;
Object.assign(EMOTE_FPS, FPS);
EMOTE_ONCE.add('emfaceplant').add('emwow');

Object.assign(GAITS2, {
  // ---- emotes ----
  emlove(D, P, f) {   // the hands crossed over the heart, the head tipped, swaying side to side
    base(P);
    const s = f < 2 ? 1 : -1;
    P.headYaw = s * 0.12; P.headPitch = -0.14; P.tilt = s * 0.06; P.pel = [s * 0.5, 0, D.pelZ - 0.2];
    P.hands = (S) => { P.hL = DCH(S, 1.6, 4.8, 1.6); P.hR = DCH(S, -0.2, 5.2, 0.6 + (f & 1) * 0.4); P.openL = P.openR = 1; P.elL = [-1, -0.2, -0.4]; P.elR = [1, -0.2, -0.4]; };
  },
  emhuh(D, P, f) {   // a hand scratching the side of the head, the head tipped, the other hand on the hip
    base(P);
    const k = f & 1;
    P.headYaw = -0.12; P.tilt = 0.08; P.headPitch = 0.04; P.pel = [-0.4, 0, D.pelZ - 0.1];
    P.hands = (S) => { P.hR = HEAD(S, 3.6, 0.8, 2.2 + k * 1.0); P.elR = [1, 0.2, 0.1]; P.hL = DHIP(D, S, -1); P.elL = [-1, -0.2, -0.3]; };
  },
  emwow(D, P, f) {   // a jump back, the hands flung up open by the face; landing and staying startled
    base(P);
    const air = f === 0;
    P.lean = air ? -0.24 : -0.14; P.headPitch = -0.16; P.pel = [0, -1.2, D.pelZ + (air ? 2.6 : -0.6)];
    P.fL = [-D.hipX - 2.0, -1.6, D.ank + (air ? 2.4 : 0)]; P.fR = [D.hipX + 2.0, -1.0, D.ank + (air ? 2.8 : 0)]; P.kneeL = [-0.4, 1, 0]; P.kneeR = [0.4, 1, 0];
    P.hands = (S) => { const u = f === 3 ? 0.6 : 0; P.hL = vadd(S.shL, [-4.2, 3.4, 7.6 - u]); P.hR = vadd(S.shR, [4.2, 3.4, 7.6 - u]); P.openL = P.openR = 1; P.elL = [-1, -0.2, -0.4]; P.elR = [1, -0.2, -0.4]; };
  },
  emidea(D, P, f) {   // a finger up by the head, the chin up; the other hand on the hip
    base(P);
    const k = f & 1;
    P.headPitch = -0.26; P.lean = -0.04; P.pel = [0, 0, D.pelZ + (k ? 0.4 : 0)];
    P.hands = (S) => { P.hR = vadd(S.shR, [2.2, 2.4, 14.6 + k * 1.0]); P.elR = [1, -0.2, -0.6]; P.hL = DHIP(D, S, -1); P.elL = [-1, -0.2, -0.3]; };
  },
  // ---- lasting poses ----
  emsit(D, P, f) {   // sat on the ground, knees up, leaning back on the hands (a breath, a glance now and then)
    base(P);
    P.lean = -0.22 - (f === 1 ? 0.03 : 0); P.headPitch = -0.06; P.headYaw = f === 3 ? 0.45 : 0; P.breath = f === 1 ? 0.5 : 0;
    P.pel = [0, -0.6, SEAT + 3.7];
    P.fL = [-D.hipX - 2.4, 7.4, D.ank]; P.fR = [D.hipX + 2.4, 6.8, D.ank]; P.kneeL = [-0.8, 0.5, 1]; P.kneeR = [0.8, 0.5, 1];
    P.hands = (S) => { P.hL = vadd(S.pel, [-5.2, -5.4, -SEAT - 1.6]); P.hR = vadd(S.pel, [5.2, -5.4, -SEAT - 1.6]); P.openL = P.openR = 1; P.elL = [-1, -0.6, 0]; P.elR = [1, -0.6, 0]; };
  },
  emlie(D, P, f) {   // flat on the back, the hands behind the head, a knee up
    base(P); P.ground = true; P.lean = 0; P.headPitch = 0.12; P.breath = f === 1 ? 0.5 : 0; P.headYaw = f === 3 ? 0.3 : 0;
    P.root = BACK;
    P.fL = [-D.hipX - 1.2, 0.6, D.ank]; P.fR = [D.hipX + 1.4, 4.6, D.ank + 4.6]; P.kneeR = [0.3, 1, 0];
    P.hands = (S) => { P.hL = vadd(S.shL, [0.4, -2.0, 7.4]); P.hR = vadd(S.shR, [-0.4, -2.0, 7.4]); P.elL = [-1, 0, 0.4]; P.elR = [1, 0, 0.4]; };
  },
  emsleep(D, P, f) {   // asleep on the side, curled a little, a hand under the head, the eyes shut; breathing slow
    base(P); P.ground = true; P.eyes = 0; P.lean = 0.24; P.headPitch = 0.3; P.breath = f & 1 ? 0.6 : 0;
    P.fL = [-D.hipX, 5.0, D.ank + 2.4]; P.fR = [D.hipX, 6.6, D.ank + 4.4]; P.kneeL = P.kneeR = [0, 1, 0.4];
    P.hands = (S) => { P.hL = HEAD(S, -1.6, 1.6, -2.4); P.hR = DCH(S, 2.6, 6.8, -4.6); P.openL = P.openR = 1; P.elL = [-1, 0, -0.3]; P.elR = [1, 0, -0.5]; };
    P.root = SIDE; P.pivot = P.pel.slice();
  },
  emphone(D, P, f) {   // the head down over the phone in both hands, the thumb scrolling; now and then a look up
    base(P);
    P.headPitch = f === 3 ? 0.1 : 0.42; P.lean = 0.06; P.pel = [0.3, 0, D.pelZ - 0.2];
    P.hands = (S) => { const t = [0, 0.5, 0, 0.5][f]; P.hR = DCH(S, 1.2, 6.6, -2.2 + t); P.hL = DCH(S, -0.6, 6.4, -2.8); P.elR = [1, -0.5, -0.6]; P.elL = [-1, -0.5, -0.6]; phone(P); };
  },
  emlean(D, P, f, kind, acc) {   // back to the wall, a foot up on it, the arms folded (people.js lean - a glance along the street now and then)
    GAITS2.lean(D, P, f === 3 ? 1 : 0, kind, null);
    P.acc = false; P.breath = f === 1 ? 0.5 : 0;
  },
  emcrouch(D, P, f) {   // down on the heels, the forearms on the knees
    base(P);
    P.lean = 0.3; P.headPitch = -0.18; P.headYaw = f === 3 ? -0.4 : 0; P.breath = f === 1 ? 0.4 : 0;
    P.pel = [0, -2.4, D.pelZ - 8.4];
    P.fL = [-D.hipX - 2.2, 1.2, D.ank]; P.fR = [D.hipX + 2.2, 1.0, D.ank]; P.toeL = P.toeR = 0.5; P.kneeL = [-0.4, 1, 0.3]; P.kneeR = [0.4, 1, 0.3];
    P.hands = (S) => { P.hL = vadd(S.pel, [-2.2, 8.4, 2.6]); P.hR = vadd(S.pel, [2.2, 8.4, 2.4]); P.elL = [-1, 0, -0.2]; P.elR = [1, 0, -0.2]; };
  },
  emkneel(D, P, f) {   // down on the right knee, upright, a hand on the left knee
    base(P);
    P.pel = [0, -1.4, 10.6]; P.lean = 0.1; P.headPitch = f === 3 ? -0.1 : 0.06; P.breath = f === 1 ? 0.5 : 0;
    P.fR = [D.hipX + 0.3, -6.6, 1.9]; P.toeR = 1.25; P.kneeR = [0, 1, -0.3];
    P.fL = [-D.hipX - 0.6, 6.2, D.ank]; P.kneeL = [0, 1, 0.6];
    P.hands = (S) => { P.hL = [-D.hipX - 1.0, 6.0, 12.6]; P.hR = vadd(S.pel, [D.hipX + 2.2, 1.8, 0.4]); P.openL = 1; P.elL = [-1, 0, -0.3]; P.elR = [1, -0.4, -0.2]; };
  },
  // ---- the rest ----
  emfaceplant(D, P, f) {   // toppling forward stiff as a board, then flat on the face (and staying there)
    base(P);
    if (f === 0) {
      P.root = rx(0.55); P.pivot = [0, 0, 0]; P.headPitch = -0.2;
      P.hands = (S) => { P.hL = vadd(S.shL, [-1.2, 1.0, -D.reach * 0.92]); P.hR = vadd(S.shR, [1.2, 1.0, -D.reach * 0.92]); };
      return;
    }
    P.ground = true; P.lean = 0; P.headPitch = -0.12; P.headYaw = 0;
    P.root = rx(Math.PI / 2 - (f === 1 ? 0.12 : 0.02));
    P.fL = [-D.hipX - 0.4, 0.6, D.ank + (f === 3 ? 1.6 : 0)]; P.fR = [D.hipX + 0.4, 0.6, D.ank];
    P.hands = (S) => { P.hL = vadd(S.shL, [-1.4, 1.0, -D.reach * 0.92]); P.hR = vadd(S.shR, [1.4, 1.0, -D.reach * 0.92]); P.openL = P.openR = 1; P.elL = [-1, 0, 0]; P.elR = [1, 0, 0]; };
  },
  empushups(D, P, f) {   // face down on straight arms, down to the ground and up (people.js pushup's frames, twice)
    base(P);
    const dn = f & 1;
    P.ground = true; P.lean = 0; P.headPitch = -0.3;
    P.root = rx(Math.PI / 2 - (dn ? 0.12 : 0.36));
    P.fL = [-D.hipX + 0.6, 1.2, D.ank]; P.fR = [D.hipX - 0.6, 1.2, D.ank];
    P.hands = (S) => { P.hL = vadd(S.shL, [-1.4, dn ? 4.2 : 8.4, 1.2]); P.hR = vadd(S.shR, [1.4, dn ? 4.2 : 8.4, 1.2]); P.elL = [-1, dn ? 0.5 : 0, 0.2]; P.elR = [1, dn ? 0.5 : 0, 0.2]; P.openL = P.openR = 1; };
  },
  emflex(D, P, f) {   // a double-biceps flex, the fists by the ears; then the arms down and in, a crab flex
    base(P);
    const up = f < 2, k = f & 1;
    P.splay = 0.3; P.headPitch = up ? -0.08 : 0.08; P.pel = [0, 0, D.pelZ - 0.4 - k * 0.4]; P.breath = up ? 0.6 : 0.2;
    P.fL = [-D.hipX - 2.4, 0.6, D.ank]; P.fR = [D.hipX + 2.4, 0.6, D.ank];
    P.hands = (S) => {
      if (up) { P.hL = vadd(S.shL, [-6.2 + k * 0.6, 1.6, 6.2]); P.hR = vadd(S.shR, [6.2 - k * 0.6, 1.6, 6.2]); P.elL = [-1, 0, -0.4]; P.elR = [1, 0, -0.4]; }
      else { P.hL = DCH(S, -2.2, 6.2, -5.4 + k); P.hR = DCH(S, 2.2, 6.2, -5.4 + k); P.elL = [-1, -0.2, 0.2]; P.elR = [1, -0.2, 0.2]; }
    };
  },
  emcry(D, P, f) {   // the face in the hands, the head down, the shoulders shaking
    base(P);
    const k = f & 1;
    P.lean = 0.12; P.headPitch = 0.34; P.pel = [0, 0, D.pelZ - 0.4 - k * 0.5]; P.breath = k ? 0.7 : 0; P.tilt = (f < 2 ? 1 : -1) * 0.03;
    P.hands = (S) => { P.hL = HEAD(S, -1.4, 4.4, -0.8 - k * 0.4); P.hR = HEAD(S, 1.4, 4.4, -0.8 - k * 0.4); P.openL = P.openR = 1; P.elL = [-0.6, -0.2, -1]; P.elR = [0.6, -0.2, -1]; };
  },
  embeckon(D, P, f) {   // come here: the right hand out in front, palm up, curling back in; the head tipped
    base(P);
    const k = f & 1;
    P.headYaw = 0.08; P.tilt = -0.04; P.lean = 0.04;
    P.hands = (S) => { P.hR = vadd(S.shR, [0.4, k ? 6.0 : 9.6, 0.6 + k * 1.6]); P.openR = k ? 0 : 1; P.elR = [1, -0.3, -0.6]; P.hL = DHIP(D, S, -1); P.elL = [-1, -0.2, -0.3]; };
  },
  emwatch(D, P, f) {   // the left wrist up in front of the chest, a look down at it; tapping it
    base(P);
    P.headPitch = 0.36; P.headYaw = -0.1; P.lean = 0.05;
    P.hands = (S) => { P.hL = DCH(S, 0.2, 7.4, 0.4); P.elL = [-1, -0.4, -0.3]; P.hR = f === 2 ? DCH(S, 0.4, 7.6, 1.6) : vadd(S.shR, [1.4, 0.4, -D.reach * 0.94]); P.elR = [1, -0.3, -0.4]; };
  },
  emguitar(D, P, f) {   // air guitar: the left hand out on the neck, the right strumming at the hip, knees bent, the head banging
    base(P);
    const k = f & 1;
    P.splay = 0.3; P.lean = 0.12 + k * 0.08; P.headPitch = k ? 0.32 : -0.12; P.twist = -0.18; P.pel = [0, 0, D.pelZ - 1.6 - k * 0.6];
    P.fL = [-D.hipX - 2.6, 1.6, D.ank]; P.fR = [D.hipX + 2.2, -1.4, D.ank]; P.kneeL = [-0.4, 1, 0]; P.kneeR = [0.4, 1, 0];
    P.hands = (S) => { P.hL = vadd(S.shL, [-3.0, 9.6, -2.4 + (f >> 1) * 0.8]); P.openL = 1; P.elL = [-1, -0.3, -0.4]; P.hR = vadd(S.pel, mv(S.SP, [2.8, 4.6, 3.6 + (k ? -1.8 : 1.4)])); P.elR = [1, -0.2, -0.6]; };
  },
  emstretch(D, P, f) {   // the arms up over the head, the fingers laced; a bend to one side, up, the other
    base(P);
    const s = [0, -1, 0, 1][f];
    P.tilt = s * 0.16; P.headPitch = -0.2; P.pel = [-s * 0.6, 0, D.pelZ + (s ? 0 : 0.4)]; P.breath = s ? 0 : 0.6;
    P.fL = [-D.hipX - 1.4, 0.3, D.ank + (s ? 0 : 0.4)]; P.fR = [D.hipX + 1.4, 0.3, D.ank + (s ? 0 : 0.4)]; P.toeL = P.toeR = s ? 0 : 0.5;
    P.hands = (S) => { P.hL = vadd(S.shL, [1.8, 1.0, 16.4]); P.hR = vadd(S.shR, [-1.8, 1.0, 16.4]); P.openL = P.openR = 1; P.elL = [-1, 0, 0.2]; P.elR = [1, 0, 0.2]; };
  },
});
