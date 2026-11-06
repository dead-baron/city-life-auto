// The phone's Guide (shared/guide.js, client/guide.js): the in-game wiki built from the game's own data, so its numbers
// never drift - a number changed in shared/rules.js (or a shop's price, an item) shows in the Guide the next time it's
// built. Its seven sections, its controls named by action ([[action]], drawn per device), its search; loaded lazily.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { guideSections, searchGuide } from '../shared/guide.js';
import { STARTER, MAILJOB, BOAT_RENTAL_PRICE, FTUE, MORTGAGE } from '../shared/rules.js';
import { SHOPS, ITEMS } from '../shared/items.js';
import { ACTIONS } from '../shared/controls.js';
import { closure } from '../tools/perf.mjs';

const text = (secs) => secs.flatMap((s) => s.entries.map((e) => `${e.t}: ${e.b}`)).join('\n');
const entry = (secs, sec, id) => secs.find((s) => s.id === sec).entries.find((e) => e.id === id);

test('seven sections from the design: getting around, ways to earn, the law, places, activities, property, items', () => {
  const S = guideSections();
  assert.deepEqual(S.map((s) => s.id), ['around', 'earn', 'law', 'places', 'activities', 'property', 'items']);
  assert.deepEqual(S.map((s) => s.title), ['Getting around', 'Ways to earn', 'The law', 'Places', 'Activities', 'Property', 'Items']);
  for (const s of S) { assert.ok(s.entries.length >= 4, s.id); for (const e of s.entries) assert.ok(e.t && e.b && e.id, `${s.id}/${e.id}`); }
  assert.match(S.find((s) => s.id === 'earn').blurb, /you can do all of it/);
  // the controls by their actions only (the page shows each device's glyph): every one a real action
  for (const m of text(S).matchAll(/\[\[(\w+)\]\]/g)) assert.ok(ACTIONS.includes(m[1]), `[[${m[1]}]] is an action in shared/controls.js`);
  assert.doesNotMatch(text(S), /\b(WASD|SHIFT|ESC)\b|\bpress E\b/, 'no keyboard keys typed in');
});

test('the numbers come from the data: change a rule, a price or an item and the Guide follows', () => {
  const was = { cd: STARTER.cooldownS, walk: MAILJOB.walk, letter: MAILJOB.letter, jet: BOAT_RENTAL_PRICE.jetski, dep: MORTGAGE.deposit, heal: ITEMS.bandage.heal };
  const band = SHOPS.pharmacy.buy.find((o) => o.id === 'bandage'), bp = band.price;
  try {
    assert.match(entry(guideSections(), 'around', 'starter').b, new RegExp(`${was.cd / 60} minutes later`));
    STARTER.cooldownS = 17 * 60; MAILJOB.walk = 9; MAILJOB.letter = 31; BOAT_RENTAL_PRICE.jetski = 777; MORTGAGE.deposit = 0.35; ITEMS.bandage.heal = 23; band.price = 41;
    const S = guideSections();
    assert.match(entry(S, 'around', 'starter').b, /17 minutes later/, 'STARTER.cooldownS');
    assert.match(entry(S, 'earn', 'mail').b, /a walking round of 9 homes \(\$31 a letter\)/, 'MAILJOB');
    assert.match(entry(S, 'around', 'boats').b, /a jet ski \(\$777\)/, 'BOAT_RENTAL_PRICE');
    assert.match(entry(S, 'property', 'mortgage').b, /^35% down/, 'MORTGAGE');
    assert.match(entry(S, 'items', 'heal').b, /A bandage heals 23 and stops bleeding \(\$41 at a pharmacy\)/, 'the item and the shop\'s price');
  } finally {
    STARTER.cooldownS = was.cd; MAILJOB.walk = was.walk; MAILJOB.letter = was.letter; BOAT_RENTAL_PRICE.jetski = was.jet; MORTGAGE.deposit = was.dep; ITEMS.bandage.heal = was.heal; band.price = bp;
  }
  assert.match(entry(guideSections(), 'items', 'rods').b, new RegExp(`${FTUE.bait[1]} ${ITEMS[FTUE.bait[0]].name.toLowerCase()}`), 'the outdoors start\'s gear: FTUE');
});

test('places count what the built map has; search finds an entry by any of its words', () => {
  const pois = [{ kind: 'hospital' }, { kind: 'hospital' }, { kind: 'fence' }];
  const S = guideSections({ pois });
  const P = S.find((s) => s.id === 'places').entries;
  assert.equal(P.find((e) => e.id === 'hospital').t, 'Hospitals (2)');
  assert.equal(P.find((e) => e.id === 'fence').t, 'The black market (1)');
  assert.ok(!P.some((e) => e.id === 'bowling'), 'none in this world: not listed');
  const hits = searchGuide(guideSections(), 'free bus');
  assert.ok(hits.some(({ e }) => e.id === 'bus'), 'buses');
  assert.ok(searchGuide(guideSections(), 'vehicle').length > 1, 'a control by its action\'s name');
  assert.deepEqual(searchGuide(guideSections(), '   '), []);
});

test('the Guide loads with its app, not with the page; the phone opens it, and its replay and tips buttons reach the server', () => {
  const page = new Set(closure(['client/boot.js', 'client/main.js']));
  for (const f of ['client/guide.js', 'shared/guide.js', 'client/ftue.js', 'client/phone.js']) assert.ok(!page.has(f), `${f} loads lazily`);
  const phone = readFileSync(new URL('../client/phone.js', import.meta.url), 'utf8'), gd = readFileSync(new URL('../client/guide.js', import.meta.url), 'utf8');
  assert.match(phone, /import\('\.\/guide\.js'\)/);
  assert.doesNotMatch(phone, /coming soon/i, 'the placeholder is gone');
  for (const a of ['replay', 'tips', 'skip']) assert.match(gd, new RegExp(`data-gd="${a}"`), a);
  assert.match(gd, /ctx\.send\(\{ t: 'intro', a \}\)/);
  assert.match(gd, /type="search"/, 'a search box');
});
