// The title card's portrait (client/portrait.js): your whole figure, the game's own drawn as many whole px a world px as
// fit the frame (from 2 up with the close face of client/art2/peopleclose.js) - still, with an idle now and then, never
// a loop.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { frameFor, resFor } from '../client/portrait.js';
import { STARTERS } from '../shared/look.js';
import { encodeLook } from '../shared/lookcore.js';

const SRC = readFileSync(new URL('../client/portrait.js', import.meta.url), 'utf8');
const key = (f) => Buffer.from(f.px).toString('base64');

test('the whole figure, at as many whole px a world px as fit the frame one px a device px', () => {
  // a 56 px frame (52 inside its edge) and a figure 52 world px tall at the game's size
  assert.equal(resFor(52, 52), 1);    // at 1x: the game's own pixels
  assert.equal(resFor(104, 52), 2);   // at 2x
  assert.equal(resFor(156, 52), 3);   // at 3x
  for (const i of [0, 1, 3]) {
    const code = encodeLook(STARTERS[i].look), f = frameFor(code, 156, 0);
    // head to feet, and it fits: at 3x most looks fill most of the 156 px
    assert.ok(f.h > 100 && f.h <= 156 && f.w <= 156, `${STARTERS[i].name}: ${f.w} x ${f.h}`);
    let top = -1, bottom = -1;
    for (let y = 0; y < f.h; y++) for (let x = 0; x < f.w; x++) if (f.px[(y * f.w + x) * 4 + 3]) { if (top < 0) top = y; bottom = y; }
    assert.ok(bottom >= f.ay - 2 && top <= 2, 'the head to the feet');
  }
});

test('the idles are frames of their own: a blink, a glance, a scratch, the phone (drawn in the hand)', () => {
  const code = encodeLook(STARTERS[4].look), still = key(frameFor(code, 104, 0));
  for (const i of [1, 3, 5, 7, 10]) assert.notEqual(key(frameFor(code, 104, i)), still, `frame ${i} differs from the still one`);
  // the phone: the game-size phone laid over the close render (people.js draws no held item close up)
  assert.notEqual(key(frameFor(code, 104, 10)), key(frameFor(code, 104, 13)), 'the phone shows in the hand');
});

test('still, with idles at random intervals - never a loop; reduced motion: still', () => {
  assert.doesNotMatch(SRC, /setInterval/, 'no frame loop');
  assert.match(SRC, /prefers-reduced-motion: reduce/);
  assert.match(SRC, /if \(reduced\(\)\) return true;/, 'reduced motion: drawn still, no idles scheduled');
  assert.match(SRC, /GAP\[0\] \+ Math\.random\(\) \* \(GAP\[1\] - GAP\[0\]\)/, 'the next idle after a random while');
  assert.match(SRC, /import \{ closeFace \} from '\.\/art2\/peopleclose\.js'/, 'the close face');
});
