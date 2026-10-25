// The life in the water (client/art2/game/waterlife.js, 2026-10-18): fish in view of the water, of its kind and staying
// in it - placed by the patch, so the same water has the same fish - darting off from a swimmer, one coming to a bobber
// and thrashing on the line; a duck's wake; spray and foam at the falls; the sprites drawn as decals on the water. The simulation and
// its drawing run here without the renderer (a stand-in engine takes the draws).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateCity } from '../shared/map.js';
import { T, TILE } from '../shared/constants.js';
import { WaterLife } from '../client/art2/game/waterlife.js';

const M = generateCity(1337);
const wetT = (t) => t === T.WATER || t === T.DEEP || t === T.BRIDGE;
const tileOf = (x, y) => { const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE); return M.inside(tx, ty) ? M.tiles[M.idx(tx, ty)] : -1; };
const cls = (x, y) => {
  const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
  if (!M.inside(tx, ty) || !wetT(M.tiles[M.idx(tx, ty)])) return 0;
  const i = M.idx(tx, ty);
  return M.lake[i] ? (M.lake[i] === 2 ? 3 : 2) : M.river[i] ? 4 : 1;
};
const view = (x, y, hw = 640, hh = 360) => ({ x0: x - hw, y0: y - hh, x1: x + hw, y1: y + hh });
const ENV = { day: 1, sx: 0.6, sy: 0.8, dusk: 0, wet: 0, wx: 0.8, wy: 0.6, ws: 0.3 };
function sim(wl, V, secs, movers = [], lines = [], t0 = 0) {
  let now = t0;
  for (let i = 0; i < secs * 30; i++) { wl.update(M, V, now, 1 / 30, movers, lines, ENV); now += 1 / 30; }
  return now;
}
// a view over water of a kind: the first patch the simulation's own reckoning calls that
function waterView(kind, step = 3) {
  const probe = new WaterLife(2);
  probe.reset(M);
  for (let ty = M.y0 + 20; ty < M.y0 + M.h - 20; ty += step) for (let tx = M.x0 + 20; tx < M.x0 + M.w - 20; tx += step) {
    const x = tx * TILE, y = ty * TILE, c = probe._cell(M, Math.floor(x / (6 * TILE)), Math.floor(y / (6 * TILE)));
    if (c && c.k === kind) return { x: c.x, y: c.y, c };
  }
  return null;
}

test('fish in view of the water: of its kind, in it and staying in it; the same water, the same fish', () => {
  for (const kind of ['lake', 'shore', 'river']) {
    const at = waterView(kind);
    assert.ok(at, `some ${kind} water on the map`);
    const V = view(at.x, at.y), wl = new WaterLife(2);
    sim(wl, V, 20);
    const fish = wl.fish.filter((f) => !f.taker);
    assert.ok(fish.length > 0, `fish in the ${kind} (${wl.n.groups} groups)`);
    assert.ok(fish.length <= 72, 'no more than the tier allows');
    for (const f of fish) {
      assert.ok(cls(f.x, f.y) === f.c, `a ${f.s} in its own water (${Math.round(f.x)}, ${Math.round(f.y)}: tile ${tileOf(f.x, f.y)})`);
      assert.ok(Number.isFinite(f.a) && Number.isFinite(f.v), 'its heading and speed');
    }
    // the same water has the same fish: another run places the same groups, species and counts
    const wl2 = new WaterLife(2);
    sim(wl2, V, 1);
    const key = (w) => [...w.groups.values()].map((g) => `${g.key}:${g.sp}:${g.fish.length}`).sort().join(' ');
    assert.equal(key(wl2), key(wl), `${kind}: placed by the patch`);
  }
});

test('a swimmer coming through sends the fish darting off; a bobber draws one in, and it thrashes on the line; a duck leaves a wake', () => {
  const at = waterView('lake') || waterView('shore');
  const V = view(at.x, at.y), wl = new WaterLife(2);
  let now = sim(wl, V, 10);
  const f = wl.fish.find((q) => !q.taker && !q.S.jelly);
  assert.ok(f, 'a fish');
  const sw = { x: f.x + 30, y: f.y, sp: 60, wet: true }, d0 = Math.hypot(f.x - sw.x, f.y - sw.y);
  for (let i = 0; i < 9; i++) { wl.update(M, V, now, 1 / 30, [sw], [], ENV); now += 1 / 30; }
  assert.ok(f.st === 1 || now < f.hide, 'it darted');
  assert.ok(Math.hypot(f.x - sw.x, f.y - sw.y) > d0, 'away from the swimmer');
  // a bobber out on the water, the bite coming nearer
  const bx = at.x, by = at.y, line = { key: 'me', x: bx, y: by, st: 0, nib: false, prog: 0 };
  wl.update(M, V, now, 1 / 30, [], [line], ENV);
  const t = wl.takers.get('me');
  assert.ok(t, 'a fish comes to the bobber');
  const start = Math.hypot(t.f.x - bx, t.f.y - by);
  for (let i = 0; i < 300; i++) { line.prog = Math.min(1, i / 240); wl.update(M, V, now, 1 / 30, [], [line], ENV); now += 1 / 30; }
  const close = Math.hypot(t.f.x - bx, t.f.y - by);
  assert.ok(close < Math.max(20, start * 0.6), `it draws in (${start.toFixed(0)} -> ${close.toFixed(0)} px)`);
  line.st = 2;
  for (let i = 0; i < 60; i++) { wl.update(M, V, now, 1 / 30, [], [line], ENV); now += 1 / 30; }
  assert.ok(Math.hypot(t.f.x - bx, t.f.y - by) < 12, 'on the line: at the bobber, thrashing');
  wl.update(M, V, now, 1 / 30, [], [], ENV);
  assert.ok(!wl.takers.has('me') && !wl.fish.includes(t.f), 'landed: gone from the water');
  // a duck paddling across leaves its small V: wake points along its way, two streaks from each
  const duck = { id: 7, x: at.x - 60, y: at.y, sp: 30, wet: true, a: 0, hw: 2.5 };
  for (let i = 0; i < 45; i++) { duck.x += 1; wl.update(M, V, now, 1 / 30, [duck], [], ENV); now += 1 / 30; }
  let pts = 0;
  for (let j = 0; j < wl.wakes.length; j += 6) if (wl.wakes[j + 4] && now - wl.wakes[j + 3] < 2) { pts++; assert.ok(wl.wakes[j] < duck.x, 'behind it'); }
  assert.ok(pts >= 10 && pts <= 16, `wake points as it goes (${pts})`);
  const streaks = [];
  wl.draw({ drawDecal: (k) => { if (k === 'wlw') streaks.push(k); return true; }, drawSprite: () => true }, (k) => k);
  assert.ok(streaks.length >= 2 * (pts - 2), `two streaks a point (${streaks.length})`);
});

test('spray rises and foam spreads at the falls; everything is drawn as small decals (and a leap as a sprite)', () => {
  const site = (M.natureSites || []).find((s) => s.falls && Number.isFinite(s.falls.x));
  assert.ok(site, 'a waterfall on the map');
  const V = view(site.falls.x, site.falls.y + 100), wl = new WaterLife(2);
  sim(wl, V, 6);
  const on = wl.puffs.filter((p) => p.on);
  assert.ok(on.filter((p) => !p.foam).length > 5, `spray (${on.length} puffs)`);
  assert.ok(on.some((p) => p.foam && wetT(tileOf(p.x, p.y + 4))), 'foam on the pool');
  // drawn: decals on the water and in front of the falls, each sprite small and drawn the first time it's asked for
  const made = new Map(), decals = [], sprites = [];
  const E = { drawDecal: (k, x, y, a, al, z0) => { decals.push([k, x, y, a, al, z0]); return true; }, drawSprite: (k, x, y, z0) => { sprites.push([k, x, y, z0]); return true; } };
  const conv = (k, make) => { if (!made.has(k)) made.set(k, make()); return k; };
  wl.draw(E, conv);
  assert.ok(decals.length > 5, `drawn (${decals.length} decals)`);
  for (const [k, , , , al] of decals) assert.ok(made.has(k) && al >= 0 && al <= 1, `a decal's sprite and alpha (${k}: ${al})`);
  // every species' sprite, a leap's too: art pixels, small, something drawn in it
  const at = waterView('shore'), wl2 = new WaterLife(3);
  sim(wl2, view(at.x, at.y), 3);
  for (const f of wl2.fish.slice(0, 3)) { f.air = wl2.now; f.airT = 0.5; f.airV = 50; }
  wl2.draw(E, conv);
  assert.ok(sprites.length > 0, 'a leaping fish: a sprite up over the water');
  for (const [k, G] of made) {
    assert.equal(G.ap, 2, `${k}: in art pixels`);
    assert.ok(G.w <= 32 && G.h <= 32, `${k}: small (${G.w} x ${G.h})`);
    let n = 0;
    for (let i = 0; i < G.w * G.h; i++) if (G.col[i * 4 + 3] >= 128) n++;
    assert.ok(n > 0, `${k}: something drawn`);
  }
});

// Nature-A1: fish you can see in every natural water
test('salmon hold in the white water under a falls and leap at it; bluegill and bass under a dock; a tidepool has its sculpin and crab', () => {
  // the falls: the salmon facing up into it, leaping up the white water and falling back into the pool
  const fa = waterView('falls', 2);
  assert.ok(fa, 'a falls with a pool');
  const wl = new WaterLife(2), V = view(fa.x, fa.y);
  let leaps = 0, upAt = 0;
  const seen = new Set();
  for (let now = 0, i = 0; i < 40 * 30; i++, now += 1 / 30) {
    wl.update(M, V, now, 1 / 30, [], [], ENV);
    for (const f of wl.fish) if (f.s === 'salmon' && f.air >= 0 && f.airBack && !seen.has(f)) { seen.add(f); leaps++; } else if (f.air < 0) seen.delete(f);
    if (i === 30 * 20) upAt = wl.fish.filter((f) => f.s === 'salmon' && f.air < 0 && f.v < 2 && Math.abs(Math.sin(f.a) + 1) < 0.35).length;
  }
  const salmon = wl.fish.filter((f) => f.s === 'salmon');
  assert.ok(salmon.length >= 2, `salmon at the falls (${salmon.length})`);
  assert.ok(upAt >= 1, 'holding facing up into the falls');
  assert.ok(leaps >= 2, `leaping at it (${leaps})`);
  for (const f of salmon) assert.ok(cls(f.x, f.y) === f.c, 'and back in the pool');
  // the dock: a shoal of bluegill (and a bass or two) round it
  const dk = waterView('dock', 2);
  assert.ok(dk, 'a dock out over a lake');
  const wd = new WaterLife(2);
  sim(wd, view(dk.x, dk.y), 15);
  const under = wd.fish.filter((f) => f.g && f.g.c.k === 'dock');
  assert.ok(under.some((f) => f.s === 'bluegill'), 'bluegill under the dock');
  for (const f of under) assert.ok(Math.hypot(f.x - dk.x, f.y - dk.y) < 260, 'keeping round it');
  // a tidepool: its little fish and its crab, never out of it
  const tp = waterView('tidepool', 1);
  assert.ok(tp, 'a tidepool');
  const wt = new WaterLife(2);
  sim(wt, view(tp.x, tp.y), 25);
  const life = wt.fish.filter((f) => f.g && f.g.c.k === 'tidepool');
  assert.ok(life.length >= 1 && life.every((f) => f.s === 'sculpin' || f.s === 'crab'), `the pool's life (${life.map((f) => f.s)})`);
  for (const f of life) { assert.equal(cls(f.x, f.y), 1, `the ${f.s} in the pool's water`); assert.ok(Math.hypot(f.x - tp.x, f.y - tp.y) < 80, `the ${f.s} in its pool`); }
});

// notes 2: "I'd like to see them eventually make it up the waterfall and make it to the next pool as if they're really
// travelling upstream" - some of the salmon's leaps carry them up the face and into the water above, and on upstream
test('salmon at a falls: some make it up the face into the water above it, and swim on upstream', () => {
  const fa = waterView('falls', 2);
  const wl = new WaterLife(2), V = view(fa.x, fa.y);
  let climbing = 0, moved = 0;
  const track = new Map();
  for (let now = 0, i = 0; i < 150 * 30; i++, now += 1 / 30) {
    wl.update(M, V, now, 1 / 30, [], [], ENV);
    for (const f of wl.fish) {
      if (f.s !== 'salmon') continue;
      if (f.air >= 0 && f.climb) { climbing++; assert.ok(f.az >= 0, 'up the face in front of the falls'); }
      if (f.mig) { const t = track.get(f); if (!t) track.set(f, { y: f.y }); else if (t.y - f.y > 20 && !t.done) { t.done = true; moved++; } } else track.delete(f);
    }
  }
  assert.ok(wl.n.up >= 1 && climbing > 0, `some made it over (${wl.n.up})`);
  for (const u of wl.ups) {
    const q = wl.falls.reduce((b, o) => (!b || Math.abs(o.x - u.x) + Math.abs(o.y - u.y) < Math.abs(b.x - u.x) + Math.abs(b.y - u.y) ? o : b), null);
    assert.ok(u.y < q.y - q.h, 'landing above the falls');
    assert.ok(cls(u.x, u.y) > 0 && cls(u.x, u.y) === u.c, 'in the water up there');
  }
  assert.ok(moved >= 1, `and on upstream (${moved})`);
});

test("the renderer's glue: who's about from the frame, the bobbers from the fishing view, a step and a frame drawn", () => {
  const at = waterView('lake') || waterView('shore');
  const made = new Map(), decals = [];
  const h = {
    map: M, q: 1, vx0: at.x - 640, vy0: at.y - 360, vx1: at.x + 640, vy1: at.y + 360,
    E: { drawDecal: (k) => { decals.push(k); return true; }, drawSprite: () => true },
    _conv: (k, make) => { if (!made.has(k)) made.set(k, make()); return k; },
    S: { loopClock: 5, myPedId: 1, me: { fishing: { x: at.x + 20, y: at.y } }, fish: { lines: new Map([[2, { x: at.x - 20, y: at.y, at: 1, on: 0 }]]), F: { ph: 2, t: 3 }, P: { bite: 6, seed: 9 }, land: null }, fx: { splash: () => {} } },
  };
  const wl = new WaterLife(1), swimmer = { id: 3, rx: at.x + 200, ry: at.y, ra: 0, flags: 0, swim: true, d: { ar: 'pet:duck' } };
  for (let i = 0; i < 90; i++) {
    swimmer.rx += 1;
    wl.frame(h, { now: i / 30, peds: [swimmer], vehs: [], sky: { night: 0, minutes: 700, sunDir: { x: -0.5, y: -0.8 } } });
  }
  assert.ok(wl.takers.has('me') && wl.takers.has('o2'), 'a fish at your bobber and at the other angler\'s');
  assert.ok(wl.mv.length === 1 && wl.mv[0].wet && wl.mv[0].hw === 2.5 && wl.mv[0].sp > 20, 'the duck: in the water, moving, a small wake');
  assert.ok(decals.includes('wlw'), "its wake drawn");
  assert.ok(wl.envB.sx > 0 && wl.envB.sy > 0, 'shadows fall away from the sun');
  assert.ok(wl.fish.length > 0 && decals.length > 0, 'fish drawn');
});

test('a hole in the map\'s props (World v3\'s map has them) never stops the fish or the falls\' mist', () => {
  const at = waterView('lake') || waterView('shore');
  const M2 = Object.assign(Object.create(Object.getPrototypeOf(M)), M, { props: [undefined, ...M.props, null] });
  const V = view(at.x, at.y), wl = new WaterLife(2);
  let now = 0;
  for (let i = 0; i < 5 * 30; i++) { wl.update(M2, V, now, 1 / 30, [], [], ENV); now += 1 / 30; }
  assert.ok(wl.fish.length > 0, `fish (${wl.fish.length})`);
});

// (the owner's notes, 2026-10-23) "Water under helicopter has a weird effect happening even when you're high up": an
// aircraft up high is nothing to the water (the fish fled anything over them); a helicopter low over it blows it about -
// rings and spray blown outward from under the rotor, more the lower it is
test('a helicopter\'s downwash: nothing to the water up high, rings and spray under it low down, the lower the more', async () => {
  const { washK, WASH_H } = await import('../client/art2/game/waterlife.js');
  assert.equal(washK(WASH_H), 0); assert.equal(washK(600), 0); assert.equal(washK(0), 1);
  assert.ok(washK(30) > washK(90) && washK(90) > 0, 'stronger the lower');
  const at = waterView('lake') || waterView('shore');
  const h = { map: M, q: 1, vx0: at.x - 640, vy0: at.y - 360, vx1: at.x + 640, vy1: at.y + 360, E: { drawDecal: () => true, drawSprite: () => true }, _conv: (k) => k, S: { fx: { splash: () => {} } } };
  const near = (wl) => {
    let rings = 0, spray = 0;
    for (let j = 0; j < wl.rings.length; j += 5) if (wl.rings[j + 4] && Math.hypot(wl.rings[j] - at.x, wl.rings[j + 1] - at.y) < 160) rings++;
    for (const p of wl.puffs) if (p.on && Math.hypot(p.x - at.x, p.y - at.y) < 260 && Math.hypot(p.vx, p.vy) > 20) spray++;
    return { rings, spray };
  };
  const fly = (alt) => {
    const wl = new WaterLife(1), heli = { id: 9, rx: at.x, ry: at.y, ra: 0, flags: 0, d: { m: 60 }, extra: 0, _alt: alt, _spin: 1 };
    let most = { rings: 0, spray: 0 };
    for (let i = 0; i < 60; i++) { wl.frame(h, { now: i / 30, peds: [], vehs: [heli], sky: { night: 0, minutes: 700, sunDir: { x: 0.3, y: 0.7 } } }); const n = near(wl); most = { rings: Math.max(most.rings, n.rings), spray: Math.max(most.spray, n.spray) }; }
    return { wl, most };
  };
  const high = fly(400);
  assert.equal(high.wl.mv.length, 0, 'up high it is no one the fish notice');
  assert.equal(high.most.rings + high.most.spray, 0, 'and nothing on the water under it');
  const low = fly(20), mid = fly(110);
  assert.ok(low.wl.mv.length === 1 && low.wl.mv[0].wet, 'low down its wash scatters the fish');
  assert.ok(low.most.rings >= 3 && low.most.spray >= 6, `low: rings and spray (${JSON.stringify(low.most)})`);
  assert.ok(low.most.rings + low.most.spray > mid.most.rings + mid.most.spray, `more the lower (${JSON.stringify(low.most)} vs ${JSON.stringify(mid.most)})`);
});

// "Blood in water is a static image": blood landing on open water is a cloud in it (render/fx.js), not a stain on the
// surface - it blooms out, drifts with the current and thins out (waterlife.js blood)
test('blood in the water: a cloud that blooms, drifts with the current and thins out', async () => {
  const { FX } = await import('../client/render/fx.js');
  const { flowAt } = await import('../shared/flow.js');
  // a stretch of river running east (tiles 0..400 x 0..40, its channel along y 20) and dry land south of it
  const W = 400, H = 40, R = { x0: 0, y0: 0, w: W, h: H, inside: (tx, ty) => tx >= 0 && ty >= 0 && tx < W && ty < H, idx: (tx, ty) => ty * W + tx, tiles: new Uint8Array(W * H).fill(T.WATER), lake: new Uint8Array(W * H), river: new Uint8Array(W * H).fill(1), waters: { ch: [{ k: 'river', w: 30, v: 1, pts: [[0, 20], [W, 20]] }] }, props: [] };
  const river = { x: 60 * TILE, y: 20 * TILE };
  assert.ok(flowAt(R, river.x, river.y)[0] > 15, 'its current');
  const fx = new FX();
  fx.water = (x, y) => R.inside(Math.floor(x / TILE), Math.floor(y / TILE));
  const d0 = fx.d.filter((d) => d.on).length;
  fx.blood(river.x, river.y, 0, 14, 0);
  fx.decal(1, river.x, river.y + 40, 0, 6, '#7a0d12', 0);
  assert.equal(fx.d.filter((d) => d.on).length, d0, 'no stain left on the water');
  const B = fx.bc.filter((o) => o && o.on);
  assert.ok(B.length >= 2, 'clouds in the water');
  fx.decal(1, river.x, (H + 5) * TILE, 0, 6, '#7a0d12', 0);
  assert.equal(fx.d.filter((d) => d.on).length, d0 + 1, 'blood on the ground: a stain as ever');
  const wl = new WaterLife(1);
  wl.env = { ...ENV, ws: 0 };
  const c = B[0], x0 = c.x, y0 = c.y, f0 = flowAt(R, x0, y0).slice();
  const spread = [];
  for (let i = 0; i <= 30 * 20; i++) {
    const draws = [];
    wl.blood(R, fx.bc, i / 30, 1 / 30, { drawDecal: (k, x, y, a, al) => { draws.push([x, y, al]); return true; } }, (k) => k);
    if (i % 30 === 0 && c.on) { let r = 0; for (const [x, y] of draws.slice(0, 8)) r = Math.max(r, Math.hypot(x - c.x, y - c.y)); spread.push([i / 30, r, draws.length ? draws[0][2] : 0]); }
  }
  const moved = Math.hypot(c.x - x0, c.y - y0);
  assert.ok(spread.length >= 5, 'drawn a while');
  assert.ok(spread[3][1] > spread[0][1], `it blooms out (${spread.map((s) => s[1].toFixed(0))})`);
  assert.ok(spread[spread.length - 1][2] < spread[1][2], 'and thins out');
  assert.ok(!fx.bc.some((o) => o && o.on), 'gone in the end');
  assert.ok(moved > 30, `carried by the current (${moved.toFixed(0)} px)`);
  assert.ok(((c.x - x0) * f0[0] + (c.y - y0) * f0[1]) > 0, 'downstream');
});
