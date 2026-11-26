// Wild rock under the owner's rock rule (DECISIONS 2026-11-25 18:14, of rock drawn by code: "very unnatural ... vary
// the stacks more naturally like natural formations and vary the sizes we have them at so they're not all so uniform
// and perfectly flat and round"): no lathe-turned shape, no perfect disc, sizes mixed. Counted that day: the world
// holds 6,322 boulders and 1,481 outcrops; a boulder was one dome with a smaller one always at its right shoulder
// (4 pictures a size), an outcrop one blob stepped in three rings each inside the last. No world is built here.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeStatic, ROCK_SEEDS } from '../client/art2/game/statics.js';
import { BOULDER, OUTCROP } from '../client/art2/terrain.js';

const TR = readFileSync(new URL('../client/art2/terrain.js', import.meta.url), 'utf8');
const ST = readFileSync(new URL('../client/art2/game/statics.js', import.meta.url), 'utf8');
// a picture's outline: per column the first and last opaque row, its box, its tallest column
function shape(G) {
  let x0 = G.w, x1 = -1, y0 = G.h, y1 = -1, n = 0; const top = new Array(G.w).fill(-1);
  for (let y = 0; y < G.h; y++) for (let x = 0; x < G.w; x++) if (G.col[(y * G.w + x) * 4 + 3]) { n++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; if (top[x] < 0) top[x] = y; }
  let px = x0; for (let x = x0; x <= x1; x++) if (top[x] >= 0 && top[x] < top[px]) px = x;
  const w = x1 - x0 + 1, h = y1 - y0 + 1;
  // (how lopsided: the share of columns whose top differs from its mirror's by 2 px or more)
  let odd = 0; for (let k = 0; k < w; k++) if (Math.abs(top[x0 + k] - top[x1 - k]) >= 2) odd++;
  return { w, h, n, peak: (px - x0) / Math.max(1, w - 1), odd: odd / w, sig: `${w}x${h}:${n}:${top.slice(x0, x1 + 1).join(',')}` };
}

test('boulders: eight pictures a size and stone, in several builds - broad and narrow, low and tall, lopsided', () => {
  assert.ok(ROCK_SEEDS >= 8 && BOULDER.kinds >= 5);
  for (const style of ['granite', 'sandstone', 'basalt']) {
    const S = []; for (let s = 0; s < ROCK_SEEDS; s++) S.push(shape(makeStatic({ t: 'rock', style, size: 26, s, moss: 0, barn: 0 })));
    assert.equal(new Set(S.map((q) => q.sig)).size, ROCK_SEEDS, `${style}: every seed its own rock`);
    const asp = S.map((q) => q.w / q.h);
    assert.ok(Math.max(...asp) >= Math.min(...asp) * 1.2, `${style}: squat and upright at one size (${Math.min(...asp).toFixed(2)} to ${Math.max(...asp).toFixed(2)})`);
    assert.ok(S.filter((q) => q.odd > 0.3).length >= ROCK_SEEDS / 2, `${style}: most are lopsided - no disc (${S.map((q) => q.odd.toFixed(2))})`);
    assert.ok(S.some((q) => q.peak < 0.45) && S.some((q) => q.peak > 0.55), `${style}: the top to the left on some, to the right on others (${S.map((q) => q.peak.toFixed(2))})`);
  }
  assert.doesNotMatch(TR, /T\.dome\(w \/ 2 \+ size \* 0\.38, d \/ 2 \+ size \* 0\.12/, 'the one shoulder always at the right is gone');
});

test('outcrops: masses set off the middle on a low apron - never one blob stepped in three rings', () => {
  assert.ok(OUTCROP.kinds >= 5 && OUTCROP.tall <= 2.2, 'several builds; no mass taller than about twice its width (a chimney)');
  for (const style of ['granite', 'sandstone', 'basalt']) {
    const S = []; for (let s = 0; s < ROCK_SEEDS; s++) S.push(shape(makeStatic({ t: 'outcrop', style, w: 96, d: 56, h: 60, s, j: 0 })));
    assert.equal(new Set(S.map((q) => q.sig)).size, ROCK_SEEDS, `${style}: every seed its own outcrop`);
    assert.ok(S.some((q) => q.peak < 0.4) && S.some((q) => q.peak > 0.6), `${style}: its high point off the middle, either side (${S.map((q) => q.peak.toFixed(2))})`);
    assert.ok(S.filter((q) => q.odd > 0.4).length >= ROCK_SEEDS * 0.75, `${style}: lopsided (${S.map((q) => q.odd.toFixed(2))})`);
    // (sizes: the world gives each outcrop its own width, depth and height - counted in test/world3wayside.test.js)
  }
  // (the old cake: three tiers at fixed insets of one blob)
  assert.doesNotMatch(TR, /tiers: o\.tiers \|\| \[\[0, h \* 0\.55\], \[Math\.min\(w, d\) \* 0\.18, h \* 0\.8\], \[Math\.min\(w, d\) \* 0\.32, h\]\]/);
  assert.match(TR, /hh = Math\.min\(hh0, Math\.max\(mx, my\) \* OUTCROP\.tall\)/, "a mass's height is held to its width");
});

test("the desert's stone wears dry tufts and no moss; the same turf is not on every ledge", () => {
  assert.match(ST, /const DRY_ROCK = new Set\(\['sandstone', 'redrock'\]\);/);
  assert.match(ST, /DRY_ROCK\.has\(r\.style \|\| 'granite'\) \? \{ veg: \{ kind: 'dry', density: 0\.025, band: 1 \} \} : \{ veg: \{ kind: 'grass', density: 0\.035, band: 1 \}, moss: 0\.1 \}/);
  // (green on a red outcrop: none of moss's or grass's - a pixel much greener than it is red)
  const G = makeStatic({ t: 'outcrop', style: 'sandstone', w: 120, d: 60, h: 80, s: 2, j: 0 }); let green = 0, n = 0;
  for (let i = 0; i < G.w * G.h; i++) if (G.col[i * 4 + 3]) { n++; if (G.col[i * 4 + 1] > G.col[i * 4] * 1.15 && G.col[i * 4 + 1] > 70) green++; }
  assert.ok(green / n < 0.01, `a sandstone outcrop's green pixels: ${(green / n * 100).toFixed(1)}%`);
});

test("a riffle's white water is broken by the water it is made of - no flat white blobs", async () => {
  const { RAPID_BREAK } = await import('../client/art2/water.js');
  assert.ok(RAPID_BREAK >= 0.3 && RAPID_BREAK <= 0.5, `the share of a churn shown as paled water (${RAPID_BREAK})`);
  assert.match(readFileSync(new URL('../client/art2/water.js', import.meta.url), 'utf8'), /c = hh\(x >> 2, y >> 1, seed \+ 245\) < RAPID_BREAK \? mixTo\(MIX, c, fm, 0\.4\) : fm;/);
});

test("the redwoods' hollow trunk and root cave (NS1-A): a dark way in, a ragged rim; every root cave its own shape", async () => {
  const dark = (G, y0 = 0) => { let n = 0; for (let y = y0; y < G.h; y++) for (let x = 0; x < G.w; x++) { const i = (y * G.w + x) * 4; if (G.col[i + 3] && G.col[i] < 30 && G.col[i + 1] < 26 && G.col[i + 2] < 30) n++; } return n; };
  const { ROOTCAVE } = await import('../client/art2/redwoods.js');
  const S = []; for (let s = 0; s < ROOTCAVE.kinds; s++) { const G = makeStatic({ t: 'rw', k: 'rootcave', s }); S.push({ ...shape(G), dark: dark(G) }); }
  assert.equal(new Set(S.map((q) => q.sig)).size, ROOTCAVE.kinds, 'every root cave its own picture');
  for (const q of S) assert.ok(q.dark > 250 && q.dark < q.n * 0.2 && q.w >= 90, `a way in a person could duck into, in a mass of roots (${q.dark} dark of ${q.n} px, ${q.w} wide)`);
  assert.ok(S.filter((q) => q.odd > 0.4).length >= ROOTCAVE.kinds - 1, `lopsided mounds - no disc (${S.map((q) => q.odd.toFixed(2))})`);
  const plain = makeStatic({ t: 'f', sp: 'giantL', s: 1055, k: 1 }), hollow = makeStatic({ t: 'f', sp: 'giantLF', s: 1055, k: 1 });
  assert.equal(plain.w, hollow.w, 'the same tree');
  const foot = Math.floor(plain.h * 0.8);
  assert.ok(dark(hollow, foot) > dark(plain, foot) + 300, `a hollow burnt into its foot (${dark(hollow, foot)} dark px to ${dark(plain, foot)})`);
  assert.match(ST, /const art = p\.hollow && SPECIES\[art0 \+ 'F'\] \? art0 \+ 'F' : art0;/);
});

