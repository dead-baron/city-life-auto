// Boot loader: make sure this browser runs the newest build, and start building the city straight away.
// GitHub Pages serves files with a 10-minute cache, so right after an update the browser could mix old and new
// modules. We fetch version.json uncached (no-store plus a throwaway query - some browsers, Edge on Xbox among them,
// cache it anyway); if it differs from the build this browser last ran, the files that changed since that build
// (version.json has each file's hash; this browser keeps the last build's) are re-fetched with cache: 'reload'
// (refreshing the HTTP cache), code first, then the art. Not knowing the last build's files, it re-fetches them all.
//  * An update (a new build since this browser last played) waits for that - up to a minute, with progress on the
//    title screen. When the page itself changed (index.html, this loader, the stylesheet) it then reloads once, so
//    the page is the new one too; otherwise the game simply starts on the new modules.
//  * A forced update (client/update.js reloads with ?fresh= after the server announced a new build, or Settings →
//    Repair) waits for it the same way, without the extra reload.
//  * A first visit has nothing old to mix in: the game starts at once, and the rest of the files (the offline copy
//    practice mode plays from) are fetched a little later in the background.
// Then the city: client/worldgen.js builds it (or reads back the one this browser kept) in a worker while the game's
// code loads and connects - window.CLA_WORLD, which main.js takes when the server says which city it runs.
// window.CLA_BUILD / CLA_BUILT say which build this page is (client/update.js compares it with the server's).
const KEY = 'cla.build', FILES = 'cla.files', SEED = 'cla.seed';
const BOOT = (window.CLA_BOOT = { start: performance.now(), done: 0, fetched: 0, fresh: false });   // (main.js's load timeline)
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const isArt = (f) => (/\.(png|webp|woff)$/.test(f) ? 1 : 0);
const PAGE = new Set(['index.html', 'client/boot.js', 'client/style.css', 'manifest.webmanifest']);   // (a change here needs a reload)
const lsGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch { /* private mode, full */ } };

async function readMeta() {
  try {
    const r = await fetch(`version.json?b=${Date.now().toString(36)}`, { cache: 'no-store' });
    return r.ok ? await r.json() : null;
  } catch { return null; }
}

// returns true when the page should be reloaded into the new build
let META = null;
async function freshen() {
  const meta = (META = await Promise.race([readMeta(), wait(8000).then(() => null)]));
  if (!meta || !meta.version) return false;
  window.CLA_BUILD = meta.version; window.CLA_BUILT = meta.built;
  const last = lsGet(KEY);
  const ver = document.getElementById('t-ver');
  if (ver) ver.textContent = `build ${meta.version.slice(0, 7)} · ${String(meta.built || '').slice(0, 16).replace('T', ' ')} UTC`;
  if (meta.version === last) { BOOT.fresh = true; return false; }
  const forced = new URLSearchParams(location.search).has('fresh');
  // the files of the build this browser has: only what changed since is fetched again. (No build stamp but the files
  // known: main.js outdatedBuild or Settings → Repair cleared it - everything is fetched again.)
  let had = null;
  try { had = JSON.parse(lsGet(FILES) || 'null'); } catch { had = null; }
  const update = forced || !!last || !!had;
  const hashes = Array.isArray(meta.hashes) && meta.hashes.length === (meta.files || []).length ? meta.hashes : null;
  const diff = !!(last && had && hashes);
  if (update && !diff && self.caches) { // the service worker's offline copies are from the old build
    try { for (const k of await caches.keys()) if (k.startsWith('city-life-auto-')) await caches.delete(k); } catch { /* best effort */ }
  }
  // (the classic renderer's picture sheets are skipped: the world is drawn by the new renderer, which makes its
  // own art, so they are only fetched if something asks for them - ?art=1 or a browser that can't run it)
  const classic = /[?&]art=1\b/.test(location.search);
  const v1Sheet = (f) => /^assets\/(atlas\d|prefabs\d|blocks\d|scenes|ground|animals|interiors|chars\/)/.test(f);
  const files = meta.files || [];
  const changed = (f, i) => !diff || had[f] !== hashes[i];
  const list = files.filter((f, i) => (classic || !v1Sheet(f)) && changed(f, i)).sort((a, b) => isArt(a) - isArt(b));
  const pageChanged = !diff || files.some((f, i) => PAGE.has(f) && changed(f, i));
  const status = document.getElementById('t-status');
  let i = 0, done = 0, failed = 0;
  const say = () => { if (status && update) status.textContent = `Updating to the latest version... ${Math.round((done / Math.max(1, list.length)) * 100)}%`; };
  if (update) say();
  const worker = async () => {
    while (i < list.length) {
      const f = list[i++];
      try { const r = await fetch(f, { cache: 'reload' }); if (!r.ok) failed++; } catch { failed++; /* offline */ }
      done++; BOOT.fetched = done; say();
    }
  };
  const remember = () => {
    lsSet(KEY, meta.version);
    if (hashes) { const o = {}; files.forEach((f, k) => { o[f] = hashes[k]; }); lsSet(FILES, JSON.stringify(o)); }
  };
  if (!update) {
    // a first visit: nothing old to mix in (the modules come from the network) - play now, and fetch the rest for
    // the offline copy once the game is up
    BOOT.fresh = true;
    remember();
    setTimeout(() => { Promise.all([worker(), worker()]).catch(() => {}); }, 20000);
    return false;
  }
  let ok = false;
  const all = Promise.all([worker(), worker(), worker(), worker(), worker(), worker()]).then(() => {
    if (failed) return; // try again next time
    ok = true;
    remember();
  });
  await Promise.race([all, wait(60000)]);
  BOOT.fresh = ok;
  return ok && !forced && !!last && pageChanged;
}

// the city, started now in its own worker (client/worldgen.js): the seed the server ran last time (it hardly ever
// changes), kept under the world's hash when this page's modules are that build's
function startWorld() {
  if (typeof Worker === 'undefined') return null;
  const seed = (Number(lsGet(SEED)) >>> 0) || 1337;
  const key = META && META.world ? `${META.world}:${seed}` : null;
  let w;
  try { w = new Worker(new URL('./worldgen.js', import.meta.url), { type: 'module', name: 'city' }); } catch { return null; }
  const job = { seed, key, from: null, ms: 0, stored: null, worker: w };
  job.promise = new Promise((res, rej) => {
    w.onmessage = (e) => {
      const m = e.data || {};
      if (m.ok === true) { job.from = m.from; job.ms = m.ms; res(m.data); }
      else if (m.ok === false) { rej(new Error(m.error || 'the city could not be built')); w.terminate(); }
      else if ('stored' in m) { job.stored = m.stored; w.terminate(); }
    };
    w.onerror = (e) => { rej(new Error((e && e.message) || 'the city worker failed')); w.terminate(); };
  });
  job.promise.catch(() => {});
  try { w.postMessage({ seed, key, keep: BOOT.fresh }); } catch { w.terminate(); return null; }
  return job;
}

if (await freshen()) {
  const u = new URL(location.href);
  u.searchParams.set('fresh', Date.now().toString(36));
  location.replace(u.href);
} else {
  BOOT.done = performance.now();
  window.CLA_WORLD = /[?&]cityonpage\b/.test(location.search) ? null : startWorld();   // (?cityonpage: build it on the page, as before)
  // baked chunks are kept under this build of the art (art2/game/chunkstore.js) - only when the modules are that build's
  window.CLA_ART_KEY = BOOT.fresh && META && META.art && !/[?&]nokeep\b/.test(location.search) ? META.art : null;
  await import('./main.js');
}
