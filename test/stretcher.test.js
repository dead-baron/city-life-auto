// Who's on a paramedic's stretcher is who it is (the owner, 2026-10-15: "when paramedics put someone in a stretcher it
// should be the actual character of the NPC or player"): the server sends their look with the medic (ems.js, the
// descriptor's pa - test/ems.test.js); the page lays that very person on the stretcher in the litter pose
// (client/art2/litter.js, game/peds.js, drawn by game/host.js in front of the medic). Here: the pose, the look kept, and
// the body lying along the stretcher's pad at every heading.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as Pd from '../client/art2/game/peds.js';

const RED = { s: 2, h: 1, hc: '#3a2a1a', t: 0, tc: '#d02828', tc2: '#ffffff', l: '#4a4a4a', sh: '#222222', ht: 0, bd: 1 };
const BLUE = { ...RED, tc: '#2850d8' };   // (the same person but for the top)
const MEDIC = Pd.adaptApp({ s: 1, h: 0, hc: '#222', t: 6, tc: '#f4f4f4', tc2: '#c83a3a', l: '#2a2a3a', sh: '#111' }, 'medic');
// the figure's pixels: their extent from the anchor (px) and how many are mostly the colour col
function look(G, col) {
  let x0 = 1e9, x1 = -1e9, n = 0;
  for (let y = 0; y < G.h; y++) for (let x = 0; x < G.w; x++) {
    const o = (y * G.w + x) * 4;
    if (!G.col[o + 3]) continue;
    x0 = Math.min(x0, x - G.ax); x1 = Math.max(x1, x - G.ax);
    if (col && col(G.col[o], G.col[o + 1], G.col[o + 2])) n++;
  }
  return { x0, x1, n };
}
const reddish = (r, g, b) => r > 130 && r > g + 60 && r > b + 50, bluish = (r, g, b) => b > 110 && b > r + 50 && b > g + 20;

test('the litter pose: their own look, lying on the back, nothing in the hands', () => {
  assert.equal(Pd.PED_POSES.litter, 1, 'registered (outside the chunk bake: art2/litter.js)');
  const A = Pd.adaptApp({ ...RED, b: 1 }, 'executive'), L = Pd.litterApp(A);
  assert.equal(L.carry, undefined, 'the briefcase left behind');
  assert.equal(L.skin, A.skin); assert.deepEqual(L.hair, A.hair); assert.deepEqual(L.top, A.top);
  const red = Pd.pedSprite(Pd.litterApp(Pd.adaptApp(RED, 'casual')), 'litter', 6, 0, 0), blue = Pd.pedSprite(Pd.litterApp(Pd.adaptApp(BLUE, 'casual')), 'litter', 6, 0, 0);
  const rr = look(red, reddish).n, rb = look(red, bluish).n, br = look(blue, reddish).n, bb = look(blue, bluish).n;
  assert.ok(rr - br > 20, `a red top on the one in red (${rr} red px, the one in blue ${br})`);
  assert.ok(bb - rb > 20, `a blue one on the one in blue (${bb} blue px, the one in red ${rb})`);
  assert.ok(red.h < 34, `lying down: ${red.h} px tall`);
  // a player's look by its code goes the same way (shared/look.js: the server sends app.lk - adaptApp reads it)
  assert.notEqual(Pd.pedKey(Pd.litterApp(A), 'litter', 6, 0, 0), Pd.pedKey(A, 'dead', 6, 0, 0));
});

test('lying along the stretcher\'s pad at every heading, not in the medic pushing it', () => {
  const at = [0, 0];
  for (const d8 of [2, 6]) {   // (side on: the pad runs 13..47 px ahead of the medic's feet - art2/people.js stretcherFigure)
    const G = Pd.pedSprite(Pd.litterApp(Pd.adaptApp(RED, 'casual')), 'litter', d8, 0, 0), e = look(G);
    Pd.litterAt(d8, at);
    const s = d8 === 6 ? 1 : -1, near = Math.min(s * (e.x0 + at[0]), s * (e.x1 + at[0])), far = Math.max(s * (e.x0 + at[0]), s * (e.x1 + at[0]));
    assert.ok(near >= 6, `heading ${d8}: clear of the medic (${near} px ahead)`);
    assert.ok(far <= 56, `heading ${d8}: off the far end by little (${far} px ahead, the pad's end at 47)`);
    const pushed = look(Pd.pedSprite(Pd.withProp(MEDIC, 'stretcher'), 'push', d8, 0, 0));
    assert.ok(s > 0 ? pushed.x1 >= 44 : -pushed.x0 >= 44, 'the stretcher (empty) under them');
  }
  for (let d8 = 0; d8 < 8; d8++) { Pd.litterAt(d8, at); assert.ok(Math.hypot(at[0], at[1] / 0.5736) > Pd.LITTER.ahead - 0.5, 'ahead of the medic whichever way'); }
  assert.ok(Pd.LITTER.z > 15 && Pd.LITTER.z < 24, 'up on the pad');
});
