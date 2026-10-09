// A vehicle blowing up (task #363): the blast sized by the vehicle (a motorbike small, a truck big, a fuel tanker
// huge: shared/explosions.js blastSize), and the explosion's plan from a seed - it burns where it stands, it blows
// apart into pieces (doors, the hood, wheels: the clients throw them from the seed), or the wreck is blown up into
// the air. Up in the air the server carries it along the ground to where it lands (never through a wall); the
// clients lift and spin it over that path from the same seed, so it comes down where the server put it. Landing,
// it slams down: a small blast of its own, which can set off a car it lands on or beside (a chain reaction).
import { K } from '../../shared/constants.js';
import { CAR_BLOCK } from '../../shared/map.js';
import { blastSize, boomPlan, pieceCodes } from '../../shared/explosions.js';
import { obbVsObb } from '../../shared/math.js';
import * as combat from './combat.js';
import * as vehicles from './vehicles.js';

export function newSeed(world) { return 1 + Math.floor(world.rand() * 2147483646); }

// The explosion's event (and the wreck's flight when the plan launches it); the blast itself is vehicles.explode's.
export function vehicleBoom(world, v, attackerPed) {
  const seed = newSeed(world), size = blastSize(v.def), plan = boomPlan(seed, v.def);
  const ev = { e: 'explode', x: Math.round(v.x), y: Math.round(v.y), r: size.r, s: seed, id: v.id, m: v.def.i, a: +v.a.toFixed(2), k: plan.k, pc: pieceCodes(plan) };
  if (plan.launch && !v.onDeck && !(v.lz > 0.3)) {
    const land = launch(world, v, plan.launch, attackerPed);
    ev.lx = land.x; ev.ly = land.y;
  } else if (plan.k === 'launch') ev.k = 'pieces';   // (up on a deck or a ferry: it blows apart where it is instead)
  world.emit(v.x, v.y, ev);
  return { ev, size, plan };
}

// how far it can be thrown that way: the path and the spot it lands on clear of buildings and walls (CAR_BLOCK)
function clearPath(map, x, y, dir, d, def) {
  const c = Math.cos(dir), s = Math.sin(dir), hl = def.L / 2, hw = def.W / 2;
  for (let t = 8; t <= d + 0.01; t += 8) {
    const px = x + c * t, py = y + s * t;
    for (const [ox, oy] of [[0, 0], [hl, 0], [-hl, 0], [0, hw], [0, -hw]]) if (CAR_BLOCK[map.tileAtPx(px + ox, py + oy)]) return false;
  }
  return true;
}

function launch(world, v, L, attackerPed) {
  const dir = v.a + L.a;
  let d = L.d;
  while (d > 0 && !clearPath(world.map, v.x, v.y, dir, d, v.def)) d -= 8;
  d = Math.max(0, d);
  const x1 = Math.round(v.x + Math.cos(dir) * d), y1 = Math.round(v.y + Math.sin(dir) * d);
  v.fly = { x0: v.x, y0: v.y, x1, y1, t0: world.time, t: L.t, by: attackerPed ? attackerPed.id : 0 };
  v.vx = 0; v.vy = 0; v.av = 0;
  return { x: x1, y: y1 };
}

// Up in the air: carried along its path (no physics, nothing hits it); down at the end. True while it flies.
export function flyStep(world, v) {
  const F = v.fly;
  if (!F) return false;
  const k = Math.min(1, (world.time - F.t0) / F.t);
  v.x = F.x0 + (F.x1 - F.x0) * k; v.y = F.y0 + (F.y1 - F.y0) * k;
  v.vx = (F.x1 - F.x0) / F.t; v.vy = (F.y1 - F.y0) / F.t;
  if (k < 1) return true;
  land(world, v);
  return false;
}

// It slams down where the server said it would: a jolt of a blast (people close by thrown, a car under or beside
// it set off), dust and sparks (the 'wreckland' event).
function land(world, v) {
  const F = v.fly;
  v.fly = null;
  v.x = F.x1; v.y = F.y1; v.vx = 0; v.vy = 0; v.av = 0;
  world.place(v);
  const size = blastSize(v.def);
  world.emit(v.x, v.y, { e: 'wreckland', id: v.id, x: v.x, y: v.y, big: size.big });
  const by = F.by ? world.get(F.by) : null;
  combat.blast(world, v.x, v.y, v.def.L / 2 + 50, 26, by, v.id, false, v.lz || 0);
  // a car it lands on (or right beside) goes up too: a chain reaction
  for (const o of world.query(v.x, v.y, v.def.L / 2 + 120, K.VEH)) {
    if (o === v || o.wreckAt || o.ferry || o.def.kind === 'boat' || o.def.pedal) continue;
    if (obbVsObb(v.x, v.y, v.a, v.def.L / 2 + 8, v.def.W / 2 + 8, o.x, o.y, o.a, o.def.L / 2, o.def.W / 2)) vehicles.damageVehicle(world, o, o.hp + 1, by, true, true);
  }
}
