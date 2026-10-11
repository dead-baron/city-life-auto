// World v3's window (docs/WORLD-V3.md 8.12) on the v3 world itself: the page holds the 3 x 3 regions round the player
// (client/worldwindow.js, shared/regionpack.js assembleCity with opts.window), not the whole world. The v3 world built
// once, as the server builds it, and cut into its region files as the server cuts them; windows assembled round Metro
// City, across a region border and at the frame's corner; what a window weighs against the whole world.
// (One build, about 25-30 s and 1 GB: the heavy lock.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildWorld3 } from '../server/world3.js';
import { TILE } from '../shared/constants.js';
import { FRAME_W, FRAME_H, REGION_TILES } from '../shared/world3.js';
import { cityFromData } from '../shared/mapcore.js';
import { windowOf } from '../shared/mapwindow.js';
import { cutWorld } from '../server/worldcdn.js';
import { assembleCity, readIndex, regionsNear, windowRect } from '../shared/regionpack.js';
import { WindowKeeper } from '../client/worldwindow.js';

const { map: M } = await buildWorld3(1337, { log: () => {} });
const cut = cutWorld(M, { seed: 1337, world: 'v3' });   // (before anything changes the map)
const X = readIndex(cut.pack.index), files = new Map(cut.pack.regions.map((r) => [r.key, r.bytes]));
const bytesOf = (o) => { let n = 0; for (const v of Object.values(o)) if (ArrayBuffer.isView(v)) n += v.byteLength; return n; };

test("a window of the v3 world: 3 x 3 regions, the tiles windowOf cuts, its items only; a ninth of the world's layers", () => {
  const poi = M.pois.find((p) => p && p.kind === 'hospital') || M.pois[0];
  const tx = Math.floor(poi.x / TILE), ty = Math.floor(poi.y / TILE);
  const keys = regionsNear(X.frame, tx, ty), rect = windowRect(X.frame, keys);
  assert.equal(keys.length, 9);
  assert.equal(rect[2], 3 * REGION_TILES); assert.equal(rect[3], 3 * REGION_TILES);
  const t0 = performance.now();
  const w = cityFromData(assembleCity(cut.pack.index, keys.map((k) => files.get(k)), { window: rect }));
  const ms = performance.now() - t0;
  assert.deepEqual([w.x0, w.y0, w.w, w.h], rect);
  assert.deepEqual({ ...w.frame }, { w: FRAME_W, h: FRAME_H });
  const ref = windowOf(M, ...rect);
  for (const k of ['tiles', 'dist', 'zone', 'bld', 'roadAxis']) assert.equal(Buffer.compare(Buffer.from(ref[k].buffer, ref[k].byteOffset, ref[k].byteLength), Buffer.from(w[k].buffer)), 0, k);
  for (let i = 0; i < 3000; i++) { const x = rect[0] + ((i * 7919) % rect[2]), y = rect[1] + ((i * 104729) % rect[3]); assert.equal(w.tileAt(x, y), M.tileAt(x, y)); }
  const held = (l) => Object.keys(l).length;
  for (const f of ['props', 'pois', 'buildings', 'lamps']) {
    assert.equal(w[f].length, M[f].length, `${f}: the world's count`);
    assert.ok(held(w[f]) > 0 && held(w[f]) < M[f].length, `${f}: ${held(w[f])} of ${M[f].length}`);   // (the cities' POIs are mostly round the gulf: a window there holds most)
    w[f].forEach((it, i) => { const x = Math.floor((it.x ?? (it.tx * TILE)) / TILE), y = Math.floor((it.y ?? (it.ty * TILE)) / TILE); if (f !== 'buildings') assert.ok(w.inside(x, y), `${f}[${i}] at ${x}, ${y}`); });
  }
  assert.ok(w.poiNear(poi.x, poi.y) === w.pois[M.pois.indexOf(poi)], 'the hospital, found in the window');
  const layers = bytesOf(w), whole = bytesOf(M);
  console.log(`[v3 window] ${keys.join(' ')}: assembled in ${ms.toFixed(0)} ms; layers ${(layers / 1e6).toFixed(1)} MB of the world's ${(whole / 1e6).toFixed(1)} MB; props ${held(w.props)} of ${M.props.length}, POIs ${held(w.pois)} of ${M.pois.length}, buildings ${held(w.buildings)} of ${M.buildings.length}`);
  assert.ok(layers < whole / 6, 'the layers: about a ninth of the world');
});

test('the v3 window moves across a region border and at the frame corner: the regions coming in fetched early, the new window the same tiles', async () => {
  const asked = [];
  const keeper = new WindowKeeper({ frame: X.frame, fetchRegion: async (k) => { asked.push(k); return files.get(k); } });
  const R = REGION_TILES, y = Math.floor(3.5 * R);
  await keeper.start(4 * R + 250, y);   // (region 4, 3: the window 3-5 x 2-4)
  assert.deepEqual(keeper.rect, [3 * R, 2 * R, 3 * R, 3 * R]);
  asked.length = 0;
  assert.equal(keeper.want(5 * R - 30, y), null);
  await keeper.idle();
  assert.deepEqual(asked.sort(), ['r6-2', 'r6-3', 'r6-4']);
  const next = keeper.want(5 * R + 30, y);
  assert.deepEqual(next.rect, [4 * R, 2 * R, 3 * R, 3 * R]);
  asked.length = 0;
  const t0 = performance.now();
  const w = cityFromData(await keeper.assemble(cut.pack.index, next));
  const ms = performance.now() - t0;
  assert.equal(asked.length, 0, 'nothing waited for');
  keeper.moved(next);
  for (let i = 0; i < 2000; i++) { const x = next.rect[0] + ((i * 7919) % next.rect[2]), yy = next.rect[1] + ((i * 104729) % next.rect[3]); assert.equal(w.tileAt(x, yy), M.tileAt(x, yy)); }
  console.log(`[v3 window] moved east: assembled in ${ms.toFixed(0)} ms`);
  // the frame's corner: still 3 x 3 regions, shifted in
  const corner = keeper.want(FRAME_W - 10, FRAME_H - 10);
  assert.deepEqual(corner.rect, [FRAME_W - 3 * R, FRAME_H - 3 * R, 3 * R, 3 * R]);
  const c = cityFromData(await keeper.assemble(cut.pack.index, corner));
  assert.equal(c.tileAt(FRAME_W - 10, FRAME_H - 10), M.tileAt(FRAME_W - 10, FRAME_H - 10));
});

// ---- (H39, WORLD-V3.md 8.12's follow-ups) on the v3 world: the signatures, the whole world's places, the coarse picture ----
import { gzipSync } from 'node:zlib';
import { regionSig, PICTURE_K } from '../shared/regionpack.js';
import { mapSignature } from '../shared/mapcore.js';

test("the v3 index: every region's signature and the world's; a window lists the whole world's places and carries the coarse picture of the frame", () => {
  assert.equal(X.sig, mapSignature(M), "the world's signature: the welcome's");
  assert.equal(Object.keys(X.sigs).length, X.regions.length);
  for (const [k, b] of files) assert.equal(regionSig(b), X.sigs[k], k);
  const poi = M.pois.find((p) => p && p.kind === 'hospital') || M.pois[0];
  const keys = regionsNear(X.frame, Math.floor(poi.x / TILE), Math.floor(poi.y / TILE)), rect = windowRect(X.frame, keys);
  const w = cityFromData(assembleCity(cut.pack.index, keys.map((k) => files.get(k)), { window: rect }));
  const all = M.pois.filter(Boolean), outside = all.filter((p) => !w.inside(Math.floor(p.x / TILE), Math.floor(p.y / TILE)));
  assert.equal(w.places.filter(Boolean).length, all.length);
  assert.ok(outside.length > 50, `${outside.length} of ${all.length} places outside the window`);
  for (const p of outside) { const q = w.places[p.id]; assert.deepEqual([q.kind, q.label, q.x, q.y], [p.kind, p.label, p.x, p.y]); assert.equal(q.d, M.dist[M.idx(Math.floor(p.x / TILE), Math.floor(p.y / TILE))]); }
  const kinds = new Set(outside.map((p) => p.kind));
  // the coarse picture: a tile every PICTURE_K, the whole frame
  const P = w.picture;
  assert.deepEqual([P.k, P.w, P.h], [PICTURE_K, Math.ceil(FRAME_W / PICTURE_K), Math.ceil(FRAME_H / PICTURE_K)]);
  for (let i = 0; i < 4000; i++) { const x = (i * 7919) % P.w, y = (i * 104729) % P.h; assert.equal(P.tiles[y * P.w + x], M.tileAt(Math.min(FRAME_W - 1, x * P.k + (P.k >> 1)), Math.min(FRAME_H - 1, y * P.k + (P.k >> 1)))); }
  const gz = gzipSync(cut.pack.index, { level: 9 }).length;
  console.log(`[v3 window] the index ${(cut.pack.index.length / 1e6).toFixed(2)} MB raw, ${(gz / 1e6).toFixed(2)} MB gzipped; places ${all.length} (${outside.length} outside the window: ${[...kinds].slice(0, 12).join(', ')}...); picture ${P.w} x ${P.h} (${(P.tiles.length / 1e6).toFixed(2)} MB of tiles; the minimap's canvas ${(P.w * P.h * 4 / 1e6).toFixed(1)} MB, not ${(FRAME_W * FRAME_H * 4 / 1e6).toFixed(1)})`);
});
