// The street trees (the owner, notes 2: "Some building and storefront signs are blocked by trees like these palm
// trees here, it would be good to be able to see the signs clearly ... Also can we add more variety in city dressing
// and decoration for plants/trees/city greens/vegetation than palm trees in so many places?"):
// - the palms on the city's pavements and plazas become the district's own street trees and planters - plane trees,
//   ginkgos, maples and flowering trees, a cherry or a magnolia, cypress and olive in the rich districts, flower
//   planters and box planters - with only some palms left (more on the Neon Strip and the Pink Mile than downtown).
//   The palms stay where they belong: the beach districts, the desert towns (Lucky Mesa's Strip), by the sea, and down
//   the boulevards' medians.
// - a tree standing on the pavement in front of a storefront's sign (the camera looks north: a tree's crown south of a
//   facade is drawn over it) moves along the pavement to the gap between two storefronts or two signs - its lights
//   strung to the next tree follow it - or, with no gap near, gives way to a low flower planter.
// For the whole-world build only (shared/world3-world.js's done hook, before the clutter is cleared). Deterministic:
// integer hashes and arithmetic.
import { TILE, T } from './constants.js';
import { DISTRICTS, WILD_STYLES } from './mapcore.js';

const TREES = /^(tree_a|tree_b|palm_[a-d]|palm_s)$/;
const PALM = /^palm_/;
// in front of a sign: this far south of its facade (px); a crown this far from a sign's span blocks it
// (crown: a street tree's crown is drawn about 2.5 tiles across and 4 up from its trunk - over a storefront's sign
// whatever the species; narrow: a front this wide or less is all sign - the art lays its lettering and its neon where
// the shop's door leaves room, near enough the whole width)
export const SIGN_VIEW = { ahead: 6 * TILE, crown: 40, edge: 12, reach: 8 * TILE, narrow: 12 };
// what a palm on a pavement becomes, by district style: [the share of palms kept, the trees (tree_a's species), the
// share of planters]
const PALETTE = {
  nightlife: [0.35, ['cherry', 'ginkgo', 'redMaple', 'flowerTree'], 0.2],
  redlight: [0.5, ['cherry', 'flowerTree', 'ginkgo'], 0.15],
  luxury: [0.35, ['cypress', 'olive', 'magnolia', 'cypress'], 0.15],
  harbor: [0.2, ['street', 'young', 'maple', 'street'], 0.15],
  towers: [0.12, ['streetPl', 'ginkgo', 'street', 'redMaple'], 0.3],
  civic: [0.1, ['streetPl', 'magnolia', 'ginkgo'], 0.2],
  arts: [0.1, ['ginkgo', 'cherry', 'street'], 0.25],
  oldtown: [0.1, ['cypress', 'olive', 'cherry', 'street'], 0.3],
};
const PALETTE0 = [0.12, ['street', 'maple', 'flowerTree', 'ginkgo'], 0.25];
const PLANTERS = ['planter_fl', 'planter_sq', 'planter_fl', 'planter_g'];
const hh = (a, b, s) => { let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(s | 0, 2246822519); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

// the signs along the city's storefronts, each as the span of the facade it covers: { x0, x1, fy (px: the facade's
// foot), b }. A sign's span is about as wide as its lettering, inside its building's front.
export function signSpans(m) {
  const out = [];
  for (const b of m.buildings) {
    if (b.gone || b.back || !b.signs || !b.signs.length) continue;
    const bx0 = b.tx * TILE + SIGN_VIEW.edge, bx1 = (b.tx + b.tw) * TILE - SIGN_VIEW.edge, fy = (b.ty + b.th) * TILE;
    if (bx1 <= bx0) continue;
    const front = b.signs.filter((s) => Math.abs(s.y - fy) <= TILE);   // (the signs on the front wall)
    if (!front.length) continue;
    if (b.tw <= SIGN_VIEW.narrow) { out.push({ x0: bx0, x1: bx1, fy, b }); continue; }
    for (const s of front) {
      const half = Math.min(260, (s.text || '').length * 9.5 + 14 + TILE);   // (its lettering, give or take a tile either way)
      const x0 = Math.max(bx0, s.x - half), x1 = Math.min(bx1, s.x + half);
      if (x1 > x0) out.push({ x0, x1, fy, b });
    }
  }
  return out;
}
const spanGrid = (spans) => {
  const g = new Map();
  for (const s of spans) for (let cx = Math.floor(s.x0 / 512); cx <= Math.floor(s.x1 / 512); cx++) { const k = Math.floor(s.fy / 512) * 65536 + cx; if (!g.has(k)) g.set(k, []); g.get(k).push(s); }
  return g;
};
// the sign a tree at (x, y) would stand in front of, or null
const blocks = (g, x, y) => {
  for (let cy = Math.floor((y - SIGN_VIEW.ahead) / 512); cy <= Math.floor(y / 512); cy++) for (let cx = Math.floor((x - 300) / 512); cx <= Math.floor((x + 300) / 512); cx++) {
    for (const s of g.get(cy * 65536 + cx) || []) {
      if (y <= s.fy || y > s.fy + SIGN_VIEW.ahead) continue;
      if (x > s.x0 - SIGN_VIEW.crown && x < s.x1 + SIGN_VIEW.crown) return s;
    }
  }
  return null;
};
// every tree that stands in front of a storefront's sign: [{ p, s }] (test/world3server.test.js: none)
export function signsBlocked(m) {
  const g = spanGrid(signSpans(m)), out = [];
  for (const p of m.props) if (TREES.test(p.t)) { const s = blocks(g, p.x, p.y); if (s) out.push({ p, s }); }
  return out;
}

export function streetGreens3(m, H) {
  const out = { palms: 0, kept: 0, trees: 0, planters: 0, moved: 0, lowered: 0 };
  const tileOf = (x, y) => m.tileAtPx(x, y);
  const paved = (t) => t === T.SIDEWALK || t === T.PLAZA;
  const fests = m.props.filter((f) => f.t === 'festoon');
  // 1. the palms on the pavements
  for (const p of m.props) {
    if (!PALM.test(p.t)) continue;
    const tx = Math.floor(p.x / TILE), ty = Math.floor(p.y / TILE);
    if (!m.inside(tx, ty) || !paved(m.tiles[m.idx(tx, ty)])) continue;
    const D = DISTRICTS[m.dist[m.idx(tx, ty)]];
    if (!D || WILD_STYLES.has(D.style) || D.style === 'beach' || D.isl === 'Red Rock Desert') continue;
    if (m.distSea && m.distSea[m.idx(tx, ty)] < 24) continue;   // (quarter tiles: by the sea)
    out.palms++;
    const [keep, sp, planters] = PALETTE[D.style] || PALETTE0, u = hh(tx, ty, 61);
    if (u < keep) { out.kept++; continue; }
    if (u < keep + (1 - keep) * planters && !festoonsAt(fests, p).length) { p.t = PLANTERS[Math.floor(hh(tx, ty, 62) * PLANTERS.length)]; delete p.sp; delete p.k; out.planters++; continue; }
    p.t = 'tree_a'; p.sp = sp[Math.floor(hh(tx, ty, 63) * sp.length)]; p.k = Math.round((1.15 + hh(tx, ty, 64) * 0.2) * 100) / 100; out.trees++;
  }
  // 2. no tree in front of a sign
  const spans = signSpans(m), g = spanGrid(spans), gone = new Set();
  const doors = new Set();
  for (const b of m.buildings) {
    // (the columns in front of a door, keyed by the row of the facade's foot)
    if (b.door) for (let dx = -1; dx <= 1; dx++) doors.add((b.door.tx + dx) * 65536 + b.ty + b.th);
    if (b.walkIn && b.walkIn.south) for (const u of b.walkIn.units) for (let dx = -1; dx <= u.door.w; dx++) doors.add((u.door.tx + dx) * 65536 + b.ty + b.th);
  }
  const solidNear = (x, y, self) => {
    const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!m.inside(tx + dx, ty + dy)) continue;
      for (const e of m.solidProps.get(m.idx(tx + dx, ty + dy)) || []) if (e !== self && Math.hypot(e.x - x, e.y - y) < e.r + 22) return true;
    }
    return false;
  };
  m.props.forEach((p, pi) => {
    if (!TREES.test(p.t)) return;
    const s = blocks(g, p.x, p.y);
    if (!s) return;
    const t0 = tileOf(p.x, p.y), self = m.propSolid.get(pi) || null;
    // the gaps along this facade: the ends of the signed buildings' fronts and between the signs, nearest first
    const cand = [];
    for (const q of spans) if (Math.abs(q.fy - s.fy) < 2 * TILE && Math.abs(q.x0 - p.x) < SIGN_VIEW.reach + 400) cand.push(q.b.tx * TILE, (q.b.tx + q.b.tw) * TILE, q.x0 - SIGN_VIEW.crown - 4, q.x1 + SIGN_VIEW.crown + 4);
    cand.sort((a, c) => Math.abs(a - p.x) - Math.abs(c - p.x));
    for (const x of cand) {
      if (Math.abs(x - p.x) > SIGN_VIEW.reach) break;
      if (blocks(g, x, p.y) || tileOf(x, p.y) !== t0 || doors.has(Math.floor(x / TILE) * 65536 + Math.round(s.fy / TILE)) || solidNear(x, p.y, self)) continue;
      moveProp(m, fests, p, self, x);
      out.moved++;
      return;
    }
    // no gap near: a low planter there instead (the lights that were strung to it come down)
    for (const f of festoonsAt(fests, p)) gone.add(f);
    p.t = PLANTERS[Math.floor(hh(Math.floor(p.x / TILE), Math.floor(p.y / TILE), 65) * 2)]; delete p.sp; delete p.k; out.lowered++;
  });
  if (gone.size && H && H.removeProps) { const at = new Set([...gone].map((f) => f.x + ',' + f.y)); H.removeProps(m, (x, y) => at.has(x + ',' + y)); out.lights = gone.size; }
  return out;
}
// lights strung from this tree to the next (a festoon starting or ending at it)
const festoonsAt = (fests, p) => fests.filter((f) => Math.abs(f.y - p.y) < 40 && (Math.abs(f.x - p.x) < 6 || Math.abs(f.x + (f.tx || 0) - p.x) < 6));
// a tree moved along the pavement to x: its solid post with it, the lights strung to it still to it
function moveProp(m, fests, p, e, x) {
  const dx = x - p.x;
  for (const f of festoonsAt(fests, p)) {
    if (Math.abs(f.x - p.x) < 6) { f.x += dx; f.tx = (f.tx || 0) - dx; } else f.tx = (f.tx || 0) + dx;
  }
  if (e) {
    const k0 = m.idx(Math.floor(e.x / TILE), Math.floor(e.y / TILE)), arr = m.solidProps.get(k0);
    if (arr) { const i = arr.indexOf(e); if (i >= 0) arr.splice(i, 1); if (!arr.length) m.solidProps.delete(k0); }
    e.x += dx;
    const k1 = m.idx(Math.floor(e.x / TILE), Math.floor(e.y / TILE));
    if (!m.solidProps.has(k1)) m.solidProps.set(k1, []);
    m.solidProps.get(k1).push(e);
  }
  p.x = x;
}
