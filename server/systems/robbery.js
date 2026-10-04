// Store robberies. Point a gun at a shop clerk (convenience store, gas station, any shop counter,
// a bank teller) and they put their hands up. After a short beat they start throwing cash at
// you, a wad at a time, a little more each time - until a silent alarm trips at a moment you
// can't know (10, 15 or 20 s in). Then you're at 3 stars and squad cars pull up 10-15 s later.
// Push your luck or walk. Witnesses (anyone other than the clerk) report the robbery either way.
import { K, STAR_HEAT } from '../../shared/constants.js';
import { WEAPONS } from '../../shared/items.js';
import { ROB_WARMUP_S, ROB_TOSS_S, ROB_TAKE, ROB_ALARM_S, ROB_RESPONSE_S, ROB_ALARM_STARS } from '../../shared/rules.js';
import { angleDiff } from '../../shared/math.js';
import { mulberry32 } from '../../shared/rng.js';
import { store } from '../store.js';
import * as law from './law.js';
import * as events from './events.js';
import * as police from './police.js';

const rng = mulberry32(1919);
const REACH = 300, AIM_CONE = 0.35, LET_GO_S = 1.6, CLERK_COOLDOWN_S = 120;

function clerkUnit(world, clerk) {
  const key = clerk.npc && clerk.npc.clerkOf;
  if (key === undefined) return null;
  const b = world.map.buildings[Math.floor(key / 16)];
  const u = b && b.walkIn && b.walkIn.units[key % 16];
  return u ? { u, poi: world.map.pois[u.poi] } : null;
}

// The clerk you're pointing a gun at, if any.
function targetClerk(world, ped) {
  const w = WEAPONS[ped.weapon];
  if (!w || (w.type !== 'gun' && w.type !== 'rocket') || ped.vehId || world.time > (ped.aimUntil || 0)) return null;
  let best = null, bd = REACH;
  for (const e of world.query(ped.x, ped.y, REACH, K.PED)) {
    if (!e.npc || !e.npc.desk || e.dead || e.npc.role === 'cop') continue;
    const d = Math.hypot(e.x - ped.x, e.y - ped.y);
    if (d > bd || Math.abs(angleDiff(ped.aimAngle ?? ped.a, Math.atan2(e.y - ped.y, e.x - ped.x))) > AIM_CONE) continue;
    if (!world.map.los(ped.x, ped.y, e.x, e.y)) continue;
    if (world.time < (e.npc.robbedUntil || 0)) continue;
    bd = d; best = e;
  }
  return best;
}

function start(world, p, clerk) {
  const info = clerkUnit(world, clerk);
  if (!info) return;
  const now = world.time;
  const r = {
    clerk: clerk.id, kind: info.u.kind, label: info.poi.label, x: clerk.x, y: clerk.y,
    t0: now, nextToss: now + ROB_WARMUP_S, alarmAt: now + ROB_ALARM_S[Math.floor(rng() * ROB_ALARM_S.length)], alarmed: false,
    take: 0, tosses: 0, lastAim: now,
  };
  p.robbery = r;
  clerk.handsUp = true; clerk.npc.blind = true;
  world.notify(p, `Robbing ${info.poi.label}! Keep your gun on the clerk - the longer you stay, the more you take... and the closer the alarm.`, 'warn');
  // the clerk isn't a witness, but anyone else in the shop (or a camera outside) is
  law.crime(world, p.ped, 'robbery', null, clerk.x, clerk.y);
  p.meDirty = true;
}

function end(world, p, why) {
  const r = p.robbery;
  p.robbery = null;
  p.meDirty = true;
  const clerk = world.get(r.clerk);
  if (clerk) { clerk.handsUp = false; if (clerk.npc) { clerk.npc.blind = false; clerk.npc.robbedUntil = world.time + CLERK_COOLDOWN_S; } }
  if (r.take > 0) world.notify(p, `${why} You got away with $${r.take}.`, r.alarmed ? 'warn' : 'good');
  else world.notify(p, why, 'info');
}

function alarm(world, p) {
  const r = p.robbery;
  r.alarmed = true;
  const now = world.time;
  world.emit(r.x, r.y, { e: 'alarm', x: r.x, y: r.y });
  const need = STAR_HEAT[ROB_ALARM_STARS] + 5 - p.heat;
  if (need > 0) law.addHeat(world, p, need, r.x, r.y);
  else { p.seenAt = now; p.lastSeenX = r.x; p.lastSeenY = r.y; }
  law.logDispatch(world, 'robbery', r.x, r.y, p, p.wanted, 'alarm');
  p.profile.felonies = (p.profile.felonies || 0) + 1; // the alarm puts it on your record
  events.add(world, { kind: 'robbery', x: r.x, y: r.y, until: now + 90 });
  world.robberyCalls ??= [];
  world.robberyCalls.push({ pid: p.pid, x: r.x, y: r.y, at: now + ROB_RESPONSE_S[0] + rng() * (ROB_RESPONSE_S[1] - ROB_RESPONSE_S[0]) });
  world.notify(p, 'ALARM! The silent alarm tripped - police are on their way!', 'bad');
}

export function update(world) {
  const now = world.time;
  // squad cars dispatched by tripped alarms
  if (world.robberyCalls && world.robberyCalls.length) {
    world.robberyCalls = world.robberyCalls.filter((c) => {
      if (now < c.at) return true;
      const p = world.players.get(c.pid);
      if (p && p.ped && !p.ped.dead && p.wanted > 0) police.respondTo(world, p, c.x, c.y, 3);
      return false;
    });
  }
  if (world.tick % 2) return;
  for (const p of world.players.values()) {
    const ped = p.ped;
    if (!ped) continue;
    if (!p.robbery) {
      if (ped.dead || ped.hidden) continue;
      const clerk = targetClerk(world, ped);
      if (clerk) start(world, p, clerk);
      continue;
    }
    const r = p.robbery;
    const clerk = world.get(r.clerk);
    if (ped.dead) { end(world, p, 'The robbery ended badly.'); continue; }
    if (!clerk || clerk.dead || clerk.removed || !clerk.npc || !clerk.npc.desk) { end(world, p, 'The clerk is down - nothing more to take.'); continue; }
    if (Math.hypot(ped.x - clerk.x, ped.y - clerk.y) > REACH + 60) { end(world, p, 'You walked out.'); continue; }
    if (targetClerk(world, ped) === clerk || (world.time < (ped.aimUntil || 0) && Math.abs(angleDiff(ped.aimAngle ?? ped.a, Math.atan2(clerk.y - ped.y, clerk.x - ped.x))) < AIM_CONE * 1.6)) r.lastAim = now;
    if (now - r.lastAim > LET_GO_S) { end(world, p, 'You lowered the gun.'); continue; }
    clerk.handsUp = true;
    if (!r.alarmed && now >= r.alarmAt) alarm(world, p);
    if (now >= r.nextToss) {
      const base = ROB_TAKE[r.kind] ?? ROB_TAKE.default;
      const amt = Math.round(base * (1 + r.tosses * 0.12));
      r.tosses++; r.take += amt; r.nextToss = now + ROB_TOSS_S;
      p.profile.cash += amt;
      p.profile.criminalExp = (p.profile.criminalExp || 0) + 1;
      store.touch();
      world.emit(clerk.x, clerk.y, { e: 'cash', x: (clerk.x + ped.x) / 2, y: (clerk.y + ped.y) / 2, n: amt });
      p.meDirty = true;
    }
  }
}

// HUD: the robbery bar.
export function hudFor(world, p) {
  const r = p.robbery;
  if (!r) return null;
  const warm = Math.min(1, (world.time - r.t0) / ROB_WARMUP_S);
  return { take: r.take, warm: Math.round(warm * 100) / 100, alarm: r.alarmed, label: r.label };
}
