// CityMap as a window onto the world (World v3, docs/WORLD-V3.md part 8, item 1): a map's extent is its own (x0, y0,
// w, h, idx, inside) and every reader indexes it through them, so a window cut from the city (shared/mapwindow.js)
// answers every query inside it as the whole map does. Today's world is the whole window: nothing changes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { T, TILE, MAP_W, MAP_H, DT } from '../shared/constants.js';
import { generateCity, cityData, isTurf, waterKind, nearestLand, isSwimming, ISLANDS } from '../shared/map.js';
import { windowOf } from '../shared/mapwindow.js';
import { underCover, tunnelAt } from '../shared/tunnels.js';
import { underDeck, surfaceZ } from '../shared/levels.js';
import { urbanAt } from '../shared/covers.js';
import { pedStep, vehStep, newPedState, newVehState } from '../shared/physics.js';
import { VEHICLES } from '../shared/vehicles.js';
import { IN } from '../shared/input.js';
import { bakeGround } from '../client/art2/game/groundbake.js';

const ROOT = new URL('..', import.meta.url).pathname;
const M = generateCity(1337);
const [mx0, my0, mx1, my1] = ISLANDS.D.box;   // Metro City
const CX = Math.round((mx0 + mx1) / 2), CY = Math.round((my0 + my1) / 2);
const MID = windowOf(M, CX - 300, CY - 250, 600, 500);                  // round Metro City's centre
const EDGE = windowOf(M, MAP_W - 420, MAP_H - 380, 420, 380);         // the world's south-east corner (touches two edges)

test('today\'s map is the whole window: origin 0, 0, the world\'s size, the index as it always was', () => {
  assert.equal(M.x0, 0); assert.equal(M.y0, 0); assert.equal(M.w, MAP_W); assert.equal(M.h, MAP_H);
  for (const [tx, ty] of [[0, 0], [MAP_W - 1, 0], [17, 933], [MAP_W - 1, MAP_H - 1], [CX, CY]]) {
    assert.equal(M.idx(tx, ty), ty * MAP_W + tx);
    assert.equal(M.row(ty) + M.col(tx), M.idx(tx, ty));
    assert.ok(M.inside(tx, ty));
  }
  for (const [tx, ty] of [[-1, 0], [0, -1], [MAP_W, 5], [5, MAP_H]]) assert.ok(!M.inside(tx, ty));
  // (the origin lives on the prototype: the city as data - what the browser keeps, what the world hash covers - is as it was)
  const d = cityData(M);
  assert.ok(!('x0' in d) && !('y0' in d), 'no new fields in the city as data');
});

test('a window holds its rectangle: layers cut, lists whole, a wall outside it, the open sea past the world\'s edge', () => {
  assert.deepEqual([MID.x0, MID.y0, MID.w, MID.h], [CX - 300, CY - 250, 600, 500]);
  assert.equal(MID.tiles.length, 600 * 500);
  assert.equal(MID.bld.length, 600 * 500);
  assert.equal(MID.props, M.props, 'the lists are kept whole');
  assert.equal(MID.idx(MID.x0, MID.y0), 0);
  assert.equal(MID.tileAt(MID.x0 - 1, MID.y0 + 10), T.WALL, 'outside the window: a wall');
  assert.equal(MID.tileAt(MID.x0 + 600, MID.y0 + 10), T.WALL);
  assert.ok(!MID.inside(MID.x0 + 600, MID.y0) && MID.inside(MID.x0 + 599, MID.y0 + 499));
  // the corner window: past the world's edge it's the open sea, as on the whole map
  assert.equal(EDGE.tileAt(MAP_W + 5, MAP_H - 10), M.tileAt(MAP_W + 5, MAP_H - 10));
  assert.equal(EDGE.tileAt(MAP_W - 10, MAP_H + 5), T.DEEP);
  assert.equal(EDGE.tileAt(EDGE.x0 - 1, EDGE.y0 + 5), T.WALL, 'inside the world but not the window: a wall');
  let n = 0;
  for (const [, arr] of MID.solidProps) n += arr.length;
  assert.ok(n > 1000, `the solid props inside the window come with it (${n})`);
});

// every tile of window W (less a margin for the queries that look round a point) against the whole map
function eachTile(W, margin, step, f) {
  for (let ty = W.y0 + margin; ty < W.y0 + W.h - margin; ty += step) for (let tx = W.x0 + margin; tx < W.x0 + W.w - margin; tx += step) f(tx, ty);
}

for (const [name, W] of [['Metro City', MID], ['the south-east corner', EDGE]]) {
  test(`${name}: every tile query answers as the whole map's`, () => {
    let n = 0;
    eachTile(W, 0, 1, (tx, ty) => {
      const x = tx * TILE + 13, y = ty * TILE + 21;
      if (W.tileAt(tx, ty) !== M.tileAt(tx, ty)) assert.fail(`tileAt ${tx},${ty}`);
      if (W.districtAt(x, y) !== M.districtAt(x, y)) assert.fail(`districtAt ${tx},${ty}`);
      if (W.zoneAt(x, y) !== M.zoneAt(x, y)) assert.fail(`zoneAt ${tx},${ty}`);
      if (W.buildingAtPx(x, y) !== M.buildingAtPx(x, y)) assert.fail(`buildingAtPx ${tx},${ty}`);
      if (W.isWater(x, y) !== M.isWater(x, y) || W.isWalkable(x, y) !== M.isWalkable(x, y)) assert.fail(`isWater/isWalkable ${tx},${ty}`);
      if (waterKind(W, tx, ty) !== waterKind(M, tx, ty)) assert.fail(`waterKind ${tx},${ty}`);
      if (isTurf(W, x, y) !== isTurf(M, x, y)) assert.fail(`isTurf ${tx},${ty}`);
      if (underCover(W, x, y) !== underCover(M, x, y) || tunnelAt(W, x, y) !== tunnelAt(M, x, y)) assert.fail(`underCover ${tx},${ty}`);
      if (underDeck(W, x, y) !== underDeck(M, x, y) || surfaceZ(W, x, y, 1) !== surfaceZ(M, x, y, 1)) assert.fail(`deck ${tx},${ty}`);
      if (urbanAt(W, x, y) !== urbanAt(M, x, y)) assert.fail(`urbanAt ${tx},${ty}`);
      if ((tx & 15) === 0 && (ty & 15) === 0 && W.islandAt(x, y) !== M.islandAt(x, y)) assert.fail(`islandAt ${tx},${ty}`);
      n++;
    });
    assert.ok(n >= W.w * W.h * 0.99, `${n} tiles`);
  });

  test(`${name}: sight, shots and the way ashore answer as the whole map's`, () => {
    let n = 0, hits = 0;
    eachTile(W, 30, 7, (tx, ty) => {
      const x = tx * TILE + 16, y = ty * TILE + 16, h = (tx * 73856093) ^ (ty * 19349663);
      const x2 = x + ((h & 1023) - 512) * 1.5, y2 = y + (((h >> 10) & 1023) - 512) * 1.5;   // (within 24 tiles: inside the window)
      const a = M.rayTiles(x, y, x2, y2), b = W.rayTiles(x, y, x2, y2);
      if (a !== b) assert.fail(`rayTiles ${tx},${ty}`);
      if (M.los(x, y, x2, y2) !== W.los(x, y, x2, y2)) assert.fail(`los ${tx},${ty}`);
      if (a < 1) hits++;
      if (M.isWater(x, y)) {
        const p = nearestLand(M, x, y, 24), q = nearestLand(W, x, y, 24);
        if (JSON.stringify(p) !== JSON.stringify(q)) assert.fail(`nearestLand ${tx},${ty}`);
      }
      n++;
    });
    assert.ok(n > 2000 && hits > 50, `${n} rays, ${hits} blocked`);
  });
}

test('the physics: a car and a person move through the window as on the whole map', () => {
  // start on the window's streets, well inside it, and drive / walk a weaving way for a few seconds
  const starts = [];
  eachTile(MID, 150, 37, (tx, ty) => { if (M.tileAt(tx, ty) === T.ROAD && starts.length < 12) starts.push([tx * TILE + 16, ty * TILE + 16]); });
  assert.ok(starts.length >= 6, 'streets to start on');
  const def = VEHICLES.sedan, mods = { speedMul: 1, canMove: true, canSprint: true, canSwim: true, analog: true };
  let moved = 0;
  for (const [x, y] of starts) {
    const a = newVehState(x, y, 0.3), b = newVehState(x, y, 0.3);
    const p = { ...newPedState(x, y), lz: 0 }, q = { ...newPedState(x, y), lz: 0 };
    for (let i = 0; i < 4 / DT; i++) {
      const steer = Math.sin(i * 0.11), inp = { throttle: 1, steer, hb: i % 40 > 34, slide: false, drv: true };
      vehStep(a, { ...inp }, DT, M, def, { rain: i > 40 }); vehStep(b, { ...inp }, DT, MID, def, { rain: i > 40 });
      const pin = { bits: i % 30 < 20 ? IN.SPRINT : 0, mx: Math.cos(i * 0.07), my: Math.sin(i * 0.05), aim: i * 0.1 };
      pedStep(p, { ...pin }, DT, M, mods); pedStep(q, { ...pin }, DT, MID, mods);
      if (a.x !== b.x || a.y !== b.y || a.a !== b.a) assert.fail(`the car at ${x},${y} step ${i}: ${a.x},${a.y} vs ${b.x},${b.y}`);
      if (p.x !== q.x || p.y !== q.y) assert.fail(`the person at ${x},${y} step ${i}`);
      if (isSwimming(M, p) !== isSwimming(MID, q)) assert.fail('swimming');
    }
    moved += Math.hypot(a.x - x, a.y - y) + Math.hypot(p.x - x, p.y - y);
  }
  assert.ok(moved > starts.length * 400, 'they got somewhere');
});

test('the art v2 ground bake of a chunk inside the window: the same bytes as from the whole map', () => {
  const CH = 768 / TILE;   // (tiles in an art chunk)
  for (const [cx, cy] of [[Math.floor(CX / CH), Math.floor(CY / CH)], [Math.floor((CX + 80) / CH), Math.floor((CY - 60) / CH)]]) {
    const copy = (G) => ({ col: G.col.slice(), nrm: G.nrm.slice(), z: G.z.slice(), emi: G.emi.slice(), flag: G.flag.slice() });   // (the bake's buffer is reused)
    const a = copy(bakeGround(M, cx, cy, { quality: 0, seed: 1337 })), b = copy(bakeGround(MID, cx, cy, { quality: 0, seed: 1337 }));
    for (const k of Object.keys(a)) assert.ok(Buffer.from(a[k].buffer).equals(Buffer.from(b[k].buffer)), `chunk ${cx},${cy}: ${k}`);
  }
});

// The guard: code that reads the map goes through m.idx / m.inside, never the world's constants. What may keep them:
// the generator (it builds the world's whole frame), and code that means the whole frame - each with its reason.
const GENERATOR = new Set(['shared/naturesites.js', 'shared/countryside.js', 'shared/world3.js', 'shared/world3-islands.js', 'shared/world3-skeleton.js', 'shared/constants.js']);
const PAUSED = new Set(['shared/tutorial.js', 'client/tutorial.js']);   // (the tour is paused: CLAUDE.md)
const WHOLE_FRAME = {
  'shared/map.js': 'tileAt: the open sea past the world\'s edge',
  'shared/underground.js': 'the underground lies under the whole world: its regions and physics map are the frame\'s',
  'server/systems/ferries.js': 'the server plans the ferries over the whole world it holds: its grids are the frame\'s',
  'server/artcdn.js': 'the art CDN\'s chunk grid spans the world',
  'client/art2/game/host.js': 'the art\'s chunk grid spans the world',
  'client/art2/game/standin.js': 'the art\'s chunk grid spans the world',
  'client/main.js': 'the camera\'s bounds (the world\'s edge and the sea past it) and the ground chunks\' grid',
  'client/spectator.js': 'the schematic picture and the camera span the world',
  'client/devtp.js': 'the world map picture\'s size',
  'client/devhomes.js': 'the dev picture of the whole world',
  'client/route.js': 'the road list is the world\'s: the router\'s grid spans the world',
};
const INDEX = /\*\s*MAP_[WH]\b|\bMAP_[WH]\s*\*/;
const BOUNDS = /[<>]=?\s*MAP_[WH]\b|\bMAP_[WH]\s*[-+]\s*\d/;
function jsFiles(dir) {
  const out = [];
  for (const f of readdirSync(join(ROOT, dir))) {
    const p = join(dir, f), st = statSync(join(ROOT, p));
    if (st.isDirectory()) out.push(...jsFiles(p));
    else if (f.endsWith('.js')) out.push(p);
  }
  return out;
}
test('the guard: no `* MAP_W` index arithmetic and no MAP_W / MAP_H bounds checks in the code that reads the map', () => {
  const bad = [], used = new Set();
  for (const f of [...jsFiles('server'), ...jsFiles('client'), ...jsFiles('shared')]) {
    if (GENERATOR.has(f) || PAUSED.has(f)) continue;
    let src = readFileSync(join(ROOT, f), 'utf8');
    if (f === 'shared/map.js') src = src.slice(0, src.indexOf('// The generator (from here to mapSignature)'));   // (the generator keeps the frame for now)
    src.split('\n').forEach((line, i) => {
      if (!INDEX.test(line) && !BOUNDS.test(line)) return;
      if (WHOLE_FRAME[f]) { used.add(f); return; }
      bad.push(`${f}:${i + 1}: ${line.trim().slice(0, 120)}`);
    });
  }
  assert.deepEqual(bad, [], 'index the map through m.idx / m.inside (or add the whole-frame use, with its reason)');
  for (const f of Object.keys(WHOLE_FRAME)) assert.ok(used.has(f), `${f} is on the whole-frame list but no longer needs it`);
});
