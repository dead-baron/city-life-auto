// Highland Woods by hand, part 2 (shared/world3-clearings.js): the clearings across the woods - deer meadows, old
// stump clearings, windfalls - on and off the trails, and the woods' mushrooms moved where you can see them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateCity } from '../shared/map.js';
import '../shared/world3-islands.js';
import { T, TILE } from '../shared/constants.js';
import { FRAME_W, FRAME_H } from '../shared/world3.js';
import { CLEARINGS, forageInSight3 } from '../shared/world3-clearings.js';
import { habitatAt } from '../server/systems/wildlife.js';
import { prepare } from '../tools/world3-build.mjs';

test('forage in sight: a spot a tree in front of it hides moves to open ground nearby, a seen one stays', () => {
  // a stand-in patch of woods (district 47, grass): a giant redwood with a spot right behind its trunk, one beside it,
  // one in front of it, and a spot boxed in by trees all round in front
  const W = 200, H = 200, m = { w: W, h: H, tiles: new Uint8Array(W * H).fill(T.GRASS), dist: new Uint8Array(W * H).fill(47) };
  m.props = [{ t: 'redwood', sp: 'giant', x: 3200, y: 3200 }];
  const behind = { x: 3200, y: 3000, k: 'redcap' }, beside = { x: 3400, y: 3100, k: 'redcap' }, front = { x: 3200, y: 3300, k: 'redcap' };
  m.forage = [behind, beside, front];
  const r = forageInSight3(m);
  assert.equal(r.moved, 1); assert.equal(r.dropped, 0);
  const moved = m.forage.find((f) => f.k === 'redcap' && f !== beside && f !== front);
  assert.ok(moved && Math.hypot(moved.x - behind.x, moved.y - behind.y) <= 170 && Math.abs(moved.x - 3200) >= 54, `moved out from behind the trunk (${moved && [moved.x, moved.y]})`);
  assert.ok(m.forage.includes(beside) && m.forage.includes(front), 'the seen ones stay put');
});

test('World v3: Highland Woods\' clearings - meadows, stump clearings, windfalls, on and off the trails; the mushrooms in sight', { timeout: 400000 }, () => {
  const prep = prepare();
  const m = generateCity(1337, { world3: true, frame: { w: FRAME_W, h: FRAME_H }, land: prep.land, today: prep.today });
  const C = m.world3.clearings, S = m.world3.forageSight;
  assert.ok(C && C.clearings.length >= CLEARINGS.n - 2, `the clearings (${C && C.clearings.length}, ${C && C.missed} missed)`);
  const by = (k) => C.clearings.filter((c) => c.type === k);
  for (const k of ['meadow', 'stumps', 'windfall']) assert.ok(by(k).length >= 4, `${by(k).length} ${k}`);
  assert.ok(C.clearings.filter((c) => c.onTrail).length >= 3, `some the trails pass through (${C.clearings.filter((c) => c.onTrail).length}; ${JSON.stringify(C.why)})`);
  const trails = m.natureSites.filter((s) => s.kind === 'trail');
  const trailD = (x, y) => Math.min(...trails.flatMap((t) => t.line.map(([a, b]) => Math.hypot(a - x, b - y)))) / TILE;
  const near = (t, x, y, r) => m.props.filter((p) => p && p.t === t && Math.hypot(p.x - x, p.y - y) < r);
  for (const c of C.clearings) {
    assert.equal(m.dist[m.idx(Math.floor(c.x / TILE), Math.floor(c.y / TILE))], 47, `${c.name} in Highland Woods`);
    if (!c.onTrail) assert.ok(trailD(c.x, c.y) >= 12, `${c.name} off the trails (${trailD(c.x, c.y).toFixed(1)} tiles)`);
    // no big tree in it (the fairy ring's young redwoods at a stump clearing's edge aside)
    const big = near('redwood', c.x, c.y, c.r * 0.7).filter((p) => p.sp !== 'redwood2').length + near('tree_a', c.x, c.y, c.r * 0.6).length;
    assert.equal(big, 0, `${c.name}: open`);
    assert.ok(m.landmarks.some((l) => l.name === c.name), `${c.name} on the map`);
    if (c.type === 'meadow') {
      let lush = 0; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const i = m.idx(Math.floor(c.x / TILE) + dx, Math.floor(c.y / TILE) + dy); if (m.tiles[i] === T.GRASS && m.reserve[i] & 128) lush++; }
      assert.ok(lush >= 15 && near('flowers_a', c.x, c.y, c.r).length >= 8, `${c.name}: sunlit grass and flowers`);
      assert.equal(habitatAt(m, c.x + 30, c.y + 30).glade, 1, `${c.name}: the deer come`);
    } else if (c.type === 'stumps') assert.ok(near('rwstump', c.x, c.y, c.r * 1.1).length >= 5, `${c.name}: the stumps`);
    else assert.ok(near('rwlog', c.x, c.y, c.r).length === 1 && near('rootplate', c.x, c.y, c.r + 200).length === 1, `${c.name}: the fallen giant and its root plate`);
  }
  for (let i = 0; i < C.clearings.length; i++) for (let j = i + 1; j < C.clearings.length; j++) { const a = C.clearings[i], b = C.clearings[j]; assert.ok(Math.hypot(a.x - b.x, a.y - b.y) >= (CLEARINGS.spacing - 1) * TILE, `${a.name} and ${b.name} apart`); }
  // the mushrooms: those hidden behind trees moved (or, rarely, left out); none of the woods' left behind a giant's trunk
  assert.ok(S && S.moved > 100 && S.dropped < S.moved, `the woods' finds in sight (${JSON.stringify(S)})`);
  const giants = m.props.filter((p) => p && p.t === 'redwood' && p.sp !== 'redwood2');
  const G = new Map(); for (const p of giants) { const k = Math.floor(p.x / 256) * 65536 + Math.floor(p.y / 256); let a = G.get(k); if (!a) G.set(k, (a = [])); a.push(p); }
  let behind = 0, total = 0;
  for (const f of m.forage) {
    if (m.dist[m.idx(Math.floor(f.x / TILE), Math.floor(f.y / TILE))] !== 47 || !/redcap|goldTrumpet|ghostglass|shelfOyster/.test(f.k)) continue;
    total++;
    for (let cy = Math.floor(f.y / 256); cy <= Math.floor((f.y + 300) / 256) && !f._b; cy++) for (let cx = Math.floor(f.x / 256) - 1; cx <= Math.floor(f.x / 256) + 1; cx++) for (const p of G.get(cx * 65536 + cy) || []) if (p.y > f.y + 4 && p.y - f.y < 220 && Math.abs(p.x - f.x) < 44) { behind++; f._b = 1; break; }
  }
  assert.ok(total > 1000 && behind / total < 0.01, `mushrooms behind a giant's trunk: ${behind} of ${total}`);
});
