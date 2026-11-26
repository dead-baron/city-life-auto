// The Grand Theater as a cinema (shared/cinema.js, server/systems/cinema.js): on the map as a walk-in with its lobby,
// counter and two screens; buying a ticket and popcorn; sitting down and watching a film; getting up, the film's end.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer, run, teleport, players } from './helpers.js';
import { T, TILE } from '../shared/constants.js';
import { CINE, FILMS, roomAt, filmFor, cinemaBox, cinemaLayout, buildCinema } from '../shared/cinema.js';
import * as economy from '../server/systems/economy.js';
import * as cinema from '../server/systems/cinema.js';
import { nearTargets } from '../server/dev.js';

let W = null;
const world = () => (W ||= makeWorld());

test('The Grand Theater on the map: a walk-in cinema - the counter in the lobby, two screens with rows of seats, walls between', () => {
  const w = world(), m = w.map, C = m.cinema;
  assert.ok(C, 'a cinema');
  const b = m.buildings[C.b], poi = m.pois.find((q) => q.id === C.poi);
  assert.equal(poi.kind, 'cinema');
  assert.equal(poi.label, 'The Grand Theater');
  assert.ok(b.walkIn && m.walkIns.includes(b.id) && b.walkIn.units[0].kind === 'cinema', 'a walk-in');
  assert.ok(C.district, `in a district (${C.district})`);
  assert.equal(m.tileAtPx(C.counter.x, C.counter.y), T.FLOOR, 'in front of the counter');
  const nt = nearTargets(m, 'cinema');
  assert.ok(nt.length === 1 && Math.hypot(nt[0].x - C.counter.x, nt[0].y - C.counter.y) < 1, 'the dev `near` command takes you to the counter');
  assert.ok(C.rooms.length === 2 || C.rooms.length === 4, `two screens, or four where the building has the room (${C.rooms.length})`);
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
  assert.ok(menu && JSON.stringify(menu).includes('Movie Ticket'), 'the counter sells tickets');
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
  assert.equal(cinema.meInfo(w, p).room, 0, 'in screen 1');
  assert.ok(p.ped.sitBench, 'sitting');
  assert.equal(p.profile.inventory.filmTicket || 0, 0, 'the ticket torn');
  run(w, 2);
  const me = players.buildMe(w, p);
  assert.ok(me.cine && FILMS[me.cine.film] && me.cine.at > 1 && me.cine.at < 4, `the film on, from the start (${JSON.stringify(me.cine)})`);
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
  assert.equal(w.cine.rooms.reduce((n, r) => n + r.npcs.length, 0), 0, 'no audience in a world without NPCs (the server\'s NPC budget)');
  w.npcBudget = 200;   // (a world with NPCs: the last test in this file)
  run(w, 1.5);
  const npcs = w.cine.rooms.reduce((n, r) => n + r.npcs.length, 0);
  assert.ok(npcs >= 4, `an audience (${npcs})`);
  const shows = players.buildMe(w, p).cine;
  assert.ok(shows && shows.room === -1 && shows.shows.some((x) => x && FILMS[x[0]]), `what the audience is watching (${JSON.stringify(shows)})`);
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

test('a big building holds a compact cinema at its door: four screens off a hall, a lobby of seven rows - not fifty rows of floor', () => {
  // (World v3's Grand Theater is 40 x 59 tiles - counted 11-24: two screens across its back, the rest lobby)
  const TW = 80, TH = 90, grid = new Uint8Array(TW * TH).fill(T.BUILDING);
  for (const south of [true, false]) {
    grid.fill(T.BUILDING);
    const b = { id: 0, tx: 20, ty: 15, tw: 40, th: 59, prefab: 0, signs: [] };
    const m = { pois: [{ id: 7, label: CINE.NAME, b: 0, x: 0, y: 0 }], buildings: [b], prefabs: [{ rot: south ? 0 : 2 }], walkIns: [], dist: new Uint8Array(TW * TH), idx: (x, y) => y * TW + x, set: (x, y, t) => { grid[y * TW + x] = t; } };
    buildCinema(m, { T, DISTRICTS: [{ name: 'Midtown' }] });
    const C = m.cinema, box = cinemaBox(b, south);
    assert.ok(C && C.rooms.length === 4 && C.tiers === 2, 'four screens');
    assert.equal(box.x1 - box.x0 + 1, CINE.MAX_W, 'the inside as wide as it needs');
    assert.equal(box.y1 - box.y0 + 1, 2 * CINE.ROOM_T + 1 + 1 + CINE.LOBBY_T, 'and as deep: two pairs of screens, the wall between, the poster wall, the lobby');
    assert.equal(south ? box.y1 : box.y0, south ? b.ty + b.th - 2 : b.ty + 1, 'at the door');
    let floor = 0; for (let i = 0; i < grid.length; i++) if (grid[i] === T.FLOOR || grid[i] === T.COUNTER) floor++;
    assert.ok(floor < 23 * 19 + 4 && floor > 300, `a compact floor (${floor} tiles; the building's inside is ${38 * 57})`);
    // from the door: the counter, and every seat of every screen
    const fy = south ? b.ty + b.th - 1 : b.ty, dc = Math.floor((b.tx + 1 + b.tx + b.tw - 2) / 2);
    assert.equal(grid[fy * TW + dc], T.FLOOR, 'the door');
    const seen = new Set([fy * TW + dc]), q = [[dc, fy]];
    while (q.length) { const [x, y] = q.shift(); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const i = (y + dy) * TW + x + dx; if (!seen.has(i) && grid[i] === T.FLOOR) { seen.add(i); q.push([x + dx, y + dy]); } } }
    assert.ok(seen.has(Math.floor(C.counter.y / TILE) * TW + Math.floor(C.counter.x / TILE)), 'the counter from the door');
    for (const R of C.rooms) {
      assert.ok(R.seats.length >= 40, `screen ${R.i + 1}: ${R.seats.length} seats`);
      for (const st of R.seats) { assert.equal(roomAt(C, st.x, st.y), R.i); assert.ok(seen.has(Math.floor(st.y / TILE) * TW + Math.floor(st.x / TILE)), `screen ${R.i + 1}: a seat you can walk to`); }
      // its screen hangs on a wall (the building's own back, or the wall between the pairs)
      const wy = Math.floor(R.backEdge / TILE) - (south ? 1 : 0);
      assert.notEqual(grid[wy * TW + R.tx0 + 2], T.FLOOR, `screen ${R.i + 1}: a wall behind its screen`);
    }
    assert.equal(C.tierWalls.length, 1);
    assert.equal(grid[C.tierWalls[0] * TW + C.cc], T.FLOOR, 'the hall runs through the wall between the pairs');
    assert.equal(grid[C.tierWalls[0] * TW + C.cc - 3], T.WALL);
    // the far pair is rooms 0 and 1 (as the two screens always were): farther from the door than rooms 2 and 3
    const far = (R) => Math.abs((R.y0 + R.y1) / 2 - fy * TILE);
    assert.ok(far(C.rooms[0]) > far(C.rooms[2]) && far(C.rooms[1]) > far(C.rooms[3]));
  }
  // four screens, four films at once
  assert.equal(new Set([0, 1, 2, 3].map((r) => filmFor(r, 0))).size, 4);
  assert.deepEqual([filmFor(0, 0), filmFor(1, 0)], [0, 2], 'the two screens of a small cinema show what they always did');
  // a small building (the first city's): its whole inside, two screens
  const small = cinemaBox({ tx: 5, ty: 5, tw: 13, th: 14 }, true);
  assert.deepEqual([small.x0, small.x1, small.y0, small.y1, small.tiers], [6, 16, 6, 17, 1]);
  assert.equal(cinemaLayout({ south: true, ...small }).rooms.length, 2);
});

test('a sign names what is behind it: CINEMA over the building with the screens only', async () => {
  const { theatreBlade } = await import('../client/art2/game/statics.js');
  const M = { cinema: { b: 12 } };
  assert.equal(theatreBlade(M, { id: 12, name: 'The Grand Theater' }, 'THE GRAND THEATER'), 'CINEMA');
  assert.equal(theatreBlade(M, { id: 13, name: 'The Palace' }, 'THE PALACE'), 'SHOWS');
  assert.equal(theatreBlade(M, { id: 15, name: 'The Palace' }, 'THE PALACE', true), 'LIVE', 'a club in the building');
  assert.equal(theatreBlade(M, { id: 14, name: 'Velvet Cabaret' }, null), 'CABARET');
  assert.equal(theatreBlade({}, { id: 12, name: 'The Grand Theater' }, null), 'SHOWS', 'no cinema on the map, no CINEMA sign');
  const { BLADE_WORDS } = await import('../tools/placementlint.mjs');
  assert.ok(!/CINEMA/.test(BLADE_WORDS.theatre) && /SHOWS/.test(BLADE_WORDS.theatre) && /CINEMA/.test(BLADE_WORDS.cinema), 'the lint holds it: CINEMA on a theatre without screens is a fault');
});

