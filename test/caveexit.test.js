// The way out of a cave (the owner, 2026-11-06: "Cave interior art looks unfinished. Also we want to have the exit of the
// cave look like an exit so it's clear how to get back out."):
//   - every way out of every cave has its dressing (shared/caverns.js lightCave K.exits: its opening and the way out of
//     it, a lantern either side on the floor just inside, lit) and its daylight (client/underground/view.js: the light
//     cut out of the dark up the passage and out past the mouth; caveart.js: the ground outside and the glare painted
//     past it, the WAY OUT board baked with the cave's things);
//   - the cave's tiles are painted at the game's art pixel and drawn up with no smoothing, at whole device pixels, and
//     the dark is laid over them the same way (crisp, never blurred);
//   - the way out is offered all along its passage, from just in from where you come in out to the mouth.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer, teleport } from './helpers.js';
import { undergroundOf, mouthsOf, cellAtPx, lightAt, UG, C } from '../shared/underground.js';
import { EXIT } from '../shared/caverns.js';
import { TILE } from '../shared/constants.js';
import * as players from '../server/systems/players.js';
import * as ug from '../server/systems/underground.js';

// a canvas that records what's drawn on it: drawImage with the smoothing at the time, the ImageData put on it, the
// colours filled (everything else a no-op)
function fakeCanvas(log) {
  const cv = { width: 0, height: 0, img: null };
  const st = { imageSmoothingEnabled: true, fillStyle: '#000' };
  const ctx = new Proxy(st, {
    get(t, k) {
      if (k === 'canvas') return cv;
      if (k === 'drawImage') return (src, ...a) => log.push({ op: 'draw', src, a, smooth: t.imageSmoothingEnabled, cv });
      if (k === 'putImageData') return (img) => { cv.img = img; };
      if (k === 'fillRect') return () => log.push({ op: 'fill', c: t.fillStyle, cv });
      if (k === 'createRadialGradient' || k === 'createLinearGradient') return () => ({ addColorStop() {} });
      if (k in t) return t[k];
      return () => {};
    },
    set(t, k, v) { t[k] = v; return true; },
  });
  cv.getContext = () => ctx;
  return cv;
}
function stubDom(log) {
  globalThis.document = { createElement: () => fakeCanvas(log) };
  globalThis.ImageData = class { constructor(w, h) { this.width = w; this.height = h; this.data = new Uint8ClampedArray(w * h * 4); } };
}

test('every way out of every cave: its opening, the lanterns either side lit, the daylight up the passage and past the mouth', async () => {
  const w = makeWorld();
  const L = undergroundOf(w.map);
  assert.ok(L.caves.length >= 1);
  stubDom([]);
  const { createUgView, mouthLevel } = await import('../client/underground/view.js');
  const V = createUgView({ map: w.map }, {}), spots = V.mouthSpots();
  for (const K of L.caves) {
    const ms = mouthsOf(K);
    assert.equal(K.exits.length, ms.length, `${K.name}: an exit for every mouth`);
    for (const [i, E] of K.exits.entries()) {
      const M = ms[i], dx = M.x - M.inside.x, dy = M.y - M.inside.y, l = Math.hypot(dx, dy);
      assert.ok(Math.abs(E.ux - dx / l) < 0.01 && Math.abs(E.uy - dy / l) < 0.01, 'its way out: from where you come in out through the mouth');
      assert.equal(E.hw, EXIT.hw);
      assert.equal(E.lamps.length, 2, 'a lantern either side');
      for (const q of E.lamps) {
        assert.ok(K.lanterns.includes(q), 'one of the cave\'s lanterns (lit, on the server too)');
        assert.notEqual(cellAtPx(L, q.x, q.y), C.ROCK, 'standing on the floor');
        assert.ok(lightAt(L, q.x, q.y, [], 0) > 0.5, 'lit, day or night');
      }
      // the daylight: up the passage from just outside, and out past the mouth as bright as it is outside
      const near = spots.filter((s) => Math.hypot(s.x - M.x, s.y - M.y) < 260);
      assert.ok(near.some((s) => !s.past && s.k === 1), 'brightest at the mouth');
      const past = near.filter((s) => s.past);
      assert.ok(past.length >= 2 && past.every((s) => (s.x - M.x) * E.ux + (s.y - M.y) * E.uy > 0), 'the day outside, past the mouth');
    }
  }
  assert.ok(mouthLevel({ night: 0, amb: [1, 1, 1] }) > 0.9 && mouthLevel({ night: 1, amb: [0.2, 0.3, 0.5] }) > 0.25, 'daylight by day, moonlight by night');
});

test('a cave is painted crisp: at the art pixel, drawn up with no smoothing at whole device pixels; the way out baked into it', async () => {
  const log = [];
  stubDom(log);
  const w = makeWorld();
  const L = undergroundOf(w.map), K = L.caves[0], E = K.exits[0];
  const { createUgView } = await import('../client/underground/view.js');
  const { A } = await import('../client/underground/caveart.js');
  const S = { map: w.map, ugLayer: UG.CAVE, ugVeins: [], ugChests: [], flashes: [], loopClock: 0 };
  const V = createUgView(S, {});
  // the tile with the mouth in it: painted, the opening's ground and the board's letters with it
  const cx = Math.floor(E.x / 512), cy = Math.floor(E.y / 512);
  const t = V.bake(cx, cy);
  const art = log.filter((q) => q.op === 'draw' && q.cv === t);
  assert.equal(art.length, 1, 'the tile: one picture of its art pixels');
  const [src, ...a] = [art[0].src, ...art[0].a];
  assert.equal(art[0].smooth, false, 'drawn up with no smoothing');
  assert.equal(src.width * A, 512, `${A} world px an art pixel`);
  assert.deepEqual(a, [0, 0, 512, 512], 'exactly 2x');
  // (the art's brightness round a spot: the mean of r, g, b over 7 x 7 art pixels, or null off this tile)
  const img = src.img, at = (x, y) => {
    const ax0 = Math.floor((x - cx * 512) / A), ay0 = Math.floor((y - cy * 512) / A);
    if (ax0 < 3 || ay0 < 3 || ax0 > img.width - 4 || ay0 > img.height - 4) return null;
    let v = 0; for (let j = -3; j <= 3; j++) for (let i = -3; i <= 3; i++) { const k = ((ay0 + j) * img.width + ax0 + i) * 4; v += (img.data[k] + img.data[k + 1] + img.data[k + 2]) / 3; }
    return v / 49;
  };
  const deep = at(E.x - E.ux * 160, E.y - E.uy * 160), past = at(E.x + E.ux * 100, E.y + E.uy * 100);
  if (deep !== null && past !== null) assert.ok(past > deep * 1.3, `the ground outside and the glare past the mouth, brighter than the cave's floor (${past.toFixed(0)} against ${deep.toFixed(0)})`);
  else assert.ok(past !== null || deep !== null, 'the mouth\'s tile holds the opening');
  assert.ok(log.some((q) => q.op === 'fill' && q.cv === src && q.c === '#f2e4b4'), 'the WAY OUT board\'s letters baked in');
  // a frame: the tiles and the dark laid over at whole device pixels, no smoothing
  log.length = 0;
  const DPR = 3, z = 0.665, W = 360, H = 780, mx = E.x - E.ux * 60, my = E.y - E.uy * 60;
  S.worldTf = [DPR * z, 0, 0, DPR * z, Math.round(DPR * (W / 2 - mx * z)), Math.round(DPR * (H / 2 - my * z))];
  const g = fakeCanvas(log).getContext('2d'); g.canvas.width = W * DPR; g.canvas.height = H * DPR;
  const me = { id: 1, rx: mx, ry: my, ra: 0, flags: 0, d: {} };
  const F = { view: { x0: mx - W / 2 / z - 64, x1: mx + W / 2 / z + 64, y0: my - H / 2 / z - 64, y1: my + H / 2 / z + 64 }, dt: 0.016, peds: [me], vehs: [], cars: [], sky: { night: 0, amb: [1, 1, 1] }, meEnt: me, now: 1 };
  for (let k = 0; k < 8; k++) V.draw(g, F, W, H, DPR);
  const onScreen = log.filter((q) => q.op === 'draw' && q.cv === g.canvas);
  assert.ok(onScreen.length >= 2, 'the tiles and the dark');
  for (const q of onScreen) { assert.equal(q.smooth, false, 'no smoothing'); for (const v of q.a) assert.ok(Number.isInteger(v), `at whole device pixels (${q.a})`); }
});

test('the way out: offered all along its passage, out to the mouth', () => {
  const w = makeWorld();
  const L = undergroundOf(w.map), K = L.caves[0], M = mouthsOf(K)[0];
  const { p } = joinPlayer(w);
  ug.enterCave(w, p, K, M);
  for (const f of [0, 0.5, 0.9]) {
    teleport(w, p.ped, M.inside.x + (M.x - M.inside.x) * f, M.inside.y + (M.y - M.inside.y) * f);
    const a = players.findInteraction(w, p);
    assert.ok(a && /Walk out of the cave/.test(a.label), `the way out offered ${f} of the way to the mouth (${a && a.label})`);
  }
  teleport(w, p.ped, K.ch.hall.x, K.ch.hall.y);
  const a = players.findInteraction(w, p);
  assert.ok(!a || !/Walk out/.test(a.label), 'not from deep in');
  teleport(w, p.ped, M.inside.x, M.inside.y);
  players.findInteraction(w, p).run();
  assert.equal(p.ped.ug, 0, 'out');
});
