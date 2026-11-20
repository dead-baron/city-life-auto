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
const tones = (G) => { const s = new Set(); for (let o = 0; o < G.w * G.h * 4; o += 4) if (G.p0[o + 3]) s.add(G.p0[o] << 16 | G.p0[o + 1] << 8 | G.p0[o + 2]); return s.size; };
const plain = (base, f = () => {}) => { const L = LK.emptyLook(base); L.hair.style = 2; L.outfit.top = LK.item('Plain tee'); L.outfit.bottoms = LK.item('Jeans'); L.outfit.shoes = LK.item('Sneakers'); f(L); return LK.lookArt(LK.validLook(L)); };

test('the mouth is off behind one constant (the concepts\' small figures have none); painted lips still show', () => {
  assert.equal(POLISH.mouthOn, false);
  for (const base of ['m', 'f']) {
    const A = plain(base), off = withPass(() => baked(A)), on = withPass(() => baked(A), { mouthOn: true });
    const n = diff(off, on);
    assert.ok(n >= 1 && n <= 4, `${base}: the mouth is a pixel or two, and only that (${n})`);
    // with it on, the six lip shapes are six mouths
    const lips = LK.FACE_OPTS.lips.map((_, i) => withPass(() => baked(plain(base, (L) => { L.face.lips = i; }), 0, 'idle', 0, { region: 'head' }), { mouthOn: true }));
    for (let i = 0; i < lips.length; i++) for (let j = i + 1; j < lips.length; j++) assert.ok(diff(lips[i], lips[j]) >= 1, `${base}: ${LK.FACE_OPTS.lips[i]} and ${LK.FACE_OPTS.lips[j]} drawn alike`);
    // lipstick, glam and goth lips are paint: drawn whatever the constant says
    for (const makeup of [2, 5, 6]) {
      const P = plain(base, (L) => { L.extras.makeup = makeup; L.extras.makeupColor = 1; });
      assert.equal(diff(withPass(() => baked(P)), withPass(() => baked(P), { mouthOn: true })), 0, `${base} ${LK.MAKEUP[makeup]}: the same either way`);
    }
  }
});

test('hair as the concepts draw it: every style a mass in clean tones with a lit top, in every direction - and the shapes are the styles\' own', () => {
  assert.equal(POLISH.hairLit, true);
  let cleaner = 0, n = 0;
  LK.HAIR_STYLES.forEach((s, h) => {
    if (s[2] === 'bald') return;
    const base = s[1].includes('m') ? 'm' : 'f', A = plain(base, (L) => { L.hair.style = h; L.hair.color = 3; });
    for (const d of [0, 1, 2, 3, 4, 5, 6, 7]) {
      const p2 = withPass(() => baked(A, d, 'idle', 0, { region: 'head' }), { hairLit: null }), p3 = withPass(() => baked(A, d, 'idle', 0, { region: 'head' }));
      assert.equal(p3.w, p2.w); assert.equal(p3.h, p2.h);
      // the silhouette is the style's own: not one pixel of outline moves
      for (let o = 3; o < p2.w * p2.h * 4; o += 4) assert.equal(p3.p0[o], p2.p0[o], `${s[0]} facing ${d}: the same outline`);
      n++; if (tones(p3) <= tones(p2)) cleaner++;
    }
  });
  // a lit top: from behind, long hair's top rows are lighter than its lower rows
  const lum = (G, y) => { let sum = 0, c = 0; for (let x = 0; x < G.w; x++) { const o = (y * G.w + x) * 4; if (G.p0[o + 3]) { sum += 0.3 * G.p0[o] + 0.59 * G.p0[o + 1] + 0.11 * G.p0[o + 2]; c++; } } return sum / c; };
  const long = withPass(() => baked(plain('f', (L) => { L.hair.style = LK.HAIR_STYLES.findIndex((s) => s[0] === 'Long straight'); L.hair.color = 3; }), 4, 'idle', 0, { region: 'head' }));
  assert.ok(lum(long, 2) > lum(long, 7) + 8, `lit top ${lum(long, 2).toFixed(0)} over ${lum(long, 7).toFixed(0)}`);
  assert.ok(cleaner >= n * 0.8, `fewer tones, not more: ${cleaner} of ${n} heads`);
});
