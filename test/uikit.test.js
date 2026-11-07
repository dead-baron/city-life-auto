// The UI kit as code (UI-9, the owner's UI concepts of 2026-11-03, docs/art-v2/targets/ui): UIK-00's colours, plates,
// buttons, controls and feedback in client/style.css; UIC-09's 24 x 24 pixel icons in client/touchicons.js, used by
// the HUD and the touch buttons; UIC-10's touch sizes; UIC-20's motion.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ICON_NAMES, grid, icon, iconOf, GLYPH_NAMES, GLYPH_STROKE, glyph, glyphOfWeapon } from '../client/touchicons.js';
import { WEAPONS } from '../shared/items.js';
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

test('the HUD\'s plates use the pixel icons, its round buttons the line icons', () => {
  const hud = HTML.slice(HTML.indexOf('<div id="hud"'), HTML.indexOf('<div id="interior"'));
  const used = [...hud.matchAll(/data-ic="([a-z0-9]+)"/g)].map((m) => m[1]);
  assert.ok(used.length >= 5, `${used.length} icons in the HUD's markup`);
  for (const n of used) assert.ok(ICON_NAMES.includes(n), `index.html's ${n}`);
  for (const n of ['heart', 'shield', 'bank', 'sun']) assert.ok(used.includes(n), n);
  const lines = [...HTML.matchAll(/data-gl="([a-z0-9-]+)"/g)].map((m) => m[1]);
  for (const n of lines) assert.ok(GLYPH_NAMES.includes(n), `index.html's line icon ${n}`);
  const row = hud.slice(hud.indexOf('<div id="hud-btns">'), hud.indexOf('<div id="hud-stat">'));
  assert.deepEqual([...row.matchAll(/data-(?:gl|ic)="([a-z0-9-]+)"/g)].map((m) => m[1]).slice(0, 3), ['smartphone', 'map', 'menu'], 'the round buttons: Lucide\'s phone, map and menu (11-05)');
  assert.doesNotMatch(row, /<svg/, 'filled in by the page');
  assert.match(read('client/hud.js'), /paintIcons\(document\)/, 'the HUD fills them in');
});

// the touch buttons (the owner, 11-03: "simplified UI icons"; 11-05: "more generic and more professional and clean and
// polished"): one line-icon family, Lucide's - vector paths on the 24 grid, one round stroke (GLYPH_STROKE), currentColor
// - one container (a dark disc with a hairline), the state the only accent, two sizes on arcs round the aim stick
test('the touch buttons: one line icon for every action and label a slot holds, the weapon as its class', () => {
  for (const st of Object.values(TOUCH_STATES)) for (const [a, label] of Object.values(st)) assert.ok(GLYPH_NAMES.includes(iconOf(a, label)), `${a} ${label}: ${iconOf(a, label)}`);
  assert.equal(iconOf('fire', 'HIT'), 'fist'); assert.equal(iconOf('fire', 'FIRE'), 'target'); assert.equal(iconOf('action', 'ACT'), 'circle-dot');
  assert.equal(iconOf('vehicle', 'CAR'), 'car-front'); assert.equal(iconOf('dive', 'ROLL'), 'roll'); assert.equal(iconOf('block', 'BLOCK'), 'shield'); assert.equal(iconOf('use', 'ITEMS'), 'backpack');
  assert.equal(iconOf('reload', 'RELOAD'), 'rotate-cw'); assert.equal(iconOf('cruiser', 'COP CAR'), 'siren'); assert.equal(iconOf('horn', 'SIREN'), 'siren'); assert.equal(iconOf('stick', 'AIM'), 'crosshair');
  assert.ok(GLYPH_STROKE >= 2 && GLYPH_STROKE <= 3, 'between Lucide\'s 2 and 3');
  for (const n of GLYPH_NAMES) {
    const g = glyph(n);
    assert.match(g, new RegExp(`^<svg class="pi24 gl" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${GLYPH_STROKE}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">`), n);
    assert.ok(!/fill="#|stroke="#|<image|<rect/.test(g), `${n}: one color, no bitmaps`);
    const d = g.match(/<path class="h" d="([^"]+)"\/><path d="([^"]+)"\/>/);
    assert.ok(d && d[1] === d[2], `${n}: the line over its halo`);
    assert.ok(d[2].match(/-?\d*\.?\d+/g).length > 4 && !/NaN/.test(d[2]), n);
  }
  assert.match(glyph('backpack', 40), /width="40" height="40"/);
  for (const w of Object.values(WEAPONS)) assert.ok(GLYPH_NAMES.includes(glyphOfWeapon(w.id, w.type)), w.id);
  assert.equal(glyphOfWeapon('fists', 'melee'), 'fist'); assert.equal(glyphOfWeapon('pistol', 'gun'), 'pistol'); assert.equal(glyphOfWeapon('rifle', 'gun'), 'rifle');
  assert.equal(glyphOfWeapon('knife', 'melee'), 'knife'); assert.equal(glyphOfWeapon('bat', 'melee'), 'bat'); assert.equal(glyphOfWeapon('grenade', 'grenade'), 'grenade'); assert.equal(glyphOfWeapon('bow', 'bow'), 'bow');
  // one container: the disc and its hairline; the state the only accent
  assert.match(CSS, /#tbtns button \{[^}]*border: 1px solid var\(--hair\); background: var\(--disc\);[^}]*color: var\(--cream\);/);
  assert.match(CSS, /#tbtns \[data-slot=fire\] \{ background: var\(--fire-disc\);/, 'FIRE: the red disc');
  assert.match(CSS, /#tbtns button\.pulse \{ background: var\(--act-disc\);[^}]*color: var\(--ink\);/, 'the action to take: the gold disc, the glyph ink');
  assert.match(CSS, /#tbtns button:active, #tbtns button\.on \{ transform: scale\(\.9\);/, 'pressed: 90%');
  assert.match(CSS, /#tbtns button:is\(\[disabled\], \.dis\) \.pi24 \{ opacity: \.4; \}/, 'disabled: the glyph at 40%');
  const tb = CSS.slice(CSS.indexOf('/* the touch buttons (the owner, 11-03: "cleaner'), CSS.indexOf('/* left alone a while'));
  assert.ok(!/filter:|var\(--gold\)|var\(--plate-rim\)/.test(tb), 'no gold rims at rest, no filters on a glyph');
  assert.match(HTML, /<div class="knob"><i class="ic" data-gl="crosshair"><\/i><\/div>/, 'the aim stick\'s crosshair');
  assert.match(HTML, /<i id="w-glyph" class="ic" aria-hidden="true"><\/i>/, 'the weapon card\'s silhouette');
  const ts = read('client/touchslots.js');
  assert.match(ts, /export const LONG_MS = 450;/); assert.match(ts, /tip\.textContent = n;/, 'a long press names the button');
});

test('two sizes: FIRE and ACT 72 px, every other button 52, on a phone on its side and upright', () => {
  for (const g of [GEO.land, GEO.port]) {
    assert.equal(g.fire[2], 72); assert.equal(g.act[2], 72);
    for (const k of ['roll', 'car', 'c1', 'c2', 'u1', 'u2', 'u3', 'u4']) assert.equal(g[k][2], 52, k);
  }
  assert.match(CSS, /#tbtns \[data-slot=fire\]:is\(:active, \.on\) \{ background: var\(--fire-hi\); \}/, 'FIRE pressed: brighter');
  assert.match(CSS, /:is\(\[data-slot=fire\]\.cooling, #b-cruiser\.cooling\)::before \{[^}]*conic-gradient\(var\(--cd-c, var\(--act-disc\)\) calc\(var\(--cd, 0\) \* 1turn\)/, 'cooling: the ring');
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
