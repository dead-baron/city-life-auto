// Inside your own home (H62): in and out by the front door, the walls, the bed, the safe, the wardrobe, the fridge, the
// garage - and nobody else sees you in there.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer, run, teleport, players } from './helpers.js';
import { K, DAY_PART_S } from '../shared/constants.js';
import { IN } from '../shared/input.js';
import { HOME_IN } from '../shared/rules.js';
import { layout, PLAN_KEYS, useAt, blocked, TILE_IN, planOf } from '../shared/homelayout.js';
import * as economy from '../server/systems/economy.js';
import * as combat from '../server/systems/combat.js';
import * as homes from '../server/systems/homes.js';
import * as homeinside from '../server/systems/homeinside.js';

const poiOf = (w, h) => w.map.pois.find((q) => q.kind === 'home' && q.home === h.id);
function ownHome(w, p, kind = 'house') {
  const h = w.map.homes.find((q) => q.kind === kind && !w.homeOwner.has(q.id));
  teleport(w, p.ped, h.x, h.y);
  economy.handleMenu(w, p, poiOf(w, h).id, 'hbuy');
  assert.equal(w.homeOwner.get(h.id), p.pid);
  return h;
}
let seq = 1000;
function walk(w, p, mx, my, s, bits = 0) {
  for (let i = 0; i < Math.round(s * 20); i++) { players.queueInput(p, { seq: ++seq, bits, mx, my, aim: 0 }); w.step(); }
  players.queueInput(p, { seq: ++seq, bits: 0, mx: 0, my: 0, aim: 0 }); w.step();
}
const act = (w, p) => { const a = players.findInteraction(w, p); assert.ok(a && !a.passive, `nothing to use (${a && a.label})`); a.run(); return a.label; };
// stand next to the first piece of `use` in the plan (a free spot within reach of it)
function standAt(w, p, use) {
  const h = w.map.homes[p.ped.home.id], L = homeinside.planFor(h);
  for (let ty = 0; ty < L.rows; ty++) for (let tx = 0; tx < L.cols; tx++) {
    const x = (tx + 0.5) * TILE_IN, y = (ty + 0.5) * TILE_IN;
    if (blocked(L, x, y)) continue;
    const u = useAt(L, x, y, HOME_IN.reach);
    if (u && u.use === use) { p.ped.home.x = x; p.ped.home.y = y; return; }
  }
  assert.fail(`no ${use} in the ${L.key}`);
}
const lastMenu = (conn) => [...conn.sent].reverse().find((m) => m && m.t === 'menu');

test('every plan: walkable from the front door to everything you can use, the right plan for each kind of home', () => {
  for (const k of PLAN_KEYS) for (const tier of [0, 1, 2, 3]) {
    const L = layout(k, tier);
    assert.ok(L.grid.every((r) => r.length === L.cols), `${k}: ragged rows`);
    const seen = new Set(), q = [[Math.floor(L.spawn.x / TILE_IN), Math.floor(L.spawn.y / TILE_IN)]];
    while (q.length) { const [x, y] = q.pop(); if (seen.has(x + ',' + y) || L.solid(x, y)) continue; seen.add(x + ',' + y); q.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]); }
    const reached = new Set();
    for (const c of seen) { const [x, y] = c.split(',').map(Number); const u = useAt(L, (x + 0.5) * TILE_IN, (y + 0.5) * TILE_IN, HOME_IN.reach); if (u) reached.add(u.use); }
    for (const u of ['door', 'bed', 'wardrobe', 'safe', 'fridge', 'shower', 'hall']) assert.ok(reached.has(u), `${k} tier ${tier}: can't reach the ${u}`);
    if (k === 'house' || k === 'mansion') assert.ok(reached.has('garage') && L.bays.length >= 2, `${k}: the garage`);
  }
  const w = makeWorld();
  const kinds = new Map(w.map.homes.map((h) => [h.kind, planOf(h)]));
  assert.equal(kinds.get('shack') || 'trailer', 'trailer');
  assert.equal(kinds.get('apartment'), 'apartment');
  assert.equal(kinds.get('house'), 'house');
  assert.equal(kinds.get('mansion'), 'mansion');
});

test('the front door: Act and you are in, the walls hold you, out by the front door; nobody sees you inside', () => {
  const w = makeWorld();
  const { p, conn } = joinPlayer(w, { bank: 1e6 });
  const { p: q } = joinPlayer(w);
  const h = ownHome(w, p);
  teleport(w, q.ped, h.x + 40, h.y + 30);
  teleport(w, p.ped, h.x, h.y);
  const label = act(w, p);
  assert.match(label, /Go inside/);
  assert.ok(p.ped.hidden && p.ped.home, 'inside straight away (not wanted)');
  const L = homeinside.planFor(h);
  assert.deepEqual([p.ped.home.x, p.ped.home.y], [L.spawn.x, L.spawn.y], 'just inside the front door');
  assert.ok(conn.sent.some((m) => m && m.t === 'home' && m.plan === 'house' && m.name === h.name), 'the page is told where you are');
  assert.ok(!w.query(h.x, h.y, 300, K.PED).includes(p.ped), 'nobody out there sees you');
  combat.damage(w, p.ped, 50, null, 'melee');
  assert.equal(p.ped.hp, p.ped.maxHp, 'nobody can hurt you');
  // walk down into the front wall: it holds
  walk(w, p, 0, 1, 1.5);
  assert.ok(p.ped.home.y < L.door.y - TILE_IN / 2, 'the wall holds you');
  assert.ok(!blocked(L, p.ped.home.x, p.ped.home.y));
  // walk left a long way: the living room's wall
  walk(w, p, -1, 0, 3);
  assert.ok(p.ped.home.x >= TILE_IN + 9, 'the side wall holds you');
  // walk up and right through the doorway into the hall
  const x0 = p.ped.home.x;
  walk(w, p, 1, 0, 1);
  assert.ok(p.ped.home.x > x0 + 60, 'walking');
  // back to the front door: Step outside
  p.ped.home.x = L.spawn.x; p.ped.home.y = L.spawn.y;
  assert.match(act(w, p), /Step outside/);
  assert.ok(!p.ped.hidden && !p.ped.home, 'out');
  assert.ok(Math.hypot(p.ped.x - h.x, p.ped.y - h.y) < 30, 'at the door');
  assert.ok(conn.sent.some((m) => m && m.t === 'home' && m.off), 'the page told you left');
  assert.ok(w.query(h.x, h.y, 300, K.PED).includes(p.ped), 'seen again');
});

test('wanted: the key takes a moment, and not at all with the police watching', () => {
  const w = makeWorld();
  const { p } = joinPlayer(w, { bank: 1e6 });
  const h = ownHome(w, p);
  teleport(w, p.ped, h.x, h.y);
  p.wanted = 2; p.seenAt = w.time;
  homeinside.goIn(w, p, h);
  assert.ok(!p.ped.hidden && !p.ped.entering, 'seen: no way in');
  p.seenAt = w.time - 10;
  homeinside.goIn(w, p, h);
  assert.ok(p.ped.entering && !p.ped.hidden, 'unseen: unlocking');
  run(w, 3);
  assert.ok(p.ped.hidden && p.ped.home, 'then in');
});

test('the bed: the night passes, you wake healed in the morning, and you wake up here after a death', () => {
  const w = makeWorld();
  const { p, prof } = joinPlayer(w, { bank: 1e6 });
  const h = ownHome(w, p);
  const h2 = ownHome(w, p);   // (the first home is the respawn point: sleeping in the second makes it the one)
  assert.equal(prof.spawnHome, h.id);
  teleport(w, p.ped, h2.x, h2.y);
  homeinside.goIn(w, p, h2);
  p.ped.hp = 30; p.ped.bleeding = true;
  w.loopTime = DAY_PART_S + 100;   // (night)
  standAt(w, p, 'bed');
  assert.match(act(w, p), /Sleep/);
  walk(w, p, 1, 0, 1);
  const s = p.ped.home;
  assert.ok(s.sleep, 'asleep');
  run(w, HOME_IN.sleepS + 0.2);
  assert.equal(p.ped.hp, p.ped.maxHp, 'healed');
  assert.ok(!p.ped.bleeding);
  const clock = w.clock;
  assert.ok(Math.abs(clock.minutes - HOME_IN.wakeH * 60) < 5, `morning (${clock.minutes})`);
  assert.equal(prof.spawnHome, h2.id, 'a save point: you wake up here');
  assert.equal(homes.defaultChoice(w, p, null), `home:${h2.id}`);
});

test('the safe: cash and things kept at home through a death and a rejoin', () => {
  const w = makeWorld();
  const { p, prof, conn } = joinPlayer(w, { bank: 1e6, cash: 900 });
  const h = ownHome(w, p);
  teleport(w, p.ped, h.x, h.y);
  homeinside.goIn(w, p, h);
  prof.cash = 900;   // (buying the place took the wallet's)
  prof.inventory.medkit = 2;
  standAt(w, p, 'safe');
  assert.match(act(w, p), /safe/i);
  const m = lastMenu(conn);
  assert.equal(m.title, 'The safe');
  assert.ok(m.opts.some((o) => o.id === 'hst:medkit'));
  economy.handleMenu(w, p, m.poi, 'hi:cin');
  economy.handleMenu(w, p, m.poi, 'hst:medkit');
  assert.equal(prof.cash, 0);
  assert.equal(prof.stash.cash, 900);
  assert.equal(prof.stash.items.medkit, 2);
  assert.equal(lastMenu(conn).title, 'The safe', 'the safe stays open');
  // out, rob a bit of cash, die
  homeinside.leave(w, p);
  prof.cash = 50;
  combat.kill(w, p.ped, null, 'melee', 0);
  run(w, 1);
  assert.equal(prof.stash.cash, 900, 'kept through a death');
  // leave the game and come back
  players.leave(w, p);
  const p2 = players.join(w, conn, prof);
  assert.equal(p2.profile.stash.cash, 900, 'kept through a rejoin');
  teleport(w, p2.ped, h.x, h.y);
  p2.ped.dead = false; p2.ped.protectUntil = 0;
  homeinside.goIn(w, p2, h);
  standAt(w, p2, 'safe');
  act(w, p2);
  economy.handleMenu(w, p2, lastMenu(conn).poi, 'hi:cout');
  assert.equal(prof.stash.cash, 0);
  assert.ok(prof.cash >= 900, 'cash out of the safe');
});

test('the wardrobe changes your outfit; the fridge keeps food and you eat it; the shower', () => {
  const w = makeWorld();
  const { p, prof, conn } = joinPlayer(w, { bank: 1e6 });
  const h = ownHome(w, p, 'apartment');
  teleport(w, p.ped, h.x, h.y);
  homeinside.goIn(w, p, h);
  assert.equal(homeinside.planFor(h).key, 'apartment');
  standAt(w, p, 'wardrobe');
  act(w, p);
  const wm = lastMenu(conn);
  assert.equal(wm.title, 'Wardrobe');
  assert.ok(wm.opts.some((o) => o.id === 'houtfit') && wm.opts.some((o) => o.id === 'hmirror'));
  const before = JSON.stringify(prof.look);
  economy.handleMenu(w, p, wm.poi, 'houtfit');
  assert.notEqual(JSON.stringify(prof.look), before, 'a new outfit on');
  // the fridge
  prof.inventory.apple = 3;
  standAt(w, p, 'fridge');
  act(w, p);
  let fm = lastMenu(conn);
  assert.equal(fm.title, 'The fridge');
  economy.handleMenu(w, p, fm.poi, 'hst:apple');
  assert.equal(prof.stash.items.apple, 3, 'in the fridge');
  p.ped.hp = 50;
  economy.handleMenu(w, p, fm.poi, 'hi:eat:apple');
  assert.equal(p.ped.hp, 56, 'ate one');
  assert.equal(prof.stash.items.apple, 2);
  fm = lastMenu(conn);
  assert.ok(fm.opts.some((o) => o.id === 'hi:eat:apple' && /2 in the fridge/.test(o.note)));
  // the shower
  p.ped.bleeding = true;
  standAt(w, p, 'shower');
  act(w, p);
  run(w, HOME_IN.showerS + 0.2);
  assert.ok(!p.ped.bleeding && p.ped.hp >= 56 + HOME_IN.showerHeal, 'washed');
});

test('the garage: through the door from the hall, your cars on the key board, drive one out', () => {
  const w = makeWorld();
  const { p, prof, conn } = joinPlayer(w, { bank: 1e6 });
  const h = ownHome(w, p);
  prof.vehicles.push({ model: 'sedan', paint: 2, variant: 0 });
  teleport(w, p.ped, h.x, h.y);
  homeinside.goIn(w, p, h);
  const full = conn.sent.find((m) => m && m.t === 'home' && m.cars);
  assert.deepEqual(full.cars.map((c) => c.m), ['sedan'], 'your car in the garage');
  standAt(w, p, 'garage');
  act(w, p);
  const gm = lastMenu(conn);
  assert.equal(gm.title, 'Your garage');
  economy.handleMenu(w, p, gm.poi, 'hi:car:0');
  assert.ok(p.ped.vehId && !p.ped.hidden && !p.ped.home, 'driving out');
  const v = w.get(p.ped.vehId);
  assert.equal(v.model, 'sedan');
});

test('the hall table: the home menu (respawn point, the bank) and selling the place from inside', () => {
  const w = makeWorld();
  const { p, prof, conn } = joinPlayer(w, { bank: 1e6 });
  const h = ownHome(w, p);
  teleport(w, p.ped, h.x, h.y);
  homeinside.goIn(w, p, h);
  standAt(w, p, 'hall');
  act(w, p);
  const hm = lastMenu(conn);
  assert.ok(hm.opts.some((o) => o.id === 'hspawn') && hm.opts.some((o) => o.id === 'hleave'), 'the home menu');
  prof.cash = 120;
  economy.handleMenu(w, p, hm.poi, 'dep:all');
  assert.equal(prof.cash, 0, 'banked from the hall table');
  assert.equal(lastMenu(conn).opts.some((o) => o.id === 'hi:sell'), true, 'the same menu back up');
  const bank = prof.bank;
  economy.handleMenu(w, p, hm.poi, 'hi:sell');
  assert.ok(!w.homeOwner.has(h.id) && !p.ped.hidden && !p.ped.home, 'sold, and outside');
  assert.equal(prof.bank, bank + Math.round(h.price * 0.6));
});
