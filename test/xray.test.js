// The see-through outline of your figure (art v2 engine.js XRAY_FS) shows you behind buildings and other solid
// things, never behind vegetation (task #400): engine.js vegHides is its rule, run here over the plants as the game
// draws them, with you standing just behind each of their pixels.
import test from 'node:test';
import assert from 'node:assert/strict';
import { vegHides } from '../client/art2/game/engine.js';
import * as FL from '../client/art2/flora.js';
import * as RW from '../client/art2/redwoods.js';
import { coverSprite } from '../client/art2/ground.js';
import { GBuf } from '../client/art2/gbuf.js';

// the share of a sprite's upright pixels (3 px up or more) that would still show the outline of someone standing
// just behind them (3 px lower: hidden by them); low: only the pixels within `low` px of its foot
function shows(G, low = Infinity) {
  const at = (x, y) => (x < 0 || y < 0 || x >= G.w || y >= G.h || !G.col[(y * G.w + x) * 4 + 3] ? [0, 0] : [G.flag[y * G.w + x], G.z[y * G.w + x]]);
  let occ = 0, n = 0;
  for (let y = 0; y < G.h; y++) for (let x = 0; x < G.w; x++) {
    const i = y * G.w + x;
    if (!G.col[i * 4 + 3] || G.z[i] < 3 || (G.ay - y) > low) continue;
    occ++;
    if (!vegHides(at, x, y, G.z[i] - 3)) n++;
  }
  return { occ, n, k: occ ? n / occ : 0 };
}

test('ferns, bushes, flowers, grass and crops hide you without the outline', () => {
  const plants = {
    fern: FL.fern(3), swordFern: FL.swordFern(4), 'redwood sword fern': RW.swordFernArt(5), salal: FL.salal(2), huckleberry: FL.huckleberry(3),
    'wild berry': FL.wildBerry(4), rose: FL.roseBush(2), hydrangea: FL.hydrangea(3), shrub: FL.shrub(5), lavender: FL.lavender(2), foxglove: FL.foxglove(1),
    pampas: FL.pampasGrass(2), sapling: FL.sapling(3),
  };
  for (const kind of ['tuft', 'tuftTall', 'tuftDry', 'wheat', 'corn', 'reed', 'fern', 'flower', 'duneGrass']) for (let v = 0; v < 3; v++) plants[`${kind} ${v}`] = coverSprite(kind, v);
  for (const [k, G] of Object.entries(plants)) {
    const r = shows(G);
    // (a berry or a bare stem at the very foot of a bush: a pixel or two at most)
    assert.ok(r.k <= 0.002, `${k}: the outline shows through ${r.n} of its ${r.occ} pixels`);
  }
  // a hedge: its leaves hide you; its stone kerb is solid
  const H = FL.hedge(3), hedge = shows(H), kerb = shows(H, 5);
  assert.equal(hedge.n, kerb.n, 'a hedge shows the outline only through its kerb');
});

test('a tree\'s crown hides you without the outline; its trunk, like a post, still shows you behind it', () => {
  for (const [k, G] of [['street tree', FL.streetTree(3)], ['maple', FL.mapleGreen(4)], ['oak', FL.bigOak(2)], ['fir', FL.douglasFir(2)]]) {
    const all = shows(G), trunk = shows(G, 40);
    assert.ok(all.n - trunk.n <= all.occ * 0.03, `${k}: the crown (above 40 px) shows it through ${all.n - trunk.n} of ${all.occ} pixels`);
  }
});

test('buildings, walls, rocks and cars still show your outline', () => {
  const wall = new GBuf(40, 40);
  for (let y = 0; y < 40; y++) for (let x = 0; x < 40; x++) wall.put(x, y, [150, 140, 130], [0, 1, 0], 40 - y, null, 0);
  const at = (x, y) => (x < 0 || y < 0 || x >= 40 || y >= 40 ? [0, 0] : [wall.flag[y * 40 + x], wall.z[y * 40 + x]]);
  for (let y = 0; y < 37; y += 3) for (let x = 0; x < 40; x += 3) assert.equal(vegHides(at, x, y, wall.z[y * 40 + x] - 3), false);
  // a wall with a bush in front of its foot: the wall above the bush still shows you
  for (let y = 30; y < 40; y++) for (let x = 10; x < 20; x++) wall.put(x, y, [60, 120, 40], [0, 1, 0], 44 - y, null, 32);
  assert.equal(vegHides(at, 15, 20, 10), false, 'well above the bush');
  assert.equal(vegHides(at, 15, 35, 4), true, 'the bush itself');
});
