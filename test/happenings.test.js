// Little happenings round the players (server/systems/happenings.js): a street fight to break up, someone who collapsed
// to help up, a dropped wallet to hand back; and lost pets (pets.js) rarer, their owners further off.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer, run, teleport } from './helpers.js';
import { K, T } from '../shared/constants.js';
import { DISTRICTS } from '../shared/map.js';
import { PET_EVERY_S, PET_LOST_PX, FIGHT_BREAKUP_SAMARITAN, FAINT_HELP_REWARD, FAINT_HELP_SAMARITAN, FAINT_HELP_HOLD_S, FAINT_EMS_S, WALLET_SAMARITAN } from '../shared/rules.js';
import { IN } from '../shared/input.js';
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
  assert.ok(happenings.startNow(w, 'fight', p, { cops: false }));   // (left alone: nobody calls the police either - test/brawls.test.js)
  const e = ev(w, 'fight'), a = w.get(e.a), b = w.get(e.b);
  for (let i = 0; i < 50 && ev(w, 'fight'); i++) run(w, 1);
  assert.ok(!ev(w, 'fight'), 'it ended');
  assert.ok(!a.dead && !b.dead, 'both alive');
  assert.ok(!a.npc.keep && !b.npc.keep, 'let go (they can be cleared away again)');
});

// hold the action button down for s seconds (one input per tick, like a client); let go
function hold(w, p, s) { for (let k = 0; k < Math.round(s * 20); k++) { players.queueInput(p, { seq: p.ack + 1, bits: IN.ACTION, mx: 0, my: 0, aim: 0 }); w.step(); } }
function release(w, p) { players.queueInput(p, { seq: p.ack + 1, bits: 0, mx: 0, my: 0, aim: 0 }); w.step(); }
// what the world sent to the pages (w.events is cleared each tick)
function tap(w) { const out = [], em = w.emit.bind(w); w.emit = (x, y, e) => { out.push(e); return em(x, y, e); }; return out; }
// someone collapsing near you: someone walking past in sight of you now, or the next who does
function collapse(w, p) {
  assert.ok(happenings.startNow(w, 'faint', p));
  for (let i = 0; i < 40 * 20 && !ev(w, 'faint'); i++) w.step();
  const e = ev(w, 'faint');
  assert.ok(e, 'someone walked by');
  return { e, a: w.get(e.who) };
}
const sawIt = async (w, a) => (await import('../server/view.js')).inAnyView(w, a.x, a.y, -60);

test('someone collapses in front of you: they sway and go down; hold ACT to help them up for a thank-you', async () => {
  const { w, p } = setup();
  const sent = tap(w);
  const { e, a } = collapse(w, p);
  assert.equal(e.phase, 'sway');
  assert.ok(await sawIt(w, a), 'in sight of you');
  assert.ok(!a.passedOut, 'still on their feet, swaying');
  assert.ok(sent.some((q) => q.e === 'collapse' && q.id === a.id && q.k === 's'), 'the stagger is on the wire');
  assert.ok(!players.findInteraction(w, p) || !/help them up/i.test(players.findInteraction(w, p).label), 'nothing to help with yet');
  run(w, 2);
  assert.equal(e.phase, 'down');
  assert.ok(a.passedOut, 'down on the pavement');
  assert.ok(sent.some((q) => q.e === 'collapse' && q.id === a.id && q.k === 'F'), 'face down, on the wire');
  walkTo(w, p, a.x + 20, a.y);
  const act = players.findInteraction(w, p);
  assert.ok(act && /Hold to help them up/.test(act.label), act && act.label);
  const cash = p.profile.cash, sam = p.profile.samaritan;
  // a tap isn't enough
  hold(w, p, 0.3); release(w, p);
  assert.ok(a.passedOut, 'a tap: still down');
  hold(w, p, FAINT_HELP_HOLD_S + 0.3);
  assert.ok(!a.passedOut, 'back on their feet');
  assert.equal(p.profile.cash, cash + FAINT_HELP_REWARD);
  assert.equal(p.profile.samaritan, sam + FAINT_HELP_SAMARITAN);
  assert.ok(sent.some((q) => q.e === 'thanks'), 'thank you');
  release(w, p);
  run(w, 1);
  assert.ok(!ev(w, 'faint'), 'over');
});

test('nobody helps: an ambulance is called and takes them away - or, if none can come, they come round', async () => {
  const ems = await import('../server/systems/ems.js');
  const { w, p } = setup();
  const { e, a } = collapse(w, p);
  run(w, 2.5);
  teleport(w, p.ped, a.x + 300, a.y);
  assert.ok(a.passedOut);
  run(w, FAINT_EMS_S + 1);
  assert.ok(e.emsTried, 'someone called it in');
  if (e.amb) {
    const v = w.get(e.amb);
    assert.ok(v && v.ai && v.ai.kind === 'ems' && v.ai.body === a.id, 'an ambulance on its way to them');
    for (let i = 0; i < 160 && !a.removed; i++) run(w, 1);
    assert.ok(a.removed, 'the paramedics took them away');
    run(w, 1);
    assert.ok(!ev(w, 'faint'), 'over');
  } else {
    for (let i = 0; i < 80 && ev(w, 'faint'); i++) run(w, 1);
    assert.ok(!a.passedOut && !a.dead, 'came round by themselves');
  }
  void ems;
});

test('helped up while the ambulance is on its way: it turns round', async () => {
  const ems = await import('../server/systems/ems.js');
  const { w, p } = setup();
  const { a } = collapse(w, p);
  run(w, 2.5);
  assert.ok(a.passedOut);
  const v = ems.dispatchFor(w, a);
  if (!v) return;   // (no road to them here)
  assert.ok(a.emsPatient);
  walkTo(w, p, a.x + 20, a.y);
  hold(w, p, FAINT_HELP_HOLD_S + 0.3);
  assert.ok(!a.passedOut && !a.emsPatient, 'up');
  run(w, 2);
  assert.ok(!v.ai || v.ai.mode === 'leave' || v.removed, 'the ambulance leaves');
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

test('lost pets: rarer, gone from a real home, the area it was seen in a walk away', () => {
  assert.ok(PET_EVERY_S >= 400, 'every several minutes, not every two');
  const { w, p } = setup();
  let n = 0;
  for (const h of w.map.homes) {
    if (n >= 6) break;
    if (!h || h.kind !== 'house') continue;
    teleport(w, p.ped, h.x, h.y);
    const pet = pets.spawnLost(w, p);
    if (!pet) continue;
    n++;
    const H = pet.pet.house, A = pet.pet.area, home = w.map.homes[H.id];
    assert.ok(home && ['house', 'cottage', 'apartment'].includes(home.kind) && Math.hypot(home.x - H.x, home.y - H.y) < 80, 'a real home');
    assert.ok(Math.hypot(w.get(pet.pet.owner).x - H.x, w.get(pet.pet.owner).y - H.y) < 10, 'its owner at their door');
    const d = Math.hypot(A.x - H.x, A.y - H.y);
    assert.ok(d >= PET_LOST_PX[0] - 1 && d <= PET_LOST_PX[1] + 1, `its last-seen area a walk from home (${d | 0} px)`);
    w.remove(pet);
  }
  assert.ok(n >= 6, `${n} went missing`);
});
