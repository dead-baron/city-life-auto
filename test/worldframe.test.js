// The world's frame (World v3, docs/WORLD-V3.md part 8): what means "the whole world" - its edge and the open sea past
// it (tileAt, shared/border.js), the camera's bounds, the chunk grids (the server's net chunks, the art's), the router's
// grid, the underground, the ferry planner - follows the frame the map carries (m.frame = { w, h }: a whole map's own
// extent, a window's the world's), not today's constants. Proved on today's world built in a bigger frame (MAP_W + 240
// x MAP_H + 240: today's land in its top-left, the open sea beyond - generateCity's opts.frame): the server's world runs
// on it with players at the old edge and past the new one. (Today's frame is unchanged: every other test.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { joinPlayer, teleport } from './helpers.js';
import { World } from '../server/world.js';
import { T, TILE, MAP_W, MAP_H, CHUNK_TILES, CHUNK_PX, CHUNKS_X, K, DT } from '../shared/constants.js';
import { generateCity, cityData } from '../shared/map.js';
import { windowOf } from '../shared/mapwindow.js';
import { edgeInfo, clampCam, EDGE_SLOW, EDGE_OUT } from '../shared/border.js';
import { undergroundOf, ugMapOf } from '../shared/underground.js';
import { pedStep, newPedState } from '../shared/physics.js';
import { IN } from '../shared/input.js';
import { artGrid, planBake } from '../client/art2/game/host.js';
import { artChunks } from '../server/artcdn.js';
import { createRouter } from '../client/route.js';
import { mapFrameOf, MAP_FRAME } from '../client/hud.js';
import { pointGrid } from '../server/pointgrid.js';
import { queueInput } from '../server/systems/players.js';

const FW = MAP_W + 240, FH = MAP_H + 240;
const F = generateCity(1337, { frame: { w: FW, h: FH } });
const OLD_X = MAP_W * TILE, NEW_X = FW * TILE;   // the old east edge and the new one (px)

test('the map carries the world\'s frame: a whole map\'s own extent, a window the world\'s; the city as data is unchanged', () => {
  assert.deepEqual({ ...F.frame }, { w: FW, h: FH });
  assert.ok(!Object.keys(F).includes('frame') && !('frame' in cityData(F)), 'not a field of the city as data (the world hash)');
  const W = windowOf(F, MAP_W - 100, 300, 300, 260);
  assert.deepEqual({ ...W.frame }, { w: FW, h: FH }, 'a window carries the world\'s frame');
  assert.deepEqual([W.x0, W.y0, W.w, W.h], [MAP_W - 100, 300, 300, 260]);
  // the edge: past the old one, the frame's own sea (tiles); past the new one, the open sea for a way, then the wall
  for (const m of [F, W]) {
    assert.equal(m.tileAt(MAP_W + 40, 400), T.DEEP);
    assert.equal(m.tileAt(FW + 5, 400), T.DEEP, 'past the new edge: the open sea');
    assert.equal(m.tileAt(FW + Math.ceil(EDGE_OUT / TILE) + 8, 400), T.WALL, 'beyond the band: the wall');
  }
  assert.equal(W.tileAt(W.x0 + W.w + 5, 400), T.WALL, 'the window: outside it, inside the world, a wall');
  const E = windowOf(F, FW - 200, FH - 200, 200, 200);   // (touches the new edges)
  assert.equal(E.tileAt(FW + 5, FH - 50), T.DEEP, 'a window at the new edge: the open sea past it');
  assert.equal(E.tileAt(FW - 50, FH + 5), T.DEEP);
  // the border reads the frame: past the old edge you're still in the world; past the new one, out
  assert.equal(edgeInfo(OLD_X + EDGE_SLOW + 300, 9000, {}, F.frame).d, 0);
  assert.equal(edgeInfo(NEW_X + 300, 9000, {}, F.frame).d, 300);
  assert.equal(edgeInfo(OLD_X + 300, 9000).d, 300, 'without a frame: today\'s');
  // the camera's bounds
  assert.deepEqual(clampCam({ x: 1e9, y: -1e9 }, F.frame), { x: NEW_X + EDGE_OUT, y: -EDGE_OUT });
  assert.deepEqual(clampCam({ x: OLD_X + 2000, y: 500 }, F.frame), { x: OLD_X + 2000, y: 500 }, 'free past the old edge');
});

test('the person swimming out: on freely past the old edge\'s end, slowed and stopped at the new edge\'s', () => {
  const mods = { speedMul: 1, canMove: true, canSprint: true, canSwim: true, analog: true };
  const swim = (s, secs, m = F) => { let v = 0; for (let i = 0; i < secs / DT; i++) { pedStep(s, { bits: IN.SPRINT, mx: 1, my: 0, aim: 0 }, DT, m, mods); v = Math.hypot(s.vx, s.vy); } return v; };
  const s = { ...newPedState(OLD_X + EDGE_OUT - 100, 600 * TILE), a: 0, lz: 0 };
  const free = swim(s, 4);
  assert.ok(s.x > OLD_X + EDGE_OUT + 100 && free > 40, `on past the old edge's end at speed (${Math.round(s.x - OLD_X)} px past it, ${Math.round(free)} px/s)`);
  // (the same swim on open sea without a frame: today's, held at the old edge's end)
  const sea = { tileAt: () => T.DEEP, tileAtPx: () => T.DEEP, solidProps: new Map(), x0: 0, y0: 0, w: 1, h: 1, idx: () => 0, row: () => 0, col: () => 0, inside: () => false };
  const today = { ...newPedState(OLD_X + EDGE_OUT - 100, 600 * TILE), a: 0, lz: 0 };
  swim(today, 4, sea);
  assert.ok(today.x - OLD_X <= EDGE_OUT + 0.5, `in today's frame: held there (${Math.round(today.x - OLD_X)})`);
  const t = { ...newPedState(NEW_X + EDGE_SLOW - 50, 600 * TILE), a: 0, lz: 0 };
  swim(t, 60);
  assert.ok(t.x - NEW_X <= EDGE_OUT + 0.5 && t.x - NEW_X > EDGE_OUT - 80, `held at the new edge's end (${Math.round(t.x - NEW_X)} px out)`);
});

test('the server\'s world on the bigger frame: traffic, people, boats, the border at the new edge, the net chunks', () => {
  const w = new World(F, { npcBudget: 40, throwErrors: true });
  assert.equal(w.chunksX, Math.ceil(FW / CHUNK_TILES));
  assert.equal(w.chunksY, Math.ceil(FH / CHUNK_TILES));
  assert.ok(w.chunksX > CHUNKS_X);
  // A on a street by the old east edge (Dry Creek), B swimming past the old edge, C out past the new one
  let road = null;
  for (let ty = 900; ty > 300 && !road; ty -= 3) for (let tx = MAP_W - 30; tx > MAP_W - 200 && !road; tx--) if (F.tileAt(tx, ty) === T.ROAD && F.tileAt(tx + 1, ty) === T.ROAD) road = [tx, ty];
  assert.ok(road, 'a street by the old east edge');
  const A = joinPlayer(w).p, B = joinPlayer(w).p, C = joinPlayer(w).p;
  teleport(w, A.ped, road[0] * TILE + 16, road[1] * TILE + 16);
  teleport(w, B.ped, OLD_X + EDGE_OUT - 100, 700 * TILE); B.ped.swim = true;
  teleport(w, C.ped, NEW_X + EDGE_SLOW - 50, 500 * TILE); C.ped.swim = true;
  // B and C swim east (their inputs as the page sends them), A stands
  let seq = 0;
  for (let i = 0; i < 45 / DT; i++) {
    seq++;
    for (const p of [B, C]) queueInput(p, { seq, bits: 0, mx: 1, my: 0, aim: 0 });
    queueInput(A, { seq, bits: 0, mx: 0, my: 0, aim: 0 });
    w.step();
  }
  // the border: B on past the old edge's end, C held at the new edge's
  assert.ok(B.ped.x > OLD_X + EDGE_OUT + 500 && edgeInfo(B.ped.x, B.ped.y, {}, F.frame).d === 0, `B swam on past the old edge's end (${Math.round(B.ped.x - OLD_X)} px past the old edge)`);
  assert.ok(C.ped.x - NEW_X <= EDGE_OUT + 0.5 && C.ped.x - NEW_X > EDGE_OUT - 200, `C held at the new edge's end (${Math.round(C.ped.x - NEW_X)} px out)`);
  // the net chunks: past the old grid's last column, each in its own chunk, found by the culling's lookups
  for (const e of [B.ped, C.ped]) {
    assert.equal(e.cx, Math.min(w.chunksX - 1, Math.floor(e.x / CHUNK_PX)), 'its own column');
    assert.ok(e.cx >= CHUNKS_X, `past the old grid (${e.cx})`);
    assert.ok([...w.inChunks(e.cx, e.cy, e.cx, e.cy)].includes(e), 'in its chunk');
  }
  assert.ok(w.query(C.ped.x, C.ped.y, 60, K.PED).includes(C.ped));
  // life round them: traffic and people round A, the harbour patrol out to B past the old edge
  const ents = [...w.entities.values()];
  const npcs = ents.filter((e) => e.kind === K.PED && e.npc);
  assert.ok(w.trafficCount > 0 && npcs.length > 3, `traffic (${w.trafficCount}) and people (${npcs.length})`);
  const boats = ents.filter((e) => e.kind === K.VEH && e.ai && (e.ai.kind === 'pboat' || e.ai.kind === 'boater'));
  assert.ok(boats.some((v) => v.x > OLD_X), `boats out past the old edge (${boats.map((v) => Math.round(v.x / TILE)).join(', ')})`);
  for (const v of boats) assert.ok(!F.tileAt(Math.floor(v.x / TILE), Math.floor(v.y / TILE)) || F.isWater(v.x, v.y), 'on the water');
  // the ferries were planned on the bigger frame: their ways on open water
  const routes = F._ferryRoutes || [];
  assert.ok(routes.length >= 1, `${routes.length} ferry routes`);
  for (const R of routes) for (const way of R.ways || []) for (const p of way) assert.ok(F.isWater(p.x, p.y), 'a ferry\'s way on the water');
});

test('the underground lies under the world\'s frame', () => {
  const L = undergroundOf(F), P = ugMapOf(F);
  assert.ok(L && L.regions.length >= 1);
  assert.deepEqual([P.w, P.h, P.frame.w], [FW, FH, FW]);
  for (const R of L.regions) assert.ok(R.x0 >= 0 && R.y0 >= 0 && R.x0 + R.w <= FW && R.y0 + R.h <= FH);
});

test('the client\'s grids from a map of another frame: the art\'s chunks, the art CDN\'s, the router\'s', () => {
  const [cx, cy] = artGrid(F), CH = 768;
  assert.deepEqual([cx, cy], [Math.ceil(NEW_X / CH), Math.ceil(FH * TILE / CH)]);
  assert.deepEqual(artChunks(F), { CX: cx, CY: cy, CHUNK: CH });
  // a view past the old edge: its chunks are planned (today's grid would stop at its last column)
  const oldCX = Math.ceil(OLD_X / CH), X = OLD_X + 3000, Y = 500 * TILE;
  const need = new Map(), bake = new Map();
  planBake(need, bake, { x0: X - 880, y0: Y - 495, x1: X + 880, y1: Y + 495, cx: X, cy: Y, gx: 0, gy: 0 }, 0, 0, 200, [], artGrid(F));
  const cols = [...need.keys()].map((k) => k % 1000);
  assert.ok(cols.some((c) => c >= oldCX) && Math.max(...cols) < cx, `the chunks past the old grid (${Math.min(...cols)}-${Math.max(...cols)})`);
  const edge = new Map();
  planBake(edge, new Map(), { x0: NEW_X - 400, y0: Y - 495, x1: NEW_X + 1360, y1: Y + 495, cx: NEW_X + 480, cy: Y, gx: 0, gy: 0 }, 0, 0, 200, [], artGrid(F));
  assert.ok([...edge.keys()].every((k) => k % 1000 < cx), 'none past the new edge (the sea there is the stand-in)');
  // the big map's frame: the world's, less today's margins (today's world: as it was)
  assert.deepEqual(mapFrameOf(F), [MAP_FRAME[0], MAP_FRAME[1], MAP_FRAME[2] + 240 * TILE, MAP_FRAME[3] + 240 * TILE]);
  assert.deepEqual(mapFrameOf({ frame: { w: MAP_W, h: MAP_H } }), MAP_FRAME);
  // the router: routes on the map of the bigger frame, and on a window of it, alike
  const ends = [];
  for (const e of F.edges) if (e.lvl === 0 && e.pts.length > 1 && ends.length < 2) { const p = e.pts[0]; if (p.x > OLD_X - 9000 && (!ends.length || Math.hypot(p.x - ends[0].x, p.y - ends[0].y) > 3000)) ends.push({ x: p.x, y: p.y }); }
  assert.equal(ends.length, 2, 'two road points by the old east edge');
  const a = createRouter(F).update(ends[0], ends[1], true, 0);
  const win = windowOf(F, MAP_W - 600, 0, 840, FH);
  const b = createRouter(win).update(ends[0], ends[1], true, 0);
  assert.ok(a && a.pts.length > 2, 'a route');
  assert.deepEqual(b && b.pts, a.pts, 'the window\'s router finds the same');
});

test('the sea\'s points through their index: what the whole list\'s scans found', () => {
  const pts = F.seaPoints;
  assert.ok(pts.length > 10000, `${pts.length} sea points`);
  const g = pointGrid(pts);
  assert.equal(pointGrid(pts), g, 'made once per list');
  for (const [x, y] of [[OLD_X + 2000, 9000], [NEW_X - 100, FH * TILE - 100], [20000, 20000], [-3000, 5000], [NEW_X + 900, 400]]) {
    const ring = pts.filter((p) => { const d = Math.hypot(p.x - x, p.y - y); return d >= 750 && d <= 1400; });
    assert.deepEqual(g.within(x, y, 750, 1400), ring);
    assert.equal(g.any(x, y, 900), pts.some((p) => Math.hypot(p.x - x, p.y - y) < 900));
    const near = pts.reduce((b, p) => { const d = Math.hypot(p.x - x, p.y - y); return d > 300 && (!b || d < Math.hypot(b.x - x, b.y - y)) ? p : b; }, null);
    assert.equal(g.nearest(x, y, 300), near);
  }
});
