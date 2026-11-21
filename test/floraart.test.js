// The plants are made at the art pixel (docs/art-v2/SPEC.md "Scale": 1 art pixel = 2 world px). The owner's nature kit
// pass (2026-11-21): a plant painted in world px and halved by the bake kept one texel of four - leaf clumps came out as
// speckle. Every species the world plants (statics.js SPECIES) now comes from flora.js floraArt: its maker run at half
// size and marked ap2, which the chunk bake lays down two world px to the pixel.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeStatic, FLORA_SPECIES, floraExt } from '../client/art2/game/statics.js';
import * as FL from '../client/art2/flora.js';

const box = (G) => { let x0 = 1e9, x1 = -1, y0 = 1e9, y1 = -1, n = 0; for (let y = 0; y < G.h; y++) for (let x = 0; x < G.w; x++) if (G.col[(y * G.w + x) * 4 + 3]) { n++; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); } return { x0, x1, y0, y1, n }; };
// (the old-growth redwoods and their floor are their own pictures, with their own room: statics.js natureItems)
const OWN = new Set(['redwood', 'redwood2', 'giantL', 'giant', 'giantS', 'gate', 'sorrel', 'fernR']);

test('every species the world plants is made at the art pixel, and its picture fits the room its item claims', () => {
  assert.ok(FLORA_SPECIES.length > 100, 'the species');
  for (const sp of FLORA_SPECIES) for (const [k, s] of [[1, 3], [1.4, 7]]) {
    const G = makeStatic({ t: 'f', sp, s, k });
    assert.ok(G && G.w > 1 && G.h > 1, `${sp}: a picture`);
    if (sp !== 'sorrel') assert.equal(G.ap2, 2, `${sp}: at the art pixel`);   // (the redwood floor's sorrel: a flat carpet in world px, redwoods.js)
    const b = box(G);
    assert.ok(b.n >= 12, `${sp}: it draws (${b.n} px)`);
    if (OWN.has(sp)) continue;
    const e = floraExt(sp, k), L = G.ax - b.x0 * 2, R = (b.x1 + 1) * 2 - G.ax, U = G.ay - b.y0 * 2, D = (b.y1 + 1) * 2 - G.ay;
    assert.ok(L <= e[0] && R <= e[2] && U <= e[1] && D <= e[3], `${sp} k${k}: inside its room (L${L | 0}/${e[0]} R${R | 0}/${e[2]} U${U | 0}/${e[1]} D${D | 0}/${e[3]})`);
  }
});

test('a tree keeps its size: about as tall and as wide at the art pixel as it was in world px', () => {
  const mk = { oak: FL.bigOak, fir: FL.douglasFir, birch: FL.birchClump, pondPine: FL.ponderosaPine, coconut: FL.coconutPalm, saguaroBig: (s) => FL.saguaro(s, 128), street: FL.streetTree, joshua: FL.joshuaTree };
  for (const [sp, fn] of Object.entries(mk)) {
    const k = 1.4, A = makeStatic({ t: 'f', sp, s: 5, k }), W = FL.floraScale(k, () => fn(5)), a = box(A), w = box(W);
    const ah = (a.y1 - a.y0 + 1) * 2, wh = w.y1 - w.y0 + 1, aw = (a.x1 - a.x0 + 1) * 2, ww = w.x1 - w.x0 + 1;
    assert.ok(Math.abs(ah - wh) <= wh * 0.14, `${sp}: as tall (${ah} against ${wh} world px)`);
    assert.ok(Math.abs(aw - ww) <= ww * 0.3, `${sp}: about as wide (${aw} against ${ww} world px)`);
  }
});

test('floraArt leaves the makers as it found them, and a recipe always makes the same picture', () => {
  const before = FL.roseBush(3), a = FL.floraArt(1, () => FL.roseBush(3)), after = FL.roseBush(3);
  assert.equal(a.ap2, 2);
  assert.ok(a.w < before.w && a.h < before.h, 'half the size in its own pixels');
  assert.equal(after.w, before.w); assert.equal(after.h, before.h); assert.deepEqual(after.col, before.col, 'the world-px picture as it was');
  for (const sp of ['oak', 'fir', 'tulips', 'fern', 'tallGrass', 'pear']) {
    const p = makeStatic({ t: 'f', sp, s: 11, k: 1.3 }), q = makeStatic({ t: 'f', sp, s: 11, k: 1.3 });
    assert.equal(p.w, q.w); assert.deepEqual(p.col, q.col, `${sp}: the same twice`); assert.deepEqual(p.z, q.z);
  }
  // an ap2 picture spread out for a sheet: twice the size, the same anchor, heights in world px
  const d = FL.artDouble(a);
  assert.equal(d.w, a.w * 2); assert.equal(d.h, a.h * 2); assert.equal(d.ax, a.ax); assert.ok(!d.ap2);
});

test('a plant at the art pixel is made of fewer, bigger pieces: a flower head keeps its pixels, a hedge its even face', () => {
  // (tulips: the red, orange and pink of the cups cover more of the picture than they did halved)
  const red = (G) => { let n = 0, all = 0; for (let i = 0; i < G.w * G.h; i++) { if (!G.col[i * 4 + 3]) continue; all++; const r = G.col[i * 4], g = G.col[i * 4 + 1], b = G.col[i * 4 + 2]; if (r > 170 && r - g > 50 && r - b > 60) n++; } return n / all; };
  const art = makeStatic({ t: 'f', sp: 'tulips', s: 7, k: 1 }), world = FL.tulipPlanter(7);
  assert.ok(red(art) > red(world) * 1.3, `the tulips' cups read (${red(art).toFixed(3)} against ${red(world).toFixed(3)})`);
});
