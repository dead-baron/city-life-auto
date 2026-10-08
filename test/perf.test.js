// Performance budgets (the user, 2026-10-07: "make sure everything is optimizing across all devices in our build and
// future builds"): what a phone pays to get into the city and keep it drawn - the code each part of the page loads,
// the title screen's assets, building the city and baking chunks (as multiples of a CPU yardstick, so a slow machine
// doesn't fail it and a real slowdown does), what the city and a kept chunk weigh. Budgets: tools/perf.mjs BUDGET;
// `node tools/perf.mjs` prints the full report. And the loading's own guarantees: the city a browser keeps is the
// city, the renderer stays out of the page's first load, version.json knows the world's and the art's code.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BUDGET, codeReport, assetReport, cpuReport, closure, overBudget } from '../tools/perf.mjs';
import { worldHash, artHash, canonicalHash, codeHash, ART_SKIP } from '../tools/stamp-version.mjs';
import { generateCity, cityData, cityFromData, CityMap, mapSignature } from '../shared/map.js';

const say = (list) => list.map(([w, v, b, a]) => `${w}: ${v} (budget ${b}) - ${a}`).join('\n');

test('budgets: the code each part of the page loads, and the title screen\'s assets', () => {
  const code = codeReport(), assets = assetReport();
  const over = overBudget(code, assets, null);
  assert.equal(over.length, 0, `over budget (tools/perf.mjs):\n${say(over)}`);
  // the page's first load has no renderer in it: that comes once the city is in (main.js startArt2)
  assert.ok(!closure(['client/main.js']).some((f) => f.startsWith('client/art2/game/')), 'main.js loads the art v2 renderer lazily');
});

test('budgets: building the city and baking chunks, as multiples of a CPU yardstick; what the city and a kept chunk weigh', async () => {
  const cpu = await cpuReport();
  const over = overBudget({ page: { files: 0, kb: 0 }, city: { files: 0, kb: 0 }, renderer: { files: 0, kb: 0 }, bake: { files: 0, kb: 0 } }, { kb: 0 }, cpu);
  assert.equal(over.length, 0, `over budget (tools/perf.mjs; yardstick ${cpu.yardMs} ms, city ${cpu.cityMs} ms, bakes ${cpu.bakeMs} ms):\n${say(over)}`);
  assert.ok(BUDGET.cityX > 0 && BUDGET.bakeX > 0);
});

let city = null;
const CITY = () => (city ||= generateCity(1337));
test('the city a browser keeps is the city: a structured clone of cityData, made a CityMap again, has every field the same', () => {
  const m = CITY();
  const back = cityFromData(structuredClone(cityData(m)));
  assert.ok(back instanceof CityMap, 'a CityMap again (its methods back)');
  // every field a clone can carry comes back the same (shallow types and sizes here; the bits: the signature below)
  for (const k of Object.keys(m)) {
    const a = m[k], b = back[k];
    if (typeof a === 'function') { assert.equal(b, undefined, `${k}: a function only generation uses (cityData leaves it out)`); continue; }
    assert.equal(typeof b, typeof a, `${k}: same kind of value`);
    if (a && typeof a === 'object') {
      assert.equal(Object.getPrototypeOf(b) === Object.getPrototypeOf(a) || (ArrayBuffer.isView(a) && b.constructor === a.constructor), true, `${k}: the same kind of object (a class instance in the city doesn't survive a clone - make it plain data or restore it in cityFromData)`);
      if (Array.isArray(a) || ArrayBuffer.isView(a)) assert.equal(b.length, a.length, `${k}: same length`);
      if (a instanceof Map || a instanceof Set) assert.equal(b.size, a.size, `${k}: same size`);
    } else assert.ok(Object.is(a, b), `${k}: same value`);
  }
  // what the nature sites hang on the city survives (the wild biome lookup the server's wildlife uses)
  assert.equal(typeof back.terrainCls.at, 'function');
  for (const [tx, ty] of [[100, 100], [700, 900], [1200, 300]]) assert.equal(back.terrainCls.at(tx, ty), m.terrainCls.at(tx, ty));
  // every value, however deep, the same (a canonical hash of each); and the signature worked out again from the clone's
  // own data is the server's
  assert.equal(canonicalHash(cityData(back)), canonicalHash(cityData(m)), 'the same world, value for value');
  delete back._sig;
  assert.equal(mapSignature(back), mapSignature(m), 'the same signature');
});

test('version.json knows the world and the art (run node tools/stamp-version.mjs after changing either)', async () => {
  const v = JSON.parse(readFileSync(new URL('../version.json', import.meta.url)));
  const world = (await worldHash(undefined, CITY())).hash;
  assert.equal(v.world, world, 'the world changed since version.json was stamped: browsers would keep using the city they built before');
  assert.equal(v.art, (await artHash(undefined, world)).hash, 'the art changed since version.json was stamped: browsers would keep showing chunks baked by the old art');
  assert.equal(v.hashes.length, v.files.length, 'a hash for every file (boot.js fetches only what changed)');
  // the gameplay numbers are left out of the art hash (a rule tweak keeps every browser's baked chunks): so the art
  // itself mustn't read them
  const art = codeHash('client/art2/game/worker.js', undefined, ART_SKIP).files;
  assert.ok(!art.includes('shared/rules.js'));
  for (const f of art.filter((q) => q.startsWith('client/art2/'))) assert.ok(!/from\s+['"][./]*(shared\/)?rules\.js['"]/.test(readFileSync(new URL('../' + f, import.meta.url), 'utf8')), `${f} reads shared/rules.js: the art hash wouldn't see a change to it (tools/stamp-version.mjs ART_SKIP)`);
});

test('device reports: one a connection, cleaned up, kept newest first and listed at /perf', async () => {
  const { makeWorld, fakeConn } = await import('./helpers.js');
  const { createSession } = await import('../server/session.js');
  const { store } = await import('../server/store.js');
  const perf = await import('../server/perfreports.js');
  const w = makeWorld();
  const prof = store.create('beef00' + Date.now().toString(16).padStart(18, '0'));
  const conn = fakeConn();
  const s = createSession(w, conn, { seed: 1337, dev: false, maxPlayers: 10, login: () => ({ profile: prof, token: 't' }) });
  s.onMessage(JSON.stringify({ t: 'hello', token: null }), false);
  const r = { kind: 'phone', gpu: 'Mali-G710\u0007', ua: 'Mozilla/5.0 (Linux; Android 14; Pixel 7 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36', cores: 8, mem: 8, preset: 'ultra', w: 892, h: 412, dpr: 2, scale: 0.85, steps: 1,
    at: { code: 310, welcome: 600, city: 1000, screen: 3000, 'bad key!': 5, nope: 'x' }, ms: { city: 250 }, city: 'cache', fps: 58, p50: 16.7, p95: 1e9, bake: 1450, kept: 12, workers: 4 };
  s.onMessage(JSON.stringify({ t: 'perf', r }), false);
  s.onMessage(JSON.stringify({ t: 'perf', r: { ...r, preset: 'low' } }), false);
  assert.equal(w.perfReports.length, 1, 'one report a connection');
  const c = w.perfReports[0];
  assert.equal(c.gpu, 'Mali-G710', 'control characters gone');
  assert.equal(c.p95, 1000, 'numbers kept in range');
  assert.deepEqual(Object.keys(c.at).sort(), ['city', 'code', 'nope', 'screen', 'welcome'], 'only plain keys');
  assert.equal(c.at.nope, 0);
  const text = perf.reportsText(w);
  assert.match(text, /Android 14 Pixel 7 Pro · Chrome 128/);
  assert.match(text, /whole screen drawn at 3\.0 s/);
  assert.match(text, /read back, 0\.3 s/);
  assert.match(text, /sharpness 85% \(1 step down\)/);
  for (let i = 0; i < 70; i++) perf.addReport(w, { ...r, fps: i });
  assert.equal(w.perfReports.length, 60, 'the latest sixty');
  assert.equal(w.perfReports[0].fps, 69, 'newest first');
  assert.equal(perf.cleanReport('junk'), null);
});
