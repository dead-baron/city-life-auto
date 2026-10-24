// Life on the water: NPC boaters cruising between open-sea waypoints, and harbor police patrol
// boats that chase wanted players who take to the water (and shoot back at 3+ stars). And (rivers part 2, 2026-10-20:
// the owner's "NPC fishing boats") the anglers' boats: a rowboat or a dinghy out on a lake near you - or sat in a big
// river's calm pocket (shared/world3-rapids.js) - its angler's rod out over the side a minute or two, then rowing on.
import { K, T, TILE } from '../../shared/constants.js';
import { BOAT_BLOCK } from '../../shared/map.js';
import { angleDiff, clamp } from '../../shared/math.js';
import { vehForwardSpeed } from '../../shared/physics.js';
import { mulberry32 } from '../../shared/rng.js';
import { spawnNpc, despawnNpc } from './npc.js';
import { inAnyView, cineEyes } from '../view.js';
import { pointGrid } from '../pointgrid.js';
import * as combat from './combat.js';
import { dressAs } from './activities.js';

const rng = mulberry32(6060);
const BOATERS_NEAR = 4;      // NPC boats kept around a player who's out on / by the water
const PATROLS_NEAR = 1;      // police patrol boats around such a player
const NEAR_SEA_PX = 900;     // a player this close to open water counts as "by the water"
const FAR_PX = 2400;         // boats further than this from every player are removed
const MODELS = [['dinghy', 3], ['speedboat', 2], ['jetski', 2]];
const FISHERS_NEAR = 2;      // anglers' boats kept on the water near a player who's by a lake or a big river's pocket
const NEAR_LAKE_PX = 1200;   // a player this close to a lake's open water (or such a pocket) counts as "by it"
const FISH_MODELS = [['rowboat', 3], ['dinghy', 1]];
const FISH_ROW = 120;        // how fast an angler rows on (px/s)
const FISH_S = [40, 120];    // how long an angler sits at a spot (s)

const water = (world, x, y) => !BOAT_BLOCK[world.map.tileAtPx(x, y)];

// Real water (the owner's notes, 10-22: "NPC boats showing up in city ponds"): the boaters, the patrol boats and the
// anglers only go on a body of water of some size - the sea, a lake, a big river - never a park's pond, a plaza's
// pool or a fountain. How big the water round (x, y) is: its open-water tiles (WATER / DEEP; a bridge over it joins
// it up), counted out to `cap` (a bounded flood fill; the sea and the big lakes stop at the cap).
const BOATERS_WATER = 2500;   // tiles: the boaters' and the patrol boats' water (about 50 x 50 at the least)
const ANGLERS_WATER = 300;    // tiles: an angler's lake (the smallest World v3 has, a tarn in Granite Peaks, is 368)
const OPEN_T = new Uint8Array(16); OPEN_T[T.WATER] = 1; OPEN_T[T.DEEP] = 1;
export function waterSize(m, x, y, cap) {
  let tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
  if (!m.inside(tx, ty) || BOAT_BLOCK[m.tiles[m.idx(tx, ty)]]) return 0;
  const seen = new Set([m.idx(tx, ty)]), stack = [tx, ty];
  let n = 0;
  while (stack.length && n < cap) {
    ty = stack.pop(); tx = stack.pop();
    if (OPEN_T[m.tiles[m.idx(tx, ty)]]) n++;
    for (let k = 0; k < 4; k++) {
      const nx = tx + (k === 0 ? 1 : k === 1 ? -1 : 0), ny = ty + (k === 2 ? 1 : k === 3 ? -1 : 0);
      if (!m.inside(nx, ny)) continue;
      const i = m.idx(nx, ny);
      if (seen.has(i) || BOAT_BLOCK[m.tiles[i]]) continue;
      seen.add(i); stack.push(nx, ny);
      if (seen.size > cap * 3) return cap;   // (a long bridge's deck: as good as big)
    }
  }
  return n;
}
// a sea point a boat may use (each point's answer kept: the points round the players are asked again and again)
const BIG = new WeakMap();
export function bigWater(world, p) {
  let ok = BIG.get(p);
  if (ok === undefined) { ok = waterSize(world.map, p.x, p.y, BOATERS_WATER) >= BOATERS_WATER; BIG.set(p, ok); }
  return ok;
}
function clearLine(world, x1, y1, x2, y2) {
  const d = Math.hypot(x2 - x1, y2 - y1), n = Math.ceil(d / 48);
  for (let i = 1; i <= n; i++) if (!water(world, x1 + (x2 - x1) * i / n, y1 + (y2 - y1) * i / n)) return false;
  return true;
}

// Steer a boat toward (tx, ty), feeling its way round land ahead - along its hull's width, not only its middle (a hull
// scraping a pier's edge with its middle line clear came to a stop against it). Meaning to go and going nowhere for a
// couple of seconds (jammed on a wall, a dock, a breakwater, an inlet's end: the owner, 10-16, "NPC boats stuck on
// walls, docks and inlets"), it backs off, turning, and its skipper picks somewhere else to go (v.ai.lost: an NPC
// boat's update takes a new heading) - and one that keeps jamming is given up once nobody's looking (v.ai.gone).
const STUCK_S = 2.5, BACK_S = 1.5, GIVE_UP = 5;
export function boatSteer(world, v, tx, ty, speed) {
  const ai = v.ai, now = world.time;
  if (ai && ai.backUntil > now) { v.input = { throttle: -0.8, steer: ai.backSteer || 1, hb: false }; return; }
  const want = Math.atan2(ty - v.y, tx - v.x), half = (v.def.W || 40) / 2 + 6;
  let best = null;
  for (const off of [0, 0.35, -0.35, 0.7, -0.7, 1.1, -1.1, 1.6, -1.6, 2.2, -2.2]) {
    const a = want + off, c = Math.cos(a), sn = Math.sin(a);
    let ok = true;
    for (const d of [50, 100, 160]) {
      for (const sd of [0, -half, half]) if (!water(world, v.x + c * d - sn * sd, v.y + sn * d + c * sd)) { ok = false; break; }
      if (!ok) break;
    }
    if (ok) { best = a; break; }
  }
  const fwd = vehForwardSpeed(v);
  if (best === null) v.input = { throttle: -0.6, steer: 0.8, hb: false };
  else {
    const diff = angleDiff(v.a, best);
    const sp = Math.abs(diff) > 1.2 ? Math.min(speed, 160) : speed;
    v.input = { throttle: clamp((sp - fwd) / 120, -1, 1), steer: clamp(diff * 2.2, -1, 1), hb: false };
  }
  if (!ai) return;
  // jammed: going nowhere while it means to go
  if (Math.abs(v.input.throttle) > 0.2 && Math.hypot(v.vx, v.vy) < 25) {
    if (!ai.slowSince) ai.slowSince = now;
    else if (now - ai.slowSince > STUCK_S) {
      ai.slowSince = 0; ai.jams = (ai.jams || 0) + 1;
      // (back off turning toward whichever side has the open water)
      const l = water(world, v.x + Math.cos(v.a - 1.2) * 80, v.y + Math.sin(v.a - 1.2) * 80), r = water(world, v.x + Math.cos(v.a + 1.2) * 80, v.y + Math.sin(v.a + 1.2) * 80);
      ai.backSteer = l && !r ? 1 : r && !l ? -1 : ai.jams % 2 ? 1 : -1;
      ai.backUntil = now + BACK_S;
      ai.lost = true;
      if (ai.jams >= GIVE_UP) ai.gone = true;
    }
  } else ai.slowSince = 0;
}

function pickModel(list = MODELS) {
  let tot = 0; for (const [, w] of list) tot += w;
  let r = rng() * tot;
  for (const [m, w] of list) { r -= w; if (r <= 0) return m; }
  return 'dinghy';
}

// (the sea's points through their spatial index, server/pointgrid.js: at World v3's frame there are 190,000)
const seaGrid = (world) => pointGrid(world.map.seaPoints || []);
function nextPoint(world, v, minD = 500, maxD = 1500) {
  const pts = seaGrid(world).within(v.x, v.y, minD, maxD * 1.6).filter((p) => bigWater(world, p));
  for (let k = 0; k < 20 && pts.length; k++) {
    const p = pts[Math.floor(rng() * pts.length)];
    if (clearLine(world, v.x, v.y, p.x, p.y)) return p;
  }
  let best = null, bd = Infinity;   // (none in a clear line: the nearest on real water past 300 px - boatSteer feels its way)
  for (const p of seaGrid(world).within(v.x, v.y, 300, 2000)) { const d = Math.hypot(p.x - v.x, p.y - v.y); if (d < bd && bigWater(world, p)) { bd = d; best = p; } }
  return best;
}

function spawnPoint(world, a) {
  const pts = seaGrid(world).within(a.x, a.y, 750, 1400).filter((p) => { const d = Math.hypot(p.x - a.x, p.y - a.y); return d > 750 && d < 1400 && bigWater(world, p); });
  for (let k = 0; k < 8 && pts.length; k++) {
    const p = pts[Math.floor(rng() * pts.length)];
    if ([...world.players.values()].every((q) => !q.ped || Math.hypot(q.ped.x - p.x, q.ped.y - p.y) > 500) && !inAnyView(world, p.x, p.y, 120) && !world.query(p.x, p.y, 120, K.VEH).length) return p;
  }
  return null;
}

const byWater = (world, x, y) => seaGrid(world).any(x, y, NEAR_SEA_PX) && seaGrid(world).within(x, y, 0, NEAR_SEA_PX).some((p) => bigWater(world, p));

// ---- the anglers' boats ----------------------------------------------------------------------------------------------
// Where an angler's boat sits (once a map): a lake's open water every 8 tiles (the lake 4 tiles round it) - a lake of
// ANGLERS_WATER tiles or more, not a park's pond - and the big rivers' calm pockets (radius 6 tiles or more: room for
// a boat)
export function fishSpots(world) {
  const m = world.map;
  if (m._fishSpots) return m._fishSpots;
  const out = [], open = (tx, ty) => { if (!m.inside(tx, ty)) return false; const i = m.idx(tx, ty), t = m.tiles[i]; return (t === T.WATER || t === T.DEEP) && m.lake[i] === 1; };
  if (m.lake) for (let ty = m.y0 + 4; ty < m.y0 + m.h - 4; ty += 8) for (let tx = m.x0 + 4; tx < m.x0 + m.w - 4; tx += 8) if (open(tx, ty) && open(tx - 4, ty) && open(tx + 4, ty) && open(tx, ty - 4) && open(tx, ty + 4)) {
    const x = (tx + 0.5) * TILE, y = (ty + 0.5) * TILE;
    if (waterSize(m, x, y, ANGLERS_WATER) >= ANGLERS_WATER) out.push({ x, y });
  }
  for (const c of (m.waters && m.waters.ch) || []) for (const q of c.p || []) if (q[2] >= 6) out.push({ x: q[0] * TILE, y: q[1] * TILE, pocket: true });
  Object.defineProperty(m, '_fishSpots', { value: out, enumerable: false });
  return out;
}
function fishSpawn(world, a) {
  const pts = pointGrid(fishSpots(world)).within(a.x, a.y, 500, 1300);
  for (let k = 0; k < 8 && pts.length; k++) {
    const p = pts[Math.floor(rng() * pts.length)];
    if ([...world.players.values()].every((q) => !q.ped || Math.hypot(q.ped.x - p.x, q.ped.y - p.y) > 400) && !inAnyView(world, p.x, p.y, 120) && !world.query(p.x, p.y, 150, K.VEH).length) return p;
  }
  return null;
}
// the next spot on the same water: a lake's, 250-900 px off in a clear line (a pocket's boat stays in its pocket)
function nextFishSpot(world, v) {
  const pts = pointGrid(fishSpots(world)).within(v.x, v.y, 250, 900).filter((p) => !p.pocket);
  for (let k = 0; k < 12 && pts.length; k++) {
    const p = pts[Math.floor(rng() * pts.length)];
    if (clearLine(world, v.x, v.y, p.x, p.y) && !world.query(p.x, p.y, 120, K.VEH).length) return p;
  }
  return null;
}
export function spawnFisher(world, p) {
  const v = world.spawnVehicle(pickModel(FISH_MODELS), p.x, p.y, rng() * 6.28, {});
  const d = spawnNpc(world, 'casual', p.x, p.y, 'driver');
  dressAs(world, d, 'fisher');
  d.vehId = v.id; d.seat = 0; v.seats[0] = d.id;
  v.ai = { kind: 'fisher', to: null, until: world.time + FISH_S[0] * 0.5 + rng() * FISH_S[1] * 0.5, drv: d.id, pocket: !!p.pocket };
  v.despawnable = false;
  return v;
}
// the rod down (the boat taken, the angler gone): their ped's fishing flag off
function rodDown(world, ai) { const d = ai && world.get(ai.drv); if (d && d.fishing && d.fishing.npc) d.fishing = null; }

function manage(world) {
  const anchors = [...world.players.values()].filter((p) => p.ped && !p.ped.dead).map((p) => p.ped).concat(cineEyes(world));   // (and the cinematic mode's: view.js)
  // tidy up
  for (const v of world.entities.values()) {
    if (v.kind !== K.VEH || !v.ai || (v.ai.kind !== 'boater' && v.ai.kind !== 'pboat' && v.ai.kind !== 'fisher')) continue;
    if (v.seats.some((s) => s && world.get(s)?.player)) { rodDown(world, v.ai); v.ai = null; v.despawnable = true; continue; }
    if (anchors.some((a) => Math.hypot(a.x - v.x, a.y - v.y) < FAR_PX)) continue;
    for (const sid of v.seats) { const q = sid && world.get(sid); if (q && q.npc) despawnNpc(world, q); }
    world.remove(v);
  }
  for (const a of anchors) {
    // the anglers' boats: on a lake (or a big river's pocket) near you
    if (pointGrid(fishSpots(world)).any(a.x, a.y, NEAR_LAKE_PX)) {
      let fishers = 0;
      for (const v of world.query(a.x, a.y, 1600, K.VEH)) if (v.ai && v.ai.kind === 'fisher') fishers++;
      if (fishers < FISHERS_NEAR && world.npcCount + world.trafficCount < world.npcBudget) { const p = fishSpawn(world, a); if (p) spawnFisher(world, p); }
    }
    if (!byWater(world, a.x, a.y)) continue;
    let boaters = 0, patrols = 0;
    for (const v of world.query(a.x, a.y, 1600, K.VEH)) { if (v.ai && v.ai.kind === 'boater') boaters++; if (v.ai && v.ai.kind === 'pboat') patrols++; }
    if (boaters < BOATERS_NEAR && world.npcCount + world.trafficCount < world.npcBudget) {
      const p = spawnPoint(world, a);
      if (p) {
        const v = world.spawnVehicle(pickModel(), p.x, p.y, rng() * 6.28, {});
        const d = spawnNpc(world, rng() < 0.5 ? 'casual' : 'athlete', p.x, p.y, 'driver');
        d.vehId = v.id; d.seat = 0; v.seats[0] = d.id;
        v.ai = { kind: 'boater', to: null, speed: 220 + rng() * 200 };
        v.despawnable = false;
      }
    }
    if (patrols < PATROLS_NEAR) {
      const p = spawnPoint(world, a);
      if (p) spawnPatrol(world, p);
    }
  }
}

export function spawnPatrol(world, p) {
  const v = world.spawnVehicle('policeboat', p.x, p.y, rng() * 6.28, {});
  v.despawnable = false; v.sirenOn = false;
  v.ai = { kind: 'pboat', to: null, target: null };
  for (let i = 0; i < 2; i++) {
    const c = spawnNpc(world, 'cop', p.x, p.y, 'cop');
    c.npc.unit = v.id; c.npc.boat = true; c.weapon = 'pistol';
    c.vehId = v.id; c.seat = i; v.seats[i] = c.id;
  }
  return v;
}

// A wanted player out on the water (in a boat, swimming, or on a dock) near this patrol boat.
function quarry(world, v) {
  let best = null, bd = 1100;
  for (const p of world.players.values()) {
    const ped = p.ped;
    if (!ped || ped.dead || ped.hidden || p.wanted <= 0 || (p.wanted === 1 && p.soft)) continue;   // (not a star from small crimes: stops.js)
    const pv = ped.vehId ? world.get(ped.vehId) : null;
    const x = pv ? pv.x : ped.x, y = pv ? pv.y : ped.y;
    if (!water(world, x, y) && !(pv && pv.def.kind === 'boat')) continue;
    const d = Math.hypot(x - v.x, y - v.y);
    if (d < bd && world.time - (p.seenAt || -99) < 6) { bd = d; best = { p, x, y, d }; }
  }
  return best;
}

export function update(world, dt) {
  if (world.tick % 20 === 17) manage(world);
  for (const v of world.entities.values()) {
    if (v.kind !== K.VEH || !v.ai || v.wreckAt) continue;
    const ai = v.ai;
    if ((ai.kind === 'boater' || ai.kind === 'pboat' || ai.kind === 'fisher') && ai.gone && !inAnyView(world, v.x, v.y, 120) && !v.seats.some((sid) => sid && world.get(sid)?.player)) {   // (jammed again and again: given up, once out of sight)
      rodDown(world, ai);
      for (const sid of v.seats) { const q = sid && world.get(sid); if (q && q.npc) despawnNpc(world, q); }
      world.remove(v);
      continue;
    }
    if ((ai.kind === 'boater' || ai.kind === 'pboat' || ai.kind === 'fisher') && v.seats[0] && world.get(v.seats[0])?.player) { rodDown(world, ai); v.ai = null; v.despawnable = true; v.sirenOn = false; continue; } // taken over by a player
    if (ai.kind === 'boater') {
      const drv = world.get(v.seats[0]);
      if (!drv || drv.dead) { v.ai = null; v.despawnable = true; continue; }
      if (ai.lost) { ai.lost = false; ai.to = nextPoint(world, v, 300, 1100); }   // (jammed: somewhere else)
      if (!ai.to || Math.hypot(ai.to.x - v.x, ai.to.y - v.y) < 120) ai.to = nextPoint(world, v);
      if (ai.to) boatSteer(world, v, ai.to.x, ai.to.y, ai.speed);
    } else if (ai.kind === 'fisher') {
      const drv = world.get(v.seats[0]);
      if (!drv || drv.dead || drv.id !== ai.drv) { rodDown(world, ai); v.ai = null; v.despawnable = true; continue; }
      if (ai.lost) { ai.lost = false; if (ai.to) { ai.to = null; ai.until = world.time + FISH_S[0]; } }   // (jammed rowing on: fishes where it got to)
      if (ai.to) {   // rowing on to the next spot
        drv.fishing = null;
        if (Math.hypot(ai.to.x - v.x, ai.to.y - v.y) < 70) { ai.to = null; ai.until = world.time + FISH_S[0] + rng() * (FISH_S[1] - FISH_S[0]); }
        else boatSteer(world, v, ai.to.x, ai.to.y, FISH_ROW);
      } else {       // sat still, the rod out over the side
        v.input = { throttle: 0, steer: 0, hb: false };
        if (Math.hypot(v.vx, v.vy) < 30) { if (!drv.fishing) drv.fishing = { npc: true }; drv.a = v.a + Math.PI / 2; }
        if (world.time > ai.until) { const n = ai.pocket ? null : nextFishSpot(world, v); if (n) { ai.to = n; drv.fishing = null; } else ai.until = world.time + FISH_S[0]; }
      }
    } else if (ai.kind === 'pboat') {
      const crew = v.seats.map((s) => s && world.get(s)).filter((c) => c && !c.dead && c.npc);
      if (!crew.length) { v.ai = null; v.despawnable = true; v.sirenOn = false; continue; }
      const q = quarry(world, v);
      if (q) {
        v.sirenOn = true;
        boatSteer(world, v, q.x, q.y, q.d < 200 ? 120 : 600);
        // at 3+ stars the crew opens fire from the boat
        if (q.p.wanted >= 3 && q.d < 380 && world.map.los(v.x, v.y, q.x, q.y)) {
          for (const c of crew) {
            if (world.time < (c.npc.nextShot || 0)) continue;
            c.npc.nextShot = world.time + 0.6 + rng() * 0.6;
            c.aimAngle = Math.atan2(q.y - v.y, q.x - v.x);
            combat.tryAttack(world, c, c.aimAngle);
          }
        }
      } else {
        v.sirenOn = false;
        if (ai.lost) { ai.lost = false; ai.to = nextPoint(world, v, 300, 1100); }   // (jammed: somewhere else)
        if (!ai.to || Math.hypot(ai.to.x - v.x, ai.to.y - v.y) < 140) ai.to = nextPoint(world, v, 600, 1600);
        if (ai.to) boatSteer(world, v, ai.to.x, ai.to.y, 300);
      }
    }
  }
  void dt;
}
