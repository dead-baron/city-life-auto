// Combat: melee arcs, hitscan ballistics, tasers, rockets, damage, death, bleeding,
// regeneration and blood-trail footprints (GDD §14C combat feedback).
import { K, T, WEATHER, PED_RADIUS } from '../../shared/constants.js';
import * as revive from './revive.js';
import { isSwimming, inHotSpring, SWIM_BLOCK } from '../../shared/map.js';
import { collideCircle, AIR_FRICTION, TUMBLE_FRICTION } from '../../shared/physics.js';
import { levelStep, sameLevel } from '../../shared/levels.js';
import { WEAPONS, stepWeapon } from '../../shared/items.js';
import { NPC_GUN_MULT, ARMORED_VEHICLES, ARMORED_ROCKETS, SHOTGUN_CLOSE_PX, SHOTGUN_CLOSE_MULT, SOAK_HEAL, SOAK_AFTER_HIT_S, WINE_REGEN, PLAYER_GRIT, PLAYER_GRIT_CAUSE, TRAIN_SURVIVE, TRAIN_SURVIVE_HP, BLAST_FLING, GUARD, FIRE_ARROW, PLASMA_DEFLECT, VEHICLE_WEAPON, VEHICLE_WEAPON_DEFAULT } from '../../shared/rules.js';
import { angleDiff, segCircle, segObb } from '../../shared/math.js';
import * as players from './players.js';
import * as vehicles from './vehicles.js';
import * as cargo from './cargo.js';
import * as props from './props.js';
import * as law from './law.js';
import * as spikes from './spikes.js';
import * as npc from './npc.js';
import * as wildlife from './wildlife.js';
import * as reactions from './reactions.js';
import * as wanderer from './wanderer.js';
import * as nightclubs from './nightclubs.js';
import * as explosions from './explosions.js';   // (chain reactions: task #398)
import * as campfires from './campfires.js';

const DRY_CONCRETE = new Set([T.SIDEWALK, T.PLAZA, T.LOT, T.DOCK]);
const BLOOD_POOL_S = 600; // a pool of blood stays sticky this long (the ambulance crew don't mop)

function ammoOf(ped, id) {
  if (!ped.player) return 9999;
  return ped.player.profile.weapons[id] || 0;
}

export function tryAttack(world, ped, aim) {
  const now = world.time;
  if (ped.dead || now < ped.nextAttack || now < ped.reloadUntil || now < ped.stunUntil || now < ped.downUntil) return false;
  if (ped.hidden || now < (ped.protectUntil || 0) || ped.cellSafe) return false; // spawn / step-out protection, a police station's cell block (cells.js): no fighting
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
    world.emit(sx, sy, { e: 'shot', x1: sx, y1: sy, x2: sx, y2: sy, w: w.i, id: ped.id });
    law.gunfire(world, ped);
    npc.onGunfire(world, ped.x, ped.y, ped);
    return true;
  }
  if (w.type === 'bow') { loose(world, ped, w, aim); return true; }
  if (w.type === 'taser') { taser(world, ped, w, aim); return true; }
  if (w.type === 'spray') { spray(world, ped, w, aim); return true; }
  if (w.type === 'deploy') { spikes.deploy(world, ped, aim); return true; }
  const pellets = w.pellets || 1;
  let hitAny = false;
  const hits = new Map(); // ped -> { n pellets, dmg, a, dist }: a blast lands on each person as one hit
  for (let k = 0; k < pellets; k++) {
    const a = aim + (world.rand() - 0.5) * 2 * (w.spread || 0);
    if (hitscan(world, ped, w, a, hits)) hitAny = true;
  }
  for (const [t, h] of hits) shotHits(world, t, ped, w, h);
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
  // a nightclub's bouncer picks his punches: only ever whoever he's after - never his partner or a patron in the way
  // (nightclubs.js, task #432)
  const only = ped.npc && ped.npc.role === 'bouncer' ? ped.npc.target || -1 : 0;
  for (const o of world.query(ped.x, ped.y, w.range + 14, K.PED)) {
    if (o === ped || (o.dead && !revive.isDowned(o)) || o.vehId || !!o.sub !== !!ped.sub || !sameLevel(o.lz, ped.lz)) continue; // the subway / the highway deck is another level
    if (only && o.id !== only) continue;
    const d = Math.hypot(o.x - ped.x, o.y - ped.y);
    if (d > w.range + o.r) continue;
    if (Math.abs(angleDiff(aim, Math.atan2(o.y - ped.y, o.x - ped.x))) > w.arc / 2 && d > o.r + 4) continue;
    if (d < bestD) { bestD = d; best = o; }
  }
  world.emit(ped.x, ped.y, { e: 'swing', x: ped.x, y: ped.y, id: ped.id, side: ped.swingSide });
  if (!best) { meleeVehicle(world, ped, w, aim); return true; }   // (nobody in reach: a vehicle's body in the swing - task #402)
  const dir = Math.atan2(best.y - ped.y, best.x - ped.x);
  if (blocked(world, best, ped, w, dir)) return true;
  if (!best.wild && !ped.wild) npc.spectacle(world, best.x, best.y, { r: 300, near: 60, chance: 0.35, secs: 7 });   // (a fight: a few phones come out)
  const was = { speed: Math.hypot(best.vx, best.vy), heading: Math.atan2(best.vy, best.vx) }; // (for the reaction: running into it?)
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
  const soft = !hurtable(world, best);   // (spawn protection, indoors, dev invincibility: shoved, never floored or stunned)
  if (ped.combo >= needed && !onGround && !soft) {
    best.downUntil = now + 1.6 / Math.sqrt(poise);
    best.rollT = 0;
    mult *= 1.3;
    ped.combo = 0;
    world.emit(best.x, best.y, { e: 'knockdown', x: best.x, y: best.y, id: best.id });
  }
  if (w.knock && !soft) best.downUntil = now + 1.3;
  if (w.stunChance && world.rand() < w.stunChance && !soft) best.stunUntil = now + 2;
  if (w.bleed && world.rand() < 0.6 && !soft) best.bleeding = true;
  world.emit(best.x, best.y, { e: 'hit', x: best.x, y: best.y, a: dir, id: best.id, w: w.i });
  if (w.plasma) world.emit(best.x, best.y, { e: 'sizzle', x: best.x, y: best.y, a: +dir.toFixed(2), id: ped.id });   // (the plasma blade sears: no blood; id: whose blade - the client colours the sear by it)
  else if (w.id !== 'fists' || world.rand() < 0.35) world.emit(best.x, best.y, { e: 'blood', x: best.x, y: best.y, a: dir, n: w.id === 'fists' ? 2 : 6 });
  const floored = now < best.downUntil || now < best.stunUntil;
  const knife = w.id === 'knife' || w.id === 'huntknife';
  // a knife from behind (or into someone who never saw it coming) kills outright: a finishing stab
  if (w.backstab && !best.dead && backstabbable(world, ped, best)) {
    world.emit(best.x, best.y, { e: 'blood', x: best.x, y: best.y, a: dir, n: 10 });
    if (hurtable(world, best)) { best.killBlade = w.id; best.finisher = 'stab'; world.emit(ped.x, ped.y, { e: 'finisher', id: ped.id, t: best.id, k: 'stab', a: +dir.toFixed(2), x: best.x, y: best.y }); }
    damage(world, best, 9999, ped, 'melee', dir);
    if (!best.dead) best.finisher = best.killBlade = null;
    return true;
  }
  const dmg = w.dmg * mult * (0.85 + world.rand() * 0.3);
  // a blade's killing blow: now and then a finisher (a stab, a slash) that drops them where they stand; the plasma
  // blade cuts clean through (reactions.died: how each of them falls)
  const lethal = !best.dead && hurtable(world, best) && !w.nonLethal && best.hp - dmg <= 0;
  if (w.blade && lethal) {
    best.killBlade = w.id;
    if (w.plasma) best.halved = true;
    else if (world.rand() < w.blade) { best.finisher = knife ? 'stab' : 'slash'; world.emit(ped.x, ped.y, { e: 'finisher', id: ped.id, t: best.id, k: best.finisher, a: +dir.toFixed(2), x: best.x, y: best.y }); }
  }
  if (!best.dead && hurtable(world, best) && (w.nonLethal || best.hp - dmg > 0)) reactions.blow(world, best, ped, w, dir, was); // a stagger, or off their feet
  damage(world, best, dmg, ped, w.nonLethal ? 'nonlethal' : 'melee', dir);
  if (!best.dead) { best.finisher = null; best.halved = false; best.killBlade = null; }   // (it lived after all)
  if (floored) law.subdue(world, ped, best);
  return true;
}

// What a weapon does to a vehicle, as a multiple of its damage to a person (rules.js VEHICLE_WEAPON - task #402)
export const vehWeapon = (w) => VEHICLE_WEAPON[w.id] ?? VEHICLE_WEAPON_DEFAULT;
// A swing with nobody in reach: the first vehicle whose body (its rotated box, not its middle) the blow meets - along
// the aim and either side of it, within the weapon's reach. It takes the weapon's vehicle damage there (a dent on that
// side); the plasma blade cuts: after a few hits (rules.js PLASMA_CUT) it's sliced in two where the blade went in.
// Returns the vehicle hit, or null.
export function meleeVehicle(world, ped, w, aim) {
  if (ped.vehId) return null;
  const reach = w.range + 8;
  let hit = null, bestT = 2, hx = 0, hy = 0;
  for (const v of world.query(ped.x, ped.y, reach + 110, K.VEH)) {
    if (v.removed || v.wreckAt || v.ferry || v.fly || !!v.sub !== !!ped.sub || !sameLevel(v.lz, ped.lz)) continue;
    for (const da of [0, -w.arc / 4, w.arc / 4]) {
      const a = aim + (w.arc ? da : 0), x2 = ped.x + Math.cos(a) * reach, y2 = ped.y + Math.sin(a) * reach;
      const t = segObb(ped.x, ped.y, x2, y2, v.x, v.y, v.a, v.def.L / 2, v.def.W / 2);
      if (t >= 0 && t < bestT) { bestT = t; hit = v; hx = ped.x + (x2 - ped.x) * t; hy = ped.y + (y2 - ped.y) * t; }
    }
  }
  if (!hit) return null;
  const zone = vehicles.zoneAt(hit, hx, hy);
  world.emit(hx, hy, { e: 'spark', x: Math.round(hx), y: Math.round(hy) });
  if (w.plasma) {
    world.emit(hx, hy, { e: 'sizzle', x: Math.round(hx), y: Math.round(hy), a: +aim.toFixed(2), id: ped.id });
    hit.plasmaHits = (hit.plasmaHits || 0) + 1;
    if (hit.plasmaHits >= vehicles.plasmaCuts(hit.def)) {
      const c = Math.cos(hit.a), s = Math.sin(hit.a);
      vehicles.noteHit(hit, zone, 1);
      vehicles.cutVehicle(world, hit, ped, (hx - hit.x) * c + (hy - hit.y) * s);
      if (hit.ai) npc.onVehicleHit(world, hit, ped);
      return hit;
    }
  }
  vehicles.damageVehicle(world, hit, w.dmg * (ped.build ? ped.build.str : 1) * vehWeapon(w), ped, false, false, zone);
  if (hit.ai) npc.onVehicleHit(world, hit, ped);
  return hit;
}

// Guarding (players.js: the guard held with fists, a bat, a sword, the katana or the plasma blade; rules.js GUARD).
export const guarding = (world, t) => world.time < (t.guardUntil || 0) && !t.dead && !t.vehId;
// A blow at someone guarding, from in front of them: blocked - a clash (the 'block' event), the attacker's blow bounces
// off and their combo is broken, the guard rocks back a step, and only what the guard doesn't stop gets through (no
// stagger, no bleeding, no knockdown). From behind or the side the guard is no help.
function blocked(world, t, ped, w, dir) {
  if (!guarding(world, t) || Math.abs(angleDiff(t.a || 0, dir + Math.PI)) > GUARD.arc) return false;
  const gw = WEAPONS[t.weapon] || WEAPONS.fists;
  world.emit(t.x, t.y, { e: 'block', x: t.x, y: t.y, a: +(dir + Math.PI).toFixed(2), id: t.id, w: gw.i });
  t.vx += Math.cos(dir) * 45; t.vy += Math.sin(dir) * 45;
  ped.vx -= Math.cos(dir) * 70; ped.vy -= Math.sin(dir) * 70;
  ped.combo = 0;
  const left = w.dmg * (ped.build ? ped.build.str : 1) * (1 - (gw.guard || 0));
  if (left > 0.5) damage(world, t, left, ped, w.nonLethal ? 'nonlethal' : 'melee', dir);
  return true;
}
// The plasma blade's chance of turning aside a bullet or an arrow coming at you off rad round from where you face (0
// head on, PI from behind), guarding with it or just holding it (rules.js PLASMA_DEFLECT): guarding, most from in front
// (within about 60 degrees), fewer from the side, none from behind; not guarding, now and then from in front.
export function deflectChance(off, guarding) {
  const o = Math.abs(off), D = PLASMA_DEFLECT;
  if (!guarding) return o <= D.idleArc ? WEAPONS.plasma.deflect : 0;
  if (o <= D.frontArc) return D.front;
  return o >= D.sideArc ? 0 : D.front + (D.side - D.front) * (o - D.frontArc) / (D.sideArc - D.frontArc);
}
// The plasma blade meeting a bullet or an arrow flying along a (rules.js PLASMA_DEFLECT): whether it's turned aside -
// the blade whirls round to it (the swing pose), sparks, and it glances off (the 'deflect' event; g: the way it goes).
function deflects(world, t, a) {
  if (t.weapon !== 'plasma' || t.vehId || t.dead) return false;
  const g = guarding(world, t);
  if (!g && world.time <= (t.attackAnimUntil || 0)) return false;   // (mid-swing and not guarding: no)
  const c = deflectChance(angleDiff(t.a || 0, a + Math.PI), g);
  if (!(c > 0) || world.rand() >= c) return false;
  const back = a + Math.PI, glance = back + (world.rand() - 0.5) * 2.4;
  world.emit(t.x, t.y, { e: 'deflect', x: t.x, y: t.y, a: +back.toFixed(2), g: +glance.toFixed(2), id: t.id });
  t.attackAnimUntil = Math.max(t.attackAnimUntil || 0, world.time + 0.16);
  t.swingSide = (t.swingSide || 0) ^ 1;
  return true;
}

// A bow: the arrow flies (stepArrow), the string twangs - nobody but someone right beside you hears it, and the
// animals don't take it for a gunshot - and the next arrow is nocked if there is one.
function loose(world, ped, w, aim) {
  const a = aim + (world.rand() - 0.5) * 2 * (w.spread || 0);
  const sx = ped.x + Math.cos(a) * 16, sy = ped.y + Math.sin(a) * 16;
  const proj = world.spawnProjectile(ped.id, sx, sy, a, w.speed || 800, w.range, w.id);
  if (proj) proj.lz = ped.lz || 0;
  world.emit(sx, sy, { e: 'loose', x: sx, y: sy, a: +a.toFixed(2), id: ped.id, w: w.i });
  npc.onGunfire(world, ped.x, ped.y, ped, 45);
  if (ped.player && (ped.player.profile.weapons[w.id] || 0) > 0) { ped.reloadUntil = world.time + (w.reload || 1.1); ped.pendingReload = w.id; }
}

// An arrow in flight: into the first person, animal or vehicle on its line, or it sticks in the ground or a wall
// where it stops (the arrows left lying can be picked up again: hunting.js). One in an animal stays in it until
// the carcass is dressed (and comes back to you then).
function stepArrow(world, p, dt, owner) {
  const nx = p.x + p.vx * dt, ny = p.y + p.vy * dt;
  const hit = traceTarget(world, owner ? { ...owner, lz: p.lz || 0, id: owner.id, vehId: owner.vehId, npc: owner.npc, sub: owner.sub } : { id: -1, vehId: 0, lz: p.lz || 0 }, p.x, p.y, nx, ny, true);
  const step = Math.hypot(nx - p.x, ny - p.y);
  const w = WEAPONS[p.weapon], a = Math.atan2(p.vy, p.vx);
  if (hit.kind === K.PED && hit.id !== p.owner) {
    const t = hit;
    if (deflects(world, t, a)) { world.remove(p); return; }   // (the plasma blade: turned aside, it falls away)
    world.emit(t.x, t.y, { e: 'blood', x: t.x, y: t.y, a, n: 7, g: 1 });
    world.emit(t.x, t.y, { e: 'arrowhit', x: t.x, y: t.y, a: +a.toFixed(2), id: t.id, f: w.fire ? 1 : 0 });
    const mult = t.wild ? (w.wild || 1) : t.player || !(owner && owner.player) ? 1 : NPC_GUN_MULT / (t.grit || 1);
    const dmg = w.dmg * mult * (0.9 + world.rand() * 0.2) + (w.fire ? FIRE_ARROW.burn : 0);   // (a fire arrow burns too)
    if (world.rand() < 0.7) t.bleeding = true;   // an arrow cuts: it bleeds (a trail to follow)
    if (t.wild && !w.fire) t.arrows = (t.arrows || 0) + 1;   // (a fire arrow burns away: none to get back)
    if (!t.dead && hurtable(world, t)) reactions.shot(world, t, owner || t, w, { n: 1, dist: p.dist, a, lethal: t.hp - dmg <= 0 });
    damage(world, t, dmg, owner, 'arrow', a);
    world.remove(p);
    return;
  }
  if (hit.kind === K.VEH && hit.id !== p.owner) {
    world.emit(nx, ny, { e: 'spark', x: nx, y: ny });
    if (w.fire) { hit.burnUntil = Math.max(hit.burnUntil || 0, world.time + FIRE_ARROW.vehBurnS); world.emit(nx, ny, { e: 'arrowstick', x: Math.round(nx), y: Math.round(ny), a: +a.toFixed(2), wall: 1, f: 1 }); }   // (it catches: flames on it a while)
    vehicles.damageVehicle(world, hit, w.fire ? FIRE_ARROW.veh : 4, owner, false, false, vehicles.zoneAt(hit, nx, ny));
    world.remove(p);
    return;
  }
  p.dist += step;
  if (hit.hitT < 1 || p.dist > p.maxDist) {
    const t = hit.hitT < 1 ? hit.hitT : 1, ex = p.x + (nx - p.x) * t, ey = p.y + (ny - p.y) * t;
    world.emit(ex, ey, { e: 'arrowstick', x: Math.round(ex), y: Math.round(ey), a: +a.toFixed(2), wall: hit.hitT < 1 ? 1 : 0, f: w.fire ? 1 : 0 });
    // a fire arrow burns where it lands - and lights a campfire it comes down by
    if (w.fire) { const cf = campfires.fireNear(world, ex, ey, FIRE_ARROW.lightPx); if (cf) campfires.setLit(world, cf.i, true); }
    // (one that came down in the open can be picked up again)
    else if (hit.hitT >= 1 && owner && owner.player) { (world.arrows ||= []).push({ x: ex, y: ey, a, owner: owner.id, t: world.time }); if (world.arrows.length > 80) world.arrows.shift(); owner.player.meDirty = true; }
    world.remove(p);
    return;
  }
  p.x = nx; p.y = ny;
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
  if (target && target.kind === K.PED && hurtable(world, target)) {   // (spawn protection, indoors, dev invincibility: no zap)
    target.stunUntil = world.time + w.stun;
    target.downUntil = world.time + w.stun;
    target.rollT = 0;
    damage(world, target, w.dmg, ped, 'nonlethal', aim);
    law.subdue(world, ped, target);
  }
}

// Pepper spray: a short cone; everyone caught in it is blinded - doubled over, out of the fight
// for a few seconds. Non-lethal, and legal to carry.
function spray(world, ped, w, aim) {
  const now = world.time;
  world.emit(ped.x, ped.y, { e: 'spray', x: ped.x + Math.cos(aim) * 12, y: ped.y + Math.sin(aim) * 12, a: aim });
  for (const o of world.query(ped.x, ped.y, w.range + 20, K.PED)) {
    if (o === ped || (o.dead && !revive.isDowned(o)) || o.vehId || !!o.sub !== !!ped.sub || !sameLevel(o.lz, ped.lz)) continue;
    const d = Math.hypot(o.x - ped.x, o.y - ped.y);
    if (d > w.range + o.r) continue;
    if (Math.abs(angleDiff(aim, Math.atan2(o.y - ped.y, o.x - ped.x))) > w.arc / 2 && d > o.r + 6) continue;
    if (!world.map.los(ped.x, ped.y, o.x, o.y) || !hurtable(world, o)) continue;
    o.stunUntil = Math.max(o.stunUntil || 0, now + w.stun);
    o.rollT = 0;
    o.vx *= 0.2; o.vy *= 0.2;
    damage(world, o, w.dmg, ped, 'nonlethal', aim);
    law.subdue(world, ped, o);
    if (o.player) world.notify(o.player, 'Pepper spray! You can\'t see a thing...', 'bad');
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

// Whether damage() would hurt this person at all (indoors, spawn protection, a lost pet, dev invincibility).
function hurtable(world, ped) {
  return !(ped.hidden || ped.pet || ped.cellSafe || world.time < (ped.protectUntil || 0) || (ped.player && ped.player.invincible));
}

// The bullets (or a blast's pellets) that hit one person, as one hit: a shotgun at close range hits harder
// the closer it is; the body reacts (reactions.js) before the damage, so a fatal blast throws it too.
function shotHits(world, t, shooter, w, h) {
  // the plasma blade, held ready and facing the shots, now and then turns a bullet aside - guarding with it, most of them
  if (deflects(world, t, h.a)) return;
  let dmg = h.dmg;
  // (point blank stays almost always a kill, a player's grit or not)
  if (h.n >= 3 && h.dist < SHOTGUN_CLOSE_PX) dmg *= (1 + (SHOTGUN_CLOSE_MULT - 1) * (1 - h.dist / SHOTGUN_CLOSE_PX)) * gritOf(t, 'gun');
  if (!t.dead && hurtable(world, t)) reactions.shot(world, t, shooter, w, { n: h.n, dist: h.dist, a: h.a, lethal: t.hp - dmg / gritOf(t, 'gun') <= 0 });
  damage(world, t, dmg, shooter, 'gun', h.a);
}

function hitscan(world, ped, w, a, acc) {
  const x1 = ped.x + Math.cos(a) * 14, y1 = ped.y + Math.sin(a) * 14;
  const x2 = ped.x + Math.cos(a) * w.range, y2 = ped.y + Math.sin(a) * w.range;
  const hit = traceTarget(world, ped, x1, y1, x2, y2, true);
  const t = hit.hitT;
  const hx = x1 + (x2 - x1) * t, hy = y1 + (y2 - y1) * t;
  world.emit(x1, y1, { e: 'shot', x1, y1, x2: hx, y2: hy, w: w.i, h: hit.kind || 0, id: ped.id });   // (id: the client puts the flash on the gun it draws)
  if (hit.kind === K.PED) {
    world.emit(hx, hy, { e: 'blood', x: hx, y: hy, a, n: 9, g: 1 }); // g: a bullet - spray out the far side, splats on the ground
    if (world.rand() < 0.35) hit.bleeding = true;
    // guns are deadly against NPCs / police (1-3 shots); players keep more staying power; some
    // people are just harder to put down (grit)
    // (an animal takes the gun's own damage - its hp is set for that - and a hunting gun's extra: w.wild)
    const mult = hit.wild ? (w.wild || 1) : hit.player || !ped.player ? 1 : NPC_GUN_MULT / (hit.grit || 1); // your shots are deadly; NPC-vs-NPC gunfights last a while
    const h = acc.get(hit) || { n: 0, dmg: 0, a, dist: Math.hypot(hit.x - ped.x, hit.y - ped.y) };
    h.n++; h.dmg += w.dmg * mult * (0.9 + world.rand() * 0.2); h.a = a;
    acc.set(hit, h);
    return true;
  }
  if (hit.kind === K.VEH) {
    world.emit(hx, hy, { e: 'spark', x: hx, y: hy });
    // where on its body the round went in (its rotated box: traceTarget), a hole there; the strong guns tear into it
    // (rules.js VEHICLE_WEAPON - task #402)
    hit.holes = Math.min(99, (hit.holes || 0) + 1);
    vehicles.damageVehicle(world, hit, w.dmg * vehWeapon(w), ped, false, false, vehicles.zoneAt(hit, hx, hy));
    // exposed riders on bikes take hits too
    if (hit.def.kind === 'bike' && hit.seats[0]) { const rider = world.get(hit.seats[0]); if (rider) damage(world, rider, w.dmg * 0.5, ped, 'gun', a); }
    if (hit.ai) npc.onVehicleHit(world, hit, ped);
    return true;
  }
  if (t < 1) world.emit(hx, hy, { e: 'spark', x: hx, y: hy });
  return false;
}

// how much tougher a player is against a cause (rules.js PLAYER_GRIT): what scripted damage meant to leave a player on a
// set health is multiplied by
export const gritOf = (ped, cause) => (ped && ped.player && cause !== 'nonlethal' ? PLAYER_GRIT * (PLAYER_GRIT_CAUSE[cause] || 1) : 1);
export function damage(world, ped, amount, attacker, cause, dir = 0) {
  if (ped && ped.dead && amount > 0 && attacker && cause !== 'fall' && revive.isDowned(ped)) return revive.finish(world, ped, attacker); // hitting a downed player finishes them
  if (!ped || ped.dead || amount <= 0) return false;
  if (ped.npc && ped.npc.role === 'wanderer') { wanderer.struck(world, ped, attacker); return false; }   // (the stranger: gone in a flash)
  const now = world.time;
  if (ped.hidden || ped.pet || ped.cellSafe || now < (ped.protectUntil || 0)) return false; // indoors / spawn protection / nobody hurts a lost pet / the cells (cells.js)
  if (ped.player && ped.player.invincible) return false;          // dev: invincible
  if (ped.wild) wildlife.noteHit(world, ped, attacker, cause);   // (how it was taken: the grade of the hide)
  // a street fight (happenings.js): a scuffle - they hit to hurt, not to maim, so it goes on a while and nobody dies
  if (ped.npc && attacker && attacker.npc && ped.npc.happening && ped.npc.happening === attacker.npc.happening) amount *= 0.3;
  if (ped.player && cause !== 'nonlethal') {
    // players are tougher (rules.js PLAYER_GRIT); a train that would kill throws you clear now and then, critically hurt
    amount /= gritOf(ped, cause);
    if (cause === 'train' && amount >= ped.hp && world.rand() < TRAIN_SURVIVE) {
      amount = Math.max(0, ped.hp - Math.max(1, ped.maxHp * TRAIN_SURVIVE_HP));
      ped.bleeding = true;
      ped.downUntil = Math.max(ped.downUntil || 0, now + 3);
      world.notify(ped.player, 'The train threw you clear - you\'re critically hurt. Get help!', 'bad');
    }
  }
  ped.hp -= amount;
  ped.lastHitAt = now;
  ped.lastCombatAt = now;
  if (attacker) { ped.lastHitBy = attacker.id; attacker.lastCombatAt = now; }
  if (ped.hp < ped.maxHp * 0.3 && cause !== 'nonlethal') ped.bleeding = true;
  if (ped.fishing && ped.player) { ped.fishing = null; }
  if (!ped.wild && !(attacker && attacker.wild)) law.onDamage(world, attacker, ped, amount, cause); // (an animal: no assault - either way round)
  if (attacker && attacker !== ped && world.nightclubs) nightclubs.onHurt(world, ped, attacker, cause);   // (a club's patron: its bouncers come for whoever did it - task #432)
  if (ped.player) ped.player.meDirty = true;
  if (cause === 'nonlethal' && ped.hp < 1) ped.hp = 1;
  if (ped.hp <= 0) { kill(world, ped, attacker, cause, dir); return true; }
  if (ped.npc) npc.onAttacked(world, ped, attacker);
  else if (ped.wild) wildlife.onHurt(world, ped, attacker);
  return false;
}

export function kill(world, ped, attacker, cause, dir = 0) {
  if (ped.dead) return;
  if (ped.player && ped.player.invincible) { ped.hp = Math.max(ped.hp, 1); return; } // dev: invincible
  ped.dead = true;
  ped.deadAt = world.time;
  ped.hp = 0;
  ped.bleeding = false;
  if (ped.vehId) { vehicles.ejectPed(world, ped, true); ped.vx *= 0.3; ped.vy *= 0.3; }
  if (ped.carrying) cargo.dropCrate(world, ped);
  reactions.died(world, ped, cause, dir); // the fall (a slide, a roll, knocked back, a crumple) and the death event: how they lie
  if (!ped.wild) npc.spectacle(world, ped.x, ped.y, { r: 420, near: 110, chance: 0.8, secs: 10 });   // (somebody down in the street: phones out)
  if (ped.wild) { wildlife.onKilled(world, ped, attacker, cause); return; } // an animal: no crime, no tally, no ambulance - the carcass is cleared once nobody's looking (wildlife.js)
  if (attacker && attacker.wild) { if (ped.player) players.onPedDeath(world, ped, attacker, `Mauled by ${attacker.name || 'a wild animal'}.`); else { npc.onDeath(world, ped, null); world.bodies.add(ped); } return; }   // (killed by an animal: nobody's crime)
  law.onKill(world, attacker, ped, cause);
  if (attacker && attacker.player) attacker.player.profile.stats.kills++;
  if (ped.player) {
    const by = attacker ? (attacker.player ? attacker.player.name : attacker.npc && attacker.npc.role === 'cop' ? (FORCE_NAME[attacker.archetype] || 'the police') : (attacker.name || 'a local')) : null;
    players.onPedDeath(world, ped, attacker, by ? `Taken out by ${by}.` : causeText(cause));
  } else {
    npc.onDeath(world, ped, attacker);
    world.bodies.add(ped);
  }
}

const FORCE_NAME = { swat: 'SWAT', agent: 'the FBI', soldier: 'the army' };
function causeText(cause) {
  return ({ train: 'Hit by a train.', vehicle: 'Flattened by traffic.', crash: 'Wiped out at speed.', explosion: 'Caught in an explosion.', bail: 'Bailed out too fast.' })[cause] || 'You flatlined.';
}

// L: the blast's link of a chain (explosions.js: what it sets off goes up a beat later, as the next link); big: its
// size (shared/explosions.js blastSize) - a huge one (3, 4) throws people and shoves vehicles harder (BLAST_FLING)
export function blast(world, x, y, r, dmg, attacker, excludeVehId = 0, rocket = false, z = null, L = explosions.newLink(), big = 1) {
  if (z === null || z < 0.3) props.blastBreak(world, x, y, r * 0.8);
  const k = big > 2 ? BLAST_FLING : 1, vs = [];
  if (big > 2) L.c.hot = true;
  for (const e of world.query(x, y, r + 90)) {   // (+90: a long vehicle whose near end is in it)
    if (z !== null && !sameLevel(e.lz, z)) continue; // up on the deck vs down in the street
    const d = Math.hypot(e.x - x, e.y - y);
    const f = 1 - d / r;
    if (f <= 0 && e.kind !== K.VEH) continue;
    if (e.kind === K.PED && !e.vehId && !(e.blastSafeUntil > world.time)) {
      // thrown through the air - the dead too (reactions.js)
      const a = Math.atan2(e.y - y, e.x - x);
      if (e.dead || hurtable(world, e)) reactions.blasted(world, e, a, f, k);
      if (!e.dead) damage(world, e, dmg * f + 10, attacker, 'explosion', a);
    } else if (e.kind === K.VEH && e.id !== excludeVehId && !e.wreckAt) {
      // fn: how close its near end is (whether it goes up, and when: explosions.js); f, its middle: how hard it's hit
      const fn = Math.max(f, 1 - explosions.bodyDist(e, x, y) / r);
      if (fn <= 0) continue;
      const a = Math.atan2(e.y - y, e.x - x), fm = Math.max(0, f);
      e.blastAt = world.time;   // (custody.js: a blast bursts a police car's doors open)
      e.vx += Math.cos(a) * 220 * k * fm / e.def.mass; e.vy += Math.sin(a) * 220 * k * fm / e.def.mass;
      vehicles.noteHit(e, vehicles.zoneAt(e, x, y), 1);   // (dented on the side facing the blast - task #402)
      // a rocket landing on / next to a vehicle's body destroys it outright (armored ones take two) - by its nearest
      // part, not its middle: the tail of a bus counts (task #402)
      if (rocket && fn > 0.25) {
        const armored = ARMORED_VEHICLES.includes(e.def.id);
        vehicles.damageVehicle(world, e, armored ? e.def.hp / ARMORED_ROCKETS + 1 : e.hp + 1, attacker, true, true);
      } else vs.push([fn, fm, e]);
    } else if (e.kind === K.CRATE) {
      explosions.blastCrate(world, e, f, L, attacker);   // (a crate of explosives goes up too)
      if (e.state !== 'ground') continue;
      const a = Math.atan2(e.y - y, e.x - x);
      e.vx += Math.cos(a) * 200 * f; e.vy += Math.sin(a) * 200 * f; e.vz = 160 * f;
    }
  }
  // the vehicles it hurts, or sets off as the next links of its chain (explosions.js) - the nearest first, so they go up
  // in turn outward
  vs.sort((p, q) => q[0] - p[0]);
  for (const [fn, f, e] of vs) explosions.blastVehicle(world, e, fn, dmg * 1.6 * f, attacker, L, big);
  // people close by run; further out, some get their phones out and film it (npc.js spectacle)
  if (z === null || z < 0.3) { npc.panic(world, x, y, r * 2.2); npc.spectacle(world, x, y, { r: r * 2.2 + 520, near: r * 2.2, chance: 1.3, secs: 12 }); }
}

export function reload(world, ped) {
  const w = WEAPONS[ped.weapon];
  if (!w || !w.mag || !ped.player) return;
  const total = ammoOf(ped, w.id);
  if ((ped.mag[w.id] || 0) >= Math.min(w.mag, total)) return;
  ped.reloadUntil = world.time + (w.reload || 1.1);
  ped.pendingReload = w.id;
  ped.player.meDirty = true;
}

// the next (dir 1) or previous (-1) weapon you carry, in shared/items.js weaponOrder: by the table's index with the
// plasma blade last, so one step back from your fists (a tap of LB, the mouse wheel back) is the blade, if you have it
export function cycleWeapon(world, ped, dir) {
  if (!ped.player) return;
  const id = stepWeapon(Object.keys(ped.player.profile.weapons), ped.weapon, dir);
  if (id) selectWeapon(world, ped, id);
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
    if (e.kind !== K.PED) continue;
    if (e.dead) { if (now < (e.tumbleUntil || 0)) slideBody(world, e, dt, now); continue; }
    // reload completion
    if (e.pendingReload && now >= e.reloadUntil) {
      const w = WEAPONS[e.pendingReload];
      if (w && e.player) e.mag[w.id] = Math.min(w.mag, ammoOf(e, w.id));
      e.pendingReload = null;
      if (e.player) e.player.meDirty = true;
    }
    // walking through a pool of blood (or past a body): a few bloody footprints after
    if (!e.vehId && !e.onTrain && world.tick % 4 === (e.id & 3)) {
      for (const bp of world.bloodPools || []) {
        if (now - bp.t > BLOOD_POOL_S) continue;
        if (Math.abs(bp.x - e.x) < 18 && Math.abs(bp.y - e.y) < 18) { e.bloodyFeet = 12; break; }
      }
    }
    if (!e.bleeding && e.bloodyFeet > 0 && !e.vehId && !e.onTrain) {
      const moved = Math.hypot(e.x - e.lastStepX, e.y - e.lastStepY);
      if (moved < 40) e.footAcc += moved;
      if (e.footAcc > 24) {
        e.footAcc = 0;
        e.bloodyFeet--;
        if (dryWeather && DRY_CONCRETE.has(world.map.tileAtPx(e.x, e.y))) world.emit(e.x, e.y, { e: 'foot', x: e.x, y: e.y, a: Math.atan2(e.vy, e.vx), f: +(e.bloodyFeet / 12).toFixed(2) });
      }
    }
    // a soak in a hot spring: the hot water stops the bleeding and brings health back quickly, even when badly hurt
    if (inHotSpring(world.map, e)) {
      e.bleeding = false;
      if (e.hp < e.maxHp && now - (e.lastHitAt || 0) > SOAK_AFTER_HIT_S) {
        e.hp = Math.min(e.maxHp, e.hp + SOAK_HEAL * dt);
        if (e.player && world.tick % 20 === 0) e.player.meDirty = true;
      }
      if (e.player && !e.soaking) {
        e.soaking = true;
        if (now - (e.soakNoteAt || -99) > 30) { e.soakNoteAt = now; world.notify(e.player, e.hp < e.maxHp ? 'The hot water eases your aches.' : 'You sink into the hot water.', 'good'); }
      }
    } else if (e.soaking) e.soaking = false;
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
      e.hp = Math.min(e.maxHp, e.hp + 1.2 * (e.buffs && e.buffs.wine > now ? WINE_REGEN : 1) * dt);   // (a glass of wine: faster)
      if (e.player && world.tick % 20 === 0) e.player.meDirty = true;
    }
    e.lastStepX = e.x; e.lastStepY = e.y;
    // knockback friction for peds not driven by pedStep this tick
    if (!e.player && !e.hoodOf && (now < e.downUntil || now < e.stunUntil)) {   // (on a car's hood: carhits.js carries them)
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

// A body thrown, or cut down on the run, slides on to a stop (through the air first, then along the ground;
// walls stop it).
function slideBody(world, e, dt, now) {
  const k = Math.exp(-(now < (e.airUntil || 0) ? AIR_FRICTION : TUMBLE_FRICTION) * dt);
  e.vx *= k; e.vy *= k; e.x += e.vx * dt; e.y += e.vy * dt;
  collideCircle(e, PED_RADIUS, world.map, SWIM_BLOCK);
  if (world.map.levels) levelStep(world.map, e, PED_RADIUS);
  world.place(e);
}

function stepProjectile(world, p, dt) {
  const owner = world.get(p.owner);
  if (WEAPONS[p.weapon] && WEAPONS[p.weapon].type === 'bow') return stepArrow(world, p, dt, owner);   // (the hunting bow, the fire bow)
  const nx = p.x + p.vx * dt, ny = p.y + p.vy * dt;
  const hit = traceTarget(world, owner ? { ...owner, lz: p.lz || 0, id: owner.id, vehId: owner.vehId, npc: owner.npc, sub: owner.sub } : { id: -1, vehId: 0, lz: p.lz || 0 }, p.x, p.y, nx, ny, true);
  p.dist += Math.hypot(nx - p.x, ny - p.y);
  if ((hit.kind && hit.id !== p.owner) || hit.hitT < 1 || p.dist > p.maxDist) {
    const t = hit.hitT < 1 ? hit.hitT : 1;
    const ex = p.x + (nx - p.x) * t, ey = p.y + (ny - p.y) * t;
    const w = WEAPONS[p.weapon];
    world.emit(ex, ey, { e: 'explode', x: ex, y: ey, r: w.radius, s: 1 + Math.floor(world.rand() * 2147483646) });   // (s: the seed every client plays the same blast from)
    blast(world, ex, ey, w.radius, w.dmg, owner, 0, true, p.lz || 0);
    world.remove(p);
    return;
  }
  p.x = nx; p.y = ny;
}
