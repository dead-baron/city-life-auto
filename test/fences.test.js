// Fences people can't walk through (the owner, 10-23: shared/fences.js): a low fence holds you walking and you hop it at
// a run (a crouch, then over and down on the far side - the others told: the 'hop' event); a tall one holds you either
// way; carrying a crate you don't hop; the page predicts the same steps (shared/physics.js pedStep with the fences
// registered); a fence with nowhere to land beyond it holds you. The fields' rail fences are fences too.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer, teleport } from './helpers.js';
import { TILE, T, DT } from '../shared/constants.js';
import { IN } from '../shared/input.js';
import { pedStep, newPedState } from '../shared/physics.js';
import { fencesOf, fenceSegments, FENCE_HOP, hopLift } from '../shared/fences.js';
import * as players from '../server/systems/players.js';

const w = makeWorld();
const m = w.map;
// open ground: a 12 x 12 patch of grass with nothing built or solid on it
function openPatch(skip = []) {
  for (let ty = m.y0 + 40; ty < m.y0 + m.h - 40; ty += 3) for (let tx = m.x0 + 40; tx < m.x0 + m.w - 40; tx += 3) {
    let ok = true;
    for (let dy = 0; dy < 12 && ok; dy++) for (let dx = 0; dx < 12 && ok; dx++) {
      const i = m.idx(tx + dx, ty + dy);
      if (m.tiles[i] !== T.GRASS || m.solidProps.has(i) || m.bld[i] >= 0) ok = false;
    }
    if (ok && !skip.some(([x, y]) => Math.abs(x - tx) < 40 && Math.abs(y - ty) < 40) && !fenceSegments(m).some((s) => Math.abs(s.x0 / TILE - tx) < 30 && Math.abs(s.y0 / TILE - ty) < 30)) return [tx, ty];
  }
  return null;
}
const A = openPatch(), B = openPatch([A]);
assert.ok(A && B, 'two open patches of grass');
// a low wooden fence across patch A and a chain-link one across patch B, east-west, 6 tiles in
const fy = (A[1] + 6) * TILE, gy = (B[1] + 6) * TILE;
m.props.push({ t: 'fenceline', kind: 'wood', x: A[0] * TILE, y: fy, tx: 12 * TILE, ty: 0 });
m.props.push({ t: 'chainfence', x: B[0] * TILE, y: gy, tx: 12 * TILE, ty: 0 });

const { p } = joinPlayer(w);
const ped = p.ped;
const drive = (mx, my, secs, bits = 0) => { for (let i = 0; i < Math.round(secs / DT); i++) stepOnce(mx, my, bits); };
// one server step of the player walking with the stick at (mx, my)
function stepOnce(mx, my, bits) {
  const mods = { ...players.pedMods(w, ped), analog: true };
  pedStep(ped, { bits, mx, my, aim: 0 }, DT, m, mods);
}

test('fences: the map\'s fence runs are found, the low and the tall', () => {
  const F = fencesOf(m);
  const ours = F.segs.filter((s) => (s.y0 === fy || s.y0 === gy));
  assert.deepEqual(ours.map((s) => s.k).sort(), [1, 2], 'the wooden fence low, the chain-link tall');
  if ((m.fields || []).length) assert.ok(F.segs.some((s) => s.src < 0), 'the fields\' rail fences are fences');
});

test('fences: walking into a low fence holds you; at a run you hop it - a crouch, then over and down on the far side', () => {
  teleport(w, ped, (A[0] + 6) * TILE, fy - 60); ped.vx = 0; ped.vy = 0;
  drive(0, 0.45, 2);   // (a walk: the stick under FENCE_HOP.run)
  assert.ok(ped.y < fy, `held on the near side walking (y ${ped.y.toFixed(1)}, fence ${fy})`);
  assert.ok(fy - ped.y < 20, 'right up against it');
  // at a run: the hop
  let hopped = false, crouchStill = true, sawLift = 0;
  for (let i = 0; i < 40; i++) {
    const y0 = ped.y, h0 = ped.hop || 0;
    stepOnce(0, 1, 0);
    if (ped.hopNew) { hopped = true; ped.hopNew = 0; }
    if (h0 > 0 && FENCE_HOP.s - h0 < FENCE_HOP.crouch - DT / 2 && Math.abs(ped.y - y0) > 0.01) crouchStill = false;   // (a step that began in the crouch)
    if (ped.hop > 0) sawLift = Math.max(sawLift, hopLift(ped.hop));
  }
  assert.ok(hopped, 'the hop started');
  assert.ok(crouchStill, 'a pause (the crouch) before the vault');
  assert.ok(sawLift > 6, 'up off the ground through it (the page lifts you)');
  assert.ok(ped.y > fy + 11, `down on the far side (y ${ped.y.toFixed(1)})`);
});

test('fences: the others are told of a hop (the hop event)', () => {
  teleport(w, ped, (A[0] + 6) * TILE, fy + 60); ped.vx = 0; ped.vy = 0;
  ped.hop = 0; ped.hopNew = 0;
  w.events.length = 0;
  let ev = null;
  const emit = w.emit.bind(w);
  w.emit = (x, y, e) => { if (e.e === 'hop') ev = e; emit(x, y, e); };
  for (let i = 0; i < 30 && !ev; i++) { stepOnce(0, -1, 0); if (ped.hopNew) w.step(); }
  w.emit = emit;
  assert.ok(ev && ev.id === ped.id, 'a hop event for the ped');
});

test('fences: a tall fence holds you, running or not', () => {
  teleport(w, ped, (B[0] + 6) * TILE, gy - 60); ped.vx = 0; ped.vy = 0; ped.hop = 0;
  drive(0, 1, 2, IN.SPRINT);
  assert.ok(ped.y < gy && !(ped.hop > 0), 'still on the near side of the chain-link');
});

test('fences: carrying a crate you don\'t hop', () => {
  teleport(w, ped, (A[0] + 6) * TILE, fy - 60); ped.vx = 0; ped.vy = 0; ped.hop = 0;
  ped.carrying = 1;
  drive(0, 1, 2);
  ped.carrying = 0;
  assert.ok(ped.y < fy, 'held at the fence with the crate');
});

test('fences: nowhere to land (a wall right behind it) - held, no hop', () => {
  // a fence a tile in front of a building's wall: the far side is the wall
  let b = null;
  for (const q of m.buildings) if (q && !q.gone && q.tw >= 6 && m.tiles[m.idx(q.tx + 2, q.ty - 1)] !== T.BUILDING && m.tiles[m.idx(q.tx + 2, q.ty - 2)] !== T.BUILDING && m.tileAt(q.tx + 2, q.ty - 3) !== T.BUILDING && m.tileAt(q.tx + 2, q.ty - 3) !== T.WATER) { b = q; break; }
  assert.ok(b, 'a building');
  const y = b.ty * TILE - 10;
  const m2 = Object.create(Object.getPrototypeOf(m)); Object.assign(m2, m, { props: [...m.props, { t: 'fenceline', kind: 'picket', x: b.tx * TILE, y, tx: b.tw * TILE, ty: 0 }] });
  const s = newPedState((b.tx + 2.5) * TILE, y - 40);
  for (let i = 0; i < 40; i++) pedStep(s, { bits: 0, mx: 0, my: 1, aim: 0 }, DT, m2, { canMove: true, canSprint: true, speedMul: 1, regenMul: 1, staminaMax: 100, analog: true, canSwim: true });
  assert.ok(!(s.hop > 0) && s.y < y, `held on the near side (y ${s.y.toFixed(1)}, fence ${y})`);
});

test('fences: the page predicts the same hop (the same steps from the same state)', () => {
  const mk = () => { const s = newPedState((A[0] + 6) * TILE, fy - 40); return s; };
  const mods = { canMove: true, canSprint: true, speedMul: 1, regenMul: 1, staminaMax: 100, analog: true, canSwim: true };
  const a = mk(), b = mk();
  const path = [];
  for (let i = 0; i < 30; i++) { pedStep(a, { bits: 0, mx: 0, my: 1, aim: 0 }, DT, m, mods); path.push([a.x, a.y, a.hop]); }
  // (the page's: restarted from a snapshot mid-hop - hop, rdx, rdy carried in the self record - and stepped on)
  for (let i = 0; i < 30; i++) {
    pedStep(b, { bits: 0, mx: 0, my: 1, aim: 0 }, DT, m, mods);
    if (i === 6) { const c = { ...newPedState(b.x, b.y), a: b.a, vx: b.vx, vy: b.vy, stamina: b.stamina, rollT: b.rollT, rdx: b.rdx, rdy: b.rdy, hop: b.hop, prevBits: b.prevBits }; Object.keys(b).forEach((k) => delete b[k]); Object.assign(b, c); }
    assert.deepEqual([b.x, b.y, b.hop], path[i], `step ${i}`);
  }
  assert.ok(path.some((q) => q[2] > 0), 'a hop in it');
});
