// Clothes to buy (task #364: shared/wardrobe.js, server/systems/looks.js, shared/map.js buildClothesShops): what a
// player owns, the stores by style and district, buying in the fitting room (Buy, Buy and wear: cash first, then the
// bank), the barber's and the salon's chair, and the clothes shop's old new-outfit service.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as LK from '../shared/look.js';
import * as W from '../shared/wardrobe.js';
import { WALK_IN } from '../shared/map.js';
import { BARBER_PRICES, SALON_K } from '../shared/rules.js';
import { makeWorld, joinPlayer, run, teleport } from './helpers.js';
import * as looks from '../server/systems/looks.js';
import * as economy from '../server/systems/economy.js';

const set = (a, L) => looks.handle(a.w, a.p, { t: 'look', a: 'set', c: typeof L === 'string' ? L : LK.encodeLook(L) });
const join = (w, o) => ({ w, ...joinPlayer(w, o) });
// a player who has picked their starting look (the first session over)
function picked(w, o = {}, starter = 2) {
  const a = join(w, o);
  set(a, LK.STARTERS[starter].look);
  run(w, 1.1);
  return a;
}
const at = (a, poi) => teleport(a.w, a.p.ped, poi.x, poi.y);
const storePoi = (w, id) => w.map.pois.find((p) => W.storeOf(p) === id && p.outside);

test('the catalogue is for sale: every piece sold somewhere, every store and store kind in the world as a walk-in', () => {
  const w = makeWorld();
  for (const P of LK.PIECES) if (P && P.price > 0) assert.ok(W.sellerOf(P.i), `${P.name} is sold somewhere`);
  // every store has a place in the world (the hunting places sell outdoor clothes at their counters)
  for (const id of Object.keys(W.STORES)) assert.ok(w.map.pois.some((p) => W.storeOf(p) === id), `a place that is ${id}`);
  // every store kind of the catalogue is sold at a walk-in store
  const kinds = [...new Set(LK.PIECES.filter((P) => P && P.price > 0).map((P) => P.store))];
  for (const k of kinds) {
    const poi = w.map.pois.find((p) => p.outside && WALK_IN.has(p.kind) && W.storeOf(p) && W.stock(W.storeOf(p)).some((id) => LK.PIECES[id].store === k));
    assert.ok(poi, `the ${k} pieces are sold at a walk-in store`);
  }
  // the new stores by district: the surf shop by the sea, the boutique on the Neon Strip's side of town...
  for (const id of ['velvet', 'dept', 'afterglow', 'kicks', 'kickflip', 'surf', 'thrift', 'feed', 'workwear', 'surplus', 'outfitter']) assert.ok(storePoi(w, id), `${id} is a walk-in`);
  assert.ok(w.map.pois.some((p) => p.kind === 'barber' && !p.salon && p.outside), 'a barbershop');
  assert.ok(w.map.pois.some((p) => p.kind === 'barber' && p.salon && p.outside), 'a hair salon');
  // prices follow the catalogue (times the store's markup)
  const tee = LK.PIECE_IDS['Plain tee'];
  assert.equal(W.priceAt('threads', tee), LK.PIECES[tee].price);
  assert.ok(W.priceAt('thrift', LK.PIECE_IDS['Leather jacket']) < W.priceAt('afterglow', LK.PIECE_IDS['Leather jacket']), 'vintage is cheaper');
});

test('owning: a new player owns the starting look they pick and the basics; after that only what they own is worn', () => {
  const w = makeWorld();
  const a = join(w);
  assert.deepEqual(a.prof.wardrobe, W.BASICS, 'the basics: a plain tee, jeans, trainers');
  assert.equal(looks.stateMsg(a.p).free, true, 'the first session is free');
  // the first session: anything goes ("Make it yours"), and what it ends in is theirs
  const mine = LK.decodeLook(LK.encodeLook(LK.STARTERS[4].look));   // The Executive: a suit, oxfords, a watch, a briefcase...
  mine.outfit.hat = LK.item('Top hat');
  set(a, mine);
  assert.equal(a.prof.look, LK.encodeLook(mine));
  for (const id of W.lookPieces(mine)) assert.ok(W.owns(a.prof.wardrobe, id), `${LK.PIECES[id].name} is theirs`);
  assert.equal(looks.stateMsg(a.p).free, false);
  run(w, 1.1);
  // a piece they don't own: refused (with where to buy it)
  const L2 = LK.decodeLook(a.prof.look); L2.outfit.jacket = LK.item('Fur coat');
  set(a, L2);
  assert.notEqual(a.prof.look, LK.encodeLook(L2), 'not theirs: refused');
  // their own things, in any colour: free
  const L3 = LK.decodeLook(a.prof.look); L3.outfit.set = null; L3.outfit.top = LK.item('Plain tee', 'red'); L3.outfit.bottoms = LK.item('Jeans', 'black'); L3.outfit.shoes = LK.item('Sneakers');
  set(a, L3);
  assert.equal(a.prof.look, LK.encodeLook(L3), 'owned: worn');
  run(w, 1.1);
  // hair changes at a barber; body and face at the mirror at home
  const L4 = LK.decodeLook(a.prof.look); L4.hair.style = 10;
  set(a, L4);
  assert.notEqual(a.prof.look, LK.encodeLook(L4), 'a new haircut: not from the menu');
  const L5 = LK.decodeLook(a.prof.look); L5.body.build = 4;
  set(a, L5);
  assert.notEqual(a.prof.look, LK.encodeLook(L5), 'a new body: not out in the street');
  a.p.ped.hidden = true; a.p.lookHomeAt = w.time;
  set(a, L5);
  assert.equal(a.prof.look, LK.encodeLook(L5), 'at the mirror at home: free');
  a.p.ped.hidden = false; a.p.lookHomeAt = undefined;
  // a saved look must be theirs too
  looks.handle(w, a.p, { t: 'look', a: 'save', n: 'Fancy', c: LK.encodeLook(L2) });
  assert.equal(a.prof.looks.length, 0, 'not saved: the fur coat isn\'t theirs');
  looks.handle(w, a.p, { t: 'look', a: 'save', n: 'Mine', c: a.prof.look });
  assert.equal(a.prof.looks.length, 1);
});

test('owning: a player from before the shops owns what they wear and what they saved', () => {
  const w = makeWorld();
  const old = LK.encodeLook(LK.randomLook(31337, 'm', 'business'));
  const saved = LK.encodeLook(LK.randomLook(31338, 'f', 'beach'));
  const a = join(w, { look: old, lookPicked: true, looks: [{ n: 'Beach', c: saved }] });
  for (const id of [...W.lookPieces(LK.decodeLook(old)), ...W.lookPieces(LK.decodeLook(saved))]) assert.ok(W.owns(a.prof.wardrobe, id));
  for (const id of W.BASICS) assert.ok(a.prof.wardrobe.includes(id));
  // the home's "Change outfit" picks from the wardrobe
  const c = looks.freshOutfit(a.prof, 99, true);
  assert.deepEqual(W.unowned(a.prof.wardrobe, LK.decodeLook(c)), []);
});

test('the fitting room: Buy puts it in the wardrobe, Buy and wear puts it on - priced, paid from cash, then the bank', () => {
  const w = makeWorld();
  const a = picked(w, { cash: 100, bank: 1000 });
  const poi = storePoi(w, 'velvet');
  at(a, poi);
  // the counter's menu has the fitting room, which opens the try-on screen with the store and your money
  const menu = economy.buildMenu(w, a.p, poi);
  assert.ok(menu.opts.some((o) => o.id === 'fit'));
  a.conn.sent.length = 0;
  economy.handleMenu(w, a.p, poi.id, 'fit');
  const open = a.conn.sent.find((m) => m.t === 'looks' && m.open === 'shop');
  assert.ok(open && open.shop.store === 'velvet' && open.shop.poi === poi.id && open.cash === 100 && open.bank === 1000);
  // Buy: the blazer, $168 (140 times the boutique's 1.2): $100 cash, then $68 from the bank
  const blazer = LK.PIECE_IDS.Blazer;
  assert.ok(W.stocks('velvet', blazer));
  const price = W.priceAt('velvet', blazer);
  assert.equal(price, 168);
  const before = a.prof.look;
  looks.handle(w, a.p, { t: 'look', a: 'buy', poi: poi.id, ids: [blazer] });
  assert.ok(a.prof.wardrobe.includes(blazer), 'it\'s theirs');
  assert.equal(a.prof.cash, 0); assert.equal(a.prof.bank, 1000 - (price - 100));
  assert.equal(a.prof.look, before, 'Buy alone: not worn');
  // a piece the store doesn't sell, or one already owned: nothing happens
  const bank0 = a.prof.bank;
  looks.handle(w, a.p, { t: 'look', a: 'buy', poi: poi.id, ids: [LK.PIECE_IDS['Swim trunks']] });
  looks.handle(w, a.p, { t: 'look', a: 'buy', poi: poi.id, ids: [blazer] });
  assert.equal(a.prof.bank, bank0);
  assert.ok(!a.prof.wardrobe.includes(LK.PIECE_IDS['Swim trunks']));
  // Buy and wear: the oxfords and the blazer worn now (in navy)
  const ox = LK.PIECE_IDS.Oxfords;
  const L = LK.decodeLook(a.prof.look); L.outfit.jacket = LK.item('Blazer', 'navy'); L.outfit.shoes = LK.item('Oxfords');
  run(w, 1.1);
  looks.handle(w, a.p, { t: 'look', a: 'buy', poi: poi.id, ids: [ox], wear: LK.encodeLook(L) });
  assert.ok(a.prof.wardrobe.includes(ox));
  assert.equal(a.prof.look, LK.encodeLook(L), 'worn');
  assert.equal(a.p.ped.app.lk, a.prof.look);
  assert.equal(a.prof.bank, bank0 - W.priceAt('velvet', ox));
  // not enough money: nothing bought
  a.prof.cash = 0; a.prof.bank = 10;
  const gown = LK.PIECE_IDS['Evening gown'];
  looks.handle(w, a.p, { t: 'look', a: 'buy', poi: poi.id, ids: [gown] });
  assert.ok(!a.prof.wardrobe.includes(gown)); assert.equal(a.prof.bank, 10);
  // away from the counter: nothing
  a.prof.bank = 5000;
  teleport(w, a.p.ped, poi.x + 600, poi.y);
  looks.handle(w, a.p, { t: 'look', a: 'buy', poi: poi.id, ids: [gown] });
  assert.ok(!a.prof.wardrobe.includes(gown));
});

test('the fitting room while wanted: Buy and wear is a change of clothes - a disguise, unless a cop is watching', () => {
  const w = makeWorld();
  const a = picked(w, { cash: 1000 });
  const poi = storePoi(w, 'surplus');
  at(a, poi);
  a.p.wanted = 2; a.p.seenAt = w.time - 10;
  const L = LK.decodeLook(a.prof.look); L.outfit.glasses = LK.item('Balaclava');
  // wearing only what you own while wanted: not here
  const L0 = LK.decodeLook(a.prof.look); L0.outfit.hat = null;
  looks.handle(w, a.p, { t: 'look', a: 'buy', poi: poi.id, ids: [], wear: LK.encodeLook(L0) });
  assert.notEqual(a.prof.look, LK.encodeLook(L0));
  // a cop watching: no
  a.p.seenAt = w.time;
  looks.handle(w, a.p, { t: 'look', a: 'buy', poi: poi.id, ids: [LK.PIECE_IDS.Balaclava], wear: LK.encodeLook(L) });
  assert.notEqual(a.prof.look, LK.encodeLook(L));
  assert.equal(a.prof.cash, 1000, 'nothing paid');
  // out of sight: bought, worn, and the public wanted level drops (the peak stays on file)
  a.p.seenAt = w.time - 10;
  looks.handle(w, a.p, { t: 'look', a: 'buy', poi: poi.id, ids: [LK.PIECE_IDS.Balaclava], wear: LK.encodeLook(L) });
  assert.equal(a.prof.look, LK.encodeLook(L));
  assert.equal(a.p.wanted, 0);
  assert.equal(a.p.disguised, true);
  assert.ok(a.prof.peakWanted >= 2);
});

test('the barbershop and the salon: cut, colour, beard and moustache, previewed and paid for', () => {
  const w = makeWorld();
  const a = picked(w, { cash: 200, bank: 0 }, 0);   // The Hustler (a fade, a short beard)
  const shop = w.map.pois.find((p) => p.kind === 'barber' && !p.salon && p.outside);
  const salon = w.map.pois.find((p) => p.kind === 'barber' && p.salon && p.outside);
  at(a, shop);
  const menu = economy.buildMenu(w, a.p, shop);
  assert.ok(menu.opts.some((o) => o.id === 'chair'));
  a.conn.sent.length = 0;
  economy.handleMenu(w, a.p, shop.id, 'chair');
  assert.ok(a.conn.sent.some((m) => m.t === 'looks' && m.open === 'barber' && m.shop.kind === 'barber'));
  // a cut and a colour: both paid
  const L = LK.decodeLook(a.prof.look); L.hair.style = 10; L.hair.color = 14;
  looks.handle(w, a.p, { t: 'look', a: 'cut', poi: shop.id, c: LK.encodeLook(L) });
  assert.equal(a.prof.look, LK.encodeLook(L));
  assert.equal(a.prof.cash, 200 - BARBER_PRICES.cut - BARBER_PRICES.colour);
  // a moustache instead of the beard
  run(w, 1.1);
  const M = LK.decodeLook(a.prof.look); M.hair.facial = W.MOUSTACHES[1];
  looks.handle(w, a.p, { t: 'look', a: 'cut', poi: shop.id, c: LK.encodeLook(M) });
  assert.equal(a.prof.look, LK.encodeLook(M));
  assert.equal(a.prof.cash, 200 - BARBER_PRICES.cut - BARBER_PRICES.colour - BARBER_PRICES.moustache);
  // the chair changes only the hair
  const N = LK.decodeLook(a.prof.look); N.hair.style = 2; N.outfit.jacket = LK.item('Fur coat');
  const cash = a.prof.cash;
  looks.handle(w, a.p, { t: 'look', a: 'cut', poi: shop.id, c: LK.encodeLook(N) });
  assert.notEqual(a.prof.look, LK.encodeLook(N)); assert.equal(a.prof.cash, cash);
  // the salon: cuts and colour, at SALON_K times the price, and no beards
  at(a, salon);
  run(w, 1.1);
  const S = LK.decodeLook(a.prof.look); S.hair.color = 10;
  looks.handle(w, a.p, { t: 'look', a: 'cut', poi: salon.id, c: LK.encodeLook(S) });
  assert.equal(a.prof.look, LK.encodeLook(S));
  assert.equal(a.prof.cash, cash - BARBER_PRICES.colour * SALON_K);
  const B = LK.decodeLook(a.prof.look); B.hair.facial = 3;
  looks.handle(w, a.p, { t: 'look', a: 'cut', poi: salon.id, c: LK.encodeLook(B) });
  assert.notEqual(a.prof.look, LK.encodeLook(B), 'no beards at the salon');
  // not enough money: no cut
  a.prof.cash = 0;
  const C = LK.decodeLook(a.prof.look); C.hair.style = 5;
  looks.handle(w, a.p, { t: 'look', a: 'cut', poi: salon.id, c: LK.encodeLook(C) });
  assert.notEqual(a.prof.look, LK.encodeLook(C));
});

test('the clothes shop\'s new outfit still works, and its pieces are yours', () => {
  const w = makeWorld();
  const a = picked(w, { cash: 500 });
  const poi = w.map.pois.find((p) => p.kind === 'clothing' && p.outside);
  at(a, poi);
  const before = a.prof.look;
  economy.handleMenu(w, a.p, poi.id, 'outfit');
  assert.notEqual(a.prof.look, before);
  assert.equal(a.prof.cash, 380);
  assert.deepEqual(W.unowned(a.prof.wardrobe, LK.decodeLook(a.prof.look)), [], 'the new outfit is theirs');
});
