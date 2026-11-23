// Shadows on open water (art v2 lightgame.js sunVis WATER_REACH / WATER_TMAX; the owner, 11-23: long shadows from cars on a
// bridge, boats, a seaplane, leaping fish, across the water): something far above open water - a deck, a mast - throws
// no long shadow across it; on ground the same block does. The full frame on the GPU (headless Chromium, software GL).
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { findChrome } from './hudpage.js';

const ROOT = new URL('../', import.meta.url);
const PAGE = `<!doctype html><meta charset="utf-8"><canvas id="c" width="256" height="256"></canvas><pre id="out">...</pre>
<script type="module">
import { Art2Engine } from '/client/art2/game/engine.js';
import { F_GROUND, F_WATER, OCT_MID } from '/client/art2/gbuf.js';
import { PRESETS_GAME } from '/client/art2/game/lightgame.js';
const out = document.getElementById('out');
try {
  const E = Art2Engine.create(document.getElementById('c'), { quality: 3 });
  if (!E) throw new Error('no engine: ' + Art2Engine.lastWhy);
  // one chunk: a floor (open water, or ground) with a tall block in its middle (world 280..320 x 280..320, 60 high) - a
  // bridge deck's or a mast's height over it; the sun low in the west (golden hour) throws its shadow east
  const T = 384, mk = (fl) => { const p0 = new Uint8Array(T * T * 4), p1 = new Uint8Array(T * T * 4), p2 = new Uint8Array(T * T * 4);
    for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) { const i = (y * T + x) * 4, b = x >= 140 && x < 160 && y >= 140 && y < 160;
      p0.set(b ? [150, 150, 150, 255] : fl === F_WATER ? [40, 90, 140, 255] : [120, 160, 90, 255], i);
      p1.set(b ? [60, 0, 0, OCT_MID] : [0, 0, fl, OCT_MID], i); p2.set([0, 0, 0, OCT_MID], i); }
    return { w: T, h: T, ap: 2, p0, p1, p2 }; };
  const gl = E.gl, px = new Uint8Array(4), r = {};
  const lum = (fl) => {
    E.uploadChunk(0, 0, mk(fl));
    E.beginFrame({ camX: 300, camY: 300, zoom: 1, viewW: 256, viewH: 256, time: 0, quality: 3, preset: PRESETS_GAME.golden, fades: new Map(), clear: new Float32Array(16) });
    E.endFrame();
    const at = (x, y) => { gl.bindFramebuffer(gl.FRAMEBUFFER, E.fbOut); gl.readPixels(x - E.ox, y - E.oy, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); return px[0] + px[1] + px[2]; };   // (the lit frame, before it's shown)
    return { lee: at(334, 334), open: at(334, 230) };   // (down and east of the block: in the low western sun's shadow of it; and well clear of it)
  };
  r.ground = lum(F_GROUND); r.water = lum(F_WATER);
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

test('open water takes no long shadow from something far above it; ground does', { skip: !findChrome() && 'no headless Chromium (set CLA_CHROME)' }, async () => {
  const srv = await serve();
  let dom;
  try {
    dom = await new Promise((ok, no) => execFile(findChrome(), ['--headless', '--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist',
      '--virtual-time-budget=30000', '--dump-dom', `http://127.0.0.1:${srv.address().port}/__xfade.html`], { maxBuffer: 16 << 20, timeout: 180000 }, (e, so) => (e ? no(e) : ok(so))));
  } finally { srv.close(); }
  const m = /<pre id="out">(.*?)<\/pre>/s.exec(dom);
  assert.ok(m && m[1].startsWith('{'), `the page: ${m ? m[1].slice(0, 600) : dom.slice(0, 400)}`);
  const r = JSON.parse(m[1]);
  assert.ok(r.ground.lee < r.ground.open * 0.85, `ground: the block's shadow falls on it (${JSON.stringify(r.ground)})`);
  assert.ok(r.water.lee > r.water.open * 0.9, `open water: no long shadow from a height far above it (${JSON.stringify(r.water)})`);
});
