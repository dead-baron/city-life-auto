// The items' pixel pictures (client/itemart.js; the owner, 11-21: the icons for items and the inventory need help).
// Every item in shared/items.js has one, on the 24 x 24 grid, with enough of it drawn to read; no two different items
// share a picture (a hide's grades and the legends' pelts are marks on a shared one).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ITEMS, WEAPONS } from '../shared/items.js';
import { itemSprite, weaponSprite, ICON_N } from '../client/itemart.js';

const key = (s) => Buffer.from(s.px.buffer, s.px.byteOffset, s.px.byteLength).toString('base64');
const drawn = (s) => { let n = 0; for (const v of s.px) if (v >>> 24) n++; return n; };

test('every item has its own picture on the 24 x 24 grid', () => {
  const seen = new Map();
  for (const id of Object.keys(ITEMS)) {
    const s = itemSprite(id);
    assert.ok(s, `${id} has a picture`);
    assert.equal(s.w, ICON_N); assert.equal(s.h, ICON_N);
    const n = drawn(s);
    assert.ok(n >= 40 && n <= ICON_N * ICON_N * 0.8, `${id}: reads on its tile (${n} pixels)`);
    if (/^legend_/.test(id)) continue;   // (the legends' white pelts: one for the hides, one for the pelts, one for the birds)
    const k = key(s);
    assert.ok(!seen.has(k), `${id} and ${seen.get(k)} share a picture`);
    seen.set(k, id);
  }
});

test('a perfect hide carries its star, a poor one its tear; what the stages add has a picture too', () => {
  const base = key(itemSprite('deerHide'));
  assert.notEqual(key(itemSprite('deerHide_1')), base); assert.notEqual(key(itemSprite('deerHide_3')), base);
  assert.notEqual(key(itemSprite('deerHide_1')), key(itemSprite('deerHide_3')));
  for (const id of ['fwrocket', 'fwfountain', 'fwcake', 'campkit', 'boombox', 'radio', 'dancemat', 'guitar', 'keytar', 'bucketdrum', 'sax', 'violin', 'tape_anything']) assert.ok(itemSprite(id), `${id} has a picture`);
  assert.equal(itemSprite('no-such-item'), null);
});

test('every weapon has its own picture', () => {
  const seen = new Map();
  for (const id of Object.keys(WEAPONS)) {
    const s = weaponSprite(id);
    assert.ok(s, `${id} has a picture`);
    assert.ok(drawn(s) >= 40, `${id} reads`);
    const k = key(s);
    assert.ok(!seen.has(k), `${id} and ${seen.get(k)} share a picture`);
    seen.set(k, id);
  }
});
