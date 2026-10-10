// The dance moves (task #394): poses for client/art2/people.js, registered in its POSES and MORE_POSES. Only the live
// characters use them (game/peds.js imports this module): kept out of the chunk bake's reach (tools/stamp-version.mjs
// ART_SKIP), so a change to a dance doesn't throw away every browser's baked chunks.
import { POSES, MORE_POSES as GAITS2 } from './people.js';

const vadd = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mv = (M, v) => [M[0] * v[0] + M[1] * v[1] + M[2] * v[2], M[3] * v[0] + M[4] * v[1] + M[5] * v[2], M[6] * v[0] + M[7] * v[1] + M[8] * v[2]];

// ==== Dancing (task #394, shared/dance.js; server nightclubs.js, dance.js) ==============================================
// The dance moves (DN1), four frames each: dstep (a loose two-step), dbounce (bouncing on the knees, the fists low),
// dpump (an arm up, the fist pumping; both up on the beat), dpoint (the disco point: up to one side, down across),
// dspin (arms out, a foot up: the client turns the figure round with the frames, shared/dance.js danceDir), drobot (stiff,
// the arms at right angles, the head and the chest turning in steps), dsway (a slow sway, the eyes closed); the couples,
// face to face (COUPLE_PX apart): dslow / dslowf (the lead's hands at the partner's waist, the partner's on his shoulders),
// dsalsa / dsalsaf (hands held, a step in and out, the turn under the lead's raised hand); djump (jumping in the crowd).
Object.assign(POSES, { dstep: 4, dbounce: 4, dpump: 4, dpoint: 4, dspin: 4, drobot: 4, dsway: 4, dslow: 4, dslowf: 4, dsalsa: 4, dsalsaf: 4, djump: 4 });
const DUP = (S, s, x, z) => vadd(S[s < 0 ? 'shL' : 'shR'], [s * x, 2, z]);        // a hand up over a shoulder
const DCH = (S, x, y, z) => vadd(S.chest, mv(S.SP, [x, y, z]));                    // a hand in front of the chest
const DHIP = (D, S, s) => vadd(S.pel, [s * (D.pelR[0] + 1.2), 0.8, 2.6]);          // a hand on the hip (s: the side)
const PARTNER_Y = 8.4;   // where the partner's body is, in front (body units)
const danceBase = (P) => { P.acc = false; P.lean = -0.02; P.splay = 0.3; };
Object.assign(GAITS2, {
  dstep(D, P, f) {   // step out to the right, together, out to the left, together; the fists loose in front
    danceBase(P);
    const s = f < 2 ? 1 : -1, out = !(f & 1);
    P.pel = [s * (out ? 1.6 : 0.8), 0, D.pelZ - (out ? 0.6 : 1.6)]; P.tilt = -s * 0.08; P.twist = s * 0.18; P.headYaw = s * 0.2; P.headPitch = out ? -0.1 : 0.06;
    P.fL = [-D.hipX - (s < 0 && out ? 3.6 : 1.0), 0.4, D.ank + (s > 0 && out ? 1.2 : 0)]; P.fR = [D.hipX + (s > 0 && out ? 3.6 : 1.0), -0.2, D.ank + (s < 0 && out ? 1.2 : 0)];
    P.kneeL = [-0.3, 1, 0]; P.kneeR = [0.3, 1, 0];
    P.hands = (S) => { P.hL = DCH(S, -4.2 + s * 1.2, 7.0, out ? -1.4 : -3.0); P.hR = DCH(S, 4.2 + s * 1.2, 7.0, out ? -3.0 : -1.4); P.elL = [-1, -0.3, -0.4]; P.elR = [1, -0.3, -0.4]; };
  },
  dbounce(D, P, f) {   // down on the knees and up, the fists pumping low, the head nodding
    danceBase(P);
    const low = f & 1, s = f < 2 ? 1 : -1;
    P.pel = [s * 0.6, -0.4, D.pelZ - (low ? 2.6 : 0.4)]; P.lean = low ? 0.12 : -0.02; P.headPitch = low ? 0.22 : -0.08; P.twist = s * 0.1;
    P.fL = [-D.hipX - 2.4, 0.4, D.ank]; P.fR = [D.hipX + 2.4, 0.4, D.ank]; P.kneeL = [-0.5, 1, 0]; P.kneeR = [0.5, 1, 0];
    P.hands = (S) => { P.hL = DCH(S, -5.0, 6.4, low ? -4.0 : 0.6); P.hR = DCH(S, 5.0, 6.4, low ? -4.0 : 0.6); P.elL = [-1, -0.4, -0.5]; P.elR = [1, -0.4, -0.5]; };
  },
  dpump(D, P, f) {   // the right fist up and pumping; both up on the beat
    danceBase(P);
    const down = f & 1;
    P.pel = [0.8, 0, D.pelZ - (down ? 1.8 : 0.3)]; P.headPitch = down ? 0.05 : -0.3; P.tilt = -0.06;
    P.fL = [-D.hipX - 2.0, 0.6, D.ank]; P.fR = [D.hipX + 2.0, -0.2, D.ank + (f === 0 ? 1.6 : 0)];
    P.hands = (S) => {
      P.hR = down ? vadd(S.shR, [3.4, 3.0, 5.6]) : DUP(S, 1, 3.4, 13.6);
      P.hL = f === 2 ? DUP(S, -1, 3.4, 13.6) : f === 3 ? vadd(S.shL, [-3.4, 3.0, 5.6]) : DCH(S, -4.4, 6.6, -2.0);
      P.elL = [-1, -0.2, -0.3]; P.elR = [1, -0.2, -0.3];
    };
  },
  dpoint(D, P, f) {   // the disco point: up and out to one side, down across the body; then the other hand
    danceBase(P);
    const up = !(f & 1), s = f < 2 ? 1 : -1, k = s > 0 ? 'R' : 'L';
    P.pel = [-s * 1.4, 0, D.pelZ - (up ? 0.4 : 1.4)]; P.tilt = s * 0.12; P.twist = s * (up ? 0.12 : -0.2); P.headYaw = s * (up ? 0.35 : -0.2); P.headPitch = up ? -0.25 : 0.1;
    P.fL = [-D.hipX - 2.6, 0.4, D.ank]; P.fR = [D.hipX + 2.6, 0.4, D.ank]; P.kneeL = [-0.3, 1, 0]; P.kneeR = [0.3, 1, 0];
    P.hands = (S) => {
      P['h' + k] = up ? vadd(S['sh' + k], [s * 8.8, 3.2, 10.4]) : vadd(S.pel, [-s * (D.pelR[0] + 1.6), 3.0, 1.0]);
      P['h' + (s > 0 ? 'L' : 'R')] = DHIP(D, S, -s);
      P.elL = [-1, -0.2, -0.3]; P.elR = [1, -0.2, -0.3];
    };
  },
  dspin(D, P, f) {   // arms out, up on one foot (the figure is turned round from frame to frame)
    danceBase(P);
    P.pel = [0, 0, D.pelZ - 0.3 + (f & 1) * 0.4]; P.headPitch = -0.15; P.twist = 0.25;
    P.fL = [-D.hipX - 0.4, 0.2, D.ank]; P.fR = [D.hipX - 0.2, -1.2, D.ank + 3.6 + (f & 1)]; P.kneeR = [0.6, 1, 0];
    P.hands = (S) => { P.hL = vadd(S.shL, [-11.0, -1.0 + f * 0.4, 3.0]); P.hR = vadd(S.shR, [11.0, 1.0 - f * 0.4, 3.6]); P.openL = P.openR = 1; P.elL = [-1, 0, 0.2]; P.elR = [1, 0, 0.2]; };
  },
  drobot(D, P, f) {   // stiff: the upper arms out level, the forearms up / forward / down by turns, the head turning in steps
    danceBase(P); P.lean = 0; P.splay = 0.1;
    P.pel = [0, 0, D.pelZ - 0.8]; P.twist = [0.3, 0, -0.3, 0][f]; P.headYaw = [0.5, 0, -0.5, 0][f]; P.headPitch = 0;
    P.fL = [-D.hipX - 1.8, 0.2, D.ank]; P.fR = [D.hipX + 1.8, 0.2, D.ank];
    P.hands = (S) => {
      const R = [[6.4, 1.0, 6.2], [6.6, 6.4, -0.6], [6.4, 1.0, -5.6], [6.6, 6.4, -0.6]][f], L = [[6.4, 1.0, -5.6], [6.6, 6.4, -0.6], [6.4, 1.0, 6.2], [6.6, 6.4, -0.6]][f];
      P.hR = vadd(S.shR, R); P.hL = vadd(S.shL, [-L[0], L[1], L[2]]);
      P.elR = [1, -0.1, 0]; P.elL = [-1, -0.1, 0]; P.openL = P.openR = 1;
    };
  },
  dsway(D, P, f) {   // a slow sway side to side, the eyes closed, the arms loose
    danceBase(P);
    const s = [1, 0, -1, 0][f];
    P.eyes = 0; P.pel = [s * 1.4, 0, D.pelZ - 0.6]; P.tilt = -s * 0.1; P.headYaw = s * 0.15; P.headPitch = 0.12; P.twist = s * 0.08;
    P.fL = [-D.hipX - 1.4, 0.4, D.ank + (s > 0 ? 0.8 : 0)]; P.fR = [D.hipX + 1.4, 0.2, D.ank + (s < 0 ? 0.8 : 0)];
    P.hands = (S) => { P.hL = vadd(S.shL, [-3.4 - s * 0.8, 3.4, -D.reach * 0.62]); P.hR = vadd(S.shR, [3.4 - s * 0.8, 3.4, -D.reach * 0.62]); P.openL = P.openR = 1; P.elL = [-1, -0.4, -0.2]; P.elR = [1, -0.4, -0.2]; };
  },
  dslow(D, P, f) {   // the slow dance's lead: the hands at the partner's waist, swaying
    danceBase(P);
    const s = [1, 0, -1, 0][f];
    P.pel = [s * 1.0, 0, D.pelZ - 0.4]; P.tilt = -s * 0.06; P.headYaw = s * 0.12; P.headPitch = 0.1; P.lean = 0.06;
    P.fL = [-D.hipX - 1.2, 0.6, D.ank + (s > 0 ? 0.6 : 0)]; P.fR = [D.hipX + 1.2, 0.6, D.ank + (s < 0 ? 0.6 : 0)];
    P.hands = () => { const z = D.pelZ + 3.0; P.hL = [-3.6 + s * 0.6, PARTNER_Y - 1.0, z]; P.hR = [3.6 + s * 0.6, PARTNER_Y - 1.0, z]; P.elL = [-1, -0.6, -0.4]; P.elR = [1, -0.6, -0.4]; P.openL = P.openR = 1; };
  },
  dslowf(D, P, f) {   // the partner: the hands up on the lead's shoulders, the eyes closed now and then
    GAITS2.dslow(D, P, f);
    P.headPitch = -0.12; P.eyes = f === 2 ? 0 : 1;
    P.hands = (S) => { const z = S.shL[2] + 1.2; P.hL = [-3.8, PARTNER_Y - 1.6, z]; P.hR = [3.8, PARTNER_Y - 1.6, z]; P.elL = [-1, -0.4, -0.6]; P.elR = [1, -0.4, -0.6]; P.openL = P.openR = 1; };
  },
  dsalsa(D, P, f) {   // the salsa's lead: hands held, a step in, together, the turn (his left hand up), a step back
    danceBase(P);
    const st = [1, 0, 0, -1][f];
    P.pel = [[-1, 0.6, 0, 1][f], st * 1.2, D.pelZ - (f === 1 ? 1.4 : 0.6)]; P.twist = [0.2, -0.1, 0.25, -0.2][f]; P.tilt = [0.1, -0.06, 0.04, -0.1][f]; P.headYaw = [0.15, -0.1, 0.3, -0.15][f];
    P.fL = [-D.hipX - 1.0, 0.4 + st * 4.2, D.ank]; P.fR = [D.hipX + 1.0, 0.2 - (f === 3 ? 1.4 : 0), D.ank + (f === 1 ? 0.8 : 0)];
    P.hands = (S) => {
      P.hL = f === 2 ? vadd(S.shL, [1.6, 5.0, 12.4]) : [-4.6, PARTNER_Y - 2.4 + st * 1.6, S.shL[2] - 1.0];
      P.hR = f === 2 ? DCH(S, 4.2, 6.2, -2.0) : [2.4, PARTNER_Y + 0.6 + st * 1.6, D.pelZ + 4.4];
      P.elL = [-1, -0.4, -0.4]; P.elR = [1, -0.4, -0.4];
    };
  },
  dsalsaf(D, P, f) {   // the partner, mirroring: back, together, turning under his hand, forward
    danceBase(P);
    const st = [-1, 0, 0, 1][f];
    P.pel = [[1, -0.6, 0, -1][f] * 1.4, st * 1.2, D.pelZ - (f === 1 ? 1.2 : 0.4)]; P.twist = [-0.25, 0.15, 0.5, 0.2][f]; P.tilt = [-0.12, 0.08, 0.06, 0.12][f]; P.headYaw = [-0.2, 0.15, 0.6, 0.1][f];
    P.fL = [-D.hipX - 0.8, 0.4 - (f === 0 ? 1.4 : 0), D.ank + (f === 1 ? 0.8 : 0)]; P.fR = [D.hipX + 0.8, 0.2 + st * 3.4, D.ank + (f === 2 ? 1.6 : 0)];
    P.hands = (S) => {
      P.hR = f === 2 ? vadd(S.shR, [-1.6, 3.0, 13.0]) : [4.6, PARTNER_Y - 2.4 - st * 1.6, S.shR[2] - 1.0];
      P.hL = f === 2 ? DHIP(D, S, -1) : vadd(S.shL, [-2.0, 6.4, 0.8]);
      P.elL = [-1, -0.4, -0.4]; P.elR = [1, -0.4, -0.4]; P.openL = 1;
    };
  },
  djump(D, P, f) {   // jumping with the crowd: both fists up in the air; on the ground one up and one in
    danceBase(P);
    const air = f & 1, s = f < 2 ? 1 : -1, lift = air ? 4.2 : 0;
    P.pel = [s * 0.4, 0, D.pelZ - (air ? 0.2 : 2.0) + lift]; P.headPitch = air ? -0.35 : 0.05; P.lean = air ? -0.06 : 0.1;
    P.fL = [-D.hipX - 1.4, air ? -0.8 : 0.6, D.ank + lift + (air ? 1.4 : 0)]; P.fR = [D.hipX + 1.4, air ? -0.6 : 0.6, D.ank + lift + (air ? 1.0 : 0)];
    P.toeL = P.toeR = air ? 0.6 : 0; P.kneeL = [-0.4, 1, 0]; P.kneeR = [0.4, 1, 0];
    P.hands = (S) => {
      if (air) { P.hL = DUP(S, -1, 3.0 + s, 13.8); P.hR = DUP(S, 1, 3.0 - s, 13.8); }
      else { P.hR = DUP(S, 1, 3.6, 12.0); P.hL = s > 0 ? vadd(S.shL, [-3.4, 3.0, 5.4]) : DUP(S, -1, 3.6, 12.0); }
      P.elL = [-1, -0.2, -0.3]; P.elR = [1, -0.2, -0.3];
    };
  },
});
// ==== end of dancing ====================================================================================================

// ==== The guard (blocking: server combat.js - a player's held guard, an NPC's raised now and then; main.js pedPose) ====
// Its own pose, no longer the aim's: knees bent, feet apart, the head down behind it. Fists: both up in front of the
// face, the elbows in. A bat, a sword, the katana or the plasma blade: held across in front of the face in both hands,
// the blade up and out to the far side - what a blow meets. (Here, out of the chunk bake's reach, like the dances.)
const vn = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
function holdItem(P, kind, axis, down) {   // (people.js setItem, two-handed)
  axis = vn(axis);
  const d = down[0] * axis[0] + down[1] * axis[1] + down[2] * axis[2];
  P.item = { kind, axis, vdir: vn([down[0] - axis[0] * d, down[1] - axis[1] * d, down[2] - axis[2] * d]), two: true };
}
Object.assign(POSES, { guard: 1 });
Object.assign(GAITS2, {
  guard(D, P, f, kind) {
    P.acc = false; P.lean = 0.14; P.twist = -0.14; P.headPitch = 0.2; P.splay = 0.25;
    P.fL = [-D.hipX - 1.2, 4.8, D.ank]; P.fR = [D.hipX + 1.4, -4.4, D.ank]; P.pel[2] -= 1.6;
    P.kneeL = [-0.4, 1, 0]; P.kneeR = [0.4, 1, 0];
    P.hands = (S) => {
      P.elR = [0.7, -0.2, -1]; P.elL = [-0.7, -0.2, -1];
      if (!kind) { P.hR = vadd(S.shR, [-2.2, 4.4, 4.8]); P.hL = vadd(S.shL, [2.4, 4.8, 5.4]); return; }
      P.hR = vadd(S.shR, [-1.4, 5.8, 3.8]);
      holdItem(P, kind, [-0.72, 0.18, 0.68], [0, 1, 0]);
    };
  },
});
