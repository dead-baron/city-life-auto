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
// (a giant's top is one of three by its shape number: statics.js RW_TOP - the spire, a column's round top, a ragged one)
const TOPS = [{}, { taper: 0, top: 'dome' }, { taper: 0, top: 'ragged' }];
function* trees() {
  for (const sp in SPECIES) { const [H, hw, o] = SPECIES[sp]; for (let t = 0; t < 9; t++) { const s = 1000 + t * 37 + sp.length * 7; yield [sp, t, giantRedwoodArt(s, H, hw, sp === 'redwood2' ? o : { ...o, ...TOPS[s % 3] }), hw / 2, sp === 'redwood2' ? 0 : s % 3]; } }
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

// The giants' tops are a mix of three (the owner, 11-25 03:20): the game's six shapes of each giant give two of each,
// and a column's end never shows - its top is closed over with sprays right across the trunk.
test('the giants\' tops are a mix of three, and a column\'s end is closed over with foliage', async () => {
  const { RW_TOP, redwoodTop } = await import('../client/art2/game/statics.js');
  assert.deepEqual(RW_TOP, TOPS);
  for (const sp of ['giantL', 'giant', 'giantS']) {
    const n = [0, 0, 0];
    for (let v = 0; v < 6; v++) n[RW_TOP.indexOf(redwoodTop(1000 + v * 37 + sp.length * 7))]++;
    assert.deepEqual(n, [2, 2, 2], `${sp}: the six shapes' tops ${n}`);
  }
  let cols = 0;
  for (const [sp, t, G, hw, top] of trees()) {
    if (!top) continue;
    cols++;
    // the trunk's end: where the bark stops, going up its middle - the rows round it across the trunk are foliage
    const H = SPECIES[sp][0] / 2, y0 = Math.round(G.ay / 2 - H + 2), w = Math.round(hw * 0.8);
    let n = 0, leaf = 0, bare = 0;
    for (let y = y0; y < y0 + 12; y++) for (let x = Math.round(G.ax / 2 - w); x <= G.ax / 2 + w; x++) { const i = y * G.w + x; n++; if (G.flag[i] & F_LEAF) leaf++; else if (G.col[i * 4 + 3]) bare++; }
    assert.ok(leaf / n > 0.8 && bare / n < 0.08, `${sp} ${t} (${TOPS[top].top}): over the trunk's end ${leaf} of ${n} pixels foliage, ${bare} bare wood`);
  }
  assert.ok(cols >= 15, `columns checked (${cols})`);
});

// A redwood's item claims the room its picture takes (statics.js redwoodRoom: half width, height, and the roots below
// its foot) - a picture beyond its room is cut off at a chunk's edge. (11-24: a giant's roots reached 86 px below a
// foot that claimed 60, and the second growth's widest crowns 110 px out of 100.)
test('a redwood\'s picture is inside the room its item claims', async () => {
  const { makeStatic, redwoodRoom } = await import('../client/art2/game/statics.js');
  // (the pictures natureItems places: a giant, its high-crowned form, the gate, the second growth and its high form)
  for (const [sp, art] of [['giantL', 'giantL'], ['giant', 'giant'], ['giantS', 'giantS'], ['giantL', 'giantLH'], ['giant', 'giantH'], ['giantS', 'giantSH'], ['gate', 'gate'], ['redwood2', 'redwood2'], ['redwood2', 'redwood2H']]) for (let v = 0; v < 12; v++) {
    const G = makeStatic({ t: 'f', sp: art, s: 1000 + v * 37 + sp.length * 7, k: 1 }), k = G.ap2 || 1, e = redwoodRoom(art);
    let L = 0, R = 0, U = 0, D = 0;
    for (let y = 0; y < G.h; y++) for (let x = 0; x < G.w; x++) if (G.col[(y * G.w + x) * 4 + 3]) { L = Math.max(L, G.ax - x * k); R = Math.max(R, (x + 1) * k - G.ax); U = Math.max(U, G.ay - y * k); D = Math.max(D, (y + 1) * k - G.ay); }
    assert.ok(L <= e[0] && U <= e[1] && R <= e[2] && D <= e[3], `${art} ${v}: L${L}/${e[0]} U${U}/${e[1]} R${R}/${e[2]} D${D}/${e[3]}`);
  }
});
