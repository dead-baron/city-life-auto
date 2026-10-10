// Traffic signals' heads hang from something (task #431, the owner: "let's remove the ones that hang in the middle of
// the intersection ... Maybe just straight across the street they hang from a wire but still attach to poles, not just
// a traffic light hanging in the middle of the intersection not attached to anything"). Every head is on a mast arm
// standing on its pole, or on a wire strung straight across its street between two poles (shared/map.js spanSignal),
// out over the lanes it stops - and shows those lanes' colour, the one the traffic logic gives them.
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateCity } from '../shared/map.js';
import { T } from '../shared/constants.js';
import { signalFor } from '../shared/signals.js';
import { signalLenses } from '../client/art2/game/chunkbake.js';
import { staticIndex, staticItems, makeStatic, STATIC_CHUNK } from '../client/art2/game/statics.js';

const M = generateCity(1337);
const POLE_GROUND = new Set([T.SIDEWALK, T.PLAZA, T.GRASS, T.LOT, T.DIRT, T.SAND]);
const segDist = (px, py, ax, ay, bx, by) => { const ex = bx - ax, ey = by - ay, t = Math.max(0, Math.min(1, ((px - ax) * ex + (py - ay) * ey) / (ex * ex + ey * ey || 1))); return Math.hypot(px - ax - ex * t, py - ay - ey * t); };
// the middles of an approach's incoming lanes, to the right of its centre line (as map.js lays them out)
const lanes = (e) => { const inner = e.oneway ? -e.hw : e.median / 2, n = Math.max(1, e.nl), lw = (e.hw - inner) / n; return Array.from({ length: Math.min(n, 5) }, (_, i) => inner + lw * (n <= 5 ? i + 0.5 : (i + 0.5) * (n / 5))); };
const ins = (n) => n.edges.filter((id) => !(M.edges[id].oneway && M.edges[id].b !== n.id));
const poleAt = (x, y) => M.props.findIndex((p) => p.t === 'sigpole' && Math.round(p.x) === x && Math.round(p.y) === y);

test('signals: every head hangs from a mast arm on its pole or a wire between two poles across its street, out at the stop line', () => {
  let arms = 0, spans = 0, heads = 0;
  for (const sg of M.signals) {
    const n = M.nodes[sg.node];
    // (out from the middle along the approach: past the junction box, where the traffic stops)
    const out = (x, y, id) => { const a = n.dirs[id]; return (x - n.x) * Math.cos(a) + (y - n.y) * Math.sin(a); };
    if (!sg.wire) {
      arms++;
      const p = M.props[sg.pi];
      assert.ok(p && p.t === 'sigpole' && Math.round(p.x) === Math.round(sg.x) && Math.round(p.y) === Math.round(sg.y), `the mast arm at ${Math.round(sg.x)},${Math.round(sg.y)} stands on its pole`);
      for (const [x, y] of sg.hs) {
        heads++;
        assert.ok(segDist(x, y, sg.x, sg.y, sg.hx, sg.hy) < 1.5, 'a head on the arm');
        assert.ok(out(x, y, sg.edge) >= (n.trim[sg.edge] || 0), 'out at the stop line');
      }
      continue;
    }
    spans++;
    assert.ok(sg.poles.length >= 3 && sg.wires.length >= 2, 'poles and wires');
    for (const [x, y] of sg.poles) {
      const i = poleAt(x, y);
      assert.ok(i >= 0 && M.props[i].span, `a span pole stands at ${x},${y}`);
      assert.ok(POLE_GROUND.has(M.tileAtPx(x, y)), 'on the pavement');
      assert.ok(M.propSolid.get(i) && M.propSolid.get(i).brk, 'solid street furniture that can be knocked over');
    }
    for (const h of sg.heads) {
      heads++;
      const [a, b] = sg.wires[h.w], A = sg.poles[a], B = sg.poles[b], e = M.edges[h.edge], ang = n.dirs[h.edge], rx = Math.sin(ang), ry = -Math.cos(ang);
      assert.ok(a !== b && segDist(h.x, h.y, A[0], A[1], B[0], B[1]) < 1.5, `the head at ${h.x},${h.y} hangs on its wire`);
      // the wire is strung across its street: a pole beyond the kerb on its right, one beyond the kerb on its left
      const la = (A[0] - n.x) * rx + (A[1] - n.y) * ry, lb = (B[0] - n.x) * rx + (B[1] - n.y) * ry;
      assert.ok(la > e.hw && lb < -e.hw, `the wire over edge ${h.edge} runs from a pole beyond one kerb to one beyond the other (${la.toFixed(0)}, ${lb.toFixed(0)}; kerbs at ${e.hw})`);
      // (within a few px of it: a corner pole between a street and a narrower one stands a little nearer the middle)
      assert.ok(out(h.x, h.y, h.edge) >= (n.trim[h.edge] || 0) - 8, `out at the stop line, not in the middle of the junction (${out(h.x, h.y, h.edge).toFixed(0)} px out, the stop line at ${n.trim[h.edge]})`);
      // over one of the lanes coming in, its lenses to that traffic
      const lat = (h.x - n.x) * rx + (h.y - n.y) * ry;
      assert.ok(lanes(e).some((o) => Math.abs(o - lat) < 2), 'over an incoming lane');
      assert.ok(Math.abs(h.a - ang) < 0.01, 'facing the traffic coming in');
    }
  }
  assert.ok(spans >= 6 && arms > 1000 && heads > 1500, `span wires ${spans}, mast arms ${arms}, heads ${heads}`);
});

test('signals: every way into a signalled junction has a head over each of its lanes', () => {
  for (const n of M.nodes) {
    if (!n.light || n.lvl !== 0) continue;
    const sg = M.signals.filter((s) => s.node === n.id);
    assert.ok(sg.length, `junction ${n.id} has its lights`);
    for (const id of ins(n)) {
      const k = sg.reduce((s, q) => s + (q.wire ? q.heads.filter((h) => h.edge === id).length : q.edge === id ? q.hs.length : 0), 0);
      assert.equal(k, lanes(M.edges[id]).length, `junction ${n.id}, the way in on edge ${id}: a head over each lane`);
    }
  }
});

test('art v2: span wires drawn pole top to pole top, the heads hanging under them and lit as their lanes\' signal says', () => {
  const I = staticIndex(M), items = new Set();
  for (const l of I.cells.values()) for (const it of l) if (it.recipe && it.recipe.t === 'span') items.add(it);
  assert.ok(items.size >= 6, `span items (${items.size})`);
  for (const it of items) {
    const sg = M.signals.find((s) => s.wire && s.node === it.heads[0].node), n = M.nodes[sg.node];
    assert.equal(it.recipe.wires.length, sg.wires.length);
    it.recipe.wires.forEach((w, k) => {
      // both ends are poles standing there (their props: what knocks the wire down)
      for (const [x, y, pi] of [[w[0], w[1], it.wp[k][0]], [w[2], w[3], it.wp[k][1]]]) { const p = M.props[pi]; assert.ok(p && p.t === 'sigpole' && p.span && Math.round(p.x) === it.x + x && Math.round(p.y) === it.y + y, 'a wire ends on a span pole'); }
    });
    it.heads.forEach((h, j) => {
      const [dx, dy, a, w] = it.recipe.heads[j], W = it.recipe.wires[w];
      assert.ok(segDist(dx, dy, W[0], W[1], W[2], W[3]) < 1.5, 'drawn under its wire');
      assert.deepEqual([h.pi, h.pi2], it.wp[w], 'held up by its wire\'s poles');
      // the lit lens: the junction's phase for the lanes it hangs over, on its face toward that traffic
      const L = signalLenses(it, h), o = n.dirs[h.edge];
      assert.ok(L.nx * Math.cos(o) + L.ny * Math.sin(o) > 0.98, 'lenses facing the traffic it stops');
      assert.ok(L.L[0][2] > L.L[1][2] && L.L[1][2] > L.L[2][2], 'red over amber over green');
      assert.equal(L.pi, h.pi); assert.equal(L.pi2, h.pi2);
      // (the host lights the lens signalFor(n, edge): the call the traffic makes for cars coming in on that edge)
      assert.equal(L.edge, sg.heads[j].edge);
      assert.ok(Math.abs(a - o) < 0.2 || Math.abs(Math.abs(a - o) - Math.PI * 2) < 0.2, 'drawn facing it too');
    });
    // a two-phase junction: the heads over the ways in across each other are never green together
    if (n.phases === 2) for (let t = 0; t < 24; t += 0.25) {
      const g = it.heads.filter((h) => signalFor(n, h.edge, t) !== 'R').map((h) => n.group[h.edge]);
      assert.ok(new Set(g).size <= 1, `junction ${n.id} at ${t} s: one way across at a time`);
    }
  }
  // the picture: each wire a solid line at the poles' height, and under every head's hanger, the head - no gap
  const it = [...items].find((q) => q.recipe.wires.length === 4) || [...items][0], G = makeStatic(it.recipe);
  for (const W of it.recipe.wires) {
    let on = 0, n = 0;
    for (let t = 0.1; t <= 0.9; t += 0.02, n++) {
      const X = Math.round(G.ax + W[0] + (W[2] - W[0]) * t), Y = W[1] + (W[3] - W[1]) * t, Z = 84 - 12 * t * (1 - t);
      let hit = false;
      for (let dy = -2; dy <= 2 && !hit; dy++) { const py = Math.round(G.ay + Y - Z) + dy, i = py * G.w + X; hit = G.col[i * 4 + 3] > 0 && G.z[i] >= 78; }
      if (hit) on++;
    }
    assert.ok(on === n, `the wire is drawn all the way across (${on}/${n})`);
  }
  for (const [dx, dy] of it.recipe.heads) {
    const X = G.ax + dx, top = Math.round(G.ay + dy - 84) - 1;
    let gap = 0, body = 0;
    for (let py = top; py < top + 40; py++) { const i = py * G.w + X; if (G.col[i * 4 + 3] || G.col[(i - 1) * 4 + 3] || G.col[(i + 1) * 4 + 3]) body++; else if (body) gap++; if (body > 24) break; }
    assert.ok(body > 24 && gap === 0, `a head hangs from its wire with nothing between (${body} px, ${gap} missing)`);
  }
});

test('art v2: a span pole knocked over takes its wires and their heads down; the others stay up', () => {
  const I = staticIndex(M);
  const it = [...new Set([...I.cells.values()].flat())].find((q) => q.recipe && q.recipe.t === 'span' && q.recipe.wires.length === 4);
  assert.ok(it, 'a crossing with four wires');
  const pi = it.wp[0][0], cx = Math.floor(it.x / STATIC_CHUNK), cy = Math.floor(it.y / STATIC_CHUNK);
  const find = () => staticItems(M, cx, cy).find((q) => q.key.startsWith(it.key));
  try {
    M.props[pi].broken = { a: 0.5 };
    const b = find(), gone = it.wp.filter(([a, c]) => a === pi || c === pi).length;
    assert.ok(b && b.key !== it.key, 'drawn again without them');
    assert.equal(b.recipe.wires.length, 4 - gone, `the ${gone} wires on that pole are down`);
    assert.ok(b.heads.every((h) => h.pi !== pi && h.pi2 !== pi) && b.heads.length === b.recipe.heads.length && b.heads.length < it.heads.length, 'their heads with them');
    for (const [dx, dy, , w] of b.recipe.heads) { const W = b.recipe.wires[w]; assert.ok(segDist(dx, dy, W[0], W[1], W[2], W[3]) < 1.5, 'the rest still under their wires'); }
    assert.ok(makeStatic(b.recipe).w > 0);
  } finally { delete M.props[pi].broken; }
  assert.equal(find().key, it.key, 'put back: as it was');
});
