// Reconnecting inside a home (the owner, 10-16: "Reconnecting inside a home leaves you stuck: restore inside, or spawn
// outside if someone else holds the claim"). Back before the ghost timer runs out, from a new page: the server sends the
// rooms again (the page had never seen them, and kept you standing in the street). Logged off at home - the timer ran
// out, the server restarted - you're back inside your own home; not in one that's someone else's now, nor in a place
// you were only looking round: then you're out in the street by its door. (And the page drops rooms it was showing when
// a new session starts: client/main.js 'welcome' - the server sends them again if you're in.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer, fakeConn, players, teleport } from './helpers.js';
import { PED_BLOCK } from '../shared/map.js';
import * as economy from '../server/systems/economy.js';
import * as homes from '../server/systems/homes.js';
import * as homeinside from '../server/systems/homeinside.js';

const poiOf = (w, h) => w.map.pois.find((q) => q.kind === 'home' && q.home === h.id);
function ownHome(w, p, kind = 'house') {
  const h = w.map.homes.find((q) => q.kind === kind && !w.homeOwner.has(q.id));
  teleport(w, p.ped, h.x, h.y);
  economy.handleMenu(w, p, poiOf(w, h).id, 'hbuy');
  assert.equal(w.homeOwner.get(h.id), p.pid);
  return h;
}
const steps = (w, n) => { for (let i = 0; i < n; i++) w.step(); };
const fullHome = (conn, h) => conn.sent.find((m) => m && m.t === 'home' && m.id === h.id && typeof m.name === 'string' && 'decor' in m);

test('back from a dropped page while still at home: the new page gets the rooms again, and you walk round them', () => {
  const w = makeWorld();
  const { p, prof } = joinPlayer(w, { bank: 1e6 });
  const h = ownHome(w, p);
  homes.goInside(w, p, h);
  assert.ok(p.ped.home && p.ped.hidden, 'inside');
  homeinside.openMenu(w, p, 'hall');
  players.leave(w, p);   // (the page is gone)
  assert.ok(p.ghostUntil > w.time, 'its ghost waits');
  steps(w, 40);
  const conn = fakeConn();
  assert.equal(players.join(w, conn, prof), p, 'the same session');
  assert.ok(p.ped.home && p.ped.home.id === h.id, 'still inside');
  assert.ok(fullHome(conn, h), 'the rooms - the whole of them - to the new page');
  assert.equal(p.homeMenu, null, 'the menu that was open is closed');
  // and walking: the server moves you round the rooms
  const x0 = p.ped.home.x, y0 = p.ped.home.y;
  let seq = 1;
  for (let i = 0; i < 20; i++) { players.queueInput(p, { seq: seq++, bits: 0, mx: 0, my: -1, aim: 0 }); w.step(); }
  assert.ok(Math.hypot(p.ped.home.x - x0, p.ped.home.y - y0) > 4, 'walked');
  assert.ok(conn.sent.filter((m) => m && m.t === 'home').length > 10, 'where you are, every tick');
});

test('logged off at home (the ghost timer ran out, or the server restarted): back inside next time', () => {
  const w = makeWorld();
  const { p, prof } = joinPlayer(w, { bank: 1e6 });
  const h = ownHome(w, p);
  homes.goInside(w, p, h);
  steps(w, 2);
  players.savePos(p, p.ped);
  assert.equal(prof.inHome, h.id, 'kept: where you logged off');
  players.leave(w, p);
  p.ghostUntil = w.time + 0.05;   // (the timer runs out)
  steps(w, 4);
  assert.ok(!w.players.has(prof.pid), 'logged off');
  const conn = fakeConn();
  const q = players.join(w, conn, prof);
  assert.notEqual(q, p, 'a new session');
  assert.ok(q.ped.hidden && q.ped.inside === h.id && q.ped.home && q.ped.home.id === h.id, 'back inside your home');
  assert.ok(fullHome(conn, h), 'its rooms to the page');
  steps(w, 4);
  assert.ok(q.ped.home, 'and still in there a moment later');
  // out by the front door: logged off on the street, the street next time
  homeinside.leave(w, q);
  players.savePos(q, q.ped);
  assert.equal(prof.inHome, undefined, 'not at home');
});

test('logged off in a home that is someone else\'s now (sold, foreclosed), or one you were looking round: out in the street by its door', () => {
  const w = makeWorld();
  const { p, prof } = joinPlayer(w, { bank: 1e6 });
  const h = ownHome(w, p);
  homes.goInside(w, p, h);
  players.savePos(p, p.ped);
  players.leave(w, p);
  p.ghostUntil = w.time + 0.05;
  steps(w, 4);
  w.homeOwner.set(h.id, 'someoneelse0000000000000');   // (someone else holds it now)
  const conn = fakeConn();
  const q = players.join(w, conn, prof);
  assert.ok(!q.ped.hidden && !q.ped.home && q.ped.inside == null, 'outside');
  assert.ok(!fullHome(conn, h), 'no rooms sent');
  assert.ok(!PED_BLOCK[w.map.tileAtPx(q.ped.x, q.ped.y)], 'on ground you can walk');
  assert.ok(Math.hypot(q.ped.x - h.x, q.ped.y - h.y) < 400, 'by its door');
  // a look round a home for sale: never saved as yours
  const { p: v, prof: vp } = joinPlayer(w);
  const f = w.map.homes.find((x) => x.kind === 'house' && !w.homeOwner.has(x.id));
  teleport(w, v.ped, f.x, f.y);
  assert.equal(homeinside.tour(w, v, f), null);
  players.savePos(v, v.ped);
  assert.equal(vp.inHome, undefined, 'a visitor');
});
