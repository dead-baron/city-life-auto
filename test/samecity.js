// The city a browser got is the city (test/perf.test.js: a structured clone of cityData made a CityMap again;
// test/regions.test.js: the server's region files assembled): every field a clone can carry the same kind of value,
// size and value, however deep (a canonical hash of each, shared objects included), and the signature worked out
// again from the copy's own data is the server's. omit: fields left out on purpose (they must be absent).
import assert from 'node:assert/strict';
import { canonicalHash } from '../tools/stamp-version.mjs';
import { cityData, mapSignature } from '../shared/map.js';

export function assertSameCity(m, back, { omit = [] } = {}) {
  for (const k of Object.keys(m)) {
    const a = m[k], b = back[k];
    if (typeof a === 'function' || omit.includes(k)) { assert.equal(b, undefined, `${k}: ${typeof a === 'function' ? 'a function only generation uses (cityData leaves it out)' : 'left out'}`); continue; }
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
  const want = cityData(m);
  for (const k of omit) delete want[k];
  assert.equal(canonicalHash(cityData(back)), canonicalHash(want), 'the same world, value for value');
  delete back._sig;
  assert.equal(mapSignature(back), mapSignature(m), 'the same signature');
}
