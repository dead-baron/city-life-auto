// Riding a skateboard (the owner, 2026-10-17; server/systems/skate.js hops you on and off): the board's numbers and its
// step - the push kick by kick, the carve, the brake and the kick-turn, the ollie - with the tricks (shared/skate.js), and
// the board's state on the wire. The server loads it with skate.js; the page when you have a board or see someone ride one
// (client/skate.js) - out of the page's first load. Loading it registers the step with shared/physics.js (setBoard), which
// runs it for a rider in pedStep: the server and the page's prediction ride the same.
import { T } from './constants.js';
import { SURFACE } from './mapcore.js';
import { IN } from './input.js';
import { clamp, wrapAngle } from './math.js';
import { PED, setBoard } from './physics.js';
import * as SK from './skate.js';

// Its numbers. Speeds px/s, rates /s:
// push - the top speed pushing with the stick all the way (pushHard: with sprint / the full stick, at a little stamina) -
// a bicycle's (the owner, 2026-10-18: "about as fast as bicycles... we want them to be cool": the commuter bike does
// 330, the road bike 430); kickAcc - the push of a kick (KICK below), surge - how far over your cruising speed a kick's
// first shove carries you; roll - the drag rolling on smooth ground (coasting), dock - on boards and planks,
// rough - on grass, dirt and sand (the wheels dig in: you step off - skate.js); brake - a foot dragged (the stick pulled
// back); turnLo / turnHi - how fast the deck carves at a standstill / at full speed; kick - a kick-turn on the spot;
// grip - how fast the wheels bring the slide back in line (wetGrip: in the rain); ollieT - the time in the air;
// bailHit - the speed into a wall, a car or a post that throws you off; drain - stamina a second pushing hard.
export const BOARD = {
  push: 330, pushHard: 380, kickAcc: 620, surge: 1.03, roll: 24, dock: 70, rough: 650, brake: 430, turnLo: 4.6, turnHi: 2.4, kick: 7,
  grip: 14, wetGrip: 4.5, ollieT: 0.55, bailHit: 150, drain: 9,
};
// A push is a run of kicks (the owner, 2026-10-18: "like it really looks like you're kicking a skateboard, it goes a little
// faster at the very start of the kick and very subtly slows down... before starting the next kick"), one every KICK.T s
// while the stick pushes, its phase s.kp (0..1, -1 not kicking - the page plays the kick's frames on it, client/art2/people.js
// skate): up to `reach` the back foot comes off the deck and reaches ahead; from `reach` to `drive` it's on the ground,
// shoving - hardest at the plant, easing off as the leg goes back; at `back` the foot is on the tail again and you roll on,
// the speed easing off a touch until the next kick. Let go of the stick and the kick under way finishes.
export const KICK = { T: 0.8, reach: 0.12, drive: 0.46, back: 0.66 };
// the ground a board rolls on: 0 smooth (roads, pavements, plazas, car parks, bridges), 1 bumpy (a dock's planks), 2
// rough (anything else on dry land - the board won't go)
export function boardGround(tile) {
  if (tile === T.DOCK) return 1;
  const sf = SURFACE[tile];
  return sf && sf[2] === 1 ? 0 : 2;
}


// One step on a board. The deck faces s.a and the wheels roll along it: the stick carves the deck round toward where it
// points (slower the faster you go), held the way you face it pushes - kick after kick (KICK; harder with sprint, at a little
// stamina) - pulled back it drags a foot to brake, or, all but stopped, kick-turns you round. Let go and you coast. The
// dive button pops an ollie (s.rollT: the time left in the air - the ped's ROLL flag; s.airT the whole air, s.airH how
// high it goes), the deck and you going on as you were; the wheels take up the line again when you land. s.push: in a
// kick (the SPRINT flag: the pushing frames). Skateboarding's tricks (shared/skate.js: flips and grabs, grinds, manuals,
// the ramps' airs) take the step over while one's going.
function boardStep(s, inp, bits, pressed, mx, my, ml, dt, tile, mods, smax, map) {
  const ground = boardGround(tile), regen = PED.regen * (mods.regenMul || 1) * dt;
  s.push = false; s.over = false;
  if (s.kp === undefined) s.kp = -1;
  if (SK.step(s, inp, bits, pressed, mx, my, ml, dt, ground, mods, map)) { s.kp = -1; s.stamina = Math.min(smax, s.stamina + regen); return; }
  if (s.rollT > 0) {   // in the air: carried on as you were, the body's twist turning the deck a little
    s.rollT = Math.max(0, s.rollT - dt);
    if (ml > 0.15) { const d = wrapAngle(Math.atan2(my, mx) - s.a), st = 1.6 * dt; s.a = wrapAngle(s.a + clamp(d, -st, st)); }
    s.stamina = Math.min(smax, s.stamina + regen); s.kp = -1;
    s.over = s.rollT > 0.12 && s.rollT < (s.airT || BOARD.ollieT) - 0.12;   // (high enough to clear a bench or a bin)
    return;
  }
  if ((pressed & IN.DIVE) && ground < 2) { s.rollT = s.airT = BOARD.ollieT; s.airH = 15; s.airK = 0; s.h0 = 0; s.kp = -1; s.stamina = Math.min(smax, s.stamina + regen); return; }
  // the deck carves round toward the stick (slower the faster you go; all but stopped, a kick-turn), and the wheels carry
  // the speed round with it - in the rain only part of the way, the rest sliding
  let along = Math.max(0, s.vx * Math.cos(s.a) + s.vy * Math.sin(s.a));
  let braking = false, hard = false, da = 0;
  if (ml > 0.15) {
    const d = wrapAngle(Math.atan2(my, mx) - s.a);
    if (Math.abs(d) > 2.2 && along > 12) braking = true;   // (pulled back: a foot dragged, then, stopped, a kick-turn round)
    else {
      const k = Math.min(1, along / BOARD.push), rate = along < 25 ? BOARD.kick : BOARD.turnLo + (BOARD.turnHi - BOARD.turnLo) * k;
      da = clamp(d, -rate * dt, rate * dt);
      hard = !!(bits & IN.SPRINT) && s.stamina > 1 && mods.canSprint !== false;
    }
  }
  if (da) {
    s.a = wrapAngle(s.a + da);
    const r = da * (mods.wet ? 0.55 : 1), cr = Math.cos(r), sr = Math.sin(r), vx = s.vx;
    s.vx = vx * cr - s.vy * sr; s.vy = vx * sr + s.vy * cr;
  }
  const c = Math.cos(s.a), sn = Math.sin(s.a);
  let v = s.vx * c + s.vy * sn, lat = -s.vx * sn + s.vy * c;
  if (v < 0) v = 0;
  // pushing: the kicks (KICK) - the cycle runs while the stick pushes the way you face; a kick under way when you let go
  // finishes, the foot back on the tail
  const want = !braking && ml > 0.15 && ground < 2 && Math.abs(wrapAngle(Math.atan2(my, mx) - s.a)) < 1.1;
  if (braking) { v = Math.max(0, v - BOARD.brake * dt); s.kp = -1; }
  else if (want || (s.kp >= 0 && s.kp < KICK.back)) {
    let kp = (s.kp < 0 ? 0 : s.kp) + dt / KICK.T;
    if (kp >= 1) kp = want ? kp - 1 : -1;
    if (!want && kp >= KICK.back) kp = -1;
    s.kp = kp;
    if (want && kp > KICK.reach && kp < KICK.drive) {   // (on the ground, shoving: hardest at the plant)
      const u = (kp - KICK.reach) / (KICK.drive - KICK.reach), top = (hard ? BOARD.pushHard : BOARD.push) * ml * (mods.speedMul ?? 1), cap = top * BOARD.surge;
      if (v < cap) v = Math.min(cap, v + BOARD.kickAcc * 2 * (1 - u) * (ground === 1 ? 0.6 : 1) * dt);
    }
    s.push = s.kp >= 0;
  } else s.kp = -1;
  if (s.push && hard) s.stamina = Math.max(0, s.stamina - BOARD.drain * (mods.drainMul ?? 1) * dt);
  else s.stamina = Math.min(smax, s.stamina + regen);
  v = Math.max(0, v - (ground === 2 ? BOARD.rough : ground === 1 ? BOARD.dock : BOARD.roll) * dt);
  lat *= Math.exp(-(mods.wet ? BOARD.wetGrip : BOARD.grip) * dt);   // (the wheels bite: a slide dies away)
  s.vx = c * v - sn * lat; s.vy = sn * v + c * lat;
  if (v < 2 && Math.abs(lat) < 4 && ml < 0.15) { s.vx = 0; s.vy = 0; }
}
// How high a rider is off the ground (px): an air's arc (starting from h0 - the lip of a kicker, a ledge you popped off - and
// up by airH), a grind's height (s.gh: shared/skate.js)
export function boardLift(s) {
  if (s.rollT > 0) { const T = s.airT || BOARD.ollieT, k = 1 - s.rollT / T; return (s.h0 || 0) * (1 - k) + (s.airH ?? 15) * Math.sin(Math.PI * k); }
  return s.bm === 1 || s.bm === 3 ? s.gh || 0 : 0;
}
// The board's state on the wire (server net.js self, the page's reconcile - client/main.js): the ped slots a rider
// doesn't use (av: the kick's phase; rdx: the grind's rail; rdy: the mode and the balance) and the board's own (k)
export function boardOut(s) {
  return { av: s.kp ?? -1, rdx: s.bg ?? -1, rdy: (s.bm || 0) * 4 + (s.bb || 0), k: [s.bT || 0, s.airT || 0, s.airH ?? 15, (s.h0 || 0) + 256 * (s.airK || 0), (s.tk || 0) * 16 + Math.min(15.9, s.tt || 0), s.vg || 0, s.gh || 0] };
}
export function boardIn(st, f) {
  st.kp = f.av; st.bg = f.rdx; const bm = Math.round(f.rdy / 4); st.bm = bm; st.bb = f.rdy - bm * 4; st.rdx = 0; st.rdy = 0;
  const k = f.k || [];
  st.bT = k[0] || 0; st.airT = k[1] || 0; st.airH = k[2] ?? 15; st.airK = Math.floor((k[3] || 0) / 256); st.h0 = (k[3] || 0) - st.airK * 256;
  st.tk = Math.floor((k[4] || 0) / 16); st.tt = (k[4] || 0) - st.tk * 16; st.vg = k[5] || 0; st.gh = k[6] || 0;
  return st;
}

setBoard(boardStep, BOARD.bailHit);
