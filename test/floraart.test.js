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
  // (every shape the world draws: statics.js seeds a species' shapes 1000 + v * 37 + its name's length * 7)
  for (const sp of FLORA_SPECIES) for (const k of [1, 1.4]) for (let v = 0; v < 8; v++) {
    const G = makeStatic({ t: 'f', sp, s: 1000 + v * 37 + sp.length * 7, k });
    assert.ok(G && G.w > 1 && G.h > 1, `${sp}: a picture`);
    if (sp !== 'sorrel') assert.equal(G.ap2, 2, `${sp}: at the art pixel`);   // (the redwood floor's sorrel: a flat carpet in world px, redwoods.js)
    const b = box(G);
    assert.ok(b.n >= 12, `${sp}: it draws (${b.n} px)`);
    if (OWN.has(sp)) continue;
    const e = floraExt(sp, k), L = G.ax - b.x0 * 2, R = (b.x1 + 1) * 2 - G.ax, U = G.ay - b.y0 * 2, D = (b.y1 + 1) * 2 - G.ay;
    assert.ok(L <= e[0] && R <= e[2] && U <= e[1] && D <= e[3], `${sp} k${k}: inside its room (L${L | 0}/${e[0]} R${R | 0}/${e[2]} U${U | 0}/${e[1]} D${D | 0}/${e[3]})`);
  }
});

test('a species keeps its size on the whole, and its shapes differ in build: taller and shorter, wider and narrower', () => {
  const mk = { oak: FL.bigOak, fir: FL.douglasFir, birch: FL.birchClump, pondPine: FL.ponderosaPine, coconut: FL.coconutPalm, saguaroBig: (s) => FL.saguaro(s, 128), street: FL.streetTree, joshua: FL.joshuaTree };
  for (const [sp, fn] of Object.entries(mk)) {
    const k = 1.4, hs = [], ws = [];
    let wh = 0, ww = 0;
    for (let v = 0; v < 8; v++) {
      const s = 1000 + v * 37 + sp.length * 7, a = box(makeStatic({ t: 'f', sp, s, k })), w = box(FL.floraScale(k, () => fn(s)));
      hs.push((a.y1 - a.y0 + 1) * 2); ws.push((a.x1 - a.x0 + 1) * 2); wh += (w.y1 - w.y0 + 1) / 8; ww += (w.x1 - w.x0 + 1) / 8;
    }
    const mean = (a) => a.reduce((p, q) => p + q, 0) / a.length;
    assert.ok(Math.abs(mean(hs) - wh) <= wh * 0.14, `${sp}: as tall on the whole (${mean(hs) | 0} against ${wh | 0} world px)`);
    assert.ok(Math.abs(mean(ws) - ww) <= ww * 0.3, `${sp}: about as wide on the whole (${mean(ws) | 0} against ${ww | 0} world px)`);
    assert.ok(Math.max(...hs) >= Math.min(...hs) * 1.1, `${sp}: its shapes differ in height (${Math.min(...hs)} to ${Math.max(...hs)})`);
  }
  // a palm leans either way, a saguaro has none to three arms (its picture's width tells)
  const side = (sp) => { const out = new Set(); for (let v = 0; v < 8; v++) { const G = makeStatic({ t: 'f', sp, s: 1000 + v * 37 + sp.length * 7, k: 1.25 }); let sx = 0, n = 0; for (let x = 0; x < G.w; x++) if (G.col[(2 * G.w + x) * 4 + 3] || G.col[(6 * G.w + x) * 4 + 3]) { sx += x; n++; } out.add(n && sx / n * 2 < G.ax ? 'L' : 'R'); } return out; };
  assert.equal(side('leaning').size, 2, 'the leaning palms lean both ways');
});

test('a stand has its colour: flowers and berries in the palette\'s other colours; the saguaros differ in their arms', () => {
  const hue = (G, pick) => { let n = 0; for (let i = 0; i < G.w * G.h; i++) if (G.col[i * 4 + 3] && pick(G.col[i * 4], G.col[i * 4 + 1], G.col[i * 4 + 2])) n++; return n; };
  const red = (r, g, b) => r > 160 && g < 50 && b < 60, orange = (r, g, b) => r > 190 && g > 55 && g < 150 && b < 50;
  const p0 = makeStatic({ t: 'f', sp: 'poppies', s: 1049, k: 1 }), p1 = makeStatic({ t: 'f', sp: 'poppies', s: 1049, k: 1, c: 1 });
  assert.ok(hue(p0, red) > 8 && hue(p1, red) < hue(p0, red) / 3 && hue(p1, orange) > 8, 'poppies: red, and orange in another stand');
  assert.equal(p0.w, p1.w, 'the same plant, another colour');
  assert.ok(FL.FLORA_TINTS.poppies >= 3 && FL.FLORA_TINTS.lupines >= 3 && FL.FLORA_TINTS.berry >= 2);
  for (const sp of Object.keys(FL.FLORA_TINTS)) assert.ok(FLORA_SPECIES.includes(sp), `${sp}: a species the world plants`);
  const widths = new Set(); for (let v = 0; v < 6; v++) widths.add(makeStatic({ t: 'f', sp: 'saguaroBig', s: 1000 + v * 37 + 70, k: 1 }).w);
  assert.ok(widths.size >= 3, `the saguaros: a spear, one arm, several (${[...widths]})`);
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
