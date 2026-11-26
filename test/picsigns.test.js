// The hanging picture signs (the owner, 11-26, of report-92 - the concept BF2 and three ways on one street: "a
// combination of A and B is good, not every shop in the world needs the sign, but it looks good when some do"):
// the pictures (client/art2/signfont.js PICS, made by tools/signpics.py), the sign on a front (buildings.js picSign).
// Which fronts carry one is the bake's rule (statics.js PIC_SIGNS); the world's count and placing are the lint's
// (test/placementlint.test.js: picSign 0, between 60 signs and four fronts in ten).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PICS, PIC_PAL, PIC_OF, picBitmap, TRADES } from '../client/art2/signfont.js';
import { makeBuilding, buildingH, picSignBox, PICSIGN, signLift } from '../client/art2/buildings.js';
import { PIC_SIGNS } from '../client/art2/game/statics.js';

test('the pictures: 14 x 14 at the art pixel, in the palette, each its own drawing, one for every trade named', () => {
  const seen = new Map();
  for (const [k, [ground, rows]] of Object.entries(PICS)) {
    assert.ok(PIC_PAL[ground], `${k}: its ground`);
    const R = rows.split('|');
    assert.equal(R.length, 14, k);
    let on = 0, cols = new Set();
    for (const r of R) { assert.equal(r.length, 14, k); for (const ch of r) { if (ch === '.') continue; assert.ok(PIC_PAL[ch], `${k}: ${ch}`); on++; cols.add(ch); } }
    assert.ok(on >= 40 && on <= 190, `${k}: drawn, not a block (${on} of 196)`);
    assert.ok(cols.size >= 2, `${k}: more than one colour`);
    assert.ok([...cols].some((c) => c !== ground), `${k}: not all its ground's colour`);
    assert.ok(!seen.has(rows), `${k} and ${seen.get(rows)}: one drawing`); seen.set(rows, k);
    const B = picBitmap(k);
    assert.equal(B.rows.length, 14); assert.deepEqual(B.ground, PIC_PAL[ground]);
  }
  assert.ok(Object.keys(PICS).length >= 20);
  for (const [trade, pic] of Object.entries(PIC_OF)) assert.ok(PICS[pic], `${trade}: ${pic}`);
  for (const t of ['books', 'cafe', 'diner', 'pawn', 'records', 'laundromat', 'barber', 'liquor', 'grocer', 'hardware', 'mart']) assert.ok(PIC_OF[t] && (TRADES[t] || t === 'records' || t === 'cafe' || t === 'grocer'), t);
  assert.equal(picBitmap('nothing'), null);
});

test('the sign on a front: hung over the board at the end asked for, the picture drawn, the rest of the front as it was', () => {
  const spec = (ps) => ({ w: 256, d: 160, floors: 3, style: 'brick', seed: 7, parapet: 8, shop: { kind: 'diner', door: 'left', open: true, people: 2, sign: { text: 'RED CUP DINER', bg: '#f4f2ea', fg: [176, 40, 46], lit: true } }, ...(ps ? { picSign: ps } : null) });
  const base = spec(null), v = 48 + signLift(base) + 22 + PIC_SIGNS.gap, ps = { pic: 'burger', x: 256 - PICSIGN.s * 2 - PIC_SIGNS.edge, v };
  const A = makeBuilding(spec(null)), B = makeBuilding(spec(ps));
  assert.equal(A.w, B.w); assert.equal(A.h, B.h);
  const H = buildingH(base), yG = base.d + H, box = picSignBox(ps);
  assert.ok(box[3] <= H - 8, 'under the wall\'s top'); assert.ok(box[1] >= 48 + signLift(base) + 22 + 4, 'over the board');
  // what changed lies inside the sign's box, and the picture's own colours are there
  let out = 0, inside = 0; const want = new Set(picBitmap('burger').rows.flat().filter(Boolean).map((c) => c.join(','))), got = new Set();
  for (let y = 0; y < A.h; y++) for (let x = 0; x < A.w; x++) {
    const j = (y * A.w + x) * 4;
    if (A.col[j] === B.col[j] && A.col[j + 1] === B.col[j + 1] && A.col[j + 2] === B.col[j + 2] && A.col[j + 3] === B.col[j + 3]) continue;
    const up = yG - y;   // (the height above the wall's foot)
    if (x >= box[0] && x < box[2] && up > box[1] && up <= box[3]) { inside++; got.add([B.col[j], B.col[j + 1], B.col[j + 2]].join(',')); } else out++;
  }
  assert.equal(out, 0, 'nothing outside the sign changed');
  assert.ok(inside > PICSIGN.s * PICSIGN.s * 4 * 0.8, `the board drawn (${inside} px)`);
  for (const c of want) assert.ok(got.has(c), `the picture's ${c}`);
  assert.ok(A.signBox && B.signBox && A.signBox.y === B.signBox.y, 'the name board where it was');
  // a front whose name went up onto a canopy carries none
  const M = spec(ps); M.shop.sign.moved = 'cover';
  const N = spec(null); N.shop.sign.moved = 'cover';
  const Gm = makeBuilding(M), Gn = makeBuilding(N); let diff = 0;
  for (let i = 0; i < Gm.col.length; i++) if (Gm.col[i] !== Gn.col[i]) diff++;
  assert.equal(diff, 0);
});
