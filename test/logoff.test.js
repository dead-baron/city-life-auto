// The safe exit (LOG OFF in the pause menu: server/systems/logoff.js, the launch plan's item 11): a 10-second count while
// you stand still, called off by a move (yours or the server's), a hit, hurting someone or becoming wanted; at once in a
// home of your own; refused while wanted or within a minute of a fight - and then a closed tab leaves the body for the
// usual 30 s. A clean exit leaves no ghost, saves the character, ends the session through the launch hooks (the money
// settled and let go, the analytics session closed), says what the session came to, and closes the socket for good.
// Through server/session.js and server/launch.js, as server/index.js wires them.
import { makeWorld, fakeConn, store, run, teleport } from './helpers.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { config } from '../server/config.js';
import { createLaunch } from '../server/launch.js';
import { createSession } from '../server/session.js';
import * as players from '../server/systems/players.js';
import * as combat from '../server/systems/combat.js';
import * as homes from '../server/systems/homes.js';
import * as skills from '../server/systems/skills.js';
import * as vehicles from '../server/systems/vehicles.js';
import * as law from '../server/systems/law.js';
import { LOGOFF_CLOSE } from '../server/systems/logoff.js';
import { moved } from '../server/movemark.js';
import { LOGOFF, GHOST_SECONDS, STAR_HEAT } from '../shared/rules.js';
import { K } from '../shared/constants.js';

const quiet = { log() {}, warn() {}, error() {} };
function boot() {
  const world = makeWorld();
  const cfg = { ...config, launch: { ...config.launch, devOpen: true, gaMeasurementId: '', gaApiSecret: '', requireAge: false, guestPerHour: 0, google: { id: '', secret: '' } } };
  const L = createLaunch({ config: cfg, store, world, ip: () => '1.2.3.4', dataDir: null, log: quiet });
  const connect = (token = null) => {
    const conn = fakeConn();
    let s = null;
    // (as server/ws.js: closing the socket is its 'close' - session.onClose - at once)
    conn.close = function (code) { if (!this.open) return; this.open = false; this.code = code; s.onClose(); };
    s = createSession(world, conn, { seed: 1337, dev: false, maxPlayers: 50, label: 'test', login: (t, h) => L.login(t, h, '1.2.3.4'), hooks: L.hooks });
    s.onMessage(JSON.stringify({ t: 'hello', token, dm: 'cd'.repeat(16) }), false);
    const welcome = conn.sent.find((m) => m.t === 'welcome');
    const p = world.players.get(welcome.pid);
    p.ped.protectUntil = 0;
    let seq = 0;
    return {
      conn, s, p, token: welcome.token,
      say: (m) => s.onMessage(JSON.stringify(m), false),
      input: (inp) => players.queueInput(p, { seq: ++seq, bits: 0, mx: 0, my: 0, aim: 0, ...inp }),
      offs: () => conn.sent.filter((m) => m && m.t === 'logoff'),
      off: () => [...conn.sent].reverse().find((m) => m && m.t === 'logoff') || null,
    };
  };
  return { world, L, connect };
}
const poiOf = (w, h) => w.map.pois.find((q) => q.kind === 'home' && q.home === h.id);
const bags = (w) => [...w.entities.values()].filter((e) => e.kind === K.BAG);

test('LOG OFF counts 10 s standing still, then out: no ghost, saved, the session ended, the socket closed for good', () => {
  const B = boot(), w = B.world, c = B.connect();
  const { p } = c, pid = p.pid, ped = p.ped, prof = p.profile;
  prof.cash = 640;
  const bags0 = bags(w).length;
  c.say({ t: 'logoff' });
  assert.deepEqual(c.off(), { t: 'logoff', s: 'start', left: LOGOFF.countS }, 'the count starts');
  run(w, LOGOFF.countS / 2);
  c.say({ t: 'logoff' });   // (asked again halfway: the count goes on as it was - not started over)
  assert.equal(c.off().s, 'start');
  assert.ok(Math.abs(c.off().left - LOGOFF.countS / 2) < 0.2, `what's left re-sent (${c.off().left})`);
  run(w, LOGOFF.countS / 2 - 0.3);
  assert.ok(w.players.has(pid) && !ped.removed, 'still here just before the end');
  assert.ok(!c.offs().some((m) => m.s === 'done'));
  run(w, 0.5);
  const done = c.off();
  assert.equal(done.s, 'done', 'out on time, once');
  assert.equal(c.offs().filter((m) => m.s === 'done').length, 1);
  assert.equal(c.conn.code, LOGOFF_CLOSE, 'the socket closed as logged off (the page does not reconnect on it)');
  // no ghost: the body left with the session - nothing lingers to be robbed, nothing was dropped
  assert.ok(!w.players.has(pid), 'no session left behind');
  assert.ok(ped.removed && !w.get(ped.id), 'the body is gone at once');
  assert.equal(bags(w).length, bags0, 'nothing dropped');
  assert.equal(prof.cash, 640, 'the cash kept');
  assert.deepEqual(prof.pos && [prof.pos.x, prof.pos.y], [Math.round(ped.x), Math.round(ped.y)], 'saved where you stood');
  assert.equal(p.anStart, 0, 'the analytics session closed (the launch hooks\' leave)');
  assert.equal(prof.__mw && prof.__mw.p, null, 'the money watcher let go');
  // the closed socket's own leave doesn't run it twice, and nothing it says reaches the character any more
  c.s.onMessage(JSON.stringify({ t: 'logoff' }), false);
  assert.equal(c.offs().length, 3);
  // back next time: a new session where you stood, not a ghost picked up again
  const again = B.connect(c.token);
  assert.notEqual(again.p, p);
  assert.ok(Math.hypot(again.p.ped.x - prof.pos.x, again.p.ped.y - prof.pos.y) < 40, 'back where you logged off');
  B.L.stop();
});

test('each cause calls the count off: a step, a button, a server move, a push, a hit, hurting someone, the police; the page\'s own cancel', () => {
  const B = boot(), w = B.world;
  const cases = [
    ['a step', 'move', (c) => c.input({ mx: 1 })],
    ['a button', 'move', (c) => c.input({ bits: 2 })],
    ['a server move (a seat, a door, a teleport)', 'move', (c) => { moved(c.p.ped); }],
    ['pushed off the spot', 'move', (c, w) => teleport(w, c.p.ped, c.p.ped.x + 40, c.p.ped.y)],
    ['a hit', 'hurt', (c, w) => combat.damage(w, c.p.ped, 4, null, 'gun')],
    ['hurting someone', 'fight', (c, w) => { const n = w.spawnPed(c.p.ped.x + 30, c.p.ped.y, { hp: 100 }); combat.damage(w, n, 4, c.p.ped, 'fist'); c.p.wanted = 0; c.p.heat = 0; }],   // (whatever the law makes of it: the hit itself calls it off)
    ['becoming wanted', 'wanted', (c, w) => law.addHeat(w, c.p, STAR_HEAT[1] + 2 - c.p.heat, c.p.ped.x, c.p.ped.y)],
  ];
  for (const [name, cause, act] of cases) {
    const c = B.connect();
    c.say({ t: 'logoff' });
    assert.equal(c.off().s, 'start', name);
    run(w, 2);
    act(c, w);
    run(w, 0.2);
    const m = c.off();
    assert.equal(m.s, 'cancel', `${name}: called off`);
    assert.equal(m.c, cause, `${name}: ${m.c}`);
    assert.ok(typeof m.why === 'string' && m.why.length > 8, `${name}: says why`);
    assert.equal(c.p.logoff, null);
    run(w, LOGOFF.countS);
    assert.ok(w.players.has(c.p.pid) && !c.offs().some((x) => x.s === 'done'), `${name}: still in the city`);
  }
  // the page calls it off (pressed again, the pause menu closed): stopped, and no answer - the page has stopped already
  const c = B.connect();
  c.say({ t: 'logoff' });
  run(w, 3);
  const n = c.offs().length;
  c.say({ t: 'logoff', a: 'cancel' });
  assert.equal(c.p.logoff, null);
  run(w, LOGOFF.countS);
  assert.equal(c.offs().length, n, 'nothing more said');
  assert.ok(w.players.has(c.p.pid));
  B.L.stop();
});

test('the page closed mid-count: an ordinary disconnect (the ghost waits), and the count never finishes for it', () => {
  const B = boot(), w = B.world, c = B.connect();
  const { p } = c;
  c.say({ t: 'logoff' });
  run(w, 4);
  c.conn.close(1001);   // (the tab closed)
  assert.equal(p.logoff, null);
  assert.ok(p.ghostUntil > w.time, 'its body waits, as for any closed tab');
  run(w, LOGOFF.countS);
  assert.ok(!c.offs().some((m) => m.s === 'done'));
  assert.ok(w.players.has(p.pid) && !p.ped.removed, 'still a ghost, not logged off cleanly');
  B.L.stop();
});

test('at once inside a home of your own; counted inside someone else\'s, and on foot only', () => {
  const B = boot(), w = B.world, c = B.connect();
  const { p } = c, prof = p.profile;
  w.curMsg = 'dev'; prof.bank += 2e6; w.curMsg = null;
  const h = w.map.homes.find((q) => q.kind === 'house' && !w.homeOwner.has(q.id));
  teleport(w, p.ped, h.x, h.y);
  c.say({ t: 'menu', poi: poiOf(w, h).id, opt: 'hbuy' });
  assert.equal(w.homeOwner.get(h.id), p.pid, 'bought');
  homes.goInside(w, p, h);
  assert.ok(p.ped.home && p.ped.hidden, 'inside its rooms');
  assert.equal(players.buildMe(w, p).offNow, 1, 'the page is told: LOG OFF is at once here');
  c.say({ t: 'logoff' });
  assert.ok(!c.offs().some((m) => m.s === 'start'), 'no count');
  assert.equal(c.off().s, 'done', 'out at once');
  assert.ok(!w.players.has(p.pid));
  assert.equal(prof.inHome, h.id, 'saved inside');
  const again = B.connect(c.token);
  assert.ok(again.p.ped.hidden && again.p.ped.inside === h.id, 'back inside it next time');

  // someone else's home (a look round one for sale): the count, walking round its rooms calls it off
  const d = B.connect();
  const h2 = w.map.homes.find((q) => q.kind === 'house' && !w.homeOwner.has(q.id) && q.id !== h.id);
  homes.goInside(w, d.p, h2);
  d.p.ped.home.tour = 1;
  assert.equal(players.buildMe(w, d.p).offNow, undefined);
  d.say({ t: 'logoff' });
  assert.equal(d.off().s, 'start', 'counted');
  run(w, 1);
  d.p.ped.home.x += 40;   // (walked across the room)
  run(w, 0.2);
  assert.equal(d.off().s, 'cancel');
  assert.equal(d.off().c, 'move');

  // in a vehicle: step out first
  const e = B.connect();
  const v = w.spawnVehicle('sedan', e.p.ped.x + 20, e.p.ped.y, 0, { parked: true });
  v.owner = e.p.pid;
  assert.ok(vehicles.playerEnter(w, e.p.ped), 'in the car');
  e.say({ t: 'logoff' });
  assert.equal(e.off().s, 'cancel');
  assert.equal(e.off().c, 'vehicle');
  B.L.stop();
});

test('refused while wanted, or within a minute of taking or dealing damage; allowed once the minute is up', () => {
  const B = boot(), w = B.world;
  const a = B.connect();
  a.p.wanted = 2;
  a.say({ t: 'logoff' });
  assert.equal(a.off().s, 'cancel');
  assert.equal(a.off().c, 'wanted');
  assert.match(a.off().why, /wanted/);
  assert.ok(!a.p.logoff, 'no count');

  const b = B.connect();
  combat.damage(w, b.p.ped, 3, null, 'gun');   // (hurt)
  run(w, 20);
  b.say({ t: 'logoff' });
  assert.equal(b.off().c, 'fight');
  assert.ok(Math.abs(b.off().left - (LOGOFF.calmS - 20)) <= 1, `how long until you may (${b.off().left})`);
  run(w, LOGOFF.calmS - 20 + 1);
  b.say({ t: 'logoff' });
  assert.equal(b.off().s, 'start', 'a minute on: fine');

  B.L.stop();
});

test('a tab closed after a fight - even one where you only dealt the damage - leaves the body for 30 s and the drop rule', () => {
  const B = boot(), w = B.world;
  // never hurt, not wanted: before the safe exit, that was the quiet five minutes and nothing dropped
  const c = B.connect();
  const { p } = c, prof = p.profile;
  w.curMsg = 'dev'; prof.cash = 900; w.curMsg = null;
  const n = w.spawnPed(p.ped.x + 30, p.ped.y, { hp: 100 });
  combat.damage(w, n, 4, p.ped, 'fist');
  p.wanted = 0; p.heat = 0;   // (whatever the law made of it: the guard is the fight itself)
  const bags0 = bags(w).length;
  c.conn.close(1001);   // (the tab closed)
  assert.equal(p.ghostSafe, false, 'not the quiet five minutes');
  assert.ok(Math.abs(p.ghostUntil - w.time - GHOST_SECONDS) < 0.1, 'the usual 30 s');
  run(w, GHOST_SECONDS - 1);
  assert.ok(w.players.has(p.pid) && !p.ped.removed, 'the body is still there to be had');
  run(w, 2);
  assert.ok(!w.players.has(p.pid), 'then gone');
  assert.equal(prof.cash, 0, 'and its cash dropped where it stood');
  assert.ok(bags(w).length > bags0);
  B.L.stop();
});

test('the summary: earned and spent from the money watcher\'s sources (dev money left out), skill xp, Criminal EXP, Samaritan points, time played', () => {
  const B = boot(), w = B.world, c = B.connect();
  const { p } = c, prof = p.profile;
  w.curMsg = 'dev'; prof.bank += 2e6; w.curMsg = null;   // (the debug menu's money: neither earned nor spent)
  w.curSys = 'taxijob'; prof.cash += 300; w.curSys = null;   // (a fare)
  w.curMsg = 'shop:atm'; prof.cash -= 100; prof.bank += 100; w.curMsg = null;   // (the ATM: neither)
  const h = w.map.homes.find((q) => q.kind === 'house' && !w.homeOwner.has(q.id));
  teleport(w, p.ped, h.x, h.y);
  const money0 = prof.cash + prof.bank;
  c.say({ t: 'menu', poi: poiOf(w, h).id, opt: 'hbuy' });
  const price = money0 - prof.cash - prof.bank;
  assert.ok(price > 0, 'bought a home');
  w.skillDay = 1;
  const xp = skills.gain(w, p, 'drive', 3) + skills.gain(w, p, 'brawl', 5);
  prof.criminalExp += 7; prof.samaritan += 3;
  run(w, 30);
  w.curSys = 'jobs'; prof.cash += 55.4; w.curSys = null;   // (a delivery, settled when the session ends)
  homes.goInside(w, p, h);
  c.say({ t: 'logoff' });
  const done = c.off();
  assert.equal(done.s, 'done');
  assert.equal(done.earned, 355);
  assert.equal(done.spent, price);
  assert.equal(done.xp, Math.floor(xp));
  assert.ok(done.xp > 0);
  assert.equal(done.cexp, 7);
  assert.equal(done.sam, 3);
  assert.ok(Math.abs(done.secs - 30) <= 1, `time played (${done.secs})`);
  B.L.stop();
});
