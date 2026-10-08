// Bounties (server/systems/bounties.js; design notes 2026-10-07, "Bounties rework"): a revenge measure. The same player
// kills you three times within the hour, and you can put a price on their head - your own money out of the bank, held
// in escrow, paid only to a hunter who took the contract and kills, arrests or detains the target, and back in your bank
// if it runs out. It runs only while the target is out in the city, sticks through deaths, hiding and logging off, is
// announced to everyone, and a golden skull floats over the target.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer, run, teleport, fakeConn, players } from './helpers.js';
import { BOUNTY_KILLS, BOUNTY_KILLS_S, BOUNTY_RUN_S, BOUNTY_LAPSE_DAYS, BOUNTY_ALIVE_SAM, GHOST_SECONDS } from '../shared/rules.js';
import * as bounties from '../server/systems/bounties.js';
import * as law from '../server/systems/law.js';
import * as combat from '../server/systems/combat.js';
import * as phone from '../server/systems/phone.js';
import * as economy from '../server/systems/economy.js';

// k kills v where v stands, and v is straight back on their feet (no fifteen-second wait)
function kill(w, k, v) {
  teleport(w, k.p.ped, v.p.ped.x + 24, v.p.ped.y);
  v.p.ped.protectUntil = 0; k.p.ped.protectUntil = 0;
  combat.damage(w, v.p.ped, 9999, k.p.ped, 'melee');
  assert.ok(v.p.ped.dead, 'killed');
  v.p.respawnAt = w.time; w.step();
  assert.ok(!v.p.ped.dead, 'back on their feet');
}
function hit(w, k, v) {
  teleport(w, k.p.ped, v.p.ped.x + 24, v.p.ped.y);
  v.p.ped.protectUntil = 0; k.p.ped.protectUntil = 0;
  combat.damage(w, v.p.ped, 5, k.p.ped, 'melee');
}
// the chance to put a bounty on t, as if they'd killed p three times
function unlock(p, t) { (p.prof.revenge ||= {})[t.p.pid] = { name: t.p.name, until: Date.now() + 3600e3 }; }
// what a player was told: still waiting to go out, or sent (net.js puts the toasts in an 'ev' message each tick)
const toldP = (p, conn, re) => p.toasts.some((t) => re.test(t.text))
  || conn.sent.some((m) => typeof m === 'string' && m.startsWith('{"t":"ev"') && JSON.parse(m).l.some((e) => e.e === 'toast' && re.test(e.text)));
const told = (x, re) => toldP(x.p, x.conn, re);

test('bounties: the same player killing you three times within the hour opens a bounty on them; police work, wanted victims and self-defence don\'t count', () => {
  const w = makeWorld();
  const a = joinPlayer(w), b = joinPlayer(w);
  for (let i = 1; i < BOUNTY_KILLS; i++) kill(w, b, a);
  assert.deepEqual(bounties.revenge(a.prof), {}, 'not yet');
  kill(w, b, a);
  assert.ok(bounties.revenge(a.prof)[b.p.pid], `the ${BOUNTY_KILLS}th within the hour`);
  assert.ok(told(a, new RegExp(`killed you ${BOUNTY_KILLS} times`)), 'and they\'re told where to place it');
  assert.equal(a.prof.killedBy[b.p.pid], undefined, 'the count starts again');

  // kills more than an hour old have dropped out
  const c = joinPlayer(w);
  c.prof.killedBy = { [b.p.pid]: [Date.now() - (BOUNTY_KILLS_S + 60) * 1000, Date.now() - (BOUNTY_KILLS_S + 30) * 1000] };
  kill(w, b, c);
  assert.equal(bounties.revenge(c.prof)[b.p.pid], undefined);
  assert.equal(c.prof.killedBy[b.p.pid].length, 1, 'only this one');
  // a wanted victim is fair game
  law.addHeat(w, c.p, 40, c.p.ped.x, c.p.ped.y);
  assert.ok(c.p.wanted > 0);
  kill(w, b, c);
  assert.equal(c.prof.killedBy[b.p.pid].length, 1, 'killed while wanted: not counted');
  // an officer on duty
  const cop = joinPlayer(w, { samaritan: 100 });
  assert.equal(law.goOnDuty(w, cop.p), null);
  kill(w, cop, c);
  assert.equal(c.prof.killedBy[cop.p.pid], undefined, 'police work: not counted');
  // self-defence: c throws the first blow and b kills them - not counted; b starts it (c hits back) - counted
  law.clearWanted(w, b.p);
  hit(w, c, b); law.clearWanted(w, c.p);
  kill(w, b, c);
  assert.equal(c.prof.killedBy[b.p.pid].length, 1, 'b was defending themselves');
  run(w, 61);
  hit(w, b, c); hit(w, c, b); law.clearWanted(w, c.p);
  kill(w, b, c);
  assert.equal(c.prof.killedBy[b.p.pid].length, 2, 'b started that one');
});

test('bounties: placing one - your own money out of the bank, held in escrow; announced to everyone; a golden skull over the target', () => {
  const w = makeWorld();
  const a = joinPlayer(w, { bank: 1500 }), b = joinPlayer(w), h = joinPlayer(w);
  assert.match(bounties.place(w, a.p, b.p.pid, 1000), new RegExp(`killed you ${BOUNTY_KILLS} times`), 'only on someone who keeps killing you');
  unlock(a, b);
  assert.match(bounties.place(w, a.p, b.p.pid, 300), /\$250/, 'only the listed amounts');
  assert.match(bounties.place(w, a.p, b.p.pid, 2500), /not enough/);
  law.addHeat(w, a.p, 30, a.p.ped.x, a.p.ped.y);
  assert.match(bounties.place(w, a.p, b.p.pid, 1000), /Criminals/);
  law.clearWanted(w, a.p);
  const v0 = b.p.ped.appVer || 0;
  assert.equal(bounties.place(w, a.p, b.p.pid, 1000), null);
  assert.equal(a.prof.bank, 500, 'out of the bank');
  assert.equal(b.prof.bounties.length, 1, 'on the target\'s profile');
  assert.equal(b.p.bounty, 1000);
  assert.ok(b.p.skull && b.p.ped.appVer > v0, 'the skull, and the target is sent to everyone again');
  assert.equal(bounties.revenge(a.prof)[b.p.pid], undefined, 'one bounty for each chance');
  assert.ok(told(h, /bounty is out on/), 'announced to everyone');
  assert.ok(told(b, /bounty on your head/));
  assert.ok(told(a, /held in escrow/));
  // the skull goes out with the target's description to whoever can see them
  teleport(w, h.p.ped, b.p.ped.x + 60, b.p.ped.y);
  h.conn.sent.length = 0;
  w.step();
  const sp = h.conn.sent.filter((m) => typeof m === 'string' && m.startsWith('{"t":"sp"')).flatMap((m) => JSON.parse(m).e);
  assert.ok(sp.some((d) => d.id === b.p.ped.id && d.bt === 1), 'bt: the golden skull');
  assert.ok(!sp.some((d) => d.id !== b.p.ped.id && d.bt), 'nobody else');
  // one bounty from you on someone at a time
  unlock(a, b);
  a.prof.bank = 5000;
  assert.match(bounties.place(w, a.p, b.p.pid, 250), /already have a bounty out/);
});

test('bounties: hunters take contracts in the Bounties app, and only they collect; anyone else dropping a marked target gets nothing (and isn\'t charged)', () => {
  const w = makeWorld();
  const a = joinPlayer(w, { bank: 10000 }), b = joinPlayer(w), h = joinPlayer(w, { samaritan: 50 }), x = joinPlayer(w, { samaritan: 50 });
  unlock(a, b);
  assert.equal(bounties.place(w, a.p, b.p.pid, 1000), null);
  const board = phone.handle(w, h.p, { a: 'bounties' });
  assert.equal(board.t, 'bounties');
  const c = board.list.find((q) => q.name === b.p.name);
  assert.ok(c && c.amount === 1000 && c.left === BOUNTY_RUN_S && c.on, 'the contract, its clock running');
  assert.match(c.desc, /top, .* trousers/, 'what they\'re wearing');
  assert.ok(c.seen && c.seen.d && c.seen.ago < 5, 'the district they were last seen in, and when');
  assert.equal(board.hunter, false);
  // licensed hunters (and officers on duty) only
  assert.match(phone.handle(w, h.p, { a: 'btake', id: c.id }).err, /licensed bounty hunters/);
  assert.equal(law.registerHunter(w, h.p), null);
  const r = phone.handle(w, h.p, { a: 'btake', id: c.id });
  assert.equal(r.err, null);
  assert.ok(r.list.find((q) => q.id === c.id).mine, 'yours');
  assert.ok(told(b, /hunter has taken the contract/), 'the target is told');
  a.p.hunter = true; b.p.hunter = true;
  assert.match(bounties.take(w, a.p, c.id), /your own contract/);
  assert.match(bounties.take(w, b.p, c.id), /your own head/);
  b.p.hunter = false;
  // the radar: a rough ping for the hunter who took it, nothing for one who didn't, nothing while they're inside a home
  const ping = (p) => law.radarFor(w, p).find((q) => q.k === 'bounty' && q.n === b.p.name);
  assert.ok(ping(h.p) && ping(h.p).b === 1000 && Math.hypot(ping(h.p).x - b.p.ped.x, ping(h.p).y - b.p.ped.y) < 120);
  x.p.hunter = true;
  assert.equal(ping(x.p), undefined, 'no contract, no ping');
  b.p.ped.hidden = true;
  assert.equal(ping(h.p), undefined, 'gone to ground');
  b.p.ped.hidden = false;
  // someone without the contract drops them: no money, the bounty stays (through the death), and no murder - a marked
  // target; nor does it count towards a bounty on them
  const xb = x.prof.bank;
  kill(w, x, b);
  assert.equal(x.prof.bank, xb);
  assert.equal(x.p.wanted, 0, 'no crime');
  assert.equal(b.prof.bounties.length, 1);
  assert.ok(b.p.skull && b.p.bounty === 1000, 'still marked after the death');
  assert.equal((b.prof.killedBy || {})[x.p.pid], undefined);
  // the hunter takes them out: paid into the bank
  const hb = h.prof.bank, hs = h.prof.samaritan;
  kill(w, h, b);
  assert.equal(h.prof.bank, hb + 1000);
  assert.ok(h.prof.samaritan > hs);
  assert.equal(h.p.wanted, 0, 'collecting a bounty is no murder');
  assert.equal(b.prof.bounties.length, 0);
  assert.ok(!b.p.skull && b.p.bounty === 0, 'the skull is gone');
  assert.ok(told(a, /was collected/), 'the one who placed it is told');
  assert.ok(told(x, /collected the \$1,000 bounty/), 'and everyone else');
  assert.equal(a.prof.bank, 9000, 'the escrow paid out');
});

test('bounties: an officer on duty who took the contract collects on an arrest; a hunter detains the target alive and they\'re let go at the courthouse', () => {
  const w = makeWorld();
  const a = joinPlayer(w, { bank: 10000 }), b = joinPlayer(w), cop = joinPlayer(w, { samaritan: 100 }), h = joinPlayer(w, { samaritan: 50 });
  unlock(a, b);
  bounties.place(w, a.p, b.p.pid, 500);
  assert.equal(law.goOnDuty(w, cop.p), null);
  assert.equal(bounties.take(w, cop.p, b.prof.bounties[0].id), null, 'officers on duty can take contracts');
  teleport(w, cop.p.ped, b.p.ped.x + 30, b.p.ped.y);
  b.p.ped.downUntil = w.time + 5;   // knocked down
  const cuff = players.findInteraction(w, cop.p);
  assert.match(cuff.label, /Cuff/);
  const cb = cop.prof.bank;
  cuff.run();
  assert.equal(cop.prof.bank, cb + 500, 'the bounty, into the bank');
  assert.equal(b.prof.bounties.length, 0);
  w.step();   // (booked and out at the station)

  unlock(a, b);
  assert.equal(bounties.place(w, a.p, b.p.pid, 250), null);
  assert.equal(law.registerHunter(w, h.p), null);
  assert.equal(bounties.take(w, h.p, b.prof.bounties[0].id), null);
  teleport(w, h.p.ped, b.p.ped.x + 30, b.p.ped.y);
  b.p.ped.stunUntil = 0; b.p.ped.downUntil = 0;
  assert.ok(!/Detain/.test(players.findInteraction(w, h.p)?.label || ''), 'on their feet: nothing to detain');
  b.p.ped.downUntil = w.time + 5; b.p.ped.stunUntil = 0;
  const det = players.findInteraction(w, h.p);
  assert.match(det.label, /Detain/);
  const hb = h.prof.bank, hs = h.prof.samaritan;
  det.run();
  assert.equal(h.prof.bank, hb + 250);
  assert.equal(h.prof.samaritan, hs + 10 + BOUNTY_ALIVE_SAM, 'brought in alive: more Samaritan');
  const ct = w.map.pois.filter((q) => q.kind === 'courthouse').sort((p, q) => Math.hypot(p.x - b.p.ped.x, p.y - b.p.ped.y) - Math.hypot(q.x - b.p.ped.x, q.y - b.p.ped.y))[0];
  assert.ok(Math.hypot(b.p.ped.x - ct.x, b.p.ped.y - ct.y) < 260, 'taken in to the courthouse');
  assert.ok(!b.p.ped.dead && b.prof.bounties.length === 0 && !b.p.skull);
});

test('bounties: the clock runs only while the target is out in the city - through deaths, hiding at home and logging off - and the money comes back when it runs out', () => {
  const w = makeWorld();
  const a = joinPlayer(w, { bank: 1000 }), b = joinPlayer(w);
  unlock(a, b);
  bounties.place(w, a.p, b.p.pid, 1000);
  const c = b.prof.bounties[0];
  run(w, 10);
  assert.ok(Math.abs(c.left - (BOUNTY_RUN_S - 10)) < 0.2, 'running while they\'re out');
  b.p.ped.hidden = true;
  assert.equal(bounties.meInfo(b.p).paused, true);
  run(w, 10);
  assert.ok(Math.abs(c.left - (BOUNTY_RUN_S - 10)) < 0.2, 'stopped while they\'re inside');
  b.p.ped.hidden = false;
  // a death from anything else: still on, and the skull is over them again when they're back
  combat.damage(w, b.p.ped, 9999, null, 'crash');
  b.p.respawnAt = w.time; w.step();
  assert.ok(b.prof.bounties.length === 1 && b.p.skull && b.p.bounty === 1000);
  // logging off: kept on the profile with the clock stopped; back on, they're marked again and told
  players.leave(w, b.p);
  run(w, GHOST_SECONDS + 1);
  assert.ok(!w.players.has(b.p.pid), 'gone');
  const left = c.left;
  run(w, 5);
  assert.equal(c.left, left, 'stopped while they\'re away');
  const conn2 = fakeConn(), back = players.join(w, conn2, b.prof);
  assert.ok(back.bounty === 1000 && back.skull);
  assert.ok(toldP(back, conn2, /still a \$1,000 bounty on your head/));
  // it runs out: the money's back in the placer's bank
  c.left = 0.5;
  run(w, 1);
  assert.equal(b.prof.bounties.length, 0);
  assert.equal(a.prof.bank, 1000, 'refunded');
  assert.ok(!back.skull && back.bounty === 0);
  assert.ok(told(a, /ran out/) && toldP(back, conn2, /ran out/));

  // a target who never comes back: refunded after a few days
  unlock(a, b);
  bounties.place(w, a.p, b.p.pid, 500);
  assert.equal(a.prof.bank, 500);
  players.leave(w, back);
  run(w, GHOST_SECONDS + 1);
  const old = Date.now() - (BOUNTY_LAPSE_DAYS + 1) * 86400000;
  b.prof.bounties[0].placed = old; b.prof.lastSeen = old;
  w.tick = 599; w.step();   // (looked at once a minute)
  assert.equal(b.prof.bounties.length, 0);
  assert.equal(a.prof.bank, 1000);
});

test('bounties: the courthouse desk offers a bounty on whoever keeps killing you, and lists what\'s out', () => {
  const w = makeWorld();
  const a = joinPlayer(w, { bank: 600 }), b = joinPlayer(w);
  const poi = w.map.pois.find((q) => q.kind === 'courthouse');
  teleport(w, a.p.ped, poi.x, poi.y);
  assert.ok(!economy.buildMenu(w, a.p, poi).opts.some((o) => o.id.startsWith('bounty:')), 'nobody to put one on');
  unlock(a, b);
  const opts = economy.buildMenu(w, a.p, poi).opts.filter((o) => o.id.startsWith('bounty:'));
  assert.deepEqual(opts.map((o) => o.price), [250, 500, 1000, 2500]);
  assert.deepEqual(opts.map((o) => !!o.dis), [false, false, true, true], 'what the bank can pay');
  economy.handleMenu(w, a.p, poi.id, `bounty:${b.p.pid}:500`);
  assert.equal(b.p.bounty, 500);
  assert.equal(a.prof.bank, 100);
  assert.match(economy.buildMenu(w, a.p, poi).sub, new RegExp(`Bounties out: .*${b.p.name} \\$500`));
});
