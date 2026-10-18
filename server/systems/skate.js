// Skateboarding, part 1 (the owner, 2026-10-17): riding a board. A skateboard (shared/items.js: a tool, never used up)
// is carried in the bag; the vehicle button - when there's no vehicle to get into - or the bag hops you on where you
// stand, and the vehicle button again steps you off. On it you push, carve, coast, brake and ollie (shared/physics.js
// BOARD, boardStep: the client predicts it the same way). It rolls on anything paved and on the docks; on grass, dirt or
// sand the wheels dig in and you step off. Run into a wall, a post or a car hard and you bail: thrown down, a little hurt,
// the board shooting off ahead of you (the 'bail' event). Knocked down any other way, into the water, a vehicle or a
// building, cuffed, on a train: off the board. Tricks, grinds and the skate parks are parts 2 and 3.
// On the wire: the rider's descriptor carries gt 'skate', pp 'board' and bd (net.js); the pushing frames ride on the SPRINT
// flag and the ollie on ROLL (players.js pedFlags); the snapshot's self flags tell the rider's own page (net.js: 64 on a
// board, 128 in the rain).
import { T } from '../../shared/constants.js';
import { WATER_T } from '../../shared/mapcore.js';
import { BOARD, boardGround } from '../../shared/physics.js';
import { BAIL, SKATEBOARD_PRICE } from '../../shared/rules.js';
import * as combat from './combat.js';
import * as dance from './dance.js';

export const has = (p) => !!(p && p.profile && (p.profile.inventory.skateboard || 0) > 0);
export const riding = (ped) => !!(ped && ped.board);
const NOTE_S = 30;   // (the same note about rough ground at most this often)

function setLook(ped, on) {
  if (on) { ped.gt = 'skate'; ped.pp = 'board'; }
  else { if (ped.gt === 'skate') ped.gt = null; if (ped.pp === 'board') ped.pp = null; }
  ped.appVer = (ped.appVer || 0) + 1;
}
const tileUnder = (world, ped) => world.map.tileAtPx(ped.x, ped.y);
const floored = (world, ped) => world.time < (ped.downUntil || 0) || world.time < (ped.stunUntil || 0) || world.time < (ped.tumbleUntil || 0) || world.time < (ped.airUntil || 0);

// Why you can't get on here (null: you can)
export function blocked(world, p, ped) {
  if (!has(p)) return `You need a skateboard - Kickflip Skate Co., the sports shops and the surf shops sell them ($${SKATEBOARD_PRICE}).`;
  if (!ped || ped.dead || ped.vehId || ped.onTrain || ped.hoodOf || ped.cuffed || ped.hidden || ped.sit || ped.sitBench) return 'Not right now.';
  if (floored(world, ped)) return 'Get up first.';
  if (ped.carrying) return 'Put the crate down first.';
  if (ped.fishing) return 'Reel your line in first.';
  if (ped.ug) return 'Not down here.';
  const t = tileUnder(world, ped);
  if (WATER_T[t]) return 'Not in the water.';
  if (t === T.FLOOR || t === T.COUNTER) return 'Not indoors - ride it outside.';
  if (boardGround(t) === 2) return 'Too rough to ride here - find a road, a pavement or a plaza.';
  return null;
}

export function hopOn(world, p, ped) {
  const why = blocked(world, p, ped);
  if (why) { world.notify(p, why, 'warn'); return false; }
  dance.stop(ped);
  ped.board = { since: world.time, rough: 0 };
  ped.rollT = 0; ped.rdx = 0; ped.rdy = 0; ped.push = false; ped.boardHit = 0;
  if (Math.hypot(ped.vx, ped.vy) > 20) ped.a = Math.atan2(ped.vy, ped.vx);   // (the deck the way you were going)
  setLook(ped, true);
  world.emit(ped.x, ped.y, { e: 'boardon', id: ped.id, x: ped.x, y: ped.y });
  if (!p.profile.boardTold) {
    p.profile.boardTold = 1;
    world.notify(p, 'On your board. The stick pushes and steers (all the way or sprint to push harder), pull it back to brake, the dive button ollies (Space / A / OLLIE). The vehicle button steps off (F / X / CAR).', 'good');
  }
  return true;
}

export function hopOff(world, ped) {
  if (!ped || !ped.board) return;
  ped.board = null; ped.rollT = 0; ped.push = false; ped.boardHit = 0;
  setLook(ped, false);
}

// The bag's "use" (and the vehicle button with nothing to get into): on, or off
export function toggle(world, p) {
  const ped = p.ped;
  if (!ped) return;
  if (ped.board) hopOff(world, ped); else hopOn(world, p, ped);
}

// Thrown off: into a wall, a post or a car at `into` px/s (hurt by how hard), or knocked down by anything (hurt = false:
// whatever knocked you down did its own harm). The board shoots off the way you were going.
export function bail(world, ped, into = 0, hurt = true) {
  if (!ped.board) return;
  const a = ped.a, sp = Math.max(into, Math.hypot(ped.vx, ped.vy));
  hopOff(world, ped);
  world.emit(ped.x, ped.y, { e: 'bail', id: ped.id, x: ped.x, y: ped.y, a: Math.round(a * 100) / 100, v: Math.round(Math.min(400, sp)) });
  if (!hurt) return;
  const k = Math.max(0, Math.min(1, (into - BOARD.bailHit) / (BOARD.pushHard - BOARD.bailHit)));
  ped.downUntil = Math.max(ped.downUntil || 0, world.time + BAIL.downS);
  ped.tumbleUntil = Math.max(ped.tumbleUntil || 0, world.time + 0.4);
  combat.damage(world, ped, Math.round(BAIL.hurt + (BAIL.hurtMax - BAIL.hurt) * k), null, 'fall');
}

// Once a tick, before the input (players.js processInputs): a rider who can't ride any more is off the board - knocked
// down (the board flies), in a vehicle, inside, cuffed, on a train, dead, or the board gone from the bag
export function guard(world, p, ped) {
  if (!ped.board) return;
  if (ped.dead || ped.removed || ped.vehId || ped.hidden || ped.cuffed || ped.onTrain || ped.hoodOf || ped.ug || !has(p)) { hopOff(world, ped); return; }
  if (floored(world, ped)) bail(world, ped, 0, false);
}

// After the step (players.js applyInput): a hard hit throws you off; the water, a doorway or rough ground takes you off
export function after(world, p, ped, dt) {
  if (!ped.board) return;
  if (ped.boardHit) { const into = ped.boardHit; ped.boardHit = 0; bail(world, ped, into); return; }
  const t = tileUnder(world, ped);
  if (WATER_T[t] || t === T.FLOOR || t === T.COUNTER) { hopOff(world, ped); return; }
  // the ollie's pop and its landing (the sounds; the pose rides on the ROLL flag)
  const air = ped.rollT > 0;
  if (air !== !!ped.board.air) { ped.board.air = air; world.emit(ped.x, ped.y, { e: air ? 'ollie' : 'land', id: ped.id, x: ped.x, y: ped.y }); }
  if (air) return;   // (in the air: nothing under the wheels)
  if (boardGround(t) === 2) {
    ped.board.rough += dt;
    if (ped.board.rough >= BAIL.roughS) {
      hopOff(world, ped);
      if (world.time - (p.boardNoteAt ?? -99) > NOTE_S) { p.boardNoteAt = world.time; world.notify(p, 'Too rough to ride - you step off and carry the board.', 'info'); }
    }
  } else ped.board.rough = 0;
}
