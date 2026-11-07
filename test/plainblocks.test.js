// No huge plain buildings (the owner, 2026-11-03: "Huge, plain buildings block the street from view and add nothing" -
// his screenshot: a blank block over half the screen). World v3's plain buildings - no sign, no place, no hand look -
// are capped (shared/map.js roofOne: a deep one is a column of lots with a paved passage between them, a wide one split
// into neighbours), and the big works and warehouses carry their firm's name (placePrefab). The measure is
// tools/plainmeasure.mjs; tools/plainblocks.mjs prints the survey. Builds World v3: run under the heavy lock.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildWorld3 } from '../server/world3.js';
import { T } from '../shared/constants.js';
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
