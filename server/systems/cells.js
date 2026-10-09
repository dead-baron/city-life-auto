// The cells at the back of every police station (task #362 part 3; shared/cells.js lays them out). A prisoner is a real
// person in the world there, not hidden: they walk round their cell, sit on the bench or the toilet, or stand at the bars
// holding them (the action button), and other players and visitors see them. Several share a cell (up to CELL_CAP; task
// #380): each on a spot of their own - three places on the bench, the toilet, three at the bars, four standing about
// (spots) - nobody put down, sat or walked in on top of anyone else, and a prisoner walking into a cellmate is held off
// them. A player booked where others are doing time is often put in with them (CELL_SHARE), and a block they're booked
// into has a couple of NPCs in it at least (CELL_REGULARS: the drunk sleeping it off, a petty crook).
//
// Nobody in a cell block - the cells and the corridor in front of them - can hurt anyone or be hurt (the owner's note,
// 2026-10-08): no damage, knockdowns, tackles or grabs, by or to anyone there (ped.cellSafe: combat.js), and weapons
// are put away there (back in your hand when you walk out). NPC crooks the police arrest serve a while in the nearest
// station's cells too, so the cells aren't always empty (they're only made flesh while a player is near).
//
//   p.custody.cell: { b, c } the block (map.cellBlocks index) and the cell a prisoner is in
//   ped.sitBench / ped.holdBars: sitting (the bench or the toilet: ped.seat2 'bench' | 'toilet') / at the bars
//   bang(world, p, ped): the fight button in a cell (task #379) - at the bars, they're rattled; by a wall, a fist on it
//     ('bang' event k 1 | 2: the client's 'bang' and 'thump' poses, a clang or a thud for anyone near)
import { K } from '../../shared/constants.js';
import { pedStep } from '../../shared/physics.js';
import { cellBlockAt, inCellRect, CELL_CAP } from '../../shared/cells.js';
import { INMATE_S, CELL_SHARE, CELL_REGULARS } from '../../shared/rules.js';
import { spawnNpc, despawnNpc } from './npc.js';
import * as players from './players.js';
import * as combat from './combat.js';
import { inAnyView } from '../view.js';

const NEAR_PX = 1000, FAR_PX = 1400;
const SPOT_PX = 30;   // this close to the bench, the toilet or the bars: the action button uses it

export const blocks = (world) => world.map.cellBlocks || [];
export const blockOf = (world, poiId) => blocks(world).findIndex((k) => k.poi === poiId);

// ---- who's in which cell -------------------------------------------------------------------------------------------
export function occupants(world, b, c) {
  let n = 0;
  for (const p of world.players.values()) { const q = p.custody && p.custody.cell; if (q && q.b === b && q.c === c && p.ped && !p.ped.removed) n++; }
  for (const m of world.inmates || []) if (m.b === b && m.c === c) n++;
  return n;
}
// the cell with the fewest people in it (the first of them), up to CELL_CAP; a full block packs them in anyway
export function freeCell(world, b) {
  const k = blocks(world)[b];
  if (!k) return -1;
  let best = 0, bn = Infinity;
  for (let c = 0; c < k.cells.length; c++) { const n = occupants(world, b, c); if (n < bn) { bn = n; best = c; } }
  return best;
}
// The cell a new prisoner goes in (task #380): often in with an NPC doing time (a cell with room, no other player in it -
// players spread over the cells first), else the one with the fewest in it
export function cellFor(world, b) {
  const k = blocks(world)[b];
  if (!k) return -1;
  const company = [];
  for (let c = 0; c < k.cells.length; c++) {
    if (occupants(world, b, c) >= CELL_CAP || !(world.inmates || []).some((m) => m.b === b && m.c === c)) continue;
    if ([...world.players.values()].some((p) => p.custody && p.custody.cell && p.custody.cell.b === b && p.custody.cell.c === c)) continue;
    company.push(c);
  }
  if (company.length && world.rand() < CELL_SHARE) return company[Math.floor(world.rand() * company.length) % company.length];
  return freeCell(world, b);
}
// The places in a cell (cached): three on the bench, the toilet, three at the bars, four standing about the floor
const SPOTS = new WeakMap();
export function spots(cell) {
  let S = SPOTS.get(cell);
  if (S) return S;
  const mx = (cell.x0 + cell.x1) / 2, my = (cell.y0 + cell.y1) / 2, a = cell.a, at = (kind) => ([x, y]) => ({ x, y, a, kind });
  S = {
    bench: [[cell.bench.x, cell.bench.y], [cell.bench.x - 20, cell.bench.y], [cell.bench.x + 20, cell.bench.y]].map(at('bench')),
    toilet: [[cell.toilet.x, cell.toilet.y]].map(at('toilet')),
    bars: [[mx, cell.front], [cell.x0 + 14, cell.front], [cell.x1 - 14, cell.front]].map(at('bars')),
    floor: [[mx - 22, my], [mx + 20, my], [cell.x0 + 8, my], [cell.x1 - 8, my]].map(at('floor')),
  };
  SPOTS.set(cell, S);
  return S;
}
const ROOM = 16;   // px: a spot this close to someone else (or to the spot a prisoner's being walked to) is taken
// nobody (but `me`) on, or being walked to, (x, y)
export function isFree(world, x, y, me = null, r = ROOM) {
  if (world.query(x, y, r + 4, K.PED).some((e) => e !== me && !e.dead && !e.removed && Math.hypot(e.x - x, e.y - y) < r)) return false;
  for (const p of world.players.values()) { const s = p.custody && p.custody.spot; if (s && p.ped !== me && Math.hypot(s.x - x, s.y - y) < r) return false; }
  return true;
}
// a free spot in cell c of block b, of the first kind in `kinds` that has one (null: none free)
export function freeSpot(world, b, c, me = null, kinds = ['floor', 'bars', 'bench']) {
  const S = spots(blocks(world)[b].cells[c]);
  for (const k of kinds) for (const s of S[k]) if (isFree(world, s.x, s.y, me)) return s;
  return null;
}
// a spot in cell c of block b nobody stands on (or is being walked to): standing about first
export function spotIn(world, b, c, avoid = null) {
  const cell = blocks(world)[b].cells[c];
  return freeSpot(world, b, c, avoid, ['floor', 'bars']) || { x: (cell.x0 + cell.x1) / 2, y: (cell.y0 + cell.y1) / 2, a: cell.a, kind: 'floor' };
}
// someone else right where they are
export const crowded = (world, ped) => !isFree(world, ped.x, ped.y, ped, ROOM - 2);

// ---- the doors ------------------------------------------------------------------------------------------------------
// open (props off) or locked; the clank for anyone near (client/sound/events.js 'celldoor')
export function setDoor(world, b, c, open) {
  const cell = blocks(world)[b]?.cells[c];
  if (!cell) return;
  world.cellDoors ??= new Map();
  const key = b * 8 + c;
  if (!!world.cellDoors.get(key) === open) return;
  if (open) world.cellDoors.set(key, world.time); else world.cellDoors.delete(key);
  for (const e of cell.door.props) e.off = open;
  world.emit(cell.door.x, cell.door.y, { e: 'celldoor', x: Math.round(cell.door.x), y: Math.round(cell.door.y), b, c, open: open ? 1 : 0 });
}
export const doorOpen = (world, b, c) => !!(world.cellDoors && world.cellDoors.get(b * 8 + c));

// ---- every tick ---------------------------------------------------------------------------------------------------
export function update(world) {
  const list = blocks(world);
  if (!list.length) return;
  // the cell blocks: weapons away there; in a cell (and a prisoner or the officers walking one in) nobody hurts or is
  // hurt (combat.js reads ped.cellSafe) - the corridor itself is no sanctuary for someone on the run
  const was = world.cellSafe || new Set(), now = new Set();
  for (const k of list) {
    const r = Math.hypot(k.x1 - k.x0, k.y1 - k.y0) / 2 + 20;
    for (const e of world.query((k.x0 + k.x1) / 2, (k.y0 + k.y1) / 2, r, K.PED)) {
      if (e.removed || e.vehId || e.x < k.x0 || e.x > k.x1 || e.y < k.y0 || e.y > k.y1 || (e.lz || 0) > 0.3) continue;
      now.add(e);
      e.cellSafe = !!((e.player && e.player.custody) || (e.npc && (e.npc.jailer || e.npc.inmate)) || k.cells.some((c) => inCellRect(c, e.x, e.y, 8)));
      holster(world, e);
    }
  }
  for (const e of was) if (!now.has(e)) { e.cellSafe = false; unholster(world, e); }
  world.cellSafe = now;
  // nobody leaves a cell but through its door with the police: a prisoner found outside theirs is put back; and nobody
  // stands in anybody else - one walking into a cellmate is held off them (task #380)
  for (const p of world.players.values()) {
    const c = p.custody, ped = p.ped;
    if (!c || c.stage !== 'cell' || !c.cell || !ped || ped.dead) continue;
    const cell = list[c.cell.b]?.cells[c.cell.c];
    if (!cell) continue;
    let moved = false;
    if (!ped.sitBench && !ped.holdBars) for (const e of world.query(ped.x, ped.y, ROOM + 4, K.PED)) {
      if (e === ped || e.dead || e.removed) continue;
      const dx = ped.x - e.x, dy = ped.y - e.y, d = Math.hypot(dx, dy);
      if (d >= ROOM - 2) continue;
      if (d < 0.01) ped.x += ROOM - 2; else { ped.x += dx / d * (ROOM - 2 - d); ped.y += dy / d * (ROOM - 2 - d); }
      moved = true;
    }
    if (!inCellRect(cell, ped.x, ped.y, 2)) { ped.x = Math.max(cell.x0, Math.min(cell.x1, ped.x)); ped.y = Math.max(cell.y0, Math.min(cell.y1, ped.y)); moved = true; }   // (2 px: what a body sinks between two bars at a corner)
    if (moved) world.place(ped);
  }
  // a door opened to let someone out shuts again (one a prisoner's being walked through waits for them: custody.js)
  if (world.cellDoors && world.cellDoors.size) for (const [key, at] of world.cellDoors) {
    if (world.time - at < 1.5) continue;
    const b = Math.floor(key / 8), c = key % 8;
    if (![...world.players.values()].some((p) => p.custody && p.custody.stage === 'walkin' && p.custody.cell && p.custody.cell.b === b && p.custody.cell.c === c)) setDoor(world, b, c, false);
  }
  if (world.tick % 20 === 9) { inmates(world); escorts(world); }
}

// The officers who walked a prisoner in go back to the front office (npc.js walks them to their desk spot) and are
// gone once nobody's looking (or after a while anyway).
export function dismiss(world, e, to) {
  e.npc.desk = to ? { x: to.x, y: to.y, a: e.a } : { x: e.x, y: e.y, a: e.a };
  (world.cellEscorts ??= []).push({ id: e.id, until: world.time + 25 });
}
function escorts(world) {
  const list = world.cellEscorts;
  if (!list || !list.length) return;
  for (let i = list.length - 1; i >= 0; i--) {
    const q = list[i], e = world.get(q.id);
    if (!e || e.removed) { list.splice(i, 1); continue; }
    if (world.time >= q.until || (world.time >= q.until - 20 && !inAnyView(world, e.x, e.y, 40))) { despawnNpc(world, e); list.splice(i, 1); }
  }
}

// weapons away in the cell block (and back in hand on the way out)
function holster(world, e) {
  if (!e.weapon || e.weapon === 'fists') return;
  e.cellWpn = e.weapon;
  e.weapon = 'fists'; e.reloadUntil = 0; e.pendingReload = null;
  if (e.player) e.player.meDirty = true;
}
function unholster(world, e) {
  const w = e.cellWpn;
  e.cellWpn = null;
  if (!w || e.dead || e.weapon !== 'fists') return;
  if (e.player) combat.selectWeapon(world, e, w); else e.weapon = w;
}

// ---- a prisoner's own moves (players.applyInput while in a cell) ----------------------------------------------------
export function input(world, p, ped, inp, dt) {
  const moving = Math.abs(inp.mx) > 0.3 || Math.abs(inp.my) > 0.3;
  if (ped.sitBench || ped.holdBars) {
    if (moving) standUp(ped);
    else { ped.vx = 0; ped.vy = 0; return; }
  }
  pedStep(ped, { ...inp, bits: 0 }, dt, world.map, { ...players.pedMods(world, ped), canSprint: false });
}
function standUp(ped) {
  if (!ped.sitBench && !ped.holdBars) return;
  ped.sitBench = false; ped.holdBars = false; ped.seat2 = null;
  ped.appVer = (ped.appVer || 0) + 1;
}

// The action button in a cell: sit on the bench, sit on the toilet, hold the bars - whichever you're by - or get up.
export function interaction(world, p) {
  const ped = p.ped, c = p.custody && p.custody.cell;
  const cell = c ? blocks(world)[c.b]?.cells[c.c] : null;
  if (!ped || !cell) return null;
  if (ped.sitBench) return { label: ped.seat2 === 'toilet' ? 'Get up off the toilet' : 'Get up', run: () => standUp(ped) };
  if (ped.holdBars) return { label: 'Let go of the bars', run: () => standUp(ped) };
  const dBench = Math.abs(ped.x - cell.bench.x) < 40 && Math.abs(ped.y - cell.bench.y) < SPOT_PX ? Math.hypot(ped.x - cell.bench.x, ped.y - cell.bench.y) : Infinity;
  const dToilet = Math.hypot(ped.x - cell.toilet.x, ped.y - cell.toilet.y);
  const dBars = Math.abs(ped.y - cell.front) < SPOT_PX * 0.8 ? Math.abs(ped.y - cell.front) : Infinity;
  const best = Math.min(dBench, dToilet < SPOT_PX ? dToilet : Infinity, dBars);
  if (best === Infinity) return null;
  if (best === dBench) return { label: 'Sit on the bench', run: () => sit(world, p, cell, 'bench') };
  if (best === dToilet) return { label: 'Sit on the toilet', run: () => sit(world, p, cell, 'toilet') };
  return { label: 'Hold the bars', run: () => holdBars(world, p, cell) };
}
export function sit(world, p, cell, where) {
  const ped = p.ped;
  // the toilet, or the place on the bench nearest them that's free
  const list = where === 'toilet' ? spots(cell).toilet : [...spots(cell).bench].sort((a, b) => Math.abs(a.x - ped.x) - Math.abs(b.x - ped.x));
  const spot = list.find((s) => isFree(world, s.x, s.y, ped, 12)) || null;
  if (!spot) { world.notify(p, where === 'toilet' ? 'Occupied.' : 'No room on the bench.', 'warn'); return; }
  ped.x = spot.x; ped.y = spot.y; ped.a = spot.a; ped.vx = 0; ped.vy = 0;
  world.place(ped);
  ped.holdBars = false; ped.sitBench = true; ped.seat2 = where;
  ped.appVer = (ped.appVer || 0) + 1;
  p.teleportAt = world.time;
}
export function holdBars(world, p, cell) {
  const ped = p.ped;
  // where they stand, or the nearest free place along the bars
  const x0 = Math.max(cell.x0, Math.min(cell.x1, ped.x));
  let x = null;
  for (let d = 0; d <= cell.x1 - cell.x0 && x === null; d += 4) for (const s of d ? [-1, 1] : [1]) {
    const q = x0 + s * d;
    if (q >= cell.x0 && q <= cell.x1 && isFree(world, q, cell.front, ped, 18)) { x = q; break; }
  }
  if (x === null) { world.notify(p, 'No room at the bars.', 'warn'); return; }
  ped.x = x; ped.y = cell.front; ped.a = cell.a; ped.vx = 0; ped.vy = 0;
  world.place(ped);
  ped.sitBench = false; ped.seat2 = null; ped.holdBars = true;
  ped.appVer = (ped.appVer || 0) + 1;
  p.teleportAt = world.time;
}
export function clearPose(ped) { if (ped) standUp(ped); }

// The fight button in a cell (task #379; the owner, 09:17: "if you tap fight you will bang on the bars or hit the wall"):
// at the bars (holding them, or standing right at them) they're rattled; by a wall, a fist on it, turned to face it.
// Nobody is hurt in a cell (cellSafe), so there's nothing else a punch could do there.
const BANG_GAP_S = 0.3, WALL_PX = 24;
export function bang(world, p, ped) {
  const c = p.custody && p.custody.cell, cell = c ? blocks(world)[c.b]?.cells[c.c] : null;
  if (!cell || ped.sitBench || world.time - (ped.bangAt ?? -9) < BANG_GAP_S) return 0;
  let k = 0, a = ped.a;
  if (ped.holdBars || Math.abs(ped.y - cell.front) < 16) { k = 1; a = cell.a; }
  else {
    // the nearest wall but the bars: the back, or a side
    const back = Math.abs(cell.front - cell.y0) < Math.abs(cell.front - cell.y1) ? cell.y1 : cell.y0;
    const walls = [[Math.abs(ped.y - back), back > ped.y ? Math.PI / 2 : -Math.PI / 2], [ped.x - cell.x0, Math.PI], [cell.x1 - ped.x, 0]];
    const [d, wa] = walls.reduce((m, w) => (w[0] < m[0] ? w : m));
    if (d < WALL_PX) { k = 2; a = wa; }
  }
  if (!k) return 0;
  ped.bangAt = world.time; ped.a = a;
  world.emit(ped.x, ped.y, { e: 'bang', id: ped.id, k, x: Math.round(ped.x), y: Math.round(ped.y) });
  return k;
}

// ---- NPC crooks doing time (law.js arrest) -------------------------------------------------------------------------
// The arrested NPC serves INMATE_S in the nearest station's cells: kept as a record, made flesh only while a player is
// near (and gone again when nobody is).
export function lockUp(world, ped) {
  const list = blocks(world);
  if (!list.length || !ped || !ped.app) return;
  let b = -1, bd = Infinity;
  for (let i = 0; i < list.length; i++) { const d = Math.hypot((list[i].x0 + list[i].x1) / 2 - ped.x, list[i].y0 - ped.y); if (d < bd) { bd = d; b = i; } }
  world.inmates ??= [];
  if (world.inmates.filter((m) => m.b === b).length >= 6) return;   // (the block's full of them: let one go)
  const c = cellFor(world, b);
  if (occupants(world, b, c) >= CELL_CAP) return;
  world.inmates.push({ b, c, app: ped.app, ar: ped.archetype, until: world.time + INMATE_S, ped: 0, pose: Math.floor(world.rand() * 3) });
}
// A player booked into block b (custody.js): a couple of NPCs doing time there at least (CELL_REGULARS), so the cells
// aren't empty and there's someone to share one with (task #380)
const REGULARS = ['drunk', 'drunk', 'hustler', 'mugger', 'casual', 'construction', 'syndicate'];
export function regulars(world, b) {
  if (!blocks(world)[b]) return;
  world.inmates ??= [];
  for (let n = world.inmates.filter((m) => m.b === b).length; n < CELL_REGULARS; n++) {
    const c = cellFor(world, b);
    if (occupants(world, b, c) >= CELL_CAP) return;
    world.inmates.push({ b, c, app: null, ar: REGULARS[Math.floor(world.rand() * REGULARS.length) % REGULARS.length], until: world.time + INMATE_S, ped: 0, pose: Math.floor(world.rand() * 3) });
  }
}
function inmates(world) {
  const list = world.inmates;
  if (!list || !list.length) return;
  const people = [...world.players.values()].filter((p) => p.ped && !p.ped.dead).map((p) => p.ped);
  for (let i = list.length - 1; i >= 0; i--) {
    const m = list[i], k = blocks(world)[m.b], cx = (k.x0 + k.x1) / 2, cy = (k.y0 + k.y1) / 2;
    const d = people.reduce((a, e) => Math.min(a, Math.hypot(e.x - cx, e.y - cy)), Infinity);
    const e = m.ped ? world.get(m.ped) : null;
    if (m.ped && (!e || e.removed || e.dead)) m.ped = 0;
    if (world.time >= m.until && (!e || !inAnyView(world, e.x, e.y, 40))) { if (e) despawnNpc(world, e); list.splice(i, 1); continue; }
    if (e && d > FAR_PX) { despawnNpc(world, e); m.ped = 0; continue; }
    if (!e && d < NEAR_PX) m.ped = spawnInmate(world, m, k).id;
  }
}
// made flesh on a free spot of their own (task #380): on the bench, at the bars or standing about, as they were - or
// whichever is free
const POSE_KIND = ['bench', 'bars', 'floor'];
function spawnInmate(world, m, k) {
  const cell = k.cells[m.c], want = POSE_KIND[m.pose] || 'floor';
  const spot = freeSpot(world, m.b, m.c, null, [want, ...POSE_KIND.filter((q) => q !== want)]) || spotIn(world, m.b, m.c);
  const e = spawnNpc(world, m.ar || 'casual', spot.x, spot.y, 'civ');
  if (m.app) { e.app = m.app; e.appVer = (e.appVer || 0) + 1; } else m.app = e.app;   // (a regular keeps the look they're given)
  e.weapon = 'fists'; e.a = spot.a ?? cell.a;
  e.npc.desk = { x: spot.x, y: spot.y, a: e.a };   // (npc.js keeps them on the spot, as it does shop staff)
  e.npc.inmate = true;
  m.pose = Math.max(0, POSE_KIND.indexOf(spot.kind));
  if (spot.kind === 'bench') { e.sitBench = true; e.seat2 = 'bench'; } else if (spot.kind === 'bars') e.holdBars = true;
  return e;
}

// for the tests and the dev tools: the block and cell a point is in
export const at = (world, x, y) => cellBlockAt(world.map, x, y);
