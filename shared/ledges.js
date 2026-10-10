// One-way drops at the waterfalls (2026-10-08, the user: "Waterfalls: you should be able to go down them while swimming
// but can't go up them. Same with the cliff the waterfall is on: drop down but not climb back up it.")
//
// Every waterfall in the wilds faces south (the water falls toward the camera), so every drop here goes south. A drop
// tile lets you in from above or the side and never from below; once your middle is on one you fall: carried south,
// fast, whatever you're pressing, until you're off it at the foot. Two kinds:
//   - the falls' chute: the water over the lip (or the rocky notch it runs through), as wide as the falls;
//   - the cliff band the falls go over (solid rock - WALL - in a short run, 1-4 rows, with open ground above and
//     below): you can step off its top edge and drop to the foot, and it stays solid from below.
// Worked out from the map's nature sites when first asked for (server and client alike: shared/physics.js runs it on
// both, the client predicting its own moves) and kept beside the map, not in it - the city's data, and the hashes of
// it that the browsers keep the world and its art under (tools/stamp-version.mjs), stay as they are.
import { TILE, T } from './constants.js';

const CACHE = new WeakMap();
const OPEN = (t) => t !== T.WALL && t !== T.BUILDING && t !== T.COUNTER;
const NATURAL = (t) => t === T.WATER || t === T.DEEP || t === T.GRASS || t === T.DIRT || t === T.SAND || t === T.FIELD;   // (never a road or a path across it)

// the falls: { x, y, w, drop } (px) of each site that has one
function fallsOf(m) {
  const out = [];
  for (const s of m.natureSites || []) {
    if (s.falls && Number.isFinite(s.falls.x) && Number.isFinite(s.falls.y)) out.push({ x: s.falls.x, y: s.falls.y, w: s.falls.w || 64, drop: s.falls.drop || 40, gorge: s.gorge || null });
    else if (s.kind === 'coastfalls' && Number.isFinite(s.x)) out.push({ x: s.x, y: s.y, w: 40, drop: 66 });   // (the creek over the basalt cliff onto the beach)
  }
  return out;
}

function build(m) {
  const W = m.w, H = m.h, set = new Set(), tile = (tx, ty) => (!m.inside(tx, ty) ? T.WALL : m.tiles[m.idx(tx, ty)]);
  for (const f of fallsOf(m)) {
    const fx = Math.floor(f.x / TILE), fy = Math.floor(f.y / TILE), half = Math.ceil(f.w / 2 / TILE);
    // the cliff band: solid rock near the falls, flooded out to the band's ends (within reach)
    const band = new Set(), stack = [];
    for (let ty = fy - 3; ty <= fy + 2; ty++) for (let tx = fx - half - 2; tx <= fx + half + 2; tx++) if (tile(tx, ty) === T.WALL) { const i = m.idx(tx, ty); if (!band.has(i)) { band.add(i); stack.push(tx, ty); } }
    while (stack.length) {
      const ty = stack.pop(), tx = stack.pop();   // (the stack holds tiles as (tx, ty): an index is the map's, not decoded)
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const x = tx + dx, y = ty + dy, j = m.idx(x, y);
        if ((dx || dy) && Math.abs(x - fx) <= half + 16 && y >= fy - 6 && y <= fy + 4 && !band.has(j) && tile(x, y) === T.WALL) { band.add(j); stack.push(x, y); }
      }
    }
    // each column of it: a short run of rock with open ground above and below drops
    let r0 = 1e9, r1 = -1e9;
    const cols = new Map();
    for (const i of band) { const tx = i % W, ty = (i / W) | 0; const c = cols.get(tx); if (!c) cols.set(tx, [ty, ty]); else { c[0] = Math.min(c[0], ty); c[1] = Math.max(c[1], ty); } }
    for (const [tx, [a, b]] of cols) {
      if (b - a > 3 || !OPEN(tile(tx, a - 1)) || !OPEN(tile(tx, b + 1))) continue;
      let solid = true;
      for (let ty = a; ty <= b; ty++) if (tile(tx, ty) !== T.WALL) solid = false;
      if (!solid) continue;
      for (let ty = a; ty <= b; ty++) set.add(m.idx(tx, ty));
      r0 = Math.min(r0, a); r1 = Math.max(r1, b);
    }
    if (r0 <= r1) {
      // the notch the water runs through between the rocks (rock on both sides of the falls): one way too, as wide as
      // the falls (a gap that isn't at the falls - steps down the cliff - stays two-way)
      const ks = [...cols.keys()];
      if (ks.some((c) => c < fx) && ks.some((c) => c > fx)) for (let ty = r0; ty <= r1; ty++) for (let tx = fx - half; tx <= fx + half; tx++) if (OPEN(tile(tx, ty))) set.add(m.idx(tx, ty));
    } else {
      // no solid rock: the ledge as it is drawn (client/art2/game/statics.js: the falls reach about 60 px past the water
      // either side - a small one barely past it), out to the gorge's walls where there are some (solid already), from
      // the drop's top to the falls' foot - the water over the lip and the rock either side of it
      const reach = f.w / 2 + (f.drop >= 30 ? 60 : 16);
      let x0 = f.x - reach, x1 = f.x + reach;
      for (const g of f.gorge || []) if (Math.abs(g.y - f.y) < 40) { if (g.x < f.x) x0 = Math.min(x0, g.x + g.len / 2); else x1 = Math.max(x1, g.x - g.len / 2); }
      const t0 = Math.floor((f.y - Math.max(f.drop, TILE)) / TILE);
      for (let ty = t0; ty <= fy; ty++) for (let tx = Math.floor(x0 / TILE); tx <= Math.floor(x1 / TILE); tx++) if (NATURAL(tile(tx, ty))) set.add(m.idx(tx, ty));
    }
  }
  return set;
}

// the drop tiles (a Set of tile indices), worked out once per map
export function dropsOf(m) {
  if (!m || !m.tiles) return null;
  let s = CACHE.get(m);
  if (!s) { s = build(m); CACHE.set(m, s); }
  return s;
}
// is the tile under (x, y) a drop?
export function onDrop(m, x, y) {
  const s = dropsOf(m);
  if (!s || !s.size) return false;
  const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
  return s.has(m.idx(tx, ty));
}
export const DROP_SPEED = 320;   // px/s: how fast you go down a drop
