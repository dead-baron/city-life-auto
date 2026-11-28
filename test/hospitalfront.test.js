// A hospital's front (the owner, 11-22, N20: "the design of the hospital (and maybe all of them) is off. It looks like an
// apartment building from the outside. The front of the hospital is one long glowing side of the building and it
// glows so hard that it washes out whatever the name/text is"; the concept SC2-D). Every building of the hospital kind
// - the six hospitals and the clinics built like them - gets: pale precast panels (no stained concrete), ward windows
// in ribbons (three lights in a slim metal frame, blinds, no flower box, no curtain, no cat), a glazed lobby band on
// the ground floor, a glazed stair tower with the emblem at its head where there is room beside the doors, the cool
// even light of a ward after dark, and a red door light that no longer floods the front.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeBuilding } from '../client/art2/buildings.js';

const F_GLASS = 64;
const W = 576, base = { w: W, d: 96, floors: 4, style: 'concrete', wallColor: '#e4e2da', parapet: 6, seed: 5, night: 1, glowOnly: true, doors: [{ x: 263, w: 50, kind: 'door', open: true, h: 48 }], windows: [42, 72, 102, 132, 162, 192, 372, 402, 432, 462, 492, 522], plaques: [] };
const flat = makeBuilding({ ...base }), ward = makeBuilding({ ...base, win: 'ward', panels: true, stair: { x: 8, w: 26 }, cross: { x: 10, v: 80, top: true, s: 22, k: 'hospital' } });
const front = (G) => { const o = []; for (let y = G.h - 4 * 56; y < G.h; y++) for (let x = 0; x < G.w; x++) o.push(y * G.w + x); return o; };
// (the upper floors, clear of the stair tower and its emblem: the wards)
const wards = (G) => { const o = []; for (let y = G.h - 4 * 56; y < G.h - 62; y++) for (let x = 40; x < G.w; x++) o.push(y * G.w + x); return o; };

test('ward windows: cool, calm light after dark - an apartment\'s sashes glow warm and twice as strong', () => {
  const lit = (G) => { let n = 0, warm = 0, max = 0; for (const i of wards(G)) { const a = G.emi[i * 4 + 3]; if (a < 6) continue; if (G.emi[i * 4] === 212 && G.emi[i * 4 + 1] === 40) continue; n++; if (G.emi[i * 4] > G.emi[i * 4 + 2] + 30) warm++; max = Math.max(max, a); } return { n, warm, max }; };
  const a = lit(flat), b = lit(ward);
  assert.ok(a.warm > a.n * 0.5 && a.max >= 150, `the sashes: mostly warm, strong (${JSON.stringify(a)})`);
  assert.ok(b.n > a.n, `more glass lit (${b.n} px against ${a.n})`);
  assert.equal(b.warm, 0, 'no warm window on a ward');
  assert.ok(b.max <= 24, `a pale light blooms to white at a fraction of a sash's strength: 78-104 of 255 was a row of white blobs in the running game, 14-20 a pale blue with the frames showing (the strongest ${b.max})`);
});

test('no flower box, curtain or cat in a ward window; the wall clean panels', () => {
  const cols = (G) => { let red = 0, leaf = 0, dark = 0, n = 0; for (const i of wards(G)) { const r = G.col[i * 4], g = G.col[i * 4 + 1], b = G.col[i * 4 + 2]; n++; if (r > 170 && g < 130 && b < 130) red++; if (g > r + 25 && g > b + 25) leaf++; if (!(G.flag[i] & F_GLASS) && r + g + b < 330) dark++; } return { red, leaf, dark: dark / n }; };
  const a = cols(flat), b = cols(ward);
  assert.ok(a.leaf > 40 && a.red > 40, `the apartment front has its boxes and curtains (${JSON.stringify(a)})`);
  assert.ok(b.leaf === 0, `no plant on a ward's sill (${b.leaf})`);
  assert.equal(b.red, 0, `no curtain (${b.red} px of red)`);
  assert.ok(b.dark < a.dark * 0.5, `the wall clean: ${(b.dark * 100).toFixed(1)}% dark against ${(a.dark * 100).toFixed(1)}%`);
});

test('a glazed stair tower up the front with the emblem at its head; a lobby band on the ground floor', () => {
  let glass = 0, n = 0; for (let y = ward.h - 4 * 56 + 30; y < ward.h - 70; y++) for (let x = 10; x < 32; x++) { n++; if (ward.flag[y * ward.w + x] & F_GLASS) glass++; }
  assert.ok(glass > n * 0.6, `the strip is glass (${glass} of ${n})`);
  let top = Infinity; for (const i of front(ward)) if (ward.col[i * 4] === 212 && ward.col[i * 4 + 1] === 40 && ward.col[i * 4 + 2] === 44) top = Math.min(top, Math.floor(i / ward.w));
  assert.ok(top < ward.h - 4 * 56 + 40, `the H at the tower's head (row ${top - (ward.h - 4 * 56)} of the front)`);
  const groundGlass = (G) => { let g = 0; for (let y = G.h - 46; y < G.h - 16; y++) for (let x = 0; x < G.w; x++) if (G.flag[y * G.w + x] & F_GLASS) g++; return g; };
  assert.ok(groundGlass(ward) > groundGlass(flat) * 1.4, `the lobby glazed: ${groundGlass(ward)} px of glass against ${groundGlass(flat)}`);
});

test('in a district\'s own stone, a hospital keeps its sashes but plain: blinds or nothing, a cool light, no box or shutter', () => {
  const st = { ...base, style: 'stone', win: 'tall', shutters: undefined }, a = makeBuilding(st), b = makeBuilding({ ...st, sober: true });
  const count = (G) => { let leaf = 0, warm = 0; for (const i of wards(G)) { const r = G.col[i * 4], g = G.col[i * 4 + 1], bl = G.col[i * 4 + 2]; if (g > r + 25 && g > bl + 25) leaf++; if (G.emi[i * 4 + 3] > 20 && G.emi[i * 4] > G.emi[i * 4 + 2] + 30) warm++; } return { leaf, warm }; };
  const ca = count(a), cb = count(b);
  assert.ok(ca.leaf > 20 && ca.warm > 500, `the row's own: ${JSON.stringify(ca)}`);
  assert.deepEqual(cb, { leaf: 0, warm: 0 });
});

test('every building of the hospital kind is drawn so (statics.js), and its door light does not flood the front', () => {
  const src = readFileSync(new URL('../client/art2/game/statics.js', import.meta.url), 'utf8');
  assert.match(src, /if \(A === 'hospital'\) \{ spec\.win = 'ward'; spec\.panels = true; \}/);
  assert.match(src, /if \(stair\) spec\.stair = \{ x: 8, w: 26 \};/);
  // (a district's hand plan does not undo it - the three big hospitals are hand-planned; no home's dressing on any)
  assert.match(src, /if \(A === 'hospital' && !s\.frame && !s\.vox\) \{\s*if \(spec\.style === 'stone'[^\n]*spec\.sober = true;\s*else \{ spec\.win = 'ward'; spec\.panels = true; \}/);
  assert.match(readFileSync(new URL('../client/art2/facadedress.js', import.meta.url), 'utf8'), /if \(o\.A === 'hospital'\) return;/);
  const m = /const HOSP_SIGN_LIGHT = \[(\d+), ([\d.]+)\];/.exec(src);
  assert.ok(m && +m[1] <= 110 && +m[2] <= 0.7, `the red light: ${m && m[1]} px at ${m && m[2]} (it was 140 at 1.2)`);
});
