// Chat and moderation (server/chat.js, chatfilter.js, moderation.js): the filter and the ways round it, who hears a
// line (range, crew, faction, contacts), the channel toggles, rate limits (guests tighter), strikes and the 24 h mute,
// reports, mutes and blocks, the phone's inbox.
import { clock, fakeWorld, fakePlayer } from './launchkit.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { store } from '../server/store.js';
import { createAccounts } from '../server/accounts.js';
import { createModeration, chatData } from '../server/moderation.js';
import { createChat } from '../server/chat.js';
import { filter } from '../server/chatfilter.js';
import { CHAT } from '../shared/chatdefs.js';

const F = filter();
const M = 32;   // px a metre
function setup(c = clock()) {
  for (const k of Object.keys(store.kept)) delete store.kept[k];
  const A = createAccounts({ store, secret: 'test-secret', now: c.now });
  const mod = createModeration({ store, now: c.now });
  const chat = createChat({ accounts: A, filter: F, mod, now: c.now });
  const w = fakeWorld();
  const member = (p) => { A.ensure(p.profile).kind = 'member'; return p; };
  const P = (o = {}) => member(fakePlayer(w, store, o));
  const heard = (p, ch) => p.conn.sent.filter((m) => m.t === 'chat' && m.ch === ch && !m.own);
  const said = (p, ch, text, to) => chat.handle(w, p, { t: 'chat', ch, text, to });
  return { c, A, mod, chat, w, P, heard, said, member };
}

test('the filter: hate and sexual terms masked through leetspeak, spacing, separators, repeats and look-alike letters', () => {
  const masked = ['n1gg3r', 'N i g g e r', 'n.i.g.g.e.r', 'niiiiggerrr', 'nigg@', 'f@ggot', 'F A G', 'k y s', 'k.y.s', 'kill yourself', 'r3t4rd', 'ret@rded', 'tr4nny', 'p0rn', 'c0ck', 'd1ck', 'b l o w j o b', 'p u s s y', 'wh0re', 'sl00t'.replace('00', 'u'), 'pеdo' /* a Cyrillic е */, 'ｎｉｇｇｅｒ' /* full width */, 'rap3'];
  for (const s of masked) {
    const r = F.check(`hey ${s} there`);
    assert.ok(r.hits.length, `${s} caught`);
    assert.ok(!r.text.includes(s), `${s} masked: ${r.text}`);
    assert.ok(r.text.startsWith('hey ') && r.text.endsWith(' there'), `the rest kept: ${r.text}`);
  }
  assert.ok(F.check('you n1gg3r').hate && !F.check('nice c0ck').hate, 'hate is told apart from sexual');
  const fine = ['nice cocktail', 'my therapist', 'the cockpit', 'Scunthorpe', 'analysis paralysis', 'grape juice', 'a classic assassin', 'pass the glass', 'hello shell', 'cucumber', 'Dickens', 'peacock', 'spicy food', 'go go go', 'damn that was close', 'what the hell'];
  for (const s of fine) assert.deepEqual(F.check(s).hits, [], `${s} left alone`);
  assert.equal(F.check('fuck yeah').text, 'fuck yeah', 'plain swearing is a 17+ game\'s: only usernames refuse it');
});

test('the filter on usernames: profane, hateful, sexual run together refused; ordinary names kept', () => {
  for (const n of ['Big_D1ck', 'Sh1tlord', 'HitlerFan', 'xXn1gg4Xx', 'PornKing', 'Fuuuck', 'K1ll_Yourself']) assert.equal(F.nameOk(n), false, n);
  for (const n of ['Saltwater', 'Swanky', 'Analyst', 'Peacock', 'Cassandra', 'Big_Al', 'Dickson', 'Grapefruit', 'Massive', 'Titan']) assert.equal(F.nameOk(n), true, n);
});

test('near chat: about 40 m, the same level only; the sender sees their own line; speech bubbles carry the ped', () => {
  const S = setup();
  const a = S.P({ x: 1000, y: 1000 }), b = S.P({ x: 1000 + 39 * M, y: 1000 }), far = S.P({ x: 1000 + 41 * M, y: 1000 }), under = S.P({ x: 1010, y: 1000 });
  under.ped.ug = 1;
  assert.equal(S.said(a, 'near', 'hello there'), null);
  assert.equal(S.heard(b, 'near').length, 1);
  assert.equal(S.heard(b, 'near')[0].eid, a.ped.id, 'the bubble goes over the speaker');
  assert.equal(S.heard(far, 'near').length, 0, 'out of range');
  assert.equal(S.heard(under, 'near').length, 0, 'down in the sewers');
  assert.ok(a.conn.sent.some((m) => m.t === 'chat' && m.own), 'echoed to the sender');
});

test('crew and faction chat reach only their own; phone messages only contacts and crewmates', () => {
  const S = setup();
  const a = S.P({ x: 0, y: 0 }), mate = S.P({ x: 90000, y: 0 }), stranger = S.P({ x: 50, y: 0 });
  store.kept.crews = { c1: { lead: a.pid, members: [a.pid, mate.pid], names: {} } };
  assert.equal(S.said(a, 'crew', 'meet at the docks'), null);
  assert.equal(S.heard(mate, 'crew').length, 1, 'a crewmate anywhere');
  assert.equal(S.heard(stranger, 'crew').length, 0);
  assert.match(S.said(stranger, 'crew', 'hi').err, /not in a crew/);
  // faction: police on duty; gang members
  const cop1 = S.P({ badge: true }), cop2 = S.P({ badge: true, x: 99999 });
  const g1 = S.P(), g2 = S.P();
  g1.profile.gang = 'syndicate'; g2.profile.gang = 'syndicate';
  S.said(cop1, 'faction', '10-4');
  assert.equal(S.heard(cop2, 'faction').length, 1);
  assert.equal(S.heard(g1, 'faction').length, 0, 'the gang doesn\'t hear the police');
  S.said(g1, 'faction', 'the drop is on');
  assert.equal(S.heard(g2, 'faction').length, 1);
  assert.equal(S.heard(cop2, 'faction').length, 1, 'nor the police the gang');
  assert.match(S.said(stranger, 'faction', 'anyone?').err, /not in a faction/);
  // phone: a crewmate yes; a stranger no; someone met near you for a few seconds yes
  assert.equal(S.said(a, 'phone', 'you there?', S.chat.hid(mate.pid)), null);
  assert.equal(S.heard(mate, 'phone').length, 1);
  assert.match(S.said(a, 'phone', 'hi', S.chat.hid(stranger.pid)).err, /met/);
  for (let i = 0; i < CHAT.metS; i++) S.chat.update(S.w, 1);
  assert.ok(chatData(S.A.get(a.pid)).contacts[stranger.pid], 'met: a contact both ways');
  assert.ok(chatData(S.A.get(stranger.pid)).contacts[a.pid]);
  S.c.add(30e3);
  assert.equal(S.said(a, 'phone', 'nice to meet you', S.chat.hid(stranger.pid)), null);
  assert.equal(S.heard(stranger, 'phone').length, 1);
  // offline: kept in the inbox
  stranger.conn = null;
  S.c.add(30e3);
  S.said(a, 'phone', 'call me back', S.chat.hid(stranger.pid));
  assert.equal(chatData(S.A.get(stranger.pid)).inbox.length, 1);
  const inbox = S.chat.handle(S.w, stranger, { t: 'inbox' });
  assert.equal(inbox.l[0].text, 'call me back');
  assert.equal(chatData(S.A.get(stranger.pid)).inbox.length, 0);
});

test('toggles, mutes and blocks: a channel off hears nothing; a muted or blocked player\'s lines don\'t arrive', () => {
  const S = setup();
  const a = S.P(), b = S.P(), c = S.P();
  S.chat.handle(S.w, b, { t: 'chatset', off: { near: true } });
  S.said(a, 'near', 'one');
  assert.equal(S.heard(b, 'near').length, 0);
  assert.equal(S.heard(c, 'near').length, 1);
  assert.match(S.said(b, 'near', 'me?').err, /switched off/);
  S.chat.handle(S.w, b, { t: 'chatset', off: { near: false } });
  const r = S.chat.handle(S.w, c, { t: 'mod', a: 'mute', id: S.chat.hid(a.pid) });
  assert.ok(r.ok);
  S.c.add(30e3);
  S.said(a, 'near', 'two');
  assert.equal(S.heard(c, 'near').length, 1, 'muted: the second line didn\'t come');
  assert.equal(S.heard(b, 'near').length, 1);
  S.chat.handle(S.w, b, { t: 'mod', a: 'block', id: S.chat.hid(a.pid) });
  store.kept.crews = { c1: { lead: a.pid, members: [a.pid, b.pid], names: {} } };
  S.c.add(30e3);
  assert.equal(S.said(a, 'phone', 'unblock me', S.chat.hid(b.pid)), null, 'the sender isn\'t told');
  assert.equal(S.heard(b, 'phone').length, 0, 'blocked: nothing arrives');
  assert.equal(chatData(S.A.get(b.pid)).inbox.length, 0);
});

test('rate limits: members a few lines a window, guests fewer and shorter; the same line twice is dropped', () => {
  const S = setup();
  const m = S.P(), g = fakePlayer(S.w, store);
  S.A.ensure(g.profile);
  for (let i = 0; i < CHAT.rate.n; i++) assert.equal(S.said(m, 'near', `line ${i}`), null);
  assert.match(S.said(m, 'near', 'one more').err, /Slow down/);
  for (let i = 0; i < CHAT.guestRate.n; i++) assert.equal(S.said(g, 'near', `guest ${i}`), null);
  assert.match(S.said(g, 'near', 'more').err, /Slow down/);
  S.c.add(CHAT.rate.s * 1000 + 1);
  assert.equal(S.said(m, 'near', 'again'), null);
  assert.match(S.said(m, 'near', 'again').err, /just said/);
  S.said(g, 'near', 'x'.repeat(300));
  const last = g.conn.sent.filter((x) => x.t === 'chat' && x.own).pop();
  assert.equal(last.text.length, CHAT.guestMaxLen);
});

test('strikes: hate speech is a strike (one per gap), three strikes mute chat for 24 h; reports from three members go to review', () => {
  const S = setup();
  const a = S.P(), b = S.P();
  S.said(a, 'near', 'you n1gg3r');
  assert.equal(S.mod.activeStrikes(S.A.get(a.pid)), 1);
  assert.ok(S.heard(b, 'near')[0].text.includes('*'), 'masked for the listener');
  S.c.add(11e3);
  S.said(a, 'near', 'f a g');
  assert.equal(S.mod.activeStrikes(S.A.get(a.pid)), 1, 'a burst is one strike');
  assert.ok(S.mod.openReviews().some((r) => r.kind === 'filter' && r.who.id === a.pid), 'on the review list');
  for (let i = 0; i < 2; i++) { S.c.add(CHAT.filterStrikeGapS * 1000 + 1); S.said(a, 'near', `kys ${i}`); }
  const until = S.mod.mutedUntil(S.A.get(a.pid));
  assert.ok(until > S.c.t + 23.9 * 3600e3, 'muted for 24 h');
  assert.match(S.said(a, 'near', 'hello?').err, /muted/);
  assert.equal(S.mod.activeStrikes(S.A.get(a.pid)), 0, 'the strikes were spent');
  S.c.add(24 * 3600e3 + 1);
  assert.equal(S.said(a, 'near', 'sorry'), null, 'back after the day');
  // reports: members from three different players inside the window go to the review list (an admin decides - no strike,
  // no mute by reports alone); the same one again doesn't count twice
  const t = S.P(), r1 = S.P(), r2 = S.P(), r3 = S.P();
  const rep = (p) => { S.c.add(CHAT.reportGapS * 1000 + 1); return S.chat.handle(S.w, p, { t: 'mod', a: 'report', id: S.chat.hid(t.pid), why: 'harassment' }); };
  rep(r1); rep(r1); rep(r2);
  assert.ok(!S.mod.openReviews().some((r) => r.kind === 'reports'));
  assert.ok(rep(r3).ok);
  assert.ok(S.mod.openReviews().some((r) => r.kind === 'reports' && r.who.id === t.pid));
  assert.equal(S.mod.activeStrikes(S.A.get(t.pid)), 0);
  assert.equal(S.mod.mutedUntil(S.A.get(t.pid)), 0);
});

test('emotes: to the people near you, not too fast', () => {
  const S = setup();
  const a = S.P({ x: 0, y: 0 }), b = S.P({ x: 100, y: 0 }), far = S.P({ x: 5000, y: 0 });
  S.chat.handle(S.w, a, { t: 'emote', e: 'wave' });
  S.chat.handle(S.w, a, { t: 'emote', e: 'cheer' });
  assert.equal(b.conn.sent.filter((m) => m.t === 'emote').length, 1);
  assert.equal(far.conn.sent.filter((m) => m.t === 'emote').length, 0);
  assert.equal(S.chat.emote(S.w, a, 'nope'), false);
});
