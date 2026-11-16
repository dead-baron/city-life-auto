// The Inventory on every screen (the owner, 11-16: "On desktop the inventory is all squished to the side ... Make it work
// on desktop and mobile, landscape and portrait"; his screenshots had the tabs cut off - "Healin" - and MELEE and THROWN
// run together): the screen built for a player who carries a lot (test/invpage.js), measured for real in a headless
// Chromium at desktops (1920x1080, 1280x720, his 1896x1927 window), phones on their side (844x390, 740x360) and upright
// (390x844, 360x740), a tablet, and with a pad - every button, tab, tile and label on the screen, none cut off, no button
// on another; the frame uses the screen; three columns on a wide screen, stacked upright. Skipped without a Chromium
// (set CLA_CHROME to one).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { findChrome } from './hudpage.js';
import { SIZES, measure, problems } from './invpage.js';

test('the Inventory fits every screen: nothing off it, nothing cut off, no button on another', { skip: !findChrome() && 'no headless Chromium (set CLA_CHROME)' }, async () => {
  const bad = [];
  for (const [w, h, dev] of SIZES) {
    for (const extra of ['', '&sel=w:pistol', '&tab=clothes&looks=1']) {
      const r = await measure(w, h, dev, extra);
      bad.push(...problems(r).map((p) => `${p}${extra ? ` (${extra.slice(1)})` : ''}`));
      if (extra) continue;
      const fw = r.frame[2] - r.frame[0];
      assert.ok(fw >= w * 0.9, `${w}x${h}: the frame uses the screen (${fw} px wide)`);
      const at = (k) => r.boxes.find((b) => b.name.includes(k));
      const fig = at('iv-cv'), tile = r.boxes.find((b) => b.name.startsWith('bag-cell')), detailHead = r.boxes.find((b) => b.name.startsWith('H3:DETAILS'));
      assert.ok(fig && tile, `${w}x${h}: the character and the grid`);
      if (w > h) {
        assert.ok(fig.x1 <= tile.x0, `${w}x${h}: the character left of the grid`);
        assert.ok(detailHead && detailHead.x0 >= tile.x1, `${w}x${h}: the details right of it`);
      } else assert.ok(fig.y1 <= tile.y0, `${w}x${h}: upright, the character above the grid`);
      for (const t of ['all', 'clothes', 'weapons', 'tools', 'food', 'materials', 'valuables']) assert.ok(at(`chip:${t}`) || at(`chip on:${t}`), `${w}x${h}: the ${t} tab shows`);
      for (const k of ['w:pistol', 'w:shotgun', 'w:bat', 'w:grenade']) assert.ok(r.boxes.some((b) => b.name.startsWith('bag-slot') && b.name.endsWith(k)), `${w}x${h}: ${k} on the quick bar`);
    }
  }
  assert.deepEqual(bad, [], bad.slice(0, 30).join('\n'));
});

test('the Inventory\'s parts: the slots round the figure, the X on each, the tabs, the quick bar, the three actions', async () => {
  const { DOLL, TABS, tabOf, BAG_CATS } = await import('../client/bag.js');
  assert.deepEqual(DOLL.flat().map((d) => d[0]), ['hat', 'top', 'jacket', 'bottoms', 'glasses', 'jewel', 'bag', 'shoes'], 'U6\'s slots');
  assert.deepEqual(TABS.map((t) => t[1]), ['All', 'Clothes', 'Weapons', 'Tools', 'Food & Meds', 'Materials', 'Valuables'], 'U14\'s tabs');
  for (const [c] of BAG_CATS) assert.ok(TABS.some((t) => t[0] === tabOf(c)), `${c} has a tab`);
  const bag = readFileSync(new URL('../client/bag.js', import.meta.url), 'utf8');
  assert.match(bag, /send\(\{ t: 'look', a: 'off', s: 'all' \}\)/, 'Take it all off');
  assert.match(bag, /send\(\{ t: 'look', a: 'off', s: b\.dataset\.off === 'set' \? 'top' : b\.dataset\.off \}\)/, 'an X takes a slot off');
  assert.match(bag, /send\(\{ t: 'look', a: 'wear', id: t\.id \}\)/, 'wear a piece of yours');
  assert.match(bag, /send\(\{ t: 'look', a: 'outfit', i \}\)/, 'a saved look');
  assert.match(bag, /import \{ person \} from '\.\/art2\/people\.js';/, 'the game\'s own character art, not the close-up renderer');
  assert.doesNotMatch(bag, /peopleclose/);
  const { loadout } = await import('../shared/loadout.js');
  assert.deepEqual(loadout(['fists', 'bat', 'grenade', 'shotgun', 'pistol', 'rod']), ['pistol', 'shotgun', 'bat', 'grenade'], 'Gun 1, Gun 2, Melee, Thrown');
  assert.deepEqual(loadout(['fists', 'knife']), [null, null, 'knife', null]);
  const main = readFileSync(new URL('../client/main.js', import.meta.url), 'utf8');
  assert.match(main, /const HUB_NAMES = \{[^}]*bag: 'INVENTORY'/, 'named Inventory');
  assert.match(main, /else if \(!topOverlay\(\)\) quickKey\(n\);/, 'the number keys: the quick bar');
  assert.match(main, /if \(n < 4\) \{ const id = loadout\(\(m\.weapons \|\| \[\]\)\.map\(\(w\) => w\.id\)\)\[n\];/, '1-4 the weapon slots');
  assert.match(main, /if \(id && \(\(m\.inv \|\| \{\}\)\[id\] \|\| 0\) > 0\) send\(\{ t: 'inv', a: 'use', id \}\);/, '5-8 the things to use');
  assert.match(main, /tabHeld\(\) && canWheel\(\)[^\n]*wwheel\.show\(\)\) \{ S\.kbWheel = true; cancelTabTap\(\); \}/, 'hold Tab: the weapon wheel');
  assert.match(main, /if \(topOverlay\(\) === 'inv' && bagMod && bagMod\.pad\(input\)\) return true;/, 'the pad in the Inventory');
  assert.match(readFileSync(new URL('../index.html', import.meta.url), 'utf8'), /data-p="bag"><i class="ic" data-ic="bag"><\/i><span>INVENTORY<\/span>/, 'the pause list');
});
