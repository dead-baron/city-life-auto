// The nature pass's missing pieces (the owner, 2026-11-21: "please do create any missing art you find that would be
// useful"; concepts NS1-E, NS1-B): a dry-stone wall, a field gate, a stile, a rope swing, stone ruins in the woods
// (client/art2/props-rural.js), built at the art pixel and drawn by recipe 'va' (client/art2/game/statics.js). They
// are placed with the world batch; here: each is drawn, at the art pixel, with stone and wood where they belong.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeStatic } from '../client/art2/game/statics.js';
import { F_LEAF } from '../client/art2/gbuf.js';

const px = (G) => { let n = 0, leaf = 0, grey = 0, brown = 0; for (let i = 0; i < G.w * G.h; i++) { if (G.col[i * 4 + 3] !== 255) continue; n++; const r = G.col[i * 4], g = G.col[i * 4 + 1], b = G.col[i * 4 + 2]; if (G.flag[i] & F_LEAF) leaf++; else if (Math.abs(r - g) < 14 && Math.abs(g - b) < 18) grey++; else if (r > g && g > b) brown++; } return { n, leaf, grey, brown }; };
const make = (m, a = []) => makeStatic({ t: 'va', m, a });

test('the meadow\'s and the woods\' new pieces are drawn at the art pixel, in stone and wood', () => {
  for (const [m, a, kind] of [['dryWall', [44, 1], 'grey'], ['fieldGate', [26], 'brown'], ['stile', [], 'brown'], ['swing', [1], 'brown'], ['ruins', [1], 'grey']]) {
    const G = make(m, a), P = px(G);
    assert.equal(G.ap2, 2, `${m}: made at the art pixel`);
    assert.ok(P.n > 60, `${m}: drawn (${P.n} px)`);
    assert.ok(P[kind] > P.n * 0.4, `${m}: mostly ${kind} (${P[kind]} of ${P.n})`);
    assert.ok(G.ax > 0 && G.ax < G.w * 2 && G.ay > 0, `${m}: anchored inside its picture`);
  }
  assert.ok(px(make('ruins', [1])).leaf > 20, 'ivy on the ruins');
});

test('no two lengths of wall are the same, and a longer one is longer', () => {
  const a = make('dryWall', [44, 1]), b = make('dryWall', [44, 2]), c = make('dryWall', [60, 1]);
  assert.notDeepEqual(Array.from(a.col), Array.from(b.col), 'by seed');
  assert.ok(c.w > a.w, 'by length');
  assert.notDeepEqual(Array.from(make('ruins', [1]).col), Array.from(make('ruins', [4]).col), 'the ruins too');
});
