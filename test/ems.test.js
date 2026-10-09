// Ambulances that get there (server/systems/ems.js, kerbdrive.js): a paid ambulance reaches a downed player downtown,
// inside a shop, in a park, on the coast, on an island over a bridge and out in the wilds; it never drives into the
// water or vanishes on the way; the stretcher scene runs (out, treat, onto the stretcher, back to the ambulance, in,
// away).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer, run, teleport } from './helpers.js';
import { T, TILE, MAP_W, MAP_H } from '../shared/constants.js';
import { Z } from '../shared/citylayout.js';
import { PARK } from '../shared/citylayout.js';
import * as combat from '../server/systems/combat.js';
import * as revive from '../server/systems/revive.js';
import { spawnNpc } from '../server/systems/npc.js';
import { kerbFor } from '../server/systems/kerbdrive.js';

const WET = (t) => t === T.WATER || t === T.DEEP;
// the places to go down in (px)
function places(m) {
  const out = [];
  const cafe = m.pois.find((q) => q.kind === 'coffee' && m.zoneAt(q.x, q.y) === Z.CITY);
  out.push(['downtown, outside a cafe', cafe.x, cafe.y + 40]);
  const bank = m.pois.find((q) => q.kind === 'bank' && m.zoneAt(q.x, q.y) === Z.CITY);
  out.push(['inside a bank', bank.x, bank.y]);
  out.push(['in the middle of Greenfield Park', (PARK.x0 + PARK.x1) / 2 * TILE, (PARK.y0 + PARK.y1) / 2 * TILE]);
  let coast = null;
  for (let ty = 300; ty < MAP_H && !coast; ty += 2) for (let tx = 300; tx < MAP_W && !coast; tx += 2) {
    const x = tx * TILE + 16, y = ty * TILE + 16;
    if (m.tileAtPx(x, y) === T.SAND && m.zoneAt(x, y) === Z.CITY && WET(m.tileAtPx(x - 64, y)) && WET(m.tileAtPx(x - 160, y))) coast = [x, y];
  }
  out.push(['on the beach by the water', ...coast]);
  const isle = m.pois.find((q) => q.kind === 'home' && m.zoneAt(q.x, q.y) === Z.ISLE);
  out.push(['at a home on Cedar Isle (over the bridge)', isle.x, isle.y + 40]);
  let wild = null;
  const WILDS = new Set([Z.WILD, Z.WEST, Z.NORTH]);
  for (let ty = 0; ty < MAP_H && !wild; ty += 7) for (let tx = 0; tx < MAP_W && !wild; tx += 7) {
    const x = tx * TILE + 16, y = ty * TILE + 16;
    if (!WILDS.has(m.zoneAt(x, y)) || !m.isWalkable(x, y) || m.isWater(x, y)) continue;
    const k = kerbFor({ map: m }, x, y), d = Math.hypot(k.x - x, k.y - y);
    if (d > 300 && d < 700) wild = [x, y];
  }
  out.push(['off the road in the wilds', ...wild]);
  return out;
}

test('a paid ambulance gets to you wherever you are: downtown, in a shop, a park, the coast, an island, the wilds - never into the water', () => {
  const m = makeWorld().map;
  for (const [where, x, y] of places(m)) {
    const w = makeWorld({ npcBudget: 30 });
    const a = joinPlayer(w, { cash: 0, bank: 1000 });
    teleport(w, a.p.ped, x, y);
    combat.kill(w, a.p.ped, null, 'melee', 0);
    revive.callAmbulance(w, a.p);
    assert.ok(a.p.amb, `${where}: an ambulance is on its way`);
    const vid = a.p.amb.vehId;
    let up = false, gone = false, wet = false, steps = new Set(), t = 0;
    for (; t < 90 * 20 && !up; t++) {
      w.step();
      const v = w.get(vid);
      if (!v) { gone = !up && a.p.ped.dead; break; }
      if (v.sinkAt || WET(m.tileAtPx(v.x, v.y))) wet = true;
      if (v.ai) steps.add(v.ai.mode + (v.ai.mode === 'scene' ? ':' + v.ai.step : ''));
      up = !a.p.ped.dead;
    }
    assert.ok(!gone, `${where}: the ambulance didn't vanish on the way (${[...steps]})`);
    assert.ok(!wet, `${where}: never in the water`);
    assert.ok(up, `${where}: revived by the paramedics within 90 s (${[...steps]})`);
    assert.ok(steps.has('scene:treat'), `${where}: they got out and treated you`);
    assert.equal(a.p.profile.bank, 1000 - 200, `${where}: the fee as before`);
  }
});

test('the stretcher: out of the back, treat, onto the stretcher, wheeled to the ambulance, loaded and driven off', () => {
  const w = makeWorld({ npcBudget: 30 });
  const a = joinPlayer(w, { cash: 0, bank: 0 });
  const cafe = w.map.pois.find((q) => q.kind === 'coffee' && w.map.zoneAt(q.x, q.y) === Z.CITY);
  teleport(w, a.p.ped, cafe.x, cafe.y + 40);
  const npc = spawnNpc(w, 'executive', cafe.x + 60, cafe.y + 50, 'civ');
  combat.kill(w, npc, null, 'melee', 0);
  assert.ok(npc.dead && w.bodies.has(npc), 'down on the pavement');
  let amb = null, steps = [], props = new Set(), lit = false, kneel = false;
  for (let t = 0; t < 100 * 20; t++) {
    w.step();
    if (!amb) { for (const id of w.ambulances || []) amb = w.get(id); continue; }
    if (!w.get(amb.id)) break;
    const ai = amb.ai;
    if (!ai) break;
    const st = ai.mode + (ai.mode === 'scene' ? ':' + ai.step : '');
    if (steps[steps.length - 1] !== st) steps.push(st);
    for (const id of ai.crew) { const c = w.get(id); if (c && c.pp) props.add(c.pp); if (c && c.kneelUntil > w.time) kneel = true; }
    if (amb.beacon) lit = true;
    if (ai.mode === 'leave') { teleport(w, a.p.ped, cafe.x + 6000, cafe.y); }   // (walk off: it goes once out of sight)
  }
  const order = ['drive', 'scene:out', 'scene:treat', 'scene:lift', 'scene:back', 'scene:load', 'board', 'leave'];
  let i = 0;
  for (const s of steps) if (s === order[i]) i++; else if (order.indexOf(s) < i - 1) assert.fail(`out of order: ${steps}`);
  assert.equal(i, order.length, `every step in turn: ${steps}`);
  assert.ok(props.has('stretcher') && props.has('stretcherPt'), 'the stretcher wheeled out empty and back with the patient on it');
  assert.ok(kneel, 'a paramedic knelt to treat them');
  assert.ok(lit, 'the lights flashing while they worked');
  assert.ok(npc.removed || !w.get(npc.id), 'the patient was taken away');
  assert.ok(!w.get(amb.id), 'and the ambulance drove off and was gone');
});
