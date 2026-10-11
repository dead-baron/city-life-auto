// The coast guard (H59; the owner, 2026-10-11: "Coastguard jobs: patrol in boats and helicopters to hunt down criminal
// activity on the water, usually smugglers or traffickers. Do search and rescue type missions too"). From the phone (Jobs
// › Flying): a boat patrol - a coast guard boat (the orange rescue boat, shared/vehicles.js rescueboat) issued at the
// nearest harbour - or an air patrol - a rescue helicopter (rescueheli) issued at the nearest helipad; issued like a work
// truck (jobs.js: yours, the ring and the arrows). A shift of calls (shared/rules.js COAST):
//   - smugglers: a speedboat with contraband crates aboard (open cargo: you can see them) runs along the coast from one
//     stretch of water to another, toward Smuggler's Rock (sar.js sitesOf's water near the shore; rescue.js wayTo plans
//     the way round the land; boats.js boatSteer drives it). Get alongside them (or over them, low, in the helicopter)
//     and stay with them: they heave to and put their hands up. Then board them - Act alongside in your boat, or low over
//     them in the helicopter (a crewman goes down the line) - and the crates are seized: a reward and the crew arrested.
//     Lose them (too far for too long), let them reach their drop or sink them with the cargo and the call's lost.
//   - someone overboard: a search circle near where they went in; within sight they're found (the flare). In the boat:
//     pull alongside, slow, and Act - pulled aboard; in the helicopter: the harness (hold Act over them - sar.js's
//     cable, drawn by the page from the job target's hoist). Then ashore: the boat run up slow by dry land, the
//     helicopter landed - handed to the paramedics, paid (more for a quick rescue).
//   update(world, dt)         the shifts (world.js SYSTEMS)
//   start(world, p, mode)     sign on: 'boat' | 'air' -> error | null
//   interaction(world, p)     Act: boarding a stopped smuggler, pulling someone aboard, the harness
//   target(world, p, j)       the job tracker's target (phone.js jobTarget)
//   smugglerAt(world, p, a, b) / overboardAt(world, p, x, y)   a call (tests, the dev menu)
import { K } from '../../shared/constants.js';
import { IN } from '../../shared/input.js';
import { WATER_T, BOAT_BLOCK } from '../../shared/mapcore.js';
import { airfields, findPadSpot, floorAt, FLY } from '../../shared/flight.js';
import { COAST, SAR } from '../../shared/rules.js';
import { mulberry32 } from '../../shared/rng.js';
import { store } from '../store.js';
import { spawnNpc, despawnNpc } from './npc.js';
import { wayTo } from './rescue.js';
import { boatSteer } from './boats.js';
import { sitesOf } from './sar.js';
import * as jobs from './jobs.js';

const rng = mulberry32(5050);
const isBoat = (v) => !!v && v.def.kind === 'boat';
const isAirV = (v) => !!v && v.def.kind === 'air';
const placeName = (m, x, y) => { const d = m.districtAt(x, y); return d ? d.name : 'the coast'; };
const docks = (m) => [...(m.marina || []).filter((b) => !b.gang), ...(m.rentals || []).flatMap((r) => r.spots)];

// ---- signing on ------------------------------------------------------------------------------------------------------------
function boatSpot(world, x, y) {
  const m = world.map, D = docks(m).sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y));
  for (const d of D.slice(0, 12)) for (let r = 0; r <= 320; r += 40) for (let k = 0; k < (r ? 12 : 1); k++) {
    const px = d.x + Math.cos(k * Math.PI / 6) * r, py = d.y + Math.sin(k * Math.PI / 6) * r;
    if (BOAT_BLOCK[m.tileAtPx(px, py)] || !WATER_T[m.tileAtPx(px, py)]) continue;
    if ([[60, 0], [-60, 0], [0, 40], [0, -40]].some(([dx, dy]) => BOAT_BLOCK[m.tileAtPx(px + dx, py + dy)])) continue;
    if (world.query(px, py, 110, K.VEH).length) continue;
    return { x: px, y: py, a: d.a || 0, name: placeName(m, d.x, d.y) };
  }
  return null;
}
export function start(world, p, mode = 'boat') {
  if (!p.ped || p.ped.dead) return 'Not right now.';
  if (p.job) return 'You already have a job - cancel it first.';
  const m = world.map, ped = p.ped;
  let v = null, where = '';
  if (mode === 'air') {
    const pads = airfields(m).pads.filter((q) => !q.roof);
    if (!pads.length) return 'No helipad for the coast guard here.';
    const pad = pads.reduce((a, b) => (Math.hypot(b.x - ped.x, b.y - ped.y) < Math.hypot(a.x - ped.x, a.y - ped.y) ? b : a));
    const avoid = world.query(pad.x, pad.y, 900, K.VEH).map((q) => ({ x: q.x - 110, y: q.y - 110, w: 220, h: 220 }));
    const sp = findPadSpot(m, pad.x, pad.y, 64, 900, avoid) || findPadSpot(m, pad.x, pad.y, 48, 1400);
    if (!sp) return 'No room to park a helicopter there.';
    v = world.spawnVehicle('rescueheli', sp.x, sp.y, -Math.PI / 2, { npcOwned: false });
    v.alt = 0; where = pad.name;
  } else {
    const sp = boatSpot(world, ped.x, ped.y);
    if (!sp) return 'No harbour with room for the patrol boat near here.';
    v = world.spawnVehicle('rescueboat', sp.x, sp.y, sp.a, { npcOwned: false });
    where = `the ${sp.name} docks`;
  }
  v.parked = false; v.npcOwned = false;
  v.issuedTo = p.pid; v.workTruck = true; v.despawnable = false;   // (yours for the shift: not theft)
  v.returnTo = { x: Math.round(v.x), y: Math.round(v.y), label: where };
  p.job = { type: 'coast', mode, truck: v.id, stage: 'wait', nextAt: world.time + COAST.firstS, expires: world.time + COAST.shiftS, busts: 0, saved: 0, text: 'Coast guard: on patrol - stand by for a call' };
  world.notify(p, `Coast guard: your ${mode === 'air' ? 'helicopter' : 'patrol boat'} is waiting at ${where} (the green ring). Calls come over the radio - smugglers running contraband along the coast, people in the water.`, 'good');
  p.meDirty = true;
  store.touch();
  return null;
}

// ---- the calls --------------------------------------------------------------------------------------------------------------
function newCall(world, p) {
  const m = world.map, W = sitesOf(m).water, ped = p.ped, v = world.get(p.job.truck) || ped;
  const near = W.filter((s) => { const d = Math.hypot(s.x - v.x, s.y - v.y); return d >= COAST.dist[0] && d <= COAST.dist[1]; });
  const pool = near.length ? near : W;
  if (!pool.length) { p.job.nextAt = world.time + 30; return null; }
  if (rng() < COAST.smuggle) {
    const den = m.pois.find((q) => q.kind === 'smuggler');
    for (let k = 0; k < 8; k++) {
      const a = pool[Math.floor(rng() * pool.length)];
      const ends = W.filter((s) => { const d = Math.hypot(s.x - a.x, s.y - a.y); return d >= COAST.run[0] && d <= COAST.run[1]; });
      if (!ends.length) continue;
      if (den) ends.sort((s, t) => Math.hypot(s.x - den.x, s.y - den.y) - Math.hypot(t.x - den.x, t.y - den.y));
      const b = ends[k < 3 && den ? 0 : Math.floor(rng() * ends.length)];
      const c = smugglerAt(world, p, a, b);
      if (c) return c;
    }
  }
  const s = pool[Math.floor(rng() * pool.length)];
  return overboardAt(world, p, s.x, s.y);
}

// smugglers running from a to b along the water (null: no way through)
export function smugglerAt(world, p, a, b) {
  const m = world.map, way = wayTo(m, a, b);
  if (!way || way.length < 2) return null;
  const j = p.job;
  const boat = world.spawnVehicle('speedboat', way[0].x, way[0].y, Math.atan2(way[1].y - way[0].y, way[1].x - way[0].x), { npcOwned: true });
  boat.despawnable = false; boat.ai = { kind: 'smuggle' };   // (driven here: boats.js leaves it alone)
  const crew = [0, 1].map((s) => { const c = spawnNpc(world, 'syndicate', boat.x, boat.y, 'civ'); c.vehId = boat.id; c.seat = s; boat.seats[s] = c.id; c.npc.keep = true; return c.id; });
  const crates = [];
  for (let i = 0; i < Math.min(2, boat.def.slots.length); i++) {
    const cr = world.spawnCrate(rng() < 0.3 ? 4 : 3, boat.x, boat.y, { contraband: true, label: 'Contraband' });
    cr.state = 'loaded'; cr.parent = boat.id; cr.slot = i; boat.cargo[i] = cr.id; crates.push(cr.id);
  }
  const where = placeName(m, a.x, a.y);
  j.call = { kind: 'smuggle', boat: boat.id, crew, crates, way: way.map((q) => ({ x: Math.round(q.x), y: Math.round(q.y) })), wi: 1, stopped: false, press: 0, far: 0, at: world.time, where };
  j.stage = 'chase';
  j.text = `Smugglers off ${where} - get alongside and make them stop`;
  world.notify(p, `Radio: a speedboat running contraband off ${where}, heading along the coast. Get alongside (or over them, low) and stay with them till they stop, then board them.`, 'warn');
  (world.coastCalls ||= new Map()).set(p.pid, j.call);
  p.meDirty = true;
  return j.call;
}
// someone overboard at (x, y)
export function overboardAt(world, p, x, y) {
  const j = p.job;
  const ped = spawnNpc(world, 'casual', x, y, 'civ');
  ped.npc.sar = p.pid; ped.npc.keep = true; ped.vx = 0; ped.vy = 0;   // (treading water: npc.js leaves them to us)
  const off = rng() * COAST.circleR * 0.6, oa = rng() * Math.PI * 2, where = placeName(world.map, x, y);
  j.call = { kind: 'overboard', vic: ped.id, x, y, cx: Math.round(x + Math.cos(oa) * off), cy: Math.round(y + Math.sin(oa) * off), found: false, aboard: false, cable: 0, hooked: false, warnAt: -99, at: world.time, where };
  j.stage = 'search';
  j.text = `Someone overboard off ${where} - search the circle`;
  world.notify(p, `Radio: someone's gone overboard off ${where}. Search the circle on your map - ${j.mode === 'air' ? 'the harness (hold Act over them)' : 'pull alongside, slow, and Act to haul them in'}.`, 'warn');
  (world.coastCalls ||= new Map()).set(p.pid, j.call);
  p.meDirty = true;
  return j.call;
}
function clearCall(world, c) {
  if (!c) return;
  if (c.kind === 'smuggle') {
    const b = world.get(c.boat);
    for (const id of c.crew) { const q = world.get(id); if (q && !q.removed) { if (q.vehId && b) { const i = b.seats.indexOf(q.id); if (i >= 0) b.seats[i] = 0; } q.vehId = 0; despawnNpc(world, q); } }
    if (b && !b.removed) { b.ai = null; b.despawnable = true; b.npcOwned = true; }
  } else {
    const q = world.get(c.vic);
    if (q && !q.removed) { if (q.vehId) { const v = world.get(q.vehId); if (v) { const i = v.seats.indexOf(q.id); if (i >= 0) v.seats[i] = 0; } q.vehId = 0; } despawnNpc(world, q); }
  }
}
function endCall(world, p, msg, tone) {
  const j = p.job;
  if (j && j.call) clearCall(world, j.call);
  if (world.coastCalls) world.coastCalls.delete(p.pid);
  if (j) { j.call = null; j.stage = 'wait'; j.nextAt = world.time + COAST.gapS[0] + rng() * (COAST.gapS[1] - COAST.gapS[0]); j.text = 'Coast guard: on patrol - stand by for a call'; }
  if (msg) world.notify(p, msg, tone || 'info');
  p.meDirty = true;
}

// ---- every tick --------------------------------------------------------------------------------------------------------------
export function update(world, dt) {
  if (world.coastCalls) for (const [pid, c] of world.coastCalls) {
    const p = world.players.get(pid);
    if (p && p.job && p.job.type === 'coast' && p.job.call === c) continue;
    clearCall(world, c);
    world.coastCalls.delete(pid);
  }
  for (const p of world.players.values()) if (p.job && p.job.type === 'coast') step(world, p, dt);
}
// the pilot / skipper and what they're in, if it's the job's
function crewIn(world, p) {
  const ped = p.ped, v = ped && !ped.dead && ped.vehId ? world.get(ped.vehId) : null;
  return v && v.id === p.job.truck && ped.seat === 0 ? v : null;
}
function step(world, p, dt) {
  const j = p.job, now = world.time;
  const mine = world.get(j.truck);
  if (!mine || mine.removed || mine.wreckAt || mine.sinkAt) { jobs.failJob(world, p, `Your coast guard ${j.mode === 'air' ? 'helicopter' : 'boat'} is lost. The shift is over.`); return; }
  if (!j.call) { if (now >= j.nextAt && p.ped && !p.ped.dead) newCall(world, p); return; }
  const c = j.call, v = crewIn(world, p);
  if (c.kind === 'smuggle') stepSmuggle(world, p, j, c, v, dt);
  else stepOverboard(world, p, j, c, v, dt);
}

function stepSmuggle(world, p, j, c, v, dt) {
  const b = world.get(c.boat);
  if (!b || b.removed || b.wreckAt || b.sinkAt) { endCall(world, p, 'The smugglers\' boat went down - and the evidence with it.', 'bad'); return; }
  const drv = b.seats[0] ? world.get(b.seats[0]) : null;
  if (!c.stopped) {
    // under way: along the planned way to the drop
    while (c.wi < c.way.length - 1 && Math.hypot(c.way[c.wi].x - b.x, c.way[c.wi].y - b.y) < 110) c.wi++;
    const t = c.way[c.wi];
    if (drv && !drv.dead) boatSteer(world, b, t.x, t.y, COAST.top);
    if (c.wi === c.way.length - 1 && Math.hypot(t.x - b.x, t.y - b.y) < 140) { endCall(world, p, 'The smugglers made their drop and slipped away.', 'bad'); return; }
    // made to stop: alongside them (or low over them) long enough - or nobody at their wheel any more
    const near = v && (isBoat(v) ? Math.hypot(v.x - b.x, v.y - b.y) < COAST.stopR : (v.alt || 0) < COAST.stopAlt && Math.hypot(v.x - b.x, v.y - b.y) < COAST.stopHeliR);
    if (near) { c.press += dt; if (!c.warned) { c.warned = true; world.notify(p, 'Coast guard! Heave to! - stay with them.', 'info'); } }
    else c.press = Math.max(0, c.press - dt * 0.5);
    if (c.press >= COAST.stopS || !drv || drv.dead) {
      c.stopped = true; b.ai = { kind: 'smuggle', stopped: true };
      for (const id of c.crew) { const q = world.get(id); if (q && !q.dead) q.handsUp = true; }
      j.stage = 'board';
      j.text = isAirV(v) ? 'They\'ve stopped - hover low over them and Act to board them' : 'They\'ve stopped - come alongside and Act to board them';
      world.notify(p, 'They\'re heaving to, hands up. Board them and seize the cargo.', 'good');
      p.meDirty = true;
    }
    // lost: too far for too long
    const ref = v || p.ped;
    if (ref && Math.hypot(ref.x - b.x, ref.y - b.y) > COAST.loseR) { c.far += dt; if (c.far > COAST.loseS) { endCall(world, p, 'You lost them. The smugglers got away.', 'bad'); return; } }
    else c.far = 0;
  } else {
    const fwd = Math.hypot(b.vx, b.vy);
    b.input = { throttle: fwd > 10 ? -0.6 : 0, steer: 0, hb: false };
  }
}

function stepOverboard(world, p, j, c, v, dt) {
  const vic = world.get(c.vic);
  if (!vic || vic.removed) { endCall(world, p, 'Another boat picked them up.', 'info'); return; }
  const now = world.time;
  if (!c.found) {
    const ref = v || p.ped;
    if (ref && Math.hypot(ref.x - vic.x, ref.y - vic.y) < COAST.seeR) {
      c.found = true; j.stage = 'rescue';
      j.text = j.mode === 'air' ? 'There - hover low over them and hold Act for the harness' : 'There - pull alongside, slow, and Act to haul them in';
      world.notify(p, 'There they are - and a flare!', 'good');
      p.meDirty = true;
    }
    if (now - c.at > COAST.callS) endCall(world, p, 'Another crew got to them first.', 'info');
    return;
  }
  if (!c.aboard) {
    if (v && isAirV(v)) hoist(world, p, j, c, v, vic, dt);
    return;
  }
  // aboard: ashore with them
  if (vic.vehId !== (v ? v.id : -1) && vic.vehId !== j.truck) { endCall(world, p, 'You lost the one you rescued.', 'bad'); return; }
  const mine = world.get(j.truck);
  let ashore = false;
  if (isBoat(mine)) ashore = Math.hypot(mine.vx, mine.vy) < 50 && landNear(world, mine.x, mine.y, COAST.ashoreR);
  else if (isAirV(mine)) ashore = (mine.alt || 0) <= floorAt(world.map, mine.x, mine.y) + 1 && Math.hypot(mine.vx, mine.vy) < 30 && !WATER_T[world.map.tileAtPx(mine.x, mine.y)];
  if (!ashore) return;
  const took = now - c.at, fast = Math.max(0, Math.min(1, (COAST.parS * 2 - took) / COAST.parS)) * COAST.fast;
  const pay = Math.round((COAST.rescue * (1 + fast)) / 5) * 5;
  p.profile.cash += pay; p.profile.samaritan = (p.profile.samaritan || 0) + COAST.samaritan;
  j.saved++; j.lastPay = { pay, kind: 'overboard' };
  j.expires = Math.max(j.expires, now + COAST.shiftS / 2);
  world.emit(mine.x, mine.y, { e: 'cash', x: mine.x, y: mine.y });
  endCall(world, p, `Handed over to the paramedics ashore. +$${pay}${fast > 0.05 ? ' (a quick rescue)' : ''}, +${COAST.samaritan} Samaritan.`, 'good');
  store.touch();
}
function landNear(world, x, y, r) {
  for (let k = 0; k < 12; k++) { const a = k * Math.PI / 6; for (const d of [r * 0.5, r]) { if (!WATER_T[world.map.tileAtPx(x + Math.cos(a) * d, y + Math.sin(a) * d)]) return true; } }   // (dry land: a beach, a quay, a pier)
  return false;
}
function seatIn(world, p, c, v, vic) {
  if (vic.vehId === v.id) return true;
  const seat = v.seats.findIndex((s, i) => i > 0 && !s);
  if (seat < 0) { if (world.time - c.warnAt > 6) { c.warnAt = world.time; world.notify(p, 'No free seat aboard.', 'warn'); } return false; }
  v.seats[seat] = vic.id; vic.vehId = v.id; vic.seat = seat; vic.vx = 0; vic.vy = 0;
  return true;
}
function aboard(world, p, j, c, v, vic) {
  if (!seatIn(world, p, c, v, vic)) return;
  c.aboard = true; c.hooked = false; c.cable = 0; j.stage = 'ashore';
  j.text = isBoat(v) ? 'Get them ashore - run in slow by dry land' : 'Get them ashore - land on dry ground';
  world.notify(p, 'They\'re aboard, cold and shaken. Get them ashore to the paramedics.', 'good');
  p.meDirty = true;
}
// the harness from the helicopter (as sar.js's: SAR.hoist)
function hoist(world, p, j, c, v, vic, dt) {
  const H = SAR.hoist, now = world.time, held = (p.prevBits || 0) & IN.ACTION;
  const above = (v.alt || 0), across = Math.hypot(v.x - vic.x, v.y - vic.y), drift = Math.hypot(v.vx, v.vy);
  const was = c.cable;
  if (c.hooked) {
    if (held) c.cable = Math.max(0, c.cable - H.winch * dt);
    c.cable = Math.min(c.cable, above);
    if (c.cable <= 0) aboard(world, p, j, c, v, vic);
  } else if (held && across <= H.reach && drift <= H.drift && above > FLY.AIRBORNE) {
    c.cable = Math.min(H.maxLen, c.cable + H.payout * dt);
    if (above <= H.maxLen && c.cable >= above - 6 && seatIn(world, p, c, v, vic)) { c.hooked = true; c.cable = above; world.notify(p, 'Clipped on! Keep holding Act to winch them up.', 'good'); }
    else if (c.cable >= H.maxLen && now - c.warnAt > 4) { c.warnAt = now; world.notify(p, 'Too high - the cable won\'t reach them.', 'warn'); }
  } else c.cable = Math.max(0, c.cable - H.winch * dt);
  if (c.cable !== was) p.meDirty = true;
}

// ---- seizing the cargo ------------------------------------------------------------------------------------------------------------
function seize(world, p) {
  const j = p.job, c = j.call, b = world.get(c.boat);
  let value = 0;
  for (const id of c.crates) {
    const cr = world.get(id);
    if (!cr || cr.removed) continue;
    value += cr.value || 0;
    if (cr.parent && b) { const i = b.cargo.indexOf(cr.id); if (i >= 0) b.cargo[i] = 0; }
    world.remove(cr);
  }
  const pay = Math.round((COAST.bust + value * COAST.cut) / 5) * 5;
  p.profile.cash += pay; p.profile.samaritan = (p.profile.samaritan || 0) + COAST.samaritan;
  j.busts++; j.lastPay = { pay, kind: 'smuggle', value };
  j.expires = Math.max(j.expires, world.time + COAST.shiftS / 2);
  if (b) world.emit(b.x, b.y, { e: 'cash', x: b.x, y: b.y });
  endCall(world, p, `Boarded: ${c.crates.length} crate${c.crates.length === 1 ? '' : 's'} of contraband seized, the crew arrested and the boat impounded. +$${pay}, +${COAST.samaritan} Samaritan.`, 'good');
  store.touch();
  return null;
}

// ---- Act -------------------------------------------------------------------------------------------------------------------
export function interaction(world, p) {
  const j = p.job;
  if (!j || j.type !== 'coast' || !j.call) return null;
  const v = crewIn(world, p), c = j.call;
  if (!v) return null;
  if (c.kind === 'smuggle') {
    const b = world.get(c.boat);
    if (!c.stopped || !b) return null;
    const d = Math.hypot(v.x - b.x, v.y - b.y);
    const ok = isBoat(v) ? d < COAST.boardR && Math.hypot(v.vx, v.vy) < 80 : (v.alt || 0) < COAST.boardAlt && d < COAST.boardR;
    return ok ? { label: isBoat(v) ? 'Board them and seize the cargo' : 'Send a crewman down the line to seize the cargo', run: () => seize(world, p) } : null;
  }
  if (!c.found || c.aboard) return null;
  const vic = world.get(c.vic);
  if (!vic) return null;
  if (isAirV(v)) return { label: c.hooked ? 'Hold: winch them up' : 'Hold: lower the harness', run: () => {} };
  if (Math.hypot(v.x - vic.x, v.y - vic.y) < COAST.reachBoat && Math.hypot(v.vx, v.vy) < 60) return { label: 'Haul them aboard', run: () => aboard(world, p, j, c, v, vic) };
  return null;
}

// ---- the page's view of it (phone.js jobTarget) --------------------------------------------------------------------------------
export function target(world, p, j) {
  const c = j.call, mine = world.get(j.truck);
  if (!c) return { text: j.text, x: Math.round(mine ? mine.x : p.ped.x), y: Math.round(mine ? mine.y : p.ped.y), stage: 'wait' };
  if (c.kind === 'smuggle') { const b = world.get(c.boat); const end = c.way[c.way.length - 1]; return { text: j.text, x: Math.round(b ? b.x : end.x), y: Math.round(b ? b.y : end.y), stage: j.stage, ...(c.stopped ? null : { dest: [end.x, end.y] }) }; }
  if (!c.found) return { text: j.text, x: c.cx, y: c.cy, stage: 'search', area: [c.cx, c.cy, COAST.circleR] };
  if (c.aboard) { const L = landing(world, mine); return { text: j.text, x: L.x, y: L.y, stage: 'ashore' }; }
  const vic = world.get(c.vic), t = { text: j.text, x: Math.round(vic ? vic.x : c.x), y: Math.round(vic ? vic.y : c.y), stage: 'rescue', flare: [Math.round(c.x + 40), Math.round(c.y + 24)] };
  if (mine && isAirV(mine) && (c.cable > 0 || c.hooked)) t.hoist = [mine.id, Math.round(c.cable), c.hooked ? 1 : 0, Math.round(c.x), Math.round(c.y)];
  return t;
}
// where to bring them ashore: the nearest dock (the boat), the nearest helipad (the helicopter)
function landing(world, v) {
  const m = world.map, from = v || { x: 0, y: 0 };
  const L = isAirV(v) ? airfields(m).pads.filter((q) => !q.roof) : docks(m);
  let best = L[0] || from, bd = Infinity;
  for (const q of L) { const d = Math.hypot(q.x - from.x, q.y - from.y); if (d < bd) { bd = d; best = q; } }
  return { x: Math.round(best.x), y: Math.round(best.y) };
}

// ---- the dev menu (server/dev.js 'coast'): on shift (msg.mode 'boat' | 'air') at the controls of your boat or helicopter,
// then msg.k: a call - 'smuggle' (smugglers along the nearest coast) or 'overboard' (someone in the water) - with you
// brought up close to it (msg.near: alongside them / right over them). -> error | null
export function devCoast(world, p, msg = {}) {
  const ped = p.ped;
  if (!ped || ped.dead) return 'Not right now.';
  const mode = msg.mode === 'air' ? 'air' : 'boat';
  if (!p.job || p.job.type !== 'coast' || p.job.mode !== mode) {
    if (p.job) jobs.failJob(world, p, 'Job cancelled.');
    const err = start(world, p, mode);
    if (err) return err;
  }
  const j = p.job, v = world.get(j.truck);
  if (ped.vehId !== v.id) {
    if (ped.vehId) { const o = world.get(ped.vehId); if (o) { const i = o.seats.indexOf(ped.id); if (i >= 0) o.seats[i] = 0; } }
    v.seats[0] = ped.id; ped.vehId = v.id; ped.seat = 0; p.lastVehicle = v.id;
  }
  if (j.call) endCall(world, p, null);
  const W = sitesOf(world.map).water.slice().sort((a, b) => Math.hypot(a.x - v.x, a.y - v.y) - Math.hypot(b.x - v.x, b.y - v.y));
  let c = null;
  if (msg.k === 'smuggle') {
    for (const a of W.slice(0, 40)) {
      const b = W.find((s) => { const d = Math.hypot(s.x - a.x, s.y - a.y); return d >= COAST.run[0] && d <= COAST.run[1]; });
      if (b && (c = smugglerAt(world, p, a, b))) break;
    }
    if (!c) return 'No smugglers\' run found near here.';
  } else if (msg.k === 'overboard') {
    const s = W.find((q) => Math.hypot(q.x - v.x, q.y - v.y) > 300) || W[0];
    if (!s) return 'No water near here.';
    c = overboardAt(world, p, s.x, s.y);
  }
  if (c && msg.near) {
    const t = c.kind === 'smuggle' ? world.get(c.boat) : { x: c.x, y: c.y };
    v.x = t.x + (mode === 'air' ? 10 : 0); v.y = t.y + (mode === 'air' ? 0 : 130); v.vx = 0; v.vy = 0;
    if (mode === 'air') { v.alt = c.kind === 'smuggle' ? 200 : 120; v.vz = 0; v.spool = 1; }
    world.place(v); ped.x = v.x; ped.y = v.y; world.place(ped);
  }
  p.meDirty = true;
  world.notify(p, `[dev] Coast guard (${mode})${c ? `: ${c.kind}` : ''}${msg.near ? ', brought up close' : ''}.`, 'info');
  return null;
}
