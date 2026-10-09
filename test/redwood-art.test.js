// The giant redwoods as the game draws them (client/art2/redwoods.js giantRedwood, statics.js SPECIES): a flared,
// rooted foot with no grey fire hollow in it, and a trunk that rises into its crown with no grey dead top above it
// (task #399).
import test from 'node:test';
import assert from 'node:assert/strict';
import { giantRedwoodArt } from '../client/art2/redwoods.js';
import { F_LEAF } from '../client/art2/gbuf.js';

const SPECIES = { giantL: [720, 70, {}], giant: [620, 54, {}], giantS: [520, 40, {}], redwood2: [340, 16, { flare: 0.45, crown: 1, low: 0.3, cone: 1 }] };
const lum = (G, i) => G.col[i * 4] * 0.3 + G.col[i * 4 + 1] * 0.59 + G.col[i * 4 + 2] * 0.11;
const grey = (G, i) => { const r = G.col[i * 4], g = G.col[i * 4 + 1], b = G.col[i * 4 + 2]; return Math.max(r, g, b) - Math.min(r, g, b) < 30; };
// nine trees of each kind (the game's three variants among them: 1000 + v * 37 + the name's length * 7)
function* trees() {
  for (const sp in SPECIES) { const [H, hw, o] = SPECIES[sp]; for (let t = 0; t < 9; t++) yield [sp, t, giantRedwoodArt(1000 + t * 37 + sp.length * 7, H, hw, o), hw / 2]; }
}

test('no grey triangle at a redwood\'s foot: the trunk\'s face there is bark and moss', () => {
  for (const [sp, t, G, hw] of trees()) {
    // the front of the trunk from the ground up two trunk-widths: where the fire hollow was
    let n = 0, dark = 0;
    for (let y = Math.round(G.ay / 2 - hw * 2); y < G.ay / 2; y++) for (let x = Math.round(G.ax / 2 - hw * 0.3); x <= G.ax / 2 + hw * 0.3; x++) {
      const i = y * G.w + x;
      if (!G.col[i * 4 + 3]) continue;
      n++;
      if (lum(G, i) < 70 && grey(G, i)) dark++;
    }
    assert.ok(n > 20 && dark / n < 0.06, `${sp} ${t}: ${dark} of ${n} pixels of its foot's face are a dark grey hollow`);
  }
});

test('no grey cone on top: the crown closes over the trunk\'s tip', () => {
  for (const [sp, t, G] of trees()) {
    // the top rows of the tree: foliage, nothing standing up out of it
    let top = -1;
    for (let y = 0; y < G.h && top < 0; y++) for (let x = 0; x < G.w; x++) if (G.col[(y * G.w + x) * 4 + 3]) { top = y; break; }
    let n = 0, leaf = 0, greyN = 0;
    for (let y = top; y < top + 8; y++) for (let x = 0; x < G.w; x++) {
      const i = y * G.w + x;
      if (!G.col[i * 4 + 3]) continue;
      n++;
      if (G.flag[i] & F_LEAF) leaf++;
      else if (grey(G, i) && lum(G, i) > 60) greyN++;
    }
    assert.ok(leaf / n > 0.85, `${sp} ${t}: the top of the tree is foliage (${leaf} of ${n} pixels)`);
    assert.ok(greyN <= 2, `${sp} ${t}: no grey spike on top (${greyN} grey pixels; a stray one off a bough is fine)`);
  }
});
