// One Quit for every activity (the owner, 11-12: "When you start a game of golf but walk away the job waypoint still
// stays on screen, is there a way to cancel playing golf and similar activities or if you walk away for some reason it
// will have the job UI disappear?" - server/systems/activityquit.js, walkaway.js): the phone's Quit ends golf, bowling,
// pool, a match through each one's own leave, its tracker line and waypoint gone; walking off the venue warns, then ends
// it after QUIT.awayS; a vehicle ends it at once; a Quit for one activity never quits the next (a job).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeWorld, joinPlayer, run, teleport, players } from './helpers.js';
import { QUIT, ARCADE, MATCH_COUNTDOWN_S } from '../shared/rules.js';
import { GOLF_FEE } from '../shared/golf.js';
import { BOWL } from '../shared/bowling.js';
import * as phone from '../server/systems/phone.js';
import * as aq from '../server/systems/activityquit.js';
import * as golf from '../server/systems/golf.js';
import * as poolmatch from '../server/systems/poolmatch.js';
import * as arcade from '../server/systems/arcade.js';
import * as minigames from '../server/systems/minigames.js';

// what p was told: the toasts still waiting, and those sent (net.js: the snapshots' events)
const toasts = (p, conn) => [...p.toasts.map((t) => t.text), ...conn.sent.map((m) => JSON.stringify(m))].join(' | ');
const quit = (w, p, k) => phone.handle(w, p, { t: 'phone', a: 'quit', k });
const tee = (w, p, n = 1) => { const h = w.map.golf.holes[n - 1]; teleport(w, p.ped, h.tee.x, h.tee.y); assert.equal(golf.teeOff(w, p, n), null); return h; };
const seat = (w, p, model, x, y) => { const v = w.spawnVehicle(model, x, y, 0); p.ped.vehId = v.id; p.ped.seat = 0; v.seats[0] = p.ped.id; p.ped.hidden = true; return v; };

test('golf: the phone shows Quit golf; Quit gives the hole up - ball, tracker line and waypoint gone, a toast; a stale Quit never ends a job', () => {
  const w = makeWorld();
  const { p, conn } = joinPlayer(w, { cash: 50 });
  tee(w, p);
  assert.equal(p.profile.cash, 50 - GOLF_FEE);
  const ball = p.golf.ball;
  let board = phone.handle(w, p, { t: 'phone', a: 'board' });
  assert.deepEqual(board.act, { k: 'golf', n: 'golf' }, 'the Jobs app: the activity going on');
  assert.ok(/Hole 1/.test(players.buildMe(w, p).job.text), 'the tracker');
  board = quit(w, p, 'golf');
  assert.equal(board.err, null);
  assert.equal(p.golf, null, 'the hole given up');
  assert.ok(!w.get(ball), 'the ball off the course');
  assert.equal(board.act, null, 'nothing going on now');
  assert.equal(players.buildMe(w, p).job, null, 'no tracker line, no waypoint');
  run(w, 0.2);
  assert.match(toasts(p, conn), /You gave up the hole/);
  assert.equal(p.profile.cash, 50 - GOLF_FEE, 'the fee stays paid (as giving a hole up always was)');
  // a Quit pressed for golf once it's over never quits what's next
  p.job = { type: 'courier', text: 'A job', tx: 0, ty: 0, stage: 'go' };
  assert.equal(quit(w, p, 'golf').err, 'Nothing to quit.');
  assert.ok(p.job, 'the job is kept');
  assert.equal(aq.current(w, p).k, 'job');
  assert.equal(phone.handle(w, p, { t: 'phone', a: 'board' }).act, null, 'a job has its own card (Quit job)');
});

test('golf: walking off the course warns with a countdown on the tracker, back in time keeps the hole; away QUIT.awayS gives it up', () => {
  const w = makeWorld();
  const { p, conn } = joinPlayer(w, { cash: 50 });
  tee(w, p);
  const r = w.map.golf.rect;
  teleport(w, p.ped, r.x1 + QUIT.coursePadPx + 200, (r.y0 + r.y1) / 2);
  run(w, 1);
  assert.ok(p.golf, 'still on');
  assert.match(players.buildMe(w, p).job.text, /^Walk back to keep playing - \d+s$/, 'the warning on the tracker');
  assert.match(toasts(p, conn), new RegExp(`Walk back to keep playing - ${QUIT.awayS}s`));
  // back on the course: the warning goes, the hole's still yours
  const h = w.map.golf.holes[0];
  teleport(w, p.ped, h.tee.x, h.tee.y);
  run(w, 0.5);
  assert.ok(p.golf && /Hole 1/.test(players.buildMe(w, p).job.text), 'back: the hole goes on');
  // off again, for good
  teleport(w, p.ped, r.x1 + QUIT.coursePadPx + 200, (r.y0 + r.y1) / 2);
  run(w, QUIT.awayS - 1);
  assert.ok(p.golf, 'not yet');
  run(w, 1.5);
  assert.equal(p.golf, null, 'given up');
  assert.match(toasts(p, conn), /walked off the course - hole given up/);
  assert.equal(players.buildMe(w, p).job, null);
});

test('golf: a car ends it at once; a golf cart on the course does not', () => {
  const w = makeWorld();
  const { p, conn } = joinPlayer(w, { cash: 50 });
  const h = tee(w, p);
  const cart = seat(w, p, 'golfcart', h.tee.x + 40, h.tee.y);
  run(w, 1);
  assert.ok(p.golf, 'riding a golf cart round the course');
  cart.seats[0] = 0; p.ped.vehId = 0; p.ped.hidden = false;
  seat(w, p, 'sedan', h.tee.x + 40, h.tee.y);
  run(w, 0.2);
  assert.equal(p.golf, null, 'in a car: given up at once');
  assert.match(toasts(p, conn), /got in a vehicle - hole given up/);
});

test('bowling: Quit hands the shoes back; walking out warns, then ends the game after QUIT.awayS', () => {
  const w = makeWorld(), A = w.map.bowling;
  const { p, conn } = joinPlayer(w, { cash: 100 });
  teleport(w, p.ped, A.counter.x, A.counter.y);
  players.findInteraction(w, p).run();
  assert.ok(p.bowl);
  assert.equal(p.profile.cash, 100 - BOWL.FEE);
  assert.deepEqual(phone.handle(w, p, { t: 'phone', a: 'board' }).act, { k: 'bowling', n: 'bowling' });
  assert.equal(quit(w, p, 'bowling').err, null);
  assert.equal(p.bowl, null, 'shoes handed back');
  assert.equal(w.bowl.lanes.filter((l) => l.game && !l.game.npc).length, 0, 'the lane is free');
  run(w, 0.2);
  assert.match(toasts(p, conn), /hand your shoes back/);
  // again, and walk out
  teleport(w, p.ped, A.counter.x, A.counter.y);
  players.findInteraction(w, p).run();
  assert.ok(p.bowl);
  teleport(w, p.ped, A.counter.x + 3000, A.counter.y);
  run(w, 1);
  assert.ok(p.bowl && /Walk back to keep playing/.test(players.buildMe(w, p).job.text), 'warned');
  run(w, QUIT.awayS);
  assert.equal(p.bowl, null, 'game over');
  assert.match(toasts(p, conn), /walked out of the alley/);
});

test('pool: Quit gets you up from the table - against a player a forfeit, as closing the screen is; the screen shut', () => {
  const w = makeWorld();
  const a = joinPlayer(w, { cash: 100 }), b = joinPlayer(w, { cash: 100 });
  const o = { fee: ARCADE.pool, tickets: true, cpu: 'the CPU', at: () => true };
  poolmatch.interaction(w, a.p, 'qt', o).run();
  poolmatch.interaction(w, b.p, 'qt', o).run();
  assert.equal(poolmatch.matchOf(w, a.p).st, 'play', 'a game on');
  assert.equal(aq.current(w, b.p).k, 'pool');
  assert.equal(quit(w, b.p, 'pool').err, null);
  assert.equal(b.p.pool, null, 'up from the table');
  assert.ok(b.conn.sent.some((m) => m.t === 'pool' && m.close), 'the screen shut');
  assert.deepEqual(a.p.profile.poolRec, { w: 1, l: 0 }, 'the other player wins');
  assert.deepEqual(b.p.profile.poolRec, { w: 0, l: 1 }, 'a forfeit');
  run(w, 0.2);
  assert.match(toasts(b.p, b.conn), /got up from the pool table/);
});

test('an arcade machine: Quit shuts its screen and the score so far comes in, as Esc does', () => {
  const w = makeWorld();
  const { p, conn } = joinPlayer(w, { cash: 100 });
  arcade.play(w, p, false, null, 'starfall');
  const id = p.arcade.id;
  assert.equal(aq.current(w, p).k, 'arcade');
  assert.equal(quit(w, p, 'arcade').err, null);
  assert.ok(conn.sent.some((m) => m.t === 'arcade' && m.close), 'the screen told to shut');
  assert.notEqual(aq.current(w, p)?.k, 'arcade', 'nothing more to quit');
  arcade.onScore(w, p, { t: 'arcade', id, score: 0, secs: 1 });   // (the page's closing word)
  assert.equal(p.arcade, null, 'the credit is over');
  const page = readFileSync(new URL('../client/main.js', import.meta.url), 'utf8');
  assert.match(page, /case 'arcade':[^\n]*\n\s*if \(m\.close\)/, 'the page shuts the screen on the server\'s word');
});

test('soccer: Quit forfeits (the match goes on); walking off warns, then forfeits; a vehicle forfeits at once', () => {
  const w = makeWorld();
  const v = w.map.venues.find((q) => q.kind === 'soccer'), r = v.rect;
  const a = joinPlayer(w, { bank: 0 }), b = joinPlayer(w, { bank: 0 }), c = joinPlayer(w, { bank: 0 }), d = joinPlayer(w, { bank: 0 });
  const start = () => {
    teleport(w, a.p.ped, r.x + r.w * 0.2, r.y + r.h / 2); teleport(w, b.p.ped, r.x + r.w * 0.3, r.y + r.h / 3);
    teleport(w, c.p.ped, r.x + r.w * 0.8, r.y + r.h / 2); teleport(w, d.p.ped, r.x + r.w * 0.7, r.y + r.h / 3);
    run(w, MATCH_COUNTDOWN_S + 0.6);
    assert.equal(w.matchState[v.id].phase, 'playing');
  };
  start();
  assert.equal(aq.current(w, a.p).k, 'match');
  assert.equal(quit(w, a.p, 'match').err, null);
  assert.equal(minigames.matchOf(w, a.p), -1, 'out of it');
  assert.equal(minigames.targetFor(w, a.p), null, 'no tracker line');
  run(w, 0.5);
  assert.equal(w.matchState[v.id].phase, 'playing', 'the match goes on without them');
  assert.match(toasts(a.p, a.conn), /forfeited/);
  // b walks off: warned, then out
  teleport(w, b.p.ped, r.x - 900, r.y);
  run(w, 1);
  assert.ok(minigames.matchOf(w, b.p) >= 0 && /Walk back to keep playing/.test(minigames.targetFor(w, b.p).text), 'warned');
  run(w, QUIT.awayS);
  assert.equal(minigames.matchOf(w, b.p), -1, 'forfeited');
  // the next match: c gets in a car on the pitch - out at once
  run(w, 8);
  start();
  assert.ok(minigames.matchOf(w, c.p) >= 0);
  seat(w, c.p, 'sedan', c.p.ped.x, c.p.ped.y);
  run(w, 0.4);
  assert.equal(minigames.matchOf(w, c.p), -1, 'in a car: out at once');
  assert.match(toasts(c.p, c.conn), /got in a vehicle - forfeited/);
});

test('logged off mid-activity: out of it after QUIT.awayS, quietly', () => {
  const w = makeWorld();
  const { p } = joinPlayer(w, { cash: 50 });
  tee(w, p);
  players.leave(w, p);   // (the connection gone: a ghost body for a while)
  run(w, 1);
  assert.ok(p.golf, 'a blip is forgiven');
  run(w, QUIT.awayS + 1);
  assert.equal(p.golf, null, 'the hole given up');
});

test('the page: the tracker line opens the phone\'s Jobs app, where Quit <activity> is pressed twice and sent with its kind', async () => {
  const els = new Map();
  const el = (id) => { if (!els.has(id)) els.set(id, { id, innerHTML: '', textContent: '', dataset: {}, style: {}, attrs: {}, listeners: {}, classList: { s: new Set(), toggle(c, on) { if (on === undefined ? !this.s.has(c) : on) this.s.add(c); else this.s.delete(c); }, add(c) { this.s.add(c); }, remove(c) { this.s.delete(c); }, contains(c) { return this.s.has(c); } }, setAttribute(k, v) { this.attrs[k] = v; }, addEventListener(k, f) { this.listeners[k] = f; }, querySelectorAll: () => [], querySelector: () => null, getBoundingClientRect: () => ({ x: 0, y: 0, width: 0, height: 0 }) }); return els.get(id); };
  const { createInfo } = await import('../client/hudinfo.js'), { createPhone } = await import('../client/phone.js');   // (loaded before the stand-in page)
  const had = { document: globalThis.document, window: globalThis.window };
  globalThis.document = { getElementById: el, body: { classList: el('body').classList }, querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, createElement: () => el(Math.random()) };
  globalThis.window ||= globalThis;
  try {
    let opened = 0;
    const info = createInfo({ openJob: () => opened++ });
    info.me({ hp: 100, cash: 50, weapon: 'fists', weapons: [], job: { text: 'Hole 1 · par 4 · stroke 1 · Driver', x: 10, y: 10, stage: 'golf' } }, null);
    el('job').listeners.click();
    assert.equal(opened, 1, 'the tracker line tapped: the phone at Jobs');
    const sent = [];
    let closed = 0;
    const ph = createPhone({ map: () => ({ pois: [], places: [] }), pos: () => ({ x: 0, y: 0 }), isCop: () => false, send: (m) => sent.push(m), setWaypoint() {}, waypoint: () => null, toast() {}, refocus() {}, close() { closed++; }, job: () => ({ text: 'Hole 1 · par 4 · stroke 1 · Driver', x: 5, y: 5 }) });
    ph.openApp('jobs');
    ph.onBoard({ job: null, act: { k: 'golf', n: 'golf' }, jobs: [] });
    const screen = el('ph-screen').innerHTML;
    assert.match(screen, /NOW · GOLF/);
    assert.match(screen, /Hole 1 · par 4/, 'the tracker\'s line');
    assert.match(screen, /data-act="quitact" data-k="golf">Quit golf</);
    assert.ok(screen.indexOf('Quit golf') < screen.indexOf('ph-chips'), 'at the top, above the board');
  } finally { globalThis.document = had.document; if (!had.window) delete globalThis.window; }
  const src = readFileSync(new URL('../client/phone.js', import.meta.url), 'utf8');
  assert.match(src, /if \(b\.dataset\.sure\) \{ b\.disabled = true; ctx\.send\(\{ t: 'phone', a: 'quit', k: b\.dataset\.k \}\); ctx\.close\(\); \} else \{ b\.dataset\.sure = '1'; b\.textContent = 'Press again to quit'; \}/, 'two presses');
});
