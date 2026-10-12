// (H71) Owning a home, the small things: an apartment block's lobby you walk into (the mailboxes, the lift and the
// stairs, a door a flat along the landing - in for its owner, a look round or a purchase for one for sale, the doorbell
// for someone else's), the mail (the week's utilities bill paid, the mortgage's statement, a delivery and a coupon), the
// doorbell heard inside, a pet adopted and waiting at home, and old profiles loading as before.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer, teleport, players, store } from './helpers.js';
import { HOME_IN, HIDE_TIME_S, MAIL } from '../shared/rules.js';
import { useAt, blocked, stepInside, TILE_IN, layout, lobbyKey } from '../shared/homelayout.js';
import * as economy from '../server/systems/economy.js';
import * as homes from '../server/systems/homes.js';
import * as homeinside from '../server/systems/homeinside.js';
import * as mail from '../server/systems/mail.js';
import * as mortgage from '../server/systems/mortgage.js';
import * as pets from '../server/systems/pets.js';

const lastMenu = (conn) => [...conn.sent].reverse().find((m) => m && m.t === 'menu');
const lastHome = (conn) => [...conn.sent].reverse().find((m) => m && m.t === 'home' && m.plan);
const act = (w, p) => players.findInteraction(w, p);
function freeBlock(w) {
  return w.map.homes.find((h) => h && h.kind === 'apartment' && w.unitsOf.get(h.id) && w.unitsOf.get(h.id).every((id) => !w.homeOwner.has(id)));
}
// stand in the lobby (or a home) where useAt finds `use` (and unit n)
function standAt(w, p, use, n) {
  const h = homes.homeById(w, p.ped.home.id), L = homeinside.planFor(h);
  for (let ty = 0; ty < L.rows; ty++) for (let tx = 0; tx < L.cols; tx++) {
    const x = (tx + 0.5) * TILE_IN, y = (ty + 0.5) * TILE_IN;
    if (blocked(L, x, y)) continue;
    const u = useAt(L, x, y, HOME_IN.reach);
    if (u && u.use === use && (n == null || u.n === n)) { p.ped.home.x = x; p.ped.home.y = y; return; }
  }
  assert.fail(`no ${use} ${n ?? ''} in the ${L.key}`);
}
function intoLobby(w, q, base) {
  teleport(w, q.p.ped, base.x, base.y);
  const a = act(w, q.p);
  assert.ok(a && /lobby/.test(a.label), a && a.label);
  a.run();
}

test('the lobby plans: a door a flat along the landing, numbered in order; every door, the mailboxes and the way out in reach', () => {
  for (let n = 4; n <= 8; n++) {
    const L = layout(lobbyKey(n), 1);
    assert.equal(L.doors.length, n, `${n} doors`);
    assert.deepEqual(L.doors.map((d) => d.n), [...Array(n).keys()].map((i) => i + 1));
    assert.ok(L.pieces.some((q) => q.use === 'mail'), 'the mailboxes');
    assert.ok(L.pieces.some((q) => q.ch === 'Z'), 'the stairs');
    assert.ok(L.grid[0].includes('E'), 'the lift');
    // walk from just inside the front door to every door's spot and to the mailboxes
    const goals = [...L.doors.map((d) => ({ use: 'unit', n: d.n })), { use: 'mail' }];
    for (const g of goals) {
      const s = { x: L.spawn.x, y: L.spawn.y, a: 0, nc: 0 };
      const tgt = g.use === 'unit' ? L.doors[g.n - 1] : L.pieces.find((q) => q.use === 'mail');
      const tx = g.use === 'unit' ? tgt.x : tgt.x + tgt.w / 2, ty = g.use === 'unit' ? tgt.y + TILE_IN : tgt.y + tgt.h + TILE_IN / 2;
      for (let i = 0; i < 400; i++) { const dx = tx - s.x, dy = ty - s.y; if (Math.hypot(dx, dy) < 6) break; stepInside(L, s, Math.abs(dy) > 4 ? 0 : dx, Math.abs(dy) > 4 ? dy : 0, 0.05, HOME_IN.walk); }
      const u = useAt(L, s.x, s.y, HOME_IN.reach);
      assert.ok(u && u.use === g.use && (g.n == null || u.n === g.n), `lobby${n}: reached ${g.use} ${g.n ?? ''} (${u && u.use} ${u && u.n})`);
    }
  }
});

test('into the lobby from the street: anyone, safe, the police kept out while they see you; out again', () => {
  const w = makeWorld();
  const base = freeBlock(w), a = joinPlayer(w, { bank: 1e6 });
  intoLobby(w, a, base);
  const s = a.p.ped.home;
  assert.ok(a.p.ped.hidden && s && s.lobby, 'in the lobby');
  assert.equal(s.id, homes.unitId(base.id, 0));
  assert.ok(homes.isProtected(w, a.p.ped), 'nobody can hurt you in here');
  const m = lastHome(a.conn);
  assert.equal(m.plan, lobbyKey(w.unitsOf.get(base.id).length));
  assert.equal(m.doors.length, w.unitsOf.get(base.id).length, 'each flat\'s door sent');
  assert.ok(m.doors.every((d) => d === 0), 'all for sale');
  // a second player in there sees the first
  const b = joinPlayer(w);
  intoLobby(w, b, base);
  w.step();
  assert.ok(lastHome(b.conn) && [...b.conn.sent].reverse().find((q) => q.t === 'home' && q.others).others.some((o) => o.n === a.p.name), 'a shared place');
  // out by the front door
  standAt(w, a.p, 'door');
  const out = act(w, a.p);
  assert.match(out.label, /street/);
  out.run();
  assert.ok(!a.p.ped.hidden && !a.p.ped.home, 'out');
  // wanted, seen: not in; wanted, out of sight: the door takes its moment
  teleport(w, a.p.ped, base.x, base.y);
  a.p.wanted = 2; a.p.seenAt = w.time;
  act(w, a.p).run();
  assert.ok(!a.p.ped.hidden, 'not with the police watching');
  a.p.seenAt = w.time - 10;
  act(w, a.p).run();
  assert.ok(a.p.ped.entering && !a.p.ped.hidden, 'slipping in');
  for (let i = 0; i < (HIDE_TIME_S + 0.5) * 20; i++) { a.p.seenAt = w.time - 10; w.step(); }
  assert.ok(a.p.ped.hidden && a.p.ped.home && a.p.ped.home.lobby, 'in, out of sight');
});

test('the doors along the landing: a look round and a purchase for one for sale, in for its owner, back on the landing', () => {
  const w = makeWorld();
  const base = freeBlock(w), a = joinPlayer(w, { bank: 1e6 }), ids = w.unitsOf.get(base.id);
  intoLobby(w, a, base);
  standAt(w, a.p, 'unit', 3);
  const sale = act(w, a.p);
  assert.match(sale.label, /Unit 3 - for sale/);
  sale.run();
  const menu = lastMenu(a.conn);
  assert.ok(menu.opts.some((o) => o.id === 'hi:ltour') && menu.opts.some((o) => o.id === 'hi:lbuy') && menu.opts.some((o) => o.id === 'hi:lmort'), 'look round, buy, a mortgage');
  economy.handleMenu(w, a.p, menu.poi, 'hi:ltour');
  assert.ok(a.p.ped.home && a.p.ped.home.tour && a.p.ped.home.id === ids[2], 'having a look round unit 3');
  homeinside.leave(w, a.p);
  assert.ok(a.p.ped.home && a.p.ped.home.lobby && a.p.ped.hidden, 'back on the landing');
  const L = homeinside.planFor(homes.homeById(w, a.p.ped.home.id));
  assert.ok(Math.abs(a.p.ped.home.x - L.doors[2].x) < 1, 'outside unit 3\'s door');
  // bought from the landing: yours, and you're in
  act(w, a.p).run();
  economy.handleMenu(w, a.p, lastMenu(a.conn).poi, 'hi:lbuy');
  assert.equal(w.homeOwner.get(ids[2]), a.p.pid);
  assert.ok(a.p.ped.home && a.p.ped.home.id === ids[2] && !a.p.ped.home.tour, 'in your new flat');
  homeinside.leave(w, a.p);
  standAt(w, a.p, 'unit', 3);
  const mine = act(w, a.p);
  assert.match(mine.label, /your door/);
  w.step();
  assert.equal([...a.conn.sent].reverse().find((q) => q.t === 'home' && q.doors).doors[2], 2, 'your own door - lit');
  mine.run();
  assert.equal(a.p.ped.home.id, ids[2], 'in again');
});

test('a second player\'s flat: nobody in, then the doorbell - heard inside - and let in from the hall table', () => {
  const w = makeWorld();
  const base = freeBlock(w), ids = w.unitsOf.get(base.id);
  const a = joinPlayer(w, { bank: 1e6, name: 'Ava' }), b = joinPlayer(w, { bank: 1e6, name: 'Bo' });
  homes.buy(w, a.p, homes.homeById(w, ids[1]), economy.payFrom);
  intoLobby(w, b, base);
  standAt(w, b.p, 'unit', 2);
  const shut = act(w, b.p);
  assert.ok(shut.passive && /nobody's in/.test(shut.label), shut.label);
  // A goes in (from the lobby, by their own door)
  intoLobby(w, a, base);
  standAt(w, a.p, 'unit', 2);
  act(w, a.p).run();
  assert.equal(a.p.ped.home.id, ids[1]);
  const ring = act(w, b.p);
  assert.match(ring.label, /ring Ava's doorbell/);
  a.conn.sent.length = 0;
  const notes = [], n0 = w.notify.bind(w);
  w.notify = (q, t, k) => { notes.push([q, t]); return n0(q, t, k); };
  ring.run();
  w.notify = n0;
  assert.ok(a.conn.sent.some((q) => q.t === 'home' && q.bell === 'Bo'), 'the bell rings inside');
  assert.ok(notes.some(([q, t]) => q === a.p && /Ding-dong! Bo is at your door/.test(t)), 'and says who');
  assert.match(act(w, b.p).label, /Waiting/);
  standAt(w, a.p, 'hall');
  act(w, a.p).run();
  const hall = lastMenu(a.conn);
  const let_ = hall.opts.find((o) => o.id === `hi:let:${b.p.pid}`);
  assert.ok(let_, 'Bo at the door, from the landing');
  economy.handleMenu(w, a.p, hall.poi, let_.id);
  assert.ok(b.p.ped.home && b.p.ped.home.id === ids[1] && b.p.ped.home.guest === a.p.pid, 'Bo is in');
  // out of a house's door in the street: the doorbell too
  const h = w.map.homes.find((q) => q && q.kind === 'house' && !w.homeOwner.has(q.id));
  homeinside.leave(w, b.p); homeinside.leave(w, b.p);
  homeinside.leave(w, a.p);
  homeinside.devIn(w, a.p, { id: h.id });
  teleport(w, b.p.ped, h.x, h.y);
  const r2 = act(w, b.p);
  assert.match(r2.label, /Ring the doorbell/);
});

test('the mail: the week\'s utilities bill, read at the lobby\'s mailbox and paid; the mortgage\'s statement; a delivery and a coupon', () => {
  const w = makeWorld();
  const base = freeBlock(w), ids = w.unitsOf.get(base.id), a = joinPlayer(w, { bank: 50000, cash: 0 });
  w.day = 100;
  mortgage.buyWith(w, a.p, homes.homeById(w, ids[3]), economy.payFrom);
  mail.newDay(w, a.p);
  assert.equal(a.prof.mailDay, 100, 'counting from the first day');
  assert.equal(mail.unread(a.prof), 0);
  // a mortgage payment: its statement
  w.day = 101;
  w.tick = 23; mortgage.update(w);
  assert.ok(a.prof.mail.some((m) => m.k === 'stmt' && /still owed/.test(m.t)), 'the statement');
  // a week on: the bill
  w.day = 100 + MAIL.week;
  mail.newDay(w, a.p);
  const bill = a.prof.mail.find((m) => m.k === 'bill');
  assert.ok(bill && bill.amt === MAIL.util && !bill.paid, 'the utilities bill');
  // at the lobby's mailbox
  intoLobby(w, a, base);
  standAt(w, a.p, 'mail');
  const box = act(w, a.p);
  assert.match(box.label, /Your mailbox - \d+ new/);
  box.run();
  const m = lastMenu(a.conn);
  const payRow = m.opts.find((o) => o.id === `hi:mpay:${bill.i}`);
  assert.ok(payRow && payRow.price === MAIL.util, 'pay it from the mailbox');
  assert.equal(mail.unread(a.prof), 0, 'read');
  const bank0 = a.prof.bank;
  economy.handleMenu(w, a.p, m.poi, payRow.id);
  assert.ok(bill.paid, 'paid');
  assert.equal(a.prof.bank, bank0 - MAIL.util);
  // someone else's mailbox: not yours to open
  const c = joinPlayer(w);
  intoLobby(w, c, base);
  standAt(w, c.p, 'mail');
  assert.ok(act(w, c.p).passive, 'only the flats\' owners');
  // a bill left unpaid: taken from the bank with the late fee when the next comes
  w.day += MAIL.week;
  mail.newDay(w, a.p);
  const b2 = a.prof.mail.filter((q) => q.k === 'bill' && !q.paid);
  assert.equal(b2.length, 1);
  const bank1 = a.prof.bank;
  w.day += MAIL.week;
  mail.newDay(w, a.p);
  assert.ok(b2[0].paid, 'the overdue one taken');
  assert.equal(a.prof.bank, bank1 - MAIL.util - MAIL.late);
  // a coupon and the furniture counter's delivery
  a.prof.coupon = MAIL.off; a.prof.cash = 10000;
  homeinside.leave(w, a.p);
  const shop = w.map.pois.find((q) => q.kind === 'hardware');
  teleport(w, a.p.ped, shop.x, shop.y);
  economy.openMenu(w, a.p, shop);
  economy.handleMenu(w, a.p, shop.id, 'furn');
  const cash0 = a.prof.cash;
  economy.handleMenu(w, a.p, shop.id, 'fb:plant');
  assert.equal(a.prof.furn.plant, 1);
  assert.ok(cash0 - a.prof.cash < 45 && !a.prof.coupon, 'the coupon used');
  assert.ok(a.prof.mail.some((q) => q.k === 'pkg' && /potted plant/.test(q.t)), 'the delivery note');
});

test('a house: the mail comes in with you, read at the hall table', () => {
  const w = makeWorld();
  const a = joinPlayer(w, { bank: 1e6 });
  const h = w.map.homes.find((q) => q && q.kind === 'house' && !w.homeOwner.has(q.id));
  homes.claim(w, a.p, h, h.price);
  mail.post(a.p, 'letter', 'Hello from the coast.');
  const notes = [], n0 = w.notify.bind(w);
  w.notify = (q, t, k) => { notes.push(t); return n0(q, t, k); };
  homeinside.devIn(w, a.p, { id: h.id });
  w.notify = n0;
  assert.ok(notes.some((t) => /pick up the mail/.test(t)), 'picked up on the way in');
  standAt(w, a.p, 'hall');
  act(w, a.p).run();
  const hall = lastMenu(a.conn);
  const row = hall.opts.find((o) => o.id === 'hi:mail');
  assert.ok(row && /1 new/.test(row.label));
  economy.handleMenu(w, a.p, hall.poi, 'hi:mail');
  assert.ok(lastMenu(a.conn).opts.some((o) => /coast/.test(o.label)), 'the letter');
});

test('a pet: brought home, offered, adopted - it waits at home on its bed and runs to greet you', () => {
  const w = makeWorld();
  const a = joinPlayer(w, { bank: 1e6 });
  const h = w.map.homes.find((q) => q && q.kind === 'house' && !w.homeOwner.has(q.id));
  homes.claim(w, a.p, h, h.price);
  let pet = null;
  for (let k = 0; k < 12 && !pet; k++) pet = pets.spawnLost(w, a.p);
  assert.ok(pet, 'a lost pet');
  pet.pet.follow = a.p.ped.id;
  const owner = w.get(pet.pet.owner);
  teleport(w, a.p.ped, owner.x, owner.y);
  pets.giveBack(w, a.p, pet);
  assert.ok(pet.pet.offer && pet.pet.offer.pid === a.p.pid, 'offered');
  teleport(w, a.p.ped, pet.x, pet.y);
  const ad = act(w, a.p);
  assert.match(ad.label, /Adopt/);
  ad.run();
  assert.equal(a.prof.pet.n, pet.pet.name);
  assert.ok(pet.removed, 'gone on ahead');
  // home: on its bed, then running to you, then by you
  homeinside.devIn(w, a.p, { id: h.id });
  const s = a.p.ped.home;
  assert.ok(s.pet && s.pet.st === 'greet', 'there');
  assert.ok(Math.hypot(s.pet.x - s.pet.bx, s.pet.y - s.pet.by) < 1, 'off its bed');
  const L = homeinside.planIn(w, h);
  assert.ok(!blocked(L, s.pet.bx, s.pet.by), 'its bed on open floor');
  const m0 = lastHome(a.conn);
  assert.ok(m0.pet && m0.pet.n === a.prof.pet.n && m0.pet.bx != null, 'the page told');
  for (let i = 0; i < 80 && s.pet.st === 'greet'; i++) w.step();
  assert.notEqual(s.pet.st, 'greet', 'it reached you');
  assert.ok(Math.hypot(s.pet.x - s.x, s.pet.y - s.y) < 40, 'right by you');
  for (let i = 0; i < 40 * 20 && s.pet.st !== 'lie'; i++) w.step();
  assert.equal(s.pet.st, 'lie', 'back to its bed');
  // a guest sees it
  const b = joinPlayer(w);
  teleport(w, b.p.ped, h.x, h.y);
  act(w, b.p).run();
  standAt(w, a.p, 'hall'); act(w, a.p).run();
  economy.handleMenu(w, a.p, lastMenu(a.conn).poi, `hi:let:${b.p.pid}`);
  w.step();
  assert.ok([...b.conn.sent].reverse().find((q) => q.t === 'home' && q.pet), 'the guest sees the pet');
});

test('old profiles load as before: no mail, no pet, no coupon', () => {
  const w = makeWorld();
  const a = joinPlayer(w, { bank: 1e6 });
  delete a.prof.mail; delete a.prof.pet; delete a.prof.coupon; delete a.prof.mailDay;
  const h = w.map.homes.find((q) => q && q.kind === 'house' && !w.homeOwner.has(q.id));
  homes.claim(w, a.p, h, h.price);
  homeinside.devIn(w, a.p, { id: h.id });
  assert.ok(!a.p.ped.home.pet, 'no pet');
  assert.equal(mail.unread(a.prof), 0);
  standAt(w, a.p, 'hall'); act(w, a.p).run();
  economy.handleMenu(w, a.p, lastMenu(a.conn).poi, 'hi:mail');
  assert.match(lastMenu(a.conn).sub, /Empty/);
  const saved = JSON.parse(JSON.stringify(a.prof));
  assert.ok(store.get(a.prof.pid), 'saved');
  void saved;
});
