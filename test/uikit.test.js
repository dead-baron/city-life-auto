// The UI kit as code (UI-9, the owner's UI concepts of 2026-11-03, docs/art-v2/targets/ui): UIK-00's colours, plates,
// buttons, controls and feedback in client/style.css; UIC-09's 24 x 24 pixel icons in client/touchicons.js, used by
// the HUD and the touch buttons; UIC-10's touch sizes; UIC-20's motion.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ICON_NAMES, grid, icon, iconOf } from '../client/touchicons.js';
import { GEO } from '../client/touchslots.js';
import { TOUCH_STATES } from '../shared/touchcontrols.js';

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const CSS = read('client/style.css'), HTML = read('index.html');
const root = /:root \{([\s\S]*?)\n\}/.exec(CSS)[1];

test('UIK-00 1: the swatches - the navy plate at 85%, the panel\'s gradient, gold, cream, dim, money, danger, info, heat, steel', () => {
  assert.match(root, /--plate: rgba\(15, 24, 48, \.85\);/, 'navy plate #0F1830 at 85%');
  assert.match(root, /--panel-bg: linear-gradient\(180deg, #15223f, #0d162d\);/, 'the panel #15223F -> #0D162D');
  for (const [k, v] of Object.entries({ gold: '#e2bd57', cream: '#f3ead2', dim: '#a6aec4', money: '#6cd06c', danger: '#ff6b5a', info: '#5ab0ff', heat: '#ffa63d', steel: '#4f86c6' })) assert.match(root, new RegExp(`--${k}: ${v};`), k);
  assert.match(root, /--plate-rim: var\(--gold\);/, 'the plates\' gold rim');
  assert.match(root, /--fs-1: 12px; --fs-2: 14px; --fs-3: 16px; --fs-4: 20px; --fs-5: 28px; --fs-6: 40px;/, 'UIK-00 2: the type scale');
});

test('UIK-00 3-6: plates, buttons in their states, the controls and the feedback are parts of the kit', () => {
  for (const sel of ['.plate', '.btn', '.btn-1', '.btn-d', '.rbtn', '.tab', '.toggle', '.slider', '.seg', '.field', '.check', '.drop', '.pbar', '.cdring', '.badge', '.pi24', '.toast', '.row'])
    assert.ok(new RegExp(`(^|[\\n,] ?)\\${sel}[ ,:{.]`).test(CSS), sel);
  // the states: hover / focus, pressed (92%), disabled (grey)
  assert.match(CSS, /\.btn:hover, \.sbtn:hover, \.btn:focus-visible \{/);
  assert.match(CSS, /\.btn:active, \.sbtn:active \{ transform: scale\(var\(--press\)\)/);
  assert.match(CSS, /\.btn\[disabled\], \.sbtn\[disabled\] \{ background: var\(--grey-d\); border-color: var\(--grey\)/);
  assert.match(CSS, /\.rbtn:active \{ transform: scale\(var\(--press\)\)/);
  assert.match(root, /--press: \.92;/, 'pressed: 92% (UIC-20 04)');
  assert.match(CSS, /\.rbtn > \.kchip \{ position: absolute; right: -7px; top: -7px;/, 'the key badge on the round button\'s corner (4E)');
  assert.match(CSS, /\.tab\.on, \.tab\[aria-selected=true\] \{ background: var\(--gold\); color: var\(--ink\)/, 'the tab you\'re on, gold (5A)');
  // the HUD wears them: the round buttons, the plates
  for (const id of ['b-phone', 'b-map', 'b-menu']) assert.match(HTML, new RegExp(`<button id="${id}" class="rbtn"`));
  assert.match(CSS, /#rclock, #hud-stat, #vchip, #job, \.hchip, #weapon, #hud-btns button, #b-dev, #stars, \.toast, #helpbox, #rob, #hints \{ background: var\(--plate\); border: 2px solid var\(--plate-rim\)/, 'one plate for all of the HUD');
});

// the icon sheet's (UIC-09) rows, by the names client/touchicons.js gives them
const SHEET = {
  navigation: ['phone', 'map', 'menu', 'bag', 'people', 'settings', 'close', 'back', 'chevron'],
  status: ['heart', 'shield', 'money', 'bank', 'star', 'sun', 'moon', 'rain', 'blood', 'burn', 'dirty', 'fresh'],
  actions: ['fire', 'hand', 'roll', 'reload', 'sprint', 'block', 'items', 'throw', 'climb', 'descend', 'horn', 'headlights',
    'car', 'getout', 'boat', 'horse', 'swim', 'fish', 'talk', 'buy', 'sell', 'rob', 'steal', 'repair'],
  apps: ['jobs', 'places', 'transit', 'feed', 'bounties', 'homes', 'skills', 'crew', 'radioapp', 'log', 'camera'],
  blips: ['you', 'friend', 'job', 'shop', 'atm', 'hospital', 'police', 'garage', 'home', 'gang', 'bathhouse', 'arcade', 'beach', 'fishing'],
};
test('UIC-09: every icon on the sheet, a 24 x 24 pixel picture with its dark outline, drawn crisp', () => {
  for (const [row, names] of Object.entries(SHEET)) for (const n of names) assert.ok(ICON_NAMES.includes(n), `${row}: ${n}`);
  for (const n of ICON_NAMES) {
    const g = grid(n);
    assert.equal(g.length, 24 * 24, n);
    const lit = g.filter((c) => c && c !== 'k').length, ink = g.filter((c) => c === 'k').length;
    assert.ok(lit >= 30, `${n}: ${lit} coloured pixels`);
    assert.ok(ink >= 20, `${n}: an outline`);
    // nothing coloured on the very edge without its outline cut off (the art keeps a pixel's margin)
    for (let i = 0; i < 24; i++) for (const j of [0, 23]) { assert.ok(!g[j * 24 + i] || g[j * 24 + i] === 'k' || n === 'bounties', `${n}: coloured at the edge (${i},${j})`); }
    assert.match(icon(n), /^<svg class="pi24" viewBox="0 0 24 24" shape-rendering="crispEdges"/);
  }
  assert.match(CSS, /\.pi24 \{ display: block; width: var\(--ic\); height: var\(--ic\);/);
});

test('the HUD and the touch buttons use the pixel icons', () => {
  const hud = HTML.slice(HTML.indexOf('<div id="hud"'), HTML.indexOf('<div id="interior"'));
  const used = [...hud.matchAll(/data-ic="([a-z0-9]+)"/g)].map((m) => m[1]);
  assert.ok(used.length >= 9, `${used.length} icons in the HUD's markup`);
  for (const n of used) assert.ok(ICON_NAMES.includes(n), `index.html's ${n}`);
  for (const n of ['handset', 'map', 'menu', 'heart', 'shield', 'bank', 'sun', 'aim']) assert.ok(used.includes(n), n);
  assert.doesNotMatch(hud.slice(hud.indexOf('<div id="hud-btns">'), hud.indexOf('<div id="hud-stat">')), /<svg/, 'no line icons left on the round buttons');
  assert.match(read('client/hud.js'), /paintIcons\(document\)/, 'the HUD fills them in');
  for (const st of Object.values(TOUCH_STATES)) for (const [a, label] of Object.values(st)) assert.ok(ICON_NAMES.includes(iconOf(a, label)), `${a} ${label}: ${iconOf(a, label)}`);
  assert.equal(iconOf('fire', 'FIRE'), 'aim', 'FIRE: the crosshair (UIC-10)');
  assert.equal(iconOf('action', 'ACT'), 'act', 'ACT: the hand');
});

test('UIC-10: FIRE 72 px, ACT 60, the secondary buttons 44, on a phone on its side and upright', () => {
  for (const g of [GEO.land, GEO.port]) {
    assert.equal(g.fire[2], 72); assert.equal(g.act[2], 60);
    for (const k of ['c1', 'c2', 'u1', 'u2', 'u3', 'u4']) assert.equal(g[k][2], 44, k);
  }
  assert.match(CSS, /#tbtns \[data-slot=fire\]:is\(:active, \.on\) \{ background: var\(--danger\);/, 'FIRE pressed: red');
  assert.match(CSS, /#tbtns \[data-slot=act\]:is\(:active, \.on\) \{ background: var\(--gold\); \}/, 'ACT pressed: gold');
  assert.match(CSS, /#b-cruiser\.cooling::before \{[^}]*conic-gradient\(var\(--gold\) calc\(var\(--cd, 0\) \* 1turn\)/, 'cooling: the ring');
  // the aim stick keeps its red ring where it was (the owner, 2026-11-03: the sticks' behaviour stays)
  assert.match(CSS, /#stick-r \.ring \{ position: absolute; inset: 6px; border-radius: var\(--r3\); border: 9px solid var\(--danger-t\); \}/);
});

test('UIC-20: the HUD\'s motion - the notes, the money, a hit, a press, the prompt', () => {
  const hud = read('client/hud.js');
  assert.match(CSS, /\.toast \{[^}]*animation: toastin var\(--t1\)/, 'a note slides in 8 px and fades in, 150 ms');
  assert.match(CSS, /@keyframes toastin \{ from \{ opacity: 0; transform: translateX\(-8px\); \} \}/);
  assert.match(hud, /\$\('toasts'\)\.prepend\(el\)/, 'the newest on top, pushing the older down');
  assert.match(hud, /countCash\(to, from\) \{/, 'the money counts up');
  assert.match(CSS, /#cash-up\.go \{ animation: cashup/, 'and the difference floats');
  assert.match(root, /--t-drain: 400ms;/); assert.match(CSS, /\.vbar \.lag \{[^}]*background: var\(--white\);[^}]*transition: width var\(--t-drain\)/, 'a hit: white, then drains');
  assert.match(CSS, /@keyframes prpop \{ from \{ opacity: 0; transform: scale\(\.9\); \} \}/, 'the prompt in at 90%');
  assert.match(CSS, /#helpbox \{[^}]*animation: prpop var\(--t-pop\)/);
  assert.match(hud, /promptDone\(pr\) \{/, 'and its tick');
});
