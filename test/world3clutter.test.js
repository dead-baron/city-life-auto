// World v3b's last pass (shared/world3-clutter.js clearClutter3): nothing blocking on a street, a pavement, the track or
// a door - on a small map laid out by hand (fast: no world build; the whole world's check is test/world3server.test.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CityMap, BREAKABLE } from '../shared/mapcore.js';
import { T, TILE } from '../shared/constants.js';
import { clearClutter3, clutterOn, TRACK_CLEAR } from '../shared/world3-clutter.js';

// map.js's own: drop the props at the spots `near` says, re-index what's left and their solid entries
function removeProps(m, near) {
  const keep = [], remap = new Map(), gone = new Set();
  m.props.forEach((pr, i) => { if (near(pr.x, pr.y)) { gone.add(pr); return; } remap.set(i, keep.length); keep.push(pr); });
  if (!gone.size) return;
  m.props = keep;
  m.lamps = m.lamps.filter((l) => !gone.has(l));
  m.propSolid = new Map();
  for (const [k, arr] of m.solidProps) {
    const kept = arr.filter((e) => (e.pi < 0 ? !near(e.x, e.y) : remap.has(e.pi)));
    for (const e of kept) if (e.pi >= 0) { e.pi = remap.get(e.pi); m.propSolid.set(e.pi, e); }
    if (kept.length) m.solidProps.set(k, kept); else m.solidProps.delete(k);
  }
}
function addProp(m, t, x, y, solidR = 0, extra = null) {
  const p = { t, x, y, ...(extra || {}) };
  m.props.push(p);
  if (solidR > 0) { const e = m.addSolidProp(x, y, solidR); e.pi = m.props.length - 1; e.brk = BREAKABLE.has(t); m.propSolid.set(e.pi, e); }
  if (t === 'lamp') m.lamps.push(p);
  return p;
}
const at = (tx, ty) => [(tx + 0.5) * TILE, (ty + 0.5) * TILE];

// 60 x 50 tiles of grass: a street (rows 10-12) with pavements (9 and 13), an alley (column 40, rows 14-24) between two
// buildings, a shop with its door on the pavement, a track along row 35 (x from 0 to 60 tiles), a field north of row 30
function town() {
  const m = new CityMap(1, 60, 50);
  m.tiles.fill(T.GRASS);
  for (let x = 0; x < 60; x++) { m.set(x, 9, T.SIDEWALK); m.set(x, 13, T.SIDEWALK); for (let y = 10; y <= 12; y++) { m.set(x, y, T.ROAD); m.roadRank[m.idx(x, y)] = 2; } }
  for (let y = 14; y <= 24; y++) { m.set(40, y, T.ROAD); m.roadRank[m.idx(40, y)] = 1; m.set(39, y, T.BUILDING); m.set(41, y, T.BUILDING); }
  for (let y = 2; y <= 8; y++) for (let x = 20; x <= 27; x++) m.set(x, y, T.BUILDING);
  m.buildings.push({ id: 0, prefab: -1, tx: 20, ty: 2, tw: 8, th: 7, kind: 'strip', name: 'Corner Shop', signs: [], door: { tx: 23, ty: 9 } });
  m.pois.push({ id: 0, kind: 'convenience', label: 'Corner Shop', x: 23.5 * TILE, y: 9.7 * TILE, r: 44, b: 0 });
  const pts = [];
  for (let x = 0; x <= 60 * TILE; x += 8) pts.push({ x, y: 35 * TILE, s: x });
  m.rails = [{ name: 'Test Line', pts, stations: [] }];
  m.fields = [{ x: 5 * TILE, y: 14 * TILE, w: 20 * TILE, h: 10 * TILE }];   // (its fence row, 10 px north: the pavement)
  m.signals = [];
  return m;
}

test('the guard: street furniture stays on the pavement, the clutter goes; a lamp on the roadway moves to the kerb', () => {
  const m = town();
  const keep = [
    addProp(m, 'trashcan', ...at(5, 13), 6), addProp(m, 'bench_m', ...at(8, 9), 10), addProp(m, 'tree_a', ...at(30, 20), 12),
    addProp(m, 'dump_g', ...at(40, 18), 14), addProp(m, 'lamp', ...at(12, 13)),
  ];
  const drop = [
    addProp(m, 'crates', ...at(14, 13), 12), addProp(m, 'tires', ...at(16, 9), 10), addProp(m, 'dump_b', ...at(18, 11), 16),
    addProp(m, 'boulder', ...at(33, 11), 26, { s: 52 }), addProp(m, 'tree_b', ...at(40, 20), 12),   // (a tree on the alley's asphalt)
    addProp(m, 'log', ...at(30, 33), 0, { a: 1.57, len: 150 }),   // (lying north-south across the track)
    addProp(m, 'rwlog', 10 * TILE, 35 * TILE + 60, 0, { a: 0, len: 200 }),   // (a fallen giant beside the track: its trunk over the rails)
    addProp(m, 'pallet', ...at(23, 9), 10),   // (on the shop's door)
  ];
  m.addSolidProp(30.5 * TILE, 33.5 * TILE + 54, 11);   // (the log's own bare solid along its length)
  const road = addProp(m, 'lamp', ...at(45, 12));   // (on the roadway's edge: moves to the pavement)
  const before = clutterOn(m);
  assert.ok(before.length >= drop.length + 1, `${before.length} found before`);
  const out = clearClutter3(m, { removeProps });
  for (const p of keep) assert.ok(m.props.includes(p), `${p.t} at ${p.x}, ${p.y} stays`);
  for (const p of drop) assert.ok(!m.props.includes(p), `${p.t} at ${p.x}, ${p.y} goes`);
  assert.ok(m.props.includes(road), 'the lamp on the roadway is kept...');
  assert.equal(m.tileAtPx(road.x, road.y), T.SIDEWALK, '...moved onto the pavement');
  assert.ok(m.lamps.includes(road));
  assert.deepEqual(clutterOn(m), [], 'nothing left where it may not stand');
  assert.ok(Object.values(out.dropped).reduce((a, b) => a + b, 0) === drop.length, JSON.stringify(out));
  assert.deepEqual(out.moved, { lamp: 1 });
  // the solid entries follow: none left for a dropped prop, the log's bare one gone, the moved lamp's at its new spot
  const solids = [...m.solidProps.values()].flat();
  for (const e of solids) if (e.pi >= 0) assert.equal(m.props[e.pi] && Math.round(m.props[e.pi].x), Math.round(e.x));
  assert.ok(!solids.some((e) => e.pi < 0 && Math.abs(e.x - 30.5 * TILE) < 2), 'the log\'s bare solid went with it');
  // nothing's body within the track's clearance
  for (const p of m.props) assert.ok(Math.abs(p.y - 35 * TILE) > TRACK_CLEAR || p.t === 'lamp', `${p.t} clear of the track`);
});

test('the guard: a field\'s rail fence runs over open ground only; a signal pole on the roadway moves with its arm', () => {
  const m = town();
  m.fields.push({ x: 5 * TILE, y: 40 * TILE, w: 10 * TILE, h: 6 * TILE });   // (all open ground round it)
  const pole = addProp(m, 'sigpole', 50 * TILE + 16, 12 * TILE + 20, 0, { a: 1.57 });
  m.signals.push({ node: 0, edge: 0, x: pole.x, y: pole.y, hx: 50 * TILE, hy: 11 * TILE, hs: [[50 * TILE, 11 * TILE]] });
  clearClutter3(m, { removeProps });
  const [f0, f1] = m.fields;
  assert.ok(Array.isArray(f0.fence), 'the field by the street: its fence in runs');
  for (const [a, b] of f0.fence) for (let x = a; x <= b; x += 8) assert.notEqual(m.tileAtPx(x, f0.y - 10), T.SIDEWALK);
  assert.equal(f1.fence, undefined, 'a field in the open: its fence whole, as before');
  assert.equal(m.tileAtPx(pole.x, pole.y), T.SIDEWALK, 'the pole stands on the kerb');
  assert.deepEqual([m.signals[0].x, m.signals[0].y], [pole.x, pole.y], 'its signal\'s arm starts from it');
});

test('the guard: nothing grows on a dirt road\'s bed, nor on the pavement out in the country; the street trees in town stay', async () => {
  const { DISTRICTS } = await import('../shared/mapcore.js');
  const { DIRT_BED } = await import('../shared/world3-clutter.js');
  const m = town();
  const town0 = DISTRICTS.findIndex((d) => d && d.style === 'houses'), wild = DISTRICTS.findIndex((d) => d && d.style === 'rural');
  assert.ok(town0 >= 0 && wild >= 0);
  m.setDist(0, 0, 30, 50, town0); m.setDist(30, 0, 30, 50, wild);   // (the west half a town's, the east half the country's)
  // a dirt road along row 44 (its half width 40 px: the bed its tiles within 28 px of its line)
  for (let x = 0; x < 60; x++) m.set(x, 44, T.DIRT);
  m.edges = [{ id: 0, kind: 'dirt', lvl: 0, hw: 40, pts: [{ x: 0, y: 44.5 * TILE }, { x: 60 * TILE, y: 44.5 * TILE }] }];
  const drop = [addProp(m, 'tree_a', ...at(10, 44), 12), addProp(m, 'cactus', ...at(50, 44), 8), addProp(m, 'shrub_a', ...at(33, 44), 0, { sp: 'creosote' }),
    addProp(m, 'flowers_a', ...at(45, 13), 0, { sp: 'lupines' }), addProp(m, 'bush_a', ...at(50, 9), 0)];
  const keep = [addProp(m, 'tree_a', ...at(10, 13), 10), addProp(m, 'shrub_a', ...at(12, 9), 0), addProp(m, 'shrub_b', 20 * TILE, 44.5 * TILE + 40 - DIRT_BED / 2, 0),
    addProp(m, 'tree_b', ...at(40, 47), 12)];
  clearClutter3(m, { removeProps });
  for (const p of drop) assert.ok(!m.props.includes(p), `${p.t} at ${p.x / TILE}, ${p.y / TILE} goes`);
  for (const p of keep) assert.ok(m.props.includes(p), `${p.t} at ${p.x / TILE}, ${p.y / TILE} stays`);
  assert.deepEqual(clutterOn(m), []);
});

test('the guard: a handcrafted plan\'s railing or hedge stops at the street - cut back to its stretch off the roadway, or gone', () => {
  const m = town();
  const hand = new WeakSet();
  // a railing north to south across the street at column 30, a short one wholly on its roadway, a hedge out in the field
  const across = addProp(m, 'rail', 30 * TILE, 6 * TILE, 0, { tx: 0, ty: 12 * TILE });   // (rows 6 to 18: over the street, rows 10-12)
  const short = addProp(m, 'rail', 34 * TILE, 10.2 * TILE, 0, { tx: 0, ty: 1.5 * TILE });   // (wholly on the roadway)
  const clear = addProp(m, 'hedgerun', 2 * TILE, 30 * TILE, 0, { tx: 10 * TILE, ty: 0 });
  for (const p of [across, short, clear]) hand.add(p);
  clearClutter3(m, { removeProps }, hand);
  assert.ok(m.props.includes(across), 'the long railing stays...');
  for (let k = 0; k <= 8; k++) { const y = across.y + across.ty * k / 8; assert.ok(m.tileAtPx(across.x, y) !== T.ROAD, `...off the roadway (${y / TILE})`); }
  assert.ok(across.ty >= 5 * TILE, `its longer stretch kept (${across.ty / TILE} tiles)`);
  assert.ok(!m.props.includes(short), 'the one on the roadway goes');
  assert.ok(m.props.includes(clear) && clear.tx === 10 * TILE, 'one clear of the street is as it was');
});
