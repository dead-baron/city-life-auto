// A flat over a shop has a door of its own (the audit's lobbyDoor; shared/world3-flatdoors.js, client/art2/buildings.js
// storefront's shop.flat, client/art2/game/statics.js): the hand plans put the flat's spot at the far end of the shop's
// front and no door was drawn there - 391 fronts in World v3, 161 of them in the lint's old row. The rule on small maps,
// the door in the art, then the whole world: every such front has its pier and door, the home's spot is at it, the bake
// brings the door with the live ones. Builds World v3: run under the heavy lock.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TILE, CHUNK_TILES } from '../shared/constants.js';
import { FLATDOOR, flatDoors3, frontHomes, atFlatDoor, ownLobby, frontHeld } from '../shared/world3-flatdoors.js';
import { makeBuilding, buildingH, flatPier, shopSignFits } from '../client/art2/buildings.js';
import { F_GLASS } from '../client/art2/gbuf.js';

const F = FLATDOOR;
// a one-building map: a shop front tw tiles wide at tile 10,10 (5 deep), a home's spot at the given end tile
function stub(o) {
  const tw = o.tw || 10, b = { id: 0, tx: 10, ty: 10, tw, th: 5, name: o.name || 'Corner Shop', art: { shop: { kind: o.kind || 'mart', door: o.door || 'right', sign: { text: 'CORNER SHOP' } } } };
  const foot = (b.ty + b.th) * TILE, pois = [];
  if (o.place !== false) pois.push({ id: 0, kind: 'delivery', label: b.name, x: (b.tx + tw / 2) * TILE, y: foot - 5 * TILE, b: 0, walk: true });
  const hx = ((o.home === 'right' ? b.tx + tw - 1 : b.tx) + 0.5) * TILE, home = { id: 0, x: hx, y: foot + 0.7 * TILE, b: 0 };
  pois.push({ id: pois.length, kind: 'home', home: 0, label: o.homeName || 'Midtown Apt #1', x: hx, y: home.y, b: 0 });
  if (o.walkDoor !== undefined) b.walkIn = { south: true, units: [{ poi: 0, door: { tx: b.tx + o.walkDoor, ty: b.ty + b.th - 1, w: 2 } }] };
  if (o.back) b.back = true;
  return { buildings: [b], pois, homes: [home], props: o.atm !== undefined ? [{ t: 'atmw', x: b.tx * TILE + o.atm, y: foot + 6 }] : [] };
}

test('the rule: a pier and a door at the end of the front, the home\'s spot at it', () => {
  // the plan's end, when it's free: the shop's door on the right, the flat on the left
  let m = stub({ door: 'right', home: 'left' }), r = flatDoors3(m), b = m.buildings[0], h = m.pois.find((p) => p.kind === 'home');
  assert.deepEqual(r, { fronts: 1, made: 1, moved: 0, none: 0, lobbies: 0 });
  assert.equal(b.art.shop.flat.x, F.edge);
  assert.equal(h.x, b.tx * TILE + F.edge + F.w / 2); assert.equal(m.homes[0].x, h.x, 'the home\'s own record with it');
  assert.ok(atFlatDoor(b, h));
  // a walk-in's doorway on the flat's end: the other end
  m = stub({ home: 'right', walkDoor: 8 }); r = flatDoors3(m); b = m.buildings[0]; h = m.pois.find((p) => p.kind === 'home');
  assert.equal(r.moved, 1); assert.equal(b.art.shop.flat.x, F.edge); assert.ok(atFlatDoor(b, h));
  // a cash machine in the wall there: the other end
  m = stub({ door: 'right', home: 'left', walkDoor: 4, atm: 20 }); r = flatDoors3(m); b = m.buildings[0];
  assert.equal(r.moved, 1); assert.equal(b.art.shop.flat.x, b.tw * TILE - F.edge - F.w);
  // the pier clear of what the front holds, with window left between
  for (const o of [{ home: 'left', walkDoor: 2 }, { home: 'right', walkDoor: 6, tw: 10 }, { home: 'left', door: 'left' }]) {
    m = stub(o); flatDoors3(m); b = m.buildings[0];
    const fx = b.art.shop.flat && b.art.shop.flat.x;
    if (fx === undefined) continue;
    for (const [a, z] of frontHeld(m, b, [])) assert.ok(fx + F.w + F.pier + F.clear <= a || z + F.clear <= fx - F.pier, JSON.stringify([o, fx, a, z]));
  }
  // no room at either end (two tiles, all doorway): none, and the lint's row would stay
  m = stub({ tw: 2, walkDoor: 0 }); r = flatDoors3(m); b = m.buildings[0];
  assert.equal(r.none, 1); assert.ok(!b.art.shop.flat); assert.ok(!atFlatDoor(b, m.pois.find((p) => p.kind === 'home')));
  // a lobby with no business behind it, or one the homes are named for: the flats' own way in
  m = stub({ kind: 'lobby', place: false }); assert.equal(flatDoors3(m).lobbies, 1); assert.ok(!m.buildings[0].art.shop.flat);
  m = stub({ kind: 'lobby', name: 'Coral Court West', homeName: 'Coral Court West Apt' }); assert.equal(flatDoors3(m).lobbies, 1);
  assert.ok(ownLobby(m.buildings[0], frontHomes(m.buildings[0], m.pois.filter((p) => p.kind === 'home')), true));
  // an office's lobby front with a flat over it: a door
  m = stub({ kind: 'lobby', name: 'Clear View Optics' }); assert.equal(flatDoors3(m).made, 1);
  // a building that fronts north: its south wall is its back - nothing
  m = stub({ back: true }); assert.equal(flatDoors3(m).fronts, 0);
  // run twice: the same
  m = stub({ door: 'right', home: 'left' }); flatDoors3(m); const x1 = m.buildings[0].art.shop.flat.x, hx1 = m.homes[0].x; flatDoors3(m);
  assert.equal(m.buildings[0].art.shop.flat.x, x1); assert.equal(m.homes[0].x, hx1);
});

test('the art: wall, not glass, at the flat\'s end; a door in it; the shop\'s side as it was', () => {
  const base = { w: 320, d: 160, floors: 2, style: 'brick', seed: 7 }, shop = { kind: 'mart', door: 'right', open: true, people: 2, awning: ['#2f8a72', '#f0ece4'] };
  for (const end of ['left', 'right']) {
    const sh = { ...shop, door: end === 'left' ? 'right' : 'left' }, fx = end === 'left' ? F.edge : base.w - F.edge - F.w;
    const flat = { x: fx, w: F.w, h: F.h, pier: F.pier, c: 2 };
    const A = makeBuilding({ ...base, shop: { ...sh } }), B = makeBuilding({ ...base, shop: { ...sh, flat } });
    assert.equal(A.w, B.w); assert.equal(A.h, B.h);
    const y0 = base.d + buildingH({ ...base, shop: sh }), [p0, p1] = flatPier({ flat }, base.w);
    assert.deepEqual([p0, p1], end === 'left' ? [0, fx + F.w + F.pier] : [fx - F.pier, base.w]);
    const glass = (G, a, z) => { let n = 0; for (let y = y0 - 44; y < y0 - 8; y++) for (let x = a; x < z; x++) if (G.flag[y * G.w + x] & F_GLASS) n++; return n; };
    assert.ok(glass(A, p0, p1) > 200, `${end}: the shop's glass ran to the end of the front (${glass(A, p0, p1)})`);
    assert.equal(glass(B, p0, p1), 0, `${end}: no shop glass in the flat's pier`);
    const s0 = end === 'left' ? p1 + 2 : 40, s1 = end === 'left' ? base.w - 40 : p0 - 2;
    assert.equal(glass(B, s0, s1), glass(A, s0, s1), `${end}: the shop's own window unchanged`);
    // the door: its pixels are not the wall's (the no-flat bake's glass and riser there), a knob's brass among them
    let diff = 0, brass = 0;
    for (let y = y0 - F.h; y < y0; y++) for (let x = fx; x < fx + F.w; x++) {
      const j = (y * B.w + x) * 4;
      if (B.col[j] !== A.col[j] || B.col[j + 1] !== A.col[j + 1] || B.col[j + 2] !== A.col[j + 2]) diff++;
      if (B.col[j] === 214 && B.col[j + 1] === 176 && B.col[j + 2] === 80) brass++;
    }
    assert.ok(diff > F.w * F.h * 0.8, `${end}: a door drawn (${diff} of ${F.w * F.h} px)`);
    assert.ok(brass >= 1, `${end}: its knob`);
  }
  // the shop's board keeps to the shop's side only where its words stand as they did
  assert.ok(shopSignFits({ text: 'DELI' }, 312, 280));
  assert.ok(!shopSignFits({ text: 'MAIN LINE LIGHTING AND FIXTURES' }, 312, 90));
});

const { buildWorld3 } = await import('../server/world3.js');
const { bakeChunk, loadProviders } = await import('../client/art2/game/chunkbake.js');
const { auditRows } = await import('../tools/audit/worldrows.mjs');
const { map: M } = await buildWorld3(1337, { log: () => {} });

test('World v3: every flat over a shop has its door, and its spot is at it', () => {
  const r = M.world3.flatDoors;
  console.log('flat doors', JSON.stringify(r));
  assert.ok(r.fronts > 350, `the fronts with a flat (${r.fronts})`);
  assert.equal(r.none, 0, 'a front with no room for the flat\'s door');
  assert.equal(r.made + r.lobbies, r.fronts);
  const homesOf = new Map();
  for (const p of M.pois) if (p && p.kind === 'home' && p.b != null) { if (!homesOf.has(p.b)) homesOf.set(p.b, []); homesOf.get(p.b).push(p); }
  const atms = M.props.filter((p) => p && p.t === 'atmw' && p.inside === undefined);
  let n = 0;
  for (const b of M.buildings) {
    const sh = b && !b.gone && b.tw !== undefined && b.art && b.art.shop;
    if (!sh || !sh.flat) continue;
    n++;
    const fx = sh.flat.x, W = b.tw * TILE;
    assert.ok(fx === F.edge || fx === W - F.edge - F.w, `${b.name}: at an end of its front`);
    for (const [a, z] of frontHeld(M, b, atms)) assert.ok(fx + F.w + F.pier + F.clear <= a || z + F.clear <= fx - F.pier, `${b.name}: the flat's pier on the shop's door or an ATM (${fx}, ${a}..${z})`);
    for (const h of frontHomes(b, homesOf.get(b.id))) { assert.ok(atFlatDoor(b, h), `${h.label} at ${b.name}`); assert.equal(M.homes[h.home].x, h.x); }
  }
  assert.equal(n, r.made);
  const rows = {}, seen = {};
  auditRows(M, rows, seen);
  assert.equal(rows.lobbyDoor.length, 0, rows.lobbyDoor.slice(0, 5).map((q) => q.what).join('; '));
  assert.equal(seen.flatFronts, r.fronts, 'the lint looked at the same fronts');
});

test('World v3: the bake brings the flat\'s door with the live doors, hinged, beside the shop\'s', async () => {
  await loadProviders();
  const CH = CHUNK_TILES * TILE;
  const list = M.buildings.filter((b) => b && !b.gone && b.art && b.art.shop && b.art.shop.flat && b.walkIn && b.walkIn.south).slice(0, 2);
  assert.equal(list.length, 2);
  for (const b of list) {
    const bi = M.buildings.indexOf(b), y = (b.ty + b.th) * TILE, x = b.tx * TILE + b.art.shop.flat.x;
    const r = bakeChunk(M, Math.floor(b.tx * TILE / CH), Math.floor((y - 1) / CH), { quality: 0, seed: 1337 });
    const ds = r.live.doors.filter((d) => d[6] === bi);
    const d = ds.find((q) => q[0] === x + 2);
    assert.ok(d, `${b.name}: the flat's door among ${JSON.stringify(ds)}`);
    assert.equal(d[1], y); assert.equal(d[2], F.w - 4); assert.equal(d[4], 0, 'hinged');
    assert.ok(ds.length >= 2, 'and the shop\'s own');
    assert.ok(ds.every((q) => q === d || q[0] + q[2] + F.pier <= d[0] || d[0] + d[2] + F.pier <= q[0]), 'apart');
  }
});
