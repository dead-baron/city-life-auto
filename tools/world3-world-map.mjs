// World v3, stage 2, step 4 (docs/WORLD-V3.md 8.6): the picture of the whole v3 world built in one call
// (tools/world3-build.mjs). Two parts:
// - docs/world-v3-world.png: the built map's tiles over the whole frame, 1 px = 2 tiles (each pixel the commonest tile
//   of its 2 x 2, buildings darker, the props as dots: trees green, rocks grey) - seconds;
// - the game's chunk bake (client/art2/game/chunkbake.js), timed on a sample of chunks of each kind of ground to say
//   what the whole frame costs; with --bake [--shrink 64] it bakes every chunk that has land or inland water (deep sea
//   once) and writes docs/world-v3-world-bake.png (heavy: see 8.6 for the time).
//   node --expose-gc tools/world3-world-map.mjs [--bake] [--shrink 64] [--sample 60]
// (heavy: run it under `flock /tmp/cla-heavy.lock`)
import { writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const imp = (f) => import(pathToFileURL(join(ROOT, f)).href);
const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const BAKE = process.argv.includes('--bake');
const SHRINK = +arg('--shrink', '64'), SAMPLE = +arg('--sample', '60');
const t0 = Date.now();
const log = (s) => console.log(`[${((Date.now() - t0) / 1000).toFixed(0)} s] ${s}`);

const { generateCity } = await imp('shared/map.js');
await imp('shared/world3-islands.js');
const { TILE, T, CHUNK_TILES } = await imp('shared/constants.js');
const { FRAME_W, FRAME_H } = await imp('shared/world3.js');
const { prepare } = await imp('tools/world3-build.mjs');

const prep = prepare();
log('today and the land');
const ms0 = performance.now();
const M = generateCity(1337, { world3: true, frame: { w: FRAME_W, h: FRAME_H }, land: prep.land, today: prep.today });
log(`the world built in ${Math.round(performance.now() - ms0)} ms (${M.w} x ${M.h})`);

// 1. the tiles, 1 px = 2 tiles
const COL = {
  [T.WALL]: [70, 66, 62], [T.GRASS]: [96, 140, 74], [T.SIDEWALK]: [176, 172, 164], [T.ROAD]: [62, 62, 66], [T.PLAZA]: [190, 182, 166],
  [T.BUILDING]: [150, 110, 96], [T.WATER]: [70, 140, 170], [T.DEEP]: [36, 86, 128], [T.SAND]: [222, 204, 150], [T.DOCK]: [140, 110, 80],
  [T.DIRT]: [160, 132, 96], [T.FIELD]: [176, 168, 84], [T.BRIDGE]: [120, 120, 126], [T.LOT]: [110, 110, 112], [T.FLOOR]: [160, 140, 120], [T.COUNTER]: [160, 140, 120],
};
const S = 2, GW = Math.ceil(M.w / S), GH = Math.ceil(M.h / S);
const img = Buffer.alloc(GW * GH * 3);
const cnt = new Uint16Array(16);
for (let gy = 0; gy < GH; gy++) for (let gx = 0; gx < GW; gx++) {
  cnt.fill(0);
  for (let y = gy * S; y < Math.min(M.h, gy * S + S); y++) for (let x = gx * S; x < Math.min(M.w, gx * S + S); x++) cnt[M.tiles[y * M.w + x]]++;
  let best = 0; for (let t = 1; t < 16; t++) if (cnt[t] > cnt[best]) best = t;
  // (a road or a bridge wins its pixel: the network reads)
  if (cnt[T.ROAD]) best = T.ROAD; else if (cnt[T.BRIDGE]) best = T.BRIDGE;
  const c = COL[best] || [255, 0, 255], o = (gy * GW + gx) * 3;
  img[o] = c[0]; img[o + 1] = c[1]; img[o + 2] = c[2];
}
const dot = (x, y, c, k = 1) => { const gx = Math.floor(x / TILE / S), gy = Math.floor(y / TILE / S); if (gx < 0 || gy < 0 || gx >= GW || gy >= GH) return; const o = (gy * GW + gx) * 3; for (let j = 0; j < 3; j++) img[o + j] = Math.round(img[o + j] * (1 - k) + c[j] * k); };
for (const p of M.props) {
  if (/^tree|^pine|^palm|^oak|^redwood|^shrub|^bush/.test(p.t)) dot(p.x, p.y, [40, 92, 44], 0.6);
  else if (/rock|boulder|stone/.test(p.t)) dot(p.x, p.y, [128, 124, 118], 0.6);
  else if (/cactus|scrub|tumble/.test(p.t)) dot(p.x, p.y, [120, 140, 70], 0.6);
}
for (const b of M.buildings) for (let y = b.ty; y < b.ty + b.th; y += S) for (let x = b.tx; x < b.tx + b.tw; x += S) dot((x + 0.5) * TILE, (y + 0.5) * TILE, [120, 70, 60], 0.5);
const OUT = join(ROOT, 'docs/world-v3-world.png');
const tmp = OUT + '.rgb';
writeFileSync(tmp, img);
const py = (src, out, w, h, title) => `
from PIL import Image, ImageDraw
im = Image.frombytes('RGB', (${w}, ${h}), open(${JSON.stringify(src)}, 'rb').read())
out = Image.new('RGB', (${w} + 32, ${h} + 48), (24, 26, 30))
out.paste(im, (16, 40))
ImageDraw.Draw(out).text((16, 12), ${JSON.stringify(title)}, fill=(235, 235, 235))
out.save(${JSON.stringify(out)})
print(out.size)
`;
let r = spawnSync('python3', ['-c', py(tmp, OUT, GW, GH, 'World v3: the whole world in one build (generateCity world3) - the tiles, 1 px = 2 tiles (8 m); props as dots')], { stdio: 'inherit' });
rmSync(tmp, { force: true });
if (r.status !== 0) throw new Error('python3 + PIL could not write the PNG');
log(OUT);

// 2. the chunk bake: timed on a sample of chunks by kind of ground, then (--bake) every chunk
const { bakeChunk, loadProviders, SpriteCache, providers } = await imp('client/art2/game/chunkbake.js');
await loadProviders();
const cache = new SpriteCache(200e6);
const CT = CHUNK_TILES, CX = Math.ceil(M.w / CT), CY = Math.ceil(M.h / CT);
const kindOf = (cx, cy) => {
  let land = 0, wet = 0, road = 0, bld = 0;
  for (let ty = cy * CT; ty < Math.min(M.h, cy * CT + CT); ty++) for (let tx = cx * CT; tx < Math.min(M.w, cx * CT + CT); tx++) {
    const i = ty * M.w + tx;
    if (M.land[i]) land++; if (M.river[i]) wet++;
    const t = M.tiles[i]; if (t === T.ROAD) road++; else if (t === T.BUILDING || t === T.WALL) bld++;
  }
  return !land && !wet ? 'sea' : road + bld > CT * 4 ? 'town' : land < CT * CT / 2 ? 'coast' : 'wild';
};
const kinds = { sea: [], coast: [], wild: [], town: [] };
for (let cy = 0; cy < CY; cy++) for (let cx = 0; cx < CX; cx++) kinds[kindOf(cx, cy)].push([cx, cy]);
const opt = { quality: 1, seed: 1337, lowMem: false, artPx: 2, scratch: false };
const per = {};
for (const k of ['coast', 'wild', 'town']) {
  const list = kinds[k], step = Math.max(1, Math.floor(list.length / SAMPLE));
  let n = 0; const ts = performance.now();
  for (let j = 0; j < list.length && n < SAMPLE; j += step, n++) bakeChunk(M, list[j][0], list[j][1], opt, cache, providers);
  per[k] = n ? (performance.now() - ts) / n : 0;
}
const total = ['coast', 'wild', 'town'].reduce((s, k) => s + per[k] * kinds[k].length, 0);
log(`chunks: ${Object.entries(kinds).map(([k, l]) => `${k} ${l.length}`).join(', ')}; ms per chunk ${Object.entries(per).map(([k, v]) => `${k} ${v.toFixed(0)}`).join(', ')}; the whole frame's bake about ${(total / 60000).toFixed(0)} min on one thread`);

if (BAKE) {
  const CH = CT * TILE * 2 / 2;   // (the bake's chunk in art px at artPx 2: CHUNK_TILES * TILE)
  const CS = Math.max(1, Math.round(CT * TILE / SHRINK)), BW = CX * CS, BH = CY * CS;
  const big = Buffer.alloc(BW * BH * 3);
  let seaPx = null, n = 0;
  for (let cy = 0; cy < CY; cy++) for (let cx = 0; cx < CX; cx++) {
    const k = kindOf(cx, cy);
    let px = k === 'sea' ? seaPx : null;
    if (!px) {
      const g = bakeChunk(M, cx, cy, opt, cache, providers).g, col = g.col, side = Math.round(Math.sqrt(col.length / 4)), f = side / CS;
      px = Buffer.alloc(CS * CS * 3);
      for (let by = 0; by < CS; by++) for (let bx = 0; bx < CS; bx++) {
        let R = 0, G = 0, B = 0, q = 0;
        for (let y = Math.floor(by * f); y < Math.floor(by * f + f); y++) for (let x = Math.floor(bx * f); x < Math.floor(bx * f + f); x++) { const j = (y * side + x) * 4; R += col[j]; G += col[j + 1]; B += col[j + 2]; q++; }
        const o = (by * CS + bx) * 3; px[o] = R / q; px[o + 1] = G / q; px[o + 2] = B / q;
      }
      if (k === 'sea') seaPx = px;
      if (++n % 500 === 0) log(`${n} chunks baked`);
    }
    for (let y = 0; y < CS; y++) px.copy(big, ((cy * CS + y) * BW + cx * CS) * 3, y * CS * 3, (y + 1) * CS * 3);
  }
  void CH;
  const OUT2 = join(ROOT, 'docs/world-v3-world-bake.png'), tmp2 = OUT2 + '.rgb';
  writeFileSync(tmp2, big);
  r = spawnSync('python3', ['-c', py(tmp2, OUT2, BW, BH, `World v3: the whole world, the game's chunk bake at 1/${SHRINK}`)], { stdio: 'inherit' });
  rmSync(tmp2, { force: true });
  log(`${OUT2} (${n} chunks baked)`);
}
