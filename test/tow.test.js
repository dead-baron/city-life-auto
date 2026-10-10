// The tow service (server/systems/tow.js): a wreck is towed away after a while; a car a player drove is never towed
// unless it's left in the street, untouched by any player for 5 minutes and blocking a lane; the truck hooks it and
// leaves; the vehicle is gone (a player's own car back in their garage, for the fee).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer, run, teleport, straightRoad } from './helpers.js';
import { T, VF } from '../shared/constants.js';
import { TOW_WRECK_S, TOW_IDLE_S, TOW_FEE } from '../shared/rules.js';
import * as vehicles from '../server/systems/vehicles.js';
import * as tow from '../server/systems/tow.js';
import { _fields } from '../server/net.js';

function road(w) {
  const r = straightRoad(w.map, 1400);
  assert.ok(r, 'a long straight street');
  return r;
}
// sit a player in a vehicle's driver's seat
function drive(w, p, v) { const ped = p.ped; ped.vehId = v.id; ped.seat = 0; v.seats[0] = ped.id; p.lastVehicle = v.id; }
// no traffic, buses or ferries (a car going by can ram a parked one and shove it along, off the road: that's another story)
function quiet(w) { w.npcBudget = -1; w.opts.transit = false; w.opts.ferries = false; return w; }

// the gap (px) between the truck's back bumper and the car's body, and how square they meet (|sin| of the angle between them)
function tail(t, v) {
  const c = Math.cos(t.a), s = Math.sin(t.a), rx = t.x - c * t.def.L / 2, ry = t.y - s * t.def.L / 2;
  const vc = Math.cos(v.a), vs = Math.sin(v.a);
  let gap = Infinity;
  for (const o of [-t.def.W / 2 + 3, 0, t.def.W / 2 - 3]) {
    const px = rx - s * o - v.x, py = ry + c * o - v.y, lx = px * vc + py * vs, ly = -px * vs + py * vc;
    gap = Math.min(gap, Math.hypot(Math.max(0, Math.abs(lx) - v.def.L / 2), Math.max(0, Math.abs(ly) - v.def.W / 2)));
  }
  return { gap, skew: Math.abs(Math.sin(t.a - v.a)), behind: (v.x - t.x) * c + (v.y - t.y) * s < 0 };
}
// a wreck in the lane on a long straight street, a player watching from the pavement; till the truck's gone: the steps it
// went through, where its tail was when the hook-up started, whether it was seen reversing, the hooked car on the wire
function towWreck(w, r, { a = 0, dy = 10, mid = 500, before = null } = {}) {
  quiet(w);
  const p = joinPlayer(w);
  const x = r.x + mid, y = r.y + dy;
  teleport(w, p.p.ped, x + 260, r.y + r.hw + 40);
  const v = w.spawnVehicle('sedan', x, y, a, {});
  v.hp = 0; v.dead = true; v.wreckAt = w.time;
  if (before) before(v);
  run(w, TOW_WRECK_S - 3);
  assert.ok(!(w.tows && w.tows.size), 'not straight away');
  const out = { v, truck: null, steps: [], hookedAt: -1, gap: 0, seenStart: null, atHook: null, reversed: false, wire: [] };
  for (let t = 0; t < 120 * 20; t++) {
    w.step();
    if (!out.truck && w.tows && w.tows.size) { out.truck = w.get([...w.tows][0]); out.seenStart = Math.hypot(out.truck.x - p.p.ped.x, out.truck.y - p.p.ped.y); }
    const truck = out.truck;
    if (!truck) continue;
    if (!w.get(truck.id)) break;
    const m = truck.ai && truck.ai.mode;
    if (m && out.steps[out.steps.length - 1] !== m) { out.steps.push(m); if (m === 'hook' && w.get(v.id)) out.atHook = tail(truck, v); }
    if (m === 'back' && (vehicles.vehFlags(w, truck) & VF.REVERSE)) out.reversed = true;
    if (v.towedBy === truck.id && out.hookedAt < 0) out.hookedAt = w.time;
    if (w.get(v.id) && v.towedBy) out.wire.push(_fields(w, v)[3]);
    if (out.hookedAt > 0 && !out.gap && w.time - out.hookedAt > 1.5 && w.get(v.id)) { out.gap = Math.hypot(v.x - truck.x, v.y - truck.y); out.rides = Math.cos(v.a - truck.a); }   // (winched onto the hook by then)
    if (m === 'leave' && out.hookedAt > 0 && w.time - out.hookedAt > 6) teleport(w, p.p.ped, x + 9000, y);   // (walk off: it goes once out of sight)
  }
  return out;
}

test('a burnt-out wreck: after a while a tow truck comes from out of sight, pulls in ahead of it, backs up till its tail touches its nose, hooks it, tows it away, and both are gone', () => {
  const w = makeWorld();
  const r = road(w);
  const o = towWreck(w, r);
  const { truck, v } = o;
  assert.ok(truck, 'a tow truck was sent');
  assert.ok(o.seenStart > 500, `from out of sight (${o.seenStart | 0} px away)`);
  assert.deepEqual(o.steps.slice(0, 4), ['drive', 'back', 'hook', 'leave'], `drove up, backed up to it, hooked it, left (${o.steps})`);
  assert.ok(o.reversed, 'reversing (the reversing lights on)');
  assert.ok(o.atHook && o.atHook.gap <= 4, `its tail touching the car when the hook-up started (${o.atHook && o.atHook.gap.toFixed(1)} px)`);
  assert.ok(o.atHook.behind && o.atHook.skew < 0.2, `the car behind it, lined up (${o.atHook.skew.toFixed(2)})`);
  assert.ok(o.hookedAt > 0, 'the wreck hung on the hook');
  assert.ok(Math.abs(o.gap - (truck.def.L / 2 + v.def.L / 2 + 4)) < 2, `right behind the truck (${o.gap | 0} px)`);
  assert.ok(o.rides > 0.98, 'nose to the truck, the same way round');
  assert.ok(o.wire.length && o.wire.every((x) => (x & 3) === 1) && o.wire.some((x) => x & 4) && (o.wire[o.wire.length - 1] & 4) === 0, `its nose up on the lift on the wire, winched up first (${[...new Set(o.wire)]})`);
  assert.ok(!w.get(v.id) && !w.get(truck.id), 'out of sight, both gone');
});

test('a wreck facing the wrong way: the truck backs onto its tail, and it rides away backwards, tail up', () => {
  const w = makeWorld();
  const r = road(w);
  const o = towWreck(w, r, { a: Math.PI });
  assert.deepEqual(o.steps.slice(0, 4), ['drive', 'back', 'hook', 'leave'], `${o.steps}`);
  assert.ok(o.atHook.gap <= 4 && o.atHook.behind && o.atHook.skew < 0.2, `touching its tail, lined up (${o.atHook.gap.toFixed(1)} px, ${o.atHook.skew.toFixed(2)})`);
  assert.equal(o.v.towEnd, -1, 'by its tail');
  assert.ok(o.rides < -0.98, 'the other way round behind the truck');
  assert.ok(o.wire.length && o.wire.every((x) => (x & 3) === 2), 'its tail up on the lift, on the wire');
});

test('no room to back up (a van stopped just ahead of it): the old way - pulled up and winched round onto the hook', () => {
  const w = makeWorld();
  const r = road(w);
  let plan;
  const o = towWreck(w, r, { before: (v) => { w.spawnVehicle('van', v.x + v.def.L / 2 + 90, v.y, 0, { parked: true }); plan = tow.backPlan(w, v); } });
  assert.equal(plan, null, 'no room ahead of it to back up from');
  assert.ok(!o.steps.includes('back'), `no backing up (${o.steps})`);
  assert.deepEqual(o.steps.slice(0, 3), ['drive', 'hook', 'leave'], `${o.steps}`);
  assert.ok(o.hookedAt > 0, 'still towed');
});

test('a car a player drove is towed only when left in a lane, untouched for 5 minutes - never parked off the street, never with someone in it or coming back to it', () => {
  const w = quiet(makeWorld());
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
