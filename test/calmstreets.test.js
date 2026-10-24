// World v3, headless, as the server runs it (the heavy lock: one build, about 100 s and 2 GB):
//  - the NPC boats keep to real water (the owner's notes, 10-22: "NPC boats showing up in city ponds"): the boaters'
//    and the patrol boats' sea points only on a body of water of BOATERS_WATER tiles or more, the anglers on a lake of
//    some size (server/systems/boats.js);
//  - a player standing still on a calm street (Midtown) for a few in-game minutes: it stays calm (the owner's notes,
//    10-22: "if you stand in one place for not too long it always seems to fall apart into a chaotic scene") - nobody
//    set alight by passers-by, no cars careering off in a panic after bumping each other, few fights, few deaths.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { joinPlayer, teleport, players } from './helpers.js';
import { World } from '../server/world.js';
import { buildWorld3 } from '../server/world3.js';
import { T, TILE, K } from '../shared/constants.js';
import { MAIN_STATIONS3 } from '../shared/world3-layout.js';
import * as boats from '../server/systems/boats.js';

const { map: M } = await buildWorld3(1337, { log: () => {} });

test('World v3: NPC boats only on real water - never a park\'s pond, a plaza\'s pool or a fountain', () => {
  const w = new World(M, { npcBudget: 0, throwErrors: true });
  let small = 0, big = 0;
  const ponds = [];
  for (const p of M.seaPoints) {
    const n = boats.waterSize(M, p.x, p.y, 2500);
    if (n < 2500) { small++; ponds.push(p); assert.equal(boats.bigWater(w, p), false, `a pond's point (${Math.round(p.x / TILE)}, ${Math.round(p.y / TILE)}): no boats`); }
    else if (big++ < 400) assert.equal(boats.bigWater(w, p), true);
  }
  assert.ok(small >= 10 && big > 1000, `the sea points: ${small} on ponds (no boats), plenty on real water`);
  // the anglers: on lakes of 300 tiles of water or more
  for (const s of boats.fishSpots(w)) if (!s.pocket) assert.ok(boats.waterSize(M, s.x, s.y, 300) >= 300, 'an angler\'s lake');
  // a player by the biggest of the ponds, a minute: no boat comes onto it
  const pond = ponds.reduce((a, b) => (boats.waterSize(M, b.x, b.y, 2500) > boats.waterSize(M, a.x, a.y, 2500) ? b : a));
  const w2 = new World(M, { npcBudget: 300, throwErrors: true });
  const { p } = joinPlayer(w2);
  let spot = null;
  for (let r = 1; r < 40 && !spot; r++) for (let a = 0; a < 16 && !spot; a++) {
    const x = pond.x + Math.cos(a * 0.39) * r * TILE, y = pond.y + Math.sin(a * 0.39) * r * TILE, t = M.tileAtPx(x, y);
    if (t === T.SIDEWALK || t === T.PLAZA || t === T.GRASS) spot = { x, y };
  }
  teleport(w2, p.ped, spot.x, spot.y);
  for (let i = 0; i < 20 * 60; i++) { players.queueInput(p, { seq: i + 1, bits: 0, mx: 0, my: 0, aim: 0 }); w2.step(); }
  for (const v of w2.entities.values()) if (v.kind === K.VEH && v.def.kind === 'boat' && v.ai) assert.ok(boats.waterSize(M, v.x, v.y, 2500) >= 300, `an NPC boat (${v.ai.kind}, ${v.model}) on a pond at (${Math.round(v.x / TILE)}, ${Math.round(v.y / TILE)})`);
});

test('World v3: a player standing still on a calm street (Midtown) for eight in-game minutes - it stays calm', { timeout: 900000 }, () => {
  const w = new World(M, { npcBudget: 700, throwErrors: true });
  w.loopTime = 120;   // (the morning)
  const { p } = joinPlayer(w);
  const st = MAIN_STATIONS3.find((q) => q.name === 'Midtown');
  let at = null;
  for (let k = 0; k < 60 && !at; k++) for (let dy = -k; dy <= k && !at; dy++) for (let dx = -k; dx <= k; dx++) {
    const tx = st.at[0] + dx, ty = st.at[1] + 12 + dy;
    if (Math.max(Math.abs(dx), Math.abs(dy)) === k && M.tileAt(tx, ty) === T.SIDEWALK) { at = { x: (tx + 0.5) * TILE, y: (ty + 0.5) * TILE }; break; }
  }
  teleport(w, p.ped, at.x, at.y);
  p.ped.protectUntil = 0;
  const R = 640, ev = {};
  const emit = w.emit.bind(w);
  w.emit = (x, y, e) => { if (Math.hypot(x - at.x, y - at.y) < R) ev[e.e] = (ev[e.e] || 0) + 1; return emit(x, y, e); };
  const still = new Map(), was = new Map();
  let fights = 0, peakPanic = 0, peakStuck = 0, stuckSum = 0, samples = 0;
  for (let t = 1; t <= 8 * 60 * 20; t++) {
    players.queueInput(p, { seq: t, bits: 0, mx: 0, my: 0, aim: 0 });
    w.step();
    if (p.ped.dead) p.ped.hp = p.ped.maxHp;
    if (t % 10) continue;
    for (const q of w.query(at.x, at.y, R, K.PED)) {   // (a fight that wasn't a happening's street fight: who started on whom)
      if (!q.npc || q.dead) continue;
      if (q.npc.state === 'fight' && was.get(q.id) !== 'fight' && !q.npc.happening) fights++;
      was.set(q.id, q.npc.state);
    }
    if (t % 20) continue;
    let panic = 0, stuck = 0;
    for (const v of w.query(at.x, at.y, R, K.VEH)) {
      const d = v.seats[0] && w.get(v.seats[0]);
      if (v.ai && v.ai.panicUntil > w.time) panic++;
      if (d && d.npc && Math.hypot(v.vx, v.vy) < 8) still.set(v.id, (still.get(v.id) || 0) + 1); else still.delete(v.id);
    }
    for (const [id, n] of still) if (n >= 30 && w.get(id)) stuck++;
    peakPanic = Math.max(peakPanic, panic); peakStuck = Math.max(peakStuck, stuck); stuckSum += stuck; samples++;
  }
  const got = { ignite: ev.ignite || 0, death: ev.death || 0, crash: ev.crash || 0, explode: ev.explode || 0, fights, peakPanic, peakStuck, avgStuck: +(stuckSum / samples).toFixed(1) };
  // (before the fixes, 15 minutes there: 370 people set alight, 92 dead, 406 crashes, 7 cars blown up, cars careering
  // off in a panic after every knock, fights spreading, a dozen cars locked at the corner by the station for minutes;
  // after, 8 minutes: none set alight, nobody dead, 46 knocks, no panics or fights, 0.7 cars stuck on average - see
  // docs/devlog-pending/b1b.md)
  assert.ok(got.ignite <= 2, `people set alight: ${JSON.stringify(got)}`);
  assert.ok(got.death <= 4, `deaths: ${JSON.stringify(got)}`);
  assert.ok(got.crash <= 100 && got.explode <= 1, `crashes: ${JSON.stringify(got)}`);
  assert.ok(got.fights <= 4, `fights breaking out: ${JSON.stringify(got)}`);
  assert.ok(got.peakPanic <= 1, `cars careering off in a panic: ${JSON.stringify(got)}`);
  assert.ok(got.peakStuck <= 10 && got.avgStuck <= 3, `cars stuck (30 s and more) round the player: ${JSON.stringify(got)}`);
  assert.equal(w.errorCounts?.size || 0, 0);
});
