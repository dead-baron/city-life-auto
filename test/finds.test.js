// The wilds' finds (Nature-D1, shared/foraging.js; laid out by shared/map.js naturalFinds; picked in
// server/systems/foraging.js): berries, herbs, wild honey, truffles, geodes, fossils, arrowheads, river mussels and their
// pearls, gold panned from the creeks, shed antlers, eagle feathers - each where it belongs, some 2,300 across the
// wilds, worth going for; some take a tool; someone buys every one but the eagle's feather.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer, teleport } from './helpers.js';
import { T, TILE } from '../shared/constants.js';
import { DISTRICTS, WATER_T } from '../shared/map.js';
import { FORAGE_KINDS, FIND_TOOLS } from '../shared/foraging.js';
import { ITEMS, SHOPS, MATERIALS } from '../shared/items.js';
import { FORAGE_REGROW_S } from '../shared/rules.js';
import { FORAGE } from '../client/art2/forage.js';
import * as foraging from '../server/systems/foraging.js';

const FINDS = ['berries', 'herbs', 'hive', 'truffle', 'geode', 'fossil', 'arrowhead', 'mussels', 'goldpan', 'antler', 'feather'];

test('every find: its item, its art, its regrowth, its tool - and someone who buys it (the eagle feather: nobody - it fletches)', () => {
  const buyers = (id) => Object.values(SHOPS).filter((S) => (S.sells || []).includes(id)).map((S) => S.title);
  for (const k of FINDS) {
    const K = FORAGE_KINDS[k];
    assert.ok(K, k);
    for (const id of [K.item, K.rare && K.rare[0], K.extra && K.extra[0]].filter(Boolean)) {
      assert.ok(ITEMS[id], `${k}: item ${id}`);
      if (id !== 'eagleFeather') assert.ok(buyers(id).length, `${k}: somebody buys ${id}`);
    }
    assert.ok(FORAGE[K.art], `${k}: drawn (${K.art})`);
    assert.ok(FORAGE_REGROW_S[k] > 0, `${k}: grows back / turns up again`);
    if (K.needs) { assert.ok(FIND_TOOLS[K.needs], `${k}: its tool`); for (const id of FIND_TOOLS[K.needs][0]) assert.ok(ITEMS[id] && ITEMS[id].tool, id); }
  }
  for (const id of ['trowel', 'goldPan']) assert.ok(Object.values(SHOPS).some((S) => (S.buy || []).some((o) => o.id === id)), `${id} for sale`);
  assert.equal(buyers('eagleFeather').length, 0, 'nobody buys an eagle feather');
  assert.ok(MATERIALS.feathers.includes('eagleFeather'), 'it fletches arrows');
  // still rare: the best of them worth a trip
  assert.ok(ITEMS.blackTruffle.sell >= 120 && ITEMS.riverPearl.sell >= 150 && ITEMS.amethystGeode.sell >= 200);
});

test('the finds laid out across the wilds: each where it belongs, never on a road or anything built', () => {
  const w = makeWorld(), m = w.map;
  const finds = m.forage.filter((f) => FINDS.includes(f.k));
  assert.ok(finds.length >= 50, `a fair number across the wilds (${finds.length})`);
  const kinds = new Set(finds.map((f) => f.k));
  for (const k of ['berries', 'herbs', 'truffle', 'antler', 'arrowhead']) assert.ok(kinds.has(k), `some ${k}`);
  const tile = (x, y) => { const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE); return m.inside(tx, ty) ? m.tiles[m.idx(tx, ty)] : -1; };
  const near = (f, r, test) => { const tx = Math.floor(f.x / TILE), ty = Math.floor(f.y / TILE); for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (m.inside(tx + dx, ty + dy) && test(m.idx(tx + dx, ty + dy))) return true; return false; };
  for (const f of finds) {
    const D = DISTRICTS[m.dist[m.idx(Math.floor(f.x / TILE), Math.floor(f.y / TILE))]];
    assert.ok(['wild', 'rural', 'desert'].includes(D.style), `${f.k} out in the wilds (${D.name})`);
    assert.ok(![T.ROAD, T.BUILDING, T.SIDEWALK, T.PLAZA, T.LOT, T.FIELD].includes(tile(f.x, f.y)), `${f.k}: not on a road or anything built`);
    if (f.k === 'goldpan' || f.k === 'mussels') assert.ok(near(f, 3, (j) => WATER_T[m.tiles[j]] && m.river[j]), `${f.k} by a creek or a river`);
    if (f.k === 'arrowhead') assert.ok(D.style === 'desert' || (m.terrainCls && m.terrainCls.at(Math.floor(f.x / TILE), Math.floor(f.y / TILE)) === 3), `an arrowhead in the desert (${D.name})`);
  }
  // spread out: nowhere a heap of them
  for (let i = 0; i < finds.length; i++) for (let j = i + 1; j < finds.length; j++) assert.ok(Math.hypot(finds[i].x - finds[j].x, finds[i].y - finds[j].y) > 100, 'spread out');
});

test('picking: a truffle wants a trowel, a geode a pickaxe; the rare and the extra now and then; the bees sting by day; then it grows back', () => {
  const w = makeWorld(), m = w.map;
  const { p } = joinPlayer(w);
  const inv = p.profile.inventory;
  // (the spots on the map, tried as each kind)
  const spot = m.forage.findIndex((f) => FINDS.includes(f.k));
  const f = m.forage[spot], k0 = f.k;
  teleport(w, p.ped, f.x, f.y + 6);
  const tryAs = (k) => { f.k = k; w.forageGone && w.forageGone.delete(spot); return foraging.interaction(w, p); };
  // no trowel: told so, nothing dug
  let it = tryAs('truffle');
  assert.match(it.label, /trowel/, 'you need a trowel');
  it.run();
  assert.ok(!(inv.blackTruffle > 0));
  inv.trowel = 1;
  it = tryAs('truffle');
  assert.doesNotMatch(it.label, /need/);
  it.run();
  assert.ok(inv.blackTruffle >= 1, 'dug up');
  assert.match(foraging.interaction(w, p).label, /already/, 'and the spot bare a while');
  assert.ok(w.forageGone.get(spot) > w.time + 600, 'a long while for a truffle');
  // a geode: a pickaxe; sometimes amethyst
  assert.match(tryAs('geode').label, /pickaxe/);
  inv.pickIron = 1;
  for (let n = 0; n < 40; n++) tryAs('geode').run();
  assert.ok(inv.geode > 0 && inv.amethystGeode > 0, `geodes, and an amethyst one (${inv.geode}, ${inv.amethystGeode})`);
  // mussels: and now and then a pearl inside
  for (let n = 0; n < 60; n++) tryAs('mussels').run();
  assert.ok(inv.riverMussels > 0 && inv.riverPearl > 0, `mussels and a pearl (${inv.riverPearl})`);
  // a hive by day: the bees may sting - never to death
  const hp0 = p.ped.hp;
  p.ped.hp = 3;
  let stung = 0;
  for (let n = 0; n < 20; n++) { const h = p.ped.hp; tryAs('hive').run(); if (p.ped.hp < h) stung++; assert.ok(p.ped.hp >= 1 && !p.ped.dead, 'stung, not killed'); }
  if (!w.clock.isNight) assert.ok(stung > 0, 'stung now and then');
  assert.ok(inv.wildHoneycomb > 0);
  p.ped.hp = hp0;
  f.k = k0;
});
