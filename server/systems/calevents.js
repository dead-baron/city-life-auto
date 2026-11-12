// The event calendar's other four (docs/PROGRESSION.md "Extraction and scheduled events"; the scheduler, the listing and
// the cards: calendar.js, which merges these RUNNERS with its own). Each built on what's already there, the numbers in
// shared/rules.js, reaching into the other systems through eventhooks.js:
//   - gang war (GANGWAR_EVENT, 3 a day): the Syndicate and a biker club (shared/clubs.js - the gang role's fights,
//     npc.js, with each fighter's warSide so the two sides fight each other) over a gang hideout's block
//     (gangwar.js turfSpots, clear of the new characters' places) - its holder (store.kept.gangHolds: there's no turf
//     map beyond that, so a block's holder is who defends it next time) against a challenger. The fighters exist only
//     while a player is near; nobody there, the dice decide. A side's rally point offers "fight for them" (eventhooks
//     interactions): kills pay, the win pays, standing with the gang (profile.gangRep: { [gang id]: -100..100 }, absent on
//     old saves). Officers police it: a block's arrests pay copXp times the police XP, its downed fighters can be cuffed.
//   - district crackdown (CRACKDOWN_EVENT, daily, an hour): one district, taken in turn - eventhooks mods there: twice
//     the units after a wanted player (police.js, capped), bail and fines up (custody.js), heat faster (law.js addHeat),
//     an officer's arrest pays more (law.js arrest); and a few more officers on foot about the players there.
//   - street race night (RACENIGHT_EVENT, evenings by the wall clock): a chain of street sprints along road routes (the
//     calendar's Dijkstra; the city's racers - streetlife.js driven - fill the grid), points per place, the pot to the
//     night's top three.
//   - the car soccer cup (SOCCERCUP_EVENT, weekends): your own bracket at the arena's matches (carsoccer.js calls
//     'soccerResult' at full time and asks 'soccerTag' for the gate's line) - the city's drivers fill the sides, so one
//     player can lift it.
// With none of them on, nothing here runs: the calendar steps only live runs, and every hook is an empty list.
import { T } from '../../shared/constants.js';
import { PED_BLOCK, isTurf } from '../../shared/map.js';
import { lanePath } from '../../shared/roads.js';
import { pointAt } from '../../shared/geom.js';
import { CLUBS, CLUB_BY_ID } from '../../shared/clubs.js';
import { GANGWAR_EVENT as GW, CRACKDOWN_EVENT as CD, RACENIGHT_EVENT as RN, SOCCERCUP_EVENT as SC, CAREERS } from '../../shared/rules.js';
import { hash2 } from '../../shared/rng.js';
import { inAnyView } from '../view.js';
import { store } from '../store.js';
import * as events from './events.js';
import * as evhooks from './eventhooks.js';
import * as careers from './careers.js';
import * as skills from './skills.js';
import * as gangwar from './gangwar.js';
import * as streetlife from './streetlife.js';
import { spawnNpc, despawnNpc, startFight, markBrawl } from './npc.js';
import { wildStyle } from './wildlife.js';
import { ftueSpots, dijkstra, landNear } from './calendar.js';

const money = (n) => '$' + Math.round(n).toLocaleString('en-US');
const mod = (k, n) => ((k % n) + n) % n;
const ordinal = (n) => `${n}${n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'}`;
const live = (world, id) => (world.cal && world.cal.live.find((r) => r.id === id && !r.over)) || null;
const playersNear = (world, x, y, r) => { const out = []; for (const p of world.players.values()) if (p.conn && p.ped && !p.ped.dead && Math.hypot(p.ped.x - x, p.ped.y - y) < r) out.push(p); return out; };
const OPEN = (m, x, y) => { const t = m.tileAtPx(x, y); return t !== undefined && !PED_BLOCK[t] && t !== T.WATER && t !== T.DEEP; };
const far = (spots, x, y, px) => spots.every((q) => Math.hypot(q.x - x, q.y - y) >= px);

// ---- the gangs ------------------------------------------------------------------------------------------------------
export const GANGS = () => [{ id: 'syndicate', name: 'the Syndicate', short: 'Syndicate' }, ...CLUBS.map((c) => ({ id: c.id, name: `the ${c.short}`, short: c.short }))];
export const gangName = (id) => (GANGS().find((g) => g.id === id) || { name: id }).name;
// a player's standing with a gang (profile.gangRep), -100..100
export const standing = (p, id) => ((p.profile.gangRep || {})[id] || 0);
function addStanding(p, id, n) {
  if (!n) return;
  const R = (p.profile.gangRep ||= {});
  R[id] = Math.max(-100, Math.min(100, (R[id] || 0) + n));
  store.touch(); p.meDirty = true;
}

// ---- gang war ---------------------------------------------------------------------------------------------------------
// The blocks fought over: the gang hideouts (gangwar.js turfSpots - the turf's first), clear of the new characters'
// places, each with its district and a street to name it by - [{ key, x, y, district, street }]
const BLOCKS = new WeakMap();
export function warBlocks(world) {
  const m = world.map;
  if (BLOCKS.has(m)) return BLOCKS.get(m);
  const spots = ftueSpots(world), all = gangwar.turfSpots(world);
  let L = all.filter((q) => far(spots, q.x, q.y, GW.ftuePx));
  if (!L.length) L = all;
  const turf = L.filter((q) => isTurf(m, q.x, q.y));
  if (turf.length) L = turf;
  const out = L.map((q) => {
    const at = landNear(m, q.x, q.y), d = m.districtAt(at.x, at.y), n = m.net ? m.nearestNode(at.x, at.y) : null;
    const st = n && n.edges.map((id) => m.net.edges[id]).find((e) => e.name);
    return { key: `${Math.round(at.x / 32)},${Math.round(at.y / 32)}`, x: at.x, y: at.y, district: (d && d.name) || 'town', street: st ? st.name : '' };
  });
  BLOCKS.set(m, out);
  return out;
}
// occurrence k's war: the block (in turn), its holder defending (the Syndicate, the first time), the challenger
export function warPlan(world, k) {
  const B = warBlocks(world);
  if (!B.length) return null;
  const block = B[mod(k, B.length)], holder = (store.kept.gangHolds || {})[block.key] || 'syndicate';
  const club = CLUBS[mod(k, CLUBS.length)].id;
  return { block, sides: [holder, holder === 'syndicate' ? club : 'syndicate'] };
}
const blockName = (b) => (b.street ? `a block of ${b.street} in ${b.district}` : `a block in ${b.district}`);
// a side's rally point: either end of the block, on open ground
function rally(world, r, s) {
  r.rally ||= [0, 1].map((i) => landNear(world.map, r.plan.block.x + (i ? 1 : -1) * GW.radius * 0.6, r.plan.block.y));
  return r.rally[s];
}
function spawnFighter(world, r, s) {
  const id = r.plan.sides[s], at = rally(world, r, s), a = (r.n = (r.n || 0) + 1) * 2.399;
  let x = at.x + Math.cos(a) * 70, y = at.y + Math.sin(a) * 70;
  if (!OPEN(world.map, x, y)) { x = at.x; y = at.y; }
  const club = CLUB_BY_ID[id], e = spawnNpc(world, club ? 'biker' : 'syndicate', x, y, 'gang');
  if (club) e.app = { ...e.app, club: club.i };
  e.npc.keep = true; e.npc.fight = 1; e.npc.warSide = s + 1; e.npc.warKey = r.key;
  e.npc.guard = { x, y, a: s ? Math.PI : 0 };
  e.weapon = ['pistol', 'bat', 'knife', 'pistol'][r.n % 4];
  markBrawl(world, e, world.time + 1e6);   // (criminals while it's on: the police take them in)
  r.members.push(e.id);
  return e;
}
function warEnemies(world, r, e) {
  const s = e.npc.warSide, out = [];
  for (const id of r.members) { const o = world.get(id); if (o && !o.dead && !o.removed && o.npc.warSide !== s) out.push(o); }
  for (const [pid, j] of r.joined) { const q = world.players.get(pid); if (q && q.ped && !q.ped.dead && j.side + 1 !== s && Math.hypot(q.ped.x - r.plan.block.x, q.ped.y - r.plan.block.y) < GW.radius * 1.5) out.push(q.ped); }
  return out;
}
function warDespawn(world, r, all) {
  for (const id of r.members) {
    const e = world.get(id);
    if (!e || e.removed) continue;
    if (all || !inAnyView(world, e.x, e.y, 120)) { if (!e.dead) despawnNpc(world, e); }
    else { e.npc.warSide = 0; e.npc.keep = false; e.npc.guard = null; e.npc.brawl = 0; }   // (in sight: they drift off, the city's again)
  }
  r.members = [];
  r.spawned = false;
}
function warEnd(world, r) {
  if (r.over) return;
  r.over = true;
  const [A, B] = r.plan.sides, b = r.plan.block;
  let w;
  if (r.ever) w = r.score[1] > r.score[0] ? 1 : 0;   // (a draw: the holder keeps it)
  else w = hash2(r.k, 77, 4041) < GW.holdOdds ? 0 : 1;   // (nobody there to see it: the dice, the holder favored)
  r.winner = r.plan.sides[w];
  (store.kept.gangHolds ||= {})[b.key] = r.winner;
  store.touch();
  for (const [pid, j] of r.joined) {
    const p = world.players.get(pid);
    if (p) { p.warSide = 0; p.warKey = null; }
    if (!p || !p.profile) continue;
    const mine = r.plan.sides[j.side], theirs = r.plan.sides[1 - j.side];
    addStanding(p, theirs, GW.standLose);
    const there = p.ped && Math.hypot(p.ped.x - b.x, p.ped.y - b.y) < GW.nearPx;
    if (j.side === w && (there || j.kills > 0)) {
      p.profile.bank += GW.winPay;
      careers.addXp(world, p, 'crime', GW.winXp);
      addStanding(p, mine, GW.standWin);
      careers.note(world, p, 'gangwarWin');
      world.notify(p, `${gangName(mine)} won the block - ${money(GW.winPay)} to your bank, +${GW.winXp} crime XP, and their respect.`, 'good');
    } else world.notify(p, `${gangName(r.winner)} won the gang war in ${b.district}.`, j.side === w ? 'info' : 'bad');
  }
  const loser = r.winner === A ? B : A;
  events.feed(world, { kind: 'gangwar', text: `Gang war over in ${b.district}: ${gangName(r.winner)} ${r.winner === A ? 'held the block against' : 'took the block from'} ${gangName(loser)}`, x: b.x, y: b.y });
  warDespawn(world, r, false);
  evhooks.removeMod(world, 'gangwar');
}
const GANGWAR = {
  start(world, ev, o) {
    const plan = warPlan(world, o.k);
    if (!plan) return null;
    const b = plan.block, r = { plan, score: [0, 0], left: [GW.reserve, GW.reserve], members: [], joined: new Map(), spawned: false, ever: false, k: o.k, key: `gangwar:${o.k}` };
    evhooks.addMod(world, { id: 'gangwar', at: (x, y) => Math.hypot(x - b.x, y - b.y) <= GW.radius * 1.5, copXp: GW.copXp });
    events.add(world, { kind: 'gangwar', x: b.x, y: b.y, until: world.time + ev.durationS, text: `Gang war: ${gangName(plan.sides[0])} and ${gangName(plan.sides[1])} are fighting over ${blockName(b)} - join a side or police it` });
    events.tellNear(world, b.x, b.y, `A gang war broke out nearby - ${gangName(plan.sides[0])} against ${gangName(plan.sides[1])}. Walk up to either end of the block to fight for them, or police it.`, 'warn', GW.nearPx);
    return r;
  },
  step(world, r, ms) {
    if (ms >= r.end) return warEnd(world, r);
    const b = r.plan.block, near = playersNear(world, b.x, b.y, GW.nearPx).length > 0;
    if (!near) { if (r.spawned && !playersNear(world, b.x, b.y, GW.nearPx * 1.3).length) warDespawn(world, r, false); return; }
    if (!r.spawned) {
      r.spawned = true; r.ever = true;
      for (let s = 0; s < 2; s++) for (let i = 0; i < GW.side; i++) spawnFighter(world, r, s);
    }
    // the fallen: a point to the other side, the player who downed them paid
    const alive = [0, 0];
    r.members = r.members.filter((id) => {
      const e = world.get(id);
      if (!e || e.removed) return false;
      if (!e.dead) { alive[e.npc.warSide - 1]++; return true; }
      const other = 2 - e.npc.warSide;   // (the side index that downed them)
      r.score[other]++;
      const by = world.get(e.lastHitBy), q = by && by.player, j = q && r.joined.get(q.pid);
      if (j && j.side === other) {
        j.kills++;
        q.profile.bank += GW.killPay;
        careers.addXp(world, q, 'crime', GW.killXp);
        addStanding(q, r.plan.sides[other], GW.standKill);
        world.notify(q, `+${money(GW.killPay)}, +${GW.killXp} crime XP - ${gangName(r.plan.sides[other])} ${r.score[0]}-${r.score[1]}`, 'good');
      }
      return false;
    });
    if (world.time >= (r.trickleAt ??= world.time + GW.reinforceS)) { r.trickleAt = world.time + GW.reinforceS; for (let s = 0; s < 2; s++) r.left[s] = Math.min(GW.reserve, r.left[s] + 1); }   // (more come all the while)
    for (let s = 0; s < 2; s++) while (alive[s] < GW.side && r.left[s] > 0) { r.left[s]--; alive[s]++; spawnFighter(world, r, s); }
    if ((!alive[0] && !r.left[0]) || (!alive[1] && !r.left[1])) return warEnd(world, r);   // (a side wiped out)
    // the ones not in a fight: at the nearest of the other side
    for (const id of r.members) {
      const e = world.get(id);
      if (!e || e.dead || e.npc.state === 'fight') continue;
      let best = null, bd = GW.radius * 2;
      for (const o of warEnemies(world, r, e)) { const d = Math.hypot(o.x - e.x, o.y - e.y); if (d < bd) { bd = d; best = o; } }
      if (best) startFight(world, e, best, 20);
    }
  },
  stop(world, r) { if (!r.over) warEnd(world, r); evhooks.removeMod(world, 'gangwar'); },
  list(world, run, o, p) {
    const P = run ? run.plan : warPlan(world, o.k);
    if (!P) return { sub: 'No gang turf on this map' };
    const b = P.block, cop = !!(p && p.badge);
    const sub = run
      ? `${gangName(P.sides[0])} ${run.score[0]} - ${run.score[1]} ${gangName(P.sides[1])} in ${b.district}: ${cop ? `police it (arrests pay x${GW.copXp} police XP)` : 'join a side or police it'}`
      : `${gangName(P.sides[1])} come for ${gangName(P.sides[0])}'s block in ${b.district}`;
    return { sub, x: Math.round(b.x), y: Math.round(b.y), pay: cop ? 0 : GW.winPay };
  },
};
// at a side's rally point: fight for them
evhooks.interactions.push((world, p) => {
  const r = live(world, 'gangwar'), ped = p.ped;
  if (!r || !r.spawned || !ped || ped.dead || ped.vehId) return null;
  for (let s = 0; s < 2; s++) {
    const at = rally(world, r, s);
    if (Math.hypot(ped.x - at.x, ped.y - at.y) > GW.joinPx) continue;
    const id = r.plan.sides[s], j = r.joined.get(p.pid);
    if (j) return j.side === s ? { label: `Gang war: you're fighting for ${gangName(id)} (${r.score[s]} - ${r.score[1 - s]})`, passive: true, run: () => {} } : null;
    if (p.badge) return { label: `On duty: police the gang war - arrests here pay x${GW.copXp} police XP`, passive: true, run: () => {} };
    if (p.profile.gang === 'syndicate' && id !== 'syndicate') return { label: `${gangName(id)} won't have a Syndicate member`, passive: true, run: () => {} };
    return { label: `Gang war: fight for ${gangName(id)} (${money(GW.killPay)} a takedown, ${money(GW.winPay)} if they win)`, run: () => joinWar(world, p, r, s) };
  }
  return null;
});
export function joinWar(world, p, r, s) {
  if (r.joined.has(p.pid) || p.badge) return false;
  r.joined.set(p.pid, { side: s, kills: 0 });
  p.warSide = s + 1; p.warKey = r.key;
  world.notify(p, `You're fighting for ${gangName(r.plan.sides[s])}. Take down ${gangName(r.plan.sides[1 - s])} - the side with more takedowns when it's over takes the block.`, 'good');
  p.meDirty = true;
  return true;
}

// ---- district crackdown -------------------------------------------------------------------------------------------------
// The districts it comes to (in turn): the town's, with shops and streets - not the wilds - by name
const DISTS = new WeakMap();
const CITY_KINDS = new Set(['bank', 'convenience', 'gasstation', 'police', 'pawn', 'clothing', 'diner', 'bar', 'grocery', 'pharmacy']);
export function crackdownDistricts(world) {
  const m = world.map;
  if (DISTS.has(m)) return DISTS.get(m);
  const by = new Map();
  for (const q of m.pois) {
    if (!CITY_KINDS.has(q.kind) || wildStyle(m, q.x, q.y)) continue;
    const d = m.districtAt(q.x, q.y);
    if (!d || !d.name || d.tier === 'wild') continue;
    const e = by.get(d.name) || { name: d.name, x: q.x, y: q.y, n: 0, police: false };
    e.n++;
    if (q.kind === 'police' && !e.police) { e.police = true; e.x = q.x; e.y = q.y; }
    by.set(d.name, e);
  }
  const out = [...by.values()].filter((e) => e.n >= 2).sort((a, b) => (a.name < b.name ? -1 : 1));
  DISTS.set(m, out);
  return out;
}
export const crackdownPlan = (world, k) => { const L = crackdownDistricts(world); return L.length ? L[mod(k, L.length)] : null; };
const inDistrict = (m, name, x, y) => { const d = m.districtAt(x, y); return !!d && d.name === name; };
const CRACKDOWN = {
  start(world, ev, o) {
    const D = crackdownPlan(world, o.k);
    if (!D) return null;
    const m = world.map;
    evhooks.addMod(world, { id: 'crackdown', at: (x, y) => inDistrict(m, D.name, x, y), heat: CD.heat, fee: CD.fee, copPay: CD.copPay, copXp: CD.copXp, units: CD.units, unitsMax: CD.extraUnits });
    events.add(world, { kind: 'crackdown', x: D.x, y: D.y, until: world.time + ev.durationS, text: `District crackdown in ${D.name}: twice the police for the hour - criminals pay more there, officers earn more` });
    for (const p of world.players.values()) if (p.ped && inDistrict(m, D.name, p.ped.x, p.ped.y)) world.notify(p, `Police crackdown in ${D.name} for the hour: more officers about, heat builds faster, and bail and fines are up.`, 'warn');
    return { d: D, cops: [], arrests: 0 };
  },
  step(world, r, ms) {
    const m = world.map;
    if (ms >= r.end) {
      r.over = true;
      evhooks.removeMod(world, 'crackdown');
      for (const id of r.cops) { const c = world.get(id); if (c && !c.removed && !c.dead && !inAnyView(world, c.x, c.y, 120)) despawnNpc(world, c); }
      events.feed(world, { kind: 'crackdown', text: `The crackdown in ${r.d.name} is over - ${r.arrests} arrest${r.arrests === 1 ? '' : 's'} by officers on duty`, x: r.d.x, y: r.d.y });
      return;
    }
    r.cops = r.cops.filter((id) => { const c = world.get(id); return c && !c.removed && !c.dead; });
    if (r.cops.length >= CD.beat || world.tick % 40 >= 20) return;   // (a new one every other second at most)
    for (const p of world.players.values()) {
      const ped = p.ped;
      if (!p.conn || !ped || ped.dead || ped.hidden || ped.interior || ped.ug || !inDistrict(m, r.d.name, ped.x, ped.y)) continue;
      for (let t = 0; t < 10; t++) {
        const a = world.rand() * Math.PI * 2, d = CD.beatPx[0] + world.rand() * (CD.beatPx[1] - CD.beatPx[0]);
        const x = ped.x + Math.cos(a) * d, y = ped.y + Math.sin(a) * d;
        if (!OPEN(m, x, y) || !inDistrict(m, r.d.name, x, y) || inAnyView(world, x, y, 100)) continue;
        const c = spawnNpc(world, 'cop', x, y, 'cop');
        c.npc.beat = true; c.npc.crackdown = true; c.weapon = 'pistol';
        r.cops.push(c.id);
        return;
      }
    }
  },
  stop(world, r) { evhooks.removeMod(world, 'crackdown'); r.cops = []; },
  list(world, run, o, p) {
    const D = run ? run.d : crackdownPlan(world, o.k);
    if (!D) return { sub: 'No district today' };
    const cop = !!(p && p.badge);
    return {
      sub: run ? `Twice the police in ${D.name} - ${cop ? `arrests there pay x${CD.copPay}` : 'heat builds faster, bail and fines are up'}` : `The police come down on ${D.name} for an hour`,
      x: Math.round(D.x), y: Math.round(D.y), pay: 0,
    };
  },
};
// arrests by officers on duty in a crackdown's district (the result's line)
careers.onNote((world, p, ev) => {
  if (ev !== 'arrest' || !p.badge || !p.ped) return;
  const r = live(world, 'crackdown');
  if (r && inDistrict(world.map, r.d.name, p.ped.x, p.ped.y)) r.arrests++;
});

// ---- street race night ------------------------------------------------------------------------------------------------
const STREET = (e) => e.lvl === 0 && !e.culdesac && !['alley', 'dirt', 'drive', 'hwy', 'ramp', 'rural'].includes(e.kind);
const RACERS = ['sports', 'bike', 'sports', 'caferacer', 'sports', 'bike'];
const NPC_NAMES = ['Nitro Nico', 'Dee Vasquez', 'Slick Rourke', 'Mona Blaze', 'Kenji Drift', 'Tess "Redline" Ward', 'Benny Two-Lanes', 'Jax Moreau'];
// The courses: road routes runPx long on the city's streets (no alleys, dirt, highways), clear of the new characters'
// places, each with room for the grid on its first street - [{ n0, edges, len, spot, cps: [{x, y}], district, street }]
const COURSES = new WeakMap();
export function raceCourses(world) {
  const m = world.map;
  if (COURSES.has(m)) return COURSES.get(m);
  const out = [], net = m.net;
  if (net) {
    const spots = ftueSpots(world);
    const ok = (e) => STREET(e) && (e._rnOk ??= e.pts.every((q) => far(spots, q.x, q.y, RN.ftuePx) && !wildStyle(m, q.x, q.y)));
    const starts = net.nodes.filter((n) => n.lvl === 0 && !n.island && n.edges.length >= 3 && n.edges.some((id) => ok(net.edges[id]) && net.edges[id].len > 520));
    const step = Math.max(1, Math.floor(starts.length / 10));
    const mid = (RN.runPx[0] + RN.runPx[1]) / 2;
    for (let i = 0; i < starts.length && out.length < 6; i += step) {
      const n0 = starts[i], D = dijkstra(net, n0.id, ok);
      let best = -1, bd = Infinity;
      for (let j = 0; j < net.nodes.length; j++) { const d = D.dist[j]; if (d >= RN.runPx[0] && d <= RN.runPx[1] && Math.abs(d - mid) < bd) { bd = Math.abs(d - mid); best = j; } }
      if (best < 0) continue;
      const edges = [];
      for (let n = best; n !== n0.id; n = D.prev[n]) edges.push(D.via[n]);
      edges.reverse();
      const e0 = net.edges[edges[0]];
      if (e0.len < 520 || out.some((c) => c.n0 === n0.id)) continue;
      // the points along it, the way it's driven; a checkpoint every cpEvery px, the last at the finish
      const pts = [];
      let n = n0.id;
      for (const eid of edges) { const e = net.edges[eid], fw = e.a === n; for (const q of fw ? e.pts : [...e.pts].reverse()) pts.push(q); n = net.nodes[n].links[eid]; }
      const cps = [];
      let acc = 0;
      for (let k = 1; k < pts.length; k++) { acc += Math.hypot(pts[k].x - pts[k - 1].x, pts[k].y - pts[k - 1].y); if (acc >= RN.cpEvery) { cps.push({ x: pts[k].x, y: pts[k].y }); acc = 0; } }
      const fin = net.nodes[best];
      if (cps.length && Math.hypot(cps[cps.length - 1].x - fin.x, cps[cps.length - 1].y - fin.y) < RN.cpEvery / 2) cps.pop();
      cps.push({ x: fin.x, y: fin.y });
      const lp = lanePath(net, e0, n0.id, 0), L = lp[lp.length - 1].s, s = Math.min(L - 60, 440);
      const spot = { e: e0, from: n0.id, s, p: pointAt(lp, s) }, d = m.districtAt(spot.p.x, spot.p.y);
      out.push({ n0: n0.id, fin: best, edges, len: Math.round(D.dist[best]), spot, start: { x: spot.p.x, y: spot.p.y }, cps, district: (d && d.name) || 'town', street: e0.name || '' });
    }
  }
  COURSES.set(m, out);
  return out;
}
export const coursePlan = (world, k, i) => { const C = raceCourses(world); return C.length ? C[mod(k * RN.races + i, C.length)] : null; };
const wheels = (v) => !!v && !v.wreckAt && !v.arena && v.def.kind !== 'boat' && !v.def.pedal && !v.fly && !(v.alt > 0) && v.def.kind !== 'plane' && v.def.kind !== 'heli';
const carOf = (world, p) => { const ped = p.ped; return ped && !ped.dead && ped.vehId && ped.seat === 0 ? world.get(ped.vehId) : null; };
// the shortest distance from q to the segment a-b (a checkpoint passed between two looks)
const segD = (a, b, q) => { const dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy, t = L2 ? Math.max(0, Math.min(1, ((q.x - a.x) * dx + (q.y - a.y) * dy) / L2)) : 0; return Math.hypot(a.x + dx * t - q.x, a.y + dy * t - q.y); };
function racePoints(r, key, name, pid, n) { const e = r.points.get(key) || { name, pid, pts: 0 }; e.pts += n; r.points.set(key, e); }
function raceOpen(world, r, R) {
  R.phase = 'signup';
  const c = R.course;
  const text = `Street race night: race ${R.i + 1} of ${RN.races} - the grid forms on ${c.street || 'the street'} in ${c.district}, off in ${Math.round(RN.signupS / 60 * 10) / 10} min (pot ${money(r.pot)})`;
  events.add(world, { kind: 'racenight', x: c.start.x, y: c.start.y, until: world.time + RN.signupS + RN.maxS, text });
  events.tellNear(world, c.start.x, c.start.y, `${text}. Drive onto the line to race.`, 'info', 3200);
}
function raceGo(world, r, R) {
  const c = R.course;
  for (const pid of [...R.grid]) { const p = world.players.get(pid), v = p && carOf(world, p); if (!wheels(v) || Math.hypot(v.x - c.start.x, v.y - c.start.y) > RN.startR * 1.5) R.grid.delete(pid); }
  if (!R.grid.size) { R.phase = 'done'; events.feed(world, { kind: 'racenight', text: `Street race night, race ${R.i + 1} of ${RN.races}: nobody lined up`, x: c.start.x, y: c.start.y }); return; }
  R.phase = 'running'; R.t0 = world.time;
  for (const pid of R.grid) { const v = carOf(world, world.players.get(pid)); R.racers.set(pid, { cp: 0, done: false, last: { x: v.x, y: v.y } }); }
  r.pot += RN.perEntrant * R.grid.size;
  const n = Math.max(0, RN.grid - R.grid.size), lanes = Math.max(1, Math.min(2, c.spot.e.nl || 1)), goal = streetlife.nodeNear(world, c.cps[c.cps.length - 1].x, c.cps[c.cps.length - 1].y);
  for (let j = 0; j < n; j++) {
    const v = streetlife.driven(world, RACERS[j % RACERS.length], c.spot, j % lanes, 150 + Math.floor(j / lanes) * 130, j % 2 ? 'hustler' : 'casual', { goal, reckless: RN.npcSpeed * (0.92 + 0.02 * (j % 5)) });
    R.npcs.push({ id: v.id, name: NPC_NAMES[j % NPC_NAMES.length], done: false, best: Infinity });
  }
  for (const pid of R.grid) { const p = world.players.get(pid); if (p) { world.notify(p, `GO! Race ${R.i + 1} of ${RN.races} - ${c.cps.length} checkpoints to the finish.`, 'good'); p.meDirty = true; } }
  world.emit(c.start.x, c.start.y, { e: 'raceGo', x: c.start.x, y: c.start.y });
}
function raceFinish(world, r, R) {
  if (R.phase !== 'running') return;
  R.phase = 'done';
  const fin = R.course.cps[R.course.cps.length - 1];
  // the city's racers still out there: placed by how near the finish they got
  const rest = R.npcs.filter((q) => !q.done).map((q) => { const v = world.get(q.id); return { q, d: v && !v.removed ? Math.hypot(v.x - fin.x, v.y - fin.y) : Infinity }; }).sort((a, b) => a.d - b.d);
  for (const { q } of rest) { q.done = true; R.order.push({ key: `npc:${q.name}`, name: q.name, pid: null }); }
  R.order.forEach((o, i) => racePoints(r, o.key, o.name, o.pid, RN.points[i] || 0));
  for (const q of R.npcs) streetlife.letGo(world, world.get(q.id));
  const board = R.order.slice(0, 3).map((o, i) => `${ordinal(i + 1)} ${o.name}`).join(' · ');
  for (const pid of R.racers.keys()) { const p = world.players.get(pid); if (p) { world.notify(p, `Race ${R.i + 1} of ${RN.races}: ${board}`, 'info'); p.meDirty = true; } }
  if (R.order[0]) events.feed(world, { kind: 'racenight', text: `Street race night, race ${R.i + 1} of ${RN.races}: ${R.order[0].name} took it`, x: fin.x, y: fin.y });
}
function nightEnd(world, r) {
  if (r.over) return;
  for (const R of r.races) if (R.phase === 'running') raceFinish(world, r, R);
  r.over = true;
  const S = [...r.points.values()].sort((a, b) => b.pts - a.pts);
  if (!r.races.some((R) => R.racers.size)) { events.feed(world, { kind: 'racenight', text: 'Street race night is over - nobody raced tonight' }); return; }
  S.slice(0, RN.share.length).forEach((e, i) => {
    const p = e.pid && world.players.get(e.pid), prize = Math.round(r.pot * RN.share[i] / 10) * 10;
    if (!p) return;
    p.profile.bank += prize; store.touch(); p.meDirty = true;
    world.notify(p, `Street race night: ${ordinal(i + 1)} overall with ${e.pts} points - ${money(prize)} of the pot to your bank.`, 'good');
  });
  events.feed(world, { kind: 'racenight', text: `Street race night is over: ${S[0].name} took the night's ${money(r.pot)} pot with ${S[0].pts} points` });
}
const RACENIGHT = {
  start(world, ev, o) {
    if (!raceCourses(world).length) return null;
    const races = [];
    for (let i = 0; i < RN.races; i++) races.push({ i, course: coursePlan(world, o.k, i), opens: o.start + i * RN.gapS * 1000, phase: 'wait', grid: new Set(), racers: new Map(), npcs: [], order: [] });
    const c = races[0].course;
    events.feed(world, { kind: 'racenight', text: `Street race night: ${RN.races} street races tonight, a ${money(RN.pot)} pot that grows with every racer - the first grid forms in ${c.district}`, x: c.start.x, y: c.start.y });
    return { races, pot: RN.pot, points: new Map() };
  },
  step(world, r, ms) {
    for (const R of r.races) {
      if (R.phase === 'wait' && ms >= R.opens) raceOpen(world, r, R);
      if (R.phase === 'signup') {
        const c = R.course;
        for (const p of world.players.values()) {
          const v = carOf(world, p);
          if (!wheels(v) || R.grid.has(p.pid) || (R.quit && R.quit.has(p.pid))) continue;   // (pulled out with the phone's Quit: out this race)
          if (Math.hypot(v.x - c.start.x, v.y - c.start.y) < RN.startR) { R.grid.add(p.pid); world.notify(p, `You're on the grid: race ${R.i + 1} of ${RN.races}, off in ${Math.max(0, Math.ceil((R.opens + RN.signupS * 1000 - ms) / 1000))} s. Stay on the line.`, 'good'); p.meDirty = true; }
        }
        if (ms >= R.opens + RN.signupS * 1000) raceGo(world, r, R);
      }
      if (R.phase === 'running' && world.time - R.t0 > RN.maxS) raceFinish(world, r, R);
    }
    if (ms >= r.end || r.races.every((R) => R.phase === 'done')) nightEnd(world, r);
  },
  // every few ticks while a race is running: the checkpoints, the finish
  fast(world, r) {
    for (const R of r.races) {
      if (R.phase !== 'running') continue;
      const c = R.course, fin = c.cps[c.cps.length - 1];
      let out = 0;
      for (const [pid, q] of R.racers) {
        if (q.done) { out++; continue; }
        const p = world.players.get(pid), v = p && carOf(world, p);
        const cp = c.cps[q.cp];
        if (!wheels(v) || Math.hypot(v.x - cp.x, v.y - cp.y) > RN.lostPx) { q.done = true; q.forfeit = true; out++; if (p) { world.notify(p, `You dropped out of race ${R.i + 1}.`, 'bad'); p.meDirty = true; } continue; }
        const now = { x: v.x, y: v.y };
        while (q.cp < c.cps.length && segD(q.last, now, c.cps[q.cp]) < RN.cpR) {
          const at = c.cps[q.cp++];
          world.emit(at.x, at.y, { e: 'checkpoint', x: at.x, y: at.y });
          p.meDirty = true;
        }
        q.last = now;
        if (q.cp >= c.cps.length) {
          q.done = true; out++;
          R.order.push({ key: `p:${pid}`, name: p.name, pid });
          const place = R.order.length;
          skills.gain(world, p, 'race');
          careers.note(world, p, place === 1 ? 'raceWin' : 'race');
          if (place === 1) { p.profile.raceWins = (p.profile.raceWins || 0) + 1; store.touch(); }
          world.notify(p, `Finished ${ordinal(place)} in ${(world.time - R.t0).toFixed(1)}s - +${RN.points[place - 1] || 0} points.`, place === 1 ? 'good' : 'info');
        }
      }
      for (const q of R.npcs) {
        if (q.done) continue;
        const v = world.get(q.id), drv = v && v.seats[0] ? world.get(v.seats[0]) : null;
        if (!v || v.removed || v.wreckAt || !drv || drv.dead) { q.done = true; q.dnf = true; continue; }
        const d = Math.hypot(v.x - fin.x, v.y - fin.y);
        q.best = Math.min(q.best, d);
        if (d < RN.cpR + 80 || (q.best < RN.cpR * 2 && d > q.best + 120)) { q.done = true; R.order.push({ key: `npc:${q.name}`, name: q.name, pid: null }); }
      }
      if (out >= R.racers.size) raceFinish(world, r, R);
    }
  },
  stop(world, r) { if (!r.over) nightEnd(world, r); },
  list(world, run, o, p, ms) {
    if (!run) { const c = coursePlan(world, o.k, 0); return c ? { sub: `${RN.races} street races, a ${money(RN.pot)} pot that grows with every racer - from ${c.district}`, x: Math.round(c.start.x), y: Math.round(c.start.y), pay: RN.pot } : { sub: 'No streets for it on this map' }; }
    const R = run.races.find((q) => q.phase !== 'done') || run.races[run.races.length - 1], c = R.course;
    const sub = R.phase === 'running' ? `Race ${R.i + 1} of ${RN.races} under way - pot ${money(run.pot)}`
      : R.phase === 'signup' ? `Race ${R.i + 1} of ${RN.races}: drive onto the line in ${c.district} - off in ${Math.max(0, Math.ceil((R.opens + RN.signupS * 1000 - ms) / 1000))} s (pot ${money(run.pot)})`
        : `Race ${R.i + 1} of ${RN.races}: the grid forms in ${c.district} in ${Math.max(1, Math.ceil((R.opens - ms) / 60000))} min (pot ${money(run.pot)})`;
    return { sub, x: Math.round(c.start.x), y: Math.round(c.start.y), pay: Math.round(run.pot * RN.share[0]) };
  },
};
// the HUD's tracker: the next checkpoint (or the line, on the grid)
evhooks.on('target', (world, p) => {
  const r = live(world, 'racenight');
  if (!r) return null;
  for (const R of r.races) {
    if (R.phase === 'signup' && R.grid.has(p.pid)) return { text: `Street race ${R.i + 1} of ${RN.races}: stay on the line`, x: Math.round(R.course.start.x), y: Math.round(R.course.start.y), stage: 'race' };
    const q = R.phase === 'running' && R.racers.get(p.pid);
    if (q && !q.done) { const cp = R.course.cps[q.cp]; return { text: `Street race ${R.i + 1} of ${RN.races}: checkpoint ${q.cp + 1}/${R.course.cps.length}`, x: Math.round(cp.x), y: Math.round(cp.y), stage: 'race' }; }
  }
  return null;
});

// the phone's Quit (activityquit.js): off the grid, or out of the race under way - a forfeit, as dropping out is
evhooks.on('quit', (world, p) => {
  const r = live(world, 'racenight');
  if (!r) return null;
  for (const R of r.races) {
    const q = R.phase === 'running' && R.racers.get(p.pid);
    if ((R.phase === 'signup' && R.grid.has(p.pid)) || (q && !q.done)) {
      return { k: 'streetrace', n: 'the street race', end() {
        if (q) { q.done = true; q.forfeit = true; } else { R.grid.delete(p.pid); (R.quit ||= new Set()).add(p.pid); }
        p.meDirty = true;
        return `You pulled out of street race ${R.i + 1}.`;
      } };
    }
  }
  return null;
});

// ---- the car soccer cup -----------------------------------------------------------------------------------------------
const cupOf = (r, pid) => { let e = r.runs.get(pid); if (!e) r.runs.set(pid, (e = { won: 0, out: false, champ: false })); return e; };
const SOCCERCUP = {
  start(world, ev) {
    const a = (world.map.arenas || [])[0];
    if (!a) return null;
    events.add(world, { kind: 'soccercup', x: a.gate.x, y: a.gate.y, until: world.time + ev.durationS, text: `The car soccer cup is on at ${a.name}: win ${SC.rounds} in a row to lift it (${money(SC.prize)}) - join at the gate` });
    events.tellNear(world, a.gate.x, a.gate.y, `The car soccer cup is on at ${a.name} - join at the gate. The city's drivers fill the sides.`, 'info', 4000);
    return { a, runs: new Map(), champs: [] };
  },
  step(world, r, ms) {
    if (ms < r.end) return;
    r.over = true;
    events.feed(world, { kind: 'soccercup', text: r.champs.length ? `The car soccer cup at ${r.a.name} is over - won by ${r.champs.join(', ')}` : `The car soccer cup at ${r.a.name} is over - nobody lifted it this week`, x: r.a.gate.x, y: r.a.gate.y });
  },
  list(world, run, o, p) {
    const a = run ? run.a : (world.map.arenas || [])[0];
    if (!a) return { sub: 'No arena on this map' };
    const e = run && p ? run.runs.get(p.pid) : null;
    const sub = !run ? `A short bracket at ${a.name}: win ${SC.rounds} in a row to lift the cup`
      : e && e.champ ? 'You won the cup!' : e && e.out ? 'You\'re out of the cup this week'
        : `On at ${a.name}: your round ${(e ? e.won : 0) + 1} of ${SC.rounds} - join at the gate`;
    return { sub, x: Math.round(a.gate.x), y: Math.round(a.gate.y), pay: SC.prize };
  },
};
evhooks.on('soccerTag', (world, p) => {
  const r = live(world, 'soccercup');
  if (!r) return null;
  const e = r.runs.get(p.pid);
  if (e && e.champ) return 'Car soccer (you\'ve won the cup)';
  if (e && e.out) return 'Car soccer (out of the cup - a friendly)';
  const n = e ? e.won : 0;
  return `The car soccer cup, ${n + 1 === SC.rounds ? 'the final' : `round ${n + 1} of ${SC.rounds}`}`;
});
evhooks.on('soccerResult', (world, a, st, w) => {
  const r = live(world, 'soccercup');
  if (!r || r.a !== a) return;
  for (const s of st.slots) {
    const p = s.pid && world.players.get(s.pid);
    if (!p) continue;
    const e = cupOf(r, p.pid);
    if (e.out || e.champ) continue;
    if (w < 0) { world.notify(p, 'The cup: a tie - play the round again.', 'info'); continue; }
    if (s.team !== w) { e.out = true; world.notify(p, 'Knocked out of the car soccer cup - better luck next week.', 'bad'); continue; }
    e.won++;
    p.profile.bank += SC.roundPay;
    if (e.won < SC.rounds) { world.notify(p, `Through to ${e.won + 1 === SC.rounds ? 'the final' : `round ${e.won + 1}`} of the cup - +${money(SC.roundPay)}. Join again at the gate.`, 'good'); store.touch(); continue; }
    e.champ = true;
    p.profile.bank += SC.prize;
    const c = careers.mainCareer(p);
    careers.addXp(world, p, c, SC.xp);   // (toward the week's goal: the weekly counts its career's XP - goals.js)
    careers.note(world, p, 'soccerCup');
    r.champs.push(p.name);
    world.notify(p, `You won the car soccer cup! +${money(SC.roundPay + SC.prize)} to your bank, +${SC.xp} ${CAREERS[c].name.toLowerCase()} XP.`, 'good');
    events.feed(world, { kind: 'soccercup', text: `${p.name} lifted the car soccer cup at ${a.name}`, x: a.gate.x, y: a.gate.y });
    store.touch(); p.meDirty = true;
  }
});

export const RUNNERS = { gangwar: GANGWAR, crackdown: CRACKDOWN, racenight: RACENIGHT, soccercup: SOCCERCUP };
export const ICONS = { gangwar: 'gang', crackdown: 'police', racenight: 'car', soccercup: 'star' };
