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
import { inAnyView } from '../view.js';
import { wildStyle } from './wildlife.js';
import { WILD_UNITS, POLICE_UNITS, POLICE_FAR, REPORT_SEARCH_S, REPORT_SPOT_PX } from '../../shared/rules.js';

const rng = mulberry32(911);

function unitsWanted(stars) { return stars <= 0 ? 0 : Math.min(6, stars + (stars >= 3 ? 1 : 0)); }

export function update(world, dt) {
  world.police ??= new Set();
  if (world.tick % 20 === 7) dispatch(world);
  if (world.npcCalls && world.npcCalls.length && world.tick % 10 === 3) npcCalls(world);
  if (world.witnessCalls && world.witnessCalls.length && world.tick % 10 === 6) witnessCalls(world);
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
    // lying low out in the wilds: once they've lost you, the cars already out keep searching but no more are sent
    const lost = world.time - p.seenAt > 3 && !!wildStyle(world.map, p.ped.x, p.ped.y);
    // police presence follows wealth: fewer cars in the rough parts of town, more in the rich ones (rules.js POLICE_UNITS)
    const want = Math.max(1, Math.round(unitsWanted(p.wanted) * (POLICE_UNITS[tierAt(world, p.ped.x, p.ped.y)] ?? 1)));
    if (have >= (lost ? Math.min(WILD_UNITS, want) : want)) continue;
    spawnUnit(world, p);
  }
}

// A robbery alarm: several squad cars sent straight at the scene, from close by.
export function respondTo(world, p, x, y, count = 3) {
  for (let i = 0; i < count; i++) spawnUnit(world, p, { at: { x, y }, minD: 380, maxD: 950, clearPx: 300, noMoto: true });
}

// Where a new unit rolls in from: a road node in a ring round the suspect's last known position,
// never on anyone's screen and well clear of every player (no cops popping up right on you), and
// not on the road straight ahead of a suspect fleeing at speed - they come up from behind or the
// side. Out in the wilds the ring is wider (help is a long drive away). If nothing fits, the ring
// widens; if still nothing, no unit this time (dispatch tries again in a second).
const AHEAD_COS = 0.5;  // within 60 degrees of a fleeing suspect's heading counts as ahead
const FLEE_SPEED = 150; // px/s: slower than this nobody is fleeing anywhere in particular
const tierAt = (world, x, y) => world.map.districtAt(x, y).tier || 'mid';
function spawnPoint(world, p, tx, ty, o) {
  const m = world.map;
  const wild = !o.at && !!wildStyle(m, p.ped.x, p.ped.y);
  const far = o.minD ? 1 : POLICE_FAR[tierAt(world, tx, ty)] ?? 1;   // (help is further off in the rough parts of town)
  const minD = o.minD || (wild ? 1300 : 750) * far, maxD = o.maxD || (wild ? 2600 : 1400) * far, clear = o.clearPx || (wild ? 1100 : 650);
  const f = p.ped.vehId ? world.get(p.ped.vehId) || p.ped : p.ped;
  const fvx = f.vx || 0, fvy = f.vy || 0, fsp = Math.hypot(fvx, fvy);
  for (const [lo, hi] of [[minD, maxD], [maxD, maxD * 1.6], [maxD * 1.6, maxD * 2.4]]) {
    const ok = [], behind = [];
    for (const n of m.nodes) {
      if (n.lvl !== 0) continue;
      const d = Math.hypot(n.x - tx, n.y - ty);
      if (d < lo || d > hi) continue;
      let near = false;
      for (const q of world.players.values()) if (q.ped && Math.hypot(q.ped.x - n.x, q.ped.y - n.y) < clear) { near = true; break; }
      if (near || inAnyView(world, n.x + 32, n.y + 32, 140)) continue;
      if (world.query(n.x + 32, n.y + 32, 80, K.VEH).length) continue;
      ok.push(n);
      const dx = n.x - p.ped.x, dy = n.y - p.ped.y;
      if (fsp < FLEE_SPEED || (dx * fvx + dy * fvy) < AHEAD_COS * Math.hypot(dx, dy) * fsp) behind.push(n);
    }
    const pool = behind.length ? behind : ok;
    if (pool.length) return pool[Math.floor(rng() * pool.length)];
  }
  return null;
}

function spawnUnit(world, p, o = {}) {
  const fresh = p.seenAt && world.time - p.seenAt < 3;
  const tx = o.at ? o.at.x : fresh ? p.ped.x : p.lastSeenX;
  const ty = o.at ? o.at.y : fresh ? p.ped.y : p.lastSeenY;
  const n = spawnPoint(world, p, tx, ty, o);
  if (!n) return null;
  const swat = p.wanted >= 4 && rng() < 0.5;
  const moto = !o.noMoto && !swat && p.wanted <= 3 && rng() < 0.3; // motorcycle cops: one rider, fast, fragile
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
  return v;
}

function armCop(cop, stars, swat) {
  cop.weapon = swat ? 'rifle' : stars >= 4 ? 'smg' : stars >= 3 ? 'pistol' : 'taser';
  cop.npc.backup = stars >= 3 ? 'pistol' : 'baton';
}

// ---- NPC crime: the police go after NPC crooks too ------------------------------------------------------------
// A mugger who gets away with a purse (npc.js mugRun) is called in (world.npcCalls): a few seconds later one squad
// car is sent after them from out of sight, sirens on. It drives up, the crew jumps out, tases the crook and cuffs
// them (into custody: law.js arrest - the purse falls where they're tased, for the victim or a passer-by). It gives
// up if they get clean away (out of the crew's sight for a while) or after two minutes, and drives off.
const NPC_CHASE_S = 120;
function npcCalls(world) {
  const now = world.time, keep = [];
  for (const c of world.npcCalls) {
    if (c.at > now) { keep.push(c); continue; }
    const t = world.get(c.id);
    if (!t || t.dead || !t.npc || !t.npc.hasPurse) continue;
    let busy = false;
    for (const vid of world.police) { const v = world.get(vid); if (v && v.ai && v.ai.npcTarget === t.id) { busy = true; break; } }
    if (!busy) spawnNpcUnit(world, t);
  }
  world.npcCalls = keep;
}
function spawnNpcUnit(world, t) {
  const n = spawnPoint(world, { ped: t }, t.x, t.y, { at: { x: t.x, y: t.y }, minD: 520, maxD: 1150, clearPx: 360 });
  if (!n) return null;
  const v = world.spawnVehicle('police', n.x + 32, n.y + 32, Math.atan2(t.y - n.y, t.x - n.x), {});
  v.despawnable = false;
  v.sirenOn = true;
  for (let i = 0; i < 2; i++) {
    const cop = spawnNpc(world, 'cop', v.x, v.y, 'cop');
    cop.npc.unit = v.id; cop.vehId = v.id; cop.seat = i; v.seats[i] = cop.id;
    armCop(cop, 1, false);
  }
  v.ai = { kind: 'police', target: null, npcTarget: t.id, since: world.time, seenAt: world.time, lx: t.x, ly: t.y, mode: 'drive', route: null, routeAt: 0, swat: false };
  t.npc.keep = true;
  world.police.add(v.id);
  return v;
}
function runNpcUnit(world, v, crew, dt) {
  const ai = v.ai, now = world.time, t = world.get(ai.npcTarget);
  const gone = !t || t.dead || t.removed || !t.npc;
  if (!gone) {
    const near = (x, y, r) => Math.hypot(t.x - x, t.y - y) < r && world.map.los(x, y, t.x, t.y);
    if (near(v.x, v.y, 700) || crew.some((c) => !c.vehId && near(c.x, c.y, 520))) { ai.seenAt = now; ai.lx = t.x; ai.ly = t.y; }
  }
  if (gone || v.wreckAt || now - ai.since > NPC_CHASE_S || now - ai.seenAt > 25) { if (t && t.npc) t.npc.keep = false; standDown(world, v, crew, dt); return; }
  const seen = now - ai.seenAt < 2, kx = seen ? t.x : ai.lx, ky = seen ? t.y : ai.ly;
  const driver = v.seats[0] ? world.get(v.seats[0]) : null;
  if (ai.mode === 'drive') {
    if (!driver || driver.dead) { ai.mode = 'foot'; for (const c of crew) if (c.vehId) vehicles.ejectPed(world, c, true); return; }
    const dist = Math.hypot(kx - v.x, ky - v.y);
    if (dist < 190) { ai.mode = 'foot'; v.input = { throttle: 0, steer: 0, hb: true }; for (const c of crew) { vehicles.ejectPed(world, c, true); c.npc.state = 'chase'; } return; }
    if (seen && dist < 520) driveToward(world, v, kx, ky, 300, {});
    else {
      if (!ai.route || now - ai.routeAt > 3) { ai.route = planRoute(world, v.x, v.y, kx, ky); ai.routeAt = now; }
      while (ai.route.length > 1 && Math.hypot(ai.route[0].x - v.x, ai.route[0].y - v.y) < 60) ai.route.shift();
      driveToward(world, v, ai.route[0].x, ai.route[0].y, 480, {});
    }
    return;
  }
  // on foot: run them down, tase them, cuff them
  for (const c of crew) {
    if (c.vehId) continue;
    const d = Math.hypot(t.x - c.x, t.y - c.y), stunned = now < t.stunUntil || now < t.downUntil;
    let inp;
    if (stunned && d < 30) { law.arrest(world, c, t); inp = { bits: 0, mx: 0, my: 0, aim: 0 }; }
    else if (!seen && d > 250) inp = seek(c, kx, ky, true);
    else {
      inp = seek(c, t.x, t.y, true);
      inp.aim = Math.atan2(t.y - c.y, t.x - c.x); inp.bits |= IN.AIMING;
      if (d < 150 && !stunned && now > (c.npc.nextTase || 0) && world.map.los(c.x, c.y, t.x, t.y)) { c.weapon = 'taser'; inp.bits |= IN.FIRE; c.npc.nextTase = now + 2.5; }
      if (d < 24) { inp.mx *= 0.2; inp.my *= 0.2; }
    }
    if (now >= c.downUntil && now >= c.stunUntil) {
      pedStep(c, inp, dt, world.map, players.pedMods(world, c));
      if (inp.bits & IN.FIRE) combat.tryAttack(world, c, inp.aim);
    }
  }
}

// ---- a crime a player saw and called in (law.js reportSaw) -----------------------------------------------------------
// A few seconds after the call one squad car comes to where the caller was, no siren, and looks round for the suspect
// they described: in sight and close enough, in the same clothes (or the same car they were seen in), and the officer
// knows them (law.calledIn: stars by what they did) - from there it's the usual chase. Nobody matching about for
// REPORT_SEARCH_S after it gets there, and it drives off. It never goes after anyone else.
const CALL_DELAY_S = 8;
export function reportUnit(world, caller, saw) {
  (world.witnessCalls ||= []).push({ at: world.time + CALL_DELAY_S, caller: caller.pid, suspect: saw.suspect, type: saw.type, key: saw.key, veh: saw.veh, x: saw.x, y: saw.y });
}
function witnessCalls(world) {
  const now = world.time, keep = [];
  for (const c of world.witnessCalls) {
    if (c.at > now) { keep.push(c); continue; }
    const caller = world.players.get(c.caller);
    const n = spawnPoint(world, { ped: caller && caller.ped ? caller.ped : { x: c.x, y: c.y } }, c.x, c.y, { at: { x: c.x, y: c.y }, minD: 600, maxD: 1200, clearPx: 420 });
    if (!n) { if (now - c.at < 20) keep.push(c); continue; }   // (nowhere out of sight to come from yet: in a moment)
    const v = world.spawnVehicle('police', n.x + 32, n.y + 32, Math.atan2(c.y - n.y, c.x - n.x), {});
    v.despawnable = false;
    for (let i = 0; i < 2; i++) {
      const cop = spawnNpc(world, 'cop', v.x, v.y, 'cop');
      cop.npc.unit = v.id; cop.vehId = v.id; cop.seat = i; v.seats[i] = cop.id;
      armCop(cop, 1, false);
    }
    v.ai = { kind: 'police', target: null, call: { ...c, arrived: 0 }, mode: 'drive', route: null, routeAt: 0, swat: false, since: now };
    world.police.add(v.id);
  }
  world.witnessCalls = keep;
}
// does this unit see the suspect it was called about?
function spots(world, v, call, crew) {
  const sp = world.players.get(call.suspect), t = sp && sp.ped;
  if (!t || t.dead || t.hidden || !!t.sub) return null;
  const car = t.vehId ? world.get(t.vehId) : null;
  const match = car ? !!call.veh && `${car.def.id}|${car.paint}` === call.veh : law.outfitKey(t) === call.key;
  if (!match) return null;
  const eyes = [v, ...crew.filter((c) => !c.vehId)];
  return eyes.some((e) => Math.hypot(t.x - e.x, t.y - e.y) < REPORT_SPOT_PX && world.map.los(e.x, e.y, t.x, t.y)) ? sp : null;
}
function runCallUnit(world, v, crew, dt) {
  const ai = v.ai, call = ai.call, now = world.time;
  v.sirenOn = false;
  const caller = world.players.get(call.caller);
  if (world.tick % 10 === v.id % 10) {
    const sp = spots(world, v, call, crew);
    if (sp) {
      law.calledIn(world, sp, call, caller);
      ai.call = null; ai.target = sp.pid; v.sirenOn = true;   // (the usual chase from here: runUnit)
      return;
    }
  }
  if (!call.arrived && Math.hypot(call.x - v.x, call.y - v.y) < 260) call.arrived = now;
  if (v.wreckAt || (call.arrived && now - call.arrived > REPORT_SEARCH_S) || now - ai.since > REPORT_SEARCH_S + 60) {
    if (caller && !call.told) { call.told = true; world.notify(caller, '911: "The officer took a look round but couldn\'t see anyone matching your description."', 'info'); }
    standDown(world, v, crew, dt);
    return;
  }
  // drive to the caller, then cruise slowly round the spot looking
  const driver = v.seats[0] ? world.get(v.seats[0]) : null;
  if (!driver) { standDown(world, v, crew, dt); return; }
  const a = now * 0.35 + v.id, r = call.arrived ? 220 : 0;
  const kx = call.x + Math.cos(a) * r, ky = call.y + Math.sin(a) * r;
  if (!ai.route || now - ai.routeAt > 3) { ai.route = planRoute(world, v.x, v.y, kx, ky); ai.routeAt = now; }
  while (ai.route.length > 1 && Math.hypot(ai.route[0].x - v.x, ai.route[0].y - v.y) < 60) ai.route.shift();
  const wp = ai.route[0] || { x: kx, y: ky };
  driveToward(world, v, wp.x, wp.y, call.arrived ? 160 : 420, {});
}

function runUnit(world, v, dt) {
  const ai = v.ai;
  if (!ai || ai.kind !== 'police') { world.police.delete(v.id); v.despawnable = true; return; }
  if (ai.npcTarget || ai.call) {
    const crew = [];
    for (const e of world.entities.values()) if (e.kind === K.PED && e.npc && e.npc.unit === v.id && !e.dead) crew.push(e);
    if (ai.call) runCallUnit(world, v, crew, dt); else runNpcUnit(world, v, crew, dt);
    return;
  }
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
