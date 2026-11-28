// The four-way harness (the owner, 11-14: "Looks like traffic jams are still happening" - a city crossroads knotted by a
// box truck, a delivery van, a dump truck, a bus and cars wedged across it at all angles): one busy four-way, a player
// standing at its corner (so nothing is cleared away out of sight), traffic fed into all four of its roads with a heavy
// mix - the trucks and a bus or two among the cars - and a report: how many got across, how long anything stood still
// near it, the longest. Used by test/gridlock.test.js and tools/gridlocksim.mjs.
import { joinPlayer, teleport, players } from './helpers.js';
import { World } from '../server/world.js';
import { K, T, TILE } from '../shared/constants.js';
import { PED_BLOCK } from '../shared/map.js';
import { lanePath } from '../shared/roads.js';
import { pointAt } from '../shared/geom.js';
import { obbVsObb } from '../shared/math.js';
import { exitsFrom } from '../shared/roads.js';
import { mulberry32 } from '../shared/rng.js';
import { signalFor } from '../shared/signals.js';
import { spawnNpc } from '../server/systems/npc.js';
import * as traffic from '../server/systems/traffic.js';
import { performance } from 'node:perf_hooks';
import * as calendar from '../server/systems/calendar.js';
import { EVENTS } from '../shared/rules.js';

// The event calendar runs on the wall clock (calendar.js): a run that happened to fall on an armored truck run or street
// race night had other cars through the junction - the same seed jammed one night and not the next (11-27 night: the
// unlit four-way's 100 s van on main, 3/3 the evening before). A run holds the calendar's clock at a quiet moment.
export function quietMoment(from = Date.UTC(2026, 0, 5, 12)) {
  for (let ms = from; ms < from + 864e5; ms += 30e3) if (!EVENTS.some((ev) => ev.on && calendar.due(ev, ms, new Set()))) return ms;
  return from;
}

// what's fed in: the town's mix, the trucks and the buses three times as often (a delivery district at rush hour)
export const HEAVY_MIX = [['sedan', 26], ['compact', 18], ['taxi', 8], ['pickup', 10], ['van', 10], ['boxtruck', 6], ['dumptruck', 3],
  ['mixer', 2], ['tanker', 2], ['garbage', 2], ['movingvan', 3], ['flatbed', 3], ['bus', 4], ['icecream', 1]];

// A four-way on the ground: four two-way roads, each long enough to queue on (and a lane each way, like the owner's),
// with lights or without; the one nearest (nearX, nearY).
export function findFourWay(m, { lights, nearX = m.w * TILE / 2, nearY = m.h * TILE / 2, minLen = 520 } = {}) {
  const net = m.net;
  let best = null, bd = Infinity;
  for (const n of net.nodes) {
    if (n.lvl !== 0 || n.merge || n.island || n.edges.length !== 4 || !!n.light !== !!lights) continue;
    let ok = true;
    for (const id of n.edges) {
      const e = net.edges[id];
      if (e.oneway || e.lvl !== 0 || e.len < minLen || e.bridge || (e.nl || 1) > 2 || !['st', 'ave', 'art', 'blvd', 'minor', 'drive'].includes(e.kind)) { ok = false; break; }
    }
    if (!ok) continue;
    // a proper crossroads: four arms about a right angle apart
    const dirs = n.edges.map((id) => n.dirs[id]).sort((a, b) => a - b);
    for (let i = 0; i < 4 && ok; i++) { const g = ((dirs[(i + 1) % 4] - dirs[i]) + Math.PI * 4) % (Math.PI * 2); if (g < 1.1 || g > 2.1) ok = false; }
    if (!ok || m.tileAtPx(n.x, n.y) !== T.ROAD) continue;
    const d = Math.hypot(n.x - nearX, n.y - nearY);
    if (d < bd) { bd = d; best = n; }
  }
  return best;
}

// where the player stands: in the block off the junction's corner, the junction in plain sight - off the pavement, out
// of everyone's way (stood on the corner's pavement, an ambulance leaving across it waited for them)
function corner(m, n) {
  for (let r = (n.half || 40) + 200; r < 600; r += 16) for (let a = 0; a < 16; a++) {
    const x = n.x + Math.cos(a * 0.3927 + 0.4) * r, y = n.y + Math.sin(a * 0.3927 + 0.4) * r, t = m.tileAtPx(x, y);
    if (!PED_BLOCK[t] && t !== T.ROAD && t !== T.SIDEWALK && t !== T.LOT && t !== T.BRIDGE && !m.isWater(x, y)) return { x, y };
  }
  return { x: n.x + 300, y: n.y + 300 };
}

export function addDriven(w, model, x, y, a) {
  const v = w.spawnVehicle(model, x, y, a, {});
  const d = spawnNpc(w, 'casual', v.x, v.y, 'driver');
  d.vehId = v.id; d.seat = 0; v.seats[0] = d.id;
  return v;
}

// Run a four-way for `minutes` of game time. opts: { lights, seed, npcBudget, feedEvery (s between tries per road),
// nearX/nearY, onTick(w, n, tick) }. -> the report.
export function runFourWay(M, opts = {}) {
  const calMs = quietMoment();
  calendar.setClock(() => calMs);
  try { return runFourWay0(M, opts); } finally { calendar.setClock(null); }
}
function runFourWay0(M, opts = {}) {
  const { lights = true, seed = 7, minutes = 10, npcBudget = 300, feedEvery = 3.5, warm = 30 } = opts;
  const rnd = mulberry32(seed * 31 + (lights ? 1 : 2));
  const w = new World(M, { npcBudget, throwErrors: true, rand: mulberry32(seed + 1), loopStart: 400, day: 0 });
  const n = opts.node || findFourWay(M, { lights, nearX: opts.nearX, nearY: opts.nearY });
  if (!n) throw new Error('no four-way');
  const net = M.net;
  const { p } = joinPlayer(w);
  const at = corner(M, n);
  teleport(w, p.ped, at.x, at.y);
  p.ped.protectUntil = 1e9;
  // the four roads in: each lane toward the junction, fed 650 px back
  const feeds = [];
  for (const id of n.edges) {
    const e = net.edges[id], from = e.a === n.id ? e.b : e.a;
    for (let k = 0; k < (e.nl || 1); k++) {
      const lp = lanePath(net, e, from, k), L = lp[lp.length - 1].s;
      feeds.push({ e, from, k, s: Math.max(30, L - 650) });
    }
  }
  let total = 0;
  for (const [, wt] of HEAVY_MIX) total += wt;
  const pick = () => { let r = rnd() * total; for (const [id, wt] of HEAVY_MIX) { r -= wt; if (r <= 0) return id; } return 'sedan'; };
  const R = (n.half || 40) + 40;   // (the box and its mouths)
  const crossed = new Set(), still = new Map(), runs = [], gone = { despawned: 0, gaveUp: 0 };
  let maxStill = 0, maxBox = 0, maxHead = 0, maxJam = 0, worst = null, worstHead = null, worstJam = null, fed = 0;
  const jam = new Map();
  const known = new Map(), snapped = new Set();   // id -> { model, near }
  const tickMs = [], trafficMs = [];
  const ticks = Math.round(minutes * 60 * 20);
  const t0 = performance.now();
  for (let tick = 1; tick <= ticks; tick++) {
    players.queueInput(p, { seq: tick, bits: 0, mx: 0, my: 0, aim: 0 });
    if (p.ped.dead || p.ped.hp < p.ped.maxHp * 0.5) p.ped.hp = p.ped.maxHp;
    // feeding: each lane in, now and then, when there's room where it's fed in
    if (tick % 10 === 0) for (const f of feeds) {
      if (rnd() > 0.5 / (feedEvery * 2)) continue;   // (one try per feedEvery s on average)
      const lp = lanePath(net, f.e, f.from, f.k), q = pointAt(lp, f.s);
      if (w.query(q.x, q.y, 130, K.VEH).length) continue;
      const v = addDriven(w, pick(), q.x, q.y, Math.atan2(q.ty, q.tx));
      v.ai = { kind: 'traffic' };
      traffic.enterEdge(w, v, f.e.id, f.from, f.k, f.s);
      const sp = 120; v.vx = q.tx * sp; v.vy = q.ty * sp;
      fed++;
    }
    opts.onTick?.(w, n, tick);
    const ts = performance.now();
    w.step();
    const dt = performance.now() - ts;
    if (w.time > warm) { tickMs.push(dt); trafficMs.push(w.profile().traffic || 0); }
    if (tick % 10) continue;
    // the measure (every 0.5 s): what's near the junction standing still, and for how long; who got across
    const seen = new Set();
    for (const v of w.query(n.x, n.y, 520, K.VEH)) {
      if (!v.ai || v.ai.kind !== 'traffic' || v.parked) continue;
      seen.add(v.id);
      // stuck (jam): standing in the box or at the head of a queue with nothing to wait for - not held for room on its way
      // out (the road past the junction backed up: "don't block the box"), not behind a police car or an ambulance at work
      // or a car left in the road (the junction can't help those), not at a red light
      if (Math.hypot(v.x - n.x, v.y - n.y) < R + 160 && Math.hypot(v.vx, v.vy) < 8 && w.time > warm) {
        let q = v, excused = false;
        for (let k = 0; k < 6 && q && !excused; k++) {
          if (q.ai && (q.ai.exitWaitAt !== undefined || (q.ai.waitNode === n.id && n.light && signalFor(n, q.ai.edge, w.loopTime) !== 'G'))) excused = true;
          const b = q._blk ? w.get(q._blk) : null;
          if (b && (!b.ai || b.ai.kind !== 'traffic' || b.ai.parkIt || !b.seats[0])) excused = true;
          q = b;
        }
        const j = excused ? 0 : (jam.get(v.id) || 0) + 0.5;
        jam.set(v.id, j);
        if (j > maxJam) { maxJam = j; worstJam = { id: v.id, model: v.model, x: Math.round(v.x - n.x), y: Math.round(v.y - n.y), blk: v._blk ? w.get(v._blk)?.model : null, t: +w.time.toFixed(1) }; }
      } else jam.delete(v.id);
      known.set(v.id, { model: v.model, x: v.x, y: v.y });
      if (v.ai.from === n.id && Math.hypot(v.x - n.x, v.y - n.y) > R + v.def.L / 2) crossed.add(v.id);
      const sp = Math.hypot(v.vx, v.vy);
      let s = still.get(v.id);
      if (sp < 8) {
        if (!s || Math.hypot(v.x - s.x, v.y - s.y) > 32) { s = { x: v.x, y: v.y, t: w.time, box: false }; still.set(v.id, s); }
        const d = w.time - s.t, inBox = Math.hypot(v.x - n.x, v.y - n.y) < R;
        if (inBox) s.box = true;
        if (w.time > warm && d > maxStill) { maxStill = d; worst = { id: v.id, model: v.model, x: Math.round(v.x - n.x), y: Math.round(v.y - n.y), a: +v.a.toFixed(2), blk: v._blk ? w.get(v._blk)?.model : null, t: +w.time.toFixed(1) }; }
        if (w.time > warm && inBox && d > maxBox) maxBox = d;
        if (w.time > warm && Math.hypot(v.x - n.x, v.y - n.y) < R + 160 && d > maxHead) { maxHead = d; worstHead = { id: v.id, model: v.model, x: Math.round(v.x - n.x), y: Math.round(v.y - n.y), blk: v._blk ? w.get(v._blk)?.model : null, t: +w.time.toFixed(1) }; }
        if (opts.snap && d > (opts.snapAfter || 30) && (!opts.snapBox || inBox) && !snapped.has(v.id) && snapped.size < (opts.snapMax || 3)) { snapped.add(v.id); opts.snap(w, n, still, v); }
      } else if (s) { if (w.time > warm) runs.push(w.time - s.t); still.delete(v.id); }
    }
    for (const [id, s] of still) if (!seen.has(id)) {
      if (!w.get(id)) gone.despawned++;
      if (w.time > warm) runs.push(w.time - s.t);
      still.delete(id);
    }
  }
  for (const [, s] of still) runs.push(w.time - s.t);
  const counted = minutes - warm / 60;
  const q = (a, f) => { const b = [...a].sort((x, y) => x - y); return b.length ? b[Math.min(b.length - 1, Math.floor(b.length * f))] : 0; };
  return {
    node: { id: n.id, x: Math.round(n.x), y: Math.round(n.y), tile: [Math.floor(n.x / TILE), Math.floor(n.y / TILE)], lights: !!n.light, half: n.half },
    minutes, fed, crossed: crossed.size, perMin: +(crossed.size / minutes).toFixed(1),
    maxStill: +maxStill.toFixed(1), maxBox: +maxBox.toFixed(1), maxHead: +maxHead.toFixed(1), worstHead, maxJam, worstJam, over30: runs.filter((d) => d > 30).length, over20: runs.filter((d) => d > 20).length,
    worst, counters: { boxHolds: w.boxHolds || 0, ringsBroken: w.ringsBroken || 0, sidesteps: w.sidesteps || 0, wedgedGaveUp: w.wedgedGaveUp || 0, knots: w.knotsUntied || 0, cleared: w.knotCleared || 0, realigned: w.realigned || 0, bigWaits: w.bigWaits || 0, backToLane: w.backToLane || 0, exitSwaps: w.exitSwaps || 0, pathGoes: w.pathGoes || 0, shakes: w.knotShakes || 0 },
    gone, tick: { mean: +(tickMs.reduce((s, x) => s + x, 0) / tickMs.length).toFixed(2), p95: +q(tickMs, 0.95).toFixed(2), traffic: +(trafficMs.reduce((s, x) => s + x, 0) / trafficMs.length).toFixed(3) },
    wallS: Math.round((performance.now() - t0) / 1000), traffic: w.trafficCount,
    world: w,
  };
}

// A picture of the junction (an SVG, 1000 px a side round it): the road and the pavement, every vehicle as its box with
// its id, model and how long it's been standing (red: 10 s and more), its nose marked; and the state of each near it.
export function snapshot(w, n, still, R = 500) {
  const m = w.map, x0 = n.x - R, y0 = n.y - R, out = [`<svg xmlns="http://www.w3.org/2000/svg" width="${2 * R}" height="${2 * R}" viewBox="0 0 ${2 * R} ${2 * R}">`];
  const col = { [T.ROAD]: '#333', [T.SIDEWALK]: '#999', [T.BRIDGE]: '#444', [T.LOT]: '#555', [T.PLAZA]: '#aaa' };
  for (let ty = Math.floor(y0 / TILE); ty * TILE < y0 + 2 * R; ty++) for (let tx = Math.floor(x0 / TILE); tx * TILE < x0 + 2 * R; tx++) {
    const t = m.tileAt(tx, ty);
    out.push(`<rect x="${tx * TILE - x0}" y="${ty * TILE - y0}" width="${TILE}" height="${TILE}" fill="${col[t] || '#4a6'}"/>`);
  }
  const rows = [];
  for (const v of w.query(n.x, n.y, R * 1.2, K.VEH)) {
    const s = still.get(v.id), st = s ? w.time - s.t : 0, c = Math.cos(v.a), sn = Math.sin(v.a);
    const fill = !v.ai ? '#88f' : st > 10 ? '#e33' : st > 3 ? '#e93' : '#3c3';
    out.push(`<g transform="translate(${(v.x - x0).toFixed(1)},${(v.y - y0).toFixed(1)}) rotate(${(v.a * 180 / Math.PI).toFixed(1)})"><rect x="${-v.def.L / 2}" y="${-v.def.W / 2}" width="${v.def.L}" height="${v.def.W}" fill="${fill}" stroke="#000" opacity="0.85"/><rect x="${v.def.L / 2 - 8}" y="${-v.def.W / 2}" width="8" height="${v.def.W}" fill="#fff"/></g>`);
    out.push(`<text x="${(v.x - x0 - 20).toFixed(0)}" y="${(v.y - y0 + 4).toFixed(0)}" font-size="13" fill="#fff" stroke="#000" stroke-width="0.4">${v.id} ${v.model}${st > 3 ? ' ' + st.toFixed(0) + 's' : ''}</text>`);
    const ai = v.ai || {};
    rows.push({ id: v.id, model: v.model, kind: ai.kind, mode: ai.mode, step: ai.step, body: ai.body, rel: [Math.round(v.x - n.x), Math.round(v.y - n.y)], a: +v.a.toFixed(2), sp: Math.round(Math.hypot(v.vx, v.vy)), still: +st.toFixed(1), blk: v._blk || 0, pblk: v._pblk || 0,
      edge: ai.edge, from: ai.from, next: ai.next && ai.next.edge, turnN: ai.next && +ai.next.turn.toFixed(2), lane: ai.lane, waitNode: ai.waitNode, waited: ai.waitAt !== undefined ? +(w.time - ai.waitAt).toFixed(1) : null,
      rev: ai.reverseUntil > w.time, ringAt: ai.ringAt !== undefined ? +(w.time - ai.ringAt).toFixed(1) : null, stuck: ai.stuck && +ai.stuck.toFixed(2), wedged: ai.wedged, park: !!ai.parkIt, turn: !!ai.turn, side: ai.sideUntil > w.time, pts: ai.pts ? ai.pts.length : 0, stop0: ai.pts && ai.pts[0] && ai.pts[0].stop ? 1 : 0 });
  }
  out.push(`<circle cx="${R}" cy="${R}" r="${n.half || 40}" fill="none" stroke="#ff0" stroke-dasharray="6 6"/>`);
  out.push('</svg>');
  return { svg: out.join(''), rows };
}

// The owner's knot (11-14), built: four long-ish vehicles, one off each road, already across their lines into the box and
// turning left (each one's way crossing the next one's), part way round and askew, nosed up to each other - a box truck,
// a delivery van, a dump truck, a bus - and a car or two queued right behind each, at their lines. -> { knot: [vehicles],
// queue: [vehicles] }
export function buildKnot(w, n, models = ['boxtruck', 'van', 'dumptruck', 'bus'], queued = 2) {
  const net = w.map.net, knot = [], queue = [];
  const placed = [];
  const free = (x, y, a, L, W) => placed.every((q) => !obbVsObb(x, y, a, L / 2 + 3, W / 2 + 3, q.x, q.y, q.a, q.def.L / 2 + 3, q.def.W / 2 + 3));
  n.edges.forEach((id, i) => {
    const e = net.edges[id], from = e.a === n.id ? e.b : e.a;
    for (const model of [models[i % models.length], 'sedan']) if (inBox(e, from, id, model)) break;
  });
  return { knot, queue };
  function inBox(e, from, id, model) {
    const lp = lanePath(net, e, from, 0), L = lp[lp.length - 1].s;
    const left = exitsFrom(net, n, id).filter((o) => o.edge !== id).sort((p, q) => p.turn - q.turn)[0];   // (the sharpest left there is)
    const v = addDriven(w, model, lp[lp.length - 1].x, lp[lp.length - 1].y, 0);
    v.ai = { kind: 'traffic' };
    traffic.enterEdge(w, v, id, from, 0, L - 2);
    v.ai.next = left; v.ai.turning = Math.abs(left.turn) > 0.5;
    v.ai.pts = [];
    traffic._crossJunction(w, v);   // (across its line: in the box, its way round to the left ahead of it)
    // part way round its turn, askew: as far in as it goes without overlapping one already there
    const path = [{ x: v.x, y: v.y }, ...v.ai.pts.slice(0, 8)];
    let at = null;
    for (const f of [2, 1, 3, 0].filter((k) => k <= path.length - 2)) for (const tw of [0.35, 0.15, -0.35, 0]) {
      if (at) break;
      const p = path[f], q = path[f + 1], a = Math.atan2(q.y - p.y, q.x - p.x) + tw;
      if (free(p.x, p.y, a, v.def.L, v.def.W)) { at = { x: p.x, y: p.y, a, k: f }; break; }
    }
    if (!at) { traffic.removeVehicle(w, v); return false; }
    v.x = at.x; v.y = at.y; v.a = at.a; v.vx = 0; v.vy = 0; w.place(v);
    v.ai.pts.splice(0, at.k);
    placed.push(v); knot.push(v);
    // the queue behind it at its line
    let s0 = L - v.def.L / 2 - 14;
    for (let k = 0; k < queued; k++) {
      const m = k % 2 ? 'sedan' : 'pickup', d = 100;
      let sq = s0 - d / 2 - 10, q0 = pointAt(lp, sq);
      while (sq > 60 && !free(q0.x, q0.y, Math.atan2(q0.ty, q0.tx), d, 60)) q0 = pointAt(lp, (sq -= 8));
      if (sq <= 60) break;
      const c = addDriven(w, m, q0.x, q0.y, Math.atan2(q0.ty, q0.tx));
      c.ai = { kind: 'traffic' };
      traffic.enterEdge(w, c, id, from, 0, sq);
      s0 = sq - c.def.L / 2;
      placed.push(c); queue.push(c);
      s0 -= 12;
    }
    return true;
  }
}

// An ambulance at work standing in the box's corner (it pulled up by someone lying in the road there), a flatbed that
// came in behind it stuck nose to its side, and traffic waiting on the other roads: -> { amb, stuck, waiting }
export function buildAmbulanceBlock(w, n) {
  const net = w.map.net, R = n.half || 100;
  const ids = n.edges.slice().sort((p, q) => n.dirs[p] - n.dirs[q]);
  // the road in heading east-ish (the flatbed's) and the one out east-ish
  const inE = ids.find((id) => Math.abs(Math.cos(n.dirs[id] + Math.PI) - 1) < 0.3 && true) ?? ids[0];
  const e = net.edges[inE], from = e.a === n.id ? e.b : e.a, lp = lanePath(net, e, from, 0), L = lp[lp.length - 1].s;
  const straight = exitsFrom(net, n, inE).sort((p, q) => Math.abs(p.turn) - Math.abs(q.turn))[0];
  const fb = addDriven(w, 'flatbed', lp[lp.length - 1].x, lp[lp.length - 1].y, 0);
  fb.ai = { kind: 'traffic' };
  traffic.enterEdge(w, fb, inE, from, 0, L - 2);
  fb.ai.next = straight; fb.ai.turning = false; fb.ai.pts = [];
  traffic._crossJunction(w, fb);
  const hd = Math.atan2(fb.ai.pts[1].y - fb.y, fb.ai.pts[1].x - fb.x), c = Math.cos(hd), sn = Math.sin(hd);
  fb.x += c * 30; fb.y += sn * 30; fb.a = hd; w.place(fb);
  // the ambulance across its way just ahead, in the box (nobody at the wheel: the crew out with the patient)
  const amb = w.spawnVehicle('ambulance', fb.x + c * (fb.def.L / 2 + 70), fb.y + sn * (fb.def.L / 2 + 70), hd, {});
  amb.ai = { kind: 'ems', mode: 'scene' };
  void R;
  // waiting on the other roads
  const waiting = [];
  for (const id of n.edges) {
    if (id === inE) continue;
    const q = net.edges[id], f2 = q.a === n.id ? q.b : q.a, l2 = lanePath(net, q, f2, 0), L2 = l2[l2.length - 1].s;
    for (const [k, m] of [[0, 'sedan'], [1, 'pickup']]) {
      const p = pointAt(l2, L2 - 60 - k * 120);
      const v = addDriven(w, m, p.x, p.y, Math.atan2(p.ty, p.tx));
      v.ai = { kind: 'traffic' };
      traffic.enterEdge(w, v, id, f2, 0, L2 - 60 - k * 120);
      waiting.push(v);
    }
  }
  return { amb, stuck: fb, waiting };
}
