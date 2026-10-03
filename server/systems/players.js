// Player sessions: join/leave (30-second Ghost State), input application, context
// interactions, death + respawn, persistence sync and HUD prompts.
import { PF, FACTION, TILE } from '../../shared/constants.js';
import { IN } from '../../shared/input.js';
import { WEAPONS, ITEMS } from '../../shared/items.js';
import { pedStep } from '../../shared/physics.js';
import { PED_BLOCK } from '../../shared/map.js';
import { mulberry32 } from '../../shared/rng.js';
import { playerOutfit } from '../entities.js';
import { store } from '../store.js';
import * as vehicles from './vehicles.js';
import * as combat from './combat.js';
import * as cargo from './cargo.js';
import * as law from './law.js';
import * as economy from './economy.js';
import * as jobs from './jobs.js';
import * as homes from './homes.js';

export const GHOST_SECONDS = 30;
export const RESPAWN_SECONDS = 7;

export function join(world, conn, profile) {
  let p = world.players.get(profile.pid);
  if (p) {
    // reconnect: within the ghost window (or replacing another tab)
    if (p.conn && p.conn !== conn) { try { p.conn.sendJSON({ t: 'kicked', reason: 'Signed in from another tab' }); p.conn.close(4000, 'replaced'); } catch { /* gone */ } }
    p.conn = conn;
    p.ghostUntil = 0;
    p.known = new Map();
    p.inputQ = [];
    p.meDirty = true;
    world.notify(p, 'Reconnected - you made it back before your ghost timer ran out.', 'good');
    return p;
  }
  if (!profile.outfit) profile.outfit = playerOutfit(mulberry32(parseInt(profile.pid.slice(0, 8), 16)));
  p = {
    pid: profile.pid, profile, conn, name: profile.name,
    ped: null, inputQ: [], lastInput: { seq: 0, bits: 0, mx: 0, my: 0, aim: 0 }, ack: 0, prevBits: 0,
    known: new Map(), ghostUntil: 0, respawnAt: 0, meDirty: true, meTick: 0, toasts: [],
    faction: FACTION.CITIZEN, badge: false, hunter: false,
    heat: 0, wanted: 0, flareUntil: 0, lastSeenX: 0, lastSeenY: 0, seenAt: 0, searchR: 0, disguised: false,
    victims: new Map(), robbedBy: new Map(), bounty: 0,
    menu: null, job: null, prompt: '', promptKey: '', lastHealAt: 0, deathCause: '',
    joinedAt: world.time, lastPosSave: 0, dev: world.dev,
  };
  world.players.set(p.pid, p);
  spawnPlayerPed(world, p, true);
  world.notify(p, `Welcome to City Life Auto, ${p.name}. You are a clean Citizen.`, 'info');
  return p;
}

function validSpawn(world, pos) {
  if (!pos || typeof pos.x !== 'number') return false;
  const t = world.map.tileAtPx(pos.x, pos.y);
  return !PED_BLOCK[t] && pos.x > 0 && pos.y > 0 && pos.x < world.map.w * TILE && pos.y < world.map.h * TILE;
}

export function spawnPlayerPed(world, p, useSaved, deathPos = null) {
  const prof = p.profile;
  let pos;
  if (useSaved && validSpawn(world, prof.pos)) pos = prof.pos;
  else {
    pos = homes.resolveSpawn(world, p, p.respawnChoice, deathPos);
    p.lastSpawnName = pos.name;
    p.respawnChoice = null;
  }
  const ped = world.spawnPed(pos.x + (world.rand() - 0.5) * 30, pos.y + (world.rand() - 0.5) * 20, {
    hp: 100, app: { ...prof.outfit }, archetype: 'player', name: p.name,
  });
  ped.player = p;
  ped.weapon = 'fists';
  for (const id of Object.keys(prof.weapons)) {
    const w = WEAPONS[id];
    if (w && w.mag) ped.mag[id] = Math.min(w.mag, prof.weapons[id] || 0);
  }
  p.ped = ped;
  p.faction = FACTION.CITIZEN; p.badge = false; p.hunter = false;
  p.heat = 0; p.wanted = 0; p.flareUntil = 0; p.disguised = false;
  p.respawnAt = 0;
  p.meDirty = true;
  p.known = new Map();
  return ped;
}

export function leave(world, p) {
  if (!p) return;
  p.conn = null;
  p.inputQ = [];
  p.lastInput = { seq: p.lastInput.seq, bits: 0, mx: 0, my: 0, aim: p.lastInput.aim };
  if (p.ped && !p.ped.dead) {
    p.ghostUntil = world.time + GHOST_SECONDS;
  } else {
    finalizeLogout(world, p, false);
  }
}

// Called when the ghost timer expires (drop rule) or when leaving while dead.
function finalizeLogout(world, p, dropLoot) {
  const ped = p.ped;
  if (ped && !ped.removed) {
    if (dropLoot) {
      cargo.dropEverything(world, ped, `${p.name} (disconnected)`);
      world.emit(ped.x, ped.y, { e: 'poof', x: ped.x, y: ped.y });
    }
    if (ped.vehId) vehicles.ejectPed(world, ped, true);
    p.profile.pos = { x: ped.x, y: ped.y };
    world.remove(ped);
  }
  p.profile.lastSeen = Date.now();
  store.touch();
  world.players.delete(p.pid);
  law.onPlayerGone(world, p);
}

export function queueInput(p, inp) {
  if (inp.seq <= p.ack) return;
  p.inputQ.push(inp);
  if (p.inputQ.length > 8) {
    // never lose a one-shot press (punch, interact, enter car) when trimming a backed-up queue
    const dropped = p.inputQ.splice(0, p.inputQ.length - 8);
    let bits = 0;
    for (const d of dropped) bits |= d.bits;
    p.inputQ[0] = { ...p.inputQ[0], bits: p.inputQ[0].bits | bits };
  }
}

export function pedMods(world, ped) {
  const now = world.time;
  const canMove = !ped.dead && now >= ped.downUntil && now >= ped.stunUntil && !ped.vehId;
  let speedMul = 1;
  if (ped.carrying) speedMul *= 0.6; // GDD: carrying scales walking speed down by 40%
  if (ped.buffs.energy > now) speedMul *= 1.15;
  if (ped.fishing) speedMul *= 0;
  return {
    canMove, canSprint: !ped.carrying, speedMul,
    regenMul: ped.buffs.coffee > now ? 2.2 : 1,
    staminaMax: ped.buffs.energy > now ? 140 : 100,
  };
}

export function processInputs(world, dt) {
  for (const p of world.players.values()) {
    // consume one input per tick; catch up by two when the client's queue backs up
    const n = p.inputQ.length > 3 ? 2 : 1;
    for (let k = 0; k < n; k++) {
      const ped = p.ped;
      let inp;
      if (p.inputQ.length) { inp = p.inputQ.shift(); p.ack = inp.seq; p.lastInput = inp; }
      else inp = p.conn ? p.lastInput : { seq: p.ack, bits: 0, mx: 0, my: 0, aim: p.lastInput.aim };
      if (!ped || ped.dead || ped.removed) { p.prevBits = inp.bits; continue; }
      const pressed = inp.bits & ~p.prevBits;
      p.prevBits = inp.bits;
      applyInput(world, p, ped, inp, pressed, dt);
    }
  }
}

function applyInput(world, p, ped, inp, pressed, dt) {
  ped.aimAngle = inp.aim;
  if (inp.bits & IN.AIMING) ped.aimUntil = world.time + 0.3;
  if (pressed & IN.NEXTW) combat.cycleWeapon(world, ped, 1);
  if (pressed & IN.PREVW) combat.cycleWeapon(world, ped, -1);
  if (pressed & IN.RELOAD) combat.reload(world, ped);
  if (pressed & IN.USE) economy.useHealItem(world, p);

  if (ped.vehId) {
    const v = world.get(ped.vehId);
    if (!v) { ped.vehId = 0; ped.seat = -1; return; }
    if (ped.seat === 0) {
      v.input.throttle = -inp.my;
      v.input.steer = inp.mx;
      v.input.hb = !!(inp.bits & IN.DIVE);
      if (inp.bits & IN.HORN) v.hornUntil = world.time + 0.2;
      if ((pressed & IN.HORN) && v.def.police) v.sirenOn = !v.sirenOn;
    }
    if ((inp.bits & IN.FIRE) && (inp.bits & IN.AIMING)) {
      const w = WEAPONS[ped.weapon];
      if (w && (w.type === 'gun')) combat.tryAttack(world, ped, inp.aim);
    }
    if (pressed & IN.VEHICLE) vehicles.exitVehicle(world, ped);
    if (pressed & IN.ACTION) { const act = homes.vehicleInteraction(world, p); if (act) act.run(); }
    return;
  }

  // on foot
  if (ped.fishing && (Math.abs(inp.mx) > 0.3 || Math.abs(inp.my) > 0.3)) jobs.cancelFishing(world, p, 'You reeled in your line.');
  pedStep(ped, inp, dt, world.map, pedMods(world, ped));
  if (inp.bits & IN.FIRE) {
    if (ped.carrying) { if (pressed & IN.FIRE) cargo.throwCrate(world, ped, inp.aim); }
    else if (!ped.fishing) combat.tryAttack(world, ped, (inp.bits & IN.AIMING) ? inp.aim : ped.a);
  }
  if (pressed & IN.THROW) { if (ped.carrying) cargo.throwCrate(world, ped, (inp.bits & IN.AIMING) ? inp.aim : ped.a); }
  if (pressed & IN.VEHICLE) vehicles.tryEnter(world, ped);
  if (pressed & IN.ACTION) {
    const act = findInteraction(world, p);
    if (act) act.run();
  }
}

// ---------------------------------------------------------------------------
// Context-sensitive interaction (GDD §13: E key manages context interactions)
export function findInteraction(world, p) {
  const ped = p.ped;
  if (!ped || ped.dead) return null;
  if (ped.vehId) return homes.vehicleInteraction(world, p);
  const now = world.time;
  if (now < ped.downUntil || now < ped.stunUntil) return null;

  if (ped.fishing) {
    if (ped.fishing.biteAt && now >= ped.fishing.biteAt && now <= ped.fishing.biteAt + ped.fishing.window) return { label: 'REEL IN NOW!', run: () => jobs.reelIn(world, p) };
    return { label: 'Waiting for a bite... (move to stop)', run: () => jobs.reelIn(world, p) };
  }

  if (ped.carrying) {
    const crate = world.get(ped.carrying);
    const dz = jobs.deliveryZoneFor(world, p, crate);
    if (dz) return { label: dz.label, run: () => dz.run() };
    const slot = cargo.findFreeSlot(world, ped);
    if (slot) return { label: `Load onto ${slot.v.def.name}`, run: () => cargo.loadCrate(world, ped, slot.v, slot.i) };
    return { label: 'Set crate down', run: () => cargo.dropCrate(world, ped) };
  }

  if (p.badge) {
    const target = law.arrestTarget(world, p);
    if (target) return { label: `Arrest ${target.name || 'suspect'}`, run: () => law.arrest(world, p, target) };
  }

  const bag = cargo.nearestBag(world, ped);
  if (bag) return { label: `Grab loot ($${bag.cash}${Object.keys(bag.items).length || Object.keys(bag.weapons).length ? ' + items' : ''})`, run: () => cargo.lootBag(world, p, bag) };

  const crate = cargo.nearestCrate(world, ped);
  if (crate) return { label: crate.state === 'loaded' ? `Unload ${crateName(crate)}` : `Pick up ${crateName(crate)}`, run: () => cargo.pickUp(world, ped, crate) };

  const victim = jobs.purseVictimNear(world, p);
  if (victim) return { label: 'Return the purse (+Samaritan)', run: () => jobs.returnPurse(world, p, victim) };

  const poi = world.map.poiNear(ped.x, ped.y);
  if (poi && poi.kind !== 'reception') {
    const label = economy.poiLabel(world, p, poi);
    if (label) return { label, run: () => economy.openMenu(world, p, poi) };
  }

  if (p.profile.weapons.rod !== undefined) {
    const spot = jobs.fishingSpot(world, ped);
    if (spot) return { label: 'Cast fishing line', run: () => jobs.castLine(world, p, spot) };
  }

  const v = vehicles.nearestVehicle(world, ped, 56);
  if (v) return { label: `Enter ${v.def.name}`, key: 'F', run: () => vehicles.tryEnter(world, ped) };
  return null;
}

export function crateName(c) {
  return c.label || ['', 'Wood Box', 'Steel Barrel', 'Iron Vault', 'Carbon-Gold Case'][c.tier];
}

// ---------------------------------------------------------------------------
export function onPedDeath(world, ped, killer, cause) {
  const p = ped.player;
  if (!p) return;
  p.respawnAt = world.time + RESPAWN_SECONDS;
  p.deathCause = cause || 'You flatlined.';
  p.profile.stats.deaths++;
  if (p.badge) world.notify(p, 'Your badge was stripped. Return to Police HQ to re-deploy.', 'bad');
  p.badge = false; p.hunter = false; p.faction = FACTION.CITIZEN;
  p.profile.peakWanted = 0;
  p.heat = 0; p.wanted = 0; p.disguised = false;
  if (p.job && p.job.failOnDeath) jobs.failJob(world, p, 'Job failed - you died.');
  jobs.cancelFishing(world, p);
  cargo.dropEverything(world, ped, p.name);
  p.meDirty = true;
  store.touch();
}

export function update(world, dt) {
  const now = world.time;
  for (const p of [...world.players.values()]) {
    const ped = p.ped;
    if (p.ghostUntil && now >= p.ghostUntil) {
      // GDD §9 drop rule: timer expired -> body despawns, everything on them jettisoned
      finalizeLogout(world, p, true);
      continue;
    }
    if (ped && ped.dead && p.respawnAt && now >= p.respawnAt) {
      if (!p.conn) { finalizeLogout(world, p, false); continue; }
      // leave a body for EMS, respawn clean at hospital
      const body = world.spawnPed(ped.x, ped.y, { hp: 100, app: ped.app, archetype: 'casual', name: '' });
      body.dead = true; body.deadAt = now; body.a = ped.a; body.corpseOf = p.pid;
      world.bodies.add(body);
      world.remove(ped);
      spawnPlayerPed(world, p, false, { x: ped.x, y: ped.y });
      world.notify(p, `You woke up at ${p.lastSpawnName || 'the hospital'}. Everything you carried was left behind.`, 'bad');
      continue;
    }
    if (!ped || ped.dead) continue;
    // flags
    ped.ghost = !!p.ghostUntil;
    // periodic persistence of position
    if (now - p.lastPosSave > 5) { p.lastPosSave = now; p.profile.pos = { x: ped.x, y: ped.y }; store.touch(); }
    // prompt every 4 ticks
    if ((world.tick + (ped.id & 3)) % 4 === 0 && p.conn) {
      const act = findInteraction(world, p);
      const label = act ? `${act.key || 'E'}: ${act.label}` : '';
      if (label !== p.prompt) { p.prompt = label; p.meDirty = true; }
    }
  }
}

export function pedFlags(world, ped) {
  const now = world.time;
  let f = 0;
  if (ped.dead) f |= PF.DEAD;
  if (now < ped.downUntil || ped.passedOut) f |= PF.DOWN;
  if (now < ped.stunUntil) f |= PF.STUN;
  if (ped.prevBits & IN.SPRINT && Math.hypot(ped.vx, ped.vy) > 140) f |= PF.SPRINT;
  if (now < ped.attackAnimUntil) f |= PF.ATTACK;
  if (now < ped.aimUntil) f |= PF.AIM;
  if (ped.rollT > 0) f |= PF.ROLL;
  if (ped.carrying) f |= PF.CARRY;
  if (ped.vehId) f |= PF.INVEH;
  if (ped.bleeding) f |= PF.BLEED;
  if (ped.player && ped.player.ghostUntil) f |= PF.GHOST;
  if (now < ped.flareUntil) f |= PF.FLARE;
  if (ped.player && ped.player.badge) f |= PF.BADGE;
  if (ped.npc && ped.npc.role === 'cop') f |= PF.BADGE;
  if (Math.abs(ped.vx) + Math.abs(ped.vy) > 20) f |= PF.MOVING;
  if (ped.fishing) f |= PF.FISHING;
  if (ped.umbrella) f |= PF.UMBRELLA;
  return f;
}

export function buildMe(world, p) {
  const ped = p.ped;
  const prof = p.profile;
  const weapons = Object.keys(prof.weapons).filter((id) => WEAPONS[id]).map((id) => ({
    id, ammo: prof.weapons[id] || 0, mag: ped ? (ped.mag[id] || 0) : 0,
  }));
  const inv = {};
  for (const [k, v] of Object.entries(prof.inventory)) if (v > 0 && ITEMS[k]) inv[k] = v;
  return {
    t: 'me',
    name: p.name, hp: ped ? Math.round(ped.hp) : 0, maxHp: ped ? ped.maxHp : 100,
    dead: ped ? ped.dead : true, respawnIn: p.respawnAt ? Math.max(0, p.respawnAt - world.time) : 0, deathCause: p.deathCause,
    cash: prof.cash, bank: prof.bank, cexp: prof.criminalExp, sam: prof.samaritan,
    wanted: p.wanted, heat: Math.round(p.heat), peak: prof.peakWanted, disguised: p.disguised,
    faction: p.badge ? 'enforcer' : p.hunter ? 'hunter' : (p.wanted > 0 ? 'criminal' : 'citizen'),
    weapon: ped ? ped.weapon : 'fists', weapons, inv, bleeding: ped ? ped.bleeding : false,
    carrying: ped && ped.carrying ? (world.get(ped.carrying)?.tier || 0) : 0,
    prompt: p.prompt, job: p.job ? { text: p.job.text, x: p.job.tx, y: p.job.ty } : null,
    radar: law.radarFor(world, p), bounty: p.bounty,
    rumor: world.dropRumor ? { x: Math.round(world.dropRumor.x), y: Math.round(world.dropRumor.y), r: 420, t: world.dropRumor.tier } : null, ghost: !!p.ghostUntil,
    fishing: ped && ped.fishing ? { bite: !!(ped.fishing.biteAt && world.time >= ped.fishing.biteAt) } : null,
    reloading: ped ? world.time < ped.reloadUntil : false,
    buffs: ped ? { coffee: Math.max(0, (ped.buffs.coffee || 0) - world.time), energy: Math.max(0, (ped.buffs.energy || 0) - world.time) } : {},
    vehicles: prof.vehicles.map((v) => v.model),
    garageCap: homes.garageCap(world, prof),
    homes: homes.ownedHomes(world, prof).map((h) => ({ id: h.id, name: h.name, x: Math.round(h.x), y: Math.round(h.y) })),
    spawnOpts: ped && ped.dead ? homes.spawnOptions(world, p) : null, spawnChoice: p.respawnChoice || null,
    dev: p.dev,
  };
}
