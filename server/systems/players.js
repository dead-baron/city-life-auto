// Player sessions: join/leave (30-second Ghost State), input application, context
// interactions, death + respawn, persistence sync and HUD prompts.
import { PF, FACTION, TILE, K, WEATHER } from '../../shared/constants.js';
import { IN } from '../../shared/input.js';
import { WEAPONS, ITEMS } from '../../shared/items.js';
import * as skydive from './skydive.js';
import * as surf from './surf.js';
import * as tennis from './tennis.js';
import * as prison from './prison.js';
import * as aircraft from './aircraft.js';   // (at the controls of an aircraft)
import { pedStep, driveInput, TUMBLE_FRICTION, AIR_FRICTION } from '../../shared/physics.js';
import { PED_BLOCK, isSwimming } from '../../shared/map.js';
import { surfaceZ } from '../../shared/levels.js';
import { mulberry32 } from '../../shared/rng.js';
import * as looks from './looks.js';
import { store, defaultProfile } from '../store.js';
import * as vehicles from './vehicles.js';
import * as carhits from './carhits.js';
import * as combat from './combat.js';
import * as tank from './tank.js';   // (H58)
import * as cargo from './cargo.js';
import * as skate from './skate.js';   // (riding a skateboard: the owner, 2026-10-17)
const packRadar = (world, p, out) => { cargo.packRadar(world, p, out); crews.radar(world, p, out); return out; };   // (+ your crewmates: crews.js)   // + the backpack you dropped when you died
import * as law from './law.js';
import * as bounties from './bounties.js';
import * as economy from './economy.js';
import * as jobs from './jobs.js';
import * as fishing from './fishing.js';   // (the rod, the bite, the fight: task #277)
import * as picking from './picking.js';
import * as foraging from './foraging.js';
import * as hunting from './hunting.js';
import * as campfires from './campfires.js';
import * as wanderer from './wanderer.js';
import * as places from './places.js';
import * as rides from './rides.js';
import * as golf from './golf.js';
import * as hoops from './hoops.js';
import * as bowling from './bowling.js';
import * as cinema from './cinema.js';
import * as drivein from './drivein.js';
import * as homes from './homes.js';
import * as homeinside from './homeinside.js';
import * as rentals from './rentals.js';
import * as horses from './horses.js';
import * as pets from './pets.js';
import * as happenings from './happenings.js';
import * as streetlife from './streetlife.js';
import * as personas from './personas.js';
import * as wildfolk from './wildfolk.js';
import * as unstuck from './unstuck.js';
import * as station from './station.js';
import * as dealer from './dealer.js';
import * as races from './races.js';
import * as minigames from './minigames.js';
import * as robbery from './robbery.js';
import * as heist from './heist.js';
import * as crews from './crews.js';
import { cleanName, nameKey, NAME } from '../../shared/names.js';
import * as cruiser from './cruiser.js';
import * as events from './events.js';
import * as phone from './phone.js';
import * as props from './props.js';
import * as trains from './trains.js';
import * as transit from './transit.js';
import * as ferries from './ferries.js';

import { GHOST_SECONDS, RESPAWN_SECONDS, REVIVE_LIMP_SPEED, TACKLE_SCRAMBLE, GUARD, NPC_GUARD } from '../../shared/rules.js';
import { K9 } from '../../shared/rules-play.js';
// A disconnected player with nothing after them (not wanted, not hurt in the last AWAY_HURT_S, no cargo: a phone switching
// apps) waits AWAY_SECONDS rather than GHOST_SECONDS and logs out without dropping anything. (Here, not in shared/rules.js:
// a change there re-keys World v3's world and art - tools/stamp-version.mjs world3Hash - and every browser and the server
// would fetch and bake them all again for two server-only numbers. They move there with the next change to the world.)
export const AWAY_SECONDS = 300;
export const AWAY_HURT_S = 60;
import * as felling from './felling.js';
import * as lights from './lights.js';
import * as revive from './revive.js';
import * as custody from './custody.js';
import * as struggle from './struggle.js';
import * as stops from './stops.js';
import * as cells from './cells.js';
import * as devmode from '../devmode.js';
import * as underground from './underground.js';
import * as dance from './dance.js';
import * as safety from './safety.js';
import * as sar from './sar.js';
import * as coastguard from './coastguard.js';
import * as gardening from './gardening.js';
import * as farming from './farming.js';
import * as firefighter from './firefighter.js';
import * as paramedic from './paramedic.js';
import * as taxijob from './taxijob.js';
import * as busjob from './busjob.js';
import * as towjob from './towjob.js';
import * as skills from './skills.js';
import * as streetdice from './streetdice.js';
import * as workout from './workout.js';
import * as casino from './casino.js';
import * as arcade from './arcade.js';
import * as biz from './biz.js';

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
    p.ghostUntil = 0; p.ghostSafe = false; p.away = 0;
    stillHere(p);   // (back: the idle clock starts again)
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
    p.cineF = null;   // (and out of the cinematic mode's follow scenes: cinefollow.js)
    // (inside a home: the new page has never seen its rooms - all of it again, the menu you had open closed; the owner,
    // 10-16: "Reconnecting inside a home leaves you stuck")
    if (p.ped && p.ped.home) { p.homeMenu = null; p.ped.home.mv = false; homeinside.send(world, p, true); }
    world.notify(p, 'Reconnected - you made it back before your ghost timer ran out.', 'good');
    return p;
  }
  homes.checkWorld(world, profile); // saved in an older world: homes bought back, wake at a hospital
  const replanned = homes.replanDecor(world, profile);   // (a home's rooms changed under its furniture: back in storage)
  looks.ensureLook(profile); // (an old random outfit becomes a look - before a wipe, which keeps it; a new player wears a starter until they pick)
  const fresh = freshStart(world, profile);
  if (fresh === 'all') wipeProgress(world, profile);
  if (world.build) profile.build = world.build; // the build this character's state now belongs to (saved with the profile)
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
  skate.convert(world, p);   // (a skateboard in an old bag: your own board now - skate.js)
  if (profile.worldNote) {
    // the world was rebuilt since they last played (homes.checkWorld): say what happened to their homes, once
    world.notify(p, homes.worldNoteText(profile.worldNote), 'warn');
    delete profile.worldNote;
    store.touch();
  } else if (fresh) world.notify(p, fresh === 'all'
    ? `The game was updated: everyone starts over for this one - a brand-new start at ${p.lastSpawnName || 'the hospital'}.`
    : `The game was updated: fresh start at ${p.lastSpawnName || 'the hospital'}. Your money, things and homes are all still yours.`, 'warn');
  else world.notify(p, `Welcome to City Life Auto, ${p.name}. You are a clean Citizen.`, 'info');
  if (replanned) world.notify(p, `The rooms at ${replanned.join(' and ')} have changed (a mansion now). Your furniture there is back in storage: place it again from the hall table.`, 'info');
  bounties.onJoin(world, p);   // bounties still on their head from before they logged off
  if (fresh) delete profile.jail; else custody.onJoin(world, p);   // (logged off in custody: back in the cell)
  if (!fresh) backInside(world, p);   // (logged off at home: back in it)
  return p;
}

// Logged off inside your own home (the ghost timer ran out, or the server restarted under you - savePos keeps which):
// you're back inside it. Not if it isn't yours any more (sold, foreclosed, the world rebuilt), nor from someone else's
// home or a look round one for sale: then you're out on the street by its door (spawnPlayerPed: the saved spot is the
// door, the nearest ground you can walk from). The owner, 10-16: "Reconnecting inside a home leaves you stuck: restore
// inside, or spawn outside if someone else holds the claim".
function backInside(world, p) {
  const prof = p.profile, id = prof.inHome, ped = p.ped;
  if (typeof id !== 'number' || !ped || ped.dead || ped.hidden || p.custody || ped.cuffed) return;
  const h = homes.homeById(world, id);
  if (!h || h.gone || h.isLobby || world.homeOwner.get(h.id) !== p.pid) return;
  homes.goInside(world, p, h);
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
  const keep = { pid: prof.pid, name: prof.name, created: prof.created, look: prof.look, lookPicked: prof.lookPicked, lookIntro: prof.lookIntro, looks: prof.looks, wardrobe: prof.wardrobe };   // (and the clothes they own: looks.js)
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
  for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) for (const e of m.solidProps.get(m.idx(tx + ox, ty + oy)) || []) if (!e.off && Math.hypot(e.x - pos.x, e.y - pos.y) < e.r + 10) return false;
  return true;
}

// Where you'll come back to next time: your feet, and whether you're up on the highway deck.
// Not while riding a train (you'd come back in a tunnel or over the tracks): the last spot on
// foot stands.
export function savePos(p, ped) {
  if (!ped || ped.onTrain || ped.sub) return;
  // (inside your own home: which - you're back in it next time; players.backInside)
  const s = ped.home;
  if (s && ped.hidden && !s.tour && !s.guest && !s.lobby && !s.arcade && ped.inside === s.id) p.profile.inHome = s.id; else delete p.profile.inHome;
  const back = rides.savedSpot(ped); // (up in a balloon or on the wheel: you come back where you boarded)
  if (back) { p.profile.pos = { x: Math.round(back.x), y: Math.round(back.y), lz: 0 }; return; }
  p.profile.pos = { x: Math.round(ped.x), y: Math.round(ped.y), lz: (ped.lz || 0) > 0.5 ? 1 : 0 };
}

function validSpawn(world, pos) {
  if (!pos || typeof pos.x !== 'number') return false;
  const t = world.map.tileAtPx(pos.x, pos.y);
  return !PED_BLOCK[t] && pos.x > world.map.x0 * TILE && pos.y > world.map.y0 * TILE && pos.x < (world.map.x0 + world.map.w) * TILE && pos.y < (world.map.y0 + world.map.h) * TILE;
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
    hp: skills.baseHp(p), app: looks.appOf(prof), archetype: 'player', name: p.name,   // (more with constitution: skills.js)
  });
  ped.baseHp = ped.maxHp;
  if (lz && pos === prof.pos) ped.lz = lz;
  ped.player = p;
  ped.weapon = 'fists';
  ped.blade = prof.blade | 0;   // the plasma blade's colour (looks.js setBlade; net.js descriptor bc)
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
  struggle.onLeave(world, p);  // (logging out mid-struggle: the cuffs go on...)
  custody.onLeave(world, p);   // (logging out in custody: booked on the spot)
  p.conn = null;
  p.inputQ = [];
  p.lastInput = { seq: p.lastInput.seq, bits: 0, mx: 0, my: 0, aim: p.lastInput.aim };
  // reloading to update (the server runs a newer build than this session or page): no ghost body and no
  // drop rule - they're straight back on the new build
  if (p.ped && !p.ped.dead && !updating(world, p)) {
    // nothing after them: the body waits longer and goes without dropping anything (a phone switching apps - the owner,
    // 2026-10-15: "tabbing out of the game for a second on mobile boots you out"); otherwise the drop rule's 30 s
    p.ghostSafe = safeToIdle(world, p);
    p.ghostUntil = world.time + (p.ghostSafe ? AWAY_SECONDS : GHOST_SECONDS);
  } else {
    finalizeLogout(world, p, false);
  }
}

// Safe to stand idle with nobody at the keys: not wanted, not hurt lately, not down, not in custody, carrying no crate and
// driving none.
export function safeToIdle(world, p) {
  const ped = p.ped;
  if (!ped || ped.dead || p.wanted > 0 || p.heat >= 1 || p.custody || p.prison || ped.cuffed || ped.carrying || p.bounty > 0 || p.skull) return false;   // (a bounty on your head: hunted)
  if (world.time < (ped.downUntil || 0) || world.time - (ped.lastHitAt || -1e9) < AWAY_HURT_S) return false;
  const v = ped.vehId ? world.get(ped.vehId) : null;
  if (v && v.cargo && v.cargo.some((c) => c)) return false;
  return true;
}
// The page went into the background ({ t: 'away' }: a phone switching apps, a hidden tab - main.js): nothing is sent to
// it meanwhile (net.js: a page in the background reads nothing, and what piled up was what got it dropped) and its keys
// are let go, so the character stands idle; back, the snapshots go on where they left off.
export function setAway(world, p, on) {
  p.away = on ? world.time || 1e-6 : 0;
  if (on) p.lastInput = { seq: p.lastInput.seq, bits: 0, mx: 0, my: 0, aim: p.lastInput.aim };
  else p.meDirty = true;
}

// Called when the ghost timer expires (drop rule) or when leaving while dead.
function finalizeLogout(world, p, dropLoot) {
  const ped = p.ped;
  casino.leave(p);   // (a hand left on the table: played out and paid - casino.js)
  custody.saveJail(world, p);   // (in a cell: the time left goes with the character - back in it next time)
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
  horses.onPlayerGone(world, p);
}

// A name of your own (Settings' account section - the owner's M9 note: "a username"): a name may be (shared/names.js),
// nobody else's (any case, separators aside: names.js nameKey), and changed once every NAME.gapS; over your head at once (the descriptor sent again)
export function rename(world, p, raw) {
  const prof = p.profile, r = cleanName(raw);
  if (r.err) { world.notify(p, r.err, 'warn'); return false; }
  if (r.name === p.name) return true;
  const wait = (prof.nameAt || 0) + NAME.gapS * 1000 - Date.now();
  if (wait > 0) { world.notify(p, `You can change your name again in ${Math.ceil(wait / 60000)} min.`, 'warn'); return false; }
  if (world.time < (p.renameTryAt || 0)) return false;   // (a moment between tries: each looks through every profile)
  p.renameTryAt = world.time + NAME.tryS;
  const key = nameKey(r.name);
  for (const q of store.all()) if (q.pid !== prof.pid && nameKey(q.name) === key) { world.notify(p, `${r.name} is taken - pick another.`, 'warn'); return false; }
  prof.name = r.name; p.name = r.name; prof.nameAt = Date.now();
  if (p.ped) { p.ped.name = r.name; p.ped.appVer = (p.ped.appVer || 0) + 1; }
  world.notify(p, `You're ${r.name} now.`, 'good');
  p.meDirty = true;
  store.touch();
  return true;
}

// Start fresh (task #413: Settings under Repair install, or the debug menu, pressed twice): this player's character and
// everything that's theirs are gone for good - their body leaves the world at once (no ghost, nothing dropped), their
// homes go back on the market, their car out in the street goes (with someone else in it, it's nobody's now: theirs to
// drive off in), the bounties on their head are called off (the placers' money back in their banks: it lived on this
// profile) and the saved profile is deleted; a login with the same token after this is a brand-new character. Only ever
// the caller's own account: session.js passes the session's player, never a pid from the message.
export function wipeAccount(world, p) {
  if (p.devMode) devmode.exit(world, p, true);
  struggle.onLeave(world, p); custody.onLeave(world, p);   // (the officers on them let go, as when anyone logs off)
  revive.clearDown(world, p);
  bounties.onWipe(world, p);
  crews.leave(world, p);   // (out of any crew: a fresh character starts in none - crews.js)
  p.conn = null; p.ghostUntil = 0;
  if (world.players.get(p.pid) === p) finalizeLogout(world, p, false);
  for (const [id, pid] of [...world.homeOwner]) if (pid === p.pid) world.homeOwner.delete(id);
  for (const v of [...world.entities.values()]) {
    if (v.kind !== K.VEH || v.owner !== p.pid) continue;
    if (!v.seats.some((s) => s)) world.remove(v);
    else { v.owner = null; v.ownerName = null; v.despawnable = true; v.descVer = (v.descVer || 0) + 1; }   // (its owner tag goes for everyone: net.js descriptor o)
  }
  store.remove(p.pid);
}

// Idle (decided 10-06 / 10-08: "Idle kick: 'Still there?' then a disconnect - 10 min for everyone"): a player whose
// keys, stick and aim haven't changed - nor sent a menu pick, a chat line, anything - for IDLE_WARN_MS is asked if
// they're still there; at IDLE_KICK_MS they're disconnected (the page shows why and a button to come back; the
// character logs out as any disconnect does). Real time, not the game's: a clock jumped on (a test, a dev skip) isn't
// idling. (Here, not in shared/rules.js: server-only numbers - see AWAY_SECONDS.)
export const IDLE_WARN_MS = 9 * 60e3, IDLE_KICK_MS = 10 * 60e3;
export const IDLE_CLOSE = 4006;
// Along for the ride (the owner, 10-23: "riding the train for 10 minutes kicked me out for idling"): a passenger - on a
// train, a bus, a ferry, in a cab or anyone's back seat, up in a balloon or on the wheel - or watching the cinematic
// mode's tour (client/director.js) sits still for a while without being away: their idle clock runs at IDLE_RIDE_RATE
// (a third as fast: asked after 27 minutes aboard, gone at 30). The rest of the time it runs as before.
export const IDLE_RIDE_RATE = 1 / 3;
export function riding(world, p) {
  const ped = p.ped;
  if (!ped || ped.dead) return false;
  if (ped.onTrain || ped.ride) return true;   // (the trains and the subway; the Ferris wheel, a balloon flight - rides.js)
  if (p.cineTourMs && Date.now() - p.cineTourMs < 90e3) return true;   // (the tour going: the page says so every minute)
  const v = ped.vehId ? world.get(ped.vehId) : null;
  if (!v) return false;
  if (ped.seat > 0) return true;   // (a passenger: a bus, a cab, a ferry, someone's car)
  return !!(v.onDeck || v.ferry);   // (in your car on a ferry's deck)
}
export function stillHere(p) { p.activeAtMs = Date.now(); p.idleWarned = false; }
export function queueInput(p, inp) {
  if (inp.seq <= p.ack) return;
  const prev = p.inputQ.length ? p.inputQ[p.inputQ.length - 1] : p.lastInput;
  if (!prev || inp.bits !== prev.bits || Math.abs((inp.mx || 0) - (prev.mx || 0)) > 0.05 || Math.abs((inp.my || 0) - (prev.my || 0)) > 0.05 || Math.abs((inp.aim || 0) - (prev.aim || 0)) > 0.02) stillHere(p);
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
  if (now < (ped.guardUntil || 0)) speedMul *= GUARD.speed;   // guarding: a careful step (rules.js GUARD)
  if (now < (ped.k9Until || 0)) speedMul *= K9.drag;   // a police dog hanging on to you (k9.js)
  return {
    canMove, canSprint: !ped.carrying, speedMul, tumble: now < (ped.tumbleUntil || 0), air: now < (ped.airUntil || 0),
    board: !!ped.board, wet: !!ped.board && world.weather === WEATHER.RAIN,   // (on a skateboard: shared/physics.js boardStep)
    canSwim: !!ped.player || isSwimming(world.map, ped), // players swim anywhere; NPCs only get out of water
    regenMul: ped.buffs.coffee > now ? 2.2 : 1,
    staminaMax: (ped.buffs.energy > now ? 140 : 100) * (1 + skills.pedBonus(ped, 'stamina')), energy: ped.buffs.energy > now,   // (a longer sprint with stamina: skills.js)
    swimMul: 1 + skills.pedBonus(ped, 'swimming'),   // (a faster stroke: skills.js)
  };
}

const HOLD_TICKS = 5; // wait up to 250 ms for a late input before extrapolating

export function processInputs(world, dt) {
  for (const p of world.players.values()) {
    try { inputsOf(world, p, dt); } catch (e) { world.reportError('inputs', e); }   // (one player's trouble costs nobody else their step)
  }
}
function inputsOf(world, p, dt) {
  {
    // One simulation step per input, exactly like the client's prediction: consume one input per
    // tick, two when the client's queue backs up, and if this tick's input is late (phone timer
    // jitter, network hiccup) hold the character / car for up to HOLD_TICKS instead of guessing
    // with the last input - guessing put the server a step ahead and made the car jitter.
    const n = p.inputQ.length > 3 ? 2 : 1;
    const ped = p.ped;
    if (ped && ped.board) skate.guard(world, p, ped);   // (off the board when you can't ride: knocked down, in a car, inside...)
    if (p.skSession) skate.sessionTick(world, p);   // (a session at a skate spot runs out on or off the board)
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
      practise(world, p, ped, inp, dt);
      const v = ped.vehId && ped.seat === 0 ? world.get(ped.vehId) : null;
      if (v && !v.wreckAt && !v.scripted && !v.onDeck && !v.ferry) { v.ownStepTick = world.tick; vehicles.stepVehicle(world, v, dt); if (v.def.kind !== 'air') props.smashFor(world, v); }   // (an aircraft never smashes the street furniture: it flies over it, and the page predicts none for it)   // (a car on a ferry's deck is held there)
    }
  }
}

// skills from the moving itself (skills.js): a sprint, a swim, a drive
function practise(world, p, ped, inp, dt) {
  const v = ped.vehId && ped.seat === 0 ? world.get(ped.vehId) : null;
  if (v) { if (v.def.kind !== 'air' && !v.wreckAt && !v.onDeck && !v.ferry && !v.scripted && !v.towedBy) { const sp = Math.hypot(v.vx, v.vy); if (sp > 60) skills.gain(world, p, 'drive', sp * dt / 32000); } return; }   // (a km: 1 m = a tile = 32 px)
  if (ped.vehId || ped.dead || ped.hidden || ped.onTrain) return;
  const sp = Math.hypot(ped.vx, ped.vy);
  if (sp < 40) return;
  if (isSwimming(world.map, ped)) skills.gain(world, p, 'swim', dt);
  else if ((inp.bits & IN.SPRINT) && ped.stamina > 1 && sp > 120) skills.gain(world, p, 'run', dt);
}

function applyInput(world, p, ped, inp, pressed, dt) {
  if (p.prison && p.prison.climb) { ped.vx = 0; ped.vy = 0; return; }   // (on the prison wall: held there till over it - prison.js)
  if (p.struggle) { struggle.input(world, p, ped, inp, pressed, dt); return; }
  if (p.workout && workout.input(world, p, ped, inp, pressed)) return;   // (push-ups, sit-ups: workout.js)   // (an officer on you, going for the cuffs: fight back)
  // down from a tackle (police.js): moving gets you up sooner - if nobody pins you first
  if (ped.scrambleUntil > world.time && world.time < ped.downUntil && !ped.cuffed && Math.hypot(inp.mx || 0, inp.my || 0) > 0.3) ped.downUntil = Math.max(world.time, ped.downUntil - dt * TACKLE_SCRAMBLE);
  if (ped.cuffed || custody.inCell(p)) {   // (in custody: custody.js moves them; the jail panel has the bail)
    if ((pressed & IN.ACTION) && custody.canBreak(p, world) && safety.confirm(world, p, 'escape', 'escape')) custody.breakOut(world, p);   // (make a break for it: on the ground, walked to the car, the car stuck; Safety mode asks first)
    if (!ped.cuffed) {   // in a cell: walk round it; the action button sits, holds the bars (cells.js)
      cells.input(world, p, ped, inp, dt);
      if (pressed & IN.ACTION) doAct(world, p);
      if (pressed & IN.FIRE) cells.bang(world, p, ped);   // (the fight button: rattle the bars, or a fist on the wall)
    }
    return;
  }
  if (pressed & IN.LIGHT) economy.toggleLight(world, p); // the flashlight (in the bag, no hand slot)
  if (ped.hidden && ped.home && homeinside.input(world, p, ped, inp, pressed, dt)) return;   // (walking round your home: homeinside.js)
  if (ped.hidden) { // inside your home: E brings up the home menu (Leave is on it); on a ride: nothing to do but look
    if ((pressed & (IN.ACTION | IN.VEHICLE)) && !ped.ride) { if (ped.interior) station.openInterior(world, p); else homes.openInside(world, p); }
    return;
  }
  if (ped.fishing && ped.fishing.F && fishing.input(world, p, ped, inp, pressed, dt)) pressed &= ~IN.ACTION;   // (fishing: the action button charges the cast, strikes and reels - fishing.js)
  dance.input(world, p, ped, inp, pressed);   // the dance button; walking off, a punch, a car: the dance stops (task #394)
  ped.aimAngle = inp.aim;
  if (inp.bits & IN.AIMING) ped.aimUntil = world.time + 0.3;
  if (pressed & IN.NEXTW) combat.cycleWeapon(world, ped, 1);
  if (pressed & IN.PREVW) combat.cycleWeapon(world, ped, -1);
  if (pressed & IN.RELOAD) combat.reload(world, ped);
  if (pressed & IN.USE) economy.useHealItem(world, p);

  if (ped.sky) { skydive.input(world, p, ped, inp, pressed); return; }   // (falling from an aircraft: steering, the parachute - skydive.js)
  if (ped.surf) {   // (on a surfboard: paddling, carving, an air - surf.js)
    surf.input(world, p, ped, inp, pressed);
    // lying on the board (or tumbling): the vehicle button still boards a boat beside you, the action button still does
    // what's in front of you (surf.update takes the board off you once you're aboard)
    const lying = ped.surf && (ped.surf.st === 'pad' || ped.surf.st === 'wipe');
    if (lying && (pressed & IN.VEHICLE)) vehicles.playerEnter(world, ped);
    else if (lying && (pressed & IN.ACTION)) doAct(world, p);
    return;
  }
  if (ped.onTrain) { trains.riderInput(world, p, ped, inp, pressed, dt); return; }
  if (ped.hoodOf) { carhits.hoodInput(world, ped, inp); return; }   // (riding a car's hood: move to roll off - carhits.js)

  if (ped.vehId) {
    const v = world.get(ped.vehId);
    if (!v) { ped.vehId = 0; ped.seat = -1; return; }
    if (ped.seat === 0) {
      if (v.def.kind === 'air') aircraft.input(world, v, inp, ped);   // (flying: shared/flight.js)
      const di = driveInput(v, inp, v.def);
      v.input.throttle = di.throttle;
      v.input.steer = di.steer;
      v.input.hb = di.hb;
      v.input.slide = di.slide;
      v.input.drv = di.drv;
      v.input.gallop = di.gallop;   // (on a horse, Sprint: a gallop - shared/physics.js)
      if (inp.bits & IN.HORN) v.hornUntil = world.time + 0.2;
      if ((pressed & IN.HORN) && (v.def.police || v.def.siren)) v.sirenOn = !v.sirenOn;   // (def.siren: a fire engine, an ambulance - H68)
      if (v.def.turret && (inp.bits & IN.FIRE)) tank.fire(world, v, ped);   // (the tank's cannon - tank.js)
    }
    if ((inp.bits & IN.FIRE) && (inp.bits & IN.AIMING) && !v.def.turret && !(ped.seat === 0 && v.def.missiles)) {   // (a tank's cannon: tank.js; the gunship's pilot fires its missiles instead: aircraft.js)
      const w = WEAPONS[ped.weapon];
      if (w && (w.type === 'gun')) combat.tryAttack(world, ped, inp.aim);
    }
    if ((pressed & IN.VEHICLE) && !v.scripted) vehicles.exitVehicle(world, ped);
    if (pressed & IN.ACTION) doAct(world, p);
    return;
  }

  // on foot
  const tumbling = world.time < (ped.tumbleUntil || 0);
  const fr = world.time < (ped.airUntil || 0) ? AIR_FRICTION : TUMBLE_FRICTION;
  const v0 = tumbling ? Math.hypot(ped.vx, ped.vy) : 0;
  const wasDropping = !!ped.dropping;
  // the guard (rules.js GUARD; combat.js blocked, deflects): held with something to block with, on your feet, not busy
  const gw = WEAPONS[ped.weapon] || WEAPONS.fists;
  // a punch or a swing thrown from the guard (the owner's notes, 10-22: "you should be able to still punch even if you're
  // holding block") drops it for the blow (GUARD.strikeS); held still, it comes straight back up
  const guardHeld = !!(inp.bits & IN.BLOCK) && !!gw.guard && !ped.carrying && !ped.fishing && !(ped.rollT > 0) && !tumbling && !ped.board
    && world.time >= ped.downUntil && world.time >= ped.stunUntil && !isSwimming(world.map, ped);
  const guard = guardHeld && world.time >= (ped.guardBreakUntil || 0);
  ped.guardUntil = guard ? world.time + 0.12 : 0;
  if (guard) ped.aimUntil = world.time + 0.3;   // (the aim pose for an older page; the guard's own pose: the 'guard' event)
  if (guard ? world.time - (ped.guardShownAt ?? -9) >= NPC_GUARD.showS : ped.guardShownAt !== undefined) {
    world.emit(ped.x, ped.y, { e: 'guard', id: ped.id, t: guard ? NPC_GUARD.showS + 0.25 : 0 });
    ped.guardShownAt = guard ? world.time : undefined;
  }
  pedStep(ped, inp, dt, world.map, { ...pedMods(world, ped), analog: true });
  if (ped.hardLanding) { ped.hardLanding = false; if (ped.board) skate.bail(world, ped, 0, false); combat.damage(world, ped, 45, null, 'fall'); ped.tumbleUntil = world.time + 0.8; }
  if (ped.board) skate.after(world, p, ped, dt);   // (a hard hit throws you off; the water, a doorway or rough ground takes you off)
  // down a waterfall or off its cliff (shared/ledges.js): a splash at the foot, or a thud on dry ground
  if (wasDropping && !ped.dropping) world.emit(ped.x, ped.y, isSwimming(world.map, ped) ? { e: 'splash', x: ped.x, y: ped.y, n: 16 } : { e: 'thud', x: ped.x, y: ped.y });
  if (tumbling) tumbleImpact(world, ped, v0, dt, fr);
  if (ped.rollT > 0 && (p.badge || p.hunter) && !ped.board) tackle(world, ped);   // (an ollie isn't a tackle)
  const swung = golf.input(world, p, ped, inp, pressed, dt) || hoops.input(world, p, ped, inp, pressed, dt) || tennis.input(world, p, ped, inp, pressed) || bowling.input(world, p, ped, inp, pressed, dt) || firefighter.hose(world, p, ped, inp, pressed, dt);   // (the hose by your fire engine: firefighter.js) (by your golf ball the attack button swings the club; on the court with a ball, it shoots)
  const kicked = !swung && (pressed & IN.FIRE) && !ped.carrying && !ped.board && minigames.tryKick(world, ped, (inp.bits & IN.AIMING) ? inp.aim : ped.a);
  if ((inp.bits & IN.FIRE) && !kicked && !swung && !ped.board) {   // (on a board: step off to fight)
    if (ped.carrying) { if (pressed & IN.FIRE) cargo.throwCrate(world, ped, inp.aim); }
    else if (!ped.fishing) {
      if (guard) ped.guardUntil = 0;   // (striking from the guard: down for the blow - combat.js tryAttack won't strike from it)
      const struck = combat.tryAttack(world, ped, (inp.bits & IN.AIMING) ? inp.aim : ped.a);
      if (guard && !struck) ped.guardUntil = world.time + 0.12;   // (not ready to strike again yet: the guard stays up)
      else if (guard) {
        ped.guardBreakUntil = world.time + GUARD.strikeS;
        if (ped.guardShownAt !== undefined) { world.emit(ped.x, ped.y, { e: 'guard', id: ped.id, t: 0 }); ped.guardShownAt = undefined; }   // (the blow's pose, not the guard's)
      }
    }
  }
  if (pressed & IN.THROW) { if (ped.carrying) cargo.throwCrate(world, ped, (inp.bits & IN.AIMING) ? inp.aim : ped.a); }
  // the vehicle button: into a vehicle in reach - a skateboard on the ground: up on it (skate.js mount); on a board, off it
  // (left at your feet), and into the vehicle by you if there's one
  if ((pressed & IN.VEHICLE) && !revive.tryFinish(world, p)) {
    if (ped.board) { const car = vehicles.nearestVehicle(world, ped, 56, true); skate.hopOff(world, ped); if (car) vehicles.playerEnter(world, ped, true); }
    else vehicles.playerEnter(world, ped);   // (Safety mode asks first when it'd be a crime)
  }
  if (pressed & IN.ACTION) {   // (step off to do it - but at a skate spot, the session there: on the board)
    if (ped.board) { const it = findInteraction(world, p); if (!(it && it.keepBoard)) skate.hopOff(world, ped); }
    doAct(world, p);
  }
}

// The Act button: what findInteraction offers - one that's a crime (act.crime) waits for Safety mode's say-so (safety.js).
function doAct(world, p) {
  const act = findInteraction(world, p);
  if (act && act.run && safety.confirm(world, p, act.crime, act.key2 || act.label)) act.run();   // (a passive line has nothing to run)
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
    if (e === ped || e.dead || e.vehId || world.time < e.downUntil || e.cellSafe || world.time < (e.graceUntil || 0)) continue;   // (nobody in a cell: cells.js; nor someone who just broke free: struggle.js)
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
// with a rod, facing the water (or still in a boat): fish here - press and hold to charge the cast (fishing.js)
function fishHere(world, p, ped) {
  if (!fishing.canFish(p) || ped.fishing) return null;
  const spot = fishing.spotFor(world, ped);
  return spot ? { label: spot.boat ? 'Fish over the side (hold to cast)' : 'Fish here (hold to cast)', run: () => fishing.begin(world, p, spot) } : null;
}
export function findInteraction(world, p) {
  const ped = p.ped;
  if (p.struggle) return null;   // (fighting an officer off: the struggle bar says what to press - client/hud.js)
  if (ped && ped.cuffed && !ped.dead && custody.canBreak(p, world)) return { label: 'Make a break for it!', run: () => custody.breakOut(world, p) };
  if (ped && !ped.dead && !ped.cuffed && custody.inCell(p)) return cells.interaction(world, p);   // (the bench, the toilet, the bars)
  if (!ped || ped.dead || ped.cuffed || custody.inCell(p)) return null;
  if (ped.sky) return skydive.interaction(world, p);   // (up in the sky: the parachute)
  if (ped.surf && ped.surf.st !== 'pad') return surf.interaction(world, p);   // (riding a wave: what the buttons do - surf.js)
  if (p.prison) return prison.interaction(world, p);   // (doing time on Prison Island: the wall - prison.js)
  if (ped.ride) return { label: rides.aboardLabel(world, ped), passive: true, run: () => {} };
  if (ped.hidden && ped.interior) return { label: ped.interior.kind === 'armory' ? 'Armory - pick a weapon / out to the motor pool' : 'Front desk', run: () => station.openInterior(world, p) };
  if (ped.hidden && ped.home) return homeinside.interaction(world, p);   // (the bed, the safe, the front door... homeinside.js)
  if (ped.hidden) return { label: 'Inside your home - open the home menu', run: () => homes.openInside(world, p) };
  if (ped.entering) return { label: 'Going inside... (stand still)', run: () => {} };
  if (ped.onTrain) return trains.interaction(world, p);
  if (ped.ug && !ped.vehId) return fishing.interaction(world, p) || underground.interaction(world, p) || fishHere(world, p, ped);   // (down the sewers or in the cave: only what's down there)
  if (!ped.vehId) { const rv = revive.interaction(world, p); if (rv) return rv; }
  if (ped.vehId) {
    const hop = trains.interaction(world, p);
    if (hop) return hop;
    const fi = fishing.interaction(world, p);
    if (fi) return fi;
    return jobs.truckInteraction(world, p) || transit.rideInteraction(world, p) || ferries.interaction(world, p) || rentals.vehicleInteraction(world, p) || horses.vehicleInteraction(world, p) || felling.vehicleInteraction(world, p) || homes.vehicleInteraction(world, p) || sar.interaction(world, p) || coastguard.interaction(world, p) || fishHere(world, p, ped) || drivein.interaction(world, p);   // (a boat sitting still: fish over the side; parked at the drive-in: tune in - drivein.js)
  }
  const now = world.time;
  if (now < ped.downUntil || now < ped.stunUntil) return null;
  const sk = skate.interaction(world, p);   // on your board at a skate spot: a session there (skate.js)
  if (sk) return sk;

  const fi = fishing.interaction(world, p);
  if (fi) return fi;

  if (ped.carrying) {
    const crate = world.get(ped.carrying);
    const logs = felling.sellZone(world, p, crate);   // a bundle of firewood at a buyer, or at your own garage (felling.js)
    if (logs) return logs;
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
  const word = stops.interaction(world, p);   // an officer come for a word (1 star from small crimes: stops.js)
  if (word) return word;
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

  const fellAct = felling.interaction(world, p);   // at a tree with a cutting tool: hold to fell it (felling.js)
  if (fellAct && (ped.chop || fellAct.log)) return fellAct;   // (cutting up a felled trunk, facing it: before the bundles lying by it)
  const crate = cargo.nearestCrate(world, ped);
  if (crate) { const theirs = !!(crate.owner && crate.owner !== p.pid); return { label: (crate.state === 'loaded' ? `Unload ${crateName(crate)}` : `Pick up ${crateName(crate)}`) + (theirs ? ' - Cargo theft' : ''), crime: theirs ? 'cargoTheft' : null, run: () => cargo.pickUp(world, ped, crate) }; }
  const lantern = lights.interaction(world, p);   // a lantern someone set down (lights.js)
  if (lantern) return lantern;
  if (fellAct) return fellAct;

  const hap = happenings.interaction(world, p);   // a street fight to break up, someone to help up, a wallet to give back
  if (hap) return hap;
  const vault = streetlife.interaction(world, p);   // the back of a stopped armored truck: hold to unlock it (streetlife.js)
  if (vault) return vault;
  const bankJob = heist.interaction(world, p);   // a bank's vault door: the thermal drill (heist.js)
  if (bankJob) return bankJob;

  const busk = personas.interaction(world, p);   // a coin for the busker (personas.js)
  if (busk) return busk;
  const ranger = wildfolk.interaction(world, p);   // a word with a park ranger (wildfolk.js)
  if (ranger) return ranger;
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

  const below = underground.interaction(world, p);   // a manhole over the sewers, the cave's mouth, an ore vein
  if (below) return below;

  const office = biz.interaction(world, p);   // a business's office, your food truck, a customer's car (biz.js)
  if (office) return office;
  const hall = arcade.doorInteraction(world, p);   // an arcade's door: onto its floor - the cabinets, the prize counter (arcade.js)
  if (hall) return hall;
  const door = homeinside.doorInteraction(world, p);   // your own front door: in you go (homeinside.js)
  if (door) return door;
  const poi = world.map.poiNear(ped.x, ped.y);
  if (poi && poi.kind !== 'reception') {
    const label = economy.poiLabel(world, p, poi);
    if (label) return { label, run: () => economy.openMenu(world, p, poi) };
  }

  const dice = streetdice.interaction(world, p);   // a crew shooting dice down an alley (streetdice.js)
  if (dice) return dice;
  const pool = arcade.poolInteraction(world, p);   // the Rusty Spur's pool table (arcade.js)
  if (pool) return pool;
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
  const court = tennis.interaction(world, p);   // (a tennis court: a game with the club pro - tennis.js)
  if (court) return court;
  const lane = bowling.interaction(world, p);
  if (lane) return lane;
  const seat = cinema.interaction(world, p);   // (The Grand Theatre's screens: server/systems/cinema.js)
  if (seat) return seat;
  const rescue = sar.interaction(world, p);   // a hospital's helipad: sign on as a rescue pilot (sar.js)
  if (rescue) return rescue;
  const plot = gardening.interaction(world, p);   // a garden plot in your own yard: plant, water, pick (gardening.js)
  if (plot) return plot;
  const rowWork = farming.handInteraction(world, p);   // a ripe row on foot: pick it by hand into crates (farming.js)
  if (rowWork) return rowWork;
  const crew = firefighter.interaction(world, p);   // a fire station: sign on as a firefighter (firefighter.js)
  if (crew) return crew;
  const medic = paramedic.interaction(world, p);   // a hospital's doors: sign on as a paramedic; a patient: treat them (paramedic.js)
  if (medic) return medic;
  const drive = taxijob.interaction(world, p) || towjob.interaction(world, p) || busjob.interaction(world, p);   // a taxi rank, an impound lot, a bus stop: sign on to drive (H72)
  if (drive) return drive;

  const fish = fishHere(world, p, ped);
  if (fish) return fish;
  const join = crews.joinPrompt(world, p) || crews.askPrompt(world, p);   // someone beside you who asked you into their crew: join; or ask them into yours (crews.js)
  if (join) return join;

  const sale = dealer.saleNear(world, ped);
  if (sale) return { label: `Buy ${sale.def.name} - $${sale.forSale.price.toLocaleString()}`, run: () => { const err = dealer.buy(world, p, sale, economy.payFrom); if (err) world.notify(p, err, 'bad'); } };
  const v = vehicles.nearestVehicle(world, ped, 56);
  if (v) return { label: vehicles.enterLabel(world, p, v), key: 'F', crime: vehicles.entryInfo(world, p, v).crime, key2: `veh:${v.id}`, run: () => vehicles.tryEnter(world, ped) };
  const fh = !ped.board && horses.farmHorseNear(world, ped);   // a farm's horse grazing beside you: up on it bareback - the farm's, so horse theft (horses.js)
  if (fh) return { label: 'Ride the horse bareback - Horse theft', key: 'F', crime: 'horseTheft', key2: `horse:${fh.id}`, run: () => vehicles.playerEnter(world, ped) };
  return pets.letGo(world, p) || transit.stopNote(world, p);   // a lost pet at your heel: let it go (pets.js); at a bus stop with nothing else to do: the line and when its next bus comes
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
  p.downMinAt = p.respawnAt;   // (the soonest you can wake up: calling for help and cancelling doesn't cut it short)
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
  fishing.cancel(world, p, null);
  cargo.dropEverything(world, ped, p.name);
  p.meDirty = true;
  store.touch();
}

function idleCheck(world) {
  const t = Date.now();
  for (const p of world.players.values()) {
    if (!p.conn || !p.conn.open) continue;
    if (!p.activeAtMs) { p.activeAtMs = t; p.idleAtMs = t; continue; }
    const step = Math.max(0, Math.min(5e3, t - (p.idleAtMs || t)));   // (since the last look - a stalled server's gap isn't counted in full)
    p.idleAtMs = t;
    if (step && riding(world, p)) p.activeAtMs = Math.min(t, p.activeAtMs + step * (1 - IDLE_RIDE_RATE));   // (riding: the clock runs slow)
    const idle = t - p.activeAtMs;
    if (idle >= IDLE_KICK_MS) {
      try { p.conn.sendJSON({ t: 'kicked', reason: `You were idle for ${riding(world, p) ? 'half an hour along for the ride' : '10 minutes'}, so you were disconnected.`, idle: 1 }); p.conn.close(IDLE_CLOSE, 'idle'); } catch { /* gone */ }
      p.activeAtMs = t;
    } else if (idle >= IDLE_WARN_MS && !p.idleWarned) {
      p.idleWarned = true;
      world.notify(p, 'Still there? Move or press anything - you\'ll be disconnected in a minute if not.', 'warn');
    }
  }
}

export function update(world, dt) {
  const now = world.time;
  if (world.tick % 20 === 9) idleCheck(world);
  for (const p of [...world.players.values()]) {
    const ped = p.ped;
    if (ped) economy.syncLight(world, p); // the flashlight goes out when you go down or lose it
    // (left idle and then trouble came - hurt, wanted: the drop rule's 30 s from now)
    if (p.ghostUntil && p.ghostSafe && !safeToIdle(world, p)) { p.ghostSafe = false; p.ghostUntil = Math.min(p.ghostUntil, now + GHOST_SECONDS); }
    if (p.ghostUntil && now >= p.ghostUntil) {
      // GDD §9 drop rule: timer expired -> body despawns, everything on them jettisoned (not when an
      // update came out meanwhile: they come back fresh on it instead)
      finalizeLogout(world, p, !updating(world, p) && !p.ghostSafe);
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
      const pcr = act && act.crime ? (law.CRIMES[act.crime] && law.CRIMES[act.crime].felony ? 2 : 1) : 0;   // (a crime: the prompt's key and the touch button red, a felony ringed too - hud.js crimeMarks)
      if (label !== p.prompt || pcr !== (p.promptCrime || 0)) { p.prompt = label; p.promptCrime = pcr; p.meDirty = true; }
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
  if (ped.vehId) { if (ped.seat > 0) f |= PF.PASSENGER; } else if (ped.board) { if (ped.push) f |= PF.SPRINT; }   // (on a board: pushing - the pushing frames)
  else if (ped.prevBits & IN.SPRINT && Math.hypot(ped.vx, ped.vy) > 140) f |= PF.SPRINT;
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
    cash: prof.cash, bank: prof.bank, hot: prof.hot || 0, cexp: prof.criminalExp, sam: prof.samaritan, skl: skills.levels(p), wo: workout.meInfo(p),   // (skl: the skills' levels - the page predicts stamina and swimming from them)
    wanted: p.wanted, heat: Math.round(p.heat), peak: prof.peakWanted, disguised: p.disguised,
    faction: p.badge ? 'enforcer' : p.hunter ? 'hunter' : (p.wanted > 0 ? 'criminal' : 'citizen'),
    weapon: ped ? ped.weapon : 'fists', weapons, inv, bleeding: ped ? ped.bleeding : false, light: !!(ped && ped.flashOn),
    blade: prof.blade | 0,   // the plasma blade's colour (shared/items.js BLADE_COLORS; looks.js setBlade)
    ug: (ped && ped.ug) || 0,   // down the sewers (1) or in the cave (2): server/systems/underground.js
    carrying: ped && ped.carrying ? (world.get(ped.carrying)?.tier || 0) : 0,
    prompt: p.prompt, pcr: p.promptCrime || 0, custody: custody.meInfo(world, p), fight: struggle.meInfo(world, p), job: custody.deliveryFor(world, p) || places.mazeTarget(world, p) || places.lapTarget(world, p) || hoops.targetFor(world, p) || bowling.targetFor(world, p) || cinema.targetFor(world, p) || drivein.targetFor(world, p) || golf.targetFor(world, p) || minigames.targetFor(world, p) || races.targetFor(world, p) || biz.targetFor(world, p) || phone.jobTarget(world, p),
    radar: packRadar(world, p, law.radarFor(world, p)), bounty: p.bounty, btime: bounties.meInfo(p), crew: crews.meInfo(world, p), surf: surf.meInfo(world, p), horse: horses.meInfo(world, p),
    dispatch: law.dispatchFor(world, p), rank: p.badge ? law.POLICE_RANKS[law.policeRank(prof)].name : null, felonies: prof.felonies || 0,
    rumor: world.dropRumor ? { x: Math.round(world.dropRumor.x), y: Math.round(world.dropRumor.y), r: 420, t: world.dropRumor.tier } : null, ghost: !!p.ghostUntil,
    fishing: fishing.meInfo(p), creel: fishing.creelInfo(prof),   // (a line out: where, the rod, the fight's parameters once it's cast; the cooler's catch - fishing.js)
    reloading: ped ? world.time < ped.reloadUntil : false,
    buffs: ped ? { coffee: Math.max(0, (ped.buffs.coffee || 0) - world.time), energy: Math.max(0, (ped.buffs.energy || 0) - world.time), wine: Math.max(0, (ped.buffs.wine || 0) - world.time), hearty: Math.max(0, (ped.buffs.hearty || 0) - world.time), scent: Math.max(0, (ped.buffs.scent || 0) - world.time) } : {},
    vehicles: prof.vehicles.map((v) => v.model),
    garageCap: homes.garageCap(world, prof),
    homes: homes.ownedHomes(world, prof).map((h) => ({ id: h.id, name: h.name, x: Math.round(h.x), y: Math.round(h.y) })),
    biz: biz.mapList(world, prof),   // (your businesses on the map: biz.js)
    spawnOpts: ped && ped.dead ? homes.spawnOptions(world, p) : null, deadAt: ped && ped.dead ? [Math.round(ped.x), Math.round(ped.y)] : null, spawnChoice: p.respawnChoice || null,
    cruiser: cruiser.stateFor(world, p), happen: events.forPlayer(world, p), misconduct: law.misconductFor(p), suspects: law.suspectsFor(world, p),
    dev: p.dev, devMode: !!p.devMode, god: !!p.invincible, safety: safety.on(p),
    quick: economy.quickSlots(p), down: revive.downState(world, p), limp: !!(ped && ped.limpUntil > world.time),
    sk: skate.meInfo(world, p),   // (on a skateboard: the score, the combo, the special meter, a session - skate.js)
    ride: rides.meInfo(world, p), bus: transit.rideInfo(world, p) || ferries.rideInfo(world, p), taxi: transit.taxiInfo(world, p), golf: golf.meInfo(world, p), hoops: hoops.meInfo(world, p), tennis: tennis.meInfo(world, p), prison: prison.meInfo(world, p), bowl: bowling.meInfo(world, p), cine: cinema.meInfo(world, p), din: drivein.meInfo(world, p),
    arrows: ped && world.arrows && world.arrows.length ? world.arrows.filter((a) => a.owner === ped.id && Math.abs(a.x - ped.x) < 1600 && Math.abs(a.y - ped.y) < 1600).slice(-16).map((a) => [Math.round(a.x), Math.round(a.y), +a.a.toFixed(2)]) : null,
  };
}
