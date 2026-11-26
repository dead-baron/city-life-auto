// One UI system (the UI overhaul, phase UI-1, 2026-10-24): client/style.css holds the approved tokens - the colours,
// six type sizes, three radii, the spacing - and the parts (the panel and its head, the list row, the buttons, the
// chips, the toggle, the slider, the stepper, the tabs); every rule takes its colours, type sizes and radii from the
// tokens, never a literal. The two faces are the shipped CLA Pixel and Barlow Condensed: Rubik (never shipped), Anton
// (the old GTA look's), system-ui and monospace are gone from the UI, the canvas-drawn HUD text too. The panels that
// carry their own CSS (the cinematic panel, the debug menu, the free camera, the starting look, the knocked-out map)
// follow the same rules.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const CSS = read('client/style.css');

// the rule bodies, with the selectors (and the at-rules) they sit under; comments dropped
function rules(css) {
  css = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const out = [], stack = [];
  let last = 0;
  for (const m of css.matchAll(/[{}]/g)) {
    if (m[0] === '{') stack.push(css.slice(last, m.index).trim());
    else { const sel = stack.pop(), body = css.slice(last, m.index); if (body.trim()) out.push([[...stack, sel].join(' / '), body]); }
    last = m.index + 1;
  }
  return out;
}
const FONTS = /Rubik|Anton|system-ui|monospace|Impact/;
function literals(css, where) {
  const bad = [];
  for (const [sel, body] of rules(css)) {
    if (/^:root|@font-face|@keyframes/.test(sel.split(' / ').pop()) || /@keyframes/.test(sel)) {
      if (/@keyframes/.test(sel) && /#[0-9a-f]{3,8}\b|rgba?\(/i.test(body)) bad.push(`${where} ${sel}: a colour literal in a keyframe`);
      continue;
    }
    const b = body.replace(/url\([^)]*\)/g, '');
    if (/#[0-9a-f]{3,8}\b(?![\w-])/i.test(b) || /\b(rgba?|hsla?)\(/i.test(b)) bad.push(`${where} ${sel}: a colour literal`);
    for (const d of b.split(';')) {
      const i = d.indexOf(':'), p = d.slice(0, i).trim(), v = d.slice(i + 1).trim();
      if (i < 0 || p.startsWith('--')) continue;
      if (p === 'font-size' && !/^(var|calc|clamp)\(|^inherit$/.test(v)) bad.push(`${where} ${sel}: font-size ${v}`);
      if (p === 'font' && !/var\(--fs|^inherit$/.test(v)) bad.push(`${where} ${sel}: font ${v}`);
      if (p === 'border-radius' && !/^((var\([^)]*\)|0)\s*)+$/.test(v)) bad.push(`${where} ${sel}: border-radius ${v}`);
      if (/^font(-family)?$/.test(p) && FONTS.test(v)) bad.push(`${where} ${sel}: ${v}`);
    }
  }
  return bad;
}
// the CSS a lazily loaded panel carries itself (its first template string of rules)
const ownCss = (f) => { const s = read(f), m = /(?:const (?:START_)?CSS = `|css\.textContent = `)([\s\S]*?)`;\n/.exec(s); assert.ok(m, `${f} carries its CSS`); return m[1].replace(/\$\{[^}]*\}/g, 'x'); };

test('the tokens: the approved colours, six type sizes, three radii, the spacing and the motion', () => {
  const root = /:root \{([\s\S]*?)\n\}/.exec(CSS)[1];
  const want = { ink: '#070b16', navy: '#0f1830', navy2: '#172447', navy3: '#22325e', gold: '#e2bd57', cream: '#f3ead2', dim: '#a6aec4', money: '#6cd06c', danger: '#ff6b5a', info: '#5ab0ff', heat: '#ffa63d' };
  for (const [k, v] of Object.entries(want)) assert.match(root, new RegExp(`--${k}: ${v};`), `--${k}`);
  assert.match(root, /--fs-1: 12px; --fs-2: 14px; --fs-3: 16px; --fs-4: 20px; --fs-5: 28px; --fs-6: 40px;/, 'the type scale');
  assert.match(CSS, /body\.touch \{ --fs-1: 14px;/, '14 the smallest on a phone');
  assert.match(root, /--r1: 0px; --r2: 0px; --r3: 999px; --r4: 0px;/, 'the radii: every corner hard, a full round kept (look C)');
  assert.match(root, /--s1: 4px; --s2: 8px; --s3: 12px; --s4: 16px; --s5: 24px;/, 'the spacing');
  assert.match(root, /--t1: 150ms; --t2: 200ms; --t3: 250ms;/, 'short eased motion');
  assert.match(CSS, /prefers-reduced-motion: reduce/, 'and none for those who ask for less');
});

test('the parts are there: panel and head, list row, buttons, chips, toggle, slider, stepper, tabs, coming and going', () => {
  for (const sel of ['.panel', '.mhead', '.row', '.btn', '.btn-1', '.btn-x', '.ibtn', '.x', '.chip', '.kchip', '.toggle', '.slider', '.stepper', '.tabs', '.tab', '.seg', '.field', '.foldable', '.enter', '.out']) {
    assert.ok(new RegExp(`(^|[\\n,] ?)\\${sel}[ ,:{]`).test(CSS), sel);
  }
  assert.match(CSS, /\.panel, \.ui-panel \{[^}]*border: 2px solid var\(--gold\)/, 'a 2 px gold rim on every panel');
  assert.match(CSS, /\.btn-1 \{[^}]*background: var\(--gold\); color: var\(--ink\)/, 'primary: gold, ink words');
  assert.match(CSS, /\.btn-x, #s-fresh \{[^}]*color: var\(--danger\); border-color: var\(--danger\)/, 'destructive: a red outline');
  // the notes fade out on their own (hud.js toast) rather than vanishing
  assert.match(read('client/hud.js'), /el\.classList\.add\('out'\); setTimeout\(\(\) => el\.remove\(\), 260\)/);
});

test('no literal colours, type sizes or radii in the rules, here or in the panels that carry their own CSS', () => {
  const bad = [...literals(CSS, 'style.css'), ...['client/director.js', 'client/devmenu.js', 'client/spectator.js', 'client/creator.js', 'client/deathscreen.js', 'client/whatsnext.js', 'client/chat.js'].flatMap((f) => literals(ownCss(f), f))];
  assert.deepEqual(bad, [], bad.slice(0, 20).join('\n'));
});

test('two faces, both shipped: CLA Pixel and Barlow Condensed - no Rubik, Anton, system-ui or monospace in the UI', () => {
  const faces = [...CSS.matchAll(/@font-face \{ font-family: "([^"]+)"; src: url\("\.\.\/([^"]+)"\)/g)];
  assert.deepEqual([...new Set(faces.map((m) => m[1]))].sort(), ['Barlow Condensed', 'CLA Pixel']);
  for (const [, , f] of faces) assert.ok(existsSync(new URL(`../${f}`, import.meta.url)), f);
  const html = read('index.html');
  assert.doesNotMatch(html, /Anton|Rubik/, 'index.html preloads neither');
  assert.doesNotMatch(CSS, FONTS);
  // canvas text over the game (the HUD, the map, the panels, notes in the world); the art's own painted signs and the
  // arcade cabinets' screens keep their pixels
  const UI = ['main.js', 'hud.js', 'ridehud.js', 'skate.js', 'fishing.js', 'jobway.js', 'worldmap.js', 'deathscreen.js', 'interiors.js', 'spectator.js', 'devtp.js', 'devhomes.js', 'stargaze.js', 'render/fx.js'];
  const bad = [];
  for (const f of UI) for (const m of read(`client/${f}`).matchAll(/\.font = ([`'][^`']*[`'])/g)) if (FONTS.test(m[1]) || !/CLA Pixel|Barlow Condensed|PIXEL/.test(m[1])) bad.push(`${f}: ${m[1]}`);
  for (const m of read('client/render/homeview.js').matchAll(/\.font = ([`'][^`']*[`'])/g)) if (/system-ui|Rubik|Anton/.test(m[1])) bad.push(`homeview.js: ${m[1]}`);
  assert.deepEqual(bad, [], bad.join('\n'));
});

test('menus in the pixel font: the body face is CLA Pixel (Regular under 700, Bold from it); the gate and the account panel on UI v2 classes, no inline styles (pre-beta quick wins)', () => {
  assert.match(CSS, /--ui: "CLA Pixel", "Barlow Condensed", sans-serif;/, 'the page default and every menu');
  assert.match(CSS, /CLAPixel-Regular\.woff"\) format\("woff"\); font-weight: 100 600;/);
  assert.match(CSS, /CLAPixel-Bold\.woff"\) format\("woff"\); font-weight: 700 900;/);
  assert.doesNotMatch(read('index.html'), /preload" href="assets\/fonts\/Barlow/, 'Barlow only a fallback: not preloaded');
  const acc = read('client/account.js');
  assert.deepEqual([...acc.matchAll(/style="([^"]*)"/g)].map((m) => m[1]), ['flex:none'], 'only the Google mark\'s own');
  assert.doesNotMatch(acc, /system-ui|#3a7bd5|#1b1e24/, 'no app look');
  for (const c of ['.acc-ov', '.acc-box', '.acc-btn', '.acc-go', '.acc-inp', '.acc-tab']) assert.ok(CSS.includes(c + ' '), c);
  assert.match(CSS, /\.acc-ov \.acc-box \{ max-height: calc\(100dvh/, 'scrolls inside a phone on its side, never cut');
});

test('the starting looks point at a screen that exists, and no white browser scrollbar (pre-beta quick wins)', () => {
  const cr = read('client/creator.js');
  assert.doesNotMatch(cr, /Appearance\)/, 'no "menu (Appearance)" - there is none');
  assert.match(cr, /CHARACTER on the title screen/);
  assert.match(CSS, /\* \{ scrollbar-width: thin; scrollbar-color: var\(--gold-a\) var\(--pad-ink\); \}/);
  assert.match(CSS, /::-webkit-scrollbar \{[^}]*background: var\(--pad-ink\)/);
});

test('touch: 44 px targets for chat, the emote tabs and What\'s next; chat and the emotes over the move stick on a 360-px phone upright (pre-beta quick wins)', () => {
  assert.match(CSS, /\.touch :is\(\.cht-tab, \.cht-chip, \.emo-tab, \.cs-list \.srow \.btn, \.cm-rqb \.btn, \.cht-undo \.btn, \.wn-goal button, \.wn-ssn button\) \{ min-height: var\(--tap\); \}/);
  assert.match(CSS, /\.touch \.wn-card \.skip \{[^}]*width: var\(--tap\); height: var\(--tap\); \}/);
  assert.match(CSS, /@media \(max-width: 379px\) \{\s*body\.portrait\.touch #b-talk, body\.portrait\.touch #b-emote \{ bottom: calc\(max\(84px, calc\(env\(safe-area-inset-bottom\) \+ 66px\)\) \+ 70px\); \}/);
});

// ---- look C (the owner, 11-26, of A today / B hard frames / C hard frames and pixel icons: "I think C looks good for
// the UI"): hard corners, hard shadows, flat fills, pixel icons in the menus - held over every rule of the sheet and of
// the panels that carry their own CSS, so a screen that isn't in anyone's screenshots follows it too.
// What may still be soft, each with its reason: light over the game's own picture (a scrim, a vignette), a picture of a
// lit thing (the title's neon sign, the arrival board's LEDs, an arcade cabinet), a shape cut with a mask.
const SOFT_SHADOW = [
  [/^#logo > \.lg > img$/, 'the title\'s neon sign: a picture of a lit sign, its glow is its light'],
  [/^#arcade \.arc-frame$/, 'an arcade cabinet\'s glow: what the thing is, not the UI'],
  [/^\.arr-led$/, 'the arrival board\'s LEDs: a picture of a lit board'],
];
const GRADIENTS = [
  // flat or hard-stopped: a wash, a knob, a tick, an arrow, a bar's lit edge, dashes, stripes, a cooldown's pie
  [/^:root$/, 'the tokens: --pick a flat wash laid as a layer, --cab an arcade cabinet'],
  [/^\.toggle|^\.check:checked$|^\.drop$/, 'a switch\'s square knob, a tick, a select\'s arrow: flat shapes'],
  [/\.pbar > i|\.rob-bar > i/, 'a bar: flat, a two-pixel lit top edge'],
  [/^\.cdring::before$|^#tbtns :is\(/, 'a cooldown ring: a pie with a hard edge, cut round by its mask'],
  [/^\.vbar::after$|^\.lg \.ln\.(rail|ferry)$|^#m-board b\.card\.back$/, 'ticks, dashes, a card back\'s stripes: hard stops'],
  [/^#trainbar\.fight #tb-fill$|^\.pz-row\.counting$|^\.ph-bat$|^\.bag-blade \.sw$|^#wpick \.wp-box\.ring$|^#creator \.cc-ring$/, 'steps with hard stops'],
  // light over the game's own picture, and pictures
  [/^#wpick\.ringed$|^#wheel$|^#wwheel$|^#menu$|^#jobcard$|^#death::before$|^\.emo-rad$/, 'a scrim or a vignette over the world: light, not a frame'],
  [/#title$|^\.pz-head$/, 'the title\'s and the pause card\'s sky: a picture'],
  [/^\.cue-down$|^\.cht-chips$/, 'a scrolling list\'s edge, faded by a mask'],
  [/^#d-ring$|^\.cine-dial$/, 'a countdown\'s pie and a dial: hard stops'],
];
function softRules(css, where) {
  const bad = [], layers = (v) => { const o = []; let d = 0, cur = ''; for (const ch of v) { if (ch === '(') d++; if (ch === ')') d--; if (ch === ',' && d === 0) { o.push(cur); cur = ''; } else cur += ch; } o.push(cur); return o; };
  const blurOf = (sh) => { const n = sh.replace(/drop-shadow\(/g, '').replace(/(rgba?|var|hsla?)\([^()]*\)/g, '').replace(/[()]/g, ' ').replace('inset', '').trim().split(/\s+/).filter((q) => /^-?[\d.]+(px|cqw|em)?$/.test(q)).map(parseFloat); return n.length >= 3 ? n[2] : 0; };
  for (const [sel0, body] of rules(css)) {
    const sel = sel0.split(' / ').pop(), frame = /@keyframes/.test(sel0);
    for (const d of body.split(';')) {
      const i = d.indexOf(':'), p = d.slice(0, i).trim(), v = d.slice(i + 1).trim();
      if (i < 0) continue;
      if (p === 'box-shadow' || p === 'text-shadow' || p === 'filter' || (/^:root/.test(sel) && /^--(shadow|plate-sh|lift|drop|halo|halo-s|ring-\w+|btn-lo|pn-drop|pn-rim)$/.test(p))) {
        if (p === 'filter' && !/drop-shadow|blur\(/.test(v)) continue;
        if (/\bblur\(/.test(v)) bad.push(`${where} ${sel}: ${p} blurs`);
        for (const sh of (p === 'filter' ? v.split(/\)\s+(?=drop-shadow)/) : layers(v))) if (blurOf(sh) > 0 && !SOFT_SHADOW.some(([re]) => re.test(sel))) bad.push(`${where} ${sel0}: a blurred shadow - ${p}: ${sh.trim()}`);
      }
      if (/gradient\(/.test(v) && !/mask/.test(p) && !frame && !GRADIENTS.some(([re]) => re.test(sel))) bad.push(`${where} ${sel}: a gradient fill - ${p}: ${v.slice(0, 70)}`);
    }
  }
  return bad;
}
const OWN_CSS = ['client/director.js', 'client/devmenu.js', 'client/spectator.js', 'client/creator.js', 'client/deathscreen.js', 'client/whatsnext.js', 'client/chat.js'];

test('look C: no blurred shadow and no soft fill in any rule, here or in the panels that carry their own CSS', () => {
  const bad = [...softRules(CSS, 'style.css'), ...OWN_CSS.flatMap((f) => softRules(ownCss(f), f))];
  assert.deepEqual(bad, [], bad.slice(0, 12).join('\n'));
  // the rule finds what it is for
  assert.equal(softRules('.a { box-shadow: 0 4px 14px var(--ink); }', 't').length, 1);
  assert.equal(softRules('.a { box-shadow: 0 0 0 2px var(--ink), inset 0 -3px 0 var(--ink); text-shadow: var(--halo); }', 't').length, 0);
  assert.equal(softRules('.a { background: linear-gradient(180deg, var(--navy2), var(--navy)); }', 't').length, 1);
  assert.equal(softRules('.a { filter: drop-shadow(0 4px 0 var(--ink)) brightness(1.1); }', 't').length, 0);
  assert.equal(softRules('.a { filter: drop-shadow(0 4px 9px var(--ink)); }', 't').length, 1);
  // every allowance is still in use (one that matches nothing has outlived its reason)
  const sels = [...rules(CSS), ...OWN_CSS.flatMap((f) => rules(ownCss(f)))].map(([s]) => s.split(' / ').pop());
  for (const [re, why] of [...SOFT_SHADOW, ...GRADIENTS]) assert.ok(sels.some((s) => re.test(s)), `${re}: ${why}`);
});

test('look C: the frames - notched panels and buttons, rings drawn inside a notched box, a square switch', () => {
  const root = /:root \{([\s\S]*?)\n\}/.exec(CSS)[1];
  assert.match(root, /--notch2: polygon\(0 2px, 2px 2px, 2px 0, /); assert.match(root, /--notch4: polygon\(0 4px, 4px 4px, 4px 0, /);
  assert.match(root, /--shadow: 0 0 0 2px var\(--ink\), 0 6px 0 /, 'a hard drop'); assert.match(root, /--plate-sh: 0 4px 0 /);
  assert.match(CSS, /\.panel, \.ui-panel, \.hub-frame \{ border-width: 4px; clip-path: var\(--notch4\); \}/);
  assert.match(CSS, /\n\.btn, \.sbtn, \.chip, [^{]*\{ clip-path: var\(--notch2\); \}/);
  // a notched box is cut to its shape: what it shows on hover or focus is inside it
  const notched = /\n(\.btn, \.sbtn, \.chip, [^{]*)\{ clip-path: var\(--notch2\); \}/.exec(CSS)[1].split(',').map((q) => q.trim());
  assert.ok(notched.includes('.btn') && notched.includes('.chip') && notched.includes('.bag-cell'));
  assert.match(CSS, /\.btn:hover, \.sbtn:hover, \.btn:focus-visible, \.btn-d:hover \{ box-shadow: var\(--ring-in\); \}/);
  assert.match(root, /--ring-in: inset 0 0 0 2px var\(--cream\);/);
  assert.match(CSS, /\.toggle, [^{]*\{[^}]*border-radius: var\(--r1\);[^}]*linear-gradient\(var\(--dim\), var\(--dim\)\) no-repeat 5px 50% \/ 20px 20px/, 'a square switch, a square knob');
  assert.match(CSS, /body\.touch #hub\[data-tab=phone\] \.hub-frame \{[^}]*clip-path: none; \}/, 'the phone full-screen on a phone: no rim, no notch');
});

test('look C: every glyph has its pixel form on a 12 grid; the menus show it, the buttons over the street the line', async () => {
  const T = await import('../client/touchicons.js');
  await import('../client/bag.js').catch(() => {});
  assert.ok(T.GLYPH_NAMES.length >= 150, `the family (${T.GLYPH_NAMES.length})`);
  const seen = new Map();
  for (const n of T.GLYPH_NAMES) {
    const hex = T.glyphPx(n);
    assert.match(hex || '', /^[0-9a-f]{36}$/, `${n}: 12 rows of 12 bits`);
    let on = 0, rows = 0, cols = 0;
    for (let y = 0; y < 12; y++) { const r = parseInt(hex.substr(y * 3, 3), 16); if (r) rows++; cols |= r; for (let x = 0; x < 12; x++) on += (r >> x) & 1; }
    assert.ok(on >= 5 && on <= 110, `${n}: drawn, and not a block (${on} of 144)`);
    assert.ok(rows >= 3 && cols.toString(2).replace(/0/g, '').length >= 3, `${n}: fills its box (${rows} rows)`);
    if (seen.has(hex)) assert.fail(`${n} and ${seen.get(hex)}: one picture under two names`);
    seen.set(hex, n);
    const g = T.glyph(n);
    assert.match(g, /<path class="ln" d="[^"]+"\/><path class="px" fill="currentColor" stroke="none" shape-rendering="crispEdges" d="(M\d+ \d+h\d+v2h-\d+z)+"\/><\/svg>$/, n);
    assert.ok(!/nopx/.test(g));
  }
  // a row's run is one piece, two units to a pixel
  assert.equal(T.pxPath('fff' + '000'.repeat(10) + '801'), 'M0 0h24v2h-24zM0 22h2v2h-2zM22 22h2v2h-2z');
  assert.match(CSS, /\.gl \.px \{ display: none; \}\n\.gl:not\(\.nopx\) \.ln \{ display: none; \}\n\.gl:not\(\.nopx\) \.px \{ display: inline; \}\n:is\(#hud, #touch, #wheel\) \.gl \.ln \{ display: inline; \}\n:is\(#hud, #touch, #wheel\) \.gl \.px \{ display: none; \}/);
  // a pixel icon is shown at whole pixels to a cell: every size the sheet gives a menu's glyph is a multiple of 12
  for (const m of CSS.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]*\.gl) \{ width: (\d+)px; height: (\d+)px;/g)) { assert.equal(+m[2] % 12, 0, `${m[1].trim()}: ${m[2]} px`); assert.equal(m[2], m[3]); }
});

