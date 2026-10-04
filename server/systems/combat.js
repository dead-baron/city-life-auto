// Combat: melee arcs, hitscan ballistics, tasers, rockets, damage, death, bleeding,
// regeneration and blood-trail footprints (GDD §14C combat feedback).
import { K, T, WEATHER, PED_RADIUS } from '../../shared/constants.js';
import { isSwimming, SWIM_BLOCK } from '../../shared/map.js';
import { collideCircle, AIR_FRICTION, TUMBLE_FRICTION } from '../../shared/physics.js';
import { levelStep, sameLevel } from '../../shared/levels.js';
import { WEAPONS } from '../../shared/items.js';
import { NPC_GUN_MULT, ARMORED_VEHICLES, ARMORED_ROCKETS } from '../../shared/rules.js';
import { angleDiff, segCircle, segObb } from '../../shared/math.js';
import * as players from './players.js';
import * as vehicles from './vehicles.js';
import * as cargo from './cargo.js';
import * as props from './props.js';
import * as law from './law.js';
import * as npc from './npc.js';

const DRY_CONCRETE = new Set([T.SIDEWALK, T.PLAZA, T.LOT, T.DOCK]);

function ammoOf(ped, id) {
  if (!ped.player) return 9999;
  return ped.player.profile.weapons[id] || 0;
}

export function tryAttack(world, ped, aim) {
  const now = world.time;
  if (ped.dead || now < ped.nextAttack || now < ped.reloadUntil || now < ped.stunUntil || now < ped.downUntil) return false;
  if (ped.hidden || now < (ped.protectUntil || 0)) return false; // spawn / step-out protection: no shooting
  if (ped.rollT > 0) return false;
  if (!ped.vehId && isSwimming(world.map, ped)) return false; // can't fight while swimming
  const w = WEAPONS[ped.weapon] || WEAPONS.fists;
  if (w.type === 'tool') return false;
  ped.a = ped.vehId ? ped.a : aim;
  ped.quietWeapon = !!(w.silenced || w.quiet); // knives and suppressors: kills are only noticed by people who actually see them
  if (w.type === 'melee') return melee(world, ped, w, aim);
  if (w.mag) {
    const inMag = ped.player ? (ped.mag[w.id] || 0) : 99;
    if (inMag <= 0) {
      if (ammoOf(ped, w.id) > 0) reload(world, ped);
      else if (ped.player && now > (ped.dryClickAt || 0)) { ped.dryClickAt = now + 1; world.notify(ped.player, `Out of ${w.name} ammo.`, 'warn'); }
      return false;
    }
  }
  ped.nextAttack = now + w.cd;
  ped.attackAnimUntil = now + 0.15;
  if (ped.player && w.mag) {
    ped.mag[w.id]--;
    ped.player.profile.weapons[w.id] = Math.max(0, (ped.player.profile.weapons[w.id] || 0) - 1);
    ped.player.meDirty = true;
  }
  if (w.type === 'rocket') {
    const sx = ped.x + Math.cos(aim) * 20, sy = ped.y + Math.sin(aim) * 20;
    const proj = world.spawnProjectile(ped.id, sx, sy, aim, 560, w.range, w.id);
    if (proj) proj.lz = ped.lz || 0;
    world.emit(sx, sy, { e: 'shot', x1: sx, y1: sy, x2: sx, y2: sy, w: w.i });
    law.gunfire(world, ped);
    npc.onGunfire(world, ped.x, ped.y, ped);
    return true;
  }
  if (w.type === 'taser') { taser(world, ped, w, aim); return true; }
  const pellets = w.pellets || 1;
  let hitAny = false;
  for (let k = 0; k < pellets; k++) {
    const a = aim + (world.rand() - 0.5) * 2 * (w.spread || 0);
    if (hitscan(world, ped, w, a)) hitAny = true;
  }
  if (w.silenced) npc.onGunfire(world, ped.x, ped.y, ped, 70); // a suppressor's cough: only people right there notice
  else { law.gunfire(world, ped, hitAny); npc.onGunfire(world, ped.x, ped.y, ped); }
  return true;
}

function melee(world, ped, w, aim) {
  const now = world.time;
  // NPC brawlers wind up slower than players, so footwork and combos can beat a bigger guy
  ped.nextAttack = now + w.cd * (ped.player ? 1 : 1.45);
  ped.attackAnimUntil = now + 0.3;
  ped.swingSide = (ped.swingSide || 0) ^ 1;
  let best = null, bestD = Infinity;
  for (const o of world.query(ped.x, ped.y, w.range + 14, K.PED)) {
    if (o === ped || o.dead || o.vehId || !!o.sub !== !!ped.sub || !sameLevel(o.lz, ped.lz)) continue; // the subway / the highway deck is another level
    const d = Math.hypot(o.x - ped.x, o.y - ped.y);
    if (d > w.range + o.r) continue;
    if (Math.abs(angleDiff(aim, Math.atan2(o.y - ped.y, o.x - ped.x))) > w.arc / 2 && d > o.r + 4) continue;
    if (d < bestD) { bestD = d; best = o; }
  }
  world.emit(ped.x, ped.y, { e: 'swing', x: ped.x, y: ped.y, id: ped.id, side: ped.swingSide });
  if (!best) return true;
  const dir = Math.atan2(best.y - ped.y, best.x - ped.x);
  const poise = best.build ? best.build.poise : 1;
  const str = ped.build ? ped.build.str : 1;
  const push = (w.push || 170) * str / poise;
  best.vx += Math.cos(dir) * push; best.vy += Math.sin(dir) * push;
  best.flinchUntil = now + 0.25;
  // combos: landing hits in quick succession on the same target staggers then floors them
  // (3 hits, 4 for brutes / tough guys you out-muscle less), so a fist fight can actually be won
  if (ped.comboTarget === best.id && now - (ped.comboAt || 0) < 1.15) ped.combo = (ped.combo || 0) + 1;
  else ped.combo = 1;
  ped.comboTarget = best.id; ped.comboAt = now;
  const onGround = now < best.downUntil;
  const needed = poise >= 1.7 || best.player ? 4 : 3; // players get a little more poise
  let mult = str * (onGround ? 1.5 : 1);
  if (ped.combo >= needed && !onGround) {
    best.downUntil = now + 1.6 / Math.sqrt(poise);
    best.rollT = 0;
    mult *= 1.3;
    ped.combo = 0;
    world.emit(best.x, best.y, { e: 'knockdown', x: best.x, y: best.y, id: best.id });
  }
  if (w.knock) best.downUntil = now + 1.3;
  if (w.stunChance && world.rand() < w.stunChance) best.stunUntil = now + 2;
  if (w.bleed && world.rand() < 0.6) best.bleeding = true;
  world.emit(best.x, best.y, { e: 'hit', x: best.x, y: best.y, a: dir, id: best.id, w: w.i });
  if (w.id !== 'fists' || world.rand() < 0.35) world.emit(best.x, best.y, { e: 'blood', x: best.x, y: best.y, a: dir, n: w.id === 'fists' ? 2 : 6 });
  const floored = now < best.downUntil || now < best.stunUntil;
  // a knife from behind (or into someone who never saw it coming) kills outright
  if (w.backstab && !best.dead && backstabbable(world, ped, best)) { world.emit(best.x, best.y, { e: 'blood', x: best.x, y: best.y, a: dir, n: 10 }); damage(world, best, 9999, ped, 'melee', dir); return true; }
  damage(world, best, w.dmg * mult * (0.85 + world.rand() * 0.3), ped, w.nonLethal ? 'nonlethal' : 'melee', dir);
  if (floored) law.subdue(world, ped, best);
  return true;
}

function backstabbable(world, attacker, victim) {
  const fromVictim = Math.atan2(attacker.y - victim.y, attacker.x - victim.x);
  const behind = Math.abs(angleDiff(victim.a, fromVictim)) > 1.9;
  if (victim.player) return behind && world.time - (victim.lastCombatAt || -99) > 5; // players: only a true stab in the back
  const n = victim.npc;
  const unaware = !n || (n.state !== 'fight' && n.state !== 'flee' && n.state !== 'chase');
  return behind || (unaware && !(n && (n.role === 'cop' || n.role === 'gang')));
}

function taser(world, ped, w, aim) {
  const x2 = ped.x + Math.cos(aim) * w.range, y2 = ped.y + Math.sin(aim) * w.range;
  const target = traceTarget(world, ped, ped.x, ped.y, x2, y2, false);
  const ex = target ? target.x : x2, ey = target ? target.y : y2;
  world.emit(ped.x, ped.y, { e: 'taser', x1: ped.x, y1: ped.y, x2: ex, y2: ey });
  if (target && target.kind === K.PED) {
    target.stunUntil = world.time + w.stun;
    target.downUntil = world.time + w.stun;
    target.rollT = 0;
    damage(world, target, w.dmg, ped, 'nonlethal', aim);
    law.subdue(world, ped, target);
  }
}

// Returns the first ped or vehicle along the segment before any wall, or null.
function traceTarget(world, shooter, x1, y1, x2, y2, includeVehicles = true) {
  const sub = !!shooter.sub; // down in the subway the city's walls don't apply, only the tunnel's own level
  const tWall = sub ? 1 : world.map.rayTiles(x1, y1, x2, y2);
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
  const r = Math.hypot(x2 - x1, y2 - y1) / 2 + 80;
  let best = null, bestT = tWall;
  for (const e of world.query(mx, my, r)) {
    if (e === shooter || !!e.sub !== sub || !sameLevel(e.lz, shooter.lz)) continue;
    let t = -1;
    if (e.kind === K.PED) {
      if (e.dead || e.vehId || e.rollT > 0) continue;
      t = segCircle(x1, y1, x2, y2, e.x, e.y, e.r + 2);
    } else if (e.kind === K.VEH && includeVehicles) {
      if (shooter.vehId === e.id) continue;
      if (shooter.npc && (shooter.npc.coverCar === e.id || shooter.npc.unit === e.id)) continue; // cops fire over their own cruiser
      t = segObb(x1, y1, x2, y2, e.x, e.y, e.a, e.def.L / 2, e.def.W / 2);
    }
    if (t >= 0 && t < bestT) { bestT = t; best = e; }
  }
  if (best) best.hitT = bestT;
  return best || { kind: 0, hitT: tWall };
}

function hitscan(world, ped, w, a) {
  const x1 = ped.x + Math.cos(a) * 14, y1 = ped.y + Math.sin(a) * 14;
  const x2 = ped.x + Math.cos(a) * w.range, y2 = ped.y + Math.sin(a) * w.range;
  const hit = traceTarget(world, ped, x1, y1, x2, y2, true);
  const t = hit.hitT;
  const hx = x1 + (x2 - x1) * t, hy = y1 + (y2 - y1) * t;
  world.emit(x1, y1, { e: 'shot', x1, y1, x2: hx, y2: hy, w: w.i, h: hit.kind || 0 });
  if (hit.kind === K.PED) {
    world.emit(hx, hy, { e: 'blood', x: hx, y: hy, a, n: 9, g: 1 }); // g: a bullet - spray out the far side, splats on the ground
    if (world.rand() < 0.35) hit.bleeding = true;
    // guns are deadly against NPCs / police (1-3 shots); players keep more staying power; some
    // people are just harder to put down (grit)
    const mult = hit.player || !ped.player ? 1 : NPC_GUN_MULT / (hit.grit || 1); // your shots are deadly; NPC-vs-NPC gunfights last a while
    damage(world, hit, w.dmg * mult * (0.9 + world.rand() * 0.2), ped, 'gun', a);
    return true;
  }
  if (hit.kind === K.VEH) {
    world.emit(hx, hy, { e: 'spark', x: hx, y: hy });
    vehicles.damageVehicle(world, hit, w.dmg * 0.6, ped);
    // exposed riders on bikes take hits too
    if (hit.def.kind === 'bike' && hit.seats[0]) { const rider = world.get(hit.seats[0]); if (rider) damage(world, rider, w.dmg * 0.5, ped, 'gun', a); }
    if (hit.ai) npc.onVehicleHit(world, hit, ped);
    return true;
  }
  if (t < 1) world.emit(hx, hy, { e: 'spark', x: hx, y: hy });
  return false;
}

export function damage(world, ped, amount, attacker, cause, dir = 0) {
  if (!ped || ped.dead || amount <= 0) return false;
  const now = world.time;
  if (ped.hidden || now < (ped.protectUntil || 0)) return false; // indoors / spawn protection
  ped.hp -= amount;
  ped.lastHitAt = now;
  ped.lastCombatAt = now;
  if (attacker) { ped.lastHitBy = attacker.id; attacker.lastCombatAt = now; }
  if (ped.hp < ped.maxHp * 0.3 && cause !== 'nonlethal') ped.bleeding = true;
  if (ped.fishing && ped.player) { ped.fishing = null; }
  law.onDamage(world, attacker, ped, amount, cause);
  if (ped.player) ped.player.meDirty = true;
  if (cause === 'nonlethal' && ped.hp < 1) ped.hp = 1;
  if (ped.hp <= 0) { kill(world, ped, attacker, cause, dir); return true; }
  if (ped.npc) npc.onAttacked(world, ped, attacker);
  return false;
}

export function kill(world, ped, attacker, cause, dir = 0) {
  if (ped.dead) return;
  ped.dead = true;
  ped.deadAt = world.time;
  ped.hp = 0;
  ped.bleeding = false;
  ped.vx *= 0.3; ped.vy *= 0.3;
  if (ped.vehId) vehicles.ejectPed(world, ped, true);
  if (ped.carrying) cargo.dropCrate(world, ped);
  world.emit(ped.x, ped.y, { e: 'death', x: ped.x, y: ped.y, a: dir, id: ped.id });
  law.onKill(world, attacker, ped, cause);
  if (attacker && attacker.player) attacker.player.profile.stats.kills++;
  if (ped.player) {
    const by = attacker ? (attacker.player ? attacker.player.name : (attacker.name || 'a local')) : null;
    players.onPedDeath(world, ped, attacker, by ? `Taken out by ${by}.` : causeText(cause));
  } else {
    npc.onDeath(world, ped, attacker);
    world.bodies.add(ped);
  }
}

function causeText(cause) {
  return ({ train: 'Hit by a train.', vehicle: 'Flattened by traffic.', crash: 'Wiped out at speed.', explosion: 'Caught in an explosion.', bail: 'Bailed out too fast.' })[cause] || 'You flatlined.';
}

export function blast(world, x, y, r, dmg, attacker, excludeVehId = 0, rocket = false, z = null) {
  if (z === null || z < 0.3) props.blastBreak(world, x, y, r * 0.8);
  for (const e of world.query(x, y, r)) {
    if (z !== null && !sameLevel(e.lz, z)) continue; // up on the deck vs down in the street
    const d = Math.hypot(e.x - x, e.y - y);
    const f = 1 - d / r;
    if (f <= 0) continue;
    if (e.kind === K.PED && !e.dead && !e.vehId && !(e.blastSafeUntil > world.time)) {
      const a = Math.atan2(e.y - y, e.x - x);
      e.vx += Math.cos(a) * 300 * f; e.vy += Math.sin(a) * 300 * f;
      e.downUntil = world.time + 1.5;
      damage(world, e, dmg * f + 10, attacker, 'explosion', a);
    } else if (e.kind === K.VEH && e.id !== excludeVehId && !e.wreckAt) {
      const a = Math.atan2(e.y - y, e.x - x);
      e.vx += Math.cos(a) * 220 * f / e.def.mass; e.vy += Math.sin(a) * 220 * f / e.def.mass;
      // a rocket landing on / next to a vehicle destroys it outright (armored ones take two)
      if (rocket && f > 0.25) {
        const armored = ARMORED_VEHICLES.includes(e.def.id);
        vehicles.damageVehicle(world, e, armored ? e.def.hp / ARMORED_ROCKETS + 1 : e.hp + 1, attacker, true);
      } else vehicles.damageVehicle(world, e, dmg * 1.6 * f, attacker);
    } else if (e.kind === K.CRATE && e.state === 'ground') {
      const a = Math.atan2(e.y - y, e.x - x);
      e.vx += Math.cos(a) * 200 * f; e.vy += Math.sin(a) * 200 * f; e.vz = 160 * f;
    }
  }
}

export function reload(world, ped) {
  const w = WEAPONS[ped.weapon];
  if (!w || !w.mag || !ped.player) return;
  const total = ammoOf(ped, w.id);
  if ((ped.mag[w.id] || 0) >= Math.min(w.mag, total)) return;
  ped.reloadUntil = world.time + 1.1;
  ped.pendingReload = w.id;
  ped.player.meDirty = true;
}

export function cycleWeapon(world, ped, dir) {
  if (!ped.player) return;
  const owned = Object.keys(ped.player.profile.weapons).filter((id) => WEAPONS[id]).sort((a, b) => WEAPONS[a].i - WEAPONS[b].i);
  if (!owned.length) return;
  let i = owned.indexOf(ped.weapon);
  i = (i + dir + owned.length) % owned.length;
  selectWeapon(world, ped, owned[i]);
}

export function selectWeapon(world, ped, id) {
  if (!ped.player || !WEAPONS[id] || ped.player.profile.weapons[id] === undefined) return;
  ped.weapon = id;
  ped.reloadUntil = 0; ped.pendingReload = null;
  const w = WEAPONS[id];
  if (w.mag && ped.mag[id] === undefined) ped.mag[id] = Math.min(w.mag, ped.player.profile.weapons[id] || 0);
  ped.player.meDirty = true;
}

export function update(world, dt) {
  const now = world.time;
  const dryWeather = world.weather !== WEATHER.RAIN;
  for (const e of world.entities.values()) {
    if (e.kind === K.PROJ) { stepProjectile(world, e, dt); continue; }
    if (e.kind !== K.PED || e.dead) continue;
    // reload completion
    if (e.pendingReload && now >= e.reloadUntil) {
      const w = WEAPONS[e.pendingReload];
      if (w && e.player) e.mag[w.id] = Math.min(w.mag, ammoOf(e, w.id));
      e.pendingReload = null;
      if (e.player) e.player.meDirty = true;
    }
    // bleeding drain, a trail of drips wherever they go + bloody footprints on dry concrete
    if (e.bleeding) {
      if (e.hp > 8) e.hp -= 0.5 * dt;
      if (!e.vehId && !e.onTrain) {
        const moved = Math.hypot(e.x - e.lastStepX, e.y - e.lastStepY);
        if (moved < 40) { e.footAcc += moved; e.dripAcc = (e.dripAcc || 0) + moved; } // (not a teleport)
        if (e.dripAcc > 15) {
          e.dripAcc = 0;
          const tl = world.map.tileAtPx(e.x, e.y);
          if (tl !== T.WATER && tl !== T.DEEP) world.emit(e.x, e.y, { e: 'drip', x: Math.round(e.x), y: Math.round(e.y) });
        }
        if (e.footAcc > 22 && dryWeather) {
          e.footAcc = 0;
          if (DRY_CONCRETE.has(world.map.tileAtPx(e.x, e.y))) world.emit(e.x, e.y, { e: 'foot', x: e.x, y: e.y, a: Math.atan2(e.vy, e.vx) });
        }
      }
      if (e.player && world.tick % 20 === 0) e.player.meDirty = true;
    } else if (e.hp < e.maxHp && now - e.lastHitAt > 10 && e.hp >= e.maxHp * 0.3) {
      e.hp = Math.min(e.maxHp, e.hp + 1.2 * dt);
      if (e.player && world.tick % 20 === 0) e.player.meDirty = true;
    }
    e.lastStepX = e.x; e.lastStepY = e.y;
    // knockback friction for peds not driven by pedStep this tick
    if (!e.player && (now < e.downUntil || now < e.stunUntil)) {
      // NPCs thrown from a car fly and slide like players do (and walls / cars hurt)
      const air = now < (e.airUntil || 0), tum = now < (e.tumbleUntil || 0);
      if (air || tum) {
        const fr = air ? AIR_FRICTION : TUMBLE_FRICTION, v0 = Math.hypot(e.vx, e.vy), k = Math.exp(-fr * dt);
        e.vx *= k; e.vy *= k; e.x += e.vx * dt; e.y += e.vy * dt;
        collideCircle(e, PED_RADIUS, world.map, SWIM_BLOCK);
        if (world.map.levels) levelStep(world.map, e, PED_RADIUS);
        if (!e.dead) players.tumbleImpact(world, e, v0, dt, fr);
      } else { e.vx *= 0.8; e.vy *= 0.8; e.x += e.vx * dt; e.y += e.vy * dt; if (world.map.levels) levelStep(world.map, e, PED_RADIUS); }
    }
  }
}

function stepProjectile(world, p, dt) {
  const nx = p.x + p.vx * dt, ny = p.y + p.vy * dt;
  const owner = world.get(p.owner);
  const hit = traceTarget(world, owner ? { ...owner, lz: p.lz || 0, id: owner.id, vehId: owner.vehId, npc: owner.npc, sub: owner.sub } : { id: -1, vehId: 0, lz: p.lz || 0 }, p.x, p.y, nx, ny, true);
  p.dist += Math.hypot(nx - p.x, ny - p.y);
  if ((hit.kind && hit.id !== p.owner) || hit.hitT < 1 || p.dist > p.maxDist) {
    const t = hit.hitT < 1 ? hit.hitT : 1;
    const ex = p.x + (nx - p.x) * t, ey = p.y + (ny - p.y) * t;
    const w = WEAPONS[p.weapon];
    world.emit(ex, ey, { e: 'explode', x: ex, y: ey, r: w.radius });
    blast(world, ex, ey, w.radius, w.dmg, owner, 0, true, p.lz || 0);
    world.remove(p);
    return;
  }
  p.x = nx; p.y = ny;
}
