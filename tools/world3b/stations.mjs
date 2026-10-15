// World v3b: the stations and the level crossings, audited (the owner's playtest, 2026-10-15: "Train stations should
// have streets and parking lots connected to them ... so that cars can make a turn out of the parking lot and back out"
// and "train tracks should cross streets almost perpendicular so the crossing guard cross the street"). Builds the
// world as the server does (server/world3.js buildWorld3) and lists:
//  - each main-line station: its house, the street nearest its front (how far, its kind and name), whether that street
//    is a dead-end stub (it leads only to road ends: server/systems/roadends.js deadWays), the way by road to the
//    nearest arterial (an avenue, a boulevard or a skeleton arterial), its car park (shared/world3-rail.js
//    stationLots: the lot, its driveway, the loop through it) and the paved lots and road ends round it;
//  - each subway entrance: its kiosk and the street it stands on;
//  - each level crossing: where, the road it carries, the angle between the road and the track (90 = square on);
//  - with --sim N: a headless server world (server/world.js) with a player standing by each station for N in-game
//    minutes (default 4) of traffic, and the traffic cars stopped near each station - barely moving (inside a 50 px
//    circle) for more than 8 s, not at a red light or a lowered crossing gate - counted.
// and draws a picture round each station and each crossing under 75 degrees (3 px a tile; roads by kind, road ends red,
// the house magenta, the car park's driveway cyan, the track black).
//   node --expose-gc tools/world3b/stations.mjs [out-dir] [--sim N] [--no-png]   (heavy: under the heavy lock)
//   -> <out>/stations.json, <out>/station-<name>.png, <out>/crossing-<i>.png
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const args = process.argv.slice(2);
const flag = (k) => args.includes(k);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : d; };
const OUT = args.find((a, i) => !a.startsWith('--') && !(i && args[i - 1] === '--sim')) || '/tmp/cla-stations';
mkdirSync(OUT, { recursive: true });

const { buildWorld3 } = await import(join(ROOT, 'server/world3.js'));
const { T, TILE, K } = await import(join(ROOT, 'shared/constants.js'));
const { DISTRICTS } = await import(join(ROOT, 'shared/mapcore.js'));
const { deadWays } = await import(join(ROOT, 'server/systems/roadends.js'));
const t0 = Date.now();
const { map: m, ms, peakMB } = await buildWorld3(1337, { log: () => {} });
const net = m.net;
const dead = deadWays(net);
const isDeadEdge = (id) => dead.has(id * 2) || dead.has(id * 2 + 1);
const ART = new Set(['art', 'ave', 'blvd']);
const DRIVE = (e) => e && e.lvl === 0 && e.kind !== 'hwy' && e.kind !== 'ramp';
const dname = (x, y) => DISTRICTS[m.dist[m.idx(Math.floor(x / TILE), Math.floor(y / TILE))]]?.name || '?';
const r1 = (v) => Math.round(v * 10) / 10;

// ---- the edges' segments in a grid ----
const CELL = 512, grid = new Map(), gk = (cx, cy) => (cx + 64) * 4096 + cy + 64;
for (const e of net.edges) {
  if (!e) continue;
  for (let k = 0; k + 1 < e.pts.length; k++) {
    const a = e.pts[k], b = e.pts[k + 1];
    for (let cy = Math.floor(Math.min(a.y, b.y) / CELL); cy <= Math.floor(Math.max(a.y, b.y) / CELL); cy++)
      for (let cx = Math.floor(Math.min(a.x, b.x) / CELL); cx <= Math.floor(Math.max(a.x, b.x) / CELL); cx++) {
        const key = gk(cx, cy); let l = grid.get(key); if (!l) grid.set(key, (l = [])); l.push([e.id, k]);
      }
  }
}
// the edges within r px of (x, y) that pass `ok`: [{ e, d, x, y, ux, uy, s }] nearest first (one per edge)
function edgesNear(x, y, r, ok = DRIVE) {
  const best = new Map();
  for (let cy = Math.floor((y - r) / CELL); cy <= Math.floor((y + r) / CELL); cy++) for (let cx = Math.floor((x - r) / CELL); cx <= Math.floor((x + r) / CELL); cx++) {
    for (const [id, k] of grid.get(gk(cx, cy)) || []) {
      const e = net.edges[id];
      if (!ok(e)) continue;
      const a = e.pts[k], b = e.pts[k + 1], dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / l2)), px = a.x + dx * t, py = a.y + dy * t, d = Math.hypot(px - x, py - y);
      if (d > r) continue;
      const o = best.get(id);
      if (!o || d < o.d) { const l = Math.sqrt(l2); best.set(id, { e, d, x: px, y: py, ux: dx / l, uy: dy / l, k, t }); }
    }
  }
  return [...best.values()].sort((p, q) => p.d - q.d);
}
// the way by road (px) from a point on edge e (nearest-point info) to the nearest node on an arterial
function toArterial(hit) {
  const e = hit.e;
  if (ART.has(e.kind)) return 0;
  // the distance along e from the hit to each end
  let s = 0;
  for (let k = 0; k < hit.k; k++) s += Math.hypot(e.pts[k + 1].x - e.pts[k].x, e.pts[k + 1].y - e.pts[k].y);
  s += Math.hypot(e.pts[hit.k + 1].x - e.pts[hit.k].x, e.pts[hit.k + 1].y - e.pts[hit.k].y) * hit.t;
  const dist = new Map([[e.a, s], [e.b, Math.max(0, e.len - s)]]), done = new Set();
  for (let it = 0; it < 20000; it++) {
    let n = -1, bd = Infinity;
    for (const [k, d] of dist) if (!done.has(k) && d < bd) { bd = d; n = k; }
    if (n < 0 || bd > 40000) return Infinity;
    done.add(n);
    const node = net.nodes[n];
    if (node.edges.some((id) => ART.has(net.edges[id].kind) && net.edges[id].lvl === 0)) return bd;
    for (const id of node.edges) {
      const f = net.edges[id];
      if (!DRIVE(f) && f.lvl !== 'ramp') continue;
      const o = f.a === n ? f.b : f.a, nd = bd + f.len;
      if (!done.has(o) && nd < (dist.get(o) ?? Infinity)) dist.set(o, nd);
    }
  }
  return Infinity;
}
// LOT tiles round a point: the connected lots within r tiles, biggest first [{ n, box, touchesRoad }]
function lotsNear(x, y, r) {
  const cx = Math.floor(x / TILE), cy = Math.floor(y / TILE), seen = new Set(), out = [];
  for (let ty = cy - r; ty <= cy + r; ty++) for (let tx = cx - r; tx <= cx + r; tx++) {
    if (!m.inside(tx, ty) || m.tiles[m.idx(tx, ty)] !== T.LOT || seen.has(m.idx(tx, ty))) continue;
    const st = [[tx, ty]], box = [tx, ty, tx, ty]; let n = 0, road = 0;
    seen.add(m.idx(tx, ty));
    while (st.length) {
      const [px, py] = st.pop(); n++;
      box[0] = Math.min(box[0], px); box[1] = Math.min(box[1], py); box[2] = Math.max(box[2], px); box[3] = Math.max(box[3], py);
      for (const [ax, ay] of [[px - 1, py], [px + 1, py], [px, py - 1], [px, py + 1]]) {
        if (!m.inside(ax, ay)) continue;
        const i = m.idx(ax, ay), t = m.tiles[i];
        if (t === T.ROAD) road++;
        if (t === T.LOT && !seen.has(i) && Math.abs(ax - cx) <= r + 20 && Math.abs(ay - cy) <= r + 20) { seen.add(i); st.push([ax, ay]); }
      }
    }
    out.push({ n, box, road });
  }
  return out.sort((p, q) => q.n - p.n);
}

// ---- the stations ----
const stations = [];
for (const h of m.railHubs || []) {
  const hx = h.x + Math.cos(h.a) * 18, hy = h.y + Math.sin(h.a) * 18;   // the house's middle
  const fx = h.x + Math.cos(h.a) * 80, fy = h.y + Math.sin(h.a) * 80;   // its front door's side
  const plan = ((m.world3 && m.world3.stations) || []).find((q) => `${q.name} Station` === h.name) || null;   // (shared/world3-stations.js)
  const near = edgesNear(fx, fy, 40 * TILE);
  const hit = near[0] || null, own = hit;
  // the station's own roads (world3-stations.js: '<name> Station Road'): every edge of them, and whether any leads only to a road end
  const mine = net.edges.filter((e) => e && e.name === `${h.name} Road`);
  const ends = [];
  for (const n of net.nodes) if (n.edges.length === 1 && n.lvl === 0 && Math.hypot(n.x - hx, n.y - hy) < 1600) { const e = net.edges[n.edges[0]]; ends.push({ at: [Math.round(n.x / TILE), Math.round(n.y / TILE)], kind: e.kind, name: e.name, bulb: Math.round(n.bulb || 0), d: Math.round(Math.hypot(n.x - hx, n.y - hy) / TILE) }); }
  const lots = lotsNear(hx, hy, 30);
  const spots = (m.parking || []).filter((p) => Math.hypot(p.x - hx, p.y - hy) < 30 * TILE).length;
  stations.push({
    name: h.name, at: [Math.round(hx / TILE), Math.round(hy / TILE)], district: dname(hx, hy), moved: !!h.moved,
    street: hit ? { d: Math.round(hit.d / TILE), kind: hit.e.kind, name: hit.e.name, edge: hit.e.id, deadEnd: isDeadEdge(hit.e.id) } : null,
    connected: !!(own && (own.d <= 12 * TILE)),
    toArterial: own ? Math.round(toArterial(own.e === hit?.e ? hit : { e: own.e, k: 0, t: 0 }) / TILE) : null,
    plan: plan ? { how: plan.how, side: plan.side, loop: plan.loop, road: plan.road, ends: plan.ends, trims: plan.trims } : null,
    lot: plan && plan.lot ? { size: [Math.round(plan.lot.a1 - plan.lot.a0), Math.round(plan.lot.c1 - plan.lot.c0)], spaces: plan.spaces || 0, driveway: { edges: mine.length, len: Math.round(mine.reduce((a, e) => a + e.len, 0) / TILE), deadEnd: mine.some((e) => isDeadEdge(e.id)), loop: !!plan.loop && !mine.some((e) => isDeadEdge(e.id)) } } : null,
    pavedLots: lots.slice(0, 4).map((l) => ({ tiles: l.n, box: l.box, byRoad: l.road > 0 })), parkingSpots: spots,
    roadEnds: ends.sort((p, q) => p.d - q.d).slice(0, 8),
  });
}
// the subway entrances (their kiosks on plazas by the street)
const subway = [];
for (const r of m.rails || []) {
  if (!r.subway) continue;
  for (const st of r.stations) {
    if (!st.kiosk || subway.some((q) => q.name === st.name && q.line === r.subway)) continue;
    const k = st.kiosk.out, near = edgesNear(k.x, k.y, 20 * TILE);
    subway.push({ name: st.name, line: r.subway, at: [Math.round(k.x / TILE), Math.round(k.y / TILE)], street: near[0] ? { d: Math.round(near[0].d / TILE), kind: near[0].e.kind, name: near[0].e.name, deadEnd: isDeadEdge(near[0].e.id) } : null });
  }
}

// ---- the level crossings ----
const fold = (d) => { let a = Math.abs(Math.atan2(Math.sin(d), Math.cos(d))); if (a > Math.PI / 2) a = Math.PI - a; return a * 180 / Math.PI; };
const crossings = (m.railXings || []).map((c, i) => {
  const ps = c.x1 !== undefined ? [[c.x0, c.y0], [c.x1, c.y1]] : [[c.x, c.y]];
  let best = null;
  for (const [x, y] of ps) for (const h of edgesNear(x, y, 60, (e) => e && (e.lvl === 0 || e.lvl === 'ramp'))) if (!best || h.d < best.d) best = h;
  const ang = best ? fold(Math.atan2(best.uy, best.ux) - c.a) : null;
  return { i, at: [Math.round(c.x / TILE), Math.round(c.y / TILE)], angle: ang === null ? null : r1(ang), road: best ? { name: best.e.name, kind: best.e.kind, edge: best.e.id } : null, district: dname(c.x, c.y), hw: Math.round(c.hw), ra: c.ra !== undefined ? r1(c.ra) : undefined, double: c.x1 !== undefined };
});
const angs = crossings.filter((c) => c.angle !== null).map((c) => c.angle).sort((p, q) => p - q);
const hist = {};
for (const a of angs) { const b = `${Math.floor(a / 15) * 15}-${Math.floor(a / 15) * 15 + 15}`; hist[b] = (hist[b] || 0) + 1; }
const summary = {
  build: { ms, peakMB },
  stations: stations.length,
  noStreet: stations.filter((s) => !s.connected).map((s) => s.name),
  noLot: stations.filter((s) => !s.lot).map((s) => s.name),
  stub: stations.filter((s) => (s.lot && s.lot.driveway.deadEnd) || (s.street && s.street.deadEnd)).map((s) => s.name),
  squared: m.world3 && m.world3.squared ? { found: m.world3.squared.found, squared: m.world3.squared.squared, left: m.world3.squared.left.map((c) => ({ name: c.name, at: c.at, angle: c.angle })) } : null,
  underpasses: m.world3 && m.world3.underpasses ? m.world3.underpasses.map((c) => ({ name: c.name, at: c.at, angle: c.angle, under: c.under })) : null,
  stationLots: m.world3 ? m.world3.stationLots : null,
  crossings: crossings.length, angleMin: angs[0], under75: angs.filter((a) => a < 75).length, under60: angs.filter((a) => a < 60).length, angleHist: hist,
  homes: (m.homes || []).length, homesSig: homesSig(m),
};
function homesSig(map) { let h = 0x811c9dc5; for (const hm of map.homes || []) for (const v of [hm.x | 0, hm.y | 0, hm.b | 0]) { h ^= v & 0xffff; h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(36); }

// ---- the traffic ----
let sim = null;
if (flag('--sim')) sim = await simulate(+opt('--sim', 4));
async function simulate(minutes) {
  const { joinPlayer, teleport } = await import(join(ROOT, 'test/helpers.js'));
  const { World } = await import(join(ROOT, 'server/world.js'));
  const { mulberry32 } = await import(join(ROOT, 'shared/rng.js'));
  const { signalFor } = await import(join(ROOT, 'shared/signals.js'));
  Math.random = mulberry32(77);
  const w = new World(m, { npcBudget: 600, rand: mulberry32(78), loopStart: 400, day: 0, throwErrors: true });
  const spots = [];
  for (const h of m.railHubs) {
    // stand on open ground by the house, the station's street in view
    const hx = h.x + Math.cos(h.a) * 18, hy = h.y + Math.sin(h.a) * 18;
    let at = null;
    for (let r = 120; r < 600 && !at; r += 24) for (let k = 0; k < 16; k++) { const x = hx + Math.cos(k / 16 * 6.283) * r, y = hy + Math.sin(k / 16 * 6.283) * r; if (m.isWalkable(x, y) && m.tileAtPx(x, y) !== T.ROAD && !m.isWater(x, y)) { at = { x, y }; break; } }
    if (!at) continue;
    const p = joinPlayer(w).p; teleport(w, p.ped, at.x, at.y);
    spots.push({ name: h.name, x: hx, y: hy });
  }
  const R = 40 * TILE, hist = new Map(), out = new Map(spots.map((s) => [s.name, { cars: new Set(), stuck: new Set(), stuckS: 0, longest: 0, roadEnd: 0, where: [], visits: 0, out: 0, maxIn: 0, inside: new Map(), jams: 0 }]));
  const JAM_S = 30;   // (stopped longer than this, not at a red light or a lowered gate: a jam)
  // each station's own roads: its station roads (shared/world3-stations.js) - in a world without them, the roads within 50
  // tiles of it that lead only to a road's end (what a car turning in toward the station meets)
  const own = new Map(spots.map((s) => {
    let ids = net.edges.filter((e) => e && e.name === `${s.name} Road`).map((e) => e.id);
    if (!ids.length) ids = net.edges.filter((e) => e && e.lvl === 0 && isDeadEdge(e.id) && e.pts.some((p) => Math.hypot(p.x - s.x, p.y - s.y) < 50 * TILE)).map((e) => e.id);
    return [s.name, new Set(ids)];
  }));
  const atRed = (v) => {
    const st = v.ai && v.ai.pts && v.ai.pts.find((p) => p.stop);
    if (!st) return false;
    const n = net.nodes[st.node];
    return !!(n && n.light && Math.hypot(st.x - v.x, st.y - v.y) < 260 && signalFor(n, st.edge, w.loopTime) !== 'G');
  };
  const atGate = (v) => (w.xing || []).some((s, i) => s.down && Math.hypot(m.railXings[i].x - v.x, m.railXings[i].y - v.y) < 500);
  const ticks = Math.round(minutes * 60 * 20), t1 = Date.now();
  for (let tick = 0; tick < ticks; tick++) {
    w.step();
    if (tick % 10) continue;
    const now = w.time;
    for (const v of w.entities.values()) {
      if (v.kind !== K.VEH || !v.ai || v.ai.kind !== 'traffic') continue;
      const s = spots.find((q) => Math.abs(q.x - v.x) < R && Math.abs(q.y - v.y) < R);
      // on the station's own roads: a visit, and how long until it's off them again
      for (const q of spots) {
        const o = out.get(q.name), ids = own.get(q.name), on = v.ai.edge !== undefined && ids.has(v.ai.edge), t0 = o.inside.get(v.id);
        if (on && t0 === undefined) { o.inside.set(v.id, now); o.visits++; }
        else if (!on && t0 !== undefined) { o.inside.delete(v.id); o.out++; o.maxIn = Math.max(o.maxIn, now - t0); }
      }
      let H = hist.get(v.id); if (!H) hist.set(v.id, (H = []));
      H.push({ t: now, x: v.x, y: v.y });
      while (H.length && now - H[0].t > 8.01) H.shift();
      if (!s) continue;
      const o = out.get(s.name);
      o.cars.add(v.id);
      if (now - H[0].t < 7.99) continue;
      let r = 0; for (const q of H) r = Math.max(r, Math.hypot(q.x - v.x, q.y - v.y));
      if (r >= 50 || atRed(v) || atGate(v)) { if (v._st) { o.longest = Math.max(o.longest, now - v._st); if (now - v._st > JAM_S) o.jams++; v._st = 0; } continue; }
      if (!v._st) v._st = now - 8;
      if (!o.stuck.has(v.id) && o.where.length < 12) { const e0 = v.ai.edge !== undefined ? net.edges[v.ai.edge] : null; o.where.push([Math.round(v.x / TILE), Math.round(v.y / TILE), e0 ? `${e0.kind} ${e0.name}${isDeadEdge(e0.id) ? ' (dead end)' : ''}` : '-', v.ai.turn ? 'turning' : v._blk ? 'behind a car' : '']); }
      o.stuck.add(v.id); o.stuckS += 0.5;
      const e = v.ai.edge !== undefined ? net.edges[v.ai.edge] : null;
      if (e && isDeadEdge(e.id)) o.roadEnd += 0.5;
    }
  }
  const res = {};
  const end = w.time;
  for (const [k, o] of out) {
    let still = 0;
    for (const [id, t0] of o.inside) if (w.get(id)) { still++; o.maxIn = Math.max(o.maxIn, end - t0); }
    for (const id of o.stuck) { const v = w.get(id); if (v && v._st) { o.longest = Math.max(o.longest, end - v._st); if (end - v._st > JAM_S) o.jams++; } }
    res[k] = { cars: o.cars.size, stuckCars: o.stuck.size, stuckCarS: Math.round(o.stuckS), onRoadEndS: Math.round(o.roadEnd), longest: Math.round(o.longest), jams: o.jams, ownRoads: own.get(k).size, visits: o.visits, drovePast: o.out, stillOn: still, maxOnS: Math.round(o.maxIn), where: o.where };
  }
  const tot = { cars: 0, stuckCars: 0, stuckCarS: 0, onRoadEndS: 0, jams: 0, visits: 0, drovePast: 0, stillOn: 0 };
  for (const o of Object.values(res)) for (const k of Object.keys(tot)) tot[k] += o[k];
  return { minutes, wallS: Math.round((Date.now() - t1) / 1000), total: tot, byStation: res, turns: w.turns || 0 };
}

writeFileSync(join(OUT, 'stations.json'), JSON.stringify({ summary, stations, subway, crossings, sim }, null, 1));
console.log(JSON.stringify(summary, null, 1));
for (const s of stations) console.log(`${s.name.padEnd(16)} ${String(s.at).padEnd(10)} street ${s.street ? `${s.street.d}t ${s.street.kind} '${s.street.name}'${s.street.deadEnd ? ' DEAD-END' : ''}` : 'none'}; to arterial ${s.toArterial}t; ${s.plan ? `plan ${s.plan.how} side ${s.plan.side}${s.plan.road ? ` on '${s.plan.road}'` : ''}; ` : ''}lot ${s.lot ? `${s.lot.size[0]}x${s.lot.size[1]} tiles, ${s.lot.spaces} spaces, its roads ${s.lot.driveway.len}t in ${s.lot.driveway.edges} edges${s.lot.driveway.loop ? ' (a loop)' : ''}${s.lot.driveway.deadEnd ? ' DEAD-END' : ''}` : 'none'}; paved ${s.pavedLots.map((l) => l.tiles).join(',') || '-'}; ends ${s.roadEnds.length}`);
console.log('crossings under 75:', crossings.filter((c) => c.angle !== null && c.angle < 75).map((c) => `#${c.i} ${c.at} ${c.angle} ${c.road && c.road.name} (${c.district})`).join('\n  '));
if (sim) console.log('traffic', JSON.stringify(sim, null, 1));

// ---- the pictures ----
if (!flag('--no-png')) {
  const COL = { [T.WALL]: [90, 90, 90], [T.GRASS]: [118, 150, 92], [T.SIDEWALK]: [196, 196, 188], [T.ROAD]: [62, 62, 66], [T.PLAZA]: [210, 200, 180], [T.BUILDING]: [150, 92, 70], [T.WATER]: [70, 140, 210], [T.DEEP]: [40, 90, 170], [T.SAND]: [226, 208, 150], [T.DOCK]: [140, 110, 80], [T.DIRT]: [160, 130, 90], [T.FIELD]: [196, 186, 96], [T.BRIDGE]: [120, 120, 130], [T.LOT]: [95, 95, 120], [T.FLOOR]: [150, 92, 70], [T.COUNTER]: [150, 92, 70] };
  const KCOL = { hwy: [255, 200, 0], ramp: [255, 160, 0], art: [255, 255, 255], ave: [230, 230, 255], blvd: [230, 230, 255], st: [180, 220, 255], minor: [160, 255, 160], rural: [255, 230, 180], dirt: [200, 160, 120], alley: [150, 150, 150], drive: [0, 255, 255], front: [255, 200, 255] };
  const jobs = [];
  const crop = (name, cx, cy, R, S) => {
    const x0 = Math.floor(cx / TILE) - R, y0 = Math.floor(cy / TILE) - R, N = 2 * R, img = Buffer.alloc(N * N * 3);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const tx = x0 + x, ty = y0 + y, t = m.inside(tx, ty) ? m.tiles[m.idx(tx, ty)] : T.DEEP, c = COL[t] || [255, 0, 255], o = (y * N + x) * 3; img[o] = c[0]; img[o + 1] = c[1]; img[o + 2] = c[2]; }
    const f = join(OUT, `${name}.rgb`);
    writeFileSync(f, img);
    const px = (x, y) => [(x / TILE - x0) * S, (y / TILE - y0) * S];
    const inside = (x, y) => x / TILE > x0 - 10 && y / TILE > y0 - 10 && x / TILE < x0 + N + 10 && y / TILE < y0 + N + 10;
    const lines = [];
    for (const e of net.edges) if (e && e.pts.some((p) => inside(p.x, p.y))) lines.push({ c: KCOL[e.kind] || [255, 0, 255], w: e.lvl === 1 ? 1 : 2, pts: e.pts.map((p) => px(p.x, p.y)), dead: isDeadEdge(e.id) });
    const rails = [];
    for (const r of m.rails || []) { let run = []; for (const p of r.pts) { if (!p.under && inside(p.x, p.y)) run.push(px(p.x, p.y)); else if (run.length) { rails.push(run); run = []; } } if (run.length) rails.push(run); }
    const ends = net.nodes.filter((n) => n.edges.length === 1 && inside(n.x, n.y)).map((n) => px(n.x, n.y));
    const houses = (m.railHubs || []).filter((h) => inside(h.x, h.y)).map((h) => { const x = h.x + Math.cos(h.a) * 18, y = h.y + Math.sin(h.a) * 18; const ux = Math.cos(h.a - Math.PI / 2), uy = Math.sin(h.a - Math.PI / 2), vx = Math.cos(h.a), vy = Math.sin(h.a); return [[-70, -46], [70, -46], [70, 46], [-70, 46]].map(([u, v]) => px(x + ux * u + vx * v, y + uy * u + vy * v)); });
    const xs = (m.railXings || []).filter((c) => inside(c.x, c.y)).map((c) => ({ p: px(c.x, c.y), a: c.a, ra: c.ra, arm: (c.arm || 66) / TILE * S, hw: (c.rw || c.hw || 40) / TILE * S }));
    jobs.push({ f, out: join(OUT, `${name}.png`), N, S, lines, rails, ends, houses, xs });
  };
  for (const s of stations) crop(`station-${s.name.replace(/[^A-Za-z]+/g, '-')}`, s.at[0] * TILE, s.at[1] * TILE, 96, 3);
  for (const c of crossings) if (c.angle !== null && c.angle < 75) crop(`crossing-${c.i}`, c.at[0] * TILE, c.at[1] * TILE, 40, 6);
  writeFileSync(join(OUT, 'jobs.json'), JSON.stringify(jobs));
  const py = `
import json, math, os
from PIL import Image, ImageDraw
for j in json.load(open(${JSON.stringify(join(OUT, 'jobs.json'))})):
    if not os.path.exists(j['f']): continue
    N, S = j['N'], j['S']
    im = Image.frombytes('RGB', (N, N), open(j['f'], 'rb').read()).resize((N * S, N * S), Image.NEAREST)
    g = ImageDraw.Draw(im)
    for l in j['lines']:
        g.line([tuple(p) for p in l['pts']], fill=tuple(l['c']), width=l['w'])
    for r in j['rails']:
        if len(r) > 1: g.line([tuple(p) for p in r], fill=(10, 10, 10), width=2)
    for x, y in j['ends']:
        g.ellipse([x - 5, y - 5, x + 5, y + 5], outline=(255, 0, 0), width=2)
    for h in j['houses']:
        g.polygon([tuple(p) for p in h], outline=(255, 0, 255), width=2)
    for c in j['xs']:
        x, y = c['p']
        g.ellipse([x - 4, y - 4, x + 4, y + 4], outline=(255, 60, 60), width=2)
        a = c.get('ra') if c.get('ra') is not None else c['a'] + math.pi / 2
        ux, uy = math.cos(a), math.sin(a)
        wx, wy = uy, -ux
        for sg in (-1, 1):
            # the gate line across the road: arm px from the track along the road (a road's arm: c.ra; else along the track)
            k = c['arm'] / max(0.2, abs(math.cos(a - c['a'] - math.pi / 2))) if c.get('ra') is not None else c['arm']
            gx, gy = x + ux * sg * k, y + uy * sg * k
            g.line([(gx - wx * c['hw'], gy - wy * c['hw']), (gx + wx * c['hw'], gy + wy * c['hw'])], fill=(255, 40, 40), width=2)
    im.save(j['out'])
    os.remove(j['f'])
`;
  const r = spawnSync('python3', ['-c', py], { stdio: 'inherit' });
  if (r.status !== 0) console.log('python3 + PIL could not draw the pictures');
}
console.log(`done in ${Math.round((Date.now() - t0) / 1000)} s -> ${OUT}`);
