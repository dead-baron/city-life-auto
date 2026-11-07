// The walk-in and loading-screen benchmark (2026-11-06, the owner's Pixel 7 Pro: "this interior for a nightclub is not
// loading after quite some time", and in portrait "the message for loading art flips between two messages and it just
// pops in and out over and over"). The game as that phone shows it - a 411x891 portrait screen at 2.6 device pixels per
// CSS pixel, touch, a phone's user agent, the Medium preset - against a local server (World v3, dev):
//   load    PLAY to the city: every change of the loading screen (its status line, its bar, whether it shows) as it
//           happens, and a filmstrip (a frame every --every ms), from a first visit (an empty store) then the page
//           reloaded (the city and the chunks kept)
//   enter   walking into a walk-in (--place, by name: The Violet Room by default) with the page's CPU slowed (--cpu, 4):
//           from the step through its door to its inside drawn cut away (host.js insideReady), the cut-away bakes as
//           they land, the queue; and a picture of the room once it's drawn (and after --wait s more)
// Heavy - run it under `flock /tmp/cla-heavy.lock`:
//   node tools/interiorbench.mjs [--phase load,enter] [--out dir] [--cpu 4] [--place "The Violet Room"] [--every 250]
//                                [--landscape] [--desktop] [--draw] [--night] [--port 8096] [--root <another build>]
// This machine has no GPU: WebGL runs in SwiftShader on the CPU, so by default nothing is rasterized (the draws are
// no-ops) except for the pictures (--draw: all of it drawn). Compare runs with each other, not with the phone.
import { spawn, spawnSync } from 'node:child_process';
import { writeFileSync, readFileSync, existsSync, statSync, mkdirSync } from 'node:fs';
import { createServer } from 'node:http';
import { join, normalize, extname } from 'node:path';
import { gzipSync } from 'node:zlib';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const HERE = fileURLToPath(new URL('..', import.meta.url));
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i < 0 ? d : process.argv[i + 1] === undefined || process.argv[i + 1].startsWith('--') ? true : process.argv[i + 1]; };
const ROOT = arg('root', null) ? join(arg('root'), '/') : HERE;
const PORT = +arg('port', 8096), CPU = +arg('cpu', 4), OUT = arg('out', '/tmp/interiorbench'), PLACE = arg('place', 'The Violet Room'), EVERY = +arg('every', 250);
const PHASES = String(arg('phase', 'load,enter')).split(','), DRAW = !!arg('draw', false), NIGHT = !!arg('night', false), WAIT = +arg('wait', 20);
const LAND = !!arg('landscape', false), DESK = !!arg('desktop', false);
mkdirSync(OUT, { recursive: true });
const req = createRequire(import.meta.url);
let pw;
for (const p of ['playwright', '/opt/npm-tools/node_modules/playwright', '/home/claude/.npm-global/lib/node_modules/playwright']) { try { pw = req(p); break; } catch { /* next */ } }
if (!pw) { console.error('playwright not found'); process.exit(1); }
const t0 = Date.now(), log = (s) => console.log(`[${((Date.now() - t0) / 1000).toFixed(0)} s] ${s}`);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

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

// in the page from its first line: the phone's cores and memory; no rasterizing (unless --draw); and the loading screen
// watched every frame - each change of what it shows, with when
function probe(o) {
  if (o.nodraw && window.WebGL2RenderingContext) {
    const P = WebGL2RenderingContext.prototype, nop = function () {};
    for (const k of ['drawArrays', 'drawArraysInstanced', 'drawElements', 'drawElementsInstanced', 'drawRangeElements', 'blitFramebuffer']) if (P[k]) P[k] = nop;
  }
  try { Object.defineProperty(Navigator.prototype, 'hardwareConcurrency', { get: () => 8, configurable: true }); Object.defineProperty(Navigator.prototype, 'deviceMemory', { get: () => 8, configurable: true }); } catch { /* sealed */ }
  const L = (window.__load = { on: false, t0: 0, log: [], last: '' });
  const look = () => {
    const $ = (id) => document.getElementById(id), title = $('title'), st = $('t-status'), bar = $('t-warm'), fill = bar && bar.firstElementChild, veil = $('veil'), ld = $('loadscr');
    const vis = (el) => !!el && !el.classList.contains('hidden') && getComputedStyle(el).display !== 'none' && getComputedStyle(el).visibility !== 'hidden' && +getComputedStyle(el).opacity > 0.01;
    return {
      title: vis(title), loading: !!title && title.classList.contains('loading'), status: st ? st.textContent : '', statusVis: vis(st), bar: vis(bar), fill: fill ? fill.style.width : '',
      veil: !!veil && veil.classList.contains('on'), screen: ld ? { on: vis(ld), msg: (ld.querySelector('.ls-msg') || {}).textContent || '', fill: (ld.querySelector('.ls-bar > i') || { style: {} }).style.width || '', op: getComputedStyle(ld).opacity } : null,
      exit: vis($('exithint')) ? $('exithint').textContent : '', playing: !!(window.CLA && window.CLA.S && window.CLA.S.playing),
    };
  };
  const tick = () => {
    if (L.on) { const s = look(), k = JSON.stringify(s); if (k !== L.last) { L.last = k; L.log.push({ t: Math.round(performance.now() - L.t0), ...s }); } }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  L.start = () => { L.on = true; L.t0 = performance.now(); L.log = []; L.last = ''; };
}

const browser = await pw.chromium.launch({ args: ['--enable-precise-memory-info'] });
const screen = DESK ? { width: 1280, height: 720, dpr: 1, mobile: false } : LAND ? { width: 891, height: 411, dpr: 2.6, mobile: true } : { width: 411, height: 891, dpr: 2.6, mobile: true };
async function newCtx() {
  const ctx = await browser.newContext({
    viewport: { width: screen.width, height: screen.height }, deviceScaleFactor: screen.dpr, isMobile: screen.mobile, hasTouch: screen.mobile,
    ...(screen.mobile ? { userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36' } : null),
  });
  await ctx.addInitScript(probe, { nodraw: !DRAW });
  await ctx.addInitScript(() => { try { localStorage.setItem('cla.settings', JSON.stringify({ gfxPreset: 'medium', autoFullscreen: false })); localStorage.setItem('cla.perfhud', '1'); localStorage.setItem('cla.gate', JSON.stringify({ age17: true, consent: 'essential', at: Date.now() })); } catch { /* none */ } });
  return ctx;
}
async function waitFor(page, fn, ms, a) {
  const end = Date.now() + ms;
  while (Date.now() < end) { try { await page.waitForFunction(fn, a, { timeout: end - Date.now(), polling: 100 }); return true; } catch (e) { if (!/context|navigat|destroyed/i.test(String(e && e.message))) return false; await wait(300); } }
  return false;
}
// a JPEG under 600 KB (quality down until it fits)
async function shot(page, path, o = {}) {
  for (const q of [80, 65, 50, 35]) {
    const b = await page.screenshot({ type: 'jpeg', quality: q, scale: o.scale || 'device', ...o.clip ? { clip: o.clip } : null }).catch(() => null);
    if (!b) return false;
    if (b.length < 600e3 || q === 35) { writeFileSync(path, b); return true; }
  }
  return false;
}
// the filmstrip's frames side by side in one JPEG (python3 + PIL), at most 600 KB
function strip(files, out, cols = 8) {
  const py = `
import sys
from PIL import Image, ImageDraw
fs = sys.argv[2:]; cols = int(sys.argv[1]); out = fs.pop(0)
ims = [Image.open(f) for f in fs]
w, h = ims[0].size; k = 200.0 / w; tw, th = int(w * k), int(h * k)
rows = (len(ims) + cols - 1) // cols
S = Image.new('RGB', (cols * tw, rows * (th + 14)), (16, 16, 20)); d = ImageDraw.Draw(S)
for i, im in enumerate(ims):
    x, y = (i % cols) * tw, (i // cols) * (th + 14)
    S.paste(im.convert('RGB').resize((tw, th)), (x, y + 14)); d.text((x + 4, y + 1), fs[i].split('/')[-1].split('.')[0], fill=(230, 230, 210))
q = 80
while True:
    S.save(out, quality=q)
    import os
    if os.path.getsize(out) < 600000 or q <= 30: break
    q -= 10
`;
  const r = spawnSync('python3', ['-c', py, String(cols), out, ...files], { encoding: 'utf8' });
  if (r.status) log(`strip: ${r.stderr.slice(-300)}`);
}

// PLAY to the city, the loading screen watched and filmed
async function loadRun(page, tag, cold) {
  if (cold) await page.goto(`${BASE}/?debug&server=${encodeURIComponent(GAME)}`, { waitUntil: 'commit' });
  else await page.reload({ waitUntil: 'commit' });
  const ready = await waitFor(page, () => { const p = document.getElementById('play'); return p && !p.disabled; }, 300000);
  if (!ready) throw new Error('PLAY never came up');
  await wait(800);
  await page.evaluate(() => window.__load.start());
  const t = Date.now(), frames = [];
  let n = 0, done = 0;
  const filming = (async () => {
    while (!done || Date.now() - done < 1500) {
      const f = join(OUT, `${tag}-${String(n).padStart(3, '0')}.jpg`);
      const t1 = Date.now();
      if (await shot(page, f, { scale: 'css' })) frames.push(f);
      n++;
      if (n > 400) break;
      await wait(Math.max(0, EVERY - (Date.now() - t1)));
    }
  })();
  await page.evaluate(() => document.getElementById('play').click());
  const inCity = await waitFor(page, () => window.CLA && window.CLA.S && window.CLA.S.playing && document.getElementById('title').classList.contains('hidden') && !(document.getElementById('loadscr') && document.getElementById('loadscr').classList.contains('on')), 300000);
  done = Date.now();
  await filming;
  const L = await page.evaluate(() => ({ log: window.__load.log, warm: window.CLA.S.warmEnd || null, load: window.CLA.load ? window.CLA.load.at : null }));
  const msgs = [], fills = [];
  for (const e of L.log) {
    const m = e.screen && e.screen.on ? e.screen.msg : e.title && e.loading ? e.status : null;
    if (m && msgs[msgs.length - 1] !== m) msgs.push(m);
    const f = e.screen && e.screen.on ? parseFloat(e.screen.fill) : e.title && e.bar ? parseFloat(e.fill) : NaN;
    if (!Number.isNaN(f)) fills.push(f);
  }
  let back = 0; for (let i = 1; i < fills.length; i++) if (fills[i] < fills[i - 1] - 0.5) back++;
  const R = { tag, inCity, ms: done - t, changes: L.log.length, messages: msgs, msgChanges: msgs.length, barBack: back, warm: L.warm, load: L.load, frames: frames.length };
  writeFileSync(join(OUT, `${tag}.json`), JSON.stringify({ ...R, log: L.log }, null, 1));
  if (frames.length) strip(frames, join(OUT, `${tag}-strip.jpg`));
  log(`${tag}: ${JSON.stringify(R)}`);
  return R;
}

// into the walk-in: outside its door (it's night: a club's shutter is up), the screen drawn, then the CPU slowed and
// a walk in through the door; until its inside is drawn cut away
async function enterRun(page, tag, cdp) {
  await page.evaluate(() => { window.CLA.send({ t: 'devmode', pw: '' }); });
  await wait(800);
  for (let i = 0; i < 30; i++) {
    const st = await page.evaluate(() => { const S = window.CLA.S, f = S.me && S.me.ftue; if (S.hud && S.hud.menuOpen) S.hud.closeMenu(); if (!f || f.st !== 'done') window.CLA.send({ t: 'intro', a: 'skip' }); return f ? f.st : null; });
    if ((st === 'done' && i >= 3) || (st === null && i >= 20)) break;
    await wait(1000);
  }
  await page.evaluate(() => { const s = window.CLA.send; s({ t: 'dev', c: 'time', m: 23 * 60 }); s({ t: 'dev', c: 'clockhold' }); s({ t: 'dev', c: 'clear' }); s({ t: 'dev', c: 'wxhold' }); s({ t: 'dev', c: 'god' }); });
  // where it is: the places list (every POI, from a window) - then, once the window holds it, its door
  const at = await page.evaluate((name) => { const S = window.CLA.S, pl = (S.map.places || []).find((p) => p && p.label === name); return pl ? { x: pl.x, y: pl.y } : null; }, PLACE);
  if (!at) throw new Error(`no place ${PLACE}`);
  await page.evaluate((p) => window.CLA.send({ t: 'dev', c: 'tp', x: p.x, y: p.y + 200, snap: true }), at);
  await wait(4000);
  const door = await (async () => {
    for (let i = 0; i < 60; i++) {
      const d = await page.evaluate((name) => {
        const m = window.CLA.S.map;
        for (const id of m.walkIns || []) { const b = m.buildings[id]; if (!b || !b.walkIn) continue; const pois = (m.pois || []).filter((p) => p && p.b === id); if (b.name === name || pois.some((p) => p.label === name)) { const u = b.walkIn.units[0]; return { id, x: (u.door.tx + 1) * 32, y: (u.door.ty + 0.5) * 32, south: b.walkIn.south }; } }
        return null;
      }, PLACE);
      if (d) return d;
      await wait(1000);
    }
    return null;
  })();
  if (!door) throw new Error(`${PLACE}: no walk-in door found`);
  const outside = { x: door.x, y: door.y + (door.south ? 80 : -80) };
  await page.evaluate((p) => window.CLA.send({ t: 'dev', c: 'tp', x: p.x, y: p.y, snap: true }), outside);
  await wait(2000);
  await waitFor(page, () => { const w = window.CLA.S.art2, W = w && w.warmth && w.warmth(); return W && W.scr > 0 && W.scrHave === W.scr && !(w.jump && !w.jump.drawn && !w.jump.over); }, 240000);
  await wait(+arg('linger', 1) * 1000);   // (standing at the door this long first: what's baked ahead)
  if (CPU > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU });
  // watched every frame from here: inside yet, its inside drawn yet, what's on screen and what's baking
  await page.evaluate((bid) => {
    const w = window.CLA.S.art2, R = (window.__in = { t0: performance.now(), ev: [], inAt: 0, readyAt: 0, cutUp: [] });
    const up0 = w.E.uploadChunk.bind(w.E);
    w.E.uploadChunk = (cx, cy, g, ...a) => { R.cutUp.push({ t: Math.round(performance.now() - R.t0), cx, cy }); return up0(cx, cy, g, ...a); };
    const tick = () => {
      const F = w.F, b = F && F.insideB, t = Math.round(performance.now() - R.t0);
      if (b && !R.inAt) { R.inAt = t; R.ev.push({ t, e: 'in', b: b.id }); }
      if (R.inAt && !R.readyAt && w.insideReady(window.CLA.S.map.buildings[bid])) { R.readyAt = t; R.ev.push({ t, e: 'ready' }); }
      if (R.inAt && (t % 500) < 20) { const p = w.pool && w.pool.stats(); R.ev.push({ t, e: 'q', run: p && p.running, q: p && p.queued, res: w.results.size, fails: w.chunkFails.size, err: w.lastErr }); }
      if (!R.readyAt || t - R.readyAt < 3000) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, door.id);
  // in through the doorway: a step (the dev teleport, two tiles - a phone's touch stick can't be driven from here)
  await page.evaluate((p) => window.CLA.send({ t: 'dev', c: 'tp', x: p.x, y: p.y, snap: true }), { x: door.x, y: door.y + (door.south ? -80 : 80) });
  await waitFor(page, () => window.__in.inAt > 0, 15000);
  const ok = await waitFor(page, () => window.__in.readyAt > 0, 120000);
  const R = await page.evaluate(() => window.__in);
  if (CPU > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  const res = { tag, place: PLACE, building: door.id, cpu: CPU, ready: ok, inAt: R.inAt, readyAt: R.readyAt, enterToDrawn: ok ? R.readyAt - R.inAt : null, uploads: R.cutUp.filter((u) => u.t >= R.inAt).length, ev: R.ev.filter((e) => e.e !== 'q').concat(R.ev.filter((e) => e.e === 'q').slice(0, 40)) };
  writeFileSync(join(OUT, `${tag}.json`), JSON.stringify(res, null, 1));
  log(`${tag}: ${JSON.stringify({ ...res, ev: undefined })}`);
  return res;
}

let BASE = arg('url', null), GAME = arg('game', null);
if (!BASE) { log('starting the server (World v3, dev)'); await startServer(); log('server up'); await startPages(PORT + 1); BASE = `http://127.0.0.1:${PORT + 1}`; GAME = `ws://127.0.0.1:${PORT}/ws`; }
const ALL = { screen, at: new Date().toISOString() };
try {
  const ctx = await newCtx(), page = await ctx.newPage(), cdp = await ctx.newCDPSession(page);
  page.on('pageerror', (e) => log(`page error: ${String(e.message || e).slice(0, 200)}`));
  const sz = DESK ? 'desk' : LAND ? 'land' : 'port';
  if (PHASES.includes('load')) {
    if (CPU > 1 && arg('loadcpu', false)) await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU });
    ALL.cold = await loadRun(page, `load-${sz}-cold`, true);
    ALL.warm = await loadRun(page, `load-${sz}-warm`, false);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  } else {
    await page.goto(`${BASE}/?debug&server=${encodeURIComponent(GAME)}`, { waitUntil: 'commit' });
    await waitFor(page, () => { const p = document.getElementById('play'); return p && !p.disabled; }, 300000);
    await wait(800);
    await page.evaluate(() => document.getElementById('play').click());
    await waitFor(page, () => window.CLA && window.CLA.S && window.CLA.S.playing && window.CLA.load && window.CLA.load.at.screen, 300000);
  }
  if (PHASES.includes('enter')) {
    ALL.enter = await enterRun(page, `enter-${sz}`, cdp);
    if (DRAW) {
      await wait(1500);
      await shot(page, join(OUT, `inside-${sz}-${NIGHT ? 'night' : 'night'}.jpg`));
      await page.evaluate(() => { const s = window.CLA.send; s({ t: 'dev', c: 'time', m: 13 * 60 + 55 }); s({ t: 'dev', c: 'clockhold' }); });
      await wait(4000);
      await shot(page, join(OUT, `inside-${sz}-day.jpg`));
    }
    if (PHASES.includes('jump')) {   // (a teleport across the world: the "Loading the area..." veil watched)
      const R = [];
      for (const [i, where] of [[0, 'Pine Hills'], [1, 'Downtown']].entries()) {
        await page.evaluate(() => window.__load.start());
        await page.evaluate(async (n) => { const m = await import('./client/devtp.js'), p = m.teleportPlaces(window.CLA.S.map).find((q) => q.name === n && q.kind === 'district'); if (p) window.CLA.send({ t: 'dev', c: 'tp', x: p.x, y: p.y, snap: true }); }, where[1]);
        await wait(20000);
        const L = await page.evaluate(() => window.__load.log);
        let on = 0, flips = 0, prev = false;
        for (const e of L) { if (e.veil !== prev) { flips++; if (e.veil) on++; prev = e.veil; } }
        R.push({ to: where[1], veilOn: on, flips, log: L.map((e) => `${e.t} veil ${e.veil ? 1 : 0}`) });
        log(`jump to ${where[1]}: veil on ${on} time(s), ${flips} flips`);
      }
      writeFileSync(join(OUT, `jump-${sz}.json`), JSON.stringify(R, null, 1));
      ALL.jump = R.map((q) => ({ to: q.to, veilOn: q.veilOn, flips: q.flips }));
    }
    if (arg('again', false)) {   // (out and in again: the second time, from the store)
      await page.keyboard.down('KeyS'); await wait(2500); await page.keyboard.up('KeyS'); await wait(3000);
      ALL.again = await enterRun(page, `enter-${sz}-again`, cdp);
    }
  }
  await ctx.close();
} finally { await browser.close(); stop(); }
writeFileSync(join(OUT, 'summary.json'), JSON.stringify(ALL, null, 1));
log('done');
