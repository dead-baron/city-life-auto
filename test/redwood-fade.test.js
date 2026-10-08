// The giant redwoods fade only when they're in front of you (client/art2/game/host.js _fades / _treeCovers): behind
// the trunk or under the crown on screen - not whenever you're near one.
import test from 'node:test';
import assert from 'node:assert/strict';
import { World2 } from '../client/art2/game/host.js';

const TREE_FADE = 1e6;   // (statics.js)
const tree = { t: 'redwood', sp: 'giant', x: 1000, y: 1000 };
const map = { props: [tree] };
const covers = (px, py, inVeh = false) => World2.prototype._treeCovers.call({ map }, 0, px, py, inVeh, 0);

test('a redwood covers you behind its trunk or under its crown, not beside the trunk', () => {
  assert.ok(covers(1030, 900), 'just north of it, behind the trunk');
  assert.ok(!covers(1150, 900), 'just north of it, 150 px to the side: the trunk is narrow down there');
  assert.ok(!covers(1090, 900), '90 px to the side, low down: still beside the trunk');
  assert.ok(covers(1110, 600), 'well north of it, 110 px to the side: behind the crown');
  assert.ok(!covers(1200, 600), '200 px to the side: clear of the crown');
  assert.ok(!covers(1000, 300), 'beyond its top');
  assert.ok(covers(1060, 900, true), 'a car is wider: 60 px over, behind the trunk');
});

// the host's per-frame fade pass, with one tree in a chunk: who wants it faded
function fadesAt(px, py) {
  const host = {
    map, S: { pred: null, me: null }, fades: new Map(), _gz: () => 0, _treeCovers: World2.prototype._treeCovers,
    chunkState: new Map([[0, { blds: [[TREE_FADE + 0, 1000 - 105, 1000 - 660, 1000 + 105, 1060, 1000]] }]]),
  };
  for (let i = 0; i < 30; i++) World2.prototype._fades.call(host, { dt: 0.1 }, { x: px, y: py, z: 0 });
  return host.fades.get(TREE_FADE) || 0;
}
test('the fade pass: the tree fades with you behind it and stays when you only walk near it', () => {
  assert.ok(fadesAt(1020, 880) > 0.8, 'behind the trunk: faded');
  assert.equal(fadesAt(1160, 880), 0, 'beside it (the old box faded this): kept');
  assert.equal(fadesAt(1020, 1040), 0, 'in front of it (south of its foot): kept');
  assert.ok(fadesAt(1100, 620) > 0.8, 'under the crown: faded');
});
