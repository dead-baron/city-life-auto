// The store badge and the medical emblem (wave A2 of the 11-03 concept audit, gap 3; the owner, 2026-10-18: "never the
// red cross" - a protected emblem). client/storeicons.js paints the badges art v2's shopMarks floats over the doors near
// you (client/art2/game/host.js); the clinic's is a white cross on green, the hospital's a red H on white; the badge
// hangs small under the door's lintel, never in the shop's sign.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { GLYPHS, STORE_ICON, CROSS_D, TILE_D, H_D } from '../client/storeicons.js';
import { TRADES, ICONS, rgbOf } from '../client/art2/signfont.js';
import { makeBuilding, buildingH } from '../client/art2/buildings.js';
import { badgeAt, BADGE } from '../client/art2/game/host.js';
import { TILE } from '../shared/constants.js';

// a 2D context that records what each glyph fills and strokes: [colour, path]
function recorder() {
  const out = [], path = (d) => ({ d: typeof d === 'string' ? d : d && d.d });
  globalThis.Path2D ||= class { constructor(d) { this.d = d; } };
  const g = { out, fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, fill(p) { out.push([this.fillStyle, p ? path(p).d : 'arc']); }, stroke(p) { out.push([this.strokeStyle, p ? path(p).d : 'arc']); },
    beginPath() {}, arc() {}, fillRect() { out.push([this.fillStyle, 'rect']); }, save() {}, restore() {}, translate() {}, rotate() {}, scale() {} };
  return g;
}
const isRed = (c) => { const [r, g, b] = rgbOf(c); return r > 170 && g < 110 && b < 110; };
const isGreen = (c) => { const [r, g, b] = rgbOf(c); return g > r + 40 && g > b + 20; };
const isWhite = (c) => { const [r, g, b] = rgbOf(c); return r > 225 && g > 225 && b > 215; };

test('no red cross anywhere: the clinic\'s badge a white cross on green, the hospital\'s a red H on white', () => {
  const C = recorder(); GLYPHS.cross(C);
  assert.ok(C.out.some(([c, d]) => d === TILE_D && isGreen(c)), 'the clinic badge: a green tile');
  assert.ok(C.out.some(([c, d]) => d === CROSS_D && isWhite(c)), 'the clinic badge: a white cross on it');
  const H = recorder(); GLYPHS.hosp(H);
  assert.ok(H.out.some(([c, d]) => d === TILE_D && isWhite(c)) && H.out.some(([c, d]) => d === H_D && isRed(c)), 'the hospital badge: a red H on white');
  // no glyph fills the cross in red, nor sets a red cross on white
  for (const [k, f] of Object.entries(GLYPHS)) {
    const R = recorder(); f(R);
    for (const [c, d] of R.out) assert.ok(!(d === CROSS_D && isRed(c)), `${k}: a red cross`);
  }
  assert.equal(STORE_ICON.hospital, 'cross', 'a clinic shows the cross; host.js shows a hospital the H');
  // the sign faces' icon tiles: the cross is never red ink, and never on white with red
  for (const [k, T] of Object.entries(TRADES)) if (T.icon === 'cross') { assert.ok(!isRed(T.tile[1]), `${k}: the cross's ink`); assert.ok(isGreen(T.tile[0]) || isGreen(T.tile[1]), `${k}: green`); }
  assert.ok(ICONS.hosp, 'the H tile');
  // and in the code: nothing paints a cross with the red of the palettes (a coarse guard over the client's sources)
  const files = [];
  const walk = (d) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (f.endsWith('.js')) files.push(p); } };
  walk(new URL('../client', import.meta.url).pathname);
  for (const f of files) {
    const src = readFileSync(f, 'utf8');
    for (const m of src.matchAll(/\bcross\w*\s*[:=]\s*[^\n]{0,80}/g)) assert.ok(!/C\.red\b|'#ff5a4e'|'#d8342a'|\[2[0-5]\d,\s*[0-6]\d,\s*[0-6]\d\]/.test(m[0]), `${f}: ${m[0].slice(0, 90)}`);
  }
});

test('the badge hangs under the door\'s lintel, smaller, and never in the shop\'s sign', () => {
  assert.ok(BADGE.size <= 20, 'smaller than the old 30 px badge');
  const B = badgeAt(100, 200), foot = 200 + TILE / 2;
  assert.ok(Math.abs((foot - BADGE.doorH) - (B.y - BADGE.size / 2)) <= 8, 'its top within a few px of the door\'s top');
  let n = 0;
  for (const text of ['NORTHGATE CLINIC', 'HARBOR PAWN', 'QUICK STOP', 'MESA SAVINGS & TRUST', 'BRIC-A-BRAC ANTIQUES & PAWN', 'TEAL COFFEE']) for (const w of [96, 160, 224]) for (const floors of [1, 2]) {
    const spec = { w, d: 48, seed: ++n, style: 'brick', parapet: 6, roof: 'flat', floors, shop: { kind: 'mart', door: n & 1 ? 'left' : 'right', open: true, sign: { text, face: 'civic', icon: 'cross', lit: true } } };
    const G = makeBuilding(spec), S = G.signBox;
    assert.ok(S, `${text}: a sign`);
    const ground = spec.d + buildingH(spec), top = ground - (foot - (B.y - BADGE.size / 2)) - 1, bot = ground - (foot - (B.y + BADGE.size / 2)) + 1;   // (its rows in the front's sprite, with its bob)
    assert.ok(top >= S.y + S.h, `${text} (${w} px, ${floors} floors): the badge (rows ${top}-${bot}) clear of the sign (rows ${S.y}-${S.y + S.h - 1})`);
    assert.ok(bot <= ground, 'above the pavement');
  }
});
