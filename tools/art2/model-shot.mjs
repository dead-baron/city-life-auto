// Still pictures of the moving things' models as the game makes their sprites (client/art2/game/actors.js): vehicles at a
// few headings, a horse's gait frames, aircraft - lit by an afternoon sun from the north-west (as tools/area-shot.mjs),
// laid out in rows on a grey ground. For checking a model as it's built; python3 with PIL writes the PNG.
//   node tools/art2/model-shot.mjs --out file.png [--scale 2] row [row ...]
// a row: veh:<id>[:paint][:variant][:lights]   heading by heading round the clock (8 of 32)
//        horse:<coat kind, e.g. s0 or c3>:<pose>[:dir8]   every frame of that pose
//        air:<id>[:livery]   heading by heading
import { writeFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const A = await import('../../client/art2/game/actors.js');
const { VEHICLES, PAINTS } = await import('../../shared/vehicles.js');
A.artFrom({ fleet: () => import('../../client/art2/fleet.js'), horse: () => import('../../client/art2/horse.js') });
await A.loadArt();
let out = 'model-shot.png', scale = 2;
const rows = [];
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a === '--out') out = process.argv[++i];
  else if (a === '--scale') scale = +process.argv[++i];
  else rows.push(a);
}
const Lv = [-0.42, -0.5, 0.76], LN = Math.hypot(...Lv), LX = Lv[0] / LN, LY = Lv[1] / LN, LZ = Lv[2] / LN;
const sprites = [];
for (const r of rows) {
  const [k, id, a1, a2, a3] = r.split(':');
  const row = [];
  if (k === 'veh') {
    const def = VEHICLES[id], p = a1 ? PAINTS.indexOf(a1.startsWith('#') ? a1 : '#' + a1) : 1;
    for (let h = 0; h < 32; h += 4) row.push(A.vehicleSprite({ m: def.i, p: p < 0 ? 1 : p, vr: +(a2 || 0) }, { lights: a3 === 'l' }, h, 32));
  } else if (k === 'horse') {
    const n = A.ANIMAL_FRAMES[a1] || 1;
    for (let f = 0; f < n; f++) row.push(A.animalSprite(`horse:${id}`, a1, +(a2 ?? 6), f));
  } else if (k === 'air') {
    const AM = await import('../../client/art2/aircraft.js');
    for (let h = 0; h < 32; h += 4) row.push(AM.bodySprite(id, h, 32, 2, 1, false, +(a1 || 0)));
  }
  sprites.push(row);
}
const pad = 6, rowH = sprites.map((row) => Math.max(...row.map((g) => g.h)) + pad), W = Math.max(...sprites.map((row) => row.reduce((s, g) => s + g.w + pad, pad)));
const H = rowH.reduce((s, h) => s + h, pad), img = Buffer.alloc(W * H * 3);
for (let i = 0; i < W * H; i++) { img[i * 3] = 112; img[i * 3 + 1] = 118; img[i * 3 + 2] = 108; }
let oy = pad;
sprites.forEach((row, ri) => {
  let ox = pad;
  for (const g of row) {
    for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) {
      const j = (y * g.w + x) * 4;
      if (g.col[j + 3] < 128) continue;
      let lam = LZ;
      if (g.nrm[j + 3]) { const nx = g.nrm[j] / 127.5 - 1, ny = g.nrm[j + 1] / 127.5 - 1, nz = g.nrm[j + 2] / 127.5 - 1; lam = Math.max(0, nx * LX + ny * LY + nz * LZ); }
      const kk = 0.58 + 0.52 * lam, e = g.emi ? g.emi[j + 3] / 255 : 0, o = ((oy + y) * W + ox + x) * 3;
      for (let c = 0; c < 3; c++) img[o + c] = Math.min(255, g.col[j + c] * kk + (e ? g.emi[j + c] * e * 0.6 : 0));
    }
    ox += g.w + pad;
  }
  oy += rowH[ri];
});
const tmp = out + '.rgb';
writeFileSync(tmp, img);
const r = spawnSync('python3', ['-c', `
from PIL import Image
im = Image.frombytes('RGB', (${W}, ${H}), open(${JSON.stringify(tmp)}, 'rb').read())
im.resize((${W * scale}, ${H * scale}), Image.NEAREST).save(${JSON.stringify(out)})
`], { stdio: 'inherit' });
rmSync(tmp, { force: true });
if (r.status !== 0) throw new Error('python3 + PIL could not write the PNG');
console.log(`${out} (${W} x ${H}, x${scale})`);
