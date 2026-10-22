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
import * as gates from '../server/systems/gates.js';

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
