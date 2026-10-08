// The city this browser built, kept between visits (IndexedDB 'cla-world'). Building it from the seed takes a phone
// several seconds; reading it back takes a fraction of one. One entry, keyed `${world}:${seed}` - world is
// version.json's hash of the generator's code (tools/stamp-version.mjs), so a build that changes the world builds
// it again and replaces the entry; a build that doesn't keeps using it. The page checks what it read against the
// server's fingerprint of the world (main.js) and throws it away if they differ.
// Best-effort everywhere: no storage (a private window, storage full or blocked, a browser that stalls) is just a
// miss, and the city is built as before. Worker-safe (client/worldgen.js writes it, the bake workers read it).
const DB = 'cla-world', STORE = 'maps', FMT = 1, WAIT_MS = 4000;

const timeout = (p, ms, v) => Promise.race([p, new Promise((res) => setTimeout(() => res(v), ms))]);

function openDb() {
  return timeout(new Promise((res) => {
    let rq;
    try { rq = indexedDB.open(DB, 1); } catch { res(null); return; }
    rq.onupgradeneeded = () => { try { rq.result.createObjectStore(STORE); } catch { /* there already */ } };
    rq.onsuccess = () => res(rq.result);
    rq.onerror = () => res(null);
    rq.onblocked = () => res(null);
  }), WAIT_MS, null);
}

// the kept world for this key (plain data: shared/map.js cityFromData makes it a CityMap again), or null
export async function readWorld(key) {
  if (!key || typeof indexedDB === 'undefined') return null;
  const db = await openDb();
  if (!db) return null;
  try {
    const v = await timeout(new Promise((res) => {
      const rq = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
      rq.onsuccess = () => res(rq.result || null);
      rq.onerror = () => res(null);
    }), WAIT_MS * 2, null);
    return v && v.fmt === FMT && v.key === key && v.data ? v.data : null;
  } catch { return null; } finally { try { db.close(); } catch { /* closed */ } }
}

// keep this world (and nothing else): true once it is stored
export async function writeWorld(key, data) {
  if (!key || typeof indexedDB === 'undefined') return false;
  const db = await openDb();
  if (!db) return false;
  try {
    return await timeout(new Promise((res) => {
      const tx = db.transaction(STORE, 'readwrite'), st = tx.objectStore(STORE);
      st.clear();
      st.put({ fmt: FMT, key, at: Date.now(), data }, key);
      tx.oncomplete = () => res(true);
      tx.onerror = () => res(false);
      tx.onabort = () => res(false);
    }), 30000, false);
  } catch { return false; } finally { try { db.close(); } catch { /* closed */ } }
}

// forget it (it didn't match the server's world)
export async function dropWorld() {
  if (typeof indexedDB === 'undefined') return;
  const db = await openDb();
  if (!db) return;
  try {
    await timeout(new Promise((res) => { const tx = db.transaction(STORE, 'readwrite'); tx.objectStore(STORE).clear(); tx.oncomplete = tx.onerror = tx.onabort = () => res(); }), WAIT_MS, null);
  } catch { /* best effort */ } finally { try { db.close(); } catch { /* closed */ } }
}
