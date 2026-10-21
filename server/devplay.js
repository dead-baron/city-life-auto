// The debug menu's commands for today's new play (the owner, 2026-10-18: "make sure all these new features are
// accessible in the debug menu for easy testing"): skateboarding, the shopping carts and fishing. server/dev.js hands
// them on ('skate', 'cart', 'fish'); the buttons are client/devcats.js's sections. Each returns an error or null.
//   devSkate(world, p, msg)   msg.k: 'on' (a board, and on it), 'spot' (the nearest skate spot, on your board),
//                             'session' (and a session started there), 'special' (the special meter full: on now),
//                             'rail' / 'ramp' (the nearest ledge, flat bar or bench / kicker, quarter pipe or pyramid, lined
//                             up on your board a run-up away)
//   devCart(world, p, msg)    msg.k: 'pair' (a cart, you at the handle, a friend in the basket), 'headon' (two loaded carts
//                             meeting head on just ahead), 'tipped' / 'crushed' (a cart over on its side / buckled)
//   devFish(world, p, msg)    msg.k: 'kit' (every rod, a stack of every bait), 'go' (msg.w a water, msg.spot a legendary's
//                             place: the nearest bank of it, facing it), 'cave' (the cave's still pool), 'boat' (out at sea in
//                             a boat sitting still), 'bite' (msg.f: 'now' - the next bite at once; 'rare', 'legend' or a
//                             fish's id - the next fish), 'easy' (toggle: every fight a bluegill's), 'cooler' (ten fish in
//                             it), 'clear' (my log and my cooler), 'records' (the records board wiped)
import { TILE, T } from '../shared/constants.js';
import { PED_BLOCK } from '../shared/map.js';
import { DISTRICTS } from '../shared/mapcore.js';
import { VEHICLES } from '../shared/vehicles.js';
import * as FS from '../shared/fish.js';
import { undergroundOf, ugMapOf, caveNear } from '../shared/underground.js';
import * as SK from '../shared/skate.js';
import { store } from './store.js';
import * as skate from './systems/skate.js';
import * as fishing from './systems/fishing.js';
import * as vehicles from './systems/vehicles.js';
import * as underground from './systems/underground.js';
import * as trains from './systems/trains.js';
import { spawnNpc } from './systems/npc.js';

// you, there (off any train, up out of the ground, facing a)
function moveMe(world, p, x, y, a) {
  const ped = p.ped;
  if (ped.onTrain) trains.alight(world, ped, ped.x, ped.y);
  if (ped.board) skate.hopOff(world, ped);
  if (ped.fishing && ped.fishing.F) fishing.cancel(world, p, null);
  ped.sub = false; ped.ug = 0; ped.x = x; ped.y = y; ped.lz = 0; ped.vx = 0; ped.vy = 0;
  if (Number.isFinite(a)) ped.a = a;
  p.teleportAt = world.time; p.meDirty = true;
}
const free = (p) => (!p.ped || p.ped.dead ? '[dev] Not while you\'re down.' : p.ped.vehId ? '[dev] Get out of the vehicle first.' : p.ped.hidden ? '[dev] Step outside first.' : null);
const ahead = (ped, d) => ({ x: ped.x + Math.cos(ped.a) * d, y: ped.y + Math.sin(ped.a) * d });
const walk = (world, x, y) => !PED_BLOCK[world.map.tileAtPx(x, y)] && !world.map.isWater(x, y);

// ---- skateboarding -------------------------------------------------------------------------------------------------
const RAILS = new Set(['ledge', 'flatbar', 'planter_fl', 'planter_g', 'bench_a', 'bench_b', 'bench_m', 'pbench']);
const RAMPS = new Set(['kicker', 'qpipe', 'pyramid']);
function nearestProp(world, ped, keep) {
  let best = null, bd = Infinity;
  for (const q of world.map.props) { if (!q || !keep(q.t)) continue; const d = Math.hypot(q.x - ped.x, q.y - ped.y); if (d > 40 && d < bd) { bd = d; best = q; } }
  return best;
}
const boardUp = (world, p) => { if (!skate.has(p)) { p.profile.inventory.skateboard = 1; p.meDirty = true; } return p.ped.board || skate.hopOn(world, p, p.ped); };
export function devSkate(world, p, msg) {
  const err = free(p);
  if (err) return err;
  const ped = p.ped, k = String(msg.k || 'on');
  if (k === 'on') { if (!boardUp(world, p)) return '[dev] Can\'t ride here - stand on a road, a pavement or a plaza.'; world.notify(p, '[dev] On your board.', 'info'); return null; }
  if (k === 'special') { skate.devSpecial(world, p); if (!ped.board) boardUp(world, p); world.notify(p, '[dev] SPECIAL on: tricks are their specials, worth three times, till you bail.', 'info'); return null; }
  if (k === 'spot' || k === 'session') {
    const S = world.map.skateSpots || [];
    if (!S.length) return '[dev] There\'s no skate spot on this map (World v3 has Midtown\'s, by the El).';
    let q = S[0], bd = Infinity;
    for (const s of S) { const d = Math.hypot((s.x + s.w / 2) * TILE - ped.x, (s.y + s.h / 2) * TILE - ped.y); if (d < bd) { bd = d; q = s; } }
    let at = null;
    for (let r = 0; r < 8 && !at; r++) for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) { const x = (q.x + q.w / 2 + dx * r) * TILE, y = (q.y + q.h - 2 - dy * r) * TILE; if (walk(world, x, y)) { at = { x, y }; break; } }
    if (!at) return `[dev] Couldn't find open ground at ${q.name}.`;
    moveMe(world, p, at.x, at.y, -Math.PI / 2);
    boardUp(world, p);
    if (k === 'session') skate.startSession(world, p, q);
    else world.notify(p, `[dev] At ${q.name}, on your board.`, 'info');
    return null;
  }
  if (k === 'rail' || k === 'ramp') {
    const q = nearestProp(world, ped, (t) => (k === 'rail' ? RAILS.has(t) : RAMPS.has(t)));
    if (!q) return `[dev] No ${k === 'rail' ? 'ledge, flat bar or bench' : 'kicker, quarter pipe or pyramid'} on this map.`;
    // a run-up: along the rail as the tricks see it (shared/skate.js: a bench may run either way), from either end; straight
    // at a ramp from below it (a quarter pipe's lip faces north: you come at it from the south)
    let runs;
    if (k === 'rail') {
      const pi = world.map.props.indexOf(q), g = SK.nearby(world.map, q.x, q.y).find((sg) => sg.pi === pi);
      runs = g ? [[g.x0 - g.ux * 110 - q.x, g.y0 - g.uy * 110 - q.y, Math.atan2(g.uy, g.ux)], [g.x1 + g.ux * 110 - q.x, g.y1 + g.uy * 110 - q.y, Math.atan2(-g.uy, -g.ux)]] : [[-(q.w || 96) / 2 - 110, 0, 0], [(q.w || 96) / 2 + 110, 0, Math.PI]];
    } else runs = q.t === 'qpipe' ? [[0, 170, -Math.PI / 2]] : [[0, 150, -Math.PI / 2], [0, -150, Math.PI / 2], [-150, 0, 0]];
    let at = null;
    for (const [dx, dy, a] of runs) if (walk(world, q.x + dx, q.y + dy)) { at = { x: q.x + dx, y: q.y + dy, a }; break; }
    if (!at) return `[dev] No run-up clear to the ${q.t}.`;
    moveMe(world, p, at.x, at.y, at.a);
    boardUp(world, p);
    world.notify(p, `[dev] Lined up on a ${q.t}: push at it, ${k === 'rail' ? 'ollie onto it and keep your balance' : 'and ollie off the lip'}.`, 'info');
    return null;
  }
  return '[dev] Skate what? (on, spot, session, special, rail, ramp)';
}

// ---- shopping carts ------------------------------------------------------------------------------------------------
function cartAt(world, x, y, a) { const v = world.spawnVehicle('cart', x, y, a, { npcOwned: false }); v.parked = false; return v; }
function seatNpc(world, v, s) { const c = spawnNpc(world, 'casual', v.x, v.y); if (!c) return null; c.vehId = v.id; c.seat = s; v.seats[s] = c.id; return c; }
export function devCart(world, p, msg) {
  const err = free(p);
  if (err) return err;
  const ped = p.ped, k = String(msg.k || 'pair');
  if (k === 'pair') {
    const at = ahead(ped, 30), v = cartAt(world, at.x, at.y, ped.a);
    v.issuedTo = p.pid;
    v.seats[0] = ped.id; ped.vehId = v.id; ped.seat = 0; p.lastVehicle = v.id; p.meDirty = true;
    seatNpc(world, v, 1);
    world.notify(p, '[dev] At the handle with a friend in the basket. Crash it and they go flying.', 'info');
    return null;
  }
  if (k === 'headon') {   // two loaded carts a little way ahead, rolling at each other
    const c = ahead(ped, 170), nx = -Math.sin(ped.a), ny = Math.cos(ped.a), sp = VEHICLES.cart.max * 0.75;
    for (const s of [-1, 1]) {
      const v = cartAt(world, c.x + nx * 120 * s, c.y + ny * 120 * s, Math.atan2(-ny * s, -nx * s));
      seatNpc(world, v, 0); seatNpc(world, v, 1);
      v.vx = -nx * s * sp; v.vy = -ny * s * sp;
    }
    world.notify(p, '[dev] Two loaded carts head on, just ahead of you.', 'info');
    return null;
  }
  if (k === 'tipped' || k === 'crushed') {
    const at = ahead(ped, 50), v = cartAt(world, at.x, at.y, ped.a + Math.PI / 2);
    v.parked = true;
    if (k === 'tipped') { v.tipped = true; v.flat = true; world.notify(p, '[dev] A cart over on its side: take it to stand it up.', 'info'); }
    else { vehicles.explode(world, v, null); world.notify(p, '[dev] A crushed cart.', 'info'); }
    return null;
  }
  return '[dev] Cart what? (pair, headon, tipped, crushed)';
}

// ---- fishing ---------------------------------------------------------------------------------------------------------
const REEF_D = [14, 44, 45, 52, 59], MARSH_D = [53, 65];
// the middles of the districts (sampled once a map: where to look for a water far off)
function middles(m) {
  if (m._devMids) return m._devMids;
  const acc = new Map();
  for (let ty = m.y0; ty < m.y0 + m.h; ty += 8) { const r = m.row(ty); for (let tx = m.x0; tx < m.x0 + m.w; tx += 8) { const d = m.dist[r + m.col(tx)], a = acc.get(d) || acc.set(d, [0, 0, 0]).get(d); a[0] += tx; a[1] += ty; a[2]++; } }
  const out = new Map();
  for (const [d, [x, y, n]] of acc) out.set(d, { x: (x / n + 0.5) * TILE, y: (y / n + 0.5) * TILE });
  return (m._devMids = out);
}
// where to start looking for a water: you, and then (for the ones that are only in certain places) those places
function seeds(world, ped, w, spot) {
  const m = world.map, out = [{ x: ped.x, y: ped.y, R: 260 }], mids = middles(m), at = (d) => mids.get(d);
  const add = (q, R = 200) => { if (q) out.push({ x: q.x, y: q.y, R }); };
  if (spot === 'falls') for (const s of m.natureSites || []) if (s.falls && Number.isFinite(s.falls.x)) add({ x: s.falls.x, y: s.falls.y + 160 }, 40);
  if (spot === 'mangrove' || w === 'swamp') { for (const d of MARSH_D) add(at(d), 260); for (const s of m.natureSites || []) if (s.kind === 'marsh') add(s, 60); for (const l of m.landmarks || []) if (l.type === 'marsh') add({ x: l.x + l.w / 2, y: l.y + l.h / 2 }, 160); }
  if (w === 'reef') for (const d of REEF_D) add(at(d), 260);
  if (spot === 'pocket') for (const c of (m.waters && m.waters.ch) || []) for (const q of c.p || []) add({ x: q[0] * TILE, y: q[1] * TILE }, q[2] + 8);   // (the rivers' calm pockets: shared/world3-rapids.js)
  if (spot === 'point') for (const s of m.natureSites || []) if (s.kind === 'fishpoint') add(s, 40);   // (the coasts' rock fishing points: shared/world3-coast.js)
  if (spot === 'lily' || w === 'pond') for (const [d, q] of mids) if (DISTRICTS[d] && (DISTRICTS[d].style === 'park' || d === 12)) add(q, 200);
  return out;
}
// The rest of the world, when it isn't near: tiles of that kind of water a few tiles apart (once a map), the nearest first,
// each searched round for a bank
const KIND = (w, spot) => (spot === 'pilings' || w === 'pier' ? 'dock' : spot === 'lily' ? 'park' : spot === 'drop' || w === 'pond' || w === 'lake' ? 'lake' : spot === 'bridge' || spot === 'falls' || spot === 'pocket' || w === 'river' || w === 'creek' ? 'river' : 'sea');
function candidates(m, kind) {
  const C = (m._devFish ||= {});
  if (C[kind]) return C[kind];
  const out = [];
  for (let ty = m.y0 + 2; ty < m.y0 + m.h - 2; ty += 6) {
    const r = m.row(ty);
    for (let tx = m.x0 + 2; tx < m.x0 + m.w - 2; tx += 6) {
      const i = r + m.col(tx), t = m.tiles[i], wet = t === T.WATER || t === T.DEEP;
      const hit = kind === 'dock' ? t === T.DOCK : !wet ? false : kind === 'park' ? fishing.parkish(m, tx, ty, m.dist[i]) : kind === 'lake' ? !!(m.lake && m.lake[i]) : kind === 'river' ? !!(m.river && m.river[i]) && !(m.lake && m.lake[i]) : !(m.river && m.river[i]);
      if (hit) out.push((tx + 0.5) * TILE, (ty + 0.5) * TILE);
    }
  }
  return (C[kind] = out);
}
function farBank(world, ped, w, spot, want) {
  const L = candidates(world.map, KIND(w, spot)), order = [];
  for (let k = 0; k < L.length; k += 2) order.push([Math.hypot(L[k] - ped.x, L[k + 1] - ped.y), L[k], L[k + 1]]);
  order.sort((a, b) => a[0] - b[0]);
  const tried = [];
  for (const [, x, y] of order) {
    if (tried.length >= 80) break;
    if (tried.some(([a, b]) => Math.abs(a - x) < 40 * TILE && Math.abs(b - y) < 40 * TILE)) continue;
    tried.push([x, y]);
    const b = fishing.bankNear(world, x, y, 28, want, PED_BLOCK);
    if (b) return b;
  }
  return null;
}
const WHERE = { pond: 'a pond', lake: 'a lake', river: 'a river', creek: 'a creek', swamp: 'the marshes', shore: 'the shallows', pier: 'a pier', reef: 'the reef' };
const WATER_LABEL = { lily: 'a park\'s lily pond (the Golden Koi)', drop: 'a lake\'s drop-off (Old Ironsides)', falls: 'the foot of a waterfall (the Rainbow King)', bridge: 'a river under a bridge (Big Muddy, at night)', mangrove: 'the salt marsh (the Swamp Dragon, the Silver King at dusk)', pilings: 'a pier\'s pilings (the Barn Door)', pocket: 'a river\'s calm pocket (the big trout and bass)', point: 'a rock fishing point on the coast (the stripers and the redfish)' };
export function devFish(world, p, msg) {
  const ped = p.ped, prof = p.profile, k = String(msg.k || 'kit');
  if (!ped) return '[dev] No character.';
  const kit = () => { if (prof.weapons.rod === undefined) prof.weapons.rod = 0; for (const id of FS.ROD_IDS) if (id !== 'rod') prof.inventory[id] = Math.max(1, prof.inventory[id] || 0); p.meDirty = true; };
  switch (k) {
    case 'kit': {
      kit();
      for (const id of FS.BAIT_IDS) prof.inventory[id] = (prof.inventory[id] || 0) + 20;
      world.notify(p, '[dev] Every rod (the Fishing Pole, cane, baitcaster, fly, surf, big-game) and 20 of every bait.', 'info');
      store.touch();
      return null;
    }
    case 'go': {
      const err = free(p);
      if (err) return err;
      const w = msg.w ? String(msg.w) : null, spot = msg.spot ? String(msg.spot) : null;
      const want = (h) => h && (!w || h.water === w) && (!spot || h.spot === spot);
      let b = null;
      for (const s of seeds(world, ped, w, spot)) { b = fishing.bankNear(world, s.x, s.y, s.R, want, PED_BLOCK); if (b) break; }
      if (!b) b = farBank(world, ped, w, spot, want);
      if (!b) return `[dev] Not on this map: ${spot ? WATER_LABEL[spot] || spot : WHERE[w] || w}.`;
      kit();
      moveMe(world, p, b.x, b.y, b.a);
      world.notify(p, `[dev] At ${spot ? WATER_LABEL[spot] || spot : WHERE[b.hab.water] || FS.WATER_NAME[b.hab.water]}, facing the water, a rod in hand: hold the action button to cast.`, 'info');
      return null;
    }
    case 'cave': {   // the cave's still pool (the Ghost Koi): in through the mine and to its edge
      const err = free(p);
      if (err) return err;
      const L = undergroundOf(world.map), K = L && caveNear(L, ped.x, ped.y), pool = K && K.ch && K.ch.pool;
      if (!pool) return '[dev] No cave on this map.';
      moveMe(world, p, K.mouth.x, K.mouth.y);
      if (!underground.enterCave(world, p, K)) return '[dev] Couldn\'t get into the cave.';
      const U = ugMapOf(world.map), wetU = (x, y) => { const t = U.tileAtPx(x, y); return t === T.WATER || t === T.DEEP; };
      let at = null;
      for (let r = 40; r < 260 && !at; r += 8) for (let i = 0; i < 24; i++) {
        const a = (i / 24) * Math.PI * 2, x = pool.x + Math.cos(a) * r, y = pool.y + Math.sin(a) * r;
        if (!wetU(x, y) && !PED_BLOCK[U.tileAtPx(x, y)] && wetU(x - Math.cos(a) * 34, y - Math.sin(a) * 34)) { at = { x, y, a: a + Math.PI }; break; }
      }
      if (at) { ped.x = at.x; ped.y = at.y; ped.a = at.a; ped.vx = ped.vy = 0; }
      kit();
      world.notify(p, '[dev] At the cave\'s still pool (the Ghost Koi lives here): a light helps.', 'info');
      return null;
    }
    case 'boat': {   // out at sea, a boat sitting still, you at its wheel
      const err = free(p);
      if (err) return err;
      const O = world.map.offshore || [];
      if (!O.length) return '[dev] No open sea on this map.';
      let q = O[0], bd = Infinity;
      for (const o of O) { const d = Math.hypot(o.x - ped.x, o.y - ped.y); if (d < bd) { bd = d; q = o; } }
      kit();
      moveMe(world, p, q.x, q.y, 0);
      const v = world.spawnVehicle('speedboat', q.x, q.y, 0, { npcOwned: false });
      v.issuedTo = p.pid; v.seats[0] = ped.id; ped.vehId = v.id; ped.seat = 0; p.lastVehicle = v.id;
      world.notify(p, '[dev] Out at sea in a boat, sitting still: fish over the side (by day the open water, after dark the deep).', 'info');
      return null;
    }
    case 'bite': {
      const f = String(msg.f || 'now'), rig = (p.devFish ||= {});
      if (f === 'now') rig.now = true;
      else if (f === 'rare' || f === 'legend' || FS.FISH_BY_ID[f]) rig.next = f;
      else return `[dev] No fish "${f}".`;
      world.notify(p, f === 'now' ? '[dev] The next bite comes at once.' : `[dev] The next fish: ${f === 'legend' ? 'this water\'s legendary' : f === 'rare' ? 'a rare one or a trophy from this water' : FS.FISH_BY_ID[f].name} (the line won't snap).`, 'info');
      return null;
    }
    case 'easy': { const rig = (p.devFish ||= {}); rig.easy = !rig.easy; world.notify(p, rig.easy ? '[dev] Easy fights: every fish fights like a bluegill (toggle).' : '[dev] Fights back to normal.', 'info'); return null; }
    case 'cooler': {
      const creel = (prof.creel ||= []), pool = FS.FISH.filter((q) => q.rare < 5);
      for (let i = 0; i < 10 && creel.length < 30; i++) { const f = pool[Math.floor(world.rand() * pool.length)]; creel.push([f.id, FS.weighFish(f, world.rand)]); }
      p.meDirty = true; store.touch();
      world.notify(p, `[dev] Fish in your cooler (${creel.length}): sell them at a fish market or a bait shop.`, 'info');
      return null;
    }
    case 'clear': prof.fishLog = {}; prof.creel = []; p.meDirty = true; store.touch(); world.notify(p, '[dev] Your fishing log and your cooler, emptied.', 'info'); return null;
    case 'records': store.kept.fishRecords = {}; store.touch(); world.notify(p, '[dev] The records board, wiped.', 'info'); return null;
    default: return '[dev] Fish what? (kit, go, cave, boat, bite, easy, cooler, clear, records)';
  }
}
