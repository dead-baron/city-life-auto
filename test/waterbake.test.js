// The water as the chunk baker paints it (client/art2/water.js waterTiles / waterPx, the water upgrade of 2026-10-18): each water
// pixel's word for the light pass (lightgame.js waterSurf) is one it knows - the sea's (191 + px from the shore, 239 +
// how clear, 255 open), running water's (128 + way * 4 + fast * 2 + clear, F_NOCAST) and still water's (192 + px from
// the shore, 216 / 224 + how clear, F_NOCAST); a river runs the way the map says it does; the shallows are
// see-through (the bed shows near the shore, the water darkens out from it); no baked water glows on its own (the
// sea's sparkle is the light's, task #392); boulders stand in the creeks, solid ground with a height.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateCity } from '../shared/map.js';
import { T, TILE } from '../shared/constants.js';
import { bakeGround, bakeSwatches, CHUNK, LILY_Z } from '../client/art2/game/groundbake.js';
import { F_GROUND, F_WATER, F_WET, F_NOCAST } from '../client/art2/gbuf.js';

const M = generateCity(1337);
const CT = CHUNK / TILE;
const lum = (G, i) => G.col[i * 4] * 0.3 + G.col[i * 4 + 1] * 0.59 + G.col[i * 4 + 2] * 0.11;
// the chunk round the first tile that passes, scanning the map
function chunkWhere(ok, step = 3) {
  for (let ty = M.y0 + 30; ty < M.y0 + M.h - 30; ty += step) for (let tx = M.x0 + 30; tx < M.x0 + M.w - 30; tx += step) if (ok(tx, ty, M.idx(tx, ty))) return [Math.floor(tx / CT), Math.floor(ty / CT), tx, ty];
  return null;
}
const wet = (i) => M.tiles[i] === T.WATER || M.tiles[i] === T.DEEP;
function words(G) {
  const out = { sea: 0, seaBand: 0, seaClear: 0, run: 0, still: 0, bad: [], glow: 0, dirs: new Map() };
  for (let i = 0; i < G.w * G.h; i++) {
    const f = G.flag[i];
    if (!(f & F_WATER) || !(f & F_GROUND) || (f & F_WET)) continue;
    const c = G.col[i * 4 + 3];
    if (G.emi[i * 4 + 3]) out.glow++;
    if (f & F_NOCAST) {
      if (c >= 128 && c < 192) { out.run++; out.dirs.set(i, (c - 128) >> 2); } else if (c >= 192 && c < 232) out.still++; else out.bad.push(c);
    } else if (c >= 191 && c <= 238) { out.sea++; out.seaBand++; } else if (c >= 239 && c <= 255) { out.sea++; if (c < 255) out.seaClear++; } else out.bad.push(c);
  }
  return out;
}

test('a river runs the way the map says, in the light pass\'s word for it; a lake lies still; no water glows of itself', () => {
  const R = chunkWhere((tx, ty, i) => wet(i) && M.flow && M.flow.has(i) && [-3, 3].every((d) => M.flow.has(M.idx(tx + d, ty)) && M.flow.has(M.idx(tx, ty + d))));
  assert.ok(R, 'a river with a current on the map');
  const G = bakeGround(M, R[0], R[1], { quality: 1, seed: 1337 }), w = words(G);
  assert.equal(w.bad.length, 0, `only words the light knows (${w.bad.slice(0, 5)})`);
  assert.ok(w.run > 2000, `running water (${w.run} px)`);
  assert.equal(w.glow, 0, 'no baked glow on the water');
  // each running pixel's way is its tile's (sixteenths of a turn; within one at a bend)
  let ok = 0, off = 0;
  for (const [i, dir] of w.dirs) {
    const tx = Math.floor((R[0] * CHUNK + (i % CHUNK)) / TILE), ty = Math.floor((R[1] * CHUNK + Math.floor(i / CHUNK)) / TILE), f = M.flow.get(M.idx(tx, ty));
    if (f === undefined) continue;
    const dd = Math.min((dir - f + 16) & 15, (f - dir + 16) & 15);
    if (dd <= 1) ok++; else off++;
  }
  assert.ok(ok > 1000 && off < ok * 0.05, `downstream as the map has it (${ok} with it, ${off} not)`);
  const L = chunkWhere((tx, ty, i) => wet(i) && M.lake[i] && [-6, 6].every((d) => M.lake[M.idx(tx + d, ty)] && M.lake[M.idx(tx, ty + d)]));
  assert.ok(L, 'a lake on the map');
  const GL = bakeGround(M, L[0], L[1], { quality: 1, seed: 1337 }), wl = words(GL);
  assert.equal(wl.bad.length, 0);
  assert.ok(wl.still > 2000, `still water on the lake (${wl.still} px)`);
  assert.equal(wl.glow, 0);
});

test('the sea is see-through over the sand by a beach: the bed shows near the shore, it darkens out into the blue', () => {
  const B = chunkWhere((tx, ty, i) => M.tiles[i] === T.SAND && wet(M.idx(tx, ty + 4)) && wet(M.idx(tx, ty + 20)) && !M.river[M.idx(tx, ty + 10)] && !M.lake[M.idx(tx, ty + 10)] && M.tiles[M.idx(tx, ty - 8)] !== T.WATER, 4);
  assert.ok(B, 'a beach on the map');
  const G = bakeGround(M, B[0], B[1], { quality: 1, seed: 1337 }), w = words(G);
  assert.equal(w.bad.length, 0);
  assert.equal(w.glow, 0);
  assert.ok(w.seaBand > 1000, `the waves' band by the shore (${w.seaBand})`);
  // along the column of the beach tile: the water just off the sand against the water far out
  const near = [], far = [];
  const gx = (B[2] * TILE) - B[0] * CHUNK + 16;
  for (let y = 0; y < CHUNK; y++) for (let x = Math.max(0, gx - 160); x < Math.min(CHUNK, gx + 160); x++) {
    const i = y * CHUNK + x, f = G.flag[i];
    if (!(f & F_WATER) || (f & F_NOCAST)) continue;
    const c = G.col[i * 4 + 3];
    if (c >= 205 && c <= 230) near.push(lum(G, i)); else if (c === 255 || (c >= 239 && c < 242)) far.push(lum(G, i));
  }
  const mean = (a) => a.reduce((s, v) => s + v, 0) / (a.length || 1), sdv = (a) => { const m = mean(a); return Math.sqrt(mean(a.map((v) => (v - m) * (v - m)))); };
  assert.ok(near.length > 500, `water just off the sand (${near.length} px)`);
  if (far.length > 200) assert.ok(mean(near) > mean(far) + 12, `lighter over the sand (${mean(near).toFixed(0)}) than out deep (${mean(far).toFixed(0)})`);
  assert.ok(sdv(near) > 9, `the bed's texture shows through the shallows (spread ${sdv(near).toFixed(1)})`);
});

test('boulders stand in the creeks: solid ground with a height in the water, foam round them', () => {
  // the creeks: running water at least 3 tiles from either bank, its current fast enough for rocks
  let found = 0, chunks = 0;
  const seen = new Set();
  for (let ty = M.y0 + 30; ty < M.y0 + M.h - 30 && chunks < 6 && !found; ty += 5) for (let tx = M.x0 + 30; tx < M.x0 + M.w - 30 && chunks < 6 && !found; tx += 5) {
    const i = M.idx(tx, ty);
    if (!wet(i) || !M.flow || !M.flow.has(i)) continue;
    const cx = Math.floor(tx / CT), cy = Math.floor(ty / CT), k = cy * 1000 + cx;
    if (seen.has(k)) continue;
    seen.add(k); chunks++;
    const G = bakeGround(M, cx, cy, { quality: 1, seed: 1337 });
    for (let p = 0; p < G.w * G.h; p++) {
      const X = cx * CHUNK + (p % CHUNK), Y = cy * CHUNK + Math.floor(p / CHUNK), g = M.idx(Math.floor(X / TILE), Math.floor(Y / TILE));
      if (!wet(g) || !M.flow.has(g)) continue;
      if (!(G.flag[p] & F_WATER) && G.z[p] > 0 && !(G.flag[p] & 32)) found++;   // (rock: not water, not a plant)
    }
  }
  assert.ok(chunks > 0, 'creeks on the map');
  assert.ok(found > 30, `a boulder in the creeks (${found} px of rock in the running water of ${chunks} chunks)`);
});

test('the E1 swatch sheet still paints its water (no window: each water by its material)', () => {
  const G = bakeSwatches();
  let water = 0;
  for (let i = 0; i < G.w * G.h; i++) if (G.flag[i] & F_WATER) water++;
  assert.ok(water > 1000);
});

test('lily pads float a sliver over the water, so the fish drawn on the water pass under them (and cast no shadow of it)', () => {
  // the ponds' and lakes' chunks: their leaf cover over the water at a pad's height
  const LEAF = 32;
  let found = 0, cast = 0;
  const seen = new Set();
  for (let ty = M.y0 + 30; ty < M.y0 + M.h - 30 && found < 200; ty += 6) for (let tx = M.x0 + 30; tx < M.x0 + M.w - 30 && found < 200; tx += 6) {
    const i = M.idx(tx, ty);
    if (!wet(i) || !M.lake[i]) continue;
    const cx = Math.floor(tx / CT), cy = Math.floor(ty / CT), k = cy * 1000 + cx;
    if (seen.has(k) || seen.size > 12) continue;
    seen.add(k);
    const G = bakeGround(M, cx, cy, { quality: 1, seed: 1337 });
    for (let p = 0; p < G.w * G.h; p++) {
      const f = G.flag[p];
      if (!(f & LEAF) || (f & F_WATER)) continue;
      const X = cx * CHUNK + (p % CHUNK), Y = cy * CHUNK + Math.floor(p / CHUNK), g = M.idx(Math.floor(X / TILE), Math.floor(Y / TILE));
      if (!wet(g) || !M.lake[g] || G.z[p] !== LILY_Z) continue;   // (at a pad's height: the pads, and a reed's stems passing it)
      if (f & F_NOCAST) found++; else cast++;
    }
  }
  assert.ok(found > 1000, `lily pads floating over the ponds' water (${found} px)`);
  assert.ok(cast < found * 0.2, `casting no shadow from that height (${cast} px that do: reeds)`);
});
