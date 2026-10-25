// Skateboarding. Part 1 (the owner, 2026-10-17): riding a board. Since 2026-10-24 (the owner: "people will always be
// using skateboards to get around faster ... just making it like other vehicles would work best") a skateboard is a
// vehicle lying in the world (shared/vehicles.js 'skateboard'), not a thing in your bag: a rack of them at each skate
// park, one or two by the skate shops, the surf shops and the boardwalks (boardSpots - free to take, like the shopping
// carts), and your own board, bought at a skate, surf or sports shop and set down beside the door (shop). The vehicle
// button by one steps you on (vehicles.js tryEnter -> mount: the board taken up off the ground), and again steps you off
// (hopOff: it's put down at your feet - yours stays yours; a park's is left lying, gone once nobody's about, and the
// park's rack fills again). On it you push - kick by kick, a little slower than a bike (shared/board.js BOARD: a short
// hop, not a way across town) - carve, coast, brake and ollie (the page predicts it the same way). It rolls on anything
// paved and on the docks; on grass, dirt or sand the wheels dig in and you step off. Run into a wall, a post or a car
// hard and you bail: thrown down, a little hurt, the board shooting off ahead of you (the 'bail' event) - it lands a
// moment later where it stopped. Knocked down any other way, into the water, a vehicle or a building, cuffed, on a train:
// off the board. Your own board left lying where you're nowhere near goes home (tidy): bring it out again at home or at
// a skate shop.
// Parts 2 and 3 (the owner, 2026-10-18: "lets put in the skateboard moves"): the tricks (shared/skate.js - flips, grabs,
// grinds and slides, manuals, the ramps' airs: the step is shared, so the page predicts them) and here their score:
// combos (each trick from an air or a manual to the next, banked when you roll on - shared/rules.js SKATE_SCORE), the
// special meter, the gaps (off a kicker, the pyramid, up a quarter pipe, a street gap over a road), and sessions at the
// skate spots (two minutes, four goals, the spot's best - SKATE_SESSION). Fall off a rail, out of a manual or land a
// flip that isn't round and you bail: the combo's lost.
// On the wire: the rider's descriptor carries gt 'skate', pp 'board' and bd (net.js); the kick's frames ride on the
// SPRINT flag and an air on ROLL (players.js pedFlags), what they're doing on the board on the extra byte (net.js:
// board.code - shared/skate.js TRICKS); the rider's own page gets the board's state in the snapshot's self record
// (shared/physics.js boardOut) and the score in its 'me' (meInfo). A board on the ground is a vehicle like any other.
//   ped.board.deck: the board under you - { owner, ownerName, paint, variant, spot (its rack's place), stolen }
//   profile.board: { paint, variant } - you own a board (a skateboard in an old bag becomes this: convert)
import { T, TILE, K } from '../../shared/constants.js';
import { WATER_T } from '../../shared/mapcore.js';
import { PED_BLOCK } from '../../shared/map.js';
import { BOARD, boardGround } from '../../shared/board.js';   // (loading it puts the board's step in shared/physics.js)
import * as SK from '../../shared/skate.js';
import { BAIL, SKATEBOARD_PRICE, SKATE_SCORE, SKATE_SESSION } from '../../shared/rules.js';
import { PAINTS } from '../../shared/vehicles.js';
import { hash2 } from '../../shared/rng.js';
import { storeOf } from '../../shared/wardrobe.js';
import { inAnyView } from '../view.js';
import { pointGrid } from '../pointgrid.js';
import { store } from '../store.js';
import * as combat from './combat.js';
import * as dance from './dance.js';

export const riding = (ped) => !!(ped && ped.board);
export const owns = (p) => !!(p && p.profile && p.profile.board);
const NOTE_S = 30;   // (the same note about rough ground at most this often)
const NEAR_PX = 1100, HOME_PX = 2000, LAND_S = 1.2;   // (boards set out round a player this near; yours goes home past HOME_PX; a bail's board lands after LAND_S)

function setLook(ped, on) {
  if (on) { ped.gt = 'skate'; ped.pp = 'board'; }
  else { if (ped.gt === 'skate') ped.gt = null; if (ped.pp === 'board') ped.pp = null; }
  ped.appVer = (ped.appVer || 0) + 1;
}
const tileUnder = (world, ped) => world.map.tileAtPx(ped.x, ped.y);
const floored = (world, ped) => world.time < (ped.downUntil || 0) || world.time < (ped.stunUntil || 0) || world.time < (ped.tumbleUntil || 0) || world.time < (ped.airUntil || 0);
// the board's state on the ped (shared/skate.js, shared/physics.js boardStep): all of it cleared on and off
function clearBoard(ped) {
  ped.rollT = 0; ped.rdx = 0; ped.rdy = 0; ped.push = false; ped.boardHit = 0; ped.kp = -1; ped.bm = 0; ped.bg = -1; ped.gh = 0; ped.bb = 0; ped.bT = 0;
  ped.tk = 0; ped.tt = 0; ped.airT = 0; ped.airH = 15; ped.airK = 0; ped.h0 = 0; ped.vg = 0; ped.over = false; ped.skFall = null;
}
const grinding = (ped) => ped.bm === 1 || ped.bm === 3;

// on a building's floor (a walk-in's: the Rusty Spur, a shop) - no riding in there
export const indoors = (world, ped) => { const t = tileUnder(world, ped); return t === T.FLOOR || t === T.COUNTER; };
// Why you can't get on here (null: you can)
export function blocked(world, p, ped) {
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

// On (deck: the board under you - mount gives the one you took up off the ground)
export function hopOn(world, p, ped, deck = {}) {
  const why = blocked(world, p, ped);
  if (why) { world.notify(p, why, 'warn'); return false; }
  dance.stop(ped);
  ped.board = { since: world.time, rough: 0, code: 0, roll: 0, air0: null, deck };
  clearBoard(ped);
  ped.skEv = [];
  if (Math.hypot(ped.vx, ped.vy) > 20) ped.a = Math.atan2(ped.vy, ped.vx);   // (the deck the way you were going)
  setLook(ped, true);
  world.emit(ped.x, ped.y, { e: 'boardon', id: ped.id, x: ped.x, y: ped.y });
  if (!p.profile.boardTold) {
    p.profile.boardTold = 1;
    world.notify(p, 'On your board. The stick pushes and steers (all the way or sprint to push harder), pull it back to brake, the dive button ollies (Space / A / OLLIE). The vehicle button steps you off and leaves the board at your feet (F / X / CAR).', 'good');
  } else if (!p.profile.trickTold) {
    p.profile.trickTold = 1;
    world.notify(p, 'Tricks: the trick button (click / RT / TRICK) pops a flip - the stick picks which - or, held in a big air, a grab. Come down onto a kerb, a ledge, a bench or a rail along it and you grind it: the stick across it keeps your balance. The stick pulled back with the trick button: a manual. Roll on to bank the combo.', 'good');
  }
  return true;
}
// The vehicle button by a board lying on the ground (vehicles.js tryEnter): up off the ground and on it
export function mount(world, p, ped, v) {
  const why = blocked(world, p, ped);
  if (why) { world.notify(p, why, 'warn'); return false; }
  const deck = { owner: v.owner || null, ownerName: v.ownerName || null, paint: v.paint, variant: v.variant, spot: v.boardSpot ?? null, stolen: [...(v.stolenBy || [])] };
  world.remove(v);
  if (deck.spot != null && world.boardParked) world.boardParked.set(deck.spot, ped.id);   // (its rack's place: taken while it's ridden)
  return hopOn(world, p, ped, deck);
}

// Off: the board put down at your feet (drop false: it's gone - the dev menu moving you, a bail's that lands later)
export function hopOff(world, ped, drop = true) {
  if (!ped || !ped.board) return;
  if (ped.player) bank(world, ped.player, ped);
  const deck = ped.board.deck || {};
  ped.board = null; clearBoard(ped); ped.skEv = null;
  setLook(ped, false);
  if (drop) putDown(world, deck, feet(world, ped), ped.a, ped.lz);
}
// beside you (the side the way you face, else behind you, else where you stand) - on open dry ground
function feet(world, ped) {
  const a = ped.a, c = Math.cos(a), s = Math.sin(a);
  for (const [f, r] of [[0, 17], [0, -17], [-20, 0]]) { const x = ped.x + c * f - s * r, y = ped.y + s * f + c * r; if (lieOk(world.map, x, y, a)) return { x, y }; }
  return { x: ped.x, y: ped.y };
}
const lieOk = (m, x, y, a) => { for (const k of [-11, 0, 11]) { const t = m.tileAtPx(x + Math.cos(a) * k, y + Math.sin(a) * k); if (PED_BLOCK[t] || WATER_T[t]) return false; } return true; };
// A board on the ground: yours stays yours (yours lying about - tidy - and nobody else's to take without it being theft);
// a park's left lying is nobody's (gone once nobody's about - traffic.js manage - and its rack fills again). In the water
// it's gone (yours: home again).
function putDown(world, deck, at, a, lz = 0) {   // (lz: up on a bridge's deck, an overpass - as you were)
  const m = world.map, t = m.tileAtPx(at.x, at.y);
  const owner = deck.owner && world.players.get(deck.owner);
  if (WATER_T[t] || PED_BLOCK[t]) { if (owner) world.notify(owner, 'Your skateboard went in the water - it\'s back home: take it out at home or at a skate shop.', 'info'); return null; }
  const v = world.spawnVehicle('skateboard', at.x, at.y, a, { npcOwned: false, paint: deck.paint, variant: deck.variant, owner: deck.owner || null, ownerName: deck.ownerName || null });
  v.parked = false; v.despawnable = !deck.owner; v.lz = lz || 0;
  if (deck.stolen && deck.stolen.length) v.stolenBy = new Set(deck.stolen);
  if (deck.spot != null) { v.boardSpot = deck.spot; if (world.boardParked) world.boardParked.set(deck.spot, v.id); }
  return v;
}

// Once a tick, before the input (players.js processInputs): a rider who can't ride any more is off the board - knocked
// down (the board flies), in a vehicle, inside, cuffed, on a train, dead
export function guard(world, p, ped) {
  if (!ped.board) return;
  if (ped.dead || ped.removed || ped.vehId || ped.hidden || ped.cuffed || ped.onTrain || ped.hoodOf || ped.ug) { hopOff(world, ped, !ped.removed && !ped.hidden && !ped.ug); return; }
  if (floored(world, ped)) bail(world, ped, 0, false);
}

// Thrown off: into a wall, a post or a car at `into` px/s (hurt by how hard), or knocked down by anything (hurt = false:
// whatever knocked you down did its own harm), or off a rail, out of a manual, a flip not round (a trick's bail). The
// board shoots off the way you were going and lands a moment later where it stops; the combo's lost.
export function bail(world, ped, into = 0, hurt = true) {
  if (!ped.board) return;
  if (ped.player) lose(world, ped.player, ped);
  const a = ped.a, sp = Math.max(into, Math.hypot(ped.vx, ped.vy)), deck = ped.board.deck || {};
  hopOff(world, ped, false);
  world.emit(ped.x, ped.y, { e: 'bail', id: ped.id, x: ped.x, y: ped.y, a: Math.round(a * 100) / 100, v: Math.round(Math.min(400, sp)) });
  // where it comes to rest: as far as it flies (the page's: 60 px/s and more, slowing over its 1.6 s), short of a wall
  const far = Math.min(150, 30 + sp * 0.3);
  let to = { x: ped.x, y: ped.y };
  for (let d = 0; d <= far; d += 8) { const x = ped.x + Math.cos(a) * d, y = ped.y + Math.sin(a) * d; if (!lieOk(world.map, x, y, a)) break; to = { x, y }; }
  (world.boardLand ||= []).push({ at: world.time + LAND_S, deck, x: to.x, y: to.y, a, lz: ped.lz || 0 });
  if (!hurt) return;
  const k = Math.max(0, Math.min(1, (into - BOARD.bailHit) / (BOARD.pushHard - BOARD.bailHit)));
  ped.downUntil = Math.max(ped.downUntil || 0, world.time + BAIL.downS);
  ped.tumbleUntil = Math.max(ped.tumbleUntil || 0, world.time + 0.4);
  combat.damage(world, ped, Math.round(BAIL.hurt + (BAIL.hurtMax - BAIL.hurt) * k), null, 'fall');
}

// After the step (players.js applyInput): a hard hit throws you off, and so does a trick gone wrong; the water, a doorway
// or rough ground takes you off; what the tricks did this step scores (score)
export function after(world, p, ped, dt) {
  if (!ped.board) return;
  if (ped.boardHit) { const into = ped.boardHit; ped.boardHit = 0; bail(world, ped, into); return; }
  if (ped.skFall) { ped.skFall = null; ped.skEv = []; bail(world, ped, BOARD.bailHit + 40); return; }
  score(world, p, ped, dt);
  if (!ped.board) return;
  ped.board.code = ped.tk >= SK.PENDING ? 0 : ped.tk || 0;   // (what they're doing, on the wire: net.js)
  const t = tileUnder(world, ped);
  if (!grinding(ped) && (WATER_T[t] || t === T.FLOOR || t === T.COUNTER)) { hopOff(world, ped); return; }
  // an air's pop and its landing (the sounds; the pose rides on the ROLL flag; how long and how high: the other pages)
  const air = ped.rollT > 0;
  if (air !== !!ped.board.air) { ped.board.air = air; world.emit(ped.x, ped.y, air ? { e: 'ollie', id: ped.id, x: ped.x, y: ped.y, d: +(ped.airT || BOARD.ollieT).toFixed(2), h: Math.round(ped.airH ?? 15), h0: Math.round(ped.h0 || 0), k: ped.airK || 0 } : { e: 'land', id: ped.id, x: ped.x, y: ped.y }); }
  if (air || grinding(ped)) return;   // (in the air, up on a rail: nothing under the wheels)
  if (boardGround(t) === 2) {
    ped.board.rough += dt;
    if (ped.board.rough >= BAIL.roughS) {
      hopOff(world, ped);
      if (world.time - (p.boardNoteAt ?? -99) > NOTE_S) { p.boardNoteAt = world.time; world.notify(p, 'Too rough to ride - you step off.', 'info'); }
    }
  } else ped.board.rough = 0;
}

// ---- the boards lying about ------------------------------------------------------------------------------------------
// Where boards are set out, worked out once per map (exported for the tests): { x, y, a, kind } - a rack of RACK at each
// skate spot (on its smooth ground clear of the ramps and the rails: the first run found from its south edge), and one
// (the skate shop: two) by the door of each skate shop and surf shop, at a campus and along a beach boardwalk; each by
// the map's hash, some of them only (SPARSE), so they stay few. Never on a road.
const RACK = 3, SPARSE = { park: 1, skate: 1, surf: 0.7, campus: 0.5, boardwalk: 0.5 };
const CAMPUS = /\b(college|university|campus|high school)\b/i, BOARDWALK = /boardwalk/i;
const NO_LIE = new Set([T.ROAD, T.BRIDGE]);
function smooth(m, x, y, a) {
  for (const k of [-13, 0, 13]) for (const w of [-6, 6]) {
    const px = x + Math.cos(a) * k - Math.sin(a) * w, py = y + Math.sin(a) * k + Math.cos(a) * w, t = m.tileAtPx(px, py);
    if (NO_LIE.has(t) || PED_BLOCK[t] || WATER_T[t] || boardGround(t) > 1 || t === T.FLOOR || t === T.COUNTER) return false;
    if (SK.rampSurface(m, px, py) > 0) return false;
  }
  const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
  if (m.solidProps) for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    if (!m.inside(tx + i, ty + j)) return false;
    for (const q of m.solidProps.get(m.idx(tx + i, ty + j)) || []) if (Math.hypot(q.x - x, q.y - y) < (q.r || 8) + 16) return false;
  }
  // (clear of the ledges, the rails and the benches a rider grinds - not the kerbs)
  for (const q of SK.nearby(m, x, y)) {
    if (q.k === 'kerb') continue;
    const t = Math.max(0, Math.min(q.len, (x - q.x0) * q.ux + (y - q.y0) * q.uy));
    if (Math.hypot(q.x0 + q.ux * t - x, q.y0 + q.uy * t - y) < 24) return false;
  }
  return true;
}
export function boardSpots(m) {
  if (m._boardSpots) return m._boardSpots;
  const out = [], keep = (kind, n) => hash2(n, 17, m.seed | 0) < SPARSE[kind];
  (m.skateSpots || []).forEach((q, n) => {
    for (let ty = q.y + q.h - 1; ty >= q.y; ty--) for (let tx = q.x; tx < q.x + q.w; tx++) {
      const x = (tx + 0.5) * TILE, y = (ty + 0.5) * TILE, row = [];
      for (let k = 0; k < RACK; k++) row.push([x, y + k * 13]);
      if (!row.every(([px, py]) => smooth(m, px, py, 0))) continue;
      for (const [px, py] of row) out.push({ x: px, y: py, a: 0, kind: 'park' });
      return;
    }
    void n;
  });
  (m.pois || []).forEach((p, n) => {
    const st = p.kind === 'clothing' ? storeOf(p) : null;
    const kind = st === 'kickflip' ? 'skate' : st === 'surf' ? 'surf' : CAMPUS.test(p.label || '') ? 'campus' : BOARDWALK.test(p.label || '') ? 'boardwalk' : null;
    if (!kind || !keep(kind, n)) return;
    const at = beside(m, p.outside || p, kind === 'skate' ? 2 : 1);
    for (const q of at) out.push({ ...q, kind });
  });
  return (m._boardSpots = out);
}
// n boards side by side on smooth ground by a place (its door): the nearest row of them found, out to 4 tiles
function beside(m, p, n) {
  for (let r = 1.5; r <= 4; r += 0.5) for (let k = 0; k < 12; k++) {
    const g = (k / 12) * Math.PI * 2, x = p.x + Math.cos(g) * r * TILE, y = p.y + Math.sin(g) * r * TILE, row = [];
    for (let j = 0; j < n; j++) row.push({ x, y: y + j * 13, a: 0 });
    if (row.every((q) => smooth(m, q.x, q.y, 0))) return row;
  }
  return [];
}
// a board on the ground, the dropped ones and yours: put out, landed, taken home (every tick - world.js SYSTEMS)
export function update(world) {
  if (world.boardLand && world.boardLand.length) {   // (a bail's board landing where it stopped)
    const due = world.boardLand.filter((q) => world.time >= q.at);
    if (due.length) { world.boardLand = world.boardLand.filter((q) => world.time < q.at); for (const q of due) putDown(world, q.deck, q, q.a, q.lz); }
  }
  if (world.tick % 15 === 9) setOut(world);
  if (world.tick % 40 === 21) tidy(world);
}
// the boards at their spots round each player, put out where nobody's looking (as the carts: traffic.js)
function setOut(world) {
  const S = boardSpots(world.map);
  if (!S.length) return;
  world.boardParked ??= new Map();
  const grid = pointGrid(S);
  for (const p of world.players.values()) {
    const a = p.ped;
    if (!a || a.dead) continue;
    const fresh = world.time - (p.joinedAt ?? -99) < 2 || world.time < 3 || world.time - (p.teleportAt ?? -99) < 2;
    for (const i of grid.near(a.x, a.y, NEAR_PX)) {
      const sp = S[i], cur = world.boardParked.get(i);
      if ((cur !== undefined && world.get(cur)) || (sp.x - a.x) ** 2 + (sp.y - a.y) ** 2 > NEAR_PX * NEAR_PX) continue;
      if (!fresh && inAnyView(world, sp.x, sp.y, 80)) continue;
      if (world.query(sp.x, sp.y, 12, K.VEH).length) continue;
      const v = world.spawnVehicle('skateboard', sp.x, sp.y, sp.a, { parked: true, npcOwned: false, variant: Math.floor(hash2(i, 23, 5) * 1000), paint: Math.floor(hash2(i, 29, 3) * PAINTS.length) });
      v.boardSpot = i;
      world.boardParked.set(i, v.id);
    }
  }
}
// your board lying where you're nowhere near (or you've gone): home again - bring it out at home or a skate shop
function tidy(world) {
  for (const v of world.entities.values()) {
    if (v.kind !== K.VEH || !v.def.board || !v.owner) continue;
    const q = world.players.get(v.owner), ped = q && q.ped;
    if (ped && q.conn && Math.hypot(ped.x - v.x, ped.y - v.y) < HOME_PX) continue;
    if (inAnyView(world, v.x, v.y, 64)) continue;
    world.remove(v);
    if (q && q.conn) world.notify(q, 'You left your skateboard lying about - it\'s back home: take it out at home or at a skate shop.', 'info');
  }
}

// ---- your own board ----------------------------------------------------------------------------------------------------
// Bought at a skate shop, a surf shop or a sports shop (economy.js buildMenu: shopOptions), it's set down by the door
// (outside a walk-in shop); one at a time. Owned, you bring it out free there or at home (the home menu): wherever it
// was, it's back by the door - one board, never two (someone riding off on it: it's theirs to keep then).
export function shopOptions(p, opts, home = false) {
  if (owns(p)) { opts.push({ id: 'bd:out', label: home ? 'Take your skateboard out' : 'Your skateboard - bring it out', note: 'set down by the door', shut: true }); return; }
  if (!home) opts.push({ id: 'bd:buy', label: 'Skateboard', price: SKATEBOARD_PRICE, note: 'set down by the door - ride it on roads, pavements and plazas', shut: true });
}
export function shopExecute(world, p, poi, what, pay) {
  const prof = p.profile;
  if (what === 'buy') {
    if (owns(p)) return 'You have one - bring it out instead.';
    if (!pay(p, SKATEBOARD_PRICE)) return 'Not enough money.';
    prof.board = { paint: Math.floor(world.rand() * PAINTS.length), variant: Math.floor(world.rand() * 1000) };
    store.touch();
  } else if (what !== 'out' || !owns(p)) return 'No such thing.';
  const v = bringOut(world, p, poi.outside || poi);
  if (!v) return 'There\'s nowhere to set it down here.';
  world.notify(p, `${what === 'buy' ? 'A new skateboard, yours' : 'Your skateboard'} - it's by the door. The vehicle button steps on and off it (F / X / CAR).`, 'good');
  return null;
}
// your board set down by (x, y): the one lying about anywhere else first gone, and nobody riding it off as yours
export function bringOut(world, p, at) {
  const prof = p.profile;
  for (const v of [...world.entities.values()]) if (v.kind === K.VEH && v.def.board && v.owner === p.pid) world.remove(v);
  for (const q of world.players.values()) { const d = q.ped && q.ped.board && q.ped.board.deck; if (d && d.owner === p.pid) { d.owner = null; d.ownerName = null; } }
  if (world.boardLand) for (const q of world.boardLand) if (q.deck.owner === p.pid) q.deck.owner = null;
  const spot = beside(world.map, at, 1)[0];
  if (!spot) return null;
  return putDown(world, { owner: p.pid, ownerName: p.name, paint: prof.board.paint, variant: prof.board.variant }, spot, 0);
}
// A skateboard in an old bag (before 2026-10-24): yours to keep as your own board - out at home or at a skate shop
export function convert(world, p) {
  const prof = p.profile, n = prof.inventory && prof.inventory.skateboard;
  if (!n) return false;
  delete prof.inventory.skateboard;
  if (Array.isArray(prof.quick)) prof.quick = prof.quick.map((q) => (q === 'skateboard' ? null : q));
  prof.board ||= { paint: 0, variant: 0 };
  store.touch();
  world.notify(p, 'Skateboards are ridden like bikes now, not carried in the bag. Your board is still yours: take it out at home or at any skate shop (free), or find one at the skate parks.', 'info');
  return true;
}

// ---- the score ------------------------------------------------------------------------------------------------
// p.sk: { score (since you joined), best (your best combo ever: the profile's skateBest), combo (the one going: pts, n
// tricks, names, used - how often each so far, gaps), special (the meter, 0..1), spUntil (the special on till then),
// last (the combo banked last: for the page) }
function state(p) {
  return p.sk || (p.sk = { score: 0, best: p.profile.skateBest || 0, combo: null, special: 0, spUntil: 0, last: null });
}
const special = (world, S) => S.spUntil > world.time;
// the debug menu (server/devplay.js): the special on now
export function devSpecial(world, p) { const S = state(p); S.special = 0; S.spUntil = world.time + SKATE_SCORE.specialS; p.meDirty = true; }
const nameOf = (world, S, k) => { const t = SK.trickOf(k); return t ? (special(world, S) ? t.sp : t.name) : ''; };
const combo = (world, S) => S.combo || (S.combo = { pts: 0, n: 0, names: [], used: {}, gaps: 0 });
// a trick into the combo: worth half each time it's done again in it, three times in a special (not the gaps)
function add(world, p, S, name, pts, isGap = false) {
  const C = combo(world, S), used = C.used[name] || 0;
  C.used[name] = used + 1;
  C.pts += Math.round(pts * Math.pow(0.5, used) * (special(world, S) && !isGap ? SKATE_SCORE.specialMul : 1));
  C.n++; C.names.push(name); if (C.names.length > 12) C.names.splice(0, C.names.length - 12);
  if (isGap) C.gaps++;
  p.meDirty = true;
}
// points onto the combo without another trick (a grind, a grab, a manual held on)
const more = (S, pts) => { if (S.combo) S.combo.pts += Math.round(pts); };
// the combo banked: its points times its tricks, into the score, the special meter, a session's
export function bank(world, p, ped) {
  const S = p.sk, C = S && S.combo;
  if (!C || !C.n) { if (S) S.combo = null; return 0; }
  const total = C.pts * C.n;
  S.score += total; S.combo = null; S.last = { pts: total, n: C.n, at: world.time };
  if (total > S.best) { S.best = total; p.profile.skateBest = total; }
  if (!special(world, S)) {
    S.special = Math.min(1, S.special + total / SKATE_SCORE.specialPts);
    if (S.special >= 1) { S.special = 0; S.spUntil = world.time + SKATE_SCORE.specialS; world.notify(p, 'SPECIAL! Your tricks are their specials, worth three times - till you bail.', 'good'); }
  }
  if (ped) world.emit(ped.x, ped.y, { e: 'skbank', id: ped.id, x: ped.x, y: ped.y, n: total, k: C.n });
  session(world, p, { total, n: C.n, gaps: C.gaps });
  p.meDirty = true;
  return total;
}
function lose(world, p, ped) {
  const S = p.sk;
  if (!S) return;
  if (S.combo && S.combo.n && ped) world.emit(ped.x, ped.y, { e: 'skbail', id: ped.id, x: ped.x, y: ped.y });
  S.combo = null; S.spUntil = 0; S.special = 0; p.meDirty = true;
}
// what the tricks did this step (shared/skate.js: ped.skEv)
function score(world, p, ped, dt) {
  const S = state(p), L = ped.skEv || [], B = ped.board, ps = SKATE_SCORE.perS;
  ped.skEv = [];
  for (const e of L) {
    const t = SK.trickOf(e.k);
    switch (e.w) {
      case 'trick': if (t) add(world, p, S, nameOf(world, S, e.k), t.pts); break;
      case 'grab': if (t) add(world, p, S, nameOf(world, S, e.k), t.pts); break;
      case 'grabEnd': more(S, ps.grab * (e.t || 0)); break;
      case 'grind': B.air0 = null; if (t) add(world, p, S, nameOf(world, S, e.k) + (e.q === 'kerb' ? ' (kerb)' : ''), t.pts); world.emit(ped.x, ped.y, { e: 'skgrind', id: ped.id, x: ped.x, y: ped.y, q: e.q }); break;
      case 'grindEnd': more(S, ps.grind * (e.t || 0)); break;
      case 'manual': add(world, p, S, nameOf(world, S, SK.MANUAL), SK.TRICKS[SK.MANUAL].pts); break;
      case 'manualEnd': more(S, ps.manual * (e.t || 0)); break;
      case 'air': B.air0 = { x: ped.x, y: ped.y, k: e.k, r: e.r ?? -1, walk: SK.walkway(world.map, ped.x, ped.y) }; break;
      case 'land': landed(world, p, S, ped); break;
    }
  }
  // an ollie the board step popped itself (no event): where it started, for a street gap
  if (ped.rollT > 0 && !B.air0 && !ped.airK) B.air0 = { x: ped.x, y: ped.y, k: 0, r: -1, walk: SK.walkway(world.map, ped.x, ped.y) };
  // rolling on along the ground, nothing going: the combo's banked
  if (ped.rollT > 0 || ped.bm) B.roll = 0;
  else if (S.combo) { B.roll += dt; if (B.roll >= SKATE_SCORE.comboGap) bank(world, p, ped); }
  if (S.spUntil && world.time > S.spUntil) { S.spUntil = 0; p.meDirty = true; }
}
export function sessionTick(world, p) { if (p.skSession && world.time >= p.skSession.until) endSession(world, p); }
// down from an air: the gaps it made
function landed(world, p, S, ped) {
  const a0 = ped.board.air0;
  ped.board.air0 = null;
  if (!a0) return;
  const G = SKATE_SCORE.gaps;
  if (a0.k === 2) add(world, p, S, 'Vert Air', G.vert, true);
  else if (a0.k === 1) {
    const pr = a0.r >= 0 ? world.map.props[a0.r] : null, spot = spotAt(world, a0.x, a0.y);
    if (pr && pr.t === 'pyramid') add(world, p, S, 'Pyramid Hop', G.pyramid, true);
    else if (pr && Math.hypot(ped.x - a0.x, ped.y - a0.y) >= SKATE_SCORE.kickerTiles * TILE) add(world, p, S, `${spot ? spot.name.replace(/^The /, '') + ' ' : ''}Kicker Gap`, G.kicker, true);
  } else if (a0.walk && SK.walkway(world.map, ped.x, ped.y)) {
    const roads = SK.roadTilesBetween(world.map, a0.x, a0.y, ped.x, ped.y);
    if (roads >= SKATE_SCORE.streetRoads) add(world, p, S, 'Street Gap', G.street + G.streetPer * (roads - SKATE_SCORE.streetRoads), true);
  }
}

// ---- sessions at the skate spots ------------------------------------------------------------------------------------
const spots = (world) => world.map.skateSpots || [];
function spotAt(world, x, y, pad = 2) {
  const tx = x / TILE, ty = y / TILE;
  return spots(world).find((q) => tx >= q.x - pad && ty >= q.y - pad && tx < q.x + q.w + pad && ty < q.y + q.h + pad) || null;
}
// At a skate spot on your board: start a session (or how yours is going). keepBoard: the action button leaves you on it
export function interaction(world, p) {
  const ped = p.ped;
  if (!ped || !ped.board || ped.vehId) return null;
  const q = spotAt(world, ped.x, ped.y);
  if (!q) return null;
  if (p.skSession) return { label: `Session: ${Math.ceil(p.skSession.until - world.time)} s left - ${p.skSession.score.toLocaleString('en-US')} points`, passive: true, keepBoard: true, run: () => {} };
  return { label: `Start a skate session at ${q.name} (${Math.round(SKATE_SESSION.s / 60)} min)`, keepBoard: true, run: () => startSession(world, p, q) };
}
export function startSession(world, p, q) {
  const rec = (world.skRecords ||= {})[q.name];
  p.skSession = { spot: q.name, until: world.time + SKATE_SESSION.s, score: 0, goals: SKATE_SESSION.goals.map(([k, n, label]) => ({ k, n, label, done: false })) };
  world.notify(p, `Session at ${q.name}: ${SKATE_SESSION.s / 60} minutes. Goals: ${SKATE_SESSION.goals.map((g) => g[2]).join(' · ')}.${rec ? ` Best here: ${rec.score.toLocaleString('en-US')} (${rec.name}).` : ''}`, 'good');
  p.meDirty = true;
}
function session(world, p, d) {
  const X = p.skSession;
  if (!X) return;
  X.score += d.total;
  for (const g of X.goals) {
    if (g.done) continue;
    const hit = g.k === 'bank' ? d.total >= g.n : g.k === 'tricks' ? d.n >= g.n : g.k === 'gap' ? d.gaps >= g.n : g.k === 'score' ? X.score >= g.n : false;
    if (hit) { g.done = true; p.profile.cash += SKATE_SESSION.goalPay; world.notify(p, `Goal: ${g.label} (+$${SKATE_SESSION.goalPay})`, 'good'); }
  }
}
function endSession(world, p) {
  const X = p.skSession;
  p.skSession = null;
  const R = (world.skRecords ||= {}), rec = R[X.spot], best = (p.profile.skateSpots ||= {});
  const n = X.goals.filter((g) => g.done).length;
  let note = `Session over at ${X.spot}: ${X.score.toLocaleString('en-US')} points, ${n} of ${X.goals.length} goals.`;
  if (!rec || X.score > rec.score) { R[X.spot] = { score: X.score, name: p.name }; if (X.score > 0) note += ' The best here yet!'; }
  if (X.score > (best[X.spot] || 0)) best[X.spot] = X.score;
  world.notify(p, note, 'good');
  p.meDirty = true;
}

// The rider's own page (players.js buildMe): the score, the combo going, the special meter, the session
export function meInfo(world, p) {
  const ped = p.ped;
  if (!ped || !ped.board) return null;
  const S = state(p), C = S.combo, X = p.skSession;
  return {
    s: S.score, b: S.best, sp: special(world, S) ? 1 : +S.special.toFixed(2), on: special(world, S) ? Math.ceil(S.spUntil - world.time) : 0,
    c: C ? { p: C.pts, n: C.n, l: C.names.slice(-6) } : null, last: S.last && world.time - S.last.at < 3 ? S.last.pts : 0,
    ses: X ? { spot: X.spot, t: Math.max(0, Math.ceil(X.until - world.time)), s: X.score, g: X.goals.map((g) => [g.label, g.done ? 1 : 0]) } : null,
  };
}
