// The menus' polish (the owner, 2026-11-14 18:56-18:59): the creator's stage standing still with the character centred
// on it in every view; the logo's "Auto" misbehaving now and then, never on a beat, and the title's backdrop alive
// behind it (client/titlelife.js); the emote balloons going with some expression instead of blinking off.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { closure } from '../tools/perf.mjs';

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

test('the creator: the stage from the canvas alone - the same place and size in every view, pose and zoom', async () => {
  const { stageLayout, STAGE } = await import('../client/creator.js');
  for (const [W, H, game, r] of [[300, 400, 3.2, 1], [354, 472, 3.2, 2], [177, 236, 2.4, 2], [164, 218, 2, 1], [600, 800, 4, 2]]) {
    const A = stageLayout(W, H, game, r, false), Z = stageLayout(W, H, game, r, true);
    assert.deepEqual([Z.s, Z.cx, Z.feet], [A.s, A.cx, A.feet], `${W}x${H}: the magnifier leaves the stone where it is`);
    assert.equal(A.cx, Math.round(W / 2), 'the stone in the middle');
    assert.ok(STAGE.art * A.s <= W * 0.92 && STAGE.figH * A.s <= H * 0.66, `${W}x${H}: the stone and a tall figure fit (s ${A.s})`);
    assert.ok(A.fs === A.s && A.fy === A.feet, 'standing on the stone at its own scale');
    assert.ok(Z.fs > A.s && Z.fy - STAGE.head * Z.fs >= 0, `${W}x${H}: zoomed, closer, the head in the picture`);
  }
  const src = read('client/creator.js'), draw = src.slice(src.indexOf('function drawPreview()'), src.indexOf('// the idle: breathing'));
  // nothing of the figure's own size decides the stage: the anchor (the rig's point between the feet) places it
  assert.ok(!/S\.w \* 1\.45|S\.h \* s > room/.test(src), 'the stone and the scale no longer follow the sprite');
  assert.match(draw, /plinth\(c2, G\.cx, G\.feet, G\.s, STAGE\.art\)/);
  assert.match(draw, /G\.cx - S\.ax \* G\.fs, G\.fy - S\.ay \* G\.fs/, 'the figure by its anchor, not its box');
  // and the canvas itself never moves as the view's name changes length
  const css = read('client/style.css');
  assert.match(css, /#creator \.cc-pname \{ flex: none; width: 90px;/, 'upright: the name a fixed width beside the preview');
  assert.match(css, /#creator \.cc-pname \{ min-width: 120px; min-height: 2\.4em;/, 'beside: two lines kept for it');
});

test('the logo: "Auto" misbehaves now and then - random gaps, mostly Auto, subtle, over quickly', async () => {
  const { nextGlitch, glitchSteps, GLITCH } = await import('../client/titlelogo.js');
  let seed = 42;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const N = 3000, gaps = [], layers = {}, kinds = {};
  let last = '', repeats = 0;
  for (let i = 0; i < N; i++) {
    const g = nextGlitch(rnd, last);
    gaps.push(g.delay); layers[g.layer] = (layers[g.layer] || 0) + 1; kinds[g.kind] = (kinds[g.kind] || 0) + 1;
    if (g.kind === last) repeats++;
    last = g.kind;
    for (const [at, o, lv] of glitchSteps(g.kind, rnd)) {
      assert.ok(at >= 0 && at < 700, 'over in well under a second');
      assert.ok(o >= 0.12 && o <= 1, 'never fully off');
      if (lv !== undefined) assert.ok(lv >= 0.12 && lv <= 1);
    }
    const st = glitchSteps(g.kind, rnd), end = st[st.length - 1];
    assert.ok(end[1] === 1 && (end[2] === undefined || end[2] === 1), 'it ends lit');
  }
  assert.ok(Math.min(...gaps) >= GLITCH.min && Math.max(...gaps) <= GLITCH.max && GLITCH.min >= 8000 && GLITCH.max <= 25000, '8-25 s apart');
  const mean = gaps.reduce((a, b) => a + b, 0) / N, sd = Math.sqrt(gaps.reduce((a, b) => a + (b - mean) ** 2, 0) / N);
  assert.ok(sd > 4000, `no beat to count: the gaps spread (sd ${Math.round(sd)} ms)`);
  assert.ok(layers.auto / N > 0.7 && layers.auto / N < 0.9, 'mostly "Auto"');
  assert.ok(layers.sky && layers.city && layers.swoosh, 'now and then another piece');
  assert.ok(kinds.blink && kinds.dim && kinds.stutter, 'a blink, a dim, a stutter');
  assert.ok(repeats / N < 0.25, 'seldom the same way twice running');
  const src = read('client/titlelogo.js');
  assert.match(src, /const snd = hum\(0\.3\);/, 'a faint tick, through the same sound settings');
  assert.match(src, /if \(!box \|\| reduced\(\)\) return;/, 'reduced motion: none');
});

test('the title\'s backdrop: alive behind the menu, loaded after the sign, still for reduced motion, paused when hidden', () => {
  const page = closure(['client/boot.js', 'client/main.js']);
  assert.ok(!page.includes('client/titlelife.js'), 'not in the page\'s first load (the title stays light)');
  assert.match(read('client/titlelogo.js'), /import\('\.\/titlelife\.js'\)/, 'client/titlelogo.js loads it once the sign is lit');
  const src = read('client/titlelife.js');
  assert.match(src, /stars\(\);\s*if \(reduced\(\)\) return;/, 'reduced motion: the stars alone');
  assert.match(src, /document\.hidden/, 'paused while the tab is hidden');
  for (const piece of ['function stars', 'function windows', 'function street', 'function beamSweep', 'function cloud', 'function aircraft']) assert.ok(src.includes(piece), piece);
  assert.ok(!/setInterval\([^)]*requestAnimationFrame/.test(src), 'no endless frame loop');
  // phones upright: the city risen behind the lower menu
  assert.match(read('client/style.css'), /#title \{ --sky-up: 120px;[^}]*calc\(100% - var\(--sky-up\)\) \/ auto 144px/);
  assert.match(read('client/titlescreen.js'), /export function skyLayout\(\)/, 'the skyline says where its windows are');
});

test('the emote balloons: an expression while they hold, then a pop or a shrink - never the blink', async () => {
  const { MOTION, BALLOONS, BALLOON_MS } = await import('../client/emotes.js');
  const { CHAT } = await import('../shared/chatdefs.js');
  const src = read('client/emotes.js');
  for (const b of BALLOONS) {
    assert.ok(MOTION[b], `${b}: its motion`);
    assert.ok(new RegExp(`@keyframes emo-${MOTION[b][0]} `).test(src), `${b}: its expression drawn (emo-${MOTION[b][0]})`);
    assert.ok(['pop', 'shrink'].includes(MOTION[b][1]));
  }
  assert.deepEqual(Object.keys(MOTION).filter((k) => MOTION[k][1] === 'pop').sort(), ['haha', 'heart', 'idea'], 'the happy ones pop');
  assert.ok(BALLOON_MS.out >= 150 && BALLOON_MS.out <= 200, 'the exit about 150-200 ms');
  assert.ok(BALLOON_MS.in + BALLOON_MS.out < CHAT.balloonS * 1000);
  const bal = src.split('\n').find((l) => l.startsWith('@keyframes emo-bal '));
  assert.ok(!/opacity: 0/.test(bal), 'no blinking on and off');
  assert.match(src, /@keyframes emo-shrink \{ 0% \{[^}]*\} 30% \{ transform: translate\(-50%, -2px\) scale\(\.96, 1\.06\); \}/, 'a little squash up first');
  assert.match(src, /classList\.add\('bye'\)/, 'the typing dots shrink away when the typing stops (not the kit\'s .out fade)');
  assert.match(read('client/chat.js'), /\.cht-bub\.bye \{ animation: cht-out/, 'the speech bubbles go the same way');
});
