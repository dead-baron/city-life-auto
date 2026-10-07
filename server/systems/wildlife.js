// Wildlife: the animals of the open country, and what counts as the open country for the people
// and traffic systems. With a player out in the wilds (the woods and hills, the desert, the farmland -
// not the airfields, not Smuggler's Rock), deer, rabbits, coyotes and raccoons roam the woods and
// hills, coyotes and jackrabbits the desert, and cows, sheep, horses, goats and pigs graze round the
// farms in small herds. They graze and amble about their patch and bolt from people and cars that
// come too close, or from gunfire - a deer is gone in a flash, a cow just lumbers off, and the rest
// of the herd goes with it. They can be run over or shot (no crime, and they're no witnesses); a
// carcass stays where it fell until nobody's looking. Like the people in town they arrive from out
// of sight and are cleared away when nobody's near. Out there the people are few and they belong:
// campers at the campgrounds, farmers round the farms, workers at the quarry and the oil field, the
// odd hiker on the hills or nomad in the desert (npc.js and traffic.js ask placeNear / wildStyle).
import { K, T } from '../../shared/constants.js';
import { PED_BLOCK } from '../../shared/map.js';
import { pedStep, PED } from '../../shared/physics.js';
import { mulberry32 } from '../../shared/rng.js';
import { inAnyView } from '../view.js';
import * as players from './players.js';

const rng = mulberry32(5150);

// per kind (animals.js art): hp, walk / run speed (px/s), how close a threat may come before it bolts
// (px), herd size [min, max], whether it grazes (head down) when it stands still
export const WILD_KINDS = {
  deer:    { hp: 60, walk: 45, run: 300, alert: 230, herd: [1, 3], graze: true },
  rabbit:  { hp: 12, walk: 30, run: 235, alert: 130, herd: [1, 2], graze: true, zig: true },
  coyote:  { hp: 50, walk: 55, run: 250, alert: 260, herd: [1, 2] },
  raccoon: { hp: 25, walk: 35, run: 150, alert: 110, herd: [1, 1] },
  cow:     { hp: 160, walk: 28, run: 120, alert: 80, herd: [2, 4], graze: true },
  sheep:   { hp: 70, walk: 30, run: 150, alert: 110, herd: [3, 5], graze: true },
  horse:   { hp: 150, walk: 40, run: 280, alert: 120, herd: [1, 3], graze: true },
  goat:    { hp: 60, walk: 35, run: 180, alert: 120, herd: [2, 3], graze: true },
  pig:     { hp: 90, walk: 25, run: 110, alert: 70, herd: [2, 3] },
};
// what lives where (weights) by the district's style; round the farms, the livestock
const FAUNA = {
  wild: [['deer', 4], ['rabbit', 3], ['coyote', 2], ['raccoon', 1]],
  desert: [['coyote', 3], ['rabbit', 4]],
  rural: [['rabbit', 3], ['deer', 2], ['coyote', 1], ['raccoon', 1]],
  farm: [['cow', 4], ['sheep', 3], ['horse', 2], ['goat', 1.5], ['pig', 1.5]],
};
const TARGET = 9;          // animals round a player out in the wilds
const NEAR_R = 1400;       // ...counted within this
const MAX_WILD = 72;       // in the whole world
const DESPAWN_R = 1900;    // nobody this close (and nobody looking at it): cleared away
const CARCASS_S = 90;      // a carcass goes after this long, once nobody's looking
const LEASH = 380;         // a herd keeps to its patch
const FARM_R = 640;        // livestock graze this close to a farm (its fields, the co-op, a farmhouse)
const GROUND = new Set([T.GRASS, T.DIRT, T.SAND, T.FIELD]);

// ---- the open country ---------------------------------------------------------------------------------
// The wild style at (x, y) - 'wild' (woods, hills, islets), 'rural' (farmland and the country
// airstrip) or 'desert' - or null in town (and at the big airport, out on the water, on Smuggler's Rock).
export function wildStyle(map, x, y) {
  const d = map.districtAt(x, y), s = d && d.style;
  return s === 'wild' || s === 'rural' || s === 'desert' ? s : s === 'airport' && d.tier === 'rural' ? 'rural' : null;
}

// Where people belong out in the wilds (the map's country sites, its farms and farm fields, the
// homes, shops and filling stations out there, the country airstrip), worked out once per map:
// [{ kind, x, y }]. kind: camp | stop | work | venue | farm | home | shop | air.
const SITE_KIND = { camp: 'camp', stop: 'stop', quarry: 'work', oil: 'work', wind: 'work', solar: 'work', mast: 'work', observatory: 'work', drivein: 'venue', raceway: 'venue' };
const POI_KIND = { farm: 'farm', home: 'home', convenience: 'shop', station: 'shop', delivery: 'shop', bank: 'shop', atm: 'shop', airport: 'air' };
export function wildPlaces(map) {
  if (map._wildPlaces) return map._wildPlaces;
  const out = [];
  for (const l of map.landmarks || []) { const k = SITE_KIND[l.type]; if (k) out.push({ kind: k, x: l.x + (l.w || 0) / 2, y: l.y + (l.h || 0) / 2 }); }
  for (const p of map.pois || []) { const k = POI_KIND[p.kind]; if (k && wildStyle(map, p.x, p.y)) out.push({ kind: k, x: p.x, y: p.y }); }
  for (const f of map.fields || []) if (wildStyle(map, f.x + f.w / 2, f.y + f.h / 2)) out.push({ kind: 'farm', x: f.x + f.w / 2, y: f.y + f.h / 2 });
  for (const q of map.natureSites || []) if (q.kind === 'pasture' && wildStyle(map, q.x, q.y)) out.push({ kind: 'farm', x: q.x, y: q.y });   // (the paddocks: livestock graze there)
  map._wildPlaces = out;
  return out;
}
// The nearest such place within r of (x, y), or null.
export function placeNear(map, x, y, r) {
  let best = null, bd = r * r;
  for (const q of wildPlaces(map)) { const d = (q.x - x) ** 2 + (q.y - y) ** 2; if (d < bd) { bd = d; best = q; } }
  return best;
}

// ---- the animals ----------------------------------------------------------------------------------------
const isAnimal = (e) => e.kind === K.PED && !!e.wild && !e.removed;
function pick(list) {
  let total = 0;
  for (const [, w] of list) total += w;
  let r = rng() * total;
  for (const [k, w] of list) { r -= w; if (r <= 0) return k; }
  return list[0][0];
}
const ground = (map, x, y) => GROUND.has(map.tileAtPx(x, y)) && !PED_BLOCK[map.tileAtPx(x, y)];

function faunaAt(world, x, y, style) {
  const map = world.map;
  if (style === 'rural' || style === 'wild') {
    const f = placeNear(map, x, y, FARM_R);
    if (f && (f.kind === 'farm' || f.kind === 'home') && style === 'rural') return FAUNA.farm;
  }
  const list = FAUNA[style] || FAUNA.wild;
  // raccoons come out at night
  return world.clock.isNight ? list.map(([k, w]) => [k, k === 'raccoon' ? w * 3 : k === 'deer' ? w * 0.7 : w]) : list;
}

export function spawnAnimal(world, kind, x, y, herd = 0) {
  const K2 = WILD_KINDS[kind] || WILD_KINDS.deer;
  const a = world.spawnPed(x, y, { hp: K2.hp, archetype: `pet:${kind}`, a: rng() * 6.28, app: { bd: 1 } });
  a.wild = { kind, state: 'graze', until: world.time + rng() * 4, wx: x, wy: y, hx: x, hy: y, herd, look: 0, fx: 0, fy: 0, zig: 0 };
  return a;
}

function spawnHerd(world, x, y, style) {
  const kind = pick(faunaAt(world, x, y, style)), K2 = WILD_KINDS[kind];
  const n = K2.herd[0] + Math.floor(rng() * (K2.herd[1] - K2.herd[0] + 1));
  const herd = (world.nextHerd = (world.nextHerd || 0) + 1);
  let made = 0;
  for (let i = 0; i < n * 3 && made < n; i++) {
    const ax = x + (rng() - 0.5) * 90, ay = y + (rng() - 0.5) * 90;
    if (!ground(world.map, ax, ay)) continue;
    const a = spawnAnimal(world, kind, ax, ay, herd);
    a.wild.hx = x; a.wild.hy = y;
    made++;
  }
  return made;
}

// what makes it bolt: a person on foot, a car (closer still if it's moving), a gunshot nearby
function threat(world, a, K2, now) {
  let best = null, bd = Infinity;
  for (const p of world.players.values()) {
    const q = p.ped;
    if (!q || q.dead || q.hidden || q.sub || q.onTrain) continue;
    const r = q.vehId ? K2.alert * 1.25 : K2.alert;
    const d = Math.hypot(q.x - a.x, q.y - a.y);
    if (d < r && d < bd) { bd = d; best = q; }
  }
  if (!best) for (const v of world.query(a.x, a.y, K2.alert * 1.25, K.VEH)) {
    if (v.lz > 0.3 || v.def.kind === 'boat') continue;
    const sp = Math.hypot(v.vx, v.vy), d = Math.hypot(v.x - a.x, v.y - a.y);
    if ((sp > 60 || d < K2.alert * 0.6) && d < bd) { bd = d; best = v; }
  }
  if (!best) for (const s of world.shotLog) if (now - s.t < 1.2 && Math.hypot(s.x - a.x, s.y - a.y) < 560) return { x: s.x, y: s.y };
  return best ? { x: best.x, y: best.y } : null;
}

function bolt(world, a, fx, fy, now) {
  const w = a.wild;
  w.state = 'flee'; w.fx = fx; w.fy = fy; w.until = now + 2.2 + rng() * 2; w.bias = 0;
  // the rest of the herd goes too
  if (w.herd) for (const q of world.query(a.x, a.y, 260, K.PED)) {
    if (q === a || !q.wild || q.dead || q.wild.herd !== w.herd || q.wild.state === 'flee') continue;
    q.wild.state = 'flee'; q.wild.fx = fx; q.wild.fy = fy; q.wild.until = now + 2 + rng() * 2; q.wild.bias = 0;
  }
}

// a shot or a knock: it runs (combat.js calls this instead of the people's reactions and the law)
export function onHurt(world, a, attacker) {
  if (!a.wild || a.dead) return;
  const src = attacker || a;
  bolt(world, a, attacker ? src.x : a.x - Math.cos(a.a) * 20, attacker ? src.y : a.y - Math.sin(a.a) * 20, world.time);
}

function step(world, a, dt, now) {
  const w = a.wild, K2 = WILD_KINDS[w.kind] || WILD_KINDS.deer, map = world.map;
  if (now >= w.look) {
    w.look = now + 0.2 + rng() * 0.1;
    const th = threat(world, a, K2, now);
    if (th) bolt(world, a, th.x, th.y, now);
  }
  let mx = 0, my = 0, speed = K2.walk;
  if (w.state === 'flee') {
    if (now > w.until) { w.state = 'graze'; w.until = now + 2 + rng() * 5; w.hx = a.x; w.hy = a.y; } // settles where it ran to
    else {
      let ang = Math.atan2(a.y - w.fy, a.x - w.fx) + (w.bias || 0);
      if (K2.zig) ang += Math.sin(now * 7 + a.id) * 0.7; // a rabbit jinks
      const ax = a.x + Math.cos(ang) * 60, ay = a.y + Math.sin(ang) * 60, t = map.tileAtPx(ax, ay);
      if (PED_BLOCK[t] || t === T.WATER || t === T.DEEP) w.bias = (w.bias || 0) + 0.7; // a wall, a fence of rock, the water: veer
      mx = Math.cos(ang); my = Math.sin(ang); speed = K2.run;
    }
  } else if (w.state === 'walk') {
    const dx = w.wx - a.x, dy = w.wy - a.y, d = Math.hypot(dx, dy);
    if (d < 8 || now > w.until) { w.state = 'graze'; w.until = now + 3 + rng() * (K2.graze ? 9 : 5); }
    else { mx = dx / d; my = dy / d; }
  } else if (now > w.until) {
    // amble somewhere nearby on open ground, never far from its patch, not out onto the road
    for (let k = 0; k < 8; k++) {
      const ang = rng() * 6.28, r = 40 + rng() * 140;
      let tx = a.x + Math.cos(ang) * r, ty = a.y + Math.sin(ang) * r;
      if (Math.hypot(tx - w.hx, ty - w.hy) > LEASH) { tx = a.x + (w.hx - a.x) * 0.4; ty = a.y + (w.hy - a.y) * 0.4; }
      if (!ground(map, tx, ty)) continue;
      if (map.tileAtPx((a.x + tx) / 2, (a.y + ty) / 2) === T.ROAD) continue;
      w.wx = tx; w.wy = ty; w.state = 'walk'; w.until = now + 8;
      break;
    }
    if (w.state !== 'walk') w.until = now + 2;
  }
  const mods = players.pedMods(world, a);
  mods.speedMul = speed / PED.walk; mods.canSprint = false; mods.canSwim = false;
  pedStep(a, { bits: 0, mx, my, aim: a.a }, dt, map, mods);
  world.place(a);
}

// ---- spawning and clearing away -------------------------------------------------------------------------
function populate(world) {
  const now = world.time;
  let total = 0;
  const anchors = [];
  for (const p of world.players.values()) { const q = p.ped; if (q && !q.dead && !q.hidden && !q.sub && !q.interior) anchors.push(q); }
  for (const e of world.entities.values()) {
    if (!isAnimal(e)) continue;
    let near = false;
    for (const q of anchors) if ((q.x - e.x) ** 2 + (q.y - e.y) ** 2 < DESPAWN_R * DESPAWN_R) { near = true; break; }
    const gone = !near || (e.dead && now - e.deadAt > CARCASS_S);
    if (gone && !inAnyView(world, e.x, e.y, 48)) { world.remove(e); continue; }
    total++;
  }
  if (total >= MAX_WILD || world.npcBudget <= 0) return; // (no NPCs at all: no animals either)
  for (const q of anchors) {
    // only out in the open country (or right on its edge)
    if (!wildStyle(world.map, q.x, q.y)) {
      let edge = false;
      for (let k = 0; k < 8 && !edge; k++) edge = !!wildStyle(world.map, q.x + Math.cos(k * 0.785) * 900, q.y + Math.sin(k * 0.785) * 900);
      if (!edge) continue;
    }
    let n = 0;
    for (const e of world.query(q.x, q.y, NEAR_R, K.PED)) if (e.wild && !e.dead) n++;
    if (n >= TARGET) continue;
    for (let tries = 0; tries < 10; tries++) {
      const ang = rng() * 6.28, d = 560 + rng() * 650;
      const x = q.x + Math.cos(ang) * d, y = q.y + Math.sin(ang) * d;
      const style = wildStyle(world.map, x, y);
      if (!style || !ground(world.map, x, y)) continue;
      let close = false;
      for (const b of anchors) if ((b.x - x) ** 2 + (b.y - y) ** 2 < 450 * 450) { close = true; break; }
      if (close || inAnyView(world, x, y, 80)) continue; // they wander in from off screen
      if (world.query(x, y, 260, K.PED).some((e) => e.wild && !e.dead)) continue; // not on top of another herd
      total += spawnHerd(world, x, y, style);
      break;
    }
    if (total >= MAX_WILD) return;
  }
}

export function update(world, dt) {
  if (world.tick % 20 === 9) populate(world);
  const now = world.time;
  for (const e of world.entities.values()) {
    if (!isAnimal(e) || e.dead) continue;
    step(world, e, dt, now);
  }
}

export function animals(world) {
  const out = [];
  for (const e of world.entities.values()) if (isAnimal(e)) out.push(e);
  return out;
}
