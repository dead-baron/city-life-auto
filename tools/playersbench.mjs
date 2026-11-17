// The server's per-player work, measured without sockets: N players walking about like tools/bots.js's (spread over the
// junctions, the stick pushed one way and now and then another, a sprint, a dive, a try at a car), the world stepped,
// and what the per-player systems cost a tick - 'players' (the prompts, findInteraction), 'inputs' (their steps) and
// 'net' (their snapshots, with fake connections). test/serverload.test.js keeps 'players' in a budget with it.
//
//   node tools/playersbench.mjs [players=100] [seconds=20] [--v3]       (--v3: World v3's whole world, ~2.5 min to build)
//
// -> { n, ticks, ms: { tick, players, inputs, net, perPlayer: { players, inputs, net } } }
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';

export async function benchPlayers(map, { n = 100, seconds = 20, warmS = 3, seed = 7, World, players, store, npcBudget = 0 } = {}) {
  const { IN } = await import('../shared/input.js');
  let s = seed >>> 0;
  const rnd = () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const world = new World(map, { npcBudget, rand: rnd });
  const nodes = map.nodes.filter((q) => q && !q.island && Number.isFinite(q.x));
  const bots = [];
  for (let i = 0; i < n; i++) {
    const pid = ('bench' + i.toString(16).padStart(8, '0') + 'aaaaaaaaaaaaaaaa').slice(0, 24);
    const prof = store.create(pid);
    const sent = { n: 0 };
    const conn = { open: true, buffered: 0, sendJSON() { sent.n++; }, sendText() { sent.n++; }, sendBinary() { sent.n++; }, close() { this.open = false; } };
    const p = players.join(world, conn, prof);
    const q = nodes[Math.floor(rnd() * nodes.length)];
    p.ped.x = q.x + (q.half || 0) + 40; p.ped.y = q.y + (q.half || 0) + 40; p.ped.protectUntil = 0; world.place(p.ped);
    p.teleportAt = world.time;
    bots.push({ p, seq: 1, heading: rnd() * 6.28, idle: false });
  }
  const steps = Math.round((warmS + seconds) * 20), warm = Math.round(warmS * 20);
  const prof0 = () => world.profile();
  let acc = null, tickMs = 0, count = 0;
  for (let k = 0; k < steps; k++) {
    for (const b of bots) {
      if (rnd() < 0.02) b.heading += (rnd() - 0.5) * 2;
      if (!b.idle && rnd() < 0.002) b.idle = true; else if (b.idle && rnd() < 0.02) b.idle = false;
      let bits = 0;
      if (rnd() < 0.01) bits |= IN.VEHICLE;
      if (rnd() < 0.05) bits |= IN.SPRINT;
      if (rnd() < 0.005) bits |= IN.DIVE;
      players.queueInput(b.p, { seq: ++b.seq, bits, mx: b.idle ? 0 : Math.cos(b.heading), my: b.idle ? 0 : Math.sin(b.heading), aim: b.heading });
    }
    // (the world's own smoothing of each system's time is an average over ~50 ticks: read the raw times here instead)
    const before = world.sysMs.slice(), netBefore = world.netMs;
    const t0 = performance.now();
    world.step();
    const dt = performance.now() - t0;
    if (k < warm) continue;
    const raw = world.sysMs.map((v, i) => (v - before[i] * 0.98) / 0.02);
    const net = (world.netMs - netBefore * 0.98) / 0.02;
    if (!acc) acc = { sys: raw.map(() => 0), net: 0 };
    raw.forEach((v, i) => { acc.sys[i] += v; });
    acc.net += net; tickMs += dt; count++;
  }
  const names = Object.keys(prof0()).filter((x) => x !== 'net');
  const by = {};
  names.forEach((nm, i) => { by[nm] = acc.sys[i] / count; });
  const r2 = (v) => +v.toFixed(3);
  const ms = { tick: r2(tickMs / count), players: r2(by.players), inputs: r2(by.inputs), net: r2(acc.net / count) };
  ms.perPlayer = { players: r2(ms.players / n), inputs: r2(ms.inputs / n), net: r2(ms.net / n) };
  const top = Object.entries(by).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => `${k} ${v.toFixed(2)}`).join(', ');
  return { n, ticks: count, ms, top };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.env.CLA_DATA_DIR ||= mkdtempSync(join(tmpdir(), 'cla-bench-'));
  process.env.CLA_SECRET ||= 'bench-secret';
  const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const n = Number(args[0] || 100), seconds = Number(args[1] || 20), v3 = process.argv.includes('--v3');
  const { World } = await import('../server/world.js');
  const players = await import('../server/systems/players.js');
  const { store } = await import('../server/store.js');
  const t0 = performance.now();
  const map = v3 ? (await (await import('../server/world3.js')).buildWorld3(1337, { log: () => {} })).map : (await import('../shared/map.js')).generateCity(1337);
  console.log(`${v3 ? 'World v3' : 'today\'s world'} built in ${((performance.now() - t0) / 1000).toFixed(1)} s`);
  const npc = process.argv.includes('--npc') ? 700 : 0;
  const r = await benchPlayers(map, { n, seconds, World, players, store, npcBudget: npc });
  console.log(`${r.n} players, ${r.ticks} ticks: tick ${r.ms.tick} ms; players ${r.ms.players} ms (${r.ms.perPlayer.players}/player), inputs ${r.ms.inputs} ms (${r.ms.perPlayer.inputs}/player), net ${r.ms.net} ms (${r.ms.perPlayer.net}/player)`);
  console.log(`systems: ${r.top}`);
  process.exit(0);
}
