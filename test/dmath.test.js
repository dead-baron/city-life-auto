// Deterministic maths for world generation (shared/dmath.js). The server and every client build the same map from the
// seed, and a client whose map comes out different takes itself for an outdated page and reloads - but Math.sin & co.
// are only approximated by the language spec, and Safari's (every browser on an iPhone or iPad) differ from Chrome's
// and Node's in the last bit: iPhones reloaded every 30 seconds and never got in. So the world is built with ports of
// V8's own functions in plain arithmetic, the same in every engine.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dsin, dcos, dtan, datan, datan2, dhypot, withDeterministicMath } from '../shared/dmath.js';

const SHARED = fileURLToPath(new URL('../shared/', import.meta.url));
const CHILD = fileURLToPath(new URL('./dmath-world.mjs', import.meta.url));
const world = (...args) => new Promise((res, rej) => execFile(process.execPath, [CHILD, ...args], { maxBuffer: 1 << 20 }, (e, out) => (e ? rej(e) : res(JSON.parse(out)))));

// random doubles of every size (2^lo .. 2^hi), both signs
let seed = 20261007;
const rnd = () => { seed = (Math.imul(seed, 1103515245) + 12345) >>> 0; return seed / 4294967296; };
const F64 = new Float64Array(1), U32 = new Uint32Array(F64.buffer);
function randDouble(lo, hi) {
  const e = lo + Math.floor(rnd() * (hi - lo));
  U32[0] = (rnd() * 4294967296) >>> 0;
  U32[1] = (((e + 1023) & 0x7ff) << 20) | ((rnd() * 1048576) >>> 0);
  return (rnd() < 0.5 ? -1 : 1) * F64[0];
}
const SPECIAL = [0, -0, 1, -1, Math.PI, -Math.PI, Math.PI / 2, Math.PI / 4, 3 * Math.PI / 4, 5e-324, 1e-310, 2 ** -28, 2 ** -27, 0.4375, 0.6744, 1.1875, 2.4375,
  2 ** 19 * Math.PI / 2, 2 ** 20 * Math.PI / 2, 1e22, 1e300, Number.MAX_VALUE, Infinity, -Infinity, NaN];
const BANDS = [[-40, 0, 20000], [0, 11, 60000], [11, 21, 20000], [21, 70, 10000], [70, 1020, 10000]];

test('the deterministic functions give exactly what V8 (Chrome, Node) gives, to the bit', () => {
  for (const [name, d, v8] of [['sin', dsin, Math.sin], ['cos', dcos, Math.cos], ['tan', dtan, Math.tan], ['atan', datan, Math.atan]]) {
    let bad = 0, first = null;
    const check = (x) => { if (!Object.is(d(x), v8(x))) { bad++; first ||= x; } };
    for (const x of SPECIAL) check(x);
    for (const [lo, hi, n] of BANDS) for (let i = 0; i < n; i++) check(randDouble(lo, hi));
    assert.equal(bad, 0, `${name}: ${bad} differ (first at ${first})`);
  }
  for (const [name, d, v8] of [['atan2', datan2, Math.atan2], ['hypot', dhypot, Math.hypot]]) {
    let bad = 0, first = null;
    const check = (y, x) => { if (!Object.is(d(y, x), v8(y, x))) { bad++; first ||= [y, x]; } };
    for (const y of SPECIAL) for (const x of SPECIAL) check(y, x);
    for (let i = 0; i < 60000; i++) check(randDouble(-30, 30), randDouble(-30, 30));
    for (let i = 0; i < 10000; i++) check(randDouble(-600, 600), randDouble(-600, 600));
    for (let i = 0; i < 20000; i++) check(Math.round(randDouble(0, 15)), Math.round(randDouble(0, 15)));   // (grid steps: the map's own)
    assert.equal(bad, 0, `${name}: ${bad} differ (first at ${first})`);
  }
  assert.equal(dhypot(), Math.hypot()); assert.equal(dhypot(-3), Math.hypot(-3)); assert.equal(dhypot(1, 2, 3), Math.hypot(1, 2, 3));
});

test('withDeterministicMath swaps them in for the call (nested too) and always puts the engine\'s own back', () => {
  const sin0 = Math.sin, hyp0 = Math.hypot;
  let inner = null;
  assert.equal(withDeterministicMath(() => withDeterministicMath(() => { inner = Math.sin; return Math.hypot(3, 4); })), 5);
  assert.equal(inner, dsin, 'swapped in');
  assert.ok(Math.sin === sin0 && Math.hypot === hyp0, 'and back');
  assert.throws(() => withDeterministicMath(() => { throw new Error('in the middle'); }));
  assert.ok(Math.sin === sin0 && Math.hypot === hyp0, 'back after a throw too');
});

test('the world comes out the same whatever the engine\'s own maths library says (Safari\'s differs from Chrome\'s)', async () => {
  const [a, b] = await Promise.all([world(), world('nudge')]);
  assert.equal(b.sig, a.sig, 'the signature the client checks on joining');
  assert.equal(b.hash, a.hash, 'every field of the map, to the bit');
  assert.deepEqual(a.used, {}, `building it calls none of the engine's approximated functions (not even while the modules load), nor Math.random: ${JSON.stringify(a.used)}`);
});

test('the world-building code uses ** only for squares (x ** 2 is x * x in every engine; other powers are not)', () => {
  const bad = [];
  for (const f of readdirSync(SHARED).filter((n) => n.endsWith('.js'))) {
    const src = readFileSync(SHARED + f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' ')).replace(/\/\/[^\n]*/g, '');
    const lines = src.split('\n');
    lines.forEach((line, i) => { for (const m of line.matchAll(/\*\*\s*([^\s;),\]}]+)/g)) if (!/^2(?![\d.])/.test(m[1])) bad.push(`shared/${f}:${i + 1}: ** ${m[1]}`); });
  }
  assert.deepEqual(bad, [], 'use a multiplication (or a helper in shared/dmath.js) for other powers');
});
