// Test helpers: an isolated data dir, a fresh world, and fake player connections.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.CLA_DATA_DIR = mkdtempSync(join(tmpdir(), 'cla-test-'));
process.env.CLA_SECRET = 'test-secret';

const { World } = await import('../server/world.js');
const { generateCity } = await import('../shared/map.js');
const { store } = await import('../server/store.js');
const players = await import('../server/systems/players.js');

let cachedMap = null;
export function makeWorld(opts = {}) {
  cachedMap ||= generateCity(1337);
  return new World(cachedMap, { npcBudget: 0, throwErrors: true, ...opts });
}

export function fakeConn() {
  const sent = [];
  return { open: true, buffered: 0, sent, sendJSON: (o) => sent.push(o), sendText: (s) => sent.push(s), sendBinary: () => {}, close() { this.open = false; } };
}

let n = 0;
export function joinPlayer(world, overrides = {}) {
  const pid = (Date.now().toString(16) + (n++).toString(16).padStart(6, '0') + 'aaaaaaaaaaaa').slice(0, 24);
  const prof = store.create(pid);
  Object.assign(prof, overrides);
  const conn = fakeConn();
  const p = players.join(world, conn, prof);
  if (!overrides.keepSpawnProtection) p.ped.protectUntil = 0; // tests start fighting straight away
  return { p, conn, prof };
}

export function run(world, seconds) {
  const steps = Math.round(seconds * 20);
  for (let i = 0; i < steps; i++) world.step();
}

export function teleport(world, ped, x, y) { ped.x = x; ped.y = y; ped.lz = 0; world.place(ped); }

// A long, straight, east-west stretch of ground-level road (px): { x, y, len, hw } - x is the
// west end, y the centre line. Joins the edges of one street across its junctions; prefers
// streets on land over bridges.
export function straightRoad(map, minLen = 900, opts = {}) {
  const byY = new Map();
  for (const e of map.edges) {
    if (e.lvl !== 0 || (opts.kind && e.kind !== opts.kind)) continue;
    const a = e.pts[0], b = e.pts[e.pts.length - 1];
    if (e.pts.some((p) => Math.abs(p.y - a.y) > 8) || Math.abs(b.x - a.x) < 40) continue;
    const k = Math.round(a.y);
    if (!byY.has(k)) byY.set(k, []);
    byY.get(k).push({ x0: Math.min(a.x, b.x), x1: Math.max(a.x, b.x), hw: e.hw, bridge: !!e.bridge });
  }
  const runs = [];
  for (const [y, segs] of byY) {
    segs.sort((p, q) => p.x0 - q.x0);
    let cur = null;
    for (const g of segs) {
      if (cur && g.x0 <= cur.x1 + 2) { cur.x1 = Math.max(cur.x1, g.x1); cur.bridge ||= g.bridge; cur.hw = Math.max(cur.hw, g.hw); continue; }
      if (cur) runs.push(cur);
      cur = { ...g, y };
    }
    if (cur) runs.push(cur);
  }
  const ok = runs.filter((r) => r.x1 - r.x0 >= minLen).sort((p, q) => (p.bridge - q.bridge) || ((q.x1 - q.x0) - (p.x1 - p.x0)));
  const r = ok[0];
  return r ? { x: r.x0, y: r.y, len: r.x1 - r.x0, hw: r.hw, bridge: r.bridge } : null;
}

export { store, players };
