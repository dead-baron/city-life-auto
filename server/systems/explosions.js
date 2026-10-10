// A vehicle blowing up (task #363): the blast sized by the vehicle (a motorbike small, a truck big, a fuel tanker
// huge: shared/explosions.js blastSize), and the explosion's plan from a seed - it burns where it stands, it blows
// apart into pieces (doors, the hood, wheels: the clients throw them from the seed), or the wreck is blown up into
// the air. Up in the air the server carries it along the ground to where it lands (never through a wall); the
// clients lift and spin it over that path from the same seed, so it comes down where the server put it. Landing,
// it slams down: a small blast of its own, which can set off a car it lands on or beside (a chain reaction).
// Huge blasts and chain reactions (task #398, below; the owner: "Vehicles carrying oil or explosives make HUGE
// explosions; vehicles nearby likely blow up too; NPCs in range are sent flying"): a fuel tanker, or anything carrying
// crates of explosives, goes up much bigger and throws people harder; most of the vehicles round it go up too, a beat
// apart and the nearest first, each its own explosion through vehicles.explode - and what they set off goes up in turn,
// never more than a chain's caps (shared/rules.js CHAIN_GENS links deep, CHAIN_MAX in all).
import { K } from '../../shared/constants.js';
import { CAR_BLOCK } from '../../shared/map.js';
import { blastSize, boomPlan, pieceCodes } from '../../shared/explosions.js';
import { wheelPlan } from '../../shared/wheelpath.js';
import { obbVsObb } from '../../shared/math.js';
import { CHAIN_K, CHAIN_DELAY_S, CHAIN_GAP_S, CHAIN_GENS, CHAIN_MAX, ARMORED_VEHICLES } from '../../shared/rules.js';
import * as combat from './combat.js';
import * as vehicles from './vehicles.js';

export function newSeed(world) { return 1 + Math.floor(world.rand() * 2147483646); }

// A crate of explosives: its label (the clients draw a crate with it red and hazard-striped: art2/game/actors.js).
// Aboard a vehicle they make its blast a huge one, bigger the more there are (shared/explosions.js blastSize): one
// crate's blast reaches EXPLOSIVES_BLAST.r px, each more adds .per, up to .max (shared/rules.js); a fuel tanker's is
// TANKER_BLAST. A load bigger than a tanker's is the biggest of all (big 4). The huge ones throw people and shove
// vehicles BLAST_FLING times harder (combat.blast). A flatbed in the traffic carries a load now and then (traffic.js);
// anyone can take the crates off it, and nobody buys them.
export const EXPLOSIVES = 'Explosives';

// how many crates of explosives ride on it, and so how big its blast is
export function explosivesOn(world, v) {
  let n = 0;
  for (const id of v.cargo) { const c = id ? world.get(id) : null; if (c && c.label === EXPLOSIVES) n++; }
  return n;
}
export const blastOf = (world, v) => blastSize(v.def, explosivesOn(world, v));

// The explosion's event (and the wreck's flight when the plan launches it); the blast itself is vehicles.explode's.
// The explosives it carries go up with it (not spilled: they're what makes it so big).
export function vehicleBoom(world, v, attackerPed) {
  const size = blastOf(world, v), big = size.big;
  let seed = newSeed(world);
  const want = (sd) => { const pl = boomPlan(sd, v.def, big); return (v.boomKind === undefined || pl.k === v.boomKind) && (!v.boomWheel || !!wheelPlan(sd, v.def, pl)); };
  if (v.boomKind !== undefined || v.boomWheel) for (let i = 0; i < 300 && !want(seed); i++) seed = newSeed(world);   // (dev.js 'boom': a chosen kind, a wheel coming off)
  const plan = boomPlan(seed, v.def, big);
  const ev = { e: 'explode', x: Math.round(v.x), y: Math.round(v.y), r: size.r, b: big, s: seed, id: v.id, m: v.def.i, a: +v.a.toFixed(2), k: plan.k, pc: pieceCodes(plan) };
  // now and then a burning wheel comes off and rolls away (task #412, shared/wheelpath.js): the clients roll it from the
  // seed - said here only where it can (down on the ground: not up on the highway or a ferry's deck)
  if (!v.onDeck && !v.ferry && !((v.lz || 0) > 0.3) && wheelPlan(seed, v.def, plan)) ev.wh = 1;
  if (plan.launch && v.def.kind !== 'boat' && !v.onDeck && !(v.lz > 0.3)) {
    const land = launch(world, v, plan.launch, attackerPed);
    ev.lx = land.x; ev.ly = land.y;
  } else if (plan.k === 'launch') ev.k = 'pieces';   // (a boat, or up on a deck or a ferry: it blows apart where it is instead)
  for (let i = 0; i < v.cargo.length; i++) { const c = v.cargo[i] ? world.get(v.cargo[i]) : null; if (c && c.label === EXPLOSIVES) { world.remove(c); v.cargo[i] = 0; } }
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
  const size = blastSize(v.def), L = v.chain || newLink();
  world.emit(v.x, v.y, { e: 'wreckland', id: v.id, x: v.x, y: v.y, big: size.big });
  const by = F.by ? world.get(F.by) : null;
  combat.blast(world, v.x, v.y, v.def.L / 2 + 50, 26, by, v.id, false, v.lz || 0, L);
  // a car it lands on (or right beside) goes up too: a chain reaction - the next link of its own chain, a beat later
  for (const o of world.query(v.x, v.y, v.def.L / 2 + 120, K.VEH)) {
    if (o === v || o.wreckAt || o.ferry || o.def.kind === 'boat' || o.def.pedal || o.chain || !room(L)) continue;
    if (obbVsObb(v.x, v.y, v.a, v.def.L / 2 + 8, v.def.W / 2 + 8, o.x, o.y, o.a, o.def.L / 2, o.def.W / 2)) setOff(world, o, L, 1, by);
  }
}

// ---- chain reactions (task #398) ------------------------------------------------------------------------------
// A chain: { n (the vehicles and crates it has set off), at (when the last of them goes up), hot (a huge blast went off
// in it: the rest go up readily) }. Every blast carries its link of one, L = { c: the chain, g: how many links from the
// first blast } - what it sets off is the next link (o.chain = { c, g: L.g + 1 }), and that one's blast carries it on.
// So a chain is bounded however it spreads: CHAIN_GENS links deep and CHAIN_MAX set off at most, its explosions spread
// over a few seconds (a few world.query calls each; nothing runs while they wait).
export const newLink = () => ({ c: { n: 0, at: 0, hot: false }, g: 0 });
const room = (L) => L.g < CHAIN_GENS && L.c.n < CHAIN_MAX;
// o joins the chain as the link after L. It goes up a beat from now, sooner the nearer the blast (f 1 at its heart,
// 0 at its edge: CHAIN_DELAY_S), and never sooner than CHAIN_GAP_S after the one before it in the chain - one after
// another, never all at once (combat.blast hands them over the nearest first, so a chain ripples outward).
function link(world, o, L, f) {
  const C = L.c;
  C.n++;
  C.at = Math.max(world.time + CHAIN_DELAY_S[0] + (CHAIN_DELAY_S[1] - CHAIN_DELAY_S[0]) * (1 - f), C.at + CHAIN_GAP_S);
  o.chain = { c: C, g: L.g + 1 };
  return C.at;
}
// A vehicle set off as the next link: the engine dies, it's on fire at once, and it explodes when its turn comes
// (vehicles.update) - its own wheels, pieces, fires and blast.
function setOff(world, v, L, f, by) {
  const at = link(world, v, L, f);
  vehicles.killEngine(world, v, by);
  v.deadFireAt = world.time; v.deadBoomAt = at;
}

// How far (x, y) is from the nearest part of a vehicle's body (0 inside it): a blast reaches a vehicle's near end first
// - a car parked nose to tail with one going up is right beside it, not a car's length off.
export function bodyDist(v, x, y) {
  const c = Math.cos(v.a), s = Math.sin(v.a), dx = x - v.x, dy = y - v.y;
  return Math.hypot(Math.max(0, Math.abs(dx * c + dy * s) - v.def.L / 2), Math.max(0, Math.abs(dy * c - dx * s) - v.def.W / 2));
}

// A vehicle caught in a blast (combat.blast): f how close its nearest part is (1 at the heart: bodyDist), dmg what the
// blast does to it, by who set it off, L the blast's link, big its size. The vehicle goes up too, as the next link, when:
//  * it was dying already, or the blast finishes it (any blast);
//  * it's a fuel tanker or carries explosives, in the near half of any blast - and goes up huge itself;
//  * in a huge blast (or anywhere in a chain one has heated: L.c.hot) by chance, the nearer the likelier (f x CHAIN_K:
//    certain in the near half of the blast) - but never an armored one (built for it: only what the blast does to it).
// Going up: setOff. Anything else just takes the damage. Once a chain has run its course that's all it does to the
// rest, and it never finishes one off: what it would have finished is left wrecked but running, on CAPPED_LEFT of its
// health (not on its last hit point, where the next bump would set it going - a chain of its own).
export const CAPPED_LEFT = 0.2;
export function blastVehicle(world, v, f, dmg, by, L, big) {
  if (v.chain) return;   // (set off already: it goes up in a moment)
  if (v.def.pedal || v.ferry) { vehicles.damageVehicle(world, v, dmg, by, false, f > 0.5); return; }   // (a bicycle buckles; nothing hurts a ferry)
  const hurt = dmg / vehicles.toughOf(v.def);
  if (by) v.lastAttacker = by.id;
  const goes = v.dead || hurt >= v.hp || (f > 0.5 && blastOf(world, v).big > 2)
    || ((big > 2 || L.c.hot) && !ARMORED_VEHICLES.includes(v.def.id) && world.rand() < f * CHAIN_K);
  if (goes && room(L)) setOff(world, v, L, f, by);
  else if (!v.dead) v.hp = goes ? Math.max(Math.min(v.hp, v.def.hp * CAPPED_LEFT), v.hp - hurt) : v.hp - hurt;   // (not going: hurt < hp)
}

// A crate of explosives caught in a blast, on the ground or in someone's arms (one on a vehicle goes up with it): it goes
// up a beat later, the next link (cargo.update: crateBoom)
export function blastCrate(world, c, f, L, by) {
  if (c.label !== EXPLOSIVES || c.chain || c.state === 'loaded' || f < 0.2 || !room(L)) return;
  c.boomAt = link(world, c, L, f);
  c.by = by ? by.id : 0;
}
export function crateBoom(world, c) {
  const p = c.state === 'carried' ? world.get(c.parent) : null, v = c.state === 'loaded' ? world.get(c.parent) : null;
  if (p && p.carrying === c.id) { p.carrying = 0; if (p.player) p.player.meDirty = true; }
  if (v && v.cargo[c.slot] === c.id) v.cargo[c.slot] = 0;   // (put on a vehicle since: off it, in pieces)
  world.remove(c);
  blastAt(world, c.x, c.y, blastSize(null, 1), c.by ? world.get(c.by) || null : null, c.chain, p ? p.lz || 0 : 0);
}

// An explosion that isn't a vehicle's (a crate going up, the debug menu's test blasts): its event (the clients play
// it by its size, b: shared/explosions.js blastSize) and its blast. size: { r, dmg, big }; z: the level (null: every
// level).
export function blastAt(world, x, y, size, by = null, L = newLink(), z = null) {
  world.emit(x, y, { e: 'explode', x: Math.round(x), y: Math.round(y), r: size.r, b: size.big, s: newSeed(world) });
  combat.blast(world, x, y, size.r, size.dmg, by, 0, false, z, L, size.big);
}
