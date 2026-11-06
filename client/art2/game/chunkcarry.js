// Kept chunks carried over a new build of the art (2026-11-04). A deploy that changes the bake's code or the world gets a
// new art hash (tools/stamp-version.mjs), and every kept chunk was thrown away (chunkstore.js tidy) - though most come
// out of the new code byte for byte the same (8 such deploys from 10-28 to 11-04). Now the store keeps the build
// before's chunks too, and when the server has baked this build's chunk and found it the same as the build before's
// (server/artcdn.js same), it says so in place of the bytes: the page copies its kept one under the new key - no
// download (about 600 KB), no bake. Never on a guess: only the server's comparison of the bytes carries a chunk over.
// (Its own module: chunkstore.js is part of the art hash - a change there throws everyone's kept chunks away.)
const DB = 'cla-art', STORE = 'chunks', WAIT_MS = 3000;
const timeout = (p, ms, v) => Promise.race([p, new Promise((res) => setTimeout(() => res(v), ms))]);
const req = (r) => new Promise((res) => { r.onsuccess = () => res(r.result); r.onerror = () => res(null); });
const can = () => typeof indexedDB !== 'undefined';
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
const artOf = (k) => { const s = String(k), i = s.indexOf('|'); return i < 0 ? s : s.slice(0, i); };

// the build of the art kept beside this one: the one most chunks are kept under (null: none)
export function prevOf(keys, art) {
  const n = new Map();
  for (const k of keys) { const a = artOf(k); if (a !== art) n.set(a, (n.get(a) || 0) + 1); }
  let best = null, bn = 0;
  for (const [a, c] of n) if (c > bn) { best = a; bn = c; }
  return best;
}
export async function prevArt(art) {
  if (!can()) return null;
  try { const db = await openDb(); if (!db) return null; return prevOf((await timeout(req(db.transaction(STORE, 'readonly').objectStore(STORE).getAllKeys()), WAIT_MS, null)) || [], art); } catch { return null; }
}
// a kept chunk as it is stored ({ meta, z }), or null
export async function getRaw(key) {
  if (!can()) return null;
  try { const db = await openDb(); if (!db) return null; const v = await timeout(req(db.transaction(STORE, 'readonly').objectStore(STORE).get(key)), WAIT_MS, null); return v && v.meta && v.z ? { meta: v.meta, z: v.z } : null; } catch { return null; }
}
// which kept keys go: other builds' but the one before (keep), then the oldest beyond cap - the build before's first
export function toDrop(keys, art, keep, cap, oldestFirst = keys) {
  const mine = (k) => artOf(k) === art, prev = (k) => keep && artOf(k) === keep;
  const out = keys.filter((k) => !mine(k) && !prev(k));
  let over = keys.length - out.length - cap;
  for (const pass of [prev, mine]) for (const k of oldestFirst) { if (over <= 0) break; if (pass(k)) { out.push(k); over--; } }
  return out;
}
// chunkstore.js tidy, keeping the build before's chunks (the cap counts both)
export async function tidyKeep(art, keep, cap) {
  if (!can()) return;
  try {
    const db = await openDb();
    if (!db) return;
    const st = () => db.transaction(STORE, 'readwrite').objectStore(STORE);
    const keys = (await timeout(req(st().getAllKeys()), WAIT_MS, null)) || [];
    const old = keys.length > cap ? (await timeout(req(st().index('at').getAllKeys()), WAIT_MS, null)) || keys : keys;
    const drop = toDrop(keys, art, keep, cap, old);
    if (drop.length) { const s = st(); for (const k of drop) s.delete(k); }
  } catch { /* best effort */ }
}
// this build's key for a chunk -> the build before's (null: no build before kept)
export const prevKey = (ck, art, prev) => (prev && ck && ck.startsWith(`${art}|`) ? `${prev}|${ck.slice(art.length + 1)}` : null);
