// People at their jobs (batch 8, the owner's notes 2: "NPC jobs - You can see NPCs performing their jobs like street
// sweepers or construction workers or mailmen"; "NPC - homeless dude pushing cart?"): server/systems/personas.js - the
// mail carrier's round of the mailboxes, letters held out at each; the street sweeper's broom along the pavement and back;
// the gardener down on a knee at the planters; the homeless man pushing his cart round his camp and going through the bins
// - and the building sites' crews (activities.js 'site').
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, run } from './helpers.js';
import { K } from '../shared/constants.js';

const personas = await import('../server/systems/personas.js');
const npc = await import('../server/systems/npc.js');
const activities = await import('../server/systems/activities.js');

const w = makeWorld();
run(w, 0.2);
const props = (t) => w.map.props.filter((q) => q && q.t === t);
// spawn persona k by the first prop of kind t that has room, kept
function at(k, t) {
  for (const q of props(t).slice(0, 80)) {
    const ped = personas.spawnPersona(w, npc.spawnNpc, k, q.x + 30, q.y + 30, false);
    if (ped) { ped.npc.keep = true; return ped; }
  }
  return null;
}
function watch(ped, s, f) { let hit = false; for (let i = 0; i < s * 20 && !hit; i++) { w.step(); if (f(ped)) hit = true; } return hit; }

test('the people at their jobs are in the city\'s cast', () => {
  for (const k of ['postal', 'sweeper', 'gardener', 'homeless']) assert.ok(personas.PERSONAS[k], k);
  assert.ok(personas.PERSONAS.postal.mail && personas.PERSONAS.sweeper.sweep && personas.PERSONAS.gardener.tend);
  assert.equal(personas.PERSONAS.sweeper.pp, 'broom');
  assert.equal(personas.PERSONAS.homeless.pp, 'cart');
});

test('the mail carrier walks a round of the mailboxes, letters held out at each', () => {
  const ped = at('postal', 'mailbox');
  assert.ok(ped, 'a mail carrier by the mailboxes');
  const x0 = ped.x, y0 = ped.y;
  assert.ok(watch(ped, 60, (q) => q.pp === 'letters'), `letters out at a mailbox (${JSON.stringify({ from: [x0, y0], at: [ped.x, ped.y], st: ped.npc.state, round: ped.npc.round, ri: ped.npc.ri, roundAt: ped.npc.roundAt, t: w.time })})`);
  const n = ped.npc;
  assert.ok(n.round && n.round.length >= 1, 'a round of mailboxes');
  const box = props('mailbox').reduce((a, b) => (Math.hypot(b.x - ped.x, b.y - ped.y) < Math.hypot(a.x - ped.x, a.y - ped.y) ? b : a));
  assert.ok(Math.hypot(box.x - ped.x, box.y - ped.y) < 60, 'at the mailbox');
  assert.ok(watch(ped, 10, (q) => q.pp !== 'letters'), 'and on to the next');
});

test('the street sweeper pushes the broom along the pavement and back', () => {
  const ped = at('sweeper', 'trashcan') || at('sweeper', 'bench_m');
  assert.ok(ped, 'a sweeper');
  assert.equal(ped.pp, 'broom');
  const x0 = ped.x, y0 = ped.y;
  run(w, 2);
  assert.ok(ped.npc.sweep, 'a stretch to sweep');
  assert.ok(watch(ped, 60, () => ped.npc.sweep && ped.npc.sweep.legs >= 1), 'swept to the end and turned');
  assert.ok(Math.hypot(ped.x - x0, ped.y - y0) < 260, 'keeps to the stretch');
});

test('the gardener kneels at the planters', () => {
  const ped = at('gardener', 'planter_fl') || at('gardener', 'hedgebox') || at('gardener', 'planter_g');
  if (!ped) return;   // (no planters in this city)
  const x0 = ped.x, y0 = ped.y;
  assert.ok(watch(ped, 90, (q) => q.gt === 'kneel'), `down on a knee at one (${JSON.stringify({ from: [x0, y0], at: [ped.x, ped.y], st: ped.npc.state, round: ped.npc.round, ri: ped.npc.ri, roundAt: ped.npc.roundAt })})`);
});

test('the homeless man pushes his cart round his camp and goes through the bins', () => {
  const ped = at('homeless', 'trashcan');
  assert.ok(ped, 'a homeless man by the bins');
  assert.equal(ped.gt, 'push');
  assert.ok(ped.npc.poor && ped.npc.camp);
  ped.npc.until = 0;
  assert.ok(watch(ped, 240, (q) => !!q.npc.bin || false), 'off to a bin');
});

test('a building site\'s crew at work (when the city has one)', () => {
  const S = activities.spotsOf(w.map).list.filter((s) => s.k === 'site');
  for (const s of S) assert.ok(Number.isFinite(s.x) && Number.isFinite(s.y));
  if (!S.length) return;
  assert.ok(activities.fill(w, S[0], { seen: true }), 'filled');
  const crew = [...w.entities.values()].filter((e) => e.kind === K.PED && e.npc && e.npc.act && e.npc.act.k === 'site');
  assert.ok(crew.length >= 4, `the crew (${crew.length})`);
});
