// The Syndicate's compound out in the desert (the owner, 10-16: "No gang in the north-west forest: gangs go in isolated
// rough corners of the city or isolated desert spots"). Today's world builds the Syndicate's walled compound on
// Smuggler's Rock, an island off the coast (shared/map.js buildOffshore); World v3 has no such island, and the compound
// came out at the island's old place - in Highland Woods, its boats tied up on dry land. World v3 builds it here
// instead (and map.js leaves the old one out): far out in the Red Rock or Dry Creek desert, well away from every town,
// on level open ground at the end of a long dirt track off a road - its block wall with guard towers at two corners
// (drawn from m.rock.compound: client/art2/game/statics.js), the gate in the wall facing the track (members only:
// m.gates, server/systems/gates.js), the Syndicate Den inside (its counter: the 'smuggler' place - the members' shop
// and the poaching runs), the yard's containers, crates, pallets and drums, the crew's cars and bikes, the guards'
// posts (m.rock.guards: server/systems/gang.js posts them while a player is near).
// For the whole-world build only (shared/world3-world.js's done hook). Deterministic: arithmetic, integer hashes.
import { TILE, T } from './constants.js';

const hh = (a, b, s) => { let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(s | 0, 2246822519); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

// districts: the deserts; w, h: the compound inside its wall (tiles); margin: open ground round it (tiles); step: the
// scan's; flat: the land's rise allowed under it (m); lonely: tiles from any building at the least; away: tiles from any
// nature site or landmark; road: tiles of track out to the nearest road (at the least, at the most); gate: its width.
export const COMPOUND3 = { districts: [50, 41], w: 26, h: 22, margin: 5, step: 6, flat: 4, lonely: 90, away: 40, road: [14, 90], gate: 4 };

const OPEN = new Set([T.SAND, T.DIRT, T.GRASS]);
const KEEP = 4, LUSH = 128;

export function desertCompound3(m, H3) {
  const out = { built: false };
  if (!H3 || !H3.addProp || m.rock) return out;
  const S = COMPOUND3, W = m.w, HH = m.h, inF = (x, y) => x >= 0 && y >= 0 && x < W && y < HH, idx = (x, y) => y * W + x;
  const DS = new Set(S.districts);
  const designed = (i) => { const a = m.solidProps && m.solidProps.get(i); return !!a && a.some((e) => e.pi < 0); };
  const plain = (i) => m.land[i] && OPEN.has(m.tiles[i]) && !(m.reserve[i] & ~(KEEP | LUSH)) && !(m.bld && m.bld[i] >= 0) && !(m.lake && m.lake[i]) && !(m.river && m.river[i]) && !designed(i);
  // what's there already: every building, the nature sites, the landmarks (tiles)
  const blds = m.buildings.filter((b) => b && !b.gone).map((b) => [b.tx + b.tw / 2, b.ty + b.th / 2]);
  const spots = [...(m.natureSites || []).map((s) => [s.x / TILE, s.y / TILE]), ...(m.landmarks || []).map((l) => [(l.x + (l.w || 0) / 2) / TILE, (l.y + (l.h || 0) / 2) / TILE])];
  const nearest = (list, x, y) => { let d = 1e9; for (const [a, b] of list) { const q = (a - x) * (a - x) + (b - y) * (b - y); if (q < d) d = q; } return Math.sqrt(d); };
  // the ground for the compound and its margin: open, level, in the desert
  const fits = (x0, y0) => {
    let lo = 255, hi = 0;
    for (let y = y0 - S.margin; y < y0 + S.h + S.margin; y++) for (let x = x0 - S.margin; x < x0 + S.w + S.margin; x++) {
      if (!inF(x, y)) return false;
      const i = idx(x, y);
      if (!DS.has(m.dist[i]) || !plain(i)) return false;
      if (m.relief) { lo = Math.min(lo, m.relief[i]); hi = Math.max(hi, m.relief[i]); if (hi - lo > S.flat) return false; }
    }
    return true;
  };
  // the nearest road out from the middle of a wall (north, south, east or west), the way to it all open ground:
  // { ux, uy, d (tiles from the wall), gx, gy (the gate's middle, tiles) } or null
  const DIRS = [[0, 1], [0, -1], [1, 0], [-1, 0]];
  const roadFrom = (x0, y0) => {
    let best = null;
    for (const [ux, uy] of DIRS) {
      const gx = ux > 0 ? x0 + S.w : ux < 0 ? x0 - 1 : x0 + S.w / 2, gy = uy > 0 ? y0 + S.h : uy < 0 ? y0 - 1 : y0 + S.h / 2;
      for (let d = 1; d <= S.road[1]; d++) {
        const X = Math.floor(gx + ux * d), Y = Math.floor(gy + uy * d);
        if (!inF(X, Y)) break;
        const i = idx(X, Y), t = m.tiles[i];
        if (t === T.ROAD) { if (d >= S.road[0] && (!best || d < best.d)) best = { ux, uy, d, gx, gy }; break; }
        let ok = true;
        for (const s of [-2, -1, 0, 1, 2]) { const j = idx(X + (uy ? s : 0), Y + (ux ? s : 0)); if (!inF(X + (uy ? s : 0), Y + (ux ? s : 0)) || !(plain(j) || m.tiles[j] === T.SIDEWALK)) { ok = false; break; } }
        if (!ok) break;
      }
    }
    return best;
  };
  const cands = [];
  for (let y = S.margin + 2; y < HH - S.h - S.margin - 2; y += S.step) for (let x = S.margin + 2; x < W - S.w - S.margin - 2; x += S.step) {
    const cx = x + S.w / 2, cy = y + S.h / 2, i = idx(Math.floor(cx), Math.floor(cy));
    if (!DS.has(m.dist[i]) || !plain(i)) continue;
    const lone = nearest(blds, cx, cy);
    if (lone < S.lonely || nearest(spots, cx, cy) < S.away) continue;
    cands.push([x, y, lone + hh(x, y, 8101) * 20]);
  }
  cands.sort((a, b) => b[2] - a[2]);   // (the loneliest first)
  let site = null;
  for (const [x, y] of cands) {
    if (!fits(x, y)) continue;
    const rd = roadFrom(x, y);
    if (!rd) continue;
    site = { x0: x, y0: y, rd };
    break;
  }
  if (!site) return out;

  const { x0, y0, rd } = site, w = S.w, h = S.h, x1 = x0 + w - 1, y1 = y0 + h - 1, d0 = m.dist[idx(x0 + (w >> 1), y0 + (h >> 1))];
  const clear = new Set();
  // the yard (asphalt-and-gravel lot), the wall round it (kept: drawn as the wall, not the desert's rock), the gate's gap
  for (let y = y0 - 2; y <= y1 + 2; y++) for (let x = x0 - 2; x <= x1 + 2; x++) {
    const i = idx(x, y);
    clear.add(i);
    if (x < x0 || x > x1 || y < y0 || y > y1) continue;
    const wall = x === x0 || x === x1 || y === y0 || y === y1;
    m.tiles[i] = wall ? T.WALL : T.LOT; m.reserve[i] = (m.reserve[i] | KEEP) & ~LUSH;
  }
  const G = S.gate, vertical = rd.ux !== 0;
  const gx0 = vertical ? (rd.ux > 0 ? x1 : x0) : Math.floor(x0 + w / 2 - G / 2), gy0 = vertical ? Math.floor(y0 + h / 2 - G / 2) : (rd.uy > 0 ? y1 : y0);
  for (let k = 0; k < G; k++) { const i = vertical ? idx(gx0, gy0 + k) : idx(gx0 + k, gy0); m.tiles[i] = T.LOT; }
  // the track out to the road: packed dirt four tiles wide, from the gate to the asphalt (the desert bake's dirt track)
  const along = (k, s) => vertical ? [gx0 + rd.ux * k, gy0 + s] : [gx0 + s, gy0 + rd.uy * k];
  for (let k = 1; k < rd.d + 2; k++) for (let s = 0; s < G; s++) {
    const [x, y] = along(k, s);
    if (!inF(x, y)) continue;
    const i = idx(x, y);
    if (m.tiles[i] === T.ROAD || m.tiles[i] === T.SIDEWALK) continue;
    m.tiles[i] = T.DIRT; m.reserve[i] = (m.reserve[i] | KEEP) & ~LUSH; clear.add(i);
    for (const e of [-1, G]) { const [ax, ay] = along(k, e); if (inF(ax, ay)) clear.add(idx(ax, ay)); }
  }
  const [ta, tb] = [along(1, G / 2), along(rd.d + 1, G / 2)].map(([x, y]) => [Math.round(x * TILE), Math.round(y * TILE)]);
  (m.tracks ||= []).push({ pts: [ta, tb], hw: 56, bb: [Math.min(ta[0], tb[0]) - 90, Math.min(ta[1], tb[1]) - 90, Math.max(ta[0], tb[0]) + 90, Math.max(ta[1], tb[1]) + 90] });
  if (H3.removeProps) H3.removeProps(m, (x, y) => clear.has(Math.floor(y / TILE) * W + Math.floor(x / TILE)));

  // the Den: a low metal-roofed block in the yard's far half, its door toward the gate
  const dw = 11, dh = 7, far = (u, v) => [x0 + u, y0 + v];   // (yard coordinates)
  let [bx, by] = far(Math.floor((w - dw) / 2), Math.floor((h - dh) / 2));
  if (vertical) bx = rd.ux > 0 ? x0 + 3 : x1 - 2 - dw; else by = rd.uy > 0 ? y0 + 3 : y1 - 2 - dh;
  const bid = m.buildings.length;
  m.roofs.push({ tx: bx, ty: by, tw: dw, th: dh, kind: 'metal', seed: (bx * 7919 + by * 104729) | 0, d: d0, b: bid });
  const door = { x: (bx + dw / 2) * TILE, y: (rd.uy < 0 ? by - 0.4 : by + dh + 0.4) * TILE };
  if (vertical) { door.x = (rd.ux > 0 ? bx + dw + 0.4 : bx - 0.4) * TILE; door.y = (by + dh / 2) * TILE; }
  const den = { id: bid, prefab: -1, roof: m.roofs.length - 1, tx: bx, ty: by, tw: dw, th: dh, kind: 'den', name: 'Syndicate Den', business: null, signs: [{ x: door.x, y: door.y, text: 'NO TRESPASSING' }] };
  m.buildings.push(den);
  for (let y = by; y < by + dh; y++) for (let x = bx; x < bx + dw; x++) { m.tiles[idx(x, y)] = T.BUILDING; m.bld[idx(x, y)] = bid; }
  m.pois.push({ id: m.pois.length, kind: 'smuggler', label: "Smuggler's Den", x: Math.round(door.x), y: Math.round(door.y), r: 46, b: bid });
  // the gate: members only (its bars solid until it opens for one)
  const gate = vertical
    ? { x: (gx0 + 0.5) * TILE, y: (gy0 + G / 2) * TILE, w: G * TILE, vertical: true, props: [], rule: 'gang', rect: { tx: x0, ty: y0, tw: w, th: h } }
    : { x: (gx0 + G / 2) * TILE, y: (gy0 + 0.5) * TILE, w: G * TILE, vertical: false, props: [], rule: 'gang', rect: { tx: x0, ty: y0, tw: w, th: h } };
  for (let s = 8; s <= G * TILE - 8; s += 14) {
    const e = m.addSolidProp(Math.round(vertical ? gate.x : gx0 * TILE + s), Math.round(vertical ? gy0 * TILE + s : gate.y), 10);
    gate.props.push(e);
  }
  (m.gates ||= []).push(gate);
  // the yard: containers along the back wall, crates, pallets, drums and spools about, the crew's cars and bikes
  const P = [];
  const put = (t, x, y, r = 0, ex = null) => P.push([t, Math.round(x * TILE), Math.round(y * TILE), r, ex]);
  const inX = (u) => x0 + 1.5 + u * (w - 3), inY = (v) => y0 + 1.5 + v * (h - 3);   // (u, v 0..1 across the yard)
  // (the back: the wall across the yard from the gate)
  const back = (s, deep) => vertical ? [rd.ux > 0 ? inX(deep) : inX(1 - deep), inY(s)] : [inX(s), rd.uy > 0 ? inY(deep) : inY(1 - deep)];
  for (let k = 0; k < 2; k++) { const [x, y] = back(k ? 0.86 : 0.12, 0.06); put('container', x, y, 18, { a: vertical ? Math.PI / 2 : 0, c: Math.floor(hh(x0, k, 8110) * 5) }); }
  // (the Den across the back half's middle, the containers either side of it; the stores along the side walls, the
  // cars and bikes in front of the Den, the yard by the gate left clear)
  const yard = [];
  for (let k = 0; k < 7; k++) yard.push(back(k % 2 ? 0.95 : 0.05, 0.3 + 0.1 * Math.floor(k / 2) + (hh(y0, k, 8112) - 0.5) * 0.04));
  const KINDS = ['crates', 'pallet', 'drum', 'spool', 'pallet_b', 'crates', 'drum'];
  yard.forEach(([x, y], k) => put(KINDS[k], x, y, 10, null));
  const parking = (m.parking ||= []), cars = ['sports', 'pickup', 'van'], bikes = ['chopper', 'bagger'];
  for (let k = 0; k < 3; k++) {
    const [x, y] = back(0.2 + k * 0.2, 0.64);
    parking.push({ x: Math.round(x * TILE), y: Math.round(y * TILE), a: vertical ? 0 : Math.PI / 2, model: cars[k], mx: 1, bare: 1 });   // (bare: no bays painted on the yard)
  }
  for (let k = 0; k < 2; k++) {
    const [x, y] = back(0.8 + k * 0.08, 0.64);
    parking.push({ x: Math.round(x * TILE), y: Math.round(y * TILE), a: vertical ? 0 : Math.PI / 2, model: bikes[k], mx: 1, bare: 1 });
  }
  for (const [t, x, y, r, e] of P) H3.addProp(m, t, x, y, r, e);
  // the guards' posts: two outside the gate, one inside it, one at each of the yard's far corners, one at the Den's door
  const gmx = vertical ? gx0 + 0.5 : gx0 + G / 2, gmy = vertical ? gy0 + G / 2 : gy0 + 0.5, ox = vertical ? rd.ux : 0, oy = vertical ? 0 : rd.uy, sx = vertical ? 0 : 1, sy = vertical ? 1 : 0;
  const posts = [
    [gmx + ox * 3 - sx * 3, gmy + oy * 3 - sy * 3], [gmx + ox * 3 + sx * 3, gmy + oy * 3 + sy * 3], [gmx - ox * 3, gmy - oy * 3],
    back(0.16, 0.5), back(0.84, 0.5), [door.x / TILE + ox * 1.5, door.y / TILE + oy * 1.5],
  ];
  m.rock = {
    x: Math.round((x0 + w / 2) * TILE), y: Math.round((y0 + h / 2) * TILE), compound: { tx: x0, ty: y0, tw: w, th: h }, dock: null, desert: true,
    guards: posts.map(([x, y]) => ({ x: Math.round(x * TILE), y: Math.round(y * TILE) })),
  };
  (m.landmarks ||= []).push({ name: 'Syndicate Compound', type: 'hideout', x: x0 * TILE, y: y0 * TILE, w: w * TILE, h: h * TILE });
  Object.assign(out, { built: true, x: x0, y: y0, w, h, road: rd.d, side: vertical ? (rd.ux > 0 ? 'east' : 'west') : (rd.uy > 0 ? 'south' : 'north'), lonely: Math.round(nearest(blds.filter((b) => b[0] !== bx + dw / 2 || b[1] !== by + dh / 2), x0 + w / 2, y0 + h / 2)) });
  return out;
}
