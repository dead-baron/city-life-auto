// World v3 part 8 items 1 and 4 (docs/WORLD-V3.md 8.12): the page keeps a window of the world - the 3 x 3 regions round
// the player - assembled from the region files (shared/regionpack.js assembleCity with opts.window), and moves it as the
// player crosses a region's border. Today's city cut into 256-tile regions (6 x 5, so a 3 x 3 window is a part of it)
// stands in for the v3 world here: the same code, a quick build. Built once for the file.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateCity, cityFromData, CityMap } from '../shared/map.js';
import { packRegions, assembleCity, readIndex, regionsNear, windowRect, regionRect, REGIONAL, OMIT } from '../shared/regionpack.js';
import { windowOf } from '../shared/mapwindow.js';
import { MAP_W, MAP_H, TILE } from '../shared/constants.js';
import { WindowKeeper } from '../client/worldwindow.js';

let city = null, packs = new Map();
const CITY = () => (city ||= generateCity(1337));
const PACK = (R) => { if (!packs.has(R)) packs.set(R, packRegions(CITY(), { frame: [MAP_W, MAP_H], region: R })); return packs.get(R); };
const filesOf = (pack, keys) => keys.map((k) => pack.regions.find((r) => r.key === k).bytes);
const field = (o, f) => { for (const k of f.split('.')) { if (o === null || typeof o !== 'object') return undefined; o = o[k]; } return o; };

function windowAt(pack, tx, ty) {
  const frame = readIndex(pack.index).frame, keys = regionsNear(frame, tx, ty), rect = windowRect(frame, keys);
  return { keys, rect, map: cityFromData(assembleCity(pack.index, filesOf(pack, keys), { window: rect })) };
}

test("a window of the world: the 3 x 3 regions' tiles, every query as the whole map's inside it, the lists holding only its items at their world-wide indices", () => {
  const m = CITY(), pack = PACK(256);
  const frame = readIndex(pack.index).frame;
  assert.deepEqual(frame.slice(0, 5), [MAP_W, MAP_H, 256, 6, 5]);
  const { keys, rect, map: w } = windowAt(pack, 700, 600);   // (region 2, 2: the window is regions 1-3 x 1-3)
  assert.equal(keys.length, 9);
  assert.deepEqual(rect, [256, 256, 768, 768]);
  assert.ok(w instanceof CityMap);
  assert.deepEqual([w.x0, w.y0, w.w, w.h], rect);
  assert.deepEqual(w.frame, { w: MAP_W, h: MAP_H }, "the world's frame");
  // the per-tile layers: windowOf's cut of the whole map, to the byte
  const ref = windowOf(m, ...rect);
  for (const k of Object.keys(ref)) {
    if (!ArrayBuffer.isView(ref[k]) || OMIT.includes(k) || ref[k].length !== rect[2] * rect[3]) continue;
    assert.ok(ArrayBuffer.isView(w[k]), `layer ${k}`);
    assert.equal(Buffer.compare(Buffer.from(ref[k].buffer, ref[k].byteOffset, ref[k].byteLength), Buffer.from(w[k].buffer, w[k].byteOffset, w[k].byteLength)), 0, `layer ${k}`);
  }
  for (let i = 0; i < 4000; i++) {
    const tx = rect[0] + ((i * 7919) % rect[2]), ty = rect[1] + ((i * 104729) % rect[3]);
    assert.equal(w.tileAt(tx, ty), m.tileAt(tx, ty));
    assert.equal(w.zoneAt(tx, ty), m.zoneAt(tx, ty));
  }
  // the regional lists: the window's items (by where they are) at their world-wide indices, holes elsewhere
  const inRect = (tx, ty) => tx >= rect[0] && ty >= rect[1] && tx < rect[0] + rect[2] && ty < rect[1] + rect[3];
  for (const f of ['props', 'pois', 'buildings', 'lamps', 'parking', 'blocks']) {
    const all = field(m, f), part = field(w, f);
    assert.equal(part.length, all.length, `${f}: the world's count`);
    let n = 0;
    for (let i = 0; i < all.length; i++) {
      const it = all[i], [tx, ty] = REGIONAL[f] === 'px' ? [Math.floor(it.x / TILE), Math.floor(it.y / TILE)] : [it.tx ?? it.x, it.ty ?? it.y];
      if (inRect(tx, ty)) { assert.ok(i in part, `${f}[${i}] is in the window`); assert.deepEqual(JSON.stringify(part[i]), JSON.stringify(it)); n++; } else assert.ok(!(i in part), `${f}[${i}] is not`);
    }
    assert.ok(n > 0 && n < all.length, `${f}: some, not all (${n} of ${all.length})`);
  }
  // solidProps keyed by the window's tiles, propSolid its props' entries
  let k = 0;
  for (const [i, arr] of w.solidProps) {
    const tx = w.x0 + (i % w.w), ty = w.y0 + Math.floor(i / w.w);
    assert.deepEqual(JSON.stringify(arr), JSON.stringify(m.solidProps.get(m.idx(tx, ty))), `solid props at ${tx}, ${ty}`);
    for (const e of arr) if (e.pi >= 0) { assert.equal(w.propSolid.get(e.pi), e); assert.ok(e.pi in w.props); }
    k++;
  }
  assert.ok(k > 0);
  // the index's lists stay whole (the road graph the GPS reads, the homes)
  assert.equal(w.edges.length, m.edges.length); assert.equal(w.nodes.length, m.nodes.length); assert.equal(w.homes.length, m.homes.length);
  // a hole-safe reader: the window's own POIs answer poiAt
  for (const p of w.pois) if (p) { assert.ok(inRect(Math.floor(p.x / TILE), Math.floor(p.y / TILE))); }
});

test("today's world at its own regions (3 x 3): the window round any tile is the whole map, as assembled whole", () => {
  const m = CITY(), pack = PACK(undefined);
  const frame = readIndex(pack.index).frame;
  for (const [tx, ty] of [[10, 10], [656, 600], [1300, 1190]]) {
    const keys = regionsNear(frame, tx, ty);
    assert.equal(keys.length, 9, 'a corner too: the window is shifted in');
    const rect = windowRect(frame, keys);
    assert.deepEqual(rect, [0, 0, MAP_W, MAP_H]);
    const w = assembleCity(pack.index, filesOf(pack, keys), { window: rect }), whole = assembleCity(pack.index, filesOf(pack, keys));
    for (const f of Object.keys(whole)) {
      if (ArrayBuffer.isView(whole[f])) assert.equal(Buffer.compare(Buffer.from(whole[f].buffer), Buffer.from(w[f].buffer)), 0, f);
      else if (Array.isArray(whole[f])) { assert.equal(w[f].length, whole[f].length, f); for (let i = 0; i < whole[f].length; i += 97) assert.deepEqual(JSON.stringify(w[f][i]), JSON.stringify(whole[f][i]), `${f}[${i}]`); }
    }
    assert.equal(w.solidProps.size, m.solidProps.size); assert.equal(w.propSolid.size, m.propSolid.size);
  }
  assert.deepEqual(regionsNear(frame, 656, 600).length, 9);
});

test('the window moves: near a border it fetches what comes in, past it the new window (the shared regions kept), and back', async () => {
  const pack = PACK(256), frame = readIndex(pack.index).frame;
  const asked = [];
  const keeper = new WindowKeeper({ frame, near: 48, past: 8, fetchRegion: async (k) => { asked.push(k); return pack.regions.find((r) => r.key === k).bytes; } });
  await keeper.start(700, 600);
  assert.deepEqual(keeper.rect, [256, 256, 768, 768]);
  assert.equal(asked.length, 9);
  // in the middle of the centre region: nothing to do
  assert.equal(keeper.want(640, 640), null);
  // near the east border (x 768): the regions east come early, nothing moves yet
  asked.length = 0;
  assert.equal(keeper.want(768 - 20, 640), null);
  await keeper.idle();
  assert.deepEqual(asked.sort(), ['r4-1', 'r4-2', 'r4-3']);
  // just past it (inside the hysteresis): still the old window
  assert.equal(keeper.want(768 + 4, 640), null);
  // past it: the new window, from what was fetched (no new downloads)
  asked.length = 0;
  const next = keeper.want(768 + 20, 640);
  assert.deepEqual([next.keys, next.rect], [regionsNear(frame, 768 + 20, 640), [512, 256, 768, 768]]);
  const data = await keeper.assemble(pack.index, next);
  assert.equal(asked.length, 0, 'every region came early');
  const w = cityFromData(data);
  assert.deepEqual([w.x0, w.y0, w.w, w.h], [512, 256, 768, 768]);
  assert.equal(w.tileAt(1000, 500), CITY().tileAt(1000, 500));
  keeper.moved(next);
  assert.equal(keeper.want(768 + 20, 640), null, 'settled');
  // and back west: just over the border, nothing yet; past it, the old window again
  assert.equal(keeper.want(768 - 4, 640), null);
  await keeper.idle();
  const back = keeper.want(768 - 20, 640);
  assert.deepEqual(back.rect, [256, 256, 768, 768]);
  // a teleport far off: the new window at once (at the frame's corner shifted in: still 3 x 3 regions)
  const far = keeper.want(100, 1100);
  assert.deepEqual(far.rect, [0, 512, 768, MAP_H - 512]);
  assert.deepEqual(far.rect, windowRect(frame, regionsNear(frame, 100, 1100)));
  const d2 = await keeper.assemble(pack.index, far);
  assert.equal(cityFromData(d2).tileAt(100, 1100), CITY().tileAt(100, 1100));
});
