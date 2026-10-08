// How the animals move (server/systems/wildlife.js moveLike, fleeAngle, unstick, eyeCatch): a bolt builds up - a
// start, a turn, then the run gathers speed - instead of going flat out in a step; cornered, an animal breaks out
// instead of pressing into the corner; a bird beats up to speed; and a careful hunter can creep close.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer, run, teleport } from './helpers.js';
import { K, T, TILE } from '../shared/constants.js';
import { DISTRICTS } from '../shared/map.js';
import * as wildlife from '../server/systems/wildlife.js';
import * as players from '../server/systems/players.js';
import { APOSE, SPECIES } from '../shared/fauna.js';

// open ground in the middle of Highland Woods, nothing standing within r px of it
function openWoods(w, r = 360) {
  const m = w.map, pts = [];
  for (let ty = 0; ty < m.h; ty += 3) for (let tx = 0; tx < m.w; tx += 3) if (DISTRICTS[m.dist[ty * m.w + tx]].name === 'Highland Woods' && m.tiles[ty * m.w + tx] === T.GRASS) pts.push([tx, ty]);
  pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const R = Math.ceil(r / TILE);
  for (const [tx, ty] of pts.slice(Math.floor(pts.length / 3))) {
    let ok = true;
    for (let dy = -R; dy <= R && ok; dy++) for (let dx = -R; dx <= R && ok; dx++) { const t = m.tiles[(ty + dy) * m.w + tx + dx]; if (t !== T.GRASS && t !== T.DIRT && t !== T.FIELD) ok = false; }
    if (!ok) continue;
    const x = tx * TILE + 16, y = ty * TILE + 16;
    for (const arr of m.solidProps.values()) for (const e of arr) if (Math.hypot(e.x - x, e.y - y) < r + 40) e.off = true;
    return { x, y };
  }
  throw new Error('no open ground in the woods');
}
const clearAll = (w) => { for (const e of [...w.entities.values()]) if ((e.kind === K.PED && !e.player) || (e.kind === K.VEH && !e.owner)) w.remove(e); };
let seq = 1;
const walk = (w, p, mx, my, secs, stop = () => false) => { for (let i = 0; i < secs * 20 && !stop(); i++) { players.queueInput(p, { seq: seq++, bits: 0, mx, my, aim: Math.atan2(my, mx) }); w.step(); } };

test('a bolting deer starts, turns and gathers speed - not flat out in a step', () => {
  const w = makeWorld({ npcBudget: 0 });
  const { p } = joinPlayer(w);
  clearAll(w);
  const at = openWoods(w);
  const a = wildlife.spawnAnimal(w, 'deer', at.x, at.y, 0);
  a.wild.lead = true; a.a = Math.PI;   // grazing, facing west - toward where you'll be
  w.windHold = { a: Math.PI / 2, s: 0.6 };
  teleport(w, p.ped, at.x - 250, at.y);
  run(w, 0.05);
  // a sprint straight at it: it knows, and goes
  const sp = [];
  let started = -1;
  for (let i = 0; i < 60; i++) {
    players.queueInput(p, { seq: seq++, bits: 8, mx: 1, my: 0, aim: 0 });
    w.step();
    if (started < 0 && a.wild.state === 'flee') started = i;
    if (started >= 0) sp.push(Math.hypot(a.vx, a.vy));
  }
  assert.ok(started >= 0, 'it bolts');
  const run0 = SPECIES.deer.run;
  assert.ok(sp[0] < run0 * 0.3, `the first moment: a start, not a run (${Math.round(sp[0])} px/s)`);
  assert.ok(sp[2] < run0 * 0.6, `still gathering speed a tenth of a second in (${Math.round(sp[2])} px/s)`);
  const top = Math.max(...sp.slice(10, 30));
  assert.ok(top > run0 * 0.85, `then flat out (${Math.round(top)} px/s)`);
  // no snap turns: it swung round from facing you over a few steps
  assert.ok(Math.hypot(a.x - at.x, a.y - at.y) > 120 && a.x > at.x - 20, 'and away from you');
});

test('cornered in a pocket of boulders, an animal breaks out past you instead of pressing into the back of it', () => {
  const w = makeWorld({ npcBudget: 0 });
  const { p } = joinPlayer(w);
  clearAll(w);
  const at = openWoods(w, 420), m = w.map;
  // a pocket of boulders open only to the west (solid props: a deer can't push through them)
  const rock = (x, y) => { const k = Math.floor(y / TILE) * m.w + Math.floor(x / TILE); let arr = m.solidProps.get(k); if (!arr) m.solidProps.set(k, arr = []); arr.push({ x, y, r: 16, t: 'boulder' }); };
  for (let k = 0; k <= 9; k++) { rock(at.x - 120 + k * 24, at.y - 80); rock(at.x - 120 + k * 24, at.y + 80); }
  for (let k = 0; k <= 6; k++) rock(at.x + 100, at.y - 80 + k * 26);
  const a = wildlife.spawnAnimal(w, 'deer', at.x + 40, at.y, 0);
  a.wild.lead = true; a.a = Math.PI;
  w.windHold = { a: Math.PI / 2, s: 0.6 };
  // you come at it from the west, along the open side: straight away from you is the back of the pocket
  teleport(w, p.ped, at.x - 330, at.y + 20);
  walk(w, p, 1, 0, 4, () => a.wild.state === 'flee');
  assert.equal(a.wild.state, 'flee');
  walk(w, p, 0, 0, 3);
  const inPocket = a.x > at.x - 125 && a.x < at.x + 110 && Math.abs(a.y - at.y) < 85;
  assert.ok(!inPocket && Math.hypot(a.x - at.x, a.y - at.y) > 220, `it broke out of the pocket and away (${Math.round(a.x - at.x)}, ${Math.round(a.y - at.y)} from its middle)`);
});

test('a flushed pheasant beats up to speed; a deer creeping hunters can reach while its head is down', () => {
  const w = makeWorld({ npcBudget: 0 });
  const { p } = joinPlayer(w);
  clearAll(w);
  const at = openWoods(w);
  const b = wildlife.spawnAnimal(w, 'pheasant', at.x, at.y, 0);
  teleport(w, p.ped, at.x - 40, at.y);
  for (let i = 0; i < 40 && b.wild.state !== 'fly'; i++) w.step();
  assert.equal(b.wild.state, 'fly', 'flushed');
  const v0 = Math.hypot(b.vx, b.vy);
  run(w, 0.6);
  const v1 = Math.hypot(b.vx, b.vy);
  assert.ok(v0 < SPECIES.pheasant.fly * 0.6 && v1 > v0 * 1.4, `it climbs to speed (${Math.round(v0)} -> ${Math.round(v1)} px/s)`);
  // a deer grazing, facing away; you creep up from behind (downwind of nothing: a cross wind)
  clearAll(w);
  const d = wildlife.spawnAnimal(w, 'deer', at.x, at.y, 0);
  d.wild.lead = true; d.a = 0; d.wild.until = w.time + 999; d.wild.act = APOSE.graze;
  w.windHold = { a: Math.PI / 2, s: 0.6 };
  teleport(w, p.ped, at.x - 420, at.y);
  run(w, 0.3);
  let closest = 1e9;
  walk(w, p, 0.3, 0, 40, () => { closest = Math.min(closest, Math.hypot(d.x - p.ped.x, d.y - p.ped.y)); return d.wild.state === 'flee' || closest < 70; });
  assert.ok(closest < 140, `crept within ${Math.round(closest)} px`);
});
