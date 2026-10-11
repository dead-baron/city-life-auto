// Flight (task: the owner, 2026-10-11 - "When will we add the flying mechanic in for helicopters and airplanes?").
// Shared like physics.js: the server runs flightStep authoritatively, the pilot's page runs the same function to predict
// its own aircraft. An aircraft is a vehicle (shared/vehicles.js, kind 'air', air 'heli' | 'plane') with an altitude
// s.alt (world px above the ground), a climb rate s.vz, its engine's spool s.spool (0 off .. 1 flying power: the rotor
// up to speed, the propeller at full revs) and, for a plane, its bank s.bank (rad, + to the right).
//   - a helicopter spools up (SPOOL_S), lifts off straight up, hovers, tilts to move (the way the stick points, or W/S
//     along the nose with A/D yawing it on a keyboard), climbs and descends; without power it sinks fast.
//   - a plane taxis on its wheels (the nose wheel steers), needs a take-off roll on something hard to reach its rotate
//     speed (vr: a runway, an airstrip, a long straight road - grass and sand hold it back), climbs, banks to turn,
//     stalls below its stall speed (the nose drops, it sinks) and lands on its wheels.
//   - low down it hits what stands taller than it is: buildings by their height (bldTop), trees and other solid
//     props (PROP_TOP). Landing on a flat roof works too (the hospital's pad - the next wave lands on it).
// Nothing here runs while the module loads (CLAUDE.md: deterministic shared code); Math.cos / sin only at run time,
// as physics.js does.
import { TILE, T } from './constants.js';
import { IN } from './input.js';
import { CAR_BLOCK, WATER_T, DISTRICTS } from './mapcore.js';
import { clamp, wrapAngle, obbBounds, obbVsAabb, circleVsObb } from './math.js';
import { collideVehicleTiles } from './physics.js';

export const isAir = (def) => !!def && def.kind === 'air';
export const isHeli = (def) => !!def && def.air === 'heli';
export const isPlane = (def) => !!def && def.air === 'plane';

// the controls (shared/input.js IN): climb and descend - Space / Shift on a keyboard at the controls of an aircraft,
// RT / LT on a pad, the ▲ / ▼ buttons on touch (client/input.js)
export const CLIMB = IN.CLIMB, DESCEND = IN.DESCEND;

export const FLY = {
  SPOOL_S: 3.2,        // a helicopter's rotor from still to flying speed (the plane's propeller: half that)
  UNSPOOL_S: 7,        // ...and winding down with nobody at the controls
  LIFT_AT: 0.85,       // the spool a helicopter lifts off at
  GRAV: 260,           // px/s² - falling without lift
  FALL_MAX: 520,       // px/s - the fastest it comes down
  AIRBORNE: 6,         // px - above this it's off the ground (no wheels or skids on it)
  HIGH: 24,            // px - above this, ground traffic and people pass under it
  HARD_SINK: 150,      // px/s - touching down faster than this hurts the aircraft
  CRASH_SINK: 330,     // px/s - ...and faster than this it's a crash
  CRASH_HIT: 240,      // px/s - flying into something faster than this is a crash (slower: a bump, damage)
  ALT_Q: 4,            // px per step of the altitude on the wire (a vehicle record's extra byte: 0..1020 px)
  PROP_TOP: 110,       // px - a tree or another solid prop stands this tall
  PAD_R: 72,           // px - a helipad's radius
};

// How tall a building stands (px, its roof above the ground), by the district it's in and what it is - the art's
// rough heights. Cached per building on the map (m._bldTop).
const STYLE_TOP = { towers: 620, commercial: 380, civic: 300, nightlife: 260, redlight: 240, oldtown: 220, arts: 220, apartments: 260, southside: 220, harbor: 180, industrial: 180, factory: 200, houses: 120, luxury: 140, beach: 130, suburb: 120, rural: 110, desert: 110, wild: 110, park: 110, airport: 170, rocky: 110 };
export function bldTop(m, b) {
  if (!b) return 0;
  const c = (m._bldTop ||= new Map());
  let h = c.get(b.id);
  if (h !== undefined) return h;
  const d = m.inside(b.tx, b.ty) ? DISTRICTS[m.dist[m.idx(b.tx, b.ty)]] : null;
  h = b.kind === 'hangar' ? 150 : b.kind === 'terminal' ? 190 : b.kind === 'hospital' || b.prefab === 'hospital' ? 240 : (d && STYLE_TOP[d.style]) || 200;
  // bigger footprints stand taller in town (a tower block over a corner shop)
  const area = (b.tw || 1) * (b.th || 1);
  if (d && (d.style === 'towers' || d.style === 'commercial')) h += Math.min(260, area * 0.9);
  c.set(b.id, h);
  return h;
}
// what stands at a tile, px above the ground: a building's roof, a wall (its own height), else 0
export function tileTop(m, tx, ty) {
  if (!m.inside(tx, ty)) return 0;
  const t = m.tileAt(tx, ty);
  if (t === T.BUILDING) { const b = m.bld[m.idx(tx, ty)]; return b >= 0 ? bldTop(m, m.buildings[b]) : 200; }
  // a walk-in building's floor (a hospital, a shop): its roof is over it - the hospitals' roof pads are up there (H59)
  if (t === T.FLOOR || t === T.COUNTER) { const b = m.bld[m.idx(tx, ty)]; return b >= 0 ? bldTop(m, m.buildings[b]) : 0; }
  if (t === T.WALL) return 60;
  return 0;
}
// the ground under a point for something coming down onto it: a roof's height, or 0
export const floorAt = (m, x, y) => tileTop(m, Math.floor(x / TILE), Math.floor(y / TILE));

// The ground a plane rolls on: how much of its top speed it can reach there (a runway, an apron, a road all of it; an
// airstrip's packed dirt most; grass, sand and fields far too little to take off)
const ROLL = new Float32Array(16).fill(0.4);
export function rollOf(t) {
  if (t === T.ROAD || t === T.LOT || t === T.BRIDGE || t === T.PLAZA || t === T.SIDEWALK) return 1;
  if (t === T.DIRT) return 0.85;
  if (t === T.DOCK) return 0.6;
  return ROLL[t] || 0.4;
}

export function newFlightState(s) { s.alt = s.alt || 0; s.vz = s.vz || 0; s.spool = s.spool || 0; s.bank = s.bank || 0; return s; }

// The pilot's input -> { fwd, side, turn, climb, hb, analog, dir, m } (fwd / side: where the stick asks it to go, in the
// world for a helicopter on a stick; turn: yaw / bank; climb -1..1).
// TANK (a keyboard's car-style, a pad's triggers): -my gas / forward tilt, mx the wheel. Otherwise the stick points
// where to go: a helicopter tilts that way and turns its nose after it; a plane turns toward it, the push its throttle.
export function flightInput(s, inp, def) {
  const bits = inp.bits || 0;
  const climb = (bits & IN.CLIMB ? 1 : 0) - (bits & IN.DESCEND ? 1 : 0);
  const hb = !!(bits & IN.DIVE);
  if (bits & IN.TANK) return { tank: true, fwd: clamp(-inp.my, -1, 1), turn: clamp(inp.mx, -1, 1), climb, hb, m: Math.abs(inp.my) };
  const m = Math.min(1, Math.hypot(inp.mx, inp.my));
  if (m < 0.08) return { tank: false, fwd: 0, turn: 0, climb, hb, m: 0, dx: 0, dy: 0 };
  const want = Math.atan2(inp.my, inp.mx), d = wrapAngle(want - s.a);
  if (isHeli(def)) return { tank: false, dx: inp.mx, dy: inp.my, turn: clamp(d * 1.6, -1, 1), climb, hb, m, fwd: 0 };
  // a plane: back against the nose brakes (on the ground) / throttles back (in the air)
  return { tank: false, fwd: Math.abs(d) > 2.2 ? -m : m * Math.max(0.35, Math.cos(d)), turn: clamp(d * 2, -1, 1), climb, hb, m };
}

// One step. engine: someone at the controls with the engine alive. Returns { hit, sink, floor, stall } - hit: the
// speed it flew into something at (px/s, 0 none), sink: how fast it touched down this step (0 if it didn't), floor:
// what it's standing on (a roof's height, 0 the ground), and the plane's stall.
const OUT = { hit: 0, sink: 0, floor: 0, stall: false, water: false };
export function flightStep(s, fi, dt, map, def, engine = true) {
  newFlightState(s);
  OUT.hit = 0; OUT.sink = 0; OUT.stall = false; OUT.water = false;
  const heli = isHeli(def);
  // -- the engine: the rotor spools up (the propeller twice as quick), and down once nobody's flying it
  const want = engine ? (heli ? 1 : 0.55 + 0.45 * Math.max(0, fi.fwd)) : 0;
  const upS = heli ? FLY.SPOOL_S : FLY.SPOOL_S / 2;
  s.spool = want > s.spool ? Math.min(want, s.spool + dt / upS) : Math.max(want, s.spool - dt / FLY.UNSPOOL_S);
  const floor = floorAt(map, s.x, s.y);
  const onGround = s.alt <= floor + 0.5;
  if (heli) heliStep(s, fi, dt, def, onGround, s.alt - floor);
  else planeStep(s, fi, dt, map, def, onGround, s.alt - floor);
  // -- up and down
  s.alt += s.vz * dt;
  if (s.alt > def.ceiling) { s.alt = def.ceiling; s.vz = Math.min(0, s.vz); }
  const fl = floorAt(map, s.x, s.y);
  if (s.alt <= fl) {
    if (s.vz < -1) OUT.sink = -s.vz;
    // dropping onto a roof from beside it (not from above it): that's flying into its side, not landing on it
    if (fl > 0 && s.alt < fl - Math.max(8, Math.abs(s.vz * dt) + 2)) { OUT.hit = Math.max(OUT.hit, Math.hypot(s.vx, s.vy) + 40); }
    s.alt = fl; s.vz = Math.max(0, s.vz);
  }
  OUT.floor = fl;
  // -- across: low down it bumps into what's taller than it is; on the ground (alt 0) the wheels and skids collide like a car's
  s.x += s.vx * dt; s.y += s.vy * dt;
  if (s.alt <= FLY.AIRBORNE && fl === 0) OUT.hit = Math.max(OUT.hit, collideVehicleTiles(s, def, map, CAR_BLOCK));
  else OUT.hit = Math.max(OUT.hit, collideAir(s, def, map));
  if (s.alt <= 0.5 && map.inside(Math.floor(s.x / TILE), Math.floor(s.y / TILE)) && WATER_T[map.tileAtPx(s.x, s.y)]) OUT.water = true;
  return OUT;
}

// coming down under power, the pilot eases off near the ground (a flare): FLARE px/s at the touch, more higher up
const FLARE = 60;
const flare = (target, above) => (target < 0 && above < 100 ? Math.max(target, -(FLARE + above * 1.2)) : target);
function heliStep(s, fi, dt, def, onGround, above) {
  const lift = s.spool >= FLY.LIFT_AT;
  // vertical: the climb / descend controls set the climb rate; with nothing pressed it hovers. Without lift it sinks.
  if (lift) {
    const target = flare(fi.climb > 0 ? def.climb * fi.climb : fi.climb < 0 ? -def.sink * -fi.climb : 0, above);
    s.vz += (target - s.vz) * Math.min(1, 3 * dt);
    if (onGround && s.vz < 0) s.vz = 0;
  } else if (!onGround) s.vz = Math.max(-FLY.FALL_MAX, s.vz - FLY.GRAV * (1 - s.spool * 0.7) * dt);
  else s.vz = 0;
  // across: tilting toward where it should go, sluggish (momentum); the nose turns after the stick (or A/D on a keyboard)
  const flying = !onGround && s.alt > FLY.AIRBORNE;
  let tvx = 0, tvy = 0;
  if (flying && lift) {
    if (fi.tank) { const c = Math.cos(s.a), sn = Math.sin(s.a); tvx = c * fi.fwd * def.max; tvy = sn * fi.fwd * def.max; }
    else if (fi.m > 0) { tvx = fi.dx * def.max; tvy = fi.dy * def.max; }
  }
  const k = flying ? Math.min(1, (def.accel / def.max) * dt * 1.6) : Math.min(1, 8 * dt);
  s.vx += (tvx - s.vx) * k; s.vy += (tvy - s.vy) * k;
  if (!flying && Math.hypot(s.vx, s.vy) < 4) { s.vx = 0; s.vy = 0; }
  // yaw: the tail rotor (on the ground too, once it's light on its skids)
  const yaw = lift ? fi.turn * def.turn * (fi.tank ? 1 : Math.min(1, fi.m * 1.5)) : 0;
  s.av = (s.av || 0) + (yaw - (s.av || 0)) * Math.min(1, 6 * dt);
  s.a = wrapAngle(s.a + s.av * dt);
  // the tilt it shows (bank: sideways, + right; the clients lean the rotor disc)
  const c = Math.cos(s.a), sn = Math.sin(s.a);
  const lat = -s.vx * sn + s.vy * c;
  s.bank += (clamp(lat / def.max, -0.5, 0.5) - s.bank) * Math.min(1, 4 * dt);
}

function planeStep(s, fi, dt, map, def, onGround, above) {
  let c = Math.cos(s.a), sn = Math.sin(s.a);
  let fwd = s.vx * c + s.vy * sn;
  const power = s.spool;   // (the engine at idle 0.55, full 1; a dead engine: none)
  if (onGround && s.alt <= FLY.AIRBORNE) {
    // -- taxiing / the take-off roll / the landing roll: on its wheels, the nose wheel steering
    const roll = rollOf(map.tileAtPx(s.x, s.y));
    const cap = def.max * roll;
    if (fi.fwd > 0.05 && power > 0.5) { if (fwd < cap) fwd += def.accel * fi.fwd * power * dt * clamp(1 - fwd / cap, 0.15, 1); }
    else if (fi.fwd < -0.05 || fi.hb) fwd = fwd > 0 ? Math.max(0, fwd - def.brake * Math.max(fi.hb ? 1 : 0, -fi.fwd) * dt) : Math.max(-60, fwd - 40 * dt);   // (brakes; pushed back slowly when stopped)
    else fwd -= fwd * 0.35 * dt;
    if (fwd > cap) fwd -= (fwd - cap) * 1.4 * dt;   // (the grass holds it back)
    const steerK = clamp(Math.abs(fwd) / 120, 0, 1) * (Math.abs(fwd) > 300 ? 300 / Math.abs(fwd) : 1);
    s.av = fi.turn * def.turn * 0.9 * steerK * Math.sign(fwd || 1);
    s.a = wrapAngle(s.a + s.av * dt);
    s.bank += (0 - s.bank) * Math.min(1, 5 * dt);
    // rotate: at flying speed, pull up (climb) and it lifts off
    s.vz = fwd >= def.vr && fi.climb > 0 ? def.climb * 0.6 : 0;
    if (Math.abs(fwd) < 2 && fi.fwd <= 0.05) fwd = 0;
  } else {
    // -- flying: the throttle (pushing on) speeds it up, letting go holds its speed, pulling back slows it;
    // climbing costs speed and diving gains it; below the stall speed the wing quits - the nose drops and it sinks
    const thrust = fi.fwd > 0.05 ? def.accel * fi.fwd * power : fi.fwd < -0.05 ? -def.accel * 0.6 * -fi.fwd : 0;
    fwd += thrust * dt - s.vz * 0.35 * dt;
    if (fwd > def.max) fwd -= (fwd - def.max) * 1.5 * dt;
    if (power < 0.3) fwd -= 40 * dt;   // (engine out: gliding down, slowing)
    const stall = fwd < def.stall;
    OUT.stall = stall;
    if (stall) {
      s.vz = Math.max(-FLY.FALL_MAX, s.vz - FLY.GRAV * dt);
      fwd += 90 * dt;   // (the nose down: picking up speed again)
    } else {
      const target = flare(fi.climb > 0 ? def.climb * fi.climb : fi.climb < 0 ? -def.sink * -fi.climb : power < 0.3 ? -def.sink * 0.5 : 0, above);
      s.vz += (target - s.vz) * Math.min(1, 2 * dt);
    }
    fwd = Math.max(0, fwd);
    // banking into the turn: the bank sets the turn rate (a stalled wing barely answers)
    const tb = fi.turn * def.bank * (stall ? 0.3 : 1);
    s.bank += (tb - s.bank) * Math.min(1, 2.6 * dt);
    s.av = s.bank * def.turn;
    s.a = wrapAngle(s.a + s.av * dt);
  }
  c = Math.cos(s.a); sn = Math.sin(s.a);
  s.vx = c * fwd; s.vy = sn * fwd;   // (it flies where its nose points)
}

// In the air: whatever stands taller than it is at its altitude (buildings by height, walls, trees and solid props)
// pushes it back out, like a wall does a car. -> the speed it hit at (px/s), 0 if nothing.
export function collideAir(s, def, map) {
  const hl = def.L / 2, hw = def.W / 2;
  let impact = 0;
  for (let iter = 0; iter < 3; iter++) {
    const bb = obbBounds(s.x, s.y, s.a, hl, hw);
    const tx0 = Math.floor(bb.minX / TILE), tx1 = Math.floor(bb.maxX / TILE);
    const ty0 = Math.floor(bb.minY / TILE), ty1 = Math.floor(bb.maxY / TILE);
    let best = null;
    for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
      const top = tileTop(map, tx, ty);
      if (top > s.alt + 0.5) {
        const hit = obbVsAabb(s.x, s.y, s.a, hl, hw, tx * TILE, ty * TILE, TILE, TILE);
        if (hit && (!best || hit.depth > best.depth)) best = hit;
      }
      if (s.alt < FLY.PROP_TOP && map.inside(tx, ty) && map.solidProps.size) {
        const props = map.solidProps.get(map.idx(tx, ty));
        if (props) for (const p of props) {
          if (p.off || (p.r < 10 && s.alt > 40)) continue;   // (street furniture only matters right down low)
          const h = circleVsObb(p.x, p.y, p.r, s.x, s.y, s.a, hl * 0.8, hw * 0.8);
          if (h && (!best || h.depth > best.depth)) best = { nx: -h.nx, ny: -h.ny, depth: h.depth };
        }
      }
    }
    if (!best) break;
    s.x += best.nx * (best.depth + 0.01);
    s.y += best.ny * (best.depth + 0.01);
    const vn = s.vx * best.nx + s.vy * best.ny;
    if (vn < 0) { s.vx -= 1.4 * vn * best.nx; s.vy -= 1.4 * vn * best.ny; impact = Math.max(impact, -vn); s.av = (s.av || 0) * 0.3; }
  }
  return impact;
}

// ---- where they are: helipads, runways and airstrips (the map's runtime data - computed from the built map, nothing
// added to the generator, so the world's hash is the same). -> { pads: [{ x, y, kind, name, roof, alt, b }], strips:
// [{ name, x, y, w, h, a }], aprons: [{ x, y, a, name }] } (px; strips' a: the way along them), cached on the map.
const PAD_OK = new Set([T.PLAZA, T.LOT, T.GRASS, T.SIDEWALK, T.DIRT, T.SAND, T.FIELD]);
function clearPad(m, x, y, r, avoid) {
  if (avoid) for (const a of avoid) if (x + r > a.x && x - r < a.x + a.w && y + r > a.y && y - r < a.y + a.h) return false;   // (never on a runway)
  const t0x = Math.floor((x - r) / TILE), t1x = Math.floor((x + r) / TILE), t0y = Math.floor((y - r) / TILE), t1y = Math.floor((y + r) / TILE);
  for (let ty = t0y; ty <= t1y; ty++) for (let tx = t0x; tx <= t1x; tx++) {
    if (!m.inside(tx, ty) || !PAD_OK.has(m.tileAt(tx, ty))) return false;
    const props = m.solidProps.size ? m.solidProps.get(m.idx(tx, ty)) : null;
    if (props && props.some((p) => !p.off)) return false;
  }
  return true;
}
// the nearest clear spot (a circle r px across nothing solid, no road, no water) within maxR px of (x, y), or null
export function findPadSpot(m, x, y, r = FLY.PAD_R, maxR = 640, avoid = null) {
  if (clearPad(m, x, y, r, avoid)) return { x, y };
  for (let d = TILE; d <= maxR; d += TILE) {
    const n = Math.max(8, Math.round(d / 12));
    for (let k = 0; k < n; k++) {
      const ang = (k / n) * Math.PI * 2, px = Math.round(x + Math.cos(ang) * d), py = Math.round(y + Math.sin(ang) * d);
      if (clearPad(m, px, py, r, avoid)) return { x: px, y: py };
    }
  }
  return null;
}
export function airfields(m) {
  if (m._airfields) return m._airfields;
  const pads = [], strips = [], aprons = [];
  for (const A of m.airports || []) {
    const r = A.runway, along = r.h >= r.w;
    strips.push({ name: A.name, x: r.x, y: r.y, w: r.w, h: r.h, a: along ? -Math.PI / 2 : 0 });
    if (A.taxi) strips.push({ name: `${A.name} taxiway`, x: A.taxi.x, y: A.taxi.y, w: A.taxi.w, h: A.taxi.h, a: along ? -Math.PI / 2 : 0, taxi: true });
  }
  for (const s of m.natureSites || []) if (s.kind === 'airstrip') strips.push({ name: s.name, x: s.x - 6 * TILE, y: s.y, w: 12 * TILE, h: 40 * TILE, a: -Math.PI / 2, approx: true });
  for (const A of m.airports || []) {
    // the planes' stands on the apron (beside the parked prop planes, the airport's own)
    for (const pl of A.planes || []) { const sp = findPadSpot(m, pl.x, pl.y + 150, 70, 400, strips); if (sp) aprons.push({ x: sp.x, y: sp.y, a: -Math.PI / 2, name: A.name }); }
    // a helipad by the terminal, off the apron's side
    const t = A.taxi, sp = findPadSpot(m, t.x + t.w + 260, t.y + 200, FLY.PAD_R, 700, strips);
    if (sp) pads.push({ x: sp.x, y: sp.y, kind: 'airport', name: `${A.name} helipad`, roof: false, alt: 0 });
  }
  for (const s of m.natureSites || []) {
    if (s.kind !== 'airstrip' || !s.plane) continue;
    const sp = findPadSpot(m, s.plane.x + 120, s.plane.y, 70, 400, strips);
    if (sp) aprons.push({ x: sp.x, y: sp.y, a: -Math.PI / 2, name: s.name });
  }
  // the police headquarters (the first station) - a pad in its yard
  const pd = (m.pois || []).find((p) => p.kind === 'police');
  if (pd) { const sp = findPadSpot(m, pd.x, pd.y + 120, FLY.PAD_R, 700); if (sp) pads.push({ x: sp.x, y: sp.y, kind: 'police', name: `${pd.label || 'Police HQ'} helipad`, roof: false, alt: 0 }); }
  // the hospitals: a pad on the roof (the next wave lands rescues there) and one in the yard
  for (const h of m.hospitals || []) {
    const poi = (m.pois || [])[h.id], b = poi && poi.b !== undefined && poi.b >= 0 ? m.buildings[poi.b] : m.buildingAtPx(h.x, h.y - 60);
    if (b) pads.push({ x: (b.tx + b.tw / 2) * TILE, y: (b.ty + b.th / 2) * TILE, kind: 'hospital', name: `${h.name} roof pad`, roof: true, alt: bldTop(m, b), b: b.id });
    const sp = findPadSpot(m, h.x, h.y + 80, FLY.PAD_R, 600);
    if (sp) pads.push({ x: sp.x, y: sp.y, kind: 'hospital', name: `${h.name} helipad`, roof: false, alt: 0 });
  }
  m._airfields = { pads, strips, aprons };
  return m._airfields;
}
// on a runway or an airstrip?
export function onStrip(m, x, y) {
  for (const s of airfields(m).strips) if (!s.taxi && x >= s.x && x <= s.x + s.w && y >= s.y && y <= s.y + s.h) return s;
  return null;
}

// the altitude on the wire: a vehicle record's extra byte (net.js)
export const altByte = (alt) => Math.max(0, Math.min(255, Math.round((alt || 0) / FLY.ALT_Q)));
export const altOfByte = (b) => (b & 255) * FLY.ALT_Q;
