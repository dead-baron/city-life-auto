// World v3, stage 2, step 4 (docs/WORLD-V3.md 8.6): the picture of the whole v3 world built in one call
// (tools/world3-build.mjs). Two parts:
// - docs/world-v3-world.png: the built map's tiles over the whole frame, 1 px = 2 tiles (each pixel the commonest tile
//   of its 2 x 2, buildings darker, the props as dots: trees green, rocks grey) - seconds;
// - the game's chunk bake (client/art2/game/chunkbake.js), timed on a sample of chunks of each kind of ground to say
//   what the whole frame costs; with --bake [--shrink 64] it bakes every chunk that has land or inland water (deep sea
//   once) and writes docs/world-v3-world-bake.png (heavy: see 8.6 for the time).
//   node --expose-gc tools/world3-world-map.mjs [--quick] [--bake] [--shrink 64] [--sample 60] [--region rx,ry]
// (--quick: the picture only, no chunk bake timing)
// (--region: one region of 504 tiles baked and lit at 1/16, about 2 minutes: docs/world-v3-world-r<rx>-<ry>.png)
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

// 1. the tiles, 1 px = 2 tiles - the ground by its biome as the game paints it (m.terrainCls: forest floor, alpine and
// dry grass, pasture, desert, scree), the fields by crop, the washes' gravel; the props drawn to their size: tree crowns,
// the outcrops (sandstone red, granite grey, basalt dark), boulders, and the plants by kind (World v3 8.8)
const COL = {
  [T.WALL]: [70, 66, 62], [T.GRASS]: [96, 140, 74], [T.SIDEWALK]: [176, 172, 164], [T.ROAD]: [62, 62, 66], [T.PLAZA]: [190, 182, 166],
  [T.BUILDING]: [150, 110, 96], [T.WATER]: [70, 140, 170], [T.DEEP]: [36, 86, 128], [T.SAND]: [222, 204, 150], [T.DOCK]: [140, 110, 80],
  [T.DIRT]: [160, 132, 96], [T.FIELD]: [176, 168, 84], [T.BRIDGE]: [120, 120, 126], [T.LOT]: [110, 110, 112], [T.FLOOR]: [160, 140, 120], [T.COUNTER]: [160, 140, 120],
};
const { DISTRICTS, terrainAt, wildBiome } = await imp('shared/mapcore.js');
const { peakHeight, SNOW_LINE } = await imp('shared/world3-biomes.js');
const TC = M.terrainCls;
const bioAt = (x, y) => wildBiome(M.dist[y * M.w + x], terrainAt(TC.cls, TC.cw, x, y));
const CROPS = [[214, 190, 100], [150, 172, 70], [112, 150, 82], [196, 176, 112], [128, 98, 70]];
const fieldCol = (x, y) => { const X = x * TILE + 16, Y = y * TILE + 16; const f = M.fields.findIndex((r) => X >= r.x && X < r.x + r.w && Y >= r.y && Y < r.y + r.h); return CROPS[(f < 0 ? 0 : f * 7) % CROPS.length]; };
const groundCol = (t, x, y) => {
  const i = y * M.w + x, st = (DISTRICTS[M.dist[i]] || DISTRICTS[13]).style, wild = ['wild', 'rural', 'desert', 'rocky', 'airport'].includes(st);
  if (t === T.FIELD) return fieldCol(x, y);
  if (!wild || (t !== T.GRASS && t !== T.DIRT && t !== T.SAND)) return COL[t];
  const b = bioAt(x, y), snow = M.dist[i] === 48 && peakHeight(x, y) >= SNOW_LINE;
  if (snow && t !== T.GRASS) return [236, 240, 244];
  if (t === T.SAND) return (M.reserve[i] & 128) ? [204, 194, 170] : b === 3 || st === 'desert' ? [226, 196, 140] : COL[t];
  if (t === T.DIRT) return st === 'desert' || b === 3 ? [196, 142, 98] : b === 4 ? [138, 132, 124] : b === 2 ? [104, 88, 62] : COL[t];
  return st === 'desert' || b === 3 ? [168, 160, 104] : b === 2 ? [58, 98, 54] : b === 4 ? [124, 150, 92] : st === 'rural' ? [112, 152, 78] : COL[t];
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
  const c = groundCol(best, Math.min(M.w - 1, gx * S), Math.min(M.h - 1, gy * S)) || [255, 0, 255], o = (gy * GW + gx) * 3;
  img[o] = c[0]; img[o + 1] = c[1]; img[o + 2] = c[2];
}
const dot = (x, y, c, k = 1) => { const gx = Math.floor(x / TILE / S), gy = Math.floor(y / TILE / S); if (gx < 0 || gy < 0 || gx >= GW || gy >= GH) return; const o = (gy * GW + gx) * 3; for (let j = 0; j < 3; j++) img[o + j] = Math.round(img[o + j] * (1 - k) + c[j] * k); };
const disc = (x, y, rx, ry, c, k) => { const R = Math.max(rx, ry) / TILE / S; for (let dy = -Math.ceil(ry / TILE / S); dy <= Math.ceil(ry / TILE / S); dy++) for (let dx = -Math.ceil(R); dx <= Math.ceil(R); dx++) if ((dx * TILE * S / Math.max(1, rx)) ** 2 + (dy * TILE * S / Math.max(1, ry)) ** 2 <= 1.0001) dot(x + dx * TILE * S, y + dy * TILE * S, c, k); };
const PLANT = { reeds: [126, 138, 74], cattails: [110, 120, 64], tallGrass: [120, 150, 80], hedge: [46, 88, 44], lavender: [150, 118, 190], sunflowers: [232, 200, 64], duneGrass: [176, 176, 112], beachGrass: [168, 172, 112], icePlant: [150, 160, 90] };
const ROCK = { sandstone: [170, 84, 58], granite: [150, 148, 146], basalt: [78, 78, 86] };
for (const p of M.props) {
  if (p.t === 'outcrop') { disc(p.x, p.y, p.w / 2, p.d / 2, ROCK[p.style] || ROCK.granite, 0.95); continue; }
  if (p.t === 'redwood') { disc(p.x, p.y, 96, 96, [34, 70, 40], 0.55); continue; }
  if (/^tree|^pine|^palm|^oak/.test(p.t)) { disc(p.x, p.y, 40, 40, p.sp === 'apple' || p.sp === 'orange' ? [70, 120, 50] : /mesquite|paloVerde|joshua|deadSnag/.test(p.sp || '') ? [110, 120, 70] : [40, 84, 44], 0.6); continue; }
  if (p.sp && PLANT[p.sp]) { dot(p.x, p.y, PLANT[p.sp], 0.85); continue; }
  if (/^shrub|^bush|^flowers/.test(p.t)) dot(p.x, p.y, [70, 110, 60], 0.45);
  else if (/rock|boulder|stone/.test(p.t)) dot(p.x, p.y, [128, 124, 118], 0.7);
  else if (/cactus|scrub|tumble/.test(p.t)) dot(p.x, p.y, [90, 132, 70], 0.7);
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
// the biomes' ground and dressing (8.8: shared/world3-biomes.js)
if (M.world3biomes) log(`biomes: ground ${JSON.stringify(M.world3biomes.ground)}, dressing ${JSON.stringify(M.world3biomes.dress)}`);
if (process.argv.includes('--quick')) process.exit(0);   // (the picture only: no chunk bake timing)

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

// (--region rx,ry: one region of 504 tiles - 21 x 21 chunks - baked and lit as tools/world3-place-map.mjs does it, at
// 1/16: a pixel is half a tile -> docs/world-v3-world-r<rx>-<ry>.png)
const REGION = arg('--region', null);
if (REGION) {
  const [rx, ry] = REGION.split(',').map(Number);
  const { F_WATER } = await imp('client/art2/gbuf.js');
  const RC = 21, S16 = 16, CHP = CT * TILE, CS16 = CHP / S16, GW2 = RC * CS16, GH2 = RC * CS16;
  const rimg = Buffer.alloc(GW2 * GH2 * 3);
  const Lv = [-0.42, -0.5, 0.76], LN = Math.hypot(...Lv), LXv = Lv[0] / LN, LYv = Lv[1] / LN, LZv = Lv[2] / LN;
  const shade = new Float32Array(CHP * CHP);
  let seaPx = null, n = 0;
  const tb = performance.now();
  for (let cy = ry * RC; cy < ry * RC + RC; cy++) for (let cx = rx * RC; cx < rx * RC + RC; cx++) {
    let px = kindOf(cx, cy) === 'sea' ? seaPx : null;
    if (!px) {
      const g = bakeChunk(M, cx, cy, opt, cache, providers).g, col = g.col, nrm = g.nrm, z = g.z, flag = g.flag;
      let tall = 0;
      for (let i = 0; i < CHP * CHP; i++) if (z[i] > tall) tall = z[i];
      for (let y = 0; y < CHP; y++) for (let x = 0; x < CHP; x++) {
        const i = y * CHP + x, j = i * 4;
        let lam = LZv;
        if (nrm[j + 3]) { const nx = nrm[j] / 127.5 - 1, ny = nrm[j + 1] / 127.5 - 1, nz = nrm[j + 2] / 127.5 - 1; lam = Math.max(0, nx * LXv + ny * LYv + nz * LZv); }
        let k = 0.58 + 0.52 * lam;
        if (flag[i] & F_WATER) k = 0.96 + 0.08 * lam;
        else if (tall > 6) { const z0 = z[i]; for (let d = 2; d <= 40; d += 2) { const sx = x - d, sy = y - d; if (sx < 0 || sy < 0) break; if (z[sy * CHP + sx] > z0 + d * 1.1 + 3) { k *= 0.7; break; } } }
        shade[i] = k;
      }
      px = Buffer.alloc(CS16 * CS16 * 3);
      for (let by = 0; by < CS16; by++) for (let bx = 0; bx < CS16; bx++) {
        let R = 0, G = 0, B = 0;
        for (let y = by * S16; y < by * S16 + S16; y++) for (let x = bx * S16; x < bx * S16 + S16; x++) { const i = y * CHP + x, j = i * 4, k = shade[i]; R += col[j] * k; G += col[j + 1] * k; B += col[j + 2] * k; }
        const o = (by * CS16 + bx) * 3, q = S16 * S16;
        px[o] = Math.min(255, R / q); px[o + 1] = Math.min(255, G / q); px[o + 2] = Math.min(255, B / q);
      }
      if (kindOf(cx, cy) === 'sea') seaPx = px;
      n++;
    }
    const ox = (cx - rx * RC) * CS16, oy = (cy - ry * RC) * CS16;
    for (let y = 0; y < CS16; y++) px.copy(rimg, ((oy + y) * GW2 + ox) * 3, y * CS16 * 3, (y + 1) * CS16 * 3);
  }
  const OUT3 = join(ROOT, `docs/world-v3-world-r${rx}-${ry}.png`), tmp3 = OUT3 + '.rgb';
  writeFileSync(tmp3, rimg);
  r = spawnSync('python3', ['-c', py(tmp3, OUT3, GW2, GH2, `World v3, the whole world in one build: region ${rx}, ${ry} (tiles ${rx * 504}-${rx * 504 + 503}, ${ry * 504}-${ry * 504 + 503}), the game's chunk bake at 1/16`)], { stdio: 'inherit' });
  rmSync(tmp3, { force: true });
  log(`${OUT3} (${n} chunks baked in ${Math.round((performance.now() - tb) / 1000)} s)`);
}

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
