// Traffic jams at road ends (task #384): a headless simulation of the real server's world. It finds the dead ends of
// the lane graph (the cul-de-sac bulbs, the ends of county roads, dirt tracks and service alleys, and the stretch of road
// leading to each from its last junction), stands players near them, runs the world for some in-game minutes with
// traffic, and counts the NPC vehicles stuck there - barely moving (staying inside a 50 px circle) for more than 8 s -
// and those going round in circles, where it happens and why:
//   turnaround   at the road's end, failing to turn round (nothing in the way: the turn needs more room than it has)
//   deadlock     two (or more) cars each stopped for the other
//   queue        stopped behind a car that is itself stuck
//   parked       stopped behind a car nobody is driving (parked, left, a wreck)
//   junction     waiting to get into a junction (not at a red light)
//   wall         pressed against a wall, a kerb post or a tree, nothing in front of it
//   other        anything else (a pedestrian in the road, ...)
// Waiting at a red light is never a jam; it's counted apart.
//   node tools/trafficjams.mjs                  the report: every scenario, 5 in-game minutes each
//   node tools/trafficjams.mjs --min 3          minutes per scenario
//   node tools/trafficjams.mjs --only courts    some of the scenarios (courts, ends, country, alleys, town)
//   node tools/trafficjams.mjs --seed 7         another run (the same seed gives the same run)
//   node tools/trafficjams.mjs --json           the numbers as JSON (after the report)
import { makeWorld, joinPlayer, teleport } from '../test/helpers.js';
import { K, T } from '../shared/constants.js';
import { signalFor } from '../shared/signals.js';
import { mulberry32 } from '../shared/rng.js';
import { inAnyView } from '../server/view.js';
import { pathToFileURL } from 'node:url';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const MINUTES = +opt('--min', 5);
const ONLY = opt('--only', '') ? new Set(opt('--only', '').split(',')) : null;
const JSON_OUT = args.includes('--json');
const PLAYERS = +opt('--players', 4);

const STILL_S = 8, STILL_PX = 50;         // stuck: inside a 50 px circle for 8 s
const LOOP_S = 20, LOOP_BOX = 350, LOOP_PATH = 700;   // circling: 700 px driven in 20 s without leaving a 350 px box
const SAMPLE = 10;                        // ticks between samples (0.5 s)

// ---- the dead ends of the lane graph ----------------------------------------------------------------------------
// For each dead-end node: its road, the turning circle (bulb) if it has one, and the branch leading to it (back
// through plain bends to the junction it leaves: the mouth).
export function deadEnds(m) {
  const net = m.net, out = [];
  for (const n of net.nodes) {
    if (n.edges.length !== 1) continue;
    const e0 = net.edges[n.edges[0]];
    const branch = new Set([e0.id]);
    let at = n.id, e = e0;
    for (let k = 0; k < 8; k++) {
      const nx = e.a === at ? e.b : e.a, nn = net.nodes[nx];
      if (nn.edges.length !== 2) { at = nx; break; }
      const e2 = net.edges[nn.edges[0] === e.id ? nn.edges[1] : nn.edges[0]];
      branch.add(e2.id); at = nx; e = e2;
    }
    out.push({ node: n.id, x: n.x, y: n.y, kind: e0.kind, bulb: n.bulb || 0, w: e0.w, culdesac: !!e0.culdesac, oneway: e0.oneway, branch, mouth: at, lvl: n.lvl });
  }
  return out;
}

// a spot to stand with the dead end in view: open ground (not the road) 200-420 px from it
function standNear(m, d, rng) {
  for (let r = 200; r <= 420; r += 20) {
    const a0 = rng() * Math.PI * 2;
    for (let k = 0; k < 16; k++) {
      const a = a0 + (k / 16) * Math.PI * 2, x = d.x + Math.cos(a) * r, y = d.y + Math.sin(a) * r;
      const t = m.tileAtPx(x, y);
      if (t === T.ROAD || t === T.BRIDGE || !m.isWalkable(x, y) || m.isWater(x, y)) continue;
      if ([[24, 0], [-24, 0], [0, 24], [0, -24]].some(([dx, dy]) => !m.isWalkable(x + dx, y + dy) || m.tileAtPx(x + dx, y + dy) === T.ROAD)) continue;
      return { x, y };
    }
  }
  return null;
}

const SCENARIOS = {
  courts: (d) => d.kind === 'minor' && d.bulb,                                        // the residential courts' turning circles
  ends: (d) => d.bulb && d.kind !== 'minor',                                          // streets, arterials, frontage roads ending in a bulb
  country: (d) => (d.kind === 'rural' || d.kind === 'dirt') && d.lvl === 0,           // county roads and dirt tracks that just stop
  alleys: (d) => d.kind === 'alley',                                                  // the service alleys
  town: null,                                                                         // ordinary town spots (whatever's near)
};

// ---- one scenario -----------------------------------------------------------------------------------------------
// onSample(world, { stuck: Set of ids, ends, cars }) after each sample: for a closer look (pictures of a jam)
export function runScenario(name, seed, onSample = null) {
  const rng = mulberry32(seed);
  Math.random = mulberry32(seed + 2);   // (the same run every time: paint, names, a few systems' dice)
  const w = makeWorld({ npcBudget: 600, rand: mulberry32(seed + 1), loopStart: 400, day: 0 });   // (mid-morning: the day's traffic; a dry day)
  const m = w.map, net = m.net;
  const ends = deadEnds(m);
  const byNode = new Map(ends.map((d) => [d.node, d]));
  const branchOf = new Map();   // edge id -> dead end
  for (const d of ends) for (const id of d.branch) branchOf.set(id, d);
  // where the players stand
  const spots = [];
  const pick = SCENARIOS[name];
  if (pick) {
    const cands = ends.filter(pick).sort(() => rng() - 0.5);
    for (const d of cands) {
      if (spots.length >= PLAYERS) break;
      if (spots.some((s) => Math.hypot(s.x - d.x, s.y - d.y) < 2600)) continue;   // (apart: each its own traffic)
      const s = standNear(m, d, rng);
      if (s) spots.push({ ...s, d });
    }
  } else {
    // town: the junctions of town streets, far apart
    const cands = net.nodes.filter((n) => n.lvl === 0 && n.edges.length >= 3 && n.edges.every((id) => ['st', 'ave', 'blvd', 'art', 'minor', 'drive'].includes(net.edges[id].kind))).sort(() => rng() - 0.5);
    for (const n of cands) {
      if (spots.length >= PLAYERS) break;
      if (spots.some((s) => Math.hypot(s.x - n.x, s.y - n.y) < 2600)) continue;
      const s = standNear(m, { x: n.x, y: n.y }, rng);
      if (s) spots.push({ ...s, d: null });
    }
  }
  for (const s of spots) { const a = joinPlayer(w); teleport(w, a.p.ped, s.x, s.y); s.p = a.p; }
  // ---- tracking ----
  const cars = new Map();   // id -> { hist: [{t, x, y}], ep, loop, seenDead: Map(node -> t), model }
  const episodes = [], loops = [], visits = [];
  let seen = 0, removedStill = 0, removedStillNearDead = 0, redWait = 0, crashes = 0, panics = 0, wrecked = 0, abandoned = 0;
  const nearDead = (x, y) => {
    let best = null, bd = Infinity;
    for (const d of ends) { const dd = Math.hypot(d.x - x, d.y - y); if (dd < bd) { bd = dd; best = d; } }
    return { d: best, dist: bd };
  };
  // where a car is, as far as road ends go: 'end' (at the end of a dead-end road, by its turning circle), 'branch' (on
  // the road leading to one), 'mouth' (at the junction where that road leaves), or 'elsewhere'
  const where = (v) => {
    const { d, dist } = nearDead(v.x, v.y);
    if (d && dist < (d.bulb || 60) + 120) return { at: 'end', d };
    const e = v.ai && v.ai.edge !== undefined ? branchOf.get(v.ai.edge) : null;
    if (e) return { at: 'branch', d: e };
    for (const dd of ends) { const mn = net.nodes[dd.mouth]; if (Math.hypot(mn.x - v.x, mn.y - v.y) < (mn.half || 40) + 90) return { at: 'mouth', d: dd }; }
    return { at: 'elsewhere', d: null };
  };
  const stuckNow = new Set();
  const atRed = (v) => {
    const ai = v.ai, st = ai && ai.pts && ai.pts.find((p) => p.stop);
    if (!st) return false;
    const n = net.nodes[st.node];
    if (!n || !n.light || Math.hypot(st.x - v.x, st.y - v.y) > 260) return false;
    return signalFor(n, st.edge, w.loopTime) !== 'G';
  };
  // the vehicle v is stopped for (traffic.js obstacleSpeed notes it: v._blk), if it's close
  const blocker = (v) => { const b = v._blk ? w.get(v._blk) : null; return b && b.kind === K.VEH && Math.hypot(b.x - v.x, b.y - v.y) < v.def.L + b.def.L ? b : null; };
  // why v itself is stopped
  const ownCause = (v, loc) => {
    const ai = v.ai, blk = blocker(v);
    if (blk) {
      let b = blk;
      for (let k = 0; k < 8 && b; k++) { if (b === v) return 'deadlock'; b = blocker(b); }   // (a ring of cars each stopped for the next)
      const bd = blk.seats[0] ? w.get(blk.seats[0]) : null;
      if (!blk.ai || blk.wreckAt || blk.dead || blk.parked || !bd) return 'parked';
      if (blk.ai.kind !== 'traffic') return 'service';   // (a police car, an ambulance, a tow truck at work)
    }
    if (atRed(v)) return 'red';
    if (loc.at === 'end' && !blk) return 'turnaround';
    const st = ai && ai.pts && ai.pts.find((p) => p.stop);
    if (st && Math.hypot(st.x - v.x, st.y - v.y) < 220) return 'junction';
    if (blk) return 'blocked';
    if ((ai && ai.reverseUntil > w.time - 3) || (ai && ai.stuck > 0.5)) return 'wall';
    if (loc.at === 'end') return 'turnaround';
    return 'other';
  };
  // a car queued behind one that is itself stuck: the cause is what holds up the head of the queue
  const cause = (v, loc) => {
    const seen = new Set([v.id]);
    let head = v, b = blocker(v);
    while (b && stuckNow.has(b.id) && !seen.has(b.id)) { seen.add(b.id); head = b; b = blocker(b); }
    if (b && seen.has(b.id)) return head === v || b === v ? 'deadlock' : 'queue:deadlock';
    if (head === v) return ownCause(v, loc);
    const hc = ownCause(head, where(head));
    return hc === 'red' ? 'red' : `queue:${hc}`;
  };
  const ticks = Math.round(MINUTES * 60 * 20);
  const t0 = performance.now();
  for (let tick = 0; tick < ticks; tick++) {
    // what's about to be removed by the clean-up (manage: traffic still 50 s, out of everyone's view)
    w.step();
    if (tick % SAMPLE) continue;
    const now = w.time;
    const live = new Set();
    for (const v of w.entities.values()) {
      if (v.kind !== K.VEH || !v.ai || v.ai.kind !== 'traffic') continue;
      live.add(v.id);
      let c = cars.get(v.id);
      if (!c) { c = { hist: [], ep: null, loop: null, model: v.model, at: null, visit: null, hitAt: v.hardHitAt || 0 }; cars.set(v.id, c); seen++; }
      // crashes (closing speed over 110 px/s: vehicles.js) and panics (driving flat out, through everything: traffic.js)
      if ((v.hardHitAt || 0) !== c.hitAt) { c.hitAt = v.hardHitAt; crashes++; }
      const pan = !!(v.ai.panicUntil > now);
      if (pan && !c.pan) panics++;
      c.pan = pan;
      c.hist.push({ t: now, x: v.x, y: v.y });
      while (c.hist.length && now - c.hist[0].t > LOOP_S + 0.01) c.hist.shift();
      c.last = { x: v.x, y: v.y, t: now, inView: inAnyView(w, v.x, v.y, 96) };
      const loc = where(v);
      c.loc = loc;
      // a visit to a road's end: there, and how long it takes to get away again (out past the mouth, or 450 px off)
      if (loc.at === 'end' && !c.visit) c.visit = { d: loc.d, t: now, model: v.model };
      if (c.visit && !c.visit.done) {
        const dd = Math.hypot(v.x - c.visit.d.x, v.y - c.visit.d.y);
        const mn = net.nodes[c.visit.d.mouth];
        if (dd > 450 || Math.hypot(v.x - mn.x, v.y - mn.y) < 60 || (loc.at === 'elsewhere' && dd > 300)) { c.visit.done = now; visits.push({ ...c.visit, secs: now - c.visit.t }); c.visit = null; }
      }
      // barely moving for STILL_S?
      const win = c.hist.filter((h) => now - h.t <= STILL_S + 0.01);
      const full = win.length && now - win[0].t >= STILL_S - 0.01;
      let r = 0;
      for (const h of win) r = Math.max(r, Math.hypot(h.x - v.x, h.y - v.y));
      const still = full && r < STILL_PX;
      if (still) {
        stuckNow.add(v.id);
        const why = cause(v, loc);
        if (!c.ep) c.ep = { id: v.id, model: v.model, t0: now - STILL_S, x: v.x, y: v.y, at: loc.at, d: loc.d, why: {}, red: 0 };
        c.ep.why[why] = (c.ep.why[why] || 0) + 1;
        if (why === 'red') c.ep.red++;
      } else if (c.ep && (r >= STILL_PX * 1.6 || !full)) {
        c.ep.t1 = now; c.ep.end = 'moved'; episodes.push(c.ep); c.ep = null; stuckNow.delete(v.id);
      }
      // going round in circles: driven a lot, got nowhere
      if (now - c.hist[0].t >= LOOP_S - 0.01) {
        let path = 0, x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        for (let i = 0; i < c.hist.length; i++) {
          const h = c.hist[i];
          if (i) path += Math.hypot(h.x - c.hist[i - 1].x, h.y - c.hist[i - 1].y);
          x0 = Math.min(x0, h.x); y0 = Math.min(y0, h.y); x1 = Math.max(x1, h.x); y1 = Math.max(y1, h.y);
        }
        const circ = path > LOOP_PATH && Math.hypot(x1 - x0, y1 - y0) < LOOP_BOX;
        if (circ && !c.loop) c.loop = { id: v.id, model: v.model, t0: now - LOOP_S, x: v.x, y: v.y, at: loc.at, d: loc.d };
        else if (!circ && c.loop) { c.loop.t1 = now; loops.push(c.loop); c.loop = null; }
      }
    }
    if (onSample) onSample(w, { stuck: stuckNow, ends, cars });
    // cars gone since the last sample
    for (const [id, c] of cars) {
      if (live.has(id) || c.gone) continue;
      c.gone = true;
      stuckNow.delete(id);
      const v = w.get(id);
      if (v && (v.dead || v.wreckAt)) wrecked++;               // (its engine died - smashed up - or it blew up)
      else if (v && !v.seats[0]) abandoned++;                   // (the driver got out and left it in the road)
      const still = c.ep && !v;
      if (c.ep) { c.ep.t1 = now; c.ep.end = v ? 'left traffic' : c.last.inView ? 'removed (in view)' : 'removed (out of view)'; episodes.push(c.ep); c.ep = null; }
      if (c.loop) { c.loop.t1 = now; loops.push(c.loop); c.loop = null; }
      if (still) { removedStill++; if (c.loc && c.loc.at !== 'elsewhere') removedStillNearDead++; }
      if (c.visit) { visits.push({ ...c.visit, secs: now - c.visit.t, never: true, how: v ? 'left traffic' : 'removed' }); c.visit = null; }
    }
  }
  const now = w.time;
  for (const c of cars.values()) {
    if (c.ep) { c.ep.t1 = now; c.ep.end = 'still stuck at the end'; episodes.push(c.ep); }
    if (c.loop) { c.loop.t1 = now; loops.push(c.loop); }
    if (c.visit) visits.push({ ...c.visit, secs: now - c.visit.t, never: true, how: 'still there at the end' });
  }
  for (const ep of episodes) {
    ep.secs = ep.t1 - ep.t0;
    let best = 'other', bn = -1;
    for (const [k, n] of Object.entries(ep.why)) if (k !== 'red' && n > bn) { bn = n; best = k; }
    ep.cause = ep.red > (Object.values(ep.why).reduce((a, b) => a + b, 0) - ep.red) ? 'red' : best;
  }
  redWait = episodes.filter((e) => e.cause === 'red').length;
  return { name, spots: spots.map((s) => ({ x: Math.round(s.x), y: Math.round(s.y), d: s.d ? `${s.d.kind}${s.d.bulb ? ' bulb ' + Math.round(s.d.bulb) : ''} @${Math.round(s.d.x)},${Math.round(s.d.y)}` : null })),
    seen, episodes, loops, visits, removedStill, removedStillNearDead, redWait, crashes, panics, wrecked, abandoned, ends, ms: performance.now() - t0, simS: MINUTES * 60 };
}

// ---- the report -----------------------------------------------------------------------------------------------
const pct = (a, b) => (b ? `${((100 * a) / b).toFixed(1)}%` : '-');
const q = (arr, f) => { if (!arr.length) return 0; const s = arr.slice().sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(s.length * f))]; };
function summarise(r) {
  const jams = r.episodes.filter((e) => e.cause !== 'red');
  const near = jams.filter((e) => e.at !== 'elsewhere');
  const far = jams.filter((e) => e.at === 'elsewhere');
  const carS = (l) => l.reduce((s, e) => s + e.secs, 0);
  // vehicle-seconds stuck, by cause (biggest first)
  const byCause = (l) => { const o = {}; for (const e of l) o[e.cause] = (o[e.cause] || 0) + e.secs; return Object.fromEntries(Object.entries(o).sort((a, b) => b[1] - a[1]).map(([k, s]) => [k, Math.round(s)])); };
  const stuckCars = new Set(near.map((e) => e.id));
  const loopsNear = r.loops.filter((l) => l.at !== 'elsewhere');
  const vis = r.visits;
  const okVis = vis.filter((v) => !v.never);
  // hotspots: road ends with the most stuck car-seconds
  const spots = new Map();
  for (const e of near) { const k = e.d ? e.d.node : -1; const s = spots.get(k) || { d: e.d, n: 0, s: 0, why: {} }; s.n++; s.s += e.secs; s.why[e.cause] = (s.why[e.cause] || 0) + 1; spots.set(k, s); }
  return {
    name: r.name, cars: r.seen, minutes: MINUTES, wallS: +(r.ms / 1000).toFixed(1),
    nearDead: { episodes: near.length, cars: stuckCars.size, carSeconds: Math.round(carS(near)), longest: Math.round(Math.max(0, ...near.map((e) => e.secs))), byCause: byCause(near),
      byPlace: near.reduce((o, e) => ((o[e.at] = (o[e.at] || 0) + 1), o), {}), endedBy: near.reduce((o, e) => ((o[e.end] = (o[e.end] || 0) + 1), o), {}) },
    elsewhere: { episodes: far.length, carSeconds: Math.round(carS(far)), byCause: byCause(far) },
    loops: { nearDead: loopsNear.length, elsewhere: r.loops.length - loopsNear.length },
    visits: { n: vis.length, turnedOut: okVis.length, never: vis.length - okVis.length, p50: +q(okVis.map((v) => v.secs), 0.5).toFixed(1), p90: +q(okVis.map((v) => v.secs), 0.9).toFixed(1), max: +Math.max(0, ...okVis.map((v) => v.secs)).toFixed(1),
      neverHow: vis.filter((v) => v.never).reduce((o, v) => ((o[v.how] = (o[v.how] || 0) + 1), o), {}) },
    removedStill: r.removedStill, removedStillNearDead: r.removedStillNearDead, redWaits: r.redWait,
    crashes: r.crashes, panics: r.panics, wrecked: r.wrecked, abandoned: r.abandoned,
    hotspots: [...spots.values()].sort((a, b) => b.s - a.s).slice(0, 6).map((s) => ({ at: s.d ? `${s.d.kind}${s.d.bulb ? ' bulb' : ''} ${Math.round(s.d.x)},${Math.round(s.d.y)}` : '?', episodes: s.n, carSeconds: Math.round(s.s), why: s.why })),
    spots: r.spots,
  };
}

function main() {
const names = Object.keys(SCENARIOS).filter((n) => !ONLY || ONLY.has(n));
const all = [];
let seed = +opt('--seed', 11);
for (const n of names) {
  const r = runScenario(n, seed += 101);
  const s = summarise(r);
  all.push(s);
  if (all.length === 1) {
    const kinds = {};
    for (const d of r.ends) { const k = `${d.kind}${d.bulb ? ' (bulb)' : ''}`; kinds[k] = (kinds[k] || 0) + 1; }
    console.log(`Dead ends in the lane graph: ${r.ends.length}`, kinds);
  }
  console.log(`\n== ${n}: ${s.cars} traffic vehicles over ${MINUTES} in-game minutes (${s.wallS} s to run); players by ${s.spots.map((p) => p.d || `${p.x},${p.y}`).join(' | ')}`);
  console.log(`  stuck >${STILL_S}s at road ends: ${s.nearDead.episodes} episodes, ${s.nearDead.cars} vehicles, ${s.nearDead.carSeconds} vehicle-seconds (longest ${s.nearDead.longest} s)`);
  console.log(`    why (vehicle-s): ${JSON.stringify(s.nearDead.byCause)}`);
  console.log(`    where: ${JSON.stringify(s.nearDead.byPlace)}  ended: ${JSON.stringify(s.nearDead.endedBy)}`);
  console.log(`  stuck elsewhere: ${s.elsewhere.episodes} episodes, ${s.elsewhere.carSeconds} vehicle-seconds ${JSON.stringify(s.elsewhere.byCause)}; waits at red lights >${STILL_S}s: ${s.redWaits}`);
  console.log(`  circling: ${s.loops.nearDead} at road ends, ${s.loops.elsewhere} elsewhere`);
  console.log(`  visits to a road's end: ${s.visits.n}; turned round and out ${s.visits.turnedOut} (median ${s.visits.p50} s, 90% ${s.visits.p90} s, max ${s.visits.max} s); never ${s.visits.never} ${JSON.stringify(s.visits.neverHow)}`);
  console.log(`  crashes between traffic vehicles: ${s.crashes}; panics: ${s.panics}; smashed up (engine dead or blown up): ${s.wrecked}; left in the road by their drivers: ${s.abandoned}`);
  console.log(`  cleared away while stuck: ${s.removedStill} (${s.removedStillNearDead} at road ends)`);
  for (const h of s.hotspots) console.log(`    hotspot ${h.at}: ${h.episodes} episodes, ${h.carSeconds} vehicle-s ${JSON.stringify(h.why)}`);
}
const tot = (f) => all.reduce((s, x) => s + f(x), 0);
console.log(`\n== all: ${tot((s) => s.cars)} vehicles; stuck at road ends ${tot((s) => s.nearDead.episodes)} episodes / ${tot((s) => s.nearDead.cars)} vehicles / ${tot((s) => s.nearDead.carSeconds)} vehicle-s; elsewhere ${tot((s) => s.elsewhere.episodes)} / ${tot((s) => s.elsewhere.carSeconds)} vehicle-s; circling at road ends ${tot((s) => s.loops.nearDead)}, elsewhere ${tot((s) => s.loops.elsewhere)}; visits ${tot((s) => s.visits.n)}, never got out ${tot((s) => s.visits.never)}`);
console.log(`   crashes ${tot((s) => s.crashes)}, panics ${tot((s) => s.panics)}, smashed up ${tot((s) => s.wrecked)}, left in the road ${tot((s) => s.abandoned)}, cleared away while stuck ${tot((s) => s.removedStill)}`);
if (JSON_OUT) console.log(JSON.stringify(all, null, 1));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
void pct;
