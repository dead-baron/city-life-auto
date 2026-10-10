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
//               districts' and islands' data, homes, hospitals, spawns, rail, venues, gates, cellBlocks, natureSites,
//               levels, flow, noTree, terrainCls, ... - everything not listed below); propSolid as its keys alone; the
//               map of shared objects (refs) and the values JSON can't hold (fix)
//   r<x>-<y>.bin every per-tile layer (each typed array of w * h: tiles, dist, zone, river, reserve, deck, lvl0Block,
//               roadAxis, roadRank, bld, land, distSea, distRiver, lake, cover) cut to the region's rectangle; and the
//               items of the REGIONAL lists whose position is in the region, each with its world-wide index; and
//               solidProps' tiles in the region
//   (left out)  OMIT: per-tile layers only the generator reads (no client code does - test/regions.test.js checks)
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

export const PACK_VERSION = 1;
export const OMIT = ['compLab', 'ringD'];
// the lists cut into regions, and how an item says where it is ('px': x, y in world px; 'tile': tx, ty - or x, y - in
// tiles; 'key': a Map keyed by tile index)
export const REGIONAL = {
  props: 'px', solidProps: 'key', pois: 'px', buildings: 'tile', prefabs: 'tile', roofs: 'tile', blocks: 'tile', lamps: 'px', parking: 'px',
  stalls: 'px', pillars: 'px', cameras: 'px', signals: 'px', pickables: 'px', forage: 'px', atms: 'px', seaPoints: 'px', offshore: 'px',
  brickWalls: 'tile', marina: 'px', wayside: 'px', restSpots: 'px',
};
// prop index -> its solid entry, as the generator keeps propSolid (shared/map.js: m.propSolid.set(e.pi, e))
function solidIndex(sp) { const by = new Map(); for (const arr of sp.values()) for (const e of arr) if (e && e.pi >= 0) by.set(e.pi, e); return by; }
const TYPES = { Uint8Array, Int8Array, Uint16Array, Int16Array, Uint32Array, Int32Array, Float32Array, Float64Array, Uint8ClampedArray };

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
  for (const f of Object.keys(REGIONAL)) {
    const src = city[f], plain = root[f];
    if (!Array.isArray(plain) || !(Array.isArray(src) || src instanceof Map)) continue;
    const kind = REGIONAL[f], per = regions.map(() => [[], []]);
    let i = 0;
    for (const it of src instanceof Map ? src.keys() : src) {
      const [tx, ty] = it && (typeof it === 'object' || kind === 'key') ? itemTile(kind, it, win) : [0, 0];
      const p = per[regionOf(g, tx, ty)];
      p[0].push(i); p[1].push(plain[i]);
      i++;
    }
    per.forEach(([idx, items], r) => { if (idx.length) regions[r].lists[f] = { i: regions[r].blobs.push(Int32Array.from(idx)) - 1, d: items }; });
    regional[f] = plain.length;
    root[f] = null;
  }
  let propSolid = null;
  if (psKeys) propSolid = blobs.push(Int32Array.from(city.propSolid.keys())) - 1;
  const index = writePack({
    frame: [g.W, g.H, g.R, g.nx, g.ny], win, order, omit, layers: layers.map((k) => [k, city[k].constructor.name]), regional, propSolid,
    regions: regions.map((r) => r.key), root, refs, fix, meta: opts.meta || null,
  }, blobs);
  return {
    index,
    regions: regions.map((r) => ({ key: r.key, bytes: writePack({ key: r.key, rx: r.rx, ry: r.ry, rect: r.rect, lists: r.lists }, r.blobs) })),
  };
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

// the plain city again (the fields of cityData(generateCity(seed)) less OMIT, in its order) from the index and the
// region files (raw, unzipped). Throws on a bad file.
export function assembleCity(indexBytes, regionBytes) {
  const { d: X, blobs } = readPack(indexBytes);
  const { win, root } = X, N = win[2] * win[3];
  const layers = X.layers.map(([k, t]) => { const T = TYPES[t]; if (!T) throw new Error('a bad index'); return new T(N); });
  for (const f of Object.keys(X.regional)) root[f] = new Array(X.regional[f]);
  const got = new Set();
  for (const bytes of regionBytes) {
    const { d: R, blobs: rb } = readPack(bytes);
    if (!X.regions.includes(R.key) || got.has(R.key) || rb.length < layers.length) throw new Error('a bad region file');
    got.add(R.key);
    layers.forEach((a, i) => pasteLayer(a, win, R.rect, rb[i]));
    for (const f of Object.keys(R.lists)) {
      const { i, d } = R.lists[f], idx = rb[i], arr = root[f];
      if (!arr || idx.length !== d.length) throw new Error('a bad region file');
      for (let j = 0; j < idx.length; j++) { if (idx[j] < 0 || idx[j] >= arr.length) throw new Error('a bad region file'); arr[idx[j]] = d[j]; }
    }
  }
  if (got.size !== X.regions.length) throw new Error('a region missing');
  for (const [p, h] of X.refs) put(root, p, at(root, h));
  const conv = [];
  for (const [p, t, v] of X.fix) {
    if (t === 'u') put(root, p, undefined);
    else if (t === 'n') put(root, p, v === '-0' ? -0 : Number(v));
    else if (t === 't') put(root, p, blobs[v]);
    else conv.push([p, t]);
  }
  conv.sort((a, b) => b[0].length - a[0].length);
  for (const [p, t] of conv) { const v = at(root, p); put(root, p, t === 'M' ? new Map(v) : new Set(v)); }
  if (X.propSolid !== null && root.solidProps instanceof Map) {
    const by = solidIndex(root.solidProps), ps = new Map();
    for (const k of blobs[X.propSolid]) ps.set(k, by.get(k));
    root.propSolid = ps;
  }
  const out = {};
  for (const k of X.order) {
    const li = X.layers.findIndex(([n]) => n === k);
    if (li >= 0) out[k] = layers[li];
    else if (k in root) out[k] = root[k];
  }
  return out;
}
// what an index says (the frame, the regions, the meta) without assembling
export function readIndex(indexBytes) { const { d } = readPack(indexBytes); return { frame: d.frame, regions: d.regions, meta: d.meta, omit: d.omit }; }
