// Fishing (task #277; the owner's fishing concepts FC01-FC22, 2026-10-18): the fish and where they live, the rods and
// the baits, the cast's charge, the bite, the strike and the fight (server/systems/fishing.js, shared/fish.js), the
// page's prediction of it (client/fishing.js), the cooler, the log, the records board and the fish market.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer, teleport, calmWater, playLine } from './helpers.js';
import { T, TILE } from '../shared/constants.js';
import { IN } from '../shared/input.js';
import * as FS from '../shared/fish.js';
import { FISHING } from '../shared/rules.js';
import { ITEMS, SHOPS } from '../shared/items.js';
import { mulberry32 } from '../shared/rng.js';
import * as fishing from '../server/systems/fishing.js';
import * as economy from '../server/systems/economy.js';
import * as players from '../server/systems/players.js';
import { store } from '../server/store.js';
import { FishView } from '../client/fishing.js';
import { drawFish } from '../client/fishart.js';

const W = makeWorld();
const { PH } = FS;

test('the fish: every water has its commons and its rare ones; one legendary to a place; none of the sea life that is only to see', () => {
  const ids = new Set();
  for (const f of FS.FISH) {
    assert.ok(!ids.has(f.id), `one ${f.id}`); ids.add(f.id);
    assert.ok(f.waters.length && f.waters.every((w) => FS.WATERS.includes(w)), `${f.id}: its waters`);
    assert.ok(f.lb[0] > 0 && f.lb[1] >= f.lb[0] && f.rare >= 1 && f.rare <= 5 && f.diff >= 0 && f.diff <= 100 && f.pay > 0, `${f.id}: its numbers`);
    assert.ok(['any', 'day', 'dusk', 'night'].includes(f.when) && ['smooth', 'dart', 'sinker', 'floater', 'mixed'].includes(f.fight), `${f.id}: its hour and its fight`);
    assert.ok(f.eats && [...f.eats].every((c) => 'wimsqdc'.includes(c)) && f.col.length === 4, `${f.id}: what it eats, its colours`);
    assert.equal(FS.FISH_BY_ID[f.id], f);
  }
  assert.ok(FS.FISH.length >= 80, `${FS.FISH.length} kinds`);
  for (const w of FS.WATERS) {
    const here = FS.FISH.filter((f) => f.waters.includes(w) && f.rare < 5);
    assert.ok(here.some((f) => f.rare === 1), `${w}: something common`);
    assert.ok(here.length >= (w === 'cave' ? 2 : 6), `${w}: ${here.length} kinds`);
  }
  const L = FS.FISH.filter((f) => f.rare === 5);
  assert.equal(L.length, 10, 'the ten legendaries (FC01, FC02)');
  for (const f of L) assert.ok(f.spot && f.pay >= 2000, `${f.name}: its own place, worth a lot`);
  for (const no of ['dolphin', 'whaleshark', 'turtle', 'seaturtle', 'seahorse']) assert.ok(!FS.FISH_BY_ID[no], `no ${no} on a hook`);
  // a bigger one of its kind fetches more
  const bass = FS.FISH_BY_ID.bass;
  assert.ok(FS.fishValue(bass, 10) > FS.fishValue(bass, 2) && FS.fishValue(bass, 2) > 0);
  // every one of them draws (the catch card)
  const calls = { n: 0 };
  const g = new Proxy({}, { get: (o, k) => (k in o ? o[k] : k === 'createLinearGradient' ? () => ({ addColorStop() {} }) : () => { calls.n++; }), set: (o, k, v) => { o[k] = v; return true; } });
  for (const f of FS.FISH) drawFish(g, f, 0, 0, 120);
  assert.ok(calls.n > FS.FISH.length * 20, 'drawn');
});

test('the rods and the baits: the rod made for the water; a heavier fish than it holds snaps the line; bait brings what eats it', () => {
  for (const id of FS.ROD_IDS) if (id !== 'rod') assert.ok(ITEMS[id] && ITEMS[id].tool && ITEMS[id].rod, `${id}: a tool in the bag`);
  for (const id of FS.BAIT_IDS) assert.ok(ITEMS[id] && ITEMS[id].bait, `${id}: bait`);
  const sold = new Set(['tackle', 'fishmarket', 'charter'].flatMap((k) => SHOPS[k].buy.map((o) => o.id)));
  for (const id of [...FS.ROD_IDS, ...FS.BAIT_IDS]) assert.ok(sold.has(id), `${id} for sale`);
  const has = (...ids) => (id) => ids.includes(id);
  assert.equal(FS.rodFor(has('rod', 'flyRod', 'gameRod'), 'creek'), 'flyRod');
  assert.equal(FS.rodFor(has('rod', 'flyRod', 'gameRod'), 'offshore'), 'gameRod');
  assert.equal(FS.rodFor(has('rod', 'gameRod'), 'pond'), 'rod', 'the light rod in a pond, not the big-game one');
  assert.equal(FS.rodFor(has('caneRod'), 'offshore'), 'caneRod', 'whatever you have');
  const f = FS.FISH_BY_ID.yellowfin;
  assert.ok(FS.fightParams(f, 200, 'rod', 'offshore', 1).snap, 'a 200 lb tuna on the light rod: snap');
  assert.ok(!FS.fightParams(f, 200, 'gameRod', 'offshore', 1).snap);
  assert.ok(FS.fightParams(f, 40, 'gameRod', 'offshore', 1).bar > FS.fightParams(f, 40, 'gameRod', 'lake', 1).bar, 'a bigger bar in its own water');
  // bait: the fish that eat it bite more
  const w = (bait) => new Map(FS.biteTable({ water: 'lake', spot: null }, { when: 'day', bait }).map(([q, x]) => [q.id, x]));
  assert.ok(w('doughballs').get('carp') > w(null).get('carp') * 2 && w('doughballs').get('pike') === w(null).get('pike'));
  assert.ok(!FS.biteTable({ water: 'lake', spot: null }, { when: 'night', bait: 'glowlure' }).some(([q]) => q.rare === 5), 'no legendary off its spot');
  // a legendary: at its spot, its hour, on a rod that can hold it
  const at = (o) => FS.biteTable({ water: 'pond', spot: 'lily' }, o).some(([q]) => q.id === 'goldenkoi');
  assert.ok(at({ when: 'day', rodLb: 50 }) && !at({ when: 'night', rodLb: 50 }) && !at({ when: 'day', rodLb: 10 }));
  assert.equal(FS.bestBait((id) => ({ worms: 3, squid: 2 })[id] || 0, 'pier'), 'squid', 'squid for the pier');
  assert.equal(FS.bestBait((id) => ({ glowlure: 3 })[id] || 0, 'pier', { night: false }), null, 'the glow lure is for the night');
});

test('the fight: a steady hand lands an easy fish quickly, a hard one fights longer; let it out of the bar and it gets away', () => {
  const play = (diff, fight, lag, seed) => {   // (a player who sees the fish a moment late and leads it a little)
    const P = { bar: 0.3, reel: 1, diff, fight, seed: seed * 7919 + diff, bite: 2, win: 1 }, F = FS.newFight();
    F.ph = PH.BITE; F.t = 0;
    FS.fightStep(F, P, true, true, 0.05);
    assert.equal(F.ph, PH.FIGHT);
    let n = 0;
    while (F.ph === PH.FIGHT && n < 3000) { const tl = Math.max(0, F.t - lag), y = FS.fishY(P, tl), y0 = FS.fishY(P, Math.max(0, tl - 0.1)); FS.fightStep(F, P, y + (y - y0) * 3 > F.barY + P.bar / 2 + F.barV * 0.25, false, 0.05); n++; }
    return [F.out, n * 0.05];
  };
  let won = 0, T = 0;
  for (let s = 1; s <= 20; s++) { const [o, t] = play(15, 'smooth', 0.2, s); won += o === 1; T += t; }
  assert.equal(won, 20, 'a bluegill: every time');
  assert.ok(T / 20 < 8, `in ${(T / 20).toFixed(1)} s`);
  let hard = 0; for (let s = 1; s <= 20; s++) hard += play(98, 'mixed', 0.2, s)[0] === 1;
  assert.ok(hard >= 2 && hard <= 16, `a legendary: hard (${hard}/20)`);
  // nothing held: the bar sits on the bottom, the fish swims off
  const P = { bar: 0.26, reel: 1, diff: 50, fight: 'floater', seed: 9, bite: 2, win: 1 }, F = FS.newFight();
  F.ph = PH.FIGHT; F.prog = FS.FIGHT.start;
  for (let i = 0; i < 400 && F.ph === PH.FIGHT; i++) FS.fightStep(F, P, false, false, 0.05);
  assert.equal(F.out, 2, 'it got away');
  // the charge: up, down, up as you hold; let go and the line's out
  const C = FS.newFight();
  for (let i = 0; i < 11; i++) FS.fightStep(C, null, true, false, 0.1);
  assert.ok(C.power > 0.95);
  for (let i = 0; i < 6; i++) FS.fightStep(C, null, true, false, 0.1);
  assert.ok(C.power < 0.5, 'and back down');
  FS.fightStep(C, null, false, false, 0.05);
  assert.equal(C.ph, PH.WAIT);
  // the wait: a press before the bite reels in
  FS.fightStep(C, { bite: 3, win: 1 }, false, true, 0.05);
  assert.ok(C.ph === PH.DONE && C.out === 3);
});

// a still place by the water of a kind: [stand x, y, facing], the tile in front of you that water
function bankOf(world, want, skip = 0) {
  const m = world.map;
  const ok = (t) => t === T.SIDEWALK || t === T.GRASS || t === T.SAND || t === T.DOCK || t === T.DIRT || t === T.PLAZA;
  for (let ty = m.y0 + 8; ty < m.y0 + m.h - 8; ty += 3) for (let tx = m.x0 + 8; tx < m.x0 + m.w - 8; tx += 3) {
    const t = m.tileAt(tx, ty);
    if (t !== T.WATER && t !== T.DEEP) continue;
    for (const [dx, dy] of [[0, -1], [-1, 0], [1, 0], [0, 1]]) {
      if (!ok(m.tileAt(tx + dx, ty + dy)) || !ok(m.tileAt(tx + dx * 2, ty + dy * 2))) continue;
      const h = fishing.habitatAt(world, (tx + 0.5) * TILE, (ty + 0.5) * TILE);
      if (!want(h)) continue;
      if (skip-- > 0) continue;
      return [(tx + dx + 0.5) * TILE - dx * 6, (ty + dy + 0.5) * TILE - dy * 6, Math.atan2(-dy, -dx)];
    }
  }
  return null;
}
// one input a step, as the page sends them
function inputs(world, p) {
  let seq = p.ack;
  return (bits, n = 1) => { for (let i = 0; i < n; i++) { p.inputQ.push({ seq: ++seq, bits, mx: 0, my: 0, aim: p.ped.a }); world.step(); } };
}

test('fishing waters: the river and the creek, the lake and the pond, the pier, the reef, offshore from a boat and the deep at night', () => {
  const kinds = new Set();
  for (const want of ['river', 'creek', 'lake', 'pier', 'shore', 'reef', 'pond']) { if (bankOf(W, (h) => h.water === want)) kinds.add(want); }
  for (const k of ['river', 'lake', 'pier', 'shore']) assert.ok(kinds.has(k), `a bank on ${k} (found: ${[...kinds]})`);
  // out at sea from a boat: open water by day, the deep after dark; a pier's pilings; a bridge over a river
  const off = W.map.offshore[0];
  assert.deepEqual(fishing.habitatAt(W, off.x, off.y, { boat: true }), { water: 'offshore', spot: 'blue' });
  assert.deepEqual(fishing.habitatAt(W, off.x, off.y, { boat: true, night: true }), { water: 'deep', spot: 'night' });
  assert.equal(fishing.habitatAt(W, off.x, off.y, { ug: true }).water, 'cave');
  let bridge = null;
  for (let ty = W.map.y0; ty < W.map.y0 + W.map.h && !bridge; ty += 2) for (let tx = W.map.x0; tx < W.map.x0 + W.map.w; tx += 2) {
    if (W.map.tileAt(tx, ty) !== T.BRIDGE) continue;
    for (const [dx, dy] of [[0, 2], [2, 0], [0, -2], [-2, 0]]) { const i = W.map.inside(tx + dx, ty + dy) && W.map.idx(tx + dx, ty + dy); if (i && W.map.river[i] && !W.map.lake[i]) { bridge = [(tx + dx + 0.5) * TILE, (ty + dy + 0.5) * TILE]; break; } }
    if (bridge) break;
  }
  if (bridge) assert.equal(fishing.habitatAt(W, ...bridge).spot, 'bridge', 'under a bridge: Big Muddy\'s');
  // no fishing in a swimming pool
  const pool = (W.map.pools || [])[0];
  if (pool && !pool.ring) assert.equal(fishing.spotFor(W, { x: pool.x - 20, y: pool.y + pool.h / 2, a: 0 }), null);
});

test('a day at the river: hold to charge, let go, wait out the nibbles, strike on the bite, play the fish in; the cooler, the log, the records board, the fish market', () => {
  const { p, prof, conn } = joinPlayer(W, { cash: 0, bank: 0 });
  prof.weapons.rod = 0; prof.inventory.worms = 5;
  const bank = bankOf(W, (h) => h.water === 'river' || h.water === 'lake');
  assert.ok(bank, 'a river bank');
  teleport(W, p.ped, bank[0], bank[1]); p.ped.a = bank[2];
  const rand = W.rand; W.rand = mulberry32(4242);
  const send = inputs(W, p);
  send(0, 2);
  const it = players.findInteraction(W, p);
  assert.ok(it && /Fish here/.test(it.label), `the prompt: ${it && it.label}`);
  send(IN.ACTION);   // press: the charge starts
  const L = p.ped.fishing;
  assert.ok(L && L.F.ph === PH.CHARGE, 'charging');
  send(IN.ACTION, 18);
  assert.ok(L.F.power > 0.75, `power ${L.F.power.toFixed(2)}`);
  send(0);   // let go
  assert.equal(L.F.ph, PH.WAIT, 'the line is out');
  assert.ok(L.P && L.fish && L.lb > 0, `something's down there: ${L.fish} ${L.lb} lb`);
  assert.ok(Math.hypot(L.x - p.ped.x, L.y - p.ped.y) > 40, 'out from the bank');
  const me = players.buildMe(W, p);
  assert.ok(me.fishing && me.fishing.P && me.fishing.P.snap === undefined && me.fishing.x === Math.round(L.x), 'the page gets the fight, not whether it snaps');
  // the wait, the nibbles, the bite
  let n = 0; while (L.F.ph === PH.WAIT && n++ < 400) send(0);
  assert.equal(L.F.ph, PH.BITE, 'it bites');
  send(IN.ACTION);   // strike
  assert.equal(L.F.ph, PH.FIGHT, 'hooked');
  assert.equal(prof.inventory.worms, 4, 'a worm used');
  // play it: hold when the fish is above the bar's middle
  n = 0;
  while (p.ped.fishing && n++ < 3000) { const F = L.F, P = L.P; send(FS.fishY(P, F.t) > F.barY + P.bar / 2 + F.barV * 0.25 ? IN.ACTION : 0); }
  assert.equal(p.ped.fishing, null, 'done');
  assert.equal(L.F.out, 1, 'landed');
  assert.equal(prof.creel.length, 1);
  assert.deepEqual(prof.creel[0], [L.fish, L.lb]);
  assert.deepEqual(prof.fishLog[L.fish], [1, L.lb]);
  assert.deepEqual(store.kept.fishRecords[L.fish], [L.lb, p.name]);
  const card = conn.sent.find((m) => m.t === 'fish');
  assert.ok(card && FS.FISH[card.f].id === L.fish && card.nw === 1 && card.wr === 1, 'the catch card: new to the log, a record');
  // the fish market buys it
  const market = W.map.pois.find((q) => q.kind === 'fishmarket');
  teleport(W, p.ped, market.x, market.y);
  const menu = economy.buildMenu(W, p, market);
  assert.ok(menu.opts.some((o) => o.id === 'creel' && o.price < 0), 'sell the catch');
  economy.handleMenu(W, p, market.id, 'creel');
  assert.equal(prof.creel.length, 0);
  assert.equal(prof.bank, FS.fishValue(FS.FISH_BY_ID[L.fish], L.lb), 'paid what it was worth');
  W.rand = rand;
  players.leave(W, p);
});

test('the strike: too soon reels in, too late it\'s gone, too heavy snaps the line; walking off reels in', () => {
  const { p, prof } = joinPlayer(W);
  prof.weapons.rod = 0;
  const bank = bankOf(W, (h) => h.water === 'river' || h.water === 'lake' || h.water === 'shore', 1);
  teleport(W, p.ped, bank[0], bank[1]); p.ped.a = bank[2];
  const send = inputs(W, p);
  const cast = () => { fishing.begin(W, p, fishing.spotFor(W, p.ped)); send(IN.ACTION, 6); send(0); return p.ped.fishing; };
  let L = cast();
  send(0, 3); send(IN.ACTION);
  assert.equal(p.ped.fishing, null, 'struck at nothing');
  assert.equal(L.F.out, 3);
  L = cast();
  let n = 0; while (L.F.ph === PH.WAIT && n++ < 400) send(0);
  send(0, Math.ceil(L.P.win * 20) + 2);
  assert.ok(!p.ped.fishing && L.F.out === 3, 'missed the bite');
  L = cast();
  L.P.snap = true;
  n = 0; while (L.F.ph === PH.WAIT && n++ < 400) send(0);
  send(IN.ACTION);
  assert.ok(!p.ped.fishing && L.F.out === 4, 'the line snapped');
  assert.equal(prof.creel ? prof.creel.length : 0, 0, 'nothing caught');
  // walking off while the line's out reels it in
  cast();
  p.inputQ.push({ seq: p.ack + 1, bits: 0, mx: 1, my: 0, aim: 0 }); W.step();
  assert.equal(p.ped.fishing, null, 'walked off');
  // a full cooler: no more till you sell
  prof.creel = Array.from({ length: FISHING.creel }, () => ['bluegill', 0.5]);
  fishing.begin(W, p, fishing.spotFor(W, p.ped));
  assert.equal(p.ped.fishing, null, 'the cooler is full');
  players.leave(W, p);
});

test('the page plays your line as the server does: the charge, the bite and the fight from the same inputs, set back to each snapshot', () => {
  const { p, prof } = joinPlayer(W);
  prof.weapons.rod = 0;
  const bank = bankOf(W, (h) => h.water === 'river' || h.water === 'lake', 2);
  teleport(W, p.ped, bank[0], bank[1]); p.ped.a = bank[2];
  const rand = W.rand; W.rand = mulberry32(77);
  const page = { me: { fishing: null }, pending: [], map: W.map, ents: new Map(), myPedId: p.ped.id };
  const V = new FishView(page);
  let seq = p.ack, sent = [];
  const LAG = 3;   // (the server is three inputs behind the page)
  const f32 = (k) => Array.from(new Float32Array(k));
  const tick = (bits) => {
    const q = { seq: ++seq, bits, mx: 0, my: 0, aim: p.ped.a };
    sent.push(q); page.pending.push(q); V.step(q);
    if (sent.length > LAG) { p.inputQ.push(sent.shift()); W.step(); }
    const L = p.ped.fishing;
    page.me.fishing = fishing.meInfo(p);
    page.pending = page.pending.filter((x) => x.seq > p.ack);
    V.reconcile({ self: { k: L && L.F ? f32(FS.fishOut(L.F)) : [0, 0, 0, 0, 0, 0, 0] }, selfFlags: 0, ack: p.ack, prevBits: p.prevBits });
  };
  fishing.begin(W, p, fishing.spotFor(W, p.ped));
  for (let i = 0; i < 14; i++) tick(IN.ACTION);
  tick(0);
  assert.equal(V.F.ph, PH.WAIT, 'the page let go at once');
  let n = 0, bitePage = -1;
  while (n++ < 400) { tick(0); if (V.F && V.F.ph === PH.BITE) { bitePage = seq; break; } }
  assert.ok(bitePage > 0, 'the page sees the bite');
  tick(IN.ACTION);
  assert.equal(V.F.ph, PH.FIGHT, 'the strike lands on the page at once');
  n = 0;
  while (V.F && V.F.ph === PH.FIGHT && n++ < 3000) { const F = V.F, P = page.me.fishing.P; tick(FS.fishY(P, F.t) > F.barY + P.bar / 2 + F.barV * 0.25 ? IN.ACTION : 0); }
  const pageOut = V.F ? V.F.out : -1;
  for (let i = 0; i < LAG + 2; i++) tick(0);
  assert.equal(p.ped.fishing, null);
  assert.equal(pageOut, 1, 'landed on the page');
  assert.equal((prof.creel || []).length, 1, 'and on the server');
  W.rand = rand;
  players.leave(W, p);
});

test('a deep-sea charter: offshore fish from a boat count; a legendary is news for everyone', () => {
  const { p, prof, conn } = joinPlayer(W);
  prof.weapons.rod = 0; prof.inventory.gameRod = 1;
  const desk = W.map.pois.find((q) => q.kind === 'charter');
  teleport(W, p.ped, desk.x, desk.y);
  economy.handleMenu(W, p, desk.id, 'deepsea');
  assert.equal(p.job.type, 'deepsea');
  const off = W.map.offshore[0];
  const boat = W.spawnVehicle('speedboat', off.x, off.y, 0, { npcOwned: false });
  teleport(W, p.ped, off.x, off.y); p.ped.vehId = boat.id; p.ped.seat = 0; boat.seats[0] = p.ped.id;
  const spot = fishing.spotFor(W, p.ped);
  assert.ok(spot && spot.boat === boat.id, 'over the side');
  const it = players.findInteraction(W, p);
  assert.ok(it && /over the side/.test(it.label), `the prompt: ${it && it.label}`);
  // (the NPC boaters who cruise round anyone out on the water kept off it: one ramming this boat would pull the line in)
  const send0 = inputs(W, p), send = (bits, n = 1) => { for (let i = 0; i < n; i++) { calmWater(W, boat.id); send0(bits); } };
  const rand = W.rand; W.rand = mulberry32(31337);
  for (let k = 0; k < 3 && p.job; k++) {
    fishing.begin(W, p, fishing.spotFor(W, p.ped));
    const L = p.ped.fishing;
    send(IN.ACTION, 8); send(0);
    assert.equal(L.hab.water, W.clock.isNight ? 'deep' : 'offshore');
    assert.equal(L.rod, 'gameRod', 'the big-game rod out at sea');
    let n = 0; while (L.F.ph === PH.WAIT && n++ < 400) send(0);
    L.P.diff = 5; L.P.snap = false;   // (an easy one for the test)
    send(IN.ACTION);
    n = 0; while (p.ped.fishing && n++ < 3000) { const F = L.F, P = L.P; boat.vx = boat.vy = 0; send(FS.fishY(P, F.t) > F.barY + P.bar / 2 + F.barV * 0.25 ? IN.ACTION : 0); }
    assert.equal(L.F.out, 1, `fish ${k + 1} landed (${L.fish}, ph ${L.F.ph}; told: ${JSON.stringify(conn.sent.filter((q) => q && q.t !== 'me').slice(-3)).slice(0, 300)}; in the boat: ${p.ped.vehId === boat.id}, its speed ${Math.round(Math.hypot(boat.vx, boat.vy))})`);
  }
  assert.equal(p.job, null, 'the charter done');
  assert.equal(prof.creel.length, 3);
  W.rand = rand;
  // the news: a legendary landed goes out to everyone
  const heard = [], b0 = W.broadcast;
  W.broadcast = (ev) => { heard.push(ev); b0.call(W, ev); };
  fishing.cancel(W, p, null);
  const fake = { F: { out: 1 }, fish: 'bluethunder', lb: 1500, hab: { water: 'offshore' } };
  p.ped.fishing = { ...fake, F: { ...FS.newFight(), ph: PH.FIGHT, prog: 0.999 }, P: { bar: 1, reel: 1, diff: 0, fight: 'smooth', seed: 1, bite: 0, win: 1 }, x: off.x, y: off.y, sx: off.x, sy: off.y, a: 0, boat: boat.id, rod: 'gameRod', seq: -1, at: W.time };
  send(IN.ACTION, 2);
  W.broadcast = b0;
  assert.ok(heard.some((e) => e.e === 'toast' && /Blue Thunder/.test(e.text)), 'everyone hears about it');
  p.ped.vehId = 0; p.ped.seat = -1; boat.seats[0] = 0;
  W.remove(boat);
  players.leave(W, p);
});

test('a koi out of a park\'s pond is a crime (the owner: "if you get caught catching a koi from the midtown commons pond it is a crime"); other fish there aren\'t', () => {
  const b = fishing.bankNear(W, W.map.w * TILE / 2, W.map.h * TILE / 2, 700, (h) => h && h.spot === 'lily', null);
  assert.ok(b, 'a park pond on the test map (Greenfield Park\'s)');
  const { p, prof } = joinPlayer(W);
  prof.weapons.rod = 0;
  teleport(W, p.ped, b.x, b.y); p.ped.a = b.a;
  const catchOne = (f) => { p.devFish = { next: f, easy: true, now: true }; fishing.begin(W, p, fishing.spotFor(W, p.ped)); return playLine(W, p, { hold: 4 }); };
  const exp0 = prof.criminalExp || 0;
  assert.equal(catchOne('bluegill').F.out, 1);
  assert.equal(prof.criminalExp || 0, exp0, 'a bluegill from the park pond: fine');
  const L = catchOne('koi');
  assert.equal(L.F.out, 1);
  assert.equal(L.hab.spot, 'lily');
  assert.ok((prof.criminalExp || 0) > exp0, 'a koi from the park pond: a crime');
  players.leave(W, p);
});
