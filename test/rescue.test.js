// Rescue anywhere (tasks #409, #420): down in the water, the search-and-rescue boat comes out from the nearest dock,
// pulls you aboard and sets you ashore at the dock (server/systems/rescue.js); far out in the wilds the ambulance leaves
// the road and drives on over the open ground, and its crew walk the rest (ems.js, offroad.js); who's aboard an open
// boat is shown at its seats (shared/vehicles.js crew, the back-seat bit on the wire: net.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer, teleport } from './helpers.js';
import { K } from '../shared/constants.js';
import { Z } from '../shared/citylayout.js';
import { BOAT_BLOCK } from '../shared/map.js';
import { VEHICLES } from '../shared/vehicles.js';
import * as combat from '../server/systems/combat.js';
import * as revive from '../server/systems/revive.js';
import * as rescue from '../server/systems/rescue.js';
import { kerbFor } from '../server/systems/kerbdrive.js';
import { spawnNpc } from '../server/systems/npc.js';
import { _fields } from '../server/net.js';

test('down in the water: the rescue boat comes out from a dock, pulls you aboard and sets you ashore there', () => {
  const w = makeWorld({ npcBudget: 0 });
  const a = joinPlayer(w, { cash: 0, bank: 1000 });
  const m = w.map, dock = m.marina.find((b) => !b.gang) || m.rentals[0].spots[0];
  const at = rescue.waterSpot(w, dock.x, dock.y);
  assert.ok(at, 'open water off a dock');
  teleport(w, a.p.ped, at.x, at.y);
  assert.ok(rescue.inWater(m, a.p.ped), 'in the water');
  combat.kill(w, a.p.ped, null, 'crash', 0);
  revive.callAmbulance(w, a.p);
  assert.ok(a.p.amb && a.p.amb.boat, 'a rescue boat is on its way (not an ambulance)');
  const boat = w.get(a.p.amb.vehId);
  assert.equal(boat.def.id, 'rescueboat');
  assert.ok(boat.sirenOn, 'siren on the way out');
  let up = false, aboard = false, ashore = false, onLand = 0, modes = new Set(), t = 0;
  for (; t < 150 * 20 && !ashore; t++) {
    w.step();
    const v = w.get(boat.id);
    if (v && v.ai) modes.add(v.ai.mode);
    if (v && BOAT_BLOCK[m.tileAtPx(v.x, v.y)]) onLand++;
    if (!a.p.ped.dead) up = true;
    if (a.p.ped.vehId === boat.id) aboard = true;
    if (aboard && !a.p.ped.vehId) ashore = true;
  }
  assert.ok(up, `pulled out and back on your feet (${[...modes]})`);
  assert.ok(aboard, 'aboard the rescue boat');
  assert.ok(ashore, `set ashore within 150 s (${[...modes]}, ${(t / 20).toFixed(0)} s)`);
  assert.ok(!rescue.inWater(m, a.p.ped), 'on dry land, not dropped in the water');
  assert.equal(onLand, 0, 'the boat never ran up onto the land');
  assert.equal(a.p.profile.bank, 1000 - 200, 'the ambulance\'s fee');
  assert.ok(modes.has('pull') && modes.has('ashore'), `out, pull, ashore (${[...modes]})`);
  assert.equal(a.p.amb, null, 'the call is done');
});

test('a player who takes the rescue boat: its crew go over the side, and whoever called it can call another', () => {
  const w = makeWorld({ npcBudget: 0 });
  const a = joinPlayer(w, { cash: 0, bank: 1000 });
  const m = w.map, dock = m.marina.find((b) => !b.gang) || m.rentals[0].spots[0];
  const at = rescue.waterSpot(w, dock.x, dock.y);
  teleport(w, a.p.ped, at.x, at.y);
  combat.kill(w, a.p.ped, null, 'crash', 0);
  revive.callAmbulance(w, a.p);
  const boat = w.get(a.p.amb.vehId);
  for (let t = 0; t < 40; t++) w.step();
  // a hijacker at the wheel
  const b = joinPlayer(w, { cash: 0, bank: 0 });
  const drv = w.get(boat.seats[0]);
  drv.vehId = 0; boat.seats[0] = b.p.ped.id; b.p.ped.vehId = boat.id; b.p.ped.seat = 0;
  for (let t = 0; t < 10; t++) w.step();
  assert.equal(boat.ai, null, 'no longer a rescue');
  assert.ok(!boat.seats.some((s, i) => i > 0 && s && w.get(s)?.npc), 'the crew went over the side');
  assert.equal(a.p.amb, null, 'the caller can call another');
  assert.equal(a.p.ambUsed, false);
});

test('far out in the wilds the ambulance drives on over the open ground and its crew walk the rest', () => {
  const m = makeWorld().map;
  const WILDS = new Set([Z.WILD, Z.WEST, Z.NORTH]);
  let wild = null;
  for (let ty = 0; ty < m.h && !wild; ty += 5) for (let tx = 0; tx < m.w && !wild; tx += 5) {
    const x = tx * 32 + 16, y = ty * 32 + 16;
    if (!WILDS.has(m.zoneAt(x, y)) || !m.isWalkable(x, y) || m.isWater(x, y)) continue;
    const k = kerbFor({ map: m }, x, y), d = Math.hypot(k.x - x, k.y - y);
    if (d > 750 && d < 1100) wild = [x, y, d];
  }
  assert.ok(wild, 'somewhere well off the road');
  const w = makeWorld({ npcBudget: 0 });
  const a = joinPlayer(w, { cash: 0, bank: 1000 });
  teleport(w, a.p.ped, wild[0], wild[1]);
  combat.kill(w, a.p.ped, null, 'melee', 0);
  revive.callAmbulance(w, a.p);
  assert.ok(a.p.amb && !a.p.amb.boat, 'an ambulance is on its way');
  const vid = a.p.amb.vehId;
  assert.equal(w.get(vid).def.id, 'rescue4x4', 'the off-road ambulance: the 4x4');
  let up = false, off = false, nearest = Infinity, hospital = false;
  for (let t = 0; t < 150 * 20 && !up; t++) {
    w.step();
    const v = w.get(vid);
    if (!v) break;
    if (v.ai && v.ai.off) off = true;
    nearest = Math.min(nearest, Math.hypot(v.x - wild[0], v.y - wild[1]));
    if (a.p.ped.dead && a.p.respawnAt < w.time) hospital = true;
    up = !a.p.ped.dead;
  }
  assert.ok(off, 'it left the road toward them');
  assert.ok(nearest < wild[2] - 200, `it got nearer than the road (${nearest.toFixed(0)} px of ${wild[2].toFixed(0)})`);
  assert.ok(up, 'revived by the crew who walked in');
  assert.ok(!hospital, 'no waking up at a hospital while help was coming');
});

test('riders in open boats: the boats with seats to show, inside their hulls; the back seats marked on the wire', () => {
  for (const id of ['speedboat', 'dinghy', 'jetski', 'rescueboat']) {
    const d = VEHICLES[id];
    assert.ok(d.crew && d.crew.length >= d.seats, `${id}: a place for everyone aboard`);
    for (const [x, y] of d.crew) assert.ok(Math.abs(x) < d.L / 2 && Math.abs(y) < d.W / 2, `${id}: ${x},${y} inside the hull`);
  }
  assert.ok(!VEHICLES.policeboat.crew, 'the police boat\'s wheelhouse hides who\'s in it');
  const w = makeWorld({ npcBudget: 0 });
  const dock = w.map.marina.find((b) => !b.gang);
  const at = rescue.waterSpot(w, dock.x, dock.y);
  const v = w.spawnVehicle('speedboat', at.x, at.y, 0, {});
  const ps = [0, 1, 2].map((s) => { const c = spawnNpc(w, 'casual', v.x, v.y, 'civ'); c.vehId = v.id; c.seat = s; v.seats[s] = c.id; return c; });
  const bits = ps.map((c) => (_fields(w, c)[3] & 128) !== 0);
  assert.deepEqual(bits, [false, false, true], 'only the back seat has the bit (not "in the water")');
  assert.equal(_fields(w, ps[2])[2], v.id, 'the parent is the boat');
  void K;
});
