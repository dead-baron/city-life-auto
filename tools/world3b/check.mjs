// World v3b: build the whole world as the server does (server/world3.js buildWorld3) and check it - the time and the
// memory, what was built (POIs by kind, homes, the districts' buildings), the level crossings and where they are, the
// airstrips, the ferries, the roads' loose ends - and draw it: the tiles at 2 tiles a pixel (roads, buildings, water,
// fields, sand, dirt), the rail on top, the level crossings ringed.
//   node --expose-gc tools/world3b/check.mjs [out-dir]   (heavy: under the heavy lock)
//   -> <out>/check.json, <out>/world.png (3276 x 2016), <out>/world-<quarter>.png
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const OUT = process.argv[2] || join(ROOT, 'docs/world-v3b');
mkdirSync(OUT, { recursive: true });
const { buildWorld3 } = await import(join(ROOT, 'server/world3.js'));
const { T, TILE } = await import(join(ROOT, 'shared/constants.js'));
const { DISTRICTS, mapSignature } = await import(join(ROOT, 'shared/mapcore.js'));
const { map: m, ms, rssMB, peakMB } = await buildWorld3(1337);
const W = m.w, H = m.h, S = 2;
const out = { ms, rssMB, peakMB, sig: mapSignature(m), w: W, h: H };
// what was built
const byKind = {};
for (const p of m.pois) byKind[p.kind] = (byKind[p.kind] || 0) + 1;
out.pois = byKind;
out.homes = (m.homes || []).length;
out.buildings = m.buildings.length;
out.props = m.props.length;
const perDist = {};
for (const b of m.buildings) {
  if (!b) continue;
  const d = m.dist[m.idx(b.tx, b.ty)];
  const n = DISTRICTS[d] ? DISTRICTS[d].name : String(d);
  perDist[n] = (perDist[n] || 0) + 1;
}
out.buildingsByDistrict = perDist;
out.natureSites = (m.natureSites || []).filter((s) => s.kind === 'airstrip').map((s) => ({ name: s.name, strip: s.strip, duster: !!s.duster }));
out.ferries = (m.world3?.ferries || []).map((f) => `${f.name}: ${(f.stops || []).map((s) => s.name + (s.built === false ? ' (not built)' : '')).join(', ')}`);
out.roads = m.world3?.roads ? { loose: m.world3.roads.loose, carried: (m.world3.roads.carried || []).length } : null;
const xs = [];
for (const R of m.rails || []) for (const c of R.crossings || []) xs.push({ rail: R.name, x: Math.round(c.x / TILE), y: Math.round(c.y / TILE), d: DISTRICTS[m.dist[m.idx(Math.floor(c.x / TILE), Math.floor(c.y / TILE))]]?.name });
out.levelCrossings = xs.length;
const xd = {};
for (const c of xs) xd[c.d] = (xd[c.d] || 0) + 1;
out.levelCrossingsByDistrict = xd;
out.stations = (m.railHubs || []).map((h) => h.name);
// diagnostics: the airstrips' ground, a district's buildings' spots, the clubs by district
const { AIRSTRIPS3 } = await import(join(ROOT, 'shared/world3-wild.js'));
out.stripGround = AIRSTRIPS3.map((A) => { const [x0, y0, x1, y1] = A.runway, c = {}; for (let ty = y0; ty < y1; ty++) for (let tx = x0; tx < x1; tx++) { const t = m.tiles[m.idx(tx, ty)]; c[t] = (c[t] || 0) + 1; } return { name: A.name, tiles: c }; });
const spotsOf = (name) => m.buildings.filter((b) => b && DISTRICTS[m.dist[m.idx(b.tx, b.ty)]]?.name === name).slice(0, 6).map((b) => [b.tx, b.ty, b.name || b.kind]);
out.liberty = spotsOf('Liberty Bay');
const clubs = {};
for (const p of m.pois) if (p.kind === 'club') { const n = DISTRICTS[m.dist[m.idx(Math.floor(p.x / TILE), Math.floor(p.y / TILE))]]?.name; clubs[n] = (clubs[n] || 0) + 1; }
out.clubsByDistrict = clubs;
// the road network's parts (union of the edges' ends): the biggest, and every other with its size and a named road in it
{
  const N = m.nodes.length, par = Array.from({ length: N }, (_, i) => i);
  const find = (i) => { while (par[i] !== i) { par[i] = par[par[i]]; i = par[i]; } return i; };
  for (const e of m.edges) if (e && e.a != null && e.b != null) { const a = find(e.a), b = find(e.b); if (a !== b) par[a] = b; }
  const parts = new Map();
  for (const e of m.edges) { if (!e) continue; const r = find(e.a); const P = parts.get(r) || { edges: 0, names: new Set(), x: Math.round(m.nodes[e.a].x / TILE), y: Math.round(m.nodes[e.a].y / TILE) }; P.edges++; if (e.name && P.names.size < 3) P.names.add(e.name); parts.set(r, P); }
  const L = [...parts.values()].sort((a, b) => b.edges - a.edges);
  out.roadParts = { count: L.length, biggest: L[0] ? L[0].edges : 0, others: L.slice(1, 40).map((P) => ({ edges: P.edges, at: [P.x, P.y], names: [...P.names] })) };
}
writeFileSync(join(OUT, 'check.json'), JSON.stringify({ ...out, crossings: xs }, null, 1));
console.log(JSON.stringify(out, null, 1).slice(0, 4000));
// the picture: a tile's colour, most telling tile of each 2 x 2
const COL = { [T.WALL]: [90, 90, 90], [T.GRASS]: [118, 150, 92], [T.SIDEWALK]: [196, 196, 188], [T.ROAD]: [62, 62, 66], [T.PLAZA]: [210, 200, 180], [T.BUILDING]: [150, 92, 70], [T.WATER]: [70, 140, 210], [T.DEEP]: [40, 90, 170], [T.SAND]: [226, 208, 150], [T.DOCK]: [140, 110, 80], [T.DIRT]: [160, 130, 90], [T.FIELD]: [196, 186, 96], [T.BRIDGE]: [120, 120, 130], [T.LOT]: [120, 120, 124], [T.FLOOR]: [150, 92, 70], [T.COUNTER]: [150, 92, 70] };
const RANK = { [T.ROAD]: 9, [T.BRIDGE]: 9, [T.BUILDING]: 8, [T.SIDEWALK]: 6, [T.LOT]: 5, [T.PLAZA]: 5, [T.DOCK]: 5 };
const GW = Math.floor(W / S), GH = Math.floor(H / S), img = Buffer.alloc(GW * GH * 3);
for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
  let best = -1, t = T.DEEP;
  for (let dy = 0; dy < S; dy++) for (let dx = 0; dx < S; dx++) { const q = m.tiles[m.idx(x * S + dx, y * S + dy)]; const r = RANK[q] || 1; if (r > best) { best = r; t = q; } }
  const c = COL[t] || [255, 0, 255], o = (y * GW + x) * 3;
  img[o] = c[0]; img[o + 1] = c[1]; img[o + 2] = c[2];
}
const rails = (m.rails || []).map((R) => ({ name: R.name, pts: R.pts.filter((_, k) => k % 8 === 0).map((p) => [Math.round(p.x / TILE / S), Math.round(p.y / TILE / S), p.under ? 1 : 0]) }));
writeFileSync(join(OUT, 'world.rgb'), img);
writeFileSync(join(OUT, 'world-over.json'), JSON.stringify({ rails, xs: xs.map((c) => [c.x / S, c.y / S]), labels: Object.entries(m.mids || {}).slice(0, 0) }));
const py = `
import json
from PIL import Image, ImageDraw
W, H, d = ${GW}, ${GH}, ${JSON.stringify(OUT)}
im = Image.frombytes('RGB', (W, H), open(d + '/world.rgb', 'rb').read())
g = ImageDraw.Draw(im)
o = json.load(open(d + '/world-over.json'))
for R in o['rails']:
    P = R['pts']
    col = (240, 90, 200) if 'Pink' in R['name'] else (240, 210, 40) if 'Yellow' in R['name'] else (20, 20, 20)
    for a, b in zip(P, P[1:]):
        if abs(a[0]-b[0]) + abs(a[1]-b[1]) > 40: continue
        g.line([tuple(a[:2]), tuple(b[:2])], fill=col if not a[2] else (col[0]//2+100, col[1]//2+100, col[2]//2+100), width=2)
for x, y in o['xs']:
    g.ellipse([x-6, y-6, x+6, y+6], outline=(255, 0, 0), width=2)
im.save(d + '/world.png')
for name, box in {'nw': (0, 0, W//2, H//2), 'ne': (W//2, 0, W, H//2), 'sw': (0, H//2, W//2, H), 'se': (W//2, H//2, W, H)}.items():
    im.crop(box).save(d + '/world-' + name + '.png')
`;
const r = spawnSync('python3', ['-c', py], { stdio: 'inherit' });
if (r.status !== 0) throw new Error('python3 + PIL could not draw the picture');
console.log('pictures in', OUT);
