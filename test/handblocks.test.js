// Hand-designed blocks (shared/handblocks.js): the painted neighbourhood around Broadway in
// Midtown / Downtown - art fitted to every block, buildings and doors where the painting has
// them, and the shops that moved out of it still in the game.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateCity } from '../shared/map.js';
import { T, TILE, MAP_W } from '../shared/constants.js';
import { HAND_BLOCKS } from '../shared/handblocks.js';
import { BLOCK_ART } from '../shared/block-data.js';

const m = generateCity(1337);
const inArea = (h, tx, ty) => tx >= h.area[0] && ty >= h.area[1] && tx < h.area[0] + h.area[2] && ty < h.area[1] + h.area[3];

test('every hand-designed block has its painting, fitted to the block', () => {
  for (const h of HAND_BLOCKS) {
    const art = BLOCK_ART[h.key];
    assert.ok(art, `${h.key} has art (run tools/build_blocks.py)`);
    assert.equal(art.tw, h.area[2], `${h.key} width`);
    assert.equal(art.th, h.area[3], `${h.key} height`);
    assert.ok(m.handArt.some((a) => a.key === h.key), `${h.key} is laid on the ground`);
  }
});

test('painted buildings stand where the painting has them, with a door onto the pavement', () => {
  for (const h of HAND_BLOCKS) for (const spec of h.buildings || []) {
    const b = m.buildings.find((q) => q.hand === h.key && q.tx === h.area[0] + spec.r[0] && q.ty === h.area[1] + spec.r[1]);
    assert.ok(b, `${h.key}: ${spec.name || 'building'}`);
    assert.ok(inArea(h, b.tx, b.ty) && inArea(h, b.tx + b.tw - 1, b.ty + b.th - 1), `${spec.name} inside its block`);
    const dt = m.tiles[b.door.ty * MAP_W + b.door.tx];
    assert.ok([T.PLAZA, T.SIDEWALK, T.LOT].includes(dt), `${spec.name}'s door opens onto pavement (${dt})`);
    if (spec.biz) assert.ok(m.pois.some((p) => p.b === b.id && p.kind === spec.biz && p.label === b.name), `${spec.name} is a ${spec.biz}`);
  }
});

test('the shops the paintings replaced are still in the city (gun shop, dealership, the marina by the water)', () => {
  for (const kind of ['gunshop', 'dealer', 'marina']) assert.equal(m.pois.filter((p) => p.kind === kind).length, 1, `exactly one ${kind}`);
  for (const kind of ['garage', 'coffee', 'grocery', 'pharmacy', 'police', 'hospital']) assert.ok(m.pois.some((p) => p.kind === kind && m.buildings[p.b] && m.buildings[p.b].hand), `a painted ${kind}`);
  const marina = m.pois.find((p) => p.kind === 'marina');
  assert.ok(m.distSea[Math.floor(marina.y / TILE) * MAP_W + Math.floor(marina.x / TILE)] < 30 * 4, 'the marina is near the sea');
  assert.ok(m.pois.some((p) => p.label === 'City General' && p.kind === 'hospital'));
  assert.ok(m.pois.some((p) => p.label === 'The Daily Fork' && m.buildings[p.b].hand === 'dt_dailyfork'), 'The Daily Fork took the junkyard block');
});

test('nothing generated stands on a painted block; its lamps light up; its subway entrances are clear', () => {
  for (const p of m.props) {
    const h = HAND_BLOCKS[m.handMask[Math.floor(p.y / TILE) * MAP_W + Math.floor(p.x / TILE)] - 1];
    if (!h) continue;
    assert.ok(['sigpole', 'plamp', 'painted'].includes(p.t), `${p.t} on ${h.key}`);
  }
  assert.ok(m.lamps.filter((l) => l.t === 'plamp').length > 10, 'painted lamps are lights');
  for (const pl of m.subwayPlazas) for (let y = pl.y; y < pl.y + pl.h; y++) for (let x = pl.x; x < pl.x + pl.w; x++) assert.notEqual(m.tiles[y * MAP_W + x], T.BUILDING, `${pl.name} entrance clear`);
  const pool = m.motorPools.find((p) => p.painted);
  assert.ok(pool && pool.spots.length >= 5, 'the HQ motor pool is the painted lot out front');
});
