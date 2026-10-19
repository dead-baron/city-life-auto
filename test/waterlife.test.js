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
