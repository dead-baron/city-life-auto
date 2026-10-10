// Umbrellas in the rain (task #433, the owner: "Umbrellas are a little small right now we should make them a bit bigger
// and held lower down over the NPC a bit more so it looks like it's covering them from the rain. We should add more
// variety in the umbrellas."). The canopy (client/art2/game/liveart.js) is drawn by the host on the shaft in the hand
// (game/peds.js umbrellaTop), in a look of the person's own.
import test from 'node:test';
import assert from 'node:assert/strict';
import { umbrellaStyle, umbrellaSprite, umbrellaShape, UMBRELLAS, UMB_SHAPE, BUBBLE_SHAPE } from '../client/art2/game/liveart.js';
import { umbrellaTop, pedSprite, adaptApp } from '../client/art2/game/peds.js';
import { makeAppearance } from '../server/entities.js';

const CROWD = 4000;

test('umbrellas: each person keeps theirs; every look turns up, plain ones most, a clear bubble now and then', () => {
  // the same person (the server's id: the same for everyone watching), the same umbrella, however often it's asked
  for (let id = 1; id < 5000; id += 7) {
    const a = umbrellaStyle(id);
    assert.ok(Number.isInteger(a) && a >= 0 && a < UMBRELLAS.length);
    for (let k = 0; k < 3; k++) assert.equal(umbrellaStyle(id), a, 'stable');
  }
  // a crowd: every look turns up, none is more than a fifth of them, and people next to each other in the server's
  // numbering (who often come along together) mostly differ
  const n = new Array(UMBRELLAS.length).fill(0);
  let same = 0;
  for (let id = 1; id <= CROWD; id++) { n[umbrellaStyle(id)]++; if (umbrellaStyle(id) === umbrellaStyle(id + 1)) same++; }
  assert.ok(n.every((c) => c > 0), `every look turns up (${n.join(' ')})`);
  assert.ok(Math.max(...n) < CROWD * 0.2, 'none more than a fifth');
  assert.ok(n[0] === Math.max(...n), 'black the most common');
  const clear = UMBRELLAS.reduce((s, u, i) => s + (u.clear ? n[i] : 0), 0);
  assert.ok(clear > CROWD * 0.03 && clear < CROWD * 0.15, `a clear bubble now and then (${(clear / CROWD * 100).toFixed(1)}%)`);
  assert.ok(same < CROWD * 0.12, `neighbours differ (${same} the same of ${CROWD})`);
  // the variety: plain colours, two-colour panels, a rainbow, polka dots, a border, clear bubbles
  assert.ok(new Set(UMBRELLAS.map((u) => (u.clear ? 'clear' : u.p || 'plain'))).size >= 6, 'patterns');
  assert.ok(new Set(UMBRELLAS.filter((u) => u.c).map((u) => u.c)).size >= 8, 'colours');
  assert.ok(UMBRELLAS.filter((u) => u.clear).length >= 2, 'clear bubbles');
});

// Someone under their umbrella, composed as the engine does (each pixel: the taller wins): the person's pixels high
// enough to be the head and shoulders (z >= 34), how many the canopy hides, and whether any shows over it
const OLD = { R: 13, H: 6, rim: 42.2 };   // (before: a 27 px dome, its rim at the shaft's top less 2, centred on the shaft)
function under(P, d8, ui) {
  const S = umbrellaShape(ui), t = umbrellaTop(d8, [0, 0, 0], S.k), base = t[2] - S.drop, U = umbrellaSprite(ui), ap = U.ap || 1;
  const top = new Map();   // screen pixel -> the canopy's height there
  for (let v = 0; v < U.h; v++) for (let u = 0; u < U.w; u++) {
    const i = v * U.w + u;
    if (!U.col[i * 4 + 3]) continue;
    for (let dy = 0; dy < ap; dy++) for (let dx = 0; dx < ap; dx++) { const sx = Math.round((u - U.ax) * ap + dx + t[0]), sy = Math.round((v - U.ay) * ap + dy + t[1] - base); top.set(sx * 4096 + sy, U.z[i] + base); }
  }
  const o = umbrellaTop(d8, [0, 0, 0]);   // (the old canopy: on the shaft's top)
  let n = 0, hid = 0, hidOld = 0, over = 0;
  for (let y = 0; y < P.h; y++) for (let x = 0; x < P.w; x++) {
    const i = y * P.w + x, z = P.z[i];
    if (P.col[i * 4 + 3] < 128 || z < 34) continue;
    n++;
    const sx = x - P.ax, sy = y - P.ay, c = top.get(sx * 4096 + sy);
    if (c !== undefined) { if (c >= z) hid++; else over++; }
    // the old dome: a point on it at screen (sx, sy) - its ground offset (X, Y) from its middle, Y less its height up
    // the screen - and whether it stood taller than this pixel of the person there
    for (let Y = -OLD.R; Y <= OLD.R; Y += 0.5) { const X = sx - o[0], r2 = (X * X + Y * Y) / (OLD.R * OLD.R); if (r2 > 1) continue; const Zd = OLD.H * (1 - r2); if (Math.abs(o[1] + Y - Zd - OLD.rim - sy) < 0.5 && OLD.rim + Zd + 1 >= z) { hidOld++; break; } }
  }
  return { n, hid, hidOld, over };
}

test('umbrellas: bigger and held lower, over the head and shoulders - nothing of the person shows through the top', () => {
  // the canopies: wider than they were, the rim lower, the crown over the shaft's top
  for (const S of [UMB_SHAPE, BUBBLE_SHAPE]) {
    assert.ok(S.R >= OLD.R * 1.2, `bigger (${S.R * 2} px across, was ${OLD.R * 2 + 1})`);
    const top = umbrellaTop(0)[2];
    assert.ok(top - S.drop <= OLD.rim - 4, `held lower: the rim at ${(top - S.drop).toFixed(1)} px up (was ${OLD.rim})`);
    assert.ok(top - S.drop + S.H >= top + 2, 'the crown over the shaft\'s top');
  }
  let seed = 9; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const solid = 0, bubble = UMBRELLAS.findIndex((u) => u.clear);
  let N = 0, H = 0, HO = 0, B = 0, BN = 0;
  for (const ar of ['casual', 'office', 'socialite', 'athlete', 'senior', 'student', 'worker', 'punk']) {
    let app;
    try { app = adaptApp(makeAppearance(rnd, ar), ar); } catch { continue; }
    for (let d8 = 0; d8 < 8; d8++) for (const [pose, fr] of [['idle', 0], ['walk0', 1], ['walk1', 3]]) {
      const P = pedSprite(app, pose, d8, fr, 'umbrella');
      const a = under(P, d8, solid);
      assert.equal(a.over, 0, `${ar} ${pose} facing ${d8}: nothing pokes through the canopy`);
      N += a.n; H += a.hid; HO += a.hidOld;
      const b = under(P, d8, bubble);
      assert.equal(b.over, 0, `${ar} ${pose} facing ${d8}: nothing pokes through the bubble`);
      B += b.hid; BN += b.n;
    }
  }
  assert.ok(N > 2000, `people (${N} px of head and shoulders)`);
  assert.ok(H / N > 0.9, `the canopy covers their head and shoulders (${(H / N * 100).toFixed(0)}%)`);
  assert.ok(H / N > HO / N + 0.15, `more than the old one did (${(HO / N * 100).toFixed(0)}%)`);
  assert.ok(B / BN < 0.6, `you see them through a clear bubble (${(B / BN * 100).toFixed(0)}% behind its plastic)`);
});

test('umbrellas: each look drawn as it says - its colours, its pattern, the clear ones see-through', () => {
  const near = (c, h) => { const n = parseInt(h.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255; return Math.abs(c[0] - r) + Math.abs(c[1] - g) + Math.abs(c[2] - b) < 120; };
  UMBRELLAS.forEach((u, i) => {
    const G = umbrellaSprite(i), cols = [];
    let filled = 0, disc = 0;
    const R = umbrellaShape(i).R / (G.ap || 1);
    for (let y = 0; y < G.h; y++) for (let x = 0; x < G.w; x++) {
      const k = y * G.w + x, on = G.col[k * 4 + 3] > 0;
      if (on) cols.push([G.col[k * 4], G.col[k * 4 + 1], G.col[k * 4 + 2]]);
      // (the middle of the canopy as the camera sees it: round its crown)
      if (Math.hypot(x - G.ax, (y - G.ay + umbrellaShape(i).H / (G.ap || 1)) * 1.2) < R * 0.5) { disc++; if (on) filled++; }
    }
    if (u.clear) { assert.ok(filled / disc < 0.45, `look ${i}: clear - you see through it (${(filled / disc * 100).toFixed(0)}% drawn)`); assert.ok(cols.some((c) => near(c, u.c2)), `look ${i}: its rim`); return; }
    assert.ok(filled / disc > 0.95, `look ${i}: a canopy, not see-through`);
    if (u.c) assert.ok(cols.filter((c) => near(c, u.c)).length > cols.length * 0.25, `look ${i}: in ${u.c}`);
    if (u.c2) assert.ok(cols.filter((c) => near(c, u.c2)).length > cols.length * (u.p === 'dots' ? 0.03 : 0.1), `look ${i}: and ${u.c2} (${u.p})`);
    if (u.p === 'rainbow') { const hues = new Set(cols.map((c) => Math.round(Math.atan2(Math.sqrt(3) * (c[1] - c[2]), 2 * c[0] - c[1] - c[2]) / (Math.PI / 4)))); assert.ok(hues.size >= 6, `look ${i}: a rainbow (${hues.size} hues)`); }
  });
});
