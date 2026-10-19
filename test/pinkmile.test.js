// The Pink Mile, handcrafted (shared/world3-pinkmile.js, 2026-10-18): its streets - the Mile curving from the Westport
// Bridge's foot to Westside Avenue on Crosstown Avenue's line, Neon Boulevard carried on west along the water to the Arts
// Bridge, Bridge Street from the bridge's end, the Strip's Lantern Street and back alley carried on as Rose Street and
// Rose Alley - and the special places it lays itself; its art: the motels' fronts (a door, a window and a lamp to every
// room on both floors, the gallery along the upper floor and the stair up to it), their tall signs, the six neon
// pictures drawn from shapes. (The district built in the whole world: test/world3world.test.js.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PINKMILE, PX, mileY } from '../shared/world3-pinkmile.js';
import { HAND_PLANS } from '../shared/world3-hand.js';
import { ARTERIALS } from '../shared/world3-skeleton.js';
import { CITY3 } from '../shared/world3-city.js';
import { makeBuilding, buildingH, FLOOR } from '../client/art2/buildings.js';
import { paintSigns, picSize, picGlow } from '../client/art2/neonsigns.js';
import { makeStatic } from '../client/art2/game/statics.js';

test('the Pink Mile\'s streets meet the bridges and carry the Strip\'s on; it lays its own special places', () => {
  assert.ok(HAND_PLANS.includes(PINKMILE));
  assert.equal(CITY3.find((c) => c.d === PINKMILE.d).hand, 'pinkmile', 'the grid lays only the avenues round it');
  const S = PINKMILE.streets(), by = (n) => S.find((s) => s.name === n);
  for (const s of S) assert.ok(['st', 'ave', 'blvd', 'alley', 'minor'].includes(s.kind) && s.pts.length >= 2, `${s.name}: a kind the generator knows`);
  const bridge = (n) => ARTERIALS.find((a) => a.name === n).pts[0];
  assert.deepEqual(by('Pink Mile Boulevard').pts[0], bridge('Westport Bridge'), 'the Mile from the Westport Bridge\'s foot');
  assert.deepEqual(by('Pink Mile Boulevard').pts.at(-1), [PX.westside, 2300], 'to Westside Avenue, where Crosstown Avenue carries on');
  assert.deepEqual(by('Bridge Street').pts[0], bridge('Arts Bridge'), 'Bridge Street from the Arts Bridge\'s end');
  assert.ok(mileY(2700) > mileY(2575) + 8 && mileY(2700) > mileY(2850) + 25, 'the Mile curves south through the middle and back');
  // the Strip's streets carried on: its boulevard, Lantern Street, the back alley - end to end at Westside Avenue
  const neon = HAND_PLANS.find((p) => p.key === 'neon').streets();
  for (const [mine, theirs] of [['Neon Boulevard', 'Neon Boulevard'], ['Rose Street', 'Lantern Street'], ['Rose Alley', 'Neon Back Alley']]) {
    assert.deepEqual(by(mine).pts.at(-1), neon.find((s) => s.name === theirs).pts[0], `${mine} carries on as the Strip's ${theirs}`);
  }
  assert.ok(by('Blind Alley').culdesac, 'Blind Alley: a dead end');
  for (const n of ['Pink Moon Lounge', 'The Pink Pussycat Lounge', 'Hourly Hearts Motel']) assert.ok(PINKMILE.specials.includes(n), `${n}: laid by the plan`);
});

test('a motel\'s front: a door, a window and a lamp to every room on both floors; the gallery along the upper floor; the stair up to it', () => {
  const spec = { w: 768, d: 352, floors: 2, style: 'stucco', wallColor: '#ec9cb8', parapet: 8, motel: { room: 96, door: '#2e8a8a', stair: 'left' }, night: 1, seed: 7 };
  const G = makeBuilding(spec), H = buildingH(spec), fy = (v) => spec.d + H - v;
  const px = (x, Y) => { const j = (Y * G.w + x) * 4; return [G.col[j], G.col[j + 1], G.col[j + 2]]; };
  const teal = ([r, g, b]) => g > r + 25 && b > r + 25;
  // the rooms' doors: runs of the door colour along a row through each floor's doors
  const runs = (Y) => { let n = 0, gap = 99; for (let x = 0; x < spec.w; x++) { if (teal(px(x, Y))) { if (gap > 4) n++; gap = 0; } else gap++; } return n; };   // (a door's panels split its colour: a run ends after a few px without it)
  const rooms = Math.round((spec.w - 46 - 6) / 96);
  assert.equal(runs(fy(8)), rooms, 'a door to every room downstairs');   // (below the windows)
  assert.equal(runs(fy(FLOOR + 8)), rooms, 'and upstairs');
  // the lamps by the doors lit at night
  let lamps = 0;
  for (let Y = fy(FLOOR + 38); Y < fy(FLOOR + 30); Y++) for (let x = 0; x < spec.w; x++) if (G.emi[(Y * G.w + x) * 4 + 3] > 150) lamps++;
  assert.ok(lamps >= rooms * 6, `a lamp by every door upstairs (${lamps} lit px)`);
  // the gallery: its slab's pale edge across the front at the upper floor
  const slab = fy(FLOOR) + 1;
  let pale = 0;
  for (let x = 2; x < spec.w - 2; x++) { const [r, g, b] = px(x, slab); if (r > 150 && g > 150 && b > 140 && Math.abs(r - b) < 40) pale++; }
  assert.ok(pale > (spec.w - 4) * 0.8, `the gallery's slab along the front (${pale} px)`);
  // the stair: a tread on each step up across its bay at the west end, below the gallery
  let treads = 0;
  for (let Y = slab + 2; Y < fy(0); Y++) { let n = 0; for (let x = 0; x < 46; x++) { const [r, g, b] = px(x, Y); if (r > 150 && g > 150 && b > 140 && Math.abs(r - b) < 40) n++; } if (n >= 5) treads++; }
  assert.ok(treads >= 6, `the stair's treads (${treads})`);
});

test('the motels\' tall signs, the Pink Mile\'s neon pictures', () => {
  const S = makeStatic({ t: 'msign', text: 'STARLITE', word: 'MOTEL', ci: 2, z: 60 });
  let lit = 0;
  for (let i = 0; i < S.w * S.h; i++) if (S.emi[i * 4 + 3] > 150) lit++;
  assert.ok(S.h >= 60 + 5 * 24 && S.w >= 60, `a tall sign on its pole (${S.w} x ${S.h})`);
  assert.ok(lit > 400, `its name, its word, the arrow's bulbs and VACANCY lit (${lit} px)`);
  for (const k of ['moon', 'martini', 'heart', 'kiss', 'palm', 'rose']) {
    const [w, h] = picSize(k, 1);
    assert.ok(w >= 24 && h >= 20 && w <= 48 && h <= 48, `${k}: a sign's size (${w} x ${h})`);
    let n = 0, bright = 0;
    const G = { ax: 0, ay: h, inside: (x, y) => x >= 0 && y >= 0 && x < w && y < h, alpha: () => true, put: (x, y, c, nrm, z, e) => { n++; if (e) bright++; }, glow: () => {} };
    paintSigns(G, { neonSigns: [{ pic: k, x: 0, v: 0, s: 1, col: [255, 80, 200] }] });
    assert.ok(n > 120 && bright > n * 0.25, `${k}: drawn, its tubes lit (${bright} of ${n} px)`);
    assert.equal(picGlow(k).length, 3, `${k}: its own glow`);
  }
});
