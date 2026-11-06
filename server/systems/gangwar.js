// Gangs vs police. The syndicate leaves cops alone unless provoked: a cop tearing past them at
// speed, or opening fire nearby, makes the gang members around turn on that cop, and NPC cops
// nearby fight back. On top of that, every few minutes a gang-police shootout breaks out near
// the turf of a player who is around (a red world event on the radar).
import { K } from '../../shared/constants.js';
import { pedStep } from '../../shared/physics.js';
import { PED_BLOCK, CAR_BLOCK, WATER_T, isTurf } from '../../shared/map.js';
import { mulberry32 } from '../../shared/rng.js';
import { GANG_PROVOKE_SPEED, SHOOTOUT_EVERY_S } from '../../shared/rules.js';
import { IN } from '../../shared/input.js';
import { nearestEdge } from '../../shared/roads.js';
import { pointAt } from '../../shared/geom.js';
import { VEHICLES } from '../../shared/vehicles.js';
import { spawnNpc, despawnNpc, seek, startFight } from './npc.js';
import { wildStyle } from './wildlife.js';
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
    world.notify(cop.player, `The Syndicate takes offense${why ? ' - ' + why : ''}. Watch yourself!`, 'bad');
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
export function turfSpots(world) {
  // gang HQs on the turf or out in the wilds (a ghost town's hideout) - not the casino town's Counting Room, where the
  // syndicate keeps its head down and doesn't start shooting it out with the police (the owner, 10-16: "Mesa Flats
  // (casino town) gang: isolate it, or make them Vegas-mafia types who aren't touchy")
  const m = world.map;
  return m.pois.filter((p) => p && p.kind === 'gang' && (isTurf(m, p.x, p.y) || wildStyle(m, p.x, p.y))).map((p) => ({ x: p.x, y: p.y }));
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
  const at = kerbSpot(world, cx, cy);
  const cop = [];
  const car = at ? world.spawnVehicle('police', at.x, at.y, at.a, {}) : null;
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

// Where the police car pulls up for a shootout: at the kerb of the street nearest (x, y), along it, clear of the
// junctions at its ends. (It used to be dropped 20 px off the nearest junction's middle at any angle - and while anyone
// was near enough to see, it stood there for good: by Northgate station one stood across the mouth of Central Avenue,
// and the avenue queued behind it for the rest of the run.)
function kerbSpot(world, x, y) {
  const net = world.map.net;
  if (!net) return null;
  const ne = nearestEdge(net, x, y, (e) => e.lvl === 0 && e.kind !== 'hwy' && e.kind !== 'ramp' && !e.bridge);
  if (!ne) return null;
  const e = ne.e, d = VEHICLES.police, ta = net.nodes[e.a].trim?.[e.id] || 0, tb = net.nodes[e.b].trim?.[e.id] || 0;
  const lo = ta + d.L / 2 + 60, hi = e.len - tb - d.L / 2 - 60;
  const s = hi > lo ? Math.min(hi, Math.max(lo, ne.s)) : e.len / 2;
  const c = pointAt(e.pts, s), side = rng() < 0.5 ? 1 : -1, hw = e.hw || 48;
  // (on the right-hand kerb of the way it faces: side 1 faces along the street's points, -1 against them)
  const a = Math.atan2(c.ty, c.tx) + (side > 0 ? 0 : Math.PI), nx = -Math.sin(a), ny = Math.cos(a), ca = Math.cos(a), sa = Math.sin(a), m = world.map;
  // up on the pavement where there's room for it (out of the traffic's way: a one-lane street's lane is no wider than a
  // car), else at the kerb
  const fits = (off) => {
    const x = c.x + nx * off, y = c.y + ny * off;
    for (const [u, w] of [[0, 0], [d.L / 2, d.W / 2], [d.L / 2, -d.W / 2], [-d.L / 2, d.W / 2], [-d.L / 2, -d.W / 2], [0, d.W / 2], [0, -d.W / 2]]) {
      const px = x + ca * u - sa * w, py = y + sa * u + ca * w, t = m.tileAtPx(px, py);
      if (CAR_BLOCK[t] || WATER_T[t] || PED_BLOCK[t]) return false;
      const tx = Math.floor(px / 32), ty = Math.floor(py / 32);
      for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) for (const q of m.solidProps.get(m.idx(tx + i, ty + j)) || []) if (!q.off && Math.hypot(q.x - px, q.y - py) < q.r + 4) return false;
    }
    return true;
  };
  const up = hw + d.W / 2 + 4, kerb = Math.max(0, hw - d.W / 2 - 6), off = fits(up) ? up : kerb;
  return { x: c.x + nx * off, y: c.y + ny * off, a };
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
    if (seen) { for (const e of alive) if (e.npc && e.npc.role === 'cop') e.npc.war = 0; const c0 = world.get(s.car); if (c0) { c0.despawnable = true; c0.sirenOn = false; } return true; }   // (over: the car's the street's clean-up's once nobody's looking)
    for (const e of alive) despawnNpc(world, e);
    const car = world.get(s.car);
    if (car && !car.seats.some((x) => x && world.get(x)?.player)) world.remove(car);
    return false;
  });
}

