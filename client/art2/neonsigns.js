// Art v2: the night's neon (concepts R1-C/E, AT1-A, D8 nightlife, B7's nightclub). Big neon signs on the fronts of the
// nightlife district's clubs, bars and shops - invented names in tubes of buzzing colour with an icon beside them, a
// tube along the cornice - that glow and light the pavement; the clubs, bars and arcades elsewhere get one too.
//   nightFront(spec, ctx) -> bool   decides a front's neon (spec.neonSigns, spec.trim) and pushes its lights
//     ctx: { w, st (district style), A (archetype), kind (the shop kind), name, seed, lights, rnd }
//   paintSigns(G, spec)             paints spec.neonSigns onto makeBuilding(spec)'s south face (G.ax, G.ay: the
//                                   footprint's south-west corner; a face pixel at height v is at row G.ay - v)
//   signsFor(...)                   (the same choice, for tests: which buildings get what)
// Names and icons are original (no real venues, brands or logos). Pure and worker-safe.
import { drawText, textWidth } from './font.js';
import { buildingH } from './buildings.js';

export const NEON_COLS = [[255, 60, 200], [70, 230, 255], [255, 80, 150], [170, 100, 255], [255, 190, 60], [110, 255, 150], [255, 110, 70]];
// what a sign says, by what's behind it (the club's own name when it has one)
export const NEON_WORDS = {
  bar: ['LAST CALL', 'NITE OWL', 'LUCKY SEVEN', 'MOONDOG', 'TWO MOONS', 'GLOWBAR', 'DIZZY', 'HALO BAR', 'COCKTAILS', 'TAPROOM'],
  club: ['DANCE', 'AFTERHOURS', 'NEON NIGHTS', 'STARDUST', 'VOLT', 'LIVE DJ'],
  arcade: ['ARCADE', 'PLAY', 'HI SCORE', 'GAME ON'],
  mart: ['OPEN LATE', '24 HRS', 'SNACKS'],
  diner: ['EAT', 'OPEN 24', 'DINER'],
  hotel: ['VACANCY', 'HOTEL', 'ROOMS'],
  lounge: ['LOUNGE', 'KARAOKE', 'LIVE MUSIC', 'JAZZ'],
};
const ICON_OF = { bar: ['glass', 'mug', 'glass', 'moon'], club: ['star', 'note', 'heart', 'moon'], arcade: ['star'], mart: ['star'], diner: ['heart'], hotel: ['moon', 'star'], lounge: ['note', 'glass'] };
const NIGHT_ST = new Set(['nightlife', 'redlight']);
const LIVELY = new Set(['club', 'arcade', 'tattoo', 'nightrow']);

// what kind of sign a front gets (null: none): the nightlife strips' fronts, and the clubs, bars and arcades anywhere
export function signKind(st, A, kind) {
  if (A === 'club' || A === 'tattoo') return 'club';
  if (A === 'arcade' || kind === 'arcade') return 'arcade';
  if (kind === 'bar') return NIGHT_ST.has(st) ? 'bar' : 'lounge';
  if (!NIGHT_ST.has(st)) return null;
  if (A === 'hotel') return 'hotel';
  if (A === 'diner' || kind === 'diner' || kind === 'cafe') return 'diner';
  if (kind === 'mart' || kind === 'liquor' || kind === 'pawn') return 'mart';
  if (A === 'nightrow' || LIVELY.has(A)) return 'bar';
  return kind === 'lobby' ? 'lounge' : 'bar';
}

// the neon a front gets: { text, col, col2, icon, x, v, sx } (x: px from the section's west edge, v: the sign's foot)
export function signsFor(ctx) {
  const { w, st, A, kind, name, rnd } = ctx, H = ctx.H;
  const k = signKind(st, A, kind);
  if (!k || w < 96 || H < 90) return null;
  const pick = (a) => a[Math.min(a.length - 1, Math.floor(rnd() * a.length))];
  const ci = Math.floor(rnd() * NEON_COLS.length), col = NEON_COLS[ci], col2 = NEON_COLS[(ci + 2 + Math.floor(rnd() * 3)) % NEON_COLS.length];
  // the club's own name if it fits, else words of its kind
  const sx = w >= 200 ? 4 : 2, room = w - 16 - 30;
  let text = (k === 'club' || k === 'lounge' || k === 'bar') && name && !/^(BUILDING|SHOP|STORE)$/i.test(name) ? clean(name) : pick(NEON_WORDS[k]);
  if (textWidth(text, { sx, gap: 1 }) > room) text = pick(NEON_WORDS[k].filter((q) => textWidth(q, { sx, gap: 1 }) <= room)) || '';
  if (!text) return null;
  const tw = textWidth(text, { sx, gap: 1 }), sw = tw + 30 + 12, sh = 5 * sx + 12;
  const v = Math.min(H - 20 - sh, 74 + Math.floor(rnd() * 3) * 6);   // over the shopfront, under the cornice
  if (v < 66) return null;
  const x = Math.max(4, Math.min(w - sw - 4, Math.round(w / 2 - sw / 2 + (rnd() - 0.5) * Math.max(0, w - sw - 20) * 0.6)));
  return { text, col, col2, icon: pick(ICON_OF[k]), x, v, sx, w: sw, h: sh, kind: k };
}
const clean = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9 &'!]/g, '').replace(/\s+/g, ' ').trim().slice(0, 16);

export function nightFront(spec, ctx) {
  const H = buildingH(spec);
  const sg = signsFor({ ...ctx, H });
  if (!sg) return false;
  // the small neon plaque the front had is the big sign now
  if (spec.plaques) spec.plaques = spec.plaques.filter((p) => p.bg !== '#1c1a28');
  (spec.neonSigns ||= []).push(sg);
  if (!spec.trim && NIGHT_ST.has(ctx.st) && sg.kind !== 'mart') spec.trim = sg.col2;   // a tube along the cornice
  const L = (c) => c.map((q) => q / 255);
  // the sign's light on the pavement (and the street): big and coloured
  ctx.lights.push([sg.x + sg.w / 2, 18, sg.v + sg.h / 2, 250, L(sg.col), 2.4, 'neon']);
  if (spec.trim === sg.col2) ctx.lights.push([ctx.w / 2, 10, H - 8, 180, L(sg.col2), 1.2, 'neon']);
  return true;
}

// ---- painting -----------------------------------------------------------------------------------------------
// icons on a 12 x 12 grid (drawn at 2 px): stroke points
const ICONS = {
  glass: [[1, 1], [2, 1], [3, 1], [4, 1], [5, 1], [6, 1], [7, 1], [8, 1], [9, 1], [10, 1], [2, 2], [9, 2], [3, 3], [8, 3], [4, 4], [7, 4], [5, 5], [6, 5], [5, 6], [6, 6], [5, 7], [6, 7], [5, 8], [6, 8], [5, 9], [6, 9], [3, 10], [4, 10], [5, 10], [6, 10], [7, 10], [8, 10], [8, 0], [9, -1], [7, 2], [7, 3]],
  mug: [[1, 2], [2, 1], [3, 2], [4, 1], [5, 2], [6, 1], [7, 2], [8, 1], [1, 3], [8, 3], [1, 4], [8, 4], [1, 5], [8, 5], [1, 6], [8, 6], [1, 7], [8, 7], [1, 8], [8, 8], [1, 9], [8, 9], [1, 10], [2, 10], [3, 10], [4, 10], [5, 10], [6, 10], [7, 10], [8, 10], [9, 4], [10, 4], [10, 5], [10, 6], [10, 7], [9, 8], [3, 4], [3, 6], [3, 8], [5, 5], [5, 7], [6, 4]],
  note: [[5, 0], [6, 0], [7, 1], [8, 1], [9, 2], [5, 1], [5, 2], [5, 3], [5, 4], [5, 5], [5, 6], [5, 7], [5, 8], [2, 8], [3, 7], [4, 7], [2, 9], [3, 10], [4, 10], [4, 9], [3, 9], [9, 3], [10, 4]],
  star: [[6, 0], [6, 1], [5, 2], [7, 2], [5, 3], [7, 3], [0, 4], [1, 4], [2, 4], [3, 4], [4, 4], [8, 4], [9, 4], [10, 4], [11, 4], [2, 5], [10, 5], [3, 6], [9, 6], [3, 7], [9, 7], [2, 8], [10, 8], [2, 9], [6, 8], [10, 9], [1, 10], [5, 9], [7, 9], [11, 10], [4, 10], [8, 10]],
  heart: [[2, 1], [3, 1], [4, 2], [5, 3], [6, 3], [7, 2], [8, 1], [9, 1], [1, 2], [10, 2], [0, 3], [11, 3], [0, 4], [11, 4], [0, 5], [11, 5], [1, 6], [10, 6], [2, 7], [9, 7], [3, 8], [8, 8], [4, 9], [7, 9], [5, 10], [6, 10]],
  moon: [[6, 0], [7, 0], [8, 0], [4, 1], [5, 1], [3, 2], [2, 3], [2, 4], [1, 5], [1, 6], [2, 7], [2, 8], [3, 9], [4, 10], [5, 10], [6, 11], [7, 11], [8, 11], [9, 10], [10, 9], [8, 1], [7, 2], [6, 3], [6, 4], [5, 5], [5, 6], [6, 7], [6, 8], [7, 9], [8, 9], [9, 9]],
};
export function paintSigns(G, spec) {
  for (const sg of spec.neonSigns || []) paintSign(G, sg);
  return G;
}
function paintSign(G, sg) {
  const S = [0, 1, 0], { x, v, w, h, col, col2, sx } = sg;
  const X0 = G.ax + x, Y1 = G.ay - v, Y0 = Y1 - h;   // the panel's screen box
  const put = (X, Y, c, e) => { if (G.inside(X, Y) && G.alpha(X, Y)) G.put(X, Y, c, S, G.ay - Y, e, 0); };
  const hot = (c) => c.map((q) => Math.min(255, q * 0.62 + 92));
  // the halo on the wall round it: the sign lights its own facade (faint: the bloom does the rest)
  const R = 14;
  for (let Y = Y0 - R; Y < Y1 + R; Y++) for (let X = X0 - R; X < X0 + w + R; X++) {
    if (!G.inside(X, Y) || !G.alpha(X, Y)) continue;
    const dx = X < X0 ? X0 - X : X >= X0 + w ? X - X0 - w + 1 : 0, dy = Y < Y0 ? Y0 - Y : Y >= Y1 ? Y - Y1 + 1 : 0, d = Math.hypot(dx, dy);
    if (d <= 0 || d >= R) continue;
    const k = 1 - d / R;
    G.glow(X, Y, [col[0], col[1], col[2], Math.round(10 + 60 * k * k)]);
  }
  // the panel: a dark backing with a tube round its edge
  for (let Y = Y0; Y < Y1; Y++) for (let X = X0; X < X0 + w; X++) {
    const e = Y === Y0 || Y === Y1 - 1 || X === X0 || X === X0 + w - 1, e2 = Y === Y0 + 2 || Y === Y1 - 3 || X === X0 + 2 || X === X0 + w - 3;
    if (e) put(X, Y, [26, 20, 34], null);
    else if (e2) put(X, Y, hot(col2), [col2[0], col2[1], col2[2], 170]);
    else put(X, Y, [18, 14, 26], null);
  }
  // the icon (2 px strokes), then the words: a hot core in each tube, the colour round it, the dark panel between
  // the letters (so they read through the bloom)
  const IX = X0 + 7, IY = Y0 + Math.round((h - 24) / 2);
  for (const [px, py] of ICONS[sg.icon] || ICONS.star) for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) put(IX + px * 2 + i, IY + py * 2 + j + 1, (i + j) % 2 ? col2 : hot(col2), [col2[0], col2[1], col2[2], 190]);
  const TX = X0 + 7 + 26, TY = Y0 + 6;
  drawText((px, py) => {
    const core = sx >= 4 ? ((px - TX) % sx === 1 || (px - TX) % sx === 2) && ((py - TY) % sx === 1 || (py - TY) % sx === 2) : true;
    put(px, py, core ? hot(col) : col.map((q) => q * 0.85), [col[0], col[1], col[2], core ? 200 : 120]);
  }, sg.text, TX, TY, { sx, sy: sx, gap: 1 });
}
