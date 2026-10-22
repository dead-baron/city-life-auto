// Tennis with the club pro (the owner, 10-16: "Tennis" - server/systems/tennis.js): on a court the action button calls
// the pro out; you serve and hit with the attack button; the pro runs balls down and returns them (missing now and
// then); a ball into the net or out, or a second bounce, is a point to the other side; first to four, two clear.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer, teleport, players } from './helpers.js';
import { T, TILE, K } from '../shared/constants.js';
import { IN } from '../shared/input.js';
import { TENNIS } from '../shared/rules.js';
import * as tennis from '../server/systems/tennis.js';
import * as net from '../server/net.js';

// a court laid on open ground, played along y (ax 0: the net east-west) or along x (ax 1: the net north-south - World
// v3's wide courts); the game reads only its lines (tennis.courts - World v3's come from its court props)
function court(w, ax = 0) {
  const m = w.map, ok = (t) => t === T.ROAD || t === T.PLAZA || t === T.LOT || t === T.GRASS || t === T.SIDEWALK;
  const ru = 16, rv = 10, [rx, ry] = ax ? [ru, rv] : [rv, ru];
  for (let ty = m.y0 + 60; ty < m.y0 + m.h - 60; ty += 4) for (let tx = m.x0 + 60; tx < m.x0 + m.w - 60; tx += 4) {
    let all = true;
    for (let dy = -ry; dy <= ry && all; dy++) for (let dx = -rx; dx <= rx && all; dx++) if (!ok(m.tiles[m.idx(tx + dx, ty + dy)])) all = false;
    if (all) {
      const cx = (tx + 0.5) * TILE, cy = (ty + 0.5) * TILE, [hx, hy] = ax ? [380, 180] : [180, 380];
      w.tennisCourts = [tennis.courtFrom(0, cx - hx, cx + hx, cy - hy, cy + hy, ax)];
      return w.tennisCourts[0];
    }
  }
  return null;
}
// along the court (u, across the net) and across it (v), and back to the world
const U = (c, e) => (c.ax ? e.x : e.y), V = (c, e) => (c.ax ? e.y : e.x);
const at = (c, u, v) => (c.ax ? { x: u, y: v } : { x: v, y: u });
let seq = 0;
const step = (w, p, bits = 0, mx = 0, my = 0, aim = -Math.PI / 2) => { p.inputQ.push({ seq: ++seq, bits, mx, my, aim }); w.step(); };

test('the courts: World v3\'s tennis court props, their lines and the net across the middle, either way round', () => {
  const w = { map: { props: [
    { t: 'court', k: 'tennis', x: 1000, y: 2000, w: 448, d: 896 }, { t: 'court', x: 0, y: 0, w: 100, d: 100 },
    { t: 'court', k: 'tennis', x: 5000, y: 2000, w: 896, d: 448 }, { t: 'tnet', x: 5000, y: 2224, a: 0, len: 420 },
    { t: 'court', k: 'tennis', x: 9000, y: 2000, w: 600, d: 560 }, { t: 'tnet', x: 9000, y: 2280, a: Math.PI / 2, len: 560 },
  ] } };
  const [c, wide, sq, more] = tennis.courts(w);
  assert.ok(c && wide && sq && !more, 'the tennis courts, not the basketball one');
  assert.equal(c.ax, 0, 'a long court: played north-south');
  assert.equal(c.net, 2000 + 448, 'the net across the middle');
  assert.ok(c.x0 > 1000 - 224 && c.x1 < 1000 + 224 && c.y0 > 2000 && c.y1 < 2896, 'the lines inside the run-off');
  assert.equal(wide.ax, 1, 'its net strung north-south: played east-west');
  assert.equal(wide.net, 5000, 'the net down the middle');
  assert.ok(wide.x0 > 5000 - 448 && wide.x1 < 5000 + 448 && wide.y0 > 2000 && wide.y1 < 2448, 'the lines inside the run-off');
  assert.equal(sq.ax, 0, 'a court the way its net says, wider or not');
});

for (const ax of [0, 1]) {
  const way = ax ? 'east-west' : 'north-south';
  test(`a game with the pro (${way}): called out, serve, rallies, points counted as tennis does, a winner`, () => {
    const w = makeWorld();
    const { p } = joinPlayer(w);
    const c = court(w, ax);
    assert.ok(c, 'room for a court');
    const base = at(c, c.u1 - 20, c.vc), aim0 = ax ? Math.PI : -Math.PI / 2;   // (your baseline; facing the pro)
    teleport(w, p.ped, base.x, base.y);
    const act = players.findInteraction(w, p);
    assert.ok(act && /tennis/i.test(act.label), act && act.label);
    act.run();
    const G = w.tennis.get(0);
    assert.ok(G && G.side === 1, 'a game, you on the far half');
    const pro = w.get(G.pro), ball = w.get(G.ball);
    assert.ok(pro && U(c, pro) < c.net, 'the pro across the net');
    assert.equal(net.descriptor(ball).t, 6, 'a tennis ball on the wire');
    // the action button while serving: nothing (the prompt only says what to do)
    const serve = players.findInteraction(w, p);
    assert.ok(serve && /Serve/.test(serve.label));
    serve.run();
    // play it out: run to the ball on your side, swing when it's in reach; serve when it's yours
    let points = 0, rallies = 0, last = '', t = 0;
    while (w.tennis.has(0) && t++ < 20 * 600) {
      const b = w.get(G.ball);
      if (!b) break;
      const sc = G.score.join('-');
      if (sc !== last) { points++; last = sc; }
      if (G.phase === 'serve') { step(w, p, t % 40 === 0 ? IN.FIRE | IN.AIMING : 0, 0, 0, aim0 + (t % 3 - 1) * 0.6); continue; }
      if (G.hitBy === 1 && U(c, b) > c.net) {
        const tx = b.x + b.vx * 0.15, ty = b.y + b.vy * 0.15, dx = tx - p.ped.x, dy = ty - p.ped.y, d = Math.hypot(dx, dy);
        const near = Math.hypot(b.x - p.ped.x, b.y - p.ped.y) < 30 && b.z < 70;
        if (near) rallies++;
        step(w, p, near ? IN.FIRE | IN.AIMING : 0, d > 4 ? dx / d : 0, d > 4 ? dy / d : 0, aim0 + ((t >> 3) % 3 - 1) * 0.5);
      } else {   // back toward the middle of the baseline
        const h = at(c, c.u1 - 30, c.vc), dx = h.x - p.ped.x, dy = h.y - p.ped.y, d = Math.hypot(dx, dy);
        step(w, p, 0, d > 8 ? dx / d : 0, d > 8 ? dy / d : 0);
      }
    }
    assert.ok(!w.tennis.has(0), 'the game was won and lost');
    const [a, b2] = G.score;
    assert.ok((a >= 4 || b2 >= 4) && Math.abs(a - b2) >= 2, `first to four, two clear (${a}-${b2})`);
    assert.ok(rallies > 0, 'the pro sent balls back and you hit them');
    assert.equal(p.tennis, null, 'out of the game');
    assert.ok(!pro.npc.driven, 'the pro off about its day');
  });

  test(`the rules (${way}): into the net or out is the hitter's point lost; walking off ends the game`, () => {
    const w = makeWorld();
    const { p } = joinPlayer(w);
    const c = court(w, ax);
    const base = at(c, c.u1 - 20, c.vc);
    teleport(w, p.ped, base.x, base.y);
    tennis.start(w, p, c);
    const G = w.tennis.get(0), b = w.get(G.ball);
    const shot = (u, z, vu, vz) => { const s = at(c, u, c.vc); b.x = s.x; b.y = s.y; b.z = z; b.vx = c.ax ? vu : 0; b.vy = c.ax ? 0 : vu; b.vz = vz; };
    // your shot, low and slow into the net
    G.phase = 'rally'; G.hitBy = 0; G.bounces = 0; G.netted = false;
    shot(c.net + 40, 10, -200, 40);
    for (let i = 0; i < 40 && G.phase === 'rally'; i++) step(w, p);
    assert.deepEqual(G.score, [0, 1], 'netted: the pro\'s point');
    assert.ok(U(c, b) >= c.net, 'dropped on your side');
    // your shot long, past the far baseline
    for (let i = 0; i < 20 * (TENNIS.between + 0.5) && G.phase !== 'serve'; i++) step(w, p);
    G.phase = 'rally'; G.hitBy = 0; G.bounces = 0; G.netted = false; G.whiff = true;   // (the pro can't reach it)
    shot(c.net + 60, 40, -900, 200);
    for (let i = 0; i < 60 && G.phase === 'rally'; i++) step(w, p);
    assert.deepEqual(G.score, [0, 2], 'out: the pro\'s point');
    // off the court: the pro takes the game
    const off = at(c, c.net, c.v1 + TENNIS.leave + 60);
    teleport(w, p.ped, off.x, off.y);
    step(w, p);
    assert.ok(!w.tennis.has(0) && !p.tennis, 'over');
    assert.ok(![...w.entities.values()].some((e) => e.kind === K.BALL && e.ballKind === 'tennis'), 'the ball gone');
  });
}

test('the pro knocked down, or a serve never hit: the game\'s off', () => {
  const w = makeWorld();
  const { p } = joinPlayer(w);
  const c = court(w, 0);
  teleport(w, p.ped, c.cx, c.y1 - 20);
  tennis.start(w, p, c);
  const pro = w.get(w.tennis.get(0).pro);
  pro.downUntil = w.time + 3;
  step(w, p);
  assert.ok(!w.tennis.has(0) && !p.tennis && !pro.npc.driven, 'off when the pro is floored');
  tennis.start(w, p, c);
  for (let i = 0; i < 20 * (TENNIS.serveWait + 1) && w.tennis.has(0); i++) step(w, p);
  assert.ok(!w.tennis.has(0) && !p.tennis, 'off when you never serve');
});
