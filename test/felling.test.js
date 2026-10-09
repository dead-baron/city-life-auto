// Felling trees (task #358: shared/felling.js, server/systems/felling.js): the tools cut the sizes they can at their
// speeds; a tree falls away from the side it was cut from, hurts whoever it lands on by its size, and breaks into log
// bundles that carry and load like crates and sell at the hardware store; felling in town is vandalism; a stump grows
// back only when nobody's near; and the felled trees reach the client as a short list of numbers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer, run, teleport, players } from './helpers.js';
import { IN } from '../shared/input.js';
import { K } from '../shared/constants.js';
import { treeSize, TREE_SIZES, FELL_TOOLS, fellTime, bestTool, fallAngle, underFall, logSpots, codeAngle } from '../shared/felling.js';
import { TREE_REGROW_S, TREE_REGROW_NEAR, LOG_BUNDLE_PRICE, HARDHAT_GUARD } from '../shared/rules.js';
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

test('felling: logs by the tree\'s size; carried, loaded onto a pickup like crates, sold at the hardware store', () => {
  const w = makeWorld();
  const { p, prof } = joinPlayer(w);
  const big = findTree(w, 3, true, 40) || findTree(w, 2, true);
  const size = treeSize(big.p);
  felling.fell(w, big.i, null, 0);
  run(w, felling.FALL_S + 0.2);
  const logs = [...w.entities.values()].filter((e) => e.kind === K.CRATE && e.logs);
  assert.equal(logs.length, TREE_SIZES[size].logs, 'its log bundles');
  assert.equal(logSpots(big.p, 0, 1).length, TREE_SIZES[1].logs); assert.ok(TREE_SIZES[4].logs > TREE_SIZES[3].logs && TREE_SIZES[3].logs > TREE_SIZES[1].logs, 'more logs from bigger trees');
  // pick one up: the carry
  const c = logs[0];
  teleport(w, p.ped, c.x - 20, c.y);
  let act = players.findInteraction(w, p);
  assert.ok(act && /Pick up Log Bundle/.test(act.label), `the prompt (${act && act.label})`);
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
  assert.ok(act && /Sell the logs/.test(act.label), `the prompt (${act && act.label})`);
  act.run();
  assert.equal(prof.cash, cash0 + LOG_BUNDLE_PRICE, 'paid');
  assert.ok(!p.ped.carrying && !w.entities.has(c.id), 'the bundle is gone');
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
