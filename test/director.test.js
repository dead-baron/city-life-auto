// The cinematic mode (client/director.js - the owner, 10-22: "an option to disable UI, and any other cinematic options";
// "setup staged scenarios on all the [things] I talked about"): its time of day is the server's clock's, its staged
// scenes run commands the debug menu has (each one there, every vehicle real, every place found), the page loads it
// only when asked; and the debug menu's 'place' finds a district by its name, 'afoot' takes you out of a vehicle.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { gameClock } from '../shared/constants.js';
import { DISTRICTS } from '../shared/mapcore.js';
import { VEHICLES } from '../shared/vehicles.js';
import { loopOf, SCENES, DRIFT_SPEEDS, DIRS8, driftStep, keyDir, stickDir, followStep, FRAMES } from '../client/director.js';
import { CINE_KINDS, CINE_TOUR, CINE_KIND } from '../shared/cinekinds.js';
import { kindsFound } from '../server/systems/cinefollow.js';
import { NEAR_KINDS, nearTargets } from '../server/dev.js';
import * as dev from '../server/dev.js';
import { makeWorld, joinPlayer, teleport } from './helpers.js';
import { closure } from '../tools/perf.mjs';

const ROOT = new URL('..', import.meta.url).pathname;

test('the time of day on your screen is the server clock\'s: minutes after midnight to the loop and back', () => {
  for (const m of [0, 180, 390, 540, 720, 930, 1125, 1205, 1380, 1439]) assert.ok(Math.abs(gameClock(loopOf(m)).minutes - m) < 0.5, `${m}`);
});

test('every staged scene runs commands the debug menu has, on real vehicles and places', () => {
  const src = readFileSync(ROOT + 'server/dev.js', 'utf8'), cases = new Set([...src.matchAll(/case '([a-z]+)'/g)].map((x) => x[1]));
  const LOCAL = new Set(['@storm', '@bio', '@bolt']);
  const shared = readdirSync(ROOT + 'shared').filter((f) => f.endsWith('.js')).map((f) => readFileSync(ROOT + 'shared/' + f, 'utf8')).join('\n');
  const names = new Set(DISTRICTS.filter(Boolean).map((d) => d.name));
  assert.ok(SCENES.length >= 50, `${SCENES.length} scenes`);
  const groups = new Set(SCENES.map((s) => s.g));
  for (const g of ['Action', 'Vehicles', 'Police', 'Jobs', 'Crime', 'Life', 'Fun', 'Exploring', 'People', 'Weather']) assert.ok(groups.has(g), g);
  for (const sc of SCENES) {
    assert.ok(sc.n && sc.s.length, sc.n);
    for (const [ms, c, x] of sc.s) {
      assert.ok(ms >= 0, sc.n);
      assert.ok(LOCAL.has(c) || cases.has(c), `${sc.n}: '${c}' is a debug menu command`);
      if (c === 'car') assert.ok(VEHICLES[x.m], `${sc.n}: a ${x.m}`);
      if (c === 'place') assert.ok(names.has(x.n) || shared.includes(x.n), `${sc.n}: "${x.n}" is a district or a place`);
      if (c === 'near') assert.ok(NEAR_KINDS[x.k] || /^[a-z]+$/.test(x.k), `${sc.n}: near ${x.k}`);
    }
    if (sc.t !== undefined) assert.ok(sc.t >= 0 && sc.t < 1440, sc.n);
  }
  // (the old city has the places the 'near' ones look for, as World v3 does - but Lucky Mesa's casinos, World v3's only)
  const w = makeWorld();
  for (const k of new Set(SCENES.flatMap((sc) => sc.s.filter((st) => st[1] === 'near').map((st) => st[2].k)))) {
    if (k === 'casino') continue;
    const has = nearTargets(w.map, k).length > 0 || w.map.pois.some((q) => q && q.kind === k) || (w.map.landmarks || []).some((l) => l.type === k);
    assert.ok(has, `somewhere for 'near ${k}'`);
  }
});

test('the debug menu takes you to a district by its name, and out of a vehicle', () => {
  const w = makeWorld(), { p } = joinPlayer(w);
  p.devMode = true;
  const D = w.map.dist, ped = p.ped, id = DISTRICTS.findIndex((d) => d && d.name === 'Downtown');
  assert.ok(id >= 0);
  dev.command(w, p, 'place', { n: 'Downtown' });
  const tx = Math.floor(ped.x / 32), ty = Math.floor(ped.y / 32);
  let near = false;
  for (let dy = -12; dy <= 12 && !near; dy++) for (let dx = -12; dx <= 12; dx++) if (w.map.inside(tx + dx, ty + dy) && D[w.map.idx(tx + dx, ty + dy)] === id) { near = true; break; }
  assert.ok(near, 'in Downtown');
  dev.command(w, p, 'car', { m: 'sedan', in: 1 });
  assert.ok(ped.vehId, 'at the wheel');
  const v = w.get(ped.vehId);
  dev.command(w, p, 'afoot', {});
  assert.equal(ped.vehId, 0, 'on foot');
  assert.ok(!v.seats.includes(ped.id), 'the seat empty');
});

test('the page loads the cinematic mode only when asked for it', () => {
  const page = closure(['client/boot.js', 'client/main.js']);
  assert.ok(!page.includes('client/director.js'), 'not in the first load');
  assert.ok(readFileSync(ROOT + 'client/main.js', 'utf8').includes("import('./director.js')"), 'loaded on demand');
});

// the owner, 10-24: "choosing which direction the camera drifts at and the speed it drifts at"
test('the drift goes the way it\'s pointed at the speed picked - steered by the keys or a stick, off when it\'s off', () => {
  const run = (a, si, secs, zoom = 1, want = null) => { const d = { x: 0, y: 0, a, si, vx: 0, vy: 0 }; for (let i = 0; i < secs * 60; i++) driftStep(d, 1 / 60, zoom, want); return d; };
  for (const [, a] of DIRS8) {
    const d = run(a, 3, 10), moved = Math.hypot(d.x, d.y);
    assert.ok(Math.abs(Math.atan2(d.y, d.x) - a) < 0.01 || Math.abs(Math.abs(Math.atan2(d.y, d.x) - a) - 2 * Math.PI) < 0.01, `the way: ${a}`);
    assert.ok(moved > DRIFT_SPEEDS[3] * 9 && moved < DRIFT_SPEEDS[3] * 10.01, `${moved.toFixed(0)} px in 10 s at ${DRIFT_SPEEDS[3]} px/s`);
  }
  const still = run(0, 0, 5);
  assert.equal(Math.hypot(still.x, still.y), 0, 'off: it stays put');
  for (let si = 1; si < DRIFT_SPEEDS.length; si++) assert.ok(Math.hypot(run(0, si, 10).x, 0) > Math.hypot(run(0, si - 1, 10).x, 0), `speed ${si} faster than ${si - 1}`);
  assert.ok(Math.abs(run(0, 3, 10, 2).x - run(0, 3, 10, 1).x / 2) < 1, 'zoomed in twice as far: half as far across the world');
  // steered: held right while drifting up, it turns to go right
  const t = run(-Math.PI / 2, 3, 6, 1, 0);
  assert.ok(Math.abs(t.a) < 1e-6, 'turned all the way round to the right');
  assert.equal(keyDir(new Set(['ArrowRight'])), 0);
  assert.equal(keyDir(new Set(['KeyW'])), -Math.PI / 2);
  assert.ok(Math.abs(keyDir(new Set(['KeyS', 'KeyA'])) - 3 * Math.PI / 4) < 1e-9, 'down-left');
  assert.equal(keyDir(new Set(['KeyA', 'KeyD'])), null, 'both ways: no way');
  assert.equal(stickDir({ lx: 0.2, ly: 0.1 }), null, 'a stick barely pushed: no way');
  assert.ok(Math.abs(stickDir({ lx: 0, ly: 0.9 }) - Math.PI / 2) < 1e-9, 'the stick down: down');
});

test('the follow scenes\' camera stays on its subject, leading the way they go; the kinds are the server\'s', () => {
  const f = { x: 0, y: 0, vx: 0, vy: 0, px: null, py: null, fi: 0, lead: FRAMES[0].lead, side: 0, zk: 1 };
  let ex = 0;
  for (let i = 0; i < 600; i++) { ex += 300 / 60; followStep(f, ex, 0, 1 / 60); }   // (10 s at 300 px/s, east)
  assert.ok(f.x > ex, `ahead of them, the way they're going (${(f.x - ex).toFixed(0)} px)`);
  assert.ok(f.x - ex < 400 && Math.abs(f.y) < 1, 'not far ahead, not off to a side in this framing');
  for (let i = 0; i < 300; i++) followStep(f, ex, 0, 1 / 60);   // (they stop)
  assert.ok(Math.abs(f.x - ex) < 30, 'stopped: the camera settles on them');
  // every kind the page lists is one the server finds; the tour has every kind once
  const server = new Set(kindsFound());
  for (const k of CINE_KINDS) { assert.ok(server.has(k.id), `the server finds ${k.id}`); assert.ok(k.n && k.g && k.z > 0, k.id); }
  assert.equal(new Set(CINE_TOUR).size, CINE_TOUR.length, 'nothing twice in the tour');
  assert.deepEqual([...CINE_TOUR].sort(), CINE_KINDS.map((k) => k.id).sort(), 'the tour: every kind');
  for (const k of ['chase', 'race', 'fishing', 'surf', 'combine', 'horse', 'train', 'plane', 'shootout', 'wildlife', 'boat', 'skate']) assert.ok(CINE_KIND[k], `a ${k} scene`);
});
