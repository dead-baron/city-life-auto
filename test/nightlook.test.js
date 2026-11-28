// After dark (the shared kit's audit #4, gap 14: "night signs and lit rooms"). Shop signs light by their trade already
// (signfont.js TRADES lit, GLOW; statics.js SIGN_LIGHT) and a sash has its curtains, blinds, plant, cat and lamp - what
// the running game showed at night (11-27) was glow laid on so strong that it bloomed over them:
//  - a white lightbox with dark letters was a white bar with no words (HOME RUN SPORTS), a yellow neon name a blob
//    (Vinyl & More): a pale lit face glows less (glowOf) and throws less light; a neon tube's halo stays under a third
//    of the tube;
//  - every lit window a flat pale pane. 'rooms' (the owner's pick pending - buildings.js ROOM_LOOK, 'flat' until then):
//    what is in the window shapes its light.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeBuilding, roomLook, ROOM } from '../client/art2/buildings.js';
import { glowOf, PALE_GLOW, layoutSign, paintBoard, palOf, TRADES } from '../client/art2/signfont.js';

test('a pale lit sign face glows less, so its dark words read after dark; a dark or a strong-coloured one keeps all of it', () => {
  assert.equal(glowOf('#f4f2ea'), PALE_GLOW, 'white: the least');
  assert.ok(PALE_GLOW <= 0.3 && PALE_GLOW >= 0.15);
  assert.equal(glowOf('#c42a30'), 1, 'red'); assert.equal(glowOf('#24549a'), 1, 'blue'); assert.equal(glowOf('#22201f'), 1, 'black');
  assert.ok(glowOf('#e8c040') > 0.5 && glowOf('#e8c040') < 0.85, `a yellow face: between (${glowOf('#e8c040').toFixed(2)})`);
  // painted: a white lightbox's face against a red one's, the same board
  const face = (pal) => { const L = layoutSign('HOME RUN SPORTS', 110, { face: 'block', lines: 1 }), P = palOf(pal, TRADES.mart), es = []; paintBoard((x, y, c, e) => { if (e) es.push(e[3]); }, L, P, 0, 0, { lit: 'panel', night: 1 }); return Math.max(...es); };
  const white = face(['#f4f2ea', '#b0282e']), red = face(['#b0282e', '#faf6ec']);
  assert.ok(white <= red * 0.3, `the white face's glow ${white} against the red one's ${red}`);
  assert.ok(white >= 15, 'still a lit box');
});

test('a neon name keeps its letters: the halo under a third of the tube', () => {
  const src = readFileSync(new URL('../client/art2/signfont.js', import.meta.url), 'utf8');
  const m = /const GLOW = \{[^}]*neon: \[(\d+), (\d+), (\d+)\]/.exec(src);
  assert.ok(m && +m[3] * 3 <= +m[1] && +m[3] >= 40, `tube ${m && m[1]}, halo ${m && m[3]}`);
  assert.match(src.replace(/\s+/g, ' '), /glowOf\(P\.p\)/, 'the board painter asks');
  assert.match(readFileSync(new URL('../client/art2/game/statics.js', import.meta.url), 'utf8'), /\(SIGN_LIGHT\[st\.lit\] \|\| 0\.5\) \* \(pal\.neon \? 1 : glowOf\(col\)\)/, 'and the light a sign throws');
});

// the lit upstairs windows of a walk-up, as the game bakes them (glowOnly)
const walkup = () => makeBuilding({ w: 256, d: 64, floors: 5, style: 'brick', seed: 11, night: 1, glowOnly: true, litShare: 1 });
const glowsIn = (G) => { const a = []; for (let i = 0; i < G.w * G.h; i++) if (G.flag[i] & 64 || G.emi[i * 4 + 3]) a.push(G.emi[i * 4 + 3]); return a; };
test('lit windows: "flat" is the live look, untouched; "rooms" lets what is in the window shape its light', () => {
  assert.equal(roomLook(), 'flat', 'flat until the owner picks');
  const A = walkup(); roomLook('rooms'); let B; try { B = walkup(); } finally { roomLook('flat'); }
  assert.deepEqual([...A.col.slice(0, 4000)], [...B.col.slice(0, 4000)], 'the same picture by day');
  let same = true; for (let i = 0; i < A.col.length; i++) if (A.col[i] !== B.col[i]) { same = false; break; }
  assert.ok(same, 'albedo the same throughout: only the light differs');
  const pane = (G) => { const h = new Map(); for (let i = 3; i < G.emi.length; i += 4) if (G.emi[i] > 100 && G.emi[i - 3] === 255 && G.emi[i - 1] < 130) h.set(G.emi[i], (h.get(G.emi[i]) || 0) + 1); return h; };
  let litA = 0, litB = 0, maxB = 0, darkIn = 0;
  for (let i = 3; i < A.emi.length; i += 4) { if (A.emi[i] >= 110 && A.emi[i - 3] >= 170 && A.emi[i - 2] >= 190) { litA++; const b = B.emi[i]; if (b >= 110) litB++; if (b === 0) darkIn++; maxB = Math.max(maxB, b); } }
  assert.ok(litA > 400, `lit panes in the live look (${litA} px)`);
  assert.ok(litB < litA * 0.12, `rooms: the pane calmer - ${litB} of ${litA} px still at full strength (the lamp shades)`);
  assert.ok(darkIn > 0 || maxB > 0, 'something in a window');
  assert.ok(ROOM.pane <= 0.5 && ROOM.cloth < ROOM.pane && ROOM.solid === 0 && ROOM.lamp > 1 && ROOM.paper < ROOM.cloth, 'pane > cloth > paper > a solid thing; a lamp over all');
  void pane; void glowsIn;
});
