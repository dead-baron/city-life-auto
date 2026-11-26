// The clothing pictures (the art pass, part C3; concept UIC-19: an Inventory tile shows the piece itself). No drawn set:
// the game's own people art draws a bare figure and the same figure wearing the piece, from the front, and what the
// piece put on the figure is its picture - so a tile always matches what is worn, in the colours it is worn in, and a
// new piece gets its picture for nothing. What counts as the piece's pixel: one that differs from the bare figure's at
// that place, in a colour the bare figure has nowhere (skin that only shows differently - a bikini smaller than the
// underwear, a hat's shade - is not the piece). Two bare figures are there to try - a light skin in dark underwear, a
// dark skin in light: a cream top is lost on the first, a brown boot on the second; the second is drawn only when the
// first shows little. A bag or a thing worn that does not show from the front (a backpack) is drawn from behind. A
// piece that puts next to nothing of its own on the figure (a bare chest, a thin chain, ear studs) has no picture:
// its tile keeps the slot's glyph.
// Pure (no page): client/bag.js makes the tiles of it, tools/piecesheet.mjs the review sheet.
import { person, polishOn } from './art2/people.js';
import { packGBuf, downsample2 } from './art2/gbuf.js';
import { PIECES, emptyLook, validLook, lookArt, byName } from '../shared/lookcore.js';

// (min: the pixels a picture needs to be one; small: more for the small things worn or carried - two dots for a pair
// of bangles say less than the slot's glyph)
export const PIECEPIC = { figs: [{ skin: 1, under: 5 }, { skin: 13, under: 0 }], min: 6, small: 16, few: 14 };
const UNDER = { f: 'Bra and briefs', m: 'Briefs' };
const BACK = new Set(['bag', 'jewel']);
const BARE = new Map();   // the bare figures, drawn once each
function bare(base, k, slot, opt, dir = 0) {
  const key = `${base}${k}${slot === 'under' ? 'u' : ''}${opt && opt.res || 1}${polishOn() ? 'p' : ''}${dir}`;
  let B = BARE.get(key);
  if (!B) {
    const L = emptyLook(base), F = PIECEPIC.figs[k]; L.body.build = 1; L.body.skin = F.skin; L.hair.style = 0;
    if (slot !== 'under') { const id = byName(UNDER[base]); if (id) L.outfit.under = { id, c: F.under, t: F.under, p: 0 }; }
    const pic = draw(L, opt, dir), own = new Set();
    for (let o = 0; o < pic.w * pic.h; o++) if (pic.p0[o * 4 + 3]) own.add((pic.p0[o * 4] << 16) | (pic.p0[o * 4 + 1] << 8) | pic.p0[o * 4 + 2]);
    BARE.set(key, (B = { L, pic, own }));
  }
  return B;
}
const draw = (L, opt, dir = 0) => downsample2(packGBuf(person(lookArt(validLook(structuredClone(L))), dir, 'idle', 0, opt && opt.res > 1 ? { res: opt.res, closeFace: opt.closeFace } : {})));
function tryOn(P, it, k, opt, dir = 0) {
  const A0 = bare(P.b === 'm' ? 'm' : 'f', k, P.slot, opt, dir), A = A0.pic, L1 = structuredClone(A0.L);
  L1.outfit[P.slot] = { id: it.id, c: it.c ?? P.c, t: it.t ?? P.t, p: it.p || P.d.p || 0 };
  const B = draw(L1, opt, dir), ox = Math.round(B.ax - A.ax), oy = Math.round(B.ay - A.ay), keep = new Uint8Array(B.w * B.h);
  let x0 = B.w, x1 = -1, y0 = B.h, y1 = -1, n = 0;
  for (let y = 0; y < B.h; y++) for (let x = 0; x < B.w; x++) {
    const o = y * B.w + x; if (!B.p0[o * 4 + 3]) continue;
    const xa = x - ox, ya = y - oy, oa = xa >= 0 && ya >= 0 && xa < A.w && ya < A.h ? ya * A.w + xa : -1, had = oa >= 0 && A.p0[oa * 4 + 3];
    if (had && A.p0[oa * 4] === B.p0[o * 4] && A.p0[oa * 4 + 1] === B.p0[o * 4 + 1] && A.p0[oa * 4 + 2] === B.p0[o * 4 + 2]) continue;
    if (A0.own.has((B.p0[o * 4] << 16) | (B.p0[o * 4 + 1] << 8) | B.p0[o * 4 + 2])) continue;
    keep[o] = 1; n++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  return { B, keep, n, x0, x1, y0, y1 };
}
// it: { id, c, t, p } (a look's outfit item; colours default to the piece's own). -> { w, h, n, px (RGBA) } or null.
// opt.res > 1 (with opt.closeFace, client/art2/peopleclose.js): from the close-up figure, for a big tile.
export function piecePixels(it, opt = null) {
  const P = it && PIECES[it.id];
  if (!P) return null;
  let t = tryOn(P, it, 0, opt);
  if (t.n < PIECEPIC.few) { const u = tryOn(P, it, 1, opt); if (u.n > t.n) t = u; }
  // (worn on the back - a backpack, a guitar case: nothing of it shows from the front, so from behind)
  const min = BACK.has(P.slot) ? PIECEPIC.small : PIECEPIC.min;
  if (t.n < min && BACK.has(P.slot)) { t = tryOn(P, it, 0, opt, 4); if (t.n < PIECEPIC.few) { const u = tryOn(P, it, 1, opt, 4); if (u.n > t.n) t = u; } }
  if (t.n < min) return null;
  const { B, keep, n, x0, y0 } = t, w = t.x1 - x0 + 1, h = t.y1 - y0 + 1, px = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const o = (y + y0) * B.w + x + x0; if (keep[o]) for (let k = 0; k < 4; k++) px[(y * w + x) * 4 + k] = B.p0[o * 4 + k]; }
  return { w, h, n, px };
}
