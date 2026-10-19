// The Arts District, handcrafted (shared/world3-arts.js, 2026-10-19): its streets - Gallery Avenue carried on south to
// Bayside Avenue, Bridge Street from Greenfield Avenue to the Sunset Bridge, Fountain Avenue carried on west from
// Downtown to the water, Wharf Street from Gallery Avenue's end - and the special places it lays itself; its art: the
// galleries' windows, the warehouses' sawtooth roofs, the glasshouses' glazed roofs, the theatre's masks, the gallery's
// palette and the record shop's disc in neon, the forecourt's sculptures. (The district built in the whole world:
// test/world3world.test.js.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ARTS, AX, AY, SUNSET } from '../shared/world3-arts.js';
import { HAND_PLANS } from '../shared/world3-hand.js';
import { ARTERIALS } from '../shared/world3-skeleton.js';
import { CITY3 } from '../shared/world3-city.js';
import { makeBuilding, buildingH } from '../client/art2/buildings.js';
import { paintSigns, picSize, picGlow } from '../client/art2/neonsigns.js';
import { sculpture } from '../client/art2/props-garden.js';
import { F_GLASS } from '../client/art2/gbuf.js';

test('the Arts District\'s streets carry on the city\'s and meet the bridges; it lays its own special places', () => {
  assert.ok(HAND_PLANS.includes(ARTS));
  assert.equal(CITY3.find((c) => c.d === ARTS.d).hand, 'arts', 'the grid lays only the avenues round it');
  const S = ARTS.streets(), by = (n) => S.find((s) => s.name === n);
  for (const s of S) assert.ok(['st', 'ave', 'blvd', 'alley', 'minor'].includes(s.kind) && s.pts.length >= 2, `${s.name}: a kind the generator knows`);
  const bridge = (n) => ARTERIALS.find((a) => a.name === n).pts[0];
  assert.deepEqual(SUNSET, bridge('Sunset Bridge'), 'the Sunset Bridge\'s end');
  assert.deepEqual(by('Bridge Street').pts.at(-1), SUNSET, 'Bridge Street on to the Sunset Bridge');
  // the Pink Mile's Bridge Street carried on across Greenfield Avenue
  const pm = HAND_PLANS.find((p) => p.key === 'pinkmile').streets().find((s) => s.name === 'Bridge Street');
  assert.deepEqual(by('Bridge Street').pts[0], pm.pts.at(-1), 'Bridge Street carries on from the Arts Bridge');
  // Downtown's Fountain Avenue carried on west from Westside Avenue
  const dt = HAND_PLANS.find((p) => p.key === 'downtown').streets().filter((s) => s.name === 'Fountain Avenue');
  assert.ok(dt.some((s) => [s.pts[0], s.pts.at(-1)].some((p) => p[0] === AX.westside && p[1] === AY.fountain)), 'Downtown\'s Fountain Avenue meets Westside Avenue there');
  assert.deepEqual(by('Fountain Avenue').pts[0], [AX.westside, AY.fountain]);
  assert.deepEqual(by('Gallery Avenue').pts, [[AX.gallery, AY.green], [AX.gallery, AY.bayside]], 'Gallery Avenue on to Bayside Avenue');
  assert.deepEqual(by('Wharf Street').pts[0], [AX.gallery, AY.wharf], 'Wharf Street from Gallery Avenue\'s north end');
  for (const n of ['Wharf Street', 'Foundry Street', 'Canvas Street']) assert.ok(by(n).culdesac, `${n}: ends at the water`);
  for (const n of ['Metro Museum of Art', 'The Playhouse', 'Gallery Nine', 'Easel Cafe', 'Second Spin Records']) assert.ok(ARTS.specials.includes(n), `${n}: laid by the plan`);
});

test('a gallery\'s window: white walls, canvases hung in a line, the polished floor', () => {
  const at = (kind) => {
    const spec = { w: 320, d: 320, floors: 2, style: 'brick', brickTone: '#8e4a3a', win: 'even', parapet: 8, night: 0, seed: 5, shop: { kind, door: 'left', open: true, people: 0, sign: null, awning: null } };
    const G = makeBuilding(spec), H = buildingH(spec), y0 = spec.d + H;
    let white = 0, bold = 0;
    for (let Y = y0 - 50; Y < y0 - 8; Y++) for (let x = 40; x < spec.w - 8; x++) {
      const j = (Y * G.w + x) * 4, r = G.col[j], g = G.col[j + 1], b = G.col[j + 2];
      if (r > 215 && g > 215 && b > 205) white++;
      if (Math.max(r, g, b) - Math.min(r, g, b) > 120) bold++;
    }
    return { white, bold };
  };
  const gal = at('gallery'), mart = at('mart');
  assert.ok(gal.white > 1500 && gal.white > mart.white * 3, `white walls (${gal.white} px; a shop's ${mart.white})`);
  assert.ok(gal.bold > 200, `the canvases' colours (${gal.bold} px)`);
});

test('a warehouse\'s sawtooth roof: a tooth to every bay, the north lights glazed; a glasshouse\'s glazed roof', () => {
  const spec = { w: 256, d: 320, floors: 2, style: 'brick', brickTone: '#7a3a2e', win: 'loft', parapet: 8, pitch: 'saw', tooth: 64, seed: 3 };
  const G = makeBuilding(spec);
  // each column's top: the teeth rise west to east and drop at each tooth's end
  const top = (x) => { for (let y = 0; y < G.h; y++) if (G.col[(y * G.w + x) * 4 + 3]) return y; return G.h; };
  let drops = 0;
  for (let x = 1; x < spec.w; x++) if (top(x) - top(x - 1) > 12) drops++;
  assert.equal(drops, Math.floor((spec.w - 1) / spec.tooth), `a drop at every tooth's end (${drops})`);
  let glass = 0;
  for (let i = 0; i < G.w * G.h; i++) if (G.flag[i] & F_GLASS) glass++;
  assert.ok(glass > spec.w * spec.d * 0.15, `the north lights glazed (${glass} px)`);
  const P = { w: 192, d: 256, floors: 2, style: 'glass', wallColor: '#a8d4c8', win: 'tall', pitch: 'gable', ridge: 'ns', roof: 'glass', slope: 0.6, seed: 4 };
  const GP = makeBuilding(P);
  let pg = 0;
  for (let i = 0; i < GP.w * GP.h; i++) if (GP.flag[i] & F_GLASS) pg++;
  assert.ok(pg > P.w * P.d * 0.6, `the glasshouse's roof glazed between its ribs (${pg} px)`);
});

test('the Arts District\'s neon pictures and the museum forecourt\'s sculptures', () => {
  for (const k of ['masks', 'palette', 'vinyl']) {
    const [w, h] = picSize(k, 1);
    assert.ok(w >= 24 && h >= 20 && w <= 48 && h <= 48, `${k}: a sign's size (${w} x ${h})`);
    let n = 0, bright = 0;
    const G = { ax: 0, ay: h, inside: (x, y) => x >= 0 && y >= 0 && x < w && y < h, alpha: () => true, put: (x, y, c, nrm, z, e) => { n++; if (e) bright++; }, glow: () => {} };
    paintSigns(G, { neonSigns: [{ pic: k, x: 0, v: 0, s: 1, col: [255, 80, 200] }] });
    assert.ok(n > 120 && bright > n * 0.2, `${k}: drawn, its tubes lit (${bright} of ${n} px)`);
    assert.equal(picGlow(k).length, 3, `${k}: its own glow`);
  }
  for (let v = 0; v < 3; v++) {
    const M = sculpture(v);
    let n = 0, high = 0;
    for (let z = 0; z < M.h; z++) for (let y = 0; y < M.d; y++) for (let x = 0; x < M.w; x++) if (M.get(x, y, z)) { n++; if (z > 40) high++; }
    assert.ok(n > 2000 && high > 200, `sculpture ${v}: a plinth and a piece standing on it (${n} voxels, ${high} above the plinth's head height)`);
  }
});
