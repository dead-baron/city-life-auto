// Character polish, pass 4 (docs/tasks/CHARACTERS4.md, docs/characters/NOTES.md): the owner's calls of 11-19 and the
// underwear redrawn on the art grid (client/art2/peoplepolish.js under4).
import test from 'node:test';
import assert from 'node:assert/strict';
import { person, setPolish } from '../client/art2/people.js';
import { POLISH } from '../client/art2/peoplepolish.js';
import { packGBuf, downsample2 } from '../client/art2/gbuf.js';
import * as LK from '../shared/look.js';
import * as W from '../shared/wardrobe.js';

// ---- the owner's calls ----------------------------------------------------------------------------------------------
test('a sergeant stays navy under the chevrons; patrol wears light blue', () => {
  const L = LK.emptyLook('m'), navy = LK.item('Uniform pants', 'navy').c, sky = LK.item('Uniform pants', 'sky').c;
  assert.notEqual(navy, sky);
  assert.equal(LK.policeLook(L, 2).outfit.top.c, navy, 'a sergeant: navy');
  assert.equal(LK.PIECES[LK.policeLook(L, 2).outfit.top.id].name, "Sergeant's shirt");
  for (const rank of [0, 1]) assert.equal(LK.policeLook(L, rank).outfit.top.c, sky, `rank ${rank}: light blue`);
});

test('pieces only the pass draws are not sold while the pass is off', () => {
  assert.equal(W.PASS_SOLD, false, 'the pass is off for the game: flip this the day it goes live');
  const PP = LK.PIECES.filter((p) => p && p.d.pp);
  assert.ok(PP.length >= 9, `${PP.length} pieces only the pass draws`);
  for (const p of PP) {
    assert.equal(W.sellerOf(p.i), null, `${p.name}: no store sells it`);
    for (const id of Object.keys(W.STORES)) assert.ok(!W.stock(id).includes(p.i), `${p.name}: not in ${id}'s stock`);
  }
});

test('the five draped pieces stay out of the city\'s random looks (and are still sold)', () => {
  const DR = LK.PIECES.filter((p) => p && p.d.dr);
  assert.deepEqual(DR.map((p) => p.name).sort(), ['Cape coat', 'Ghillie suit', 'Hooded cloak', 'Morning dress', 'Sari']);
  for (const p of DR) assert.ok(W.sellerOf(p.i), `${p.name}: a store sells it`);
  for (let k = 1; k < 3000; k++) for (const o of Object.values(LK.randomLook(k * 104729).outfit)) if (o) assert.ok(!LK.PIECES[o.id].d.dr, LK.PIECES[o.id].name);
  for (const [st] of LK.STYLES) for (let k = 1; k < 60; k++) for (const base of ['m', 'f']) for (const o of Object.values(LK.randomLook(k * 7919, base, st).outfit)) if (o) assert.ok(!LK.PIECES[o.id].d.dr, `${st}: ${LK.PIECES[o.id].name}`);
});

// ---- underwear, cut on the art grid ------------------------------------------------------------------------------------
// (line(o): is this art pixel the figure's outline - the polish pass draws it in a tone of what it borders, so it changes with a piece's colour and isn't the piece)
const baked = (A, d = 0, pose = 'idle', f = 0) => { const g = person(A, d, pose, f, { tight: true, info: 1 }), s = downsample2(packGBuf(g)); s.line = (o) => s.pick[o] >= 0 && (g.info.ol[s.pick[o]] === 1 || g.info.grp[s.pick[o]] <= 3); return s; };   // (nor the head and hair: a look's seed moves a lock)
const withPass = (f) => { setPolish(POLISH); try { return f(); } finally { setPolish(null); } };
const wear = (base, name, color, skin = 2, trim) => { const L = LK.emptyLook(base); L.hair.style = 2; L.body.skin = skin; L.outfit.under = LK.item(name, color, trim); return LK.lookArt(LK.validLook(L)); };
// the piece's own art pixels: where the same figure in another colour differs (both colours, the trim too)
const own = (base, name, d, pose = 'idle', f = 0, skin = 2, color = 'hot pink') => withPass(() => {
  // (the two figures laid feet on feet: a look's seed moves a lock of hair, and with it the sprite's box)
  const a = baked(wear(base, name, color, skin, color), d, pose, f), b = baked(wear(base, name, 'teal', skin, 'teal'), d, pose, f), px = [];
  for (let y = 0; y < a.h; y++) for (let x = 0; x < a.w; x++) {
    const i = y * a.w + x, bx = x - a.ax + b.ax, by = y - a.ay + b.ay, j = by * b.w + bx, inb = bx >= 0 && by >= 0 && bx < b.w && by < b.h;
    if (a.p0[i * 4 + 3] && !a.line(i) && inb && b.p0[j * 4 + 3] && (a.p0[i * 4] !== b.p0[j * 4] || a.p0[i * 4 + 1] !== b.p0[j * 4 + 1] || a.p0[i * 4 + 2] !== b.p0[j * 4 + 2])) px.push(i);
  }
  return { G: a, B: b, px };
});
const UNDER = LK.PIECES.filter((p) => p && p.slot === 'under' && p.name !== 'Nothing on');
const CUT = UNDER.filter((p) => !['Union suit', 'Silk slip'].includes(p.name));   // (those two are shapes the renderer has)

test('underwear: 16 pieces and Nothing on; every piece shows on both bases from every side and in the walk', () => {
  assert.equal(UNDER.length, 16);
  for (const p of UNDER) for (const base of p.b) {
    for (const d of [0, 1, 2, 4, 6]) { const n = own(base, p.name, d).px.length; assert.ok(n >= (d === 2 || d === 6 ? 3 : 6), `${p.name} on ${base}, facing ${d}: ${n} art pixels`); }
    for (const f of [1, 3, 4]) { const n = own(base, p.name, 0, 'walk0', f).px.length; assert.ok(n >= 6, `${p.name} on ${base}, walking, frame ${f}: ${n} art pixels`); }
  }
});

test('underwear: briefs read from the front (pass 3 hid them under the waist), a band across, more than one row', () => {
  for (const base of ['m', 'f']) for (const build of [0, 1, 3, 4]) {
    const { G, px } = withPass(() => { const A = wear(base, 'Briefs', 'hot pink'); return { G: baked(A, 0), px: own(base, 'Briefs', 0).px }; });
    const xs = px.map((i) => i % G.w), ys = px.map((i) => Math.floor(i / G.w));
    assert.ok(px.length >= 10, `${base}: ${px.length} art pixels`);
    assert.ok(Math.max(...xs) - Math.min(...xs) >= 4 && Math.max(...ys) - Math.min(...ys) >= 2, `${base} build ${build}: ${Math.max(...xs) - Math.min(...xs) + 1} wide, ${Math.max(...ys) - Math.min(...ys) + 1} tall`);
  }
});

test('underwear: clean tones on every skin - a piece is a few tones of its own, none of them one of the body\'s', () => {
  const key = (G, i) => G.p0[i * 4] << 16 | G.p0[i * 4 + 1] << 8 | G.p0[i * 4 + 2];
  for (const p of CUT) for (const base of p.b) for (let skin = 0; skin < LK.SKIN_TONES.length; skin += 2) for (const d of [0, 4]) {
    // (in white, the hardest colour: the renderer shades white to a warm brown - on a bare body, the skin's tones)
    // (the piece's art pixels: where three colours of it give three colours, the figures laid feet on feet - a look's colours seed
    // its hair and a step of its skin's shading here and there, which two colours alone would count as the piece)
    const G = withPass(() => baked(wear(base, p.name, 'white', skin, 'white'), d)), O = own(base, p.name, d, 'idle', 0, skin), px = O.px.map((i) => { const x = i % O.G.w - O.G.ax + G.ax, y = Math.floor(i / O.G.w) - O.G.ay + G.ay; const bx = x - G.ax + O.B.ax, by = y - G.ay + O.B.ay, j = (by * O.B.w + bx) * 4, k = (y * G.w + x) * 4; return x >= 0 && y >= 0 && x < G.w && y < G.h && (O.B.p0[j] !== G.p0[k] || O.B.p0[j + 1] !== G.p0[k + 1] || O.B.p0[j + 2] !== G.p0[k + 2]) ? y * G.w + x : -1; }).filter((i) => i >= 0 && G.p0[i * 4 + 3] && !G.line(i) && 0.3 * G.p0[i * 4] + 0.59 * G.p0[i * 4 + 1] + 0.11 * G.p0[i * 4 + 2] > 90);   // (not the outline round it, which takes a tint from the cloth)
    const cnt = new Map(); for (const i of px) cnt.set(key(G, i), (cnt.get(key(G, i)) || 0) + 1);
    const set = new Set(px), rest = new Set(), top = [...cnt.values()].sort((x, y) => y - x).slice(0, 5).reduce((x, y) => x + y, 0);
    // (the body: what is the same in all three colours)
    const at = (S, i) => { const x = i % G.w - G.ax + S.ax, y = Math.floor(i / G.w) - G.ay + S.ay; return x >= 0 && y >= 0 && x < S.w && y < S.h && S.p0[(y * S.w + x) * 4 + 3] ? key(S, y * S.w + x) : -1; };
    for (let i = 0; i < G.w * G.h; i++) if (G.p0[i * 4 + 3] && !set.has(i) && at(O.G, i) === key(G, i) && at(O.B, i) === key(G, i)) rest.add(key(G, i));
    // (five tones or fewer make up nearly all of it: the rest are the art pixels it shares with a hand or the outline)
    assert.ok(top >= px.length * 0.7, `${p.name} on ${base}, skin ${skin}, facing ${d}: its five commonest tones are ${top} of ${px.length} art pixels`);
    // (...and none of its tones is one of the body's - bar the art pixels a hand in front of it shares)
    const shared = px.filter((i) => rest.has(key(G, i))).length;
    const warm = px.filter((i) => G.p0[i * 4] - G.p0[i * 4 + 2] > 30).length;   // (white shaded warm: the renderer's ramp, skin-like)
    // (up to 5: the softer lines on bare skin of 11-20 are light enough to be counted, and a look's colours seed a few of them)
    assert.ok(Math.max(shared, warm) <= Math.max(5, px.length * 0.3),   // (0.3: a brief's strap runs to the arms, and shares its last art pixel with them)
    `${p.name} on ${base}, skin ${skin}, facing ${d}: of ${px.length} art pixels ${shared} are in a tone the body has too, ${warm} are warm`);
  }
});

test('underwear: the pass off draws every piece as before; Nothing on is not cut (the mosaic covers it)', () => {
  const A = wear('f', 'Nothing on'), B = wear('f', 'Bra and briefs', 'white');
  const mosaic = withPass(() => baked(A, 0)), dressed = withPass(() => baked(B, 0));
  let diff = 0; for (let i = 0; i < Math.min(mosaic.p0.length, dressed.p0.length); i++) if (mosaic.p0[i] !== dressed.p0[i]) diff++;
  assert.ok(diff > 40, 'a set on is not the mosaic');
  const src = String(POLISH.dress);
  assert.ok(/W\.bk !== 'none'/.test(src) && /!T\.dress/.test(src), 'nothing on, a slip: left to the renderer');
});
