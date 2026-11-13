// The capture driver (the owner, 2026-11-13: trailers and TikTok clips from the scene director's scripts): plays a scene on
// a private capture server and records it frame by frame - a steady 60 fps whatever the machine (no GPU here: software
// WebGL), wide 16:9 and tall 9:16 from the same take.
//   node tools/capture.mjs --scene bikerbrawl [--scene ...|--all] [--out DIR] [--size 1080|1440] [--orient wide,tall]
//        [--secs N] [--fps 60] [--seed 1337] [--world v3|today] [--port 8299] [--data DIR] [--jpeg] [--crf 16]
//        [--frames N] (a short test) [--server] (one already running there) [--sheet] (a dozen frames kept as pictures)
//        [--pages] (a page for each shape, not one square page cut both ways)
// What it does, for each scene:
//   1. starts the server with CLA_CAPTURE=1 on its own port (server/capture.js: seeded, private, stepped from here)
//   2. opens the page for each shape at once (Playwright, the Ultra preset, ?capture: the page draws a frame only when
//      asked - main.js __capFrame), the page's clock Playwright's (page.clock), joins as a camera (no FTUE, hidden)
//   3. steps the world a fixed few ticks (the city fills in), starts the scene held at its first moment (/capture/start),
//      steps the hold, then waits - the world still - until every page has the art on screen
//   4. the take: every 3 frames one server tick (20 ticks a second, 60 frames), each frame drawn at its own time on the
//      page's clock, the art waited for when a new sprite is still coming, the picture taken (CDP) and piped to ffmpeg
//      (H.264, CRF 16 by default, yuv420p, faststart)
// Same seed, same scene: the same take every run (the server's world doesn't tick by itself; nothing waits on the clock).
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : d; };
const flag = (k) => args.includes(`--${k}`);
const many = (k) => args.flatMap((a, i) => (a === `--${k}` && args[i + 1] ? [args[i + 1]] : []));

const { SCENE_LIST, SCENES } = await import('../shared/scenes/index.js');
const scenes = flag('all') ? SCENE_LIST.map((s) => s.id) : many('scene');
if (!scenes.length || scenes.some((s) => !SCENES[s])) { console.log(`Which scene? --scene <${SCENE_LIST.map((s) => s.id).join('|')}> or --all`); process.exit(1); }
const OUT = opt('out', join(ROOT, 'captures'));
const SIZE = Number(opt('size', '1080')), LONG = Math.round(SIZE * 16 / 9);
const ORIENTS = opt('orient', 'wide,tall').split(',');
// both shapes from one square page (--pages: a page each instead): the take drawn once, LONG x LONG, and cut to 16:9 and
// 9:16 round its middle - half the drawing, and the two the very same frames
const SQUARE = ORIENTS.length > 1 && !flag('pages');
const SHAPES = SQUARE ? [{ o: 'square', w: LONG, h: LONG, cuts: ORIENTS.map((o) => (o === 'tall' ? { o, w: SIZE, h: LONG } : { o: 'wide', w: LONG, h: SIZE })) }]
  : ORIENTS.map((o) => (o === 'tall' ? { o, w: SIZE, h: LONG } : { o: 'wide', w: LONG, h: SIZE }));
const FPS = Number(opt('fps', '60')), SEED = Number(opt('seed', '1337')), PORT = Number(opt('port', '8299'));
const WORLD = opt('world', 'v3'), CRF = opt('crf', '16'), JPEG = flag('jpeg'), LIMIT = Number(opt('frames', '0')) || 0;
const DATA = opt('data', join(ROOT, 'data-capture'));
const PRE_TICKS = 60, HOLD_TICKS = 40;   // the city filling in before the scene, the scene's first moment held
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(`[capture ${new Date().toISOString().slice(11, 19)}]`, ...a);

async function pw() {
  for (const p of [process.env.PLAYWRIGHT_PATH, 'playwright', '/opt/npm-tools/node_modules/playwright/index.js'].filter(Boolean)) {
    try { const m = await import(p); return m.default || m; } catch { /* next */ }
  }
  throw new Error('Playwright not found (PLAYWRIGHT_PATH=/path/to/playwright/index.js)');
}
const { chromium } = await pw();

// ---- the server -----------------------------------------------------------------------------------------------------------
const base = `http://127.0.0.1:${PORT}`;
const get = async (path) => { const r = await fetch(base + path); const j = await r.json(); if (!r.ok) throw new Error(`${path}: ${j.err || r.status}`); return j; };
async function startServer() {
  if (flag('server')) return null;
  mkdirSync(DATA, { recursive: true });
  const env = { ...process.env, CLA_CAPTURE: '1', PORT: String(PORT), HOST: '127.0.0.1', CLA_DATA_DIR: DATA, CLA_SEED: String(SEED), CLA_WORLD: WORLD === 'v3' ? 'v3' : 'today', NODE_ENV: 'development' };
  const srv = spawn(process.execPath, ['--max-old-space-size=3000', join(ROOT, 'server/index.js')], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  srv.stdout.on('data', (d) => { const s = String(d); if (/error|World v3 up|listening/i.test(s)) process.stdout.write(`  [server] ${s}`); });
  srv.stderr.on('data', (d) => process.stdout.write(`  [server!] ${d}`));
  for (let i = 0; i < 1200; i++) { try { const r = await fetch(`${base}/health`); if (r.ok) return srv; } catch { /* not yet */ } await wait(500); }
  throw new Error('the capture server did not come up');
}

// ---- the pages ------------------------------------------------------------------------------------------------------------
const INIT = "try { localStorage.setItem('cla.tutorial', '99'); const s = JSON.parse(localStorage.getItem('cla.settings') || '{}'); s.gfxPreset = 'ultra'; s.gfxOpts = null; s.autoFullscreen = false; s.diag = false; localStorage.setItem('cla.settings', JSON.stringify(s)); } catch (e) {}";
const T0 = Date.UTC(2026, 10, 13, 20, 0, 0);
async function openPage(shape) {
  const dir = join(DATA, `browser-${shape.o}-${shape.w}x${shape.h}`);
  const ctx = await chromium.launchPersistentContext(dir, { viewport: { width: shape.w, height: shape.h }, deviceScaleFactor: 1, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'] });
  await ctx.addInitScript(INIT);
  const pg = ctx.pages()[0] || await ctx.newPage();
  pg.on('pageerror', (e) => log(shape.o, 'pageerror', String(e).slice(0, 240)));
  await pg.clock.install({ time: T0 });
  await pg.goto(`${base}/index.html?debug&capture&server=ws://127.0.0.1:${PORT}/ws`);
  return { ...shape, ctx, pg, t: 0 };
}
// one frame drawn by the page (its clock's time, ms)
const frameAt = (P, ms) => P.pg.evaluate((t) => { if (window.__capFrame) window.__capFrame(t); }, ms);
const busy = (P) => P.pg.evaluate(() => (window.__capBusy ? window.__capBusy() : 'nohook')).catch((e) => `err ${e}`);
// the title screen to the city: the page's own buttons (no FTUE, no character creator on this server). The page joins at
// the title screen; the world is stepped a fixed number of ticks before (the caller), so it has someone to show.
async function connected(P) {
  for (let i = 0; i < 1200; i++) {
    P.t = await P.pg.evaluate(() => performance.now()); await frameAt(P, P.t);
    if (await P.pg.evaluate(() => !!(window.__S && __S.welcomed)).catch(() => false)) return;
    await wait(100);
  }
  throw new Error(`${P.o}: the page never connected`);
}
async function enter(P) {
  for (let i = 0; i < 3000; i++) {
    P.t = await P.pg.evaluate(() => performance.now());
    await frameAt(P, P.t);
    const st = await P.pg.evaluate(() => {
      if (window.__S && __S.playing) return true;
      const b = document.getElementById('play'); if (b && b.offsetParent && !b.disabled) b.click();
      const pa = document.querySelector('[data-act="play-as"]'); if (pa && pa.offsetParent) pa.click();
      const a = document.getElementById('g-age'); if (a && a.offsetParent) { a.checked = true; const e = document.getElementById('g-ess'); if (e) e.click(); }
      return false;
    }).catch(() => false);
    if (st) return true;
    if (i % 100 === 99) log(P.o, 'still entering the city...');
    await wait(100);
  }
  throw new Error(`${P.o}: the page never got into the city`);
}
// the page's frames in real time (its clock running) until the art for what's on screen is in - the world held still
async function warm(pages, maxS = 900) {
  const t0 = Date.now();
  let calm = 0;
  for (;;) {
    let all = true;
    for (const P of pages) { P.t = await P.pg.evaluate(() => performance.now()); await frameAt(P, P.t); const b = await busy(P); if (b) { all = false; P.why = b; } }
    calm = all ? calm + 1 : 0;
    if (calm >= 6) return;
    if ((Date.now() - t0) / 1000 > maxS) { log('warm: giving up waiting for', pages.map((P) => `${P.o}: ${P.why}`).join(', ')); return; }
    if (((Date.now() - t0) / 1000 | 0) % 15 === 0 && !all) log('warming', pages.map((P) => `${P.o}: ${P.why || 'ok'}`).join(', '));
    await wait(120);
  }
}
async function latest(P) { return P.pg.evaluate(() => (window.__S ? __S.latestTick : 0)); }
async function shot(P) {
  P.cdp ||= await P.ctx.newCDPSession(P.pg);
  const r = await P.cdp.send('Page.captureScreenshot', JPEG ? { format: 'jpeg', quality: 95 } : { format: 'png' });
  return Buffer.from(r.data, 'base64');
}
function encoder(dir, id, P) {
  const x264 = ['-c:v', 'libx264', '-preset', 'slow', '-crf', CRF, '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-movflags', '+faststart'];
  const outs = P.cuts
    ? ['-filter_complex', `[0:v]split=${P.cuts.length}${P.cuts.map((c, i) => `[s${i}]`).join('')};${P.cuts.map((c, i) => `[s${i}]crop=${c.w}:${c.h}:${(P.w - c.w) / 2}:${(P.h - c.h) / 2}[o${i}]`).join(';')}`, ...P.cuts.flatMap((c, i) => ['-map', `[o${i}]`, ...x264, join(dir, `${id}-${c.o}-${c.w}x${c.h}.mp4`)])]
    : ['-vf', `scale=${P.w}:${P.h}:flags=lanczos`, ...x264, join(dir, `${id}-${P.o}-${P.w}x${P.h}.mp4`)];
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', JPEG ? 'mjpeg' : 'png', '-i', '-', ...outs], { stdio: ['pipe', 'inherit', 'inherit'] });
  return { write: (b) => new Promise((r) => { if (!ff.stdin.write(b)) ff.stdin.once('drain', r); else r(); }), end: () => new Promise((r) => { ff.on('close', r); ff.stdin.end(); }) };
}

// ---- one take ------------------------------------------------------------------------------------------------------------
async function take(id) {
  const sc = SCENES[id];
  const secs = Number(opt('secs', String(sc.len))), frames = LIMIT || Math.round(secs * FPS);
  log(`${sc.n}: ${frames} frames (${(frames / FPS).toFixed(1)} s) at ${SHAPES.map((s) => `${s.w}x${s.h}`).join(' + ')}, the world ${WORLD}, seed ${SEED}`);
  const srv = await startServer();
  const pages = [];
  try {
    for (const s of SHAPES) pages.push(await openPage(s));
    for (const P of pages) await connected(P);
    for (let i = 0; i < 600 && (await get('/capture/state')).players.length < pages.length; i++) await wait(250);
    // the city fills in round the pages, a fixed number of ticks (the take doesn't depend on how long they took to load)
    await get(`/capture/step?n=${PRE_TICKS}`);
    for (const P of pages) await enter(P);
    // the scene set up and held at its first moment (its clock not running): the people and the traffic round it settle in
    // a fixed number of ticks, the pages get the art for its first shot (the world still), then it goes
    const st = await get(`/capture/start?id=${id}&seed=${SEED}&hold=1`);
    log('scene set', JSON.stringify({ seq: st.seq, viewers: st.viewers }));
    await get(`/capture/step?n=${HOLD_TICKS}`);
    await warm(pages);
    const go = await get('/capture/go');
    // the take
    const outDir = join(OUT, id);
    mkdirSync(outDir, { recursive: true });
    const enc = pages.map((P) => encoder(outDir, id, P));
    const keep = flag('sheet') ? pages.map(() => []) : null;
    for (const P of pages) { await P.pg.clock.pauseAt(T0 + 3600e3); P.t = await P.pg.evaluate(() => performance.now()); P.t0 = P.t; }
    const t0 = Date.now();
    let waits = 0, tick = go.tick;
    const tm = { step: 0, draw: 0, art: 0, shot: 0, enc: 0 }, lap = (k, t) => { const n = Date.now(); tm[k] += n - t; return n; };
    for (let f = 0; f < frames; f++) {
      let t = Date.now();
      if (f % 3 === 0) { const r = await get('/capture/step?n=1'); tick = r.tick; }
      t = lap('step', t);
      for (const [k, P] of pages.entries()) {
        for (let i = 0; i < 400 && (await latest(P)) < tick; i++) await wait(5);
        await P.pg.clock.runFor([17, 17, 16][f % 3]);
        const ms = P.t0 + (f + 1) * 1000 / FPS;
        t = Date.now(); await frameAt(P, ms); t = lap('draw', t);
        for (let i = 0; i < 300; i++) { const b = await busy(P); if (!b) break; waits++; await wait(60); await frameAt(P, ms); }   // (a sprite still coming: the same moment drawn again)
        t = lap('art', t);
        const img = await shot(P);
        t = lap('shot', t);
        await enc[k].write(img);
        lap('enc', t);
        if (keep && f % Math.max(1, Math.round(frames / 12)) === 0) keep[k].push(img);
      }
      if (f % 120 === 119 || f === frames - 1) log(`  frame ${f + 1}/${frames}: ${((Date.now() - t0) / 1000 / (f + 1)).toFixed(2)} s a frame (${pages.length} pages) - ${Object.entries(tm).map(([k, v]) => `${k} ${(v / 1000 / (f + 1)).toFixed(2)}`).join(', ')}`);
    }
    await Promise.all(enc.map((e) => e.end()));
    const spf = (Date.now() - t0) / 1000 / frames;
    log(`${sc.n}: done, ${spf.toFixed(2)} s a frame for ${pages.length} page(s) (${(spf / pages.length).toFixed(2)} each), ${waits} waits for art`);
    if (keep) for (const [k, P] of pages.entries()) keep[k].forEach((b, i) => writeFileSync(join(outDir, `${P.o}-${String(i).padStart(2, '0')}.${JPEG ? 'jpg' : 'png'}`), b));
    return { id, spf, frames };
  } finally {
    for (const P of pages) { try { await P.ctx.close(); } catch { /* gone */ } }
    if (srv) { srv.kill('SIGTERM'); await wait(1500); }
  }
}

const results = [];
for (const id of scenes) results.push(await take(id));
log('all done:', results.map((r) => `${r.id} ${r.frames} frames, ${r.spf.toFixed(2)} s/frame`).join('; '), '->', OUT);
process.exit(0);
