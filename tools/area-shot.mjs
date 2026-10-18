// Pictures of the world as the game draws it: World v3 built as the server builds it, then the chunks over each asked
// rectangle baked by the page's own chunk bake (client/art2/game/chunkbake.js) and shrunk, lit by an afternoon sun from
// the north-west (as tools/world3-hub-map.mjs lights its stations). For checking a place as it's built.
//   node tools/area-shot.mjs --rect x0,y0,x1,y1 [--s 4] [--out file.png] [--night] [--rect ... --s ... --out ...]
// (rect in frame tiles; s: world px per picture px - 2 close up, 4 a few blocks, 8 a district; several rects share one
// world build; --night: after dark - a moonlit ambient, the lamps' and the signs' pools of light, what glows; --cut b: as
// seen from inside walk-in building b, cut away round its room - the chunks the page bakes while you stand in it). Heavy:
// run it under `flock /tmp/cla-heavy.lock`; python3 with PIL writes the PNGs.
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
  else if (a === '--night' && shots.length) shots[shots.length - 1].night = true;
  else if (a === '--cut' && shots.length) shots[shots.length - 1].cut = +v;
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
const lightsOf = new Map();
let cut = -1;   // (the walk-in the shot is from inside of: its chunks baked cut away, as host.js asks for them)
const chunk = (cx, cy) => { const k = cy * 1000 + cx + (cut + 1) * 1e6; let g = baked.get(k); if (!g) { const r = bakeChunk(M, cx, cy, cut >= 0 ? { ...opt, cutaway: cut } : opt, cache, providers); g = r.g; lightsOf.set(k, r.lights || []); baked.set(k, g); if (baked.size > 160) baked.delete(baked.keys().next().value); } return g; };
for (const sh of shots) {
  cut = sh.cut >= 0 ? sh.cut : -1;
  const S = sh.s, [x0, y0, x1, y1] = sh.rect.map((v) => v * TILE);
  const GW = Math.ceil((x1 - x0) / S), GH = Math.ceil((y1 - y0) / S), img = Buffer.alloc(GW * GH * 3);
  const cx0 = Math.floor(x0 / CHP), cy0 = Math.floor(y0 / CHP), cx1 = Math.floor((x1 - 1) / CHP), cy1 = Math.floor((y1 - 1) / CHP);
  // after dark: the lamps' and the signs' light splatted at the picture's scale (the game's Lighter, roughly)
  let LM = null;
  if (sh.night) {
    LM = new Float32Array(GW * GH * 3);
    for (let cy = cy0 - 1; cy <= cy1 + 1; cy++) for (let cx = cx0 - 1; cx <= cx1 + 1; cx++) {
      chunk(cx, cy);
      for (const L of lightsOf.get(cy * 1000 + cx + (cut + 1) * 1e6) || []) {
        const R = L.r * (L.kind === 'window' ? 0.8 : 1), k = (L.k || 1) * (L.kind === 'neon' ? 0.55 : L.kind === 'window' ? 0.35 : 0.5), c = L.col || [1, 0.85, 0.6];
        const px0 = Math.max(0, Math.floor((L.x - R - x0) / S)), px1 = Math.min(GW - 1, Math.ceil((L.x + R - x0) / S));
        const py0 = Math.max(0, Math.floor((L.y - R - y0) / S)), py1 = Math.min(GH - 1, Math.ceil((L.y + R - y0) / S));
        for (let py = py0; py <= py1; py++) for (let px = px0; px <= px1; px++) {
          const d = Math.hypot(x0 + px * S - L.x, y0 + py * S - L.y) / R;
          if (d >= 1) continue;
          const a = (1 - d) * (1 - d) * k, o = (py * GW + px) * 3;
          LM[o] += c[0] * a; LM[o + 1] += c[1] * a; LM[o + 2] += c[2] * a;
        }
      }
    }
  }
  for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
    const g = chunk(cx, cy), col = g.col, nrm = g.nrm, flag = g.flag, emi = g.emi;
    const ox = cx * CHP, oy = cy * CHP;
    for (let py = Math.max(0, Math.ceil((oy - y0) / S)); py < GH; py++) {   // (a picture pixel straddling two chunks: averaged over the first one's part)
      const wy = y0 + py * S; if (wy >= oy + CHP) break;
      for (let px = Math.max(0, Math.ceil((ox - x0) / S)); px < GW; px++) {
        const wx = x0 + px * S; if (wx >= ox + CHP) break;
        let R = 0, G = 0, B = 0, q = 0;
        for (let y = wy - oy; y < Math.min(CHP, wy - oy + S); y++) for (let x = wx - ox; x < Math.min(CHP, wx - ox + S); x++) {
          const i = y * CHP + x, j = i * 4;
          let lam = LZ;
          if (nrm[j + 3]) { const nx = nrm[j] / 127.5 - 1, ny = nrm[j + 1] / 127.5 - 1, nz = nrm[j + 2] / 127.5 - 1; lam = Math.max(0, nx * LX + ny * LY + nz * LZ); }
          if (LM) {   // (moonlight, a little of the sky in the water; what glows on its own)
            const e = emi ? emi[j + 3] / 255 : 0, mk = 0.13 + 0.1 * lam;
            R += col[j] * mk * 0.85 + (e ? emi[j] * e * 1.25 : 0); G += col[j + 1] * mk * 0.9 + (e ? emi[j + 1] * e * 1.25 : 0); B += col[j + 2] * mk * 1.35 + (e ? emi[j + 2] * e * 1.25 : 0); q++;
            continue;
          }
          const k = flag[i] & F_WATER ? 0.96 + 0.08 * lam : 0.58 + 0.52 * lam;
          R += col[j] * k; G += col[j + 1] * k; B += col[j + 2] * k; q++;
        }
        const o = (py * GW + px) * 3;
        if (LM) {   // (the light falls on what's there: the pixel's own colour lit, plus a little bloom)
          let r0 = 0, g0 = 0, b0 = 0, n0 = 0;
          for (let y = wy - oy; y < Math.min(CHP, wy - oy + S); y++) for (let x = wx - ox; x < Math.min(CHP, wx - ox + S); x++) { const j = (y * CHP + x) * 4; r0 += col[j]; g0 += col[j + 1]; b0 += col[j + 2]; n0++; }
          r0 /= n0; g0 /= n0; b0 /= n0;
          R = R / q + r0 * LM[o] * 1.1 + 40 * LM[o]; G = G / q + g0 * LM[o + 1] * 1.1 + 40 * LM[o + 1]; B = B / q + b0 * LM[o + 2] * 1.1 + 40 * LM[o + 2]; q = 1;
        }
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
