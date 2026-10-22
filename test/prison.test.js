// Prison Island (the owner, 10-05: "sentenced after many arrests, about 5 min max, breakouts" - server/systems/prison.js):
// booked at four stars or more, or for the third time in a while, it's a sentence at Kestrel Bay Penitentiary - no bail,
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

const { map: M } = await buildWorld3(1337, { log: () => {} });
const inside = (x, y) => { const c = M.prison.compound; return x > c.tx * TILE && x < (c.tx + c.tw) * TILE && y > c.ty * TILE && y < (c.ty + c.th) * TILE; };

test('who goes to Prison Island: four stars, or the third booking in a while; capped at five minutes', () => {
  const w = new World(M, { npcBudget: 0, throwErrors: true });
  const { p } = joinPlayer(w);
  p.profile.arrests = [];
  assert.equal(prison.sentenceFor(w, p, 2), 0, 'a first booking at two stars: the cells');
  assert.ok(prison.sentenceFor(w, p, 4) > 0, 'four stars: prison');
  prison.noteArrest(p); prison.noteArrest(p);
  assert.ok(prison.sentenceFor(w, p, 1) > 0, 'the third time: prison');
  for (let i = 0; i < 6; i++) prison.noteArrest(p);
  assert.ok(prison.sentenceFor(w, p, 5) <= PRISON.max && PRISON.max <= 300, 'five minutes at most');
});

test('booked at four stars: inside the walls, weapons away, nobody hurt, the gate shut to you; served, back on the mainland', () => {
  const w = new World(M, { npcBudget: 0, throwErrors: true });
  const { p } = joinPlayer(w, { weapons: { fists: 0, pistol: 24 } });
  p.profile.arrests = [];
  p.ped.weapon = 'pistol';
  p.wanted = 4;
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
