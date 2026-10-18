// Offline practice (2026-10-18: "PRACTICE OFFLINE never gets into the city"). Since World v3 went live the page boots
// World v3's world - only ever its window round the player, downloaded from the game server - while the practice
// worker (client/practice-worker.js) runs today's world: World v3's whole world is more than a phone can hold or build
// (server/world3.js: about 47 s and a 1.6 GB peak here; today's city about 5 s and 0.3 GB). Its welcome, which has no
// `world`, went through main.js worldChanged like a server's: noted 'today' and loaded the page again - the title
// screen, every time. Now the worker hands the page the city it simulates, and the page plays that one.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Worker } from 'node:worker_threads';
import { cityFromData, mapSignature } from '../shared/mapcore.js';
import { MAP_W, MAP_H } from '../shared/constants.js';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

// the practice worker as the browser runs it: in a thread of its own, with a worker's postMessage / onmessage
function practiceWorker() {
  const url = new URL('../client/practice-worker.js', import.meta.url).href;
  const shim = `
    const { parentPort } = require('node:worker_threads');
    let on = null;
    globalThis.postMessage = (m, t) => parentPort.postMessage(m, t);
    Object.defineProperty(globalThis, 'onmessage', { get: () => on, set: (f) => { on = f; }, configurable: true });
    parentPort.on('message', (data) => { if (on) on({ data }); });
    import(${JSON.stringify(url)}).catch((e) => { console.error(e); process.exit(1); });`;
  const w = new Worker(shim, { eval: true });
  const got = [], wait = [];
  const check = () => { for (const q of wait.splice(0)) if (!q()) wait.push(q); };
  w.on('message', (m) => { got.push(m); check(); });
  w.on('error', (e) => { got.push({ error: e }); check(); });
  // the first message after `from` that pick() takes
  const next = (pick, from = 0, ms = 120000) => new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('the practice worker said nothing more')), ms);
    const q = () => { for (let i = from; i < got.length; i++) { if (got[i] && got[i].error) { clearTimeout(t); rej(got[i].error); return true; } if (pick(got[i])) { clearTimeout(t); res({ m: got[i], i }); return true; } } return false; };
    if (!q()) wait.push(q);
  });
  return { w, got, next };
}

test('the practice worker hands the page the city it simulates - today\'s world, whole - before its welcome, and the welcome\'s signature is that city\'s', async () => {
  const P = practiceWorker();
  try {
    const { m: first } = await P.next(() => true);
    assert.ok(first && first.city && first.ms >= 0, 'the city ({ city, ms }) is the first thing it says: the page has it before the welcome');
    const city = cityFromData(first.city);
    delete city._sig;   // (worked out again from what was handed over, not taken from it)
    assert.equal(city.seed, 1337);
    assert.deepEqual([city.x0, city.y0, city.w, city.h], [0, 0, MAP_W, MAP_H], 'today\'s world, all of it - not a window of World v3\'s');
    assert.ok(!city.world3hand, 'not World v3\'s world');
    await P.next((m) => m === '{"t":"ready"}');
    P.w.postMessage(JSON.stringify({ t: 'hello', token: null }));
    const { m: wel } = await P.next((m) => typeof m === 'string' && m.startsWith('{"t":"welcome"'));
    const welcome = JSON.parse(wel);
    assert.equal(welcome.practice, true);
    assert.equal(welcome.world, undefined, 'practice says no world: it isn\'t the server\'s (main.js keeps it out of worldChanged)');
    assert.equal(welcome.seed, 1337);
    assert.equal(welcome.sig, mapSignature(city), 'the page checks the welcome\'s signature against its city: a city that isn\'t the simulated one reloads the page (outdatedBuild)');
    // and it runs: snapshots come
    await P.next((m) => m instanceof ArrayBuffer || ArrayBuffer.isView(m), 0, 30000);
  } finally { await P.w.terminate(); }
});

test('the page plays practice\'s own city: its welcome never reaches worldChanged, and the online city stops', () => {
  const main = read('client/main.js');
  const welcome = main.slice(main.indexOf("case 'welcome':"), main.indexOf("case 'sp':"));
  assert.match(welcome, /if \(m\.practice\) practiceWorld\(m\);[^\n]*\n\s*else if \(worldChanged\(m\)\) break;[^\n]*\n\s*else if \(holdForCity\(m\)\) break;/,
    'a practice welcome takes the practice city and skips worldChanged (it would note \'today\' and reload the page) and holdForCity (the online city)');
  const sock = main.slice(main.indexOf('class WorkerSocket'), main.indexOf('function startPractice'));
  assert.match(sock, /if \(e\.data && e\.data\.city\) \{ this\.city = e\.data\.city;/, 'the worker\'s city is kept for the welcome');
  const pw = main.slice(main.indexOf('function practiceWorld('), main.indexOf('function cityIn('));
  assert.match(pw, /setupWorld\(m\.seed, false, cityFromData\(data\)\)/, 'practiceWorld sets the handed city up');
  assert.match(pw, /S\.win = null;/, 'World v3\'s window, if the page had one, is dropped');
  const sp = main.slice(main.indexOf('function startPractice('), main.indexOf('function connect('));
  assert.match(sp, /job\.taken = true; job\.map = null; try \{ job\.worker\.terminate\(\);/, 'boot.js\'s city worker stops: it doesn\'t build or download a city beside the practice worker\'s');
  assert.match(sp, /clearInterval\(S\.winTimer\)/, 'the window isn\'t moved any more');
  const sw = main.slice(main.indexOf('function setupWorld('), main.indexOf('function keepWindow('));
  assert.match(sw, /if \(given\) \{ S\.map = given; S\.mapFrom = 'practice';/, 'setupWorld takes the city given');
  assert.match(main, /artKey: \(!S\.practice && window\.CLA_ART_KEY\) \|\| null/, 'practice keeps no baked chunks under the online world\'s art key');
  // the worker never builds World v3's whole world (a phone can't) and needs no server
  const wk = read('client/practice-worker.js');
  assert.match(wk, /const map = generateCity\(SEED\);/);
  assert.ok(!/world3/.test(wk.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n')), 'no World v3 build in the practice worker');
});
