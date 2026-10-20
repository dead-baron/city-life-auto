// Westport International, handcrafted (shared/world3-airport.js, 2026-10-20): the district is the plan's, inside the
// grid's edge streets (Spruce Street, 22nd Street, Marsh Road, Bayside Avenue at Cargo Road); every street of it inside
// and meeting another or an edge (bar a cul-de-sac's far end); the field the generator is handed is the plan's, the
// runway north-south as before; the terminal, its gates and the rescue base's spot apart. (The airport built in the
// whole world: test/world3world.test.js.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AIRPORT, AX, AY, FIELD, AP_NAME } from '../shared/world3-airport.js';
import { HAND_PLANS, handPlanAt } from '../shared/world3-hand.js';
import { CITY_AIRPORT } from '../shared/world3-city.js';
import { SAR_HQ } from '../shared/world3-sarhq.js';

test('Westport International: the district the plan\'s; its streets inside it, every one meeting another or an edge', () => {
  assert.ok(HAND_PLANS.includes(AIRPORT));
  for (const [x, y] of [[1500, 2700], [1600, 2650], [1800, 2780], [2000, 2700], [1700, 2840]]) assert.equal(handPlanAt(x, y), AIRPORT, `${x}, ${y}`);
  for (const [x, y] of [[1440, 2700], [1600, 2600], [1600, 2860], [2100, 2730]]) assert.notEqual(handPlanAt(x, y), AIRPORT, `${x}, ${y}: an edge street or outside`);
  const S = AIRPORT.streets(), [x0, y0, x1, y1] = AIRPORT.rect;
  for (const s of S) for (const [x, y] of s.pts) assert.ok(x >= x0 && x <= x1 && y >= y0 && y <= y1, `${s.name}: ${x}, ${y} inside`);
  // (the edges: Spruce Street, 22nd Street to Elm Street, Marsh Road from Hawthorn Street to Westport Avenue, Bayside
  // Avenue's end at Cargo Road)
  const edges = [[[AX.spruce, AY.north], [AX.spruce, 2796]], [[AX.spruce, AY.north], [1680, AY.north]], [[1510, AY.marsh], [1780, AY.marsh]], [[AX.bayside, AY.cargo], [AX.bayside + 40, AY.cargo]]];
  const segs = (P) => P.slice(1).map((q, k) => [P[k], q]);
  const near = (p, a, b) => {
    const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy, t = L ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L)) : 0;
    const ex = a[0] + dx * t - p[0], ey = a[1] + dy * t - p[1];
    return ex * ex + ey * ey <= 1.5;
  };
  // (a cul-de-sac - Terminal Drive by the runway, Hangar Road, Skyport Drive - meets another street at one end)
  for (const s of S) {
    const meets = (p) => [...S.filter((o) => o !== s).map((o) => o.pts), ...edges].some((P) => segs(P).some(([a, b]) => near(p, a, b)));
    const ends = [s.pts[0], s.pts[s.pts.length - 1]].map(meets);
    assert.ok(s.culdesac ? ends.some(Boolean) : ends.every(Boolean), `${s.name}: its ends meet another street (${ends})`);
  }
});

test('Westport International: the field the generator is handed is the plan\'s - the runway north-south, the terminal clear of the rescue base', () => {
  assert.equal(CITY_AIRPORT.name, AP_NAME);
  assert.ok(CITY_AIRPORT.hand, 'handcrafted: the generator\'s airport pass leaves it be');
  for (const k of ['runway', 'taxi', 'apron', 'terminal', 'hangars', 'planes']) assert.deepEqual(CITY_AIRPORT[k], FIELD[k], k);
  const [rx, ry, rw, rh] = FIELD.runway, [tx, , tw] = FIELD.taxi;
  assert.ok(rh > rw * 10 && rh >= 200, 'a long north-south runway');
  assert.ok(tx > rx + rw && tx + tw < FIELD.apron[0] + 1, 'the taxiway between the runway and the apron');
  assert.ok(ry > AY.north + 20 && ry + rh < AY.marsh - 20, 'the runway clear of 22nd Street and Marsh Road');
  // the rescue base's spot (world3-sarhq.js) apart from the terminal and the hangars
  const [sx, sy] = SAR_HQ.at, apart = ([x, y, w, h]) => x + w <= sx || x >= sx + SAR_HQ.w || y + h <= sy || y >= sy + SAR_HQ.h;
  assert.ok(apart(FIELD.terminal), 'the terminal clear of the SAR HQ');
  for (const h of FIELD.hangars) assert.ok(apart(h), 'a hangar clear of the SAR HQ');
  // the general-aviation stands (a flyable plane waits 150 px south of each) south of Hangar Road, west of the boulevard
  for (const [x, y] of FIELD.planes) assert.ok(x > tx + tw && x < AX.blvd && y > AY.hangar + 10 && y < AY.marsh - 10, `a stand at ${x}, ${y}`);
});
