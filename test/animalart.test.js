// The animals at the game's art pixel (client/art2/animals.js renderArt; the owner, 11-21: "some dont look very good
// at all" - no faces from the front, blobs at an angle, legs and tails breaking up). What has to stay true of every
// one of them, whatever is added later: a face from the front (two eyes, a pixel each, apart, on one row), one eye from
// the side, none from behind; a bird has a head at all (its size was once overwritten by its colour); the legs show.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ANIMALS, animalModel, renderUpright } from '../client/art2/animals.js';
import { BIRDS, birdModel } from '../client/art2/birds.js';
import { CRITTERS, critterFrames } from '../client/art2/critters.js';
import { critterArt, critterSprite, setArtPx } from '../client/art2/game/actors.js';

const HEAD = (dir8) => Math.PI / 2 + dir8 * Math.PI / 4;   // (the game's headings: 0 toward the camera, 6 east, 4 away)
const art = (m, dir8) => renderUpright(m, HEAD(dir8), { px: 2 });
const eyes = (G) => G.feats.filter((f) => f[0] === 'eyeL' || f[0] === 'eyeR');
const QUADS = Object.keys(ANIMALS).filter((k) => k !== 'shark');

test('every four-legged animal has a face from the front: two eyes, a pixel each, apart and level', () => {
  for (const kind of QUADS) {
    const e = eyes(art(animalModel(kind), 0));
    assert.equal(e.length, 2, `${kind}: two eyes from the front (${e.length})`);
    assert.ok(Math.abs(e[0][1] - e[1][1]) >= 2, `${kind}: the eyes apart (${e[0][1]}, ${e[1][1]})`);
    assert.ok(Math.abs(e[0][2] - e[1][2]) <= 1, `${kind}: the eyes level`);
  }
});

test('one eye from the side, none from behind, for the animals and the birds', () => {
  const all = [...QUADS.map((k) => [k, animalModel(k)]), ...Object.keys(BIRDS).map((k) => [k, birdModel(k)])];
  for (const [kind, m] of all) {
    for (const d of [6, 2]) assert.equal(eyes(art(m, d)).length, 1, `${kind}: one eye from the side (heading ${d})`);
    assert.equal(eyes(art(m, 4)).length, 0, `${kind}: no eye from behind`);
  }
});

test('a bird has a head: its size is a number, its colour its own field, and the head is drawn over the body', () => {
  for (const [kind, B] of Object.entries(BIRDS)) {
    assert.equal(typeof B.head, 'number', `${kind}: head is its size`);
    assert.match(B.headC, /^#[0-9a-f]{6}$/, `${kind}: headC is its colour`);
    assert.equal(eyes(art(birdModel(kind), 0)).length, 2, `${kind}: two eyes from the front`);
  }
});

test('the legs show: from the side a standing animal stands on at least two separate feet', () => {
  for (const kind of QUADS) {
    if (['beaver', 'seaotter', 'squirrel', 'rabbit'].includes(kind)) continue;   // (low to the ground: their feet under them)
    const G = renderUpright(animalModel(kind), HEAD(6), { px: 2, outline: false });   // (the outline fills a gap between two legs: counted without it)
    let y1 = -1;
    for (let y = G.h - 1; y >= 0 && y1 < 0; y--) for (let x = 0; x < G.w; x++) if (G.col[(y * G.w + x) * 4 + 3]) { y1 = y; break; }
    let runs = 0, on = false;
    for (let x = 0; x < G.w; x++) { const a = !!G.col[(y1 * G.w + x) * 4 + 3]; if (a && !on) runs++; on = a; }
    assert.ok(runs >= 2, `${kind}: fore and hind feet apart on the ground (${runs})`);
  }
});

test('the old one-ray picture is still there for the previews (px 1), and the art-pixel one is steady', () => {
  const m = animalModel('golden'), a = art(m, 7), b = art(m, 7);
  assert.deepEqual([...a.col], [...b.col], 'the same model drawn twice is the same picture');
  assert.ok(renderUpright(m, HEAD(6)).w > a.w, 'px 1: the full-size picture');
});

// The small ones that fly round the player (actors.js critterArt): painted frames halved to the art pixel came out as
// smudges, so the live sprites are their own pictures at that size - as many frames as the painted kind, east and west.

test('the pigeon, the gull, the sparrow and the insects are drawn at the art pixel, a frame for each painted one', () => {
  for (const kind of ['pigeon', 'seagull', 'sparrow', 'monarch', 'blueWing', 'sulphur', 'dragonfly', 'bee', 'frog']) {
    const fr = critterArt(kind, false), lf = critterArt(kind, true);
    assert.equal(fr.length, CRITTERS[kind].frames, `${kind}: its frames`);
    fr.forEach((g, f) => {
      assert.equal(g.ap, 2, `${kind} ${f}: art pixels`);
      let n = 0; for (let i = 3; i < g.col.length; i += 4) if (g.col[i]) n++;
      assert.ok(n >= 3, `${kind} ${f} draws (${n})`);   // (a butterfly with its wings closed is four pixels)
      assert.ok(g.w <= Math.max(...critterFrames(kind).map((q) => q.w)), `${kind} ${f}: no bigger than the painted kind`);
      assert.equal(lf[f].ax, g.w - g.ax, `${kind} ${f}: mirrored round its anchor`);
    });
  }
  // a pigeon on the ground has its orange eye, its pale bill ahead of it and its pink feet under it
  const p = critterArt('pigeon', false)[0], has = (c) => { for (let i = 0; i < p.col.length; i += 4) if (p.col[i + 3] && p.col[i] === c[0] && p.col[i + 1] === c[1] && p.col[i + 2] === c[2]) return true; return false; };
  assert.ok(has([226, 128, 48]) && has([216, 204, 184]) && has([204, 100, 108]), 'the pigeon: eye, bill, feet');
  assert.equal(critterArt('mapleLeaf', false), null, 'the leaves and the motes stay as painted');
});

test('the game hands out the art-pixel critters at art pixel 2, the painted ones at 1; the rabbit, squirrel and heron are the models', () => {
  setArtPx(2);
  for (const kind of ['pigeon', 'seagull', 'rabbit', 'squirrel', 'heron']) for (let f = 0; f < CRITTERS[kind].frames; f++) {
    const g = critterSprite(kind, f, f % 2 === 1);
    assert.equal(g.ap, 2, `${kind} ${f}: at the art pixel`);
    let n = 0; for (let i = 3; i < g.col.length; i += 4) if (g.col[i]) n++;
    assert.ok(n >= 12, `${kind} ${f} draws (${n})`);
  }
  setArtPx(1);
  assert.ok(!critterSprite('pigeon', 0, false).ap, 'px 1: the painted frame');
  setArtPx(2);
});
