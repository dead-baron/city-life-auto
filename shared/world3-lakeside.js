// World v3, handcrafted: Lakeside Greens (the Lake District, district 37), the links on the headland north of 15th
// Street between Magnolia Street and the sea, beside Falls Lake Park - from the owner's concepts GO1 / GO3 (the
// clubhouse with its terrace and its car park, greens with bunkers, tree-lined fairways, a pond, cart paths and carts,
// a practice green; GO3's scorecard names the course "Lakeside Greens") and WC314 (the golf club on a lake edge), with
// the research's plan for golf in v3 (the east island, by Falls Lake Park's water):
//   - four holes round the pond: the 1st east along 15th Street, the 2nd (a par 3) up the headland past a second pond,
//     the 3rd back west along the shore, the 4th south down Magnolia Street's side to the clubhouse;
//   - greens mown round their flags with bunkers at their lips, tees with a bench and a ball washer's post, fairways
//     through the rough (the ground: client/art2/game/groundbake.js draws M.golf in the course's painting);
//   - the cart path round the pond between the holes, carts on it; pines, cypresses and oaks between the holes and
//     along the shore's promenade; the clubhouse at the south-west corner, its terrace, its car park off 15th Street,
//     the practice green beside it.
// Play it: server/systems/golf.js (m.golf: the holes, tees, greens, fairways and the course's bounds - the same shape
// as the old world's Cedar Hills Golf Club, shared/naturesites.js golfClub). Draws are fixed by place (hash2).
import { TILE, T } from './constants.js';

const D = 37;   // the Lake District (shared/mapcore.js DISTRICTS)
export const LX = { magnolia: 4200, pinecrest: 4300 };
export const LY = { fifteenth: 2368 };
const RECT = [LX.magnolia, 2255, LX.pinecrest, LY.fifteenth];
export const COURSE = [4207, 2278, 4300, 2362];   // (tiles: the course's bounds - out of bounds beyond, water past the shore)
// the holes (tiles): the tee, the fairway's line, the green, the par
export const HOLES = [
  { tee: [4250, 2356], way: [[4253, 2355.6], [4262, 2354], [4271, 2351.5], [4279, 2349]], green: [4285, 2347], par: 4 },
  { tee: [4294, 2339], way: [[4294, 2336], [4293, 2330], [4291.5, 2325]], green: [4290, 2320], par: 3 },
  { tee: [4273, 2313], way: [[4269, 2312], [4261, 2309], [4252, 2305.5], [4244, 2301]], green: [4237, 2297], par: 4 },
  { tee: [4214, 2294], way: [[4214.5, 2297], [4216, 2305], [4218, 2314], [4220, 2322]], green: [4222, 2330], par: 4 },
];
const PONDS = [[4252, 2328, 6.5, 3.6], [4282.5, 2330, 2.8, 1.8]];   // [cx, cy, rx, ry] (tiles)
const BUNKERS = [[4281, 2343.6, 1.7, 1.0], [4289.4, 2350.4, 1.5, 0.9], [4285.6, 2317.4, 1.4, 0.9], [4293.2, 2323.2, 1.2, 0.9], [4241.4, 2294.2, 1.6, 0.9], [4232.6, 2300.4, 1.4, 1.0],
  [4218.2, 2333.6, 1.5, 0.9], [4226.6, 2326.8, 1.3, 1.0], [4266, 2357.4, 1.8, 0.8], [4256, 2310.6, 1.6, 0.8]];
// the cart path round the pond (tiles): from the clubhouse east between the 1st and the pond, up the 2nd's west side,
// back along the 3rd's south side, down the 4th's east side
const CART = [[4226, 2347], [4240, 2344.5], [4256, 2342.5], [4270, 2341.5], [4279, 2338], [4280.5, 2330], [4279.5, 2322], [4274, 2318], [4262, 2316.5], [4248, 2315], [4236, 2315.5], [4230, 2320], [4229.5, 2330], [4229, 2339], [4226, 2347]];
const CLUB = [4220, 2350];   // the clubhouse (its prop: the terrace on its south side)

export const LAKESIDE = {
  key: 'lakeside', d: D, rect: RECT,
  streets: () => [],
  specials: [],
  build,
};

// a smooth line through control points (Catmull-Rom, `n` steps a span; tiles in, px out)
function curve(pts, n) {
  const P = pts.map(([x, y]) => [x * TILE, y * TILE]), out = [];
  for (let i = 0; i < P.length - 1; i++) {
    const p0 = P[Math.max(0, i - 1)], p1 = P[i], p2 = P[i + 1], p3 = P[Math.min(P.length - 1, i + 2)];
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (3 * b - a - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  out.push(P[P.length - 1]);
  return out;
}
const segDist = (pts, x, y) => {
  let best = Infinity;
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1], [bx, by] = pts[i], dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
    const t = L ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / L)) : 0;
    best = Math.min(best, Math.hypot(x - ax - dx * t, y - ay - dy * t));
  }
  return best;
};

function build(m, api, K) {
  const { rnd, prop } = K;
  const out = { holes: 0, ponds: 0, bunkers: 0, trees: 0 };
  const W = m.w;
  const [cx0, cy0, cx1, cy1] = COURSE;
  // the whole course is the plan's (kept from the block filler: the rough, the fairways, the greens are all lawn)
  const open = [];
  for (let y = cy0; y < cy1; y++) for (let x = cx0; x < cx1; x++) if (K.free(x, y)) open.push([x, y]);
  if (open.length < 3000) return out;
  const golf = { greens: [], tees: [], fairways: [], holes: [], rect: { x0: cx0 * TILE, y0: cy0 * TILE, x1: cx1 * TILE, y1: cy1 * TILE } };
  const blob = (cx, cy, rx, ry, fn) => {
    for (let ty = Math.floor(cy - ry - 1); ty <= cy + ry + 1; ty++) for (let tx = Math.floor(cx - rx - 1); tx <= cx + rx + 1; tx++) {
      const dx = (tx + 0.5 - cx) / rx, dy = (ty + 0.5 - cy) / ry, q = Math.hypot(dx, dy) * (1 + 0.1 * (rnd(tx, ty, 50) - 0.5));
      if (q <= 1 && K.free(tx, ty)) fn(tx, ty, q);
    }
  };
  // the ponds and the bunkers first (the water and the sand are tiles: a ball lies in them)
  for (const [x, y, rx, ry] of PONDS) { blob(x, y, rx, ry, (tx, ty) => { m.set(tx, ty, T.WATER); K.take(tx, ty, 1, 1); }); out.ponds++; }
  for (const [x, y, rx, ry] of BUNKERS) { blob(x, y, rx, ry, (tx, ty) => { m.set(tx, ty, T.SAND); K.take(tx, ty, 1, 1); }); out.bunkers++; }
  // the holes: the tee box, the fairway, the green and its flag; a bench by every tee
  HOLES.forEach((h, k) => {
    const [gx, gy] = h.green, [tx, ty] = h.tee;
    golf.greens.push({ x: gx * TILE, y: gy * TILE, r: Math.round(2.7 * TILE) });
    golf.tees.push({ x: Math.round((tx - 1.2) * TILE), y: Math.round((ty - 0.8) * TILE), w: Math.round(2.4 * TILE), h: Math.round(1.6 * TILE) });
    golf.fairways.push({ pts: curve([h.tee, ...h.way, h.green], 6).map(([x, y]) => [Math.round(x), Math.round(y)]), hw: Math.round(2.6 * TILE) });
    prop('golfflag', gx + 0.4, gy - 0.3, 3);
    prop('pbench', tx + (k % 2 ? 2.2 : -2.2), ty + 0.4, 8, { a: Math.PI / 2 });
    prop('textsign', tx, ty + 1.6, 0, { text: `${k + 1}  PAR ${h.par}`, z: 14, sx: 1, bg: '#1e4a32', fg: [240, 230, 190] });
    golf.holes.push({ n: k + 1, par: h.par, tee: { x: Math.round(tx * TILE), y: Math.round(ty * TILE) }, pin: { x: Math.round((gx + 0.4) * TILE), y: Math.round((gy - 0.3) * TILE) }, green: k });
    out.holes++;
  });
  // the practice green by the clubhouse, three flags on it
  const PG = [CLUB[0] + 12, CLUB[1] + 0.5];
  golf.greens.push({ x: PG[0] * TILE, y: PG[1] * TILE, r: Math.round(2.2 * TILE) });
  for (const [dx, dy] of [[-1, -0.6], [0.9, 0.2], [-0.2, 1.1]]) prop('golfflag', PG[0] + dx, PG[1] + dy, 0);
  m.golf = golf;
  // the cart path (pale concrete), the carts parked on it
  const cart = curve(CART, 8);
  for (const [x, y] of cart) for (const [ox, oy] of [[0, 0], [10, 0], [0, 10], [10, 10]]) { const tx = Math.floor((x + ox - 5) / TILE), ty = Math.floor((y + oy - 5) / TILE); if (K.free(tx, ty)) { m.set(tx, ty, T.PLAZA); K.take(tx, ty, 1, 1); } }
  for (const [k, a, v] of [[10, 0.2, 0], [44, -1.6, 1], [80, Math.PI, 2]]) if (cart[k]) prop('golfcart', cart[k][0] / TILE, cart[k][1] / TILE - 0.15, 12, { a, v });
  // the clubhouse: its terrace (tables under umbrellas), the bar at the steps; the car park off 15th Street; the sign
  const [hx, hy] = CLUB;
  prop('clubhouse', hx, hy, 0);
  for (let dx = -116; dx <= 116; dx += 24) for (const dy of [-50, -18, 14]) m.addSolidProp(Math.round(hx * TILE + dx), Math.round(hy * TILE + dy), 18);
  for (let y = Math.floor(hy - 4); y <= Math.ceil(hy + 1); y++) for (let x = Math.floor(hx - 4); x <= Math.ceil(hx + 4); x++) K.take(x, y, 1, 1);
  m.pois.push({ id: m.pois.length, kind: 'clubhouse', label: 'Lakeside Greens', x: Math.round(hx * TILE), y: Math.round((hy + 2.6) * TILE), r: 44, counter: true });
  for (const [dx, u] of [[-4.5, 'umbrella_g'], [-1.5, 'umbrella_r'], [1.5, 'umbrella_g'], [4.5, 'umbrella_r']]) { prop('cafetable', hx + dx, hy + 4.2, 6); prop(u, hx + dx + 0.9, hy + 4.6, 4); }
  const py0 = hy + 6;
  for (let y = py0; y < cy1; y++) for (let x = cx0; x < hx + 9; x++) if (K.free(x, y)) { m.set(x, y, T.LOT); K.take(x, y, 1, 1); }
  for (let qx = cx0 + 1; qx + 3 <= hx + 8; qx += 3) { m.stalls.push({ x: qx * TILE, y: py0 * TILE, w: 3 * TILE, h: 4 * TILE }); if (rnd(qx, py0, 51) < 0.6) m.parking.push({ x: (qx + 1.5) * TILE, y: (py0 + 2) * TILE, a: -Math.PI / 2 }); }
  prop('golfcart', hx + 7.5, py0 + 1.6, 12, { a: Math.PI / 2, v: 1 });
  prop('textsign', hx + 12, cy1 - 0.4, 0, { text: 'LAKESIDE GREENS', z: 34, sx: 1, bg: '#1e4a32', fg: [240, 230, 190] });
  // the trees between the holes and along the shore (never on a fairway, a green, a tee, the path, the water or the sand)
  const clear = (x, y, r) => {
    for (const g of golf.greens) if (Math.hypot(x - g.x, y - g.y) < g.r + r) return false;
    for (const f of golf.fairways) if (segDist(f.pts, x, y) < f.hw + r) return false;
    for (const t of golf.tees) if (x > t.x - r && x < t.x + t.w + r && y > t.y - r && y < t.y + t.h + r) return false;
    if (segDist(cart, x, y) < r + 20) return false;
    if (Math.abs(x - hx * TILE) < 6 * TILE && y > (hy - 5) * TILE) return false;   // (the clubhouse, its terrace, its car park)
    const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const t = m.tiles[(ty + dy) * W + tx + dx]; if (t !== T.GRASS) return false; }
    return K.free(tx, ty);
  };
  for (let ty = cy0 + 1.5; ty < cy1 - 1; ty += 2.6) for (let tx = cx0 + 1.5; tx < cx1 - 1; tx += 2.6) {
    const jx = tx + (rnd(Math.round(tx * 3), Math.round(ty * 3), 52) - 0.5) * 1.6, jy = ty + (rnd(Math.round(tx * 3), Math.round(ty * 3), 53) - 0.5) * 1.6;
    if (rnd(Math.round(tx), Math.round(ty), 54) > 0.5 || !clear(jx * TILE, jy * TILE, 52)) continue;
    const h = rnd(Math.round(tx), Math.round(ty), 55), sp = h < 0.35 ? 'pine' : h < 0.6 ? 'cypress' : h < 0.85 ? 'oak' : 'maple';
    prop('tree_a', jx, jy, 12, { sp, k: 1.25 + rnd(Math.round(tx), Math.round(ty), 56) * 0.3 }); out.trees++;
  }
  // the rough: every tile of the course left (kept as lawn: the block filler stays off it)
  for (const [x, y] of open) if (K.free(x, y)) K.take(x, y, 1, 1);
  // what the rest of the game reads: the course's ground (its painting: the bake's greens and stripes), its name on
  // the map, the nature site (the dev teleport's 'golf')
  const box = { x: cx0 * TILE, y: cy0 * TILE, w: (cx1 - cx0) * TILE, h: (cy1 - cy0) * TILE };
  (m.paintings ||= []).push({ key: 'golf', hand: true, name: 'Lakeside Greens', ...box });
  (m.landmarks ||= []).push({ name: 'Lakeside Greens', type: 'golf', ...box });
  (m.natureSites ||= []).push({ kind: 'golf', hand: true, name: 'Lakeside Greens', x: Math.round(hx * TILE), y: Math.round((hy + 4) * TILE), greens: golf.greens.length, pond: { x: PONDS[0][0] * TILE, y: PONDS[0][1] * TILE }, trees: out.trees });
  (out.places ||= []).push({ name: 'Lakeside Greens', x0: cx0, y0: cy0, x1: cx1, y1: cy1 });
  void api;
  return out;
}
