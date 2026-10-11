// World v3, stage 3, step 1 (docs/WORLD-V3.md 8.7): the skeleton's highways and arterials laid in the whole-world build
// (shared/world3-roads.js, called from shared/world3-world.js). One build (about 70 s here: today's world, the land,
// then the world). The live world is test/world3.test.js's (its hash doesn't change).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateCity } from '../shared/map.js';
import '../shared/world3-islands.js';
import { TILE, T } from '../shared/constants.js';
import { FRAME_W, FRAME_H } from '../shared/world3.js';
import { HIGHWAYS, ARTERIALS, INTERCHANGES, CLOSURES, RADIUS, linePath, pointAt, nearestOnPath } from '../shared/world3-skeleton.js';
import { prepare } from '../tools/world3-build.mjs';

test('World v3: the skeleton\'s roads - on the ground, the deck, a bridge or a tunnel; one network; the interchanges join; the closures closed', { timeout: 300000 }, () => {
  const prep = prepare();
  const m = generateCity(1337, { world3: true, frame: { w: FRAME_W, h: FRAME_H }, land: prep.land, today: prep.today });
  const R = m.world3.roads, W = m.w, H = m.h;
  const tileOk = (i) => m.tiles[i] === T.ROAD || m.tiles[i] === T.BRIDGE || m.deck[i] || m.cover[i];
  const onRoad = (x, y) => {
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const tx = Math.floor(Math.max(0.5, Math.min(W - 0.5, x)) + dx), ty = Math.floor(Math.max(0.5, Math.min(H - 0.5, y)) + dy);
      if (m.inside(tx, ty) && tileOk(m.idx(tx, ty))) return true;
    }
    return false;
  };
  // (an arterial stops short of a highway's bore it would cross at its end: Kestrel Road)
  const bores = [];
  for (const H0 of HIGHWAYS) { const P = linePath(H0, RADIUS.hwy); for (const [i, j] of H0.tunnels || []) bores.push({ P, a: P.at[i], b: P.at[j] }); }
  const byBore = (x, y) => bores.some((B) => { const q = nearestOnPath(B.P, x, y); return q.d < 30 && q.s >= B.a - 8 && q.s <= B.b + 8; });

  // (the airport's own pass builds its terminal and apron over the end of Airport Road and Runway Road: district 27)
  const airport = (x, y) => { const tx = Math.floor(x), ty = Math.floor(y); return m.inside(tx, ty) && prep.land.layers.dist[m.idx(tx, ty)] === 27; };
  // 1. every point of a laid highway (what isn't the places' own: R.highways' kept stretches) and of every arterial is
  //    on a road tile, a bridge, the deck or a tunnel's bore
  let pts = 0;
  const miss = [];
  for (const H0 of HIGHWAYS) {
    const P = linePath(H0, RADIUS.hwy), r = R.highways.find((h) => h.name === H0.name);
    assert.ok(r, `${H0.name} laid`);
    for (const [a, b] of r.kept) for (let s = a; s <= b; s += 4) { const [x, y] = pointAt(P, s); pts++; if (!onRoad(x, y)) miss.push(`${H0.name} at ${Math.round(x)}, ${Math.round(y)}`); }
  }
  for (const A of ARTERIALS) {
    if (/^Canal /.test(A.name)) continue;
    const P = linePath(A, RADIUS.art);
    for (let s = 0; s <= P.length; s += 4) { const [x, y] = pointAt(P, s); if (byBore(x, y) || airport(x, y)) continue; pts++; if (!onRoad(x, y)) miss.push(`${A.name} at ${Math.round(x)}, ${Math.round(y)}`); }
  }
  assert.ok(pts > 10000, `${pts} points checked`);
  assert.deepEqual(miss.slice(0, 10), [], `${miss.length} of ${pts} skeleton points off the road`);
  // every highway runs two lanes each way; the deck where it passes over an arterial in the country
  for (const e of m.edges) if (e.kind === 'hwy') assert.equal(e.nl, 2, `${e.name}: two lanes each way`);
  assert.ok(m.edges.some((e) => e.kind === 'hwy' && e.lvl === 1 && R.highways.some((h) => h.name === e.name)), 'a skeleton highway up on the deck');
  assert.ok(m.edges.some((e) => e.kind === 'hwy' && e.lvl === 'ramp'), 'its ramps');

  // 2. one network: every skeleton road's edges in the biggest piece of the graph; what's left over is islands only boats
  //    reach (no skeleton road within 150 tiles)
  const comp = new Int32Array(m.nodes.length).fill(-1), sizes = [];
  for (let s0 = 0; s0 < m.nodes.length; s0++) {
    if (comp[s0] >= 0) continue;
    const c = sizes.length, st = [s0];
    comp[s0] = c; let n = 0;
    while (st.length) { const u = st.pop(); n++; for (const id of m.nodes[u].edges) { const e = m.edges[id], v = e.a === u ? e.b : e.a; if (comp[v] < 0) { comp[v] = c; st.push(v); } } }
    sizes.push(n);
  }
  const main = sizes.indexOf(Math.max(...sizes));
  const names = new Set([...R.highways.map((h) => h.name), ...R.arterials.map((a) => a.name)]);
  const skel = m.edges.filter((e) => names.has(e.name));
  for (const e of skel) assert.equal(comp[e.a], main, `${e.name} (${Math.round(e.pts[0].x / TILE)}, ${Math.round(e.pts[0].y / TILE)}) in the one network`);
  for (let k = 0; k < m.nodes.length; k++) {
    if (comp[k] === main) continue;
    const n = m.nodes[k];
    const near = skel.some((e) => e.pts.some((p) => Math.hypot(p.x - n.x, p.y - n.y) < 150 * TILE));
    assert.ok(!near, `a road at ${Math.round(n.x / TILE)}, ${Math.round(n.y / TILE)} off the network, by a skeleton road`);
  }
  assert.ok(sizes[main] > 0.98 * m.nodes.length, `the network: ${sizes[main]} of ${m.nodes.length} junctions`);

  // 3. the interchanges join: the highways laid there meet at one junction (at grade within 40 tiles of it)
  for (const ic of INTERCHANGES) {
    const meet = HIGHWAYS.filter((H0) => {
      const P = linePath(H0, RADIUS.hwy), q = nearestOnPath(P, ic.at[0], ic.at[1]), r = R.highways.find((h) => h.name === H0.name);
      return q.d < 8 && r.kept.some(([a, b]) => q.s >= a - 2 && q.s <= b + 2);
    }).map((H0) => H0.name);
    if (meet.length < 2) continue;   // (the Metro Ring Interchange is Metro City's ring: the places' own)
    const node = m.nodes.find((n) => Math.hypot(n.x / TILE - ic.at[0], n.y / TILE - ic.at[1]) < 45 && new Set(n.edges.map((id) => m.edges[id]).filter((e) => e.kind === 'hwy').map((e) => e.name)).size >= 2);
    assert.ok(node, `${ic.name}: ${meet.join(', ')} meet at a junction`);
    assert.equal(comp[node.id], main, `${ic.name} on the network`);
  }

  // 4. no road over open water but on a bridge (or the deck, or the Harbor Tunnel's bore)
  let wet = 0;
  for (const e of m.edges) {
    if (e.lvl === 1) continue;
    for (let k = 0; k + 1 < e.pts.length; k++) {
      const a = e.pts[k], b = e.pts[k + 1], n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 32));
      for (let j = 0; j <= n; j++) {
        const tx = Math.floor((a.x + (b.x - a.x) * j / n) / TILE), ty = Math.floor((a.y + (b.y - a.y) * j / n) / TILE);
        if (!m.inside(tx, ty)) continue;
        const i = m.idx(tx, ty);
        if ((m.tiles[i] === T.WATER || m.tiles[i] === T.DEEP) && !m.deck[i] && !m.cover[i]) wet++;
      }
    }
  }
  assert.equal(wet, 0, `${wet} road points over open water off a bridge`);
  // the skeleton's bridges are bridges: the Gorge Bridge, the Long Reach Bridge, the Union Bridge, the West Sea Road's hops
  for (const [name, n] of [['Union Bridge', 100], ['Cedar North Bridge', 100], ['West Sea Road', 300], ['Toll Point Bridge', 100]]) {
    const tiles = new Set();
    for (const e of m.edges) if (e.name === name) for (let k = 0; k + 1 < e.pts.length; k++) { const a = e.pts[k], b = e.pts[k + 1], c = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 32); for (let j = 0; j <= c; j++) { const tx = Math.floor((a.x + (b.x - a.x) * j / c) / TILE), ty = Math.floor((a.y + (b.y - a.y) * j / c) / TILE); if (m.inside(tx, ty) && m.tiles[m.idx(tx, ty)] === T.BRIDGE) tiles.add(m.idx(tx, ty)); } }
    assert.ok(tiles.size >= n, `${name}: ${tiles.size} bridge tiles along it`);
  }
  // the lift bridges and footbridges are listed (the network has no lifting span or people-only kind yet: for the owner)
  assert.deepEqual(R.lifts.sort(), ['Northshore Lift Bridge', 'Port Bridge']);
  assert.deepEqual(R.foot.sort(), ['Harbor Footbridge', 'Pelican Walk', 'Southbank Walk']);

  // 5. the tunnels: the skeleton's (the highways', the Summit Road's, the Harbor Tunnel under the north channel) and the
  //    closures - each highway running off the frame ends in a tunnel whose mouth at the edge is closed (wall across)
  const tn = (name) => m.tunnels.filter((t) => m.edges[t.edge].name === name);
  for (const name of ['Granite Peaks Highway', 'North Highway', 'Summit Road', 'Harbor Tunnel']) assert.ok(tn(name).length, `${name} has its tunnel`);
  assert.ok(tn('Harbor Tunnel').reduce((s, t) => s + t.len, 0) > 300 * TILE, 'the Harbor Tunnel runs under the channel');
  for (const c of CLOSURES) {
    const x = Math.max(0.5, Math.min(W - 0.5, c.at[0])) * TILE, y = Math.max(0.5, Math.min(H - 0.5, c.at[1])) * TILE;
    const t = tn(c.line).find((q) => q.mouths.some((mo) => mo.closed && Math.hypot(mo.x - x, mo.y - y) < 6 * TILE));
    assert.ok(t, `${c.name}: a closed mouth at the frame's edge`);
    const mo = t.mouths.find((q) => q.closed);
    let wall = 0;
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) { const tx = Math.floor(mo.x / TILE - mo.ox * 0.5) + dx, ty = Math.floor(mo.y / TILE - mo.oy * 0.5) + dy; if (m.inside(tx, ty) && m.cover[m.idx(tx, ty)] && m.tiles[m.idx(tx, ty)] === T.WALL) wall++; }
    assert.ok(wall >= 4, `${c.name}: the barrier across the bore (${wall} wall tiles)`);
  }
});
