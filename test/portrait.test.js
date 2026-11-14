// The title card's portrait (client/portrait.js): your look drawn close up - the game's figure finer, with the close face
// (client/art2/peopleclose.js) - still, with an idle now and then, never a loop.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { frameFor, resFor } from '../client/portrait.js';
import { STARTERS } from '../shared/look.js';
import { encodeLook } from '../shared/lookcore.js';

const SRC = readFileSync(new URL('../client/portrait.js', import.meta.url), 'utf8');
const key = (f) => Buffer.from(f.px).toString('base64');

test('the portrait is drawn close up, at a resolution that fills the frame one px a device px', () => {
  assert.equal(resFor(52), 2);    // a 56 px frame at 1x
  assert.equal(resFor(104), 3);   // at 2x
  assert.equal(resFor(156), 5);   // at 3x
  for (const i of [0, 1, 3]) {
    const code = encodeLook(STARTERS[i].look), f = frameFor(code, 4, 0);
    // the head and shoulders at 4 px a world px: several times the game sprite's 18 x 15 art px
    assert.ok(f.w > 72 && f.h > 100, `${STARTERS[i].name}: ${f.w} x ${f.h}`);
    let n = 0;
    for (let k = 3; k < f.px.length; k += 4) n += f.px[k] ? 1 : 0;
    assert.ok(n > f.w * f.h * 0.3, 'the figure fills its box');
  }
});

test('the idles are frames of their own: a blink, a glance, a scratch, the phone (drawn in the hand)', () => {
  const code = encodeLook(STARTERS[4].look), still = key(frameFor(code, 3, 0));
  for (const i of [1, 3, 5, 7, 10]) assert.notEqual(key(frameFor(code, 3, i)), still, `frame ${i} differs from the still one`);
  // the phone: the game-size phone laid over the close render (people.js draws no held item close up)
  assert.notEqual(key(frameFor(code, 3, 10)), key(frameFor(code, 3, 13)), 'the phone shows in the hand');
});

test('still, with idles at random intervals - never a loop; reduced motion: still', () => {
  assert.doesNotMatch(SRC, /setInterval/, 'no frame loop');
  assert.match(SRC, /prefers-reduced-motion: reduce/);
  assert.match(SRC, /if \(reduced\(\)\) return true;/, 'reduced motion: drawn still, no idles scheduled');
  assert.match(SRC, /GAP\[0\] \+ Math\.random\(\) \* \(GAP\[1\] - GAP\[0\]\)/, 'the next idle after a random while');
  assert.match(SRC, /import \{ closeFace \} from '\.\/art2\/peopleclose\.js'/, 'the close face');
});
