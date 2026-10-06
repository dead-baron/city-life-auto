// Updates that always take. The game server says which build it runs (the welcome, then a 'build' message
// whenever a new one lands - server/build.js); this page knows its own (window.CLA_BUILD / CLA_BUILT from
// client/boot.js). When the server's build is newer - or, with no server build known (offline practice, an
// older server), version.json on the web shows a newer one (checked every minute) - the page:
//  1. shows a small "Updating to the latest version..." notice (the game carries on meanwhile);
//  2. waits until version.json (uncached) serves that build - GitHub Pages can lag the game server by a
//     minute or two - looking every 5 s, for up to 3 minutes (then it goes ahead anyway);
//  3. hard-refreshes: drops this game's service-worker caches, forgets the last build (so boot.js re-fetches
//     every file with cache: 'reload'), refreshes the page's own cached copy and reloads with ?fresh=.
// The server puts players back fresh at a spawn point when they return on the new build (players.join).
// Never a reload loop: a device that keeps coming back on the old build tries again at most every 30 s
// (sessionStorage), and after a few tries leaves it to the player.
const KEY = 'cla.build', TRY = 'cla.updateTry';
const POLL_MS = 60000, CHECK_MS = 5000, GIVE_UP_MS = 180000, RETRY_MS = 30000, MAX_TRIES = 5;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const bust = () => Date.now().toString(36);

function lsGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
function readTry() { try { return JSON.parse(sessionStorage.getItem(TRY) || 'null'); } catch { return null; } }
function writeTry(t) { try { sessionStorage.setItem(TRY, JSON.stringify(t)); } catch { /* blocked */ } }

// this page's build: { v: version id, at: build time (epoch ms) }
const mine = { v: (typeof window !== 'undefined' && window.CLA_BUILD) || lsGet(KEY) || null, at: Date.parse((typeof window !== 'undefined' && window.CLA_BUILT) || '') || 0 };
let server = null;   // { v, at } as the game server last said (null: not told)
let pending = null;  // the build this page is updating to
let gaveUp = false;  // tried too often: left to the player
let el = null;

{ const t = readTry(); if (t && t.v === mine.v) { try { sessionStorage.removeItem(TRY); } catch { /* blocked */ } } } // it took

export function myBuild() { return mine; }

// The server's build (welcome / 'build'). Returns true when this page is updating to it.
export function noteServerBuild(v, at) {
  if (!v) return false;
  server = { v: String(v), at: Number(at) || 0 };
  if (!mine.v || server.v === mine.v) return false;
  if (server.at && mine.at && server.at < mine.at) return false; // the server is behind this page (the web got the push first): it will catch up
  return begin(server.v);
}

async function readMeta() {
  try {
    const r = await fetch(`version.json?b=${bust()}`, { cache: 'no-store' });
    return r.ok ? await r.json() : null;
  } catch { return null; }
}

// every minute: is there a newer build on the web? Followed when the server isn't saying (if it is,
// the server leads: it announces a new build once it has it)
async function poll() {
  if (pending || !mine.v || (typeof document !== 'undefined' && document.hidden)) return;
  const m = await readMeta();
  if (!m || !m.version || m.version === mine.v) return;
  const at = Date.parse(m.built) || 0;
  if (at && mine.at && at < mine.at) return; // an older copy (a stale cache somewhere)
  if (server && server.v !== m.version) return;
  begin(m.version);
}
if (typeof window !== 'undefined') setInterval(poll, POLL_MS);

function notice(text, busy = true) {
  if (typeof document === 'undefined') return;
  if (!el) { el = document.createElement('div'); el.id = 'upd-note'; document.body.appendChild(el); }
  el.textContent = text;
  el.classList.toggle('busy', busy);
  const title = document.getElementById('title'), st = document.getElementById('t-status');
  if (st && title && !title.classList.contains('hidden')) st.textContent = text;
}

// returns true while an update to v is under way
function begin(v) {
  if (pending === v) return !gaveUp;
  pending = v; gaveUp = false;
  const t = readTry(), mineTry = t && t.v === v;
  if (mineTry && t.n >= MAX_TRIES) { gaveUp = true; notice('A new version is out - reload the page to get it.', false); return false; }
  notice('Updating to the latest version...');
  const since = mineTry ? Date.now() - t.t : Infinity;
  setTimeout(() => waitForWeb(v), Math.max(0, RETRY_MS - since));
  return true;
}

// GitHub Pages can lag the game server: wait until the web serves this build (or give up waiting and go)
async function waitForWeb(v) {
  const t0 = Date.now();
  for (;;) {
    if (pending !== v) return; // an even newer build came along
    const m = await readMeta();
    if ((m && m.version === v) || Date.now() - t0 > GIVE_UP_MS) break;
    await wait(CHECK_MS);
  }
  if (pending === v) hardRefresh(v);
}

async function hardRefresh(v) {
  const t = readTry();
  writeTry({ v, t: Date.now(), n: (t && t.v === v ? t.n : 0) + 1 });
  try { if (self.caches) for (const k of await caches.keys()) if (k.startsWith('city-life-auto-')) await caches.delete(k); } catch { /* best effort */ }
  try { localStorage.removeItem(KEY); } catch { /* blocked */ }
  // the page and its loader come with a 10-minute cache of their own
  await Promise.race([Promise.all(['./', 'index.html', 'client/boot.js', 'manifest.webmanifest'].map((f) => fetch(f, { cache: 'reload' }).catch(() => null))), wait(8000)]);
  try { const r = navigator.serviceWorker && await navigator.serviceWorker.getRegistration(); if (r) r.update().catch(() => {}); } catch { /* no worker */ }
  const u = new URL(location.href);
  u.searchParams.set('fresh', bust());
  location.replace(u.href);
}
