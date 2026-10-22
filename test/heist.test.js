// Bank heists (the owner's #306: "heists and bank robberies" - server/systems/heist.js): the vault door behind a bank's
// counter, a thermal drill set on it, the alarm and 3 stars at once, the jams cleared at the drill, the vault open and
// its crates on the floor (hot money from the drawers), then cleaned out for a while; a drill left jammed taken away.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer, run, teleport } from './helpers.js';
import { HEIST } from '../shared/rules.js';
import { T, K } from '../shared/constants.js';
import { SHOPS } from '../shared/items.js';
import { vaultOf, bankAt } from '../shared/heist.js';
import * as heist from '../server/systems/heist.js';

const banks = (w) => w.map.walkIns.map((id) => w.map.buildings[id]).filter((b) => b && vaultOf(b));

test('every bank you can walk into has a vault door behind its counter you can stand at', () => {
  const w = makeWorld(), list = banks(w);
  assert.ok(list.length >= 3, `banks with a vault (${list.length})`);
  for (const b of list) {
    const v = vaultOf(b), wi = b.walkIn;
    assert.equal(w.map.tileAtPx(v.sx, v.sy), T.FLOOR, `${b.id}: the floor in front of the door`);
    assert.equal(bankAt(w.map, v.sx, v.sy), b, 'in the bank');
    const counterY = (v.u.counterRow + 0.5) * 32;
    assert.ok(wi.south ? v.sy < counterY : v.sy > counterY, 'behind the counter');
    assert.ok(Math.abs(v.sx - v.u.clerk.x) >= 56 && v.sx - v.x0 >= 20, `${b.id}: clear of the teller and the side wall`);
    assert.ok(Math.abs(v.x - v.u.clerk.x) >= 32, 'the door beside the teller');
  }
  assert.ok(SHOPS.fence.buy.some((o) => o.kind === 'item' && o.id === 'drill' && o.price === HEIST.drillPrice), 'the black market sells the drill');
});

test('a bank heist: the drill on the vault, the alarm, the jams, the vault open, cleaned out', () => {
  const w = makeWorld();
  const { p, prof } = joinPlayer(w, { cash: 0 });
  const b = banks(w)[0], v = vaultOf(b);
  teleport(w, p.ped, v.sx, v.sy);
  let a = heist.interaction(w, p);
  assert.ok(a && /thermal drill/.test(a.label) && !a.crime, `no drill: told what it takes (${a && a.label})`);
  prof.inventory.drill = 1;
  a = heist.interaction(w, p);
  assert.ok(a && /Set the thermal drill/.test(a.label) && a.crime === 'heist', a && a.label);
  const fel = prof.felonies || 0;
  w.events.length = 0;
  a.run();
  const V = heist.stateOf(w, b.id);
  assert.ok(V && V.st === 'drill', 'drilling');
  assert.ok(!prof.inventory.drill, 'the drill used');
  assert.ok(p.wanted >= 3, `3 stars at once (${p.wanted})`);
  assert.equal(prof.felonies, fel + 1, 'on the record');
  assert.ok(w.events.some((q) => q.ev.e === 'alarm') && w.events.some((q) => q.ev.e === 'vault' && q.ev.st === 'drill'), 'the alarm, the page told');
  assert.ok(p.robbedAt && p.robbedAt.bid === b.id, 'the scene (the police surround it)');
  // (the police kept out of it here: the drill is the test)
  p.heat = 0; p.wanted = 0;
  // the first jam stops it; cleared at the drill, it goes on
  let jams = 0, guard = 0;
  while (V.st === 'drill' && guard++ < 400) {
    run(w, 0.5);
    if (V.jammed) {
      jams++;
      const at = V.work;
      run(w, 4);
      assert.equal(V.work, at, 'jammed: no work done');
      a = heist.interaction(w, p);
      assert.match(a.label, /jammed/);
      a.run();
      assert.ok(!V.jammed, 'cleared');
    } else if (V.st === 'drill') assert.match(heist.interaction(w, p).label, /working through/);
  }
  assert.ok(jams >= 1 && jams <= HEIST.jams, `jammed ${jams} time(s)`);
  assert.equal(V.st, 'open', 'through');
  // the load on the floor in front of the door, the drawers' cash in the bag
  const crates = [...w.entities.values()].filter((e) => e.kind === K.CRATE && e.label === `${V.label} vault`);
  assert.equal(crates.length, (HEIST.load[V.tier] || HEIST.load.mid).length, 'the district\'s load');
  for (const c of crates) { assert.ok(c.contraband && c.tier >= 3, 'contraband, iron and gold'); assert.ok(Math.hypot(c.x - v.sx, c.y - v.sy) < 120, 'by the vault'); }
  assert.ok(prof.hot > 0, `hot money (${prof.hot})`);
  assert.match(heist.interaction(w, p).label, /open/);
  // shut after a while, cleaned out - another drill does nothing
  V.until = w.time; run(w, 0.2);
  assert.equal(V.st, 'shut');
  prof.inventory.drill = 1;
  assert.match(heist.interaction(w, p).label, /cleaned out/);
  assert.ok(!heist.start(w, p, b), 'not again yet');
  V.until = w.time; run(w, 0.2);
  assert.ok(!heist.stateOf(w, b.id), 'worth another go');
  assert.match(heist.interaction(w, p).label, /Set the thermal drill/);
});

test('a drill left jammed is taken away; a police officer can\'t start one, and takes one off', () => {
  const w = makeWorld();
  const { p, prof } = joinPlayer(w);
  const b = banks(w)[1] || banks(w)[0], v = vaultOf(b);
  teleport(w, p.ped, v.sx, v.sy);
  prof.inventory.drill = 1;
  assert.ok(heist.start(w, p, b));
  p.heat = 0; p.wanted = 0;
  const V = heist.stateOf(w, b.id);
  for (let k = 0; k < 200 && !V.jammed; k++) run(w, 0.5);
  assert.ok(V.jammed);
  V.jamT = w.time - HEIST.abandonS;
  run(w, 0.2);
  assert.equal(V.st, 'shut', 'the police took it');
  assert.ok(![...w.entities.values()].some((e) => e.kind === K.CRATE && e.label === `${V.label} vault`), 'nothing spilled');
  // an officer at a vault: no drill offered
  const w2 = makeWorld();
  const cop = joinPlayer(w2);
  cop.p.badge = true;
  cop.prof.inventory.drill = 1;
  teleport(w2, cop.p.ped, v.sx, v.sy);
  let a = heist.interaction(w2, cop.p);
  assert.ok(a && !a.crime && !/Set the/.test(a.label));
  // a crook's drill on the door: the officer takes it off (never clears a jam)
  const crook = joinPlayer(w2);
  crook.prof.inventory.drill = 1;
  teleport(w2, crook.p.ped, v.sx, v.sy);
  assert.ok(heist.start(w2, crook.p, b));
  const V2 = heist.stateOf(w2, b.id), sam = cop.prof.samaritan || 0;
  V2.jammed = true;
  a = heist.interaction(w2, cop.p);
  assert.match(a.label, /Take the drill off/);
  a.run();
  assert.equal(V2.st, 'shut', 'the job\'s off');
  assert.ok(cop.prof.samaritan > sam, 'Samaritan points');
});
