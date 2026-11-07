// The world's low-detail picture (2026-11-06, the owner flying a helicopter over the desert on his Pixel 7 Pro: "the world is
// still loading slowly ... specifically while flying around" - the ground was the stand-ins' flat tan blocks). Every chunk the
// server's bake threads bake (server/artbake.js, any build of the art) leaves a thumbnail here: its picture at 1/16 (a 768 px
// chunk is LOW_PX = 48 px, one pixel half a tile), lit softly from above. Kept per world (World v3 / today's), in blocks of
// LOW_BLOCK x LOW_BLOCK chunks (a World v3 region), and NOT under the art's hash: a deploy that changes the art leaves them
// be - they're stand-ins, and the next bake of a chunk brings its own up to date. The page draws a chunk that isn't ready
// from them (client/art2/game/lowres.js: in place of the flat stand-in, and all the ground from high in the air).
//
//   thumbFromGBuf(g)                  a chunk bake's full-resolution G-buffer (chunkbake.js r.g) -> RGB, LOW_PX square
//   thumbFromPlanes(gm, p0, p1)       the same from a kept chunk file's packed planes (chunkstore.js: art resolution)
//   thumbOfFile(buf)                  the same from a chunk file as the art CDN keeps it (server/artbake.js chunkFile)
//   encodePng(w, h, rgba)             a PNG (RGBA, 8 bits) - zlib only, no dependencies
//   createLowStore({ dir })           the blocks on disk: put(cx, cy, rgb), has(cx, cy), png(bx, by) (RGBA: a chunk with no
//                                     thumbnail is transparent; the page draws its own stand-in there), flush()
import { deflateSync, gunzipSync, crc32 } from 'node:zlib';
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, openSync, readSync, closeSync } from 'node:fs';
import { join } from 'node:path';

export const LOW_CHUNK = 768;                       // (client/art2/game/chunkbake.js CHUNK)
export const LOW_PX = 48;                           // a chunk's thumbnail: 1/16
export const LOW_BLOCK = 21;                        // chunks a block is wide and tall (shared/world3.js REGION_CHUNKS)
const T3 = LOW_PX * LOW_PX * 3;                     // one thumbnail's bytes (RGB)
const BLOCK_BYTES = LOW_BLOCK * LOW_BLOCK * T3;

// the soft light a thumbnail is lit with: from above and a little north-west (the engine lights a stand-in as flat ground,
// so the relief - roofs, crowns, cliffs - and the shadows to the south-east are baked in here, gently)
const LX = -0.3, LY = -0.36, LZ = 0.88;
// the shade at each full-resolution pixel from its normal (nrm: RGBA, alpha >= 128 where it has one) and its height z
// (world px): what stands taller than the light's line from up and to the left of it darkens it
function shadeAt(w, h, z, i, x, y, nx, ny, nz) {
  let k = nz === null ? 1 : 0.7 + 0.36 * Math.max(0, nx * LX + ny * LY + nz * LZ);
  const z0 = z[i];
  for (let d = 4; d <= 36; d += 4) {
    const sx = x - d, sy = y - d;
    if (sx < 0 || sy < 0) break;
    if (z[sy * w + sx] > z0 + d * 1.1 + 3) { k *= 0.8; break; }
  }
  return k;
}

// a full-resolution G-buffer (col RGBA, nrm RGBA, z) -> the thumbnail: each pixel the mean of its 16 x 16 block
export function thumbFromGBuf(g) {
  const w = g.w, h = g.h, col = g.col, nrm = g.nrm, z = g.z, S = Math.max(1, Math.round(Math.min(w, h) / LOW_PX)), out = new Uint8Array(T3);
  const acc = new Float32Array(LOW_PX * LOW_PX * 4);
  for (let y = 0; y < Math.min(h, LOW_PX * S); y++) {
    const ty = Math.floor(y / S);
    for (let x = 0; x < Math.min(w, LOW_PX * S); x++) {
      const i = y * w + x, j = i * 4;
      let k = 1;
      if (z) {
        const has = nrm && nrm[j + 3] >= 128;
        k = shadeAt(w, h, z, i, x, y, has ? nrm[j] / 127.5 - 1 : 0, has ? nrm[j + 1] / 127.5 - 1 : 0, has ? nrm[j + 2] / 127.5 - 1 : null);
      }
      const a = ((ty * LOW_PX) + Math.floor(x / S)) * 4;
      acc[a] += col[j] * k; acc[a + 1] += col[j + 1] * k; acc[a + 2] += col[j + 2] * k; acc[a + 3]++;
    }
  }
  for (let p = 0, o = 0; p < LOW_PX * LOW_PX; p++, o += 3) {
    const n = acc[p * 4 + 3] || 1;
    out[o] = Math.min(255, acc[p * 4] / n + 0.5); out[o + 1] = Math.min(255, acc[p * 4 + 1] / n + 0.5); out[o + 2] = Math.min(255, acc[p * 4 + 2] / n + 0.5);
  }
  return out;
}
// a kept chunk's packed planes (gm: { w, h }; p0 the colour RGBA, p1 [z lo, z hi, flags, -]) at art resolution -> the same
// thumbnail, its shade from the heights alone (the normals are packed: not worth unpacking for a stand-in)
export function thumbFromPlanes(gm, p0, p1) {
  const w = gm.w, h = gm.h, n = w * h, z = new Uint16Array(n), ap = Math.max(1, Math.round(LOW_CHUNK / Math.max(w, h)));
  for (let i = 0, j = 0; i < n; i++, j += 4) z[i] = (p1[j] | (p1[j + 1] << 8)) / ap;   // (heights in art px: the shadow's reach is)
  return thumbFromGBuf({ w, h, col: p0, nrm: null, z });
}

// a kept chunk file's thumbnail (server/artbake.js chunkFile: chunkstore.js packChunk's arrays, p0 and p1 first)
export function thumbOfFile(buf) {
  if (buf.length < 8 || buf.toString('latin1', 0, 4) !== 'CLA1') return null;
  const n = buf.readUInt32LE(4), meta = JSON.parse(buf.toString('utf8', 8, 8 + n)), bin = gunzipSync(buf.subarray(8 + n));
  const sz = (i) => meta.lens[i] * (meta.types[i] === 'Uint8Array' ? 1 : 0);
  if (!sz(0) || !sz(1)) return null;
  const p0 = new Uint8Array(bin.buffer, bin.byteOffset, sz(0)), p1 = new Uint8Array(bin.buffer, bin.byteOffset + sz(0), sz(1));
  return thumbFromPlanes(meta.g, p0, p1);
}


// ---- PNG (RGBA 8-bit; each row filtered 'Sub', deflated) --------------------------------------------------------------
function chunk(type, data) {
  const len = Buffer.alloc(4), crc = Buffer.alloc(4), td = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  len.writeUInt32BE(data.length); crc.writeUInt32BE(crc32(td) >>> 0);
  return Buffer.concat([len, td, crc]);
}
export function encodePng(w, h, rgba, level = 6) {
  const row = w * 4, raw = Buffer.alloc((row + 1) * h);
  for (let y = 0; y < h; y++) {
    const o = y * (row + 1), s = y * row;
    raw[o] = 1;   // Sub: each byte less the one 4 before it
    for (let x = 0; x < row; x++) raw[o + 1 + x] = (rgba[s + x] - (x >= 4 ? rgba[s + x - 4] : 0)) & 255;
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level })), chunk('IEND', Buffer.alloc(0))]);
}

// ---- the blocks on disk ------------------------------------------------------------------------------------------------
// <dir>/<bx>_<by>.blk: 'CLB1', then a bitmap of which of its LOW_BLOCK^2 chunks have a thumbnail, then the thumbnails (RGB,
// row by row of chunks). A few blocks are kept in memory (the ones written to and asked for lately); written back every so
// often (flush) and when they leave.
const HEAD = 4 + Math.ceil((LOW_BLOCK * LOW_BLOCK) / 8);
export function createLowStore({ dir, keep = 12 } = {}) {
  mkdirSync(dir, { recursive: true });
  const blocks = new Map();   // 'bx_by' -> { have: Uint8Array bitmap, px: Buffer, dirty, png: Buffer | null, ver, used }
  const fileOf = (k) => join(dir, `${k}.blk`);
  const stats = { put: 0, png: 0, pngMs: 0 };
  function load(bx, by) {
    const k = `${bx}_${by}`;
    let b = blocks.get(k);
    if (b) { b.used = Date.now(); return b; }
    b = { k, have: new Uint8Array(HEAD - 4), px: Buffer.alloc(BLOCK_BYTES), dirty: false, png: null, ver: 0, used: Date.now(), n: 0 };
    try {
      const f = fileOf(k);
      if (existsSync(f)) {
        const buf = readFileSync(f);
        if (buf.length === HEAD + BLOCK_BYTES && buf.toString('latin1', 0, 4) === 'CLB1') { b.have.set(buf.subarray(4, HEAD)); buf.copy(b.px, 0, HEAD); }
      }
    } catch { /* a fresh block */ }
    for (let i = 0; i < LOW_BLOCK * LOW_BLOCK; i++) if (b.have[i >> 3] & (1 << (i & 7))) b.n++;
    heads.delete(k);
    blocks.set(k, b);
    if (blocks.size > keep) {   // (the least recently used goes - written back first)
      let old = null;
      for (const q of blocks.values()) if (q !== b && (!old || q.used < old.used)) old = q;
      if (old) { save(old); blocks.delete(old.k); heads.set(old.k, old.have); }
    }
    return b;
  }
  function save(b) {
    if (!b.dirty) return;
    const f = fileOf(b.k);
    try { writeFileSync(f + '.part', Buffer.concat([Buffer.from('CLB1', 'latin1'), Buffer.from(b.have), b.px])); renameSync(f + '.part', f); b.dirty = false; } catch { /* next time */ }
  }
  const at = (cx, cy) => { const bx = Math.floor(cx / LOW_BLOCK), by = Math.floor(cy / LOW_BLOCK); return [bx, by, (cy - by * LOW_BLOCK) * LOW_BLOCK + (cx - bx * LOW_BLOCK)]; };
  function put(cx, cy, rgb) {
    if (!rgb || rgb.length !== T3 || cx < 0 || cy < 0) return false;
    const [bx, by, i] = at(cx, cy), b = load(bx, by);
    if (!(b.have[i >> 3] & (1 << (i & 7)))) { b.have[i >> 3] |= 1 << (i & 7); b.n++; }
    Buffer.from(rgb.buffer, rgb.byteOffset, rgb.byteLength).copy(b.px, i * T3);
    b.dirty = true; b.png = null; b.ver++;
    stats.put++;
    return true;
  }
  // (which chunks of a block have one: its bitmap, read from the file's head alone - every block's is kept, a few bytes each)
  const heads = new Map();
  function headOf(bx, by) {
    const k = `${bx}_${by}`, b = blocks.get(k);
    if (b) return b.have;
    let h = heads.get(k);
    if (h) return h;
    h = new Uint8Array(HEAD - 4);
    try { const fd = openSync(fileOf(k), 'r'), buf = Buffer.alloc(HEAD); readSync(fd, buf, 0, HEAD, 0); closeSync(fd); if (buf.toString('latin1', 0, 4) === 'CLB1') h.set(buf.subarray(4)); } catch { /* none yet */ }
    heads.set(k, h);
    return h;
  }
  function has(cx, cy) { const [bx, by, i] = at(cx, cy), h = headOf(bx, by); return !!(h[i >> 3] & (1 << (i & 7))); }
  // a block as a PNG (LOW_BLOCK * LOW_PX px square, RGBA: transparent where there's no thumbnail), or null when it has none;
  // made again only when a thumbnail in it has changed, and not more than once every `fresh` ms while it keeps changing
  function png(bx, by, fresh = 20000) {
    if (bx < 0 || by < 0) return null;
    const b = load(bx, by);
    if (!b.n) return null;
    if (b.png && (b.pngVer === b.ver || Date.now() - b.pngAt < fresh)) return { png: b.png, n: b.n, ver: b.pngVer, have: b.pngHave };
    const t = performance.now(), W = LOW_BLOCK * LOW_PX, rgba = Buffer.alloc(W * W * 4);
    for (let i = 0; i < LOW_BLOCK * LOW_BLOCK; i++) {
      if (!(b.have[i >> 3] & (1 << (i & 7)))) continue;
      const ox = (i % LOW_BLOCK) * LOW_PX, oy = Math.floor(i / LOW_BLOCK) * LOW_PX;
      for (let y = 0; y < LOW_PX; y++) for (let x = 0; x < LOW_PX; x++) {
        const s = i * T3 + (y * LOW_PX + x) * 3, d = ((oy + y) * W + ox + x) * 4;
        rgba[d] = b.px[s]; rgba[d + 1] = b.px[s + 1]; rgba[d + 2] = b.px[s + 2]; rgba[d + 3] = 255;
      }
    }
    b.png = encodePng(W, W, rgba); b.pngVer = b.ver; b.pngAt = Date.now(); b.pngHave = Buffer.from(b.have).toString('base64');
    stats.png++; stats.pngMs += performance.now() - t;
    return { png: b.png, n: b.n, ver: b.pngVer, have: b.pngHave };
  }
  function flush() { for (const b of blocks.values()) save(b); }
  return { put, has, png, flush, stats, dir };
}
