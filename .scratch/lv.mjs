import { buildWorld3 } from '../server/world3.js';
import { cutWorld } from '../server/worldcdn.js';
import { assembleCity, readIndex, regionsNear, windowRect } from '../shared/regionpack.js';
import { cityFromData } from '../shared/mapcore.js';
import { TILE } from '../shared/constants.js';
const { map: M } = await buildWorld3(1337, { log: () => {} });
const n0 = M.levels.segs.length, nf = M.levels.segs.filter((s) => s.foot).length;
console.log('segs', n0, 'foot', nf, 'grid refs ok?', [...M.levels.grid.values()].every((l) => l.every((i) => M.levels.segs[i])));
const cut = cutWorld(M, {});
const X = readIndex(cut.pack.index), frame = X.frame;
const keys = cut.pack.regions.map((r) => r.key);
for (const h of M.railHubs.filter((q) => (q.bridges || []).some((f) => f.ends))) {
  const f = h.bridges.find((q) => q.ends), tx = Math.floor(f.x / TILE), ty = Math.floor(f.y / TILE);
  const near = regionsNear(frame, tx, ty), files = near.map((k) => cut.pack.regions.find((r) => r.key === k).bytes);
  const C = cityFromData(assembleCity(cut.pack.index, files, { window: windowRect(frame, near) }));
  const L = C.levels; let bad = 0, badAt = null;
  for (const [k, l] of L.grid) for (const i of l) if (!L.segs[i]) { bad++; const cy = Math.floor(k / 4096), cx = k - cy * 4096; if (Math.hypot(cx * 256 - f.x, cy * 256 - f.y) < 1500 && !badAt) badAt = [i, M.levels.segs[i]]; }
  console.log(h.name, 'missing refs', bad, badAt ? JSON.stringify(badAt).slice(0, 300) : '');
}
