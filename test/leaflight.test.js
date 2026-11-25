// Plants lit evenly, never black (client/art2/flora.js leafLight, statics.js makeFlora; the owner, 11-24 22:23 / 23:06
// and 11-25 00:04: the near-black shade baked into the undersides of trees and shrubs, "can we identify these and
// others across the entire environment/nature art packs"). Measured before: lit at noon, 102 of 121 plant kinds had
// over 15% of their pixels near-black - painted dark (after the concept sheet NK1-M, which goes to black where the
// style anchor R1-D's darkest green is 25, 57, 45) and turned from the sun at once. Now, for every kind the world
// plants: no leaf pixel painted darker than the anchor's dark green, its leaf pixels facing up enough that the game's
// light falls on them evenly (as on the sword fern), and - lit as the game lights it at noon - no leafy plant a
// near-black mass. The game's light still does the rest: cast shadows, the hour, the weather.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeStatic, FLORA_SPECIES } from '../client/art2/game/statics.js';
import { LEAF_LOOK, BARK_LOOK } from '../client/art2/flora.js';
import { F_LEAF } from '../client/art2/gbuf.js';
import { PRESETS_GAME } from '../client/art2/game/lightgame.js';

const lum = (c, j) => c[j] * 0.3 + c[j + 1] * 0.59 + c[j + 2] * 0.11;
const P = PRESETS_GAME.noon, sl = Math.hypot(...P.sunDir), sun = P.sunDir.map((v) => v / sl);
// (the light pass's shade for one pixel, without cast shadows: lightgame.js shade)
function lit(G, i) {
  const j = i * 4, n = [G.nrm[j] / 127.5 - 1, G.nrm[j + 1] / 127.5 - 1, G.nrm[j + 2] / 127.5 - 1], l = Math.hypot(...n) || 1, d = Math.max(0, (n[0] * sun[0] + n[1] * sun[1] + n[2] * sun[2]) / l), kk = n[2] / l * 0.5 + 0.5, o = [0, 0, 0];
  for (let c = 0; c < 3; c++) { let v = Math.pow(G.col[j + c] / 255, 2.2) * (P.ambGround[c] + (P.ambSky[c] - P.ambGround[c]) * kk + P.sunCol[c] * d); v = v / (1 + v * 0.18); o[c] = Math.pow(v, 1 / 2.2) * 255; }
  return o[0] * 0.3 + o[1] * 0.59 + o[2] * 0.11;
}
const kinds = FLORA_SPECIES.filter((sp) => sp !== 'sorrel');

test('no leaf is painted darker than the style anchor\'s dark green, and leaves face the light evenly', () => {
  let leafy = 0;
  for (const sp of kinds) for (let v = 0; v < 4; v++) {
    const G = makeStatic({ t: 'f', sp, s: 1000 + v * 37 + sp.length * 7, k: 1.2 });
    let n = 0, dark = 0, low = 0, min = 255;
    for (let i = 0; i < G.w * G.h; i++) {
      if (!G.col[i * 4 + 3] || !(G.flag[i] & F_LEAF)) continue;
      n++;
      const l = lum(G.col, i * 4); min = Math.min(min, l); if (l < LEAF_LOOK.dark - 3) dark++;
      if (G.nrm[i * 4 + 3] && G.nrm[i * 4 + 2] / 127.5 - 1 < 0.7) low++;
    }
    if (n < 40) continue;
    leafy++;
    assert.equal(dark, 0, `${sp} ${v}: ${dark} of ${n} leaf pixels painted darker than ${LEAF_LOOK.dark} (the darkest ${min.toFixed(0)})`);
    assert.ok(low / n < 0.02, `${sp} ${v}: ${low} of ${n} leaf pixels turned from the light`);
  }
  assert.ok(leafy > 300, `leafy plants checked (${leafy})`);
});

test('lit at noon, no plant is a near-black mass: its leaves under 6% near-black, a whole kind seldom over 15%', () => {
  const over = [];
  let worst = 0, worstSp = '';
  for (const sp of kinds) {
    let n = 0, dark = 0, ln = 0, ldark = 0;
    for (let v = 0; v < 3; v++) {
      const G = makeStatic({ t: 'f', sp, s: 1000 + v * 37 + sp.length * 7, k: 1.2 });
      for (let i = 0; i < G.w * G.h; i++) { if (!G.col[i * 4 + 3]) continue; const d = lit(G, i) < 50; n++; if (d) dark++; if (G.flag[i] & F_LEAF) { ln++; if (d) ldark++; } }
    }
    if (ln >= 120) { assert.ok(ldark / ln < 0.06, `${sp}: ${(ldark / ln * 100).toFixed(1)}% of its leaves near-black at noon`); if (ldark / ln > worst) { worst = ldark / ln; worstSp = sp; } }
    if (dark / n > 0.15) over.push(`${sp} ${Math.round(dark / n * 100)}%`);
  }
  // (what is left is not leaf: bark, cones, stones in the ambient light of a face turned from the noon sun - since
  // 11-25 lifted too, flora.js BARK_LOOK: 18 kinds over 15% before it; pinned so it cannot grow)
  console.log('darkest leaves:', worstSp, (worst * 100).toFixed(1) + '%', '| kinds over 15% near-black by their bark, stone or stems:', over.length, over.join(', '));
  assert.ok(over.length <= 2, `kinds over 15% near-black (${over.length}; were 102, then 18 by their bark)`);
});

// Bark, stems, cactus skin and stones too (the owner, 11-25 03:18: "make sure you are fixing the darkness on the
// trees/plants/etc. we discussed earlier and that is prioritized"): no pixel of a plant is painted darker than the
// floor - a trunk's furrows and its flank away from the light are dark wood, not black.
test('no bark, stem or stone of a plant is painted near-black', () => {
  let checked = 0;
  for (const sp of kinds) for (let v = 0; v < 3; v++) {
    const G = makeStatic({ t: 'f', sp, s: 1000 + v * 37 + sp.length * 7, k: 1.2 });
    let n = 0, dark = 0, min = 255;
    for (let i = 0; i < G.w * G.h; i++) { if (!G.col[i * 4 + 3] || (G.flag[i] & F_LEAF)) continue; n++; const l = lum(G.col, i * 4); min = Math.min(min, l); if (l < BARK_LOOK.dark - 4) dark++; }
    if (!n) continue;
    checked++;
    assert.equal(dark, 0, `${sp} ${v}: ${dark} of ${n} bark or stem pixels painted darker than ${BARK_LOOK.dark} (the darkest ${min.toFixed(0)})`);
  }
  assert.ok(checked > 250, `plants with bark or stems checked (${checked})`);
});
