// Fire on people (H58; the owner, 2026-10-11: "NPCs and players catch on fire if they are near an explosion or their
// vehicle blows up or they run into fire. NPCs run for it and either run off screen or run then stop, drop and roll, or
// they just fall to the ground and burn to death. If NPCs are near water there's a chance they'll run to the water and
// jump in to put themselves out. Rain makes the fire go out faster. Player characters: you want to roll on the ground to
// put yourself out, running around on fire makes you go out but a little slower, jumping in water puts you out
// immediately.")
//
// Someone on fire has ped.burnT > 0 (the seconds the fire has left in it, standing still in the dry) and is in
// world.burning. What sets people alight (ignite): a blast (combat.blast: the nearer its heart the likelier - blastCatch),
// their vehicle blowing up with them in it (vehicles.js blownOut), a fire arrow (combat.js stepArrow), and brushing
// against fire - a burning vehicle or wreck, a lit campfire, someone else alight (contacts, every few ticks). While it
// burns it takes BURN.dps a second (shared/rules.js; a player's grit divides it) and goes out by itself in BURN.secs -
// faster running about (run), much faster with a dive roll on the ground (roll), faster again in the rain (rain), and
// at once in the water. A player's death by it says so on the death screen (combat.js kill: 'fire').
// An NPC (npcCatch) panics: near water, most run for it and jump in; otherwise they run off as far as they can, or run
// a moment and then stop, drop and roll (down, rolling side to side: out in BURN.rollS), or stagger a few steps and
// fall, burning where they lie until they die. npc.js hands a burning NPC's steps to npcStep. The clients see the burn
// bit on the ped's record (net.js: the parent field's top bit) and put flames and smoke on the body; 'ignite', 'scream'
// and 'douse' events carry the sounds.
import { K, T, TILE, WEATHER } from '../../shared/constants.js';
import { isSwimming, WATER_T, PED_BLOCK } from '../../shared/map.js';
import { coverAtPx } from '../../shared/tunnels.js';
import { BURN } from '../../shared/rules.js';
import * as combat from './combat.js';
import * as campfires from './campfires.js';
import * as explosions from './explosions.js';
import * as npc from './npc.js';

export const burning = (ped) => (ped.burnT || 0) > 0;
const span = (world, [a, b]) => a + (b - a) * world.rand();

// Set someone alight: by who did it (a ped, or null), secs how long it burns if left alone. False if they can't catch
// (in a vehicle, in the water, an animal, indoors). Already burning: it burns on at least that long.
export function ignite(world, ped, by = null, secs = BURN.secs) {
  if (!ped || ped.kind !== K.PED || ped.dead || ped.wild || ped.pet || ped.hidden || ped.interior || ped.vehId || ped.onTrain || ped.cellSafe) return false;
  if (isSwimming(world.map, ped)) return false;
  const was = burning(ped);
  ped.burnT = Math.max(ped.burnT || 0, secs);
  if (by && by !== ped) ped.burnBy = by.id;
  if (was) return true;
  ped.burnAt = world.time; ped.screamAt = world.time + span(world, BURN.screamS);
  (world.burning ||= new Set()).add(ped);
  world.emit(ped.x, ped.y, { e: 'ignite', id: ped.id, x: Math.round(ped.x), y: Math.round(ped.y) });
  if (ped.player) { world.notify(ped.player, 'You\'re on fire! Dive-roll on the ground to put it out - or jump in the water.', 'bad'); ped.player.meDirty = true; }
  if (ped.npc && ped.npc.role !== 'cop' && ped.npc.role !== 'medic') npcCatch(world, ped);
  return true;
}

// Put it out (how: 'water' hisses).
export function douse(world, ped, how = '') {
  if (!burning(ped)) return;
  ped.burnT = 0;
  if (world.burning) world.burning.delete(ped);
  if (how === 'water') world.emit(ped.x, ped.y, { e: 'douse', x: Math.round(ped.x), y: Math.round(ped.y) });
  if (ped.player && !ped.dead) { world.notify(ped.player, how === 'water' ? 'The water puts the flames out.' : 'The flames are out.', 'good'); ped.player.meDirty = true; }
  const n = ped.npc;
  if (n && n.burn) {
    const B = n.burn;
    n.burn = null;
    if (!ped.dead && B.k !== 'fall') { ped.downUntil = Math.min(ped.downUntil || 0, world.time + 0.6); n.state = 'flee'; n.fx = B.fx; n.fy = B.fy; n.until = world.time + 4 + world.rand() * 4; }   // (shaken: on they run a while)
  }
}

// A blast at (x, y) reaching r caught ped at f (1 its heart .. 0 its edge): alight, likelier the nearer.
export function blastCatch(world, ped, f, by) {
  if (f > 0 && world.rand() < BURN.blast * Math.min(1, f * 1.5)) ignite(world, ped, by, BURN.secs * (0.7 + 0.5 * f));
}

// The nearest open water within r px of (x, y) a burning NPC could run into (the middle of the tile), or null
export function waterNear(map, x, y, r) {
  const cx = Math.floor(x / TILE), cy = Math.floor(y / TILE), R = Math.ceil(r / TILE);
  for (let k = 1; k <= R; k++) {
    let best = null, bd = Infinity;
    for (let dy = -k; dy <= k; dy++) for (let dx = -k; dx <= k; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== k || WATER_T[map.tileAt(cx + dx, cy + dy)] !== 1) continue;
      const px = (cx + dx + 0.5) * TILE, py = (cy + dy + 0.5) * TILE, d = (px - x) * (px - x) + (py - y) * (py - y);
      if (d < bd && d <= r * r) { bd = d; best = { x: px, y: py }; }
    }
    if (best) return best;
  }
  return null;
}

// An NPC catching fire: what they do about it (the plan, n.burn: k 'water' | 'run' | 'roll' | 'fall'; until: when a
// roll or a fall comes; fx, fy: where it came from - they run away from it)
function npcCatch(world, ped) {
  const n = ped.npc, now = world.time;
  const w = world.rand() < BURN.water ? waterNear(world.map, ped.x, ped.y, BURN.waterPx) : null;
  const r = world.rand(), P = BURN.npc;
  const k = w ? 'water' : r < P.run ? 'run' : r < P.run + P.roll ? 'roll' : 'fall';
  const a = world.rand() * Math.PI * 2;
  n.burn = { k, wx: w ? w.x : 0, wy: w ? w.y : 0, a, fx: ped.x - Math.cos(a) * 40, fy: ped.y - Math.sin(a) * 40, until: now + (k === 'roll' ? span(world, BURN.rollAfter) : k === 'fall' ? span(world, BURN.fallAfter) : 1e9), down: false };
  n.state = 'burn';
  ped.handsUp = false;
  if (ped.filming) ped.filming = 0;
}

// A burning NPC's step (npc.js update: while n.burn): running for the water, or away in a panic - zig-zagging,
// turning off walls
export function npcStep(world, ped, now) {
  const B = ped.npc.burn;
  if (B.k === 'water') {
    const d = Math.hypot(B.wx - ped.x, B.wy - ped.y);
    if (d > 4) return npc.seek(ped, B.wx, B.wy, true);
  }
  const a = B.a + Math.sin(now * 2.6 + ped.id) * 0.6;
  const tx = ped.x + Math.cos(a) * 80, ty = ped.y + Math.sin(a) * 80;
  if (PED_BLOCK[world.map.tileAtPx(ped.x + Math.cos(a) * 26, ped.y + Math.sin(a) * 26)]) B.a += 0.9 + world.rand() * 0.8;
  return npc.seek(ped, tx, ty, true);
}

// Brushing against fire (every CONTACT_TICKS ticks): a burning vehicle or a fresh wreck still alight, a lit campfire,
// someone else on fire
const CONTACT_TICKS = 4;
function contacts(world, dt) {
  const now = world.time, p = BURN.touch * dt;
  for (const v of world.entities.values()) {
    if (v.kind !== K.VEH || v.def.pedal || !(v.burnUntil > now || (v.wreckAt && now - v.wreckAt < 20))) continue;
    for (const q of world.query(v.x, v.y, v.def.L / 2 + BURN.vehPx + 12, K.PED)) {
      if (!burning(q) && !q.vehId && explosions.bodyDist(v, q.x, q.y) < BURN.vehPx && world.rand() < p) ignite(world, q, null);
    }
  }
  for (const i of campfires.fireIdx(world.map)) {
    const c = world.map.props[i];
    if (!c || c.broken || !campfires.isLit(world, i)) continue;
    for (const q of world.query(c.x, c.y, BURN.campPx, K.PED)) if (!burning(q) && !q.sit && Math.hypot(q.x - c.x, q.y - c.y) < BURN.campPx && world.rand() < p) ignite(world, q, null, BURN.secs * 0.6);
  }
  for (const b of world.burning) {
    if (b.dead) continue;
    for (const q of world.query(b.x, b.y, BURN.pedPx, K.PED)) if (q !== b && !burning(q) && Math.hypot(q.x - b.x, q.y - b.y) < BURN.pedPx && world.rand() < p * 0.5) ignite(world, q, b.burnBy ? world.get(b.burnBy) : null, BURN.secs * 0.7);
  }
}

export function update(world, dt) {
  if (!world.burning) world.burning = new Set();
  if (world.tick % CONTACT_TICKS === 0) contacts(world, dt * CONTACT_TICKS);
  if (!world.burning.size) return;
  const now = world.time, rain = world.weather === WEATHER.RAIN;
  for (const ped of [...world.burning]) {
    if (ped.removed || !world.get(ped.id)) { world.burning.delete(ped); continue; }
    if (ped.dead) { ped.burnT -= dt; if (ped.burnT <= 0) douse(world, ped); continue; }   // (a body burns on a little)
    if (ped.vehId || ped.hidden || ped.interior) { douse(world, ped); continue; }        // (got in a car, went inside: out)
    if (isSwimming(world.map, ped)) { douse(world, ped, 'water'); continue; }
    const n = ped.npc, B = n && n.burn;
    // how fast it burns out: standing still, running about, rolling on the ground; the rain on top
    const sp = Math.hypot(ped.vx, ped.vy);
    let rate = ped.rollT > 0 ? BURN.roll : sp > 60 ? BURN.run : 1;
    if (B && B.k === 'roll' && B.down) rate = BURN.roll * 0.6;
    if (B && B.k === 'fall' && B.down) rate = 0;                                              // (down and burning: it doesn't go out)
    if (rain && !coverAtPx(world.map, ped.x, ped.y)) rate *= BURN.rain;
    ped.burnT -= dt * rate;
    if (B && B.k === 'fall' && B.down) ped.burnT = Math.max(ped.burnT, 1);
    // an NPC's plan: stop, drop and roll - or down for good
    if (B && !B.down && now >= B.until) {
      B.down = true;
      ped.vx = 0; ped.vy = 0;
      if (B.k === 'roll') ped.downUntil = now + BURN.rollS;
      else { ped.downUntil = now + 1e5; ped.bleeding = false; }
    }
    if (B && B.down && B.k === 'roll') {   // rolling side to side on the ground
      const s = Math.floor((now - B.until) / 0.45) % 2 ? 1 : -1, a = ped.a + Math.PI / 2;
      ped.vx = Math.cos(a) * 75 * s; ped.vy = Math.sin(a) * 75 * s;
      if (now >= ped.downUntil) { douse(world, ped); continue; }
    }
    if (ped.burnT <= 0) { douse(world, ped); continue; }
    // the screams
    if (now >= (ped.screamAt || 0)) { ped.screamAt = now + span(world, BURN.screamS); world.emit(ped.x, ped.y, { e: 'scream', x: Math.round(ped.x), y: Math.round(ped.y), id: ped.id }); }
    // it hurts
    if (ped.player && (ped.player.invincible || now < (ped.protectUntil || 0))) continue;
    const by = ped.burnBy ? world.get(ped.burnBy) : null;
    const dps = B && B.k === 'fall' && B.down ? BURN.fallDps : BURN.dps;
    ped.hp -= dps * dt / combat.gritOf(ped, 'fire');
    ped.lastHitAt = now;
    if (ped.player && world.tick % 10 === 0) ped.player.meDirty = true;
    if (ped.hp <= 0) { ped.hp = 0; combat.kill(world, ped, by && !by.dead ? by : null, 'fire'); ped.burnT = Math.max(ped.burnT, 4); }   // (the body burns on a few seconds)
  }
}
