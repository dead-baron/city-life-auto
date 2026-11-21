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
  // glasses, a size bigger (the owner, 11-20: "glasses a size bigger", "square/rimless/browline glasses too small"): each kind's
  // stamp round an eye (people.js GLS: dx out from the nose then dy down, from -1; a color key). A whole ring round the eye
  // where there was half of one; the two rings meet over the nose.
  // (the owner, 20:15: round glasses "too close together ... one step bigger so it looks like an actual round lens". A lens is
  // two art pixels wide now - the eye and the pixel beside it - with its rim round them; the two lenses share the pixel
  // between the eyes, the bridge.)
  propBox: { paper: [3.4, 0.7, 4.0, 0, 0], clip: [2.6, 0.6, 3.4, 0, 0], laptop: [4.2, 0.8, 3.0, 0, 0], parcel: [2.9, 3.2, 2.8, -2.6] },
  propHold: { paper: 1, clip: 1, laptop: 1, ball: 2 },   // (held flat against the chest, the forearm across: people.js accHands)   // (things carried in the hand: half sizes across, along, up, how far under the hand, and how far out from it)
  GLS: { sleep: '11F', novelty: '10F20F12F22F31F01F11E21W', round: '10F20F12F22F31F01F11E21W', half: '01F31F12F22F11E21W', frames: '10F20F30F01F31F12H22H32H11E21W', browline: '00F10F20F30F01T31T12T22T11E21W', rimless: '10C20C31C12C22C11E21W', patch: '00F10F20F01F11F21F12F' },
  // (facial hair as small pictures - the owner, 23:27: "I can't see any of the moustaches". Decided a world pixel at a time on the
  // head's curve they baked to a dark pixel or two wherever they fell, in the hair's darkest tone whatever the hair looked like:
  // a hole in the face, not a moustache. Each is rows of five art pixels now, in the tone the hair's own mass is drawn in: X the
  // hair, s a soft tone of it, t a shadow of it (stubble). The small ones: [the moustache's row, the chin's], across the face's
  // middle. The beards (w): [the cheeks' row, the moustache's, the chin's], stretched from one edge of the face to the other. A
  // long beard keeps its own shape hanging under the chin - people.js.)
  BST: { moustache: ['.XXX.'], pencil: ['.sss.'], handlebar: ['XX.XX'], walrus: ['XXXXX', '.s.s.'], horseshoe: ['.XXX.', '.X.X.'], fumanchu: ['.sss.', '.s.s.'], circle: ['.XXX.', '.XXX.'], goatee: ['.....', '.XXX.'], soul: ['.....', '..X..'], vandyke: ['.XXX.', '..X..'],
    stubble: { w: ['.....', 'ttttt', '.ttt.'] }, short: { w: ['s...s', 'sssss', '.sss.'] }, full: { w: ['X...X', 'XXXXX', '.XXX.'] }, long: { w: ['X...X', 'XXXXX', '.XXX.'] }, chinstrap: { w: ['X...X', 'X...X', '.XXX.'] }, chops: { w: ['X...X', 'XX.XX', '.....'] } },
  // ---- masks as small pictures (people.js face(): at the end, over the face). Columns are art pixels from the left eye
  // (lo..hi across the face, m the middle), rows from the eyes' row down.
  masks(cx) {
    const { put, eyes, e0, A, skin, turn, hexRgb, fwd, fm } = cx, xs = eyes.map((e) => e.p.bx), xa = Math.min(...xs), n = (Math.max(...xs) - xa) >> 1, two = eyes.length > 1;
    let lo = two ? -1 : -1, hi = two ? n + 1 : 1; const m = two ? n >> 1 : fwd; if (two && turn > 0.2) { if (fwd > 0) lo--; else hi++; }
    const base = { bx: xa, by: e0.by }, P = (i, j, c) => put(base, c, i, j), row = (j, c, a = lo, b = hi) => { for (let i = a; i <= b; i++) P(i, j, c); };
    const sh = (c, k) => c.map((v) => Math.max(0, Math.min(255, Math.round(k > 1 ? v + (255 - v) * (k - 1) : v * k)))), ex = two ? [0, n] : [0], out = (i) => (two ? (i === 0 ? -1 : 1) : -fwd);
    // (the concepts' missing marks: a plaster on the cheek, a black eye, stripes of face paint - lookcore.js SCARS, MAKEUP)
    if (!fm && !A.medmask && !A.bandana && !A.mask) {
      const bs = A.beard && this.BST[A.beard], HR = cx.W.hairR;
      if (bs && HR) {
        // (where they go: a face from the front has three art rows under the eyes - the moustache on the second, a row of skin
        // between it and the eyes, the chin's tuft on the third; turned, it has two - the moustache on the first, the chin on
        // the second. In profile they're on the mouth's side of the face: the moustache a pixel back from the jaw's front)
        const X = (() => { let o = mix(HR[3], HR[4], 0.45); for (let k = 0; k < 6 && dist(o, skin[3]) < 96; k++) o = [Math.round(o[0] * 0.88), Math.round(o[1] * 0.8), Math.round(o[2] * 0.68)]; return o; })(),   // (darkened toward brown: a blonde beard darkened evenly was olive)
          s = mix(X, skin[2], 0.42),   // (between the hair's body tone and its lit one - what the mass of hair above it looks like, peoplepolish.js hairLit: the base colour alone was black under brown-looking hair - darkened until it stands off the skin)
          odd = two && (n & 1) ? 1 : 0, c0 = two && turn > 0.2 ? m + fwd : m;
        const on = (i, j) => cx.onHead(base.bx + i * 2, base.by + j * 2) && cx.onHead(base.bx + i * 2 + 1, base.by + j * 2 + 1), r0 = two && on(c0, 3) ? 2 : 1;
        const K = { X, s, t: mix(X, skin[2], 0.66) }, wide = !Array.isArray(bs);
        (wide ? bs.w : bs).forEach((r, j0) => {
          const j = wide ? j0 - 1 + r0 : j0 + (two ? r0 : 1); if (j < 1) return;
          if (!two) {   // (in profile: from the front of the face back)
            let f = 0; for (let k = 4; k >= 0; k--) if (on(fwd * k, j)) { f = k; break; }
            if (wide) { for (let t = 0; t <= f + 1; t++) { const ch = r[t === 0 ? 2 : t === f + 1 ? 4 : 3]; if (ch !== '.') P(fwd * (f - t), j, K[ch]); } return; }
            const a = j0 ? f : Math.max(0, f - 1); for (let i = 2; i < 4; i++) if (r[i] !== '.') P(fwd * (a - (i - 2)), j, K[r[i]]); return;
          }
          if (wide) { for (let col = lo; col <= hi; col++) { const ch = r[col < c0 ? (col === lo ? 0 : 1) : col > c0 + odd ? (col === hi ? 4 : 3) : 2]; if (ch !== '.') P(col, j, K[ch]); } return; }
          for (let i = 0; i < 5; i++) { if (r[i] === '.') continue; P(c0 + i - 2 + (odd && i > 2 ? 1 : 0), j, K[r[i]]); if (odd && i === 2) P(c0 + 1, j, K[r[i]]); }
        });
      }
      if (A.scar === 6) { P(hi, 1, [244, 232, 210]); P(hi - 1, 1, [226, 206, 178]); }
      if (A.scar === 7) { const b = skin[1].map((v, i) => Math.round(v * 0.45 + [96, 52, 110][i] * 0.55)); P(0, 1, b); P(-1, 0, b); }
      if (A.makeup && A.makeup.kind === 'eyeshadow') { const c = hexRgb(A.makeup.color || '#7a3ac8'); for (const i of ex) P(i, -1, c); }
      if (A.makeup && A.makeup.kind === 'face paint') { const c = hexRgb(A.makeup.color || '#c8262b'); P(lo, 1, c); P(hi, 1, c); if (two) { P(lo + 1, 1, c); P(hi - 1, 1, c); } }
    }
    // (a scarf: nothing on the face - the owner, 23:27: "goes around face on angle view but below it in front and other angle view". It's the same wrap round the neck from every side: dress() NECK)
    if (A.glasses === 'sleep') { const c = hexRgb(A.glassColor || '#a898d8'), nz = two && turn > 0.2 ? m + fwd : m; row(0, sh(c, 1.12)); for (let i = lo; i <= hi; i++) if (i !== nz) P(i, 1, sh(c, 0.88)); P(lo - 1, 0, sh(c, 0.62)); P(hi + 1, 0, sh(c, 0.62)); return; }   // (a band over the eyes, lit along its top, a pad over each cheek under it with the nose between them, its strap a darker pixel into the hair each side; the owner, 23:27: "maybe sleep mask color is blending in with skin" - navy on a dark fringe was no shape at all: lavender now)
    if (A.glasses === 'novelty') { P(m, 1, [236, 150, 128]); P(m, 0, [236, 150, 128]); row(2, [30, 24, 26], m - 1, m + 1); return; }   // (novelty glasses: a big pink nose and a moustache under the frames)
    if (A.medmask) { const c = hexRgb(typeof A.medmask === 'string' ? A.medmask : '#8fc4e8'); row(1, sh(c, 1.35)); row(2, c); row(3, sh(c, 0.82), lo + 1, hi - 1); P(lo - 1, 1, [236, 238, 242]); P(hi + 1, 1, [236, 238, 242]); return; }
    if (A.bandana) { const c = hexRgb(typeof A.bandana === 'string' ? A.bandana : '#c8262b'); row(1, sh(c, 0.8)); row(2, c); row(3, sh(c, 0.9), lo + 1, hi - 1); P(m - 1, 2, sh(c, 1.5)); P(m + 1, 2, sh(c, 1.5)); P(m, 3, sh(c, 1.5)); return; }
    if (A.glasses === 'domino') {   // (a party mask; a masquerade mask - A.masq, its trim)
      const c = hexRgb(A.glassColor || '#1a1a1e'), t = hexRgb(A.masq || A.glassTrim || '#d9a21b'), dark = 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2] < 90;
      row(0, c); for (const i of ex) P(i, 0, dark ? [238, 238, 242] : [30, 24, 30]);
      for (let i = lo; i <= hi; i++) if (i !== m) P(i, 1, sh(c, 0.85));
      P(lo, -1, t); P(hi, -1, t); if (A.masq) { P(m, -1, t); P(lo, 1, t); P(hi, 1, t); }
      return;
    }
    if (!fm) return;
    const c = hexRgb(A.fmask.c), t = A.fmask.t ? hexRgb(A.fmask.t) : c, blk = [26, 22, 26];
    if (fm === 'pig') { for (const e of eyes) if (e.p.by !== e0.by) for (const d of [0, 1, -1]) put(e.p, c, d, 0);   // (an eye the face couldn't bring onto the other's row - people.js eyeLevel: its white isn't left showing beside the mask's own eye)
      for (const i of ex) { P(i, -1, c); P(i + out(i), -1, c); } }   // (an animal's mask has no brows of the wearer's on it)
    const mm = m + (two && turn > 0.2 ? fwd : 0), tip = two ? mm : mm + fwd;   // (an animal's muzzle: a step toward the way the head is turned; in profile its nose at the tip)
    if (fm === 'pig' && A.fmask.animal === 'chicken') { row(0, c, lo - 1, hi + 1); for (const i of ex) P(i, 0, [24, 20, 22]); P(tip, 1, [242, 168, 27]); P(mm, 1, [242, 168, 27]); P(mm, 2, t); }
    else if (fm === 'pig' && A.fmask.animal === 'panda') { for (const i of ex) { P(i + out(i), 0, blk); P(i, 1, blk); P(i + out(i), 1, blk); P(i, 0, [244, 244, 240]); } P(tip, 2, blk); }   // (a white eye in each black patch: all black, the patches read as a moustache)
    else if (fm === 'pig' && A.fmask.animal === 'bear') { const mz = sh(c, 1.5); row(1, mz, mm - 1, mm + 1); row(2, mz, mm - 1, mm + 1); P(two && turn > 0.2 ? mm + fwd : tip, 1, [30, 22, 20]); row(0, c, lo - 1, hi + 1); for (const i of ex) P(i, 0, [26, 20, 18]); }   // (the eyes' whole row in the mask's color first - at an angle the white of an eye was left beside its dot, 22:19; the owner, 20:53: the snout at an angle - a pale block three by two with the nose on it, no dark line down its middle; the eyes plain dots)
    else if (fm === 'pig') { const sn = sh(c, 1.25), no = sh(c, 0.6); row(1, sn, mm - 1, mm + 1); row(2, sh(c, 1.1), mm - 1, mm + 1); P(mm - 1, 1, no); P(mm + 1, 1, no); row(0, c, lo - 1, hi + 1); for (const i of ex) P(i, 0, [40, 26, 30]); }
    else if (fm === 'gas') { row(0, sh(c, 0.9)); row(-1, sh(c, 1.1)); row(1, c); for (const i of ex) { P(i, 0, [168, 196, 206]); P(i + out(i), 0, [92, 118, 130]); } }
    else if (fm === 'clown') { P(m, 1, t); row(2, t, m - 1, m + 1); P(m - 2, 1, [240, 150, 160]); P(m + 2, 1, [240, 150, 160]); for (const i of ex) { P(i, -1, [52, 104, 214]); P(i, 0, [24, 22, 30]); } }
    else if (fm === 'skull') { const d = [34, 28, 30]; for (const i of ex) { P(i, 0, d); P(i + out(i), 0, d); P(i, -1, sh(c, 0.8)); } P(m, 1, d); P(lo, 1, sh(c, 0.72)); P(hi, 1, sh(c, 0.72)); for (let i = lo + 1; i <= hi - 1; i++) P(i, 2, (i - m) & 1 ? d : sh(c, 1.2)); P(m, 3, sh(c, 0.7)); }
    else if (fm === 'alien') { for (const i of ex) { P(i, 0, [14, 16, 14]); P(i + out(i), 0, [14, 16, 14]); P(i + out(i), -1, [14, 16, 14]); } P(m, 2, sh(c, 0.55)); P(m, -2, sh(c, 1.3)); }
  },
  itemK: 1.18,   // (things held in the hand, a little bigger - the owner, 11-20: "held items bigger")
  nubOff: ['short'],   // (styles whose one-pixel bump at the back of the head, in profile, is folded into the outline - people.js)
  tipKeep: ['spiky', 'mohawk', 'quiff', 'shag'],
  eyeMode: 3,         // how an eye's colour shows (eyes() below): the colour with a white beside it - the owner's pick of four, 11-20
  eye2: true,         // a face at an angle keeps its far eye (people.js face)
  eyeLevel: true,     // ...and the two on one art row (people.js face)
  lnHead: 0.24,       // the line a fringe or a hat draws on the face: this much lighter (people.js: a shadow, not a headband)
  lnL: 0.34,          // a line's lightness follows what it's drawn on, up to this much (people.js) - white cloth and skin get soft lines
  vLight: 0.56,       // a white or pale cloth's darkest shade (vMin's for the rest)
  inseam: true,
  vSkin: 0.4,
  stripeN: 3, stripeTilt: 0.35,   // (a stripe every third art pixel along a part, one art pixel thick, laid on the art grid - people.js patFn and render())
  rampFix(R) { return Array.isArray(R) && Array.isArray(R[0]) ? relit(R) : R; },   // (a stripe's ramp, as dress() re-lights every cloth)
  armLift: 1, armLiftMax: 8.5,   // (in profile the near arm is lifted by what the high camera drops it, 8.5 px at most - people.js person())
  clean: true,   // (the body's shading tidied on the art grid: one tone an art pixel, none alone in its tone - people.js)       // the line between the legs runs up to the crotch, front and back (people.js)
  // the outline, on the art grid (people.js): [lit side: how much of the colour it borders, its brightest; the same in the shade]
  // (the owner, 11-20: the concepts' soft outline in the colour of what it outlines, "slightly darker" so the people sit with
  // the world's benches and lamps - and never bright enough to read as more skin: in the game a paler one made blobs of heads and hands)
  ol: [0.3, 95, 0.18, 60],
  eyeZ: 0.02,
  hairLit: true,    // (pass 3: hair as a mass with a lit top - hairLit below)
  mouthOn: false,   // (pass 3, the owner 11-19: the concepts' small figures have no mouth - off; true draws pass 1's. Painted lips - lipstick, glam, goth, a clown's - always show)
  noseK: 1.0,
  dims(D, A, b) {
    // (a slim build, the owner 11-20: "a big step back" - at four fifths of an average build's width the chunky body was six art
    // pixels across under a head of ten, its trunk no deeper than its arm: from the side an arm and nothing else. Slim is an
    // average build an art pixel narrower: three fifths of the way back to it)
    if (b.w < 1) { const q = (1 + (b.w - 1) * 0.6) / b.w; for (const k of ['chestR', 'waistR', 'pelR']) { D[k][0] *= q; D[k][1] *= q; } D.shX *= q; D.hipX *= q; D.shBar *= q; D.w *= q; }
    const fem = D.fem, mu = D.mu, w = D.w, h = D.h;
    // the neck: the head sits a neck above the shoulders (today the chin is inside them), the neck thick enough to show
    D.headUp = D.head[2] + (fem ? 1.7 : this.neckM ?? 3.7) * h;   // (a man's a pixel more: on the chunky build his chin sat on his chest from the side - "lost definition to the neck", the owner 11-20)
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
    // (women's builds, the owner 11-20: athletic is average with a little more shape - no big arms; curvy is athletic with a
    // little more shape - not a belly; big keeps a belly, as its own shape under the bust. D.shape: how far the bust and the seat stand out)
    // (LIMB(k): the limbs and the fists as thick as a build of limb k - the fists with them, or a hand stands out of a thin arm as a point)
    const LIMB = (k) => { const l0 = b.limb || 1, q = (1 + (k - 1) * 0.55) / (1 + (l0 - 1) * 0.55); for (const key of ['armR', 'foreR', 'thighR', 'shinR']) D[key] = D[key].map((v) => v * q); D.fist *= q; };
    if (fem) {
      if (mu) { const k = (1 + mu * 0.03) / (1 + mu * 0.2); D.armR = D.armR.map((v) => v * k); D.foreR[0] *= 1 / (1 + mu * 0.15); D.shX *= 1.02 / (1 + mu * 0.1); D.chestR[0] *= 1.02 / (1 + mu * 0.1); D.neckR /= 1 + mu * 0.2; LIMB(1.04); }
      D.shape = b.belly > 0 && b.belly < 1.2 ? 1.18 : mu ? 1.08 : b.belly >= 1.2 ? 1.28 : 1;
      if (b.belly > 0 && b.belly < 1.2) D.bust = 1.5;   // (curvy: "more definition to her breasts")
      if (b.belly > 0 && b.belly < 1.2) {   // (curvy)
        const kw = 1.05 / (b.w || 1);
        D.belly = 0; D.waistR[0] = (D.waistR[0] - b.belly * 1.4 * 1.1) * kw; D.waistR[1] = (D.waistR[1] - b.belly * 1.2) * kw; D.chestR[0] *= kw; D.chestR[1] *= kw; D.shX *= kw; D.shBar *= kw; D.pelR[0] *= 1.1 / (b.w || 1); D.pelR[1] *= kw; D.hipX *= 1.1 / (b.w || 1); D.w = 1.05;
        LIMB(1.04);
      }
    }
    // a muscular build's arms and shoulders: half the boost - on the chunky build's thick limbs the far shoulder at an angle
    // stood beside the face as big as the face
    // (...and a build's limbs: its thick or thin kept at a little over half - on limbs already 1.24 as thick, an athletic or a
    // big build's arm was half as wide again as an average one's)
    { const l0 = b.limb || 1, k = (1 + (l0 - 1) * 0.55) / l0; for (const key of ['armR', 'foreR', 'thighR', 'shinR']) D[key] = D[key].map((v) => v * k); D.fist *= k; }
    if (mu && !fem) { const k = (1 + mu * 0.1) / (1 + mu * 0.2), k2 = (1 + mu * 0.06) / (1 + mu * 0.12), k3 = (1 + mu * 0.05) / (1 + mu * 0.1); D.armR = [D.armR[0] * k, D.armR[1] * k2]; D.foreR[0] *= (1 + mu * 0.08) / (1 + mu * 0.15); D.shX *= k3; D.chestR[0] *= k3; }
    // a body with depth (the concepts' side views are a barrel, not a plank), and a big build's belly out in front
    D.chestR[1] *= fem ? 0.84 : 1.03; D.waistR[1] *= fem ? 1.0 : 1.1; D.pelR[1] *= 1.08;
    if (!fem) D.chestR[1] = Math.min(D.chestR[1], D.waistR[1] + 0.55);   // (a man's chest no more than half a pixel in front of his waist: more was a bump on a slim build, a point on an athletic one)   // (a woman's back flatter: her upper back stood out behind the shoulder in a side view - the owner, 11-20; her shape is the bust's and the seat's)
    D.chestR[1] = Math.max(D.chestR[1], D.armR[0] + 1.0); D.waistR[1] = Math.max(D.waistR[1], D.armR[0] + 0.6);   // (a trunk deeper than the arm that hangs beside it, whatever the build)
    if (b.belly >= 1.2) { D.waistR[0] *= 1.12; D.waistR[1] *= 1.12; D.chestR[0] *= 1.06; D.shX *= 1.05; }
    D.fist = Math.min(D.fist, D.foreR[1] * 1.35);   // (a hand no more than a third wider than its wrist: on a slim build's arm it stood out at the hip as a point, and from the side behind it)
    if (!fem && b.belly > 0 && b.belly < 1.2) D.belly = 0;   // (a man's curvy build is a thicker waist - dims() has that - not a small belly: at his size it was a bump on the chest)
    { const fk = 0.74 + 0.26 * Math.min(1.15, D.shinR[0] / (2.85 * (fem ? 0.86 : 1) * 1.24)); D.foot = D.foot.map((v, i) => v * (i < 2 ? fk : 1)); }   // (feet in step with the legs over them: a slim build's were clown shoes)
    // (a big build's back is a back: the waist no deeper than the chest - the belly is its own shape in front, people.js)
    if (b.belly >= 1.2) D.waistR[1] = Math.min(D.waistR[1], D.chestR[1] * 1.04);
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
    let iris = F.eyeColor ? cx.hexRgb(F.eyeColor) : EYE; for (let k = 0; k < 12 && (dist(iris, skin[3]) < 110 || Math.abs(lum(iris) - lum(skin[3])) < 0.13); k++) iris = iris.map((v) => Math.round(v * 0.88));   // (...or sits at the skin's own lightness: a light eye on dark skin stays light)   // (the picked colour itself, darkened only as far as it takes to stand off the skin)
    const lid = mix(skin[1], LASH, 0.35), white = mix(WHITE, skin[4], dk ? 0.2 : 0.1), lash = mix(LASH, skin[0], 0.15);
    // (a brow is never as dark as the eye under it, or the two read as one tall bar)
    const brow0 = off(mix(hairC, EYE, 0.2), skin[3], 84), brow = mix(brow0, skin[2], 0.3), browS = mix(brow0, skin[2], 0.55);
    const late = [];
    for (const e of eyes) {
      const o = outOf(cx, e), q = e.p;
      // (this.eyeMode - options for the owner, 11-20: how an eye's colour shows. 0 today's, the colour mixed into one dark
      // pixel; 1 the colour under a dark lash line; 2 a dark pupil with the colour beside it; 3 the colour with a white beside it)
      const mode = this.eyeMode | 0;
      if (!P.eyes) { put(q, lid); if (mode >= 2) put(q, lid, o, 0); continue; }   // (shut: the lid's line)
      if (mode === 1) { put(q, iris); put(q, lash, 0, -1); }
      else if (mode === 2) { put(q, pupil); put(q, iris, o, 0); }
      else if (mode === 3) {
        // (the owner's pick, 11-20: the eye's colour with a white beside it, on the outer side. The six shapes on it: almond as
        // it is; round a lash over the colour; narrow no white - a squint; hooded the lid's shadow over both; big a lash over
        // both; sleepy a heavy lid over the colour and half a white)
        const wc = E5 === 2 ? lid : E5 === 5 ? mix(white, lid, 0.5) : white;
        if (!put(q, wc, o, 0)) put(q, wc, -o, 0);
        late.push([q, iris]);   // (the colours go on after every white: at an angle the eyes are neighbours, and one's white took the other's colour)   // (in profile there's no face beyond the eye: the white goes behind the colour, as on a face seen from the side)
        if (E5 === 1) put(q, lash, 0, -1);
        if (E5 === 3) { const sh = mix(skin[1], skin[0], 0.3); put(q, sh, 0, -1); put(q, sh, o, -1); }
        if (E5 === 4) { put(q, lash, 0, -1); put(q, lash, o, -1); }
        if (E5 === 5) put(q, lid, 0, -1);
      }
      else put(q, pupil);
      if (mode === 1 || mode === 2) { const up1 = mode === 1 ? 1 : 0; put(q, fem ? browS : brow, 0, -1 - up1); if (mode >= 2) put(q, browS, o, -1); continue; }
      if (mode !== 3) {
      // almond the eye alone; round a lash over it; narrow a squint's line running out; hooded the lid's shadow over it;
      // big a lash over and the white beside; sleepy a heavy lid over and out
      if (E5 === 1 || E5 === 4) put(q, lash, 0, -1);
      if (E5 === 2) put(q, lid, o, 0);
      if (E5 === 3) put(q, mix(skin[1], skin[0], 0.3), 0, -1);
      if (E5 === 4) put(q, white, o, 0);
      if (E5 === 5) { put(q, lid, 0, -1); put(q, mix(skin[2], lid, 0.5), o, 0); }
      if (dk && E5 !== 4) put(q, mix(skin[3], skin[4], 0.8), 0, 1);
      }
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
    for (const [q, c] of late) put(q, c);
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
  dress(W, A, D, T, TF) {
    const keep = new Set([W.skin, W.hairR]), fix = (R) => (Array.isArray(R) && Array.isArray(R[0]) && !keep.has(R) ? relit(R) : R);
    const wrap = (k, f) => { const o = W[k]; if (o) W[k] = (Q) => f(o(Q), Q); };
    W.holes = !!((A.top && (A.top.torn || A.top.mesh)) || T.crop || T.bikini || T.bare || (A.bottom && A.bottom.pattern === 'ripped') || (A.under && A.under.lace));   // (pieces made to show skin through them: people.js render() leaves their specks of skin)
    for (const k of ['torso', 'arm', 'leg', 'skirt', 'hood', 'collar', 'shoe', 'sole', 'hat', 'brim', 'lining', 'apron', 'pack', 'leather', 'case', 'beltbag']) wrap(k, fix);
    const bothDark = isDark(W.top) && isDark(W.bot) && !T.dress && !T.long && !T.bib;
    // underwear (lookcore.js 'under': A.under, on the halves no clothes cover) - pass 4, under4 below: the body under it
    // is handed to the renderer as skin and every pixel's place on the body kept; post() cuts the piece on the art grid
    // (no piece picked: the plain basics every look has - lookcore.js lookArt: boxers, a bra and panties - cut the same way)
    // (the wardrobe's own sports bra, bikini top and bikini bottoms are cut the same way - the owner, 11-20: "sports
    // bra one thin line", "bikini top two pixels", a strap on the bikini bottoms. Each half in its own piece's color.)
    const basic = (h) => !!h && !h.under && h.trim === undefined && h.color === '#e8e4dc';
    const wearT = !!A.top && !A.top.under && !basic(A.top) && (A.top.kind === 'bra' || A.top.kind === 'bikini'), wearB = !!A.bottom && !A.bottom.under && !basic(A.bottom) && A.bottom.kind === 'bikini' && !T.swimsuit;   // (a swimsuit is one piece: the renderer's own)
    const U = A.under || ((basic(A.top) || basic(A.bottom)) && { color: '#e8e4dc', trim: '#c8ccd4', band: 1 }) || ((wearT || wearB) && { color: (wearT ? A.top : A.bottom).color, trim: (wearT ? A.top : A.bottom).trim });   // (pass 5, the owner: the basics are boxers for a man, a bra and panties for a woman)
    const cells = U && !T.dress && !T.long, ub = cells && A.bottom && (A.bottom.under || basic(A.bottom) || wearB) && W.bk !== 'none', ut = cells && A.top && (A.top.under || basic(A.top) || wearT);
    const bt = !ub ? 0 : T.swimsuit ? 'body' : W.bk === 'bikini' ? 'brief' : W.bk === 'trunks' ? (U.fit ? 'trunk' : 'boxer') : 0;
    const tt = !ut ? 0 : T.swimsuit ? 'body' : wearT ? (A.top.kind === 'bra' ? 'sport' : 'bra') : T.bikini ? (W.tk === 'bikini' ? 'bandeau' : U.sport ? (U.lace ? 'bralette' : 'sport') : 'bra') : W.tk === 'tank' ? 'tank' : W.tk === 'under' ? 'tee' : 0;
    if (bt || tt) {
      const S = W.u4 = { rec: [], U, bt, tt, cu: D.chestUp, su: D.shUp, fem: D.fem, SK: W.skin, RC: pale4(far4(cloth(wearT ? A.top.color : U.color), W.skin)), RT: pale4(relit(cloth(U.trim))) };
      if (wearT !== wearB || (wearT && wearB && A.top.color !== A.bottom.color)) S.RCb = pale4(far4(cloth(wearB ? A.bottom.color : U.color), W.skin));   // (two pieces, two colors: the bottom half's own)
      const hemZ = T.tuck ? 3.3 : T.bare || T.bikini || T.towel || T.crop ? 9 : T.tank ? 0.4 : -0.9, mine = new Set([W.top, relit(W.top)]), ours = new Set([W.bot, relit(W.bot)]);
      const body = (R, Q) => {
        const low = Q.part === 'pel' && Q.z <= hemZ;
        const bel = Q.part === 'belly' && (!tt || tt === 'bra' || tt === 'sport' || tt === 'bralette' || tt === 'bandeau');
        if (bel && (R !== W.skin || Q.res !== 1 || !bt)) return R;   // (a big build's belly is bare between a bra and briefs: at chest height it stands out beyond the bust, and took the cups - a red ball from the side)
        if (low ? !bt || (R !== W.skin && !ours.has(R)) : R !== W.skin && !(tt && mine.has(R))) return R;
        if (Q.res !== 1) { const g = cut4(S, { n: 1, bust: Q.part === 'bust' ? 1 : 0, u: Q.u, z: Q.z, f: Q.f, u0: Q.u - 0.06, u1: Q.u + 0.06, z0: Q.z - 0.5, z1: Q.z + 0.5 }, null); return g ? (g === 2 && tt === 'tee' ? S.RT : S.RC) : W.skin; }   // (close up: cut pixel by pixel)
        S.rec.push(Q.x, Q.y, bel ? 3 : Q.part === 'bust' ? 1 : 0, Q.u, Q.z, Q.f);   // (3: a belly under no top - never the top half's, and the bottom half's only where its rows run across it, under4)
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
    const pad = (Q, al) => { if (Math.abs(al - 0.52) < 0.13) { if (Q.l2 > -0.3) Q.k += al < 0.5 ? 0.3 : 0; else Q.k -= 0.12; return 1; } return 0; };   // (11-20, the owner: pads show from behind too - the strap round the joint, a shade darker)
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
    // the Founding Citizen jacket (lookcore.js d.shine; the owner, 11-20: "all gold, bomber style, shine/sparkle, small VFX if
    // cheap"): a gold bomber - dark ribbing at the cuffs and the hem - the cloth glossy, and here and there an art pixel of
    // it catches the light (a glow: it shows at night too). Where the sparkles fall moves as the body does: they twinkle
    // as the figure breathes and walks, at no cost.
    if (A.top && A.top.shine) {
      const mineT = new Set([W.top, relit(W.top)]), RIB = relit(cloth(A.top.trim || '#1a1a1e')), rib = (Q) => { Q.k -= 0.25; return RIB; };
      const spark = (Q) => { Q.gloss = 1; let v = (Math.floor(Q.x / 2) * 374761393 + Math.floor(Q.y / 2) * 668265263) | 0; v = Math.imul(v ^ (v >>> 13), 1274126177); v = ((v ^ (v >>> 16)) >>> 0) / 4294967296; if (v > 0.945) { Q.e = [255, 242, 176, 150]; Q.k += 0.4; } };
      const hemRow = (Q) => { const y = Math.round(Q.y); return Math.floor(y / 2) === Math.floor((y + 0.8192 * (Q.zs + 0.9)) / 2); };   // (the art row the hem falls in: people.js HEMZ, underHem)
      wrap('torso', (R, Q) => { if (!mineT.has(R)) return R; if (Q.res === 1 && Q.z < 4 && hemRow(Q)) return rib(Q); spark(Q); return R; });
      wrap('pel', (R, Q) => { if (!mineT.has(R)) return R; if (Q.res === 1 && hemRow(Q)) return rib(Q); spark(Q); return R; });
      wrap('arm', (R, Q) => { if (!mineT.has(R)) return R; if (Q.part === 'fa' && Q.l0 > 0.78) return rib(Q); spark(Q); return R; });
      wrap('collar', (R, Q) => (mineT.has(R) ? rib(Q) : R));
    }
    // ---- things on the chest, laid on the art grid (the owner, 11-20 20:15: lanyard, chain and stethoscope "still too thin to
    // recognize", a bow tie "bigger so it actually looks like a bow tie", buttons "centered ... all the way up"). Decided a
    // world pixel at a time they came out a pixel here and a pixel there; each is a small picture in art pixels now (NECK),
    // hung from the collar's art pixel at the middle of the front: rows down from it, columns either side. In profile the
    // picture's `side` is used instead - columns back from the chest's front. From behind, a line on the nape (`nape`).
    if (TF && W.torso && !A.founder) {
      const J = A.jewel || {}, hx = (c) => '#' + c.map((v) => Math.max(0, Math.min(255, v | 0)).toString(16).padStart(2, '0')).join(''), tone = (R, c, k) => cloth(hx(mix(R[3], c, k)));
      const jc = A.chain ? cloth(typeof A.chain === 'string' ? A.chain : 'gold') : J.color ? cloth(J.color) : null, jt = J.trim ? cloth(J.trim) : null, steel = cloth('#7c88a4'), dk = cloth('#2a262c');
      const g = (R, k = 0) => (Q) => { Q.gloss = 1; Q.k += k; return R; }, m = (R, k = 0) => (Q) => { Q.k += k; return R; };
      const N = [];   // (each: rows, side, nape, K)
      if (A.chain && !T.open) {
        if (J.steth) N.push({ rows: ['T...T', 'T...T', 'T...s', 'T....', 'SS...'], side: ['.T', 'T', 'T', 'S'], nape: 'T', K: { T: m(jc, -0.1), S: g(steel, 0.1), s: g(steel, 0.3) } });
        else if (J.lany) { const card = tone(jc, [246, 248, 252], 0.45); N.push({ rows: ['c...c', 'c...c', '.c.c.', '.kkk.', '.WdW.'], side: ['.c', 'c', 'c', 'k', 'W'], nape: 'c', K: { c: m(jc), W: m(card, 0.2), k: m(jc, -0.35), d: m(dk) } }); }
        // (the owner, 20:53: "scarf doesn't look like a scarf yet" - wound round the neck two rows thick, wider than the neck, in knit ribs; one end down the front, two wide, a band of the trim and a fringe at its end)
        // (the owner, 23:27: "goes around face on angle view but below it in front and other angle view" - one picture from every
        // side, and one color: its ribs of two tones baked as a red pixel here and a dark one there, and in the light it went
        // pale pink. Flat tones now - the piece's color, a fold a shade darker - snug under the chin, wider over the collar, one
        // end down the front beside the middle with a band of the trim at its end)
        else if (J.scarf) { const f5 = (c) => [c, c, c, c, c], sc = f5(jc[Math.min(3, jc.length - 1)]), sd = f5(mix(jc[Math.min(3, jc.length - 1)], [30, 12, 22], 0.3)), tr = jt ? f5(jt[Math.min(3, jt.length - 1)]) : sd, fl = (R) => (Q) => { Q.gloss = 0; return R; };
          N.push({ rows: ['.RRRRR.', '.RRrRR.', '....RR.', '....RR.', '....RR.', '....tt.'], rowsE: ['.RRRRRR.', '.RRRrRR.', '.....RR.', '.....RR.', '.....RR.', '.....tt.'], side: ['RRR', 'RRr', 'R', 'R', 'R', 't'], back: ['.RRRRR.', '.RRRRR.'], bu: 1,   // (bu: from behind it starts a row higher - on the neck, not across the shoulder blades)
  K: { R: fl(sc), r: fl(sd), t: fl(tr) } }); }
        else if (J.pearl) N.push({ rows: ['q...q', '.pqp.'], side: ['.q', 'p'], K: { p: g(cloth('#fbf8f2'), 0.3), q: m(cloth('#9a8fae')) } });
        else if (J.whistle) N.push({ rows: ['c...c', '.c.c.', '..s..'], side: ['.c', 'c', 's'], K: { c: m(jc), s: g(steel, 0.2) } });
        else if (J.bolo) N.push({ rows: ['.c.c.', '..S..', '.c.c.', '.t.t.'], side: ['c', 'S', 'c', 't'], K: { c: m(dk), S: g(jc, 0.2), t: g(steel) } });
        else N.push({ rows: J.chain === 2 ? ['a...a', 'ab.ba', 'ba.ab', '.bab.'] : J.pendant ? ['a...a', 'b...b', '.aba.', '..P..'] : ['a...a', 'ba.ab', '.aba.'], side: ['.a', 'b', 'a'], K: { a: g(jc, 0.2), b: g(jc, -0.25), P: g(jc, 0.35) } });
      }
      // (the concepts' missing pieces: a tie on a shirt alone, braces, a cravat, a towel round the neck, a sweater over the shoulders)
      if (J.tie) N.push({ rows: ['..K..', '.TtT.', '.tTT.', '.TTt.', '.TtT.', '..T..'], rowsE: ['..KK..', '.TTtT.', '.TtTT.', '.tTTt.', '.TTtT.', '..TT..'], side: ['K', 'TT', 'Tt', 'TT', 'T'],   // (the owner, 22:19: "one pixel on each side ... and pointy at the end")
   // (the owner, 21:55: "more tie shaped" - a knot, a narrow neck, the blade widening, a point)
 K: { K: m(tone(jc, [20, 16, 24], 0.45)), T: m(jc), t: m(tone(jc, [244, 240, 232], 0.55)) } });   // (two wide, a darker knot, pale stripes slanting down it, the tip cut on the slant)
      if (J.braces) N.push({ rows: ['S...S', 'S...S', 'S...S', 'S...S', 'S...S', 'c...c'], back: ['S...S', 'S...S', '.S.S.', '..S..', '..S..', '..c..'], side: ['.S', '.S', '.S', '.S', '.S'], K: { S: m(jc), c: g(steel, 0.2) } });
      if (J.ntowel) { const tw = jc; N.push({ rows: ['.WW.WW.', '.WW.WW.', '.WW.WW.', '.tt.tt.', '.WW.WW.'], back: ['.WWWWW.'], side: ['.WW', '.WW', '.tt'], K: { W: m(tw, 0.1), t: m(jt || tw) } }); }
      if (J.shsweater) N.push({ rows: ['SSS.SSS', '.SS.SS.', '..SkS..'], back: ['SSSSSSS', 'SSSSSSS', '.SSSSS.', '.SSSSS.'], side: ['SSS', '.SS', '..S'], K: { S: m(jc), k: m(tone(jc, [16, 16, 24], 0.4)) } });
      if (J.shtowel) N.push({ rows: ['.....WW', '.....WW', '.....WW', '.....tt', '.....WW'], back: ['WW.....', 'WW.....', 'WW.....', 'tt.....'], side: ['.W', '.W', '.t'], K: { W: m(jc), t: m(jt || jc) } });   // (a towel over one shoulder, an end down the chest and one down the back)
      // (a jersey's number - the owner, 23:27: "white pixels in the middle that should look better". A grid of fourteen cells a
      // world pixel wide baked to white specks; it's a 7 three art pixels wide and four tall now, on the chest and on the back)
      if (T.number) { const nb = cloth(A.top.trim || 'white'), f5 = [nb[Math.min(4, nb.length - 1)], nb[Math.min(4, nb.length - 1)], nb[Math.min(4, nb.length - 1)], nb[Math.min(4, nb.length - 1)], nb[Math.min(4, nb.length - 1)]], nf = (Q) => { Q.gloss = 0; return f5; };
        N.push({ rows: ['.....', '.WWW.', '...W.', '..W..', '..W..'], rowsE: ['......', '.WWWW.', '....W.', '...W..', '...W..'], back: ['.....', '.....', '.WWW.', '...W.', '..W..', '..W..'], cloth: 1, K: { W: nf } }); }
      if (A.top && A.top.torn) N.push({ rows: ['.....', '.s...', '.....', '...s.', '.s...'], cloth: 1, K: { s: () => W.skin } });   // (a ripped tee: holes that show the skin)
      if (A.top && A.top.cutout) N.push({ rows: ['.....', '.....', '.....', 's...s', 's...s'], cloth: 1, K: { s: () => W.skin } });   // (a cut-out dress: the waist bare at both sides)
      if (A.top && A.top.ragged) { const pt2 = cloth(A.top.trim || '#6b4a2a'); N.push({ rows: ['.....', '.pp..', '.pp..', '.....', '...p.', 'ss...', '...pp'], cloth: 1, K: { p: m(pt2), s: () => W.skin } }); }   // (ragged: patches in the trim, a hole)
      if (A.top && A.top.sherpa) { const fl = cloth(A.top.trim || '#e8dcc0'); N.push({ rows: ['FF.FF'], back: ['.FFFFF.'], side: ['FF'], K: { F: m(fl, 0.1) } }); }   // (a sherpa collar: fleece in the trim, turned out over the shoulders)
      if (J.bow) { const bw = cloth(J.color || '#1a1a1e'); N.push({ rows: D.chestR[0] >= 8.2 ? ['BB...BB', 'BBBkBBB', 'BB...BB'] : ['BB.BB', 'BBkBB', 'BB.BB'], side: ['BB', 'Bk', 'BB'],   // (the owner, 20:53: "comically large ... one step bigger" - seven across where the chest has room, pinched at the knot)
 K: { B: m(bw, -0.2), k: m(tone(bw, [150, 150, 164], 0.28)) } }); }
      // (the owner, 20:15: "backpack straps still get kind of lost", a duffel "should have a strap over the shoulder", the camera "still not big enough")
      if (A.back === 'backpack') { const sc = tone(cloth(A.backColor || 'navy'), [18, 20, 30], 0.35); N.push({ rows: ['S.....S', 'S.....S', 'S.....S', 'S.....S', 'S.....S'], side: ['..S', '..S', '..S', '..S'], K: { S: m(sc) } }); }
      if (A.back === 'guitarcase' || A.back === 'yogamat' || A.duffel) { const sc = cloth(A.back === 'yogamat' ? '#2a2a2e' : A.duffel ? A.bagColor || '#2a2a2e' : A.backColor || '#1a1a1e'), dg = ['S......', '.S.....', '..S....', '...S...', '....S..', '.....S.']; const gd = dg.map((r) => r.split('').reverse().join('')); N.push({ rows: A.duffel ? gd : dg, back: A.duffel ? dg : gd, side: ['.S', '.S', 'S'], K: { S: m(sc, 0.1) } }); }
      if (A.prop && A.prop[0] === 'camera') { const body = cloth(A.bagColor || '#2a2a2e'), sv = cloth(A.prop[2] || '#c8ccd4'); N.push({ rows: ['c...c', '.c.c.', '.ttt.', '.KLK.', '.KKK.'], side: ['.c', 'c', 't', 'K', 'K'], nape: 'c', K: { c: m(cloth('#5a3a26')), t: g(sv, -0.1), K: m(body, -0.1), L: g(cloth('#7fa6c4'), 0.3) } }); }
      const shirt = A.top && A.top.kind === 'shirt' && !T.open, zipd = A.top && A.top.zipped;
      if (shirt) { const bt = tone(W.top, [28, 36, 48], 0.45); N.push({ rows: ['.....', '..o..', '.....', '..o..', '.....', '..o..', '.....', '..o..'], cloth: 1, K: { o: m(bt) } }); }   // (from the row under the collar's opening)
      if (zipd === 2) { const bt = tone(W.top, [20, 22, 30], 0.5); N.push({ rows: ['.....', '..o..', '.....', '..o..', '.....', '..o..', '.....', '..o..', '.....', '..o..'], cloth: 1, K: { o: m(bt) } }); }   // (a coat, a cardigan, a blazer done up: its buttons)
      else if (zipd) { const zp = A.top.shine ? cloth(A.top.trim || '#1a1a1e') : tone(W.top, [16, 18, 26], 0.55); N.push({ rows: ['..z..', '..z..', '..z..', '..z..', '..z..', '..z..', '..z..', '..z..', '..z..', '..z..'], cloth: 1, K: { z: m(zp, -0.1) } }); }
      if (N.length) {
        const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], zc0 = dot([TF.c[0] - TF.p[0], TF.c[1] - TF.p[1], TF.c[2] - TF.p[2]], TF.z), SA = 0.573576, CA = 0.819152;
        const anchor = (fy, zA) => { const k = TF.ry * fy, h = zA - zc0, X = TF.c[0] + TF.y[0] * k + TF.z[0] * h, Y = TF.c[1] + TF.y[1] * k + TF.z[1] * h, Z = TF.c[2] + TF.y[2] * k + TF.z[2] * h; return [Math.floor((X + 1e-4) / 2), Math.floor((Y * SA - Z * CA + 1e-4) / 2), (((X + 1e-4) % 2) + 2) % 2]; };
        const zN = D.shUp - (this.neckZ ?? -3.9), F = [anchor(0.85, zN)[0], anchor(0.4, zN)[1]], Bk = anchor(-0.6, D.shUp + 0.2), prof = Math.abs(TF.x[0]) < 0.5,
          // (never under the chin: the head's lowest art row on the screen, from the head's place over the spine - a woman's collar is under it)
          chin = (() => { const h = D.neckUp + D.headUp, Y = TF.p[1] + TF.z[1] * h + TF.y[1] * 0.6, Z = TF.p[2] + TF.z[2] * h + TF.y[2] * 0.6; return Math.floor((Y * SA - Z * CA + Math.hypot(D.head[1] * SA, D.head[2] * CA) - 0.6) / 2) + 1; })(), fs = TF.y[0] > 0 ? 1 : -1, SKN = W.skin, hz = W.HEMZ ?? -0.9;
        if (chin > F[1] && chin < F[1] + 3) F[1] = chin;
        const toCam = TF.y[1] > 0.5;   // (facing the camera: the shoulders' tops are the front's too)
        // (the middle of the front falls in an art pixel, or on the line between two - a figure facing us is an even number
        // across. On the line a picture is one wider, its middle column twice: a bow tie, a chain, a card sit in the middle,
        // not half a pixel to one side. Buttons and a zip stay one column.)
        const fr = anchor(0.85, zN)[2], ev = prof ? 0 : fr < 0.5 ? -1 : fr > 1.5 ? 1 : 0, q34 = !prof && Math.abs(TF.x[0]) < 0.9, at = (r, i, one) => { const c0 = (r.length - 1) >> 1; if (q34 && i * fs > 0) i += fs;   // (turned three quarters the far half of the chest is a column narrower: what hangs there is a column nearer the middle - a far suspender, the far side of a chain - or it fell off the body)
          return r[!ev || one ? c0 + i : ev < 0 ? (i >= 0 ? c0 + i : c0 + i + 1) : i <= 0 ? c0 + i : c0 + i - 1]; };
        const o = W.torso;
        W.torso = (Q) => {
          const R = o(Q); if (Q.res !== 1) return R;
          const x = Math.round(Q.x), y = Math.round(Q.y), cx = Math.floor(x / 2), cy = Math.floor(y / 2);
          if (Q.f > (toCam ? -0.5 : 0.05)) {
            if (cy > Math.floor((y + CA * (Q.zs - hz)) / 2)) return R;   // (under the hem: the trousers')
            const j = cy - F[1], i = cx - F[0];
            for (const n of N) { if (n.cloth && R === SKN) continue; const E2 = !prof && ev && n.rowsE, P = prof ? n.side : E2 || n.rows; if (!P || j < 0 || j >= P.length) continue;
              const ch = prof ? P[j][-i * fs] : E2 ? P[j][(P[j].length >> 1) + i + (ev < 0 ? 0 : -1) + (q34 && i * fs > 0 ? fs : 0)] : at(P[j], i, n.cloth); if (ch && ch !== '.') return n.K[ch](Q); }
          } else if (Q.f < -0.35) { const j0 = cy - Bk[1], i = cx - Bk[0]; for (const n of N) { const j = j0 + (n.bu || 0); if (n.nape && j === 0 && Math.abs(i) <= (n.wide ? 2 : 1)) return n.K[n.nape](Q); if (n.back && !prof && j >= 0 && j < n.back.length && cy <= Math.floor((y + CA * (Q.zs - hz)) / 2)) { const ch = at(n.back[j], i, 1); if (ch && ch !== '.') return n.K[ch](Q); } } }
          return R;
        };
      }
    }
    // (the concepts' missing pieces, 2: arm warmers - the forearm in the piece's color, a band of the trim at its top; a shirt
    // tied round the waist - a check of its two colors on the hem's art row and the one under it, the knot hanging in front;
    // a two-color windbreaker - the trim's color from the chest up and down to the elbows)
    // (the concepts' missing pieces, 3: a skirt's fringe and concho belt, bondage trousers' straps)
    if (A.bottom && A.bottom.fringe) { const fr = cloth(A.bottom.trim || '#c8ccd4'); wrap('skirt', (R, Q) => { const cx = Math.floor(Math.round(Q.x) / 2); if (Q.l0 < 0.14) { if (cx & 1) { Q.gloss = 1; return fr; } Q.k -= 0.3; return R; } if (Q.l0 > 0.72 && (cx & 1)) Q.k -= 0.4; return R; }); }
    if (A.bottom && A.bottom.straps) { const st = cloth(A.bottom.trim || '#c8262b'); wrap('leg', (R, Q) => { if (R === W.skin) return R; const al = Q.part === 'th' ? Q.l0 * 0.5 : 0.5 + Q.l0 * 0.5; return Math.abs(al - 0.36) < 0.045 || Math.abs(al - 0.66) < 0.045 ? st : R; }); }
    if (A.jewel && A.jewel.armw) { const ac = cloth(A.jewel.color || '#1a1a1e'), at2 = cloth(A.jewel.trim || '#ff5aa8'); wrap('arm', (R, Q) => (Q.part === 'fa' && Q.l0 < 0.88 ? (Q.l0 < 0.16 ? at2 : ac) : R)); }
    if (TF && A.jewel && A.jewel.waistshirt && !A.founder) {
      const c1 = cloth(A.jewel.color || '#c8262b'), c2 = cloth(A.jewel.trim || '#1a1a1e'), hz = W.HEMZ ?? -0.9;
      const f = (R, Q) => { if (Q.res !== 1 || R === W.skin) return R; const y = Math.round(Q.y), d = Math.floor(y / 2) - Math.floor((y + 0.819152 * (Q.zs - hz)) / 2); if (d < 0 || d > 2) return R; if (d === 2 && !(Q.f > 0.4 && Math.abs(Q.u) < 0.22)) return R; return ((Math.floor(Math.round(Q.x) / 2) + d) & 1) ? c1 : c2; };
      wrap('torso', f); wrap('pel', f);
    }
    if (TF && A.top && A.top.block) {
      const t2b = cloth(A.top.trim || A.top.color2 || '#7a3ac8'), mine = new Set([W.top, relit(W.top)]), zB = D.chestUp - 1.2;
      wrap('torso', (R, Q) => { if (!mine.has(R) || Q.res !== 1) return R; const y = Math.round(Q.y); return Math.floor(y / 2) < Math.floor((y + 0.819152 * (Q.zs - zB)) / 2) ? t2b : R; });
      wrap('arm', (R, Q) => (mine.has(R) && Q.part === 'ua' ? t2b : R)); wrap('collar', (R) => (mine.has(R) ? t2b : R));
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
      // (the concepts' missing things to carry, each on the small bag's block at its own size - propBox; a ball is a ball)
      if (PR[0] === 'paper') { const pp = cloth('#cfcab6'), ink = cloth('#3a3a44'); wrap('leather', (R, Q) => { Q.gloss = 0; const j = Math.floor((Q.y + 400) / 2); return Q.l2 > 0.5 && Q.l2 < 0.95 ? ink : (j & 1) && Q.l2 < 0.3 && Math.min(Math.abs(Q.l0), Math.abs(Q.l1)) < 0.72 ? cloth('#8a8a92') : pp; }); }   // (a folded newspaper: a headline's dark bar across the top, lines of print under it - an art pixel each)
      if (PR[0] === 'clip') wrap('leather', (R, Q) => { Q.gloss = 0; return Q.l2 > 0.72 && Math.min(Math.abs(Q.l0), Math.abs(Q.l1)) < 0.4 ? cloth('#c8ccd4') : Math.min(Math.abs(Q.l0), Math.abs(Q.l1)) < 0.72 && Q.l2 < 0.6 && Q.l2 > -0.8 ? pt : pc; });
      if (PR[0] === 'laptop') wrap('leather', (R, Q) => { Q.gloss = 0.2; if (Q.l2 > 0.72) { Q.k += 0.3; return pt; } return pc; });
      if (PR[0] === 'parcel') wrap('leather', (R, Q) => { Q.gloss = 0; return Math.abs(Q.l1) < 0.16 || (Q.l2 > 0.8 && Math.abs(Q.l0) < 0.2) ? pt : pc; });
      if (PR[0] === 'ball') { const bo = [[188, 76, 20], [204, 86, 22], [218, 98, 26], [218, 98, 26], [232, 120, 40]], sm = [[58, 30, 24], [58, 30, 24], [66, 34, 26], [66, 34, 26], [66, 34, 26]]; wrap('leather', (R, Q) => { Q.gloss = 0; const bc = W.ballC; if (!bc || Q.res !== 1) return bo; const dx = Math.floor(Math.round(Q.x) / 2) - bc[0], dy = Math.floor(Math.round(Q.y) / 2) - bc[1]; return dx === 0 || dy === 0 ? sm : bo; }); }   // (a basketball: its own oranges - on a tanned arm a leather-brown ball was part of the arm - and its two seams, a cross through the middle art pixel of the disc: people.js sets W.ballC, the art pixel its middle falls in)
      if (PR[0] === 'poles') wrap('wood', (R, Q) => (Q.l0 < 0.16 ? cloth('#2a2a2e') : Q.l0 > 0.9 ? pt : pc));
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
      const fair = lum(W.hairR[3]) > 0.45, SR = W.skin.map((c, i) => mix(W.skin[Math.max(0, i - (fair ? 1 : 0))], W.hairR[fair ? Math.max(0, i - 2) : Math.min(4, i + 1)], 0.6));   // (fair hair's stubble two tones down, as people.js's)
      E(at([0, -0.04, 0.02]), HD, [hr[0] + 0.5, hr[1] + 0.55, hr[2] + 0.4], GR.HAIR, 'stubble', () => SR, (a, b, c) => c > (b > 0.3 ? 0.42 : b > -0.2 ? 0.42 - (0.3 - b) * 1.24 : -0.2 + (b + 0.2) * 0.5));
    }
    if (ex === 'dreads' || ex === 'boxbraids' || ex === 'braids') lock(at([0, -0.9, -0.2]), sw(nk(0, backY - 0.7, -3.6), 0.3), 4.6, 3.6, 'back');   // (the hair behind the neck, under the locs: the shirt showed between them - a window in the hair from behind)
    if (FRONT[ex]) for (const s of [-1, 1]) { const a = at([s * 0.96, 0.18, -0.12]), b = sw(nk(s * (hr[0] * 0.86), 1.5, FRONT[ex][0]), 0.35); lock(a, b, FRONT[ex][1], FRONT[ex][2], 'front'); }
    if (ex === 'flattop') e([0, -0.02, 0.86], HD, [hr[0] * 0.92, hr[1] * 0.9, 4.2], 'top'), E(at([0, -0.02, 1.02]), HD, [hr[0] * 0.98, hr[1] * 0.96, 2.2], GR.HAIR, 'top', M, (a, b, c) => c < 0.55);   // (a block, its top cut level)
    else if (ex === 'pompadour') { e([0, 0.5, 1.02], mmul(HD, rx(-0.45)), [hr[0] * 0.62, 3.9, 3.9], 'quiff'); e([0, -0.1, 0.98], HD, [hr[0] * 0.6, 4.2, 1.8], 'quiff'); }   // (11-20: narrower than the head - from the front it was a box)   // (a roll standing over the forehead, swept back)
    else if (ex === 'puffs') for (const s of [-1, 1]) { const c = at([s * 0.78, -0.2, 0.9]); E(c, HD, [3.7, 3.6, 3.5], GR.HAIR, 'afro', M); bumps(c, [3.7, 3.6, 3.5], 7, 1.5, -0.2, 1.3, 2, 0.95); }   // (two round puffs high at the sides)
    else if (ex === 'lowpony') { const r0 = at([0, -0.96, -0.28]); E(r0, HD, [1.3, 1.1, 1.2], GR.HAIR, 'tie', () => cloth('#2a2226')); const m1 = sw(nk(0.5, backY - 1.3, -2.6), 0.5), m2 = sw(nk(0.9, backY - 1.5, -5.6), 0.8); lock(r0, m1, 1.7, 2.9, 'tail'); lock(m1, m2, 2.9, 2.2, 'tail'); lock(m2, sw(nk(0.3, backY - 1.0, -8.8), 1), 2.2, 0.6, 'tail'); }   // (11-20: full under the tie, a slight curve, a point - it was a straight bar)   // (tied at the nape, hanging down the back)
    else if (ex === 'shavedside') { lock(at([-0.25, 0.2, 1.06]), at([1.16, 0.22, -0.15]), 3.5, 2.9, 'sweep'); lock(at([1.0, 0.1, 0.1]), sw(nk(hr[0] + 1.2, 0.5, -3.6), 0.4), 2.9, 1.8, 'sweep'); lock(at([0.1, -0.5, 0.98]), at([0.98, -0.72, 0.0]), 3.6, 3.2, 'sweep'); lock(at([0.98, -0.72, 0.0]), sw(nk(hr[0] + 0.6, -1.6, -4.0), 0.5), 3.2, 1.7, 'sweep'); }   // (...and down the back on the same side: from behind, hair on one half of the head, stubble on the other)   // (11-20: the long side is long - swept over and down past the jaw; it was a few thin locks)
    else if (ex === 'emo') { e([0.36, 0.7, 0.42], mmul(HD, ry(0.62)), [hr[0] * 0.74, 2.5, 2.9], 'sweep'); e([-0.5, 0.5, 0.74], HD, [hr[0] * 0.5, 2.2, 1.6], 'sweep'); }   // (a long fringe swept across one eye)
  },
  // ---- pass 5 (docs/tasks/CHARACTERS5.md; the owner's shot, docs/characters/owner-hair-1119.png): the tied and the tall
  // styles in shapes that read from every side (CB3-F, CB3-M, CC2-A). The camera looks down, so anything behind the
  // crown shows above it: a bun was a point on a point (a cone), a ponytail's rising tail a spike. Here a knot is a
  // ball wider than the crown under it, on a dark tie - a step in the outline; a tail leaves the back of the head and
  // hangs; twin buns and puffs are balls apart at the top corners; pigtails stand out from the sides; a mohawk is a
  // crest two art pixels wide. Returns true when it drew the style (people.js hairPrims then leaves its own shape out).
  hairRe(ex, { E, C, at, nk, sw, lock, W, hr, HD, backY, GR, hatOn }) {
    // (a hair band is neutral - charcoal, or a pale grey on hair too dark to show it: the owner, 11-20; it was red)
    const BAND = lum(W.hairR[3]) < 0.24 ? '#a8a2ac' : '#2a2226';
    const M = W.hairM, ball = (c, r) => E(at(c), HD, r, GR.HAIR, 'bun', M), tie = (c, r) => E(at(c), HD, r, GR.HAIR, 'tie', () => cloth(BAND));
    if (ex === 'pony') {   // (tied at the back of the crown; the tail out a little, then down the back of the neck)
      // (11-20: out behind the head first - a tail you can tell from long hair from the side - then down, well clear of the neck)
      const r0 = at([0, -1.05, 0.22]), m = sw(at([0, -1.8, -0.08]), 0.25), e = sw(nk(1.6, backY - 3.4, hatOn ? -4.4 : -5.0), 1);
      E(r0, HD, [1.9, 1.7, 1.8], GR.HAIR, 'tie', () => cloth(BAND)); lock(r0, m, 2.7, 3.3, 'tail'); lock(m, e, 3.3, 1.5, 'tail');
      return true;
    }
    if (hatOn) return false;
    if (ex === 'bun') { tie([0, -0.3, 1.26], [2.0, 1.9, 1.5]); ball([0, -0.34, 1.78], [4.4, 4.2, 3.3]); return true; }   // (11-20: up out of the thicker hair - the tie a dark band between the knot and the head, or the three were one cone)
    if (ex === 'topknot') { tie([0, -0.02, 1.22], [1.9, 1.8, 1.3]); ball([0, -0.04, 1.7], [3.7, 3.5, 2.8]); return true; }
    if (ex === 'manbun') { tie([0, -0.9, 0.2], [1.9, 1.4, 1.8]); ball([0, -1.22, 0.16], [3.4, 3.0, 3.3]); return true; }
    if (ex === 'twinbuns') { for (const s of [-1, 1]) { tie([s * 0.92, -0.04, 1.06], [1.8, 1.7, 1.4]); ball([s * 1.12, -0.04, 1.46], [4.2, 4.0, 3.7]); } return true; }   // (11-20: up and out of the thicker hair, on ties - two balls from behind too)
    if (ex === 'puffs') { for (const s of [-1, 1]) E(at([s * 1.16, -0.04, 1.42]), HD, [4.8, 4.6, 4.4], GR.HAIR, 'afro', M); return true; }   // (level with the crown's middle: the same two balls from the front and from behind)
    if (ex === 'halfup') { tie([0, -0.3, 1.3], [2.0, 1.9, 1.5]); ball([0, -0.34, 1.9], [5.1, 4.7, 3.4]); return true; }   // (CB3-F: a knot on the crown over long hair)
    if (ex === 'pigtails') {
      // (11-20: thicker, further out and longer - two tails you can count from the front and from behind)
      for (const s of [-1, 1]) { const r0 = at([s * 1.0, -0.36, 0.18]), m = sw(at([s * 1.58, -0.4, -0.08]), 0.4), e = sw(nk(s * (hr[0] + 3.0), -1.4, -5.2), 1); tie(sw(at([s * 1.2, -0.38, 0.1]), 0.1) && [s * 1.2, -0.38, 0.1], [2.5, 2.4, 2.3]); lock(r0, m, 1.7, 2.8, 'tail'); lock(m, e, 2.8, 1.2, 'tail'); }   // (a band you can see where each tail leaves the head: the tail narrow at it, then full)
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
    if (fig.W.u4) { fig.W.u4.dir8 = fig.dir8; under4(fig.W.u4, LN, CR, CG, CB, w, AX, AY, gx, gy); }
    const g = (i) => { const k = PID[i]; return k >= 0 && k < 32000 && !NOO[i] ? prims[k].g : 0; }, arm = (x) => x === GR.ARML || x === GR.ARMR;
    const hit = [];
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const i = y * w + x, gi = g(i);
      if (LN[i] || (gi !== GR.TORSO && gi !== GR.SKIRT && gi !== GR.LEGL && gi !== GR.LEGR)) continue;
      for (const j of [i - 1, i + 1]) if (arm(g(j)) && NEAR[j] > NEAR[i] + 0.2 && !(this.lnC && Math.abs(CR[i] - CR[j]) + Math.abs(CG[i] - CG[j]) + Math.abs(CB[i] - CB[j]) > this.lnC)) { hit.push(i); break; }   // (lnC: not where the colours part them already)
    }
    // (a line of one art pixel is a speck: only the lines that run on, with the renderer's own or with each other - lone below)
    const T = LN.slice(0, w * h); for (const i of hit) T[i] = 1;
    const lone = this.clean ? this.lone(T, w, h, gx, gy) : null;
    const SK = fig.W.skin;
    for (const i of hit) {
      if (lone && lone[i]) continue;
      const gi = g(i), L = (CR[i] * 0.3 + CG[i] * 0.59 + CB[i] * 0.11) / 255, legs = gi === GR.LEGL || gi === GR.LEGR;
      LN[i] = 1;
      const c = SK && this.skinLine(SK, CR[i], CG[i], CB[i]);
      if (c) { CR[i] = c[0]; CG[i] = c[1]; CB[i] = c[2]; }   // (bare skin: the skin's own shade, a leg's too)
      else if (this.lnL && !legs && L > 0.3) { const s = Math.max(L * (L > 0.7 ? 0.82 : 0.74), Math.min(L * 0.94, 0.39)) / L, warm = CR[i] > CB[i] + 40; CR[i] *= s; CG[i] *= s * (warm ? 0.9 : 0.95); CB[i] *= s * (warm ? 0.82 : 1.04); }   // (people.js: a line as dark as the colour's own deep shade)
      else { CR[i] = CR[i] * 0.52 + 8; CG[i] = CG[i] * 0.48 + 6; CB[i] = CB[i] * 0.56 + 14; }
    }
  },
  // skinLine(SK, r, g, b): a line's color on bare skin, where (r, g, b) is one of the skin ramp's own tones - half way between
  // the tone under it and the one under that, and never under the ramp's second tone. null: not a tone of this skin.
  skinLine(SK, r, g, b) {
    let i = -1; for (let q = 0; q < SK.length; q++) if (SK[q][0] === r && SK[q][1] === g && SK[q][2] === b) { i = q; break; }
    if (i < 0) return null;
    const a = SK[Math.max(1, i - 1)], c = SK[Math.max(1, i - 2)];
    return [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2, (a[2] + c[2]) / 2];
  },
  // lone(L, w, h, gx, gy): the world pixels whose art pixel holds a line with no line in any art pixel round it
  lone(L, w, h, gx, gy) {
    const bw = (w + gx + 1) >> 1, bh = (h + gy + 1) >> 1, B = new Uint8Array(bw * bh), out = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (L[y * w + x]) B[((y + gy) >> 1) * bw + ((x + gx) >> 1)] = 1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (!L[y * w + x]) continue;
      const bx = (x + gx) >> 1, by = (y + gy) >> 1; let near = 0;
      for (let dy = -1; dy <= 1 && !near; dy++) for (let dx = -1; dx <= 1; dx++) { const X = bx + dx, Y = by + dy; if ((dx || dy) && X >= 0 && Y >= 0 && X < bw && Y < bh && B[Y * bw + X]) { near = 1; break; } }
      if (!near) out[y * w + x] = 1;
    }
    return out;
  },

};
// ---- pass 3 (docs/tasks/CHARACTERS3.md; gap 7): every hairstyle drawn as the concepts draw hair (CB3, CC2, C4) - a mass
// in clean tones on the art grid: a lit top (the crown's upper left, a highlight in it), the body of the hair, a dark
// underside and far edge (the figure's outline is beyond it). The renderer's own hair is a form lit pixel by pixel - at
// 8 art pixels a speckle; here each art pixel of hair takes its tone from where it sits in the mass. Only the hair's
// own tones are redrawn: shaved sides, a parting, ties, cuffs and the lines between locks stay as they are.
// Curls keep a broken tone, braids and locs their strands.
const FRONT = { long: [-4.6, 2.5, 1.7], wavy: [-4.8, 2.7, 1.9], curlylong: [-4.8, 2.9, 2.2], bigcurls: [-4.4, 3.0, 2.3], halfup: [-4.4, 2.4, 1.7], shoulder: [-2.4, 2.4, 1.8], dreads: [-4.2, 2.5, 1.9], boxbraids: [-4.6, 2.4, 1.8], braids: [-4.6, 2.4, 1.8], shag: [-1.8, 2.2, 1.6], braid: [-1.6, 2.0, 1.5] };   // (how far down the neck's frame a front lock ends, its width at the temple and at its tip)
const SHORT = { buzz: 1, fade: 1, sides: 1, balding: 1, cornrows: 1, short: 1, undercut: 1, shavedside: 1 };
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
  const tone = new Int8Array(bw * bh).fill(-1), TN = [R[1], R[2], R[3], mix(R[3], R[4], pale ? 0.4 : 0.55), pale ? mix(R[3], R[4], 0.4) : R[4]], hsh = (x, y) => { const v = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453; return v - Math.floor(v); };   // (underside, far side, body, lit, highlight)
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
    if (t === 0 && SHORT[style] && fig(x, y + 1)) t = 2;   // (a crop's lower edge on the head: no dark rim - on a fade or a buzz cut it was a band round the head)
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
const HIP = 0.9;   // (how high on the hips a brief's strap runs: the triangle's top)
function cut4(S, c, l) {
  const { tt, bt, cu, su, fem } = S;
  if (!c) {
    if (bt === 'trunk') return l.al < 0.33 ? 2 : 0;
    if (bt === 'boxer') return l.al < 0.41 ? 2 : 0;
    if (bt === 'brief' && fem) return l.sd < -0.25 && l.al < 0.16 + 0.1 * (0.2 - l.sd) ? 2 : 0;   // (11-20: the inside of the thigh only - on the chunky build's two rows the wider cut was a band, not a triangle)   // (pass 5: a woman's briefs smaller)
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
    if (z > cu - 1.6 && z < cu + 2.8 && (front && au < 0.68 ? !(au < 0.1 && z > cu + 1.4) : z < cu + 0.4)) return front && au < 0.1 && z > cu - 0.4 ? 4 : 1;   // (11-20: the band runs on round the side - from the side a bra stopped at the cup)   // (4: between the cups - a lace set's bow)
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
    if (!c) cells.set(key, c = { px: [], n: 0, bust: 0, bel: 0, u: 0, z: 0, f: 0, u0: 9, u1: -9, z0: 99, z1: -99, ln: 0, al: 0, sd: 0, g: 0, i: 2 });
    c.px.push(y * w + x);
    if (k === 2) { c.ln++; c.al += a; c.sd += b; }
    else { c.n++; if (k === 3) c.bel++; else c.bust += k; c.u += a; c.z += b; c.f += rec[n + 5]; c.u0 = Math.min(c.u0, a); c.u1 = Math.max(c.u1, a); c.z0 = Math.min(c.z0, b); c.z1 = Math.max(c.z1, b); }
  }
  for (const c of cells.values()) {
    c.leg = c.ln > c.n;
    if (c.leg) { c.al /= c.ln; c.sd /= c.ln; c.g = cut4(S, null, c); }
    else { c.u /= c.n; c.z /= c.n; c.f /= c.n; c.g = c.bel * 2 > c.n ? 0 : cut4(S, c, null); }
    // its tone: the body's own light on that art pixel (the skin's step there), on the cloth's ramp
    let i = 0, m = 0;
    for (const p of c.px) for (let q = 0; q < 5; q++) if (SK[q][0] === CR[p] && SK[q][1] === CG[p] && SK[q][2] === CB[p]) { i += q; m++; break; }
    if (m) c.i = Math.min(3, Math.round(i / m));   // (never the cloth's palest tone: on two art pixels of a boxer's hip it was a pink patch, not a light)
  }
  // (a waist is level at this size: the bottom half runs on across an art pixel that has it on both sides)
  for (const [key, c] of cells) if (!c.g && !c.leg) { const a = cells.get(key - 1), b = cells.get(key + 1); if (a && b && a.g === 2 && b.g === 2) c.fill = 1; }
  for (const c of cells.values()) if (c.fill) c.g = 2;
  // (11-20, the chunky build: a piece cut on a dozen art pixels of torso - fewer at an angle, half of it behind an arm - is
  // tidied as a shape. A hole in it closes; a two-piece's halves never touch (the lowest art pixel of the top gives way: a
  // bra and briefs were one blob at an angle); an art pixel of it on its own goes.)
  const gk = (key) => { const c = cells.get(key); return c ? c.g : 0; }, N4 = (key) => [key - 1, key + 1, key - K, key + K];
  for (const [key, c] of cells) if (!c.g && !c.leg) { const n = N4(key).map(gk).filter((g) => g); if (n.length >= 3 && !(n.includes(2) && n.some((g) => g !== 2))) c.fill = n[0] === 3 || n[0] === 4 ? 1 : n[0]; }   // (never the row of skin between a top half and a bottom half: on a short waist that made one ball of a bra and briefs)
  for (const c of cells.values()) if (c.fill > 0 && !c.g) c.g = c.fill;
  // (...the top's whole lowest row, if the top has a row left over it: cut one art pixel at a time the two made an hourglass, a one-piece)
  if (S.bt && S.bt !== 'body' && tt && tt !== 'tee' && tt !== 'tank') {
    const hitR = new Set(), topR = new Map();
    for (const [key, c] of cells) if (c.g && c.g !== 2) { const r = Math.floor(key / K); topR.set(r, (topR.get(r) || 0) + 1); if (gk(key + K) === 2) hitR.add(r); }
    for (const [key, c] of cells) if (c.g && c.g !== 2) { const r = Math.floor(key / K); if (hitR.has(r) ? (topR.get(r - 1) || 0) >= 3 || gk(key + K) === 2 : false) c.g = 0; }
  }
  // (11-20: every row of the bottom half runs unbroken from its first art pixel to its last - a waist's own shape, seen from
  // the camera's height, leaves the middle of a boxers' top row bare - and a bra has a strap over each cup, or two up from its
  // band behind, whatever the build: cut by place on the body, a slim or a big build's fell between art pixels)
  // (...and a boxer's or a trunk's hem is level: a row of the thighs is the piece's or bare, whichever most of it is - cut by how
  // far down each thigh a pixel sits, the hem left the inside of a thigh bare beside the line between the legs: a skin pixel
  // in the middle of a man's underwear, the owner, 11-20)
  if (S.bt === 'boxer' || S.bt === 'trunk') { const rl = new Map(); for (const [key, c] of cells) if (c.leg) { const r = Math.floor(key / K), e = rl.get(r) || rl.set(r, [0, 0]).get(r); e[c.g === 2 ? 0 : 1]++; }
    for (const [key, c] of cells) if (c.leg) { const e = rl.get(Math.floor(key / K)); c.g = e[0] > e[1] ? 2 : 0; } }
  { const rw = new Map(); for (const [key, c] of cells) if (c.g === 2) { const r = Math.floor(key / K), x = key % K, e = rw.get(r); if (!e) rw.set(r, [x, x]); else { e[0] = Math.min(e[0], x); e[1] = Math.max(e[1], x); } }
    for (const [key, c] of cells) if (!c.g && !c.leg) { const e = rw.get(Math.floor(key / K)), x = key % K; if (e && x > e[0] && x < e[1] && (!S.fem || S.bt !== 'brief' || c.bel * 2 > c.n)) c.g = 2; } }
  // (a band round the back is a level line: level in the world, on a body turned three quarters away it steps down an art
  // pixel half way across - two dashes, "random pixels". Seen from behind, the band is one row: the one most of it is on,
  // from its first art pixel to its last; the straps stand on it.)
  let behind = false;
  if (tt === 'bra' || tt === 'bralette' || tt === 'bandeau') {
    const rowsN = new Map(); let nb = 0, nf = 0, x0 = Infinity, x1 = -1;
    for (const [key, c] of cells) if ((c.g === 1 || c.g === 3 || c.g === 4) && !c.leg) { if (c.f < 0) nb++; else nf++; if (c.g === 1 && c.f < 0) { const r = Math.floor(key / K), x = key % K; rowsN.set(r, (rowsN.get(r) || 0) + 1); x0 = Math.min(x0, x); x1 = Math.max(x1, x); } }
    let R = -1, best = 0; for (const [r, n] of [...rowsN].sort((a, b) => a[0] - b[0])) if (n > best) { best = n; R = r; }
    behind = nb > nf;
    // (...and it runs on to the arm on both sides: every art pixel of the trunk next along the row - 16:51, "swimsuit not showing correctly")
    const trunk = (r, x) => { const c = cells.get(r * K + x); return c && !c.leg && !(c.bel * 2 > c.n) ? c : null; };
    if (R >= 0 && behind) { while (trunk(R, x0 - 1)) x0--; while (trunk(R, x1 + 1)) x1++; }
    if (R >= 0 && behind && (rowsN.size > 1 || x1 - x0 + 1 > best)) for (const [key, c] of cells) {
      if (c.leg) continue;
      const r = Math.floor(key / K), x = key % K;
      if (r === R) { if (!c.g && x >= x0 && x <= x1) c.g = 1; }
      else if (c.f < 0 && (c.g === 1 || c.g === 4 || (c.g === 3 && r > R))) c.g = 0;
    }
    // (three quarters from the front - the owner, 11-20 16:51: "straps missing, swimsuit not showing correctly". The near arm
    // hangs over the near half of the chest and the cups, level in the world, slant across what is left: a red blob on the far
    // side. A row of the chest that is mostly the top is the top right across, and a strap goes up from its near end.)
    if (!behind && (S.dir8 & 1)) {
      const rows = new Map(); for (const [key, c] of cells) if (trunk(Math.floor(key / K), key % K)) { const r = Math.floor(key / K); (rows.get(r) || rows.set(r, []).get(r)).push(key % K); }
      let R0 = Infinity;
      for (const [r, xs] of rows) { const top = xs.filter((x) => { const g = cells.get(r * K + x).g; return g === 1 || g === 4; }); if (top.length < 2 || top.length * 2 < xs.length) continue;
        let a = Math.min(...top), b2 = Math.max(...top); while (trunk(r, a - 1)) a--; while (trunk(r, b2 + 1)) b2++;
        for (let x = a; x <= b2; x++) { const c = cells.get(r * K + x); if (!c.g) c.g = 1; }
        if (r < R0) R0 = r; }
      if (R0 < Infinity) { const xs = rows.get(R0).filter((x) => cells.get(R0 * K + x).g === 1).sort((a, b2) => a - b2);
        // (from each end, the first art pixel with bare chest over it: the very end may lie under the arm)
        for (const [x0, sd] of [[xs[0], 1], [xs[xs.length - 1], -1]]) for (let k2 = 0; k2 < 3; k2++) { const x = x0 + sd * k2, up = trunk(R0 - 1, x); if (!up) continue;
          const has = [x - 1, x, x + 1].some((v) => { const c = cells.get((R0 - 1) * K + v); return c && c.g; }); if (!up.g && !has) up.g = 3; break; } }
    }
  }
  if (tt === 'bra' || tt === 'bralette') {
    let top = Infinity; for (const [key, c] of cells) if (c.g === 1) top = Math.min(top, Math.floor(key / K));
    const xs = [...cells].filter(([key, c]) => c.g === 1 && Math.floor(key / K) === top).map(([key]) => key % K).sort((a, b) => a - b);
    if (xs.length >= 3 && top > 0) for (const x of [xs[Math.floor(xs.length * 0.2)], xs[Math.ceil(xs.length * 0.8) - 1]]) {
      const up = cells.get((top - 1) * K + x), has = [x - 1, x, x + 1].some((v) => { const c = cells.get((top - 1) * K + v); return c && c.g; });
      if (up && !up.g && !has) up.g = 3;
    }
    // (from behind a strap runs on up to the shoulder: cut by its place on the body it broke off an art pixel over the band
    // on a big build, whose art pixels are narrow there - "straps not working on back view and angled view of big")
    if (behind) for (const [key, c] of [...cells]) if (c.g === 3 && !c.leg && c.f < 0) {
      for (let k2 = key - K; ; k2 -= K) { const u = cells.get(k2); if (!u || u.leg || u.z >= S.su + 0.6) break; if (u.g && u.g !== 3) break; u.g = 3; }
    }
  }
  // (the owner, 11-20: a strap round the hip holds a woman's briefs up - the triangle's top row runs on across every art pixel
  // of the hips in it, as far as the arms let it show; from the side and from behind it is the strap)
  if (S.bt === 'brief' && S.fem) {
    // (the strap's row: the highest with three art pixels of the piece or more - one stray one higher up, on a big build's waist, made a second band)
    let top = Infinity; const rows = new Map();
    for (const [key, c] of cells) if (c.g === 2 && !c.leg) rows.set(Math.floor(key / K), (rows.get(Math.floor(key / K)) || 0) + 1);
    for (const [r, n] of rows) if (n >= 3 && r < top) top = r;
    if (top === Infinity) for (const r of rows.keys()) top = Math.min(top, r);
    for (const [key, c] of cells) if (c.g === 2 && !c.leg && Math.floor(key / K) < top) c.g = 0;
    if (top < Infinity) for (const [key, c] of cells) if (!c.g && Math.floor(key / K) === top && (c.leg ? c.al < 0.2 : c.z < 4)) c.g = 2;
  }
  for (const [key, c] of cells) if (c.g && c.g !== 2 && !N4(key).some(gk)) c.lone = 1;   // (the bottom half's stays: from the side, behind a hanging arm, one art pixel at the hip is all there is of it)
  for (const c of cells.values()) if (c.lone) c.g = 0;
  const G = (key) => { const c = cells.get(key); return c ? c.g : -1; }, tee = tt === 'tee', RB = tee ? RT : S.RCb || RC, RBAND = tee ? RC : RT, tones = new Map();
  // (clean tones: an art pixel between two of the piece's in one tone takes it - no speckle from the body's dither)
  for (const [key, c] of cells) { const a = cells.get(key - 1), b = cells.get(key + 1); tones.set(key, c.g && a && b && a.g && b.g && a.i === b.i ? a.i : c.i); }
  const zRow = new Map(); if (U.stripe) { const acc = new Map(); for (const [key, c] of cells) if (c.g && !c.leg) { const r = Math.floor(key / K), e = acc.get(r) || acc.set(r, [0, 0]).get(r); e[0] += c.z; e[1]++; } for (const [r, e] of acc) zRow.set(r, e[0] / e[1]); }   // (each row's mean height on the body: what a stripe bends from)
  // (...by a whole art pixel a column, the same down the column: every stripe one art pixel thick and unbroken - the owner, 19:06)
  const colBend = new Map(); if (U.stripe) { const acc = new Map(); for (const [key, c] of cells) if (c.g && !c.leg) { const e = acc.get(key % K) || acc.set(key % K, [0, 0]).get(key % K); e[0] += c.z - zRow.get(Math.floor(key / K)); e[1]++; } for (const [x, e] of acc) colBend.set(x, Math.round(0.35 * e[0] / e[1] / 2.44)); }
  for (const [key, c] of cells) {
    if (!c.g) continue;
    const up = G(key - K), dn = G(key + K), i = tones.get(key), edge = !up || !dn || !G(key - 1) || !G(key + 1);
    let R = c.g === 2 ? RB : RC, j = i;
    if (c.g === 2 && !c.leg && U.band && !S.RCb && up !== 2 && (up !== 1 || tee || tt === 'tank')) R = RBAND;                    // (the waistband: the top art pixel)
    else if (U.lace && (c.g === 4 || (c.g === 2 && !c.leg && up !== 2 && c.f > 0 && c.u0 <= 0 && c.u1 >= 0))) { R = RT; j = 4; }   // (lace: a bow in the trim colour between the cups and on the waist)
    else if (U.lace && up === 0) j++;                                                                 // (...and its top edge a lighter band)
    else if (c.g === 2 && c.leg && dn === 0) j--;                                                     // (the hem of trunks and boxers, a step darker)
    else if (c.g === 2 && !c.leg && c.z < -2.6) j--;                                                  // (under the curve)
    if (U.gloss && i >= 4) j++;   // (a sheen on the lightest tone only: from tone 3 a red teddy was half pale pink)
    j = Math.max(0, Math.min(4, j));
    if (edge && j && dist(R[j], SK[c.i]) < 120) j--;                                                  // (pale cloth on pale skin: its edge a step darker, so the piece has a shape)
    // (stripes, the owner 11-20: in the trim's color, every other art pixel - down a boxer's legs, across briefs and a bra)
    if (U.stripe && R !== RBAND && (c.g === 1 || c.g === 2) && ((S.bt === 'boxer' || S.bt === 'trunk') && c.g === 2 ? key % K : Math.floor(key / K) - (c.leg ? 0 : colBend.get(key % K) || 0)) & 1) R = RT;   // (across the trunk: the screen's row, bent a third of the way to the body's own height there - the stripe dips a little in front, like the body it is on)
    const C = R[j], L = R[Math.max(0, j - 2)];                                                        // (a line the renderer drew on the body there - under the bust, beside an arm - a fold of the cloth)
    for (const p of c.px) { const q = LN[p] ? L : C; CR[p] = q[0]; CG[p] = q[1]; CB[p] = q[2]; }
  }
}
// (a pale cloth's ramp shades to a warm brown - on a bare body, the skin's own tones: underwear's pale cloth shades cool instead)
// (a dark cloth on dark skin stays dark: re-lit to charcoal it would be the skin's own lightness)
// (pale4: a white or a pale grey piece's shades go a cool grey, so it has a shape on skin - not a yellow or a pink one: its own shades, or a yellow bikini is sand)
const far4 = (R, SK) => { const N = relit(R); return dist(N[2], SK[2]) < dist(R[2], SK[2]) ? R : N; };
const pale4 = (R) => (lum(R[3]) > 0.68 && Math.max(...R[3]) - Math.min(...R[3]) < 48 ? R.map((c, i) => mix(R[4], [118, 128, 160], [0.6, 0.45, 0.3, 0.14, 0][i])) : R);
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
