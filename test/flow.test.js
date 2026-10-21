// The rivers' current (shared/flow.js): a swimmer drifts downstream, fastest mid-channel, faster down a rapid - where
// you can't swim up against it - and not at all in a calm pocket, a lake or the sea; a boat with someone at the helm
// drifts too, one tied up never; the wild things that live in the water hold their own (mods.still).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { T, TILE } from '../shared/constants.js';
import { CityMap } from '../shared/mapcore.js';
import { flowAt, FLOW } from '../shared/flow.js';
import { pedStep, vehStep } from '../shared/physics.js';
import { VEHICLES } from '../shared/vehicles.js';

const W = 240, H = 100;
// a river running east along the middle (20 tiles wide), a rapid on it, a calm pocket below, a lake at the east end
function riverMap() {
  const m = new CityMap(1, W, H);
  m.land = new Uint8Array(W * H); m.lake = m.lake || new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (Math.abs(y - 50) <= 10 && x >= 5 && x < 235) { m.tiles[i] = T.WATER; m.river[i] = 1; if (x >= 200) m.lake[i] = 1; } else { m.tiles[i] = T.GRASS; m.land[i] = 1; }
  }
  m.waters = { ch: [{ k: 'river', w: 20, v: 0.5, pts: [[5, 50], [60, 50], [120, 50], [200, 50]], r: [[80, 110, 1]], p: [[150, 56, 3, 0]] }], lk: [] };
  return m;
}
const swimmer = (x, y) => ({ x, y, a: 0, vx: 0, vy: 0, stamina: 100, rollT: 0, rdx: 0, rdy: 0, prevBits: 0, lz: 0 });
const MODS = { speedMul: 1, canMove: true, canSprint: false, canSwim: true, analog: true };
const DT = 0.05;

test('the current: downstream along the channel, fastest in the middle, a rapid faster, still in a pocket, a lake and on land', () => {
  const m = riverMap();
  const at = (tx, ty) => { const f = flowAt(m, (tx + 0.5) * TILE, (ty + 0.5) * TILE); return f ? [f[0], f[1]] : null; };
  const mid = at(40, 50), bank = at(40, 59), rap = at(95, 50), pocket = at(150, 56), lake = at(215, 50), land = at(40, 70);
  assert.ok(mid && mid[0] > 20 && Math.abs(mid[1]) < 1, `downstream in the middle (${mid})`);
  assert.ok(bank && bank[0] > 0 && bank[0] < mid[0] * 0.6, `slower by the bank (${bank})`);
  assert.ok(rap && rap[0] > mid[0] * 1.8, `a rapid runs faster (${rap})`);
  assert.equal(pocket, null, 'a calm pocket is still');
  assert.equal(lake, null, 'the lake is still');
  assert.equal(land, null, 'none on land');
  assert.ok(Math.abs(mid[0] - FLOW.river * 0.75) < 0.2, `a river at half its steepness: ${FLOW.river * 0.75} px/s (${mid[0]})`);
});

test('a swimmer drifts downstream, and can\'t swim up a rapid; the wild things hold their own; a boat at the helm drifts, one tied up doesn\'t', () => {
  const m = riverMap();
  // treading water mid-river: carried downstream
  const s = swimmer(40 * TILE, 50.5 * TILE);
  for (let i = 0; i < 5 / DT; i++) pedStep(s, { bits: 0, mx: 0, my: 0, aim: 0 }, DT, m, MODS);
  assert.ok(s.x - 40 * TILE > 100, `carried downstream (${Math.round(s.x - 40 * TILE)} px in 5 s)`);
  // swimming hard upstream in the rapid: swept back all the same
  const r = swimmer(100 * TILE, 50.5 * TILE);
  for (let i = 0; i < 4 / DT; i++) pedStep(r, { bits: 0, mx: -1, my: 0, aim: Math.PI }, DT, m, MODS);
  assert.ok(r.x > 100 * TILE - 40, `no headway up the rapid (${Math.round(r.x - 100 * TILE)} px)`);
  // upstream on the slow reach: you make way, if slowly
  const u = swimmer(40 * TILE, 50.5 * TILE);
  for (let i = 0; i < 4 / DT; i++) pedStep(u, { bits: 0, mx: -1, my: 0, aim: Math.PI }, DT, m, MODS);
  assert.ok(u.x < 40 * TILE - 40, `headway against the slow water (${Math.round(u.x - 40 * TILE)} px)`);
  // a duck holds its place
  const d = swimmer(40 * TILE, 50.5 * TILE);
  for (let i = 0; i < 5 / DT; i++) pedStep(d, { bits: 0, mx: 0, my: 0, aim: 0 }, DT, m, { ...MODS, still: true });
  assert.ok(Math.abs(d.x - 40 * TILE) < 2, 'the wild swimmer holds its own');
  // a boat: drifting with no throttle when someone's at the helm, still when tied up (no driver)
  const def = VEHICLES.rowboat, boat = (drv) => ({ x: 40 * TILE, y: 50.5 * TILE, a: -Math.PI / 2, vx: 0, vy: 0, av: 0 });
  const env = { rain: false }, b1 = boat(), b2 = boat();
  for (let i = 0; i < 5 / DT; i++) { vehStep(b1, { throttle: 0, steer: 0, hb: false, slide: false, drv: true }, DT, m, def, env); vehStep(b2, { throttle: 0, steer: 0, hb: false, slide: false }, DT, m, def, env); }
  assert.ok(b1.x - 40 * TILE > 100, `the boat at the helm drifts (${Math.round(b1.x - 40 * TILE)} px)`);
  assert.ok(Math.abs(b2.x - 40 * TILE) < 2, `one tied up stays (${Math.round(b2.x - 40 * TILE)} px)`);
});
