// The town's people where the town is (the owner, 10-16: "NPCs spawning where there's no development (by a river,
// nothing around)"): server/systems/npc.js spawns its town crowd - the executives, the sweepers, the socialites - only
// on a pavement, a plaza, a lot or a dock, in a park, or on open ground with a street, a path or a building close by
// (peopleBelongAt). World v3's coast and rocks are town districts (beach, rocky) running on for miles past the last
// street: out there it's as quiet as the country - a beachcomber now and then, folk round a site.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { T, TILE, K } from '../shared/constants.js';
import { peopleBelongAt } from '../server/systems/npc.js';

// a little made-up map: open grass, one road, a park off in the corner
function fakeMap() {
  const W = 80, H = 80, tiles = new Uint8Array(W * H).fill(T.GRASS);
  for (let y = 0; y < H; y++) tiles[y * W + 10] = T.ROAD;
  const tileAtPx = (x, y) => { const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE); return tx < 0 || ty < 0 || tx >= W || ty >= H ? T.WATER : tiles[ty * W + tx]; };
  const districtAt = (x, y) => (x > 60 * TILE && y > 60 * TILE ? { style: 'park' } : { style: 'beach' });
  return { tileAtPx, districtAt };
}

test('the town\'s people: on the pavement, by the street, in the park - never out on open ground with nothing round', () => {
  const m = fakeMap(), at = (tx, ty) => peopleBelongAt(m, (tx + 0.5) * TILE, (ty + 0.5) * TILE);
  assert.ok(at(10, 20), 'on the street');
  assert.ok(at(14, 20) && at(18, 20), 'on the grass a few steps from it');
  assert.ok(!at(30, 20) && !at(45, 40), 'out on the open grass, nothing built near');
  assert.ok(at(70, 70), 'in a park');
});

test('World v3: stood on the open coast, no town crowd turns up - only country folk', { timeout: 300000 }, async () => {
  const { generateCity } = await import('../shared/map.js');
  await import('../shared/world3-islands.js');
  const { FRAME_W, FRAME_H } = await import('../shared/world3.js');
  const { prepare } = await import('../tools/world3-build.mjs');
  const { World } = await import('../server/world.js');
  const { joinPlayer, teleport } = await import('./helpers.js');
  const prep = prepare();
  const m = generateCity(1337, { world3: true, frame: { w: FRAME_W, h: FRAME_H }, land: prep.land, today: prep.today });
  // a stretch of coast with nothing built anywhere round it (sea aside), out to where people spawn (450-1250 px)
  const open = (x, y) => { const d = m.districtAt(x, y); return !!d && d.style === 'beach' && !peopleBelongAt(m, x, y); };
  let spot = null;
  for (let ty = m.y0 + 40; ty < m.y0 + m.h - 40 && !spot; ty += 7) for (let tx = m.x0 + 40; tx < m.x0 + m.w - 40; tx += 7) {
    const x = (tx + 0.5) * TILE, y = (ty + 0.5) * TILE, t = m.tileAtPx(x, y);
    if (t !== T.SAND && t !== T.GRASS) continue;
    let ok = open(x, y);
    for (let k = 0; k < 24 && ok; k++) {
      const a = k / 24 * Math.PI * 2;
      for (const d of [500, 900, 1250]) { const px = x + Math.cos(a) * d, py = y + Math.sin(a) * d, tt = m.tileAtPx(px, py); if (tt !== T.WATER && tt !== T.DEEP && !open(px, py)) { ok = false; break; } }
    }
    if (ok) spot = [x, y];
  }
  assert.ok(spot, 'an open stretch of coast on the map');
  const w = new World(m, { npcBudget: 200, throwErrors: true });
  const { p } = joinPlayer(w);
  teleport(w, p.ped, spot[0], spot[1]);
  const seen = new Set(), town = [];
  let folk = 0;
  for (let i = 0; i < 900; i++) {
    w.step();
    if (i % 3) continue;
    for (const e of w.entities.values()) {
      if (e.kind !== K.PED || !e.npc || e.vehId || seen.has(e.id)) continue;
      seen.add(e.id);
      if (e.npc.role !== 'civ' || Math.hypot(e.x - p.ped.x, e.y - p.ped.y) > 1400 || peopleBelongAt(m, e.x, e.y)) continue;
      if (e.npc.country) folk++; else town.push(`${e.npc.archetype} at ${Math.round(e.x / TILE)},${Math.round(e.y / TILE)}`);
    }
  }
  assert.deepEqual(town, [], 'none of the town crowd out on the open coast');
  assert.ok(folk <= 6, `a few country folk at most (${folk})`);
});
