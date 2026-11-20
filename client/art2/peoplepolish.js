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
  // (11-20, the owner: "stay chunky" and "closer to the concepts" - the concepts shrunk to the game's 26 art pixels are a
  // big head under a big mass of hair, a wide deep body, thick arms, short legs: today's chunky measures, not pass 1's 3.1 heads)
  K: [1.38, 0.87, 0.96, 1.24, 1.1],
  hairVol: 2.6,       // the hair cap's thickness over the skull, times people.js's per-style volume (at 1 it's under an art pixel)
  // shading at the game's size (people.js): a light colour's shadow tones turn less toward red and go less dark (rampSoft:
  // 1 as today, 0 none of the turn), the ramp's darkest step is kept for lines (vMin), a part's shadow on another is
  // lighter (shK: today 0.32) and the dither between two tones fainter (dith: today 0.18) - a yellow shirt was five tones
  // from cream to dark red, which read as stains and as the arm beside it
  rampSoft: 0.4, vMin: 0.3, shK: 0.18, dith: 0.08,
  lnC: 120,           // no inner line between two parts whose colours already differ by this much (r + g + b): a bare arm on a white shirt needs none
  bareK: [0.95, 0.94, 0.86],   // a bare or sandalled foot against a shoe (today 0.8, 0.9, 0.75: at the game's size two points)
  // hair, the owner's notes of 11-20: locs and braids hang at the sides of the face too (from the front they were a bowl cut:
  // people.js's hairline, [forehead, temple, sideburn, above the ear, nape]); a one-pixel point on top of the hair is taken
  // off, bar the styles that are points
  hairLN: { dreads: [0.4, 0.36, -0.78, -0.78, -1.1], braids: [0.42, 0.36, -0.78, -0.78, -1.1], shavedside: [0.42, 0.4, 0.2, 0.1, -0.62] },   // (the shaved-side style keeps its hair down the back: from behind it was a bare head under a cap)
  tipKeep: ['spiky', 'mohawk', 'quiff', 'shag'],
  eye2: true,         // a face at an angle keeps its far eye (people.js face)
  lnHead: 0.24,       // the line a fringe or a hat draws on the face: this much lighter (people.js: a shadow, not a headband)
  // the outline, on the art grid (people.js): [lit side: how much of the colour it borders, its brightest; the same in the shade]
  // (the owner, 11-20: the concepts' soft outline in the colour of what it outlines, "slightly darker" so the people sit with
  // the world's benches and lamps - and never bright enough to read as more skin: in the game a paler one made blobs of heads and hands)
  ol: [0.3, 95, 0.18, 60],
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
    D.foot[2] *= 1.45;   // (shoes the same size, a little taller: from the side and from behind one was a single white line)
    // a muscular build's arms and shoulders: half the boost - on the chunky build's thick limbs the far shoulder at an angle
    // stood beside the face as big as the face
    // (...and a build's limbs: its thick or thin kept at a little over half - on limbs already 1.24 as thick, an athletic or a
    // big build's arm was half as wide again as an average one's)
    { const l0 = b.limb || 1, k = (1 + (l0 - 1) * 0.55) / l0; for (const key of ['armR', 'foreR', 'thighR', 'shinR']) D[key] = D[key].map((v) => v * k); D.fist *= k; }
    if (mu) { const k = (1 + mu * 0.1) / (1 + mu * 0.2), k2 = (1 + mu * 0.06) / (1 + mu * 0.12), k3 = (1 + mu * 0.05) / (1 + mu * 0.1); D.armR = [D.armR[0] * k, D.armR[1] * k2]; D.foreR[0] *= (1 + mu * 0.08) / (1 + mu * 0.15); D.shX *= k3; D.chestR[0] *= k3; }
    // a body with depth (the concepts' side views are a barrel, not a plank), and a big build's belly out in front
    D.chestR[1] *= 1.1; D.waistR[1] *= 1.1; D.pelR[1] *= 1.08;
    if (b.belly >= 1.2) { D.waistR[0] *= 1.12; D.waistR[1] *= 1.12; D.chestR[0] *= 1.06; D.shX *= 1.05; }
    D.pelZ = D.ank + (D.shin + D.thigh) * 0.985 + 1.0;
  },
  // the nose: a shadow on the side away from the light (the light's from the left), on the row under the eyes
  nose(cx, n) {
    const { put, e0, skin, F } = cx, k = F.nose | 0, q = { bx: n.bx, by: e0.by + 2 };
    const sh = mix(skin[2], skin[1], 0.45), soft = mix(skin[3], skin[2], 0.7);
    if (cx.turn > 0.2 && cx.turn < 0.9) return void (k >= 3 && put(q, soft));   // (at an angle a nose's shadow lands on the far cheek's edge: a blotch - only the big noses keep a soft pixel)
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
  // a selfie (pass 3, gap 13; CC6): people.js restHold's 'phoneup' hands a point in the chest's frame (x right, y forward,
  // z up). One arm out and up with the phone turned back at the face, the other hand at the hip, the chin up toward it -
  // the silhouette that differs from texting (both hands at the chest) and a call (a hand at the ear)
  selfie(P, at) {
    P.hR = at(9.6, 5.0, 15.5); P.elR = [1, 0.1, -0.2]; P.hL = at(-5.4, 1.4, -6.2); P.elL = [-1, -0.6, 0];
    P.headYaw += 0.38; P.headPitch -= 0.2; P.item.axis = [0.35, -0.5, 0.79]; P.item.two = false;
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
    // underwear (lookcore.js 'under': A.under, on the halves no clothes cover) - pass 4, under4 below: the body under it
    // is handed to the renderer as skin and every pixel's place on the body kept; post() cuts the piece on the art grid
    // (no piece picked: the plain basics every look has - lookcore.js lookArt: boxers, a bra and panties - cut the same way)
    const basic = (h) => !!h && !h.under && h.trim === undefined && h.color === '#e8e4dc', U = A.under || ((basic(A.top) || basic(A.bottom)) && { color: '#e8e4dc', trim: '#c8ccd4', band: 1 });   // (pass 5, the owner: the basics are boxers for a man, a bra and panties for a woman)
    const cells = U && !T.dress && !T.long, ub = cells && A.bottom && (A.bottom.under || basic(A.bottom)) && W.bk !== 'none', ut = cells && A.top && (A.top.under || basic(A.top));
    const bt = !ub ? 0 : T.swimsuit ? 'body' : W.bk === 'bikini' ? 'brief' : W.bk === 'trunks' ? (U.fit ? 'trunk' : 'boxer') : 0;
    const tt = !ut ? 0 : T.swimsuit ? 'body' : T.bikini ? (W.tk === 'bikini' ? 'bandeau' : U.sport ? (U.lace ? 'bralette' : 'sport') : 'bra') : W.tk === 'tank' ? 'tank' : W.tk === 'under' ? 'tee' : 0;
    if (bt || tt) {
      const S = W.u4 = { rec: [], U, bt, tt, cu: D.chestUp, su: D.shUp, fem: D.fem, SK: W.skin, RC: pale4(far4(cloth(U.color), W.skin)), RT: pale4(relit(cloth(U.trim))) };
      const hemZ = T.tuck ? 3.3 : T.bare || T.bikini || T.towel || T.crop ? 9 : T.tank ? 0.4 : -0.9, mine = new Set([W.top, relit(W.top)]), ours = new Set([W.bot, relit(W.bot)]);
      const body = (R, Q) => {
        const low = Q.part === 'pel' && Q.z <= hemZ;
        if (low ? !bt || (R !== W.skin && !ours.has(R)) : R !== W.skin && !(tt && mine.has(R))) return R;
        if (Q.res !== 1) { const g = cut4(S, { n: 1, bust: Q.part === 'bust' ? 1 : 0, u: Q.u, z: Q.z, f: Q.f, u0: Q.u - 0.06, u1: Q.u + 0.06, z0: Q.z - 0.5, z1: Q.z + 0.5 }, null); return g ? (g === 2 && tt === 'tee' ? S.RT : S.RC) : W.skin; }   // (close up: cut pixel by pixel)
        S.rec.push(Q.x, Q.y, Q.part === 'bust' ? 1 : 0, Q.u, Q.z, Q.f);
        return W.skin;
      };
      wrap('torso', body); wrap('pel', body);
      if (bt) wrap('leg', (R, Q) => {
        if (Q.part !== 'th' || (R !== W.skin && !ours.has(R))) return R;
        const al = Q.l0 * 0.5, sd = Q.l1 * Q.side;
        if (Q.res !== 1) return cut4(S, null, { al, sd }) ? (tt === 'tee' ? S.RT : S.RC) : W.skin;
        S.rec.push(Q.x, Q.y, 2, al, sd, Q.l2);
        return W.skin;
      });
    }
    // (the pieces the renderer has a shape for - a union suit, plain: no buttons; a slip, as pass 3 drew it: its own cloth and a sheen - the owner, pass 5)
    if (U && U.gloss && T.dress && A.top && A.top.under) for (const k of ['torso', 'skirt']) wrap(k, (R, Q) => { if (R === W.top) Q.gloss = 0.7; return R; });
    // (a pale one of the others - an undershirt's sleeves, a union suit - shaded cool like the rest: pale4)
    if (U && A.top && A.top.under && (W.tk === 'under' || W.tk === 'longsleeve')) { const t0 = relit(W.top), t1 = pale4(t0); for (const k of ['torso', 'arm', 'pel', 'leg']) wrap(k, (R) => (R !== t0 && R !== W.top ? R : t1)); }
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
    // body options (pass 3; lookcore.js body.marks, body.limb -> A.bmarks, A.limb): freckles on the body - darker specks
    // on the shoulders, arms, chest and back; vitiligo - pale patches, on the face and hands too; a prosthetic arm or leg
    // - dark metal in place of the skin (under a sleeve or trousers it doesn't show), its joint and its hand lit. The
    // patches sit in each part's own space, so they stay put as it moves.
    const BM = A.bmarks | 0, LG = [0, 5, 6, 7, 8][A.limb | 0];   // (the renderer's part groups: GR.ARML, ARMR, LEGL, LEGR)
    if (BM || LG) {
      const SK0 = W.skin, PALE = SK0.map((c) => mix(c, [250, 230, 222], 0.66)), FRK = SK0.map((c) => mix(c, [146, 80, 56], 0.34)), METAL = cloth('#4c525c');
      const cell = (Q, n) => { let v = (Math.floor((Q.l0 + 2) * n) * 374761393 + Math.floor((Q.l1 + 2) * n) * 668265263 + Math.floor((Q.l2 + 2) * n) * 362437 + Q.part.charCodeAt(0) * 9176 + (Q.g | 0) * 131) | 0; v = Math.imul(v ^ (v >>> 13), 1274126177); return ((v ^ (v >>> 16)) >>> 0) / 4294967296; };
      for (const k of ['torso', 'arm', 'leg', 'pel', 'hand', 'head', 'skinM', 'shoe']) wrap(k, (R, Q) => {
        if (R !== SK0) return R;
        if (LG && Q.g === LG && k !== 'torso' && k !== 'pel' && k !== 'head') { const j = Q.part === 'fa' || Q.part === 'sh' ? Q.l0 < 0.14 : k === 'hand' || k === 'shoe'; Q.gloss = 1; Q.k += j ? 0.3 : (Math.floor(Q.l0 * 5) & 1) * -0.08; return METAL; }
        if ((BM & 2) && k !== 'shoe' && cell(Q, k === 'head' || k === 'hand' ? 2.2 : 1.4) < 0.3) return PALE;
        if ((BM & 1) && k !== 'head' && k !== 'hand' && k !== 'pel' && k !== 'shoe' && Q.part !== 'sh' && cell(Q, 4.6) < 0.2) return FRK;
        return R;
      });
    }
    // drapes (pass 3; lookcore.js d.dr -> A.drape), each on a shape the renderer has: a hooded cloak - closed down the
    // front, a clasp at the throat; a cape-coat - the cape's hem across the chest and the upper arms, the sleeves in its
    // shade under it; a sari - the pallu over one shoulder and a border at the hem in the trim colour, the waist bare at
    // the side; a ghillie suit - three greens in tufts all over, hood and all; morning dress - the coat cut away in front
    // over striped grey trousers, its tails behind, a pale waistcoat
    const DR = A.drape, SKN = W.skin, t2 = W.top2;
    if (DR === 'cloak') wrap('torso', (R, Q) => (R === SKN ? R : Q.f > 0 && Math.abs(Q.u) < 0.13 && Math.abs(Q.z - D.shUp + 1.5) < 0.8 ? (Q.gloss = 1, t2) : W.top));
    if (DR === 'cape') {
      wrap('torso', (R, Q) => { if (R === W.top && Math.abs(Q.z - D.chestUp + 1.2) < 0.55) Q.k -= 0.3; else if (R === W.top && Q.z < D.chestUp - 1.2) Q.k -= 0.1; return R; });
      wrap('arm', (R, Q) => { const al = Q.part === 'ua' ? Q.l0 * 0.5 : 0.5 + Q.l0 * 0.5; if (R === W.top) Q.k -= al > 0.56 ? 0.16 : al > 0.44 ? 0.34 : -0.06; return R; });
    }
    if (DR === 'sari') {
      wrap('torso', (R, Q) => {
        if (R === SKN) return R;
        const v = (Q.z - D.waistUp) / (D.shUp - D.waistUp), band = v - Q.u * 0.62;
        if (band > 0.42 && band < 0.74 && v < 1.02) { if (band > 0.66) { Q.gloss = 1; return t2; } Q.k += 0.1; return R; }
        return v > 0.02 && v < 0.2 && Q.u > 0.18 ? SKN : R;
      });
      wrap('skirt', (R, Q) => (Q.l0 > 0.86 ? (Q.gloss = 1, t2) : R));
    }
    if (DR === 'ghillie') {
      const GH = [cloth('#3c4a26'), cloth('#6b6a3a'), cloth('#26301c')];
      for (const k of ['torso', 'arm', 'leg', 'pel', 'hood', 'hat', 'brim']) wrap(k, (R, Q) => {
        if (R === SKN) return R;
        let v = (Math.floor((Q.l0 + 2) * 3.1) * 374761393 + Math.floor((Q.l1 + 2) * 2.3) * 668265263 + Math.floor((Q.l2 + 2) * 2.3) * 362437 + Q.part.charCodeAt(0) * 9176) | 0; v = Math.imul(v ^ (v >>> 13), 1274126177); v = ((v ^ (v >>> 16)) >>> 0) / 4294967296;
        Q.k += v > 0.5 ? 0.1 : -0.12;
        return v < 0.3 ? GH[0] : v < 0.5 ? GH[1] : v > 0.86 ? GH[2] : R;
      });
    }
    if (DR === 'tails') {
      const GREY = cloth('#8a8a92'), stripe = (Q) => { if (Math.floor((Q.l1 + 2) * 5) & 1) Q.k -= 0.16; return GREY; };
      wrap('skirt', (R, Q) => (Q.l2 > -0.05 ? stripe(Q) : R));
      wrap('leg', (R, Q) => (R === SKN ? R : stripe(Q)));
      wrap('pel', (R, Q) => (Q.f > 0 ? stripe(Q) : R));
      wrap('torso', (R, Q) => (R !== SKN && Q.f > 0.05 && Math.abs(Q.u) < 0.34 && Q.z < D.chestUp + 0.6 && Q.z > D.waistUp - 1.2 ? t2 : R));
    }
    // props carried (pass 3, gap 20; lookcore.js d.prop -> A.prop [what, its trim colour]), each the thing the renderer
    // puts in the hand, redrawn: a camera - a dark body, a silver top, the lens' glint (the small bag's block); a bouquet
    // - green stems under a head of flowers, specks of the trim colour (the cup's cone); a parasol - carried closed: the
    // cloth furled in a spiral of its two colours, a pale handle (the cane)
    const PR = A.prop;
    if (PR) {
      const pc = cloth(A.bagColor), pt = cloth(PR[1]), GREEN = cloth('#3f7a34'), spk = (Q, n) => ((Math.floor((Q.l0 + 2) * n) + Math.floor((Q.l1 + 2) * n) * 3 + Math.floor((Q.l2 + 2) * n) * 5) % 3 === 0);
      if (PR[0] === 'camera') wrap('leather', (R, Q) => { if (Q.l2 > 0.55) { Q.gloss = 1; return pt; } if (Math.abs(Q.l0) < 0.5 && Math.abs(Q.l2) < 0.5) { Q.gloss = 1; Q.k += 0.3; return cloth('#7fa6c4'); } Q.gloss = 0; return pc; });
      if (PR[0] === 'bouquet') wrap('cup', (R, Q) => (Q.l0 < 0.42 ? GREEN : spk(Q, 3) ? pt : (Q.k += 0.08, pc)));
      if (PR[0] === 'parasol') wrap('wood', (R, Q) => (Q.l0 < 0.1 ? cloth('#d8c8a8') : Q.l0 > 0.96 ? cloth('#2a2226') : Math.floor(Q.l0 * 9 + Q.l1 * 1.5 + 2) & 1 ? pt : pc));
    }
    wrap('pel', (R, Q) => { if (bothDark && R === W.bot && Q.z > (T.tuck ? 1.4 : -1.9) && Q.z < (T.tuck ? 2.2 : -0.9)) Q.k += 0.3; return fix(R); });
  },
  // hair (CB3-M, CB3-F, CC2): the six shapes the concepts have that the list lacked, each on a style the renderer
  // already draws (people.js BASE_HAIR). Balding: the cap cut off above the temples - a ring of hair round a bare crown.
  hairCut: { balding: 0.42 },
  hair(ex, { E, at, nk, sw, lock, bumps, W, hr, HD, backY, GR, mmul, rx, ry }) {
    const M = W.hairM, e = (c, F, r, part) => E(at(c), F, r, GR.HAIR, part, M);
    // (11-20, the owner: from the front long hair was a short cut - it all hangs behind the head and shoulders. A lock from
    // each temple falls forward over the shoulder, to the collarbone or, for the longest, the chest)
    // (an undercut's shaved sides and back, and the shaved-side style's: stubble - the skin with the hair's colour in it - where
    // the hair would grow. Bare skin there was a bald head under a lid, and from behind a second face)
    if ((ex === 'undercut' || ex === 'shavedside') && W.hairR) {
      const SR = W.skin.map((c, i) => mix(c, W.hairR[Math.min(4, i + 1)], 0.6));
      E(at([0, -0.04, 0.02]), HD, [hr[0] + 0.5, hr[1] + 0.55, hr[2] + 0.4], GR.HAIR, 'stubble', () => SR, (a, b, c) => c > (b > 0.3 ? 0.42 : b > -0.2 ? 0.42 - (0.3 - b) * 1.24 : -0.2 + (b + 0.2) * 0.5));
    }
    if (FRONT[ex]) for (const s of [-1, 1]) { const a = at([s * 0.96, 0.18, -0.12]), b = sw(nk(s * (hr[0] * 0.86), 1.5, FRONT[ex][0]), 0.35); lock(a, b, FRONT[ex][1], FRONT[ex][2], 'front'); }
    if (ex === 'flattop') e([0, -0.02, 0.86], HD, [hr[0] * 0.92, hr[1] * 0.9, 4.2], 'top'), E(at([0, -0.02, 1.02]), HD, [hr[0] * 0.98, hr[1] * 0.96, 2.2], GR.HAIR, 'top', M, (a, b, c) => c < 0.55);   // (a block, its top cut level)
    else if (ex === 'pompadour') { e([0, 0.5, 1.02], mmul(HD, rx(-0.45)), [hr[0] * 0.62, 3.9, 3.9], 'quiff'); e([0, -0.1, 0.98], HD, [hr[0] * 0.6, 4.2, 1.8], 'quiff'); }   // (11-20: narrower than the head - from the front it was a box)   // (a roll standing over the forehead, swept back)
    else if (ex === 'puffs') for (const s of [-1, 1]) { const c = at([s * 0.78, -0.2, 0.9]); E(c, HD, [3.7, 3.6, 3.5], GR.HAIR, 'afro', M); bumps(c, [3.7, 3.6, 3.5], 7, 1.5, -0.2, 1.3, 2, 0.95); }   // (two round puffs high at the sides)
    else if (ex === 'lowpony') { const r0 = at([0, -0.96, -0.28]); E(r0, HD, [1.3, 1.1, 1.2], GR.HAIR, 'tie', () => cloth('#2a2226')); const m1 = sw(nk(0.5, backY - 1.3, -2.6), 0.5), m2 = sw(nk(0.9, backY - 1.5, -5.6), 0.8); lock(r0, m1, 1.7, 2.9, 'tail'); lock(m1, m2, 2.9, 2.2, 'tail'); lock(m2, sw(nk(0.3, backY - 1.0, -8.8), 1), 2.2, 0.6, 'tail'); }   // (11-20: full under the tie, a slight curve, a point - it was a straight bar)   // (tied at the nape, hanging down the back)
    else if (ex === 'shavedside') { lock(at([-0.25, 0.2, 1.06]), at([1.16, 0.22, -0.15]), 3.5, 2.9, 'sweep'); lock(at([1.0, 0.1, 0.1]), sw(nk(hr[0] + 1.2, 0.5, -3.6), 0.4), 2.9, 1.8, 'sweep'); }   // (11-20: the long side is long - swept over and down past the jaw; it was a few thin locks)
    else if (ex === 'emo') { e([0.36, 0.7, 0.42], mmul(HD, ry(0.62)), [hr[0] * 0.74, 2.5, 2.9], 'sweep'); e([-0.5, 0.5, 0.74], HD, [hr[0] * 0.5, 2.2, 1.6], 'sweep'); }   // (a long fringe swept across one eye)
  },
  // ---- pass 5 (docs/tasks/CHARACTERS5.md; the owner's shot, docs/characters/owner-hair-1119.png): the tied and the tall
  // styles in shapes that read from every side (CB3-F, CB3-M, CC2-A). The camera looks down, so anything behind the
  // crown shows above it: a bun was a point on a point (a cone), a ponytail's rising tail a spike. Here a knot is a
  // ball wider than the crown under it, on a dark tie - a step in the outline; a tail leaves the back of the head and
  // hangs; twin buns and puffs are balls apart at the top corners; pigtails stand out from the sides; a mohawk is a
  // crest two art pixels wide. Returns true when it drew the style (people.js hairPrims then leaves its own shape out).
  hairRe(ex, { E, C, at, nk, sw, lock, W, hr, HD, backY, GR, hatOn }) {
    const M = W.hairM, ball = (c, r) => E(at(c), HD, r, GR.HAIR, 'bun', M), tie = (c, r, col = '#2a2226') => E(at(c), HD, r, GR.HAIR, 'tie', () => cloth(col));
    if (ex === 'pony') {   // (tied at the back of the crown; the tail out a little, then down the back of the neck)
      // (11-20: out behind the head first - a tail you can tell from long hair from the side - then down, well clear of the neck)
      const r0 = at([0, -1.05, 0.22]), m = sw(at([0, -1.8, -0.08]), 0.25), e = sw(nk(1.6, backY - 3.4, hatOn ? -4.4 : -5.0), 1);
      E(r0, HD, [1.9, 1.7, 1.8], GR.HAIR, 'tie', () => cloth('#c8302c')); lock(r0, m, 2.7, 3.3, 'tail'); lock(m, e, 3.3, 1.5, 'tail');
      return true;
    }
    if (hatOn) return false;
    if (ex === 'bun') { tie([0, -0.3, 1.26], [2.0, 1.9, 1.5], '#3a2a30'); ball([0, -0.34, 1.78], [4.4, 4.2, 3.3]); return true; }   // (11-20: up out of the thicker hair - the tie a dark band between the knot and the head, or the three were one cone)
    if (ex === 'topknot') { tie([0, -0.02, 1.22], [1.9, 1.8, 1.3]); ball([0, -0.04, 1.7], [3.7, 3.5, 2.8]); return true; }
    if (ex === 'manbun') { tie([0, -0.9, 0.2], [1.9, 1.4, 1.8]); ball([0, -1.22, 0.16], [3.4, 3.0, 3.3]); return true; }
    if (ex === 'twinbuns') { for (const s of [-1, 1]) { tie([s * 0.92, -0.04, 1.06], [1.8, 1.7, 1.4]); ball([s * 1.12, -0.04, 1.46], [4.2, 4.0, 3.7]); } return true; }   // (11-20: up and out of the thicker hair, on ties - two balls from behind too)
    if (ex === 'puffs') { for (const s of [-1, 1]) E(at([s * 1.16, -0.04, 1.42]), HD, [4.8, 4.6, 4.4], GR.HAIR, 'afro', M); return true; }   // (level with the crown's middle: the same two balls from the front and from behind)
    if (ex === 'halfup') { tie([0, -0.3, 1.3], [2.0, 1.9, 1.5]); ball([0, -0.34, 1.9], [5.1, 4.7, 3.4]); return true; }   // (CB3-F: a knot on the crown over long hair)
    if (ex === 'pigtails') {
      // (11-20: thicker, further out and longer - two tails you can count from the front and from behind)
      for (const s of [-1, 1]) { const r0 = at([s * 1.0, -0.36, 0.18]), m = sw(at([s * 1.58, -0.4, -0.08]), 0.4), e = sw(nk(s * (hr[0] + 3.0), -1.4, -5.2), 1); tie([s * 1.04, -0.36, 0.18], [1.6, 1.5, 1.6], '#c8302c'); lock(r0, m, 2.3, 2.7, 'tail'); lock(m, e, 2.7, 1.2, 'tail'); }
      return true;
    }
    if (ex === 'mohawk') {   // (a crest from the forehead over the crown to the nape, highest over the crown)
      for (let i = 0; i < 6; i++) { const t = i / 5, a = 0.85 - t * 2.2, k = 1.28 + 0.34 * Math.sin(Math.PI * Math.min(1, t * 1.2)); C(at([0, Math.sin(a) * 0.7, Math.cos(a) * 0.7]), at([0, Math.sin(a) * k, Math.cos(a) * k]), 2.5, 1.5, GR.HAIR, 'spike', M); }
      return true;
    }
    return false;
  },
  // the arm over the body: a line on the body's pixels beside an arm in front of them, however close the two are (the
  // renderer's own lines want a clear step in depth: an arm hanging by a chest has none, and the two were one mass)
  post({ PID, NEAR, LN, NOO, CR, CG, CB, prims, w, h, GR, AX, AY, fig, A }) {
    const gx = Math.round(AX) & 1, gy = Math.round(AY) & 1;   // (where the art grid falls: the bake pairs world pixels from the anchor)
    if (this.hairLit && fig.W.hairR) hairLit(fig.W.hairR, A.hair && A.hair.style, PID, CR, CG, CB, prims, w, h, GR, gx, gy);
    if (fig.W.u4) under4(fig.W.u4, LN, CR, CG, CB, w, AX, AY, gx, gy);
    const g = (i) => { const k = PID[i]; return k >= 0 && k < 32000 && !NOO[i] ? prims[k].g : 0; }, arm = (x) => x === GR.ARML || x === GR.ARMR;
    const hit = [];
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const i = y * w + x, gi = g(i);
      if (LN[i] || (gi !== GR.TORSO && gi !== GR.SKIRT && gi !== GR.LEGL && gi !== GR.LEGR)) continue;
      for (const j of [i - 1, i + 1]) if (arm(g(j)) && NEAR[j] > NEAR[i] + 0.2 && !(this.lnC && Math.abs(CR[i] - CR[j]) + Math.abs(CG[i] - CG[j]) + Math.abs(CB[i] - CB[j]) > this.lnC)) { hit.push(i); break; }   // (lnC: not where the colours part them already)
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
const FRONT = { long: [-4.6, 2.5, 1.7], wavy: [-4.8, 2.7, 1.9], curlylong: [-4.8, 2.9, 2.2], bigcurls: [-4.4, 3.0, 2.3], halfup: [-4.4, 2.4, 1.7], shoulder: [-2.4, 2.4, 1.8], dreads: [-4.2, 2.5, 1.9], boxbraids: [-4.6, 2.4, 1.8], braids: [-4.6, 2.4, 1.8], shag: [-1.8, 2.2, 1.6], braid: [-1.6, 2.0, 1.5] };   // (how far down the neck's frame a front lock ends, its width at the temple and at its tip)
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
  const pale = lum(R[4]) > 0.6;
  const tone = new Int8Array(bw * bh).fill(-1), TN = [R[1], R[2], R[3], pale ? mix(R[3], R[4], 0.55) : R[4], mix(R[4], [255, 244, 226], 0.28)], hsh = (x, y) => { const v = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453; return v - Math.floor(v); };   // (underside, far side, body, lit, highlight)
  for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
    if (!hair(x, y)) continue;
    let d = 0; while (d < 9 && hair(x, y - d - 1)) d++;
    let xa = x, xb = x; while (hair(xa - 1, y)) xa--; while (hair(xb + 1, y)) xb++;
    const rel = (x - xa + 0.5) / (xb - xa + 1), wide = xb - xa + 1, under = !hair(x, y + 1), far = !hair(x + 1, y);
    let t = 2;
    if (under && (d > 0 || !fig(x, y + 1))) t = 0;                      // (the underside: tips, a fringe's lower row)
    else if (far && wide > 2 && !fig(x + 1, y)) t = 1;                  // (the side away from the light)
    else if (d <= (hair(x, y + 4) ? 1 : 0) && rel > 0.1 && rel < 0.64) t = d === (hair(x, y + 2) ? 1 : 0) && wide > 3 && rel > 0.2 && rel < 0.55 ? 4 : 3;   // (the lit top, a highlight in it - 11-20: a band along the top, not the top third: on ginger hair that was a bald spot)
    if (tex === 1 && t > 1 && (hsh(x, y) > 0.84 || hsh(x - 1, y) > 0.9)) t--;   // (curls: a few short clumps of a darker tone, scattered - the owner 11-20: neither diagonal stripes nor a grid of dots)
    if (t === 2 && tex === 2 && d > 1 && (x & 1)) t = 1;   // (braids and locs: strands; long straight hair is one clean mass - its strand shadows were stripes)
    if (t === 4 && pale) t = 3;                            // (fair and ginger hair: no highlight - a tone lighter still is skin, a bald spot)
    tone[y * bw + x] = t;
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x; if (!T[i]) continue;
    const t = tone[((y + oy) >> 1) * bw + ((x + ox) >> 1)]; if (t < 0) continue;
    const c = TN[t]; CR[i] = c[0]; CG[i] = c[1]; CB[i] = c[2];
  }
}
// ---- pass 4 (docs/tasks/CHARACTERS4.md): underwear cut on the art grid (SF23-A..G, SM23). The renderer's own underwear
// is a colour by where a world pixel sits on the body - at the game's size its edges fall between art pixels and blend
// with the skin, and the waist's own shape hides briefs from the front. Here every art pixel of the bare body is one
// thing: skin, the piece, its band or a strap. cut4 says which, by the art pixel's place on the body - c: the torso and
// the pelvis (u across in chest half-widths, z up from the hips, f forward; u0..u1, z0..z1 what the art pixel spans, so
// a strap or a band is the one art pixel its line runs through), l: a thigh (al 0 the hip .. 0.5 the knee - the first
// quarter is inside the hips - sd -1 the inside .. 1 the outside). 0 skin, 1 the top half, 2 the bottom half, 3 a
// strap, 4 between a bra's cups.
function cut4(S, c, l) {
  const { tt, bt, cu, su, fem } = S;
  if (!c) {
    if (bt === 'trunk') return l.al < 0.33 ? 2 : 0;
    if (bt === 'boxer') return l.al < 0.41 ? 2 : 0;
    if (bt === 'brief' && fem) return l.sd < 0.2 && l.al < 0.16 + 0.1 * (0.2 - l.sd) ? 2 : 0;   // (pass 5: a woman's briefs smaller)
    return bt && l.al < (bt === 'body' ? 0.21 + 0.06 * Math.max(0, Math.min(1.4, 0.5 - l.sd)) : 0.24 + 0.09 * Math.max(0, Math.min(1.4, 0.5 - l.sd))) ? 2 : 0;   // (the leg line: from the hip down to the inside of the thigh)
  }
  const u = c.u, au = Math.abs(u), z = c.z, front = c.f > 0, has = (a) => (c.u0 <= a && a <= c.u1) || (c.u0 <= -a && -a <= c.u1), row = (v) => c.z0 <= v && v <= c.z1;
  const high = (k) => au > k + (front ? 0 : 0.14) + (z + 2.6) * 0.16;   // (cut high at the leg, fuller behind)
  if (tt === 'body' || bt === 'body') {   // a bodysuit, a teddy: a V at the neck, a low back, thin straps, the leg cut high
    if (z < 1.5) return bt && !high(0.3) ? 2 : 0;
    if (!tt) return 0;
    const neck = front ? cu + 3.4 - Math.max(0, 0.32 - au) * 5 : cu + 0.8;
    if (z < neck && !(au > 0.56 && z > cu + 1.6)) return 1;
    return has(0.36) && z < su + 0.6 ? 3 : 0;
  }
  if (tt === 'bra') {   // two cups apart, a band under them and round the back, a strap over each shoulder
    if (z > cu - 1.6 && z < cu + 2.8 && (front ? au < 0.68 && !(au < 0.1 && z > cu + 1.4) : z < cu + 0.4)) return front && au < 0.1 && z > cu - 0.4 ? 4 : 1;   // (4: between the cups - a lace set's bow)
    if (has(0.36) && z > cu && z < su + 0.6) return 3;
  } else if (tt === 'sport') {   // a wide band to under the bust, a scooped neck, broad straps
    if (z > cu - 2.2 && z < su + 0.8 && !(au > 0.52 && z > cu + 1.4) && !(front ? au < 0.2 && z > cu + 3.6 : au < 0.16 && z > cu + 3.8)) return 1;
  } else if (tt === 'bralette') {   // triangle cups on a longer band, thin straps
    if (z > cu - 2.4 && z < (front ? cu + 3.4 - Math.abs(au - 0.34) * 8 : cu - 0.4)) return 1;
    if (has(0.34) && z > cu - 0.4 && z < su + 0.6) return 3;
  } else if (tt === 'bandeau') {   // strapless: a band round the chest
    if (z > cu - 1.4 && z < cu + 2.6) return 1;
  } else if (tt === 'tank') {   // a ribbed tank: cut in at the arms, a scooped neck, its hem on the hips
    if (z > 1.2 && !(au > 0.5 && z > cu + 0.8) && !(front ? au < 0.22 && z > cu + 3.2 - (0.22 - au) * 4 : au < 0.18 && z > su - 1)) return 1;
  } else if (tt === 'tee') {
    if (z > -0.8 && !(front && au < 0.2 && z > su - 1.2)) return 1;
  }
  if (bt === 'brief') return fem ? (z - 3 * Math.max(0, c.f) < (front ? 0.9 : 2.0) && au < 0.24 + (front ? 0 : 0.12) + (z + 2.6) * 0.2 ? 2 : 0) : z < 3.4 && !high(0.52) ? 2 : 0;   // (pass 5, the owner: a woman's briefs and panties pass 3's smaller cut - a level waist (the belly stands forward of the hips: the line follows it), a triangle to the leg)
  return bt && z < (fem ? 3.0 : 3.4) ? 2 : 0;
}
function under4(S, LN, CR, CG, CB, w, AX, AY, ox, oy) {
  const { rec, U, SK, RC, RT, tt } = S, cells = new Map(), K = 4096;
  for (let n = 0; n < rec.length; n += 6) {
    const x = Math.round(rec[n] + AX), y = Math.round(rec[n + 1] + AY), key = ((y + oy) >> 1) * K + ((x + ox) >> 1), k = rec[n + 2], a = rec[n + 3], b = rec[n + 4];
    let c = cells.get(key);
    if (!c) cells.set(key, c = { px: [], n: 0, bust: 0, u: 0, z: 0, f: 0, u0: 9, u1: -9, z0: 99, z1: -99, ln: 0, al: 0, sd: 0, g: 0, i: 2 });
    c.px.push(y * w + x);
    if (k === 2) { c.ln++; c.al += a; c.sd += b; }
    else { c.n++; c.bust += k; c.u += a; c.z += b; c.f += rec[n + 5]; c.u0 = Math.min(c.u0, a); c.u1 = Math.max(c.u1, a); c.z0 = Math.min(c.z0, b); c.z1 = Math.max(c.z1, b); }
  }
  for (const c of cells.values()) {
    c.leg = c.ln > c.n;
    if (c.leg) { c.al /= c.ln; c.sd /= c.ln; c.g = cut4(S, null, c); }
    else { c.u /= c.n; c.z /= c.n; c.f /= c.n; c.g = cut4(S, c, null); }
    // its tone: the body's own light on that art pixel (the skin's step there), on the cloth's ramp
    let i = 0, m = 0;
    for (const p of c.px) for (let q = 0; q < 5; q++) if (SK[q][0] === CR[p] && SK[q][1] === CG[p] && SK[q][2] === CB[p]) { i += q; m++; break; }
    if (m) c.i = Math.round(i / m);
  }
  // (a waist is level at this size: the bottom half runs on across an art pixel that has it on both sides)
  for (const [key, c] of cells) if (!c.g && !c.leg) { const a = cells.get(key - 1), b = cells.get(key + 1); if (a && b && a.g === 2 && b.g === 2) c.fill = 1; }
  for (const c of cells.values()) if (c.fill) c.g = 2;
  const G = (key) => { const c = cells.get(key); return c ? c.g : -1; }, tee = tt === 'tee', RB = tee ? RT : RC, RBAND = tee ? RC : RT, tones = new Map();
  // (clean tones: an art pixel between two of the piece's in one tone takes it - no speckle from the body's dither)
  for (const [key, c] of cells) { const a = cells.get(key - 1), b = cells.get(key + 1); tones.set(key, c.g && a && b && a.g && b.g && a.i === b.i ? a.i : c.i); }
  for (const [key, c] of cells) {
    if (!c.g) continue;
    const up = G(key - K), dn = G(key + K), i = tones.get(key), edge = !up || !dn || !G(key - 1) || !G(key + 1);
    let R = c.g === 2 ? RB : RC, j = i;
    if (c.g === 2 && !c.leg && U.band && up !== 2 && (up !== 1 || tee || tt === 'tank')) R = RBAND;                    // (the waistband: the top art pixel)
    else if (U.lace && (c.g === 4 || (c.g === 2 && !c.leg && up !== 2 && c.f > 0 && c.u0 <= 0 && c.u1 >= 0))) { R = RT; j = 4; }   // (lace: a bow in the trim colour between the cups and on the waist)
    else if (U.lace && up === 0) j++;                                                                 // (...and its top edge a lighter band)
    else if (c.g === 2 && c.leg && dn === 0) j--;                                                     // (the hem of trunks and boxers, a step darker)
    else if (c.g === 2 && !c.leg && c.z < -2.6) j--;                                                  // (under the curve)
    if (U.gloss && i >= 3) j++;
    j = Math.max(0, Math.min(4, j));
    if (edge && j && dist(R[j], SK[c.i]) < 120) j--;                                                  // (pale cloth on pale skin: its edge a step darker, so the piece has a shape)
    const C = R[j], L = R[Math.max(0, j - 2)];                                                        // (a line the renderer drew on the body there - under the bust, beside an arm - a fold of the cloth)
    for (const p of c.px) { const q = LN[p] ? L : C; CR[p] = q[0]; CG[p] = q[1]; CB[p] = q[2]; }
  }
}
// (a pale cloth's ramp shades to a warm brown - on a bare body, the skin's own tones: underwear's pale cloth shades cool instead)
// (a dark cloth on dark skin stays dark: re-lit to charcoal it would be the skin's own lightness)
const far4 = (R, SK) => { const N = relit(R); return dist(N[2], SK[2]) < dist(R[2], SK[2]) ? R : N; };
const pale4 = (R) => (lum(R[3]) > 0.68 ? R.map((c, i) => mix(R[4], [118, 128, 160], [0.6, 0.45, 0.3, 0.14, 0][i])) : R);
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
