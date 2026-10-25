// The Neon Strip's art (the owner's notes part 2, 2026-10-25): his sign sheets as pixel neon (client/art2/neonpics.js),
// laid on the fronts with their dressing (neonsigns.js handNeon), readable rather than blown out; the strings of lights
// made fast to their posts and walls, the red paper lanterns (game/statics.js 'festoon').
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NP, NP_PAL, npPic } from '../client/art2/neonpics.js';
import { handNeon, paintSigns, picSize, picGlow } from '../client/art2/neonsigns.js';
import { makeBuilding, buildingH } from '../client/art2/buildings.js';
import { makeStatic } from '../client/art2/game/statics.js';

const rndOf = (s) => () => { s = (s * 16807) % 2147483647; return s / 2147483647; };

test('the picture signs: every one decodes onto the palette, the panther cut out, the tiger the biggest', () => {
  const keys = Object.keys(NP);
  assert.ok(keys.length >= 26, `the designs (${keys.length})`);
  for (const k of keys) {
    const P = npPic(k);
    assert.ok(P.w >= 12 && P.h >= 12 && P.px.length === P.w * P.h, `${k}: ${P.w}x${P.h}`);
    assert.ok(Number.isInteger(NP[k][1].length / P.w), `${k}: whole rows`);
    for (const v of P.px) assert.ok(v >= -1 && v < NP_PAL.length, `${k}: a colour of the palette`);
    const tubes = [...P.pe].filter((e) => e >= 150).length;
    assert.ok(tubes > P.px.length * 0.08 && tubes < P.px.length * 0.45, `${k}: its tubes lit, never the whole sign (${tubes} of ${P.px.length})`);
    assert.ok(Math.max(...P.pe) <= 200, `${k}: no tube brighter than batch 2's neon`);
    assert.deepEqual(picGlow(k), P.glow, `${k}: its glow its tubes' colour`);
  }
  assert.ok([...npPic('panther').px].filter((v) => v < 0).length > 300, 'the panther cut out of the dark');
  const area = (k) => npPic(k).w * npPic(k).h;
  assert.ok(keys.every((k) => k === 'tiger' || area(k) < area('tiger')), 'the tiger over STREETWEAR the biggest');
  assert.deepEqual(picSize('tigerHead'), picSize('panther'), 'the old roaring head is the panther now');
});

test('a Neon Strip front: its sign, a picture over the shopfront and more stacked up it, the dressing round them - nothing overlapping, nothing blown out', () => {
  const spec = { w: 352, d: 448, floors: 4, style: 'concrete', wallColor: '#2c2a36', win: 'even', parapet: 10, seed: 5, night: 1, glowOnly: true, blades: [], shop: { kind: 'diner', door: 'right', open: true, people: 2, sign: null, awning: null } };
  const lights = [];
  handNeon(spec, { door: 'right', name: 'NIGHT OWL RAMEN', kind: 'diner', col: 0, blade: 'RAMEN', pic: 'ramen', pics: ['noodles', 'dumpling'], dress: true, flick: 1 }, { w: spec.w, lights, rnd: rndOf(9) });
  const pics = spec.neonSigns.filter((s) => s.pic).map((s) => s.pic);
  assert.ok(pics.includes('ramen') && pics.length >= 2, `its pictures (${pics.join(', ')})`);
  const H = buildingH(spec), rects = spec.neonSigns.map((s) => { const [w, h] = s.pic ? picSize(s.pic, 2) : s.blade ? [14, s.blade.length * 12 + 8] : [s.w, s.h]; return [s.x, s.v, w, h]; });
  for (const [x, v, w, h] of rects) assert.ok(x >= 0 && x + w <= spec.w && v >= 0 && v + h <= H, 'on the face');
  for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
    const [a, b] = [rects[i], rects[j]];
    assert.ok(a[0] + a[2] <= b[0] || b[0] + b[2] <= a[0] || a[1] + a[3] <= b[1] || b[1] + b[3] <= a[1], `signs ${i} and ${j} apart`);
  }
  const kinds = new Set(spec.cyber.map((q) => q.k));
  for (const k of ['pipe', 'ac']) assert.ok(kinds.has(k), `dressed: ${k}`);
  assert.ok(kinds.has('holo') || kinds.has('strip'), 'a holo panel or light strips');
  for (const q of spec.cyber.filter((z) => z.k === 'holo')) for (const [x, v, w, h] of rects) assert.ok(q.x + q.w <= x || x + w <= q.x || q.v + q.h <= v || v + h <= q.v, 'a holo panel clear of the signs');
  assert.ok(lights.some((l) => l[6] === 'neonf'), 'a tube on the blink');
  const G = paintSigns(makeBuilding(spec), spec);
  // (batch 2's toned-down neon: the signs' tubes at most 200 strong, and between them dark - G.ax, G.ay: the face's
  // south-west corner, a face pixel at height v on row G.ay - v)
  let lit = 0, hot = 0, dark = 0, all = 0;
  for (const [x, v, w, h] of rects) for (let Y = G.ay - v - h; Y < G.ay - v; Y++) for (let X = G.ax + x; X < G.ax + x + w; X++) {
    const e = G.emi[(Y * G.w + X) * 4 + 3];
    all++; if (e > 0) lit++; else dark++; if (e > 210) hot++;
  }
  assert.ok(lit > 2000, `the glow (${lit} px)`);
  assert.equal(hot, 0, 'nothing blown out');
  assert.ok(dark > all * 0.2, `the dark between the tubes (${dark} of ${all})`);
});

test('a back on an alley: its roll shutter, a lantern sign beside it, the AC - no shopfront', () => {
  const spec = { w: 288, d: 320, floors: 2, style: 'brickDark', win: 'pair', parapet: 8, seed: 3, night: 1, glowOnly: true, blades: [], blank: true };
  const lights = [];
  handNeon(spec, { name: null, trim: false, col: 2, dress: { back: 1 }, top: 8, pics: ['matsuri'] }, { w: spec.w, lights, rnd: rndOf(4) });
  assert.ok(spec.cyber.some((q) => q.k === 'shutter'), 'the shutter');
  const sh = spec.cyber.find((q) => q.k === 'shutter'), pic = spec.neonSigns.find((s) => s.pic === 'matsuri');
  assert.ok(pic, 'the lantern sign');
  const [pw] = picSize('matsuri', 2);
  assert.ok(pic.x + pw <= sh.x || sh.x + sh.w <= pic.x || pic.v >= sh.h, 'beside the shutter, not over it');
  paintSigns(makeBuilding(spec), spec);
});

test('strings of lights made fast: a post at each end that has one, a bracket on a wall; red paper lanterns lit along it', () => {
  const opaque = (G, x, y0, y1) => { let n = 0; for (let y = y0; y < y1; y++) if (G.alpha(x, y) || G.alpha(x + 1, y)) n++; return n; };
  const bare = makeStatic({ t: 'festoon', tx: 160, ty: 0, h: 60 });
  const posts = makeStatic({ t: 'festoon', tx: 160, ty: 0, h: 60, e: 3 });
  // (the ground under the near end: G.ay; the string 60 px up)
  assert.ok(opaque(posts, posts.ax, posts.ay - 58, posts.ay + 1) >= 50, 'a post from the ground up to the string at the near end');
  assert.ok(opaque(posts, posts.ax + 160, posts.ay - 58, posts.ay + 1) >= 50, 'and at the far end');
  assert.ok(opaque(bare, bare.ax, bare.ay - 40, bare.ay + 1) === 0, 'none where it hangs from something else');
  const wall = makeStatic({ t: 'festoon', tx: 0, ty: 96, h: 50, k: 1, e: 12 });
  assert.ok(wall.alpha(wall.ax, wall.ay - 52), 'a bracket at the wall');
  let red = 0;
  for (let i = 0; i < wall.w * wall.h; i++) { const j = i * 4; if (wall.col[j + 3] && wall.col[j] > 200 && wall.col[j + 1] < 140 && wall.emi[j + 3] > 100) red++; }
  assert.ok(red >= 30, `red paper lanterns, lit (${red} px)`);
});
