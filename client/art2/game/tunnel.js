// The subway in the new art (the owner, 10-08 / 10-16 / 10-22: the tunnel view "looks like placeholder art"). Riding
// under the city the art v2 renderer draws the tunnel itself, lit by its own lamps, where the classic renderer drew a
// flat dark band (client/render/trains.js drawTunnel - still the fallback while this loads, and for the classic art):
//   - the floor: concrete between the walls, the track bed's dark ballast with its sleepers and the two steel rails of
//     every underground track (each way's loop its own track: World v3's subways and the main line under the towns);
//   - the walls: the tunnel's north wall seen face on (the 3/4 view), grimy concrete in panels, a cable run along it and a
//     lamp every LAMP_GAP px that lights the floor, the train and the people in it; the south wall's top hides the
//     floor's edge, as a wall would;
//   - the stations: a raised platform beside each underground station's track (the side its trains open on), its tiles,
//     the yellow line at the edge, pillars to the roof, benches, and the station's name on a sign;
//   - above: the earth the tunnel is cut through, dark, the streets overhead ghosted on it (the owner's 10-07 "subway
//     under the world: ghosted street").
// The chunks are baked here on the page (nothing to fetch: a few ms each, a couple a frame), at the art's own pixel, and
// drawn by the engine as a layer of their own (engine.js layers: the city's chunks stay resident under them, so the
// town is there when the train comes up). The host (host.js frame, F.sub) draws the trains and the riders over them.
import { GBuf, F_GROUND, F_NOCAST } from '../gbuf.js';
import { drawText, textWidth } from '../font.js';
import { CHUNK } from './chunkgeom.js';
import { TILE, T } from '../../../shared/constants.js';

// half: the floor's half-width round a track (px); wallH: the walls' height (the earth above); plat: the platform's
// height; pin, pout: the platform from this far off its track's centre to this; ph: its half-length (a train's);
// lampGap: px between lamps along a wall; railOff: each rail off the track's centre; sleeper: their spacing
export const TUNNEL = { half: 58, wallH: 40, plat: 10, pin: 42, pout: 106, ph: 320, lampGap: 150, lampZ: 24, railOff: 12, sleeper: 18, layer: 1 };
const CELL = 512, MAX_SEG = 160;

// ---- the geometry, once per map ------------------------------------------------------------------------------------
const GEOM = new WeakMap();
export function tunnelGeom(map) {
  let G = GEOM.get(map);
  if (G) return G;
  G = { cells: new Map(), stations: [], lamps: new Map() };
  const rails = map.rails || (map.rail ? [map.rail] : []);
  const addSeg = (p, q) => {
    const dx = q.x - p.x, dy = q.y - p.y, len = Math.hypot(dx, dy);
    if (!(len > 0.5)) return;
    const sg = { ax: p.x, ay: p.y, bx: q.x, by: q.y, ux: dx / len, uy: dy / len, len, s0: p.s || 0 };
    const R = TUNNEL.pout + 8;   // (every cell the segment's band reaches)
    for (let cy = Math.floor((Math.min(p.y, q.y) - R) / CELL); cy <= Math.floor((Math.max(p.y, q.y) + R) / CELL); cy++)
      for (let cx = Math.floor((Math.min(p.x, q.x) - R) / CELL); cx <= Math.floor((Math.max(p.x, q.x) + R) / CELL); cx++) {
        const k = cx * 65536 + cy; let a = G.cells.get(k); if (!a) G.cells.set(k, (a = [])); a.push(sg);
      }
  };
  const put = (m, x, y, v) => { const k = Math.floor(x / CELL) * 65536 + Math.floor(y / CELL); let a = m.get(k); if (!a) m.set(k, (a = [])); a.push(v); };
  rails.forEach((r) => {
    const P = r.pts || [], n = P.length;
    if (n < 2) return;
    const closed = P[0] && P[n - 1] && Math.hypot(P[n - 1].x - P[0].x, P[n - 1].y - P[0].y) < 64;
    // the underground runs, unbroken (a jump across the window's gap ends one), each cut to as few straight pieces as keep
    // within half a pixel of the line (the points are 8 px apart: a long straight is one piece, a curve a piece every
    // 40 px or so), at most MAX_SEG long
    const runs = [];
    let cur = null;
    for (let i = 0; i < (closed ? n + 1 : n); i++) {
      const p = P[i % n], prev = cur && cur[cur.length - 1];
      const ok = p && p.under && !p.elevated && (!prev || Math.hypot(p.x - prev.x, p.y - prev.y) < 64);
      if (!ok) { if (cur && cur.length > 1) runs.push(cur); cur = p && p.under && !p.elevated ? [p] : null; continue; }
      (cur ||= []).push(p);
    }
    if (cur && cur.length > 1) runs.push(cur);
    for (const run of runs) {
      let a = 0;
      while (a < run.length - 1) {
        let b = a + 1;
        while (b + 1 < run.length) {   // (grow the piece while every point between stays on it)
          const c = b + 1, ax = run[a].x, ay = run[a].y, dx = run[c].x - ax, dy = run[c].y - ay, L = Math.hypot(dx, dy);
          if (L > MAX_SEG) break;
          let fit = true;
          for (let k = a + 1; k < c && fit; k++) if (Math.abs((run[k].x - ax) * dy - (run[k].y - ay) * dx) / L > 0.5) fit = false;
          if (!fit) break;
          b = c;
        }
        addSeg(run[a], run[b]);
        a = b;
      }
    }
  });
  // the platforms: beside each underground station's track, on its side (a v3 station's side 1: the right of the way the
  // train runs - shared/map.js buildRailway), a train long
  for (const r of rails) for (const st of r.stations || []) {
    if (!st || !st.under || st.el) continue;
    const P = r.pts || [];
    let best = null, bd = 90 * 90;
    for (let i = 0; i + 1 < P.length; i++) {
      const p = P[i], q = P[i + 1];
      if (!p || !q || !p.under || Math.abs(p.x - st.x) > 400 || Math.abs(p.y - st.y) > 400) continue;
      const dx = q.x - p.x, dy = q.y - p.y, L2 = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, ((st.x - p.x) * dx + (st.y - p.y) * dy) / L2));
      const cx = p.x + dx * t, cy = p.y + dy * t, d = (cx - st.x) ** 2 + (cy - st.y) ** 2;
      if (d < bd) { bd = d; const L = Math.sqrt(L2) || 1; best = { x: cx, y: cy, ux: dx / L, uy: dy / L }; }
    }
    if (!best) continue;
    const side = st.side === -1 ? -1 : 1, nx = -best.uy * side, ny = best.ux * side;
    if (G.stations.some((q) => Math.hypot(q.x - best.x, q.y - best.y) < 80 && q.nx * nx + q.ny * ny > 0.5)) continue;   // (one a side)
    const ph = Math.min(TUNNEL.ph, (st.half || TUNNEL.ph) + 8);
    G.stations.push({ x: best.x, y: best.y, ux: best.ux, uy: best.uy, nx, ny, ph, name: String(st.name || '').replace(/ Station$/, '').toUpperCase() });
    // (the platform's own lamps, along its back wall)
    for (let al = -ph + 48; al <= ph - 48; al += 96) { const wx = best.x + best.ux * al + nx * (TUNNEL.pout - 3), wy = best.y + best.uy * al + ny * (TUNNEL.pout - 3); put(G.lamps, wx, wy, { x: wx, y: wy, nx, ny, st: 1 }); }
  }
  // the lamps: every LAMP_GAP along each track, on its outer wall (where the floor ends in the earth)
  const floorAt = (x, y) => nearTrack(G, x, y, TUNNEL.half) !== null || onPlatform(G, x, y);
  for (const list of G.cells.values()) for (const sg of list) {
    if (sg._lamped) continue;
    sg._lamped = true;
    const first = Math.ceil(sg.s0 / TUNNEL.lampGap) * TUNNEL.lampGap;
    for (let s = first; s < sg.s0 + sg.len; s += TUNNEL.lampGap) {
      const t = s - sg.s0, x = sg.ax + sg.ux * t, y = sg.ay + sg.uy * t;
      for (const sd of [-1, 1]) {
        const nx = -sg.uy * sd, ny = sg.ux * sd, wx = x + nx * (TUNNEL.half - 3), wy = y + ny * (TUNNEL.half - 3);
        if (floorAt(x + nx * (TUNNEL.half + 6), y + ny * (TUNNEL.half + 6))) continue;   // (the other track's side: no wall there)
        put(G.lamps, wx, wy, { x: wx, y: wy, nx, ny });
      }
    }
  }
  GEOM.set(map, G);
  return G;
}
// the nearest track within r of (x, y): { d (signed: + on the segment's left), s (along), sg } or null
function nearTrack(G, x, y, r) {
  const a = G.cells.get(Math.floor(x / CELL) * 65536 + Math.floor(y / CELL));
  if (!a) return null;
  let best = null, bd = r * r;
  for (const sg of a) {
    const px = x - sg.ax, py = y - sg.ay;
    let t = px * sg.ux + py * sg.uy;
    t = t < 0 ? 0 : t > sg.len ? sg.len : t;
    const ex = px - sg.ux * t, ey = py - sg.uy * t, d = ex * ex + ey * ey;
    if (d < bd) { bd = d; best = { d: ex * -sg.uy + ey * sg.ux, s: sg.s0 + t, sg }; }
  }
  return best;
}
function onPlatform(G, x, y, list = G.stations) {
  for (const st of list) {
    const dx = x - st.x, dy = y - st.y, al = dx * st.ux + dy * st.uy, ac = dx * st.nx + dy * st.ny;
    if (al >= -st.ph && al <= st.ph && ac >= TUNNEL.pin && ac <= TUNNEL.pout) return st;
  }
  return null;
}

// ---- the bake ------------------------------------------------------------------------------------------------------
// the kinds of ground (K) and their heights
const K_EARTH = 0, K_FLOOR = 1, K_BALLAST = 2, K_SLEEPER = 3, K_RAIL = 4, K_PLAT = 5, K_LINE = 6, K_PILLAR = 7, K_BENCH = 8, K_EDGE = 9;
const hsh = (x, y, s) => { let h = (x * 374761393 + y * 668265263 + s * 2246822519) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const UP = [0, 0, 1];
const COL = {
  earth: [22, 23, 27], ghost: [34, 36, 44], wall: [92, 96, 104], wallLow: [58, 61, 67], wallJoint: [64, 67, 74], tray: [40, 42, 46],
  floor: [66, 68, 74], joint: [52, 54, 60], ballast: [58, 55, 50], sleeper: [96, 90, 80], rail: [168, 174, 182], railSide: [70, 72, 78],
  plat: [138, 142, 150], plat2: [126, 130, 139], line: [232, 192, 32], edge: [88, 92, 100], pillar: [104, 112, 126], pillarDark: [70, 76, 88],
  bench: [122, 82, 50], lamp: [255, 222, 160], sign: [29, 63, 138], signText: [240, 244, 250],
};
// A chunk of the tunnel layer: CHUNK px a side at ap world px per pixel (the engine's art pixel): a GBuf to upload. Each
// pixel is the first thing a ray through it meets coming down from the walls' height (3/4 view: screen y = Y - Z): the
// earth's top, a wall's face (the earth north of the floor, seen from the south), a pillar, a platform's edge, the floor.
// (into: a GBuf of the size to bake into again - the host's, uploaded before the next bake - else a new one; the
// working layers are kept between bakes: no garbage a chunk)
let WK = null;
export function bakeTunnel(map, cx, cy, ap = 2, into = null) {
  const G = tunnelGeom(map), N = Math.round(CHUNK / ap), X0 = cx * CHUNK, Y0 = cy * CHUNK, H = TUNNEL.wallH;
  // the ground's kind and height, world px on the art grid: the chunk and the walls' height south of it
  const R = N + Math.ceil(H / ap) + 1, NR = N * R;
  if (!WK || WK.n !== NR) WK = { n: NR, kind: new Uint8Array(NR), hgt: new Uint8Array(NR), info: new Float32Array(NR * 2), D2: new Float32Array(NR), DS: new Float32Array(NR), SA: new Float32Array(NR) };
  const { kind, hgt, info, D2, DS, SA } = WK;
  info.fill(0);
  const roadAt = (x, y) => { const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE); if (!map.inside || !map.inside(tx, ty)) return false; const t = map.tiles[map.idx(tx, ty)]; return t === T.ROAD || t === T.BRIDGE; };
  // the nearest track to every pixel within the floor's half-width: each segment stamped over the pixels its band covers
  D2.fill(1e9);
  const seen = new Set(), hw = TUNNEL.half;
  for (let gy = Math.floor((Y0 - hw) / CELL); gy <= Math.floor((Y0 + R * ap + hw) / CELL); gy++)
    for (let gx = Math.floor((X0 - hw) / CELL); gx <= Math.floor((X0 + CHUNK + hw) / CELL); gx++) for (const sg of G.cells.get(gx * 65536 + gy) || []) {
      if (seen.has(sg)) continue;
      seen.add(sg);
      const u0 = Math.max(0, Math.floor((Math.min(sg.ax, sg.bx) - hw - X0) / ap)), u1 = Math.min(N - 1, Math.ceil((Math.max(sg.ax, sg.bx) + hw - X0) / ap));
      const r0 = Math.max(0, Math.floor((Math.min(sg.ay, sg.by) - hw - Y0) / ap)), r1 = Math.min(R - 1, Math.ceil((Math.max(sg.ay, sg.by) + hw - Y0) / ap));
      for (let r = r0; r <= r1; r++) {
        const py = Y0 + (r + 0.5) * ap - sg.ay;
        for (let u = u0; u <= u1; u++) {
          const px = X0 + (u + 0.5) * ap - sg.ax;
          let t = px * sg.ux + py * sg.uy;
          t = t < 0 ? 0 : t > sg.len ? sg.len : t;
          const ex = px - sg.ux * t, ey = py - sg.uy * t, d = ex * ex + ey * ey, i = r * N + u;
          if (d < D2[i]) { D2[i] = d; DS[i] = ex * -sg.uy + ey * sg.ux; SA[i] = sg.s0 + t; }
        }
      }
    }
  let any = false;
  const hw2 = hw * hw, sts = G.stations.filter((st) => st.x > X0 - st.ph - 200 && st.x < X0 + CHUNK + st.ph + 200 && st.y > Y0 - st.ph - 200 && st.y < Y0 + R * ap + st.ph + 200);
  // (the streets overhead, by tile: looked up once a tile)
  const tx0 = Math.floor(X0 / TILE), ty0 = Math.floor(Y0 / TILE), TW = Math.ceil(CHUNK / TILE) + 1, TH = Math.ceil(R * ap / TILE) + 1, road = new Uint8Array(TW * TH);
  for (let j = 0; j < TH; j++) for (let i2 = 0; i2 < TW; i2++) road[j * TW + i2] = roadAt((tx0 + i2 + 0.5) * TILE, (ty0 + j + 0.5) * TILE) ? 1 : 0;
  for (let r = 0; r < R; r++) for (let u = 0; u < N; u++) {
    const x = X0 + (u + 0.5) * ap, y = Y0 + (r + 0.5) * ap, i = r * N + u;
    let k = K_EARTH, h = H;
    if (D2[i] < hw2) {
      any = true;
      const d = Math.abs(DS[i]), along = SA[i];
      k = K_FLOOR; h = 0;
      if (d < 27) {
        k = K_BALLAST;
        if (Math.abs(d - TUNNEL.railOff) < 1.6) { k = K_RAIL; h = 4; }
        else if (d < 22 && ((along % TUNNEL.sleeper) + TUNNEL.sleeper) % TUNNEL.sleeper < 6) { k = K_SLEEPER; h = 2; }
      }
      info[i * 2] = DS[i]; info[i * 2 + 1] = along;
    }
    const st = sts.length ? onPlatform(G, x, y, sts) : null;
    if (st) {
      any = true;
      const dx = x - st.x, dy = y - st.y, al = dx * st.ux + dy * st.uy, ac = dx * st.nx + dy * st.ny;
      k = ac < TUNNEL.pin + 5 ? K_LINE : K_PLAT; h = TUNNEL.plat;
      if (ac < TUNNEL.pin + 1.5) k = K_EDGE;
      // pillars to the roof down the back of it, benches between them
      const pa = ((al + st.ph) % 96 + 96) % 96;
      if (ac > TUNNEL.pout - 22 && ac < TUNNEL.pout - 8 && pa > 42 && pa < 54) { k = K_PILLAR; h = H; }
      else if (ac > TUNNEL.pout - 36 && ac < TUNNEL.pout - 26 && pa > 4 && pa < 30 && Math.abs(al) < st.ph - 30) { k = K_BENCH; h = TUNNEL.plat + 6; }
      info[i * 2] = ac; info[i * 2 + 1] = al;
    }
    if (k === K_EARTH && road[(Math.floor(y / TILE) - ty0) * TW + Math.floor(x / TILE) - tx0]) info[i * 2] = 1;   // (a street overhead: ghosted on the earth)
    kind[i] = k; hgt[i] = h;
  }
  if (!any) return null;
  const out = into && into.w === N && into.h === N ? into : new GBuf(N, N);
  out.ap = ap;
  if (out === into) { out.emi.fill(0); }
  const lampsNear = [];
  for (let gy = Math.floor((Y0 - 40) / CELL); gy <= Math.floor((Y0 + CHUNK + H + 40) / CELL); gy++)
    for (let gx = Math.floor((X0 - 40) / CELL); gx <= Math.floor((X0 + CHUNK + 40) / CELL); gx++) for (const L of G.lamps.get(gx * 65536 + gy) || []) lampsNear.push(L);
  const c = [0, 0, 0], n = [0, 0, 1];
  const setC = (a, k = 1) => { c[0] = a[0] * k; c[1] = a[1] * k; c[2] = a[2] * k; };
  const steps = Math.ceil(H / ap);
  for (let v = 0; v < N; v++) for (let u = 0; u < N; u++) {
    // down the ray: the first height z (from the walls' top) where the ground there stands that high
    let hit = -1, z = 0;
    for (let s = steps; s >= 0; s--) {
      const zz = s * ap, r = v + s, i = r * N + u;
      if (r >= R) continue;
      if (hgt[i] >= zz) { hit = i; z = zz; break; }
    }
    if (hit < 0) { hit = v * N + u; z = hgt[hit]; }
    const k = kind[hit], top = hgt[hit] <= z + ap * 0.5, x = X0 + (u + 0.5) * ap, y = Y0 + (Math.floor(hit / N) + 0.5) * ap, ux = u, uy = v;
    const nz = hsh(u + cx * 997, v + cy * 991, 3) - 0.5;
    let e = null, flag = F_GROUND, zOut = z;
    n[0] = 0; n[1] = 0; n[2] = 1;
    if (!top) {   // a face, seen from the south
      flag = 0; n[0] = 0; n[1] = 0.989; n[2] = 0.148;
      if (k === K_EARTH) {
        // the wall: grimy low down, panel joints, the cable run, a lamp now and then
        setC(z < 10 ? COL.wallLow : COL.wall, 1 + nz * 0.08);
        if (((Math.floor(x) % 64) + 64) % 64 < 2) setC(COL.wallJoint);
        if (z >= 30 && z <= 32) setC(COL.tray);
        if (z >= TUNNEL.lampZ - 3 && z <= TUNNEL.lampZ + 3) for (const L of lampsNear) if (Math.abs(L.x - x) < 7 && Math.abs(L.y - y) < 12) { setC(COL.lamp); e = [255, 214, 150, 255]; break; }
      } else if (k === K_PILLAR) setC(z > 30 ? COL.pillarDark : COL.pillar, 1 + nz * 0.05);
      else if (k === K_BENCH) setC(COL.bench, 0.75);
      else setC(COL.edge, 0.85 + nz * 0.06);   // (the platform's edge)
    } else switch (k) {
      case K_EARTH: setC(info[hit * 2] ? COL.ghost : COL.earth, 1 + nz * 0.15); flag = F_GROUND | F_NOCAST; break;
      case K_FLOOR: setC(COL.floor, 1 + nz * 0.1); if (((Math.floor(info[hit * 2 + 1]) % 96) + 96) % 96 < 2) setC(COL.joint); break;
      case K_BALLAST: setC(COL.ballast, 0.8 + hsh(u, v, 9) * 0.4); break;
      case K_SLEEPER: setC(COL.sleeper, 1 + nz * 0.08); break;
      case K_RAIL: setC(COL.rail, 1 + nz * 0.05); n[0] = 0.15; n[1] = -0.2; n[2] = 0.968; break;
      case K_PLAT: {
        const al = info[hit * 2 + 1], ac = info[hit * 2];
        setC((Math.floor(al / 16) + Math.floor(ac / 16)) & 1 ? COL.plat : COL.plat2, 1 + nz * 0.05);
        break;
      }
      case K_LINE: setC(COL.line, 1 + nz * 0.05); break;
      case K_EDGE: setC(COL.edge); break;
      case K_PILLAR: setC(COL.tray); flag = F_GROUND | F_NOCAST; break;   // (its top: up at the roof)
      case K_BENCH: setC(COL.bench, 1 + nz * 0.06); break;
      default: setC(COL.floor);
    }
    out.put(ux, uy, c, n, zOut, e, flag);
  }
  // the lamps on the walls that run north-south (seen edge on): the fitting where it hangs, up the wall (the north walls'
  // are on their faces, above; the south walls' face away)
  for (const L of lampsNear) {
    if (L.ny > 0.5 || L.ny < -0.5) continue;
    const u0 = Math.round((L.x - L.nx * 2 - X0) / ap), v0 = Math.round((L.y - TUNNEL.lampZ - Y0) / ap);
    for (let dv = -1; dv <= 1; dv++) for (let du = 0; du <= 1; du++) {
      const uu = u0 + du, vv = v0 + dv;
      if (uu < 0 || vv < 0 || uu >= N || vv >= N) continue;
      out.put(uu, vv, dv === -1 ? COL.tray : COL.lamp, UP, TUNNEL.lampZ, dv === -1 ? null : [255, 214, 150, 255], F_NOCAST);
    }
  }
  // the stations' names: on a blue sign at the back of the platform, facing the track (painted on the platform where the
  // sign would stand edge on to us)
  for (const st of G.stations) {
    const bx = st.x + st.nx * (TUNNEL.pout - 14), by = st.y + st.ny * (TUNNEL.pout - 14);
    if (bx < X0 - 300 || bx > X0 + CHUNK + 300 || by < Y0 - 300 || by > Y0 + CHUNK + 300 || !st.name) continue;
    const tw = textWidth(st.name, { sx: 1 }) + 4, sw = tw * ap;
    for (let j = -1; j <= 1; j += 2) {   // (two signs along the platform)
      const sx = bx + st.ux * j * st.ph * 0.45, sy = by + st.uy * j * st.ph * 0.45;
      // a sign on the floor of the platform, square to the screen: 9 art px tall, the name in white on blue
      const u0 = Math.round((sx - X0) / ap - tw / 2), v0 = Math.round((sy - TUNNEL.plat - Y0) / ap - 4);
      for (let dv = 0; dv < 9; dv++) for (let du = 0; du < tw; du++) {
        const uu = u0 + du, vv = v0 + dv;
        if (uu < 0 || vv < 0 || uu >= N || vv >= N) continue;
        out.put(uu, vv, dv === 0 || dv === 8 || du === 0 || du === tw - 1 ? COL.edge : COL.sign, UP, TUNNEL.plat + 1, [20, 40, 90, 60], F_GROUND);
      }
      drawText((px, py) => { const uu = u0 + 2 + px, vv = v0 + 2 + py; if (uu >= 0 && vv >= 0 && uu < N && vv < N) out.put(uu, vv, COL.signText, UP, TUNNEL.plat + 1, [200, 210, 230, 120], F_GROUND); }, st.name, 0, 0, { sx: 1 });
      void sw;
    }
  }
  return out;
}

// the lamps in a box (world px): for the light pass
export function tunnelLamps(map, x0, y0, x1, y1, out = []) {
  const G = tunnelGeom(map);
  out.length = 0;
  for (let gy = Math.floor(y0 / CELL); gy <= Math.floor(y1 / CELL); gy++) for (let gx = Math.floor(x0 / CELL); gx <= Math.floor(x1 / CELL); gx++)
    for (const L of G.lamps.get(gx * 65536 + gy) || []) if (L.x > x0 && L.x < x1 && L.y > y0 && L.y < y1) out.push(L);
  return out;
}
// any tunnel near (x, y)? (the host checks before drawing the layer)
export function tunnelNear(map, x, y) { const G = tunnelGeom(map); return !!G.cells.get(Math.floor(x / CELL) * 65536 + Math.floor(y / CELL)); }
