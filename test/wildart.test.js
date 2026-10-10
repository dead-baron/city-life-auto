// The wild animals' art (client/art2/animals.js, birds.js, drawn by client/art2/game/actors.js) against the AN1-AN8
// concepts: every species draws in every pose the game asks for, its walk and run cycles really move, the jointed
// legs of the wild ones plant their feet on the ground, and a covey of quail has a cock and a plain brown hen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SPECIES } from '../shared/fauna.js';
import { animalModel, ANIMALS } from '../client/art2/animals.js';
import { birdModel } from '../client/art2/birds.js';
import { animalSprite, animalKind, ANIMAL_FRAMES } from '../client/art2/game/actors.js';

const pixels = (g) => { let n = 0; for (let i = 3; i < g.col.length; i += 4) if (g.col[i]) n++; return n; };
const same = (a, b) => a.w === b.w && a.h === b.h && a.col.every((v, i) => v === b.col[i]);

test('every wild species draws walking, running and its head-down pose, and its cycles move', () => {
  for (const kind of Object.keys(SPECIES)) {
    const head = SPECIES[kind].bird ? 'peck' : 'graze';
    for (const pose of ['walk', 'run', head, 'alert', 'dead']) {
      const g = animalSprite(`pet:${kind}`, pose, 6, 0);
      assert.ok(pixels(g) > 12, `${kind} ${pose} draws`);
    }
    for (const pose of ['walk', 'run']) {
      const f = [0, 1, 2, 3].map((i) => animalSprite(`pet:${kind}`, pose, 6, i));
      assert.ok(f.some((g, i) => i && !same(g, f[0])), `${kind}: the ${pose} cycle moves`);
    }
  }
  assert.equal(ANIMAL_FRAMES.walk, 4); assert.equal(ANIMAL_FRAMES.run, 4); assert.equal(ANIMAL_FRAMES.fly, 4);
});

test('the jointed legs of the wild ones keep a foot on the ground through the walk and the gallop', () => {
  const grounded = (m) => { for (let y = 0; y < m.d; y++) for (let x = 0; x < m.w; x++) if (m.get(x, y, 0)) return true; return false; };
  for (const kind of ['deer', 'elk', 'moose', 'boar', 'blackbear', 'coyote', 'rabbit', 'cougar', 'redfox']) {
    assert.ok(ANIMALS[kind].jl, `${kind} has jointed legs`);
    for (const gait of ['walk', 'run']) for (let f = 0; f < 4; f++) {
      const m = animalModel(kind, { phase: f / 4, gait });
      assert.ok(grounded(m), `${kind} ${gait} frame ${f}: a foot on the ground`);
    }
    // the gallop stretches out and gathers up: its frames are longer and shorter than one another
    const span = (m) => { let lo = 1e9, hi = -1; for (let z = 0; z < ANIMALS[kind].h * 0.4; z++) for (let y = 0; y < m.d; y++) for (let x = 0; x < m.w; x++) if (m.get(x, y, z)) { lo = Math.min(lo, x); hi = Math.max(hi, x); } return hi - lo; };
    const spans = [0, 1, 2, 3].map((f) => span(animalModel(kind, { phase: f / 4, gait: 'run' })));
    assert.ok(Math.max(...spans) - Math.min(...spans) >= 2, `${kind}: the gallop stretches and gathers (${spans})`);
  }
  // the pets keep their own straight-legged rig
  assert.ok(!ANIMALS.golden.jl && !ANIMALS.catTabby.jl);
});

test('a covey of quail: the cock with his black face and topknot, the plain brown hen, the chicks', () => {
  assert.equal(animalKind('pet:quail:f'), 'quail:f');
  assert.equal(animalKind('pet:deer:f'), 'deer', 'only the birds have hens drawn apart');
  // the mallard's hen too: mottled brown, not the drake's green head
  const drake = animalSprite('pet:duck', 'swim', 6, 0), duck = animalSprite('pet:duck:f', 'swim', 6, 0);
  const green = (g) => { let n = 0; for (let i = 0; i < g.col.length; i += 4) if (g.col[i + 3] && g.col[i + 1] > g.col[i] + 30 && g.col[i + 1] > g.col[i + 2] + 10) n++; return n; };
  assert.ok(green(drake) >= 3 && green(duck) === 0, `the drake's green head, the hen's brown one (${green(drake)}, ${green(duck)})`);
  const cock = animalSprite('pet:quail', 'idle', 6, 0), hen = animalSprite('pet:quail:f', 'idle', 6, 0), chick = animalSprite('pet:quail:y', 'idle', 6, 0);
  assert.ok(!same(cock, hen), 'the hen is drawn apart from the cock');
  assert.ok(pixels(chick) < pixels(hen) * 0.6, 'the chicks are small');
  // the cock's face is black and his flanks blue-grey; the hen is brown all over
  const tone = (g) => { let b = 0, r = 0; for (let i = 0; i < g.col.length; i += 4) if (g.col[i + 3]) { b += g.col[i + 2]; r += g.col[i]; } return b / r; };
  assert.ok(tone(cock) > tone(hen) + 0.08, `the cock bluer than the hen (${tone(cock).toFixed(2)} vs ${tone(hen).toFixed(2)})`);
  // the flush: four wingbeat frames, the wings raised and lowered
  const fl = [0, 1, 2, 3].map((f) => birdModel('quail', { pose: 'fly', phase: f / 4 }));
  const top = (m) => { for (let z = m.h - 1; z >= 0; z--) for (let y = 0; y < m.d; y++) for (let x = 0; x < m.w; x++) if (m.get(x, y, z)) return z; return -1; };
  assert.ok(top(fl[0]) - top(fl[2]) >= 3, 'the flush: the wings up over the back, then down');
});
