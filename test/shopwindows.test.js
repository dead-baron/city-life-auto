// The windows by trade (11-26, the shared kit's audit #2: "window goods by trade" - a pharmacy showed a mart's shelves,
// a gun shop a pawnbroker's guitars, a clinic a row of bottles). The painter draws a window for every kind it names
// (client/art2/buildings.js WINDOWS), each its own; a trade's shop shows one of its own (GOODS_OF, goodsOf - statics.js
// sets shop.goods once the sign's trade is known). The world's fronts are the lint's (test/placementlint.test.js:
// windowTrade 0). And the names' words that read as the wrong trade (client/art2/signfont.js WORDS).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBuilding, GOODS_OF, WINDOWS, goodsOf } from '../client/art2/buildings.js';
import { TRADES, tradeOf } from '../client/art2/signfont.js';

const front = (goods, night = 0) => makeBuilding({ w: 224, d: 64, floors: 2, style: 'brick', wallColor: '#8a5a48', seed: 7, night, shop: { kind: 'mart', goods, door: 'right', live: 'hinge', clerk: false, sign: null } });
// the window's glass: the strip above the riser, clear of the door
const glass = (G) => { const o = []; for (let y = G.h - 46; y < G.h - 8; y++) for (let x = 6; x < 180; x++) { const j = (y * G.w + x) * 4; o.push(G.col[j], G.col[j + 1], G.col[j + 2]); } return o; };
const differ = (a, b) => { let n = 0; for (let i = 0; i < a.length; i += 3) if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 60) n++; return n / (a.length / 3); };

test('every window the painter names is drawn, and each is its own (a diner and a cafe share their room: the diner\'s red riser tells them apart)', () => {
  assert.ok(WINDOWS.length >= 24 && new Set(WINDOWS).size === WINDOWS.length);
  for (const k of ['pharmacy', 'gunshop', 'hardware', 'barber', 'sports', 'tackle', 'bakery', 'clinic', 'jeweller']) assert.ok(WINDOWS.includes(k), k);   // (the audit's seven, and two the count added)
  const px = WINDOWS.map((k) => glass(front(k)));
  for (let i = 0; i < WINDOWS.length; i++) {
    const cols = new Set(); for (let j = 0; j < px[i].length; j += 3) cols.add((px[i][j] >> 4) << 8 | (px[i][j + 1] >> 4) << 4 | px[i][j + 2] >> 4);
    assert.ok(cols.size >= 8, `${WINDOWS[i]}: a room, not a flat pane (${cols.size} colours)`);
    for (let j = i + 1; j < WINDOWS.length; j++) if (!(WINDOWS[i] === 'diner' && WINDOWS[j] === 'cafe')) assert.ok(differ(px[i], px[j]) > 0.25, `${WINDOWS[i]} and ${WINDOWS[j]}: one drawing (${differ(px[i], px[j]).toFixed(2)})`);
  }
  assert.ok(differ(glass(front('no-such-shop')), glass(front('mart'))) < 0.01, 'a kind nobody draws falls to the mart\'s shelves - which is why the lint wants every front\'s kind in WINDOWS');
});

test('a trade\'s shop shows its own window: the table names trades and windows that exist, and overrides only another trade\'s', () => {
  for (const [t, ws] of Object.entries(GOODS_OF)) {
    assert.ok(TRADES[t], `${t}: a trade`);
    assert.ok(ws.length && ws.every((w) => WINDOWS.includes(w)), `${t}: ${ws}`);
  }
  for (const t of ['pharmacy', 'gunshop', 'hardware', 'barber', 'sports', 'tackle', 'bakery']) assert.equal(GOODS_OF[t][0], t, `${t}: its own window`);
  assert.equal(goodsOf('pharmacy', 'mart'), 'pharmacy');
  assert.equal(goodsOf('gunshop', 'pawn'), 'gunshop');
  assert.equal(goodsOf('clinic', 'liquor'), 'clinic');
  assert.equal(goodsOf('bar', 'diner'), 'diner', 'a tiki bar keeps its counter');
  assert.equal(goodsOf('office', 'lobby'), 'lobby'); assert.equal(goodsOf('mart', 'pawn'), 'pawn', 'a trade with no window of its own keeps the front\'s');
  assert.equal(goodsOf(undefined, 'cafe'), 'cafe');
});

test('the lit things in a window glow after dark: the pharmacy\'s cross, the barber\'s pole, the jeweller\'s stones', () => {
  for (const k of ['pharmacy', 'barber', 'jeweller']) {
    const G = front(k, 1); let hot = 0, room = 0;
    for (let y = G.h - 46; y < G.h - 8; y++) for (let x = 6; x < 180; x++) { const a = G.emi[(y * G.w + x) * 4 + 3]; if (a > 150) hot++; else if (a > 60) room++; }
    assert.ok(hot > 40 && room > hot * 3, `${k}: ${hot} lit px over a room of ${room}`);
  }
});

test('a name\'s words: the trades the count found misread (11-26)', () => {
  const T = (name, o = {}) => tradeOf({ name, ...o });
  assert.equal(T('POLISHED NAIL BAR', { shop: 'bar' }), 'salon');
  assert.equal(T('RUSTY NAIL', { shop: 'bar' }), 'bar');
  assert.equal(T('HAMMER & NAIL HARDWARE'), 'hardware');
  assert.equal(T('POLARIS JUICE BAR'), 'cafe');
  assert.equal(T('MERCER DISCOUNT', { shop: 'mart' }), 'mart');
  assert.equal(T('DISCO INFERNO'), 'club');
  assert.equal(T('KIKI\'S SHOE REPAIR'), 'mart'); assert.equal(T('JOE\'S AUTO REPAIR'), 'auto');
  assert.equal(T('QUILL & INK', { store: 'books' }), 'books'); assert.equal(T('INK & IRON TATTOO'), 'tattoo');
  assert.equal(T('HARBOR BREWING CO', { kind: 'coffee' }), 'tavern'); assert.equal(T('BREW HAVEN'), 'cafe');
  assert.equal(T('VELVET BAKERY', { kind: 'coffee' }), 'bakery'); assert.equal(T('VELVET & VINE', { store: 'velvet' }), 'boutique');
  assert.equal(T('ATELIER NOOR', { shop: 'gallery' }), 'gallery'); assert.equal(T('CREMA STUDIO', { kind: 'coffee' }), 'cafe');
  assert.equal(T('OVERTIME SPORTS GRILL'), 'diner'); assert.equal(T('SIDELINE SPORTS BAR'), 'bar'); assert.equal(T('HOME RUN SPORTS'), 'sports');
  assert.equal(T('COASTLINE CAR RENTAL', { shop: 'lobby' }), 'office'); assert.equal(T('BEACH BUM RENTALS'), 'marine'); assert.equal(T('ECONORIDE RENTALS', { shop: 'lobby' }), 'office');
});

// The owner, 11-26 12:40, of the busts painted in the glass (a clerk at each till, diners in the booths): "We shouldnt
// have just static humans in windows, if its a mannequin for a clothing shop or something thats cool, but if we have
// humans in the window we want it to be actual NPCs through the window, not static images of humans".
test('no person is painted in a shop window: a front that asks for people and a clerk is drawn as one that asks for none', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../client/art2/buildings.js', import.meta.url), 'utf8');
  assert.ok(!/\bbust\s*\(/.test(src) && !/MAT\.skin|MAT\.hair/.test(src.slice(src.indexOf('function storefront'), src.indexOf('// ---- weathering'))), 'the painter of busts is gone from the shop front');
  for (const kind of ['diner', 'mart', 'lobby', 'bar', 'clothes']) {
    const mk = (o) => makeBuilding({ w: 256, d: 96, floors: 2, style: 'brick', seed: 11, night: 0, shop: { kind, door: 'left', open: true, sign: null, ...o } });
    const A = mk({ people: 4, clerkShirt: [44, 140, 120] }), B = mk({ people: 0, clerk: false });
    assert.equal(A.w, B.w); let diff = 0;
    for (let i = 0; i < A.col.length; i++) if (A.col[i] !== B.col[i]) diff++;
    assert.equal(diff, 0, `${kind}: ${diff} values differ`);
  }
});
