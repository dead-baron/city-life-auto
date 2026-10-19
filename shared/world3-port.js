// World v3, handcrafted: Port Westport's container terminal (district 26), Quarter Avenue to the gulf from 8th Street
// to Pier Avenue, from the research's sources for Port Westport (D7 and SC4-I: the container quays, their stacks and
// cranes; concept 1's red cranes; I7: the docks; the missing port gate and customs set piece). World v3b's city grid
// had laid little blocks of look-alike buildings here and the container yard of the quays pass (shared/world3-passes.js)
// never came over; now:
//   - the container stacks in their blocks either side of Westport Boulevard's last stretch, the lanes between them,
//     straddle carriers, light masts, the yard fence and its gates with their gatehouses (the Port Westport gate);
//   - along the quay the apron, the ship-to-shore cranes over the water and a container ship moored alongside;
//   - on Pier Avenue the Port Westport Authority, the Westport Customs House, Westport Freight's warehouse and the
//     Dockside Diner, their backs on the yard.
// Every building faces south (the camera). Names, signs and brands are invented. Draws are fixed by place (hash2).
import { TILE, T } from './constants.js';
import { towerKit } from './world3-downtown.js';

const D = 26;   // Port Westport (shared/mapcore.js DISTRICTS)
export const OX = { quarter: 1960, laurel: 2120, east: 2200 };
export const OY = { eighth: 2160, blvd: 2200, pier: 2300 };
const RECTS = [[OX.quarter, OY.eighth, OX.east, OY.blvd], [OX.quarter, OY.blvd, OX.east, OY.pier]];
const BW = 5, BL = 8, LANE = 4;   // (a stack block: 5 x 8 tiles - the cstack prop's footprint; the lanes between groups)
const SHIP = [8, 8, 8, 8, 8, 8, 10];   // (stern, the holds, the bow: tiles)

export const PORT = {
  key: 'port', d: D, rects: RECTS, rect: [OX.quarter, OY.eighth, OX.east, OY.pier],
  streets: () => [],
  specials: [],
  build,
};

function build(m, api, K) {
  const { rnd, pick, prop } = K;
  const out = { homes: 0, shops: 0, stacks: 0, cranes: 0 };
  const { place, tower } = towerKit(K, out);
  const placeName = (name, x0, y0, x1, y1) => (out.places ||= []).push({ name, x0, y0, x1, y1 });
  const W = m.w, t = (x, y) => m.tiles[y * W + x];
  const wet = (x, y) => t(x, y) === T.WATER || t(x, y) === T.DEEP;
  // the yard fence: chain-link panels along a line (the Yards' 'yfence'), gaps where the gates are
  const fence = (x0, y0, x1, y1, gaps = []) => {
    const horiz = y0 === y1, n = Math.max(1, Math.round((horiz ? x1 - x0 : y1 - y0) / 4));
    for (let k = 0; k < n; k++) {
      const a = (horiz ? x0 : y0) + ((horiz ? x1 - x0 : y1 - y0) * k) / n, b = (horiz ? x0 : y0) + ((horiz ? x1 - x0 : y1 - y0) * (k + 1)) / n;
      if (gaps.some(([g0, g1]) => b > g0 && a < g1)) continue;
      if (horiz) prop('yfence', a, y0, 0, { x1: b * TILE, y1: y0 * TILE }); else prop('yfence', x0, a, 0, { x1: x0 * TILE, y1: b * TILE });
    }
  };
  // the free ground's extent along a row / a column
  const span = (y, xa, xb) => { let a = xa, b = xb; while (a < b && !K.free(a, y)) a++; while (b > a && !K.free(b - 1, y)) b--; return b - a >= 4 ? [a, b] : null; };
  const spanY = (x, ya, yb) => { let a = ya, b = yb; while (a < b && !K.free(x, a)) a++; while (b > a && !K.free(x, b - 1)) b--; return b - a >= 4 ? [a, b] : null; };

  // ---- the extents: the yard from Quarter Avenue's pavement to the quay's apron (the quays pass laid it), north and
  // south of the boulevard; the offices' row on Pier Avenue
  const mx = Math.floor((OX.quarter + OX.laurel) / 2);
  const NY = spanY(mx, OY.eighth + 3, OY.blvd - 3), SYs = spanY(mx, OY.blvd + 3, OY.pier - 3);
  if (!NY || !SYs) return out;
  const my = Math.floor((SYs[0] + SYs[1]) / 2), XS = span(my, OX.quarter + 3, OX.east);
  if (!XS) return out;
  // (the quay's apron along the water - the quays pass lays it, its cranes' rails and its crates after the plans: the
  // yard stops short of it)
  let shore = XS[0];
  while (shore < OX.east + 20 && !wet(shore, my)) shore++;
  const x0 = XS[0], x1 = Math.min(XS[1], shore - 8);
  const offH = 14, oy0 = SYs[1] - offH;

  offices();
  const north = yard(x0, NY[0], x1, NY[1], 'north');
  const south = yard(x0, SYs[0], x1, oy0 - 1, 'south');
  quay();
  void north; void south; void api; void pick;
  return out;

  // ===========================================================================================================
  // a container yard: the ground paved, the blocks of stacks in rows from the quay back (groups of four along the
  // quay, a lane between groups and between the pairs of rows), straddle carriers in the lanes, the light masts, the
  // fence round with its gate on the boulevard and the gatehouse
  function yard(ax0, ay0, ax1, ay1, side) {
    K.fill(ax0, ay0, ax1 - ax0, ay1 - ay0, T.LOT);
    K.take(ax0, ay0, ax1 - ax0, ay1 - ay0);
    // the truck lane along the boulevard side (4 tiles) and the apron's lane along the quay (6 tiles) stay open
    const lane0 = side === 'north' ? ay1 - LANE : ay0, sy0 = side === 'north' ? ay0 + 1 : ay0 + LANE + 1, sy1 = side === 'north' ? ay1 - LANE - 1 : ay1 - 1;
    const qx = ax1 - 6;   // (the apron's lane)
    let n = 0;
    for (let ry = sy0; ry + BL <= sy1; ry += 2 * (BL + 1) + LANE) for (const half of [0, 1]) {
      const by = ry + half * (BL + 1);
      if (by + BL > sy1) continue;
      for (let gx = qx - 1; gx - 4 * (BW + 1) >= ax0 + 6; gx -= 4 * (BW + 1) + LANE) for (let k = 0; k < 4; k++) {
        const bx = gx - (k + 1) * (BW + 1);
        if (rnd(bx, by, 1) < 0.12) continue;   // (a gap in the stacks: a box being moved)
        prop('cstack', bx + BW / 2, by + BL / 2, 0, { v: Math.floor(rnd(bx, by, 2) * 6), tall: 240 });
        for (const ox of [-1.2, 1.2]) for (const oy of [-2.5, 0, 2.5]) m.addSolidProp((bx + BW / 2 + ox) * TILE, (by + BL / 2 + oy) * TILE, 40);
        n++;
      }
    }
    out.stacks += n;
    // the straddle carriers in the lanes, the light masts, the trucks waiting in the gate lane
    for (let k = 0; k < 3; k++) { const sx = ax0 + 20 + k * 38 + Math.floor(rnd(k, ay0, 3) * 10), syy = lane0 + LANE / 2; prop('straddle', sx, syy, 18); }
    for (let lx = ax0 + 8; lx < ax1 - 4; lx += 36) prop('ymast', lx, side === 'north' ? ay0 + 0.6 : ay1 - 0.6, 0, { tall: 160 });
    for (let k = 0; k < 2; k++) m.parking.push({ x: (ax0 + 12 + k * 10) * TILE, y: (lane0 + LANE / 2) * TILE, a: 0, model: 'boxtruck' });
    // the fence: along Quarter Avenue and the yard's outer side; on the boulevard side with the gate near Quarter Avenue
    const fy = side === 'north' ? ay1 : ay0, oy = side === 'north' ? ay0 : ay1;
    const g0 = ax0 + 2, g1 = ax0 + 10;
    fence(ax0, ay0, ax0, ay1);
    fence(ax0, oy, ax1 - 6, oy);
    fence(ax0, fy, ax1 - 6, fy, [[g0, g1]]);
    prop('ygate', (g0 + g1) / 2, fy + (side === 'north' ? -0.2 : 0.2), 0, { a: 0 });
    // the gatehouse beside the gate, inside: the guard's booth
    const hx = g1 + 1, hy = side === 'north' ? ay1 - 5 : ay0 + 1;
    place({ x: hx, y: hy, w: 6, h: 4, arch: 'hut', name: side === 'north' ? 'Port Westport North Gate' : 'Port Westport Gate', poi: false, whole: true, roof: 'tar' });
    if (side === 'south') prop('textsign', g1 + 10, fy + 1.2, 0, { text: 'PORT WESTPORT', bg: '#a8302a', fg: [250, 246, 230], z: 50, sx: 2, lit: true });
    placeName(side === 'north' ? 'Port Westport North Yard' : 'Port Westport Container Yard', ax0, ay0, ax1, ay1);
    return n;
  }

  // ===========================================================================================================
  // the quay: the ship-to-shore cranes along its edge (their legs on the apron, the booms out over the water) and a
  // container ship moored alongside - where the water is clear the length of it
  function quay() {
    // the quay's edge at each row: the last land tile east of the yard
    const edge = (y) => { let x = x1; while (x < OX.east + 20 && !wet(x, y)) x++; return x; };
    const ys0 = NY[0], ys1 = oy0;
    const have = (m.props || []).filter((p) => p && p.t === 'gcrane' && p.x / TILE > x1 - 4 && p.x / TILE < OX.east + 20 && p.y / TILE > ys0 && p.y / TILE < ys1).map((p) => p.y / TILE);
    for (let y = ys0 + 16; y < ys1 - 10; y += 34) {
      if (have.some((hy) => Math.abs(hy - y) < 20)) continue;
      const ex = edge(y);
      if (ex >= OX.east + 20) continue;
      prop('gcrane', ex - 2.5, y, 0, { a: Math.PI, k: out.cranes % 2, tall: 720 });
      for (const dy of [-1.2, 1.2]) for (const dx of [-2, 0]) m.addSolidProp((ex - 2.5 + dx) * TILE, (y + dy) * TILE, 9);
      out.cranes++;
    }
    // the ship: its hull lies north-south off the quay where the quay runs straight the length of it (the shore bulges
    // out north of the boulevard), clear water under it
    const LS = SHIP.reduce((a2, b2) => a2 + b2, 0), E = [];
    for (let y = ys0; y < ys1 + 20; y++) E.push(edge(y));
    let best = null;
    for (let sy = ys0; sy + LS <= ys1 + 20; sy++) {
      let lo = 1e9, hi = -1;
      for (let y = sy; y < sy + LS; y++) { lo = Math.min(lo, E[y - ys0]); hi = Math.max(hi, E[y - ys0]); }
      if (hi - lo > 3 || hi >= OX.east + 20) continue;
      let ok = true;
      for (let y = sy; y < sy + LS && ok; y++) for (let x = hi + 1; x < hi + 9; x++) if (!wet(x, y)) { ok = false; break; }
      if (!ok) continue;
      const d = Math.abs(sy + LS / 2 - (ys0 + ys1) / 2);
      if (!best || d < best.d) best = { sy, ex: hi, d };
    }
    if (best) {
      const { sy, ex } = best, cx = (ex + 1) * TILE + 120;
      let yy = sy * TILE;
      for (const [k, len] of SHIP.entries()) { prop('cship', cx / TILE, (yy + len * TILE / 2) / TILE, 0, { v: k === 0 ? 2 : k === SHIP.length - 1 ? 0 : 1, c: Math.floor(rnd(sy, k, 4) * 4), a: Math.PI / 2, tall: 250 }); yy += len * TILE; }
      for (let y2 = sy * TILE + 16; y2 < (sy + LS) * TILE; y2 += 28) for (const ox of [-94, 94]) m.addSolidProp(cx + ox, y2, 16);
      placeName('The Westport Trader', ex + 1, sy, ex + 9, sy + LS);
    }
  }

  // ===========================================================================================================
  // on Pier Avenue: the port's offices, the customs house, the freight warehouse, the diner, their backs on the yard
  function offices() {
    const LIST = [
      { w: 28, name: 'Port Westport Authority', style: 'stone', floors: 4, wall: '#d8ccb4', cornice: 'dentil', store: 'lobby', awning: null, signC: ['#1e3a5e', [240, 236, 220]] },
      { w: 24, name: 'Westport Customs House', style: 'stone', floors: 3, wall: '#cfc4ae', cornice: 'bracket', store: 'lobby', awning: null, signC: ['#2a2420', [236, 200, 140]] },
      { w: 40, name: 'Westport Freight', warehouse: true },
      { w: 14, name: 'Dockside Diner', style: 'stucco', floors: 1, store: 'diner', poi: { kind: 'coffee', label: 'Dockside Diner', food: true }, awning: ['#2a5a8a', '#f0ece4'], signC: ['#2a5a8a', [250, 246, 230]] },
    ];
    let k = 0;
    K.row(x0, x1 - 6, oy0, SYs[1] - 1, (x, room) => {
      const L = LIST[k];
      if (!L) return room >= 1 ? { gap: room, kind: 'yard' } : null;
      if (room < Math.min(L.w, 12)) return { gap: room, kind: 'yard' };
      k++;
      const w = Math.min(room, L.w);
      if (L.warehouse) return { w, depth: offH, arch: 'warehouse', key: 'warehouse', name: L.name, poi: { kind: 'delivery', label: L.name }, whole: true };
      if (L.poi) out.shops++;
      return { w, depth: offH - 2, arch: 'mixed', name: L.name, poi: L.poi || { kind: 'delivery', label: L.name }, whole: true, art: tower(x, oy0, L) };
    }, { rough: true });
    placeName('Port Westport Offices', x0, oy0, x1, SYs[1]);
  }
}
