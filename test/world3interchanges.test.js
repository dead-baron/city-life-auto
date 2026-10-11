// World v3, stage 3, step 4 (docs/WORLD-V3.md 8.11): the interchanges planned from the skeleton alone - no build (the
// built ones are checked on the network in test/world3roads.test.js). About a tenth of a second.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { interchangePlan } from '../shared/world3-roads.js';
import { HIGHWAYS, ARTERIALS, INTERCHANGES, MAIN_LINE, RADIUS, linePath, nearestOnPath, stretchRanges, inRanges } from '../shared/world3-skeleton.js';

test('World v3: the interchanges - the through highway on the deck, a diamond\'s ramps each way, clear of the main line and the other roads', () => {
  const { sites, listed } = interchangePlan();
  const path = (name) => linePath(HIGHWAYS.find((h) => h.name === name), RADIUS.hwy);
  // every skeleton interchange with a highway through it is built or listed with its reason (the Redwood Junction is a
  // continuation, nothing through it; the Metro Ring Interchange is Metro City's ring)
  for (const ic of INTERCHANGES) {
    if (ic.kind === 'ramps' || ic.name === 'Redwood Junction') continue;
    assert.ok(sites.some((s) => s.name === ic.name) || listed.some((q) => q.name === ic.name), `${ic.name} planned`);
  }
  for (const q of listed) assert.match(q.why, /tunnel|main line|runs through it/, `${q.name}: ${q.why}`);
  const names = sites.map((s) => s.name);
  for (const n of ['Westport Junction', 'Northshore Interchange', 'Dry Creek Interchange', 'Kestrel Pass Interchange']) assert.ok(names.includes(n), `${n} built (${names.join(', ')})`);
  const rail = MAIN_LINE.map((R) => { const p = linePath(R, R.r || RADIUS.main); return { p, tun: stretchRanges(p, R.tunnels) }; });
  for (const st of sites) {
    const P = path(st.U), U = HIGHWAYS.find((h) => h.name === st.U);
    // the deck run: on the path, clear of the highway's bores (its climbs too)
    assert.ok(st.d0 > 24 && st.d1 < P.length - 24, `${st.name}: the deck run on ${st.U}`);
    for (const [a, b] of stretchRanges(P, U.tunnels)) assert.ok(b < st.d0 - 24 || a > st.d1 + 24, `${st.name}: the deck clear of ${st.U}'s tunnel`);
    // a road below on each side, its ramps' foot at least 12 tiles out from the through highway
    for (const side of [1, -1]) {
      const a = st.arms.find((q) => q.side === side);
      assert.ok(a, `${st.name}: a road below on side ${side}`);
      assert.ok(nearestOnPath(P, a.S[0], a.S[1]).d >= 11.9, `${st.name}: ${a.name}'s foot clear of the deck`);
    }
    // four ramps: an exit and an on-ramp for each carriageway, each from (to) the deck within the run, down to (up
    // from) its side's road below
    assert.equal(st.ramps.length, 4, `${st.name}: four ramps`);
    for (const dir of [1, -1]) for (const off of [true, false]) {
      const r = st.ramps.find((q) => q.dir === dir && q.off === off);
      assert.ok(r, `${st.name}: ${off ? 'an exit' : 'an on-ramp'} for the carriageway ${dir}`);
      const deckEnd = off ? r.pts[0] : r.pts[r.pts.length - 1], foot = off ? r.pts[r.pts.length - 1] : r.pts[0];
      const q = nearestOnPath(P, deckEnd[0], deckEnd[1]);
      assert.ok(q.d < 5.5 && q.s > st.d0 && q.s < st.d1, `${st.name}: ${r.off ? 'exit' : 'on-ramp'} ${dir} joins the deck (${q.d.toFixed(1)} tiles off, at ${Math.round(q.s)})`);
      const arm = st.arms.find((a) => a.side === dir);
      assert.ok(Math.hypot(foot[0] - arm.S[0], foot[1] - arm.S[1]) < 0.5, `${st.name}: its foot on ${arm.name}`);
      assert.ok(r.zr[0] > 0 && r.zr[0] < r.zr[1] && r.zr[1] < 1, `${st.name}: its climb inside it`);
      // its low half clear of the main line (off its tunnels) and of every other road
      const mid = (r.zr[0] + r.zr[1]) / 2, n = r.pts.length;
      r.pts.forEach(([x, y], j) => {
        for (const R of rail) { const v = nearestOnPath(R.p, x, y); assert.ok(v.d >= 8 || inRanges(R.tun, v.s, 4), `${st.name}: a ramp on the main line at ${Math.round(x)}, ${Math.round(y)}`); }
        const f = j / (n - 1);
        if (off ? f < mid : f > mid) return;
        for (const A of ARTERIALS) {
          if (st.lowers.includes(A.name)) continue;
          const p = linePath(A, RADIUS.art), v = nearestOnPath(p, x, y);
          assert.ok(v.d >= 7 || inRanges(stretchRanges(p, A.tunnels), v.s, 4), `${st.name}: a ramp across ${A.name} at ${Math.round(x)}, ${Math.round(y)}`);
        }
      });
    }
  }
});
