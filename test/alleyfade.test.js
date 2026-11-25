// A whole stretch of alley opens up, not one building (client/art2/game/host.js _fades; the owner, 11-25 01:13: "It
// shows one building transparent but you cant see through the other ones. Could we have more buildings go transparent
// when they're blocking an alley or street"). Once a building hides you, the others hiding the same alley or street
// along your row fade too - as far as the ground stays open, FADE_REACH tiles at most; nothing fades while you stand
// in the clear; a building past a wall across the alley, or beyond the reach, stays.
import test from 'node:test';
import assert from 'node:assert/strict';
import { World2, FADE_REACH } from '../client/art2/game/host.js';
import { TILE, T } from '../shared/constants.js';

// an alley along row 20, open from column 5 to 60 but for a wall at column 40; buildings south of it (feet at y 760)
// whose pictures rise over the alley's row: A (cols 8-14), B (16-22: the one over the player), C (24-30), D past the
// wall (42-48), E far along (beyond the reach from B, before the wall: none fits - so the reach is tested from A)
const W = 80, H = 40, tiles = new Uint8Array(W * H).fill(T.BUILDING);
for (let x = 5; x <= 60; x++) if (x !== 40) tiles[20 * W + x] = T.SIDEWALK;
const map = { props: [], tiles, inside: (x, y) => x >= 0 && y >= 0 && x < W && y < H, idx: (x, y) => y * W + x };
const bld = (id, c0, c1) => [id, c0 * TILE, 560, (c1 + 1) * TILE, 770, 760];   // (picture from y 560 to 770, foot at 760: it covers row 20 = y 640..672)
const blds = [bld(1, 8, 14), bld(2, 16, 22), bld(3, 24, 30), bld(4, 42, 48)];
function fades(px, py) {
  const host = { map, S: { pred: null, me: null }, fades: new Map(), _gz: () => 0, _treeCovers: World2.prototype._treeCovers, chunkState: new Map([[0, { blds }]]) };
  for (let i = 0; i < 30; i++) World2.prototype._fades.call(host, { dt: 0.1 }, { x: px, y: py, z: 0 });
  return host.fades;
}

test('behind one building of an alley, the buildings hiding the alley either side fade with it', () => {
  const f = fades(19 * TILE, 20.5 * TILE);
  assert.ok(f.get(2) > 0.8, 'the one over you');
  assert.ok(f.get(1) > 0.8 && f.get(3) > 0.8, 'its neighbours along the alley');
  assert.ok(!f.get(4), 'the one past the wall across the alley stays');
});
test('in the clear nothing fades; the stretch ends at the reach', () => {
  assert.equal(fades(19 * TILE, 30 * TILE).size, 0, 'south of them all, in front: nothing');
  assert.equal(fades(32.5 * TILE, 20.5 * TILE).size, 0, 'in the alley where no building covers you: nothing');
  assert.ok(FADE_REACH >= 8 && FADE_REACH <= 24);
  const f = fades(8.5 * TILE, 20.5 * TILE);   // (behind the west end of A: C starts 16 tiles on - beyond the reach)
  assert.ok(f.get(1) > 0.8 && f.get(2) > 0.8, 'A and B');
  assert.ok(FADE_REACH >= 15 || !f.get(3), 'C is beyond the reach from here');
});
