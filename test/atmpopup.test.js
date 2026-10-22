// ATMs no longer deposit on their own (the owner, 10-06: "a pop-up with 'Deposit all' and 'Use ATM', on foot only"):
// walking up to a cash machine banked every dollar on you. Now Act there opens its pop-up - Deposit all (one press, and
// it closes), or Use ATM for the machine's full menu (amounts in and out); and the robbery bag's row when you carry one.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer, run, teleport, players } from './helpers.js';
import * as economy from '../server/systems/economy.js';

test('an ATM: walking up banks nothing; its pop-up - Deposit all at a press, or the full menu', () => {
  const w = makeWorld();
  const { p, prof, conn } = joinPlayer(w, { cash: 420, bank: 1000 });
  const atm = w.map.atms[0];
  teleport(w, p.ped, atm.x + 8, atm.y + 6);
  run(w, 1);
  assert.equal(prof.cash, 420, 'nothing banked on its own');
  const a = players.findInteraction(w, p);
  assert.ok(a && /ATM - \$420 on you/.test(a.label), `the prompt (${a && a.label})`);
  a.run();
  const menu = [...conn.sent].reverse().find((m) => m && m.t === 'menu');
  assert.deepEqual(menu.opts.map((o) => o.id), ['dep:all', 'atmfull'], 'Deposit all, Use ATM');
  assert.ok(menu.opts[0].shut && /Deposit all \(\$420\)/.test(menu.opts[0].label), 'Deposit all closes the pop-up');
  // Deposit all: banked, and no menu after it (the page closes the pop-up)
  const n0 = conn.sent.filter((m) => m && m.t === 'menu').length;
  economy.handleMenu(w, p, atm.id, 'dep:all');
  assert.equal(prof.cash, 0); assert.equal(prof.bank, 1420);
  assert.equal(conn.sent.filter((m) => m && m.t === 'menu').length, n0, 'the pop-up isn\'t sent again');
  // Use ATM: the full menu - deposit and withdraw amounts
  economy.openMenu(w, p, atm);
  economy.handleMenu(w, p, atm.id, 'atmfull');
  const full = [...conn.sent].reverse().find((m) => m && m.t === 'menu');
  assert.ok(full.opts.some((o) => o.id === 'wd:100') && full.opts.some((o) => o.id === 'dep:100'), 'amounts in and out');
  economy.handleMenu(w, p, atm.id, 'wd:100');
  assert.equal(prof.cash, 100, 'withdrawn');
  // opened again: the pop-up again
  economy.openMenu(w, p, atm);
  assert.deepEqual([...conn.sent].reverse().find((m) => m && m.t === 'menu').opts.map((o) => o.id), ['dep:all', 'atmfull']);
});

test('an ATM is for someone on foot: not from a car', () => {
  const w = makeWorld();
  const { p, prof } = joinPlayer(w, { cash: 300, bank: 0 });
  const atm = w.map.atms[0];
  teleport(w, p.ped, atm.x + 8, atm.y + 6);
  const v = w.spawnVehicle('sedan', p.ped.x, p.ped.y, 0);
  p.ped.vehId = v.id; p.ped.seat = 0; v.seats[0] = p.ped.id; p.ped.hidden = true;
  assert.ok(p.ped.vehId, 'driving');
  const a = players.findInteraction(w, p);
  assert.ok(!a || !/ATM/.test(a.label), 'no ATM prompt from the driver\'s seat');
  economy.handleMenu(w, p, atm.id, 'dep:all');
  assert.equal(prof.cash, 300, 'nothing banked');
});
