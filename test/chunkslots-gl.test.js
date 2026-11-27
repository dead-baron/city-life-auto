// The chunk slots on the GPU (art v2 engine.js _slot, reserveChunks; the owner, 11-23: art loading then disappearing in the
// chunk you're in, zoomed out, in a cinematic, an aircraft, on a phone): a chunk drawn this frame or the last is never
// given up for another one. Was: a walk-in's swap on the GPU (art v2 engine.js uploadChunk xf, STATIC_FS uX; the owner, 11-23: "the interior/exterior
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
import { Art2Engine, CHUNK_HARD } from '/client/art2/game/engine.js';
import { F_GROUND, OCT_MID } from '/client/art2/gbuf.js';
const out = document.getElementById('out');
try {
  const E = Art2Engine.create(document.getElementById('c'), { quality: 0, lowMem: true });
  if (!E) throw new Error('no engine: ' + Art2Engine.lastWhy);
  const T = 384, p0 = new Uint8Array(T * T * 4), p1 = new Uint8Array(T * T * 4), p2 = new Uint8Array(T * T * 4);
  for (let i = 0; i < T * T; i++) { p0.set([90, 140, 60, 255], i * 4); p1.set([0, 0, F_GROUND, OCT_MID], i * 4); p2.set([0, 0, 0, OCT_MID], i * 4); }
  const g = { w: T, h: T, ap: 2, p0, p1, p2 }, r = { cap: E.chunkCap() };
  // twelve chunks in view at once (all drawn this frame), more than a low-memory engine's slots
  const view = []; for (let cy = 0; cy < 3; cy++) for (let cx = 0; cx < 4; cx++) view.push([cx, cy]);
  for (const [cx, cy] of view) { E.uploadChunk(cx, cy, g); E.keepChunk(cx, cy); }
  r.held12 = view.filter(([cx, cy]) => E.hasChunk(cx, cy)).length;
  // the thirteenth (the road ahead): none of the twelve in view given up for it
  E.frameNo++; for (const [cx, cy] of view) E.keepChunk(cx, cy);
  E.uploadChunk(9, 9, g);
  r.after = view.filter(([cx, cy]) => E.hasChunk(cx, cy)).length; r.ahead = E.hasChunk(9, 9);
  // reserved: the city's and the tunnel's added up, never past CHUNK_HARD
  E.reserveChunks(14, 'city'); E.reserveChunks(6); r.reserved = E.chunkCap(); E.reserveChunks(99, 'city'); r.hard = E.chunkCap(); r.HARD = CHUNK_HARD;
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

test('the chunks in view are never given up for another: past the slots, one is added (up to CHUNK_HARD); the view reserves its own', { skip: !findChrome() && 'no headless Chromium (set CLA_CHROME)' }, async () => {
  const srv = await serve();
  let dom;
  try {
    dom = await new Promise((ok, no) => execFile(findChrome(), ['--headless', '--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist',
      '--virtual-time-budget=30000', '--dump-dom', `http://127.0.0.1:${srv.address().port}/__xfade.html`], { maxBuffer: 16 << 20, timeout: 120000 }, (e, so) => (e ? no(e) : ok(so))));
  } finally { srv.close(); }
  const m = /<pre id="out">(.*?)<\/pre>/s.exec(dom);
  assert.ok(m && m[1].startsWith('{'), `the page: ${m ? m[1].slice(0, 400) : dom.slice(0, 400)}`);
  const r = JSON.parse(m[1]);
  assert.equal(r.cap, 10, 'a low-memory engine: ten slots');
  assert.equal(r.held12, 12, 'twelve in view: all twelve held');
  assert.equal(r.after, 12, 'the one ahead took none of those in view');
  assert.ok(r.ahead, 'and it has its slot');
  assert.equal(r.reserved, 20, 'the city\'s and the tunnel\'s reserves added up');
  assert.equal(r.hard, r.HARD, 'never past CHUNK_HARD');
});
