// World v3's rivers and country roads (the nature program, 2026-10-20 - the owner's notes of 10-16: rivers cut off by
// land made to connect all the way; rivers that look natural - bends, banks, sandy and rocky shores; country roads
// without sidewalks): the traced fragments joined (shared/world3-skeleton.js JOIN_GAP, MOUTHS), every river system
// running to the sea; gravel bars on the bends, cut banks and green banks (shared/world3-banks.js); no pavement out in
// the country, on the map or in the ground bake (shared/map.js rasterRoads, client/art2/game/groundbake.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateCity } from '../shared/map.js';
import '../shared/world3-islands.js';
import { T, TILE } from '../shared/constants.js';
import { FRAME_W, FRAME_H } from '../shared/world3.js';
import { STREAMS, RIVER, JOIN_GAP, MOUTHS } from '../shared/world3-skeleton.js';
import { BANK_DISTRICTS } from '../shared/world3-banks.js';
import { bakeGround } from '../client/art2/game/groundbake.js';
import { prepare } from '../tools/world3-build.mjs';

test('the rivers\' traced fragments joined: no end stopped a short way off another\'s water', () => {
  const all = [...STREAMS, RIVER];
  const near = (p, pts) => { let bd = Infinity; for (let j = 1; j < pts.length; j++) { const a = pts[j - 1], b = pts[j], dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy; let t = L ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L : 0; t = Math.max(0, Math.min(1, t)); bd = Math.min(bd, Math.hypot(a[0] + dx * t - p[0], a[1] + dy * t - p[1])); } return bd; };
  for (const s of STREAMS) for (const p of [s.pts[0], s.pts[s.pts.length - 1]]) {
    let gap = Infinity;
    for (const o of all) if (o !== s) gap = Math.min(gap, near(p, o.pts) - s.width / 2 - o.width / 2);
    assert.ok(!(gap > 0 && gap <= JOIN_GAP), `${s.name}: an end ${Math.round(gap)} tiles off the next water`);
  }
  assert.equal(MOUTHS.length, 2);
});

test('World v3: every river system runs to the sea; gravel bars on the bends, cut banks, green banks; no pavement out in the country', { timeout: 400000 }, () => {
  const prep = prepare();
  const m = generateCity(1337, { world3: true, frame: { w: FRAME_W, h: FRAME_H }, land: prep.land, today: prep.today });
  const W = m.w, H = m.h, N = W * H;
  // the inland water's bodies (a bridge's deck counts as the water under it), and which touch the sea
  const wet = (i) => m.tiles[i] === T.WATER || m.tiles[i] === T.DEEP;
  const inland = (i) => (wet(i) || m.tiles[i] === T.BRIDGE) && (m.river[i] || m.lake[i] || m.tiles[i] === T.BRIDGE);
  const lab = new Int32Array(N).fill(-1), bodies = [];
  for (let s = 0; s < N; s++) {
    if (lab[s] >= 0 || !inland(s)) continue;
    const b = { n: 0, lake: 0, sea: false }; bodies.push(b);
    const st = [s]; lab[s] = bodies.length - 1;
    while (st.length) {
      const i = st.pop(); b.n++; if (m.lake[i]) b.lake++;
      const x = i % W;
      for (const k of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, i - W, i + W]) {
        if (k < 0 || k >= N) continue;
        if (wet(k) && !m.river[k] && !m.lake[k]) b.sea = true;
        if (lab[k] < 0 && inland(k)) { lab[k] = lab[i]; st.push(k); }
      }
    }
  }
  // (a waterfall's lip of rock parts the river above it from the pool below, but the water goes over it: the bodies
  // round each falls - within 7 tiles of its foot, or 10 above it - are one)
  const up = bodies.map((_, j) => j), find = (j) => { while (up[j] !== j) j = up[j] = up[up[j]]; return j; };
  for (const p of m.props) {
    if (!p || (p.t !== 'coastfall' && p.t !== 'fallsmall')) continue;
    const tx = Math.floor(p.x / TILE), ty = Math.floor(p.y / TILE), ls = new Set();
    for (let dy = -10; dy <= 7; dy++) for (let dx = -7; dx <= 7; dx++) { const x = tx + dx, y = ty + dy; if (x >= 0 && y >= 0 && x < W && y < H && lab[y * W + x] >= 0) ls.add(find(lab[y * W + x])); }
    const [a0, ...rest] = [...ls]; for (const b of rest) up[find(b)] = find(a0);
  }
  for (const q of m.natureSites) {   // (the ledge falls' lips of rock: shared/world3-ledgefalls.js - the bodies above and below each are one)
    if (q.kind !== 'ledgefall') continue;
    const tx = Math.floor(q.falls.x / TILE), ty = Math.floor(q.falls.y / TILE), hw = Math.ceil(q.falls.w / 2 / TILE), ls = new Set();
    for (let dy = -3; dy <= 3; dy++) for (let dx = -hw; dx <= hw; dx++) { const x = tx + dx, y = ty + dy; if (x >= 0 && y >= 0 && x < W && y < H && lab[y * W + x] >= 0) ls.add(find(lab[y * W + x])); }
    const [a0, ...rest] = [...ls]; for (const b of rest) up[find(b)] = find(a0);
  }
  const seaOf = new Map();
  bodies.forEach((b, j) => { const r = find(j); seaOf.set(r, (seaOf.get(r) || false) || b.sea); });
  bodies.forEach((b, j) => { b.sea = seaOf.get(find(j)); });
  const rivers = bodies.filter((b) => b.n >= 20000 && b.lake < b.n * 0.9);   // (Kestrel Lake behind its weir, the city's pond: lakes)
  assert.ok(rivers.length >= 4, `the big river systems (${rivers.length})`);
  for (const b of rivers) assert.ok(b.sea, `a river system of ${b.n} tiles reaches the sea`);
  // the banks: bars out into the water on the bends, the green banks along the straights - out in the country, clear of the roads
  const B = m.world3.banks;
  assert.ok(B.bars >= 1500 && B.barBank >= 1500 && B.cut >= 500 && B.lush >= 2000, `bars ${B.bars}, bar banks ${B.barBank}, cut banks ${B.cut}, green banks ${B.lush}`);
  let bars = 0, nearRoad = 0, inTown = 0;
  for (let i = 0; i < N; i++) {
    if (m.tiles[i] !== T.SAND || !(m.reserve[i] & 128)) continue;
    bars++;
    if (!BANK_DISTRICTS.has(m.dist[i]) && m.dist[i] < 47 && m.dist[i] !== 45) inTown++;
    const x = i % W;
    for (const k of [i - 2, i + 2, i - 2 * W, i + 2 * W]) if (k >= 0 && k < N && Math.abs((k % W) - x) <= 2 && (m.tiles[k] === T.ROAD || m.tiles[k] === T.BRIDGE)) { nearRoad++; break; }
  }
  assert.ok(bars > 0 && nearRoad <= bars * 0.01, `the bars and gravel banks clear of the roads (${nearRoad} of ${bars})`);
  // no pavement out in the country: not on the wild, the farm or the desert districts' tiles, nor along the unbuilt
  // Sandpiper Coast's road; the beach towns keep theirs
  const walk = new Map();
  for (let i = 0; i < N; i++) if (m.tiles[i] === T.SIDEWALK) walk.set(m.dist[i], (walk.get(m.dist[i]) || 0) + 1);
  for (const d of [47, 48, 49, 50, 51, 53, 56]) assert.ok((walk.get(d) || 0) < 400, `no country pavements in district ${d} (${walk.get(d) || 0})`);
  assert.ok((walk.get(52) || 0) < 1200, `the Sandpiper Coast's road without pavements (${walk.get(52) || 0}: what's left are the towns' own streets that run into it, Elm Street's and Pier Street's - 8,259 before)`);
  assert.ok((walk.get(54) || 0) > 2000, `the beach towns keep their pavements (${walk.get(54) || 0})`);
  // and the ground bake draws none out there: a county road through the Egret Coast, grass to the verge
  const G = bakeGround(m, 53, 91, { quality: 1, seed: 1337 });
  let grey = 0;
  for (let i = 0; i < G.w * G.h; i++) { const r = G.col[i * 4], g = G.col[i * 4 + 1], b = G.col[i * 4 + 2]; if (r > 120 && Math.abs(r - g) < 12 && Math.abs(g - b) < 14) grey++; }
  assert.ok(grey < G.w * G.h * 0.02, `no pavement beside the county road out in the country (${(grey / (G.w * G.h) * 100).toFixed(1)}% pale grey)`);
});
