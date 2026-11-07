// The forklift yards' loading bays checked against the map itself (not the planner's own grid - shared/loadbays.js):
// for every bay the map has (m.loadBays), the way from the pallets to the bay is a real drive (FORK.drive tiles), starts
// at the pallets' row and ends at the bay's front, and every tile of it - with a tile either side - is ground a forklift
// drives on: no building, wall, water, bridge or walk-in floor; no prop (bar the flat ones), no solid prop, no fence
// across it, no parking bay (a parked car's place). The pallets' and the slots' places are the same, and the bay is
// marked: its slots, its sign and its floodlight. Used by test/loadbays.test.js (today's world) and
// test/world3server.test.js (World v3, as the server builds it). -> { bays, problems: [string], lens: [n] }
import { T, TILE } from '../shared/constants.js';
import { FORK } from '../shared/rules-work.js';
import { fenceSegments } from '../shared/fences.js';
import { routeTiles, routeLen, yardSites, BAY } from '../shared/loadbays.js';

const NO = new Set([T.BUILDING, T.WALL, T.WATER, T.DEEP, T.BRIDGE, T.FLOOR, T.COUNTER, T.FIELD]);
const FLAT = new Set(['painted', 'manhole', 'drain', 'oil', 'puddle', 'stain', 'leaves', 'decal', 'crack', 'hopscotch', 'grate']);

export function checkYards(m) {
  const problems = [], lens = [], bays = m.loadBays || [];
  // what's in the way, by tile (only round the yards)
  const near = (x, y) => bays.some((b) => Math.hypot(b.pick.x - x, b.pick.y - y) < 4000 || Math.hypot(b.bay.x - x, b.bay.y - y) < 4000);
  const blocked = new Map();   // tile key -> what
  const key = (tx, ty) => ty * 65536 + tx;
  const mark = (x, y, r, what) => { for (let ty = Math.floor((y - r) / TILE); ty <= Math.floor((y + r) / TILE); ty++) for (let tx = Math.floor((x - r) / TILE); tx <= Math.floor((x + r) / TILE); tx++) if (!blocked.has(key(tx, ty))) blocked.set(key(tx, ty), what); };
  for (const p of m.props) if (p && !FLAT.has(p.t) && near(p.x, p.y)) mark(p.x, p.y, 4, `a ${p.t}`);
  for (const [, arr] of m.solidProps) for (const e of arr) if (!e.off && near(e.x, e.y)) mark(e.x, e.y, e.r, 'a solid prop');
  for (const s of fenceSegments(m)) {
    if (!near(s.x0, s.y0) && !near(s.x1, s.y1)) continue;
    const n = Math.max(1, Math.ceil(Math.hypot(s.x1 - s.x0, s.y1 - s.y0) / 8));
    for (let k = 0; k <= n; k++) mark(s.x0 + ((s.x1 - s.x0) * k) / n, s.y0 + ((s.y1 - s.y0) * k) / n, 2, 'a fence');
  }
  for (const sp of m.parking || []) if (sp && near(sp.x, sp.y)) mark(sp.x, sp.y, 30, 'a parking bay');
  const why = (tx, ty) => { const t = m.tileAt(tx, ty); return NO.has(t) ? `tile ${t}` : blocked.get(key(tx, ty)) || null; };
  const clearRound = (tx, ty) => { for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const w = why(tx + dx, ty + dy); if (w) return `${w} at ${tx + dx},${ty + dy}`; } return null; };
  const tileOf = (q) => [Math.floor(q.x / TILE), Math.floor(q.y / TILE)];
  for (const b of bays) {
    const nm = b.yard.name, len = routeLen(b.route);
    lens.push(len);
    if (!(len >= FORK.drive[0] && len <= FORK.drive[1])) problems.push(`${nm}: the drive is ${len.toFixed(1)} tiles`);
    if (Math.abs(len - b.len) > 1) problems.push(`${nm}: its len ${b.len} isn't its route's ${len.toFixed(1)}`);
    // (it starts in front of the pallets and ends in front of the bay: within the apron and a tile)
    const reach = (BAY.apron + 2) * TILE + 40, [sx, sy] = b.route[0], [ex, ey] = b.route[b.route.length - 1];
    if (Math.min(...b.pick.pallets.map((q) => Math.hypot((sx + 0.5) * TILE - q.x, (sy + 0.5) * TILE - q.y))) > reach) problems.push(`${nm}: the route doesn't start at the pallets`);
    if (Math.min(...b.bay.slots.map((q) => Math.hypot((ex + 0.5) * TILE - q.x, (ey + 0.5) * TILE - q.y))) > reach) problems.push(`${nm}: the route doesn't end at the bay`);
    for (const [tx, ty] of routeTiles(b.route)) { const w = clearRound(tx, ty); if (w) { problems.push(`${nm}: the route at ${tx},${ty} - ${w}`); break; } }
    for (const q of [...b.pick.pallets, ...b.bay.slots]) { const [tx, ty] = tileOf(q); const w = why(tx, ty); if (w) problems.push(`${nm}: a pallet's or a slot's place at ${tx},${ty} - ${w}`); }
    // (the forks come at the pallets and go into the bay from their front: the tile in front of each is clear)
    for (const [L, f] of [[b.pick.pallets, b.pick], [b.bay.slots, b.bay]]) for (const q of L) { const w = why(Math.floor((q.x - f.fx * 56) / TILE), Math.floor((q.y - f.fy * 56) / TILE)); if (w) problems.push(`${nm}: in front of ${q.x},${q.y} - ${w}`); }
    // marked: the slots (two pallets each), the sign, the floodlight; the slots a slot's width apart in a row
    if (b.bay.slots.length !== Math.ceil(FORK.pallets / 2)) problems.push(`${nm}: ${b.bay.slots.length} slots`);
    if (!b.bay.sign || !b.bay.lamps || !b.bay.lamps.length) problems.push(`${nm}: no sign or floodlight`);
    for (let i = 1; i < b.bay.slots.length; i++) if (Math.abs(Math.hypot(b.bay.slots[i].x - b.bay.slots[i - 1].x, b.bay.slots[i].y - b.bay.slots[i - 1].y) - BAY.slotW) > 1) problems.push(`${nm}: slots ${i} and ${i + 1} aren't a slot apart`);
    if (Math.hypot(b.bay.x - b.pick.x, b.bay.y - b.pick.y) < 15 * TILE) problems.push(`${nm}: the bay's beside the pallets`);
  }
  // no two yards share ground
  for (let i = 0; i < bays.length; i++) for (let k = i + 1; k < bays.length; k++) for (const A of [bays[i].pick, bays[i].bay]) for (const Bq of [bays[k].pick, bays[k].bay]) if (Math.hypot(A.x - Bq.x, A.y - Bq.y) < 4 * TILE) problems.push(`${bays[i].yard.name} and ${bays[k].yard.name} overlap`);
  return { bays, problems, lens, sites: yardSites(m) };
}
