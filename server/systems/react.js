// NPC reactions: a ladder instead of fight-or-flee (the owner, 11-25 00:33: "not just automatically attack ... sometimes
// take cover, react not with violence first, react scared and run off, react cautious"; the design and his go, 11-27:
// docs/tasks/NPC-REACTIONS-DESIGN-2026-11-26.md). Part 1: civilians on foot - someone hit, a gun pointed at them, shots
// near them, a carjacked driver. The steps (shared/rules.js REACT):
//   2 back off / warn  - hands up, backing away: "Whoa, easy!"; a tough one squares up: "Back off."   ('warn')
//   3 run, hide or call it in - off and away, or crouched behind a parked car or a wall close by on the far side ('hide'),
//                         some on the phone as they go (law.js's witness report is the call itself)
//   4 draw              - an armed one: the weapon on you, held - "Drop it!" - no shot yet (npc.js fight's holdFireUntil)
//   6 fight             - fists for the tough, the weapon for the armed (npc.js startFight)
// Temperament (temper: timid 0, ordinary 1, tough 2, armed 3) says how far a person goes, how bad it is (sev 1-3) where
// they start, and the same one again within REACT.memoryS a step further. Police, gangs, guards, bouncers, staff behind a
// counter, bikers, a gang war's fighters keep their own ways (npc.js onAttacked's earlier cases).
import { K, TILE } from '../../shared/constants.js';
import { IN } from '../../shared/input.js';
import { DISTRICTS } from '../../shared/mapcore.js';
import { PED_BLOCK } from '../../shared/map.js';
import { WEAPONS } from '../../shared/items.js';
import { REACT } from '../../shared/rules.js';
import * as npc from './npc.js';

const NO_INPUT = { bits: 0, mx: 0, my: 0, aim: 0 };
const hash = (n, k) => { let h = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(k, 0xc2b2ae35); h ^= h >>> 13; h = Math.imul(h, 0x27d4eb2f); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
export const armedCiv = (ped) => { const w = WEAPONS[ped.weapon]; return !!w && w.type !== 'melee' && w.type !== 'tool' && ped.weapon !== 'fists'; };

// how far up the ladder someone goes: timid 0, ordinary 1, tough 2, armed 3 - fixed for a person (seeded by who they are)
export function temper(world, ped) {
  const n = ped.npc;
  if (armedCiv(ped)) return 3;
  if (n.temper !== undefined) return n.temper;
  let t = n.tough ? 2 : REACT.temper[n.archetype] ?? 1;
  const m = world.map, d = m.inside && m.inside(Math.floor(ped.x / TILE), Math.floor(ped.y / TILE)) ? DISTRICTS[m.dist[m.idx(Math.floor(ped.x / TILE), Math.floor(ped.y / TILE))]] : null;
  const tier = d && d.tier, r = hash(ped.id, 1);
  if ((tier === 'rough' || tier === 'red') && r < REACT.rough) t++;
  else if (tier === 'lux' && r < REACT.lux) t--;
  const s = hash(ped.id, 2);
  if (s < REACT.spread) t--; else if (s > 1 - REACT.spread) t++;
  return (n.temper = Math.max(0, Math.min(2, t)));
}

// a word bubble - a few at a time in one place, not the whole street at once
function say(world, ped, kind) {
  const now = world.time, L = REACT.lines[kind];
  if (!L) return;
  const log = (world.reactSays ||= []).filter((q) => now - q.t < REACT.sayGap);
  world.reactSays = log;
  if (log.filter((q) => Math.hypot(q.x - ped.x, q.y - ped.y) < REACT.sayNear).length >= REACT.saySame) return;
  log.push({ x: ped.x, y: ped.y, t: now });
  const text = L[Math.floor(hash(ped.id, Math.floor(now * 10)) * L.length) % L.length];
  world.emit(ped.x, ped.y, { e: 'say', id: ped.id, x: Math.round(ped.x), y: Math.round(ped.y), text });
}

// cover close by on the far side from (fx, fy): beside a parked car, or tucked in at a wall - where to crouch, or null
function coverFrom(world, ped, fx, fy, R = REACT.hidePx, carsOnly = false) {
  const away = Math.atan2(ped.y - fy, ped.x - fx);
  let best = null, bd = R;
  for (const v of world.query(ped.x, ped.y, R + 30, K.VEH)) {
    if (v.ai || v.dead || v.def.kind === 'boat' || v.def.kind === 'air' || Math.hypot(v.vx, v.vy) > 5) continue;
    const off = v.def.W / 2 + 14, x = v.x + Math.cos(away) * off, y = v.y + Math.sin(away) * off, d = Math.hypot(x - ped.x, y - ped.y);
    if (d < bd && !PED_BLOCK[world.map.tileAtPx(x, y)]) {
      // (the car between them and the spot: round its nearer end first - via)
      const c = Math.cos(v.a), sn = Math.sin(v.a), inCar = (px, py) => { const lx = (px - v.x) * c + (py - v.y) * sn, ly = -(px - v.x) * sn + (py - v.y) * c; return Math.abs(lx) < v.def.L / 2 + 6 && Math.abs(ly) < v.def.W / 2 + 6; };
      let blocked = false;
      for (let k = 1; k < 8 && !blocked; k++) blocked = inCar(ped.x + (x - ped.x) * k / 8, ped.y + (y - ped.y) * k / 8);
      const end = ((ped.x - v.x) * c + (ped.y - v.y) * sn) >= 0 ? 1 : -1, r = v.def.L / 2 + 14;
      best = { x, y, via: blocked ? { x: v.x + c * r * end, y: v.y + sn * r * end } : null, car: v.id, cx: v.x, cy: v.y }; bd = d;
    }
  }
  if (best || carsOnly) return best;
  for (let k = 1; k <= 4; k++) for (const da of [0, 0.6, -0.6, 1.2, -1.2]) {   // a wall: the block between them and it
    const a = away + da, x = ped.x + Math.cos(a) * k * 16, y = ped.y + Math.sin(a) * k * 16;
    if (PED_BLOCK[world.map.tileAtPx(x + Math.cos(a) * 14, y + Math.sin(a) * 14)] && !PED_BLOCK[world.map.tileAtPx(x, y)]) {
      // (tucked against it: the threat on the other side of it is no good - only a wall to one side of the line counts)
      const side = Math.abs(Math.sin(da)) > 0.4 || k === 1;
      if (side) return { x, y };
    }
  }
  return null;
}

const ok = (ped) => {
  const n = ped && ped.npc;
  return !!n && !ped.dead && !ped.vehId && n.role === 'civ' && !n.desk && !n.guard && !n.driven && !n.warSide && !n.club && !n.happening && n.bouncer == null && n.state !== 'crawl' && n.state !== 'limp' && n.state !== 'passed';
};

// Something happened to this person: `by` (who did it, or null), how bad (sev 1-3), what (cause: 'hit', 'aim',
// 'shots', 'carjack'); (fx, fy): where it came from. true: the ladder took it (else the caller does what it did before)
export function incident(world, ped, by, sev, cause, fx = by ? by.x : ped.x, fy = by ? by.y : ped.y) {
  if (!ok(ped)) return false;
  const n = ped.npc, now = world.time, T = temper(world, ped);
  const again = !!by && n.rx && n.rx.by === by.id && now - n.rx.at < REACT.memoryS;
  n.rx = { by: by ? by.id : 0, at: now, n: again ? n.rx.n + 1 : 1, cause };
  // the top step for this: by temperament and how bad it is, a step further for a second time
  let step = T === 0 ? 3 : T === 1 ? (sev <= 1 ? 2 : 3) : T === 2 ? (sev >= 3 ? 3 : 2) : (sev >= 3 && cause === 'shots' && !by ? 3 : 4);
  if (again) step = T === 0 ? 3 : T === 1 ? (step === 2 ? (world.rand() < n.fight ? 6 : 3) : 3) : T === 2 ? (sev >= 3 ? 3 : 6) : 6;
  if (cause === 'aim' && T <= 1) step = 2;   // (a gun on you: hands up, not your back to it - unless it fires)
  if (T === 2 && cause === 'shots' && by && Math.hypot(by.x - ped.x, by.y - ped.y) > 90 && !again) { ped.a = Math.atan2(by.y - ped.y, by.x - ped.x); return true; }   // (tough: a shot further off - they turn and stare)
  if (step === 2) return warn(world, ped, by, fx, fy, T, cause);
  if (step === 3) return runOrHide(world, ped, fx, fy, T, sev);
  if (step === 4) { draw(world, ped, by); return true; }
  if (by) { npc.startFight(world, ped, by, 14); if (T === 3) n.holdFireUntil = 0; return true; }
  return runOrHide(world, ped, fx, fy, T, sev);
}

function warn(world, ped, by, fx, fy, T, cause) {
  const n = ped.npc;
  n.state = 'warn'; n.target = by ? by.id : 0; n.fx = fx; n.fy = fy; n.until = world.time + REACT.warnS;
  ped.handsUp = T < 2; n.squared = T >= 2;
  say(world, ped, cause === 'aim' ? 'aim' : T >= 2 ? 'tough' : 'warn');
  return true;
}
// step 4: the weapon on them and held - no shot - for a moment, then lowered (npc.js fight ends with its time); again
// within REACT.memoryS and it's step 6: the fight, the hold let go (incident)
function draw(world, ped, by) {
  const n = ped.npc;
  if (!by) return;
  npc.startFight(world, ped, by, REACT.drawS[0] + world.rand() * (REACT.drawS[1] - REACT.drawS[0]));
  n.holdFireUntil = n.until + 1;
  say(world, ped, 'draw');
}
function runOrHide(world, ped, fx, fy, T, sev) {
  const n = ped.npc, now = world.time;
  ped.handsUp = false;
  const c = sev >= 2 && world.rand() < REACT.hideChance ? coverFrom(world, ped, fx, fy) : null;
  if (world.rand() < REACT.callChance[T]) { ped.phoneOut = true; n.callUntil = now + REACT.callS; }
  if (c) { n.state = 'hide'; n.hx = c.x; n.hy = c.y; n.via = c.via || null; n.fx = fx; n.fy = fy; n.until = now + REACT.hideS; if (sev >= 3) say(world, ped, 'hide'); return true; }
  npc.flee(world, ped, fx, fy, 5 + world.rand() * 3);
  return true;
}

// the steps' own states, a tick each (npc.js update's switch): back to wandering at the end
export function warnStep(world, ped, now) {
  const n = ped.npc, t = n.target ? world.get(n.target) : null;
  if (t && !t.dead && !t.removed) { n.fx = t.x; n.fy = t.y; }
  const dx = n.fx - ped.x, dy = n.fy - ped.y, d = Math.hypot(dx, dy) || 1;
  if (now > n.until || !t) { end(ped); n.state = 'wander'; n.awayFrom = Math.atan2(-dy, -dx); return NO_INPUT; }
  if (d < REACT.warnPx) {   // too close: the tough swing, the rest run
    const sq = n.squared;
    end(ped);
    if (sq && t) { npc.startFight(world, ped, t, 12); return NO_INPUT; }
    npc.flee(world, ped, n.fx, n.fy, 5 + world.rand() * 3);
    return NO_INPUT;
  }
  const aim = Math.atan2(dy, dx);
  if (n.squared) { ped.a = aim; return { ...NO_INPUT, aim }; }   // (squared up: standing their ground, facing them)
  return { bits: 0, mx: -dx / d * REACT.backPx, my: -dy / d * REACT.backPx, aim, face: aim };
}
export function hideStep(world, ped, now) {
  const n = ped.npc, d = Math.hypot(n.hx - ped.x, n.hy - ped.y);
  if (now > n.until) { n.state = 'wander'; ped.crouch = false; n.awayFrom = Math.atan2(ped.y - n.fy, ped.x - n.fx); return NO_INPUT; }
  // (getting there; held up against the car or a kerb for a moment - tucked in close enough: down where they are)
  const moved = Math.hypot(ped.x - (n.hlx ?? ped.x + 99), ped.y - (n.hly ?? ped.y));
  if (moved > 3) { n.hlx = ped.x; n.hly = ped.y; n.hlt = now; }
  const held = now - (n.hlt ?? now) > 0.8;
  if (!ped.crouch && !(held && d < 60)) {
    if (n.via && !held) { if (Math.hypot(n.via.x - ped.x, n.via.y - ped.y) > 10) return npc.seek(ped, n.via.x, n.via.y, true); n.via = null; }
    else if (n.via) { n.via = null; n.hlt = now; }
    if (d > 16) return npc.seek(ped, n.hx, n.hy, true);
  }
  ped.crouch = true; ped.vx = 0; ped.vy = 0; ped.a = Math.atan2(n.fy - ped.y, n.fx - ped.x);
  return NO_INPUT;
}
function end(ped) { ped.handsUp = false; ped.npc.squared = false; }

// every few ticks: what lingers (the phone after the call; hands down and crouches up out of these steps); a gun pointed
// at someone: they've seen it (sev 2 - hands up; an armed one draws)
export function update(world) {
  if (world.tick % 6 !== 2) return;
  const now = world.time;
  for (const p of world.players.values()) {
    const ped = p.ped;
    if (!ped || ped.dead || ped.vehId || !(now < (ped.aimUntil || 0))) continue;
    const w = WEAPONS[ped.weapon];
    if (!w || (w.type !== 'gun' && w.type !== 'bow' && w.type !== 'rocket')) continue;
    for (const e of world.query(ped.x, ped.y, REACT.aimPx, K.PED)) {
      if (e === ped || !ok(e) || (e.npc.rx && e.npc.rx.by === ped.id && now - e.npc.rx.at < REACT.warnS + 1)) continue;
      const a = Math.atan2(e.y - ped.y, e.x - ped.x), da = Math.abs(Math.atan2(Math.sin(a - ped.a), Math.cos(a - ped.a)));
      if (da > REACT.aimCone || !world.map.los(ped.x, ped.y, e.x, e.y)) continue;
      if (e.npc.state === 'fight' || e.npc.state === 'flee' || e.npc.state === 'hide') continue;
      incident(world, e, ped, 2, 'aim');
    }
  }
  for (const e of world.entities.values()) {
    if (e.kind !== K.PED || !e.npc) continue;
    const n = e.npc;
    if (n.callUntil && now > n.callUntil) { n.callUntil = 0; if (!e.filming) e.phoneOut = false; }
    if (e.crouch && n.state !== 'hide' && !n.cover) e.crouch = false;
    if (n.cover && n.state !== 'fight' && n.role !== 'cop') dropCover(e);   // (an officer's: police.js drops it)
    if (n.squared && n.state !== 'warn') n.squared = false;
    if (e.handsUp && n.state !== 'warn' && n.state !== 'holdup' && !n.robHold && n.rx) { e.handsUp = false; n.rx = null; }
  }
}

// Step 5, cover (part 2 - the design's "into cover first, then fire from it"): someone fighting with a gun (npc.js fight)
// whose target has one too gets behind a still car close by - round its end if need be - and fires over it in bursts:
// crouched (ped.crouch: the page's kneel), then up, shooting (their shots go over the car: combat.js coverCar; up, a
// shot just over it finds them - not a wall to hide behind for good). Out of it when the fight's too far off, the other
// has no gun, or the car moves or goes. Returns the input while in cover (or getting there), else null: the fight as before.
const gunIn = (e) => { const w = !e.vehId && WEAPONS[e.weapon]; return !!w && (w.type === 'gun' || w.type === 'bow' || w.type === 'rocket'); };
export function dropCover(ped) { const n = ped.npc; if (n.cover) { n.cover = null; n.coverCar = 0; ped.crouch = false; } }
export function coverFight(world, ped, t, d, aim, now, cop = false) {
  const n = ped.npc;
  if ((n.role === 'cop' && !cop) || n.role === 'railguard' || !gunIn(t) || d > REACT.coverFar) { dropCover(ped); return null; }
  let c = n.cover;
  if (c) {
    const v = world.get(c.car);
    // (the car gone or moved; or they've come round it - it isn't between them any more)
    const side = v && ((c.x - v.x) * (t.x - v.x) + (c.y - v.y) * (t.y - v.y)) < 0;
    if (!v || v.removed || v.wreckAt || Math.hypot(v.x - c.cx, v.y - c.cy) > 20 || !side) { dropCover(ped); c = null; n.coverTryAt = now + 1; }
  }
  if (!c) {
    if (now < (n.coverTryAt || 0)) return null;
    n.coverTryAt = now + REACT.coverRetryS;
    const s = coverFrom(world, ped, t.x, t.y, REACT.coverPx, true);
    if (!s) return null;
    c = n.cover = { ...s, in: false, t0: now };
    n.coverCar = s.car;
  }
  if (!c.in) {
    if (c.via && Math.hypot(c.via.x - ped.x, c.via.y - ped.y) > 10) return npc.seek(ped, c.via.x, c.via.y, true);
    c.via = null;
    if (Math.hypot(c.x - ped.x, c.y - ped.y) > 14) return npc.seek(ped, c.x, c.y, true);
    c.in = true; c.t0 = now;
  }
  ped.vx = 0; ped.vy = 0;
  const up = (now - c.t0) % (REACT.coverDuckS + REACT.coverFireS) >= REACT.coverDuckS;
  ped.crouch = !up; ped.a = aim;
  const held = now < (n.holdFireUntil || 0);
  return { bits: up ? (held ? IN.AIMING : IN.AIMING | IN.FIRE) : 0, mx: 0, my: 0, aim };
}
