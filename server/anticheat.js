// Anti-cheat audits (the owner, 11-03). The server is authoritative - it moves everyone, so a page can't move itself -
// and these audits catch what still gets through: a bug or an exploit that moves someone too fast or too far, a page
// that floods the socket or hammers an action, earnings far above the norm. They flag to the review list
// (server/moderation.js) and log; they never punish by themselves (kick and ban are admin actions: server/admin.js).
//   movement: every sample (about 2 a second), how far each player moved against what the shared physics allow for how
//     they're travelling (shared/physics.js PED, shared/vehicles.js max per vehicle) - a jump far past it with no
//     teleport the server made (p.teleportAt) is a 'teleport' flag; staying over it a 'speed' flag;
//   actions: each kind of message a page sends has a rate it may come at (RATES); past it, it's dropped, and a page
//     that keeps on is flagged;
//   inputs: more input packets a second than any page sends;
//   economy: earnings an hour far above the norm (server/analytics.js feeds earned()).
import { PED } from '../shared/physics.js';
import { VEHICLES } from '../shared/vehicles.js';

// messages a second, per kind (anything else: DEFAULT_RATE)
export const RATES = {
  menu: 10, inv: 10, phone: 12, look: 6, name: 1, chat: 4, emote: 2, chatset: 2, mod: 2, contacts: 2, inbox: 2, admin: 8, acct: 4,
  arcade: 6, chess: 10, mus: 60, weapon: 12, down: 6, respawn: 6, cine: 30, view: 10, perf: 2, cerr: 6, diag: 2, ftue: 6, ga: 2,
  dev: 25, racebook: 4, safety: 2, plist: 3, wipe: 1, interior: 4, bail: 3, unstuck: 2, surrender: 2, cruiser: 2, away: 6, ping: 4, devmode: 2,
};
export const DEFAULT_RATE = 20;
export const INPUT_MAX = 75;   // input packets a second (the page sends at most one a frame: 60, a little over to be safe)
const MOVE = {
  footSlack: 1.6,          // on foot: the sprint (with an energy drink) and a shove, a little over
  vehSlack: 1.35,          // in a vehicle: its top speed and a boost or a slope, a little over
  jumpPx: 900,             // further than this in one sample, with no teleport the server made: a teleport
  speedHits: 4, speedWindowS: 10,
};
const ECON = { floor: 50000, mult: 6 };   // flagged past max(floor, mult x the norm) earned in an hour

export function createAntiCheat({ mod, now = Date.now, log = console }) {
  const flags = [];   // the latest, for tests and /stats
  function flag(kind, p, note, data) {
    const f = { at: now(), kind, id: p.pid, n: p.name, note, data };
    flags.unshift(f);
    if (flags.length > 200) flags.length = 200;
    if (mod) mod.review(kind, { id: p.pid, n: p.name }, note, data);
    if (log) log.warn(`[anticheat] ${kind}: ${p.name} (${p.pid.slice(0, 6)}) ${note}`);
    if (p.acLog) { p.acLog.push(f); if (p.acLog.length > 20) p.acLog.shift(); } else p.acLog = [f];
    return f;
  }

  // the most a player travelling as they are now may move, px a second (0: don't audit right now)
  function allowed(world, p) {
    const ped = p.ped, t = world.time;
    if (!ped || ped.dead || p.devMode || p.invincible || p.spectating || p.prison || p.custody) return 0;
    if (ped.onTrain || ped.ride || ped.sky || ped.cuffed || ped.carriedBy) return 0;
    if ((ped.tumbleUntil || 0) > t || (ped.airUntil || 0) > t || (ped.downUntil || 0) > t) return 0;
    if (ped.vehId) {
      const v = world.get(ped.vehId);
      if (!v || !v.def || v.onDeck || v.ferry || v.towed || v.carried) return 0;
      return (v.def.max || VEHICLES.compact.max) * MOVE.vehSlack + 60;
    }
    return Math.max(PED.aSprint, PED.rollSpeed) * MOVE.footSlack;
  }
  // one sample of everyone (every half second or so) -> the flags raised
  function audit(world) {
    const out = [];
    for (const p of world.players.values()) {
      if (!p.conn) { p.acPos = null; continue; }
      const ped = p.ped;
      if (!ped || ped.dead) { p.acPos = null; continue; }
      const last = p.acPos, mode = ped.vehId || 0;
      p.acPos = { x: ped.x, y: ped.y, t: world.time, mode, tp: p.teleportAt || 0, ms: p.movedSeq || 0, ped: ped.id };
      // (a move the server made since the last sample - teleportAt, or server/movemark.js moved(): not the player's doing)
      if (!last || last.ped !== ped.id || last.mode !== mode || (p.teleportAt || 0) !== last.tp || (p.teleportAt || 0) > last.t || (p.movedSeq || 0) !== last.ms) continue;
      const dt = world.time - last.t;
      if (dt <= 0.05 || dt > 5) continue;
      const max = allowed(world, p);
      if (!max) continue;
      const d = Math.hypot(ped.x - last.x, ped.y - last.y), sp = d / dt;
      if (d > Math.max(MOVE.jumpPx, max * dt * 3)) { out.push(flag('teleport', p, `moved ${Math.round(d / 32)} m in ${dt.toFixed(1)} s (${ped.vehId ? 'in a ' + (world.get(ped.vehId)?.def?.name || 'vehicle') : 'on foot'})`, { from: [Math.round(last.x), Math.round(last.y)], to: [Math.round(ped.x), Math.round(ped.y)] })); continue; }
      if (sp > max) {
        const hits = (p.acSpeed || []).filter((h) => world.time - h < MOVE.speedWindowS);
        hits.push(world.time);
        p.acSpeed = hits;
        if (hits.length >= MOVE.speedHits) { p.acSpeed = []; out.push(flag('speed', p, `${Math.round(sp * 3.6 / 32)} km/h, over the ${Math.round(max * 3.6 / 32)} allowed (${ped.vehId ? world.get(ped.vehId)?.def?.name || 'vehicle' : 'on foot'})`, { sp: Math.round(sp), max: Math.round(max) })); }
      }
    }
    return out;
  }

  // a message from a page: may it go through? (dropped when it comes faster than its kind may)
  function allow(p, t) {
    const c = (p.acRate ||= { at: 0, n: Object.create(null), dropped: 0, droppedAt: 0 });   // (no prototype: 'constructor' is a kind like any other)
    const s = Math.floor(now() / 1000);
    if (c.at !== s) { c.at = s; c.n = Object.create(null); }
    const k = typeof t === 'string' && t.length < 16 ? t : '?';
    const n = (c.n[k] = (c.n[k] || 0) + 1);
    if (n <= (Object.hasOwn(RATES, k) ? RATES[k] : DEFAULT_RATE)) return true;
    if (now() - c.droppedAt > 10e3) { c.dropped = 0; c.droppedAt = now(); }
    if (++c.dropped === 60) flag('rate', p, `sent '${k}' messages far faster than a page does (${n} in a second)`, { kind: k });
    return false;
  }
  function input(p) {
    const c = (p.acIn ||= { at: 0, n: 0, over: 0 });
    const s = Math.floor(now() / 1000);
    if (c.at !== s) { if (c.n > INPUT_MAX) { if (++c.over === 3) flag('input', p, `${c.n} input packets a second`, { n: c.n }); } else c.over = 0; c.at = s; c.n = 0; }
    return ++c.n <= INPUT_MAX * 2;
  }
  // earnings in the last hour (server/analytics.js): flagged once an hour when far above the norm
  function earned(p, perHour, norm) {
    const limit = Math.max(ECON.floor, (norm || 0) * ECON.mult);
    if (perHour <= limit || now() - (p.acEconAt || 0) < 3600e3) return null;
    p.acEconAt = now();
    return flag('econ', p, `earned $${Math.round(perHour).toLocaleString('en-US')} in the last hour (the norm: $${Math.round(norm || 0).toLocaleString('en-US')})`, { perHour: Math.round(perHour), norm: Math.round(norm || 0) });
  }
  return { audit, allow, input, earned, flags, allowed };
}
