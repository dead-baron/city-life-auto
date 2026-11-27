// The mountains' crags (the owner, 11-25, of a Granite Peaks cliff: "this doesnt look good when we create these
// mountainous areas with a group of 4 similar shaped rocks stacked in a row"; his pick of three looks, 07:19: "B for
// the mountain/cliffs is best, also were not doing snow yet so let's not do any snow for now"). B: each granite cliff
// piece a sheer wall half as tall again, its top the grey of the rock behind it; that rock in big light slabs, rising
// in ledges along the land's contours (groundbake.js reliefOn, LEDGE). The desert's sandstone and the coasts' basalt
// keep their stepped pieces. No snow is drawn on the benches.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeStatic, cliffH, CRAG_TALL } from '../client/art2/game/statics.js';
import { GSHADE } from '../client/art2/ground.js';
import { LEDGE } from '../client/art2/game/groundbake.js';

const lum = (c, j = 0) => c[j] * 0.3 + c[j + 1] * 0.59 + c[j + 2] * 0.11;

test('a granite cliff is a sheer wall, taller than its band; sandstone and basalt as they were', () => {
  assert.equal(cliffH({ w: 256, h: 100, rl: 1 }), Math.round(100 * CRAG_TALL));
  assert.equal(cliffH({ w: 64, h: 100, rl: 1 }), 100, 'a short run keeps its height: it stood like a pillar');
  assert.ok(cliffH({ w: 128, h: 100, rl: 1 }) > 100 && cliffH({ w: 128, h: 100, rl: 1 }) < 150);
  assert.equal(cliffH({ w: 256, h: 100, st: 'sandstone', rl: 1 }), 100);
  assert.equal(cliffH({ w: 256, h: 100, st: 'basalt', rl: 1 }), 100);
  assert.equal(cliffH({ w: 256, h: 100 }), 100, 'a face placed by hand (ground to walk north of it) keeps its height: the rock drawn is the rock that is solid');
  const g = makeStatic({ t: 'cliff', w: 256, d: 96, h: 100, s: 3, rl: 1 }), s = makeStatic({ t: 'cliff', w: 256, d: 96, h: 100, s: 3, st: 'sandstone' });
  assert.ok(g.h >= s.h + 40, `the granite piece's picture is taller (${g.h} px, the sandstone ${s.h})`);
  // sheer: down the piece's middle column the flat tops it passes (runs of 8 rows or more at one height) - a stair
  // has three, a wall one
  const tops = (G) => { const x = G.w >> 1, run = new Map(); for (let y = 0; y < G.h; y++) { const i = y * G.w + x; if (G.col[i * 4 + 3] && G.z[i] > 8) { const k = Math.round(G.z[i] / 3); run.set(k, (run.get(k) || 0) + 1); } } return [...run.values()].filter((n) => n >= 8).length; };
  assert.equal(tops(g), 1, `one wall, not a stair (${tops(g)} flat tops down its middle; the sandstone ${tops(s)})`);
  assert.ok(tops(s) >= 2, `the sandstone keeps its steps (${tops(s)})`);
});

test('the rock behind a crag: big light slabs, the same grey as the wall\'s top', () => {
  let n = 0, sum = 0, crack = 0;
  for (let y = 0; y < 240; y += 2) for (let x = 0; x < 240; x += 2) { const c = GSHADE.crag(4000 + x, 7000 + y, 1337), l = lum(c); n++; sum += l; if (l < 75) crack++; }
  assert.ok(sum / n > 100, `light granite, not dark cobbles (mean ${Math.round(sum / n)} of 255)`);
  assert.ok(crack / n < 0.12, `fine cracks between big slabs (${(crack / n * 100).toFixed(1)}% of it)`);
  const g = makeStatic({ t: 'cliff', w: 256, d: 96, h: 100, s: 3, rl: 1 });
  let tn = 0, ts = 0; for (let y = 0; y < 30; y++) for (let x = 60; x < g.w - 60; x++) { const j = (y * g.w + x) * 4; if (g.col[j + 3] && Math.abs(g.col[j] - g.col[j + 2]) < 24) { tn++; ts += lum(g.col, j); } }
  assert.ok(tn > 200 && Math.abs(ts / tn - sum / n) < 40, `the wall's top (${Math.round(ts / tn)}) and the rock behind it (${Math.round(sum / n)}) are one grey`);
});

test('ledges every few metres of height; no snow painted on them, no trial switch left', () => {
  assert.ok(LEDGE.step >= 3 && LEDGE.step <= 8 && LEDGE.slope > 0.05 && LEDGE.slope < 0.4);
  assert.ok(LEDGE.shade >= 0.6 && LEDGE.shade <= 0.75 && !/Math\.max\(0\.55, Math\.min\(1\.3/.test(readFileSync(new URL('../client/art2/game/groundbake.js', import.meta.url), 'utf8')), 'the hill\'s darkest shade keeps the ground over the dark floor');
  assert.ok(LEDGE.dark >= 0.42 && LEDGE.dark <= 0.6 && /k = Math\.max\(LEDGE\.dark, k \*/.test(readFileSync(new URL('../client/art2/game/groundbake.js', import.meta.url), 'utf8')), 'a ledge\'s face in the hill\'s shade keeps the floor');
  for (const f of ['client/art2/game/groundbake.js', 'client/art2/game/statics.js', 'client/art2/ground.js']) {
    const src = readFileSync(new URL('../' + f, import.meta.url), 'utf8');
    assert.ok(!/__CRAG/.test(src), `${f}: the trial switch is gone`);
  }
  assert.ok(!/snow lying on the bench/.test(readFileSync(new URL('../client/art2/game/groundbake.js', import.meta.url), 'utf8')), 'no snow on the benches');
});

// Talus and the open slopes (11-25): what has come down off a crag lies at its foot - the ground south of solid rock
// is pale broken stone for a way, with fallen stones on it (groundbake.js talus, TALUS) - and the mountains' open
// ground shows the rock's ledges too where it is steep, fainter (LEDGE.rib, LEDGE.soft).
test('talus at a wall\'s foot and fainter ledges on steep open ground: the numbers', async () => {
  const { TALUS } = await import('../client/art2/game/groundbake.js');
  assert.ok(TALUS.reach >= 30 && TALUS.reach + TALUS.vary <= 140, 'an apron a tile or two deep, never a field');
  assert.ok(TALUS.rocks > 0.3 && TALUS.rocks <= 0.9);
  assert.ok(LEDGE.rib > LEDGE.slope && LEDGE.soft > 0.2 && LEDGE.soft < 0.7, 'open ground: only where steep, and fainter than rock');
  const src = readFileSync(new URL('../client/art2/game/groundbake.js', import.meta.url), 'utf8');
  assert.ok(/\['edges', edges\], \['talus', talus\], \['decor', decor\]/.test(src), 'the talus is laid before the decor strews its stones');
});

// The summits' open rock (11-25, "Build the summit from plans"): the ground above the old snow line, and a summit's
// knob, is natural granite you walk on - broad low slabs with grit in the joints (ground.js granite) - not the
// quarry's cut slabs it was, and not the crag's rock, which is the rock that stops you: it is darker and lies flat.
test('the walked granite: its own ground, darker and flatter than a crag, no cut slabs above the snow line, ledges and talus know it', async () => {
  const { GS } = await import('../client/art2/ground.js');
  const lum = (c) => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
  let g = 0, c = 0, gh = 0, ch = 0, n = 0, dark = 0;
  for (let y = 0; y < 240; y += 3) for (let x = 0; x < 240; x += 3) {
    const a = lum(GSHADE.granite(x, y, 5)); gh = Math.max(gh, GS.h || 0); GS.h = 0;
    const b = lum(GSHADE.crag(x, y, 5)); ch = Math.max(ch, GS.h || 0); GS.h = 0;
    g += a; c += b; n++; if (a < 46) dark++;
  }
  assert.ok(g / n < c / n - 8, `the walked granite is darker than the crag (${(g / n).toFixed(0)} against ${(c / n).toFixed(0)})`);
  assert.ok(gh <= 2 && ch >= 8, `it lies flat, the crag stands up (${gh} px against ${ch})`);
  assert.equal(dark, 0, 'nothing in it under the dark floor');
  const src = readFileSync(new URL('../client/art2/game/groundbake.js', import.meta.url), 'utf8');
  assert.ok(/bio === 9\) m = [^;]*M_\.GRANITE : M_\.SCREE/.test(src) && !/bio === 9\) m = [^;]*QUARRY/.test(src), 'above the old snow line: granite and scree, no quarry slabs');
  assert.ok(/mt === M_\.CRAG \|\| mt === M_\.SCREE \|\| mt === M_\.GRANITE/.test(src), 'the ledges are drawn on it');
  assert.ok(/m !== M_\.SCREE && m !== M_\.GRANITE/.test(src), 'a crag\'s talus lies on it');
  const { SUMMIT_R } = await import('../client/art2/game/groundbake.js');
  const { PEAKS3 } = await import('../shared/world3-peaks.js');
  const K = PEAKS3.knob;
  assert.ok(SUMMIT_R >= Math.max(...K.shelf) + Math.max(...K.crown) && SUMMIT_R <= Math.max(...K.shelf) + Math.max(...K.crown) + K.apron + 2, `the granite round a summit covers its knob (${SUMMIT_R} tiles)`);
  assert.ok(!/snowfield|M_\.SNOW\b/.test(src.replace(/mat\('SNOW'[^\n]*\n/, '')), 'no ground is painted as snow');
});
