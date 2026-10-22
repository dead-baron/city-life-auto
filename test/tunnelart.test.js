// The subway in the new art (client/art2/game/tunnel.js; the owner, 10-22: the tunnel "looks like placeholder art"): the
// tunnel's chunks baked on the page - the floor, the track bed and its rails round every underground track, the walls
// (the north one face on, a lamp along it), a station's platform beside its track with its tiles, yellow line, pillars,
// benches and name - and the engine keeps them as a layer of their own, apart from the city's chunks.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bakeTunnel, tunnelGeom, tunnelLamps, TUNNEL } from '../client/art2/game/tunnel.js';
import { CHUNK } from '../client/art2/game/chunkgeom.js';
import { T, TILE } from '../shared/constants.js';

// a stand-in map: two tracks 96 px apart running east under (x 0 .. 3000, y 1000 and 1096), a station on the first
function standIn() {
  const line = (y, way) => { const pts = []; for (let x = 0; x <= 3000; x += 8) pts.push({ x, y, s: x, under: true }); if (way < 0) pts.reverse().forEach((p, i) => { p.s = i * 8; }); return pts; };
  const W = 120, H = 60, tiles = new Uint8Array(W * H).fill(T.GRASS);
  for (let x = 0; x < W; x++) for (let y = 28; y < 30; y++) tiles[y * W + x] = T.ROAD;   // (a street overhead, rows 28-29: y 896-959)
  const a = { pts: line(1000, -1), stations: [{ name: 'Test Square Station', x: 1500, y: 1000, s: 1500, under: true, side: 1, half: 324 }] };
  return { rails: [a, { pts: line(1096, 1), stations: [] }], tiles, x0: 0, y0: 0, w: W, h: H, inside: (x, y) => x >= 0 && y >= 0 && x < W && y < H, idx: (x, y) => y * W + x };
}
const px = (g, u, v) => { const j = (v * g.w + u) * 4; return [g.col[j], g.col[j + 1], g.col[j + 2]]; };
const lum = (c) => c[0] + c[1] + c[2];

test('the tunnel\'s chunks: floor, ballast, rails, the north wall face on, the earth above; nothing where no tunnel runs', () => {
  const m = standIn(), ap = 2;
  const g = bakeTunnel(m, 2, 1, ap);   // (x 1536-2303, y 768-1535: past the station)
  assert.ok(g && g.w === CHUNK / ap && g.ap === ap);
  const at = (x, y) => [Math.floor((x - 2 * CHUNK) / ap), Math.floor((y - CHUNK) / ap)];
  // a rail of the first track (12 px off its centre), its ballast, the floor between the tracks
  const [ru, rv] = at(2000, 1000 + TUNNEL.railOff - 4);   // (its top, 4 px up: 3/4 view, screen y = Y - Z)
  assert.equal(g.z[rv * g.w + ru], 4, 'a rail stands up');
  const rail = px(g, ru, rv), bal = px(g, ...at(2001, 1005)), floor = px(g, ...at(2000, 1048));
  assert.ok(lum(rail) > lum(bal) + 120, `the steel shows against the ballast (${rail} / ${bal})`);
  assert.ok(lum(floor) > lum(bal), 'concrete between the tracks');
  // the north wall, face on: above the floor's north edge (y 1000 - half) the screen shows the wall up to its height
  const [wu, wv] = at(2000, 1000 - TUNNEL.half - 10);
  assert.ok(g.z[wv * g.w + wu] > 0 && g.z[wv * g.w + wu] < TUNNEL.wallH && !(g.flag[wv * g.w + wu] & 1), 'the wall\'s face');
  // the earth's top above it, darker; the street overhead ghosted on it, a little lighter
  const earth = px(g, ...at(2000, 1000 - TUNNEL.half - TUNNEL.wallH - 60)), ghost = px(g, ...at(2000, 920 - TUNNEL.wallH));
  assert.ok(lum(earth) < 100 && lum(ghost) > lum(earth), `the earth dark, the street over it ghosted (${earth} / ${ghost})`);
  // the south wall's top hides the floor's south edge: at the second track's south edge the screen shows the earth's top
  const [su, sv] = at(2000, 1096 + TUNNEL.half - 6);
  assert.equal(g.z[sv * g.w + su], TUNNEL.wallH, 'the south wall in front of the floor\'s edge');
  // no tunnel, no chunk
  assert.equal(bakeTunnel(m, 2, 5, ap), null);
});

test('a station: the platform beside its track, raised, tiled, the yellow line at its edge, pillars, its name; lamps along the walls', () => {
  const m = standIn(), ap = 2, G = tunnelGeom(m);
  assert.equal(G.stations.length, 1);
  const st = G.stations[0];
  assert.equal(st.name, 'TEST SQUARE');
  // (the first track runs west - its points reversed - so its right, the platform's side, is north)
  assert.ok(st.ny < -0.9, `on the track's right of the way it runs: north (${st.nx}, ${st.ny})`);
  const g = bakeTunnel(m, 1, 1, ap), at = (x, y) => [Math.floor((x - CHUNK) / ap), Math.floor((y - CHUNK) / ap)];
  // the platform's top: raised, tiled; the yellow line along the edge by the track
  const [pu, pv] = at(1500 + 24, 1000 - 70 - TUNNEL.plat), i = pv * g.w + pu;
  assert.equal(g.z[i], TUNNEL.plat, 'the platform stands up');
  const line = px(g, ...at(1500 + 24, 1000 - TUNNEL.pin - 3 - TUNNEL.plat));
  assert.ok(line[0] > 180 && line[1] > 150 && line[2] < 90, `the yellow line (${line})`);
  // its name, white on a blue sign, somewhere on it
  let blue = 0, white = 0;
  for (let v = 0; v < g.h; v++) for (let u = 0; u < g.w; u++) { const c = px(g, u, v); if (c[2] > 120 && c[0] < 60) blue++; if (c[0] > 220 && c[1] > 220 && c[2] > 220 && g.z[v * g.w + u] === TUNNEL.plat + 1) white++; }
  assert.ok(blue > 40 && white > 20, `a name sign (${blue} blue, ${white} white)`);
  // lamps: along the outer walls, every LAMP_GAP; none on the inner side, between the tracks
  const L = tunnelLamps(m, 0, 0, 3000, 2000);
  assert.ok(L.length > 30, `${L.length} lamps`);
  for (const p of L) if (!p.st) assert.ok(p.y < 1000 - TUNNEL.half + 6 || p.y > 1096 + TUNNEL.half - 6, `a wall lamp at the tunnel's side (${p.y})`);
  // lit: some of the north wall's face glows
  let lit = 0;
  for (let k = 3; k < g.w * g.h * 4; k += 4) if (g.emi[k] > 200) lit++;
  assert.ok(lit > 10, `the lamps glow (${lit} px)`);
});

test('a chunk bakes quickly enough to make a couple a frame', () => {
  const m = standIn();
  bakeTunnel(m, 1, 1, 2);
  const t0 = performance.now();
  for (let i = 0; i < 4; i++) bakeTunnel(m, 1 + (i & 1), 1, 2);
  const ms = (performance.now() - t0) / 4;
  assert.ok(ms < 60, `${ms.toFixed(1)} ms a chunk`);
});
