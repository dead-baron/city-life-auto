// The Employment Center in World v3 (the owner, 11-16: "so we can send beta players that way" - shared/world3-jobcenter.js):
// built Downtown across Park East Avenue from Greenfield Park, a walk-in with its door onto 22nd Street's pavement, its
// front desk (office work) and job computer inside and reached from the door, a walk from the city's arrival; laid last,
// so nothing else's number moved; its room fitted as an employment office (shared/shoprooms.js FIT.jobs); on the map
// and the Places app; nothing of the placement lint's on it (tools/placementlint.mjs).
// One World v3 build (about 100 s and 2 GB): the heavy lock.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildWorld3 } from '../server/world3.js';
import { TILE, T } from '../shared/constants.js';
import { PED_BLOCK } from '../shared/mapcore.js';
import { shopRoom, planOf } from '../shared/shoprooms.js';
import { lint } from '../tools/placementlint.mjs';
import { KIND_ICON, MAP_CATS } from '../client/mapwaypoints.js';
import { STORE_ICON, GLYPHS } from '../client/storeicons.js';

const { map: M } = await buildWorld3(1337, { log: () => {} });
const J = M.world3.jobCenter;

// a walk on foot over the tiles from (x, y) px: the tiles reached within max steps
function walk(m, from, max = 4000) {
  const seen = new Map(), q = [[Math.floor(from.x / TILE), Math.floor(from.y / TILE)]];
  seen.set(q[0][0] + ',' + q[0][1], 0);
  while (q.length) {
    const [x, y] = q.shift(), d = seen.get(x + ',' + y);
    if (d >= max) continue;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy, k = nx + ',' + ny;
      if (seen.has(k) || !m.inside(nx, ny) || PED_BLOCK[m.tiles[m.idx(nx, ny)]]) continue;
      seen.set(k, d + 1); q.push([nx, ny]);
    }
  }
  return (p) => seen.get(Math.floor(p.x / TILE) + ',' + Math.floor(p.y / TILE));
}

test('the Employment Center: built Downtown last, a walk-in onto the pavement, its two counters inside', () => {
  assert.ok(J && J.built, `built (${J && J.why})`);
  const b = M.buildings[J.b], desk = M.pois[J.poi], pc = M.pois[J.pc];
  assert.equal(b.name, 'Employment Center');
  assert.equal(M.districtAt(desk.x, desk.y).name, 'Downtown');
  assert.equal(desk.kind, 'jobcenter'); assert.equal(pc.kind, 'jobpc');
  assert.ok(M.walkIns.includes(b.id) && b.walkIn.south, 'a walk-in, its door on the south');
  const u = b.walkIn.units[0];
  assert.equal(u.trade, 'jobs'); assert.equal(planOf(u), 'jobs');
  // the doorway: two floor tiles in the front wall, the pavement outside them
  for (let k = 0; k < u.door.w; k++) assert.equal(M.tiles[M.idx(u.door.tx + k, u.door.ty)], T.FLOOR, 'the doorway open');
  const out = M.tiles[M.idx(u.door.tx, u.door.ty + 1)];
  assert.ok(out === T.SIDEWALK || out === T.PLAZA, 'onto the pavement');
  // both counters on the room's floor, reached on foot from the street outside
  const reach = walk(M, { x: (u.door.tx + 0.5) * TILE, y: (u.door.ty + 1.5) * TILE });
  for (const p of [desk, pc]) {
    assert.equal(M.bld[M.idx(Math.floor(p.x / TILE), Math.floor(p.y / TILE))], b.id, `${p.kind} inside the building`);
    assert.ok(reach(p) !== undefined, `${p.kind} reached from the door`);
  }
  // and from the city's arrival, on foot
  const stn = M.pois.find((q) => q && q.arrival && q.label === 'Greenfield Park Station');
  assert.ok(stn, 'the city\'s arrival');
  const steps = reach(stn);
  assert.ok(steps !== undefined && steps < 400, `a walk from Greenfield Park Station (${steps} tiles)`);
  // laid last: no home or business after it in the lists, so nothing's number moved
  assert.ok(M.buildings.slice(J.b + 1).every((q) => !q || (q.home === undefined && !q.business)), 'no building with a home or a business after it');
  assert.ok(M.pois.slice(J.poi + 1).every((q) => !q || !['home', 'delivery', 'jobcenter'].includes(q.kind) || q.kind === 'delivery' && q.b === undefined), 'no home or business place after it');
  assert.equal(M.pois.filter((q) => q && q.kind === 'jobcenter').length, 1, 'one of it');
});

test('its room: the front desk, the job board, NOW HIRING, the job computers - the computer\'s spot by the first', () => {
  const b = M.buildings[J.b], u = b.walkIn.units[0], R = shopRoom(b, u, TILE, M), pc = M.pois[J.pc];
  assert.equal(R.plan, 'jobs');
  assert.ok(R.onWall.some((q) => q.t === 'jobs'), 'the cork job board');
  assert.ok(R.onWall.some((q) => q.t === 'sign' && /HIRING|JOBS/.test(q.text)), 'its sign on the wall');
  const desks = R.pieces.filter((p) => p.t === 'desk' && p.pc);
  assert.ok(desks.length >= 2, `job computers (${desks.length})`);
  const d0 = desks[0];
  assert.ok(Math.abs(pc.x - (d0.x0 + 20)) <= 1 && pc.y > d0.y1 && pc.y - d0.y1 < 20, 'the job computer\'s place in front of the first desk');
});

test('on the map, the Places app and over its door; nothing of the placement lint\'s on it', () => {
  assert.equal(KIND_ICON.jobcenter, 'jobs');
  assert.ok(MAP_CATS.find((c) => c.id === 'jobs').kinds.includes('jobcenter'));
  assert.ok(STORE_ICON.jobcenter && GLYPHS[STORE_ICON.jobcenter], 'a badge over the door');
  const b = M.buildings[J.b], x0 = (b.tx - 6) * TILE, x1 = (b.tx + b.tw + 6) * TILE, y0 = (b.ty - 6) * TILE, y1 = (b.ty + b.th + 6) * TILE;
  const L = lint(M), here = [];
  for (const [k, rows] of Object.entries(L)) if (Array.isArray(rows)) for (const r of rows) if (r && r.x >= x0 && r.x < x1 && r.y >= y0 && r.y < y1) here.push(`${k}: ${r.what}${r.why ? ` (${r.why})` : ''}`);
  assert.deepEqual(here, [], 'the lint is clean round it');
});
