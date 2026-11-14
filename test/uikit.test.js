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
  for (const id of ['b-phone', 'b-map', 'b-chat', 'b-emo', 'b-menu']) assert.match(HTML, new RegExp(`<button id="${id}" class="rbtn"`));
  // (Direction A, the owner 2026-11-12: every panel navy, a near-black edge, a gold rim inside, a hard shadow, square)
  assert.match(CSS, /#rclock, #hud-stat, #vchip, #job, \.hchip, #weapon, #hud-btns button, #b-dev, #helpbox, #rob, #hints \{ background: var\(--pad-navy\); border: 2px solid var\(--pad-ink\); border-radius: 0; box-shadow: var\(--pn-rim\), var\(--pn-drop\); \}/, 'one panel for all of the HUD');
  assert.match(root, /--pad-navy: #141a33; --pad-ink: #0b1020; --pad-gold: #f6c945;/, 'its colours');
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
  assert.deepEqual([...row.matchAll(/data-(?:gl|ic)="([a-z0-9-]+)"/g)].map((m) => m[1]).slice(0, 5), ['smartphone', 'map', 'message-circle-more', 'smile', 'menu'], 'the system buttons: Lucide\'s phone, map, chat, the emotes and menu (11-05; chat in the row since Direction A, 11-12; the emotes on a desktop, 11-13)');
  assert.doesNotMatch(row, /<svg/, 'filled in by the page');
  assert.match(read('client/hud.js'), /paintIcons\(document\)/, 'the HUD fills them in');
});

// the touch buttons: Direction A (the owner's SNES pad, 2026-11-12) - four plain colored face buttons (FIRE red, ACT
// yellow, ROLL blue, the vehicle button green; a light top edge, a shaded bottom, no outline ring), a button whose action
// never changes a really simple symbol, one whose action depends on the moment its word; the context slots and the
// switches small navy discs with a gold rim and a word. (The line icons stay for the hint strips' kin, the bag and the
// weapon card.)
test('the touch buttons: see-through discs with a colored ring, plain symbols and words; the switches navy with a gold rim', () => {
  for (const st of Object.values(TOUCH_STATES)) for (const [a, label] of Object.values(st)) assert.ok(GLYPH_NAMES.includes(iconOf(a, label)), `${a} ${label}: ${iconOf(a, label)}`);
  assert.ok(GLYPH_STROKE >= 2 && GLYPH_STROKE <= 3, 'between Lucide\'s 2 and 3');
  for (const n of GLYPH_NAMES) {
    const g = glyph(n);
    assert.match(g, new RegExp(`^<svg class="pi24 gl" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${GLYPH_STROKE}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">`), n);
    const d = g.match(/<path class="h" d="([^"]+)"\/><path d="([^"]+)"\/>/);
    assert.ok(d && d[1] === d[2], `${n}: the line over its halo`);
  }
  for (const w of Object.values(WEAPONS)) assert.ok(GLYPH_NAMES.includes(glyphOfWeapon(w.id, w.type)), w.id);
  // the four face buttons (the owner, 11-12: smaller, see-through, the game's colors): a see-through navy disc, a 3 px
  // ring in the palette's own color; the switches navy with the gold rim
  assert.match(root, /--pad-fire: #e8434b; --pad-act: #f6c945; --pad-roll: #4aa8ff; --pad-car: #3ccf6e;/);
  assert.match(root, /--disc: rgba\(20, 26, 51, \.55\); --disc-on: rgba\(20, 26, 51, \.8\);/, 'see-through, darker pressed');
  for (const [slot, c] of [['fire', 'fire'], ['act', 'act'], ['roll', 'roll'], ['car', 'car']]) assert.match(CSS, new RegExp(`#tbtns \\[data-slot=${slot}\\] \\{ --acc: var\\(--pad-${c}\\); \\}`), slot);
  assert.match(CSS, /#tbtns button\.face \{ border: 3px solid var\(--acc\); background: var\(--disc\);/, 'the ring in its color, the disc see-through');
  assert.match(CSS, /#tbtns button \{[^}]*border: 2px solid var\(--pad-ink\); background: var\(--pad-navy\); box-shadow: var\(--pn-rim\)[^}]*font: 700 var\(--fs-w2\) var\(--pixel\);/, 'the switches: navy, the gold rim, a word in CLA Pixel');
  assert.match(CSS, /#tbtns \.w \{[^}]*font: 700 var\(--fs-w2\) var\(--pixel\); color: var\(--white\); text-shadow: 1px 0 0 var\(--pad-ink\), -1px 0 0 var\(--pad-ink\), 0 1px 0 var\(--pad-ink\), 0 -1px 0 var\(--pad-ink\)/, 'the words white with an even 1 px outline: centred');
  assert.match(CSS, /#tbtns button:active, #tbtns button\.on \{ transform: scale\(\.9\);/, 'pressed: 90%');
  assert.match(CSS, /#tbtns button\.pulse \{ outline: 3px solid var\(--pad-gold\);/, 'the action to take: a gold ring, the button keeps its color');
  // the symbols: plain 16 x 16 pictures, centred, drawn at 2x - no other art
  for (const n of ['cross', 'chev', 'enter', 'exit', 'shield']) {
    assert.match(CSS, new RegExp(`\\.s-${n} \\{ background-image: url\\(\\.\\./assets/ui/s-${n}\\.png\\); \\}`), n);
    const png = readFileSync(new URL(`../assets/ui/s-${n}.png`, import.meta.url));
    assert.equal(png.readUInt32BE(16), 16); assert.equal(png.readUInt32BE(20), 16, `${n}: 16 x 16`);
  }
  assert.match(CSS, /\.sym \{[^}]*width: 32px; height: 32px;[^}]*image-rendering: pixelated;/, 'at 2x, crisp');
  const tb = CSS.slice(CSS.indexOf('/* the face buttons (Direction A'), CSS.indexOf('/* left alone a while'));
  assert.ok(!/filter:/.test(tb), 'no filters');
  assert.match(HTML, /<div class="knob"><i class="ic" data-gl="crosshair"><\/i><\/div>/, 'the aim stick\'s crosshair');
  assert.match(HTML, /<i id="w-glyph" class="ic" aria-hidden="true"><\/i>/, 'the weapon card\'s silhouette');
  const ts = read('client/touchslots.js');
  assert.match(ts, /export const LONG_MS = 450;/); assert.match(ts, /tip\.textContent = n;/, 'a long press names the button');
});

test('the sizes: FIRE and ACT 64 px, ROLL and the vehicle button 52, the rest 48', () => {   // (the owner, 11-12: smaller)
  for (const g of [GEO.land, GEO.port]) {
    assert.equal(g.fire[2], 64); assert.equal(g.act[2], 64);
    assert.equal(g.roll[2], 52); assert.equal(g.car[2], 52);
    for (const k of ['c1', 'c2', 'u1', 'u2', 'u3', 'u4']) assert.equal(g[k][2], 48, k);
  }
  assert.match(CSS, /#tbtns button\.face:is\(:active, \.on\) \{ background: var\(--disc-on\); \}/, 'pressed: the disc darker');
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
