// Police stations: walk in the front door to an interior (front desk), sign up for duty, get
// locked in the armory to pick a department weapon, then walk out into the fenced motor pool
// and take any cruiser or police motorcycle. The pool's sliding gate opens for officers (and
// for anyone already inside who wants out). Taken vehicles are replaced for the next recruit.
import { K } from '../../shared/constants.js';
import { WEAPONS } from '../../shared/items.js';
import { SPAWN_PROTECT_S, POLICE_ARMORY } from '../../shared/rules.js';
import { store } from '../store.js';
import * as homes from './homes.js';
import * as combat from './combat.js';

const TILE = 32;
const IN_FIGHT_S = 6;        // can't duck into the station this soon after fighting
const GATE_CLOSE_S = 1.2;    // gate stays open this long after the last officer clears it
const REFILL_EVERY_S = 20;   // empty bays are restocked when nobody is watching

export function init(world) {
  world.poolState = (world.map.motorPools || []).map(() => ({ open: false, closeAt: 0 }));
  for (let i = 0; i < world.poolState.length; i++) refill(world, i, true);
}

const pools = (world) => world.map.motorPools || [];
export function poolOf(world, x, y) {
  const list = pools(world);
  for (let i = 0; i < list.length; i++) {
    const mp = list[i];
    if (x > mp.tx * TILE && x < (mp.tx + mp.tw) * TILE && y > mp.ty * TILE && y < (mp.ty + mp.th) * TILE) return i;
  }
  return -1;
}

// Put a fresh vehicle on every empty bay (force: even with people around - a new recruit).
export function refill(world, i, force = false) {
  const mp = pools(world)[i];
  if (!mp) return 0;
  let n = 0;
  for (const sp of mp.spots) {
    if (world.query(sp.x, sp.y, 44, K.VEH).length) continue;
    if (!force && [...world.players.values()].some((q) => q.ped && Math.hypot(q.ped.x - sp.x, q.ped.y - sp.y) < 520)) continue;
    const v = world.spawnVehicle(sp.model, sp.x, sp.y, sp.a, {});
    v.despawnable = false; v.motorPool = i; v.parked = true;
    n++;
  }
  return n;
}

export function gatesOpen(world) { return (world.poolState || []).map((s, i) => (s.open ? i : -1)).filter((i) => i >= 0); }

function setGate(world, i, open) {
  const st = world.poolState[i];
  if (st.open === open) return;
  st.open = open;
  for (const pr of pools(world)[i].gate.props) pr.off = open;
  world.broadcast({ e: 'gate', i, open });
}

export function update(world) {
  if (!world.poolState) return;
  const now = world.time;
  if (world.tick % 4 === 2) {
    pools(world).forEach((mp, i) => {
      const g = mp.gate;
      let want = false;
      const nearGate = (x, y, reach) => Math.abs(x - g.x) < g.w / 2 + 60 && Math.abs(y - g.y) < reach;
      for (const p of world.players.values()) {
        const ped = p.ped;
        if (!ped || ped.dead || ped.hidden) continue;
        const v = ped.vehId ? world.get(ped.vehId) : null;
        const x = v ? v.x : ped.x, y = v ? v.y : ped.y;
        if (p.badge && nearGate(x, y, 170)) want = true;                // officers in or out
        else if (poolOf(world, x, y) === i && nearGate(x, y, 130)) want = true; // anyone inside can leave
      }
      for (const v of world.query(g.x, g.y, 200, K.VEH)) if (v.ai && v.ai.kind === 'police' && nearGate(v.x, v.y, 170)) want = true;
      // never close on someone standing or parked in the gateway
      const inGateway = world.query(g.x, g.y, g.w / 2 + 30).some((e) => (e.kind === K.PED || e.kind === K.VEH) && !e.removed && !e.dead && Math.abs(e.y - g.y) < (e.kind === K.VEH ? e.def.L / 2 + 6 : 20) && Math.abs(e.x - g.x) < g.w / 2);
      const st = world.poolState[i];
      if (want || inGateway) { st.closeAt = now + GATE_CLOSE_S; setGate(world, i, true); }
      else if (st.open && now >= st.closeAt) setGate(world, i, false);
    });
  }
  if (world.tick % (REFILL_EVERY_S * 20) === 7) for (let i = 0; i < pools(world).length; i++) refill(world, i, false);
}

// ---- interiors ----------------------------------------------------------------------------
export const stationPoi = (world, p) => (p.ped && p.ped.interior ? world.map.pois[p.ped.interior.poi] : null);

let menuBuilder = () => ({ t: 'menu', opts: [] });
export function setMenuBuilder(fn) { menuBuilder = fn; }

export function openInterior(world, p) {
  const poi = stationPoi(world, p);
  if (!poi || !p.conn) return;
  p.menu = { poi: poi.id };
  p.conn.sendJSON(menuBuilder(world, p, poi));
}

// Walk in through the front door: the lobby and its front desk.
export function enter(world, p, poi) {
  const ped = p.ped;
  if (!ped || ped.dead || ped.vehId) return 'Not right now.';
  if (p.wanted > 0) return 'The desk sergeant takes one look at you and reaches for the cuffs - not while you\'re wanted.';
  if (world.time - Math.max(ped.lastCombatAt || -99, ped.lastHitAt || -99) < IN_FIGHT_S) return 'You can\'t duck inside in the middle of a fight.';
  if (ped.carrying) return 'Set the crate down first.';
  ped.hidden = true; ped.inside = null;
  ped.interior = { kind: 'lobby', poi: poi.id };
  ped.vx = 0; ped.vy = 0; ped.rollT = 0; ped.fishing = null;
  ped.x = poi.x; ped.y = poi.y;
  world.place(ped); // out of the spatial grid right away
  world.emit(poi.x, poi.y, { e: 'door', x: poi.x, y: poi.y });
  p.meDirty = true;
  openInterior(world, p);
  return null;
}

export function toArmory(world, p) {
  const ped = p.ped;
  if (!ped || !ped.interior) return 'Not inside a station.';
  if (!p.badge) return 'Officers only past this door.';
  ped.interior.kind = 'armory';
  const poi = world.map.pois[ped.interior.poi];
  if (poi && poi.pool !== undefined) refill(world, poi.pool, true); // fresh vehicles for the new shift
  p.meDirty = true;
  return null;
}

function stepOut(world, p, x, y) {
  const ped = p.ped;
  ped.hidden = false; ped.interior = null; ped.inside = null;
  ped.x = x; ped.y = y; ped.vx = 0; ped.vy = 0;
  world.place(ped);
  homes.protect(world, ped, SPAWN_PROTECT_S);
  world.emit(x, y, { e: 'door', x, y });
  p.meDirty = true;
}

// Leave by the front door.
export function leave(world, p) {
  const ped = p.ped;
  if (!ped || !ped.interior) return;
  const poi = world.map.pois[ped.interior.poi];
  stepOut(world, p, poi.x + (world.rand() - 0.5) * 24, poi.y + 14);
}

// Out of the armory's back door into the motor pool.
export function toMotorPool(world, p) {
  const ped = p.ped;
  if (!ped || !ped.interior) return;
  const poi = world.map.pois[ped.interior.poi];
  const mp = poi && poi.pool !== undefined ? pools(world)[poi.pool] : null;
  if (!mp) { leave(world, p); return; }
  stepOut(world, p, mp.exit.x, mp.exit.y);
  world.notify(p, 'The motor pool: take any cruiser or motorcycle. The gate opens for you.', 'good');
}

// Pick up a department weapon in the armory (one long gun at a time; the service pistol always).
export function takeWeapon(world, p, id) {
  const prof = p.profile, ped = p.ped;
  if (!p.badge) return 'On-duty officers only.';
  if (!POLICE_ARMORY.includes(id)) return 'Not in this armory.';
  const w = WEAPONS[id];
  if (id !== 'service') for (const other of POLICE_ARMORY) if (other !== 'service' && other !== id && prof.weapons[other] !== undefined) { delete prof.weapons[other]; delete ped.mag[other]; }
  prof.weapons[id] = w.mag * 3;
  ped.mag[id] = w.mag;
  combat.selectWeapon(world, ped, id);
  world.notify(p, `Armory: ${w.name} checked out (${w.mag * 4} rounds).`, 'good');
  p.meDirty = true;
  store.touch();
  return null;
}
