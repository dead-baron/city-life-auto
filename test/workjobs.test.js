// Batch 8's jobs (the owner's notes 2): the forklift driver (server/systems/forklift.js) - a yard's pallets lifted on the
// forks, carried to the marked bays and set down, the second in a bay stacked on the first, paid per pallet; the fishing
// boat (fishboat.js) - the trawler from a fish market's quay, the net trawled and the pots hauled at the grounds, the
// boxes on the deck sold back at the quay, the crew paid a share; the park ranger (rangerjob.js) - the trail walked, the
// litter picked up, a campfire left burning put out, a lost hiker led back to the station.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer, run } from './helpers.js';
import { K } from '../shared/constants.js';
import { FORK, FISHBOAT, RANGER } from '../shared/rules-work.js';

const forklift = await import('../server/systems/forklift.js');
const fishboat = await import('../server/systems/fishboat.js');
const ranger = await import('../server/systems/rangerjob.js');
const phone = await import('../server/systems/phone.js');
const players = await import('../server/systems/players.js');
const { slotWorld } = await import('../server/systems/cargo.js');
const { isLit } = await import('../server/systems/campfires.js');

const w = makeWorld();
run(w, 0.2);
const put = (e, x, y, a = e.a) => { e.x = x; e.y = y; e.a = a; e.vx = 0; e.vy = 0; e.av = 0; e.lz = 0; w.place(e); };
const steps = (n) => { for (let i = 0; i < n; i++) w.step(); };
function seat(p, v) { const ped = p.ped; v.seats[0] = ped.id; ped.vehId = v.id; ped.seat = 0; ped.x = v.x; ped.y = v.y; w.place(ped); }
const act = (p) => { const a = players.findInteraction(w, p); return a; };
// park the forklift with its fork tips on (x, y), facing a
function forksAt(v, x, y, a) { const f = v.def.slots[0][0]; put(v, x - Math.cos(a) * f, y - Math.sin(a) * f, a); }

test('the board lists the three jobs, each a card with its pay and first step', () => {
  const { p } = joinPlayer(w);
  const b = phone.boardFor(w, p);
  for (const id of ['forklift', 'fishboat', 'ranger']) {
    const j = b.jobs.find((q) => q.id === id);
    assert.ok(j, `${id} on the board`);
    assert.ok(j.title && j.step && j.lo > 0 && j.hi >= j.lo && j.per, `${id}: a card (${JSON.stringify(j)})`);
  }
});

test('forklift: lift a pallet, set it in its bay, stack the second, paid per pallet and the bonus for the lot', () => {
  const { p, prof } = joinPlayer(w);
  const y = forklift.yardFor(w, 0, 0);
  put(p.ped, y.x, y.y);
  const r = phone.handle(w, p, { a: 'take', id: 'forklift' });
  assert.equal(r.err, null, r.err);
  const j = p.job, v = w.get(j.truck);
  assert.equal(v.def.id, 'forklift');
  assert.equal(j.pallets.length, FORK.pallets);
  const pal = w.get(j.pallets[0]);
  assert.ok(pal.heavy && pal.label === 'Pallet');
  // too heavy by hand
  put(p.ped, pal.x + 10, pal.y);
  const a0 = act(p);
  assert.ok(!a0 || !/Pick up Pallet/.test(a0.label), 'no hand pickup of a pallet');
  seat(p, v);
  const cash0 = prof.cash;
  for (let k = 0; k < FORK.pallets; k++) {
    const c = j.pallets.map((id) => w.get(id)).find((q) => q && !q.placed);
    forksAt(v, c.x, c.y, 0);
    const lift = act(p);
    assert.ok(lift && /Lift the pallet/.test(lift.label), `pallet ${k}: lift offered (${lift && lift.label})`);
    lift.run();
    steps(25);
    assert.equal(v.cargo[0], c.id, 'on the forks');
    assert.ok(c.z > 0, 'up off the ground');
    assert.equal(j.stage, 'carry');
    const t = phone.jobTarget(w, p);
    forksAt(v, t.x, t.y, Math.PI / 2);
    const down = act(p);
    assert.ok(down && /bay/.test(down.label), `a bay to set it in (${down && down.label})`);
    if (k % 2) assert.match(down.label, /Stack/);
    down.run();
    steps(40);
    if (!p.job) { assert.equal(k, FORK.pallets - 1, 'done with the last'); break; }
    assert.ok(c.placed && c.state === 'ground', 'set down');
    if (k % 2) assert.ok(c.z >= FORK.palletH - 1 && c.on, `stacked on the first (${c.z})`);
    steps(10);
    if (k % 2) assert.ok(c.z >= FORK.palletH - 1, 'stays up on the one under it');
  }
  assert.equal(p.job, null, 'shift done');
  assert.equal(prof.cash - cash0, FORK.pallets * FORK.perLoad + (FORK.pallets / 2) * FORK.stack + FORK.bonus);
});

test('forklift: the forks ride the wire (a forklift\'s extra byte)', async () => {
  const net = await import('../server/net.js');
  assert.equal(forklift.forkStage({ forkZ: 0 }), 0);
  assert.equal(forklift.forkStage({ forkZ: FORK.carryZ }), 1);
  assert.equal(forklift.forkStage({ forkZ: FORK.palletH }), 2);
  void net;
});

test('fishing boat: out to the grounds, the net trawled and the pots hauled, the catch sold at the quay, the crew paid', () => {
  const { p, prof } = joinPlayer(w);
  const crew = joinPlayer(w);
  const at = fishboat.marketFor(w, 0, 0);
  assert.ok(at, 'a fish market with a quay');
  put(p.ped, at.mk.x, at.mk.y);
  const r = phone.handle(w, p, { a: 'take', id: 'fishboat' });
  assert.equal(r.err, null, r.err);
  const j = p.job, v = w.get(j.truck);
  assert.equal(v.def.id, 'trawler');
  seat(p, v);
  v.seats[1] = crew.p.ped.id; crew.p.ped.vehId = v.id; crew.p.ped.seat = 1;
  for (let k = 0; k < j.spots.length; k++) {
    const s = j.spots[k];
    put(v, s.x, s.y, 0);
    const a = act(p);
    assert.ok(a && (s.k === 'net' ? /net/ : /pots/).test(a.label), `ground ${k} (${s.k}): ${a && a.label}`);
    a.run();
    const T = s.k === 'net' ? FISHBOAT.netS : FISHBOAT.potS;
    for (let i = 0; i < (T + 1) * 20; i++) {
      if (s.k === 'net') { const sp = 80; v.vx = Math.cos(v.a) * sp; v.vy = Math.sin(v.a) * sp; put(v, s.x + Math.cos(i / 20) * 40, s.y, v.a); v.vx = Math.cos(v.a) * sp; v.vy = 0; } else { v.vx = 0; v.vy = 0; }
      for (const q of [p.ped, crew.p.ped]) { q.x = v.x; q.y = v.y; }
      w.step();
      if (j.i > k) break;
    }
    assert.ok(j.i > k, `hauled at ground ${k}`);
  }
  const boxes = v.cargo.map((id) => w.get(id)).filter((c) => c && c.label === 'Fish Box');
  assert.equal(boxes.length, j.spots.length, 'a box a haul on the deck');
  assert.equal(j.stage, 'home');
  const total = boxes.reduce((s, c) => s + c.value, 0);
  put(v, j.quay.x, j.quay.y, 0);
  const sell = act(p);
  assert.ok(sell && /Sell the catch/.test(sell.label), sell && sell.label);
  const c0 = prof.cash, k0 = crew.prof.cash;
  sell.run();
  assert.equal(prof.cash - c0, total + FISHBOAT.bonus);
  assert.equal(crew.prof.cash - k0, FISHBOAT.crew * boxes.length, 'the crew paid a share');
  assert.equal(p.job, null);
});

test('ranger: the trail, the litter, a campfire, a lost hiker - each paid', () => {
  const { p, prof } = joinPlayer(w);
  const b = ranger.baseFor(w, 0, 0);
  assert.ok(b, 'a ranger station or a trailhead');
  put(p.ped, b.x, b.y);
  const r = phone.handle(w, p, { a: 'take', id: 'ranger' });
  assert.equal(r.err, null, r.err);
  const j = p.job;
  const did = [];
  for (const k of ['patrol', 'litter', 'fire', 'hiker']) {
    const err = ranger.devRanger(w, p, k);
    if (err) continue;   // (no campfire round this station, say)
    const t = j.task;
    assert.equal(t.k, k);
    const c0 = prof.cash;
    if (k === 'patrol') for (const q of t.pts) { put(p.ped, q.x, q.y); steps(2); }
    if (k === 'litter') {
      assert.ok(t.ids.length >= 3);
      for (const id of [...t.ids]) { const c = w.get(id); put(p.ped, c.x + 6, c.y); const a = act(p); assert.ok(a && /litter/.test(a.label), a && a.label); a.run(); }
    }
    if (k === 'fire') {
      assert.ok(isLit(w, t.i), 'burning');
      put(p.ped, t.x + 20, t.y); const a = act(p); assert.ok(a && /campfire/.test(a.label), a && a.label); a.run();
      assert.ok(!isLit(w, t.i), 'out');
    }
    if (k === 'hiker') {
      const h = w.get(t.hiker);
      put(p.ped, h.x + 30, h.y); const a = act(p); assert.ok(a && /hiker/.test(a.label), a && a.label); a.run();
      put(p.ped, h.x + 60, h.y); steps(40);
      assert.ok(Math.hypot(h.x - p.ped.x, h.y - p.ped.y) < 55, 'following');
      // back to the station on foot, the hiker on our heels
      put(h, j.base.x + 20, j.base.y); put(p.ped, j.base.x, j.base.y); steps(4);
    }
    assert.equal(j.task, null, `${k} done`);
    assert.equal(prof.cash - c0, RANGER.pay[k], `${k} paid`);
    did.push(k);
  }
  assert.ok(did.length >= 3, `most of the tasks fit (${did})`);
  // what's left of a task when the shift ends is tidied away
  ranger.devRanger(w, p, 'litter');
  const ids = [...(j.task ? j.task.ids : [])];
  phone.handle(w, p, { a: 'cancel' });
  steps(110);
  assert.ok(ids.every((id) => !w.get(id)), 'litter cleared after the shift');
  assert.ok(![...w.entities.values()].some((e) => e.kind === K.CRATE && e.litter));
});

test('the job tracker names the jobs and their steps', () => {
  const { p } = joinPlayer(w);
  const y = forklift.yardFor(w, 0, 0);
  put(p.ped, y.x, y.y);
  phone.handle(w, p, { a: 'take', id: 'forklift' });
  const t = phone.jobTarget(w, p);
  assert.equal(t.k, 'Forklift');
  assert.deepEqual(t.step, [1, 2]);
  assert.match(t.text, /pallet/);
  const v = w.get(p.job.truck);
  assert.ok(slotWorld(v, 0));
  phone.handle(w, p, { a: 'cancel' });
});
