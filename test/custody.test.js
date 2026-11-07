// Getting taken in (the owner, 11-07: "Making a break for it out of the cop car the cop instantly jumps out and catches
// you ... when I'm in a cop car they don't seem to make it to a police station, they always get stuck somewhere ... on the
// islands they will just drive into the ocean" - server/systems/custody.js): a break for it from the back seat of a car
// stopped in traffic, with a head start (the crew take a moment to get out) and a star more for it; the ride to the
// nearest station on its roads with the siren on; stuck for good, a fade to black and the cells; no station on the
// roads from where you're cuffed (an island), the fade at once and no car at all.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer, teleport } from './helpers.js';
import { T } from '../shared/constants.js';
import { STAR_HEAT, COP_LEVEL, BREAK_CAR, BREAK_RETRY_S, CUSTODY_SKIP_S, CUSTODY_FADE_S, ESCAPE_STARS } from '../shared/rules.js';
import * as players from '../server/systems/players.js';
import * as law from '../server/systems/law.js';
import * as custody from '../server/systems/custody.js';
import * as police from '../server/systems/police.js';
import { spawnNpc } from '../server/systems/npc.js';

function corner(w) { return w.map.nodes.find((q) => q.lvl === 0 && Math.hypot(q.x - 26000, q.y - 17000) < 2500); }
function wanted(w, p, stars) { law.addHeat(w, p, STAR_HEAT[stars] + 2 - p.heat, p.ped.x, p.ped.y); }
function until(w, cond, seconds, each = null) { for (let i = 0; i < seconds * 20; i++) { w.step(); if (each) each(); if (cond()) return true; } return false; }
// cuffed on a street corner, and on to the back of a police car
function inTheBack(w, stars = 1) {
  const { p } = joinPlayer(w);
  const n = corner(w);
  teleport(w, p.ped, n.x + 32, n.y + 32);
  wanted(w, p, stars);
  const cop = spawnNpc(w, 'cop', p.ped.x + 20, p.ped.y, 'cop');
  p.ped.downUntil = w.time + 3;
  law.arrest(w, cop, p.ped);
  assert.ok(until(w, () => p.custody && p.custody.stage === 'ride', 80), 'in the back of a police car');
  return { p, v: w.get(p.ped.vehId) };
}

test('a break for it from the back seat while the car is stopped: a head start - the crew take a moment - and a star more', () => {
  for (const stars of [1, 4]) {
    const w = makeWorld();
    const { p, v } = inTheBack(w, stars);
    const crew = police.crewOf(w, v);
    assert.ok(until(w, () => crew.every((c) => c.vehId === v.id), 12) && crew.length >= 1, 'the crew aboard');
    // moving: no try (only a stopped car's door can be kicked open)
    w.time = Math.max(w.time, p.custody.tryAt || 0);
    v.vx = Math.cos(v.a) * 300; v.vy = Math.sin(v.a) * 300;
    assert.ok(!custody.canBreak(p, w), 'not while it\'s moving');
    v.vx = 0; v.vy = 0;
    assert.ok(custody.canBreak(p, w) && players.buildMe(w, p).custody.brk === 1, 'stopped: the action button kicks the door');
    assert.match(players.findInteraction(w, p).label, /break for it/i, 'on the action button (ACT on a phone)');
    // a try that fails: the next in a moment
    const r0 = w.rand;
    w.rand = () => 0.999;
    custody.breakOut(w, p);
    assert.ok(p.custody && p.ped.vehId === v.id && !custody.canBreak(p, w), 'the door holds; no second try straight away');
    w.time += BREAK_RETRY_S;
    w.rand = () => 0;
    custody.breakOut(w, p);
    w.rand = r0;
    assert.ok(!p.custody && !p.ped.cuffed && !p.ped.vehId, 'out of the car and the cuffs');
    assert.equal(p.wanted, stars + ESCAPE_STARS, `a star more (${stars} -> ${p.wanted})`);
    const L = COP_LEVEL[stars], t0 = w.time;
    assert.ok(Math.abs(v.ai.holdUntil - t0 - L.exitS) < 1e-6 && p.ped.graceUntil > t0 + L.exitS, 'the crew held a moment; no tackle lands meanwhile');
    // the head start: nobody out of the car for exitS
    let out = 0;
    for (let i = 0; i < (L.exitS + 1.5) * 20; i++) {
      p.inputQ.push({ seq: p.ack + 1, bits: 0, mx: 0, my: 0, aim: 0 });
      w.step();
      if (crew.some((c) => !c.vehId) && !out) out = w.time - t0;
    }
    assert.ok(out >= L.exitS - 0.06, `${stars} star(s): the first officer out after ${out.toFixed(2)} s (the head start: ${L.exitS} s)`);
    assert.ok(out > 0, 'then they come after you');
  }
  assert.ok(COP_LEVEL[1].exitS > COP_LEVEL[4].exitS && BREAK_CAR.chance[1] > BREAK_CAR.chance[4] * 5, 'a longer head start and better odds at low stars');
});

test('the ride: to the nearest station on its roads, the siren on; stuck for good, a fade to black and the cells', () => {
  const w = makeWorld();
  const { p, v } = inTheBack(w, 1);
  const st = w.map.pois[p.custody.station];
  assert.ok(st && st.kind === 'police' && custody.reachableStation(w, v.x, v.y) === st, 'the nearest station it can drive to');
  let siren = false, fade = false;
  assert.ok(until(w, () => p.custody && p.custody.stage !== 'ride', 160, () => { if (v.sirenOn) siren = true; }), 'got out of the car');
  assert.ok(siren, 'the siren on, on the way (the traffic pulls over)');
  assert.ok(until(w, () => p.custody && p.custody.stage === 'cell', 60, () => { if (p.custody && p.custody.stage === 'fade') fade = true; }), 'in a cell');
  assert.equal(p.custody.station, st.id, 'at that station');
  assert.ok(!fade, 'driven there: no fade');
  // a car going nowhere (its wheels without grip: a stand-in for stuck): it tries again, then the fade, then the cells
  const w2 = makeWorld();
  const { p: q, v: car } = inTheBack(w2, 1);
  const fx = car.x, fy = car.y;
  const freeze = () => { if (q.custody && q.custody.stage === 'ride') { car.vx = 0; car.vy = 0; car.x = fx; car.y = fy; } };
  let replanned = false;
  assert.ok(until(w2, () => q.custody.stage === 'fade', CUSTODY_SKIP_S + 10, () => { freeze(); if (q.custody.replanAt) replanned = true; }), 'the fade');
  assert.ok(replanned, 'it planned its way again first');
  assert.equal(players.buildMe(w2, q).custody.s, 'fade', 'the page draws the fade');
  assert.ok(!custody.canBreak(q, w2), 'no break in the dark');
  assert.ok(until(w2, () => q.custody.stage === 'cell', CUSTODY_FADE_S + 1), 'and then the cells');
  assert.equal(w2.map.pois[q.custody.station].kind, 'police');
});

test('cuffed where no road leads to a station (an island without one): no car drives off into the sea - the fade, and the nearest cells', () => {
  const w = makeWorld();
  // a junction whose roads reach no station (sampled across the map)
  let spot = null;
  for (let i = 0; i < w.map.nodes.length && !spot; i += 7) { const n = w.map.nodes[i]; if (n.lvl === 0 && !custody.reachableStation(w, n.x, n.y) && !w.map.isWater(n.x, n.y)) spot = n; }
  if (!spot) { assert.ok(true, 'every road in this world reaches a station (World v3\'s islands: test/prison.test.js)'); return; }
  const { p } = joinPlayer(w);
  teleport(w, p.ped, spot.x + 20, spot.y + 20);
  wanted(w, p, 1);
  const cars = new Set(w.police || []);
  const cop = spawnNpc(w, 'cop', p.ped.x + 20, p.ped.y, 'cop');
  p.ped.downUntil = w.time + 3;
  law.arrest(w, cop, p.ped);
  let wet = false, sent = false, fade = false;
  assert.ok(until(w, () => p.custody && p.custody.stage === 'cell', 30, () => {
    const t = w.map.tileAtPx(p.ped.x, p.ped.y);
    if (!p.custody || p.custody.stage === 'cell') return;
    if (t === T.WATER || t === T.DEEP) wet = true;
    if (p.custody.stage === 'fade') fade = true;
    for (const id of w.police || []) if (!cars.has(id)) { const v = w.get(id); if (v && v.ai && v.ai.prisoner === p.pid) sent = true; }
  }), 'in a cell');
  assert.ok(fade && !sent && !wet, `the fade (${fade}), no car sent (${sent}), never in the water (${wet})`);
  assert.equal(w.map.pois[p.custody.station].kind, 'police');
});
