// World v2 top-down previews: the generated tile map as a PNG, so a layout can be judged without the
// browser. Tiles get a colour per type, roads are coloured by class along their centre lines, buildings
// are filled and outlined, points of interest are dots (hospitals red, police blue, shops orange, homes
// green ...). No dependencies (zlib is built into node).
//
//   node tools/world2/preview.mjs                      world-after.png (whole map, 1/2 px per tile) and
//                                                      core-after.png (Metro City, 1 px per tile)
//   node tools/world2/preview.mjs --tag before         ...-before.png
//   node tools/world2/preview.mjs --crop 640,420,1040,660 --scale 3 --name downtown
//                                                      one crop, scale px per tile, docs/world-v2/<name>.png
//   --out <dir> (default docs/world-v2)  --seed <n> (default 1337)  --root <checkout> (a different tree's
//   shared/map.js, e.g. a checkout of checkpoint-world-v1 for "before")
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const root = resolve(opt('root', new URL('../..', import.meta.url).pathname));
const out = resolve(opt('out', join(root, 'docs/world-v2')));
const seed = Number(opt('seed', 1337));
const tag = opt('tag', 'after');
mkdirSync(out, { recursive: true });

const { generateCity, ISLANDS } = await import(pathToFileURL(join(root, 'shared/map.js')).href);
const { T, TILE, MAP_W, MAP_H } = await import(pathToFileURL(join(root, 'shared/constants.js')).href);
const t0 = performance.now();
const m = generateCity(seed);
console.log(`generateCity(${seed}): ${Math.round(performance.now() - t0)} ms`);

// ---- colours ------------------------------------------------------------------------------------------
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const TILE_C = [];
TILE_C[T.WALL] = hex('#5a3a2a'); TILE_C[T.GRASS] = hex('#6f9a52'); TILE_C[T.SIDEWALK] = hex('#c9c3b5'); TILE_C[T.ROAD] = hex('#4a4c52');
TILE_C[T.PLAZA] = hex('#d8cfb8'); TILE_C[T.BUILDING] = hex('#9a8f84'); TILE_C[T.WATER] = hex('#3f78a8'); TILE_C[T.DEEP] = hex('#2a527a');
TILE_C[T.SAND] = hex('#e6d39a'); TILE_C[T.DOCK] = hex('#8a6a44'); TILE_C[T.DIRT] = hex('#a08260'); TILE_C[T.FIELD] = hex('#b8b05a');
TILE_C[T.BRIDGE] = hex('#6a6c72'); TILE_C[T.LOT] = hex('#7c7c80'); TILE_C[T.FLOOR] = hex('#b0a080'); TILE_C[T.COUNTER] = hex('#704830');
const ROAD_C = {
  hwy: hex('#e8603a'), ramp: hex('#f0a040'), ave: hex('#f2d24a'), blvd: hex('#f2b84a'), front: hex('#d89a50'), art: hex('#e6c070'),
  drive: hex('#c8d878'), st: hex('#e8e8e8'), minor: hex('#b8b8c8'), alley: hex('#8a6a5a'), rural: hex('#d0b080'), dirt: hex('#9a7a58'),
};
const POI_C = {
  hospital: hex('#ff3030'), reception: hex('#ff8080'), police: hex('#2a6aff'), evidence: hex('#6a9aff'), bank: hex('#20c060'), atm: hex('#60ff90'),
  home: hex('#60e040'), station: hex('#ffffff'), gang: hex('#a020ff'), club: hex('#ff40c0'), delivery: hex('#ffb040'),
};
const poiC = (k) => POI_C[k] || hex('#ff8a20');

// ---- raster ---------------------------------------------------------------------------------------------
function render(x0, y0, x1, y1, scale) {
  const W = Math.round((x1 - x0) * scale), H = Math.round((y1 - y0) * scale);
  const px = new Uint8Array(W * H * 3);
  const set = (X, Y, c, a = 1) => {
    if (X < 0 || Y < 0 || X >= W || Y >= H) return;
    const i = (Y * W + X) * 3;
    if (a >= 1) { px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2]; return; }
    px[i] = px[i] * (1 - a) + c[0] * a; px[i + 1] = px[i + 1] * (1 - a) + c[1] * a; px[i + 2] = px[i + 2] * (1 - a) + c[2] * a;
  };
  // tiles (sampled at each output pixel's centre)
  for (let Y = 0; Y < H; Y++) for (let X = 0; X < W; X++) {
    const tx = Math.floor(x0 + (X + 0.5) / scale), ty = Math.floor(y0 + (Y + 0.5) / scale);
    if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) continue;
    const t = m.tiles[ty * MAP_W + tx];
    let c = TILE_C[t] || [255, 0, 255];
    if (m.deck && m.deck[ty * MAP_W + tx] && (t === T.GRASS || t === T.LOT)) c = c.map((v) => v * 0.8);
    set(X, Y, c);
  }
  const toX = (wx) => (wx / TILE - x0) * scale, toY = (wy) => (wy / TILE - y0) * scale;
  const line = (a, b, c, w = 1, alpha = 1) => {
    const ax = toX(a.x), ay = toY(a.y), bx = toX(b.x), by = toY(b.y);
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) * 2));
    const r = Math.max(0, (w - 1) / 2);
    for (let k = 0; k <= n; k++) {
      const x = ax + (bx - ax) * k / n, y = ay + (by - ay) * k / n;
      for (let dy = -Math.ceil(r); dy <= Math.ceil(r); dy++) for (let dx = -Math.ceil(r); dx <= Math.ceil(r); dx++) if (dx * dx + dy * dy <= r * r + 0.25) set(Math.round(x + dx), Math.round(y + dy), c, alpha);
    }
  };
  // buildings: an outline round each footprint (fill comes from the tiles)
  const edgeC = hex('#2a2420');
  for (const b of m.buildings) {
    if (!b || b.gone) continue;
    if (b.tx + b.tw < x0 || b.tx > x1 || b.ty + b.th < y0 || b.ty > y1) continue;
    const X0 = Math.round((b.tx - x0) * scale), Y0 = Math.round((b.ty - y0) * scale), X1 = Math.round((b.tx + b.tw - x0) * scale) - 1, Y1 = Math.round((b.ty + b.th - y0) * scale) - 1;
    if (scale >= 1) {
      for (let X = X0; X <= X1; X++) { set(X, Y0, edgeC); set(X, Y1, edgeC); }
      for (let Y = Y0; Y <= Y1; Y++) { set(X0, Y, edgeC); set(X1, Y, edgeC); }
    }
    // the door side: a light tick on the front edge
    if (b.door && scale >= 2) { const dx = Math.round((b.door.tx + 0.5 - x0) * scale), dy = Math.round((b.door.ty + (b.door.ty >= b.ty + b.th ? 0 : 1) - y0) * scale); set(dx, dy, [255, 240, 120]); set(dx + 1, dy, [255, 240, 120]); }
  }
  // roads by class: centre lines (decks drawn last and wider)
  const order = (e) => (e.lvl === 1 ? 3 : e.lvl === 'ramp' ? 2 : 1);
  for (const e of [...m.edges].sort((a, b) => order(a) - order(b))) {
    const c = ROAD_C[e.kind] || [255, 255, 255];
    const w = e.lvl === 1 ? Math.max(1, 1.6 * scale) : Math.max(1, Math.min(2.5, scale * 0.7));
    for (let k = 0; k + 1 < e.pts.length; k++) line(e.pts[k], e.pts[k + 1], c, w, e.lvl === 0 ? 0.85 : 1);
  }
  // the railway (surface track dark, subway dotted)
  if (m.rail) for (let k = 0; k + 1 < m.rail.pts.length; k += 2) { const p = m.rail.pts[k], q = m.rail.pts[k + 1]; if (p.under) { if (k % 8 === 0) line(p, q, [30, 30, 30], 1); } else line(p, q, [40, 30, 30], Math.max(1, scale * 0.6)); }
  // points of interest
  const dot = (wx, wy, c, r) => { const cx = toX(wx), cy = toY(wy); for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (dx * dx + dy * dy <= r * r) set(Math.round(cx + dx), Math.round(cy + dy), c); };
  const r = scale >= 2 ? 2 : 1;
  for (const p of m.pois) { if (p.kind === 'atm' || p.kind === 'vending') continue; dot(p.x, p.y, [0, 0, 0], r + 1); dot(p.x, p.y, poiC(p.kind), r); }
  return { W, H, px };
}

// ---- PNG ------------------------------------------------------------------------------------------------
const CRC = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (buf) => { let c = 0xffffffff; for (const b of buf) c = CRC[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png({ W, H, px }) {
  const raw = Buffer.alloc((W * 3 + 1) * H);
  for (let y = 0; y < H; y++) { raw[y * (W * 3 + 1)] = 0; Buffer.from(px.buffer, y * W * 3, W * 3).copy(raw, y * (W * 3 + 1) + 1); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
const save = (name, img) => { const f = join(out, name); writeFileSync(f, png(img)); console.log(`${f} (${img.W}x${img.H})`); };

const crop = opt('crop', null);
if (crop) {
  const [cx0, cy0, cx1, cy1] = crop.split(',').map(Number);
  save(`${opt('name', 'crop')}.png`, render(cx0, cy0, cx1, cy1, Number(opt('scale', 2))));
} else {
  save(`world-${tag}.png`, render(0, 0, MAP_W, MAP_H, 0.5));
  const D = ISLANDS.D.box, R = ISLANDS.R.box; // Metro City and Southbank
  save(`core-${tag}.png`, render(Math.min(D[0], R[0]) - 10, D[1] - 10, Math.max(D[2], R[2]) + 10, Math.max(D[3], R[3]) + 10, 1));
}
