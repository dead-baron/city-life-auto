// People going about their lives (task #423, concept sheet AV1): the owner, "populate the world with NPCs doing things -
// hunting, fishing, mining, farming, playing pool or games - so it feels deeper and alive". Activity spots are found by
// rules from the map (spotsOf, once per map):
//   anglers   two at a pier's rail, rods out over the water, a cooler at their feet
//   chess     two at a park's (a plaza's, a cafe's) table in town, sat facing each other over the board; one or two
//             standing by to watch
//   picnic    two or three sat on a picnic blanket (out in the country: round a picnic table)
//   painter   a street painter at an easel, painting the fountain (the statue, the gazebo, the big wheel) from a little way off
//   carwash   washing the car parked in a home's driveway: a sponge, a bucket (when a car's parked there: traffic.js)
//   chat      neighbours chatting between two homes next door to each other
//   pickers   two picking down the rows of a farm's field, a crate of produce by them
// and each is filled with its people when someone comes near (spawned out of everyone's sight, a few groups round a
// player at most), and emptied when nobody's near any more. They stand (sit) and loop a pose: the descriptor's gt (the
// client's personaPose: 'sit', 'sitlow') and prop (pp: 'easel', 'cooler', 'chess': client/art2/people.js), the anglers'
// rods (the fishing bit). They're townsfolk like any other (npc.js): a gunfight sends them running, a fight they stop to
// watch; once it's over they go back to what they were doing, or, far off by then, go on their way like anyone.
// The joggers and the dog walkers are the street personalities (personas.js), out where they belong.
import { K, T, TILE, WEATHER } from '../../shared/constants.js';
import { PED_BLOCK } from '../../shared/map.js';
import { mulberry32 } from '../../shared/rng.js';
import { inAnyView } from '../view.js';
import { dress } from './npclooks.js';
import { LOOKS } from './personas.js';
import { wildStyle } from './wildlife.js';
import { spawnNpc, despawnNpc } from './npc.js';
import { BUILDS } from '../entities.js';

let rng = mulberry32(42300);
export function setRng(r) { rng = r; }

export const ACT_NEAR = 1100;     // a spot this close to someone fills up (when nobody can see it)
export const ACT_DROP = 1600;     // ...and empties when nobody's this close (and nobody can see it)
export const ACT_MAX = 4;         // groups round one player at most
const GAP = 380;                  // never filled closer than this to anyone
const CELL = 1024;
const KINDS = {   // day / night: the chance a spot is on when someone comes near
  anglers: { day: 0.75, night: 0.35 },
  chess: { day: 0.7, night: 0 },
  picnic: { day: 0.65, night: 0 },
  painter: { day: 0.6, night: 0 },
  carwash: { day: 0.35, night: 0 },
  chat: { day: 0.4, night: 0.1 },
  pickers: { day: 0.8, night: 0 },
};
const ANCHOR = { pierrail: 'anglers', pier: 'anglers', fishtable: 'anglers', rods: 'anglers', picnic: 'chess', cafetable: 'chess', blanket: 'picnic', fountain: 'painter', statue: 'painter', gazebo: 'painter', mapboard: 'painter', ferris: 'painter' };

const walkable = (map, x, y) => { const t = map.tileAtPx(x, y); return !PED_BLOCK[t] && t !== T.ROAD && t !== T.BRIDGE && t !== T.WATER && t !== T.DEEP; };
const hsh = (x, y, s = 0) => { let h = (Math.floor(x) * 374761393 + Math.floor(y) * 668265263 + s * 2147483647) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
// which way the water is from a spot on the pier (radians), or null when there's none in reach
function waterward(map, x, y) {
  for (const r of [24, 40, 60]) for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4, t = map.tileAtPx(x + Math.cos(a) * r, y + Math.sin(a) * r); if (t === T.WATER || t === T.DEEP) return a; }
  return null;
}

// ---- the spots, by rules from the map (made once per map) ------------------------------------------------------------------
// { id, k, x, y, a (the way the activity faces: the water, the landmark), wild (out in the country) }; .cells: by 1024 px cell
const SPOTS = new WeakMap();
export function spotsOf(map) {
  let S = SPOTS.get(map);
  if (S) return S;
  const list = [], taken = [];
  const clear = (x, y, r) => !taken.some((q) => Math.abs(q.x - x) < r && Math.abs(q.y - y) < r);
  for (const p of map.props || []) {
    const k = ANCHOR[p.t];
    if (!k) continue;
    const wild = !!wildStyle(map, p.x, p.y);
    let s = null;
    if (k === 'anglers') {   // a standing spot on the deck by the rail, the water beside it
      for (let i = 0; i < 12 && !s; i++) {
        const a = hsh(p.x, p.y, i) * Math.PI * 2, d = 8 + hsh(p.x, p.y, i + 40) * 20, x = p.x + Math.cos(a) * d, y = p.y + Math.sin(a) * d;
        if (!walkable(map, x, y)) continue;
        const wa = waterward(map, x, y);
        if (wa === null) continue;
        const sx = x - Math.sin(wa) * 18, sy = y + Math.cos(wa) * 18;   // (the second angler, along the rail)
        if (walkable(map, sx, sy)) s = { x, y, a: wa };
      }
      if (s && !clear(s.x, s.y, 120)) s = null;
    } else if (k === 'chess') {   // a table in town (a park, a plaza, a cafe's): seats either side of it
      if (wild) { if (walkable(map, p.x - 16, p.y) && walkable(map, p.x + 16, p.y) && clear(p.x, p.y, 200)) list.push({ k: 'picnic', x: p.x, y: p.y, a: 0, wild, table: true }), taken.push({ x: p.x, y: p.y }); continue; }
      if (walkable(map, p.x - 16, p.y) && walkable(map, p.x + 16, p.y) && walkable(map, p.x, p.y + 28) && clear(p.x, p.y, 160)) s = { x: p.x, y: p.y, a: 0 };
    } else if (k === 'picnic') {   // on the blanket
      if (clear(p.x, p.y, 120)) s = { x: p.x, y: p.y, a: 0 };
    } else if (k === 'painter') {   // a little way off the landmark, on open ground, facing it
      if (wild) continue;
      for (let i = 0; i < 10 && !s; i++) {
        const a = hsh(p.x, p.y, i + 7) * Math.PI * 2, d = 78 + hsh(p.x, p.y, i + 70) * 40, x = p.x + Math.cos(a) * d, y = p.y + Math.sin(a) * d;
        if (walkable(map, x, y) && walkable(map, x + Math.cos(a + Math.PI) * 14, y + Math.sin(a + Math.PI) * 14)) s = { x, y, a: a + Math.PI };
      }
      if (s && !clear(s.x, s.y, 300)) s = null;
    }
    if (!s) continue;
    list.push({ k, x: s.x, y: s.y, a: s.a, wild });
    taken.push({ x: s.x, y: s.y });
  }
  // washing the car in the driveway (a home's driveway parking spot: when a car's parked there)
  (map.parking || []).forEach((p, i) => { if (p.drive && clear(p.x, p.y, 60)) { list.push({ k: 'carwash', x: p.x, y: p.y, a: p.a || 0, pi: i, wild: false }); taken.push({ x: p.x, y: p.y }); } });
  // neighbours chatting, on the front yards between two houses next door to each other (between their driveways)
  const drives = (map.parking || []).filter((p) => p.drive);
  for (let i = 1; i < drives.length; i++) {
    const h0 = drives[i - 1], h1 = drives[i], d = Math.hypot(h1.x - h0.x, h1.y - h0.y);
    if (d < 90 || d > 340) continue;
    const x = (h0.x + h1.x) / 2, y = (h0.y + h1.y) / 2, a = Math.atan2(h1.y - h0.y, h1.x - h0.x);
    if (!walkable(map, x - Math.cos(a) * 11, y - Math.sin(a) * 11) || !walkable(map, x + Math.cos(a) * 11, y + Math.sin(a) * 11) || !clear(x, y, 120)) continue;
    list.push({ k: 'chat', x, y, a, wild: false }); taken.push({ x, y });
  }
  // picking in the farms' fields
  for (const f of map.fields || []) {
    const x = f.x + f.w / 2, y = f.y + f.h / 2;
    if (!walkable(map, x - 22, y) || !walkable(map, x + 22, y) || !clear(x, y, 200)) continue;
    list.push({ k: 'pickers', x, y, a: Math.PI / 2, wild: true }); taken.push({ x, y });
  }
  const cells = new Map();
  list.forEach((s, i) => {
    s.id = i;
    const c = (Math.floor(s.x / CELL) << 16) | Math.floor(s.y / CELL);
    if (!cells.has(c)) cells.set(c, []);
    cells.get(c).push(s);
  });
  S = { list, cells };
  SPOTS.set(map, S);
  return S;
}
export function spotsNear(map, x, y, r) {
  const S = spotsOf(map), out = [];
  for (let cx = Math.floor((x - r) / CELL); cx <= Math.floor((x + r) / CELL); cx++) for (let cy = Math.floor((y - r) / CELL); cy <= Math.floor((y + r) / CELL); cy++) {
    for (const s of S.cells.get((cx << 16) | cy) || []) if (Math.hypot(s.x - x, s.y - y) < r) out.push(s);
  }
  return out;
}

// ---- who's there, doing what ---------------------------------------------------------------------------------------------
// members: { x, y, a, arche, look (personas LOOKS key or an npclooks recipe), gt (the pose held), pp (the prop), fish, watch }
function members(s) {
  const c = Math.cos(s.a), sn = Math.sin(s.a), out = [];
  if (s.k === 'anglers') {
    out.push({ x: s.x, y: s.y, a: s.a, arche: 'casual', look: 'fisher', fish: true, pp: 'cooler' });
    out.push({ x: s.x - sn * 18, y: s.y + c * 18, a: s.a, arche: 'casual', look: 'fisher', fish: true });
  } else if (s.k === 'chess') {   // across the table (west and east of it), the board between them; one or two watching
    out.push({ x: s.x - 15, y: s.y, a: 0, arche: rng() < 0.5 ? 'senior' : 'casual', gt: 'sit', pp: 'chess' });
    out.push({ x: s.x + 15, y: s.y, a: Math.PI, arche: rng() < 0.6 ? 'senior' : 'casual', gt: 'sit' });
    const w = 1 + (rng() < 0.5 ? 1 : 0);
    for (let i = 0; i < w; i++) { const x = s.x + (i ? 12 : -8), y = s.y + 26 + i * 4; out.push({ x, y, a: Math.atan2(s.y - y, s.x - x), arche: rng() < 0.5 ? 'senior' : 'casual', watch: true }); }
  } else if (s.k === 'picnic') {
    if (s.table) {   // round a picnic table out in the country, eating
      out.push({ x: s.x - 16, y: s.y, a: 0, arche: 'casual', gt: 'sit' });
      out.push({ x: s.x + 16, y: s.y, a: Math.PI, arche: 'casual', gt: 'sit' });
    } else {          // sat on the blanket, facing each other, the cooler by them
      out.push({ x: s.x - 9, y: s.y + 2, a: 0, arche: 'casual', gt: 'sitlow' });
      out.push({ x: s.x + 9, y: s.y - 2, a: Math.PI, arche: 'casual', gt: 'sitlow' });
      if (rng() < 0.4) out.push({ x: s.x + 1, y: s.y + 10, a: -Math.PI / 2, arche: 'casual', gt: 'sitlow' });
    }
  } else if (s.k === 'painter') {
    out.push({ x: s.x, y: s.y, a: s.a, arche: 'casual', look: 'busker', pp: 'easel' });
  } else if (s.k === 'carwash') {   // beside the car (its .car: carAt), facing it, sponge in hand, the bucket by them
    const v = s.car, a = v ? v.a : s.a, side = s.side || 1, off = ((v && v.def.W) || 44) / 2 + 9, x = (v ? v.x : s.x) - Math.sin(a) * off * side, y = (v ? v.y : s.y) + Math.cos(a) * off * side;
    out.push({ x, y, a: Math.atan2((v ? v.y : s.y) - y, (v ? v.x : s.x) - x), arche: 'casual', pp: 'sponge' });
  } else if (s.k === 'chat') {      // face to face, a word over the fence
    out.push({ x: s.x - c * 11, y: s.y - sn * 11, a: s.a, arche: rng() < 0.4 ? 'senior' : 'casual', chat: true });
    out.push({ x: s.x + c * 11, y: s.y + sn * 11, a: s.a + Math.PI, arche: rng() < 0.4 ? 'senior' : 'casual', chat: true });
  } else if (s.k === 'pickers') {   // down along the rows, picking into a crate
    out.push({ x: s.x - 22, y: s.y, a: s.a, arche: 'farmer', gt: 'kneel', pp: 'crate' });
    out.push({ x: s.x + 22, y: s.y + 6, a: s.a, arche: 'farmer', gt: 'kneel' });
  }
  return out;
}
// the car parked in the driveway (no one in it), or null
function carAt(world, s) {
  for (const v of world.query(s.x, s.y, 24, K.VEH)) if (!v.removed && v.def && v.def.kind === 'car' && !(v.seats || []).some(Boolean) && Math.hypot(v.vx || 0, v.vy || 0) < 1) return v;
  return null;
}

// dress an NPC from a persona look (personas.js LOOKS) or keep the archetype's own
function dressAs(world, ped, look) {
  if (!look || !LOOKS[look]) return;
  const g = dress(world, 'p:' + look, ped.x, ped.y, !!(world.clock && world.clock.isNight), rng, LOOKS[look]);
  if (!g) return;
  const old = ped.build, nb = BUILDS[g.bi] || old;
  ped.app = g.app; ped.app.bd = g.bi; ped.appVer = (ped.appVer || 0) + 1;
  if (old && nb && nb !== old) { ped.maxHp = ped.hp = Math.max(20, Math.round(ped.maxHp / old.hp * nb.hp)); ped.build = nb; }
}

// fill a spot with its people (null if any of them would be seen popping up, or someone's standing there)
export function fill(world, s, opts = {}) {
  const A = (world.acts ||= new Map());
  if (A.has(s.id)) return null;
  if (s.k === 'carwash') {   // only with a car parked there; on the side with room to stand
    const v = carAt(world, s);
    if (!v) return null;
    const off = (v.def.W || 44) / 2 + 9, ok = (k) => walkable(world.map, v.x - Math.sin(v.a) * off * k, v.y + Math.cos(v.a) * off * k) || world.map.tileAtPx(v.x - Math.sin(v.a) * off * k, v.y + Math.cos(v.a) * off * k) === T.ROAD;
    s.car = v; s.side = ok(1) ? 1 : ok(-1) ? -1 : 0;
    if (!s.side) { s.car = null; return null; }
  }
  const ms = members(s);
  s.car = null;
  for (const m of ms) {
    if (!opts.seen && inAnyView(world, m.x, m.y, 64)) return null;
    if (world.query(m.x, m.y, 10, K.PED).some((e) => !e.dead)) return null;
  }
  const g = { id: s.id, k: s.k, x: s.x, y: s.y, ids: [], at: world.time };
  for (const m of ms) {
    const ped = spawnNpc(world, m.arche, m.x, m.y, 'civ');
    dressAs(world, ped, m.look);
    ped.a = m.a; ped.vx = ped.vy = 0;
    const n = ped.npc;
    n.act = { g: s.id, k: s.k, x: m.x, y: m.y, a: m.a, gt: m.gt || null, pp: m.pp || null, fish: !!m.fish, watch: m.watch ? { x: s.x, y: s.y } : null, chat: !!m.chat };
    n.state = 'idle'; n.until = world.time + 9999; n.sway = false; n.umbrellaType = false;
    pose(ped, true);
    g.ids.push(ped.id);
  }
  A.set(s.id, g);
  return g;
}
// hold the activity's pose and prop (on: at the spot; off: away from it - walking back, gone off)
function pose(ped, on) {
  const a = ped.npc.act, gt = on ? a.gt : null, pp = on ? a.pp : null;
  if ((ped.gt || null) !== gt || (ped.pp || null) !== pp) { ped.gt = gt; ped.pp = pp; ped.appVer = (ped.appVer || 0) + 1; }
  if (a.fish) ped.fishing = on ? (ped.fishing || { npc: true }) : null;
}

// npc.js update: for someone at an activity, wandering or standing about -> { inp, factor } or null (walk about like anyone)
const NO_INPUT = { bits: 0, mx: 0, my: 0, aim: 0 };
const seekTo = (ped, tx, ty, s = 1) => { const dx = tx - ped.x, dy = ty - ped.y, d = Math.hypot(dx, dy) || 1, m = Math.min(1, d / 24) * s; return { bits: 0, mx: dx / d * m, my: dy / d * m, aim: Math.atan2(dy, dx) }; };
export function steer(world, ped, now) {
  const n = ped.npc, a = n.act;
  if (!a) return null;
  const d = Math.hypot(a.x - ped.x, a.y - ped.y);
  if (d > 420) { pose(ped, false); n.act = null; n.state = 'wander'; n.until = 0; return null; }   // (far off after a scare: on their way)
  if (d > 5) { if (ped.gt || ped.pp || ped.fishing) pose(ped, false); return { inp: seekTo(ped, a.x, a.y, 0.9), factor: 0.55 }; }   // back to it
  ped.vx = ped.vy = 0;
  if (n.state !== 'idle') { n.state = 'idle'; n.until = now + 9999; }
  pose(ped, true);
  if (a.watch) {   // watching the game: on the board, now and then a glance about
    if (now >= (n.lookAt || 0)) { n.lookAt = now + 2 + rng() * 4; n.glance = rng() < 0.3 ? (rng() - 0.5) * 1.6 : 0; }
    ped.a = Math.atan2(a.watch.y - ped.y, a.watch.x - ped.x) + (n.glance || 0);
  } else if (a.chat) {   // talking: now and then a look away, a nod
    if (now >= (n.lookAt || 0)) { n.lookAt = now + 2 + rng() * 5; n.glance = rng() < 0.25 ? (rng() - 0.5) * 1.2 : 0; }
    ped.a = a.a + (n.glance || 0);
  } else ped.a = a.a;
  return { inp: NO_INPUT, factor: 0.55 };
}

// ---- every second: fill the spots round people, empty the ones nobody's near --------------------------------------------
export function update(world) {
  const A = world.acts;
  if (!A) { if (world.tick % 20 === 13) fillRound(world); return; }
  // every tick: away from their spot (running from trouble, stopped to watch it), the pose and the prop are put down -
  // nobody sits in mid air
  for (const g of A.values()) for (const i of g.ids) {
    const e = world.get(i);
    if (e && e.npc && e.npc.act && (e.gt || e.pp || e.fishing) && Math.hypot(e.x - e.npc.act.x, e.y - e.npc.act.y) > 5) pose(e, false);
  }
  if (world.tick % 20 === 13) fillRound(world);
}
function fillRound(world) {
  const A = (world.acts ||= new Map()), now = world.time;
  const anchors = [];
  for (const p of world.players.values()) if (p.ped && !p.ped.dead) anchors.push(p.ped);
  // empty the groups nobody's near (or whose people are all gone)
  for (const [id, g] of A) {
    g.ids = g.ids.filter((i) => { const e = world.get(i); return e && !e.removed && !e.dead && e.npc && e.npc.act; });
    const near = anchors.some((p) => Math.hypot(p.x - g.x, p.y - g.y) < ACT_DROP) || inAnyView(world, g.x, g.y, 64);
    if (g.ids.length && near) continue;
    if (!near) for (const i of g.ids) { const e = world.get(i); if (e && !inAnyView(world, e.x, e.y, 32)) despawnNpc(world, e); else if (e) { e.npc.act = null; e.gt = e.pp = null; e.fishing = null; e.appVer = (e.appVer || 0) + 1; } }
    A.delete(id);
    (world.actRest ||= new Map()).set(id, now + (g.ids.length ? 30 : 240));   // (emptied by a scare: a good while before it's on again)
  }
  if (!(world.npcBudget > 0) || world.npcCount >= world.npcBudget * 0.85) return;
  const night = !!(world.clock && world.clock.isNight), rest = (world.actRest ||= new Map()), rain = world.weather === WEATHER.RAIN;
  for (const a of anchors) {
    if (a.ug || a.hidden) continue;
    let have = 0;
    for (const g of A.values()) if (Math.hypot(g.x - a.x, g.y - a.y) < ACT_DROP) have++;
    if (have >= ACT_MAX) continue;
    for (const s of spotsNear(world.map, a.x, a.y, ACT_NEAR)) {
      if (A.has(s.id) || now < (rest.get(s.id) || 0)) continue;
      if (anchors.some((b) => Math.hypot(b.x - s.x, b.y - s.y) < GAP)) continue;
      const P = KINDS[s.k];
      if (rain && (s.k === 'carwash' || s.k === 'picnic' || s.k === 'painter' || s.k === 'chess')) continue;
      if (rng() >= (night ? P.night : P.day)) { rest.set(s.id, now + 120 + rng() * 180); continue; }   // (not today: try again later)
      if (!fill(world, s)) { rest.set(s.id, now + 15); continue; }   // (in sight just now, no car in the driveway: a little later)
      if (++have >= ACT_MAX) break;
    }
  }
}
