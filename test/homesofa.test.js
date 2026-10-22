// The couch and the TV at home (the owner, 10-06 / 10-16: "usable furniture: sit, sleep, watch TV..."; "can't find sit,
// TV"): walk up to the couch and sit down (a rest: health back slowly), switch the TV on (the page's room lit by it),
// move to get up; nobody home, the TV goes off.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer, run } from './helpers.js';
import { HOME_IN } from '../shared/rules.js';
import { IN } from '../shared/input.js';
import { TILE_IN } from '../shared/homelayout.js';
import * as economy from '../server/systems/economy.js';
import * as homes from '../server/systems/homes.js';
import * as homeinside from '../server/systems/homeinside.js';
import { teleport } from './helpers.js';

const lastHome = (conn) => [...conn.sent].reverse().find((m) => m && m.t === 'home' && m.id !== undefined);

test('the couch: sit down, a rest, the TV on and off, up again; the TV off with nobody home', () => {
  const w = makeWorld();
  const { p, conn } = joinPlayer(w, { bank: 1e6 });
  const h = w.map.homes.find((q) => q.kind === 'house' && !w.homeOwner.has(q.id));
  teleport(w, p.ped, h.x, h.y);
  economy.handleMenu(w, p, w.map.pois.find((q) => q.kind === 'home' && q.home === h.id).id, 'hbuy');
  homes.goInside(w, p, h);
  const s = p.ped.home, L = homeinside.planIn(w, h);
  const couch = L.pieces.find((q) => q.ch === 'C'), tv = L.pieces.find((q) => q.ch === 'V' || q.ch === 'v');
  assert.ok(couch && tv, 'a couch and a TV in the house');
  // up to the TV: switch it on
  const standBy = (q) => { for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) { const x = q.x + q.w / 2 + dx * (q.w / 2 + 12), y = q.y + q.h / 2 + dy * (q.h / 2 + 12); if (!L.solid(Math.floor(x / TILE_IN), Math.floor(y / TILE_IN))) { s.x = x; s.y = y; return true; } } return false; };
  assert.ok(standBy(tv), 'room by the TV');
  let act = homeinside.interaction(w, p);
  assert.ok(act && /Switch the TV on/.test(act.label), act && act.label);
  act.run();
  assert.ok(w.homeTv.has(h.id), 'on');
  // up to the couch: sit and watch
  assert.ok(standBy(couch), 'room by the couch');
  act = homeinside.interaction(w, p);
  assert.ok(act && /Sit down and watch TV/.test(act.label), act && act.label);
  p.ped.hp = 50;
  act.run();
  assert.ok(s.seat, 'sat down');
  assert.ok(s.seat.x > couch.x && s.seat.x < couch.x + couch.w && s.seat.y > couch.y && s.seat.y < couch.y + couch.h, 'on the couch');
  run(w, 5);
  assert.ok(p.ped.hp > 50 + HOME_IN.restHeal * 4, `a rest (${p.ped.hp.toFixed(1)})`);
  assert.match(homeinside.interaction(w, p).label, /Watching TV/);
  homeinside.send(w, p, true);
  const m = lastHome(conn);
  assert.ok(Array.isArray(m.seat) && m.tv === 1, 'the page: sat, the TV on');
  // move: up again
  let seq = 0;
  p.inputQ.push({ seq: ++seq, bits: 0, mx: 1, my: 0, aim: 0 }); w.step();
  assert.ok(!s.seat, 'up');
  // nobody home: the TV goes off
  homeinside.leave(w, p);
  run(w, 3);
  assert.ok(!w.homeTv.has(h.id), 'off with nobody home');
  void IN;
});
