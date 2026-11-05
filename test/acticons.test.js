// The action button says what pressing it will do (the owner, 11-05: "the hand icons specially look not very good" -
// no hands): the page reads the kind of what the server's prompt offers from its words (client/touchicons.js actKind)
// and the button, the prompt's chip and the hint strips show that kind's line icon. And no hand anywhere on touch.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ACT_KINDS, KIND_ICON, actKind, setActKind, actKindNow, iconOf, glyphOfWeapon, GLYPH_NAMES, setMelee } from '../client/touchicons.js';
import { TOUCH_STATES } from '../shared/touchcontrols.js';
import { WEAPONS, ITEMS } from '../shared/items.js';
import { itemGlyph } from '../client/bag.js';

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const HAND = /^hand(-|$)|finger|pointer|grab/;   // (a pointing or grabbing hand; not the handbag. The fist is the owner's pick for bare-handed HIT, 11-05)
const FIST_OK = new Set(['hand-fist']);

test('every action kind maps to a line icon; with no match the neutral "interact" mark', () => {
  assert.equal(KIND_ICON.interact, 'circle-dot');
  const kinds = ACT_KINDS.map(([k]) => k);
  assert.equal(new Set(kinds).size, kinds.length, 'one rule per kind');
  for (const [k, ic, re] of ACT_KINDS) {
    assert.ok(GLYPH_NAMES.includes(ic), `${k}: ${ic} is in the set`);
    assert.equal(KIND_ICON[k], ic);
    assert.ok(re instanceof RegExp, k);
  }
  for (const k of Object.keys(KIND_ICON)) { setActKind(k); assert.equal(iconOf('action', 'ACT'), KIND_ICON[k], k); }
  assert.equal(setActKind('nonsense'), 'interact', 'an unknown kind: the neutral mark');
  assert.equal(actKind(''), 'interact');
  assert.equal(actKind('Hold the bars'), 'interact');
});

test('the prompt\'s words, as the server writes them, give the kind', () => {
  const cases = {
    'Enter St. Neon General': 'door', 'Go inside (hide)': 'door', 'Leave': 'door', 'Harbor Heights - your door: go in': 'door',
    'Talk to the bartender': 'talk', 'Ask Rico for work': 'talk',
    'Get in the Taxi': 'getin', 'Drive out in the cruiser': 'getin', 'Board the ferry': 'boat', 'Board the train': 'transit', 'Hail the taxi': 'hail',
    'Pick up the crate': 'pickup', 'Take the materials': 'pickup', 'Set crate down': 'drop', 'Load onto Pickup': 'drop', 'Stash 3 Apples': 'drop',
    'Shop at the counter - Corner Mart': 'buy', 'Buy Coffee ($4)': 'buy', 'Sell the catch': 'buy', 'Deposit cash ($120)': 'bank', 'Use ATM': 'bank',
    'Empty the till': 'rob', 'Crack the strongbox': 'unlock', 'Cuff Suspect': 'arrest', 'Make a break for it!': 'run',
    'Hold to revive Sam': 'revive', 'Rest (full health, saves)': 'rest', 'Sit on the bench': 'sit', 'Cook a meal': 'eat', 'Take a shower': 'wash',
    'Repair body damage ($200)': 'repair', 'Play chess with Ann': 'play', 'Blackjack': 'casino', 'Climb the ladder': 'climb', 'Read the plaque': 'look',
    'Sign on as a trucker': 'job', 'Register as Bounty Hunter': 'sign', 'Plant 3 tomato seeds': 'plant', 'Hold to fell the pine': 'chop', 'Mine the copper vein': 'mine',
    'Light the campfire': 'fire', 'Switch it on': 'lights', 'Change outfit': 'wear', 'Adopt Biscuit - $50': 'pet', 'Tune in: KCLA': 'music', 'Going inside... (stand still)': 'wait',
  };
  for (const [w, k] of Object.entries(cases)) assert.equal(actKind(w), k, w);
  // and the kinds the cases cover are the common ones: every kind but a handful is exercised
  const hit = new Set(Object.values(cases));
  assert.ok(ACT_KINDS.filter(([k]) => !hit.has(k)).length <= 10);
});

test('no hand glyph is left on touch: the buttons in every state, every action kind, every weapon', () => {
  for (const n of GLYPH_NAMES) if (!FIST_OK.has(n)) assert.doesNotMatch(n, HAND, `${n}: a hand in the set`);
  for (const k of Object.keys(KIND_ICON)) {
    setActKind(k);
    for (const st of Object.values(TOUCH_STATES)) for (const [a, label] of Object.values(st)) if (label !== 'HIT') assert.doesNotMatch(iconOf(a, label), HAND, `${a} ${label} (${k})`);
  }
  setActKind('interact');
  for (const w of Object.values(WEAPONS)) if (w.id !== 'fists') assert.doesNotMatch(glyphOfWeapon(w.id, w.type), HAND, w.id);
  // HIT shows what you hit with: a fist bare-handed, the weapon's own glyph otherwise (the owner, 11-05)
  setMelee('fists', 'melee'); assert.equal(iconOf('fire', 'HIT'), 'hand-fist');
  setMelee('bat', 'melee'); assert.equal(iconOf('fire', 'HIT'), glyphOfWeapon('bat', 'melee'));
  setMelee('knife', 'melee'); assert.equal(iconOf('fire', 'HIT'), 'slice');
  setMelee('fists', 'melee');
});

test('the page wires it: the prompt names the kind, the action button and its chip draw it', () => {
  const glyphs = read('client/glyphs.js'), hud = read('client/hud.js');
  assert.match(glyphs, /kind = setActKind\(action === 'action' \? actKind\(m\[2\]\) : 'interact'\)/, 'formatPrompt reads the kind before drawing the chip');
  assert.match(hud, /actGlyph\(fp\.kind\);/, 'the action button swaps its icon with the prompt');
  assert.match(hud, /actGlyph\(setActKind\('interact'\)\);/, 'and back to the neutral mark with none');
  setActKind('door'); assert.equal(actKindNow(), 'door'); setActKind('interact');
});

test('the bag: every thing has a line icon of the same family', () => {
  for (const id of Object.keys(ITEMS)) assert.ok(GLYPH_NAMES.includes(itemGlyph(id)), `${id}: ${itemGlyph(id)}`);
  assert.equal(itemGlyph('medkit'), 'briefcase-medical'); assert.equal(itemGlyph('bass'), 'fish'); assert.equal(itemGlyph('caneRod'), 'fishing-rod');
  assert.doesNotMatch(read('client/bag.js'), /ITEM_ICON/, 'no emoji left in the bag');
});

test('the Lucide license travels with the icons', () => {
  const lic = read('client/icons-LICENSE.txt'), src = read('client/touchicons.js');
  for (const t of [lic, src]) {
    assert.match(t, /ISC License/);
    assert.match(t, /Cole Bemis 2013-2022 as part of Feather \(MIT\)/);
    assert.match(t, /Lucide Contributors 2022/);
  }
  assert.match(lic, /Permission to use, copy, modify, and\/or distribute this software for any purpose/);
});
