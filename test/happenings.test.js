// Little happenings round the players (server/systems/happenings.js): a street fight to break up, someone who collapsed
// to help up, a dropped wallet to hand back; and lost pets (pets.js) rarer, their owners further off.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer, run, teleport } from './helpers.js';
import { K, T } from '../shared/constants.js';
import { DISTRICTS } from '../shared/map.js';
import { PET_EVERY_S, PET_OWNER_PX, FIGHT_BREAKUP_SAMARITAN, FAINT_HELP_REWARD, WALLET_SAMARITAN } from '../shared/rules.js';
import * as happenings from '../server/systems/happenings.js';
import * as players from '../server/systems/players.js';
import * as events from '../server/systems/events.js';
import * as cargo from '../server/systems/cargo.js';
import * as pets from '../server/systems/pets.js';

// a pavement in the middle of Downtown
function downtown(w) {
  const m = w.map;
  let sx = 0, sy = 0, n = 0;
  const pts = [];
  for (let ty = 0; ty < m.h; ty += 2) for (let tx = 0; tx < m.w; tx += 2) {
    if (DISTRICTS[m.dist[ty * m.w + tx]].name !== 'Downtown') continue;
    sx += tx; sy += ty; n++;
    if (m.tiles[ty * m.w + tx] === T.SIDEWALK) pts.push([tx, ty]);
  }
  const cx = sx / n, cy = sy / n;
  pts.sort((a, b) => (a[0] - cx) ** 2 + (a[1] - cy) ** 2 - ((b[0] - cx) ** 2 + (b[1] - cy) ** 2));
  return { x: pts[0][0] * 32 + 16, y: pts[0][1] * 32 + 16 };
}
function setup() {
  const w = makeWorld({ npcBudget: 120 });
  const { p } = joinPlayer(w);
  const at = downtown(w);
  teleport(w, p.ped, at.x, at.y);
  run(w, 3);   // (people about)
  w.nextHappenAt = 1e9; w.nextPetAt = 1e9;   // (only what the test starts)
  return { w, p };
}
const ev = (w, kind) => (w.happenings || []).find((e) => e.kind === kind && e.until > w.time);
const walkTo = (w, p, x, y) => { teleport(w, p.ped, x, y); w.step(); };

test('a street fight: two passers-by come to blows, a crowd watches; step in and break it up', () => {
  const { w, p } = setup();
  assert.ok(happenings.startNow(w, 'fight', p), 'started');
  const e = ev(w, 'fight');
  assert.ok(e, 'on the radar');
  const a = w.get(e.a), b = w.get(e.b);
  assert.equal(a.npc.state, 'fight'); assert.equal(a.npc.target, b.id);
  assert.equal(b.npc.state, 'fight'); assert.equal(b.npc.target, a.id);
  run(w, 2);
  walkTo(w, p, a.x + 30, a.y);
  const act = players.findInteraction(w, p);
  assert.ok(act && /Break up the fight/.test(act.label), act && act.label);
  const sam = p.profile.samaritan;
  act.run();
  assert.equal(p.profile.samaritan, sam + FIGHT_BREAKUP_SAMARITAN);
  assert.notEqual(a.npc.state, 'fight'); assert.notEqual(b.npc.state, 'fight');
  run(w, 1);
  assert.ok(!ev(w, 'fight'), 'over');
});

test('left alone, a street fight ends with one of them on the ground - nobody is killed', () => {
  const { w, p } = setup();
  teleport(w, p.ped, p.ped.x, p.ped.y);
  assert.ok(happenings.startNow(w, 'fight', p));
  const e = ev(w, 'fight'), a = w.get(e.a), b = w.get(e.b);
  for (let i = 0; i < 50 && ev(w, 'fight'); i++) run(w, 1);
  assert.ok(!ev(w, 'fight'), 'it ended');
  assert.ok(!a.dead && !b.dead, 'both alive');
  assert.ok(!a.npc.keep && !b.npc.keep, 'let go (they can be cleared away again)');
});

test('someone collapses: help them up for a thank-you; nobody helps - they come round and limp off', () => {
  const { w, p } = setup();
  assert.ok(happenings.startNow(w, 'faint', p));
  const e = ev(w, 'faint'), a = w.get(e.who);
  assert.ok(a.passedOut, 'down on the pavement');
  walkTo(w, p, a.x + 20, a.y);
  const act = players.findInteraction(w, p);
  assert.ok(act && /Help them up/.test(act.label), act && act.label);
  const cash = p.profile.cash;
  act.run();
  assert.equal(p.profile.cash, cash + FAINT_HELP_REWARD);
  assert.ok(!a.passedOut, 'back on their feet');
  // another, left alone
  w.lastHappening = null;
  assert.ok(happenings.startNow(w, 'faint', p));
  const e2 = ev(w, 'faint'), c = w.get(e2.who);
  teleport(w, p.ped, c.x + 300, c.y);
  for (let i = 0; i < 80 && ev(w, 'faint'); i++) run(w, 1);
  assert.ok(!c.passedOut && !c.dead, 'came round by themselves');
});

test('a dropped wallet: pick it up and hand it back to its owner (the guide arrow shows them)', () => {
  const { w, p } = setup();
  assert.ok(happenings.startNow(w, 'wallet', p));
  const e = ev(w, 'wallet'), owner = w.get(e.who), bag = w.get(e.bag);
  assert.ok(bag && bag.items.wallet === 1, 'on the ground');
  assert.equal(owner.npc.state, 'waitHelp', 'they stopped, patting their pockets');
  walkTo(w, p, bag.x, bag.y);
  cargo.lootBag(w, p, bag);
  assert.equal(p.profile.inventory.wallet, 1, 'picked up');
  const tgt = events.forPlayer(w, p).find((t) => t.k === 'walletret');
  assert.ok(tgt && Math.hypot(tgt.x - owner.x, tgt.y - owner.y) < 4, 'the arrow points at the owner');
  walkTo(w, p, owner.x + 20, owner.y);
  const act = players.findInteraction(w, p);
  assert.ok(act && /Give the wallet back/.test(act.label), act && act.label);
  const sam = p.profile.samaritan;
  act.run();
  assert.equal(p.profile.samaritan, sam + WALLET_SAMARITAN);
  assert.ok(!(p.profile.inventory.wallet > 0), 'handed over');
  assert.equal(owner.npc.state, 'wander');
});

test('now and then, something happens near you in town - never the same thing twice running', () => {
  const { w, p } = setup();
  const seen = [];
  for (let k = 0; k < 6; k++) {
    for (const e of w.happenings || []) if (['fight', 'faint', 'wallet'].includes(e.kind)) e.until = 0;   // (the last one's over)
    run(w, 0.5);
    w.nextHappenAt = w.time;
    run(w, 1);
    seen.push(w.lastHappening);
  }
  assert.ok(new Set(seen).size >= 2, `variety (${seen.join(', ')})`);
  for (let i = 1; i < seen.length; i++) assert.notEqual(seen[i], seen[i - 1], `not the same twice running (${seen.join(', ')})`);
});

test('lost pets: rarer, and the owner is out looking well across town', () => {
  assert.ok(PET_EVERY_S >= 400, 'every several minutes, not every two');
  const { w, p } = setup();
  let far = 0, n = 0;
  for (let k = 0; k < 6; k++) {
    const pet = pets.spawnLost(w, p);
    if (!pet) continue;
    n++;
    const owner = w.get(pet.pet.owner);
    if (Math.hypot(owner.x - pet.x, owner.y - pet.y) >= PET_OWNER_PX[0]) far++;
    assert.ok(Math.hypot(owner.x - pet.x, owner.y - pet.y) >= 900, 'never round the corner');
  }
  assert.ok(n >= 3 && far >= n - 1, `the owners far off (${far} of ${n})`);
});
