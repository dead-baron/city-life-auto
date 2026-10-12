// Decorating your home (H67): the hardware store's furniture counter, the hall table's Decorate - placing a piece,
// moving it, turning it, selling it back - the doors and the things you use kept clear, the walls' paint and the
// floors kept in the profile through a rejoin.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer, teleport, players } from './helpers.js';
import { DECOR } from '../shared/rules.js';
import { layout, blocked, TILE_IN } from '../shared/homelayout.js';
import { canPlace, decorate, dims, PIECES, KINDS, roomsOf, backOf } from '../shared/homedecor.js';
import * as economy from '../server/systems/economy.js';
import * as homeinside from '../server/systems/homeinside.js';

const poiOf = (w, h) => w.map.pois.find((q) => q.kind === 'home' && q.home === h.id);
const lastMenu = (conn) => [...conn.sent].reverse().find((m) => m && m.t === 'menu');
const act = (w, p) => { const a = players.findInteraction(w, p); assert.ok(a && !a.passive, `nothing to use (${a && a.label})`); a.run(); return a.label; };
function ownHome(w, p, kind = 'house') {
  const h = w.map.homes.find((q) => q.kind === kind && !w.homeOwner.has(q.id) && !q.lobby);
  teleport(w, p.ped, h.x, h.y);
  economy.handleMenu(w, p, poiOf(w, h).id, 'hbuy');
  assert.equal(w.homeOwner.get(h.id), p.pid);
  return h;
}
// stand on tile (tx, ty) facing a way (0 east, PI/2 south, PI west, -PI/2 north)
const stand = (p, tx, ty, a) => { p.ped.home.x = (tx + 0.5) * TILE_IN; p.ped.home.y = (ty + 0.5) * TILE_IN; p.ped.home.a = a; };
const pick = (w, p, conn, id) => { const m = lastMenu(conn); assert.ok(m.opts.some((o) => o.id === id && !o.dis), `${id} not in ${m.title}: ${m.opts.map((o) => o.id + (o.dis ? '(x ' + o.note + ')' : '')).join(' ')}`); economy.handleMenu(w, p, m.poi, id); };

test('every piece has a price and a footprint; the house rule lets things in the open and keeps the doors and the bed clear', () => {
  for (const k of KINDS) { assert.ok(DECOR.price[k] > 0, `${k}: price`); assert.ok(PIECES[k].w >= 1 && PIECES[k].h >= 1); }
  assert.deepEqual(dims('couch', 1), [1, 2], 'turned, a sofa is the other way round');
  const L = layout('house', 2), none = { it: [] };
  assert.equal(canPlace(L, none, { k: 'couch', tx: 7, ty: 6, r: 0 }), null, 'a sofa in the hall');
  assert.match(canPlace(L, none, { k: 'lamp', tx: Math.floor(L.spawn.x / TILE_IN), ty: Math.floor(L.spawn.y / TILE_IN), r: 0 }), /front door/, 'not on the way in');
  assert.match(canPlace(L, none, { k: 'lamp', tx: 6, ty: 5, r: 0 }), /doorway/, 'not in a doorway');
  assert.match(canPlace(L, none, { k: 'lamp', tx: 0, ty: 3, r: 0 }), /wall/, 'not in a wall');
  // the trailer's bedroom has one way in: a lamp just inside it would cut off the bed
  const T = layout('trailer', 0);
  assert.match(canPlace(T, none, { k: 'lamp', tx: 8, ty: 3, r: 0 }), /bed|wardrobe|safe|shower/, 'the bed kept within reach');
  // a rug lies under things; a painting needs a wall behind it, not a window
  assert.equal(canPlace(L, none, { k: 'rug', tx: 2, ty: 5, r: 0 }), null);
  assert.equal(canPlace(L, none, { k: 'art', tx: 1, ty: 2, r: 3 }), null, 'on the west wall');
  assert.match(canPlace(L, none, { k: 'art', tx: 1, ty: 2, r: 0 }), /wall behind/);
  // decorated, the plan's solid where the pieces stand and walkable round them
  const D = decorate(L, { it: [{ k: 'couch', tx: 7, ty: 6, r: 0 }, { k: 'rug', tx: 2, ty: 5, r: 0 }] });
  assert.ok(D.solid(7, 6) && D.solid(8, 6) && !D.solid(2, 5), 'the sofa solid, the rug not');
  assert.ok(blocked(D, 7.5 * TILE_IN, 6.5 * TILE_IN) && !blocked(L, 7.5 * TILE_IN, 6.5 * TILE_IN));
  assert.equal(D.pieces.length, L.pieces.length + 2);
});

test('the furniture counter at the hardware store: needs a home, then the piece waits in storage', () => {
  const w = makeWorld();
  const { p, conn, prof } = joinPlayer(w, { bank: 1e6, cash: 0 });
  const shop = w.map.pois.find((q) => q.kind === 'hardware');
  assert.ok(shop, 'the city has a hardware store');
  teleport(w, p.ped, shop.x, shop.y);
  economy.openMenu(w, p, shop);
  pick(w, p, conn, 'furn');
  assert.equal(lastMenu(conn).title, 'Furniture & decor');
  assert.ok(lastMenu(conn).opts.find((o) => o.id === 'fb:couch').dis, 'no home: nothing to buy it for');
  ownHome(w, p);
  teleport(w, p.ped, shop.x, shop.y);
  economy.openMenu(w, p, shop);
  pick(w, p, conn, 'furn');
  const bank = prof.bank;
  for (const k of ['couch', 'lamp', 'walltv']) pick(w, p, conn, `fb:${k}`);
  assert.deepEqual(prof.furn, { couch: 1, lamp: 1, walltv: 1 });
  assert.equal(bank - prof.bank, DECOR.price.couch + DECOR.price.lamp + DECOR.price.walltv, 'paid from the bank');
  assert.equal(lastMenu(conn).title, 'Furniture & decor', 'the counter stays open');
  pick(w, p, conn, 'fback');
  assert.ok(lastMenu(conn).opts.some((o) => o.id === 'furn'), 'back to the hardware');
});

test('at home: decorate from the hall table - place, move, turn, sell back; the walls and the floor kept through a rejoin', () => {
  const w = makeWorld();
  const { p, conn, prof } = joinPlayer(w, { bank: 1e6 });
  const h = ownHome(w, p);
  prof.furn = { couch: 1, lamp: 1, art: 1 };
  teleport(w, p.ped, h.x, h.y);
  homeinside.goIn(w, p, h);
  homeinside.openMenu(w, p, 'hall');
  pick(w, p, conn, 'hi:deco');
  assert.ok(p.ped.home.edit, 'decorating');
  const L = homeinside.planFor(h);
  // the sofa: picked from storage, put down in the hall facing you
  stand(p, 11, 7, -Math.PI / 2);   // facing north, the tile in front (11, 6)
  assert.match(act(w, p), /Decorating/);
  pick(w, p, conn, 'hi:dpick:couch');
  const full = [...conn.sent].reverse().find((m) => m && m.t === 'home' && 'edit' in m);
  assert.equal(full.edit.k, 'couch', 'the page is told what you hold');
  act(w, p);
  pick(w, p, conn, 'hi:dput');
  let d = prof.decor[h.id];
  assert.deepEqual(d.it, [{ k: 'couch', tx: 11, ty: 6, r: 0 }]);
  assert.equal(prof.furn.couch, 0);
  assert.ok(homeinside.planIn(w, h).solid(12, 6), 'it stands there: solid');
  assert.ok([...conn.sent].reverse().find((m) => m && m.t === 'home' && m.decor).decor.it.length === 1, 'the page draws it');
  // walking into it stops you
  const s = p.ped.home;
  stand(p, 12, 7, Math.PI / 2);
  for (let i = 0; i < 20; i++) { players.queueInput(p, { seq: 9000 + i, bits: 0, mx: 0, my: -1, aim: 0 }); w.step(); }
  assert.ok(s.y - 10 >= 7 * TILE_IN - 0.5, 'the sofa holds you');
  // move it: face it, Move, walk round, put it down
  stand(p, 11, 7, -Math.PI / 2);
  act(w, p);
  pick(w, p, conn, 'hi:dmove:0');
  stand(p, 7, 7, -Math.PI / 2);
  act(w, p);
  pick(w, p, conn, 'hi:dput');
  d = prof.decor[h.id];
  assert.deepEqual(d.it[0], { k: 'couch', tx: 7, ty: 6, r: 0 }, 'moved');
  assert.ok(!homeinside.planIn(w, h).solid(12, 6) && homeinside.planIn(w, h).solid(8, 6));
  // turn it where it stands: the other way round
  stand(p, 8, 7, -Math.PI / 2);
  act(w, p);
  pick(w, p, conn, 'hi:dspin:0');
  d = prof.decor[h.id];
  assert.equal(d.it[0].r, 1);
  assert.ok(homeinside.planIn(w, h).solid(7, 6) && homeinside.planIn(w, h).solid(7, 7) && !homeinside.planIn(w, h).solid(8, 6), 'turned: one wide, two deep');
  // a lamp on the way in from the front door: refused
  stand(p, Math.floor(L.spawn.x / TILE_IN) + 1, Math.floor(L.spawn.y / TILE_IN), Math.PI);
  act(w, p);
  pick(w, p, conn, 'hi:dpick:lamp');
  act(w, p);
  const put = lastMenu(conn).opts.find((o) => o.id === 'hi:dput');
  assert.ok(put.dis && /front door/.test(put.note), `the door kept clear (${put.note})`);
  economy.handleMenu(w, p, lastMenu(conn).poi, 'hi:dput');
  assert.equal(prof.decor[h.id].it.length, 1, 'not put down');
  pick(w, p, conn, 'hi:dstore');
  assert.equal(prof.furn.lamp, 1, 'still in storage');
  // sell the sofa back
  stand(p, 8, 7, Math.PI);
  act(w, p);
  const cash = prof.cash;
  pick(w, p, conn, 'hi:dsell:0');
  assert.equal(prof.cash - cash, backOf('couch'));
  assert.equal(backOf('couch'), Math.round(DECOR.price.couch * DECOR.sellBack));
  assert.equal(prof.decor[h.id].it.length, 0);
  // paint the living room, a new floor
  stand(p, 2, 6, 0);
  act(w, p);
  pick(w, p, conn, 'hi:dpaint');
  assert.equal(lastMenu(conn).title, 'This room');
  const money = prof.cash + prof.bank;
  pick(w, p, conn, 'hi:dwall:2');
  pick(w, p, conn, 'hi:dfloor:4');
  assert.equal(money - prof.cash - prof.bank, DECOR.paint + DECOR.floor);
  const room = roomsOf(L).at(2, 6);
  assert.equal(prof.decor[h.id].wall[room], 2);
  assert.equal(prof.decor[h.id].floor[room], 4);
  assert.equal(homeinside.planIn(w, h).floorAt(2, 6)[0], 'Marble');
  pick(w, p, conn, 'hi:dback');
  pick(w, p, conn, 'hi:dend');
  assert.ok(!p.ped.home.edit, 'done decorating');
  // out, leave the game, come back: still painted
  homeinside.leave(w, p);
  players.leave(w, p);
  const p2 = players.join(w, conn, prof);
  teleport(w, p2.ped, h.x, h.y);
  p2.ped.protectUntil = 0;
  homeinside.goIn(w, p2, h);
  const m = [...conn.sent].reverse().find((q) => q && q.t === 'home' && q.decor);
  assert.equal(m.decor.wall[room], 2, 'the paint kept across a rejoin');
  assert.ok(homeinside.planIn(w, h).paintAt(2, 5), 'the walls by the living room painted');
});

test('a sold home\'s furniture goes back into storage; a guest can\'t decorate', () => {
  const w = makeWorld();
  const { p, conn, prof } = joinPlayer(w, { bank: 1e6 });
  const h = ownHome(w, p);
  prof.decor = { [h.id]: { it: [{ k: 'lamp', tx: 2, ty: 6, r: 0 }], wall: {}, floor: {} } };
  prof.furn = {};
  teleport(w, p.ped, h.x, h.y);
  homeinside.goIn(w, p, h);
  homeinside.openMenu(w, p, 'hall');
  pick(w, p, conn, 'hi:sell');
  assert.ok(!w.homeOwner.has(h.id));
  assert.equal(prof.furn.lamp, 1, 'the lamp back in storage');
  assert.ok(!prof.decor[h.id]);
});
