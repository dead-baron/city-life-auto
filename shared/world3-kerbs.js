// Street parking (the owner, notes 2: "On some streets we can have cars parked along the side of the road ... a good
// distinct detail in some neighborhoods to have street parking in some areas just to diversify the cities"). Midtown's
// hand-laid streets had their parking lanes and kerbside bays already (shared/world3-midtown.js); now some of the
// generator's own side streets in the older and residential districts get them too:
// - kerbStreets3 (the lines hook, before the network is built): about half the plain two-way side streets ('st') of
//   the city's houses, apartments, old town and Southside districts - whole streets, by name, so a street is one or the
//   other along its length - are laid a little wider (KERB.w tiles) with a parking lane along each kerb (KERB.park px):
//   the traffic lane inside it as wide as before (shared/roadcore.js laneOffset), the lane's line and the bays' ticks
//   painted (client/art2/game/groundbake.js lineSpec). Never a main road (an avenue, a boulevard, an arterial), a
//   one-way street, a hand plan's street (they lay their own) or a street of a district with no pavements.
// - kerbBays3 (the done hook, once the street furniture, the bus stops and the crossings are in): a bay every
//   KERB.every px along each such lane - none near a junction or a dead end's turning circle, a zebra crossing, a
//   hydrant, a bus stop, a driveway or a garage, on a bridge or off the asphalt - each a parking spot by the kerb
//   ({ kerb: true }: server/systems/traffic.js parks a car in most of them when nothing's passing), facing the way the
//   traffic on its side runs. The traffic lanes stay clear (test/world3server.test.js checks).
// For the whole-world build only (shared/world3-world.js). Deterministic: integer hashes and arithmetic.
import { TILE, T } from './constants.js';
import { DISTRICTS } from './mapcore.js';
import { pointAt, measure } from './geom.js';
import { zebraCrossings } from './roadcore.js';
import { sidewalkPx } from './roads.js';
import { CITY3 } from './world3-city.js';

export const KERB = {
  styles: new Set(['houses', 'apartments', 'oldtown', 'southside']),
  share: 0.5,       // of the side streets there
  w: 8,             // tiles: the street's width with its two parking lanes
  park: 44,         // px: each parking lane
  every: 150,       // px between bays
  junction: 4 * TILE,   // px clear of a junction box's edge (and of a turning circle's)
  crossing: 5 * TILE,   // px clear of a zebra crossing's centre
  hydrant: 2.5 * TILE, busstop: 6 * TILE, drive: 3.5 * TILE,
};
const CITY = new Set(CITY3.map((c) => c.d));   // (the city's districts: not the small towns, whose lots are laid tight to their streets)
const hh = (a, b) => { let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ 0x2545f491; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const nameHash = (s) => { let h = 7; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h; };

// lines: the generator's lines (px); handAt(tx, ty): a hand plan's ground. -> how many streets got their lanes
export function kerbStreets3(lines, m, handAt) {
  let n = 0;
  const distAt = (p) => { const tx = Math.floor(p.x / TILE), ty = Math.floor(p.y / TILE); return m.inside(tx, ty) ? DISTRICTS[m.dist[m.idx(tx, ty)]] : null; };
  for (const l of lines) {
    if (l.kind !== 'st' || (l.lvl || 0) !== 0 || l.oneway || l.park || l.hand || l.bridge || (l.w && l.w > 7) || l.pts.length < 2) continue;
    const mid = l.pts[l.pts.length >> 1], D = distAt(mid);
    if (!D || !CITY.has(D.id) || !KERB.styles.has(D.style) || !sidewalkPx('st', D.style)) continue;
    if (l.pts.some((p) => { const d = distAt(p); return !d || d.id !== D.id || handAt(Math.floor(p.x / TILE), Math.floor(p.y / TILE)); })) continue;
    if (hh(nameHash(l.name || `${Math.round(l.pts[0].x)},${Math.round(l.pts[0].y)}`), D.id) >= KERB.share) continue;
    l.w = KERB.w; l.park = KERB.park; n++;
  }
  return n;
}

// -> { streets, bays }
export function kerbBays3(m, handAt) {
  const out = { streets: 0, bays: 0 };
  const xs = [...zebraCrossings(m).values()];
  delete m._xings;   // (worked out again by whoever reads them: not carried in the map)
  // what a bay keeps clear of, on a coarse grid
  const CELL = 256, grid = new Map();
  let reach = 0;
  const put = (x, y, r) => { const k = Math.floor(y / CELL) * 65536 + Math.floor(x / CELL); if (!grid.has(k)) grid.set(k, []); grid.get(k).push([x, y, r]); reach = Math.max(reach, r); };
  for (const p of m.props) {
    if (p.t === 'hydrant' || p.t === 'hydrant_y') put(p.x, p.y, KERB.hydrant);
    else if (p.t === 'busstop') put(p.x, p.y, KERB.busstop);
  }
  for (const c of xs) put(c.x, c.y, KERB.crossing);
  for (const q of m.parking) if (q.drive) put(q.x, q.y, KERB.drive);
  for (const h of m.homes || []) if (h.garage) put(h.garage.x, h.garage.y, KERB.drive);
  for (const n of m.nodes) if (n.lvl === 0 && n.edges.length >= 3) put(n.x, n.y, (n.half || 0) + KERB.junction);   // (any street's junction, not only the bay's own street's ends)
  const blocked = (x, y) => {
    for (let cy = Math.floor((y - reach) / CELL); cy <= Math.floor((y + reach) / CELL); cy++) for (let cx = Math.floor((x - reach) / CELL); cx <= Math.floor((x + reach) / CELL); cx++) {
      for (const [qx, qy, r] of grid.get(cy * 65536 + cx) || []) if (Math.hypot(qx - x, qy - y) < r) return true;
    }
    return false;
  };
  const tileAt = (x, y) => m.tileAtPx(x, y);
  for (const e of m.edges) {
    if (e.park !== KERB.park || e.kind !== 'st' || e.lvl !== 0 || e.oneway || e.bridge) continue;
    const mid = e.pts[e.pts.length >> 1];
    if (handAt(Math.floor(mid.x / TILE), Math.floor(mid.y / TILE))) continue;
    const pts = e.pts.map((p) => ({ x: p.x, y: p.y })), L = measure(pts);
    const na = m.nodes[e.a], nb = m.nodes[e.b];
    const clearOf = (n) => (n.edges.length === 1 ? (n.bulb || 0) + KERB.junction : (n.trim[e.id] || n.half || 0) + KERB.junction);
    const s0 = clearOf(na), s1 = L - clearOf(nb);
    let made = 0;
    for (let s = s0 + KERB.every / 2; s <= s1 - KERB.every / 2; s += KERB.every) {
      const c = pointAt(pts, s), a = Math.atan2(c.ty, c.tx);
      // straight here (a bay on a bend would stick out into the lane)
      const b0 = pointAt(pts, Math.max(0, s - 60)), b1 = pointAt(pts, Math.min(L, s + 60));
      if (Math.abs(Math.atan2(Math.sin(Math.atan2(b1.ty, b1.tx) - Math.atan2(b0.ty, b0.tx)), Math.cos(Math.atan2(b1.ty, b1.tx) - Math.atan2(b0.ty, b0.tx)))) > 0.08) continue;
      const nx = -c.ty, ny = c.tx;
      for (const sg of [1, -1]) {
        const o = sg * (e.hw - e.park / 2), x = c.x + nx * o, y = c.y + ny * o;
        if (blocked(x, y)) continue;
        // on the asphalt along the whole car, out of any junction box, the pavement beside it (no lot or drive cut)
        let ok = true;
        for (const d of [-56, 0, 56]) {
          const px = x + c.tx * d, py = y + c.ty * d, tx = Math.floor(px / TILE), ty = Math.floor(py / TILE);
          if (!m.inside(tx, ty) || m.tiles[m.idx(tx, ty)] !== T.ROAD || m.roadAxis[m.idx(tx, ty)] === 3) { ok = false; break; }
          const side = tileAt(px + nx * sg * (e.park / 2 + 24), py + ny * sg * (e.park / 2 + 24));
          if (side !== T.SIDEWALK && side !== T.GRASS && side !== T.PLAZA) { ok = false; break; }
        }
        if (!ok) continue;
        m.parking.push({ x: Math.round(x), y: Math.round(y), a: Math.round((sg > 0 ? a : a + Math.PI) * 1000) / 1000, kerb: true, street: 1 });
        made++;
      }
    }
    if (made) { out.streets++; out.bays += made; }
  }
  return out;
}
