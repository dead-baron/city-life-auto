// The title card's portrait (client/portrait.js): the game's own sprite of your look - the same pixels the city shows -
// made bigger by a whole number only, framed head to waist with every look's head at the same spot; still, with an idle from the game's own frames now and
// then, never a loop.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spriteFor, framing, HEAD_Y } from '../client/portrait.js';
import '../client/art2/poses.js';   // (the emotes' frames: the scratch and the phone)
import { person } from '../client/art2/people.js';
import { packGBuf, downsample2 } from '../client/art2/gbuf.js';
import { STARTERS } from '../shared/look.js';
import { encodeLook, decodeLook, lookArt } from '../shared/lookcore.js';

const SRC = readFileSync(new URL('../client/portrait.js', import.meta.url), 'utf8');
const key = (px) => Buffer.from(px).toString('base64');

test('the sprite is the game\'s own: the same pixels the city draws, no finer render', () => {
  assert.doesNotMatch(SRC, /peopleclose|res:/, 'no close-up renderer, no finer resolution');
  for (const i of [0, 3, 8]) {
    const code = encodeLook(STARTERS[i].look), g = downsample2(packGBuf(person(lookArt(decodeLook(code), { code }), 0, 'idle', 0, { tight: true })));
    assert.equal(key(spriteFor(code).px), key(g.p0.subarray(0, g.w * g.h * 4)), STARTERS[i].name);
  }
});

test('a portrait: the head at the same spot in the frame for every look, at a whole number of px an art px', () => {
  for (let i = 0; i < STARTERS.length; i++) {
    const code = encodeLook(STARTERS[i].look), h = spriteFor(code).head, F = framing(52, h);
    assert.ok(Number.isInteger(F.s) && F.s >= 2 && F.n * F.s <= 52, `${STARTERS[i].name}: ${F.s} px an art px, ${F.n} art px`);
    // the head's centre (the rig's, not the outline's) across the middle and HEAD_Y down - within half an art px
    assert.ok(Math.abs(h[0] - F.x0 - F.n / 2) <= 0.5, `${STARTERS[i].name}: centred across`);
    assert.ok(Math.abs(h[1] - F.y0 - F.n * HEAD_Y) <= 0.5, `${STARTERS[i].name}: the head at the same height`);
  }
  // 52 px inside the card's frame: 17 art px at 3 (the head to the waist); the small card's 36: 18 at 2
  assert.deepEqual([framing(52, [0, -17]).s, framing(52, [0, -17]).n], [3, 17]);
  assert.deepEqual([framing(36, [0, -17]).s, framing(36, [0, -17]).n], [2, 18]);
});

test('the idles are the game sprite\'s own frames: a blink, the idle\'s glances, the emotes\' scratch and phone', () => {
  const code = encodeLook(STARTERS[4].look), still = key(spriteFor(code).px);
  for (const [p, f] of [['ptblink', 0], ['idle', 2], ['idle', 3], ['emhuh', 0], ['emphone', 1]]) assert.notEqual(key(spriteFor(code, p, f).px), still, `${p} ${f}`);
});

test('still, with idles at random intervals - never a loop; reduced motion: still', () => {
  assert.doesNotMatch(SRC, /setInterval/, 'no frame loop');
  assert.match(SRC, /prefers-reduced-motion: reduce/);
  assert.match(SRC, /if \(reduced\(\)\) return true;/, 'reduced motion: drawn still, no idles scheduled');
  assert.match(SRC, /GAP\[0\] \+ Math\.random\(\) \* \(GAP\[1\] - GAP\[0\]\)/, 'the next idle after a random while');
  assert.match(SRC, /imageRendering = 'pixelated'/, 'nearest-neighbour');
});
