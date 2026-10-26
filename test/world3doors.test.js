// World v3's walk-ins: the door drawn on the front is where the doorway is (the owner's notes 2, p16: "Some building
// entrances are still not put in correctly"). A hand plan's front (b.art.shop: 'left' / 'right') or a bank's door in
// the middle of its front used to put it a tile or more off the doorway you walk in through; now the walk-in's own
// doorway decides, and the door opening as you come up to it (client/art2/game/doorart.js) is the one you go through.
// Builds World v3: run under the heavy lock.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildWorld3 } from '../server/world3.js';
import { staticItems } from '../client/art2/game/statics.js';
import { loadProviders } from '../client/art2/game/chunkbake.js';
import { unitDoor } from '../shared/doors.js';
import { TILE, CHUNK_TILES } from '../shared/constants.js';

test('every walk-in front: its door at its doorway, sliding or hinged by its trade', async () => {
  const { map: M } = await buildWorld3(1337, { log: () => {} });
  await loadProviders();
  const CH = CHUNK_TILES * TILE, byChunk = new Map();
  let ok = 0, all = 0, kind = 0;
  for (const id of M.walkIns) {
    const b = M.buildings[id];
    if (!b || !b.walkIn.south) continue;
    const cx = Math.floor(b.tx * TILE / CH), cy = Math.floor(((b.ty + b.th) * TILE - 1) / CH), k = cy * 1000 + cx;
    if (!byChunk.has(k)) byChunk.set(k, staticItems(M, cx, cy, {}));
    const recs = byChunk.get(k).filter((it) => it.b === id && it.door).flatMap((it) => it.door);
    for (const u of b.walkIn.units) {
      all++;
      const x = (u.door.tx + u.door.w / 2) * TILE, r = recs.find((q) => Math.abs(q[0] + q[2] / 2 - x) < 12);
      if (!r) continue;
      ok++;
      if (r[4] === (unitDoor(u) === 'slide' ? 1 : 0)) kind++;
    }
  }
  assert.ok(all > 500, `${all} walk-ins' doorways`);
  assert.ok(ok / all > 0.97, `the door drawn at the doorway: ${ok} of ${all}`);   // (a strip mall's row of shops still shares one front: the rest)
  assert.ok(kind / ok > 0.95, `of the trade's kind: ${kind} of ${ok}`);
});
