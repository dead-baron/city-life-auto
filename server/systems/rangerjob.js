// The park ranger (the owner's notes 2: "Park Ranger jobs"; the brief: "in the parks / wilderness - patrol trail points,
// help lost hikers, clear litter, put out an unattended campfire - pick a few that fit what the world has"). Sign on at a
// ranger station (Act by its door: the job's card), at a trailhead's map board out in the wild, or from the phone's Jobs
// app: the station's 4x4 is issued (the green ring), and the shift is tasks one after another round the station
// (shared/rules-work.js RANGER), each with its pay:
//   patrol   walk the trail: its waymarks, the map boards, the picnic spots in turn (on foot or in the 4x4)
//   litter   litter left at a picnic spot or by the trail: pick up every piece (Act by each)
//   fire     a campfire left burning with nobody by it: put it out (Act at it)
//   hiker    a lost hiker waving for help out in the woods: find them, Act, and they follow you (or climb in the 4x4)
//            back to the station
//   start(world, p, base)       sign on -> error | null
//   interaction(world, p)       on foot: the task's Act (pick up, put out, help) - or at a station, sign on (the card)
//   update(world, dt)           the tasks, the hiker following (world.js SYSTEMS)
//   target(world, p, j)         the job tracker's target (phone.js jobTarget)
//   baseFor(world, x, y)        the station (or trailhead) nearest (x, y)
import { K, T, TILE } from '../../shared/constants.js';
import { PED_BLOCK } from '../../shared/mapcore.js';
import { pedStep } from '../../shared/physics.js';
import { RANGER } from '../../shared/rules-work.js';
import { mulberry32 } from '../../shared/rng.js';
import { store } from '../store.js';
import { wildStyle } from './wildlife.js';
import { fireIdx, isLit, setLit } from './campfires.js';
import { spawnNpc, despawnNpc } from './npc.js';
import { openNear } from './firefighter.js';
import * as players from './players.js';
import * as jobs from './jobs.js';

const rng = mulberry32(4242);
const walk = (m, x, y) => { const t = m.tileAtPx(x, y); return !PED_BLOCK[t] && t !== T.WATER && t !== T.DEEP && t !== T.ROAD && t !== T.BRIDGE; };

// ---- the stations ------------------------------------------------------------------------------------------------------
const BASES = new WeakMap();
export function basesOf(m) {
  let L = BASES.get(m);
  if (L) return L;
  L = [];
  for (const b of m.buildings || []) {
    if (!b || b.kind !== 'ranger') continue;
    const x = (b.tx + b.tw / 2) * TILE, y = (b.ty + b.th) * TILE + 24;
    L.push({ x, y, name: b.name || 'the ranger station' });
  }
  for (const q of m.props || []) {
    if (!q || q.t !== 'mapboard' || !wildStyle(m, q.x, q.y) || L.some((b) => Math.hypot(b.x - q.x, b.y - q.y) < 900)) continue;
    const d = m.districtAt(q.x, q.y);
    L.push({ x: q.x, y: q.y + 20, name: `the ${d && d.name ? d.name + ' ' : ''}trailhead`, board: true });
  }
  BASES.set(m, L);
  return L;
}
export function baseFor(world, x, y) {
  const L = basesOf(world.map);
  return L.length ? L.reduce((a, b) => (Math.hypot(b.x - x, b.y - y) < Math.hypot(a.x - x, a.y - y) ? b : a)) : null;
}
// the wild country's landmarks near the base, for a task: the waymarks, map boards, picnic tables, campfires
const MARKS = new Set(['fingerpost', 'mapboard', 'picnic', 'campfire', 'cairn', 'bench_m', 'pbench']);
function marksNear(m, b) {
  const out = [];
  for (const q of m.props || []) if (q && MARKS.has(q.t)) { const d = Math.hypot(q.x - b.x, q.y - b.y); if (d > RANGER.area[0] && d < RANGER.area[1]) out.push(q); }
  return out;
}
// open ground in the wild country r0-r1 px from (x, y)
function groundNear(m, x, y, r0, r1) {
  for (let k = 0; k < 40; k++) {
    const a = rng() * Math.PI * 2, d = r0 + rng() * (r1 - r0), px = x + Math.cos(a) * d, py = y + Math.sin(a) * d;
    if (m.inside(Math.floor(px / TILE), Math.floor(py / TILE)) && walk(m, px, py) && walk(m, px + 14, py) && walk(m, px - 14, py) && (wildStyle(m, px, py) || m.districtAt(px, py)?.style === 'park')) return { x: px, y: py };
  }
  return null;
}

// ---- signing on ---------------------------------------------------------------------------------------------------------
export function start(world, p, base = null) {
  if (!p.ped || p.ped.dead) return 'Not right now.';
  if (p.job) return 'You already have a job - cancel it first.';
  base = base || baseFor(world, p.ped.x, p.ped.y);
  if (!base) return 'No ranger station is taking anyone on.';
  p.job = { type: 'ranger', stage: 'wait', truck: 0, base: { x: base.x, y: base.y, name: base.name }, task: null, done: 0, earned: 0, nextAt: world.time + RANGER.firstS, expires: world.time + RANGER.shiftS, order: [], text: 'Ranger: on duty - the radio will call' };
  const v = jobs.workTruck(world, p, base, 'jeep', { label: base.name });
  if (v) { v.tint = 6; v.descVer = (v.descVer || 0) + 1; }   // (the parks' green)
  world.notify(p, `Ranger shift at ${base.name}${v ? ': the station\'s 4x4 is the green ring' : ''}. Calls come over the radio - the trail to walk, litter to clear, a campfire left burning, a hiker who's lost.`, 'good', 'Ranger: on duty - the radio will call');
  p.meDirty = true;
  store.touch();
  return null;
}
function signOn(world, p) {
  const ped = p.ped;
  if (!ped || ped.dead || ped.vehId || p.job) return null;
  const b = basesOf(world.map).find((q) => Math.hypot(q.x - ped.x, q.y - ped.y) < (q.board ? 60 : 80));
  if (!b) return null;
  return { label: 'Sign on as a park ranger (the station\'s 4x4 is issued)', card: { id: 'ranger', where: b.name, start: () => start(world, p, b) }, run: () => { const err = start(world, p, b); if (err) world.notify(p, err, 'bad'); } };
}

// ---- the tasks ---------------------------------------------------------------------------------------------------------
const KINDS = ['patrol', 'litter', 'fire', 'hiker'];
function newTask(world, p) {
  const j = p.job;
  if (!j.order.length) { j.order = KINDS.slice(); for (let i = j.order.length - 1; i > 0; i--) { const k = Math.floor(rng() * (i + 1)); [j.order[i], j.order[k]] = [j.order[k], j.order[i]]; } }
  for (let tries = 0; tries < KINDS.length; tries++) {
    const k = j.order.shift();
    const t = k === 'patrol' ? patrolTask(world, j) : k === 'litter' ? litterTask(world, p, j) : k === 'fire' ? fireTask(world, j) : hikerTask(world, j);
    if (t) {
      j.task = t; j.stage = t.k;
      tellTask(world, p);
      return;
    }
    if (!j.order.length) j.order = KINDS.filter((q) => q !== k);
  }
  j.nextAt = world.time + 15;
}
function patrolTask(world, j) {
  const M = marksNear(world.map, j.base), pts = [];
  for (let k = 0; k < 30 && pts.length < RANGER.posts; k++) {
    const q = M.length && rng() < 0.75 ? M[Math.floor(rng() * M.length)] : groundNear(world.map, j.base.x, j.base.y, RANGER.area[0], RANGER.area[1] * 0.8);
    if (!q || pts.some((o) => Math.hypot(o.x - q.x, o.y - q.y) < 260)) continue;
    pts.push({ x: Math.round(q.x), y: Math.round(q.y + (MARKS.has(q.t) ? 22 : 0)) });
  }
  return pts.length >= 2 ? { k: 'patrol', pts, i: 0, pay: RANGER.pay.patrol } : null;
}
function litterTask(world, p, j) {
  const M = marksNear(world.map, j.base).filter((q) => q.t === 'picnic' || q.t === 'campfire' || q.t === 'bench_m' || q.t === 'pbench');
  const c = M.length ? M[Math.floor(rng() * M.length)] : groundNear(world.map, j.base.x, j.base.y, RANGER.area[0], RANGER.area[1] * 0.7);
  if (!c) return null;
  const ids = [];
  for (let k = 0; k < 40 && ids.length < RANGER.litter; k++) {
    const q = groundNear(world.map, c.x, c.y, 24, 110);
    if (!q || ids.some((id) => { const o = world.get(id); return Math.hypot(o.x - q.x, o.y - q.y) < 22; })) continue;
    const L = world.spawnCrate(1, q.x, q.y, { owner: p.pid, label: 'Litter', value: 0, contraband: false, job: { type: 'ranger', pid: p.pid }, expires: world.time + RANGER.shiftS });
    L.litter = true; L.a = rng() * Math.PI * 2;
    ids.push(L.id);
  }
  return ids.length >= 3 ? { k: 'litter', x: Math.round(c.x), y: Math.round(c.y), ids, n: ids.length, pay: RANGER.pay.litter } : (ids.forEach((id) => world.remove(world.get(id))), null);
}
function fireTask(world, j) {
  const m = world.map, L = fireIdx(m).filter((i) => { const q = m.props[i], d = Math.hypot(q.x - j.base.x, q.y - j.base.y); return d > 160 && d < RANGER.area[1] && !isLit(world, i) && !world.query(q.x, q.y, 200, K.PED).some((e) => e.player); });
  if (!L.length) return null;
  const i = L[Math.floor(rng() * L.length)];
  setLit(world, i, true);
  return { k: 'fire', i, x: Math.round(m.props[i].x), y: Math.round(m.props[i].y), pay: RANGER.pay.fire };
}
function hikerTask(world, j) {
  const at = groundNear(world.map, j.base.x, j.base.y, 500, RANGER.area[1]);
  if (!at) return null;
  const h = spawnNpc(world, 'hiker', at.x, at.y, 'civ');
  h.npc.sar = 'ranger'; h.npc.keep = true; h.pp = 'hail'; h.appVer = (h.appVer || 0) + 1;   // (npc.js leaves them to us; waving for help)
  h.name = 'a lost hiker';
  return { k: 'hiker', hiker: h.id, found: false, x: Math.round(at.x), y: Math.round(at.y), pay: RANGER.pay.hiker };
}
function tellTask(world, p) {
  const j = p.job, t = j.task, d = world.map.districtAt(t.x ?? t.pts[0].x, t.y ?? t.pts[0].y), where = d && d.name ? ` in ${d.name}` : '';
  const T = { patrol: `Radio: walk the trail - ${t.pts && t.pts.length} waymarks, marked in turn.`, litter: `Radio: litter left at a picnic spot${where}. Pick up every piece.`, fire: `Radio: a campfire's been left burning${where} with nobody by it. Put it out before it spreads.`, hiker: `Radio: a hiker's lost${where}. Find them and bring them back to ${j.base.name}.` };
  world.notify(p, T[t.k], 'warn');
  setText(p);
}
function setText(p) {
  const j = p.job, t = j.task;
  if (!t) { j.text = 'Ranger: on duty - the radio will call'; p.meDirty = true; return; }
  j.text = t.k === 'patrol' ? `Ranger: walk the trail - waymark ${t.i + 1} of ${t.pts.length}`
    : t.k === 'litter' ? `Ranger: pick up the litter (${t.ids.length} of ${t.n} left)`
      : t.k === 'fire' ? 'Ranger: put out the unattended campfire'
        : t.found ? `Ranger: lead the hiker back to ${j.base.name}` : 'Ranger: find the lost hiker';
  p.meDirty = true;
}
function taskDone(world, p, msg) {
  const j = p.job, t = j.task;
  p.profile.cash += t.pay; p.profile.samaritan = (p.profile.samaritan || 0) + 2;
  j.done++; j.earned += t.pay;
  j.task = null; j.stage = 'wait'; j.nextAt = world.time + RANGER.gapS;
  j.expires = Math.max(j.expires, world.time + RANGER.shiftS / 4);
  if (p.ped) world.emit(p.ped.x, p.ped.y, { e: 'cash', x: p.ped.x, y: p.ped.y });
  world.notify(p, `${msg} +$${t.pay}, +2 Samaritan.`, 'good');
  setText(p);
  store.touch();
}
function dropTask(world, j) {
  const t = j.task;
  if (!t) return;
  if (t.k === 'litter') for (const id of t.ids) { const c = world.get(id); if (c) world.remove(c); }
  if (t.k === 'fire' && isLit(world, t.i)) setLit(world, t.i, false);
  if (t.k === 'hiker') { const h = world.get(t.hiker); if (h && !h.removed) leaveHiker(world, h); }
  j.task = null;
}
function leaveHiker(world, h) {
  if (h.vehId) {
    const v = world.get(h.vehId);
    if (v) { const i = v.seats.indexOf(h.id); if (i >= 0) v.seats[i] = 0; const o = openNear(world.map, v.x + v.def.W, v.y) || { x: v.x, y: v.y + v.def.W }; h.x = o.x; h.y = o.y; }
    h.vehId = 0; h.seat = -1; world.place(h);
  }
  h.npc.sar = 0; h.npc.keep = false; h.npc.state = 'wander'; h.pp = null; h.appVer = (h.appVer || 0) + 1;
}

// ---- Act on foot ------------------------------------------------------------------------------------------------------
export function interaction(world, p) {
  const ped = p.ped, j = p.job;
  if (!ped || ped.dead) return null;
  if (!j || j.type !== 'ranger') return signOn(world, p);
  const t = j.task;
  if (!t || ped.vehId) return null;
  if (t.k === 'litter') {
    let best = null, bd = RANGER.pickR;
    for (const id of t.ids) { const c = world.get(id); if (!c) continue; const d = Math.hypot(c.x - ped.x, c.y - ped.y); if (d < bd) { bd = d; best = c; } }
    if (best) return { label: `Pick up the litter (${t.ids.length} left)`, run: () => pickLitter(world, p, best) };
  }
  if (t.k === 'fire' && Math.hypot(t.x - ped.x, t.y - ped.y) < RANGER.fireR) return { label: 'Put out the unattended campfire', run: () => { setLit(world, t.i, false); world.emit(t.x, t.y, { e: 'splash', x: t.x, y: t.y, n: 6 }); taskDone(world, p, 'Fire\'s out - dirt kicked over the embers.'); } };
  if (t.k === 'hiker' && !t.found) {
    const h = world.get(t.hiker);
    if (h && Math.hypot(h.x - ped.x, h.y - ped.y) < RANGER.findR) return { label: 'Help the lost hiker (they\'ll follow you)', run: () => { t.found = true; h.pp = null; h.appVer = (h.appVer || 0) + 1; world.emit(h.x, h.y, { e: 'say', id: h.id, x: h.x, y: h.y, text: 'Oh, thank goodness - I\'ve been going round in circles!' }); setText(p); } };
  }
  return null;
}
function pickLitter(world, p, c) {
  const t = p.job.task;
  t.ids = t.ids.filter((id) => id !== c.id);
  world.remove(c);
  world.emit(c.x, c.y, { e: 'thud', x: c.x, y: c.y });
  if (!t.ids.length) taskDone(world, p, 'Every piece picked up - the spot\'s clean.');
  else setText(p);
}

// ---- every tick ---------------------------------------------------------------------------------------------------------
export function update(world, dt) {
  if (world.tick % 100 === 37) tidy(world);
  for (const p of world.players.values()) {
    const j = p.job;
    if (!j || j.type !== 'ranger') continue;
    const ped = p.ped, now = world.time, t = j.task;
    if (!t) {
      if (now >= j.expires) { world.notify(p, `Shift over: ${j.done} task${j.done === 1 ? '' : 's'}, $${j.earned}.`, 'good'); jobs.jobDone(world, p); continue; }
      if (now >= j.nextAt && ped && !ped.dead) newTask(world, p);
      continue;
    }
    if (!ped || ped.dead) continue;
    const at = ped.vehId ? world.get(ped.vehId) || ped : ped;
    if (t.k === 'patrol') {
      const q = t.pts[t.i];
      if (Math.hypot(q.x - at.x, q.y - at.y) < RANGER.postR) {
        t.i++;
        world.emit(at.x, at.y, { e: 'thud', x: at.x, y: at.y });
        if (t.i >= t.pts.length) taskDone(world, p, 'Trail walked - all clear.');
        else setText(p);
      }
    } else if (t.k === 'fire') {
      if (!isLit(world, t.i)) setLit(world, t.i, true);   // (left burning till you get there)
    } else if (t.k === 'hiker') stepHiker(world, p, j, t, dt);
    // (the litter: an Act by each piece; a piece cleared away by anything else counts)
    if (j.task && j.task.k === 'litter') { const L = j.task; const n = L.ids.length; L.ids = L.ids.filter((id) => world.get(id)); if (!L.ids.length) taskDone(world, p, 'The spot\'s clean.'); else if (L.ids.length !== n) setText(p); }
  }
}
function stepHiker(world, p, j, t, dt) {
  const h = world.get(t.hiker), ped = p.ped;
  if (!h || h.removed || h.dead) { j.task = null; j.stage = 'wait'; j.nextAt = world.time + RANGER.gapS; world.notify(p, 'Radio: the hiker\'s call is off.', 'bad'); setText(p); return; }
  if (!t.found) { h.vx = h.vy = 0; h.a = Math.atan2(ped.y - h.y, ped.x - h.x); return; }
  const v = ped.vehId ? world.get(ped.vehId) : null;
  if (h.vehId) {   // aboard: home when the 4x4 is at the station
    if (!v || h.vehId !== v.id) { leaveHiker(world, h); h.npc.sar = 'ranger'; h.npc.keep = true; return; }
  } else {
    const to = v || ped, d = Math.hypot(to.x - h.x, to.y - h.y);
    if (v && d < v.def.L / 2 + 30 && Math.hypot(v.vx, v.vy) < 30) {
      const seat = [1, 2, 3].find((i) => i < v.seats.length && !v.seats[i]);
      if (seat !== undefined) { v.seats[seat] = h.id; h.vehId = v.id; h.seat = seat; h.vx = h.vy = 0; world.emit(v.x, v.y, { e: 'door', x: v.x, y: v.y }); }
    } else if (d > 26) {
      const mods = players.pedMods(world, h); mods.speedMul *= d > 120 ? RANGER.lead : 0.6;
      pedStep(h, { bits: 0, mx: (to.x - h.x) / d, my: (to.y - h.y) / d, aim: Math.atan2(to.y - h.y, to.x - h.x) }, dt, world.map, mods);
      world.place(h);
      if (d > 900 && world.time - (t.warnAt || -99) > 8) { t.warnAt = world.time; world.notify(p, 'The hiker can\'t keep up - slow down, or stop the 4x4 by them so they can climb in.', 'warn'); }
    } else { h.vx = h.vy = 0; }
  }
  const hx = h.vehId ? (v || h).x : h.x, hy = h.vehId ? (v || h).y : h.y;
  if (Math.hypot(hx - j.base.x, hy - j.base.y) < RANGER.homeR) {
    leaveHiker(world, h);
    world.emit(h.x, h.y, { e: 'say', id: h.id, x: h.x, y: h.y, text: 'Thank you, ranger!' });
    taskDone(world, p, `The hiker's safe back at ${j.base.name}.`);
  }
}

// the shift's over or dropped (jobs.failJob / jobDone clear p.job): its task's leftovers tidied up
export function tidy(world) {
  for (const e of world.entities.values()) {
    if (e.kind === K.PED && e.npc && e.npc.sar === 'ranger') {
      const owner = [...world.players.values()].find((p) => p.job && p.job.type === 'ranger' && p.job.task && p.job.task.hiker === e.id);
      if (!owner) { if (!e.vehId) despawnNpc(world, e); else leaveHiker(world, e); }
    } else if (e.kind === K.CRATE && e.litter) {
      const p = world.players.get(e.owner);
      if (!p || !p.job || p.job.type !== 'ranger' || !p.job.task || !(p.job.task.ids || []).includes(e.id)) world.remove(e);
    }
  }
}

// ---- the page's view of it (phone.js jobTarget) --------------------------------------------------------------------------
export function target(world, p, j) {
  const t = j.task;
  if (!t) { const v = world.get(j.truck); const at = v && !(p.ped && p.ped.vehId === v.id) ? v : j.base; return { text: j.text, x: Math.round(at.x), y: Math.round(at.y), stage: 'wait' }; }
  if (t.k === 'patrol') { const q = t.pts[t.i]; return { text: j.text, x: q.x, y: q.y, stage: 'go' }; }
  if (t.k === 'litter') {
    const ped = p.ped, L = t.ids.map((id) => world.get(id)).filter(Boolean).sort((a, b) => Math.hypot(a.x - ped.x, a.y - ped.y) - Math.hypot(b.x - ped.x, b.y - ped.y));
    return { text: j.text, x: Math.round(L[0] ? L[0].x : t.x), y: Math.round(L[0] ? L[0].y : t.y), stage: 'go' };
  }
  if (t.k === 'hiker') { const h = world.get(t.hiker); return t.found ? { text: j.text, x: Math.round(j.base.x), y: Math.round(j.base.y), stage: 'home' } : { text: j.text, x: Math.round(h ? h.x : t.x), y: Math.round(h ? h.y : t.y), stage: 'go' }; }
  return { text: j.text, x: t.x, y: t.y, stage: 'go' };
}
export { dropTask };

// ---- dev ('ranger'): on a shift at the nearest station, and a task of kind msg.k (patrol, litter, fire, hiker) now ----------
export function devRanger(world, p, k = '') {
  const ped = p.ped;
  if (!ped || ped.dead) return 'On your feet first.';
  if (p.job && p.job.type !== 'ranger') jobs.failJob(world, p, '[dev] job dropped');
  if (!p.job) { const err = start(world, p); if (err) return err; }
  const j = p.job;
  dropTask(world, j);
  if (KINDS.includes(k)) j.order = [k, ...KINDS.filter((q) => q !== k)];
  newTask(world, p);
  if (j.task && KINDS.includes(k) && j.task.k !== k) { dropTask(world, j); j.stage = 'wait'; j.nextAt = world.time + RANGER.gapS; setText(p); }
  return j.task ? null : 'No task of that kind fits round this station.';
}
