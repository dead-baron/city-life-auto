// World v3 (docs/WORLD-V3.md 8.4): the picture of Metro City + Southbank built at its gulf place - Step B, scale 1.15 on
// the v3 frame's land (shared/world3-land.js) - drawn as the world map draws (tools/build-worldmap2.mjs: the game's own
// chunk bake, lit by an afternoon sun from the north-west with soft shadows, shrunk 16 times: a pixel is half a tile),
// beside today's Metro City cut from the world map's own tiles (assets/map) at the same scale.
//   node --expose-gc tools/world3-place-map.mjs [--out docs/world-v3-metro.png] [--scale 1.15]
// (heavy: today's world, the land, the place in the v3 frame, then every chunk of it baked on one thread - run it
// under `flock /tmp/cla-heavy.lock`; python3 with PIL writes the PNG)
import { writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const imp = (f) => import(pathToFileURL(join(ROOT, f)).href);
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const OUT = join(ROOT, arg('--out', 'docs/world-v3-metro.png'));
const S = 16, CH = 768, CS = CH / S, SEED = 1337;
const gc = globalThis.gc || (() => {});
const t0 = Date.now();
const log = (s) => console.log(`[${((Date.now() - t0) / 1000).toFixed(0)} s] ${s}`);

const { generateCity } = await imp('shared/map.js');
await imp('shared/world3-islands.js');
const { buildLand3 } = await imp('shared/world3-land.js');
const { ISLANDS } = await imp('shared/world3-skeleton.js');
const { TILE } = await imp('shared/constants.js');
const { bakeChunk, loadProviders, SpriteCache, providers } = await imp('client/art2/game/chunkbake.js');
const { F_WATER } = await imp('client/art2/gbuf.js');
const pic = ISLANDS.find((I) => I.key === 'metro').picture;
const scale = +arg('--scale', String(pic.scale));

let world = generateCity(SEED);
const L = buildLand3(world);
world = null; gc(); gc();
log('the land');
const M = generateCity(SEED, { island: 'metro', frame: { w: L.w, h: L.h }, place: { at: pic.at, scale, from: pic.from }, land: L });
log(`the place built (${M.w} x ${M.h})`);
// the place's rectangle: its land and a margin, in chunks of 24 tiles
let x0 = M.w, y0 = M.h, x1 = 0, y1 = 0;
for (let y = 0; y < M.h; y++) for (let x = 0; x < M.w; x++) if (M.land[y * M.w + x]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
const CT = CH / TILE;
const cx0 = Math.floor((x0 - 12) / CT), cy0 = Math.floor((y0 - 12) / CT), cx1 = Math.ceil((x1 + 12) / CT), cy1 = Math.ceil((y1 + 12) / CT);
const GW = (cx1 - cx0) * CS, GH = (cy1 - cy0) * CS;
const img = Buffer.alloc(GW * GH * 3);
await loadProviders();
const cache = new SpriteCache(200e6);
const Lv = [-0.42, -0.5, 0.76], LN = Math.hypot(...Lv), LX = Lv[0] / LN, LY = Lv[1] / LN, LZ = Lv[2] / LN;
const shade = new Float32Array(CH * CH);
let seaPx = null, n = 0;
const deep = (cx, cy) => { for (let ty = cy * CT - 2; ty < cy * CT + CT + 2; ty++) for (let tx = cx * CT - 2; tx < cx * CT + CT + 2; tx++) { if (tx < 0 || ty < 0 || tx >= M.w || ty >= M.h) continue; if (M.land[ty * M.w + tx] || M.river[ty * M.w + tx]) return false; } return true; };
for (let cy = cy0; cy < cy1; cy++) for (let cx = cx0; cx < cx1; cx++) {
  let px;
  if (seaPx && deep(cx, cy)) px = seaPx;
  else {
    const r = bakeChunk(M, cx, cy, { quality: 1, seed: SEED, lowMem: false, artPx: 2, scratch: false }, cache, providers);
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
        for (let d = 2; d <= 40; d += 2) { const sx = x - d, sy = y - d; if (sx < 0 || sy < 0) break; if (z[sy * CH + sx] > z0 + d * 1.1 + 3) { k *= 0.7; break; } }
      }
      shade[i] = k;
    }
    px = Buffer.alloc(CS * CS * 3);
    for (let by = 0; by < CS; by++) for (let bx = 0; bx < CS; bx++) {
      let R = 0, G = 0, B = 0;
      for (let y = by * S; y < by * S + S; y++) for (let x = bx * S; x < bx * S + S; x++) { const i = y * CH + x, j = i * 4, k = shade[i]; R += col[j] * k; G += col[j + 1] * k; B += col[j + 2] * k; }
      const o = (by * CS + bx) * 3, q = S * S;
      px[o] = Math.min(255, R / q); px[o + 1] = Math.min(255, G / q); px[o + 2] = Math.min(255, B / q);
    }
    if (!seaPx && deep(cx, cy)) seaPx = px;
    if (++n % 50 === 0) log(`${n} chunks baked`);
  }
  const ox = (cx - cx0) * CS, oy = (cy - cy0) * CS;
  for (let y = 0; y < CS; y++) px.copy(img, ((oy + y) * GW + ox) * 3, y * CS * 3, (y + 1) * CS * 3);
}
log(`${n} chunks baked; the place's picture ${GW} x ${GH}`);
// today's Metro City from the world map's tiles (assets/map: meta's corner x0, y0 in world px, 1/16, 512 px tiles)
const meta = JSON.parse(readFileSync(join(ROOT, 'assets/map/meta.json'), 'utf8'));
const tx0 = Math.round((pic.from[0] * TILE - meta.x0) / S) - 12, ty0 = Math.round((pic.from[1] * TILE - meta.y0) / S) - 12;
const tw = Math.round((pic.from[2] - pic.from[0]) * TILE / S) + 24, th = Math.round((pic.from[3] - pic.from[1]) * TILE / S) + 24;
const tmp = OUT + '.rgb';
writeFileSync(tmp, img);
const py = `
from PIL import Image, ImageEnhance, ImageDraw
W, H, d = ${GW}, ${GH}, ${JSON.stringify(join(ROOT, 'assets/map'))}
im = Image.frombytes('RGB', (W, H), open(${JSON.stringify(tmp)}, 'rb').read())
im = ImageEnhance.Contrast(ImageEnhance.Color(im).enhance(1.12)).enhance(1.04)
T, x0, y0, w, h = ${meta.tile}, ${tx0}, ${ty0}, ${tw}, ${th}
today = Image.new('RGB', (w, h))
for r in range(y0 // T, (y0 + h) // T + 1):
    for c in range(x0 // T, (x0 + w) // T + 1):
        try: t = Image.open(f'{d}/t/{c}_{r}.webp').convert('RGB')
        except Exception: continue
        today.paste(t, (c * T - x0, r * T - y0))
pad = 24
out = Image.new('RGB', (w + W + 3 * pad, max(h, H) + 2 * pad + 20), (24, 26, 30))
out.paste(today, (pad, pad + 20)); out.paste(im, (w + 2 * pad, pad + 20))
dr = ImageDraw.Draw(out)
dr.text((pad, 8), "Today's Metro City (the world map, 1/16)", fill=(235, 235, 235))
dr.text((w + 2 * pad, 8), "Metro City + Southbank at its gulf place, scale ${scale} (the chunk bake, 1/16)", fill=(235, 235, 235))
out.save(${JSON.stringify(OUT)})
print(out.size)
`;
const r = spawnSync('python3', ['-c', py], { stdio: 'inherit' });
rmSync(tmp, { force: true });
if (r.status !== 0) throw new Error('python3 + PIL could not write the PNG');
log(`${OUT}`);
