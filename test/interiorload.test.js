// Walking into a building on a phone (the owner, 11-06, a Pixel 7 Pro): "This interior for a nightclub is not loading
// after quite some time. Seems like interiors take a long time to load in general", and in portrait "the message for
// loading art flips between two messages and it just pops in and out over and over".
//  - the clubs fitted out as NE9 / IN15 (shared/shoprooms.js FIT.club, client/art2/shopart.js): the DJ booth in the bar,
//    the lit dance floor, the booths, the VIP corner - and the dancers kept to the lit floor (nightclubs.js);
//  - the inside of the walk-in you're entering baked first (client/art2/game/host.js entryPrio, precutPrio);
//  - one loading screen: its phase and its bar only go forward (client/warmup.js loadStep).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TILE } from '../shared/constants.js';
import { shopRoom, clubFloor } from '../shared/shoprooms.js';
import { drawShop } from '../client/art2/shopart.js';
import { loadTracker, loadStep, artPhase, LOAD_PHASES, PHASE, warmPlan, WARM_CAP_MS } from '../client/warmup.js';
import { World2, entryPrio, precutPrio, cutBoxOf } from '../client/art2/game/host.js';

// a made-up club: w tiles wide, d rows deep, its door at the given share of the front (as test/shoprooms.test.js room())
function club(w, d, doorAt = 0.5, name = 'The Violet Room') {
  const tx = 40, ty = 30, x0 = tx + 1, x1 = x0 + w - 1, y0 = ty + 1, y1 = y0 + d - 1, counterRow = y0 + Math.max(1, Math.min(3, Math.floor(d * 0.3)));
  const dc = Math.max(x0 + 1, Math.min(x1, Math.round(x0 + (w - 1) * doorAt)));
  const u = { poi: 0, kind: 'club', x0, x1, counterRow, door: { tx: dc - 1, ty: y1 + 1, w: 2 } };
  const b = { id: w * 7 + d, tx, ty, tw: w + 2, th: d + 2, name, walkIn: { south: true, units: [u], x0, x1, y0, y1 } };
  return { b, u };
}
// what the art draws of a fit-out: every pixel, and those standing off the floor (the furniture: z over 2)
function drawn(R, b, u) {
  const ox = b.tx * TILE, oy = b.ty * TILE, cu = { x0: u.x0 * TILE - ox, x1: (u.x1 + 1) * TILE - ox, fx0: u.x0 * TILE - ox, fx1: (u.x1 + 1) * TILE - ox, cy: u.counterRow * TILE - oy };
  let all = 0, up = 0, lit = 0;
  drawShop(R, cu, { inY0: (b.walkIn.y0 - b.ty) * TILE, inY1: (b.walkIn.y1 - b.ty + 1) * TILE, H: 110 }, (x, Y, z, c, n, f, e) => { all++; if (z > 2) up++; if (e) lit++; }, ox, oy);
  return { all, up, lit };
}

test('a club is a nightclub: the DJ booth in the bar, the lit floor, booths down the side, the VIP corner in a big room', () => {
  // (The Violet Room: 20 x 12, its door on the left; Club Nova 16 x 6; Afterdark 12 x 12; the little ones 7 x 8, 7 x 4)
  for (const [w, d, at] of [[20, 12, 0.1], [20, 12, 0.9], [24, 14, 0.5], [18, 12, 0.5], [16, 12, 0.3], [16, 6, 0.5], [14, 12, 0.5], [12, 12, 0.5], [10, 12, 0.3], [7, 8, 0.5], [7, 4, 0.5]]) {
    const { b, u } = club(w, d, at), R = shopRoom(b, u, TILE, null), nm = `${w}x${d} door ${at}`;
    assert.equal(R.plan, 'club', nm);
    const has = (t) => R.pieces.filter((p) => p.t === t).length, wall = (t) => R.onWall.some((q) => q.t === t);
    assert.ok(has('dance') === 1, `${nm}: the dance floor`);
    assert.ok(has('stool') >= 2, `${nm}: stools along the bar`);
    assert.ok(wall('bottles') && wall('tube') && wall('sign'), `${nm}: the bottles, the neon, the club's word on the back wall`);
    assert.equal(R.counter.k, 'club');
    if (w >= 8) { assert.ok(R.counter.dj && R.counter.dj[1] - R.counter.dj[0] >= 40, `${nm}: the DJ booth in the bar`); assert.ok(wall('ledwall') && wall('speaker'), `${nm}: the screen and the speakers behind the decks`); }
    if (w >= 10 && d >= 6) assert.ok(has('velvet') >= 2 && has('tableset') >= 2, `${nm}: booths and candlelit tables (${has('velvet')}, ${has('tableset')})`);
    if (w >= 16 && d >= 7) {
      assert.ok(has('vip') === 1 && has('rope') === 1 && R.onWall.some((q) => q.t === 'sign' && q.text === 'VIP'), `${nm}: the VIP corner, its rope and its sign`);
      const v = R.pieces.find((p) => p.t === 'vip'), F = R.pieces.find((p) => p.t === 'dance');
      assert.ok(Math.abs((v.x0 + v.x1) / 2 - R.dc) > Math.abs((F.x0 + F.x1) / 2 - R.dc) - 1, `${nm}: the VIP corner away from the door`);
      assert.ok(has('disco') === 1 && has('speaker') >= 1, `${nm}: the mirror ball, the speakers`);
    }
    // nothing stands on the dance floor, in the door's way or along the bar
    const F = R.pieces.find((p) => p.t === 'dance');
    for (const p of R.pieces) {
      if (p.flat || p.t === 'stool') continue;
      if (p.t !== 'speaker') assert.ok(!(p.x0 < F.x1 && p.x1 > F.x0 && p.y0 < F.y1 && p.y1 > F.y0), `${nm}: a ${p.t} on the dance floor`);
      assert.ok(!(p.x0 < R.dx + R.dw + 8 && p.x1 > R.dx - 8 && p.y1 > R.Ya), `${nm}: a ${p.t} in the door's way`);
    }
    // the dancers' floor (server/systems/nightclubs.js) is the lit floor
    const CF = clubFloor(R.X0, R.X1, R.Ya, R.Yb, TILE, R.dc);
    assert.deepEqual([CF.x0, CF.y0, CF.x1, CF.y1], [F.x0, F.y0, F.x1, F.y1], `${nm}: one floor for the art and the dancers`);
    // drawn: furniture standing off the floor, and lit
    const D = drawn(R, b, u);
    assert.ok(D.up > (w >= 12 ? 9000 : 2500), `${nm}: furniture drawn (${D.up} px off the floor)`);
    assert.ok(D.lit > 2000, `${nm}: lit (${D.lit} px)`);
  }
});

test('the dancers keep to the lit floor', async () => {
  const { makeWorld } = await import('./helpers.js');
  const nightclubs = await import('../server/systems/nightclubs.js');
  const w = makeWorld();
  let n = 0;
  for (const c of nightclubs.clubs(w)) {
    const b = c.b, u = c.u, wi = b.walkIn;
    if (!wi.south) continue;
    const F = clubFloor(u.x0 * TILE, (u.x1 + 1) * TILE, (u.counterRow + 1) * TILE, (wi.y1 + 1) * TILE, TILE, (u.door.tx + u.door.w / 2) * TILE);
    if (F.x1 - F.x0 < 64) continue;
    n++;
    assert.ok(c.floor.x0 >= F.x0 && c.floor.x1 <= F.x1 && c.floor.y0 >= F.y0 && c.floor.y1 <= F.y1, `club #${b.id}: the dancers' floor ${JSON.stringify(c.floor)} on the lit one ${JSON.stringify(F)}`);
  }
  assert.ok(n >= 3, `clubs checked (${n})`);
});

test('walking in: the inside you stand in bakes before anything else, then the rest on screen, then the building', () => {
  const ring = 900, road = 2600, peek = 200 - 1e6;
  const under = entryPrio(true, true, 400), screen = entryPrio(false, true, 300), rest = entryPrio(false, false, 1200);
  assert.ok(under < screen && screen < rest, 'under you, then on screen, then the rest of it');
  for (const other of [0, ring, road, peek, 40000, 50000]) assert.ok(rest < other, `ahead of everything else (${other})`);
  // about to walk in: after the screen's own (0 - ~800), before the ring round it
  assert.ok(precutPrio(0) > 800 && precutPrio(2) < 1200 && precutPrio(0) < precutPrio(1));
  // _chunks inside a walk-in: what it asks the pool for, and in what order
  const asked = [];
  const E = { hasChunk: () => true, hasFallback: () => true, setChunkFallback() {}, reserveChunks() {}, keepChunk() {}, chunkCap: () => 26, chunkKeys: () => [], uploadChunk: () => true, ap: 2 };
  const w = Object.create(World2.prototype);
  Object.assign(w, {
    E, pool: { ready: true, dead: false, has: () => false, cancelWhere() {}, request(jk, op, a, prio) { asked.push({ jk, prio, cx: a.cx, cy: a.cy, cut: a.opt && a.opt.cutaway }); } }, S: { cam: { tz: 1 } }, map: { seed: 1 }, grid: [55, 50], q: 1,
    tier: { results: 8, chunkUp: 4, chunks: 20, upMs: 4 }, W: 412, H: 892, prov: { ground: true, statics: true }, artKey: null, lowMem: false, noBake: false, failed: false,
    results: new Map(), wantJobs: new Set(), wantChunks: new Map(), chunkState: new Map(), ver: new Map(), chunkFails: new Map(), fallbacks: new Set(), phs: new Map(),
    n: { fbSet: 0, chunkUp: 0 }, t: {}, est: { chunk: 3, spr: 0.3, ped: 4 },
  });
  w._camVel = () => ({ x: 0, y: 0 }); w._placeholder = () => ({}); w._openSea = () => false; w._offSea = () => 0;
  // a building two chunks wide (768 px chunks), you inside it in chunk 8,8; everything round drawn already, roofed
  const b = { id: 77, tx: 8 * 24 + 12, ty: 8 * 24 + 4, tw: 30, th: 16, walkIn: { south: true, units: [], x0: 0, x1: 0, y0: 0, y1: 0 } };
  const sp = { x: (8 * 24 + 18) * TILE, y: (8 * 24 + 14) * TILE };
  w.camX = sp.x; w.camY = sp.y; w.vx0 = sp.x - 271; w.vx1 = sp.x + 271; w.vy0 = sp.y - 587; w.vy1 = sp.y + 587;
  for (let cy = 5; cy <= 11; cy++) for (let cx = 5; cx <= 11; cx++) w.chunkState.set(cy * 1000 + cx, { mode: -1, ver: 0 });
  w._chunks({ z: 0.76, now: 0, dt: 0.016, insideB: b, sp });
  const cuts = asked.filter((q) => q.cut === 77), others = asked.filter((q) => q.cut !== 77);
  assert.ok(cuts.length >= 2, `the walk-in's chunks asked for cut away (${cuts.length})`);
  const first = cuts.reduce((a, q) => (q.prio < a.prio ? q : a));
  assert.deepEqual([first.cx, first.cy], [8, 8], 'the chunk under you first');
  for (const q of others) for (const c of cuts) assert.ok(c.prio < q.prio, `${c.jk} before ${q.jk}`);
  assert.equal(w.entering, true, 'entering: uploads not held to the frame budget');
  // only the chunks its sprites are in: The Violet Room (22 x 41 tiles, a chunk's width from its edges) is one column of
  // chunks, not three
  const [x0, , x1] = cutBoxOf({ tx: 3169, ty: 2150, tw: 22, th: 41 });
  assert.deepEqual([Math.floor(x0 / 768), Math.floor((x1 - 1) / 768)], [132, 132]);
});

test('one loading screen: one message per phase, in order, never back; a bar that only moves forward and covers every phase', () => {
  assert.deepEqual(LOAD_PHASES.map((p) => p.id), ['connect', 'city', 'gfx', 'streets', 'around']);
  for (let i = 1; i < LOAD_PHASES.length; i++) assert.equal(LOAD_PHASES[i].k0, LOAD_PHASES[i - 1].k1, 'the phases cover the bar end to end');
  assert.equal(LOAD_PHASES[0].k0, 0);
  for (const p of LOAD_PHASES) assert.ok(p.msg.length <= 26, `"${p.msg}": one line on a phone held upright`);
  // a noisy load: the title's city phases, then the art's wait read from a warmth() that flaps every frame (the sprites a
  // frame behind, a chunk on screen let go and baked again, the ring coming and going) - as the owner's phone had it
  const T = loadTracker(), msgs = [], ks = [];
  const see = () => { if (msgs[msgs.length - 1] !== T.msg) msgs.push(T.msg); ks.push(T.k); };
  for (let t = 0; t < 30; t++) { loadStep(T, { phase: t < 5 ? PHASE.connect : PHASE.city, sub: (t % 5) / 5 }); see(); }
  loadStep(T, { phase: PHASE.connect, sub: 0.9 }); see();   // (a reconnect's "Connecting..." mid-load: the record stays)
  const cap = WARM_CAP_MS.phone;
  let rnd = 7;
  const r = () => { rnd = (rnd * 1103515245 + 12345) & 0x7fffffff; return rnd / 0x7fffffff; };
  loadStep(T, { phase: PHASE.gfx, sub: 0 }); see();
  loadStep(T, artPhase(null, warmPlan(null, 10, cap))); see();
  for (let f = 0; f < 600; f++) {
    const need = 12, have = Math.min(need, Math.floor(f / 30) + (r() < 0.3 ? -1 : 0)), scr = 4, scrHave = Math.min(scr, Math.max(0, have - 3 + (r() < 0.2 ? -1 : 0)));
    const wm = { ok: f > 20, need, have: Math.max(0, have), scr, scrHave, ring: 10, ringHave: Math.min(10, Math.max(0, f - 360) >> 4), miss: r() < 0.5 ? 1 : 0, spr: 0 };
    const p = warmPlan(wm, f * 16, cap);
    loadStep(T, artPhase(wm, p)); see();
    if (p.done) break;
  }
  if (!T.done) { loadStep(T, artPhase(null, { done: true })); see(); }
  for (let i = 1; i < ks.length; i++) assert.ok(ks[i] >= ks[i - 1], `the bar went back at step ${i} (${ks[i - 1]} -> ${ks[i]})`);
  assert.equal(ks[ks.length - 1], 1, 'full at the end');
  assert.deepEqual(msgs, LOAD_PHASES.map((p) => p.msg), 'each message once, in order: no flapping between two');
  assert.equal(T.done, true);
  // done is done: nothing moves it after
  loadStep(T, { phase: PHASE.connect, sub: 0 });
  assert.equal(T.k, 1);
});

test('the teleport veil: up at once for a jump, down once - no flapping between a jump and the next frame\'s', async () => {
  const { veilStep, VEIL_HOLD, VEIL_CALM } = await import('../client/warmup.js');
  const V = { on: false };
  const run = (wants, t0 = 0, dt = 16) => { const out = []; wants.forEach((w, i) => out.push(veilStep(V, w, t0 + i * dt))); return out; };
  // a teleport: wanted for a while, then drawn - a frame of "drawn" between two of "not" (a chunk let go and taken back)
  const a = run([true, true, true, false, true, true, ...Array(40).fill(false)]);
  assert.equal(a[0], true, 'up at once');
  let flips = 0; for (let i = 1; i < a.length; i++) if (a[i] !== a[i - 1]) flips++;
  assert.equal(flips, 1, 'down once');
  // a second jump a moment after it went down (the window swapped under the teleport): not up again for a frame or two
  const down = 46 * 16, b = run([true, true, false, ...Array(30).fill(false)], down + 100);
  assert.ok(b.every((x) => !x), 'a blip right after: no pop');
  // ...but one that really isn't drawn shows after VEIL_HOLD
  const c = run(Array(40).fill(true), down + 1000);
  assert.ok(!c[0] && c[c.length - 1], 'held back, then up');
  assert.ok(c.findIndex((x) => x) * 16 >= VEIL_HOLD - 16);
  // a fresh teleport long after: at once
  for (let i = 0; i < 40; i++) veilStep(V, false, 5000 + i * 16);
  assert.equal(veilStep(V, true, 5000 + VEIL_CALM + 1000), true);
});

test('a page\'s window onto the world (its lists with holes): every walk-in still fitted out and cut away', async () => {
  // (the owner's 11-06 report, The Violet Room "only a floor and a few people": the page's map is a window of World v3,
  // its POI list holding only the window's places at their world-wide indexes - shopRoom's look for an ATM threw on the
  // first hole, and staticItems with it: the chunk baked as bare ground, no building, no prop, no wall)
  const { makeWorld } = await import('./helpers.js');
  const { staticItems, makeStatic } = await import('../client/art2/game/statics.js');
  const m = makeWorld().map;
  const clubs = m.buildings.filter((b) => b && b.walkIn && b.walkIn.south && b.walkIn.units.some((u) => u.kind === 'club'));
  assert.ok(clubs.length >= 2, `clubs in the city (${clubs.length})`);
  const b = clubs.reduce((a, q) => (q.tw > a.tw ? q : a)), bi = m.buildings.indexOf(b);
  // the window: the POIs of a few blocks round the club kept at their indexes, the rest holes
  const near = (p) => p && Math.abs(p.x - (b.tx + b.tw / 2) * TILE) < 1500 && Math.abs(p.y - (b.ty + b.th / 2) * TILE) < 1500;
  const pois = new Array(m.pois.length);
  m.pois.forEach((p, i) => { if (near(p)) pois[i] = p; });
  assert.ok(pois.includes(undefined) || pois.length > Object.keys(pois).length, 'holes');
  for (const u of b.walkIn.units) { const R = shopRoom(b, u, TILE, { ...m, pois }); assert.ok(R && R.plan === 'club', 'fitted out in a window'); }
  const W = Object.create(m, { pois: { value: pois } });
  const cx = Math.floor((b.tx + b.tw / 2) * TILE / 768), cy = Math.floor((b.walkIn.y1 * TILE) / 768);
  const items = staticItems(W, cx, cy, { cutaway: bi });
  const cut = items.find((it) => it.b === bi && it.recipe && it.recipe.t === 'cut');
  assert.ok(cut, 'its cut-away in the chunk');
  assert.ok(cut.recipe.units.some((u) => u.shop && u.shop.R.pieces.some((p) => p.t === 'dance')), 'fitted out as a club');
  assert.ok(items.filter((it) => it.recipe && it.recipe.t === 'b').length >= 1, 'the rest of the chunk\'s buildings still there');
  const G = makeStatic(cut.recipe);
  assert.ok(G && G.w > 0);
});
