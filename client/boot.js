// Boot loader: make sure this browser runs the newest build. GitHub Pages serves files with a
// 10-minute cache, so right after an update the browser could mix old and new modules. We fetch
// version.json uncached (no-store plus a throwaway query - some browsers, Edge on Xbox among them, cache
// it anyway); if it differs from the build this browser last ran, every listed file is re-fetched with
// cache: 'reload' (refreshing the HTTP cache), code first, then the art.
//  * An update (a new build since this browser last played) waits for that - up to a minute, with
//    progress on the title screen - and then reloads the page once, so the page itself (index.html, this
//    loader) is the new one too, not just the modules.
//  * A forced update (client/update.js reloads with ?fresh= after the server announced a new build, or
//    Settings → Repair) waits for it the same way, without the extra reload.
//  * A first visit only gives it a few seconds (the rest carries on in the background).
// window.CLA_BUILD / CLA_BUILT say which build this page is (client/update.js compares it with the server's).
const KEY = 'cla.build';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const isArt = (f) => (/\.(png|webp|woff)$/.test(f) ? 1 : 0);

async function readMeta() {
  try {
    const r = await fetch(`version.json?b=${Date.now().toString(36)}`, { cache: 'no-store' });
    return r.ok ? await r.json() : null;
  } catch { return null; }
}

// returns true when the page should be reloaded into the new build
async function freshen() {
  const meta = await Promise.race([readMeta(), wait(8000).then(() => null)]);
  if (!meta || !meta.version) return false;
  window.CLA_BUILD = meta.version; window.CLA_BUILT = meta.built;
  let last = null;
  try { last = localStorage.getItem(KEY); } catch { /* private mode */ }
  const ver = document.getElementById('t-ver');
  if (ver) ver.textContent = `build ${meta.version.slice(0, 7)} · ${String(meta.built || '').slice(0, 16).replace('T', ' ')} UTC`;
  if (meta.version === last) return false;
  const forced = new URLSearchParams(location.search).has('fresh');
  const update = forced || !!last;
  const status = document.getElementById('t-status');
  if (update && self.caches) { // the service worker's offline copies are from the old build
    try { for (const k of await caches.keys()) if (k.startsWith('city-life-auto-')) await caches.delete(k); } catch { /* best effort */ }
  }
  // (the classic renderer's picture sheets are skipped: the world is drawn by the new renderer, which makes its
  // own art, so they are only fetched if something asks for them - ?art=1 or a browser that can't run it)
  const classic = /[?&]art=1\b/.test(location.search);
  const v1Sheet = (f) => /^assets\/(atlas\d|prefabs\d|blocks\d|scenes|ground|animals|interiors|chars\/)/.test(f);
  const list = (meta.files || []).filter((f) => classic || !v1Sheet(f)).sort((a, b) => isArt(a) - isArt(b));
  let i = 0, done = 0, failed = 0;
  const say = () => { if (status && update) status.textContent = `Updating to the latest version... ${Math.round((done / Math.max(1, list.length)) * 100)}%`; };
  say();
  const worker = async () => {
    while (i < list.length) {
      const f = list[i++];
      try { const r = await fetch(f, { cache: 'reload' }); if (!r.ok) failed++; } catch { failed++; /* offline */ }
      done++; say();
    }
  };
  let ok = false;
  const all = Promise.all([worker(), worker(), worker(), worker(), worker(), worker()]).then(() => {
    if (failed) return; // try again next time
    ok = true;
    try { localStorage.setItem(KEY, meta.version); } catch { /* ignore */ }
  });
  await Promise.race([all, wait(update ? 60000 : 8000)]);
  return ok && update && !forced;
}

if (await freshen()) {
  const u = new URL(location.href);
  u.searchParams.set('fresh', Date.now().toString(36));
  location.replace(u.href);
} else {
  await import('./main.js');
}
