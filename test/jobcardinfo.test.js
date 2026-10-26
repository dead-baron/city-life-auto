// The server's side of the HUD's information (UI-4): the job card's words in the self record (server phone.js
// jobCardInfo - the job, the call it's on, step N of M, the time left), a job's long intro with a one-line short form
// for the HUD (world.notify's short, the whole of it for the phone's Log), and a taxi rank inside a station: the
// station's own prompt comes first there, so its menu offers the cab's job card (the owner's note: the taxi card never
// appeared).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer, run } from './helpers.js';

const cab = await import('../server/systems/taxijob.js');
const phone = await import('../server/systems/phone.js');
const economy = await import('../server/systems/economy.js');
const { buildMe } = await import('../server/systems/players.js');
const { openNear } = await import('../server/systems/firefighter.js');
const dev = await import('../server/dev.js');

const w = makeWorld();
const put = (e, x, y) => { e.x = x; e.y = y; e.vx = 0; e.vy = 0; e.lz = 0; w.place(e); };

test('the job card: the job, the fare it\'s on, step 1 of 2 picking up, 2 of 2 on the way; the shift\'s clock', () => {
  const { p } = joinPlayer(w);
  const r = cab.ranksOf(w.map)[0], at = openNear(w.map, r.x + 200, r.y + 200) || r;
  put(p.ped, at.x, at.y);
  dev.command(w, p, 'cabjob', {});
  const j = buildMe(w, p).job;
  assert.equal(j.k, 'Taxi');
  assert.deepEqual(j.step, [1, 2], 'picking the fare up');
  assert.equal(j.u, 'Fare'); assert.equal(j.n, 1);
  assert.ok(j.left > 0 && j.s === 'shift', 'the shift\'s time left');
  p.job.fare.aboard = true;
  assert.deepEqual(buildMe(w, p).job.step, [2, 2], 'the fare aboard: the drop-off');
  p.job.fare = null; p.job.stage = 'wait';
  const wait = buildMe(w, p).job;
  assert.equal(wait.step, undefined, 'waiting for a fare: no step');
  assert.equal(wait.n, undefined);
  phone.handle(w, p, { a: 'cancel' });
});

test('a job\'s long intro: the HUD\'s one line, the whole of it for the Log', () => {
  const { p } = joinPlayer(w);
  const r = cab.ranksOf(w.map)[0], at = openNear(w.map, r.x + 200, r.y + 200) || r;
  put(p.ped, at.x, at.y);
  p.toasts.length = 0;
  assert.equal(cab.start(w, p, r), null);
  const t = p.toasts.find((x) => /cab/.test(x.text));
  assert.ok(t && t.text.length > 120, 'the whole intro');
  assert.equal(t.short, 'Taxi shift: your cab is the green ring', 'and its line');
  phone.handle(w, p, { a: 'cancel' });
});

test('a taxi rank in a station: the station\'s prompt says so, its menu offers the cab\'s job card', () => {
  const { p, conn } = joinPlayer(w);
  const st = w.map.pois.find((q) => q.kind === 'station' && economy.poiLabel(w, p, q));
  assert.ok(st, 'a station with a menu');
  put(p.ped, st.x, st.y);
  run(w, 0.2);
  assert.ok(cab.interaction(w, p), 'a rank here');
  assert.match(economy.poiLabel(w, p, st), /^Check the trains and taxis at /, 'the prompt names it, a verb first');
  const menu = economy.buildMenu(w, p, st);
  const o = menu.opts.find((x) => x.id === 'cabcard');
  assert.ok(o && o.shut, 'Drive a taxi from here');
  conn.sent.length = 0;
  economy.handleMenu(w, p, st.id, 'cabcard');
  const card = conn.sent.find((m) => m && m.t === 'jobcard');
  assert.ok(card && card.job.id === 'cab', 'the taxi\'s job card');
  // the route board's menu (World v3's stations: its prompt comes first) offers it too
  conn.sent.length = 0;
  economy.handleMenu(w, p, -1, 'cabcard');
  assert.ok(conn.sent.some((m) => m && m.t === 'jobcard' && m.job.id === 'cab'), 'from the route board too');
});
