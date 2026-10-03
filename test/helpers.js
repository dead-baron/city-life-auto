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
  return { p, conn, prof };
}

export function run(world, seconds) {
  const steps = Math.round(seconds * 20);
  for (let i = 0; i < steps; i++) world.step();
}

export function teleport(world, ped, x, y) { ped.x = x; ped.y = y; world.place(ped); }

export { store, players };
