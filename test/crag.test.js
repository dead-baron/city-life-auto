// Rock you can see (the owner, 2026-10-21: "rock or cliff formations ... you can see it on the minimap and can't walk
// through it but it doesn't load in game"): a cliff's face is drawn on its south edge (a sprite); the rest of the rock
// - a band's top, its sides, a crag with no drop to the south - is the ground bake's, and it showed as plain ground.
// Now the wilds' rock (and a designed place's: reserve 32) is bare granite (client/art2/ground.js crag; red rock in the
// desert): grey slabs split by dark cracks, raised so they cast their shadow. The city's walls keep their foundation.
import test from 'node:test';
import assert from 'node:assert/strict';
import { CHUNK } from '../client/art2/game/chunkbake.js';
import { bakeGround } from '../client/art2/game/groundbake.js';
import { generateCity, DISTRICTS } from '../shared/map.js';
import { T, TILE } from '../shared/constants.js';
import { GSHADE, gsReset, GS } from '../client/art2/ground.js';

test('the rock material: grey slabs, dark cracks between them, raised, tilted to the light', () => {
  let cracks = 0, slabs = 0, high = 0, lit = 0;
  for (let y = 0; y < 120; y++) for (let x = 0; x < 120; x++) {
    gsReset();
    const c = GSHADE.crag(x, y, 7), grey = Math.abs(c[0] - c[2]) < 40;
    if (GS.h <= 4) cracks++; else { slabs++; if (GS.h >= 10) high++; if (GS.nx || GS.ny) lit++; }
    assert.ok(grey || (c[0] > c[2] + 40 && c[1] > c[2] + 40), `grey rock or yellow-green lichen (${c})`);
  }
  assert.ok(slabs > cracks * 4 && cracks > 50, `slabs (${slabs}) and the cracks between them (${cracks})`);
  assert.ok(high > slabs * 0.2 && lit > slabs * 0.9, 'raised, each slab tilted its own way');
});

test('the wilds\' rock is drawn as rock in the ground bake; a city wall keeps its foundation', () => {
  const M = generateCity(1337);
  const find = (ok) => { for (let ty = M.y0 + 30; ty < M.y0 + M.h - 30; ty += 2) for (let tx = M.x0 + 30; tx < M.x0 + M.w - 30; tx += 2) { const i = M.idx(tx, ty); if (M.tiles[i] !== T.WALL) continue; let all = true; for (let d = -1; d <= 1 && all; d++) for (let e = -1; e <= 1; e++) if (M.tiles[M.idx(tx + e, ty + d)] !== T.WALL) { all = false; break; } if (all && ok(i)) return [tx, ty]; } return null; };
  const style = (i) => (DISTRICTS[M.dist[i]] || {}).style;
  const wild = find((i) => (!M.reserve[i] || (M.reserve[i] & 32)) && ['wild', 'rocky', 'rural'].includes(style(i)));
  assert.ok(wild, 'bare rock out in the wilds on the map');
  const at = ([tx, ty]) => {
    const cx = Math.floor(tx * TILE / CHUNK), cy = Math.floor(ty * TILE / CHUNK), g = bakeGround(M, cx, cy, { quality: 0, seed: 1337 });   // (the ground's own: a cliff sprite drawn over it is the statics')
    let z = 0, n = 0, grey = 0;
    for (let y = 8; y < 24; y += 2) for (let x = 8; x < 24; x += 2) { const px = tx * TILE + x - cx * CHUNK, py = ty * TILE + y - cy * CHUNK, j = py * CHUNK + px; z += g.z[j]; n++; if (Math.abs(g.col[j * 4] - g.col[j * 4 + 2]) < 40) grey++; }
    return { z: z / n, grey: grey / n };
  };
  const r = at(wild);
  assert.ok(r.z > 5 && r.grey > 0.6, `raised grey rock at ${wild} (z ${r.z.toFixed(1)}, grey ${r.grey})`);
  const city = find((i) => !M.reserve[i] && ['commercial', 'towers', 'oldtown', 'apartments'].includes(style(i)));
  if (city) assert.ok(at(city).z < 5, 'a city wall: its foundation, flat');
});
