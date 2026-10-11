// Owning a home (H65): the real-estate app's listings, a look round a home for sale (in, out, bought from inside), the
// apartment blocks' units (two players in one building, each in their own), and old profiles still loading.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer, teleport, players, store } from './helpers.js';
import { WORLD_VERSION } from '../shared/constants.js';
import { HOME_IN } from '../shared/rules.js';
import { useAt, blocked, TILE_IN, layout, PLAN_KEYS } from '../shared/homelayout.js';
import * as economy from '../server/systems/economy.js';
import * as homes from '../server/systems/homes.js';
import * as homeinside from '../server/systems/homeinside.js';
import * as realestate from '../server/systems/realestate.js';
import * as phone from '../server/systems/phone.js';

const poiOf = (w, h) => w.map.pois.find((q) => q.kind === 'home' && q.home === (h.lobby ?? h.id));
const lastMenu = (conn) => [...conn.sent].reverse().find((m) => m && m.t === 'menu');
const menuAt = (w, p, conn, h) => { teleport(w, p.ped, h.x, h.y); economy.openMenu(w, p, poiOf(w, h)); return lastMenu(conn); };
function standAt(w, p, use) {
  const h = homes.homeById(w, p.ped.home.id), L = homeinside.planFor(h);
  for (let ty = 0; ty < L.rows; ty++) for (let tx = 0; tx < L.cols; tx++) {
    const x = (tx + 0.5) * TILE_IN, y = (ty + 0.5) * TILE_IN;
    if (blocked(L, x, y)) continue;
    const u = useAt(L, x, y, HOME_IN.reach);
    if (u && u.use === use) { p.ped.home.x = x; p.ped.home.y = y; return; }
  }
  assert.fail(`no ${use} in the ${L.key}`);
}

test('the apartment blocks: every one a building of 4-8 homes, unit 1 the map\'s own; ids by building, not by place', () => {
  const w = makeWorld();
  const blocks = w.map.homes.filter((h) => h && !h.gone && h.kind === 'apartment');
  assert.ok(blocks.length >= 10, 'apartment blocks on the map');
  let added = 0;
  for (const b of blocks) {
    const ids = w.unitsOf.get(b.id);
    assert.ok(ids && ids.length >= 4 && ids.length <= 8, `${b.name}: ${ids && ids.length} homes`);
    assert.equal(ids[0], b.id, 'unit 1 is the map\'s home');
    ids.slice(1).forEach((id, i) => {
      const u = homes.homeById(w, id);
      assert.equal(id, homes.unitId(b.id, i + 2));
      assert.equal(u.lobby, b.id); assert.equal(u.unit, i + 2); assert.equal(u.x, b.x); assert.equal(u.y, b.y);
      assert.ok(u.price > 0 && u.slots >= 1 && ['studio', 'apartment', 'penthouse'].includes(u.plan));
      added++;
    });
    if (ids.length >= 5) assert.equal(homes.homeById(w, ids[ids.length - 1]).plan, 'penthouse', 'the top floor');
  }
  assert.equal(added, w.units.size);
  console.log(`[apartments] ${blocks.length} blocks, ${w.units.size} new homes (${w.map.homes.filter((h) => h && !h.gone).length} on the map)`);
  // the map isn't touched: the same homes, the same pois
  assert.ok(!w.map.homes.some((h) => h && h.lobby != null), 'no unit on the map');
  // the new plans: every one walkable to all its things
  for (const key of ['studio', 'penthouse']) assert.ok(PLAN_KEYS.includes(key));
  assert.equal(layout('penthouse', 3).pieces.filter((q) => q.use === 'bed').length, 2, 'the penthouse: two bedrooms');
});

test('the real-estate app: the homes for sale with where, the price, the kind, beds, garage, yard, plan; yours with their worth', () => {
  const w = makeWorld();
  const { p, prof, conn } = joinPlayer(w, { bank: 1e6 });
  const r = phone.handle(w, p, { a: 'homes' });
  assert.equal(r.t, 'homes');
  assert.equal(r.total, realestate.allHomes(w).filter((h) => !w.homeOwner.has(h.id)).length);
  assert.ok(r.sale.length > 10 && r.sale.length <= 30);
  for (const row of r.sale) {
    assert.ok(row.n && row.p > 0 && row.k && row.w && row.pl && row.beds >= 1 && row.g >= 1 && Number.isFinite(row.x) && Number.isFinite(row.y));
    assert.ok(typeof row.d === 'string' && row.d.length, `${row.n}: a district`);
    assert.ok(Number.isInteger(row.yard));
  }
  // nearest first
  const d = (q) => Math.hypot(q.x - p.ped.x, q.y - p.ped.y);
  for (let i = 1; i < r.sale.length; i++) assert.ok(d(r.sale[i]) >= d(r.sale[i - 1]) - 1);
  // a house with a yard shows its plots; the apartments, units included
  const withYard = realestate.allHomes(w).find((h) => h.kind === 'house' && realestate.row(w, h).yard > 0);
  assert.ok(withYard, 'a house with garden plots');
  const apts = phone.handle(w, p, { a: 'homes', kind: 'apartment', sort: 'cheap' });
  assert.ok(apts.sale.every((q) => q.k === 'apartment'));
  assert.ok(apts.sale.some((q) => q.u), 'units of the blocks are listed');
  for (let i = 1; i < apts.sale.length; i++) assert.ok(apts.sale[i].p >= apts.sale[i - 1].p, 'cheapest first');
  // buy one: it's off the list and on yours, with what it's worth
  const h = w.map.homes.find((q) => q && q.kind === 'house' && !w.homeOwner.has(q.id));
  menuAt(w, p, conn, h);
  economy.handleMenu(w, p, poiOf(w, h).id, 'hbuy');
  assert.equal(w.homeOwner.get(h.id), p.pid);
  const r2 = realestate.listings(w, p);
  assert.equal(r2.total, r.total - 1);
  assert.ok(!r2.sale.some((q) => q.id === h.id));
  assert.equal(r2.mine.length, 1);
  assert.equal(r2.mine[0].id, h.id); assert.equal(r2.mine[0].worth, h.price); assert.equal(r2.mine[0].back, Math.round(h.price * 0.6));
  assert.ok(prof.homes.includes(h.id));
});

test('a look round before you buy: in as a visitor, nothing to use, out by the door; in again and bought from inside', () => {
  const w = makeWorld();
  const { p, prof, conn } = joinPlayer(w, { bank: 1e6, cash: 0 });
  const h = w.map.homes.find((q) => q && q.kind === 'house' && !w.homeOwner.has(q.id));
  const m = menuAt(w, p, conn, h);
  assert.ok(m.opts.some((o) => o.id === 'htour'), 'Take a look inside');
  economy.handleMenu(w, p, m.poi, 'htour');
  assert.ok(p.ped.hidden && p.ped.home && p.ped.home.tour && p.ped.home.id === h.id, 'in, as a visitor');
  assert.ok(!w.homeOwner.has(h.id), 'not bought');
  const sent = [...conn.sent].reverse().find((q) => q && q.t === 'home' && q.plan);
  assert.ok(sent && sent.tour === h.price && /for sale/.test(sent.name));
  // the bed, the safe: to look at, not to use
  standAt(w, p, 'bed');
  let a = players.findInteraction(w, p);
  assert.ok(a.passive && /comes with the place/.test(a.label), a.label);
  standAt(w, p, 'safe');
  assert.ok(players.findInteraction(w, p).passive);
  // the front door: the price and Buy, or out
  standAt(w, p, 'door');
  a = players.findInteraction(w, p);
  assert.ok(!a.passive && /buy/.test(a.label), a.label);
  a.run();
  let tm = lastMenu(conn);
  assert.ok(tm.opts.some((o) => o.id === 'hi:tbuy' && o.price === h.price) && tm.opts.some((o) => o.id === 'hi:tout'));
  economy.handleMenu(w, p, tm.poi, 'hi:tout');
  assert.ok(!p.ped.hidden && !p.ped.home, 'back outside');
  assert.ok(!w.homeOwner.has(h.id) && !prof.homes.includes(h.id));
  // in again, and bought at the front door
  economy.handleMenu(w, p, poiOf(w, h).id, 'htour');
  assert.ok(p.ped.home && p.ped.home.tour);
  standAt(w, p, 'door');
  players.findInteraction(w, p).run();
  tm = lastMenu(conn);
  const bank0 = prof.bank;
  economy.handleMenu(w, p, tm.poi, 'hi:tbuy');
  assert.equal(w.homeOwner.get(h.id), p.pid, 'bought from inside');
  assert.equal(prof.bank, bank0 - h.price);
  assert.ok(p.ped.hidden && p.ped.home && !p.ped.home.tour, 'still in - and it\'s yours');
  w.step();
  assert.ok(p.ped.home, 'not shown out');
  standAt(w, p, 'bed');
  a = players.findInteraction(w, p);
  assert.ok(!a.passive && /Sleep/.test(a.label), 'the bed is yours now');
});

test('a look round: not while wanted; shown out when someone else buys it meanwhile', () => {
  const w = makeWorld();
  const { p, conn } = joinPlayer(w, { bank: 1e6 });
  const { p: q } = joinPlayer(w, { bank: 1e6 });
  const h = w.map.homes.find((x) => x && x.kind === 'house' && !w.homeOwner.has(x.id));
  p.wanted = 2;
  teleport(w, p.ped, h.x, h.y);
  assert.ok(homeinside.tour(w, p, h));
  assert.ok(!p.ped.hidden);
  p.wanted = 0;
  assert.equal(homeinside.tour(w, p, h), null);
  teleport(w, q.ped, h.x, h.y);
  economy.handleMenu(w, q, poiOf(w, h).id, 'hbuy');
  assert.equal(w.homeOwner.get(h.id), q.pid);
  w.step();
  assert.ok(!p.ped.hidden && !p.ped.home, 'shown out');
  void conn;
});

test('an apartment block: one player buys a unit, a second another in the same building; each goes into their own', () => {
  const w = makeWorld();
  const a = joinPlayer(w, { bank: 1e6 }), b = joinPlayer(w, { bank: 1e6 });
  const base = w.map.homes.find((h) => h && h.kind === 'apartment' && w.unitsOf.get(h.id) && w.unitsOf.get(h.id).every((id) => !w.homeOwner.has(id)));
  const ids = w.unitsOf.get(base.id);
  const lobby = menuAt(w, a.p, a.conn, base);
  assert.match(lobby.title, /lobby/);
  assert.equal(lobby.opts.filter((o) => /^Buy Unit/.test(o.label)).length, ids.length, 'every unit for sale');
  // A: unit 3; B: the last (the penthouse)
  const u3 = homes.homeById(w, ids[2]), top = homes.homeById(w, ids[ids.length - 1]);
  economy.handleMenu(w, a.p, lobby.poi, `hu:buy:${u3.id}`);
  assert.equal(w.homeOwner.get(u3.id), a.p.pid);
  assert.ok(a.prof.homes.includes(u3.id) && a.prof.deeds[u3.id] === u3.price);
  const lb = menuAt(w, b.p, b.conn, base);
  assert.ok(!lb.opts.some((o) => o.id === `hu:buy:${u3.id}`), 'A\'s unit is off the market');
  assert.ok(lb.opts.some((o) => o.id === `hu:knock:${u3.id}` && o.dis), 'taken (nobody in)');
  economy.handleMenu(w, b.p, lb.poi, `hu:buy:${top.id}`);
  assert.equal(w.homeOwner.get(top.id), b.p.pid);
  // both go in - each into their own
  const la = menuAt(w, a.p, a.conn, base);
  assert.ok(la.opts.some((o) => o.id === `hu:in:${u3.id}`));
  economy.handleMenu(w, a.p, la.poi, `hu:in:${u3.id}`);
  assert.ok(a.p.ped.hidden && a.p.ped.home && a.p.ped.home.id === u3.id && !a.p.ped.home.tour);
  economy.handleMenu(w, b.p, menuAt(w, b.p, b.conn, base).poi, `hu:in:${top.id}`);
  assert.ok(b.p.ped.home && b.p.ped.home.id === top.id);
  w.step();
  assert.ok(a.p.ped.home && b.p.ped.home, 'both still in');
  const ma = [...a.conn.sent].reverse().find((m) => m && m.t === 'home' && m.plan), mb = [...b.conn.sent].reverse().find((m) => m && m.t === 'home' && m.plan);
  assert.equal(ma.id, u3.id); assert.equal(ma.plan, u3.plan);
  assert.equal(mb.id, top.id); assert.equal(mb.plan, 'penthouse');
  assert.ok(!ma.others.some((o) => o.n === b.p.name), 'not in each other\'s');
  // the bed is A's own: sleep there and it's where A wakes up
  standAt(w, a.p, 'bed');
  players.findInteraction(w, a.p).run();
  for (let i = 0; i < (HOME_IN.sleepS + 1) * 20; i++) w.step();
  assert.equal(a.prof.spawnHome, u3.id);
  // the hall table: the unit's own menu (its sale, its respawn point)
  standAt(w, a.p, 'hall');
  players.findInteraction(w, a.p).run();
  const hall = lastMenu(a.conn);
  assert.ok(hall.opts.some((o) => o.id === 'hi:sell' && o.label.includes(Math.round(u3.price * 0.6).toLocaleString())), 'sells for the unit\'s price');
  // a look round a third unit while they're in theirs
  const c = joinPlayer(w, { bank: 1e6 });
  const free = homes.homeById(w, ids[1]);
  economy.handleMenu(w, c.p, menuAt(w, c.p, c.conn, base).poi, `hu:tour:${free.id}`);
  assert.ok(c.p.ped.home && c.p.ped.home.tour && c.p.ped.home.id === free.id);
  // the respawn point: a unit like any home
  assert.ok(homes.spawnOptions(w, a.p).some((o) => o.id === `home:${u3.id}`));
  const at = homes.resolveSpawn(w, a.p, `home:${u3.id}`);
  assert.equal(at.x, base.x);
  // B knocks at A's door from the lobby: A's in
  homeinside.leave(w, b.p);
  const lk = menuAt(w, b.p, b.conn, base);
  assert.ok(lk.opts.some((o) => o.id === `hu:knock:${u3.id}` && !o.dis), 'A is in: knock');
  economy.handleMenu(w, b.p, lk.poi, `hu:knock:${u3.id}`);
  assert.ok(b.p.knock && b.p.knock.home === u3.id);
});

test('profiles: an old one (no units) loads with its home; a unit is kept across a restart', () => {
  const w0 = makeWorld();
  const house = w0.map.homes.find((h) => h && h.kind === 'house' && !w0.homeOwner.has(h.id));
  const base = w0.map.homes.find((h) => h && h.kind === 'apartment' && w0.unitsOf.get(h.id) && !w0.homeOwner.has(w0.unitsOf.get(h.id)[1]));
  const uid = w0.unitsOf.get(base.id)[1];
  // saved before this change: the fields it had then (no units anywhere)
  const old = store.create('01d9r0f11e' + Date.now().toString(16).padStart(14, '0'));
  Object.assign(old, { wv: WORLD_VERSION, homes: [house.id], spawnHome: house.id, deeds: { [house.id]: house.price }, bank: 500 });
  // and one that bought a unit
  const neu = store.create('0b0u9h7a' + Date.now().toString(16).padStart(16, '0'));
  Object.assign(neu, { wv: WORLD_VERSION, homes: [uid], spawnHome: uid, deeds: { [uid]: homes.homeById(w0, uid).price } });
  const w = makeWorld();   // a server starting with them in the store
  assert.equal(w.homeOwner.get(house.id), old.pid);
  assert.equal(w.homeOwner.get(uid), neu.pid);
  const j = players.join(w, { open: true, buffered: 0, sent: [], sendJSON() {}, sendText() {}, sendBinary() {}, close() {} }, neu);
  assert.deepEqual(homes.ownedHomes(w, neu).map((h) => h.id), [uid]);
  assert.equal(homes.resolveSpawn(w, j, null).x, base.x, 'wakes at the unit');
});
