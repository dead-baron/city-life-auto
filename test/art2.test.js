// The new renderer's chunk scheduling (client/art2/game/host.js planBake) and the stepped bake the workers run
// (chunkbake.bakeSteps): pure code, no browser needed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { planBake } from '../client/art2/game/host.js';
import { bakeChunk, bakeSteps, loadProviders, CHUNK } from '../client/art2/game/chunkbake.js';
import { generateCity } from '../shared/map.js';

const view = (cx, cy, w = 1760, h = 990) => ({ x0: cx - w / 2, y0: cy - h / 2, x1: cx + w / 2, y1: cy + h / 2, cx, cy, gx: 0, gy: 0 });
const key = (cx, cy) => cy * 1000 + cx;

test('planBake: standing still bakes the view first, then a ring all round', () => {
  const need = new Map(), bake = new Map(), v = view(20.1 * CHUNK, 20.1 * CHUNK, 900, 500); // (near a chunk corner)
  planBake(need, bake, v, 0, 0, 200);
  assert.ok(need.has(key(20, 20)), 'the chunk under the camera is needed');
  for (const [k, p] of need) assert.ok(bake.get(k) === p && p < 2000, 'needed chunks bake first');
  const ring = [...bake].filter(([k]) => !need.has(k));
  assert.ok(ring.length > 0 && ring.every(([, p]) => p >= 6000), 'then the ring');
  assert.ok(bake.has(key(18, 20)) && !need.has(key(18, 20)), 'the ring reaches west too');
});

test('planBake: driving fast bakes the road ahead by arrival time and nothing behind', () => {
  const need = new Map(), bake = new Map(), v = view(20.5 * CHUNK, 20.5 * CHUNK);
  const soon = planBake(need, bake, v, 790, 0, [200, 264, 8, 8]);
  // ahead: the chunks east of the view, sooner ones first
  const a1 = bake.get(key(23, 20)), a2 = bake.get(key(24, 20));
  assert.ok(a1 !== undefined && a2 !== undefined, 'chunks two and three columns ahead are baked');
  assert.ok(a1 >= 2000 && a1 < a2, 'nearer ahead comes first');
  // about 2.8 s ahead at this speed, not much more
  assert.ok(!bake.has(key(27, 20)), 'not too far ahead');
  // behind: nothing west of the view (no ring at speed)
  assert.ok(!bake.has(key(17, 20)) && !bake.has(key(18, 20)), 'nothing behind');
  assert.ok(soon.length > 0 && soon.every((k) => !need.has(k)), 'chunks coming into view soon are listed for a stand-in');
});

test('planBake: moving slowly skips the ring behind you', () => {
  const need = new Map(), bake = new Map(), v = view(20.5 * CHUNK, 20.5 * CHUNK, 900, 500);
  planBake(need, bake, v, 0, -300, 200); // heading north
  const south = [...bake.keys()].filter((k) => Math.floor(k / 1000) >= 22);
  assert.equal(south.length, 0, 'no ring to the south');
  assert.ok([...bake.keys()].some((k) => Math.floor(k / 1000) <= 19), 'the way north is baked');
});

test('bakeSteps yields along the way and gives the same chunk as bakeChunk', async () => {
  await loadProviders();
  const M = generateCity(1337);
  const opt = { quality: 0, seed: 1337 };
  const a = bakeChunk(M, 32, 24, opt);
  const it = bakeSteps(M, 32, 24, opt);
  let r = it.next(), steps = 0;
  while (!r.done) { steps++; r = it.next(); }
  const b = r.value;
  assert.ok(steps >= 9, `it pauses between phases (${steps} steps)`);
  assert.equal(a.g.w, CHUNK); assert.equal(b.g.h, CHUNK);
  assert.deepEqual(Buffer.from(a.g.col.buffer).equals(Buffer.from(b.g.col.buffer)), true, 'same colours');
  assert.deepEqual(Buffer.from(a.g.z.buffer).equals(Buffer.from(b.g.z.buffer)), true, 'same heights');
  assert.equal(a.items, b.items);
});

// ---- the pixel-art grid (gbuf.js downsample2, the voxel renders at the art pixel, the font) ----------------------
import { GBuf, packGBuf, downsample2, downsampleUnder, ART_PX, CHUNK_RUN } from '../client/art2/gbuf.js';
import { drawText } from '../client/art2/font.js';
import * as actors from '../client/art2/game/actors.js';

const solid = (w, h, rgb = [200, 200, 200]) => { const G = new GBuf(w, h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) G.put(x, y, rgb, [0, 0, 1], 0, null, 1); return G; };
const px = (d, x, y) => { const j = (y * d.w + x) * 4; return [d.p0[j], d.p0[j + 1], d.p0[j + 2], d.p0[j + 3]]; };

test('downsample2: a 2 x 2 block becomes one art pixel; outlines, lines and lamps survive, flecks of texture do not', () => {
  assert.equal(ART_PX, 2);
  // a light sprite with a 1 px dark outline on its left edge (at an odd column): still dark at art size
  const S = solid(12, 12); S.ax = 6; S.ay = 12;
  for (let y = 0; y < 12; y++) S.put(3, y, [20, 20, 30], [0, 0, 1], 0, null, 1);
  const d = downsample2(packGBuf(S));
  assert.equal(d.ap, 2); assert.equal(d.w, 6); assert.equal(d.h, 6); assert.equal(d.ax, 3); assert.equal(d.ay, 6);
  for (let y = 0; y < 6; y++) assert.ok(px(d, 1, y)[0] < 60, 'the outline column stays dark');
  assert.ok(px(d, 4, 3)[0] > 150, 'the body stays light');
  // a chunk-like surface: a lone light fleck is texture (averaged away), a 1 px line across it is kept
  const C = solid(32, 32, [60, 66, 78]);
  C.put(9, 9, [240, 240, 240], [0, 0, 1], 0, null, 1);
  for (let y = 0; y < 32; y++) C.put(21, y, [230, 200, 80], [0, 0, 1], 0, null, 1);
  const c = downsample2(packGBuf(C), { run: CHUNK_RUN });
  assert.ok(px(c, 4, 4)[0] < 120, `the fleck is averaged in (${px(c, 4, 4)})`);
  for (let y = 0; y < 16; y++) assert.deepEqual(px(c, 10, y).slice(0, 3), [230, 200, 80], 'the line comes through whole, in its own colour');
  // a lamp: one glowing texel lights its art pixel
  const L = solid(8, 8, [40, 40, 40]);
  L.put(5, 2, [255, 230, 160], [0, 0, 1], 0, [255, 230, 160, 255], 1);
  const l = downsample2(packGBuf(L));
  const j = (1 * l.w + 2) * 4;
  assert.ok(l.p2[j] > 100 && l.p0[j] > 200, 'the lamp art pixel glows');
});

test('downsample2: coverage and the anchor - an odd anchor gets a margin so it lands on an art pixel corner', () => {
  const G = new GBuf(5, 4); G.ax = 3; G.ay = 3;
  for (let x = 0; x < 5; x++) G.put(x, 1, [200, 0, 0], [0, 0, 1], 7, null, 0);   // one row: half of each block
  const d = downsample2(packGBuf(G));
  assert.equal(d.ax, 2); assert.equal(d.ay, 2);                                   // (3 + 1) / 2
  assert.equal(d.w, 3); assert.equal(d.h, 3);
  // the margin row 0 + source row 0 make art row 0; source rows 1-2 make art row 1: the painted row is 2 of 4
  assert.ok(px(d, 1, 1)[3] >= 128, 'two of four texels: drawn');
  assert.equal(px(d, 1, 0)[3], 0, 'none covered: empty');
  const z = d.p1[(1 * d.w + 1) * 4];
  assert.equal(z, 7, 'height comes from a real texel');
  // a single covered texel is not enough
  const H = new GBuf(4, 4); H.put(1, 1, [0, 200, 0], [0, 0, 1], 0, null, 0);
  assert.equal(px(downsample2(packGBuf(H)), 0, 0)[3], 0);
  // the under layer keeps the building numbers of the chunk's picks
  const U = new Uint8Array(4 * 4 * 4).fill(50); for (let i = 0; i < 16; i++) U[i * 4 + 3] = i < 8 ? 3 : 0;
  const pick = Int32Array.from([0, 2, 8, 10]);
  const u = downsampleUnder(U, 4, 4, pick);
  assert.deepEqual([u[3], u[7], u[11], u[15]], [3, 3, 0, 0]);
});

test('voxel things are drawn straight at the art pixel; letters land on whole art pixels', () => {
  const d = { m: 1, p: 2 };
  actors.setArtPx(1);
  const full = actors.vehicleSprite(d, {}, 3, 32);
  actors.setArtPx(2);
  const art = actors.vehicleSprite(d, {}, 3, 32);
  actors.setArtPx(1);
  assert.equal(art.ap, 2);
  assert.ok(!full.ap || full.ap === 1);
  assert.ok(Math.abs(art.w * 2 - full.w) <= 6 && Math.abs(art.h * 2 - full.h) <= 6, `half the size (${full.w}x${full.h} -> ${art.w}x${art.h})`);
  // the anchor (the centre on the ground) stays where the full render has it, to an art pixel
  assert.ok(Math.abs(art.ax * 2 - full.ax) <= 2 && Math.abs(art.ay * 2 - full.ay) <= 2, `anchor ${full.ax},${full.ay} vs ${art.ax * 2},${art.ay * 2}`);
  // 2 px letters start on even px, their shadow a whole letter pixel down-right
  const lit = [];
  drawText((x, y, k) => lit.push([x, y, k]), 'I', 5, 7, { sx: 2, sy: 2, gap: 1, shadow: true });
  const body = lit.filter((p) => !p[2]), shade = lit.filter((p) => p[2]);
  assert.ok(body.every(([x, y]) => x >= 4 && y >= 6) && Math.min(...body.map((p) => p[0])) % 2 === 0 && Math.min(...body.map((p) => p[1])) % 2 === 0, 'letters on even px');
  assert.equal(Math.min(...shade.map((p) => p[0])) - Math.min(...body.map((p) => p[0])), 2, 'the shadow is a whole letter pixel off');
});
