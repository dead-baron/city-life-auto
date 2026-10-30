// Felling trees (task #358: shared/felling.js, server/systems/felling.js): the tools cut the sizes they can at their
// speeds; a tree falls away from the side it was cut from, hurts whoever it lands on by its size, and breaks into log
// trunk lying there to be cut into rounds, each a firewood bundle that carries and loads like a crate, sells at the
// hardware store (more at a sawmill) and stacks at your home's garage; felling in town is vandalism; a stump grows back
// only when nobody's near; and the felled trees and trunks reach the client as short lists of numbers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer, run, teleport, players } from './helpers.js';
import { IN } from '../shared/input.js';
import { K } from '../shared/constants.js';
import { treeSize, TREE_SIZES, FELL_TOOLS, fellTime, bestTool, fallAngle, underFall, roundSpots, codeAngle } from '../shared/felling.js';
import { TREE_REGROW_S, TREE_REGROW_NEAR, LOG_BUNDLE_PRICE, HARDHAT_GUARD } from '../shared/rules.js';
import { FIREWOOD } from '../shared/rules-play.js';
import * as homeups from '../server/systems/homeups.js';
import * as economy from '../server/systems/economy.js';
import { ITEMS, SHOPS } from '../shared/items.js';
import * as felling from '../server/systems/felling.js';
import * as cargo from '../server/systems/cargo.js';
import { wildStyle } from '../server/systems/wildlife.js';

// hold the action button down for s seconds (one input per tick, like a client)
function hold(w, p, s, bits = IN.ACTION) {
  for (let k = 0; k < Math.round(s * 20); k++) { players.queueInput(p, { seq: p.ack + 1, bits, mx: 0, my: 0, aim: 0 }); w.step(); }
}
function release(w, p) { players.queueInput(p, { seq: p.ack + 1, bits: 0, mx: 0, my: 0, aim: 0 }); w.step(); }
// a tree of this size, in the wilds or in town, with open ground round it (no other tree within r px)
function findTree(w, size, wild, r = 60) {
  const props = w.map.props;
  for (let i = 0; i < props.length; i++) {
    const p = props[i];
    if (treeSize(p) !== size || !!wildStyle(w.map, p.x, p.y) !== wild || p.broken || felling.isFelled(w, i)) continue;
    if (props.some((q, j) => j !== i && treeSize(q) && Math.abs(q.x - p.x) < r && Math.abs(q.y - p.y) < r)) continue;
    return { i, p };
  }
  return null;
}
const stand = (w, ped, tree, side = Math.PI) => {   // west of the trunk by default, facing it
  const r = (w.map.propSolid.get(tree.i)?.r || 8) + 10;
  teleport(w, ped, tree.p.x + Math.cos(side) * r, tree.p.y + Math.sin(side) * r);
  ped.a = Math.atan2(tree.p.y - ped.y, tree.p.x - ped.x); ped.vx = 0; ped.vy = 0;
};

test('felling: each tool cuts the sizes it can, at its speed (the chainsaw fastest); the best one in the bag does it', () => {
  assert.ok(fellTime('hatchet', 1) < Infinity && fellTime('hatchet', 2) === Infinity, 'the hatchet: small trees only');
  assert.ok(fellTime('axe', 3) < Infinity && fellTime('axe', 4) === Infinity, 'the axe: not the giant redwoods');
  for (const t of ['fellaxe', 'chainsaw']) assert.ok(fellTime(t, 4) < Infinity, `the ${t} takes a giant`);
  assert.ok(fellTime('chainsaw', 4) < fellTime('fellaxe', 4) && fellTime('fellaxe', 2) < fellTime('axe', 2) && fellTime('axe', 1) < fellTime('hatchet', 1), 'better tools cut faster');
  for (let s = 1; s < 4; s++) assert.ok(fellTime('axe', s + 1) > fellTime('axe', s), 'bigger trees take longer');
  assert.ok(fellTime('fellaxe', 4) > 20, `a giant redwood takes a long time (${fellTime('fellaxe', 4)}s)`);
  assert.equal(bestTool({ hatchet: 1, chainsaw: 1 }, 1), 'chainsaw');
  assert.equal(bestTool({ hatchet: 1, axe: 1 }, 4), null);
  assert.equal(treeSize({ t: 'redwood', sp: 'giant' }), 4); assert.equal(treeSize({ t: 'redwood', sp: 'redwood2' }), 3);
  assert.equal(treeSize({ t: 'tree_a' }), 1); assert.equal(treeSize({ t: 'tree_b', sp: 'oak' }), 2); assert.equal(treeSize({ t: 'lamp' }), 0);
  for (const id of ['hatchet', 'axe', 'fellaxe', 'chainsaw', 'sawfuel']) assert.ok(SHOPS.hardware.buy.some((o) => o.id === id), `the hardware store sells the ${id}`);
  for (const id of Object.keys(FELL_TOOLS)) assert.ok(ITEMS[id] && ITEMS[id].fell, id);

  // in the game: a hatchet won't take a giant; at a small tree it fells it in about its time, held
  const w = makeWorld();
  const { p, prof } = joinPlayer(w);
  prof.inventory.hatchet = 1;
  const giant = findTree(w, 4, true, 30);
  assert.ok(giant, 'a giant redwood');
  stand(w, p.ped, giant);
  let act = players.findInteraction(w, p);
  assert.ok(act && act.passive && /Too big/.test(act.label) && /felling axe or a chainsaw/.test(act.label), `the prompt (${act && act.label})`);
  const small = findTree(w, 1, true);
  assert.ok(small, 'a small tree in the wilds');
  stand(w, p.ped, small);
  act = players.findInteraction(w, p);
  assert.ok(act && /Hold to fell/.test(act.label) && /hatchet/.test(act.label), `the prompt (${act && act.label})`);
  const t = fellTime('hatchet', 1);
  hold(w, p, t * 0.8);
  assert.ok(p.ped.chop && !felling.isFelled(w, small.i), 'still cutting');
  assert.match(players.findInteraction(w, p).label, /Chopping .* \d+% \(keep holding\)/);
  // letting go stops it; the cut stays in the tree
  release(w, p); run(w, 0.2);
  assert.ok(!p.ped.chop, 'let go: stopped');
  hold(w, p, 0.05); hold(w, p, t * 0.3);
  assert.ok(felling.isFelled(w, small.i), 'felled, the earlier cut counted');
  assert.ok(w.map.propSolid.get(small.i).off, 'no trunk to walk into');
  // the chainsaw, on a giant: much faster than a felling axe would be, and it burns fuel
  prof.inventory.chainsaw = 1; prof.sawFuel = 200;
  stand(w, p.ped, giant);
  release(w, p); hold(w, p, 0.05); hold(w, p, fellTime('chainsaw', 4) + 0.3);
  assert.ok(felling.isFelled(w, giant.i), 'the chainsaw brought the giant down');
  assert.ok(prof.sawFuel < 200 - fellTime('chainsaw', 4) + 1, 'and used its fuel');
});

test('felling: the tree falls away from the cutter, and it hurts whoever it lands on by its size (a hard hat helps)', () => {
  const tree = { x: 1000, y: 1000 };
  assert.ok(Math.abs(fallAngle(tree, 980, 1000)) < 1e-9, 'cut from the west: it falls east');
  assert.ok(Math.abs(fallAngle(tree, 1000, 1020) + Math.PI / 2) < 1e-9, 'cut from the south: it falls north');
  assert.ok(underFall(tree, 0, 2, 1060, 1002) > 0.5, 'under the trunk'); assert.equal(underFall(tree, 0, 2, 940, 1000), 0, 'behind the cutter: clear');
  assert.equal(underFall(tree, 0, 2, 1060, 1100), 0, 'off to the side: clear');

  const w = makeWorld();
  const { p, prof } = joinPlayer(w);
  const { p: q } = joinPlayer(w);
  prof.inventory.fellaxe = 1;
  // a tree cut from the south falls north: someone standing there is caught
  const med = findTree(w, 2, true);
  assert.ok(med, 'a tree in the woods');
  stand(w, p.ped, med, Math.PI / 2);
  const S = TREE_SIZES[2];
  teleport(w, q.ped, med.p.x, med.p.y - S.len * 0.6);
  const hp0 = q.ped.hp;
  hold(w, p, 0.05); hold(w, p, fellTime('fellaxe', 2) + 0.2);
  assert.ok(felling.isFelled(w, med.i));
  const f = w.felled.get(med.i), da = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
  assert.ok(da(codeAngle(f.q), -Math.PI / 2) < 0.5, `it fell north, away from the cutter (${codeAngle(f.q).toFixed(2)})`);
  assert.ok(da(codeAngle(f.q), fallAngle(med.p, p.ped.x, p.ped.y)) < 0.1, 'straight away from where they stood');
  run(w, felling.FALL_S + 0.2);
  const hurt = hp0 - q.ped.hp;
  assert.ok(hurt > S.dmg * 0.3 && !q.ped.dead, `caught by a tree: hurt (${hurt.toFixed(0)}), alive`);
  // a giant redwood kills; a hard hat takes some of a smaller blow
  const { p: r } = joinPlayer(w);
  const giant = findTree(w, 4, true, 30);
  felling.fell(w, giant.i, null, 0);
  teleport(w, r.ped, giant.p.x + TREE_SIZES[4].len * 0.5, giant.p.y);
  run(w, felling.FALL_S + 0.2);
  assert.ok(r.ped.dead, 'crushed by a giant redwood');
  const { p: h, prof: hprof } = joinPlayer(w);
  const { p: n } = joinPlayer(w);
  hprof.inventory.hardhat = 1; hprof.lightSel = 'hardhat';
  run(w, 0.1);
  assert.ok(h.ped.hardhat, 'wearing the hard hat');
  const two = findTree(w, 2, true);
  felling.fell(w, two.i, null, 0);
  teleport(w, h.ped, two.p.x + 50, two.p.y);
  teleport(w, n.ped, two.p.x + 50, two.p.y + 1);
  const h0 = h.ped.hp, n0 = n.ped.hp;
  run(w, felling.FALL_S + 0.2);
  const dh = h0 - h.ped.hp, dn = n0 - n.ped.hp;
  assert.ok(dh > 0 && dn > 0 && Math.abs(dh - dn * (1 - HARDHAT_GUARD)) < 4, `the hard hat took some of it (${dh.toFixed(1)} vs ${dn.toFixed(1)})`);
});

test('felling: the trunk lies where it fell, cut into rounds by the tree\'s size - each a firewood bundle, carried and loaded like a crate, sold at the hardware store', () => {
  const w = makeWorld();
  const { p, prof } = joinPlayer(w);
  prof.inventory.axe = 1;
  const big = findTree(w, 3, true, 40) || findTree(w, 2, true);
  const size = treeSize(big.p), n = TREE_SIZES[size].logs;
  felling.fell(w, big.i, null, 0);
  run(w, felling.FALL_S + 0.2);
  assert.equal([...w.entities.values()].filter((e) => e.kind === K.CRATE && e.logs).length, 0, 'no crates out of nowhere: the trunk lies there');
  assert.deepEqual(felling.logList(w), [big.i, size, (1 << n) - 1], 'the trunk, every round uncut, for a player joining');
  assert.ok(TREE_SIZES[4].logs > TREE_SIZES[3].logs && TREE_SIZES[3].logs > TREE_SIZES[1].logs && TREE_SIZES[1].logs >= 2, 'more rounds from bigger trees, two at least');
  // at the trunk with the axe: hold to cut it up, round after round
  const spots = roundSpots(big.p, 0, size);
  teleport(w, p.ped, spots[0][0], spots[0][1] + TREE_SIZES[size].wide / 2 + 10); p.ped.a = -Math.PI / 2;
  let act = players.findInteraction(w, p);
  assert.ok(act && /cut the trunk into rounds/.test(act.label) && new RegExp(`${n} rounds left`).test(act.label), `the prompt (${act && act.label})`);
  const per = FIREWOOD.work / FELL_TOOLS.axe.rate;
  hold(w, p, 0.05); hold(w, p, per * 0.6);
  assert.match(players.findInteraction(w, p).label, /Cutting a round .* \d+% \(keep holding\)/);
  hold(w, p, per * 0.6);
  let wood = [...w.entities.values()].filter((e) => e.kind === K.CRATE && e.wood);
  assert.equal(wood.length, 1, 'one round off: a firewood bundle');
  assert.equal(wood[0].label, felling.FIREWOOD_LABEL, 'labelled firewood: the stacked logs the clients draw');
  assert.equal(wood[0].tier, 1, 'a crate like any other');
  // keep holding, moving along the trunk: the rest of it
  for (let k = 0; k < n * 3 && w.logs.has(big.i); k++) {
    const L = w.logs.get(big.i), j = [...Array(n).keys()].find((q) => L.m & (1 << q));
    if (!p.ped.chop) { teleport(w, p.ped, spots[j][0], spots[j][1] + TREE_SIZES[size].wide / 2 + 10); p.ped.a = -Math.PI / 2; release(w, p); hold(w, p, 0.05); }
    hold(w, p, per + 0.1);
  }
  assert.ok(!w.logs.has(big.i), 'the trunk all cut up');
  wood = [...w.entities.values()].filter((e) => e.kind === K.CRATE && e.wood);
  assert.equal(wood.length, n, `a bundle a round (${n})`);
  assert.deepEqual(felling.logList(w), [], 'nothing lying there');
  // pick one up: the carry
  release(w, p);
  const c = wood[0];
  teleport(w, p.ped, c.x - 20, c.y);
  act = players.findInteraction(w, p);
  assert.ok(act && /Pick up/.test(act.label), `the prompt (${act && act.label})`);
  act.run();
  assert.equal(p.ped.carrying, c.id, 'carrying the bundle');
  // onto a pickup's bed
  const v = w.spawnVehicle('pickup', p.ped.x + 40, p.ped.y, 0, { npcOwned: false });
  const slot = cargo.findFreeSlot(w, p.ped);
  assert.ok(slot && slot.v === v, 'a slot in the bed');
  act = players.findInteraction(w, p);
  assert.ok(/Load onto/.test(act.label), act.label);
  act.run();
  assert.equal(c.state, 'loaded'); assert.ok(v.cargo.includes(c.id), 'in the bed like a crate');
  // ...and at the hardware store, sold
  cargo.pickUp(w, p.ped, c);
  const shop = w.map.pois.find((q) => q.kind === 'hardware');
  teleport(w, p.ped, shop.x, shop.y);
  const cash0 = prof.cash;
  act = players.findInteraction(w, p);
  assert.ok(act && /Sell the firewood/.test(act.label), `the prompt (${act && act.label})`);
  act.run();
  assert.equal(prof.cash, cash0 + LOG_BUNDLE_PRICE, 'paid');
  assert.ok(!p.ped.carrying && !w.entities.has(c.id), 'the bundle is gone');
});

test('firewood: driven to a buyer on the bed it sells by the load (a sawmill pays more); at your own garage it\'s stacked and kept', () => {
  const w = makeWorld();
  const { p, prof } = joinPlayer(w, { bank: 1e6 });
  const bundle = (x, y) => { const c = w.spawnCrate(1, x, y, { label: felling.FIREWOOD_LABEL, value: LOG_BUNDLE_PRICE, contraband: false }); c.logs = true; c.wood = true; return c; };
  const loaded = (v, k) => { for (let i = 0; i < k; i++) { const c = bundle(v.x, v.y); c.state = 'loaded'; c.parent = v.id; c.slot = i; v.cargo[i] = c.id; } };
  // at the hardware store, in a pickup with two on the back
  const shop = w.map.pois.find((q) => q.kind === 'hardware');
  const v = w.spawnVehicle('flatbed', shop.x, shop.y, 0, { npcOwned: false });
  loaded(v, 2);
  p.ped.vehId = v.id; p.ped.seat = 0; v.seats[0] = p.ped.id;
  let act = players.findInteraction(w, p);
  assert.ok(act && /Sell the 2 bundles of wood/.test(act.label), `the prompt (${act && act.label})`);
  const cash0 = prof.cash;
  act.run();
  assert.equal(prof.cash, cash0 + 2 * LOG_BUNDLE_PRICE, 'paid for the load');
  assert.ok(v.cargo.every((id) => !id), 'the bed empty');
  // a sawmill (World v3's Timber Bend Sawmill; on the test map, one like it): more a bundle
  const mill = { ...shop, id: 99999, kind: 'delivery', label: 'Timber Bend Sawmill', x: shop.x + 3000, y: shop.y };
  w.map.pois.push(mill);
  try {
    v.x = mill.x; v.y = mill.y; w.place(v);
    loaded(v, 1);
    act = players.findInteraction(w, p);
    assert.ok(act && /Timber Bend Sawmill/.test(act.label) && act.label.includes(`+$${FIREWOOD.mill}`), `the sawmill's prompt (${act && act.label})`);
    assert.ok(FIREWOOD.mill > LOG_BUNDLE_PRICE, 'the mill pays better');
    act.run();
  } finally { w.map.pois.pop(); }
  // home: buy a house, drive up to its garage with firewood on the back - stacked there, kept as a count
  p.ped.vehId = 0; p.ped.seat = -1; v.seats[0] = 0;
  const h = w.map.homes.find((q) => q.kind === 'house' && !w.homeOwner.has(q.id));
  teleport(w, p.ped, h.x, h.y);
  economy.handleMenu(w, p, w.map.pois.find((q) => q.kind === 'home' && q.home === h.id).id, 'hbuy');
  assert.equal(w.homeOwner.get(h.id), p.pid, 'my home');
  v.x = h.garage.x; v.y = h.garage.y; v.vx = 0; v.vy = 0; w.place(v);
  loaded(v, 2);
  p.ped.vehId = v.id; p.ped.seat = 0; v.seats[0] = p.ped.id;
  act = players.findInteraction(w, p);
  assert.ok(act && /Your garage: stack the 2 bundles of firewood, or put them towards an upgrade/.test(act.label), `the prompt (${act && act.label})`);
  act.run();
  economy.handleMenu(w, p, homeups.UP_POI, 'u:stack');   // (the garage's menu: stack them - or towards an upgrade, homeups.test.js)
  assert.equal(felling.woodAt(p, h), 2, 'two bundles kept at that home');
  assert.ok(v.cargo.every((id) => !id), 'off the bed');
  // carried up to it on foot: one more
  p.ped.vehId = 0; p.ped.seat = -1; v.seats[0] = 0; w.remove(v);
  teleport(w, p.ped, h.garage.x + 30, h.garage.y);
  const c = bundle(p.ped.x + 10, p.ped.y);
  cargo.pickUp(w, p.ped, c);
  assert.equal(p.ped.carrying, c.id);
  act = players.findInteraction(w, p);
  assert.ok(act && /Your garage: stack the firewood/.test(act.label), `on foot (${act && act.label})`);
  act.run();
  economy.handleMenu(w, p, homeups.UP_POI, 'u:stack');
  assert.equal(homeups.matsAt(prof, h.id).wood, 3, 'three now');
  assert.equal(felling.woodAt(p, h), 3);
});

test('felling: in town it\'s vandalism (a little heat), in the wilds free; stumps grow back only when nobody is near; the client gets a short list', () => {
  const w = makeWorld();
  const { p, prof } = joinPlayer(w);
  prof.inventory.axe = 1;
  const town = findTree(w, 1, false);
  assert.ok(town, 'a street tree');
  stand(w, p.ped, town);
  assert.match(players.findInteraction(w, p).label, /vandalism/);
  const exp0 = prof.criminalExp;
  hold(w, p, 0.05); hold(w, p, fellTime('axe', 1) + 0.2);
  assert.ok(felling.isFelled(w, town.i));
  assert.ok(prof.criminalExp > exp0, 'a crime');
  const wild = findTree(w, 1, true);
  stand(w, p.ped, wild);
  const exp1 = prof.criminalExp;
  release(w, p); hold(w, p, 0.05); hold(w, p, fellTime('axe', 1) + 0.2);
  assert.ok(felling.isFelled(w, wild.i));
  assert.equal(prof.criminalExp, exp1, 'free in the wilds');
  // what a joining player is told: [index, angle code, ...]
  const list = felling.felledList(w);
  assert.equal(list.length, 4);
  assert.ok(list.every((n) => Number.isInteger(n) && n >= 0), 'plain small numbers');
  assert.ok(list[0] === town.i && list[2] === wild.i && list[1] < 64 && list[3] < 64);
  // regrowth: not while someone's near...
  run(w, felling.FALL_S + 0.5);
  w.time += TREE_REGROW_S + 1;
  run(w, 2.1);
  assert.ok(felling.isFelled(w, wild.i), 'not with someone standing by it');
  // ...but once they've gone
  teleport(w, p.ped, wild.p.x + TREE_REGROW_NEAR * 3, wild.p.y + TREE_REGROW_NEAR * 3);
  const ev0 = w.globalEvents.length;
  run(w, 2.1);
  assert.ok(!felling.isFelled(w, wild.i), 'grown back');
  assert.ok(!w.map.propSolid.get(wild.i).off, 'solid again');
  assert.ok(felling.felledList(w).length <= 2);
  assert.ok(w.globalEvents.length >= ev0);
});

test('the clients draw it: the tree tipping, bouncing and settling, its trunk cut a round at a time, the police dog\'s lead (render/carryfx.js), and the firewood bundle in both views', async () => {
  const { CarryFx } = await import('../client/render/carryfx.js');
  const calls = { moveTo: 0, lineTo: 0, ellipse: 0, quadraticCurveTo: 0 };
  const g = new Proxy({}, { get: (o, k) => (k in calls ? (...a) => { calls[k]++; void a; } : typeof k === 'string' && /^[a-z]/.test(k) && !['lineWidth', 'strokeStyle', 'fillStyle', 'lineCap', 'globalAlpha'].includes(k) ? () => {} : o[k]), set: (o, k, v) => { o[k] = v; return true; } });
  const w = makeWorld();
  const tree = findTree(w, 2, true);
  const fx = { smoke() {}, spawn() {}, ring() {} };
  const S = { fx, map: w.map, ents: new Map(), logs0: null };
  const C = new CarryFx(S);
  const F = { view: { x0: tree.p.x - 600, x1: tree.p.x + 600, y0: tree.p.y - 600, y1: tree.p.y + 600 } };
  C.fall(tree.p.x, tree.p.y, 0, 2, false, tree.i);
  C.over(g, F);
  const L = C.logs.get(tree.i);
  assert.ok(L && L.m === (1 << TREE_SIZES[2].logs) - 1, 'falling: every round on the trunk');
  // through the fall, the bounce and the settle: the trunk's top goes from up the screen to flat out along the ground
  const tip = (t) => { L.t0 = performance.now() / 1000 - t; return C._pt(L, TREE_SIZES[2].len, Math.PI / 2 * Math.min(1, (t / felling.FALL_S) ** 2)); };
  assert.ok(tip(0)[1] < tree.p.y - 50 && Math.abs(tip(felling.FALL_S)[1] - tree.p.y) < 1, 'upright, then flat');
  for (const t of [0.3, 0.9, 1.25, 1.4, 2, 5]) { L.t0 = performance.now() / 1000 - t; C.over(g, F); }
  assert.ok(calls.lineTo > 10 && calls.ellipse > 10, 'trunk and crown drawn');
  C.cut({ i: tree.i, m: L.m & ~1, x: tree.p.x + 20, y: tree.p.y });
  assert.equal(C.logs.get(tree.i).m, L.m, 'a round off');
  C.cut({ i: tree.i, m: 0 });
  assert.ok(!C.logs.has(tree.i), 'all cut up: gone');
  // a player joining: the trunks lying there
  w.map.props[tree.i].broken = { a: 0, f: 1 };
  S.logs0 = [tree.i, 2, 3];
  C.over(g, F);
  assert.equal(C.logs.get(tree.i).m, 3, 'from the welcome');
  delete w.map.props[tree.i].broken;
  // the police dog on its lead
  S.ents.set(1, { id: 1, kind: K.PED, rx: tree.p.x, ry: tree.p.y, ra: 0, d: { ar: 'cop' } });
  S.ents.set(2, { id: 2, kind: K.PED, rx: tree.p.x + 20, ry: tree.p.y, ra: 0, parent: 1, d: { ar: 'pet:dog_shepherd' } });
  const q0 = calls.quadraticCurveTo;
  C.over(g, F);
  assert.equal(calls.quadraticCurveTo, q0 + 1, 'the lead drawn');
  // the bundle: the classic view's own drawing, art v2's stacked-log model
  const { drawCrate } = await import('../client/render/sprites.js');
  const arcs = [];
  const g2 = new Proxy({}, { get: (o, k) => (k === 'arc' ? (...a) => arcs.push(a) : k === 'drawImage' ? () => assert.fail('not the wooden box\'s frame') : typeof k === 'string' && /^[a-z]/.test(k) && !['lineWidth', 'strokeStyle', 'fillStyle'].includes(k) ? () => {} : o[k]), set: (o, k, v) => { o[k] = v; return true; } });
  drawCrate(g2, 1, felling.FIREWOOD_LABEL, 0);
  assert.equal(arcs.length, 5, 'the classic view: five log ends stacked');
  const A = await import('../client/art2/game/actors.js');
  assert.notEqual(A.crateKey(1, felling.FIREWOOD_LABEL), A.crateKey(1, ''), 'its own sprite, not a wooden box');
  const spr = A.crateSprite(1, felling.FIREWOOD_LABEL);
  assert.ok(spr && spr.w > 8 && spr.h > 6, 'the stacked logs');
});
