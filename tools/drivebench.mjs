// The long-drive benchmark (2026-11-06, the owner's Pixel 7 Pro "starting to chug" after driving around a while): the game
// as that phone shows it - a 411x891 portrait screen at 2.6 device pixels per CSS pixel, touch, a phone's user agent, the
// Medium preset, the debug menu's performance readout on - driven for some minutes through town (houses, downtown, across
// districts and the World v3 window's region borders), at night in the rain, by an autopilot that follows the GPS route
// (client/route.js) from district to district. Measured, the same way each run so a fix shows as a number:
//   frames     p50 / p95 / p99 frame time and the frames over 50 ms (each minute, and over the whole drive)
//   long tasks how many and how long (PerformanceObserver 'longtask'), and what each was: every task the page runs is
//              timed where it starts (animation frames, worker / socket / channel messages, timers, IndexedDB events); a
//              long one is put down to its kind and source, an animation frame to the parts of the frame that took it
//              (main.js's S.perf marks and the renderer's own: art2 host part - their running averages unwound)
//   art        the perf readout's numbers: bakes, kept / server chunks, sprites made on the page ("made here"), late %
//   memory     the JS heap each minute, the engine's GPU MB, the renderer's kept chunks and sprites
// Heavy - run it under `flock /tmp/cla-heavy.lock`:
//   node tools/drivebench.mjs [--min 4] [--cpu 1] [--root <another build>] [--out file.json] [--label x] [--day] [--dry] [--port 8094]
//                             [--url http://... --game ws://...] [--trace trace.json] [--car sedan] [--draw] [--cores 8] [--hostprof]
// --cpu slows the page's thread (CDP; not the workers). This machine has no GPU: WebGL runs in SwiftShader on the CPU (a
// night frame took 1.2 s, every frame a "long task" waiting on it), so by default nothing is rasterized (--nodraw: every
// WebGL call is made, the draws are no-ops; --draw to draw). The page is told it has 8 cores and 8 GB (--cores): the
// phone's four bake workers. --hostprof times the renderer's own steps (its methods: any call over 15 ms, with its key).
// Compare runs with each other, not with the phone.
// --fly <sizes.json> (2026-11-06, the owner's helicopter over the desert): instead of the drive, a helicopter at --alt (900 px)
// flown east and back along the corridor tools/artsize.mjs --corridor baked (its 'corridor': the server's art for it in the data
// dir - CLA_DATA_DIR - which a server with CLA_ART_THREADS 0 serves as it is) for --min minutes, every second: the chunks on
// screen still stand-ins (and how many of those drawn from the low-detail picture), late %, chunks from the server, bakes on
// the page; a capture every --shot s into --shots <dir> (needs --draw); then the rotor wash over open water at 900 px and 30 px.
import { spawn } from 'node:child_process';
import { writeFileSync, readFileSync, existsSync, statSync, createWriteStream, mkdirSync } from 'node:fs';
import { createServer } from 'node:http';
import { join, normalize, extname } from 'node:path';
import { gzipSync } from 'node:zlib';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const HERE = fileURLToPath(new URL('..', import.meta.url));
const arg0 = (k) => { const i = process.argv.indexOf(`--${k}`); return i < 0 ? null : process.argv[i + 1]; };
// The server bakes no art of its own here (CLA_ART_THREADS 0: its bake thread builds the world again, 1.5 GB - with the
// server's own 3.9 GB and the browser's, this machine's memory ran out and killed the server or the page mid-drive).
// --root <dir>: run another build - its server and its page (a snapshot: git worktree add <dir> <commit>, or git archive),
// with the world and the art kept in this tree's data/ (the same chunks)
const ROOT = arg0('root') ? join(arg0('root'), '/') : HERE;
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i < 0 ? d : process.argv[i + 1] === undefined || process.argv[i + 1].startsWith('--') ? true : process.argv[i + 1]; };
const PORT = +arg('port', 8094), CPU = +arg('cpu', 1), MIN = +arg('min', 4), OUT = arg('out', null), LABEL = arg('label', 'run'), TRACE = arg('trace', null);
const FLY = arg('fly', null), ALT = +arg('alt', 900), SHOTS = arg('shots', null), SHOT_S = +arg('shot', 15);
const HOSTPROF = !!arg('hostprof', false), NIGHT = !arg('day', false), RAIN = !arg('dry', false), CAR = arg('car', 'sedan'), NODRAW = !arg('draw', false), CORES = +arg('cores', 8);
const req = createRequire(import.meta.url);
let pw;
for (const p of ['playwright', '/opt/npm-tools/node_modules/playwright', '/home/claude/.npm-global/lib/node_modules/playwright']) { try { pw = req(p); break; } catch { /* next */ } }
if (!pw) { console.error('playwright not found'); process.exit(1); }
const t0 = Date.now(), log = (s) => console.log(`[${((Date.now() - t0) / 1000).toFixed(0)} s] ${s}`);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- the servers: the game (World v3, dev) and the page's files as GitHub Pages serves them (gzipped, cached) ------
let server = null, pages = null;
async function startServer() {
  server = spawn(process.execPath, ['server/index.js'], { cwd: ROOT, env: { CLA_ART_PREWARM: 'none', CLA_ART_THREADS: '0', CLA_DATA_DIR: join(HERE, 'data'), ...process.env, CLA_WORLD: 'v3', CLA_DEV: '1', PORT: String(PORT) }, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  server.stderr.on('data', (d) => { out += d; if (out.length > 20000) out = out.slice(-8000); });
  await new Promise((res, rej) => {
    server.stdout.on('data', (d) => { out += d; if (/listening on/.test(out)) res(); if (out.length > 20000) out = out.slice(-8000); });
    server.on('exit', (c) => { log(`server exited ${c}: ${out.slice(-400)}`); rej(new Error('server exited')); });
  });
  await wait(4000);
}
function startPages(port) {
  const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.woff': 'font/woff', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.txt': 'text/plain', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };
  const zipped = new Map();
  pages = createServer((q, s) => {
    let p = decodeURIComponent(new URL(q.url, 'http://x').pathname);
    if (p === '/') p = '/index.html';
    const f = join(ROOT, normalize(p).replace(/^[/\\]+/, ''));
    if (!f.startsWith(ROOT) || !existsSync(f) || !statSync(f).isFile()) { s.writeHead(404); s.end(); return; }
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
process.on('SIGINT', () => { stop(); process.exit(130); });

// ---- in the page, from its first line: every task timed where it starts ------------------------------------------
function probe(o) {
  // this machine has no GPU (WebGL in SwiftShader, on the CPU: a night frame's lighting took 1.2 s here): --nodraw (the
  // default) keeps every WebGL call the page makes - the uploads, the buffers, the uniforms - but rasterizes nothing, so
  // the page runs at a frame rate and its own work is what's measured
  if (o && o.nodraw && window.WebGL2RenderingContext) {
    const P = WebGL2RenderingContext.prototype, nop = function () {};
    const orig = {}, ks = ['drawArrays', 'drawArraysInstanced', 'drawElements', 'drawElementsInstanced', 'drawRangeElements', 'blitFramebuffer', 'clear', 'clearBufferfv', 'clearBufferuiv', 'clearBufferiv', 'clearBufferfi'];
    for (const k of ks) if (P[k]) { orig[k] = P[k]; P[k] = nop; }
    window.__drawOn = (on) => { for (const k of ks) if (orig[k]) P[k] = on ? orig[k] : nop; };   // (a capture now and then: --fly)
  }
  // the owner's phone: 8 cores, 8 GB (the pool's four bake workers, its caches and the chunks it keeps follow these)
  if (o && o.cores) { try { Object.defineProperty(Navigator.prototype, 'hardwareConcurrency', { get: () => o.cores, configurable: true }); Object.defineProperty(Navigator.prototype, 'deviceMemory', { get: () => o.mem, configurable: true }); } catch { /* sealed */ } }
  const B = (window.__drive = { rec: false, ft: [], long: [], slow: [], heap: [], kinds: {}, partSum: {}, partN: 0, cbSum: 0 });
  const now = () => performance.now();
  const SLOW = 40;   // ms: a task this long is kept with what it was
  const note = (kind, src, ms, extra) => {
    if (!B.rec) return;
    const k = B.kinds[kind] || (B.kinds[kind] = { n: 0, ms: 0, slowN: 0, slowMs: 0, max: 0 });
    k.n++; k.ms += ms; if (ms > k.max) k.max = ms;
    if (ms >= SLOW) { k.slowN++; k.slowMs += ms; if (B.slow.length < 2000) B.slow.push({ at: Math.round(now() - ms), ms: Math.round(ms), kind, src: src || '', ...(extra || null) }); }
  };
  const srcOf = (fn) => { try { const s = (fn && (fn.name || String(fn))) || '?'; return s.replace(/\s+/g, ' ').slice(0, 90); } catch { return '?'; } };
  // the frame's parts: main.js's S.perf and the renderer's part are running averages (x 0.9 + this frame x 0.1) - the
  // frame's own share is (after - 0.9 before) / 0.1
  const snap = (o) => { const r = {}; if (o) for (const k in o) r[k] = o[k]; return r; };
  const unwind = (a, b, min = 0) => { const r = {}; for (const k in b) { const v = (b[k] - 0.9 * (a[k] || 0)) / 0.1; if (v >= min) r[k] = min ? Math.round(v) : v; } return r; };
  const raf0 = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (cb) => raf0((ts) => {
    const S = window.CLA && window.CLA.S, w = S && S.art2;
    const p0 = B.rec && S ? snap(S.perf) : null, q0 = B.rec && w ? snap(w.part) : null, t = now();
    try { cb(ts); } finally {
      const ms = now() - t;
      if (B.rec) {
        let extra = null;
        // every frame's parts summed (the mean page work a frame, by part)
        if (p0 && S.perf) { const u = unwind(p0, S.perf); B.partN++; for (const k in u) B.partSum[k] = (B.partSum[k] || 0) + u[k]; if (q0 && w && w.part) { const v = unwind(q0, w.part); for (const k in v) B.partSum['art.' + k] = (B.partSum['art.' + k] || 0) + v[k]; } B.cbSum += ms; }
        if (ms >= SLOW) { extra = { parts: { ...(p0 ? unwind(p0, S.perf || {}, 2) : null), ...(q0 && w ? Object.fromEntries(Object.entries(unwind(q0, w.part || {}, 2)).map(([k, v]) => ['art.' + k, v])) : null) } }; }
        note('frame', cb && cb.name, ms, extra);
      }
    }
  });
  const wrapL = (kind, src, fn) => (fn && typeof fn === 'function' ? function (...a) { const t = now(); try { return fn.apply(this, a); } finally { note(kind, src, now() - t); } } : fn);
  // message handlers: workers (by name), sockets, channels; IndexedDB's events; timers
  const hook = (proto, kind, srcOf2, events) => {
    if (!proto) return;
    const ael = proto.addEventListener;
    proto.addEventListener = function (type, fn, o) {
      if (events.includes(type) && typeof fn === 'function') { const w = wrapL(kind, srcOf2(this, type), fn); (fn.__w ||= new WeakMap()).set(this, w); return ael.call(this, type, w, o); }
      return ael.call(this, type, fn, o);
    };
    const rel = proto.removeEventListener;
    proto.removeEventListener = function (type, fn, o) { const w = fn && fn.__w && fn.__w.get(this); return rel.call(this, type, w || fn, o); };
    for (const ev of events) {
      const d = Object.getOwnPropertyDescriptor(proto, 'on' + ev);
      if (!d || !d.set) continue;
      Object.defineProperty(proto, 'on' + ev, { configurable: true, enumerable: d.enumerable, get() { return d.get.call(this); }, set(fn) { d.set.call(this, wrapL(kind, srcOf2(this, ev), fn)); } });
    }
  };
  const W0 = window.Worker;
  window.Worker = function (url, opts) { const w = new W0(url, opts); try { Object.defineProperty(w, '__name', { value: (opts && opts.name) || String(url).split('/').pop() }); } catch { /* sealed */ } return w; };
  window.Worker.prototype = W0.prototype;
  hook(W0.prototype, 'worker', (w) => 'worker ' + ((w && w.__name) || '?').replace(/-\d+$/, ''), ['message']);
  hook(WebSocket.prototype, 'socket', () => 'socket', ['message']);
  hook(MessagePort.prototype, 'port', () => 'port', ['message']);
  hook(window.IDBRequest && IDBRequest.prototype, 'idb', (r, ev) => 'idb ' + ev, ['success', 'error']);
  hook(window.IDBTransaction && IDBTransaction.prototype, 'idb', (r, ev) => 'idb tx ' + ev, ['complete', 'error', 'abort']);
  hook(window.FileReader && FileReader.prototype, 'other', () => 'filereader', ['load', 'loadend']);
  hook(window.Image && HTMLImageElement.prototype, 'other', () => 'image load', ['load']);
  B.si0 = window.setInterval.bind(window);   // (the autopilot's own timer: not the game's - its long tasks are left out)
  B.apSpans = [];
  for (const nm of ['setTimeout', 'setInterval']) {
    const f0 = window[nm].bind(window);
    window[nm] = (fn, ms, ...a) => f0(typeof fn === 'function' ? wrapL(nm === 'setTimeout' ? 'timeout' : 'interval', srcOf(fn), fn) : fn, ms, ...a);
  }
  if (window.requestIdleCallback) { const f0 = window.requestIdleCallback.bind(window); window.requestIdleCallback = (fn, o) => f0(wrapL('idle', srcOf(fn), fn), o); }
  if (window.queueMicrotask) { /* (microtasks run inside the task that queued them: timed with it) */ }
  try {
    new PerformanceObserver((l) => {
      if (!B.rec) return;
      for (const e of l.getEntries()) B.long.push({ at: Math.round(e.startTime), ms: Math.round(e.duration), a: (e.attribution && e.attribution[0] && e.attribution[0].containerType) || '' });
    }).observe({ entryTypes: ['longtask'] });
  } catch { /* none */ }
  let last = 0;
  const tick = (ts) => { if (B.rec && last) B.ft.push(Math.round((ts - last) * 10) / 10); last = ts; raf0(tick); };
  raf0(tick);
  setInterval(() => { if (B.rec && performance.memory) B.heap.push([Math.round(now()), Math.round(performance.memory.usedJSHeapSize / 1048576)]); }, 1000);
}

// ---- the autopilot (in the page): the GPS route to the next district, steered along with the keys ---------------
function autopilot(plan) {
  const S = window.CLA.S, D = window.__drive, key = (code, down) => dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, key: code, bubbles: true }));
  const held = new Set(), want = (codes) => { for (const c of ['KeyW', 'KeyS', 'KeyA', 'KeyD']) { const on = codes.includes(c); if (on && !held.has(c)) { key(c, true); held.add(c); } else if (!on && held.has(c)) { key(c, false); held.delete(c); } } };
  const A = (D.ap = { leg: 0, legs: [], dist: 0, stuck: 0, unstuck: 0, rerouted: 0, offRoute: 0, routeFails: 0, at: null });
  let R = null, router = null, routerMap = null, route = null, routeAt = 0, lastPos = null, lastMove = performance.now(), backUntil = 0, backSide = 1;
  const pos = () => { const P = S.pred; if (P && P.kind === 'veh') return { x: P.s.x, y: P.s.y, a: P.s.a, v: Math.hypot(P.s.vx || 0, P.s.vy || 0) }; return null; };
  const legTo = () => plan[A.leg % plan.length];
  D.apTimer = D.si0(async () => {
    const tS = performance.now();
    try { await step(); } finally { const ms = performance.now() - tS; if (ms > 20 && D.apSpans.length < 5000) D.apSpans.push([Math.round(tS), Math.round(ms)]); }
  }, 100);
  let skipAt = 0;
  async function step() {
    if (!D.rec && !D.apOn) return;
    // (the first-time experience's question, should it come up now: closed, skipped - it holds the keys)
    { const f = S.me && S.me.ftue, now = performance.now(); if (S.hud && S.hud.menuOpen) S.hud.closeMenu(); if (f && f.st !== 'done' && now - skipAt > 1000) { skipAt = now; window.CLA.send({ t: 'intro', a: 'skip' }); } }
    const p = pos();
    // (out of the car - wrecked, pulled out: another, at most every 5 s)
    if (!p) { want([]); const now = performance.now(); if (S.pred && S.pred.kind === 'ped' && now - (A.carAt || 0) > 5000) { A.carAt = now; A.newCars = (A.newCars || 0) + 1; window.CLA.send({ t: 'dev', c: 'car', m: D.car || 'sedan', in: true }); } return; }
    if (lastPos) { const d = Math.hypot(p.x - lastPos.x, p.y - lastPos.y); A.dist += d; if (d > 6) lastMove = performance.now(); }
    lastPos = p; A.at = [Math.round(p.x), Math.round(p.y)];
    const t = performance.now();
    if (t < backUntil) { want(['KeyS', backSide > 0 ? 'KeyA' : 'KeyD']); return; }
    if (t - lastMove > 2500) { A.stuck++; backUntil = t + 1400; backSide = -backSide; lastMove = t + 1400; route = null; return; }
    if (!router || routerMap !== S.map) { if (!R) R = await import('./client/route.js'); router = R.createRouter(S.map); routerMap = S.map; route = null; }
    const g = legTo();
    if (Math.hypot(g.x - p.x, g.y - p.y) < 500) { A.legs.push({ to: g.name, s: Math.round((t - (A.legT || t)) / 1000) }); A.leg++; A.legT = t; route = null; return; }
    if (!route || t - routeAt > 4000) {
      let r = null;
      try { r = router.update({ x: p.x, y: p.y }, { x: g.x, y: g.y }, true, t); } catch { r = null; }
      routeAt = t;
      if (!r || !r.pts || r.pts.length < 2) { A.routeFails++; A.leg++; route = null; return; }
      route = r.pts; A.rerouted++;
    }
    // the point some way along the route ahead of the car's nearest
    let bi = 0, bd = Infinity;
    for (let i = 0; i < route.length; i++) { const d = Math.hypot(route[i].x - p.x, route[i].y - p.y); if (d < bd) { bd = d; bi = i; } }
    if (bd > 400) { A.offRoute++; route = null; }
    const look = 120 + Math.min(260, p.v * 0.45);
    let tx = route ? route[route.length - 1].x : g.x, ty = route ? route[route.length - 1].y : g.y, acc = 0;
    if (route) for (let i = bi; i < route.length - 1; i++) { acc += Math.hypot(route[i + 1].x - route[i].x, route[i + 1].y - route[i].y); if (acc >= look) { tx = route[i + 1].x; ty = route[i + 1].y; break; } }
    let da = Math.atan2(ty - p.y, tx - p.x) - p.a;
    while (da > Math.PI) da -= 2 * Math.PI;
    while (da < -Math.PI) da += 2 * Math.PI;
    const keys = [];
    if (Math.abs(da) > 0.08) keys.push(da > 0 ? 'KeyD' : 'KeyA');
    if (Math.abs(da) > 1.1 && p.v > 160) keys.push('KeyS'); else if (!(Math.abs(da) > 0.5 && p.v > 330) && p.v < 520) keys.push('KeyW');
    want(keys);
  }
  D.apStop = () => { clearInterval(D.apTimer); want([]); };
}

// ---- the flight (--fly) ------------------------------------------------------------------------------------------------
async function fly(page, cdp, R) {
  const C = JSON.parse(readFileSync(FLY, 'utf8')).corridor;
  if (!C) throw new Error(`${FLY} has no corridor (tools/artsize.mjs --corridor)`);
  R.fly = { corridor: C, alt: ALT, samples: [], shots: [] };
  const send = (m) => page.evaluate((m) => window.CLA.send(m), m);
  await send({ t: 'dev', c: 'tp', x: C.from.x, y: C.from.y, snap: true });
  await wait(2500);
  await send({ t: 'dev', c: 'car', m: 'heli', in: true, alt: ALT, x: C.from.x, y: C.from.y, a: 0 });
  await waitFor(page, () => window.CLA.S.pred && window.CLA.S.pred.air, 30000);
  await wait(1500);
  if (CPU > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU });
  // the autopilot (here, with the browser's own keys): full ahead (W - the keyboard flies car-style: W the throttle, A / D the
  // tail rotor), turned toward the corridor's far end, Space to hold the height; back again at the end
  const held = new Set(), want = async (codes) => { for (const c of ['KeyW', 'KeyA', 'KeyD', 'Space', 'ShiftLeft']) { const on = codes.includes(c); if (on && !held.has(c)) { await page.keyboard.down(c); held.add(c); } else if (!on && held.has(c)) { await page.keyboard.up(c); held.delete(c); } } };
  let to = C.to, legs = 0;
  const steer = async () => {
    const s = await page.evaluate(() => { const P = window.CLA.S.pred; return P && P.air && P.s ? { x: P.s.x, y: P.s.y, a: P.s.a, alt: P.s.alt || 0, vx: P.s.vx, vy: P.s.vy, spool: P.s.spool } : null; });
    if (!s) { await want([]); return null; }
    if (Math.hypot(to.x - s.x, to.y - s.y) < 900) { to = to === C.to ? C.from : C.to; legs++; }
    let da = Math.atan2(to.y - s.y, to.x - s.x) - s.a; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
    const k = ['KeyW']; if (Math.abs(da) > 0.12) k.push(da > 0 ? 'KeyD' : 'KeyA'); if (s.alt < ALT - 30) k.push('Space'); else if (s.alt > ALT + 60) k.push('ShiftLeft');
    await want(k);
    return s;
  };
  // a capture: drawing switched on a moment (the run itself draws nothing: SwiftShader's frames would slow the flight to a crawl)
  const shot = async (f) => { if (CPU > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 }); await page.evaluate(() => window.__drawOn && window.__drawOn(true)); await wait(1500); await page.screenshot({ path: f, type: 'jpeg', quality: 70 }).catch(() => {}); await page.evaluate(() => window.__drawOn && window.__drawOn(false)); if (CPU > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU }); R.fly.shots.push(f); };
  for (let j = 0; j < 30; j++) { await steer(); await wait(100); }
  log(`after 3 s at the controls: ${JSON.stringify(await steer())}`);
  await page.evaluate(() => { window.__drive.rec = true; });
  const h0 = await page.evaluate(hudNow);
  log(`flying: from ${JSON.stringify(C.from)} to ${JSON.stringify(C.to)} at ${ALT} px (cpu x${CPU})`);
  const t1 = Date.now() + MIN * 60000;
  let shotAt = 0, i = 0;
  if (SHOTS) mkdirSync(SHOTS, { recursive: true });
  while (Date.now() < t1) {
    for (let j = 0; j < 5; j++) { await steer(); await wait(180); }
    const s = await page.evaluate(() => {
      const S = window.CLA.S, w = S.art2, W = w.warmth && w.warmth(), E = w.E, P = S.pred, n = w.n || {}, t = w.t || {};
      let lo = 0, flat = 0;
      for (const k of w.fallbacks) { const cx = k % 1000, cy = Math.floor(k / 1000); if ((cx + 1) * 768 > w.vx0 && cx * 768 < w.vx1 && (cy + 1) * 768 > w.vy0 && cy * 768 < w.vy1 && !E.hasChunk(cx, cy)) { const cv = w.phs.get(k); if (cv && cv.lo) lo++; else flat++; } }
      return { sp: P && P.s ? Math.round(Math.hypot(P.s.vx, P.s.vy)) : 0, alt: P && P.s ? Math.round(P.s.alt || 0) : 0, x: Math.round(S.cam.x), scr: W ? W.scr : 0, standIns: W ? W.scr - W.scrHave : 0, lo, flat, late: w.late && w.late.of ? Math.round(1000 * w.late.frames / w.late.of) / 10 : 0, server: n.cdn || 0, kept: n.kept || 0, bakes: t.bakeN || 0, hi: !!w.hi, low: w.low ? w.low.stats() : null, pool: w.pool ? { run: w.pool.stats().running, q: w.pool.stats().queued } : null, legs: 0 };
    });
    s.legs = legs;
    s.t = ++i; R.fly.samples.push(s);
    if (i % 10 === 0) log(`fly ${i} s: ${JSON.stringify(s)}`);
    if (SHOTS && Date.now() - shotAt > SHOT_S * 1000) { shotAt = Date.now(); await shot(join(SHOTS, `fly-${String(i).padStart(3, '0')}.jpg`)); }
  }
  const h1 = await page.evaluate(hudNow);
  await want([]);
  if (CPU > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  const S = R.fly.samples, avg = (f) => Math.round(10 * S.reduce((a, s) => a + f(s), 0) / Math.max(1, S.length)) / 10;
  R.fly.summary = { seconds: S.length, legs: S.length ? S[S.length - 1].legs : 0, avgSpeed: avg((s) => s.sp), standInsAvg: avg((s) => s.standIns), flatAvg: avg((s) => s.flat), lowAvg: avg((s) => s.lo), screenAvg: avg((s) => s.scr), secondsWithFlat: S.filter((s) => s.flat > 0).length, late: h1.late, server: h1.server - h0.server, bakedHere: h1.bakeN - h0.bakeN, kept: h1.kept - h0.kept, highAir: S.filter((s) => s.hi).length, low: S.length ? S[S.length - 1].low : null };
  log(`flight: ${JSON.stringify(R.fly.summary)}`);
  log(`hud at the end:\n${h1.hud}`);
  // the phone turned to landscape, still up at ALT (the owner, 11-06: a helicopter "disappearing" in landscape): where it is
  // on the screen - its drawn self against the view's middle - and a capture
  if (SHOTS) {
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 891, height: 411, deviceScaleFactor: 2.6, mobile: true, screenOrientation: { type: 'landscapePrimary', angle: 90 } }); await wait(5000);
    await shot(join(SHOTS, 'land-high.jpg'));
    R.fly.landscape = await page.evaluate(() => { const S = window.CLA.S, e = S.ents.get(S.ctrlId), v = S.viewRect, lift = S.airMod && e ? S.airMod.liftOf(e.ralt ?? 0) : 0; return e && v ? { alt: Math.round(e.ralt || 0), drawnY: Math.round(e.ry - lift), midY: Math.round((v.y0 + v.y1) / 2), halfH: Math.round((v.y1 - v.y0) / 2), offScreen: e.ry - lift < v.y0 || e.ry - lift > v.y1 } : null; });
    log(`landscape: ${JSON.stringify(R.fly.landscape)}`);
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 411, height: 891, deviceScaleFactor: 2.6, mobile: true, screenOrientation: { type: 'portraitPrimary', angle: 0 } }); await wait(2000);
  }
  // the rotor wash: over open water (the corridor's start moved to the nearest deep water), at ALT then low
  if (SHOTS) {
    const wpt = await page.evaluate((C) => { const m = window.CLA.S.map; for (let r = 0; r < 60000; r += 768) for (let a = 0; a < 16; a++) { const x = C.from.x + Math.cos(a * Math.PI / 8) * r, y = C.from.y + Math.sin(a * Math.PI / 8) * r, tx = Math.floor(x / 32), ty = Math.floor(y / 32); if (m.inside(tx, ty) && m.tileAt(tx, ty) === 7) { let ok = true; for (let d = -8; d <= 8 && ok; d += 4) for (let e = -8; e <= 8; e += 4) if (m.tileAt(tx + d, ty + e) !== 7) { ok = false; break; } if (ok) return { x, y }; } } return null; }, C);
    if (wpt) {
      for (const [alt, nm] of [[ALT, 'high'], [30, 'low']]) {
        await send({ t: 'dev', c: 'tp', x: wpt.x, y: wpt.y, snap: true }); await wait(2000);
        await send({ t: 'dev', c: 'car', m: 'heli', in: true, alt, x: wpt.x, y: wpt.y, a: 0 });
        await wait(9000);
        await shot(join(SHOTS, `wash-${nm}.jpg`));
        R.fly['wash_' + nm] = await page.evaluate(() => { const S = window.CLA.S, wl = S.art2 && S.art2.WL; return { alt: Math.round(S.pred && S.pred.s ? S.pred.s.alt : -1), fx: S.fx && S.fx.count ? S.fx.count() : null }; });
        log(`wash ${nm}: ${JSON.stringify(R.fly['wash_' + nm])}`);
      }
    } else log('no open water near the corridor for the wash shots');
  }
}

const pct = (a, p) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return +s[Math.min(s.length - 1, Math.floor(s.length * p))].toFixed(1); };
async function waitFor(page, fn, ms, a) {
  const end = Date.now() + ms;
  while (Date.now() < end) { try { await page.waitForFunction(fn, a, { timeout: end - Date.now(), polling: 200 }); return true; } catch (e) { if (!/context|navigat|destroyed/i.test(String(e && e.message))) return false; await wait(300); } }
  return false;
}
// the perf readout's numbers (client/perfhud.js) and the renderer's, as they are now
const hudNow = () => {
  const S = window.CLA.S, w = S.art2, s = w && w.stats ? w.stats() : null, el = document.getElementById('perfhud');
  const E = (s && s.engine) || {}, n = (s && s.n) || {}, t = (s && s.t) || {};
  return {
    hud: el ? el.textContent : null,
    bakeAvg: Math.round(t.bakeAvg || 0), bakeN: t.bakeN || 0, kept: n.kept || 0, server: n.cdn || 0, madeHere: n.sync || 0, syncMs: Math.round(t.syncMs || 0), sprReq: n.sprReq || 0, gen: n.gen || 0,
    late: s && s.late && s.late.of ? Math.round(1000 * s.late.frames / s.late.of) / 10 : 0, slots: E.slots || 0, gpuMB: Math.round(E.gpuMB || 0), sprites: E.sprites || 0, evicted: E.evicted || 0, pages: E.pages || 0,
    chunks: s ? s.chunks : 0, reworld: n.reworld || 0, pool: s && s.pool ? { q: s.pool.queued, run: s.pool.running } : null, perf: S.perf ? Object.fromEntries(Object.entries(S.perf).map(([k, v]) => [k, Math.round(v * 100) / 100])) : null,
    part: w && w.part ? Object.fromEntries(Object.entries(w.part).map(([k, v]) => [k, Math.round(v * 100) / 100])) : null, est: w && w.est ? { ...w.est } : null,
    heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : 0, ents: S.ents ? S.ents.size : 0, cam: [Math.round(S.cam.x), Math.round(S.cam.y)],
  };
};

let BASE = arg('url', null), GAME = arg('game', null);
if (!BASE) {
  log('starting the server (World v3, dev)'); await startServer(); log('server up');
  await startPages(PORT + 1); BASE = `http://127.0.0.1:${PORT + 1}`; GAME = `ws://127.0.0.1:${PORT}/ws`;
}
const browser = await pw.chromium.launch({ args: ['--enable-precise-memory-info'] });
const R = { label: LABEL, at: new Date().toISOString(), nodraw: NODRAW, cores: CORES, cpu: CPU, min: MIN, night: NIGHT, rain: RAIN, car: CAR, screen: '411x891@2.6', minutes: [] };
try {
  const ctx = await browser.newContext({
    viewport: { width: 411, height: 891 }, deviceScaleFactor: 2.6, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
  });
  await ctx.addInitScript(probe, { nodraw: NODRAW, cores: CORES, mem: 8 });
  // (Medium, the perf readout on, and the first-launch gate answered: its modal - 17+ and the analytics choice, client/account.js -
  // holds the keys while it's up, so the car never moved)
  await ctx.addInitScript(() => { try { localStorage.setItem('cla.settings', JSON.stringify({ gfxPreset: 'medium' })); localStorage.setItem('cla.perfhud', '1'); localStorage.setItem('cla.gate', JSON.stringify({ age17: true, consent: 'essential', at: Date.now() })); } catch { /* none */ } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message || e).slice(0, 200)));
  const swaps = [];
  const worldLog = [];
  page.on('console', (m) => { const t0w = m.text(); if (/^\[world\]|\[art2\]/.test(t0w) && worldLog.length < 60) worldLog.push(t0w.slice(0, 300)); });
  page.on('console', (m) => { const t = m.text(), q = /the window moved to .*assembled in (\d+) ms, swapped in (\d+) ms/.exec(t); if (q) swaps.push({ at: Date.now() - t0, assembleMs: +q[1], swapMs: +q[2], parts: (/swapped in \d+ ms \((.*)\)/.exec(t) || [])[1] || '' }); });
  const cdp = await ctx.newCDPSession(page);
  await page.goto(`${BASE}/?debug&server=${encodeURIComponent(GAME)}`, { waitUntil: 'commit' });
  await waitFor(page, () => { const p = document.getElementById('play'); return p && !p.disabled; }, 240000);
  await wait(1500);
  await page.evaluate(() => document.getElementById('play').click());
  const inCity = await waitFor(page, () => window.CLA && window.CLA.load && window.CLA.load.at.screen, 300000);
  log(`in the city: ${inCity}`);
  if (!inCity) { await page.screenshot({ path: `/tmp/drivebench-stuck.png` }).catch(() => {}); throw new Error('never got into the city'); }
  await page.evaluate(() => { window.CLA.send({ t: 'devmode', pw: '' }); });
  await wait(800);
  // a fresh profile is a new character: the first-time experience's arrival and question (server/systems/ftue.js) hold the
  // keys - skipped (the arrival, then the question), and anything left open closed
  // (it starts once the server sees the character: skipped and closed until it says done, 40 s at most)
  for (let i = 0; i < 40; i++) {
    const st = await page.evaluate(() => { const S = window.CLA.S, f = S.me && S.me.ftue; if (S.hud && S.hud.menuOpen) S.hud.closeMenu(); if (!f || f.st !== 'done') window.CLA.send({ t: 'intro', a: 'skip' }); return f ? f.st : null; });
    if ((st === 'done' && i >= 3) || (st === null && i >= 25)) break;
    await wait(1000);
  }
  await page.keyboard.press('Escape').catch(() => {});
  await page.evaluate(() => { const H = window.CLA.S.hud; if (H && H.menuOpen) H.closeMenu(); });
  await wait(500);
  await page.evaluate(({ NIGHT, RAIN }) => { const s = window.CLA.send; s({ t: 'dev', c: 'time', m: NIGHT ? 23 * 60 : 12 * 60 }); s({ t: 'dev', c: 'clockhold' }); if (RAIN) s({ t: 'dev', c: 'rain', s: 3600 }); else s({ t: 'dev', c: 'clear' }); s({ t: 'dev', c: 'wxhold' }); s({ t: 'dev', c: 'god' }); }, { NIGHT, RAIN });
  if (FLY) await fly(page, cdp, R);
  else {
  // the route: from the houses of Pine Hills to Southside, Downtown, Midtown, Northgate, Old Town and back (the first that
  // the map has: district middles - client/devtp.js)
  const plan = await page.evaluate(async () => {
    const m = await import('./client/devtp.js'), list = m.teleportPlaces(window.CLA.S.map), by = (n) => list.find((p) => p.name === n && p.kind === 'district');
    return ['Pine Hills', 'Southside', 'Downtown', 'Midtown', 'Northgate', 'Old Town', 'Arts District', 'Neon Strip', 'Civic Center', 'Bayside Heights'].map(by).filter(Boolean).map((p) => ({ name: p.name, x: Math.round(p.x), y: Math.round(p.y) }));
  });
  log(`plan: ${plan.map((p) => p.name).join(' -> ')}`);
  R.plan = plan.map((p) => p.name);
  const st = plan[0];
  await page.evaluate((p) => window.CLA.send({ t: 'dev', c: 'tp', x: p.x, y: p.y, snap: true }), st);
  await wait(3000);
  await waitFor(page, () => { const w = window.CLA.S.art2, W = w && w.warmth && w.warmth(); return W && W.scr > 0 && W.scrHave === W.scr; }, 240000);
  await page.evaluate((m) => window.CLA.send({ t: 'dev', c: 'car', m, in: true }), CAR);
  await waitFor(page, () => window.CLA.S.pred && window.CLA.S.pred.kind === 'veh', 30000);
  await wait(4000);
  // (a check that the car goes: full throttle a moment)
  const p0 = await page.evaluate(() => { const P = window.CLA.S.pred; return [P.s.x, P.s.y]; });
  await page.keyboard.down('KeyW'); await wait(2500); await page.keyboard.up('KeyW');
  const p1 = await page.evaluate(() => { const P = window.CLA.S.pred, H = window.CLA.S.hud; return [P.s.x, P.s.y, !!(H && H.menuOpen), window.CLA.S.me && window.CLA.S.me.ftue ? window.CLA.S.me.ftue.st : null, [...document.querySelectorAll('[data-cla-modal]')].map((e) => e.id || e.className || 'modal').join(',')]; });
  log(`the car: ${Math.round(Math.hypot(p1[0] - p0[0], p1[1] - p0[1]))} px in 2.5 s (a menu open: ${p1[2]}, first-time experience: ${p1[3]}, modals: ${p1[4] || 'none'})`);
  await page.evaluate((c) => { window.__drive.car = c; }, CAR);
  await page.evaluate(autopilot, plan.slice(1).concat([plan[0]]));
  if (CPU > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU });
  if (TRACE) await cdp.send('Tracing.start', { transferMode: 'ReturnAsStream', traceConfig: { includedCategories: ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'v8.execute', 'v8', 'blink.user_timing'], excludedCategories: ['*'] } });
  const h0 = await page.evaluate(hudNow);
  R.start = h0;
  R.mapSizes = await page.evaluate(() => { const m = window.CLA.S.map, n = (a) => (a ? a.length : 0); return { w: m.w, h: m.h, props: n(m.props), lamps: n(m.lamps), pois: n(m.pois), buildings: n(m.buildings), edges: n(m.edges), nodes: n(m.nodes), lots: n(m.lots) }; });
  log(`the window: ${JSON.stringify(R.mapSizes)}`);
  await page.evaluate((HOSTPROF) => {
    const D = window.__drive; D.rec = true; D.t0 = performance.now();
    // every chunk drawn from here on (the engine's uploads), to set against what was baked or fetched ahead of need
    const w = window.CLA.S.art2, E = w.E, up0 = E.uploadChunk.bind(E);
    D.shown = new Set(); D.pre0 = w.pre ? new Set(w.pre.kept) : new Set();
    // the renderer's own steps timed (its methods, on this instance): any call over 15 ms kept with its first argument
    D.hostSlow = [];
    const P = Object.getPrototypeOf(w);
    if (HOSTPROF) for (const k of Object.getOwnPropertyNames(P)) {
      if (k === 'constructor' || k === 'frame' || k === 'stats' || typeof P[k] !== 'function') continue;
      const f = P[k];
      w[k] = function (...a) { const t = performance.now(); try { return f.apply(this, a); } finally { const ms = performance.now() - t; if (ms > 15 && D.rec && D.hostSlow.length < 400) D.hostSlow.push({ at: Math.round(t), ms: Math.round(ms), fn: k, a: typeof a[0] === 'string' ? a[0].slice(0, 60) : typeof a[1] === 'string' ? a[1].slice(0, 60) : '' }); } };
    }
    E.uploadChunk = (cx, cy, ...a) => { D.shown.add(cy * 1000 + cx); return up0(cx, cy, ...a); };
  }, HOSTPROF);
  log(`driving for ${MIN} min (cpu x${CPU}, ${NIGHT ? 'night' : 'day'}, ${RAIN ? 'rain' : 'dry'})`);
  let prevFt = 0, prevLong = 0;
  for (let mi = 0; mi < MIN; mi++) {
    await wait(60000);
    const m = await page.evaluate(({ prevFt, prevLong }) => {
      const D = window.__drive, ft = D.ft.slice(prevFt), ap = D.apSpans, lg = D.long.slice(prevLong).filter((L) => !ap.some(([t, ms]) => t < L.at + L.ms && t + ms > L.at - 1));
      return { ft, longN: lg.length, longMs: lg.reduce((a, e) => a + e.ms, 0), ftN: D.ft.length, lN: D.long.length, ap: { ...D.ap, legs: D.ap.legs.length } };
    }, { prevFt, prevLong });
    prevFt = m.ftN; prevLong = m.lN;
    const h = await page.evaluate(hudNow);
    const row = { min: mi + 1, frames: m.ft.length, p50: pct(m.ft, 0.5), p95: pct(m.ft, 0.95), p99: pct(m.ft, 0.99), over50: m.ft.filter((x) => x > 50).length, longN: m.longN, longMs: m.longMs,
      heapMB: h.heapMB, gpuMB: h.gpuMB, kept: h.kept, server: h.server, bakeN: h.bakeN, bakeAvg: h.bakeAvg, madeHere: h.madeHere - h0.madeHere, sprites: h.sprites, evicted: h.evicted - h0.evicted, late: h.late, slots: h.slots, reworld: h.reworld, ents: h.ents, ap: m.ap, perf: h.perf, part: h.part, est: h.est };
    R.minutes.push(row);
    log(`min ${mi + 1}: ${JSON.stringify(row)}`);
  }
  // then out of the car and a walk round, turning every way (your own figure's poses: the sprites made for it)
  const hf = await page.evaluate(hudNow);
  await page.evaluate(() => { const D = window.__drive; D.apStop && D.apStop(); });
  await page.keyboard.press('KeyF'); await wait(1500);
  for (const k of ['KeyA', 'KeyD', 'KeyA', 'KeyD', 'KeyA', 'KeyD']) { await page.keyboard.down('KeyW'); await page.keyboard.down(k); await wait(1800); await page.keyboard.up(k); await page.keyboard.up('KeyW'); await wait(300); }
  const hw = await page.evaluate(hudNow);
  R.onFoot = { madeHere: hw.madeHere - hf.madeHere, madeHereMs: hw.syncMs - hf.syncMs, sprReq: hw.sprReq - hf.sprReq, onFoot: await page.evaluate(() => !!(window.CLA.S.pred && window.CLA.S.pred.kind === 'ped')) };
  log(`on foot: ${JSON.stringify(R.onFoot)}`);
  await page.evaluate(() => { const D = window.__drive; D.rec = false; });
  // then (not recorded: its loading screen spends frames freely) a teleport to the farthest place on the route: a World v3 window swap or two (their page ms by step: swaps)
  const far = await page.evaluate((plan) => { const S = window.CLA.S; let b = null, bd = -1; for (const p of plan) { const d = Math.hypot(p.x - S.cam.x, p.y - S.cam.y); if (d > bd) { bd = d; b = p; } } return b; }, plan);
  if (far) { const n0 = swaps.length; await page.evaluate((p) => window.CLA.send({ t: 'dev', c: 'tp', x: p.x, y: p.y, snap: true }), far); for (let i = 0; i < 30 && swaps.length === n0; i++) await wait(1000); await wait(8000); log(`teleported to ${far.name}: ${swaps.length - n0} window swap(s)`); }
  if (TRACE) {
    const done = new Promise((res) => cdp.once('Tracing.tracingComplete', res));
    await cdp.send('Tracing.end');
    const { stream } = await done;
    const ws = createWriteStream(TRACE);
    for (;;) { const r = await cdp.send('IO.read', { handle: stream, size: 1 << 20 }); ws.write(r.base64Encoded ? Buffer.from(r.data, 'base64') : r.data); if (r.eof) break; }
    await cdp.send('IO.close', { handle: stream }); ws.end();
    log(`trace: ${TRACE}`);
  }
  if (CPU > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  const D = await page.evaluate(() => { const D = window.__drive; const ap = D.apSpans; D.long = D.long.filter((L) => !ap.some(([t, ms]) => t < L.at + L.ms && t + ms > L.at - 1)); return { apSpans: ap.length, ft: D.ft, long: D.long, slow: D.slow, heap: D.heap, kinds: D.kinds, t0: D.t0, ap: D.ap, partSum: D.partSum, partN: D.partN, cbSum: D.cbSum }; });
  const h1 = await page.evaluate(hudNow);
  R.end = h1;
  // the bakes and downloads ahead of need: how many, and how many of those chunks were drawn after all
  R.ahead = await page.evaluate(() => {
    const D = window.__drive, w = window.CLA.S.art2, pre = w.pre, fa = w.fa;
    const ahead = pre ? [...pre.kept].filter((k) => !D.pre0.has(k)).map((k) => +k.split(':')[1]) : [];
    return { baked: pre ? pre.done : 0, had: pre ? pre.had : 0, fetched: fa ? fa.got : 0, aheadChunks: ahead.length, aheadShown: ahead.filter((k) => D.shown.has(k)).length, shown: D.shown.size, chunkUp: w.n.chunkUp, pool: w.pool ? w.pool.stats() : null, lane: w.lane ? w.lane.stats() : null };
  });
  log(`ahead of need: ${JSON.stringify(R.ahead)}`);
  // each long task with the slow callbacks inside it (what was running), and what's left over (the browser's own: a
  // message's decoding, garbage collection, style and layout - not inside any callback timed)
  const by = {};
  for (const L of D.long) {
    const inside = D.slow.filter((s) => s.at >= L.at - 2 && s.at + s.ms <= L.at + L.ms + 2);
    const top = inside.sort((a, b) => b.ms - a.ms)[0];
    const k = top ? `${top.kind}: ${top.kind === 'frame' ? Object.entries(top.parts || {}).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([p]) => p).join('+') || '?' : top.src}` : 'not in a callback (decode / GC / style / browser)';
    const b = by[k] || (by[k] = { n: 0, ms: 0, max: 0 });
    b.n++; b.ms += L.ms; b.max = Math.max(b.max, L.ms);
  }
  R.drive = {
    frames: D.ft.length, p50: pct(D.ft, 0.5), p95: pct(D.ft, 0.95), p99: pct(D.ft, 0.99), over50: D.ft.filter((x) => x > 50).length,
    longN: D.long.length, longMs: D.long.reduce((a, e) => a + e.ms, 0), longBy: Object.fromEntries(Object.entries(by).sort((a, b) => b[1].ms - a[1].ms)),
    madeHere: h1.madeHere - h0.madeHere, madeHereMs: h1.syncMs - h0.syncMs, evicted: h1.evicted - h0.evicted, sprReq: h1.sprReq - h0.sprReq, late: h1.late, bakes: h1.bakeN - h0.bakeN, kept: h1.kept - h0.kept, server: h1.server - h0.server,
    heapStart: h0.heapMB, heapEnd: h1.heapMB, heapMax: Math.max(0, ...D.heap.map((x) => x[1])), allocMBs: Math.round(10 * D.heap.reduce((a, x, i) => a + (i && x[1] > D.heap[i - 1][1] ? x[1] - D.heap[i - 1][1] : 0), 0) / Math.max(1, (D.heap.length - 1))) / 10, gcDrops: D.heap.filter((x, i) => i && x[1] < D.heap[i - 1][1] - 1).length, gpuMB: h1.gpuMB, reworld: h1.reworld - h0.reworld, swaps,
    kinds: Object.fromEntries(Object.entries(D.kinds).map(([k, v]) => [k, { n: v.n, ms: Math.round(v.ms), slowN: v.slowN, slowMs: Math.round(v.slowMs), max: Math.round(v.max) }])),
    autopilot: D.ap,
    frameMs: Math.round(100 * D.cbSum / Math.max(1, D.partN)) / 100,
    partsMs: Object.fromEntries(Object.entries(D.partSum).map(([k, v]) => [k, Math.round(100 * v / Math.max(1, D.partN)) / 100]).sort((a, b) => b[1] - a[1])),
  };
  R.slow = D.slow.sort((a, b) => b.ms - a.ms).slice(0, 80);
  R.hostSlow = await page.evaluate(() => (window.__drive.hostSlow || []).sort((a, b) => b.ms - a.ms).slice(0, 120));
  log(`the renderer's slow steps: ${JSON.stringify(R.hostSlow.slice(0, 30))}`);
  R.errors = errors.slice(0, 10);
  R.worldLog = worldLog;
  log(`the page's [world] / [art2] lines: ${JSON.stringify(worldLog.slice(-12))}`);
  log(`drive: ${JSON.stringify({ ...R.drive, longBy: undefined, kinds: undefined, autopilot: undefined })}`);
  log(`long tasks by source: ${JSON.stringify(R.drive.longBy, null, 1)}`);
  log(`callbacks: ${JSON.stringify(R.drive.kinds)}`);
  log(`a frame's page work: ${R.drive.frameMs} ms - by part ${JSON.stringify(R.drive.partsMs)}`);
  log(`slowest: ${JSON.stringify(R.slow.slice(0, 25), null, 0)}`);
  log(`hud at the end:\n${h1.hud}`);
  }
  await page.screenshot({ path: OUT ? OUT.replace(/\.json$/, '.png') : '/tmp/drivebench.png' }).catch(() => {});
  await ctx.close();
} finally { await browser.close(); stop(); }
if (OUT) writeFileSync(OUT, JSON.stringify(R, null, 1));
log('done');
