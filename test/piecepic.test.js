// The clothing pictures (the art pass, part C3; concept UIC-19): an Inventory tile shows the piece itself, drawn by the
// game's own people art (client/piecepic.js; the tiles: client/bag.js; the review sheet: tools/piecesheet.mjs).
// Counted 11-25: 390 pieces in 11 slots; every tile had shown one line glyph for its slot with a colour dot.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { setPolish } from '../client/art2/people.js';
import { POLISH } from '../client/art2/peoplepolish.js';
import { piecePixels, PIECEPIC } from '../client/piecepic.js';
import { PIECES, byName, col } from '../shared/lookcore.js';

const pic = (name, c, t) => { const id = byName(name); assert.ok(id, name); return piecePixels({ id, ...(c !== undefined ? { c: col(c) } : {}), ...(t !== undefined ? { t: col(t) } : {}) }); };
const mean = (R) => { let r = 0, g = 0, b = 0, n = 0; for (let i = 0; i < R.px.length; i += 4) if (R.px[i + 3]) { r += R.px[i]; g += R.px[i + 1]; b += R.px[i + 2]; n++; } return [r / n, g / n, b / n]; };

test('a piece alone, at the game\'s own size: a tee, jeans, a pair of shoes, a hat', () => {
  setPolish(POLISH);
  try {
    const tee = pic('Plain tee'), jeans = pic('Jeans'), shoes = pic('Sneakers'), cap = pic('Baseball cap');
    for (const [nm, R] of [['tee', tee], ['jeans', jeans], ['shoes', shoes], ['cap', cap]]) assert.ok(R && R.n >= PIECEPIC.min && R.w <= 24 && R.h <= 30, `${nm}: a picture that fits a tile (${R && [R.w, R.h, R.n]})`);
    assert.ok(tee.w > tee.h && tee.w >= 12 && jeans.w <= tee.w, 'a tee is wider than tall, with its sleeves; jeans no wider than it');
    assert.ok(shoes.h <= 6 && shoes.w >= 8, `a pair of shoes: low and wide (${shoes.w} x ${shoes.h})`);
    // no skin and no underwear in a picture: a tee's pixels are the tee's
    const [r, g, b] = mean(tee); assert.ok(r > 170 && g > 170 && b > 160, `a white tee is white (${[r, g, b].map(Math.round)})`);
  } finally { setPolish(null); }
});

test('in the colours it is worn in; what puts nothing on the figure has no picture', () => {
  setPolish(POLISH);
  try {
    const red = mean(pic('Plain tee', 'red')), blue = mean(pic('Plain tee', 'royal blue'));
    assert.ok(red[0] > red[2] + 50 && blue[2] > blue[0] + 30, `a red tee red, a blue one blue (${red.map(Math.round)} / ${blue.map(Math.round)})`);
    assert.equal(pic('Bare chest'), null); assert.equal(pic('Barefoot'), null);
    assert.equal(piecePixels({ id: 99999 }), null); assert.equal(piecePixels(null), null);
    // a cream top on a light skin, a dark one on a dark skin: both drawn whole (the two bare figures)
    assert.ok(pic('Plain tee', 'cream').n >= 60 && pic('Plain tee', 'black').n >= 60);
  } finally { setPolish(null); }
});

test('nine pieces in ten have a picture of their own; every slot of clothes has them', () => {
  setPolish(POLISH);
  try {
    const by = {}; let have = 0, all = 0;
    for (const P of PIECES) { if (!P) continue; all++; const R = piecePixels({ id: P.i }); (by[P.slot] ||= [0, 0])[1]++; if (R) { have++; by[P.slot][0]++; assert.ok(R.w <= 40 && R.h <= 52, `${P.name}: within the figure (${R.w} x ${R.h})`); } }
    console.log('piece pictures', have, 'of', all, JSON.stringify(by));
    assert.ok(have >= all * 0.88, `pieces with a picture: ${have} of ${all}`);
    for (const s of ['top', 'jacket', 'bottoms', 'set', 'shoes', 'hat', 'under']) assert.ok(by[s][0] >= by[s][1] - 2, `${s}: ${by[s][0]} of ${by[s][1]}`);
  } finally { setPolish(null); }
});

test('the Inventory: a tile is the picture, the glyph until it is drawn and where there is none', () => {
  const S = readFileSync(new URL('../client/bag.js', import.meta.url), 'utf8');
  assert.match(S, /import \{ piecePixels \} from '\.\/piecepic\.js';/);
  assert.match(S, /if \(u\) return ppImg\(u, px\);\n  if \(u === null\) return pieceGlyph\(it, px0\);/);
  assert.match(S, /image-rendering:pixelated/);
  assert.match(S, /const k = Math\.max\(1, Math\.floor\(\(px \+ PP_OVER\) \/ Math\.max\(u\.w, u\.h\)\)\);/, 'at a whole number of the game\'s pixels');
  assert.match(S, /pieceTile\(it, 26, PP_FIT\)/, 'bigger on the figure\'s slots, inside its box in the grid');
  assert.match(S, /export const PP_FIT = 1\.25, PP_OVER = 4, PP_RIM = \[232, 220, 192, 255\];/, 'a hard cream rim, so a dark piece shows on the navy tile');
});
