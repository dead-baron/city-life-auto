// Out in the country (shared/countryside.js): every set piece finds room, gets a road in that joins
// the network, and is built - and the poles, wires and runway lights go where they should.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld } from './helpers.js';
import { DISTRICTS } from '../shared/map.js';
import { SITES } from '../shared/countryside.js';
import { T, TILE, MAP_W } from '../shared/constants.js';

test('country set pieces: all placed on open ground, each reachable by road, and built', () => {
  const w = makeWorld();
  const m = w.map;
  assert.equal(m.countrySites.length, SITES.length, `placed ${m.countrySites.map((s) => s.name)}`);
  // no two overlap, none sits on a road it didn't make, none is under water
  for (let i = 0; i < m.countrySites.length; i++) {
    const a = m.countrySites[i];
    for (let j = i + 1; j < m.countrySites.length; j++) {
      const b = m.countrySites[j];
      assert.ok(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y, `${a.name} overlaps ${b.name}`);
    }
    for (let ty = a.y; ty < a.y + a.h; ty++) for (let tx = a.x; tx < a.x + a.w; tx++) {
      const t = m.tiles[ty * MAP_W + tx];
      assert.ok(t !== T.WATER && t !== T.DEEP, `${a.name} is in the water at ${tx},${ty}`);
    }
  }
  // each one's access road ends inside it and is joined to the rest of the network
  const N = m.nodes.length;
  const start = m.nodes.findIndex((n) => n.lvl === 0 && Math.hypot(n.x - 800 * 32, n.y - 520 * 32) < 40 * 32);
  const seen = new Uint8Array(N); const st = [start]; seen[start] = 1;
  while (st.length) { const u = st.pop(); for (const v of Object.values(m.nodes[u].links)) if (!seen[v]) { seen[v] = 1; st.push(v); } }
  for (const s of m.countrySites) {
    const inside = m.nodes.filter((n) => n.lvl === 0 && n.x > s.x * TILE && n.x < (s.x + s.w) * TILE && n.y > s.y * TILE && n.y < (s.y + s.h) * TILE);
    assert.ok(inside.length >= 1, `${s.name}: no road in`);
    assert.ok(inside.some((n) => seen[n.id]), `${s.name}: its road doesn't join the network`);
    assert.ok(m.landmarks.some((l) => l.name === s.name), `${s.name}: not on the map`);
  }
  // what stands there
  const count = (t) => m.props.filter((p) => p.t === t).length;
  assert.ok(count('tent') >= 8 && count('campfire') >= 8, 'campgrounds pitched');
  assert.ok(count('turbine') >= 6, `wind turbines (${count('turbine')})`);
  const oil = m.countrySites.find((s) => s.type === 'oil'), inOil = (p) => p.x > oil.x * TILE && p.x < (oil.x + oil.w) * TILE && p.y > oil.y * TILE && p.y < (oil.y + oil.h) * TILE;
  assert.ok(count('pumpjack') >= 6 && m.props.filter((p) => p.t === 'otank' && inOil(p)).length === 3, 'the oil field');   // (Route 9's lease has a tank of its own)
  assert.ok(count('solar') >= 60, 'the solar farm');
  assert.equal(count('dscreen'), 1); assert.equal(count('dome'), 1); assert.equal(m.raceways.length, 1); assert.equal(m.quarries.length, 1);
  assert.ok(count('radiotower') >= 3, 'radio masts');
  for (const name of ['Highland Quick Stop', 'Route 9 Quick Stop']) assert.ok(m.pois.some((p) => p.label === name && p.kind === 'convenience'), `${name} sells things`);
  // utility poles along the country roads, most of them wired to the one before; in the older streets of town on
  // the pavement (never downtown); now and then the line crosses over the road
  const poles = m.props.filter((p) => p.t === 'upole');
  assert.ok(poles.length > 150 && poles.filter((p) => p.wx !== undefined).length > poles.length * 0.6, `poles ${poles.length}`);
  const tileOf = (x, y) => m.tiles[Math.floor(y / TILE) * MAP_W + Math.floor(x / TILE)];
  for (const p of poles) { const t = tileOf(p.x, p.y); assert.ok(t !== T.ROAD && t !== T.BUILDING, `a pole stands on ${t} at ${Math.round(p.x / TILE)},${Math.round(p.y / TILE)}`); }
  const town = poles.filter((p) => tileOf(p.x, p.y) === T.SIDEWALK);
  assert.ok(town.length >= 40, `poles in the older streets (${town.length})`);
  for (const p of town) assert.ok(['houses', 'southside', 'industrial', 'harbor', 'factory'].includes(DISTRICTS[m.dist[Math.floor(p.y / TILE) * MAP_W + Math.floor(p.x / TILE)]].style), 'not downtown');
  assert.ok(poles.filter((p) => p.wx !== undefined && tileOf((p.x + p.wx) / 2, (p.y + p.wy) / 2) === T.ROAD).length >= 10, 'spans over the road');
  // runway lights at both airfields, off the runway's tarmac edges
  assert.ok(count('rwlight') > 100, 'runway lights');
});
