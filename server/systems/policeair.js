// The police air unit (H66; the owner: "helicopters and planes ... to come together soon"): at a high wanted level a
// police helicopter takes off from headquarters' helipad, flies to the suspect and follows them overhead - circling, its
// nose on them, high enough to clear the roofs round it - with its searchlight on them at night. While its crew can see
// the suspect it radios their position to the cars on the ground (the law's "seen": law.js / police.js chase it straight
// to them, the search circle never grows). It can be shot at and brought down (combat.js; it's a vehicle with its hp - a
// shot at it in the air hits it where art v2 draws it, too). It goes home and lands when the suspect is lost (unseen
// for a while, or the stars gone, or they're cuffed), and the crew climb out and stand it back on its pad.
// All of it here, on the server: the flight is shared/flight.js's (flightStep - the same as a player's), the pilot's
// stick is set here (v.fin, v.autopilot: aircraft.js steps it).
import { K, TILE } from '../../shared/constants.js';
import { airfields, FLY, tileTop, findPadSpot } from '../../shared/flight.js';
import { POLICE_AIR } from '../../shared/rules.js';
import { spawnNpc, despawnNpc } from './npc.js';
import { inAnyView } from '../view.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const wrap = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };

// headquarters' helipad (airfields: the police HQ's yard), cached on the map
export function hqPad(map) {
  if (map._hqPad !== undefined) return map._hqPad;
  const af = airfields(map);
  return (map._hqPad = af.pads.find((p) => p.kind === 'police' && !p.roof) || null);
}

// the units out: world.policeAir, the suspect's pid -> { vid, pid, mode, since, seenAt, th, padX, padY }
export function update(world, dt) {
  const U = (world.policeAir ||= new Map());
  if (world.tick % 20 === 11) launches(world);
  for (const u of [...U.values()]) run(world, u, dt);
}

function launches(world) {
  const U = world.policeAir;
  for (const p of world.players.values()) {
    if (U.has(p.pid) || !p.ped || p.ped.dead || p.custody || (p.wanted | 0) < POLICE_AIR.stars) continue;
    if (world.time < (p.airNextAt || 0)) continue;
    // (lost already, out in the wilds or after a long while unseen: the helicopter isn't sent to an empty search)
    if (world.time - (p.seenAt || -99) > POLICE_AIR.lostS) continue;
    launch(world, p);
  }
}

// Up from headquarters: the helicopter parked on its pad when it's there and nobody's in it, else one brought out onto
// the pad (or, the pad taken, already in the air over it)
export function launch(world, p) {
  const pad = hqPad(world.map);
  if (!pad) return null;
  let v = null;
  const sp = (world.airSpots || []).find((s) => s.police);
  const parked = sp ? world.get(sp.id) : null;
  if (parked && !parked.wreckAt && !parked.removed && !parked.seats.some((id) => id) && Math.hypot(parked.x - pad.x, parked.y - pad.y) < 300) v = parked;
  if (!v) {
    const spot = findPadSpot(world.map, pad.x, pad.y, 60, 400);
    const busy = !spot || world.query(spot.x, spot.y, 110, K.VEH).length > 0;
    v = world.spawnVehicle('policeheli', busy ? pad.x : spot.x, busy ? pad.y : spot.y, -Math.PI / 2, {});
    if (busy) { v.alt = POLICE_AIR.alt; v.spool = 1; }
  }
  v.parked = false; v.despawnable = false; v.autopilot = true; v.lights = true;
  for (let i = 0; i < 2; i++) {
    const cop = spawnNpc(world, 'cop', v.x, v.y, 'cop');
    cop.npc.unit = v.id; cop.npc.air = true;
    cop.vehId = v.id; cop.seat = i; v.seats[i] = cop.id;
    cop.weapon = i ? 'rifle' : 'pistol';
  }
  const u = { vid: v.id, pid: p.pid, mode: 'up', since: world.time, seenAt: world.time, th: Math.atan2(v.y - p.ped.y, v.x - p.ped.x), padX: pad.x, padY: pad.y, told: 0 };
  world.policeAir.set(p.pid, u);
  world.notify(p, 'A police helicopter is up from headquarters - it will follow you from the air.', 'bad');
  return v;
}

// what stands tallest round a point (a 3x3 of tiles): the roofs a helicopter there has to clear
function topAround(map, x, y) {
  const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
  let h = 0;
  for (let j = -2; j <= 2; j += 2) for (let i = -2; i <= 2; i += 2) h = Math.max(h, tileTop(map, tx + i, ty + j));
  return h;
}

// the stick (flightInput's shape: { tank, fwd, turn, climb, hb, m, dx, dy }) to fly toward (tx, ty) at up to `speed`,
// the nose toward (ax, ay), at the height it needs (clear of what's ahead) - climbing first, crawling, where it's low
export function steer(world, v, tx, ty, speed, ax, ay, want) {
  const def = v.def, alt = v.alt || 0;
  const dx = tx - v.x, dy = ty - v.y, d = Math.hypot(dx, dy);
  let vx = d > 1 ? dx / d * Math.min(speed, d * 1.4) : 0, vy = d > 1 ? dy / d * Math.min(speed, d * 1.4) : 0;
  // the roofs ahead (where it is, and along the way it's going): the height it needs
  // (looking further ahead the faster it goes: it takes a second or two to slow down; along the way it's going now and
  // the way it wants to go)
  const sp = Math.hypot(vx, vy), ux = sp > 1 ? vx / sp : 0, uy = sp > 1 ? vy / sp : 0;
  const cs = Math.hypot(v.vx, v.vy), cx = cs > 1 ? v.vx / cs : 0, cy = cs > 1 ? v.vy / cs : 0, look = Math.max(320, cs * 2);
  let need = topAround(world.map, v.x, v.y);
  for (let k = 1; k <= 5; k++) { const r = look * k / 5; need = Math.max(need, topAround(world.map, v.x + ux * r, v.y + uy * r), topAround(world.map, v.x + cx * r, v.y + cy * r)); }
  need += POLICE_AIR.clear;
  const target = want === null ? 0 : Math.max(want, need);
  if (want !== null && alt < need - 10) { vx *= 0.15; vy *= 0.15; }   // (below the roofs ahead: up first, inching forward)
  const climb = want === null ? -1 : clamp((target - alt) / 50, -1, 1);
  const a = Math.atan2(ay - v.y, ax - v.x);
  const fi = v.fin || (v.fin = { tank: false, fwd: 0, turn: 0, climb: 0, hb: false, m: 0, dx: 0, dy: 0 });
  fi.tank = false; fi.fwd = 0; fi.hb = false;
  fi.dx = vx / def.max; fi.dy = vy / def.max; fi.m = 1;
  fi.turn = Math.hypot(ax - v.x, ay - v.y) > 20 ? clamp(wrap(a - v.a) * 1.6, -1, 1) : 0;
  fi.climb = climb;
  return d;
}

function run(world, u, dt) {
  const v = world.get(u.vid), p = world.players.get(u.pid), now = world.time;
  // brought down (shot down, crashed) or gone: the unit's over; another isn't sent for a while
  if (!v || v.removed || v.wreckAt || v.dead) {
    world.policeAir.delete(u.pid);
    if (p) { p.airNextAt = now + POLICE_AIR.againS; if (v && (v.wreckAt || v.dead) && p.ped) world.notify(p, 'The police helicopter is down!', 'good'); }
    if (v) v.lightB = 0;
    return;
  }
  const pilot = world.get(v.seats[0]);
  if (!pilot || pilot.dead) { v.lightB = 0; return; }   // (nobody flying it: it comes down - aircraft.js)
  const t = p && p.ped && !p.ped.dead ? p.ped : null;
  const tv = t && t.vehId ? world.get(t.vehId) : null, tx = t ? t.x : 0, ty = t ? t.y : 0;
  // the crew can see them: out in the open (not inside, not underground), near enough under it
  const see = !!t && !t.hidden && !t.sub && Math.hypot(tx - v.x, ty - v.y) < POLICE_AIR.sightPx && (v.alt || 0) > FLY.HIGH;
  if (u.mode !== 'home' && see) {
    u.seenAt = now;
    // radioed to the cars on the ground: the law's "seen" (police.js drives them straight at them, law.js keeps the
    // search circle tight)
    p.seenAt = now; p.lastSeenX = tx; p.lastSeenY = ty; p.searchR = 60;
    if (now - (u.told || -99) > 25) { u.told = now; world.notify(p, 'The police helicopter has eyes on you - it\'s calling your position to the cars!', 'bad'); }
  }
  // lost: the stars gone, cuffed, or nobody's seen them for a while -> home
  const lost = !p || !t || (p.wanted | 0) < 1 || p.custody || now - Math.max(u.seenAt, p.seenAt || -99) > POLICE_AIR.lostS;
  if (u.mode !== 'home' && lost) { u.mode = 'home'; u.since = now; }
  if (u.mode === 'up' && (v.alt || 0) > 60) u.mode = 'chase';
  // the searchlight, after dark: on them while it can see them, else sweeping round where they were last seen
  const night = !!(world.clock && world.clock.isNight);
  let lx = 0, ly = 0, lit = false;
  if (u.mode === 'home') {
    const d = steer(world, v, u.padX, u.padY, v.def.max * 0.8, u.padX, u.padY, Math.hypot(v.x - u.padX, v.y - u.padY) < 50 && Math.hypot(v.vx, v.vy) < 70 ? null : POLICE_AIR.alt);
    if (d < 60 && (v.alt || 0) <= 0.5) { landed(world, u, v); return; }
    // (too long trying to get home - stuck against something: put away, out of sight)
    if (now - u.since > 120 && !inAnyView(world, v.x, v.y, 300)) { putAway(world, u, v); return; }
  } else {
    // circling them (or their last known place) at orbitR, leading a moving suspect, nose on them
    const ox = see ? tx : p.lastSeenX ?? tx, oy = see ? ty : p.lastSeenY ?? ty;
    u.th += dt * (see ? 0.35 : 0.6);
    const lead = tv ? 0.8 : 0.5, svx = see ? (tv ? tv.vx : t.vx) || 0 : 0, svy = see ? (tv ? tv.vy : t.vy) || 0 : 0;
    const r = see ? POLICE_AIR.orbitR : POLICE_AIR.orbitR * 2;
    // a suspect up in an aircraft: it keeps POLICE_AIR.sep above them (below them near its ceiling) - two aircraft close
    // in height that touch both come down (aircraft.js), and its circle passed right over them (H69: fleeing in a
    // helicopter at its height, the police one flew into you on its first lap)
    const tAlt = tv && (tv.alt || 0) > FLY.HIGH ? tv.alt : 0;
    const want = !tAlt ? POLICE_AIR.alt : tAlt + POLICE_AIR.sep <= v.def.ceiling ? Math.max(POLICE_AIR.alt, tAlt + POLICE_AIR.sep) : tAlt - POLICE_AIR.sep;
    // (its circle's middle a little south of them by its height above them: art v2 draws it up the screen by its height
    // - FLY.LIFT - so it's seen circling over them, not off the top of their screen - the playtest)
    const sy = Math.max(0, (v.alt || 0) - tAlt) * FLY.LIFT * 0.8;
    const gx = ox + Math.cos(u.th) * r + svx * lead, gy = oy + sy + Math.sin(u.th) * r + svy * lead;
    steer(world, v, gx, gy, v.def.max * 0.95, ox, oy, want);
    if (u.mode === 'up' && (v.spool || 0) < FLY.LIFT_AT) { v.fin.dx = 0; v.fin.dy = 0; v.fin.turn = 0; }
    if (night) {
      lit = true;
      if (see) { lx = tx; ly = ty; }
      else { lx = ox + Math.cos(now * 0.9) * 160; ly = oy + Math.sin(now * 1.3) * 160; }
    }
  }
  // the searchlight on the wire: the vehicle record's damage word's top byte (net.js) - bit 7 on, bits 0-4 the way it
  // points (32 steps), bits 5-6 how far from under the helicopter (0, 170, 340, 510 px)
  v.searchX = lit ? lx : null; v.searchY = lit ? ly : null;
  v.lightB = lit ? lightByte(lx - v.x, ly - v.y) : 0;
}

export function lightByte(dx, dy) {
  const d = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
  const ai = ((Math.round(a / (Math.PI * 2) * 32) % 32) + 32) % 32, di = Math.min(3, Math.round(d / 170));
  return 128 | (di << 5) | ai;
}

// back on the pad: the crew climb out and go in, it stands on its pad again (headquarters' parked helicopter)
function landed(world, u, v) {
  world.policeAir.delete(u.pid);
  for (let i = 0; i < v.seats.length; i++) { const c = world.get(v.seats[i]); v.seats[i] = 0; if (c) despawnNpc(world, c); }
  v.autopilot = false; v.fin = null; v.lightB = 0; v.lights = false; v.vx = 0; v.vy = 0;
  const sp = (world.airSpots || []).find((s) => s.police);
  const other = sp ? world.get(sp.id) : null;
  if (sp && (!other || other === v || other.wreckAt || Math.hypot(other.x - sp.x, other.y - sp.y) > 300)) { sp.id = v.id; sp.goneAt = 0; v.parked = true; }
  else if (!inAnyView(world, v.x, v.y, 200)) world.remove(v);
  else v.parked = true;
}
function putAway(world, u, v) {
  world.policeAir.delete(u.pid);
  for (let i = 0; i < v.seats.length; i++) { const c = world.get(v.seats[i]); v.seats[i] = 0; if (c) despawnNpc(world, c); }
  world.remove(v);
}
