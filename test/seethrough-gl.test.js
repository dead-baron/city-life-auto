// See-through buildings on the GPU (art v2 engine.js STATIC_FS / GHOST_FS) in headless Chromium: whatever is behind a
// faded building - a car, a passer-by - is drawn through it, at a visible alpha, with the ghost over it; behind one
// that isn't fading, or under its footprint, it stays hidden (the owner, 10-24: "vehicles and NPCs and things
// disappeared entirely behind the building"). One synthetic chunk (a red block, the ground green under it), a blue
// sprite behind it; the scene's albedo read back before the lighting. Skipped without a headless Chromium (CLA_CHROME).
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { findChrome } from './hudpage.js';
import { GHOST, SEE } from '../client/art2/game/engine.js';

const ROOT = new URL('../', import.meta.url);
const PAGE = `<!doctype html><meta charset="utf-8"><canvas id="c" width="256" height="256"></canvas><pre id="out">...</pre>
<script type="module">
import { Art2Engine } from '/client/art2/game/engine.js';
import { F_GROUND, OCT_MID } from '/client/art2/gbuf.js';
const out = document.getElementById('out');
try {
  const E = Art2Engine.create(document.getElementById('c'), { quality: 0 });
  if (!E) throw new Error('no engine: ' + Art2Engine.lastWhy);
  const T = 384, p0 = new Uint8Array(T * T * 4), p1 = new Uint8Array(T * T * 4), p2 = new Uint8Array(T * T * 4), un = new Uint8Array(T * T * 4);
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
    const i = (y * T + x) * 4, b = x >= 100 && x < 200 && y >= 100 && y < 200;   // (the block: world 200..400 both ways)
    p0.set(b ? [200, 40, 40, 255] : [60, 140, 60, 255], i); p1.set(b ? [100, 0, 0, OCT_MID] : [0, 0, F_GROUND, OCT_MID], i); p2.set([0, 0, 0, OCT_MID], i);
    un.set([60, 140, 60, b ? 1 : 0], i);
  }
  // its footprint world y 300..400; its picture north of that (200..300) covers the street behind it
  E.uploadChunk(0, 0, { w: T, h: T, ap: 2, p0, p1, p2, under: un, blds: [[5, 200, 200, 400, 400, 400, 200, 300, 400, 400]] });
  const s0 = new Uint8Array(64 * 4), s1 = new Uint8Array(64 * 4), s2 = new Uint8Array(64 * 4);
  for (let i = 0; i < 64; i++) { s0.set([30, 60, 230, 255], i * 4); s1.set([10, 0, 0, OCT_MID], i * 4); s2.set([0, 0, 0, OCT_MID], i * 4); }
  if (!E.uploadSprite('car', { w: 8, h: 8, ax: 4, ay: 8, ap: 2, p0: s0, p1: s1, p2: s2 })) throw new Error('no sprite');
  const gl = E.gl, px = new Uint8Array(4);
  const frame = (fades, at) => {
    E.beginFrame({ camX: 300, camY: 300, zoom: 1, viewW: 256, viewH: 256, time: 0, quality: 0, fades, clear: new Float32Array(16) });
    for (const [x, y] of at) E.drawSprite('car', x, y, 0, { alpha: 1 });
    E._ensureScene(E.SW, E.SH); E._passStatic(); E._passDecals(); E._passSprites(); if (E._passGhost) E._passGhost();
    E.inFrame = false;
    gl.bindFramebuffer(gl.FRAMEBUFFER, E.fbScene); gl.readBuffer(gl.COLOR_ATTACHMENT0);
    return (x, y) => { gl.readPixels(x - E.ox, y - E.oy, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); return [px[0], px[1], px[2]]; };
  };
  const r = {};
  let at = frame(new Map([[5, 1]]), [[300, 250], [250, 370]]);
  r.behind = at(300, 243); r.ghost = at(230, 243); r.foot = at(250, 363); r.street = at(300, 150);
  at = frame(new Map(), [[300, 250]]);
  r.still = at(300, 243);
  out.textContent = JSON.stringify(r);
} catch (e) { out.textContent = 'ERR ' + (e && e.stack || e); }
</script>`;

function serve() {
  const srv = createServer((req, res) => {
    const p = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/+/, '');
    if (p === '__ghost.html') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end(PAGE); }
    try { if (p.includes('..')) throw new Error('no'); const b = readFileSync(new URL(p, ROOT)); res.writeHead(200, { 'content-type': p.endsWith('.js') ? 'text/javascript' : 'application/octet-stream' }); res.end(b); } catch { res.writeHead(404); res.end(); }
  });
  return new Promise((ok) => srv.listen(0, '127.0.0.1', () => ok(srv)));
}

test('a car behind a faded building is drawn through it, the ghost over it; hidden behind one that isn\'t fading', { skip: !findChrome() && 'no headless Chromium (set CLA_CHROME)' }, async () => {
  const srv = await serve();
  let dom;
  try {
    dom = await new Promise((ok, no) => execFile(findChrome(), ['--headless', '--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist',
      '--virtual-time-budget=30000', '--dump-dom', `http://127.0.0.1:${srv.address().port}/__ghost.html`], { maxBuffer: 16 << 20, timeout: 120000 }, (e, so) => (e ? no(e) : ok(so))));
  } finally { srv.close(); }
  const m = /<pre id="out">(.*?)<\/pre>/s.exec(dom);
  assert.ok(m && m[1].startsWith('{'), `the page: ${m ? m[1].slice(0, 400) : dom.slice(0, 400)}`);
  const r = JSON.parse(m[1]), near = (a, b, d = 12) => a.every((v, i) => Math.abs(v - b[i]) <= d);
  // behind the ghost: the car at near full strength, a share SEE of the ghost's building over it
  const k = (1 - GHOST) * SEE, want = [30, 60, 230].map((v, i) => Math.round(v * (1 - k) + [200, 40, 40][i] * k));
  assert.ok(near(r.behind, want), `the car behind the faded building: ${r.behind} (want ~${want})`);
  assert.ok(r.behind[2] > 160, 'mostly the car');
  const ghost = [200, 40, 40].map((v, i) => Math.round(v * (1 - GHOST) + [60, 140, 60][i] * GHOST));
  assert.ok(near(r.ghost, ghost), `the ghost round it: ${r.ghost} (want ~${ghost})`);
  assert.ok(near(r.foot, [200, 40, 40], 2), `under its footprint the car stays hidden: ${r.foot}`);
  assert.ok(near(r.still, [200, 40, 40], 2), `behind a building that isn't fading it stays hidden: ${r.still}`);
  assert.ok(near(r.street, [60, 140, 60], 2), `the street: ${r.street}`);
});
