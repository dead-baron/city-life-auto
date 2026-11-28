// The Boom Tester thrown from the hands (11-27; the owner, 11-25: "a punching animation, the shot leaving flaming or
// glowing hands"): its shot is a punch (client/main.js pedPose, the 'shot' event), nothing is held (art2 host.js _ped),
// an ember glows on each hand and the throwing hand flares (liveart.js handGlow, host.js _boomHands).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { handGlow, HAND_GLOW } from '../client/art2/game/liveart.js';
import { F_NOCAST, ART_PX } from '../client/art2/gbuf.js';
import { WEAPONS } from '../shared/items.js';

const src = (f) => readFileSync(new URL(`../client/${f}`, import.meta.url), 'utf8');

test('the glow on a hand: a small ball of light that lights itself and casts no shadow - two embers and a flare', () => {
  const size = [];
  for (let k = 0; k < 3; k++) {
    const G = handGlow(k); let n = 0, hot = 0, white = 0;
    assert.equal(G.ap, ART_PX);
    for (let i = 0; i < G.w * G.h; i++) {
      if (!G.col[i * 4 + 3]) continue;
      n++;
      assert.ok(G.emi[i * 4 + 3] >= 200, 'every pixel of it glows');
      assert.ok(G.flag[i] & F_NOCAST, 'and casts no shadow');
      assert.ok(G.col[i * 4] >= 250 && G.col[i * 4 + 1] > G.col[i * 4 + 2], 'white, yellow or orange');
      if (G.col[i * 4 + 2] > 200) white++; if (G.emi[i * 4 + 3] === 255) hot++;
    }
    assert.ok(white >= 1 && hot > white && n > hot, `k ${k}: a white heart, yellow round it, an orange edge (${white} / ${hot} / ${n})`);
    assert.ok(G.w * ART_PX >= 2 * HAND_GLOW[k], 'the canvas holds it');
    size.push(n);
  }
  assert.ok(size[0] < size[1] && size[1] * 2 < size[2], `an ember flickering between two sizes, the flare well over both (${size})`);
});

test('the Boom Tester is thrown, not fired: its shot is a punch, the hands empty and glowing', () => {
  assert.equal(WEAPONS.boomtest.type, 'boomtest');
  const main = src('main.js'), host = src('art2/game/host.js');
  // the page: the shot sets the swing off and takes no gun's tracer; the pose is the punch
  const shot = main.slice(main.indexOf("case 'shot': {"), main.indexOf("case 'shot': {") + 900);
  assert.match(shot, /w\.type === 'boomtest'[\s\S]{0,400}swingAt = S\.loopClock[\s\S]{0,300}break;/, "the 'shot' event of a Boom Tester starts the punch and stops there");
  assert.ok(shot.indexOf("w.type === 'boomtest'") < shot.indexOf('fx.tracer') || !shot.includes('fx.tracer'), 'before any tracer');
  assert.match(main, /\(meleeW \|\| thrown\) && e\.swingAt !== undefined[^\n]*\|\| thrown \? 'punch' : 'swing'/);
  // the renderer: nothing in the hands, the glow on both, a light from each
  assert.match(host, /const boomH = wpn === BOOM_I;\s*\n\s*if \(boomH\) wpn = 0;/);
  assert.match(host, /if \(boomH && !lying && !car\) this\._boomHands\(/);
  assert.match(host, /for \(let j = 0; j < \(this\.nBoomL \| 0\); j\+\+\)[^\n]*this\._light\(/);
  assert.match(host, /BOOM_HANDS = \{ idle: \[[^\]]+\], aim: \[[^\]]+\], back: \[[^\]]+\], punch: \[\[[^\]]+\], \[[^\]]+\], \[[^\]]+\]\] \}/);
});
