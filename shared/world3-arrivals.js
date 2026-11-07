// World v3: the arrival lines (the owner, 11-06: "Train ride is a staged scene yes. We can have multiple stations to
// choose from. Perhaps on their own track and it comes out of a tunnel and then goes to the station then leaves station
// and goes into another tunnel, all for the purpose of onboarding new players (without overlapping on each other if
// that's possible)"). A new character picks where they arrive (server/systems/ftue.js); each choice is one of the main
// line's stations with a car park (the starter car waits there: server/systems/starter.js) and its own short line beside
// it: out of a tunnel portal, a straight stretch of track to a platform, on to a second portal. No train runs on it on
// the server - the arriving player's own page draws the train (client/ftue.js), so arrivals never meet - and nothing
// else uses it: it is not one of the main line's loops (m.rails), it joins no track and no road crosses it.
//
// arrivalLines3(m, H3): run last of World v3's passes (shared/world3-world.js `done`), so everything it must keep clear of
// is in place - and it moves nothing that is: every place, door, road and track stays where it was. For each of the
// regions in ARRIVAL_PICKS it tries that region's stations in order and takes the first with room near it: a corridor of
// open ground (grass, dirt or sand: no road, building, water, lot, place, door, parking space or track, nothing a
// designed place keeps) LEN tiles long, axis-aligned, its platform within REACH of the station's map point and a short
// path off the platform's back to a pavement, a plaza, a car park or a road. There it lays
//   * the track (the bed's tiles dirt, reserved as the main line's are - reserve bit 2), the platform paved (PLAZA), the
//     path paved;
//   * the two bores (shared/tunnels.js' kind of tunnel, m.tunnels / m.cover: the hill drawn over them, sight blocked, a
//     train in one hidden), each BORE tiles of the line's ends: the portal at the end facing the platform, the far end
//     blind (rock across it - nothing comes out the other side of the hill: `blind`, client/tunnels.js draws no portal);
//   * the trees and rocks in the way taken away.
// A station counts only with a car park (parking spaces within STARTER.lotR of its map point: the starter car waits there).
// m.arrivals: [{ id, key (the region: 'city', 'coast', 'desert', 'country'), name (the station's: 'Midtown Station'),
//   poi (its map point), pts [{ x, y, s }] (every 8 px, s along it; the ends `under`, so a renderer that closes a loop
//   doesn't), len, a (its heading: the way the train runs), stations: [{ name, s, x, y, a, side, half, inner, outer,
//   platform: { x, y }, poi, arrival: 1 }] (the art draws it as a station: client/art2/game/groundbake.js, statics.js),
//   portals: [{ x, y, s }] (in, out), tunnels: [in, out] (m.tunnels ids), exit: [x0, y0, x1, y1] (the path, px) }].
// Deterministic: integer tile arithmetic and Math.hypot inside the generator's withDeterministicMath; nothing at load.
import { TILE, T } from './constants.js';
import { STARTER } from './rules.js';

// The regions new players choose from, and the stations each tries, in order (the first with room). The owner's
// "general direction": a city start, the coast, the desert, the countryside.
// The city's is laid by hand beside Greenfield Park (the owner, 11-06 22:49: shared/world3-firstcars.js parkWest3 makes
// the ground ready and names it in m.handArrivals); its stations are the fallback if that ground isn't there.
export const ARRIVAL_PICKS = [
  { key: 'city', hand: true, stations: ['Midtown', 'Metro Central', 'Old Quarter', 'Westport Center', 'Southside'] },
  { key: 'coast', stations: ['Northshore', 'Sunset Beach', 'Sandpiper Bay'] },
  { key: 'desert', stations: ['Red Rock', 'Lucky Mesa'] },
  { key: 'country', stations: ['Willow Valley', 'Airport'] },
];
export const ARRIVAL_DEFAULT = 'city';
// the line's shape, in tiles: each bore, the open stretch between the portals (the platform in its middle), the
// platform's half length in px (a train's: shared/map.js PLATFORM_HALF), its edges off the track's centre (px)
export const ARRIVAL = { bore: 6, open: 28, half: 324, inner: 40, outer: 104, exitMax: 22, reach: 1400, railGap: 5, roadGap: 2 };
const LEN = 2 * ARRIVAL.bore + ARRIVAL.open;
const HW = 40, WALL = 40;   // (the bore's half width and its rock either side: shared/tunnels.js TUNNEL_WALL)
// the corridor's rows across the line (tiles off the track's centre row), the platform on side +1: the bed (-1..1),
// the platform (2, 3), the furniture's edge and a margin (4), the margin on the far side (-3, -2)
const ACROSS0 = -3, ACROSS1 = 4;
const FREE = new Set([T.GRASS, T.DIRT, T.SAND]);
const KEPT_OPEN = 16;   // (reserve bit 16, ground kept open - a lawn round a special, a beach: the line may take it if nothing stands there)
const GOAL = new Set([T.SIDEWALK, T.PLAZA, T.LOT, T.ROAD]);   // (what the path off the platform reaches)
// props a corridor may take away: what grows and what lies about in the wild
const NATURE = /^(tree_\w+|shrub_\w+|bush_\w+|palm_\w+|flowers_\w+|redwood|boulder|cactus|outcrop|rwstump|rwlog|log|ginger|bamboo|rk)$/;

// ---- where -----------------------------------------------------------------------------------------------------------
// The station's map point (a main-line station with a car park: its parking spaces within reach)
function stationPoi(m, name) {
  const label = `${name} Station`, p = m.pois.find((q) => q.kind === 'station' && !q.sub && q.label === label);
  if (!p) return null;
  const R2 = STARTER.lotR * STARTER.lotR;   // (its car park: where the starter car waits - server/systems/starter.js publicGarages)
  return (m.parking || []).some((sp) => !sp.model && (sp.x - p.x) * (sp.x - p.x) + (sp.y - p.y) * (sp.y - p.y) <= R2) ? p : null;
}
// Everything a corridor must keep clear of, as a per-tile mask over the window [X0, Y0, X1, Y1] (tiles): 1 blocked,
// 2 the main line's track or a road within its gap, and the natural props by tile
function windowMask(m, X0, Y0, X1, Y1) {
  const W = X1 - X0, H = Y1 - Y0, bad = new Uint8Array(W * H), near = new Uint8Array(W * H), nat = new Map();
  const mark = (tx, ty, r, a = bad, v = 1) => { for (let y = ty - r; y <= ty + r; y++) for (let x = tx - r; x <= tx + r; x++) if (x >= X0 && y >= Y0 && x < X1 && y < Y1) a[(y - Y0) * W + (x - X0)] |= v; };
  for (let ty = Y0; ty < Y1; ty++) for (let tx = X0; tx < X1; tx++) {
    const k = (ty - Y0) * W + (tx - X0);
    if (!m.inside(tx, ty)) { bad[k] = 1; continue; }
    const i = m.idx(tx, ty), t = m.tiles[i];
    if (!FREE.has(t) || (m.reserve[i] & ~KEPT_OPEN) || (m.cover && m.cover[i]) || m.deck[i] || m.lvl0Block[i] || m.bld[i] >= 0) bad[k] |= 1;
    if (m.reserve[i] & 2) mark(tx, ty, ARRIVAL.railGap, near, 2);   // (the main line: kept well clear)
    if (t === T.ROAD || t === T.BRIDGE) mark(tx, ty, ARRIVAL.roadGap, near, 4);
  }
  const px0 = X0 * TILE, py0 = Y0 * TILE, px1 = X1 * TILE, py1 = Y1 * TILE, inW = (p) => p && p.x >= px0 && p.y >= py0 && p.x < px1 && p.y < py1;
  const at = (p) => [Math.floor(p.x / TILE), Math.floor(p.y / TILE)];
  for (const p of m.pois) if (inW(p)) { const [tx, ty] = at(p); mark(tx, ty, 3); }
  for (const h of m.homes || []) if (inW(h)) { const [tx, ty] = at(h); mark(tx, ty, 3); }
  for (const s of m.parking || []) if (inW(s)) { const [tx, ty] = at(s); mark(tx, ty, 2); }
  for (const s of m.stalls || []) if (inW(s)) { const [tx, ty] = at(s); mark(tx, ty, 1); }
  for (const l of m.landmarks || []) if (l && l.x < px1 && l.x + l.w > px0 && l.y < py1 && l.y + l.h > py0) for (let y = Math.floor(l.y / TILE); y <= Math.floor((l.y + l.h) / TILE); y++) for (let x = Math.floor(l.x / TILE); x <= Math.floor((l.x + l.w) / TILE); x++) mark(x, y, 1);
  m.props.forEach((p) => {
    if (!inW(p)) return;
    const [tx, ty] = at(p), k = (ty - Y0) * W + (tx - X0);
    if (NATURE.test(p.t || '')) { let a = nat.get(k); if (!a) nat.set(k, (a = [])); a.push(p); } else mark(tx, ty, 1);
  });
  return { X0, Y0, W, H, bad, near, nat };
}

// The corridor at (cx, cy) - the line's first tile, its track centre row (or column) - running +x (h) or +y (!h), the
// platform on side sd: its cost, or null where it won't go. The platform's middle is LEN / 2 along.
function tryCorridor(M, cx, cy, h, sd, poi) {
  const { X0, Y0, W, bad, near } = M;
  const cell = (u, v) => { const tx = h ? cx + u : cx - v * sd, ty = h ? cy + v * sd : cy + u; return (ty - Y0) * W + (tx - X0); };
  // (h: along +x, the platform's side +y when sd = 1; !h: along +y, its side -x when sd = 1 - the right of the way)
  let nat = 0;
  for (let u = -1; u <= LEN; u++) for (let v = ACROSS0 - 1; v <= ACROSS1 + 1; v++) {
    const k = cell(u, v);
    if (k < 0 || k >= bad.length) return null;
    const edge = u < 0 || u === LEN || v < ACROSS0 || v > ACROSS1;
    if (near[k] & 2) return null;
    if (edge) { if (bad[k] && !FREE_EDGE(M, k)) return null; continue; }
    if (bad[k] || (near[k] & 4)) return null;
    nat += M.nat.has(k) ? M.nat.get(k).length : 0;
  }
  // the path off the platform's back: from its outer row, straight out, to a pavement, plaza, car park or road
  const mid = LEN >> 1;
  let exit = null;
  for (const du of [0, 2, -2, 4, -4, 6, -6, 8, -8]) {
    const u = mid + du;
    for (let v = ACROSS1 + 1; v <= ACROSS1 + ARRIVAL.exitMax; v++) {
      let goal = false, ok = true;
      for (const uu of [u, u + 1]) {
        const k = cell(uu, v);
        if (k < 0 || k >= bad.length) { ok = false; break; }
        const tx = h ? cx + uu : cx - v * sd, ty = h ? cy + v * sd : cy + uu, t = M.m.tiles[M.m.idx(tx, ty)];
        if (GOAL.has(t)) goal = true;
        else if (bad[k] || (near[k] & 2)) ok = false;
      }
      if (!ok) break;
      if (goal) { exit = { u, v0: ACROSS1 + 1, v1: v }; break; }
    }
    if (exit) break;
  }
  if (!exit) return null;
  // its platform's middle against the station's map point
  const pmx = h ? (cx + mid) * TILE : (cx - 2.5 * sd + 0.5) * TILE, pmy = h ? (cy + 2.5 * sd + 0.5) * TILE : (cy + mid) * TILE;
  const d = Math.hypot(pmx - poi.x, pmy - poi.y);
  if (d > ARRIVAL.reach) return null;
  return { cost: d + (exit.v1 - exit.v0) * 24 + Math.abs(exit.u - mid) * 6 + nat * 3 + (h ? 0 : 120), cx, cy, h, sd, exit };
}
// a margin tile may be anything walkable a little way off (a field's edge, a lawn's), never the main line's
function FREE_EDGE(M, k) { return !(M.near[k] & 2); }

// the best corridor near a station: the cheapest of every start within reach, both ways, the platform either side
function findCorridor(m, poi) {
  const R = Math.ceil(ARRIVAL.reach / TILE) + LEN + ARRIVAL.exitMax + 4;
  const ptx = Math.floor(poi.x / TILE), pty = Math.floor(poi.y / TILE);
  const X0 = Math.max(m.x0 + 1, ptx - R), Y0 = Math.max(m.y0 + 1, pty - R), X1 = Math.min(m.x0 + m.w - 1, ptx + R), Y1 = Math.min(m.y0 + m.h - 1, pty + R);
  const M = windowMask(m, X0, Y0, X1, Y1);
  M.m = m;
  const r = Math.ceil(ARRIVAL.reach / TILE);
  let best = null;
  for (const h of [true, false]) for (const sd of [1, -1]) {
    for (let dy = -r - (h ? 0 : LEN); dy <= r; dy++) for (let dx = -r - (h ? LEN : 0); dx <= r; dx++) {
      const c = tryCorridor(M, ptx + dx, pty + dy, h, sd, poi);
      if (c && (!best || c.cost < best.cost)) best = c;
    }
  }
  if (best) best.M = M;
  return best;
}

// ---- laying it ---------------------------------------------------------------------------------------------------------
// the line's frames: a point u px along it, o px across toward the platform. The corridor's (c: u along +x or +y from its
// first tile's edge, as tryCorridor counts) and the way the train runs (run: the platform on its right - shared/map.js
// buildRailway's `side` 1 - so a line along x with its platform south runs east, with it north runs west; one along y
// with its platform west runs south, east runs north)
function frameOf(c, run = false) {
  const { cx, cy, h, sd } = c, L = LEN * TILE;
  const nx = h ? 0 : -sd, ny = h ? sd : 0;
  const ux = run ? ny : h ? 1 : 0, uy = run ? -nx : h ? 0 : 1;
  const x0 = h ? cx * TILE : (cx + 0.5) * TILE, y0 = h ? (cy + 0.5) * TILE : cy * TILE;
  const ox = x0 + (run && ux < 0 ? L : 0), oy = y0 + (run && uy < 0 ? L : 0);
  return { at: (u, o = 0) => ({ x: ox + ux * u + nx * o, y: oy + uy * u + ny * o }), ux, uy, nx, ny, a: Math.atan2(uy, ux) };
}
function lay(m, c, H3, id, key, poi) {
  const C = frameOf(c), F = frameOf(c, true), L = LEN * TILE, B = ARRIVAL.bore * TILE;
  const tile = (x, y) => [Math.floor(x / TILE), Math.floor(y / TILE)];
  // the trees and rocks in the way
  if (H3 && H3.removeProps) {
    const gone = new Set();
    for (const [k, list] of c.M.nat) {
      const tx = c.M.X0 + (k % c.M.W), ty = c.M.Y0 + Math.floor(k / c.M.W);
      const cx = (tx + 0.5) * TILE - F.at(0).x, cy = (ty + 0.5) * TILE - F.at(0).y, u = cx * F.ux + cy * F.uy, o = cx * F.nx + cy * F.ny;
      if (u >= -TILE && u <= L + TILE && o >= (ACROSS0 - 1) * TILE && o <= (ACROSS1 + 1.5) * TILE) for (const p of list) gone.add(p.x + ',' + p.y);
    }
    for (let v = c.exit.v0; v <= c.exit.v1; v++) for (const uu of [c.exit.u, c.exit.u + 1]) {
      const p = C.at((uu + 0.5) * TILE, (v + 0.5) * TILE), [tx, ty] = tile(p.x, p.y);
      for (const q of m.props) if (Math.floor(q.x / TILE) === tx && Math.floor(q.y / TILE) === ty && NATURE.test(q.t || '')) gone.add(q.x + ',' + q.y);
    }
    if (gone.size) H3.removeProps(m, (x, y) => gone.has(x + ',' + y));
  }
  // the track's points, every 8 px; the bed
  const pts = [];
  for (let s = 0; s <= L; s += 8) { const p = F.at(s); pts.push({ x: p.x, y: p.y, s }); }
  pts[0].under = true; pts[pts.length - 1].under = true;   // (the line's ends, inside the hill: no closing jump drawn)
  for (const p of pts) {
    const [tx0, ty0] = tile(p.x, p.y);
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const tx = tx0 + dx, ty = ty0 + dy;
      if (!m.inside(tx, ty) || Math.hypot((tx + 0.5) * TILE - p.x, (ty + 0.5) * TILE - p.y) > 62) continue;
      const i = m.idx(tx, ty);
      m.reserve[i] |= 2;
      if (m.tiles[i] === T.GRASS || m.tiles[i] === T.SAND) m.tiles[i] = T.DIRT;
    }
  }
  // the platform: paved between its edges, a train long, at the open stretch's middle
  const mid = L / 2, half = ARRIVAL.half;
  for (let u = mid - half; u < mid + half; u += 8) for (let o = ARRIVAL.inner + 4; o < ARRIVAL.outer; o += 8) {
    const p = F.at(u + 4, o), [tx, ty] = tile(p.x, p.y), i = m.idx(tx, ty);
    if (m.tiles[i] !== T.DIRT || !(m.reserve[i] & 2)) m.set(tx, ty, T.PLAZA);
  }
  // the path off its back, two tiles wide
  for (let v = c.exit.v0; v <= c.exit.v1; v++) for (const uu of [c.exit.u, c.exit.u + 1]) {
    const p = C.at((uu + 0.5) * TILE, (v + 0.5) * TILE), [tx, ty] = tile(p.x, p.y), i = m.idx(tx, ty);
    if (FREE.has(m.tiles[i])) m.set(tx, ty, T.PLAZA);
  }
  const e0 = C.at((c.exit.u + 1) * TILE, c.exit.v0 * TILE), e1 = C.at((c.exit.u + 1) * TILE, (c.exit.v1 + 1) * TILE);
  // the bores: at each end, the hill over the track (m.cover), rock either side and across the far end
  const tunnels = [boreOf(m, F, 0, B, 'b'), boreOf(m, F, L - B, L, 'a')];
  const pin = F.at(B), pout = F.at(L - B), pl = F.at(mid, (ARRIVAL.inner + ARRIVAL.outer) / 2 + 4);
  const st = { name: poi.label, s: mid, x: F.at(mid).x, y: F.at(mid).y, a: F.a, side: 1, half, inner: ARRIVAL.inner, outer: ARRIVAL.outer, platform: { x: pl.x, y: pl.y }, poi: poi.id, arrival: 1, clockD: 0 };
  // (the side: the platform is on the right of the way the train runs - shared/map.js buildRailway's `side` 1 - so a
  // line laid +x with its platform at +y runs east, one laid +y with its platform at -x runs south)
  return {
    id, key, name: poi.label, poi: poi.id, pts, len: L, a: F.a, stations: [st],
    portals: [{ x: pin.x, y: pin.y, s: B }, { x: pout.x, y: pout.y, s: L - B }],
    tunnels: tunnels.map((t) => (t ? t.id : -1)),
    exit: [Math.round(e0.x), Math.round(e0.y), Math.round(e1.x), Math.round(e1.y)],
  };
}
// a bore over the line from u0 to u1 px (shared/tunnels.js' kind: the cover, the rock, its mouths); blind: the end
// that is the far side of the hill ('a' the u0 end, 'b' the u1 end) - rock across it, no portal drawn
function boreOf(m, F, u0, u1, open) {
  if (!m.tunnels || m.tunnels.length >= 255) return null;
  if (!m.cover) m.cover = new Uint8Array(m.w * m.h);
  const id = m.tunnels.length, mark = id + 1, walls = [], cap = [];
  const a = F.at(u0), b = F.at(u1), reach = HW + WALL;
  const tx0 = Math.floor((Math.min(a.x, b.x) - reach) / TILE), tx1 = Math.floor((Math.max(a.x, b.x) + reach) / TILE);
  const ty0 = Math.floor((Math.min(a.y, b.y) - reach) / TILE), ty1 = Math.floor((Math.max(a.y, b.y) + reach) / TILE);
  for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
    if (!m.inside(tx, ty)) continue;
    const dx = (tx + 0.5) * TILE - a.x, dy = (ty + 0.5) * TILE - a.y, u = dx * F.ux + dy * F.uy + u0, o = Math.abs(dx * F.nx + dy * F.ny);
    if (u < u0 || u > u1 || o > reach) continue;
    const i = m.idx(tx, ty);
    if (o <= HW) { m.cover[i] = mark; if ((open === 'b' && u - u0 < TILE) || (open === 'a' && u1 - u < TILE)) cap.push(i); }
    else walls.push(i);
  }
  for (const i of walls) if (!m.cover[i]) m.tiles[i] = T.WALL;
  for (const i of cap) m.tiles[i] = T.WALL;   // (the far end: nothing comes out the other side of the hill)
  const line = [];
  for (let u = u0; ; u += 32) { const p = F.at(Math.min(u, u1)); line.push(Math.round(p.x), Math.round(p.y)); if (u >= u1) break; }
  const t = {
    id, kind: 'rail', edge: 'rail', rail: -1, arrival: 1, s0: u0, s1: u1, len: u1 - u0, hw: HW, line,
    mouths: [{ x: a.x, y: a.y, ox: -F.ux, oy: -F.uy, closed: false, blind: open === 'b' }, { x: b.x, y: b.y, ox: F.ux, oy: F.uy, closed: false, blind: open === 'a' }],
    box: [Math.floor(Math.min(a.x, b.x) - reach - TILE), Math.floor(Math.min(a.y, b.y) - reach - TILE), Math.ceil(Math.max(a.x, b.x) + reach + TILE), Math.ceil(Math.max(a.y, b.y) + reach + TILE)],
  };
  m.tunnels.push(t);
  return t;
}

// ---- the pass ----------------------------------------------------------------------------------------------------------
// -> { laid: [[key, station]], missed: [key] } (m.arrivals the lines)
export function arrivalLines3(m, H3 = null) {
  m.arrivals = [];
  const out = { laid: [], missed: [] };
  for (const pick of ARRIVAL_PICKS) {
    let done = false;
    const hand = pick.hand && m.handArrivals && m.handArrivals[pick.key], hp = hand && m.pois[hand.poi];
    const hc = hp && handCorridor(m, hand, hp);
    if (hc) {   // (a line laid by hand: its corridor checked as any other - open ground, its path off the platform, near its station)
      m.arrivals.push(lay(m, hc, H3, m.arrivals.length, pick.key, hp));
      out.laid.push([pick.key, hp.label]);
      continue;
    }
    if (hand) out.handMissed = pick.key;
    for (const name of pick.stations) {
      const poi = stationPoi(m, name);
      if (!poi) continue;
      const c = findCorridor(m, poi);
      if (!c) continue;
      m.arrivals.push(lay(m, c, H3, m.arrivals.length, pick.key, poi));
      out.laid.push([pick.key, poi.label]);
      done = true;
      break;
    }
    if (!done) out.missed.push(pick.key);
  }
  return out;
}
// a hand-placed corridor (shared/world3-firstcars.js: { cx, cy, h, sd }), checked as tryCorridor checks any - or null
function handCorridor(m, H, poi) {
  const X0 = Math.max(m.x0 + 1, H.cx - 30), Y0 = Math.max(m.y0 + 1, H.cy - 30 - LEN), X1 = Math.min(m.x0 + m.w - 1, H.cx + LEN + 30), Y1 = Math.min(m.y0 + m.h - 1, H.cy + LEN + 30);
  const M = windowMask(m, X0, Y0, X1, Y1);
  M.m = m;
  const c = tryCorridor(M, H.cx, H.cy, H.h, H.sd, poi);
  if (c) c.M = M;
  return c;
}
// (tools, tests: the corridor a station would get, without laying it)
export const _findCorridor = findCorridor;
