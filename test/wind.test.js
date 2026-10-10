// The wind (client/render/flora/wind.js) and what moves with it in art v2: the redwood canopy's dappled light
// (lightgame.js canopyCover, wind.air - task #388), and what sways - foliage, never the rock it grows on (task #425).
import test from 'node:test';
import assert from 'node:assert/strict';
import { Wind, AIR_P, FLUT_P } from '../client/render/flora/wind.js';
import { CAN_N } from '../client/art2/game/lightgame.js';
import { swayAt, leanAmp, leanOf } from '../client/art2/game/engine.js';
import { F_LEAF, F_GROUND, F_WET, F_NOCAST, F_ROCKLEAF } from '../client/art2/gbuf.js';
import { DAY_LOOP_S } from '../shared/constants.js';

// the shortest way from a to b on a ring of size P
const ringD = (a, b, P) => { const d = ((b - a) % P + P * 1.5) % P - P / 2; return d; };

// A session on the client: frames of dt seconds, the shared clock wrapping every loop, the rain coming and going,
// and now and then a hitch or the tab in the background (a long gap). Returns the fastest the canopy's leaf clumps
// moved (px/s), both as the shader saw them before (the clock times the wind's speed now) and as they move now.
function session(hours, fps, { gaps = true } = {}) {
  const w = new Wind(), dt0 = 1 / fps;
  let loop = 60, clock = 0, rain = 0, worstNew = 0, worstOld = 0, prevOld = null, inRange = true;
  const oldAt = (t) => { const k = (t % 4096) * (3 + w.strength * 12); return [w.dx * k, w.dy * k]; };
  for (let f = 0; clock < hours * 3600; f++) {
    // (every few minutes a long gap: a tab in the background - the client's dt is clamped to 0.1 s, the shared
    // clock jumps when the next snapshot comes)
    const gap = gaps && f % (fps * 400) === fps * 399;
    const dt = gap ? 0.1 : dt0, real = gap ? 95 : dt0;
    // (the old drift is only measured between jumps of its clocks: what it did while the wind merely changed)
    const jump = gap || Math.floor(clock / 4096) !== Math.floor((clock + dt) / 4096) || loop + real >= DAY_LOOP_S;
    clock += dt; loop = (loop + real) % DAY_LOOP_S;
    rain = Math.max(0, Math.min(1, rain + ((Math.floor(clock / 300) % 3 === 0 ? 1 : 0) - rain) * (1 - Math.exp(-dt / 8))));
    const a0 = w.air[0], a1 = w.air[1];
    w.update(loop, rain, dt);
    const d = Math.hypot(ringD(a0, w.air[0], AIR_P), ringD(a1, w.air[1], AIR_P));
    worstNew = Math.max(worstNew, d / dt);
    if (!(w.air[0] >= 0 && w.air[0] < AIR_P && w.air[1] >= 0 && w.air[1] < AIR_P)) inRange = false;
    const o = oldAt(clock);
    if (prevOld && !jump) worstOld = Math.max(worstOld, Math.hypot(o[0] - prevOld[0], o[1] - prevOld[1]) / dt);
    prevOld = o;
  }
  return { worstNew, worstOld, inRange };
}

test('the canopy\'s dappled light drifts slowly however long the session, at any frame rate, after the tab was away', () => {
  for (const fps of [20, 60, 144]) {
    const r = session(fps === 144 ? 1.5 : 3, fps);
    // (the air moves 3 px/s in calm air, 15 in a gale)
    assert.ok(r.worstNew <= 15.01, `${fps} fps: the clumps drift at most 15 px/s (${r.worstNew.toFixed(2)})`);
    assert.ok(r.inRange, `${fps} fps: the drift stays inside its ring (precise however long the session)`);
    // what the floor did before: the whole pattern raced whenever the wind changed late in a session
    assert.ok(r.worstOld > 200, `${fps} fps: the old clock-times-speed drift raced (${r.worstOld.toFixed(0)} px/s)`);
  }
});

test('the air eases round when the wind turns or picks up, and a long gap or a jumping clock moves it a tenth of a second at most', () => {
  const w = new Wind();
  w.update(100, 0, 1 / 60);
  // the loop wrapping (the wind's direction and mood jump there) and the server's clock snapping
  const v0 = [w.vx, w.vy];
  w.update(5, 1, 1 / 60);
  assert.ok(Math.hypot(w.vx - v0[0], w.vy - v0[1]) < 0.2, 'the velocity eases, it does not jump with the wind');
  const a = [...w.air];
  w.update(800, 1, 120);   // (two minutes in the background)
  assert.ok(Math.hypot(ringD(a[0], w.air[0], AIR_P), ringD(a[1], w.air[1], AIR_P)) <= 1.6, 'a long gap: 0.1 s of drift');
  w.update(800, 1, -5);    // (a clock going backwards: nothing)
  assert.ok(Math.hypot(ringD(a[0], w.air[0], AIR_P), ringD(a[1], w.air[1], AIR_P)) <= 1.6);
});

test('the canopy noise repeats over the air\'s ring, so its wrap never shows', () => {
  // octave 1 moves with the air over CAN_N[0] cells in 8192 px, octave 2 back at half speed over CAN_N[1] in 4096
  for (const [n, span, k] of [[CAN_N[0], 8192, 1], [CAN_N[1], 4096, 0.5]]) {
    const shift = AIR_P * k * (n / span);   // lattice cells moved when the air wraps
    assert.ok(Number.isInteger(n) && Number.isInteger(shift / n), `the wrap moves a whole number of periods (${shift / n})`);
  }
});

// ---- the wind in the leaves (task #385): gust patches and each stand in its own time, not one wave ----------------
const corr = (a, b) => {
  const n = a.length, ma = a.reduce((s, v) => s + v, 0) / n, mb = b.reduce((s, v) => s + v, 0) / n;
  let ab = 0, aa = 0, bb = 0;
  for (let i = 0; i < n; i++) { ab += (a[i] - ma) * (b[i] - mb); aa += (a[i] - ma) ** 2; bb += (b[i] - mb) ** 2; }
  return ab / Math.sqrt(aa * bb || 1);
};
// the sway (push + idle) of trees at pts over secs of a wind at strength s, new and old (the shader before today:
// plane waves on the clock and an idle sway 1400 px long)
function swaySeries(pts, s, secs = 40) {
  const w = new Wind(), out = pts.map(() => []), old = pts.map(() => []);
  w.force = s;
  let lt = 5000;
  for (let f = 0; f < secs * 60; f++) {
    lt += 1 / 60; w.update(lt, 0, 1 / 60);
    if (f % 6) continue;
    const W = [w.strength, w.gust, w.dx, w.dy];
    pts.forEach(([x, y], i) => {
      const r = swayAt(x, y, W, w.gd, w.ft);
      out[i].push(r.pw + r.pi);
      const t = lt % 4096, along = x * w.dx + y * w.dy;
      const g = 0.5 + 0.5 * (0.65 * Math.sin(along * 0.006 - t * (1.1 + s * 1.6)) + 0.35 * Math.sin(along * 0.009 + (x * w.dy - y * w.dx) * 0.003 - t * (2.3 + s * 2) + 1.3));
      old[i].push(s * ((1 - w.gust) * 0.6 + w.gust * g * 1.3) * w.dx + Math.sin(t * 1.25 + x * 0.0045 + y * 0.006) * 0.3 + Math.sin(t * 0.7 + x * 0.0021 - y * 0.003) * 0.15);
    });
  }
  return { out, old };
}

// the best match of b against a shifted by up to L samples (3 s): a wave rolling over the trees makes each one its
// neighbour a moment later (near 1)
const lagCorr = (a, b, L = 30) => {
  let best = -1;
  for (let l = -L; l <= L; l++) {
    const x = [], y = [];
    for (let i = Math.max(0, -l); i < a.length && i + l < b.length; i++) { x.push(a[i]); y.push(b[i + l]); }
    best = Math.max(best, corr(x, y));
  }
  return best;
};
const sd = (a) => { const m = a.reduce((p, v) => p + v, 0) / a.length; return Math.sqrt(a.reduce((p, v) => p + (v - m) ** 2, 0) / a.length); };
// how differently far the trees sway (spread of their amplitudes over the mean)
const spread = (series) => { const amp = series.map(sd), m = amp.reduce((p, v) => p + v, 0) / amp.length; return sd(amp) / m; };

test('the trees sway in their own time and by their own amount: no one wave over the screen', () => {
  // a screen's worth of trees, 160-420 px apart
  const pts = [];
  for (let j = 0; j < 4; j++) for (let i = 0; i < 6; i++) pts.push([20000 + i * 210 + (j % 2) * 70, 9000 + j * 170]);
  for (const s of [0.1, 0.3]) {
    const { out, old } = swaySeries(pts, s);
    let cNew = 0, lNew = 0, lOld = 0, n = 0;
    for (let a = 0; a < pts.length; a++) for (let b = a + 1; b < pts.length; b++) {
      const d = Math.hypot(pts[a][0] - pts[b][0], pts[a][1] - pts[b][1]);
      if (d < 160 || d > 420) continue;
      cNew += corr(out[a], out[b]); lNew += lagCorr(out[a], out[b]); lOld += lagCorr(old[a], old[b]); n++;
    }
    cNew /= n; lNew /= n; lOld /= n;
    // before: every tree did what its neighbour did a moment earlier, by the same amount - one wave over the screen
    assert.ok(lOld > 0.82, `strength ${s}: before, each tree was its neighbour a moment later (${lOld.toFixed(2)})`);
    assert.ok(spread(old) < 0.05, `strength ${s}: before, all by the same amount (${spread(old).toFixed(2)})`);
    // now each in its own time and by its own amount (measured: best match 0.63-0.64, together 0.05-0.06)
    assert.ok(lNew < 0.75 && cNew < 0.3,`strength ${s}: now each in its own time (best match ${lNew.toFixed(2)}, together ${cNew.toFixed(2)})`);
    assert.ok(spread(out) > 0.2, `strength ${s}: now by its own amount (${spread(out).toFixed(2)})`);
  }
  // within one crown the clusters of leaves move together, but not rigidly
  const { out } = swaySeries([[30000, 9000], [30026, 9010], [30300, 9000]], 0.12);
  const near = corr(out[0], out[1]), far = corr(out[0], out[2]);
  assert.ok(near < 0.985 && near > far, `clusters a branch apart ${near.toFixed(3)}, stands apart ${far.toFixed(3)}`);
});

test('gusts come in patches that travel and fade, not bands over everything', () => {
  const w = new Wind();
  w.force = 0.45;
  let lt = 9000;
  const at = [], cover = [];
  for (let f = 0; f < 90 * 60; f++) {
    lt += 1 / 60; w.update(lt, 0, 1 / 60);
    if (f % 30) continue;
    const W = [w.strength, w.gust, w.dx, w.dy];
    at.push(swayAt(15000, 15000, W, w.gd, w.ft).g);
    let hit = 0;
    for (let k = 0; k < 400; k++) if (swayAt(14000 + (k % 20) * 64, 14000 + Math.floor(k / 20) * 48, W, w.gd, w.ft).g > 0.4) hit++;
    cover.push(hit / 400);
  }
  assert.ok(Math.max(...at) - Math.min(...at) > 0.5, 'a gust comes over a spot and passes');
  const mean = cover.reduce((s, v) => s + v, 0) / cover.length;
  assert.ok(mean > 0.04 && mean < 0.5, `patches cover ${(mean * 100).toFixed(0)}% of a screen at a time`);
});

test('the gusts\' travel and the flutter clock move smoothly, whatever the wind and the clock do', () => {
  const w = new Wind();
  let loop = 100, worstG = 0, worstF = 0;
  for (let f = 0; f < 3600 * 30; f++) {
    const gap = f % 9000 === 8999, dt = gap ? 0.1 : 1 / 30;
    loop += gap ? 300 : dt;                      // (the tab away: the clock jumps on)
    const g0 = [...w.gd], f0 = w.ft;
    w.update(loop, Math.floor(loop / 400) % 2, dt);
    worstG = Math.max(worstG, Math.hypot(ringD(g0[0], w.gd[0], AIR_P), ringD(g0[1], w.gd[1], AIR_P)) / dt, Math.hypot(ringD(g0[2], w.gd[2], AIR_P), ringD(g0[3], w.gd[3], AIR_P)) / dt);
    worstF = Math.max(worstF, ringD(f0, w.ft, FLUT_P) / dt);
  }
  assert.ok(worstG <= 400.01, `gust patches travel at most 400 px/s (${worstG.toFixed(1)})`);
  assert.ok(worstF <= 2.0001, `the flutter clock runs at most twice real time (${worstF.toFixed(3)})`);
  // the sway's frequencies are whole turns over the flutter clock's wrap, so it never shows
  const r1 = swayAt(5000, 5000, [0.3, 0.5, 1, 0], [1, 2, 3, 4], 0.25), r2 = swayAt(5000, 5000, [0.3, 0.5, 1, 0], [1, 2, 3, 4], 0.25 + FLUT_P);
  assert.ok(Math.abs(r1.pi - r2.pi) < 1e-9);
  // and the gust patches repeat over the ring gd wraps at, in x and in y: in art v2 and in the classic renderer
  for (const [x, y] of [[5000, 5000], [23456, 7890], [100, 41000]]) {
    const G = [1234.5, 77.25, 4000.75, 8000.5];
    const a = swayAt(x, y, [0.3, 0.5, 1, 0], G, 3).g, b = swayAt(x, y, [0.3, 0.5, 1, 0], [G[0] - AIR_P, G[1] + AIR_P, G[2] + AIR_P, G[3] - AIR_P], 3).g;
    assert.ok(Math.abs(a - b) < 1e-6, `art v2 gusts at the wrap ${a} ${b}`);
    const v = new Wind();
    v.update(3000, 0, 1 / 60);
    v.gd.splice(0, 4, ...G);
    const c = v.sway(x, y, 1, 0.3);
    v.gd.splice(0, 4, G[0] + AIR_P, G[1] - AIR_P, G[2] - AIR_P, G[3] + AIR_P);
    assert.ok(Math.abs(v.sway(x, y, 1, 0.3) - c) < 1e-6, 'the classic renderer\'s gusts at the wrap');
  }
});

test('what sways: foliage only - never rock; the plants on a rock as on their own patch of ground, not as a tree as tall as the rock (task #425)', async () => {
  // the rule (engine.js leanAmp / leanOf: STATIC_FS's ampOf / leanOf in JS)
  for (const h of [0, 20, 70, 150]) for (const f of [0, F_GROUND | F_WET, F_WET, F_NOCAST]) assert.equal(leanAmp(h, f), 0, `rock, stone, the ground (flags ${f}, ${h} px up): never`);
  const crown = [30, 70, 150].map((h) => leanAmp(h, F_LEAF)), onRock = [20, 70, 150].map((h) => leanAmp(h, F_ROCKLEAF)), tips = leanAmp(7, F_GROUND | F_WET | F_LEAF);
  assert.ok(crown[0] > 0 && crown[0] < crown[1] && crown[1] <= crown[2], `a crown sways more the higher it stands (${crown.map((a) => a.toFixed(2))})`);
  assert.ok(onRock.every((a) => a === onRock[0]) && onRock[0] > 0 && onRock[0] <= tips, `a plant on a rock sways the same whatever the rock's height, as grass tips do at most (${onRock.map((a) => a.toFixed(2))}; tips ${tips})`);
  assert.ok(onRock[1] < crown[1] && onRock[2] < crown[2], 'and never as a crown that high');
  // a breeze, a strong wind and a gale over a tuft on top of a 150 px sea stack, at 400 points and moments: it leans no
  // further than the grass tips round its foot, and in all less than half as far as a crown as high (it used to swing
  // as that crown did, over the rock round it); in a breeze it stands still
  const G = [700, 300, 1400, 900];
  for (const [W, what] of [[[0.35, 0.4, 0.7, 0.7], 'a breeze'], [[0.6, 0.5, 0.8, 0.6], 'a strong wind'], [[1, 0.9, 1, 0.2], 'a gale']]) {
    let rock = 0, crown = 0;
    for (let k = 0; k < 400; k++) {
      const x = 20000 + (k % 20) * 37, y = 9000 + Math.floor(k / 20) * 29, S = swayAt(x, y, W, G, k * 0.61);
      const r = Math.abs(leanOf(S.pw, S.pi, 156, F_ROCKLEAF, 2)), g = Math.abs(leanOf(S.pw, S.pi, 7, F_GROUND | F_WET | F_LEAF, 2));
      assert.ok(r <= g, `${what}: no further than the grass`);
      assert.equal(leanOf(S.pw, S.pi, 156, 0, 2), 0, `${what}: the rock itself, never`);
      rock += r; crown += Math.abs(leanOf(S.pw, S.pi, 156, F_LEAF, 2));
    }
    assert.ok(crown > 100 && rock < crown * 0.5, `${what}: a crown 156 px up leans ${crown} art px in all, a tuft on a rock that high ${rock}`);
    if (what === 'a breeze') assert.equal(rock, 0, 'in a breeze the tuft on the rock stands still');
  }
  // the art: on the rocks, cliffs and columns the world puts down, everything that sways is a plant on the rock (the
  // grass and flowers on its top and ledges, vines and kelp off its lip) - and the columnar basalt cliffs (the gorges,
  // the cliffs over the beach) and the falls over it hold still, moss and all: their moss is the rock's crust
  const { makeStatic } = await import('../client/art2/game/statics.js');
  for (const [name, r, plants] of [
    ['the basalt cliff wall', { t: 'v', m: 'cliffWall', a: [192, 70, 56, 3], hd: 0 }, false],
    ['a falls over the basalt', { t: 'fall', kind: 'cliff', w: 28, drop: 66, seed: 11, mist: 0.7 }, false],
    ['a mossy boulder', { t: 'rock', s: 4, size: 24, style: 'granite', moss: 1 }, false],
    ["the quarry's granite cliff", { t: 'cliff', w: 300, d: 120, h: 90, s: 2 }, true],
    ['a sea stack', { t: 'stack', s: 3, r: 26, h: 150 }, true],
    ['a sea arch', { t: 'v', m: 'seaArch', a: [150, 56, 96, 3], hd: 0 }, true],
    ['an outcrop', { t: 'outcrop', s: 3, w: 120, d: 80, h: 50 }, true],
  ]) {
    const S = makeStatic(r);
    let solid = 0, leafy = 0, other = 0;
    for (let i = 0; i < S.w * S.h; i++) {
      if (!S.col[i * 4 + 3]) continue;
      solid++;
      const f = S.flag[i];
      if (!(f & F_LEAF)) continue;
      leafy++;
      if ((f & F_ROCKLEAF) !== F_ROCKLEAF || (f & F_GROUND)) other++;
    }
    assert.equal(other, 0, `${name}: nothing on it sways but as a plant on the rock (${other} px)`);
    if (plants) assert.ok(leafy > 0 && leafy < solid * 0.5, `${name}: the plants on it still sway (${leafy} of ${solid} px)`);
    else assert.equal(leafy, 0, `${name}: holds still, moss and all`);
  }
});
