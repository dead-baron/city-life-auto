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
import { cloth } from './people.js';
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
  hairLit: true,    // (pass 3: hair as a mass with a lit top - hairLit below)
  mouthOn: false,   // (pass 3, the owner 11-19: the concepts' small figures have no mouth - off; true draws pass 1's. Painted lips - lipstick, glam, goth, a clown's - always show)
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
    if (fem && b.belly > 0 && b.belly < 1.2) { D.pelR[0] *= 1.08; D.hipX *= 1.05; D.waistR[0] *= 0.95; }   // (curvy: the hips, not the waist)
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
    const { put, skin, D, e0, A } = cx, fem = D.fem, mk = A.makeup;
    if (!this.mouthOn && !(mk && mk.kind !== 'blush') && !(A.fmask && A.fmask.k === 'clown')) return;
    const q = e0 ? { bx: m.bx, by: Math.max(m.by, e0.by + 4) } : m, side = cx.turn > 0.3;
    const c = fem ? mix(lip, skin[2], 0.2) : mix(skin[1], [92, 52, 56], 0.35), soft = mix(c, skin[3], 0.5), dark = mix(c, skin[0], 0.5), hi = mix(c, [255, 236, 226], 0.3);
    // medium, thin, full, wide, bow, small
    if (L5 === 5 || side) return void put(q, L5 === 5 ? soft : L5 === 1 ? dark : c, side ? 0 : -1, 0);
    put(q, L5 === 1 ? dark : L5 === 4 ? hi : c, -1, 0); put(q, L5 === 1 ? dark : c, 0, 0);
    if (L5 === 2) { put(q, mix(c, skin[3], 0.5), -1, 1); put(q, mix(c, skin[3], 0.5), 0, 1); }
    if (L5 === 3) { put(q, soft, -2, 0); put(q, soft, 1, 0); }
  },
  // ---- pass 2 (docs/tasks/CHARACTERS2.md, docs/characters/CONCEPTS.md) ----------------------------------------------
  // Dark clothing that reads: people.js wardrobe() hands over its materials (W: a function a part, each returning a
  // 5-step ramp). A dark cloth's ramp is re-lit - its shadows kept, its lit steps lifted and cooled, as the concepts
  // paint black and navy (a slate mid-tone, a blue-grey light) - so folds, lapels and the arm over the chest have
  // tones to be drawn in; a dark top over dark bottoms gets a waist line, dark shoes a lighter sole.
  dress(W, A, D, T) {
    const keep = new Set([W.skin, W.hairR]), fix = (R) => (Array.isArray(R) && Array.isArray(R[0]) && !keep.has(R) ? relit(R) : R);
    const wrap = (k, f) => { const o = W[k]; if (o) W[k] = (Q) => f(o(Q), Q); };
    for (const k of ['torso', 'arm', 'leg', 'skirt', 'hood', 'collar', 'shoe', 'sole', 'hat', 'brim', 'lining', 'apron', 'pack', 'leather', 'case', 'beltbag']) wrap(k, fix);
    const bothDark = isDark(W.top) && isDark(W.bot) && !T.dress && !T.long && !T.bib;
    // underwear (lookcore.js 'under': A.under, on the halves no clothes cover): briefs that are briefs - full, cut at the
    // leg - trunks and boxers with a waistband in the trim colour, boxers a little down the thigh, a sports bra a wide
    // band, lace the trim colour scattered through it, silk a sheen
    const U = A.under, ub = U && A.bottom && A.bottom.under && W.bk !== 'none', ut = U && A.top && A.top.under, band = U && cloth(U.trim), hs = (Q, n) => ((Math.floor(Q.x / 2) * 7 + Math.floor(Q.y / 2) * 13 + n) % 5 === 0);
    const lace = (R, Q) => { if (U.gloss) Q.gloss = 0.7; return U.lace && hs(Q, 1) ? band : R; };
    if (ub) {
      const brief = W.bk === 'bikini', o = W.pel;
      W.pel = (Q) => {
        const R = o(Q), z = Q.z, au = Math.abs(Q.u);
        if (R !== W.bot && R !== W.skin) return R;
        const top = brief ? 1.7 : 2.5;
        if (z > top || (brief && au > 0.66 && z < -0.2)) return W.skin;
        return U.band && z > top - 0.75 ? band : lace(W.bot, Q);
      };
      if (!brief && !U.fit) wrap('leg', (R, Q) => (Q.part === 'th' && Q.l0 < 0.62 ? lace(W.bot, Q) : R));
    }
    if (ut && T.bikini) wrap('torso', (R, Q) => {
      const z = Q.z, au = Math.abs(Q.u);
      if (U.sport && z > D.chestUp - 1.5 && z < D.shUp - 1.3 && (z < D.chestUp + 1.9 || (au > 0.22 && au < 0.42))) return W.top;
      return R === W.top ? lace(R, Q) : R;
    });
    else if (ut && U.lace) wrap('torso', (R, Q) => (R === W.top ? lace(R, Q) : R));
    // uniforms that read at a glance (C3, CC5, SF21, SM21). The police's (T.duty): a badge big enough to be an art pixel
    // of gold, a shoulder patch, a gold buckle on the black belt. A plain work uniform (chef, postal, paramedic) has no
    // badge and no holster. Reflective bands (lookcore d.bands) round the chest, the arms and the shins.
    const plain = A.top && A.top.plain, GOLD = cloth('gold'), SILVER = cloth('#c8ccd4'), REFL = cloth('#eef0c8');
    if (T.duty && plain) { W.T = { ...T, duty: 0 }; wrap('torso', (R) => (R === GOLD ? W.top : R)); }
    else if (T.duty) {
      wrap('torso', (R, Q) => { if (Q.f > 0.05 && Math.abs(Q.u + 0.42) < 0.25 && Math.abs(Q.z - D.chestUp - 1.2) < 1.7) { Q.gloss = 1; return GOLD; } return R; });
      wrap('arm', (R, Q) => { if (R === W.top && Q.part === 'ua' && Q.l0 > 0.18 && Q.l0 < 0.42 && Q.l1 > -0.2 && !(A.top && A.top.chevrons)) { Q.gloss = 0.5; return W.top2; } return R; });
      wrap('pel', (R) => (R === SILVER ? GOLD : R));
    }
    if (A.top && A.top.bands) {
      const lit = (Q) => { Q.k += 0.2; return REFL; };
      wrap('torso', (R, Q) => (R === W.top && (Math.abs(Q.z - D.chestUp + 1.4) < 0.55 || Math.abs(Q.z - D.waistUp + 0.6) < 0.55) ? lit(Q) : R));
      wrap('arm', (R, Q) => (R === W.top && Q.part === 'ua' && Math.abs(Q.l0 - 0.72) < 0.14 ? lit(Q) : R));
      wrap('leg', (R, Q) => (R === W.bot && Q.part === 'sh' && Math.abs(Q.l0 - 0.55) < 0.12 ? lit(Q) : R));
    }
    // socks (pass 3; lookcore.js 'socks': A.socks { h, stripes, warm }): stripes in the trim colour under the top's edge, a
    // darker row at the top (the cuff); leg warmers over leggings and trousers too, slouched in folds
    const SK = A.socks;
    if (SK) {
      const sc = cloth(SK.color), st = cloth(SK.trim);
      wrap('leg', (R, Q) => {
        const al = Q.part === 'th' ? Q.l0 * 0.5 : 0.5 + Q.l0 * 0.5, d = al - SK.h;
        if (SK.warm && d > 0 && al < 0.95 && R !== sc) { Q.k += Math.floor(al * 22) & 1 ? -0.14 : 0.05; return sc; }
        if (R !== sc || d < 0) return R;
        if (SK.warm) { Q.k += Math.floor(al * 22) & 1 ? -0.14 : 0.05; return R; }
        if (SK.stripes && d > 0.035 && d < 0.035 + SK.stripes * 0.075 && (SK.stripes < 2 || Math.abs(d - 0.11) > 0.02)) return st;
        if (d < 0.03) Q.k -= 0.12;
        return R;
      });
    }
    // small gear (pass 3; lookcore.js d.pp accessories, A.jewel): knee and elbow pads - a block on the front of the joint,
    // a lit pixel on its cap; a wallet chain - a silver loop from the belt down the right thigh; a tool belt - a leather
    // band at the waist, pouches at the hips, a tool's handle; a climbing harness - a waist band and two leg loops
    const J = A.jewel || {}, jc = J.color && cloth(J.color), jt = J.trim && cloth(J.trim), DK = cloth('#3a2a20');
    const pad = (Q, al) => { if (Math.abs(al - 0.52) < 0.13 && Q.l2 > -0.3) { Q.k += al < 0.5 ? 0.3 : 0; return 1; } return 0; };
    if (J.knee || J.wchain || J.harness || J.tbelt) wrap('leg', (R, Q) => {
      const al = Q.part === 'th' ? Q.l0 * 0.5 : 0.5 + Q.l0 * 0.5, side = Q.l1 * Q.side;
      if (J.knee && pad(Q, al)) return jc;
      if (J.harness && Math.abs(al - 0.13) < 0.045) return jc;
      if (J.tbelt && al < 0.15 && side > 0.2) { if (al < 0.07 && side > 0.55) { Q.gloss = 1; return jt; } return DK; }   // (the pouches, a tool's handle)
      if (J.wchain && Q.side > 0 && side > 0.25 && al > 0.03 && al < 0.3 && Math.abs(al - 0.3 + (side - 0.25) * 0.36) < 0.04) { Q.gloss = 1; Q.k += 0.25; return jc; }
      return R;
    });
    if (J.elbow) wrap('arm', (R, Q) => (pad(Q, Q.part === 'ua' ? Q.l0 * 0.5 : 0.5 + Q.l0 * 0.5) ? jc : R));
    if (J.tbelt || J.harness) {   // (the band: over an untucked hem on the torso's last rows, at the waist of a tucked shirt)
      const band = (Q) => { if (J.harness && Math.abs(Q.u) < 0.12 && Q.f > 0) { Q.gloss = 1; return jt; } return jc; };
      if (T.tuck) wrap('pel', (R, Q) => (Q.z > 0.9 ? band(Q) : R));
      else wrap('torso', (R, Q) => (Q.z > 0.2 && Q.z < 1.7 ? band(Q) : R));
      if (J.tbelt) wrap('pel', (R, Q) => (Math.abs(Q.u) > 0.3 && Q.z < (T.tuck ? 0.9 : 0.2) ? DK : R));
    }
    wrap('pel', (R, Q) => { if (bothDark && R === W.bot && Q.z > (T.tuck ? 1.4 : -1.9) && Q.z < (T.tuck ? 2.2 : -0.9)) Q.k += 0.3; return fix(R); });
  },
  // hair (CB3-M, CB3-F, CC2): the six shapes the concepts have that the list lacked, each on a style the renderer
  // already draws (people.js BASE_HAIR). Balding: the cap cut off above the temples - a ring of hair round a bare crown.
  hairCut: { balding: 0.42 },
  hair(ex, { E, at, nk, sw, lock, bumps, W, hr, HD, backY, GR, mmul, rx, ry }) {
    const M = W.hairM, e = (c, F, r, part) => E(at(c), F, r, GR.HAIR, part, M);
    if (ex === 'flattop') e([0, -0.02, 0.86], HD, [hr[0] * 0.92, hr[1] * 0.9, 4.2], 'top'), E(at([0, -0.02, 1.02]), HD, [hr[0] * 0.98, hr[1] * 0.96, 2.2], GR.HAIR, 'top', M, (a, b, c) => c < 0.55);   // (a block, its top cut level)
    else if (ex === 'pompadour') { e([0, 0.52, 1.0], mmul(HD, rx(-0.45)), [hr[0] * 0.8, 3.9, 3.7], 'quiff'); e([0, -0.1, 1.0], HD, [hr[0] * 0.72, 4.2, 2.0], 'quiff'); }   // (a roll standing over the forehead, swept back)
    else if (ex === 'puffs') for (const s of [-1, 1]) { const c = at([s * 0.78, -0.2, 0.9]); E(c, HD, [3.7, 3.6, 3.5], GR.HAIR, 'afro', M); bumps(c, [3.7, 3.6, 3.5], 7, 1.5, -0.2, 1.3, 2, 0.95); }   // (two round puffs high at the sides)
    else if (ex === 'lowpony') { const r0 = at([0, -0.96, -0.28]); E(r0, HD, [1.3, 1.1, 1.2], GR.HAIR, 'tie', () => cloth('#2a2226')); lock(r0, sw(nk(0, backY - 0.4, -3.4), 0.5), 2.1, 1.8, 'tail'); lock(sw(nk(0, backY - 0.4, -3.4), 0.5), sw(nk(0, backY - 0.7, -8.6), 1), 1.8, 0.7, 'tail'); }   // (tied at the nape, hanging down the back)
    else if (ex === 'emo') { e([0.36, 0.7, 0.42], mmul(HD, ry(0.62)), [hr[0] * 0.74, 2.5, 2.9], 'sweep'); e([-0.5, 0.5, 0.74], HD, [hr[0] * 0.5, 2.2, 1.6], 'sweep'); }   // (a long fringe swept across one eye)
  },
  // the arm over the body: a line on the body's pixels beside an arm in front of them, however close the two are (the
  // renderer's own lines want a clear step in depth: an arm hanging by a chest has none, and the two were one mass)
  post({ PID, NEAR, LN, NOO, CR, CG, CB, prims, w, h, GR, AX, AY, fig, A }) {
    if (this.hairLit && fig.W.hairR) hairLit(fig.W.hairR, A.hair && A.hair.style, PID, CR, CG, CB, prims, w, h, GR, Math.round(AX) & 1, Math.round(AY) & 1);
    const g = (i) => { const k = PID[i]; return k >= 0 && k < 32000 && !NOO[i] ? prims[k].g : 0; }, arm = (x) => x === GR.ARML || x === GR.ARMR;
    const hit = [];
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const i = y * w + x, gi = g(i);
      if (LN[i] || (gi !== GR.TORSO && gi !== GR.SKIRT && gi !== GR.LEGL && gi !== GR.LEGR)) continue;
      for (const j of [i - 1, i + 1]) if (arm(g(j)) && NEAR[j] > NEAR[i] + 0.2) { hit.push(i); break; }
    }
    for (const i of hit) { LN[i] = 1; CR[i] = CR[i] * 0.52 + 8; CG[i] = CG[i] * 0.48 + 6; CB[i] = CB[i] * 0.56 + 14; }
  },
};
// ---- pass 3 (docs/tasks/CHARACTERS3.md; gap 7): every hairstyle drawn as the concepts draw hair (CB3, CC2, C4) - a mass
// in clean tones on the art grid: a lit top (the crown's upper left, a highlight in it), the body of the hair, a dark
// underside and far edge (the figure's outline is beyond it). The renderer's own hair is a form lit pixel by pixel - at
// 8 art pixels a speckle; here each art pixel of hair takes its tone from where it sits in the mass. Only the hair's
// own tones are redrawn: shaved sides, a parting, ties, cuffs and the lines between locks stay as they are.
// Curls keep a broken tone, braids and locs their strands.
const HAIR_TEX = { afro: 1, curly: 1, curlylong: 1, bigcurls: 1, puffs: 1, dreads: 2, boxbraids: 2, braids: 2, braid: 2, cornrows: 2 };
function hairLit(R, style, PID, CR, CG, CB, prims, w, h, GR, ox, oy) {
  const bw = (w + ox + 1) >> 1, bh = (h + oy + 1) >> 1, H = new Uint8Array(bw * bh), F = new Uint8Array(bw * bh), T = new Uint8Array(w * h), tex = HAIR_TEX[style] | 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, k = PID[i], b = ((y + oy) >> 1) * bw + ((x + ox) >> 1);
    if (k < 0 || k >= 32000) continue;
    F[b]++;
    if (prims[k].g !== GR.HAIR) continue;
    for (const c of R) if (c[0] === CR[i] && c[1] === CG[i] && c[2] === CB[i]) { T[i] = 1; H[b]++; break; }
  }
  const hair = (x, y) => x >= 0 && y >= 0 && x < bw && y < bh && H[y * bw + x] >= 2, fig = (x, y) => x >= 0 && y >= 0 && x < bw && y < bh && F[y * bw + x] >= 2;
  const tone = new Int8Array(bw * bh).fill(-1), TN = [R[1], R[2], R[3], R[4], mix(R[4], [255, 244, 226], 0.28)];   // (underside, far side, body, lit, highlight)
  for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
    if (!hair(x, y)) continue;
    let d = 0; while (d < 9 && hair(x, y - d - 1)) d++;
    let xa = x, xb = x; while (hair(xa - 1, y)) xa--; while (hair(xb + 1, y)) xb++;
    const rel = (x - xa + 0.5) / (xb - xa + 1), wide = xb - xa + 1, under = !hair(x, y + 1), far = !hair(x + 1, y);
    let t = 2;
    if (under && (d > 0 || !fig(x, y + 1))) t = 0;                      // (the underside: tips, a fringe's lower row)
    else if (far && wide > 2 && !fig(x + 1, y)) t = 1;                  // (the side away from the light)
    else if (d <= (hair(x, y + 4) ? 2 : 1) && rel < 0.72) t = d === (hair(x, y + 2) ? 1 : 0) && wide > 3 && rel > 0.2 && rel < 0.55 ? 4 : 3;   // (the lit top, a highlight in it)
    if (tex === 1 && t > 0 && (x * 7 + y * 13) % 3 === 0) t--;          // (curls: a broken tone)
    if (t === 2 && (tex === 2 ? d > 1 && (x & 1) : !tex && d > 3 && x % 3 === 0)) t = 1;   // (braids and locs: strands; long hair: a strand's shadow now and then)
    tone[y * bw + x] = t;
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x; if (!T[i]) continue;
    const t = tone[((y + oy) >> 1) * bw + ((x + ox) >> 1)]; if (t < 0) continue;
    const c = TN[t]; CR[i] = c[0]; CG[i] = c[1]; CB[i] = c[2];
  }
}
// a dark ramp re-lit (kept per ramp; a re-lit ramp is its own)
const RELIT = new WeakMap(), DARK_L = [0.06, 0.11, 0.185, 0.3, 0.44];
const isDark = (R) => Array.isArray(R) && R.length === 5 && lum(R[3]) < 0.27;
function relit(R) {
  let N = RELIT.get(R);
  if (N) return N;
  if (!isDark(R)) N = R;
  else {
    // (the concepts' black is a warm charcoal with lighter folds, never flat; a dark colour - navy, forest, wine - keeps its hue)
    // each step lifted to the lightness the concepts give that step of a dark cloth (the shadows stay dark: the folds are
    // drawn between them and the lit steps), in the cloth's own hue - a neutral black a touch warm in the light
    const b = R[2], mx = Math.max(...b, 1), sat = mx - Math.min(...b), tint = sat < 14 ? [1.04, 0.97, 1.0] : b.map((v) => 0.55 + 0.6 * v / mx);
    N = R.map((c, i) => { const d = Math.max(0, DARK_L[i] - lum(c)) * 255; return c.map((v, j) => Math.min(255, Math.round(v + d * tint[j]))); });
  }
  RELIT.set(R, N); RELIT.set(N, N);
  return N;
}
