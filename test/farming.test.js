// Farm work (H61, server/systems/farming.js): the tractor (vehicle 48: slow, tough, at home on rough ground), the
// fields' rows on the server going round stubble -> ploughed -> sown -> growing over in-game days -> ripe -> harvested;
// driving a tractor down a row does the job it needs; the farm-work contract from the co-op's counter and the phone,
// the tractor issued like a work truck, paid by the row and a bonus at the end.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer, teleport, run } from './helpers.js';
import { K, DAY_LOOP_S } from '../shared/constants.js';
import { VEHICLES, VEHICLE_BY_INDEX } from '../shared/vehicles.js';
import { FARM } from '../shared/rules.js';

const farming = await import('../server/systems/farming.js');
const economy = await import('../server/systems/economy.js');
const phone = await import('../server/systems/phone.js');
const vehicles = await import('../server/systems/vehicles.js');
const { ROW } = farming;

// a row that needs `state`, the tractor at its start and the player at the wheel
function onRow(w, p, state, mine = null) {
  for (const F of farming.fieldsOf(w)) {
    const r = F.rows.findIndex((row) => row.s === state && row.okN >= FARM.segs - 1);
    if (r < 0) continue;
    const [a] = farming.rowEnds(F, r);
    for (const e of [...w.entities.values()]) if (e.kind === K.VEH && e !== mine && Math.hypot(e.x - a.x, e.y - a.y) < 2000) w.remove(e);
    const v = mine || w.spawnVehicle('tractor', a.x, a.y, F.v ? Math.PI / 2 : 0, { npcOwned: false });
    v.x = a.x; v.y = a.y;
    teleport(w, p.ped, a.x, a.y);
    p.ped.vehId = v.id; p.ped.seat = 0; v.seats[0] = p.ped.id;
    return { F, r, row: F.rows[r], v };
  }
  return null;
}
// drive it down the row (the tractor's moving: what the tick looks at)
function driveRow(w, p, at) {
  const [a, b] = farming.rowEnds(at.F, at.r), v = at.v;
  let job = null;
  for (let t = 0; t <= 1.0001 && !job; t += 0.02) {
    v.x = a.x + (b.x - a.x) * t; v.y = a.y + (b.y - a.y) * t; v.vx = (b.x - a.x) / 8; v.vy = (b.y - a.y) / 8;
    job = farming.work(w, p, v);
  }
  return job;
}

test('the tractor: vehicle 48, slow and tough, at home on rough ground', () => {
  const t = VEHICLES.tractor;
  assert.equal(VEHICLE_BY_INDEX[48], t);
  assert.ok(t.max < VEHICLES.sedan.max * 0.6, 'slow');
  assert.ok(t.hp > VEHICLES.pickup.hp * 2, 'tough');
  assert.ok(t.rough < 0.2, 'rough ground hardly slows it');
});

test('the fields are kept in rows; a tractor down a row ploughs, sows and harvests it, the crop grows over in-game days', () => {
  const w = makeWorld();
  const { p } = joinPlayer(w);
  const F = farming.fieldsOf(w);
  assert.ok(F.length >= 4, `the farms' fields (${F.length})`);
  assert.ok(F.some((f) => f.rows.some((r) => r.s === ROW.STUBBLE)) && F.some((f) => f.rows.some((r) => r.s === ROW.RIPE)), 'work waiting');
  // plough
  let at = onRow(w, p, ROW.STUBBLE);
  assert.ok(at, 'a stubble row');
  const half = farming.rowEnds(at.F, at.r);
  at.v.x = (half[0].x + half[1].x) / 2; at.v.y = (half[0].y + half[1].y) / 2;
  farming.work(w, p, at.v);
  assert.equal(at.row.s, ROW.STUBBLE, 'one stretch is not the row');
  assert.ok(at.row.m, 'but it shows as done');
  assert.equal(driveRow(w, p, at), 'plough');
  assert.equal(at.row.s, ROW.PLOUGHED);
  assert.match(p.toasts.map((t) => t.text).join(' '), /farm-work contract/, 'unpaid without the contract');
  // sow the same row
  assert.equal(driveRow(w, p, at), 'sow');
  assert.equal(at.row.s, ROW.SOWN);
  assert.equal(driveRow(w, p, at), null, 'nothing to do while it grows');
  // it grows over the in-game days (stepped every 2 s with the world)
  w.fieldsAt = w.time - FARM.growDays * DAY_LOOP_S * 0.5;
  run(w, 2.1);
  assert.ok(at.row.s === ROW.SOWN && at.row.g > 0.45 && at.row.g < 0.6, `half grown (${at.row.g.toFixed(2)})`);
  w.fieldsAt = w.time - FARM.growDays * DAY_LOOP_S * 0.6;
  run(w, 2.1);
  assert.equal(at.row.s, ROW.RIPE, 'ripe');
  // harvest
  assert.equal(driveRow(w, p, at), 'harvest');
  assert.equal(at.row.s, ROW.STUBBLE);
  // the tick does it: a moving tractor over a row that needs work
  at = onRow(w, p, ROW.STUBBLE);
  at.v.vx = 120; at.v.vy = 0;
  const [a] = farming.rowEnds(at.F, at.r);
  at.v.x = a.x; at.v.y = a.y + (at.F.v ? at.F.len * 0.5 : 0);
  at.v.input = { throttle: 0, steer: 0, hb: false };
  run(w, 0.05);
  assert.ok(at.row.m, 'the tick marked the stretch under it');
  // the page is sent the fields near it
  run(w, 1.1);
  const msg = p.conn.sent.filter((m) => m && m.t === 'fields').pop();
  assert.ok(msg && msg.f.some((f) => f.i === at.F.i && f.r.length === at.F.n * 4), 'the rows sent');
});

test('the farm-work contract: from the co-op\'s counter, a tractor issued, paid by the row, a bonus for the lot; on the phone too', () => {
  const w = makeWorld();
  const { p } = joinPlayer(w);
  const coop = w.map.pois.find((q) => q.kind === 'farm');
  teleport(w, p.ped, coop.x, coop.y);
  economy.handleMenu(w, p, coop.id, 'job:fieldwork');
  assert.equal(p.job && p.job.type, 'fieldwork');
  const tr = w.get(p.job.truck);
  assert.ok(tr && tr.model === 'tractor' && tr.issuedTo === p.pid && tr.workTruck, 'a co-op tractor issued to you');
  assert.ok(phone.jobTarget(w, p).veh, 'marked for you until you\'re in it');
  // get in (it's yours: no crime, no Safety question)
  teleport(w, p.ped, tr.x + 40, tr.y);
  vehicles.tryEnter(w, p.ped);
  assert.equal(p.ped.vehId, tr.id, 'at the wheel');
  assert.equal(p.wanted, 0);
  const cash = p.profile.cash;
  let paid = 0;
  for (let k = 0; k < FARM.rows; k++) {
    const state = [ROW.STUBBLE, ROW.PLOUGHED, ROW.RIPE].find((s) => farming.fieldsOf(w).some((F) => F.rows.some((r) => r.s === s && r.okN >= FARM.segs - 1)));
    const at = onRow(w, p, state, tr);
    const job = driveRow(w, p, at);
    assert.ok(job, `row ${k + 1} worked`);
    paid += FARM.pay[job];
  }
  assert.equal(p.profile.cash, cash + paid + FARM.bonus, 'paid by the row, and the bonus');
  assert.equal(p.job, null, 'the contract done');
  assert.ok(p.truckReturn && p.truckReturn.id === tr.id, 'bring the tractor back for the return bonus');
  // the phone's job list
  const board = phone.handle(w, p, { a: 'board' });
  assert.ok(board.jobs.some((j) => j.id === 'fieldwork'), 'on the phone');
  const r = phone.handle(w, p, { a: 'take', id: 'fieldwork' });
  assert.ok(r.ok, r.err || '');
  assert.equal(p.job.type, 'fieldwork');
});

test('by hand at harvest time: walk a ripe row picking it, every few stretches a crate; the farm stand buys the crate', async () => {
  const w = makeWorld();
  const { p } = joinPlayer(w);
  const cargo = await import('../server/systems/cargo.js');
  const jobs = await import('../server/systems/jobs.js');
  const players = await import('../server/systems/players.js');
  const F = farming.fieldsOf(w).find((f) => f.rows.some((r) => r.okN === FARM.segs));
  const r = F.rows.findIndex((row) => row.okN === FARM.segs);
  F.rows[r].s = ROW.RIPE; F.rows[r].m = 0;
  const [a, b] = farming.rowEnds(F, r);
  const at = (k) => ({ x: a.x + (b.x - a.x) * ((k + 0.5) / FARM.segs), y: a.y + (b.y - a.y) * ((k + 0.5) / FARM.segs) });
  let crate = null;
  for (let k = 0; k < FARM.handPer; k++) {
    teleport(w, p.ped, at(k).x, at(k).y);
    for (const c of [...w.entities.values()]) if (c.kind === K.CRATE && c.hand && c !== crate) crate = c;
    const act = players.findInteraction(w, p);   // (the Act button's prompt: players.js)
    assert.match(act.label, /Pick the crop by hand/);
    act.run();
  }
  crate = [...w.entities.values()].find((c) => c.kind === K.CRATE && c.hand);
  assert.ok(crate && crate.label === 'Produce Box' && crate.owner === p.pid, 'a crate of it');
  assert.equal(F.rows[r].s, ROW.RIPE, 'the row not done yet');
  for (let k = FARM.handPer; k < FARM.segs; k++) { teleport(w, p.ped, at(k).x, at(k).y); farming.handPick(w, p); }
  assert.equal(F.rows[r].s, ROW.STUBBLE, 'picked clean by hand: harvested');
  // carried to the farm stand
  teleport(w, p.ped, crate.x, crate.y);
  cargo.pickUp(w, p.ped, crate);
  assert.equal(p.ped.carrying, crate.id);
  const stand = w.map.pois.find((q) => q.kind === 'farm');
  teleport(w, p.ped, stand.x, stand.y);
  const dz = jobs.deliveryZoneFor(w, p, crate);
  assert.match(dz.label, /farm stand/);
  const cash = p.profile.cash;
  dz.run();
  assert.equal(p.profile.cash, cash + FARM.handBox);
});

test('the combine (vehicle 49): its header harvests the two ripe rows under it as it goes, and only harvests; its contract at the co-op', () => {
  const w = makeWorld();
  const { p } = joinPlayer(w);
  assert.equal(VEHICLE_BY_INDEX[49], VEHICLES.combine);
  assert.ok(VEHICLES.combine.max < VEHICLES.tractor.max, 'slower than the tractor');
  // two ripe rows side by side, the combine straddling them (its middle on the line between them)
  const F = farming.fieldsOf(w).find((f) => f.rows.some((r, i) => i + 1 < f.n && r.okN >= FARM.segs - 1 && f.rows[i + 1].okN >= FARM.segs - 1));
  const r = F.rows.findIndex((row, i) => i + 1 < F.n && row.okN >= FARM.segs - 1 && F.rows[i + 1].okN >= FARM.segs - 1);
  F.rows[r].s = ROW.RIPE; F.rows[r + 1].s = ROW.RIPE; F.rows[r].m = 0; F.rows[r + 1].m = 0;
  const [a0, b0] = farming.rowEnds(F, r), [a1, b1] = farming.rowEnds(F, r + 1);
  const a = { x: (a0.x + a1.x) / 2, y: (a0.y + a1.y) / 2 }, b = { x: (b0.x + b1.x) / 2, y: (b0.y + b1.y) / 2 };
  const ang = Math.atan2(b.y - a.y, b.x - a.x);
  const v = w.spawnVehicle('combine', a.x, a.y, ang, { npcOwned: false });
  p.ped.vehId = v.id; p.ped.seat = 0; v.seats[0] = p.ped.id;
  const f = v.def.L / 2 - 12;
  for (let t = -0.1; t <= 1.0001; t += 0.02) { v.x = a.x + (b.x - a.x) * t - Math.cos(ang) * f; v.y = a.y + (b.y - a.y) * t - Math.sin(ang) * f; farming.work(w, p, v); }
  assert.equal(F.rows[r].s, ROW.STUBBLE, 'one row harvested');
  assert.equal(F.rows[r + 1].s, ROW.STUBBLE, 'and the one beside it, in the same pass');
  // it doesn't plough
  F.rows[r].s = ROW.STUBBLE; F.rows[r].m = 0;
  for (let t = -0.1; t <= 1.0001; t += 0.02) { v.x = a.x + (b.x - a.x) * t - Math.cos(ang) * f; v.y = a.y + (b.y - a.y) * t - Math.sin(ang) * f; farming.work(w, p, v); }
  assert.equal(F.rows[r].s, ROW.STUBBLE, 'a combine only harvests');
  // the co-op's counter offers it while something's ripe
  const coop = w.map.pois.find((q) => q.kind === 'farm');
  teleport(w, p.ped, coop.x, coop.y);
  p.ped.vehId = 0; p.ped.seat = -1; v.seats[0] = 0;
  F.rows[r].s = ROW.RIPE;
  economy.handleMenu(w, p, coop.id, 'job:combine');
  assert.equal(p.job && p.job.only, 'harvest');
  assert.equal(w.get(p.job.truck).model, 'combine', 'the co-op\'s combine issued');
});

test('the fields are kept across a restart (H69): the rows as they were, a changed layout starts afresh', async () => {
  const w = makeWorld(), F = farming.fieldsOf(w);
  assert.ok(F.length && F[0].rows.length > 2);
  const row = F[0].rows[1], was = row.s;
  row.s = was === ROW.SOWN ? ROW.RIPE : ROW.SOWN; row.g = row.s === ROW.SOWN ? 0.42 : 0; row.m = row.ok & 3;
  farming.keep(w);
  const w2 = makeWorld({ keepKept: true }), r2 = farming.fieldsOf(w2)[0].rows[1];
  assert.equal(r2.s, row.s, 'the row\'s state');
  assert.ok(Math.abs(r2.g - row.g) < 0.002, 'its growth');
  assert.equal(r2.m, row.m, 'the stretches of its job done');
  const { store } = await import('../server/store.js');
  store.kept.fields.sig += ';0,0,64,64,1';                              // a world whose fields are laid out otherwise
  assert.equal(farming.fieldsOf(makeWorld({ keepKept: true }))[0].rows[1].s, was, 'a changed layout: afresh');
  const fresh = farming.fieldsOf(makeWorld())[0];                       // a new server: as the world starts them
  assert.equal(fresh.rows[1].s, was);
});

test('the file store keeps the world\'s kept state with the profiles (H69: the fields)', async () => {
  const { FileStore } = await import('../server/file-store.js');
  const f = new FileStore();
  f.kept.fields = { sig: 'x', rows: [[[1, 500, 3]]] };
  f.touch(); f.flushSync();
  assert.deepEqual(new FileStore().kept.fields, { sig: 'x', rows: [[[1, 500, 3]]] }, 'read back after a restart');
});

// The playtest panel's tractor (and combine): at the field nearest you, on the crop itself (the owner, 10-16: "Tractor
// option spawns you away from a field: put it by one")
test('the dev tractor and combine: at the field nearest you, on its crop', async () => {
  const { T, TILE } = await import('../shared/constants.js');
  const w = makeWorld();
  const { p } = joinPlayer(w);
  const fs = farming.fieldsOf(w), far = fs[fs.length - 1].f;
  teleport(w, p.ped, far.x + far.w / 2, far.y - 200);   // (by the last field in the list, not the first farm's)
  for (const k of [null, 'combine']) {
    assert.equal(farming.devFarm(w, p, k ? { k } : {}), null);
    const v = w.get(p.ped.vehId);
    assert.ok(v && v.def.id === (k || 'tractor'), `in the ${k || 'tractor'}`);
    assert.equal(w.map.tileAtPx(v.x, v.y), T.FIELD, `on the crop (${Math.round(v.x / TILE)}, ${Math.round(v.y / TILE)})`);
    const near = fs.reduce((b, F) => { const d = Math.hypot(F.f.x + F.f.w / 2 - v.x, F.f.y + F.f.h / 2 - v.y); return d < b.d ? { F, d } : b; }, { d: Infinity });
    assert.ok(Math.hypot(near.F.f.x + near.F.f.w / 2 - (far.x + far.w / 2), near.F.f.y + near.F.f.h / 2 - (far.y + far.h / 2)) < 1500, 'at a field near you');
    vehicles.ejectPed(w, p.ped, true);
    teleport(w, p.ped, far.x + far.w / 2, far.y - 200);
  }
});
