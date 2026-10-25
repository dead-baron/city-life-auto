// The cinematic mode's follow scenes (the owner, 2026-10-24: "automatic scenes that has the camera follow NPCs like in
// cop chases or street races or fishing or surfing (or every activity ... anything that can be automated with NPCs)").
// The page asks for a kind (shared/cinekinds.js) or the tour of them all; the server picks who the camera follows - always
// an NPC, an animal, a train or an aircraft, never another player - near you first or anywhere in the world, and tells
// the page ({ t: 'cinef' }); the page only follows the transform it's sent (client/director.js).
//   - The view goes with them: while you follow someone, what you're sent is round them (view.js focusOf), and the
//     world comes alive round them as round a player (view.js cineEyes: the traffic, the people, the animals, the
//     activities' groups, the boats) - your character stays where you left it.
//   - When their activity ends (the race is over, the angler packs up, the plane has landed) the camera moves on: to
//     someone else in the same scene first (the next racer), else another of the kind; the tour moves on to the next
//     kind (and every CINE_TOUR_S anyway).
//   - Nobody doing it right now: in dev mode (it changes everyone's world, as the debug menu's commands do) one is
//     started where that's cheap - a street race, a chase or an armored truck's run kicked off as the debug menu does,
//     a gang shootout, a street fight, a purse snatch, a plane on the nearest runway, an activity's spot filled, a street
//     character - or one of the actors here: a combine harvesting a field, a rider out on a horse, a surfer at the
//     nearest break, who do it only for the camera (and go once nobody's watching). Otherwise the kind is skipped.
// p.cineF = { k (the kind asked for, or 'tour'), cur (the kind being shown), tour, ti (the tour's place), near, sub: { id,
// tag (the scene: a race, an activity's group...), at }, fid (who the camera's on: the subject's vehicle when they're in
// one), eye: { x, y, player } (where they are), kindAt, tried: { kind: when a start was last tried }, seq }
import { K, WEATHER } from '../../shared/constants.js';
import { WATER_T } from '../../shared/mapcore.js';
import { VEHICLES } from '../../shared/vehicles.js';
import { SPECIES } from '../../shared/fauna.js';
import { FARM } from '../../shared/rules.js';
import { SURF, wavesAt, onBreak, breakPt, broken, crestD, gapAt } from '../../shared/surf.js';
import { CINE_KIND, CINE_TOUR, CINE_TOUR_S, CINE_SUBJECT_S } from '../../shared/cinekinds.js';
import { inAnyView } from '../view.js';
import { spawnNpc, despawnNpc, snatchEvent } from './npc.js';
import { planRoute, driveToward } from './traffic.js';
import { wildStyle, animals } from './wildlife.js';
import * as streetlife from './streetlife.js';
import * as gangwar from './gangwar.js';
import * as happenings from './happenings.js';
import * as airtraffic from './airtraffic.js';
import * as activities from './activities.js';
import * as personas from './personas.js';
import * as farming from './farming.js';
import * as surf from './surf.js';

const NEAR_PX = 9000;        // "near me": within this of you first
const RETRY_S = 3;           // nobody doing the kind asked for: looked for again this often
const START_GAP_S = 60;      // a kind started for the camera at most this often (each viewer)
const ACTOR_S = 300;
const STUCK_S = 8;           // an actor's vehicle no nearer where it's going for this long: it's stuck         // the camera's own actors keep at it this long at most
const TOUR_TRIES = 6;        // the tour: kinds looked at in one go before it waits for the next look
const CUT_PX = 900;          // a hand-off further than this is a cut (through black on the page), nearer a glide

// ---- who's doing what --------------------------------------------------------------------------------------------
const alive = (e) => !!(e && !e.removed && !e.dead && !e.wreckAt);
const npcPed = (e) => alive(e) && e.kind === K.PED && !e.player && !!(e.npc || e.wild);
const speed = (e) => Math.hypot(e.vx || 0, e.vy || 0);
const driverOf = (world, v) => (v.seats && v.seats[0] ? world.get(v.seats[0]) : null);
const npcAtWheel = (world, v) => { const d = driverOf(world, v); return !!(d && !d.dead && d.npc && !d.player); };
const anyPlayerIn = (world, v) => !!(v.seats && v.seats.some((s) => s && world.get(s)?.player));
const vehs = (world) => { const out = []; for (const e of world.entities.values()) if (e.kind === K.VEH && alive(e) && !anyPlayerIn(world, e)) out.push(e); return out; };
const peds = (world) => { const out = []; for (const e of world.entities.values()) if (npcPed(e)) out.push(e); return out; };
const ids = (world, list) => (list || []).map((id) => world.get(id)).filter(alive);
// the people of an activity's groups (activities.js) of these kinds
function acts(world, ks) {
  const out = [];
  for (const g of (world.acts || new Map()).values()) if (ks.includes(g.k)) for (const e of ids(world, g.ids)) if (npcPed(e)) out.push({ e, tag: `act${g.id}` });
  return out;
}
const actors = (world, k) => (world.cineActors || []).filter((A) => A.k === k && !A.done).map((A) => ({ e: world.get(A.main), tag: `actor${A.id}` })).filter((c) => alive(c.e));
const evs = (world, k) => (world.happenings || []).filter((e) => e.kind === k && world.time <= e.until);
const street = (world, sl) => streetlife.live(world).filter((ev) => ev.sl === sl);

// (the street characters who'd only sit or lie there - and the skaters, theirs is the skate kind)
const STILL = new Set(['skater', 'blader', 'bench', 'sleeper', 'leaner']);
// each kind's subjects now: [{ e, tag }]
const CANDS = {
  chase(world) {
    const out = [];
    for (const ev of street(world, 'chase')) { const car = world.get(ev.car); if (alive(car) && !anyPlayerIn(world, car)) out.push({ e: car, tag: `ev${ev.id}` }); }
    for (const v of ids(world, [...(world.police || [])])) {
      const ai = v.ai;
      if (!ai || ai.kind !== 'police') continue;
      for (const tid of [ai.vehTarget, ai.npcTarget, ...(ai.npcTargets || [])]) {
        const t = tid && world.get(tid);
        if (alive(t) && !t.player && !(t.kind === K.VEH && anyPlayerIn(world, t))) out.push({ e: t, tag: `pc${t.id}` });
      }
    }
    return out;
  },
  race: (world) => street(world, 'race').flatMap((ev) => ev.racers.filter((id) => !ev.done.includes(id)).map((id) => world.get(id)).filter((v) => alive(v) && npcAtWheel(world, v)).map((e) => ({ e, tag: `ev${ev.id}` }))),
  armored: (world) => street(world, 'armored').map((ev) => ({ e: world.get(ev.van), tag: `ev${ev.id}` })).filter((c) => alive(c.e) && !anyPlayerIn(world, c.e)),
  shootout: (world) => (world.shootouts || []).flatMap((s) => ids(world, s.peds).filter(npcPed).map((e) => ({ e, tag: `so${s.ev}` }))),
  fight: (world) => evs(world, 'fight').flatMap((ev) => ids(world, [ev.a, ev.b]).filter(npcPed).map((e) => ({ e, tag: `ev${ev.id}` }))),
  mugging: (world) => [...evs(world, 'snatch').map((ev) => ({ e: world.get(ev.thief), tag: `ev${ev.id}` })).filter((c) => npcPed(c.e) && c.e.npc.hasPurse), ...peds(world).filter((e) => e.npc && e.npc.state === 'mug').map((e) => ({ e, tag: `mug${e.id}` }))],
  bikers: (world) => vehs(world).filter((v) => v.ai && (v.ai.kind === 'club' || v.ai.kind === 'thief') && speed(v) > 40 && npcAtWheel(world, v)).map((e) => ({ e, tag: e.ai.kind })),
  patrol(world) {
    const out = [];
    for (const v of ids(world, [...(world.police || [])])) { const ai = v.ai; if (ai && ai.kind === 'police' && !ai.target && !ai.vehTarget && !ai.npcTarget && !ai.npcTargets && speed(v) > 60 && npcAtWheel(world, v) && v.def.kind !== 'air') out.push({ e: v, tag: `v${v.id}` }); }
    for (const e of peds(world)) if (e.npc && e.npc.role === 'cop' && e.npc.beat && !e.vehId) out.push({ e, tag: `p${e.id}` });
    return out;
  },
  policeair: (world) => [...(world.policeAir || new Map()).values()].map((u) => ({ e: world.get(u.vid), tag: `pa${u.vid}` })).filter((c) => alive(c.e) && !anyPlayerIn(world, c.e)),
  ambulance: (world) => ids(world, [...(world.ambulances || [])]).filter((v) => v.ai && v.ai.kind === 'ems').map((e) => ({ e, tag: `v${e.id}` })),
  traffic: (world) => vehs(world).filter((v) => v.ai && v.ai.kind === 'traffic' && !v.ai.route && speed(v) > 120 && npcAtWheel(world, v) && !(world.taxis && world.taxis.has(v.id))).map((e) => ({ e, tag: `v${e.id}` })),
  bus: (world) => ids(world, [...(world.buses || new Map()).values()].flat()).filter((v) => npcAtWheel(world, v)).map((e) => ({ e, tag: `v${e.id}` })),
  taxi: (world) => ids(world, [...(world.taxis || [])]).filter((v) => npcAtWheel(world, v) && speed(v) > 40).map((e) => ({ e, tag: `v${e.id}` })),
  train(world) { const out = []; for (const e of world.entities.values()) if (e.kind === K.TRAIN && !e.sub && e.car === 0 && !e.removed) out.push({ e, tag: `tr${e.train}` }); return out; },
  ferry: (world) => (world.ferries || []).map((f) => ({ e: world.get(f.v), tag: `fe${f.route}` })).filter((c) => alive(c.e)),
  boat: (world) => vehs(world).filter((v) => v.ai && (v.ai.kind === 'boater' || v.ai.kind === 'pboat' || v.ai.kind === 'fisher') && npcAtWheel(world, v)).map((e) => ({ e, tag: `v${e.id}` })),
  plane: (world) => flights(world, 'plane'),
  newsheli: (world) => flights(world, 'news'),
  combine: (world) => [...actors(world, 'combine'), ...vehs(world).filter((v) => v.model === 'combine' && !v.cineActor && npcAtWheel(world, v) && speed(v) > 20).map((e) => ({ e, tag: `v${e.id}` }))],
  horse: (world) => [...actors(world, 'horse'), ...vehs(world).filter((v) => v.def.horse && !v.cineActor && npcAtWheel(world, v) && speed(v) > 30).map((e) => ({ e, tag: `v${e.id}` }))],
  wildlife: (world) => animals(world).filter((e) => alive(e) && e.wild && e.wild.kind !== 'shark' && !e.pet).map((e) => ({ e, tag: `w${e.wild.herd || e.id}` })),
  shark: (world) => animals(world).filter((e) => alive(e) && e.wild && e.wild.kind === 'shark').map((e) => ({ e, tag: `w${e.id}` })),
  hunter: (world) => acts(world, ['hunter']),
  wilds: (world) => acts(world, ['trail', 'ranger', 'birders', 'kayakers', 'climbers', 'foragers', 'campcook', 'miners', 'pickers']),
  fishing: (world) => [...acts(world, ['anglers', 'holds']), ...vehs(world).filter((v) => v.ai && v.ai.kind === 'fisher' && npcAtWheel(world, v)).map((e) => ({ e, tag: `v${e.id}` }))],
  surf: (world) => [...actors(world, 'surf'), ...peds(world).filter((e) => e.surf && !e.cineActor).map((e) => ({ e, tag: `p${e.id}` }))],
  skate: (world) => [...acts(world, ['skaters']), ...peds(world).filter((e) => e.npc && (e.npc.persona === 'skater' || e.npc.persona === 'blader')).map((e) => ({ e, tag: `p${e.id}` }))],
  hoops: (world) => acts(world, ['hoops']),
  pool: (world) => acts(world, ['pool']),
  dance: (world) => [...acts(world, ['party']), ...peds(world).filter((e) => e.npc && e.gt === 'dance').map((e) => ({ e, tag: `d${Math.floor(e.x / 600)},${Math.floor(e.y / 600)}` }))],
  chess: (world) => acts(world, ['chess']),
  picnic: (world) => acts(world, ['picnic']),
  painter: (world) => acts(world, ['painter']),
  diners: (world) => acts(world, ['diners']),
  street: (world) => acts(world, ['chat', 'stoop', 'dice', 'carwash', 'roadcrew']),
  characters: (world) => peds(world).filter((e) => e.npc && e.npc.persona && !STILL.has(e.npc.persona)).map((e) => ({ e, tag: `p${e.id}` })),
};
function flights(world, kind) {
  const out = [];
  for (const f of ((world.airTraffic && world.airTraffic.flights) || new Map()).values()) { const v = world.get(f.vid); if (f.kind === kind && alive(v) && !anyPlayerIn(world, v)) out.push({ e: v, tag: `fl${f.vid}` }); }
  return out;
}
export const kindsFound = () => Object.keys(CANDS);
export function candidates(world, k) { const f = CANDS[k]; return f ? f(world).filter((c) => c.e && !c.e.player) : []; }

// what the camera's on: the subject, or the vehicle they're in
function followOf(world, e) { if (e.kind === K.PED && e.vehId) { const v = world.get(e.vehId); if (v && !v.removed) return v; } return e; }
const an = (w) => `${/^[aeiou]/i.test(w) ? 'an' : 'a'} ${w}`;
function nameOf(world, e) {
  if (e.kind === K.TRAIN) return 'the train';
  if (e.kind === K.VEH) return an((VEHICLES[e.model] || e.def || {}).name || 'vehicle');
  if (e.wild) return an(((SPECIES[e.wild.kind] || {}).name || 'animal').toLowerCase());
  if (e.npc && e.npc.persona) return an(e.npc.persona);
  return e.archetype ? an(e.archetype) : 'someone';
}

// ---- starting one (dev mode: it changes everyone's world) --------------------------------------------------------------
function nearestSpot(world, p, ks) {
  const at = p.ped, A = world.acts || new Map();
  const rain = world.weather === WEATHER.RAIN;   // (what the rain sends home isn't started in it: activities.js RAIN_OFF)
  const list = activities.spotsOf(world.map).list.filter((s) => ks.includes(s.k) && !A.has(s.id) && !(rain && activities.RAIN_OFF.has(s.k)));
  list.sort((a, b) => Math.hypot(a.x - at.x, a.y - at.y) - Math.hypot(b.x - at.x, b.y - at.y));
  for (const s of list.slice(0, 8)) if (activities.fill(world, s, { seen: true })) return true;
  return false;
}
const STARTS = {
  race: (world, p) => !!streetlife.startNow(world, 'race', p),
  chase: (world, p) => !!streetlife.startNow(world, 'chase', p),
  armored: (world, p) => !!streetlife.startNow(world, 'armored', p),
  shootout: (world, p) => !!gangwar.startShootout(world, p),
  fight: (world, p) => !!happenings.startNow(world, 'fight', p, {}),
  mugging: (world, p) => { snatchEvent(world, p); return true; },
  plane(world, p) {
    const A = (world.airTraffic ||= { flights: new Map(), nextAt: world.time + 60, newsAt: 0 });
    let best = null, bd = Infinity;
    for (const r of airtraffic.runways(world.map)) { const d = Math.hypot(r.x - p.ped.x, r.y - p.ped.y); if (d < bd) { bd = d; best = r; } }
    p.cineF.planeMode = p.cineF.planeMode === 'land' ? 'out' : 'land';
    return !!(best && airtraffic.planeFlight(world, A, { rw: best, mode: p.cineF.planeMode, force: true, seen: true }));
  },
  combine: (world, p) => !!startCombine(world, p),
  horse: (world, p) => !!startHorse(world, p),
  surf: (world, p) => !!startSurfer(world, p),
  hunter: (world, p) => nearestSpot(world, p, ['hunter']),
  wilds: (world, p) => nearestSpot(world, p, ['trail', 'ranger', 'birders', 'kayakers', 'climbers', 'foragers', 'campcook']),
  fishing: (world, p) => nearestSpot(world, p, ['anglers', 'holds']),
  skate: (world, p) => nearestSpot(world, p, ['skaters']),
  hoops: (world, p) => nearestSpot(world, p, ['hoops']),
  pool: (world, p) => nearestSpot(world, p, ['pool']),
  dance: (world, p) => nearestSpot(world, p, ['party']),
  chess: (world, p) => nearestSpot(world, p, ['chess']),
  picnic: (world, p) => nearestSpot(world, p, ['picnic']),
  painter: (world, p) => nearestSpot(world, p, ['painter']),
  diners: (world, p) => nearestSpot(world, p, ['diners']),
  street: (world, p) => nearestSpot(world, p, ['chat', 'stoop', 'dice', 'roadcrew']),
  characters(world, p) {
    const keys = ['busker', 'jogger', 'dogs', 'dancer', 'tourists', 'glam', 'swim', 'punk'].filter((k) => personas.PERSONAS[k]);
    for (let i = 0; i < keys.length; i++) {
      const k = keys[(p.cineF.seq + i) % keys.length], a = (p.ped.a || 0) + i * 0.8;
      if (personas.spawnPersona(world, spawnNpc, k, p.ped.x + Math.cos(a) * 90, p.ped.y + Math.sin(a) * 90)) return true;
    }
    return false;
  },
};
export const kindsStartable = () => Object.keys(STARTS);
function tryStart(world, p, k) {
  const C = p.cineF, f = STARTS[k];
  if (!C.dev || !f || !p.ped || p.ped.dead) return false;
  if (world.time - (C.tried[k] ?? -1e9) < START_GAP_S) return false;
  C.tried[k] = world.time;
  try { return !!f(world, p); } catch (e) { world.reportError('cinefollow start', e); return false; }
}

// ---- the camera's own actors: someone doing it for the camera ---------------------------------------------------------
// world.cineActors: [{ id, k, main (the entity the camera follows), ids (everything of theirs), until, done, ... }]
function addActor(world, A) {
  world.cineActorSeq = (world.cineActorSeq || 0) + 1;
  A.id = world.cineActorSeq; A.until = world.time + ACTOR_S; A.done = false;
  for (const id of A.ids) { const e = world.get(id); if (e) e.cineActor = A.id; }
  (world.cineActors ||= []).push(A);
  return A;
}
function seat(world, v, who) {
  const d = spawnNpc(world, who, v.x, v.y, 'driver');
  d.vehId = v.id; d.seat = 0; v.seats[0] = d.id; d.lz = 0; d.npc.keep = true;
  v.lastDriver = d.id;
  return d;
}
function vehicleActor(world, k, model, x, y, a, who, extra = {}, opts = {}) {
  const v = world.spawnVehicle(model, x, y, a, opts);
  v.despawnable = false; v.npcOwned = true; v.ai = { kind: 'cine' }; v.lz = 0;
  const d = seat(world, v, who);
  return addActor(world, { k, main: v.id, ids: [v.id, d.id], ...extra });
}

// a combine harvesting a field: two ripe rows a pass (its header's width), down and back, the stubble behind it - over
// the stretch of the rows that's crop (World v3's fields are cut by a wandering edge: their rects hold trees and
// tracks too - farming.js row.ok, a bit a segment), the field nearest you with a long enough one
const CROP_SEGS = 5;   // at least this many of a row's FARM.segs in a row, crop in every row the combine takes
function cropRun(F, r0, rows) {
  let ok = (1 << FARM.segs) - 1;
  for (let r = r0; r < r0 + rows; r++) ok &= F.rows[r].ok;
  let best = null;
  for (let k = 0; k < FARM.segs; k++) {
    if (!(ok & (1 << k))) continue;
    let e = k;
    while (e + 1 < FARM.segs && ok & (1 << (e + 1))) e++;
    if (!best || e - k > best.k1 - best.k0) best = { k0: k, k1: e };
    k = e;
  }
  return best && best.k1 - best.k0 + 1 >= CROP_SEGS ? best : null;
}
export function combinePlan(world, x, y) {
  const fields = farming.fieldsOf(world).filter((fd) => fd.n >= 2 && fd.len >= 400);
  fields.sort((a, b) => Math.hypot(a.f.x + a.f.w / 2 - x, a.f.y + a.f.h / 2 - y) - Math.hypot(b.f.x + b.f.w / 2 - x, b.f.y + b.f.h / 2 - y));
  for (const F of fields) {
    for (let passes = Math.min(3, Math.floor(F.n / 2)); passes >= 1; passes--) {
      let pick = null;
      for (let r0 = 0; r0 + passes * 2 <= F.n; r0++) { const run = cropRun(F, r0, passes * 2); if (run && (!pick || run.k1 - run.k0 > pick.run.k1 - pick.run.k0)) pick = { r0, run }; }
      if (pick) return { F, passes, ...pick };
    }
  }
  return null;
}
function startCombine(world, p) {
  const P = combinePlan(world, p.ped.x, p.ped.y);
  if (!P) return null;
  const { F, passes, r0, run } = P, seg = F.len / FARM.segs, head = VEHICLES.combine.L / 2 - 12;   // (its header: that far ahead of its middle)
  for (let r = r0; r < r0 + passes * 2; r++) { const row = F.rows[r]; row.s = farming.ROW.RIPE; row.g = 0; row.m = 0; }
  F.dirty = true;
  const lo = run.k0 * seg, hi = (run.k1 + 1) * seg;
  const f = F.f, side = (r) => (F.v ? f.x : f.y) + (r + 1) * FARM.rowW, pt = (lat, s) => (F.v ? { x: lat, y: f.y + s } : { x: f.x + s, y: lat });
  const route = [];
  for (let i = 0; i < passes; i++) {
    const lat = side(r0 + i * 2), fwd = i % 2 === 0, s0 = fwd ? lo + 10 : hi - 10, s1 = fwd ? hi - head - 8 : lo + head + 8;
    route.push({ ...pt(lat, s0), work: false }, { ...pt(lat, s1), work: true });
    if (i < passes - 1) route.push({ ...pt(lat + FARM.rowW, fwd ? Math.min(F.len - 8, s1 + 70) : Math.max(8, s1 - 70)), work: false });
  }
  const a0 = Math.atan2(route[1].y - route[0].y, route[1].x - route[0].x);
  return vehicleActor(world, 'combine', 'combine', route[0].x, route[0].y, a0, 'farmer', { route, wi: 1 }, { paint: 0 });
}
// a rider out on a horse along the country's dirt roads and tracks, a few kilometres
function startHorse(world, p) {
  const m = world.map, net = m.net, at = p.ped;
  if (!net) return null;
  const wild = net.nodes.filter((n) => n && n.lvl === 0 && wildStyle(m, n.x, n.y));
  if (wild.length < 2) return null;
  wild.sort((a, b) => Math.hypot(a.x - at.x, a.y - at.y) - Math.hypot(b.x - at.x, b.y - at.y));
  for (const a of wild.slice(0, 6)) {
    const far = wild.filter((n) => { const d = Math.hypot(n.x - a.x, n.y - a.y); return d > 1800 && d < 4500; });
    if (!far.length) continue;
    const b = far[(p.cineF.seq * 7) % far.length], route = planRoute(world, a.x, a.y, b.x, b.y);
    if (route.length < 4) continue;
    const coat = (p.cineF.seq * 3) % 6;
    return vehicleActor(world, 'horse', 'horse', a.x, a.y, Math.atan2(route[1].y - a.y, route[1].x - a.x), 'farmer', { route, wi: 0 }, { variant: coat, npcOwned: true });
  }
  return null;
}
// a surfer at the break nearest you: out at the line-up, up on a wave as it comes, along its face ahead of the break,
// then paddling back out
function startSurfer(world, p) {
  const at = p.ped, list = surf.breaksOf(world).list;
  if (!list.length) return null;
  const B = list.slice().sort((a, b) => Math.hypot(a.x - at.x, a.y - at.y) - Math.hypot(b.x - at.x, b.y - at.y))[0];
  const line = { a: -B.side * B.half * 0.4, d: SURF.brk + 90 }, P = breakPt(B, line.a, line.d);
  if (WATER_T[world.map.tileAtPx(P.x, P.y)] !== 1) return null;
  const ped = spawnNpc(world, 'athlete', P.x, P.y, 'civ');
  ped.npc.driven = true; ped.npc.keep = true; ped.weapon = 'fists';
  ped.surf = { st: 'pad', b: B.id, w: -1, a: line.a, va: 0, until: 0, ws: [] };
  surfPose(ped, 1);
  return addActor(world, { k: 'surf', main: ped.id, ids: [ped.id], b: B.id, line, airAt: 0 });
}
const surfPose = (ped, sf) => { if (ped.surfSf !== sf) { ped.surfSf = sf; ped.appVer = (ped.appVer || 0) + 1; } };

function stepActors(world, dt) {
  const L = world.cineActors;
  if (!L || !L.length) return;
  for (const A of L) {
    if (A.done) continue;
    const e = world.get(A.main);
    if (!alive(e) || world.time > A.until) { A.done = true; continue; }
    try {
      if (A.k === 'surf') stepSurfer(world, A, e, dt);
      else stepDriven(world, A, e);
    } catch (err) { world.reportError('cinefollow actor', err); A.done = true; }
  }
}
function stepDriven(world, A, v) {
  const d = driverOf(world, v);
  if (!d || d.dead || d.player || v.ai?.kind !== 'cine') { A.done = true; if (v.ai && v.ai.kind === 'cine') v.ai = null; v.despawnable = true; return; }   // (someone took it: theirs now)
  const R = A.route;
  while (A.wi < R.length - 1 && Math.hypot(R[A.wi].x - v.x, R[A.wi].y - v.y) < (A.k === 'combine' ? 40 : 70)) A.wi++;
  let wp = R[A.wi], left = Math.hypot(wp.x - v.x, wp.y - v.y);
  // getting no nearer for a while (up against something): on to the next point - or, at the last, done
  if (A.bestWi !== A.wi || left < A.best - 20) { A.bestWi = A.wi; A.best = left; A.bestAt = world.time; }
  else if (world.time - A.bestAt > STUCK_S) {
    if (A.wi >= R.length - 1) { A.done = true; v.input = { throttle: 0, steer: 0, hb: true }; return; }
    A.wi++; wp = R[A.wi]; left = Math.hypot(wp.x - v.x, wp.y - v.y);
  }
  if (A.wi >= R.length - 1 && left < 60) { A.done = true; v.input = { throttle: 0, steer: 0, hb: true }; return; }
  if (A.k === 'combine') {
    driveToward(world, v, wp.x, wp.y, wp.work ? 95 : 60, { ignoreObstacles: true });
    if (wp.work && speed(v) > 15) farming.npcWork(world, v);
  } else driveToward(world, v, wp.x, wp.y, A.wi >= R.length - 2 ? Math.max(70, Math.min(230, left)) : 230, {});
}
function stepSurfer(world, A, ped, dt) {
  const B = surf.breaksOf(world).list[A.b], s = ped.surf, t = world.tick / 20;
  if (!B || !s) { A.done = true; return; }
  const m = world.map, put = (x, y) => { ped.vx = (x - ped.x) / dt; ped.vy = (y - ped.y) / dt; ped.x = x; ped.y = y; world.place(ped); };
  if (s.st === 'pad' || s.st === 'wipe') {
    if (s.st === 'wipe' && world.time >= s.until) { s.st = 'pad'; surfPose(ped, 1); }
    const L = breakPt(B, A.line.a, A.line.d), dx = L.x - ped.x, dy = L.y - ped.y, d = Math.hypot(dx, dy);
    const sp = s.st === 'wipe' ? 25 : SURF.paddle;
    if (d > 8) {
      const nx = ped.x + (dx / d) * Math.min(d, sp * dt), ny = ped.y + (dy / d) * Math.min(d, sp * dt);
      if (WATER_T[m.tileAtPx(nx, ny)] === 1) { put(nx, ny); ped.a = Math.atan2(dy, dx); } else { ped.vx = ped.vy = 0; }
    } else { ped.vx = ped.vy = 0; ped.a = Math.atan2(-B.ny, -B.nx); }
    if (s.st !== 'pad' || d > 140) return;
    // a wave's crest reaching the line-up where it hasn't broken: up on it
    const q = onBreak(B, ped.x, ped.y);
    for (const w of wavesAt(B, t, s.ws)) {
      if (w.wash) continue;
      const rel = crestD(B, w, q.a) - q.d;
      if (rel < SURF.catch[0] || rel > SURF.catch[1] || broken(B, w, q.a) || Math.abs(q.a) > B.half - 24 || gapAt(B, w, q.a)) continue;
      s.st = 'ride'; s.w = w.id; s.a = q.a; s.va = B.side * 60; surfPose(ped, 2);
      world.emit(ped.x, ped.y, { e: 'splash', x: ped.x, y: ped.y, n: 8 });
      return;
    }
    return;
  }
  // riding: carried in on the wave, carving along its face ahead of the break (away from where it started breaking)
  const w = wavesAt(B, t, s.ws).find((q) => q.id === s.w);
  const back = (why) => { s.st = why === 'wipe' ? 'wipe' : 'pad'; s.until = world.time + SURF.wipeS; surfPose(ped, why === 'wipe' ? 4 : 1); if (why === 'wipe') world.emit(ped.x, ped.y, { e: 'splash', x: ped.x, y: ped.y, n: 14 }); A.line.a = Math.max(-B.half * 0.7, Math.min(B.half * 0.7, -B.side * B.half * (0.2 + ((A.id + world.tick) % 5) * 0.12))); };
  if (!w || w.wash || crestD(B, w, s.a) - SURF.face < SURF.shore + 20) { back('in'); return; }
  const carve = Math.sin(t * 1.25 + A.id) * 0.55, want = B.side * SURF.along * (0.55 + carve);
  s.va += (want - s.va) * (1 - Math.exp(-(s.st === 'air' ? 0.5 : 3.2) * dt));
  s.a = Math.max(-B.half - 40, Math.min(B.half + 40, s.a + s.va * dt));
  const P = breakPt(B, s.a, crestD(B, w, s.a) - SURF.face);
  if (WATER_T[m.tileAtPx(P.x, P.y)] !== 1 || Math.abs(s.a) > B.half) { back('in'); return; }
  put(P.x, P.y);
  ped.a = Math.atan2((s.va >= 0 ? B.nx : -B.nx) * 0.85 - B.ny * 0.5, (s.va >= 0 ? -B.ny : B.ny) * 0.85 - B.nx * 0.5);
  if (s.st === 'air') { if (world.time >= s.until) { s.st = 'ride'; surfPose(ped, 2); world.emit(ped.x, ped.y, { e: 'splash', x: ped.x, y: ped.y, n: 10 }); } return; }
  if (Math.abs(s.va) > SURF.along * 0.8 && world.time > A.airAt) { s.st = 'air'; s.until = world.time + SURF.airS; A.airAt = world.time + 5; surfPose(ped, 3); return; }
  if (broken(B, w, s.a - B.side * 10)) back('wipe');
}
// done (or not followed) and out of everyone's sight: gone
function tidyActors(world) {
  const L = world.cineActors;
  if (!L || !L.length) return;
  const watched = new Set();
  for (const p of world.players.values()) if (p.cineF && p.cineF.sub) watched.add(p.cineF.sub.id);
  world.cineActors = L.filter((A) => {
    const e = world.get(A.main);
    if (e && !e.removed && (watched.has(A.main) || (!A.done && world.time < A.until))) return true;
    if (e && !e.removed && inAnyView(world, e.x, e.y, 64)) { if (!A.done) A.done = true; return true; }
    for (const id of A.ids) {
      const q = world.get(id);
      if (!q || q.removed) continue;
      if (q.kind === K.PED && q.npc) { if (!q.player && !q.vehId) despawnNpc(world, q); else if (q.vehId) { const v = world.get(q.vehId); if (v && v.cineActor === A.id) { v.seats[v.seats.indexOf(q.id)] = 0; q.vehId = 0; despawnNpc(world, q); } } }
      else if (q.kind === K.VEH && anyPlayerIn(world, q)) { if (q.ai && q.ai.kind === 'cine') q.ai = null; q.despawnable = true; q.cineActor = 0; }   // (a player's in it: theirs, an ordinary vehicle now)
      else if (q.kind === K.VEH) { for (const s of q.seats) { const o = s && world.get(s); if (o && o.npc && !o.player) despawnNpc(world, o); } world.remove(q); }
    }
    return false;
  });
}

// ---- choosing whom to follow ------------------------------------------------------------------------------------------
function choose(world, p, k, pref = null, avoid = null) {
  const C = p.cineF, list = candidates(world, k);
  if (!list.length) return null;
  const ref = (C.sub && world.get(C.sub.id)) || C.eye || p.ped;
  const dist = (c) => (ref ? Math.hypot(c.e.x - ref.x, c.e.y - ref.y) : 0);
  if (pref) { const same = list.filter((c) => c.tag === pref && c.e.id !== C.sub?.id); if (same.length) return same.sort((a, b) => dist(a) - dist(b))[0]; }
  let pool = avoid ? list.filter((c) => c.tag !== avoid) : list;
  if (!pool.length) pool = list.filter((c) => c.e.id !== C.sub?.id);
  if (!pool.length) pool = list;
  const me = p.ped;
  if (C.near && me) {
    const dm = (c) => Math.hypot(c.e.x - me.x, c.e.y - me.y), near = pool.filter((c) => dm(c) < NEAR_PX);
    if (near.length) return near.sort((a, b) => dm(a) - dm(b))[0];
  }
  return pool[(C.seq * 7 + world.tick) % pool.length];
}
function tell(p, msg) { if (p.conn) p.conn.sendJSON({ t: 'cinef', ...msg }); }
function setSubject(world, p, k, c) {
  const C = p.cineF, prev = C.sub && world.get(C.sub.id), f = followOf(world, c.e);
  const cut = !prev || C.cur !== k || Math.hypot(prev.x - c.e.x, prev.y - c.e.y) > CUT_PX;
  if (C.cur !== k) C.kindAt = world.time;
  C.cur = k; C.sub = { id: c.e.id, tag: c.tag, at: world.time }; C.fid = f.id; C.eye.x = f.x; C.eye.y = f.y; C.seq++; C.waitAt = 0;
  p.meDirty = true;
  const K0 = CINE_KIND[k];
  tell(p, { k, id: f.id, n: `${K0.n}: ${nameOf(world, c.e)}`, z: K0.z, cut: cut ? 1 : 0, tour: C.tour ? 1 : 0, x: Math.round(f.x), y: Math.round(f.y), seq: C.seq });
}
// a subject for kind k: one doing it (the same scene first), or one started for the camera
function find(world, p, k, pref, avoid) {
  return choose(world, p, k, pref, avoid) || (tryStart(world, p, k) ? choose(world, p, k, null, null) : null);
}
function nextOfKind(world, p, k, pref, avoid) {
  const C = p.cineF, c = find(world, p, k, pref, avoid);
  if (c) { setSubject(world, p, k, c); return true; }
  if (!C.waitAt) tell(p, { k, id: 0, none: 1, n: CINE_KIND[k].n, dev: C.dev ? 1 : 0 });
  C.sub = null; C.fid = 0; C.waitAt = world.time;
  return false;
}
function nextKind(world, p) {
  const C = p.cineF;
  for (let i = 0; i < TOUR_TRIES; i++) {
    C.ti = (C.ti + 1) % CINE_TOUR.length;
    const k = CINE_TOUR[C.ti], c = find(world, p, k, null, null);
    if (c) { setSubject(world, p, k, c); return true; }
    (C.skipped ||= []).push(k);
  }
  C.sub = null; C.fid = 0; C.waitAt = world.time;
  return false;
}

// ---- what the page asks: { t: 'cine', f: kind | 'tour' | 'next' | 'stop', near } ------------------------------------
export function request(world, p, msg, dev) {
  const f = typeof msg.f === 'string' ? msg.f.slice(0, 16) : '';
  if (f === 'stop' || !f) { if (p.cineF) { p.cineF = null; tell(p, { off: 1 }); } return; }
  if (f === 'next') {
    const C = p.cineF;
    if (!C) return;
    if (C.tour) nextKind(world, p); else nextOfKind(world, p, C.k, null, C.sub ? C.sub.tag : null);
    return;
  }
  if (f !== 'tour' && !CINE_KIND[f]) return;
  const old = p.cineF, ped = p.ped;
  p.cineF = { k: f, cur: null, tour: f === 'tour', ti: -1, near: msg.near !== false, sub: null, fid: 0, eye: { x: ped ? ped.x : 0, y: ped ? ped.y : 0, player: p, cine: true }, kindAt: world.time, tried: old ? old.tried : {}, seq: old ? old.seq : 0, dev: !!dev, waitAt: 0 };
  if (old && old.sub) { p.cineF.sub = old.sub; p.cineF.eye.x = old.eye.x; p.cineF.eye.y = old.eye.y; }   // (from where the camera is)
  if (f === 'tour') { if (old && old.tour && old.cur) p.cineF.ti = Math.max(-1, CINE_TOUR.indexOf(old.cur)); nextKind(world, p); }
  else nextOfKind(world, p, f, null, null);
}

// ---- every few ticks: still at it? --------------------------------------------------------------------------------
function watch(world, p) {
  const C = p.cineF, now = world.time;
  if (!p.conn || !p.ped) { p.cineF = null; return; }
  if (!C.sub) {   // (nobody to follow just now: looked for again)
    if (now - C.waitAt < RETRY_S) return;
    if (C.tour) nextKind(world, p); else nextOfKind(world, p, C.k, null, null);
    return;
  }
  const e = world.get(C.sub.id), on = !!(e && candidates(world, C.cur).some((c) => c.e.id === e.id));
  if (on) {
    const f = followOf(world, e);
    C.eye.x = f.x; C.eye.y = f.y;
    if (f.id !== C.fid) { C.fid = f.id; tell(p, { k: C.cur, id: f.id, n: `${CINE_KIND[C.cur].n}: ${nameOf(world, e)}`, z: CINE_KIND[C.cur].z, cut: 0, tour: C.tour ? 1 : 0, x: Math.round(f.x), y: Math.round(f.y), seq: C.seq }); }   // (into a vehicle, or out of one)
  }
  if (C.tour) {
    if (on && now - C.kindAt < CINE_TOUR_S) return;
    if (!on && candidates(world, C.cur).some((c) => c.tag === C.sub.tag)) { nextOfKind(world, p, C.cur, C.sub.tag, null); return; }   // (the next racer in the same race)
    nextKind(world, p);
    return;
  }
  if (on && now - C.sub.at < CINE_SUBJECT_S) return;
  if (on) nextOfKind(world, p, C.k, null, C.sub.tag);   // (a while on this one: someone else doing it)
  else nextOfKind(world, p, C.k, C.sub.tag, C.sub.tag);   // (theirs is over: the same scene's next, else another)
}

export function update(world, dt) {
  stepActors(world, dt);
  // (every few ticks: still at it? - and straight away when who it's on was taken away or went down this tick)
  for (const p of world.players.values()) {
    const C = p.cineF;
    if (!C) continue;
    const e = C.sub && world.get(C.sub.id);
    if (world.tick % 5 !== 2 && !(C.sub && (!e || e.removed || e.dead))) continue;
    try { watch(world, p); } catch (err) { world.reportError('cinefollow', err); p.cineF = null; tell(p, { off: 1 }); }
  }
  if (world.tick % 40 === 7) tidyActors(world);
}
export function leave(p) { p.cineF = null; }
