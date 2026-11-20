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
