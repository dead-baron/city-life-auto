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
    assert.ok(n >= 1 && n <= 6, `${base}: the mouth is a few pixels, and only that (${n})`);   // (11-20: the chunky build's bigger face has room for a woman's whole mouth - 3 over 2)
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
  for (const bad of [c1.slice(0, -1), c1 + '00', c1 + '00000']) assert.equal(LK.decodeLook(bad), null);
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

test('body options (body freckles, vitiligo, a prosthetic arm or leg): kept in the look, one letter more on its code, drawn by the pass', async () => {
  const W = await import('../shared/wardrobe.js'), { readFileSync } = await import('node:fs');
  assert.deepEqual(LK.LIMBS, ['None', 'Left arm', 'Right arm', 'Left leg', 'Right leg']);
  const base = LK.STARTERS[0].look, c0 = LK.encodeLook(base);
  assert.deepEqual([LK.decodeLook(c0).body.marks, LK.decodeLook(c0).body.limb], [0, 0], 'an old code: none');
  for (const [marks, limb] of [[1, 0], [2, 0], [3, 4], [0, 1], [0, 2], [0, 3]]) {
    const L = structuredClone(base); L.body.marks = marks; L.body.limb = limb;
    const c = LK.encodeLook(L);
    assert.equal(c.length, LK.LOOK_CODE_MAX); assert.ok(c.startsWith(c0));
    const back = LK.decodeLook(c);
    assert.deepEqual([back.body.marks, back.body.limb], [marks, limb]);
    assert.equal(LK.encodeLook(back), c);
    assert.ok(W.changes(base, back).body, 'a change of body: the mirror at home');
  }
  assert.equal(LK.validLook({ ...base, body: { ...base.body, marks: 9, limb: 9 } }).body.limb, 4);
  for (let k = 1; k < 300; k++) { const b = LK.randomLook(k * 7919).body; assert.equal(b.marks | b.limb, 0, 'the city\'s people: none'); }
  // drawn: with the pass on each option changes the bare figure, a prosthetic only on its own side; off, nothing
  const bare = (b, body) => { const L = LK.emptyLook(b); L.hair.style = 2; Object.assign(L.body, body); L.outfit.bottoms = LK.item('Shorts'); L.outfit.top = LK.item('Tank top'); return LK.lookArt(LK.validLook(L)); };
  const half = (a, b) => { let l = 0, r = 0; for (let y = 0; y < a.h; y++) for (let x = 0; x < a.w; x++) { const o = (y * a.w + x) * 4; if (a.p0[o] !== b.p0[o] || a.p0[o + 1] !== b.p0[o + 1]) { if (x < a.w / 2) l++; else r++; } } return [l, r]; };
  for (const b of ['m', 'f']) {
    for (const body of [{ marks: 1 }, { marks: 2 }, { limb: 1 }, { limb: 2 }, { limb: 3 }, { limb: 4 }]) {
      const A = bare(b, body), N = strip(A, 'bmarks', 'limb');
      const [l, r] = withPass(() => half(baked(A, 0), baked(N, 0)));
      assert.ok(l + r >= 3, `${b} ${JSON.stringify(body)}: ${l + r} art pixels`);
      // (facing the camera, the figure's left is on the picture's right)
      if (body.limb) assert.ok(body.limb & 1 ? r > l * 3 : l > r * 3, `${b} ${LK.LIMBS[body.limb]}: on its own side (${l} | ${r})`);
      assert.equal(diff(baked(A, 0), baked(N, 0)), 0, 'the pass off: not drawn');
      withPass(() => { for (const pose of ['walk0', 'run', 'sit', 'swim', 'down', 'punch']) for (const d of [0, 3, 6]) assert.ok(person(A, d, pose, 1, { tight: true }).w > 6, pose); });
    }
    // under a long sleeve and trousers a prosthetic doesn't show
    const cov = (limb) => { const L = LK.emptyLook(b); L.body.limb = limb; L.outfit.top = LK.item('Long-sleeve tee'); L.outfit.bottoms = LK.item('Jeans'); L.outfit.shoes = LK.item('Sneakers'); L.outfit.jewel = LK.item('Work gloves'); return LK.lookArt(LK.validLook(L)); };
    for (const limb of [1, 4]) { const A = cov(limb); assert.equal(withPass(() => diff(baked(A, 0), baked(strip(A, 'limb'), 0))), 0, 'covered'); }
  }
  assert.ok(/passOn\(\) \? row\('Skin marks'/.test(readFileSync(new URL('../client/creator.js', import.meta.url), 'utf8')), 'the creator offers them while the pass is on');
});

test('drapes (a hooded cloak, a cape-coat, a sari, a ghillie suit, morning dress): wearable pieces on shapes the renderer has, each made its own by the pass', async () => {
  const W = await import('../shared/wardrobe.js');
  for (const [n, slot, dr] of [['Hooded cloak', 'jacket', 'cloak'], ['Cape coat', 'jacket', 'cape'], ['Sari', 'set', 'sari'], ['Ghillie suit', 'set', 'ghillie'], ['Morning dress', 'set', 'tails']]) {
    const P = LK.PIECES[LK.byName(n)];
    assert.ok(P && P.slot === slot && P.d.dr === dr && W.sellerOf(P.i), `${n}: in the catalogue, sold`);
    const base = P.b[0], A = plain(base, (L) => { if (slot === 'set') L.outfit.top = L.outfit.bottoms = null; L.outfit[slot] = LK.item(n); });
    assert.equal(A.drape, dr);
    if (dr === 'cloak' || dr === 'ghillie') assert.equal(A.hat.kind, 'hood', `${n}: the hood up`);
    const B = strip(A, 'drape');
    for (const d of [1, 5]) assert.ok(withPass(() => diff(baked(A, d), baked(B, d))) >= 4, `${n} facing ${d}: the pass draws it its own`);
    assert.equal(diff(baked(A, 1), baked(B, 1)), 0, `${n}: off, the shape it is built on`);
    withPass(() => { for (const pose of ['walk0', 'run', 'sit', 'kneel', 'down', 'drive']) for (const d of [0, 2, 4]) assert.ok(person(A, d, pose, 1, { tight: true }).w > 6, pose); });
  }
  // a hat of your own stays on over a cloak
  const H = plain('m', (L) => { L.outfit.jacket = LK.item('Hooded cloak'); L.outfit.hat = LK.item('Beanie'); });
  assert.notEqual(H.hat.kind, 'hood');
  assert.equal(plain('m').drape, undefined);
});

test('phone poses: texting, the texting walk and a call draw with the pass on; a selfie is its own silhouette - an arm out and up - where it was the filming hold', async () => {
  const { readFileSync } = await import('node:fs'), src = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8');
  const A = plain('f'), G = (d, held, pose = 'idle', f = 0, app = A) => baked(app, d, pose, f, held ? { held } : {});
  // off: a selfie is the filming hold, pixel for pixel (today's people)
  for (const d of [0, 2, 5]) assert.equal(diff(G(d, 'phoneSelfie'), G(d, 'phoneUp')), 0, `off, facing ${d}`);
  withPass(() => {
    for (const d of [0, 1, 2, 3, 4, 5, 6, 7]) {
      const s = G(d, 'phoneSelfie'), f = G(d, 'phoneUp'), t = G(d, 'phone'), c = G(d, null, 'idle', 0, { ...A, carry: 'call' });
      assert.ok(diff(s, f) >= 6 && diff(s, t) >= 6 && diff(s, c) >= 6, `facing ${d}: not the filming hold, texting or a call`);
      for (const g of [s, t, c, G(d, 'phone', 'walk0', 2), G(d, null, 'walk0', 3, { ...A, carry: 'call' }), G(d, null, 'walk0', 1, { ...A, carry: 'phone' })]) assert.ok(g.w > 6 && g.h > 20);
    }
    // the arm is out: facing the camera the selfie's figure is wider than the texting one
    assert.ok(G(0, 'phoneSelfie').w >= G(0, 'phone').w + 2, 'an arm out of the silhouette');
  });
  assert.ok(/p\.d\.ph === 3 \? 'phoneSelfie'/.test(src('client/art2/game/host.js')), 'the renderer draws ph 3 as a selfie');
  assert.ok(/ped\.filming = 3/.test(src('server/systems/personas.js')), 'the selfie persona says so');
});

test('nobody in the city wears a piece only the pass draws (gear, props)', () => {
  for (let k = 1; k < 1500; k++) for (const o of Object.values(LK.randomLook(k * 104729).outfit)) if (o) assert.ok(!LK.PIECES[o.id].d.pp, LK.PIECES[o.id].name);
});

test('props carried (a camera, a bouquet, a parasol): bags on things the renderer puts in the hand, redrawn by the pass', async () => {
  const W = await import('../shared/wardrobe.js');
  for (const [n, carry] of [['Camera', 'purse'], ['Bouquet', 'coffee'], ['Parasol', 'cane']]) {
    const P = LK.PIECES[LK.byName(n)];
    assert.ok(P && P.slot === 'bag' && P.d.carry === carry && P.d.prop && P.d.pp, n);
    for (const base of ['m', 'f']) {
      const A = plain(base, (L) => { L.outfit.bag = LK.item(n); }), B = strip(A, 'prop');
      assert.equal(A.carry, carry); assert.equal(A.prop[0], P.d.prop);
      const seen = [0, 1, 2, 6, 7].map((d) => withPass(() => diff(baked(A, d), baked(B, d))));
      assert.ok(Math.max(...seen) >= 2 && seen.filter((v) => v > 0).length >= 3, `${n} on ${base}: ${seen}`);
      assert.equal(diff(baked(A, 1), baked(B, 1)), 0, 'off: the thing it is built on');
      withPass(() => { for (const pose of ['walk0', 'run', 'sit', 'down']) assert.ok(person(A, 1, pose, 1, { tight: true }).w > 6, pose); });
    }
  }
});

test('over the taller head: the name tag rises with the head, as the bubbles and the marks do; every pose keeps its parts together with the pass on', async () => {
  const { readFileSync } = await import('node:fs'), main = readFileSync(new URL('../client/main.js', import.meta.url), 'utf8');
  assert.ok(/const SKULL_HEAD = window\.CLA_POLISH \? 50 : 46;/.test(main) && /const y = py - 26 \/ z - \(SKULL_HEAD - 46\);/.test(main), 'the name: up by the pass\'s two art pixels, and where it was with the pass off');
  // the head's top really is two art pixels (4 world px) higher: a standing figure, the pass off and on
  const A = plain('m'), off = baked(A, 0), on = withPass(() => baked(A, 0));
  assert.ok(on.ay - off.ay >= 1 && on.ay - off.ay <= 3, `feet to the top of the sprite: ${off.ay} -> ${on.ay} art px`);
  // animation sheets 4, 6 and 7's poses (and the rest): no frame breaks into more pieces with the pass on than off
  const { POSES } = await import('../client/art2/people.js');
  const pieces = (s) => { const seen = new Uint8Array(s.w * s.h); let n = 0; for (let i = 0; i < s.w * s.h; i++) { if (seen[i] || s.p0[i * 4 + 3] < 128) continue; let c = 0; const st = [i]; seen[i] = 1; while (st.length) { const j = st.pop(); c++; const x = j % s.w, y = (j / s.w) | 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= s.w || yy >= s.h) continue; const k = yy * s.w + xx; if (!seen[k] && s.p0[k * 4 + 3] >= 128) { seen[k] = 1; st.push(k); } } } if (c > 1) n++; } return n; };   // (a lone art pixel - the water's foam - isn't a part)
  for (const p of ['tuck', 'saddle', 'hood', 'hunch', 'strut', 'skate', 'blade', 'dance', 'push', 'lean', 'pushup', 'surfair', 'cartkick', 'cartride', 'cartsit', 'statue', 'statuebow', 'cue', 'escortR', 'escortL', 'sitx', 'bars', 'bang', 'thump']) {
    assert.ok(POSES[p], p);
    for (let f = 0; f < POSES[p]; f++) for (const d of [0, 1, 2, 4, 6]) assert.ok(withPass(() => pieces(baked(A, d, p, f))) <= pieces(baked(A, d, p, f)), `${p} frame ${f} facing ${d}`);
  }
});
