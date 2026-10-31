// The big rigs (b8a; the owner's notes part 2: "Big rig trucks on highways, truck driving jobs available to haul goods
// across the world"): a tractor unit (shared/vehicles.js semi) pulls a trailer (trailer: a flatbed with its load as open
// crates; boxtrailer: a box van) hitched at its fifth wheel. The trailer is its own vehicle that's never driven: after
// the physics each tick it's dragged by its kingpin - its rear axle stays where it was and it swings round to point at
// the fifth wheel, so it follows the tractor's path and cuts the corners the way a trailer does (folding at most RIG.jack
// either way). It has the speed it moved at (it shoves what it sweeps into, and what hits it hits it), but the pair never
// collide with each other (vehicles.js pairOf). Backed up with the fifth wheel under a trailer's kingpin, lined up, a
// driver hitches it (Act); stopped, unhitches it. The city's own rigs run the highways (traffic.js: RIG.npc of its
// traffic there), their box trailers gone with them.
//   update(world, dt)               after the physics (world.js SYSTEMS): every hitched trailer dragged along
//   hitch(world, t, tr) / unhitch(world, tr)
//   attachTrailer(world, t, model)  a trailer of that model behind tractor t, hitched -> it | null (no room)
//   trailerOf(world, t)             the trailer on tractor t, or null
//   straighten(world, t)            the trailer straight behind tractor t again (moved by hand)
//   pairOf(a, b)                    a tractor and its own trailer
//   interaction(world, p)           at the wheel of a rig: hitch the trailer behind you, or unhitch yours
import { K } from '../../shared/constants.js';
import { RIG } from '../../shared/rules.js';
import { VEHICLES } from '../../shared/vehicles.js';
import { CAR_SPAWN_BLOCK } from '../../shared/map.js';

const wrap = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
export const pairOf = (a, b) => (a.hitchTo && a.hitchTo === b.id) || (b.hitchTo && b.hitchTo === a.id);
export function trailerOf(world, t) { const tr = t && t.trailerId ? world.get(t.trailerId) : null; return tr && !tr.removed && tr.hitchTo === t.id ? tr : null; }
// the fifth wheel of tractor t, in the world
export const fifthWheel = (t) => ({ x: t.x + Math.cos(t.a) * t.def.hitch, y: t.y + Math.sin(t.a) * t.def.hitch });
const kingpin = (tr) => ({ x: tr.x + Math.cos(tr.a) * tr.def.hitch, y: tr.y + Math.sin(tr.a) * tr.def.hitch });

export function hitch(world, t, tr) {
  tr.hitchTo = t.id; t.trailerId = tr.id;
  tr.despawnable = false; tr.parked = false;
  (world.rigs ||= new Set()).add(tr.id);
  drag(t, tr, 0);
  world.emit(tr.x, tr.y, { e: 'hitch', x: tr.x, y: tr.y, on: 1 });
}
export function unhitch(world, tr, quiet = false) {
  const t = world.get(tr.hitchTo);
  if (t && t.trailerId === tr.id) t.trailerId = 0;
  tr.hitchTo = 0; tr.vx = 0; tr.vy = 0; tr.av = 0;
  tr.despawnable = !tr.issuedTo && !tr.job;
  if (world.rigs) world.rigs.delete(tr.id);
  if (!quiet) world.emit(tr.x, tr.y, { e: 'hitch', x: tr.x, y: tr.y, on: 0 });
}

// the trailer dragged by its kingpin to the fifth wheel (dt 0: just set where it hangs)
function drag(t, tr, dt) {
  const H = fifthWheel(t), ax = tr.def.axle, kp = tr.def.hitch;
  const rx = tr.x + Math.cos(tr.a) * ax, ry = tr.y + Math.sin(tr.a) * ax;
  let a = Math.atan2(H.y - ry, H.x - rx);
  if (!(Math.hypot(H.x - rx, H.y - ry) > 1)) a = tr.a;
  const rel = wrap(a - t.a);
  if (Math.abs(rel) > RIG.jack) a = t.a + Math.sign(rel) * RIG.jack;   // (folded as far as it goes)
  const ox = tr.x, oy = tr.y;
  tr.a = wrap(a);
  tr.x = H.x - Math.cos(tr.a) * kp; tr.y = H.y - Math.sin(tr.a) * kp;
  tr.lz = t.lz || 0;
  if (dt > 0) { tr.vx = (tr.x - ox) / dt; tr.vy = (tr.y - oy) / dt; } else { tr.vx = t.vx; tr.vy = t.vy; }
  tr.av = 0;
  tr.input = { throttle: 0, steer: 0, hb: false };
  tr.lights = !!t.lights; tr.brake = !!t.brake;
}

// tractor t moved by hand (a teleport, the dev menu): its trailer straight out behind it again
export function straighten(world, t) {
  const tr = trailerOf(world, t);
  if (!tr) return;
  tr.a = t.a;
  drag(t, tr, 0);
  world.place(tr);
}
export function update(world, dt) {
  if (!world.rigs || !world.rigs.size) return;
  for (const id of [...world.rigs]) {
    const tr = world.get(id);
    if (!tr || tr.removed || !tr.hitchTo) { world.rigs.delete(id); continue; }
    const t = world.get(tr.hitchTo);
    if (!t || t.removed || t.trailerId !== tr.id) {   // the tractor's gone: the city's own trailer with it; a job's left standing
      if (tr.npcRig && !tr.issuedTo) { world.rigs.delete(id); world.remove(tr); continue; }
      unhitch(world, tr, true); continue;
    }
    if (t.wreckAt || t.sinkAt) { unhitch(world, tr); continue; }
    drag(t, tr, dt);
    world.place(tr);
  }
}

// a trailer of `model` straight behind tractor t, hitched: null where there's no room (a wall, a vehicle)
export function attachTrailer(world, t, model = 'boxtrailer', opts = {}) {
  const def = VEHICLES[model], c = Math.cos(t.a), s = Math.sin(t.a), H = fifthWheel(t);
  const x = H.x - c * def.hitch, y = H.y - s * def.hitch;
  for (const f of [-0.5, 0, 0.5]) for (const g of [-0.45, 0.45]) {
    const px = x + c * def.L * f - s * def.W * g, py = y + s * def.L * f + c * def.W * g;
    if (CAR_SPAWN_BLOCK[world.map.tileAtPx(px, py)] && !opts.anyGround) return null;
  }
  if (world.query(x, y, def.L / 2 + 10, K.VEH).some((q) => q !== t && Math.hypot(q.x - x, q.y - y) < def.L / 2 + q.def.L / 2 - 30 && !(opts.ignore && opts.ignore.includes(q)))) return null;
  const tr = world.spawnVehicle(model, x, y, t.a, { npcOwned: !!opts.npc, paint: opts.paint });
  tr.npcRig = !!opts.npc;
  hitch(world, t, tr);
  return tr;
}

// at the wheel of a rig, stopped: hitch the trailer whose kingpin is over the fifth wheel, or let yours go
export function interaction(world, p) {
  const ped = p.ped, t = ped && ped.vehId ? world.get(ped.vehId) : null;
  if (!t || !t.def.hitch || t.def.trailer || ped.seat !== 0 || Math.hypot(t.vx, t.vy) > 25) return null;
  const mine = trailerOf(world, t);
  if (mine) {
    if (mine.job && mine.job.pid === p.pid) return null;   // (a load on its way: delivered at the buyer - truckjob.js)
    return { label: `Unhitch the ${mine.def.name}`, run: () => unhitch(world, mine) };
  }
  const H = fifthWheel(t);
  for (const tr of world.query(H.x, H.y, 260, K.VEH)) {
    if (!tr.def.trailer || tr.hitchTo || tr.wreckAt) continue;
    const k = kingpin(tr);
    if (Math.hypot(k.x - H.x, k.y - H.y) > RIG.hitchR || Math.abs(wrap(tr.a - t.a)) > RIG.hitchA) continue;
    return { label: `Hitch the ${tr.def.name}`, run: () => { if (!tr.hitchTo) hitch(world, t, tr); } };
  }
  return null;
}
