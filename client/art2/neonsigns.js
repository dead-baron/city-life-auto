// Art v2: the night's neon (concepts R1-C/E, AT1-A, D8 nightlife, B7's nightclub). Big neon signs on the fronts of the
// nightlife district's clubs, bars and shops - invented names in tubes of buzzing colour with an icon beside them, a
// tube along the cornice - that glow and light the pavement; the clubs, bars and arcades elsewhere get one too.
//   nightFront(spec, ctx) -> bool   decides a front's neon (spec.neonSigns, spec.trim) and pushes its lights
//     ctx: { w, st (district style), A (archetype), kind (the shop kind), name, seed, lights, rnd }
//   paintSigns(G, spec)             paints spec.neonSigns onto makeBuilding(spec)'s south face (G.ax, G.ay: the
//                                   footprint's south-west corner; a face pixel at height v is at row G.ay - v)
//   signsFor(...)                   (the same choice, for tests: which buildings get what)
//   handNeon(spec, N, ctx)          a hand-planned front's own neon (World v3's Neon Strip: b.art.neon) - its name in
//                                   tubes, a picture sign (the eye-patch woman, the striding tiger, the roaring head),
//                                   a blade sign down the side, a tube along the cornice
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
  for (const sg of spec.neonSigns || []) (sg.pic ? paintPic : sg.blade ? paintBlade : paintSign)(G, sg);
  return G;
}

// ---- the picture signs (the owner's favourites from NE3-NE8, drawn for the game): rows of palette letters, '.' clear.
// The eye-patch woman is a lit panel (the club's tower sign, the billboard by the plaza); the tigers are cut-out tubes
// (their cyan outline the tube) - the striding one over the streetwear shop, the roaring head over a club or a tattoo
// parlour. Original art: no real brand, venue or person.
const PICS = {
  lucy: { pal: [[30,40,120],[50,110,230],[160,240,255],[90,200,255],[235,150,220],[180,90,190],[40,30,50],[20,14,26],[30,10,40],[250,230,250],[80,220,255],[220,70,170],[130,60,150],[255,220,120],[140,20,110],[255,80,200],[40,30,90]], rows: '...........aaaaaaaaaa........../..........aaaaaaaaaaaa........./........aaabbbbbcbbbbbaa......./.......aaabbdcdddddddbbaa....../......aaabbbbbbbbbbbbbbbaa...../.....aaabbbbbbdbbbbdbbbbbaa..../.....aabbbbbbdbbbbbdbbbbbba..../.....aabbbbbbdbbbbbbdbbbbba..../....aaabbbbbdbbeebbbdbbbbbaa.../....aaabdaebdbeeeebbdefbbaaa.../....aaabdbedbeeeeeebeefgggaa.../...aaaabdbeeeeeeeeeegggfbbaaa../...aaabgdbeeeeeeeeggeaafbbdaa../...aaabbgbeeheeeggaaaeffibdaa../...aaabbdghhhhhgeeeeeefibbdaa../...aaabbdhhhhhhheeiiiiifbbdaa../...aaabdbhhhhhhheejkkjffbbcaa../...aaabdbehhhhheeeekieffbbdaa../..aaaabdbeeeheeeeeeeeeffbbdaaa./..aaaabdbeeeeeeeeeeeeeffbbdaaa./..aaabbdbeeeeeeeefeelfffbbdaaa./..aaabbdbeeeeeeefmeeeeffbbdaaa./..aaabbdbaeeeeeeeeeeeeffnbdaaa./..aaabbbbaeeeeeoeeoeeeffnbdaaa./..aaabbbbaaeeeooooooeaffbbdaaa./..aaabbbbaaaeeelloeeeafabbdaaa./..aaaabbaaaaeeeeeeeeeafabbdaaa./..aaaabbaaaaaeeeeeeaaaaabbbaaa./..aaaabbaaaaffeeeeffaaaabbbaaa./..aaaabbaaaaffffeffaaaaaabbaaa./...aaaaaaaaafffffffaaaaaabaaa../...aaaaaaaafppppppppaaaaabaaa../...aaaaaaa.fffffnfff..aaabaaa../...aaaaaaa.fffffffff..aaaaaaa../...aaaaaaqpqqqqqqqqqqp.aaaaaa../...aaaaqppqppppppppppqppaaaaa../...aaappqqqqqqqqqqqqqqqqppaaa../....ppqqqqqqqqqqqqqqqqqqqqpp.../...pqqqqqqqqqqqqqqqqqqqqqqqqp../..qqqqqqqqqqqqqqqqqqqqqqqqqqq../..qqqqqqqqqqqqqqqqqqqqqqqqqqq../.qqqqqqqqqqqqqqqqqqqqqqqqqqqqq./.qqqqqqqqqqqqqqqqqqqqqqqqqqqqq./.qqqqqqqqqqqqqqqqqqqqqqqqqqqqq./qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq' },
  tiger: { pal: [[80,230,255],[255,140,40],[20,10,20],[40,12,30],[255,200,90],[120,255,160],[255,235,190],[255,80,190]], rows: '..................................................aaa......./...a.......................................aaaa..abbba....../..aca.....................................abbbbaabbbbba...../.abba.....................................abbbbabbbbcba...../.aba......................................abbcbbbbbbba....../adba.......................................abbbbbdbbbba...../aba.................................aaaaaaabbbbbddbbbbba..../abba............aaaaaaaaaaaaaaaaaaaabbbbbbabbbdbbdbbbcba..../.ada........aaaaeeeeeeeeeeeeeeeeeeeebbbbbbbbbbbdbbdbffbaa.a./.aba.......abddebbddbbbddbbbddbbbddbbbddbbbbbbbdbbbbgggggaha/.abbaa....abbbdbbbbdbbbbdbbbbdbbbbdbbbbdbbbbbbbbbbbgggggghha/..abbbaaaabbbbbdbbbbdbbbbdbbbbdbbbbdbbbbdbbbdbbbbbbggggggga./...abdbbbbbbbbbdbbbbdbbbbdbbbbdbbbbdbbbbdbbdbbbbbbbgggggga../....aabbbbbbbbbdbbbbdbbbbdbbbbdbbbbdbbbbdbbgbbbbbbbbbgcccca./......aaabbbbbdbbbbdbbbbdbbbbdbbbbdbbbbdbbbbggaabbaaaaaaaa../........abbbbbdbbbbdbbbbdbbbbdbbbbdbbbbdbbbbbba.aa........../........abbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbba............/.........abbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbba.........../.........abbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbba........../.........abbbbbbbbbbbggggggggbbbbbbbbbbbbbbbbbbddda........./.........abbbbbaaabbbbgggggggggggggggbbbbbabbbbbbbbaa......./.........adddbba.abdddbaaaaaagggggggbbbaaa.abbbbbbdddaa...../.........abbbba...abbbba.....aaaaadddba.....abbbbbbeeeea..../.........abbbba...abbbba.........abbbba......abbbbeeeeeea.../.........abbbba...abbbba.........abbbba.......aabbbeeeea..../.........abddda...abdddba........abbbba.........aaaaaaa...../.........abbba....abbbbba........abddda...................../........abbbba.....abbbba........abbbbba..................../........abbbba.....abbbbba.......abbbbba..................../.......aeeeeea.....aeeeeea.......aeeeeea..................../.......aeeeeea.....aeeeeea.......aeeeeea..................../........aaaaa.......aaaaa.........aaaaa.....................' },
  tigerHead: { pal: [[80,230,255],[120,60,200],[255,80,190],[30,10,60],[255,220,80],[24,16,40],[170,100,240],[200,40,110],[250,245,255]], rows: '......a..........................a....../.....abaa......................aaba...../.....abbba....................abbba...../......abbbaa................aabbba....../......abcbbba..............abbbbca....../......abbbbba...aaaaaaaa...abbbbba....../.......abbba..aabbbbbbbbaa..abbba......./.......abaa.aabbdbbbdbbbdbaa.aaba......./........a..abbbbdbbbdbbbdbbba..a......../..........abbbbbbdbbdbbbdbbbba........../.........abbbbbbbdbbdbbdbbbbbba........./........abbbbbbbbdbbdbbdbbbbbbba......../.......abbdddbbbbbbbdbbbbbbbdddba......./.......abbbbbddddbbbbbbbddddbbbba......./.......abbbeebbbbbbbbbbbbbbbeebba......./......abbbbbbfeebbbbbbbbbeefbbbbba....../......abbbbbbbbbbbbbbbbbbbbbbbbbba....../......addbbbbbbbbgccccgbbbbbbbbbdda...../......abbdddbbbbgggccgggbbbbbdddba....../......abbbbbbbbggggggggggbbbbbbbba....../.....aabbbbbbbbggggggggggbbbbbbbbaa...../....abddbbbbbbbbggggggggbbbbbbbbbdda..../...abbbbdddbbbbbbggggggbbbbbbbdddbbba.../...abbbbbbbbbhihhhhhhhhhhihbbbbbbbbba.../..abbbbbbbbbbhihhhhhhhhhhihbbbbbbbbbba../..abbbbbbbbddbhihhhhhhhhhibbddbbbbbbba../.abbbbbbbddbbbhihhhhhhhhihbbbbddbbbbbba./.abbbbbbbbbbbbhihhhhhhhhihbbbbbbbbbbbba./abbbbaaabbbbbbhhhcccccchhhbbbbbbaaabbbba/.aaaa...abbbbbhhiccccccihhbbbbba...aaaa./.........abbbbbhiccccccihbbbbba........./..........abbbbihcccccchibbbba........../...........aabbibbbbbbbbibbaa.........../.............aaabbbbbbbbaaa............./................aaabbaaa................/...................aa...................' },
};
const picCache = new Map();
function picOf(k) {
  let P = picCache.get(k);
  if (P) return P;
  const D = PICS[k] || PICS.tigerHead, rows = D.rows.split('/'), h = rows.length, w = rows[0].length, px = new Int8Array(w * h).fill(-1);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const c = rows[y].charCodeAt(x); if (c !== 46) px[y * w + x] = c - 97; }
  P = { w, h, px, pal: D.pal, panel: k === 'lucy' };
  picCache.set(k, P);
  return P;
}
// a picture sign's size on the face (px; s: px per picture pixel - 2, one art pixel each)
export const picSize = (k, s = 2) => { const P = picOf(k); return [P.w * s + (P.panel ? 12 : 0), P.h * s + (P.panel ? 12 : 0)]; };
function paintPic(G, sg) {
  const P = picOf(sg.pic), s = sg.s || 2, pad = P.panel ? 6 : 0, [w, h] = picSize(sg.pic, s), S = [0, 1, 0];
  const X0 = G.ax + sg.x, Y1 = G.ay - sg.v, Y0 = Y1 - h, col = sg.col || [255, 80, 200];
  const put = (X, Y, c, e) => { if (G.inside(X, Y) && G.alpha(X, Y)) G.put(X, Y, c, S, G.ay - Y, e, 0); };
  // the halo it throws on the wall
  const R = 18;
  for (let Y = Y0 - R; Y < Y1 + R; Y++) for (let X = X0 - R; X < X0 + w + R; X++) {
    if (!G.inside(X, Y) || !G.alpha(X, Y)) continue;
    const dx = X < X0 ? X0 - X : X >= X0 + w ? X - X0 - w + 1 : 0, dy = Y < Y0 ? Y0 - Y : Y >= Y1 ? Y - Y1 + 1 : 0, d = Math.hypot(dx, dy);
    if (d <= 0 || d >= R) continue;
    const k = 1 - d / R;
    G.glow(X, Y, [col[0], col[1], col[2], Math.round(8 + 56 * k * k)]);
  }
  // the panel's dark backing and its tube (the portrait), or nothing behind the cut-out
  if (P.panel) for (let Y = Y0; Y < Y1; Y++) for (let X = X0; X < X0 + w; X++) {
    const e = Y === Y0 || Y === Y1 - 1 || X === X0 || X === X0 + w - 1, e2 = Y === Y0 + 2 || Y === Y1 - 3 || X === X0 + 2 || X === X0 + w - 3;
    if (e) put(X, Y, [26, 20, 34], null);
    else if (e2) put(X, Y, col.map((q) => Math.min(255, q * 0.62 + 92)), [col[0], col[1], col[2], 180]);
    else put(X, Y, [16, 12, 30], null);
  }
  for (let y = 0; y < P.h; y++) for (let x = 0; x < P.w; x++) {
    const i = P.px[y * P.w + x];
    if (i < 0) continue;
    const c = P.pal[i], lum = c[0] + c[1] + c[2];
    for (let j = 0; j < s; j++) for (let k = 0; k < s; k++) put(X0 + pad + x * s + k, Y0 + pad + y * s + j, c, lum > 120 ? [c[0], c[1], c[2], lum > 500 ? 200 : 150] : null);
  }
}
// a blade sign: a narrow lit panel down the face with its word stacked letter over letter (KARAOKE, HOTEL, RAMEN)
export const bladeSize = (text) => [14, String(text).length * 12 + 8];
function paintBlade(G, sg) {
  const S = [0, 1, 0], [w, h] = bladeSize(sg.blade), X0 = G.ax + sg.x, Y1 = G.ay - sg.v, Y0 = Y1 - h, col = sg.col, col2 = sg.col2 || col;
  const put = (X, Y, c, e) => { if (G.inside(X, Y) && G.alpha(X, Y)) G.put(X, Y, c, S, G.ay - Y, e, 0); };
  const hot = (c) => c.map((q) => Math.min(255, q * 0.62 + 92));
  for (let Y = Y0 - 10; Y < Y1 + 10; Y++) for (let X = X0 - 10; X < X0 + w + 10; X++) {
    if (!G.inside(X, Y) || !G.alpha(X, Y)) continue;
    const dx = X < X0 ? X0 - X : X >= X0 + w ? X - X0 - w + 1 : 0, dy = Y < Y0 ? Y0 - Y : Y >= Y1 ? Y - Y1 + 1 : 0, d = Math.hypot(dx, dy);
    if (d > 0 && d < 10) G.glow(X, Y, [col[0], col[1], col[2], Math.round(50 * (1 - d / 10) ** 2)]);
  }
  for (let Y = Y0; Y < Y1; Y++) for (let X = X0; X < X0 + w; X++) {
    const e = Y === Y0 || Y === Y1 - 1 || X === X0 || X === X0 + w - 1, e2 = Y === Y0 + 2 || Y === Y1 - 3 || X === X0 + 2 || X === X0 + w - 3;
    put(X, Y, e ? [26, 20, 34] : e2 ? hot(col2) : [18, 14, 26], e2 ? [col2[0], col2[1], col2[2], 160] : null);
  }
  const t = String(sg.blade);
  for (let i = 0; i < t.length; i++) drawText((px, py) => put(px, py, hot(col), [col[0], col[1], col[2], 200]), t[i], X0 + 4, Y0 + 5 + i * 12, { sx: 2, sy: 2, gap: 1 });
}

// A hand-planned front's neon (shared/world3-neon.js: b.art.neon = { name, kind, pic, blade, col (NEON_COLS index),
// trim }): its name over the shopfront (or words of its kind when the name won't fit), a picture sign above it where
// the face has the room, a blade sign down the side away from the door, the cornice tube. Pushes its lights.
export function handNeon(spec, N, ctx) {
  const H = buildingH(spec), w = ctx.w, lights = ctx.lights, L = (c) => c.map((q) => q / 255);
  const rnd = ctx.rnd;
  const ci = N.col ?? Math.floor(rnd() * NEON_COLS.length), col = NEON_COLS[ci % NEON_COLS.length], col2 = NEON_COLS[(ci + 2 + (N.alt || 0)) % NEON_COLS.length];
  const out = (spec.neonSigns ||= []);
  if (spec.plaques) spec.plaques = spec.plaques.filter((p) => p.bg !== '#1c1a28');
  let top = 70;
  if (N.name !== null) {
    const sg = signsFor({ w, st: 'nightlife', A: N.kind === 'club' ? 'club' : 'nightrow', kind: N.kind === 'club' ? null : N.kind || 'bar', name: N.name, rnd, H });
    if (sg) { sg.col = col; sg.col2 = col2; out.push(sg); top = sg.v + sg.h + 6; lights.push([sg.x + sg.w / 2, 18, sg.v + sg.h / 2, 250, L(col), 2.4, 'neon']); }
  }
  const doorLeft = N.door === 'left';
  if (N.blade) {
    const [bw, bh] = bladeSize(N.blade), v = Math.max(60, Math.min(H - bh - 12, top - 4));
    const x = doorLeft ? w - bw - 6 : 6;
    if (v + bh <= H - 6 && w >= 90) { out.push({ blade: N.blade, x, v, col: col2, col2: col }); lights.push([x + bw / 2, 14, v + bh / 2, 180, L(col2), 1.6, 'neon']); }
  }
  if (N.pic) {
    const s = N.picS || 2, [pw, ph] = picSize(N.pic, s), v = Math.max(top, N.picV || 0);
    if (v + ph <= H - 4 && pw <= w - 12) {
      const x = Math.round(N.picX !== undefined ? Math.max(6, Math.min(w - pw - 6, N.picX)) : (w - pw) / 2);
      const pc = N.picCol || (N.pic === 'lucy' ? [255, 80, 200] : N.pic === 'tiger' ? [255, 150, 60] : [170, 100, 255]);
      out.push({ pic: N.pic, x, v, s, col: pc });
      lights.push([x + pw / 2, 18, v + ph / 2, 300, L(pc), 2.6, 'neon']);
    }
  }
  if (N.trim !== false && !spec.trim) { spec.trim = col2; lights.push([w / 2, 10, H - 8, 180, L(col2), 1.2, 'neon']); }
  return out.length > 0;
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
