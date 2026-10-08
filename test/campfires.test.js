// Campfires (server/systems/campfires.js): light one, sit by it and warm up, put it out; everyone sees the same fires
// (the 'fire' event, the welcome's list), and a change goes back the way the map laid it out after a while. Stargazing
// at the Granite Peak Observatory (places.js): after dark, two dollars and the night sky through the eyepiece.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer, run, teleport, players } from './helpers.js';
import { FIRE_HEAL, FIRE_BURN_S, HUNT_COOK_S } from '../shared/rules.js';
import { DAY_PART_S } from '../shared/constants.js';
import * as campfires from '../server/systems/campfires.js';
import * as places from '../server/systems/places.js';

const fireWhere = (w, lit) => {
  const i = w.map.props.findIndex((q) => q && q.t === 'campfire' && !!q.lit === lit);
  return { i, p: w.map.props[i] };
};

test('campfires: light one, sit by it and warm up, get up by moving, put it out; everyone sees it; it goes back in time', () => {
  const w = makeWorld();
  const { p } = joinPlayer(w);
  // a cold fire pit: light it
  const cold = fireWhere(w, false);
  assert.ok(cold.p, 'a fire pit nobody has lit');
  teleport(w, p.ped, cold.p.x + 26, cold.p.y + 8);
  let act = players.findInteraction(w, p);
  assert.ok(act && /Light the campfire/.test(act.label), `the prompt (${act && act.label})`);
  const ev0 = w.globalEvents.length;
  act.run();
  assert.ok(campfires.isLit(w, cold.i), 'burning');
  assert.ok(w.globalEvents.slice(ev0).some((e) => e.e === 'fire' && e.i === cold.i && e.lit === 1), 'everyone told');
  assert.deepEqual(campfires.fireList(w), [[cold.i, 1]], 'and a player joining hears of it');
  // sit by it, hurt: health comes back while you sit
  act = players.findInteraction(w, p);
  assert.ok(act && /Sit by the fire/.test(act.label), `the prompt (${act && act.label})`);
  p.ped.hp = 40; p.ped.lastHitAt = -99;
  act.run();
  assert.ok(p.ped.sit, 'sitting');
  assert.ok(Math.abs(Math.atan2(cold.p.y - p.ped.y, cold.p.x - p.ped.x) - p.ped.a) < 0.01, 'facing the fire');
  run(w, 10);
  assert.ok(p.ped.hp > 40 + FIRE_HEAL * 8, `warmed up (${p.ped.hp.toFixed(1)})`);
  assert.ok(p.ped.sit, 'still sitting');
  // a step gets you up
  teleport(w, p.ped, p.ped.x, p.ped.y - 9);
  run(w, 0.2);
  assert.ok(!p.ped.sit, 'up again');
  // sitting, the action button puts it out
  players.findInteraction(w, p).run();
  assert.ok(p.ped.sit, 'sitting again');
  act = players.findInteraction(w, p);
  assert.ok(act && /Put out the fire/.test(act.label), `the prompt (${act && act.label})`);
  act.run();
  assert.ok(!campfires.isLit(w, cold.i), 'out');
  assert.ok(!p.ped.sit, 'and up');
  // a fire the campers keep going: put it out, and after a while it's lit again
  const warm = fireWhere(w, true);
  campfires.setLit(w, warm.i, false);
  assert.ok(!campfires.isLit(w, warm.i));
  w.time += FIRE_BURN_S + 1;
  run(w, 1.2);
  assert.ok(campfires.isLit(w, warm.i), 'the campers lit it again');
  assert.ok(!w.fires.has(warm.i), 'back as the map laid it out');
});

test('campfires: a fire you lit cooks meat too; nobody warms up in the middle of a fight', () => {
  const w = makeWorld();
  const { p } = joinPlayer(w);
  const cold = fireWhere(w, false);
  teleport(w, p.ped, cold.p.x + 26, cold.p.y + 8);
  players.findInteraction(w, p).run();   // light it
  p.profile.inventory.venison = 2;
  const act = players.findInteraction(w, p);
  assert.ok(act && /Cook your meat/.test(act.label), `cooking comes first (${act && act.label})`);
  act.run();
  run(w, HUNT_COOK_S + 0.5);
  assert.equal(p.profile.inventory.venisonSteak, 2, 'cooked over it');
  // just hit: no warming up yet
  players.findInteraction(w, p).run();
  assert.ok(p.ped.sit, 'sitting');
  p.ped.hp = 50; p.ped.lastHitAt = w.time + 0.01;
  run(w, 0.5);
  assert.ok(!p.ped.sit, 'a hit gets you up');
});

test('stargazing at the observatory: capped by day; after dark two dollars and the night sky through the eyepiece', () => {
  const w = makeWorld();
  const { p, conn } = joinPlayer(w);
  const site = w.map.countrySites.find((s) => s.type === 'observatory');
  const scope = w.map.props.find((q) => q && q.t === 'scope' && q.x >= site.x * 32 && q.x <= (site.x + site.w) * 32 && q.y >= site.y * 32 && q.y <= (site.y + site.h) * 32);
  assert.ok(scope, 'a telescope on the terrace');
  teleport(w, p.ped, scope.x + 16, scope.y + 20);
  w.loopTime = 90; run(w, 0.3);
  let act = players.findInteraction(w, p);
  assert.ok(act && /capped/.test(act.label), `by day (${act && act.label})`);
  w.loopTime = DAY_PART_S + 60; run(w, 0.3);
  act = players.findInteraction(w, p);
  assert.ok(act && /Look at the stars/.test(act.label), `after dark (${act && act.label})`);
  p.profile.cash = 10;
  act.run();
  const st = conn.sent.find((o) => o && o.t === 'stars');
  assert.ok(st && st.s > 0 && places.SKY_SIGHTS.some(([k]) => k === st.what), `tonight's sight (${st && st.what})`);
  assert.equal(p.profile.cash, 8, 'two dollars');
  assert.equal(places.skySight(w)[0], st.what, 'the same for everyone tonight');
});
