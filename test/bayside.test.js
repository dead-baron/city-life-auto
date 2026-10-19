// Bayside Heights, handcrafted (shared/world3-bayside.js, 2026-10-19): its streets - Ocean Drive along the clifftop
// from the Gulf Footbridge, Hillcrest Drive from the Pine Hills Bridge, the avenues carried down from Downtown to the
// Strand Footbridge and the Southside Bridge, Marina Avenue from the Lake District Bridge, Falls Street to the Falls
// Bridge, Marina Walk to the Lakes Footbridge - its areas clear of Pine Hills' and Southside's land, the special places
// it lays itself, the Hilltop Mansion through the generator's own builder. (The district built in the whole world:
// test/world3world.test.js.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BAYSIDE, ENDS, OCEAN, HILL } from '../shared/world3-bayside.js';
import { HAND_PLANS } from '../shared/world3-hand.js';
import { ARTERIALS } from '../shared/world3-skeleton.js';
import { CITY3 } from '../shared/world3-city.js';

test('Bayside Heights\' streets meet every bridge and footbridge on its shores; it lays its own special places', () => {
  assert.ok(HAND_PLANS.includes(BAYSIDE));
  assert.equal(CITY3.find((c) => c.d === BAYSIDE.d).hand, 'bayside', 'the grid lays only the avenues round it');
  const S = BAYSIDE.streets(), by = (n) => S.find((s) => s.name === n);
  for (const s of S) assert.ok(['st', 'ave', 'blvd', 'alley', 'minor'].includes(s.kind) && s.pts.length >= 2, `${s.name}: a kind the generator knows`);
  const end = (n, k) => { const a = ARTERIALS.find((q) => q.name === n); return k === 'first' ? a.pts[0] : a.pts.at(-1); };
  // each bridge's end on the district's side, and the street that meets it there
  for (const [bridge, k, at] of [['Gulf Footbridge', 'last', ENDS.gulfFoot], ['Strand Footbridge', 'first', ENDS.strand], ['Pine Hills Bridge', 'last', ENDS.pineHills], ['Southside Bridge', 'first', ENDS.southside],
    ['Lake District Bridge', 'first', ENDS.lakeDistrict], ['Falls Bridge', 'last', ENDS.falls], ['Lakes Footbridge', 'first', ENDS.lakesFoot]]) {
    assert.deepEqual(end(bridge, k), at, `${bridge}'s end`);
    assert.ok(S.some((s) => [s.pts[0], s.pts.at(-1)].some((p) => p[0] === at[0] && p[1] === at[1])), `a street ends at ${bridge}'s end`);
  }
  assert.deepEqual(OCEAN[0], ENDS.gulfFoot, 'Ocean Drive from the Gulf Footbridge');
  assert.deepEqual(HILL[0], ENDS.pineHills, 'Hillcrest Drive from the Pine Hills Bridge');
  assert.equal(by('Ocean Drive').kind, 'blvd');
  // Ocean Drive and Marina Avenue meet at the drive's east end
  assert.deepEqual(by('Ocean Drive').pts.at(-1), by('Marina Avenue').pts.at(-1));
  for (const n of ['The Bayside Ritz', 'Monarch', 'Diamond & Co.']) assert.ok(BAYSIDE.specials.includes(n), `${n}: laid by the plan`);
});

test('Bayside Heights\' areas keep clear of Pine Hills and Southside, whose own grids lay their streets', () => {
  const ph = CITY3.find((c) => c.d === 0), ss = CITY3.find((c) => c.d === 6);
  assert.ok(ph && ss);
  // (the ocean side in pieces: none reaches the channels' far shores - Pine Hills from y 2848 west of x 2870 and 2938 east of
  // it, Southside from y 2939 east of x 3680)
  for (const [x0, y0, x1, y1] of BAYSIDE.rects) {
    if (x0 < 2870) assert.ok(y1 <= 2848, `west of Westside Avenue: north of Pine Hills (${y1})`);
    else if (x0 < 3200) assert.ok(y1 <= 2938, `north of Pine Hills' east shore (${y1})`);
    else if (x0 >= 3700) assert.ok(y1 <= 2939, `north of Southside (${y1})`);
    assert.ok(x0 < x1 && y0 < y1);
  }
  const box = BAYSIDE.rect;
  for (const r of BAYSIDE.rects) assert.ok(r[0] >= box[0] && r[1] >= box[1] && r[2] <= box[2] && r[3] <= box[3], 'inside the frame');
});
