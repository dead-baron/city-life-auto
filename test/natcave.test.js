// The mine cave as a scene (the nature showcase, concept N3: shared/cavekit.js) - the Old Granite Mine's cave laid out
// round the lantern lake, Copper Gulch Mine's mirrored, the kit spread to the Redwood Caverns - on a stand-in map with
// World v3's mines and caverns where the world puts them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { undergroundOf, cellAtPx, mouthsOf, C } from '../shared/underground.js';
import { cavernPlan, CAVERNS } from '../shared/world3-caves.js';
import { N3 } from '../shared/cavekit.js';
import '../shared/caverns.js';
import { TILE } from '../shared/constants.js';

const T32 = TILE;
const map = {
  seed: 1337, frame: { w: 6552, h: 4032 }, x0: 0, y0: 0, w: 6552, h: 4032,
  natureSites: [
    { kind: 'mine', name: 'Old Granite Mine', x: 32176, y: 20320, scene: { kit: 'n3', push: N3.push } },
    { kind: 'mine', name: 'Copper Gulch Mine', x: 159456, y: 51552, scene: { kit: 'n3red', push: N3.push } },
  ],
  caverns: [cavernPlan(CAVERNS, [
    { name: 'Redwood Creek Falls', kind: 'falls', x: 49926, y: 41611, out: { x: 49930, y: 41663 }, inside: { x: 49926, y: 41563 }, toward: 'gallery' },
    { name: 'the Sea Cave', kind: 'sea', x: 16272, y: 35565, out: { x: 16272, y: 35621 }, inside: { x: 16280, y: 35515 }, toward: 'seacave' },
  ])],
};
const L = undergroundOf(map);
const walk = (v) => v === C.FLOOR || v === C.DOCK;
function onFoot(x, y) {
  const seen = new Set(), q = [[Math.floor(x / T32), Math.floor(y / T32)]], key = (a, b) => b * 8192 + a;
  seen.add(key(...q[0]));
  for (let h = 0; h < q.length; h++) {
    const [tx, ty] = q[h];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const X = tx + dx, Y = ty + dy, k = key(X, Y);
      if (seen.has(k) || !walk(cellAtPx(L, (X + 0.5) * T32, (Y + 0.5) * T32))) continue;
      seen.add(k); q.push([X, Y]);
    }
  }
  return (px, py) => seen.has(key(Math.floor(px / T32), Math.floor(py / T32)));
}

test('the mine caves are laid out as the scene: the chamber, its lake and trestle, the adit and its drift on to the template', () => {
  for (const name of ['Old Granite Mine', 'Copper Gulch Mine']) {
    const K = L.caves.find((q) => q.name === name);
    assert.ok(K && K.kit && K.ch.scene, `${name}: its scene`);
    const at = onFoot(K.inside.x, K.inside.y);
    // in from the mouth: the chamber, over the trestle, through the adit and on to every chamber of the template's
    assert.ok(at(K.ch.entry.x, K.ch.entry.y), `${name}: the way in reaches the chamber`);
    const tr = K.kit.trestles[0];
    assert.ok(tr && at(tr.x0, tr.y0) && at(tr.x1, tr.y1) && at((tr.x0 + tr.x1) / 2, tr.y0), `${name}: the trestle walked end to end`);
    assert.equal(cellAtPx(L, (tr.x0 + tr.x1) / 2, tr.y0 + 3 * T32), C.POOL, `${name}: water under the trestle`);
    for (const id of ['hall', 'grotto', 'river', 'worms', 'crystal', 'den', 'xtalN', 'xtalS']) {
      const c = K.ch[id], pt = c.long ? { x: c.x, y: c.y - 130 * K.flip } : c;
      assert.ok(at(pt.x, pt.y) || at(pt.x + 40, pt.y) || at(pt.x, pt.y + 40), `${name}: ${id} reached on foot`);
    }
    // the lake: water, deep in the middle, glowing (the kit's lake), stalagmites standing in it
    const lake = K.kit.lakes[0];
    assert.equal(cellAtPx(L, lake.x, lake.y + T32 / 2), C.RIVER);
    // the light: the lanterns (on posts, at the adit, along the drift), the light well, the crystals blue in the grottos
    assert.ok(K.lanterns.length >= 8, `${name}: lanterns ${K.lanterns.length}`);
    assert.ok(K.shafts.some((s) => s.r === N3.shafts[0][2]), `${name}: the light well`);
    assert.ok(K.glow.filter((g) => g.kind === 'crystal' && g.hue && g.big).length >= 6, `${name}: the grottos' crystals`);
    // the things stand on dry floor (the adit's portal and the fences aside), the mouth's light goes into the chamber
    for (const q of K.things) if (!/^(adit|fence|ropefence|boulder)$/.test(q.t)) assert.equal(cellAtPx(L, q.x, q.y), C.FLOOR, `${name}: ${q.t} on the floor`);
    for (const t of ['adit', 'cart', 'chest', 'barrel', 'pick', 'crates', 'brokencart', 'shroom', 'fern', 'ropefence']) assert.ok(K.things.some((q) => q.t === t), `${name}: a ${t}`);
    assert.equal(mouthsOf(K)[0].toward, 'entry');
    assert.ok(K.kit.rails[0].length > 6 && K.kit.drips.length > 10 && K.kit.puddles.length >= 3, `${name}: rails, stalactites, puddles`);
    assert.ok(K.roosts.length >= 4, `${name}: the bats' roosts`);
  }
  // mirrored: Copper Gulch's lake east of its way in, Old Granite's west... the other way round
  const og = L.caves.find((q) => q.name === 'Old Granite Mine'), cg = L.caves.find((q) => q.name === 'Copper Gulch Mine');
  assert.ok(og.kit.lakes[0].x > og.mouth.x && cg.kit.lakes[0].x < cg.mouth.x);
  assert.equal(og.ch.scene.stone, 'mine'); assert.equal(cg.ch.scene.stone, 'red');
});

test('the kit spread to the Redwood Caverns: a trestle over the great lake, crystal grottos off it, rails at the ore face', () => {
  const K = L.caves.find((q) => q.kind === 'cavern');
  assert.ok(K.kit && K.kit.trestles.length === 1);
  const tr = K.kit.trestles[0], at = onFoot(tr.x0, tr.y0);
  assert.ok(at(tr.x1, tr.y1), 'the trestle crosses the lake shore to shore');
  for (const id of ['xtalA', 'xtalB']) assert.ok(at(K.ch[id].x, K.ch[id].y), `${id} reached on foot`);
  assert.ok(K.kit.rails.length && K.things.some((q) => q.t === 'cart'), 'the ore face\'s rails and cart');
  assert.ok(K.timbers.length >= 2 && K.kit.lakes.length === 1);
});
