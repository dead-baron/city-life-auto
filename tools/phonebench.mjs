// The phone benchmark: the game as the owner's Pixel 7 Pro gets it (11-04: "chugging and loading art slowly"), measured
// the same way each time so a fix shows as a number. A local server (World v3, dev mode) and headless Chromium:
// a 892x412 landscape screen at 3.5 device pixels per CSS pixel, touch, a phone's user agent and the Medium preset a
// phone gets, the CPU slowed 4x (CDP Emulation.setCPUThrottlingRate) and DevTools' "Fast 4G" network.
//   title    the studio logo's first frame, the title menu ready (PLAY enabled, nothing over it), the bytes and requests
//   city     PLAY to the first art on screen and to the whole screen drawn (main.js's load timeline: window.CLA.load)
//   drive    a car driven through the city: frames with an on-screen chunk missing (a stand-in drawn), bake times
//   teleport the dev teleport to the farthest district: until the whole screen is drawn there
//   smooth   frame times p50/p95/p99, long tasks, the JS heap (its rise and its drops: garbage collected) while driving
//   profile  (--profile) the CDP profiler's top functions by self time, during the load and the drive
// Each run is a fresh browser profile (a first visit) then the page reloaded in it (a returning player: the city and
// the chunks kept in IndexedDB). Heavy - run it under `flock /tmp/cla-heavy.lock`, nothing else at the same time:
//   node tools/phonebench.mjs [--out file.json] [--cpu 4] [--drive 30] [--profile] [--port 8090] [--url http://...]
// Caveats: this machine has no GPU (WebGL runs in SwiftShader on the CPU, so the GPU side is far slower than a
// phone's) and 2 cores (a phone has 8: the bake workers share them with the server); CPU throttling slows the page's
// thread, not its workers. Compare runs with each other, not with the phone.
import { spawn } from 'node:child_process';
import { writeFileSync, readFileSync, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { join, normalize, extname } from 'node:path';
import { gzipSync } from 'node:zlib';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
// --root <dir>: run another build (a snapshot: git archive <commit> client shared assets server index.html manifest.webmanifest
// version.json sw.js package.json) - its server and its page, the art and the city kept in this tree's data/ (the same chunks)
const SRC = process.argv.includes('--root') ? join(process.argv[process.argv.indexOf('--root') + 1], '/') : ROOT;
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i < 0 ? d : process.argv[i + 1] === undefined || process.argv[i + 1].startsWith('--') ? true : process.argv[i + 1]; };
const PORT = +arg('port', 8090), CPU = +arg('cpu', 4), CITY_CPU = +arg('citycpu', 1), DRIVE_S = +arg('drive', 30), PROFILE = !!arg('profile', false), OUT = arg('out', null);
const req = createRequire(import.meta.url);
let pw;
for (const p of ['playwright', '/opt/npm-tools/node_modules/playwright', '/home/claude/.npm-global/lib/node_modules/playwright']) { try { pw = req(p); break; } catch { /* next */ } }
if (!pw) { console.error('playwright not found'); process.exit(1); }
const t0 = Date.now(), log = (s) => console.log(`[${((Date.now() - t0) / 1000).toFixed(0)} s] ${s}`);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- the server --------------------------------------------------------------------------------------------------
let server = null;
async function startServer() {
  server = spawn(process.execPath, ['server/index.js'], { cwd: SRC, env: { CLA_ART_PREWARM: 'none', CLA_DATA_DIR: join(ROOT, 'data'), ...process.env, CLA_WORLD: 'v3', CLA_DEV: '1', PORT: String(PORT) }, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  server.stderr.on('data', (d) => { out += d; });
  await new Promise((res, rej) => {
    server.stdout.on('data', (d) => { out += d; if (/listening on/.test(out)) res(); });
    server.on('exit', (c) => { log(`server exited ${c}: ${out.slice(-400)}`); rej(new Error('server exited')); });
  });
  await wait(4000);   // (the region files written: worldcdn's delay)
}
// the page's files as GitHub Pages serves them (gzipped, a 10-minute cache, ETags), the game at the local server
// (?server=): the dev server's own static files are neither gzipped nor cached, which no player ever gets
let pages = null;
function startPages(port, root = ROOT) {
  const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.woff': 'font/woff', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.txt': 'text/plain' };
  const zipped = new Map();
  pages = createServer((q, s) => {
    let p = decodeURIComponent(new URL(q.url, 'http://x').pathname);
    if (p === '/') p = '/index.html';
    const f = join(root, normalize(p).replace(/^[/\\]+/, ''));
    if (!f.startsWith(root) || !existsSync(f) || !statSync(f).isFile()) { s.writeHead(404); s.end(); return; }
    const st = statSync(f), etag = `"${st.size.toString(36)}-${Math.round(st.mtimeMs).toString(36)}"`, type = TYPES[extname(f)] || 'application/octet-stream';
    const head = { 'content-type': type, 'cache-control': 'max-age=600', etag, 'access-control-allow-origin': '*' };
    if (q.headers['if-none-match'] === etag) { s.writeHead(304, head); s.end(); return; }
    let body = readFileSync(f);
    if (/text|json|javascript|manifest|svg/.test(type) && /gzip/.test(q.headers['accept-encoding'] || '')) {
      if (!zipped.has(f + etag)) zipped.set(f + etag, gzipSync(body, { level: 6 }));
      body = zipped.get(f + etag); head['content-encoding'] = 'gzip';
    }
    head['content-length'] = body.length;
    s.writeHead(200, head); s.end(body);
  });
  return new Promise((r) => pages.listen(port, '127.0.0.1', r));
}
const stop = () => { if (server) { server.kill('SIGTERM'); server = null; } if (pages) { pages.close(); pages = null; } };
process.on('exit', stop);

// ---- in the page, from its first line: frames, long tasks, the chunks on screen, the heap ------------------------
function probe() {
  const B = (window.__bench = { ft: [], miss: 0, frames: 0, longN: 0, longMs: 0, heap: [], marks: {}, rec: false, missStreak: 0, chunkMiss: 0 });
  try { new PerformanceObserver((l) => { if (!B.rec) return; for (const e of l.getEntries()) { B.longN++; B.longMs += e.duration; } }).observe({ entryTypes: ['longtask'] }); } catch { /* none */ }
  let last = 0;
  const onScreenMissing = () => {
    const w = window.CLA && window.CLA.S && window.CLA.S.art2, E = w && w.E;
    if (!E || !E.hasChunk || !(w.vx1 > w.vx0)) return -1;
    const C = 768, c0 = Math.floor(w.vx0 / C), c1 = Math.floor((w.vx1 - 1) / C), r0 = Math.floor(w.vy0 / C), r1 = Math.floor((w.vy1 - 1) / C);
    let m = 0;
    for (let cy = r0; cy <= r1; cy++) for (let cx = c0; cx <= c1; cx++) if (cx >= 0 && cy >= 0 && !E.hasChunk(cx, cy)) m++;
    return m;
  };
  B.missing = onScreenMissing;
  const tick = (now) => {
    if (B.rec) {
      if (last) B.ft.push(now - last);
      B.frames++;
      const m = onScreenMissing();
      if (m > 0) { B.miss++; B.chunkMiss += m; }
    }
    last = now;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  setInterval(() => { if (B.rec && performance.memory) B.heap.push(performance.memory.usedJSHeapSize); }, 250);
  // the title path: the splash's first drawn frame (its canvas shown), the menu ready
  const poll = () => {
    const now = performance.now(), sp = document.getElementById('splash');
    if (!B.marks.logo && sp && sp.style.opacity === '1') B.marks.logo = performance.timeOrigin + now;
    const play = document.getElementById('play'), title = document.getElementById('title');
    if (!B.marks.menu && play && !play.disabled && title && !title.classList.contains('loading') && !title.classList.contains('cla-in') && !document.getElementById('splash')) B.marks.menu = performance.timeOrigin + now;
    if (!B.marks.menu) setTimeout(poll, 16);
  };
  poll();
}

const pct = (a, p) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return +s[Math.min(s.length - 1, Math.floor(s.length * p))].toFixed(1); };
const r1 = (v) => Math.round(v * 10) / 10;

async function waitFor(page, fn, ms, arg) {   // (through the page's own reloads: an update's)
  const end = Date.now() + ms;
  while (Date.now() < end) { try { await page.waitForFunction(fn, arg, { timeout: end - Date.now(), polling: 100 }); return true; } catch (e) { if (!/context|navigat|destroyed/i.test(String(e && e.message))) return false; await wait(200); } }
  return false;
}

// the CDP profiler's samples as the functions that spent the most time themselves
function topSelf(profile, n = 15) {
  const byId = new Map(profile.nodes.map((x) => [x.id, x]));
  const dt = profile.timeDeltas, self = new Map();
  for (let i = 0; i < profile.samples.length; i++) {
    const nd = byId.get(profile.samples[i]); if (!nd) continue;
    const cf = nd.callFrame, k = `${cf.functionName || '(anon)'} ${cf.url.replace(/^.*?\/(client|shared)\//, '$1/')}:${cf.lineNumber + 1}`;
    self.set(k, (self.get(k) || 0) + (dt[i] || 0));
  }
  const tot = [...self.values()].reduce((a, b) => a + b, 0);
  return [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, us]) => ({ fn: k, ms: Math.round(us / 1000), pct: r1((100 * us) / tot) }));
}

async function session(ctx, label, first, upd = null) {
  const page = await ctx.newPage();
  // a returning player across an update: this browser last ran the build in --update <old version.json> (boot.js fetches what changed)
  if (upd) { await page.goto(`${BASE}/version.json`); await page.evaluate((v) => { localStorage.setItem('cla.build', v.version); const o = {}; v.files.forEach((f, i) => { o[f] = v.hashes[i]; }); localStorage.setItem('cla.files', JSON.stringify(o)); }, upd); }
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Network.enable');
  // DevTools' Fast 4G: 9 Mbps down, 1.5 up, 60 ms (x2.75 for the latency DevTools adds: 165), at 90% of the line rate
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 165, downloadThroughput: (9e6 * 0.9) / 8, uploadThroughput: (1.5e6 * 0.9) / 8 });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU });
  const R = { label };
  // every response, the workers' too (the city's region files, the server's chunks): KB by kind, for each phase
  const NET = { phase: 'title', by: {} };
  const kind = (u) => (/\/world\//.test(u) ? 'world' : /\/art\//.test(u) ? 'art' : /\.js(\?|$)/.test(u) ? 'code' : 'other');
  const onRes = (res) => { const len = +(res.headers()['content-length'] || 0), b = (NET.by[NET.phase] ||= {}), k = kind(res.url()); b[k] = b[k] || { n: 0, kb: 0 }; b[k].n++; b[k].kb += len / 1024; };
  ctx.on('response', onRes);
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message || e).slice(0, 200)));
  // World v3's window moves (main.js keepWindow's line): how long the worker assembled it, how long the page took to swap it in
  const swaps = [];
  page.on('console', (m) => { const t = m.text(), q = /the window moved to .*assembled in (\d+) ms, swapped in (\d+) ms/.exec(t); if (q) swaps.push({ assembleMs: +q[1], swapMs: +q[2] }); });
  if (PROFILE) { await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 500 }); await cdp.send('Profiler.start'); }
  // ---- title
  const tNav = Date.now();
  await page.goto(`${BASE}/?debug&splash${GAME ? `&server=${encodeURIComponent(GAME)}` : ''}`, { waitUntil: 'commit' });
  // the page's thread slowed until the studio logo is up (the boot's own work; an update's reload: its boot); then not (see --citycpu: the city
  // starts while the title is up for a returning player, and slowed WebGL here stalls everything behind it)
  await waitFor(page, () => window.__bench && (window.__bench.marks.logo || (/[?&]fresh\b/.test(location.search) && window.CLA_BOOT && window.CLA_BOOT.done)), 15000);
  if (CITY_CPU !== CPU) await cdp.send('Emulation.setCPUThrottlingRate', { rate: CITY_CPU });
  const menuOk = await waitFor(page, () => window.__bench && window.__bench.marks.menu, 120000);
  const tm = await page.evaluate((tNav) => {
    const B = window.__bench, nav = performance.getEntriesByType('navigation')[0], menuAt = B.marks.menu - performance.timeOrigin;
    const res = performance.getEntriesByType('resource').filter((e) => e.startTime <= menuAt);
    const bytes = res.reduce((a, e) => a + (e.transferSize || 0), nav ? nav.transferSize || 0 : 0);
    return { logo: B.marks.logo ? Math.round(B.marks.logo - tNav) : null, menu: Math.round(B.marks.menu - tNav), requests: res.length + 1, kb: Math.round(bytes / 1024), load: Math.round(nav ? nav.loadEventEnd : 0), reloaded: performance.timeOrigin - tNav > 1000 };
  }, tNav);
  R.title = { ...tm, ok: menuOk };
  NET.phase = 'city';
  log(`${label}: logo ${tm.logo} ms, menu ${tm.menu} ms, ${tm.requests} requests, ${tm.kb} KB (load event ${tm.load})`);
  // ---- PLAY to the city: with the page's thread at --citycpu (1: not slowed): this machine's WebGL runs in SwiftShader on
  // the CPU, and slowing the page's thread as well made every frame take 2-4 s (0.3 fps at 4x and at 2x; 60 fps at 1x)
  if (CITY_CPU !== CPU) await cdp.send('Emulation.setCPUThrottlingRate', { rate: CITY_CPU });
  // ---- PLAY to the city
  const tPlay = await page.evaluate(() => { document.getElementById('play').click(); return performance.now(); });
  const inCity = await waitFor(page, () => window.CLA && window.CLA.load && window.CLA.load.at.screen, 240000);
  const L = await page.evaluate(() => ({ at: window.CLA.load.at, ms: window.CLA.load.ms, city: window.CLA.load.city }));
  NET.phase = 'settle';
  R.city = { ok: inCity, play: Math.round(tPlay), firstArt: L.at.art ? L.at.art - Math.round(tPlay) : null, screen: L.at.screen ? L.at.screen - Math.round(tPlay) : null, warm: L.at.warm ? L.at.warm - Math.round(tPlay) : null, timeline: L.at, spans: L.ms, cityFrom: L.city };
  log(`${label}: PLAY -> first art ${R.city.firstArt} ms, whole screen ${R.city.screen} ms (${JSON.stringify(L.at)})`);
  if (PROFILE) { const { profile } = await cdp.send('Profiler.stop'); R.profileLoad = topSelf(profile); }
  if (upd) { R.reloads = await page.evaluate(() => performance.getEntriesByType('navigation')[0].type); }
  if (upd || !inCity) { if (!inCity) await page.screenshot({ path: `${OUTDIR}/stuck-${label}.png`, timeout: 8000 }).catch(() => {}); R.errors = errors; await page.close(); return R; }
  // ---- dev mode (the teleport, the car), noon, invincible
  await page.evaluate(() => { const s = window.CLA.send; s({ t: 'devmode', pw: '' }); });
  await wait(800);
  await page.evaluate(() => { const s = window.CLA.send; s({ t: 'dev', c: 'time', m: 720 }); s({ t: 'dev', c: 'wxhold' }); s({ t: 'dev', c: 'god' }); });
  await waitFor(page, () => window.__bench.missing() === 0, 30000);
  // ---- teleport: to the district farthest from here
  NET.phase = 'teleport';   // (on foot: the server's tp moves a walker)
  const dest = await page.evaluate(async () => {
    const S = window.CLA.S, m = await import('./client/devtp.js'), w = S.art2;
    const list = m.teleportPlaces(S.map).filter((p) => p.kind === 'district' || !p.kind);
    let best = null, bd = -1;
    for (const p of list) { const d = Math.hypot(p.x - w.camX, p.y - w.camY); if (d > bd) { bd = d; best = p; } }
    return best ? { name: best.name, x: Math.round(best.x), y: Math.round(best.y), d: Math.round(bd) } : null;
  });
  if (dest) {
    const tp = await page.evaluate(async (d) => {
      const S = window.CLA.S, w = S.art2, B = window.__bench, t = performance.now();
      const x0 = w.camX, y0 = w.camY;
      window.CLA.send({ t: 'dev', c: 'tp', x: d.x, y: d.y, snap: true });
      let moved = 0, drawn = 0, frames = 0, missF = 0;
      await new Promise((res) => {
        const step = () => {
          const now = performance.now();
          if (!moved && Math.hypot(w.camX - x0, w.camY - y0) > 3000) moved = now;
          if (moved) { frames++; const mm = B.missing(); if (mm !== 0) missF++; else if (!drawn) drawn = now; else if (now - drawn > 300) return res(); if (mm !== 0) drawn = 0; }
          if (now - t > 120000) return res();
          requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      });
      return { moved: moved ? Math.round(moved - t) : null, drawn: drawn ? Math.round(drawn - t) : null, framesBlank: missF, frames };
    }, dest);
    R.teleport = { to: dest, ...tp };
    log(`${label}: teleport ${JSON.stringify(R.teleport)}`);
  }
  // ---- a car, then drive
  NET.phase = 'drive';
  await page.evaluate(() => { const s = window.CLA.send; s({ t: 'dev', c: 'car', m: 'sports', in: true }); });
  await wait(2500);
  await waitFor(page, () => window.__bench.missing() === 0, 30000);
  const before = await page.evaluate(() => { const st = window.CLA.S.art2.stats(); return { bakeN: st.t.bakeN || 0, bakeSum: st.t.bakeSum || 0, cdn: st.n.cdn || 0, kept: st.n.kept || 0 }; });
  if (PROFILE) await cdp.send('Profiler.start');
  const m0 = await cdp.send('Performance.enable').then(() => cdp.send('Performance.getMetrics'));
  await page.evaluate(() => { const B = window.__bench; B.ft = []; B.frames = 0; B.miss = 0; B.chunkMiss = 0; B.longN = 0; B.longMs = 0; B.heap = []; B.rec = true; });
  // the drive: full throttle, steering a little; backing out and turning when stuck
  const pos = () => page.evaluate(() => { const w = window.CLA.S.art2; return [w.camX, w.camY]; });
  let p0 = await pos(), dist = 0, stuck = 0, turn = 0;
  const seen = new Set();
  await page.keyboard.down('KeyW');
  const tEnd = Date.now() + DRIVE_S * 1000;
  while (Date.now() < tEnd) {
    await wait(500);
    const p = await pos(), d = Math.hypot(p[0] - p0[0], p[1] - p0[1]);
    dist += d; p0 = p; seen.add(`${Math.floor(p[0] / 768)},${Math.floor(p[1] / 768)}`);
    if (d < 20) { if (++stuck >= 2) { stuck = 0; turn++; await page.keyboard.up('KeyW'); await page.keyboard.down('KeyS'); await page.keyboard.down(turn % 2 ? 'KeyA' : 'KeyD'); await wait(900); await page.keyboard.up('KeyS'); await page.keyboard.up('KeyA'); await page.keyboard.up('KeyD'); await page.keyboard.down('KeyW'); } } else stuck = 0;
  }
  await page.keyboard.up('KeyW');
  const D = await page.evaluate(() => { const B = window.__bench; B.rec = false; return { ft: B.ft, frames: B.frames, miss: B.miss, chunkMiss: B.chunkMiss, longN: B.longN, longMs: B.longMs, heap: B.heap }; });
  const m1 = await cdp.send('Performance.getMetrics');
  const met = (m, k) => (m.metrics.find((x) => x.name === k) || {}).value || 0;
  R.pagePerf = await page.evaluate(() => Object.fromEntries(Object.entries(window.CLA.S.perf || {}).map(([k, v]) => [k, Math.round(v * 100) / 100])));
  const after = await page.evaluate(() => { const st = window.CLA.S.art2.stats(); return { bakeN: st.t.bakeN || 0, bakeSum: st.t.bakeSum || 0, cdn: st.n.cdn || 0, kept: st.n.kept || 0, q: st.q }; });
  let rise = 0, drops = 0;
  for (let i = 1; i < D.heap.length; i++) { const d = D.heap[i] - D.heap[i - 1]; if (d > 0) rise += d; else if (d < -2e5) drops++; }
  const bakes = after.bakeN - before.bakeN;
  R.drive = {
    s: DRIVE_S, distPx: Math.round(dist), chunksVisited: seen.size, frames: D.frames, missFrames: D.miss, missPct: r1((100 * D.miss) / Math.max(1, D.frames)), missChunkFrames: D.chunkMiss,
    bakes, bakeAvgMs: bakes ? Math.round((after.bakeSum - before.bakeSum) / bakes) : null, fromServer: after.cdn - before.cdn, fromKept: after.kept - before.kept, tier: after.q,
  };
  R.smooth = {
    fps: r1(1000 / Math.max(1, pct(D.ft, 0.5))), p50: pct(D.ft, 0.5), p95: pct(D.ft, 0.95), p99: pct(D.ft, 0.99), over50: D.ft.filter((x) => x > 50).length, longTasks: D.longN, longMs: Math.round(D.longMs),
    heapMb: r1((D.heap[D.heap.length - 1] || 0) / 1048576), heapPeakMb: r1(Math.max(0, ...D.heap) / 1048576), allocMbPerS: r1(rise / 1048576 / DRIVE_S), gcDrops: drops,
    scriptS: r1(met(m1, 'ScriptDuration') - met(m0, 'ScriptDuration')), taskS: r1(met(m1, 'TaskDuration') - met(m0, 'TaskDuration')),
  };
  log(`${label}: drive ${JSON.stringify(R.drive)}`);
  log(`${label}: smooth ${JSON.stringify(R.smooth)}`);
  if (PROFILE) { const { profile } = await cdp.send('Profiler.stop'); R.profileDrive = topSelf(profile); }
  ctx.off('response', onRes);
  R.swaps = swaps;
  try { R.reworld = await page.evaluate(() => { const w = window.CLA.S.art2; return w ? { n: w.n.reworld || 0, lastMs: Math.round(w.t.reworld || 0) } : null; }); } catch { R.reworld = null; }
  log(`${label}: window swaps ${JSON.stringify(swaps)} reworld ${JSON.stringify(R.reworld)}`);
  for (const b of Object.values(NET.by)) for (const v of Object.values(b)) v.kb = Math.round(v.kb);
  R.net = NET.by;
  log(`${label}: net ${JSON.stringify(NET.by)}`);
  R.errors = errors.slice(0, 5);
  await page.close();
  return R;
}

const OUTDIR = arg('outdir', '/tmp');
let BASE = arg('url', null), GAME = arg('game', null);
// --pages <dir>: the page's files from there (a snapshot of another build: before and after) beside a running game server
if (BASE && arg('pages', null)) { await startPages(+arg('pport', 8092), join(arg('pages'), '/')); BASE = `http://127.0.0.1:${+arg('pport', 8092)}`; }
if (!BASE) {
  log('starting the server (World v3, dev)'); await startServer(); log('server up');
  if (arg('devstatic', false)) BASE = `http://127.0.0.1:${PORT}`;
  else { await startPages(PORT + 1, SRC); BASE = `http://127.0.0.1:${PORT + 1}`; GAME = `ws://127.0.0.1:${PORT}/ws`; }
  // --serve: keep the two servers up (the benchmark runs against them with --url and --game) until killed
  if (arg('serve', false)) { log(`serving: --url ${BASE} --game ${GAME}`); await new Promise((r) => { process.on('SIGTERM', r); process.on('SIGINT', r); }); stop(); process.exit(0); }
}
const browser = await pw.chromium.launch();
const results = { at: new Date().toISOString(), cpu: CPU, cityCpu: CITY_CPU, net: 'fast4g', screen: '892x412@3.5', runs: [] };
try {
  const ctx = await browser.newContext({
    viewport: { width: 892, height: 412 }, deviceScaleFactor: +arg('dsf', 1), isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
  });
  await ctx.addInitScript(probe);
  await ctx.addInitScript(() => { try { if (!localStorage.getItem('cla.settings')) localStorage.setItem('cla.settings', JSON.stringify({ gfxPreset: 'medium' })); } catch { /* none */ } });   // (a phone's preset: this machine's software GPU would pick Low)
  results.runs.push(await session(ctx, 'first visit', true));
  results.runs.push(await session(ctx, 'returning', false));
  if (arg('update', null)) results.runs.push(await session(ctx, 'after an update', false, JSON.parse(readFileSync(arg('update'), 'utf8'))));
  await ctx.close();
} finally { await browser.close(); stop(); }
if (OUT) writeFileSync(OUT, JSON.stringify(results, null, 1));
log('done');
