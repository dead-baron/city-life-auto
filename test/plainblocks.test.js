// No huge plain buildings (the owner, 2026-11-03: "Huge, plain buildings block the street from view and add nothing" -
// his screenshot: a blank block over half the screen). World v3's plain buildings - no sign, no place, no hand look -
// are capped (shared/map.js roofOne: a deep one is a column of lots with a paved passage between them, a wide one split
// into neighbours), and the big works and warehouses carry their firm's name (placePrefab). The measure is
// tools/plainmeasure.mjs; tools/plainblocks.mjs prints the survey. Builds World v3: run under the heavy lock.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildWorld3 } from '../server/world3.js';
import { T, TILE } from '../shared/constants.js';
import { surveyBuildings, oversized, plainRuns, PLAIN_CAP } from '../tools/plainmeasure.mjs';

const { map: M } = await buildWorld3(1337, { log: () => {} });
const S = surveyBuildings(M);

test('plain blocks: no plain building footprint over the cap', () => {
  const over = oversized(S);
  assert.equal(over.length, 0, `plain footprints over ${PLAIN_CAP} tiles: ${over.slice(0, 8).map((q) => `#${q.id} ${q.tw}x${q.th} at ${q.tx},${q.ty} (${q.src})`).join('; ')}`);
  // (and none deeper than a lot: the slivers built over were 50-109 tiles deep, one roof)
  const deep = S.list.filter((q) => q.plain && q.src.startsWith('roof') && q.th > 20);
  assert.equal(deep.length, 0, `plain roofs deeper than 20 tiles: ${deep.slice(0, 8).map((q) => `#${q.id} ${q.tw}x${q.th} at ${q.tx},${q.ty}`).join('; ')}`);
});

test('plain blocks: plain buildings never stack into one deep blank mass', () => {
  // (before: unbroken plain runs down a column of up to 146 tiles - five screens high; 678 columns over 50)
  const R = plainRuns(M, S, 20);
  assert.ok(R.longest <= 44, `the longest unbroken plain run north-south is ${R.longest} tiles`);
  assert.ok(R.runs.filter(([n]) => n > 30).length < 150, `${R.runs.filter(([n]) => n > 30).length} columns run plain over 30 tiles`);
});

test('plain blocks: a column of lots fronts onto its passages', () => {
  // each lot of a cut column but the southmost faces the passage south of it: open paving there, and drawn as a front
  let lots = 0, open = 0;
  for (const q of S.list) {
    if (!q.src.startsWith('roof') || q.back) continue;
    const b = M.buildings[q.id];
    const below = M.buildings[M.bld[M.idx(b.tx, b.ty + b.th + 3)]] || M.buildings[M.bld[M.idx(b.tx, b.ty + b.th + 4)]];
    if (!below || below.tx !== b.tx || below.tw !== b.tw || below.kind !== 'roof') continue;
    const gap = below.ty - (b.ty + b.th);
    if (gap < 3 || gap > 4) continue;
    lots++;
    let paved = 0;
    for (let x = b.tx; x < b.tx + b.tw; x++) for (let y = b.ty + b.th; y < below.ty; y++) if (M.tiles[M.idx(x, y)] === T.PLAZA) paved++;
    if (paved === b.tw * gap && q.front) open++;
  }
  assert.ok(lots > 200, `lots fronting a passage: ${lots}`);
  assert.ok(open >= lots * 0.95, `${open} of ${lots} passages paved through with the lot's front on them`);
});

test('plain blocks: the big works and warehouses carry their names', () => {
  for (const b of M.buildings) {
    if (!b || b.gone || b.prefab < 0 || b.hand || b.business || b.home !== undefined) continue;
    const key = M.prefabs[b.prefab].key;
    if ((key === 'warehouse' || key === 'industrial') && b.tw * b.th > PLAIN_CAP && M.prefabs[b.prefab].rot === 0) {
      assert.ok(b.signs.length && b.signs[0].text === b.name, `${key} #${b.id} (${b.tw}x${b.th}) has a sign with its name`);
      const p = M.pois.find((q) => q.b === b.id && q.kind === 'delivery');
      assert.ok(p && p.label === b.name, `its delivery stop is under its name (${b.name})`);
    }
  }
});

test('plain blocks: every place still stands in a building', () => {
  for (const p of M.pois) {
    if (p.b === undefined) continue;
    const b = M.buildings[p.b];
    assert.ok(b && !b.gone, `${p.kind} ${p.label}: its building #${p.b} stands`);
  }
});

// ---- Southside's shops and sheds (the owner, 2026-11-06: shared/world3-lots.js) -----------------------------------------
// The lots of the cut columns that front a real street (a main or side street along their west, east or south side)
// are a mix of rough small shops - never two neighbors alike, a kind at most its share of a block - and the lots that
// front only the passages stay sheds and garages. Port Westport stays industrial.
const { LOT_SHOPS, lotsNear, lotPoiKind } = await import('../shared/world3-lots.js');
const { shopRoom } = await import('../shared/shoprooms.js');
const { TRADES, contrast, rgbOf } = await import('../client/art2/signfont.js');
const { spotsOf } = await import('../server/systems/activities.js');
const LS = M.world3 && M.world3.lots;
const distOf = (b) => M.dist[M.idx(b.tx + (b.tw >> 1), b.ty + (b.th >> 1))];
const streetAt = (x, y) => { if (!M.inside(x, y)) return false; const i = M.idx(x, y), t = M.tiles[i]; return t === T.SIDEWALK || ((t === T.ROAD || t === T.BRIDGE) && M.roadRank[i] === 2); };
const onStreet = (b) => {
  let w = 0, e = 0, s = 0;
  for (let y = b.ty; y < b.ty + b.th; y++) { if (streetAt(b.tx - 1, y)) w++; if (streetAt(b.tx + b.tw, y)) e++; }
  for (let x = b.tx; x < b.tx + b.tw; x++) if (streetAt(x, b.ty + b.th) || streetAt(x, b.ty + b.th + 1)) s++;
  return w >= b.th * 0.5 || e >= b.th * 0.5 || s >= b.tw * 0.5;
};

test('southside lots: the street lots are a mix of rough small shops', () => {
  assert.ok(LS && LS.list.length > 50, `Southside's lots: ${LS && LS.list.length}`);
  const shops = LS.list.filter(([, k]) => k).map(([id, k]) => ({ b: M.buildings[id], k }));
  const kinds = new Set(shops.map((q) => q.k));
  assert.ok(shops.length >= 15, `Southside's lot shops: ${shops.length} (${JSON.stringify(LS.shops)})`);
  assert.ok(kinds.size >= 7, `the kinds: ${[...kinds].join(', ')}`);
  for (const k of kinds) assert.ok(shops.filter((q) => q.k === k).length <= shops.length * 0.25, `${k}: ${shops.filter((q) => q.k === k).length} of ${shops.length}`);
  for (const q of shops) {
    assert.equal(distOf(q.b), 6, `${q.b.name} is in Southside`);
    assert.ok(onStreet(q.b) && !q.b.back, `${q.b.name} #${q.b.id} fronts a street`);
    assert.ok(q.b.tw >= LOT_SHOPS[q.k].min[0] && q.b.th >= LOT_SHOPS[q.k].min[1], `${q.b.name} (${q.b.tw} x ${q.b.th}) has room for a ${q.k}`);
    // no two neighbors alike
    for (const o of shops) if (o !== q && o.k === q.k) assert.ok(!lotsNear(o.b, q.b), `${q.b.name} #${q.b.id} and ${o.b.name} #${o.b.id} are neighbors and both ${q.k}`);
    // its business: a walk-in with its trade's room, or a storefront's delivery stop
    const pois = M.pois.filter((p) => p.b === q.b.id);
    assert.equal(pois.length, 1, `${q.b.name}: one door`);
    assert.equal(pois[0].kind, lotPoiKind(q.k), `${q.b.name}: a ${lotPoiKind(q.k)}`);
    assert.equal(pois[0].label, q.b.name);
    assert.ok(q.b.signs.length === 1 && q.b.art, `${q.b.name}: its sign and its look`);
    // its sign reads: its trade said outright and not a neon board (a name's words once made 'Soap & Spin' a record
    // shop's gray-on-black neon), its own colors at least 4.5:1 (statics.js styleSign keeps them, made legible)
    const sh = q.b.art.shop;
    if (sh) {
      assert.ok(TRADES[sh.trade] && TRADES[sh.trade].face !== 'neon', `${q.b.name}: its sign's trade (${sh.trade})`);
      assert.ok(contrast(rgbOf(sh.sign.bg), sh.sign.fg) >= 4.5, `${q.b.name}: its sign's colors read`);
    }
    if (LOT_SHOPS[q.k].poi) {
      const wi = q.b.walkIn;
      assert.ok(wi && wi.south && wi.units.length === 1, `${q.b.name}: you walk in from the south`);
      const R = shopRoom(q.b, wi.units[0], 32, M);
      assert.ok(R && R.plan === (q.k === 'liquor' ? 'liquor' : q.k === 'bodega' ? 'corner' : q.k), `${q.b.name}: fitted out (${R && R.plan})`);
      const d = wi.units[0].door;
      for (let x = d.tx; x < d.tx + d.w; x++) assert.equal(M.tiles[M.idx(x, d.ty)], T.FLOOR, `${q.b.name}: its doorway`);
      assert.ok([T.PLAZA, T.SIDEWALK, T.LOT].includes(M.tiles[M.idx(d.tx, d.ty + 1)]), `${q.b.name}: its door opens onto paving`);
    } else assert.ok(!q.b.walkIn, `${q.b.name}: a storefront, not a walk-in`);
  }
  // a kind at most its share of a block (once; twice in a block of more than eight shops)
  const blk = (b) => M.blocks.findIndex((k) => k && b.tx >= k.x && b.tx < k.x + k.w && b.ty >= k.y && b.ty < k.y + k.h);
  const per = new Map();
  for (const q of shops) { const key = blk(q.b); const a = per.get(key) || []; a.push(q.k); per.set(key, a); }
  for (const [key, a] of per) for (const k of new Set(a)) assert.ok(a.filter((x) => x === k).length <= 1 + Math.floor((a.length - 1) / 8), `block ${key}: ${a.join(', ')}`);
});

test('southside lots: the lots on the passages stay sheds and garages; Port Westport stays industrial', () => {
  let sheds = 0;
  for (const [id, k] of LS.list) {
    if (k) continue;
    const b = M.buildings[id];
    assert.ok(!b.art && !b.signs.length && !b.walkIn && !M.pois.some((p) => p.b === id), `lot #${id} stays plain`);
    if (!onStreet(b)) sheds++;
  }
  assert.ok(sheds > 30, `passage lots left as sheds: ${sheds}`);
  // (no lot shop anywhere but Southside: the cut lots elsewhere - Port Westport's warehouse rows - are as they were)
  for (const b of M.buildings) if (b && b.kind === 'roof' && !b.hand && b.art && (b.arch === 'rough' || b.arch === 'garage') && b.signs.length) assert.equal(distOf(b), 6, `${b.name} #${b.id} (district ${distOf(b)})`);
});

test('southside lots: street dice down a passage or two (the existing street dice: server/systems/streetdice.js)', () => {
  const D = M.diceSpots || [];
  assert.ok(D.length >= 1 && D.length <= 2, `dice spots: ${D.length}`);
  const S = spotsOf(M).list.filter((s) => s.k === 'dice');
  for (const q of D) {
    const tx = Math.floor(q.x / 32), ty = Math.floor(q.y / 32);
    assert.equal(M.dist[M.idx(tx, ty)], 6, 'in Southside');
    assert.equal(M.tiles[M.idx(tx, ty)], T.PLAZA, 'on a passage');
    assert.ok(S.some((s) => s.x === q.x && s.y === q.y), `the crew plays there (${q.x}, ${q.y})`);
  }
});

// ---- no huge tall plain towers (the owner, 2026-11-06: "there are still a lot of really huge tall plain buildings, like
// park west tower ... make those buildings more interesting, less tall, maybe split them up into multiple buildings") -----
// shared/world3-towers.js: a big plain tower is a slim tower over its door, wings set back behind podiums of shops and
// mid-rises stepping down from it, a lower back block; a few landmarks stay (TOWER_LANDMARKS). tools/towers.mjs surveys.
const { surveyTowers } = await import('../tools/plainmeasure.mjs');
const { TOWER3, TOWER_LANDMARKS } = await import('../shared/world3-towers.js');
const TW = surveyTowers(M), TS = M.world3 && M.world3.towers;
const capPx = 26 + 56 * TOWER3.cap;

test('tall towers: no plain slab - big and tall with nothing but the towers\' kit - but the landmarks', () => {
  const slabs = TW.filter((q) => q.slab && !TOWER_LANDMARKS.includes(q.name));
  assert.deepEqual(slabs.map((q) => `#${q.id} ${q.name} ${q.tw}x${q.th} ${q.floors} fl`), [], 'plain slabs left');
  // (before: 43 - Park West Tower 48 x 46 tiles of 16 floors, Harborview Tower 65 x 59 of 15)
  assert.ok(TS && TS.split >= 35, `towers split: ${TS && TS.split}`);
  // the landmarks stand as they were planned, each one building
  for (const name of TOWER_LANDMARKS) {
    const b = M.buildings.find((q) => q && q.hand && q.name === name);
    assert.ok(b && !b.towerPart && b.art.spec.floors >= 16, `${name}: kept whole (${b && b.art.spec.floors} floors)`);
  }
  // no plain tower over the cap of floors (its crown included) or its front over the slim tower's, landmarks aside
  for (const q of TW) {
    if (!q.plain || TOWER_LANDMARKS.includes(q.name) || !q.tall) continue;
    assert.ok(q.floors <= TOWER3.cap, `#${q.id} ${q.name}: ${q.floors} floors (its crown's too)`);
    assert.ok(q.tw < TOWER3.front && q.area < TOWER3.area, `#${q.id} ${q.name}: ${q.tw} x ${q.th}`);
  }
});

test('tall towers: a split tower is several buildings of different heights, its street side shops and lobbies', () => {
  let groups = 0, shops = 0, crowns = 0, podiums = 0;
  const open = (x, y) => { const t = M.tiles[M.idx(x, y)]; return t !== T.BUILDING && t !== T.WALL && t !== T.WATER && t !== T.DEEP; };
  const firstNew = Math.min(...TS.list.flatMap((g) => g.slice(1)));
  for (const g of TS.list) {
    const P = g.map((id) => M.buildings[id]), tw = P[0];
    groups++;
    assert.ok(P.length >= 2 && P.length <= 7, `${tw.name}: ${P.length} buildings`);
    assert.ok(P.every((b) => b && !b.gone && b.towerPart && b.towerPart.of === tw.id && b.art && b.whole), `${tw.name}: its parts`);
    // one footprint, no overlaps: each part's tiles its own
    for (const b of P) for (let y = b.ty; y < b.ty + b.th; y++) for (let x = b.tx; x < b.tx + b.tw; x++) assert.equal(M.bld[M.idx(x, y)], b.id, `${b.name} at ${x},${y}`);
    // the street side: the parts on the footprint's south edge run its whole width, each fronting open ground, with a
    // shopfront or the tower's lobby
    const sy = tw.ty + tw.th, x0 = Math.min(...P.map((b) => b.tx)), x1 = Math.max(...P.map((b) => b.tx + b.tw));
    const front = P.filter((b) => b.ty + b.th === sy).sort((a, b) => a.tx - b.tx);
    assert.equal(front.reduce((a, b) => a + b.tw, 0), x1 - x0, `${tw.name}: its street side all fronts`);
    for (const b of front) {
      let o = 0; for (let x = b.tx; x < b.tx + b.tw; x++) if (open(x, sy)) o++;
      assert.ok(o >= b.tw * 0.5, `${b.name}: fronts the street (${o} of ${b.tw})`);
      assert.ok(b.art.shop && b.art.shop.kind, `${b.name}: a shopfront or a lobby`);
      if (b !== tw) { shops++; assert.ok(b.art.shop.sign && b.art.shop.sign.text, `${b.name}: its sign`); assert.ok(b.art.spec.floors <= 6, `${b.name}: low (${b.art.spec.floors})`); }
      if (b.towerPart.role === 'podium') podiums++;
    }
    for (let i = 1; i < front.length; i++) if (front[i] !== tw && front[i - 1] !== tw) assert.notEqual(front[i].art.shop.kind, front[i - 1].art.shop.kind, `${tw.name}: ${front[i - 1].name} and ${front[i].name} side by side`);
    // heights: the tower the tallest, at most the cap, the rest lower and not all one height
    const fl = (b) => b.art.spec.floors + (b.art.up ? b.art.up.floors : 0);
    assert.ok(fl(tw) <= TOWER3.cap, `${tw.name}: ${fl(tw)} floors`);
    for (const b of P.slice(1)) assert.ok(fl(b) < fl(tw), `${b.name} (${fl(b)}) under ${tw.name} (${fl(tw)})`);
    if (P.length >= 3) assert.ok(new Set(P.map(fl)).size >= 3, `${tw.name}: heights ${P.map(fl).join(', ')}`);
    if (tw.art.up) crowns++;
    // the tower keeps its door, its sign, its places and its lot: its POIs at its front, inside its span
    assert.ok(tw.door.tx >= tw.tx && tw.door.tx < tw.tx + tw.tw && tw.door.ty === sy, `${tw.name}: its door`);
    for (const p of M.pois.filter((q) => q.b === tw.id)) assert.ok(p.x >= tw.tx * TILE && p.x < (tw.tx + tw.tw) * TILE && p.y > sy * TILE - 8, `${tw.name}: ${p.kind} at its front`);
    // additive: the new parts at the end of the list, after every building the plans placed
    for (const id of g.slice(1)) assert.ok(id >= firstNew, `${tw.name}: part #${id}`);
  }
  assert.ok(M.buildings.slice(firstNew).every((b) => !b || !b.hand || b.towerPart), 'no plan building after the parts');
  assert.ok(groups >= 35 && shops >= 70 && podiums >= 25 && crowns >= 15, `groups ${groups}, street shops ${shops}, podiums ${podiums}, crowns ${crowns}`);
});

test('tall towers: no split tower\'s wall covers a place to the north of it (unless it is down to seven floors)', () => {
  // (the camera draws a tall thing up over what's north of it: a tower stands lower where its wall would hide a place)
  for (const g of TS.list) {
    const tw = M.buildings[g[0]], P = new Set(g), f = tw.art.spec.floors + (tw.art.up ? tw.art.up.floors : 0), H = 26 + 56 * f;
    assert.ok(H <= capPx, `${tw.name}: ${H} px`);
    if (f <= 7) continue;
    const hid = M.pois.filter((p) => !P.has(p.b) && p.kind !== 'delivery' && p.x >= tw.tx * TILE && p.x < (tw.tx + tw.tw) * TILE && p.y >= tw.ty * TILE - H && p.y < tw.ty * TILE);
    assert.deepEqual(hid.map((p) => `${p.kind} ${p.label}`), [], `${tw.name} (${f} floors) hides`);
  }
});
