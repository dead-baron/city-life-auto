// The forklift yards' loading bays (the owner, 11-06: "We should have it make you take the pallets further away into a
// clear marked loading bay area"): the map plans, for every yard, the pallets' row and a loading bay across the yard a
// real drive away (shared/loadbays.js, m.loadBays), the way between clear of everything (test/loadbayscheck.js - World
// v3's yards, the port's container yard and the warehouses' among them: test/world3server.test.js), the same every
// build; the art marks it - the slots' lines and numbers, the hazard stripes, LOADING BAY on the ground
// (client/art2/game/groundbake.js), its sign and its floodlight, lit at night (statics.js). The world's own data only:
// the map's tiles and props don't change for it (its signature stays).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld } from './helpers.js';
import { checkYards } from './loadbayscheck.js';
import { buildLoadingBays, yardSites, BAY } from '../shared/loadbays.js';
import { withDeterministicMath } from '../shared/dmath.js';
import { FORK } from '../shared/rules-work.js';
import { TILE } from '../shared/constants.js';
import { closure } from '../tools/perf.mjs';

const w = makeWorld(), M = w.map;

test('every yard has its pallets and a loading bay across it, a real drive away, the way there clear', () => {
  const R = checkYards(M);
  assert.ok(R.sites.length >= 1 && R.bays.length === R.sites.length, `${R.bays.length} bays for ${R.sites.length} yards`);
  assert.deepEqual(R.problems, []);
  for (const b of R.bays) {
    assert.equal(b.pick.pallets.length, FORK.pallets);
    assert.equal(b.bay.slots.length, Math.ceil(FORK.pallets / 2), 'two pallets a slot');
    assert.ok(b.len >= FORK.drive[0] && b.len <= FORK.drive[1], `${b.yard.name}: ${b.len} tiles`);
    assert.ok(Math.hypot(b.bay.x - b.pick.x, b.bay.y - b.pick.y) > 15 * TILE, 'across the yard');
  }
});

test('the same plan every build, and the map\'s tiles and props untouched by it', () => {
  const before = JSON.stringify(M.loadBays), props = M.props.length, sig = M._sig;
  const again = withDeterministicMath(() => buildLoadingBays(M));
  assert.equal(JSON.stringify(again), before);
  assert.equal(M.props.length, props, 'no props');
  assert.equal(M._sig, sig);
  assert.ok(yardSites(M).every((y) => y.name && !/\bthe The\b/.test(y.name)), 'named for the place');
});

test('the bay is marked: the slots\' lines, their numbers, hazard stripes and LOADING BAY painted; its sign and floodlight, lit at night', async () => {
  const { bakeGround, CHUNK } = await import('../client/art2/game/groundbake.js');
  const { staticItems, staticLights, STATIC_CHUNK } = await import('../client/art2/game/statics.js');
  const b = M.loadBays[0], B = b.bay;
  // the ground: yellow (the stripes, the front line, the words) and near-black (the stripes) round the bay, white lines
  // between its slots; yellow corner marks at the pallets' places
  const baked = new Map();   // (the chunks it spans, baked as they're looked at)
  const at = (x, y) => {
    const cx = Math.floor(x / CHUNK), cy = Math.floor(y / CHUNK), k = `${cx},${cy}`;
    if (!baked.has(k)) baked.set(k, bakeGround(M, cx, cy, { quality: 1, seed: 1337 }));
    const G = baked.get(k), X = Math.floor(x - cx * CHUNK), Y = Math.floor(y - cy * CHUNK), i = (Y * CHUNK + X) * 4;
    return [G.col[i], G.col[i + 1], G.col[i + 2]];
  };
  const yellow = (c) => c && c[0] > 150 && c[1] > 120 && c[2] < 110, dark = (c) => c && c[0] < 70 && c[1] < 70 && c[2] < 70, white = (c) => c && c[0] > 170 && c[1] > 170 && c[2] > 160;
  let y = 0, k = 0, wh = 0;
  const hw = B.w / 2, hd = B.d / 2;
  // (the back's band of stripes: along the slots, hd - 4 in)
  for (let u = -hw; u <= hw; u += 1) { const c = at(B.x + B.ax * u + B.fx * (hd - 4), B.y + B.ay * u + B.fy * (hd - 4)); if (yellow(c)) y++; if (dark(c)) k++; }
  assert.ok(y > 40 && k > 40, `hazard stripes along the back (${y} yellow, ${k} dark)`);
  // (a slot's line: half way between two slots' middles)
  const s0 = B.slots[0], s1 = B.slots[1], mx = (s0.x + s1.x) / 2, my = (s0.y + s1.y) / 2;
  for (let v = -hd + 6; v < hd - 10; v += 1) for (const d of [-1, 0, 1]) if (white(at(mx + B.ax * d + B.fx * v, my + B.ay * d + B.fy * v))) wh++;
  assert.ok(wh > 20, `a white line between slots 1 and 2 (${wh})`);
  // (LOADING BAY and the numbers on the apron in front: yellow and white there)
  let words = 0;
  for (let u = -hw; u <= hw; u += 1) for (let v = -hd - 64; v < -hd; v += 2) { const c = at(B.x + B.ax * u + B.fx * v, B.y + B.ay * u + B.fy * v); if (yellow(c) || white(c)) words++; }
  assert.ok(words > 150, `words on the apron (${words})`);
  // the sign and the floodlight; their light at night
  const sx = Math.floor(B.sign.x / STATIC_CHUNK), sy = Math.floor(B.sign.y / STATIC_CHUNK);
  assert.ok(staticItems(M, sx, sy).some((q) => q.key.startsWith('tsign:LOADING BAY')), 'the LOADING BAY sign');
  const L = B.lamps[0], lx = Math.floor(L.x / STATIC_CHUNK), ly = Math.floor(L.y / STATIC_CHUNK);
  assert.ok(staticItems(M, lx, ly).some((q) => q.key.startsWith('lp:cobra:') && Math.hypot(q.x - L.x, q.y - L.y) < 2), 'the floodlight');
  const lights = [...staticLights(M, lx, ly), ...staticLights(M, sx, sy)];
  assert.ok(lights.some((q) => q.kind === 'lamp' && Math.hypot(q.x - B.x, q.y - B.y) < B.w), 'its light falls on the bay');
  assert.ok(lights.some((q) => q.kind === 'sign' && Math.hypot(q.x - B.sign.x, q.y - B.sign.y) < 10), 'the sign lit');
  // (the pallets' places: a yellow corner mark by each)
  const p = b.pick.pallets[0];
  let corner = 0;
  for (let a = -25; a <= 25; a++) for (let c = -25; c <= 25; c++) if (yellow(at(p.x + a, p.y + c))) corner++;
  assert.ok(corner > 10, `the pallets' corner marks (${corner})`);
});

test('the plan is the generator\'s: the page never loads it (it reads m.loadBays)', () => {
  const page = new Set(closure(['client/boot.js', 'client/main.js', 'client/jobway.js', 'client/art2/game/groundbake.js', 'client/art2/game/statics.js']));
  assert.ok(!page.has('shared/loadbays.js'), 'shared/loadbays.js is not in the page');
  assert.equal(BAY.route, FORK.drive, 'the drive is the job\'s number (shared/rules-work.js)');
});
