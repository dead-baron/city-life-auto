// Nobody walled in (server/systems/doorways.js; the owner's notes 2, 10-24: "make sure players can't just park a car
// outside the entrance of a building (like a hospital) and block people from getting out"): on foot by a way in or out,
// you walk through a vehicle parked across it - out of your home's door, out of a hospital's - players and the city's
// people alike; away from the doors a parked car is as solid as ever.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer, teleport } from './helpers.js';
import { K, TILE } from '../shared/constants.js';
import { IN } from '../shared/input.js';
import { DOORWAY } from '../shared/rules-play.js';
import * as doorways from '../server/systems/doorways.js';
import * as homes from '../server/systems/homes.js';
import * as economy from '../server/systems/economy.js';
import { spawnNpc } from '../server/systems/npc.js';

const poiOf = (w, h) => w.map.pois.find((q) => q.kind === 'home' && q.home === h.id);
// walk p (by input, like a client) toward angle a for s seconds
function walk(w, p, a, s) { for (let i = 0; i < s * 20; i++) { p.inputQ.push({ seq: p.ack + 1, bits: 0, mx: Math.cos(a), my: Math.sin(a), aim: a }); w.step(); } }
// out from a building: the way from its middle to (x, y)
function outward(w, poi) {
  const b = w.map.buildings[poi.b];
  return b ? Math.atan2(poi.y - (b.ty + b.th / 2) * TILE, poi.x - (b.tx + b.tw / 2) * TILE) : Math.PI / 2;
}
// a car parked broadside across (x, y), the way out a: its long side across it
function parkAcross(w, x, y, a) {
  for (const e of w.query(x, y, 160, K.VEH)) w.remove(e);
  const v = w.spawnVehicle('van', x + Math.cos(a) * 26, y + Math.sin(a) * 26, a + Math.PI / 2, { npcOwned: false });
  v.vx = 0; v.vy = 0; v.parked = true; v.despawnable = false;
  return v;
}

test('the doorway points: homes, walk-ins, the places, garages', () => {
  const w = makeWorld();
  const m = w.map, pts = doorways.doorPoints(m);
  assert.ok(pts.length / 2 > m.homes.length + m.walkIns.length, `plenty of them (${pts.length / 2})`);
  const h = m.homes[0];
  assert.ok(doorways.nearDoor(m, h.x, h.y) && doorways.nearDoor(m, h.x + DOORWAY.r - 4, h.y), 'a home\'s front door');
  const hosp = m.pois.find((q) => q.kind === 'hospital');
  assert.ok(doorways.nearDoor(m, hosp.x, hosp.y), 'a hospital\'s');
  const b = m.buildings[m.walkIns[0]], u = b.walkIn.units[0];
  assert.ok(doorways.nearDoor(m, (u.door.tx + 1) * TILE, (u.door.ty + 0.5) * TILE), 'a walk-in\'s doorway');
});

test('walking out of your door with a car parked across it: straight through it; away from a door a car still stops you', () => {
  const w = makeWorld();
  const { p } = joinPlayer(w, { bank: 1e6 });
  const h = w.map.homes.find((q) => q.kind === 'house' && !w.homeOwner.has(q.id));
  teleport(w, p.ped, h.x, h.y);
  economy.handleMenu(w, p, poiOf(w, h).id, 'hbuy');
  assert.equal(w.homeOwner.get(h.id), p.pid, 'my home');
  homes.goInside(w, p, h);
  assert.ok(p.ped.hidden, 'inside');
  const a = outward(w, poiOf(w, h));
  const v = parkAcross(w, h.x, h.y + 10, a);
  homes.leaveHome(w, p);
  p.ped.protectUntil = 0;
  walk(w, p, a, 1.6);
  const along = (p.ped.x - v.x) * Math.cos(a) + (p.ped.y - v.y) * Math.sin(a);
  assert.ok(along > v.def.W / 2, `through the van and out the far side (${along.toFixed(0)} px past its middle)`);
  // the same van out in the street, nowhere near a door: solid
  let far = null;
  for (let k = 0; k < 400 && !far; k++) { const q = w.map.parking[(k * 37) % w.map.parking.length]; if (q && !doorways.nearDoor(w.map, q.x, q.y, 300)) far = q; }
  assert.ok(far, 'a parking spot away from any door');
  for (const e of w.query(far.x, far.y, 160, K.VEH)) w.remove(e);
  v.x = far.x; v.y = far.y; v.a = 0; w.place(v);
  teleport(w, p.ped, far.x, far.y - v.def.W / 2 - 14);
  walk(w, p, Math.PI / 2, 1.2);
  assert.ok(p.ped.y < far.y - v.def.W / 2 + 4, `stopped by it (${(p.ped.y - far.y).toFixed(0)})`);
});

test('a hospital\'s door blocked by a van: a patient and one of the city\'s people both get out', () => {
  const w = makeWorld();
  const { p } = joinPlayer(w);
  const hosp = w.map.pois.find((q) => q.kind === 'hospital');
  const wi = w.map.buildings[hosp.b].walkIn, u = wi.units.find((q) => q.poi === hosp.id) || wi.units[0];
  const a = wi.south ? Math.PI / 2 : -Math.PI / 2, dir = Math.sin(a);
  const dx = (u.door.tx + (u.door.w || 2) / 2) * TILE, edge = (u.door.ty + (wi.south ? 1 : 0)) * TILE;
  for (const e of w.query(dx, edge, 200, K.VEH)) w.remove(e);
  const v = w.spawnVehicle('van', dx, edge + dir * 30, 0, { npcOwned: false });   // (broadside across the doorway, against the wall)
  v.parked = true; v.despawnable = false;
  teleport(w, p.ped, dx, edge - dir * 20);   // (inside, at the door)
  p.ped.protectUntil = 0;
  walk(w, p, a, 1.8);
  const past = (q) => (q.y - v.y) * dir;
  assert.ok(past(p.ped) > v.def.W / 2, `out past the van (${past(p.ped).toFixed(0)})`);
  // one of the city's people walking out the same way
  const q = spawnNpc(w, 'casual', dx, edge - dir * 20);
  q.npc.desk = null;
  let ok = false;
  for (let i = 0; i < 40 && !ok; i++) { q.y += dir * 5; q.vx = 0; q.vy = dir * 100; w.place(q); w.step(); ok = past(q) > v.def.W / 2 + 8; }
  assert.ok(ok, 'and so do the city\'s people');
  void IN; void outward;
});
