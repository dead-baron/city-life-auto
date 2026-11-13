// Guest names (the owner, 11-12; server/launch.js rename, shared/names.js lookKey): guests pick and change their name
// (filtered, the usual limits) but never one a member owns, nor its lookalike; a member's pick takes a name only guests
// hold (they go back to a Guest number, told why); a guest who signs up or links keeps theirs unless a member owns it,
// and from then on it's protected. Over the head: members white, guests grey (net.js gu, main.js drawWorldLabels), and
// "Guest" in the players list. Guests still can't start or lead a crew or post a bounty.
import { clock, fakeWorld, fakePlayer } from './launchkit.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MemoryStore, useStore, store } from '../server/store.js';
import { config } from '../server/config.js';
import { createLaunch } from '../server/launch.js';
import { lookKey, NAME } from '../shared/names.js';
import { _descriptor } from '../server/net.js';
import { K } from '../shared/constants.js';

const quiet = { log() {}, warn() {}, error() {} };
function setup(over = {}) {
  useStore(new MemoryStore());
  const world = fakeWorld(); world.stats = { tickMs: 0 }; world.time = 100;
  const c = clock();
  const L = createLaunch({ config: { ...config, launch: { ...config.launch, devOpen: true, google: { id: 'g', secret: 's' }, discord: { id: '', secret: '' }, email: { key: '', from: '' }, ...over } }, store, world, ip: () => '1', dataDir: null, now: c.now, log: quiet });
  const join = (o = {}) => { const p = fakePlayer(world, store, o); L.hooks.join(p, {}, {}); return p; };
  const member = (o = {}) => { const p = join(o); L.accounts.signIn('google', `g-${p.pid}`, { linkPid: p.pid }); L.onLinked(p.pid); return p; };
  const name = (p, n) => { p.renameTryAt = 0; p.profile.nameAt = 0; return L.rename(p, n); };   // (the moment and the ten minutes between tries, passed)
  return { L, world, c, join, member, name };
}

test('lookalikes: case, separators and the usual digit swaps aside', () => {
  assert.equal(lookKey('B0b'), lookKey('bob'));
  assert.equal(lookKey('Big_A1'), lookKey('BigAl'));
  assert.equal(lookKey('Z1ggy'), lookKey('Ziggy'));
  assert.equal(lookKey('Barn'), lookKey('Bam'));
  assert.notEqual(lookKey('Rosa'), lookKey('Rose'));
});

test('a guest picks and changes a name - filtered, the limits as before - but never one a member owns, nor its lookalike', () => {
  const S = setup();
  const g = S.join(), m = S.member();
  assert.equal(S.L.acctState(g).canRename, true);
  assert.equal(S.name(g, 'Saltwater'), null);
  assert.equal(g.name, 'Saltwater');
  g.renameTryAt = 0;
  assert.equal(S.L.rename(g, 'Pebbles'), 'That name didn\'t go through - try again in a moment, or pick another.', `${NAME.gapS / 60} minutes between changes`);
  assert.ok(S.world.notes.some((n) => n.p === g && /change your name again in/.test(n.text)));
  assert.ok(S.name(g, 'Big_D1ck'), 'the filter');
  assert.ok(S.name(g, 'Admin'), 'the game\'s own words');
  assert.equal(S.name(m, 'Steve'), null);
  for (const n of ['steve', 'STEVE', 'St_eve', 'St3ve', 'Ste.v3']) assert.match(S.name(g, n), /belongs to a signed-in player/, n);
  assert.equal(g.name, 'Saltwater');
  assert.equal(S.name(g, 'Stevie'), null, 'a different name is fine');
});

test('a member\'s pick takes a name only guests hold: the guest goes back to a Guest number, over their head at once, told why', () => {
  const S = setup();
  const g = S.join(), m = S.member();
  S.name(g, 'Ziggy');
  g.ped.appVer = 1;
  const g2 = S.join(); S.name(g2, 'Z1ggy');
  assert.equal(S.name(m, 'ziggy'), null);
  assert.equal(m.name, 'ziggy');
  for (const q of [g, g2]) {
    assert.match(q.name, /^Guest\d{4}$/);
    assert.equal(q.profile.name, q.name);
    assert.ok(S.world.notes.some((n) => n.p === q && /signed-in player took the name ziggy/.test(n.text)));
  }
  assert.ok(g.ped.appVer > 1, 'the descriptor sent again');
  assert.notEqual(g.name, g2.name);
  // offline too: the profile's name
  const off = S.join(); S.name(off, 'Moonpie'); S.world.players.delete(off.pid); off.conn = null;
  const m2 = S.member(); assert.equal(S.name(m2, 'Moonpie'), null);
  assert.match(store.get(off.pid).name, /^Guest\d{4}$/);
});

test('a guest who signs up or links keeps their name - protected from then on; a name a member already owns goes back to a Guest number', () => {
  const S = setup();
  const g = S.join(); S.name(g, 'Rosalind');
  g.profile.bank = 999;
  // (a link through the endpoints: the account linked, then launch.js's onLinked - test/signin-password.test.js does it over HTTP)
  S.L.accounts.signIn('google', 'g-rosa', { linkPid: g.pid });
  S.L.onLinked(g.pid);
  assert.equal(g.name, 'Rosalind', 'kept');
  assert.equal(g.guest, false);
  assert.equal(store.get(g.pid).bank, 999);
  const g2 = S.join();
  assert.match(S.name(g2, 'Rosalind'), /belongs to a signed-in player/, 'protected now');
  // legacy: two profiles with one name - the one who links second doesn't keep it
  const a = S.member(); S.name(a, 'Twinpeak');
  const b = S.join(); b.profile.name = b.name = 'TwinPeak';
  S.L.accounts.signIn('google', 'g-b', { linkPid: b.pid }); S.L.onLinked(b.pid);
  assert.match(b.name, /^Guest\d{4}$/);
  assert.ok(S.world.notes.some((n) => n.p === b && /Another member owns that name/.test(n.text)));
});

test('over the head: guests flagged (gu) for a grey name, members not; "Guest" in the players list; the page draws it so', async () => {
  const S = setup();
  const g = S.join(), m = S.member();
  const ped = (p) => ({ kind: K.PED, id: p.ped.id, player: p, app: {}, appVer: 0 });
  assert.equal(_descriptor(ped(g)).gu, 1);
  assert.equal(_descriptor(ped(m)).gu, undefined, 'members: nothing extra on the wire');
  const devmode = await import('../server/devmode.js');
  S.world.map.districtAt = () => ({ name: 'Midtown' });
  const l = devmode.playerList(S.world, m).l;
  assert.equal(l.find((e) => e.n === g.name).gu, 1);
  assert.equal(l.find((e) => e.n === m.name).gu, undefined);
  const main = readFileSync(new URL('../client/main.js', import.meta.url), 'utf8');
  assert.match(main, /const gu = p\.d\.gu;/);
  assert.match(main, /gu \? '#a3a8b0' : '#fff'/, 'guests a soft grey, members white');
  assert.match(main, /PF\.BADGE \? \(gu \? '#5c82b8' : '#7ab0ff'\)/, 'the cop blue dimmer for a guest');
  assert.match(main, /\$\{q\.gu \? 'Guest · ' : ''\}/);
});

test('guests still can\'t start or lead a crew or post a bounty while a sign-in is on offer - email + password counts', async () => {
  const crews = await import('../server/systems/crews.js');
  const bounties = await import('../server/systems/bounties.js');
  const S = setup({ google: { id: '', secret: '' } });   // (no provider keys: email + password alone)
  const g = S.join(), m = S.member();
  assert.equal(crews.invite(S.world, g, m), false);
  assert.equal(bounties.place(S.world, g, m.pid, 1000), bounties.GUEST_BOUNTY);
});
