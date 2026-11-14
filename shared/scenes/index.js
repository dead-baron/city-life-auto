// The scene director's scripts (the owner, 2026-11-13: "the occasional gang warfare breaks out, a random police raid, an NPC
// gets into a bar fight and gets chased by a biker gang ..."). Each scene is a short script written once and used two ways:
// played in the shared city now and then (server/systems/director.js: live events, and the debug menu's 'scene'), and on
// a private capture server for trailers (CLA_CAPTURE=1, tools/capture.mjs) - the same seed, the same take.
// A script is data:
//   id, n (its name), g (the panel's group), len (seconds at most), linger (seconds on after the last beat)
//   place: where it happens - { k: 'roadhouse' | 'hideout' | 'road' | 'here' | 'xy', ... } (the server's resolver, director.js
//     PLACES, turns it into anchors: named points { x, y, a } the rest of the script refers to)
//   time, weather: the time of day (minutes after midnight) and the weather - the capture's; live, the world's own
//   cast: [{ id, ...}] - a person ({ arch, role, name, look: 'player', at, a, weapon, hp }), a vehicle ({ veh: model,
//     at, a, paint, parked, driver: castId }), a group ({ group: n, arch, role, at, spread, weapon }), or someone already
//     in the world ({ pick: 'biker' | 'clubbike', near }). look 'player': drawn as a player (name tag, a player's clothes,
//     chat bubbles) - in capture mode only; in the live world every actor is an ordinary NPC (the owner, 11-13: never
//     anything that passes for a real player there). plot: true - plot armour while on the script (never floored or stunned,
//     never below a third of their health)
//   beats: [{ id?, who, do, ...args, at? | after?, wait? }] - each starts at `at` seconds, or `wait` seconds after the beat
//     `after` (its id; by default the one before it) is done. BEATS below has each kind and what it needs.
//   cam: [{ at | on (a beat's id: when it starts, d seconds after), follow | move | hold | between | orbit (round a point at
//     r, from angle a0 to a1 over dur), z, lead, f, s, dx, dy,
//     ease, cut, dur }] - the camera's shots (at: in time order)
//     (camAt: where it is at a time - the page's camera and the server's view of what that page is sent)
// Points (`to`, `at`, a move's ends): an anchor's name; { a: anchor, f, s, dx, dy } (f forward and s to the side along the
// anchor's way, dx dy on the map); { who: castId, f, s, dx, dy }; or [x, y]. A beat's `to` may also be { alley: castId }:
// somewhere off the road out of sight near them, found when the beat starts (the anchor 'alley' from then on).
// Shared by the server and the page: nothing here may use Math.random, or the Math functions while the module loads.
import bikerbrawl from './bikerbrawl.js';
import tankerhideout from './tankerhideout.js';
import helipursuit from './helipursuit.js';
import autochase from './autochase.js';
import autorace from './autorace.js';
import autoshootout from './autoshootout.js';
import autodust from './autodust.js';
import { SHOWCASE_SCENES } from './showcase.js';

// the new scenes, then the autoplay versions of the cinematic panel's staged scenes and Showcase spots (client/director.js
// SCENES' and client/showcase.js's `auto`: the panel offers Autoplay beside Play it yourself)
export const SCENE_LIST = [bikerbrawl, tankerhideout, helipursuit, autochase, autorace, autoshootout, autodust, ...SHOWCASE_SCENES];
export const SCENES = Object.fromEntries(SCENE_LIST.map((s) => [s.id, s]));

// each kind of beat: the fields it needs (who: a cast id; target / veh: a cast id; to / at: a point)
export const BEATS = {
  walk: ['who', 'to'], run: ['who', 'to'],            // on foot to a point (through a building's door when it's the way)
  drive: ['who', 'to'],                               // at the wheel (who: the driver or the vehicle), along the roads to a point; speed (of its top), straight (no route: on along the road it's on), direct (straight there through anything), pass (no slowing at the end: another leg follows)
  enter: ['who', 'veh'],                              // walk up to a vehicle and get in (a driver in it: pulled out - a carjacking)
  exit: ['who'],                                      // out of the vehicle
  bail: ['who'],                                      // dive out of a moving vehicle (it rolls on without them)
  attack: ['who', 'target'],                          // into a fight with them: hits (that many landed) or until they're down; max seconds
  knock: ['who', 'target'],                           // one heavy blow: down on the ground for a few seconds (n: how hard)
  shoot: ['who'],                                     // shots at target (or at a point): n of them
  say: ['who', 'text'],                               // a line said out loud (a chat bubble from a player-actor in capture; an NPC's word in the live world)
  emote: ['who', 'emote'],                            // an emote (shared/chatdefs.js EMOTES)
  face: ['who', 'to'],                                // turn to look at a point
  spawn: ['group'],                                   // more people now: group is a cast entry (a group)
  explode: [],                                        // target: a vehicle blown up; or to: a blast at that point (size: a shared/explosions.js blast size)
  ignite: ['target'],                                 // a vehicle's engine dead and on fire: it goes up in s seconds
  damage: ['target', 'n'],                            // hurt someone or something by n
  crash: ['who'],                                     // a vehicle wrecked where it is: a skid, the engine dead, smoke
  club: ['target'],                                   // the biker clubs at the Rusty Spur mount up after target (clubs: how many)
  police: ['target'],                                 // units (cast ids of police cars) chase target - the police's own pursuit from then on
  heli: ['target'],                                   // the police air unit picks target up from the air
  dance: ['who'],                                     // dance where they are (s seconds)
  fly: ['who', 'to'],                                 // an aircraft (who: it or its pilot) flown along route (points) to `to` at alt px up, speed (of its top); spray: the crop duster's mist on
  wait: ['s'],                                        // a pause: s seconds at most - until: { stop: castId } / { hit: castId } over sooner when that vehicle's (nearly) stopped / has run into something
  release: ['who'],                                   // off the script: the city's own AI from now (who: a cast id or 'all')
};
// a line said in a scene: short and quick (the owner, 11-13: "too fast to read anyways" - the bubbles are off by default:
// client/director.js's Speech bubbles)
export const SAY_MAX = 40;
const BEAT_KEYS = new Set(['id', 'who', 'do', 'at', 'after', 'wait', 'to', 'veh', 'target', 'text', 'emote', 'group', 'n', 'hits', 'until', 'max', 'speed', 'direct', 'straight', 'pass', 'alt', 'spray', 'size', 's', 'clubs', 'units', 'gun', 'route', 'note']);
const CAM_KINDS = ['follow', 'move', 'hold', 'between', 'orbit'];

export const pointRefs = (p) => (p && typeof p === 'object' && !Array.isArray(p) ? { a: p.a, who: p.who } : typeof p === 'string' ? { a: p } : {});

// Is this script whole? [] when it is, else what's wrong (test/scenes.test.js runs every scene through it)
export function validateScene(sc) {
  const err = [];
  if (!sc || typeof sc !== 'object') return ['not a scene'];
  if (!/^[a-z][a-z0-9]*$/.test(sc.id || '')) err.push('id: lowercase letters and digits');
  if (!sc.n) err.push('n: a name');
  if (!(sc.len > 0 && sc.len <= 120)) err.push('len: 1-120 seconds');
  if (!sc.place || !sc.place.k) err.push('place: { k }');
  const ids = new Set(), anchors = new Set(sc.anchors || []);
  for (const c of sc.cast || []) {
    if (!c.id || ids.has(c.id)) err.push(`cast: duplicate or missing id ${c.id}`);
    ids.add(c.id);
    const kinds = ['veh', 'group', 'pick'].filter((k) => c[k] !== undefined);
    if (kinds.length > 1 || (!kinds.length && c.arch === undefined)) err.push(`cast ${c.id}: a person (arch), a group, a vehicle (veh) or someone picked (pick)`);
    if (c.in !== undefined && !ids.has(c.in)) err.push(`cast ${c.id}: in ${c.in}: a vehicle cast before them`);
    if (c.look && c.look !== 'player' && c.look !== 'npc') err.push(`cast ${c.id}: look is 'player' or 'npc'`);
    if (c.group !== undefined) for (let i = 0; i < c.group; i++) ids.add(`${c.id}.${i}`);
  }
  for (const b of sc.beats || []) for (const g of b.do === 'spawn' && b.group ? [b.group] : []) {
    if (!g.id || ids.has(g.id)) err.push(`spawn: duplicate or missing id ${g.id}`);
    ids.add(g.id);
    for (let i = 0; i < (g.group || 0); i++) ids.add(`${g.id}.${i}`);
  }
  const known = (id) => ids.has(id) || (typeof id === 'string' && ids.has(id.split('.')[0]));
  const point = (p, where) => {
    if (p === undefined) return;
    if (Array.isArray(p)) { if (p.length !== 2 || !p.every(Number.isFinite)) err.push(`${where}: [x, y]`); return; }
    if (p && typeof p === 'object' && p.alley !== undefined) { if (!known(p.alley)) err.push(`${where}: no cast ${p.alley}`); return; }   // (a way out of sight near someone: found when the beat starts - the server's)
    const r = pointRefs(p);
    if (r.who !== undefined && !known(r.who)) err.push(`${where}: no cast ${r.who}`);
    if (r.a !== undefined && anchors.size && !anchors.has(r.a)) err.push(`${where}: no anchor ${r.a}`);
    if (r.who === undefined && r.a === undefined) err.push(`${where}: a point needs an anchor, a cast id or [x, y]`);
  };
  for (const c of sc.cast || []) point(c.at, `cast ${c.id}.at`);
  const beatIds = new Set();
  (sc.beats || []).forEach((b, i) => {
    const where = `beat ${i} (${b.do})`;
    const need = BEATS[b.do];
    if (!need) { err.push(`${where}: no such beat`); return; }
    for (const k of need) if (b[k] === undefined) err.push(`${where}: needs ${k}`);
    for (const k of Object.keys(b)) if (!BEAT_KEYS.has(k)) err.push(`${where}: unknown field ${k}`);
    for (const k of ['who', 'target', 'veh']) if (b[k] !== undefined && typeof b[k] === 'string' && b[k] !== 'all' && !known(b[k])) err.push(`${where}: no cast ${b[k]}`);
    if (b.units) for (const u of b.units) if (!known(u)) err.push(`${where}: no cast ${u}`);
    point(b.to, `${where}.to`);
    if (b.route) { if (!Array.isArray(b.route)) err.push(`${where}: route [points]`); else b.route.forEach((q, j) => point(q, `${where}.route[${j}]`)); }
    if (b.do === 'explode' && b.target === undefined && b.to === undefined) err.push(`${where}: a target or a point (to)`);
    if (b.after !== undefined && !beatIds.has(b.after)) err.push(`${where}: after ${b.after}: no beat before it by that id`);
    if (b.at !== undefined && !(typeof b.at === 'number' && b.at >= 0 && b.at <= sc.len)) err.push(`${where}: at: seconds into the scene`);
    if (b.id) { if (beatIds.has(b.id)) err.push(`${where}: duplicate id ${b.id}`); beatIds.add(b.id); }
    if (b.do === 'emote' && !/^[a-z]+$/.test(b.emote || '')) err.push(`${where}: emote id`);
    if (b.do === 'say' && String(b.text || '').length > SAY_MAX) err.push(`${where}: a line of at most ${SAY_MAX} characters (a quick one: the bubbles are off unless the camera panel turns them on)`);
    if (b.until && typeof b.until === 'object') for (const k of ['stop', 'hit']) if (b.until[k] !== undefined && !known(b.until[k])) err.push(`${where}: until: no cast ${b.until[k]}`);
  });
  let last = -1;
  (sc.cam || []).forEach((c, i) => {
    const where = `cam ${i}`;
    const k = CAM_KINDS.filter((q) => c[q] !== undefined);
    if (k.length !== 1) err.push(`${where}: one of ${CAM_KINDS.join(', ')}`);
    if (c.on !== undefined) { if (!beatIds.has(c.on)) err.push(`${where}: on ${c.on}: no beat by that id`); }
    else { if (!(c.at >= last)) err.push(`${where}: shots in time order`); last = c.at; }
    if (c.follow !== undefined && !known(c.follow)) err.push(`${where}: no cast ${c.follow}`);
    if (c.between) { if (!Array.isArray(c.between) || c.between.length !== 2) err.push(`${where}: between two`); else for (const q of c.between) if (!known(q)) err.push(`${where}: no cast ${q}`); }
    if (c.move) { if (!Array.isArray(c.move) || c.move.length !== 2) err.push(`${where}: move [from, to]`); else c.move.forEach((p, j) => point(p, `${where}.move[${j}]`)); }
    if (c.hold !== undefined) point(c.hold, `${where}.hold`);
    if (c.orbit !== undefined) { point(c.orbit, `${where}.orbit`); if (!(c.r > 0)) err.push(`${where}: orbit r`); }
  });
  if (!(sc.cam || []).length) err.push('cam: at least one shot');
  return err;
}

// ---- points ---------------------------------------------------------------------------------------------------------
// ctx: { anchors: { name: { x, y, a } }, ent(castId) -> { x, y, a, vx, vy } | null }. null when it can't be placed yet.
export function pointOf(p, ctx) {
  if (p === undefined || p === null) return null;
  if (Array.isArray(p)) return { x: p[0], y: p[1], a: 0 };
  if (typeof p === 'string') { const q = ctx.anchors[p]; return q ? { x: q.x, y: q.y, a: q.a || 0 } : null; }
  const base = p.who !== undefined ? ctx.ent(p.who) : ctx.anchors[p.a];
  if (!base) return null;
  const a = base.a || 0, f = p.f || 0, s = p.s || 0;
  const c = Math.cos(a), sn = Math.sin(a);
  return { x: base.x + c * f - sn * s + (p.dx || 0), y: base.y + sn * f + c * s + (p.dy || 0), a };
}

// ---- the camera -----------------------------------------------------------------------------------------------------
const smooth = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));
// when a shot starts: at (seconds), or d seconds after the beat `on` began (ctx.beatAt(id): its start, once it has)
const shotT = (c, ctx) => (c.on === undefined ? c.at : (ctx && ctx.beatAt ? ctx.beatAt(c.on) ?? Infinity : Infinity) + (c.d || 0));
// the shot in force at t (its index: -1 before the first) - the one that started last
export function shotAt(sc, t, ctx = null) { let i = -1, bt = -Infinity; const C = sc.cam || []; for (let k = 0; k < C.length; k++) { const s = shotT(C[k], ctx); if (s <= t && s >= bt) { i = k; bt = s; } } return i; }
function shotPos(c, t, ctx, prev) {
  if (c.follow !== undefined) {
    const e = ctx.ent(c.follow);
    if (!e) return prev;
    const lead = c.lead ?? 0.45, z = c.z ?? 1;
    const q = pointOf({ who: c.follow, f: c.f, s: c.s, dx: c.dx, dy: c.dy }, ctx) || e;
    return { x: q.x + (e.vx || 0) * lead, y: q.y + (e.vy || 0) * lead, z };
  }
  if (c.between) {
    const a = ctx.ent(c.between[0]), b = ctx.ent(c.between[1]);
    if (!a || !b) return a ? { x: a.x, y: a.y, z: c.z ?? 1 } : b ? { x: b.x, y: b.y, z: c.z ?? 1 } : prev;
    return { x: (a.x + b.x) / 2 + (c.dx || 0), y: (a.y + b.y) / 2 + (c.dy || 0), z: c.z ?? 1 };
  }
  if (c.move) {
    const p0 = pointOf(c.move[0], ctx), p1 = pointOf(c.move[1], ctx);
    if (!p0 || !p1) return prev;
    const u = smooth((t - shotT(c, ctx)) / Math.max(0.1, c.dur || 3));
    const z0 = Array.isArray(c.z) ? c.z[0] : c.z ?? 1, z1 = Array.isArray(c.z) ? c.z[1] : c.z ?? 1;
    return { x: p0.x + (p1.x - p0.x) * u, y: p0.y + (p1.y - p0.y) * u, z: z0 + (z1 - z0) * u };
  }
  if (c.orbit !== undefined) {
    const o = pointOf(c.orbit, ctx);
    if (!o) return prev;
    const u = smooth((t - shotT(c, ctx)) / Math.max(0.1, c.dur || 10)), a = (c.a0 || 0) + ((c.a1 ?? 1) - (c.a0 || 0)) * u;
    return { x: o.x + Math.cos(a) * c.r, y: o.y + Math.sin(a) * c.r, z: c.z ?? 1 };
  }
  const h = pointOf(c.hold, ctx);
  return h ? { x: h.x, y: h.y, z: c.z ?? 1 } : prev;
}
// Where the camera is at scene time t: { x, y, z (zoom: below 1 further out), i (the shot), cut (a hard cut at this shot's
// start: the page doesn't glide over it) }. A shot that isn't a cut glides from the one before over its `ease` seconds
// (1 by default). prev: where it was (a shot whose subject isn't known yet keeps it there).
export function camAt(sc, t, ctx, prev = null) {
  const C = sc.cam || [], i = shotAt(sc, t, ctx);
  if (i < 0) return prev ? { ...prev, i: -1, cut: false } : null;
  const c = C[i], here = shotPos(c, t, ctx, prev), t0 = shotT(c, ctx);
  if (!here) return null;
  const ease = c.cut || i === 0 ? 0 : c.ease ?? 1;
  if (ease > 0 && t - t0 < ease) {
    const before = shotPos(C[i - 1], t, ctx, here) || here, u = smooth((t - t0) / ease);
    return { x: before.x + (here.x - before.x) * u, y: before.y + (here.y - before.y) * u, z: before.z + (here.z - before.z) * u, i, cut: false };
  }
  return { x: here.x, y: here.y, z: here.z, i, cut: !!c.cut || i === 0 };
}

// every cast id the camera may look at (the page asks the server for these ids' entities)
export function castIds(sc) {
  const out = [];
  const add = (c) => { if (c.group !== undefined) for (let i = 0; i < c.group; i++) out.push(`${c.id}.${i}`); else out.push(c.id); };
  for (const c of sc.cast || []) add(c);
  for (const b of sc.beats || []) if (b.do === 'spawn' && b.group) add(b.group);
  return out;
}
