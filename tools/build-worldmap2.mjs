// Bakes the world map's picture (assets/map/): the city as the game draws it, from above, for the map screen.
//
// Every art chunk inside the map's frame (client/hud.js MAP_FRAME) is baked with the game's own chunk bake
// (client/art2/game/chunkbake.js, the code the live renderer and the server's art bake run), lit with a fixed afternoon
// sun from the north-west (its normals) with soft shadows to the south-east (its heights), and shrunk 16 times (a box
// filter: a pixel of the map is 16 x 16 px of the world, half a tile). Open sea far from any shore is one chunk baked once.
// Written as webp (Python's PIL, a build tool only - the game has no dependencies):
//   assets/map/meta.json   { sig (shared/map.js mapSignature: the world it shows), scale, x0, y0 (world px of its
//                            corner), w, h, tile, cols, rows, overview }
//   assets/map/overview.webp   the whole frame at half that (1/32): shown at once
//   assets/map/t/<col>_<row>.webp   512 x 512 tiles at 1/16, fetched as the map is zoomed in
// The client (client/worldmap.js) uses it only when the signature is the running world's - rebake after any change to
// the world (a WORLD_VERSION bump):  node tools/build-worldmap2.mjs [threads]   (about ten minutes on two cores)
//   --area cx0,cy0,cx1,cy1 --out x.png   bake only those art chunks into a PNG (for trying the look)
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { cpus } from 'node:os';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const imp = (f) => import(pathToFileURL(join(ROOT, f)).href);
const SEED = 1337, S = 16, CH = 768, CS = CH / S;   // CS: a chunk's size on the map
const FRAME = [24 * 32, 10 * 32, 1304 * 32, 1170 * 32];   // client/hud.js MAP_FRAME, world px

if (isMainThread) await main(); else await worker();

async function main() {
  const t0 = Date.now();
  const { generateCity, mapSignature } = await imp('shared/map.js');
  const { T } = await imp('shared/constants.js');
  const map = generateCity(SEED);
  const sig = mapSignature(map);
  const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
  const area = arg('--area') && arg('--area').split(',').map(Number);
  const [cx0, cy0, cx1, cy1] = area || [Math.floor(FRAME[0] / CH), Math.floor(FRAME[1] / CH), Math.ceil(FRAME[2] / CH), Math.ceil(FRAME[3] / CH)];
  const GW = (cx1 - cx0) * CS, GH = (cy1 - cy0) * CS;
  const img = Buffer.alloc(GW * GH * 3);
  // open sea: every tile of the chunk and two round it deep water, and nothing standing on it
  const deep = (cx, cy) => {
    for (let ty = cy * 24 - 2; ty < cy * 24 + 26; ty++) for (let tx = cx * 24 - 2; tx < cx * 24 + 26; tx++) if (map.tileAt(tx, ty) !== T.DEEP) return false;
    return true;
  };
  const jobs = [], sea = [];
  for (let cy = cy0; cy < cy1; cy++) for (let cx = cx0; cx < cx1; cx++) (deep(cx, cy) ? sea : jobs).push([cx, cy]);
  // the open sea's look: one deep chunk baked (the first), copied to the rest
  if (sea.length) jobs.unshift(sea[0]);
  console.log(`[map] ${jobs.length} chunks to bake, ${sea.length} of open sea; world ${sig}`);
  const n = Math.max(1, Math.min(Number(process.argv[2]) || cpus().length, 8, jobs.length));
  let next = 0, done = 0, seaPix = null;
  const put = (cx, cy, px) => {
    const ox = (cx - cx0) * CS, oy = (cy - cy0) * CS;
    for (let y = 0; y < CS; y++) px.copy(img, ((oy + y) * GW + ox) * 3, y * CS * 3, (y + 1) * CS * 3);
  };
  await new Promise((resolve, reject) => {
    let live = n;
    for (let k = 0; k < n; k++) {
      const w = new Worker(fileURLToPath(import.meta.url), { workerData: { seed: SEED } });
      const feed = () => { if (next < jobs.length) { const [cx, cy] = jobs[next++]; w.postMessage({ cx, cy }); } else { w.terminate(); if (--live === 0) resolve(); } };
      w.on('message', (m) => {
        if (m.ready) return feed();
        if (m.error) return reject(new Error(`chunk ${m.cx},${m.cy}: ${m.error}`));
        const px = Buffer.from(m.px);
        put(m.cx, m.cy, px);
        if (sea.length && m.cx === sea[0][0] && m.cy === sea[0][1]) seaPix = px;
        if (++done % 50 === 0) console.log(`[map] ${done}/${jobs.length} (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
        feed();
      });
      w.on('error', reject);
    }
  });
  for (const [cx, cy] of sea) if (seaPix) put(cx, cy, seaPix);
  if (area) {
    const f = arg('--out') || 'map-area.png', tmp = f + '.rgb';
    writeFileSync(tmp, img);
    spawnSync('python3', ['-c', `from PIL import Image, ImageEnhance\nim = Image.frombytes('RGB', (${GW}, ${GH}), open(${JSON.stringify(tmp)}, 'rb').read())\nim = ImageEnhance.Color(im).enhance(1.12)\nImageEnhance.Contrast(im).enhance(1.04).save(${JSON.stringify(f)})`], { stdio: 'inherit' });
    rmSync(tmp, { force: true });
    console.log(`[map] ${f}: ${GW} x ${GH}`);
    return;
  }
  // the frame, cut out of the chunks' grid
  const fx = Math.round((FRAME[0] - cx0 * CH) / S), fy = Math.round((FRAME[1] - cy0 * CH) / S);
  const W = Math.round((FRAME[2] - FRAME[0]) / S), H = Math.round((FRAME[3] - FRAME[1]) / S);
  const out = Buffer.alloc(W * H * 3);
  for (let y = 0; y < H; y++) img.copy(out, y * W * 3, ((fy + y) * GW + fx) * 3, ((fy + y) * GW + fx + W) * 3);
  const dir = join(ROOT, 'assets', 'map'), tmp = join(ROOT, 'assets', 'map', 'frame.rgb');
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(join(dir, 't'), { recursive: true });
  writeFileSync(tmp, out);
  const TILE_PX = 512, cols = Math.ceil(W / TILE_PX), rows = Math.ceil(H / TILE_PX);
  const py = `
import sys
from PIL import Image, ImageEnhance
W, H, T, d = ${W}, ${H}, ${TILE_PX}, ${JSON.stringify(dir)}
im = Image.frombytes('RGB', (W, H), open(d + '/frame.rgb', 'rb').read())
im = ImageEnhance.Color(im).enhance(1.12)
im = ImageEnhance.Contrast(im).enhance(1.04)
for r in range(${rows}):
    for c in range(${cols}):
        im.crop((c * T, r * T, min(W, (c + 1) * T), min(H, (r + 1) * T))).save(f'{d}/t/{c}_{r}.webp', quality=82, method=6)
im.resize((W // 2, H // 2), Image.LANCZOS).save(d + '/overview.webp', quality=80, method=6)
`;
  const r = spawnSync('python3', ['-c', py], { stdio: 'inherit' });
  rmSync(tmp, { force: true });
  if (r.status !== 0) throw new Error('python3 + PIL could not write the webp files');
  writeFileSync(join(dir, 'meta.json'), JSON.stringify({ sig, scale: S, x0: FRAME[0], y0: FRAME[1], w: W, h: H, tile: TILE_PX, cols, rows, overview: 2 }) + '\n');
  console.log(`[map] assets/map: ${W} x ${H} at 1/${S}, ${cols} x ${rows} tiles, in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}

async function worker() {
  const { generateCity, cityData, cityFromData } = await imp('shared/map.js');
  const { bakeChunk, loadProviders, SpriteCache, providers } = await imp('client/art2/game/chunkbake.js');
  const { F_WATER } = await imp('client/art2/gbuf.js');
  await loadProviders();
  const map = generateCity(workerData.seed);
  const M = structuredClone(cityData(map));
  if (cityFromData) cityFromData(M); else Object.setPrototypeOf(M, Object.getPrototypeOf(map));
  const cache = new SpriteCache(200e6);
  // the light: an afternoon sun from the north-west, a little warm; what stands taller than the sun's line from a
  // point up and to the left of it on the screen shades it
  const L = [-0.42, -0.5, 0.76], LN = Math.hypot(...L), LX = L[0] / LN, LY = L[1] / LN, LZ = L[2] / LN;
  const shade = new Float32Array(CH * CH);
  parentPort.on('message', ({ cx, cy }) => {
    try {
      const r = bakeChunk(M, cx, cy, { quality: 1, seed: workerData.seed, lowMem: false, artPx: 2, scratch: false }, cache, providers);
      const g = r.g, col = g.col, nrm = g.nrm, z = g.z, flag = g.flag;
      let tall = 0;
      for (let i = 0; i < CH * CH; i++) if (z[i] > tall) tall = z[i];
      for (let y = 0; y < CH; y++) for (let x = 0; x < CH; x++) {
        const i = y * CH + x, j = i * 4;
        let lam = LZ;
        if (nrm[j + 3]) { const nx = nrm[j] / 127.5 - 1, ny = nrm[j + 1] / 127.5 - 1, nz = nrm[j + 2] / 127.5 - 1; lam = Math.max(0, nx * LX + ny * LY + nz * LZ); }
        let k = 0.58 + 0.52 * lam;
        if (flag[i] & F_WATER) k = 0.96 + 0.08 * lam;
        else if (tall > 6) {
          const z0 = z[i];
          for (let d = 2; d <= 40; d += 2) {
            const sx = x - d, sy = y - d;
            if (sx < 0 || sy < 0) break;
            if (z[sy * CH + sx] > z0 + d * 1.1 + 3) { k *= 0.7; break; }
          }
        }
        shade[i] = k;
      }
      const px = new Uint8Array(CS * CS * 3);
      for (let by = 0; by < CS; by++) for (let bx = 0; bx < CS; bx++) {
        let R = 0, G = 0, B = 0;
        for (let y = by * S; y < by * S + S; y++) for (let x = bx * S; x < bx * S + S; x++) {
          const i = y * CH + x, j = i * 4, k = shade[i];
          R += col[j] * k; G += col[j + 1] * k; B += col[j + 2] * k;
        }
        const o = (by * CS + bx) * 3, q = S * S;
        px[o] = Math.min(255, R / q); px[o + 1] = Math.min(255, G / q); px[o + 2] = Math.min(255, B / q);
      }
      parentPort.postMessage({ cx, cy, px }, [px.buffer]);
    } catch (e) { parentPort.postMessage({ cx, cy, error: String((e && e.stack) || e).slice(0, 400) }); }
  });
  parentPort.postMessage({ ready: true });
}
