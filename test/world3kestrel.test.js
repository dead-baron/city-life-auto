// Kestrel Lake by hand (shared/world3-kestrel.js): the south shore's straight runs wander - bays dug back into the
// meadow, points built out, reeds and lilies in the bays - and Kestrel Beach on the east shore: its sand, the lifeguard
// chair, umbrellas, the swim area's floats and raft, blankets on the grass. One World v3 build.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateCity } from '../shared/map.js';
import '../shared/world3-islands.js';
import { T, TILE } from '../shared/constants.js';
import { FRAME_W, FRAME_H } from '../shared/world3.js';
import { KESTREL3 } from '../shared/world3-kestrel.js';
import { prepare } from '../tools/world3-build.mjs';

test('World v3: Kestrel Lake\'s south shore wanders (bays, points, reeds) and Kestrel Beach', { timeout: 400000 }, () => {
  const prep = prepare();
  const m = generateCity(1337, { world3: true, frame: { w: FRAME_W, h: FRAME_H }, land: prep.land, today: prep.today });
  const K = m.world3.kestrel, W = m.w;
  console.log('kestrel', JSON.stringify(K));
  const lakeAt = (x, y) => { const i = y * W + x; return (m.tiles[i] === T.WATER || m.tiles[i] === T.DEEP) && m.lake[i] === 1; };
  // the south shore: no long straight run left (the shore's row from the south, column by column)
  const S = KESTREL3.south, rows = [];
  for (let x = S.x[0]; x <= S.x[1]; x++) { let y = S.y[1]; while (y > S.y[0] && !lakeAt(x, y)) y--; rows.push(y > S.y[0] ? y : -1); }
  let run = 0, longest = 0;
  for (let k = 1; k < rows.length; k++) { if (rows[k] >= 0 && rows[k - 1] >= 0 && rows[k] === rows[k - 1]) run++; else run = 0; longest = Math.max(longest, run); }
  assert.ok(longest < 40, `no long straight stretch of the south shore (${longest} tiles)`);
  assert.ok(K.bays >= 4 && K.dug > 150, `bays dug into the meadow (${K.bays}, ${K.dug} tiles)`);
  const span = Math.max(...rows.filter((y) => y >= 0)) - Math.min(...rows.filter((y) => y >= 0));
  assert.ok(span >= 6, `the shore wanders (${span} rows)`);
  // nothing dug into a field; the docks still reach the water
  for (let y = S.y[0]; y <= S.y[1]; y++) for (let x = S.x[0]; x <= S.x[1]; x++) assert.ok(!(m.tiles[y * W + x] === T.FIELD && m.lake[y * W + x]), 'no field flooded');
  for (const nm of ['Reed Bay Fishing Dock', 'Kestrel Lake Boathouse']) {
    const l = m.landmarks.find((q) => q.name === nm);
    assert.ok(l, nm);
    let wet = 0; for (let y = Math.floor(l.y / TILE) - 2; y < (l.y + l.h) / TILE + 2; y++) for (let x = Math.floor(l.x / TILE) - 2; x < (l.x + l.w) / TILE + 2; x++) if (lakeAt(x, y)) wet++;
    assert.ok(wet > 10, `${nm} still on the water (${wet})`);
  }
  // the bays' reeds in the water
  const reeds = m.props.filter((p) => p && p.t === 'shrub_a' && (p.sp === 'reeds' || p.sp === 'cattails') && p.x / TILE >= S.x[0] && p.x / TILE <= S.x[1] && p.y / TILE >= S.y[0] && p.y / TILE <= S.y[1] && lakeAt(Math.floor(p.x / TILE), Math.floor(p.y / TILE)));
  assert.ok(reeds.length >= 20, `reeds and cattails in the bays (${reeds.length})`);
  // Kestrel Beach
  const B = m.landmarks.find((q) => q.name === KESTREL3.beach.name && q.type === 'beach');
  assert.ok(B && K.beach, 'Kestrel Beach on the map');
  const cx = K.beach.x, cy = K.beach.y, near = (t, r) => m.props.filter((p) => p && p.t === t && Math.hypot(p.x - cx, p.y - cy) < r * TILE);
  let sand = 0; for (let y = Math.floor(cy / TILE) - 30; y <= cy / TILE + 30; y++) for (let x = Math.floor(cx / TILE) - 30; x <= cx / TILE + 30; x++) { const i = y * W + x; if (m.tiles[i] === T.SAND && (m.reserve[i] & 36) === 36) sand++; }
  assert.ok(sand >= 200, `its sand (${sand} tiles)`);
  assert.equal(near('lguard', 20).length, 1, 'the lifeguard chair');
  assert.ok(near('umbrella_r', 26).length + near('umbrella_y', 26).length + near('umbrella_b', 26).length + near('umbrella_g', 26).length >= 4, 'umbrellas');
  assert.ok(near('towel', 26).length >= 4 && near('blanket', 30).length >= 2, 'towels, blankets');
  const floats = near('swimbuoy', 40);
  assert.ok(floats.length >= 20 && floats.every((p) => lakeAt(Math.floor(p.x / TILE), Math.floor(p.y / TILE))), `the swim area's floats on the water (${floats.length})`);
  const raft = near('swimraft', 40);
  assert.ok(raft.length === 1 && lakeAt(Math.floor(raft[0].x / TILE), Math.floor(raft[0].y / TILE)), 'the raft out in it');
  assert.ok(near('textsign', 30).some((p) => p.text === 'KESTREL BEACH'), 'its sign');
});
