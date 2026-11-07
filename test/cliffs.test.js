// The cliffs are solid where they're drawn (the owner, 2026-11-04: "There are cliffs in the desert that you can walk
// into so the hit boxes aren't registering correctly to keep players or NPCs from walking into it"). Each cliff face of
// the relief (shared/world3-relief.js) is drawn as a rock sprite (client/art2/game/statics.js 'cliff') over its arc of
// the band: the test takes each face's real sprite and checks that no walkable tile lies under its rock - the ground
// it stands on, and the ground north of it its tiers hide as they stand up the screen (whoever stood there would be
// drawn inside the rock) - and that no relief rock in the desert is drawn as nothing; then walks players, townsfolk
// (the NPCs' and animals' step: pedStep on PED_BLOCK) and a car at a sample of the desert's faces from below, from
// above and from the sides, and none ends up inside the rock; and every road, track and place of the desert can still
// be reached from the roads, on foot and by car. The hand-placed faces too (the Old Granite Mine's, Granite Cove's: the
// owner's same report, 2026-11-04). One world build.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateCity } from '../shared/map.js';
import '../shared/world3-islands.js';
import { TILE, T } from '../shared/constants.js';
import { DISTRICTS, PED_BLOCK, CAR_BLOCK } from '../shared/mapcore.js';
import { FRAME_W, FRAME_H } from '../shared/world3.js';
import { pedStep, newPedState, vehStep, newVehState } from '../shared/physics.js';
import { VEHICLES } from '../shared/vehicles.js';
import { makeStatic } from '../client/art2/game/statics.js';
import { prepare } from '../tools/world3-build.mjs';
import { reliefCliffs } from '../shared/world3-relief.js';

test('World v3: the cliffs are solid where they are drawn - on foot, by car, from below, above and the sides; the desert still reachable', { timeout: 900000 }, () => {
  const prep = prepare();
  const m = generateCity(1337, { world3: true, frame: { w: FRAME_W, h: FRAME_H }, land: prep.land, today: prep.today });
  const W = m.w, H = m.h;
  const styleAt = (tx, ty) => (DISTRICTS[m.dist[ty * W + tx]] || {}).style;
  const faces = m.props.filter((p) => p.t === 'cliff' && p.relief);
  assert.ok(faces.length > 500, `the relief's cliff faces: ${faces.length}`);
  const desert = faces.filter((p) => styleAt(Math.floor(p.x / TILE), Math.floor(p.y / TILE) - 1) === 'desert');
  assert.ok(desert.length > 300, `the desert's faces: ${desert.length}`);

  // each face's rock as drawn, in world pixels: its sprite's opaque pixels on the ground (x, y + z) and where they hide
  // the ground behind them (x, y) - a mask over the face's box
  const rockOf = (p) => {
    const G = makeStatic({ t: 'cliff', w: p.w, d: p.d, h: p.h, s: p.s || 1, st: p.st });
    const X0 = Math.round(p.x - G.ax), Y0 = Math.round(p.y - G.ay), mw = G.w, mh = G.h + 40, mask = new Uint8Array(mw * mh);
    for (let sy = 0; sy < G.h; sy++) for (let sx = 0; sx < G.w; sx++) {
      const q = sy * G.w + sx;
      if (G.col[q * 4 + 3] < 128) continue;
      mask[sy * mw + sx] = 1;
      const gy = sy + Math.round(G.z[q]);
      if (gy < mh) mask[gy * mw + sx] = 1;
    }
    const at = (x, y) => { const mx = Math.round(x) - X0, my = Math.round(y) - Y0; return mx >= 0 && my >= 0 && mx < mw && my < mh && mask[my * mw + mx] === 1; };
    // the tiles mostly under the rock: tile key -> pixels of rock in it
    const tiles = new Map();
    for (let my = 0; my < mh; my++) for (let mx = 0; mx < mw; mx++) if (mask[my * mw + mx]) { const k = Math.floor((Y0 + my) / TILE) * W + Math.floor((X0 + mx) / TILE); tiles.set(k, (tiles.get(k) || 0) + 1); }
    return { at, tiles, X0, Y0, mw, mh };
  };
  // deep in the rock: the point and the points 6 px round it all under it (the rock's ragged edge aside)
  const deep = (R, x, y) => R.at(x, y) && R.at(x - 6, y) && R.at(x + 6, y) && R.at(x, y - 6) && R.at(x, y + 6);

  // 1. no walkable tile under a face's rock; no relief rock in the desert drawn as nothing
  let drawn = 0, open = 0;
  const openAt = [], under = new Set();
  const rocks = new Map();
  for (const p of faces) {
    const R = rockOf(p);
    for (const [k, n] of R.tiles) {
      if (n >= TILE * TILE / 8) under.add(k);   // (some of its rock drawn over the tile)
      if (n < TILE * TILE / 2) continue;
      drawn++;
      if (!PED_BLOCK[m.tiles[k]]) { open++; if (openAt.length < 12) openAt.push(`${k % W}, ${(k / W) | 0}`); }
    }
    if (desert.includes(p)) rocks.set(p, R);
  }
  assert.ok(drawn > 20000, `tiles under the faces' rock: ${drawn}`);

  // 1b. the hand-placed faces too (shared/naturesites.js: the Old Granite Mine's adit, Granite Cove's rim; the desert's
  // Copper Gulch adit, shared/world3-desert.js): no walkable tile under their rock but the steps up the cove's cliff
  const hand = m.props.filter((p) => p.t === 'cliff' && !p.relief);
  const stairs = m.props.filter((p) => p.t === 'stairs');
  const onSteps = (k) => { const x = (k % W + 0.5) * TILE, y = (((k / W) | 0) + 0.5) * TILE; return stairs.some((q) => Math.abs(q.x - x) < TILE * 1.6 && y <= q.y + TILE && y >= q.y - (q.len || 120) - 3 * TILE); };
  const mine = hand.filter((p) => p.s === 33 && p.h === 120), cove = hand.filter((p) => p.s >= 41 && p.s <= 46 && !p.st);
  assert.ok(mine.length === 1 && cove.length === 6, `the Old Granite Mine's face (${mine.length}) and Granite Cove's six (${cove.length})`);
  let hDrawn = 0, hOpen = 0;
  const hOpenAt = [];
  for (const p of hand) {
    for (const [k, n] of rockOf(p).tiles) {
      if (n < TILE * TILE / 2 || onSteps(k)) continue;
      hDrawn++;
      const t = m.tiles[k];
      if (!PED_BLOCK[t] && t !== T.WATER && t !== T.DEEP) { hOpen++; if (hOpenAt.length < 12) hOpenAt.push(`${k % W}, ${(k / W) | 0} (s ${p.s})`); }
    }
  }
  assert.ok(hDrawn > 150, `tiles under the hand-placed faces' rock: ${hDrawn}`);
  assert.ok(hOpen <= hDrawn * 0.01, `walkable tiles under a hand-placed face's rock: ${hOpen} of ${hDrawn} (${hOpenAt.join('; ')})`);
  assert.ok(open <= drawn * 0.003, `walkable tiles under a face's rock: ${open} of ${drawn} (${openAt.join('; ')})`);
  // (the relief's cliff bands in the desert: every tile of them under a face's rock - the b1c rule, no flat red rock you
  // can't walk on - and, the other way, that rock stands where it's drawn)
  const band = reliefCliffs(m);
  assert.ok(band, 'the relief\'s cliff bands');
  let bare = 0, bandN = 0;
  const bareAt = [];
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const k = y * W + x;
    if (!band[k] || styleAt(x, y) !== 'desert') continue;
    bandN++;
    if (!under.has(k)) { bare++; if (bareAt.length < 12) bareAt.push(`${x}, ${y}`); }
  }
  assert.ok(bandN > 50000, `the desert's cliff band: ${bandN} tiles`);
  assert.ok(bare <= bandN * 0.003, `the desert's cliff rock drawn as nothing: ${bare} of ${bandN} tiles (${bareAt.join('; ')})`);

  // 2. walkers and a car at a sample of the desert's faces, from below (walking north), above (south), and the sides
  const player = { canMove: true, canSprint: true, speedMul: 1, regenMul: 1, staminaMax: 100, analog: true };
  const npc = { canMove: true, canSprint: false, speedMul: 1, regenMul: 1, staminaMax: 100 };
  const car = VEHICLES.sedan || Object.values(VEHICLES)[0];
  const free = (x, y) => { const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE); return tx > 2 && ty > 2 && tx < W - 3 && ty < H - 3 && !PED_BLOCK[m.tiles[ty * W + tx]] && !PED_BLOCK[m.tiles[ty * W + tx - 1]] && !PED_BLOCK[m.tiles[ty * W + tx + 1]]; };
  let walks = 0, inside = 0, drives = 0, carIn = 0;
  const insideAt = [];
  const sample = desert.filter((p, k) => k % 3 === 0);
  for (const p of sample) {
    const R = rocks.get(p), top = R.Y0 - 3 * TILE;
    const runs = [
      [p.x, p.y + 3 * TILE, 0, -1], [p.x - p.w / 4, p.y + 3 * TILE, 0, -1], [p.x + p.w / 4, p.y + 3 * TILE, 0, -1],   // (from below)
      [p.x, top, 0, 1], [p.x - p.w / 4, top, 0, 1], [p.x + p.w / 4, top, 0, 1],                                      // (from above)
      [R.X0 - 2 * TILE, p.y - p.d / 2, 1, 0], [R.X0 + R.mw + 2 * TILE, p.y - p.d / 2, -1, 0],                       // (from the sides)
    ];
    for (const [x, y, mx, my] of runs) {
      if (!free(x, y) || R.at(x, y)) continue;
      for (const mods of [player, npc]) {
        const s = newPedState(x, y);
        walks++;
        for (let i = 0; i < 20 * 7; i++) {
          pedStep(s, { bits: 0, mx, my, aim: 0 }, 0.05, m, mods);
          if (deep(R, s.x, s.y)) { inside++; if (insideAt.length < 12) insideAt.push(`${Math.round(s.x / TILE)}, ${Math.round(s.y / TILE)} (${mx}, ${my})`); break; }
        }
      }
      if (!car) continue;
      const v = newVehState(x, y, Math.atan2(my, mx));
      drives++;
      for (let i = 0; i < 20 * 5; i++) {
        vehStep(v, { throttle: 0.6, steer: 0, hb: false, slide: false, drv: true }, 0.05, m, car, { rain: false });
        if (deep(R, v.x, v.y)) { carIn++; break; }
      }
    }
  }
  assert.ok(walks > 1000 && drives > 300, `walks ${walks}, drives ${drives}`);
  assert.ok(inside <= walks * 0.005, `walkers that ended up inside a cliff's rock: ${inside} of ${walks} (${insideAt.join('; ')})`);
  assert.ok(carIn <= drives * 0.005, `cars that ended up inside a cliff's rock: ${carIn} of ${drives}`);

  // 3. the desert still reachable from the roads: every place, every road and track point, on foot and by car
  const flood = (block) => {
    const N = W * H, Rr = new Uint8Array(N), q = new Int32Array(N);
    let qh = 0, qt = 0;
    for (let i = 0; i < N; i++) if (m.tiles[i] === T.ROAD) { Rr[i] = 1; q[qt++] = i; }
    while (qh < qt) { const i = q[qh++], x = i % W; for (const j of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, i - W, i + W]) { if (j < 0 || j >= N || Rr[j] || block[m.tiles[j]]) continue; Rr[j] = 1; q[qt++] = j; } }
    return Rr;
  };
  const isDesert = (tx, ty) => tx >= 0 && ty >= 0 && tx < W && ty < H && styleAt(tx, ty) === 'desert';
  const targets = [];
  for (const q of m.pois || []) { const tx = Math.floor(q.x / TILE), ty = Math.floor(q.y / TILE); if (isDesert(tx, ty)) targets.push([`${q.kind} ${q.name || ''}`, tx, ty]); }
  for (const q of m.natureSites || []) { const tx = Math.floor(q.x / TILE), ty = Math.floor(q.y / TILE); if (isDesert(tx, ty)) targets.push([`${q.kind} ${q.name || ''}`, tx, ty]); }
  for (const e of m.edges || []) if (!e.lvl) for (const pt of e.pts) { const tx = Math.floor(pt.x / TILE), ty = Math.floor(pt.y / TILE); if (isDesert(tx, ty)) targets.push([`${e.kind === 'dirt' ? 'track' : 'road'} at ${tx}, ${ty}`, tx, ty]); }
  assert.ok(targets.length > 500, `the desert's places, roads and tracks: ${targets.length}`);
  const carBlock = CAR_BLOCK.map((v, t) => (v || t === T.WATER || t === T.DEEP ? 1 : 0));
  for (const [how, block] of [['on foot', PED_BLOCK], ['by car', carBlock]]) {
    const Rr = flood(block), lost = [];
    // (a place in the water - a lake, a tinaja - by its shore)
    const reached = (tx, ty) => { const t = m.tiles[ty * W + tx], r = t === T.WATER || t === T.DEEP ? 40 : 2; for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const x = tx + dx, y = ty + dy; if (x >= 0 && y >= 0 && x < W && y < H && Rr[y * W + x]) return true; } return false; };
    for (const [name, tx, ty] of targets) if (!reached(tx, ty)) lost.push(name);
    assert.ok(lost.length <= KNOWN_UNREACHED[how], `the desert ${how}: ${lost.length} of ${targets.length} out of reach (${lost.slice(0, 12).join('; ')})`);
  }
});
// (out of reach before the faces were made solid where drawn too, and not by the cliffs - the probe of 2026-11-04: by car,
// a convenience store and a roadhouse of the desert with no drivable way to their doors)
const KNOWN_UNREACHED = { 'on foot': 0, 'by car': 2 };
