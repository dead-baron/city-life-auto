// Your car (the owner, 2026-11-14: "map + valet delivery, no teleport"; the numbers: shared/rules.js VALET).
//   - the car you last took out (p.activeVehicle: a garage, a dealership, a used lot, the valet) stays where you left it:
//     through a logoff (still out in the world: yours again when you're back - onJoin) and a restart (profile.carAt, its
//     place saved every few seconds - save - and put back there when you join, if the space is still free; else it's in
//     your garage as before). On your map while you're on foot and out of it (marker: buildMe's car).
//   - the phone's "Have it delivered" (request): a valet brings it to the nearest proper space - a kerb bay or a car
//     park's bay (map.parking), else a road's shoulder - out of everyone's sight, VALET.minD to maxD px from you, after
//     waitS seconds (update -> deliver), for VALET.fee; wrecked (its insurance claim brought it back: insurance.js marks
//     the entry wr), wreckFee - it comes from the body shop. Once every cooldownS. Not while you're wanted, not in the
//     wilds, and only on the road network's piece the car is on (an island no road reaches gets no valet - custody.js
//     pieceAt, as the police cars go).
//   profile: + carAt { vid, x, y, a } (absent: none out), valetAt (ms, the last call); vehicles[i].wr (wrecked since out)
import { K } from '../../shared/constants.js';
import { VEHICLES } from '../../shared/vehicles.js';
import { VALET } from '../../shared/rules.js';
import { parkWhy } from '../../shared/parkcheck.js';
import { store } from '../store.js';
import { inAnyView } from '../view.js';
import * as homes from './homes.js';
import * as insurance from './insurance.js';
import { pieceAt, nodePiece } from './custody.js';
import { payFrom } from './economy.js';

const money = (n) => '$' + Math.round(n).toLocaleString('en-US');
const meters = (px) => `${Math.max(1, Math.round(px / 32))} m`;
// a car the valet drives (on the road: not a boat, an aircraft, a horse, a surfboard or the starter car)
export const landCar = (d) => !!d && (d.kind === 'car' || d.kind === 'bike') && !d.horse && !d.surfboard && !d.board && !d.cart;
// your vehicle out in the world (the one you last took out), or null
export function carOf(world, p) {
  const v = world.get(p.activeVehicle);
  return v && !v.removed && v.kind === K.VEH && v.owner === p.pid && !v.starter ? v : null;
}
const usable = (v) => !!v && !v.wreckAt && !v.sinkAt && !v.dead;

// ---- where it is ----------------------------------------------------------------------------------------------------------
// Your car on your map (players.js buildMe car): [x, y, its model's index, 0] while you're on foot and it stands empty
export function marker(world, p) {
  const ped = p.ped, v = carOf(world, p);
  if (!v || !ped || ped.dead || ped.vehId || ped.hidden || ped.interior || ped.onTrain || ped.ug || ped.ftueHid) return null;
  if (!usable(v) || v.seats.some((s) => s) || v.towedBy || v.onDeck || v.scripted) return null;
  return [Math.round(v.x), Math.round(v.y), v.def.i, 0];
}
// where it stands, kept with the character (players.js: every few seconds, and at logoff)
export function save(world, p) {
  const prof = p.profile, v = carOf(world, p);
  const ov = v && usable(v) && landCar(v.def) ? insurance.entryOf(prof, v) : null;
  if (ov) prof.carAt = { vid: insurance.vidOf(ov), x: Math.round(v.x), y: Math.round(v.y), a: Math.round((v.a || 0) * 100) / 100 };
  else if (prof.carAt) delete prof.carAt;   // (none out, a wreck, a boat: nothing to put back)
}
// Joining (players.js join): your car out where you left it - yours again, or (after a restart) put back there
export function onJoin(world, p) {
  const prof = p.profile, C = prof.carAt;
  if (!C || !C.vid) return;
  for (const v of world.entities.values()) if (v.kind === K.VEH && !v.removed && v.owner === p.pid && v.ownVid === C.vid) { p.activeVehicle = v.id; return; }
  const idx = prof.vehicles.findIndex((o) => o.vid === C.vid), ov = prof.vehicles[idx], d = ov && VEHICLES[ov.model];
  const room = d && landCar(d) && !insurance.heldWhy(ov) && !parkWhy(world.map, C.x, C.y, C.a, d.L, d.W, true) && !world.query(C.x, C.y, 40, K.VEH).length;
  if (!room || homes.spawnOwnedAt(world, p, idx, { x: C.x, y: C.y, a: C.a }, { keep: true })) delete prof.carAt;   // (its space taken: in your garage)
}

// ---- the valet --------------------------------------------------------------------------------------------------------------
// the biggest piece of the road network (where the garages' cars come from when yours isn't out)
const MAIN = new WeakMap();
function mainPiece(m) {
  if (MAIN.has(m)) return MAIN.get(m);
  const n = new Map();
  for (const nd of (m.net && m.net.nodes) || []) { const k = nodePiece(m, nd.id); n.set(k, (n.get(k) || 0) + 1); }
  let best = -1, bn = 0;
  for (const [k, c] of n) if (c > bn) { bn = c; best = k; }
  MAIN.set(m, best);
  return best;
}
// the car the valet would bring: { v (out in the world) | null, ov (its entry), idx }
function target(world, p) {
  const prof = p.profile, v = carOf(world, p);
  if (usable(v) && landCar(v.def)) { const ov = insurance.entryOf(prof, v); if (ov) return { v, ov, idx: prof.vehicles.indexOf(ov) }; }
  const land = (o) => !!o && o.model !== 'starter' && landCar(VEHICLES[o.model]);
  let ov = prof.carAt && prof.vehicles.find((o) => o.vid && o.vid === prof.carAt.vid);
  if (!land(ov) && v) ov = insurance.entryOf(prof, v);   // (the wreck's entry: its claim brought it back)
  if (!land(ov)) ov = prof.vehicles.find(land);
  return land(ov) ? { v: null, ov, idx: prof.vehicles.indexOf(ov) } : null;
}
const nameOf = (ov) => VEHICLES[ov.model].name;
// a space is free: nobody's vehicle on it, nobody watching it
const free = (world, s) => !world.query(s.x, s.y, VALET.clearPx, K.VEH).length && !inAnyView(world, s.x, s.y, 80);
// The nearest proper space VALET.minD to maxD px from (x, y), on road-network piece `piece`, for a vehicle d: a kerb bay or
// a car park's bay first, a road's shoulder only where there's no bay. -> { x, y, a } | null
export function findSpot(world, x, y, d, piece) {
  const m = world.map, lots = homes.homeLotSpots(m), R0 = VALET.minD, R1 = VALET.maxD;
  const ok = (s) => { const r = Math.hypot(s.x - x, s.y - y); return r >= R0 && r <= R1 && !parkWhy(m, s.x, s.y, s.a, d.L, d.W, true) && free(world, s) && (piece < 0 || pieceAt(m, s.x, s.y) === piece); };
  const bays = [];
  (m.parking || []).forEach((sp, i) => { if (!sp.drive && !lots.has(i) && Math.abs(sp.x - x) <= R1 && Math.abs(sp.y - y) <= R1) bays.push({ x: sp.x, y: sp.y, a: sp.a || 0, d: Math.hypot(sp.x - x, sp.y - y) }); });
  bays.sort((a, b) => a.d - b.d);
  for (const s of bays) if (ok(s)) return { x: s.x, y: s.y, a: s.a };
  // a shoulder: the kerb side of a street, every few car lengths along it
  const sh = [];
  for (const e of m.edges || []) {
    if (e.lvl !== 0 || e.bridge || e.kind === 'alley' || e.kind === 'drive' || !e.pts) continue;
    for (let i = 1; i < e.pts.length; i++) {
      const a = e.pts[i - 1], b = e.pts[i], L = Math.hypot(b.x - a.x, b.y - a.y);
      if (L < d.L * 2) continue;
      const ux = (b.x - a.x) / L, uy = (b.y - a.y) / L, hw = e.hw || 20;
      // (at the kerb, else a little further out where the paving's edge comes in a tile)
      for (const off of [Math.max(0, hw - d.W / 2 - 4), Math.max(0, (hw - d.W / 2) * 0.55)]) for (let t = d.L; t <= L - d.L; t += d.L * 1.5) for (const side of [1, -1]) {
        const s = { x: a.x + ux * t - uy * off * side, y: a.y + uy * t + ux * off * side, a: Math.atan2(uy, ux) + (side < 0 ? Math.PI : 0) };
        const dd = Math.hypot(s.x - x, s.y - y);
        if (dd >= R0 && dd <= R1) sh.push({ ...s, d: dd + (off < hw - d.W / 2 - 4 ? 120 : 0) });
      }
    }
  }
  sh.sort((a, b) => a.d - b.d);
  for (const s of sh) if (ok(s)) return { x: s.x, y: s.y, a: s.a };
  return null;
}

// The phone's "Have it delivered" ({ t: 'phone', a: 'valet' }) -> error | null
export function request(world, p, pay = payFrom) {
  const ped = p.ped, prof = p.profile, m = world.map;
  if (!ped || ped.dead || p.custody || p.prison) return 'Not right now.';
  if (p.wanted > 0) return 'No valet comes near a wanted driver - lose the police first.';
  if (ped.vehId) return 'Get out first - the valet leaves your car a short walk from you.';
  if (ped.hidden || ped.interior || ped.ug || ped.onTrain || ped.sub || ped.home) return 'Step outside first.';
  if (p.valet) return `Your ${p.valet.name} is on its way.`;
  const left = VALET.cooldownS - (Date.now() - (prof.valetAt || 0)) / 1000;
  if (left > 0) return `The valet's out on another call - try again in ${left > 90 ? `${Math.ceil(left / 60)} minutes` : `${Math.ceil(left)} seconds`}.`;
  const D = m.districtAt && m.districtAt(ped.x, ped.y);
  if (D && D.style === 'wild') return 'No valet comes out to the wilds - get back to a town.';
  const T = target(world, p);
  if (!T) return 'You have no car for the valet - buy one at a dealership or a used lot.';
  const held = insurance.heldWhy(T.ov);
  if (held) return held;
  const name = nameOf(T.ov);
  if (T.v) {
    if (T.v.seats.some((s) => s)) return `Someone's in your ${name}.`;
    if ((T.v.cargo || []).some(Boolean)) return `Your ${name} has cargo on it - unload it first.`;
    if (T.v.towedBy || T.v.onDeck) return `Your ${name} can't be moved right now.`;
    const dd = Math.hypot(T.v.x - ped.x, T.v.y - ped.y);
    if (dd <= VALET.maxD) return `Your ${name} is only ${meters(dd)} away - follow its marker.`;
  }
  const piece = T.v ? pieceAt(m, T.v.x, T.v.y) : mainPiece(m);
  if (piece >= 0 && pieceAt(m, ped.x, ped.y) !== piece) return T.v ? `No road runs from your ${name} to here - it stays where you left it.` : 'No road reaches here from the city - the valet can\'t come.';
  const d = VEHICLES[T.ov.model], spot = findSpot(world, ped.x, ped.y, d, piece);
  if (!spot) return 'The valet can\'t find a space near you - try by a street or a car park.';
  const fee = T.ov.wr ? VALET.wreckFee : VALET.fee;
  if (!pay(p, fee)) return `The valet costs ${money(fee)} (cash + bank).`;
  prof.valetAt = Date.now();
  p.valet = { due: world.time + VALET.waitS, vid: insurance.vidOf(T.ov), spot, fee, piece, name };
  world.notify(p, `${T.ov.wr ? `The body shop's valet is bringing your ${name} (${money(fee)})` : `A valet is bringing your ${name} (${money(fee)})`} - parked for you nearby in about ${VALET.waitS} seconds.`, 'good');
  store.touch();
  p.meDirty = true;
  return null;
}
// every tick: the valets due park the cars
export function update(world) {
  for (const p of world.players.values()) if (p.valet && world.time >= p.valet.due) deliver(world, p);
}
function deliver(world, p) {
  const V = p.valet, prof = p.profile;
  p.valet = null;
  const back = (why) => { prof.bank += V.fee; store.touch(); p.meDirty = true; world.notify(p, `${why} Your ${money(V.fee)} is back in your bank.`, 'warn'); };
  const idx = prof.vehicles.findIndex((o) => o.vid === V.vid), ov = prof.vehicles[idx];
  if (!ov) return back('The valet couldn\'t find your car.');
  const d = VEHICLES[ov.model], old = carOf(world, p);
  if (old && usable(old) && old.ownVid === V.vid && old.seats.some((s) => s)) return back(`Someone took your ${d.name} before the valet got to it.`);
  let spot = V.spot;
  if (!free(world, spot)) spot = p.ped && !p.ped.dead ? findSpot(world, p.ped.x, p.ped.y, d, V.piece) : null;
  if (!spot) return back('The valet couldn\'t find a space near you.');
  const err = homes.spawnOwnedAt(world, p, idx, spot, { keep: true });
  if (err) return back(err);
  delete ov.wr;
  const v = world.get(p.activeVehicle);
  if (v) v.valeted = world.time;
  save(world, p);
  store.touch();
  p.meDirty = true;
  const at = p.ped ? Math.hypot(spot.x - p.ped.x, spot.y - p.ped.y) : 0;
  world.notify(p, `Your ${d.name} is parked ${meters(at)} away - follow its marker on your map.`, 'good');
}
