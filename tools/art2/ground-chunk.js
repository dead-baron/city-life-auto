// Page logic for ground-chunk.html: build the live map, bake ground chunks with groundbake.js, light them.
//   ?cx=&cy=&grid=g    a g x g block of neighbouring chunks (seams show if chunks disagree)
//   ?list=cx,cy;cx,cy  separate chunks side by side (?cols= per row, default 3), a gap between them
//   ?swatch=1          the world materials laid out like the E1 sheet (no map needed)
//   ?q= quality, ?p= preset, ?vig=0 no vignette, ?albedo=1 unlit, ?zoom=1|2 (default 2), ?seed= map seed
import { generateCity } from '../../shared/map.js';
import { bakeGround, bakeSwatches, CHUNK } from '../../client/art2/game/groundbake.js';
import { GBuf } from '../../client/art2/gbuf.js';
import { Lighter, PRESETS } from '../../client/art2/light.js';

// (the heavy work runs after the page's load event, so automation waiting for window.done never times out)
setTimeout(main, 30);
function main() {
const q = new URLSearchParams(location.search);
const quality = +(q.get('q') ?? 2), preset = q.get('p') || 'golden', seed = +(q.get('seed') ?? 1337), zoom = +(q.get('zoom') ?? 2);
const title = document.getElementById('t');
let places, cols, gap;
if (q.get('list')) {
  places = q.get('list').split(';').map((s) => s.split(',').map(Number));
  cols = Math.min(places.length, +(q.get('cols') ?? 3)); gap = 8;
  places = places.map(([cx, cy], k) => [cx, cy, k % cols, Math.floor(k / cols)]);
} else {
  const cx = +(q.get('cx') ?? 33), cy = +(q.get('cy') ?? 20), g = Math.max(1, Math.min(4, +(q.get('grid') ?? 1)));
  places = []; cols = g; gap = 0;
  for (let j = 0; j < g; j++) for (let i = 0; i < g; i++) places.push([cx + i, cy + j, i, j]);
}

const swatch = q.get('swatch') === '1';
if (swatch) places = [[0, 0, 0, 0]], cols = 1;
const t0 = performance.now();
const M = swatch ? null : generateCity(seed);
const t1 = performance.now();
const rows = Math.max(...places.map((p) => p[3])) + 1;
const W = cols * CHUNK + (cols - 1) * gap, H = rows * CHUNK + (rows - 1) * gap, G = new GBuf(W, H), times = [];
for (const [cx, cy, i, j] of places) {
  const s = performance.now();
  const C = swatch ? bakeSwatches(undefined, { quality, seed }) : bakeGround(M, cx, cy, { quality, seed });
  times.push(Math.round(performance.now() - s));
  const ox = i * (CHUNK + gap), oy = j * (CHUNK + gap);
  for (let y = 0; y < CHUNK; y++) {
    const src = y * CHUNK, dst = (oy + y) * W + ox;
    G.col.set(C.col.subarray(src * 4, (src + CHUNK) * 4), dst * 4); G.nrm.set(C.nrm.subarray(src * 4, (src + CHUNK) * 4), dst * 4);
    G.emi.set(C.emi.subarray(src * 4, (src + CHUNK) * 4), dst * 4); G.z.set(C.z.subarray(src, src + CHUNK), dst); G.flag.set(C.flag.subarray(src, src + CHUNK), dst);
  }
}
const cv = document.getElementById('c'), wrap = document.querySelector('.wrap');
cv.width = W * zoom; cv.height = H * zoom; wrap.style.width = W * zoom + 'px'; wrap.style.height = H * zoom + 'px';
if (q.get('albedo') === '1') {
  const g = cv.getContext('2d'); g.imageSmoothingEnabled = false;
  g.drawImage(G.toCanvas('col'), 0, 0, W * zoom, H * zoom);
} else {
  const L = new Lighter(cv);
  L.setScene(G);
  const P = { ...(PRESETS[preset] || PRESETS.golden) };
  if (q.get('vig') === '0') P.vign = 0;                   // (no vignette: for measuring colours against the targets)
  L.render(P, [], 1.0);
}
const info = `${places.map((p) => p[0] + ',' + p[1]).join(' ')} q${quality} ${preset} - map ${Math.round(t1 - t0)} ms, bake ${times.join('/')} ms`;
title.textContent = info;
window.info = info;
window.done = true;
}
