// The road network and the elevated highway: every ramp can be driven, the barriers hold at
// normal speeds and give way when rammed, and the roads hang together the way they would in a
// real city (nothing just stops in the middle of nowhere, one-ways never trap you).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer } from './helpers.js';
import { pointAt, measure } from '../shared/geom.js';
import { edgeZ, ROAD_RANK, laneOffset } from '../shared/roads.js';
import { BARRIER_BREAK_SPEED } from '../shared/rules.js';

function drive(w, p, car, pts, maxTicks = 500) {
  let seq = p.ack || 0;
  const L = pts[pts.length - 1].s;
  for (let i = 0; i < maxTicks; i++) {
    let best = 0, bd = 1e9;
    for (let s = 0; s <= L; s += 8) { const q = pointAt(pts, s); const d = Math.hypot(q.x - car.x, q.y - car.y); if (d < bd) { bd = d; best = s; } }
    const tgt = pointAt(pts, Math.min(L, best + 120));
    let dx = tgt.x - car.x, dy = tgt.y - car.y;
    if (best >= L - 20) { const t = pointAt(pts, L); dx = t.tx; dy = t.ty; }
    const l = Math.hypot(dx, dy) || 1;
    p.inputQ.push({ seq: ++seq, bits: 0, mx: dx / l, my: dy / l, aim: 0 });
    w.step();
    const end = pointAt(pts, L);
    if (Math.hypot(end.x - car.x, end.y - car.y) < 90) return true;
  }
  return false;
}
function seat(w, p, car) { p.ped.vehId = car.id; p.ped.seat = 0; car.seats[0] = p.ped.id; p.ped.x = car.x; p.ped.y = car.y; p.ped.lz = car.lz; w.place(p.ped); }

test('every highway ramp can be driven, from the lane that feeds it to where it lands', () => {
  const w = makeWorld();
  const m = w.map;
  const { p } = joinPlayer(w);
  const ramps = m.edges.filter((e) => e.lvl === 'ramp');
  assert.ok(ramps.length >= 10, `ramps on the ring (${ramps.length})`);
  const bad = [];
  for (const e of ramps) {
    const z0 = edgeZ(e, e.a, 0), z1 = edgeZ(e, e.a, e.len);
    const rd = Math.atan2(e.pts[1].y - e.pts[0].y, e.pts[1].x - e.pts[0].x);
    const feed = m.edges.filter((q) => q.id !== e.id && q.lvl !== 'ramp' && (q.b === e.a || (!q.oneway && q.a === e.a))).find((q) => {
      const fp = q.b === e.a ? q.pts : q.pts.slice().reverse(); const n = fp.length;
      const fd = Math.atan2(fp[n - 1].y - fp[n - 2].y, fp[n - 1].x - fp[n - 2].x);
      return Math.abs(Math.atan2(Math.sin(fd - rd), Math.cos(fd - rd))) < 1;
    });
    let pre = [];
    if (feed) {
      const fp = feed.b === e.a ? feed.pts : feed.pts.slice().reverse();
      const lane = feed.kind === 'hwy' ? laneOffset(feed, 0) : 0;   // (the outer lane the deceleration lane peels off)
      const off = fp.map((q, i) => { const a = fp[Math.max(0, i - 1)], b = fp[Math.min(fp.length - 1, i + 1)]; const dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1; return { x: q.x - (dy / l) * lane, y: q.y + (dx / l) * lane }; });
      const L = measure(off);
      pre = off.filter((q) => q.s > L - 900 && q.s < L - 60).map((q) => ({ x: q.x, y: q.y }));
    }
    const path = pre.concat(e.pts.map((q) => ({ x: q.x, y: q.y })));
    measure(path);
    const a = pointAt(path, 4);
    const car = w.spawnVehicle('sedan', a.x, a.y, Math.atan2(a.ty, a.tx), {});
    car.lz = z0; car.vx = a.tx * 300; car.vy = a.ty * 300;
    seat(w, p, car);
    const ok = drive(w, p, car, path);
    if (!ok || Math.abs(car.lz - z1) > 0.2) bad.push(`ramp ${e.id} at ${Math.round(e.pts[0].x / 32)},${Math.round(e.pts[0].y / 32)} (z ${car.lz.toFixed(2)})`);
    p.ped.vehId = 0; w.remove(car);
  }
  assert.deepEqual(bad, [], 'ramps you can\'t get along');
});

test('highway barriers hold at normal speeds, give way when rammed, and you drop to the street', () => {
  const w = makeWorld();
  const m = w.map;
  const { p } = joinPlayer(w);
  // a straight stretch of deck
  const sg = m.levels.segs.find((q) => !q.ramp && q.len > 200 && Math.abs(q.uy) < 0.05);
  assert.ok(sg, 'a straight deck stretch');
  const mx = (sg.ax + sg.bx) / 2, my = (sg.ay + sg.by) / 2;
  const nx = -sg.uy, ny = sg.ux; // towards one barrier
  const ram = (speed) => {
    const car = w.spawnVehicle('sedan', mx + nx * 100, my + ny * 100, Math.atan2(ny, nx), {});
    car.lz = 1; car.vx = nx * speed; car.vy = ny * speed;
    seat(w, p, car);
    let seq = p.ack || 0;
    for (let i = 0; i < 40; i++) { p.inputQ.push({ seq: ++seq, bits: 0, mx: nx, my: ny, aim: 0 }); w.step(); }
    return car;
  };
  const slow = ram(160);
  assert.ok(slow.lz > 0.9, 'a gentle bump: still up on the deck');
  assert.ok(Math.hypot(slow.x - mx, slow.y - my) < sg.hw, 'held inside the barrier');
  p.ped.vehId = 0; w.remove(slow);
  const told = [];
  const bc = w.broadcast.bind(w);
  w.broadcast = (ev) => { told.push(ev); return bc(ev); };
  const fast = ram(BARRIER_BREAK_SPEED + 260);
  assert.ok(w.brokenBarriers.size >= 1, 'the barrier gave way');
  assert.ok(told.some((ev) => ev.e === 'barrier' && ev.k.length), 'everyone hears about it');
  assert.ok(fast.lz < 0.05, 'over the edge and down on the street');
  assert.ok(Math.hypot(fast.x - mx, fast.y - my) > sg.hw, 'outside the deck');
  // the gap stays open for the next car through
  const key = [...w.brokenBarriers.keys()][0];
  assert.ok(m.levels.broken.has(key));
});

test('roads hang together: no stray dead ends, one-ways never trap you', () => {
  const w = makeWorld();
  const m = w.map;
  const stray = m.nodes.filter((n) => n.lvl === 0 && n.edges.length === 1 && !n.culdesac).map((n) => m.edges[n.edges[0]]).filter((e) => !['rural', 'dirt'].includes(e.kind) && !e.culdesac);
  assert.deepEqual(stray.map((e) => `${e.kind} ${e.name}`), [], 'roads that just stop');
  // strongly connected: from any junction you can drive to any other (boat-only islands apart)
  const N = m.nodes.length;
  const reach = (start, rev) => { const seen = new Uint8Array(N); const st = [start]; seen[start] = 1; while (st.length) { const u = st.pop(); const nb = rev ? m.nodes.filter((q) => Object.values(q.links).includes(u)).map((q) => q.id) : Object.values(m.nodes[u].links); for (const v of nb) if (!seen[v]) { seen[v] = 1; st.push(v); } } return seen; };
  const start = m.nodes.findIndex((n) => n.lvl === 0 && Math.hypot(n.x - 800 * 32, n.y - 520 * 32) < 40 * 32);
  const f = reach(start, false), b = reach(start, true);
  const islandOf = (n) => m.islandAt(n.x, n.y);
  const cut = m.nodes.filter((n) => !(f[n.id] && b[n.id]) && !['G', 'C'].includes(islandOf(n)));
  assert.deepEqual(cut.map((n) => `${Math.round(n.x / 32)},${Math.round(n.y / 32)}`), [], 'junctions you can\'t drive to and back from');
  // the hierarchy: a highway only ever meets arterials, county roads and ramps
  for (const n of m.nodes) {
    const kinds = n.edges.map((id) => m.edges[id].kind);
    if (!kinds.includes('hwy') || n.lvl !== 0) continue;
    for (const k of kinds) assert.ok(['hwy', 'ave', 'blvd', 'art', 'rural', 'front', 'ramp'].includes(k), `a ${k} joins a highway at ${Math.round(n.x / 32)},${Math.round(n.y / 32)}`);
  }
  for (const e of m.edges) if (e.kind === 'dirt') for (const id of [e.a, e.b]) for (const o of m.nodes[id].edges) assert.ok(ROAD_RANK[m.edges[o].kind] <= 4, `a dirt track runs straight into a ${m.edges[o].kind}`);
});

test('intersections: zebra crossings never overlap; span wires only at small walled crossings, mast arms span every lane elsewhere', async () => {
  const { zebraCrossings } = await import('../shared/roads.js');
  const w = makeWorld();
  const m = w.map;
  const xs = [...zebraCrossings(m).values()];
  assert.ok(xs.length > 800, `crossings (${xs.length})`);
  // no two crossings' stripe boxes touch
  const box = (c) => { const ux = Math.cos(c.a), uy = Math.sin(c.a); return [[c.hl, c.hw], [c.hl, -c.hw], [-c.hl, -c.hw], [-c.hl, c.hw]].map(([a, b]) => ({ x: c.x + ux * a - uy * b, y: c.y + uy * a + ux * b })); };
  const sep = (A, B) => { for (const P of [A, B]) for (let i = 0; i < 4; i++) { const p = P[i], q = P[(i + 1) % 4]; const nx = q.y - p.y, ny = p.x - q.x; const pa = A.map((v) => v.x * nx + v.y * ny), pb = B.map((v) => v.x * nx + v.y * ny); if (Math.max(...pa) < Math.min(...pb) || Math.max(...pb) < Math.min(...pa)) return true; } return false; };
  for (let i = 0; i < xs.length; i++) for (let j = i + 1; j < xs.length; j++) {
    if (Math.hypot(xs[i].x - xs[j].x, xs[i].y - xs[j].y) > 400) continue;
    assert.ok(sep(box(xs[i]), box(xs[j])), `crossings overlap near ${Math.round(xs[i].x)},${Math.round(xs[i].y)}`);
  }
  // every signalled ground junction has its lights one way or the other
  const lit = m.nodes.filter((n) => n.light && n.lvl === 0);
  const covered = new Set(m.signals.map((s) => s.node));
  assert.ok(lit.every((n) => covered.has(n.id)), 'every signalled junction has lights');
  const wires = m.signals.filter((s) => s.wire), poles = m.signals.filter((s) => !s.wire);
  // (World v2's Metro City has real-sized blocks: few side streets meet each other, most meet an avenue)
  assert.ok(wires.length >= 6 && poles.length > 100, `span wires ${wires.length}, poles ${poles.length}`);
  const small = new Set(['st', 'minor', 'drive', 'front']);
  for (const s of wires) {
    assert.ok(s.corners.length >= 2 && s.corners.every((c) => c.wall), 'span wires are tied to building walls');
    assert.ok(m.nodes[s.node].edges.every((id) => small.has(m.edges[id].kind)), 'span wires only over side streets');
  }
  // on a wide road the arm reaches across every incoming lane, a head over each
  for (const s of poles) assert.equal(s.hs.length, Math.min(5, Math.max(1, m.edges[s.edge].nl)));
  assert.ok(poles.some((s) => m.edges[s.edge].kind === 'hwy' && s.hs.length >= 2), 'highway junctions get full-width mast arms');
  // a pole is solid and breakable: ram it and it goes over
  const props = await import('../server/systems/props.js');
  const sg = poles.find((s) => { const e = m.propSolid.get(s.pi); return e && e.brk; });
  const pole = m.props[sg.pi];
  assert.equal(pole.t, 'sigpole');
  const v = w.spawnVehicle('sedan', pole.x - 70, pole.y, 0, { npcOwned: false });
  v.vx = 420; v.vy = 0;
  for (let k = 0; k < 24 && !(w.brokenProps && w.brokenProps.has(sg.pi)); k++) { v.input = { throttle: 1, steer: 0, hb: false }; w.step(); v.y = pole.y; v.a = 0; v.vy = 0; }
  assert.ok(w.brokenProps.has(sg.pi), 'signal pole knocked over');
  assert.ok(props.brokenList(w).includes(sg.pi));
});

test('no building stands on a road: nothing a road runs through (houses, farms, the mansion, hangars)', () => {
  // (the 2026-10-08 report: a whole house in the street round Dry Creek and the farms - the houses and set pieces laid
  // out at fixed spots for the first world, and World v2's roads ran through ten of them: the Desert Highway through the
  // Dry Creek Farm Co-op. map.js offTheRoad moves a crossed piece to open ground nearby.)
  const m = makeWorld().map;
  const bad = [];
  for (const b of m.buildings) {
    if (b.gone) continue;
    const X0 = b.tx * 32 + 8, Y0 = b.ty * 32 + 8, X1 = (b.tx + b.tw) * 32 - 8, Y1 = (b.ty + b.th) * 32 - 8;
    for (const e of m.edges) {
      if (e.lvl !== 0) continue;
      let hit = false;
      for (let i = 1; i < e.pts.length && !hit; i++) {
        const a = e.pts[i - 1], c = e.pts[i], n = Math.max(1, Math.ceil(Math.hypot(c.x - a.x, c.y - a.y) / 8));
        for (let k = 0; k <= n && !hit; k++) { const x = a.x + ((c.x - a.x) * k) / n, y = a.y + ((c.y - a.y) * k) / n; hit = x > X0 && x < X1 && y > Y0 && y < Y1; }
      }
      if (hit) { bad.push(`${b.name} (${b.kind}) at ${b.tx},${b.ty}: ${e.name || e.kind}`); break; }
    }
  }
  assert.deepEqual(bad, [], bad.join('; '));
  // and the farm co-op and the mansion still stand, with their places on the map
  assert.ok(m.pois.some((p) => p.kind === 'farm' && p.label === 'Dry Creek Farm Co-op'), 'the co-op');
  assert.ok((m.mansions || []).length >= 1, 'the mansion');
});
