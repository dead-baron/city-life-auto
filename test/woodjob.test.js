// Firewood orders (server/systems/woodjob.js): taken at a hardware store's counter (or a sawmill's card, or the phone's
// board), the bundles brought to the customer - carried and on a truck's bed - paid per bundle, the bonus for the lot.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer, teleport, players } from './helpers.js';
import { WOODJOB, FIREWOOD } from '../shared/rules-play.js';
import * as economy from '../server/systems/economy.js';
import * as phone from '../server/systems/phone.js';
import * as woodjob from '../server/systems/woodjob.js';
import * as cargo from '../server/systems/cargo.js';

const bundle = (w, x, y) => { const c = w.spawnCrate(1, x, y, { label: 'Firewood', value: 45, contraband: false }); c.logs = true; c.wood = true; return c; };

test('a firewood order: from the hardware store\'s counter, on the board, delivered carried and off the bed, paid per bundle and the bonus', () => {
  const w = makeWorld();
  assert.ok(woodjob.customers(w.map).length > 0, 'places that buy firewood');
  assert.ok(WOODJOB.per > FIREWOOD.mill, 'an order pays better than the mill');
  const { p, prof } = joinPlayer(w);
  const shop = w.map.pois.find((q) => q.kind === 'hardware');
  teleport(w, p.ped, shop.x, shop.y);
  const board = phone.boardFor(w, p);
  const e = board.jobs.find((j) => j.id === 'wood');
  assert.ok(e && /Firewood order/.test(e.title) && e.lo === woodjob.offerFor(w, p, p.ped.x, p.ped.y).n * WOODJOB.per, 'on the board');
  economy.handleMenu(w, p, shop.id, 'job:wood');
  const j = p.job;
  assert.ok(j && j.type === 'wood' && j.n >= WOODJOB.n[0] && j.n <= WOODJOB.n[1], 'taken');
  assert.equal(phone.jobTarget(w, p).stage, 'gather', 'first: cut the wood');
  const to = w.map.pois[j.to], cash0 = prof.cash;
  // one carried to the door
  teleport(w, p.ped, to.x, to.y);
  const c = bundle(w, p.ped.x + 6, p.ped.y); cargo.pickUp(w, p.ped, c);
  assert.equal(phone.jobTarget(w, p).stage, 'go');
  let a = players.findInteraction(w, p);
  assert.match(a.label, /Hand over the firewood for the order \(1\//);
  a.run();
  assert.equal(prof.cash, cash0 + WOODJOB.per);
  // the rest on a truck's bed
  const v = w.spawnVehicle('flatbed', to.x, to.y, 0, { npcOwned: false });
  for (let i = 0; i < j.n - 1; i++) { const b = bundle(w, v.x, v.y); b.state = 'loaded'; b.parent = v.id; b.slot = i; v.cargo[i] = b.id; }
  p.ped.vehId = v.id; p.ped.seat = 0; v.seats[0] = p.ped.id;
  a = players.findInteraction(w, p);
  assert.match(a.label, /Unload \d+ bundles? of firewood for the order/);
  a.run();
  assert.equal(prof.cash, cash0 + j.n * WOODJOB.per + WOODJOB.bonus, 'all paid, the bonus too');
  assert.ok(!p.job, 'the order filled');
});
