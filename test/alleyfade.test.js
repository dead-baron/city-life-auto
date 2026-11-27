// The open ground round you is never hidden (client/art2/game/host.js _fades; the owner, 11-25 01:13: "It shows one
// building transparent but you cant see through the other ones", and 01:24: "it would be good to see the entire street
// and sidewalk from anywhere in the street here ... so nobody can hide"). The street, sidewalk or alley you stand on is
// followed out from your tile - FADE_REACH tiles along, FADE_ACROSS up and down, not through a building or a wall -
// and every building whose picture lies over that ground fades. A building faced from its own street keeps its front.
import test from 'node:test';
import assert from 'node:assert/strict';
import { World2, FADE_REACH, FADE_ACROSS } from '../client/art2/game/host.js';
import { TILE, T } from '../shared/constants.js';

// A row of buildings, footprints on rows 21-23 (feet at y 760), their pictures rising to y 560: over the alley behind
// them (row 20, open from column 5 to 70 but for a wall at column 40). Their own street in front: rows 24-27. A second
// street far north (rows 4-6), with nothing over it.
const W = 90, H = 40, tiles = new Uint8Array(W * H).fill(T.BUILDING);
for (let x = 5; x <= 70; x++) { if (x !== 40) tiles[20 * W + x] = T.SIDEWALK; for (let y = 24; y <= 27; y++) tiles[y * W + x] = T.ROAD; for (let y = 4; y <= 6; y++) tiles[y * W + x] = T.ROAD; }
tiles[20 * W + 40] = T.WALL;
const map = { props: [], tiles, inside: (x, y) => x >= 0 && y >= 0 && x < W && y < H, idx: (x, y) => y * W + x };
const bld = (id, c0, c1) => [id, c0 * TILE, 560, (c1 + 1) * TILE, 770, 760];
const blds = [bld(1, 8, 14), bld(2, 16, 22), bld(3, 24, 30), bld(4, 42, 48), bld(5, 62, 68)];
function fades(px, py) {
  const host = { map, S: { pred: null, me: null }, fades: new Map(), _gz: () => 0, _treeCovers: World2.prototype._treeCovers, chunkState: new Map([[0, { blds }]]) };
  for (let i = 0; i < 30; i++) World2.prototype._fades.call(host, { dt: 0.1 }, { x: px, y: py, z: 0 });
  return host.fades;
}

test('in an alley, every building over the alley fades - not only the one over you - as far as the alley is open', () => {
  const f = fades(19 * TILE, 20.5 * TILE);   // (behind B)
  assert.ok(f.get(1) > 0.8 && f.get(2) > 0.8 && f.get(3) > 0.8, 'the one over you and its neighbours along the alley');
  assert.ok(!f.get(4) && !f.get(5), 'past the wall across the alley: kept');
  const g = fades(33.5 * TILE, 20.5 * TILE);   // (in the alley where nothing covers you: the stretch is open all the same)
  assert.ok(g.get(2) > 0.8 && g.get(3) > 0.8, 'the buildings over the alley either side of a gap');
  const e = fades(45 * TILE, 20.5 * TILE);     // (east of the wall)
  assert.ok(e.get(4) > 0.8 && !e.get(3), 'its own side of the wall only');
  assert.ok(!e.get(5) || FADE_REACH >= 17, 'and no further than the reach');
});
test('a building faced from its own street keeps its front; an open street with nothing over it fades nothing', () => {
  assert.equal(fades(19 * TILE, 26.5 * TILE).size, 0, 'on the street in front of the row');
  assert.equal(fades(19 * TILE, 5.5 * TILE).size, 0, 'on a street nothing lies over');
  assert.deepEqual([...fades(19 * TILE, 22.5 * TILE).keys()], [2], 'under a building\'s own picture, off the open ground: that one alone, as before');
  assert.ok(FADE_REACH >= 12 && FADE_REACH <= 28 && FADE_ACROSS >= 4 && FADE_ACROSS <= 12);
});
test('from the street behind a row - the far sidewalk under its roofs - the row fades', () => {
  // (a street on rows 17-20 instead of the one-tile alley: you stand on its north side, the row's roofs lie over its south)
  const t2 = tiles.slice(); for (let x = 5; x <= 70; x++) for (let y = 17; y <= 20; y++) t2[y * W + x] = T.ROAD;
  const host = { map: { ...map, tiles: t2 }, S: { pred: null, me: null }, fades: new Map(), _gz: () => 0, _treeCovers: World2.prototype._treeCovers, chunkState: new Map([[0, { blds }]]) };
  for (let i = 0; i < 30; i++) World2.prototype._fades.call(host, { dt: 0.1 }, { x: 26 * TILE, y: 17.5 * TILE, z: 0 });
  for (const b of [1, 2, 3, 4]) assert.ok(host.fades.get(b) > 0.8, `building ${b} along the street`);
});

// What stands over the street on legs (the owner, 11-25: "It would help if players can see under elevated platforms
// like this railroad bridge, but im sure highways and maybe some other structures ... like we do behind buildings,
// letting the player see a wide range under a bridge like this"). The El's deck pieces and the highway decks carry
// fade ids from EL_FADE (statics.js): on the ground under or beside one, the pieces over your street fade - a wide
// range, as the buildings do; up on the deck or the platform, or riding the train, it stays under you.
test('the El over a street fades along the street when you are under it, and never when you are up on it', async () => {
  const { EL_FADE, DECK_FADE, DECK_SEE } = await import('../client/art2/game/statics.js');
  // (the owner, 11-25 09:03: "The highway/bridge transparency not sure that's right yet, maybe we leave that alone for
  // now" - the rule below stays, the bake gives the El and the decks no fade ids until he says)
  assert.equal(DECK_SEE, false, 'off for now: the El and the highway decks are drawn as they always were');
  // a street on rows 16-23 with the El along it: its deck pieces 4 tiles long, feet at row 22's south edge, pictures up to row 13
  const t3 = new Uint8Array(W * H).fill(T.BUILDING); for (let x = 5; x <= 70; x++) for (let y = 16; y <= 23; y++) t3[y * W + x] = T.ROAD;
  const el = []; for (let c = 8; c < 64; c += 4) el.push([EL_FADE + c / 4, c * TILE, 13 * TILE, (c + 4) * TILE, 23 * TILE + 4, 23 * TILE, c * TILE, 23 * TILE - 2, (c + 4) * TILE, 23 * TILE]);
  const run = (px, py, z, train) => { const host = { map: { ...map, tiles: t3 }, S: { pred: null, me: null }, fades: new Map(), _gz: () => 0, _treeCovers: World2.prototype._treeCovers, chunkState: new Map([[0, { blds: el }]]) }; for (let i = 0; i < 30; i++) World2.prototype._fades.call(host, { dt: 0.1, myTrain: train ? 1 : -1 }, { x: px, y: py, z }); return host.fades; };
  const f = run(30 * TILE, 18.5 * TILE, 0);
  const faded = el.filter((r) => f.get(r[0]) > 0.8).length;
  assert.ok(faded >= 8, `under the El on the street: ${faded} of ${el.length} pieces along it fade (a wide range)`);
  assert.ok(el.every((r) => !(f.get(r[0]) < 0)), 'as a building fades - not the thin ghost of a mast');
  assert.equal(run(30 * TILE, 18.5 * TILE, 1).size, 0, 'up on the deck: it stays');
  assert.equal(run(30 * TILE, 18.5 * TILE, 0, true).size, 0, 'riding the train: it stays');
  assert.ok(EL_FADE >= 1e5 && DECK_FADE > EL_FADE && DECK_FADE + 499999 < 1e6, 'ids between the buildings\' and the trees\'');
});
