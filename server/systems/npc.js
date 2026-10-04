// Pedestrian AI (GDD §10): demographic spawning around players, sidewalk wandering,
// reflex dive-roll evasion, fight-or-flight temperaments, syndicate gangs in turf,
// passed-out boozers, rain umbrellas, and the Snatch-and-Grab street event (§12).
import { K, T, WEATHER } from '../../shared/constants.js';
import { IN } from '../../shared/input.js';
import { pedStep } from '../../shared/physics.js';
import { isTurf, PED_BLOCK, isSwimming, nearestLand } from '../../shared/map.js';
import { mulberry32 } from '../../shared/rng.js';
import { ARCHETYPES, makeAppearance, BUILDS, rollBuild } from '../entities.js';
import * as players from './players.js';
import * as combat from './combat.js';
import * as law from './law.js';
import * as events from './events.js';
import * as gangwar from './gangwar.js';
import * as cargo from './cargo.js';
import * as vehicles from './vehicles.js';

const WALK_TILES = new Set([T.SIDEWALK, T.PLAZA, T.LOT, T.GRASS, T.DOCK, T.SAND, T.DIRT, T.FLOOR]); // FLOOR: people browse the shops too
const PREFERRED = new Set([T.SIDEWALK, T.PLAZA]);
const CIV_TARGET_DAY = 30, CIV_TARGET_NIGHT = 20;
const NO_INPUT = { bits: 0, mx: 0, my: 0, aim: 0 };
let rng = mulberry32(99);

export function spawnNpc(world, archetype, x, y, role = 'civ') {
  const a = ARCHETYPES[archetype] || ARCHETYPES.casual;
  const bi = rollBuild(rng, archetype);
  const b = BUILDS[bi];
  const app = makeAppearance(rng, archetype);
  app.bd = bi;
  const hp = Math.round(a.hp * b.hp * (0.9 + rng() * 0.2));
  const ped = world.spawnPed(x, y, { hp, app, archetype, a: rng() * Math.PI * 2 });
  ped.build = b;
  ped.npc = {
    role, archetype, state: 'wander', target: 0, until: 0, wx: x, wy: y, nextThink: 0,
    reflex: a.reflex, fight: Math.max(0, Math.min(1, a.fight + b.fight)), speed: a.speed * (bi === 3 ? 0.92 : bi === 0 ? 0.95 : 1), sway: !!a.sway, flagged: false, keep: false,
    lastDiveCheck: 0, diveCooldown: 0,
  };
  if (a.armed) { ped.weapon = a.armed; }
  world.npcCount++;
  return ped;
}

export function despawnNpc(world, ped) {
  world.remove(ped);
  world.bodies.delete(ped);
  world.npcCount = Math.max(0, world.npcCount - 1);
}

// Steering helper used by every NPC role.
export function seek(ped, tx, ty, run = false, speedScale = 1) {
  const dx = tx - ped.x, dy = ty - ped.y;
  const d = Math.hypot(dx, dy) || 1;
  const s = Math.min(1, d / 24) * speedScale;
  return { bits: run ? IN.SPRINT : 0, mx: (dx / d) * s, my: (dy / d) * s, aim: Math.atan2(dy, dx) };
}

function walkMods(world, ped, factor) {
  const m = players.pedMods(world, ped);
  m.speedMul *= ped.npc.speed * factor;
  return m;
}

export function update(world, dt) {
  const now = world.time;
  if (world.tick % 10 === 0) manageDensity(world);
  if (world.tick % 20 === 5) snatchEvent(world);
  const rain = world.weather === WEATHER.RAIN;
  for (const ped of world.entities.values()) {
    if (ped.kind !== K.PED || !ped.npc || ped.dead || ped.vehId) continue;
    const n = ped.npc;
    if (n.desk) { // shop / desk staff stay behind their counter
      const dd = Math.hypot(ped.x - n.desk.x, ped.y - n.desk.y);
      if (dd > 6) pedStep(ped, seek(ped, n.desk.x, n.desk.y, false), dt, world.map, walkMods(world, ped, 0.5));
      else { ped.vx = 0; ped.vy = 0; ped.a = n.desk.a + Math.sin(now * 0.4 + ped.id) * 0.25; }
      continue;
    }
    if (n.role === 'driver') { n.role = 'civ'; n.state = 'wander'; } // a driver left on foot (car gone) walks off
    if (n.role === 'cop' && !n.war && !n.shootout) {
      const u = n.unit ? world.get(n.unit) : null;
      if (!u || u.removed) { n.unit = 0; n.beat = true; } // lost their unit: walk the beat instead of freezing
    }
    if ((n.role === 'cop' && !n.beat) || n.role === 'medic') continue; // other systems drive these
    if (now < ped.downUntil || now < ped.stunUntil) continue;
    if (n.state === 'passed') { ped.vx = 0; ped.vy = 0; continue; }
    // ended up in the water (thrown from a car, knocked off a dock): swim for the nearest shore
    if (isSwimming(world.map, ped)) {
      if (!n.shore || now > (n.shoreAt || 0)) { n.shore = nearestLand(world.map, ped.x, ped.y); n.shoreAt = now + 2; }
      if (n.shore) { pedStep(ped, seek(ped, n.shore.x, n.shore.y, true), dt, world.map, walkMods(world, ped, 1)); continue; }
    }
    if (n.role === 'civ' || n.role === 'mugger') checkDive(world, ped, now);
    let inp = NO_INPUT, factor = 0.55;
    switch (n.state) {
      case 'wander': inp = wander(world, ped, now); factor = rain && !ped.umbrella ? 0.85 : 0.55; break;
      case 'idle': inp = idle(world, ped, now); break;
      case 'flee': {
        const fx = n.fx ?? ped.x, fy = n.fy ?? ped.y;
        const away = Math.atan2(ped.y - fy, ped.x - fx) + (n.fleeBias || 0);
        const tx = ped.x + Math.cos(away) * 80, ty = ped.y + Math.sin(away) * 80;
        if (PED_BLOCK[world.map.tileAtPx(tx, ty)]) n.fleeBias = (n.fleeBias || 0) + 0.6;
        inp = seek(ped, tx, ty, true);
        factor = 1;
        if (now > n.until) { n.state = 'wander'; n.fleeBias = 0; }
        break;
      }
      case 'fight': inp = fight(world, ped, now); factor = 1; break;
      case 'mug': inp = mugRun(world, ped, now); factor = 1; break;
      case 'waitHelp': {
        if (now > n.until) { n.state = 'wander'; n.keep = false; n.robbed = false; }
        inp = NO_INPUT;
        break;
      }
      default: n.state = 'wander';
    }
    if (n.sway && (inp.mx || inp.my)) { const s = Math.sin(now * 3 + ped.id) * 0.6; const mx = inp.mx, my = inp.my; inp = { ...inp, mx: mx - my * s, my: my + mx * s }; }
    pedStep(ped, inp, dt, world.map, walkMods(world, ped, factor));
    if (inp.bits & IN.FIRE) combat.tryAttack(world, ped, inp.aim);
    ped.umbrella = rain && n.umbrellaType && n.state === 'wander';
  }
}

function wander(world, ped, now) {
  const n = ped.npc;
  const d = Math.hypot(n.wx - ped.x, n.wy - ped.y);
  if (d < 10 || now > n.until) {
    if (rng() < 0.2 && !onRoad(world, ped)) { n.state = 'idle'; n.until = now + 2 + rng() * 5; n.lookAt = now; return NO_INPUT; }
    pickWaypoint(world, ped);
    n.until = now + 8;
    if (Math.hypot(n.wx - ped.x, n.wy - ped.y) < 10) { n.state = 'idle'; n.until = now + 1 + rng() * 2; n.lookAt = now; return NO_INPUT; }
  }
  return seek(ped, n.wx, n.wy, false);
}

const onRoad = (world, ped) => { const t = world.map.tileAtPx(ped.x, ped.y); return t === T.ROAD || t === T.BRIDGE; };

// Standing around: glance one way, then another, then wander off somewhere new (never just
// frozen in place, and never loitering in the middle of the road).
function idle(world, ped, now) {
  const n = ped.npc;
  if (onRoad(world, ped)) { n.state = 'wander'; n.until = 0; return NO_INPUT; }
  if (now >= (n.lookAt || 0)) {
    ped.a += (rng() < 0.5 ? -1 : 1) * (0.6 + rng() * 1.6);
    n.lookAt = now + 0.8 + rng() * 1.6;
  }
  if (now > n.until) {
    n.state = 'wander';
    n.until = 0;
    n.awayFrom = ped.a + Math.PI; // head off somewhere other than where they were looking last
  }
  return NO_INPUT;
}

function pickWaypoint(world, ped) {
  const n = ped.npc;
  // pedestrians far from every player meander back toward them (keeps visible streets lively)
  let towards = null;
  if (n.role === 'civ' && rng() < 0.6) {
    let bd = Infinity;
    for (const p of world.players.values()) {
      if (!p.ped || p.ped.dead) continue;
      const d = Math.hypot(p.ped.x - ped.x, p.ped.y - ped.y);
      if (d < bd) { bd = d; towards = p.ped; }
    }
    if (bd < 520) towards = null;
  }
  // standing in the street: head for the nearest pavement first
  if (onRoad(world, ped)) {
    for (let r = 32; r <= 160; r += 32) for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2, x = ped.x + Math.cos(a) * r, y = ped.y + Math.sin(a) * r;
      if (WALK_TILES.has(world.map.tileAtPx(x, y))) { n.wx = x; n.wy = y; return; }
    }
  }
  const away = n.awayFrom; n.awayFrom = undefined;
  for (let k = 0; k < 14; k++) {
    const ang = towards && k < 6 ? Math.atan2(towards.y - ped.y, towards.x - ped.x) + (rng() - 0.5) * 1.6
      : away !== undefined && k < 6 ? away + (rng() - 0.5) * 2 : rng() * Math.PI * 2;
    const dist = 64 + rng() * 180;
    const x = ped.x + Math.cos(ang) * dist, y = ped.y + Math.sin(ang) * dist;
    const t = world.map.tileAtPx(x, y);
    if (!WALK_TILES.has(t)) continue;
    if (!PREFERRED.has(t) && rng() < 0.6) continue;
    if (!crossesRoadOk(world, ped.x, ped.y, x, y)) continue;
    if (world.map.rayTiles(ped.x, ped.y, x, y) < 1) continue;
    n.wx = x; n.wy = y;
    return;
  }
  n.wx = ped.x; n.wy = ped.y;
}

function crossesRoadOk(world, x1, y1, x2, y2) {
  for (let i = 1; i <= 6; i++) {
    const t = world.map.tileAtPx(x1 + (x2 - x1) * i / 6, y1 + (y2 - y1) * i / 6);
    if (t === T.ROAD || t === T.BRIDGE) return rng() < 0.12; // jaywalk occasionally
    if (PED_BLOCK[t]) return false;
  }
  return true;
}

// GDD: speeding vehicles project a threat box; NPC reflex attribute decides the dive roll.
function checkDive(world, ped, now) {
  const n = ped.npc;
  if (ped.rollT > 0 || now < n.diveCooldown || (world.tick + ped.id) % 2) return;
  for (const v of world.query(ped.x, ped.y, 260, K.VEH)) {
    const sp = Math.hypot(v.vx, v.vy);
    if (sp < 170) continue;
    const c = Math.cos(v.a), s = Math.sin(v.a);
    const sign = (v.vx * c + v.vy * s) >= 0 ? 1 : -1;
    const dx = ped.x - v.x, dy = ped.y - v.y;
    const lx = (dx * c + dy * s) * sign, ly = -dx * s + dy * c;
    if (lx < v.def.L / 2 - 4 || lx > v.def.L / 2 + sp * 0.75) continue;
    if (Math.abs(ly) > v.def.W / 2 + 22) continue;
    n.diveCooldown = now + 2.5;
    if (rng() < n.reflex) {
      const side = ly >= 0 ? 1 : -1;
      const ax = -s * side, ay = c * side;
      ped.prevBits = 0;
      pedStep(ped, { bits: IN.DIVE, mx: ax, my: ay, aim: ped.a }, 0.0001, world.map, walkMods(world, ped, 1));
      world.emit(ped.x, ped.y, { e: 'yelp', x: ped.x, y: ped.y });
    }
    return;
  }
}

function fight(world, ped, now) {
  const n = ped.npc;
  const t = world.get(n.target);
  if (!t || t.dead || now > n.until || Math.hypot(t.x - ped.x, t.y - ped.y) > 650) { n.state = 'wander'; n.target = 0; return NO_INPUT; }
  const d = Math.hypot(t.x - ped.x, t.y - ped.y);
  const aim = Math.atan2(t.y - ped.y, t.x - ped.x);
  if (t.vehId) {
    const v = world.get(t.vehId);
    // GDD: angry drivers pull the player back out of the seat and beat them up
    if (v && d < v.def.L / 2 + 20 && Math.hypot(v.vx, v.vy) < 40 && n.role !== 'gang' && !n.exCop && now - (n.draggedAt || -99) > 6) {
      n.draggedAt = now;
      vehicles.ejectPed(world, t, true);
      t.downUntil = now + 0.8;
      if (t.player) world.notify(t.player, 'You got dragged out of the car!', 'bad');
      return NO_INPUT;
    }
  }
  const armed = ped.weapon !== 'fists' && ped.weapon !== 'bat';
  if (armed) {
    const inp = d > 170 ? seek(ped, t.x, t.y, true) : { bits: 0, mx: 0, my: 0, aim };
    if (d < 380 && world.map.los(ped.x, ped.y, t.x, t.y)) { inp.bits |= IN.FIRE | IN.AIMING; inp.aim = aim; }
    return inp;
  }
  const inp = seek(ped, t.x, t.y, true);
  if (d < 26 + t.r) { inp.bits |= IN.FIRE | IN.AIMING; inp.aim = aim; inp.mx *= 0.2; inp.my *= 0.2; }
  return inp;
}

// ---- event hooks -----------------------------------------------------------
export function onAttacked(world, ped, attacker) {
  if (!ped.npc || ped.dead || !attacker || attacker === ped) return;
  const n = ped.npc;
  if (n.desk) { // staff behind a counter: a desk cop fights back, everyone else runs
    n.desk = null; n.keep = false;
    if (n.role === 'cop') { ped.weapon = 'pistol'; startFight(world, ped, attacker, 30); } else flee(world, ped, attacker.x, attacker.y, 10);
    return;
  }
  if (n.role === 'cop' && attacker.npc && attacker.npc.role === 'gang') { gangwar.copAttackedByGang(world, ped, attacker); return; }
  if (n.role === 'cop' || n.role === 'medic') return;
  if (n.state === 'passed') { ped.passedOut = false; n.state = 'flee'; n.fx = attacker.x; n.fy = attacker.y; n.until = world.time + 6; return; }
  if (n.role === 'mugger') { onMuggerDowned(world, ped); flee(world, ped, attacker.x, attacker.y, 8); return; }
  if (n.role === 'gang') { startFight(world, ped, attacker, 30); gangAlert(world, attacker); return; }
  if (n.state === 'fight' && n.target === attacker.id) return;
  if (rng() < n.fight) startFight(world, ped, attacker, 14);
  else flee(world, ped, attacker.x, attacker.y, 6);
}

export function onCarjacked(world, driver, jacker) {
  if (!driver.npc) return;
  driver.npc.role = 'civ';
  // GDD: random temperament check — 50% flee screaming, 50% fight back
  if (rng() < 0.5) { flee(world, driver, jacker.x, jacker.y, 7); world.emit(driver.x, driver.y, { e: 'scream', x: driver.x, y: driver.y }); }
  else startFight(world, driver, jacker, 16);
}

export function onVehicleHit(world, v, attacker) {
  if (!v.ai) return;
  v.ai.panicUntil = world.time + 10; // drive frantic and panicked
  void attacker;
}

export function onGunfire(world, x, y, shooter) {
  world.shotLog.push({ x, y, t: world.time });
  if (world.shotLog.length > 64) world.shotLog.splice(0, world.shotLog.length - 64);
  for (const e of world.query(x, y, 360, K.PED)) {
    if (!e.npc || e.dead || e === shooter) continue;
    const n = e.npc;
    if (n.role === 'gang') {
      if (gangwar.isCopPed(shooter) && n.state !== 'fight') { gangwar.provoke(world, shooter, e.x, e.y, 'shots fired near them'); continue; }
      if (isTurf(e.x, e.y) && shooter && shooter.player && !aligned(shooter.player)) startFight(world, e, shooter, 25);
      continue;
    }
    if (n.role !== 'civ' || n.state === 'fight' || n.state === 'passed') continue;
    flee(world, e, x, y, 5 + rng() * 3);
  }
}

export function onDeath(world, ped, attacker) {
  const n = ped.npc;
  if (!n) return;
  const a = ARCHETYPES[n.archetype] || ARCHETYPES.casual;
  // not everyone carries cash: well-off types usually do, seniors and drunks often don't
  const carries = { executive: 0.9, socialite: 0.85, hustler: 0.8, syndicate: 0.75, casual: 0.55, construction: 0.5, athlete: 0.35, sweeper: 0.4, senior: 0.45, drunk: 0.3, mugger: 0.7 }[n.archetype] ?? 0.5;
  const cash = a.cash && rng() < carries ? Math.max(1, Math.round(a.cash[0] + rng() * (a.cash[1] - a.cash[0]))) : 0;
  let item = a.item && rng() < a.item[1] ? a.item[0] : null;
  if (n.hasPurse) { item = 'purse'; n.hasPurse = false; }
  cargo.npcDrop(world, ped, cash, item);
  n.state = 'dead';
  void attacker;
}

export function startFight(world, ped, target, secs) {
  if (target.npc && target.npc.role === ped.npc.role && ped.npc.role === 'gang') return;
  ped.npc.state = 'fight'; ped.npc.target = target.id; ped.npc.until = world.time + secs;
}
function flee(world, ped, fx, fy, secs) {
  const n = ped.npc;
  n.state = 'flee'; n.fx = fx; n.fy = fy; n.until = world.time + secs;
}

function aligned(p) { return p.profile.criminalExp >= 200 && !p.badge; }

// Syndicate territory defense force (GDD §4B, §7)
export function gangAlert(world, perp) {
  if (!perp) return;
  for (const e of world.query(perp.x, perp.y, 650, K.PED)) {
    if (e.npc && e.npc.role === 'gang' && !e.dead) startFight(world, e, perp, 30);
  }
  if (perp.player) { perp.player.gangHostileUntil = world.time + 120; world.notify(perp.player, 'The Syndicate marked you as an enemy in their turf!', 'bad'); }
}

// ---- density management ------------------------------------------------------
function manageDensity(world) {
  const night = world.clock.isNight;
  let nc = 0;
  for (const e of world.entities.values()) if (e.kind === K.PED && e.npc && !e.dead) nc++;
  world.npcCount = nc;
  const anchors = [];
  for (const p of world.players.values()) if (p.ped && !p.ped.dead) anchors.push(p.ped);
  // despawn far NPCs
  for (const e of world.entities.values()) {
    if (e.kind !== K.PED || !e.npc || e.vehId) continue;
    if (e.npc.keep || (e.npc.role === 'cop' && !e.npc.beat) || e.npc.role === 'medic' || e.npc.role === 'driver') continue;
    let near = false;
    for (const a of anchors) if ((a.x - e.x) ** 2 + (a.y - e.y) ** 2 < 1500 * 1500) { near = true; break; }
    if (!near && !(e.dead && world.bodies.has(e))) despawnNpc(world, e);
  }
  if (world.npcCount >= world.npcBudget * 0.6) return;
  const target = night ? CIV_TARGET_NIGHT : CIV_TARGET_DAY;
  for (const a of anchors) {
    let count = 0;
    for (const e of world.query(a.x, a.y, 1000, K.PED)) if (e.npc && !e.dead) count++;
    if (count >= target) continue;
    for (let tries = 0; tries < 6; tries++) {
      const ang = rng() * Math.PI * 2, d = 600 + rng() * 300;
      const x = a.x + Math.cos(ang) * d, y = a.y + Math.sin(ang) * d;
      const t = world.map.tileAtPx(x, y);
      if (!WALK_TILES.has(t) || t === T.DIRT) continue;
      let tooClose = false;
      for (const b of anchors) if ((b.x - x) ** 2 + (b.y - y) ** 2 < 580 * 580) { tooClose = true; break; }
      if (tooClose) continue;
      spawnByDemographic(world, x, y, night);
      break;
    }
  }
}

function spawnByDemographic(world, x, y, night) {
  if (isTurf(x, y) && rng() < (night ? 0.75 : 0.45)) {
    const g = spawnNpc(world, 'syndicate', x, y, 'gang');
    return g;
  }
  const entries = Object.entries(ARCHETYPES).filter(([, a]) => (night ? a.night : a.day) > 0);
  let total = 0;
  // GDD: night shifts spawning toward shady criminal profiles (+300%)
  const weight = (k, a) => (night && (k === 'hustler' || k === 'drunk') ? (a.night * 3) : (night ? a.night : a.day));
  for (const [k, a] of entries) total += weight(k, a);
  let r = rng() * total;
  for (const [k, a] of entries) {
    r -= weight(k, a);
    if (r <= 0) {
      const ped = spawnNpc(world, k, x, y, 'civ');
      if (k === 'drunk' && rng() < 0.5) { ped.npc.state = 'passed'; ped.downUntil = 0; ped.passedOut = true; }
      ped.npc.umbrellaType = k !== 'gang' && k !== 'drunk' && k !== 'athlete' && k !== 'construction' && rng() < 0.75;
      return ped;
    }
  }
  return null;
}

// ---- Snatch-and-grab (GDD §12) ---------------------------------------------------
export function snatchEvent(world, force = null) {
  world.nextSnatch ??= world.time + 40;
  if (world.time < world.nextSnatch && !force) return;
  world.nextSnatch = world.time + 70 + rng() * 60;
  const online = [...world.players.values()].filter((p) => p.conn && p.ped && !p.ped.dead);
  if (!online.length) return;
  const p = force || online[Math.floor(rng() * online.length)];
  if (force && !online.includes(force)) return;
  let victims = world.query(p.ped.x, p.ped.y, 650, K.PED).filter((e) => e.npc && e.npc.role === 'civ' && !e.dead && (e.npc.archetype === 'socialite' || e.npc.archetype === 'executive') && e.npc.state === 'wander');
  if (!victims.length && force) { const sp = spawnNpc(world, 'socialite', p.ped.x + 160, p.ped.y, 'civ'); victims = [sp]; }
  if (!victims.length) return;
  const victim = victims[Math.floor(rng() * victims.length)];
  const ang = rng() * Math.PI * 2;
  let sx = victim.x + Math.cos(ang) * 260, sy = victim.y + Math.sin(ang) * 260;
  if (PED_BLOCK[world.map.tileAtPx(sx, sy)]) { sx = victim.x - Math.cos(ang) * 200; sy = victim.y - Math.sin(ang) * 200; }
  if (PED_BLOCK[world.map.tileAtPx(sx, sy)]) return;
  const m = spawnNpc(world, 'mugger', sx, sy, 'mugger');
  m.npc.state = 'mug'; m.npc.target = victim.id; m.npc.until = world.time + 40; m.npc.keep = true;
  victim.npc.keep = true;
}

function mugRun(world, ped, now) {
  const n = ped.npc;
  if (!n.hasPurse) {
    const v = world.get(n.target);
    if (!v || v.dead) { n.state = 'flee'; n.until = now + 10; return NO_INPUT; }
    if (Math.hypot(v.x - ped.x, v.y - ped.y) < 22) {
      n.hasPurse = true; n.flagged = true; n.until = now + 45;
      ped.flareUntil = now + 3;
      v.npc.state = 'waitHelp'; v.npc.until = now + 150; v.npc.robbed = true; v.npc.keep = true; v.npc.robbedBy = ped.id;
      v.a = Math.atan2(ped.y - v.y, ped.x - v.x);
      world.emit(v.x, v.y, { e: 'scream', x: v.x, y: v.y });
      law.logDispatch(world, 'mugging', v.x, v.y, null, 1, 'witness');
      for (const p of world.players.values()) if (p.ped && Math.hypot(p.ped.x - v.x, p.ped.y - v.y) < 900) world.notify(p, 'Snatch-and-grab! A mugger grabbed a purse - stop them (no penalty).', 'warn');
      events.add(world, { kind: 'snatch', x: ped.x, y: ped.y, thief: ped.id, victim: v.id, until: now + 150 });
      n.fx = v.x; n.fy = v.y;
      return NO_INPUT;
    }
    return seek(ped, v.x, v.y, true);
  }
  if (now > n.until) { n.keep = false; n.state = 'wander'; return NO_INPUT; }
  const away = Math.atan2(ped.y - n.fy, ped.x - n.fx) + Math.sin(now + ped.id) * 0.5;
  let tx = ped.x + Math.cos(away) * 90, ty = ped.y + Math.sin(away) * 90;
  if (PED_BLOCK[world.map.tileAtPx(tx, ty)]) { n.fx = ped.x + Math.cos(away + 1.5) * 50; n.fy = ped.y + Math.sin(away + 1.5) * 50; tx = ped.x - Math.cos(away) * 50; ty = ped.y - Math.sin(away) * 50; }
  return seek(ped, tx, ty, true);
}

// Mugger knocked down -> drops the purse as loot
export function onMuggerDowned(world, ped) {
  if (ped.npc && ped.npc.hasPurse) {
    ped.npc.hasPurse = false;
    cargo.npcDrop(world, ped, 0, 'purse');
  }
}

export function nearestRobbedVictim(world, ped) {
  for (const e of world.query(ped.x, ped.y, 48, K.PED)) if (e.npc && e.npc.robbed && !e.dead) return e;
  return null;
}

