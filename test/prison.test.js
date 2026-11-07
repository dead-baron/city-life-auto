// Prison Island (the owner, 10-05: "sentenced after many arrests, about 5 min max, breakouts" - server/systems/prison.js):
// booked at five stars with a long record (the owner, 11-07: "Prison should be saved for very very high criminal ratings
// with 5 stars and long arrest records (or for admins to put misbehaving players in)"), it's a sentence at Kestrel Bay
// Penitentiary - no bail,
// up to five minutes inside its walls, the gate shut to prisoners, nobody hurt in there. Served, the Prison Boat brings
// you back to the mainland; or climb the outer wall and you're out - three stars, and an island to get off.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../server/world.js';
import { buildWorld3 } from '../server/world3.js';
import { joinPlayer, run, teleport, players } from './helpers.js';
import { T, TILE } from '../shared/constants.js';
import { PED_BLOCK } from '../shared/map.js';
import { PRISON } from '../shared/rules.js';
import * as prison from '../server/systems/prison.js';
import * as custody from '../server/systems/custody.js';
import * as unstuck from '../server/systems/unstuck.js';
import * as gates from '../server/systems/gates.js';
import { IN } from '../shared/input.js';
import * as law from '../server/systems/law.js';
import { spawnNpc } from '../server/systems/npc.js';
// an officer right by them (no unit: a car is sent for them)
const spawnCop = (w, p) => spawnNpc(w, 'cop', p.ped.x + 20, p.ped.y, 'cop');

const { map: M } = await buildWorld3(1337, { log: () => {} });
const inside = (x, y) => { const c = M.prison.compound; return x > c.tx * TILE && x < (c.tx + c.tw) * TILE && y > c.ty * TILE && y < (c.ty + c.th) * TILE; };

test('who goes to Prison Island: five stars with a long record, nobody else; capped at five minutes', () => {
  const w = new World(M, { npcBudget: 0, throwErrors: true });
  const { p } = joinPlayer(w);
  p.profile.arrests = []; p.profile.bookings = 0; p.profile.criminalExp = 0;
  assert.equal(prison.sentenceFor(w, p, 2), 0, 'a first booking at two stars: the cells');
  assert.equal(prison.sentenceFor(w, p, 4), 0, 'four stars: the cells (it was prison before 11-07)');
  assert.equal(prison.sentenceFor(w, p, 5), 0, 'five stars, a clean record: the cells');
  prison.noteArrest(p); prison.noteArrest(p);
  assert.equal(prison.sentenceFor(w, p, 3), 0, 'the third time in a while at three stars: the cells (it was prison)');
  while (prison.record(p) < PRISON.record) prison.noteArrest(p);
  assert.equal(prison.sentenceFor(w, p, 4), 0, 'a long record at four stars: the cells');
  assert.ok(prison.sentenceFor(w, p, 5) > 0, `five stars and ${PRISON.record} bookings before: prison`);
  const { p: q } = joinPlayer(w);
  q.profile.arrests = []; q.profile.bookings = 0; q.profile.criminalExp = PRISON.rating;
  assert.ok(prison.sentenceFor(w, q, 5) > 0 && prison.sentenceFor(w, q, 4) === 0, 'or five stars and a high criminal rating');
  for (let i = 0; i < 6; i++) prison.noteArrest(p);
  assert.ok(prison.sentenceFor(w, p, 5) <= PRISON.max && PRISON.max <= 300, 'five minutes at most');
  assert.equal(prison.record(p), PRISON.record + 6, 'the record counts every booking (not only the last few kept)');
});

test('booked at five stars with a long record: inside the walls, weapons away, nobody hurt, the gate shut to you; served, back on the mainland', () => {
  const w = new World(M, { npcBudget: 0, throwErrors: true });
  const { p } = joinPlayer(w, { weapons: { fists: 0, pistol: 24 } });
  p.profile.arrests = []; p.profile.bookings = PRISON.record;
  p.ped.weapon = 'pistol';
  p.wanted = 5;
  custody.surrender(w, p);   // (turned themself in: booked at once)
  assert.ok(p.prison && !p.custody, 'sentenced, not in the cells');
  assert.ok(inside(p.ped.x, p.ped.y), 'inside the compound');
  assert.ok(!PED_BLOCK[M.tileAtPx(p.ped.x, p.ped.y)], 'on open ground');
  w.step();
  assert.equal(p.ped.weapon, 'fists', 'weapons away');
  assert.ok(p.ped.cellSafe, 'nobody hurts anyone in there');
  assert.ok(w.prisonGuards && w.prisonGuards.length >= 8, `the guards at their posts (${w.prisonGuards && w.prisonGuards.length})`);
  // up to the gate: it stays shut
  const g = M.gates[M.prison.gate];
  teleport(w, p.ped, g.x, g.y - 60);
  for (let i = 0; i < 8; i++) { gates.update(w); w.tick++; }
  assert.ok(!w.gateState[M.prison.gate].open, 'the gate stays shut for a prisoner');
  // served
  const me = players.findInteraction(w, p);
  assert.ok(me, 'a line about it');
  p.prison.until = w.time + 0.2;
  run(w, 0.5);
  assert.ok(!p.prison, 'out');
  assert.ok(!inside(p.ped.x, p.ped.y) && Math.hypot(p.ped.x - M.prison.x, p.ped.y - M.prison.y) > 3000, 'back on the mainland');
  assert.equal(p.ped.weapon, 'pistol', 'the weapon back');
});

test('over the wall: climb the outer wall and you\'re out - three stars', () => {
  const w = new World(M, { npcBudget: 0, throwErrors: true });
  const { p } = joinPlayer(w);
  prison.sentence(w, p, 200, 4);
  // a spot just inside the outer wall, by it
  const c = M.prison.compound;
  let at = null;
  for (let x = c.tx + 3; x < c.tx + c.tw - 3 && !at; x++) for (const y of [c.ty + 2, c.ty + c.th - 3]) {
    if (!PED_BLOCK[M.tiles[M.idx(x, y)]] && M.tiles[M.idx(x, y + (y === c.ty + 2 ? -1 : 1))] === T.WALL) { at = { x: (x + 0.5) * TILE, y: (y + 0.5) * TILE }; break; }
  }
  assert.ok(at, 'room by the wall');
  teleport(w, p.ped, at.x, at.y);
  const act = players.findInteraction(w, p);
  assert.ok(act && /Climb the wall/.test(act.label), act && act.label);
  act.run();
  run(w, PRISON.climbS + 0.5);
  assert.ok(!p.prison, 'out');
  assert.ok(!inside(p.ped.x, p.ped.y), 'over the wall');
  assert.ok(p.wanted >= PRISON.escapeStars, `wanted (${p.wanted} stars)`);
});

test('logged off inside: the time left kept, and back inside next time', () => {
  const w = new World(M, { npcBudget: 0, throwErrors: true });
  const { p } = joinPlayer(w);
  prison.sentence(w, p, 200, 4);
  custody.saveJail(w, p);
  assert.ok(p.profile.jail && p.profile.jail.prison && p.profile.jail.left > 150, 'kept');
  assert.ok(!p.prison);
  custody.onJoin(w, p);
  assert.ok(p.prison && inside(p.ped.x, p.ped.y), 'back inside');
});

test('inside: the action button on the time line does nothing (and harms nobody\'s step); held on the wall while climbing; no unstuck, no arrest; died in there - back inside', () => {
  const w = new World(M, { npcBudget: 0, throwErrors: true });
  const { p } = joinPlayer(w);
  prison.sentence(w, p, 200, 4);
  let seq = 0;
  const press = (bits, mx = 0) => { p.inputQ.push({ seq: ++seq, bits, mx, my: 0, aim: 0 }); w.step(); };
  const line = players.findInteraction(w, p);
  assert.ok(line && /Doing time/.test(line.label), line && line.label);
  press(IN.ACTION); press(0);   // (throwErrors: a throw would fail the test)
  assert.ok(p.prison, 'still inside');
  // climbing: held
  const c = M.prison.compound;
  let at = null;
  for (let x = c.tx + 3; x < c.tx + c.tw - 3 && !at; x++) for (const y of [c.ty + 2, c.ty + c.th - 3]) {
    if (!PED_BLOCK[M.tiles[M.idx(x, y)]] && M.tiles[M.idx(x, y + (y === c.ty + 2 ? -1 : 1))] === T.WALL) { at = { x: (x + 0.5) * TILE, y: (y + 0.5) * TILE }; break; }
  }
  teleport(w, p.ped, at.x, at.y);
  players.findInteraction(w, p).run();
  assert.ok(p.prison.climb, 'up the wall');
  const x0 = p.ped.x, y0 = p.ped.y;
  for (let i = 0; i < 10; i++) press(IN.SPRINT, 1);
  assert.ok(Math.hypot(p.ped.x - x0, p.ped.y - y0) < 2, 'held on the wall');
  p.prison.climb = null;
  // no way out by the menu, no second arrest
  assert.ok(/doing time/i.test(unstuck.canUnstick(w, p) || ''), 'no unstuck');
  custody.start(w, p, null);
  assert.ok(!p.custody && p.prison, 'no arrest inside');
  // died in there: woken up in a hospital, then back inside with the time left
  const left = p.prison.until - w.time;
  const old = p.ped;
  old.dead = true;
  players.spawnPlayerPed(w, p, false, { x: old.x, y: old.y });
  w.step();
  assert.ok(p.prison && p.ped !== old && inside(p.ped.x, p.ped.y), 'back inside');
  assert.ok(Math.abs((p.prison.until - w.time) - left) < 2, 'the time left kept');
  assert.ok(!(p.wanted > 0), 'no escape counted');
});

test('over the wall, the guards come after you; the dev teleport out is no escape', () => {
  const w = new World(M, { npcBudget: 0, throwErrors: true });
  const { p } = joinPlayer(w);
  prison.sentence(w, p, 200, 4);
  w.step();
  // out by the gate's guard (as if over the wall right there)
  const gid = w.prisonGuards.find((id) => { const g = w.get(id); return g && !inside(g.x, g.y); }) || w.prisonGuards[0];
  const g = w.get(gid);
  const S = p.prison;
  p.prison.climb = { until: w.time, x: g.x + 60, y: g.y };
  let chased = false, wanted = 0;
  for (let i = 0; i < 20 && !chased; i++) { w.step(); wanted = Math.max(wanted, p.wanted || 0); chased = w.prisonGuards.some((id) => { const c = w.get(id); return c && c.npc && c.npc.pursue === p.ped.id; }); }
  assert.ok(!p.prison && wanted >= PRISON.escapeStars, 'out, wanted');
  assert.ok(chased, 'a guard after you');
  // a dev teleporting out
  const { p: q } = joinPlayer(w);
  prison.sentence(w, q, 200, 4);
  prison.drop(w, q);
  teleport(w, q.ped, q.ped.x + 6000, q.ped.y);
  w.step();
  assert.ok(!q.prison && !(q.wanted > 0), 'no breakout');
  assert.ok(S);
});

test('an admin sends a misbehaving player to prison: no bail, no wall to climb, back inside if they get out; 0 lets them out; offline it waits for them', async () => {
  const { store } = await import('../server/store.js');
  const { createAccounts } = await import('../server/accounts.js');
  const { createModeration } = await import('../server/moderation.js');
  const { createAdminLog } = await import('../server/adminlog.js');
  const { createAdmin } = await import('../server/admin.js');
  const { POWERS } = await import('../server/roles.js');
  assert.equal(POWERS.prison, 'admin');
  const A = createAccounts({ store, secret: 'test-secret' }), log = createAdminLog(null);
  const admin = createAdmin({ accounts: A, log, mod: createModeration({ store }), store });
  const w = new World(M, { npcBudget: 0, throwErrors: true });
  const { p: boss } = joinPlayer(w), { p } = joinPlayer(w);
  for (const q of [boss, p]) A.ensure(q.profile).kind = 'member';
  A.setRole(boss.pid, 'admin');
  assert.equal(admin.handle(w, p, { a: 'prison', id: boss.pid, mins: 5 }).ok, false, 'not for a player');
  // cuffed and on the way in: out of custody and straight there
  p.wanted = 1; p.heat = 12;
  custody.surrender(w, p);
  assert.ok(custody.inCell(p));
  const r = admin.handle(w, boss, { a: 'prison', id: p.pid, mins: 10, why: 'griefing' });
  assert.ok(r.ok, r.err);
  assert.ok(p.prison && p.prison.admin && !p.custody && !(p.wanted > 0) && inside(p.ped.x, p.ped.y), 'on Prison Island, out of the cell');
  assert.ok(Math.abs(p.prison.until - w.time - 600) < 1, 'for ten minutes');
  assert.ok(log.tail(5).some((e) => e.what === 'prison' && e.note === 'griefing'), 'in the admin log');
  // no way over the wall; out of the compound some other way, back inside
  const c = M.prison.compound;
  teleport(w, p.ped, (c.tx + 2.5) * TILE, (c.ty + c.th / 2) * TILE);
  assert.doesNotMatch(players.findInteraction(w, p).label, /Climb/, 'no climbing the wall');
  teleport(w, p.ped, (c.tx - 6) * TILE, (c.ty + c.th / 2) * TILE);
  w.step();
  assert.ok(p.prison && inside(p.ped.x, p.ped.y) && !(p.wanted > 0), 'put back inside - no breakout');
  // 0: let out
  assert.ok(admin.handle(w, boss, { a: 'prison', id: p.pid, mins: 0 }).ok);
  assert.ok(!p.prison, 'let out');
  // offline: the sentence waits on the character
  const off = store.create('ab12cd34ef56ab12cd34ef56');
  off.name = 'Away';
  assert.ok(admin.handle(w, boss, { a: 'prison', id: 'ab12cd34ef56ab12cd34ef56', mins: 3 }).ok);
  assert.ok(off.jail && off.jail.prison && off.jail.admin && off.jail.left === 180, 'kept for when they next play');
});

// the islands (the owner, 11-07: "on the islands they will just drive into the ocean, so we might need to have a little
// police station on the islands with cities in it ... if it's an island with no station you just end up in a nearby
// jailcell") - custody.js reachableStation, shared/world3-medics.js precincts3
test('island towns have a police station on their roads; a car taking you in never drives into the sea; no station, the fade', () => {
  const P = M.world3.precincts;
  assert.ok(P && P.made.some(([n]) => n === 'Gull Harbor Police'), `the island stations (${JSON.stringify(P)})`);
  assert.deepEqual(P.none, ['Coral Cay Police'], 'Coral Cay has no building to spare (every shop a real one): its arrests fade');
  const w = new World(M, { npcBudget: 0, throwErrors: true });
  for (const [name, , , , id] of P.made) {
    const st = M.pois[id];
    assert.ok(st && st.kind === 'police' && st.label === name && st.sub, `${name}: a precinct`);
    assert.equal(custody.reachableStation(w, st.x, st.y), st, `${name}: the nearest station its own roads reach`);
  }
  // arrested on an island town's street: driven to its own station, never in the water
  const st = M.pois[P.made[0][4]], k = custody.kerbOf(w, st.id);
  const { p } = joinPlayer(w);
  const n = M.nearestNode(k.x + 500, k.y + 300);
  teleport(w, p.ped, n.x + 20, n.y + 20);
  p.wanted = 1; p.heat = 12; p.seenAt = w.time;
  const cop = spawnCop(w, p);
  p.ped.downUntil = w.time + 3;
  law.arrest(w, cop, p.ped);
  let wet = 0, stages = new Set();
  for (let i = 0; i < 200 * 20 && !(p.custody && p.custody.stage === 'cell'); i++) {
    w.step();
    if (!p.custody) break;
    stages.add(p.custody.stage);
    const v = p.ped.vehId ? w.get(p.ped.vehId) : null, at = v || p.ped, t = M.tileAtPx(at.x, at.y);
    if (t === T.WATER || t === T.DEEP) wet++;
  }
  assert.ok(p.custody && p.custody.stage === 'cell', `in a cell (${[...stages]})`);
  assert.equal(wet, 0, 'never in the water');
  assert.ok(stages.has('ride'), 'driven there');
  assert.equal(p.custody.station, st.id, `at ${st.label}`);
  // arrested on Coral Cay's roads (no station on them): no car comes, the fade, and the nearest cells
  const tile = (q) => M.dist[M.idx(Math.floor(q.x / TILE), Math.floor(q.y / TILE))];
  const cn = M.nodes.find((q) => q.lvl === 0 && tile(q) === 44 && !custody.reachableStation(w, q.x, q.y));
  assert.ok(cn, 'a junction on Coral Cay');
  const { p: q } = joinPlayer(w);
  teleport(w, q.ped, cn.x + 20, cn.y + 20);
  q.wanted = 1; q.heat = 12; q.seenAt = w.time;
  const cars = new Set(w.police || []);
  law.arrest(w, spawnCop(w, q), q.ped);
  let faded = false, sent = false, wet2 = 0;
  for (let i = 0; i < 20 * 20 && !(q.custody && q.custody.stage === 'cell'); i++) {
    w.step();
    if (!q.custody) break;
    if (q.custody.stage === 'fade') faded = true;
    for (const id of w.police || []) if (!cars.has(id)) { const v = w.get(id); if (v && v.ai && v.ai.prisoner === q.pid) sent = true; }
    const t = M.tileAtPx(q.ped.x, q.ped.y);
    if (t === T.WATER || t === T.DEEP) wet2++;
  }
  assert.ok(q.custody && q.custody.stage === 'cell' && faded && !sent && !wet2, `the fade (${faded}), no car (${sent}), dry (${wet2}), a cell (${q.custody && q.custody.stage})`);
  assert.equal(M.pois[q.custody.station].kind, 'police');
});
