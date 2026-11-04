// Art v2: the sign faces (wave A1, the owner's 11-03 note: "the text/font on building fronts can be hard to read
// sometimes in their stylized font ... easy to read and not all necessarily the same font ... match the vibe of what
// they are"; docs/art-v2 concepts B1, BF1, BF2, IN5, D8). Six faces and a small one, all built from the project's own
// CLA Pixel 5 x 7 bitmaps (tools/build-pixelfont.py, the HUD's face) and all drawn at the ART PIXEL: one glyph pixel is
// 2 x 2 world px, starting on even px, so the bake's downsample2 (gbuf.js) keeps every stroke whole. font.js (3 x 5)
// stays for road paint and small marks, never for words on a sign.
//
//   civic    CLA caps 5x7, 1 px gap                  clinic, pharmacy, laundromat, post, police, gas, offices
//   block    caps widened a pixel (6x7), drop shadow  pawn, hardware, liquor, auto, gun shop, marts, tackle
//   marquee  block + a 1 px outline                  diner, burger, ice cream, cinema, bowling, arcade
//   serif    caps with slab feet (7x7)               bank, hotel, court, jeweller, tavern, barber, books
//   script   CLA mixed case, sheared 2 px at the top boutique, salon, florist, cafe, bakery
//   neon     mixed case, 1 art px tube + a halo      bars, clubs, motels, records, tattoo, OPEN, VACANCY
//   small    CLA 5x7 mixed case at one art px        the narrowest: the last face tried before abbreviating
//
// The rules (test/signs.test.js checks them): letters 7 art px tall, never a stroke narrower than one art px; a name
// wraps to two lines before it changes face, then takes the narrower civic face, then abbreviates its trade word,
// never squashes; ink to panel contrast at least 4.5:1; the trade's icon in its own tile beside the words.
//
//   lineMask(text, face)            -> { w, h, m, pl, pt } a line's pixels in art px (m: 0 none, 1 ink, 2 shadow,
//                                      3 outline, 4 halo, 5 lip)
//   layoutSign(text, wArt, o)       -> { face, lines, icon, w, h } the board (art px) that fits a width
//   paintBoard(put, L, P, x0, y0, o) paints a laid-out board: put(x, y, rgb, emi|null) in world px, x0 / y0 even
//   signStyle(trade, seed)          -> { trade, face, pal, icon, lit, bulbs } the trade's face and one of its palettes
//   tradeOf({ name, kind, store, shop, A }) -> a key of TRADES
//   contrast(a, b)                  -> the WCAG luminance ratio of two colours
// Pure and worker-safe; no Math.random.

// ---- the CLA Pixel bitmaps (tools/build-pixelfont.py; '#' a pixel, rows from the cap top, rows 7-8 descenders) ----
const RAW = {
  A: '.###.|#...#|#...#|#####|#...#|#...#|#...#', B: '####.|#...#|#...#|####.|#...#|#...#|####.', C: '.###.|#...#|#....|#....|#....|#...#|.###.',
  D: '####.|#...#|#...#|#...#|#...#|#...#|####.', E: '#####|#....|#....|####.|#....|#....|#####', F: '#####|#....|#....|####.|#....|#....|#....',
  G: '.###.|#...#|#....|#.###|#...#|#...#|.####', H: '#...#|#...#|#...#|#####|#...#|#...#|#...#', I: '###|.#.|.#.|.#.|.#.|.#.|###',
  J: '..###|...#.|...#.|...#.|#..#.|#..#.|.##..', K: '#...#|#..#.|#.#..|##...|#.#..|#..#.|#...#', L: '#....|#....|#....|#....|#....|#....|#####',
  M: '#...#|##.##|#.#.#|#.#.#|#...#|#...#|#...#', N: '#...#|#...#|##..#|#.#.#|#..##|#...#|#...#', O: '.###.|#...#|#...#|#...#|#...#|#...#|.###.',
  P: '####.|#...#|#...#|####.|#....|#....|#....', Q: '.###.|#...#|#...#|#...#|#.#.#|#..#.|.##.#', R: '####.|#...#|#...#|####.|#.#..|#..#.|#...#',
  S: '.####|#....|#....|.###.|....#|....#|####.', T: '#####|..#..|..#..|..#..|..#..|..#..|..#..', U: '#...#|#...#|#...#|#...#|#...#|#...#|.###.',
  V: '#...#|#...#|#...#|#...#|#...#|.#.#.|..#..', W: '#...#|#...#|#...#|#.#.#|#.#.#|#.#.#|.#.#.', X: '#...#|#...#|.#.#.|..#..|.#.#.|#...#|#...#',
  Y: '#...#|#...#|.#.#.|..#..|..#..|..#..|..#..', Z: '#####|....#|...#.|..#..|.#...|#....|#####',
  0: '.###.|#...#|#..##|#.#.#|##..#|#...#|.###.', 1: '.#.|##.|.#.|.#.|.#.|.#.|###', 2: '.###.|#...#|....#|...#.|..#..|.#...|#####',
  3: '####.|....#|....#|.###.|....#|....#|####.', 4: '...#.|..##.|.#.#.|#..#.|#####|...#.|...#.', 5: '#####|#....|####.|....#|....#|#...#|.###.',
  6: '..##.|.#...|#....|####.|#...#|#...#|.###.', 7: '#####|....#|...#.|..#..|.#...|.#...|.#...', 8: '.###.|#...#|#...#|.###.|#...#|#...#|.###.',
  9: '.###.|#...#|#...#|.####|....#|...#.|.##..',
  a: '.....|.....|.###.|....#|.####|#...#|.####', b: '#....|#....|####.|#...#|#...#|#...#|####.', c: '.....|.....|.###.|#....|#....|#....|.###.',
  d: '....#|....#|.####|#...#|#...#|#...#|.####', e: '.....|.....|.###.|#...#|#####|#....|.###.', f: '..##|.#..|####|.#..|.#..|.#..|.#..',
  g: '.....|.....|.####|#...#|#...#|#...#|.####|....#|.###.', h: '#....|#....|####.|#...#|#...#|#...#|#...#', i: '#|.|#|#|#|#|#',
  j: '..#|...|..#|..#|..#|..#|..#|#.#|.#.', k: '#...|#...|#..#|#.#.|##..|#.#.|#..#', l: '#|#|#|#|#|#|#',
  m: '.....|.....|##.#.|#.#.#|#.#.#|#.#.#|#.#.#', n: '.....|.....|####.|#...#|#...#|#...#|#...#', o: '.....|.....|.###.|#...#|#...#|#...#|.###.',
  p: '.....|.....|####.|#...#|#...#|#...#|####.|#....|#....', q: '.....|.....|.####|#...#|#...#|#...#|.####|....#|....#', r: '....|....|#.##|##..|#...|#...|#...',
  s: '.....|.....|.####|#....|.###.|....#|####.', t: '.#..|.#..|####|.#..|.#..|.#..|..##', u: '.....|.....|#...#|#...#|#...#|#...#|.####',
  v: '.....|.....|#...#|#...#|#...#|.#.#.|..#..', w: '.....|.....|#...#|#...#|#.#.#|#.#.#|.#.#.', x: '.....|.....|#...#|.#.#.|..#..|.#.#.|#...#',
  y: '.....|.....|#...#|#...#|#...#|#...#|.####|....#|.###.', z: '.....|.....|#####|...#.|..#..|.#...|#####',
  '!': '#|#|#|#|#|.|#', '#': '.#.#.|.#.#.|#####|.#.#.|#####|.#.#.|.#.#.', $: '..#..|.####|#.#..|.###.|..#.#|####.|..#..',
  '%': '##..#|##.#.|...#.|..#..|.#...|.#.##|#..##', '&': '.##..|#..#.|#.#..|.#...|#.#.#|#..#.|.##.#', "'": '#|#',
  '(': '..#|.#.|#..|#..|#..|.#.|..#', ')': '#..|.#.|..#|..#|..#|.#.|#..', '+': '.....|..#..|..#..|#####|..#..|..#..|.....',
  ',': '..|..|..|..|..|.#|.#|#.', '-': '....|....|....|####', '.': '.|.|.|.|.|.|#', '/': '....#|...#.|...#.|..#..|.#...|.#...|#....',
  ':': '.|.|#|.|.|.|#', '?': '.###.|#...#|....#|...#.|..#..|.....|..#..', '@': '.###.|#...#|#.###|#.#.#|#.###|#....|.###.',
};
// (the Script face's own a: the shear breaks CLA's two-storey a, so a round single-storey one; drawn unsheared)
const SCRIPT_A = '.....|.....|.###.|#..#.|#..#.|#..#.|.##.#';
const DESC = /[gjpqy,]/;

// ---- the faces ------------------------------------------------------------------------------------------------------
// gap: px between glyphs; fx: the effect round the ink; kase: 'upper' | 'title' (a capital initial, the rest small)
export const FACES = {
  civic: { gap: 1, fx: null, kase: 'upper', name: 'Civic Sans' },
  block: { gap: 1, fx: 'shadow', kase: 'upper', bold: true, name: 'Block Bold' },
  marquee: { gap: 2, fx: 'outline', kase: 'upper', bold: true, name: 'Marquee' },
  serif: { gap: 1, fx: 'lip', kase: 'upper', serif: true, name: 'Serif Caps' },
  script: { gap: 2, fx: null, kase: 'title', shear: true, name: 'Script' },
  neon: { gap: 2, fx: 'halo', kase: 'title', name: 'Neon Tube' },
  small: { gap: 1, fx: null, kase: 'title', name: 'Small 5x7' },   // (mixed case: the narrowest, the last face tried)
};
export const FACE_KEYS = Object.keys(FACES);
export const CHARSET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789&\'!$+.-';
export const ROLE = { INK: 1, SHADOW: 2, OUTLINE: 3, HALO: 4, LIP: 5 };
const PAD = { shadow: [0, 0, 1, 1], outline: [1, 1, 1, 1], halo: [1, 1, 1, 1], lip: [0, 0, 0, 1] };   // [l, t, r, b]

// a face's glyph: { w, rows: 9 rows of w (1 lit) }
const GLYPHS = new Map();
function glyph(fk, ch) {
  const key = fk + ch;
  let g = GLYPHS.get(key);
  if (g) return g;
  const F = FACES[fk];
  let src = ch === ' ' ? null : fk === 'script' && ch === 'a' ? SCRIPT_A : RAW[ch] || RAW[ch.toUpperCase()] || RAW['?'];
  let rows = src ? src.split('|') : ['...', '...', '...', '...', '...', '...', '...'];
  let w = Math.max(...rows.map((r) => r.length));
  rows = Array.from({ length: 9 }, (_, r) => (rows[r] || '').padEnd(w, '.'));
  if (F.bold && src) {   // (CLA Pixel Bold: every stroke one px wider to the right)
    rows = rows.map((r) => Array.from({ length: w + 1 }, (_, i) => (r[i] === '#' || (i > 0 && r[i - 1] === '#') ? '#' : '.')).join(''));
    w += 1;
  }
  if (F.serif && src) {  // slab feet: a stem's end on the cap line or the baseline grows a pixel either side
    rows = rows.map((r) => '.' + r + '.');
    w += 2;
    const at = (r, c) => rows[r] && rows[r][c] === '#';
    const out = rows.map((r) => r.split(''));
    for (const [r, n] of [[0, 1], [6, 5]]) for (let c = 1; c < w - 1; c++) {
      if (at(r, c) && at(n, c) && !at(r, c - 1) && !at(r, c + 1)) { out[r][c - 1] = '#'; out[r][c + 1] = '#'; }
    }
    rows = out.map((r) => r.join(''));
  }
  if (F.shear && src) {  // the italic: rows 0-1 two px right, rows 2-4 one
    rows = rows.map((r, i) => { const s = i <= 1 ? 2 : i <= 4 ? 1 : 0; return ('.'.repeat(s) + r).padEnd(w + 2, '.'); });
    w += 2;
  }
  const bits = new Uint8Array(w * 9);
  for (let r = 0; r < 9; r++) for (let c = 0; c < w; c++) bits[r * w + c] = rows[r][c] === '#' ? 1 : 0;
  g = { w, bits, adv: F.shear ? w - 1 : w };   // (a sheared glyph's top overhangs the next one's bottom gap)
  GLYPHS.set(key, g);
  return g;
}

// the text as a face writes it
export function caseFor(text, fk) {
  const t = String(text || '');
  if (FACES[fk].kase === 'title') return t.toLowerCase().replace(/(^|[\s\-&/.(])([a-z])/g, (_, a, b) => a + b.toUpperCase());
  return t.toUpperCase();
}

// a line of text in a face -> its mask in art px
const LINES = new Map();
export function lineMask(text, fk) {
  const key = fk + '|' + text;
  let L = LINES.get(key);
  if (L) return L;
  const F = FACES[fk], t = caseFor(text, fk), chars = [...t];
  const gl = chars.map((ch) => glyph(fk, ch));
  const desc = F.kase === 'title' && DESC.test(t) ? 2 : 0, hInk = 7 + desc;
  let inkW = 0;
  gl.forEach((g, i) => { inkW += (i === gl.length - 1 ? g.w : g.adv) + (i < gl.length - 1 ? F.gap : 0); });
  const [pl, pt, pr, pb] = PAD[F.fx] || [0, 0, 0, 0], W = Math.max(1, inkW + pl + pr), H = hInk + pt + pb, m = new Uint8Array(W * H);
  let x = pl;
  for (const g of gl) {
    for (let r = 0; r < hInk; r++) for (let c = 0; c < g.w; c++) if (g.bits[r * g.w + c]) m[(pt + r) * W + x + c] = 1;
    x += g.adv + F.gap;
  }
  const ink = (X, Y) => X >= 0 && Y >= 0 && X < W && Y < H && m[Y * W + X] === 1;
  if (F.fx) for (let Y = 0; Y < H; Y++) for (let X = 0; X < W; X++) {
    if (m[Y * W + X]) continue;
    let k = 0;
    if (F.fx === 'shadow') k = ink(X - 1, Y - 1) ? 2 : 0;
    else if (F.fx === 'lip') k = ink(X, Y - 1) ? 5 : 0;
    else for (let dy = -1; dy <= 1 && !k; dy++) for (let dx = -1; dx <= 1; dx++) if (ink(X + dx, Y + dy)) { k = F.fx === 'outline' ? 3 : 4; break; }
    m[Y * W + X] = k;
  }
  L = { w: W, h: H, m, pl, pt, text: t };
  if (LINES.size > 3000) LINES.clear();
  LINES.set(key, L);
  return L;
}
export const lineWidth = (text, fk) => lineMask(text, fk).w;

// ---- fitting a board ------------------------------------------------------------------------------------------------
// the trade words that may be shortened when nothing else fits (never the name)
const ABBR = { PHARMACY: 'PHARM', LAUNDROMAT: 'LAUNDRY', RESTAURANT: 'REST.', SUPPLY: 'SUP.', COMPANY: 'CO.', AND: '&', STREET: 'ST', AVENUE: 'AVE',
  MARKET: 'MKT', CENTER: 'CTR', CENTRE: 'CTR', SAVINGS: 'SVGS', OUTFITTERS: 'OUTFIT', ANTIQUES: 'ANTIQ.', SPIRITS: 'SPIRIT', TRADING: 'TRADE',
  GROCERY: 'GROCER', CONVENIENCE: 'CONV.', BOUTIQUE: 'BTQ', SOUVENIRS: 'GIFTS', RENTALS: 'RENT', FIREARMS: 'ARMS', SPORTING: 'SPORT', SPORTS: 'SPORT', CLINIC: 'CLINIC' };
const ICON_W = 9, ICON_GAP = 1;
// the board's size (art px) for some lines: frame 1 round, a margin of 1 where the face's effect doesn't fill it
function boardOf(lines, fk, icon) {
  const Ls = lines.map((t) => lineMask(t, fk)), F = FACES[fk], [, pt, , pb] = PAD[F.fx] || [0, 0, 0, 0];
  const cw = Math.max(...Ls.map((q) => q.w)), ch = Ls.reduce((s, q) => s + q.h, 0) + (Ls.length - 1);
  const inner = Math.max(icon ? ICON_W : 0, ch + Math.max(0, 1 - pt) + Math.max(0, 1 - pb));
  return { cw, h: inner + 2, Ls };
}
const room = (wArt, icon) => wArt - 4 - (icon ? ICON_W + ICON_GAP + 1 : 0);
// the best split of words in two lines (both fit; the longer of the two the shortest it can be)
function split2(words, fk, R) {
  let best = null;
  for (let k = 1; k < words.length; k++) {
    const a = words.slice(0, k).join(' '), b = words.slice(k).join(' '), wa = lineWidth(a, fk), wb = lineWidth(b, fk);
    if (wa > R || wb > R) continue;
    const m = Math.max(wa, wb);
    if (!best || m < best.m) best = { m, lines: [a, b] };
  }
  return best && best.lines;
}
// fit a text into a board wArt art px wide: one line in its face (with the icon), two lines, without the icon, then
// the civic face, then abbreviated trade words, then words dropped from the end - never a smaller letter
export function layoutSign(text, wArt, o = {}) {
  const fk0 = FACES[o.face] ? o.face : 'civic', maxLines = o.lines || 2, icon0 = o.icon || null;
  const key = [text, wArt, fk0, maxLines, icon0].join('|');
  let L = LAYOUTS.get(key);
  if (L) return L;
  const t0 = String(text || '').replace(/\s+/g, ' ').trim();
  const faces = [...new Set([fk0, 'civic', 'small'])].filter((f) => f !== 'civic' || fk0 !== 'small');
  const tryText = (t) => {
    const words = t.split(' ');
    for (const fk of faces) for (const icon of icon0 ? [icon0, null] : [null]) {
      const R = room(wArt, icon);
      if (R < 6) continue;
      if (lineWidth(t, fk) <= R) return { face: fk, lines: [t], icon };
      if (maxLines > 1 && words.length > 1) { const two = split2(words, fk, R); if (two) return { face: fk, lines: two, icon }; }
    }
    return null;
  };
  let r = tryText(t0);
  if (!r) { const ab = t0.split(' ').map((q) => ABBR[q] || q).join(' '); if (ab !== t0) r = tryText(ab); }
  if (!r) {
    // words left out, as few as will do: the name's first word and the trade word at the end kept the longest ('&' joins
    // its neighbours: TACKLE & BAIT is one), then the trade words alone
    const ws = t0.replace(/ & /g, '\u0001').split(' ').map((q) => (ABBR[q] || q).replace(/\u0001/g, ' & '));
    for (let k = ws.length - 1; k >= 1 && !r; k--) {
      const cands = k >= 2 ? [[ws[0], ...ws.slice(ws.length - k + 1)], ws.slice(ws.length - k)] : [ws.slice(ws.length - 1), [ws[0]]];
      for (const c of cands) if (!r) r = tryText(c.join(' '));
    }
    if (!r) {   // (one word too long for the board: its letters cut, last resort - the test checks no world name gets here)
      const fk = faces[faces.length - 1], R = room(wArt, null);
      let w = ws[ws.length - 1] || '';
      while (w.length > 1 && lineWidth(w, fk) > R) w = w.slice(0, -1);
      r = { face: fk, lines: [w], icon: null, cut: true };
    }
  }
  const B = boardOf(r.lines, r.face, r.icon);
  L = { ...r, w: wArt, h: B.h, cw: B.cw };
  if (LAYOUTS.size > 3000) LAYOUTS.clear();
  LAYOUTS.set(key, L);
  return L;
}
const LAYOUTS = new Map();

// ---- colour ---------------------------------------------------------------------------------------------------------
export const rgbOf = (c) => (Array.isArray(c) ? c : [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)]);
const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
export const luminance = (c) => { const [r, g, b] = rgbOf(c); return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b); };
export function contrast(a, b) { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
// a palette made legible: the ink black or white when its own falls short of 4.5:1, then the panel moved away from the
// ink until it reaches it (a mid-tone panel neither black nor white reads on)
// (a Marquee outline: dark round light letters, light round dark ones - against the ink, whatever the panel)
const outlineOf = (p, i) => (luminance(i) > 0.25 ? mix(p, [0, 0, 0], 0.7) : [252, 246, 230]);
export function legible(P) {
  if (P.oAuto) P.o = outlineOf(P.p, P.i);
  if (contrast(P.i, P.p) >= 4.5) return P;
  const dk = [20, 18, 24], lt = [250, 248, 240];
  P.i = contrast(dk, P.p) > contrast(lt, P.p) ? dk : lt;
  for (let k = 0.06; contrast(P.i, P.p) < 4.5 && k < 1; k += 0.06) P.p = shade(P.p, P.i === dk ? 0.06 : -0.06);
  if (P.oAuto) P.o = outlineOf(P.p, P.i);
  return P;
}
const mix = (c, d, k) => c.map((v, i) => Math.round(v + (d[i] - v) * k));
const shade = (c, k) => (k < 0 ? mix(c, [0, 0, 0], -k) : mix(c, [255, 255, 255], k));
const light = (c) => luminance(c) > 0.3;

// ---- the icon tiles (9 x 9 art px, after SI1 / BF2; '#' the icon, '+' its accent, '*' its dark, '.' the tile) ------
export const ICONS = {
  cross: '.........|...###...|...###...|.#######.|.#######.|.#######.|...###...|...###...|.........',
  hosp: '.........|.##...##.|.##...##.|.##...##.|.#######.|.##...##.|.##...##.|.##...##.|.........',
  pill: '.........|.....###.|....#++##|...#++###|..#++###.|.#++###..|.#++##...|..###....|.........',
  washer: '#########|#.+.*...#|#########|#..***..#|#.*+++*.#|#.*+++*.#|#.*+++*.#|#..***..#|#########',
  balls: '.........|.###.###.|#+++#+++#|#+++#+++#|.###.###.|...###...|..#+++#..|..#+++#..|...###...',
  sight: '....#....|..#####..|.#..#..#.|.#.....#.|####.####|.#.....#.|.#..#..#.|..#####..|....#....',
  hammer: '.........|.######..|.#######.|.######..|...**....|...**....|...**....|...**....|...**....',
  cup: '...+.+...|..+.+....|.........|.######..|.#++++###|.#++++#.#|.#++++###|..####...|.#######.',
  burger: '.........|..#####..|.##+#+##.|#########|+++++++++|*********|#########|.#######.|.........',
  columns: '....#....|..#####..|.#######.|.........|.#.#.#.#.|.#.#.#.#.|.#.#.#.#.|.........|#########',
  scissors: '.#.....#.|..#...#..|...#.#...|....#....|...#.#...|.###.###.|#..#.#..#|#..#.#..#|.##...##.',
  glass: '#########|.#+++++#.|..#+++#..|...#+#...|....#....|....#....|....#....|....#....|..#####..',
  mug: '.+++++...|.#####...|.#***####|.#***#..#|.#***#..#|.#***####|.#***#...|.#####...|.........',
  bottle: '....#....|...###...|...###...|..#####..|.#######.|.#+++++#.|.#+++++#.|.#######.|.#######.',
  hook: '....##...|....#.#..|....#....|....#....|.#..#....|.#..#....|.#..#....|..##.....|.........',
  star: '....#....|....#....|...###...|#########|.#######.|..#####..|..##.##..|.##...##.|.#.....#.',
  book: '.........|.###.###.|#+++#+++#|#+++#+++#|#+++#+++#|#+++#+++#|#+++#+++#|.###.###.|....#....',
  dumbbell: '.........|.........|##.....##|##.....##|#########|##.....##|##.....##|.........|.........',
  pump: '.#####...|.#+++#.#.|.#+++#..#|.#####..#|.#####..#|.#####.#.|.#####...|.#####...|#######..',
  vinyl: '..#####..|.#######.|###***###|##*#+#*##|##*+++*##|##*#+#*##|###***###|.#######.|..#####..',
};

// ---- the trades: face, sibling palettes (panel, ink[, outline]), icon and its tile (bg, icon, accent, dark), how
// the board is lit after dark: 'panel' a lightbox, 'ink' lit letters, 'neon' tubes, 'flood' lamps on it --------------
const N = (h) => ({ p: '#16141e', i: h, neon: true });   // (a neon palette: tubes of hue h on a dark backing)
export const TRADES = {
  clinic: { face: 'civic', icon: 'cross', tile: ['#22805a', '#f6f6f0'], lit: 'panel', pal: [['#f4f2ea', '#1e6e46'], ['#eef3ef', '#185a3a'], ['#1e6e46', '#f4f2ea']] },
  hospital: { face: 'civic', icon: 'hosp', tile: ['#f4f2ea', '#c8282c'], lit: 'panel', pal: [['#f4f2ea', '#a8202a'], ['#f0f0ec', '#1d3a6a']] },
  pharmacy: { face: 'civic', icon: 'pill', tile: ['#f4f2ea', '#2a7a4e', '#f4f2ea'], lit: 'panel', pal: [['#2a7a4e', '#f6f6f0'], ['#f4f2ea', '#22663f'], ['#1a5e80', '#f6f6f0']] },
  laundromat: { face: 'civic', icon: 'washer', tile: ['#eef2f4', '#3a4048', '#5a9ad8', '#24549a'], lit: 'panel', pal: [['#24549a', '#f6f6f0'], ['#f2f4f6', '#24549a'], ['#1e6a8a', '#ffffff']] },
  office: { face: 'civic', lit: 'panel', pal: [['#232838', '#ecd696'], ['#1e3a5e', '#f0ece4'], ['#f0ece4', '#1e2a3a'], ['#16202c', '#f0ece4']] },
  post: { face: 'civic', lit: 'panel', pal: [['#1e3a8a', '#f6f6f0'], ['#f4f2ea', '#1e3a8a']] },
  police: { face: 'civic', lit: 'panel', pal: [['#1d3a8a', '#fafaf0'], ['#f4f4f0', '#1d3a8a']] },
  fire: { face: 'civic', lit: 'panel', pal: [['#a8282c', '#faf0e6'], ['#f4f2ea', '#a8282c']] },
  school: { face: 'civic', lit: 'panel', pal: [['#2a4a3a', '#f0ece0'], ['#7a2a24', '#f6eedc']] },
  gas: { face: 'civic', icon: 'pump', tile: ['#f4f2ea', '#c42a30', '#f4f2ea'], lit: 'panel', pal: [['#c42a30', '#faf6ec'], ['#f4f2ea', '#b0242a'], ['#1e5aa0', '#f6f6f0']] },
  parking: { face: 'civic', lit: 'panel', pal: [['#1e3a5e', '#fafaf0'], ['#1e4a8a', '#ffffff']] },
  sports: { face: 'civic', icon: 'dumbbell', tile: ['#f4f2ea', '#1e2e5a'], lit: 'panel', pal: [['#1e2e5a', '#f6f6f0'], ['#f4f2ea', '#1e2e5a'], ['#a8202a', '#ffffff']] },
  surf: { face: 'civic', lit: 'panel', pal: [['#1f6aa0', '#ffffff'], ['#f2e8c8', '#1f5a8a'], ['#1e7a72', '#fff6e0']] },
  marine: { face: 'civic', icon: 'hook', tile: ['#f0ece4', '#1e4a7a'], lit: 'panel', pal: [['#2a5a8a', '#fff2c0'], ['#f0ece4', '#1e4a7a']] },
  gallery: { face: 'civic', lit: 'flood', pal: [['#f2f0ea', '#1e1e24'], ['#101014', '#f0f0ec']] },
  mart: { face: 'block', lit: 'panel', pal: [['#f4f2ea', '#b0282e'], ['#b0282e', '#faf6ec'], ['#2a6a3a', '#faf6ec'], ['#1e4a8a', '#faf6ec'], ['#e8c040', '#22201f']] },
  grocer: { face: 'block', lit: 'panel', pal: [['#2a6a3a', '#f6f0d8'], ['#f4f0e0', '#2a5a2a'], ['#8a2a1e', '#f6ecd8']] },
  liquor: { face: 'block', icon: 'bottle', tile: ['#1e1a18', '#2a6a3a', '#e8c070'], lit: 'ink', pal: [['#f2e8d0', '#8a1e24'], ['#8a1e24', '#f6ecd8'], ['#1e1a18', '#e8c070']] },
  pawn: { face: 'block', icon: 'balls', tile: ['#22201f', '#5a4a1a', '#e8c040'], lit: 'ink', pal: [['#e8c040', '#22201f'], ['#22201f', '#e8c040'], ['#f0d860', '#3a1e10']] },
  gunshop: { face: 'block', icon: 'sight', tile: ['#2a2c34', '#e8e2d0'], lit: 'ink', pal: [['#2a2c34', '#f4f4f0'], ['#3a3a2e', '#e8e2d0'], ['#1e1e22', '#e8c040']] },
  hardware: { face: 'block', icon: 'hammer', tile: ['#f2ead2', '#3a3a40', '#c8402a', '#8a5a30'], lit: 'ink', pal: [['#285440', '#f2ead2'], ['#e8c040', '#22201f'], ['#b0381e', '#faf4e6']] },
  auto: { face: 'block', lit: 'panel', pal: [['#2a4a7a', '#f0ece0'], ['#e8c040', '#1e1e22'], ['#c42a30', '#faf6ec']] },
  outdoor: { face: 'block', lit: 'ink', pal: [['#3e4a2a', '#ece4c8'], ['#5a4a32', '#f2e8cc'], ['#e8dcc0', '#3e3a2a']] },
  tackle: { face: 'block', icon: 'hook', tile: ['#f0ece4', '#1e4a7a'], lit: 'ink', pal: [['#1e5a8a', '#ffffff'], ['#f0ece4', '#1e4a7a'], ['#1e6a7a', '#ffffff']] },
  street: { face: 'block', lit: 'ink', pal: [['#1e1e24', '#f0e040'], ['#f0e040', '#1e1e24'], ['#c42a1a', '#ffffff']] },
  butcher: { face: 'block', lit: 'panel', pal: [['#f4f2ea', '#a8202a'], ['#a8202a', '#f8f0e6']] },
  diner: { face: 'marquee', icon: 'burger', tile: ['#f8eccc', '#c88a3a', '#3a9a3a', '#5a2a1a'], lit: 'ink', pal: [['#b0282e', '#f8eccc', '#3a0a0e'], ['#17666a', '#f8eccc', '#0a2e30'], ['#f2e4b8', '#a8202a', '#fff8e6'], ['#1e3a6a', '#ffe8a0', '#0a1830']] },
  icecream: { face: 'marquee', lit: 'ink', pal: [['#f4c8d8', '#7a1e40', '#fff6fa'], ['#b8e4dc', '#1e4a5a', '#f6fffc'], ['#b82858', '#fff4f8', '#4a0a20']] },
  cinema: { face: 'marquee', icon: 'star', tile: ['#2a0a10', '#ffd060'], lit: 'ink', bulbs: true, pal: [['#7a1e2a', '#ffe8a0', '#2a0a10'], ['#1e1a3a', '#ffe080', '#0a0818']] },
  arcade: { face: 'marquee', icon: 'star', tile: ['#1c1a2e', '#78e6ff'], lit: 'ink', bulbs: true, pal: [['#1c1a2e', '#78e6ff', '#08060e'], ['#3a1a5a', '#ffe060', '#10061e']] },
  bank: { face: 'serif', icon: 'columns', tile: ['#e2dac6', '#5a5244'], lit: 'flood', pal: [['#d8cfbc', '#2a2622'], ['#1e3a2e', '#ecd696'], ['#e2dac6', '#1e2a3a']] },
  hotel: { face: 'serif', lit: 'ink', pal: [['#232838', '#ecd696'], ['#7a1e2a', '#ffd68c'], ['#f0ece4', '#2a2622']] },
  civic: { face: 'serif', lit: 'flood', pal: [['#d8cfbc', '#2a2622'], ['#5a1e24', '#ecd696'], ['#2a3a2a', '#ecd696']] },
  jeweller: { face: 'serif', lit: 'ink', pal: [['#16202c', '#ecd696'], ['#1e3a2e', '#ecd696']] },
  tavern: { face: 'serif', icon: 'mug', tile: ['#2a1e14', '#e8c870', '#f6f0e0', '#c88a2a'], lit: 'ink', pal: [['#1e3a2a', '#e8c870'], ['#3a1e14', '#f0d890'], ['#2a1e14', '#e8c870']] },
  barber: { face: 'serif', icon: 'scissors', tile: ['#f2ece0', '#1e2a5a'], lit: 'panel', pal: [['#f2ece0', '#1e2a5a'], ['#1e2a5a', '#f2ece0'], ['#7a1e24', '#f2ece0']] },
  books: { face: 'serif', icon: 'book', tile: ['#f0e8d4', '#5a2a1e', '#e8d8b0'], lit: 'flood', pal: [['#2a3a2a', '#ecdcae'], ['#5a2a1e', '#f2e2b8'], ['#f0e8d4', '#3a2a1e']] },
  restaurant: { face: 'serif', lit: 'ink', pal: [['#1e2a20', '#ecd696'], ['#5a1e24', '#f2e2b8'], ['#f0ece4', '#5a1e24']] },
  boutique: { face: 'script', lit: 'ink', pal: [['#f2ece0', '#3a1e40'], ['#4a1e4a', '#f6e8f0'], ['#1c1c24', '#ecce78']] },
  salon: { face: 'script', icon: 'scissors', tile: ['#f6eef0', '#5a1e4a'], lit: 'ink', pal: [['#f6eef0', '#5a1e4a'], ['#5a2a5a', '#fbeef4'], ['#1e2a3a', '#f6e6d6']] },
  cafe: { face: 'script', icon: 'cup', tile: ['#f2ead8', '#1e5a5a', '#a07a5a'], lit: 'ink', pal: [['#f2ead8', '#1e5a5a'], ['#4a3020', '#f2e4c8'], ['#1e4a3e', '#f2ead8']] },
  bakery: { face: 'script', icon: 'cup', tile: ['#f6ecd8', '#7a4a20', '#c88a4a'], lit: 'ink', pal: [['#f6ecd8', '#6a3a18'], ['#7a4a20', '#fbf0dc']] },
  florist: { face: 'script', lit: 'ink', pal: [['#f4f0e4', '#2a5a2a'], ['#2f6a4e', '#f8f0e0'], ['#f6e6ec', '#7a1e40']] },
  bar: { face: 'neon', icon: 'glass', lit: 'neon', pal: [N([255, 190, 60]), N([70, 230, 255]), N([255, 80, 150]), N([110, 255, 150])] },
  club: { face: 'neon', icon: 'star', lit: 'neon', pal: [N([255, 60, 200]), N([170, 100, 255]), N([70, 230, 255])] },
  motel: { face: 'neon', lit: 'neon', pal: [N([255, 80, 150]), N([255, 110, 70]), N([70, 230, 255])] },
  records: { face: 'neon', icon: 'vinyl', lit: 'neon', pal: [N([255, 80, 150]), N([255, 190, 60])] },
  tattoo: { face: 'neon', lit: 'neon', pal: [N([255, 70, 90]), N([110, 255, 150])] },
  roadhouse: { face: 'neon', icon: 'mug', lit: 'neon', pal: [N([255, 110, 70]), N([255, 190, 60])] },
};
export const TRADE_KEYS = Object.keys(TRADES);

// a neon tube's core: white-hot, tinted with its hue
export const hotOf = (c) => c.map((q) => Math.min(255, Math.round(q * 0.35 + 170)));
// a trade's sign style, its palette picked among the siblings by seed (two clinics differ, both read as clinics)
export function signStyle(trade, seed = 0) {
  const T = TRADES[trade] || TRADES.office, k = ((seed % T.pal.length) + T.pal.length) % T.pal.length, q = T.pal[k];
  return { trade: TRADES[trade] ? trade : 'office', face: T.face, pal: palOf(q, T), icon: T.icon || null, lit: T.lit, bulbs: !!T.bulbs, k };
}
// a palette's full set of colours from its panel and ink (rgb arrays)
export function palOf(q, T = {}) {
  if (q.neon) { const h = rgbOf(q.i); return { p: rgbOf(q.p), i: hotOf(h), h, f: [40, 34, 48], neon: true, t: T.tile ? T.tile.map(rgbOf) : [[22, 20, 30], h, hotOf(h), [10, 8, 14]] }; }
  const p = rgbOf(Array.isArray(q) ? q[0] : q.p), i = rgbOf(Array.isArray(q) ? q[1] : q.i), o = Array.isArray(q) && q[2] ? rgbOf(q[2]) : null;
  const L = light(p);
  return { p, i, o: o || outlineOf(p, i), oAuto: !o, s: shade(p, L ? -0.32 : -0.5), l: shade(p, 0.45), f: shade(p, L ? -0.45 : -0.4),
    t: (T.tile || [Array.isArray(q) ? q[0] : q.p, Array.isArray(q) ? q[1] : q.i]).map(rgbOf) };
}

// ---- which trade a front is -----------------------------------------------------------------------------------------
// (by its name's words first - the most telling - then the shop's POI kind, its store's trade, the window's kind, the
// building's archetype)
const WORDS = [
  [/\bCLINIC|MEDICAL|URGENT CARE|HEALTH|INFIRMARY|WELLNESS/, 'clinic'], [/\bHOSPITAL/, 'hospital'], [/PHARMAC|\bDRUG|APOTHECAR|CHEMIST/, 'pharmacy'],
  [/LAUNDR|\bSUDS\b|\bWASH|CLEANERS/, 'laundromat'], [/\bPAWN|\bLOANS?\b|CASH 4/, 'pawn'], [/\bGUN|FIREARM|\bARMS\b|AMMO|\bSIGHTS\b|\bRANGE\b/, 'gunshop'],
  [/HARDWARE|\bTOOL|\bNAIL\b|LUMBER/, 'hardware'], [/LIQUOR|SPIRITS|\bBEER WINE/, 'liquor'], [/\bMOTEL|MOTOR LODGE|MOTOR INN/, 'motel'],
  [/SNACK|DINER|BURGER|\bGRILL|FRIES|HOT DOG|PIZZA|TACO|\bEATS?\b|BBQ|CHICKEN|SHACK/, 'diner'], [/ICE CREAM|SCOOP|FROZEN|GELATO|CREAMERY/, 'icecream'],
  [/NOODLE|\bWOK\b|SUSHI|RAMEN|DRAGON|BISTRO|TRATTORIA|KITCHEN|STEAK|OYSTER/, 'restaurant'], [/CINEMA|THEATER|THEATRE|PICTURE|DRIVE-IN|MOVIES/, 'cinema'],
  [/\bBOWL|\bLANES\b/, 'cinema'], [/ARCADE|\bGAMES\b/, 'arcade'], [/\bBANK|SAVINGS|\bTRUST\b|CREDIT UNION/, 'bank'], [/\bHOTEL|\bSUITES\b|\bINN\b/, 'hotel'],
  [/TAVERN|\bPUB\b|\bALE\b|WINERY|WINE BAR|SALOON|BREWERY/, 'tavern'], [/TATTOO|\bINK\b/, 'tattoo'], [/RECORDS|VINYL|\bSPIN\b/, 'records'],
  [/\bBAR\b|LOUNGE|\bTAP\b|COCKTAIL|KARAOKE|\bJAZZ/, 'bar'], [/\bCLUB\b|DISCO|NIGHTCLUB/, 'club'], [/BOUTIQUE|COUTURE|FASHION|VELVET|ATELIER/, 'boutique'],
  [/BAKERY|\bBAKE|PASTRY|DONUT|BREAD|PRETZEL/, 'bakery'], [/CAFE|COFFEE|ESPRESSO|\bBEAN|\bBREW|ROAST|\bTEA\b/, 'cafe'],
  [/SALON|BEAUTY|\bNAILS\b|\bHAIR|SHEARS|\bSPA\b/, 'salon'], [/BARBER/, 'barber'], [/FLORIST|FLOWER|BLOOM|PETAL/, 'florist'], [/\bBOOK/, 'books'],
  [/JEWEL|DIAMOND|BRILLIANT|\bGOLD\b/, 'jeweller'], [/TACKLE|\bBAIT/, 'tackle'], [/\bSURF/, 'surf'], [/SKATE|KICKS|KICKFLIP|SNEAKER/, 'street'],
  [/WORKWEAR|SURPLUS|OUTFITTER|TRADING POST|\bFEED\b|PROSPECTOR/, 'outdoor'], [/SPORT|FITNESS|\bGYM\b/, 'sports'], [/BUTCHER|\bMEATS?\b/, 'butcher'],
  [/GROCER|MARKET|PRODUCE|\bFARM\b|FISH/, 'grocer'], [/\bDELI\b|\bMART\b|BODEGA|QUICK|\bSTOP\b|24-7|GENERAL STORE|CONVENIENCE/, 'mart'],
  [/\bAUTO|MOTORS?\b|GARAGE|TIRE|REPAIR|PAINT|BODY SHOP|SALVAGE/, 'auto'], [/\bFUEL|\bGAS\b|PETROL|SERVICE STATION/, 'gas'], [/PARKING/, 'parking'],
  [/POLICE|SHERIFF|PRECINCT/, 'police'], [/\bFIRE\b/, 'fire'], [/SCHOOL|ACADEMY|COLLEGE/, 'school'], [/\bPOST OFFICE/, 'post'],
  [/COURT|CITY HALL|MUSEUM|LIBRARY|ASSAY|TOWN HALL/, 'civic'], [/GALLERY|STUDIO/, 'gallery'], [/MARINA|CHARTER|RENTAL|BOATS?\b|DIVE\b/, 'marine'],
  [/\bLODGE\b/, 'hotel'],
];
const KIND = { hospital: null, pharmacy: 'pharmacy', convenience: 'mart', grocery: 'grocer', market: 'grocer', fishmarket: 'grocer', farmstand: 'grocer', fruitstand: 'grocer',
  butcher: 'butcher', coffee: 'cafe', snack: 'diner', bank: 'bank', pawn: 'pawn', fence: 'pawn', barber: 'barber', clothing: 'boutique', gunshop: 'gunshop',
  sports: 'sports', hardware: 'hardware', club: 'bar', marina: 'marine', charter: 'marine', rental: 'marine', tackle: 'tackle', cinema: 'cinema', bowling: 'cinema',
  courthouse: 'civic', police: 'police', gasstation: 'gas', garage: 'auto', paint: 'auto', salvage: 'auto', roadhouse: 'roadhouse', lodge: 'hotel', winery: 'tavern',
  assay: 'civic', huntcamp: 'outdoor', trapper: 'outdoor', smuggler: 'marine', reception: 'office', delivery: null };
const STORE = { books: 'books', records: 'records', salon: 'salon', laundry: 'laundromat', florist: 'florist', clothes: 'boutique', dept: 'hotel', thrift: 'street',
  kicks: 'street', kickflip: 'street', surf: 'surf', velvet: 'boutique', afterglow: 'boutique', surplus: 'outdoor', workwear: 'outdoor', feed: 'outdoor', bar: 'bar',
  arcade: 'arcade', gallery: 'gallery', liquor: 'liquor', pawn: 'pawn', diner: 'diner', cafe: 'cafe', lobby: 'office', mart: null };
const SHOPK = { mart: 'mart', cafe: 'cafe', diner: 'diner', bar: 'bar', pawn: 'pawn', liquor: 'liquor', arcade: 'arcade', books: 'books', records: 'records',
  laundry: 'laundromat', clothes: 'boutique', florist: 'florist', gallery: 'gallery', salon: 'salon', lobby: null };
const ARCH = { hotel: 'hotel', bank: 'bank', court: 'civic', cityhall: 'civic', theatre: 'cinema', club: 'club', tattoo: 'tattoo', arcade: 'arcade', gas: 'gas',
  liquor: 'liquor', diner: 'diner', snackbar: 'diner', beachbar: 'bar', restaurant: 'restaurant', cafe: 'cafe', boutique: 'boutique', showroom: 'auto', gym: 'sports',
  office: 'office', glass: 'office', terminal: 'office', condo: 'office', hospital: 'hospital', police: 'police', fire: 'fire', school: 'school', garage: 'auto',
  bait: 'tackle', charter: 'marine', outfitter: 'outdoor', mart: 'mart', grandstand: 'sports', pits: 'auto', poolhouse: 'sports' };
export function tradeOf({ name, kind, store, shop, A } = {}) {
  const n = String(name || '').toUpperCase();
  if (kind === 'hospital') return /HOSPITAL|MEDICAL CENTER/.test(n) ? 'hospital' : 'clinic';
  for (const [re, t] of WORDS) if (re.test(n)) return t;
  if (store && STORE[store]) return STORE[store];
  if (kind && KIND[kind]) return KIND[kind];
  if (shop && SHOPK[shop]) return SHOPK[shop];
  if (A && ARCH[A]) return ARCH[A];
  return shop === 'lobby' ? 'office' : 'mart';
}

// ---- painting -------------------------------------------------------------------------------------------------------
// how strong a board glows after dark, by how it is lit (emissive strength; the bake keeps it, the Lighter scales it)
// [the light part, the dark part, the halo]: whichever of panel and ink is the lighter carries the glow, the darker
// stays dark, so the words keep their contrast after dark (a lightbox's dark letters on its lit face; lit letters on a
// dark board; a floodlit board lit all over, softly)
const GLOW = { panel: [96, 0, 0], ink: [150, 12, 0], neon: [200, 0, 120], flood: [56, 20, 0], none: [0, 0, 0] };
// paint a laid-out board (L: layoutSign's, P: a palette, o: { lit, night 0..1, bulbs }) with its top-left at world
// (x0, y0) - snapped to even px - each art pixel a 2 x 2 block
export function paintBoard(put, L, P, x0, y0, o = {}) {
  x0 = Math.round(x0 / 2) * 2; y0 = Math.round(y0 / 2) * 2;
  const wA = L.w, hA = L.h, lit = o.lit === false ? 'none' : o.lit || 'ink', night = o.night ?? 0.7, G = GLOW[lit] || GLOW.ink;
  const art = new Array(wA * hA);
  const emi = new Array(wA * hA).fill(null);
  const k = 0.55 + night * 0.65, panelLit = luminance(P.p) >= luminance(P.i);
  const pe = P.neon || !G[0] ? null : [...P.p, Math.min(200, Math.round((panelLit ? G[0] * (lit === 'ink' ? 0.45 : 1) : G[1]) * k))];
  const ie = !G[0] ? null : [...P.i, Math.min(200, Math.round((P.neon ? G[0] : panelLit ? G[1] : G[0]) * k))];
  for (let y = 0; y < hA; y++) for (let x = 0; x < wA; x++) {
    const edge = x === 0 || y === 0 || x === wA - 1 || y === hA - 1;
    let c = edge ? P.f : y === 1 && !P.neon ? shade(P.p, light(P.p) ? 0.06 : 0.1) : P.p;
    let e = edge ? null : pe;
    if (edge && o.bulbs && (x + y) % 2 === 0) { c = (x + y) % 4 === 0 ? [255, 244, 200] : [255, 210, 120]; e = [255, 220, 150, 170]; }
    if (edge && P.neon) { c = mix(P.h, [255, 255, 255], 0.25); e = [...P.h, 150]; }
    art[y * wA + x] = c; emi[y * wA + x] = e;
  }
  // the icon's tile at the left, centred down the board
  let tx = 2;
  if (L.icon && ICONS[L.icon]) {
    const rows = ICONS[L.icon].split('|'), T = P.t || [P.p, P.i], iy = Math.floor((hA - ICON_W) / 2);
    const tc = { '.': T[0], '#': T[1], '+': T[2] || shade(T[1], 0.4), '*': T[3] || shade(T[1], -0.4) };
    for (let y = 0; y < ICON_W; y++) for (let x = 0; x < ICON_W; x++) {
      const ch = rows[y][x], c = tc[ch] || T[0];
      art[(iy + y) * wA + tx + x] = c;
      emi[(iy + y) * wA + tx + x] = lit === 'none' ? null : [...c, P.neon ? (ch === '.' ? 0 : 160) : Math.round((luminance(c) >= 0.3 ? G[0] * 0.8 : 8) * k)];
    }
    tx += ICON_W + ICON_GAP + 1;
  }
  // the lines, centred in what's left, stacked
  const Ls = L.lines.map((t) => lineMask(t, L.face)), F = FACES[L.face], [, pt, , pb] = PAD[F.fx] || [0, 0, 0, 0];
  const ch = Ls.reduce((s, q) => s + q.h, 0) + (Ls.length - 1), mt = Math.max(0, 1 - pt), mb = Math.max(0, 1 - pb);
  let ly = 1 + mt + Math.floor((hA - 2 - mt - mb - ch) / 2);
  const roleC = [null, P.i, P.s, P.o, P.h || P.i, P.l], ink = P.i;
  for (const Q of Ls) {
    const lx = tx + Math.floor((wA - 2 - tx - Q.w) / 2) + (L.icon ? 0 : 0);
    for (let y = 0; y < Q.h; y++) for (let x = 0; x < Q.w; x++) {
      const r = Q.m[y * Q.w + x];
      if (!r) continue;
      const X = lx + x, Y = ly + y;
      if (X < 1 || Y < 1 || X >= wA - 1 || Y >= hA - 1) continue;
      let c = roleC[r] || ink, e = null;
      if (r === 4) { c = mix(P.p, P.h, 0.62); e = lit === 'none' ? null : [...P.h, G[2]]; }
      else if (r === 1) e = ie && ie[3] ? ie : null;
      else if (r === 3 || r === 5) e = pe && luminance(c) >= 0.3 ? [...c, pe[3]] : null;   // (a light outline or lip lit as its panel is)
      art[Y * wA + X] = c; emi[Y * wA + X] = e;
    }
    ly += Q.h + 1;
  }
  for (let y = 0; y < hA; y++) for (let x = 0; x < wA; x++) {
    const c = art[y * wA + x], e = emi[y * wA + x];
    for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) put(x0 + x * 2 + i, y0 + y * 2 + j, c, e);
  }
  return { x: x0, y: y0, w: wA * 2, h: hA * 2 };
}
// a word or line without a board (a portico's inscription, a tube on a dark wall, a station's name): its pixels in
// world px from (x0, y0), snapped even; colours by role
export function paintLine(put, text, fk, x0, y0, cols, emis = {}) {
  x0 = Math.round(x0 / 2) * 2; y0 = Math.round(y0 / 2) * 2;
  const Q = lineMask(text, fk);
  for (let y = 0; y < Q.h; y++) for (let x = 0; x < Q.w; x++) {
    const k = Q.m[y * Q.w + x];
    if (!k || !cols[k]) continue;
    for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) put(x0 + x * 2 + i, y0 + y * 2 + j, cols[k], emis[k] || null);
  }
  return { w: Q.w * 2, h: Q.h * 2 };
}
// a board's height in world px for a sign of this text over a band w world px wide (statics' layout and makeBuilding
// agree on it: a two-line board raises the shop's floor)
export function boardFor(sign, wPx) {
  return layoutSign(sign.text || '', Math.floor(wPx / 2), { face: sign.face || 'civic', icon: sign.icon || null, lines: sign.maxLines || 2 });
}
