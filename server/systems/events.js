// Live world events (snatch-and-grabs, contraband drops) and per-player guidance (where to
// return a recovered purse). Clients get a small list in their `me` payload and draw blips +
// a fading arrow (client/hud.js, client/main.js).
import { K } from '../../shared/constants.js';
import { HELP_PING_PX, CALM_STREETS } from '../../shared/rules.js';
import { EVENT_RANGE, EVENT_KINDS, FEED_MAX, FEED_KEEP_S } from '../../shared/worldevents.js';

let petTarget = () => null; // set by pets.js (it imports this module)
export function setPetTarget(fn) { petTarget = fn; }
let walletTarget = () => null; // set by happenings.js: the owner of a dropped wallet you're carrying
export function setWalletTarget(fn) { walletTarget = fn; }

// Event text for the city feed when the caller doesn't give one.
const FEED_TEXT = { snatch: 'Purse snatched', drop: 'Contraband crate spotted', shootout: 'Gang shootout with the police', robbery: 'Store robbery - alarm tripped' };

export function add(world, ev) {
  world.happenings ??= [];
  world.happeningSeq = (world.happeningSeq || 0) + 1;
  const e = { id: world.happeningSeq, t: world.time, ...ev };
  world.happenings.push(e);
  for (const p of world.players.values()) p.meDirty = true;
  feed(world, { kind: ev.kind, text: ev.text || FEED_TEXT[ev.kind] || (EVENT_KINDS[ev.kind] || {}).label || 'Something happened', x: ev.x, y: ev.y });
  return e;
}

// The city feed: a running log of what's going on anywhere in the world, read on the phone.
export function feed(world, item) {
  world.feed ??= [];
  const d = item.x !== undefined ? world.map.districtAt(item.x, item.y) : null;
  world.feed.push({ t: world.time, kind: item.kind || 'news', text: item.text, x: item.x !== undefined ? Math.round(item.x) : null, y: item.y !== undefined ? Math.round(item.y) : null, where: d ? d.name : '' });
  if (world.feed.length > FEED_MAX) world.feed.splice(0, world.feed.length - FEED_MAX);
}

export function feedFor(world) {
  const now = world.time;
  return { t: 'feed', items: (world.feed || []).filter((f) => now - f.t < FEED_KEEP_S).map((f) => ({ ago: Math.round(now - f.t), kind: f.kind, text: f.text, where: f.where, x: f.x, y: f.y })).reverse() };
}

// Tell the players near (x, y); everyone else can read it in the city feed.
export function tellNear(world, x, y, text, tone = 'info', r = EVENT_RANGE) {
  for (const p of world.players.values()) if (p.ped && Math.hypot(p.ped.x - x, p.ped.y - y) < r) world.notify(p, text, tone);
}

export function update(world) {
  if (world.tick % 5 !== 2 || !world.happenings) return;
  const now = world.time;
  world.happenings = world.happenings.filter((e) => {
    if (now > e.until) return false;
    if (e.kind === 'snatch') {
      const victim = world.get(e.victim);
      if (!victim || victim.dead || !victim.npc || !victim.npc.robbed) return false; // purse returned / victim gone
      const thief = world.get(e.thief);
      if (thief && !thief.dead && thief.npc && thief.npc.hasPurse) { e.x = thief.x; e.y = thief.y; } // follow the runner
      else if (!e.dropAt) e.dropAt = now; // thief dropped it: the blip stays where it fell for a bit
      if (e.dropAt && now - e.dropAt > 25) return false;
    }
    if (e.kind === 'drop' && !world.dropRumor) return false;
    return true;
  });
}

// What one player should see: nearby events, plus a "return it" target when they hold a purse.
export function forPlayer(world, p) {
  const ped = p.ped;
  if (!ped) return null;
  const out = [];
  for (const e of world.happenings || []) {
    if (e.kind === 'revive' && e.pid === p.pid) continue; // your own call for help
    if (e.lead && e.lead === ped.id) continue; // the lost pet at your heel (its owner is your arrow now)
    if (Math.hypot(e.x - ped.x, e.y - ped.y) > (e.kind === 'revive' ? HELP_PING_PX : EVENT_RANGE)) continue;
    out.push({ id: e.id, k: e.kind, x: Math.round(e.x), y: Math.round(e.y) });
  }
  // down and waiting: the ambulance you called, wherever it is
  const amb = p.amb && world.get(p.amb.vehId);
  if (amb) out.push({ id: 'amb', k: 'amb', x: Math.round(amb.x), y: Math.round(amb.y) });
  const home = petTarget(world, p);
  if (home) out.push(...[].concat(home));   // (pets.js: the owner you're leading a pet to; lost pets' owners about)
  const owner = walletTarget(world, p);
  if (owner) out.push(owner);
  if ((p.profile.inventory.purse || 0) > 0) {
    let best = null, bd = EVENT_RANGE * 1.5;
    for (const e of world.query(ped.x, ped.y, bd, K.PED)) {
      if (!e.npc || e.dead || !e.npc.robbed) continue;
      const d = Math.hypot(e.x - ped.x, e.y - ped.y);
      if (d < bd) { bd = d; best = e; }
    }
    if (best) out.push({ id: 'r' + best.id, k: 'ret', x: Math.round(best.x), y: Math.round(best.y) });
  }
  return out.length ? out : null;
}

// ---- the calm streets (rules.js CALM_STREETS; the owner's notes, 10-22) ----------------------------------------------
// "If you stand in one place for not too long it always seems to fall apart into a chaotic scene ... Maybe in the 'bad'
// parts of town or gang areas, but otherwise things should be pretty tame": away from the rough, the poor and the
// red-light districts and the gangs' turf (roughAt) only fightShare of the happenings that would be a street fight are
// one (happenings.js), and snatchShare of the purse snatches happen (npc.js); and nothing new starts round a player - a
// happening, a snatch, a street race / chase / armored run (streetlife.js) - while `incidents` are already going on
// within incidentPx of them (busyNear: happenings, snatches, NPC fights - two people at it count as one).
// The rough parts of town: the rough, the poor and the red-light districts, and the gangs' turf - where trouble's usual
const ROUGH_TIERS = new Set(['rough', 'low', 'red']);
export function roughAt(map, x, y) {
  const d = map.districtAt(x, y);
  return !!d && (ROUGH_TIERS.has(d.tier) || !!d.turf);
}
// How much is going on round (x, y) already: the happenings and snatches under way (not a contraband crate's rumour),
// and the people fighting (two at it: one incident)
export function busyNear(world, x, y, r = CALM_STREETS.incidentPx) {
  const now = world.time;
  let n = 0, f = 0;
  for (const e of world.happenings || []) if (e.until > now && e.kind !== 'drop' && e.x !== undefined && Math.hypot(e.x - x, e.y - y) < r) n++;
  for (const q of world.query(x, y, r, K.PED)) if (q.npc && !q.dead && q.npc.state === 'fight' && !q.npc.happening && Math.hypot(q.x - x, q.y - y) < r) f++;
  return n + Math.ceil(f / 2);
}
export const calmBusy = (world, x, y) => busyNear(world, x, y) >= CALM_STREETS.incidents;
