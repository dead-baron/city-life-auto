// World v3 (docs/WORLD-V3.md 8.21): the places on the water, in the whole-world build - Prison Island (the walls, the
// four guard towers, the three cell blocks round the exercise yard and its sports court, the kitchen block, the
// gatehouse and its gate for officers only, the warden's house, the lighthouse, the harbour with its stone pier where
// the Prison Boat's route ends, the guards' posts; nobody gets in but through the gate, no road reaches the island);
// the Long Reach (the weir beside the lock below Willow Crossing - v3b has no River Water Bus, so no quays - the
// banks' willows and reeds, the farm docks); Kestrel Lake (the lookout on
// Lookout Hill, the campground, the boathouse and its boat rental, the fishing docks, the island). One world build.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateCity } from '../shared/map.js';
import '../shared/world3-islands.js';
import { TILE, T } from '../shared/constants.js';
import { FRAME_W, FRAME_H } from '../shared/world3.js';
import { PRISON, KESTREL } from '../shared/world3-water.js';
import { prepare } from '../tools/world3-build.mjs';

test('World v3: the places on the water - Prison Island, the Long Reach, Kestrel Lake', { timeout: 300000 }, () => {
  const prep = prepare();
  const m = generateCity(1337, { world3: true, frame: { w: FRAME_W, h: FRAME_H }, land: prep.land, today: prep.today });
  const W = m.w, H = m.h;
  const V = m.world3.water;
  console.log('water', JSON.stringify({ ...V, prison: { ...V.prison, guards: V.prison && V.prison.guards.length } }));
  const bad = [];
  const check = (ok, msg) => { if (!ok) bad.push(msg); };
  const at = (x, y) => y * W + x;
  const wet = (x, y) => !m.land[at(x, y)] && (m.tiles[at(x, y)] === T.WATER || m.tiles[at(x, y)] === T.DEEP);
  const bld = (name) => m.buildings.filter((b) => b && b.name === name);
  const propsIn = (t, x0, y0, x1, y1) => m.props.filter((p) => p.t === t && p.x >= x0 * TILE && p.y >= y0 * TILE && p.x < x1 * TILE && p.y < y1 * TILE).length;

  // 1. Prison Island: the compound - its walls (two tiles thick, the gate's four columns open), the towers on its
  // corners, the cell blocks, the kitchen block, the gatehouse; the yard's concrete and its court; the warden's house
  // and the lighthouse outside; all of it on the island's district
  const [x0, y0, x1, y1] = PRISON.box, [g0, g1] = PRISON.gate;
  let wall = 0, holes = [];
  for (let x = x0; x < x1; x++) for (const y of [y0, y1 - 1]) { const t = m.tiles[at(x, y)]; if (t === T.WALL || t === T.BUILDING) wall++; else if (!(y === y1 - 1 && x >= g0 && x < g1)) holes.push([x, y]); }
  for (let y = y0; y < y1; y++) for (const x of [x0, x1 - 1]) { const t = m.tiles[at(x, y)]; if (t === T.WALL || t === T.BUILDING) wall++; else holes.push([x, y]); }
  check(!holes.length, `the prison's walls whole but for the gate: ${JSON.stringify(holes.slice(0, 6))}`);
  check(bld('Guard Tower').length === 4, `four guard towers (${bld('Guard Tower').length})`);
  for (const n of ['Cell Block A', 'Cell Block B', 'Cell Block C', 'Kitchen Block', 'Prison Gatehouse', "Warden's House", 'Prison Island Light', 'Prison Harbour Office']) {
    const b = bld(n)[0];
    check(b, `${n} built`);
    if (b) check(m.dist[at(b.tx + (b.tw >> 1), b.ty + (b.th >> 1))] === 55, `${n} on Prison Island's ground (${m.dist[at(b.tx + (b.tw >> 1), b.ty + (b.th >> 1))]})`);
  }
  const yard = V.prison.yard;
  let yardPlaza = 0;
  for (let y = yard[1]; y < yard[3]; y++) for (let x = yard[0]; x < yard[2]; x++) if (m.tiles[at(x, y)] === T.PLAZA) yardPlaza++;
  check(yardPlaza > 0.9 * (yard[2] - yard[0]) * (yard[3] - yard[1]), `the exercise yard is concrete (${yardPlaza})`);
  check(propsIn('court', yard[0], yard[1], yard[2], yard[3]) === 1 && propsIn('hoop', yard[0], yard[1], yard[2], yard[3]) === 2, 'the sports court and its hoops in the yard');
  check(propsIn('chainfence', yard[0] - 1, yard[1] - 1, yard[2] + 1, yard[3] + 1) === 4, 'the fence round the yard');
  // the gate: officers only (the motor pools' rule), its rectangle the compound; the guards' posts listed
  const gate = m.gates[m.prison.gate];
  check(gate && gate.rule === 'police' && gate.rect.tx === x0 && gate.rect.tw === x1 - x0 && gate.props.length >= 6, 'the gate opens for officers only');
  check(m.prison.guards.length >= 12 && m.prison.guards.filter((g) => g.tower).length === 4 && m.prison.guards.filter((g) => g.harbour).length === 2, `the guards' posts (${m.prison.guards.length})`);
  // nobody gets in but through the gate: with the gate's tiles shut, nothing outside reaches the yard
  const seen = new Uint8Array((x1 - x0 + 40) * (y1 - y0 + 40)), bx = x0 - 20, by = y0 - 20, BW = x1 - x0 + 40, BH = y1 - y0 + 40;
  const walk = (x, y, shut) => { const t = m.tiles[at(x, y)]; return m.land[at(x, y)] && t !== T.WALL && t !== T.BUILDING && !(shut && y >= y1 - 2 && y < y1 && x >= g0 && x < g1); };
  const flood = (shut) => {
    seen.fill(0);
    const q = [[bx + 2, by + 2]];
    for (let x = bx; x < bx + BW && !walk(q[0][0], q[0][1], shut); x++) q[0] = [x, by + 2];
    seen[(q[0][1] - by) * BW + q[0][0] - bx] = 1;
    for (let h = 0; h < q.length; h++) {
      const [x, y] = q[h];
      for (const [ax, ay] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) { if (ax < bx || ay < by || ax >= bx + BW || ay >= by + BH || seen[(ay - by) * BW + ax - bx] || !walk(ax, ay, shut)) continue; seen[(ay - by) * BW + ax - bx] = 1; q.push([ax, ay]); }
    }
    return seen[(yard[1] + 4 - by) * BW + yard[0] + 4 - bx] === 1;
  };
  check(!flood(true), 'the yard is shut in but for the gate');
  check(flood(false), 'the yard is reached through the gate');
  // the island: reached by boat only (no road on it); the harbour round the Prison Boat's island stop - a stone pier
  // out over the water, the path from it up to the gate; the route's last stop is the harbour's
  let roadOn = 0;
  for (const n of m.nodes) if (n && m.dist[at(Math.floor(n.x / TILE), Math.floor(n.y / TILE))] === 55) roadOn++;
  check(roadOn === 0, `no road on Prison Island (${roadOn} junctions)`);
  const PB = m.world3.ferries.find((r) => r.name === 'Prison Boat'), ist = PB.stops[PB.stops.length - 1];
  check(V.harbour && V.harbour.stop === ist.name && V.harbour.pier >= 40 && V.harbour.path >= 150, `the harbour at the Prison Boat's last stop (${JSON.stringify(V.harbour)})`);
  check(Math.hypot(m.prison.dock.x - ist.x, m.prison.dock.y - ist.y) < 20 * TILE, 'the stone pier beside the boat\'s berth');
  // the harbour's pier joins the gate by land (walking: no wall, no building, no water)
  {
    const sx = Math.floor(m.prison.dock.x / TILE), sy = Math.floor(m.prison.dock.y / TILE), tx = Math.floor((g0 + g1) / 2), ty = y1 - 1;
    const X0 = Math.min(sx, x0) - 30, Y0 = Math.min(sy, y0) - 30, XW = Math.max(sx, x1) + 30 - X0, YH = Math.max(sy, y1) + 30 - Y0, s2 = new Uint8Array(XW * YH), q = [[sx, sy]];
    s2[(sy - Y0) * XW + sx - X0] = 1;
    let ok = false;
    for (let h = 0; h < q.length && !ok; h++) {
      const [x, y] = q[h];
      if (x === tx && y === ty) ok = true;
      for (const [ax, ay] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) { if (ax < X0 || ay < Y0 || ax >= X0 + XW || ay >= Y0 + YH || s2[(ay - Y0) * XW + ax - X0] || !walk(ax, ay, false)) continue; s2[(ay - Y0) * XW + ax - X0] = 1; q.push([ax, ay]); }
    }
    check(ok, 'from the harbour\'s pier to the gate on foot');
  }

  // 2. The Long Reach: the weir beside the lock at Willow Crossing - the weir's crest across the river, the lock's
  // channel open water from end to end between its stone walls; the River Water Bus up through the lock
  const lk = V.lock, [cx, cy] = lk.center, [ux, uy] = lk.tangent, nx = -uy, ny = ux;
  const tileAt = (u, v) => [Math.floor(cx + ux * u + nx * v), Math.floor(cy + uy * u + ny * v)];
  let crest = 0, across = 0;
  for (let v = lk.vmin + 1; v < lk.channel[0] - 4; v++) { const [x, y] = tileAt(0, v); across++; if (m.tiles[at(x, y)] === T.WALL) crest++; }
  check(crest > 0.9 * across, `the weir's crest across the river (${crest} of ${across})`);
  for (let u = -26; u <= 26; u += 2) { const [x, y] = tileAt(u, (lk.channel[0] + lk.channel[1]) / 2); check(wet(x, y), `the lock's channel open at ${u}: ${x},${y}`); }
  check(bld("Lock Keeper's House").length === 1, "the lock keeper's house");
  // (v3b: no River Water Bus - world3-layout.js FERRIES3 has the car ferry, the Prison Boat and the two water buses on
  // the gulf - and so no quays at its Old Town and Willow Crossing stops: what went through the lock is dropped)
  check(!(V.quays || []).length || V.quays.every((q) => q.tiles >= 40 && q.bollards >= 4), `the quays (${JSON.stringify(V.quays)})`);
  // the banks: reeds at the water's edge, willows behind; the farm docks out over the water
  // (v3b: the Long Reach is the farm lake's short outlet, about 230 tiles - a reed each side every 9 tiles at most)
  check(V.banks.reeds >= 24 && V.banks.willows >= 6, `the banks' reeds and willows (${JSON.stringify(V.banks)})`);
  check(V.docks.length === 3, `three farm docks (${V.docks.map((d) => d.name)})`);
  for (const d of V.docks) check(m.tiles[at(d.end[0], d.end[1])] === T.DOCK && !m.land[at(d.end[0], d.end[1])], `${d.name}: its boards out over the water`);

  // 3. Kestrel Lake: the island (land in the lake, water all round it), the lookout's deck and binoculars, the
  // campground's tents round the fire, the fishing docks, the boathouse and its boat rental (today's kind)
  const I = KESTREL.island;
  let isl = 0, shoreOk = true;
  for (let y = I.at[1] - I.ry - 3; y <= I.at[1] + I.ry + 3; y++) for (let x = I.at[0] - I.rx - 3; x <= I.at[0] + I.rx + 3; x++) {
    const inside = ((x + 0.5 - I.at[0]) / I.rx) ** 2 + ((y + 0.5 - I.at[1]) / I.ry) ** 2;
    if (inside <= 1 && m.land[at(x, y)]) isl++;
    if (inside > 1.25 && inside < 1.6 && m.land[at(x, y)] && m.tiles[at(x, y)] !== T.DOCK) shoreOk = false;
  }
  check(isl > 1200, `the island's land (${isl})`);
  check(shoreOk, 'water all round the island');
  const [hx, hy] = KESTREL.lookout;
  let deck = 0;
  for (let y = hy - 3; y <= hy + 3; y++) for (let x = hx - 5; x <= hx + 5; x++) if (m.tiles[at(x, y)] === T.DOCK) deck++;
  check(deck >= 60 && propsIn('scope', hx - 6, hy - 4, hx + 7, hy + 5) === 3, `the lookout's deck and binoculars (${deck})`);
  const [qx0, qy0, qx1, qy1] = KESTREL.camp;
  check(propsIn('tent', qx0, qy0, qx1, qy1) >= 5 && propsIn('campfire', qx0, qy0, qx1, qy1) >= 1, 'the campground: tents round a fire');
  check(V.lake.fishing.length === 3, `the fishing docks (${V.lake.fishing.map((f) => f.name)})`);
  for (const f of V.lake.fishing) check(m.tiles[at(f.end[0], f.end[1])] === T.DOCK && propsIn('rods', f.end[0] - 3, f.end[1] - 3, f.end[0] + 4, f.end[1] + 4) === 1, `${f.name}: its boards and rods`);
  const rent = m.rentals.find((r) => r.name === KESTREL.rentName);
  check(rent && rent.lake && rent.spots.length >= 4 && m.pois[rent.poi].kind === 'rental', 'the boat rental at the boathouse');
  if (rent) for (const s of rent.spots) check(wet(Math.floor(s.x / TILE), Math.floor(s.y / TILE)), `a rental boat's spot on the water at ${Math.floor(s.x / TILE)},${Math.floor(s.y / TILE)}`);
  check(bld('Kestrel Lake Boathouse').length === 1, 'the boathouse');
  for (const n of ['Lookout Hill', 'Kestrel Lake Campground', 'Kestrel Island', 'Kestrel Lake Boathouse', PRISON.name, 'Willow Crossing Lock and Weir']) check((m.landmarks || []).some((l) => l.name === n), `${n} on the map`);

  assert.deepEqual(bad, []);
});
