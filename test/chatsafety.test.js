// The open beta's safety pass (the owner, 11-15 - players 13+): contact details masked in every chat line, lines fishing
// for personal info flagged to the staff's Review list (never blocked), friends (requests, accept / decline, remove,
// never pushed out, first in the contacts), "Remove contact", "Who can text me", and a block that ends a friendship.
import { clock, fakeWorld, fakePlayer } from './launchkit.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { store } from '../server/store.js';
import { createAccounts } from '../server/accounts.js';
import { createModeration, chatData } from '../server/moderation.js';
import { createChat } from '../server/chat.js';
import { filter, contact, fishing } from '../server/chatfilter.js';
import { CHAT, WHO_TEXT } from '../shared/chatdefs.js';
import { guideSections } from '../shared/guide.js';
import { termsPage } from '../server/legal.js';

const LINKS = ['https://discord.gg/zuVSkbfjg', 'https://ko-fi.com/deadbaron'];
function setup(c = clock()) {
  for (const k of Object.keys(store.kept)) delete store.kept[k];
  const A = createAccounts({ store, secret: 'test-secret', now: c.now });
  const mod = createModeration({ store, now: c.now });
  const chat = createChat({ accounts: A, filter: filter(), mod, now: c.now, links: LINKS });
  const w = fakeWorld();
  const P = (o = {}) => { const p = fakePlayer(w, store, o); A.ensure(p.profile).kind = 'member'; return p; };
  const heard = (p, ch) => p.conn.sent.filter((m) => m.t === 'chat' && m.ch === ch && !m.own);
  const said = (p, ch, text, to) => chat.handle(w, p, { t: 'chat', ch, text, to });
  const fr = (p, a, q) => { const out = chat.handle(w, p, { t: 'friend', a, id: chat.hid(q.pid) }); return { res: p.conn.last('friendres'), list: out }; };
  const meet = (a, b) => chat.addContact(a, b, 'met');
  const cd = (p) => chatData(A.get(p.pid));
  return { c, A, mod, chat, w, P, heard, said, fr, meet, cd };
}

test('contact details are masked: phone numbers, emails, links, street addresses, handles in context', () => {
  const masked = {
    'call me 555-123-4567': 'call me ************',
    'my number is (555) 123 4567 ok': 'my number is ***** *** **** ok',
    'text +44 7700 900123': 'text *** **** ******',
    'its 5551234567': 'its **********',
    'five five five one two three four': '**** **** **** *** *** ***** ****',
    'email me jo.smith@gmail.com': 'email me ******************',
    'jo at gmail dot com': '** ** ***** *** ***',
    'go to www.evil.com now': 'go to ************ now',
    'check https://x.co/abc': 'check ****************',
    'check coolsite.net/x': 'check **************',
    'join discord.gg/abcdef': 'join *****************',
    'bit.ly/abc': '**********',
    'google . com': '****** * ***',
    'I live at 221 Baker Street': 'I live at *** ***** ******',
    'come to 12 n main st': 'come to ** * **** **',
    'my snap is jessica': 'my snap is *******',
    'add me on insta cool_kid22': 'add me on insta **********',
    'discord: DeadKid#1234': 'discord: ************',
    'insta: jessicaxo': 'insta: *********',
    'whatsapp @bobby': 'whatsapp ******',
    'im Bobby#4321 there': 'im ********** there',
  };
  for (const [s, want] of Object.entries(masked)) assert.equal(contact(s, LINKS).text, want, s);
  // our own links pass: the site, the Discord invite, the Ko-fi page
  for (const s of ['join discord.gg/zuVSkbfjg', 'https://discord.gg/zuVSkbfjg', 'play.deadbaron.com is up', 'see deadbaron.com/city-life-auto/about/', 'ko-fi.com/deadbaron']) assert.deepEqual(contact(s, LINKS).hits, [], s);
  // game talk stays
  const fine = ['I have $5000', 'got $1,250,000 in the bank', '3 stars on me', 'meet at 10:30', '1,000,000 cash', '1.000.000', '5 blocks down the road', '10 min drive', 'a 5 minute drive', '2 more lanes', 'oh snap', 'snap is cool', 'i play roblox too', 'level 12 with 340 points', 'e.g. this', 'node.js rocks', 'Where are you?', 'join the discord server', 'i have 1000000', 'the dot com bubble', 'gg wp', 'its 3.5 km away', 'ok.so what', 'lol.ok', 'turn left on 5th st', 'race at 9pm', 'heist #2 at the docks', 'top 10', 'wanted level 5 for 120 seconds', '2 cops on the road', 'its 1 way only'];
  for (const s of fine) assert.deepEqual(contact(s, LINKS).hits, [], s);
});

test('fishing for personal info is told (age, home, school, real name, photos, other apps, secrets); ordinary talk is not', () => {
  const kinds = { 'how old are you': 'age', 'how old r u?': 'age', 'asl': 'age', 'age?': 'age', 'are u a boy or a girl': 'age', 'where do u live': 'home', 'whats ur address': 'home', 'what school do you go to': 'school', 'what grade are you in': 'school', 'whats your real name': 'name', 'send me a pic': 'photo', 'send pics': 'photo', 'what do you look like': 'photo', 'add me on snap': 'apps', 'whats ur snap': 'apps', 'do you have discord?': 'apps', 'give me your number': 'apps', 'dont tell your parents': 'secret', 'are your parents home': 'secret', 'keep it a secret ok': 'secret' };
  for (const [s, k] of Object.entries(kinds)) assert.equal(fishing(s), k, s);
  assert.equal(fishing('send pics'), 'photo');
  for (const s of ['Where are you?', 'what is your name', 'nice car', 'race you?', 'how old is this car', 'your number of stars', 'see you at the docks', 'Need a ride?', 'my snap broke lol', 'whats up', 'where are you going']) assert.equal(fishing(s), null, s);
});

test('in chat: masked for everyone and the sender told once; a fishing line still arrives but goes to the Review list, throttled', () => {
  const S = setup();
  const a = S.P({ x: 0, y: 0 }), b = S.P({ x: 100, y: 0 });
  assert.equal(S.said(a, 'near', 'call me 555-123-4567'), null);
  assert.equal(S.heard(b, 'near')[0].text, 'call me ************');
  assert.equal(a.conn.last('chat').text, 'call me ************', 'the sender sees what was shown');
  assert.equal(S.w.notes.filter((n) => n.p === a && /hidden in chat/.test(n.text)).length, 1);
  S.c.add(30e3); S.said(a, 'near', 'jo@mail.com');
  assert.equal(S.w.notes.filter((n) => n.p === a && /hidden in chat/.test(n.text)).length, 1, 'told once a while');
  S.c.add(30e3);
  assert.equal(S.said(a, 'near', 'how old are you?'), null, 'not blocked');
  assert.equal(S.heard(b, 'near').pop().text, 'how old are you?', 'not masked');
  let rv = S.mod.openReviews().filter((r) => r.kind === 'safety');
  assert.equal(rv.length, 1);
  assert.equal(rv[0].who.id, a.pid);
  assert.match(rv[0].note, /age/);
  assert.equal(rv[0].data.lines[0].text, 'how old are you?');
  assert.ok(S.w.notes.some((n) => n.p === b && /Safety tip/.test(n.text)), 'whoever it reached: the tip');
  S.c.add(10e3); S.said(a, 'near', 'where do u live');
  S.c.add(10e3); S.said(a, 'near', 'asl');
  assert.equal(S.mod.openReviews().filter((r) => r.kind === 'safety').length, 1, 'one entry');
  assert.equal(S.w.notes.filter((n) => n.p === b && /Safety tip/.test(n.text)).length, 1, 'the tip once a while');
  S.c.add(CHAT.safetyGapS * 1000);
  S.said(a, 'near', 'send me a pic');
  rv = S.mod.openReviews().filter((r) => r.kind === 'safety');
  assert.equal(rv.length, 1, 'the same player within the hour: counted on it');
  assert.equal(rv[0].n, 2);
  assert.deepEqual(rv[0].data.lines.map((l) => l.text), ['how old are you?', 'where do u live', 'asl', 'send me a pic'], 'the lines between ride along');
  // phone: the one it was sent to is named for the staff
  S.meet(a, b); S.c.add(CHAT.safetyGapS * 1000 + 1);
  S.said(a, 'phone', 'whats ur snap', S.chat.hid(b.pid));
  assert.equal(S.mod.openReviews().find((r) => r.kind === 'safety').data.lines.pop().to, b.name);
});

test('friends: ask, the other side notified, accept; a star first in the list; never pushed out; remove friend keeps the contact', () => {
  const S = setup();
  const a = S.P({ name: 'Ann' }), b = S.P({ name: 'Bo', x: 99999 }), c = S.P({ name: 'Cy', x: 50000 });
  assert.match(S.fr(a, 'ask', b).res.err, /met/, 'a stranger far off: no');
  S.meet(a, b); S.meet(a, c);
  const r = S.fr(a, 'ask', b);
  assert.ok(r.res.ok, r.res.err);
  assert.ok(r.list.l.find((x) => x.n === 'Bo').rs, 'your request shows as waiting');
  assert.ok(S.w.notes.some((n) => n.p === b && /friend request/.test(n.text)), 'notified');
  const bl = b.conn.last('contacts');
  assert.deepEqual(bl.rq.map((x) => x.n), ['Ann'], 'a request row at the top of their Messages');
  assert.match(S.fr(a, 'ask', b).res.err, /waiting/, 'once');
  S.chat.handle(S.w, b, { t: 'friend', a: 'yes', id: S.chat.hid(a.pid) });
  assert.ok(b.conn.last('friendres').ok);
  assert.ok(S.cd(a).contacts[b.pid].fr && S.cd(b).contacts[a.pid].fr, 'friends both ways');
  assert.ok(S.w.notes.some((n) => n.p === a && /accepted/.test(n.text)));
  const l = S.chat.contacts(S.w, a).l;
  assert.equal(l[0].n, 'Bo', 'friends first');
  assert.equal(l[0].fr, 1);
  // never evicted by contactsMax
  for (let i = 0; i < CHAT.contactsMax + 5; i++) { S.c.add(1000); S.meet(a, S.P({ x: 70000 + i })); }
  assert.ok(S.cd(a).contacts[b.pid] && S.cd(a).contacts[b.pid].fr, 'the friend kept');
  assert.equal(Object.values(S.cd(a).contacts).filter((v) => !v.fr).length, CHAT.contactsMax, 'the rest capped');
  S.fr(a, 'unfriend', b);
  assert.ok(S.cd(a).contacts[b.pid] && !S.cd(a).contacts[b.pid].fr && !S.cd(b).contacts[a.pid].fr, 'not friends, still contacts');
});

test('friend requests: decline, lapse, ask again only later, a rate limit, a cap; blocked people can\'t; a block ends a friendship', () => {
  const S = setup();
  const a = S.P(), b = S.P(), c = S.P();
  S.meet(a, b); S.meet(a, c); S.meet(b, c);
  S.fr(a, 'ask', b);
  S.chat.handle(S.w, b, { t: 'friend', a: 'no', id: S.chat.hid(a.pid) });
  assert.ok(!S.cd(b).freq[a.pid], 'declined');
  assert.match(S.fr(a, 'ask', b).res.err, /not long ago/, 'not again so soon');
  S.c.add(CHAT.friendAgainS * 1000 + 1);
  assert.ok(S.fr(a, 'ask', b).res.ok, 'a day later');
  S.c.add(CHAT.friendReqS * 1000 + 1);
  assert.equal(S.chat.contacts(S.w, b).rq.length, 0, 'lapsed');
  // they asked you: asking them back makes you friends
  S.c.add(CHAT.friendAgainS * 1000 + 1);
  S.fr(b, 'ask', c);
  assert.ok(S.fr(c, 'ask', b).res.ok);
  assert.ok(S.cd(b).contacts[c.pid].fr);
  // blocked: sent, as far as they know - nothing arrives
  S.chat.handle(S.w, c, { t: 'mod', a: 'block', id: S.chat.hid(a.pid) });
  assert.ok(S.fr(a, 'ask', c).res.ok);
  assert.ok(!(S.cd(c).freq || {})[a.pid], 'nothing waits for them');
  // a block ends a friendship
  S.chat.handle(S.w, b, { t: 'mod', a: 'block', id: S.chat.hid(c.pid) });
  assert.ok(!S.cd(b).contacts[c.pid].fr && !S.cd(c).contacts[b.pid].fr);
  // rate limit and the target's cap
  const s = S.P();
  const many = Array.from({ length: CHAT.friendRate.n + 1 }, () => { const q = S.P(); S.meet(s, q); return q; });
  for (let i = 0; i < CHAT.friendRate.n; i++) assert.ok(S.fr(s, 'ask', many[i]).res.ok);
  assert.match(S.fr(s, 'ask', many[CHAT.friendRate.n]).res.err, /a lot of friend requests/);
  const t = S.P();
  for (let i = 0; i < CHAT.friendReqMax; i++) { const q = S.P(); S.meet(q, t); assert.ok(S.fr(q, 'ask', t).res.ok); }
  const late = S.P(); S.meet(late, t);
  assert.match(S.fr(late, 'ask', t).res.err, /can't take more/);
});

test('remove contact: gone both ways until you meet again; crew stays; who can text me: friends and crew only', () => {
  const S = setup();
  const a = S.P({ x: 0, y: 0 }), b = S.P({ x: 100, y: 0 }), mate = S.P({ x: 90000 });
  S.meet(a, b);
  assert.ok(S.fr(a, 'forget', b).res.ok);
  assert.ok(!S.cd(a).contacts[b.pid] && !S.cd(b).contacts[a.pid], 'both ways');
  assert.match(S.said(b, 'phone', 'hey', S.chat.hid(a.pid)).err, /met/, 'they can\'t text you');
  for (let i = 0; i <= CHAT.metS; i++) S.chat.update(S.w, 1);
  assert.ok(S.cd(a).contacts[b.pid], 'met again');
  store.kept.crews = { c1: { lead: a.pid, members: [a.pid, mate.pid], names: {} } };
  assert.match(S.fr(a, 'forget', mate).res.err, /crew/);
  // who can text me
  const st = S.chat.handle(S.w, a, { t: 'chatset', who: 'friends' });
  assert.equal(st.who, 'friends');
  assert.equal(S.cd(a).who, 'friends', 'kept with the account');
  S.c.add(30e3);
  assert.match(S.said(b, 'phone', 'yo', S.chat.hid(a.pid)).err, /friends and crew/, 'a contact who isn\'t a friend: no');
  assert.equal(S.said(mate, 'phone', 'crew here', S.chat.hid(a.pid)), null, 'crew yes');
  S.fr(b, 'ask', a); S.chat.handle(S.w, a, { t: 'friend', a: 'yes', id: S.chat.hid(b.pid) });
  S.c.add(30e3);
  assert.equal(S.said(b, 'phone', 'friends now', S.chat.hid(a.pid)), null, 'a friend yes');
  assert.equal(S.heard(a, 'phone').length, 2);
  // the inbox: what came from others while it was "everyone" is dropped once it's friends only
  const d = S.P({ x: 200, y: 0 }); S.meet(a, d);
  S.chat.handle(S.w, a, { t: 'chatset', who: 'met' });
  a.conn = null;
  S.c.add(30e3); S.said(d, 'phone', 'from d', S.chat.hid(a.pid));
  S.c.add(30e3); S.said(b, 'phone', 'from b', S.chat.hid(a.pid));
  S.cd(a).who = 'friends';
  const inbox = S.chat.handle(S.w, { ...a, conn: null }, { t: 'inbox' });
  assert.deepEqual(inbox.l.map((x) => x.text), ['from b']);
  assert.ok(WHO_TEXT.met && WHO_TEXT.friends);
});

test('the Guide teaches friends, who can text me, the hidden contact details and where unblock lives; the Terms say it', () => {
  const S = guideSections().flatMap((s) => s.entries);
  const chat = S.find((e) => e.id === 'chat'), fr = S.find((e) => e.id === 'friends');
  assert.ok(fr, 'a Friends entry');
  assert.match(fr.b, /friend request/i);
  assert.match(fr.b, new RegExp(WHO_TEXT.friends, 'i'));
  assert.match(fr.b, /Remove contact/);
  assert.match(chat.b, /Unblock/);
  assert.match(chat.b, /hidden/);
  const t = termsPage({ contact: 'x@y.z' });
  assert.match(t, /Chat, friends and messages/);
  assert.match(t, /hidden/);
});
