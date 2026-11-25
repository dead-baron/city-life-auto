// The near-black census: World v3 built as the server builds it, the chunks over each asked rectangle baked by the
// page's own bake, every pixel lit as the game lights it at noon (lightgame.js PRESETS_GAME.noon, no cast shadows) -
// the share that comes out near-black (under 50 of 255), and a picture with those pixels in magenta, so what is
// still painted too dark can be found by eye and by number (the owner, 11-25: the darkness on trees and plants).
//   node tools/nature/darkscan.mjs [--sites] --rect x0,y0,x1,y1 [--out f.png] [--rect ...]
// (rect in frame tiles; --sites lists the world's site kinds with a tile of each). Heavy: under flock /tmp/cla-heavy.lock.
import { writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const ROOT = fileURLToPath(new URL('../..', import.meta.url)), imp = (f) => import(pathToFileURL(join(ROOT, f)).href);
const shots = []; let sites = false;
for (let i = 2; i < process.argv.length; i++) { const a = process.argv[i], v = process.argv[i + 1]; if (a === '--rect') shots.push({ rect: v.split(',').map(Number), out: null }); else if (a === '--out' && shots.length) shots[shots.length - 1].out = v; else if (a === '--sites') sites = true; }
const { buildWorld3 } = await imp('server/world3.js');
const { TILE, CHUNK_TILES } = await imp('shared/constants.js');
const { map: M } = await buildWorld3(1337, { log: () => {} });
if (sites) { const seen = new Map(); for (const s of M.sites || []) { const k = s.kind || s.type || '?'; if (!seen.has(k)) seen.set(k, [0, s]); seen.get(k)[0]++; } console.log([...seen].map(([k, [n, s]]) => `${k} x${n} @${Math.round((s.x ?? s.tx * TILE) / TILE)},${Math.round((s.y ?? s.ty * TILE) / TILE)}${s.name ? ' ' + s.name : ''}`).join('\n')); }
const { bakeChunk, loadProviders, SpriteCache, providers } = await imp('client/art2/game/chunkbake.js');
const { F_WATER, F_LEAF } = await imp('client/art2/gbuf.js');
const { PRESETS_GAME } = await imp('client/art2/game/lightgame.js');
await loadProviders();
const P = PRESETS_GAME.noon, sl = Math.hypot(...P.sunDir), sun = P.sunDir.map((v) => v / sl);
const cache = new SpriteCache(300e6), opt = { quality: 1, seed: 1337, lowMem: false, artPx: 2, scratch: false }, CHP = CHUNK_TILES * TILE;
const GAM = new Float32Array(256); for (let i = 0; i < 256; i++) GAM[i] = Math.pow(i / 255, 2.2);
for (const sh of shots) {
  const [x0, y0, x1, y1] = sh.rect.map((v) => v * TILE), S = 2, GW = Math.ceil((x1 - x0) / S), GH = Math.ceil((y1 - y0) / S), img = Buffer.alloc(GW * GH * 3);
  let n = 0, dark = 0, leafN = 0, leafD = 0, upN = 0, upD = 0;
  for (let cy = Math.floor(y0 / CHP); cy <= Math.floor((y1 - 1) / CHP); cy++) for (let cx = Math.floor(x0 / CHP); cx <= Math.floor((x1 - 1) / CHP); cx++) {
    const g = bakeChunk(M, cx, cy, opt, cache, providers).g, ox = cx * CHP, oy = cy * CHP;
    for (let wy = Math.max(y0, oy); wy < Math.min(y1, oy + CHP); wy += S) for (let wx = Math.max(x0, ox); wx < Math.min(x1, ox + CHP); wx += S) {
      const i = (wy - oy) * CHP + wx - ox, j = i * 4, o = (((wy - y0) / S | 0) * GW + ((wx - x0) / S | 0)) * 3;
      let nx = 0, ny = 0, nz = 1;
      if (g.nrm[j + 3]) { nx = g.nrm[j] / 127.5 - 1; ny = g.nrm[j + 1] / 127.5 - 1; nz = g.nrm[j + 2] / 127.5 - 1; const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l; }
      const d = Math.max(0, nx * sun[0] + ny * sun[1] + nz * sun[2]), kk = nz * 0.5 + 0.5; let L = 0; const c3 = [0, 0, 0];
      for (let c = 0; c < 3; c++) { let v = GAM[g.col[j + c]] * (P.ambGround[c] + (P.ambSky[c] - P.ambGround[c]) * kk + P.sunCol[c] * d); v = v / (1 + v * 0.18); c3[c] = Math.pow(v, 1 / 2.2) * 255; }
      L = c3[0] * 0.3 + c3[1] * 0.59 + c3[2] * 0.11;
      const water = g.flag[i] & F_WATER, isDark = !water && L < 50;
      if (!water) { n++; if (isDark) dark++; if (g.flag[i] & F_LEAF) { leafN++; if (isDark) leafD++; } if (g.z && g.z[i] > 6) { upN++; if (isDark) upD++; } }
      if (isDark) { img[o] = 255; img[o + 1] = 0; img[o + 2] = 255; } else { img[o] = Math.min(255, c3[0]); img[o + 1] = Math.min(255, c3[1]); img[o + 2] = Math.min(255, c3[2]); }
    }
  }
  const pc = (a, b) => (b ? (a / b * 100).toFixed(1) : '-') + '%';
  console.log(`tiles ${sh.rect.join(',')}: near-black ${pc(dark, n)} of the land's pixels (leaves ${pc(leafD, leafN)}, what stands up ${pc(upD, upN)}, the ground ${pc(dark - upD, n - upN)})`);
  if (sh.out) { const tmp = sh.out + '.rgb'; writeFileSync(tmp, img); spawnSync('python3', ['-c', `from PIL import Image\nImage.frombytes('RGB', (${GW}, ${GH}), open(${JSON.stringify(tmp)}, 'rb').read()).save(${JSON.stringify(sh.out)})`], { stdio: 'inherit' }); rmSync(tmp, { force: true }); }
}
