// World v3, stage 3, step 5 (docs/WORLD-V3.md 8.13): the first mainland towns - Timber Bend (the logging town by the
// Highland Highway, in the redwoods), Willow Crossing (the farm town on the Long Reach) and Sandpiper Bay (the beach
// town on the east arm), built by today's generator on new ground. For the whole-world build only (shared/world3-world.js
// calls these, one call each; the page and the city worker never import this module):
// - paintTowns3(L, W, H): each town's district (shared/mapcore.js DISTRICTS 57-59) and a built zone painted on the land
//   layer round the skeleton's town point, before the build reads it - on land, off the highways' room (24 tiles of
//   their line), the main line (18) and its stations (30). The biomes read the land layer's districts, so their ground
//   and dressing make way (8.8: world3-biomes.js dress3 dresses 48-56, the generator's redwoodGroves Highland Woods' 47).
// - layTowns3(lines, m): a street grid in each town, clipped to its ground, crossing the arterials that run through it
//   (the generator joins lines where they cross); the main street an east-west arterial, so the town gets bus stops.
// - TOWN_SPECIALS: the planned businesses (the generator's SPECIALS form, handed in as opts.specials, so only the v3
//   build places them): the clinic, the sheriff, a convenience store that becomes the gas station, the diner and each
//   town's own places (part 1.5's table).
// - townsDone(m): each town's planned store (a convenience store, so buildCornerStores' five gas stations stay in the
//   city) turned into its gas station with pumps, a bus stop on the main street if buildBusStops left it none, and
//   the summary in m.world3.towns.
// The blocks and buildings are the generator's, by the district's style (STYLE): oldtown for the two country towns
// (shops, houses, a diner, the corner store), beach for Sandpiper Bay (beach houses, a beach bar, a cafe).
import { TILE, T } from './constants.js';
import { skeletonLines, STATIONS } from './world3-skeleton.js';

const Z_TOWN = 8;   // (a built zone: map.js BUILT_ZONES, and buildBusStops' list - Northshore's, the mainland's built zone)
export const TOWNS3 = [
  { key: 'timber', name: 'Timber Bend', d: 57, at: [1170, 1060], box: [1036, 992, 1150, 1126],
    // west of Redwood Creek (the highway's room east of it): Timber Road crosses the grid on its way to the hub
    ew: [[1018, 'st', 'Mill Street'], [1046, 'art', 'Main Street'], [1104, 'st', 'Sawyer Street']],
    ns: [[1046, 'st', 'Logger Lane'], [1076, 'st', 'Cedar Street'], [1106, 'st', 'Spruce Street'], [1136, 'st', 'Creek Street']] },
  { key: 'willow', name: 'Willow Crossing', d: 58, at: [3360, 1290], box: [3348, 1212, 3486, 1352],
    // the Long Reach's east bank round the hub of Valley Road, Willow Road and the Mine Road
    ew: [[1238, 'st', 'Grange Street'], [1296, 'art', 'Main Street'], [1326, 'st', 'Church Street']],
    ns: [[3362, 'st', 'River Street'], [3426, 'st', 'Elevator Street'], [3456, 'st', 'Orchard Street']] },
  { key: 'sandpiper', name: 'Sandpiper Bay', d: 59, at: [4480, 2540], box: [4396, 2466, 4588, 2604],
    // between Sandpiper Drive's two arms and the beach
    ew: [[2490, 'st', 'Dune Street'], [2518, 'st', 'Shell Street'], [2546, 'art', 'Boardwalk Avenue'], [2590, 'st', 'Surf Street']],
    ns: [[4420, 'st', 'Gull Lane'], [4450, 'st', 'Tern Lane'], [4480, 'st', 'Pier Street'], [4510, 'st', 'Plover Lane'], [4540, 'st', 'Heron Lane'], [4570, 'st', 'Kelp Lane']] },
];
export const TOWN_IDS = new Set(TOWNS3.map((t) => t.d));
const ROOM = { hwy: 24, main: 18, station: 30 };

// the planned businesses (map.js SPECIALS' form; biz 'delivery' is a named place; fixed: the generator's later passes
// don't make one a gun shop, a tackle shop or a bank)
export const TOWN_SPECIALS = [
  { d: 57, prefab: 'hospital', biz: ['hospital'], names: ['Timber Bend Clinic'], fixed: true },
  { d: 57, prefab: 'police', biz: ['police'], names: ['Timber Bend Sheriff'], fixed: true },
  { d: 57, prefab: 'conv', biz: ['convenience'], names: ['Timber Bend Fuel'], gas: true, fixed: true },
  { d: 57, prefab: 'diner', biz: ['delivery'], names: ['The Sawdust Diner'], fixed: true },
  { d: 57, prefab: 'strip', biz: ['lodge', 'butcher', 'hardware', 'tackle'], names: ['Timber Bend Hunting Lodge', 'Bend Game Butcher', 'Axe & Saw Hardware', 'Redwood Creek Tackle'], fixed: true },
  { d: 57, prefab: 'industrial', biz: ['delivery'], names: ['Timber Bend Sawmill'], fixed: true },   // (not a plain warehouse: map.js' bowling alley takes the biggest)
  { d: 57, prefab: 'hotel', biz: ['delivery'], names: ['Pine Rest Motel'], fixed: true },
  { d: 58, prefab: 'hospital', biz: ['hospital'], names: ['Willow Crossing Clinic'], fixed: true },
  { d: 58, prefab: 'police', biz: ['police'], names: ['Willow County Sheriff'], fixed: true },
  { d: 58, prefab: 'conv', biz: ['convenience'], names: ['Willow Crossing Fuel'], gas: true, fixed: true },
  { d: 58, prefab: 'church', biz: ['delivery'], names: ['Willow Crossing Chapel'], fixed: true },
  { d: 58, prefab: 'farmstead', biz: ['farm'], names: ['Willow Valley Farm Co-op'], fixed: true },
  { d: 58, prefab: 'industrial', biz: ['delivery'], names: ['Willow Crossing Grain Elevator'], fixed: true },
  { d: 58, prefab: 'diner', biz: ['delivery'], names: ['Crossroads Diner'], fixed: true },
  { d: 58, prefab: 'strip', biz: ['market', 'farmstand', 'fruitstand', 'delivery'], names: ["Willow Crossing Farmers' Market", 'Valley Farm Stand', 'Orchard Fruit Stand', 'Valley Feed & Seed'], fixed: true },
  { d: 59, prefab: 'hospital', biz: ['hospital'], names: ['Sandpiper Bay Clinic'], fixed: true },
  { d: 59, prefab: 'conv', biz: ['convenience'], names: ['Sandpiper Bay Fuel'], gas: true, fixed: true },
  { d: 59, prefab: 'strip', biz: ['sports', 'tackle', 'snack', 'delivery'], names: ['Sandpiper Surf Co.', 'Pier Tackle & Bait', 'Shorebird Snack Bar', 'Lifeguard Station'], fixed: true },
  { d: 59, prefab: 'beachbar', biz: ['delivery'], names: ['The Sandpiper'], fixed: true },
  { d: 59, prefab: 'diner', biz: ['delivery'], names: ['Boardwalk Diner'], fixed: true },
];

// the room a line keeps, stamped into a town's box: within r of its path's points (segments)
function stamp(mask, box, path, r) {
  const [x0, y0, x1, y1] = box, BW = x1 - x0;
  const P = path.pts;
  for (let j = 1; j < P.length; j++) {
    const [ax, ay] = P[j - 1], [bx, by] = P[j];
    if (Math.max(ax, bx) + r < x0 || Math.min(ax, bx) - r > x1 || Math.max(ay, by) + r < y0 || Math.min(ay, by) - r > y1) continue;
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1;
    const sx0 = Math.max(x0, Math.floor(Math.min(ax, bx) - r)), sx1 = Math.min(x1 - 1, Math.ceil(Math.max(ax, bx) + r));
    const sy0 = Math.max(y0, Math.floor(Math.min(ay, by) - r)), sy1 = Math.min(y1 - 1, Math.ceil(Math.max(ay, by) + r));
    for (let y = sy0; y <= sy1; y++) for (let x = sx0; x <= sx1; x++) {
      const t = Math.max(0, Math.min(1, ((x + 0.5 - ax) * dx + (y + 0.5 - ay) * dy) / l2)), ex = x + 0.5 - ax - t * dx, ey = y + 0.5 - ay - t * dy;
      if (ex * ex + ey * ey <= r * r) mask[(y - y0) * BW + x - x0] = 1;
    }
  }
}

// Each town's ground on the land layer: its district and the built zone, where the land is and the room isn't.
export function paintTowns3(L, W, H) {
  const SK = skeletonLines();
  const out = [];
  for (const t of TOWNS3) {
    const [x0, y0, x1, y1] = t.box, BW = x1 - x0, BH = y1 - y0;
    const room = new Uint8Array(BW * BH);
    for (const l of SK) if (l.kind === 'hwy') stamp(room, t.box, l.path, ROOM.hwy); else if (l.kind === 'main') stamp(room, t.box, l.path, ROOM.main);
    for (const s of STATIONS) if (s.line === 'main') stamp(room, t.box, { pts: [s.at, s.at] }, ROOM.station);
    let n = 0;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const i = y * W + x;
      if (!L.land[i] || room[(y - y0) * BW + x - x0]) continue;
      L.dist[i] = t.d; L.zone[i] = Z_TOWN; n++;
    }
    out.push({ key: t.key, name: t.name, d: t.d, tiles: n });
  }
  return out;
}

// The streets: each grid line clipped to the town's ground (and kept off an arterial running alongside it within 10
// tiles - it crosses the ones across it), runs of 8 tiles or more, laid as the generator's lines (px).
export function layTowns3(lines, m) {
  const W = m.w, SK = skeletonLines().filter((l) => l.kind === 'art');
  const out = [];
  for (const t of TOWNS3) {
    const [x0, y0, x1, y1] = t.box;
    // the arterials' points near the town, with their direction
    const near = [];
    for (const l of SK) {
      const P = l.path.pts;
      for (let j = 1; j < P.length; j++) {
        const [ax, ay] = P[j - 1], [bx, by] = P[j];
        if (Math.max(ax, bx) < x0 - 20 || Math.min(ax, bx) > x1 + 20 || Math.max(ay, by) < y0 - 20 || Math.min(ay, by) > y1 + 20) continue;
        const len = Math.hypot(bx - ax, by - ay) || 1, n = Math.max(1, Math.ceil(len));
        for (let k = 0; k <= n; k++) near.push([ax + (bx - ax) * k / n, ay + (by - ay) * k / n, (bx - ax) / len, (by - ay) / len]);
      }
    }
    const alongside = (x, y, ux, uy) => near.some(([px, py, dx, dy]) => (px - x) ** 2 + (py - y) ** 2 < 100 && Math.abs(dx * ux + dy * uy) > 0.8);
    const ok = (x, y, ux, uy) => {
      if (x < x0 || y < y0 || x >= x1 || y >= y1) return false;
      const i = y * W + x;
      return m.land[i] && m.dist[i] === t.d && !alongside(x + 0.5, y + 0.5, ux, uy);
    };
    const streets = [];
    const run = (fixed, from, to, ew, kind, name) => {
      let a = -1;
      for (let v = from; v <= to; v++) {
        const x = ew ? v : fixed, y = ew ? fixed : v;
        const good = v < to && ok(x, y, ew ? 1 : 0, ew ? 0 : 1);
        if (good && a < 0) a = v;
        if (!good && a >= 0) {
          if (v - a >= 8) {
            const A = ew ? { x: (a + 0.5) * TILE, y: (fixed + 0.5) * TILE } : { x: (fixed + 0.5) * TILE, y: (a + 0.5) * TILE };
            const B = ew ? { x: (v - 0.5) * TILE, y: (fixed + 0.5) * TILE } : { x: (fixed + 0.5) * TILE, y: (v - 0.5) * TILE };
            const l = { pts: [A, B], kind, lvl: 0, name, town: t.key };
            lines.push(l); streets.push(l);
          }
          a = -1;
        }
      }
    };
    for (const [y, kind, name] of t.ew) run(y, x0, x1, true, kind, name);
    for (const [x, kind, name] of t.ns) run(x, y0, y1, false, kind, name);
    out.push({ key: t.key, name: t.name, d: t.d, streets: streets.length, len: Math.round(streets.reduce((s, l) => s + Math.abs(l.pts[1].x - l.pts[0].x) + Math.abs(l.pts[1].y - l.pts[0].y), 0) / TILE) });
  }
  return out;
}

// After the build: each town's planned store becomes its gas station (the pumps on the paving in front), and what each
// town has is summed up in m.world3.towns.
export function townsDone(m) {
  const at = (p) => m.dist[Math.floor(p.y / TILE) * m.w + Math.floor(p.x / TILE)];
  const gasNames = new Set(TOWN_SPECIALS.filter((s) => s.gas).map((s) => s.names[0]));
  m.pumps ||= [];
  const out = [];
  for (const t of TOWNS3) {
    const g = m.pois.find((p) => p && gasNames.has(p.label) && at(p) === t.d);
    if (g && (g.kind === 'convenience' || g.kind === 'delivery')) {
      const b = m.buildings[g.b];
      g.kind = 'gasstation';
      if (b) {
        // (in front of its door, as buildCornerStores puts them - the door's point 0.7 tiles out, the pumps 52 px on -
        // or nearer the front where the town's pavement is narrower than the city's: on open paving, never the road)
        const south = !b.door || b.door.ty >= b.ty + b.th, cx = (b.tx + b.tw / 2) * TILE;
        const open = (x, y) => { const tl = m.tileAtPx(x, y); return tl === T.SIDEWALK || tl === T.PLAZA || tl === T.LOT || tl === T.GRASS; };
        for (const out of [0.7 * TILE + 52, 1.6 * TILE, TILE]) {
          const fy = south ? (b.ty + b.th) * TILE + out : b.ty * TILE - out;
          if (![-48, 48].every((dx) => open(cx + dx, fy))) continue;
          for (const dx of [-48, 48]) { m.pumps.push({ x: cx + dx, y: fy }); m.addSolidProp(cx + dx, fy, 9); }
          break;
        }
        for (const s of b.signs || []) if (s.text === g.label) s.text = "Gas 'n Go";
      }
    }
    // a bus stop on the main street when buildBusStops left it none (doors all along it): on 5 tiles of sidewalk with
    // nothing solid within 70 px, the first such spot from the middle out
    const [bx0, by0, bx1, by1] = t.box;
    const busAt = (p) => p && p.t === 'busstop' && p.x >= bx0 * TILE && p.x < bx1 * TILE && p.y >= by0 * TILE && p.y < by1 * TILE;
    if (!m.props.some(busAt)) {
      const main = t.ew.find((q) => q[1] === 'art');
      const solid = m.props.filter((p) => p && p.x >= (bx0 - 4) * TILE && p.x < (bx1 + 4) * TILE && p.y >= (by0 - 4) * TILE && p.y < (by1 + 4) * TILE);
      const free = (x, y) => !solid.some((p) => Math.hypot(p.x - x, p.y - y) < 70);
      const walk = (tx, ty) => [-2, -1, 0, 1, 2].every((dx) => m.tileAt(tx + dx, ty) === T.SIDEWALK && !m.deck[ty * m.w + tx + dx]);
      let done = false;
      for (const e of m.edges) {
        if (done || e.name !== main[2] || e.lvl !== 0 || at(e.pts[0]) !== t.d) continue;
        const ya = e.pts[0].y, xa = Math.min(e.pts[0].x, e.pts[e.pts.length - 1].x), xb = Math.max(e.pts[0].x, e.pts[e.pts.length - 1].x);
        for (let s = 0; s < (xb - xa) / 2 - 6 * TILE && !done; s += TILE) for (const x of [(xa + xb) / 2 + s, (xa + xb) / 2 - s]) for (const side of [1, -1]) {
          if (done) break;
          const y = side < 0 ? ya - e.hw - TILE * 1.25 : ya + e.hw + TILE * 1.6, tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
          if (!walk(tx, ty) || !free(x, y)) continue;
          m.props.push({ t: 'busstop', x: (tx + 0.5) * TILE, y, face: side < 0 ? 'S' : 'N' });
          const sp = m.addSolidProp((tx + 0.5) * TILE, y, 14); sp.pi = m.props.length - 1; sp.brk = true; m.propSolid.set(sp.pi, sp);
          done = true;
        }
      }
    }
    const pois = m.pois.filter((p) => p && at(p) === t.d);
    const kinds = {};
    for (const p of pois) kinds[p.kind] = (kinds[p.kind] || 0) + 1;
    let blds = 0;
    for (const b of m.buildings) if (b && m.dist[(b.ty + (b.th >> 1)) * m.w + b.tx + (b.tw >> 1)] === t.d) blds++;
    out.push({ key: t.key, name: t.name, d: t.d, buildings: blds, pois: pois.length, kinds, bus: m.props.filter(busAt).length });
  }
  return out;
}
