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
