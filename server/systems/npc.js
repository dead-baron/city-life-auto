// Pedestrian AI (GDD §10): demographic spawning around players, sidewalk wandering,
// reflex dive-roll evasion, fight-or-flight temperaments, syndicate gangs in turf,
// passed-out boozers, rain umbrellas, and the Snatch-and-Grab street event (§12).
import { K, T, WEATHER, TILE } from '../../shared/constants.js';
import { DISTRICTS } from '../../shared/mapcore.js';
import { IN } from '../../shared/input.js';
import { pedStep } from '../../shared/physics.js';
import { isTurf, PED_BLOCK, isSwimming, nearestLand } from '../../shared/map.js';
import { mulberry32 } from '../../shared/rng.js';
import { ARCHETYPES, makeAppearance, BUILDS, rollBuild } from '../entities.js';
import * as players from './players.js';
import * as combat from './combat.js';
import * as law from './law.js';
import * as events from './events.js';
import * as gangwar from './gangwar.js';
import * as bikers from './bikers.js';
import * as nightclubs from './nightclubs.js';
import * as cargo from './cargo.js';
import * as vehicles from './vehicles.js';
import * as trains from './trains.js';
import * as wildlife from './wildlife.js';
import { inAnyView } from '../view.js';
import * as npclooks from './npclooks.js';
import * as personas from './personas.js';
import * as activities from './activities.js';
import * as burning from './burning.js';
import { NPC_GRIT, NPC_CRITICAL, LIMP_SPEED, CRAWL_HP, BRAWL_AFTER_S, VEH_CRIME, CALM_STREETS } from '../../shared/rules.js';
import { FLY } from '../../shared/flight.js';   // (an aircraft up in the air: over all this, untouched)

const WALK_TILES = new Set([T.SIDEWALK, T.PLAZA, T.LOT, T.GRASS, T.DOCK, T.SAND, T.DIRT, T.FLOOR]); // FLOOR: people browse the shops too
const PREFERRED = new Set([T.SIDEWALK, T.PLAZA]);
const COUNTRY_PREFERRED = new Set([T.DIRT, T.SIDEWALK, T.PLAZA, T.LOT]); // out in the country: the tracks and trails, the yards
const CIV_TARGET_DAY = 30, CIV_TARGET_NIGHT = 20;
// How busy a place is (the World v3 plan: busy downtown pavements, a quiet suburb - density set per place): the
// district's style, [by day, by night]; round a train station at the rush hours, half as many again
const CROWD = { towers: [1.5, 0.7], commercial: [1.3, 0.9], nightlife: [0.9, 1.6], redlight: [0.8, 1.4], arts: [1.2, 1], oldtown: [1.15, 0.9], apartments: [1, 0.7], civic: [1.1, 0.6], beach: [1.3, 0.6], houses: [0.6, 0.35], luxury: [0.6, 0.5], southside: [0.9, 0.9], industrial: [0.4, 0.2], factory: [0.4, 0.2], harbor: [0.5, 0.3], park: [0.8, 0.3] };
const RUSH = [[420, 570], [990, 1140]];   // (minutes: 7:00-9:30, 16:30-19:00)
function crowdAt(world, x, y, night) {
  const m = world.map, tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
  const D = m.inside && m.inside(tx, ty) ? DISTRICTS[m.dist[m.idx(tx, ty)]] : null, c = (D && CROWD[D.style]) || [1, 1];
  let k = c[night ? 1 : 0];
  const min = world.clock && world.clock.minutes;
  if (!night && RUSH.some(([a, b]) => min >= a && min < b)) {
    const st = (m._stations ||= m.pois.filter((q) => q.kind === 'station'));
    if (st.some((q) => Math.abs(q.x - x) < 900 && Math.abs(q.y - y) < 900)) k *= 1.5;
  }
  return k;
}
const COUNTRY_TARGET_DAY = 4, COUNTRY_TARGET_NIGHT = 2; // people round a player out in the open country
const NO_INPUT = { bits: 0, mx: 0, my: 0, aim: 0 };
const CRAWL_SPEED = 0.17; // dragging themselves along on the stomach: this fraction of walking pace
let rng = mulberry32(99);

export function spawnNpc(world, archetype, x, y, role = 'civ') {
  const a = ARCHETYPES[archetype] || ARCHETYPES.casual;
  // dressed from the wardrobe (npclooks.js: a look for this kind of person in this district, its code on the wire); the
  // uniforms (police, SWAT, agents, soldiers, medics) keep the old appearance
  const dressed = npclooks.dress(world, archetype, x, y, undefined, rng);
  const bi = dressed ? dressed.bi : rollBuild(rng, archetype);
  const b = BUILDS[bi];
  const app = dressed ? dressed.app : makeAppearance(rng, archetype);
  app.bd = bi;
  const hp = Math.round(a.hp * b.hp * (0.9 + rng() * 0.2));
  const ped = world.spawnPed(x, y, { hp, app, archetype, a: rng() * Math.PI * 2 });
  ped.build = b;
  // grit: how many bullets it takes - some drop at the first shot, a few keep going after three
  // (police, guards and medics are drilled to a standard: no grit roll)
  ped.grit = 1;
  if (role !== 'cop' && role !== 'railguard' && role !== 'medic') {
    let gr = rng() * 100;
    ped.grit = NPC_GRIT[NPC_GRIT.length - 1][0];
    for (const [g, w] of NPC_GRIT) { gr -= w; if (gr <= 0) { ped.grit = g; break; } }
  }
  ped.npc = {
    role, archetype, state: 'wander', target: 0, until: 0, wx: x, wy: y, nextThink: 0,
    reflex: a.reflex, fight: Math.max(0, Math.min(1, a.fight + b.fight)), speed: a.speed * (bi === 3 ? 0.92 : bi === 0 ? 0.95 : 1), sway: !!a.sway, flagged: false, keep: false,
    lastDiveCheck: 0, diveCooldown: 0,
  };
  if (a.armed) { ped.weapon = a.armed; }
  world.npcCount++;
  return ped;
}

export function despawnNpc(world, ped) {
  world.remove(ped);
  world.bodies.delete(ped);
  world.npcCount = Math.max(0, world.npcCount - 1);
}

// Steering helper used by every NPC role.
export function seek(ped, tx, ty, run = false, speedScale = 1) {
  const dx = tx - ped.x, dy = ty - ped.y;
  const d = Math.hypot(dx, dy) || 1;
  const s = Math.min(1, d / 24) * speedScale;
  return { bits: run ? IN.SPRINT : 0, mx: (dx / d) * s, my: (dy / d) * s, aim: Math.atan2(dy, dx) };
}

// The walk-in (map.js buildInteriors: shops, banks, police stations...) a point is in, with its unit's door: x, the point
// just inside the doorway (inY) and the point just outside it (outY). Null outside every walk-in.
const DOOR_OFF = 1.6 * TILE;
export function walkInAt(m, x, y) {
  const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
  if (!m.inside(tx, ty) || !m.bld) return null;
  const b = m.buildings[m.bld[m.idx(tx, ty)]], wi = b && b.walkIn;
  if (!wi || tx < wi.x0 || tx > wi.x1 || ty < wi.y0 - 1 || ty > wi.y1 + 1) return null;   // (the floor, and the doorway)
  let u = null, bd = Infinity;
  for (const q of wi.units) { const d = tx < q.x0 ? q.x0 - tx : tx > q.x1 ? tx - q.x1 : 0; if (d < bd) { bd = d; u = q; } }
  if (!u) return null;
  const wy = (u.door.ty + 0.5) * TILE, s = wi.south ? 1 : -1;
  return { u, x: (u.door.tx + u.door.w / 2) * TILE, inY: wy - s * DOOR_OFF, outY: wy + s * DOOR_OFF };
}
// Where to head on foot for (x, y): straight there when the way is open; when walls are in the way and a walk-in's door
// is the way through (out of the one you're in, into the one they're in), the door first. There's no path finding on
// foot - this is for the police going in after someone, and walking a prisoner out to the car.
// Someone on foot pressing into something they can't get past (a parked car or bike, a corner) steps aside for a moment,
// one way and then, if that didn't do it, the other: there's no path finding on foot, so this is how they get round
// things. Called with the walk input just before pedStep; returns the input (changed while stepping aside).
const STUCK_S = 0.6, SIDE_S = 0.7;
export function sidestep(world, ped, inp, dt) {
  const n = ped.npc;
  if (!n) return inp;
  const now = world.time, moved = Math.hypot(ped.x - (n.lastX ?? ped.x), ped.y - (n.lastY ?? ped.y));
  n.lastX = ped.x; n.lastY = ped.y;
  const want = Math.hypot(inp.mx, inp.my);
  if ((n.sideUntil || 0) > now && want > 0.1) { inp.mx = n.sideX; inp.my = n.sideY; return inp; }
  n.stuckT = want > 0.3 && moved < 40 * dt ? (n.stuckT || 0) + dt : 0;
  if (n.stuckT > STUCK_S) {
    n.stuckT = 0; n.sideSign = -(n.sideSign || -1);
    const fx = inp.mx / want, fy = inp.my / want, s = n.sideSign;
    n.sideX = -fy * s * 0.95 + fx * 0.3; n.sideY = fx * s * 0.95 + fy * 0.3; n.sideUntil = now + SIDE_S;
    inp.mx = n.sideX; inp.my = n.sideY;
  }
  return inp;
}

const DOOR_ALIGN = 10;   // px off the door's middle that still goes through square (a body is wider than a ray)
export function footWay(world, e, x, y) {
  const m = world.map;
  if (m.los(e.x, e.y, x, y)) return { x, y };
  const from = walkInAt(m, e.x, e.y), to = walkInAt(m, x, y);
  // out: square up to the door on the inside, then straight out
  if (from && (!to || to.u !== from.u)) return { x: from.x, y: Math.abs(e.x - from.x) < DOOR_ALIGN ? from.outY : from.inY };
  // in: square up to the door on the outside, then straight in
  if (to && (!from || from.u !== to.u)) return { x: to.x, y: Math.abs(e.x - to.x) < DOOR_ALIGN && Math.abs(e.y - to.outY) < DOOR_OFF ? to.inY : to.outY };
  return { x, y };
}

function walkMods(world, ped, factor) {
  const m = players.pedMods(world, ped);
  m.speedMul *= ped.npc.speed * factor;
  return m;
}

export function update(world, dt) {
  const now = world.time;
  if (world.tick % 10 === 0) manageDensity(world);
  if (world.tick % 20 === 5) snatchEvent(world);
  const rain = world.weather === WEATHER.RAIN;
  for (const ped of world.entities.values()) {
    if (ped.kind !== K.PED || !ped.npc || ped.dead || ped.vehId || ped.onTrain || ped.npc.boardTrain || ped.npc.stairs || ped.ug) continue; // train riders, boarders, subway stairs: trains.js; down the sewers: underground.js
    const n = ped.npc;
    if (n.sar) continue;   // (someone out in the wild waiting for a rescue pilot, a charter's customer: sar.js, charter.js look after them)
    if (n.burn && ped.burnT > 0) { if (now >= ped.downUntil && now >= ped.stunUntil) pedStep(ped, burning.npcStep(world, ped, now), dt, world.map, walkMods(world, ped, 1)); continue; }   // (on fire: running for it - burning.js)
    if (n.guard && !n.pursue && n.state !== 'fight' && n.state !== 'flee') { // Syndicate guard on the Rock: hold the post, keep watch (a prison guard after an escapee: police.js pursue)
      const dd = Math.hypot(ped.x - n.guard.x, ped.y - n.guard.y);
      if (dd > 10) {   // (guard.run: a biker running for his bike - bikers.js; a bouncer back to his door steps round what's in the way)
        const inp = seek(ped, n.guard.x, n.guard.y, !!n.guard.run);
        pedStep(ped, n.guard.fixed ? sidestep(world, ped, inp, dt) : inp, dt, world.map, walkMods(world, ped, n.guard.run ? 1 : 0.6));
      }
      else if (n.guard.fixed) { ped.vx = 0; ped.vy = 0; ped.a = n.guard.a + Math.sin(now * 0.5 + ped.id) * 0.45; }   // (a club's bouncer, someone in its line: facing their way, a glance either side - nightclubs.js)
      else { ped.vx = 0; ped.vy = 0; if (now >= (n.lookAt || 0)) { n.guard.a += (rng() - 0.5) * 2.4; n.lookAt = now + 1.5 + rng() * 2; } ped.a = n.guard.a; }
      continue;
    }
    if (n.desk) { // shop / desk staff stay behind their counter (one walking to it from outside - a club's dancer from the line - goes in by the door)
      const dd = Math.hypot(ped.x - n.desk.x, ped.y - n.desk.y);
      if (dd > 6) { const wp = footWay(world, ped, n.desk.x, n.desk.y); pedStep(ped, seek(ped, wp.x, wp.y, false), dt, world.map, walkMods(world, ped, 0.5)); }
      else {
        ped.vx = 0; ped.vy = 0;
        const mate = n.dancer && n.partner ? world.get(n.partner) : null;   // (a couple face each other; a dance move faces the floor's middle - nightclubs.js)
        ped.a = mate ? Math.atan2(mate.y - ped.y, mate.x - ped.x) : n.dancer ? n.desk.a + (ped.dm !== undefined && ped.dm !== null ? Math.sin(now * 0.5 + ped.id) * 0.3 : Math.sin(now * 3 + ped.id) * 1.3) : n.desk.a + Math.sin(now * 0.4 + ped.id) * 0.25;
      }
      continue;
    }
    if (n.role === 'driver') { n.role = 'civ'; n.state = 'wander'; } // a driver left on foot (car gone) walks off
    if (n.role === 'cop' && !n.war && !n.shootout && !n.stop && !n.pursue) {
      const u = n.unit ? world.get(n.unit) : null;
      if (!u || u.removed) { n.unit = 0; n.beat = true; } // lost their unit: walk the beat instead of freezing
    }
    // other systems drive these (a word with someone: stops.js; after a crook: police.js; someone held down or cuffed:
    // struggle.js, custody.js)
    if ((n.role === 'cop' && (!n.beat || n.stop || n.pursue || holding(world, ped))) || n.role === 'medic' || n.driven) continue;   // (n.driven: another system moves them - tennis.js's pro)
    if (now < ped.downUntil || now < ped.stunUntil) continue;
    if (n.state === 'passed') { ped.vx = 0; ped.vy = 0; continue; }
    // critically hurt: no more fighting - limp away from the trouble, bleeding; the worst hurt may crawl
    if (n.state !== 'limp' && n.state !== 'crawl' && n.state !== 'burn' && n.role !== 'cop' && ped.hp < ped.maxHp * NPC_CRITICAL) startLimp(world, ped, n.fx ?? ped.x + 1, n.fy ?? ped.y);
    if (n.state === 'limp' && ped.hp < ped.maxHp * CRAWL_HP && !n.crawlRolled) { n.crawlRolled = true; if (rng() < 0.6) startCrawl(world, ped, n.fx ?? ped.x + 1, n.fy ?? ped.y); }
    // ended up in the water (thrown from a car, knocked off a dock): swim for the nearest shore
    if (isSwimming(world.map, ped)) {
      if (!n.shore || now > (n.shoreAt || 0)) {
        // no headway in the last couple of seconds (a sea wall, a moored boat): try another bit of shore
        if (n.shore && n.swimFrom && Math.hypot(ped.x - n.swimFrom.x, ped.y - n.swimFrom.y) < 12) (n.badShore ||= new Set()).add(world.map.idx(Math.floor(n.shore.x / 32), Math.floor(n.shore.y / 32)));
        n.swimFrom = { x: ped.x, y: ped.y };
        n.shore = nearestLand(world.map, ped.x, ped.y, 24, n.badShore);
        n.shoreAt = now + 2;
      }
      if (n.shore) { pedStep(ped, seek(ped, n.shore.x, n.shore.y, true), dt, world.map, walkMods(world, ped, 1)); continue; }
    }
    if ((n.role === 'civ' || n.role === 'mugger') && n.state !== 'crawl') checkDive(world, ped, now);
    let inp = NO_INPUT, factor = 0.55;
    const pin = n.persona && (n.state === 'wander' || n.state === 'idle') ? personas.steer(world, ped, now) : n.act && (n.state === 'wander' || n.state === 'idle') ? activities.steer(world, ped, now) : null;   // (personas.js; at an activity: activities.js)
    if (pin) { inp = pin.inp; factor = pin.factor; } else switch (n.state) {
      case 'wander': inp = wander(world, ped, now); factor = rain && !ped.umbrella ? 0.85 : 0.55; break;
      case 'idle': inp = idle(world, ped, now); break;
      case 'flee': {
        if (n.railFlee && n.railSafe) { // getting off the line: to the spot picked beside it, then wait there
          if (Math.hypot(n.railSafe.x - ped.x, n.railSafe.y - ped.y) > 6) inp = seek(ped, n.railSafe.x, n.railSafe.y, true);
          factor = 1;
          if (now > n.until && !trains.railThreat(world, ped.x, ped.y)) { n.state = 'wander'; n.railFlee = false; n.railSafe = null; }
          break;
        }
        const fx = n.fx ?? ped.x, fy = n.fy ?? ped.y;
        const away = Math.atan2(ped.y - fy, ped.x - fx) + (n.fleeBias || 0);
        const tx = ped.x + Math.cos(away) * 80, ty = ped.y + Math.sin(away) * 80;
        if (PED_BLOCK[world.map.tileAtPx(tx, ty)]) n.fleeBias = (n.fleeBias || 0) + 0.6;
        inp = seek(ped, tx, ty, true);
        factor = 1;
        if (now > n.until) { n.state = 'wander'; n.fleeBias = 0; n.railFlee = false; }
        break;
      }
      case 'fight': inp = fight(world, ped, now); factor = 1; break;
      case 'watch': inp = watch(world, ped, now); break;
      case 'audience': inp = personas.audience(world, ped, now); factor = 0.45; break;   // (in a busker's crowd: personas.js)
      case 'limp': inp = limp(world, ped, now); factor = LIMP_SPEED; break;
      case 'crawl': inp = crawl(world, ped, now); factor = CRAWL_SPEED; break;
      case 'mug': inp = mugRun(world, ped, now); factor = 1; break;
      case 'waitHelp': {
        if (now > n.until) { n.state = 'wander'; n.keep = false; n.robbed = false; }
        inp = NO_INPUT;
        break;
      }
      case 'film': inp = film(world, ped, now); break;
      case 'holdup': inp = holdup(world, ped, now); factor = 1; break;
      case 'leave': inp = leaveStep(world, ped, now); break;
      default: n.state = 'wander';
    }
    if (n.holdup && n.state !== 'holdup') { ped.handsUp = false; n.holdup = null; n.keep = false; }   // (scared off some other way: the hands come down)
    if (ped.filming && n.state !== 'film') stopFilming(ped);   // (they ran, fought, got hurt: the phone goes away)
    // commuters heading for a platform to wait for the train
    if (n.waitTrain !== undefined && (n.state === 'wander' || n.state === 'idle')) {
      const d = Math.hypot(n.waitX - ped.x, n.waitY - ped.y);
      if (now > n.waitGiveUp) { n.waitTrain = undefined; n.keep = false; }
      else if (d > 8) { inp = seek(ped, n.waitX, n.waitY, false); n.state = 'wander'; n.until = now + 60; }
      else { inp = NO_INPUT; ped.vx = 0; ped.vy = 0; if (now >= (n.lookAt || 0)) { ped.a += (rng() - 0.5) * 1.4; n.lookAt = now + 1.5 + rng() * 2; } }
    }
    // don't step onto the line in front of a train (or into one standing at a platform)
    if ((inp.mx || inp.my) && !n.railFlee && world.map.rail && now >= (n.railBlindUntil || 0)) {
      const m = Math.hypot(inp.mx, inp.my) || 1;
      if (trains.railThreat(world, ped.x + inp.mx / m * 26, ped.y + inp.my / m * 26, 4.5, true) && !trains.railThreat(world, ped.x, ped.y, 4.5, true)) inp = NO_INPUT;
    }
    if (n.sway && (inp.mx || inp.my)) { const s = Math.sin(now * 3 + ped.id) * 0.6; const mx = inp.mx, my = inp.my; inp = { ...inp, mx: mx - my * s, my: my + mx * s }; }
    // staggered by a hit: a moment's check - slowed right down, no swing or shot (then on they come, or on they run)
    if (now < (ped.staggerUntil || 0)) inp = { ...inp, bits: inp.bits & ~IN.FIRE & ~IN.SPRINT, mx: inp.mx * 0.25, my: inp.my * 0.25 };
    pedStep(ped, inp, dt, world.map, walkMods(world, ped, factor));
    if (inp.bits & IN.FIRE) combat.tryAttack(world, ped, inp.aim);
    ped.umbrella = rain && n.umbrellaType && n.state === 'wander';
  }
}

// Limping off: away from whoever hurt them, then slowly on along the pavement, in a halting gait
// (the pace surges and drags with every step). They don't recover - the bleeding only stops at a
// hospital - so they stay this way until the ambulance or the morgue van gets them.
function startLimp(world, ped, fx, fy) {
  const n = ped.npc;
  n.state = 'limp'; n.fx = fx; n.fy = fy; n.until = world.time + 8 + rng() * 6; n.target = 0;
  ped.bleeding = true;
}
function limp(world, ped, now) {
  const n = ped.npc;
  let inp;
  if (now < n.until) {
    const away = Math.atan2(ped.y - n.fy, ped.x - n.fx) + (n.fleeBias || 0);
    const tx = ped.x + Math.cos(away) * 80, ty = ped.y + Math.sin(away) * 80;
    if (PED_BLOCK[world.map.tileAtPx(tx, ty)]) n.fleeBias = (n.fleeBias || 0) + 0.6;
    inp = seek(ped, tx, ty, false);
  } else {
    if (Math.hypot(n.wx - ped.x, n.wy - ped.y) < 10 || now > (n.limpPick || 0)) { pickWaypoint(world, ped); n.limpPick = now + 12; }
    inp = seek(ped, n.wx, n.wy, false);
  }
  const gait = 0.45 + 0.55 * Math.abs(Math.sin(now * 4.2 + ped.id)); // step, drag, step, drag
  inp.mx *= gait; inp.my *= gait;
  return inp;
}

// Too badly hurt to stand: dragging themselves away on their stomach from whoever hurt them, slowly, for as
// long as they can - then they lie still where they got to.
function startCrawl(world, ped, fx, fy) {
  const n = ped.npc;
  n.state = 'crawl'; n.fx = fx; n.fy = fy; n.until = world.time + 12 + rng() * 12; n.target = 0; n.fleeBias = 0;
  ped.bleeding = true;
}
function crawl(world, ped, now) {
  const n = ped.npc;
  if (now > n.until) { n.state = 'passed'; ped.passedOut = true; ped.vx = 0; ped.vy = 0; return NO_INPUT; }
  const away = Math.atan2(ped.y - n.fy, ped.x - n.fx) + (n.fleeBias || 0);
  const tx = ped.x + Math.cos(away) * 60, ty = ped.y + Math.sin(away) * 60;
  if (PED_BLOCK[world.map.tileAtPx(tx, ty)]) n.fleeBias = (n.fleeBias || 0) + 0.5;
  const inp = seek(ped, tx, ty, false), pull = 0.35 + 0.65 * Math.abs(Math.sin(now * 3.2 + ped.id)); // reach, drag, reach, drag
  inp.mx *= pull; inp.my *= pull;
  return inp;
}

function wander(world, ped, now) {
  const n = ped.npc;
  const d = Math.hypot(n.wx - ped.x, n.wy - ped.y);
  if (d < 10 || now > n.until) {
    if (rng() < 0.2 && !onRoad(world, ped) && (skating(ped) || !skateAt(world.map, ped.x, ped.y))) { n.state = 'idle'; n.until = now + 2 + rng() * 5; n.lookAt = now; return NO_INPUT; }
    pickWaypoint(world, ped);
    n.until = now + 8;
    if (Math.hypot(n.wx - ped.x, n.wy - ped.y) < 10) { n.state = 'idle'; n.until = now + 1 + rng() * 2; n.lookAt = now; return NO_INPUT; }
  }
  return seek(ped, n.wx, n.wy, now < (n.hurryUntil || 0));   // (out of a siren's way: at a run - clearWay)
}

const onRoad = (world, ped) => { const t = world.map.tileAtPx(ped.x, ped.y); return t === T.ROAD || t === T.BRIDGE; };

// Honked at by a car they're holding up (traffic.js): someone on foot going about their business in the road gets out
// of it - to the nearest pavement off to the side of the car's way (a passer-by stuck walking into the side of a lorry
// in a jam, the car behind waiting for them for ever: a headless run in Midtown had a dozen cars locked that way round
// one corner for minutes). Only someone at a loose end - not in a fight, running, at work, filming a scene...
const SHOO_STATES = new Set(['wander', 'idle', 'watch', 'audience', 'waitHelp']);
export function shoo(world, ped, v, hurry = false) {
  const n = ped.npc;
  if (!n || ped.dead || ped.vehId || n.desk || n.guard || n.keep || n.driven || n.role !== 'civ' || !SHOO_STATES.has(n.state)) return false;
  const c = Math.cos(v.a), s = Math.sin(v.a), side = (-(ped.x - v.x) * s + (ped.y - v.y) * c) >= 0 ? 1 : -1;
  for (let r = 1; r <= 6; r++) for (const sd of [side, -side]) for (const along of [0, -1, 1]) {
    const x = ped.x + (-s * sd * r + c * along) * TILE, y = ped.y + (c * sd * r + s * along) * TILE, t = world.map.tileAtPx(x, y);
    if (!WALK_TILES.has(t) || t === T.FLOOR || PED_BLOCK[t]) continue;
    n.state = 'wander'; n.wx = x; n.wy = y; n.until = world.time + 6; n.target = 0;
    if (hurry) n.hurryUntil = world.time + 4;
    return true;
  }
  return false;
}

// A siren coming (the owner, 10-23: "There should be a siren for the ambulance that makes people get out of the way
// faster so it's easier to drive") - or a player's horn: whoever's in the road ahead of it gets out of the way, as when
// honked at (shoo). The horn: someone just in front, at a walk. The siren: everyone in the road a long way ahead and
// either side of its way - the faster it comes the further ahead - and at a run. vehicles.js calls it a few times a
// second for a vehicle running its siren, and for a player's car while they hold the horn.
const CLEAR = { horn: { reach: 170, side: 30 }, siren: { reach: 380, perSpeed: 0.6, side: 80 } };
export function clearWay(world, v, siren) {
  const C = siren ? CLEAR.siren : CLEAR.horn, c = Math.cos(v.a), s = Math.sin(v.a);
  const fwd = Math.max(0, v.vx * c + v.vy * s), reach = C.reach + (siren ? fwd * C.perSpeed : 0), side = v.def.W / 2 + C.side, nose = v.def.L / 2;
  for (const q of world.query(v.x + c * (nose + reach / 2), v.y + s * (nose + reach / 2), reach / 2 + side, K.PED)) {
    const n = q.npc;
    if (!n || q.dead || q.vehId || Math.abs((q.lz || 0) - (v.lz || 0)) > 0.5 || !onRoad(world, q)) continue;
    const lx = (q.x - v.x) * c + (q.y - v.y) * s, ly = -(q.x - v.x) * s + (q.y - v.y) * c;
    if (lx < nose - 20 || lx > nose + reach || Math.abs(ly) > side) continue;
    if (n.clearFor === v.id && n.state === 'wander' && world.time < n.until) continue;   // (on their way already)
    if (shoo(world, q, v, siren)) n.clearFor = v.id;
  }
}

// Standing around: glance one way, then another, then wander off somewhere new (never just
// frozen in place, and never loitering in the middle of the road).
function idle(world, ped, now) {
  const n = ped.npc;
  if (onRoad(world, ped)) { n.state = 'wander'; n.until = 0; return NO_INPUT; }
  if (now >= (n.lookAt || 0)) {
    ped.a += (rng() < 0.5 ? -1 : 1) * (0.6 + rng() * 1.6);
    n.lookAt = now + 0.8 + rng() * 1.6;
  }
  if (now > n.until) {
    n.state = 'wander';
    n.until = 0;
    n.awayFrom = ped.a + Math.PI; // head off somewhere other than where they were looking last
  }
  return NO_INPUT;
}

function pickWaypoint(world, ped) {
  const n = ped.npc;
  // pedestrians far from every player meander back toward them (keeps visible streets lively)
  let towards = null;
  if (n.role === 'civ' && !n.country && rng() < 0.6) {
    let bd = Infinity;
    for (const p of world.players.values()) {
      if (!p.ped || p.ped.dead) continue;
      const d = Math.hypot(p.ped.x - ped.x, p.ped.y - ped.y);
      if (d < bd) { bd = d; towards = p.ped; }
    }
    if (bd < 520) towards = null;
  }
  // standing in the street: head for the nearest pavement first
  if (onRoad(world, ped)) {
    for (let r = 32; r <= 160; r += 32) for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2, x = ped.x + Math.cos(a) * r, y = ped.y + Math.sin(a) * r;
      if (WALK_TILES.has(world.map.tileAtPx(x, y))) { n.wx = x; n.wy = y; return; }
    }
  }
  // on a skate park's ground and not a skater: off it by the nearest way (skateOff)
  const sk = skating(ped) ? null : skateAt(world.map, ped.x, ped.y);
  if (sk) { const o = skateOff(world.map, sk, ped.x, ped.y); if (o) { n.wx = o.x; n.wy = o.y; return; } }
  const away = n.awayFrom; n.awayFrom = undefined;
  // country folk keep round their campground / farm / filling station
  if (n.patch && Math.hypot(n.patch.x - ped.x, n.patch.y - ped.y) > 420) towards = n.patch;
  const pref = n.country ? COUNTRY_PREFERRED : PREFERRED;
  const offSk = !skating(ped);
  for (let k = 0; k < 14; k++) {
    const ang = towards && k < 6 ? Math.atan2(towards.y - ped.y, towards.x - ped.x) + (rng() - 0.5) * 1.6
      : away !== undefined && k < 6 ? away + (rng() - 0.5) * 2 : rng() * Math.PI * 2;
    const dist = 64 + rng() * 180;
    const x = ped.x + Math.cos(ang) * dist, y = ped.y + Math.sin(ang) * dist;
    const t = world.map.tileAtPx(x, y);
    if (!WALK_TILES.has(t)) continue;
    if (t === T.FLOOR && nightclubs.shutAt(world, x, y)) continue;   // (not into a club that's shut or shutting: nightclubs.js)
    if (!pref.has(t) && rng() < 0.6) continue;
    if (!crossesRoadOk(world, ped.x, ped.y, x, y)) continue;
    if (offSk && skateCrossed(world.map, ped.x, ped.y, x, y)) continue;   // (round a skate park, not across it)
    if (world.map.rayTiles(ped.x, ped.y, x, y) < 1) continue;
    if (world.map.rail && trains.railBlocked(world, ped.x, ped.y, x, y)) continue; // not into (or across the line in front of) a train
    n.wx = x; n.wy = y;
    return;
  }
  n.wx = ped.x; n.wy = ped.y;
}

// The skate parks' ground (map.skateSpots: the lot in tiles) is the skaters' and the friends hanging out there - the
// activities.js 'skaters' spot, a skater persona on a board: passers-by keep off it and go round (the owner, 10-23:
// "Skatepark has a bunch of NPCs walking around it, they shouldn't be walking around the skatepark unless they're
// skateboarding or hanging out"). A wanderer's next waypoint is never in it nor across it; one who finds themselves on
// it (spawned there before, scared onto it) heads off it the nearest way; nobody's spawned on it.
const SKATE_PAD = 12;
const skating = (ped) => ped.gt === 'skate' || ped.gt === 'blades' || !!ped.board;
export function skateAt(map, x, y) {
  const L = map.skateSpots;
  if (!L) return null;
  for (const q of L) if (x > q.x * TILE - SKATE_PAD && x < (q.x + q.w) * TILE + SKATE_PAD && y > q.y * TILE - SKATE_PAD && y < (q.y + q.h) * TILE + SKATE_PAD) return q;
  return null;
}
export function skateCrossed(map, x0, y0, x1, y1) {
  if (!map.skateSpots) return false;
  const n = Math.max(2, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 24));
  for (let i = 1; i <= n; i++) if (skateAt(map, x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n)) return true;
  return false;
}
// the nearest walkable point just outside the lot's edge (a tile out), straight out from where they are
export function skateOff(map, q, x, y) {
  const X0 = q.x * TILE, Y0 = q.y * TILE, X1 = (q.x + q.w) * TILE, Y1 = (q.y + q.h) * TILE, out = TILE + SKATE_PAD;
  const ways = [[x - X0, X0 - out, y], [X1 - x, X1 + out, y], [y - Y0, x, Y0 - out], [Y1 - y, x, Y1 + out]].sort((a, b) => a[0] - b[0]);
  for (const [, ex, ey] of ways) for (const s of [0, 1, -1, 2, -2]) {
    const vert = ex === x, px = vert ? ex + s * TILE : ex, py = vert ? ey : ey + s * TILE, t = map.tileAtPx(px, py);
    if (WALK_TILES.has(t) && t !== T.FLOOR && !PED_BLOCK[t] && !skateAt(map, px, py)) return { x: px, y: py };
  }
  return null;
}

function crossesRoadOk(world, x1, y1, x2, y2) {
  for (let i = 1; i <= 6; i++) {
    const t = world.map.tileAtPx(x1 + (x2 - x1) * i / 6, y1 + (y2 - y1) * i / 6);
    if (t === T.ROAD || t === T.BRIDGE) return rng() < 0.12; // jaywalk occasionally
    if (PED_BLOCK[t]) return false;
  }
  return true;
}

// GDD: speeding vehicles project a threat box; NPC reflex attribute decides the dive roll.
function checkDive(world, ped, now) {
  const n = ped.npc;
  if (ped.rollT > 0 || now < n.diveCooldown || (world.tick + ped.id) % 2) return;
  for (const v of world.query(ped.x, ped.y, 260, K.VEH)) {
    const sp = Math.hypot(v.vx, v.vy);
    if (sp < 170 || (v.alt || 0) > FLY.HIGH) continue;   // (an aircraft going over: nothing to dive from)
    const c = Math.cos(v.a), s = Math.sin(v.a);
    const sign = (v.vx * c + v.vy * s) >= 0 ? 1 : -1;
    const dx = ped.x - v.x, dy = ped.y - v.y;
    const lx = (dx * c + dy * s) * sign, ly = -dx * s + dy * c;
    if (lx < v.def.L / 2 - 4 || lx > v.def.L / 2 + sp * 0.75) continue;
    if (Math.abs(ly) > v.def.W / 2 + 22) continue;
    n.diveCooldown = now + 2.5;
    if (rng() < n.reflex) {
      const side = ly >= 0 ? 1 : -1;
      const ax = -s * side, ay = c * side;
      ped.prevBits = 0;
      pedStep(ped, { bits: IN.DIVE, mx: ax, my: ay, aim: ped.a }, 0.0001, world.map, walkMods(world, ped, 1));
      world.emit(ped.x, ped.y, { e: 'yelp', x: ped.x, y: ped.y });
    }
    return;
  }
}

function fight(world, ped, now) {
  const n = ped.npc;
  const t = world.get(n.target);
  if (!t || t.dead || now > n.until || Math.hypot(t.x - ped.x, t.y - ped.y) > 650) { n.state = 'wander'; n.target = 0; return NO_INPUT; }
  if (heldByPolice(t)) { backOff(world, ped, t); return NO_INPUT; }   // (the police have them: task #428)
  const d = Math.hypot(t.x - ped.x, t.y - ped.y);
  const aim = Math.atan2(t.y - ped.y, t.x - ped.x);
  if (t.vehId) {
    const v = world.get(t.vehId);
    // GDD: angry drivers pull the player back out of the seat and beat them up
    if (v && d < v.def.L / 2 + 20 && Math.hypot(v.vx, v.vy) < 40 && !((v.alt || 0) > FLY.HIGH) && n.role !== 'gang' && !n.exCop && now - (n.draggedAt || -99) > 6) {
      n.draggedAt = now;
      vehicles.ejectPed(world, t, true);
      t.downUntil = now + 0.8;
      if (t.player) world.notify(t.player, 'You got dragged out of the car!', 'bad');
      return NO_INPUT;
    }
  }
  const armed = ped.weapon !== 'fists' && ped.weapon !== 'bat';
  if (armed) {
    const inp = d > 170 ? seek(ped, t.x, t.y, true) : { bits: 0, mx: 0, my: 0, aim };
    if (d < 380 && world.map.los(ped.x, ped.y, t.x, t.y)) { inp.bits |= now < (n.holdFireUntil || 0) ? IN.AIMING : IN.FIRE | IN.AIMING; inp.aim = aim; }   // (holdFireUntil: sizing it up first, the weapon up - streetlife.js's guards)
    return inp;
  }
  const inp = seek(ped, t.x, t.y, true);
  if (d < 26 + t.r) { inp.bits |= IN.FIRE | IN.AIMING; inp.aim = aim; inp.mx *= 0.2; inp.my *= 0.2; }
  return inp;
}

// An officer on someone, going for the cuffs (struggle.js), or holding someone cuffed (custody.js): those move them. (An
// officer walking a beat who makes an arrest - a word gone wrong, a chase: stops.js, police.js pursue - isn't left to
// wander off from their prisoner.)
export function holding(world, c) {
  const t = c.pinning ? world.get(c.pinning) : null;
  if (t && t.player && t.player.struggle && t.player.struggle.by.includes(c.id)) return true;
  for (const p of world.players.values()) if (p.custody && p.custody.holder === c.id) return true;
  return false;
}

// ---- event hooks -----------------------------------------------------------
// Started a fight (task #395): a criminal until `until` - hitting them is no crime, killing them still is (law.js
// brawling), and the police take them in (police.js)
export function markBrawl(world, ped, until) { if (ped && ped.npc) ped.npc.brawl = Math.max(ped.npc.brawl || 0, until); }

export function onAttacked(world, ped, attacker) {
  if (!ped.npc || ped.dead || !attacker || attacker === ped) return;
  const n = ped.npc;
  // (an armored truck's guards caught by each other's fire: they keep after whoever they're fighting, not each other)
  if (n.armored && attacker.npc && attacker.npc.armored === n.armored) return;
  // a passer-by who lays into someone who never hit them started it (a street fight's are marked by happenings.js)
  const a = attacker.npc;
  if (a && a.role === 'civ' && !a.happening && !a.exCop && !a.desk && n.role !== 'cop' && !(world.time - (attacker.aggressors.get(ped.id) ?? -99) < 60)) markBrawl(world, attacker, world.time + BRAWL_AFTER_S);
  if (n.state === 'crawl') { n.fx = attacker.x; n.fy = attacker.y; return; } // still dragging themselves away - from you, now
  if (n.club) { bikers.clubAttacked(world, ped, attacker); return; }   // (a biker club member: the whole club fights back - bikers.js, task #366)
  if (n.bouncer !== undefined && n.bouncer !== null && n.state !== 'limp') { nightclubs.bouncerHurt(world, ped, attacker); return; }   // (a nightclub's bouncer: they all come for you - nightclubs.js, task #432)
  if (n.desk) { // staff behind a counter: a desk cop fights back, everyone else runs
    n.desk = null; n.keep = false;
    if (n.role === 'cop') { ped.weapon = 'pistol'; startFight(world, ped, attacker, 30); } else flee(world, ped, attacker.x, attacker.y, 10);
    return;
  }
  if (n.role === 'cop' && attacker.npc && attacker.npc.role === 'gang') { gangwar.copAttackedByGang(world, ped, attacker); return; }
  if (n.role === 'railguard') { n.target = attacker.id; n.hostile = attacker.id; return; } // shoot at the mail guards and they shoot back (after a moment to draw - trains.js)
  if (n.role === 'cop' || n.role === 'medic') return;
  if (ped.hp < ped.maxHp * NPC_CRITICAL && n.role !== 'gang') { startLimp(world, ped, attacker.x, attacker.y); return; } // too hurt to fight back
  if (n.state === 'passed') { ped.passedOut = false; n.state = 'flee'; n.fx = attacker.x; n.fy = attacker.y; n.until = world.time + 6; return; }
  if (n.role === 'mugger') { onMuggerDowned(world, ped); flee(world, ped, attacker.x, attacker.y, 8); return; }
  if (n.role === 'gang') { startFight(world, ped, attacker, 30); gangAlert(world, attacker); return; }
  if (n.state === 'fight' && n.target === attacker.id) return;
  if (rng() < n.fight) startFight(world, ped, attacker, 14);
  else flee(world, ped, attacker.x, attacker.y, 6);
}

export function onCarjacked(world, driver, jacker) {
  if (!driver.npc) return;
  driver.npc.role = 'civ';
  // GDD: random temperament check — 50% flee screaming, 50% fight back
  if (rng() < 0.5) { flee(world, driver, jacker.x, jacker.y, 7); world.emit(driver.x, driver.y, { e: 'scream', x: driver.x, y: driver.y }); }
  else startFight(world, driver, jacker, 16);
}

export function onVehicleHit(world, v, attacker) {
  if (!v.ai) return;
  v.ai.panicUntil = world.time + 10; // drive frantic and panicked
  // someone damaging the car with a weapon (combat.js: law.vehicleDamaged has made it a crime): its driver, by temperament,
  // stops and gets out to fight them - or drives off in a panic (and, the victim, most likely calls it in: law.witnesses)
  const drv = v.seats[0] ? world.get(v.seats[0]) : null, n = drv && drv.npc;
  if (!n || drv.dead || !attacker || attacker === drv || attacker.kind !== K.PED || attacker.vehId === v.id) return;
  if (n.role === 'cop' || n.role === 'medic' || n.role === 'railguard' || world.time - (n.vandalAt ?? -99) < 8) return;
  n.vandalAt = world.time;
  if (Math.hypot(v.vx, v.vy) < VEH_CRIME.stopPx && rng() < (n.fight || 0) * VEH_CRIME.fight) {
    v.ai = null; v.despawnable = true; v.input = { throttle: 0, steer: 0, hb: true };   // (left in the road: cleared like any abandoned car)
    vehicles.ejectPed(world, drv, false);
    n.role = 'civ';
    startFight(world, drv, attacker, 16);
  }
}

export function onGunfire(world, x, y, shooter, radius = 360) {
  if (radius >= 360) { world.shotLog.push({ x, y, t: world.time }); if (world.shotLog.length > 64) world.shotLog.splice(0, world.shotLog.length - 64); }
  for (const e of world.query(x, y, radius, K.PED)) {
    if (!e.npc || e.dead || e === shooter) continue;
    const n = e.npc;
    if (n.role === 'gang') {
      if (gangwar.isCopPed(shooter) && n.state !== 'fight') { gangwar.provoke(world, shooter, e.x, e.y, 'shots fired near them'); continue; }
      if (isTurf(world.map, e.x, e.y) && shooter && shooter.player && !aligned(shooter.player)) startFight(world, e, shooter, 25);
      continue;
    }
    if (n.role !== 'civ' || n.state === 'fight' || n.state === 'passed') continue;
    if (n.tough && Math.hypot(e.x - x, e.y - y) > 90) { e.a = Math.atan2(y - e.y, x - e.x); continue; }   // tough guys don't back off
    // (far enough off, now and then someone films it instead of running)
    if (radius >= 360 && n.state !== 'flee' && Math.hypot(e.x - x, e.y - y) > radius * 0.7 && rng() < filmChance(e) * 0.4 && startFilming(world, e, x, y, 6 + rng() * 6, true)) continue;
    flee(world, e, x, y, 5 + rng() * 3);
  }
  if (radius >= 360) spectacle(world, x, y, { r: radius + 260, near: radius, chance: 0.6, secs: 9 });
}

// ---- Phones out (2026-10-08, the user: "NPCs will sometimes take pictures or record video with their phones, like if
// something crazy goes down they might pull out their phone and record it instead of running away") ----------------
// Something wild nearby - a crash, a blast, a body in the street, a car off the highway, gunfire further off: some of the
// people round about stop where they are, turn to it and hold their phones up (the descriptor's ph: 2, drawn held up in
// both hands: client art2 people.js 'phoneup'), filming, or taking photos (a flash now and then: the 'pflash' event).
// Who: by temperament (FILM_CHANCE), not too close (those run), and not the same person again for a while. They stop
// when it's over, or run like anyone else if trouble comes their way (a shot near them, a hit: the state changes and the
// phone goes away).
const FILM_CHANCE = { casual: 0.45, socialite: 0.55, athlete: 0.3, hustler: 0.4, executive: 0.22, construction: 0.32, sweeper: 0.2, senior: 0.1, drunk: 0.35 };
export const filmChance = (ped) => FILM_CHANCE[ped.npc.archetype] ?? 0.25;
// a blast or the like: the people close by run (further out, some film it: spectacle)
export function panic(world, x, y, radius) {
  for (const e of world.query(x, y, radius, K.PED)) {
    const n = e.npc;
    if (!n || e.dead || e.vehId || n.desk || n.guard || n.role !== 'civ' || n.state === 'fight' || n.state === 'passed' || n.state === 'crawl') continue;
    flee(world, e, x, y, 5 + rng() * 3);
  }
}
export function spectacle(world, x, y, { r = 480, near = 120, chance = 1, secs = 9 } = {}) {
  const now = world.time;
  for (const e of world.query(x, y, r, K.PED)) {
    const n = e.npc;
    if (!n || e.dead || e.vehId || e.hidden || e.onTrain || n.desk || n.guard || n.driven || n.role !== 'civ') continue;   // (n.driven: a club pro mid-game - tennis.js)
    if (n.state !== 'wander' && n.state !== 'idle') continue;
    if (now - (n.filmedAt ?? -1e9) < 45 || Math.hypot(e.x - x, e.y - y) < near) continue;
    if (rng() < filmChance(e) * chance) startFilming(world, e, x, y, secs * (0.7 + rng() * 0.6), true);
  }
}
// (check: only from somewhere personas.js filmFrom allows - open ground, in sight of it - else nothing, false)
export function startFilming(world, ped, x, y, secs, check = false) {
  if (check && !personas.filmFrom(world.map, ped.x, ped.y, x, y)) return false;
  const n = ped.npc;
  n.state = 'film'; n.fx = x; n.fy = y; n.until = world.time + secs; n.filmedAt = world.time;
  n.photo = rng() < 0.35; n.nextFlash = world.time + 0.5 + rng() * 0.8;
  ped.vx = 0; ped.vy = 0;
  if (!ped.filming) { ped.phoneOut = world.time; ped.filming = 2; ped.appVer = (ped.appVer || 0) + 1; }
  return true;
}
function stopFilming(ped) {
  if (!ped.filming) return;
  ped.filming = 0; ped.phoneOut = 0; ped.appVer = (ped.appVer || 0) + 1;
}
function film(world, ped, now) {
  const n = ped.npc;
  ped.a = Math.atan2(n.fy - ped.y, n.fx - ped.x);
  if (n.photo && now >= n.nextFlash) { n.nextFlash = now + 1.1 + rng() * 1.9; world.emit(ped.x, ped.y, { e: 'pflash', x: Math.round(ped.x), y: Math.round(ped.y), a: +ped.a.toFixed(2) }); }
  if (now > n.until) { n.state = 'wander'; stopFilming(ped); }
  return NO_INPUT;
}

export function onDeath(world, ped, attacker) {
  const n = ped.npc;
  if (!n) return;
  const a = ARCHETYPES[n.archetype] || ARCHETYPES.casual;
  // not everyone carries cash: well-off types usually do, seniors and drunks often don't
  const carries = { executive: 0.9, socialite: 0.85, hustler: 0.8, syndicate: 0.75, casual: 0.55, construction: 0.5, athlete: 0.35, sweeper: 0.4, senior: 0.45, drunk: 0.3, mugger: 0.7 }[n.archetype] ?? 0.5;
  const cash = a.cash && !n.poor && rng() < carries ? Math.max(1, Math.round(a.cash[0] + rng() * (a.cash[1] - a.cash[0]))) : 0;
  let item = a.item && !n.poor && rng() < a.item[1] ? a.item[0] : null;
  if (n.hasPurse) { item = 'purse'; n.hasPurse = false; }
  cargo.npcDrop(world, ped, cash, item);
  stopFilming(ped);
  n.state = 'dead';
  void attacker;
}

export function startFight(world, ped, target, secs) {
  if (target.npc && target.npc.role === ped.npc.role && ped.npc.role === 'gang') return;
  if (heldByPolice(target)) return;   // (the police have them: no fight starts - task #428)
  ped.npc.state = 'fight'; ped.npc.target = target.id; ped.npc.until = world.time + secs;
}
// Someone the police have hold of (the owner's note, task #428): an officer on them going for the cuffs (struggle.js), or
// cuffed and being taken in (custody.js). Whoever was fighting them lets it go, and nobody starts on them - a car can
// still run them over, and the like; it's the people coming at them that stop.
export const heldByPolice = (e) => !!e && (!!e.cuffed || !!(e.player && (e.player.struggle || e.player.custody)));
// ...so whoever was fighting them stands back and watches a few seconds, then goes on their way (the police breaking up
// a street fight too: police.js)
export function backOff(world, ped, t) {
  const n = ped.npc;
  n.state = 'watch'; n.target = t.id; n.fx = t.x; n.fy = t.y; n.until = world.time + 3 + rng() * 4;
}
function watch(world, ped, now) {
  const n = ped.npc, t = n.target ? world.get(n.target) : null;
  if (t && !t.dead && !t.removed) { n.fx = t.x; n.fy = t.y; }
  ped.a = Math.atan2(n.fy - ped.y, n.fx - ped.x);
  if (now > n.until) { n.state = 'wander'; n.target = 0; n.until = 0; n.awayFrom = ped.a + Math.PI; }
  return NO_INPUT;
}
export function flee(world, ped, fx, fy, secs) {
  const n = ped.npc;
  n.state = 'flee'; n.fx = fx; n.fy = fy; n.until = world.time + secs;
}

// Caught in a hold-up (robbery.js customers): hands up, not moving, facing the robber - then, after a few seconds and
// once the robber isn't pointing their way (or isn't there any more), they slip out of the door and run
function holdup(world, ped, now) {
  const n = ped.npc, h = n.holdup;
  if (!h) { n.state = 'wander'; return NO_INPUT; }
  const by = world.get(h.by);
  if (!h.go) {
    const da = by ? Math.atan2(ped.y - by.y, ped.x - by.x) - (by.aimAngle ?? by.a) : 0;
    const watched = !!by && !by.dead && now < (by.aimUntil || 0) && Math.abs(Math.atan2(Math.sin(da), Math.cos(da))) < 0.6;
    if (now - h.at < h.wait || (watched && now - h.at < h.wait + 12)) {
      ped.handsUp = true; ped.vx = 0; ped.vy = 0;
      if (by) ped.a = Math.atan2(by.y - ped.y, by.x - ped.x);
      return NO_INPUT;
    }
    h.go = true; ped.handsUp = false;
  }
  const wi = walkInAt(world.map, ped.x, ped.y);
  if (wi && now - h.at < h.wait + 40) { const wp = footWay(world, ped, wi.x, wi.outY + (wi.outY - wi.inY)); return seek(ped, wp.x, wp.y, true); }
  // out of the door (or stuck in there long enough): away from the shop, running
  n.holdup = null; ped.handsUp = false; n.keep = false;
  flee(world, ped, by ? by.x : ped.x, by ? by.y : ped.y - 1, 8 + rng() * 4);
  return NO_INPUT;
}

// Going home (a club at the end of the night, a dancer who's had enough, the line breaking up: nightclubs.js): out of the
// door of the building they're in (footWay), on a little way along the pavement away from it, and off like anyone else
// (wander, no longer kept). Whatever they were doing there stops: the desk or post, the dance.
export function leaveBuilding(world, ped, from = null, secs = 40) {
  const n = ped.npc;
  n.desk = null; n.guard = null; n.dancer = false; n.target = 0;
  n.state = 'leave'; n.until = world.time + secs; n.out = null;
  if (from) { n.fx = from.x; n.fy = from.y; } else { n.fx = undefined; n.fy = undefined; }
  if (ped.gt) { ped.gt = null; ped.dm = undefined; ped.cv = null; ped.appVer = (ped.appVer || 0) + 1; }
}
const LEAVE_WALK = [110, 230];   // px on from the door
const LEAVE_TURN = [0.3, -0.4, 0.9, -1.0, 1.45, -1.5, 1.9, -2.0];   // (which way: about straight on first, then along the street)
function leaveStep(world, ped, now) {
  const n = ped.npc, m = world.map;
  const wi = walkInAt(m, ped.x, ped.y);
  if (wi) {   // still inside: out through the door
    if (now > n.until + 20) { n.state = 'wander'; n.keep = false; return NO_INPUT; }   // (stuck in there: give up - the clean-up takes them)
    const wp = footWay(world, ped, wi.x, wi.outY + (wi.outY - wi.inY));
    n.fx = wi.x; n.fy = wi.inY; n.out = null;
    return seek(ped, wp.x, wp.y, false);
  }
  if (!n.out) {   // outside: somewhere a little way on, away from where they came out - straight on, else off to one side
    const away = n.fx !== undefined ? Math.atan2(ped.y - n.fy, ped.x - n.fx) : rng() * Math.PI * 2, side = rng() < 0.5 ? 1 : -1;
    const d0 = LEAVE_WALK[0] + rng() * (LEAVE_WALK[1] - LEAVE_WALK[0]);
    for (const d of [d0, LEAVE_WALK[0], 70]) for (const off of LEAVE_TURN) {
      if (n.out) break;
      const a = away + off * side, x = ped.x + Math.cos(a) * d, y = ped.y + Math.sin(a) * d, t = m.tileAtPx(x, y);
      if (WALK_TILES.has(t) && t !== T.FLOOR && m.los(ped.x, ped.y, x, y)) n.out = { x, y };
    }
    if (!n.out) n.out = { x: ped.x, y: ped.y };
  }
  if (now > n.until || Math.hypot(n.out.x - ped.x, n.out.y - ped.y) < 12) {
    n.state = 'wander'; n.keep = false; n.until = 0; n.out = null;
    if (n.fx !== undefined) n.awayFrom = Math.atan2(ped.y - n.fy, ped.x - n.fx);
    return NO_INPUT;
  }
  return seek(ped, n.out.x, n.out.y, false);
}

function aligned(p) { return p.profile.gang === 'syndicate' || (p.profile.criminalExp >= 200 && !p.badge); }

// Syndicate territory defense force (GDD §4B, §7)
export function gangAlert(world, perp) {
  if (!perp) return;
  for (const e of world.query(perp.x, perp.y, 650, K.PED)) {
    if (e.npc && e.npc.role === 'gang' && !e.dead) startFight(world, e, perp, 30);
  }
  if (perp.player) { perp.player.gangHostileUntil = world.time + 120; world.notify(perp.player, 'The Syndicate marked you as an enemy in their turf!', 'bad'); }
}

// ---- density management ------------------------------------------------------
function manageDensity(world) {
  const night = world.clock.isNight;
  let nc = 0;
  for (const e of world.entities.values()) if (e.kind === K.PED && e.npc && !e.dead) nc++;
  world.npcCount = nc;
  const anchors = [];
  for (const p of world.players.values()) if (p.ped && !p.ped.dead) anchors.push(p.ped);
  // despawn far NPCs
  for (const e of world.entities.values()) {
    if (e.kind !== K.PED || !e.npc || e.vehId) continue;
    if (e.npc.keep || (e.npc.role === 'cop' && !e.npc.beat) || e.npc.role === 'medic' || e.npc.role === 'driver') continue;
    let near = false;
    for (const a of anchors) if ((a.x - e.x) ** 2 + (a.y - e.y) ** 2 < 1500 * 1500) { near = true; break; }
    if (!near && !(e.dead && world.bodies.has(e)) && !inAnyView(world, e.x, e.y, 32)) despawnNpc(world, e);
  }
  if (world.npcCount >= world.npcBudget * 0.6) return;
  for (const a of anchors) {
    // out in the open country it's quiet: a few people, where they belong (spawnCountry)
    const country = !!wildlife.wildStyle(world.map, a.x, a.y) || openGround(world.map, a.x, a.y);
    const target = country ? (night ? COUNTRY_TARGET_NIGHT : COUNTRY_TARGET_DAY) : Math.round((night ? CIV_TARGET_NIGHT : CIV_TARGET_DAY) * crowdAt(world, a.x, a.y, night));
    let count = 0;
    for (const e of world.query(a.x, a.y, 1200, K.PED)) if (e.npc && !e.dead) count++;
    if (count >= target) continue;
    for (let tries = 0; tries < 12; tries++) {
      const ang = rng() * Math.PI * 2, d = 450 + rng() * 800;
      const x = a.x + Math.cos(ang) * d, y = a.y + Math.sin(ang) * d;
      const t = world.map.tileAtPx(x, y), style = wildlife.wildStyle(world.map, x, y);
      if (!WALK_TILES.has(t) || (t === T.DIRT && !style) || skateAt(world.map, x, y)) continue;   // (not on a skate park: npc.js skateAt)
      let tooClose = false;
      for (const b of anchors) if ((b.x - x) ** 2 + (b.y - y) ** 2 < 400 * 400) { tooClose = true; break; }
      if (tooClose || inAnyView(world, x, y, 64)) continue; // just off screen: they walk into view
      if (style && !isTurf(world.map, x, y)) { if (spawnCountry(world, x, y, style, night)) break; continue; }
      if (!peopleBelongAt(world.map, x, y)) {   // (the town's people where the town is - not on a river's grassy bank with nothing round it)
        const os = OPEN_STYLES[(world.map.districtAt(x, y) || {}).style];   // (the open coast and the rocks: as quiet as the country)
        if (os && countryFolk(world, x, y) < (night ? COUNTRY_TARGET_NIGHT : COUNTRY_TARGET_DAY) && spawnCountry(world, x, y, os, night)) break;
        continue;
      }
      spawnByDemographic(world, x, y, night);
      break;
    }
  }
}

// The town's people where the town is (the owner, 10-16: "NPCs spawning where there's no development (by a river,
// nothing around)"): on a pavement, a plaza, a lot or a dock, in a park, or on the grass, the sand or the dirt only with
// something built close by - a street, a path, a building - within DEV_R px. World v3's coast and rocks are town
// districts (beach, rocky) that run on for miles past the last street, with open banks and greens in the towns too:
// out there it's as quiet as the country (OPEN_STYLES: spawnCountry - a beachcomber, a hiker, folk round a site).
const DEV_R = 8 * TILE, DEV_T = new Set([T.SIDEWALK, T.PLAZA, T.LOT, T.ROAD, T.BUILDING, T.DOCK, T.FLOOR, T.BRIDGE]);
const OPEN_STYLES = { beach: 'beach', rocky: 'wild', water: 'beach' };
const openGround = (map, x, y) => !!OPEN_STYLES[(map.districtAt(x, y) || {}).style] && !peopleBelongAt(map, x, y);
const countryFolk = (world, x, y) => world.query(x, y, 1200, K.PED).filter((e) => e.npc && e.npc.country && !e.dead).length;
export function peopleBelongAt(map, x, y) {
  const t = map.tileAtPx(x, y);
  if (DEV_T.has(t)) return true;
  const d = map.districtAt(x, y);
  if (d && d.style === 'park') return true;
  for (let dy = -DEV_R; dy <= DEV_R; dy += TILE) for (let dx = -DEV_R; dx <= DEV_R; dx += TILE) if (DEV_T.has(map.tileAtPx(x + dx, y + dy))) return true;
  return false;
}

// Out in the open country, people where they belong: campers at the campgrounds, farmers round the
// farms, workers at the quarry, the oil field, the wind and solar farms, locals at the filling
// stations and the farmhouses - and only now and then a hiker on the hills, a farmer out in the
// fields or a nomad in the desert. Nobody just standing about in the middle of nowhere. Returns the
// new ped, or null when nobody's out here.
const COUNTRY_FOLK = {
  camp: [['camper', 6], ['hiker', 4]], stop: [['casual', 5], ['hiker', 3], ['camper', 2]], work: [['construction', 1]],
  venue: [['casual', 1]], farm: [['farmer', 1]], home: [['farmer', 5], ['casual', 4], ['senior', 1]], shop: [['casual', 6], ['farmer', 3], ['hiker', 1]],
  air: [['casual', 3], ['construction', 2]],
};
const LONER = { wild: 'hiker', rural: 'farmer', desert: 'nomad', beach: 'casual' };
function spawnCountry(world, x, y, style, night) {
  const place = wildlife.placeNear(world.map, x, y, 520);
  let arche;
  if (place) {
    if (rng() > (night ? 0.3 : 0.6)) return null;
    const list = COUNTRY_FOLK[place.kind] || COUNTRY_FOLK.stop;
    let r = rng() * list.reduce((t, [, w]) => t + w, 0);
    arche = list[0][0];
    for (const [k, w] of list) { r -= w; if (r <= 0) { arche = k; break; } }
  } else {
    if (rng() > (night ? 0.02 : 0.08)) return null;
    if (world.query(x, y, 1500, K.PED).some((e) => e.npc && e.npc.country && !e.npc.patch && !e.dead && !e.vehId)) return null; // one loner about at most
    arche = LONER[style] || 'hiker';
  }
  const ped = spawnNpc(world, arche, x, y, 'civ');
  ped.npc.country = true;
  if (place) ped.npc.patch = { x: place.x, y: place.y }; // keeps round its place
  return ped;
}

function spawnByDemographic(world, x, y, night) {
  if (isTurf(world.map, x, y) && rng() < (night ? 0.75 : 0.45)) {
    const g = spawnNpc(world, 'syndicate', x, y, 'gang');
    return g;
  }
  // now and then someone with a character of their own (personas.js)
  if (rng() < (night ? personas.PERSONA_SHARE.night : personas.PERSONA_SHARE.day)) { const p = personas.spawnHere(world, spawnNpc, x, y, night); if (p) return p; }
  const entries = Object.entries(ARCHETYPES).filter(([, a]) => (night ? a.night : a.day) > 0);
  let total = 0;
  // GDD: night shifts spawning toward shady criminal profiles (+300%)
  const weight = (k, a) => (night && (k === 'hustler' || k === 'drunk') ? (a.night * 3) : (night ? a.night : a.day));
  for (const [k, a] of entries) total += weight(k, a);
  let r = rng() * total;
  for (const [k, a] of entries) {
    r -= weight(k, a);
    if (r <= 0) {
      const ped = spawnNpc(world, k, x, y, 'civ');
      if (k === 'drunk' && rng() < 0.5) { ped.npc.state = 'passed'; ped.downUntil = 0; ped.passedOut = true; }
      ped.npc.umbrellaType = k !== 'gang' && k !== 'drunk' && k !== 'athlete' && k !== 'construction' && rng() < 0.75;
      return ped;
    }
  }
  return null;
}

// ---- Snatch-and-grab (GDD §12) ---------------------------------------------------
export function snatchEvent(world, force = null) {
  world.nextSnatch ??= world.time + 40;
  if (world.time < world.nextSnatch && !force) return;
  world.nextSnatch = world.time + 70 + rng() * 60;
  const online = [...world.players.values()].filter((p) => p.conn && p.ped && !p.ped.dead);
  if (!online.length) return;
  const p = force || online[Math.floor(rng() * online.length)];
  if (force && !online.includes(force)) return;
  // (the calm streets, rules.js CALM_STREETS: fewer away from the rough parts of town, none while enough's going on)
  if (!force && (events.calmBusy(world, p.ped.x, p.ped.y) || (!events.roughAt(world.map, p.ped.x, p.ped.y) && rng() >= CALM_STREETS.snatchShare))) return;
  let victims = world.query(p.ped.x, p.ped.y, 650, K.PED).filter((e) => e.npc && e.npc.role === 'civ' && !e.dead && (e.npc.archetype === 'socialite' || e.npc.archetype === 'executive') && e.npc.state === 'wander');
  if (!victims.length && force) { const sp = spawnNpc(world, 'socialite', p.ped.x + 160, p.ped.y, 'civ'); victims = [sp]; }
  if (!victims.length) return;
  const victim = victims[Math.floor(rng() * victims.length)];
  // the mugger comes from somewhere walkable a little way off (try a few directions)
  const ang0 = rng() * Math.PI * 2;
  let sx = 0, sy = 0, ok = false;
  for (let k = 0; k < 12 && !ok; k++) {
    const ang = ang0 + k * 0.52, d = k % 2 ? 200 : 260;
    sx = victim.x + Math.cos(ang) * d; sy = victim.y + Math.sin(ang) * d;
    ok = !PED_BLOCK[world.map.tileAtPx(sx, sy)];
  }
  if (!ok) return;
  const m = spawnNpc(world, 'mugger', sx, sy, 'mugger');
  m.npc.state = 'mug'; m.npc.target = victim.id; m.npc.until = world.time + 40; m.npc.keep = true;
  victim.npc.keep = true;
}

function mugRun(world, ped, now) {
  const n = ped.npc;
  if (!n.hasPurse) {
    const v = world.get(n.target);
    if (!v || v.dead) { n.state = 'flee'; n.until = now + 10; return NO_INPUT; }
    if (Math.hypot(v.x - ped.x, v.y - ped.y) < 22) {
      n.hasPurse = true; n.flagged = true; n.until = now + 45;
      ped.flareUntil = now + 3;
      v.npc.state = 'waitHelp'; v.npc.until = now + 150; v.npc.robbed = true; v.npc.keep = true; v.npc.robbedBy = ped.id;
      v.a = Math.atan2(ped.y - v.y, ped.x - v.x);
      world.emit(v.x, v.y, { e: 'scream', x: v.x, y: v.y });
      law.logDispatch(world, 'mugging', v.x, v.y, null, 1, 'witness');
      for (const p of world.players.values()) if (p.ped && Math.hypot(p.ped.x - v.x, p.ped.y - v.y) < 900) world.notify(p, 'Snatch-and-grab! A mugger grabbed a purse - stop them (no penalty).', 'warn');
      events.add(world, { kind: 'snatch', x: ped.x, y: ped.y, thief: ped.id, victim: v.id, until: now + 150 });
      n.fx = v.x; n.fy = v.y;
      // somebody calls it in: most of the time a squad car comes for the mugger (police.js npcCalls) - unless it's a
      // player officer's patrol call (theirs to stop)
      if (!n.patrolFor && rng() < 0.75) (world.npcCalls ||= []).push({ id: ped.id, at: now + 5 + rng() * 6 });
      return NO_INPUT;
    }
    return seek(ped, v.x, v.y, true);
  }
  if (now > n.until) { n.keep = false; n.state = 'wander'; return NO_INPUT; }
  const away = Math.atan2(ped.y - n.fy, ped.x - n.fx) + Math.sin(now + ped.id) * 0.5;
  let tx = ped.x + Math.cos(away) * 90, ty = ped.y + Math.sin(away) * 90;
  if (PED_BLOCK[world.map.tileAtPx(tx, ty)]) { n.fx = ped.x + Math.cos(away + 1.5) * 50; n.fy = ped.y + Math.sin(away + 1.5) * 50; tx = ped.x - Math.cos(away) * 50; ty = ped.y - Math.sin(away) * 50; }
  return seek(ped, tx, ty, true);
}

// Mugger knocked down -> drops the purse as loot
export function onMuggerDowned(world, ped) {
  if (ped.npc && ped.npc.hasPurse) {
    ped.npc.hasPurse = false;
    cargo.npcDrop(world, ped, 0, 'purse');
  }
}

export function nearestRobbedVictim(world, ped) {
  for (const e of world.query(ped.x, ped.y, 48, K.PED)) if (e.npc && e.npc.robbed && !e.dead) return e;
  return null;
}

