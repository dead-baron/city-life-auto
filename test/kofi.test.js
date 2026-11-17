// The Founder's Pack on Ko-fi (server/kofi.js; shared/rules.js SUPPORT; server/systems/cosmetics.js grantFounder): the
// webhook checks Ko-fi's token and keeps each order once; a supporter code in the order's note gives the pack at once; a
// transaction id claims it once, from a full account only, with wrong ids rate-limited; the owner gives and takes it back;
// and everything in it is for looks only.
import { clock, fakeWorld, fakePlayer, call } from './launchkit.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { store, resetOldEpochs, PROGRESS_EPOCH } from '../server/store.js';
import { defaultProfile } from '../server/store.js';
import { createAuthHttp } from '../server/authhttp.js';
import { createAccounts } from '../server/accounts.js';
import { createAdminLog } from '../server/adminlog.js';
import { createModeration } from '../server/moderation.js';
import { createAdmin } from '../server/admin.js';
import { createKofi, supporterCode, codesIn } from '../server/kofi.js';
import * as cosmetics from '../server/systems/cosmetics.js';
import { SUPPORT, COSMETICS } from '../shared/rules.js';
import { PIECES, PIECE_IDS } from '../shared/lookcore.js';
import { PAINTS, SPECIAL_PAINTS } from '../shared/vehicles.js';

const TOKEN = 'kofi-test-token';
function setup({ token = TOKEN, packCodes = [], on = true } = {}) {
  for (const k of Object.keys(store.kept)) delete store.kept[k];
  const c = clock(), A = createAccounts({ store, secret: 'test-secret', now: c.now }), log = createAdminLog(null, c.now), w = fakeWorld();
  const kofi = createKofi({ store, accounts: A, world: w, log, token, packCodes, on: () => on, secret: 'test-secret', now: c.now, ip: () => '1.2.3.4' });
  const P = (member = true) => { const p = fakePlayer(w, store); const a = A.ensure(p.profile); a.kind = member ? 'member' : 'guest'; return p; };
  const hook = (d) => call(kofi.http, { method: 'POST', url: '/kofi/webhook', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'data=' + encodeURIComponent(JSON.stringify(d)) });
  const order = (o = {}) => ({ verification_token: TOKEN, message_id: 'm-' + Math.random(), timestamp: '2026-11-17T12:00:00Z', type: 'Shop Order', is_public: true, from_name: 'Jo Example', message: null, amount: '8.00', url: 'https://ko-fi.com/x', email: 'jo@example.com', currency: 'USD', is_subscription_payment: false, is_first_subscription_payment: false, kofi_transaction_id: '00000000-1111-2222-3333-444444444444', shop_items: [{ direct_link_code: 'abc123def', variation_name: null, quantity: 1 }], tier_name: null, shipping: null, ...o });
  return { c, A, log, w, kofi, P, hook, order };
}
const has = (p) => cosmetics.hasPack(p.profile);

test('the webhook: a wrong or missing token is refused and nothing is kept; no token set answers 503', async () => {
  const S = setup();
  const r = await S.hook(S.order({ verification_token: 'wrong' }));
  assert.equal(r.status, 403);
  assert.deepEqual(S.kofi.orders(), {}, 'nothing kept');
  assert.equal((await S.hook(S.order({ verification_token: undefined }))).status, 403);
  assert.equal((await call(S.kofi.http, { method: 'POST', url: '/kofi/webhook', body: 'nonsense' })).status, 400);
  assert.equal((await call(S.kofi.http, { method: 'GET', url: '/kofi/webhook' })).status, 405);
  const off = setup({ token: '' });
  assert.equal((await off.hook(off.order())).status, 503, 'CLA_KOFI_TOKEN not set');
  assert.deepEqual(off.kofi.orders(), {});
  assert.equal(await S.kofi.http(null, null, new URL('https://x/other')), false, 'other paths are not its');
});

test('an order is kept once per transaction id, without the buyer\'s email, name or note; the same one twice grants once', async () => {
  const S = setup(), p = S.P(), code = supporterCode(p.pid, 'test-secret');
  const d = S.order({ message: `For the game! ${code}` });
  assert.equal((await S.hook(d)).status, 200);
  assert.equal((await S.hook(d)).status, 200, 'Ko-fi sending it again still gets its 200');
  const O = S.kofi.orders(), keys = Object.keys(O);
  assert.deepEqual(keys, ['00000000-1111-2222-3333-444444444444']);
  const o = O[keys[0]];
  assert.equal(o.type, 'Shop Order'); assert.equal(o.amt, '8.00'); assert.equal(o.cur, 'USD'); assert.deepEqual(o.items, ['abc123def']); assert.equal(o.pack, 1); assert.equal(o.by, p.pid);
  const kept = JSON.stringify(O);
  for (const secret of ['jo@example.com', 'Jo Example', 'For the game', TOKEN]) assert.ok(!kept.includes(secret), `not kept: ${secret}`);
  const L = S.log.tail(100);
  assert.equal(L.filter((e) => e.what === 'kofi-grant').length, 1, 'granted once');
  assert.equal(L.filter((e) => e.what === 'kofi-order').length, 1, 'one order line in the admin log');
  assert.ok(has(p));
  assert.equal(S.w.notes.filter((n) => n.p === p && /Thank you for supporting/.test(n.text)).length, 1, 'told once');
  assert.equal(S.kofi.order(d), 'dup');
});

test('auto-claim by the supporter code: the coat, the name color, the badge and the paint, at once', async () => {
  const S = setup(), p = S.P();
  const code = S.kofi.state(p).code;
  assert.match(code, /^CLA-[2-9A-HJKMNP-Z]{6}$/);
  assert.equal(code, supporterCode(p.pid, 'test-secret'));
  assert.deepEqual(codesIn(`thanks!! ${code.slice(4).toLowerCase()}`), ['CLA-THANKS', code]);
  await S.hook(S.order({ message: `thanks!! ${code.slice(4).toLowerCase()}`, kofi_transaction_id: 'aaaa-1' }));
  assert.ok(has(p));
  assert.ok(p.profile.wardrobe.includes(PIECE_IDS[SUPPORT.coat]), 'the coat is in the wardrobe');
  assert.equal(cosmetics.cosmOf(p.profile).nc, SUPPORT.color, 'the supporter color worn');
  assert.equal(cosmetics.plateOf(p.profile).c, COSMETICS.colors.find((c) => c.id === SUPPORT.color).hex);
  assert.ok(cosmetics.hasPlate(p.profile, SUPPORT.plate) && cosmetics.cardPlate(SUPPORT.plate), 'the badge: a card plate, never over the name');
  assert.equal(p.supporter, true);
  assert.equal(S.kofi.orders()['aaaa-1'].how, 'code');
  // switched off and on from Settings
  assert.equal(S.kofi.message(p, { k: 'color', on: false }).color, false);
  assert.equal(cosmetics.cosmOf(p.profile).nc, null);
  assert.equal(S.kofi.message(p, { k: 'color', on: true }).color, true);
  // a monthly member's next payment, same code: still once
  await S.hook(S.order({ type: 'Subscription', shop_items: null, tier_name: 'Supporter', is_subscription_payment: true, message: code, kofi_transaction_id: 'aaaa-2' }));
  assert.equal(S.kofi.orders()['aaaa-2'].by, p.pid);
});

test('which orders are the pack: the pack\'s shop item or a membership, not a donation', async () => {
  const S = setup({ packCodes: ['abc123def'] }), p = S.P(), code = supporterCode(p.pid, 'test-secret');
  await S.hook(S.order({ type: 'Donation', shop_items: null, message: code, kofi_transaction_id: 'donation-1' }));
  await S.hook(S.order({ shop_items: [{ direct_link_code: 'stickers99', quantity: 1 }], message: code, kofi_transaction_id: 'shop-other' }));
  assert.equal(has(p), false, 'a donation and another shop item are kept, nothing given');
  assert.equal(S.kofi.orders()['donation-1'].pack, 0);
  assert.match(S.kofi.claim(p, 'donation-1'), /isn't the Founder's Pack/);
  await S.hook(S.order({ type: 'Subscription', shop_items: null, tier_name: 'Member', message: code, kofi_transaction_id: 'subscription-1' }));
  assert.ok(has(p), 'a monthly member gets the same pack');
});

test('claim by transaction id: once, by one account; a guest is asked to make an account first', async () => {
  const S = setup(), a = S.P(), b = S.P(), g = S.P(false);
  await S.hook(S.order({ kofi_transaction_id: 'ABCD-1234-ef' }));
  assert.equal(has(a), false, 'no code in the note: waits for a claim');
  const gs = S.kofi.state(g);
  assert.equal(gs.guest, true); assert.equal(gs.code, null, 'no supporter code for a guest');
  assert.match(S.kofi.claim(g, 'abcd-1234-ef'), /Make an account first/);
  assert.equal(has(g), false);
  const r = S.kofi.message(a, { k: 'claim', tx: '  abcd-1234-EF ' });
  assert.equal(r.ok, true); assert.equal(r.has, true);
  assert.ok(has(a));
  assert.equal(S.kofi.orders()['abcd-1234-ef'].how, 'claim');
  assert.match(S.kofi.claim(b, 'abcd-1234-ef'), /claimed by another account/);
  assert.equal(has(b), false);
  assert.match(S.kofi.claim(a, 'abcd-1234-ef'), /yours already/);
  // a guest's code in a note gives nothing (it waits for a claim from a full account)
  const code = supporterCode(g.pid, 'test-secret');
  await S.hook(S.order({ kofi_transaction_id: 'guest-1', message: code }));
  assert.equal(has(g), false);
  assert.equal(S.kofi.orders()['guest-1'].by, null);
});

test('wrong transaction ids are rate-limited', async () => {
  const S = setup(), p = S.P();
  await S.hook(S.order({ kofi_transaction_id: 'real-0001' }));
  for (let i = 0; i < SUPPORT.claimTries; i++) assert.match(S.kofi.claim(p, `nope-000${i}`), /No Ko-fi order/);
  assert.match(S.kofi.claim(p, 'real-0001'), /Too many tries/, 'even the right one waits');
  assert.equal(has(p), false);
  S.c.add(SUPPORT.claimWindowMin * 60e3 + 1);
  assert.equal(S.kofi.claim(p, 'real-0001'), null, 'after the window');
  assert.ok(has(p));
});

test('the owner gives and takes back the pack in the admin panel; a refunded order can\'t be claimed again', async () => {
  const S = setup(), mod = createModeration({ store, now: S.c.now });
  const admin = createAdmin({ accounts: S.A, log: S.log, mod, store, now: S.c.now });
  const owner = S.P(), adm = S.P(), p = S.P();
  S.A.setRole(owner.pid, 'owner'); S.A.setRole(adm.pid, 'admin');
  assert.equal(admin.handle(S.w, adm, { t: 'admin', a: 'pack', id: p.pid, on: 1 }).ok, false, 'the owner\'s alone');
  assert.equal(admin.handle(S.w, owner, { t: 'admin', a: 'pack', id: p.pid, on: 1 }).ok, true);
  assert.ok(has(p));
  assert.equal(admin.handle(S.w, owner, { t: 'admin', a: 'pack', id: p.pid, on: 1 }).ok, false, 'already theirs');
  // a bought one, worn, then refunded
  const q = S.P();
  await S.hook(S.order({ kofi_transaction_id: 'refund-1' }));
  assert.equal(S.kofi.claim(q, 'refund-1'), null);
  const ck = PIECE_IDS[SUPPORT.coat];
  q.profile.vehicles = [{ model: 'sedan', paint: 2, variant: 0, tint: SUPPORT.paint }];
  assert.equal(admin.handle(S.w, owner, { t: 'admin', a: 'pack', id: q.pid, on: 0 }).ok, true);
  assert.equal(has(q), false);
  assert.ok(!q.profile.wardrobe.includes(ck), 'the coat out of the wardrobe');
  assert.equal(cosmetics.cosmOf(q.profile).nc, null, 'the color off');
  assert.equal(q.profile.vehicles[0].tint, undefined, 'the paint off');
  assert.equal(S.kofi.orders()['refund-1'].rev, 1);
  assert.match(S.kofi.claim(q, 'refund-1'), /refunded/);
});

test('cosmetic only: no stats, never sold, nothing but looks changes on a grant', () => {
  const coat = PIECES[PIECE_IDS[SUPPORT.coat]];
  assert.ok(coat && coat.d.gift && coat.price === 0, 'the coat: a gift piece, never sold');
  for (const k of ['armor', 'def', 'hp', 'speed', 'dmg', 'stealth', 'issued']) assert.equal(coat.d[k], undefined, `no ${k} on the coat`);
  const color = COSMETICS.colors.find((c) => c.id === SUPPORT.color), plate = COSMETICS.plates.find((q) => q.id === SUPPORT.plate);
  assert.deepEqual(Object.keys(color).sort(), ['gift', 'hex', 'id', 'name'], 'the color: a hex, nothing else');
  assert.deepEqual(Object.keys(plate).sort(), ['card', 'gift', 'id', 't'], 'the badge: a card plate, nothing else');
  assert.ok(!color.cash && !color.tok, 'not for sale at the style counter');
  assert.notEqual(color.hex.toLowerCase(), '#ffcc33', 'not the owner\'s gold');
  const sp = SPECIAL_PAINTS[SUPPORT.paint];
  assert.deepEqual(Object.keys(sp).sort(), ['hex', 'id', 'name', 'sheen']);
  assert.ok(!PAINTS.includes(sp.hex), 'not a shop paint');
  assert.ok(SUPPORT.paint >= PAINTS.length);
  // a grant changes the cosmetics, the wardrobe and nothing else
  const S = setup(), p = S.P(), prof = p.profile;
  cosmetics.cosmOf(prof); prof.wardrobe ||= [];
  const strip = (o) => { const x = JSON.parse(JSON.stringify(o)); delete x.cosm; delete x.wardrobe; delete x.look; delete x.lookIntro; delete x.lookPicked; delete x.looks; if (x.acct) delete x.acct.pack; return x; };
  const before = strip(prof), hp = p.ped.hp;
  assert.equal(cosmetics.grantFounder(S.w, prof, p), true);
  assert.deepEqual(strip(prof), before, 'no cash, bank, items, weapons, skills or stats');
  assert.equal(p.ped.hp, hp);
});

test('the special paint: free at a Fresh Coat garage for the pack\'s owners, refused to others', () => {
  const S = setup(), p = S.P(), o = S.P();
  const car = () => ({ def: { name: 'Sedan' }, paint: 1, tint: 1, owner: p.pid });
  const pay = () => { throw new Error('the pack\'s paint costs nothing'); };
  const v1 = car();
  assert.match(cosmetics.paintPick(S.w, o, v1, SUPPORT.paint, pay), /comes with the Founder's Pack/);
  assert.equal(v1.tint, 1);
  cosmetics.grantFounder(S.w, p.profile, p);
  const v2 = car(), entry = { tint: 1 };
  assert.equal(cosmetics.paintPick(S.w, p, v2, SUPPORT.paint, pay, entry), null);
  assert.equal(v2.tint, SUPPORT.paint); assert.equal(entry.tint, SUPPORT.paint); assert.equal(v2.paint, 1, 'the base paint kept');
  const menu = cosmetics.paintMenu(p, { id: 'g' }, v2);
  assert.ok(menu.opts.some((x) => x.id === `cpk:${SUPPORT.paint}` && /\(now\)/.test(x.label)));
  assert.ok(!cosmetics.paintMenu(o, { id: 'g' }, v2).opts.some((x) => x.id === `cpk:${SUPPORT.paint}`), 'not offered to others');
});

test('CLA_FOUNDER_PACK off: no code, no claim, no price - orders still kept, the owner can still give it; on: all of it', async () => {
  const S = setup({ on: false }), p = S.P();
  const st = S.kofi.state(p);
  assert.equal(st.on, false);
  for (const k of ['code', 'price', 'guest']) assert.equal(st[k], undefined, `no ${k} while off`);
  await S.hook(S.order({ kofi_transaction_id: 'early-order-1' }));
  assert.equal(S.kofi.orders()['early-order-1'].pack, 1, 'an early order is kept');
  assert.match(S.kofi.claim(p, 'early-order-1'), /isn't on sale yet/);
  assert.equal(has(p), false);
  assert.equal(cosmetics.grantFounder(S.w, p.profile, p), true, 'the owner\'s grant works while off');
  assert.equal(S.kofi.state(p).has, true);
  const S2 = setup({ on: true }), q = S2.P(), st2 = S2.kofi.state(q);
  assert.equal(st2.on, true); assert.match(st2.code, /^CLA-/); assert.equal(st2.price, SUPPORT.price);
  // /launch.json says which (the page's switch): off by default
  const { config } = await import('../server/config.js');
  assert.equal(config.launch.founderPack, false, 'off by default');
  for (const fp of [false, true]) {
    const h = createAuthHttp({ launch: { ...config.launch, founderPack: fp }, accounts: S.A, secret: 'test-secret', now: S.c.now, log: { log() {}, error() {} }, ip: () => '1.1.1.1' });
    const r = await call(h.handle, { url: '/launch.json' });
    assert.equal(r.json().founderPack, fp);
  }
});

test('the pack survives every reset: a new progress epoch, a season\'s end, Start fresh', () => {
  const S = setup(), p = S.P(), prof = p.profile, ck = PIECE_IDS[SUPPORT.coat];
  cosmetics.grantFounder(S.w, prof, p, 'tx-keep-1');
  prof.cash = 99999;
  prof.epoch = PROGRESS_EPOCH - 1;   // (as if PROGRESS_EPOCH were bumped: the beta switch at launch, a future full reset)
  assert.ok(resetOldEpochs(store) >= 1);
  assert.equal(prof.cash, 200, 'the progress reset ran');
  assert.ok(cosmetics.hasPack(prof), 'still owned after the epoch bump');
  assert.ok(prof.wardrobe.includes(ck), 'the coat still in the wardrobe');
  // Start fresh keeps only the account: the pack comes back with the next session
  { const keep = { pid: prof.pid, acct: prof.acct, name: prof.name, created: prof.created }; for (const k of Object.keys(prof)) delete prof[k]; Object.assign(prof, defaultProfile(keep.pid), keep); }   // (what players.js wipeAccount keeps)
  assert.ok(cosmetics.hasPack(prof), 'the account still has it');
  assert.equal(cosmetics.restoreFounder(prof), true);
  assert.ok(prof.wardrobe.includes(ck), 'the coat back');
  assert.ok(cosmetics.hasColor(prof, SUPPORT.color) && cosmetics.hasPlate(prof, SUPPORT.plate));
});
