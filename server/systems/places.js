// Small things to do at the designed places (shared/naturesites.js):
//   - ring the old mission's bells: stand at its great doorway and haul on the rope, and three slow strikes carry
//     out over the desert for everyone near;
//   - the coin telescope at the end of Westport Pier: a dollar, and your view swings out over the bay to the seals
//     on their islets for a few seconds (the camera only: you stay where you are);
//   - strip the Dry Creek Boneyard's stored airliners for parts: stand by a fuselage and work at it a few seconds
//     (standing still) for component scrap - the yard office by the gate buys it - then that plane is stripped bare
//     a while;
//   - the Bluffs Maze against the clock: in through any gate and the clock runs until you find the gazebo in the
//     middle. Your best time is kept, the day's fastest are listed when you finish, and the first time you make it
//     the gardeners pay you a prize.
import { payFrom } from './economy.js';
import { ITEMS } from '../../shared/items.js';
import { SALVAGE_S, SALVAGE_REGROW_S, SALVAGE_REACH, MAZE_PRIZE } from '../../shared/rules.js';
import { store } from '../store.js';
const BELL_REACH = 48, BELL_RING_S = 6, SCOPE_REACH = 40, SCOPE_S = 7, SCOPE_PRICE = 1, SALVAGE_MOVE_PX = 14;

function site(map, key, find) {
  if (map[key] === undefined) Object.defineProperty(map, key, { value: (map.natureSites || []).find(find) || null, enumerable: false, configurable: true });
  return map[key];
}
const mission = (map) => site(map, '_mission', (q) => q.kind === 'mission');
const pier = (map) => site(map, '_pier', (q) => q.kind === 'pier' && q.scope);
const boneyard = (map) => site(map, '_boneyard', (q) => q.kind === 'boneyard' && q.stored);
const maze = (map) => site(map, '_maze', (q) => q.kind === 'maze' && q.rect);

// the stored plane whose fuselage you're standing by (its index in the boneyard's list), or -1
export function planeNear(world, x, y) {
  const by = boneyard(world.map);
  if (!by || x < by.rect.x0 || x > by.rect.x1 || y < by.rect.y0 || y > by.rect.y1) return -1;
  let best = -1, bd = SALVAGE_REACH;
  by.stored.forEach((q, i) => {
    const ux = Math.cos(q.a), uy = Math.sin(q.a), t = Math.max(-q.half, Math.min(q.half, (x - q.x) * ux + (y - q.y) * uy));
    const d = Math.hypot(x - (q.x + ux * t), y - (q.y + uy * t));
    if (d < bd) { bd = d; best = i; }
  });
  return best;
}
const strippedFor = (world, i) => Math.max(0, ((world.stripped && world.stripped.get(i)) || 0) - world.time);

export function interaction(world, p) {
  const ped = p.ped;
  if (!ped || ped.vehId) return null;
  if (ped.salvage) return { label: 'Stripping parts off the plane... (stand still)', passive: true, run: () => {} };
  const ms = mission(world.map);
  if (ms && Math.hypot(ped.x - ms.door.x, ped.y - ms.door.y) < BELL_REACH) return { label: 'Ring the mission bells', run: () => ringBells(world, p) };
  const pr = pier(world.map);
  if (pr && Math.hypot(ped.x - pr.scope.x, ped.y - pr.scope.y) < SCOPE_REACH) return { label: `Look through the telescope ($${SCOPE_PRICE})`, run: () => lookOut(world, p) };
  const i = planeNear(world, ped.x, ped.y);
  if (i >= 0) {
    const bare = strippedFor(world, i);
    if (bare > 0) return { label: `Stripped bare - nothing worth taking for ${Math.ceil(bare / 60)} min`, run: () => world.notify(p, 'Someone has had everything worth taking off this one. Try another plane.', 'info') };
    return { label: 'Strip parts off the plane', run: () => beginSalvage(world, p, i) };
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
export function beginSalvage(world, p, i) {
  const ped = p.ped;
  if (!ped || ped.dead || ped.vehId || ped.hidden) return 'Not right now.';
  if (ped.carrying) { world.notify(p, 'Set the crate down first.', 'warn'); return 'busy'; }
  if (strippedFor(world, i) > 0) return 'Stripped bare.';
  ped.salvage = { i, at: world.time, x: ped.x, y: ped.y };
  ped.vx = 0; ped.vy = 0;
  world.notify(p, 'You get to work on the plane with a wrench... (stand still)', 'info');
  p.meDirty = true;
  return null;
}

export function update(world) {
  if (world.tick % 2) return;
  salvageStep(world);
  mazeStep(world);
}

// Working on a plane: stand still SALVAGE_S and the parts are yours (moving, a hit or getting in a car stops you).
function salvageStep(world) {
  for (const p of world.players.values()) {
    const ped = p.ped, s = ped && ped.salvage;
    if (!s) continue;
    if (ped.dead || ped.vehId || ped.hidden || world.time < ped.downUntil || (ped.lastHitAt || -99) > s.at || Math.hypot(ped.x - s.x, ped.y - s.y) > SALVAGE_MOVE_PX) {
      ped.salvage = null;
      if (!ped.dead) world.notify(p, 'You stopped working on the plane.', 'warn');
      p.meDirty = true;
      continue;
    }
    if (world.time - s.at < SALVAGE_S) continue;
    ped.salvage = null;
    if (strippedFor(world, s.i) > 0) { world.notify(p, 'Someone beat you to it.', 'info'); continue; }
    (world.stripped ||= new Map()).set(s.i, world.time + SALVAGE_REGROW_S);
    const n = world.rand() < 0.25 ? 2 : 1, inv = p.profile.inventory;
    inv.scrap = (inv.scrap || 0) + n;
    world.notify(p, `${n === 1 ? 'A piece' : 'Two pieces'} of ${ITEMS.scrap.name.toLowerCase()} - the yard office by the gate buys it.`, 'good');
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
