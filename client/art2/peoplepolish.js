// The character polish pass (docs/tasks/CHARACTERS.md, docs/characters/NOTES.md): the same people - client/art2/people.js's
// rig, wardrobe, hair, shading and outlines - with a body of about 3.4 heads, a neck, a shoulder line, hands that show, and
// a face on the art grid. Staged: OFF until the owner approves a sheet (people.js setPolish; game/peds.js polishPeople loads
// this file only when it's switched on, so today's renderer doesn't carry it).
//
// POLISH.K            [head, legs, arms, limb thickness, body width]: people.js dims()'s scales (today 1.36, 0.88, 0.94, 1.2, 1.08)
// POLISH.dims(D, A, b) the rest of the body's measures, on dims()'s D (b: the build - h, w, limb, belly, muscle)
// POLISH.eyeZ          how high on the head the eyes sit (in head radii; today 0.12 - under most fringes there's no room for a brow)
// POLISH.nose / eyes / mouth(cx, ...)   the face's art pixels: people.js face() hands in cx = { at, put, onHead, eyes, e0, A, D, P,
//                      F (the look's face), W (the wardrobe's ramps), skin (5-step ramp, dark to light), eyeC, near, turn, ... }
const mix = (a, b, k) => a.map((v, i) => Math.round(v + (b[i] - v) * k));
const lum = (c) => (0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2]) / 255;
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
// a colour pushed toward dark until it stands `min` away from the skin it sits on
const off = (c, skin, min) => { let o = c; for (let k = 0; k < 6 && dist(o, skin) < min; k++) o = o.map((v) => Math.round(v * 0.82)); return o; };
// which side of the face's middle an eye is on (features step outward from it)
const outOf = (cx, e) => (e.p.x < cx.at(0, 1, 0).x ? -1 : 1);

export const POLISH = {
  K: [1.3, 1.06, 1.0, 1.02, 1.0],
  eyeZ: 0.02,
  noseK: 1.0,
  dims(D, A, b) {
    const fem = D.fem, mu = D.mu, w = D.w, h = D.h;
    // the neck: the head sits a neck above the shoulders (today the chin is inside them), the neck thick enough to show
    D.headUp = D.head[2] + 1.7 * h;
    D.neckR = (fem ? 2.05 : 2.4) * Math.min(1.2, 0.5 + w * 0.5) * (1 + mu * 0.2);
    // the shoulder line: square and wider than the head on a man, narrower with a waist and hips on a woman; a build's
    // muscle is shoulders and chest over a narrow waist (a V), its belly the waist (a pear)
    D.shX *= fem ? 0.97 : 1.03; D.shUp = 14.0 * h; D.shBar = (fem ? 2.7 : 3.0) * w * (1 + mu * 0.08);
    D.chestR[0] *= fem ? 0.98 : 1.04;
    D.waistR[0] *= (fem ? 0.86 : 0.93) * (1 - mu * 0.08);
    if (fem) { D.pelR[0] *= 1.05; D.hipX *= 1.04; }
    // hands: never smaller than an art pixel and a half across, whatever the limbs' thickness
    D.fist = Math.max(D.fist, fem ? 2.75 : 3.0);
    D.pelZ = D.ank + (D.shin + D.thigh) * 0.985 + 1.0;
  },
  // the nose: a shadow on the side away from the light (the light's from the left), on the row under the eyes
  nose(cx, n) {
    const { put, e0, skin, F } = cx, k = F.nose | 0, q = { bx: n.bx, by: e0.by + 2 };
    const sh = mix(skin[2], skin[1], 0.45), soft = mix(skin[3], skin[2], 0.7);
    // straight, small, button, wide, long, hooked
    if (k === 1) return void put(q, soft);
    put(q, k === 2 ? mix(skin[4], skin[3], 0.4) : sh);
    if (k === 2) put(q, sh, 1, 0);
    if (k === 3) put(q, soft, -1, 0);
    if (k === 4 || k === 5) put(q, k === 5 ? skin[1] : sh, 0, 1);
  },
  // the eyes and brows. An eye is one art pixel, dark enough to be an eye on every skin (today it's the iris's colour
  // mixed toward the skin: on tan and dark skin it's the skin's own shadow); a brow in the hair's colour on the row
  // above it, for everyone (today 'natural' has none); on dark skin the light catches the cheek under the eye
  eyes(cx) {
    const { put, eyes, P, F, W, skin, eyeC, EYE, WHITE, LASH, D } = cx, E5 = F.eyes | 0, B5 = F.brows | 0, fem = D.fem;
    const sk = lum(skin[3]), dk = sk < 0.4, hairC = W.hairR ? W.hairR[1] : EYE;
    // (the iris's colour kept - task #429 - and darkened, hue and all, until it's well under the skin it sits on)
    let pupil = eyeC; for (let k = 0; k < 10 && (lum(skin[3]) - lum(pupil) < (dk ? 0.17 : 0.22) || dist(pupil, skin[3]) < 100); k++) pupil = pupil.map((v) => Math.round(v * 0.86));
    const lid = mix(skin[1], LASH, 0.35), white = mix(WHITE, skin[4], dk ? 0.2 : 0.1), lash = mix(LASH, skin[0], 0.15);
    // (a brow is never as dark as the eye under it, or the two read as one tall bar)
    const brow0 = off(mix(hairC, EYE, 0.2), skin[3], 84), brow = mix(brow0, skin[2], 0.3), browS = mix(brow0, skin[2], 0.55);
    for (const e of eyes) {
      const o = outOf(cx, e), q = e.p;
      if (!P.eyes) { put(q, lid); continue; }   // (shut: the lid's line)
      put(q, pupil);
      // almond the eye alone; round a lash over it; narrow a squint's line running out; hooded the lid's shadow over it;
      // big a lash over and the white beside; sleepy a heavy lid over and out
      if (E5 === 1 || E5 === 4) put(q, lash, 0, -1);
      if (E5 === 2) put(q, lid, o, 0);
      if (E5 === 3) put(q, mix(skin[1], skin[0], 0.3), 0, -1);
      if (E5 === 4) put(q, white, o, 0);
      if (E5 === 5) { put(q, lid, 0, -1); put(q, mix(skin[2], lid, 0.5), o, 0); }
      if (dk && E5 !== 4) put(q, mix(skin[3], skin[4], 0.8), 0, 1);
      // brows: natural, thick, thin, arched, straight, bushy (a man's natural brow a full pixel, a woman's a soft one),
      // a row higher over an eye that has a lash or a lid on it
      const up = E5 === 1 || E5 === 3 || E5 === 4 || E5 === 5 ? 1 : 0, b = (dx, dy, c) => put(q, c, dx * o, dy - 1 - up);
      if (B5 === 0) b(0, 0, fem ? browS : brow);
      else if (B5 === 1) { b(0, 0, brow); b(1, 0, brow); }
      else if (B5 === 2) b(1, 0, browS);
      else if (B5 === 3) { b(0, -1, browS); b(1, 0, brow); }
      else if (B5 === 4) { b(0, 0, browS); b(1, 0, browS); }
      else { b(0, 0, brow); b(1, 0, brow); b(0, -1, brow); b(-1, 0, browS); }
    }
  },
  // the mouth: two rows under the eyes, across the face's middle - a man's a short line in the skin's shadow, a woman's in
  // her lips' colour; turned to the side, one pixel
  mouth(cx, m, lip, L5, my) {
    const { put, skin, D, e0 } = cx, fem = D.fem;
    const q = e0 ? { bx: m.bx, by: Math.max(m.by, e0.by + 4) } : m, side = cx.turn > 0.3;
    const c = fem ? mix(lip, skin[2], 0.2) : mix(skin[1], [92, 52, 56], 0.35), soft = mix(c, skin[3], 0.5), dark = mix(c, skin[0], 0.5), hi = mix(c, [255, 236, 226], 0.3);
    // medium, thin, full, wide, bow, small
    if (L5 === 5 || side) return void put(q, L5 === 5 ? soft : L5 === 1 ? dark : c, side ? 0 : -1, 0);
    put(q, L5 === 1 ? dark : L5 === 4 ? hi : c, -1, 0); put(q, L5 === 1 ? dark : c, 0, 0);
    if (L5 === 2) { put(q, mix(c, skin[3], 0.5), -1, 1); put(q, mix(c, skin[3], 0.5), 0, 1); }
    if (L5 === 3) { put(q, soft, -2, 0); put(q, soft, 1, 0); }
  },
};
