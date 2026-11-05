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
const lsGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch { /* private mode, full */ } };
// World v3's world: the server ran it last time ('cla.world': main.js worldChanged keeps 'v3' or 'today'), ?world=v3
// says it does, or - not told yet (a first visit, or the first since the server changed worlds) - version.json's `live`
// says it's the live world (shared/liveworld.js). Its city and its art are keyed apart from today's (docs/WORLD-V3.md
// 8.23, step 0 a and b): version.json's world3 and art3 with '-v3' after them, as the server serves them
// (server/worldcdn.js worldKey, server/artcdn.js artKey)
const WORLD_TOLD = lsGet('cla.world');
let V3 = WORLD_TOLD === 'v3' || /[?&]world=v3\b/.test(location.search);
const v3Key = (a, b) => `${a || b}-v3`;

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
  // (client/bootplan.js: loaded only for a new build - index.html preloads it beside this file, so it costs no round trip)
  const { updatePlan } = await import('./bootplan.js');
  const plan = updatePlan(meta, last ? had : null, /[?&]art=1\b/.test(location.search));
  if (update && !plan.diff && self.caches) { // the service worker's offline copies are from the old build
    try { for (const k of await caches.keys()) if (k.startsWith('city-life-auto-')) await caches.delete(k); } catch { /* best effort */ }
  }
  // the page's code is waited for (an old module from the HTTP cache must not run beside new ones); the pictures, the
  // fonts and server/ are fetched in the background once the game is up (bootplan.js)
  const list = plan.now;
  const status = document.getElementById('t-status');
  let done = 0, failed = 0;
  const say = () => { if (status && update) status.textContent = `Updating to the latest version... ${Math.round((done / Math.max(1, list.length)) * 100)}%`; };
  if (update) say();
  const fetcher = (files, count) => async () => {
    while (files.length) {
      const f = files.shift();
      try { const r = await fetch(f, { cache: 'reload' }); if (!r.ok && count) failed++; } catch { if (count) failed++; /* offline */ }
      if (count) { done++; BOOT.fetched = done; say(); }
    }
  };
  const worker = fetcher(list.slice(), true);
  const background = (files) => setTimeout(() => { const fl = files.slice(), f = fetcher(fl, false); Promise.all([f(), f()]).catch(() => {}); }, 20000);
  const remember = () => {
    lsSet(KEY, meta.version);
    if (Array.isArray(meta.hashes)) { const o = {}; (meta.files || []).forEach((f, k) => { o[f] = meta.hashes[k]; }); lsSet(FILES, JSON.stringify(o)); }
  };
  if (!update) {
    // a first visit: nothing old to mix in (the modules come from the network) - play now, and fetch the rest for
    // the offline copy once the game is up
    BOOT.fresh = true;
    remember();
    background([...list, ...plan.later]);
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
  const reload = ok && !forced && !!last && plan.reload;
  if (!reload) {
    background(plan.later);
    // a new stylesheet alone: swapped in place, the old one dropped once the new one is in (no second start of the page)
    if (ok && plan.css) {
      const old = document.querySelector('link[rel="stylesheet"][href^="client/style.css"]');
      if (old) { const n = old.cloneNode(); n.href = `client/style.css?v=${meta.version}`; n.onload = () => old.remove(); old.after(n); }
    }
  }
  return reload;
}

// the city, started now in its own worker (client/worldgen.js): the seed the server ran last time (it hardly ever
// changes), kept under the world's hash when this page's modules are that build's; the worker downloads the game
// server's region files of it (server/worldcdn.js: its address as main.js works it out, client/config.js) before it
// builds it (not offline, nor with ?worldcdn=0)
function startWorld() {
  if (typeof Worker === 'undefined') return null;
  const seed = (Number(lsGet(SEED)) >>> 0) || 1337;
  const v3 = V3;
  const key = META && META.world ? `${v3 ? v3Key(META.world3, META.world) : META.world}:${seed}` : null;
  let w;
  try { w = new Worker(new URL('./worldgen.js', import.meta.url), { type: 'module', name: 'city' }); } catch { return null; }
  const job = { seed, key, from: null, ms: 0, stored: null, worker: w };
  let fail = null;
  job.promise = new Promise((res, rej) => {
    fail = rej;
    w.onmessage = (e) => {
      const m = e.data || {};
      if (m.ok === true) { job.from = m.from; job.ms = m.ms; job.win = m.win || null; res(m.data); }   // (win: World v3's window - the worker stays, moving it: main.js)
      else if (m.ok === false) { rej(new Error(m.error || 'the city could not be built')); w.terminate(); }
      else if ('stored' in m) { job.stored = m.stored; w.terminate(); }
      else if ((m.window || m.windowError) && job.onWindow) job.onWindow(m);
    };
    w.onerror = (e) => { rej(new Error((e && e.message) || 'the city worker failed')); w.terminate(); };
  });
  job.promise.catch(() => {});
  let at = null;   // (World v3: the window round where this player was last - main.js keeps it)
  try { at = v3 ? JSON.parse(lsGet('cla.at3') || 'null') : null; } catch { at = null; }
  let fresh3 = false;   // (World v3: the files this browser had weren't the server's world - main.js windowNotServers: none kept, none cached)
  try { fresh3 = v3 && sessionStorage.getItem('cla.fresh3') === '1'; sessionStorage.removeItem('cla.fresh3'); } catch { fresh3 = false; }
  const post = (base) => { try { w.postMessage({ seed, key, keep: BOOT.fresh && !v3, base, at, fresh3, window: !/[?&]wholeworld\b/.test(location.search) }); } catch { fail(new Error('the city worker could not start')); w.terminate(); } };
  if (!key || navigator.onLine === false || /[?&]worldcdn=0\b/.test(location.search)) post(null);
  else import('./config.js').then(({ serverUrl }) => { const u = new URL(serverUrl()); post(`${u.protocol === 'wss:' ? 'https:' : 'http:'}//${u.host}/world/`); }).catch(() => post(null));
  return job;
}

if (await freshen()) {
  const u = new URL(location.href);
  u.searchParams.set('fresh', Date.now().toString(36));
  location.replace(u.href);
} else {
  BOOT.done = performance.now();
  if (!V3 && WORLD_TOLD !== 'today' && META && META.live === 'v3') V3 = true;
  BOOT.v3 = V3;   // (the world this page builds: main.js worldChanged compares the server's with it)
  window.CLA_WORLD = /[?&]cityonpage\b/.test(location.search) ? null : startWorld();   // (?cityonpage: build it on the page, as before)
  // baked chunks are kept under this build of the art (art2/game/chunkstore.js) - only when the modules are that build's
  window.CLA_ART_KEY = BOOT.fresh && META && META.art && !/[?&]nokeep\b/.test(location.search) ? (V3 ? v3Key(META.art3, META.art) : META.art) : null;
  await import('./main.js');
}
