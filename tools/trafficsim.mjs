// The traffic harness (the owner's notes, 11-03: "Traffic still seems to backup in areas ... make sure traffic is moving
// smoothly and NPCs humans and animals and vehicles are all operating with some intelligence"): World v3 - the live
// world - built headless as the server builds it, players standing in the busy town centres (the main stations) and one
// out in the wilds, the world run for some in-game minutes, and a report of how it went:
//   - vehicles stopped (inside a 32 px circle) for more than 20 s, and where - at a red light or not;
//   - the jam hot spots: clusters of three or more such vehicles, by the junction they're at (district, tile);
//   - why each stuck vehicle is stuck (a ring of cars each stopped for the next, a queue, a car nobody's driving, waiting
//     to get into a junction, a bend, someone on foot, a wall, a red light);
//   - the average speed on each kind of road (and how much of the time traffic on it is stopped);
//   - the last-resort rescues: cars cleared away while stuck, the ones that gave up (parkIt), and the traffic code's own
//     counters (rings broken, reroutes, back-outs from walls, ...);
//   - people on foot pressing into something (wanting to walk, going nowhere) and standing about in the road;
//   - animals pressing into something, and how often they gave a way up;
//   - the tick: its wall time (mean, p95) and the traffic, npc, wildlife and vehicles systems' shares.
// The first minute is warm-up (the traffic filling in round the players), not counted.
//   flock /tmp/cla-heavy.lock node --expose-gc tools/trafficsim.mjs            6 in-game minutes, seed 7
//   ... --min 10 --seed 3 --json /path/out.json --players Midtown,Northgate
// (the heavy lock: the build is about 100 s and 2 GB; the same seed gives the same run)
import { joinPlayer, teleport, players } from '../test/helpers.js';
import { World } from '../server/world.js';
import { buildWorld3 } from '../server/world3.js';
import { K, T, TILE } from '../shared/constants.js';
import { PED_BLOCK } from '../shared/map.js';
import { signalFor } from '../shared/signals.js';
import { mulberry32 } from '../shared/rng.js';
import { MAIN_STATIONS3 } from '../shared/world3-layout.js';
import { wildStyle } from '../server/systems/wildlife.js';
import { writeFileSync } from 'node:fs';
import * as RULES from '../shared/rules.js';
const DRIVER_SLIPS = RULES.DRIVER_SLIPS || {};   // (none before the fallible drivers: the baseline)
import { performance } from 'node:perf_hooks';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const MINUTES = +opt('--min', 6), SEED = +opt('--seed', 7), WARM_S = 60;
const JSON_OUT = opt('--json', '');
const TOWN = opt('--players', 'Midtown,Metro Central,Old Quarter,Northgate,Southside,Westport Center').split(',');
const WILD = opt('--wild', 'Red Rock');
if (args.includes('--no-slips')) DRIVER_SLIPS.on = false;   // (the fallible drivers off: slips.js)
const STUCK_S = 20, STILL_PX = 32, SAMPLE = 10;   // (ticks: 0.5 s)

Math.random = mulberry32(SEED + 2);
const { map: M } = await buildWorld3(1337, { log: (s) => console.log(s) });
if (typeof globalThis.gc === 'function') globalThis.gc();
const net = M.net;
const w = new World(M, { npcBudget: 700, throwErrors: false, rand: mulberry32(SEED + 1), loopStart: 400, day: 0 });

// ---- where the players stand ----------------------------------------------------------------------------------
function sidewalkNear(tx0, ty0, ok = (t) => t === T.SIDEWALK) {
  for (let k = 0; k < 80; k++) for (let dy = -k; dy <= k; dy++) for (let dx = -k; dx <= k; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) !== k) continue;
    const tx = tx0 + dx, ty = ty0 + dy;
    if (M.inside(tx, ty) && ok(M.tileAt(tx, ty), tx, ty)) return { x: (tx + 0.5) * TILE, y: (ty + 0.5) * TILE };
  }
  return null;
}
const spots = [];
for (const name of TOWN) {
  const st = MAIN_STATIONS3.find((q) => q.name === name);
  if (!st) { console.log(`no station ${name}`); continue; }
  const at = sidewalkNear(st.at[0], st.at[1] + 12);
  if (at) spots.push({ name, ...at });
}
if (WILD) {
  const st = MAIN_STATIONS3.find((q) => q.name === WILD);
  // out in the wilds a way off from the station: open ground the animals live on
  const at = st && sidewalkNear(st.at[0], st.at[1] + 60, (t, tx, ty) => (t === T.GRASS || t === T.DIRT || t === T.SAND) && !!wildStyle(M, (tx + 0.5) * TILE, (ty + 0.5) * TILE));
  if (at) spots.push({ name: `${WILD} (wilds)`, wild: true, ...at });
}
const ps = spots.map((s) => { const { p } = joinPlayer(w); teleport(w, p.ped, s.x, s.y); p.ped.protectUntil = 1e9; return p; });
console.log(`[sim] players: ${spots.map((s) => `${s.name} @${Math.floor(s.x / TILE)},${Math.floor(s.y / TILE)}`).join(' | ')}`);

// ---- what's what ------------------------------------------------------------------------------------------------
const streets = (n) => [...new Set(n.edges.map((id) => net.edges[id].name).filter(Boolean))].slice(0, 3).join(' / ');
const nodeName = (n) => n ? `${streets(n) || '?'}, ${M.districtAt(n.x, n.y).name || '?'} @${Math.floor(n.x / TILE)},${Math.floor(n.y / TILE)} (${n.edges.length}-way${n.light ? ', lights' : ''}${n.lvl !== 0 ? ', lvl ' + n.lvl : ''})` : '?';
const atRed = (v) => {
  const ai = v.ai, st = ai && ai.pts && ai.pts.find((p) => p.stop);
  if (!st) return false;
  const n = net.nodes[st.node];
  if (!n || !n.light || Math.hypot(st.x - v.x, st.y - v.y) > 320) return false;   // (a queue at the lights: its first few cars)
  return signalFor(n, st.edge, w.loopTime) !== 'G';
};
const blocker = (v) => { const b = v._blk ? w.get(v._blk) : null; return b && b.kind === K.VEH && Math.hypot(b.x - v.x, b.y - v.y) < v.def.L + b.def.L ? b : null; };
const npcDriven = (v) => { const d = v.seats[0] && w.get(v.seats[0]); return !!(d && d.npc); };
// why v is stopped (as a label), looking down the queue to its head
function cause(v, stuck) {
  const seen = new Set([v.id]);
  let head = v, b = blocker(v), depth = 0;
  while (b && stuck.has(b.id) && !seen.has(b.id)) { seen.add(b.id); head = b; b = blocker(b); depth++; }
  if (b && seen.has(b.id)) return depth ? 'queue>ring' : 'ring';
  const own = ownCause(head, b);
  return head === v ? own : `queue>${own}`;
}
function ownCause(v, b) {
  const ai = v.ai;
  if (b) {
    if (!b.ai || b.wreckAt || b.dead || b.parked || !b.seats[0]) return 'parked/empty car';
    if (b.ai.kind !== 'traffic') return `service (${b.ai.kind})`;
    if (b.ai.parkIt) return 'given-up car';
    if (!npcDriven(b)) return 'player car';
  }
  if (!ai) return 'no ai';
  if (ai.parkIt) return 'gave up';
  if (ai.turn) return 'turning round';
  if (atRed(v)) return 'red';
  const st = ai.pts && ai.pts.find((p) => p.stop);
  if (b) return 'blocked (moving car)';
  if (v._pblk) return 'person in road';
  if (st && Math.hypot(st.x - v.x, st.y - v.y) < 200) return ai.next && ai.next.edge === ai.edge ? 'road end' : 'junction (waiting to go)';
  if (v.bus || v.taxi) return 'bus/taxi at a halt';
  if (ai.reverseUntil > w.time - 3 || ai.stuck > 0.5 || ai.wallT > 0) return 'wall';
  return 'other';
}

// ---- the close look (--dump file): each stuck car's state, and people pressing into something ----
const DUMP = opt('--dump', ''), dumps = [], pedDumps = [];
const r1 = (x) => Math.round(x);
function vsum(b) {
  if (!b) return null;
  const d = b.seats[0] && w.get(b.seats[0]);
  return { id: b.id, model: b.model, at: [r1(b.x / TILE), r1(b.y / TILE)], a: +b.a.toFixed(2), sp: r1(Math.hypot(b.vx, b.vy)), parked: !!b.parked, despawnable: !!b.despawnable, wreck: !!b.wreckAt, owner: !!b.owner,
    driver: d ? (d.player ? 'player' : d.npc ? d.npc.role : '?') : null, ai: b.ai ? { kind: b.ai.kind, parkIt: !!b.ai.parkIt, turn: !!b.ai.turn, incident: !!b.ai.incident } : null, stillFor: b.stillSince !== undefined ? r1(w.time - b.stillSince) : null,
    tile: M.tileAtPx(b.x, b.y), onEvent: !!b.onEvent, towedBy: b.towedBy || 0, siren: !!b.siren, bus: !!b.bus, taxi: !!b.taxi };
}
function carDump(v, why, secs) {
  const ai = v.ai, e = net.edges[ai.edge], st = ai.pts && ai.pts.find((p) => p.stop), n = st && net.nodes[st.node];
  return { t: r1(w.time), why, secs: r1(secs), car: vsum(v), edge: e ? { id: e.id, kind: e.kind, name: e.name, nl: e.nl, oneway: !!e.oneway } : null, lane: ai.lane, from: ai.from,
    next: ai.next ? { edge: ai.next.edge, turn: +ai.next.turn.toFixed(2) } : null, pts: (ai.pts || []).slice(0, 3).map((p) => [r1(p.x / TILE * 10) / 10, r1(p.y / TILE * 10) / 10, p.stop ? 'stop' : p.halt !== undefined ? 'halt' : '']),
    stop: st ? { node: st.node, d: r1(Math.hypot(st.x - v.x, st.y - v.y)), light: n && n.light ? signalFor(n, st.edge, w.loopTime) : null, deg: n && n.edges.length } : null,
    waitNode: ai.waitNode, waited: ai.waitAt !== undefined ? r1(w.time - ai.waitAt) : null, jam: !!ai.jam, jamT: +(ai.jamT || 0).toFixed(1), howOut: ai.howOut || null, rerouteAgo: ai.rerouteAt !== undefined ? r1(w.time - ai.rerouteAt) : null,
    reverse: ai.reverseUntil > w.time, stuck: +(ai.stuck || 0).toFixed(2), yield: ai.yieldUntil > w.time, creep: ai.creepUntil > w.time, wallEsc: !!ai.wallEsc, endWait: +(ai.endWait || 0).toFixed(1), sideUntil: ai.sideUntil > w.time,
    ctl: ai.ctl ? { speed: r1(ai.ctl.speed), wx: r1(ai.ctl.wx / TILE), wy: r1(ai.ctl.wy / TILE) } : null, input: v.input, blk: vsum(v._blk ? w.get(v._blk) : null), pblk: v._pblk ? (() => { const q = w.get(v._pblk); return q ? { npc: q.npc ? q.npc.state : 'player', at: [r1(q.x / TILE), r1(q.y / TILE)], down: w.time < (q.downUntil || 0) } : null; })() : null,
    inView: false };
}
function pedDump(q) {
  const n = q.npc, props = [];
  const tx = Math.floor(q.x / TILE), ty = Math.floor(q.y / TILE);
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) for (const p of M.solidProps.get(M.idx(tx + i, ty + j)) || []) if (!p.off && Math.hypot(p.x - q.x, p.y - q.y) < p.r + 24) props.push({ t: p.t || p.kind, r: p.r, d: r1(Math.hypot(p.x - q.x, p.y - q.y)) });
  const ring = [];
  for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; ring.push(M.tileAtPx(q.x + Math.cos(a) * 16, q.y + Math.sin(a) * 16)); }
  return { at: [+(q.x / TILE).toFixed(2), +(q.y / TILE).toFixed(2)], to: [+(n.wx / TILE).toFixed(2), +(n.wy / TILE).toFixed(2)], d: r1(Math.hypot(n.wx - q.x, n.wy - q.y)), tile: M.tileAtPx(q.x, q.y), toTile: M.tileAtPx(n.wx, n.wy), ring, props,
    vx: r1(q.vx), vy: r1(q.vy), arch: n.archetype, until: r1(n.until - w.time), sideUntil: n.sideUntil > w.time, near: w.query(q.x, q.y, 30).filter((o) => o !== q).map((o) => o.kind === K.VEH ? `veh:${o.model}` : o.npc ? `ped:${o.npc.state}` : 'other'), los: M.los(q.x, q.y, n.wx, n.wy), fence: !!(M.fenceAt && M.fenceAt(q.x, q.y)) };
}

// ---- tracking -------------------------------------------------------------------------------------------------
const cars = new Map(), episodes = [], speedBy = {}, hot = new Map(), causeS = {}, jamEvents = new Map(), counters0 = {};
const COUNTERS = ['ringsBroken', 'ringRoomMade', 'sidesteps', 'reroutes', 'turnsHeld', 'wallBackouts', 'wallEscapes', 'rejoins', 'turns', 'turnsGivenUp', 'endsGivenUp', 'boxHolds', 'pedGapWaits', 'pedGapGiveUps', 'goneRound', 'straightened', 'madeWay'];
let removedStuck = 0, removedStuckInView = 0, hopeless = 0, maxStuck = 0, stuckSamples = 0, stuckSum = 0, carsSeen = 0;
const peds = new Map(); let pedPressS = 0, pedWanderS = 0, pedEpisodes = 0, pedRoadS = 0; const pedWhy = {};
const anim = new Map(); let animPressS = 0, animMoveS = 0, animEpisodes = 0, animGiveUps = 0, animSeen = 0; const animWhy = {};
const tickMs = []; const sys = { traffic: 0, npc: 0, wildlife: 0, vehicles: 0, pets: 0, streetlife: 0 }; let sysN = 0;
let countersTaken = false;

const ticks = Math.round(MINUTES * 60 * 20);
const tStart = performance.now();
for (let tick = 1; tick <= ticks; tick++) {
  ps.forEach((p, i) => { players.queueInput(p, { seq: tick, bits: 0, mx: 0, my: 0, aim: 0 }); if (p.ped.dead || p.ped.hp < p.ped.maxHp * 0.5) p.ped.hp = p.ped.maxHp; void i; });
  const t0 = performance.now();
  w.step();
  const dt = performance.now() - t0;
  const now = w.time, warm = now < WARM_S;
  if (!warm) {
    tickMs.push(dt);
    const prof = w.profile();
    for (const k of Object.keys(sys)) sys[k] += prof[k] || 0;
    sysN++;
  }
  if (!warm && !countersTaken) { countersTaken = true; for (const k of COUNTERS) counters0[k] = w[k] || 0; w.slips = {}; }
  if (tick % SAMPLE) continue;
  // vehicles
  const live = new Set(), stuckNow = new Set();
  for (const v of w.entities.values()) {
    if (v.kind !== K.VEH || !v.ai || v.ai.kind !== 'traffic' || !npcDriven(v)) continue;
    live.add(v.id);
    let c = cars.get(v.id);
    if (!c) { c = { ax: v.x, ay: v.y, at: now, red: 0, n: 0, model: v.model, why: {} }; cars.set(v.id, c); if (!warm) carsSeen++; }
    c.last = { x: v.x, y: v.y, inView: false };
    if (v.ai.hopeless && !c.hopeless) { c.hopeless = true; if (!warm) hopeless++; }
    const sp = Math.hypot(v.vx, v.vy), e = net.edges[v.ai.edge];
    if (!warm && e && !v.ai.parkIt) { const s = (speedBy[e.kind] ||= { n: 0, sum: 0, stopped: 0, red: 0 }); s.n++; s.sum += sp; if (sp < 8) { s.stopped++; if (atRed(v)) s.red++; } }
    if (Math.hypot(v.x - c.ax, v.y - c.ay) > STILL_PX) {
      if (now - c.at >= STUCK_S && c.n) episodes.push({ id: v.id, model: c.model, secs: now - c.at, x: c.ax, y: c.ay, red: c.red / c.n, why: c.why, end: 'moved' });
      c.ax = v.x; c.ay = v.y; c.at = now; c.red = 0; c.n = 0; c.why = {};
    }
    if (now - c.at >= STUCK_S) stuckNow.add(v.id);
  }
  // the stuck ones: why, where, and the clusters
  const list = [];
  for (const id of stuckNow) {
    const v = w.get(id), c = cars.get(id);
    const why = cause(v, stuckNow);
    if (DUMP && !warm && (!c.dumped || now - c.dumped > 60) && !why.startsWith('queue') && why !== 'red') { c.dumped = now; dumps.push(carDump(v, why, now - c.at)); }
    c.n++; if (why === 'red' || why === 'queue>red') c.red++;
    c.why[why] = (c.why[why] || 0) + 1;
    if (warm) continue;
    causeS[why] = (causeS[why] || 0) + SAMPLE / 20;
    if (why === 'red' || why === 'queue>red') continue;
    list.push(v);
    const n = M.nearestNode(v.x, v.y), key = n ? n.id : -1;
    const h = hot.get(key) || { node: n, s: 0, cars: new Set(), why: {} };
    h.s += SAMPLE / 20; h.cars.add(id); h.why[why] = (h.why[why] || 0) + 1;
    hot.set(key, h);
  }
  if (!warm) {
    stuckSum += list.length; stuckSamples++; maxStuck = Math.max(maxStuck, list.length);
    // clusters: single link within 140 px, three or more
    const grp = new Map(), par = list.map((_, i) => i);
    const find = (i) => (par[i] === i ? i : (par[i] = find(par[i])));
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) if (Math.hypot(list[i].x - list[j].x, list[i].y - list[j].y) < 140) par[find(i)] = find(j);
    list.forEach((v, i) => { const r = find(i); (grp.get(r) || grp.set(r, []).get(r)).push(v); });
    for (const g of grp.values()) {
      if (g.length < 3) continue;
      const cx = g.reduce((s, v) => s + v.x, 0) / g.length, cy = g.reduce((s, v) => s + v.y, 0) / g.length, n = M.nearestNode(cx, cy), key = n ? n.id : -1;
      const j = jamEvents.get(key) || { node: n, first: now, last: now, peak: 0, samples: 0 };
      j.last = now; j.peak = Math.max(j.peak, g.length); j.samples++;
      jamEvents.set(key, j);
    }
  }
  // gone since the last sample
  for (const [id, c] of cars) {
    if (live.has(id)) continue;
    cars.delete(id);
    const v = w.get(id), stillFor = now - c.at;
    if (!warm && !v && stillFor >= 30) { removedStuck++; }
    if (!warm && stillFor >= STUCK_S && c.n) episodes.push({ id, model: c.model, secs: stillFor, x: c.ax, y: c.ay, red: c.red / c.n, why: c.why, end: v ? 'left traffic' : 'removed' });
  }
  if (warm) continue;
  // people on foot: wandering somewhere and getting nowhere
  const pl = new Set();
  for (const q of w.entities.values()) {
    if (q.kind !== K.PED || !q.npc || q.dead || q.vehId || q.player || q.wild) continue;
    const n = q.npc;
    if (n.state !== 'wander' || n.desk || n.guard || n.driven || n.act || n.persona || n.waitTrain !== undefined || n.boardTrain) { peds.delete(q.id); continue; }   // (a commuter waiting on the platform isn't stuck)
    pl.add(q.id);
    let c = peds.get(q.id);
    if (!c) { c = { hist: [], press: 0 }; peds.set(q.id, c); }
    c.hist.push({ x: q.x, y: q.y }); if (c.hist.length > 4) c.hist.shift();
    pedWanderS += 0.5;
    const t = M.tileAtPx(q.x, q.y);
    if (t === T.ROAD || t === T.BRIDGE) pedRoadS += 0.5;
    const far = Math.hypot((n.wx ?? q.x) - q.x, (n.wy ?? q.y) - q.y) > 24;
    const moved = c.hist.length === 4 ? Math.hypot(c.hist[0].x - q.x, c.hist[0].y - q.y) : 99;
    if (far && moved < 8) {
      c.press += 0.5; pedPressS += 0.5;
      if (c.press === 3) {
        pedEpisodes++;
        if (DUMP && pedDumps.length < 80) pedDumps.push(pedDump(q));
        const a = Math.atan2(n.wy - q.y, n.wx - q.x), fx = q.x + Math.cos(a) * 18, fy = q.y + Math.sin(a) * 18;
        const why = PED_BLOCK[M.tileAtPx(fx, fy)] ? 'wall/building' : w.query(fx, fy, 30, K.VEH).length ? 'vehicle' : w.query(fx, fy, 16, K.PED).some((o) => o !== q) ? 'person' : 'prop/other';
        pedWhy[why] = (pedWhy[why] || 0) + 1;
      }
    } else c.press = 0;
  }
  for (const id of peds.keys()) if (!pl.has(id)) peds.delete(id);
  // animals: meaning to move, getting nowhere
  const al = new Set();
  for (const a of w.entities.values()) {
    if (a.kind !== K.PED || !a.wild || a.dead) continue;
    const ws = a.wild;
    al.add(a.id);
    let c = anim.get(a.id);
    if (!c) { c = { hist: [], press: 0, gu: ws.stuck || 0 }; anim.set(a.id, c); animSeen++; }
    if ((ws.stuck || 0) > c.gu) animGiveUps += ws.stuck - c.gu;
    c.gu = ws.stuck || 0;
    c.hist.push({ x: a.x, y: a.y }); if (c.hist.length > 4) c.hist.shift();
    const wants = (ws.sp || 0) > 12;
    if (wants) animMoveS += 0.5;
    const moved = c.hist.length === 4 ? Math.hypot(c.hist[0].x - a.x, c.hist[0].y - a.y) : 99;
    if (wants && moved < 8) {
      c.press += 0.5; animPressS += 0.5;
      if (c.press === 3) { animEpisodes++; animWhy[`${ws.kind}:${ws.state}`] = (animWhy[`${ws.kind}:${ws.state}`] || 0) + 1; }
    } else c.press = 0;
  }
  for (const id of anim.keys()) if (!al.has(id)) anim.delete(id);
}
const now = w.time;
for (const [id, c] of cars) if (now - c.at >= STUCK_S && c.n) episodes.push({ id, model: c.model, secs: now - c.at, x: c.ax, y: c.ay, red: c.red / c.n, why: c.why, end: 'still stuck at the end' });

// ---- the report -------------------------------------------------------------------------------------------------
const q = (a, f) => { if (!a.length) return 0; const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * f))]; };
const top = (o) => Object.fromEntries(Object.entries(o).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, Math.round(v)]));
const jams = episodes.filter((e) => e.red < 0.5);
const mainWhy = (e) => Object.entries(e.why).sort((a, b) => b[1] - a[1])[0]?.[0] || '?';
const byWhy = {}; for (const e of jams) byWhy[mainWhy(e)] = (byWhy[mainWhy(e)] || 0) + 1;
const counters = Object.fromEntries(COUNTERS.map((k) => [k, (w[k] || 0) - (counters0[k] || 0)]).filter(([, v]) => v));
const out = {
  seed: SEED, minutes: MINUTES, counted: MINUTES - WARM_S / 60, players: spots.map((s) => s.name), wallS: +((performance.now() - tStart) / 1000).toFixed(0),
  vehicles: {
    seen: carsSeen,
    stuck20: { episodes: jams.length, cars: new Set(jams.map((e) => e.id)).size, carSeconds: Math.round(jams.reduce((s, e) => s + e.secs, 0)), longest: Math.round(Math.max(0, ...jams.map((e) => e.secs))), p90: Math.round(q(jams.map((e) => e.secs), 0.9)), byCause: top(byWhy), ended: jams.reduce((o, e) => ((o[e.end] = (o[e.end] || 0) + 1), o), {}) },
    redWaits20: episodes.length - jams.length,
    stuckNow: { avg: +(stuckSum / Math.max(1, stuckSamples)).toFixed(2), peak: maxStuck },
    stuckSecondsByCause: top(causeS),
    jamClusters: { count: jamEvents.size, clusterSeconds: Math.round([...jamEvents.values()].reduce((s, j) => s + j.samples * SAMPLE / 20, 0)),
      list: [...jamEvents.values()].sort((a, b) => b.samples - a.samples).slice(0, 12).map((j) => ({ at: nodeName(j.node), peak: j.peak, secs: j.samples * SAMPLE / 20, from: Math.round(j.first), to: Math.round(j.last) })) },
    hotspots: [...hot.values()].sort((a, b) => b.s - a.s).slice(0, 12).map((h) => ({ at: nodeName(h.node), carSeconds: Math.round(h.s), cars: h.cars.size, why: top(h.why) })),
    speed: Object.fromEntries(Object.entries(speedBy).sort((a, b) => b[1].n - a[1].n).map(([k, s]) => [k, { avg: Math.round(s.sum / s.n), stoppedPct: +(100 * s.stopped / s.n).toFixed(1), atRedPct: +(100 * s.red / s.n).toFixed(1), samples: s.n }])),
    rescues: { clearedWhileStuck: removedStuck, gaveUp: hopeless, ...counters },
    vehicleHours: +(Object.values(speedBy).reduce((s, x) => s + x.n, 0) * SAMPLE / 20 / 3600).toFixed(2),
  },
  slips: (() => { const s = { ...(w.slips || {}) }; const vh = Object.values(speedBy).reduce((a, x) => a + x.n, 0) * SAMPLE / 20 / 3600; s.perVehicleHour = Object.fromEntries(['misses', 'missHits', 'missHitsPlayer', 'rearEnds', 'argues', 'fights', 'carsLeft'].map((k) => [k, +((s[k] || 0) / Math.max(0.01, vh)).toFixed(2)])); s.incidentsOpen = (w.slipIncidents || []).length; return s; })(),
  peds: { wanderSeconds: Math.round(pedWanderS), pressingSeconds: Math.round(pedPressS), pressingPct: +(100 * pedPressS / Math.max(1, pedWanderS)).toFixed(2), episodes3s: pedEpisodes, why: pedWhy, inRoadSeconds: Math.round(pedRoadS) },
  animals: { seen: animSeen, movingSeconds: Math.round(animMoveS), pressingSeconds: Math.round(animPressS), pressingPct: +(100 * animPressS / Math.max(1, animMoveS)).toFixed(2), episodes3s: animEpisodes, giveUps: animGiveUps, why: top(animWhy) },
  tick: { mean: +(tickMs.reduce((s, x) => s + x, 0) / tickMs.length).toFixed(2), p50: +q(tickMs, 0.5).toFixed(2), p95: +q(tickMs, 0.95).toFixed(2), max: +Math.max(...tickMs).toFixed(1),
    systems: Object.fromEntries(Object.entries(sys).map(([k, s]) => [k, +(s / sysN).toFixed(3)])), entities: w.entities.size },
};
console.log(JSON.stringify(out, null, 1));
if (DUMP) writeFileSync(DUMP, JSON.stringify({ cars: dumps, peds: pedDumps }, null, 1));
if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify({ ...out, episodes: jams.sort((a, b) => b.secs - a.secs).slice(0, 60).map((e) => ({ ...e, at: `${Math.floor(e.x / TILE)},${Math.floor(e.y / TILE)}`, district: M.districtAt(e.x, e.y).name })) }, null, 1));
