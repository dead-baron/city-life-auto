// The action button says what pressing it will do (the owner, 11-05: "the hand icons specially look not very good" -
// no hands): the page reads the kind of what the server's prompt offers from its words (client/touchicons.js actKind)
// and the button, the prompt's chip and the hint strips show that kind's line icon. And no hand anywhere on touch.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ACT_KINDS, KIND_ICON, actKind, setActKind, actKindNow, iconOf, glyphOfWeapon, GLYPH_NAMES, setMelee, setHose, glyph } from '../client/touchicons.js';
import { slotGeometry } from '../client/touchslots.js';
import { HOSE_LEN, FIRE } from '../shared/rules.js';
import { TOUCH_STATES } from '../shared/touchcontrols.js';
import { WEAPONS, ITEMS } from '../shared/items.js';
import { itemGlyph } from '../client/bag.js';

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const HAND = /^hand(-|$)|finger|pointer|grab/;   // (a pointing or grabbing hand; not the handbag. The fist is the owner's pick for bare-handed HIT, 11-05)
const FIST_OK = new Set(['fist']);

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
    'Shop at the counter - Corner Mart': 'buy', 'Buy Coffee ($4)': 'buy', 'Sell the catch': 'buy', 'Look around Maple Cottage - for sale, $42,000': 'home', 'Unit 3B - for sale, $28,000: look around or buy': 'home', 'Deposit cash ($120)': 'bank', 'Use ATM': 'bank',
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
  setMelee('fists', 'melee'); assert.equal(iconOf('fire', 'HIT'), 'fist');
  setMelee('bat', 'melee'); assert.equal(iconOf('fire', 'HIT'), glyphOfWeapon('bat', 'melee'));
  setMelee('knife', 'melee'); assert.equal(iconOf('fire', 'HIT'), 'knife');
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

// the owner, 11-06: "The coin UI for that yellow button should change though. Maybe just a $"
test('buying, selling and paying: a dollar sign on the gold disc, no coins', () => {
  assert.equal(KIND_ICON.buy, 'dollar-sign');
  for (const w of ['Buy Coffee ($4)', 'Sell the catch', 'Pay the fine ($200)', 'Shop at the counter - Corner Mart']) { setActKind(actKind(w)); assert.equal(iconOf('action', 'ACT'), 'dollar-sign', w); }
  setActKind('interact');
  assert.ok(!ACT_KINDS.some(([, ic]) => ic === 'coins'), 'no action shows coins (the bag\'s gold nuggets still do)');
});

// the owner, 11-06: "better more representative art for the weapon icons. Including the fists" - every weapon its own
// drawing, the guns told apart (a pistol, an SMG and a rifle by their outline); none of the Lucide stand-ins of 11-05
test('every weapon has its own glyph; no two guns share one; no stand-ins', () => {
  const by = new Map();
  for (const [id, w] of Object.entries(WEAPONS)) {
    const g = glyphOfWeapon(id, w.type);
    assert.ok(GLYPH_NAMES.includes(g), `${id}: ${g} is in the set`);
    assert.ok(!by.has(g), `${id} and ${by.get(g)} share ${g}`);
    by.set(g, id);
    assert.ok(!['hand-fist', 'swords', 'slice', 'hammer', 'flashlight', 'rocket', 'zap', 'spray-can', 'bow-arrow', 'flame'].includes(g), `${id}: ${g} is a stand-in`);
  }
  const guns = Object.values(WEAPONS).filter((w) => w.type === 'gun').map((w) => glyphOfWeapon(w.id, w.type));
  assert.ok(guns.length >= 10 && new Set(guns).size === guns.length, `the guns: ${guns}`);
  assert.deepEqual(['pistol', 'smg', 'rifle'].map((id) => glyphOfWeapon(id, 'gun')), ['pistol', 'smg', 'rifle']);
  // and different drawings, not one picture under three names
  const d = (n) => glyph(n).match(/<path d="([^"]+)"/)[1];
  assert.equal(new Set([...by.keys()].map(d)).size, by.size, 'every weapon glyph a drawing of its own');
  assert.equal(glyphOfWeapon(undefined, undefined), 'fist', 'bare hands');
  assert.equal(glyphOfWeapon('newgun', 'gun'), 'pistol', 'a weapon yet to come: its class');
});

// the owner, 11-06: "Not sure the infinity symbol is the right symbol either, needs more of an auto fire style symbol"
test('FIRE ON: three bullets (auto-fire), not infinity', () => {
  for (const l of ['FIRE ON', 'FIRE OFF']) { assert.equal(iconOf('firetog', l), 'auto-fire'); assert.notEqual(iconOf('firetog', l), 'infinity'); }
  assert.ok(!GLYPH_NAMES.includes('infinity'), 'infinity is gone from the set');
});

// the owner, 11-06: "UX still feels off on mobile portrait, like the buttons on the bottom right are really spread out
// far, like the fire in and off button is really far away": upright every right-hand button within NEAR of the aim
// stick (centre to centre, in units of a 390-wide phone: 300, so 316 px on the owner's 411 x 891 - it was 449 px),
// and FIRE ON beside the stick and FIRE
const NEAR = 300, BESIDE = 110;
test('upright: one tight cluster round the aim stick, FIRE ON beside the stick and FIRE', () => {
  const mid = (b) => [b.x + b.w / 2, b.y + b.h / 2], far = (a, b) => Math.hypot(mid(a)[0] - mid(b)[0], mid(a)[1] - mid(b)[1]);
  for (const [W, H, safe] of [[411, 891, {}], [390, 844, { t: 47, b: 34 }], [360, 780, {}], [430, 932, { t: 47, b: 34 }], [412, 892, { t: 36 }]]) {
    const g = slotGeometry(W, H, safe), s = Math.min(1.3, Math.max(0.86, W / 390)), tag = `${W}x${H}`;
    for (const [k, b] of Object.entries(g)) if (k !== 'stick') assert.ok(far(b, g.stick) <= NEAR * s, `${tag}: ${k} ${Math.round(far(b, g.stick))} px from the stick (${Math.round(NEAR * s)} at most)`);
    assert.ok(far(g.u4, g.stick) <= BESIDE * s && far(g.u4, g.fire) <= BESIDE * s, `${tag}: FIRE ON beside the stick and FIRE`);
  }
  // (on its side as it was: the switches' row along the top of the arc)
  const L = slotGeometry(844, 390);
  assert.ok(L.u4.y < L.c1.y && L.u4.y < L.wp.y, 'on its side FIRE ON stays in the switches\' row');
});

// a Firefighter on foot by the engine: FIRE sprays water, so it shows the hose (server/systems/firefighter.js hose)
test('the fire button shows the hose by your fire engine', () => {
  setHose(true);
  assert.equal(iconOf('fire', 'HIT'), 'hose'); assert.equal(iconOf('fire', 'FIRE'), 'hose');
  assert.notEqual(iconOf('throw', 'THROW'), 'hose', 'a crate in your hands: no hose (the server\'s neither)');
  assert.notEqual(iconOf('action', 'ACT'), 'hose');
  setHose(false); setMelee('fists', 'melee');
  assert.equal(iconOf('fire', 'HIT'), 'fist');
  assert.equal(FIRE.hose.len, HOSE_LEN, 'the page\'s length is the server\'s');
  const ts = read('client/touchslots.js');
  assert.match(ts, /const hose = setHose\(!inVeh && !air && !board && hoseNear\(S, me, VEHICLE_BY_INDEX\)\);/, 'set on foot each frame');
  assert.match(ts, /j\.k === 'Firefighter' && j\.veh/); assert.match(ts, /\.id !== 'firetruck'/); assert.match(ts, /<= HOSE_LEN \* 2/);
  assert.match(ts, /b\.dataset\.ic !== ic/, 'the button redrawn when its icon changes');
});
