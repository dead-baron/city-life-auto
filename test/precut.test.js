// A walk-in's inside ready before you're in it (the owner, 10-16: "Interior art loads slowly on a phone (bowling
// alley, deli): preload or bake it", "Show where the exit is while an interior's art loads (spawning in a hospital)").
// Art v2 draws a walk-in cut away - no roof, the shop floor - only once its chunks are baked that way, seconds on a
// phone after you step in. Now, a few steps from its door (or down, with a hospital to wake up in), its chunks are baked
// cut away into the browser's store ahead (client/art2/game/host.js _precut; never the server's roofed chunks), so
// going in finds them there; and until what's on screen is drawn cut away, the way out shows (insideReady, exitHint).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World2 } from '../client/art2/game/host.js';
import { CHUNK } from '../client/art2/game/chunkgeom.js';
import { TILE } from '../shared/constants.js';

const B = { id: 7, tx: 40, ty: 40, tw: 6, th: 5 };   // a shop round (1280, 1280)
function host() {
  const h = Object.create(World2.prototype), asked = [];
  Object.assign(h, {
    artKey: 'k', noBake: false, q: 2, lowMem: false, map: { seed: 1 }, prov: { ground: true, statics: true },
    E: { ap: 2, has: new Set(), hasChunk(cx, cy) { return this.has.has(`${cx},${cy}`); } },
    pool: { dead: false, ready: true, jobs: new Map(), waiting: () => 0, has(k) { return this.jobs.has(k); }, request(k, op, args, prio, done) { this.jobs.set(k, { op, args, done }); asked.push({ k, op, args }); }, cancelWhere(fn) { for (const k of [...this.jobs.keys()]) if (fn(k)) this.jobs.delete(k); } },
    wantChunks: new Map(), chunkState: new Map(),
  });
  return { h, asked };
}
const chunksOf = (b) => { const x0 = b.tx * TILE - 40, y0 = b.ty * TILE - 360, x1 = (b.tx + b.tw) * TILE + 40, y1 = (b.ty + b.th) * TILE + 40, out = []; for (let cy = Math.floor(y0 / CHUNK); cy <= Math.floor((y1 - 1) / CHUNK); cy++) for (let cx = Math.floor(x0 / CHUNK); cx <= Math.floor((x1 - 1) / CHUNK); cx++) out.push([cx, cy]); return out; };

test('near a walk-in\'s door: its chunks baked cut away into the store ahead, once', () => {
  const { h, asked } = host();
  h._precut({ nearB: B, insideB: null });
  const want = chunksOf(B);
  assert.equal(asked.length, want.length, 'every chunk round it');
  for (const a of asked) {
    assert.equal(a.op, 'prebakeChunk');
    assert.equal(a.args.opt.cutaway, B.id, 'cut away round this shop');
    assert.ok(a.args.ck.endsWith(`|c${B.id}`), 'kept under the cut-away\'s key');
  }
  h._precut({ nearB: B, insideB: null });
  assert.equal(asked.length, want.length, 'not asked again while it\'s on its way');
  for (const [k, j] of h.pool.jobs) { h.pool.jobs.delete(k); j.done({ kept: true }); }
  h._precut({ nearB: B, insideB: null });
  assert.equal(asked.length, want.length, 'nor once it\'s kept');
  // already inside: the bake for the screen does it
  const o = host(); o.h._precut({ nearB: B, insideB: B }); assert.equal(o.asked.length, 0);
  // the screen's own bakes first
  const w = host(); w.h.pool.waiting = () => 1; w.h._precut({ nearB: B, insideB: null }); assert.equal(w.asked.length, 0);
});

test('walking on to the next shop: the last one\'s bakes still queued are let go', () => {
  const { h, asked } = host();
  h._precut({ nearB: B, insideB: null });
  const n = asked.length;
  const B2 = { id: 9, tx: 80, ty: 40, tw: 6, th: 5 };
  h._precut({ nearB: B2, insideB: null });
  assert.ok(asked.length > n, 'the next shop\'s asked for');
  assert.ok([...h.pool.jobs.keys()].every((k) => k.includes(`,${B2.id},`)), 'only its bakes left queued');
  assert.ok([...h.pc.out].every((k) => k.includes(`,${B2.id},`)));
});

test('inside: ready once what\'s on screen of it is drawn cut away - till then, the way out shows', () => {
  const { h } = host();
  const ch = chunksOf(B);
  for (const [cx, cy] of ch) { h.wantChunks.set(cy * 1000 + cx, 1); h.E.has.add(`${cx},${cy}`); h.chunkState.set(cy * 1000 + cx, { mode: -1 }); }
  assert.equal(h.insideReady(B), false, 'the roofed chunks still up');
  for (const [cx, cy] of ch.slice(1)) h.chunkState.set(cy * 1000 + cx, { mode: B.id });
  assert.equal(h.insideReady(B), false, 'one still roofed');
  h.chunkState.set(ch[0][1] * 1000 + ch[0][0], { mode: B.id });
  assert.equal(h.insideReady(B), true, 'all cut away');
  h.wantChunks.delete(ch[0][1] * 1000 + ch[0][0]); h.chunkState.delete(ch[0][1] * 1000 + ch[0][0]);
  assert.equal(h.insideReady(B), true, 'a chunk off the screen doesn\'t count');
  assert.equal(h.insideReady(null), true);
});

test('the walk-in ahead: a door a few steps off on foot, or the hospital you\'ll wake up in; the way out\'s words', async () => {
  const { walkInSoon, exitWords, WALKIN_SOON_PX } = await import('../client/art2/game/host.js');
  const { T } = await import('../shared/constants.js');
  const shop = { id: 3, tx: 10, ty: 10, tw: 6, th: 5, walkIn: { units: [{ door: { tx: 12, ty: 14, w: 2 } }] } };
  const W = 40, tiles = new Uint8Array(W * W).fill(T.SIDEWALK), bld = new Int32Array(W * W).fill(-1);
  for (let y = 10; y < 15; y++) for (let x = 10; x < 16; x++) { tiles[y * W + x] = T.FLOOR; bld[y * W + x] = 3; }
  const m = { buildings: { 3: shop }, walkIns: [3], hospitals: [{ x: 13 * TILE, y: 12 * TILE }], tileAt: (x, y) => tiles[y * W + x], bld, idx: (x, y) => y * W + x, inside: (x, y) => x >= 0 && y >= 0 && x < W && y < W };
  const door = [13 * TILE, 14.5 * TILE];
  const ask = (S, x, y) => { S.wsT = 7; return walkInSoon(S, { x, y }); };   // (looked for every 8th frame: this one)
  const S = { map: m, playing: true, pred: { kind: 'ped' }, me: {} };
  assert.equal(ask(S, door[0], door[1] + WALKIN_SOON_PX - 20), shop, 'on foot, a few steps from its door');
  assert.equal(ask(S, door[0], door[1] + WALKIN_SOON_PX + 60), null, 'further off');
  assert.equal(ask({ ...S, pred: { kind: 'veh' } }, door[0], door[1] + 40), null, 'driving past');
  assert.equal(ask({ map: m, playing: true, me: { dead: true, spawnChoice: 'h:0' } }, 0, 0), shop, 'down: the hospital you\'ll wake up in');
  assert.equal(ask({ map: m, playing: true, me: { dead: true, spawnChoice: 'home:4' } }, 0, 0), null, 'or home');
  assert.match(exitWords(shop, door[0], door[1] - 3 * TILE), /The way out ↓/, 'the door south of you');
  assert.match(exitWords(shop, door[0] - 4 * TILE, door[1]), /The way out →/);
  assert.match(exitWords(shop, door[0], door[1] - 10), /here/);
});
