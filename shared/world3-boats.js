// Every boat that looks usable is usable (the owner, 11-17 21:27: "Small wooden boats/canoes pulled up on the shore ... you
// can't get in. Fix: every boat that looks usable is usable - a beached canoe/rowboat is a real vehicle (get in, push off,
// paddle)"; the audit's deadBoat, 103 on 11-19). The map's canoe and rowboat props - pulled up on a beach or a bank, or
// lying on the water - become real boats: a river kayak for a canoe, a rowboat for a rowboat (shared/vehicles.js), each
// waiting in the water right beside where it lay, its bow out, through the marina's list (m.marina: the parked boats,
// server/systems/traffic.js marinaModel - anyone's to take). A prop on stands (lift: stored) stays a prop. The moored
// sailboats, yachts and fishing boats stay scenery: making them marina vehicles is the owner's call (logged).
// For the whole-world build's done hook (shared/world3-world.js), after the props are final.
//   boatsAfloat3(m) -> { made, kept }
import { TILE, T } from './constants.js';
import { dropProps } from './world3-tidy.js';
import { VEHICLES } from './vehicles.js';

export const BOAT_AS = { canoe: 'kayak', rowboat: 'rowboat' };
const REACH = 3;   // (tiles from the prop to the water it's put in)

const wet = (m, x, y) => { const t = m.tileAtPx(x, y); return t === T.WATER || t === T.DEEP; };

// its hull (len x wid, at x, y heading a) all on water: points along and across it, as the placement lint looks
// (tools/placementlint.mjs boats)
// the rocks standing in the water (the lint's ROCKS: a sea stack, a seal rock, a boulder, an outcrop) - a hull keeps off
// their round
const ROCK_R = { seastack: (p) => p.r || 24, sealrock: () => 22, boulder: (p) => (p.s || 52) * 0.5, outcrop: (p) => Math.max(24, p.r || 0), redstack: (p) => p.r || 24, rstack: (p) => p.r || 24 };
function hullWet(m, x, y, a, len, wid, rocks) {
  const ca = Math.cos(a), sa = Math.sin(a);
  for (let s = -len / 2 + 6; s <= len / 2 - 6; s += 6) for (const w of [-wid / 2 + 6, 0, wid / 2 - 6]) {
    const px = x + ca * s - sa * w, py = y + sa * s + ca * w;
    if (!wet(m, px, py)) return false;
    if (rocks) for (const q of rocks) if (Math.hypot(q.x - px, q.y - py) < q.r + 4) return false;
  }
  return true;
}
// where the boat goes: { x, y, a } in open water beside the prop - its whole hull on water, its bow out (away from the
// land), the nearest such - or null
export function afloatSpot(m, p, model, rocksNear = null) {
  const V = VEHICLES[model], L = (V && V.L) || 64, W = (V && V.W) || 28;
  const rocks = rocksNear ? rocksNear(p.x, p.y) : null;
  if (hullWet(m, p.x, p.y, p.a || 0, L, W, rocks)) return { x: Math.round(p.x), y: Math.round(p.y), a: p.a || 0 };
  let best = null;
  for (let r = 1; r <= REACH + 2 && !best; r++) {
    for (let k = 0; k < 16; k++) {
      const ang = (k / 16) * Math.PI * 2, dx = Math.cos(ang), dy = Math.sin(ang);
      const x = p.x + dx * (r * TILE + L / 2), y = p.y + dy * (r * TILE + L / 2);   // (its stern r tiles out from where it lay)
      if (!hullWet(m, x, y, ang, L, W, rocks) || !wet(m, x + dx * (L / 2 + TILE), y + dy * (L / 2 + TILE))) continue;
      const d = r + (1 - (wet(m, x - dy * W, y + dx * W) + wet(m, x + dy * W, y - dx * W)) / 2) * 0.5;   // (water either side too: not a channel's lip)
      if (!best || d < best.d) best = { x: Math.round(x), y: Math.round(y), a: ang, d };
    }
  }
  return best ? { x: best.x, y: best.y, a: best.a } : null;
}

export function boatsAfloat3(m) {
  const out = { made: 0, kept: 0 };
  if (!Array.isArray(m.props) || !m.tileAtPx) return out;
  m.marina ||= [];
  const gone = new Set(), RC = 8 * TILE, grid = new Map();
  for (const q of m.props) if (q && ROCK_R[q.t]) { const k = Math.floor(q.y / RC) * 100000 + Math.floor(q.x / RC); let l = grid.get(k); if (!l) grid.set(k, (l = [])); l.push({ x: q.x, y: q.y, r: ROCK_R[q.t](q) }); }
  const rocksNear = (x, y) => { const out = [], cx = Math.floor(x / RC), cy = Math.floor(y / RC); for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) for (const q of grid.get((cy + j) * 100000 + cx + i) || []) out.push(q); return out; };
  for (const p of m.props) {
    if (!p || !BOAT_AS[p.t] || p.lift) continue;
    const s = afloatSpot(m, p, BOAT_AS[p.t], rocksNear);
    if (!s) { out.kept++; continue; }
    m.marina.push({ x: s.x, y: s.y, a: s.a, kind: BOAT_AS[p.t], beached: true });
    gone.add(p);
    out.made++;
  }
  if (gone.size) dropProps(m, gone);
  return out;
}
