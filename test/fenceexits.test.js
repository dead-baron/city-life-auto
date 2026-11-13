// A fenced place people go into has ways out on more than one side (the owner, 11-12: "some areas like soccer fields
// will be fenced off entirely except for one point to enter ... maybe an exit near the corners (maybe not the corners
// itself)" - shared/world3-fenceexits.js): on a small map of its own, a court in chain-link with its one gate in the
// corner gets a second way out on another side; one shut all round gets two, the first facing the pavement; each a
// gap two people wide, a few tiles in from the corner. What keeps people out stays shut: a pool's fence, the airport's
// barbed wire, the prison's yard, a home's garden. (World v3's own places: test/world3server.test.js, on its build.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CityMap } from '../shared/mapcore.js';
import { T, TILE } from '../shared/constants.js';
import { fenceExits3, EXITS3 } from '../shared/world3-fenceexits.js';
import { fenceSegments } from '../shared/fences.js';
import { waysOut } from './fenceaudit.js';

const W = 90, H = 70, X0 = 20, Y0 = 10, X1 = 50, Y1 = 34;   // (the fence on tile lines X0..X1, Y0..Y1)
function court({ gate = true, extra = {}, mark = 'court', fence = {} } = {}) {
  const m = new CityMap(1, W, H);
  m.tiles.fill(T.GRASS);
  for (let x = 0; x < W; x++) { m.tiles[m.idx(x, 60)] = T.ROAD; m.tiles[m.idx(x, 59)] = T.SIDEWALK; }
  for (let y = Y0; y < Y1; y++) for (let x = X0; x < X1; x++) m.tiles[m.idx(x, y)] = T.LOT;
  const f = (x0, y0, x1, y1) => m.props.push({ t: 'chainfence', x: x0 * TILE, y: y0 * TILE, tx: (x1 - x0) * TILE, ty: (y1 - y0) * TILE, ...fence });
  f(X0, Y0, X1, Y0); f(X0, Y0, X0, Y1); f(X1, Y0, X1, Y1);
  f(X0, Y1, gate ? X1 - 4 : X1, Y1);   // (the builders' court: the gate the last four tiles of the south side)
  m.props.push({ t: mark, x: (X0 + 15) * TILE, y: (Y0 + 2) * TILE, w: 400, d: 600 });
  Object.assign(m, extra.map || {});
  for (const p of extra.props || []) m.props.push(p);
  return m;
}
const BOX = [X0, Y0, X1 - 1, Y1 - 1], SEED = [X0 + 5, Y0 + 5];
const sideOf = ([x, y]) => (y < Y0 ? 'N' : y >= Y1 ? 'S' : x < X0 ? 'W' : 'E');

test('a court with its one gate in the corner gets a way out on another side, near a corner but not in it', () => {
  const m = court();
  assert.equal(waysOut(m, BOX, SEED).ways.length, 1, 'one way in to start with');
  const out = fenceExits3(m);
  assert.equal(out.opened, 1);
  assert.deepEqual(out.byKind, { court: 1 });
  const { ways } = waysOut(m, BOX, SEED);
  assert.ok(ways.length >= 2, `${ways.length} ways out`);
  assert.ok(new Set(ways.map(sideOf)).size >= 2, 'on two sides');
  for (const [x, y, side] of out.places[0].made) {
    const along = side === 'N' || side === 'S' ? x : y, a0 = side === 'N' || side === 'S' ? X0 : Y0, a1 = side === 'N' || side === 'S' ? X1 - 1 : Y1 - 1;
    const fromCorner = Math.min(along - a0, a1 - along);
    assert.ok(fromCorner >= 2 && fromCorner <= EXITS3.corner + 3, `the way out ${fromCorner} tiles from the corner`);
  }
});

test('one shut all round gets two, the first on the side facing the pavement; each two people wide', () => {
  const m = court({ gate: false });
  assert.equal(waysOut(m, BOX, SEED).ways.length, 0);
  const out = fenceExits3(m);
  const { ways } = waysOut(m, BOX, SEED);
  assert.ok(ways.length >= 2 && new Set(ways.map(sideOf)).size >= 2, `${ways.length} ways out`);
  assert.equal(out.places[0].made[0][2], 'S', 'the first faces the pavement to the south');
  // (the gaps in the fence: at least two tiles across)
  const south = fenceSegments(m).filter((s) => s.y0 === Y1 * TILE && s.y1 === Y1 * TILE).sort((a, b) => Math.min(a.x0, a.x1) - Math.min(b.x0, b.x1));
  assert.ok(south.length >= 2, 'the south fence cut');
  for (let i = 1; i < south.length; i++) assert.ok(Math.min(south[i].x0, south[i].x1) - Math.max(south[i - 1].x0, south[i - 1].x1) >= 2 * TILE, 'a gap two tiles wide');
});

test('what keeps people out stays shut: a pool, barbed wire, the prison, a home', () => {
  const cases = {
    pool: court({ extra: { props: [{ t: 'lguard', x: (X0 + 4) * TILE, y: (Y0 + 4) * TILE }] } }),
    airport: court({ fence: { barbed: 1 } }),
    prison: court({ extra: { map: { prison: { compound: { tx: X0 - 2, ty: Y0 - 2, tw: X1 - X0 + 4, th: Y1 - Y0 + 4 } } } } }),
    home: court({ extra: { map: { homes: [{ x: (X0 + 8) * TILE, y: (Y0 + 8) * TILE }] } } }),
    unmarked: court({ mark: 'bench_m' }),
  };
  for (const [k, m] of Object.entries(cases)) {
    const before = waysOut(m, BOX, SEED).ways.length, out = fenceExits3(m);
    assert.equal(out.opened, 0, `${k}: nothing opened`);
    assert.equal(out.cuts.length, 0, `${k}: no fence cut`);
    assert.equal(waysOut(m, BOX, SEED).ways.length, before, `${k}: as it was`);
  }
});
