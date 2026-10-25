// The falls and cliffs as the bake draws them (client/art2/water.js; the owner, notes 2: "the waterfalls themselves
// across the world aren't all perfectly rectangular ... random looking rock columns doesn't look great"): a fall's lip
// wanders instead of running dead straight, its water comes over in strands of different widths with rock between,
// each thrown out its own way; its walls are layered rock standing to the lip by the water and stepping down away from
// it; a cliff steps back in ledges and its ends come down into the ground.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fallModel, cliffWall } from '../client/art2/water.js';
import { F_WATER } from '../client/art2/gbuf.js';

const isWater = (m, x, y, z) => { const v = m.get(x, y, z); return v && (m.mats[v].flag & F_WATER); };

test('a fall\'s lip is not a straight line, and its water comes over in strands', () => {
  for (const o of [{ kind: 'ledge', width: 100, drop: 56, seed: 5 }, { kind: 'ledge', width: 220, drop: 64, seed: 31 }, { kind: 'twoTier', width: 128, drop: 90, seed: 17 }]) {
    const m = fallModel(o), cx = Math.round(m.w / 2), z = o.drop - 1;
    // the front edge of the water at the lip, column by column across the notch
    const edge = [];
    for (let x = cx - o.width / 2 + 6; x < cx + o.width / 2 - 6; x++) { let e = -1; for (let y = 0; y < m.d; y++) if (isWater(m, x, y, z) || isWater(m, x, y, z - 1)) e = y; if (e >= 0) edge.push(e); }
    assert.ok(edge.length > o.width * 0.5, `${o.kind} ${o.width}: water over the lip`);
    const lo = Math.min(...edge), hi = Math.max(...edge);
    assert.ok(hi - lo >= 3, `${o.kind} ${o.width}: the lip wanders (${lo}..${hi})`);
    // a little way down the face: strands, with gaps between them, of different widths
    const zz = Math.round(o.kind === 'twoTier' ? o.drop - 6 : o.drop - 4), runs = [];
    let run = 0;
    for (let x = cx - o.width / 2; x <= cx + o.width / 2; x++) {
      let w = false; for (let y = 0; y < m.d; y++) if (isWater(m, x, y, zz)) { w = true; break; }
      if (w) run++; else if (run) { runs.push(run); run = 0; }
    }
    if (run) runs.push(run);
    assert.ok(runs.length >= 2, `${o.kind} ${o.width}: strands (${runs})`);
    assert.ok(Math.max(...runs) - Math.min(...runs) >= 4, `${o.kind} ${o.width}: of different widths (${runs})`);
  }
});

test('the walls beside a fall stand to its lip by the water and step down away from it; a cliff in ledges', () => {
  const o = { kind: 'ledge', width: 100, drop: 56, seed: 5, rock: 56 }, m = fallModel(o), cx = m.w / 2;
  const top = (x) => { let best = 0; for (let y = 0; y < m.d; y++) for (let z = m.h - 1; z > best; z--) { const v = m.get(x, y, z); if (v && !(m.mats[v].flag & F_WATER)) { best = z; break; } } return best; };
  const near = Math.max(top(Math.round(cx - o.width / 2 - 4)), top(Math.round(cx + o.width / 2 + 3))), far = Math.min(top(1), top(m.w - 2));
  assert.ok(near >= o.drop - 4, `by the water, up to the lip (${near})`);
  assert.ok(far < near - 10, `stepping down away from it (${far} < ${near})`);
  // a cliff: lower at its front than further back (ledges), its ends lower than its middle
  const c = cliffWall(150, 64, 60, 31, 1);
  const hAt = (x, y) => { for (let z = c.h - 1; z >= 0; z--) if (c.get(x, y, z)) return z; return -1; };
  let ledged = 0;
  for (let x = 30; x < 120; x += 5) { let front = -1; for (let y = c.d - 1; y >= 0; y--) if (hAt(x, y) >= 0) { front = y; break; } if (front > 20 && hAt(x, front) < hAt(x, front - 18) - 6) ledged++; }
  assert.ok(ledged >= 8, `ledges stepping back up the face (${ledged} of 18)`);
  assert.ok(hAt(1, 20) < hAt(75, 20) - 10 && hAt(148, 20) < hAt(75, 20) - 10, 'its ends come down into the ground');
});
