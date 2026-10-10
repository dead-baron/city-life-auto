// How the animals move (server/systems/wildlife.js moveLike, fleeAngle, wayRound, unstick, eyeCatch): a bolt builds
// up - a start, a turn, then the run gathers speed - instead of going flat out in a step; cornered, an animal breaks out
// instead of pressing into the corner; up against a wall or a fence it goes round or gives up instead of pushing on
// into it; a bird beats up to speed; and a careful hunter can creep close.
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

// Steps the world for secs (or until stop() says so): how long, at most and in all, the animal meant to move (over 12
// px/s) but covered under 30% of that - running on the spot into something - and whether it ever crossed the line x =
// line.x between line.y0 and line.y1 (through a wall or a fence there).
function pushing(w, a, secs, line = null, stop = () => false) {
  let streak = 0, longest = 0, total = 0, lx = a.x, ly = a.y, through = false;
  for (let i = 0; i < secs * 20 && !stop(); i++) {
    w.step();
    assert.ok(!a.removed, 'still about');
    const sp = a.wild.sp || 0, moved = Math.hypot(a.x - lx, a.y - ly);
    if (line && (lx - line.x) * (a.x - line.x) <= 0 && lx !== a.x) { const y = ly + (a.y - ly) * (line.x - lx) / (a.x - lx); if (y > line.y0 && y < line.y1) through = true; }
    lx = a.x; ly = a.y;
    if (sp > 12 && moved < 0.3 * sp * 0.05) { streak += 0.05; total += 0.05; longest = Math.max(longest, streak); } else streak = 0;
  }
  return { longest, total, through };
}

test('up against a wall or a fence an animal goes round it or gives up - it never keeps pushing into it (task #422)', () => {
  const w = makeWorld({ npcBudget: 0 });
  const { p } = joinPlayer(w);
  clearAll(w);
  const at = openWoods(w, 420), m = w.map;
  const calm = (a) => { a.wild.calmUntil = w.time + 999; return a; };   // (nothing passing by sends it off: just the wall)
  // a stone wall, 25 tiles north to south, 2 tiles west of here: its east face at `face`
  const wtx = Math.floor(at.x / TILE) - 3, ty0 = Math.floor(at.y / TILE), saved = [], added = [];
  for (let ty = ty0 - 12; ty <= ty0 + 12; ty++) { const i = ty * m.w + wtx; saved.push([i, m.tiles[i]]); m.tiles[i] = T.WALL; }
  const face = (wtx + 1) * TILE, wall = { x: face - TILE / 2, y0: (ty0 - 12) * TILE, y1: (ty0 + 13) * TILE };
  teleport(w, p.ped, at.x + 600, at.y + 700);   // (near enough that they stay about, out of their sight)
  try {
    // 1. walking somewhere on the far side of it, its nose to the wall: it goes along it, and gives up when that gets it
    // no nearer - it doesn't walk on the spot into the stones
    const deer = calm(wildlife.spawnAnimal(w, 'deer', face + 12, at.y, 0));
    deer.wild.lead = true; deer.a = Math.PI;
    Object.assign(deer.wild, { state: 'walk', wx: face - 120, wy: at.y, until: w.time + 30 });
    let r = pushing(w, deer, 6, wall);
    assert.ok(r.longest <= 0.5 && !r.through, `a walk into the wall: pushed ${r.longest.toFixed(2)} s at a time (${r.total.toFixed(2)} s in all), never through it`);
    assert.ok(!(deer.wild.state === 'walk' && deer.wild.wx === face - 120), 'and it gave that walk up (for somewhere it can get to)');
    if (deer.wild.state === 'walk') assert.ok(deer.wild.wx > face, 'somewhere this side of the wall');
    // 2. a fawn whose mother is on the far side of the wall: it keeps near her where it can - it doesn't lean on the wall
    clearAll(w);
    const doe = calm(wildlife.spawnAnimal(w, 'deer', face - 140, at.y, 7));
    doe.wild.lead = true; doe.wild.until = w.time + 999;
    const fawn = calm(wildlife.spawnAnimal(w, 'deer', face + 14, at.y + 20, 7, { young: true, mother: doe.id }));
    fawn.a = Math.PI; fawn.wild.until = w.time + 999;
    r = pushing(w, fawn, 10, wall);
    assert.ok(r.longest <= 0.5 && r.total <= 1 && !r.through, `a fawn with its mother over the wall: pushed ${r.longest.toFixed(2)} s at a time, ${r.total.toFixed(2)} s in all`);
    // 3. a grizzly charging someone on the far side: it gives the charge up
    clearAll(w);
    teleport(w, p.ped, face - 70, at.y);
    const bear = calm(wildlife.spawnAnimal(w, 'grizzly', face + 80, at.y + 30, 0));
    bear.a = Math.PI;
    Object.assign(bear.wild, { state: 'charge', chargeOf: p.ped.id, bluff: false, until: w.time + 4.5 });
    r = pushing(w, bear, 8, wall);
    assert.ok(r.longest <= 0.5 && !r.through, `a charge at someone over the wall: pushed ${r.longest.toFixed(2)} s at a time (${r.total.toFixed(2)} s in all)`);
    assert.notEqual(bear.wild.state, 'charge', 'and gave it up');
    assert.ok(p.ped.hp === p.ped.maxHp, 'nobody mauled through a wall');
    teleport(w, p.ped, at.x + 600, at.y + 700);
    // 4. running away with the wall right behind it: off along the wall and away, not into it
    clearAll(w);
    const bolt = calm(wildlife.spawnAnimal(w, 'deer', face + 30, at.y, 0));
    bolt.wild.lead = true; bolt.a = Math.PI;
    Object.assign(bolt.wild, { state: 'flee', fx: face + 330, fy: at.y + 10, until: w.time + 4 });
    r = pushing(w, bolt, 3, wall);
    assert.ok(r.longest <= 0.5 && !r.through && Math.hypot(bolt.x - face - 30, bolt.y - at.y) > 250, `bolting with the wall behind it: pushed ${r.longest.toFixed(2)} s at a time, got ${Math.round(Math.hypot(bolt.x - face - 30, bolt.y - at.y))} px away`);
    // 5. a cow ambling at a pasture's fence (posts 16 px apart: pasture-style) for the grass on the other side
    clearAll(w);
    for (const [i, t] of saved) m.tiles[i] = t;
    for (let y = at.y - 320; y <= at.y + 320; y += 16) added.push(m.addSolidProp(face, y, 7));
    const cow = wildlife.spawnAnimal(w, 'cow', face + 20, at.y, 0);
    cow.a = Math.PI;
    Object.assign(cow.wild, { state: 'walk', wx: face - 100, wy: at.y - 30, until: w.time + 30 });
    r = pushing(w, cow, 8, { x: face, y0: at.y - 320, y1: at.y + 320 });
    assert.ok(r.longest <= 0.5 && !r.through, `a cow at the fence: pushed ${r.longest.toFixed(2)} s at a time (${r.total.toFixed(2)} s in all), never through it`);
    for (const e of added) e.off = true;
    // 6. a squirrel bolting up a tree gets up it (it used to run at the bark for good: its body never got close enough)
    clearAll(w);
    const trunk = m.addSolidProp(at.x + 100, at.y + 120, 12);
    added.push(trunk);
    const sq = calm(wildlife.spawnAnimal(w, 'squirrel', at.x + 190, at.y + 130, 0));
    Object.assign(sq.wild, { state: 'totree', tree: { x: trunk.x, y: trunk.y, r: trunk.r }, until: w.time + 4 });
    let up = false;
    for (let i = 0; i < 60 && !up; i++) { w.step(); up = sq.wild.state === 'climb'; }
    assert.ok(up, `up the tree (${sq.wild.state}, ${Math.round(Math.hypot(sq.x - trunk.x, sq.y - trunk.y))} px from the trunk)`);
    run(w, 1);
    assert.ok(Math.hypot(sq.x - trunk.x, sq.y - trunk.y) < trunk.r + 6, 'and it stays on the trunk while it is up there');
    // 7. down to drink at a pond: at the water's edge it stops and drinks (it used to wade into the edge until it gave up)
    clearAll(w);
    const pond = [];
    for (let ty = ty0 - 4; ty <= ty0 + 4; ty++) for (let tx = wtx - 6; tx <= wtx; tx++) { const i = ty * m.w + tx; pond.push([i, m.tiles[i]]); m.tiles[i] = T.WATER; }
    saved.push(...pond);
    const thirsty = calm(wildlife.spawnAnimal(w, 'deer', face + 90, at.y, 0));
    thirsty.wild.lead = true;
    Object.assign(thirsty.wild, { state: 'walk', wx: face - 40, wy: at.y, until: w.time + 12, drink: true, act: APOSE.drink });
    r = pushing(w, thirsty, 6, null, () => thirsty.wild.state !== 'walk');
    assert.ok(r.longest <= 0.5 && thirsty.x > face, `walking down to the water: pushed ${r.longest.toFixed(2)} s at a time`);
    assert.equal(thirsty.wild.state, 'idle', 'there');
    assert.ok(thirsty.x - face < 40, `at the water's edge (${Math.round(thirsty.x - face)} px from it)`);
    assert.equal(thirsty.wild.act, APOSE.drink, 'drinking');
  } finally {
    for (const [i, t] of saved) m.tiles[i] = t;
    for (const e of added) e.off = true;
  }
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
