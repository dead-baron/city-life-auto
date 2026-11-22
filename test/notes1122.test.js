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
  assert.match(bag, /if \(leavesBag\(t\.id\) && leave\)/, 'the bag asks to be closed');
  assert.match(main, /leave: \(\) => \{ if \(topOverlay\(\) === 'inv'\) closeHub\(\); \}/, 'the page closes it');
  assert.match(bag, /return !!it && !it\.light && !!\(it\.tool \|\| it\.music \|\| it\.ride \|\| it\.fun\)/, 'instruments, the boombox, boards, rods, fireworks - not a light');
});

test('N1: the bag tile keeps its tag and its count inside it; the slots show what you equip', () => {
  const bag = read('client/bag.js'), css = read('client/style.css');
  assert.match(bag, /<span class="bc-ft">\$\{tag\}\$\{cnt\}<\/span>/, 'a footer row');
  assert.doesNotMatch(css, /\.bc-tag \{ position: absolute/, 'no chip hung off the corner');
  assert.doesNotMatch(css, /\.bc-n \{ position: absolute/, 'no count over the name');
  assert.match(bag, /savePref\('eq\.' \+ held, m\.weapon\)/, 'the slot remembers what you equipped');
  assert.match(bag, /QUICK BAR<em>\$\{wheelKey\(\)\}<\/em>/, 'the quick bar says how to reach it in play');
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
