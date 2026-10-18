// Skateboarding. Part 1 (the owner, 2026-10-17): riding a board. A skateboard (shared/items.js: a tool, never used up) is
// carried in the bag; the board button (B, D-pad down, the touch 🛹 pill - client/main.js quickBoard: the bag's use), the
// vehicle button - when there's no vehicle to get into - or the bag hops you on where you stand, and any of them again
// steps you off. On it you push - kick by kick, as fast as a bike (2026-10-18) - carve, coast, brake and ollie
// (shared/physics.js BOARD, boardStep: the page predicts it the same way). It rolls on anything paved and on the docks;
// on grass, dirt or sand the wheels dig in and you step off. Run into a wall, a post or a car hard and you bail: thrown
// down, a little hurt, the board shooting off ahead of you (the 'bail' event). Knocked down any other way, into the
// water, a vehicle or a building, cuffed, on a train: off the board.
// Parts 2 and 3 (the owner, 2026-10-18: "lets put in the skateboard moves"): the tricks (shared/skate.js - flips, grabs,
// grinds and slides, manuals, the ramps' airs: the step is shared, so the page predicts them) and here their score:
// combos (each trick from an air or a manual to the next, banked when you roll on - shared/rules.js SKATE_SCORE), the
// special meter, the gaps (off a kicker, the pyramid, up a quarter pipe, a street gap over a road), and sessions at the
// skate spots (two minutes, four goals, the spot's best - SKATE_SESSION). Fall off a rail, out of a manual or land a
// flip that isn't round and you bail: the combo's lost.
// On the wire: the rider's descriptor carries gt 'skate', pp 'board' and bd (net.js); the kick's frames ride on the
// SPRINT flag and an air on ROLL (players.js pedFlags), what they're doing on the board on the extra byte (net.js:
// board.code - shared/skate.js TRICKS); the rider's own page gets the board's state in the snapshot's self record
// (shared/physics.js boardOut) and the score in its 'me' (meInfo).
import { T, TILE } from '../../shared/constants.js';
import { WATER_T } from '../../shared/mapcore.js';
import { BOARD, boardGround } from '../../shared/board.js';   // (loading it puts the board's step in shared/physics.js)
import * as SK from '../../shared/skate.js';
import { BAIL, SKATEBOARD_PRICE, SKATE_SCORE, SKATE_SESSION } from '../../shared/rules.js';
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
// the board's state on the ped (shared/skate.js, shared/physics.js boardStep): all of it cleared on and off
function clearBoard(ped) {
  ped.rollT = 0; ped.rdx = 0; ped.rdy = 0; ped.push = false; ped.boardHit = 0; ped.kp = -1; ped.bm = 0; ped.bg = -1; ped.gh = 0; ped.bb = 0; ped.bT = 0;
  ped.tk = 0; ped.tt = 0; ped.airT = 0; ped.airH = 15; ped.airK = 0; ped.h0 = 0; ped.vg = 0; ped.over = false; ped.skFall = null;
}
const grinding = (ped) => ped.bm === 1 || ped.bm === 3;

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
  ped.board = { since: world.time, rough: 0, code: 0, roll: 0, air0: null };
  clearBoard(ped);
  ped.skEv = [];
  if (Math.hypot(ped.vx, ped.vy) > 20) ped.a = Math.atan2(ped.vy, ped.vx);   // (the deck the way you were going)
  setLook(ped, true);
  world.emit(ped.x, ped.y, { e: 'boardon', id: ped.id, x: ped.x, y: ped.y });
  if (!p.profile.boardTold) {
    p.profile.boardTold = 1;
    world.notify(p, 'On your board. The stick pushes and steers (all the way or sprint to push harder), pull it back to brake, the dive button ollies (Space / A / OLLIE). The board button gets you on and off any time (B / D-pad down / 🛹), and so does the vehicle button with no vehicle in reach (F / X / CAR).', 'good');
  } else if (!p.profile.trickTold) {
    p.profile.trickTold = 1;
    world.notify(p, 'Tricks: the trick button (click / RT / TRICK) pops a flip - the stick picks which - or, held in a big air, a grab. Come down onto a kerb, a ledge, a bench or a rail along it and you grind it: the stick across it keeps your balance. The stick pulled back with the trick button: a manual. Roll on to bank the combo.', 'good');
  }
  return true;
}

export function hopOff(world, ped) {
  if (!ped || !ped.board) return;
  if (ped.player) bank(world, ped.player, ped);
  ped.board = null; clearBoard(ped); ped.skEv = null;
  setLook(ped, false);
}

// The bag's "use" (and the vehicle button with nothing to get into): on, or off
export function toggle(world, p) {
  const ped = p.ped;
  if (!ped) return;
  if (ped.board) hopOff(world, ped); else hopOn(world, p, ped);
}

// Thrown off: into a wall, a post or a car at `into` px/s (hurt by how hard), or knocked down by anything (hurt = false:
// whatever knocked you down did its own harm), or off a rail, out of a manual, a flip not round (a trick's bail). The
// board shoots off the way you were going; the combo's lost.
export function bail(world, ped, into = 0, hurt = true) {
  if (!ped.board) return;
  if (ped.player) lose(world, ped.player, ped);
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
      if (world.time - (p.boardNoteAt ?? -99) > NOTE_S) { p.boardNoteAt = world.time; world.notify(p, 'Too rough to ride - you step off and carry the board.', 'info'); }
    }
  } else ped.board.rough = 0;
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
