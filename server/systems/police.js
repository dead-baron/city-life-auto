// NPC police response: units dispatched to the suspect's search circle, road routing,
// direct pursuit with sirens, officers on foot with tasers (1-2 stars), firearms (3+),
// SWAT at 4-5 stars, arrests, and stand-down when heat clears.
import { K } from '../../shared/constants.js';
import { pedStep } from '../../shared/physics.js';
import { isTurf, PED_BLOCK } from '../../shared/map.js';
import { mulberry32 } from '../../shared/rng.js';
import { spawnNpc, despawnNpc, seek, startFight } from './npc.js';
import { driveToward, planRoute } from './traffic.js';
import * as players from './players.js';
import * as combat from './combat.js';
import * as law from './law.js';
import * as vehicles from './vehicles.js';
import { IN } from '../../shared/input.js';

const rng = mulberry32(911);

function unitsWanted(stars) { return stars <= 0 ? 0 : Math.min(6, stars + (stars >= 3 ? 1 : 0)); }

export function update(world, dt) {
  world.police ??= new Set();
  if (world.tick % 20 === 7) dispatch(world);
  for (const vid of [...world.police]) {
    const v = world.get(vid);
    if (!v) { world.police.delete(vid); continue; }
    runUnit(world, v, dt);
  }
}

function dispatch(world) {
  const units = new Map();
  for (const vid of world.police) { const v = world.get(vid); if (v && v.ai) units.set(v.ai.target, (units.get(v.ai.target) || 0) + 1); }
  for (const p of world.players.values()) {
    if (!p.ped || p.ped.dead || p.wanted <= 0) continue;
    const have = units.get(p.pid) || 0;
    if (have >= unitsWanted(p.wanted)) continue;
    spawnUnit(world, p);
  }
}

function spawnUnit(world, p) {
  const m = world.map;
  const tx = p.seenAt && world.time - p.seenAt < 3 ? p.ped.x : p.lastSeenX;
  const ty = p.seenAt && world.time - p.seenAt < 3 ? p.ped.y : p.lastSeenY;
  const cands = m.nodes.filter((n) => {
    const d = Math.hypot(n.x - tx, n.y - ty);
    if (d < 750 || d > 1400) return false;
    for (const q of world.players.values()) if (q.ped && Math.hypot(q.ped.x - n.x, q.ped.y - n.y) < 650) return false;
    return true;
  });
  if (!cands.length) return;
  const n = cands[Math.floor(rng() * cands.length)];
  const swat = p.wanted >= 4 && rng() < 0.5;
  const moto = !swat && p.wanted <= 3 && rng() < 0.3; // motorcycle cops: one rider, fast, fragile
  const a = Math.atan2(ty - n.y, tx - n.x);
  const v = world.spawnVehicle(swat ? 'swat' : moto ? 'policebike' : 'police', n.x + 32, n.y + 32, a, {});
  v.despawnable = false;
  v.sirenOn = true;
  const crew = swat ? 3 : moto ? 1 : 2;
  for (let i = 0; i < crew; i++) {
    const cop = spawnNpc(world, swat ? 'swat' : 'cop', v.x, v.y, 'cop');
    cop.npc.unit = v.id;
    cop.vehId = v.id; cop.seat = i; v.seats[i] = cop.id;
    armCop(cop, p.wanted, swat);
  }
  v.ai = { kind: 'police', target: p.pid, mode: 'drive', route: null, routeAt: 0, swat };
  world.police.add(v.id);
}

function armCop(cop, stars, swat) {
  cop.weapon = swat ? 'rifle' : stars >= 4 ? 'smg' : stars >= 3 ? 'pistol' : 'taser';
  cop.npc.backup = stars >= 3 ? 'pistol' : 'baton';
}

function runUnit(world, v, dt) {
  const ai = v.ai;
  if (!ai || ai.kind !== 'police') { world.police.delete(v.id); v.despawnable = true; return; }
  const now = world.time;
  const p = world.players.get(ai.target);
  const crew = [];
  for (const e of world.entities.values()) if (e.kind === K.PED && e.npc && e.npc.unit === v.id && !e.dead) crew.push(e);
  const drv = v.seats[0] ? world.get(v.seats[0]) : null;
  if (drv && drv.player) {
    // cruiser hijacked by a player: the crew goes after the thief, unit is dissolved
    for (const c of crew) { c.npc.role = 'civ'; c.npc.exCop = true; c.npc.unit = 0; c.weapon = 'pistol'; if (c.vehId) vehicles.ejectPed(world, c, true); startFight(world, c, drv, 25); }
    world.police.delete(v.id);
    v.ai = null; v.despawnable = true; v.sirenOn = false;
    return;
  }
  const active = p && p.ped && !p.ped.dead && p.wanted > 0;
  if (!active || v.wreckAt) { standDown(world, v, crew, dt); return; }
  for (const c of crew) armCop(c, p.wanted, ai.swat);
  const t = p.ped;
  const seen = now - p.seenAt < 3;
  const kx = seen ? t.x : p.lastSeenX + Math.cos(now * 0.3 + v.id) * Math.min(p.searchR, 300) * 0.6;
  const ky = seen ? t.y : p.lastSeenY + Math.sin(now * 0.3 + v.id) * Math.min(p.searchR, 300) * 0.6;
  const driver = v.seats[0] ? world.get(v.seats[0]) : null;

  if (ai.mode === 'drive') {
    if (!driver || driver.dead) { ai.mode = 'foot'; for (const c of crew) if (c.vehId) vehicles.ejectPed(world, c, true); return; }
    const dist = Math.hypot(kx - v.x, ky - v.y);
    if (seen && !t.vehId && dist < 190) {
      ai.mode = 'foot';
      v.input = { throttle: 0, steer: 0, hb: true };
      for (const c of crew) { vehicles.ejectPed(world, c, true); c.npc.state = 'chase'; }
      return;
    }
    if (seen && dist < 520 && world.map.los(v.x, v.y, kx, ky)) {
      driveToward(world, v, kx, ky, t.vehId ? 720 : 320, { ignoreObstacles: !!t.vehId && dist < 200 });
    } else {
      if (!ai.route || now - ai.routeAt > 3) { ai.route = planRoute(world, v.x, v.y, kx, ky); ai.routeAt = now; }
      while (ai.route.length > 1 && Math.hypot(ai.route[0].x - v.x, ai.route[0].y - v.y) < 60) ai.route.shift();
      const wp = ai.route[0];
      driveToward(world, v, wp.x, wp.y, 520, {});
    }
    return;
  }

  // on foot
  for (const c of crew) {
    if (c.vehId || c.npc.war) continue; // busy in a gang fight (gangwar.js drives them)
    const d = Math.hypot(t.x - c.x, t.y - c.y);
    let inp;
    if (t.vehId && Math.hypot(t.x - v.x, t.y - v.y) > 260) {
      // suspect drove off: get back in the cruiser
      inp = seek(c, v.x, v.y, true);
      if (Math.hypot(v.x - c.x, v.y - c.y) < v.def.L / 2 + 24) {
        const seat = v.seats.findIndex((s) => !s);
        if (seat >= 0) { v.seats[seat] = c.id; c.vehId = v.id; c.seat = seat; }
      }
      if (crew.every((q) => q.vehId)) { ai.mode = 'drive'; if (!v.seats[0]) { const q = crew[0]; const i = v.seats.indexOf(q.id); v.seats[i] = 0; v.seats[0] = q.id; q.seat = 0; } }
    } else {
      const stunned = now < t.stunUntil || now < t.downUntil;
      const lethal = p.wanted >= 3;
      const w = c.weapon;
      if (stunned && d < 30 && !t.vehId) { law.arrest(world, c, t); inp = { bits: 0, mx: 0, my: 0, aim: 0 }; }
      else if (!seen && d > 250) inp = seek(c, kx, ky, true);
      else if (lethal && w !== 'taser' && d < 340 && world.map.los(c.x, c.y, t.x, t.y)) {
        inp = d > 180 ? seek(c, t.x, t.y, true) : { bits: 0, mx: 0, my: 0, aim: 0 };
        inp.aim = Math.atan2(t.y - c.y, t.x - c.x); inp.bits |= IN.AIMING;
        if (now > (c.npc.nextShot || 0)) { inp.bits |= IN.FIRE; c.npc.nextShot = now + 0.25 + rng() * 0.6; }
      } else if (!lethal) {
        inp = seek(c, t.x, t.y, true);
        inp.aim = Math.atan2(t.y - c.y, t.x - c.x); inp.bits |= IN.AIMING;
        if (d < 150 && !stunned && now > (c.npc.nextTase || 0) && world.map.los(c.x, c.y, t.x, t.y)) {
          c.weapon = 'taser'; inp.bits |= IN.FIRE; c.npc.nextTase = now + 2.5;
        } else if (d < 30 && !stunned) { c.weapon = 'baton'; inp.bits |= IN.FIRE; }
        if (d < 24) { inp.mx *= 0.2; inp.my *= 0.2; }
      } else inp = seek(c, t.x, t.y, true);
      // gangs open fire on cops in their turf
      if (isTurf(c.x, c.y) && world.tick % 40 === c.id % 40) {
        for (const g of world.query(c.x, c.y, 420, K.PED)) if (g.npc && g.npc.role === 'gang' && !g.dead) startFight(world, g, c, 20);
      }
    }
    if (now >= c.downUntil && now >= c.stunUntil) {
      pedStep(c, inp, dt, world.map, players.pedMods(world, c));
      if (inp.bits & IN.FIRE) combat.tryAttack(world, c, inp.aim);
    }
  }
  if (crew.every((c) => c.vehId) && crew.length) ai.mode = 'drive';
}

function standDown(world, v, crew, dt) {
  const now = world.time;
  v.sirenOn = false;
  for (const c of crew) {
    if (c.vehId || c.npc.war) continue;
    const inp = seek(c, v.x, v.y, false);
    if (now >= c.downUntil && now >= c.stunUntil) pedStep(c, inp, dt, world.map, players.pedMods(world, c));
    if (Math.hypot(v.x - c.x, v.y - c.y) < v.def.L / 2 + 26 || PED_BLOCK[world.map.tileAtPx(c.x, c.y)]) {
      const seat = v.seats.findIndex((s) => !s);
      if (seat >= 0) { v.seats[seat] = c.id; c.vehId = v.id; c.seat = seat; } else { despawnNpc(world, c); }
    }
  }
  let visible = false;
  for (const q of world.players.values()) if (q.ped && Math.hypot(q.ped.x - v.x, q.ped.y - v.y) < 900) { visible = true; break; }
  if (!visible || now - (v.ai.downSince ??= now) > 40) {
    for (const sid of v.seats) if (sid) { const c = world.get(sid); if (c && c.npc) despawnNpc(world, c); }
    for (const c of crew) if (!c.removed) despawnNpc(world, c);
    world.police.delete(v.id);
    world.remove(v);
    return;
  }
  if (v.seats[0]) {
    if (!v.ai.leave) v.ai.leave = { x: v.x + Math.cos(v.a) * 2000, y: v.y + Math.sin(v.a) * 2000 };
    if (!v.ai.route || now - v.ai.routeAt > 5) { v.ai.route = planRoute(world, v.x, v.y, v.ai.leave.x, v.ai.leave.y); v.ai.routeAt = now; }
    while (v.ai.route.length > 1 && Math.hypot(v.ai.route[0].x - v.x, v.ai.route[0].y - v.y) < 60) v.ai.route.shift();
    driveToward(world, v, v.ai.route[0].x, v.ai.route[0].y, 260, {});
  }
}
