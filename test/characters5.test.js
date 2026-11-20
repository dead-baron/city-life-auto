// Character polish, pass 5 (docs/tasks/CHARACTERS5.md, docs/characters/NOTES.md): hair shapes that read (the owner's
// shot, docs/characters/owner-hair-1119.png), his notes on pass 4's underwear, the concept checklist.
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
const style = (n) => LK.HAIR_STYLES.findIndex((s) => s[0] === n);
const wears = (n, base = 'f') => plain(base, (L) => { L.hair.style = style(n); L.hair.color = 3; });
// a figure's rows from its top: how many art pixels wide each is; how tall it stands over its feet
const rows = (G) => { const r = []; for (let y = 0; y < G.h; y++) { let n = 0; for (let x = 0; x < G.w; x++) if (G.p0[(y * G.w + x) * 4 + 3]) n++; if (n || r.length) r.push(n); } return r; };
const tall = (G) => { for (let y = 0; y < G.h; y++) for (let x = 0; x < G.w; x++) if (G.p0[(y * G.w + x) * 4 + 3]) return G.ay - y; return 0; };

test('a bun is a round knot on the crown, not a spike: wider than the tie under it, from the front and the back quarter', () => {
  for (const n of ['High bun', 'Half up']) for (const d of [0, 1, 7]) {
    const r = rows(withPass(() => baked(wears(n), d)));
    const top = Math.max(r[0], r[1], r[2]);
    assert.ok(top >= 3, `${n} facing ${d}: the knot is ${top} art pixels wide`);
    assert.ok(r.slice(1, 5).some((w, i) => w < Math.max(...r.slice(0, i + 1))), `${n} facing ${d}: a step in under the knot (${r.slice(0, 6)})`);
  }
  // pass 4's was a cone: every row wider than the one above it
  const r4 = rows(withPass(() => baked(wears('High bun'), 0), { hairRe: null }));
  assert.ok(r4.slice(1, 5).every((w, i) => w >= r4[i]), `pass 4's bun widened all the way down (${r4.slice(0, 6)})`);
});

test('a ponytail hangs behind the head: no spike over the crown from the front, a tail from the side and from behind', () => {
  for (const base of ['m', 'f']) {
    const crew = withPass(() => baked(wears('Crew cut', base), 0)), pony = withPass(() => baked(wears('Ponytail', base), 0)), old = withPass(() => baked(wears('Ponytail', base), 0), { hairRe: null });
    assert.ok(tall(pony) <= tall(crew) + 1, `${base}: from the front a ponytail stands ${tall(pony)} against a crew cut's ${tall(crew)}`);
    assert.ok(tall(old) >= tall(crew) + 3, `${base}: pass 4's stood ${tall(old)}`);
    for (const d of [2, 4, 6]) assert.ok(diff(withPass(() => baked(wears('Ponytail', base), d)), withPass(() => baked(wears('Crew cut', base), d))) >= 12, `${base} facing ${d}: the tail shows`);
  }
  // under a cap the tail still hangs
  const cap = (n) => plain('f', (L) => { L.hair.style = style(n); L.outfit.hat = LK.item('Baseball cap'); });
  assert.ok(diff(withPass(() => baked(cap('Ponytail'), 4)), withPass(() => baked(cap('Crew cut'), 4))) >= 8);
});

test('the tied styles in shapes of their own: a man bun behind the head, buns and puffs apart, pigtails out at the sides, a mohawk two art pixels wide', () => {
  // a man bun: nothing over the crown from the front, a knot behind it from the side
  const mb = withPass(() => baked(wears('Man bun', 'm'), 0)), sl = withPass(() => baked(wears('Slicked back', 'm'), 0));
  assert.ok(tall(mb) <= tall(sl) + 1, 'a man bun is not a point on the crown');
  assert.ok(diff(withPass(() => baked(wears('Man bun', 'm'), 2)), withPass(() => baked(wears('Slicked back', 'm'), 2))) >= 8, 'a man bun from the side');
  // space buns and puffs: the top row is two knots with a gap between them
  for (const n of ['Space buns', 'Afro puffs']) {
    const G = withPass(() => baked(wears(n), 0)); let y = 0, xs = [];
    for (; y < G.h && !xs.length; y++) for (let x = 0; x < G.w; x++) if (G.p0[(y * G.w + x) * 4 + 3]) xs.push(x);
    assert.ok(xs[xs.length - 1] - xs[0] >= 5 && xs.length < xs[xs.length - 1] - xs[0] + 1, `${n}: two knots apart (${xs})`);
  }
  // pigtails: wider than the same head with a bun
  const w = (G) => Math.max(...rows(G).slice(0, 12));
  assert.ok(w(withPass(() => baked(wears('Pigtails'), 0))) >= w(withPass(() => baked(wears('High bun'), 0))) + 2, 'pigtails stand out from the sides');
  // a mohawk's crest from the front: its top rows two art pixels and more
  const mo = rows(withPass(() => baked(wears('Mohawk', 'm'), 0)));
  assert.ok(mo[1] >= 2 && mo[2] >= 2, `a mohawk's crest (${mo.slice(0, 5)})`);
});

test('every hairstyle still draws apart from every other, and with the pass off nothing moved', () => {
  const HS = LK.HAIR_STYLES.map((s, h) => [s, h]).filter(([s]) => s[1].includes('f'));
  const G = HS.map(([s, h]) => [0, 2, 4].map((d) => withPass(() => baked(plain('f', (L) => { L.hair.style = h; L.hair.color = 3; }), d, 'idle', 0, { region: 'head' }))));
  for (let i = 0; i < G.length; i++) for (let j = i + 1; j < G.length; j++) assert.ok(G[i].some((g, k) => diff(g, G[j][k]) >= 3), `${HS[i][0][0]} and ${HS[j][0][0]} drawn alike`);
  // the shapes are behind the switch: with it off a bun is the renderer's own
  const A = wears('High bun'), off = baked(A, 0);
  assert.equal(diff(off, baked(A, 0)), 0);
  assert.ok(diff(off, withPass(() => baked(A, 0), { hairRe: null })) > 0);
});
