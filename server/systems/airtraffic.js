// Aircraft about the world (H66): now and then a light plane takes off from the airport's runway or an airstrip and flies
// off, or comes in from far out, lines up with it, glides down and lands, rolls out and stops (and, once nobody's looking,
// is gone); a news helicopter (the Skylark, news blue and white) comes to circle a big incident - a chase at three stars
// or more - for a while, then flies off. All here, on the server: the flying is shared/flight.js's (flightStep, as a
// player's), the pilots' sticks are set here (v.fin, v.autopilot: aircraft.js steps them). Only where someone's about to
// see it (a player within NEAR px), never popping up on anyone's screen, and their ways out and in kept clear of what
// stands taller than they fly.
import { K, TILE } from '../../shared/constants.js';
import { airfields, FLY, tileTop } from '../../shared/flight.js';
import { AIR_TRAFFIC } from '../../shared/rules.js';
import { spawnNpc, despawnNpc } from './npc.js';
import { inAnyView } from '../view.js';
import { steer } from './policeair.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const wrap = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };

// the runways and airstrips (not the taxiways): their middle, the way along them and their length
export function runways(map) {
  if (map._runways) return map._runways;
  return (map._runways = airfields(map).strips.filter((s) => !s.taxi).map((s) => {
    const along = s.h >= s.w, len = along ? s.h : s.w;
    return { name: s.name, x: s.x + s.w / 2, y: s.y + s.h / 2, ux: along ? 0 : 1, uy: along ? -1 : 0, len, strip: !!s.approx };
  }));
}

// is the way along a line from (x, y) clear of what stands taller than h0 + k * distance? (a climb out, a glide in)
function clearWay(map, x, y, ux, uy, dist, h0, k) {
  for (let d = 0; d <= dist; d += TILE * 2) {
    const tx = Math.floor((x + ux * d) / TILE), ty = Math.floor((y + uy * d) / TILE);
    for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) if (tileTop(map, tx + i, ty + j) > h0 + k * d - 30) return false;
  }
  return true;
}

export function update(world, dt) {
  const A = (world.airTraffic ||= { flights: new Map(), nextAt: world.time + AIR_TRAFFIC.firstS, newsAt: 0 });
  if (world.tick % 20 === 5) {
    if (world.time >= A.nextAt) { A.nextAt = world.time + AIR_TRAFFIC.everyS * (0.7 + world.rand() * 0.6); planeFlight(world, A); }
    newsFlight(world, A);
  }
  for (const f of [...A.flights.values()]) run(world, A, f, dt);
}

// someone near enough to see it: the player nearest the point within NEAR px
function someoneNear(world, x, y, r) {
  for (const p of world.players.values()) if (p.ped && !p.ped.dead && Math.hypot(p.ped.x - x, p.ped.y - y) < r) return p;
  return null;
}

// a pilot in the seat (a citizen: a light plane's owner, the news crew)
function crew(world, v, n, who) {
  for (let i = 0; i < n; i++) { const c = spawnNpc(world, who, v.x, v.y, 'civ'); c.npc.unit = v.id; c.npc.air = true; c.npc.keep = true; c.vehId = v.id; c.seat = i; v.seats[i] = c.id; }
}

// A light plane's flight at a runway near someone: in (from far out on its line, gliding down) or out (the take-off roll
// and away), whichever way is clear
export function planeFlight(world, A, opts = {}) {
  for (const f of A.flights.values()) if (f.kind === 'plane') return null;   // (one at a time)
  const rws = runways(world.map).filter((r) => opts.rw ? r === opts.rw : someoneNear(world, r.x, r.y, AIR_TRAFFIC.nearPx));
  if (!rws.length) return null;
  const r = rws[Math.floor(world.rand() * rws.length)];
  const landing = opts.mode ? opts.mode === 'land' : world.rand() < 0.5;
  for (const s of opts.dir ? [opts.dir] : world.rand() < 0.5 ? [1, -1] : [-1, 1]) {   // (opts.dir: which way along it, 1 or -1 - the dev menu's)
    const ux = r.ux * s, uy = r.uy * s, half = r.len / 2;
    // the end it starts its roll from / touches down at: a quarter in from the end it comes from
    const tx = r.x - ux * half * 0.75, ty = r.y - uy * half * 0.75;
    if (landing) {
      const out = AIR_TRAFFIC.approachPx, sx = tx - ux * out, sy = ty - uy * out, alt = out * AIR_TRAFFIC.glide;
      if (!clearWay(world.map, sx, sy, ux, uy, out, 0, -AIR_TRAFFIC.glide) && !opts.force) continue;
      if (!clearWay(world.map, tx - ux * out, ty - uy * out, ux, uy, out, alt, -AIR_TRAFFIC.glide)) { if (!opts.force) continue; }
      if (inAnyView(world, sx, sy, 300) && !opts.force) continue;
      const v = world.spawnVehicle('plane', sx, sy, Math.atan2(uy, ux), {});
      v.alt = alt; v.spool = 1; v.vx = ux * AIR_TRAFFIC.approachV; v.vy = uy * AIR_TRAFFIC.approachV;
      return start(world, A, v, { kind: 'plane', mode: 'approach', r, ux, uy, tx, ty });
    }
    if (!clearWay(world.map, tx, ty, ux, uy, 2600, 0, 0.12) && !opts.force) continue;
    if (world.query(tx, ty, 160, K.VEH).length && !opts.force) continue;
    if (inAnyView(world, tx, ty, 200) && !opts.force && !opts.seen) continue;   // (rolled out onto the runway where nobody's looking)
    const v = world.spawnVehicle('plane', tx, ty, Math.atan2(uy, ux), {});
    v.alt = 0; v.spool = 0.6;
    return start(world, A, v, { kind: 'plane', mode: 'roll', r, ux, uy, tx, ty });
  }
  return null;
}
function start(world, A, v, f) {
  v.despawnable = false; v.autopilot = true; v.npcFlight = true;
  crew(world, v, 1, 'casual');
  f.vid = v.id; f.since = world.time;
  A.flights.set(v.id, f);
  return v;
}

// The news helicopter: up over a chase at three stars or more (someone being hunted where people can see it), circling
// it a while (newsS), then off out of sight
function newsFlight(world, A) {
  if (world.time < A.newsAt) return;
  for (const f of A.flights.values()) if (f.kind === 'news') return;
  for (const p of world.players.values()) {
    if (!p.ped || p.ped.dead || (p.wanted | 0) < AIR_TRAFFIC.newsStars || world.time - (p.seenAt || -99) > 3) continue;
    return news(world, A, p);
  }
}
export function news(world, A, p) {
  // in from out of sight, a way off, already up
  const a = world.rand() * Math.PI * 2, d = 1600;
  let x = p.ped.x + Math.cos(a) * d, y = p.ped.y + Math.sin(a) * d;
  for (let k = 0; k < 6 && inAnyView(world, x, y, 300); k++) { x = p.ped.x + Math.cos(a + k) * d * 1.3; y = p.ped.y + Math.sin(a + k) * d * 1.3; }
  const v = world.spawnVehicle('heli', x, y, Math.atan2(p.ped.y - y, p.ped.x - x), {});
  v.alt = AIR_TRAFFIC.newsAlt + 200; v.spool = 1;
  A.newsAt = world.time + AIR_TRAFFIC.newsEveryS;
  return start(world, A, v, { kind: 'news', mode: 'circle', pid: p.pid, th: a, x: p.ped.x, y: p.ped.y });
}

// anyone (on foot, or another vehicle) on the runway's line from where it touches down to where it would stop
function blocked(world, f, v) {
  for (let d = -100; d <= 700; d += 200) {
    const x = f.tx + f.ux * d, y = f.ty + f.uy * d;
    for (const e of world.query(x, y, 150)) {
      if (e === v || e.removed || (e.kind === K.PED && (e.dead || e.vehId)) || (e.kind !== K.PED && e.kind !== K.VEH)) continue;
      if (e.kind === K.VEH && (e.alt || 0) > FLY.HIGH) continue;
      return true;
    }
  }
  return false;
}
function done(world, A, f, v) {
  A.flights.delete(f.vid);
  if (!v) return;
  for (let i = 0; i < v.seats.length; i++) { const c = world.get(v.seats[i]); v.seats[i] = 0; if (c && !c.player) despawnNpc(world, c); }
  world.remove(v);
}

function run(world, A, f, dt) {
  const v = world.get(f.vid), now = world.time;
  if (!v || v.removed || v.wreckAt || v.dead) { A.flights.delete(f.vid); return; }   // (shot down, crashed: what's left is the wreck's)
  const pilot = world.get(v.seats[0]);
  if (!pilot || pilot.dead || pilot.player) { A.flights.delete(f.vid); v.autopilot = false; v.npcFlight = false; return; }   // (nobody flying it - or a player took it: theirs now)
  const fi = v.fin || (v.fin = { tank: false, fwd: 0, turn: 0, climb: 0, hb: false, m: 0, dx: 0, dy: 0 });
  if (f.kind === 'news') {
    const p = world.players.get(f.pid), t = p && p.ped && !p.ped.dead ? p.ped : null;
    if (t && (p.wanted | 0) > 0 && f.mode === 'circle') { f.x = t.x; f.y = t.y; }
    if (f.mode === 'circle' && (now - f.since > AIR_TRAFFIC.newsS || !t || (p.wanted | 0) < 1)) { f.mode = 'leave'; f.lx = v.x + (v.x - f.x) * 6; f.ly = v.y + (v.y - f.y) * 6; }
    if (f.mode === 'circle') { f.th += dt * 0.22; steer(world, v, f.x + Math.cos(f.th) * AIR_TRAFFIC.newsR, f.y + Math.sin(f.th) * AIR_TRAFFIC.newsR, v.def.max * 0.7, f.x, f.y, AIR_TRAFFIC.newsAlt); }
    else { steer(world, v, f.lx, f.ly, v.def.max * 0.9, f.lx, f.ly, AIR_TRAFFIC.newsAlt + 100); if (now - f.since > AIR_TRAFFIC.newsS + 12 && !inAnyView(world, v.x, v.y, 300)) done(world, A, f, v); }
    if (now - f.since > AIR_TRAFFIC.newsS + 120 && !inAnyView(world, v.x, v.y, 300)) done(world, A, f, v);
    return;
  }
  // a light plane
  const c = Math.cos(v.a), s = Math.sin(v.a), fwd = v.vx * c + v.vy * s;
  fi.tank = false; fi.m = 1; fi.dx = 0; fi.dy = 0; fi.hb = false;
  // the way it should point: back onto the runway's line, aiming at a point ahead along it
  const along = (v.x - f.tx) * f.ux + (v.y - f.ty) * f.uy, side = -(v.x - f.tx) * f.uy + (v.y - f.ty) * f.ux;
  const ahead = Math.max(along + 500, 200), aimX = f.tx + f.ux * ahead, aimY = f.ty + f.uy * ahead;
  const want = Math.atan2(aimY - v.y, aimX - v.x);
  void side;
  if (f.mode === 'roll') {   // the take-off roll: full power, the nose wheel on the line; at its rotate speed, up
    fi.fwd = 1; fi.turn = clamp(wrap(want - v.a) * 2, -1, 1); fi.climb = fwd >= v.def.vr ? 1 : 0;
    if ((v.alt || 0) > 40) f.mode = 'climb';
  } else if (f.mode === 'climb') {   // climbing out along the line, then away; gone once out of everyone's sight a long way off
    fi.fwd = 1; fi.turn = clamp(wrap(want - v.a) * 2, -1, 1); fi.climb = (v.alt || 0) < AIR_TRAFFIC.cruise ? 0.8 : 0;
    if (along > 3200 && !inAnyView(world, v.x, v.y, 300)) done(world, A, f, v);
  } else if (f.mode === 'approach') {   // on the glide down the runway's line: the height by the distance to go, the speed held
    const togo = -along, wantAlt = clamp(togo * AIR_TRAFFIC.glide, 0, 400);
    fi.turn = clamp(wrap(want - v.a) * 2, -1, 1);
    fi.fwd = fwd < AIR_TRAFFIC.approachV - 30 ? 0.5 : fwd > AIR_TRAFFIC.approachV + 40 ? -0.3 : 0;
    fi.climb = clamp((wantAlt - (v.alt || 0)) / 60, -0.5, 0.4);
    if ((v.alt || 0) <= 0.5 && togo < 400) f.mode = 'rollout';
    if (togo < -1200) f.mode = 'climb';   // (overshot: go round - off it flies)
    // someone - a person, a car - on the runway where it touches down and rolls out: it goes round (full power, climbing away)
    if (togo < 1100 && togo > -200 && (v.alt || 0) > 4 && blocked(world, f, v)) { f.mode = 'climb'; f.round = true; }
  } else if (f.mode === 'rollout') {   // down: braking to a stop on the runway; once nobody's looking it's gone (taxied off)
    fi.fwd = fwd > 20 ? -1 : 0; fi.turn = clamp(wrap(want - v.a) * 2, -1, 1); fi.climb = 0;   // (no brake held once stopped: that backs it up)
    if (fwd < 3) { f.mode = 'stopped'; f.stopAt = now; }
  } else if (f.mode === 'stopped') {
    fi.fwd = 0; fi.turn = 0; fi.climb = 0;
    if (now - f.stopAt > 8 && !inAnyView(world, v.x, v.y, 200)) done(world, A, f, v);
  }
  if (now - f.since > 300 && !inAnyView(world, v.x, v.y, 300)) done(world, A, f, v);   // (a flight that's gone on too long)
}
