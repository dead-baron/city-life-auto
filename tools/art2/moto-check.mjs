// Builds every motorcycle model (MC1, task #366) and prints its size, voxel count and anchors: a quick check that the
// builder runs and each bike has a body, two (or three) wheels, a seat and lamps. node tools/art2/moto-check.mjs
import { vehicleModel, vehicleAnchors, MOTO } from '../../client/art2/vehicles.js';

for (const t of [...MOTO, 'bike']) {
  const m = vehicleModel(t, { variant: 3 });
  let n = 0;
  for (let i = 0; i < m.v.length; i++) if (m.v[i]) n++;
  const a = vehicleAnchors(t);
  console.log(t.padEnd(11), `${m.w}x${m.d}x${m.h}`.padEnd(10), String(n).padStart(6), 'vox', 'seat', a.seat && a.seat.map((v) => +v.toFixed(1)).join(','), 'head', a.head.length, 'tail', a.tail.length, 'siren', a.siren.length);
  if (n < 400) throw new Error(`${t}: only ${n} voxels`);
}
