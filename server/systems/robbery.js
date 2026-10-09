// Store robberies, v2 (the owner's notes, task #323). Point a gun at a shop clerk (a convenience store, a gas station, a
// bank teller, any shop counter) and they put their hands up. After a short beat they start throwing cash at you, a wad at
// a time, a little more each time - until the till is empty: each business holds only so much, by its kind and how rich
// its district is (ROB_TILL, ROB_TILL_TIER), and an emptied till fills back up over ROB_REFILL_S. The takings go into a
// robbery bag: hot money, not your cash (hotmoney.js - clean it far away, at home or at a fence).
// The police are called when someone sees it (anyone in the shop but the clerk, a passer-by, a camera: law.js
// CRIMES.robbery) or when the silent alarm trips at a moment you can't know (10, 15 or 20 s in): either way that's 1
// star, and from then on the heat keeps rising for as long as you stay - by the second and by the dollar taken, times
// the kind of place and the district's wealth (ROB_HEAT_*). The alarm also brings squad cars 10-15 s later; a suspect
// still inside when they get there is in a standoff (standoff.js), and the clerk ducks down behind the counter.
// Customers in the shop put their hands up too, then slip out of the door and run when they can (npc.js holdup).
import { K } from '../../shared/constants.js';
import { WEAPONS } from '../../shared/items.js';
import { ROB_WARMUP_S, ROB_TOSS_S, ROB_TAKE, ROB_ALARM_S, ROB_RESPONSE_S, ROB_TILL, ROB_TILL_TIER, ROB_REFILL_S, ROB_CALLED_HEAT, ROB_HEAT_S, ROB_HEAT_PER_100, ROB_HEAT_KIND, ROB_HEAT_TIER, ROB_SCENE_S } from '../../shared/rules.js';
import { angleDiff } from '../../shared/math.js';
import { mulberry32 } from '../../shared/rng.js';
import { store } from '../store.js';
import * as law from './law.js';
import * as events from './events.js';
import * as police from './police.js';
import * as hot from './hotmoney.js';
import * as standoff from './standoff.js';
import { walkInAt } from './npc.js';

const rng = mulberry32(1919);
const REACH = 300, AIM_CONE = 0.35, LET_GO_S = 1.6, CLERK_COOLDOWN_S = 120;

function clerkUnit(world, clerk) {
  const key = clerk.npc && clerk.npc.clerkOf;
  if (key === undefined) return null;
  const b = world.map.buildings[Math.floor(key / 16)];
  const u = b && b.walkIn && b.walkIn.units[key % 16];
  return u ? { u, b, poi: world.map.pois[u.poi] } : null;
}

// ---- the till -----------------------------------------------------------------------------------------------------------
const tierAt = (world, x, y) => world.map.districtAt(x, y).tier || 'mid';
const fullTill = (kind, tier) => Math.round((ROB_TILL[kind] ?? ROB_TILL.default) * (ROB_TILL_TIER[tier] ?? 1));
// What's in a business's till now ({ left, full }): full until it's robbed, then filling back up (world.tills, by the
// clerk's key: building * 16 + unit)
export function till(world, key, kind, tier) {
  const full = fullTill(kind, tier), t = world.tills && world.tills.get(key);
  return { left: t ? Math.min(full, t.left + (full * (world.time - t.at)) / ROB_REFILL_S) : full, full };
}
function takeFrom(world, key, kind, tier, want) {
  const { left } = till(world, key, kind, tier), n = Math.max(0, Math.min(Math.floor(left), want));
  (world.tills ??= new Map()).set(key, { left: left - n, at: world.time });
  return n;
}

// The clerk you're pointing a gun at, if any.
function targetClerk(world, ped) {
  const w = WEAPONS[ped.weapon];
  if (!w || (w.type !== 'gun' && w.type !== 'rocket' && w.type !== 'bow') || ped.vehId || world.time > (ped.aimUntil || 0)) return null;
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
  const now = world.time, key = clerk.npc.clerkOf, tier = tierAt(world, clerk.x, clerk.y);
  const { left } = till(world, key, info.u.kind, tier);
  const r = {
    clerk: clerk.id, key, kind: info.u.kind, tier, u: info.u, label: info.poi.label, x: clerk.x, y: clerk.y,
    t0: now, nextToss: now + ROB_WARMUP_S, alarmAt: now + ROB_ALARM_S[Math.floor(rng() * ROB_ALARM_S.length)], alarmed: false,
    called: false, heatAt: now, heatAcc: 0, take: 0, tosses: 0, lastAim: now, empty: left < 1, ducked: false,
  };
  p.robbery = r;
  p.robbedAt = { u: info.u, bid: Math.floor(key / 16), until: now + ROB_SCENE_S };   // (the scene: standoff.js)
  clerk.handsUp = true; clerk.npc.blind = true;
  world.notify(p, left < 1 ? `Robbing ${info.poi.label} - but the till's empty: it was cleaned out not long ago.`
    : `Robbing ${info.poi.label}! Keep your gun on the clerk. The takings go in a bag - hot money: you can't spend it, or bank it anywhere near here.`, 'warn');
  // the clerk isn't a witness, but anyone else in the shop (or a camera outside) is: called in, that's 1 star
  if (law.crime(world, p.ped, 'robbery', null, clerk.x, clerk.y)) callIn(world, p, r);
  p.meDirty = true;
}

function end(world, p, why) {
  const r = p.robbery;
  p.robbery = null;
  p.meDirty = true;
  const clerk = world.get(r.clerk);
  if (clerk) {
    clerk.handsUp = false;
    if (clerk.npc) { clerk.npc.blind = false; clerk.npc.robbedUntil = world.time + CLERK_COOLDOWN_S; }
    if (r.ducked) clerk.downUntil = Math.max(clerk.downUntil || 0, world.time + 6);   // (stays down a while)
  }
  if (r.take > 0) world.notify(p, `${why} You got away with $${r.take.toLocaleString('en-US')} in hot money - clean it far from here, at home or at a fence.`, r.called ? 'warn' : 'good');
  else world.notify(p, why, 'info');
}

// The police know: at least 1 star (more if you were wanted already), and the heat grows from here - starting with what's
// been taken so far (time counts from now)
function callIn(world, p, r) {
  if (r.called) return;
  r.called = true; r.heatAt = world.time;
  const need = ROB_CALLED_HEAT - p.heat;
  if (need > 0) law.addHeat(world, p, need, r.x, r.y);
  else { p.seenAt = world.time; p.lastSeenX = r.x; p.lastSeenY = r.y; }
  grow(world, p, r, r.take);
}
// Heat with the job: ROB_HEAT_S a second and ROB_HEAT_PER_100 every $100, times the place and the district
const heatMul = (r) => (ROB_HEAT_KIND[r.kind] ?? ROB_HEAT_KIND.default) * (ROB_HEAT_TIER[r.tier] ?? 1);
function grow(world, p, r, took) {
  if (!r.called) return;
  const now = world.time;
  r.heatAcc += ((now - r.heatAt) * ROB_HEAT_S + (took / 100) * ROB_HEAT_PER_100) * heatMul(r);
  r.heatAt = now;
  if (r.heatAcc >= 1) { const n = Math.floor(r.heatAcc); r.heatAcc -= n; law.addHeat(world, p, n, r.x, r.y); }
}

function alarm(world, p) {
  const r = p.robbery;
  r.alarmed = true;
  const now = world.time;
  world.emit(r.x, r.y, { e: 'alarm', x: r.x, y: r.y });
  callIn(world, p, r);
  law.logDispatch(world, 'robbery', r.x, r.y, p, p.wanted, 'alarm');
  p.profile.felonies = (p.profile.felonies || 0) + 1; // the alarm puts it on your record
  store.touch();
  events.add(world, { kind: 'robbery', x: r.x, y: r.y, until: now + 90 });
  world.robberyCalls ??= [];
  world.robberyCalls.push({ pid: p.pid, x: r.x, y: r.y, at: now + ROB_RESPONSE_S[0] + rng() * (ROB_RESPONSE_S[1] - ROB_RESPONSE_S[0]) });
  world.notify(p, 'ALARM! The silent alarm tripped - police are on their way, and every second here makes it worse!', 'bad');
}

// Customers in the shop: hands up too (npc.js holdup: then out of the door and away when they get the chance)
function customers(world, p, r) {
  if (world.tick % 10) return;
  for (const e of world.query(r.x, r.y, 420, K.PED)) {
    const n = e.npc;
    if (!n || e.dead || e.vehId || e.hidden || n.desk || n.role !== 'civ' || n.holdup || n.state === 'fight' || n.state === 'flee' || n.state === 'limp' || n.state === 'crawl' || n.state === 'passed') continue;
    const wi = walkInAt(world.map, e.x, e.y);
    if (!wi || wi.u !== r.u) continue;
    n.holdup = { by: p.ped.id, at: world.time, wait: 2.5 + rng() * 4 };
    n.state = 'holdup'; n.keep = true;
    e.handsUp = true; e.vx = 0; e.vy = 0;
  }
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
  hot.update(world);
  standoff.prune(world);
  if (world.tick % 2) return;
  for (const p of world.players.values()) {
    const ped = p.ped;
    if (!ped) continue;
    if (!p.robbery) {
      if (ped.dead || ped.hidden || p.custody) continue;
      const clerk = targetClerk(world, ped);
      if (clerk) start(world, p, clerk);
      continue;
    }
    const r = p.robbery;
    const clerk = world.get(r.clerk);
    if (ped.dead) { end(world, p, 'The robbery ended badly.'); continue; }
    if (p.custody) { end(world, p, 'The robbery is over.'); continue; }
    if (!clerk || clerk.dead || clerk.removed || !clerk.npc || !clerk.npc.desk) { end(world, p, 'The clerk is down - nothing more to take.'); continue; }
    if (Math.hypot(ped.x - clerk.x, ped.y - clerk.y) > REACH + 60) { end(world, p, 'You walked out.'); continue; }
    if (targetClerk(world, ped) === clerk || (world.time < (ped.aimUntil || 0) && Math.abs(angleDiff(ped.aimAngle ?? ped.a, Math.atan2(clerk.y - ped.y, clerk.x - ped.x))) < AIM_CONE * 1.6)) r.lastAim = now;
    if (now - r.lastAim > LET_GO_S) { end(world, p, 'You lowered the gun.'); continue; }
    if (p.robbedAt) p.robbedAt.until = now + ROB_SCENE_S;
    // the police outside: the clerk ducks down behind the counter - and that's the end of the money
    const so = standoff.of(world, p);
    if (so && so.outAt) {
      clerk.handsUp = false;
      clerk.downUntil = Math.max(clerk.downUntil || 0, now + 0.6);
      if (!r.ducked) { r.ducked = true; world.notify(p, 'The police are outside - the clerk ducks down behind the counter. No more money now.', 'bad'); }
    } else clerk.handsUp = true;
    if (!r.alarmed && now >= r.alarmAt) alarm(world, p);
    let took = 0;
    if (!r.ducked && !r.empty && now >= r.nextToss) {
      const base = (ROB_TAKE[r.kind] ?? ROB_TAKE.default) * (ROB_TILL_TIER[r.tier] ?? 1);
      const amt = takeFrom(world, r.key, r.kind, r.tier, Math.round(base * (1 + r.tosses * 0.12)));
      r.nextToss = now + ROB_TOSS_S;
      if (amt > 0) {
        r.tosses++; r.take += amt; took = amt;
        hot.add(world, p, amt, r.x, r.y);   // (a second robbery moves the bag's "stolen at" spot here)
        p.profile.criminalExp = (p.profile.criminalExp || 0) + 1;
        world.emit(clerk.x, clerk.y, { e: 'cash', x: (clerk.x + ped.x) / 2, y: (clerk.y + ped.y) / 2, n: amt });
      }
      if (till(world, r.key, r.kind, r.tier).left < 1) { r.empty = true; world.notify(p, '"That\'s all there is - the till\'s empty!"', 'warn'); }
      p.meDirty = true;
    }
    grow(world, p, r, took);
    customers(world, p, r);
  }
}

// HUD: the robbery bar (the till draining as the money comes; the hot money itself shows under your cash)
export function hudFor(world, p) {
  const r = p.robbery;
  if (!r) return null;
  const warm = Math.min(1, (world.time - r.t0) / ROB_WARMUP_S);
  const t = till(world, r.key, r.kind, r.tier);
  return { take: r.take, warm: Math.round(warm * 100) / 100, alarm: r.alarmed, called: r.called, label: r.label, left: Math.floor(t.left), full: t.full, empty: r.empty, duck: r.ducked };
}
