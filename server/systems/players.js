// Player sessions: join/leave (30-second Ghost State), input application, context
// interactions, death + respawn, persistence sync and HUD prompts.
import { PF, FACTION, TILE } from '../../shared/constants.js';
import { IN } from '../../shared/input.js';
import { WEAPONS, ITEMS } from '../../shared/items.js';
import { pedStep, driveInput, TUMBLE_FRICTION, AIR_FRICTION } from '../../shared/physics.js';
import { PED_BLOCK, isSwimming } from '../../shared/map.js';
import { surfaceZ } from '../../shared/levels.js';
import { mulberry32 } from '../../shared/rng.js';
import { playerOutfit } from '../entities.js';
import { store, defaultProfile } from '../store.js';
import * as vehicles from './vehicles.js';
import * as combat from './combat.js';
import * as cargo from './cargo.js';
const packRadar = (world, p, out) => { cargo.packRadar(world, p, out); return out; };   // + the backpack you dropped when you died
import * as law from './law.js';
import * as bounties from './bounties.js';
import * as economy from './economy.js';
import * as jobs from './jobs.js';
import * as picking from './picking.js';
import * as foraging from './foraging.js';
import * as hunting from './hunting.js';
import * as campfires from './campfires.js';
import * as wanderer from './wanderer.js';
import * as places from './places.js';
import * as rides from './rides.js';
import * as golf from './golf.js';
import * as hoops from './hoops.js';
import * as homes from './homes.js';
import * as rentals from './rentals.js';
import * as pets from './pets.js';
import * as happenings from './happenings.js';
import * as unstuck from './unstuck.js';
import * as station from './station.js';
import * as dealer from './dealer.js';
import * as races from './races.js';
import * as minigames from './minigames.js';
import * as robbery from './robbery.js';
import * as cruiser from './cruiser.js';
import * as events from './events.js';
import * as phone from './phone.js';
import * as props from './props.js';
import * as trains from './trains.js';
import * as transit from './transit.js';
import * as ferries from './ferries.js';

import { GHOST_SECONDS, RESPAWN_SECONDS, REVIVE_LIMP_SPEED } from '../../shared/rules.js';
import * as revive from './revive.js';
import * as custody from './custody.js';
import * as devmode from '../devmode.js';

export { GHOST_SECONDS, RESPAWN_SECONDS };

// opts.clientBuild / opts.clientBuiltAt: the build the player's page runs (sent in hello; see client/update.js).
export function join(world, conn, profile, opts = {}) {
  let p = world.players.get(profile.pid);
  if (p && world.build && p.build !== world.build) {
    // a session left over from before an update (a ghost, or another tab still on the old page): close it
    // out without the drop rule - this login starts fresh on the new build (below)
    if (p.conn && p.conn !== conn) { try { p.conn.sendJSON({ t: 'kicked', reason: 'Signed in from another tab' }); p.conn.close(4000, 'replaced'); } catch { /* gone */ } }
    if (p.devMode) devmode.exit(world, p, true);
    p.conn = null;
    revive.clearDown(world, p);
    finalizeLogout(world, p, false);
    p = null;
  }
  if (p) {
    // reconnect: within the ghost window (or replacing another tab)
    if (p.conn && p.conn !== conn) { try { p.conn.sendJSON({ t: 'kicked', reason: 'Signed in from another tab' }); p.conn.close(4000, 'replaced'); } catch { /* gone */ } }
    p.conn = conn;
    p.ghostUntil = 0;
    p.known = new Map();
    p.inputQ = [];
    // a new connection numbers its inputs afresh (a reloaded page from 1): an input is only taken when it's numbered
    // past the last one taken (queueInput), so the old count would throw every one away until the new page caught up
    // with it - stuck on the spot for minutes after a reload, a dropped tab or an update
    p.ack = 0; p.prevBits = 0; p.starve = 0;
    p.lastInput = { seq: 0, bits: 0, mx: 0, my: 0, aim: p.lastInput ? p.lastInput.aim : 0 };
    p.meDirty = true;
    noteClientBuild(world, p, opts);
    if (p.spectating) { p.spectating = false; p.invincible = p.specWasGod; } // a new page starts out of the free camera
    world.notify(p, 'Reconnected - you made it back before your ghost timer ran out.', 'good');
    return p;
  }
  homes.checkWorld(world, profile); // saved in an older world: homes bought back, wake at a hospital
  const fresh = freshStart(world, profile);
  if (fresh === 'all') wipeProgress(world, profile);
  if (world.build) profile.build = world.build; // the build this character's state now belongs to (saved with the profile)
  if (!profile.outfit) profile.outfit = playerOutfit(mulberry32(parseInt(profile.pid.slice(0, 8), 16)));
  p = {
    pid: profile.pid, profile, conn, name: profile.name,
    ped: null, inputQ: [], lastInput: { seq: 0, bits: 0, mx: 0, my: 0, aim: 0 }, ack: 0, prevBits: 0,
    known: new Map(), ghostUntil: 0, respawnAt: 0, meDirty: true, meTick: 0, toasts: [],
    faction: FACTION.CITIZEN, badge: false, hunter: false,
    heat: 0, wanted: 0, flareUntil: 0, lastSeenX: 0, lastSeenY: 0, seenAt: 0, searchR: 0, disguised: false,
    bounty: 0, cityBounty: 0, skull: false,   // (bounties.js sync: the bounties on their head, and the skull over it)
    menu: null, job: null, prompt: '', promptKey: '', lastHealAt: 0, deathCause: '',
    joinedAt: world.time, lastPosSave: 0, dev: world.dev, build: world.build,
  };
  noteClientBuild(world, p, opts);
  world.players.set(p.pid, p);
  if (fresh) {
    // a fresh start: at a spawn point (your home if you picked one, else a hospital), on foot, not wanted
    // (and no peak-wanted memory), nothing carried, full health, no police gear left over from a shift
    profile.pos = null; profile.peakWanted = 0; profile.peakWantedAt = 0;
    law.stripPoliceGear(p);
    store.touch();
  }
  spawnPlayerPed(world, p, !fresh);
  if (profile.worldNote) {
    // the world was rebuilt since they last played (homes.checkWorld): say what happened to their homes, once
    world.notify(p, homes.worldNoteText(profile.worldNote), 'warn');
    delete profile.worldNote;
    store.touch();
  } else if (fresh) world.notify(p, fresh === 'all'
    ? `The game was updated: everyone starts over for this one - a brand-new start at ${p.lastSpawnName || 'the hospital'}.`
    : `The game was updated: fresh start at ${p.lastSpawnName || 'the hospital'}. Your money, things and homes are all still yours.`, 'warn');
  else world.notify(p, `Welcome to City Life Auto, ${p.name}. You are a clean Citizen.`, 'info');
  bounties.onJoin(world, p);   // bounties still on their head from before they logged off
  return p;
}

// Coming back to a server running a newer build than the one your character was last on: start fresh
// ('spawn', or 'all' to wipe progress too - CLA_FRESH_ON_UPDATE, server/config.js). A brand-new character
// (never saved anywhere) has nothing to start over.
export function freshStart(world, prof) {
  if (!world.build || world.freshOnUpdate === 'off' || prof.build === world.build) return null;
  if (!prof.build && !prof.pos) return null;
  return world.freshOnUpdate === 'all' ? 'all' : 'spawn';
}

// CLA_FRESH_ON_UPDATE=all: back to a brand-new character (name, look and account kept). Homes go back on
// the market.
function wipeProgress(world, prof) {
  for (const [id, pid] of [...world.homeOwner]) if (pid === prof.pid) world.homeOwner.delete(id);
  const keep = { pid: prof.pid, name: prof.name, created: prof.created, outfit: prof.outfit };
  for (const k of Object.keys(prof)) delete prof[k];
  Object.assign(prof, defaultProfile(keep.pid), keep);
  store.touch();
}

// The page's build (hello): when the server runs a newer one, this page is about to reload to update (see
// leave: no ghost body for that).
function noteClientBuild(world, p, opts) {
  p.clientBuild = typeof opts.clientBuild === 'string' ? opts.clientBuild : null;
  const at = Number(opts.clientBuiltAt) || 0;
  p.updateDue = !!(world.build && p.clientBuild && p.clientBuild !== world.build && (!at || !world.buildAt || at < world.buildAt));
}

// The server found a new build on disk (server/index.js: deploy/auto-update.sh pulled one): tell every page.
// Pages on an older build reload into it (client/update.js) and come back fresh; a page that already runs it
// (it loaded the new files before the server noticed) just carries on.
export function announceBuild(world, b) {
  world.build = b.v; world.buildAt = b.at || 0;
  for (const p of world.players.values()) {
    if (!p.conn) continue;
    if (p.clientBuild === b.v) { p.build = b.v; p.profile.build = b.v; p.updateDue = false; }
    else p.updateDue = true;
    try { p.conn.sendJSON({ t: 'build', v: b.v, at: b.at || 0 }); } catch { /* closed */ }
  }
}

// Is this player's session from before the build the server runs now (or is their page reloading for it)?
const updating = (world, p) => !!(world.build && (p.build !== world.build || p.updateDue));

function standable(world, pos) {
  const m = world.map;
  for (const [dx, dy] of [[0, 0], [12, 0], [-12, 0], [0, 12], [0, -12]]) if (PED_BLOCK[m.tileAtPx(pos.x + dx, pos.y + dy)]) return false;
  const tx = Math.floor(pos.x / TILE), ty = Math.floor(pos.y / TILE);
  for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) for (const e of m.solidProps.get((ty + oy) * m.w + tx + ox) || []) if (!e.off && Math.hypot(e.x - pos.x, e.y - pos.y) < e.r + 10) return false;
  return true;
}

// Where you'll come back to next time: your feet, and whether you're up on the highway deck.
// Not while riding a train (you'd come back in a tunnel or over the tracks): the last spot on
// foot stands.
export function savePos(p, ped) {
  if (!ped || ped.onTrain || ped.sub) return;
  const back = rides.savedSpot(ped); // (up in a balloon or on the wheel: you come back where you boarded)
  if (back) { p.profile.pos = { x: Math.round(back.x), y: Math.round(back.y), lz: 0 }; return; }
  p.profile.pos = { x: Math.round(ped.x), y: Math.round(ped.y), lz: (ped.lz || 0) > 0.5 ? 1 : 0 };
}

function validSpawn(world, pos) {
  if (!pos || typeof pos.x !== 'number') return false;
  const t = world.map.tileAtPx(pos.x, pos.y);
  return !PED_BLOCK[t] && pos.x > 0 && pos.y > 0 && pos.x < world.map.w * TILE && pos.y < world.map.h * TILE;
}

export function spawnPlayerPed(world, p, useSaved, deathPos = null) {
  const prof = p.profile;
  let pos;
  let lz = 0;
  if (useSaved && prof.pos && typeof prof.pos.x === 'number') {
    // the world may have changed under the spot you logged out on (a new build): a building,
    // fence or gate may stand there now, or close round it. Up on the highway deck you stay up
    // there if the deck still is; anywhere else you're put on the nearest ground you can actually
    // walk away from (out of any closed-in pocket, to the street).
    const sp = prof.pos;
    const deckZ = sp.lz === 1 ? surfaceZ(world.map, sp.x, sp.y, 1) : null;
    if (deckZ !== null) { pos = sp; lz = deckZ; }
    else {
      const ok = validSpawn(world, sp) && standable(world, sp) && unstuck.canWalkOut(world.map, sp.x, sp.y);
      const to = ok ? sp : unstuck.safeSpot(world.map, sp.x, sp.y);
      prof.pos = to ? { x: to.x, y: to.y } : null;
      pos = prof.pos;
    }
  }
  if (!pos) {
    pos = homes.resolveSpawn(world, p, p.respawnChoice, deathPos);
    p.lastSpawnName = pos.name;
    p.respawnChoice = null;
  }
  const at = useSaved && pos === prof.pos ? { x: pos.x, y: pos.y } : homes.spawnSpot(world, pos.x, pos.y);
  const ped = world.spawnPed(at.x, at.y, {
    hp: 100, app: { ...prof.outfit }, archetype: 'player', name: p.name,
  });
  if (lz && pos === prof.pos) ped.lz = lz;
  ped.player = p;
  ped.weapon = 'fists';
  for (const id of Object.keys(prof.weapons)) {
    const w = WEAPONS[id];
    if (w && w.mag) ped.mag[id] = Math.min(w.mag, prof.weapons[id] || 0);
  }
  p.ped = ped;
  economy.syncLight(world, p); // a flashlight left switched on is still on
  homes.protect(world, ped); // ~2 s of blinking: move freely, can't shoot or be hurt
  p.faction = FACTION.CITIZEN; p.badge = false; p.hunter = false;
  p.heat = 0; p.wanted = 0; p.flareUntil = 0; p.disguised = false;
  p.respawnAt = 0; p.policeKill = false; p.custody = null;
  p.meDirty = true;
  p.known = new Map();
  return ped;
}

export function leave(world, p) {
  if (!p) return;
  if (p.devMode) devmode.exit(world, p, true); // dev mode ends with the session (progress made in it is kept)
  custody.onLeave(world, p);   // (logging out in custody: booked on the spot)
  p.conn = null;
  p.inputQ = [];
  p.lastInput = { seq: p.lastInput.seq, bits: 0, mx: 0, my: 0, aim: p.lastInput.aim };
  // reloading to update (the server runs a newer build than this session or page): no ghost body and no
  // drop rule - they're straight back on the new build
  if (p.ped && !p.ped.dead && !updating(world, p)) {
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
    savePos(p, ped);
    world.remove(ped);
  }
  p.profile.lastSeen = Date.now();
  store.touch();
  world.players.delete(p.pid);
  law.onPlayerGone(world, p);
  rentals.onPlayerGone(world, p);
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
  const canMove = !ped.dead && now >= ped.downUntil && now >= ped.stunUntil && !ped.vehId && !ped.hidden && !ped.onTrain && !ped.cuffed;
  let speedMul = 1;
  if (ped.carrying) speedMul *= 0.6; // GDD: carrying scales walking speed down by 40%
  if (ped.buffs.energy > now) speedMul *= 1.15;
  if (ped.fishing) speedMul *= 0;
  if (ped.limpUntil > now) speedMul *= REVIVE_LIMP_SPEED; // just revived bare-handed: limping
  return {
    canMove, canSprint: !ped.carrying, speedMul, tumble: now < (ped.tumbleUntil || 0), air: now < (ped.airUntil || 0),
    canSwim: !!ped.player || isSwimming(world.map, ped), // players swim anywhere; NPCs only get out of water
    regenMul: ped.buffs.coffee > now ? 2.2 : 1,
    staminaMax: ped.buffs.energy > now ? 140 : 100,
  };
}

const HOLD_TICKS = 5; // wait up to 250 ms for a late input before extrapolating

export function processInputs(world, dt) {
  for (const p of world.players.values()) {
    // One simulation step per input, exactly like the client's prediction: consume one input per
    // tick, two when the client's queue backs up, and if this tick's input is late (phone timer
    // jitter, network hiccup) hold the character / car for up to HOLD_TICKS instead of guessing
    // with the last input - guessing put the server a step ahead and made the car jitter.
    const n = p.inputQ.length > 3 ? 2 : 1;
    const ped = p.ped;
    const drivingV = ped && ped.vehId && ped.seat === 0 ? world.get(ped.vehId) : null;
    if (drivingV && !drivingV.wreckAt && !drivingV.scripted && !drivingV.onDeck) drivingV.ownStepTick = world.tick;
    for (let k = 0; k < n; k++) {
      let inp;
      if (p.inputQ.length) { inp = p.inputQ.shift(); p.ack = inp.seq; p.lastInput = inp; p.starve = 0; }
      else if (p.conn && (p.starve || 0) < HOLD_TICKS) { p.starve = (p.starve || 0) + 1; break; }
      else inp = p.conn ? p.lastInput : { seq: p.ack, bits: 0, mx: 0, my: 0, aim: p.lastInput.aim };
      if (!ped || ped.dead || ped.removed) { p.prevBits = inp.bits; continue; }
      const pressed = inp.bits & ~p.prevBits;
      p.prevBits = inp.bits;
      applyInput(world, p, ped, inp, pressed, dt);
      const v = ped.vehId && ped.seat === 0 ? world.get(ped.vehId) : null;
      if (v && !v.wreckAt && !v.scripted && !v.onDeck && !v.ferry) { v.ownStepTick = world.tick; vehicles.stepVehicle(world, v, dt); props.smashFor(world, v); }   // (a car on a ferry's deck is held there)
    }
  }
}

function applyInput(world, p, ped, inp, pressed, dt) {
  if (ped.cuffed || custody.inCell(p)) return;   // (in custody: custody.js moves them; the jail screen has the bail)
  if (pressed & IN.LIGHT) economy.toggleLight(world, p); // the flashlight (in the bag, no hand slot)
  if (ped.hidden) { // inside your home: E brings up the home menu (Leave is on it); on a ride: nothing to do but look
    if ((pressed & (IN.ACTION | IN.VEHICLE)) && !ped.ride) { if (ped.interior) station.openInterior(world, p); else homes.openInside(world, p); }
    return;
  }
  ped.aimAngle = inp.aim;
  if (inp.bits & IN.AIMING) ped.aimUntil = world.time + 0.3;
  if (pressed & IN.NEXTW) combat.cycleWeapon(world, ped, 1);
  if (pressed & IN.PREVW) combat.cycleWeapon(world, ped, -1);
  if (pressed & IN.RELOAD) combat.reload(world, ped);
  if (pressed & IN.USE) economy.useHealItem(world, p);

  if (ped.onTrain) { trains.riderInput(world, p, ped, inp, pressed, dt); return; }

  if (ped.vehId) {
    const v = world.get(ped.vehId);
    if (!v) { ped.vehId = 0; ped.seat = -1; return; }
    if (ped.seat === 0) {
      const di = driveInput(v, inp);
      v.input.throttle = di.throttle;
      v.input.steer = di.steer;
      v.input.hb = di.hb;
      v.input.slide = di.slide;
      v.input.drv = di.drv;
      if (inp.bits & IN.HORN) v.hornUntil = world.time + 0.2;
      if ((pressed & IN.HORN) && v.def.police) v.sirenOn = !v.sirenOn;
    }
    if ((inp.bits & IN.FIRE) && (inp.bits & IN.AIMING)) {
      const w = WEAPONS[ped.weapon];
      if (w && (w.type === 'gun')) combat.tryAttack(world, ped, inp.aim);
    }
    if ((pressed & IN.VEHICLE) && !v.scripted) vehicles.exitVehicle(world, ped);
    if (pressed & IN.ACTION) { const act = findInteraction(world, p); if (act) act.run(); }
    return;
  }

  // on foot
  if (ped.fishing && (Math.abs(inp.mx) > 0.3 || Math.abs(inp.my) > 0.3)) jobs.cancelFishing(world, p, 'You reeled in your line.');
  const tumbling = world.time < (ped.tumbleUntil || 0);
  const fr = world.time < (ped.airUntil || 0) ? AIR_FRICTION : TUMBLE_FRICTION;
  const v0 = tumbling ? Math.hypot(ped.vx, ped.vy) : 0;
  const wasDropping = !!ped.dropping;
  pedStep(ped, inp, dt, world.map, { ...pedMods(world, ped), analog: true });
  if (ped.hardLanding) { ped.hardLanding = false; combat.damage(world, ped, 45, null, 'fall'); ped.tumbleUntil = world.time + 0.8; }
  // down a waterfall or off its cliff (shared/ledges.js): a splash at the foot, or a thud on dry ground
  if (wasDropping && !ped.dropping) world.emit(ped.x, ped.y, isSwimming(world.map, ped) ? { e: 'splash', x: ped.x, y: ped.y, n: 16 } : { e: 'thud', x: ped.x, y: ped.y });
  if (tumbling) tumbleImpact(world, ped, v0, dt, fr);
  if (ped.rollT > 0 && (p.badge || p.hunter)) tackle(world, ped);
  const swung = golf.input(world, p, ped, inp, pressed, dt) || hoops.input(world, p, ped, inp, pressed, dt);   // (by your golf ball the attack button swings the club; on the court with a ball, it shoots)
  const kicked = !swung && (pressed & IN.FIRE) && !ped.carrying && minigames.tryKick(world, ped, (inp.bits & IN.AIMING) ? inp.aim : ped.a);
  if ((inp.bits & IN.FIRE) && !kicked && !swung) {
    if (ped.carrying) { if (pressed & IN.FIRE) cargo.throwCrate(world, ped, inp.aim); }
    else if (!ped.fishing) combat.tryAttack(world, ped, (inp.bits & IN.AIMING) ? inp.aim : ped.a);
  }
  if (pressed & IN.THROW) { if (ped.carrying) cargo.throwCrate(world, ped, (inp.bits & IN.AIMING) ? inp.aim : ped.a); }
  if ((pressed & IN.VEHICLE) && !revive.tryFinish(world, p)) vehicles.tryEnter(world, ped);
  if (pressed & IN.ACTION) {
    const act = findInteraction(world, p);
    if (act) act.run();
  }
}

// Sliding along the tarmac after bailing out / being blown out of a car: slamming into a wall,
// a car or a lamp post at speed hurts, a lot.
export function tumbleImpact(world, ped, v0, dt, friction = TUMBLE_FRICTION) {
  const expect = v0 * Math.exp(-friction * dt);
  let v1 = Math.hypot(ped.vx, ped.vy);
  let lost = expect - v1;
  // parked / moving cars and solid props stop you too
  if (v1 > 60) {
    for (const e of world.query(ped.x, ped.y, 40, 2)) {
      if (e.removed || ped.vehId === e.id || (e.id === ped.bailFrom && world.time < (ped.bailFromUntil || 0))) continue;
      if (Math.hypot(e.x - ped.x, e.y - ped.y) > Math.max(e.def.L, e.def.W) / 2 + 6) continue;
      lost = Math.max(lost, v1 - 20);
      const a = Math.atan2(ped.y - e.y, ped.x - e.x);
      ped.vx = Math.cos(a) * 40; ped.vy = Math.sin(a) * 40;
      v1 = 40;
      break;
    }
  }
  if (lost < 90) return;
  if (ped.tumbleSoft) { ped.tumbleUntil = 0; ped.airUntil = 0; return; } // a gentle bail: you bump to a stop, no harm done
  world.emit(ped.x, ped.y, { e: 'crash', x: ped.x, y: ped.y, p: Math.min(0.6, lost / 700) });
  world.emit(ped.x, ped.y, { e: 'blood', x: ped.x, y: ped.y, a: Math.atan2(ped.vy, ped.vx), n: 6 });
  ped.tumbleUntil = 0; ped.airUntil = 0;
  ped.downUntil = Math.max(ped.downUntil, world.time + 1.2);
  combat.damage(world, ped, (lost - 70) * 0.22, null, 'bail', Math.atan2(ped.vy, ped.vx));
}

// Diving into a wanted suspect tackles them to the ground (officers and bounty hunters).
function tackle(world, ped) {
  for (const e of world.query(ped.x, ped.y, 26, 1)) {
    if (e === ped || e.dead || e.vehId || world.time < e.downUntil) continue;
    if (!law.isSuspectFor(world, ped.player, e)) continue;
    const a = Math.atan2(e.y - ped.y, e.x - ped.x);
    e.vx = Math.cos(a) * 180; e.vy = Math.sin(a) * 180;
    e.downUntil = world.time + 1.5; e.rollT = 0;
    law.subdue(world, ped, e);
    ped.rollT = 0; ped.vx *= 0.2; ped.vy *= 0.2;
    world.emit(e.x, e.y, { e: 'knockdown', x: e.x, y: e.y, id: e.id });
    world.notify(ped.player, 'Tackled! Walk up and cuff them.', 'good');
    return;
  }
}

// ---------------------------------------------------------------------------
// Context-sensitive interaction (GDD §13: E key manages context interactions)
export function findInteraction(world, p) {
  const ped = p.ped;
  if (!ped || ped.dead || ped.cuffed || custody.inCell(p)) return null;
  if (ped.ride) return { label: rides.aboardLabel(world, ped), passive: true, run: () => {} };
  if (ped.hidden && ped.interior) return { label: ped.interior.kind === 'armory' ? 'Armory - pick a weapon / out to the motor pool' : 'Front desk', run: () => station.openInterior(world, p) };
  if (ped.hidden) return { label: 'Inside your home - open the home menu', run: () => homes.openInside(world, p) };
  if (ped.entering) return { label: 'Going inside... (stand still)', run: () => {} };
  if (ped.onTrain) return trains.interaction(world, p);
  if (!ped.vehId) { const rv = revive.interaction(world, p); if (rv) return rv; }
  if (ped.vehId) {
    const hop = trains.interaction(world, p);
    if (hop) return hop;
    if (ped.fishing) {
      if (ped.fishing.biteAt && world.time >= ped.fishing.biteAt && world.time <= ped.fishing.biteAt + ped.fishing.window) return { label: 'REEL IN NOW!', run: () => jobs.reelIn(world, p) };
      return { label: 'Waiting for a bite... (drive off to stop)', run: () => jobs.reelIn(world, p) };
    }
    if (p.profile.weapons.rod !== undefined) {
      const spot = jobs.boatFishingSpot(world, ped);
      if (spot) return { label: 'Fish offshore (deep-sea)', run: () => jobs.castLine(world, p, spot) };
    }
    return transit.rideInteraction(world, p) || ferries.interaction(world, p) || rentals.vehicleInteraction(world, p) || homes.vehicleInteraction(world, p);
  }
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

  {   // a prisoner you took, a police car of yours by them: in the back with them
    const load = custody.interaction(world, p);
    if (load) return load;
  }
  if (p.badge) {
    const target = law.arrestTarget(world, p);
    if (target) return { label: target.dead ? 'Book the suspect\'s body' : `Cuff ${target.name || 'suspect'}`, run: () => law.arrest(world, ped, target) };
  }
  {   // a bounty target you took the contract on, down within reach: bring them in alive
    const target = bounties.detainTarget(world, p);
    if (target) return { label: `Detain ${target.player.name} (collect the bounty)`, run: () => bounties.detain(world, ped, target) };
  }

  const bag = cargo.nearestBag(world, ped, true);
  if (bag) return { label: cargo.bagLabel(bag, p), run: () => cargo.lootBag(world, p, bag) };

  const crate = cargo.nearestCrate(world, ped);
  if (crate) return { label: crate.state === 'loaded' ? `Unload ${crateName(crate)}` : `Pick up ${crateName(crate)}`, run: () => cargo.pickUp(world, ped, crate) };

  const hap = happenings.interaction(world, p);   // a street fight to break up, someone to help up, a wallet to give back
  if (hap) return hap;

  const pet = pets.interaction(world, p);
  if (pet) return pet;

  const victim = jobs.purseVictimNear(world, p);
  if (victim) return { label: 'Return the purse (+Samaritan)', run: () => jobs.returnPurse(world, p, victim) };

  const train = trains.interaction(world, p);
  if (train) return train;
  const bus = transit.interaction(world, p);   // a bus waiting at the stop you're at: board it
  if (bus) return bus;
  const ferry = ferries.interaction(world, p);   // a ferry in at the pier: board it
  if (ferry) return ferry;

  const poi = world.map.poiNear(ped.x, ped.y);
  if (poi && poi.kind !== 'reception') {
    const label = economy.poiLabel(world, p, poi);
    if (label) return { label, run: () => economy.openMenu(world, p, poi) };
  }

  const fruit = picking.interaction(world, p);
  if (fruit) return fruit;
  const wild = foraging.interaction(world, p);
  if (wild) return wild;
  const stranger = wanderer.interaction(world, p);
  if (stranger) return stranger;
  const game = hunting.interaction(world, p);
  if (game) return game;
  const fire = campfires.interaction(world, p);
  if (fire) return fire;
  const place = places.interaction(world, p);
  if (place) return place;
  const ride = rides.interaction(world, p);
  if (ride) return ride;
  const tee = golf.interaction(world, p);
  if (tee) return tee;
  const hoop = hoops.interaction(world, p);
  if (hoop) return hoop;

  if (p.profile.weapons.rod !== undefined) {
    const spot = jobs.fishingSpot(world, ped);
    if (spot) return { label: 'Cast fishing line', run: () => jobs.castLine(world, p, spot) };
  }

  const sale = dealer.saleNear(world, ped);
  if (sale) return { label: `Buy ${sale.def.name} - $${sale.forSale.price.toLocaleString()}`, run: () => { const err = dealer.buy(world, p, sale, economy.payFrom); if (err) world.notify(p, err, 'bad'); } };
  const v = vehicles.nearestVehicle(world, ped, 56);
  if (v) return { label: `Enter ${v.def.name}`, key: 'F', run: () => vehicles.tryEnter(world, ped) };
  return transit.stopNote(world, p);   // at a bus stop with nothing else to do: the line and when its next bus comes
}

export function crateName(c) {
  return c.label || ['', 'Wood Box', 'Steel Barrel', 'Iron Vault', 'Carbon-Gold Case'][c.tier];
}

// ---------------------------------------------------------------------------
export function onPedDeath(world, ped, killer, cause) {
  const p = ped.player;
  if (!p) return;
  custody.onDeath(world, p);
  revive.clearDown(world, p);
  p.channel = null; p.giveTo = null;
  p.downWanted = p.wanted > 0 ? { wanted: p.wanted, heat: p.heat, city: p.cityBounty || 0 } : null; // restored if someone revives you
  p.respawnAt = world.time + RESPAWN_SECONDS;
  // killed by the police (an officer, SWAT, the FBI, the army, an officer on duty): you wake up in the nearest hospital
  p.policeKill = !!killer && !!((killer.npc && killer.npc.role === 'cop') || (killer.player && killer.player.badge));
  p.respawnChoice = homes.defaultChoice(world, p, { x: ped.x, y: ped.y }); // pre-selected; change it on the death screen
  p.deathCause = cause || 'You flatlined.';
  p.profile.stats.deaths++;
  if (p.badge) { world.notify(p, 'Your badge was stripped. Return to Police HQ to re-deploy.', 'bad'); law.stripPoliceGear(p); }
  ped.bookable = p.wanted > 0 ? { pid: p.pid, stars: p.wanted } : null; // police can still book the body
  p.badge = false; p.hunter = false; p.faction = FACTION.CITIZEN;
  p.profile.peakWanted = 0;
  p.heat = 0; p.wanted = 0; p.disguised = false;
  p.cityBounty = 0; bounties.sync(world, p);   // the city's bounty goes with the stars; the ones placed on you stick
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
    if (ped) economy.syncLight(world, p); // the flashlight goes out when you go down or lose it
    if (p.ghostUntil && now >= p.ghostUntil) {
      // GDD §9 drop rule: timer expired -> body despawns, everything on them jettisoned (not when an
      // update came out meanwhile: they come back fresh on it instead)
      finalizeLogout(world, p, !updating(world, p));
      continue;
    }
    if (ped && ped.dead && p.respawnAt && now >= p.respawnAt) {
      if (!p.conn) { finalizeLogout(world, p, false); continue; }
      // leave a body for EMS, respawn clean at hospital
      revive.clearDown(world, p); p.downWanted = null;
      const body = world.spawnPed(ped.x, ped.y, { hp: 100, app: ped.app, archetype: 'casual', name: '' });
      body.dead = true; body.deadAt = now; body.a = ped.a; body.corpseOf = p.pid; body.bookable = ped.bookable || null;
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
    if (now - p.lastPosSave > 5) { p.lastPosSave = now; savePos(p, ped); store.touch(); }
    // prompt every 4 ticks
    if ((world.tick + (ped.id & 3)) % 4 === 0 && p.conn) {
      const act = findInteraction(world, p);
      const label = act ? (act.passive ? act.label : `${act.key || 'E'}: ${act.label}`) : '';   // (passive: just a note, no button - on a ride)
      if (label !== p.prompt) { p.prompt = label; p.meDirty = true; }
    }
  }
}

export function pedFlags(world, ped) {
  const now = world.time;
  let f = 0;
  if (ped.dead) f |= PF.DEAD;
  if (now < ped.downUntil || ped.passedOut) f |= PF.DOWN;
  if (ped.npc && ped.npc.state === 'crawl') f |= PF.DOWN | PF.ROLL; // (down + rolling: crawling along on the stomach)
  if (now < ped.stunUntil) f |= PF.STUN;
  if (ped.vehId) { if (ped.seat > 0) f |= PF.PASSENGER; } else if (ped.prevBits & IN.SPRINT && Math.hypot(ped.vx, ped.vy) > 140) f |= PF.SPRINT;
  if (now < ped.attackAnimUntil) f |= PF.ATTACK;
  if (now < ped.aimUntil) f |= PF.AIM;
  if (ped.rollT > 0) f |= PF.ROLL;
  if (ped.carrying || ped.handsUp) f |= PF.CARRY; // carry pose doubles as hands-up for a held-up clerk
  if (ped.vehId) f |= PF.INVEH;
  if (ped.bleeding || ped.limpUntil > now) f |= PF.BLEED; // (a limp leaves the same trail of blood)
  if (ped.player && ped.player.ghostUntil) f |= PF.GHOST;
  if (now < ped.flareUntil) f |= PF.FLARE;
  if (ped.player && ped.player.badge) f |= PF.BADGE;
  if (ped.npc && ped.npc.role === 'cop') f |= PF.BADGE;
  if (Math.abs(ped.vx) + Math.abs(ped.vy) > 20) f |= PF.MOVING;
  if (ped.fishing || now < (ped.kneelUntil || 0)) f |= PF.FISHING; // (a medic kneeling at a body shares the fishing bit; the client tells them apart)
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
    rob: robbery.hudFor(world, p), train: trains.meInfo(world, p), pedId: ped ? ped.id : 0, interior: ped && ped.interior ? ped.interior.kind : null, dead: ped ? ped.dead : true, respawnIn: p.respawnAt ? Math.max(0, p.respawnAt - world.time) : 0, deathCause: p.deathCause,
    cash: prof.cash, bank: prof.bank, cexp: prof.criminalExp, sam: prof.samaritan,
    wanted: p.wanted, heat: Math.round(p.heat), peak: prof.peakWanted, disguised: p.disguised,
    faction: p.badge ? 'enforcer' : p.hunter ? 'hunter' : (p.wanted > 0 ? 'criminal' : 'citizen'),
    weapon: ped ? ped.weapon : 'fists', weapons, inv, bleeding: ped ? ped.bleeding : false, light: !!(ped && ped.flashOn),
    carrying: ped && ped.carrying ? (world.get(ped.carrying)?.tier || 0) : 0,
    prompt: p.prompt, custody: custody.meInfo(world, p), job: custody.deliveryFor(world, p) || places.mazeTarget(world, p) || places.lapTarget(world, p) || hoops.targetFor(world, p) || golf.targetFor(world, p) || minigames.targetFor(world, p) || races.targetFor(world, p) || phone.jobTarget(world, p),
    radar: packRadar(world, p, law.radarFor(world, p)), bounty: p.bounty, btime: bounties.meInfo(p),
    dispatch: law.dispatchFor(world, p), rank: p.badge ? law.POLICE_RANKS[law.policeRank(prof)].name : null, felonies: prof.felonies || 0,
    rumor: world.dropRumor ? { x: Math.round(world.dropRumor.x), y: Math.round(world.dropRumor.y), r: 420, t: world.dropRumor.tier } : null, ghost: !!p.ghostUntil,
    fishing: ped && ped.fishing ? { bite: !!(ped.fishing.biteAt && world.time >= ped.fishing.biteAt) } : null,
    reloading: ped ? world.time < ped.reloadUntil : false,
    buffs: ped ? { coffee: Math.max(0, (ped.buffs.coffee || 0) - world.time), energy: Math.max(0, (ped.buffs.energy || 0) - world.time), wine: Math.max(0, (ped.buffs.wine || 0) - world.time), hearty: Math.max(0, (ped.buffs.hearty || 0) - world.time), scent: Math.max(0, (ped.buffs.scent || 0) - world.time) } : {},
    vehicles: prof.vehicles.map((v) => v.model),
    garageCap: homes.garageCap(world, prof),
    homes: homes.ownedHomes(world, prof).map((h) => ({ id: h.id, name: h.name, x: Math.round(h.x), y: Math.round(h.y) })),
    spawnOpts: ped && ped.dead ? homes.spawnOptions(world, p) : null, spawnChoice: p.respawnChoice || null,
    cruiser: cruiser.stateFor(world, p), happen: events.forPlayer(world, p), misconduct: law.misconductFor(p), suspects: law.suspectsFor(world, p),
    dev: p.dev, devMode: !!p.devMode, god: !!p.invincible,
    quick: economy.quickSlots(p), down: revive.downState(world, p), limp: !!(ped && ped.limpUntil > world.time),
    ride: rides.meInfo(world, p), bus: transit.rideInfo(world, p) || ferries.rideInfo(world, p), taxi: transit.taxiInfo(world, p), golf: golf.meInfo(world, p), hoops: hoops.meInfo(world, p),
    arrows: ped && world.arrows && world.arrows.length ? world.arrows.filter((a) => a.owner === ped.id && Math.abs(a.x - ped.x) < 1600 && Math.abs(a.y - ped.y) < 1600).slice(-16).map((a) => [Math.round(a.x), Math.round(a.y), +a.a.toFixed(2)]) : null,
  };
}
