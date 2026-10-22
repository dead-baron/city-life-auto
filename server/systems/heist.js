// Bank heists (the owner's #306, 10-07 / 10-08: "heists and bank robberies"). Every bank you can walk into has a vault
// door on the back wall behind the counter (shared/heist.js vaultOf). Bring a thermal drill (the black market sells
// them - shared/items.js drill) round the end of the counter to the door and set it there:
// - the bank's alarm goes the moment it starts: a bank heist on your record and HEIST.heat at once (3 stars), climbing
//   HEIST.heatS a second while the drill runs; squads HEIST.responseS later (HEIST.units of them, as many again
//   HEIST.wave2S after), and the police treat the bank as the scene: they surround it and come in (standoff.js, as at a
//   robbery - p.robbedAt);
// - the drill works HEIST.drillS seconds through the door on its own - you hold them off. On the way it jams (up to
//   HEIST.jams times): it stops until someone clears it at the drill (anyone - a crew's friend too). Left jammed
//   HEIST.abandonS, the police take it away and the job's over - and a police player at the door takes it off at once;
// - through: the door swings open and the vault's load spills out in front of it - the district's crates (cargo.js: an
//   iron safe-deposit box, a carbon-gold case of bars), contraband for the fence - and the drawers' cash goes into the
//   bag of whoever set the drill, if they're still there (hot money: hotmoney.js). Carry the crates out to something
//   with an open bed and get away (the extraction);
// - the vault stands open HEIST.openS, then it's cleaned out for HEIST.cooldownS.
// The page sees it as events round the bank (re-said every few seconds, like the spike strips): 'vault' (st: 'drill'
// with k how far through and j jammed, or 'open'), 'vaultgone' (shut again), 'drill' (the drill's whine and sparks),
// 'drilljam', 'vaultopen'; client/vault.js draws the door, the drill and the open vault.
//   world.vaults: building id -> { bid, x, y, sx, sy, label, tier, u, st: 'drill' | 'open' | 'shut', by (pid), at, work,
//     jamAt [fractions], jammed, jamT, said, buzz, until, calls [[time, units]] }
import { HEIST, CREW, ROB_TILL_TIER, ROB_SCENE_S } from '../../shared/rules.js';
import { vaultOf, bankAt } from '../../shared/heist.js';
import { mulberry32 } from '../../shared/rng.js';
import { store } from '../store.js';
import * as law from './law.js';
import * as events from './events.js';
import * as police from './police.js';
import * as hot from './hotmoney.js';
import * as crews from './crews.js';

const rng = mulberry32(3060);
const ANNOUNCE_S = 3, BUZZ_S = 1.1, ALARM_S = 18;
const tierAt = (world, x, y) => world.map.districtAt(x, y).tier || 'mid';
const say = (world, V) => world.emit(V.x, V.y, V.st === 'open'
  ? { e: 'vault', id: V.bid, x: Math.round(V.x), y: Math.round(V.y), st: 'open', left: Math.max(0, Math.round(V.until - world.time)) }
  : { e: 'vault', id: V.bid, x: Math.round(V.x), y: Math.round(V.y), st: 'drill', k: +(V.work / HEIST.drillS).toFixed(3), j: V.jammed ? 1 : 0 });

// The vault at a bank (world.vaults' entry, or a new one for the bank's door), or null for somewhere that isn't a bank
function vaultAt(world, b) {
  const v = vaultOf(b);
  if (!v) return null;
  const poi = world.map.pois[v.u.poi];
  return { bid: b.id, x: v.x, y: v.y, sx: v.sx, sy: v.sy, x0: v.x0, x1: v.x1, u: v.u, label: poi ? poi.label : 'the bank', tier: tierAt(world, v.x, v.y) };
}
export const stateOf = (world, bid) => (world.vaults && world.vaults.get(bid)) || null;

// The action button at a vault door (players.js interaction)
export function interaction(world, p) {
  const ped = p.ped;
  if (!ped || ped.dead || ped.vehId || ped.carrying || p.custody) return null;
  const b = bankAt(world.map, ped.x, ped.y), V0 = b && vaultAt(world, b);
  if (!V0 || Math.hypot(ped.x - V0.sx, ped.y - V0.sy) > HEIST.reach) return null;
  const V = stateOf(world, b.id);
  if (p.badge) {   // (an officer: takes a drill off the door, never helps one along)
    if (V && V.st === 'drill') return { label: 'Take the drill off the vault door', run: () => seize(world, p, V) };
    return { label: V && V.st === 'open' ? 'The vault\'s been cracked' : 'The vault door', run: () => {} };
  }
  if (V && V.st === 'drill') {
    if (V.jammed) return { label: 'The drill\'s jammed - clear it', run: () => unjam(world, p, V) };
    return { label: `The drill's working through the vault door... ${Math.floor(V.work / HEIST.drillS * 100)}%`, run: () => {}, prog: V.work / HEIST.drillS };
  }
  if (V && V.st === 'open') return { label: 'The vault\'s open - grab what\'s inside', run: () => {} };
  if (V && V.st === 'shut') return { label: 'The vault\'s been cleaned out - it\'ll be a while before it\'s worth another go', run: () => {} };
  if (!((p.profile.inventory || {}).drill > 0)) return { label: 'The vault door - you\'d need a thermal drill (the black market sells them)', run: () => {} };
  return { label: 'Set the thermal drill on the vault - a bank heist (the alarm goes at once)', crime: 'heist', run: () => start(world, p, b) };
}

export function start(world, p, b) {
  const ped = p.ped, inv = p.profile.inventory || {};
  if (!ped || ped.dead || !(inv.drill > 0)) return false;
  const V0 = vaultAt(world, b);
  if (!V0 || stateOf(world, b.id)) return false;
  inv.drill -= 1;
  if (!inv.drill) delete inv.drill;
  const now = world.time, n = 1 + Math.floor(rng() * HEIST.jams);   // (one jam at least, up to HEIST.jams)
  const jamAt = [];
  for (let i = 0; i < n; i++) jamAt.push(0.2 + (0.65 * (i + rng())) / n);
  const V = { ...V0, st: 'drill', by: p.pid, at: now, work: 0, jamAt, jammed: false, jamT: 0, said: now, buzz: now, alarmT: now, calls: [[now + HEIST.responseS[0] + rng() * (HEIST.responseS[1] - HEIST.responseS[0]), HEIST.units]] };
  V.calls.push([V.calls[0][0] + HEIST.wave2S, HEIST.units]);
  (world.vaults ??= new Map()).set(b.id, V);
  // the alarm: called in for certain (no witnesses needed), 3 stars, the scene
  law.crime(world, ped, 'heist', null, V.x, V.y, { silentCheck: false });
  if (p.heat < HEIST.heat) law.addHeat(world, p, HEIST.heat - p.heat, V.x, V.y);
  p.robbedAt = { u: V.u, bid: b.id, until: now + ROB_SCENE_S };
  world.emit(V.x, V.y, { e: 'alarm', x: V.x, y: V.y });
  say(world, V);
  events.add(world, { kind: 'heist', x: V.x, y: V.y, until: now + HEIST.drillS + 120, text: `The vault at ${V.label} is being drilled - every unit responding` });
  world.notify(p, `The drill's biting into ${V.label}'s vault - and the alarm's ringing. About ${HEIST.drillS} seconds: keep the police off it, and clear the drill if it jams.`, 'warn');
  p.meDirty = true;
  store.touch();
  return true;
}

function unjam(world, p, V) {
  if (!V.jammed) return;
  V.jammed = false;
  world.emit(V.x, V.y, { e: 'drill', x: Math.round(V.x), y: Math.round(V.y) });
  say(world, V);
  world.notify(p, 'The bit\'s free - the drill\'s back at it.', 'good');
}

// the drill taken off the door (an officer at it, or left jammed too long): the job's off, the vault shut a while
function seize(world, p, V) {
  if (V.st !== 'drill') return;
  V.st = 'shut'; V.until = world.time + HEIST.cooldownS / 6;
  world.emit(V.x, V.y, { e: 'vaultgone', id: V.bid });
  const q = world.players.get(V.by);
  if (q && q !== p) world.notify(q, `The police took your drill off ${V.label}'s vault - the job's off.`, 'bad');
  if (p) { world.notify(p, `You took the drill off ${V.label}'s vault.`, 'good'); p.profile.samaritan = (p.profile.samaritan || 0) + HEIST.seizeSam; p.meDirty = true; store.touch(); }
}

function open(world, V) {
  const now = world.time;
  V.st = 'open'; V.until = now + HEIST.openS; V.jammed = false;
  // the load: the district's crates, spread along the floor in front of the door
  const load = HEIST.load[V.tier] || HEIST.load.mid, n = load.length;
  load.forEach((tier, i) => {
    const x = Math.max(V.x0 + 14, Math.min(V.x1 - 14, V.x + (i - (n - 1) / 2) * 24));
    const c = world.spawnCrate(tier, x, V.sy, { contraband: true, label: `${V.label} vault`, expires: now + HEIST.cooldownS });
    c.vx = (x - V.x) * 0.8; c.vy = Math.sign(V.sy - V.y) * 45; c.z = 4; c.vz = 40;
  });
  world.emit(V.x, V.y, { e: 'vaultopen', id: V.bid, x: Math.round(V.x), y: Math.round(V.y) });
  say(world, V);
  events.feed(world, { kind: 'news', text: `${V.label}'s vault was cracked - the alarm's still ringing`, x: V.x, y: V.y });
  const p = world.players.get(V.by), ped = p && p.ped;
  if (!p) return;
  if (ped && !ped.dead && !p.custody && Math.hypot(ped.x - V.x, ped.y - V.y) < 400) {
    p.profile.criminalExp = (p.profile.criminalExp || 0) + HEIST.xp;
    // the drawers' cash: split with the crewmates there (crews.js), into each one's bag as hot money
    const there = [p, ...crews.matesOnline(world, p).filter((q) => q.ped && !q.ped.dead && !q.custody && !q.ped.sub && !q.ped.ug && Math.hypot(q.ped.x - V.x, q.ped.y - V.y) < CREW.share)];   // (up here, not in the subway or the sewers under it)
    const cash = Math.round(HEIST.cash * (ROB_TILL_TIER[V.tier] ?? 1)), each = Math.floor(cash / there.length);
    for (const q of there) {
      hot.add(world, q, each, V.x, V.y);
      if (q !== p) { q.profile.criminalExp = (q.profile.criminalExp || 0) + Math.round(HEIST.xp / 2); world.notify(q, `The vault's open! Your cut of the drawers: $${each.toLocaleString('en-US')} in your bag (hot money). Get the crates out.`, 'good'); q.meDirty = true; }
    }
    world.notify(p, `The vault door swings open! $${each.toLocaleString('en-US')} from the drawers in your bag (hot money${there.length > 1 ? `, your cut - split ${there.length} ways` : ''}), and ${n} crate${n === 1 ? '' : 's'} on the floor - carry them out to something with an open back and get them to a fence.`, 'good');
  } else world.notify(p, `${V.label}'s vault is open - the crates are on the floor for whoever gets there first.`, 'warn');
  p.meDirty = true;
  store.touch();
}

export function update(world, dt) {
  const vaults = world.vaults;
  if (!vaults || !vaults.size) return;
  const now = world.time;
  for (const [bid, V] of [...vaults]) {
    if (V.st === 'shut') { if (now >= V.until) vaults.delete(bid); continue; }
    if (V.st === 'open') {
      if (now >= V.until) { V.st = 'shut'; V.until = V.at + HEIST.cooldownS; world.emit(V.x, V.y, { e: 'vaultgone', id: bid }); continue; }
      if (now - V.said >= ANNOUNCE_S) { V.said = now; say(world, V); }
      continue;
    }
    // the drill
    const p = world.players.get(V.by);
    for (const c of V.calls) if (c[0] && now >= c[0]) { c[0] = 0; if (p && p.ped && !p.ped.dead && !p.custody && p.wanted > 0) police.respondTo(world, p, V.x, V.y, c[1]); }
    // (still in the bank while it runs: the heat climbs - in whole stars' worth at a time, as at a robbery - and it's the scene)
    if (p && p.ped && !p.ped.dead && !p.custody && !V.jammed && bankAt(world.map, p.ped.x, p.ped.y) === world.map.buildings[bid]) {
      V.heatAcc = (V.heatAcc || 0) + HEIST.heatS * dt;
      if (V.heatAcc >= 1 && p.wanted > 0) { const n = Math.floor(V.heatAcc); V.heatAcc -= n; law.addHeat(world, p, n, p.ped.x, p.ped.y); }
      if (p.robbedAt && p.robbedAt.bid === bid) p.robbedAt.until = now + ROB_SCENE_S;
    }
    if (now - V.alarmT >= ALARM_S) { V.alarmT = now; world.emit(V.x, V.y, { e: 'alarm', x: V.x, y: V.y }); }
    if (V.jammed) {
      if (now - V.jamT >= HEIST.abandonS) { seize(world, null, V); continue; }   // (nobody saw to it: the police take the drill away)
    } else {
      V.work += dt;
      if (V.jamAt.length && V.work >= V.jamAt[0] * HEIST.drillS) {
        V.jamAt.shift(); V.jammed = true; V.jamT = now;
        world.emit(V.x, V.y, { e: 'drilljam', x: Math.round(V.x), y: Math.round(V.y) });
        say(world, V);
        if (p) world.notify(p, 'The drill\'s jammed! Get back to the vault and clear it.', 'bad');
        continue;
      }
      if (V.work >= HEIST.drillS) { open(world, V); continue; }
      if (now - V.buzz >= BUZZ_S) { V.buzz = now; world.emit(V.x, V.y, { e: 'drill', x: Math.round(V.x), y: Math.round(V.y) }); }
    }
    if (now - V.said >= ANNOUNCE_S) { V.said = now; say(world, V); }
  }
}
