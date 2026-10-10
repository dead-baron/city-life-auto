// Start fresh (task #413): "an option ... that lets you clear your character entirely and start from scratch ... Should
// have to press this option twice so people don't accidentally hit it, but it will clear you entirely." The server
// deletes the caller's own saved character - never anyone else's - and a login after it is a brand-new account.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeWorld, fakeConn, store } from './helpers.js';
import { K } from '../shared/constants.js';
import { createSession } from '../server/session.js';
import { issueToken, verifyToken, newPlayerId } from '../server/auth.js';
import { MemoryStore } from '../server/store.js';
import { FileStore } from '../server/file-store.js';

// a connection the way server/index.js makes one: the token is the account
function connect(w, token) {
  const conn = fakeConn();
  const s = createSession(w, conn, {
    seed: 1337, dev: false, maxPlayers: 20,
    login(t) {
      const v = verifyToken(t);
      let profile = v ? store.get(v.pid) : null;
      if (profile) return { profile, token: t };
      const pid = v ? v.pid : newPlayerId();
      profile = store.get(pid) || store.create(pid);
      return { profile, token: issueToken(pid) };
    },
  });
  s.onMessage(JSON.stringify({ t: 'hello', token }), false);
  const welcome = conn.sent.find((m) => m && m.t === 'welcome');
  return { s, conn, pid: welcome.pid, token: welcome.token };
}

test('start fresh: the caller\'s character is deleted for good - body, homes, car, profile - and nobody else\'s', () => {
  const w = makeWorld();
  const a = connect(w, null), b = connect(w, null);
  const pa = store.get(a.pid), pb = store.get(b.pid);
  const A = w.players.get(a.pid), ped = A.ped;
  // a character with things to lose
  Object.assign(pa, { cash: 99999, bank: 500000, criminalExp: 400, samaritan: 30, blade: 4 });
  pa.weapons.plasma = 0; pa.weapons.pistol = 60; pa.inventory.medkit = 3; pa.lookPicked = true;
  const home = w.map.homes.findIndex((h) => h);
  pa.homes = [home]; w.homeOwner.set(home, a.pid);
  const car = w.spawnVehicle('sports', ped.x + 60, ped.y, 0, { npcOwned: false });
  car.owner = a.pid; car.ownerName = A.name;
  pb.cash = 777;
  // the message names someone else: ignored - it's always the caller's own
  a.s.onMessage(JSON.stringify({ t: 'wipe', pid: b.pid }), false);
  assert.ok(a.conn.sent.some((m) => m && m.t === 'wiped'), 'told it\'s done');
  assert.equal(a.conn.open, false, 'the connection closed (the page reloads as a new player)');
  assert.equal(store.get(a.pid), null, 'the saved character is gone');
  assert.equal(w.players.has(a.pid), false, 'out of the world');
  assert.ok(ped.removed || !w.entities.has(ped.id), 'no body left behind (no ghost, nothing dropped)');
  assert.equal(w.homeOwner.has(home), false, 'the home is back on the market');
  assert.ok(!w.entities.has(car.id), 'the car out in the street is gone');
  // the other player is untouched
  assert.equal(store.get(b.pid), pb);
  assert.equal(pb.cash, 777);
  assert.ok(w.players.has(b.pid) && w.players.get(b.pid).ped && !w.players.get(b.pid).ped.removed);
  // the closed session takes nothing more
  a.s.onMessage(JSON.stringify({ t: 'wipe' }), false);
  a.s.onMessage(JSON.stringify({ t: 'weapon', id: 'pistol' }), false);
  a.s.onClose();
  assert.equal(store.get(b.pid), pb);
});

test('start fresh: the bounties on your head are called off (the placers paid back), and your car someone is driving is nobody\'s now', () => {
  const w = makeWorld();
  const a = connect(w, null), b = connect(w, null), h = connect(w, null);
  const pa = store.get(a.pid), pb = store.get(b.pid);
  const B = w.players.get(b.pid), H = w.players.get(h.pid);
  // b put $2,500 on a's head (out of the bank, held on a's profile); h, a hunter, took the contract
  pb.bank = 10000 - 2500;
  pa.bounties = [{ id: 'c1', by: b.pid, byName: B.name, amount: 2500, left: 600, placed: Date.now(), takers: [h.pid] },
    { id: 'c2', by: 'dev', byName: 'a test', amount: 1000, left: 600, placed: Date.now(), takers: [] }];   // (a dev test bounty: nobody's money)
  // a's car, with h at the wheel
  const ped = w.players.get(a.pid).ped;
  const car = w.spawnVehicle('sports', ped.x + 80, ped.y, 0, { owner: a.pid, ownerName: w.players.get(a.pid).name, npcOwned: false });
  car.despawnable = false;
  car.seats[0] = H.ped.id;
  const ver = car.descVer || 0;
  B.toasts.length = 0; H.toasts.length = 0;
  a.s.onMessage(JSON.stringify({ t: 'wipe' }), false);
  assert.equal(store.get(a.pid), null);
  assert.equal(pb.bank, 10000, 'the placer\'s money is back in their bank');
  assert.ok(B.toasts.some((t) => /bounty on .* is off/.test(t.text)), 'and they\'re told');
  assert.ok(H.toasts.some((t) => /contract on .* is off/.test(t.text)), 'the hunter on it too');
  assert.ok(w.entities.has(car.id), 'the car someone is driving stays');
  assert.equal(car.owner, null, 'but it is nobody\'s now');
  assert.ok(!car.ownerName && car.despawnable, 'no owner tag; cleared up like any other car');
  assert.ok((car.descVer || 0) > ver, 'everyone sees the owner tag go');
});

test('start fresh: a login after it is a brand-new account (the page drops its token; even the old token gets a new character)', () => {
  const w = makeWorld();
  const a = connect(w, null);
  Object.assign(store.get(a.pid), { cash: 5000, bank: 9000, felonies: 3, lookPicked: true });
  store.get(a.pid).weapons.rifle = 40;
  a.s.onMessage(JSON.stringify({ t: 'wipe' }), false);
  assert.equal(store.get(a.pid), null);
  // the page comes back with no token: a new player id, a new character
  const n = connect(w, null);
  assert.notEqual(n.pid, a.pid);
  const fresh = store.get(n.pid);
  assert.equal(fresh.cash, 200); assert.equal(fresh.bank, 500);
  assert.deepEqual(fresh.weapons, { fists: 0 });
  assert.deepEqual(fresh.homes, []);
  assert.equal(fresh.lookPicked, false, 'the character creator opens: the first-time flow');
  assert.ok(n.conn.sent.some((m) => m && m.t === 'looks' && m.picked === false));
  // a tab that kept the old token in memory gets a fresh character too, nothing of the old one
  const old = connect(w, a.token);
  const back = store.get(old.pid);
  assert.equal(back.cash, 200);
  assert.equal(back.felonies, 0);
  assert.equal(back.weapons.rifle, undefined);
  assert.equal(back.lookPicked, false);
});

test('start fresh: the stores forget the profile (the file store\'s next save leaves it out)', () => {
  const m = new MemoryStore();
  m.create('aa'); m.create('bb');
  assert.equal(m.remove('aa'), true);
  assert.equal(m.get('aa'), null); assert.ok(m.get('bb')); assert.equal(m.count, 1);
  const f = new FileStore();
  f.create('cc11'); f.create('dd22'); f.dirty = false;
  f.remove('cc11');
  assert.equal(f.dirty, true, 'saved soon');
  const saved = JSON.parse(f.serialize()).profiles.map((q) => q.pid);
  assert.ok(!saved.includes('cc11') && saved.includes('dd22'));
});

test('start fresh: two presses, a clear warning, then this browser forgets only the game\'s own data', () => {
  const main = readFileSync(new URL('../client/main.js', import.meta.url), 'utf8');
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /id="s-repair"[^\n]*\n\s*<button id="s-fresh"/, 'under Repair install in Settings (the title screen\'s Settings too)');
  assert.match(main, /add\('⟲ Start fresh: erase my character…'/, 'and in the debug menu');
  const press = main.slice(main.indexOf('function freshPress('), main.indexOf('function freshDisarm('));
  assert.match(press, /FRESH_ARM_MS/, 'the first press arms it for a few seconds');
  assert.match(press, /can\\?'t be undone/i, 'with a clear warning');
  assert.ok(press.indexOf("send({ t: 'wipe' })") > press.indexOf('return;'), 'the wipe goes only on the second press');
  const done = main.slice(main.indexOf('function freshDone('), main.indexOf("$('s-fresh').onclick"));
  assert.match(done, /startsWith\('cla\.'\)/, 'only the game\'s own keys (other games share the site)');
  assert.doesNotMatch(done, /\.clear\(\)/, 'never the whole storage');
  assert.match(done, /S\.token = null/, 'no reconnecting with the old token');
  assert.match(main, /case 'wiped': freshDone\(\)/);
  void K;
});
