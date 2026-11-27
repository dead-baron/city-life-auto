// Guards for the owner's pre-beta notes of 2026-11-22 (docs/tasks/PREBETA-NOTES-2026-11-22.md, the triage table): each
// note fixed here keeps a check, so it can't come back quietly.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LENIENCY, SUSPICION_STAR } from '../shared/rules.js';

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

test('N4: a bounty is only one a player places - no city bounty for crimes', () => {
  const law = read('server/systems/law.js');
  assert.doesNotMatch(law, /cityBounty = Math\.max/, 'law.js puts no bounty on a wanted player');
  assert.doesNotMatch(law, /p\.cityBounty = [^0]/, '...anywhere');
});

test('N3: wanted levels come less easily (the tally and the small crimes\' count)', () => {
  assert.ok(LENIENCY.star >= 36, `the first star off the tally (${LENIENCY.star})`);
  assert.ok(SUSPICION_STAR >= 5, `small crimes seen before a star (${SUSPICION_STAR})`);
});

test('N8: Use on something you take out into the world closes the bag', () => {
  const bag = read('client/bag.js'), main = read('client/main.js');
  assert.match(bag, /if \(leavesBag\(t\.id\)\) \{ sel = null; armDrop = ''; \(leave \|\| close\)\(\); return; \}/, 'the Inventory asks to be closed');
  assert.match(main, /leave: \(\) => \{ if \(topOverlay\(\) === 'inv'\) closeHub\(\); \}/, 'the page closes it');
  assert.match(bag, /return !!it && !it\.light && !!\(it\.tool \|\| it\.music \|\| it\.ride \|\| it\.fun\)/, 'instruments, the boombox, boards, rods, fireworks - not a light');
});

test('N1: the bag tile keeps its tag and its count inside it; the slots show what you equip', () => {
  const bag = read('client/bag.js'), css = read('client/style.css');
  assert.match(bag, /<span class="bc-ft">\$\{tag\}\$\{cnt\}<\/span>/, 'a footer row');
  assert.doesNotMatch(css, /\.bc-tag \{ position: absolute/, 'no chip hung off the corner');
  assert.doesNotMatch(css, /\.bc-n \{ position: absolute/, 'no count over the name');
  // (the Inventory, 11-16: the weapon slots are the server's loadout - shared/loadout.js - and the keys line under the quick
  // bar says how to reach it in play, on this device)
  assert.match(bag, /loadout\(/, 'the slots show the loadout you carry');
  assert.match(bag, /class="iv-keys"/, 'the quick bar says how to reach it in play');
});

test('N21: on the respawn map no name sits under a numbered place', () => {
  const wm = read('client/worldmap.js'), ds = read('client/deathscreen.js');
  assert.match(wm, /for \(const \[wx, wy, r\] of opts\.avoid \|\| \[\]\)/, 'the map claims the caller\'s markers before the names');
  assert.match(ds, /wm\.draw\(c, \{ me: null, mini: H\.mini \}, -1e6, -1e6, 0, \{ cats: new Set\(\), avoid \}\)/, 'the respawn map passes its places');
  assert.match(ds, /spots\.find\(\(\[sx, sy\]\) => !hit\(sx, sy\)\)/, '"You fell here" takes a side no place covers');
});

test('N5 / N19 / N11 / N12: overhead labels and the event highlight - test/overhead.test.js', () => {
  assert.ok(read('test/overhead.test.js').includes('the event highlight stays on its person'));
});

test('N16: in and out of a walk-in, the building\'s picture dissolves from the street\'s to the cut-away - no pop, no screen dimming (11-23)', async () => {
  const host = read('client/art2/game/host.js'), main = read('client/main.js'), eng = read('client/art2/game/engine.js');
  const xf = (s) => Number((/const XF_MS = (\d+);/.exec(s) || [])[1]);
  assert.ok(xf(host) > 0 && xf(host) === xf(eng), 'one dissolve length, the host\'s and the engine\'s');
  assert.match(host, /ok = E\.uploadChunk\(res\.cx, res\.cy, g, 0, xf\) !== false;/, 'the swap dissolves');
  assert.doesNotMatch(host, /dipAt|DIP_MS/, 'no waiting for a dip');
  assert.doesNotMatch(main, /dipTick|DIP_A/, 'nothing dims the screen');
  assert.match(eng, /XO = uX >= 0\.0 && bayer4\(t\) \+ 0\.5 >= uX;/, 'old or new per art texel, by the dither');
});

test('N17: an awning over a door goes see-through while you stand under it', () => {
  const host = read('client/art2/game/host.js');
  assert.match(host, /if \(r\[5\] <= py \+ 2 && !\(b < TREE_FADE && r\[4\] > r\[5\] \+ AWN_MIN && sy < r\[4\] \+ 4 && sy > r\[5\] - 10\)\) continue;/);
});

test('N22: chat you can see is going on - a fuller feed, your own lines in it, long lines bubbled by their start', async () => {
  const c = read('client/chat.js');
  assert.match(c, /const FEED_N = \{ desk: 4, side: 2, up: 2 \}, CAP_CH = 44;/);
  assert.doesNotMatch(c, /if \(isOpen \|\| l\.own\) return;/, 'your own lines show too');
  const { capLine } = await import('../client/chat.js');
  assert.equal(capLine('short'), 'short');
  const t = capLine('a long line that the server sent to the log only, with more words than fit');
  assert.ok(t.endsWith('…') && t.length <= 45, t);
});

test('N9: the gig screen in pixels - drawn arrows at a whole-number scale, the game\'s pixel face', () => {
  const p = read('client/music/play.js');
  assert.match(p, /const ARROW_MASK = \[/, 'the arrows are pixel sprites');
  assert.doesNotMatch(p, /txt\(g, ARROW\[/, 'no glyph arrows');
  assert.match(p, /Math\.floor\(\(r\.width \* dpr\) \/ W\)/, 'a whole-number scale');
  assert.match(p, /"CLA Pixel"/, 'the pixel face');
  assert.doesNotMatch(p, /rgba\(0,0,0,\.6\)'; g\.fillText/, 'no soft shadow');
});

test('N6: a uniform\'s crew (an ambulance\'s two medics) never come out as twins', async () => {
  const { unTwin } = await import('../server/systems/npc.js');
  const peds = [], world = { query: () => peds }, mk = () => ({ s: 2, h: 1, hc: '#1a1410', b: 0, t: 6, tc: '#e8e8e8' });
  for (let i = 0; i < 4; i++) peds.push({ archetype: 'medic', app: unTwin(world, mk(), 'medic', 0, 0) });
  for (let i = 0; i < peds.length; i++) for (let j = i + 1; j < peds.length; j++) {
    const a = peds[i].app, b = peds[j].app;
    assert.ok(Math.abs(a.s - b.s) > 1 || a.hc !== b.hc, `medics ${i} and ${j} tell apart: ${JSON.stringify(a)} ${JSON.stringify(b)}`);
  }
});
