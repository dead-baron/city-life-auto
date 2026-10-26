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
  assert.match(root, /--r1: 4px; --r2: 10px; --r3: 999px;/, 'the radii');
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
  const bad = [...literals(CSS, 'style.css'), ...['client/director.js', 'client/devmenu.js', 'client/spectator.js', 'client/creator.js', 'client/deathscreen.js'].flatMap((f) => literals(ownCss(f), f))];
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
  const UI = ['main.js', 'hud.js', 'ridehud.js', 'skate.js', 'fishing.js', 'jobway.js', 'worldmap.js', 'deathscreen.js', 'interiors.js', 'spectator.js', 'devtp.js', 'devhomes.js', 'stargaze.js', 'tutorial.js', 'render/fx.js'];
  const bad = [];
  for (const f of UI) for (const m of read(`client/${f}`).matchAll(/\.font = ([`'][^`']*[`'])/g)) if (FONTS.test(m[1]) || !/CLA Pixel|Barlow Condensed|PIXEL/.test(m[1])) bad.push(`${f}: ${m[1]}`);
  for (const m of read('client/render/homeview.js').matchAll(/\.font = ([`'][^`']*[`'])/g)) if (/system-ui|Rubik|Anton/.test(m[1])) bad.push(`homeview.js: ${m[1]}`);
  assert.deepEqual(bad, [], bad.join('\n'));
});
