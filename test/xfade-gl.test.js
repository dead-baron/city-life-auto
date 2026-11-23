// A walk-in's swap on the GPU (art v2 engine.js uploadChunk xf, STATIC_FS uX; the owner, 11-23: "the interior/exterior
// art just faded from one to the other ... it shouldn't be a full screen transition"): a chunk's picture swapped with a
// dissolve shows the old picture and the new one pixel by pixel half way through, only the new one once it's done, and a
// plain swap shows the new one at once. One synthetic chunk, red then blue; the scene's albedo read back before the
// lighting. Skipped without a headless Chromium (CLA_CHROME).
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { findChrome } from './hudpage.js';

const ROOT = new URL('../', import.meta.url);
const PAGE = `<!doctype html><meta charset="utf-8"><canvas id="c" width="256" height="256"></canvas><pre id="out">...</pre>
<script type="module">
import { Art2Engine, XF_MS } from '/client/art2/game/engine.js';
import { F_GROUND, OCT_MID } from '/client/art2/gbuf.js';
const out = document.getElementById('out');
try {
  const E = Art2Engine.create(document.getElementById('c'), { quality: 0 });
  if (!E) throw new Error('no engine: ' + Art2Engine.lastWhy);
  const T = 384, chunk = (rgb) => { const p0 = new Uint8Array(T * T * 4), p1 = new Uint8Array(T * T * 4), p2 = new Uint8Array(T * T * 4);
    for (let i = 0; i < T * T; i++) { p0.set([...rgb, 255], i * 4); p1.set([0, 0, F_GROUND, OCT_MID], i * 4); p2.set([0, 0, 0, OCT_MID], i * 4); }
    return { w: T, h: T, ap: 2, p0, p1, p2 }; };
  const gl = E.gl, px = new Uint8Array(32 * 32 * 4);
  const count = () => {
    E.beginFrame({ camX: 300, camY: 300, zoom: 1, viewW: 256, viewH: 256, time: 0, quality: 0, fades: new Map(), clear: new Float32Array(16) });
    E._ensureScene(E.SW, E.SH); E._passStatic(); E.inFrame = false;
    gl.bindFramebuffer(gl.FRAMEBUFFER, E.fbScene); gl.readBuffer(gl.COLOR_ATTACHMENT0);
    gl.readPixels(280 - E.ox, 280 - E.oy, 32, 32, gl.RGBA, gl.UNSIGNED_BYTE, px);
    let red = 0, blue = 0; for (let i = 0; i < 32 * 32; i++) { if (px[i * 4] > 150 && px[i * 4 + 2] < 90) red++; else if (px[i * 4 + 2] > 150 && px[i * 4] < 90) blue++; }
    return { red, blue };
  };
  const r = {};
  E.uploadChunk(0, 0, chunk([200, 40, 40]));
  r.before = count();
  E.uploadChunk(0, 0, chunk([40, 60, 220]), 0, performance.now());
  for (const s of E.slots) if (s.xf) s.xf = performance.now() - XF_MS * 0.5;   // (half way through its dissolve at the next frame's start: the engine reads the frame's time)
  r.half = count();
  for (const s of E.slots) if (s.xf) s.xf = performance.now() - XF_MS * 2;   // (long done)
  r.done = count();
  E.uploadChunk(0, 0, chunk([200, 40, 40]));   // (a plain swap: no dissolve)
  r.plain = count();
  out.textContent = JSON.stringify(r);
} catch (e) { out.textContent = 'ERR ' + (e && e.stack || e); }
</script>`;

function serve() {
  const srv = createServer((req, res) => {
    const p = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/+/, '');
    if (p === '__xfade.html') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end(PAGE); }
    try { if (p.includes('..')) throw new Error('no'); const b = readFileSync(new URL(p, ROOT)); res.writeHead(200, { 'content-type': p.endsWith('.js') ? 'text/javascript' : 'application/octet-stream' }); res.end(b); } catch { res.writeHead(404); res.end(); }
  });
  return new Promise((ok) => srv.listen(0, '127.0.0.1', () => ok(srv)));
}

test('a walk-in\'s swap dissolves pixel by pixel from the old picture to the new; a plain swap is at once', { skip: !findChrome() && 'no headless Chromium (set CLA_CHROME)' }, async () => {
  const srv = await serve();
  let dom;
  try {
    dom = await new Promise((ok, no) => execFile(findChrome(), ['--headless', '--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist',
      '--virtual-time-budget=30000', '--dump-dom', `http://127.0.0.1:${srv.address().port}/__xfade.html`], { maxBuffer: 16 << 20, timeout: 120000 }, (e, so) => (e ? no(e) : ok(so))));
  } finally { srv.close(); }
  const m = /<pre id="out">(.*?)<\/pre>/s.exec(dom);
  assert.ok(m && m[1].startsWith('{'), `the page: ${m ? m[1].slice(0, 400) : dom.slice(0, 400)}`);
  const r = JSON.parse(m[1]), N = 32 * 32;
  assert.equal(r.before.red, N, 'the old picture');
  assert.ok(r.half.red > N * 0.3 && r.half.blue > N * 0.3 && r.half.red + r.half.blue === N, `half way: old and new pixels, nothing else (${JSON.stringify(r.half)})`);
  assert.equal(r.done.blue, N, 'done: the new picture only');
  assert.equal(r.plain.red, N, 'a plain swap: at once');
});
