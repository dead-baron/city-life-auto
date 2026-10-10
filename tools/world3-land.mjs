// Draws World v3's land (shared/world3-land.js buildLand3) to docs/world-v3-land.png: 1 px = 2 m (2520 x 2016), the
// water in its shades, the biomes' ground, today's places in their district colours (district borders darker), and the
// skeleton's lines over it (highways orange, arterials cream, the main line green, the subways pink and yellow, the
// ferries pale; dashed in tunnels, cased white on bridges), the stations, towns and landmarks as dots.
// Prints the build's time and memory and the numbers docs/WORLD-V3.md 8.2 quotes.
//   node tools/world3-land.mjs [out.png]      (builds today's world first: a few seconds)
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { generateCity, DISTRICTS, WILD_DISTRICTS } from '../shared/map.js';
import { buildLand3, WATER3, TERRAIN3 } from '../shared/world3-land.js';
import { skeletonLines, STATIONS, TOWNS, LANDMARKS, BIOMES } from '../shared/world3-skeleton.js';

const out = process.argv[2] || 'docs/world-v3-land.png';
let t = performance.now();
const today = generateCity(1337);
const tToday = performance.now() - t;
const m0 = process.memoryUsage().rss;
t = performance.now();
const L = buildLand3(today);
const tLand = performance.now() - t;
const m1 = process.memoryUsage().rss;
const { land, water, biome, terrain, dist, zone } = L.layers;
const W = L.w, H = L.h, N = W * H;
const bytes = Object.values(L.layers).reduce((s, a) => s + a.byteLength, 0);
console.log(`today's world ${(tToday / 1000).toFixed(1)} s; buildLand3 ${(tLand / 1000).toFixed(2)} s; layers ${(bytes / 1e6).toFixed(0)} MB; rss +${((m1 - m0) / 1e6).toFixed(0)} MB (${(m1 / 1e6).toFixed(0)} MB)`);

// the numbers
const count = (arr, n) => { const c = new Array(n).fill(0); for (let i = 0; i < N; i++) c[arr[i]]++; return c; };
const km2 = (n) => (n / 1e6).toFixed(2);
const wc = count(water, 8), tc = count(terrain, 9), bc = count(biome, BIOMES.length + 1), dc = count(dist, 256), zc = count(zone, 32);
let nLand = 0;
for (let i = 0; i < N; i++) nLand += land[i];
console.log(`land ${km2(nLand)} km2 of ${km2(N)}; water:`, Object.entries(WATER3).filter(([k]) => k !== 'LAND').map(([k, v]) => `${k} ${km2(wc[v])}`).join(', '));
console.log('terrain (land):', Object.entries(TERRAIN3).map(([k, v]) => `${k} ${km2(tc[v])}`).join(', '));
console.log('biomes:', BIOMES.map((b, k) => `${b.key} ${km2(bc[k + 1])}`).join(', '));
const dname = (id) => (id >= 47 ? L.districts[id - 47].name : DISTRICTS[id]?.name);
console.log('districts (km2):', dc.map((n, id) => [id, n]).filter(([id, n]) => n && id !== 13).map(([id, n]) => `${id} ${dname(id)} ${km2(n)}`).join('; '));
console.log('zones (km2):', zc.map((n, id) => [id, n]).filter(([, n]) => n).map(([id, n]) => `${id}:${km2(n)}`).join(' '));

// --- the picture -------------------------------------------------------------------------------------------------------
const S = 2, PW = W / S, PH = H / S;
const img = new Uint8Array(PW * PH * 3);
const WATER_COL = { [WATER3.SEA]: [44, 96, 156], [WATER3.DEEP]: [31, 74, 128], [WATER3.LAKE]: [70, 140, 205], [WATER3.RIVER]: [70, 140, 205], [WATER3.CANAL]: [56, 118, 186], [WATER3.STREAM]: [96, 166, 220] };
const TERR_COL = { [TERRAIN3.GRASS]: [120, 138, 96], [TERRAIN3.FOREST]: [46, 102, 56], [TERRAIN3.DESERT]: [196, 108, 64], [TERRAIN3.ROCK]: [138, 136, 142], [TERRAIN3.SAND]: [214, 196, 140], [TERRAIN3.FARM]: [176, 172, 92], [TERRAIN3.MARSH]: [88, 128, 96], [TERRAIN3.SCRUB]: [150, 96, 70] };
const BIOME_GRASS = { sandpiper: [150, 140, 80], northshore: [110, 128, 96] };
// a colour per district (towns): hues round the wheel by the golden ratio, from the id
const hsl = (h, s, l) => {
  const f = (n) => { const k = (n + h * 12) % 12, a = s * Math.min(l, 1 - l); return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))); };
  return [f(0), f(8), f(4)];
};
const distCol = (id) => hsl((id * 0.618034) % 1, 0.55, 0.58);
const town = (id) => id < 47 && id !== 13 && (!WILD_DISTRICTS.has(id) || id === 27 || id === 26);   // (the airport and the port too)
for (let py = 0; py < PH; py++) for (let px = 0; px < PW; px++) {
  const x = px * S + 1, y = py * S + 1, i = y * W + x, o = (py * PW + px) * 3;
  let c;
  if (!land[i]) c = WATER_COL[water[i]] || [255, 0, 255];
  else if (town(dist[i])) {
    c = distCol(dist[i]);
    const r = x + S < W ? i + S : i, b = y + S < H ? i + S * W : i;
    if ((land[r] && dist[r] !== dist[i]) || (land[b] && dist[b] !== dist[i])) c = c.map((v) => v * 0.45);
  } else {
    c = TERR_COL[terrain[i]] || [255, 0, 255];
    if (terrain[i] === TERRAIN3.GRASS && biome[i]) c = BIOME_GRASS[BIOMES[biome[i] - 1].key] || c;
  }
  img[o] = c[0]; img[o + 1] = c[1]; img[o + 2] = c[2];
}
// lines: discs stamped along each segment (dashed in tunnels)
const disc = (cx, cy, r, col) => {
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
    if (x < 0 || y < 0 || x >= PW || y >= PH || (x - cx) ** 2 + (y - cy) ** 2 > r * r) continue;
    const o = (y * PW + x) * 3; img[o] = col[0]; img[o + 1] = col[1]; img[o + 2] = col[2];
  }
};
const stroke = (L, r, col, ranges, mode) => {
  const P = L.path.pts, Sx = L.path.s;
  for (let j = 1; j < P.length; j++) {
    const ax = P[j - 1][0], ay = P[j - 1][1], dx = P[j][0] - ax, dy = P[j][1] - ay, len = Math.sqrt(dx * dx + dy * dy);
    for (let u = 0; u <= len; u += 1) {
      const s = Sx[j - 1] + u, inT = L.tunnels.some(([a, b]) => s >= a && s <= b), onB = L.bridges.some(([a, b]) => s >= a && s <= b);
      if (mode === 'bridge' && !onB) continue;
      if (inT && Math.floor(s / 24) % 2) continue;
      disc((ax + dx * u / len) / S, (ay + dy * u / len) / S, r, inT ? col.map((v) => v * 0.75) : col);
    }
  }
};
const lines = skeletonLines();
const KIND = { ferry: [0.6, [225, 250, 255]], sub: [1.6, null], art: [1.5, [250, 244, 214]], main: [2, [40, 160, 60]], hwy: [3, [244, 152, 36]] };
for (const kind of ['ferry', 'sub', 'art', 'main', 'hwy']) {
  for (const Ln of lines.filter((l) => l.kind === kind)) {
    const [r, col0] = KIND[kind], col = col0 || (Ln.line.color === 'pink' ? [226, 70, 214] : [246, 214, 40]);
    if (kind !== 'ferry') { stroke(Ln, r + 1.2, [20, 20, 28]); stroke(Ln, r + 2, [250, 250, 250], null, 'bridge'); }
    stroke(Ln, r, col);
  }
}
for (const s of STATIONS) disc(s.at[0] / S, s.at[1] / S, 4, [20, 20, 28]), disc(s.at[0] / S, s.at[1] / S, 2.6, [255, 255, 255]);
for (const tw of TOWNS) disc(tw.at[0] / S, tw.at[1] / S, 6, [20, 20, 28]), disc(tw.at[0] / S, tw.at[1] / S, 4.5, [250, 230, 90]);
for (const lm of LANDMARKS) disc(lm.at[0] / S, lm.at[1] / S, 4, [250, 60, 50]), disc(lm.at[0] / S, lm.at[1] / S, 2, [255, 255, 255]);

// --- PNG ---------------------------------------------------------------------------------------------------------------
const crcT = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
const crc = (buf) => { let c = -1; for (let i = 0; i < buf.length; i++) c = crcT[(c ^ buf[i]) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
const chunk = (type, data) => {
  const b = Buffer.alloc(12 + data.length);
  b.writeUInt32BE(data.length, 0); b.write(type, 4, 'ascii'); Buffer.from(data).copy(b, 8);
  b.writeUInt32BE(crc(b.subarray(4, 8 + data.length)), 8 + data.length);
  return b;
};
const raw = Buffer.alloc((PW * 3 + 1) * PH);
for (let y = 0; y < PH; y++) { raw[y * (PW * 3 + 1)] = 0; Buffer.from(img.buffer, y * PW * 3, PW * 3).copy(raw, y * (PW * 3 + 1) + 1); }
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(PW, 0); ihdr.writeUInt32BE(PH, 4); ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
writeFileSync(out, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 6 })), chunk('IEND', Buffer.alloc(0))]));
console.log(`wrote ${out} (${PW} x ${PH})`);
