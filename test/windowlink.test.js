// World v3's window swap: the city worker sends each new window to the bake workers itself, over a channel each
// (client/art2/game/pool.js linkWindows, client/worldgen.js, worker.js windowNo) - only the window's number goes from
// the page. Before, the page's thread cloned the whole window once per bake worker at every region crossing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

class FakeWorker {
  constructor() { this.onmessage = null; this.onerror = null; this.inbox = []; this.dead = false; }
  postMessage(m) { if (this.dead) return; this.inbox.push(m); if (m.id === 0) return; setTimeout(() => { if (!this.dead && this.onmessage) this.onmessage({ data: { id: m.id, ok: true, result: { op: m.op }, ms: 1 } }); }, 1); }
  terminate() { this.dead = true; }
}
globalThis.Worker = FakeWorker;
const { WorkerPool } = await import('../client/art2/game/pool.js');

test('linked: a window swap sends the bake workers its number, not the window; a worker that goes is unlinked', async () => {
  const pool = new WorkerPool({ size: 3, url: 'x', timing: { respawn: [5, 10], stuck: 60, initStuck: 200, watch: 15 } });
  await pool.init({ big: new Uint8Array(1e6) });
  const city = { got: [], postMessage(m) { this.got.push(m); } };
  const M = { tiles: new Uint8Array(4e6) };
  pool.reworld(M, 0);
  for (const w of pool.workers) assert.equal(w.wk.inbox.at(-1).args.M, M, 'not linked: the window itself, as before');
  pool.linkWindows(city);
  assert.equal(city.got.filter((m) => m.bakePort).length, 3, 'a channel to the city worker for each bake worker');
  for (const w of pool.workers) assert.ok(w.wk.inbox.some((m) => m.op === 'windowPort' && m.args.port), 'and its other end to the bake worker');
  pool.reworld(M, 7);
  for (const w of pool.workers) { const m = w.wk.inbox.at(-1); assert.equal(m.op, 'reworld'); assert.deepEqual(m.args, { wid: 7 }, 'only the number'); }
  assert.equal(pool.initArgs.M, M, 'kept for a worker that starts later');
  pool._kill(pool.workers[0], 'test');
  assert.ok(city.got.some((m) => m.unport), 'the city worker stops sending to it');
  // its replacement: this window with its start (init), the next ones over a channel of its own
  await new Promise((r) => setTimeout(r, 60));
  const nw = pool.workers[0];
  assert.ok(nw.alive && nw.linked, 'linked');
  assert.equal(nw.wk.inbox.find((m) => m.op === 'init').args.M, M);
  assert.equal(city.got.filter((m) => m.bakePort).length, 4);
  pool.dispose();
});

test('the city worker sends the bake workers their copies before the page\'s; the bake worker waits for the one named', () => {
  const g = readFileSync(new URL('../client/worldgen.js', import.meta.url), 'utf8'), w = readFileSync(new URL('../client/art2/game/worker.js', import.meta.url), 'utf8');
  assert.ok(g.indexOf('port.postMessage({ wid, data })') < g.indexOf('self.postMessage({ window: true, data: page, wid:'), 'before the page\'s (whose layers are moved to it)');
  assert.match(w, /ready = before\.then\(\(\) => windowNo\(args\.wid\)\)/, 'what follows a reworld waits for its window');
  const main = readFileSync(new URL('../client/main.js', import.meta.url), 'utf8');
  assert.match(main, /swapWorld\(cityFromData\(m\.data\), m\.wid \|\| 0(, parts)?\)/);
  assert.match(g, /page = \{ \.\.\.data, steady: WIN\.steady \}/, 'the page\'s copy without the fields every window has the same (client/worldwindow.js windowSteady)');
  assert.match(main, /for \(const k of st\) m\.data\[k\] = S\.map\[k\]/, '...which the page keeps from the window before');
  // (the window is checked against the page's city by its seed before the rest is taken: the seed always comes with it -
  // left out, every moved window was dropped and the player drove into the old window's walls)
  const seedAt = main.indexOf('(m.data.seed >>> 0) !== S.map.seed'), mergeAt = main.indexOf('for (const k of st) m.data[k] = S.map[k]');
  assert.ok(seedAt > 0 && mergeAt > 0);
  const ww = readFileSync(new URL('../client/worldwindow.js', import.meta.url), 'utf8');
  assert.ok(seedAt > mergeAt || /new Set\(\[[^\]]*'seed'[^\]]*\]\)/.test(ww.slice(ww.indexOf('export function windowSteady'))), 'the seed is never left out');
  assert.match(main, /cityWorker: \(\) => \(S\.win && window\.CLA_WORLD && window\.CLA_WORLD\.worker\) \|\| null/);
});
