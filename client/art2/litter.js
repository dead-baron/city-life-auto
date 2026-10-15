// Someone lying on a paramedic's stretcher (the owner, 2026-10-15: "when paramedics put someone in a stretcher it
// should be the actual character of the NPC or player"): the pose 'litter' for client/art2/people.js - on the back, the
// head up on the pillow, the knees drawn up, the hands resting on the stomach, the eyes closed - registered in its POSES
// and MORE_POSES as the dance moves are (dances.js). Only the live characters use it (game/peds.js imports this module),
// so it stays out of the chunk bake's reach (tools/stamp-version.mjs ART_SKIP): a change here doesn't throw away every
// browser's baked chunks.
//   litterApp(A)   the person as they lie there: their own look (skin, hair, face, clothes), nothing in the hands or on
//                  the back, a little shorter (LITTER.h) so they fit the stretcher people.js draws (34 px of pad: an
//                  adult lying full length is ~50)
//   LITTER         where they lie on it, from the medic pushing it (game/host.js): the anchor under their hips this far
//                  ahead (model units), their back this high (world px: the pad's top, 23.8 model units at the camera's
//                  zScale)
//   litterAt(d8, out)  that spot from the medic's feet as the sprites draw it (px): the figures are drawn at the camera's
//                  35 degrees, so a step ahead toward the top or the bottom of the screen is shorter (sin 35) - as
//                  game/peds.js umbrellaTop
import { POSES, MORE_POSES as GAITS2, PERSON_CAM, CLOSE } from './people.js';

const vadd = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mv = (M, v) => [M[0] * v[0] + M[1] * v[1] + M[2] * v[2], M[3] * v[0] + M[4] * v[1] + M[5] * v[2], M[6] * v[0] + M[7] * v[1] + M[8] * v[2]];

export const LITTER = Object.freeze({ h: 0.75, ahead: 21, z: Math.round(23.8 * PERSON_CAM.zScale * 10) / 10 });

Object.assign(POSES, { litter: 1 });
Object.assign(GAITS2, {
  litter(D, P) {   // (body space: x right, y the front - up, lying - z toward the head; the root lays it on its back as 'dead')
    P.acc = false; P.ground = true; P.eyes = 0; P.lean = 0; P.headPitch = 0.28; P.headYaw = 0; P.splay = 0.05;
    P.fL = [-D.hipX - 0.6, 0.6, D.ank + 6.4]; P.fR = [D.hipX + 0.6, 0.6, D.ank + 6.0];   // (the feet flat, drawn up toward the hips: the knees up)
    P.kneeL = [-0.15, 1, 0]; P.kneeR = [0.15, 1, 0];
    P.hands = (S) => {   // (on the stomach, the elbows out by the sides)
      P.hL = vadd(S.chest, mv(S.SP, [-2.6, D.chestR[1] + 1.6, -7.2])); P.hR = vadd(S.chest, mv(S.SP, [2.4, D.chestR[1] + 1.8, -6.2]));
      P.elL = [-1, 0.2, -0.2]; P.elR = [1, 0.2, -0.2]; P.openL = P.openR = 1;
    };
    P.root = [-1, 0, 0, 0, 0, 1, 0, 1, 0]; P.pivot = P.pel.slice();
  },
});

export function litterAt(d8, out = [0, 0]) {
  const th = Math.PI / 2 - ((8 - (d8 | 0)) % 8 + 8) % 8 * Math.PI / 4;
  out[0] = Math.cos(th) * LITTER.ahead; out[1] = Math.sin(th) * LITTER.ahead * CLOSE.SA;
  return out;
}
export function litterApp(A) {
  const a = A || {};
  return { ...a, body: { ...(a.body || {}), h: LITTER.h * ((a.body && a.body.h) || 1) }, carry: undefined, held: undefined, back: undefined, pp: undefined };
}
