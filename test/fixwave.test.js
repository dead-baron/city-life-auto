// The owner's 11-12 fix wave, the parts that need no World v3 build (the rest: test/plainblocks.test.js, world3tropic,
// calmwater): no knots of walkers round a player (server npc.js spread, rules.js CROWD_CAP), a filling station's pumps that
// go up (server props.js, rules.js FUEL_PUMP), one name on a front (client/art2/game/statics.js sameName), a player's name
// tag over the aircraft they fly (client/main.js tagY), the snorkelers live (server wildfolk.js 'snorkel'), and the
// cinematic mode's Showcase (client/showcase.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeWorld, joinPlayer, run, teleport } from './helpers.js';
import { T, TILE, K } from '../shared/constants.js';
import { CROWD_CAP, FUEL_PUMP } from '../shared/rules.js';
import { BREAKABLE, HEAVY_PROPS } from '../shared/mapcore.js';
import * as npc from '../server/systems/npc.js';
import * as props from '../server/systems/props.js';
import { WILD_KINDS, WILD_LOOKS, wildMembers } from '../server/systems/wildfolk.js';
import { SHOWCASE, showcaseSpot } from '../client/showcase.js';

const ROOT = new URL('..', import.meta.url).pathname;
const tileAt = (m, x, y) => m.tiles[m.idx(Math.floor(x / TILE), Math.floor(y / TILE))];
function spotOf(m, want) {
  for (let ty = m.y0 + 60; ty < m.y0 + m.h - 60; ty += 3) for (let tx = m.x0 + 60; tx < m.x0 + m.w - 60; tx += 3) if (want(m.tiles[m.idx(tx, ty)])) return { x: (tx + 0.5) * TILE, y: (ty + 0.5) * TILE };
  return null;
}

test('no knot of walkers round a player: past the cap the rest are sent off another way', () => {
  const world = makeWorld(), m = world.map, { p } = joinPlayer(world);
  for (const [want, open] of [[(t) => t === T.GRASS, true], [(t) => t === T.SIDEWALK, false]]) {
    const at = spotOf(m, want);
    assert.ok(at, 'a spot');
    teleport(world, p.ped, at.x, at.y);
    const peds = [];
    for (let k = 0; k < 14; k++) { const e = npc.spawnNpc(world, 'casual', at.x + Math.cos(k) * (40 + k * 8), at.y + Math.sin(k) * (40 + k * 8), 'civ'); e.npc.state = 'wander'; peds.push(e); }
    npc.spread(world, [p.ped], false);
    const sent = peds.filter((e) => e.npc.offUntil > world.time), stay = peds.length - sent.length;
    const cap = open ? CROWD_CAP.open : Math.round(CROWD_CAP.town * 1);
    assert.ok(stay <= Math.max(cap, Math.round(CROWD_CAP.town * 1.5)) && stay >= (open ? CROWD_CAP.open : 3), `${open ? 'open ground' : 'a pavement'}: ${stay} stay`);
    if (open) assert.equal(stay, CROWD_CAP.open);
    for (const e of sent) assert.ok(Number.isFinite(e.npc.awayFrom), 'sent off a way');
    // (and they don't drift straight back toward the player while it lasts)
    for (const e of peds) world.remove(e);
  }
  // an activity, a post, a counter: never moved on
  const at = spotOf(m, (t) => t === T.GRASS);
  teleport(world, p.ped, at.x, at.y);
  const busy = [];
  for (let k = 0; k < 8; k++) { const e = npc.spawnNpc(world, 'casual', at.x + k * 10, at.y + 30, 'civ'); e.npc.act = { k: 'chess', x: e.x, y: e.y }; busy.push(e); }
  npc.spread(world, [p.ped], false);
  assert.ok(busy.every((e) => !(e.npc.offUntil > world.time)), 'people at an activity stay');
  assert.ok(CROWD_CAP.r > 0 && CROWD_CAP.open < CROWD_CAP.town && CROWD_CAP.offS > 0);
});

test('a filling station\'s pump: shot enough or caught in a blast it goes up, sets off the next, and comes back out of view', () => {
  assert.ok(BREAKABLE.has('fuelpump') && HEAVY_PROPS.has('fuelpump'), 'a pump breaks, and it\'s heavy');
  const world = makeWorld({ keepKept: false }), m = world.map, { p } = joinPlayer(world);
  const at = spotOf(m, (t) => t === T.LOT) || spotOf(m, (t) => t === T.PLAZA);
  const keep = m.props.length;
  m.props.push({ t: 'fuelpump', x: at.x, y: at.y }, { t: 'fuelpump', x: at.x + 96, y: at.y });
  const i0 = keep, i1 = keep + 1;
  delete m.breakGrid; delete m._pumpProps;
  try {
    teleport(world, p.ped, at.x - 400, at.y);
    // the shots: one short, then it goes
    for (let k = 0; k < FUEL_PUMP.shots - 1; k++) props.pumpShot(world, i0, p.ped);
    assert.ok(!(world.brokenProps && world.brokenProps.has(i0)), 'still standing');
    const hit = props.pumpOnLine(world, at.x - 200, at.y, at.x + 200, at.y);
    assert.ok(hit && hit.i === i0, 'a shot along the forecourt meets the first pump');
    props.pumpShot(world, i0, p.ped);
    assert.ok(world.brokenProps.has(i0), 'shot to pieces');
    const seen = [], em = world.emit.bind(world);
    world.emit = (x, y, ev) => { seen.push(ev); return em(x, y, ev); };
    run(world, FUEL_PUMP.delay + 0.3);
    assert.ok(seen.some((ev) => ev.e === 'explode' && Math.abs(ev.x - at.x) < 2), 'a fuel blast');
    assert.ok(world.brokenProps.has(i1), 'the next pump caught in it');
    run(world, FUEL_PUMP.delay + 0.3);
    assert.ok(seen.filter((ev) => ev.e === 'explode').length >= 2, 'and it went up too');
    assert.ok(!props.pumpOnLine(world, at.x - 200, at.y, at.x + 300, at.y), 'no standing pump left to hit');
    // the wreck stays while anyone's near, then the crew puts a new one in out of view
    world.brokenProps.set(i0, world.time - FUEL_PUMP.respawnS - 1); world.brokenProps.set(i1, world.time - FUEL_PUMP.respawnS - 1);
    teleport(world, p.ped, at.x + FUEL_PUMP.seePx - 200, at.y);
    run(world, 2.5);
    assert.ok(world.brokenProps.has(i0), 'not in front of someone');
    teleport(world, p.ped, at.x + FUEL_PUMP.seePx + 900, at.y);
    run(world, 2.5);
    assert.ok(!world.brokenProps.has(i0) && !world.brokenProps.has(i1), 'back when nobody can see');
  } finally { m.props.length = keep; delete m.breakGrid; delete m._pumpProps; }
});

test('one name on a front: a hand plan\'s sign drops the trade\'s plaque that says the same', async () => {
  const { sameName } = await import('../client/art2/game/statics.js');
  assert.ok(sameName('OLD TOWN INFIRMARY', 'Old Town Infirmary'));
  assert.ok(sameName('POLICE', 'GULL HARBOR POLICE'));
  assert.ok(!sameName('EMERGENCY', 'OLD TOWN INFIRMARY'));
  assert.ok(!sameName('BAR', 'BARBER SHOP'));
  const src = readFileSync(ROOT + 'client/art2/game/statics.js', 'utf8');
  assert.ok(/spec\.plaques = spec\.plaques\.filter\(\(pq\) => !sameName\(pq\.text, spec\.shop\.sign\.text\)\)/.test(src));
});

test('a player\'s name tag rides on the vehicle they\'re in - an aircraft drawn up by its height carries it up there', () => {
  const src = readFileSync(ROOT + 'client/main.js', 'utf8');
  assert.ok(/if \(p\.flags & PF\.INVEH\) py = tagY\(p, vehs, py, z\);/.test(src));
  const fn = src.slice(src.indexOf('function tagY('), src.indexOf('function drawWorldLabels('));
  assert.ok(fn.includes('camLift') && fn.includes('airDefOf(v)'), 'lifted as the aircraft is drawn');
});

test('the snorkelers are people: someone snorkelling now and then in the reefs\' shallows, in swimwear and goggles', () => {
  assert.ok(WILD_KINDS.snorkel && WILD_KINDS.snorkel.night === 0 && WILD_KINDS.snorkel.cap === 1);
  assert.ok(WILD_LOOKS.snorkeler);
  const ms = wildMembers({ k: 'snorkel', x: 100, y: 100, a: 0, x2: 250, y2: 100 }, Math.random);
  assert.equal(ms.length, 1);
  assert.ok(ms[0].patrol && ms[0].patrol.length === 2 && ms[0].look === 'snorkeler', 'drifting over the reef and back');
  const tropic = readFileSync(ROOT + 'shared/world3-tropic.js', 'utf8');
  assert.ok(!/P\('snorkeler'/.test(tropic), 'no snorkeler painted into the art');
  assert.ok(!/fly: 1/.test(tropic), 'no bird painted in flight');
});

test('the cinematic Showcase: 25-40 hand-crafted places, each with a camera spot, a zoom and a time of day', () => {
  assert.ok(SHOWCASE.length >= 25 && SHOWCASE.length <= 40, `${SHOWCASE.length} places`);
  const names = new Set();
  for (const q of SHOWCASE) {
    assert.ok(q.n && q.g && Array.isArray(q.q) && q.q.length, `${q.n}: a name, a group, what to look up`);
    assert.ok(!names.has(q.n), `${q.n} once`); names.add(q.n);
    assert.ok(q.z >= 0.55 && q.z <= 2.1, `${q.n}: a zoom the camera has`);
    assert.ok(q.t >= 0 && q.t < 1440, `${q.n}: a time of day`);
  }
  // looked up by name in the teleport list (client/devtp.js), the camera's offset from it in tiles
  const places = [{ name: 'Lighthouse Rock', x: 1000, y: 2000 }, { name: 'Somewhere Else', x: 0, y: 0 }];
  const at = showcaseSpot({ q: ['lighthouse rock'], dx: 2, dy: -1 }, places);
  assert.deepEqual(at, { x: 1000 + 2 * TILE, y: 2000 - TILE });
  assert.equal(showcaseSpot({ q: ['Nowhere'] }, places), null);
  // the director loads it with itself, and finds the places only when the panel's open (devtp.js: a dynamic import)
  const dir = readFileSync(ROOT + 'client/director.js', 'utf8');
  assert.ok(dir.includes("from './showcase.js'") && dir.includes("import('./devtp.js')"));
  assert.ok(dir.includes("'Showcase only'"), 'the tour can run the Showcase only');
});
