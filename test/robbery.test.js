// Robberies v2 (the owner's notes, task #323; server/systems/robbery.js, hotmoney.js, standoff.js): the takings are hot
// money in a bag (no deposits near the robbery or while wanted; far away, at home or at a fence it comes clean), limited
// tills that refill, heat that starts at 1 star when the police are called and grows with the job, the bag dropped on
// death and confiscated at booking, customers who put their hands up and slip out, and the police standoff out front.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer, run, teleport, players } from './helpers.js';
import { K, STAR_HEAT, TILE } from '../shared/constants.js';
import { IN } from '../shared/input.js';
import { ROB_TILL, ROB_TILL_TIER, ROB_REFILL_S, ROB_CALLED_HEAT, HOT_FAR_PX, HOT_FENCE_CUT, HOT_PAWN_CUT, STANDOFF_S } from '../shared/rules.js';
import * as robbery from '../server/systems/robbery.js';
import * as hotmoney from '../server/systems/hotmoney.js';
import * as economy from '../server/systems/economy.js';
import * as cargo from '../server/systems/cargo.js';
import * as combat from '../server/systems/combat.js';
import * as custody from '../server/systems/custody.js';
import * as law from '../server/systems/law.js';
import { spawnNpc, walkInAt } from '../server/systems/npc.js';
import { _descriptor } from '../server/net.js';

let seq = 1;
const tierOf = (w, q) => w.map.districtAt(q.x, q.y).tier || 'mid';
const shopIn = (w, kind, tier) => w.map.pois.find((q) => q.kind === kind && w.map.buildings[q.b] && w.map.buildings[q.b].walkIn && tierOf(w, q) === tier);
function aimAt(w, ped, target, secs) {
  for (let i = 0; i < Math.round(secs * 20); i++) {
    players.queueInput(ped.player, { seq: seq++, bits: IN.AIMING, mx: 0, my: 0, aim: Math.atan2(target.y - ped.y, target.x - ped.x) });
    w.step();
  }
}
function listen(w) {
  const log = new Map(), notify = w.notify.bind(w);
  w.notify = (q, text, tone) => { if (q) { if (!log.has(q)) log.set(q, []); log.get(q).push(text); } return notify(q, text, tone); };
  return (q, re) => (log.get(q) || []).some((t) => re.test(t));
}
// A hold-up at shop: no cameras round it, nobody else about (the clerk doesn't count): the robbery starts, nobody calls it in
function holdUp(w, p, shop) {
  w.map.cameras = w.map.cameras.filter((c) => Math.hypot(c.x - shop.x, c.y - shop.y) > c.r + 600);
  p.profile.weapons.pistol = 99; p.ped.mag.pistol = 12; p.ped.weapon = 'pistol';
  teleport(w, p.ped, shop.x, shop.y);
  run(w, 1.2); // the clerk turns up
  const clerk = [...w.entities.values()].find((e) => e.kind === K.PED && e.npc && e.npc.desk && Math.hypot(e.x - shop.x, e.y - shop.y) < 120);
  assert.ok(clerk, `a clerk at ${shop.label}`);
  for (const e of w.query(shop.x, shop.y, 700, K.PED)) if (e !== clerk && e !== p.ped && e.npc) w.remove(e);
  aimAt(w, p.ped, clerk, 0.3);
  assert.ok(p.robbery, 'robbery started');
  assert.equal(p.wanted, 0, 'nobody called it in');
  return clerk;
}
const wanted = (w, p, stars) => law.addHeat(w, p, STAR_HEAT[stars] + 2 - p.heat, p.ped.x, p.ped.y);

test('limited tills: a few hundred in a corner store, thousands in a bank, more in the rich parts; it runs dry, then refills', () => {
  const w = makeWorld(), told = listen(w);
  const { p, prof } = joinPlayer(w, { cash: 0 });
  const full = (kind, tier) => robbery.till(w, -1, kind, tier).full;
  assert.equal(full('convenience', 'mid'), ROB_TILL.convenience);
  assert.ok(full('convenience', 'rough') < full('convenience', 'mid') && full('convenience', 'mid') < full('convenience', 'lux'), 'by the district');
  assert.ok(full('convenience', 'rough') >= 200 && full('convenience', 'lux') < 1000, 'a corner store: a few hundred');
  assert.ok(full('bank', 'lux') > 5 * full('convenience', 'lux') && full('bank', 'rough') >= 2000, 'a bank: thousands');
  const shop = shopIn(w, 'convenience', 'rough');
  const clerk = holdUp(w, p, shop);
  const key = clerk.npc.clerkOf, tier = tierOf(w, shop), cap = Math.round(ROB_TILL.convenience * ROB_TILL_TIER[tier]);
  p.robbery.alarmAt = w.time + 999;   // (no alarm: just the till)
  for (let i = 0; i < 40 && !p.robbery.empty; i++) aimAt(w, p.ped, clerk, 0.5);
  assert.ok(p.robbery.empty, 'the till runs dry');
  assert.ok(told(p, /till's empty/), 'the clerk says so');
  assert.ok(prof.hot >= cap - 1 && prof.hot <= cap * 1.04, `everything in it: $${prof.hot} of $${cap} (and the little it refilled meanwhile)`);
  assert.equal(prof.cash, 0, 'into the bag, not your cash');
  const hud = robbery.hudFor(w, p);
  assert.ok(hud.left < 1 && hud.full === cap && hud.empty, 'the robbery bar shows the till');
  const had = prof.hot;
  aimAt(w, p.ped, clerk, 3);
  assert.equal(prof.hot, had, 'no more money');
  // it fills back up over ROB_REFILL_S
  w.tills.get(key).at -= ROB_REFILL_S / 2;
  const half = robbery.till(w, key, 'convenience', tier).left;
  assert.ok(Math.abs(half - cap / 2) < cap * 0.05, `half full after half the time (${Math.round(half)})`);
  w.tills.get(key).at -= ROB_REFILL_S;
  assert.equal(robbery.till(w, key, 'convenience', tier).left, cap, 'full again');
});

test('heat: 1 star once the police are called, then it grows - slowly at a corner store in a rough part of town, fast at a bank in a rich one', () => {
  const rise = (kind, tier) => {
    const w = makeWorld();
    const { p } = joinPlayer(w, { cash: 0 });
    p.invincible = true; p.ped.protectUntil = 1e9;
    const shop = shopIn(w, kind, tier);
    assert.ok(shop, `a ${kind} in a ${tier} district`);
    const clerk = holdUp(w, p, shop);
    p.robbery.alarmAt = w.time + 0.5;   // the silent alarm: the police are called
    aimAt(w, p.ped, clerk, 0.6);
    assert.ok(p.robbery.called && p.robbery.alarmed, 'called in');
    assert.equal(p.wanted, 1, 'on 1 star');
    assert.ok(p.heat >= ROB_CALLED_HEAT - 0.01 && p.heat < STAR_HEAT[2], `1 star of heat (${p.heat})`);
    const h0 = p.heat;
    aimAt(w, p.ped, clerk, 8);
    return { gain: p.heat - h0, stars: p.wanted };
  };
  const store = rise('convenience', 'rough'), bank = rise('bank', 'lux');
  assert.ok(store.gain > 2, `the corner store's heat grows too (+${store.gain.toFixed(1)})`);
  assert.ok(store.stars <= 2, `...but it stays minor (${store.stars} stars)`);
  assert.ok(bank.gain > store.gain * 4, `a rich bank heats up much faster (+${bank.gain.toFixed(1)} vs +${store.gain.toFixed(1)})`);
  assert.ok(bank.stars >= 4, `4-5 stars fast (${bank.stars})`);
});

test('a robbery seen by a witness: called in at 1 star (no longer 2), and the heat grows from there', () => {
  const w = makeWorld();
  const { p } = joinPlayer(w, { cash: 0 });
  const shop = shopIn(w, 'convenience', 'mid');
  w.map.cameras = w.map.cameras.filter((c) => Math.hypot(c.x - shop.x, c.y - shop.y) > c.r + 600);
  p.profile.weapons.pistol = 99; p.ped.mag.pistol = 12; p.ped.weapon = 'pistol';
  teleport(w, p.ped, shop.x, shop.y);
  run(w, 1.2);
  const clerk = [...w.entities.values()].find((e) => e.kind === K.PED && e.npc && e.npc.desk && Math.hypot(e.x - shop.x, e.y - shop.y) < 120);
  for (const e of w.query(shop.x, shop.y, 700, K.PED)) if (e !== clerk && e !== p.ped && e.npc) w.remove(e);
  // a customer by the door, facing in, the sort to call it in
  const wi = walkInAt(w.map, shop.x, shop.y);
  const cust = spawnNpc(w, 'senior', wi.x, (wi.inY + shop.y) / 2, 'civ');
  cust.a = Math.atan2(clerk.y - cust.y, clerk.x - cust.x); cust.npc.snitch = 9; cust.npc.state = 'idle'; cust.npc.until = w.time + 99;
  cust.npc.lookAt = w.time + 99;   // (and staying that way: an idle NPC otherwise glances about at once, half the time away)
  aimAt(w, p.ped, clerk, 0.3);
  assert.ok(p.robbery && p.robbery.called, 'reported');
  assert.equal(p.wanted, 1, '1 star');
  const h0 = p.heat;
  aimAt(w, p.ped, clerk, 4);
  assert.ok(p.heat > h0 + 2, 'growing');
});

test('hot money: no ATM or bank takes it near the robbery or while you are wanted; far away and clean, it banks', () => {
  const w = makeWorld(), told = listen(w);
  const { p, prof } = joinPlayer(w, { cash: 0, bank: 100 });
  const atm = w.map.atms[0];
  hotmoney.add(w, p, 800, atm.x + 300, atm.y);   // stolen just down the street
  assert.equal(prof.hot, 800);
  assert.equal(_descriptor(p.ped).mb, 1, 'everyone sees the money bag');
  // walk up to the ATM: too hot
  teleport(w, p.ped, atm.x, atm.y + 10);
  run(w, 0.5);
  assert.ok(told(p, /Too hot - get it well away from the robbery first/), 'too hot');
  assert.equal(prof.hot, 800); assert.equal(prof.bank, 100);
  // ...nor at its menu
  economy.handleMenu(w, p, atm.id, 'hot:bank');
  assert.equal(prof.hot, 800, 'the menu says no too');
  assert.ok(economy.buildMenu(w, p, atm).opts.some((o) => o.id === 'hot:bank' && /too hot/.test(o.note)));
  // the hot money isn't cash: no shopping with it
  assert.ok(!economy.payFrom(p, 200), 'can\'t spend it');
  // far away, but wanted
  prof.hotAt = { x: atm.x + HOT_FAR_PX + 200, y: atm.y };
  p.atAtmHot = null;
  wanted(w, p, 1);
  economy.handleMenu(w, p, atm.id, 'hot:bank');
  assert.ok(told(p, /Lose the police first/), 'not while wanted');
  assert.equal(prof.hot, 800);
  // far away and clean: the walk-up banks it
  law.clearWanted(w, p);
  teleport(w, p.ped, atm.x + 200, atm.y + 200); run(w, 0.3);
  teleport(w, p.ped, atm.x, atm.y + 10); run(w, 0.5);
  assert.equal(prof.hot, 0, 'banked');
  assert.equal(prof.bank, 900, 'like a normal deposit');
  assert.equal(prof.cash, 0, 'the cash stays where it was');
  assert.equal(_descriptor(p.ped).mb, undefined, 'the bag is gone');
  // a bank teller's the same
  const bank = w.map.pois.find((q) => q.kind === 'bank');
  hotmoney.add(w, p, 500, bank.x + 100, bank.y);
  teleport(w, p.ped, bank.x, bank.y);
  economy.handleMenu(w, p, bank.id, 'hot:bank');
  assert.equal(prof.hot, 500, 'too near');
  prof.hotAt = { x: bank.x - HOT_FAR_PX - 50, y: bank.y };
  economy.handleMenu(w, p, bank.id, 'hot:bank');
  assert.equal(prof.hot, 0); assert.equal(prof.bank, 1400);
});

test('hot money: stash it at any home you own (any distance) and it comes out clean; a fence pays less a cut, a pawn shop less again', () => {
  const w = makeWorld();
  const { p, prof } = joinPlayer(w, { bank: 1e6, cash: 0 });
  const h = w.map.homes.find((q) => q.kind === 'house' && !w.homeOwner.has(q.id));
  const poi = w.map.pois.find((q) => q.kind === 'home' && q.home === h.id);
  teleport(w, p.ped, h.x, h.y);
  hotmoney.add(w, p, 1000, h.x + 50, h.y);   // stolen next door
  assert.ok(!economy.buildMenu(w, p, poi).opts.some((o) => o.id === 'hot:stash'), 'not someone else\'s home');
  economy.handleMenu(w, p, poi.id, 'hbuy');
  assert.equal(w.homeOwner.get(h.id), p.pid);
  assert.ok(economy.buildMenu(w, p, poi).opts.some((o) => o.id === 'hot:stash'), 'your home: "Stash the hot money"');
  economy.handleMenu(w, p, poi.id, 'hot:stash');
  assert.equal(prof.hot, 0); assert.equal(prof.cash, 1000, 'clean cash');
  // the fence
  const fence = w.map.pois.find((q) => q.kind === 'fence');
  teleport(w, p.ped, fence.x, fence.y);
  hotmoney.add(w, p, 1000, fence.x, fence.y);
  economy.handleMenu(w, p, fence.id, 'hot:fence');
  assert.equal(prof.hot, 0);
  assert.equal(prof.cash, 1000 + Math.round(1000 * (1 - HOT_FENCE_CUT)), 'less the fence\'s cut');
  // a pawn shop takes more
  const pawn = w.map.pois.find((q) => q.kind === 'pawn');
  teleport(w, p.ped, pawn.x, pawn.y);
  hotmoney.add(w, p, 1000, pawn.x, pawn.y);
  const cash = prof.cash;
  economy.handleMenu(w, p, pawn.id, 'hot:fence');
  assert.equal(prof.cash, cash + Math.round(1000 * (1 - HOT_PAWN_CUT)));
  assert.ok(HOT_PAWN_CUT > HOT_FENCE_CUT);
  // a second robbery adds to the bag and moves its "stolen at" spot
  hotmoney.add(w, p, 300, 1000, 1000);
  hotmoney.add(w, p, 200, 5000, 6000);
  assert.equal(prof.hot, 500);
  assert.deepEqual(prof.hotAt, { x: 5000, y: 6000 });
});

test('the bag drops where you die - still hot, anyone can take it - and is confiscated when you are booked', () => {
  const w = makeWorld();
  const { p, prof } = joinPlayer(w, { cash: 0 });
  const { p: q, prof: qprof } = joinPlayer(w, { cash: 0 });
  const n = w.map.nodes.find((o) => o.lvl === 0);
  teleport(w, p.ped, n.x + 40, n.y + 40);
  hotmoney.add(w, p, 900, 123, 456);
  combat.damage(w, p.ped, 99999, null, 'crash', 0);
  assert.ok(p.ped.dead);
  assert.equal(prof.hot, 0, 'not on you any more');
  const bag = [...w.entities.values()].find((e) => e.kind === K.BAG && e.hot);
  assert.ok(bag, 'the robbery bag on the ground');
  assert.equal(bag.hot, 900);
  assert.deepEqual(bag.hotAt, { x: 123, y: 456 }, 'it remembers where it was stolen');
  assert.ok(Math.hypot(bag.x - p.ped.x, bag.y - p.ped.y) < 40, 'where you fell');
  assert.equal(cargo.bagWireTier(bag), 1, 'drawn as a duffel');
  // someone else takes it: still hot
  teleport(w, q.ped, bag.x + 10, bag.y);
  assert.match(cargo.bagLabel(bag, q), /robbery bag/);
  cargo.lootBag(w, q, bag);
  assert.equal(qprof.hot, 900); assert.deepEqual(qprof.hotAt, { x: 123, y: 456 });
  assert.equal(qprof.cash, 0);
  run(w, 0.3);
  assert.equal(_descriptor(q.ped).mb, 1, 'on their back now');
  // booked into a cell: confiscated
  wanted(w, q, 2);
  custody.surrender(w, q);
  assert.ok(custody.inCell(q));
  assert.equal(qprof.hot, 0, 'confiscated');
  run(w, 0.3);
  assert.equal(_descriptor(q.ped).mb, undefined);
});

test('customers put their hands up, then slip out of the door and run', () => {
  const w = makeWorld();
  const { p } = joinPlayer(w, { cash: 0 });
  const shop = shopIn(w, 'convenience', 'mid');
  w.map.cameras = w.map.cameras.filter((c) => Math.hypot(c.x - shop.x, c.y - shop.y) > c.r + 600);
  p.profile.weapons.pistol = 99; p.ped.mag.pistol = 12; p.ped.weapon = 'pistol';
  teleport(w, p.ped, shop.x, shop.y);
  run(w, 1.2);
  const clerk = [...w.entities.values()].find((e) => e.kind === K.PED && e.npc && e.npc.desk && Math.hypot(e.x - shop.x, e.y - shop.y) < 120);
  for (const e of w.query(shop.x, shop.y, 700, K.PED)) if (e !== clerk && e !== p.ped && e.npc) w.remove(e);
  const wi = walkInAt(w.map, shop.x, shop.y);
  const cust = spawnNpc(w, 'casual', (wi.x + shop.x) / 2 + 20, (wi.inY + shop.y) / 2, 'civ');
  cust.a = Math.atan2(cust.y - shop.y, cust.x - shop.x); cust.npc.snitch = 0; cust.npc.state = 'idle'; cust.npc.until = w.time + 99;   // (looking away, keeps quiet)
  assert.equal(walkInAt(w.map, cust.x, cust.y)?.u, wi.u, 'in the shop');
  aimAt(w, p.ped, clerk, 1);
  assert.ok(p.robbery);
  assert.ok(cust.handsUp && cust.npc.state === 'holdup', 'hands up');
  const at = { x: cust.x, y: cust.y };
  aimAt(w, p.ped, clerk, 1);
  assert.ok(Math.hypot(cust.x - at.x, cust.y - at.y) < 6, 'not moving');
  let out = false;
  for (let i = 0; i < 30 && !out; i++) { aimAt(w, p.ped, clerk, 0.5); out = !cust.removed && !walkInAt(w.map, cust.x, cust.y); }
  assert.ok(out, 'out of the door');
  assert.ok(!cust.handsUp, 'hands down');
  run(w, 0.5);
  assert.equal(cust.npc.state, 'flee', 'and running');
});

test('the police at a robbery: the cars park at spots round the building (none drives into it), the crews take cover, then go in', () => {
  const w = makeWorld();
  const { p } = joinPlayer(w, { cash: 0 });
  p.ped.protectUntil = 1e9;   // (can't be tackled: stay free to watch them come in)
  const shop = shopIn(w, 'convenience', 'mid');
  const clerk = holdUp(w, p, shop);
  const b = w.map.buildings[shop.b], wi = walkInAt(w.map, shop.x, shop.y);
  const inside = (x, y) => x > b.tx * TILE - 4 && x < (b.tx + b.tw) * TILE + 4 && y > b.ty * TILE - 4 && y < (b.ty + b.th) * TILE + 4;
  p.robbery.alarmAt = w.time + 1;
  let so = null, rammed = 0, cover = null, coverPos = null, went = null, ducked = false, outAt = 0;
  for (let i = 0; i < 160 && !went; i++) {
    aimAt(w, p.ped, clerk, 0.5);
    for (const id of w.police) { const v = w.get(id); if (v && inside(v.x, v.y)) rammed++; }
    so = w.standoffs && w.standoffs.get(p.pid);
    if (so && so.outAt && !outAt) outAt = w.time;
    if (so && so.outAt && w.time < clerk.downUntil) ducked = true;
    for (const c of w.entities.values()) {
      if (c.kind !== K.PED || !c.npc || c.npc.role !== 'cop' || c.dead || c.vehId || !c.npc.so) continue;
      if (c.npc.so.role === 'cover' && !cover) {
        const car = w.get(c.npc.unit);
        if (car && Math.hypot(c.x - car.x, c.y - car.y) < Math.max(car.def.L, car.def.W) && w.time < c.aimUntil) { cover = c; coverPos = { car, d: Math.hypot(c.x - wi.x, c.y - wi.outY), dc: Math.hypot(car.x - wi.x, car.y - wi.outY), weapon: c.weapon }; }
      }
      if (c.npc.so.role === 'entry') { const at = walkInAt(w.map, c.x, c.y); if (at && at.u === wi.u) went = c; }
    }
    if (p.robbery.alarmed) assert.ok(p.wanted > 0 && p.robbery, 'still holding the place up');
  }
  assert.ok(so && outAt, 'a standoff out front');
  assert.equal(rammed, 0, 'no police car ever drove into the building');
  // every unit sent parked at its own spot round the building
  const parked = [...so.taken.entries()].map(([vid, i]) => ({ v: w.get(vid), sp: so.spots[i] })).filter((o) => o.v && o.v.ai && o.v.ai.soPark);
  assert.ok(parked.length >= 2, `cars parked round it (${parked.length})`);
  for (const { v, sp } of parked) assert.ok(Math.hypot(v.x - sp.x, v.y - sp.y) < 300, `at its spot (${Math.round(Math.hypot(v.x - sp.x, v.y - sp.y))} px off)`);
  assert.ok(new Set([...so.taken.values()]).size === so.taken.size || so.taken.size > so.spots.length, 'a spot each, not stacked');
  assert.ok(cover, 'an officer in cover behind the car, aiming');
  assert.ok(coverPos.d > coverPos.dc, 'on the far side of it from the door');
  assert.ok(['pistol', 'service', 'smg', 'rifle', 'shotgun'].includes(coverPos.weapon), `weapon drawn (${coverPos.weapon})`);
  assert.ok(ducked, 'the clerk ducked down behind the counter');
  assert.ok(went, 'then some went in after the suspect');
  assert.ok(w.time - outAt <= STANDOFF_S + 12, 'after the standoff');
  // one a car stayed in cover
  assert.ok([...w.entities.values()].some((c) => c.kind === K.PED && c.npc && c.npc.so && c.npc.so.role === 'cover' && !c.dead), 'cover held');
});
