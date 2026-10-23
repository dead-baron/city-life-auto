// World v3b: where can you buy what? Builds the whole world as the server does (server/world3.js buildWorld3, as
// tools/world3b/check.mjs) and reports, district by district (shared/mapcore.js DISTRICTS, grouped by kind: the city,
// the towns, the beach towns, the villages, the wild land), how many places of each needed kind there are - weapons,
// equipment, food and everyday items, cash (ATMs and banks) - and how far the farthest bit of the district's streets is
// from the nearest of each (straight line, in tiles: the worst case, and the 95th percentile).
//   node --expose-gc tools/world3b/shops.mjs [out.json]   (heavy: under the heavy lock)
// shopCoverage(m) is the measure itself (the whole-world test calls it on the world it builds).
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { T, TILE } from '../../shared/constants.js';
import { DISTRICTS } from '../../shared/mapcore.js';
import { SHOP_NEEDS, NEED_KEYS, placeKind3 } from '../../shared/world3-shops.js';
import { clutterOn } from '../../shared/world3-clutter.js';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));

// The four needs and the place kinds that meet each (weapons, equipment, food and everyday items, cash), and the kind
// of place a district is (the city, a town, a beach town, a village, the wild land): shared/world3-shops.js, whose
// pass builds the world's shops by them.
export const NEEDS = SHOP_NEEDS;
export { NEED_KEYS };
export const districtKind = placeKind3;
export const BUILT_KINDS = new Set(['city', 'town', 'beach', 'village']);

// The exact Euclidean distance transform (Felzenszwalb & Huttenlocher) of a W x H grid whose sources are 0 and the rest
// Infinity, in place, squared distances (tiles).
function edt(g, W, H) {
  const n = Math.max(W, H), f = new Float64Array(n), d = new Float64Array(n), v = new Int32Array(n), z = new Float64Array(n + 1);
  const pass = (len) => {
    let k = 0; v[0] = 0; z[0] = -Infinity; z[1] = Infinity;
    for (let q = 1; q < len; q++) {
      if (f[q] === Infinity) continue;
      if (f[v[k]] === Infinity) { v[k] = q; continue; }
      let s;
      for (;;) { s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]); if (s > z[k] || k === 0) break; k--; }
      if (s <= z[k] && k === 0) { v[0] = q; z[0] = -Infinity; z[1] = Infinity; continue; }
      k++; v[k] = q; z[k] = s; z[k + 1] = Infinity;
    }
    if (f[v[0]] === Infinity) { for (let q = 0; q < len; q++) d[q] = Infinity; return; }
    k = 0;
    for (let q = 0; q < len; q++) { while (z[k + 1] < q) k++; const r = q - v[k]; d[q] = r * r + f[v[k]]; }
  };
  for (let x = 0; x < W; x++) { for (let y = 0; y < H; y++) f[y] = g[y * W + x]; pass(H); for (let y = 0; y < H; y++) g[y * W + x] = d[y]; }
  for (let y = 0; y < H; y++) { const r = y * W; for (let x = 0; x < W; x++) f[x] = g[r + x]; pass(W); for (let x = 0; x < W; x++) g[r + x] = d[x]; }
}

// a POI's district (the tile it stands on)
const distOf = (m, p) => { const tx = Math.floor(p.x / TILE), ty = Math.floor(p.y / TILE); return m.inside(tx, ty) ? m.dist[m.idx(tx, ty)] : -1; };

// -> { districts: [{ d, name, kind, streets, count: { need: n }, worst: { need: tiles }, at: { need: [tx, ty] } (the worst street tile), p95: { need: tiles }, shops: [[kind, label]] }],
//      groups: { kind: { districts, missing: { need: n }, worst: { need: tiles } } } }
// streets: the district's road and pavement tiles (not a highway's at-grade lanes: no shop fronts a highway).
export function shopCoverage(m) {
  const W = m.w, H = m.h, N = W * H;
  const byNeed = {};
  for (const k of NEED_KEYS) byNeed[k] = m.pois.filter((p) => NEEDS[k].includes(p.kind));
  // the street tiles of each district, once
  const nd = DISTRICTS.length, streets = new Uint32Array(nd), street = new Uint8Array(N);
  for (let ty = 0; ty < H; ty++) {
    const r = m.row(ty);
    for (let tx = 0; tx < W; tx++) {
      const i = r + m.col(tx), t = m.tiles[i];
      if ((t === T.ROAD || t === T.SIDEWALK) && m.roadRank[i] !== 3) { street[i] = 1; streets[m.dist[i]]++; }
    }
  }
  const rows = DISTRICTS.map((D, d) => ({ d, name: D.name, kind: districtKind(d), streets: streets[d], count: {}, worst: {}, p95: {}, shops: [] }));
  for (const p of m.pois) {
    if (!NEED_KEYS.some((k) => NEEDS[k].includes(p.kind)) || p.kind === 'atm') continue;
    const d = distOf(m, p);
    if (d >= 0 && rows[d]) rows[d].shops.push([p.kind, p.label]);
  }
  const g = new Float32Array(N), hist = new Map();
  for (const k of NEED_KEYS) {
    g.fill(Infinity);
    for (const p of byNeed[k]) {
      const d = distOf(m, p);
      if (d >= 0 && rows[d]) rows[d].count[k] = (rows[d].count[k] || 0) + 1;
      const tx = Math.floor(p.x / TILE), ty = Math.floor(p.y / TILE);
      if (m.inside(tx, ty)) g[m.idx(tx, ty)] = 0;
    }
    edt(g, W, H);
    // each district's distances along its streets: the worst, and the 95th percentile (a histogram by whole tiles)
    hist.clear();
    const far = new Map();   // (district -> [tiles, i]: its worst street tile)
    for (let i = 0; i < N; i++) {
      if (!street[i]) continue;
      const d = m.dist[i], e = Math.min(4000, Math.round(Math.sqrt(g[i])));
      let h = hist.get(d); if (!h) hist.set(d, (h = new Uint32Array(4001)));
      h[e]++;
      const f = far.get(d); if (!f || e > f[0]) far.set(d, [e, i]);
    }
    for (const [d, [, i]] of far) (rows[d].at ||= {})[k] = [(m.x0 || 0) + i % W, (m.y0 || 0) + Math.floor(i / W)];
    for (const [d, h] of hist) {
      const n = streets[d]; let acc = 0, p95 = -1, worst = 0;
      for (let e = 0; e <= 4000; e++) { if (!h[e]) continue; acc += h[e]; worst = e; if (p95 < 0 && acc >= n * 0.95) p95 = e; }
      rows[d].worst[k] = worst; rows[d].p95[k] = p95;
    }
  }
  for (const r of rows) for (const k of NEED_KEYS) r.count[k] = r.count[k] || 0;
  const districts = rows.filter((r) => r.streets > 0 && r.kind !== 'none');
  const groups = {};
  for (const r of districts) {
    const G = (groups[r.kind] ||= { districts: 0, missing: {}, worst: {} });
    G.districts++;
    for (const k of NEED_KEYS) {
      if (!r.count[k]) G.missing[k] = (G.missing[k] || 0) + 1;
      G.worst[k] = Math.max(G.worst[k] || 0, r.worst[k] ?? 0);
    }
  }
  return { districts, groups };
}

// the homes as a list to compare builds by: [id, building, x, y, price]
export const homesList = (m) => (m.homes || []).map((h) => [h.id, h.b ?? -1, Math.round(h.x), Math.round(h.y), h.price]);

export function printCoverage(cov, log = console.log) {
  const pad = (s, n) => String(s).padEnd(n), num = (v) => String(v ?? '-').padStart(5);
  log(`${pad('district', 24)}${pad('kind', 8)}${pad('streets', 9)}` + NEED_KEYS.map((k) => `${k.slice(0, 5)} n/worst/p95`.padStart(20)).join(''));
  const order = ['city', 'town', 'beach', 'village', 'wild'];
  for (const kind of order) for (const r of cov.districts.filter((q) => q.kind === kind)) {
    log(`${pad(`${r.d} ${r.name}`, 24)}${pad(r.kind, 8)}${pad(r.streets, 9)}` + NEED_KEYS.map((k) => `${num(r.count[k])}${num(r.worst[k])}${num(r.p95[k])}`.padStart(20)).join(''));
  }
  for (const kind of order) { const G = cov.groups[kind]; if (G) log(`${kind}: ${G.districts} districts; without one of their own: ${JSON.stringify(G.missing)}; worst street (tiles): ${JSON.stringify(G.worst)}`); }
}

// the places the shops pass added (shared/world3-shops.js: own: 1), by district: [district, kind, label]
export const newShops = (m) => m.pois.filter((p) => p.own).map((p) => { const tx = Math.floor(p.x / TILE), ty = Math.floor(p.y / TILE); return [DISTRICTS[m.dist[m.idx(tx, ty)]]?.name, p.kind, p.label]; });

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { buildWorld3 } = await import(join(ROOT, 'server/world3.js'));
  const { map: m, ms } = await buildWorld3(1337);
  const cov = shopCoverage(m);
  printCoverage(cov);
  const kinds = {};
  for (const p of m.pois) kinds[p.kind] = (kinds[p.kind] || 0) + 1;
  const clutter = clutterOn(m), byWhy = {};
  for (const c of clutter) byWhy[`${c.t} ${c.why}`] = (byWhy[`${c.t} ${c.why}`] || 0) + 1;
  console.log('the shops pass:', JSON.stringify(m.world3?.shops || null), 'station ATMs:', m.world3?.stationAtms ?? null);
  console.log('the clutter guard:', JSON.stringify(m.world3?.clutter || null));
  console.log('still blocking (road, pavement, alley, track, platform, door):', clutter.length, JSON.stringify(byWhy));
  if (process.argv[2]) {
    writeFileSync(process.argv[2], JSON.stringify({ ms, pois: kinds, homes: homesList(m), coverage: cov, shops: newShops(m), clutter }, null, 1));
    console.log('written', process.argv[2]);
  }
}
