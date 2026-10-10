// Tunnels (shared/tunnels.js): roads under the ground. The one in today's world (a country road through a spur of the
// Granite Peaks), the cover layer and the list, sight (nobody outside sees in, nobody inside sees out, two inside see
// each other), a car driving through, a closed mouth stopping one, and what the client hides from whom.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld } from './helpers.js';
import { CityMap } from '../shared/map.js';
import { buildTunnels, underCover, tunnelAt, nearestMouth, coverHides, TUNNEL_WALL } from '../shared/tunnels.js';
import { vehStep } from '../shared/physics.js';
import { VEHICLES } from '../shared/vehicles.js';
import { T, TILE, MAP_W, DT } from '../shared/constants.js';
import { fadeTarget, hiddenFor, stepFade } from '../client/tunnels.js';

const linePt = (t, k) => ({ x: t.line[2 * k], y: t.line[2 * k + 1] });
const tileAt = (m, x, y) => m.tiles[Math.floor(y / TILE) * MAP_W + Math.floor(x / TILE)];
// drive a car along a path of points (steering for the one 140 px ahead); returns where it went
function drive(m, s, def, path, secs, throttle = 0.7) {
  const track = [];
  for (let i = 0; i < secs / DT; i++) {
    let k = 0, bd = Infinity;
    for (let j = 0; j < path.length; j++) { const d = Math.hypot(path[j].x - s.x, path[j].y - s.y); if (d < bd) { bd = d; k = j; } }
    let tgt = path[path.length - 1];
    for (let j = k; j < path.length; j++) if (Math.hypot(path[j].x - s.x, path[j].y - s.y) > 140) { tgt = path[j]; break; }
    let da = Math.atan2(tgt.y - s.y, tgt.x - s.x) - s.a;
    while (da > Math.PI) da -= 2 * Math.PI;
    while (da < -Math.PI) da += 2 * Math.PI;
    vehStep(s, { throttle, steer: Math.max(-1, Math.min(1, da * 2.5)), hb: false, drv: true }, DT, m, def, { rain: false });
    track.push({ x: s.x, y: s.y, c: underCover(m, s.x, s.y) });
  }
  return track;
}
// the tunnel's centre line run on past both mouths (so a car lines up before it and carries on after)
function through(t, ext = 400) {
  const a = t.mouths[0], b = t.mouths[1], pts = [];
  for (let d = ext; d > 0; d -= 32) pts.push({ x: a.x + a.ox * d, y: a.y + a.oy * d });
  for (let k = 0; k < t.line.length / 2; k++) pts.push(linePt(t, k));
  for (let d = 32; d <= ext; d += 32) pts.push({ x: b.x + b.ox * d, y: b.y + b.oy * d });
  return pts;
}

test('today\'s world has one tunnel: a country road through a spur of the Granite Peaks, under one byte of cover a tile', () => {
  const m = makeWorld().map;
  assert.ok(m.cover instanceof Uint8Array && m.cover.length === m.tiles.length, 'the cover layer: one byte a tile');
  assert.equal(m.tunnels.length, 1);
  const t = m.tunnels[0], e = m.edges[t.edge];
  assert.equal(t.kind, 'road');
  assert.equal(e.kind, 'rural', 'a country road');
  assert.ok(t.len >= 640 && t.len === t.s1 - t.s0, 'a real stretch of it: ' + t.len);
  assert.equal(m.districtAt(t.mouths[0].x, t.mouths[0].y).name, 'Granite Peaks');
  assert.equal(t.mouths.length, 2);
  assert.ok(t.mouths.every((mo) => !mo.closed), 'both mouths open');
  // under cover along the bore, open air just outside each mouth
  for (let k = 1; k < t.line.length / 2 - 1; k++) { const p = linePt(t, k); assert.equal(underCover(m, p.x, p.y), t.id + 1, 'covered at ' + k); }
  for (const mo of t.mouths) assert.equal(underCover(m, mo.x + mo.ox * 64, mo.y + mo.oy * 64), 0, 'outside the mouth');
  assert.equal(tunnelAt(m, linePt(t, 8).x, linePt(t, 8).y), t);
  // rock either side of the bore, road through it
  const mid = linePt(t, 16), nx = -t.mouths[1].oy, ny = t.mouths[1].ox;
  for (const side of [-1, 1]) assert.equal(tileAt(m, mid.x + nx * side * (t.hw + TUNNEL_WALL / 2), mid.y + ny * side * (t.hw + TUNNEL_WALL / 2)), T.WALL, 'the rock beside the bore');
  for (let k = 0; k < t.line.length / 2; k++) { const p = linePt(t, k); assert.notEqual(tileAt(m, p.x, p.y), T.WALL, 'the road runs clear through'); }
  // the nearest mouth
  const near = nearestMouth(m, t.mouths[1].x + 300, t.mouths[1].y);
  assert.equal(near.tunnel, t); assert.equal(near.mouth, t.mouths[1]);
});

test('sight: nobody outside a tunnel sees in, nobody inside sees out - two inside see each other', () => {
  const m = makeWorld().map, t = m.tunnels[0];
  const in1 = linePt(t, 8), in2 = linePt(t, 22), mo = t.mouths[0];
  const out = { x: mo.x + mo.ox * 160, y: mo.y + mo.oy * 160 };   // on the road, looking straight in at the mouth
  assert.ok(m.los(in1.x, in1.y, in2.x, in2.y), 'two inside see each other');
  assert.ok(m.los(in2.x, in2.y, in1.x, in1.y));
  assert.ok(!m.los(out.x, out.y, in1.x, in1.y), 'outside does not see in');
  assert.ok(!m.los(in1.x, in1.y, out.x, out.y), 'inside does not see out');
  // a traffic camera (or a cop) right at the mouth sees the road outside, not the bore
  const out2 = { x: mo.x + mo.ox * 400, y: mo.y + mo.oy * 400 };
  assert.ok(m.los(out.x, out.y, out2.x, out2.y), 'outside still sees outside');
  // across the hill from one side to the other: the ground's in the way
  const mid = linePt(t, 16), nx = -t.mouths[1].oy, ny = t.mouths[1].ox, o = t.hw + TUNNEL_WALL + 80;
  assert.ok(!m.los(mid.x + nx * o, mid.y + ny * o, mid.x - nx * o, mid.y - ny * o), 'not through the hill');
  // the police's own check (law.js canSee goes through map.los)
  assert.ok(!m.los(out2.x, out2.y, linePt(t, 2).x, linePt(t, 2).y));
});

test('a car drives into the tunnel, through it under the hill, and out of the other mouth', () => {
  const m = makeWorld().map, t = m.tunnels[0], def = VEHICLES.sedan, path = through(t);
  const a = t.mouths[0], s = { x: path[0].x, y: path[0].y, a: Math.atan2(-a.oy, -a.ox), vx: 0, vy: 0, av: 0, slip: 0, spin: 0, launch: 0, lz: 0 };
  const track = drive(m, s, def, path, 14);
  const inside = track.filter((p) => p.c === t.id + 1).length;
  assert.ok(inside > 10, 'it was under the hill a while: ' + inside);
  const b = t.mouths[1], past = (s.x - b.x) * b.ox + (s.y - b.y) * b.oy;
  assert.ok(past > 100, 'and came out of the far mouth: ' + Math.round(past) + ' px past it');
  assert.equal(underCover(m, s.x, s.y), 0, 'out in the open again');
});

test('a closed mouth (a highway running off the map) stops a car at its "ROAD CLOSED" barrier', () => {
  // a small synthetic map: a straight road with a tunnel at its end, the far mouth closed
  const m = new CityMap(7);
  for (let ty = 8; ty < 18; ty++) for (let tx = 2; tx < 120; tx++) m.tiles[ty * MAP_W + tx] = ty < 10 || ty > 15 ? T.GRASS : T.ROAD;
  m.edges = [{ id: 0, kind: 'hwy', lvl: 0, hw: 96, pts: [{ x: 4 * TILE, y: 13 * TILE }, { x: 118 * TILE, y: 13 * TILE }] }];
  const [t] = buildTunnels(m, [{ edge: 0, s0: 40 * TILE, s1: 110 * TILE, closed: 'b' }]);
  assert.ok(t && t.mouths[1].closed && !t.mouths[0].closed, 'its far mouth closed');
  const bx = t.mouths[1].x;
  assert.equal(tileAt(m, bx - 16, 13 * TILE), T.WALL, 'the barrier across the bore');
  assert.equal(tileAt(m, bx - 120, 13 * TILE), T.ROAD, 'the road up to it');
  const def = VEHICLES.sedan, s = { x: 10 * TILE, y: 13 * TILE, a: 0, vx: 0, vy: 0, av: 0, slip: 0, spin: 0, launch: 0, lz: 0 };
  const path = Array.from({ length: 120 }, (_, i) => ({ x: (10 + i * 1.5) * TILE, y: 13 * TILE }));
  const track = drive(m, s, def, path, 16, 1);
  assert.ok(track.some((p) => p.c === t.id + 1), 'it drove into the tunnel');
  assert.ok(Math.max(...track.map((p) => p.x)) < bx - BARRIER_PAD, 'and never got past the barrier');
});
const BARRIER_PAD = 20;

test('what the client hides: a viewer outside sees nothing under the hill; inside, their own tunnel shows and fades open', () => {
  const m = makeWorld().map, t = m.tunnels[0], in1 = linePt(t, 8), in2 = linePt(t, 20), mo = t.mouths[0];
  const out = { x: mo.x + mo.ox * 200, y: mo.y + mo.oy * 200 };
  assert.ok(coverHides(m, out.x, out.y, in1.x, in1.y), 'a car in the tunnel is hidden from a viewer outside');
  assert.ok(!coverHides(m, in2.x, in2.y, in1.x, in1.y), 'and shown to one inside');
  assert.ok(!coverHides(m, in1.x, in1.y, out.x, out.y), 'the world outside stays drawn for a viewer inside');
  assert.ok(!coverHides(m, out.x, out.y, out.x + 50, out.y), 'outside to outside: nothing hidden');
  assert.ok(hiddenFor(m, out, in1) && !hiddenFor(m, in2, in1));
  // the hill over the tunnel fades away only for the one you're in
  assert.equal(fadeTarget(m, in1, t), 1);
  assert.equal(fadeTarget(m, out, t), 0);
  // smoothly, in about 0.3 s (as a walk-in's roof)
  let k = 0;
  for (let i = 0; i < 3; i++) k = stepFade(k, 1, 1 / 60);
  assert.ok(k > 0 && k < 0.5, 'not at once: ' + k);
  for (let i = 3; i < 18; i++) k = stepFade(k, 1, 1 / 60);
  assert.ok(k > 0.9, 'all but open after 0.3 s: ' + k);
  for (let i = 0; i < 60; i++) k = stepFade(k, 0, 1 / 60);
  assert.equal(k, 0, 'and back over you once you leave');
});

test('the railway can go under the ground too: a rail tunnel\'s cover and mouths', () => {
  const m = new CityMap(9);
  for (let ty = 20; ty < 30; ty++) for (let tx = 2; tx < 80; tx++) m.tiles[ty * MAP_W + tx] = T.DIRT;
  m.rail = { pts: [{ x: 4 * TILE, y: 25 * TILE }, { x: 40 * TILE, y: 25 * TILE }, { x: 78 * TILE, y: 25 * TILE }] };
  const [t] = buildTunnels(m, [{ edge: 'rail', s0: 20 * TILE, s1: 60 * TILE }]);
  assert.equal(t.kind, 'rail');
  assert.equal(t.hw, 40, 'a track bed\'s width');
  assert.equal(underCover(m, 40 * TILE, 25 * TILE), t.id + 1);
  assert.equal(underCover(m, 10 * TILE, 25 * TILE), 0);
  assert.ok(Math.abs(t.mouths[0].x - 24 * TILE) < 1 && t.mouths[0].ox === -1 && Math.abs(t.mouths[1].x - 64 * TILE) < 1 && t.mouths[1].ox === 1, "the mouths 20 and 60 tiles along the line");
  assert.ok(!m.los(40 * TILE, 25 * TILE, 40 * TILE, 33 * TILE), 'a train in it is out of sight of the hillside');
});

test('in the rain a tunnel\'s road is dry: a car brakes there as on a dry day', () => {
  const m = makeWorld().map, t = m.tunnels[0], def = VEHICLES.sedan, mid = linePt(t, 16), a = Math.atan2(-t.mouths[0].oy, -t.mouths[0].ox);
  const stop = (x, y, rain) => {
    const s = { x, y, a, vx: Math.cos(a) * 300, vy: Math.sin(a) * 300, av: 0, slip: 0, spin: 0, launch: 0, lz: 0 };
    let d = 0;
    for (let i = 0; i < 200 && Math.hypot(s.vx, s.vy) > 5; i++) { const x0 = s.x, y0 = s.y; vehStep(s, { throttle: -1, steer: 0, hb: false }, DT, m, def, { rain }); d += Math.hypot(s.x - x0, s.y - y0); }
    return d;
  };
  assert.ok(Math.abs(stop(mid.x, mid.y, true) - stop(mid.x, mid.y, false)) < 1, 'the same stopping distance in the tunnel, rain or shine');
});
