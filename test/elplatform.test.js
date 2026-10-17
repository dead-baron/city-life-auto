// World v3's El (the owner's 10-17 ask: "have the train platform be something you can walk up the stairs for"):
// Midtown Station's platforms are walked up to - each stair tower's flight rises to the deck (shared/world3-rail.js
// elFurniture: m.el.foot, the levels' foot corridors), the platform holds you, a train in is boarded from it and left
// onto it (server/systems/trains.js), a car can't drive up the stairs, and the height reaches the page (the wire's byte).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildWorld3 } from '../server/world3.js';
import { World } from '../server/world.js';
import { pedStep, newPedState, vehStep, newVehState } from '../shared/physics.js';
import { VEHICLES } from '../shared/vehicles.js';
import { LZ_SCALE } from '../shared/protocol.js';
import * as trains from '../server/systems/trains.js';
import { joinPlayer, teleport } from './helpers.js';

const { map: M } = await buildWorld3(1337, { log: () => {} });
const mods = { speedMul: 1, canMove: true, canSprint: true, regenMul: 1, staminaMax: 100, canSwim: true, analog: true };
const walk = (s, mx, my, secs) => { for (let k = 0; k < secs * 30; k++) pedStep(s, { bits: 0, mx, my, aim: 0 }, 1 / 30, M, mods); return s; };
const elSts = () => M.rails.flatMap((r) => r.stations.filter((st) => st.el));

test('the El\'s stations: a platform each, the stair towers\' flights and landings, as people-only corridors', () => {
  assert.ok(M.el && M.el.foot && M.el.lz > 1.3, 'the El furnished with its corridors');
  const sts = elSts();
  assert.ok(sts.length >= 2, `El stations: ${sts.length}`);
  for (const st of sts) assert.ok(st.deck && st.deck.x1 > st.deck.x0 + 400, `${st.name}: its platform`);
  for (const s of M.el.stairs) assert.ok(s.top, `${s.station}'s stairs: a top`);
  assert.ok(M.levels.segs.filter((q) => q.foot).length >= M.el.foot.length, 'in the levels');
});

test('up a stair tower, across the landing, along the platform - held up there - and back down', () => {
  for (const s of M.el.stairs) {
    const st = elSts().find((q) => q.name === s.station && Math.sign(q.deck.y - M.el.py) === Math.sign(s.y - M.el.py));
    const p = newPedState(s.x - s.dir * 24, s.y);
    walk(p, s.dir, 0, 4);
    assert.ok(Math.abs(p.lz - M.el.lz) < 0.05, `${s.station} (${s.dir}): at the top (lz ${p.lz.toFixed(2)})`);
    walk(p, 0, Math.sign(st.deck.y - s.y), 2);
    assert.ok(Math.abs(p.y - st.deck.y) < 40 && p.lz > 1.3, `onto the platform (y ${Math.round(p.y - st.deck.y)} off its middle)`);
    walk(p, -s.dir, 0, 3);
    assert.ok(p.lz > 1.3 && Math.abs(p.y - st.deck.y) < 40, 'along it, still up');
    walk(p, 0, -Math.sign(st.deck.y - M.el.py), 2);   // (toward the tracks: the edge holds)
    assert.ok(p.lz > 1.3 && Math.abs(p.y - st.deck.y) < 40, 'the edge holds you');
    walk(p, s.dir, 0, 3); walk(p, 0, Math.sign(s.y - st.deck.y), 2); walk(p, -s.dir, 0, 5);
    assert.ok(p.lz < 0.3, `down again (lz ${p.lz.toFixed(2)})`);
  }
});

test('a car at a stair tower\'s foot stays on the street', () => {
  const s = M.el.stairs[0], def = VEHICLES.sedan || Object.values(VEHICLES)[0];
  const v = newVehState(s.x - s.dir * 60, s.y, s.dir > 0 ? 0 : Math.PI);
  for (let k = 0; k < 60; k++) vehStep(v, { throttle: 1, steer: 0, hb: false, slide: false, drv: true }, 1 / 30, M, def, {});
  assert.ok((v.lz || 0) < 0.05, `lz ${v.lz}`);
});

test('on the platform with a train in: board it from there, and off again onto the platform', () => {
  const w = new World(M, { npcBudget: 0, throwErrors: true });
  w.step();
  const st = elSts()[0], R = w.rails.findIndex((r) => r.stations.includes(st)), si = w.rails[R].stations.indexOf(st);
  const t = w.trains.find((q) => q.r === R);
  assert.ok(t, 'a train on the station\'s loop');
  t.stop = si; t.dwellUntil = w.time + 60;
  const { p } = joinPlayer(w);
  teleport(w, p.ped, st.x, st.deck.y); p.ped.lz = M.el.lz;
  const act = trains.interaction(w, p);
  assert.ok(act && /Board the train/.test(act.label), act && act.label);
  act.run();
  assert.ok(p.ped.onTrain, 'aboard');
  trains.getOff(w, p);
  assert.ok(!p.ped.onTrain && p.ped.lz > 1.3 && Math.abs(p.ped.y - st.deck.y) < 40, `off onto the platform (lz ${p.ped.lz}, y ${Math.round(p.ped.y - st.deck.y)})`);
});

test('the platform\'s height reaches the page (the snapshot\'s level byte runs to two levels)', () => {
  assert.ok(Math.round(M.el.lz * LZ_SCALE) <= 255 && Math.round(M.el.lz * LZ_SCALE) / LZ_SCALE > 1.4);
});

test('people off a train at the El step out onto the platform and walk down its stairs; its foot shows the way up', async () => {
  const { spawnNpc } = await import('../server/systems/npc.js');
  const w = new World(M, { npcBudget: 160, throwErrors: true });
  w.step();
  const st = elSts()[0], s = M.el.stairs.find((q) => q.station === st.name);
  const { p } = joinPlayer(w);
  teleport(w, p.ped, s.x, s.y);
  const hint = trains.interaction(w, p);
  assert.ok(hint && /Up the stairs/.test(hint.label), hint && hint.label);
  const R = w.rails.findIndex((r) => r.stations.includes(st)), t = w.trains.find((q) => q.r === R);
  t.stop = w.rails[R].stations.indexOf(st); t.dwellUntil = w.time + 60;
  const q = spawnNpc(w, 'civ', st.x, st.y, 'civ');
  q.onTrain = { t: t.i, c: 1, ox: 0, oy: 0 }; t.riders.add(q.id);
  assert.ok(trains.alightAtStation(w, t, q));
  assert.ok(q.lz > 1.3 && Math.abs(q.y - st.deck.y) < 40, `onto the platform (lz ${q.lz})`);
  let down = false;
  for (let k = 0; k < 20 * 40 && !down; k++) { w.step(); if (!q.npc.stairs && (q.lz || 0) < 0.3) down = true; }
  assert.ok(down, `down the stairs to the street (lz ${q.lz}, ${Math.round(q.x - s.x)}, ${Math.round(q.y - s.y)} from the foot)`);
});
