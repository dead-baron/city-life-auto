// The people renderer and every option of the look system (client/art2/people.js, shared/look.js): each hairstyle,
// face option, facial hair, age, mark, makeup and catalogue piece draws without an error, at the game's scale and at
// the creator's close scales (opt.res: the thumbnails, the big preview's head and shoulders), within a time budget per
// look measured against tools/perf.mjs's CPU yardstick (so a slow or busy machine doesn't fail it and a real slowdown
// does); no two hairstyles are drawn alike.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { person } from '../client/art2/people.js';
import * as LK from '../shared/look.js';
import { yardstick } from '../tools/perf.mjs';

const clone = (L) => LK.decodeLook(LK.encodeLook(L));
const variant = (L, fn) => { const V = clone(L); fn(V); return LK.validLook(V); };
const HEAD = { tight: true, res: 3, region: [-10, -13, 10, 9] }, FACE = { tight: true, res: 4, region: [-8, -1.5, 8, 9.5] };
const BUST = { tight: true, res: 8, region: [-10.5, -15, 10.5, 12] };
const filled = (G) => { let n = 0; for (let i = 3; i < G.col.length; i += 4) if (G.col[i]) n++; return n; };
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };

// every look to try: each option on a plain base, both bodies
function looks() {
  const out = [];
  for (const b of ['m', 'f']) {
    const base = variant(LK.starterFor(b === 'm' ? 0 : 1), (V) => { V.body.base = b; V.outfit.hat = null; V.outfit.glasses = null; if (b === 'f') V.hair.facial = 0; });
    LK.HAIR_STYLES.forEach((s, i) => { if (s[1].includes(b)) out.push(['hair ' + s[0], variant(base, (V) => { V.hair.style = i; })]); });
    for (const k of Object.keys(LK.FACE_OPTS)) LK.FACE_OPTS[k].forEach((n, i) => out.push([`${k} ${n}`, variant(base, (V) => { V.face[k] = i; })]));
    LK.EYE_COLORS.forEach((c, i) => out.push(['eyes ' + c[1], variant(base, (V) => { V.face.eyeColor = i; })]));
    LK.AGES.forEach((a, i) => out.push(['age ' + a, variant(base, (V) => { V.body.age = i; })]));
    for (const k of ['freckles', 'mole', 'dimples']) out.push([k, variant(base, (V) => { V.face[k] = 1; })]);
    LK.MAKEUP.forEach((m, i) => out.push(['makeup ' + m, variant(base, (V) => { V.extras.makeup = i; })]));
    LK.SCARS.forEach((s, i) => out.push(['scar ' + s, variant(base, (V) => { V.extras.scar = i; })]));
    out.push(['piercings', variant(base, (V) => { V.extras.piercings = 15; V.extras.tattoos = 31; })]);
    if (b === 'm') LK.FACIAL_HAIR.forEach((f, i) => out.push(['facial ' + f[0], variant(base, (V) => { V.hair.facial = i; })]));
    LK.BUILDS.forEach((bd, i) => out.push(['build ' + bd.name, variant(base, (V) => { V.body.build = i; })]));
  }
  // every piece in the catalogue, on the body it's listed for
  for (const P of LK.PIECES) {
    if (!P) continue;
    const b = P.b.includes('f') && !P.b.includes('m') ? 'f' : 'm';
    out.push(['piece ' + P.name, variant(LK.starterFor(b === 'm' ? 0 : 1), (V) => {
      V.outfit[P.slot] = { id: P.i, c: P.c, t: P.t, p: P.d.p || 0 };
      if (P.slot === 'set') { V.outfit.top = null; V.outfit.bottoms = null; }
      if ((P.slot === 'top' || P.slot === 'bottoms') && V.outfit.set) { V.outfit.set = null; V.outfit.top ||= LK.item('Plain tee'); V.outfit.bottoms ||= LK.item('Jeans'); }
    })]);
  }
  return out.filter(([, L]) => L);
}

test('every hairstyle, face option, mark, makeup, facial hair, build and piece draws, at the game\'s scale and close up', () => {
  const all = looks();
  assert.ok(all.length > 300, `${all.length} looks`);
  for (const [name, L] of all) {
    const A = LK.lookArt(L);
    for (const [k, opt] of [['game', {}], ['thumb', { tight: true, res: 2 }], ['head', HEAD], ['face', FACE]]) {
      let G;
      assert.doesNotThrow(() => { G = person(A, 0, 'idle', 0, opt); }, `${name} (${k})`);
      assert.ok(G && G.w > 0 && G.h > 0 && filled(G) > 20, `${name} (${k}): an empty sprite`);
    }
  }
  // the close renders turn and breathe like the game's (every direction, both idle frames, a walk)
  const A = LK.lookArt(LK.STARTERS[3].look);
  for (let d = 0; d < 8; d++) for (const f of [0, 1]) assert.ok(filled(person(A, d, 'idle', f, BUST)) > 2000, `the bust, direction ${d}`);
  assert.ok(filled(person(A, 2, 'walk1', 3, { tight: true, res: 4 })) > 2000);
});

test('the close renders are the game\'s figure, finer: the same shape, R times the size', () => {
  for (let i = 0; i < 12; i++) {
    const A = LK.lookArt(LK.STARTERS[i].look), g = person(A, 1, 'idle', 0, { tight: true }), c = person(A, 1, 'idle', 0, { tight: true, res: 4 });
    // (the game's figure has its 1 px outline and samples whole px: up to 2.5 world px more, 10 px at 4)
    assert.ok(Math.abs(c.h - g.h * 4) <= 10 && Math.abs(c.w - g.w * 4) <= 10, `${LK.STARTERS[i].name}: ${g.w}x${g.h} at 1, ${c.w}x${c.h} at 4`);
    assert.ok(Math.abs(c.ay - g.ay * 4) <= 6, 'the feet stay the anchor');
  }
});

test('no two hairstyles are drawn alike (CB3: each its own shape)', () => {
  for (const b of ['m', 'f']) {
    const base = variant(LK.starterFor(b === 'm' ? 0 : 1), (V) => { V.body.base = b; V.outfit.hat = null; V.outfit.glasses = null; V.hair.facial = 0; });
    const seen = new Map();
    LK.HAIR_STYLES.forEach((s, i) => {
      if (!s[1].includes(b)) return;
      const G = person(LK.lookArt(variant(base, (V) => { V.hair.style = i; })), 1, 'idle', 0, { tight: true, res: 2 });
      const key = `${G.w}x${G.h}:` + Buffer.from(G.col).toString('base64');
      assert.ok(!seen.has(key), `${s[0]} is drawn just like ${seen.get(key)}`);
      seen.set(key, s[0]);
    });
  }
});

test('time per look: the game\'s figure, a creator thumbnail and the preview\'s close-up, in CPU yardsticks', () => {
  const yard = yardstick(), all = looks().filter((_, i) => i % 3 === 0).map(([, L]) => LK.lookArt(L));
  const time = (opt, list) => { for (const A of list.slice(0, 4)) person(A, 0, 'idle', 0, opt); return median(list.map((A) => { const t = performance.now(); person(A, 0, 'idle', 0, opt); return performance.now() - t; })) / yard; };
  const game = time({}, all), thumb = time(HEAD, all), bust = time(BUST, all.slice(0, 24));
  // (on the test machine, about 0.004, 0.012 and 0.1 yardsticks: a street of different people stays cheap, a page of
  // thumbnails draws in a few frames, the preview answers a tap at once)
  assert.ok(game < 0.03, `the game's figure: ${game.toFixed(4)} yardsticks (yardstick ${yard.toFixed(0)} ms)`);
  assert.ok(thumb < 0.08, `a creator thumbnail: ${thumb.toFixed(4)} yardsticks`);
  assert.ok(bust < 0.5, `the preview's close-up: ${bust.toFixed(4)} yardsticks`);
});
