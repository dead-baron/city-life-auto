// The scene director (the owner, 2026-11-13: "the occasional gang warfare breaks out, a random police raid, an NPC gets
// into a bar fight and gets chased by a biker gang ..."): plays the scripts in shared/scenes/ in the world.
//   - start(world, id, { mode, ref, viewer }): the place resolved (PLACES: named anchors), the cast put in it, the beats run
//     on the scene's clock (world ticks since it began) - through the city's own systems wherever there is one: the biker
//     clubs' chase (bikers.js), the police's pursuit (police.js) and air unit (policeair.js), the explosions, the fights.
//   - The actors are real characters (npc.js peds with npc.driven while on their script): a player who hurts one, aims at
//     one or stands in one's way takes them off it - from then the city's own AI has them (release: the club fights back,
//     a driver drives on in traffic). At the end of a scene everyone left is released the same way; live, a scene nobody's
//     near any more is over and its people go once nobody can see them.
//   - Live events (update: schedule): now and then, near a player, never by someone in their first minutes (FTUE), within
//     DIRECTOR's caps - OFF by default (shared/rules.js DIRECTOR.live and each scene's `on`, or CLA_SCENES on the server).
//   - mode 'capture' (the private capture server, CLA_CAPTURE=1: server/capture.js): the actors with look 'player' are
//     drawn as players (net.js asPlayer: a name tag, a player's clothes, chat bubbles, emotes) - only there: in the live
//     world every actor is an ordinary NPC (the owner, 11-13). The scene's time of day and weather are set and held.
//   - Viewers (the page that started it, the capture's page): p.dirCam is the script's camera (shared camAt) - what they're
//     sent is round it (view.js) and the city comes alive round it as round a player; they're told the cast's entities
//     ({ t: 'dscene' }) and their page flies the same camera (client/director.js).
import { K, DT, TILE, DAY_LOOP_S, DAY_PART_S, WEATHER, T } from '../../shared/constants.js';
import { DIRECTOR } from '../../shared/rules.js';
import { CHAT } from '../../shared/chatdefs.js';
import { VEHICLES } from '../../shared/vehicles.js';
import { PED_BLOCK } from '../../shared/mapcore.js';
import { blastSize } from '../../shared/explosions.js';
import { randomLook, encodeLook, decodeLook, lookToApp } from '../../shared/look.js';
import { pedStep } from '../../shared/physics.js';
import { IN } from '../../shared/input.js';
import { SCENES, SCENE_LIST, pointOf, camAt } from '../../shared/scenes/index.js';
import { inAnyView } from '../view.js';
import { spawnNpc, despawnNpc, seek, footWay, startFight, onAttacked, onCarjacked } from './npc.js';
import { planRoute, driveToward, joinTraffic } from './traffic.js';
import * as players from './players.js';
import * as combat from './combat.js';
import * as vehicles from './vehicles.js';
import * as explosions from './explosions.js';
import * as bikers from './bikers.js';
import * as policeair from './policeair.js';
import * as police from './police.js';
import { patchesOf } from './dusting.js';
import { DUST } from '../../shared/rules.js';
import { floorAt, FLY } from '../../shared/flight.js';
import * as env from './environment.js';

// the emotes' body poses (systems/emote.js, coming on its own branch): played on an actor too once it's there
let emoteSys = null;
import('./emote.js').then((m) => { emoteSys = m; }).catch(() => { emoteSys = null; });

const NO_INPUT = { bits: 0, mx: 0, my: 0, aim: 0 };
const MOVE_MAX_S = 25, ATTACK_MAX_S = 8;
const alive = (e) => !!(e && !e.removed && !e.dead);
const D = (world) => (world.director ||= { runs: [], seq: 0, nextAt: 0, cool: {} });
const envList = () => String(process.env.CLA_SCENES || '').split(',').map((s) => s.trim()).filter(Boolean);
// is this scene switched on for the live world (the rules, or the server's CLA_SCENES: 'all' or a list of ids)
export function liveOn(id) {
  const L = envList();
  if (L.includes('all') || L.includes(id)) return true;
  return !!(DIRECTOR.live && DIRECTOR.scenes[id] && DIRECTOR.scenes[id].on);
}
export const anyLive = () => envList().length > 0 || (DIRECTOR.live && Object.values(DIRECTOR.scenes).some((s) => s.on));
export const runsOf = (world) => D(world).runs;
export const sceneList = () => SCENE_LIST.map((s) => ({ id: s.id, n: s.n, g: s.g || 'Scenes', len: s.len }));

// ---- places: where a scene happens, as named anchors { x, y, a } --------------------------------------------------------
// each resolver: (world, place, ref) -> { anchors, at: { x, y } (its middle), clear?: [x0, y0, x1, y1, ...] } | null
const near = (q, x, y) => Math.hypot(q.x - x, q.y - y);
function walkable(map, x, y) { const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE); return map.inside(tx, ty) && !PED_BLOCK[map.tiles[map.idx(tx, ty)]] && !map.isWater(x, y); }
// the nearest point a person can stand on, rings of tiles out from (x, y)
function standAt(map, x, y, maxR = 12) {
  if (walkable(map, x, y)) return { x, y };
  for (let r = 1; r <= maxR; r++) for (let k = 0; k < r * 8; k++) {
    const a = (k / (r * 8)) * Math.PI * 2, px = x + Math.cos(a) * r * TILE, py = y + Math.sin(a) * r * TILE;
    if (walkable(map, px, py)) return { x: px, y: py };
  }
  return { x, y };
}
// a named place (World v3's handcrafted places and sights, a landmark, a POI's label) - its middle
export function named(map, name) {
  const n = String(name || '').toLowerCase();
  if (!n) return null;
  for (const H of Object.values(map.world3hand || {})) {
    for (const pl of (H && H.places) || []) if (pl.name && pl.name.toLowerCase() === n) return { x: ((pl.x0 + pl.x1) / 2) * TILE, y: ((pl.y0 + pl.y1) / 2) * TILE };
    for (const sg of (H && H.sights) || []) if (sg.name && sg.name.toLowerCase() === n) return { x: sg.x, y: sg.y };
  }
  for (const l of map.landmarks || []) if (l.name && l.name.toLowerCase() === n) return { x: l.x + (l.w || 0) / 2, y: l.y + (l.h || 0) / 2 };
  for (const q of map.pois || []) if (q.label && q.label.toLowerCase() === n) return { x: q.x, y: q.y };
  return null;
}
// the straight stretches of ground-level road (east-west and north-south, joined across their junctions): { h, c (the
// fixed coordinate), lo, hi, hw, bridge } - worked out once a map
export function straightRuns(map) {
  if (map._dirRuns) return map._dirRuns;
  const by = new Map();
  for (const e of map.edges || []) {
    if (e.lvl || !e.pts || e.pts.length < 2) continue;
    const a = e.pts[0], b = e.pts[e.pts.length - 1];
    const h = e.pts.every((p) => Math.abs(p.y - a.y) <= 8) && Math.abs(b.x - a.x) >= 40, v = !h && e.pts.every((p) => Math.abs(p.x - a.x) <= 8) && Math.abs(b.y - a.y) >= 40;
    if (!h && !v) continue;
    const k = `${h ? 'h' : 'v'}${Math.round(h ? a.y : a.x)}`;
    if (!by.has(k)) by.set(k, []);
    by.get(k).push({ lo: Math.min(h ? a.x : a.y, h ? b.x : b.y), hi: Math.max(h ? a.x : a.y, h ? b.x : b.y), hw: e.hw || 24, bridge: !!e.bridge });
  }
  const runs = [];
  for (const [k, segs] of by) {
    segs.sort((p, q) => p.lo - q.lo);
    let cur = null;
    const flush = () => { if (cur) runs.push(cur); };
    for (const g of segs) {
      if (cur && g.lo <= cur.hi + 2) { cur.hi = Math.max(cur.hi, g.hi); cur.bridge ||= g.bridge; cur.hw = Math.max(cur.hw, g.hw); continue; }
      flush();
      cur = { h: k[0] === 'h', c: Number(k.slice(1)), lo: g.lo, hi: g.hi, hw: g.hw, bridge: g.bridge };
    }
    flush();
  }
  return (map._dirRuns = runs);
}
// a stretch of road `len` long near (x, y) (its end at the point nearest it): anchors start and end (a: the way from
// start to end), and mid
function roadNear(map, x, y, len, maxD = 6000, avoid = null) {
  let best = null, bd = Infinity;
  for (const r of straightRuns(map)) {
    if (r.bridge || r.hi - r.lo < len + 160) continue;
    const s = Math.max(r.lo, Math.min(r.hi, r.h ? x : y)), px = r.h ? s : r.c, py = r.h ? r.c : s, d = Math.hypot(px - x, py - y) - Math.min(30, r.hw) * 4;
    if (d > maxD || d >= bd) continue;
    if (avoid && avoid(px, py)) continue;
    bd = d; best = { r, s };
  }
  if (!best) return null;
  const { r, s } = best;
  // the end at the point nearest (x, y), the start len back from it - whichever way has the room
  const fwd = s - (r.lo + 80) >= len, end = fwd ? Math.min(s, r.hi - 80) : Math.max(s, r.lo + 80), start = fwd ? end - len : end + len;
  const P = (u) => (r.h ? { x: u, y: r.c } : { x: r.c, y: u });
  const a0 = r.h ? (fwd ? 0 : Math.PI) : fwd ? Math.PI / 2 : -Math.PI / 2;
  const A = P(start), B = P(end), M = P((start + end) / 2);
  return { anchors: { start: { ...A, a: a0 }, end: { ...B, a: a0 }, mid: { ...M, a: a0 } }, hw: r.hw, run: r, at: M };
}
// a little way off a point, off the road, between buildings if there are any: where someone on foot ducks out of sight
export function alleyNear(map, x, y) {
  let best = null, bs = -Infinity;
  for (let r = 4; r <= 11; r++) for (let k = 0; k < 24; k++) {
    const a = (k / 24) * Math.PI * 2, px = x + Math.cos(a) * r * TILE, py = y + Math.sin(a) * r * TILE;
    if (!walkable(map, px, py)) continue;
    const t = map.tileAtPx(px, py);
    if (t === T.ROAD || t === T.BRIDGE) continue;
    let walls = 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) for (let q = 1; q <= 3; q++) if (PED_BLOCK[map.tileAtPx(px + dx * q * TILE, py + dy * q * TILE)]) { walls++; break; }
    const sc = walls * 10 - Math.abs(r - 7) - (map.los(x, y, px, py) ? 0 : 6);
    if (sc > bs) { bs = sc; best = { x: px, y: py }; }
  }
  return best || standAt(map, x + 160, y);
}

export const PLACES = {
  // the Rusty Spur (countryside.js; bikers.js): its door, the bar inside, the lot, the road, a stop in town to run for
  roadhouse(world) {
    const m = world.map, R = m.roadhouse;
    if (!R) return null;
    const b = m.buildings[R.b], u = b && b.walkIn && b.walkIn.units[0];
    if (!u) return null;
    const dx = (u.door.tx + 1) * TILE, fy = u.door.ty;
    const out = { x: dx, y: (fy + 1.6) * TILE, a: Math.PI / 2 }, inn = { x: dx, y: (fy - 0.5) * TILE, a: -Math.PI / 2 };
    const bar = { x: (u.x0 + 6) * TILE, y: (u.counterRow + 2.2) * TILE, a: -Math.PI / 2 };
    const lot = R.lot ? { x: (R.lot.x0 + R.lot.x1) / 2, y: (R.lot.y0 + R.lot.y1) / 2, a: Math.PI / 2 } : { x: out.x, y: out.y + 200, a: Math.PI / 2 };
    const road = R.lot ? { x: lot.x, y: R.lot.y1 + 70, a: Math.PI / 2 } : { x: out.x, y: out.y + 360, a: Math.PI / 2 };
    const ap = standAt(m, out.x - 240, out.y + 170);
    const towns = (m.pois || []).filter((p) => (p.kind === 'gasstation' || p.kind === 'convenience') && near(p, R.x, R.y) > 3800).sort((p, q) => near(p, R.x, R.y) - near(q, R.x, R.y));
    const tw = towns[0] ? { x: towns[0].outside ? towns[0].outside.x : towns[0].x, y: towns[0].outside ? towns[0].outside.y : towns[0].y } : { x: R.x - 6000, y: R.y };
    return { anchors: { door: out, doorIn: inn, bar, lot, road, approach: { ...ap, a: -Math.PI / 4 }, porch: { x: R.x, y: R.y, a: Math.PI / 2 }, town: { ...tw, a: 0 } }, at: { x: R.x, y: R.y + 100 } };
  },
  // a gang's hideout (the 'gang' points of interest: the Syndicate's HQs, Dusty Hollow's) and a straight road up to it
  hideout(world, place, ref) {
    const m = world.map, gs = (m.pois || []).filter((p) => p.kind === 'gang');
    const R = ref || (place.near && named(m, place.near)) || { x: m.frame ? m.frame.x0 + m.frame.w * TILE / 2 : 0, y: m.frame ? m.frame.y0 + m.frame.h * TILE / 2 : 0 };
    gs.sort((p, q) => near(p, R.x, R.y) - near(q, R.x, R.y));
    for (const g of gs.length ? gs.slice(0, 4) : [R]) {
      const r = roadNear(m, g.x, g.y, place.len || 1100, 2600);
      if (r) return { ...r, anchors: { ...r.anchors, hideout: { x: g.x, y: g.y, a: 0 } }, clear: true };
    }
    return null;
  },
  // a long straight road near a named place (place.near) or the reference (a player, the debug menu's user)
  road(world, place, ref, opt = {}) {
    const m = world.map, P = ref || (place.near && named(m, place.near)) || named(m, 'Downtown') || named(m, 'Midtown');
    if (!P) return null;
    const r = roadNear(m, P.x, P.y, place.len || 1400, opt.maxD || 5000, opt.avoid || null);
    if (!r) return null;
    // where the getaway runs on to: a point well past the end, along the road net
    const a = r.anchors.end.a, far = standAt(m, r.anchors.end.x + Math.cos(a) * (place.far || 2600), r.anchors.end.y + Math.sin(a) * (place.far || 2600), 30);
    return { ...r, anchors: { ...r.anchors, far: { ...far, a } }, clear: true };
  },
  // a place by its names (the Showcase's: client/showcase.js q - the first found, exactly, then one starting with it)
  named(world, place) {
    const m = world.map;
    for (const n of place.q || [place.name]) { const p = named(m, n); if (p) return { anchors: { here: { ...p, a: 0 } }, at: p }; }
    const all = [];
    for (const H of Object.values(m.world3hand || {})) for (const pl of (H && H.places) || []) if (pl.name) all.push({ x: ((pl.x0 + pl.x1) / 2) * TILE, y: ((pl.y0 + pl.y1) / 2) * TILE, name: pl.name });
    for (const l of m.landmarks || []) if (l.name) all.push({ x: l.x + (l.w || 0) / 2, y: l.y + (l.h || 0) / 2, name: l.name });
    for (const n of place.q || []) { const p = all.find((o) => o.name.toLowerCase().startsWith(String(n).toLowerCase())); if (p) return { anchors: { here: { x: p.x, y: p.y, a: 0 } }, at: p }; }
    return null;
  },
  // a crop field (dusting.js's patches): two passes along it (p0 -> p1, p2 -> p3), the way in (in), its middle (field)
  farm(world, place, ref) {
    const m = world.map, L = patchesOf(m);
    if (!L.length) return null;
    const R = ref || (place.near && named(m, place.near)) || { x: L[0].cx, y: L[0].cy };
    let best = null, bd = Infinity;
    for (const q of L) { const d = Math.hypot(q.cx - R.x, q.cy - R.y); if (d < bd) { bd = d; best = q; } }
    // (the patches are squares on a grid: a run of them in a row along x makes the longer pass)
    const row = L.filter((q) => q.y === best.y && Math.abs(q.x - best.x) <= best.w * 3).sort((a, b) => a.x - b.x);
    const x0 = row[0].x, x1 = row[row.length - 1].x + best.w, y1 = best.y + best.h * 0.33, y2 = best.y + best.h * 0.67;
    return { anchors: { in: { x: x0 - 1100, y: y1, a: 0 }, p0: { x: x0 - 160, y: y1, a: 0 }, p1: { x: x1 + 160, y: y1, a: 0 }, p2: { x: x1 + 160, y: y2, a: Math.PI }, p3: { x: x0 - 160, y: y2, a: Math.PI }, field: { x: (x0 + x1) / 2, y: best.cy, a: 0 } }, at: { x: (x0 + x1) / 2, y: best.cy } };
  },
  // wherever the reference is (or [x, y])
  here(world, place, ref) { const p = place.xy ? { x: place.xy[0], y: place.xy[1] } : ref; return p ? { anchors: { here: { ...standAt(world.map, p.x, p.y), a: 0 } }, at: p } : null; },
};

// ---- the cast ---------------------------------------------------------------------------------------------------------
const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
// a player's look (capture only): a whole random outfit from the cast's id - the same every take
function playerApp(seed, base) { const L = randomLook(seed, base || null); const code = encodeLook(L); return lookToApp(decodeLook(code), code); }
function ctxOf(world, run) {
  return {
    anchors: run.anchors,
    beatAt: (id) => run.beatAt[id],
    ent(cid) {
      const A = run.cast.get(cid);
      let e = A ? world.get(A.id) : null;
      if (!e || e.removed) return null;
      if (e.kind === K.PED && e.vehId) { const v = world.get(e.vehId); if (v && !v.removed) e = v; }
      return { x: e.x, y: e.y, a: e.a || 0, vx: e.vx || 0, vy: e.vy || 0 };
    },
  };
}
function addActor(run, cid, e, spec, scripted, group = null) {
  const A = { cid, id: e.id, kind: e.kind === K.VEH ? 'veh' : 'ped', spec, scripted, group, ctl: null, hitAt: e.lastHitAt || 0, vhp: e.hp, prog: null, own: true };
  run.cast.set(cid, A);
  if (group) { if (!run.groups.has(group)) run.groups.set(group, []); run.groups.get(group).push(cid); }
  e.actor = { run: run.seq, cid };
  return A;
}
function spawnPerson(world, run, cid, spec, at, a, group = null) {
  const ped = spawnNpc(world, spec.arch || 'casual', at.x, at.y, spec.role || 'civ');
  ped.a = a;
  ped.npc.keep = true;
  const scripted = spec.ai ? false : group ? !!spec.scripted : true;
  if (scripted) ped.npc.driven = true;
  if (spec.hp) { ped.maxHp = spec.hp; ped.hp = spec.hp; }
  if (spec.weapon) ped.weapon = spec.weapon;
  if (spec.post) ped.npc.guard = { x: at.x, y: at.y, a };   // (standing their ground where they're put: a gang outside its hideout)
  // drawn as a player: on the private capture server only (the owner, 11-13 - never in the live world)
  if (run.capture && spec.look === 'player') {
    ped.asPlayer = { name: spec.name || cid };
    ped.app = playerApp(hash(`${run.sc.id}:${cid}`), spec.base);
    ped.archetype = 'player';
    ped.appVer = (ped.appVer || 0) + 1;
  }
  return addActor(run, cid, ped, spec, scripted, group);
}
function seat(world, ped, v, i) { if (ped.vehId) return false; ped.vehId = v.id; ped.seat = i; v.seats[i] = ped.id; ped.vx = 0; ped.vy = 0; ped.x = v.x; ped.y = v.y; return true; }
function castOne(world, run, c) {
  const ctx = ctxOf(world, run), m = world.map;
  if (c.pick) return pickOne(world, run, c);
  const P = pointOf(c.at || 'here', ctx) || run.at;
  const a = c.ra !== undefined ? (P.a || 0) + c.ra : c.a ?? P.a ?? 0;
  if (c.veh) {
    const v = world.spawnVehicle(c.veh, P.x, P.y, a, { parked: !!c.parked, ...(c.paint !== undefined ? { paint: c.paint } : null), npcOwned: true });
    v.despawnable = false; v.dirHold = true;
    if (c.siren) v.sirenOn = true;
    if (c.air && v.def.kind === 'air') { v.alt = c.air; v.spool = 1; v.autopilot = true; const sp = (v.def.max || 600) * 0.6; v.vx = Math.cos(a) * sp; v.vy = Math.sin(a) * sp; v.fin = { tank: false, fwd: 1, turn: 0, climb: 0, hb: false, m: 1, dx: 0, dy: 0 }; }   // (already up, flying: an autoplay's aircraft)
    const A = addActor(run, c.id, v, c, true);
    // a crew in it (a police car's two officers: police.js armCop's arms)
    for (let i = 0; i < (c.crew ? 2 : 0); i++) {
      const cop = spawnNpc(world, c.crew, v.x, v.y, c.crew === 'cop' ? 'cop' : 'civ');
      if (c.crew === 'cop') { cop.npc.unit = v.id; cop.weapon = 'pistol'; }
      seat(world, cop, v, i);
    }
    return A;
  }
  if (c.group !== undefined) {
    const out = [];
    for (let i = 0; i < c.group; i++) {
      const ang = (i / c.group) * Math.PI * 2 + 0.4, r = (c.spread || 50) * (0.55 + 0.45 * ((i * 7) % 5) / 4);
      const at = standAt(m, P.x + Math.cos(ang) * r, P.y + Math.sin(ang) * r, 4);
      out.push(spawnPerson(world, run, `${c.id}.${i}`, c, at, c.ra !== undefined ? (P.a || 0) + c.ra : Math.atan2(at.y - P.y, at.x - P.x), c.id));
    }
    return out;
  }
  const v = c.in ? world.get((run.cast.get(c.in) || {}).id) : null;
  const A = spawnPerson(world, run, c.id, c, v ? v : standAt(m, P.x, P.y, 6), a);
  if (v) { const ped = world.get(A.id), i = v.seats.findIndex((s) => !s); if (i >= 0) seat(world, ped, v, i); }
  return A;
}
// someone or something already in the world: the biker nearest a point (inside the bar), a club bike by the door
function pickOne(world, run, c) {
  const P = pointOf(c.near || 'here', ctxOf(world, run)) || run.at;
  let best = null, bd = Infinity;
  if (c.pick === 'biker' || c.pick === 'clubbike') {
    bikers.ensureUp(world);
    for (const cl of bikers.clubsOf(world)) for (const id of c.pick === 'biker' ? cl.members : cl.bikes) {
      const e = world.get(id);
      if (!alive(e) || (c.pick === 'biker' && e.vehId) || (c.pick === 'clubbike' && (e.seats[0] || e.wreckAt || e.def.max < (c.minMax || 500)))) continue;
      const d = near(e, P.x, P.y);
      if (d < bd) { bd = d; best = e; }
    }
  }
  if (!best) return null;
  const A = addActor(run, c.id, best, c, false);
  A.own = false;
  return A;
}

// ---- starting one -------------------------------------------------------------------------------------------------------
// opts: { mode: 'live' | 'dev' | 'capture', ref: { x, y } (where to look for the place), viewer: a player to show it to }
export function start(world, id, opts = {}) {
  const sc = SCENES[id];
  if (!sc) return { err: `No scene "${id}".` };
  const st = D(world), mode = opts.mode || 'dev';
  const resolve = PLACES[sc.place.k];
  const pl = opts.place || (resolve ? resolve(world, sc.place, opts.ref || null) : null);   // (opts.place: resolved already - the live scheduler's)
  if (!pl) return { err: `No place for "${sc.n}" here (${sc.place.k}).` };
  const run = { held: !!opts.hold, seq: ++st.seq, id, sc, mode, capture: mode === 'capture' || !!world.capture, tick0: world.tick, anchors: pl.anchors, at: pl.at || Object.values(pl.anchors)[0], cast: new Map(), groups: new Map(), beatAt: {}, beats: (sc.beats || []).map((b, i) => ({ b, i, st: 'wait', t0: 0, tEnd: 0, d: null })), viewers: [], over: false, endAt: 0, lastNear: world.time, camPrev: null, castVer: 0 };
  if (pl.clear && pl.run) clearRoad(world, run, pl);
  if (run.capture) setScene(world, sc);
  for (const c of sc.cast || []) castOne(world, run, c);
  st.runs.push(run);
  if (opts.viewer) watch(world, run, opts.viewer);
  if (mode === 'live') st.cool[id] = world.time;
  return { run };
}
// the capture's time of day and weather (held: the take looks the same throughout)
function setScene(world, sc) {
  if (sc.time !== undefined) {
    const mm = ((sc.time % 1440) + 1440) % 1440;
    world.loopTime = mm >= 360 && mm < 1200 ? (mm - 360) / 840 * DAY_PART_S : DAY_PART_S + (((mm - 1200 + 1440) % 1440) / 600) * (DAY_LOOP_S - DAY_PART_S);
    world.clockHold = true;
  }
  if (sc.weather === 'rain') { env.startRain(world, 600); world.weatherHold = { w: WEATHER.RAIN }; }
  else if (sc.weather) { env.stopRain(world); world.weatherHold = { w: WEATHER.CLEAR }; }
}
// the road the scene plays out on cleared of the city's traffic (out of sight only, live)
function clearRoad(world, run, pl) {
  const A = pl.anchors.start, B = pl.anchors.far || pl.anchors.end, pad = 140;
  const x0 = Math.min(A.x, B.x) - pad, x1 = Math.max(A.x, B.x) + pad, y0 = Math.min(A.y, B.y) - pad, y1 = Math.max(A.y, B.y) + pad;
  for (const v of [...world.entities.values()]) {
    if (v.kind !== K.VEH || !v.ai || v.ai.kind !== 'traffic' || v.x < x0 || v.x > x1 || v.y < y0 || v.y > y1) continue;
    if (v.seats.some((s) => s && world.get(s)?.player)) continue;
    if (!run.capture && inAnyView(world, v.x, v.y, 80)) continue;
    for (const s of v.seats) { const q = s && world.get(s); if (q) despawnNpc(world, q); }
    world.remove(v);
  }
}

// ---- showing it to someone ------------------------------------------------------------------------------------------------
export function watch(world, run, p) {
  if (!run.viewers.includes(p)) run.viewers.push(p);
  p.dirRun = run.seq;
  if (run.capture && p.ped) { p.capView = true; p.invincible = true; p.ped.hidden = true; world.place(p.ped); }
  tell(world, run, p);
}
function castMsg(run) { const cast = {}; for (const [cid, A] of run.cast) cast[cid] = A.id; return cast; }
function tell(world, run, p) {
  if (!p.conn) return;
  const anchors = {};
  for (const [k, q] of Object.entries(run.anchors)) anchors[k] = [Math.round(q.x), Math.round(q.y), +(q.a || 0).toFixed(3)];
  p.conn.sendJSON({ t: 'dscene', id: run.id, seq: run.seq, tick0: run.tick0, cast: castMsg(run), anchors, bt: run.beatAt, cap: run.capture ? 1 : 0, len: run.sc.len });
}
export function unwatch(world, p) {
  for (const run of D(world).runs) run.viewers = run.viewers.filter((q) => q !== p);
  p.dirCam = null; p.dirRun = 0;
  if (p.conn) p.conn.sendJSON({ t: 'dscene', off: 1 });
}

// ---- the actors' own steps ------------------------------------------------------------------------------------------------
// a scripted actor on foot, each tick: on to where its beat is taking it (through a door if that's the way), or after
// whoever it's fighting; standing still otherwise
function stepFoot(world, run, A, ped, dt) {
  const now = world.time;
  if (ped.vehId || ped.dead || now < ped.downUntil || now < (ped.stunUntil || 0)) return;
  const c = A.ctl;
  let inp = NO_INPUT, factor = 0.55;
  if (c && c.k === 'move') {
    const to = c.pt();
    if (to) {
      const d = Math.hypot(to.x - ped.x, to.y - ped.y);
      if (d > 10) { const wp = footWay(world, ped, to.x, to.y); inp = seek(ped, wp.x, wp.y, c.run); factor = c.run ? 1 : 0.8; }   // (a purposeful walk: not the passers-by's stroll)
    }
  } else if (c && (c.k === 'attack' || c.k === 'shoot')) {
    const t = world.get(c.target);
    if (alive(t)) {
      const d = Math.hypot(t.x - ped.x, t.y - ped.y), reach = c.k === 'shoot' ? 320 : 24, aim = Math.atan2(t.y - ped.y, t.x - ped.x);
      if (d > reach) { const wp = footWay(world, ped, t.x, t.y); inp = seek(ped, wp.x, wp.y, true); factor = 1; }
      else { ped.a = aim; inp = { bits: now >= (c.next || 0) ? IN.FIRE : 0, mx: 0, my: 0, aim }; if (inp.bits) c.next = now + (c.k === 'shoot' ? 0.35 : 0.5); }
    }
  } else if (c && c.k === 'face') { const to = c.pt(); if (to) ped.a = Math.atan2(to.y - ped.y, to.x - ped.x); }
  if (inp === NO_INPUT) { ped.vx = 0; ped.vy = 0; return; }
  const mods = players.pedMods(world, ped);
  mods.speedMul *= (ped.npc ? ped.npc.speed : 1) * factor;
  pedStep(ped, inp, dt, world.map, mods);
  if (inp.bits & IN.FIRE) {
    const hp = world.get(c.target)?.hp;
    combat.tryAttack(world, ped, inp.aim);
    const t = world.get(c.target);
    if (t && hp !== undefined && t.hp < hp) c.landed = (c.landed || 0) + 1;
    if (c.k === 'shoot') c.fired = (c.fired || 0) + 1;
  }
}
// a scripted vehicle: along its route at its speed (through anything in the way when it's told to go straight there)
function stepDrive(world, run, A, v) {
  const c = A.ctl;
  if (!c || c.k !== 'drive' || v.wreckAt || v.dead) return;
  const drv = v.seats[0] && world.get(v.seats[0]);
  if (!drv || drv.dead) return;
  if (!v.ai || v.ai.kind !== 'actor') v.ai = { kind: 'actor' };   // (someone else's to steer: a club bike taken - bikers.js lets go of it; ours again)
  const r = c.route;
  while (r.length > 1 && Math.hypot(r[0].x - v.x, r[0].y - v.y) < 70) r.shift();
  const wp = r[0], left = Math.hypot(wp.x - v.x, wp.y - v.y);
  const sp = r.length <= 1 && left < 260 && !c.through && !c.pass ? Math.max(70, left * 1.4) : c.speed;   // (pass: on through it at speed - the next leg follows)
  driveToward(world, v, wp.x, wp.y, sp, { ignoreObstacles: !!c.through, ignoreCrossings: !!c.through, ignore: run.vehIds || (run.vehIds = new Set([...run.cast.values()].filter((q) => q.kind === 'veh').map((q) => q.id))) });   // (not braking for the scene's own: racers side by side)
  v.dirDrive = world.tick;   // (driveToward left its v.ai.ctl: vehicles.js re-trims to it between the sub-steps)
}
// an aircraft along its route (the light planes' own stick: airtraffic.js - v.fin, v.autopilot): the nose on the next
// point, its speed held, up or down to the height wanted; a crop duster's mist on while it's low over its field
const wrapA = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
const clampN = (x, a, b) => (x < a ? a : x > b ? b : x);
function stepFly(world, run, A, v) {
  const c = A.ctl;
  if (!c || c.k !== 'fly' || v.wreckAt || v.dead || !v.seats[0]) return;
  const r = c.route;
  while (r.length && Math.hypot(r[0].x - v.x, r[0].y - v.y) < 170) r.shift();
  const fi = v.fin || (v.fin = { tank: false, fwd: 0, turn: 0, climb: 0, hb: false, m: 1, dx: 0, dy: 0 });
  v.autopilot = true;
  const fwd = v.vx * Math.cos(v.a) + v.vy * Math.sin(v.a), alt = v.alt || 0;
  if (r.length) fi.turn = clampN(wrapA(Math.atan2(r[0].y - v.y, r[0].x - v.x) - v.a) * 2, -1, 1);
  else fi.turn = 0;
  fi.fwd = fwd < c.speed - 30 ? 1 : fwd > c.speed + 40 ? -0.3 : 0.3;
  fi.climb = clampN((c.alt - alt) / 60, -0.5, 0.6); fi.m = 1; fi.tank = false; fi.hb = false;
  // the mist (the damage word's bit dusting.js sets for a player's contract): low and quick enough over the ground
  const over = alt - floorAt(world.map, v.x, v.y);
  v.dirSpray = c.spray;
  v.lightB = c.spray && over > FLY.AIRBORNE && over <= DUST.alt && Math.hypot(v.vx, v.vy) >= DUST.minSpd * 0.8 ? 64 : 0;
}
// a vehicle bailed out of: on it rolls at the speed it had until it hits something (bail: runaway)
function stepRunaway(world, v) {
  const R = v.runaway, now = world.time;
  if (!R || v.wreckAt || now > R.until) { v.runaway = null; return; }
  const sp = Math.hypot(v.vx, v.vy);
  if (sp < R.speed * 0.55) { v.runaway = null; return; }   // (it hit something)
  if (sp < R.speed) { const k = R.speed / Math.max(1, sp); v.vx *= k; v.vy *= k; }
  v.input = { throttle: 0, steer: 0, hb: false };
}

// ---- beats ------------------------------------------------------------------------------------------------------------------
function members(run, who) { if (who === 'all') return [...run.cast.keys()]; if (run.groups.has(who)) return run.groups.get(who); return run.cast.has(who) ? [who] : []; }
const entOf = (world, run, cid) => { const A = run.cast.get(cid); return A ? world.get(A.id) : null; };
// the vehicle a cast id means: itself, or the one they're in
const vehOf = (world, run, cid) => { const e = entOf(world, run, cid); return !e ? null : e.kind === K.VEH ? e : e.vehId ? world.get(e.vehId) : null; };
// the person a cast id means: itself, or whoever is at its wheel
const pedOf = (world, run, cid) => { const e = entOf(world, run, cid); return !e ? null : e.kind === K.PED ? e : e.seats && e.seats[0] ? world.get(e.seats[0]) : null; };
function unborrow(world, A) { A.ctl = null; if (A.borrowed) { A.borrowed = false; const e = world.get(A.id); if (e && e.npc) e.npc.driven = false; } }
function takeCtl(run, A, d) { if (A.ctl && A.ctl.beat && A.ctl.beat !== d.beat) A.ctl.beat.st = 'done'; A.ctl = d; }
const pt = (world, run, spec) => () => pointOf(spec, ctxOf(world, run));

// start beat B; returns true when it's done at once
function begin(world, run, B) {
  const b = B.b, now = world.time, t = (world.tick - run.tick0) * DT;
  B.t0 = t;
  if (b.id) { run.beatAt[b.id] = t; for (const p of run.viewers) if (p.conn) p.conn.sendJSON({ t: 'dscene', seq: run.seq, bt: { [b.id]: +t.toFixed(3) } }); }   // (the camera's shots on this beat: the page's camera too)
  const who = b.who !== undefined ? members(run, b.who) : [];
  switch (b.do) {
    case 'walk': case 'run': case 'face': {
      if (b.to && b.to.alley !== undefined) {   // (a way out of sight near someone: worked out now, an anchor from now on)
        const e = entOf(world, run, b.to.alley);
        if (e) { run.anchors.alley = { ...alleyNear(world.map, e.x, e.y), a: 0 }; for (const p of run.viewers) tell(world, run, p); }
      }
      const spec = b.to && b.to.alley !== undefined ? 'alley' : b.to;
      B.d = { n: 0 };
      for (const cid of who) {
        const A = run.cast.get(cid), e = world.get(A.id);
        if (!alive(e) || e.kind !== K.PED) continue;
        if (b.do === 'face') { const q = pointOf(spec, ctxOf(world, run)); if (q) e.a = Math.atan2(q.y - e.y, q.x - e.x); continue; }
        if (A.scripted) takeCtl(run, A, { k: 'move', run: b.do === 'run', pt: pt(world, run, spec), beat: B });
        else { const q = pointOf(spec, ctxOf(world, run)); if (q && e.npc) { e.npc.guard = { x: q.x, y: q.y, a: e.a, run: b.do === 'run' }; e.npc.state = 'wander'; } }
        B.d.n++;
      }
      return b.do === 'face' || B.d.n === 0;
    }
    case 'drive': {
      const v = vehOf(world, run, b.who);
      if (!v) return true;
      const A = run.cast.get(b.who);
      const to = pointOf(b.to, ctxOf(world, run));
      if (!to) return true;
      const route = b.direct || b.straight ? [to] : (planRoute(world, v.x, v.y, to.x, to.y) || []).map((q) => ({ x: q.x, y: q.y }));   // (straight: along the road it's on, minding what's in the way; direct: through anything)
      if (!route.length || Math.hypot(route[route.length - 1].x - to.x, route[route.length - 1].y - to.y) > 200) route.push(to);
      v.ai = { kind: 'actor' }; v.parked = false; v.dirHold = true;
      const ctl = { k: 'drive', route, speed: (b.speed ?? 0.9) * v.def.max, through: !!b.direct, pass: !!b.pass, beat: B, vid: v.id };
      takeCtl(run, A, ctl);
      B.d = { A };
      return false;
    }
    case 'fly': {
      const v = vehOf(world, run, b.who), A = run.cast.get(b.who);
      if (!v || v.def.kind !== 'air') return true;
      const ctx = ctxOf(world, run), route = [...(b.route || []).map((q) => pointOf(q, ctx)).filter(Boolean)];
      const to = pointOf(b.to, ctx);
      if (to && !(route.length && Math.hypot(route[route.length - 1].x - to.x, route[route.length - 1].y - to.y) < 40)) route.push(to);
      v.autopilot = true; v.parked = false; v.dirHold = true;
      takeCtl(run, A, { k: 'fly', route, alt: b.alt ?? 150, speed: (b.speed ?? 0.7) * v.def.max, spray: !!b.spray, beat: B, vid: v.id });
      B.d = { A };
      return !route.length;
    }
    case 'enter': {
      const A = run.cast.get(who[0]), e = A && world.get(A.id), v = vehOf(world, run, b.veh);
      if (!alive(e) || !v) return true;
      takeCtl(run, A, { k: 'move', run: true, pt: () => ({ x: v.x + Math.cos(v.a + Math.PI / 2) * (v.def.W / 2 + 12), y: v.y + Math.sin(v.a + Math.PI / 2) * (v.def.W / 2 + 12) }), beat: B });
      B.d = { A, vid: v.id };
      return false;
    }
    case 'exit': case 'bail': {
      for (const cid of who) {
        const e = pedOf(world, run, cid);
        if (!alive(e) || !e.vehId) continue;
        const v = world.get(e.vehId), sp = v ? Math.hypot(v.vx, v.vy) : 0;
        if (b.do === 'bail' && v) { v.runaway = { speed: sp, until: now + 6 }; v.input = { throttle: 0, steer: 0, hb: false }; }
        vehicles.exitVehicle(world, e);
        const A = run.cast.get(cid); if (A && A.kind === 'ped') A.ctl = null;
      }
      return true;
    }
    case 'attack': case 'shoot': {
      const tgs = b.target !== undefined && run.groups.has(b.target) ? members(run, b.target).map((cid) => entOf(world, run, cid)).filter(alive) : null;   // (a group at a group: each their own man)
      let t = b.target !== undefined && !tgs ? (b.do === 'shoot' && vehOf(world, run, b.target)) || entOf(world, run, b.target) : null;
      B.d = { list: [] };
      for (const [k, cid] of who.entries()) {
        if (tgs) t = tgs.length ? tgs[k % tgs.length] : null;
        const A = run.cast.get(cid), e = world.get(A.id);
        if (!alive(e) || e.kind !== K.PED) continue;
        if (b.gun) e.weapon = b.gun;
        if (A.scripted && t) { const c = { k: b.do, target: t.id, beat: B, landed: 0, fired: 0 }; takeCtl(run, A, c); B.d.list.push(c); }
        else if (t && t.kind === K.PED && e.npc) startFight(world, e, t, b.max || 20);
        else if (t && e.npc) { const c = { k: 'shoot', target: t.id, beat: B, fired: 0 }; A.ctl = c; B.d.list.push(c); A.borrowed = true; e.npc.driven = true; }   // (a vehicle to shoot at: theirs to aim for the beat)
      }
      return !B.d.list.length;
    }
    case 'knock': {
      const e = pedOf(world, run, b.who), t = pedOf(world, run, b.target);
      if (!alive(e) || !alive(t)) return true;
      const aim = Math.atan2(t.y - e.y, t.x - e.x);
      e.a = aim;
      world.emit(e.x, e.y, { e: 'hit', x: t.x, y: t.y, a: aim, id: t.id, w: 0 });
      world.emit(t.x, t.y, { e: 'knockdown', x: t.x, y: t.y, id: t.id });
      t.downUntil = Math.max(t.downUntil || 0, now + (b.s || 3.5)); t.rollT = 0;
      t.vx = Math.cos(aim) * 160; t.vy = Math.sin(aim) * 160;
      combat.damage(world, t, b.n || 30, e, 'melee', aim);
      return true;
    }
    case 'say': for (const cid of who) say(world, run, entOf(world, run, cid), b.text); return true;
    case 'emote': for (const cid of who) emote(world, run, entOf(world, run, cid), b.e); return true;
    case 'spawn': castOne(world, run, b.group); run.castVer++; for (const p of run.viewers) tell(world, run, p); return true;
    case 'explode': {
      const v = b.target !== undefined ? vehOf(world, run, b.target) : null;
      if (v && !v.wreckAt) { v.dirHold = false; vehicles.explode(world, v, null); return true; }
      const q = b.to !== undefined ? pointOf(b.to, ctxOf(world, run)) : null;
      if (q) explosions.blastAt(world, q.x, q.y, blastSize(VEHICLES[b.size || 'tanker'] || VEHICLES.tanker), null);
      return true;
    }
    case 'ignite': {
      for (const cid of members(run, b.target)) {
        const v = vehOf(world, run, cid);
        if (!v || v.wreckAt || v.dead) continue;
        vehicles.killEngine(world, v, null);
        v.deadFireAt = now; v.deadBoomAt = now + (b.s ?? 2);
      }
      return true;
    }
    case 'damage': {
      for (const cid of members(run, b.target)) {
        const e = entOf(world, run, cid);
        if (!alive(e)) continue;
        if (e.kind === K.VEH) vehicles.damageVehicle(world, e, b.n, null); else combat.damage(world, e, b.n, null, 'blunt');
      }
      return true;
    }
    case 'crash': {
      const v = vehOf(world, run, b.who);
      if (!v || v.wreckAt) return true;
      for (const A of run.cast.values()) if (A.ctl && A.ctl.vid === v.id) { if (A.ctl.beat) A.ctl.beat.st = 'done'; A.ctl = null; }
      const side = (hash(`${run.seq}${b.who}`) & 1) ? 1 : -1;
      v.av = (v.av || 0) + side * 3.2;
      v.input = { throttle: 0, steer: side, hb: true };
      v.ai = { kind: 'actor' };
      vehicles.damageVehicle(world, v, (v.def.hp || 100) * 0.55, null);
      vehicles.killEngine(world, v, null);
      v.deadBoomAt = now + 30; v.deadFireAt = now + 6;   // (smoking where it stopped; it goes up later, the scene long gone by then)
      world.emit(v.x, v.y, { e: 'crash', x: v.x, y: v.y, p: 1 });
      return true;
    }
    case 'club': {
      const t = pedOf(world, run, b.target);
      if (!alive(t)) return true;
      bikers.ensureUp(world);
      bikers.chaseWith(world, t, b.clubs || 2);
      return true;
    }
    case 'police': {
      const tv = vehOf(world, run, b.target), crook = pedOf(world, run, b.target);
      if (!tv || !crook) return true;
      if (!(b.units || []).length) { if (!police.carChasers(world, tv).length) police.chaseCar(world, tv); }   // (a squad car in from out of sight: the police's own pursuit)
      for (const cid of b.units || []) {
        const v = vehOf(world, run, cid);
        if (!v || v.wreckAt) continue;
        v.ai = { kind: 'police', target: null, vehTarget: tv.id, since: now, seenAt: now, lx: tv.x, ly: tv.y, mode: 'drive', route: null, routeAt: 0, force: 'police' };
        v.sirenOn = true; v.parked = false; v.dirHold = false; v.despawnable = false;
        (world.police ||= new Set()).add(v.id);
        const A = run.cast.get(cid); if (A) { A.scripted = false; A.ctl = null; }
      }
      crook.npc.flagged = true; crook.npc.getaway = true;
      return true;
    }
    case 'heli': {
      const t = pedOf(world, run, b.target);
      if (!alive(t)) return true;
      const back = run.anchors.start || t;
      const v = policeair.launchFor(world, t, { from: { x: back.x - 500, y: back.y - 900 }, until: world.time + run.sc.len + 30 });
      if (v) { const A = addActor(run, 'heli', v, { veh: 'policeheli' }, false); A.own = true; run.castVer++; for (const p of run.viewers) tell(world, run, p); }
      return true;
    }
    case 'dance': {
      for (const cid of who) { const e = entOf(world, run, cid); if (alive(e) && e.kind === K.PED) { e.gt = 'dance'; e.dm = hash(cid) % 6; e.appVer = (e.appVer || 0) + 1; } }
      B.d = { who };
      return false;
    }
    case 'wait': B.d = null; return false;
    case 'release': for (const cid of who) release(world, run, run.cast.get(cid), null); return true;
    default: return true;
  }
}
// a running beat, each tick: true when it's done
function stepBeat(world, run, B) {
  const b = B.b, t = (world.tick - run.tick0) * DT, el = t - B.t0;
  if (B.st === 'done') return true;
  const max = b.max ?? (b.do === 'wait' ? b.s : b.do === 'dance' ? b.s || 6 : b.do === 'attack' || b.do === 'shoot' ? ATTACK_MAX_S : MOVE_MAX_S);
  if (el >= max) return true;
  switch (b.do) {
    case 'walk': case 'run': {
      let left = 0;
      for (const cid of members(run, b.who)) {
        const A = run.cast.get(cid), e = world.get(A.id);
        if (!alive(e) || !A.scripted) {
          if (alive(e) && e.npc && e.npc.guard && Math.hypot(e.x - e.npc.guard.x, e.y - e.npc.guard.y) > 16) left++;
          continue;
        }
        const q = A.ctl && A.ctl.beat === B ? A.ctl.pt() : null;
        if (q && Math.hypot(q.x - e.x, q.y - e.y) > 16) left++;
        else if (A.ctl && A.ctl.beat === B) A.ctl = null;
      }
      return left === 0;
    }
    case 'drive': {
      const A = B.d.A, c = A.ctl;
      if (!c || c.beat !== B) return true;
      const v = world.get(c.vid);
      if (!v || v.wreckAt || !v.seats[0]) return true;
      const r = c.route, last = r[r.length - 1];
      if (r.length <= 1 && Math.hypot(last.x - v.x, last.y - v.y) < (c.through ? 50 : c.pass ? 110 : 70)) { if (!c.through && !c.pass) { v.input = { throttle: 0, steer: 0, hb: true }; } A.ctl = null; return true; }
      return false;
    }
    case 'fly': { const A = B.d.A; return !A.ctl || A.ctl.beat !== B || !A.ctl.route.length; }
    case 'enter': {
      const { A, vid } = B.d, e = world.get(A.id), v = world.get(vid);
      if (!alive(e) || !v || v.wreckAt) return true;
      if (e.vehId === v.id) return true;
      if (Math.hypot(e.x - v.x, e.y - v.y) > v.def.L / 2 + 30) return false;
      const d = v.seats[0] ? world.get(v.seats[0]) : null;
      if (d && d !== e) { vehicles.ejectPed(world, d, true); if (d.npc) onCarjacked(world, d, e); }
      seat(world, e, v, 0);
      v.parked = false; v.ai = { kind: 'actor' }; v.dirHold = true;
      world.emit(v.x, v.y, { e: v.def.kind === 'bike' ? 'mount' : 'door', x: v.x, y: v.y });
      if (A.ctl && A.ctl.beat === B) A.ctl = null;
      return true;
    }
    case 'attack': case 'shoot': {
      let busy = 0;
      for (const c of B.d.list) {
        const tg = world.get(c.target);
        const done = !alive(tg) || (tg.kind === K.PED && b.until === 'down' && world.time < tg.downUntil) || (b.hits && c.landed >= b.hits) || (b.do === 'shoot' && c.fired >= (b.n || 4)) || (tg.kind === K.VEH && tg.wreckAt);
        if (!done) busy++;
      }
      if (!busy) for (const A of run.cast.values()) if (A.ctl && A.ctl.beat === B) unborrow(world, A);
      return !busy;
    }
    case 'dance': if (el >= (b.s || 6)) { for (const cid of B.d.who) { const e = entOf(world, run, cid); if (e && e.gt === 'dance') { e.gt = null; e.dm = null; e.appVer = (e.appVer || 0) + 1; } } return true; } return false;
    case 'wait': {
      const u = b.until, cid = u && (u.stop ?? u.hit);
      if (cid !== undefined) {   // (stop: it's come (nearly) to a stop; hit: it's run into something - a knock, or its speed gone in a moment)
        const v = vehOf(world, run, cid), sp = v ? Math.hypot(v.vx, v.vy) : 0;
        B.d ||= { top: sp, last: sp, hp: v ? v.hp : 0 };
        B.d.top = Math.max(B.d.top, sp);
        if (!v || v.wreckAt) return true;
        if (el > 0.15 && (sp < 60 || sp < B.d.top * 0.35)) return true;
        if (u.hit !== undefined && el > 0.1 && (v.hp < B.d.hp - v.def.hp * 0.06 || sp < B.d.last * 0.86)) return true;
        B.d.last = sp;
      }
      return el >= b.s;
    }
    default: return true;
  }
}

// ---- what actors say and do ---------------------------------------------------------------------------------------------
// a line out loud: from a player-actor (capture), a chat line as a player's - its bubble over their head; from anyone else,
// an NPC's spoken word (the 'say' event every page near draws)
function say(world, run, e, text) {
  if (!alive(e)) return;
  if (e.asPlayer) {
    const out = { t: 'chat', ch: 'near', n: e.asPlayer.name, id: `actor${hash(e.asPlayer.name).toString(16)}`, eid: e.id, text: String(text).slice(0, CHAT.maxLen), at: Date.now() };
    for (const p of world.players.values()) if (p.conn && p.ped && Math.hypot(p.ped.x - e.x, p.ped.y - e.y) <= CHAT.nearM * TILE * 2 + (p.dirCam ? 2000 : 0)) p.conn.sendJSON(out);
    return;
  }
  world.emit(e.x, e.y, { e: 'say', id: e.id, x: Math.round(e.x), y: Math.round(e.y), text: String(text) });
}
function emote(world, run, e, id) {
  if (!alive(e)) return;
  if (emoteSys && emoteSys.play) { try { emoteSys.play(world, { ped: e }, id); } catch (err) { world.reportError('director emote', err); } }
  if (e.asPlayer) {
    const out = { t: 'emote', eid: e.id, e: id, n: e.asPlayer.name, id: `actor${hash(e.asPlayer.name).toString(16)}` };
    for (const p of world.players.values()) if (p.conn && p.ped && Math.hypot(p.ped.x - e.x, p.ped.y - e.y) <= CHAT.nearM * TILE * 2 + (p.dirCam ? 2000 : 0)) p.conn.sendJSON(out);
  }
}

// ---- off the script ---------------------------------------------------------------------------------------------------------
// the city's own AI from now: a person goes back to what people do (fighting whoever hurt them: npc.onAttacked), a driver
// drives on in traffic; `by` the player who did it, if it was one
export function release(world, run, A, by, ended = false) {
  if (!A) return;
  const e = world.get(A.id);
  A.scripted = false; A.ctl = null;
  if (!e || e.removed) return;
  if (e.kind === K.PED) {
    if (e.npc) { e.npc.driven = false; if (ended && A.own) e.npc.keep = false; if (e.gt === 'dance') { e.gt = null; e.appVer = (e.appVer || 0) + 1; } }
    const v = e.vehId ? world.get(e.vehId) : null;
    if (v && v.seats[0] === e.id && v.ai && v.ai.kind === 'actor' && !v.wreckAt && !v.dead && v.def.kind !== 'air') { v.dirHold = false; try { joinTraffic(world, v); } catch { v.ai = null; } }
    if (by && e.npc && !e.dead) onAttacked(world, e, by);
  } else {
    e.dirHold = false;
    if (ended && A.own) e.despawnable = true;   // (not one picked from the world: a club's bike stays the club's)
    const d = e.seats && e.seats[0] ? world.get(e.seats[0]) : null;
    if (e.ai && e.ai.kind === 'actor') { if (d && d.npc && !e.wreckAt && !e.dead && e.def.kind !== 'air') { try { joinTraffic(world, e); } catch { e.ai = null; } } else e.ai = null; }
  }
}
// someone and what they're in (or a vehicle and whoever's at its wheel) off the script together
function releaseUnit(world, run, e, by) {
  const ids = new Set([e.id]);
  if (e.kind === K.PED && e.vehId) ids.add(e.vehId);
  if (e.kind === K.VEH && e.seats && e.seats[0]) ids.add(e.seats[0]);
  for (const A of run.cast.values()) if (ids.has(A.id) && (A.scripted || A.borrowed)) { A.borrowed = false; release(world, run, A, by && world.get(A.id)?.kind === K.PED ? by : null); }
}
// a real player hurting, aiming at or standing in the way of a scripted actor: off the script, the city's AI from now
function handOver(world, run, A) {
  const e = world.get(A.id);
  if (!e || e.removed) return;
  const now = world.time;
  const isPl = (id) => { const q = id && world.get(id); return q && q.player && !q.player.capView ? q : null; };
  if (A.kind === 'ped') {
    if ((e.lastHitAt || 0) > A.hitAt) { A.hitAt = e.lastHitAt; const by = isPl(e.lastHitBy); if (by) return releaseUnit(world, run, e, by); }
  }
  const v = A.kind === 'veh' ? e : e.vehId ? world.get(e.vehId) : null;
  if (v) {
    if (v.lastAttacker && v.hp < (A.vhp ?? v.hp)) { const by = isPl(v.lastAttacker); A.vhp = v.hp; if (by) return releaseUnit(world, run, e, by); }
    A.vhp = v.hp;
  }
  const H = DIRECTOR.handPx;
  for (const p of world.players.values()) {
    const q = p.ped;
    if (!q || q.dead || p.capView || q.hidden) continue;
    const d = Math.hypot(q.x - e.x, q.y - e.y);
    if (d > H) continue;
    // aiming at them
    if (now < (q.aimUntil || 0)) { const da = Math.atan2(e.y - q.y, e.x - q.x) - (q.aimAngle || 0); if (Math.abs(Math.atan2(Math.sin(da), Math.cos(da))) < 0.3) return releaseUnit(world, run, e, q); }
    // in their way: on their script's move, no nearer for blockS, the player (or the player's vehicle) right there
    if (A.ctl && (A.ctl.k === 'move' || A.ctl.k === 'drive') && d < 120) {
      const to = A.ctl.k === 'move' ? A.ctl.pt() : A.ctl.route[0];
      if (!to) continue;
      const left = Math.hypot(to.x - e.x, to.y - e.y);
      if (!A.prog || left < A.prog.d - 8) A.prog = { d: left, at: now };
      else if (now - A.prog.at > DIRECTOR.blockS) return releaseUnit(world, run, e, null);
    }
  }
}

// ---- the run, each tick -------------------------------------------------------------------------------------------------------
function stepRun(world, run, dt) {
  if (run.held) run.tick0 = world.tick;   // (the capture's: held at its first moment - its clock not running - till /capture/go)
  const t = (world.tick - run.tick0) * DT;
  if (run.held) { viewCam(world, run, 0, dt); for (const p of run.viewers) if (world.tick % 20 === 0) tell(world, run, p); return; }
  // the beats: started when their time comes, stepped until done
  let open = 0;
  for (const B of run.beats) {
    if (B.st === 'done') continue;
    open++;
    if (B.st === 'wait') {
      const b = B.b;
      let go;
      if (b.at !== undefined) go = t >= b.at;
      else {
        const prev = b.after !== undefined ? run.beats.find((q) => q.b.id === b.after) : run.beats[B.i - 1];
        go = !prev || (prev.st === 'done' && t >= prev.tEnd + (b.wait || 0));
      }
      if (!go) continue;
      B.st = 'run';
      if (begin(world, run, B)) { B.st = 'done'; B.tEnd = t; continue; }
    }
    if (B.st === 'run' && stepBeat(world, run, B)) {
      B.st = 'done'; B.tEnd = t;
      for (const A of run.cast.values()) if (A.ctl && A.ctl.beat === B) unborrow(world, A);
    }
  }
  // the scripted actors
  for (const A of run.cast.values()) {
    const e = world.get(A.id);
    if (!e || e.removed) continue;
    if (A.scripted || A.borrowed) handOver(world, run, A);
    // plot armour (a cast entry's plot: true): while on the script, never floored or stunned by the city's people, never
    // below a third of their health - they still take the blows (and a player's are noticed: handOver)
    if (A.scripted && A.spec.plot && A.kind === 'ped' && !e.dead) { e.downUntil = Math.min(e.downUntil || 0, world.time); e.stunUntil = Math.min(e.stunUntil || 0, world.time); e.staggerUntil = 0; if (e.hp < e.maxHp * 0.34) e.hp = e.maxHp * 0.34; }
    if (!A.scripted && !A.borrowed) { if (A.kind === 'veh' && e.runaway) stepRunaway(world, e); continue; }
    if (A.kind === 'ped') {
      if (e.vehId) { const v = world.get(e.vehId); if (v && A.ctl && A.ctl.k === 'fly') stepFly(world, run, A, v); else if (v && A.ctl && A.ctl.k === 'drive') stepDrive(world, run, A, v); else if (v && v.def.kind === 'air') { /* (up in the air between beats: on as it was) */ } else if (v && v.seats[0] === e.id && v.ai && v.ai.kind === 'actor' && !v.runaway && v.dirDrive !== world.tick && !v.dead) v.input = { throttle: 0, steer: 0, hb: true }; }   // (at the wheel with nowhere to go: waiting, on the brake)
      else if (A.borrowed && A.ctl) stepFoot(world, run, A, e, dt);
      else if (A.scripted) stepFoot(world, run, A, e, dt);
    } else {
      if (e.runaway) stepRunaway(world, e);
      if (A.ctl && A.ctl.k === 'drive') stepDrive(world, run, A, e);
      else if (A.ctl && A.ctl.k === 'fly') stepFly(world, run, A, e);
    }
  }
  // over: the beats all done (and the linger after), or its time up
  if (!open && !run.endAt) run.endAt = t + (run.sc.linger ?? 3);
  if ((run.endAt && t >= run.endAt) || t >= run.sc.len) return end(world, run, 'done');
  // live: nobody near any more
  if (run.mode === 'live' && world.tick % 20 === 0) {
    const pts = [...run.cast.values()].map((A) => world.get(A.id)).filter((e) => e && !e.removed);
    const any = [...world.players.values()].some((p) => p.ped && !p.ped.dead && pts.some((e) => Math.hypot(e.x - p.ped.x, e.y - p.ped.y) < DIRECTOR.farPx));
    if (any) run.lastNear = world.time;
    else if (world.time - run.lastNear > DIRECTOR.goneS) return end(world, run, 'gone');
  }
  viewCam(world, run, t, dt);
}
// the viewers' camera: the script's shot now (view.js sends them what's round it)
function viewCam(world, run, t, dt) {
  const cam = camAt(run.sc, t, ctxOf(world, run), run.camPrev);
  if (cam) {
    const pv = run.camPrev;
    run.camPrev = { x: cam.x, y: cam.y, z: cam.z };
    for (const p of run.viewers) {
      if (!p.ped) continue;
      p.dirCam = { x: cam.x, y: cam.y, z: cam.z, vx: pv ? (cam.x - pv.x) / dt : 0, vy: pv ? (cam.y - pv.y) / dt : 0, player: p, cine: true };
      // the capture's page: its own character out of sight, where the camera is (the city's "near a player" is the camera)
      if (p.capView && p.ped && !p.ped.vehId) { p.ped.hidden = true; p.ped.x = cam.x; p.ped.y = cam.y; p.ped.vx = 0; p.ped.vy = 0; }
    }
  }
}
export function end(world, run, why = 'done') {
  if (run.over) return;
  run.over = true; run.why = why;
  world.dirLast = { id: run.id, seq: run.seq, why, t: +((world.tick - run.tick0) * DT).toFixed(2) };
  const st = D(world);
  st.runs = st.runs.filter((r) => r !== run);
  for (const A of run.cast.values()) release(world, run, A, null, true);
  // live, nobody near: its people gone now if nobody can see them (the rest go as the city's own do)
  if (why === 'gone') for (const A of run.cast.values()) {
    const e = world.get(A.id);
    if (!e || e.removed || !A.own || inAnyView(world, e.x, e.y, 80)) continue;
    if (e.kind === K.PED && !e.vehId) despawnNpc(world, e);
    else if (e.kind === K.VEH && !e.seats.some((s) => s && world.get(s)?.player)) { for (const s of e.seats) { const q = s && world.get(s); if (q) despawnNpc(world, q); } world.remove(e); }
  }
  for (const A of run.cast.values()) { const e = world.get(A.id); if (A.own && e && !e.removed && e.kind === K.VEH && e.def.kind === 'air') (st.strays ||= []).push(e.id); }   // (an autoplay's aircraft flies on: put away once out of sight)
  for (const p of run.viewers) { if (p.capView) continue; p.dirCam = null; p.dirRun = 0; if (p.conn) p.conn.sendJSON({ t: 'dscene', off: 1, seq: run.seq, why }); }
}
// the capture's held scene: its clock from now (server/capture.js /capture/go)
export function go(world) { for (const r of D(world).runs) if (r.held) { r.held = false; r.tick0 = world.tick; for (const p of r.viewers) tell(world, r, p); } }
export function stopAll(world) { for (const run of [...D(world).runs]) end(world, run, 'stopped'); }

// ---- live events: now and then, near someone --------------------------------------------------------------------------------
const inFtue = (p) => { const f = p.profile && p.profile.ftue; if (!f) return false; if (f.st === 'pick' || f.st === 'arrive' || f.st === 'ask' || f.st === 'goal') return true; const at = f.at && (f.at.arrive || f.at.pick); return !!at && Date.now() - at < DIRECTOR.ftueS * 1000; };
const actorsOut = (world) => { let n = 0; for (const r of D(world).runs) n += r.cast.size; return n; };
const castSize = (sc) => (sc.cast || []).reduce((n, c) => n + (c.group || 1) + (c.crew ? 2 : 0), 0) + (sc.beats || []).reduce((n, b) => n + (b.do === 'spawn' && b.group ? b.group.group || 1 : 0), 0);
function schedule(world) {
  const st = D(world), now = world.time;
  if (!st.nextAt) { st.nextAt = now + DIRECTOR.everyS[0]; return; }
  if (now < st.nextAt) return;
  st.nextAt = now + DIRECTOR.everyS[0] + world.rand() * (DIRECTOR.everyS[1] - DIRECTOR.everyS[0]);
  tryLive(world);
}
// one live scene now, if one fits: returns the run or null (the tests call it straight)
export function tryLive(world, force = null) {
  const st = D(world), now = world.time;
  if (st.runs.filter((r) => r.mode === 'live').length >= DIRECTOR.maxScenes) return null;
  const ids = (force ? [force] : SCENE_LIST.map((s) => s.id)).filter((id) => liveOn(id) && now - (st.cool[id] ?? -1e9) >= (DIRECTOR.scenes[id] || {}).cooldownS);
  const ps = [...world.players.values()].filter((p) => p.conn && p.ped && !p.ped.dead && !p.ped.hidden && !p.ped.interior && !p.ped.ug && !p.capView);
  const ftue = ps.filter(inFtue), who = ps.filter((p) => !inFtue(p));
  if (!ids.length || !who.length) return null;
  const pick = (arr, w = null) => { if (!w) return arr[Math.floor(world.rand() * arr.length)]; const tot = arr.reduce((s, x) => s + w(x), 0); let r = world.rand() * tot; for (const x of arr) { r -= w(x); if (r <= 0) return x; } return arr[arr.length - 1]; };
  for (let k = 0; k < 4 && ids.length; k++) {
    const id = pick(ids, (q) => (DIRECTOR.scenes[q] || {}).weight || 1), sc = SCENES[id];
    if (actorsOut(world) + castSize(sc) > DIRECTOR.maxActors) { ids.splice(ids.indexOf(id), 1); continue; }
    // (somewhere they'll see it from the street - not on top of anyone)
    const avoid = (x, y) => ps.some((q) => Math.hypot(q.ped.x - x, q.ped.y - y) < DIRECTOR.nearPx[0] + 200);
    const p = pick(who), resolve = PLACES[sc.place.k], pl = resolve ? resolve(world, sc.place, { x: p.ped.x, y: p.ped.y }, { avoid, maxD: DIRECTOR.nearPx[1] }) : null;
    if (!pl) { ids.splice(ids.indexOf(id), 1); continue; }
    const pts = Object.values(pl.anchors), mid = pl.at || pts[0];
    const d = Math.min(...ps.map((q) => Math.hypot(q.ped.x - mid.x, q.ped.y - mid.y)));
    if (d < DIRECTOR.nearPx[0] || d > DIRECTOR.nearPx[1]) continue;
    if (ftue.some((q) => pts.some((a) => Math.hypot(q.ped.x - a.x, q.ped.y - a.y) < DIRECTOR.ftuePx))) continue;   // (never by someone in their first minutes)
    const r = start(world, id, { mode: 'live', ref: { x: p.ped.x, y: p.ped.y }, place: pl });
    return r.run || null;
  }
  return null;
}

// ---- each tick (world.js SYSTEMS: after the police and the clubs, before the vehicles move) -----------------------------
export function update(world, dt) {
  const st = D(world);
  if (anyLive() && !world.capture && world.tick % 20 === 13) schedule(world);
  if (st.strays && st.strays.length && world.tick % 20 === 3) st.strays = st.strays.filter((id) => {
    const v = world.get(id);
    if (!v || v.removed) return false;
    if (inAnyView(world, v.x, v.y, 300)) return true;
    for (const s of v.seats) { const q = s && world.get(s); if (q && !q.player) despawnNpc(world, q); }
    if (!v.seats.some((s) => s && world.get(s)?.player)) world.remove(v);
    return false;
  });
  for (const run of [...st.runs]) { try { stepRun(world, run, dt); } catch (err) { world.reportError('director run', err); end(world, run, 'error'); } }
}
