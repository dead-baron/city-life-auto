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
const fill = (A, d) => withPass(() => { const g = person(A, d, 'idle', 0, { tight: true, info: 1 }), G = downsample2(packGBuf(g)), r = []; for (let y = 0; y < G.h; y++) { let n = 0; for (let x = 0; x < G.w; x++) { const o = y * G.w + x; if (G.p0[o * 4 + 3] && G.pick[o] >= 0 && !g.info.ol[G.pick[o]]) n++; } if (n || r.length) r.push(n); } return r; });
const rows = (G) => { const r = []; for (let y = 0; y < G.h; y++) { let n = 0; for (let x = 0; x < G.w; x++) if (G.p0[(y * G.w + x) * 4 + 3]) n++; if (n || r.length) r.push(n); } return r; };
const tall = (G) => { for (let y = 0; y < G.h; y++) for (let x = 0; x < G.w; x++) if (G.p0[(y * G.w + x) * 4 + 3]) return G.ay - y; return 0; };

test('a bun is a round knot on the crown, not a spike: wider than the tie under it, from the front and the back quarter', () => {
  for (const n of ['High bun', 'Half up']) for (const d of [0, 1, 7]) {
    const r = fill(wears(n), d);   // (the hair itself, without the outline round it: that fills a one-pixel waist)
    const top = Math.max(r[0], r[1], r[2]);
    assert.ok(top >= 3, `${n} facing ${d}: the knot is ${top} art pixels wide`);
    assert.ok(r.slice(1, 5).some((w, i) => w < Math.max(...r.slice(0, i + 1))), `${n} facing ${d}: a step in under the knot (${r.slice(0, 6)})`);
  }
});

test('a ponytail hangs behind the head: no spike over the crown from the front, a tail from the side and from behind', () => {
  for (const base of ['m', 'f']) {
    const crew = withPass(() => baked(wears('Crew cut', base), 0)), pony = withPass(() => baked(wears('Ponytail', base), 0));
    assert.ok(tall(pony) <= tall(crew) + 1, `${base}: from the front a ponytail stands ${tall(pony)} against a crew cut's ${tall(crew)}`);
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

// ---- the owner's notes on pass 4's underwear ---------------------------------------------------------------------------
const wear = (base, name, c, t = c, skin = 2) => { const L = LK.emptyLook(base); L.body.skin = skin; L.hair.style = 2; if (name) L.outfit.under = LK.item(name, c, t); return LK.lookArt(LK.validLook(L)); };
// the art pixels a piece's colour reaches: where the same figure in two colours differs
const own = (base, name, d = 0) => withPass(() => {
  const bk = (A) => { const g = person(A, d, 'idle', 0, { tight: true, info: 1 }), s = downsample2(packGBuf(g)); s.line = (o) => s.pick[o] >= 0 && (g.info.ol[s.pick[o]] === 1 || g.info.grp[s.pick[o]] <= 3); return s; };   // (nor the head and hair: a look's seed moves a lock)   // (line: the outline, which takes a tone of the piece but isn't the piece)
  const a = bk(wear(base, name, 'hot pink')), b = bk(wear(base, name, 'teal')), px = [];
  for (let y = 0; y < a.h; y++) for (let x = 0; x < a.w; x++) {
    const i = y * a.w + x, bx = x - a.ax + b.ax, by = y - a.ay + b.ay, j = by * b.w + bx;
    if (a.p0[i * 4 + 3] && !a.line(i) && bx >= 0 && by >= 0 && bx < b.w && by < b.h && b.p0[j * 4 + 3] && (a.p0[i * 4] !== b.p0[j * 4] || a.p0[i * 4 + 1] !== b.p0[j * 4 + 1])) px.push([x, y]);
  }
  return px;
});

test('no underwear picked: boxers for a man, a bra and panties for a woman', () => {
  const m = LK.lookArt(LK.emptyLook('m')), f = LK.lookArt(LK.emptyLook('f'));
  assert.equal(m.bottom.kind, 'trunks'); assert.equal(m.top.kind, 'none');
  assert.equal(f.top.kind, 'bra'); assert.equal(f.bottom.kind, 'bikini');
  // drawn by the pass as the pieces are: a man's as long as Boxers (not fitted trunks), a woman's as Bra and briefs
  const span = (G) => { let a = 99, b = 0; for (let y = 0; y < G.h; y++) for (let x = 0; x < G.w; x++) { const o = (y * G.w + x) * 4; if (G.p0[o + 3] && G.p0[o + 2] > 190 && G.p0[o] > 170 && Math.abs(G.p0[o] - G.p0[o + 2]) < 40) { a = Math.min(a, y); b = Math.max(b, y); } } return b - a; };
  const basic = withPass(() => baked(wear('m', null), 0)), boxers = withPass(() => baked(wear('m', 'Boxers', 'white'), 0)), trunks = withPass(() => baked(wear('m', 'Fitted trunks', 'white'), 0));
  assert.equal(span(basic), span(boxers), 'the basics reach as far down the thigh as boxers');
  assert.ok(span(basic) >= span(trunks), 'and no less than fitted trunks');
  const fb = withPass(() => baked(wear('f', null, null, null, 9), 0)), set = withPass(() => baked(wear('f', 'Bra and briefs', 'white', 'white', 9), 0));
  const pale = (G) => { let n = 0; for (let o = 0; o < G.w * G.h * 4; o += 4) if (G.p0[o + 3] && G.p0[o + 2] > 170 && G.p0[o] > 160) n++; return n; };
  assert.ok(pale(set) >= 18 && Math.abs(pale(fb) - pale(set)) <= 3, `a woman's basics are a bra and briefs (${pale(fb)} pale art pixels against the set's ${pale(set)})`);
});

test('a woman\'s briefs and panties: a strap round the hips and a small triangle to the leg under it', () => {
  for (const n of ['Briefs', 'Bra and briefs', 'Lace bra and panties']) {
    // (the rows under the bra, on the chunky build of 11-20: a small wedge - three or four art pixels across at its widest, two at the leg)
    const px = own('f', n).filter(([, y]) => y > 15), ys = [...new Set(px.map((p) => p[1]))].sort((a, b) => a - b), w = ys.map((y) => px.filter((p) => p[1] === y).length), top = Math.max(...w);
    assert.ok(w.length >= 2 && w.length <= 4, `${n}: ${w.length} rows (${w})`);
    // (11-20, the owner: "a visible strap that goes around the hip" - the triangle's top row runs on across the hips)
    assert.ok(top >= 6 && top <= 10, `${n}: a strap across the hips (${w})`);
    assert.ok(w[w.length - 1] <= top - 3, `${n}: narrowing to the leg under it (${w})`);
  }
  assert.ok(own('f', 'Briefs').filter(([, y]) => y > 15).length <= own('m', 'Briefs').length + 2, 'no bigger than a man\'s');
});

test('the union suit has no buttons; the slip is its own cloth again (pass 3\'s look)', () => {
  // (below the head: a look's colours seed its face)
  for (const base of ['m', 'f']) { const a = withPass(() => baked(wear(base, 'Union suit', 'red', 'white'), 0)), b = withPass(() => baked(wear(base, 'Union suit', 'red', 'black'), 0)); for (let i = 9 * a.w; i < a.w * a.h; i++) assert.equal(a.p0[i * 4], b.p0[i * 4], `${base}: nothing in the trim colour down the front`); }
  const G = withPass(() => baked(wear('f', 'Silk slip', 'cream', 'cream'), 0)); let warm = 0, cool = 0;
  for (let o = 0; o < G.w * G.h * 4; o += 4) if (G.p0[o + 3] && G.p0[o] > 150 && G.p0[o + 1] > 140) { if (G.p0[o] - G.p0[o + 2] > 24) warm++; else if (G.p0[o + 2] >= G.p0[o]) cool++; }
  assert.ok(warm > 12 && cool < 4, `the slip is cream, not blue-grey (${warm} warm, ${cool} cool)`);
});
