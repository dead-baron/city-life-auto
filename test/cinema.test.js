// The Grand Theatre as a cinema (shared/cinema.js, server/systems/cinema.js): on the map as a walk-in with its lobby,
// counter and two screens; buying a ticket and popcorn; sitting down and watching a film; getting up, the film's end.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer, run, teleport, players } from './helpers.js';
import { T, TILE } from '../shared/constants.js';
import { CINE, FILMS, roomAt } from '../shared/cinema.js';
import * as economy from '../server/systems/economy.js';
import * as cinema from '../server/systems/cinema.js';

let W = null;
const world = () => (W ||= makeWorld());

test('The Grand Theatre on the map: a walk-in cinema - the counter in the lobby, two screens with rows of seats, walls between', () => {
  const w = world(), m = w.map, C = m.cinema;
  assert.ok(C, 'a cinema');
  const b = m.buildings[C.b], poi = m.pois.find((q) => q.id === C.poi);
  assert.equal(poi.kind, 'cinema');
  assert.equal(poi.label, 'The Grand Theatre');
  assert.ok(b.walkIn && m.walkIns.includes(b.id) && b.walkIn.units[0].kind === 'cinema', 'a walk-in');
  assert.ok(C.district, `in a district (${C.district})`);
  assert.equal(m.tileAtPx(C.counter.x, C.counter.y), T.FLOOR, 'in front of the counter');
  assert.equal(C.rooms.length, 2, 'two screens');
  // every seat can be walked to from the counter (through the corridor and the room's door), and walls part the rooms
  const key = (tx, ty) => ty * 100000 + tx, seen = new Set(), q = [[Math.floor(C.counter.x / TILE), Math.floor(C.counter.y / TILE)]];
  seen.add(key(...q[0]));
  while (q.length) {
    const [tx, ty] = q.shift();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = tx + dx, ny = ty + dy;
      if (nx < b.tx || nx >= b.tx + b.tw || ny < b.ty || ny >= b.ty + b.th || seen.has(key(nx, ny)) || m.tileAtPx((nx + 0.5) * TILE, (ny + 0.5) * TILE) !== T.FLOOR) continue;
      seen.add(key(nx, ny)); q.push([nx, ny]);
    }
  }
  for (const R of C.rooms) {
    assert.ok(R.seats.length >= 12, `screen ${R.i + 1}: ${R.seats.length} seats`);
    assert.ok(R.x0 >= b.tx * TILE && R.x1 <= (b.tx + b.tw) * TILE && R.y0 >= b.ty * TILE && R.y1 <= (b.ty + b.th) * TILE, 'inside the building');
    for (const s of R.seats) {
      assert.equal(roomAt(C, s.x, s.y), R.i, 'the seat in its room');
      assert.ok(seen.has(key(Math.floor(s.x / TILE), Math.floor(s.y / TILE))), `a seat you can walk to (${s.x}, ${s.y})`);
    }
    assert.ok(R.screen.x1 - R.screen.x0 >= 90, 'a big screen');
  }
  const a = C.rooms[0], c = C.rooms[1];
  assert.equal(m.tileAtPx(a.x1 + TILE / 2, a.y0 + TILE / 2), T.WALL, 'a wall between the first screen and the corridor');
  assert.equal(m.tileAtPx(c.x0 - TILE / 2, c.y0 + TILE / 2), T.WALL, 'and the second');
});

test('buying a ticket and popcorn at the counter, sitting down in a screen, watching the film, eating the popcorn', () => {
  const w = world(), C = w.map.cinema, poi = w.map.pois.find((q) => q.id === C.poi);
  const { p } = joinPlayer(w, { cash: 100 });
  teleport(w, p.ped, C.counter.x, C.counter.y);
  const menu = economy.buildMenu(w, p, poi);
  assert.ok(menu && JSON.stringify(menu).includes('Film Ticket'), 'the counter sells tickets');
  economy.handleMenu(w, p, poi.id, `i:filmTicket:${CINE.TICKET}:1`);
  economy.handleMenu(w, p, poi.id, `i:popcorn:${CINE.POPCORN}:1`);
  assert.equal(p.profile.inventory.filmTicket, 1, 'a ticket');
  assert.equal(p.profile.inventory.popcorn, 1, 'popcorn');
  assert.equal(p.profile.cash, 100 - CINE.TICKET - CINE.POPCORN, 'paid');
  // into the first screen, by a seat
  const R = C.rooms[0], s0 = R.seats[R.seats.length - 1];
  teleport(w, p.ped, s0.x, s0.y + 6);
  let act = players.findInteraction(w, p);
  assert.ok(act && /Sit down and watch/.test(act.label), `a seat (${act && act.label})`);
  act.run();
  assert.ok(p.cine, 'watching');
  assert.ok(p.ped.sitBench, 'sitting');
  assert.equal(p.profile.inventory.filmTicket || 0, 0, 'the ticket torn');
  run(w, 2);
  const me = players.buildMe(w, p);
  assert.ok(me.cine && FILMS[me.cine.film] && me.cine.at > 1, `the film on (${JSON.stringify(me.cine)})`);
  assert.ok(/Screen 1/.test(me.job.text), `the HUD tracker (${me.job.text})`);
  assert.ok(/Get up/.test(players.findInteraction(w, p).label), 'get up');
  p.ped.hp = Math.max(1, p.ped.maxHp - 20);
  economy.useItem(w, p, 'popcorn');
  assert.equal(p.profile.inventory.popcorn || 0, 0, 'the popcorn eaten');
  assert.ok(p.cine, 'still watching');
  // without a ticket, no seat
  const { p: q } = joinPlayer(w, { cash: 100 });
  teleport(w, q.ped, R.seats[0].x, R.seats[0].y + 6);
  act = players.findInteraction(w, q);
  assert.ok(act && /need a ticket/.test(act.label), act && act.label);
  act.run();
  assert.ok(!q.cine, 'no ticket, no film');
  // the film runs to its end: the lights come up
  run(w, CINE.FILM_S);
  assert.equal(p.cine, null, 'the film ended');
  assert.ok(!p.ped.sitBench, 'up');
});

test('getting up or walking out ends the film for you; a few NPCs watch while you are near', () => {
  const w = world(), C = w.map.cinema, R = C.rooms[1];
  const { p } = joinPlayer(w, { cash: 100 });
  p.profile.inventory.filmTicket = 2;
  teleport(w, p.ped, R.seats[3].x, R.seats[3].y + 6);
  run(w, 1.5);
  const npcs = w.cine.rooms.reduce((n, r) => n + r.npcs.length, 0);
  assert.ok(npcs >= 4, `an audience (${npcs})`);
  players.findInteraction(w, p).run();
  assert.ok(p.cine, 'watching');
  players.findInteraction(w, p).run();
  assert.equal(p.cine, null, 'got up');
  players.findInteraction(w, p).run();
  assert.ok(p.cine, 'a second ticket, a second sit');
  teleport(w, p.ped, C.counter.x, C.counter.y); run(w, 0.2);
  assert.equal(p.cine, null, 'walked out');
  assert.equal(p.profile.inventory.filmTicket || 0, 0, 'both tickets used');
  for (const o of w.players.values()) teleport(w, o.ped, C.counter.x + 4000, C.counter.y);
  run(w, 1.5);
  assert.equal(w.cine.rooms.reduce((n, r) => n + r.npcs.length, 0), 0, 'the audience gone when nobody is near');
});
