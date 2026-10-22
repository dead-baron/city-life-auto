// Horses (#325 - server/systems/horses.js, shared/physics.js, shared/rules.js HORSE): a canter unless spurred to a gallop,
// which blows it; hooves, not tyres; never into the water; a farm's horse ridden off bareback is horse theft; the co-op's
// horses hired and bought; out of health it throws its rider and bolts - it never burns.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer, run, teleport } from './helpers.js';
import { DT, T, TILE, K } from '../shared/constants.js';
import { IN } from '../shared/input.js';
import { HORSE } from '../shared/rules.js';
import { VEHICLES } from '../shared/vehicles.js';
import { HORSE_BLOCK, WATER_T } from '../shared/mapcore.js';
import { vehStep, newVehState, driveInput } from '../shared/physics.js';
import * as horses from '../server/systems/horses.js';
import * as vehicles from '../server/systems/vehicles.js';
import * as wildlife from '../server/systems/wildlife.js';
import * as economy from '../server/systems/economy.js';
import * as law from '../server/systems/law.js';
import * as players from '../server/systems/players.js';

let seq = 1;
const steer = (w, p, mx, my, bits = 0, n = 1) => { for (let i = 0; i < n; i++) { players.queueInput(p, { seq: seq++, bits: i === 0 ? bits : bits & ~(IN.VEHICLE | IN.ACTION), mx, my, aim: 0 }); w.step(); } };
// open ground: a long run of grass (no walls, no water) to ride along
function openGround(m, len) {
  for (let ty = m.y0 + 10; ty < m.y0 + m.h - 10; ty += 7) for (let tx = m.x0 + 10; tx < m.x0 + m.w - 10 - len / TILE; tx += 5) {
    let ok = true;
    for (let k = -1; k <= len / TILE + 1 && ok; k++) for (let j = -2; j <= 2; j++) { const t = m.tiles[m.idx(tx + k, ty + j)]; if (t !== T.GRASS && t !== T.DIRT && t !== T.FIELD) { ok = false; break; } }
    if (ok) return { x: tx * TILE + 16, y: ty * TILE + 16 };
  }
  return null;
}

test('a horse canters, gallops when spurred until it is blown, gets its wind back walking; no skids or burnouts', () => {
  const w = makeWorld(), m = w.map, def = VEHICLES.horse;
  const g = openGround(m, 2400);
  assert.ok(g, 'open ground');
  const s = newVehState(g.x, g.y, 0);
  const go = (gallop, n) => { let top = 0; for (let i = 0; i < n; i++) { const di = driveInput(s, { bits: gallop ? IN.SPRINT : 0, mx: 1, my: 0 }); vehStep(s, di, DT, m, def, {}); s.x = Math.min(s.x, g.x + 2000); top = Math.max(top, Math.hypot(s.vx, s.vy)); } return top; };
  const canter = go(false, 80);
  assert.ok(canter <= def.max * HORSE.canter + 2 && canter > def.max * HORSE.canter * 0.85, `a canter (${Math.round(canter)})`);
  assert.equal(s.stam ?? 1, 1, 'a canter keeps its wind');
  s.x = g.x;
  const gal = go(true, 40);
  assert.ok(gal > def.max * 0.9, `spurred: a gallop (${Math.round(gal)})`);
  assert.ok(s.stam < 1, 'galloping tires it');
  let n = 0;
  for (; n < 20 / DT && !s.blown; n++) { s.x = g.x; go(true, 1); }
  assert.ok(s.blown && Math.abs(n * DT - HORSE.galS) < 3.5, `blown after about ${HORSE.galS} s of it (${(n * DT).toFixed(1)} s)`);
  s.x = g.x;
  go(true, 60);
  const after = Math.hypot(s.vx, s.vy);
  assert.ok(after <= def.max * HORSE.canter + 4, `blown: back to a canter, spurred or not (${Math.round(after)})`);
  // standing, it gets its breath back
  for (let i = 0; i < (HORSE.backS + 1) / DT; i++) vehStep(s, driveInput(s, { bits: 0, mx: 0, my: 0 }), DT, m, def, {});
  assert.ok(!s.blown && s.stam > 0.95, `rested (${s.stam.toFixed(2)})`);
  // the handbrake at speed: it pulls up - no slide
  s.x = g.x; go(false, 40);
  for (let i = 0; i < 20; i++) vehStep(s, { throttle: 0.5, steer: 1, hb: true, slide: true, drv: true }, DT, m, def, {});
  assert.equal(s.slip || 0, 0, 'no skid');
});

test('never into the water: a horse ridden at the shore stops at it (a bridge it crosses)', () => {
  assert.ok(HORSE_BLOCK[T.WATER] && HORSE_BLOCK[T.DEEP] && !HORSE_BLOCK[T.BRIDGE] && !HORSE_BLOCK[T.SAND] && !HORSE_BLOCK[T.ROAD]);
  const w = makeWorld(), m = w.map;
  // a shore: grass, then water two tiles on
  let at = null;
  for (let ty = m.y0 + 5; ty < m.y0 + m.h - 5 && !at; ty += 3) for (let tx = m.x0 + 8; tx < m.x0 + m.w - 8; tx += 3) {
    const a = m.tiles[m.idx(tx, ty)], b = m.tiles[m.idx(tx + 3, ty)];
    if ((a === T.GRASS || a === T.SAND) && m.tiles[m.idx(tx + 1, ty)] !== T.WALL && WATER_T[b] && WATER_T[m.tiles[m.idx(tx + 6, ty)]] && !HORSE_BLOCK[m.tiles[m.idx(tx - 2, ty)]]) { at = { x: tx * TILE + 16, y: ty * TILE + 16 }; break; }
  }
  assert.ok(at, 'a shore');
  const s = newVehState(at.x - 60, at.y, 0);
  for (let i = 0; i < 80; i++) { vehStep(s, driveInput(s, { bits: IN.SPRINT, mx: 1, my: 0 }), DT, m, VEHICLES.horse, {}); assert.ok(!WATER_T[m.tileAtPx(s.x, s.y)], 'never in the water'); }
});

test('a farm horse: up on it bareback with the vehicle button - horse theft; its coat kept', () => {
  const w = makeWorld();
  const { p, prof } = joinPlayer(w);
  const g = openGround(w.map, 300);
  teleport(w, p.ped, g.x, g.y);
  const a = wildlife.spawnAnimal(w, 'horse', g.x + 30, g.y);
  assert.ok(a.wild.livestock && a.wild.coat >= 0 && a.wild.coat < horses.COATS, 'a farm horse in a coat');
  assert.match(a.archetype || a.art || '', /^pet:horse:c\d$/, 'drawn in its coat');
  const coat = a.wild.coat, exp0 = prof.criminalExp;
  const act = players.findInteraction(w, p);
  assert.match(act.label, /Ride the horse bareback - Horse theft/);
  steer(w, p, 0, 0, IN.VEHICLE); steer(w, p, 0, 0, 0, 2);   // (Safety mode: press again)
  steer(w, p, 0, 0, IN.VEHICLE); steer(w, p, 0, 0, 0, 2);
  const v = w.get(p.ped.vehId);
  assert.ok(v && v.def.horse, 'riding it');
  assert.ok(a.removed, 'the animal is the horse now');
  assert.equal(horses.coatOf(v), coat, 'in its coat');
  assert.ok(horses.isBare(v), 'bareback');
  assert.equal(prof.criminalExp - exp0, Math.round(law.CRIMES.horseTheft.heat / 2), 'booked as horse theft');
  const me = players.buildMe(w, p);
  assert.ok(me.horse && me.horse.st === 1, 'its wind on the page');
});

test('the co-op: hire one (handed back there), buy one of today\'s three (yours, saddled up again later)', () => {
  const w = makeWorld();
  const { p, prof } = joinPlayer(w);
  const poi = w.map.pois.find((q) => q.kind === 'farm');
  assert.ok(poi, 'a farm co-op');
  prof.cash = 10000;
  teleport(w, p.ped, poi.x, poi.y + 40);
  const pay = economy.payFrom;
  const opts = horses.menuOpts(w, p, poi);
  assert.ok(opts.some((o) => o.id === 'horse:hire') && opts.filter((o) => o.id.startsWith('horse:buy:')).length === 3, 'hire, and three to buy');
  assert.equal(horses.hire(w, p, poi, pay), null);
  const hv = horses.hired(w, p);
  assert.ok(hv && hv.rentedBy === p.pid && !horses.isBare(hv), 'a saddled horse, hired');
  assert.equal(prof.cash, 10000 - HORSE.hire);
  assert.match(horses.hire(w, p, poi, pay), /already|first/);
  // ride it, hand it back by the co-op
  teleport(w, p.ped, hv.x, hv.y);
  assert.ok(vehicles.tryEnter(w, p.ped) && p.ped.vehId === hv.id, 'up on it (no crime: it is hired)');
  assert.equal(prof.criminalExp | 0, 0);
  assert.equal(horses.giveBack(w, p), null);
  assert.ok(hv.removed && !p.horseHire && !p.ped.vehId, 'handed back');
  // buy one
  const coat = horses.paddock(w, poi)[1];
  assert.equal(horses.buy(w, p, poi, coat, pay), null);
  const ov = prof.vehicles[prof.vehicles.length - 1];
  assert.ok(ov.model === 'horse' && ov.variant === coat, 'yours, in its coat');
  const mine = w.get(p.activeVehicle);
  assert.ok(mine && mine.def.horse && mine.owner === p.pid && horses.coatOf(mine) === coat, 'saddled and waiting');
  assert.ok(horses.menuOpts(w, p, poi).some((o) => o.id === `vg:${prof.vehicles.length - 1}`), 'saddle it up again at any co-op');
});

test('out of health a horse throws its rider and bolts - no fire, no explosion - and is gone once out of sight', () => {
  const w = makeWorld();
  const { p } = joinPlayer(w);
  const g = openGround(w.map, 600);
  teleport(w, p.ped, g.x, g.y);
  const v = w.spawnVehicle('horse', g.x + 20, g.y, 0, { npcOwned: false });
  v.issuedTo = p.pid;
  teleport(w, p.ped, v.x, v.y);
  assert.ok(vehicles.tryEnter(w, p.ped));
  const events = [];
  const emit0 = w.emit.bind(w); w.emit = (x, y, e) => { events.push(e.e); return emit0(x, y, e); };
  vehicles.damageVehicle(w, v, 9999, null, true, true);
  assert.ok(!p.ped.vehId, 'thrown');
  assert.ok(!v.wreckAt && !v.dead && v.bolt, 'bolting, not wrecked');
  assert.ok(!events.includes('explode') && events.includes('whinny'), 'a whinny, no blast');
  const x0 = v.x, y0 = v.y;
  run(w, 2);
  assert.ok(Math.hypot(v.x - x0, v.y - y0) > 200, 'off at a gallop');
  vehicles.damageVehicle(w, v, 9999, null, true, true);
  assert.ok(!v.wreckAt, 'still no wreck');
  run(w, 5);
  assert.ok(v.removed, 'gone (nobody watching in a test)');
});
