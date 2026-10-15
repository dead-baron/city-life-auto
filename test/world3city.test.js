// World v3b (docs/WORLD-V3.md part 9, 9.3): the city designed on the owner's layout - shared/world3-city.js, built alone
// on the land of the new frame (tools/world3-city-plan.mjs: the traced outlines, less the lakes and the streams): every
// district painted on its own island's land and with streets; every street east-west or north-south, on land with room
// for its pavements, off the park, the stadium and the airport field; the avenues reaching the islands' shores (where
// the bridges land); a bridge's end met by a straight stub; the same plan every time.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TILE } from '../shared/constants.js';
import { DISTRICTS } from '../shared/mapcore.js';
import { ISLANDS3 } from '../shared/world3-layout.js';
import { CITY3, CITY_IDS, CITY_PARKS, CITY_AIRPORT, CITY_SEEDS, PITCH, layCity3, avoidOf } from '../shared/world3-city.js';
import { buildPlan } from '../tools/world3-city-plan.mjs';

const P = buildPlan();
const { W, H, L, painted, plan } = P;
const at = (x, y) => (x >= 0 && y >= 0 && x < W && y < H ? y * W + x : -1);
const landAt = (x, y) => at(x, y) >= 0 && !!L.land[at(x, y)];

test('World v3b city: the plan is 9.3\'s districts, each painted on its own island and given streets', () => {
  // (and the north coast's towns: Northshore, North Point, The Bluffs - WORLD-V3.md 9.6)
  const want = [4, 12, 5, 7, 17, 46, 16, 1, 8, 18, 2, 25, 3, 23, 26, 30, 28, 27, 37, 36, 35, 10, 0, 6, 14, 31, 32, 34, 44, 43];
  assert.deepEqual([...CITY_IDS].sort((a, b) => a - b), want.slice().sort((a, b) => a - b));
  // not the other helpers' (Lakeview)
  for (const d of [24]) assert.ok(!CITY_IDS.has(d), `district ${d} is not the city's`);
  for (const c of CITY3) {
    assert.ok(DISTRICTS[c.d], `district ${c.d} exists`);
    const st = DISTRICTS[c.d].style;
    assert.ok(PITCH[st] || st === 'park' || st === 'airport', `${DISTRICTS[c.d].name}: a spacing for its style ${st}`);
    for (const [x0, y0, x1, y1] of c.rects) assert.ok(x0 < x1 && y0 < y1, `${DISTRICTS[c.d].name}: a proper rect`);
  }
  const counts = new Map();
  for (let i = 0; i < W * H; i++) if (L.dist[i] !== 255) { assert.ok(L.land[i], 'painted only on land'); counts.set(L.dist[i], (counts.get(L.dist[i]) || 0) + 1); }
  for (const p of painted) assert.ok(p.tiles > 20000, `${p.name} painted (${p.tiles} tiles)`);
  // each district on its island: its heart's tile inside that island's outline (or the mainland's)
  const inPoly = (poly, x, y) => { let c = false; for (let j = 0, k = poly.length - 1; j < poly.length; k = j++) { const [ax, ay] = poly[k], [bx, by] = poly[j]; if ((ay > y) !== (by > y) && x < ax + ((y - ay) * (bx - ax)) / (by - ay)) c = !c; } return c; };
  for (const c of CITY3) {
    if (c.on === 'main') continue;
    const I = ISLANDS3.find((q) => q.key === c.on);
    let n = 0, out = 0;
    for (let y = 0; y < H; y += 7) for (let x = 0; x < W; x += 7) if (L.dist[y * W + x] === c.d) { n++; if (!inPoly(I.poly, x + 0.5, y + 0.5)) out++; }
    assert.ok(n > 0 && out <= n * 0.005, `${DISTRICTS[c.d].name} only on ${c.on} (${out} of ${n} samples off it)`);
  }
  // streets in every district but the park and the airport field (their edges are streets round them)
  const runs = [...plan.h.map((r) => ({ ...r, horiz: true })), ...plan.v.map((r) => ({ ...r, horiz: false }))];
  for (const c of CITY3) {
    const st = DISTRICTS[c.d].style;
    let n = 0;
    for (const r of runs) for (let u = r.a; u <= r.b; u += 4) {
      const x = r.horiz ? u : r.c, y = r.horiz ? r.c : u;
      if ([[0, 0], [0, -9], [0, 9], [-9, 0], [9, 0]].some(([dx, dy]) => landAt(x + dx, y + dy) && L.dist[at(x + dx, y + dy)] === c.d)) { n++; break; }
    }
    assert.ok(n >= (st === 'park' || st === 'airport' ? 2 : 6), `${DISTRICTS[c.d].name}: ${n} streets`);
  }
  // the summary, for the record
  console.log('city plan', runs.length, 'runs,', plan.alleys.length, 'alleys,', runs.reduce((s, r) => s + r.b - r.a, 0), 'tiles of street');
});

test('World v3b city: every street east-west or north-south, on land with its pavements, off the keeps', () => {
  const HALF = { st: 6, ave: 8, blvd: 8, alley: 2 };
  const keeps = CITY3.flatMap((c) => c.keep || []);
  for (const [horiz, R] of [[true, plan.h], [false, plan.v], [false, plan.alleys]]) for (const r of R) {
    assert.ok(Number.isInteger(r.c) && Number.isInteger(r.a) && Number.isInteger(r.b) && r.b > r.a, 'a run on the lattice');
    for (let u = r.a; u <= r.b; u += 2) for (let o = -HALF[r.kind]; o <= HALF[r.kind]; o += 2) {
      const x = horiz ? u : r.c + o, y = horiz ? r.c + o : u;
      assert.ok(landAt(x, y), `${r.kind} at ${horiz ? 'y' : 'x'} ${r.c} (${r.a}-${r.b}) dry at ${x}, ${y}`);
    }
    const mx = horiz ? (r.a + r.b) / 2 : r.c, my = horiz ? r.c : (r.a + r.b) / 2;
    for (const [x0, y0, x1, y1] of keeps) {
      // (a run may border a keep; none crosses its inside)
      const crosses = horiz ? r.c > y0 + 2 && r.c < y1 - 2 && r.a < x1 - 2 && r.b > x0 + 2 : r.c > x0 + 2 && r.c < x1 - 2 && r.a < y1 - 2 && r.b > y0 + 2;
      assert.ok(!crosses, `${r.kind} ${horiz ? 'y' : 'x'} ${r.c} (${r.a}-${r.b}) crosses the keep ${[x0, y0, x1, y1]} (mid ${mx}, ${my})`);
    }
  }
  // the lines laid for the build: each of two points, the same x or the same y
  const m = { w: W, h: H, land: L.land, dist: L.dist, river: null };
  const lines = [];
  layCity3(lines, m);
  assert.ok(lines.length > 300, `${lines.length} lines`);
  for (const l of lines) {
    assert.equal(l.pts.length, 2);
    const [a, b] = l.pts;
    assert.ok(a.x === b.x || a.y === b.y, `${l.name}: axis-aligned`);
    assert.ok(['st', 'ave', 'blvd', 'alley'].includes(l.kind), `${l.name}: a kind the generator knows (${l.kind})`);
    assert.equal(l.lvl, 0);
  }
  // the avenues named, the main ones boulevards
  const names = new Set(lines.filter((l) => l.kind !== 'st' && l.kind !== 'alley').map((l) => l.name));
  for (const n of ['Neon Boulevard', 'Westport Boulevard', 'Midtown Boulevard', 'Sunset Boulevard', 'Park West Avenue', 'Greenfield Avenue']) assert.ok(names.has(n), `${n} laid`);
});

test('World v3b city: the avenues reach the islands\' shores (the bridges land on them); a bridge\'s end is met', () => {
  // an avenue run whose end has water within 40 tiles beyond it, in its own direction
  const shoreEnds = (key, side) => {
    const I = ISLANDS3.find((q) => q.key === key);
    const [bx0, by0, bx1, by1] = I.box;
    let n = 0;
    for (const [horiz, R] of [[true, plan.h], [false, plan.v]]) for (const r of R) {
      if (r.kind === 'st') continue;
      for (const [e, dir] of [[r.a, -1], [r.b, 1]]) {
        const x = horiz ? e : r.c, y = horiz ? r.c : e;
        if (x < bx0 || x > bx1 || y < by0 || y > by1) continue;
        const s = horiz ? (dir < 0 ? 'W' : 'E') : dir < 0 ? 'N' : 'S';
        if (side && s !== side) continue;
        let wet = false;
        for (let k = 1; k <= 40 && !wet; k++) if (!landAt(horiz ? x + dir * k : x, horiz ? y : y + dir * k)) wet = true;
        if (wet) n++;
      }
    }
    return n;
  };
  assert.ok(shoreEnds('big', 'N') >= 4, `the Gulf Island's north shore: ${shoreEnds('big', 'N')} avenues`);
  assert.ok(shoreEnds('big', 'S') >= 3, `its south shore: ${shoreEnds('big', 'S')}`);
  assert.ok(shoreEnds('big', 'W') >= 2, `its west shore: ${shoreEnds('big', 'W')}`);
  assert.ok(shoreEnds('big', 'E') >= 2, `its east shore: ${shoreEnds('big', 'E')}`);
  for (const k of ['east', 'southwest', 'southeast']) assert.ok(shoreEnds(k) >= 3, `${k}: ${shoreEnds(k)} avenues at the shore`);
  // the avenues of facing shores line up: the mainland's bridgehead avenues are the island's park avenues
  const xsOn = (y0, y1) => new Set(plan.v.filter((r) => r.kind !== 'st' && r.a <= y1 && r.b >= y0).map((r) => r.c));
  const main = xsOn(1900, 1990), isle = xsOn(2120, 2200);
  const both = [...main].filter((x) => isle.has(x));
  assert.ok(both.length >= 3, `avenues facing across the gulf: ${both}`);
  // a bridge (an arterial over the water) from the mainland's Harbor to the Gulf Island: each end met by a stub
  const m = { w: W, h: H, land: L.land, dist: L.dist, river: null };
  const shore = (x, y0, dir) => { let y = y0; while (landAt(x, y)) y += dir; return y - dir; };
  const x = 3100, a = shore(x, 1950, 1), b = shore(x, 2200, -1);
  const lines = [{ kind: 'art', lvl: 0, name: 'Test Bridge', pts: [{ x: (x + 0.5) * TILE, y: (a - 3 + 0.5) * TILE }, { x: (x + 0.5) * TILE, y: (b + 3 + 0.5) * TILE }] }];
  const out = layCity3(lines, m);
  assert.equal(out.bridges.length, 2);
  assert.ok(out.bridges.every((q) => q.met), JSON.stringify(out.bridges));
  const stubs = lines.filter((l) => l.name === 'Test Bridge' && l.city);
  for (const s of stubs) assert.ok(s.pts[0].x === s.pts[1].x || s.pts[0].y === s.pts[1].y, 'a stub is straight');
});

test('World v3b city: its places at their v3b spots, and the same plan every time', () => {
  // the parks, the stadium and the airport on the city's land, inside their districts
  const distIn = (x, y) => L.dist[at(Math.round(x), Math.round(y))];
  assert.equal(distIn((CITY_PARKS[0].x0 + CITY_PARKS[0].x1) / 2, CITY_PARKS[0].y0 + 20), 12);
  assert.equal(distIn((CITY_PARKS[1].x0 + CITY_PARKS[1].x1) / 2, (CITY_PARKS[1].y0 + CITY_PARKS[1].y1) / 2), 25);
  const [rx, ry, rw, rh] = CITY_AIRPORT.runway;
  assert.ok(rh > rw * 10, 'the runway runs north-south');
  for (const k of ['runway', 'taxi', 'apron', 'terminal']) {
    const [x, y, w, h] = CITY_AIRPORT[k];
    for (let ty = y; ty < y + h; ty += 4) for (let tx = x; tx < x + w; tx += 4) assert.equal(distIn(tx, ty), 27, `the airport's ${k} on its district (${tx}, ${ty})`);
  }
  void rx; void ry;
  for (const c of CITY3) {
    const [x, y] = CITY_SEEDS[c.d];
    assert.equal(distIn(x, y), c.d, `${DISTRICTS[c.d].name}'s heart in it (${x}, ${y})`);
  }
  // the plan again, from a fresh land: the same to the tile
  const again = buildPlan();
  assert.deepEqual(again.plan, plan);
  assert.deepEqual(again.painted, painted);
  // the room: no east-west street runs along the main line through Midtown (it crosses the blocks there)
  const rail = avoidOf(null).at(-1);
  for (const r of plan.h) {
    if (r.c < 1600 || r.c > 1700) continue;
    let near = 0, n = 0;
    for (let x = Math.max(r.a, 2900); x <= Math.min(r.b, 3600); x += 4) { n++; const y = 1620 + ((x - 2900) * 48) / 300; if (x <= 3200 ? Math.abs(r.c - y) < 10 : Math.abs(r.c - 1664) < 10) near++; }
    assert.ok(!n || near / n < 0.4, `the street at y ${r.c} runs along the main line`);
  }
  assert.ok(rail.pts.length > 10);
});
