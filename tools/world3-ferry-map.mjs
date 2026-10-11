// World v3's ferries (docs/WORLD-V3.md 8.17, H42): pictures of their stops through the game's chunk bake - a terminal's
// deck, waiting room, gangway and pier head, the car ferry's ramp and lot, a water bus's pontoon - at 1/4 (a pixel is 4
// world px), lit as tools/world3-hub-map.mjs lights its stations. One world build, then the chunks round each stop asked
// for (by the name shared/world3-ferries.js FERRY3 gives it); the boat that calls there drawn as its outline where it
// lies (white) and its turning point (yellow), the way out to the next stop (cyan) from the server's planner.
//   node tools/world3-ferry-map.mjs [--stop Westport] [--stop "Port Westport"] [--span 1600]
//   -> docs/world-v3-ferry-<name>.png (heavy: run it under `flock /tmp/cla-heavy.lock`)
import { writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const imp = (f) => import(pathToFileURL(join(ROOT, f)).href);
const names = []; for (let i = 0; i < process.argv.length; i++) if (process.argv[i] === '--stop') names.push(process.argv[i + 1]);
if (!names.length) names.push('Westport', 'Port Westport', 'Willow Crossing');
const si = process.argv.indexOf('--span'), SPAN = si >= 0 ? +process.argv[si + 1] : 1600;
const t0 = Date.now(), log = (s) => console.log(`[${((Date.now() - t0) / 1000).toFixed(0)} s] ${s}`);

const { buildWorld3 } = await imp('server/world3.js');
const { TILE, CHUNK_TILES } = await imp('shared/constants.js');
const { ferryRoutes } = await imp('server/systems/ferries.js');
const { map: M } = await buildWorld3(1337, { log: () => {} });
log('the world built');
const routes = ferryRoutes({ map: M });
const { bakeChunk, loadProviders, SpriteCache, providers } = await imp('client/art2/game/chunkbake.js');
const { F_WATER } = await imp('client/art2/gbuf.js');
await loadProviders();
const cache = new SpriteCache(200e6), opt = { quality: 1, seed: 1337, lowMem: false, artPx: 2, scratch: false };
const CHP = CHUNK_TILES * TILE, S = 4, CS = CHP / S;
const Lv = [-0.42, -0.5, 0.76], LN = Math.hypot(...Lv), LX = Lv[0] / LN, LY = Lv[1] / LN, LZ = Lv[2] / LN;
for (const name of names) {
  let R = null, k = -1;
  for (const q of routes) { const j = q.stops.findIndex((s) => s.name === name); if (j >= 0) { R = q; k = j; break; } }
  let e = R ? R.stops[k] : null;
  if (!R) {   // (a stop whose route found no way: the pier alone)
    const F = (M.world3.ferries || []).find((q) => q.stops.some((st) => st.name === name)), st = F && F.stops.find((q) => q.name === name);
    if (!st) { log(`no stop ${name}`); continue; }
    e = { sx: st.x, sy: st.y, x: st.x + st.ox * 124, y: st.y + st.oy * 124, a: Math.atan2(st.oy, st.ox), kind: st.kind, turn: null };
    R = { name: F.name, car: F.car, legs: [] };
    log(`${name}: ${F.name} has no way planned - the pier alone`);
  }
  const cx = (e.sx + e.x) / 2, cy = (e.sy + e.y) / 2;
  const cx0 = Math.floor((cx - SPAN / 2) / CHP), cy0 = Math.floor((cy - SPAN / 2) / CHP), cx1 = Math.floor((cx + SPAN / 2) / CHP), cy1 = Math.floor((cy + SPAN / 2) / CHP);
  const GW = (cx1 - cx0 + 1) * CS, GH = (cy1 - cy0 + 1) * CS, img = Buffer.alloc(GW * GH * 3);
  for (let by0 = cy0; by0 <= cy1; by0++) for (let bx0 = cx0; bx0 <= cx1; bx0++) {
    const g = bakeChunk(M, bx0, by0, opt, cache, providers).g, col = g.col, nrm = g.nrm, flag = g.flag;
    for (let by = 0; by < CS; by++) for (let bx = 0; bx < CS; bx++) {
      let r = 0, gg = 0, b = 0;
      for (let y = by * S; y < by * S + S; y++) for (let x = bx * S; x < bx * S + S; x++) {
        const i = y * CHP + x, j = i * 4;
        let lam = LZ;
        if (nrm[j + 3]) { const nx = nrm[j] / 127.5 - 1, ny = nrm[j + 1] / 127.5 - 1, nz = nrm[j + 2] / 127.5 - 1; lam = Math.max(0, nx * LX + ny * LY + nz * LZ); }
        const kk = flag[i] & F_WATER ? 0.96 + 0.08 * lam : 0.58 + 0.52 * lam;
        r += col[j] * kk; gg += col[j + 1] * kk; b += col[j + 2] * kk;
      }
      const o = (((by0 - cy0) * CS + by) * GW + (bx0 - cx0) * CS + bx) * 3, q = S * S;
      img[o] = Math.min(255, r / q); img[o + 1] = Math.min(255, gg / q); img[o + 2] = Math.min(255, b / q);
    }
  }
  // the marks: the boat's outline where it lies (white), its turning point (yellow), the way on (cyan)
  const ox = cx0 * CHP, oy = cy0 * CHP, dot = (x, y, c) => { const px = Math.round((x - ox) / S), py = Math.round((y - oy) / S); if (px < 0 || py < 0 || px >= GW || py >= GH) return; const o = (py * GW + px) * 3; img[o] = c[0]; img[o + 1] = c[1]; img[o + 2] = c[2]; };
  const dims = R.car ? { L: 470, W: 150 } : { L: 240, W: 76 }, ca = Math.cos(e.a), sa = Math.sin(e.a);
  for (let t = -1; t <= 1; t += 0.01) for (const sd of [-1, 1]) { dot(e.x + ca * t * dims.L / 2 - sa * sd * dims.W / 2, e.y + sa * t * dims.L / 2 + ca * sd * dims.W / 2, [255, 255, 255]); dot(e.x + ca * sd * dims.L / 2 - sa * t * dims.W / 2, e.y + sa * sd * dims.L / 2 + ca * t * dims.W / 2, [255, 255, 255]); }
  if (e.turn) for (let a = 0; a < 64; a++) dot(e.turn.x + Math.cos(a / 64 * 6.283) * 20, e.turn.y + Math.sin(a / 64 * 6.283) * 20, [255, 220, 0]);
  const leg = R.legs.find((L) => L.from === k) || R.legs.find((L) => L.to === k);
  const way = leg ? (leg.from === k ? leg.ways[0] : leg.ways[1]) : [{ x: e.x, y: e.y, s: 0 }];
  for (let s = 0; s < Math.min(way[way.length - 1].s, SPAN); s += 8) { let p = way[0]; for (let i = 1; i < way.length; i++) if (way[i].s >= s) { const a = way[i - 1], u = (s - a.s) / Math.max(1e-6, way[i].s - a.s); p = { x: a.x + (way[i].x - a.x) * u, y: a.y + (way[i].y - a.y) * u }; break; } dot(p.x, p.y, [0, 230, 255]); }
  const OUT = join(ROOT, `docs/world-v3-ferry-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.png`), tmp = OUT + '.rgb';
  writeFileSync(tmp, img);
  const title = `World v3: the ${R.name} at ${name} (${e.kind}) through the chunk bake at 1/4; white: the boat where it lies, yellow: its turning point, cyan: the way on`;
  const r = spawnSync('python3', ['-c', `
from PIL import Image, ImageDraw
im = Image.frombytes('RGB', (${GW}, ${GH}), open(${JSON.stringify(tmp)}, 'rb').read())
out = Image.new('RGB', (${GW} + 32, ${GH} + 48), (24, 26, 30))
out.paste(im, (16, 40))
ImageDraw.Draw(out).text((16, 12), ${JSON.stringify(title)}, fill=(235, 235, 235))
out.save(${JSON.stringify(OUT)})
`], { stdio: 'inherit' });
  rmSync(tmp, { force: true });
  if (r.status !== 0) throw new Error('python3 + PIL could not write the PNG');
  log(`${OUT}: ${e.kind} at ${Math.round(e.sx / TILE)},${Math.round(e.sy / TILE)}`);
}
