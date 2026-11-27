// Things a vehicle hits react (the owner, 11-23 20:10: "cars/vehicles actually knock over or break down or smash through
// the fence/chain link fences/wooden fences ... trees fall over or bus stops or benches get knocked over or shatter ...
// not just disappear ... if an NPC or player is sitting on an object ... they should go flying off"):
//  - a fence: slow, it holds the car (test/fences.test.js); fast, the car goes through and the panel goes down - the
//    server breaks the prop (props.js breakProp), it lies flat for everyone (m.downFences), walked and driven over;
//  - what's knocked over lies there as itself on its side with its pieces round it (statics.js brokenVariant -> 'topple',
//    gbuf.js toppleGBuf), never just gone;
//  - whoever sat on it is thrown.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer, teleport } from './helpers.js';
import { TILE, T, DT, K } from '../shared/constants.js';
import { FENCE_SMASH } from '../shared/rules.js';
import { fenceSegments } from '../shared/fences.js';
import { BREAKABLE } from '../shared/mapcore.js';
import * as props from '../server/systems/props.js';
import { spawnNpc } from '../server/systems/npc.js';

const w = makeWorld(), m = w.map;
function openPatch() {
  for (let ty = m.y0 + 40; ty < m.y0 + m.h - 40; ty += 3) for (let tx = m.x0 + 40; tx < m.x0 + m.w - 40; tx += 3) {
    let ok = true;
    for (let dy = 0; dy < 16 && ok; dy++) for (let dx = 0; dx < 20 && ok; dx++) { const i = m.idx(tx + dx, ty + dy); if (m.tiles[i] !== T.GRASS || m.solidProps.has(i) || m.bld[i] >= 0) ok = false; }
    if (ok && !fenceSegments(m).some((s) => Math.abs(s.x0 / TILE - tx) < 40 && Math.abs(s.y0 / TILE - ty) < 40)) return [tx, ty];
  }
  return null;
}
const P = openPatch(), fy = (P[1] + 8) * TILE;
m.props.push({ t: 'chainfence', x: P[0] * TILE, y: fy, tx: 20 * TILE, ty: 0 });
const fi = m.props.length - 1;

test('a car into a chain-link fence fast goes through, the panel knocked flat; slow, it holds', () => {
  const { p } = joinPlayer(w);
  teleport(w, p.ped, (P[0] + 10) * TILE, fy - 260);
  const v = w.spawnVehicle('sedan', (P[0] + 10) * TILE, fy - 60, Math.PI / 2, {});
  v.vx = 0; v.vy = FENCE_SMASH.tall + 120;
  v.input = { throttle: 1, steer: 0, hb: false };
  let through = false;
  for (let i = 0; i < 40 && !through; i++) { w.step(); if (v.y > fy + 20) through = true; }
  assert.ok(through, `through the fence (${Math.round(v.y - fy)} px past)`);
  assert.ok(w.brokenProps.has(fi), 'the fence broken');
  assert.ok(m.downFences && m.downFences.has(fi), 'lying flat for everyone');
  assert.ok(Math.hypot(v.vx, v.vy) < FENCE_SMASH.tall + 120, 'slowed going through');
  // people walk over it now
  teleport(w, p.ped, (P[0] + 6) * TILE, fy - 40);
  for (let i = 0; i < 60; i++) { w.step(); p.ped.vy = 90; }
});

test('what a car knocks over is drawn lying there, never just gone', async () => {
  const S = await import('../client/art2/game/statics.js');
  const rec = { t: 'v', m: 'busShelter', a: [72, 1], hd: 0, pv: null };
  const G = S.makeStatic({ t: 'topple', of: rec, a: 0.4, shards: 'glass', seed: 3 });
  let n = 0, zmax = 0;
  for (let k = 0; k < G.w * G.h; k++) if (G.col[k * 4 + 3]) { n++; zmax = Math.max(zmax, G.z[k]); }
  assert.ok(n > 400, `the shelter lying there (${n} px)`);
  assert.ok(zmax <= 4, `flat on the ground (${zmax} px up at most)`);
  for (const t of ['bench_a', 'busstop', 'phonebox', 'planter_sq', 'chainfence', 'fenceline', 'trashcan']) assert.ok(BREAKABLE.has(t), `${t} breaks`);
});

test('someone sat on a bench a car smashes is thrown off', () => {
  const x = (P[0] + 4) * TILE, y = (P[1] + 3) * TILE;
  m.props.push({ t: 'bench_a', x, y });
  const bi = m.props.length - 1;
  const e = spawnNpc(w, 'casual', x, y);
  e.gt = 'sit'; e.npc.act = { k: 'sit', x, y, a: 0 };
  assert.ok(props.breakProp(w, bi, 300, 0, null), 'broken');
  assert.ok(e.airUntil > w.time, 'up in the air');
  assert.ok(e.vx > 100 && !e.gt && !e.npc.act, 'flung the way the car went, off the bench, out of its sit');
});

test('what a vehicle smashes hurts it by how solid it is and how hard it hit (SMASH_HURT): a tree a real hit, a bag nothing', async () => {
  const { SMASH_HURT } = await import('../shared/rules.js');
  const vehicles = await import('../server/systems/vehicles.js');
  for (const t of BREAKABLE) assert.ok(SMASH_HURT.w[t] !== undefined, `${t} has a weight`);
  const car = () => w.spawnVehicle('sedan', (P[0] + 10) * TILE, (P[1] + 12) * TILE, 0, { npcOwned: false });
  const hit = (kind, sp) => { const v = car(), hp = v.hp; vehicles.smashHurt(w, v, kind, sp); const lost = (hp - v.hp) / v.def.hp; w.remove(v); return lost; };
  const tree = hit('tree_a', 400), bench = hit('bench_a', 400), can = hit('trashcan', 400), bag = hit('bags', 400);
  assert.ok(tree > 0.15 && tree < 0.45, `a tree at speed: a real hit (${(tree * 100).toFixed(0)}%)`);
  assert.ok(bench > 0.03 && bench < tree / 2, `a bench: a little (${(bench * 100).toFixed(0)}%)`);
  assert.ok(can > 0 && can < bench, `a trash can: less (${(can * 100).toFixed(1)}%)`);
  assert.equal(bag, 0, 'a bag of trash: nothing');
  assert.ok(hit('tree_a', 150) < tree / 3, 'slower, much less');
  // through enough of them the car is done for: twenty trash cans at speed hurt like a tree or two
  const v = car(); for (let i = 0; i < 20; i++) vehicles.smashHurt(w, v, 'trashcan', 400);
  assert.ok((v.def.hp - v.hp) / v.def.hp > tree, 'twenty trash cans add up');
  w.remove(v);
});
