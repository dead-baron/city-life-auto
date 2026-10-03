// Boot loader: make sure this browser runs the newest build. GitHub Pages serves files with a
// 10-minute cache, so right after an update the browser could mix old and new modules. We fetch
// version.json uncached; if it differs from the build this browser last ran, every listed file is
// re-fetched with cache: 'reload' (refreshing the HTTP cache) before the game modules load.
const KEY = 'cla.build';
async function freshen() {
  let meta = null;
  try { meta = await (await fetch('version.json', { cache: 'no-store' })).json(); } catch { return; }
  let last = null;
  try { last = localStorage.getItem(KEY); } catch { /* private mode */ }
  const ver = document.getElementById('t-ver');
  if (ver && meta) ver.textContent = `build ${meta.version.slice(0, 7)} · ${meta.built.slice(0, 16).replace('T', ' ')} UTC`;
  if (!meta || meta.version === last) return;
  const status = document.getElementById('t-status');
  if (status && last) status.textContent = 'Updating to the latest version...';
  const list = meta.files || [];
  let i = 0;
  const worker = async () => { while (i < list.length) { const f = list[i++]; try { await fetch(f, { cache: 'reload' }); } catch { /* offline */ } } };
  await Promise.all([worker(), worker(), worker(), worker(), worker(), worker()]);
  try { localStorage.setItem(KEY, meta.version); } catch { /* ignore */ }
}
await Promise.race([freshen(), new Promise((r) => setTimeout(r, 8000))]);
await import('./main.js');
