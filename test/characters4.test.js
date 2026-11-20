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
