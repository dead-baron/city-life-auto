// World v3's container port (docs/WORLD-V3.md 8.5): Port Westport, district 26, built at its gulf place as a container
// yard (shared/map.js buildContainerPort): the yard's layout - the stacks off the lanes and the apron, a tile of yard
// round each; the gantry cranes on the quay's edge, their booms over the water; the gate on a road; nothing solid on a
// road; the ship on the water; Westport Freight still a delivery stop. (About 30 s: today's world, the v3 land, the place.)
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateCity } from '../shared/map.js';
import '../shared/world3-islands.js';
import { ISLANDS, PIECES } from '../shared/world3-skeleton.js';
import { LAND_PICK } from '../tools/world3-place.mjs';
import { T, TILE } from '../shared/constants.js';

test('Port Westport at its gulf place: a container yard behind the quay, cranes on its edge, a gate on the road', async () => {
  const { buildLand3 } = await import('../shared/world3-land.js');
  let world = generateCity(1337);
  assert.equal(world.port, undefined, 'the live world has no container port');
  const L = buildLand3(world);
  world = null;
  const P = ISLANDS.find((I) => I.key === 'westport') || PIECES.find((I) => I.key === 'westport'), pic = P.picture;
  const m = generateCity(1337, { island: 'westport', frame: { w: L.w, h: L.h }, place: { at: pic.at, scale: pic.scale, from: pic.from }, land: L, ...LAND_PICK.westport });
  const port = m.port, W = m.w, tile = (x, y) => m.tiles[y * W + x];
  assert.ok(port, 'm.port');
  assert.equal(port.dist, 26);
  // the slabs are gone: in the yard's rectangle the district keeps only the freight stop's row, the junkyard and the gatehouse
  const [rx0, ry0, rx1, ry1] = port.yard, fr = m.buildings[port.freight];
  for (const b of m.buildings) {
    const cx = b.tx + (b.tw >> 1), cy = b.ty + (b.th >> 1);
    if (b.gone || cx < rx0 || cx >= rx1 || cy < ry0 || cy >= ry1 || m.dist[cy * W + cx] !== 26) continue;
    assert.ok(b.id === port.gatehouse || b.kind === 'junkyard' || (b.ty === fr.ty && b.th === fr.th), `${b.kind} ${b.name} at ${b.tx},${b.ty} (${b.tw} x ${b.th}) still stands in the yard`);
  }
  // the stacks: many blocks, each on the yard's paving with a tile of it round them (never against a road, a pavement,
  // a building or the water), not overlapping, off every lane and the apron
  assert.ok(port.blocks.length >= 100, `${port.blocks.length} blocks`);
  const taken = new Set();
  for (const b of port.blocks) for (let y = b.y - 1; y <= b.y + b.h; y++) for (let x = b.x - 1; x <= b.x + b.w; x++) {
    assert.equal(tile(x, y), T.LOT, `block ${b.x},${b.y}: tile ${x},${y} is ${tile(x, y)}`);
    if (x < b.x || x >= b.x + b.w || y < b.y || y >= b.y + b.h) continue;
    assert.ok(!taken.has(y * W + x), `blocks overlap at ${x},${y}`);
    taken.add(y * W + x);
    for (const l of port.lanes) assert.ok(!(l.ns && x >= l.x && x < l.x + l.w) && !(l.ew && y >= l.y && y < l.y + l.h), `block ${b.x},${b.y} on a lane`);
    assert.ok(x < port.apron.x || x >= port.apron.x + port.apron.w, `block ${b.x},${b.y} on the apron`);
  }
  assert.equal(m.props.filter((p) => p.t === 'cstack').length, port.blocks.length);
  // the cranes: on the quay's rails - the waterside leg on the dock's outer tile with the water beside it, the landside
  // leg on the apron - and their booms out over the water
  const cranes = m.props.filter((p) => p.t === 'gcrane');
  assert.ok(cranes.length >= 5, `${cranes.length} cranes`);
  const [r0, r1] = port.rail, wx = Math.floor(r0 / TILE), lx = Math.floor(r1 / TILE);
  for (const c of cranes) {
    for (const dy of [-36, 36]) {
      const ty = Math.floor((c.y + dy) / TILE);
      assert.equal(tile(wx, ty), T.DOCK, `crane at ${c.x},${c.y}: its waterside leg on the dock`);
      assert.ok(tile(wx - 1, ty) === T.WATER || tile(wx - 1, ty) === T.DEEP, `crane at ${c.x},${c.y}: the water beside the dock`);
      assert.equal(tile(lx, ty), T.LOT, `crane at ${c.x},${c.y}: its landside leg on the apron`);
    }
    for (let x = c.x - 340; x < c.x - 120; x += 32) assert.ok([T.WATER, T.DEEP].includes(tile(Math.floor(x / TILE), Math.floor(c.y / TILE))), `crane at ${c.x},${c.y}: the boom over the water`);
  }
  // the gate: on the yard's edge, a pavement's width from a road; the gatehouse beside it
  assert.ok(port.gate, 'a gate');
  const gx = Math.floor(port.gate.x / TILE), gy = Math.floor(port.gate.y / TILE), [ex, ey] = port.gate.road, n = Math.abs(ex - gx) + Math.abs(ey - gy);
  assert.equal(tile(gx, gy), T.LOT);
  assert.equal(tile(ex, ey), T.ROAD, 'the gate opens on a road');
  assert.ok(n >= 2 && n <= 4 && (ex === gx || ey === gy), 'the gate a pavement away from the road');
  for (let k = 1; k < n; k++) assert.equal(tile(gx + Math.sign(ex - gx) * k, gy + Math.sign(ey - gy) * k), T.SIDEWALK);
  const gh = m.buildings[port.gatehouse];
  assert.ok(gh && !gh.gone && gh.kind === 'hut', 'a gatehouse');
  assert.ok(Math.abs(gh.tx + 1 - gx) + Math.abs(gh.ty + 1 - gy) <= 7, 'the gatehouse by the gate');
  for (let y = gh.ty; y < gh.ty + gh.th; y++) for (let x = gh.tx; x < gh.tx + gh.tw; x++) assert.equal(tile(x, y), T.BUILDING);
  // nothing solid on a road or a pavement: the port's solids (the stacks, the cranes' legs, masts, straddle carriers, the ship)
  assert.ok(port.solid.length > 1000);
  for (const [x, y, r] of port.solid) for (const [dx, dy] of [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]]) {
    const t = tile(Math.floor((x + dx) / TILE), Math.floor((y + dy) / TILE));
    assert.ok(t !== T.ROAD && t !== T.SIDEWALK && t !== T.BRIDGE, `a solid at ${x},${y} on a road (${t})`);
  }
  // the ship alongside, on the water
  assert.ok(port.ship, 'a ship');
  for (let y = port.ship.y; y < port.ship.y + port.ship.h; y += 16) for (let x = port.ship.x; x <= port.ship.x + port.ship.w; x += 16) assert.ok([T.WATER, T.DEEP].includes(tile(Math.floor(x / TILE), Math.floor(y / TILE))), `the ship at ${x},${y} on the water`);
  assert.ok(m.props.filter((p) => p.t === 'cship').length >= 7, 'the ship: its stern, holds and bow');
  // Westport Freight: still a delivery stop, in the port
  assert.ok(m.pois.some((p) => p.kind === 'delivery' && p.label === 'Westport Freight'), 'Westport Freight is a delivery stop');
  assert.equal(fr.name, 'Westport Freight');
});
