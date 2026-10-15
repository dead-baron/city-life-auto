// Crop dusting (server/systems/dusting.js; the owner, 2026-10-14: crop duster missions from the farm strips): the phone
// lists it where there are crops in reach of a strip; signing on issues the co-op's crop duster (yours - no theft) and a
// contract of crop patches; flying low and fast over them sprays them (the mist on the wire: the damage word's top
// byte, bit 6), too high or too slow doesn't; each field pays, the lot a bonus; a sown farm row sprayed grows on; the
// duster drawn yellow with its boom (art v2's model and the classic overlay).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer, run } from './helpers.js';
import { VEHICLES, VEHICLE_BY_INDEX } from '../shared/vehicles.js';
import { DUST, FARM } from '../shared/rules.js';
import { FLY, floorAt } from '../shared/flight.js';
import { T } from '../shared/constants.js';
const dusting = await import('../server/systems/dusting.js');
const phone = await import('../server/systems/phone.js');
const farming = await import('../server/systems/farming.js');
const net = await import('../server/net.js');

const w = makeWorld();
run(w, 0.2);

test('the crop duster: a plane of its own, the next free aircraft index, sprayed mist on its record', () => {
  const d = VEHICLES.duster;
  assert.equal(d.i, 65);
  assert.equal(VEHICLE_BY_INDEX[65], d);
  assert.equal(d.air, 'plane');
  assert.ok(d.spray && d.seats === 1);
  assert.ok(d.stall < VEHICLES.plane.stall && d.turn > VEHICLES.plane.turn, 'slower before the wing quits, quicker to turn than the Larkspur');
});

test('crop patches come from the built map\'s crops; the phone lists the job by a strip with crops in reach', () => {
  const P = dusting.patchesOf(w.map);
  assert.ok(P.length >= DUST.fields, `crop patches on today's map (${P.length})`);
  for (const q of P.slice(0, 20)) {
    const tx = Math.floor(q.cx / 32), ty = Math.floor(q.cy / 32);
    let crops = 0, n = 0;
    for (let y = ty - 12; y < ty + 12; y++) for (let x = tx - 12; x < tx + 12; x++) { n++; if (w.map.tileAt(x, y) === T.FIELD) crops++; }
    assert.ok(crops / n >= DUST.minCrop * 0.5, 'a patch is mostly crops');
  }
  const { p } = joinPlayer(w);
  const q = P[0];
  p.ped.x = q.cx; p.ped.y = q.cy; w.place(p.ped);
  const S = dusting.stripFor(w, p.ped.x, p.ped.y);
  assert.ok(S, 'a strip in reach of the crops');
  const b = phone.boardFor(w, p);
  const j = b.jobs.find((x) => x.id === 'dusting');
  assert.ok(j && j.fly, 'on the phone\'s Flying list');
  assert.ok(j.title.includes(S.name));
});

test('signing on issues the duster and a contract; low and fast over a field sprays it, too high doesn\'t; the fields pay, the lot a bonus', () => {
  const P = dusting.patchesOf(w.map);
  const { p, prof } = joinPlayer(w);
  p.ped.x = P[0].cx; p.ped.y = P[0].cy; w.place(p.ped);
  const r = phone.handle(w, p, { a: 'take', id: 'dusting' });
  assert.equal(r.err, null, 'signed on');
  assert.equal(p.job.type, 'dusting');
  const v = w.get(p.job.truck);
  assert.equal(v.def.id, 'duster');
  assert.equal(v.issuedTo, p.pid, 'issued to you');
  assert.ok(v.workTruck && !v.despawnable);
  assert.equal(p.job.fields.length, DUST.fields);
  const t = phone.jobTarget(w, p);
  assert.ok(t.veh, 'the ring and the arrows point at the duster');
  // at the controls
  p.ped.vehId = v.id; p.ped.seat = 0; v.seats[0] = p.ped.id;
  const f = p.job.fields[0];
  const fly = (x, y, alt, vx) => { v.x = x; v.y = y; v.a = 0; v.vx = vx; v.vy = 0; v.alt = floorAt(w.map, x, y) + alt; v.spool = 1; };
  // too high: nothing sprayed, no mist
  fly(f.x + 10, f.cy, DUST.alt + 80, DUST.minSpd + 100);
  dusting.update(w, 0.05);
  assert.equal(f.n, 0, 'too high: nothing');
  assert.equal(v.lightB | 0, 0);
  // too slow
  fly(f.x + 10, f.cy, 60, DUST.minSpd - 80);
  dusting.update(w, 0.05);
  assert.equal(f.n, 0, 'too slow: nothing');
  // low and fast: passes across the field, row by row of the swath
  const cash0 = prof.cash;
  const half = (v.def.span * DUST.swath) / 2;
  for (let y = f.y + 8; y < f.y + f.h; y += half * 0.9) for (let x = f.x + 4; x < f.x + f.w; x += 24) {
    fly(x, y, 60, DUST.minSpd + 100);
    dusting.update(w, 0.05);
    if (f.done) break;
  }
  assert.ok(f.done, `the field sprayed (${f.n} of ${f.crop})`);
  assert.equal(prof.cash, cash0 + DUST.pay, 'paid for the field');
  // the mist on the wire: the record's parent word, top byte bit 6 (not the searchlight's bit 7)
  fly(p.job.fields[1].cx, p.job.fields[1].cy, 60, DUST.minSpd + 100);
  dusting.update(w, 0.05);
  const [, , parent] = net._fields(w, v);
  assert.equal(((parent >>> 24) & 64), 64, 'spraying: bit 6');
  assert.equal(((parent >>> 24) & 128), 0, 'not the searchlight');
  // the rest of the fields
  for (const g of p.job.fields.slice(1)) {
    for (let y = g.y + 8; y < g.y + g.h && !g.done; y += half * 0.9) for (let x = g.x + 4; x < g.x + g.w && !g.done; x += 24) { fly(x, y, 60, DUST.minSpd + 100); dusting.update(w, 0.05); }
    assert.ok(g.done || !p.job, 'each field sprayed');
  }
  assert.equal(p.job, null, 'the contract done');
  assert.equal(prof.cash, cash0 + DUST.fields * DUST.pay + DUST.bonus, 'every field and the bonus');
  assert.ok(p.truckReturn && p.truckReturn.id === v.id, 'the duster to take back for the return bonus');
  assert.equal(v.lightB | 0, 0, 'the mist off');
});

test('a sown farm row sprayed grows on at once (once a contract)', () => {
  const F = farming.fieldsOf(w);
  const fd = F.find((x) => x.rows.some((r) => r.s === farming.ROW.SOWN && r.okN >= 3));
  assert.ok(fd, 'a sown row somewhere');
  const r = fd.rows.findIndex((x) => x.s === farming.ROW.SOWN && x.okN >= 3);
  const row = fd.rows[r];
  row.g = 0.1;
  const [e0, e1] = farming.rowEnds(fd, r), a = { x: (e0.x + e1.x) / 2, y: (e0.y + e1.y) / 2 };   // (the row's middle)
  const { p } = joinPlayer(w);
  p.ped.x = a.x; p.ped.y = a.y; w.place(p.ped);
  const res = phone.handle(w, p, { a: 'take', id: 'dusting' });
  if (res.err) return;   // (no strip in reach of this farm on today's map: nothing to check)
  const v = w.get(p.job.truck);
  p.ped.vehId = v.id; p.ped.seat = 0; v.seats[0] = p.ped.id;
  v.x = a.x; v.y = a.y; v.a = fd.v ? Math.PI / 2 : 0; v.vx = DUST.minSpd + 100; v.vy = 0; v.alt = floorAt(w.map, v.x, v.y) + 60; v.spool = 1;   // (flying down the row)
  void FARM;
  dusting.update(w, 0.05);
  assert.ok(Math.abs(row.g - (0.1 + DUST.boost)) < 1e-9, `grew on (${row.g})`);
  dusting.update(w, 0.05);
  assert.ok(Math.abs(row.g - (0.1 + DUST.boost)) < 1e-9, 'once a contract');
  phone.handle(w, p, { a: 'cancel' });
});

test('the duster\'s look: yellow with its boom (art v2 and the classic overlay)', async () => {
  const src = (await import('node:fs')).readFileSync(new URL('../client/art2/aircraft.js', import.meta.url), 'utf8');
  assert.match(src, /duster: \{ body: '#f2c230'/);
  const src2 = (await import('node:fs')).readFileSync(new URL('../client/render/aircraft.js', import.meta.url), 'utf8');
  assert.match(src2, /LIVERY\[def\.livery\] \|\| LIVERY\.plane/);
  void FLY;
});
