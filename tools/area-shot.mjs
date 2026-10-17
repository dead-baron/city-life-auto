// Pictures of the world as the game draws it: World v3 built as the server builds it, then the chunks over each asked
// rectangle baked by the page's own chunk bake (client/art2/game/chunkbake.js) and shrunk, lit by an afternoon sun from
// the north-west (as tools/world3-hub-map.mjs lights its stations). For checking a place as it's built.
//   node tools/area-shot.mjs --rect x0,y0,x1,y1 [--s 4] [--out file.png] [--rect ... --s ... --out ...]
// (rect in frame tiles; s: world px per picture px - 2 close up, 4 a few blocks, 8 a district; several rects share one
// world build). Heavy: run it under `flock /tmp/cla-heavy.lock`; python3 with PIL writes the PNGs.
import { writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const imp = (f) => import(pathToFileURL(join(ROOT, f)).href);
const shots = [];
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i], v = process.argv[i + 1];
  if (a === '--rect') shots.push({ rect: v.split(',').map(Number), s: 4, out: null });
  else if (a === '--s' && shots.length) shots[shots.length - 1].s = +v;
  else if (a === '--out' && shots.length) shots[shots.length - 1].out = v;
  else if (a === '--title' && shots.length) shots[shots.length - 1].title = v;
}
if (!shots.length) { console.log('usage: node tools/area-shot.mjs --rect x0,y0,x1,y1 [--s 4] [--out file.png]'); process.exit(1); }
const t0 = Date.now(), log = (s) => console.log(`[${((Date.now() - t0) / 1000).toFixed(0)} s] ${s}`);

const { buildWorld3 } = await imp('server/world3.js');
const { TILE, CHUNK_TILES } = await imp('shared/constants.js');
const { map: M } = await buildWorld3(1337, { log: () => {} });
log('the world built');
const { bakeChunk, loadProviders, SpriteCache, providers } = await imp('client/art2/game/chunkbake.js');
const { F_WATER } = await imp('client/art2/gbuf.js');
await loadProviders();
const cache = new SpriteCache(300e6), opt = { quality: 1, seed: 1337, lowMem: false, artPx: 2, scratch: false };
const CHP = CHUNK_TILES * TILE;
const Lv = [-0.42, -0.5, 0.76], LN = Math.hypot(...Lv), LX = Lv[0] / LN, LY = Lv[1] / LN, LZ = Lv[2] / LN;
const baked = new Map();
const chunk = (cx, cy) => { const k = cy * 1000 + cx; let g = baked.get(k); if (!g) { g = bakeChunk(M, cx, cy, opt, cache, providers).g; baked.set(k, g); if (baked.size > 160) baked.delete(baked.keys().next().value); } return g; };
for (const sh of shots) {
  const S = sh.s, [x0, y0, x1, y1] = sh.rect.map((v) => v * TILE);
  const GW = Math.ceil((x1 - x0) / S), GH = Math.ceil((y1 - y0) / S), img = Buffer.alloc(GW * GH * 3);
  const cx0 = Math.floor(x0 / CHP), cy0 = Math.floor(y0 / CHP), cx1 = Math.floor((x1 - 1) / CHP), cy1 = Math.floor((y1 - 1) / CHP);
  for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
    const g = chunk(cx, cy), col = g.col, nrm = g.nrm, flag = g.flag;
    const ox = cx * CHP, oy = cy * CHP;
    for (let py = Math.max(0, Math.floor((oy - y0) / S)); py < GH; py++) {
      const wy = y0 + py * S; if (wy >= oy + CHP) break;
      for (let px = Math.max(0, Math.floor((ox - x0) / S)); px < GW; px++) {
        const wx = x0 + px * S; if (wx >= ox + CHP) break;
        let R = 0, G = 0, B = 0, q = 0;
        for (let y = wy - oy; y < Math.min(CHP, wy - oy + S); y++) for (let x = wx - ox; x < Math.min(CHP, wx - ox + S); x++) {
          const i = y * CHP + x, j = i * 4;
          let lam = LZ;
          if (nrm[j + 3]) { const nx = nrm[j] / 127.5 - 1, ny = nrm[j + 1] / 127.5 - 1, nz = nrm[j + 2] / 127.5 - 1; lam = Math.max(0, nx * LX + ny * LY + nz * LZ); }
          const k = flag[i] & F_WATER ? 0.96 + 0.08 * lam : 0.58 + 0.52 * lam;
          R += col[j] * k; G += col[j + 1] * k; B += col[j + 2] * k; q++;
        }
        const o = (py * GW + px) * 3;
        img[o] = Math.min(255, R / q); img[o + 1] = Math.min(255, G / q); img[o + 2] = Math.min(255, B / q);
      }
    }
  }
  const OUT = sh.out || join(ROOT, `area-${sh.rect.join('_')}.png`), tmp = OUT + '.rgb';
  writeFileSync(tmp, img);
  const title = sh.title || `tiles ${sh.rect.join(', ')} at 1/${S}`;
  const r = spawnSync('python3', ['-c', `
from PIL import Image, ImageDraw
im = Image.frombytes('RGB', (${GW}, ${GH}), open(${JSON.stringify(tmp)}, 'rb').read())
out = Image.new('RGB', (${GW} + 16, ${GH} + 30), (24, 26, 30))
out.paste(im, (8, 24))
ImageDraw.Draw(out).text((8, 6), ${JSON.stringify(title)}, fill=(235, 235, 235))
out.save(${JSON.stringify(OUT)})
`], { stdio: 'inherit' });
  rmSync(tmp, { force: true });
  if (r.status !== 0) throw new Error('python3 + PIL could not write the PNG');
  log(`${OUT} (${GW} x ${GH})`);
}
