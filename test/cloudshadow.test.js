// Cloud shadows (the owner, 11-25, on the still report-43: "I think the cloud looks okay let's try it out"): big soft
// shadows drifting over the land by day, in the game's light pass (client/art2/game/lightgame.js CLOUD, the sun's
// visibility). None at night; fainter under rain's overcast; a quarter or so of the land under one at a time; a switch
// in the debug menu. The shader itself is not run here (no GL in the tests): its rule is read from the source and the
// noise it is cut from is worked out again in JS.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PRESETS_GAME, PRESET_DEFAULTS, CLOUD, blendPresets } from '../client/art2/game/lightgame.js';

const src = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8');

test('cloud shadows by day only: the presets', () => {
  assert.equal(PRESET_DEFAULTS.cloud, 0, 'none unless a preset says so (indoors, caves, anything new)');
  for (const k of ['predawn', 'dusk', 'night', 'storm', 'fogNight']) if (PRESETS_GAME[k]) assert.equal(PRESETS_GAME[k].cloud, 0, `${k}: none`);
  for (const k of ['morning', 'noon', 'afternoon', 'golden']) assert.ok(PRESETS_GAME[k].cloud >= 0.2 && PRESETS_GAME[k].cloud <= 0.45, `${k}: a soft shadow (${PRESETS_GAME[k].cloud})`);
  assert.ok(PRESETS_GAME.rain.cloud > 0 && PRESETS_GAME.rain.cloud < PRESETS_GAME.noon.cloud / 2, 'fainter under the rain\'s overcast');
  const mid = blendPresets(PRESETS_GAME.dusk, PRESETS_GAME.golden, 0.5, {});
  assert.ok(Math.abs(mid.cloud - PRESETS_GAME.golden.cloud / 2) < 1e-6, 'it fades with the day\'s light');
});

test('the shadow is the sun\'s: drawn in its visibility, anchored to the world, drifting slowly', () => {
  const s = src('client/art2/game/lightgame.js');
  assert.ok(/uniform vec3 cloud;/.test(s) && /cloud\.x > 0\.0 && sh > 0\.0 \? sh \* cloudVis\(worg \+ P\.xy\)/.test(s), 'the sun\'s visibility takes the cloud, at the pixel\'s place in the world');
  assert.ok(/S\.clouds === false \? 0 : pv\(P, 'cloud'\)/.test(s), 'switched off: nothing drawn');
  assert.ok(CLOUD.size >= 900 && CLOUD.size <= 3000 && CLOUD.speed >= 3 && CLOUD.speed <= 24, `big and slow (${CLOUD.size} px, ${CLOUD.speed} px/s)`);
  assert.ok(Math.abs(Math.hypot(...CLOUD.dir) - 1) < 0.01, 'one direction');
});

test('about a quarter of the land under a cloud, never most of it', () => {
  // (the shader's hash2 and cloudN, in JS)
  const hash2 = (x, y) => { let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263)) >>> 0; h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0; return ((h ^ (h >>> 16)) & 16777215) / 16777216; };
  const vn = (px, py) => { const ix = Math.floor(px), iy = Math.floor(py); let fx = px - ix, fy = py - iy; fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy); const a = hash2(ix, iy), b = hash2(ix + 1, iy), c = hash2(ix, iy + 1), d = hash2(ix + 1, iy + 1); return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy; };
  const ss = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  let n = 0, any = 0, deep = 0;
  for (let y = 0; y < 100000; y += 250) for (let x = 0; x < 190000; x += 250) { const px = x / CLOUD.size, py = y / CLOUD.size, c = ss(CLOUD.lo, CLOUD.hi, vn(px, py) * 0.65 + vn(px * 2.7 + 13.7, py * 2.7 + 13.7) * 0.35); n++; if (c > 0.05) any++; if (c > 0.5) deep++; }
  console.log('cloud shadows', JSON.stringify({ touched: +(any / n).toFixed(3), halfOrMore: +(deep / n).toFixed(3) }));
  assert.ok(any / n > 0.12 && any / n < 0.45, `the share of the land a shadow touches (${(any / n * 100).toFixed(1)}%)`);
  assert.ok(deep / n > 0.05 && deep / n < 0.3, `the share at half strength or more (${(deep / n * 100).toFixed(1)}%)`);
});

test('a switch in the debug menu, read by the engine', () => {
  assert.ok(/'@clouds'/.test(src('client/devcats.js')) && /c === '@clouds'/.test(src('client/devmenu.js')), 'the debug menu\'s item');
  assert.ok(/localStorage\.getItem\('cla\.clouds'\) !== '0'/.test(src('client/art2/game/engine.js')) && /LS\.clouds = this\.clouds/.test(src('client/art2/game/engine.js')), 'the engine reads it');
});
