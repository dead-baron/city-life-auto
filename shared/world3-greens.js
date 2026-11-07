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

// ---- what's meant to be seen, in sight (the owner, 11-06: "make sure things that are supposed to be visible are
// visible" - the park's chess table behind a tree; tools/visaudit.mjs measures it as drawn) ----------------------------
// A tree's crown is drawn up the screen over whatever stands north of it: a door, a standing sign, a chess table, an ATM,
// a bus stop. Each such thing as { x, y (its ground point), hw (half its width), z0, z1 (its height on screen) }:
const SEEN = {
  cafetable: [16, 0, 16], textsign: [0, 0, 0], mapboard: [12, 0, 32], busstop: [28, 0, 40], campfire: [10, 0, 10],
  shower: [10, 0, 40], fishtable: [16, 0, 16], rods: [12, 0, 20], hoop: [14, 0, 56], vend_cola: [10, 0, 30],
};
export function sightTargets(m) {
  const out = [];
  for (const p of m.pois || []) {
    if (!p || p.x === undefined) continue;
    const b = p.b !== undefined ? m.buildings[p.b] : null;
    if (b && !b.gone && p.y >= (b.ty + b.th) * TILE - 4) out.push({ x: p.x, y: (b.ty + b.th) * TILE, hw: 16, z0: 16, z1: 56 });   // (a door on the front: its top, the sign over it)
    else if (p.kind === 'atm' || p.kind === 'vending') out.push({ x: p.x, y: p.y, hw: 8, z0: 0, z1: 24 });
  }
  for (const p of m.props) {
    const s = SEEN[p.t];
    if (!s || (p.t === 'cafetable' && !p.chess)) continue;
    if (p.t === 'textsign') { const z = p.z || 40; out.push({ x: p.x, y: p.y, hw: Math.min(150, String(p.text || '').length * 7 + 8), z0: z, z1: z + 18 }); continue; }
    out.push({ x: p.x, y: p.y, hw: s[0], z0: s[1], z1: s[2] });
  }
  return out;
}
// (a tree's crown on screen, by species - [half its width, its height] at scale 1, as client/art2/game/statics.js SPECIES
// draws it, a little inside the sprite's margin; the trunk's bottom quarter hides little)
const CROWNS = { oak: [60, 124], leaning: [98, 133], coconut: [68, 151], cocoUp: [68, 151], royal: [50, 150], date: [52, 140], fanSkirt: [46, 126],
  coastCypress: [72, 98], banana: [54, 99], paloVerde: [48, 115], joshua: [46, 101], whitePine: [44, 114], cypress: [16, 108], young: [24, 114],
  fir: [34, 134], cedar: [34, 138], pondPine: [30, 138], pine: [30, 138], mtnPine: [32, 150], mtnFir: [36, 157], larch: [34, 154] };
const CROWN0 = [44, 128];
const crownOf = (p) => CROWNS[p.sp] || (/^palm_/.test(p.t) ? CROWNS.date : CROWN0);
const hidesIt = (p, q) => {
  const k = p.k || 1, [cw, ch] = crownOf(p), dy = p.y - q.y;
  return Math.abs(p.x - q.x) < q.hw + cw * k && dy > Math.max(6, ch * k * 0.25 - q.z1) && dy < ch * k - q.z0;
};
const grid = (list) => { const g = new Map(); for (const q of list) { const k = Math.floor(q.y / 512) * 65536 + Math.floor(q.x / 512); if (!g.has(k)) g.set(k, []); g.get(k).push(q); } return g; };
const hidden = (g, p) => {
  for (let cy = Math.floor((p.y - 220) / 512); cy <= Math.floor(p.y / 512); cy++) for (let cx = Math.floor((p.x - 260) / 512); cx <= Math.floor((p.x + 260) / 512); cx++) for (const q of g.get(cy * 65536 + cx) || []) if (hidesIt(p, q)) return q;
  return null;
};
// every tree whose crown hides something meant to be seen: [{ p, q }] (test/visaudit.test.js: none)
export function sightBlocked(m) {
  const g = grid(sightTargets(m)), out = [];
  for (const p of m.props) if (TREES.test(p.t)) { const q = hidden(g, p); if (q) out.push({ p, q }); }
  return out;
}
// Each such tree moves aside - along its row, the nearest spot on the same ground where it hides nothing, off the doors
// and clear of what stands there - or, with none near, gives way to a low shrub (a planter on a pavement). Nothing is
// taken away: every prop keeps its number. Last in the world's build (shared/world3-world.js's done hook).
export function sightlines3(m) {
  const out = { moved: 0, lowered: 0 };
  const g = grid(sightTargets(m)), sg = spanGrid(signSpans(m)), fests = m.props.filter((f) => f.t === 'festoon');
  const tileOf = (x, y) => m.tileAtPx(x, y);
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
    const q = hidden(g, p);
    if (!q) return;
    const t0 = tileOf(p.x, p.y), self = m.propSolid.get(pi) || null, k = p.k || 1, side = p.x < q.x ? -1 : 1;
    const step = Math.ceil(q.hw + crownOf(p)[0] * k + 6 - Math.abs(p.x - q.x));
    for (const s of [side, -side]) for (let d = 0; d < 4 * TILE; d += 16) {
      const x = Math.round(p.x + s * (s === side ? step : step + 2 * Math.abs(p.x - q.x)) + s * d);
      if (tileOf(x, p.y) !== t0 || hidden(g, { ...p, x }) || blocks(sg, x, p.y) || solidNear(x, p.y, self)) continue;
      moveProp(m, fests, p, self, x);
      out.moved++;
      return;
    }
    const paved = t0 === T.SIDEWALK || t0 === T.PLAZA;
    p.t = paved ? PLANTERS[Math.floor(hh(Math.floor(p.x / TILE), Math.floor(p.y / TILE), 66) * 2)] : 'bush_c'; delete p.sp; delete p.k; out.lowered++;
  });
  // a standing sign out from under a deck (a highway over the street is drawn DECK_LIFT px up: over a sign under it or
  // a tile or three north of it - the owner's 11-06 "GUL..." sign half under the highway): along its row to where none is over it
  // (the elevated roads as their edges: the deck layer, map.js m.deck, isn't laid yet when this runs)
  const decks = [];
  for (const e of m.edges || []) if (e.lvl === 1 || e.lvl === 'ramp') for (let i = 1; i < e.pts.length; i++) { const a = e.pts[i - 1], b = e.pts[i]; decks.push([a.x, a.y, b.x, b.y, e.hw + 6, Math.min(a.x, b.x) - e.hw - 6, Math.max(a.x, b.x) + e.hw + 6, Math.min(a.y, b.y) - e.hw - 6, Math.max(a.y, b.y) + e.hw + 6]); }
  const deckAt = (X, Y) => {
    for (const [ax, ay, bx, by, r, x0, x1, y0, y1] of decks) {
      if (X < x0 || X > x1 || Y < y0 || Y > y1) continue;
      const dx = bx - ax, dy = by - ay, t = Math.max(0, Math.min(1, ((X - ax) * dx + (Y - ay) * dy) / (dx * dx + dy * dy || 1)));
      if (Math.hypot(ax + dx * t - X, ay + dy * t - Y) < r) return true;
    }
    return false;
  };
  const under = (x, p) => {
    const hw = Math.min(150, String(p.text || '').length * 7 + 8), z = p.z || 40;
    for (let Y = p.y - 16; Y <= p.y + 150 - z; Y += 16) for (let X = x - hw; X <= x + hw; X += 16) if (deckAt(X, Y)) return true;
    return false;
  };
  for (const p of m.props) {
    if (p.t !== 'textsign' || !under(p.x, p)) continue;
    const t0 = tileOf(p.x, p.y);
    let to = null;
    for (let d = TILE; d <= 16 * TILE && to === null; d += TILE) for (const s of [1, -1]) { const x = p.x + s * d; if (tileOf(x, p.y) === t0 && !under(x, p)) { to = x; break; } }
    if (to !== null) { p.x = to; out.signs = (out.signs || 0) + 1; }
  }
  return out;
}
