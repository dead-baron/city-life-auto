// The city as region files (World v3 part 8, stage 1: docs/WORLD-V3.md). The server builds the city once and cuts it
// into shared/world3.js's regions (REGION_TILES squares over the world's frame: today's 1312 x 1200 is 3 x 3, the
// right and bottom ones partial; v3's 5040 x 4032 is 10 x 8) plus an index; server/worldcdn.js serves them and
// client/worldgen.js fetches and assembles them instead of running the generator. Plain functions for node, a page
// and a worker; no dependencies.
//
// Where each field of the city (shared/map.js cityData) goes:
//   index.bin   the frame and the region grid; every scalar (seed, w, h, _sig, softEdge, and any new one such as a
//               window's x0 / y0, without code changes here); every list without a position or that must stay whole
//               (the road graph - nodes, edges, roads, net - which the phone's GPS and the transit app need whole;
//               districts' and islands' data, homes, hospitals, spawns, rail (less its points), venues, gates,
//               cellBlocks, natureSites, levels (less its segments), flow, noTree, terrainCls, ... - everything not
//               listed below); propSolid as its keys alone; the map of shared objects (refs) and the values JSON can't
//               hold (fix)
//   r<x>-<y>.bin every per-tile layer (each typed array of w * h: tiles, dist, zone, river, reserve, deck, lvl0Block,
//               roadAxis, roadRank, bld, land, distSea, distRiver, lake, cover) cut to the region's rectangle; and the
//               items of the REGIONAL lists whose position is in the region, each with its world-wide index (a list
//               inside a field by its path: 'levels.segs'); solidProps' tiles in the region; and which of its items
//               are another list's items (refs: offshore points that are sea points, lamps that are props)
//   (left out)  OMIT: fields only the generator reads - two per-tile layers and the leftover lots' tiles (no client
//               code does - test/regions.test.js checks)
//
// What a structured clone keeps and a file can't, and how it comes back:
//   - one object reached from two places (an edge in roads, edges and net.edges; a gate's solid entries in solidProps
//     and gates[].props; ...): written once where it is first reached, the other places listed in refs and pointed at
//     it again on assembling (paths in the whole city's plain form, so a region's items are found by world index)
//   - Maps and Sets (solidProps, flow, levels.grid, noTree, ...): written as their entries, made Maps/Sets again
//   - propSolid (prop index -> its solid entry, the same object as in solidProps): rebuilt from solidProps the way
//     the generator keeps it (m.propSolid.set(e.pi, e) for each solid entry of a prop), in its own key order
//   - undefined, NaN, the infinities and -0 (JSON has none of them) and typed arrays inside lists
//   - terrainCls.at (a function): shared/map.js cityFromData hangs it on again, as for a city a worker sent
//
// A file: 'CLAR', the header's length (u32, little-endian), the header (JSON: { v, b: [[type, length, offset]], d });
// then the typed arrays' bytes, each 8-aligned (the machine's byte order: little-endian everywhere it runs).
// server/worldcdn.js gzips each file; the browser unzips it with DecompressionStream('gzip').
import { REGION_TILES } from './world3.js';
import { TILE } from './constants.js';
//
// (World v3 8.12, part 8 item 5 - H39) The index also says, for a page that holds a window of the world:
//   sigs     each region's signature (regionSig of its file as written, raw): the page checks each region it assembles
//            against it, drops one that doesn't match and fetches it again (client/worldwindow.js)
//   sig      the world's signature (shared/mapcore.js mapSignature of the whole map: what the server's welcome says)
//   places   every POI as [id, kind, label, x, y, district]: the phone's apps, the big map's icons and the GPS's
//            destinations list the whole world's places from a window (assembleCity's `places`)
//   picture  a coarse picture of the whole frame (a tile every PICTURE_K, when the frame is big: World v3's) for the
//            minimap and the big map before the player has been there
// Optional fields: an index without them is read as before (nothing checked, no places, no picture).

export const PACK_VERSION = 2;   // (2: an item that is another list's item is said in its region, not the index)
export const OMIT = ['compLab', 'ringD', 'leftover'];   // (leftover: the lots' scraps' tiles, read by the generator's later passes alone)
// the lists cut into regions, and how an item says where it is ('px': x, y in world px; 'tile': tx, ty - or x, y - in
// tiles; 'key': a Map keyed by tile index)
export const REGIONAL = {
  props: 'px', solidProps: 'key', pois: 'px', buildings: 'tile', prefabs: 'tile', roofs: 'tile', blocks: 'tile', lamps: 'px', parking: 'px',
  stalls: 'px', pillars: 'px', cameras: 'px', signals: 'px', pickables: 'px', forage: 'px', atms: 'px', seaPoints: 'px', offshore: 'px',
  brickWalls: 'tile', marina: 'px', wayside: 'px', restSpots: 'px',
  // (format 2: the railway's points; a list inside a field, by its path - the levels' deck segments, by their middle)
  railPts: 'px', 'levels.segs': 'seg',
  // (World v3's main line: each loop's points - m.rail is the first loop, the others are m.rails'; today's rail.pts is
  // railPts, a reference, so nothing here moves for today's world)
  'rail.pts': 'px', 'rails.1.pts': 'px', 'rails.2.pts': 'px', 'rails.3.pts': 'px', 'rails.4.pts': 'px', 'rails.5.pts': 'px', 'rails.6.pts': 'px', 'rails.7.pts': 'px',
};
// prop index -> its solid entry, as the generator keeps propSolid (shared/map.js: m.propSolid.set(e.pi, e))
function solidIndex(sp) { const by = new Map(); for (const arr of sp.values()) for (const e of arr) if (e && e.pi >= 0) by.set(e.pi, e); return by; }
const TYPES = { Uint8Array, Int8Array, Uint16Array, Int16Array, Uint32Array, Int32Array, Float32Array, Float64Array, Uint8ClampedArray };

// a region file's signature: a 32-bit hash of its bytes as written (raw, not gzipped), base 36
export function regionSig(bytes) {
  let h = 0x811c9dc5 ^ bytes.length;
  const n4 = bytes.length >> 2, w = (bytes.byteOffset & 3) === 0 ? new Int32Array(bytes.buffer, bytes.byteOffset, n4) : null;
  if (w) for (let i = 0; i < n4; i++) { h = Math.imul(h ^ w[i], 0x01000193); h ^= h >>> 15; }
  else for (let i = 0; i < n4 * 4; i += 4) { h = Math.imul(h ^ (bytes[i] | (bytes[i + 1] << 8) | (bytes[i + 2] << 16) | (bytes[i + 3] << 24)), 0x01000193); h ^= h >>> 15; }
  for (let i = n4 * 4; i < bytes.length; i++) h = Math.imul(h ^ bytes[i], 0x01000193);
  return (h >>> 0).toString(36);
}
// does a region's file (raw) match the index's signature for it? (an index without signatures: nothing to check)
export function regionMatches(sigs, key, raw) { return !sigs || (Object.hasOwn(sigs, key) && regionSig(raw) === sigs[key]); }
// the coarse picture's step (tiles per pixel): only for a big frame (World v3's 5040 x 4032: 1260 x 1008 pixels)
export const PICTURE_K = 4;
const pictureK = (W, H) => (W * H > 4e6 ? PICTURE_K : 0);

// the region grid over a frame of W x H tiles
export function regionGrid(W, H, R = REGION_TILES) { return { W, H, R, nx: Math.ceil(W / R), ny: Math.ceil(H / R) }; }
export const regionKey = (rx, ry) => `r${rx}-${ry}`;
export function regionKeys(W, H, R = REGION_TILES) { const g = regionGrid(W, H, R), out = []; for (let ry = 0; ry < g.ny; ry++) for (let rx = 0; rx < g.nx; rx++) out.push(regionKey(rx, ry)); return out; }
// the region (index in the grid, row by row) a tile is in; past the frame's edge, the nearest one
export function regionOf(g, tx, ty) {
  const rx = Math.min(g.nx - 1, Math.max(0, Math.floor(tx / g.R) || 0)), ry = Math.min(g.ny - 1, Math.max(0, Math.floor(ty / g.R) || 0));
  return ry * g.nx + rx;
}
// where an item of a REGIONAL list is, in tiles (win: the map's window [x0, y0, w, h], for 'key')
export function itemTile(kind, it, win) {
  if (kind === 'key') return [win[0] + (it % win[2]), win[1] + Math.floor(it / win[2])];
  if (kind === 'px') return [Math.floor(it.x / TILE), Math.floor(it.y / TILE)];
  if (kind === 'seg') return [Math.floor((it.ax + it.bx) / 2 / TILE), Math.floor((it.ay + it.by) / 2 / TILE)];
  return [it.tx !== undefined ? it.tx : it.x, it.ty !== undefined ? it.ty : it.y];
}

// ---- the container ----
export function writePack(d, blobs = []) {
  const b = [];
  let off = 0;
  for (const a of blobs) { b.push([a.constructor.name, a.length, off]); off += (a.byteLength + 7) & ~7; }
  const head = new TextEncoder().encode(JSON.stringify({ v: PACK_VERSION, b, d }));
  const start = (8 + head.length + 7) & ~7, out = new Uint8Array(start + off);
  out.set([67, 76, 65, 82]);
  new DataView(out.buffer).setUint32(4, head.length, true);
  out.set(head, 8);
  blobs.forEach((a, i) => out.set(new Uint8Array(a.buffer, a.byteOffset, a.byteLength), start + b[i][2]));
  return out;
}
export function readPack(bytes) {
  if (bytes.length < 8 || bytes[0] !== 67 || bytes[1] !== 76 || bytes[2] !== 65 || bytes[3] !== 82) throw new Error('not a region file');
  const n = new DataView(bytes.buffer, bytes.byteOffset, 8).getUint32(4, true);
  const h = JSON.parse(new TextDecoder().decode(bytes.subarray(8, 8 + n)));
  if (h.v !== PACK_VERSION) throw new Error(`region file version ${h.v}, not ${PACK_VERSION}`);
  const start = bytes.byteOffset + ((8 + n + 7) & ~7);
  const blobs = h.b.map(([t, len, off]) => {
    const T = TYPES[t];
    if (!T || start + off + len * T.BYTES_PER_ELEMENT > bytes.byteOffset + bytes.length) throw new Error('a bad region file');
    return new T(bytes.buffer.slice(start + off, start + off + len * T.BYTES_PER_ELEMENT));
  });
  return { d: h.d, blobs };
}

// ---- the city's plain form: what JSON holds, with the paths of what it can't ----
function plainForm(city, fields) {
  const seen = new Map();
  const count = (v) => {
    if (v === null || typeof v !== 'object') return;
    const c = seen.get(v);
    if (c) { seen.set(v, c + 1); return; }
    seen.set(v, 1);
    if (ArrayBuffer.isView(v)) return;
    if (v instanceof Map) { for (const [k, x] of v) { count(k); count(x); } return; }
    if (v instanceof Set) { for (const x of v) count(x); return; }
    if (Array.isArray(v)) { for (let i = 0; i < v.length; i++) count(v[i]); return; }
    for (const k of Object.keys(v)) count(v[k]);
  };
  for (const k of fields) count(city[k]);
  const path = [], home = new Map(), refs = [], fix = [], blobs = [];
  const conv = (v) => {
    switch (typeof v) {
      case 'undefined': fix.push([path.slice(), 'u']); return null;
      case 'number': if (Number.isFinite(v) && !Object.is(v, -0)) return v; fix.push([path.slice(), 'n', Object.is(v, -0) ? '-0' : String(v)]); return null;
      case 'string': case 'boolean': return v;
      case 'object': break;
      default: throw new Error(`regionpack: a ${typeof v} in the city (${path.join('.')})`);
    }
    if (v === null) return null;
    if (seen.get(v) > 1) {
      const h = home.get(v);
      if (h) { refs.push([path.slice(), h]); return null; }
      if (v instanceof Map || v instanceof Set) throw new Error(`regionpack: a Map or Set reached from two places (${path.join('.')})`);
      home.set(v, path.slice());
    }
    if (ArrayBuffer.isView(v)) { fix.push([path.slice(), 't', blobs.push(v) - 1]); return null; }
    if (v instanceof Map || v instanceof Set) {
      const out = [], isMap = v instanceof Map;
      let i = 0;
      for (const e of v) {
        path.push(i++);
        if (isMap) { path.push(0); const k = conv(e[0]); path[path.length - 1] = 1; const x = conv(e[1]); path.pop(); out.push([k, x]); } else out.push(conv(e));
        path.pop();
      }
      fix.push([path.slice(), isMap ? 'M' : 'S']);
      return out;
    }
    if (Array.isArray(v)) { const out = new Array(v.length); for (let i = 0; i < v.length; i++) { path.push(i); out[i] = conv(v[i]); path.pop(); } return out; }
    const out = {};
    for (const k of Object.keys(v)) { path.push(k); out[k] = conv(v[k]); path.pop(); }
    return out;
  };
  const root = {};
  for (const k of fields) { path.push(k); root[k] = conv(city[k]); path.pop(); }
  return { root, refs, fix, blobs };
}

// propSolid is solidProps' entries by prop index? Then only its keys travel.
function propSolidRebuilds(city) {
  const ps = city.propSolid, sp = city.solidProps;
  if (!(ps instanceof Map) || !(sp instanceof Map)) return false;
  const by = solidIndex(sp);
  for (const [k, e] of ps) if (by.get(k) !== e) return false;
  return true;
}

// city: the plain city (cityData) or the CityMap itself; opts.frame: [W, H] of the world's frame (default the map's
// own window's far edge); opts.meta: written into the index as it is (the server's world hash and seed)
export function packRegions(city, opts = {}) {
  const win = [city.x0 | 0, city.y0 | 0, city.w, city.h], N = win[2] * win[3];
  const [W, H] = opts.frame || [win[0] + win[2], win[1] + win[3]];
  const g = regionGrid(W, H, opts.region || REGION_TILES);
  const order = Object.keys(city).filter((k) => typeof city[k] !== 'function');
  const omit = order.filter((k) => OMIT.includes(k));
  const layers = order.filter((k) => !omit.includes(k) && ArrayBuffer.isView(city[k]) && city[k].length === N && TYPES[city[k].constructor.name]);
  const psKeys = propSolidRebuilds(city);
  const fields = order.filter((k) => !omit.includes(k) && !layers.includes(k) && !(psKeys && k === 'propSolid'));
  const { root, refs, fix, blobs } = plainForm(city, fields);
  const regional = {};
  const regions = [];
  for (let ry = 0; ry < g.ny; ry++) for (let rx = 0; rx < g.nx; rx++) {
    const X0 = rx * g.R, Y0 = ry * g.R, rw = Math.min(g.R, W - X0), rh = Math.min(g.R, H - Y0);
    regions.push({ key: regionKey(rx, ry), rx, ry, rect: [X0, Y0, rw, rh], lists: {}, blobs: layers.map((k) => cutLayer(city[k], win, X0, Y0, rw, rh)) });
  }
  const where = {};   // (the region of each item of a regional list)
  const field = (o, f) => { for (const k of f.split('.')) { if (o === null || typeof o !== 'object') return undefined; o = o[k]; } return o; };
  for (const f of Object.keys(REGIONAL)) {
    const src = field(city, f), plain = field(root, f);
    if (!Array.isArray(plain) || !(Array.isArray(src) || src instanceof Map)) continue;
    const kind = REGIONAL[f], per = regions.map(() => [[], []]), wf = where[f] = new Int32Array(plain.length);
    let i = 0;
    for (const it of src instanceof Map ? src.keys() : src) {
      const [tx, ty] = it && (typeof it === 'object' || kind === 'key') ? itemTile(kind, it, win) : [0, 0];
      const r = regionOf(g, tx, ty), p = per[r];
      p[0].push(i); p[1].push(plain[i]); wf[i] = r;
      i++;
    }
    per.forEach(([idx, items], r) => { if (idx.length) regions[r].lists[f] = { i: regions[r].blobs.push(Int32Array.from(idx)) - 1, d: items }; });
    regional[f] = plain.length;
    put(root, f.split('.'), null);
  }
  // an item of a regional list that is another's (offshore's points are seaPoints', the lamps props): said in its own
  // region, not the index (World v3's 81,745 offshore points were 3.4 MB of its index): [f, g, pairs of i, j]
  const keepRefs = [], byRegion = regions.map(() => new Map());
  for (const r of refs) {
    const [p, h] = r;
    if (p.length !== 2 || h.length !== 2 || !where[p[0]] || !where[h[0]] || typeof p[1] !== 'number' || typeof h[1] !== 'number') { keepRefs.push(r); continue; }
    const m = byRegion[where[p[0]][p[1]]], k = `${p[0]} ${h[0]}`;
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(p[1], h[1]);
  }
  byRegion.forEach((m, ri) => { if (m.size) regions[ri].refs = [...m].map(([k, ij]) => [...k.split(' '), regions[ri].blobs.push(Int32Array.from(ij)) - 1]); });
  let propSolid = null;
  if (psKeys) propSolid = blobs.push(Int32Array.from(city.propSolid.keys())) - 1;
  const files = regions.map((r) => ({ key: r.key, bytes: writePack({ key: r.key, rx: r.rx, ry: r.ry, rect: r.rect, lists: r.lists, refs: r.refs || [] }, r.blobs) }));
  const sigs = Object.fromEntries(files.map((f) => [f.key, regionSig(f.bytes)]));
  const sig = opts.sig || (typeof city._sig === 'string' ? city._sig : null);
  const index = writePack({
    frame: [g.W, g.H, g.R, g.nx, g.ny], win, order, omit, layers: layers.map((k) => [k, city[k].constructor.name]), regional, propSolid,
    regions: regions.map((r) => r.key), root, refs: keepRefs, fix, meta: opts.meta || null,
    sigs, sig, places: placesOf(city, win), picture: pictureOf(city, win, W, H, blobs),
  }, blobs);
  return { index, regions: files };
}
// every POI, small: [id, kind, label, x, y, district (the dist layer's at its tile, -1 off the map), its home's id (a home for sale)]
function placesOf(city, win) {
  if (!Array.isArray(city.pois) || !ArrayBuffer.isView(city.dist)) return null;
  const out = [];
  city.pois.forEach((p, i) => {
    if (!p || typeof p !== 'object') return;
    const tx = Math.floor(p.x / TILE) - win[0], ty = Math.floor(p.y / TILE) - win[1];
    const d = tx >= 0 && ty >= 0 && tx < win[2] && ty < win[3] ? city.dist[ty * win[2] + tx] : -1;
    out.push(p.home !== undefined ? [i, p.kind, p.label, p.x, p.y, d, p.home] : [i, p.kind, p.label, p.x, p.y, d]);
  });
  return out;
}
// the whole frame's tiles, a tile every k (the middle of each k x k block): [k, w, h, blob]
function pictureOf(city, win, W, H, blobs) {
  const k = pictureK(W, H);
  if (!k || !ArrayBuffer.isView(city.tiles)) return null;
  const pw = Math.ceil(W / k), ph = Math.ceil(H / k), pic = new Uint8Array(pw * ph), h = k >> 1;
  for (let y = 0; y < ph; y++) {
    const ty = Math.min(H - 1, y * k + h) - win[1];
    if (ty < 0 || ty >= win[3]) continue;
    for (let x = 0; x < pw; x++) { const tx = Math.min(W - 1, x * k + h) - win[0]; if (tx >= 0 && tx < win[2]) pic[y * pw + x] = city.tiles[ty * win[2] + tx]; }
  }
  return [k, pw, ph, blobs.push(pic) - 1];
}

// a layer's rectangle (X0, Y0, rw, rh: world tiles) out of the map's window, row by row through the window's width
function cutLayer(a, win, X0, Y0, rw, rh) {
  const out = new a.constructor(rw * rh);
  const x0 = Math.max(X0, win[0]), x1 = Math.min(X0 + rw, win[0] + win[2]);
  if (x1 <= x0) return out;
  for (let ty = Math.max(Y0, win[1]); ty < Math.min(Y0 + rh, win[1] + win[3]); ty++) {
    const s = (ty - win[1]) * win[2] + (x0 - win[0]);
    out.set(a.subarray(s, s + x1 - x0), (ty - Y0) * rw + (x0 - X0));
  }
  return out;
}
function pasteLayer(a, win, rect, src) {
  const [X0, Y0, rw, rh] = rect;
  const x0 = Math.max(X0, win[0]), x1 = Math.min(X0 + rw, win[0] + win[2]);
  if (x1 <= x0) return;
  for (let ty = Math.max(Y0, win[1]); ty < Math.min(Y0 + rh, win[1] + win[3]); ty++) {
    const s = (ty - Y0) * rw + (x0 - X0);
    a.set(src.subarray(s, s + x1 - x0), (ty - win[1]) * win[2] + (x0 - win[0]));
  }
}

// (a path is the files' word: one through an object's prototype is a bad file, never followed)
const step = (k) => { if (k === '__proto__' || k === 'constructor' || k === 'prototype') throw new Error('a bad index'); return k; };
const at = (o, p, n = p.length) => { for (let i = 0; i < n; i++) o = o[step(p[i])]; return o; };
const put = (o, p, v) => { at(o, p, p.length - 1)[step(p[p.length - 1])] = v; };

// ---- a window of the world (World v3 part 8 items 1 and 4: the page keeps the 3 x 3 regions round the player) ----
// a region's rectangle [X0, Y0, w, h] in world tiles, from its key and the index's frame ([W, H, R, nx, ny])
export function regionRect(frame, key) {
  const m = /^r(\d+)-(\d+)$/.exec(key);
  if (!m) throw new Error(`not a region: ${key}`);
  const [W, H, R] = frame, X0 = Number(m[1]) * R, Y0 = Number(m[2]) * R;
  return [X0, Y0, Math.min(R, W - X0), Math.min(R, H - Y0)];
}
// the region [rx, ry] a tile is in (past the frame's edge, the nearest one)
export function regionXYOf(frame, tx, ty) {
  const [, , R, nx, ny] = frame;
  return [Math.min(nx - 1, Math.max(0, Math.floor(tx / R) || 0)), Math.min(ny - 1, Math.max(0, Math.floor(ty / R) || 0))];
}
// the (2r + 1) square of regions round the one a tile is in (r = 1: the 3 x 3 window the page keeps - shared/world3.js
// regionsAround on any frame), row by row; at the frame's edge shifted in, so a window is always 3 x 3 regions where the
// frame has them (today's 1312 x 1200 is 3 x 3 regions: its window is always the whole map)
export function regionsNear(frame, tx, ty, r = 1) {
  const [, , , nx, ny] = frame, [cx, cy] = regionXYOf(frame, tx, ty), n = 2 * r + 1;
  const x0 = Math.max(0, Math.min(cx - r, nx - n)), y0 = Math.max(0, Math.min(cy - r, ny - n));
  const out = [];
  for (let y = y0; y < Math.min(ny, y0 + n); y++) for (let x = x0; x < Math.min(nx, x0 + n); x++) out.push(regionKey(x, y));
  return out;
}
// the rectangle [x0, y0, w, h] the regions cover together (their bounding box: a window's regions are a block)
export function windowRect(frame, keys) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const k of keys) { const [X, Y, w, h] = regionRect(frame, k); x0 = Math.min(x0, X); y0 = Math.min(y0, Y); x1 = Math.max(x1, X + w); y1 = Math.max(y1, Y + h); }
  if (!(x1 > x0 && y1 > y0)) throw new Error('windowRect: no regions');
  return [x0, y0, x1 - x0, y1 - y0];
}
// the lists a window holds whole-or-not-at-all in order (a loop's points: shared/mapcore.js railAt searches them by
// arc length) - compacted to the points present, in order, instead of holes
const DENSE = (f) => f === 'railPts' || /^rails?(\.\d+)?\.pts$/.test(f);

// the plain city again (the fields of cityData(generateCity(seed)) less OMIT, in its order) from the index and the
// region files (raw, unzipped). Throws on a bad file.
// opts.window = [x0, y0, w, h] (windowRect of the regions given): a window of the world - only those regions' files,
// the per-tile layers that rectangle's (x0, y0, w, h and frame on the city: shared/mapwindow.js's form), the regional
// lists holding only the window's items at their world-wide indices (sparse arrays: list[i] is the world's item i or a
// hole; .length the world's count), solidProps keyed by the window's tiles, and what the index points at in a region
// not given left out (a gate's solid pieces: null). The index's whole lists stay whole (the road graph, the homes...).
export function assembleCity(indexBytes, regionBytes, opts = {}) {
  const { d: X, blobs } = readPack(indexBytes);
  const sub = Array.isArray(opts.window);
  const { root } = X, win = sub ? opts.window.map((v) => v | 0) : X.win, N = win[2] * win[3], packed = X.win;
  // (a path the window may not hold: an item of a region not given - skipped, not followed)
  const reach = (o, p, n = p.length) => { for (let i = 0; i < n; i++) { if (o === null || typeof o !== 'object') return undefined; o = o[step(p[i])]; } return o; };
  const held = (p) => { const o = reach(root, p, p.length - 1); return o !== null && typeof o === 'object'; };
  const layers = X.layers.map(([k, t]) => { const T = TYPES[t]; if (!T) throw new Error('a bad index'); return new T(N); });
  const list = {};   // (a regional list by its name - a field, or a path to a list inside one: 'levels.segs')
  for (const f of Object.keys(X.regional)) { const p = f.split('.'); if (p.length > 1 && (at(root, p, p.length - 1) === null || typeof at(root, p, p.length - 1) !== 'object')) throw new Error('a bad index'); put(root, p, (list[f] = new Array(X.regional[f]))); }
  const got = new Set(), same = [];
  for (const bytes of regionBytes) {
    const { d: R, blobs: rb } = readPack(bytes);
    if (!X.regions.includes(R.key) || got.has(R.key) || rb.length < layers.length) throw new Error('a bad region file');
    got.add(R.key);
    layers.forEach((a, i) => pasteLayer(a, win, R.rect, rb[i]));
    for (const f of Object.keys(R.lists)) {
      const { i, d } = R.lists[f], idx = rb[i], arr = Object.hasOwn(list, f) ? list[f] : null;
      if (!arr || idx.length !== d.length) throw new Error('a bad region file');
      for (let j = 0; j < idx.length; j++) { if (idx[j] < 0 || idx[j] >= arr.length) throw new Error('a bad region file'); arr[idx[j]] = d[j]; }
    }
    for (const [f, g, i] of R.refs || []) { if (!Object.hasOwn(list, f) || !Object.hasOwn(list, g) || !rb[i]) throw new Error('a bad region file'); same.push([list[f], list[g], rb[i]]); }
  }
  if (!sub && got.size !== X.regions.length) throw new Error('a region missing');
  // (once every region is in: an item may be one of another region's - in a window, one it holds)
  for (const [a, b, ij] of same) for (let k = 0; k + 1 < ij.length; k += 2) {
    if (ij[k] < 0 || ij[k] >= a.length || ij[k + 1] < 0 || ij[k + 1] >= b.length) throw new Error('a bad region file');
    if (!sub || ij[k + 1] in b) a[ij[k]] = b[ij[k + 1]]; else delete a[ij[k]];
  }
  if (!sub) for (const [p, h] of X.refs) put(root, p, at(root, h));
  else for (const [p, h] of X.refs) { const v = reach(root, h); if (v !== undefined && held(p)) put(root, p, v); }
  const conv = [];
  for (const [p, t, v] of X.fix) {
    if (sub && !held(p)) continue;
    if (t === 'u') put(root, p, undefined);
    else if (t === 'n') put(root, p, v === '-0' ? -0 : Number(v));
    else if (t === 't') put(root, p, blobs[v]);
    else conv.push([p, t]);
  }
  conv.sort((a, b) => b[0].length - a[0].length);
  for (const [p, t] of conv) {
    let v = sub ? reach(root, p) : at(root, p);
    if (sub) {
      if (!Array.isArray(v)) continue;
      // (a regional Map in a window: its entries present, keyed by the window's tiles - solidProps)
      const f = p.join('.');
      if (Object.hasOwn(list, f)) {
        v = v.filter(() => true);
        if (REGIONAL[f] === 'key') v = v.map(([k, x]) => [(packed[1] + Math.floor(k / packed[2]) - win[1]) * win[2] + (packed[0] + (k % packed[2]) - win[0]), x]);
      }
    }
    put(root, p, t === 'M' ? new Map(v) : new Set(v));
  }
  if (X.propSolid !== null && root.solidProps instanceof Map) {
    const by = solidIndex(root.solidProps), ps = new Map();
    for (const k of blobs[X.propSolid]) { const e = by.get(k); if (!sub || e !== undefined) ps.set(k, e); }
    root.propSolid = ps;
  }
  // (compacted in place: what points at the list - today's rail.pts is railPts - keeps pointing at it)
  if (sub) for (const f of Object.keys(list)) if (DENSE(f)) { const a = list[f]; let n = 0; for (let i = 0; i < a.length; i++) if (i in a) a[n++] = a[i]; a.length = n; }
  const out = {};
  for (const k of X.order) {
    const li = X.layers.findIndex(([n]) => n === k);
    if (li >= 0) out[k] = layers[li];
    else if (k in root) out[k] = root[k];
  }
  if (sub) {
    out.x0 = win[0]; out.y0 = win[1]; out.w = win[2]; out.h = win[3]; out.frame = { w: X.frame[0], h: X.frame[1] };
    // (the whole world's places - the phone's apps, the big map - and its coarse picture - the minimap - from the index)
    if (Array.isArray(X.places)) { const pl = []; for (const [id, kind, label, x, y, d, home] of X.places) pl[id] = home === undefined ? { id, kind, label, x, y, d } : { id, kind, label, x, y, d, home }; out.places = pl; }
    if (Array.isArray(X.picture) && blobs[X.picture[3]]) out.picture = { k: X.picture[0], w: X.picture[1], h: X.picture[2], tiles: blobs[X.picture[3]] };
  }
  return out;
}
// what an index says (the frame, the regions, the meta, the signatures) without assembling
export function readIndex(indexBytes) { const { d } = readPack(indexBytes); return { frame: d.frame, regions: d.regions, meta: d.meta, omit: d.omit, sigs: d.sigs || null, sig: d.sig || null }; }
