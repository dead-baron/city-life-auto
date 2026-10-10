// Gangs vs police. The syndicate leaves cops alone unless provoked: a cop tearing past them at
// speed, or opening fire nearby, makes the gang members around turn on that cop, and NPC cops
// nearby fight back. On top of that, every few minutes a gang-police shootout breaks out near
// the turf of a player who is around (a red world event on the radar).
import { K } from '../../shared/constants.js';
import { pedStep } from '../../shared/physics.js';
import { PED_BLOCK, isTurf } from '../../shared/map.js';
import { mulberry32 } from '../../shared/rng.js';
import { GANG_PROVOKE_SPEED, SHOOTOUT_EVERY_S } from '../../shared/rules.js';
import { IN } from '../../shared/input.js';
import { spawnNpc, despawnNpc, seek, startFight } from './npc.js';
import * as players from './players.js';
import * as combat from './combat.js';
import * as vehicles from './vehicles.js';
import * as events from './events.js';

const rng = mulberry32(4040);
const isGang = (e) => !!(e && e.npc && e.npc.role === 'gang' && !e.dead);
export const isCopPed = (e) => !!(e && !e.dead && ((e.npc && e.npc.role === 'cop') || (e.player && e.player.badge)));

// A cop did something the gang won't stand for near (x, y).
export function provoke(world, cop, x = cop.x, y = cop.y, why = '') {
  if (!isCopPed(cop)) return 0;
  let n = 0, firstGang = null;
  for (const g of world.query(x, y, 450, K.PED)) {
    if (!isGang(g)) continue;
    startFight(world, g, cop, 40);
    firstGang ??= g;
    n++;
  }
  if (!n) return 0;
  // the cop's colleagues nearby weigh in
  for (const c of world.query(x, y, 600, K.PED)) if (c.npc && c.npc.role === 'cop' && !c.dead && !c.npc.war) c.npc.war = firstGang.id;
  if (cop.npc && !cop.npc.war) cop.npc.war = firstGang.id;
  if (cop.player && now(world) - (cop.player.gangCopWarnAt || -99) > 20) {
    cop.player.gangCopWarnAt = now(world);
    world.notify(cop.player, `The Syndicate takes offence${why ? ' - ' + why : ''}. Watch yourself!`, 'bad');
  }
  return n;
}
const now = (world) => world.time;

// A gang member attacked an NPC cop: that cop (and partners nearby) fight back.
export function copAttackedByGang(world, cop, gang) {
  if (!cop.npc || cop.dead) return;
  cop.npc.war = gang.id;
  for (const c of world.query(cop.x, cop.y, 500, K.PED)) if (c.npc && c.npc.role === 'cop' && !c.dead && !c.npc.war) c.npc.war = gang.id;
}

export function update(world, dt) {
  const t = world.time;
  // speeding cop cars next to gang members
  if (world.tick % 5 === 1) {
    for (const v of world.entities.values()) {
      if (v.kind !== K.VEH || v.removed || v.wreckAt || !v.seats[0]) continue;
      const sp = Math.hypot(v.vx, v.vy);
      if (sp < GANG_PROVOKE_SPEED) continue;
      const d = world.get(v.seats[0]);
      if (!isCopPed(d)) continue;
      for (const g of world.query(v.x, v.y, v.def.L / 2 + 60, K.PED)) {
        if (!isGang(g) || g.npc.state === 'fight') continue;
        provoke(world, d, g.x, g.y, 'you nearly ran them down');
        break;
      }
    }
  }
  // NPC cops at war with the gang
  for (const c of world.entities.values()) if (c.kind === K.PED && c.npc && c.npc.role === 'cop' && c.npc.war && !c.dead && !c.onTrain) copWar(world, c, dt, t);
  // random shootouts near turf
  world.nextShootout ??= t + SHOOTOUT_EVERY_S[0];
  if (t >= world.nextShootout) {
    world.nextShootout = t + SHOOTOUT_EVERY_S[0] + rng() * (SHOOTOUT_EVERY_S[1] - SHOOTOUT_EVERY_S[0]);
    startShootout(world);
  }
  if (world.tick % 20 === 9) tidyShootouts(world);
}

function nextGangTarget(world, c) {
  let best = null, bd = 650;
  for (const g of world.query(c.x, c.y, 650, K.PED)) {
    if (!isGang(g)) continue;
    const d = Math.hypot(g.x - c.x, g.y - c.y);
    if (d < bd) { bd = d; best = g; }
  }
  return best;
}

function copWar(world, c, dt, t) {
  let tgt = world.get(c.npc.war);
  if (!isGang(tgt)) { tgt = nextGangTarget(world, c); c.npc.war = tgt ? tgt.id : 0; }
  if (!tgt) return;
  if (c.vehId) vehicles.ejectPed(world, c, true);
  if (c.weapon === 'taser' || c.weapon === 'baton' || c.weapon === 'fists') c.weapon = 'pistol';
  if (t < c.downUntil || t < c.stunUntil) return;
  const d = Math.hypot(tgt.x - c.x, tgt.y - c.y), aim = Math.atan2(tgt.y - c.y, tgt.x - c.x);
  const inp = d > 220 ? seek(c, tgt.x, tgt.y, true) : { bits: 0, mx: 0, my: 0, aim };
  if (d < 420 && world.map.los(c.x, c.y, tgt.x, tgt.y)) {
    inp.aim = aim; inp.bits |= IN.AIMING;
    if (t > (c.npc.nextShot || 0)) { inp.bits |= IN.FIRE; c.npc.nextShot = t + 0.28 + rng() * 0.3; }
  }
  pedStep(c, inp, dt, world.map, players.pedMods(world, c));
  if (inp.bits & IN.FIRE) combat.tryAttack(world, c, aim);
}

// ---- random shootouts ---------------------------------------------------------------------
function turfSpots(world) {
  // gang HQs, plus the middle of each turf district
  const out = world.map.pois.filter((p) => p.kind === 'gang').map((p) => ({ x: p.x, y: p.y }));
  return out;
}

export function startShootout(world, nearPlayer = null) {
  const cands = [...world.players.values()].filter((p) => p.ped && !p.ped.dead && p.conn !== null);
  const spots = turfSpots(world);
  let p = nearPlayer, spot = null;
  for (const q of nearPlayer ? [nearPlayer] : cands) {
    const s = spots.find((h) => Math.hypot(h.x - q.ped.x, h.y - q.ped.y) < 2400) || (isTurf(world.map, q.ped.x, q.ped.y) ? { x: q.ped.x, y: q.ped.y } : null);
    if (s) { p = q; spot = s; break; }
  }
  if (!p || !spot) return null;
  // a place 450-800 px from the player, toward the turf, on walkable ground
  let cx = 0, cy = 0, ok = false;
  for (let k = 0; k < 24 && !ok; k++) {
    const a = Math.atan2(spot.y - p.ped.y, spot.x - p.ped.x) + (rng() - 0.5) * 1.6;
    const d = 450 + rng() * 350;
    cx = p.ped.x + Math.cos(a) * d; cy = p.ped.y + Math.sin(a) * d;
    ok = !PED_BLOCK[world.map.tileAtPx(cx, cy)] && !PED_BLOCK[world.map.tileAtPx(cx + 120, cy)];
  }
  if (!ok) return null;
  const node = world.map.nearestNode(cx, cy);
  const cop = [];
  const car = node ? world.spawnVehicle('police', node.x + 20, node.y + 20, rng() * 6.28, {}) : null;
  if (car) { car.despawnable = false; car.sirenOn = true; car.shootout = true; }
  for (let i = 0; i < 3; i++) {
    const c = spawnNpc(world, 'cop', (car ? car.x : cx) + 30 + i * 22, (car ? car.y : cy) + 26, 'cop');
    c.weapon = 'pistol'; c.npc.shootout = true; c.npc.coverCar = car ? car.id : 0;
    cop.push(c);
  }
  const gang = [];
  for (let i = 0; i < 3 + Math.floor(rng() * 2); i++) {
    const a = rng() * 6.28;
    let gx = cx + Math.cos(a) * 160, gy = cy + Math.sin(a) * 160;
    if (PED_BLOCK[world.map.tileAtPx(gx, gy)]) { gx = cx; gy = cy; }
    const g = spawnNpc(world, 'syndicate', gx, gy, 'gang');
    g.npc.keep = true; g.npc.shootout = true;
    gang.push(g);
  }
  gang.forEach((g, i) => startFight(world, g, cop[i % cop.length], 90));
  cop.forEach((c, i) => { c.npc.war = gang[i % gang.length].id; });
  const ev = events.add(world, { kind: 'shootout', x: cx, y: cy, until: world.time + 120 });
  world.shootouts ??= [];
  world.shootouts.push({ ev: ev.id, car: car ? car.id : 0, peds: [...cop, ...gang].map((e) => e.id), at: world.time });
  for (const q of world.players.values()) if (q.ped && Math.hypot(q.ped.x - cx, q.ped.y - cy) < 1500) world.notify(q, 'Shots fired! A gang shootout with the police broke out nearby.', 'warn');
  return { x: cx, y: cy };
}

function tidyShootouts(world) {
  if (!world.shootouts) return;
  world.shootouts = world.shootouts.filter((s) => {
    const alive = s.peds.map((id) => world.get(id)).filter((e) => e && !e.dead);
    const copsLeft = alive.filter((e) => e.npc && e.npc.role === 'cop').length;
    const gangLeft = alive.filter(isGang).length;
    const over = !copsLeft || !gangLeft || world.time - s.at > 150;
    if (over && world.happenings) world.happenings = world.happenings.filter((e) => e.id !== s.ev);
    if (!over) return true;
    // clean up once nobody's watching
    const ref = alive[0] || world.get(s.car) || null;
    const seen = ref && [...world.players.values()].some((q) => q.ped && Math.hypot(q.ped.x - ref.x, q.ped.y - ref.y) < 1100);
    if (seen) { for (const e of alive) if (e.npc && e.npc.role === 'cop') e.npc.war = 0; return true; }
    for (const e of alive) despawnNpc(world, e);
    const car = world.get(s.car);
    if (car && !car.seats.some((x) => x && world.get(x)?.player)) world.remove(car);
    return false;
  });
}

