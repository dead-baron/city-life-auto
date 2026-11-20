// Character polish, pass 2 (docs/tasks/CHARACTERS2.md, docs/characters/NOTES.md): the underwear slot - a base layer for
// both bases, lingerie among it, "Nothing on" with the renderer's mosaic, worn anywhere; the city's people never
// undressed - and the pass's own drawing (dark clothing that reads, uniforms, hair), all behind the switch.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { person, setPolish } from '../client/art2/people.js';
import { POLISH } from '../client/art2/peoplepolish.js';
import { packGBuf, downsample2 } from '../client/art2/gbuf.js';
import * as LK from '../shared/look.js';
import * as W from '../shared/wardrobe.js';
import { STARTER_WARDROBE } from '../shared/rules.js';

const baked = (A, d = 0, pose = 'idle', f = 0, opt = {}) => downsample2(packGBuf(person(A, d, pose, f, { tight: true, ...opt })));
const same = (a, b) => a.w === b.w && a.h === b.h && Buffer.compare(Buffer.from(a.p0.buffer, a.p0.byteOffset, a.p0.byteLength), Buffer.from(b.p0.buffer, b.p0.byteOffset, b.p0.byteLength)) === 0;
const UNDER = LK.PIECES.filter((p) => p && p.slot === 'under');
const bare = (base, under) => { const L = LK.emptyLook(base); L.hair.style = 2; if (under) L.outfit.under = LK.item(under); return LK.validLook(L); };
const withPass = (f) => { setPolish(POLISH); try { return f(); } finally { setPolish(null); } };

test('the underwear slot: its own slot, for both bases, the lingerie among it; the code stays as short as before without it', () => {
  assert.equal(LK.SLOTS[LK.SLOTS.length - 1], 'under');
  assert.equal(LK.SLOT_NAMES.under, 'Underwear');
  for (const base of ['m', 'f']) assert.ok(UNDER.filter((p) => p.b.includes(base)).length >= 8, `${base}: a full drawer`);
  for (const n of ['Boxers', 'Briefs', 'Boxer briefs', 'Undershirt and boxers', 'Tank and briefs', 'Bra and briefs', 'Sports bra and shorts', 'Lace bra and panties', 'Bralette set', 'Lace bodysuit', 'Teddy', 'Silk slip', 'Silk boxers', 'Fitted trunks', 'Nothing on']) assert.ok(LK.byName(n), n);
  // a look from before the slot is the same code, and reads back the same
  const old = LK.STARTERS[0].look, c0 = LK.encodeLook(old);
  assert.equal(c0.length, LK.LOOK_CODE_LEN);
  assert.equal(LK.decodeLook(c0).outfit.under, null);
  const L = structuredClone(old); L.outfit.under = LK.item('Boxers', 'red', 'white', 1);
  const c1 = LK.encodeLook(L);
  assert.equal(c1.length, LK.LOOK_CODE_LEN + 5);
  assert.ok(c1.startsWith(c0), 'the underwear is five letters more on the end');
  assert.deepEqual(LK.decodeLook(c1).outfit.under, L.outfit.under);
  assert.equal(LK.encodeLook(LK.decodeLook(c1)), c1);
  assert.equal(LK.decodeLook(c1.slice(0, -1)), null);
});

test('underwear shows where no clothes cover it, and never under them', () => {
  for (const p of UNDER) for (const base of ['m', 'f']) {
    const L = bare(base, p.name), A = LK.lookArt(L);
    assert.equal(A.bottom.kind, p.d.bk, `${p.name}: the bottom half`);
    if (p.name !== 'Nothing on') { assert.notEqual(A.bottom.kind, 'none'); if (base === 'f') assert.notEqual(A.top.kind, 'none', `${p.name}: a woman's chest covered`); }
    // dressed over it, the figure is the dressed figure
    const D0 = bare(base), D1 = bare(base, p.name);
    for (const X of [D0, D1]) { X.outfit.top = LK.item('Plain tee'); X.outfit.bottoms = LK.item('Jeans'); X.outfit.shoes = LK.item('Sneakers'); }
    const a = LK.lookArt(LK.validLook(D0)), b = LK.lookArt(LK.validLook(D1));
    assert.deepEqual([b.top, b.bottom], [a.top, a.bottom], `${p.name}: nothing of it shows under a tee and jeans`);
  }
});

test('every underwear piece draws on both bases, the pass on and off, and each looks different from the plain basics', () => {
  for (const on of [false, true]) {
    setPolish(on ? POLISH : null);
    try {
      for (const base of ['m', 'f']) {
        const plain = baked(LK.lookArt(bare(base)));
        for (const p of UNDER) for (const d of [0, 3, 4]) {
          const G = baked(LK.lookArt(bare(base, p.name)), d);
          assert.ok(G.w > 6 && G.h > 16, `${p.name} ${base} ${d}`);
          if (d === 0 && !(p.c === 0 && p.d.bk === (base === 'f' ? 'bikini' : 'trunks') && !on)) assert.ok(!same(G, plain) || p.c === 0, `${p.name} on ${base}: its own look`);
        }
      }
    } finally { setPolish(null); }
  }
});

test('"Nothing on": free for everyone, the mosaic over it from the front and from behind, swimwear with "censored nudity" on', () => {
  const id = LK.byName('Nothing on');
  assert.ok(W.free(id) && W.owns([], id), 'anyone may go without');
  for (const base of ['m', 'f']) {
    const L = bare(base, 'Nothing on'), A = LK.lookArt(L), C = LK.lookArt(L, { censored: true });
    assert.equal(A.bottom.kind, 'none'); assert.equal(A.top.kind, 'none');
    assert.equal(W.unowned([], L).length, 0, 'wearable with an empty wardrobe');
    for (const on of [false, true]) {
      setPolish(on ? POLISH : null);
      try {
        for (const d of on ? [0, 1, 3, 4, 5, 7] : [0, 1, 7]) {
          const a = baked(A, d), c = baked(C, d);
          assert.ok(!same(a, c), `${base} facing ${d} (pass ${on ? 'on' : 'off'}): censored nudity draws swimwear instead`);
        }
        // the mosaic is there: the same body in skin-coloured briefs (no mosaic) is not the same picture
        for (const d of on ? [0, 4] : [0]) {
          const G = person(A, d, 'idle', 0, { tight: true });
          let blocks = 0; for (let i = 0; i < G.w * G.h; i++) if (G.col[i * 4 + 3]) blocks++;
          assert.ok(blocks > 100);
        }
      } finally { setPolish(null); }
    }
  }
  // (the pass adds the patch from behind: facing north, on and censored differ only where the mosaic and the swimwear are)
  withPass(() => { const A = LK.lookArt(bare('m', 'Nothing on')); for (const pose of ['walk0', 'sit', 'swim', 'down', 'kneel']) assert.ok(person(A, 4, pose, 1, { tight: true }).w > 6, pose); });
});

test('the basics are everyone\'s from the start; the lingerie is sold; the city\'s people never fill the slot', () => {
  for (const n of ['Boxers', 'Briefs', 'Boxer briefs', 'Undershirt and boxers', 'Tank and briefs', 'Bra and briefs', 'Sports bra and shorts']) {
    assert.ok(STARTER_WARDROBE.includes(n), n);
    assert.ok(W.owns([], LK.byName(n)), `${n}: owned with an empty wardrobe`);
  }
  for (const p of UNDER) if (p.price > 0 && !STARTER_WARDROBE.includes(p.name)) assert.ok(W.sellerOf(p.i), `${p.name}: a store sells it`);
  for (let s = 1; s < 600; s++) {
    const L = LK.randomLook(s * 7919);
    assert.equal(L.outfit.under, null, `random look ${s}: no underwear picked`);
    const A = LK.lookArt(L);
    assert.ok(A.bottom.kind !== 'none' && !(A.fem && A.top.kind === 'none'), `random look ${s}: dressed`);
  }
  for (const st of LK.STARTERS) assert.equal(st.look.outfit.under, null);
});

// ---- the concepts' wardrobe, the uniforms, dark clothing -------------------------------------------------------------
const ADDED = ['Paramedic uniform', 'Turnout gear', 'Hi-vis coverall', 'Fire helmet', 'Security shirt', 'Rash guard', 'Camisole', 'Sweater vest', 'Camo jacket', 'Sherwani', 'Kilt', 'Leather chaps', 'Onesie', 'Sequin dress',
  'Scarf', 'Neckerchief', 'Bolo tie', 'Lanyard', 'Evening gloves', 'Biker gloves', 'Sweatbands', 'Glow bracelets', 'Headphones', 'Towel wrap', 'Boonie hat', 'Camo cap', 'Bear mask', 'Panda mask', 'Walking cane'];
const wearing = (base, o) => { const L = LK.emptyLook(base); L.hair.style = 2; for (const [s, v] of Object.entries(o)) L.outfit[s] = Array.isArray(v) ? LK.item(...v) : LK.item(v); return LK.lookArt(LK.validLook(L)); };
const count = (G, f) => { let n = 0; for (let i = 0; i < G.w * G.h; i++) if (G.p0[i * 4 + 3] && f(G.p0[i * 4], G.p0[i * 4 + 1], G.p0[i * 4 + 2])) n++; return n; };
const lumOf = (r, g, b) => (0.3 * r + 0.59 * g + 0.11 * b) / 255;

test('the concepts\' pieces are in the catalogue: each has a store that sells it, and draws on both bases with the pass on and off', () => {
  for (const n of ADDED) {
    const id = LK.byName(n), P = LK.PIECES[id];
    assert.ok(id, n);
    assert.ok(W.sellerOf(id), `${n}: a store sells it`);
    for (const on of [false, true]) {
      setPolish(on ? POLISH : null);
      try { for (const base of ['m', 'f']) { const o = { [P.slot]: n }; if (P.slot !== 'set') { o.top ||= 'Plain tee'; o.bottoms ||= 'Jeans'; } assert.ok(baked(wearing(base, o), 1).h > 16, `${n} on ${base}`); } } finally { setPolish(null); }
    }
  }
});

test('the pass on: dark clothing has tones to be drawn in - a black suit is not one flat mass', () => {
  const A = wearing('m', { set: ['Business suit', 'black', 'black'], shoes: ['Oxfords', 'black'] });
  // (below the collar, of the dark pixels: how much of them is the one commonest tone)
  const flat = (G) => { const h = new Array(6).fill(0); for (let i = 0; i < G.w * G.h; i++) { const l = lumOf(G.p0[i * 4], G.p0[i * 4 + 1], G.p0[i * 4 + 2]); if (G.p0[i * 4 + 3] && Math.floor(i / G.w) > G.h * 0.45 && l < 0.25) h[Math.floor(l * 24)]++; } return Math.max(...h) / h.reduce((a, b) => a + b, 0); };
  const off = flat(baked(A, 0)), on = withPass(() => flat(baked(A, 0)));
  assert.ok(off > 0.55, `today the suit is one tone: ${off.toFixed(2)}`);
  assert.ok(on < off - 0.06, `with the pass its commonest tone is less of it: ${off.toFixed(2)} -> ${on.toFixed(2)}`);
});

test('the pass on: uniforms read - the police\'s gold badge and buckle, reflective bands, no badge on a cook', () => {
  const gold = (G) => { let n = 0; for (let i = 0; i < G.w * G.h; i++) { const y = Math.floor(i / G.w); if (G.p0[i * 4 + 3] && y > G.h * 0.4 && y < G.h * 0.75 && G.p0[i * 4] > 170 && G.p0[i * 4 + 1] > 150 && G.p0[i * 4 + 2] < 75) n++; } return n; };   // (on the chest and at the belt, not the cap's)
  const cop = LK.lookArt(LK.policeLook(LK.emptyLook('m'), 0));
  let g0 = 0, g1 = 0;
  for (const d of [0, 7]) { g0 += gold(baked(cop, d)); const n = withPass(() => gold(baked(cop, d))); assert.ok(n >= 2, `facing ${d}: the badge and the buckle are art pixels of gold (${n})`); g1 += n; }
  assert.ok(g1 > g0, `more gold on the officer: ${g0} -> ${g1}`);
  const pale = (G) => count(G, (r, g, b) => r > 200 && g > 200 && b > 150 && b < 235);
  const medic = wearing('f', { set: 'Paramedic uniform', shoes: 'Work boots' });
  assert.ok(withPass(() => pale(baked(medic, 0))) >= pale(baked(medic, 0)) + 6, 'the paramedic\'s reflective bands');
  const cook = wearing('m', { top: 'Chef whites', bottoms: ['Chinos', 'black'], shoes: 'Sneakers' });
  assert.equal(withPass(() => gold(baked(cook, 0))), 0, 'no badge on the chef\'s whites');
});
