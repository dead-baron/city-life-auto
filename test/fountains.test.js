// Fountains that move (task #417, the owner: "Fountains that are in the city should be animated and have procedural
// water effects to them."). The stone and the still water are baked with the chunk; the jet, the drops falling into the
// bowl and the basin, the ripples and the glints are drawn live over them, a frame of a short loop at a time
// (client/art2/game/liveart.js fountainSprite; the host picks each fountain's frame from the clock).
import test from 'node:test';
import assert from 'node:assert/strict';
import { fountainSprite, jetTop, FOUNTAIN, FOUNTAIN_FRAMES, FOUNTAIN_S } from '../client/art2/game/liveart.js';
import { generateCity } from '../shared/map.js';
import { staticItems, makeStatic, STATIC_CHUNK } from '../client/art2/game/statics.js';
import { F_GROUND, F_WATER, F_NOCAST, ART_PX } from '../client/art2/gbuf.js';

const F = FOUNTAIN;
// the opaque pixels of a sprite: their height, where on the ground they stand (world px from the anchor) and colour
const pixels = (G) => {
  const out = [], ap = G.ap || 1;
  for (let py = 0; py < G.h; py++) for (let px = 0; px < G.w; px++) {
    const i = py * G.w + px;
    if (!G.col[i * 4 + 3]) continue;
    const z = G.z[i], x = (px - G.ax + 0.5) * ap, y = (py - G.ay + 0.5) * ap + z;
    out.push({ i, z, x, y, r: Math.hypot(x, y), c: [G.col[i * 4], G.col[i * 4 + 1], G.col[i * 4 + 2]], f: G.flag[i] });
  }
  return out;
};
const frames = Array.from({ length: FOUNTAIN_FRAMES }, (_, fr) => fountainSprite(fr));
const white = (p) => p.c[0] === 255 && p.c[1] === 255 && p.c[2] === 255;

test('fountains: every fountain in the city is baked as its stone and still water, with its water to draw live', () => {
  const M = generateCity(1337), found = [];
  M.props.forEach((p, pi) => {
    if (p.t !== 'fountain') return;
    const items = staticItems(M, Math.floor(p.x / STATIC_CHUNK), Math.floor(p.y / STATIC_CHUNK)).filter((it) => it.pi === pi);
    const it = items.find((q) => q.fnt);
    assert.ok(it, `the fountain at ${p.x},${p.y} has its live water`);
    assert.deepEqual(it.fnt, [p.x, p.y, p.lift || 0], 'where it stands (and how high)');
    found.push(it);
  });
  assert.ok(found.length >= 5, `the city's fountains (${found.length})`);
  // the bake: the basin, the pedestal and its bowl, the column and its dish - no spray over the dish any more, and
  // the water lying flat (open water to the light: little waves, glints, the column mirrored in it)
  const G = makeStatic(found[0].recipe), P = pixels(G);
  assert.equal(P.filter((p) => p.z > F.dishZ).length, 0, 'nothing over the dish: the jet is live');
  assert.equal(P.filter((p) => p.f & F_NOCAST).length, 0, 'no baked spray');
  const basin = P.filter((p) => p.z === F.water && (p.f & (F_WATER | F_GROUND)) === (F_WATER | F_GROUND)).length;
  const bowl = P.filter((p) => p.z === F.bowlZ && (p.f & F_WATER)).length;
  assert.ok(basin > 1000 && bowl > 100, `still water in the basin (${basin} px) and the bowl (${bowl})`);
  // (the old fountain, spray and all, still stands in the art previews)
  const old = pixels(makeStatic({ ...found[0].recipe, a: [30, 2] }));
  assert.ok(old.filter((p) => p.z > F.dishZ).length > 20, 'the previews\' fountain keeps its spray');
});

test('fountains: the jet rises and falls, drops fall into the bowl and the basin, ripples spread, the light glints', () => {
  const tops = [];
  frames.forEach((G, fr) => {
    assert.equal(G.ap, ART_PX, 'drawn in art pixels');
    const P = pixels(G), t = fr / FOUNTAIN_FRAMES;
    // the jet: up the middle from the dish, as high as jetTop says (its crown breaking a little over it)
    const jet = P.filter((p) => Math.abs(p.x) <= 4 && p.z >= F.dishZ), top = Math.max(...jet.map((p) => p.z));
    assert.ok(top >= jetTop(t) - 1 && top <= jetTop(t) + 3, `frame ${fr}: the jet stands ${top} high (${jetTop(t).toFixed(1)})`);
    tops.push(top);
    // drops falling from the crown into the bowl, and from the bowl's lip into the basin
    const arcs = P.filter((p) => p.z > F.lipZ && p.r > 3.5 && p.r < F.bowl + 1.5).length;
    const over = P.filter((p) => p.z > F.water + 1 && p.z < F.lipZ && p.r > F.lip - 1 && p.r < F.lip + 4).length;
    assert.ok(arcs >= 12 && over >= 30, `frame ${fr}: drops falling into the bowl (${arcs}) and over its lip (${over})`);
    // ripples on the basin, out from where the drops land to near its rim; a few glints at most
    const rip = P.filter((p) => p.z <= F.water + 1 && p.r > F.lip + 1 && !white(p));
    assert.ok(rip.length >= 30, `frame ${fr}: ripples on the basin (${rip.length})`);
    assert.ok(rip.every((p) => p.r < F.basin + 1.5), 'inside the basin');
    assert.ok(P.filter((p) => white(p) && p.z <= F.water + 1).length <= 6, 'a few glints');
    // nothing outside the stone
    assert.ok(P.every((p) => p.r < F.basin + 1.5), `frame ${fr}: all of it over the fountain`);
  });
  assert.ok(Math.max(...tops) - Math.min(...tops) >= 6, `the jet rises and falls (${Math.min(...tops)} to ${Math.max(...tops)})`);
  // the ripples spread: each ring's radius grows frame by frame until a new one starts by the bowl
  const ringR = (G) => { const r = pixels(G).filter((p) => p.z <= F.water + 1 && p.r > F.lip + 1 && !white(p)).map((p) => p.r); return Math.max(...r); };
  let grew = 0;
  for (let fr = 0; fr < FOUNTAIN_FRAMES; fr++) if (ringR(frames[(fr + 1) % FOUNTAIN_FRAMES]) > ringR(frames[fr])) grew++;
  assert.ok(grew >= FOUNTAIN_FRAMES / 2, `the outer ring grows most frames (${grew} of ${FOUNTAIN_FRAMES})`);
  // the glints come and go
  const glints = frames.map((G) => pixels(G).filter((p) => white(p) && p.z <= F.water + 1).length);
  assert.ok(glints.some((n) => n === 0) && glints.some((n) => n >= 2), `glints come and go (${glints.join(' ')})`);
});

test('fountains: a seamless loop of a few seconds, the same every time it is made, and small', () => {
  assert.ok(FOUNTAIN_S >= 2 && FOUNTAIN_S <= 5 && FOUNTAIN_FRAMES / FOUNTAIN_S >= 6, `${FOUNTAIN_FRAMES} frames over ${FOUNTAIN_S} s`);
  assert.ok(Math.abs(jetTop(0) - jetTop(1)) < 1e-9, 'the jet ends the loop where it began');
  // from one frame to the next everything moves a little; from the last back to the first no more than that
  const key = (G) => { const s = new Set(); for (const p of pixels(G)) s.add(`${p.i}:${p.c.join(',')}:${p.z}`); return s; };
  const K = frames.map(key), change = (a, b) => { let n = 0; for (const k of a) if (!b.has(k)) n++; for (const k of b) if (!a.has(k)) n++; return n; };
  const steps = K.map((k, fr) => change(k, K[(fr + 1) % FOUNTAIN_FRAMES])), inner = steps.slice(0, -1);
  assert.ok(steps.every((n) => n > 0), 'every frame moves');
  assert.ok(steps[FOUNTAIN_FRAMES - 1] <= Math.max(...inner) * 1.1, `round the loop without a jump (${steps[FOUNTAIN_FRAMES - 1]} against ${Math.min(...inner)}..${Math.max(...inner)})`);
  // made the same every time (no randomness: every fountain's frames are the same frames)
  for (const fr of [0, 7, 19]) {
    const a = fountainSprite(fr), b = frames[fr];
    assert.deepEqual([a.w, a.h, a.ax, a.ay], [b.w, b.h, b.ax, b.ay]);
    assert.ok(a.col.every((v, i) => v === b.col[i]) && a.z.every((v, i) => v === b.z[i]) && a.flag.every((v, i) => v === b.flag[i]), `frame ${fr} made again is the same`);
  }
  // small: a few hundred art pixels a frame, casting no shadow
  for (const G of frames) {
    const P = pixels(G);
    assert.ok(G.w * G.h <= 40 * 75 && P.length < 400, `${P.length} px in ${G.w} x ${G.h}`);
    assert.ok(P.every((p) => p.f & F_NOCAST), 'the water casts no shadow');
  }
});
