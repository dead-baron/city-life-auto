// Mining (server/systems/underground.js; the veins and ores are shared/underground.js's): the pickaxes' tiers gate the
// ores, a vein yields ore and is used up and grows back somewhere near, better ore deeper and further out, selling it,
// and the quarry with its veins and assay office.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer, run, teleport } from './helpers.js';
import { undergroundOf, ORES, ORE_BY_ID, PICKS, oreFor, UG } from '../shared/underground.js';
import { ITEMS, SHOPS, ORE_ITEMS } from '../shared/items.js';
import { VEIN_REGROW_S } from '../shared/rules.js';
import * as players from '../server/systems/players.js';
import * as economy from '../server/systems/economy.js';
import * as ug from '../server/systems/underground.js';

const act = (w, p) => players.findInteraction(w, p);

test('pickaxes: their tiers gate the ores; sold at the hardware store and the outfitters', () => {
  assert.deepEqual(Object.keys(PICKS).map((id) => PICKS[id].tier), [1, 2, 3, 4]);
  for (const id of Object.keys(PICKS)) assert.ok(ITEMS[id] && ITEMS[id].tool, `${id} is a tool`);
  for (const o of ORES) assert.ok(ITEMS[o.id] && ITEMS[o.id].sell > 0, `${o.id} is an item worth something`);
  assert.equal(ORE_BY_ID.diamond.tier, 4, 'a diamond needs the best pickaxe');
  assert.equal(ORE_BY_ID.coal.tier, 1, 'coal takes any pickaxe');
  const sells = (shop, id) => SHOPS[shop].buy.some((o) => o.id === id);
  assert.ok(sells('hardware', 'pickStone') && sells('hardware', 'pickSteel'), 'the hardware store sells pickaxes');
  assert.ok(sells('huntcamp', 'pickDiamond'), 'the outfitters have the diamond-tipped one');

  const w = makeWorld();
  const L = undergroundOf(w.map);
  const deep = L.veins.find((v) => v.need >= 3);
  assert.ok(deep, 'a vein that needs a steel pickaxe or better');
  const { p } = joinPlayer(w);
  if (deep.ug) ug.enterCave(w, p);
  teleport(w, p.ped, deep.x, deep.y);
  assert.match(act(w, p).label, /need a pickaxe/i, 'no pickaxe: nothing doing');
  p.profile.inventory.pickStone = 1;
  assert.match(act(w, p).label, /needs a/i, 'a stone pickaxe skids off it');
  assert.equal(ug.beginMining(w, p, deep.i), 'pick');
  p.profile.inventory.pickDiamond = 1;
  assert.match(act(w, p).label, /^Mine the/i, 'the diamond-tipped one bites');
});

test('veins: they yield ore, are used up, and grow back somewhere near', () => {
  const w = makeWorld();
  const L = undergroundOf(w.map);
  const v = L.veins.find((q) => !q.ug && q.need <= 2);
  assert.ok(v, 'a vein above ground');
  const { p } = joinPlayer(w);
  p.profile.inventory.pickIron = 1;
  teleport(w, p.ped, v.x, v.y);
  const a = act(w, p);
  assert.match(a.label, /^Mine the/);
  a.run();
  assert.ok(p.ped.mining, 'swinging the pickaxe');
  assert.match(act(w, p).label, /Mining/, 'the progress in the action label');
  run(w, PICKS.pickIron.s + 0.3);
  assert.ok(!p.ped.mining, 'done');
  assert.ok((p.profile.inventory[v.ore] || 0) >= 1, `got the ${v.ore}`);
  const st = ug.veinState(w, v.i);
  assert.ok(st.until > w.time, 'the vein is used up');
  const here = act(w, p);
  assert.ok(!here || /Worked out|Mine the/.test(here.label), 'nothing to mine where it was (or the next one along)');
  assert.notDeepEqual(v.alts[st.alt], v.alts[0], 'it grows back at another spot near by');
  assert.ok(Math.hypot(v.alts[st.alt].x - v.x, v.alts[st.alt].y - v.y) < 1600, '...near by');
  // walking off stops the work
  const v2 = L.veins.find((q) => !q.ug && q.need <= 2 && q.i !== v.i && ug.veinState(w, q.i).until <= w.time);
  teleport(w, p.ped, v2.alts[0].x, v2.alts[0].y);
  act(w, p).run();
  teleport(w, p.ped, v2.x + 200, v2.y);
  run(w, 0.3);
  assert.ok(!p.ped.mining, 'moving off stops the mining');
  // the regrow time
  w.time += VEIN_REGROW_S + 1;
  teleport(w, p.ped, v.alts[st.alt].x, v.alts[st.alt].y);
  assert.match(act(w, p).label, /^Mine the/, 'grown back');
});

test('better ores further out and deeper in', () => {
  const rank = (id) => ORE_BY_ID[id].rank;
  assert.ok(rank(oreFor(20000, 4, 0.5)) > rank(oreFor(2000, 0, 0.5)), 'deep in the wilds beats near town on the surface');
  assert.ok(rank(oreFor(30000, 0, 0.5)) >= rank(oreFor(5000, 0, 0.5)), 'further out is no worse');
  const w = makeWorld();
  const L = undergroundOf(w.map);
  const avg = (list) => list.reduce((a, v) => a + rank(v.ore), 0) / list.length;
  const top = L.veins.filter((v) => !v.ug), cave = L.veins.filter((v) => v.ug === UG.CAVE);
  const deep = cave.filter((v) => /crystal|den|pool/.test(v.where));
  assert.ok(top.length && cave.length && deep.length);
  assert.ok(avg(cave) > avg(top), 'the cave\'s ore is better than the quarry\'s');
  assert.ok(avg(deep) > avg(cave.filter((v) => /entrance|grotto/.test(v.where))), 'and better the deeper you go');
  assert.ok(L.veins.some((v) => v.ore === 'gem' || v.ore === 'diamond'), 'gems (a diamond now and then) deep down');
});

test('selling ore: pawn shops buy it, the quarry\'s assay office pays best', () => {
  const w = makeWorld();
  const assay = w.map.pois.find((q) => q.kind === 'assay');
  assert.ok(assay, 'the assay office at the quarry');
  for (const id of ORE_ITEMS) {
    assert.ok(SHOPS.pawn.sells.includes(id), `the pawn shop buys ${id}`);
    assert.ok(SHOPS.assay.sellPrice[id] > ITEMS[id].sell, `the assayer pays more for ${id}`);
  }
  const { p } = joinPlayer(w);
  p.profile.inventory.silverOre = 3;
  teleport(w, p.ped, assay.x, assay.y);
  const cash0 = p.profile.cash + p.profile.bank;
  economy.openMenu(w, p, assay);
  economy.handleMenu(w, p, assay.id, 's:silverOre');
  assert.equal(p.profile.inventory.silverOre || 0, 0, 'sold');
  assert.equal(p.profile.cash + p.profile.bank - cash0, 3 * SHOPS.assay.sellPrice.silverOre, 'at the assayer\'s price');
});

test('the quarry: a stepped pit with veins round its faces, the loading track, the office', () => {
  const w = makeWorld();
  const L = undergroundOf(w.map);
  const site = (w.map.countrySites || []).find((q) => q.type === 'quarry');
  assert.ok(site, 'the Granite Quarry');
  const pit = w.map.quarries[0];
  const inPit = L.veins.filter((v) => !v.ug && v.x >= pit.x && v.x <= pit.x + pit.w && v.y >= pit.y && v.y <= pit.y + pit.h);
  assert.ok(inPit.length >= 5, `veins round the pit's faces (${inPit.length})`);
  for (const v of inPit) assert.ok(!w.map.isWater(v.x, v.y), 'you can stand at them');
  assert.ok(w.map.props.some((q) => q && q.t === 'minecart' && q.x > pit.x + pit.w), 'an ore cart on the loading track by the pit');
});
