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

test('the socks slot: its own slot and tab, eight pieces, a pair in the starter wardrobe; the look\'s code grows only when they are worn', async () => {
  const W = await import('../shared/wardrobe.js'), { STARTER_WARDROBE } = await import('../shared/rules.js');
  assert.equal(LK.SLOTS[LK.SLOTS.length - 1], 'socks'); assert.equal(LK.SLOT_NAMES.socks, 'Socks');
  const SOCKS = LK.PIECES.filter((p) => p && p.slot === 'socks');
  assert.deepEqual(SOCKS.map((p) => p.name), ['Ankle socks', 'Crew socks', 'Striped crew socks', 'Tube socks', 'Knee socks', 'Thigh-high socks', 'Tights', 'Leg warmers']);
  assert.ok(STARTER_WARDROBE.includes('Crew socks') && W.owns([], LK.byName('Crew socks')));
  for (const p of SOCKS) if (p.name !== 'Crew socks') assert.ok(W.sellerOf(p.i), `${p.name}: a store sells it`);
  // the code: 66 letters without, 71 with underwear only, 76 with socks (the underwear's five letters zeros if none)
  const old = LK.STARTERS[0].look, c0 = LK.encodeLook(old);
  assert.equal(c0.length, LK.LOOK_CODE_LEN); assert.equal(LK.decodeLook(c0).outfit.socks, null);
  const L = structuredClone(old); L.outfit.socks = LK.item('Tube socks', 'white', 'royal blue');
  const c1 = LK.encodeLook(L);
  assert.equal(c1.length, LK.LOOK_CODE_LEN + 10); assert.ok(c1.startsWith(c0 + '00000'));
  assert.deepEqual(LK.decodeLook(c1).outfit.socks, L.outfit.socks); assert.equal(LK.decodeLook(c1).outfit.under, null);
  L.outfit.under = LK.item('Boxers');
  assert.deepEqual(LK.decodeLook(LK.encodeLook(L)).outfit, LK.validLook(L).outfit);
  L.outfit.socks = null;
  assert.equal(LK.encodeLook(L).length, LK.LOOK_CODE_LEN + 5, 'underwear alone: 71, as before');
  for (const bad of [c1.slice(0, -1), c1 + '0', c1 + '00000']) assert.equal(LK.decodeLook(bad), null);
  // the city's people don't fill the slot
  for (let k = 1; k < 500; k++) assert.equal(LK.randomLook(k * 7919).outfit.socks, null);
});

test('socks show on a bare leg - the pass on or off - and never through trousers; leg warmers go over leggings with the pass on', () => {
  // (without: the same figure - its look's own seed - with the socks taken off)
  const wearAs = (base, as, bottoms) => { const A = wear(base, as, bottoms); delete A.socks; return A; };
  const wear = (base, socks, bottoms) => { const A = plain(base, (L) => { L.outfit.bottoms = LK.item(bottoms); L.outfit.socks = LK.item(socks || 'Crew socks'); }); if (!socks) delete A.socks; return A; };
  const names = LK.PIECES.filter((q) => q && q.slot === 'socks').map((q) => q.name);
  for (const p of LK.PIECES.filter((q) => q && q.slot === 'socks')) for (const base of ['m', 'f']) {
    for (const on of [false, true]) {
      const f = () => [baked(wear(base, p.name, 'Shorts'), 1), baked(wearAs(base, p.name, 'Shorts'), 1), baked(wear(base, p.name, 'Jeans'), 1), baked(wearAs(base, p.name, 'Jeans'), 1)];
      const [a, b, c, d] = on ? withPass(f) : f();
      assert.ok(diff(a, b) >= (p.d.h >= 0.9 ? 1 : 2), `${p.name} on ${base}, pass ${on ? 'on' : 'off'}: on a bare leg (${diff(a, b)})`);
      assert.equal(diff(c, d), p.d.warm && on ? diff(c, d) : 0, `${p.name}: nothing through jeans`);
      if (p.d.warm && on) assert.ok(diff(c, d) >= 2, 'leg warmers over trousers');
    }
    // every pose draws with them on
    withPass(() => { for (const pose of ['walk0', 'run', 'sit', 'kneel', 'swim', 'down']) assert.ok(person(wear(base, p.name, 'Shorts'), 2, pose, 1, { tight: true }).w > 6, pose); });
  }
  // stripes in the trim colour with the pass on
  const red = (G) => { let n = 0; for (let o = 0; o < G.w * G.h * 4; o += 4) if (G.p0[o + 3] && G.p0[o] > 110 && G.p0[o + 1] < 70 && G.p0[o + 2] < 80 && o / 4 > G.w * G.h * 0.7) n++; return n; };   // (red, at the shins)
  const tube = wear('m', 'Tube socks', 'Shorts');
  assert.ok(withPass(() => red(baked(tube, 0))) > red(baked(tube, 0)), 'the tube socks\' red stripes');
});

// (a piece's own pixels: the same figure - its look's seed - with the piece taken off the renderer's app)
const strip = (A, ...keys) => { const B = { ...A }; for (const k of keys) delete B[k]; return B; };
test('small gear (knee and elbow pads, a wallet chain, a tool belt, a harness): accessories the pass draws, in every pose; offered only while it is on', async () => {
  const { readFileSync } = await import('node:fs');
  const GEAR = ['Knee pads', 'Elbow pads', 'Skate pads', 'Wallet chain', 'Tool belt', 'Climbing harness'];
  for (const n of GEAR) {
    const P = LK.PIECES[LK.byName(n)];
    assert.ok(P && P.slot === 'jewel' && P.d.pp, n);
    for (const base of ['m', 'f']) {
      const A = plain(base, (L) => { L.outfit.bottoms = LK.item('Jeans', 'sky'); L.outfit.jewel = LK.item(n); }), B = strip(A, 'jewel');
      const seen = [0, 1, 2, 4, 6].map((d) => withPass(() => diff(baked(A, d), baked(B, d))));
      assert.ok(seen.filter((v) => v >= 1).length >= 3 && Math.max(...seen) >= 2, `${n} on ${base}: ${seen} art pixels by facing`);
      assert.ok(Math.max(...seen) <= 40, `${n}: small gear stays small (${seen})`);
      assert.equal(diff(baked(A, 1), baked(B, 1)), 0, `${n}: the pass off draws none of it`);
      withPass(() => { for (const pose of ['walk0', 'run', 'sit', 'kneel', 'punch', 'down']) assert.ok(person(A, 1, pose, 1, { tight: true }).w > 6, pose); });
    }
  }
  assert.ok(/!p\.d\.pp \|\| passOn\(\)/.test(readFileSync(new URL('../client/creator.js', import.meta.url), 'utf8')), 'the creator hides the pass\'s pieces while it is off');
});
