// Getting the art ready before it's seen, and the hitches that are left (the perf work of 2026-10-26: "make art load
// better and faster and improve performance on lower end mobile devices ... without changing the art"):
//  - the loading screen's wait after PLAY (client/warmup.js warmPlan): the view's chunks, then the ring round it, then in;
//    capped, so a slow phone still gets in; the fade after a jump (jumpPlan) the same way, shorter;
//  - what the renderer may do in a frame (client/art2/game/host.js): uploads past the first only within the tier's time,
//    a person made on the page only while what one takes fits, generated sprites within GEN_MS;
//  - what an 8 GB phone keeps (pool.js keepCap, engine.js slots), and the canvas's size (gfx.js renderDpr).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { warmPlan, jumpPlan, WARM_CAP_MS, JUMP_CAP_MS, RING_WAIT } from '../client/warmup.js';
import { World2, upBudget } from '../client/art2/game/host.js';
import { keepCap } from '../client/art2/game/pool.js';
import { pct } from '../client/perfhud.js';
import { closure } from '../tools/perf.mjs';
import { renderDpr } from '../client/gfx.js';

const W = (o = {}) => ({ ok: true, need: 9, have: 9, scr: 6, scrHave: 6, ring: 8, ringHave: 8, miss: 0, spr: 0, jump: -1, ...o });
const PIXEL = { userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7 Pro) AppleWebKit/537.36 Chrome/128.0 Mobile Safari/537.36', deviceMemory: 8 };

test('joining: the title waits for the view, then the ring round it (until half the cap), and never past the cap', () => {
  const cap = WARM_CAP_MS.phone;
  assert.ok(cap >= 8000 && cap <= 15000 && WARM_CAP_MS.other <= cap, 'a slow phone gets in within 8-15 s');
  assert.deepEqual(warmPlan(null, 100, cap).done, false, 'the renderer not up yet: wait');
  assert.equal(warmPlan(W({ ok: false }), 100, cap).done, false);
  assert.equal(warmPlan(null, cap, cap).why, 'cap', 'never past the cap');
  assert.equal(warmPlan(null, 0, cap, true).why, 'off', 'no renderer will come (it failed): straight in');
  const half = warmPlan(W({ have: 5, scrHave: 4 }), 1000, cap);
  assert.equal(half.done, false, 'chunks on screen still stand-ins');
  assert.ok(half.k > 0.1 && half.k < 0.9, `the bar part way: ${half.k}`);
  assert.equal(warmPlan(W({ miss: 2 }), 1000, cap).done, false, 'something on screen drawn with no sprite of its own yet');
  const ring = W({ ringHave: 3 });
  assert.equal(warmPlan(ring, 1000, cap).done, false, 'the view is ready, the ring round it isn\'t: wait a little');
  assert.equal(warmPlan(ring, 1000, cap).why, 'ring');
  assert.equal(warmPlan(ring, cap * RING_WAIT + 1, cap).done, true, '...but not past half the cap');
  assert.equal(warmPlan(ring, cap * RING_WAIT + 1, cap).why, 'view');
  const all = warmPlan(W(), 900, cap);
  assert.deepEqual([all.done, all.why, all.k], [true, 'ready', 1]);
  // the bar only goes forward as the chunks come
  let prev = 0;
  for (let h = 0; h <= 9; h++) { const p = warmPlan(W({ have: h, scrHave: Math.min(6, h), ringHave: 0 }), 500, cap); assert.ok(p.k >= prev); prev = p.k; }
});

test('a jump (teleport, respawn): the fade only while what is on screen is not drawn, and never past its cap', () => {
  const now = performance.now();
  assert.equal(jumpPlan(null, 5000).veil, false);
  assert.equal(jumpPlan({ t0: now, frames: 3, drawn: 120 }, 5000).veil, false, 'drawn already');
  assert.equal(jumpPlan({ t0: now, frames: 0, drawn: 0 }, 5000).veil, false, 'not a frame since');
  assert.equal(jumpPlan({ t0: now - 100, frames: 2, drawn: 0 }, 5000).veil, true);
  assert.equal(jumpPlan({ t0: now - 6000, frames: 90, drawn: 0 }, 5000).veil, false, 'past the cap: the stand-ins show');
  assert.equal(jumpPlan({ t0: now - 100, frames: 2, drawn: 0, over: true }, 5000).veil, false);
  assert.ok(JUMP_CAP_MS.phone <= 6000 && JUMP_CAP_MS.other <= JUMP_CAP_MS.phone);
});

test('uploads: the first a frame always goes, the rest only while the tier\'s time lasts', () => {
  assert.equal(upBudget(0, 50, 4, true), true, 'the first, whatever it costs (the view never waits longer than before)');
  assert.equal(upBudget(3, 0.5, 4, false), true);
  assert.equal(upBudget(3, 2, 4, false), false, 'a second chunk past the frame\'s time waits for the next frame');
  // _chunks: of three landed bakes the view wants, how many go up in a frame on Medium with a slow phone's uploads
  const up = [], E = {
    hasChunk: () => false, hasFallback: () => true, setChunkFallback() {}, reserveChunks() {}, keepChunk() {}, chunkCap: () => 26, chunkKeys: () => [],
    uploadChunk(cx, cy) { up.push([cx, cy]); const t = performance.now(); while (performance.now() - t < 3) { /* a 3 ms upload */ } return true; }, ap: 2,
  };
  const w = Object.create(World2.prototype);
  Object.assign(w, {
    E, pool: { ready: true, dead: false, has: () => true, cancelWhere() {}, request() {} }, S: { cam: { tz: 1 } }, map: { seed: 1, frame: { w: 1312, h: 1200 } }, grid: [55, 50], q: 1,
    tier: { results: 8, chunkUp: 4, chunks: 20, upMs: 4 }, W: 412, H: 892, prov: { ground: true, statics: true }, artKey: null, lowMem: false, noBake: true, failed: false,
    results: new Map(), wantJobs: new Set(), wantChunks: new Map(), chunkState: new Map(), ver: new Map(), chunkFails: new Map(), fallbacks: new Set(), phs: new Map(),
    n: { fbSet: 0, chunkUp: 0 }, t: {}, est: { chunk: 3, spr: 0.3, ped: 4 },
  });
  w._camVel = () => ({ x: 0, y: 0 }); w._placeholder = () => ({}); w._openSea = () => false; w._offSea = () => 0;
  const at = (x, y) => { w.camX = x; w.camY = y; w.vx0 = x - 271; w.vx1 = x + 271; w.vy0 = y - 587; w.vy1 = y + 587; };
  at(6500, 6500);
  const land = () => { for (const [cx, cy] of [[8, 8], [8, 7], [8, 9]]) { const jk = `c${cx},${cy},-1,0`; w.results.set(jk, { jk, key: cy * 1000 + cx, cx, cy, mode: -1, r: { g: {} }, prio: 1, ver: 0 }); } };
  // (noBake: the results are what landed; nothing new is asked for, and none are dropped as unwanted)
  w.noBake = false; w.pool.has = () => true;
  const frame = (warming) => { w.warming = warming; w.upMax = warming ? 40 : w.tier.upMs; w.upSpent = 0; w.upFirst = true; w._chunks({ z: 0.76, now: 0, dt: 0.016 }); };
  land(); w.wantJobs.clear();
  for (const jk of w.results.keys()) w.wantJobs.add(jk);
  w.pool.cancelWhere = () => {};
  frame(false);
  assert.equal(up.length, 1, `one up in a frame while playing (3 ms each, 4 ms a frame): ${up.length}`);
  frame(false);
  assert.equal(up.length, 2);
  up.length = 0; w.results.clear(); land(); w.est.chunk = 3;
  frame(true);
  assert.equal(up.length, 3, 'behind the loading screen: as many as landed');
});

test('a person is made on the page only while what one takes fits the frame (yours within OWN_MS, or always when you have none)', () => {
  const made = [];
  const w = Object.create(World2.prototype);
  Object.assign(w, {
    Pd: { pedSprite: () => { made.push(1); return { w: 4, h: 4 }; } }, est: { ped: 20, chunk: 3, spr: 0.3 }, syncLeft: 3.5, sprPrio: -1, meNone: false,
    t: { syncMs: 0 }, n: { sync: 0, sprUp: 0 }, badKeys: new Set(), pool: null,
  });
  w._upload = () => true;
  assert.equal(w._now('a', []), false, 'someone else, 20 ms a person on this phone, 3.5 ms left: asked of the workers');
  w.est.ped = 2;
  assert.equal(w._now('b', []), true, '2 ms fits');
  w.sprPrio = -3; w.est.ped = 20; w.syncLeft = 3.5;
  assert.equal(w._now('c', []), false, 'yours, 20 ms: from the workers first in line, the last frame shown meanwhile');
  w.meNone = true;
  assert.equal(w._now('d', []), true, 'yours with nothing to show yet: made now');
  w.meNone = false; w.est.ped = 6;
  assert.equal(w._now('e', []), true, 'yours within OWN_MS');
});

test('an 8 GB phone keeps more baked chunks; the canvas never asks for more pixels than the screen has', async () => {
  assert.equal(keepCap(false, PIXEL), 160);
  assert.equal(keepCap(false, { ...PIXEL, deviceMemory: 4 }), 90);
  assert.equal(keepCap(false, { userAgent: 'Mozilla/5.0 (X11; Linux x86_64) Chrome/130', deviceMemory: 8 }), 180);
  assert.equal(keepCap(true, PIXEL), 40);
  const { Art2Engine } = await import('../client/art2/game/engine.js');
  const cap = (q, more, lowMem = false) => Art2Engine.prototype._chunksCap.call({ q, more, lowMem, chunkMin: 0 });
  assert.equal(cap(1, 6), 26, 'Medium on an 8 GB device: six more slots');
  assert.equal(cap(3, 6), 32, 'never past 32');
  assert.equal(cap(1, 6, true), 10);
  // gfx.js renderDpr (main.js onResize), the Pixel 7 Pro upright at each setting's sharpness
  assert.equal(renderDpr(3.5, 412, 892, 1), 1, 'Medium: 412 x 892');
  assert.equal(renderDpr(3.5, 412, 892, 1.5), 1.5);
  assert.equal(renderDpr(3.5, 412, 892, 2), 2);
  assert.ok(renderDpr(3.5, 412, 892, 9) < 2.7, 'the 2.5 MP cap');
  assert.equal(renderDpr(1, 1920, 1080, 2), 1, 'never past the screen');
  assert.equal(renderDpr(2, 1920, 1080, 2, true), 1, 'a console: 1 at most');
});

test('the readout and the loading screen\'s code stay out of the renderer; the readout loads with the debug menu', () => {
  const page = new Set(closure(['client/boot.js', 'client/main.js']));
  assert.ok(!page.has('client/perfhud.js'), 'the readout loads when it is switched on');
  assert.ok(page.has('client/warmup.js'));
  const r = closure(['client/art2/game/host.js']);
  assert.ok(!r.includes('client/art2/game/hostextra.js') && !r.includes('client/perfhud.js'));
  const menu = readFileSync(new URL('../client/devmenu.js', import.meta.url), 'utf8');
  assert.match(menu, /c === '@perf'\) import\('\.\/perfhud\.js'\)/);
  assert.equal(pct(new Float32Array([5, 1, 3, 2, 4]), 5, 0.5), 3);
});
