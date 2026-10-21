// Kestrel Lake by hand (shared/world3-kestrel.js): the south shore's straight runs wander - bays dug back into the
// meadow, points built out, reeds and lilies in the bays - and Kestrel Beach on the east shore: its sand, the lifeguard
// chair, umbrellas, the swim area's floats and raft, blankets on the grass; and Willow Valley's farm ponds
// (shared/world3-farmponds.js); its countryside (shared/world3-verges.js): green banks between the fields and the
// rivers, power lines along the county roads; (part 2) the fields square at the valley's edge, the farm lanes. One
// World v3 build.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateCity } from '../shared/map.js';
import '../shared/world3-islands.js';
import { T, TILE } from '../shared/constants.js';
import { FRAME_W, FRAME_H } from '../shared/world3.js';
import { KESTREL3 } from '../shared/world3-kestrel.js';
import { FARMPONDS } from '../shared/world3-farmponds.js';
import { habitatAt } from '../server/systems/fishing.js';
import { prepare } from '../tools/world3-build.mjs';

test('World v3: Kestrel Lake\'s south shore wanders (bays, points, reeds), Kestrel Beach, the farm ponds, the valley\'s banks and power lines', { timeout: 400000 }, () => {
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
  // the farm ponds
  const FP = m.world3.farmPonds;
  console.log('ponds', JSON.stringify(FP));
  assert.ok(FP.ponds.length >= FARMPONDS.n - 1, `${FP.ponds.length} farm ponds`);
  for (const q of FP.ponds) {
    let water = 0, field = 0;
    for (let y = q.y - q.r - 2; y <= q.y + q.r + 2; y++) for (let x = q.x - q.r - 2; x <= q.x + q.r + 2; x++) { const i = y * W + x; if (m.tiles[i] === T.WATER && m.lake[i] === 2) water++; if (m.tiles[i] === T.FIELD) field++; }
    assert.ok(water >= q.r * q.r * 2, `${q.name}: its water (${water})`);
    assert.equal(field, 0, `${q.name}: off the fields`);
    assert.equal(m.dist[q.y * W + q.x], 49, `${q.name}: in Willow Valley`);
    const site = m.natureSites.find((s2) => s2.kind === 'pond' && s2.name === q.name);
    const jt = Math.floor(site.jetty.x / TILE), jy = Math.floor(site.jetty.y / TILE);
    assert.equal(m.tiles[jy * W + jt], T.DOCK, `${q.name}: its jetty`);
    const pn = (t, r) => m.props.filter((p) => p && p.t === t && Math.hypot(p.x - site.x, p.y - site.y) < r * TILE);
    assert.ok(pn('shrub_a', q.r + 2).filter((p) => p.sp === 'reeds' || p.sp === 'cattails').length >= 3 && pn('lily', q.r).length >= 3, `${q.name}: reeds and lilies`);
    assert.ok(m.landmarks.some((l) => l.name === q.name && l.type === 'pond'), `${q.name} on the map`);
    assert.ok(['pond', 'lake'].includes(habitatAt({ map: m }, site.x, site.y).water), `${q.name}: still fresh water to fish (a big one fishes as a lake)`);
  }
  // the countryside: no field runs into the water, a green bank instead (willows on it); poles along the county roads
  const V = m.world3.verges;
  console.log('verges', JSON.stringify(V));
  const wetT = (i) => m.tiles[i] === T.WATER || m.tiles[i] === T.DEEP;
  let touching = 0;
  for (let i = W; i < W * (m.h - 1); i++) if (m.tiles[i] === T.FIELD && m.dist[i] === 49 && (wetT(i - 1) || wetT(i + 1) || wetT(i - W) || wetT(i + W))) touching++;
  assert.equal(touching, 0, 'no field runs into the water');
  assert.ok(V.bank >= 500 && V.willows >= 8, `the green banks (${V.bank} tiles, ${V.willows} willows)`);
  const poles = m.props.filter((p) => p && p.t === 'upole' && m.dist[Math.floor(p.y / TILE) * W + Math.floor(p.x / TILE)] === 49);
  assert.ok(V.poles >= 300 && poles.length >= 300, `poles along the county roads (${V.poles})`);
  assert.ok(poles.every((p) => { const t = m.tiles[Math.floor(p.y / TILE) * W + Math.floor(p.x / TILE)]; return t === T.GRASS || t === T.DIRT || t === T.FIELD; }), 'every pole on open ground');
  assert.ok(poles.filter((p) => p.wx !== undefined).length >= poles.length * 0.6, 'wired pole to pole');
  // (part 2) the fields square at the valley's edge: none runs out of the valley
  const outOfValley = m.fields.filter((f) => {
    const x0 = Math.round(f.x / TILE), y0 = Math.round(f.y / TILE), x1 = Math.round((f.x + f.w) / TILE), y1 = Math.round((f.y + f.h) / TILE);
    if (m.dist[Math.floor((y0 + y1) / 2) * W + Math.floor((x0 + x1) / 2)] !== 49) return false;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = y * W + x; if (m.land[i] && m.dist[i] !== 49) return true; }
    return false;
  });
  assert.equal(outOfValley.length, 0, `no field runs out of the valley (${outOfValley.length})`);
  assert.ok(V.squared >= 10, `fields squared at the valley's edge (${V.squared})`);
  // (part 2) a lane from every farmyard (it reaches some 13 tiles past the house) to a road: a grass centre strip between dirt ruts, gateposts and a mailbox at the road
  const farms = m.buildings.filter((b) => b && b.kind === 'farmstead' && m.dist[Math.floor(b.ty + b.th / 2) * W + Math.floor(b.tx + b.tw / 2)] === 49);
  assert.ok(farms.length >= 10 && V.lanes === farms.length, `a lane to every farmstead (${V.lanes} of ${farms.length})`);
  assert.ok(V.laneTiles > 60 * V.lanes, `the lanes' ground (${V.laneTiles} tiles)`);
  const laneAt = (x, y) => { const i = y * W + x; return m.tiles[i] === T.GRASS && (m.reserve[i] & 160) === 160; };
  for (const b of farms) {
    let near = false;
    for (let y = b.ty - 16; y <= b.ty + b.th + 16 && !near; y++) for (let x = b.tx - 16; x <= b.tx + b.tw + 16; x++) if (laneAt(x, y)) { near = true; break; }
    assert.ok(near, `a lane from the farmstead at ${b.tx},${b.ty}`);
  }
  const roadNear = (p, r) => { const tx = Math.floor(p.x / TILE), ty = Math.floor(p.y / TILE); for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (m.tiles[(ty + dy) * W + tx + dx] === T.ROAD) return true; return false; };
  const boxes = m.props.filter((p) => p && p.t === 'mailbox' && m.dist[Math.floor(p.y / TILE) * W + Math.floor(p.x / TILE)] === 49 && roadNear(p, 4));
  assert.ok(boxes.length >= V.lanes, `a mailbox at each lane's gate (${boxes.length})`);
});
