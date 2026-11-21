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
import { packPlanes } from '../client/art2/game/chunkpack.js';

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

// The small ones that fly round the player (actors.js critterArt). The owner (11-21 09:27) prefers their painted look to
// a redraw: they are the painted frames (critters.js), halved to the art pixel with the creature shown rather than the
// ink line round it, each keeping its size and shape. Only the sparrow is its own picture at the art pixel.
test('the painted critters keep their shapes at the art pixel: same size as the game halved them, less of the ink line', () => {
  const lum = (g, i) => g.col[i * 4] * 0.3 + g.col[i * 4 + 1] * 0.5 + g.col[i * 4 + 2] * 0.2;
  for (const kind of ['pigeon', 'seagull', 'bee', 'frog', 'squirrel', 'heron']) {
    const fr = critterArt(kind, false), lf = critterArt(kind, true), painted = critterFrames(kind);
    assert.equal(fr.length, CRITTERS[kind].frames, `${kind}: its frames`);
    fr.forEach((g, f) => {
      assert.equal(g.ap, 2, `${kind} ${f}: art pixels`);
      const halved = packPlanes(painted[f], 2).o;
      assert.equal(g.w, halved.w); assert.equal(g.h, halved.h); assert.equal(g.ax, halved.ax); assert.equal(g.ay, halved.ay);
      let n = 0, dark = 0, n0 = 0, dark0 = 0;
      for (let i = 0; i < g.w * g.h; i++) {
        if (g.col[i * 4 + 3]) { n++; if (lum(g, i) < 50) dark++; }
        if (halved.p0[i * 4 + 3]) { n0++; if (halved.p0[i * 4] * 0.3 + halved.p0[i * 4 + 1] * 0.5 + halved.p0[i * 4 + 2] * 0.2 < 50) dark0++; }
      }
      assert.ok(n >= 3 && Math.abs(n - n0) <= Math.max(3, n0 * 0.2), `${kind} ${f}: the same shape (${n} against ${n0} pixels)`);
      assert.ok(dark <= dark0 + 2, `${kind} ${f}: no more ink than before (${dark} against ${dark0})`);   // (a dark creature - the squirrel - has dark pixels of its own)
      assert.equal(lf[f].ax, lf[f].w - g.ax, `${kind} ${f}: mirrored round its anchor`);
    });
  }
  // the dragonfly (its wings' dark veins are the picture) is left exactly as the game halves it; the leaves and the
  // motes too
  for (const kind of ['dragonfly', 'mapleLeaf', 'motes']) assert.equal(critterArt(kind, false), null, `${kind}: as painted`);
  // the rabbit keeps the pink inside its ears (the owner, 11-21 09:55)
  const pink = (g) => { for (let i = 0; i < g.w * g.h; i++) { const r = g.col[i * 4], gg = g.col[i * 4 + 1], b = g.col[i * 4 + 2]; if (g.col[i * 4 + 3] && r > 170 && r - gg > 34 && r - b > 20) return true; } return false; };
  assert.ok(critterArt('rabbit', false).every(pink), 'the rabbit: pink in its ears, every frame');
  assert.equal(critterArt('rabbit', false).length, CRITTERS.rabbit.frames);
});

test('the sparrow is its own picture at the art pixel; the game hands the painted frames out at art pixel 1', () => {
  const sp = critterArt('sparrow', false);
  assert.equal(sp.length, CRITTERS.sparrow.frames);
  for (const g of sp) { assert.equal(g.ap, 2); let n = 0; for (let i = 3; i < g.col.length; i += 4) if (g.col[i]) n++; assert.ok(n >= 12, `the sparrow draws (${n})`); }
  setArtPx(2);
  for (const kind of ['pigeon', 'seagull', 'sparrow', 'rabbit']) assert.equal(critterSprite(kind, 0, false).ap, 2, `${kind}: at the art pixel`);
  assert.ok(!critterSprite('dragonfly', 0, false).ap, 'the dragonfly: the painted frame, for the game to halve');
  // the butterflies too (the owner, 11-21 09:55: "monarch could look better"): wings either side of the body, the same
  // either side, an edge and a pale spot
  for (const kind of ['monarch', 'blueWing', 'sulphur']) {
    const fr = critterArt(kind, false);
    assert.equal(fr.length, CRITTERS[kind].frames, kind);
    for (const g of fr) { assert.equal(g.ap, 2); for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) assert.equal(g.col[(y * g.w + x) * 4 + 3], g.col[(y * g.w + g.w - 1 - x) * 4 + 3], `${kind}: the same either side`); }
    const open = fr[0], closed = fr[2], count = (g) => { let n = 0; for (let i = 3; i < g.col.length; i += 4) if (g.col[i]) n++; return n; };
    assert.ok(count(open) > count(closed) * 2, `${kind}: the wings open and close`);
  }
  setArtPx(1);
  assert.ok(!critterSprite('pigeon', 0, false).ap, 'px 1: the painted frame');
  setArtPx(2);
});
