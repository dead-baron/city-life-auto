// World v3b's shops pass (shared/world3-shops.js shops3): a district's farthest street from what it lacks gets a row of
// shops in the plain building nearest it - on a small map laid out by hand (fast: no world build; the whole world's
// coverage is test/world3server.test.js's and tools/world3b/shops.mjs').
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CityMap, BREAKABLE } from '../shared/mapcore.js';
import { T, TILE } from '../shared/constants.js';
import { shops3, placeKind3, SHOP_NEEDS, NEED_KEYS } from '../shared/world3-shops.js';
import { SHOPS } from '../shared/items.js';

function kit(m) {
  const addProp = (mm, t, x, y, solidR = 0, extra = null) => {
    const p = { t, x, y, ...(extra || {}) };
    mm.props.push(p);
    if (solidR > 0) { const e = mm.addSolidProp(x, y, solidR); e.pi = mm.props.length - 1; e.brk = BREAKABLE.has(t); mm.propSolid.set(e.pi, e); }
    return p;
  };
  const removeProps = (mm, near) => { mm.props = mm.props.filter((p) => !near(p.x, p.y)); };
  const simpleBuilding = (mm, x, y, w, h, name, kind, d) => {
    const b = { id: mm.buildings.length, prefab: -1, roof: -1, tx: x, ty: y, tw: w, th: h, kind, name, business: null, signs: [] };
    mm.buildings.push(b);
    for (let ty = y; ty < y + h; ty++) for (let tx = x; tx < x + w; tx++) { mm.set(tx, ty, T.BUILDING); mm.bld[mm.idx(tx, ty)] = b.id; }
    return b;
  };
  const wallAtm = (b, x) => { const y = (b.ty + b.th) * TILE; addProp(m, 'atmw', x, y + 5, 11); const poi = { id: m.pois.length, kind: 'atm', label: 'ATM', x, y: y + 28, r: 36 }; m.pois.push(poi); return poi; };
  return { addProp, removeProps, simpleBuilding, wallAtm };
}

// 120 x 40 tiles of Midtown (district 1): a street (rows 20-22) with pavements (19 and 23), a row of plain buildings
// along its north side (their fronts on the pavement), a home among them
function midtown() {
  const m = new CityMap(1, 120, 40);
  m.tiles.fill(T.GRASS);
  m.dist.fill(1);
  for (let x = 0; x < 120; x++) { m.set(x, 19, T.SIDEWALK); m.set(x, 23, T.SIDEWALK); for (let y = 20; y <= 22; y++) { m.set(x, y, T.ROAD); m.roadRank[m.idx(x, y)] = 2; } }
  const H = kit(m);
  for (let k = 0; k < 6; k++) { const b = H.simpleBuilding(m, 4 + k * 18, 8, 15, 11, 'Building', 'roof', 1); b.kind = 'roof'; }
  m.buildings[2].home = 0;
  m.homes.push({ id: 0, b: 2, x: m.buildings[2].tx * TILE + 200, y: 19.5 * TILE, price: 25000 });
  m.pois.push({ id: 0, kind: 'home', home: 0, label: 'Midtown House #1', x: m.buildings[2].tx * TILE + 200, y: 19.5 * TILE, r: 40, b: 2 });
  return { m, H };
}

test('the districts\' kinds: the city, the towns, the beach towns, the villages, the wild', () => {
  assert.deepEqual([1, 4, 28, 57, 61, 31, 10, 59, 43, 65, 47, 49, 52, 64].map(placeKind3), ['city', 'city', 'city', 'town', 'town', 'town', 'beach', 'beach', 'village', 'village', 'wild', 'wild', 'wild', 'wild']);
  for (const k of NEED_KEYS) for (const kind of SHOP_NEEDS[k]) if (kind !== 'atm' && kind !== 'bank') assert.ok(SHOPS[kind], `${kind}: a menu to buy from`);
});

test('a district with nothing to buy: a row of shops in a plain building - a gun shop, a hardware store, a corner store, an ATM - each door on the pavement', () => {
  const { m, H } = midtown();
  const homesBefore = JSON.stringify(m.homes);
  const out = shops3(m, H);
  const mine = m.pois.filter((p) => p.own);
  const kinds = new Set(mine.map((p) => p.kind));
  for (const k of ['gunshop', 'hardware', 'convenience']) assert.ok(kinds.has(k), `a ${k} (${JSON.stringify(out)})`);
  assert.ok(m.pois.some((p) => p.kind === 'atm'), 'an ATM');
  for (const p of mine) {
    const b = m.buildings[p.b];
    assert.ok(b && b.shop3 && b.home === undefined, `${p.label} in a plain building, not a home`);
    assert.equal(m.tileAtPx(p.x, p.y), T.SIDEWALK, `${p.label}'s door on the pavement`);
    assert.ok(b.signs.some((s) => s.x >= b.tx * TILE && s.x <= (b.tx + b.tw) * TILE), `${p.label} signed`);
    assert.equal(p.r, 44);
  }
  assert.equal(new Set(mine.map((p) => p.label)).size, mine.length, 'each its own name');
  assert.equal(JSON.stringify(m.homes), homesBefore, 'the homes as they were');
  assert.equal(m.buildings[2].kind, 'roof', 'the home is not a shop');
  // and done once: a second pass over the same map finds every need met
  const again = shops3(m, H);
  assert.equal(again.rows + again.built + again.carts + again.kiosks, 0, JSON.stringify(again));
});
