// River mouths (the owner, 10-22: "these water connections ... unnatural"): shared/world3-estuary.js opens each river
// out where it reaches the sea - widening over its last stretch, cut on through the beach into the sea, the beach's sand
// curving up its banks, never touching a road; the pages blend the two waters over a stretch, not at a seam
// (client/art2/water.js mouths).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { T, TILE } from '../shared/constants.js';
import { estuaries3, ESTUARY3 } from '../shared/world3-estuary.js';
import { generateCity } from '../shared/map.js';
import { bakeGround, CHUNK } from '../client/art2/game/groundbake.js';
import { F_GROUND, F_WATER, F_WET, F_NOCAST } from '../client/art2/gbuf.js';

// a stand-in coast: grass, a beach from y = 60, the sea from y = 68; a river 8 wide running south down x = 50 and
// stopping at y = 61 (on the beach, short of the sea); a road down x = 72 near its east bank
function coast() {
  const W = 110, H = 100, N = W * H;
  const m = { w: W, h: H, tiles: new Uint8Array(N).fill(T.GRASS), land: new Uint8Array(N).fill(1), river: new Uint8Array(N), lake: new Uint8Array(N), reserve: new Uint8Array(N), bld: new Int32Array(N).fill(-1), rails: [] };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (y >= 68) { m.tiles[i] = T.WATER; m.land[i] = 0; } else if (y >= 60) m.tiles[i] = T.SAND;
    if (x === 72 && y < 60) m.tiles[i] = T.ROAD;
    if (Math.abs(x + 0.5 - 50) < 4 && y < 61) { m.tiles[i] = T.WATER; m.land[i] = 0; m.river[i] = 1; }
  }
  return m;
}
const wet = (m, x, y) => m.tiles[y * m.w + x] === T.WATER;
const width = (m, y) => { let n = 0; for (let x = 0; x < m.w; x++) if (wet(m, x, y)) n++; return n; };

test('a river\'s mouth opens out: wider toward the sea, cut through the beach, sand up its banks, the road untouched', () => {
  const m = coast(), before = { up: width(m, 20), low: width(m, 56) };
  const out = estuaries3(m, null, null, [{ name: 'Test River', width: 8, pts: [[50, 0], [50, 30], [50, 61]] }]);
  assert.equal(out.mouths.length, 1, 'one mouth');
  assert.equal(width(m, 20), before.up, 'upstream as it was');
  assert.ok(width(m, 56) > before.low + 4, `wider near the sea (${before.low} -> ${width(m, 56)})`);
  for (let y = 61; y < 68; y++) assert.ok(wet(m, 50, y), `cut through the beach (row ${y})`);
  assert.ok(width(m, 66) >= width(m, 56) - 2, `as wide on through the beach to the sea (${width(m, 66)})`);
  // the beach curves up the banks: sand beside the widened stretch where grass was
  let sand = 0;
  for (let y = 40; y < 60; y++) for (let x = 30; x < 70; x++) if (m.tiles[y * m.w + x] === T.SAND) sand++;
  assert.ok(sand > 10, `sand up the banks (${sand} tiles)`);
  // never a road nor what's beside it
  for (let y = 0; y < 60; y++) { assert.equal(m.tiles[y * m.w + 72], T.ROAD); for (let x = 72 - ESTUARY3.clear; x < 72; x++) assert.ok(!wet(m, x, y), `kept clear of the road (${x}, ${y})`); }
  // the widened channel is the river's water, the cut past its end the sea's
  assert.equal(m.river[56 * m.w + 50], 1);
  assert.equal(m.river[66 * m.w + 50], 0);
  // a river that doesn't reach the sea: nothing
  const m2 = coast();
  const out2 = estuaries3(m2, null, null, [{ name: 'Inland', width: 8, pts: [[50, 0], [50, 30]] }]);
  assert.equal(out2.mouths.length, 0);
});

test('where a river meets the sea the two waters blend over a stretch, not at a seam', () => {
  const M = generateCity(1337), CT = CHUNK / TILE;
  const sea = (i) => (M.tiles[i] === T.WATER || M.tiles[i] === T.DEEP) && !M.land[i] && !M.river[i] && !M.lake[i];
  let at = null;
  for (let ty = M.y0 + 30; ty < M.y0 + M.h - 30 && !at; ty += 2) for (let tx = M.x0 + 30; tx < M.x0 + M.w - 30; tx += 2) {
    const i = M.idx(tx, ty);
    if (!M.river[i] || M.tiles[i] !== T.WATER) continue;
    if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => sea(M.idx(tx + dx, ty + dy)))) { at = [tx, ty]; break; }
  }
  assert.ok(at, 'a river\'s mouth on the map');
  const cx = Math.floor(at[0] / CT), cy = Math.floor(at[1] / CT), G = bakeGround(M, cx, cy, { quality: 1, seed: 1337 });
  // the river's tiles a few tiles in from the sea show the sea's water here and there, the sea's a few out the river's
  let rivSea = 0, rivAll = 0, seaRiv = 0, seaAll = 0;
  const dist = (tx, ty, f) => { let b = 99; for (let dy = -8; dy <= 8; dy++) for (let dx = -8; dx <= 8; dx++) { const j = M.idx(tx + dx, ty + dy); if (M.inside(tx + dx, ty + dy) && f(j)) b = Math.min(b, Math.hypot(dx, dy)); } return b; };
  for (let ty = cy * CT; ty < (cy + 1) * CT; ty++) for (let tx = cx * CT; tx < (cx + 1) * CT; tx++) {
    const i = M.idx(tx, ty), isRiv = M.river[i] && M.tiles[i] === T.WATER, isSea = sea(i);
    if (!isRiv && !isSea) continue;
    const d = isRiv ? dist(tx, ty, sea) : dist(tx, ty, (j) => M.river[j] && M.tiles[j] === T.WATER);
    if (d < 2 || d > 5) continue;
    for (let py = 4; py < TILE; py += 8) for (let px = 4; px < TILE; px += 8) {
      const k = (ty - cy * CT) * TILE + py, q = k * CHUNK + (tx - cx * CT) * TILE + px, f = G.flag[q];
      if (!(f & F_WATER) || !(f & F_GROUND) || (f & F_WET)) continue;
      const inland = !!(f & F_NOCAST);
      if (isRiv) { rivAll++; if (!inland) rivSea++; } else { seaAll++; if (inland) seaRiv++; }
    }
  }
  assert.ok(rivAll > 20 && seaAll > 20, `both waters there (${rivAll}, ${seaAll})`);
  assert.ok(rivSea > 0 && rivSea < rivAll, `the sea's water up the river's mouth (${rivSea} of ${rivAll})`);
  assert.ok(seaRiv > 0 && seaRiv < seaAll, `the river's out in the sea (${seaRiv} of ${seaAll})`);
});
