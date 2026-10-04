// Life on the water: NPC boaters cruising between open-sea waypoints, and harbor police patrol
// boats that chase wanted players who take to the water (and shoot back at 3+ stars).
import { K } from '../../shared/constants.js';
import { BOAT_BLOCK } from '../../shared/map.js';
import { angleDiff, clamp } from '../../shared/math.js';
import { vehForwardSpeed } from '../../shared/physics.js';
import { mulberry32 } from '../../shared/rng.js';
import { spawnNpc, despawnNpc } from './npc.js';
import { inAnyView } from '../view.js';
import * as combat from './combat.js';

const rng = mulberry32(6060);
const BOATERS_NEAR = 4;      // NPC boats kept around a player who's out on / by the water
const PATROLS_NEAR = 1;      // police patrol boats around such a player
const NEAR_SEA_PX = 900;     // a player this close to open water counts as "by the water"
const FAR_PX = 2400;         // boats further than this from every player are removed
const MODELS = [['dinghy', 3], ['speedboat', 2], ['jetski', 2]];

const water = (world, x, y) => !BOAT_BLOCK[world.map.tileAtPx(x, y)];
function clearLine(world, x1, y1, x2, y2) {
  const d = Math.hypot(x2 - x1, y2 - y1), n = Math.ceil(d / 48);
  for (let i = 1; i <= n; i++) if (!water(world, x1 + (x2 - x1) * i / n, y1 + (y2 - y1) * i / n)) return false;
  return true;
}

// Steer a boat toward (tx, ty), feeling its way round land ahead.
export function boatSteer(world, v, tx, ty, speed) {
  const want = Math.atan2(ty - v.y, tx - v.x);
  let best = null;
  for (const off of [0, 0.35, -0.35, 0.7, -0.7, 1.1, -1.1, 1.6, -1.6, 2.2, -2.2]) {
    const a = want + off;
    let ok = true;
    for (const d of [50, 100, 160]) if (!water(world, v.x + Math.cos(a) * d, v.y + Math.sin(a) * d)) { ok = false; break; }
    if (ok) { best = a; break; }
  }
  const fwd = vehForwardSpeed(v);
  if (best === null) { v.input = { throttle: -0.6, steer: 0.8, hb: false }; return; }
  const diff = angleDiff(v.a, best);
  const sp = Math.abs(diff) > 1.2 ? Math.min(speed, 160) : speed;
  v.input = { throttle: clamp((sp - fwd) / 120, -1, 1), steer: clamp(diff * 2.2, -1, 1), hb: false };
}

function pickModel() {
  let tot = 0; for (const [, w] of MODELS) tot += w;
  let r = rng() * tot;
  for (const [m, w] of MODELS) { r -= w; if (r <= 0) return m; }
  return 'dinghy';
}

function nextPoint(world, v, minD = 500, maxD = 1500) {
  const pts = world.map.seaPoints || [];
  for (let k = 0; k < 20; k++) {
    const p = pts[Math.floor(rng() * pts.length)];
    if (!p) return null;
    const d = Math.hypot(p.x - v.x, p.y - v.y);
    if (d < minD || d > maxD * 1.6) continue;
    if (clearLine(world, v.x, v.y, p.x, p.y)) return p;
  }
  return pts.reduce((b, p) => { const d = Math.hypot(p.x - v.x, p.y - v.y); return d > 300 && (!b || d < Math.hypot(b.x - v.x, b.y - v.y)) ? p : b; }, null);
}

function spawnPoint(world, a) {
  const pts = (world.map.seaPoints || []).filter((p) => { const d = Math.hypot(p.x - a.x, p.y - a.y); return d > 750 && d < 1400; });
  for (let k = 0; k < 8 && pts.length; k++) {
    const p = pts[Math.floor(rng() * pts.length)];
    if ([...world.players.values()].every((q) => !q.ped || Math.hypot(q.ped.x - p.x, q.ped.y - p.y) > 500) && !inAnyView(world, p.x, p.y, 120) && !world.query(p.x, p.y, 120, K.VEH).length) return p;
  }
  return null;
}

const byWater = (world, x, y) => (world.map.seaPoints || []).some((p) => Math.abs(p.x - x) < NEAR_SEA_PX && Math.abs(p.y - y) < NEAR_SEA_PX && Math.hypot(p.x - x, p.y - y) < NEAR_SEA_PX);

function manage(world) {
  const anchors = [...world.players.values()].filter((p) => p.ped && !p.ped.dead).map((p) => p.ped);
  // tidy up
  for (const v of world.entities.values()) {
    if (v.kind !== K.VEH || !v.ai || (v.ai.kind !== 'boater' && v.ai.kind !== 'pboat')) continue;
    if (v.seats.some((s) => s && world.get(s)?.player)) { v.ai = null; v.despawnable = true; continue; }
    if (anchors.some((a) => Math.hypot(a.x - v.x, a.y - v.y) < FAR_PX)) continue;
    for (const sid of v.seats) { const q = sid && world.get(sid); if (q && q.npc) despawnNpc(world, q); }
    world.remove(v);
  }
  for (const a of anchors) {
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
    if (!ped || ped.dead || ped.hidden || p.wanted <= 0) continue;
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
    if ((ai.kind === 'boater' || ai.kind === 'pboat') && v.seats[0] && world.get(v.seats[0])?.player) { v.ai = null; v.despawnable = true; v.sirenOn = false; continue; } // taken over by a player
    if (ai.kind === 'boater') {
      const drv = world.get(v.seats[0]);
      if (!drv || drv.dead) { v.ai = null; v.despawnable = true; continue; }
      if (!ai.to || Math.hypot(ai.to.x - v.x, ai.to.y - v.y) < 120) ai.to = nextPoint(world, v);
      if (ai.to) boatSteer(world, v, ai.to.x, ai.to.y, ai.speed);
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
        if (!ai.to || Math.hypot(ai.to.x - v.x, ai.to.y - v.y) < 140) ai.to = nextPoint(world, v, 600, 1600);
        if (ai.to) boatSteer(world, v, ai.to.x, ai.to.y, 300);
      }
    }
  }
  void dt;
}
