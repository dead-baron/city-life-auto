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

test("the city worker's window (client/worldgen.js fetchWindow): the index and only the window's regions downloaded, gzipped, then assembled", async () => {
  const { gzipSync } = await import('node:zlib');
  const { fetchWindow } = await import('../client/worldgen.js');
  const pack = PACK(256), files = new Map([['index.bin', pack.index], ...pack.regions.map((r) => [`${r.key}.bin`, r.bytes])]);
  const asked = [];
  const fetchFn = async (url) => {
    const name = url.split('/').pop().split('?')[0];
    asked.push(name);
    const b = files.get(name);
    return b ? new Response(gzipSync(b), { status: 200 }) : new Response('', { status: 404 });
  };
  const w = await fetchWindow('http://cdn/world/', 'abcdef123456-v3:1337', 1337, [700, 600], { fetchFn });
  assert.deepEqual(w.win.rect, [256, 256, 768, 768]);
  assert.equal(asked.length, 10, 'the index and 9 regions, not 30');
  const m = cityFromData(w.data);
  assert.deepEqual([m.x0, m.y0, m.w, m.h], [256, 256, 768, 768]);
  assert.equal(m.tileAt(700, 600), CITY().tileAt(700, 600));
  // the keeper it hands on moves the window from the files it fetched
  asked.length = 0;
  assert.equal(w.keeper.want(768 - 20, 640), null);
  await w.keeper.idle();
  const next = w.keeper.want(768 + 20, 640);
  const d = await w.keeper.assemble(w.index, next);
  assert.deepEqual([d.x0, d.y0, d.w, d.h], [512, 256, 768, 768]);
  assert.deepEqual(asked.sort(), ['r4-1.bin', 'r4-2.bin', 'r4-3.bin']);
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

// ---- (H39, WORLD-V3.md 8.12's follow-ups) the signatures, the places, the kept regions ----
import { regionSig, regionMatches } from '../shared/regionpack.js';
import { mapSignature } from '../shared/mapcore.js';

test("the index carries each region's signature and the world's: every file matches its own, the world's is the map's", () => {
  const pack = PACK(256), X = readIndex(pack.index);
  assert.equal(X.sig, mapSignature(CITY()), "the world's signature: what the server's welcome says");
  assert.deepEqual(Object.keys(X.sigs).sort(), X.regions.slice().sort());
  for (const r of pack.regions) { assert.equal(regionSig(r.bytes), X.sigs[r.key], r.key); assert.ok(regionMatches(X.sigs, r.key, r.bytes)); }
  assert.equal(new Set(Object.values(X.sigs)).size, X.regions.length, 'no two regions alike');
  const bad = pack.regions[7].bytes.slice(); bad[bad.length >> 1] ^= 1;
  assert.ok(!regionMatches(X.sigs, pack.regions[7].key, bad), 'one bit off: refused');
  assert.ok(!regionMatches(X.sigs, pack.regions[6].key, pack.regions[7].bytes), "another region's file: refused");
  assert.ok(regionMatches(null, 'r0-0', bad), 'an index without signatures (an older server): nothing to check');
});

test('a corrupted region is refused: dropped (here and in the store) and fetched again past every cache; refused again, the window is not assembled', async () => {
  const pack = PACK(256), X = readIndex(pack.index), good = new Map(pack.regions.map((r) => [r.key, r.bytes]));
  const corrupt = (b) => { const c = b.slice(); c[c.length - 9] ^= 0x55; return c; };
  const asked = [], forgot = [];
  let badTimes = 1;
  const keeper = new WindowKeeper({ frame: X.frame, sigs: X.sigs, forget: (k) => forgot.push(k),
    fetchRegion: async (k, fresh) => { asked.push([k, !!fresh]); return k === 'r2-2' && badTimes-- > 0 ? corrupt(good.get(k)) : good.get(k); } });
  const win = await keeper.start(700, 600);
  const w = cityFromData(await keeper.assemble(pack.index, win));
  assert.deepEqual(keeper.refused, ['r2-2']); assert.deepEqual(forgot, ['r2-2']);
  assert.deepEqual(asked.filter(([k]) => k === 'r2-2'), [['r2-2', false], ['r2-2', true]], 'fetched again, fresh');
  assert.equal(w.tileAt(600, 600), CITY().tileAt(600, 600));
  // the server keeps sending a bad one: no window, and the error says which region
  badTimes = 99;
  const k2 = new WindowKeeper({ frame: X.frame, sigs: X.sigs, fetchRegion: async (k) => (k === 'r1-1' ? corrupt(good.get(k)) : good.get(k)) });
  const w2 = await k2.start(700, 600);
  await assert.rejects(k2.assemble(pack.index, w2), /r1-1 isn't the server's/);
  // a file that doesn't even open (the worker's unzip throws): the same
  const k3 = new WindowKeeper({ frame: X.frame, sigs: X.sigs, fetchRegion: async (k) => good.get(k), open: async (b) => { if (b === good.get('r3-3')) throw new Error('bad gzip'); return b; } });
  await assert.rejects(k3.assemble(pack.index, await k3.start(700, 600)), /r3-3 isn't the server's \(a bad file\)/);
});

test("the whole world's places in a window: every POI (id, kind, label, position, district), those outside the window too", () => {
  const m = CITY(), pack = PACK(256);
  const { rect, map: w } = windowAt(pack, 700, 600);
  assert.ok(Array.isArray(w.places));
  const all = m.pois.filter(Boolean);
  assert.equal(w.places.filter(Boolean).length, all.length);
  let outside = 0;
  for (const p of all) {
    const q = w.places[p.id];
    assert.deepEqual([q.id, q.kind, q.label, q.x, q.y], [p.id, p.kind, p.label, p.x, p.y]);
    assert.equal(q.d, m.dist[m.idx(Math.floor(p.x / TILE), Math.floor(p.y / TILE))], `${p.label}'s district`);
    if (p.home !== undefined) assert.equal(q.home, p.home);
    const tx = Math.floor(p.x / TILE), ty = Math.floor(p.y / TILE);
    if (tx < rect[0] || ty < rect[1] || tx >= rect[0] + rect[2] || ty >= rect[1] + rect[3]) { outside++; assert.equal(w.pois[p.id], undefined, 'not in the window'); }
  }
  assert.ok(outside > 20, `${outside} places outside the window`);
  // today's world assembled whole: as before (no places list, no picture: the POIs are all there)
  const whole = assembleCity(pack.index, pack.regions.map((r) => r.bytes));
  assert.ok(!('places' in whole) && !('picture' in whole));
  assert.equal(readIndex(PACK(256).index).frame[0] * readIndex(PACK(256).index).frame[1] > 4e6, false, "today's frame: no coarse picture");
});

test("the regions kept in the browser: a return visit's window comes from the store, only what wasn't kept is downloaded; a kept file that isn't right is fetched again", async () => {
  const { gzipSync } = await import('node:zlib');
  const { fetchWindow } = await import('../client/worldgen.js');
  const pack = PACK(256), files = new Map([['index.bin', pack.index], ...pack.regions.map((r) => [`${r.key}.bin`, r.bytes])]);
  const kept = new Map(), store = { get: async (n) => kept.get(n) || null, put: async (n, b) => { kept.set(n, b); return true; }, drop: async (n) => kept.delete(n) };
  let asked = [];
  const fetchFn = async (url, o) => { const name = url.split('/').pop().split('?')[0]; asked.push([name, (o && o.cache) || '']); const b = files.get(name); return b ? new Response(gzipSync(b), { status: 200 }) : new Response('', { status: 404 }); };
  const first = await fetchWindow('http://cdn/world/', 'abcdef123456-v3:1337', 1337, [700, 600], { fetchFn, store });
  assert.deepEqual([first.win.kept, first.win.fetched], [0, 10]);
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(kept.size, 10, 'the index and the 9 regions kept (gzipped, as they came)');
  assert.equal(first.win.sig, mapSignature(CITY()));
  // the return visit: nothing downloaded
  asked = [];
  const again = await fetchWindow('http://cdn/world/', 'abcdef123456-v3:1337', 1337, [700, 600], { fetchFn, store });
  assert.deepEqual([again.win.kept, again.win.fetched, asked.length], [10, 0, 0]);
  const a = cityFromData(first.data), b = cityFromData(again.data);
  assert.equal(Buffer.compare(Buffer.from(a.tiles.buffer), Buffer.from(b.tiles.buffer)), 0);
  // a move east: the 3 regions not kept are downloaded (and kept), the rest read back
  asked = [];
  again.keeper.want(768 - 20, 640); await again.keeper.idle();
  assert.deepEqual(asked.map(([n]) => n).sort(), ['r4-1.bin', 'r4-2.bin', 'r4-3.bin']);
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(kept.size, 13);
  // a kept region spoiled: dropped and downloaded again, past the HTTP cache
  const z = kept.get('r2-2.bin').slice(); z[z.length - 12] ^= 0xff; kept.set('r2-2.bin', z);
  asked = [];
  const third = await fetchWindow('http://cdn/world/', 'abcdef123456-v3:1337', 1337, [700, 600], { fetchFn, store });
  assert.deepEqual(asked, [['r2-2.bin', 'reload']]);
  assert.deepEqual(third.keeper.refused, ['r2-2']);
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(Buffer.compare(Buffer.from(kept.get('r2-2.bin')), gzipSync(files.get('r2-2.bin'))), 0, 'the good one kept in its place');
  // a kept index that doesn't read: downloaded again
  kept.set('index.bin', new Uint8Array([1, 2, 3])); asked = [];
  const fourth = await fetchWindow('http://cdn/world/', 'abcdef123456-v3:1337', 1337, [700, 600], { fetchFn, store });
  assert.deepEqual(asked, [['index.bin', 'reload']]);
  assert.equal(fourth.win.fetched, 1);
});

test("the districts' middles in a window: every district of the world (the big map's names), not the window's", () => {
  const m = CITY(), pack = PACK(256);
  const { map: w } = windowAt(pack, 700, 600);
  const acc = new Map();
  for (let ty = 0; ty < m.h; ty += 3) for (let tx = 0; tx < m.w; tx += 3) { const d = m.dist[m.idx(tx, ty)]; if (d === 13) continue; const a = acc.get(d) || acc.set(d, [0, 0, 0]).get(d); a[0] += tx; a[1] += ty; a[2]++; }
  assert.equal(w.mids.length, acc.size);
  for (const [d, x, y, here] of w.mids) {
    const [sx, sy, n] = acc.get(d);
    assert.ok(Math.abs(x - sx / n) < 1e-9 && Math.abs(y - sy / n) < 1e-9, `district ${d}`);
    assert.equal(here, m.dist[m.idx(Math.round(sx / n), Math.round(sy / n))] === d ? 1 : 0);
  }
  const inWindow = new Set(); for (let ty = w.y0; ty < w.y0 + w.h; ty += 3) for (let tx = w.x0; tx < w.x0 + w.w; tx += 3) inWindow.add(w.dist[w.idx(tx, ty)]);
  assert.ok(w.mids.some(([d]) => !inWindow.has(d)), 'districts outside the window named too');
});
