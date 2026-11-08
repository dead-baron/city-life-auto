// The event calendar (docs/PROGRESSION.md "Extraction and scheduled events"): announced, scheduled, big - built on the
// streets' armored trucks (streetlife.js), the open cargo (cargo.js) and the payouts on delivery (extract.js).
// A generic scheduler: rules.js EVENTS, each { id, title, periodS, offsetS, durationS, on } on the wall clock (an
// occurrence k starts at (k * periodS + offsetS) s past 1970-01-01 UTC), so a restart keeps the timetable: a server that
// comes up inside an occurrence's first EVENT_GRACE_S still starts it, later than that it waits for the next. One with
// nobody online doesn't run. Each event's runner (RUNNERS) starts it, steps it once a second and says when it's over;
// gang war, the district crackdown, street race night and the car soccer cup are listed (on: false) for later.
//   - the armored truck run (every 30 min): a calendar IronVault truck leaves a bank with ARMORED_EVENT.gold carbon-gold
//     crates for another bank across town, by road - the same route for a given occurrence (armoredPlan: the bank pairs
//     on the same land whose shortest road route is ARMORED_EVENT.runPx long and keeps ftuePx clear of every new
//     character's arrival station, used lot and steal alley, taken in turn). Two guards with pistols, no one in the
//     back, no squad car: one player can rob it. Its gold shows on everyone's map (extract.js). Officers and licensed
//     bounty hunters who stay with it (guardPx) for guardMinS each get guardPay when it gets there; the gold robbed
//     off it is theirs to bring back (extract.js recovery).
//   - the dock shipment (hourly): a cargo ship unloads DOCK_EVENT steel and iron crates on Port Westport's quay (the
//     port's moored ship: m.port; on a map without one, by the marina) - first come, first served; the ones nobody's
//     taken are cleared away at the end.
// Announced in the city feed when one starts (events.add), listed with its countdown on the phone (the City feed app's
// "Coming up": listing), and as cards for the "What's next" app (eventCards).
import { K, T, TILE } from '../../shared/constants.js';
import { EVENTS, EVENT_GRACE_S, ARMORED_EVENT, DOCK_EVENT, CRATE_PAY, EXTRACT } from '../../shared/rules.js';
import { PED_BLOCK } from '../../shared/map.js';
import { store } from '../store.js';
import * as events from './events.js';
import * as law from './law.js';
import * as streetlife from './streetlife.js';
import * as firstcar from './firstcar.js';
import { wildStyle } from './wildlife.js';

let clock = () => Date.now();
export function setClock(fn) { clock = fn || (() => Date.now()); }   // (tests)
let W = null;   // (the running world: eventCards)

const money = (n) => '$' + Math.round(n).toLocaleString('en-US');
export const eventById = (id) => EVENTS.find((e) => e.id === id) || null;
export const keyOf = (ev, k) => `${ev.id}:${k}`;

// ---- the timetable ----------------------------------------------------------------------------------------------------
// the occurrence of ev that started at or last before ms: { k, start, end } (ms)
export function occurrence(ev, ms) {
  const k = Math.floor((ms / 1000 - ev.offsetS) / ev.periodS), start = (k * ev.periodS + ev.offsetS) * 1000;
  return { k, start, end: start + ev.durationS * 1000 };
}
// the first occurrence that hasn't started by ms (strictly after it)
export function nextOccurrence(ev, ms) {
  const o = occurrence(ev, ms), start = o.start + ev.periodS * 1000;
  return { k: o.k + 1, start, end: start + ev.durationS * 1000 };
}
// the occurrence to start at ms, if any: under way, inside its first EVENT_GRACE_S, not started already
export function due(ev, ms, started) {
  const o = occurrence(ev, ms);
  return ms - o.start <= EVENT_GRACE_S * 1000 && ms < o.end && !started.has(keyOf(ev, o.k)) ? o : null;
}

const C = (world) => (world.cal ??= { started: new Set(), live: [] });
export const liveRuns = (world) => C(world).live;

export function update(world) {
  W = world;
  if (world.tick % 20 !== 13) return;
  const ms = clock(), cal = C(world);
  for (const ev of EVENTS) {
    if (!ev.on || !RUNNERS[ev.id]) continue;
    const o = due(ev, ms, cal.started);
    if (!o) continue;
    cal.started.add(keyOf(ev, o.k));
    if (cal.started.size > 64) cal.started.delete(cal.started.values().next().value);
    let online = false;
    for (const p of world.players.values()) if (p.conn) { online = true; break; }
    if (!online) continue;   // (nobody to see it: it doesn't run - the next one will)
    start(world, ev, o);
  }
  for (const r of [...cal.live]) {
    RUNNERS[r.id].step(world, r, ms);
    if (r.over || ms > r.end + 60e3) { r.over = true; cal.live = cal.live.filter((q) => q !== r); }
  }
}
function start(world, ev, o) {
  const r = RUNNERS[ev.id].start(world, ev, o);
  if (!r) return null;
  Object.assign(r, { id: ev.id, key: keyOf(ev, o.k), k: o.k, start: o.start, end: o.end });
  C(world).live.push(r);
  return r;
}
// (dev and tests: this event's current occurrence started now, whatever the clock says)
export function startNow(world, id) {
  const ev = eventById(id);
  if (!ev || !RUNNERS[id]) return null;
  const ms = clock(), o = { ...occurrence(ev, ms) };
  o.start = ms; o.end = ms + ev.durationS * 1000;
  C(world).started.add(keyOf(ev, o.k));
  return start(world, ev, o);
}

// ---- the armored truck run's route ------------------------------------------------------------------------------------
// The places new characters start (ftue.js, firstcar.js): every arrival station, its used lot and its steal alley
export function ftueSpots(world) {
  const out = [];
  for (const c of firstcar.arrivalChoices(world)) {
    const st = world.map.pois[c.poi];
    if (st) out.push({ x: st.x, y: st.y });
    const P = firstcar.placesFor(world, c.poi);
    if (P && P.lot) out.push({ x: P.lot.x, y: P.lot.y });
    if (P && P.alley) out.push({ x: P.alley.x, y: P.alley.y });
  }
  return out;
}
// shortest road routes out of junction s (forward, one-way streets honoured): { dist, prev (node), via (edge) }
function dijkstra(net, s) {
  const N = net.nodes.length, dist = new Float64Array(N).fill(Infinity), prev = new Int32Array(N).fill(-1), via = new Int32Array(N).fill(-1);
  const hn = [], hd = [];   // (a binary heap of [node, dist])
  const push = (n, d) => { let i = hn.length; hn.push(n); hd.push(d); while (i > 0) { const j = (i - 1) >> 1; if (hd[j] <= d) break; hn[i] = hn[j]; hd[i] = hd[j]; i = j; } hn[i] = n; hd[i] = d; };
  const pop = () => {
    const n = hn[0], ln = hn.pop(), ld = hd.pop();
    if (hn.length) {
      let i = 0;
      for (;;) { const l = 2 * i + 1, r = l + 1; let m = i, md = ld; if (l < hn.length && hd[l] < md) { m = l; md = hd[l]; } if (r < hn.length && hd[r] < md) m = r; if (m === i) break; hn[i] = hn[m]; hd[i] = hd[m]; i = m; }
      hn[i] = ln; hd[i] = ld;
    }
    return n;
  };
  dist[s] = 0; push(s, 0);
  while (hn.length) {
    const d0 = hd[0], u = pop();
    if (d0 > dist[u]) continue;
    for (const [eid, to] of Object.entries(net.nodes[u].links)) {
      const d = d0 + net.edges[+eid].len;
      if (d < dist[to]) { dist[to] = d; prev[to] = u; via[to] = +eid; push(to, d); }
    }
  }
  return { dist, prev, via };
}
// Every route the run can take: [{ from, to (bank pois), n0 (the junction it sets off from), edges [ids], len }], in a
// fixed order - the bank pairs on the same land ARMORED_EVENT.runPx apart by road, clear of the new characters' places
const ROUTES = new WeakMap();
export function armoredRoutes(world) {
  const m = world.map;
  if (ROUTES.has(m)) return ROUTES.get(m);
  const net = m.net, out = [];
  if (net) {
    const spots = ftueSpots(world), clear2 = ARMORED_EVENT.ftuePx * ARMORED_EVENT.ftuePx;
    const far = (x, y) => spots.every((q) => (q.x - x) * (q.x - x) + (q.y - y) * (q.y - y) >= clear2);
    const banks = m.pois.filter((q) => q.kind === 'bank' && !wildStyle(m, q.x, q.y) && far(q.x, q.y)).map((q) => ({ q, n: m.nearestNode(q.x, q.y) })).filter((b) => b.n);
    for (const A of banks) {
      const D = dijkstra(net, A.n.id);
      for (const B of banks) {
        if (B === A || !!B.n.island !== !!A.n.island) continue;
        const len = D.dist[B.n.id];
        if (!(len >= ARMORED_EVENT.runPx[0] && len <= ARMORED_EVENT.runPx[1])) continue;
        const edges = [];
        for (let n = B.n.id; n !== A.n.id; n = D.prev[n]) edges.push(D.via[n]);
        edges.reverse();
        if (edges.every((eid) => net.edges[eid].pts.every((pt) => far(pt.x, pt.y)))) out.push({ from: A.q, to: B.q, n0: A.n.id, edges, len: Math.round(len) });
      }
    }
  }
  ROUTES.set(m, out);
  return out;
}
// occurrence k's route (they take turns)
export function armoredPlan(world, k) {
  const R = armoredRoutes(world);
  return R.length ? R[((k % R.length) + R.length) % R.length] : null;
}

// ---- the runners ------------------------------------------------------------------------------------------------------
const RUNNERS = {
  armored: {
    start(world, ev, o) {
      const plan = armoredPlan(world, o.k);
      if (!plan) return null;
      const e0 = world.map.net.edges[plan.edges[0]], spot = streetlife.spotOn(world, e0, plan.n0);
      for (const v of world.query(spot.p.x, spot.p.y, 90, K.VEH)) if (v.ai && v.ai.kind === 'traffic' && v.despawnable && !v.onEvent && !v.seats.some((s) => s && world.get(s) && world.get(s).player)) world.remove(v);   // (traffic in the way at the bank's door: gone)
      const sev = streetlife.startArmored(world, spot, { x: plan.to.x, y: plan.to.y, kind: 'bank' }, {
        sched: { key: keyOf(ev, o.k), id: ev.id }, load: new Array(ARMORED_EVENT.gold).fill(4), arms: 'pistol', back: 0, escort: false,
        maxS: Math.max(60, ev.durationS - 20), from: 'bank', text: `Armored truck run: carbon-gold leaving ${plan.from.label} for ${plan.to.label}`,
      });
      return sev ? { sev, plan, guardT: new Map() } : null;
    },
    step(world, r) {
      const sev = r.sev, van = world.get(sev.van);
      if (van && !van.removed && !sev.spilled) {   // (the officers and hunters riding along)
        for (const p of world.players.values()) {
          const ped = p.ped;
          if (!(p.badge || p.hunter) || !ped || ped.dead || (p.wanted || 0) > 0 || Math.hypot(ped.x - van.x, ped.y - van.y) > ARMORED_EVENT.guardPx) continue;
          r.guardT.set(p.pid, (r.guardT.get(p.pid) || 0) + 1);
        }
      }
      if (streetlife.live(world).includes(sev)) return;
      r.over = true; r.how = sev.how;
      if (sev.how !== 'delivered') return;
      events.feed(world, { kind: 'armored', text: `The armored truck run got its gold to ${r.plan.to.label}`, x: sev.x, y: sev.y });
      for (const [pid, t] of r.guardT) {
        const p = world.players.get(pid);
        if (!p || t < ARMORED_EVENT.guardMinS) continue;
        p.profile.bank += ARMORED_EVENT.guardPay;
        p.profile.samaritan = (p.profile.samaritan || 0) + EXTRACT.vaultSam;
        if (p.badge) law.addPolicePts(world, p, ARMORED_EVENT.guardPts);
        world.notify(p, `The gold got through - IronVault paid you ${money(ARMORED_EVENT.guardPay)} for the escort (to your bank).`, 'good');
        p.meDirty = true;
      }
      store.touch();
    },
  },
  dock: {
    start(world, ev, o) {
      const site = dockSite(world);
      if (!site) return null;
      const tiers = [...new Array(DOCK_EVENT.iron).fill(3), ...new Array(DOCK_EVENT.steel).fill(2)], ids = [], key = keyOf(ev, o.k);
      const until = world.time + ev.durationS;
      tiers.forEach((tier, i) => {
        const at = landNear(world.map, site.x + ((i % 3) - 1) * 36, site.y + (Math.floor(i / 3) - 0.5) * 36);
        const c = world.spawnCrate(tier, at.x, at.y, { contraband: false, label: tier === 3 ? 'Shipping Vault' : 'Shipping Barrel', value: CRATE_PAY[tier], expires: until });
        c.extract = { src: 'dock', stolen: false, ev: key, from: { x: at.x, y: at.y } };
        c.z = 40; c.vz = -10;   // (swung down off the ship)
        ids.push(c.id);
      });
      events.add(world, { kind: 'dock', x: site.x, y: site.y, until, text: `Dock shipment: a cargo ship is unloading steel and iron at ${site.name} - first come, first served` });
      events.tellNear(world, site.x, site.y, `A cargo ship is unloading at ${site.name} - ${tiers.length} crates on the quay, first come, first served.`, 'info');
      return { crates: ids, site };
    },
    step(world, r, ms) {
      const left = r.crates.filter((id) => { const c = world.get(id); return c && !c.removed; });
      if (ms >= r.end || !left.length) r.over = true;
    },
  },
};

// Where the dock shipment lands: on Port Westport's quay by its moored ship (m.port), else by the marina - { x, y, name }
const DOCKS = new WeakMap();
export function dockSite(world) {
  const m = world.map;
  if (DOCKS.has(m)) return DOCKS.get(m);
  let site = null;
  // a container ship moored at a quay (its hull's props, 'cship'; World v3's Port Westport: shared/world3-port.js), the
  // crates set down on the quay beside its middle, on the land side - Port Westport's ship first
  const hull = (m.props || []).filter((q) => q && q.t === 'cship'), ships = [];
  for (const q of hull) {
    let sh = ships.find((g) => g.some((o) => Math.hypot(o.x - q.x, o.y - q.y) < 600));
    if (!sh) ships.push((sh = []));
    sh.push(q);
  }
  const quays = [];
  for (const sh of ships) {
    const xs = sh.map((q) => q.x), ys = sh.map((q) => q.y), cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    const ns = Math.max(...ys) - Math.min(...ys) >= Math.max(...xs) - Math.min(...xs);   // (lying north-south: the quay east or west of it)
    for (const side of [-1, 1]) {
      const off = side * (120 + 4.5 * TILE), x = ns ? cx + off : cx, y = ns ? cy : cy + off;
      if (OPEN(m, x, y)) { const d = m.districtAt(x, y); quays.push({ x, y, west: !!d && d.name === 'Port Westport' }); break; }
    }
  }
  if (quays.length) site = quays.find((q) => q.west) || quays[0];
  if (!site && m.port && m.port.ship && m.port.apron) {
    const a = m.port.apron, sh = m.port.ship;
    site = { x: (a.x + a.w / 2) * TILE, y: sh.y + sh.h / 2 };
  }
  if (!site && m.port && m.port.apron) { const a = m.port.apron; site = { x: (a.x + a.w / 2) * TILE, y: (a.y0 + a.y1) / 2 * TILE }; }   // (the quay, no ship drawn)
  if (!site) {   // (a map without a container port: by the marina)
    const q = m.pois.find((p) => p.kind === 'marina') || m.pois.find((p) => p.kind === 'warehouse');
    if (q) site = { x: q.x, y: q.y };
  }
  if (site) {
    const at = landNear(m, site.x, site.y), d = m.districtAt(at.x, at.y);
    site = { x: at.x, y: at.y, name: (d && d.name) || 'the docks' };
  }
  DOCKS.set(m, site);
  return site;
}
// open ground a person could stand on at or round (x, y)
const OPEN = (m, x, y) => { const t = m.tileAtPx(x, y); return t !== undefined && !PED_BLOCK[t] && t !== T.WATER && t !== T.DEEP; };
function landNear(m, x, y) {
  if (OPEN(m, x, y)) return { x, y };
  for (let r = 16; r <= 320; r += 16) for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2, px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
    if (OPEN(m, px, py)) return { x: px, y: py };
  }
  return { x, y };
}

// ---- what's on: the phone's listing, the "What's next" app's cards ------------------------------------------------------
// [{ id, title, sub, on, live, etaS (null: not scheduled yet), pay, x, y }] - every event in the calendar, the ones on
// first, soonest first
export function listing(world, p, ms = clock()) {
  const cal = C(world), out = [];
  for (const ev of EVENTS) {
    if (!ev.on || !RUNNERS[ev.id]) { out.push({ id: ev.id, title: ev.title, sub: 'Coming soon', on: false, live: false, etaS: null, pay: 0, x: null, y: null }); continue; }
    const run = cal.live.find((r) => r.id === ev.id && !r.over);
    const o = run ? { k: run.k, start: run.start } : nextOccurrence(ev, ms);
    const e = { id: ev.id, title: ev.title, on: true, live: !!run, etaS: run ? 0 : Math.max(0, Math.round((o.start - ms) / 1000)), pay: 0, sub: '', x: null, y: null };
    const cop = !!(p && (p.badge || p.hunter));
    if (ev.id === 'armored') {
      const P = run ? run.plan : armoredPlan(world, o.k);
      const van = run && world.get(run.sev.van);
      if (P) {
        e.sub = run ? `Gold on the move from ${P.from.label} to ${P.to.label} - ${cop ? 'guard it' : 'rob it or guard it'}` : `Leaves ${P.from.label} for ${P.to.label} with ${ARMORED_EVENT.gold} carbon-gold crates`;
        const at = van && !van.removed ? van : P.from;
        e.x = Math.round(at.x); e.y = Math.round(at.y);
      } else e.sub = 'No route today';
      e.pay = cop ? ARMORED_EVENT.guardPay : CRATE_PAY[4] * ARMORED_EVENT.gold;
    } else if (ev.id === 'dock') {
      const s = dockSite(world);
      e.sub = run ? `Crates on the quay at ${s.name} - first come, first served` : `A cargo ship unloads steel and iron at ${s ? s.name : 'the docks'}`;
      if (s) { e.x = Math.round(s.x); e.y = Math.round(s.y); }
      e.pay = CRATE_PAY[3];
    }
    out.push(e);
  }
  return out.sort((a, b) => (b.on - a.on) || ((a.etaS ?? 1e12) - (b.etaS ?? 1e12)));
}

// The "What's next" app's event cards for this player (the lead wires them in): the events that are on, soonest first -
// [{ id, source: 'event', title, sub, etaS, pay, action: { type: 'waypoint', x, y } }]. now: wall-clock ms.
export function eventCards(player, now = clock(), world = W) {
  if (!world) return [];
  return listing(world, player, now).filter((e) => e.on && e.x !== null).map((e) => ({
    id: `event:${e.id}`, source: 'event', title: e.title, sub: e.sub, etaS: e.etaS, pay: e.pay, action: { type: 'waypoint', x: e.x, y: e.y },
  }));
}
