// The life in the water and the spray at the falls (2026-10-18, the owner: "Let's do the fish yes, and ducks and
// mist"), drawn by the renderer over the baked water - host.js loads this the first time it's wanted:
// - fish, seen through the water: koi in the parks' ponds (they come to you if you stand on the bank), trout holding in
//   the creeks' current facing upstream, shoals of perch and bluegill in the lakes and ponds, carp in the slow water and
//   the marsh with the gar, a big shadow now and then out over a lake's deep water (a pike) or a river's (a catfish),
//   chub and bass in the rivers, the reef's bright fish round the southern keys (tangs, clownfish, parrotfish), silver
//   shoals and mullet in the sea's shallows, moon jellies drifting off the beaches and in the harbours. Each is a flat
//   decal on the water - the engine's decals blend into the albedo only, so the light pass's waves, glints and
//   caustics stay on top of them, as on the bed - its tail beating, its shadow on the bed below it in the clear
//   shallows by day. They dart off from anyone running by or in the water, from boats and fast traffic, and lie low a
//   while; they rise (a ring spreading on the water), and now and then one leaps clear. A fish comes to a bobber, noses
//   it at a nibble, takes it at the bite and thrashes on the line.
// - the wakes of what swims: a duck's, a goose's, someone swimming - a small V spreading behind them on the water (the
//   boats' big ones are the renderer's own: host.js _wakeTrail).
// - mist at the falls: puffs of spray rising off each waterfall's foot and drifting with the wind, foam churning out
//   over its pool.
// For show only, on the page: where the fish are comes from the map (the same patch of water has the same fish), what
// they do from what's about them; nothing of it is sent or kept. update() is the simulation, draw() puts it on the
// frame (the test harness runs them without the rest of the renderer); frame() is the renderer's glue.
import { TILE, T, PF } from '../../../shared/constants.js';
import { DISTRICTS } from '../../../shared/mapcore.js';
import { PH, nibbles } from '../../../shared/fish.js';
import { wind } from '../../render/flora/wind.js';

const TAU = Math.PI * 2;
const CELL = 6 * TILE;              // the patches of water fish are placed by (px)
const MAXF = [30, 64, 72, 80];      // fish at once, by the renderer's quality tier
const MAXR = 96, MAXP = 260, MAXW = 240;   // rings on the water, puffs of mist and foam, swimmers' wake points
const ART = 2;                      // world px per art pixel of these sprites
const angd = (a, b) => { let d = (a - b) % TAU; if (d > Math.PI) d -= TAU; else if (d < -Math.PI) d += TAU; return d; };
const hh = (a, b, c = 0) => { let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + Math.imul(c | 0, 1274126177)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const hex = (s) => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
const sstep = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

// ---- the fish ---------------------------------------------------------------------------------------------------
// L long, W wide (art pixels: a person stands ~21), bend how far the tail swings, al how plainly it shows through the
// water, cruise / dart its speeds (px/s), turn (rad/s), beh how it goes about ('roam' its water, 'school' with its
// shoal, 'hold' in the current facing upstream, 'drift' where the water takes it), rise about how often it rises (s;
// 0 never), leap the share of its rises that are leaps, deep how far down it keeps (dimmer; no shadow), leash how far
// it strays from its patch (px); its colours: back, side, fin and its marks ('bars', 'spots', 'stripe', 'bands',
// 'scales')
const SP = {
  koi: { L: 12, W: 5, bend: 1.4, al: 0.82, cruise: 13, dart: 120, turn: 1.7, beh: 'roam', rise: 22, leap: 0, leash: 170 },
  carp: { L: 13, W: 5, bend: 1.1, al: 0.7, cruise: 9, dart: 90, turn: 1.2, beh: 'roam', rise: 45, leap: 0.1, deep: 0.3, back: '#3e3c2a', side: '#76643a', fin: '#5a4a2e', leash: 170 },
  bluegill: { L: 6, W: 4, bend: 0.7, al: 0.72, cruise: 16, dart: 130, turn: 3.5, beh: 'school', rise: 40, leap: 0, back: '#34442e', side: '#5e7048', fin: '#4a5a3a', marks: 'bars', mark: '#26321e', leash: 120 },
  perch: { L: 7, W: 3, bend: 0.8, al: 0.72, cruise: 18, dart: 140, turn: 3.5, beh: 'school', rise: 80, leap: 0, back: '#36421f', side: '#7c8c3c', fin: '#c8783a', marks: 'bars', mark: '#26301a', leash: 180 },
  trout: { L: 11, W: 4, bend: 1.1, al: 0.88, cruise: 10, dart: 170, turn: 4, beh: 'hold', rise: 30, leap: 0.2, back: '#161c12', side: '#343c28', fin: '#2a3020', marks: 'spots', mark: '#0c0e08', leash: 70 },
  chub: { L: 8, W: 3, bend: 0.9, al: 0.7, cruise: 16, dart: 140, turn: 3, beh: 'school', rise: 50, leap: 0.05, back: '#434a40', side: '#8a8e7c', fin: '#9a6a4a', leash: 170 },
  bass: { L: 10, W: 4, bend: 1.1, al: 0.7, cruise: 12, dart: 150, turn: 2.4, beh: 'roam', rise: 60, leap: 0.12, back: '#2e3a24', side: '#5a6c3c', fin: '#46542e', marks: 'stripe', mark: '#20281a', leash: 160 },
  pike: { L: 19, W: 4, bend: 1.4, al: 0.36, cruise: 7, dart: 160, turn: 1, beh: 'roam', rise: 0, leap: 0, deep: 1, back: '#232a1c', side: '#3c4a2c', fin: '#2c3420', marks: 'spots', mark: '#56603c', leash: 260 },
  catfish: { L: 15, W: 5, bend: 1.1, al: 0.34, cruise: 6, dart: 110, turn: 1, beh: 'roam', rise: 0, leap: 0, deep: 1, back: '#2a2622', side: '#3e3832', fin: '#2e2a26', leash: 220 },
  gar: { L: 14, W: 3, bend: 0.8, al: 0.66, cruise: 8, dart: 150, turn: 1.4, beh: 'roam', rise: 60, leap: 0, back: '#3a3e2a', side: '#66683e', fin: '#4a4a30', marks: 'spots', mark: '#262818', leash: 180 },
  mullet: { L: 10, W: 3, bend: 0.9, al: 0.9, cruise: 22, dart: 170, turn: 2.5, beh: 'school', rise: 30, leap: 0.6, back: '#1e2830', side: '#46525c', fin: '#3a444e', leash: 210 },
  silver: { L: 8, W: 2, bend: 0.7, al: 0.92, cruise: 30, dart: 200, turn: 4, beh: 'school', rise: 45, leap: 0.05, back: '#16222e', side: '#3a4e60', fin: '#34465a', flash: 1, leash: 230 },
  tang: { L: 7, W: 4, bend: 0.7, al: 0.92, cruise: 14, dart: 130, turn: 3, beh: 'roam', rise: 0, leap: 0, back: '#1c44bc', side: '#2e62e0', fin: '#f2d020', leash: 90 },
  yellowtang: { L: 6, W: 4, bend: 0.6, al: 0.92, cruise: 12, dart: 130, turn: 3, beh: 'roam', rise: 0, leap: 0, back: '#e0b814', side: '#f6d630', fin: '#f8e27a', leash: 90 },
  clown: { L: 5, W: 3, bend: 0.6, al: 0.92, cruise: 9, dart: 110, turn: 3.5, beh: 'roam', rise: 0, leap: 0, back: '#e0601a', side: '#f27a22', fin: '#2a2a2a', marks: 'bands', mark: '#f4f2ee', leash: 50 },
  parrot: { L: 10, W: 4, bend: 1, al: 0.86, cruise: 10, dart: 120, turn: 2, beh: 'roam', rise: 0, leap: 0, back: '#26968a', side: '#46c2aa', fin: '#e0709a', marks: 'scales', mark: '#8adcca', leash: 130 },
  ray: { L: 14, W: 12, bend: 0.5, al: 0.88, cruise: 9, dart: 90, turn: 0.9, beh: 'roam', rise: 0, leap: 0, ray: 1, back: '#3a3026', side: '#4a3e30', fin: '#2e261e', marks: 'spots', mark: '#66583e', leash: 260 },
  jelly: { L: 9, W: 9, bend: 0, al: 0.5, cruise: 3, dart: 6, turn: 0.3, beh: 'drift', rise: 0, leap: 0, jelly: 1, leash: 320 },
};
for (const S of Object.values(SP)) for (const k of ['back', 'side', 'fin', 'mark']) if (S[k]) S[k] = hex(S[k]);
// the koi's colours: kohaku (white, red), sanke (and a little black), showa (black, red, white), ogon (gold), plain
// orange, tancho (the red spot on the head alone), chagoi (brown); their fins white and see-through
const KOI = [
  { base: '#f4f1ea', mark: '#d8402a', p: 0.45 }, { base: '#f4f1ea', mark: '#d8402a', p: 0.35, ink: '#1c1c20' },
  { base: '#24242a', mark: '#d8402a', p: 0.4, ink: '#f4f1ea' }, { base: '#eebc3a', side: '#f8d878' }, { base: '#ee862a', side: '#f49a3e' },
  { base: '#f4f1ea', mark: '#d8402a', tancho: 1 }, { base: '#8a6a40', side: '#9a7a4e' },
].map((k) => ({ ...k, base: hex(k.base), side: k.side ? hex(k.side) : null, mark: k.mark ? hex(k.mark) : null, ink: k.ink ? hex(k.ink) : null }));
const KOI_FIN = hex('#eee8de'), BLACK = [10, 14, 18], SILVER_FLASH = [hex('#7a9ab4'), hex('#e8f0f6')];
// how clearly each water shows what's in it
const CLEAR = { koi: 1, pond: 0.85, lake: 0.82, deep: 0.75, creek: 1, river: 0.72, marsh: 0.78, shore: 0.95, reef: 1, harbour: 0.5, open: 0.6 };
// the shallows where a fish's shadow shows on the bed by day
const SHADOWED = { koi: 1, pond: 1, creek: 1.4, reef: 1.2, shore: 1, lake: 0.6 };
// who lives in each water, by patch: [chance, species, fewest, most]
const POP = {
  koi: [[0.8, 'koi', 2, 4], [0.15, 'carp', 1, 1]],
  pond: [[0.5, 'bluegill', 3, 6], [0.25, 'carp', 1, 2]],
  lake: [[0.32, 'perch', 4, 8], [0.12, 'bass', 1, 1], [0.1, 'bluegill', 3, 5]],
  deep: [[0.07, 'pike', 1, 1], [0.15, 'perch', 5, 9]],
  creek: [[0.42, 'trout', 1, 2]],
  desert: [[0.35, 'chub', 3, 5]],
  river: [[0.25, 'chub', 3, 6], [0.15, 'bass', 1, 2], [0.04, 'catfish', 1, 1]],
  marsh: [[0.35, 'carp', 1, 3], [0.16, 'gar', 1, 2]],
  shore: [[0.34, 'silver', 9, 16], [0.15, 'mullet', 3, 6], [0.12, 'ray', 1, 1], [0.05, 'jelly', 1, 3]],
  reef: [[0.85, 'reef', 4, 8], [0.35, 'parrot', 1, 2], [0.1, 'ray', 1, 1]],
  harbour: [[0.15, 'mullet', 3, 6], [0.14, 'jelly', 1, 4]],
  open: [[0.03, 'jelly', 1, 2]],
};
const REEF_MIX = ['tang', 'yellowtang', 'tang', 'clown', 'yellowtang'];
// the fish that comes to a bobber, by the water
const TAKER = { koi: 'koi', pond: 'bluegill', lake: 'perch', deep: 'bass', creek: 'trout', desert: 'chub', river: 'bass', marsh: 'carp', shore: 'mullet', reef: 'parrot', harbour: 'mullet', open: 'mullet' };

// ---- what water a place is ------------------------------------------------------------------------------------------
// 0 none, 1 the sea, 2 a lake, 3 a pond, 4 running water
function wcls(m, x, y) {
  const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
  if (!m.inside(tx, ty)) return 0;
  const i = m.idx(tx, ty), t = m.tiles[i];
  if (t !== T.WATER && t !== T.DEEP && t !== T.BRIDGE) return 0;
  return m.lake && m.lake[i] ? (m.lake[i] === 2 ? 3 : 2) : m.river && m.river[i] ? 4 : 1;
}
// (x, y) and r px round it all the same water
const clearAt = (m, x, y, c, r) => wcls(m, x, y) === c && wcls(m, x + r, y) === c && wcls(m, x - r, y) === c && wcls(m, x, y + r) === c && wcls(m, x, y - r) === c;

// a park's water (server/systems/fishing.js parkish: the koi there are the park's): a park's district, or one of World
// v3's handcrafted parks, gardens and ponds
const PARK_STYLES = new Set(['park', 'luxury', 'civic', 'arts']), PARK_PLACE = /park|commons|garden|pond|square/i;
function parkish(m, tx, ty, d) {
  const D = DISTRICTS[d];
  if (D && (PARK_STYLES.has(D.style) || d === 12)) return true;
  const R = m._wlParks || Object.defineProperty(m, '_wlParks', { value: Object.values(m.world3hand || {}).flatMap((H) => ((H && H.places) || []).filter((q) => q.name && PARK_PLACE.test(q.name))), enumerable: false })._wlParks;
  return R.some((q) => tx >= q.x0 - 2 && ty >= q.y0 - 2 && tx <= q.x1 + 2 && ty <= q.y1 + 2);
}
// the reef's districts (the southern keys) and the salt marshes' (fishing.js REEF_D, SALT_MARSH_D); the Egret Coast's
// marsh (shared/world3-waterbodies.js MARSH_BOX, tiles)
const REEF_D = new Set([14, 44, 45, 52, 59]), MARSH_D = new Set([53, 65]), MARSH_BOX = [820, 1890, 1530, 3300];
function inMarsh(m, x, y, d) {
  if (MARSH_D.has(d)) return true;
  const tx = x / TILE, ty = y / TILE;
  if (tx >= MARSH_BOX[0] && tx <= MARSH_BOX[2] && ty >= MARSH_BOX[1] && ty <= MARSH_BOX[3]) return true;
  for (const q of m.natureSites || []) if (q.kind === 'marsh' && Math.hypot(q.x - x, q.y - y) < 900) return true;
  for (const q of m.landmarks || []) if (q.type === 'marsh' && x >= q.x && y >= q.y && x < q.x + q.w && y < q.y + q.h) return true;
  return false;
}
// the channels' centre lines in buckets of 16 tiles: [x, y, dx, dy (downstream), channel] each segment's middle
function channelGrid(m) {
  const G = new Map(), chs = (m.waters && m.waters.ch) || [];
  chs.forEach((c, n) => {
    const p = c.pts;
    for (let j = 1; j < p.length; j++) {
      const dx = p[j][0] - p[j - 1][0], dy = p[j][1] - p[j - 1][1], l = Math.hypot(dx, dy) || 1, x = (p[j][0] + p[j - 1][0]) / 2, y = (p[j][1] + p[j - 1][1]) / 2;
      const k = Math.floor(y / 16) * 65536 + Math.floor(x / 16);
      let a = G.get(k); if (!a) G.set(k, a = []);
      a.push(x, y, dx / l, dy / l, n);
    }
  });
  return { G, chs };
}
function channelNear(C, tx, ty) {
  let best = null, bd = 1e9;
  const bx = Math.floor(tx / 16), by = Math.floor(ty / 16);
  for (let y = by - 1; y <= by + 1; y++) for (let x = bx - 1; x <= bx + 1; x++) {
    const a = C.G.get(y * 65536 + x);
    if (a) for (let j = 0; j < a.length; j += 5) { const d = (a[j] - tx) * (a[j] - tx) + (a[j + 1] - ty) * (a[j + 1] - ty); if (d < bd) { bd = d; best = [a[j + 2], a[j + 3], C.chs[a[j + 4]], Math.sqrt(d)]; } }
  }
  return best;
}
// The water of a patch: null (too little), or { k (POP's), c (wcls), x, y (its most open water), up (the way upstream,
// running water), d (district), shore (tiles to the nearest land, to 10) }
function cellAt(W, m, cx, cy) {
  let n = 0, bx = 0, by = 0, bs = -1;
  for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) {
    const x = cx * CELL + (i + 0.5) * CELL / 4, y = cy * CELL + (j + 0.5) * CELL / 4;
    if (!wcls(m, x, y)) continue;
    n++;
    const s = shoreOf(m, x, y, 10);
    if (s > bs) { bs = s; bx = x; by = y; }
  }
  if (n < 3 || inPool(m, bx, by)) return null;   // (no fish in a swimming pool)
  const c = wcls(m, bx, by), tx = Math.floor(bx / TILE), ty = Math.floor(by / TILE), i = m.idx(tx, ty), d = m.dist ? m.dist[i] : -1;
  const o = { k: 'shore', c, x: bx, y: by, up: NaN, d, shore: bs };
  if (c === 2 || c === 3) {
    o.k = inMarsh(m, bx, by, d) ? 'marsh' : parkish(m, tx, ty, d) ? 'koi' : c === 3 ? 'pond' : bs >= 6 && m.tiles[i] === T.DEEP ? 'deep' : 'lake';
  } else if (c === 4) {
    const ch = channelNear(W.chan || (W.chan = channelGrid(m)), tx, ty);
    if (ch && ch[3] < ch[2].w / 2 + 6) {
      o.up = Math.atan2(-ch[1], -ch[0]);
      const k = ch[2].k, t = ch[2].t;
      o.k = k === 'marsh' || t === 'marsh' ? 'marsh' : k === 'lake' ? (bs >= 6 ? 'deep' : 'lake') : t === 'desert' ? 'desert' : k === 'creek' ? 'creek' : 'river';
    } else {
      const f = m.flow ? m.flow.get(i) : undefined;
      if (f !== undefined) o.up = f * Math.PI / 8 + Math.PI;
      o.k = inMarsh(m, bx, by, d) ? 'marsh' : parkish(m, tx, ty, d) && f === undefined ? 'koi' : bs <= 2 ? 'creek' : 'river';
    }
  } else {
    // the sea: off the keys a reef; by the piers and the docks a harbour's; the shallows; out beyond them, open water
    let ld = -1, dock = false;
    for (let r = 1; r <= 8 && ld < 0; r++) for (let k = 0; k < 8; k++) {
      const x = tx + Math.round(Math.cos(k * 0.785) * r), y = ty + Math.round(Math.sin(k * 0.785) * r);
      if (!m.inside(x, y)) continue;
      const j = m.idx(x, y), t = m.tiles[j];
      if (t === T.DOCK) dock = true;
      if (t !== T.WATER && t !== T.DEEP && t !== T.BRIDGE && t !== T.DOCK) { ld = m.dist ? m.dist[j] : -1; break; }
    }
    const D = DISTRICTS[ld];
    o.k = MARSH_D.has(ld) ? 'marsh' : REEF_D.has(ld) || REEF_D.has(d) ? 'reef' : dock || (D && (D.style === 'harbor' || D.style === 'industrial')) ? 'harbour' : bs > 7 ? 'open' : 'shore';
  }
  return o;
}
// in one of the map's swimming pools (server/systems/fishing.js inPool: a pool's box, or its ring for a lazy river)
const inPool = (m, x, y) => (m.pools || []).some((r) => (r.ring ? Math.abs(Math.hypot((x - r.ring.cx) / r.ring.rx, (y - r.ring.cy) / r.ring.ry) - 1) * Math.min(r.ring.rx, r.ring.ry) < r.ring.hw + 16 : x >= r.x - 16 && x < r.x + r.w + 16 && y >= r.y - 16 && y < r.y + r.h + 16));
// how far (tiles, to r) to land from (x, y): eight ways out
function shoreOf(m, x, y, r) {
  const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
  for (let s = 1; s <= r; s++) for (let k = 0; k < 8; k++) {
    const qx = tx + Math.round(Math.cos(k * 0.785) * s), qy = ty + Math.round(Math.sin(k * 0.785) * s);
    if (!m.inside(qx, qy)) continue;
    const t = m.tiles[m.idx(qx, qy)];
    if (t !== T.WATER && t !== T.DEEP && t !== T.BRIDGE) return s - 1;
  }
  return r;
}

// ---- the falls ------------------------------------------------------------------------------------------------------
// each waterfall's foot: { x, y (px, where it meets the pool), w (px wide), h (its drop), k (how much spray) } - the
// nature sites' falls (their recipes' mist), the small falls and weirs and the coast's falls among the props
const SITE_MIST = { rainforest: 0.6, tarn: 0.45, river: 0.85, towncreek: 0.3, creek: 0.4, gorge: 0.6 };
function fallsOf(m) {
  const out = [];
  const add = (x, y, w, h, k) => out.push({ x, y, w, h, k, out: 6 + h * 0.15, acc: 0, facc: 0 });   // (out: how far the plunge's own white water reaches in front of its foot)
  for (const s of m.natureSites || []) {
    const f = s.falls;
    if (f && Number.isFinite(f.x) && Number.isFinite(f.y)) add(f.x, f.y + 8, f.w || 64, f.drop || 40, SITE_MIST[s.kind] ?? 0.5);
    else if (s.kind === 'oasis' && s.spring && Number.isFinite(s.spring.x)) add(s.spring.x, s.spring.y, s.spring.w || 16, s.spring.h || 30, 0.3);
  }
  for (const p of m.props || []) {
    if (p.t === 'fallsmall') add(p.x, p.y, p.w || 16, p.h || 30, Math.min(0.5, 0.2 + (p.h || 30) / 120));
    else if (p.t === 'coastfall') add(p.x, p.y, p.w || 28, p.drop || 66, p.mist ?? 0.7);
  }
  return out;
}

// ---- the sprites (art pixels, ART px each; built here, the first time each is drawn) --------------------------------
function gb(w, h, ax, ay) { const n = w * h; return { w, h, ax, ay, ap: ART, col: new Uint8ClampedArray(n * 4), nrm: new Uint8ClampedArray(n * 4), z: new Uint16Array(n), emi: new Uint8ClampedArray(n * 4), flag: new Uint8Array(n) }; }
function px(G, x, y, c, a, z = 0) {
  if (x < 0 || y < 0 || x >= G.w || y >= G.h) return;
  const i = y * G.w + x, j = i * 4;
  G.col[j] = c[0]; G.col[j + 1] = c[1]; G.col[j + 2] = c[2]; G.col[j + 3] = a;
  G.nrm[j] = 128; G.nrm[j + 1] = 128; G.nrm[j + 2] = 255; G.nrm[j + 3] = 255; G.z[i] = z;
}
const OUT = { c: null, a: 0 };
// A fish's outline at (u, v) art px from its middle (u forward), its tail swung by b (-1..1): 0 off it, 1 its body, 2
// its tail fin; and its colour there (vk its variety: a koi's, a silver fish's flash; -1 its shadow) - OUT, or null
function fishAt(S, b, u, v) {
  const L = S.L, t = (u + L / 2) / L;
  if (t < 0 || t > 1) return 0;
  if (S.ray) {
    // a ray: a broad disc, widest across its middle, its wingtips rippling (b); a thin tail trailing behind
    if (t < 0.4) return t > 0.03 && Math.abs(v - b * (0.4 - t) * 1.8) < 0.55 ? 2 : 0;
    const x = (t - 0.7) / 0.3;   // (-1 the back of the disc .. 1 its nose)
    return Math.abs(v) <= S.W / 2 * (1 + b * 0.08) * (1 - x * x) ? 1 : 0;
  }
  const W2 = S.W / 2, av = Math.abs(v - b * S.bend * (1 - t) * (1 - t) * 1.3);
  if (t > 0.58) { const k = (t - 0.58) / 0.42; return av <= W2 * Math.sqrt(Math.max(0, 1 - k * k * k)) ? 1 : 0; }   // (the head and shoulders, blunt)
  if (t > 0.2) return av <= W2 * (0.36 + 0.64 * (t - 0.2) / 0.38) ? 1 : 0;   // (the body narrowing to the tail)
  const hw = W2 * (0.36 + 0.7 * (0.2 - t) / 0.2);
  if (L > 8 && t < 0.07 && av < hw * 0.4) return 0;   // (the bigger ones' tails forked)
  return av <= hw ? 2 : 0;
}
// how much of an art pixel the fish covers (3 x 3 looks), and what part
function fishCover(S, b, u, v) {
  let n = 0, fin = 0;
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) { const k = fishAt(S, b, u + i / 3, v + j / 3); if (k) { n++; if (k === 2) fin++; } }
  return n < 4 ? 0 : fin * 2 > n ? 2 : 1;
}
function fishPx(S, vk, b, u, v) {
  if (S.jelly) return jellyPx(vk, u, v);
  const part = fishCover(S, b, u, v);
  if (!part) return null;
  if (vk < 0) { OUT.c = BLACK; OUT.a = 255; return OUT; }
  const L = S.L, t = (u + L / 2) / L, K = S === SP.koi ? KOI[vk % KOI.length] : null;
  if (part === 2) { OUT.c = K ? KOI_FIN : S.fin; OUT.a = K ? 170 : 220; return OUT; }
  const W2 = S.W / 2, r = Math.abs(v - b * S.bend * (1 - t) * (1 - t) * 1.3) / Math.max(0.6, W2), iu = Math.round(u * 1.4), iv = Math.round(v);
  OUT.a = 255;
  if (K) {
    let col = r > 0.55 && K.side ? K.side : K.base;
    if (K.tancho) { if (t > 0.72 && t < 0.92 && r < 0.7) col = K.mark; }
    else if (K.mark && hh(Math.floor((u + 12) / 2.6) + vk * 31, Math.floor((v + 6) / 2) + vk * 7, 3) < K.p) col = K.mark;
    if (K.ink && hh(iu + vk * 13, iv + 3, 9) < 0.15 && t < 0.85) col = K.ink;
    OUT.c = col; return OUT;
  }
  let col = r < 0.45 ? S.back : S.side;
  if (S.flash && vk === 1) col = r < 0.45 ? SILVER_FLASH[0] : SILVER_FLASH[1];   // (turning: the light off its flank)
  switch (S.marks) {
    case 'bars': if (t > 0.25 && t < 0.78 && (Math.floor(u + L) & 1) === 0 && r < 0.95) col = S.mark; break;
    case 'spots': if (hh(iu * 7 + 3, iv * 13 + 5, 11) < 0.22) col = S.mark; break;
    case 'stripe': if (r > 0.4 && r < 0.85 && t > 0.2 && t < 0.85) col = S.mark; break;
    case 'bands': if (Math.abs(t - 0.66) < 0.09 || Math.abs(t - 0.36) < 0.08) col = S.mark; break;
    case 'scales': if (((Math.floor(u + L) + Math.floor(v + 9)) % 3) === 0 && t < 0.85) col = S.mark; break;
  }
  if (t > 0.86 && r < 0.6 && !S.flash) col = S.back;   // (the head: the back's colour)
  OUT.c = col; return OUT;
}
// a moon jelly, its bell beating (vk the frame: 0 open .. 2 shut): see-through, a pale rim, its four rings
const JELLY = [hex('#f4eefa'), hex('#d8cce8'), hex('#d48cc0')];
function jellyPx(vk, u, v) {
  const R = [4.4, 3.9, 3.4][Math.max(0, vk) % 3], d = Math.hypot(u, v);
  if (d > R) return null;
  if (vk < 0) { OUT.c = BLACK; OUT.a = 255; return OUT; }
  const a = Math.atan2(v, u), q = Math.abs(angd(a * 2 % Math.PI, Math.PI / 2));
  if (d > R - 1) { OUT.c = JELLY[0]; OUT.a = 210; return OUT; }
  if (d > R * 0.25 && d < R * 0.7 && q < 0.7) { OUT.c = JELLY[2]; OUT.a = 230; return OUT; }
  OUT.c = JELLY[1]; OUT.a = 150; return OUT;
}
// a fish flat on the water as a decal: facing +x, its middle the anchor
function fishSprite(S, vk, b) {
  const w = S.L + 2, h = S.W + 2 * (Math.ceil(S.bend * 1.3) + 1), G = gb(w, h, w / 2, h / 2);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const o = fishPx(S, vk, b, x + 0.5 - w / 2, y + 0.5 - h / 2); if (o) px(G, x, y, o.c, o.a); }
  return G;
}
// a fish in the air (leaping): a sprite of its own, facing one of eight ways, bright in the light
function leapSprite(S, vk, d8) {
  const n = S.L + 4, G = gb(n, n, n / 2, n / 2), a = d8 * Math.PI / 4, c = Math.cos(a), s = Math.sin(a);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const X = x + 0.5 - n / 2, Y = y + 0.5 - n / 2, o = fishPx(S, vk, 0, X * c + Y * s, -X * s + Y * c);
    if (o && o.a > 200) px(G, x, y, o.c, 255, 2);
  }
  return G;
}
// a ring on the water, r art px across its middle
function ringSprite(r) {
  const n = 2 * r + 3, G = gb(n, n, n / 2, n / 2), C = hex('#e2eff6');
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const d = Math.hypot(x + 0.5 - n / 2, y + 0.5 - n / 2); if (Math.abs(d - r) < 0.6) px(G, x, y, C, 255); }
  return G;
}
// a streak of a swimmer's wake: along x, its middle the anchor
function streakSprite() {
  const G = gb(5, 2, 2.5, 1), C1 = hex('#eef6fa'), C2 = hex('#cfe2ec');
  for (let x = 0; x < 5; x++) px(G, x, 0, x === 0 || x === 4 ? C2 : C1, 255);
  for (let x = 1; x < 4; x++) px(G, x, 1, C2, 255);
  return G;
}
// a puff of spray (k 0-2: growing) or a fleck of foam (3-5): dithered, as the art's pixels are
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
function puffSprite(k) {
  const foam = k >= 3, R = foam ? [2, 3, 4][k - 3] : [4, 7, 10][k], n = 2 * R + 2, G = gb(n, n, n / 2, n / 2);
  const C1 = hex(foam ? '#f6fafc' : '#eef4f8'), C2 = hex(foam ? '#cfe2ec' : '#dde8ee');
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const dx = (x + 0.5 - n / 2) / R, dy = (y + 0.5 - n / 2) / R, d = dx * dx + dy * dy;
    if (d >= 1) continue;
    const p = Math.pow(1 - d, foam ? 0.7 : 1.4), th = (BAYER[(x & 3) + (y & 3) * 4] + 0.5) / 16;
    if (p > th * (foam ? 0.9 : 1.05)) px(G, x, y, d < 0.35 || hh(x, y, k) < 0.5 ? C1 : C2, 255);
  }
  return G;
}

// ---- the simulation ---------------------------------------------------------------------------------------------
const CRUISE = 0, DART = 1;
export class WaterLife {
  constructor(tier = 1) {
    this.tier = tier; this.m = null; this.now = 0; this.seed = 0x9e3779b9;
    this.fish = []; this.free = []; this.groups = new Map(); this.cells = new Map(); this.popAt = -1;
    this.rings = new Float32Array(MAXR * 5); this.ri = 0;
    this.wakes = new Float32Array(MAXW * 6); this.wi = 0; this.wkT = new Map();
    this.puffs = []; for (let i = 0; i < MAXP; i++) this.puffs.push({ on: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, t0: 0, life: 1, k: 0, foam: false, s: 0, lift: 0 });
    this.takers = new Map(); this.falls = null; this.chan = null; this.onSplash = null;
    this.env = { day: 1, sx: 0.6, sy: 0.8, dusk: 0, wet: 0, wx: 0, wy: 0, ws: 0 };
    this.n = { fish: 0, groups: 0, puffs: 0, takers: 0 };
  }
  rnd() { this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0; return this.seed / 4294967296; }
  reset(m) { this.m = m; this.fish.length = 0; this.groups.clear(); this.cells.clear(); this.takers.clear(); this.falls = null; this.chan = null; this.popAt = -1; for (const p of this.puffs) p.on = false; this.rings.fill(0); this.wakes.fill(0); this.wkT.clear(); }

  // one step: V the view (world px: x0, y0, x1, y1); movers [{ x, y, sp (px/s), wet (in the water), and for a
  // swimmer: id, a (the way it's going), hw (its wake's half width) }]; lines the
  // bobbers out [{ key, x, y, st (0 waiting, 1 the bite, 2 a fish on), nib (a nibble now), prog (0..1 to the bite) }];
  // env { day 0..1, sx, sy (the way shadows fall), dusk 0..1, wet (rain), wx, wy, ws (the wind) }
  update(m, V, now, dt, movers, lines, env) {
    if (m !== this.m) this.reset(m);
    this.now = now; if (env) this.env = env;
    if (!m || !m.tiles) return;
    if (now - this.popAt > 0.25 || this.popAt < 0) { this.popAt = now; this._populate(m, V); }
    this._swim(m, now, dt, movers);
    this._lines(m, V, now, dt, lines || []);
    this._mist(m, V, now, dt);
    this._wakes(movers, now);
  }
  // the swimmers' wake points, dropped as they go (a ring of MAXW)
  _wakes(movers, now) {
    if (this.wkT.size > 300) this.wkT.clear();
    for (const q of movers) {
      if (!q.hw || !(q.sp > 10 && q.sp < 400) || now - (this.wkT.get(q.id) ?? -9) < 0.11) continue;
      this.wkT.set(q.id, now);
      const W = this.wakes, j = this.wi * 6, c = Math.cos(q.a), s = Math.sin(q.a);
      W[j] = q.x - c * q.hw * 1.6; W[j + 1] = q.y - s * q.hw * 1.6; W[j + 2] = q.a; W[j + 3] = now; W[j + 4] = q.hw; W[j + 5] = q.sp;
      this.wi = (this.wi + 1) % MAXW;
    }
  }

  // ---- the fish in view: placed by the patch, nearest first, up to the tier's count; gone again out of sight ----
  _cell(m, cx, cy) {
    const k = cy * 65536 + cx;
    let c = this.cells.get(k);
    if (c === undefined) { if (this.cells.size > 6000) this.cells.clear(); c = cellAt(this, m, cx, cy); this.cells.set(k, c); }
    return c;
  }
  _populate(m, V) {
    const cx0 = Math.floor((V.x0 - CELL) / CELL), cy0 = Math.floor((V.y0 - CELL) / CELL), cx1 = Math.floor((V.x1 + CELL) / CELL), cy1 = Math.floor((V.y1 + CELL) / CELL);
    for (const g of this.groups.values()) g.out = g.cx < cx0 - 1 || g.cx > cx1 + 1 || g.cy < cy0 - 1 || g.cy > cy1 + 1;
    const mx = (V.x0 + V.x1) / 2, my = (V.y0 + V.y1) / 2, cand = [];
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) cand.push([((cx + 0.5) * CELL - mx) ** 2 + ((cy + 0.5) * CELL - my) ** 2, cx, cy]);
    cand.sort((a, b) => a[0] - b[0]);
    const max = MAXF[Math.max(0, Math.min(3, this.tier | 0))];
    let n = 0; for (const f of this.fish) if (!f.taker) n++;
    for (const [, cx, cy] of cand) {
      const c = this._cell(m, cx, cy);
      if (!c) continue;
      const P = POP[c.k] || [];
      for (let e = 0; e < P.length; e++) {
        const key = (cy * 65536 + cx) * 4 + e;
        if (this.groups.has(key)) { this.groups.get(key).out = false; continue; }
        const [p, sp, lo, hi] = P[e];
        if (hh(cx, cy, 101 + e) >= p) continue;
        const cnt = lo + Math.floor(hh(cx, cy, 201 + e) * (hi - lo + 1));
        if (n + cnt > max) continue;
        n += this._spawnGroup(m, key, cx, cy, c, sp, cnt);
      }
    }
    this.n.groups = this.groups.size;
  }
  _spawnGroup(m, key, cx, cy, c, sp, cnt) {
    const g = { key, cx, cy, c, sp, out: false, fish: [], lx: c.x, ly: c.y, la: hh(cx, cy, 7) * TAU, lv: 0, lt: 0, ltx: c.x, lty: c.y, feed: null };
    const S0 = SP[sp === 'reef' ? 'tang' : sp];
    for (let j = 0; j < cnt; j++) {
      const s = sp === 'reef' ? REEF_MIX[Math.floor(hh(cx * 3 + j, cy, 17) * REEF_MIX.length)] : sp, S = SP[s];
      let x = c.x, y = c.y;
      for (let t = 0; t < 10; t++) {
        const ang = hh(cx, cy * 7 + j, 300 + t) * TAU, r = (0.2 + 0.8 * hh(cx * 5 + j, cy, 400 + t)) * (S0.beh === 'school' ? 40 : CELL * 0.5);
        const qx = c.x + Math.cos(ang) * r, qy = c.y + Math.sin(ang) * r;
        if (clearAt(m, qx, qy, c.c, 10)) { x = qx; y = qy; break; }
      }
      const f = this._newFish(s, S, x, y, c.c, g);
      f.vk = s === 'koi' ? Math.floor(hh(cx * 11 + j, cy * 13, 5) * KOI.length) : 0;
      f.ox = (hh(cx, cy, 500 + j) - 0.5) * 34; f.oy = (hh(cx, cy, 600 + j) - 0.5) * 26;   // (its place in the shoal)
      if (S.beh === 'hold') { f.hx = x; f.hy = y; f.a = Number.isFinite(c.up) ? c.up : f.a; }
      g.fish.push(f);
    }
    if (!g.fish.length) return 0;
    this.groups.set(key, g);
    return g.fish.length;
  }
  _newFish(s, S, x, y, c, g) {
    const f = this.free.pop() || {};
    f.s = s; f.S = S; f.x = x; f.y = y; f.c = c; f.g = g; f.a = this.rnd() * TAU; f.tA = f.a; f.v = 0; f.tv = S.cruise * 0.6;
    f.ph = this.rnd() * 4; f.st = CRUISE; f.until = 0; f.next = this.now + this.rnd() * 2; f.hide = 0; f.vis = 0; f.vk = 0;
    f.rise = this.now + (S.rise ? S.rise * (0.3 + this.rnd()) : 1e9); f.air = -1; f.ax = x; f.ay = y; f.flash = 0;
    f.hx = x; f.hy = y; f.ox = 0; f.oy = 0; f.taker = null; f.gone = false;
    this.fish.push(f);
    return f;
  }
  _drop(f) { const i = this.fish.indexOf(f); if (i >= 0) { this.fish[i] = this.fish[this.fish.length - 1]; this.fish.pop(); } f.g = null; f.taker = null; this.free.push(f); }

  // ---- how they go about ------------------------------------------------------------------------------------------
  _swim(m, now, dt, movers) {
    // the groups: out of sight they fade and go; a shoal's leader wanders its water, the koi make for anyone standing
    // by their pond
    for (const g of this.groups.values()) {
      if (g.out && g.fish.every((f) => f.vis <= 0)) { for (const f of g.fish) this._drop(f); this.groups.delete(g.key); continue; }
      const S = SP[g.sp === 'reef' ? 'tang' : g.sp];
      if (g.sp === 'koi') {
        g.feed = null;
        let bd = 150 * 150;
        for (const q of movers) { if (q.wet || q.sp > 12) continue; const d = (q.x - g.c.x) ** 2 + (q.y - g.c.y) ** 2; if (d < bd) { bd = d; g.feed = q; } }
      }
      if (S.beh === 'school') {
        if (now > g.lt || Math.hypot(g.ltx - g.lx, g.lty - g.ly) < 12) {
          for (let t = 0; t < 6; t++) { const a = this.rnd() * TAU, r = 30 + this.rnd() * S.leash * 0.8, x = g.c.x + Math.cos(a) * r, y = g.c.y + Math.sin(a) * r; if (clearAt(m, x, y, g.c.c, 22)) { g.ltx = x; g.lty = y; break; } }
          g.lt = now + 3 + this.rnd() * 5;
        }
        const ta = Math.atan2(g.lty - g.ly, g.ltx - g.lx), d = angd(ta, g.la), tr = S.turn * 0.45 * dt;
        g.la += Math.max(-tr, Math.min(tr, d));
        g.lv += ((Math.abs(d) > 1.2 ? 0.4 : 1) * S.cruise * 0.8 - g.lv) * Math.min(1, dt * 1.5);
        const nx = g.lx + Math.cos(g.la) * g.lv * dt, ny = g.ly + Math.sin(g.la) * g.lv * dt;
        if (clearAt(m, nx, ny, g.c.c, 18)) { g.lx = nx; g.ly = ny; } else g.lt = 0;
      }
    }
    let n = 0;
    for (let i = this.fish.length - 1; i >= 0; i--) {
      const f = this.fish[i];
      if (!f.g && !f.taker) { this._drop(f); continue; }
      if (f.taker) continue;   // (the bobbers' own: _lines)
      n++;
      this._fishStep(m, f, now, dt, movers);
    }
    this.n.fish = n;
  }
  _fishStep(m, f, now, dt, movers) {
    const S = f.S, g = f.g;
    f.vis = Math.max(0, Math.min(1, f.vis + (g.out ? -dt : dt)));
    if (f.air >= 0) { this._airStep(m, f, now, dt); return; }
    // startled: anyone in the water close by, anyone running along the bank (walking, right at its edge), a boat or
    // anything fast; the park's koi are used to people
    const tame = S === SP.koi;
    for (const q of movers) {
      const R = q.wet ? 70 + q.sp * 0.25 : q.sp > 150 ? 50 + q.sp * 0.1 : q.sp > 40 && !tame ? 26 : 0;
      if (!R) continue;
      const dx = f.x - q.x, dy = f.y - q.y;
      if (dx * dx + dy * dy < R * R) { this._spook(f, q.x, q.y, now); break; }
    }
    if (f.st === DART && now > f.until) { f.st = CRUISE; f.tv = S.cruise * 0.5; }
    const hiding = now < f.hide, look = S.L * ART * 0.5 + 8;
    if (f.st !== DART) {
      if (S.beh === 'school') {
        // its place in the shoal: beside the leader, turned with it
        const c = Math.cos(g.la), s = Math.sin(g.la), tx = g.lx + f.ox * c - f.oy * s, ty = g.ly + f.ox * s + f.oy * c;
        const d = Math.hypot(tx - f.x, ty - f.y);
        f.tA = d > 3 ? Math.atan2(ty - f.y, tx - f.x) : g.la;
        f.tv = Math.min(S.dart * 0.5, g.lv * 0.9 + d * 0.9);
      } else if (S.beh === 'hold') {
        // in the current, nose upstream, holding its place; now and then it moves up or down the run
        const up = Number.isFinite(g.c.up) ? g.c.up : f.tA;
        if (now > f.next) {
          f.next = now + 8 + this.rnd() * 14;
          for (let t = 0; t < 5; t++) { const r = (this.rnd() - 0.4) * 70, side = (this.rnd() - 0.5) * 20, x = f.hx + Math.cos(up) * r - Math.sin(up) * side, y = f.hy + Math.sin(up) * r + Math.cos(up) * side; if (clearAt(m, x, y, f.c, 10)) { f.hx = x; f.hy = y; break; } }
        }
        const d = Math.hypot(f.hx - f.x, f.hy - f.y);
        f.tA = d > 10 ? Math.atan2(f.hy - f.y, f.hx - f.x) : up + Math.sin(now * 0.8 + f.ox) * 0.18;
        f.tv = d > 10 ? Math.min(S.cruise * 2, d * 0.8) : 0;
        if (d <= 10 && d > 1) { f.x += (f.hx - f.x) * Math.min(1, dt * 0.6); f.y += (f.hy - f.y) * Math.min(1, dt * 0.6); }
      } else if (S.beh === 'drift') {
        if (now > f.next) { f.next = now + 6 + this.rnd() * 8; f.tA = f.a + (this.rnd() - 0.5) * 1.2; f.tv = S.cruise * (0.4 + this.rnd()); }
      } else if (now > f.next || (g.feed && now > f.until)) {
        // roaming its water: off somewhere else in it, or a while still (a koi hanging under the surface); the koi
        // come to the bank where someone's standing, and mill there
        f.next = now + 2 + this.rnd() * 5; f.until = now + 0.8;
        if (g.feed && this.rnd() < 0.85) { const a = this.rnd() * TAU, r = 6 + this.rnd() * 30; f.ax = g.feed.x + Math.cos(a) * r; f.ay = g.feed.y + Math.sin(a) * r; f.tv = S.cruise * (0.7 + this.rnd() * 0.6); }
        else if (this.rnd() < 0.25) { f.ax = f.x + Math.cos(f.a) * 4; f.ay = f.y + Math.sin(f.a) * 4; f.tv = 0; }
        else {
          for (let t = 0; t < 6; t++) { const a = this.rnd() * TAU, r = 20 + this.rnd() * S.leash, x = f.hx + Math.cos(a) * r, y = f.hy + Math.sin(a) * r; if (clearAt(m, x, y, f.c, 12)) { f.ax = x; f.ay = y; break; } }
          f.tv = S.cruise * (0.5 + this.rnd() * 0.8);
        }
      }
      if (S.beh === 'roam') { const d = Math.hypot(f.ax - f.x, f.ay - f.y); if (d > 4) f.tA = Math.atan2(f.ay - f.y, f.ax - f.x); else f.tv = Math.min(f.tv, 2); }
      if (hiding) f.tv *= 0.6;
      // too far from its patch: back
      if (S.beh !== 'school' && Math.hypot(f.x - f.hx, f.y - f.hy) > S.leash * 1.3) f.tA = Math.atan2(f.hy - f.y, f.hx - f.x);
    }
    // turning, the speed, the water ahead
    const tr = (f.st === DART ? 9 : S.turn) * dt, d = angd(f.tA, f.a);
    f.a += Math.max(-tr, Math.min(tr, d));
    f.v += (f.tv - f.v) * Math.min(1, dt * (f.st === DART ? 6 : 1.6));
    const c = Math.cos(f.a), s = Math.sin(f.a);
    if (S.beh !== 'hold' || f.v > 1) {
      if (!clearAt(m, f.x + c * look, f.y + s * look, f.c, 8)) {
        // the bank ahead: round, slowing
        f.tA = f.a + (this.rnd() < 0.5 ? 1 : -1) * (1.2 + this.rnd() * 1.4); f.v *= 0.6;
        if (S.beh === 'roam') f.next = 0;
      } else { f.x += c * f.v * dt; f.y += s * f.v * dt; }
    }
    if (S.beh === 'drift') { const e = this.env; f.x += e.wx * e.ws * 3 * dt; f.y += e.wy * e.ws * 3 * dt; if (!clearAt(m, f.x, f.y, f.c, 10)) { f.x -= e.wx * e.ws * 3 * dt; f.y -= e.wy * e.ws * 3 * dt; } }
    // the tail: beating faster the faster it goes; a moon jelly's bell slowly
    f.ph += dt * (S.jelly ? 0.8 : 1.6 + f.v * 0.22 + (S.beh === 'hold' ? 1.4 : 0));
    if (S.flash) f.flash = Math.max(Math.abs(d) > 0.6 ? 1 : 0, f.flash - dt * 3);   // (a silver shoal flashes as it turns)
    // rising: a ring on the water - at dusk the trout come up to the fly; now and then a leap
    if (now > f.rise) {
      const e = this.env, k = S === SP.trout ? 1 + 2.5 * e.dusk : 1;
      f.rise = now + S.rise * (0.5 + this.rnd()) / k;
      if (!hiding && f.vis > 0.8) {
        const hx = f.x + c * S.L, hy = f.y + s * S.L;
        if (this.rnd() < S.leap && this._leap(m, f, now)) return;
        this._ring(hx, hy, S.L > 8 ? 6 : 4, 0.8);
      }
    }
  }
  _spook(f, sx, sy, now) {
    const S = f.S;
    if (S.jelly) return;
    if (f.st !== DART) { f.st = DART; f.until = now + 0.45 + this.rnd() * 0.5; f.hide = now + 4 + this.rnd() * 6; }
    f.tA = Math.atan2(f.y - sy, f.x - sx) + (this.rnd() - 0.5) * 0.9; f.tv = S.dart;
    f.next = 0; f.ax = f.x + Math.cos(f.tA) * 60; f.ay = f.y + Math.sin(f.tA) * 60;
    const g = f.g;
    if (g && S.beh === 'school' && now > (g.scat || 0)) { g.scat = now + 1; g.ltx = g.lx + (g.lx - sx) * 2; g.lty = g.ly + (g.ly - sy) * 2; g.lt = now + 3; for (const o of g.fish) if (o !== f && o.st !== DART) this._spook(o, sx, sy, now); }
  }
  // a leap: out over the water ahead, if it comes down in the water
  _leap(m, f, now) {
    const S = f.S, T0 = 0.42 + S.L * 0.02, sp = 55 + S.L * 4, c = Math.cos(f.a), s = Math.sin(f.a);
    if (!clearAt(m, f.x + c * sp * T0, f.y + s * sp * T0, f.c, 8)) return false;
    f.air = now; f.airT = T0; f.airV = sp;
    this._ring(f.x, f.y, 5, 0.9);
    if (this.onSplash) this.onSplash(f.x, f.y, 3);
    return true;
  }
  _airStep(m, f, now, dt) {
    const k = (now - f.air) / f.airT;
    f.x += Math.cos(f.a) * f.airV * dt; f.y += Math.sin(f.a) * f.airV * dt;
    if (k >= 1) {
      f.air = -1; f.hide = now + 2.5; f.v = f.S.cruise;
      this._ring(f.x, f.y, 7, 1); this._ring(f.x, f.y, 4, 0.7);
      if (this.onSplash) this.onSplash(f.x, f.y, f.S.L > 8 ? 6 : 4);
    }
  }
  _ring(x, y, r, k) { const R = this.rings, j = this.ri * 5; R[j] = x; R[j + 1] = y; R[j + 2] = this.now; R[j + 3] = r; R[j + 4] = k; this.ri = (this.ri + 1) % MAXR; }

  // ---- the bobbers: a fish comes to each, noses it, takes it, fights ---------------------------------------------
  _lines(m, V, now, dt, lines) {
    for (const t of this.takers.values()) t.seen = false;
    for (const L of lines) {
      let t = this.takers.get(L.key);
      if (!t) {
        if (L.x < V.x0 - 200 || L.x > V.x1 + 200 || L.y < V.y0 - 200 || L.y > V.y1 + 200) continue;
        const c = wcls(m, L.x, L.y);
        if (!c) continue;
        const cell = this._cell(m, Math.floor(L.x / CELL), Math.floor(L.y / CELL)), s = TAKER[cell ? cell.k : 'pond'] || 'bluegill', S = SP[s];
        let x = L.x, y = L.y;
        for (let k = 0; k < 12; k++) { const a = this.rnd() * TAU, r = (k < 8 ? 60 + this.rnd() * 50 : 22) , qx = L.x + Math.cos(a) * r, qy = L.y + Math.sin(a) * r; if (clearAt(m, qx, qy, c, 8)) { x = qx; y = qy; break; } }
        const f = this._newFish(s, S, x, y, c, null);
        f.vk = s === 'koi' ? Math.floor(this.rnd() * KOI.length) : 0;
        t = { f, st: L.st, oa: Math.atan2(y - L.y, x - L.x), leave: 0, seen: true, bx: L.x, by: L.y, nib: false, prog: 0, last: now };
        f.taker = t;
        this.takers.set(L.key, t);
      }
      t.seen = true; t.st = L.st; t.bx = L.x; t.by = L.y; t.nib = L.nib; t.prog = L.prog;
    }
    for (const [key, t] of this.takers) {
      const f = t.f;
      if (!t.seen && !t.leave) {
        // the line in: a fish on it is landed (or broke away under the splash); one still circling swims off
        if (t.st >= 1) { this._ring(f.x, f.y, 6, 1); this._drop(f); this.takers.delete(key); continue; }
        t.leave = now; f.st = DART; f.tA = Math.atan2(f.y - t.by, f.x - t.bx); f.tv = f.S.dart * 0.7;
      }
      this._takerStep(m, t, f, now, dt);
      if (t.leave && now - t.leave > 1.6) { this._drop(f); this.takers.delete(key); }
    }
    this.n.takers = this.takers.size;
  }
  _takerStep(m, t, f, now, dt) {
    const S = f.S;
    f.vis = t.leave ? Math.max(0, 1 - (now - t.leave) / 1.6) : Math.min(1, f.vis + dt);
    if (!t.leave) {
      if (t.st === 2) {
        // on the line: thrashing about the bobber, the water broken round it
        f.x = t.bx + Math.sin(now * 3.1 + f.ox) * 6; f.y = t.by + Math.cos(now * 2.3) * 4;
        f.a = Math.atan2(t.by - f.y, t.bx - f.x) + Math.PI + Math.sin(now * 13) * 0.9; f.v = 40; f.ph += dt * 14;
        if (now - t.last > 0.32) { t.last = now; this._ring(f.x + (this.rnd() - 0.5) * 8, f.y + (this.rnd() - 0.5) * 6, 3 + Math.floor(this.rnd() * 3), 0.9); }
        return;
      }
      if (t.st === 1) {
        // the bite: in at it, and down with it
        const d = Math.hypot(t.bx - f.x, t.by - f.y);
        f.tA = Math.atan2(t.by - f.y, t.bx - f.x); f.tv = S.dart;
        if (d < 5) f.vis = Math.max(0, f.vis - dt * 6);
      } else {
        // circling it, drawing in as the bite nears; at a nibble, a dart to touch it
        t.oa += dt * (0.35 + t.prog * 0.4);
        const r = t.nib ? 2 : 34 - 22 * t.prog, ax = t.bx + Math.cos(t.oa) * r, ay = t.by + Math.sin(t.oa) * r, d = Math.hypot(ax - f.x, ay - f.y);
        f.tA = d > 2 ? Math.atan2(ay - f.y, ax - f.x) : f.a;
        f.tv = t.nib ? S.dart * 0.6 : Math.min(S.cruise * 1.4, d * 1.2);
      }
    }
    const tr = 7 * dt, dd = angd(f.tA, f.a);
    f.a += Math.max(-tr, Math.min(tr, dd));
    f.v += (f.tv - f.v) * Math.min(1, dt * 4);
    const nx = f.x + Math.cos(f.a) * f.v * dt, ny = f.y + Math.sin(f.a) * f.v * dt;
    if (wcls(m, nx, ny) === f.c) { f.x = nx; f.y = ny; } else if (t.st === 0) t.oa += 0.5;
    f.ph += dt * (1.6 + f.v * 0.22);
  }

  // ---- mist and foam at the falls -----------------------------------------------------------------------------
  _mist(m, V, now, dt) {
    const F = this.falls || (this.falls = fallsOf(m)), e = this.env;
    for (const q of F) {
      if (q.x < V.x0 - 300 || q.x > V.x1 + 300 || q.y < V.y0 - 300 || q.y > V.y1 + 300) continue;
      // the spray: more the wider and higher the falls
      q.acc += dt * q.k * (1.2 + q.w / 22) * (0.6 + Math.min(1.6, q.h / 80));
      while (q.acc >= 1) {
        q.acc -= 1;
        const p = this._puff();
        if (!p) break;
        const u = this.rnd() - 0.5;
        p.on = true; p.foam = false; p.t0 = now; p.life = 2.6 + this.rnd() * 1.8;
        p.x = q.x + u * q.w * 1.4; p.y = q.y + q.out * (0.6 + this.rnd() * 1.4); p.z = this.rnd() * Math.min(12, q.h * 0.15);
        p.vx = u * 10 + e.wx * e.ws * 16; p.vy = 4 + this.rnd() * 8 + e.wy * e.ws * 10; p.vz = 7 + this.rnd() * 9 + q.h * 0.06;
        p.k = q.k; p.s = Math.min(2, (this.rnd() < 0.35 ? 0 : 1) + (q.h > 90 ? 1 : 0)); p.lift = q.h + 60;   // (a high fall's spray in bigger puffs)
      }
      // the foam churned out over the pool
      q.facc += dt * (0.5 + q.w / 18) * Math.min(1, 0.4 + q.k);
      while (q.facc >= 1) {
        q.facc -= 1;
        const x = q.x + (this.rnd() - 0.5) * q.w * 1.1, y = q.y + q.out + this.rnd() * 6;
        if (!wcls(m, x, y + 6)) continue;
        const p = this._puff();
        if (!p) break;
        p.on = true; p.foam = true; p.t0 = now; p.life = 2 + this.rnd() * 1.6;
        p.x = x; p.y = y; p.z = 0; p.vx = (this.rnd() - 0.5) * 16; p.vy = 12 + this.rnd() * 14; p.vz = 0; p.k = 1; p.s = Math.floor(this.rnd() * 3); p.lift = 50;
      }
    }
    let n = 0;
    for (const p of this.puffs) {
      if (!p.on) continue;
      const age = now - p.t0;
      if (age > p.life) { p.on = false; continue; }
      n++;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.foam) { p.vx *= 1 - dt * 0.5; p.vy *= 1 - dt * 0.45; if (!wcls(m, p.x, p.y + 4)) { p.vy = 0; p.vx *= 0.5; } }
      else { p.vz *= 1 - dt * 0.35; p.vx += e.wx * e.ws * 6 * dt; }
    }
    this.n.puffs = n;
  }
  _puff() { for (const p of this.puffs) if (!p.on) return p; return null; }

  // ---- on the frame -----------------------------------------------------------------------------------------------
  // E the engine (drawDecal, drawSprite); conv(key, make) the key once its sprite is up (null: not this frame)
  draw(E, conv) {
    const now = this.now, e = this.env, rainK = 1 - 0.45 * Math.min(1, e.wet || 0), day = e.day;
    const FR = [0, 1, 0, 2], BEND = [0, 1, -1];
    const spr = (S, s, vk, fr) => conv(`wlf|${s}|${vk}|${fr}`, () => fishSprite(S, vk, BEND[fr]));
    // the shadows on the bed first (clear shallows, by day), then the fish over them
    if (day > 0.05) for (const f of this.fish) {
      const S = f.S, cell = f.g ? f.g.c : null, sh = cell ? SHADOWED[cell.k] || 0 : 0.8;
      if (S.deep || f.air >= 0 || !sh || f.vis <= 0) continue;
      const fr = FR[Math.floor(f.ph * 4) & 3], key = conv(`wlf|${f.s}|-1|${fr}`, () => fishSprite(S, -1, BEND[fr]));
      const dep = S.jelly ? 9 : 5;
      if (key) E.drawDecal(key, f.x + e.sx * dep, f.y + e.sy * dep, f.a, Math.min(0.45, 0.24 * day * sh * f.vis * rainK), 0);
    }
    for (const f of this.fish) {
      const S = f.S;
      if (f.vis <= 0) continue;
      if (f.air >= 0) {
        // in the air: the fish itself, up over the water, its shadow down on it
        const k = Math.min(1, (now - f.air) / f.airT), z = Math.sin(k * Math.PI) * (8 + S.L * 1.2), d8 = ((Math.round(f.a / (Math.PI / 4)) % 8) + 8) % 8;
        const key = conv(`wlj|${f.s}|${f.vk}|${d8}`, () => leapSprite(S, S.flash ? 1 : f.vk, d8));
        if (key && E.drawSprite) { const o = this.jo || (this.jo = { alpha: 1, flipX: false, flash: 0, xray: false, shadow: true, tint: null, air: true }); E.drawSprite(key, f.x, f.y, z, o); }
        continue;
      }
      const cell = f.g ? f.g.c : null, clr = cell ? CLEAR[cell.k] ?? 0.8 : 0.85;
      const hide = now < f.hide ? 0.55 : 1, al = S.al * clr * (1 - (S.deep || 0) * 0.25) * hide * f.vis * rainK;
      if (al <= 0.02) continue;
      const fr = S.jelly ? Math.floor(f.ph * 3) % 3 : FR[Math.floor(f.ph * 4) & 3], vk = S.jelly ? fr : S.flash ? (f.flash > 0.5 ? 1 : 0) : f.vk;
      const key = S.jelly ? conv(`wlf|jelly|${fr}|0`, () => fishSprite(S, fr, 0)) : spr(S, f.s, vk, fr);
      if (key) E.drawDecal(key, f.x, f.y, f.a, al, 0);
    }
    // the rings spreading on the water
    const R = this.rings;
    for (let j = 0; j < R.length; j += 5) {
      const k = R[j + 4];
      if (!k) continue;
      const life = 1.1 + R[j + 3] * 0.12, age = now - R[j + 2];
      if (age < 0 || age > life) { if (age > life) R[j + 4] = 0; continue; }
      const u = age / life, r = Math.max(1, Math.round(1 + u * R[j + 3] * 1.6)), key = conv(`wlr|${r}`, () => ringSprite(r));
      if (key) E.drawDecal(key, R[j], R[j + 1], 0, Math.pow(1 - u, 1.4) * 0.55 * k * rainK, 0);
    }
    // the swimmers' wakes: two thin streaks from each point, spreading out from its track and fading - a small V
    const Wk = this.wakes, sk = conv('wlw', streakSprite);
    if (sk) for (let j = 0; j < Wk.length; j += 6) {
      const hw = Wk[j + 4], age = now - Wk[j + 3];
      if (!hw || age < 0.15 || age > 2) continue;
      const a = Wk[j + 2], sp = Wk[j + 5], al = Math.pow(1 - age / 2, 1.3) * Math.min(1, sp / 70) * 0.6 * rainK, sp2 = hw * 0.8 + age * sp * 0.3, nx = -Math.sin(a), ny = Math.cos(a);
      for (let sd = -1; sd <= 1; sd += 2) E.drawDecal(sk, Wk[j] + nx * sp2 * sd, Wk[j + 1] + ny * sp2 * sd, a + sd * 0.45, al, 0);
    }
    // the foam on the pools, then the spray over the falls - drawn where they are, over whatever is there below the
    // height they're tested at (lift: a decal is put at y - z0 and tested at z0, so lifting both alike keeps its
    // place and puts it in front of the falls' curtain and the plunge's own spray, baked in the chunk)
    for (const p of this.puffs) {
      if (!p.on) continue;
      const u = (now - p.t0) / p.life;
      if (p.foam) {
        const key = conv(`wlp|${3 + p.s}`, () => puffSprite(3 + p.s));
        if (key) E.drawDecal(key, p.x, p.y + p.lift, 0, Math.min(1, (1 - u) * 1.25), p.lift);
      } else {
        const s = Math.min(2, p.s + Math.floor(u * 2.2)), key = conv(`wlp|${s}`, () => puffSprite(s));
        if (key) E.drawDecal(key, p.x, p.y + p.lift, 0, Math.min(1, sstep(u * 5) * Math.pow(1 - u, 1.2) * 1.4 * (0.4 + p.k * 0.6)), p.z + p.lift);
      }
    }
  }

  // ---- the renderer's glue (host.js): who's about, the bobbers, the light and the weather; then a step and a frame --
  frame(h, F) {
    const S = h.S, m = h.map, now = F.now;
    const dt = Math.min(0.1, Math.max(0, now - (this.last ?? now)));
    this.last = now; this.tier = h.q ?? 1;
    const V = this.V || (this.V = { x0: 0, y0: 0, x1: 0, y1: 0 });
    V.x0 = h.vx0; V.y0 = h.vy0; V.x1 = h.vx1; V.y1 = h.vy1;
    // who's about: their speed from where they were (the frame before)
    const mv = this.mv || (this.mv = []), pos = this.pos || (this.pos = new Map()), seen = this.seenN = (this.seenN || 0) + 1;
    let n = 0;
    const add = (p, wet, hw) => {
      if (p.rx < V.x0 - 150 || p.rx > V.x1 + 150 || p.ry < V.y0 - 150 || p.ry > V.y1 + 150) return;
      let q = pos.get(p.id);
      if (!q) pos.set(p.id, q = { x: p.rx, y: p.ry, t: now, sp: 0, n: 0, a: p.ra || 0 });
      const ddt = now - q.t;
      if (ddt > 0.05) { const dx = p.rx - q.x, dy = p.ry - q.y; q.sp = q.sp * 0.4 + Math.hypot(dx, dy) / ddt * 0.6; if (dx || dy) q.a = Math.atan2(dy, dx); q.x = p.rx; q.y = p.ry; q.t = now; }
      q.n = seen;
      const o = mv[n] || (mv[n] = { x: 0, y: 0, sp: 0, wet: false, id: 0, a: 0, hw: 0 });
      o.x = p.rx; o.y = p.ry; o.sp = q.sp; o.wet = wet; o.id = p.id; o.a = q.a; o.hw = hw; n++;
    };
    // (in the water: a person, or an animal - a duck's wake small, a goose's or an otter's bigger)
    for (const p of F.peds) if (!(p.flags & PF.INVEH)) add(p, !!p.swim, p.swim ? (p.d && p.d.ar && p.d.ar.startsWith('pet:') ? (/duck|quail|:y/.test(p.d.ar) ? 2.5 : 4) : 4.5) : 0);
    for (const v of F.vehs) add(v, wcls(m, v.rx, v.ry) > 0, 0);
    mv.length = n;
    if (seen % 120 === 0) for (const [k, q] of pos) if (seen - q.n > 60) pos.delete(k);
    // the light (the shadows fall away from the sun), the dusk the trout rise in, the rain, the wind
    const sky = F.sky || {}, env = this.envB || (this.envB = { day: 1, sx: 0.6, sy: 0.8, dusk: 0, wet: 0, wx: 0, wy: 0, ws: 0 });
    env.day = 1 - Math.min(1, sky.night || 0);
    if (sky.sunDir) { const l = Math.hypot(sky.sunDir.x, sky.sunDir.y) || 1; env.sx = -sky.sunDir.x / l; env.sy = -sky.sunDir.y / l; }
    const mn = sky.minutes ?? 720;
    env.dusk = Math.max(0, 1 - Math.abs(mn - 1170) / 70, 1 - Math.abs(mn - 380) / 70);
    env.wet = Math.max(S.rainK || 0, S.wx ? (S.wx.wet || 0) * 0.8 : 0);
    env.wx = wind.dx || 0; env.wy = wind.dy || 0; env.ws = wind.strength || 0;
    this.onSplash = S.fx && S.fx.splash ? (x, y, k) => S.fx.splash(x, y, k) : null;
    this.update(m, V, now, dt, mv, this._linesOf(S), env);
    this.draw(h.E, (key, make) => h._conv(key, make, true));
  }
  // the bobbers out: everyone else's (client/fishing.js lines: from the server's events), and yours (its prediction)
  _linesOf(S) {
    const FV = S.fish, out = this.lb || (this.lb = []);
    out.length = 0;
    if (!FV) return out;
    const clock = S.loopClock || 0;
    for (const [id, L] of FV.lines) {
      if (id === S.myPedId) continue;
      out.push({ key: 'o' + id, x: L.x, y: L.y, st: L.on ? 2 : clock - (L.bite ?? -9) < 0.8 ? 1 : 0, nib: clock - (L.nib ?? -9) < 0.3, prog: Math.min(1, (clock - L.at) / 14) });
    }
    const Fz = FV.F, mf = S.me && S.me.fishing;
    if (Fz && mf && Fz.ph >= PH.WAIT && Fz.ph < PH.DONE) {
      const at = mf.x !== undefined ? [mf.x, mf.y] : FV.land, P = FV.P;
      if (at) out.push({ key: 'me', x: at[0], y: at[1], st: Fz.ph === PH.FIGHT ? 2 : Fz.ph === PH.BITE ? 1 : 0, nib: Fz.ph === PH.WAIT && P ? nibbles(P).some((s) => Fz.t >= s && Fz.t < s + 0.3) : false, prog: P ? Math.min(1, Fz.t / P.bite) : 0.5 });
    }
    return out;
  }
}
