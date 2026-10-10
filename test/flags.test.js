// Flags in the wind (task #426, the owner: "let's add a slight animation to those flags that reacts to the wind. If
// it's not windy it kind of just droops down and sways gently. If there's a little wind it will react accordingly and
// blow in the wind. If it's really windy it will react to it. It should be subtle and not over the top."). The cloth
// is drawn live over a bare pole (client/art2/game/liveart.js; the host picks the frame from the shared wind).
import test from 'node:test';
import assert from 'node:assert/strict';
import { flagPose, flagCloth, flagSprite, flagWind, FLAGS, FLAG_LIFTS, FLAG_DIRS, FLAG_FRAMES } from '../client/art2/game/liveart.js';
import { generateCity } from '../shared/map.js';
import { staticIndex, staticItems, makeStatic, STATIC_CHUNK } from '../client/art2/game/statics.js';

const TAU = Math.PI * 2;
// (the wind's moods: render/flora/wind.js - a calm spell, a breeze, rain, a windy spell, a gale)
const CALM = 0.1, BREEZE = 0.3, RAIN = 0.45, WINDY = 0.58, GALE = 0.88;
// every point of the cloth in a pose: [x, y, height below the hoist's top]
const points = (kind, lift, th, ph) => {
  const C = flagCloth(kind, lift, th, ph), out = [];
  for (let i = 0; i < C.n; i++) for (const v of [0, 0.5, 1]) out.push([C.x[i], C.y[i], C.z[i] + v * C.h[i]]);
  return out;
};
// how far the cloth moves from one frame of the flap to the next (px, the mean and the most of its points), over the loop
const motion = (kind, lift) => {
  let sum = 0, n = 0, most = 0;
  for (let f = 0; f < FLAG_FRAMES; f++) {
    const a = points(kind, lift, 0, f / FLAG_FRAMES), b = points(kind, lift, 0, ((f + 1) % FLAG_FRAMES) / FLAG_FRAMES);
    for (let i = 0; i < a.length; i++) { const d = Math.hypot(a[i][0] - b[i][0], a[i][1] - b[i][1], a[i][2] - b[i][2]); sum += d; n++; most = Math.max(most, d); }
  }
  return { mean: sum / n, most };
};

test('flags: limp and hanging in calm air, out in a breeze, straight out in a gale - flapping faster the stronger it blows', () => {
  let prev = null;
  for (let w = 0; w <= 1.0001; w += 0.05) {
    const p = flagPose(w);
    if (prev) for (const k of ['lift', 'hz', 'amp']) assert.ok(p[k] >= prev[k] - 1e-9, `${k} grows with the wind (${w.toFixed(2)})`);
    prev = { ...p };
  }
  assert.ok(flagPose(CALM).lift < 0.05 && flagPose(CALM).hz < 0.3, 'calm: it droops, swaying once every few seconds');
  assert.ok(flagPose(BREEZE).lift > 0.3 && flagPose(BREEZE).lift < 0.6, 'a breeze lifts it part way');
  assert.ok(flagPose(RAIN).lift > 0.55, 'the wind the rain brings');
  assert.ok(flagPose(WINDY).lift > 0.85 && flagPose(GALE).lift > 0.99, 'windy, a gale: straight out');
  assert.ok(flagPose(GALE).hz > 4 * flagPose(CALM).hz && flagPose(GALE).hz < 2.5, 'it flaps faster in a gale - a couple of times a second, not a frenzy');
  // where it stands: a passing gust patch lifts it a little, never more than a sixth
  const wd = { strength: BREEZE, gust: 0.5, gd: [100, 200, 300, 400] };
  for (let x = 0; x < 4000; x += 137) { const w = flagWind(wd, x, x * 0.7); assert.ok(w >= BREEZE * 0.84 && w <= BREEZE * 1.16, 'gusts vary it a little'); }
});

test('flags: the cloth hangs down the pole when limp and stands out downwind in a wind; its motion grows with the wind and stays subtle', () => {
  for (const kind of Object.keys(FLAGS)) {
    const F = FLAGS[kind], L = F.L;
    for (let li = 0; li < FLAG_LIFTS; li++) {
      const lift = li / (FLAG_LIFTS - 1);
      for (let f = 0; f < FLAG_FRAMES; f++) {
        const P = points(kind, lift, 0, f / FLAG_FRAMES), reach = Math.max(...P.map((p) => Math.hypot(p[0], p[1]))), low = Math.max(...P.map((p) => p[2]));
        // (the hoist stays on the pole: the first column at its side, from the top)
        const C = flagCloth(kind, lift, 0, f / FLAG_FRAMES);
        assert.ok(Math.hypot(C.x[0], C.y[0]) < 2 && C.z[0] === 0, 'tied to the pole at the top');
        if (li === 0) { assert.ok(reach < 0.35 * L, `${kind} limp: hangs by the pole (reaches ${reach.toFixed(1)} of ${L})`); assert.ok(low > F.H + 0.6 * L, 'and hangs down below its hoist'); }
        if (li === FLAG_LIFTS - 1) { assert.ok(reach > 0.95 * L, `${kind} in a gale: straight out (${reach.toFixed(1)})`); assert.ok(low < F.H + 0.15 * L, 'level'); }
      }
      // downwind: the cloth's middle lies the way the wind blows
      if (lift >= 0.4) for (let d = 0; d < FLAG_DIRS; d += 3) {
        const th = d / FLAG_DIRS * TAU, P = points(kind, lift, th, 0.3), mx = P.reduce((s, p) => s + p[0], 0), my = P.reduce((s, p) => s + p[1], 0);
        assert.ok(Math.cos(Math.atan2(my, mx) - th) > Math.cos(0.3), `${kind} streams downwind (${d})`);
      }
    }
    // the flap never jumps: no point of the cloth moves more than a tenth of its length from one frame to the next
    // (the loop's last frame to its first included)
    for (let li = 0; li < FLAG_LIFTS; li++) { const m = motion(kind, li / (FLAG_LIFTS - 1)); assert.ok(m.most < 0.1 * L, `${kind}: subtle - no point moves more than ${(0.1 * L).toFixed(1)} px between frames (lift ${li}: ${m.most.toFixed(2)})`); }
    // and the cloth moves faster the harder it blows (px a second: a frame's motion at that lift, the frames a second
    // its flap runs at): a slow sway in calm air, a gale's flapping some times faster
    let prev = 0;
    const speeds = [CALM, BREEZE, RAIN, WINDY, GALE].map((w) => { const p = flagPose(w); return motion(kind, Math.round(p.lift * (FLAG_LIFTS - 1)) / (FLAG_LIFTS - 1)).mean * FLAG_FRAMES * p.hz; });
    for (const v of speeds) { assert.ok(v > prev, `${kind}: faster in a stronger wind (${speeds.map((q) => q.toFixed(1)).join(', ')} px/s)`); prev = v; }
    assert.ok(speeds[4] > 4 * speeds[0], `${kind}: a gale moves the cloth ${speeds[4].toFixed(1)} px/s against ${speeds[0].toFixed(1)} in calm air`);
  }
});

test('flags: every frame is a cloth on the pole, tied on at its top; the police flag in its colours', () => {
  for (const kind of Object.keys(FLAGS)) {
    const F = FLAGS[kind];
    for (const li of [0, 2, FLAG_LIFTS - 1]) for (const di of [0, 4, 9, 13]) for (let fr = 0; fr < FLAG_FRAMES; fr += 3) {
      const G = flagSprite(kind, li, di, fr), ap = G.ap || 1;   // (drawn in art pixels: ap world px each)
      let n = 0, top = false;
      for (let y = 0; y < G.h; y++) for (let x = 0; x < G.w; x++) {
        const i = y * G.w + x;
        if (!G.col[i * 4 + 3]) continue;
        n += ap * ap;
        if (Math.abs(x - G.ax) * ap <= 3 && Math.abs(G.z[i] - F.zt) <= 2) top = true;
      }
      assert.ok(n > F.L * F.H * 0.06, `${kind} ${li}/${di}/${fr}: a cloth (${n} px; limp and hanging toward the camera it is seen edge on)`);
      assert.ok(top, `${kind} ${li}/${di}/${fr}: tied to the top of the pole`);
    }
  }
  const G = flagSprite('stars', FLAG_LIFTS - 1, 4, 0), seen = new Set();
  for (let i = 0; i < G.w * G.h; i++) if (G.col[i * 4 + 3]) { const r = G.col[i * 4], g = G.col[i * 4 + 1], b = G.col[i * 4 + 2]; seen.add(b > r + 30 ? 'blue' : r > g + 60 ? 'red' : r > 150 && g > 150 ? 'white' : 'other'); }
  for (const c of ['blue', 'red', 'white']) assert.ok(seen.has(c), `the stars and stripes: ${c}`);
});

test('flags: the police stations\' poles and the golf pins are baked bare, each with its flag for the live renderer', () => {
  const M = generateCity(1337), I = staticIndex(M), items = new Set();
  for (const l of I.cells.values()) for (const it of l) if (it.flag) items.add(it);
  // (the map's props are made into items per chunk: the golf pins')
  for (const p of M.props) if (p.t === 'golfflag') for (const it of staticItems(M, Math.floor(p.x / STATIC_CHUNK), Math.floor(p.y / STATIC_CHUNK))) if (it.flag && it.x === p.x && it.y === p.y) items.add(it);
  const byKind = {};
  for (const it of items) {
    const [kind, x, y] = it.flag;
    byKind[kind] = (byKind[kind] || 0) + 1;
    assert.ok(FLAGS[kind], `a flag the live renderer knows (${kind})`);
    assert.equal(x, it.x); assert.equal(y, it.y);
    // the pole only: no cloth in the bake (the stars and stripes' red and blue, the pin's red)
    const G = makeStatic(it.recipe);
    let cloth = 0, pole = 0;
    for (let i = 0; i < G.w * G.h; i++) { if (!G.col[i * 4 + 3]) continue; const r = G.col[i * 4], g = G.col[i * 4 + 1], b = G.col[i * 4 + 2]; if ((r > 150 && g < 90) || (b > r + 40 && b > 90)) cloth++; else pole++; }
    assert.equal(cloth, 0, `${kind} at ${x},${y}: no cloth baked`);
    assert.ok(pole > 20, 'a pole');
  }
  const police = M.prefabs.filter((p) => /police/.test(p.key) && !p.hero).length, pins = M.props.filter((p) => p.t === 'golfflag').length;
  assert.ok(police >= 3 && byKind.stars === police, `every police station's flag (${byKind.stars} for ${police} stations)`);
  assert.ok(pins >= 3 && byKind.golf === pins, `every golf pin's flag (${byKind.golf} for ${pins} pins)`);
});
