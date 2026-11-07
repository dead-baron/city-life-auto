// The art while flying (the owner, 2026-11-06, his Pixel 7 Pro over the desert in a helicopter: the ground stayed flat tan
// stand-ins, the phone baking 13 chunks at ~1 s each): the look-ahead grows with speed (20 s of it flying), high and fast the
// ground is the server's low-detail picture and nothing is baked on the page, and a chunk not ready is drawn from its
// thumbnail (client/art2/game/lowres.js) instead of the flat stand-in.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aheadPlan, highAir, blocksFor, LowRes, haveOf, lowWorld, LOW_BLOCK, LOW_PX, HIGH_ALT, HIGH_ALT_OFF, AHEAD_AIR_S } from '../client/art2/game/lowres.js';

test('the look-ahead scales with speed: longer the faster, 20 s of it flying, more listed and fetched at once', () => {
  const car = aheadPlan(600, { phone: true }), fast = aheadPlan(1100, { phone: true }), heli = aheadPlan(1350, { air: true, phone: true, big: true }), slow = aheadPlan(80, { phone: true });
  assert.equal(slow.L, 0, 'standing still: no band ahead');
  assert.equal(car.L, 600 * 12); assert.ok(fast.L > car.L, 'faster, further');
  assert.equal(heli.L, 1350 * AHEAD_AIR_S, 'a helicopter flat out: 20 s ahead (27,000 px)');
  assert.ok(heli.L > aheadPlan(1350, { phone: true }).L, 'flying looks further than driving at the same speed');
  assert.ok(aheadPlan(5000, { air: true }).L <= 30000 && aheadPlan(5000, {}).L <= 14000, 'capped');
  assert.ok(heli.maxN >= Math.ceil(heli.L / 768), 'the list holds the whole line ahead');
  assert.ok(heli.maxN <= 160 * 0.8 + 1, 'no more than the browser keeps (most of it)');
  assert.ok(heli.fetch > car.fetch, 'more downloads at once flying fast');
});

test('high and fast in the air: the low-detail ground, with a margin either way', () => {
  assert.equal(highAir(900, 1300, false), true);
  assert.equal(highAir(300, 1300, false), false, 'low: the page bakes as before');
  assert.equal(highAir(900, 50, false), false, 'hovering: the full art');
  assert.equal(highAir(HIGH_ALT_OFF + 10, 1300, true), true, 'once on, it stays on a little lower');
  assert.equal(highAir(HIGH_ALT_OFF - 10, 1300, true), false);
  assert.ok(HIGH_ALT > HIGH_ALT_OFF);
});

test('the blocks wanted: where you are, the view\'s corners, and along the way you go', () => {
  const B = LOW_BLOCK * 768, grid = [273, 168];
  const here = blocksFor(B * 5.5, B * 2.5, 0, 0, 20, 600, 1200, grid);
  assert.deepEqual(here, [[5, 2]], 'still in the middle of a block: just it');
  const going = blocksFor(B * 5.9, B * 2.5, 1350, 0, 20, 600, 1200, grid);
  assert.deepEqual(going.slice(0, 1), [[5, 2]]); assert.ok(going.some(([bx]) => bx === 6) && going.some(([bx]) => bx === 7), 'east ahead');
  assert.ok(blocksFor(10, 10, -2000, -2000, 20, 600, 600, grid).every(([bx, by]) => bx >= 0 && by >= 0), 'not off the frame');
  assert.equal(lowWorld('91191f5d387f-v3'), 'v3'); assert.equal(lowWorld('39b3935fa3d5'), 'today');
  const bits = haveOf(Buffer.from([0b101, 0, 0]).toString('base64'));
  assert.ok(bits[0] & 1 && !(bits[0] & 2) && bits[0] & 4);
});

// a host as lowres.js sees it: the view, the stand-ins (phs, fallbacks) and the engine's chunks
function fakeHost() {
  const set = [];
  const h = {
    artKey: 'abc-v3', cdn: 'http://s/art/', grid: [273, 168], camX: 10 * 768 + 300, camY: 10 * 768 + 300, camV: { out: { x: 0, y: 0 } }, vx0: 7000, vx1: 8400, vy0: 7000, vy1: 8700,
    phs: new Map(), fallbacks: new Set(), failed: false,
    E: { hasChunk: () => false, setChunkFallback: (cx, cy, cv) => set.push([cx, cy, cv]) },
    _openSea: () => false,
  };
  h._placeholder = (cx, cy) => { const cv = { lo: false }; const g = { drawImage: (...a) => { g.drawn = a; }, imageSmoothingEnabled: false }; cv.lo = !!h.low && h.low.draw(g, cx, cy, 192); cv.g = g; h.phs.set(cy * 1000 + cx, cv); return cv; };
  return { h, set };
}

test('a block of the low-detail picture: fetched once for where you are, its chunks drawn from it, the flat stand-ins under it redrawn', async () => {
  const { h, set } = fakeHost(), asked = [];
  const have = new Uint8Array(56); have[0] = 0b11;   // (chunks 0 and 1 of block 0,0: (0,0) and (1,0))
  const img = { width: LOW_BLOCK * LOW_PX, close() {} };
  const fetchFn = async (u) => { asked.push(u); return { status: 200, headers: { get: (k) => (k === 'x-low-have' ? Buffer.from(have).toString('base64') : k === 'x-low-n' ? '2' : null) }, blob: async () => ({ size: 1234 }) }; };
  h.camX = 300; h.camY = 300;
  h.fallbacks.add(0); h.fallbacks.add(1); h.fallbacks.add(2);   // (0,0), (1,0), (2,0) showing flat stand-ins
  h.phs.set(0, { lo: false });
  h.low = new LowRes(h, { fetchFn, decode: async () => img });
  h.low.want();
  h.low.want();
  assert.deepEqual(asked, ['http://s/art/low/v3/0_0.png'], 'the block, asked for once');
  await new Promise((r) => setTimeout(r, 10));
  assert.ok(h.low.has(0, 0) && h.low.has(1, 0) && !h.low.has(2, 0), 'what the block has');
  assert.deepEqual(set.map(([cx, cy, cv]) => [cx, cy, cv.lo]), [[0, 0, true], [1, 0, true]], 'its flat stand-ins redrawn from it; (2,0) has none yet');
  const [im, sx, sy, sw, sh, , , dw] = set[1][2].g.drawn;
  assert.equal(im, img); assert.deepEqual([sx, sy, sw, sh, dw], [LOW_PX, 0, LOW_PX, LOW_PX, 192], 'its thumbnail, scaled to the stand-in');
  assert.equal(h.low.stats().got, 1);
});

test('the stand-in uses the map\'s thumbnail when it has one, else the flat one (host.js _placeholder)', async () => {
  const { World2 } = await import('../client/art2/game/host.js');
  const made = [];
  globalThis.document = { createElement: () => { const g = { calls: [], drawImage(...a) { this.calls.push(['img', ...a]); }, createImageData: (w, hh) => ({ data: new Uint8ClampedArray(w * hh * 4) }), putImageData() {}, save() {}, restore() {}, setTransform() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, fill() {}, fillRect() {}, arc() {}, ellipse() {}, setLineDash() {} }; const cv = { width: 0, height: 0, getContext: () => g, g }; made.push(cv); return cv; } };
  try {
    const h = Object.create(World2.prototype);
    Object.assign(h, { phs: new Map(), t: {}, map: { frame: { w: 100, h: 100 }, edges: [], buildings: [], props: [], tileAtPx: () => 1 } });
    h.low = { draw: (g, cx, cy, n) => (cx === 1 ? (g.drawImage('thumb', cx, cy, n), true) : false) };
    const a = h._placeholder(1, 0), b = h._placeholder(2, 0);
    assert.equal(a.lo, true); assert.deepEqual(a.g.calls[0], ['img', 'thumb', 1, 0, 192], 'drawn from the thumbnail');
    assert.equal(b.lo, false, 'no thumbnail: the flat stand-in');
  } finally { delete globalThis.document; }
});
