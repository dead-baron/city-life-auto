// A sign standing on a roof is seen whole or it isn't there (the owner, 11-22, N23: "These signs on the top of these
// buildings are cut off through the roof"; client/art2/game/statics.js clearRoofSigns, the placement lint's
// roofSignCut). The rule on small sets of buildings, then in the drawn pixels: a billboard with a water tank in front
// of it is cut in the sprite (why the rule), and roofSigns says where makeBld draws each sign. The world's count is the
// lint's (test/placementlint.test.js: roofSignCut 0).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TILE } from '../shared/constants.js';
import { clearRoofSigns, hidesAt, ROOF_SIGN, roofSigns, makeStatic } from '../client/art2/game/statics.js';
import { roofDeckZ } from '../client/art2/buildings.js';
import { loadProviders } from '../client/art2/game/chunkbake.js';

const sec = (tx, ty, tw, th, floors, kit, o = {}) => ({ s: { tx, ty, tw, th, k: 0 }, spec: { w: tw * TILE, d: th * TILE, floors, style: 'brick', seed: 7, parapet: 8, ...(o.spec || {}) }, kit, lights: o.lights || [], up: o.up || null });
const one = (...built) => [{ b: { id: 1 }, built }];
const kinds = (q) => q.kit.map((k) => k[0]);

test('a point is hidden by a volume in front of it that rises over it', () => {
  // a volume [x0, x1, yn, yf, H]; a point's span xa..xb, its ground row, its height
  assert.ok(hidesAt([0, 100, 200, 300, 120], 20, 80, 150, 60), 'a taller block to the south, close enough');
  assert.ok(!hidesAt([0, 100, 200, 300, 120], 20, 80, 150, 80), 'the same block, the point too high for it at that distance');
  assert.ok(!hidesAt([0, 100, 0, 100, 500], 20, 80, 150, 10), 'a tower to the north hides nothing south of it');
  assert.ok(!hidesAt([200, 300, 200, 300, 500], 20, 80, 150, 10), 'nor one off to the side');
  assert.ok(hidesAt([0, 100, 100, 300, 200], 20, 80, 150, 100), 'the block it stands in, where that rises over it');
});

test('the rule: a roof sign with its foot hidden is taken off, the others stay', () => {
  const B = ROOF_SIGN.bill;
  // a billboard at the back of a flat roof, low units in front of it: stays
  let q = sec(10, 10, 10, 12, 2, [['bill', 160, 120], ['ac', 150, 200], ['acs', 100, 260], ['vent', 200, 300]]);
  assert.deepEqual(clearRoofSigns(one(q)), { seen: 1, cut: 0 }); assert.ok(kinds(q).includes('bill'));
  // a water tank (44 tall, the board's foot at 30) right in front of it, as close as the layout sets two pieces: off
  q = sec(10, 10, 10, 12, 2, [['bill', 160, 120], ['tank', 160, 144]]);
  assert.equal(clearRoofSigns(one(q)).cut, 1); assert.deepEqual(kinds(q), ['tank']);
  // the same tank far enough in front, or off to the side: stays
  q = sec(10, 10, 10, 12, 2, [['bill', 160, 120], ['tank', 160, 150 + 44]]); assert.equal(clearRoofSigns(one(q)).cut, 0);
  q = sec(10, 10, 14, 12, 2, [['bill', 100, 120], ['tank', 100 + B.hw + 20, 150]]); assert.equal(clearRoofSigns(one(q)).cut, 0);
  // a tank behind it: stays
  q = sec(10, 10, 10, 12, 2, [['bill', 160, 200], ['tank', 160, 120]]); assert.equal(clearRoofSigns(one(q)).cut, 0);
  // a pitched roof: no sign stands on it
  q = sec(10, 10, 10, 12, 2, [['bill', 160, 120], ['chim', 60, 60]], { spec: { pitch: 'gable' } });
  assert.equal(clearRoofSigns(one(q)).cut, 1); assert.deepEqual(kinds(q), ['chim']);
  // a taller building right behind the block to the south: off; a lower one: stays; a taller one to the north: stays
  const low = () => sec(10, 10, 10, 6, 2, [['bill', 160, 150]]);
  let a = low(); assert.equal(clearRoofSigns([{ b: { id: 1 }, built: [a] }, { b: { id: 2 }, built: [sec(10, 16, 10, 8, 6, [])] }]).cut, 1);
  a = low(); assert.equal(clearRoofSigns([{ b: { id: 1 }, built: [a] }, { b: { id: 2 }, built: [sec(10, 16, 10, 8, 2, [])] }]).cut, 0);
  a = low(); assert.equal(clearRoofSigns([{ b: { id: 1 }, built: [a] }, { b: { id: 2 }, built: [sec(10, 2, 10, 8, 6, [])] }]).cut, 0);
  // a tall one across a wide street to the south: stays (its roof doesn't reach back that far up the screen)
  a = low(); assert.equal(clearRoofSigns([{ b: { id: 1 }, built: [a] }, { b: { id: 2 }, built: [sec(10, 30, 10, 8, 4, [])] }]).cut, 0);
  // its own upper block in front of a sign on the lower deck: off; a sign up on the block: stays
  const upSpec = { w: 200, d: 120, floors: 2, style: 'brick', seed: 3, parapet: 6 };
  q = sec(10, 10, 10, 12, 2, [['bill', 160, 100]], { up: { x: 60, y: 140, spec: upSpec, kit: [['neon|BAR|1', 100, 110]] } });
  assert.equal(clearRoofSigns(one(q)).cut, 1); assert.deepEqual(kinds(q), []); assert.deepEqual(q.up.kit.map((k) => k[0]), ['neon|BAR|1']);
  // a neon name at the roof's front edge behind the big neon name on the front: off, and its glow with it
  const d = 9 * TILE, deck = roofDeckZ({ w: 320, d, floors: 1, style: 'brick', seed: 7, parapet: 8 });
  q = sec(10, 10, 10, 9, 1, [['neon|CLUB|2', 200, d - 11], ['ac', 60, 100]], { spec: { neonSigns: [{ text: 'CLUB NEON CACTUS', x: 20, v: 66, w: 280, h: 48 }] }, lights: [[200, -11 + 6, deck + 40, 160, [1, 0, 1], 1.4, 'neon'], [60, -100, 20, 50, [1, 1, 1], 1, 'lamp']] });
  assert.equal(clearRoofSigns(one(q)).cut, 1); assert.deepEqual(kinds(q), ['ac']);
  assert.deepEqual(q.lights.map((l) => l[6]), ['lamp'], 'the neon\'s light gone, the other kept');
  // the same with no big name on the front: stays, light and all
  q = sec(10, 10, 10, 9, 1, [['neon|CLUB|2', 200, d - 11]], { lights: [[200, -5, deck + 40, 160, [1, 0, 1], 1.4, 'neon']] });
  assert.equal(clearRoofSigns(one(q)).cut, 0); assert.equal(q.lights.length, 1);
  // a neon in front of a billboard hides it too
  q = sec(10, 10, 10, 12, 2, [['bill', 160, 330], ['npic|masks', 160, 12 * TILE - 11]]);
  assert.equal(clearRoofSigns(one(q)).cut, 1); assert.deepEqual(kinds(q), ['npic|masks']);
});

test('in the drawn pixels: a smokestack in front cuts the board; roofSigns says where each sign is drawn', async () => {
  await loadProviders();
  const spec = { w: 320, d: 384, floors: 2, style: 'brick', seed: 7, parapet: 8 };
  const hidden = (kit) => {
    const r = { t: 'b', spec: { ...spec }, kit }, G = makeStatic(r), out = [];
    for (const q of roofSigns(r)) {
      const s = q.s, gx = (G.ax || 0) + q.rx - s.ax, gy = G.ay - spec.d + q.ry - s.ay - q.z;
      let n = 0, hid = 0, same = 0;
      for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) {
        const i = y * s.w + x;
        if (!s.col[i * 4 + 3] || s.z[i] < q.foot) continue;
        n++;
        const j = (gy + y) * G.w + gx + x;
        if (G.z[j] > s.z[i] + q.z + 1) hid++;
        else if (G.col[j * 4] === s.col[i * 4] && G.col[j * 4 + 1] === s.col[i * 4 + 1] && G.col[j * 4 + 2] === s.col[i * 4 + 2]) same++;
      }
      out.push({ k: q.k, n, hid, same });
    }
    return out;
  };
  const [alone] = hidden([['bill', 160, 120]]);
  assert.equal(alone.hid, 0); assert.ok(alone.same > alone.n * 0.95, `the board drawn where roofSigns says (${alone.same} of ${alone.n})`);
  const [cut] = hidden([['bill', 160, 120], ['stack', 160, 136]]);
  assert.ok(cut.hid > 200, `a smokestack in front hides part of the board (${cut.hid} px): what the rule takes off`);
  let q = sec(10, 10, 10, 12, 2, [['bill', 160, 120], ['stack', 160, 136]]);
  assert.equal(clearRoofSigns(one(q)).cut, 1, 'and the rule does');
  // (the rule goes by each piece's box, so it is the stricter of the two: wherever it lets a sign stand, none of the
  // board is hidden in the drawing)
  for (const [k, ry] of [['tank', 150 + 44], ['hut', 190], ['stack', 240], ['cool', 200], ['ac', 150]]) {
    q = sec(10, 10, 10, 12, 2, [['bill', 160, 120], [k, 160, ry]]);
    if (clearRoofSigns(one(q)).cut) continue;
    const [far] = hidden([['bill', 160, 120], [k, 160, ry]]);
    assert.equal(far.hid, 0, `${k} at ${ry}: let stand by the rule, whole in the drawing`);
  }
  const [neon] = hidden([['neon|BAR|1', 160, spec.d - 11]]);
  assert.equal(neon.hid, 0); assert.ok(neon.same > neon.n * 0.9);
});
