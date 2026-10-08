// Small things to do at the designed places (shared/naturesites.js):
//   - ring the old mission's bells: stand at its great doorway and haul on the rope, and three slow strikes carry
//     out over the desert for everyone near;
//   - the coin telescope at the end of Westport Pier: a dollar, and your view swings out over the bay to the seals
//     on their islets for a few seconds (the camera only: you stay where you are);
//   - stargazing at the Granite Peak Observatory: after dark, two dollars at either telescope on its terrace and you see
//     the night sky through the eyepiece a few seconds - tonight's sight (the same for everyone that night: a planet,
//     the Moon, a nebula, a galaxy, now and then a comet). By day the telescopes are capped;
//   - work spots: strip the Dry Creek Boneyard's stored airliners for parts (component scrap: the yard office by the
//     gate buys it), chip at the Old Granite Mine's seams with the old pick (quartz, and now and then a gold nugget),
//     search the shipwreck on Wreck Island (an old doubloon now and then). Stand there, press the action button and
//     work at it a few seconds standing still; then that spot is done for a while;
//   - the Bluffs Maze against the clock: in through any gate and the clock runs until you find the gazebo in the
//     middle. Your best time is kept, the day's fastest are listed when you finish, and the first time you make it
//     the gardeners pay you a prize;
//   - a lap of the Stadium Lido's lanes against the clock: push off from the shallow end's wall, swim to the rope
//     across the deep end and back; the same best time, the day's fastest and a prize the first time.
import { payFrom } from './economy.js';
import { isSwimming } from '../../shared/map.js';
import { ITEMS } from '../../shared/items.js';
import { SALVAGE_S, SALVAGE_REGROW_S, SALVAGE_REACH, PROSPECT_S, PROSPECT_REGROW_S, PROSPECT_GOLD, WRECK_S, WRECK_REGROW_S, WRECK_COIN, MAZE_PRIZE, LAP_PRIZE } from '../../shared/rules.js';
import { store } from '../store.js';
import { TILE, DAY_LOOP_S } from '../../shared/constants.js';
const BELL_REACH = 48, BELL_RING_S = 6, SCOPE_REACH = 40, SCOPE_S = 7, SCOPE_PRICE = 1, WORK_MOVE_PX = 14;
const STARS_S = 9, STARS_PRICE = 2;
// what the observatory's telescopes are pointed at, night by night (client stargaze.js draws each; the comet is rare)
export const SKY_SIGHTS = [
  ['saturn', 'Saturn, its rings tipped toward you, and a moon or two beside it.'],
  ['jupiter', 'Jupiter, banded cream and rust, the Great Red Spot, four little moons in a line.'],
  ['moon', 'The Moon, so close you can see the craters along the shadow line.'],
  ['nebula', 'The Orion Nebula: a cloud of glowing gas where new stars are being born.'],
  ['galaxy', 'Andromeda: a whole other galaxy, a smudge of light two and a half million years old.'],
  ['saturn', 'Saturn again tonight - the rings never get old.'],
  ['moon', 'The Moon, bright enough to make your eye water.'],
  ['comet', 'A comet! Its tail streams away from the Sun across half the eyepiece.'],
];
export const skySight = (world) => SKY_SIGHTS[Math.floor(world.time / DAY_LOOP_S) % SKY_SIGHTS.length];

function site(map, key, find) {
  if (map[key] === undefined) Object.defineProperty(map, key, { value: (map.natureSites || []).find(find) || null, enumerable: false, configurable: true });
  return map[key];
}
const mission = (map) => site(map, '_mission', (q) => q.kind === 'mission');
const pier = (map) => site(map, '_pier', (q) => q.kind === 'pier' && q.scope);
const boneyard = (map) => site(map, '_boneyard', (q) => q.kind === 'boneyard' && q.stored);
const maze = (map) => site(map, '_maze', (q) => q.kind === 'maze' && q.rect);
// the Granite Peak Observatory's telescopes (the scope props on its terrace)
function obsScopes(map) {
  if (map._obsScopes) return map._obsScopes;
  const s = (map.countrySites || []).find((q) => q.type === 'observatory');
  const out = s ? map.props.filter((p) => p && p.t === 'scope' && p.x >= s.x * TILE && p.x <= (s.x + s.w) * TILE && p.y >= s.y * TILE && p.y <= (s.y + s.h) * TILE) : [];
  Object.defineProperty(map, '_obsScopes', { value: out, enumerable: false, configurable: true });
  return out;
}

// ---- work spots: stand there, press the action button and work at it a few seconds (standing still); then it's
// done for a while (shared by everyone). The boneyard's stored airliners (beside a fuselage), the Old Granite Mine's
// seams (the mouth and each crystal vein), the shipwreck on Wreck Island (the bow, amidships, the stern).
const WORK = {
  plane: { s: SALVAGE_S, regrow: SALVAGE_REGROW_S, verb: 'Strip parts off the plane', doing: 'Stripping parts off the plane... (stand still)', start: 'You get to work on the plane with a wrench... (stand still)', stop: 'You stopped working on the plane.',
    bare: 'Stripped bare - nothing worth taking', bareNote: 'Someone has had everything worth taking off this one. Try another plane.', none: '', sell: 'the yard office by the gate buys it',
    loot: (r) => [['scrap', r < 0.25 ? 2 : 1]] },
  seam: { s: PROSPECT_S, regrow: PROSPECT_REGROW_S, verb: 'Chip at the seam with the old pick', doing: 'Chipping at the rock... (stand still)', start: 'You swing the old pick at the seam... (stand still)', stop: 'You stopped chipping.',
    bare: 'Worked out - nothing showing', bareNote: 'This seam is worked out for now. Try another one.', none: 'Nothing but rock dust this time.', sell: 'any pawn shop buys it',
    loot: (r) => (r < PROSPECT_GOLD ? [['nugget', 1]] : r < 0.7 ? [['quartz', r < 0.45 ? 2 : 1]] : []) },
  wreck: { s: WRECK_S, regrow: WRECK_REGROW_S, verb: 'Search the wreck', doing: 'Searching the wreck... (stand still)', start: 'You pick through the rotten timbers and the sand... (stand still)', stop: 'You stopped searching.',
    bare: 'Picked over', bareNote: 'Someone has been through this part of the wreck. Try another.', none: 'Old rope, sand and crab shells.', sell: 'any pawn shop buys it',
    loot: (r) => (r < WRECK_COIN ? [['doubloon', r < WRECK_COIN / 4 ? 2 : 1]] : []) },
};
// every spot on the map: { kind, x, y } (+ a fuselage's line: ux, uy, half), made once
function workSpots(map) {
  if (map._workSpots) return map._workSpots;
  const out = [], by = boneyard(map), mine = site(map, '_mine', (q) => q.kind === 'mine' && q.seams), wreck = site(map, '_wreck', (q) => q.kind === 'wreck' && q.search);
  if (by) for (const q of by.stored) out.push({ kind: 'plane', x: q.x, y: q.y, ux: Math.cos(q.a), uy: Math.sin(q.a), half: q.half, reach: SALVAGE_REACH });
  if (mine) for (const q of mine.seams) out.push({ kind: 'seam', x: q.x, y: q.y, reach: 40 });
  if (wreck) for (const q of wreck.search) out.push({ kind: 'wreck', x: q.x, y: q.y, reach: 44 });
  Object.defineProperty(map, '_workSpots', { value: out, enumerable: false, configurable: true });
  return out;
}
// the spot you're standing at (its index), or -1
export function spotNear(world, x, y) {
  let best = -1, bd = Infinity;
  workSpots(world.map).forEach((q, i) => {
    if (Math.abs(x - q.x) > 400 || Math.abs(y - q.y) > 400) return;
    let d;
    if (q.ux !== undefined) { const t = Math.max(-q.half, Math.min(q.half, (x - q.x) * q.ux + (y - q.y) * q.uy)); d = Math.hypot(x - (q.x + q.ux * t), y - (q.y + q.uy * t)); }
    else d = Math.hypot(x - q.x, y - q.y);
    if (d < q.reach && d < bd) { bd = d; best = i; }
  });
  return best;
}
const doneFor = (world, i) => Math.max(0, ((world.worked && world.worked.get(i)) || 0) - world.time);

export function interaction(world, p) {
  const ped = p.ped;
  if (!ped || ped.vehId) return null;
  if (ped.work) return { label: WORK[workSpots(world.map)[ped.work.i].kind].doing, passive: true, run: () => {} };
  const ms = mission(world.map);
  if (ms && Math.hypot(ped.x - ms.door.x, ped.y - ms.door.y) < BELL_REACH) return { label: 'Ring the mission bells', run: () => ringBells(world, p) };
  const pr = pier(world.map);
  if (pr && Math.hypot(ped.x - pr.scope.x, ped.y - pr.scope.y) < SCOPE_REACH) return { label: `Look through the telescope ($${SCOPE_PRICE})`, run: () => lookOut(world, p) };
  if (obsScopes(world.map).some((q) => Math.hypot(ped.x - q.x, ped.y - q.y) < SCOPE_REACH)) {
    if (!world.clock.isNight) return { label: 'The telescope is capped till dark', run: () => world.notify(p, 'The observatory\'s telescopes open after dark. Come back tonight.', 'info') };
    return { label: `Look at the stars ($${STARS_PRICE})`, run: () => stargaze(world, p) };
  }
  const i = spotNear(world, ped.x, ped.y);
  if (i >= 0) {
    const W = WORK[workSpots(world.map)[i].kind], bare = doneFor(world, i);
    if (bare > 0) return { label: `${W.bare} for ${Math.ceil(bare / 60)} min`, run: () => world.notify(p, W.bareNote, 'info') };
    return { label: W.verb, run: () => beginWork(world, p, i) };
  }
  return null;
}

// the telescope: the camera swings out to what it looks at for SCOPE_S seconds (moving cuts it short)
export function lookOut(world, p) {
  const pr = pier(world.map);
  if (!pr) return false;
  if (!payFrom(p, SCOPE_PRICE)) { world.notify(p, 'The telescope takes a dollar.', 'warn'); return false; }
  if (p.conn) p.conn.sendJSON({ t: 'look', x: pr.scope.look.x, y: pr.scope.look.y, s: SCOPE_S });
  world.notify(p, 'Clunk. Out on the islets the seals are hauled out in the sun.', 'good');
  p.meDirty = true;
  return true;
}

// the observatory: the night sky through the eyepiece for STARS_S seconds (moving cuts it short)
export function stargaze(world, p) {
  if (!world.clock.isNight) { world.notify(p, 'The telescopes are capped till dark.', 'info'); return false; }
  if (!payFrom(p, STARS_PRICE)) { world.notify(p, `The observatory's telescopes take $${STARS_PRICE}.`, 'warn'); return false; }
  const [what, text] = skySight(world);
  if (p.conn) p.conn.sendJSON({ t: 'stars', what, s: STARS_S, seed: Math.floor(world.time / DAY_LOOP_S) });
  world.notify(p, text, 'good');
  p.meDirty = true;
  return true;
}

export function ringBells(world, p) {
  const ms = mission(world.map);
  if (!ms) return false;
  if ((world.bellsUntil || 0) > world.time) { world.notify(p, 'The bells are still ringing.', 'info'); return false; }
  world.bellsUntil = world.time + BELL_RING_S;
  world.emit(ms.door.x, ms.door.y - 140, { e: 'bells', x: ms.door.x, y: ms.door.y - 140, n: 3 });
  world.notify(p, 'You haul on the old rope. The bells ring out over the desert.', 'good');
  return true;
}

// ---- the boneyard: stripping a plane for parts ------------------------------------------------------------------
export function beginWork(world, p, i) {
  const ped = p.ped, q = workSpots(world.map)[i];
  if (!ped || ped.dead || ped.vehId || ped.hidden || !q) return 'Not right now.';
  if (ped.carrying) { world.notify(p, 'Set the crate down first.', 'warn'); return 'busy'; }
  if (doneFor(world, i) > 0) return 'Done for now.';
  ped.work = { i, at: world.time, x: ped.x, y: ped.y };
  ped.vx = 0; ped.vy = 0;
  world.notify(p, WORK[q.kind].start, 'info');
  p.meDirty = true;
  return null;
}

export function update(world) {
  if (world.tick % 2) return;
  workStep(world);
  mazeStep(world);
  lapStep(world);
}

const finds = (list) => list.map(([id, n]) => (n === 1 ? `a${/^[aeiou]/i.test(ITEMS[id].name) ? 'n' : ''} ${ITEMS[id].name.toLowerCase()}` : `${n === 2 ? 'two' : n} ${ITEMS[id].name.toLowerCase()}s`)).join(' and ');
// Working at a spot: stand still for its time and the finds are yours (moving, a hit or getting in a car stops you).
function workStep(world) {
  for (const p of world.players.values()) {
    const ped = p.ped, s = ped && ped.work;
    if (!s) continue;
    const q = workSpots(world.map)[s.i], W = q && WORK[q.kind];
    if (!W || ped.dead || ped.vehId || ped.hidden || world.time < ped.downUntil || (ped.lastHitAt || -99) > s.at || Math.hypot(ped.x - s.x, ped.y - s.y) > WORK_MOVE_PX) {
      ped.work = null;
      if (W && !ped.dead) world.notify(p, W.stop, 'warn');
      p.meDirty = true;
      continue;
    }
    if (world.time - s.at < W.s) continue;
    ped.work = null;
    if (doneFor(world, s.i) > 0) { world.notify(p, 'Someone beat you to it.', 'info'); continue; }
    (world.worked ||= new Map()).set(s.i, world.time + W.regrow);
    const got = W.loot(world.rand()), inv = p.profile.inventory;
    for (const [id, n] of got) inv[id] = (inv[id] || 0) + n;
    if (got.length) { const t = finds(got); world.notify(p, `${t[0].toUpperCase()}${t.slice(1)} - ${W.sell}.`, 'good'); }
    else world.notify(p, W.none, 'info');
    p.meDirty = true;
    store.touch();
  }
}

// ---- the Bluffs Maze against the clock ----------------------------------------------------------------------------
const clock = (t) => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}`;
const inRect = (r, x, y) => x >= r.x0 && x < r.x1 && y >= r.y0 && y < r.y1;
// p.maze: { t0 } while the clock runs, { done } from the middle until you're out of the maze again
function mazeStep(world) {
  const mz = maze(world.map);
  if (!mz) return;
  for (const p of world.players.values()) {
    const ped = p.ped;
    const inside = !!ped && !ped.dead && !ped.vehId && !ped.hidden && inRect(mz.rect, ped.x, ped.y);
    if (!inside) {
      if (p.maze && !p.maze.done && ped && !ped.dead) world.notify(p, 'You left the maze - the clock stops.', 'info');
      if (p.maze) { p.maze = null; p.meDirty = true; }
      continue;
    }
    const atHeart = Math.hypot(ped.x - mz.heart.x, ped.y - mz.heart.y) < mz.heart.r;
    if (!p.maze) {
      if (atHeart) { p.maze = { done: true }; continue; }   // (already in the middle: logged in there, say)
      p.maze = { t0: world.time };
      world.notify(p, "The clock's running: find your way to the gazebo in the middle.", 'info');
      p.meDirty = true;
    } else if (!p.maze.done && atHeart) finishMaze(world, p, world.time - p.maze.t0);
  }
}
function finishMaze(world, p, t) {
  const prof = p.profile, first = !prof.mazeBest, best = !first && t < prof.mazeBest;
  p.maze = { done: true };
  if (first || best) prof.mazeBest = +t.toFixed(1);
  const board = (world.mazeBoard ||= []);
  const mine = board.find((q) => q.pid === p.pid);
  if (!mine) board.push({ pid: p.pid, name: p.name, t }); else if (t < mine.t) mine.t = t;
  board.sort((a, b) => a.t - b.t); board.length = Math.min(board.length, 5);
  const today = board.map((q, i) => `${i + 1}. ${q.name} ${clock(q.t)}`).join(', ');
  let msg = `You found the middle in ${clock(t)}!`;
  if (first) { prof.cash += MAZE_PRIZE; msg += ` Your first time through - the gardeners hand you $${MAZE_PRIZE}.`; }
  else if (best) msg += ' A new personal best.';
  else msg += ` Your best is ${clock(prof.mazeBest)}.`;
  world.notify(p, msg, 'good');
  world.notify(p, `Today's fastest: ${today}`, 'info');
  p.meDirty = true;
  store.touch();
}
// the HUD tracker while the clock runs (the job slot): the time so far, the gazebo marked
export function mazeTarget(world, p) {
  const mz = maze(world.map);
  if (!mz || !p.maze || p.maze.done) return null;
  return { text: `Bluffs Maze: ${clock(world.time - p.maze.t0).replace(/\.\d$/, '')} - find the gazebo in the middle`, x: mz.heart.x, y: mz.heart.y, stage: 'maze' };
}

// ---- a lap of the Stadium Lido -------------------------------------------------------------------------------------
// The lanes run from the shallow end's wall (west) to the rope across the deep end. In the water by the wall you're
// ready; push off and the clock runs; touch the rope line and turn; back at the wall: your time. Out of the water
// (or out of the lanes) and the lap is off. p.lap: { phase: 'wall' | 'out' | 'back', t0 }.
const LAP_WALL = 40, LAP_ROPE = 36;
function lido(map) {
  if (map._lido === undefined) Object.defineProperty(map, '_lido', { value: (map.pools || []).find((q) => q.deep && q.lanes) || null, enumerable: false, configurable: true });
  return map._lido;
}
function lapStep(world) {
  const pool = lido(world.map);
  if (!pool) return;
  const x0 = pool.x, x1 = pool.deep.x;
  for (const p of world.players.values()) {
    const ped = p.ped, L = p.lap;
    const inLanes = !!ped && !ped.dead && !ped.vehId && !ped.hidden && ped.x >= x0 && ped.x < x1 + 8 && ped.y >= pool.y && ped.y < pool.y + pool.h && isSwimming(world.map, ped);
    if (!inLanes) {
      if (L && L.phase !== 'wall' && ped && !ped.dead) world.notify(p, 'Out of the lanes - the lap is off.', 'info');
      if (L) { p.lap = null; p.meDirty = true; }
      continue;
    }
    const atWall = ped.x < x0 + LAP_WALL, atRope = ped.x > x1 - LAP_ROPE;
    if (!L) { if (atWall) { p.lap = { phase: 'wall' }; world.notify(p, 'Push off the wall to start the clock: to the rope across the deep end and back.', 'info'); p.meDirty = true; } continue; }
    if (L.phase === 'wall' && !atWall) { L.phase = 'out'; L.t0 = world.time; p.meDirty = true; }
    else if (L.phase === 'out' && atRope) { L.phase = 'back'; world.notify(p, 'Turn!', 'info'); p.meDirty = true; }
    else if (L.phase === 'back' && atWall) finishLap(world, p, world.time - L.t0);
  }
}
function finishLap(world, p, t) {
  const prof = p.profile, first = !prof.lapBest, best = !first && t < prof.lapBest;
  p.lap = { phase: 'wall' };   // (ready for another)
  if (first || best) prof.lapBest = +t.toFixed(1);
  const board = (world.lapBoard ||= []);
  const mine = board.find((q) => q.pid === p.pid);
  if (!mine) board.push({ pid: p.pid, name: p.name, t }); else if (t < mine.t) mine.t = t;
  board.sort((a, b) => a.t - b.t); board.length = Math.min(board.length, 5);
  let msg = `A lap in ${clock(t)}!`;
  if (first) { prof.cash += LAP_PRIZE; msg += ` Your first - the kiosk stands you $${LAP_PRIZE}.`; }
  else if (best) msg += ' A new personal best.';
  else msg += ` Your best is ${clock(prof.lapBest)}.`;
  world.notify(p, msg, 'good');
  world.notify(p, `Today's fastest: ${board.map((q, i) => `${i + 1}. ${q.name} ${clock(q.t)}`).join(', ')}`, 'info');
  p.meDirty = true;
  store.touch();
}
// the HUD tracker while you swim a lap: the time so far, the rope or the wall marked
export function lapTarget(world, p) {
  const pool = lido(world.map), L = p.lap;
  if (!pool || !L || L.phase === 'wall') return null;
  const back = L.phase === 'back';
  return { text: `Lido lap: ${clock(world.time - L.t0).replace(/\.\d$/, '')} - ${back ? 'back to the wall' : 'to the rope and back'}`, x: Math.round(back ? pool.x + 8 : pool.deep.x), y: Math.round(pool.y + pool.h / 2), stage: 'lap' };
}
