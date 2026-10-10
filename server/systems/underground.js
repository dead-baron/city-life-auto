// What's under the ground (shared/underground.js has the layout): going down and coming up, the police who saw you go,
// the cave's dangers (bats, the den bear, falling rocks), its boat, and mining the ore veins with a pickaxe.
//   * Down a manhole (stand on one of the covers over a sewer route, the action button) or into the Old Granite Mine's
//     adit: you're underground (ped.sub, like the subway's riders, and ped.ug: which underground). Net culling, sight,
//     shots and witnesses already keep the levels apart, so a wanted player who goes down unseen is lost to the
//     street. Officers on foot who saw you go climb down after you a moment later and hunt you through the tunnels.
//   * Up a ladder (any manhole of the route), through the service door into a subway station, or out of the adit.
//   * The cave: bats roosting in three chambers burst out when someone with a light comes near; the bear in the den
//     wakes when you come close and drives you off; rocks come down where the roof is cracked - a trickle of dust
//     first, then the rock (it hurts anyone under it). A motorboat waits on the underground river.
//   * Mining: face a vein with a good enough pickaxe and work it (stand still); the ore comes free, the vein is used up
//     and grows back after a while somewhere near it (seeded). The pickaxes' tiers gate the ores.
import { undergroundOf, UG, PICKS, ORE_BY_ID, bestPick, ugLos, openAt } from '../../shared/underground.js';
import { ITEMS } from '../../shared/items.js';
import { K } from '../../shared/constants.js';
import { pedStep } from '../../shared/physics.js';
import {
  MANHOLE_REACH, LADDER_REACH, MINE_REACH, VEIN_REGROW_S, POLICE_FOLLOW_R, POLICE_FOLLOW_S, POLICE_GIVE_UP_S,
  ROCKFALL_WARN_S, ROCKFALL_DMG, ROCKFALL_R, ROCKFALL_EVERY_S, BATS_REST_S, BEAR_WAKE_R, BEAR_BITE, BEAR_BITE_S,
} from '../../shared/rules.js';
import * as combat from './combat.js';
import * as wildlife from './wildlife.js';
import { store } from '../store.js';

const MOVE_PX = 14, PICK_EVERY_S = 0.45;
export const layoutOf = (world) => undergroundOf(world.map);
const isCop = (e) => !!(e && e.npc && e.npc.role === 'cop');
const PICK_NAME = { 1: 'stone pickaxe', 2: 'iron pickaxe', 3: 'steel pickaxe', 4: 'diamond-tipped pickaxe' };
const oreName = (id) => ITEMS[id].name.toLowerCase();
const anyUg = (world, ug) => { for (const p of world.players.values()) if (p.ped && !p.ped.dead && p.ped.ug === ug) return true; return false; };

// ---- where you are ------------------------------------------------------------------------------------------------------
function manholeNear(L, x, y, r) {
  let best = null, bd = r;
  for (const rt of L.routes) for (const m of rt.manholes) { const d = Math.hypot(m.x - x, m.y - y); if (d < bd) { bd = d; best = m; } }
  return best;
}
function doorNear(L, x, y, r) { for (const rt of L.routes) if (rt.door && Math.hypot(rt.door.x - x, rt.door.y - y) < r) return rt.door; return null; }
// the vein in reach on your level: { v, i, at: its spot now, bare: seconds till it's back (0: there) }
export function veinNear(world, x, y, ug) {
  const L = layoutOf(world);
  if (!L) return null;
  let best = null, bd = MINE_REACH;
  for (const v of L.veins) {
    if ((v.ug || 0) !== (ug || 0)) continue;
    const st = veinState(world, v.i), at = v.alts[st.alt] || v.alts[0];
    const d = Math.hypot(at.x - x, at.y - y);
    if (d < bd) { bd = d; best = { v, i: v.i, at, bare: Math.max(0, st.until - world.time) }; }
  }
  return best;
}
export function veinState(world, i) {
  const m = world.veins || (world.veins = new Map());
  let s = m.get(i);
  if (!s) { s = { until: 0, alt: 0, n: 0 }; m.set(i, s); }
  return s;
}

// ---- the action button -------------------------------------------------------------------------------------------------
export function interaction(world, p) {
  const ped = p.ped;
  if (!ped || ped.vehId) return null;
  const L = layoutOf(world);
  if (!L) return null;
  if (ped.mining) {
    const q = L.veins[ped.mining.i], pct = Math.min(99, Math.round((world.time - ped.mining.at) / ped.mining.dur * 100));
    return { label: `Mining the ${q ? oreName(q.ore) : 'ore'}... ${pct}% (stand still)`, passive: true, run: () => {} };
  }
  if (ped.ug) {
    if (ped.ug === UG.SEWER) {
      const mh = manholeNear(L, ped.x, ped.y, LADDER_REACH);
      if (mh) return { label: 'Climb the ladder up to the street', run: () => climbUp(world, p, mh) };
      const door = doorNear(L, ped.x, ped.y, 46);
      if (door) return { label: `Through the service door up into ${door.name}`, run: () => toStation(world, p, door) };
    }
    if (ped.ug === UG.CAVE && L.cave && Math.hypot(ped.x - L.cave.inside.x, ped.y - L.cave.inside.y) < 56) return { label: 'Walk out of the cave', run: () => leaveCave(world, p) };
    return mineInteraction(world, p, ped);
  }
  const mh = manholeNear(L, ped.x, ped.y, MANHOLE_REACH);
  if (mh) return { label: 'Lift the manhole cover and climb down into the sewer', run: () => goDown(world, p, mh) };
  if (L.cave && Math.hypot(ped.x - L.cave.mouth.x, ped.y - L.cave.mouth.y) < 30) return { label: 'Go into the cave (it\'s pitch dark: bring a light)', run: () => enterCave(world, p) };
  return mineInteraction(world, p, ped);
}
function mineInteraction(world, p, ped) {
  const q = veinNear(world, ped.x, ped.y, ped.ug || 0);
  if (!q) return null;
  const name = ITEMS[q.v.ore].name;
  if (q.bare > 0) return { label: `Worked out - grows back near here in ${Math.ceil(q.bare / 60)} min`, run: () => world.notify(p, 'This vein is worked out. It grows back somewhere near here in a while; try another.', 'info') };
  const pick = bestPick(p.profile.inventory);
  if (!pick) return { label: `${name} vein - you need a pickaxe`, run: () => world.notify(p, 'You need a pickaxe: hardware stores and the hunting outfitters sell them.', 'warn') };
  if (PICKS[pick].tier < q.v.need) return { label: `${name} vein - needs a ${PICK_NAME[q.v.need]} or better`, run: () => world.notify(p, `Your ${PICK_NAME[PICKS[pick].tier]} just skids off it. ${name} needs a ${PICK_NAME[q.v.need]} or better.`, 'warn') };
  return { label: `Mine the ${oreName(q.v.ore)} vein (${PICK_NAME[PICKS[pick].tier]})`, run: () => beginMining(world, p, q.i) };
}

// ---- down and up -------------------------------------------------------------------------------------------------------
function moveTo(world, p, x, y, ug) {
  const ped = p.ped;
  ped.x = x; ped.y = y; ped.vx = 0; ped.vy = 0; ped.rollT = 0; ped.lz = 0;
  ped.sub = !!ug; ped.ug = ug || 0;
  ped.mining = null; ped.work = null;
  p.teleportAt = world.time; p.meDirty = true;
  sendLayer(world, p);
}
export function goDown(world, p, mh) {
  const ped = p.ped;
  if (!ped || ped.dead || ped.vehId || ped.ug) return false;
  if (ped.carrying) { world.notify(p, 'Set the crate down first.', 'warn'); return false; }
  world.emit(mh.x, mh.y, { e: 'manhole', x: mh.x, y: mh.y, down: 1 });
  // who saw you go: officers on foot up here, close, with a clear view - they climb down after you
  let seen = 0;
  if (p.wanted > 0 && !(p.wanted === 1 && p.soft)) {   // (a star from small crimes: nobody climbs down after you for that - stops.js)
    for (const e of world.query(ped.x, ped.y, POLICE_FOLLOW_R, K.PED)) {
      if (!isCop(e) || e.dead || e.sub || e.vehId || seen >= 3) continue;
      if (!world.map.los(e.x, e.y, ped.x, ped.y)) continue;
      e.ugFollow = { at: world.time + POLICE_FOLLOW_S + seen * 0.8, x: mh.x, y: mh.y, ug: UG.SEWER, who: p.pid };
      (world.ugCops ||= new Set()).add(e.id);   // (copsStep: only these, not every entity every tick)
      seen++;
    }
  }
  moveTo(world, p, mh.x, mh.y, UG.SEWER);
  if (p.wanted > 0) world.notify(p, seen ? 'The police saw you go down - they\'re coming down after you!' : 'Nobody saw you go down. Down here the street can\'t see you.', seen ? 'bad' : 'good');
  else world.notify(p, 'Down the ladder into the sewer. The ladders up are under the manhole covers along the street.', 'info');
  return true;
}
export function climbUp(world, p, mh) {
  const ped = p.ped;
  if (!ped || ped.dead || ped.vehId) return false;
  moveTo(world, p, mh.x, mh.y, 0);
  world.emit(mh.x, mh.y, { e: 'manhole', x: mh.x, y: mh.y, up: 1 });
  world.notify(p, 'You push the cover aside and climb out onto the street.', 'info');
  return true;
}
export function toStation(world, p, door) {
  const st = world.map.rail.stations[door.st];
  if (!st || !p.ped) return false;
  moveTo(world, p, st.platform.x, st.platform.y, 0);
  world.notify(p, `Through the service door, along the platform and up the stairs: ${st.name}.`, 'info');
  return true;
}
export function enterCave(world, p) {
  const L = layoutOf(world), ped = p.ped;
  if (!L.cave || !ped || ped.dead || ped.vehId || ped.ug) return false;
  if (ped.carrying) { world.notify(p, 'Set the crate down first.', 'warn'); return false; }
  moveTo(world, p, L.cave.inside.x, L.cave.inside.y, UG.CAVE);
  world.notify(p, p.profile.light ? 'Into the cave. Your flashlight shows the way.' : 'Into the cave. It\'s pitch dark in here - switch on a flashlight if you have one.', 'info');
  return true;
}
export function leaveCave(world, p) {
  const L = layoutOf(world);
  if (!L.cave || !p.ped) return false;
  moveTo(world, p, L.cave.mouth.x, L.cave.mouth.y + 26, 0);
  world.notify(p, 'Out into the daylight.', 'info');
  return true;
}
// what the client needs to draw where you are (and its veins): sent on going down / up and when a vein changes
function sendLayer(world, p) {
  if (!p.conn) return;
  const ped = p.ped;
  p.conn.sendJSON({ t: 'ug', ug: (ped && ped.ug) || 0, veins: veinList(world) });
}
function veinList(world) { const out = []; if (world.veins) for (const [i, s] of world.veins) if (s.alt || s.until > world.time) out.push([i, s.alt, Math.max(0, Math.round(s.until - world.time))]); return out; }

// ---- mining ----------------------------------------------------------------------------------------------------------------
export function beginMining(world, p, i) {
  const ped = p.ped, L = layoutOf(world), v = L.veins[i];
  if (!ped || ped.dead || ped.vehId || !v) return 'no';
  const pick = bestPick(p.profile.inventory);
  if (!pick || PICKS[pick].tier < v.need) return 'pick';
  if (veinState(world, i).until > world.time) return 'bare';
  if (ped.carrying) { world.notify(p, 'Set the crate down first.', 'warn'); return 'busy'; }
  const st = veinState(world, i), at = v.alts[st.alt] || v.alts[0];
  ped.mining = { i, at: world.time, dur: PICKS[pick].s, x: ped.x, y: ped.y, next: world.time, vx: at.x, vy: at.y, tier: PICKS[pick].tier };
  ped.vx = 0; ped.vy = 0; ped.a = Math.atan2(at.y - ped.y, at.x - ped.x);
  if (p.conn) p.conn.sendJSON({ t: 'mine', dur: ped.mining.dur, x: at.x, y: at.y });
  world.notify(p, `You swing the ${PICK_NAME[PICKS[pick].tier]} at the ${oreName(v.ore)}... (stand still)`, 'info');
  p.meDirty = true;
  return null;
}
function stopMining(world, p, why) {
  p.ped.mining = null;
  if (p.conn) p.conn.sendJSON({ t: 'mine', dur: 0 });
  if (why) world.notify(p, why, 'warn');
  p.meDirty = true;
}
function mineStep(world) {
  const L = layoutOf(world);
  for (const p of world.players.values()) {
    const ped = p.ped, m = ped && ped.mining;
    if (!m) continue;
    if (ped.dead || ped.vehId || world.time < ped.downUntil || (ped.lastHitAt || -99) > m.at || Math.hypot(ped.x - m.x, ped.y - m.y) > MOVE_PX) { stopMining(world, p, ped.dead ? null : 'You stopped mining.'); continue; }
    const v = L.veins[m.i];
    if (world.time >= m.next && world.time - m.at < m.dur) { m.next = world.time + PICK_EVERY_S; world.emit(m.vx, m.vy, { e: 'pick', id: ped.id, x: m.vx, y: m.vy, t: m.tier }); }
    if (world.time - m.at < m.dur) continue;
    ped.mining = null;
    if (p.conn) p.conn.sendJSON({ t: 'mine', dur: 0 });
    const st = veinState(world, m.i);
    if (st.until > world.time) { world.notify(p, 'Someone beat you to it.', 'info'); continue; }
    finishVein(world, v, st);
    const inv = p.profile.inventory, n = v.ore === 'diamond' || v.ore === 'gem' ? 1 : 1 + (world.rand() < 0.35 ? 1 : 0);
    inv[v.ore] = (inv[v.ore] || 0) + n;
    world.emit(m.vx, m.vy, { e: 'pick', id: ped.id, x: m.vx, y: m.vy, t: m.tier, done: 1 });
    world.notify(p, `${n > 1 ? 'Two lumps of ' + oreName(v.ore) : `A${/^[aeiou]/i.test(ITEMS[v.ore].name) ? 'n' : ''} ${oreName(v.ore)}`} - the assay office at the quarry pays best; pawn shops buy it too.`, 'good');
    p.meDirty = true;
    store.touch();
  }
}
// used up: it grows back after a while, at the next of its seeded spots
export function finishVein(world, v, st = veinState(world, v.i)) {
  st.until = world.time + VEIN_REGROW_S;
  st.n++;
  st.alt = v.alts.length > 1 ? (st.alt + 1 + ((v.i * 7 + st.n * 13) % (v.alts.length - 1))) % v.alts.length : 0;
  for (const q of world.players.values()) if (q.ped && Math.hypot(q.ped.x - v.x, q.ped.y - v.y) < 3000) sendLayer(world, q);
}

// ---- the police who followed you down ----------------------------------------------------------------------------------
function copsStep(world, dt) {
  const L = layoutOf(world), cops = world.ugCops;
  if (!cops || !cops.size) return;
  for (const id of cops) {
    const e = world.get(id);
    if (!e || e.removed || e.dead || (!e.ug && !e.ugFollow)) { cops.delete(id); if (e && !e.dead && e.ug) { e.ug = 0; e.sub = false; } continue; }
    if (e.ugFollow && !e.ug) {
      if (e.vehId) { e.ugFollow = null; cops.delete(id); continue; }
      if (world.time < e.ugFollow.at) continue;
      const f = e.ugFollow;
      e.ugFollow = null;
      e.x = f.x; e.y = f.y; e.vx = 0; e.vy = 0; e.sub = true; e.ug = f.ug; e.ugSince = world.time; e.ugSeen = world.time; e.ugHome = { x: f.x, y: f.y };
      world.emit(f.x, f.y, { e: 'manhole', x: f.x, y: f.y, down: 1 });
      continue;
    }
    if (!e.ug || !isCop(e) || e.dead) continue;
    // the nearest wanted player down here they can see
    let t = null, td = 900;
    for (const p of world.players.values()) {
      const q = p.ped;
      if (!q || q.dead || !q.ug || q.ug !== e.ug || !(p.wanted > 0) || (p.wanted === 1 && p.soft)) continue;
      const d = Math.hypot(q.x - e.x, q.y - e.y);
      if (d < td && ugLos(L, e.x, e.y, q.x, q.y)) { td = d; t = q; }
    }
    if (t) { e.ugSeen = world.time; e.ugLast = { x: t.x, y: t.y }; }
    if (world.time - (e.ugSeen || 0) > POLICE_GIVE_UP_S) {   // lost them: back up the nearest ladder
      const mh = manholeNear(L, e.x, e.y, 99999) || e.ugHome;
      e.sub = false; e.ug = 0; e.x = mh.x; e.y = mh.y; e.vx = 0; e.vy = 0;
      cops.delete(id);
      continue;
    }
    const goal = t || e.ugLast;
    if (!goal) { e.vx = 0; e.vy = 0; continue; }
    const dx = goal.x - e.x, dy = goal.y - e.y, d = Math.hypot(dx, dy);
    if (t && d < 300) { e.a = Math.atan2(dy, dx); combat.tryAttack(world, e, e.a); }
    const inp = d > 26 ? { bits: 0, mx: dx / d, my: dy / d, aim: Math.atan2(dy, dx) } : { bits: 0, mx: 0, my: 0, aim: e.a };
    pedStep(e, inp, dt, world.map, { canMove: world.time >= (e.downUntil || 0) && world.time >= (e.stunUntil || 0), canSprint: false, speedMul: 1.05, regenMul: 1, staminaMax: 100 });
  }
}

// ---- the cave's dangers ---------------------------------------------------------------------------------------------------
function caveStep(world, dt) {
  const L = layoutOf(world), K2 = L.cave;
  if (!K2) return;
  const inCave = [];
  for (const p of world.players.values()) if (p.ped && !p.ped.dead && p.ped.ug === UG.CAVE) inCave.push(p);
  const S = world.cave || (world.cave = { roosts: K2.roosts.map(() => ({ until: 0 })), rocks: K2.rocks.map((r, i) => ({ next: 20 + i * 9, fallAt: 0 })), bear: 0, boat: 0 });
  // bats: someone with a light (or right under them) - the roost bursts out and settles again later
  K2.roosts.forEach((r, i) => {
    const st = S.roosts[i];
    if (world.time < st.until) return;
    for (const p of inCave) {
      const d = Math.hypot(p.ped.x - r.x, p.ped.y - r.y);
      if (d < (p.ped.flashOn ? r.r : 90)) { st.until = world.time + BATS_REST_S; world.emit(r.x, r.y, { e: 'bats', x: r.x, y: r.y, n: 16, fx: p.ped.x, fy: p.ped.y }); break; }
    }
  });
  // falling rocks: only while someone is about; a trickle of dust first, then the rock
  K2.rocks.forEach((r, i) => {
    const st = S.rocks[i];
    if (st.fallAt) {
      if (world.time < st.fallAt) return;
      st.fallAt = 0;
      world.emit(r.x, r.y, { e: 'rockfall', x: r.x, y: r.y });
      for (const e of world.query(r.x, r.y, ROCKFALL_R + 20, K.PED)) {
        if (e.dead || e.ug !== UG.CAVE || e.vehId || Math.hypot(e.x - r.x, e.y - r.y) > ROCKFALL_R) continue;
        combat.damage(world, e, ROCKFALL_DMG, null, 'rockfall');
        e.downUntil = Math.max(e.downUntil || 0, world.time + 1.2);
        if (e.player) world.notify(e.player, 'A rock came down on you!', 'bad');
      }
      return;
    }
    if (world.time < st.next) return;
    if (!inCave.some((p) => Math.hypot(p.ped.x - r.x, p.ped.y - r.y) < 700)) { st.next = world.time + 5; return; }
    st.fallAt = world.time + ROCKFALL_WARN_S;
    st.next = world.time + ROCKFALL_EVERY_S[0] + world.rand() * (ROCKFALL_EVERY_S[1] - ROCKFALL_EVERY_S[0]);
    world.emit(r.x, r.y, { e: 'dust', x: r.x, y: r.y, s: ROCKFALL_WARN_S });
  });
  // the den bear and the boat: there while someone is down here
  const bear = S.bear ? world.get(S.bear) : null;
  if (inCave.length && (!bear || bear.removed)) {
    const b = wildlife.spawnAnimal(world, 'blackbear', K2.den.x, K2.den.y);
    b.sub = true; b.ug = UG.CAVE; b.wild.state = 'den'; b.wild.pose = 8; b.wild.hx = K2.den.x; b.wild.hy = K2.den.y;
    S.bear = b.id;
  } else if (!inCave.length && bear && !bear.removed && !anyUg(world, UG.CAVE)) { world.remove(bear); S.bear = 0; }
  if (bear && !bear.removed && !bear.dead) bearStep(world, bear, inCave, dt);
  const boat = S.boat ? world.get(S.boat) : null;
  if (inCave.length && (!boat || boat.removed || boat.dead)) {
    const v = world.spawnVehicle('dinghy', K2.boat.x, K2.boat.y, K2.boat.a, { npcOwned: false });
    v.sub = true; v.ug = UG.CAVE;
    S.boat = v.id;
  } else if (!inCave.length && boat && !boat.removed && !boat.seats.some((s) => s)) { world.remove(boat); S.boat = 0; }
}
// The den bear: asleep in the den; someone comes close and it wakes, rears and drives them off - biting whoever stays -
// then goes back to sleep when they've gone.
function bearStep(world, b, inCave, dt) {
  const L = layoutOf(world), W = b.wild, den = L.cave.den;
  let t = null, td = Infinity;
  for (const p of inCave) {
    const q = p.ped, d = Math.hypot(q.x - b.x, q.y - b.y);
    if (q.vehId) continue;
    if (d < td && (d < BEAR_WAKE_R || (W.state === 'chase' && d < BEAR_WAKE_R * 2.2)) && ugLos(L, b.x, b.y, q.x, q.y)) { td = d; t = q; }
  }
  if (t) {
    if (W.state !== 'chase') { W.state = 'chase'; world.emit(b.x, b.y, { e: 'roar', x: b.x, y: b.y, k: 'bear', id: b.id }); }
    const dx = t.x - b.x, dy = t.y - b.y, d = Math.hypot(dx, dy) || 1;
    W.pose = d < 46 ? 11 : 4;
    if (d < 46 && world.time >= (W.nextBite || 0)) {
      W.nextBite = world.time + BEAR_BITE_S;
      combat.damage(world, t, BEAR_BITE, b, 'bear');
      if (t.player) world.notify(t.player, 'The bear mauls you - get out of its den!', 'bad');
    }
    pedStep(b, d > 34 ? { bits: 0, mx: dx / d, my: dy / d, aim: 0 } : { bits: 0, mx: 0, my: 0, aim: 0 }, dt, world.map, { canMove: true, canSprint: false, speedMul: 1.3, regenMul: 1, staminaMax: 100 });
    b.a = Math.atan2(dy, dx);
    return;
  }
  const d = Math.hypot(den.x - b.x, den.y - b.y);
  if (d > 12) { W.state = 'home'; W.pose = 0; pedStep(b, { bits: 0, mx: (den.x - b.x) / d, my: (den.y - b.y) / d, aim: 0 }, dt, world.map, { canMove: true, canSprint: false, speedMul: 0.5, regenMul: 1, staminaMax: 100 }); }
  else { W.state = 'den'; W.pose = 8; b.vx = 0; b.vy = 0; }
}

// ---- each tick ---------------------------------------------------------------------------------------------------------------
export function update(world, dt) {
  if (!world.players.size) return;
  const L = layoutOf(world);
  if (!L) return;
  mineStep(world);
  copsStep(world, dt);
  caveStep(world, dt);
  // anyone standing in the rock (a level change gone wrong, a stale save): back to the way in
  if (world.tick % 20 === 0) for (const p of world.players.values()) {
    const q = p.ped;
    if (!q || !q.ug || q.vehId || q.dead) continue;
    if (!openAt(L, q.x, q.y)) {
      if (q.ug === UG.CAVE && L.cave) { q.x = L.cave.inside.x; q.y = L.cave.inside.y; }
      else { const mh = manholeNear(L, q.x, q.y, 99999); if (mh) { q.x = mh.x; q.y = mh.y; } }
      p.teleportAt = world.time;
    }
  }
}
// regrowing veins: anyone near hears about them (a vein's state is sent with the layer: sendLayer)
export const _test = { manholeNear, doorNear, veinList };
