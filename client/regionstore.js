// World v3's regions kept in the browser (docs/WORLD-V3.md 8.12): a returning player's window comes from here, and the
// city worker (client/worldgen.js, client/worldwindow.js) downloads only the region files it hasn't kept. IndexedDB
// 'cla-regions': each file as it came from the server (gzipped: the index about 0.7 MB, a region 35-260 KB), keyed by
// its name under the world - `${world}:${seed}` (version.json's world hash with '-v3', and the seed) - and a new world
// clears the old one's. Every file is checked against the index's signatures as it's assembled (a kept file that isn't
// the server's is dropped and fetched again). Best-effort, as client/worldcache.js: no storage is just a miss.
const DB = 'cla-regions', STORE = 'files', WAIT_MS = 4000, MARK = '@world';

const timeout = (p, ms, v) => Promise.race([p, new Promise((res) => setTimeout(() => res(v), ms))]);
function openDb() {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return timeout(new Promise((res) => {
    let rq;
    try { rq = indexedDB.open(DB, 1); } catch { res(null); return; }
    rq.onupgradeneeded = () => { try { rq.result.createObjectStore(STORE); } catch { /* there already */ } };
    rq.onsuccess = () => res(rq.result);
    rq.onerror = () => res(null);
    rq.onblocked = () => res(null);
  }), WAIT_MS, null);
}
// one request in its own transaction: its result (a read) or true (a write), v on any failure
function req(db, mode, fn, v = null) {
  if (!db) return Promise.resolve(v);
  return timeout(new Promise((res) => {
    try {
      const tx = db.transaction(STORE, mode), rq = fn(tx.objectStore(STORE));
      if (mode === 'readonly') { rq.onsuccess = () => res(rq.result === undefined ? null : rq.result); rq.onerror = () => res(v); } else { tx.oncomplete = () => res(true); tx.onerror = tx.onabort = () => res(v); }
    } catch { res(v); }
  }), WAIT_MS * 2, v);
}

// the store for one world: { get(name) -> its bytes or null, put(name, bytes) -> true once kept, drop(name), kept() }
export function regionStore(world) {
  let dbP = null, marked = null;
  const db = () => (dbP ||= openDb());
  const mark = (d) => (marked ||= (async () => {   // (another world's files go the first time this one keeps one)
    if ((await req(d, 'readonly', (s) => s.get(MARK))) !== world) { await req(d, 'readwrite', (s) => s.clear(), false); await req(d, 'readwrite', (s) => s.put(world, MARK), false); }
  })());
  const key = (name) => `${world}/${name}`;
  return {
    async get(name) { const v = await req(await db(), 'readonly', (s) => s.get(key(name))); return v && v.world === world && v.bytes instanceof Uint8Array ? v.bytes : null; },
    async put(name, bytes) { const d = await db(); if (!d) return false; await mark(d); return req(d, 'readwrite', (s) => s.put({ world, at: Date.now(), bytes }, key(name)), false); },
    async drop(name) { return req(await db(), 'readwrite', (s) => s.delete(key(name)), false); },
    async kept() { return req(await db(), 'readonly', (s) => s.getAllKeys(), []); },
  };
}
// forget every kept file (the world's files weren't the server's world: client/main.js)
export async function dropRegions() { const d = await openDb(); await req(d, 'readwrite', (s) => s.clear(), false); try { if (d) d.close(); } catch { /* closed */ } }
