// Art v2 live renderer: baked chunks kept in the browser (IndexedDB 'cla-art'), so a chunk is baked once per build
// of the art rather than every time it comes into view. A bake takes a phone a second or two; reading one back
// takes a few tens of ms - the start screen of a returning player, and every street driven down before (the
// graphics memory holds only a dozen chunks or so), come back at once.
//
//   getChunk(key)        the result a bake posts (worker.js: { g, under, blds, lights, gh, live, n, items }) or null
//   getChunk(key, true)  the same, or any kept chunk whose key starts with key (the same chunk as players had changed
//                        it then - a stand-in that is right but for a few broken props, until its own bake lands)
//   putChunk(key, blob)  keep one (blob: packChunk's) - the oldest go beyond the cap
//   packChunk(r)         a bake's result as { meta, bin } (bin: its typed arrays end to end), taken before they are
//                        transferred away
//   tidy(artKey, cap)    drop what other builds of the art baked, and the oldest beyond cap (one worker does it)
//
// Keys (host.js): `${art}|q${quality}|a${artPx}|u${under}|${cx},${cy}` - art is version.json's hash of everything a
// bake reads (tools/stamp-version.mjs: the bake worker's code and the world's), so a build that changes the art or
// the world bakes everything afresh. Only chunks as the map laid them out are kept (no cut-away, nothing broken or
// lit there by a player: worker.js). The arrays are gzipped (CompressionStream; without it nothing is kept - an
// uncompressed chunk is 2.4 MB). Best-effort: any failure is a miss, and the chunk is baked as before.
const DB = 'cla-art', STORE = 'chunks', WAIT_MS = 3000;
const timeout = (p, ms, v) => Promise.race([p, new Promise((res) => setTimeout(() => res(v), ms))]);
export const canKeep = () => typeof indexedDB !== 'undefined' && typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined';

let dbP = null;
function openDb() {
  if (dbP) return dbP;
  dbP = timeout(new Promise((res) => {
    let rq;
    try { rq = indexedDB.open(DB, 1); } catch { res(null); return; }
    rq.onupgradeneeded = () => { try { rq.result.createObjectStore(STORE).createIndex('at', 'at'); } catch { /* there already */ } };
    rq.onsuccess = () => { const db = rq.result; db.onversionchange = () => { try { db.close(); } catch { /* closed */ } dbP = null; }; res(db); };
    rq.onerror = () => res(null);
    rq.onblocked = () => res(null);
  }), WAIT_MS, null).then((db) => { if (!db) dbP = null; return db; });
  return dbP;
}
const req = (r) => new Promise((res) => { r.onsuccess = () => res(r.result); r.onerror = () => res(null); });

async function gzip(u8) { return new Response(new Blob([u8]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer(); }
async function gunzip(ab) { return new Uint8Array(await new Response(new Blob([ab]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer()); }

const TYPES = { Uint8Array, Uint8ClampedArray, Uint16Array, Int16Array, Uint32Array, Int32Array, Float32Array };
const ARRS = (r) => [r.g.p0, r.g.p1, r.g.p2, r.under || null, r.gh || null];

export function packChunk(r) {
  const arrs = ARRS(r);
  let n = 0;
  for (const a of arrs) if (a) n += a.byteLength;
  const bin = new Uint8Array(n);
  let o = 0;
  for (const a of arrs) if (a) { bin.set(new Uint8Array(a.buffer, a.byteOffset, a.byteLength), o); o += a.byteLength; }
  const g = r.g;
  const meta = {
    g: { w: g.w, h: g.h, ax: g.ax, ay: g.ay, ap: g.ap }, blds: r.blds || [], lights: r.lights || [], live: r.live || null, n: r.n || 0, items: r.items || 0,
    types: arrs.map((a) => (a ? a.constructor.name : null)), lens: arrs.map((a) => (a ? a.length : 0)),
  };
  return { meta, bin };
}

export async function putChunk(key, blob) {
  if (!canKeep()) return false;
  try {
    const z = await gzip(blob.bin);
    const db = await openDb();
    if (!db) return false;
    return await timeout(new Promise((res) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put({ at: Date.now(), meta: blob.meta, z }, key);
      tx.oncomplete = () => res(true); tx.onerror = () => res(false); tx.onabort = () => res(false);
    }), 15000, false);
  } catch { return false; }
}

export async function getChunk(key, like = false) {
  if (!canKeep()) return null;
  try {
    const db = await openDb();
    if (!db) return null;
    const st = db.transaction(STORE, 'readonly').objectStore(STORE);
    const v = await timeout(req(st.get(like ? IDBKeyRange.bound(key, key + '\uffff') : key)), WAIT_MS, null);
    if (!v || !v.z || !v.meta) return null;
    const bin = await gunzip(v.z), m = v.meta;
    let o = 0;
    const arrs = m.types.map((t, i) => {
      if (!t) return null;
      const T = TYPES[t], bytes = m.lens[i] * T.BYTES_PER_ELEMENT;
      const a = new T(bin.buffer.slice(bin.byteOffset + o, bin.byteOffset + o + bytes));   // (each its own buffer: transferred one by one)
      o += bytes;
      return a;
    });
    if (o !== bin.byteLength) return null;
    return { g: { ...m.g, p0: arrs[0], p1: arrs[1], p2: arrs[2] }, under: arrs[3], gh: arrs[4], blds: m.blds, lights: m.lights, live: m.live, n: m.n, items: m.items };
  } catch { return null; }
}

// what other builds of the art baked goes; then the oldest, down to cap
export async function tidy(art, cap) {
  if (!canKeep()) return;
  try {
    const db = await openDb();
    if (!db) return;
    const st = () => db.transaction(STORE, 'readwrite').objectStore(STORE);
    const keys = (await timeout(req(st().getAllKeys()), WAIT_MS, null)) || [];
    const stale = keys.filter((k) => !String(k).startsWith(`${art}|`));
    if (stale.length) { const s = st(); for (const k of stale) s.delete(k); }
    let over = keys.length - stale.length - cap;
    if (over <= 0) return;
    await new Promise((res) => {
      const s = st(), cur = s.index('at').openCursor();
      cur.onsuccess = () => { const c = cur.result; if (!c || over <= 0) { res(); return; } if (String(c.primaryKey).startsWith(`${art}|`)) { c.delete(); over--; } c.continue(); };
      cur.onerror = () => res();
    });
  } catch { /* best effort */ }
}
