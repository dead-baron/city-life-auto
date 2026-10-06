// Dev Debug Mode for online testing. Anyone can switch it on (Options -> Dev Debug Mode - no
// password while it's just the team and friends testing) and gets the debug menu on the live server.
// Progress carries on as normal: whatever a player gets or does in dev mode (money, items, rank, where
// they are) is saved like anything else and stays when they leave it - leaving only ends the dev powers
// (the debug menu, invincibility, the free camera). A dev can grant the mode to other online players
// and teleport to / fetch any player.
import * as vehicles from './systems/vehicles.js';
import * as trains from './systems/trains.js';

const envPw = typeof process !== 'undefined' && process.env ? process.env.CLA_DEV_PASSWORD : '';
export const DEV_PASSWORD = envPw || 'GODMODE';
const MAX_TRIES_PER_MIN = 5;

// No password for now (just the team and friends testing): asking is enough. Flip this to
// false to bring the password back (DEV_PASSWORD, or CLA_DEV_PASSWORD on the server).
export const DEV_OPEN = true;

export function tryPassword(world, p, pw) {
  if (DEV_OPEN) { enter(world, p, null); return true; }
  const now = world.time;
  p.devTries = (p.devTries || []).filter((t) => now - t < 60);
  if (p.devTries.length >= MAX_TRIES_PER_MIN) { world.notify(p, 'Too many wrong passwords - wait a minute.', 'bad'); return false; }
  if (String(pw || '').trim().toUpperCase() !== DEV_PASSWORD.toUpperCase()) { p.devTries.push(now); world.notify(p, 'Wrong password.', 'bad'); return false; }
  enter(world, p, null);
  return true;
}

export function enter(world, p, grantedBy) {
  if (p.devMode) return;
  p.devMode = true;
  p.meDirty = true;
  world.notify(p, grantedBy
    ? `${grantedBy.name} gave you Dev Debug Mode: tap 🛠 at the top of the screen for the debug menu. Your progress carries on as normal - whatever you get in dev mode is yours to keep.`
    : 'Dev Debug Mode ON - tap 🛠 at the top of the screen (or Options) for the debug menu. Your progress carries on as normal: whatever you do in dev mode stays when you leave it.', 'warn');
}

// Leave dev mode: the progress made in it is kept (it was saved all along); only the dev powers end -
// invincibility and the free camera go with the debug menu.
export function exit(world, p, quiet = false) {
  if (!p.devMode) return;
  p.devMode = false;
  if (p.spectating) p.spectating = false;
  p.invincible = false;
  p.meDirty = true;
  if (!quiet) world.notify(p, 'Dev Debug Mode OFF - you keep everything you have now.', 'good');
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
    const e = { n: q.name, r: role, w: q.wanted || 0, me: q === viewer ? 1 : 0, dm: q.devMode ? 1 : 0, god: q.invincible ? 1 : 0 };
    if (ped && !ped.hidden) e.d = world.map.districtAt(ped.x, ped.y).name;
    if (dev) { e.id = q.pid; if (ped) { e.x = Math.round(ped.x); e.y = Math.round(ped.y); } e.dead = ped && ped.dead ? 1 : 0; }
    out.push(e);
  }
  out.sort((a, b) => b.me - a.me || a.n.localeCompare(b.n));
  return { t: 'plist', l: out, dev };
}

// Invincible: nothing can hurt or kill you (session only, never saved). A dev can switch it for
// themselves or for any online player.
export function setInvincible(world, p, pid, on) {
  const q = pid ? world.players.get(String(pid)) : p;
  if (!q) { world.notify(p, '[dev] That player isn\'t online.', 'warn'); return; }
  q.invincible = on === undefined ? !q.invincible : !!on;
  if (q.ped && q.invincible) { q.ped.hp = q.ped.maxHp; q.ped.bleeding = false; }
  q.meDirty = true;
  if (q !== p) world.notify(q, q.invincible ? `${p.name} (dev) made you invincible.` : `${p.name} (dev) switched your invincibility off.`, 'warn');
  world.notify(p, q === p ? (q.invincible ? '[dev] Invincible ON - nothing can hurt you.' : '[dev] Invincible OFF.') : `[dev] ${q.name} is ${q.invincible ? 'now invincible' : 'no longer invincible'}.`, 'info');
}
