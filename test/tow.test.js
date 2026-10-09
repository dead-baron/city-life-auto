// The tow service (server/systems/tow.js): a wreck is towed away after a while; a car a player drove is never towed
// unless it's left in the street, untouched by any player for 5 minutes and blocking a lane; the truck hooks it and
// leaves; the vehicle is gone (a player's own car back in their garage, for the fee).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer, run, teleport, straightRoad } from './helpers.js';
import { T } from '../shared/constants.js';
import { TOW_WRECK_S, TOW_IDLE_S, TOW_FEE } from '../shared/rules.js';
import * as vehicles from '../server/systems/vehicles.js';
import * as tow from '../server/systems/tow.js';

function road(w) {
  const r = straightRoad(w.map, 1400);
  assert.ok(r, 'a long straight street');
  return r;
}
// sit a player in a vehicle's driver's seat
function drive(w, p, v) { const ped = p.ped; ped.vehId = v.id; ped.seat = 0; v.seats[0] = ped.id; p.lastVehicle = v.id; }

test('a burnt-out wreck: after a while a tow truck comes from out of sight, hooks it, tows it away, and both are gone', () => {
  const w = makeWorld();
  const r = road(w);
  const a = joinPlayer(w);
  const x = r.x + 500, y = r.y + 10;
  teleport(w, a.p.ped, x + 260, r.y + r.hw + 40);
  const v = w.spawnVehicle('sedan', x, y, 0, {});
  v.hp = 0; v.dead = true; v.wreckAt = w.time;
  run(w, TOW_WRECK_S - 3);
  assert.ok(!(w.tows && w.tows.size), 'not straight away');
  let truck = null, steps = [], hookedAt = -1, gap = 0, seenStart = null;
  for (let t = 0; t < 120 * 20; t++) {
    w.step();
    if (!truck && w.tows && w.tows.size) {
      truck = w.get([...w.tows][0]);
      seenStart = Math.hypot(truck.x - a.p.ped.x, truck.y - a.p.ped.y);
    }
    if (!truck) continue;
    if (!w.get(truck.id)) break;
    const m = truck.ai && truck.ai.mode;
    if (m && steps[steps.length - 1] !== m) steps.push(m);
    if (v.towedBy === truck.id && hookedAt < 0) { hookedAt = w.time; gap = Math.hypot(v.x - truck.x, v.y - truck.y); }
    if (m === 'leave' && hookedAt > 0 && w.time - hookedAt > 6) teleport(w, a.p.ped, x + 9000, y);   // (walk off: it goes once out of sight)
  }
  assert.ok(truck, 'a tow truck was sent');
  assert.ok(seenStart > 500, `from out of sight (${seenStart | 0} px away)`);
  assert.deepEqual(steps.slice(0, 3), ['drive', 'hook', 'leave'], `drove up, hooked it, left (${steps})`);
  assert.ok(hookedAt > 0, 'the wreck hung on the hook');
  assert.ok(Math.abs(gap - (truck.def.L / 2 + v.def.L / 2 + 4)) < 2, `right behind the truck (${gap | 0} px)`);
  assert.ok(!w.get(v.id) && !w.get(truck.id), 'out of sight, both gone');
});

test('a car a player drove is towed only when left in a lane, untouched for 5 minutes - never parked off the street, never with someone in it or coming back to it', () => {
  const w = makeWorld();
  const r = road(w);
  const owner = joinPlayer(w, { bank: 1000 }), sitter = joinPlayer(w), walker = joinPlayer(w);
  const y = r.y + 10, x0 = r.x + 200;
  const left = w.spawnVehicle('sedan', x0, y, 0, {});                         // left in the lane: towed after 5 minutes
  const kerbside = w.spawnVehicle('compact', x0 + 300, r.y + r.hw + 30, 0, {}); // left up on the pavement: never
  const occupied = w.spawnVehicle('pickup', x0 + 600, y, 0, {});              // someone sitting in it: never
  const visited = w.spawnVehicle('van', x0 + 900, y, 0, {});                  // its driver comes back to it now and then: never
  assert.notEqual(w.map.tileAtPx(kerbside.x, kerbside.y), T.ROAD, 'the pavement car is off the road');
  // the owner's own car (out of their garage): it goes back there for the fee
  left.owner = owner.p.pid; owner.prof.vehicles = [{ model: 'sedan', paint: left.paint, variant: left.variant }];
  for (const v of [left, kerbside, visited]) { drive(w, owner.p, v); w.step(); w.step(); w.step(); vehicles.ejectPed(w, owner.p.ped, true); }
  drive(w, sitter.p, occupied);
  owner.p.lastVehicle = left.id;
  teleport(w, owner.p.ped, x0 + 450, r.y - r.hw - 260);
  teleport(w, walker.p.ped, x0 + 900, r.y - r.hw - 300);
  for (let t = 0; t < 10; t++) w.step();
  assert.ok(left.byPlayer && kerbside.byPlayer && visited.byPlayer && occupied.byPlayer, 'all driven by players');
  assert.ok(tow.blocking(w, left) && !tow.blocking(w, kerbside), 'in a lane / off the street');
  const notes = [];
  const orig = w.notify.bind(w);
  w.notify = (p, text, tone) => { if (p === owner.p) notes.push(text); return orig(p, text, tone); };
  // 4.5 minutes: nothing towed; the walker drops by the van every 4 minutes
  for (let s = 0; s < (TOW_IDLE_S - 30); s++) {
    if (s === 200) { teleport(w, walker.p.ped, visited.x + 30, visited.y - 40); run(w, 1); teleport(w, walker.p.ped, x0 + 900, r.y - r.hw - 300); }
    run(w, 1);
  }
  for (const v of [left, kerbside, occupied, visited]) assert.ok(w.get(v.id) && !v.towCall && !v.towedBy, `${v.def.name} not towed before 5 minutes`);
  // past 5 minutes: only the one left in the lane
  let hooked = false;
  for (let s = 0; s < 150 && !hooked; s++) { run(w, 1); hooked = !!left.towedBy; }
  assert.ok(hooked, 'the car left in the lane was hooked after 5 minutes untouched');
  for (const v of [kerbside, occupied, visited]) assert.ok(w.get(v.id) && !v.towCall && !v.towedBy, `${v.def.name} still not towed`);
  // towed off out of sight: back in the owner's garage, the fee from the bank, a message
  teleport(w, owner.p.ped, x0 + 9000, y); teleport(w, sitter.p.ped, x0 + 9000, y); occupied.seats[0] = 0; sitter.p.ped.vehId = 0;
  teleport(w, walker.p.ped, x0 + 9100, y);
  for (let s = 0; s < 60 && w.get(left.id); s++) run(w, 1);
  assert.ok(!w.get(left.id), 'gone');
  assert.equal(owner.p.profile.bank, 1000 - TOW_FEE, 'the tow fee');
  assert.equal(owner.prof.vehicles.length, 1, 'still on their garage list');
  assert.ok(notes.some((t) => /towed/.test(t) && /garage/.test(t)), 'the owner was told where it went');
});

test('a stolen tow truck: the hook lets go and it is anyone\'s truck', () => {
  const w = makeWorld();
  const r = road(w);
  const a = joinPlayer(w);
  const x = r.x + 500, y = r.y + 10;
  teleport(w, a.p.ped, x + 260, r.y + r.hw + 40);
  const v = w.spawnVehicle('sedan', x, y, 0, {});
  v.hp = 0; v.dead = true; v.wreckAt = w.time - TOW_WRECK_S - 1;
  const t = tow.send(w, v, 'wreck');
  assert.ok(t && t.model === 'towtruck', 'a tow truck');
  run(w, 2);
  // the player takes the driver's seat
  const drv = w.get(t.seats[0]);
  vehicles.ejectPed(w, drv, true);
  drive(w, a.p, t);
  run(w, 1);
  assert.ok(!t.ai && t.despawnable, 'no longer the tow service\'s');
  assert.ok(!w.tows.has(t.id) && !v.towedBy, 'the hook let go');
});
