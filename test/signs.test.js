// The shop sign system (wave A1, the owner's 11-03 note: "the text/font on building fronts can be hard to read ... easy
// to read and not all necessarily the same font ... match the vibe of what they are"; his example Northgate Clinic).
// client/art2/signfont.js: six faces and a small one built from CLA Pixel 5x7 at the art pixel, a face and palette per
// trade; buildings.js / statics.js / neonsigns.js / tunnel.js draw every sign through it.
//   - every trade the world has maps to a face, and the brief's trades to the audit's faces
//   - every face's glyphs are whole art pixels: rendered, baked (packGBuf + downsample2, as the engine bakes a chunk)
//     and compared, alone and on a shopfront whatever the building's height
//   - ink against panel at least 4.5:1 in every palette
//   - every shop sign in World v3 fits its band: 7 art px letters, at most two lines, no letters cut
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FACES, FACE_KEYS, CHARSET, TRADES, TRADE_KEYS, ROLE, lineMask, layoutSign, paintBoard, signStyle, tradeOf, contrast, boardFor } from '../client/art2/signfont.js';
import { makeBuilding, buildingH } from '../client/art2/buildings.js';
import { GBuf, packGBuf, downsample2 } from '../client/art2/gbuf.js';
import { buildWorld3 } from '../server/world3.js';
import { staticIndex } from '../client/art2/game/statics.js';

// the engine's bake: a sprite whose top-left sits on an even world px, the chunk downsampled from (0, 0)
const bake = (G) => downsample2({ ...packGBuf(G), ax: 0, ay: 0 }, {});
const same = (a, j, c) => a[j] === c[0] && a[j + 1] === c[1] && a[j + 2] === c[2];

test('every trade maps to a face, and the brief\'s trades to the audit\'s faces', () => {
  for (const k of TRADE_KEYS) {
    const T = TRADES[k];
    assert.ok(FACES[T.face], `${k}: a face (${T.face})`);
    assert.ok(T.pal.length >= 2, `${k}: sibling palettes to vary within the trade (${T.pal.length})`);
    for (let i = 0; i < T.pal.length; i++) assert.equal(signStyle(k, i).face, T.face);
  }
  const want = { clinic: 'civic', pharmacy: 'civic', laundromat: 'civic', pawn: 'block', hardware: 'block', gunshop: 'block', diner: 'marquee', cinema: 'marquee',
    bank: 'serif', hotel: 'serif', tavern: 'serif', boutique: 'script', cafe: 'script', salon: 'script', bar: 'neon', club: 'neon', motel: 'neon' };
  for (const [k, f] of Object.entries(want)) assert.equal(TRADES[k].face, f, `${k} in ${FACES[f].name}`);
  // the POI kinds, the stores, the window kinds and the archetypes of the world all land on a trade
  const kinds = ['convenience', 'coffee', 'delivery', 'bank', 'grocery', 'pawn', 'barber', 'clothing', 'pharmacy', 'gunshop', 'sports', 'hardware', 'market', 'police', 'garage',
    'club', 'marina', 'fishmarket', 'tackle', 'cinema', 'courthouse', 'hospital', 'bowling', 'fence', 'gasstation', 'snack', 'charter', 'lodge', 'butcher', 'farmstand', 'fruitstand',
    'assay', 'paint', 'roadhouse', 'winery', 'salvage', 'huntcamp', 'trapper', 'smuggler', 'rental', 'reception'];
  const stores = ['mart', 'clothes', 'salon', 'books', 'bar', 'records', 'lobby', 'florist', 'laundry', 'pawn', 'liquor', 'dept', 'thrift', 'kicks', 'surf', 'velvet', 'arcade', 'afterglow', 'surplus', 'workwear', 'kickflip', 'feed', 'gallery', 'diner', 'cafe'];
  const shops = ['mart', 'cafe', 'diner', 'bar', 'pawn', 'liquor', 'arcade', 'lobby', 'books', 'records', 'laundry', 'clothes', 'florist', 'gallery', 'salon'];
  const arch = ['hotel', 'bank', 'court', 'cityhall', 'theatre', 'club', 'tattoo', 'arcade', 'gas', 'mart', 'liquor', 'diner', 'cafe', 'restaurant', 'boutique', 'office', 'hospital', 'police', 'fire', 'school', 'garage'];
  for (const kind of kinds) assert.ok(TRADES[tradeOf({ kind })], `POI kind ${kind}`);
  for (const store of stores) assert.ok(TRADES[tradeOf({ store })], `store ${store}`);
  for (const shop of shops) assert.ok(TRADES[tradeOf({ shop })], `window ${shop}`);
  for (const A of arch) assert.ok(TRADES[tradeOf({ A })], `archetype ${A}`);
  // names say their trade first
  const named = { 'Northgate Clinic': 'clinic', 'Cedar Falls Pharmacy': 'pharmacy', 'Suds & Bubbles Laundry': 'laundromat', 'Bric-a-Brac Antiques & Pawn': 'pawn',
    'Nail & Gear Hardware': 'hardware', 'Iron Sights Arms': 'gunshop', 'Shorebird Snack Bar': 'diner', 'Mesa Savings & Trust': 'bank', 'Grand Neon Hotel': 'hotel',
    'Silk & Shears Salon': 'salon', "Kovac's Barber": 'barber', 'The Conch Bar': 'bar', 'Dog-Ear Books': 'books', 'Second Spin Records': 'records', 'Teal Coffee': 'cafe' };
  for (const [n, t] of Object.entries(named)) assert.equal(tradeOf({ name: n.toUpperCase() }), t, n);
  assert.equal(tradeOf({ name: 'NORTHGATE CLINIC', kind: 'hospital' }), 'clinic');
});

test('every face\'s glyphs are whole art pixels: rendered, baked and compared, letter for letter', () => {
  for (const fk of FACE_KEYS) {
    const texts = [CHARSET.slice(0, 22), CHARSET.slice(22)];
    if (FACES[fk].kase === 'title') texts.push('Abcdefghijklm', 'Nopqrstuvwxyz');
    for (const t of texts) {
      const M = lineMask(t, fk);
      // every stroke at least one art px: no mask pixel is narrower than the art grid by construction; check none of
      // the glyphs is empty and the cap height is 7
      assert.ok(M.h - M.pt >= 7, `${fk}: 7 art px letters`);
      for (const ox of [0, 1]) for (const oy of [0, 1]) {
        // (drawn from an odd px too: paintBoard snaps to the grid)
        const L = { w: M.w + 4, h: M.h + 4, lines: [t], face: fk, icon: null };
        const G = new GBuf(L.w * 2 + 4, L.h * 2 + 4);
        const P = { p: [30, 40, 60], i: [250, 240, 200], s: [10, 12, 20], o: [90, 20, 30], h: [255, 80, 200], l: [180, 190, 210], f: [5, 5, 5] };
        const box = paintBoard((x, y, c) => G.put(x, y, c, [0, 1, 0], 0, null, 0), L, P, 2 + ox, 2 + oy, { lit: false });
        const D = bake(G);
        // the board's laid-out mask, art px for art px: where the letters were painted, the baked pixel is the ink
        const ref = new GBuf(L.w * 2, L.h * 2);
        paintBoard((x, y, c) => ref.put(x, y, c, [0, 1, 0], 0, null, 0), L, P, 0, 0, { lit: false });
        let inkRef = 0, inkBoth = 0, inkAny = 0;
        for (let y = 0; y < L.h; y++) for (let x = 0; x < L.w; x++) {
          const a = same(ref.col, ((y * 2) * ref.w + x * 2) * 4, P.i), j = ((box.y / 2 + y) * D.w + box.x / 2 + x) * 4, b = same(D.p0, j, P.i);
          if (a) inkRef++; if (a && b) inkBoth++; if (a || b) inkAny++;
        }
        assert.ok(inkRef > t.length * 4, `${fk} ${t}: ink drawn`);
        assert.ok(inkBoth / inkAny >= 0.99, `${fk} "${t}" from (${ox}, ${oy}): ${inkBoth} of ${inkAny} ink px survive the bake`);
      }
    }
  }
});

test('on a shopfront, whatever the building\'s height and roof, the sign survives the bake whole', () => {
  let n = 0;
  for (const [text, trade, w] of [['NORTHGATE CLINIC', 'clinic', 192], ['HARBOR PAWN', 'pawn', 160], ['STARLITE DINER', 'diner', 192], ['WILLOW BANK', 'bank', 176], ['TEAL COFFEE', 'cafe', 144], ['MIDNIGHT BAR', 'bar', 160]]) {
    for (const parapet of [6, 7]) for (const pitch of [null, 'gable']) {
      const st = signStyle(trade, n++), sign = { text, face: st.face, pal: st.pal, icon: st.icon, glow: st.lit, bulbs: st.bulbs, lit: true };
      const spec = { w, d: 48, seed: n, style: 'brick', parapet, roof: pitch ? 'shingle' : 'flat', pitch, slope: 0.43, floors: 2, glowOnly: true, night: 0.7, grime: 0.5, graffiti: 1,
        shop: { kind: 'mart', door: 'left', open: true, openSign: true, awning: ['#2f7a5c', '#f0ece4'], sign } };
      const G = makeBuilding(spec), B = G.signBox, L = B.lay;
      assert.ok(B && L, 'the board painted');
      assert.equal(B.x & 1, 0); assert.equal(B.y & 1, 0);
      // (the face's rows stayed on the grid: the roof above added an even number of rows)
      const D = bake(G), ref = new GBuf(B.w, B.h);
      paintBoard((x, y, c) => ref.put(x, y, c, [0, 1, 0], 0, null, 0), L, st.pal, 0, 0, { lit: false, bulbs: st.bulbs });
      let ok = 0, all = 0;
      for (let y = 0; y < B.h / 2; y++) for (let x = 0; x < B.w / 2; x++) { all++; if (same(D.p0, ((B.y / 2 + y) * D.w + B.x / 2 + x) * 4, [...ref.col.subarray((y * 2 * ref.w + x * 2) * 4, (y * 2 * ref.w + x * 2) * 4 + 3)])) ok++; }
      assert.ok(ok / all >= 0.98, `${text} (parapet ${parapet}, ${pitch || 'flat'}): ${ok} of ${all} art px as painted`);
      // a two-line board raises the floor above it: the upper windows clear the board
      if (L.lines.length > 1) assert.ok(buildingH(spec) >= buildingH({ ...spec, shop: { ...spec.shop, sign: null } }) + 14, `${text}: the floor raised for two lines`);
    }
  }
});

test('ink against panel is at least 4.5:1 in every palette of every trade', () => {
  for (const k of TRADE_KEYS) for (let i = 0; i < TRADES[k].pal.length; i++) {
    const P = signStyle(k, i).pal;
    assert.ok(contrast(P.i, P.p) >= 4.5, `${k} palette ${i}: ${contrast(P.i, P.p).toFixed(2)}`);
    if (TRADES[k].face === 'marquee') assert.ok(contrast(P.i, P.o) >= 4.5, `${k} palette ${i}: ink on its outline ${contrast(P.i, P.o).toFixed(2)}`);
  }
});

test('long names: two lines, then a narrower face, then the trade word shortened - never a smaller letter', () => {
  const a = layoutSign('NORTHGATE CLINIC', 92, { face: 'civic', icon: 'cross' });
  assert.deepEqual(a.lines, ['NORTHGATE', 'CLINIC']); assert.equal(a.icon, 'cross');
  const b = layoutSign('CORNER DELI', 92, { face: 'block' });
  assert.deepEqual(b.lines, ['CORNER DELI']);
  const c = layoutSign('BRIC-A-BRAC ANTIQUES & PAWN', 76, { face: 'block', icon: 'balls' });
  assert.ok(c.lines.length <= 2 && !c.cut);
  for (const L of [a, b, c]) for (const t of L.lines) assert.ok(lineMask(t, L.face).w <= L.w - 4);
  // the icon sits beside the words, never under them
  const G = new GBuf(200, 60);
  const st = signStyle('clinic', 0);
  paintBoard((x, y, col) => G.put(x, y, col, [0, 1, 0], 0, null, 0), a, st.pal, 0, 0, { lit: false });
  const iconRight = (2 + 9) * 2, words = lineMask('NORTHGATE', 'civic');
  const lx = (13 + Math.floor((a.w - 2 - 13 - words.w) / 2)) * 2;
  assert.ok(lx >= iconRight + 2, `the words start (${lx}) right of the icon tile (${iconRight})`);
});

test('every shop sign in World v3 fits its band at a readable size, and neighbours differ', async () => {
  const { map: M } = await buildWorld3(1337, { log: () => {} });
  const I = staticIndex(M);
  let n = 0, two = 0;
  const bad = [], same = [], trades = new Set(), faces = new Set();
  for (const items of I.byB.values()) {
    const fronts = [];
    for (const it of items) {
      const sp = it.recipe && it.recipe.spec, sg = sp && sp.shop && sp.shop.sign;
      for (const pq of (sp && sp.plaques) || []) { const L = layoutSign(pq.text, Math.floor((sp.w - 8) / 2), { face: pq.face || 'civic', icon: pq.icon || null }); if (L.cut) bad.push(`plaque ${pq.text}`); if (pq.pal && contrast(pq.pal.i, pq.pal.p) < 4.5) bad.push(`plaque ${pq.text}: contrast`); }
      if (!sg || !sg.text) continue;
      n++;
      assert.ok(sg.face && sg.pal && TRADES[sg.trade], `${sg.text}: styled by its trade`);
      trades.add(sg.trade); faces.add(sg.face);
      const L = boardFor(sg, sg.w ?? sp.w - 8);
      if (L.cut || L.lines.length > 2 || !FACES[L.face]) bad.push(`${sg.text} -> ${L.lines.join(' / ')}`);
      if (L.lines.length > 1) two++;
      for (const t of L.lines) if (lineMask(t, L.face).w > L.w - 4 - (L.icon ? 10 : 0)) bad.push(`${sg.text}: ${t} overflows`);
      if (contrast(sg.pal.i, sg.pal.p) < 4.5) bad.push(`${sg.text}: contrast ${contrast(sg.pal.i, sg.pal.p).toFixed(2)}`);
      if (sg.face === 'marquee' && contrast(sg.pal.i, sg.pal.o) < 4.5) bad.push(`${sg.text}: ink on its outline ${contrast(sg.pal.i, sg.pal.o).toFixed(2)}`);
      fronts.push([it.x, sg]);
    }
    fronts.sort((a, b) => a[0] - b[0]);
    for (let i = 1; i < fronts.length; i++) { const [, a] = fronts[i - 1], [, b] = fronts[i]; if (a.trade === b.trade && a.pal.p.join() === b.pal.p.join() && a.pal.i.join() === b.pal.i.join() && a.text !== b.text) same.push(`${a.text} | ${b.text}`); }
  }
  assert.ok(n > 1000, `the world's shop signs (${n})`);
  assert.deepEqual(bad, [], 'every sign and plaque fits');
  assert.ok(two > 50, `long names on two lines (${two})`);
  assert.ok(trades.size >= 30, `trades on show (${trades.size})`);
  assert.equal(faces.size, 6, `all six faces on the streets (${[...faces].join(', ')})`);
  assert.ok(same.length <= n * 0.02, `neighbouring fronts of one trade in the same colours (${same.length}): ${same.slice(0, 5).join('; ')}`);
});
