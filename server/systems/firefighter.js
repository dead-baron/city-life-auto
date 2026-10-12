// The firefighter (H68; the owner, 2026-10-11: "more jobs for players trying to make an honest living"). Sign on at a
// fire station (Act there) or from the phone's job list: a fire engine (shared/vehicles.js firetruck) is issued to you
// like a work truck (jobs.js workTruck: yours, the ring and the arrows). A shift of calls (shared/rules.js FIRE), each
// from the built map, never coordinates: a car on fire at the kerb (it blows unless the water's on it in time), a
// wreck burning after a crash (left alone it lights what's beside it), someone on fire outside a shop or at a cookout in
// a park (they catch as you pull up - douse them), a grass fire in a park or the countryside (it spreads tile to tile in
// the dry grass and dies in the rain), a dumpster fire behind a shop or a kitchen fire in one (they grow, and light the
// grass beside them). Drive there with the siren (H: traffic pulls over), get out and hold fire within the hose's length
// of the engine: a stream of water (the 'hose' event: drawn by client/render/firejob.js in both views) that douses
// people on fire, cools a burning car before it blows, puts out a wreck, a dumpster, a kitchen, and wets the grass so the
// front stops there. Paid by the call: its kind, how fast it was out, what was saved (a car, a life).
// The tile fires (world.tfire) burn on their own whoever lit them: anyone can start one with a burning wreck by the grass.
//   update(world, dt)               the fires and the shifts (world.js SYSTEMS)
//   start(world, p, station)        sign on -> error | null
//   interaction(world, p)           Act at a fire station: sign on
//   hose(world, p, ped, inp, pressed, dt)  the fire button on foot by your engine -> true while it sprays (players.js)
//   target(world, p, j)             the job tracker's target (phone.js jobTarget)
//   stationFor(world, p)            the fire station nearest to p
//   callAt(world, p, k, site)       a call of kind k at a site { x, y, name } (tests, the dev menu)
//   light(world, tx, ty, k, call)   a tile fire (0 grass, 1 dumpster, 2 kitchen)
//   spray(world, ped, a, dt)        the water from ped along a -> its reach (px)
import { K, T, TILE, WEATHER } from '../../shared/constants.js';
import { IN } from '../../shared/input.js';
import { DISTRICTS, PED_BLOCK } from '../../shared/mapcore.js';
import { CAR_SPAWN_BLOCK } from '../../shared/map.js';
import { FIRE, BURN } from '../../shared/rules.js';
import { FLY } from '../../shared/flight.js';   // (an aircraft up in the air: out of reach of the hose)
import { store } from '../store.js';
import { spawnNpc, despawnNpc } from './npc.js';
import * as burning from './burning.js';
import * as vehicles from './vehicles.js';
import * as jobs from './jobs.js';

export const KINDS = ['car', 'wreck', 'person', 'grass', 'dumpster', 'kitchen'];
const WEIGHT = { car: 3, wreck: 2, person: 1.5, grass: 2.5, dumpster: 1.5, kitchen: 1.5 };
const FOOD = new Set(['coffee', 'snack', 'diner', 'roadhouse', 'grocery', 'convenience', 'club', 'butcher', 'fishmarket']);
const SHOP = new Set([...FOOD, 'clothing', 'pharmacy', 'barber', 'hardware', 'pawn', 'tackle', 'gunshop', 'sports', 'paint', 'bank']);
const PARKS = new Set(['park', 'rural', 'wild']);
const NO_ROAD = new Set(['Pelican Key', "Smuggler's Rock", 'Gull Isles', 'Prison Island']);   // (no road out there: no engine gets there)
const CARS = ['sedan', 'compact', 'pickup', 'van', 'sports', 'taxi'];
const NEVER = 1e12;

// ---- where calls come from (once per map; nothing added to the map) -------------------------------------------------
export const grassy = (m, tx, ty) => { if (!m.inside(tx, ty)) return false; const t = m.tileAt(tx, ty); return t === T.GRASS || t === T.FIELD; };
const SITES = new WeakMap();
export function sitesOf(m) {
  let S = SITES.get(m);
  if (S) return S;
  S = { grass: [], kerb: [], shops: [], food: [], stations: [] };
  const where = (x, y) => { const d = m.districtAt(x, y); return d ? d.name : 'the countryside'; };
  for (let ty = m.y0 + 3; ty < m.y0 + m.h - 3; ty += 7) for (let tx = m.x0 + 3; tx < m.x0 + m.w - 3; tx += 7) {
    if (!grassy(m, tx, ty)) continue;
    const d = DISTRICTS[m.dist[m.idx(tx, ty)]];
    if (!d || !PARKS.has(d.style) || !d.isl || NO_ROAD.has(d.isl)) continue;
    let n = 0, road = false;
    for (let dy = -12; dy <= 12 && !road; dy += 2) for (let dx = -12; dx <= 12 && !road; dx += 2) if (m.inside(tx + dx, ty + dy) && m.tileAt(tx + dx, ty + dy) === T.ROAD) road = true;
    if (!road) continue;   // (an engine can get within a hose's reach of it)
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (grassy(m, tx + dx, ty + dy)) n++;
    if (n < 22) continue;   // (open grass round about: room for it to spread)
    const x = tx * TILE + TILE / 2, y = ty * TILE + TILE / 2;
    S.grass.push({ x, y, name: d.style === 'park' ? d.name : `the dry grass out by ${d.name}`, cook: d.style === 'park' ? `at a cookout in ${d.name}` : `at a campsite out by ${d.name}` });
  }
  for (const q of m.parking) { const d = m.districtAt(q.x, q.y); if (d && d.style !== 'wild' && d.style !== 'rocky') S.kerb.push({ x: q.x, y: q.y, a: q.a || 0, name: where(q.x, q.y) }); }   // (in town and along the roads, not a trailhead under the trees)
  const dumps = m.props.filter((q) => q.t === 'dump_b' || q.t === 'dump_g');
  for (const q of m.pois) {
    if (/^Fire Station/.test(q.label || '')) S.stations.push({ x: q.x, y: q.y, name: q.label });
    if (!SHOP.has(q.kind)) continue;
    let dump = null, bd = 260;
    for (const d of dumps) { const dd = Math.hypot(d.x - q.x, d.y - q.y); if (dd < bd) { bd = dd; dump = d; } }
    S.shops.push({ x: q.x, y: q.y, name: q.label, dump: dump ? { x: dump.x, y: dump.y } : null });
    if (FOOD.has(q.kind)) S.food.push({ x: q.x, y: q.y, name: q.label });
  }
  SITES.set(m, S);
  return S;
}

// open ground outdoors near (x, y) (not inside a shop, not in a wall): the nearest, out to 200 px -> { x, y } | null
const OUT_T = new Set([T.SIDEWALK, T.PLAZA, T.GRASS, T.LOT, T.DIRT, T.SAND]);
export function openNear(m, x, y) {
  for (let r = 0; r <= 200; r += 16) for (let k = 0, n = Math.max(1, Math.round(r / 10)); k < n; k++) {
    const a = (k / n) * Math.PI * 2, px = x + Math.cos(a) * r, py = y + Math.sin(a) * r, t = m.tileAtPx(px, py);
    if (OUT_T.has(t) && !PED_BLOCK[t]) return { x: px, y: py };
  }
  return null;
}

// ---- the tile fires: grass (spreads), a dumpster, a kitchen (grow) ---------------------------------------------------
const tf = (world) => (world.tfire ||= { on: new Map(), scorch: new Map(), wet: new Map(), acc: 0, ver: 0, sweep: 0 });
export function light(world, tx, ty, k = 0, call = 0, from = null) {
  const m = world.map;
  if (!m.inside(tx, ty)) return null;
  const F = tf(world), i = m.idx(tx, ty), now = world.time;
  if (F.on.has(i)) return F.on.get(i);
  if (k === 0 && (!grassy(m, tx, ty) || F.scorch.has(i) || (F.wet.get(i) || 0) > now || F.on.size >= FIRE.grass.max)) return null;
  const h = k === 0 ? FIRE.grass.heat : k === 1 ? FIRE.spot.dumpster : FIRE.spot.kitchen;
  const f = { i, tx, ty, k, h, h0: h, t: now, call, ox: from ? from.ox : tx, oy: from ? from.oy : ty };
  F.on.set(i, f);
  F.ver++;
  if (call) { const c = callById(world, call); if (c) c.burned = (c.burned || 0) + 1; }
  return f;
}
function putOut(world, f, wet) {
  const F = tf(world), now = world.time;
  F.on.delete(f.i);
  if (f.k === 0) F.scorch.set(f.i, { u: now + FIRE.grass.scorchS, tx: f.tx, ty: f.ty });
  if (wet) F.wet.set(f.i, now + FIRE.grass.wetS);
  F.ver++;
}
export const burningTiles = (world, call = 0) => { const F = world.tfire; if (!F) return []; const L = []; for (const f of F.on.values()) if (!call || f.call === call) L.push(f); return L; };

function stepFires(world, st) {
  const F = tf(world), now = world.time, G = FIRE.grass, S = FIRE.spot, rain = world.weather === WEATHER.RAIN;
  for (const f of [...F.on.values()]) {
    if (f.k === 0) {
      if (now - f.t >= (rain ? G.burnS / G.rainOut : G.burnS)) { putOut(world, f, false); continue; }
      const pr = G.spread * st * (rain ? G.rain : 1);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if ((!dx && !dy) || world.rand() >= pr * (dx && dy ? 0.6 : 1)) continue;
        const nx = f.tx + dx, ny = f.ty + dy;
        if (Math.hypot(nx - f.ox, ny - f.oy) <= G.maxR) light(world, nx, ny, 0, f.call, f);
      }
    } else {
      f.h = Math.min(f.h0 * S.max, f.h + S.grow * f.h0 * st);   // (left alone it grows)
      if (f.h >= f.h0 * S.spreadAt && world.rand() < 0.3 * st) {
        const a = world.rand() * Math.PI * 2;
        light(world, f.tx + Math.round(Math.cos(a) * 1.6), f.ty + Math.round(Math.sin(a) * 1.6), 0, f.call, { ox: f.tx, oy: f.ty });
      }
    }
    // walking through it sets you alight
    const cx = f.tx * TILE + TILE / 2, cy = f.ty * TILE + TILE / 2;
    for (const q of world.query(cx, cy, TILE * 0.7, K.PED)) {
      if (q.vehId || q.dead || burning.burning(q) || Math.abs(q.x - cx) > TILE / 2 + 4 || Math.abs(q.y - cy) > TILE / 2 + 4) continue;
      if (Math.abs(q.vx) + Math.abs(q.vy) > 30 && world.rand() < BURN.touch * st) burning.ignite(world, q, null, BURN.secs * 0.7);
    }
  }
  if (now >= F.sweep) {   // (the scorch marks and the wet ground: forgotten when they're over)
    F.sweep = now + 20;
    for (const [i, q] of F.scorch) if (q.u <= now) F.scorch.delete(i);
    for (const [i, u] of F.wet) if (u <= now) F.wet.delete(i);
  }
}

// ---- the water ---------------------------------------------------------------------------------------------------------
// From ped along a: what it reaches (a wall stops it) -> the reach in px. Douses people on fire, cools a burning car
// (and puts it out), puts out a wreck, the tile fires along it; the grass where it lands goes wet (the front stops).
export function spray(world, ped, a, dt) {
  const m = world.map, H = FIRE.hose, c = Math.cos(a), s = Math.sin(a), x0 = ped.x, y0 = ped.y, now = world.time;
  let reach = H.range;
  for (let d = 16; d <= H.range; d += 10) { const t = m.tileAtPx(x0 + c * d, y0 + s * d); if (t === T.BUILDING || t === T.WALL) { reach = d; break; } }
  const along = (qx, qy, r) => { const dx = qx - x0, dy = qy - y0, u = dx * c + dy * s; return u > -r && u < reach + r && Math.abs(dy * c - dx * s) < H.w + r; };
  const mx = x0 + (c * reach) / 2, my = y0 + (s * reach) / 2;
  for (const q of world.query(mx, my, reach / 2 + 40, K.PED)) if (q !== ped && burning.burning(q) && along(q.x, q.y, q.r || 10)) { burning.douse(world, q, 'water'); doused(world, q); }
  for (const v of world.query(mx, my, reach / 2 + 120, K.VEH)) if ((v.alt || 0) <= FLY.HIGH && !v.def.pedal && along(v.x, v.y, v.def.W / 2)) cool(world, v, dt);
  const F = world.tfire;
  if (!F) return reach;
  const hit = new Set();
  for (let d = 12; d <= reach + 8; d += 10) {
    const tx = Math.floor((x0 + c * d) / TILE), ty = Math.floor((y0 + s * d) / TILE), end = d > reach * 0.55;
    for (let dy = end ? -1 : 0; dy <= (end ? 1 : 0); dy++) for (let dx = end ? -1 : 0; dx <= (end ? 1 : 0); dx++) {
      if (!m.inside(tx + dx, ty + dy)) continue;
      const i = m.idx(tx + dx, ty + dy);
      if (hit.has(i)) continue;
      hit.add(i);
      const f = F.on.get(i);
      if (f) { f.h -= H.rate * dt; if (f.h <= 0) { putOut(world, f, true); world.emit(f.tx * TILE + 16, f.ty * TILE + 16, { e: 'douse', x: f.tx * TILE + 16, y: f.ty * TILE + 16 }); } }
      else if (grassy(m, tx + dx, ty + dy) && (F.wet.get(i) || 0) < now + FIRE.grass.wetS - 5) { F.wet.set(i, now + FIRE.grass.wetS); }
    }
  }
  return reach;
}
// a vehicle under the water: a dying one (smoking, on fire) cooled and held off, then out; a burning wreck out
function cool(world, v, dt) {
  const now = world.time;
  if (v.dead && !v.wreckAt && v.deadBoomAt < NEVER) {
    v.douseT = (v.douseT || 0) + dt;
    v.deadBoomAt = Math.max(v.deadBoomAt, now + FIRE.car.hold);
    if (v.douseT < FIRE.car.douseS) return;
    v.deadFireAt = NEVER; v.deadBoomAt = NEVER; v.burnUntil = 0; v.fireOut = now;
  } else if (v.wreckAt && (v.burnUntil > now || now - v.wreckAt < 20)) {
    v.douseT = (v.douseT || 0) + dt;
    if (v.douseT < FIRE.wreck.douseS) return;
    v.burnUntil = 0; v.wreckAt = Math.min(v.wreckAt, now - 21); v.fireOut = now;
  } else if (v.burnUntil > now) { v.burnUntil = 0; v.fireOut = now; }   // (a fire arrow's flames)
  else return;
  world.emit(v.x, v.y, { e: 'douse', x: Math.round(v.x), y: Math.round(v.y) });
}
// someone on fire put out by the water: a call's victim saved
function doused(world, q) {
  if (!q.npc || q.dead) return;
  q.savedAt = world.time;
  if (q.npc.burn) q.npc.burn = null;
  q.downUntil = Math.min(q.downUntil || 0, world.time + 1.5);
}

// the fire button on foot within the hose's length of your engine: the water instead of the weapon
export function hose(world, p, ped, inp, pressed, dt) {
  const j = p.job;
  if (!j || j.type !== 'fire' || !(inp.bits & IN.FIRE) || ped.carrying || ped.vehId || ped.dead) return false;
  const v = world.get(j.truck);
  if (!v || v.removed || v.wreckAt) return false;
  if (Math.hypot(v.x - ped.x, v.y - ped.y) > FIRE.hose.len) {
    if ((pressed & IN.FIRE) && world.time >= (j.farAt || 0)) { j.farAt = world.time + 6; world.notify(p, 'The hose doesn\'t reach that far - stay near the engine (the hose runs from it).', 'warn'); }
    return true;   // (no swinging at the air with a hose in your hands)
  }
  const a = (inp.bits & IN.AIMING) ? inp.aim : ped.a;
  ped.a = a; ped.aimUntil = world.time + 0.3;
  const reach = spray(world, ped, a, dt);
  if (world.tick % 2 === 0) world.emit(ped.x, ped.y, { e: 'hose', id: ped.id, x: Math.round(ped.x), y: Math.round(ped.y), a: +a.toFixed(2), l: Math.round(reach), tx: Math.round(v.x), ty: Math.round(v.y) });
  return true;
}

// ---- signing on --------------------------------------------------------------------------------------------------------
export function stationFor(world, p) {
  const L = sitesOf(world.map).stations;
  if (!L.length) return null;
  if (!p.ped) return L[0];
  return L.reduce((a, b) => (Math.hypot(b.x - p.ped.x, b.y - p.ped.y) < Math.hypot(a.x - p.ped.x, a.y - p.ped.y) ? b : a));
}
export function start(world, p, station = null) {
  if (!p.ped || p.ped.dead) return 'Not right now.';
  if (p.job) return 'You already have a job - cancel it first.';
  const st = station || stationFor(world, p);
  if (!st) return 'No fire station takes on crews today.';
  p.job = { type: 'fire', stage: 'wait', truck: 0, station: { x: st.x, y: st.y, name: st.name }, nextAt: world.time + FIRE.firstS, expires: world.time + FIRE.shiftS, done: 0, call: null, text: 'Firefighter: waiting for a call' };
  const v = jobs.workTruck(world, p, st, 'firetruck', { label: st.name });
  if (!v) { p.job = null; return 'No room to park the engine there.'; }
  v.sirenOn = false;
  world.notify(p, `You're on the crew at ${st.name}: your fire engine's the green ring. Calls come over the phone - H for the siren, then get out and hold fire near the engine for the hose.`, 'good');
  p.meDirty = true;
  store.touch();
  return null;
}
export function interaction(world, p) {
  const ped = p.ped;
  if (!ped || ped.dead || ped.vehId || p.job) return null;
  const st = sitesOf(world.map).stations.find((q) => Math.hypot(q.x - ped.x, q.y - ped.y) < 170);
  if (!st) return null;
  return { label: 'Sign on as a firefighter (a fire engine is issued)', run: () => { const err = start(world, p, st); if (err) world.notify(p, err, 'bad'); } };
}

// ---- the calls ---------------------------------------------------------------------------------------------------------
const SAY = {
  car: (w) => `a car's on fire at the kerb in ${w} - get the water on it before it blows`,
  wreck: (w) => `a wreck's burning after a crash in ${w} - put it out before it spreads`,
  person: (w) => `someone's on fire ${w} - get there fast`,
  grass: (w) => `a grass fire in ${w} - it's spreading: stop the front`,
  dumpster: (w) => `a dumpster's on fire behind ${w}`,
  kitchen: (w) => `a kitchen fire at ${w}`,
};
let callSeq = 1;
function callById(world, id) {
  for (const p of world.players.values()) if (p.job && p.job.type === 'fire' && p.job.call && p.job.call.id === id) return p.job.call;
  return null;
}
function pickSite(world, list, ped) {
  const ring = list.filter((q) => { const d = Math.hypot(q.x - ped.x, q.y - ped.y); return d >= FIRE.minD && d <= FIRE.maxD; });
  const L = ring.length ? ring : list.filter((q) => Math.hypot(q.x - ped.x, q.y - ped.y) >= 300);
  return L.length ? L[Math.floor(world.rand() * L.length)] : null;
}
function newCall(world, p) {
  const S = sitesOf(world.map), ped = p.ped;
  const lists = { car: S.kerb, wreck: S.kerb, person: world.rand() < 0.5 && S.grass.length ? S.grass : S.shops, grass: S.grass, dumpster: S.shops, kitchen: S.food };
  const ks = KINDS.filter((k) => lists[k].length);
  let r = world.rand() * ks.reduce((s, k) => s + WEIGHT[k], 0), k = ks[0];
  for (const q of ks) { r -= WEIGHT[q]; if (r <= 0) { k = q; break; } }
  const site = pickSite(world, lists[k], ped);
  if (!site || !callAt(world, p, k, site)) p.job.nextAt = world.time + 10;
}
// a call of kind k at site { x, y, name, a?, dump? } -> the call | null
export function callAt(world, p, k, site) {
  const j = p.job, now = world.time, m = world.map;
  const c = { id: callSeq++, k, x: site.x, y: site.y, name: site.name, at: now, d: p.ped ? Math.hypot(site.x - p.ped.x, site.y - p.ped.y) : 0, veh: 0, victim: 0, lit: false, burned: 0, spread: false, saved: false };
  j.call = c;   // (before lighting: light() counts the call's tiles)
  if (k === 'car' || k === 'wreck') {
    let spot = null;
    for (let r = 0; r <= 160 && !spot; r += 40) for (let a = 0; a < 6 && !spot; a++) {
      const x = site.x + Math.cos(a) * r, y = site.y + Math.sin(a) * r;
      if (!CAR_SPAWN_BLOCK[m.tileAtPx(x, y)] && !world.query(x, y, 70, K.VEH).length) spot = { x, y };
      if (!r) break;
    }
    if (!spot) { j.call = null; return null; }
    const v = world.spawnVehicle(CARS[Math.floor(world.rand() * CARS.length)], spot.x, spot.y, site.a || 0, { npcOwned: true });
    v.despawnable = false; v.parked = true; v.fireCall = c.id;
    v.dead = true; v.hp = 0; v.deadAt = now; v.douseT = 0;
    if (k === 'car') { v.deadFireAt = now; v.deadBoomAt = now + FIRE.car.boomS; }
    else { v.wreckAt = now - 21; v.burnUntil = now + FIRE.wreck.burnS; v.deadFireAt = NEVER; v.deadBoomAt = NEVER; }
    c.veh = v.id; c.x = v.x; c.y = v.y;
  } else if (k === 'person') {
    const at = openNear(m, site.x, site.y);
    if (!at) { j.call = null; return null; }
    const ped = spawnNpc(world, 'casual', at.x, at.y, 'civ');
    ped.npc.sar = p.pid; ped.npc.keep = true; ped.vx = 0; ped.vy = 0;
    c.victim = ped.id; c.x = ped.x; c.y = ped.y;
  } else {
    const at = k === 'dumpster' && site.dump ? site.dump : site;
    const tx = Math.floor(at.x / TILE), ty = Math.floor(at.y / TILE);
    c.x = tx * TILE + TILE / 2; c.y = ty * TILE + TILE / 2;
    if (k === 'grass') { light(world, tx, ty, 0, c.id); for (let n = 1; n < FIRE.grass.start; n++) light(world, tx + (n % 2), ty + (n >> 1), 0, c.id); }
    else light(world, tx, ty, k === 'dumpster' ? 1 : 2, c.id);
    if (!burningTiles(world, c.id).length) { j.call = null; return null; }
    c.lit = true;
  }
  const where = k === 'person' ? site.cook || `outside ${site.name}` : site.name;
  j.stage = 'go';
  j.text = `Fire call: ${SAY[k](where)}`;
  world.notify(p, `Fire call! ${SAY[k](where)[0].toUpperCase()}${SAY[k](where).slice(1)}. Siren on (H).`, 'good');
  p.meDirty = true;
  return c;
}
function endCall(world, p, ok, msg) {
  const j = p.job, c = j && j.call;
  if (!c) return;
  const now = world.time;
  if (c.victim) {
    const q = world.get(c.victim);
    if (q && !q.removed) { if (q.npc) { q.npc.sar = 0; q.npc.keep = false; q.npc.state = 'wander'; } if (!q.dead && burning.burning(q)) { /* (still burning: their own now) */ } }
  }
  if (c.veh) { const v = world.get(c.veh); if (v && !v.removed) { v.despawnable = true; v.fireCall = 0; } }
  let pay = 0;
  if (ok) {
    const P = FIRE.pay, par = P.parS + c.d / P.kmS, took = now - c.at;
    const fast = Math.max(0, Math.min(1, (par * 1.8 - took) / (par * 0.8)));
    pay = P[c.k] * (1 + P.fast * fast);
    if (c.k === 'grass') pay = Math.max(P.grass / 3, pay - P.perTile * Math.max(0, c.burned - FIRE.grass.start));
    if (c.saved && c.k === 'car') pay += P.saved;
    if (c.saved && c.k === 'person') pay += P.life;
    pay = Math.round(pay / 5) * 5;
    const prof = p.profile;
    prof.cash += pay; prof.samaritan = (prof.samaritan || 0) + P.samaritan;
    j.done++;
    j.lastPay = { pay, fast: +fast.toFixed(2), saved: c.saved, burned: c.burned };
    j.expires = Math.max(j.expires, now + FIRE.shiftS / 3);
    if (p.ped) world.emit(p.ped.x, p.ped.y, { e: 'cash', x: p.ped.x, y: p.ped.y });
    store.touch();
  } else j.lastPay = { pay: 0, saved: false, burned: c.burned };
  j.call = null; j.stage = 'wait'; j.nextAt = now + FIRE.gapS; j.text = 'Firefighter: waiting for the next call';
  world.notify(p, ok ? `${msg} +$${pay}, +${FIRE.pay.samaritan} Samaritan.` : msg, ok ? 'good' : 'bad');
  p.meDirty = true;
}
const nearCrew = (world, p, x, y, r) => { const ped = p.ped, v = world.get(p.job.truck); return (ped && Math.hypot(ped.x - x, ped.y - y) < r) || (v && Math.hypot(v.x - x, v.y - y) < r); };
// left alone, a wreck lights what's beside it: the grass, a car
function spreadFrom(world, x, y, call) {
  const m = world.map, tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
  for (let r = 1; r <= 3; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (grassy(m, tx + dx, ty + dy) && light(world, tx + dx, ty + dy, 0, call)) return 'grass';
  for (const v of world.query(x, y, 200, K.VEH)) if (!v.wreckAt && !v.dead && !v.def.pedal && (v.alt || 0) <= FLY.HIGH && !v.seats.some((s) => s)) { vehicles.killEngine(world, v, null); v.deadFireAt = world.time; return 'car'; }
  return null;
}
function step(world, p) {
  const j = p.job, now = world.time;
  const truck = world.get(j.truck);
  if (!truck || truck.removed || truck.wreckAt) { endCall(world, p, false, 'The engine is lost.'); jobs.failJob(world, p, 'The fire engine is lost. You\'re off the crew.'); return; }
  const c = j.call;
  if (!c) {
    if (now >= j.expires) { world.notify(p, `Shift over: ${j.done} call${j.done === 1 ? '' : 's'} answered.`, 'good'); jobs.jobDone(world, p); return; }
    if (now >= j.nextAt && p.ped && !p.ped.dead) newCall(world, p);
    return;
  }
  if (j.stage === 'go' && nearCrew(world, p, c.x, c.y, 500)) { j.stage = 'fight'; p.meDirty = true; }
  const age = now - c.at;
  if (c.k === 'car' || c.k === 'wreck') {
    const v = world.get(c.veh);
    if (!v || v.removed) { endCall(world, p, false, 'The burning car is gone.'); return; }
    if (c.k === 'car') {
      if (v.wreckAt) { endCall(world, p, false, 'The car went up before the fire was out.'); return; }
      if (v.fireOut) { c.saved = true; endCall(world, p, true, 'The car fire\'s out - saved before it blew.'); return; }
    } else {
      if (v.fireOut) { endCall(world, p, true, 'The wreck\'s out.'); return; }
      if (!(v.burnUntil > now)) { endCall(world, p, false, 'The wreck burned itself out.'); return; }
      v.wreckAt = Math.min(v.wreckAt, now - 21); if (now - v.wreckAt > 30) v.wreckAt = now - 21;   // (kept: not tidied away while it burns)
      if (!c.spread && age > FIRE.wreck.spreadS) { c.spread = true; const what = spreadFrom(world, v.x, v.y, c.id); if (what) world.notify(p, what === 'grass' ? 'The wreck\'s fire has caught the grass beside it!' : 'The wreck\'s fire has caught the car beside it!', 'warn'); }
    }
  } else if (c.k === 'person') {
    const q = world.get(c.victim);
    if (!q || q.removed) { endCall(world, p, false, 'They\'re gone.'); return; }
    if (!c.lit) {
      if (nearCrew(world, p, q.x, q.y, FIRE.person.nearR)) {
        q.hp = Math.max(q.hp, BURN.fallDps * FIRE.person.lifeS);
        if (burning.ignite(world, q, null, 120)) {
          c.lit = true;
          if (q.npc && q.npc.burn) { q.npc.burn.k = 'fall'; q.npc.burn.until = now + 1.2; }
          world.notify(p, 'They\'re alight - get the hose on them!', 'warn');
        }
      }
    } else if (q.dead) { endCall(world, p, false, 'They didn\'t make it.'); return; }
    else if (!burning.burning(q)) { c.saved = q.savedAt > c.at; endCall(world, p, true, c.saved ? 'You put them out - they\'ll live.' : 'The flames are out.'); return; }
  } else if (!burningTiles(world, c.id).length) { endCall(world, p, true, c.k === 'grass' ? `The grass fire's out (${c.burned} patches burned).` : c.k === 'dumpster' ? 'The dumpster fire\'s out.' : 'The kitchen fire\'s out - the place is saved.'); return; }
  if (age > FIRE.callS) {
    if (c.victim && !c.lit) { const q = world.get(c.victim); if (q && !q.removed) despawnNpc(world, q); }
    endCall(world, p, false, 'Too late - the fire did its worst.');
  }
}

// ---- every tick --------------------------------------------------------------------------------------------------------
export function update(world, dt) {
  const F = tf(world);
  F.acc += dt;
  while (F.acc >= FIRE.grass.stepS) { F.acc -= FIRE.grass.stepS; if (F.on.size || F.scorch.size || F.wet.size) stepFires(world, FIRE.grass.stepS); }
  for (const p of world.players.values()) if (p.job && p.job.type === 'fire') step(world, p);
  if (world.tick % 10 === 0) for (const p of world.players.values()) sendNear(world, p);
}

// { t: 'fires', f: [tx, ty, kind, heat 1-9, ...], s: [tx, ty, ...] (scorched) } - the tile fires within FIRE.near of
// you, sent when they change (client/render/firejob.js)
function sendNear(world, p) {
  const ped = p.ped, F = world.tfire;
  if (!p.conn || !ped) return;
  if ((!F || (!F.on.size && !F.scorch.size)) && !p.fireSig) return;
  const R = FIRE.near, f = [], s = [];
  if (F && !ped.hidden) {
    for (const q of F.on.values()) if (Math.abs(q.tx * TILE - ped.x) < R && Math.abs(q.ty * TILE - ped.y) < R) f.push(q.tx, q.ty, q.k, Math.max(1, Math.min(9, Math.ceil((q.h / q.h0) * 6))));
    for (const q of F.scorch.values()) if (Math.abs(q.tx * TILE - ped.x) < R && Math.abs(q.ty * TILE - ped.y) < R) s.push(q.tx, q.ty);
  }
  const sig = f.length || s.length ? f.join(',') + '|' + s.join(',') : '';
  if (sig === (p.fireSig || '')) return;
  p.fireSig = sig;
  p.conn.sendJSON({ t: 'fires', f, s });
}

// ---- the page's view of it (phone.js jobTarget) ------------------------------------------------------------------------
export function target(world, p, j) {
  const c = j.call;
  if (!c) { const v = world.get(j.truck), at = v || j.station; return { text: j.text, x: Math.round(at.x), y: Math.round(at.y), stage: 'wait' }; }
  let x = c.x, y = c.y;
  if (c.k === 'person') { const q = world.get(c.victim); if (q) { x = q.x; y = q.y; } }
  else if (c.k === 'grass') {   // (the front nearest you: the middle of a grass fire is already burned out)
    const at = p.ped || c, L = burningTiles(world, c.id);
    let bd = Infinity;
    for (const f of L) { const fx = f.tx * TILE + 16, fy = f.ty * TILE + 16, d = Math.hypot(fx - at.x, fy - at.y); if (d < bd) { bd = d; x = fx; y = fy; } }
  }
  return { text: j.text, x: Math.round(x), y: Math.round(y), stage: j.stage };
}

// ---- dev ('firejob'): on the crew, your engine beside you, a call of kind msg.k (KINDS; 'grass' by default) at the
// nearest place it can be - you're taken there, the engine parked beside you
export function devFire(world, p, msg) {
  const ped = p.ped;
  if (!ped || ped.dead) return 'On your feet first.';
  if (ped.vehId) vehicles.exitVehicle(world, ped);
  const k = KINDS.includes(msg.k) ? msg.k : 'grass';
  if (p.job && p.job.type !== 'fire') jobs.failJob(world, p, '[dev] job dropped');
  if (!p.job) { const err = start(world, p); if (err) return err; }
  const j = p.job;
  if (j.call) endCall(world, p, false, '[dev] call dropped');
  const S = sitesOf(world.map), list = k === 'car' || k === 'wreck' ? S.kerb : k === 'grass' ? S.grass : k === 'kitchen' ? S.food : S.shops;
  let site = null, bd = Infinity;
  for (const q of list) { const d = Math.hypot(q.x - ped.x, q.y - ped.y); if (d < bd && d > 200) { bd = d; site = q; } }
  if (!site) return `no place for a ${k} fire`;
  const at = openNear(world.map, site.x - 150, site.y + 60) || openNear(world.map, site.x, site.y);
  if (at) { ped.x = at.x; ped.y = at.y; ped.vx = 0; ped.vy = 0; world.place(ped); }
  const v = world.get(j.truck);
  if (v) {
    const spot = openNear(world.map, ped.x - 110, ped.y) || { x: ped.x - 110, y: ped.y };
    v.x = spot.x; v.y = spot.y; v.vx = 0; v.vy = 0; v.a = 0; world.place(v);
  }
  j.nextAt = world.time + 1e6;
  const c = callAt(world, p, k, site);
  if (!c) return `the ${k} call didn't start there`;
  j.nextAt = world.time + FIRE.gapS;
  const by = openNear(world.map, c.x - 130, c.y + 20);   // (you a hose's reach from it, the engine behind you)
  if (by && !(c.k === 'person' && Math.hypot(by.x - c.x, by.y - c.y) < 60)) {
    ped.x = by.x; ped.y = by.y; world.place(ped);
    if (v) { const sp = openNear(world.map, by.x - 120, by.y) || by; v.x = sp.x; v.y = sp.y; world.place(v); }
  }
  return null;
}
