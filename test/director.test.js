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
import { loopOf, SCENES } from '../client/director.js';
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
