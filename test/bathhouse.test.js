// The bathhouses (the owner, 10-16: "Bathhouses and locker rooms with usable showers; NPCs going through the routine" -
// server/systems/bathhouse.js, shared/homelayout.js 'bath'): in at the door, the day paid for at the desk, the curtains
// to the locker rooms, changed at the lockers, a shower that washes the blood and the dirt off (grime.js), the bath
// after it and the refreshed stamina, the lockers keeping your weapons; the city's people through the routine, always in
// their clothes or a bathing suit; blood on you noticed by the police; the floor's art.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer, run, teleport } from './helpers.js';
import { BATH } from '../shared/rules-play.js';
import { layout, useAt, stepInside, blocked, TILE_IN } from '../shared/homelayout.js';
import { PIECES, decodeLook } from '../shared/look.js';
import * as bath from '../server/systems/bathhouse.js';
import * as grime from '../server/systems/grime.js';
import * as players from '../server/systems/players.js';
import * as economy from '../server/systems/economy.js';
import * as homeinside from '../server/systems/homeinside.js';

const lastOf = (conn, t) => [...conn.sent].reverse().find((m) => m && m.t === t);
// a bathhouse's door on the test city (World v3's two are checked in test/world3server.test.js)
function bathDoor(w, p) {
  let poi = w.map.pois.find((q) => bath.isBath(w, q));
  if (!poi) { const b = w.map.buildings.find((q) => q && q.tw >= 2); poi = { id: w.map.pois.length, kind: 'delivery', label: 'Test Baths', x: p.ped.x + 10, y: p.ped.y, r: 40, b: w.map.buildings.indexOf(b), bath: true }; w.map.pois.push(poi); }
  return poi;
}
async function walkTo(w, p, x, y) {
  for (let k = 0; k < 400; k++) {
    const s = p.ped.home, dx = x - s.x, dy = y - s.y, d = Math.hypot(dx, dy);
    if (d < 3) break;
    p.inputQ.push({ seq: p.ack + 1, bits: 0, mx: dx / d, my: dy / d, aim: 0 }); w.step();
  }
  p.inputQ.push({ seq: p.ack + 1, bits: 0, mx: 0, my: 0, aim: 0 }); w.step();
}
const walkPath = async (w, p, pts) => { for (const q of pts) await walkTo(w, p, q[0], q[1]); };
const act = (w, p) => { const a = players.findInteraction(w, p); if (a && !a.passive) a.run(); return a; };
// the tiles you can reach from the door (with or without the day paid for)
function reach(L, pass) {
  const seen = new Set(), q = [[Math.floor(L.spawn.x / TILE_IN), Math.floor(L.spawn.y / TILE_IN)]];
  while (q.length) {
    const [x, y] = q.pop(), k = x + ',' + y;
    if (seen.has(k) || x < 0 || y < 0 || x >= L.cols || y >= L.rows || blocked(L, (x + 0.5) * TILE_IN, (y + 0.5) * TILE_IN, 10, 0, pass)) continue;
    seen.add(k); q.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }
  return seen;
}

test('the plan: the lobby and its desk, the curtains, two locker rooms with their lockers, benches and showers, the bath hall', () => {
  const L = bath.hallLayout(), G = bath._test.geoOf(L);
  const uses = new Set(L.pieces.map((q) => q.use).filter(Boolean));
  for (const u of ['desk', 'locker', 'shower', 'bath', 'steam']) assert.ok(uses.has(u), `the ${u}`);
  assert.equal(L.pieces.filter((q) => q.use === 'locker').length, 2, 'the men\'s lockers and the women\'s');
  assert.ok(L.pieces.filter((q) => q.use === 'shower').length >= 6, 'showers in both locker rooms');
  assert.ok(L.pieces.filter((q) => q.ch === 'o').length >= 3, 'benches');
  assert.equal(G.sides.length, 2);
  // everything in reach once you've paid; without, the lobby only - the desk and the door
  const all = reach(L, true), lobby = reach(L, false), got = (set) => { const u = new Set(); for (const k of set) { const [x, y] = k.split(',').map(Number); const q = useAt(L, (x + 0.5) * TILE_IN, (y + 0.5) * TILE_IN, 26); if (q) u.add(q.use); } return u; };
  for (const u of ['door', 'desk', 'locker', 'shower', 'bath', 'steam']) assert.ok(got(all).has(u), `the ${u} within reach, paid`);
  const free = got(lobby);
  assert.ok(free.has('desk') && free.has('door'), 'the desk and the door, before paying');
  assert.ok(!free.has('locker') && !free.has('shower') && !free.has('bath'), `nothing past the curtains before paying (${[...free]})`);
  assert.ok(lobby.size < all.size / 3, 'the lobby a small part of it');
});

test('a day at the baths: the desk, through the curtain, changed at the locker, a shower that washes off the blood and the dirt, the bath, refreshed', async () => {
  const w = makeWorld();
  const { p, conn, prof } = joinPlayer(w, { cash: 40, bank: 0 });
  const poi = bathDoor(w, p);
  teleport(w, p.ped, poi.x, poi.y);
  const it = players.findInteraction(w, p);
  assert.match(it.label, /the bathhouse/);
  it.run();
  assert.ok(p.ped.hidden && p.ped.home && p.ped.home.bath, 'on its floor');
  assert.equal(lastOf(conn, 'home').plan, 'bath', 'the page draws the bathhouse');
  const L = bath.hallLayout(), G = bath._test.geoOf(L), S = G.sides[0];
  // the curtain holds you back until you've paid
  await walkPath(w, p, [G.deskFront, S.lobby, S.room]);
  assert.ok(p.ped.home.x > S.gate[0] - 4, `held at the curtain (${Math.round(p.ped.home.x)})`);
  await walkPath(w, p, [S.lobby, G.deskFront]);
  const desk = act(w, p);
  assert.match(desk.label, /front desk.*\$8/);
  assert.equal(prof.cash, 40 - BATH.fee, 'the fee paid');
  assert.equal(p.ped.home.pass, 1);
  assert.equal(lastOf(conn, 'home').pass, 1, 'the page knows: the curtains open to it');
  await walkPath(w, p, [S.lobby, S.gate, S.room, [S.lx, S.room[1]], [S.lx, S.locker.y + 40]]);
  // the showers want the bathing suit first
  p.ped.grime = { b: 0.8, d: 0.6 }; p.ped.bloodyFeet = 6; p.ped.bleeding = true;
  const lk = act(w, p);
  assert.match(lk.label, /locker/);
  const menu = lastOf(conn, 'menu');
  assert.ok(menu.opts.some((o) => o.id === 'ba:suit'), 'change at the locker');
  economy.handleMenu(w, p, menu.poi, 'ba:suit');
  assert.equal(p.ped.home.suit, 1, 'in your bathing suit');
  const sm = lastOf(conn, 'home');
  assert.ok(sm.suit && sm.suit.lk, 'the page draws you in it');
  const L2 = decodeLook(sm.suit.lk);
  assert.ok(L2.outfit.bottoms || L2.outfit.set, 'a bathing suit on - never less');
  const Sh = S.showers[1];
  await walkPath(w, p, [[S.lx, S.row], Sh.stand]);
  const sh = act(w, p);
  assert.match(sh.label, /shower - wash off the blood and the dirt/);
  run(w, BATH.showerS + 0.5);
  assert.equal(p.ped.grime, null, 'the blood and the dirt washed off');
  assert.equal(p.ped.bloodyFeet, 0, 'no more red footprints');
  assert.equal(p.ped.bleeding, false, 'the bleeding stopped');
  assert.equal(p.ped.home.washed, 1);
  // the bath: in, a soak, refreshed (stamina back faster: the self record's flag the page predicts with)
  await walkPath(w, p, [[S.below[0], S.row], S.below, S.door, S.above, [G.bath.x + 120, G.edgeY]]);
  const b = act(w, p);
  assert.match(b.label, /into the hot bath/);
  assert.ok(p.ped.home.seat && p.ped.home.soak, 'soaking');
  assert.ok(p.ped.home.seat.y < G.bath.y + G.bath.h && p.ped.home.seat.y > G.bath.y, 'in the water');
  p.ped.hp = 60;
  run(w, BATH.soakS + 0.5);
  assert.ok(p.ped.hp > 60, 'health back while you soak');
  assert.ok(p.ped.buffs.bath > w.time, 'refreshed');
  assert.equal(lastOf(conn, 'home').soak, 1, 'the page draws you in the water');
  // moving gets you out
  p.inputQ.push({ seq: p.ack + 1, bits: 0, mx: 0, my: 1, aim: 0 }); w.step();
  assert.ok(!p.ped.home.seat, 'out of the bath');
  homeinside.leave(w, p);
  assert.ok(!p.ped.hidden && !p.ped.home, 'out in the street');
});

test('the bath wants a shower first, the showers a bathing suit; your weapons wait in the locker and come back on the way out', async () => {
  const w = makeWorld();
  const { p, conn, prof } = joinPlayer(w, { cash: 40, bank: 0 });
  prof.weapons.pistol = 24; p.ped.mag.pistol = 12; p.ped.weapon = 'pistol';
  const poi = bathDoor(w, p);
  teleport(w, p.ped, poi.x, poi.y);
  players.findInteraction(w, p).run();
  const L = bath.hallLayout(), G = bath._test.geoOf(L), S = G.sides[1];
  await walkTo(w, p, G.deskFront[0], G.deskFront[1]); act(w, p);
  await walkPath(w, p, [S.lobby, S.gate, S.room, [S.lx, S.room[1]], [S.lx, S.locker.y + 40]]);
  act(w, p);
  const menu = lastOf(conn, 'menu');
  assert.ok(menu.opts.some((o) => o.id === 'ba:put'), 'leave your weapons in it');
  economy.handleMenu(w, p, menu.poi, 'ba:put');
  assert.equal(prof.weapons.pistol, undefined, 'the pistol in the locker');
  assert.equal(p.ped.weapon, 'fists');
  assert.ok(prof.bathLocker && prof.bathLocker.pistol === 36, 'kept on your profile (a restart can\'t lose it)');
  const Sh = S.showers[0];
  await walkPath(w, p, [[S.lx, S.row], Sh.stand]);
  assert.match(players.findInteraction(w, p).label, /bathing suit at the lockers first/, 'no shower in your clothes');
  await walkPath(w, p, [[S.below[0], S.row], S.below, S.door, S.above, [G.bath.x + 120, G.edgeY]]);
  assert.match(players.findInteraction(w, p).label, /bathing suit first/);
  await walkPath(w, p, [S.above, S.door, S.below, [S.below[0], S.row], [S.lx, S.row], [S.lx, S.locker.y + 40]]);
  act(w, p); economy.handleMenu(w, p, lastOf(conn, 'menu').poi, 'ba:suit');
  await walkPath(w, p, [[S.lx, S.row], [S.below[0], S.row], S.below, S.door, S.above, [G.bath.x + 120, G.edgeY]]);
  assert.match(players.findInteraction(w, p).label, /a shower first/, 'the house rule');
  homeinside.leave(w, p);
  run(w, 1);
  assert.equal(prof.weapons.pistol + p.ped.mag.pistol, 36, 'your pistol back as you leave, every round');
  assert.equal(prof.bathLocker, undefined);
});

test('the city\'s people through the routine: the desk, their curtain, changed at the lockers, a shower, the bath, dressed, out - never less than a bathing suit', () => {
  const w = makeWorld();
  const { p, conn } = joinPlayer(w, { cash: 40, bank: 0 });
  const poi = bathDoor(w, p);
  teleport(w, p.ped, poi.x, poi.y);
  players.findInteraction(w, p).run();
  run(w, 1);
  const h = bath.hallOf(w, poi), L = bath.hallLayout(), G = bath._test.geoOf(L);
  assert.ok(h.folk.length >= 3, `bathers in there already (${h.folk.length})`);
  const m = lastOf(conn, 'home');
  assert.ok(m.folk && m.folk.length === h.folk.length, 'the page gets them');
  assert.ok(Array.isArray(m.clerk), 'the attendant at the desk');
  // one from the door: every stage, in order, wearing what it should where it should
  const b = bath._test.newBather(w, h, G, L);
  const seen = [], wear = [];
  const inLobby = (x, y) => x > G.sides[0].gate[0] && x < G.sides[1].gate[0] && y > G.desk.y - 40;
  for (let k = 0; k < 20 * 240 && h.folk.includes(b); k++) {
    w.step();
    if (b.po !== seen[seen.length - 1] && (b.po === 'shower' || b.po === 'soak')) seen.push(b.po);
    if (b.wear !== wear[wear.length - 1]) wear.push(b.wear);
    if (inLobby(b.x, b.y)) assert.equal(b.wear, 'street', 'dressed in the lobby');
    assert.ok(b.x > 0 && b.y > 0 && b.x < L.w && b.y < L.h, 'inside');
  }
  assert.ok(!h.folk.includes(b), 'out by the door at the end');
  assert.deepEqual(seen, ['shower', 'soak'], 'a shower, then the bath');
  assert.deepEqual(wear, ['street', 'suit', 'street'], 'changed at the lockers and back');
  // every bather's suit: swim trunks or a swimsuit
  for (const f of h.folk) {
    const L2 = decodeLook(f.app.suit.lk), O = L2.outfit;
    assert.ok(O.bottoms ? PIECES[O.bottoms.id].name === 'Swim trunks' : PIECES[O.set.id].name === 'Swimsuit', 'a bathing suit');
    assert.equal(L2.body.base === 'f', !!O.set, 'the women in a swimsuit');
    if (O.bottoms) assert.ok(O.top && PIECES[O.top.id].name === 'Tank top', 'the men in a vest over their trunks');
  }
  // the routine runs only while someone's in
  homeinside.leave(w, p); run(w, 1);
  assert.equal(h.folk.length, 0, 'nobody simulated with nobody to see them');
});

test('blood and dirt on you: a beating leaves blood, a tumble dirt; the police notice, people step back; the water and a home shower wash it off', () => {
  const w = makeWorld();
  const { p, conn } = joinPlayer(w, { cash: 40, bank: 0 });
  return import('../server/systems/combat.js').then(async (combat) => {
    combat.damage(w, p.ped, 40, null, 'punch');
    assert.ok(p.ped.grime && p.ped.grime.b > 0.1, 'blood on you');
    const vehicles = await import('../server/systems/vehicles.js');
    vehicles.fling(w, p.ped, 300, 0, null, 'thrown');
    assert.ok(p.ped.grime.d > 0.2, 'dirt from the tumble');
    p.ped.hp = p.ped.maxHp;
    const b0 = p.ped.grime.b;
    grime.soil(w, p.ped, 0.6, 0);   // (as a kill up close leaves: combat.js kill)
    assert.ok(p.ped.grime.b > b0 && p.ped.grime.b >= BATH.seen, 'covered in it');
    assert.ok(p.toasts.some((t) => /covered in blood/.test(t.text)) || conn.sent.some((m) => m && JSON.stringify(m).includes('covered in blood')), 'told about it');
    // an officer close by: suspicious - not a star
    const npc = await import('../server/systems/npc.js');
    p.ped.downUntil = 0; p.ped.tumbleUntil = 0;
    const cop = npc.spawnNpc(w, 'cop', p.ped.x + 120, p.ped.y, 'cop');
    const civ = npc.spawnNpc(w, 'casual', p.ped.x + 40, p.ped.y, 'civ');
    civ.npc.state = 'wander';
    for (let k = 0; k < 40; k++) { w.step(); }
    assert.ok((p.suspicion || 0) >= 1, 'the officer eyes you');
    assert.equal(p.wanted || 0, 0, 'no star for it');
    void cop; void civ;
    // a shower at home washes it off too (grime.wash: everything)
    assert.ok(grime.wash(w, p.ped));
    assert.equal(grime.grimeWord(p.ped), '');
  });
});

test('the floor\'s art: the plan and its pieces build and light; nothing of it in the page, the renderer or the bake', async () => {
  const { BATH_MAKERS } = await import('../client/art2/props-bath.js');
  for (const [ch, make] of Object.entries(BATH_MAKERS)) {
    const G = make(ch === 'u' ? 448 : ch === 'I' ? 160 : ch === 'J' ? 128 : ch === 'f' ? 96 : ch === 'y' ? 64 : ch === 'o' ? 64 : 32, ch === 'u' || ch === 'y' ? 64 : 32, 2, 1).render(0, { px: 2 });
    let n = 0; for (let i = 3; i < G.col.length; i += 4) if (G.col[i]) n++;
    assert.ok(n > 30, `${ch}: nothing drawn`);
  }
  const prev = globalThis.document;
  globalThis.document = { createElement: () => { const c = { width: 0, height: 0, px: null }; c.getContext = () => ({ createImageData: (w2, h2) => ({ width: w2, height: h2, data: new Uint8ClampedArray(w2 * h2 * 4) }), putImageData: (id) => { c.px = id; } }); return c; } };
  try {
    const { HomeArt } = await import('../client/render/homeart2.js');
    const L = layout('bath', 2), A = new HomeArt(L, 2);
    A.work(1e9);
    for (const d of [1, 0]) { A.relight(d); let n = 0; while (!A.work(1) || A.lightJob) assert.ok(++n < 1e4, 'never done lighting'); }
    assert.ok(A.items.length > L.pieces.length, 'the walls and the furniture');
    assert.ok(A.lamps.some((l) => l.z === 60), 'the lanterns over the bath');
  } finally { globalThis.document = prev; }
  const { closure } = await import('../tools/perf.mjs');
  const page = closure(['client/boot.js', 'client/main.js']), bake = closure(['client/art2/game/worker.js'], { dynamic: true });
  const ren = closure(['client/art2/game/host.js']);
  for (const f of ['client/art2/props-bath.js', 'server/systems/bathhouse.js']) assert.ok(!page.includes(f) && !bake.includes(f) && !ren.includes(f), `${f} loaded with the page, the renderer or the bake`);
  void stepInside;
});
