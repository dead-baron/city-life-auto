// Character polish, pass 3 (docs/tasks/CHARACTERS3.md, docs/characters/NOTES.md): the owner's decisions of 11-19 (no
// mouth on the small figures, behind one constant) and the gap list's open rows, as they are built.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { person, setPolish } from '../client/art2/people.js';
import { POLISH } from '../client/art2/peoplepolish.js';
import { packGBuf, downsample2 } from '../client/art2/gbuf.js';
import * as LK from '../shared/look.js';

const baked = (A, d = 0, pose = 'idle', f = 0, opt = {}) => downsample2(packGBuf(person(A, d, pose, f, { tight: true, ...opt })));
const diff = (a, b) => { if (a.w !== b.w || a.h !== b.h) return 999; let n = 0; for (let o = 0; o < a.w * a.h * 4; o += 4) if (a.p0[o] !== b.p0[o] || a.p0[o + 1] !== b.p0[o + 1] || a.p0[o + 2] !== b.p0[o + 2] || a.p0[o + 3] !== b.p0[o + 3]) n++; return n; };
const withPass = (f, more = null) => { setPolish(more ? { ...POLISH, ...more } : POLISH); try { return f(); } finally { setPolish(null); } };
const plain = (base, f = () => {}) => { const L = LK.emptyLook(base); L.hair.style = 2; L.outfit.top = LK.item('Plain tee'); L.outfit.bottoms = LK.item('Jeans'); L.outfit.shoes = LK.item('Sneakers'); f(L); return LK.lookArt(LK.validLook(L)); };

test('the mouth is off behind one constant (the concepts\' small figures have none); painted lips still show', () => {
  assert.equal(POLISH.mouthOn, false);
  for (const base of ['m', 'f']) {
    const A = plain(base), off = withPass(() => baked(A)), on = withPass(() => baked(A), { mouthOn: true });
    const n = diff(off, on);
    assert.ok(n >= 1 && n <= 4, `${base}: the mouth is a pixel or two, and only that (${n})`);
    // lipstick, glam and goth lips are paint: drawn whatever the constant says
    for (const makeup of [2, 5, 6]) {
      const P = plain(base, (L) => { L.extras.makeup = makeup; L.extras.makeupColor = 1; });
      assert.equal(diff(withPass(() => baked(P)), withPass(() => baked(P), { mouthOn: true })), 0, `${base} ${LK.MAKEUP[makeup]}: the same either way`);
    }
  }
});
