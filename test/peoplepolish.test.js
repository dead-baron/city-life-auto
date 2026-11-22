// The character polish pass (docs/tasks/CHARACTERS.md, docs/characters/NOTES.md): staged behind a switch, off by default.
// Off, the people are today's, pixel for pixel; on, they keep every promise the sheets make - a neck, about 3 heads and
// up, eyes that are dark on every skin - and everything the wardrobe, the hair and the poses could draw before still draws.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { person, setPolish, POSES } from '../client/art2/people.js';
import { POLISH } from '../client/art2/peoplepolish.js';
import { packGBuf, downsample2 } from '../client/art2/gbuf.js';
import * as PD from '../client/art2/game/peds.js';
import * as LK from '../shared/look.js';
import { closure } from '../tools/perf.mjs';

const ROOT = new URL('..', import.meta.url);
const baked = (A, d = 0, pose = 'idle', f = 0, opt = {}) => downsample2(packGBuf(person(A, d, pose, f, { tight: true, ...opt })));
const look = (base, body = {}, face = {}) => { const L = LK.emptyLook(base); Object.assign(L.body, body); Object.assign(L.face, face); L.hair.style = LK.HAIR_STYLES.findIndex((h) => h[2] === 'bald'); L.outfit.top = LK.item('Plain tee'); L.outfit.bottoms = LK.item('Jeans'); return LK.lookArt(LK.validLook(L)); };
// a bald figure in a white tee, facing the camera: how many art pixels tall, and how many of them are the head and neck
// (down its middle to the tee's first row)
const lum = (p, o) => (0.3 * p[o] + 0.59 * p[o + 1] + 0.11 * p[o + 2]) / 255;
export function headsOf(D) {
  let top = -1, bot = -1, tee = -1; const cx = Math.round(D.ax);
  for (let y = 0; y < D.h; y++) {
    let any = false; for (let x = 0; x < D.w; x++) if (D.p0[(y * D.w + x) * 4 + 3]) any = true;
    if (!any) continue;
    if (top < 0) top = y; bot = y;
    const o = (y * D.w + cx - 1) * 4;
    if (tee < 0 && y > top + 3 && (lum(D.p0, o) > 0.8 || lum(D.p0, o + 4) > 0.8)) tee = y;
  }
  return { tall: bot - top + 1, head: tee - top, heads: (bot - top + 1) / (tee - top) };
}

test('off by default, and off is today\'s people: switching the pass on and off again changes nothing', () => {
  setPolish(null);
  const A = LK.lookArt(LK.STARTERS[0].look), a = person(A, 1, 'walk0', 2, { tight: true });
  setPolish(POLISH);
  const b = person(A, 1, 'walk0', 2, { tight: true });
  setPolish(null);
  const c = person(A, 1, 'walk0', 2, { tight: true });
  assert.ok(a.w !== b.w || a.h !== b.h || Buffer.compare(Buffer.from(a.col.buffer), Buffer.from(b.col.buffer)) !== 0, 'on: a different figure');
  assert.equal(a.w, c.w); assert.equal(a.h, c.h);
  assert.equal(Buffer.compare(Buffer.from(a.col.buffer), Buffer.from(c.col.buffer)), 0, 'off again: the same pixels');
});

test('the game\'s switch: a polished sprite has its own key, and nothing is polished until the pass is loaded', async () => {
  const app = { lk: LK.encodeLook(LK.STARTERS[0].look) }, A = PD.adaptApp(app);   // (not the Beachgoer: pass 5 took the spike off her ponytail, which stood over the crown as high as the pass's longer legs)
  PD.usePolish(true);   // (not loaded yet: stays off)
  const k0 = PD.pedKey(A, 'idle', 0, 0, 0), g0 = PD.pedSprite(A, 'idle', 0, 0, 0);
  assert.ok(k0[0] !== '~');
  await PD.loadPolish(new URL('client/art2/peoplepolish.js', ROOT).href);
  PD.usePolish(true);
  const k1 = PD.pedKey(A, 'idle', 0, 0, 0), g1 = PD.pedSprite(A, 'idle', 0, 0, 0);
  PD.usePolish(false);
  assert.equal(k1, '~' + k0);
  assert.ok(g1.h > g0.h, 'the polished figure stands taller');
  assert.equal(PD.pedKey(A, 'idle', 0, 0, 0), k0);
  assert.equal(PD.pedSprite(A, 'idle', 0, 0, 0).h, g0.h, 'off again');
});

test('the pass is loaded only when switched on: it is in nobody\'s code - the page\'s, the renderer\'s, the chunk baker\'s', () => {
  const root = ROOT.pathname.replace(/^\/([A-Za-z]:)/, '$1'), has = (files) => files.some((f) => /peoplepolish/.test(f));
  assert.ok(!has(closure(['client/boot.js', 'client/main.js'], { root })), 'the page');
  assert.ok(!has(closure(['client/art2/game/host.js', 'client/art2/game/engine.js', 'client/art2/game/peds.js'], { root })), 'the renderer');
  assert.ok(!has(closure(['client/art2/game/worker.js'], { dynamic: true, root })), 'a bake worker (handed its address: pool.js)');
  // the world's baked art doesn't change with it: the chunk baker never reads the people
  const baker = closure(['client/art2/game/chunkbake.js', 'client/art2/game/chunkpack.js', 'client/art2/game/chunkstore.js'], { root });
  assert.ok(!baker.some((f) => /art2[\\/]people/.test(f)), 'the chunk baker draws no people');
  assert.ok(/'cla\.polish'\) === '1'/.test(readFileSync(new URL('client/art2/game/host.js', ROOT), 'utf8')), 'the renderer reads the switch');
});

// (the owner, 2026-11-20: "stay chunky" and closer to the concepts - which, shrunk to the game's size, are a big head on a
// wide body: about two and a half heads. Pass 1 asked for a longer body, 2.55 heads and up; that moved away from them.)
test('on: the concepts\' chunky build for both bases and every build - about two and a half heads, the head with room for a face', () => {
  for (const base of ['m', 'f']) for (let b = 0; b < LK.BUILDS.length; b++) {
    const A = look(base, { build: b, skin: 2 });
    setPolish(null); const before = headsOf(baked(A));
    setPolish({ ...POLISH, mouthOn: true }); const after = headsOf(baked(A)); setPolish(null);   // (measured as pass 1 was, the mouth drawn: without it the middle column's first white row is a row lower on some builds - the same body)
    const who = `${base} ${LK.BUILDS[b].name}: ${before.heads.toFixed(2)} -> ${after.heads.toFixed(2)} (${before.tall} -> ${after.tall} art px tall, the head and neck ${before.head} -> ${after.head})`;
    assert.ok(after.heads >= 2.25 && after.heads <= 2.8, who);
    assert.ok(after.head >= 9, `the head keeps room for a face, over a neck: ${who}`);
    assert.ok(after.tall <= before.tall + 3 && after.tall >= before.tall - 1, `today's height, give or take the outline: ${who}`);
  }
});

test('on: the eyes are eyes on every skin - two pixels well darker than the face on both sides of them', () => {
  setPolish(POLISH);
  try {
    for (let skin = 0; skin < LK.SKIN_TONES.length; skin++) for (const base of ['m', 'f']) {
      const D = baked(look(base, { skin }), 0, 'idle', 0, { region: 'head' });
      let eyes = 0;
      for (let y = 2; y < 9; y++) for (let x = 1; x < D.w - 1; x++) {
        const o = (y * D.w + x) * 4, l = lum(D.p0, o);
        // (11-20, the eye's colour with a white beside it: an eye pixel stands off both its neighbours - darker than both, or
        // well apart from both in colour, as a light eye on dark skin is)
        const far = (q) => Math.hypot(D.p0[o] - D.p0[q], D.p0[o + 1] - D.p0[q + 1], D.p0[o + 2] - D.p0[q + 2]) >= 70;
        if (D.p0[o + 3] && D.p0[o - 1] && D.p0[o + 7] && ((lum(D.p0, o - 4) >= l + 0.15 && lum(D.p0, o + 4) >= l + 0.15) || (far(o - 4) && far(o + 4)))) eyes++;
      }
      assert.ok(eyes >= 2, `skin ${skin} (${base}): ${eyes} eye pixels standing out`);
    }
  } finally { setPolish(null); }
});

test('on: every pose draws for every build, whole (nothing thrown, nothing empty), in all eight facings', () => {
  setPolish(POLISH);
  try {
    const As = [look('m', { build: 0 }), look('f', { build: 3 }), look('m', { build: 4, height: 4 }), look('f', { build: 2, height: 0 })];
    for (const pose of Object.keys(POSES)) for (let i = 0; i < As.length; i++) {
      const G = person(As[i], (i * 3 + pose.length) % 8, pose, 1, { tight: true });
      assert.ok(G.w > 6 && G.h > 6 && G.w <= 200 && G.h <= 200, `${pose}: ${G.w} x ${G.h}`);
    }
  } finally { setPolish(null); }
});
