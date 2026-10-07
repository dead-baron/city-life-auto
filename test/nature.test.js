// The designed nature places (shared/naturesites.js) and the wild's layout (shared/map.js buildWilds).
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateCity, DISTRICTS } from '../shared/map.js';
import { T, TILE } from '../shared/constants.js';

const m = generateCity(1337);
const tileAt = (x, y) => m.tiles[Math.floor(y / TILE) * m.w + Math.floor(x / TILE)];
const solidNear = (x, y, r) => { for (const arr of m.solidProps.values()) for (const e of arr) if (Math.hypot(e.x - x, e.y - y) <= r) return true; return false; };

test('Redwood Creek: Highland Road crosses the creek on a railed bridge; falls, pool, footbridge, camp, pull-off', () => {
  const s = (m.natureSites || []).find((q) => q.kind === 'creek');
  assert.ok(s, 'the creek is built');
  assert.equal(DISTRICTS[m.dist[Math.floor(s.y / TILE) * m.w + Math.floor(s.x / TILE)]].name, 'Highland Woods');
  // the road stays a road over the creek, with water either side of it and a solid rail along both edges
  const b = s.bridge, ux = Math.cos(b.a), uy = Math.sin(b.a), nx = -uy, ny = ux;
  assert.equal(tileAt(b.x, b.y), T.ROAD, 'the road runs on over the creek');
  let water = 0;
  for (const side of [-1, 1]) for (let t = 0; t < 60; t += 8) if (tileAt(b.x + nx * side * (b.roadHw + 20 + t), b.y + ny * side * (b.roadHw + 20 + t)) === T.WATER) { water++; break; }
  assert.equal(water, 2, 'the creek on both sides of the road');
  for (const side of [-1, 1]) for (const k of [-80, 0, 80]) assert.ok(solidNear(b.x + ux * k + nx * side * (b.roadHw + 6), b.y + uy * k + ny * side * (b.roadHw + 6), 14), `a rail on the ${side < 0 ? 'west' : 'east'} edge`);
  // the pool below the falls is water you can swim in; the ledge above it is solid
  assert.equal(tileAt(s.pool.x, s.pool.y), T.WATER);
  assert.ok(solidNear(s.falls.x, s.falls.y - 8, 12), 'the ledge is solid');
  // the footbridge: planks you walk across
  let planks = 0;
  for (let t = -80; t <= 80; t += 8) if (tileAt(s.footbridge.x + Math.cos(s.footbridge.a) * t, s.footbridge.y + Math.sin(s.footbridge.a) * t) === T.DOCK) planks++;
  assert.ok(planks >= 3, `the footbridge has planks (${planks})`);
  // the camp: a lit fire, tents; the pull-off: a gravel lot with a picnic table
  const near = (t, p, r) => m.props.some((q) => q && q.t === t && Math.hypot(q.x - p.x, q.y - p.y) < r);
  assert.ok(near('campfire', s.camp, 40) && m.props.some((q) => q && q.t === 'campfire' && q.lit && Math.hypot(q.x - s.camp.x, q.y - s.camp.y) < 40), 'a lit campfire');
  assert.ok(near('tent', s.camp, 160), 'tents');
  assert.equal(tileAt(s.pulloff.x, s.pulloff.y), T.LOT);
  assert.ok(near('picnic', s.pulloff, 90), 'a picnic table at the pull-off');
  // giant redwoods, and the place on the map
  assert.ok(m.props.filter((q) => q && q.sp === 'redwood' && Math.hypot(q.x - s.x, q.y - s.y) < 900).length >= 6, 'giant redwoods round it');
  assert.ok(m.landmarks.some((l) => l.name === 'Redwood Creek Falls'));
});

test('the wild grows in groves of one kind of tree, clear of the roads', () => {
  const wild = m.props.filter((p) => p && (p.t === 'tree_a' || p.t === 'tree_b') && p.g !== undefined);
  assert.ok(wild.length > 6000, `plenty of wild trees (${wild.length})`);
  // groves: most wild trees have another within 100 px (they grow together, not scattered evenly)
  const grid = new Map(), k = (x, y) => Math.floor(x / 128) * 1000 + Math.floor(y / 128);
  for (const p of wild) { const key = k(p.x, p.y); if (!grid.has(key)) grid.set(key, []); grid.get(key).push(p); }
  let close = 0;
  for (const p of wild.slice(0, 2000)) {
    let found = false;
    for (let dx = -1; dx <= 1 && !found; dx++) for (let dy = -1; dy <= 1 && !found; dy++) for (const q of grid.get(k(p.x + dx * 128, p.y + dy * 128)) || []) if (q !== p && Math.hypot(q.x - p.x, q.y - p.y) < 100) { found = true; break; }
    if (found) close++;
  }
  assert.ok(close / 2000 > 0.75, `trees grow together (${(close / 20).toFixed(0)}% have a neighbour within 100 px)`);
  // no wild tree stands on or right beside a road
  for (const p of wild) {
    const tx = Math.floor(p.x / TILE), ty = Math.floor(p.y / TILE);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) assert.notEqual(m.tileAt(tx + dx, ty + dy), T.ROAD, `a tree at ${p.x},${p.y} is by a road`);
  }
  // one kind of tree per stand: neighbours mostly share it
  let same = 0, pairs = 0;
  for (const p of wild.slice(0, 3000)) for (const q of grid.get(k(p.x, p.y)) || []) if (q !== p && Math.hypot(q.x - p.x, q.y - p.y) < 90) { pairs++; if (q.g === p.g) same++; }
  assert.ok(same / pairs > 0.85, `stands are one kind (${(same / pairs * 100).toFixed(0)}%)`);
});

test('Red Rock Canyon: the oasis pool under the north mesa, the spring, palms; the mesas stay solid', () => {
  const s = (m.natureSites || []).find((q) => q.kind === 'oasis');
  assert.ok(s, 'the oasis is built');
  assert.equal(tileAt(s.x, s.y), T.WATER, 'a pool you can swim in');
  assert.equal(tileAt(s.spring.x, s.spring.y - 40), T.WALL, 'the spring falls down the solid cliff');
  assert.ok(m.props.filter((q) => q && q.sp && /palm|date|desertFan|coconut/i.test(q.sp) && Math.hypot(q.x - s.x, q.y - s.y) < 240).length >= 3, 'palms round it');
  const pt = m.paintings.find((p) => p.key === 'canyon');
  let wall = 0;
  for (let ty = pt.y / TILE; ty < (pt.y + pt.h) / TILE; ty++) for (let tx = pt.x / TILE; tx < (pt.x + pt.w) / TILE; tx++) if (m.tiles[ty * m.w + tx] === T.WALL) wall++;
  assert.ok(wall > 400, `the mesas are solid (${wall} tiles)`);
  assert.ok(m.landmarks.some((l) => l.name === 'Canyon Oasis'));
});

test('Lighthouse Rock: tidepools among barnacled rocks, life in them, sea stacks and seals offshore, the keeper\'s cottage', () => {
  const s = (m.natureSites || []).find((q) => q.kind === 'tidepools');
  assert.ok(s && s.pools >= 8, `tidepools (${s && s.pools})`);
  const near = (t, r = 1400) => m.props.filter((q) => q && q.t === t && Math.hypot(q.x - s.x, q.y - s.y) < r);
  assert.ok(near('starfish').length + near('urchin').length + near('anemone').length >= 12, 'life in the pools');
  assert.ok(near('boulder').filter((q) => q.barn).length >= 12, 'barnacled rocks round them');
  assert.ok(near('seastack', 2200).length >= 2 && near('sealrock', 2200).length === 1 && near('seal', 2200).length >= 2, 'stacks, the seal rock and its seals');
  for (const q of near('seastack', 2200)) assert.ok([T.WATER, T.DEEP].includes(tileAt(q.x, q.y)) && solidNear(q.x, q.y, 4), 'a stack stands in the water and is solid');
  assert.ok(solidNear(s.cottage.x, s.cottage.y, 20), 'the cottage is solid');
  // no desert plants on a sea island
  const isle = m.props.filter((q) => q && m.dist[Math.floor(q.y / TILE) * m.w + Math.floor(q.x / TILE)] === 19);
  assert.equal(isle.filter((q) => q.t === 'cactus').length, 0, 'no cactus on Lighthouse Rock');
  assert.ok(m.landmarks.some((l) => l.name === 'Lighthouse Tidepools'));
});

test('camps: campground fires get seats and kit; a bonfire on the beach; a desert camp on dry ground', () => {
  const camps = m.landmarks.filter((l) => l.type === 'camp' && l.name.endsWith('Campground'));
  for (const L of camps) {
    const inL = (p) => p.x >= L.x && p.x < L.x + L.w && p.y >= L.y && p.y < L.y + L.h;
    const kit = m.props.filter((p) => p && inL(p) && ['chair', 'cooler', 'lantern', 'festoon', 'woodpile'].includes(p.t));
    assert.ok(kit.length >= 4, `${L.name}: camp kit (${kit.length})`);
  }
  const b = m.natureSites.find((q) => q.kind === 'bonfire');
  assert.ok(b, 'the bonfire is built');
  assert.equal(tileAt(b.x, b.y), T.SAND);
  assert.ok(m.props.some((p) => p && p.t === 'campfire' && p.big && Math.hypot(p.x - b.x, p.y - b.y) < 8), 'a big fire');
  const d = m.natureSites.find((q) => q.kind === 'desertcamp');
  assert.ok(d, 'the desert camp is built');
  for (const p of m.props.filter((q) => q && Math.hypot(q.x - d.x, q.y - d.y) < 240 && ['campfire', 'chair', 'windmill', 'post', 'cooler'].includes(q.t))) assert.notEqual(tileAt(p.x, p.y), T.WATER, `${p.t} on dry ground`);
});

test('Granite Peaks: Summit Tarn spills over a solid ledge into a creek; the cabin meadow; the fire lookout; no desert plants', () => {
  const s = (m.natureSites || []).find((q) => q.kind === 'tarn');
  assert.ok(s, 'the tarn is built');
  assert.ok(solidNear(s.falls.x, s.falls.y - 6, 12), 'the ledge is solid');
  assert.equal(tileAt(s.falls.x, s.falls.y + 120), T.WATER, 'the creek below the falls');
  assert.ok(solidNear(s.cabin.x, s.cabin.y, 16), 'the cabin is solid');
  assert.ok(m.props.some((p) => p && p.t === 'lookout'), 'the fire lookout');
  assert.ok(s.outcrops >= 5, 'granite outcrops round the shore');
  const peaks = m.props.filter((q) => q && m.dist[Math.floor(q.y / TILE) * m.w + Math.floor(q.x / TILE)] === 33);
  assert.equal(peaks.filter((q) => q.t === 'cactus').length, 0, 'no cactus in Granite Peaks');
});

test('Heron Marsh: channels and reed islands, a boardwalk you can walk, the beaver dam (solid), the pier, wildlife', () => {
  const s = (m.natureSites || []).find((q) => q.kind === 'marsh');
  assert.ok(s && s.marsh > 60, `marsh channels (${s && s.marsh})`);
  let planks = 0;
  for (let y = s.boardwalk.y0; y <= s.boardwalk.y1; y += 32) if (tileAt(s.boardwalk.x, y) === T.DOCK) planks++;
  assert.ok(planks >= 6, `the boardwalk is planks all the way (${planks})`);
  assert.ok(solidNear(s.dam.x, s.dam.y, 12), 'the beaver dam is solid');
  const near = (t) => m.props.filter((q) => q && q.t === t && Math.hypot(q.x - s.x, q.y - s.y) < 1400).length;
  assert.ok(near('lily') >= 8 && near('swan') >= 1 && near('duck') >= 2 && near('heron') >= 1, 'lilies, swans, ducks, a heron');
  assert.ok(m.props.filter((q) => q && (q.sp === 'cattails' || q.sp === 'reeds') && Math.hypot(q.x - s.x, q.y - s.y) < 700).length >= 30, 'reeds and cattails');
  assert.ok(m.landmarks.some((l) => l.name === 'Heron Marsh'));
});

test('Northshore Botanical Gardens: the random park dressing gives way to the garden; the bridge is walkable', () => {
  const s = (m.natureSites || []).find((q) => q.kind === 'gardens');
  assert.ok(s, 'the gardens are built');
  const near = (t) => m.props.filter((q) => q && q.t === t && Math.hypot(q.x - s.x, q.y - s.y) < 900).length;
  for (const t of ['greenhouse', 'redbridge', 'stonelantern', 'raisedbed', 'beehive', 'statue', 'scarecrow']) assert.ok(near(t) >= 1, t);
  assert.ok(m.props.filter((q) => q && q.sp === 'lavender' && Math.hypot(q.x - s.x, q.y - s.y) < 900).length >= 10, 'lavender rows');
  // the bridge's planks cross the pond
  const br = m.props.find((q) => q && q.t === 'redbridge');
  assert.equal(tileAt(br.x, br.y), T.DOCK, 'planks under the red bridge');
  // a dropped prop leaves no solid behind
  for (const [i, p] of m.props.entries()) if (p && p.t === 'painted' && Math.hypot(p.x - s.x, p.y - s.y) < 900) assert.ok(!m.propSolid.has(i), 'no solid left for a cleared prop');
  assert.ok(m.landmarks.some((l) => l.name === 'Northshore Botanical Gardens'));
});

test('the Old Granite Mine: a solid cliff with its adit, rails and a cart out of it, a track to the road', () => {
  const s = (m.natureSites || []).find((q) => q.kind === 'mine');
  assert.ok(s, 'the mine is built');
  assert.equal(tileAt(s.x, s.y - 40), T.WALL, 'the cliff is solid');
  assert.equal(tileAt(s.x, s.y + 60), T.DIRT, 'dirt in front of the mouth');
  assert.ok(m.props.some((p) => p && p.t === 'minecart' && Math.hypot(p.x - s.x, p.y - s.y) < 200), 'the ore cart');
  assert.ok(m.landmarks.some((l) => l.name === 'Old Granite Mine'));
});

test('farms: a fenced pasture (solid fence) by every farm, open grass inside', () => {
  const pastures = m.natureSites.filter((q) => q.kind === 'pasture' && m.pois.some((p) => p.kind === 'farm' && q.name === `${p.label} Pasture`));   // (not Willow River's paddock)
  assert.equal(pastures.length, m.pois.filter((p) => p.kind === 'farm').length, 'one per farm');
  for (const s of pastures) {
    assert.equal(tileAt(s.x, s.y), T.GRASS, 'grass inside');
    assert.ok(m.props.some((p) => p && p.t === 'windmill' && Math.hypot(p.x - s.x, p.y - s.y) < 300), 'a windmill');
    assert.ok(!m.props.some((p) => p && (p.t === 'tree_a' || p.t === 'tree_b') && Math.abs(p.x - s.x) < 170 && Math.abs(p.y - s.y) < 130), 'no tree in the pasture');
  }
});

test('country roads: something by the verge every 100 m or so, nothing solid near the road', () => {
  assert.ok(m.roadsideN >= 40, `roadside features (${m.roadsideN})`);
  const kinds = new Set(['roadsign', 'mailbox', 'stand', 'fingerpost', 'mapboard', 'pbench', 'picnic', 'scope', 'hayBale']);
  for (const p of m.props) {
    if (!p || !kinds.has(p.t)) continue;
    const tx = Math.floor(p.x / TILE), ty = Math.floor(p.y / TILE);
    assert.notEqual(m.tileAt(tx, ty), T.ROAD, `${p.t} at ${Math.round(p.x)},${Math.round(p.y)} stands on the road`);
  }
});

test('Coral Cay: a rainforest of palm groves on a jungle floor, a waterfall and its pool, a trail in', () => {
  const s = (m.natureSites || []).find((q) => q.kind === 'rainforest');
  assert.ok(s && s.floor > 500, `a big jungle (${s && s.floor} tiles)`);
  assert.ok(solidNear(s.falls.x, s.falls.y - 6, 12), 'the ledge is solid');
  assert.equal(tileAt(s.falls.x, s.falls.y + 64), T.WATER, 'the pool');
  const palms = m.props.filter((q) => q && q.t === 'palm_a' && m.dist[Math.floor(q.y / TILE) * m.w + Math.floor(q.x / TILE)] === 44);
  assert.ok(palms.length > 150, `palm groves (${palms.length})`);
  for (const p of palms) { const tx = Math.floor(p.x / TILE), ty = Math.floor(p.y / TILE); assert.notEqual(m.tileAt(tx, ty), T.ROAD); }
});

test('Willow River: falls over a basalt escarpment, a stone bridge on the Oil Field Road, a lake below, a barn and a paddock', () => {
  const s = (m.natureSites || []).find((q) => q.kind === 'river');
  assert.ok(s, 'the river is built');
  assert.equal(DISTRICTS[m.dist[Math.floor(s.y / TILE) * m.w + Math.floor(s.x / TILE)]].name, 'Dry Creek');
  // the road runs on over the river; water on both sides of it; stone parapets along both edges
  const b = s.bridge, ux = Math.cos(b.a), uy = Math.sin(b.a), nx = -uy, ny = ux;
  assert.equal(tileAt(b.x, b.y), T.ROAD, 'the road runs on over the river');
  let water = 0;
  for (const side of [-1, 1]) for (let t = 0; t < 80; t += 8) if (tileAt(b.x + nx * side * (b.roadHw + 16 + t), b.y + ny * side * (b.roadHw + 16 + t)) === T.WATER) { water++; break; }
  assert.equal(water, 2, 'the river on both sides of the road');
  for (const side of [-1, 1]) for (const k of [-100, 0, 100]) assert.ok(solidNear(b.x + ux * k + nx * side * (b.roadHw + 6), b.y + uy * k + ny * side * (b.roadHw + 6), 14), 'a parapet along each edge');
  // fresh water: fishable river and lake, the lake flagged as a lake
  const ri = Math.floor(s.pool.y / TILE) * m.w + Math.floor(s.pool.x / TILE), li = Math.floor(s.lake.y / TILE) * m.w + Math.floor(s.lake.x / TILE);
  assert.ok(m.river[ri] && m.tiles[ri] === T.WATER, 'the plunge pool is river water');
  assert.ok(m.lake[li] && m.river[li] && m.tiles[li] === T.WATER, 'Willow Lake is a lake');
  // the escarpment either side of the falls is solid rock; the falls' notch is open water
  let rock = 0;
  for (const cw of s.cliffs) for (let k = -0.4; k <= 0.4; k += 0.2) if (tileAt(cw.x + ux * cw.len * k, cw.y + uy * cw.len * k - 30) === T.WALL) rock++;
  assert.ok(rock >= 8, `the escarpment is rock (${rock})`);
  // it stays off the railway and the city highway (no water within reach of either)
  for (const p of m.rail.pts) if (Math.abs(p.x - s.lake.x) < 1600 && Math.abs(p.y - s.lake.y) < 1600) assert.notEqual(tileAt(p.x, p.y), T.WATER, 'no water on the line');
  // the barn is solid; the paddock is in the nature sites (the livestock graze there); willows and reeds' shore
  assert.ok(s.barn && tileAt((s.barn.tx + 3) * TILE, (s.barn.ty + 2) * TILE) === T.WALL, 'the barn stands solid');
  assert.ok(m.natureSites.some((q) => q.kind === 'pasture' && q.name === 'Willow River Pasture'), 'the paddock');
  assert.ok(m.props.filter((q) => q && q.sp === 'willow' && Math.hypot(q.x - s.x, q.y - s.y) < 2000).length >= 8, 'willows along it');
  assert.ok(m.props.some((q) => q && q.t === 'canoe' && Math.hypot(q.x - s.lake.x, q.y - s.lake.y) < 700), 'a boat on the lake');
  assert.ok(m.landmarks.some((l) => l.name === 'Willow River Falls') && m.landmarks.some((l) => l.name === 'Willow Lake'));
});

test('Granite Cove: a sandy bay in the cliffs below the campground, steps down, a beach bar, open sea water', () => {
  const s = (m.natureSites || []).find((q) => q.kind === 'cove');
  assert.ok(s, 'the cove is built');
  const ti = (x, y) => Math.floor(y / TILE) * m.w + Math.floor(x / TILE);
  // the bay is sea water (not river, not lake) you can swim in, joined to the open sea
  const bay = ti(s.x, s.y + 4 * TILE);
  assert.ok(m.tiles[bay] === T.WATER && !m.land[bay] && !m.river[bay] && !m.lake[bay], 'the bay is sea');
  // a beach of sand between the cliffs and the water; the cliffs are solid rock, with a gap for the steps
  assert.equal(tileAt(s.x, s.y - 3 * TILE), T.SAND, 'sand on the beach');
  let rock = 0;
  for (const [dx, dy] of [[-9, -6], [9, -6], [-11, -3], [11, -3], [-4, -10], [5, -10]]) if (tileAt(s.x + dx * TILE, s.y + dy * TILE) === T.WALL) rock++;
  assert.ok(rock >= 5, `cliffs round the back and sides (${rock})`);
  assert.notEqual(tileAt(s.steps.x, (s.steps.y0 + s.steps.y1) / 2), T.WALL, 'the steps go up through a gap');
  assert.ok(m.props.some((q) => q && q.t === 'stairs' && Math.hypot(q.x - s.steps.x, q.y - s.steps.y1) < 20), 'the steps');
  assert.ok(m.props.some((q) => q && q.t === 'beachbar' && Math.hypot(q.x - s.bar.x, q.y - s.bar.y) < 20), 'the beach bar');
  assert.ok(m.props.filter((q) => q && /^umbrella_/.test(q.t) && Math.hypot(q.x - s.x, q.y - s.y) < 300).length >= 3, 'umbrellas on the sand');
  for (const q of m.props) if (q && (q.t === 'towel' || /^umbrella_/.test(q.t)) && Math.hypot(q.x - s.x, q.y - s.y) < 400) assert.equal(tileAt(q.x, q.y), T.SAND, `${q.t} on the sand`);
  assert.ok(m.landmarks.some((l) => l.name === 'Granite Cove'));
});

test('Lakeview Park: gravel paths from the gates to the fountain, a duck pond with a footbridge, the gazebo and the statue', () => {
  const s = (m.natureSites || []).find((q) => q.kind === 'park' && q.name === 'Lakeview Park');
  assert.ok(s, 'the park is built');
  const park = m.blocks.find((b) => b.park && b.park.label === 'Lakeview Park');
  const { ix, iy, iw, ih } = park;
  const inPark = (x, y) => x >= ix * TILE && x < (ix + iw) * TILE && y >= iy * TILE && y < (iy + ih) * TILE;
  // the fountain plaza stays, and the courier's counter in the park stands on a path
  assert.ok(m.props.some((q) => q && q.t === 'fountain' && inPark(q.x, q.y)), 'the fountain');
  for (const p of m.pois.filter((q) => inPark(q.x, q.y))) assert.equal(tileAt(p.x, p.y), T.PLAZA, `${p.kind} on a path`);
  // every path tile joins up: from the west gate you reach the fountain plaza, the gazebo and the statue on foot
  const walk = (t) => t === T.PLAZA || t === T.DOCK;
  const start = [ix, Math.floor(s.y / TILE)];
  assert.ok(walk(m.tiles[start[1] * m.w + start[0]]), 'a path at the west gate');
  const seen = new Set([start[1] * m.w + start[0]]), q = [start];
  while (q.length) {
    const [x, y] = q.pop();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy, i = ny * m.w + nx;
      if (nx < ix || ny < iy || nx >= ix + iw || ny >= iy + ih || seen.has(i) || !walk(m.tiles[i])) continue;
      seen.add(i); q.push([nx, ny]);
    }
  }
  const reach = (x, y) => seen.has(Math.floor(y / TILE) * m.w + Math.floor(x / TILE));
  assert.ok(reach(s.x, s.y), 'the fountain plaza is on the paths');
  assert.ok(reach(s.bridge.x, s.bridge.y), 'the footbridge is on the paths');
  assert.ok(reach(s.gazebo[0], s.gazebo[1] + 2 * TILE), 'the gazebo is on the paths');
  // the pond: water both sides of the bridge, planks under it; lilies on the water, willows on the grass
  assert.equal(tileAt(s.bridge.x, s.bridge.y), T.DOCK, 'planks under the bridge');
  assert.ok(m.props.some((q) => q && q.t === 'archbridge' && Math.hypot(q.x - s.bridge.x, q.y - s.bridge.y) < 40), 'the arched footbridge');
  const lilies = m.props.filter((q) => q && q.t === 'lily' && inPark(q.x, q.y));
  assert.ok(lilies.length >= 6, 'lily pads');
  for (const l of lilies) assert.ok([T.WATER, T.DEEP].includes(tileAt(l.x, l.y)), 'lilies on the water');
  for (const t of m.props) if (t && t.t === 'tree_a' && inPark(t.x, t.y)) assert.equal(tileAt(t.x, t.y), T.GRASS, 'trees on the lawns');
  assert.ok(m.props.filter((q) => q && q.t === 'tree_a' && inPark(q.x, q.y)).length >= 35, 'a well-treed park');
  for (const k of ['gazebo', 'statue', 'foodcart', 'blanket', 'swan', 'parksign']) assert.ok(m.props.some((q) => q && q.t === k && inPark(q.x, q.y)), k);
  // the ground is lawn and gravel paths (the plaza paved): the ground bake reads parkGrounds
  assert.ok((m.parkGrounds || []).some((r) => inPark(r.x + 1, r.y + 1) && r.plaza && inPark(r.plaza.x, r.plaza.y)));
  assert.ok(m.landmarks.some((l) => l.name === 'Lakeview Park'));
});

test('Route 9: the desert stop dressed like D14 - pumps under a canopy on a paved forecourt, the oil lease, an airstrip with a plane; its businesses where they were', () => {
  const s = (m.natureSites || []).find((q) => q.kind === 'diner' && q.name === 'Route 9');
  assert.ok(s, 'Route 9 is dressed');
  const pumps = m.pumps.filter((p) => Math.hypot(p.x - s.forecourt.x, p.y - s.forecourt.y) < 220);
  assert.equal(pumps.length, 4, 'four pumps on the forecourt');
  for (const p of pumps) assert.equal(tileAt(p.x, p.y), T.LOT, 'pumps on paving');
  // the stop's businesses stay: the quick stop, the bank (in the diner) and the fuel counter
  const kinds = m.pois.filter((p) => Math.abs(p.x - s.x) < 900 && Math.abs(p.y - s.y) < 500).map((p) => p.kind);
  for (const k of ['convenience', 'bank', 'delivery']) assert.ok(kinds.includes(k), k);
  const a = (m.natureSites || []).find((q) => q.kind === 'airstrip');
  assert.ok(a, 'the airstrip');
  assert.equal(tileAt(a.x, a.y), T.LOT, 'the strip is paved');
  assert.ok(m.props.some((q) => q && q.t === 'lplane' && Math.hypot(q.x - a.plane.x, q.y - a.plane.y) < 20), 'the plane');
  for (const k of ['pumpjack', 'flare', 'watertower', 'windsock', 'otank']) assert.ok(m.props.some((q) => q && q.t === k && Math.abs(q.x - s.x) < 2400 && Math.abs(q.y - s.y) < 1200), k);
  for (const q of m.props) if (q && q.t !== 'painted' && q.t !== 'rwlight' && q.t !== 'lplane' && q.t !== 'drum' && q.t !== 'propane' && Math.abs(q.x - a.x) < 400 && Math.abs(q.y - a.y) < 64) assert.fail(`${q.t} on the strip`);
  assert.ok(!m._late, 'the late paving is applied');
});

test('Pine Lake: a lake in the Highland pines with a boathouse and dock, a lakeside camp at the end of a track, an outlet creek with a footbridge', () => {
  const s = (m.natureSites || []).find((q) => q.kind === 'lakecamp' && q.name === 'Pine Lake');
  assert.ok(s, 'Pine Lake is built');
  const i = Math.floor(s.y / TILE) * m.w + Math.floor(s.x / TILE);
  assert.ok((m.tiles[i] === T.DEEP || m.tiles[i] === T.WATER) && m.lake[i], 'lake water in the middle');
  assert.ok(m.props.some((q) => q && q.t === 'boathouse' && Math.hypot(q.x - s.boathouse.x, q.y - s.boathouse.y) < 8), 'the boathouse');
  assert.equal(tileAt(s.pier.x, s.pier.y), T.DOCK, 'the dock is walkable planks');
  assert.ok(m.props.some((q) => q && q.t === 'canoe' && Math.hypot(q.x - s.pier.x, q.y - s.pier.y) < 120), 'a boat at the dock');
  // the camp: tents and a fire on dirt, reached by a dirt track
  for (const k of ['tent', 'campfire', 'picnic', 'woodpile']) assert.ok(m.props.some((q) => q && q.t === k && Math.hypot(q.x - s.camp.x, q.y - s.camp.y) < 200), k);
  assert.equal(tileAt(s.camp.x, s.camp.y), T.DIRT, 'the camp is on dirt');
  // the creek runs out to the sea and the trail crosses it on planks
  assert.ok(s.bridge, 'the footbridge');
  assert.equal(tileAt(s.bridge.x, s.bridge.y), T.DOCK, 'planks under the footbridge');
  assert.ok(m.props.some((q) => q && q.t === 'fbridge' && Math.hypot(q.x - s.bridge.x, q.y - s.bridge.y) < 8));
  // no tree in the water, and nothing tall at the water's edge from the wild woods
  for (const q of m.props) if (q && (q.t === 'tree_a' || q.t === 'tree_b') && Math.hypot(q.x - s.x, q.y - s.y) < 700) assert.ok(![T.WATER, T.DEEP].includes(tileAt(q.x, q.y)), 'a tree in the lake');
  assert.ok(s.trees >= 60, `woods round the lake (${s.trees})`);
  assert.ok(m.landmarks.some((l) => l.name === 'Pine Lake'));
});

test('Stadium Lido: a fenced public pool in the stadium park - swimmable water, a deep end, the changing block solid, no fishing', async () => {
  const s = (m.natureSites || []).find((q) => q.kind === 'pool' && q.name === 'Stadium Lido');
  assert.ok(s, 'the lido is built');
  const pool = (m.pools || [])[0];
  assert.ok(pool && pool.lanes === 4, 'the pool');
  assert.ok(m.isWater(s.x, s.y), 'water you can swim in');
  assert.equal(tileAt(pool.deep.x + pool.deep.w / 2, pool.deep.y + pool.deep.h / 2), T.DEEP, 'the deep end');
  assert.equal(tileAt(pool.x - 20, pool.y + 20), T.PLAZA, 'a paved deck round it');
  assert.equal(tileAt(s.house.x, s.house.y - 20), T.WALL, 'the changing block is solid');
  for (const k of ['poolhouse', 'diveboard', 'lanerope', 'lguard', 'hottub', 'lounger', 'chainfence']) assert.ok(m.props.some((q) => q && q.t === k && Math.abs(q.x - s.x) < 600 && Math.abs(q.y - s.y) < 300), k);
  // the gate is open, the fence either side of it solid
  const near = (x, y) => { for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) for (const e of m.solidProps.get((Math.floor(y / TILE) + dy) * m.w + Math.floor(x / TILE) + dx) || []) if (Math.hypot(e.x - x, e.y - y) < e.r + 4) return true; return false; };
  assert.ok(!near(s.gate.x, s.gate.y), 'the gate is open');
  assert.ok(near(s.gate.x - 4 * TILE, s.gate.y), 'the fence is solid');
  // no fishing in it
  const { fishingSpot } = await import('../server/systems/jobs.js');
  assert.equal(fishingSpot({ map: m }, { x: pool.x - 20, y: pool.y + pool.h / 2, a: 0 }), null, 'no fish in the pool');
  assert.ok(m.landmarks.some((l) => l.name === 'Stadium Lido'));
});

test('Cedar Creek: a creek joins the Lake District ponds over a little falls, under Falls Road through a culvert, with a trail and footbridges', () => {
  const s = (m.natureSites || []).find((q) => q.kind === 'towncreek' && q.name === 'Cedar Creek');
  assert.ok(s, 'the creek is built');
  // running water between the falls and the road, and below the road; the road itself untouched
  let below = 0; for (let dx = -3; dx <= 3; dx++) if (tileAt(s.falls.x + dx * TILE, s.falls.y + 2 * TILE) === T.WATER) below++;
  assert.ok(below >= 1, 'the creek below the falls');
  assert.equal(tileAt(s.bridge.x, s.bridge.y), T.ROAD, 'Falls Road still crosses it');
  assert.equal(tileAt(s.arch.x, s.arch.y), T.DOCK, 'planks under the arch footbridge');
  assert.ok(s.footbridge && tileAt(s.footbridge.x, s.footbridge.y) === T.DOCK, 'planks under the timber footbridge');
  for (const k of ['fbridge', 'archbridge']) assert.ok(m.props.some((q) => q && q.t === k && Math.hypot(q.x - s.x, q.y - s.y) < 1400), k);
  // nothing stands on the road from the creek's dressing
  for (const q of m.props) if (q && ['boulder', 'log', 'lamp', 'pbench', 'tree_a'].includes(q.t) && Math.hypot(q.x - s.bridge.x, q.y - s.bridge.y) < 300) assert.ok(![T.ROAD].includes(tileAt(q.x, q.y)), `${q.t} on the road`);
  // the parapets over the culvert are solid
  const solid = (x, y) => { for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) for (const e of m.solidProps.get((Math.floor(y / TILE) + dy) * m.w + Math.floor(x / TILE) + dx) || []) if (Math.hypot(e.x - x, e.y - y) < e.r + 4) return true; return false; };
  assert.ok(solid(s.bridge.x, s.bridge.y - s.bridge.roadHw - 6) && solid(s.bridge.x, s.bridge.y + s.bridge.roadHw + 6), 'the parapets');
  assert.ok(m.landmarks.some((l) => l.name === 'Cedar Creek Falls'));
});

test('Wreck Island: an old ship aground on the biggest islet, solid, with its cargo spilled up the beach', () => {
  const s = (m.natureSites || []).find((q) => q.kind === 'wreck');
  assert.ok(s, 'the wreck is there');
  assert.ok(m.props.some((q) => q && q.t === 'wreck' && Math.hypot(q.x - s.x, q.y - s.y) < 8), 'the ship');
  assert.ok([T.SAND, T.GRASS].includes(tileAt(s.beach.x, s.beach.y)), 'on the beach');
  const solid = (x, y) => { for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) for (const e of m.solidProps.get((Math.floor(y / TILE) + dy) * m.w + Math.floor(x / TILE) + dx) || []) if (Math.hypot(e.x - x, e.y - y) < e.r) return true; return false; };
  assert.ok(solid(s.x, s.y), 'you can\'t walk through the hull');
  for (const k of ['barrel', 'crates', 'driftwood']) assert.ok(m.props.some((q) => q && q.t === k && Math.hypot(q.x - s.x, q.y - s.y) < 420), k);
  assert.ok(m.landmarks.some((l) => l.name === 'Wreck Island'));
});

test('Bluffs Maze Garden: a hedge maze you can walk from every gate to the gazebo at its heart, its hedges solid', () => {
  const s = (m.natureSites || []).find((q) => q.kind === 'maze');
  assert.ok(s, 'the maze is built');
  const mz = m.mazes[0], X0 = mz.x / TILE, Y0 = mz.y / TILE, S = s.size;
  // a flood over the paths from the south gate reaches the heart and every other gate (a perfect maze: one way)
  const open = (x, y) => x >= X0 && y >= Y0 && x < X0 + S && y < Y0 + S && m.tiles[y * m.w + x] !== T.WALL;
  const seen = new Set(), st = [[Math.floor(s.gate.x / TILE), Y0 + S - 1]];   // (the south gate, just inside)
  while (st.length) { const [x, y] = st.pop(), k = y * m.w + x; if (seen.has(k) || !open(x, y)) continue; seen.add(k); st.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]); }
  assert.ok(seen.has(Math.floor(s.y / TILE) * m.w + Math.floor(s.x / TILE)), 'the heart can be reached');
  const mid = Y0 + (S >> 1);
  for (const [x, y] of [[X0 + (S >> 1), Y0], [X0, mid], [X0 + S - 1, mid]]) assert.ok(seen.has(y * m.w + x), `the gate at ${x},${y} joins up`);
  // walls are solid ground (no walking through hedges), and every wall has a hedge drawn on it
  let walls = 0; for (let y = Y0; y < Y0 + S; y++) for (let x = X0; x < X0 + S; x++) if (m.tiles[y * m.w + x] === T.WALL) walls++;
  assert.ok(walls > S * S * 0.35, `hedges (${walls})`);
  assert.ok(m.props.filter((q) => q && q.t === 'hedgebox').length >= S, 'hedge sprites');
  assert.ok(m.props.some((q) => q && q.t === 'gazebo' && Math.hypot(q.x - s.x, q.y - s.y) < 60), 'the gazebo at its heart');
  assert.ok(m.landmarks.some((l) => l.name === 'Bluffs Maze Garden'));
});

test('Red Rock Wash: a dry wash of gravel from the oasis to the beach, and a dirt track in from the desert road', () => {
  const lm = m.landmarks.find((l) => l.name === 'Red Rock Wash');
  assert.ok(lm, 'the wash is on the map');
  const pt = m.paintings.find((p) => p.key === 'canyon');
  let sand = 0; for (let ty = pt.y / TILE; ty < (pt.y + pt.h) / TILE; ty++) for (let tx = pt.x / TILE; tx < (pt.x + pt.w) / TILE; tx++) if (m.tiles[ty * m.w + tx] === T.SAND) sand++;
  assert.ok(sand > 40, `gravel in the canyon (${sand})`);
  assert.ok((m.tracks || []).length >= 1 && m.tracks[0].pts.length > 10, 'the track');
  // the track starts by a road and ends by the oasis; nothing tall stands on it
  const t = m.tracks[0].pts, o = m.natureSites.find((q) => q.kind === 'oasis');
  assert.ok(Math.hypot(t[t.length - 1][0] - o.x, t[t.length - 1][1] - o.y) < 400, 'it ends by the oasis');
  for (const q of m.props) if (q && q.t === 'tree_a') for (const [x, y] of t) assert.ok(Math.hypot(q.x - x, q.y - y) > 20, 'a tree on the track');
});
