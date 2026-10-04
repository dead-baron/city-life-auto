// Dev Debug Mode for online testing. Anyone who knows the password (Options -> Dev Debug Mode)
// gets the debug menu on the live server - but nothing they do in it is kept: entering it
// snapshots the player (profile, rank, wanted level, health, ammo, where they stand) and from
// then on the game works on a throwaway copy of the profile, so the save file never sees it.
// Leaving dev mode - or disconnecting - puts everything back exactly as it was. A dev can grant
// the mode to other online players (same deal for them) and teleport to / fetch any player.
import { store } from './store.js';
import * as vehicles from './systems/vehicles.js';
import * as trains from './systems/trains.js';
import * as law from './systems/law.js';

const envPw = typeof process !== 'undefined' && process.env ? process.env.CLA_DEV_PASSWORD : '';
export const DEV_PASSWORD = envPw || 'GODMODE';
const MAX_TRIES_PER_MIN = 5;

const clone = (o) => JSON.parse(JSON.stringify(o));
// player fields that rank / wanted / role live in (outside the profile)
const P_KEYS = ['heat', 'wanted', 'disguised', 'badge', 'hunter', 'faction', 'bounty', 'flareUntil', 'searchR'];

export function tryPassword(world, p, pw) {
  const now = world.time;
  p.devTries = (p.devTries || []).filter((t) => now - t < 60);
  if (p.devTries.length >= MAX_TRIES_PER_MIN) { world.notify(p, 'Too many wrong passwords - wait a minute.', 'bad'); return false; }
  if (String(pw || '').trim().toUpperCase() !== DEV_PASSWORD.toUpperCase()) { p.devTries.push(now); world.notify(p, 'Wrong password.', 'bad'); return false; }
  enter(world, p, null);
  return true;
}

export function enter(world, p, grantedBy) {
  if (p.devMode) return;
  const ped = p.ped;
  p.devSnap = {
    profile: p.profile,                                   // the real one, untouched from here on
    player: Object.fromEntries(P_KEYS.map((k) => [k, clone(p[k] ?? null)])),
    ped: ped && !ped.dead ? { x: ped.x, y: ped.y, hp: ped.hp, weapon: ped.weapon, mag: clone(ped.mag || {}), bleeding: !!ped.bleeding, app: clone(ped.app) } : null,
    civvies: p.civvies ? clone(p.civvies) : null,
    job: p.job ? clone(p.job) : null,
  };
  p.profile = clone(p.profile); // everything from now on happens to a throwaway copy
  p.devMode = true;
  p.meDirty = true;
  store.touch();
  world.notify(p, grantedBy
    ? `${grantedBy.name} gave you Dev Debug Mode: the debug menu is now at the top of Options. None of your progress is saved from now on, until you leave dev mode or rejoin.`
    : 'Dev Debug Mode ON - the debug menu is at the top of Options. Nothing you do now is saved; leaving dev mode puts you back exactly as you were.', 'warn');
}

// Put the player back exactly as they were when they entered dev mode.
export function exit(world, p, quiet = false) {
  if (!p.devMode) return;
  const snap = p.devSnap;
  p.devMode = false; p.devSnap = null;
  if (p.badge && !snap.player.badge) law.goOffDuty(world, p); // joined the force in dev mode: hand the badge back
  p.profile = snap.profile;
  for (const k of P_KEYS) p[k] = snap.player[k];
  p.civvies = snap.civvies;
  p.job = snap.job; p.crack = null;
  const ped = p.ped;
  if (ped && snap.ped) {
    if (ped.onTrain) trains.alight(world, ped, ped.x, ped.y);
    if (ped.vehId) vehicles.ejectPed(world, ped, true);
    if (ped.dead) { ped.dead = false; world.bodies.delete(ped); p.respawnAt = 0; }
    ped.x = snap.ped.x; ped.y = snap.ped.y; ped.vx = 0; ped.vy = 0; ped.sub = false; ped.hidden = false; ped.interior = null;
    ped.hp = snap.ped.hp; ped.weapon = snap.ped.weapon; ped.mag = snap.ped.mag; ped.bleeding = snap.ped.bleeding;
    ped.app = snap.ped.app; ped.appVer = (ped.appVer || 0) + 1;
    ped.downUntil = 0; ped.stunUntil = 0; ped.tumbleUntil = 0; ped.airUntil = 0;
    if (ped.carrying) { const c = world.get(ped.carrying); if (c) { c.state = 'ground'; c.parent = 0; } ped.carrying = 0; }
    world.place(ped);
    p.teleportAt = world.time;
  }
  p.meDirty = true;
  store.touch();
  if (!quiet) world.notify(p, 'Dev Debug Mode OFF - you\'re back where you were, with your real progress.', 'good');
}

export function grant(world, p, pid) {
  const q = world.players.get(String(pid));
  if (!q || !q.conn) { world.notify(p, '[dev] That player isn\'t online.', 'warn'); return; }
  if (q.devMode) { world.notify(p, `[dev] ${q.name} already has dev mode.`, 'info'); return; }
  enter(world, q, p);
  world.notify(p, `[dev] Gave ${q.name} Dev Debug Mode.`, 'info');
}

// Where to put someone arriving next to `to`: beside their vehicle, aboard their train car, or
// just next to them.
function arriveNear(world, ped, to) {
  if (ped.onTrain) trains.alight(world, ped, ped.x, ped.y);
  if (ped.vehId) vehicles.ejectPed(world, ped, true);
  if (to.onTrain) {
    const t = world.trains[to.onTrain.t];
    if (t) { trains.board(world, ped, t, to.onTrain.c, to.onTrain.ox, to.onTrain.oy > 0 ? to.onTrain.oy - 20 : to.onTrain.oy + 20, 0); return; }
  }
  const v = to.vehId ? world.get(to.vehId) : null;
  const r = v ? Math.max(v.def.W, v.def.L) / 2 + 20 : 30;
  const base = v || to;
  ped.x = base.x + r; ped.y = base.y; ped.vx = 0; ped.vy = 0; ped.sub = false; ped.hidden = false; ped.interior = null;
  ped.downUntil = 0; ped.tumbleUntil = 0; ped.airUntil = 0;
  world.place(ped);
  if (ped.player) ped.player.teleportAt = world.time;
}

export function goTo(world, p, pid) {
  const q = world.players.get(String(pid));
  if (!q || !q.ped || q.ped.dead || q === p || !p.ped || p.ped.dead) { world.notify(p, '[dev] Can\'t reach that player right now.', 'warn'); return; }
  if (q.ped.hidden) { world.notify(p, `[dev] ${q.name} is hidden indoors.`, 'warn'); return; }
  arriveNear(world, p.ped, q.ped);
  world.notify(p, `[dev] Teleported to ${q.name}.`, 'info');
}

export function bring(world, p, pid) {
  const q = world.players.get(String(pid));
  if (!q || !q.ped || q.ped.dead || q === p || !p.ped || p.ped.dead) { world.notify(p, '[dev] Can\'t fetch that player right now.', 'warn'); return; }
  if (q.ped.hidden) { q.ped.hidden = false; q.ped.interior = null; }
  arriveNear(world, q.ped, p.ped);
  q.meDirty = true;
  world.notify(q, `${p.name} (dev) teleported you to them.`, 'warn');
  world.notify(p, `[dev] Brought ${q.name} to you.`, 'info');
}

// Who's online. Everyone sees names, role and roughly where (district); devs also get the
// player id (for teleport / grant) and exact positions (map markers).
export function playerList(world, viewer) {
  const dev = !!(viewer.devMode || viewer.dev);
  const out = [];
  for (const q of world.players.values()) {
    if (!q.conn) continue;
    const ped = q.ped;
    const role = q.badge ? 'police' : q.hunter ? 'hunter' : q.wanted > 0 ? 'criminal' : 'citizen';
    const e = { n: q.name, r: role, w: q.wanted || 0, me: q === viewer ? 1 : 0, dm: q.devMode ? 1 : 0 };
    if (ped && !ped.hidden) e.d = world.map.districtAt(ped.x, ped.y).name;
    if (dev) { e.id = q.pid; if (ped) { e.x = Math.round(ped.x); e.y = Math.round(ped.y); } e.dead = ped && ped.dead ? 1 : 0; }
    out.push(e);
  }
  out.sort((a, b) => b.me - a.me || a.n.localeCompare(b.n));
  return { t: 'plist', l: out, dev };
}
