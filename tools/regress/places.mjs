// The fixed set of places re-rendered before and after any world or art change (the owner, 11-21 14:03: "I spend a lot
// of usage catching issues that broke when another fixed, or fixes that weren't applied across the world"; the pre-beta
// handover's "Two checks worth building first", package 5). Writes tools/regress/places.json from one world build:
//   - every district's middle (a block or two round it) - each district and biome once;
//   - one of each kind of place the owner has sent notes about: a hospital of each size, a police station, a bank, a
//     casino, a station, a marina, a ferry pier, a beach, a hot spring, a waterfall, a cave mouth, a skate park, a farm,
//     a gas station, a motel, a campground - the first of each kind in the world's own order (stable run to run);
//   - the hand-made places the owner names often (Summit Tarn, the sea cave, Coral Cay's falls) by their POI names.
// Rects are in frame tiles (tools/area-shot.mjs --rect). Re-run this only when the list itself should change: the point
// of the list is that it stays the same, so before and after compare place by place.
//   node tools/regress/places.mjs            (heavy: one world build; under flock /tmp/cla-heavy.lock)
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
process.chdir(ROOT);
const { buildWorld3 } = await import(join(ROOT, 'server/world3.js'));
const { DISTRICTS } = await import(join(ROOT, 'shared/map.js'));
const { TILE } = await import(join(ROOT, 'shared/constants.js'));
const { map: M } = await buildWorld3(1337, { log: () => {} });

const out = [], seen = new Set();
const box = (id, why, x, y, hw = 30, hh = 20) => {   // (x, y in world px -> a rect of frame tiles round it)
  const tx = Math.round(x / TILE), ty = Math.round(y / TILE), key = `${Math.round(tx / 20)},${Math.round(ty / 20)}`;
  if (seen.has(key)) return;   // (two picks a screen apart: one picture)
  seen.add(key);
  out.push({ id, why, rect: [tx - hw, ty - hh, tx + hw, ty + hh] });
};
// every district's middle
const acc = new Map();
for (let ty = M.y0; ty < M.y0 + M.h; ty += 4) for (let tx = M.x0; tx < M.x0 + M.w; tx += 4) {
  if (!M.inside(tx, ty)) continue;
  const d = M.dist[M.idx(tx, ty)];
  if (d === 13 || !DISTRICTS[d]) continue;
  const a = acc.get(d) || acc.set(d, [0, 0, 0]).get(d);
  a[0] += tx; a[1] += ty; a[2]++;
}
for (const [d, [x, y, n]] of [...acc].sort((a, b) => a[0] - b[0])) {
  const tx = Math.round(x / n), ty = Math.round(y / n);
  if (!M.inside(tx, ty) || M.dist[M.idx(tx, ty)] !== d) continue;   // (scattered over islets: its middle is at sea)
  box(`district-${DISTRICTS[d].name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`, `the middle of ${DISTRICTS[d].name}`, (tx + 0.5) * TILE, (ty + 0.5) * TILE);
}
// one of each kind of place
const KINDS = ['hospital', 'police', 'bank', 'casino', 'station', 'marina', 'ferry', 'beach', 'hotspring', 'falls', 'cave', 'skatepark', 'farm', 'gasstation', 'motel', 'campground', 'clothing', 'convenience', 'bar', 'arcade', 'cinema', 'bowling', 'golf', 'tennis', 'pool'];
for (const k of KINDS) {
  const list = M.pois.filter((p) => p && p.kind === k);
  if (!list.length) continue;
  const big = k === 'hospital' ? list.filter((p) => /General|Medical/.test(p.label || '')) : [];
  for (const p of [list[0], ...big.slice(0, 2)]) box(`${k}-${String(p.label || p.name || p.id).toLowerCase().replace(/[^a-z0-9]+/g, '-')}`, `${k}: ${p.label || p.name || ''}`, p.x, p.y, 24, 16);
}
// the hand-made places named in his notes
for (const re of [/summit tarn/i, /sea cave/i, /coral cay/i, /redwood cove/i, /greenfield park/i, /st\. neon/i]) {
  const p = M.pois.find((q) => q && re.test(q.label || q.name || ''));
  if (p) box(`named-${String(p.label || p.name).toLowerCase().replace(/[^a-z0-9]+/g, '-')}`, `named: ${p.label || p.name}`, p.x, p.y, 24, 16);
}
writeFileSync(join(ROOT, 'tools/regress/places.json'), JSON.stringify({ seed: 1337, note: 'frame-tile rects for tools/area-shot.mjs; keep stable - see places.mjs', places: out }, null, 1) + '\n');
console.log(`${out.length} places -> tools/regress/places.json`);
