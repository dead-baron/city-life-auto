// The street fronts' doors in the city (test/doors.test.js has the rules and the drawing): the chunk bakes bring each walk-in's
// door (live.doors) where its doorway really is, sliding or hinged by its trade, and none for a walk-in seen cut away from
// inside; and the door is only a picture - you walk in through the doorway as ever. Builds the city: run under the heavy lock.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer, teleport } from './helpers.js';
import { bakeChunk, loadProviders, CHUNK } from '../client/art2/game/chunkbake.js';
import { unitDoor } from '../shared/doors.js';
import { TILE, T } from '../shared/constants.js';
import { PED_BLOCK } from '../shared/mapcore.js';
import { walkInAt } from '../server/systems/npc.js';
import * as players from '../server/systems/players.js';

test('the bakes say where the walk-ins\' doors are, and which kind; cut away, none', async () => {
  await loadProviders();
  const w = makeWorld(), M = w.map;
  const list = M.walkIns.map((id) => M.buildings[id]).filter((b) => b && b.walkIn.south).slice(0, 4);
  assert.ok(list.length >= 3);
  let found = 0;
  for (const b of list) {
    const u = b.walkIn.units[0], y = (b.ty + b.th) * TILE, x = (u.door.tx + 1) * TILE;
    const cx = Math.floor(b.tx * TILE / CHUNK), cy = Math.floor((y - 1) / CHUNK);
    const r = bakeChunk(M, cx, cy, { quality: 0, seed: 1337 });
    const ds = r.live.doors.filter((d) => d[6] === M.buildings.indexOf(b));
    const d = ds.find((q) => q[0] <= x && q[0] + q[2] >= x - 4);
    if (!d) continue;
    found++;
    assert.equal(d[1], y, 'its foot on the front wall\'s line');
    assert.equal(d[4], unitDoor(u) === 'slide' ? 1 : 0, `${u.kind}: ${unitDoor(u)}`);
    assert.ok(d[2] >= 12 && d[3] >= 40);
    const cut = bakeChunk(M, cx, cy, { quality: 0, seed: 1337, cutaway: M.buildings.indexOf(b) });
    assert.ok(!cut.live.doors.some((q) => q[6] === M.buildings.indexOf(b)), 'from inside, cut away: no door over the doorway');
  }
  assert.ok(found >= 2, `walk-ins' doors found (${found})`);
});

test('a door never stands in the way: the doorway is floor, and you walk in through it', () => {
  const w = makeWorld(), M = w.map, { p } = joinPlayer(w);
  const b = M.walkIns.map((id) => M.buildings[id]).find((q) => q && q.walkIn.south);
  const u = b.walkIn.units[0];
  for (let tx = u.door.tx; tx < u.door.tx + u.door.w; tx++) { const t = M.tileAt(tx, u.door.ty); assert.equal(t, T.FLOOR); assert.ok(!PED_BLOCK[t]); }
  const x = (u.door.tx + u.door.w / 2) * TILE, y = (u.door.ty + 2.5) * TILE;
  teleport(w, p.ped, x, y);
  let seq = 1;
  for (let i = 0; i < 40 && !walkInAt(M, p.ped.x, p.ped.y - TILE); i++) { players.queueInput(p, { seq: seq++, bits: 0, mx: 0, my: -1, aim: -Math.PI / 2 }); w.step(); }
  for (let i = 0; i < 20; i++) { players.queueInput(p, { seq: seq++, bits: 0, mx: 0, my: -1, aim: -Math.PI / 2 }); w.step(); }
  assert.ok(p.ped.y < (u.door.ty) * TILE, `walked in through the doorway (${Math.round(p.ped.y)} vs the wall at ${u.door.ty * TILE})`);
  assert.ok(walkInAt(M, p.ped.x, p.ped.y), 'inside the shop');
});
