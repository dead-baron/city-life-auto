// Art v2: the night's neon (concepts R1-C/E, AT1-A, D8 nightlife, B7's nightclub). Big neon signs on the fronts of the
// nightlife district's clubs, bars and shops - invented names in tubes of buzzing colour with an icon beside them, a
// tube along the cornice - that glow and light the pavement; the clubs, bars and arcades elsewhere get one too.
//   nightFront(spec, ctx) -> bool   decides a front's neon (spec.neonSigns, spec.trim) and pushes its lights
//     ctx: { w, st (district style), A (archetype), kind (the shop kind), name, seed, lights, rnd }
//   paintSigns(G, spec)             paints spec.neonSigns onto makeBuilding(spec)'s south face (G.ax, G.ay: the
//                                   footprint's south-west corner; a face pixel at height v is at row G.ay - v)
//   signsFor(...)                   (the same choice, for tests: which buildings get what)
//   handNeon(spec, N, ctx)          a hand-planned front's own neon (b.art.neon): its name, a picture sign, a blade, the
//                                   cornice tube; the Neon Strip's more pictures and its dressing (neonpics.js)
// Names and icons are original (no real venues, brands or logos). Pure and worker-safe.
import { drawText, textWidth } from './font.js';
import { F_GLASS } from './gbuf.js';
import { buildingH } from './buildings.js';
import { npPic, dressFace, placePics, paintCyber, signRects, backShutter } from './neonpics.js';   // (the Neon Strip's own signs and facades)

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
  let sx = w >= 200 ? 4 : 2;
  const room = w - 16 - 30;
  let text = (ctx.own || k === 'club' || k === 'lounge' || k === 'bar') && name && !/^(BUILDING|SHOP|STORE)$/i.test(name) ? clean(name) : pick(NEON_WORDS[k]);
  if (ctx.own && sx > 2 && textWidth(text, { sx, gap: 1 }) > room) sx = 2;   // (a hand-planned front's own name, smaller, before words of its kind)
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
  if (spec.cyber) paintCyber(G, spec);   // (the Neon Strip's facade dressing, under its signs)
  for (const sg of spec.neonSigns || []) (sg.pic ? paintPic : sg.blade ? paintBlade : paintSign)(G, sg);
  return G;
}

// ---- the picture signs (the owner's favourites from NE3-NE8, drawn for the game): rows of palette letters, '.' clear.
// The eye-patch woman is a lit panel (the club's tower sign, the billboard by the plaza). The tigers, the panther and the
// rest of the Neon Strip's signs are his sign sheets' (neonpics.js). Original art: no real brand, venue or person.
const PICS = {
  lucy: { pal: [[30,40,120],[50,110,230],[160,240,255],[90,200,255],[235,150,220],[180,90,190],[40,30,50],[20,14,26],[30,10,40],[250,230,250],[80,220,255],[220,70,170],[130,60,150],[255,220,120],[140,20,110],[255,80,200],[40,30,90]], rows: '...........aaaaaaaaaa........../..........aaaaaaaaaaaa........./........aaabbbbbcbbbbbaa......./.......aaabbdcdddddddbbaa....../......aaabbbbbbbbbbbbbbbaa...../.....aaabbbbbbdbbbbdbbbbbaa..../.....aabbbbbbdbbbbbdbbbbbba..../.....aabbbbbbdbbbbbbdbbbbba..../....aaabbbbbdbbeebbbdbbbbbaa.../....aaabdaebdbeeeebbdefbbaaa.../....aaabdbedbeeeeeebeefgggaa.../...aaaabdbeeeeeeeeeegggfbbaaa../...aaabgdbeeeeeeeeggeaafbbdaa../...aaabbgbeeheeeggaaaeffibdaa../...aaabbdghhhhhgeeeeeefibbdaa../...aaabbdhhhhhhheeiiiiifbbdaa../...aaabdbhhhhhhheejkkjffbbcaa../...aaabdbehhhhheeeekieffbbdaa../..aaaabdbeeeheeeeeeeeeffbbdaaa./..aaaabdbeeeeeeeeeeeeeffbbdaaa./..aaabbdbeeeeeeeefeelfffbbdaaa./..aaabbdbeeeeeeefmeeeeffbbdaaa./..aaabbdbaeeeeeeeeeeeeffnbdaaa./..aaabbbbaeeeeeoeeoeeeffnbdaaa./..aaabbbbaaeeeooooooeaffbbdaaa./..aaabbbbaaaeeelloeeeafabbdaaa./..aaaabbaaaaeeeeeeeeeafabbdaaa./..aaaabbaaaaaeeeeeeaaaaabbbaaa./..aaaabbaaaaffeeeeffaaaabbbaaa./..aaaabbaaaaffffeffaaaaaabbaaa./...aaaaaaaaafffffffaaaaaabaaa../...aaaaaaaafppppppppaaaaabaaa../...aaaaaaa.fffffnfff..aaabaaa../...aaaaaaa.fffffffff..aaaaaaa../...aaaaaaqpqqqqqqqqqqp.aaaaaa../...aaaaqppqppppppppppqppaaaaa../...aaappqqqqqqqqqqqqqqqqppaaa../....ppqqqqqqqqqqqqqqqqqqqqpp.../...pqqqqqqqqqqqqqqqqqqqqqqqqp../..qqqqqqqqqqqqqqqqqqqqqqqqqqq../..qqqqqqqqqqqqqqqqqqqqqqqqqqq../.qqqqqqqqqqqqqqqqqqqqqqqqqqqqq./.qqqqqqqqqqqqqqqqqqqqqqqqqqqqq./.qqqqqqqqqqqqqqqqqqqqqqqqqqqqq./qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq' },
};
// ---- the Pink Mile's picture signs (2026-10-18; WC423, WC046, WC237): drawn from shapes - a crescent moon and its stars,
// a cocktail glass with its olive, a heart and its arrow, lips, a palm, a rose - each a lit tube round its outline over
// the dimmer glow of its fill. at(x, y) -> a colour or null; edge(f, x, y): (x, y) inside f with a neighbour outside it.
const edge = (f, x, y) => f(x, y) && (!f(x - 1, y) || !f(x + 1, y) || !f(x, y - 1) || !f(x, y + 1));
const segD = (x, y, ax, ay, bx, by) => { const dx = bx - ax, dy = by - ay, t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy))); return [Math.hypot(x - ax - dx * t, y - ay - dy * t), t]; };
const twinkle = (x, y, cx, cy, r) => { const dx = Math.abs(x + 0.5 - cx), dy = Math.abs(y + 0.5 - cy); return (dx < 0.8 && dy <= r) || (dy < 0.8 && dx <= r) || dx + dy <= r * 0.45; };
const ring = (cx, cy, r) => (x, y) => (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 < r * r;
const SHAPES = {
  moon: { w: 38, h: 36, glow: [255, 220, 120], at(x, y) {
    const C = (x2, y2) => ring(16, 18, 15)(x2, y2) && !ring(23, 12, 13)(x2, y2);
    if (edge(C, x, y)) return [255, 226, 120];
    if (C(x, y)) return [96, 70, 24];
    if (twinkle(x, y, 31, 27, 5)) return [255, 120, 220];
    if (twinkle(x, y, 34, 9, 2.5) || twinkle(x, y, 26, 33, 2)) return [255, 200, 240];
    return null;
  } },
  martini: { w: 32, h: 40, glow: [90, 230, 255], at(x, y) {
    const bowl = (x2, y2) => y2 >= 3 && y2 <= 21 && Math.abs(x2 + 0.5 - 16) <= (21.5 - y2) * 0.8;
    const olive = ring(19, 12, 3.2), stem = (x2, y2) => y2 > 21 && y2 < 34 && Math.abs(x2 + 0.5 - 16) < 1.4, base = (x2, y2) => y2 >= 34 && y2 <= 37 && Math.abs(x2 + 0.5 - 16) < 9 - (y2 - 34);
    if (edge(bowl, x, y) || edge(stem, x, y) || edge(base, x, y)) return [110, 236, 255];
    if (segD(x + 0.5, y + 0.5, 19, 12, 26, 1)[0] < 0.8) return [255, 220, 120];   // (the pick)
    if (edge(olive, x, y)) return [140, 255, 120];
    if (olive(x, y)) return [40, 110, 30];
    if (bowl(x, y) && y === 7) return [255, 120, 210];
    if (bowl(x, y) && y > 7) return [150, 30, 100];
    if (stem(x, y) || base(x, y)) return [30, 80, 100];
    return null;
  } },
  heart: { w: 40, h: 34, glow: [255, 80, 160], at(x, y) {
    const H = (x2, y2) => { const X = (x2 + 0.5 - 20) / 13, Y = (15.5 - (y2 + 0.5)) / 12, q = X * X + Y * Y - 1; return q * q * q - X * X * Y * Y * Y <= 0; };
    const X = x + 0.5, Y = y + 0.5, near = (ax, ay, bx, by, r = 0.85) => segD(X, Y, ax, ay, bx, by)[0] < r;
    // the arrow through it: its shaft where it's outside the heart, its head, its feathers
    if ((near(2, 32, 38, 3) && !H(x, y)) || near(38, 3, 32, 3.6) || near(38, 3, 37, 9) || near(3, 31, 1, 26) || near(6, 28.6, 4, 23.6) || near(3, 31, 8, 32.4) || near(6, 28.6, 11, 30)) return [255, 210, 90];
    if (edge(H, x, y)) return [255, 80, 150];
    if (H(x, y)) { const r = Math.hypot(X - 14, Y - 10); return r > 2.6 && r < 3.8 && Y < 10.5 ? [255, 180, 215] : [130, 16, 60]; }
    return null;
  } },
  kiss: { w: 42, h: 24, glow: [255, 60, 110], at(x, y) {
    const X = x + 0.5, Y = y + 0.5, dx = (X - 21) / 19;
    if (Math.abs(dx) >= 1) return null;
    const env = Math.sqrt(1 - dx * dx), bow = Math.max(0, 1 - Math.abs(X - 21) / 4.5);
    const top = 12 - 9 * env * (0.6 + 0.4 * env) + 3 * bow, bot = 12 + 9 * Math.sqrt(env) * env, mid = 12 + 1.4 * dx * dx;
    const L = (x2, y2) => { const q = (x2 + 0.5 - 21) / 19; if (Math.abs(q) >= 1) return false; const e = Math.sqrt(1 - q * q), b = Math.max(0, 1 - Math.abs(x2 + 0.5 - 21) / 4.5); return y2 + 0.5 > 12 - 9 * e * (0.6 + 0.4 * e) + 3 * b && y2 + 0.5 < 12 + 9 * Math.sqrt(e) * e; };
    if (edge(L, x, y)) return [255, 130, 170];
    if (!(Y > top && Y < bot)) return null;
    if (Math.abs(Y - mid) < 0.8 && Math.abs(dx) < 0.86) return [60, 0, 24];
    if (Y > mid && Y < mid + 3.5 && Math.abs(X - 24) < 4) return [255, 150, 180];   // (the light on the lower lip)
    return Y < mid ? [190, 16, 58] : [215, 26, 70];
  } },
  palm: { w: 38, h: 44, glow: [120, 255, 150], at(x, y) {
    const X = x + 0.5, Y = y + 0.5;
    // the trunk: a curve up from the foot, its rings
    const tx = (yy) => 17 + 4 * ((43 - yy) / 28) ** 2;
    if (Y > 15 && Y < 43 && Math.abs(X - tx(Y)) < 1.8) return Math.abs(X - tx(Y)) > 0.9 || (Math.floor(Y) % 4 === 0) ? [255, 170, 70] : [120, 60, 20];
    // the fronds: arcs out from the crown (a quadratic each, sampled), tapering to their tips
    const cx = 21, cy = 15;
    for (const [ex, ey, kx, ky] of [[2, 22, 8, 8], [7, 7, 12, 2], [22, 2, 20, 4], [35, 7, 31, 2], [36, 21, 33, 11], [12, 26, 13, 15]]) {
      let px = cx, py = cy;
      for (let k = 1; k <= 10; k++) {
        const t = k / 10, u = 1 - t, qx = u * u * cx + 2 * u * t * kx + t * t * ex, qy = u * u * cy + 2 * u * t * ky + t * t * ey;
        if (segD(X, Y, px, py, qx, qy)[0] < 1.6 - t * 0.9) return [110, 255, 150];
        px = qx; py = qy;
      }
    }
    if (ring(19, 17, 1.8)(x, y) || ring(23, 17.5, 1.8)(x, y)) return [255, 200, 90];
    return null;
  } },
  rose: { w: 30, h: 44, glow: [255, 60, 110], at(x, y) {
    const X = x + 0.5, Y = y + 0.5, head = ring(15, 11, 9.5);
    if (edge(head, x, y)) return [255, 70, 120];
    // (the swirl of the petals: rings broken at turns)
    const r = Math.hypot(X - 15, Y - 11.5), up = Y < 11.5;
    if (head(x, y)) return (Math.abs(r - 6) < 0.7 && (up || X > 15)) || (Math.abs(r - 3) < 0.7 && !up) ? [255, 110, 150] : [140, 12, 44];
    // the stem and its leaves, the thorns
    if (Y > 20 && Y < 43 && Math.abs(X - (15 - (Y - 20) * 0.08)) < 1) return [110, 230, 120];
    const leaf = (cx, cy, rx, ry) => ((X - cx) / rx) ** 2 + ((Y - cy) / ry) ** 2 < 1;
    if (leaf(9, 29, 5, 2.3) || leaf(20, 34, 5, 2.3)) return Math.abs(Y - (X < 15 ? 29 : 34)) < 0.6 ? [110, 230, 120] : [30, 100, 40];
    if (twinkle(x, y, 13.5, 24, 1) || twinkle(x, y, 15.5, 38, 1)) return [110, 230, 120];
    return null;
  } },
  // ---- the Arts District's (2026-10-19; WC239, WC070): the theatre's two masks, the gallery's palette, the record shop's disc
  masks: { w: 44, h: 34, glow: [255, 210, 110], at(x, y) {
    const X = x + 0.5, Y = y + 0.5;
    // two faces, the smiling one in front (gold), the frowning one behind it to the right (blue), each an oval tapering to
    // the chin: its eyes and its mouth cut out
    const face = (cx, cy) => (x2, y2) => { const u = (x2 + 0.5 - cx) / 10, v = (y2 + 0.5 - cy) / 13; return u * u * (1 + Math.max(0, v) * 0.5) + v * v < 1; };
    const A = face(15, 15), B = face(29, 18);
    const cut = (cx, cy, smile) => Math.abs(X - cx + 4) < 2.2 && Math.abs(Y - cy + 3) < 1.4 || Math.abs(X - cx - 4) < 2.2 && Math.abs(Y - cy + 3) < 1.4
      || (Math.abs(X - cx) < 5 && Math.abs(Y - (cy + 5 + (smile ? 1 : -1) * ((X - cx) / 5) ** 2 * -2.2)) < 0.9);
    if (A(x, y)) { if (edge(A, x, y)) return [255, 220, 110]; return cut(15, 15, true) ? null : [140, 90, 20]; }
    if (B(x, y)) { if (edge(B, x, y)) return [110, 200, 255]; return cut(29, 18, false) ? null : [20, 60, 120]; }
    if (segD(X, Y, 6, 26, 2, 31)[0] < 0.8 || segD(X, Y, 38, 29, 42, 33)[0] < 0.8) return [255, 120, 200];   // (the ribbons)
    return null;
  } },
  palette: { w: 40, h: 30, glow: [255, 180, 90], at(x, y) {
    const X = x + 0.5, Y = y + 0.5;
    const P = (x2, y2) => { const u = (x2 + 0.5 - 20) / 18, v = (y2 + 0.5 - 15) / 13; return u * u + v * v < 1 && Math.hypot(x2 + 0.5 - 29, y2 + 0.5 - 20) > 3.6; };
    if (segD(X, Y, 4, 28, 16, 12)[0] < 1 && !P(x, y)) return [255, 230, 190];   // (the brush across it)
    if (edge(P, x, y)) return [255, 190, 100];
    if (!P(x, y)) return null;
    for (const [cx, cy, c] of [[11, 10, [255, 70, 70]], [19, 7, [255, 220, 70]], [27, 9, [90, 220, 120]], [32, 14, [80, 160, 255]], [9, 18, [230, 110, 255]]]) if (Math.hypot(X - cx, Y - cy) < 2.4) return c;
    return [110, 70, 30];
  } },
  // ---- Lucky Mesa's (2026-10-20; LuckyMesa-B2): the Neon Saguaro's cactus up its pylon - the trunk and its two arms a
  // green tube over a dark fill with its ribs, pink flowers at their tips, the desert's line under it, the frame's red
  // tube round it all
  saguaro: { w: 34, h: 58, glow: [110, 255, 140], at(x, y) {
    const X = x + 0.5, Y = y + 0.5;
    const fr = (x2, y2) => { const u = x2 + 0.5, v = y2 + 0.5; if (u < 1 || u > 33 || v < 1 || v > 57) return false; const dx = Math.max(0, Math.abs(u - 17) - 11), dy = Math.max(0, Math.abs(v - 29) - 23); return dx * dx + dy * dy <= 25; };
    if (edge(fr, x, y)) return [255, 70, 90];
    const cap = (ax, ay, bx, by, r) => (x2, y2) => segD(x2 + 0.5, y2 + 0.5, ax, ay, bx, by)[0] < r;
    const trunk = cap(17, 10, 17, 49, 4.2), la = (x2, y2) => cap(17, 35, 9.5, 35, 2.8)(x2, y2) || cap(9.5, 35, 9.5, 22, 2.8)(x2, y2), ra = (x2, y2) => cap(17, 28, 24.5, 28, 2.8)(x2, y2) || cap(24.5, 28, 24.5, 15, 2.8)(x2, y2);
    const Cc = (x2, y2) => trunk(x2, y2) || la(x2, y2) || ra(x2, y2);
    if (edge(Cc, x, y)) return [130, 255, 150];
    if (Cc(x, y)) return (trunk(x, y) && Math.abs(X - 17) < 0.7) || (Math.abs(X - 9.5) < 0.6 && Y < 33) || (Math.abs(X - 24.5) < 0.6 && Y < 26) ? [70, 200, 100] : [18, 84, 40];
    if (ring(17, 8.4, 1.7)(x, y) || ring(9.5, 20.2, 1.4)(x, y) || ring(24.5, 13.2, 1.4)(x, y)) return [255, 110, 200];
    if (Y > 50 && Y < 51.6 && X > 5 && X < 29) return [255, 170, 70];
    if (twinkle(x, y, 7, 8, 2) || twinkle(x, y, 28, 40, 2)) return [255, 210, 240];
    return null;
  } },
  vinyl: { w: 34, h: 34, glow: [255, 90, 140], at(x, y) {
    const r = Math.hypot(x + 0.5 - 17, y + 0.5 - 17);
    if (r > 16) return null;
    if (r > 15) return [255, 110, 160];
    if (r < 1.2) return null;
    if (r < 6) return r > 5 ? [255, 220, 110] : [200, 60, 90];
    return Math.round(r) % 3 === 0 ? [255, 110, 160] : [30, 16, 30];
  } },
};
// (a picture sign's glow colour: the shape's own, else the panel's pink, the tiger's orange, the head's violet)
export const picGlow = (k) => (SHAPES[k] ? SHAPES[k].glow : k === 'lucy' ? [255, 80, 200] : (npPic(OLD[k] || k) || { glow: [170, 100, 255] }).glow);
const OLD = { tigerHead: 'panther' };   // (the roaring head: the panther now)
const picCache = new Map();
function picOf(k) {
  let P = picCache.get(k);
  if (P) return P;
  const N = npPic(OLD[k] || k);
  if (N) P = N;
  else if (SHAPES[k]) {
    // (a shape: its colours gathered into a palette as they're met)
    const S = SHAPES[k], w = S.w, h = S.h, px = new Int8Array(w * h).fill(-1), pal = [], keyOf = new Map();
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const c = S.at(x, y);
      if (!c) continue;
      const kk = c.join(',');
      if (!keyOf.has(kk)) { keyOf.set(kk, pal.length); pal.push(c); }
      px[y * w + x] = keyOf.get(kk);
    }
    P = { w, h, px, pal, panel: false };
  } else {
    const D = PICS[k] || PICS.lucy, rows = D.rows.split('/'), h = rows.length, w = rows[0].length, px = new Int8Array(w * h).fill(-1);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const c = rows[y].charCodeAt(x); if (c !== 46) px[y * w + x] = c - 97; }
    P = { w, h, px, pal: D.pal, panel: k === 'lucy' };
  }
  picCache.set(k, P);
  return P;
}
// a picture sign's size on the face (px; s: px per picture pixel - 2, one art pixel each)
export const picSize = (k, s = 2) => { const P = picOf(k); return [P.w * s + (P.panel ? 12 : 0), P.h * s + (P.panel ? 12 : 0)]; };
// (2026-10-23, the owner: "Neon tiger sign is way blown out" - the picture is glass, the lights round it reach it a third as
// much (lightgame.js F_GLASS); its tubes glow bright, its fills dimly, the dark between them stays dark; its light on the
// pavement stands out from the wall and lower down: handNeon)
const PIC_TUBE = 190, PIC_FILL = 96;
function paintPic(G, sg) {
  const P = picOf(sg.pic), s = sg.s || 2, pad = P.panel ? 6 : 0, [w, h] = picSize(sg.pic, s), S = [0, 1, 0];
  const X0 = G.ax + sg.x, Y1 = G.ay - sg.v, Y0 = Y1 - h, col = sg.col || [255, 80, 200];
  const put = (X, Y, c, e) => { if (G.inside(X, Y) && G.alpha(X, Y)) G.put(X, Y, c, S, G.ay - Y, e, F_GLASS); };
  // the halo it throws on the wall
  const R = 18;
  for (let Y = Y0 - R; Y < Y1 + R; Y++) for (let X = X0 - R; X < X0 + w + R; X++) {
    if (!G.inside(X, Y) || !G.alpha(X, Y)) continue;
    const dx = X < X0 ? X0 - X : X >= X0 + w ? X - X0 - w + 1 : 0, dy = Y < Y0 ? Y0 - Y : Y >= Y1 ? Y - Y1 + 1 : 0, d = Math.hypot(dx, dy);
    if (d <= 0 || d >= R) continue;
    const k = 1 - d / R;
    G.glow(X, Y, [col[0], col[1], col[2], Math.round(6 + 40 * k * k)]);
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
    const c = P.pal[i], lum = c[0] + c[1] + c[2], st = P.pe ? P.pe[y * P.w + x] : lum > 120 ? (lum > 500 ? PIC_TUBE : PIC_FILL) : 0;   // (P.pe: a sheet sign's own - neonpics.js)
    for (let j = 0; j < s; j++) for (let k = 0; k < s; k++) put(X0 + pad + x * s + k, Y0 + pad + y * s + j, c, st ? [c[0], c[1], c[2], st] : null);
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
    const sg = signsFor({ w, st: 'nightlife', A: N.kind === 'club' ? 'club' : 'nightrow', kind: N.kind === 'club' ? null : N.kind || 'bar', name: N.name, rnd, H, own: !!N.dress });
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
      const pc = N.picCol || picGlow(N.pic);
      out.push({ pic: N.pic, x, v, s, col: pc });
      lights.push([x + pw / 2, 44, Math.round(v * 0.7), 280, L(pc), 1.5, N.flick ? 'neonf' : 'neon']);   // (out over the pavement, below the sign: paintPic)
    }
  }
  // (the Neon Strip's: more picture signs where the face has room, then its dressing round them - neonpics.js)
  if (N.pics || N.dress) {
    const taken = signRects(spec, picSize, bladeSize), c2 = { w, H, top: N.top ?? Math.max(66, top - 4), taken, picSize, lights, rnd, doorLeft };
    if (N.dress && N.dress.back) backShutter(spec, c2);
    if (N.pics) placePics(spec, N.pics, c2);
    if (N.dress) dressFace(spec, N, c2);
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
