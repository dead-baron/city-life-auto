// The rest spots in the wilds (shared/restspots.js; tasks #341, #396, concepts CF2-A/B): campfire clearings far
// from anything built - off a trail, by a view, or in the middle of nowhere - each with a seat log, placed by rules;
// they work like every campfire (light, sit, heal). And the hunting camps have no "HUNTING CAMP" sign any more.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer, run, teleport, players } from './helpers.js';
import { T, TILE, MAP_W } from '../shared/constants.js';
import { DISTRICTS } from '../shared/map.js';
import { FIRE_HEAL } from '../shared/rules.js';
import * as campfires from '../server/systems/campfires.js';

const BUILT = new Set([T.ROAD, T.SIDEWALK, T.PLAZA, T.BUILDING, T.LOT, T.FIELD, T.DOCK, T.BRIDGE]);

test('rest spots: campfire clearings far out in the wilds, off trails, by views and in the middle of nowhere', () => {
  const m = makeWorld().map;
  const S = m.restSpots;
  assert.ok(Array.isArray(S) && S.length >= 12, `a good few of them (${S && S.length})`);
  const n = (k) => S.filter((s) => s.kind === k).length;
  assert.ok(n('trail') >= 5 && n('view') >= 3 && n('wild') >= 2, `every kind (trail ${n('trail')}, view ${n('view')}, wild ${n('wild')})`);
  const fires = m.props.filter((p) => p && p.t === 'campfire');
  for (const s of S) {
    const where = `${s.kind} spot at ${Math.round(s.x)},${Math.round(s.y)}`;
    const tx = Math.floor(s.x / TILE), ty = Math.floor(s.y / TILE), i = ty * MAP_W + tx;
    assert.ok(['wild', 'rocky', 'desert', 'rural'].includes(DISTRICTS[m.dist[i]].style), `${where}: out in the wilds`);
    const f = fires.find((p) => p.x === s.x && p.y === s.y);
    assert.ok(f && f.rest, `${where}: a campfire`);
    assert.equal(!!f.lit, !!s.lit);
    assert.ok(m.props.some((p) => p && p.t === 'log' && p.seat && Math.hypot(p.x - s.x, p.y - s.y) < 80), `${where}: a seat log`);
    assert.ok(m.props.some((p) => p && p.t === 'boulder' && Math.hypot(p.x - s.x, p.y - s.y) < 140), `${where}: rocks round it`);
    assert.equal(m.tiles[i], T.DIRT, `${where}: a dirt clearing`);
    // away from all development: no building, no pavement, lot or field near it
    for (const b of m.buildings) {
      const dx = Math.max(b.tx * TILE - s.x, 0, s.x - (b.tx + b.tw) * TILE), dy = Math.max(b.ty * TILE - s.y, 0, s.y - (b.ty + b.th) * TILE);
      assert.ok(Math.hypot(dx, dy) > 500, `${where}: clear of ${b.name || 'a building'}`);
    }
    for (let dy = -18; dy <= 18; dy++) for (let dx = -18; dx <= 18; dx++) assert.ok(!BUILT.has(m.tiles[(ty + dy) * MAP_W + tx + dx]), `${where}: nothing built within 18 m`);
    // a trail spot is off a trail (dirt a few strides away); a view spot looks over water
    let trail = 99, water = 0;
    for (let dy = -11; dy <= 11; dy++) for (let dx = -11; dx <= 11; dx++) {
      const t = m.tiles[(ty + dy) * MAP_W + tx + dx], d = Math.hypot(dx, dy);
      if (d > 11) continue;
      if (t === T.WATER || t === T.DEEP) water++;
      if (t === T.DIRT && d > 4 && d < trail && (m.reserve[(ty + dy) * MAP_W + tx + dx] & 32)) trail = d;
    }
    if (s.kind === 'view') assert.ok(water >= 25, `${where}: water in view (${water})`);
    if (s.kind === 'trail') assert.ok(trail < 11, `${where}: a trail nearby`);
    for (const o of S) if (o !== s) assert.ok(Math.hypot(o.x - s.x, o.y - s.y) >= 1500, `${where}: spaced apart`);
  }
});

test('rest spots work like every campfire: light it, sit on the log and warm up', () => {
  const w = makeWorld();
  const { p } = joinPlayer(w);
  const s = w.map.restSpots.find((q) => !q.lit) || w.map.restSpots[0];
  const i = w.map.props.findIndex((q) => q && q.t === 'campfire' && q.x === s.x && q.y === s.y);
  teleport(w, p.ped, s.x + 30, s.y + 10);
  let act = players.findInteraction(w, p);
  if (!campfires.isLit(w, i)) {
    assert.ok(act && /Light the campfire/.test(act.label), `the prompt (${act && act.label})`);
    act.run();
    act = players.findInteraction(w, p);
  }
  assert.ok(act && /Sit by the fire/.test(act.label), `the prompt (${act && act.label})`);
  p.ped.hp = 40; p.ped.lastHitAt = -99;
  act.run();
  assert.ok(p.ped.sit, 'sitting');
  run(w, 10);
  assert.ok(p.ped.hp > 40 + FIRE_HEAL * 8, `warmed up (${p.ped.hp.toFixed(1)})`);
});

test('the hunting camps have no "HUNTING CAMP" sign (the outfitters are still there)', () => {
  const m = makeWorld().map;
  assert.ok(!m.props.some((p) => p && p.t === 'textsign' && /HUNTING CAMP/.test(p.text)), 'no sign');
  assert.ok(m.pois.filter((q) => q.kind === 'huntcamp').length >= 2, 'the camps are still there');
});
