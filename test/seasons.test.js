// Seasons and leaderboards (docs/PROGRESSION.md "Seasons, the beta gift and the wipe"; progression build item 7;
// server/systems/seasons.js): the season's end resets the progress and keeps the account, the looks, the cosmetics and the
// beta gift, with a badge, the top titles and the skills at SEASON.skillKeep; the boards ranked over every profile and
// cached (worked out again on the timer, not per request); each career board's top 10 get a gold plate; a season's rule
// mods applied and put back; the header line; the owner's command.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer, fakeConn, store, run } from './helpers.js';
import { SEASON, SEASONS, COSMETICS, CRATE_PAY, CAREERS } from '../shared/rules.js';
import { PIECE_IDS } from '../shared/lookcore.js';
import { xpTo, levelOf } from '../shared/skills.js';
import * as seasons from '../server/systems/seasons.js';
import * as cosmetics from '../server/systems/cosmetics.js';
import * as players from '../server/systems/players.js';
import * as whatsnext from '../server/systems/whatsnext.js';
import { payFrom } from '../server/systems/economy.js';
import { createAccounts } from '../server/accounts.js';
import { createModeration } from '../server/moderation.js';
import { createAdminLog } from '../server/adminlog.js';
import { createAdmin } from '../server/admin.js';

const DAY = 86400e3;
function fresh() {
  for (const q of [...store.all()]) store.remove(q.pid);
  return makeWorld();   // (store.kept cleared: Season 0 again - seasons.init)
}
const done = { ftue: { st: 'done', tips: 0, m: {} } };
const offline = (pid, o = {}) => Object.assign(store.create(pid), done, o);

test('a new server starts in Season 0, the beta: no end date - it ends with the wipe before launch', () => {
  fresh();
  assert.equal(SEASON.n, 0);
  assert.equal(SEASON.beta, true);
  assert.equal(SEASONS[0].end, null);
  assert.deepEqual(store.kept.season, { n: 0, at: Date.parse(SEASONS[0].start) });
  const h = seasons.header();
  assert.equal(h.left, null);
  assert.match(h.note, /wipe before launch/);
  // a season with no end date: SEASON.weeks from its start
  seasons.use(1, Date.now());
  assert.equal(seasons.header().left, SEASON.weeks * 7);
  assert.match(seasons.header(Date.now() + (SEASON.weeks * 7 - 1) * DAY).note, /^1 day left/);
  seasons.use(0);
});

test('the skills carry over at SEASON.skillKeep of their levels, rounded down', () => {
  const sk = seasons.carrySkills({ xp: { strength: xpTo(7) + 5, stamina: xpTo(1), driving: xpTo(10) } });
  assert.equal(levelOf(sk.xp.strength), Math.floor(7 * SEASON.skillKeep));
  assert.equal(sk.xp.strength, xpTo(Math.floor(7 * SEASON.skillKeep)), 'from the level\'s start');
  assert.equal(sk.xp.stamina, undefined, 'level 1 halves to nothing');
  assert.equal(levelOf(sk.xp.driving), 5);
  assert.deepEqual(sk.today, {});
});

test('the season\'s end: progress reset, the account, looks, cosmetics and beta gift kept, a badge, the skills halved; online players to the title', () => {
  const w = fresh();
  const { p, prof, conn } = joinPlayer(w, { ...done, cash: 9000, bank: 50000, criminalExp: 999999, samaritan: 40 });
  run(w, 1.5);   // (the first session's look: the beta gift, the badge, the top title - cosmetics.update)
  const jk = PIECE_IDS[COSMETICS.beta.jacket];
  assert.ok(prof.wardrobe.includes(jk));
  const sky = COSMETICS.colors.find((c) => c.cash);
  assert.equal(cosmetics.pick(w, p, 'c', sky.id, payFrom), null);
  prof.rep = { Southside: { s: -60, r: 3, o: 2, t: Date.now() } };
  prof.skills = { xp: { strength: xpTo(6), shooting: xpTo(3) }, day: 1, today: { punch: 3 } };
  prof.fishLog = { [Object.keys(prof.fishLog || {})[0] || 'bass']: [1, 9] };
  prof.raceWins = 4; prof.bowlBest = 180;
  const name = prof.name, look = prof.look;
  // someone offline from the beta who never logged in since the badge existed
  const off = offline('a'.repeat(24), { name: 'Offline Olly', cash: 777, policePts: 2500, skills: { xp: { stamina: xpTo(4) } } });
  const r = seasons.endSeason(w);
  assert.equal(r.was, 0); assert.equal(r.n, 1);
  assert.equal(SEASON.n, 1); assert.equal(SEASON.beta, false);
  assert.equal(store.kept.season.n, 1);
  // online: out to the title with why, gone from the world (back in through the door: the new season)
  assert.ok(conn.sent.some((m) => m && m.t === 'kicked' && /Season 0 is over/.test(m.reason)));
  assert.equal(conn.open, false);
  assert.equal(w.players.has(p.pid), false);
  // reset
  for (const q of [prof, off]) {
    assert.equal(q.season, 1);
    assert.equal(q.criminalExp, 0); assert.equal(q.policePts || 0, 0); assert.equal(q.cash, 200); assert.equal(q.bank, 500);
    assert.equal(q.rep, undefined, 'district reputation gone');
    assert.deepEqual(q.homes, []);
    assert.equal(q.raceWins, undefined); assert.equal(q.bowlBest, undefined);
    assert.deepEqual(cosmetics.cosmOf(q).sb, [0], 'the Season 0 badge');
  }
  // kept
  assert.equal(prof.name, name); assert.equal(prof.look, look);
  assert.ok(prof.wardrobe.includes(jk), 'the Founding Citizen jacket survives the season');
  assert.ok(prof.cosm.gifts.beta, 'the beta gift is on the account');
  assert.ok(cosmetics.hasColor(prof, sky.id), 'a bought name color kept');
  assert.equal(cosmetics.hasPlate(prof, 'beta'), true);
  assert.equal(cosmetics.hasPlate(prof, 'r:crime:7'), true, 'Kingpin, with its season');
  assert.deepEqual(prof.cosm.tops.find((t) => t.c === 'crime'), { c: 'crime', s: 0 });
  assert.ok(off.cosm.tops.some((t) => t.c === 'police' && t.s === 0), 'an offline top rank noted at the end too');
  assert.equal(levelOf(prof.skills.xp.strength), 3); assert.equal(prof.skills.xp.shooting, xpTo(1));
  assert.equal(levelOf(off.skills.xp.stamina), 2);
  assert.ok(store.kept.seasons[0] && store.kept.seasons[0].boards.crime.length, 'the season kept in the hall');
  // back in: Season 1, no second beta gift for a new account
  const back = players.join(w, fakeConn(), prof);
  assert.equal(back.profile.season, 1);
  assert.equal(back.profile.cash, 200, 'not reset twice');
  const { prof: nu } = joinPlayer(w);
  run(w, 1.5);
  assert.equal(nu.season, 1);
  assert.equal(cosmetics.cosmOf(nu).gifts.beta, undefined, 'the beta gift is the beta\'s');
  assert.deepEqual(cosmetics.cosmOf(nu).sb, [1], 'playing Season 1: its badge');
});

test('a profile still behind the season when it joins is brought into it', () => {
  const w = fresh();
  seasons.use(1, Date.now());
  const { prof } = joinPlayer(w, { season: 0, cash: 5000, criminalExp: 300 });
  assert.equal(prof.season, 1);
  assert.equal(prof.criminalExp, 0);
  seasons.use(0);
});

test('leaderboards: ranked over every profile, cached - worked out again on the timer, not per request', () => {
  const w = fresh();
  const { p, prof } = joinPlayer(w, { ...done, criminalExp: 50 });
  for (let i = 0; i < 14; i++) offline(String(i).padStart(24, 'b'), { name: `Crook ${i}`, criminalExp: 1000 + i * 100, arcadeBest: i * 10 });
  const t0 = Date.now();
  seasons.refresh(t0);
  let B = seasons.boardsFor(p, t0), crime = B.boards.find((b) => b.id === 'crime');
  assert.equal(crime.t, `Top ${CAREERS.crime.ranks[7].name}`);
  assert.equal(crime.top.length, SEASON.top);
  assert.equal(crime.top[0].n, 'Crook 13'); assert.equal(crime.top[0].i, 1);
  assert.match(crime.top[0].s, /2,300 XP/);
  assert.deepEqual(crime.me, { i: 15, s: crime.me.s }, 'your own place, outside the top 10');
  assert.equal(crime.of, 15);
  const arcade = B.boards.find((b) => b.id === 'arcade');
  assert.equal(arcade.of, 13, 'a zero is not on the board');
  assert.ok(B.boards.some((b) => b.id === 'fish') && B.boards.some((b) => b.id === 'races') && B.boards.some((b) => b.id === 'bowl'));
  // you climb: not on the board until it's worked out again
  prof.criminalExp = 99999;
  B = seasons.boardsFor(p, t0 + 1000);
  assert.equal(B.boards.find((b) => b.id === 'crime').me.i, 15, 'cached');
  // the timer (seasons.update, every SEASON.refreshS by the wall clock)
  const C = seasons.cached();
  C.at = Date.now() - SEASON.refreshS * 1000 - 1;
  run(w, 1.1);
  assert.notEqual(seasons.cached(), C, 'worked out again');
  B = seasons.boardsFor(p);
  assert.equal(B.boards.find((b) => b.id === 'crime').top[0].me, 1, 'top of it now');
  // a banned account isn't on the boards
  store.get(String(13).padStart(24, 'b')).acct = { ban: { at: 1, until: 0 } };
  seasons.refresh();
  assert.equal(seasons.boardsFor(p).boards.find((b) => b.id === 'crime').of, 14);
  // the phone: What's next's header line, and its Boards answer
  const S = whatsnext.handle(w, p, { a: 'boards' });
  assert.equal(S.season.name, 'Season 0');
  assert.equal(S.boards.boards.length, seasons.BOARDS.length);
  assert.equal(whatsnext.handle(w, p, { a: 'next' }).boards, undefined, 'only when asked');
});

test('the season\'s end: each career board\'s top 10 get a gold plate, "S0 Top 10 Kingpin", for good', () => {
  const w = fresh();
  for (let i = 0; i < 12; i++) offline(String(i).padStart(24, 'c'), { name: `Boss ${i}`, criminalExp: 100 + i, bank: 100 });
  const tycoon = offline('d'.repeat(24), { name: 'Money', careers: { v: 1, biz: 5000, seen: {}, props: [], tried: {}, calls: [] } });
  const r = seasons.endSeason(w);
  assert.equal(r.plates.filter((q) => q.c === 'crime').length, 10);
  const first = store.get(String(11).padStart(24, 'c')), tenth = store.get(String(2).padStart(24, 'c')), out = store.get(String(1).padStart(24, 'c'));
  assert.deepEqual(first.cosm.bp, [{ s: 0, c: 'crime', i: 1, of: 10 }]);
  assert.equal(tenth.cosm.bp[0].i, 10);
  assert.deepEqual(out.cosm.bp, [], 'the 11th: none');
  assert.equal(cosmetics.plateText('b:0:crime', first), 'S0 Top 10 Kingpin');
  assert.equal(cosmetics.hasPlate(first, 'b:0:crime'), true);
  assert.equal(cosmetics.hasPlate(out, 'b:0:crime'), false);
  first.cosm.tp = 'b:0:crime';
  assert.deepEqual(cosmetics.plateOf(first), { t: 'S0 Top 10 Kingpin', g: 1 }, 'gold, worn');
  assert.equal(cosmetics.plateText('b:0:business', tycoon), 'S0 Top 10 Tycoon');
  assert.ok(cosmetics.hasPlate(tycoon, 'b:0:business'));
  assert.equal(first.criminalExp, 0, 'and the season reset');
  // on the style counter's menu, and in the Skills app's badges
  const { p } = joinPlayer(w);
  p.profile.cosm = first.cosm;
  assert.ok(cosmetics.menu(w, p, { id: 1 }).opts.some((o) => o.id === 'cosp:b:0:crime'));
  assert.ok(seasons.badges(p).titles.includes('S0 Top 10 Kingpin'));
});

test('a season\'s mods: rule values changed while it runs, put back after ("Gold Rush")', () => {
  fresh();
  const base = CRATE_PAY[4];
  const warn = console.warn; console.warn = () => {};
  try { seasons.use({ n: 7, name: 'Season 7', theme: 'Gold Rush', mods: { 'CRATE_PAY.4': 1.5, 'EXTRACT.vault': { set: 0.9 }, 'NO_SUCH.x': 2 } }); }
  finally { console.warn = warn; }
  assert.equal(SEASON.theme, 'Gold Rush');
  assert.equal(CRATE_PAY[4], base * 1.5);
  assert.equal(seasons.header().name, 'Season 7');
  seasons.use(0);
  assert.equal(CRATE_PAY[4], base, 'put back');
  assert.equal(SEASON.n, 0);
  assert.deepEqual(SEASONS[0].mods, {}, 'Season 0: none');
});

test('the owner\'s command: the season\'s state; its end only with confirm of the season\'s number', () => {
  const w = fresh();
  const A = createAccounts({ store, secret: 'test-secret' });
  const admin = createAdmin({ accounts: A, log: createAdminLog(null), mod: createModeration({ store }), store });
  const { p } = joinPlayer(w, { criminalExp: 500 });
  const a = A.ensure(p.profile); a.kind = 'member';
  p.profile.acct.role = 'owner';
  let r = admin.handle(w, p, { a: 'season' });
  assert.equal(r.ok, true);
  assert.equal(r.data.n, 0);
  assert.equal(r.data.boards.crime[0].v, 500);
  r = admin.handle(w, p, { a: 'season', end: 1 });
  assert.equal(r.ok, false);
  assert.match(r.err, /confirm: 0/);
  assert.equal(SEASON.n, 0, 'nothing ended');
  r = admin.handle(w, p, { a: 'season', end: 1, confirm: 0 });
  assert.equal(r.ok, true);
  assert.equal(r.data.n, 1);
  assert.equal(SEASON.n, 1);
  seasons.use(0);
});
