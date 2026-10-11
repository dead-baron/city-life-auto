// World v3's main line (docs/WORLD-V3.md 8.10, H33): pictures of its stations through the game's chunk bake - the hub's
// platforms side by side, the station building, the footbridges, the turnouts and diamonds of its junction - at 1/4 (a
// pixel is 4 world px: the double track's two tracks 24 px apart). One world build, then a block of chunks round each
// station asked for (by the name the skeleton gives it), lit as tools/world3-world-map.mjs lights its regions.
//   node tools/world3-hub-map.mjs [--hub Northshore] [--hub "Dry Creek"] [--span 3200]
//   -> docs/world-v3-hub-<name>.png (heavy: run it under `flock /tmp/cla-heavy.lock`)
import { writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const imp = (f) => import(pathToFileURL(join(ROOT, f)).href);
const hubs = []; for (let i = 0; i < process.argv.length; i++) if (process.argv[i] === '--hub') hubs.push(process.argv[i + 1]);
if (!hubs.length) hubs.push('Northshore');
const si = process.argv.indexOf('--span'), SPAN = si >= 0 ? +process.argv[si + 1] : 3200;
const t0 = Date.now(), log = (s) => console.log(`[${((Date.now() - t0) / 1000).toFixed(0)} s] ${s}`);

const { buildWorld3 } = await imp('server/world3.js');
const { TILE, CHUNK_TILES } = await imp('shared/constants.js');
const { map: M } = await buildWorld3(1337, { log: () => {} });
log('the world built');
const { bakeChunk, loadProviders, SpriteCache, providers } = await imp('client/art2/game/chunkbake.js');
const { F_WATER } = await imp('client/art2/gbuf.js');
await loadProviders();
const cache = new SpriteCache(200e6), opt = { quality: 1, seed: 1337, lowMem: false, artPx: 2, scratch: false };
const CHP = CHUNK_TILES * TILE, S = 4, CS = CHP / S;
const Lv = [-0.42, -0.5, 0.76], LN = Math.hypot(...Lv), LX = Lv[0] / LN, LY = Lv[1] / LN, LZ = Lv[2] / LN;
for (const name of hubs) {
  let h = (M.railHubs || []).find((q) => q.name === `${name} Station`);
  // (8.16: a subway stop - `--hub Downtown`, `--hub "Lakeview Subway"`: its kiosk on its plaza, its stops on both tracks)
  const subSts = (M.rails || []).filter((r) => r.subway).flatMap((r) => r.stations.filter((st) => st.name === `${name} Station`).map((st) => [r, st]));
  if (!h && subSts.length) {
    const [r0, st0] = subSts[0], k = st0.kiosk;
    h = { x: k ? k.x0 + k.w / 2 : st0.x, y: k ? k.y0 + k.h / 2 : st0.y, services: [r0.subway], calls: [], kiosk: k };
  }
  if (!h) { log(`no station ${name}`); continue; }
  const sts = h.kiosk !== undefined ? subSts.map(([, st]) => st) : h.calls.map(([ri, k]) => M.rails[ri].stations[k]);
  const cx0 = Math.floor((h.x - SPAN / 2) / CHP), cy0 = Math.floor((h.y - SPAN / 2) / CHP), cx1 = Math.floor((h.x + SPAN / 2) / CHP), cy1 = Math.floor((h.y + SPAN / 2) / CHP);
  const GW = (cx1 - cx0 + 1) * CS, GH = (cy1 - cy0 + 1) * CS, img = Buffer.alloc(GW * GH * 3);
  for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
    const g = bakeChunk(M, cx, cy, opt, cache, providers).g, col = g.col, nrm = g.nrm, flag = g.flag;
    for (let by = 0; by < CS; by++) for (let bx = 0; bx < CS; bx++) {
      let R = 0, G = 0, B = 0;
      for (let y = by * S; y < by * S + S; y++) for (let x = bx * S; x < bx * S + S; x++) {
        const i = y * CHP + x, j = i * 4;
        let lam = LZ;
        if (nrm[j + 3]) { const nx = nrm[j] / 127.5 - 1, ny = nrm[j + 1] / 127.5 - 1, nz = nrm[j + 2] / 127.5 - 1; lam = Math.max(0, nx * LX + ny * LY + nz * LZ); }
        const k = flag[i] & F_WATER ? 0.96 + 0.08 * lam : 0.58 + 0.52 * lam;
        R += col[j] * k; G += col[j + 1] * k; B += col[j + 2] * k;
      }
      const o = (((cy - cy0) * CS + by) * GW + (cx - cx0) * CS + bx) * 3, q = S * S;
      img[o] = Math.min(255, R / q); img[o + 1] = Math.min(255, G / q); img[o + 2] = Math.min(255, B / q);
    }
  }
  // the marks: the station building (white ring), each loop's platform (its middle: yellow), the switches (cyan: a
  // turnout's points, magenta: its frog, orange: a diamond)
  const ox = cx0 * CHP, oy = cy0 * CHP, marks = [];
  marks.push([h.x, h.y, 255, 255, 255, 7]);
  for (const st of sts) marks.push([st.platform.x, st.platform.y, 255, 220, 0, 4]);
  // (8.16: the subway lines below ground, dotted in their colours - Line 1 pink, Line 2 yellow - and their stops, pink rings)
  for (const r of (M.rails || []).filter((q) => q.subway)) {
    const [cr, cg, cb] = r.subway === 'Subway Line 1' ? [255, 105, 180] : [255, 230, 40];
    r.pts.forEach((p, i) => { if (p.under && i % 6 < 3) marks.push([p.x, p.y, cr, cg, cb, 0.5]); });
    if (h.kiosk !== undefined) for (const st of r.stations) marks.push([st.x, st.y, 255, 105, 180, 6]);
  }
  for (const w of M.railSwitches || []) { if (w.kind === 'turnout') { marks.push([w.x, w.y, 0, 230, 255, 3]); marks.push([w.fx, w.fy, 255, 0, 255, 3]); } else marks.push([w.x, w.y, 255, 140, 0, 3]); }
  for (const [x, y, r, gg, b, rad] of marks) {
    const px = Math.round((x - ox) / S), py = Math.round((y - oy) / S);
    for (let a = 0; a < 64; a++) { const qx = Math.round(px + Math.cos(a / 64 * 6.283) * rad), qy = Math.round(py + Math.sin(a / 64 * 6.283) * rad); if (qx < 0 || qy < 0 || qx >= GW || qy >= GH) continue; const o = (qy * GW + qx) * 3; img[o] = r; img[o + 1] = gg; img[o + 2] = b; }
  }
  const OUT = join(ROOT, `docs/world-v3-hub-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.png`), tmp = OUT + '.rgb';
  writeFileSync(tmp, img);
  const title = h.kiosk !== undefined ? `World v3: ${name} Station (${h.services.join(', ')}) through the chunk bake at 1/4; white: its kiosk, yellow: the stairs' mouth, pink rings: the stops below (both tracks), dotted: the subways below ground (Line 1 pink, Line 2 yellow)`
    : `World v3: ${name} Station through the chunk bake at 1/4 - ${h.services.join(', ')} (${sts.length} loops); white: the building, yellow: the platforms, cyan/magenta: a turnout's points/frog, orange: a diamond`;
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
  log(`${OUT}: ${sts.map((st) => `${Math.round(st.platform.x / TILE)},${Math.round(st.platform.y / TILE)}`).join(' ')}`);
}
// the numbers: every station's loops and how far its platforms spread; the switches; the bores
for (const h of M.railHubs || []) {
  const sts = h.calls.map(([ri, k]) => M.rails[ri].stations[k]);
  let far = 0; for (const st of sts) far = Math.max(far, Math.hypot(st.platform.x - h.x, st.platform.y - h.y));
  console.log(`${h.name}: ${h.services.join(', ')} - ${sts.length} loops, platforms within ${Math.round(far)} px of the building, ${h.bridges.length} footbridges`);
}
const sw = M.railSwitches || [];
console.log(`switches: ${sw.filter((w) => w.kind === 'turnout').length} turnouts, ${sw.filter((w) => w.kind === 'diamond').length} diamonds`);
console.log(`rail bores: ${(M.tunnels || []).filter((t) => t.kind === 'rail').map((t) => `${t.rail}:${Math.round(t.len / TILE)} tiles`).join(', ')}`);
