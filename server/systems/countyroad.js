// The county roads made the concept (the nature showcase, SC3-E: shared/world3-countyroad.js lays them - map.countyRoads):
// while someone is near one, its life is there -
//   - the farmer at his field gate, and his red pickup parked on the lane behind him;
//   - on the concept's own (hero) the red combine at work on the half-harvested wheat: down the ripe rows beside the
//     stubble and back (server/systems/cinefollow.js combineOn: its rows cut as it goes, the chaff and straw out of its
//     back - render/farmart.js), a while's rest between passes;
//   - once everyone has gone well away: the farmer and the pickup home, the field as it was (half standing, half cut),
//     unless someone is working it on the farm-work contract.
import { FARM } from '../../shared/rules.js';
import * as farming from './farming.js';
import { combineOn, cropRun } from './cinefollow.js';
import { spawnNpc, despawnNpc } from './npc.js';

const NEAR = 1800, FAR = 3400, REST_S = 25;
const alive = (e) => !!(e && !e.removed && !e.dead);

export function update(world) {
  if (world.tick % 20 !== 11) return;
  const list = world.map && world.map.countyRoads;
  if (!list || !list.length) return;
  const st = (world.countyRoads ||= list.map(() => ({ truck: 0, farmer: 0, combine: null, rest: 0, away: true })));
  list.forEach((R, i) => {
    const S = st[i];
    let near = false, far = true;
    for (const p of world.players.values()) {
      const e = p.ped;
      if (!e || e.sub || e.ug) continue;
      const d = Math.hypot(e.x - R.x, e.y - R.y);
      if (d < NEAR) near = true;
      if (d < FAR) far = false;
    }
    if (near) {
      S.away = false;
      const v = S.truck && world.get(S.truck);
      if (R.pickup && !alive(v)) {
        const t = world.spawnVehicle('pickup', R.pickup.x, R.pickup.y, R.pickup.a, { parked: true, paint: 0, npcOwned: true });
        S.truck = t.id;
      }
      const f = S.farmer && world.get(S.farmer);
      if (R.farmer && !alive(f)) {
        const ped = spawnNpc(world, 'farmer', R.farmer.x, R.farmer.y, 'civ');
        ped.npc.keep = true; ped.npc.driven = true; ped.a = R.farmer.a; ped.vx = ped.vy = 0;
        S.farmer = ped.id;
      }
      if (R.hero && R.field >= 0 && (!S.combine || S.combine.done) && world.time >= S.rest) {
        if (S.combine) for (const id of S.combine.ids) { const e = world.get(id); if (alive(e)) { if (e.npc) despawnNpc(world, e); else world.remove(e); } }   // (the last pass's machine away: one combine at a time)
        S.combine = startPass(world, R);
        S.rest = world.time + REST_S;
      }
    } else if (far && !S.away) {
      S.away = true;
      const v = S.truck && world.get(S.truck);
      if (alive(v) && !v.seats.some((q) => q) && Math.hypot(v.x - R.pickup.x, v.y - R.pickup.y) < 120) world.remove(v);
      const f = S.farmer && world.get(S.farmer);
      if (alive(f) && f.npc) despawnNpc(world, f);
      S.truck = 0; S.farmer = 0;
      if (S.combine && !S.combine.done) {   // (the combine home too: its pass ended, it and its driver gone)
        S.combine.done = true;
        for (const id of S.combine.ids) { const e = world.get(id); if (!alive(e)) continue; if (e.npc) despawnNpc(world, e); else world.remove(e); }
      }
      S.combine = null; S.rest = 0;
      if (R.hero) restore(world, R);
    }
  });
}

// the field as the concept has it again: its rows in the cut stubble, the rest ripe (only once everyone's gone well away)
function restore(world, R) {
  const F = farming.fieldsOf(world)[R.field];
  if (!F || !R.cut) return;
  F.rows.forEach((row, r) => Object.assign(row, farming.cutRow(F.f, F.v, r, row.ok)));
  F.dirty = true;
}

// a pass of the combine: the two ripe rows next to the stubble (where the cut has got to), down their crop and back -
// or, the whole field cut, the field as it was and the first pass again
function startPass(world, R) {
  const F = farming.fieldsOf(world)[R.field];
  if (!F || F.n < 2) return null;
  const ripe = (r) => F.rows[r] && F.rows[r].s === farming.ROW.RIPE;
  let r0 = -1;
  for (let r = 0; r + 1 < F.n && r0 < 0; r++) if (ripe(r) && ripe(r + 1) && ((F.rows[r - 1] && !ripe(r - 1)) || (F.rows[r + 2] && !ripe(r + 2)))) r0 = r;
  if (r0 < 0) { restore(world, R); for (let r = Math.min(3, F.n - 2); r + 1 < F.n && r0 < 0; r++) if (ripe(r) && ripe(r + 1)) r0 = r; }   // (a few rows in from the fence: room for its header)
  if (r0 < 0) return null;
  let run = cropRun(F, r0, 2);
  if (run && R.cut) {   // (the stretch of the rows just short of the cut: the combine working where it shows, by the road)
    const segL = (F.v ? F.f.h : F.f.w) / FARM.segs, c0 = F.v ? R.cut[1] - F.f.y : R.cut[0] - F.f.x, kc = Math.floor(c0 / segL);
    const k1 = Math.min(run.k1, kc - 1), k0 = Math.max(run.k0, k1 - 3);
    if (k1 - k0 >= 1) run = { k0, k1 };
  }
  return run ? combineOn(world, { F, passes: 1, r0, run }, false) : null;
}
