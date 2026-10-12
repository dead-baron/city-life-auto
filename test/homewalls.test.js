// Inside your home with thin walls (H77; the owner's HO6 concept): the walls are lines along the middle of the plans'
// wall tiles (the outside walls' inner edge), so the server walks you right up to them - checked on a fine grid, with
// the garage full; the doorways are clear; you never get out through a wall; the concept's new pieces are in the plans.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { layout, PLAN_KEYS, TILE_IN, BODY_IN, WALL_IN, blocked, useAt, stepInside, carRects } from '../shared/homelayout.js';
import { canPlace } from '../shared/homedecor.js';
import { HOME_IN } from '../shared/rules.js';
import { MAKERS } from '../client/art2/props-home.js';

const T = TILE_IN, STEP = 4;
// every spot a body can stand on (a 4 px grid), flooded from the way in with the garage full
function walk(L, nc) {
  const W = Math.ceil(L.w / STEP), H = Math.ceil(L.h / STEP), seen = new Uint8Array(W * H), q = [];
  const sx = Math.round(L.spawn.x / STEP), sy = Math.round(L.spawn.y / STEP);
  assert.ok(!blocked(L, sx * STEP, sy * STEP, BODY_IN, nc), `${L.key}: the way in is blocked`);
  seen[sy * W + sx] = 1; q.push(sx, sy);
  while (q.length) {
    const y = q.pop(), x = q.pop();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H || seen[ny * W + nx] || blocked(L, nx * STEP, ny * STEP, BODY_IN, nc)) continue;
      seen[ny * W + nx] = 1; q.push(nx, ny);
    }
  }
  return { seen, W, H };
}

test('thin walls: every plan walkable to everything you use, with the garage full - and never out through a wall', () => {
  for (const k of PLAN_KEYS) for (const tier of [0, 1, 2, 3]) {
    const L = layout(k, tier), nc = L.bays.length, { seen, W, H } = walk(L, nc), reached = new Set();
    let minX = Infinity, maxX = -1, minY = Infinity, maxY = -1;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x += 2) {
      if (!seen[y * W + x]) continue;
      minX = Math.min(minX, x * STEP); maxX = Math.max(maxX, x * STEP); minY = Math.min(minY, y * STEP); maxY = Math.max(maxY, y * STEP);
      if (y % 2) continue;
      const u = useAt(L, x * STEP, y * STEP, HOME_IN.reach);
      if (u) reached.add(u.use === 'unit' ? 'unit' : u.use);
    }
    const want = /^lobby/.test(k) ? ['door', 'mail', 'unit'] : ['door', 'bed', 'wardrobe', 'safe', 'fridge', 'shower', 'hall'];
    if (k === 'house' || k === 'mansion') want.push('garage');
    for (const u of want) assert.ok(reached.has(u), `${k} tier ${tier}: can't reach the ${u}`);
    // inside the outside walls' lines, always
    assert.ok(minX - BODY_IN >= T - 0.01 && minY - BODY_IN >= T - 0.01 && maxX + BODY_IN <= L.w - T + 0.01 && maxY + BODY_IN <= L.h - T + 0.01, `${k} tier ${tier}: out through a wall (${minX},${minY} - ${maxX},${maxY})`);
    // the cars parked in the garage are solid
    for (const c of carRects(L, nc)) assert.ok(blocked(L, c.x + c.w / 2, c.y + c.h / 2, BODY_IN, nc), `${k}: a parked car walked through`);
  }
});

test('thin walls: a wall is a line - you stand right up to it, its line stops you, and every doorway lets you through', () => {
  const L = layout('house', 2);
  // the wall between the kitchen and the bathroom (tx 6): its line in the middle of the tile, the tile's sides open
  const x0 = 6 * T, y = 2.5 * T;
  assert.ok(blocked(L, x0 + T / 2, y), 'the line is solid');
  assert.ok(!blocked(L, x0 + (T - WALL_IN) / 2 - BODY_IN - 0.5, y), 'you stand right up to it from the kitchen');
  assert.ok(blocked(L, x0 + (T - WALL_IN) / 2 - BODY_IN + 1, y), 'but no closer');
  // walking into it stops you at the line
  const s = { x: 3.5 * T, y, a: 0, nc: 0 };
  for (let i = 0; i < 60; i++) stepInside(L, s, 1, 0, 1 / 20, HOME_IN.walk);
  assert.ok(Math.abs(s.x + BODY_IN - (x0 + (T - WALL_IN) / 2)) < 1.5, `stopped at the line (${s.x})`);
  // every doorway in every plan: you walk straight through it
  for (const k of PLAN_KEYS) {
    const P = layout(k, 3);
    for (let ty = 0; ty < P.rows; ty++) for (let tx = 0; tx < P.cols; tx++) {
      if (P.cell(tx, ty) !== '+') continue;
      const across = P.solid(tx - 1, ty) && P.solid(tx + 1, ty);   // (a doorway in a wall running east-west: walked through north-south)
      const cx = (tx + 0.5) * T, cy = (ty + 0.5) * T;
      assert.ok(!blocked(P, cx, cy), `${k}: the doorway at ${tx},${ty} is blocked`);
      for (const d of [-1, 1]) assert.ok(!blocked(P, cx + (across ? 0 : d * T * 0.75), cy + (across ? d * T * 0.75 : 0)), `${k}: no way through the doorway at ${tx},${ty}`);
    }
  }
});

test('the HO6 concept\'s rooms: the mansion\'s cinema, games room, island, sectional, bath and three-car garage; the decor rules still hold', () => {
  const M = layout('mansion', 3), has = (ch) => M.pieces.filter((p) => p.ch === ch).length;
  assert.ok(has('x') === 1 && has('j') === 2 && has('i') === 1 && has('n') === 1 && has('s') === 1 && has('h') === 1, 'the pool table, two arcade cabinets, the seats, the island, the sectional, the bath');
  assert.equal(M.bays.length, 3, 'a three-car garage');
  assert.ok(has('b') === 2, 'bedside lamps either side of the bed');
  for (const ch of 'xjinsh') for (const tier of [0, 3]) {
    const G = MAKERS[ch](ch === 'i' ? 128 : ch === 'j' ? 32 : ch === 'h' ? 64 : 96, ch === 'j' || ch === 'h' ? 32 : 64, tier, 1).render(0, { px: 2 });
    let n = 0; for (let i = 3; i < G.col.length; i += 4) if (G.col[i]) n++;
    assert.ok(n > 40, `${ch}: nothing drawn`);
  }
  // the decor rules on the thin walls: still not in a wall tile, still not cutting anything off
  const none = { it: [] };
  assert.match(canPlace(M, none, { k: 'lamp', tx: 0, ty: 3, r: 0 }), /wall/);
  assert.match(canPlace(M, none, { k: 'lamp', tx: 16, ty: 7, r: 0 }), /doorway/);
  assert.equal(canPlace(M, none, { k: 'lamp', tx: 9, ty: 7, r: 0 }), null, 'a lamp in the great room');
});
