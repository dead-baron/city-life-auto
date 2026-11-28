// A front's words kept clear (the placement lint's signCovered, 157 -> 68 on 11-26): a sign moved up onto what stands
// before it is not painted again on the wall behind; a hotel's entrance canopy is cloth, as wide as its name needs, the
// name on its front edge (statics.js addLots, coverSign; props-rural.js entryCanopy); a topiary cone by a door stands
// out from under the board; the window's OPEN and the shop's board keep clear of a phone box, a lamp, a pole, a
// forecourt's canopy where the words still read as they stand (frontTall, clearStretch). The world's count is the
// lint's own (test/placementlint.test.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TILE } from '../shared/constants.js';
import { makeBuilding } from '../client/art2/buildings.js';
import { entryCanopy, ENTRY_COLS, fuelCanopy } from '../client/art2/props-rural.js';
import { frontTall, clearStretch, FRONT_TALL, CONE_AT_BOARD, HOTEL_CANOPY, makeStatic } from '../client/art2/game/statics.js';
import { loadProviders } from '../client/art2/game/chunkbake.js';

test('a sign moved onto a cover is not painted on the wall behind', () => {
  const spec = (moved) => ({ w: 320, d: 160, floors: 2, style: 'brick', seed: 7, shop: { kind: 'lobby', door: 'left', open: true, people: 2, sign: { text: 'GRAND NEON HOTEL', bg: '#7a1e2a', fg: [255, 214, 140], lit: true, ...(moved ? { moved: 'cover' } : null) } } });
  const A = makeBuilding(spec(false)), B = makeBuilding(spec(true));
  assert.ok(A.signBox && A.signBox.w > 60, 'the board on the wall');
  assert.ok(!B.signBox, 'moved: no board');
  assert.equal(A.h, B.h, 'the front the same height either way');
});

test('a hotel\'s entrance canopy: cloth in a house colour, brass posts at the front, no forecourt slab', async () => {
  await loadProviders();
  for (const col of ENTRY_COLS) {
    const G = makeStatic({ t: 'v', m: 'entryCanopy', a: [HOTEL_CANOPY.w, HOTEL_CANOPY.d, HOTEL_CANOPY.h, col, 1], hd: 0, pv: null });
    let n = 0, pale = 0, lum = 0;
    for (let i = 0; i < G.w * G.h; i++) {
      if (G.col[i * 4 + 3] < 128) continue;
      n++;
      const c = [G.col[i * 4], G.col[i * 4 + 1], G.col[i * 4 + 2]];
      lum += 0.3 * c[0] + 0.6 * c[1] + 0.1 * c[2];
      if (Math.max(...c) - Math.min(...c) < 10 && c[0] > 150) pale++;   // (the forecourt slab's light grey)
    }
    assert.ok(n > 800, `${col}: drawn (${n} px)`);
    assert.ok(pale < n * 0.1, `${col}: not a pale slab (${pale} of ${n})`);
    assert.ok(lum / n < 130, `${col}: a deep cloth (mean ${Math.round(lum / n)})`);
  }
  // wider when its name needs it; lower than the forecourt's slab
  const W = makeStatic({ t: 'v', m: 'entryCanopy', a: [240, HOTEL_CANOPY.d, HOTEL_CANOPY.h, ENTRY_COLS[0], 1], hd: 0, pv: null }), N = makeStatic({ t: 'v', m: 'entryCanopy', a: [96, HOTEL_CANOPY.d, HOTEL_CANOPY.h, ENTRY_COLS[0], 1], hd: 0, pv: null });
  assert.ok(W.w > N.w * 2, `${W.w} against ${N.w}`);
  assert.ok(entryCanopy && fuelCanopy && HOTEL_CANOPY.max <= 300);
});

test('a cone by a shop\'s door stands out from under its board', async () => {
  await loadProviders();
  const G = makeStatic({ t: 'f', sp: 'topCone', s: 1000 + 5 * 37 + 7 * 7, k: 1 }), ap = G.ap2 || 1;
  let top = G.h;
  for (let y = 0; y < G.h && top === G.h; y++) for (let x = 0; x < G.w; x++) if (G.col[(y * G.w + x) * 4 + 3] > 128) { top = y; break; }
  const tall = G.ay - top * ap;
  assert.ok(tall - CONE_AT_BOARD <= FRONT_TALL.board, `its tip ${tall - CONE_AT_BOARD} px up the wall, the board's foot at ${FRONT_TALL.board}`);
  assert.ok(tall - 11 > FRONT_TALL.board, 'at the other pots\' 11 px it reached the board (why it stands further out)');
});

test('what stands tall before a front: its span and how far up the wall it reaches', () => {
  const foot = 20 * TILE, M = { props: [
    { t: 'phonebox', x: 10 * TILE + 100, y: foot + 16 },         // a phone box 16 px out
    { t: 'lamp', x: 10 * TILE + 200, y: foot + 30 },             // a lamp post near the wall
    { t: 'lamp', x: 10 * TILE + 260, y: foot + 96 },             // one at the kerb: out of reach
    { t: 'lamp', x: 10 * TILE + 40, y: foot + 8, wall: 1 },      // a lamp on the wall: not a post
    { t: 'upole', x: 10 * TILE + 300, y: foot + 62 },
    { t: 'phonebox', x: 10 * TILE + 150, y: foot - 3 * TILE },   // behind the wall: another street's
    { t: 'bench', x: 10 * TILE + 120, y: foot + 10 },
  ], pumps: [{ x: 10 * TILE + 400, y: foot + 80 }] };
  const R = frontTall(M, 10, 20, 16).sort((a, b) => a[0] - b[0]);
  assert.deepEqual(R, [[89, 111, 54], [197, 203, 60], [296, 304, 54], [345, 455, 11]]);
  assert.ok(R[0][2] > FRONT_TALL.board && R[0][2] > FRONT_TALL.open, 'the phone box reaches the board');
  assert.ok(R[3][2] < FRONT_TALL.open, 'a forecourt this far out reaches neither');
  assert.deepEqual(frontTall(M, 30, 20, 8), [], 'another front: none of them');
  // a forecourt's canopy close in is over the window
  const M2 = { props: [], pumps: [{ x: 100, y: foot + 50 }] };
  assert.ok(frontTall(M2, 0, 20, 10)[0][2] > FRONT_TALL.open);
});

test('the widest clear stretch of a front', () => {
  assert.deepEqual(clearStretch([[100, 122]], 4, 316), [122, 316]);
  assert.deepEqual(clearStretch([[200, 222]], 4, 316), [4, 200]);
  assert.deepEqual(clearStretch([[0, 31], [280, 320]], 4, 316), [31, 280]);
  assert.deepEqual(clearStretch([[50, 60], [55, 90], [200, 210]], 4, 316), [90, 200]);
  assert.deepEqual(clearStretch([], 4, 316), [4, 316]);
  assert.equal(clearStretch([[0, 400]], 4, 316), null);
});
