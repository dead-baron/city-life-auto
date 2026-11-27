// What's on the water under a deck is drawn under it (the owner, 11-25 02:36: a boat, its wake and the rings drawn over a
// road deck - "it doesn't happen on all bridges"): the bridges' own tiles were known, the water under the elevated
// highway's decks (m.deck: 6,500 tiles of it in World v3) was not. shared/mapcore.js underDeckAt; the renderer asks it
// for boats, wakes, foam and swimmers (client/art2/game/host.js _underDeck).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeWorld } from './helpers.js';
import { underDeckAt } from '../shared/mapcore.js';
import { T } from '../shared/constants.js';

test('under a bridge or the highway deck over the water; not out in the open', () => {
  const m = makeWorld().map;
  let water = null, bridge = null;
  for (let ty = m.y0 + 5; ty < m.y0 + m.h - 5 && !(water && bridge); ty++) for (let tx = m.x0 + 5; tx < m.x0 + m.w - 5; tx++) {
    const t = m.tileAt(tx, ty), i = m.idx(tx, ty);
    if (!water && t === T.WATER && !m.deck[i]) water = [tx, ty];
    if (!bridge && t === T.BRIDGE) bridge = [tx, ty];
  }
  const px = (a) => [a[0] * 32 + 16, a[1] * 32 + 16];
  assert.ok(underDeckAt(m, ...px(bridge)), 'a bridge');
  assert.ok(!underDeckAt(m, ...px(water)), 'open water');
  const i = m.idx(water[0], water[1]);
  m.deck[i] = 1;
  assert.ok(underDeckAt(m, ...px(water)), 'water under the highway deck');
  m.deck[i] = 0;
});

test('the renderer asks it for every water-level thing under a deck (boats, wakes, foam, swimmers)', () => {
  const src = readFileSync(new URL('../client/art2/game/host.js', import.meta.url), 'utf8');
  assert.ok(!/=== TT\.BRIDGE\) return true/.test(src) && !/!== TT\.BRIDGE\) E\.drawDecal/.test(src), 'no bridge-tile-only checks left');
  assert.ok((src.match(/underDeckAt\(/g) || []).length >= 4);
});
