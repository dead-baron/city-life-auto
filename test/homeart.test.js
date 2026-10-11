// Inside your home, made to look like the game (H64): the cars parked in the garage are solid and the way in from the
// hall stays clear of them; every plan still walkable to everything in it with the garage full; the art v2 furniture
// (client/art2/props-home.js) builds for every piece and every price tier; the whole inside builds and lights in the
// game's 3/4 view (client/render/homeart2.js) for every kind of home, by day and by night - and none of it is in the
// page's start-up code or the chunk bake's.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { layout, PLAN_KEYS, TILE_IN, BODY_IN, blocked, carRects, stepInside, useAt } from '../shared/homelayout.js';
import { HOME_IN } from '../shared/rules.js';
import { MAKERS } from '../client/art2/props-home.js';
import { closure } from '../tools/perf.mjs';

// a fine walk over the plan (8 px steps) for a body, with nc cars parked: the spots it can reach from inside the door
function reach(L, nc) {
  const st = 8, seen = new Set(), out = [];
  const q = [[Math.round(L.spawn.x / st), Math.round(L.spawn.y / st)]];
  while (q.length) {
    const [i, j] = q.pop(), k = i + ',' + j;
    if (seen.has(k)) continue;
    seen.add(k);
    if (blocked(L, i * st, j * st, BODY_IN, nc)) continue;
    out.push([i * st, j * st]);
    q.push([i + 1, j], [i - 1, j], [i, j + 1], [i, j - 1]);
  }
  return out;
}

test('the garage: the parked cars are solid, the door from the hall and the key board clear of them, everything still in reach', () => {
  for (const k of PLAN_KEYS) for (const tier of [0, 1, 2, 3]) {
    const L = layout(k, tier), nc = L.bays.length;
    const spots = reach(L, nc), used = new Set();
    for (const [x, y] of spots) { const u = useAt(L, x, y, HOME_IN.reach); if (u) used.add(u.use); }
    for (const u of ['door', 'bed', 'wardrobe', 'safe', 'fridge', 'shower', 'hall']) assert.ok(used.has(u), `${k} tier ${tier}: can't reach the ${u} with the garage full`);
    if (!nc) continue;
    assert.ok(used.has('garage'), `${k} tier ${tier}: the key board out of reach with the garage full`);
    const cars = carRects(L, nc);
    // every car inside the garage, none on the doorway in from the hall or on another car
    for (const c of cars) {
      for (let y = c.y + 2; y < c.y + c.h - 2; y += 4) for (let x = c.x + 2; x < c.x + c.w - 2; x += 4) assert.equal(L.cell(Math.floor(x / TILE_IN), Math.floor(y / TILE_IN)), 'g', `${k}: a car off the garage floor at ${x},${y}`);
      assert.ok(blocked(L, c.x + c.w / 2, c.y + c.h / 2, BODY_IN, nc), `${k}: a car you can stand in`);
      assert.ok(!blocked(L, c.x + c.w / 2, c.y + c.h / 2, BODY_IN, 0) || L.solid(Math.floor((c.x + c.w / 2) / TILE_IN), Math.floor((c.y + c.h / 2) / TILE_IN)), `${k}: an empty bay's floor isn't free`);
    }
    for (let i = 1; i < cars.length; i++) assert.ok(cars[i].x >= cars[i - 1].x + cars[i - 1].w - 4, `${k}: the cars overlap`);
    // the doorway in from the hall: a body stands on it and just inside it with every car parked
    let door = null;
    for (let ty = 0; ty < L.rows && !door; ty++) for (let tx = 0; tx < L.cols; tx++) if (L.cell(tx, ty) === '+' && L.cell(tx + 1, ty) === 'g') { door = { x: (tx + 0.5) * TILE_IN, y: (ty + 0.5) * TILE_IN }; break; }
    assert.ok(door, `${k}: no door from the hall into the garage`);
    assert.ok(!blocked(L, door.x, door.y, BODY_IN, nc) && !blocked(L, door.x + TILE_IN, door.y, BODY_IN, nc), `${k}: the door from the hall blocked by a car`);
    // walking north into a car stops at its bumper
    const c = cars[0], s = { x: c.x + c.w / 2, y: c.y + c.h + BODY_IN + 6, a: 0, nc };
    if (!blocked(L, s.x, s.y, BODY_IN, nc)) {
      for (let i = 0; i < 40; i++) stepInside(L, s, 0, -1, 1 / 20, HOME_IN.walk);
      assert.ok(s.y >= c.y + c.h + BODY_IN - 0.5, `${k}: walked into a parked car (${s.y} < ${c.y + c.h + BODY_IN})`);
    }
  }
});

test('the art v2 furniture: every piece builds and draws, at every price tier', () => {
  for (const [ch, make] of Object.entries(MAKERS)) for (let tier = 0; tier < 4; tier++) {
    const w = ch === 'K' ? 96 : ch === 'B' || ch === 'T' ? 64 : 32, d = ch === 'B' || ch === 'T' ? 64 : 32;
    const G = make(w, d, tier, 1).render(0, { px: 2 });
    let n = 0; for (let i = 3; i < G.col.length; i += 4) if (G.col[i]) n++;
    assert.ok(n > 20, `${ch} tier ${tier}: nothing drawn`);
  }
});

test('the inside in the game\'s 3/4 view: every kind of home builds and lights by day and night; none of it in the page or the bake', async () => {
  const prev = globalThis.document;
  globalThis.document = { createElement: () => { const c = { width: 0, height: 0, px: null }; c.getContext = () => ({ createImageData: (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }), putImageData: (id) => { c.px = id; } }); return c; } };
  try {
    const { HomeArt } = await import('../client/render/homeart2.js');
    for (const k of PLAN_KEYS) for (const tier of [0, 3]) {
      const L = layout(k, tier), A = new HomeArt(L, 2);
      assert.ok(A.items.length > L.pieces.length, `${k}: the walls and the furniture`);
      for (const d of [1, 0]) {
        A.relight(d);
        const lit = (cv) => { let n = 0; const p = cv.px.data; for (let i = 3; i < p.length; i += 4) if (p[i]) n++; return n; };
        assert.ok(lit(A.floor.cv) > (L.w * L.h) / 16, `${k} ${d ? 'day' : 'night'}: the floor`);
        for (const it of A.items) assert.ok(lit(it.cv) > 0, `${k}: an empty sprite`);
        assert.ok(A.items.filter((it) => it.piece && it.piece.use).every((it) => it.ol), `${k}: a thing you use without its outline`);
      }
      if (L.bays.length) { const s = A.car({ m: 'sedan', p: 3, v: 0 }, 0); assert.ok(s && s.cv.px, `${k}: the car in the garage`); }
      const me = A.person({ s: 1, h: 2, hc: 3, t: 1, tc: 4 }, 'move1', 6, 2, L.spawn.x, L.spawn.y);
      assert.ok(me && me.cv.px.width > 10 && me.cv.px.height > 30, `${k}: you, at the street's size`);
    }
  } finally { globalThis.document = prev; }
  const page = closure(['client/boot.js', 'client/main.js']), bake = closure(['client/art2/game/worker.js'], { dynamic: true });
  for (const f of ['client/render/homeview.js', 'client/render/homeart2.js', 'client/art2/props-home.js']) {
    assert.ok(!page.includes(f), `${f} is in the page's start-up code`);
    assert.ok(!bake.includes(f), `${f} is in the chunk bake`);
  }
});
