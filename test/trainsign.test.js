// The front car's sign (the owner, 10-16: "show the next station on a sign on the train"; client/render/trainsign.js):
// the station it's in at while its doors are open is behind it - the sign shows the next; running, the one it runs to.
// On World v3 a car's line is one of the map's loops (its descriptor's l); on the old city's one line, -1.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { trainSignText, drawTrainSign } from '../client/render/trainsign.js';

const sts = (names) => names.map((n) => ({ name: `${n} Station` }));
const map = { rail: { stations: sts(['Harbor', 'Market']) }, rails: [{ stations: sts(['A']) }, { stations: sts(['North', 'East', 'South']) }] };

test('the sign: the station it runs to, or in at a platform the next one; its own line', () => {
  const car = (l, at, doors) => ({ d: { c: 0, l }, extra: at, flags: doors ? 2 : 0 });
  assert.equal(trainSignText(map, car(1, 1, false)), 'EAST', 'running to East');
  assert.equal(trainSignText(map, car(1, 1, true)), 'SOUTH', 'in at East: next South');
  assert.equal(trainSignText(map, car(1, 2, true)), 'NORTH', 'round the loop');
  assert.equal(trainSignText(map, car(-1, 0, false)), 'HARBOR', 'the old city\'s one line');
  assert.equal(trainSignText({ rails: [] }, car(3, 0, false)), null, 'no such line: no sign');
});

test('drawn: a board over the front car, fading with distance', () => {
  const calls = [];
  const g = new Proxy({}, { get: (o, k) => (k in o ? o[k] : k === 'measureText' ? () => ({ width: 40 }) : (...a) => calls.push([k, ...a])), set: (o, k, v) => { o[k] = v; calls.push(['=' + k, v]); return true; } });
  drawTrainSign(g, { d: { c: 0, l: 1 }, extra: 0, flags: 0, rx: 100, ry: 200, ra: 0 }, map, 1, 0.5);
  assert.ok(calls.some((c) => c[0] === 'fillText' && c[1] === 'NORTH'), 'the station');
  assert.ok(calls.some((c) => c[0] === '=globalAlpha' && c[1] === 0.5), 'faded');
  const tr = calls.find((c) => c[0] === 'translate');
  assert.ok(tr && tr[1] > 100 && tr[2] < 200, 'over the front end');
});
