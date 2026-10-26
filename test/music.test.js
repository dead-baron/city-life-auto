// Music and street performance (the owner's notes part 2: the boombox and the radio, tapes from the record store, the car
// radio, the cardboard mat and the rhythm game, the crowds, the tips, the instruments): shared/music.js (the track list,
// the stations, the chart, the judging), server/systems/music.js (all of it decided there), the songbook the synth plays
// (tools/music/songbook.mjs -> client/sound/songbook/, shared/music-songs.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { makeWorld, joinPlayer, run, teleport } from './helpers.js';
import { K, T, TILE } from '../shared/constants.js';
import { IN } from '../shared/input.js';
import { ITEMS, WEAPONS } from '../shared/items.js';
import { SONGS } from '../shared/music-songs.js';
import {
  TRACKS, TRACK, STATIONS, TAPES, RECORD_STORE, INSTRUMENTS, BEAT_TRACK, stationAt, tapePos, trackSecs, chart, judge, tally, newTally, accuracy,
  crowdSize, mood, jamNotes, freestyleRating, jamRating, tapeId, KINDS,
} from '../shared/music.js';
import { RHYTHM, CROWD, MUSIC_GEAR, MUSIC_PRICES } from '../shared/rules-music.js';
import { MUSIC_KEYS } from '../shared/controls.js';
import { compileScore } from '../tools/music/songbook.mjs';
import * as music from '../server/systems/music.js';
import * as economy from '../server/systems/economy.js';
import * as combat from '../server/systems/combat.js';
import { spawnNpc } from '../server/systems/npc.js';
import * as dance from '../server/systems/dance.js';
import { mulberry32 } from '../shared/rng.js';

const sentTo = (conn) => conn.sent.map((m) => (typeof m === 'string' ? JSON.parse(m) : m));
const events = (conn) => sentTo(conn).filter((m) => m && m.t === 'ev').flatMap((m) => m.l);
const musEv = (conn) => events(conn).filter((e) => e.e === 'mus');
const lastRec = (conn, id) => { let r = null; for (const e of musEv(conn)) { for (const s of e.s || e.all || []) if (s.id === id) r = s; if ((e.off || []).includes(id)) r = null; } return r; };

// an open stretch of pavement or plaza with room round it (for the mat, the crowd)
function openSpot(w) {
  const m = w.map, ok = (x, y) => { const t = m.tileAtPx(x, y); return t === T.PLAZA || t === T.SIDEWALK || t === T.GRASS; };
  for (let ty = m.y0 + 20; ty < m.y0 + m.h - 20; ty += 4) for (let tx = m.x0 + 20; tx < m.x0 + m.w - 20; tx += 4) {
    const x = (tx + 0.5) * TILE, y = (ty + 0.5) * TILE;
    if (m.tileAt(tx, ty) !== T.PLAZA) continue;
    let good = true;
    for (let a = 0; a < 12 && good; a++) for (const d of [40, 80, 130]) if (!ok(x + Math.cos(a / 2) * d, y + Math.sin(a / 2) * d)) { good = false; break; }
    if (good) return { x, y };
  }
  throw new Error('no open plaza');
}
const SONG_MODS = {};
for (const id of ['heist-fm', 'rescue-run', 'kickflip']) SONG_MODS[id] = (await import(`../tools/music/songs/${id}.js`)).default;
const await_import = (id) => SONG_MODS[id];
const clearPeds = (w) => { for (const e of [...w.entities.values()]) if (e.kind === K.PED && !e.player) w.remove(e); };

test('the track list, the songbook and the stations agree; every station plays the same song for everyone at a moment', () => {
  for (const t of TRACKS) {
    assert.ok(SONGS[t.id], `${t.id}: in shared/music-songs.js`);
    assert.ok(existsSync(new URL(`../client/sound/songbook/${t.id}.json`, import.meta.url)), `${t.id}: its score for the synth`);
    assert.ok('file' in t && 'secs' in t, `${t.id}: room for the owner's own recording`);
    if (t.tape) assert.ok(ITEMS[tapeId(t.id)] && ITEMS[tapeId(t.id)].music === 'tape', `${t.id}: a tape`);
  }
  // the songbook made from the scores is the one checked in (run tools/music/songbook.mjs after a song changes)
  for (const id of ['heist-fm', 'rescue-run', 'kickflip']) {
    const song = (await_import(id));
    const { meta, parts } = compileScore(song);
    const book = JSON.parse(readFileSync(new URL(`../client/sound/songbook/${id}.json`, import.meta.url), 'utf8'));
    assert.equal(book.secs, meta.secs, id); assert.equal(SONGS[id].secs, meta.secs, id);
    assert.equal(book.parts.length, parts.length, id);
    assert.ok(parts.every((p) => p.n.length > 0), `${id}: every part has notes`);
  }
  assert.ok(SONGS['rescue-run'].tempo.length === 2, 'a tempo change kept');
  for (let i = 0; i < STATIONS.length; i++) {
    const S = STATIONS[i];
    assert.ok(S.tracks.length >= 2 && S.tracks.every((id) => TRACK[id]), S.name);
    const heard = new Set();
    const total = S.tracks.reduce((a, id) => a + trackSecs(id), 0);
    for (let t = 0; t < total; t += 7) { const a = stationAt(i, t); heard.add(a.track); assert.ok(a.pos >= 0 && a.pos < trackSecs(a.track)); const b2 = stationAt(i, t + total); assert.ok(b2.track === a.track && Math.abs(b2.pos - a.pos) < 1e-6, 'round and round'); }
    assert.equal(heard.size, S.tracks.length, `${S.name}: plays all its songs`);
  }
  assert.notEqual(stationAt(0, 100).track + stationAt(0, 100).pos, stationAt(1, 100).track + stationAt(1, 100).pos);
  assert.ok(Math.abs(tapePos('club', 10, 10 + trackSecs('club') + 2) - 2) < 1e-6, 'a tape goes round');
  assert.ok(RECORD_STORE.every(([id, price]) => ITEMS[id] && price > 0) && TAPES.every((id) => RECORD_STORE.some(([q]) => q === id)), 'the record store sells every tape');
  assert.deepEqual(KINDS.slice(0, 3), ['boombox', 'radio', 'car']);
});

test('the rhythm game: a chart from the song\'s beats (the same from the same seed), the judging, the score and the rating', () => {
  const a = chart('heist-fm', 77), b = chart('heist-fm', 77), c = chart('heist-fm', 78);
  assert.deepEqual(a, b, 'the server and the page make the same chart');
  assert.notDeepEqual(a, c);
  assert.ok(a.length >= 30, `notes enough for a set (${a.length})`);
  const song = SONGS['heist-fm'], beat = 60 / song.tempo[0][1];
  for (let k = 1; k < a.length; k++) assert.ok(a[k].t - a[k - 1].t >= Math.min(0.22, beat / 2) - 2e-3, 'never too close together');
  for (const n of a) { const half = n.t / (beat / 2); assert.ok(Math.abs(half - Math.round(half)) < 0.02, 'on the beat or the half'); assert.ok(n.lane >= 0 && n.lane < 4); }
  assert.ok(a[0].t >= beat * 4 - 2e-3, 'a bar to count in');
  assert.ok(a.filter((n) => n.t > RHYTHM.setS * 2 / 3).length > a.filter((n) => n.t < RHYTHM.setS / 3).length, 'busier as it goes');
  assert.ok(chart('club', 5).at(-1).t > trackSecs('club'), 'a short loop goes round for the whole set');
  const fast = chart('kickflip', 3);
  for (let k = 1; k < fast.length; k++) assert.ok(fast[k].t - fast[k - 1].t >= 0.22 - 2e-3, 'a fast song on its half-time');
  assert.deepEqual([0, 49, -60, 99, 120, -150, 151, 400].map(judge), [0, 0, 1, 1, 2, 2, 3, 3]);
  const good = newTally(), bad = newTally();
  for (let k = 0; k < 30; k++) { tally(good, k % 7 ? 0 : 1); tally(bad, k % 3 ? 3 : 2); }
  assert.ok(good.score > bad.score * 10 && good.best >= 6 && good.rating > 0.85 && bad.rating < 0.25, `${good.score} / ${bad.score}, ${good.rating.toFixed(2)} / ${bad.rating.toFixed(2)}`);
  const run30 = newTally(); for (let k = 0; k < 30; k++) tally(run30, 0);
  assert.ok(run30.score > 30 * RHYTHM.points[0], 'a long combo multiplies');
  assert.ok(accuracy(good) > 0.9 && accuracy(bad) < 0.3);
  // the crowd by the rating: bigger the better, and how they take it
  let last = 99;
  for (const r of [1, 0.9, 0.7, 0.5, 0.3, 0]) { const n = crowdSize(r); assert.ok(n <= last); last = n; }
  assert.equal(crowdSize(0.9), CROWD.max);
  assert.deepEqual([0.9, 0.6, 0.5, 0.35, 0.1].map(mood), ['hype', 'into', 'meh', 'bored', 'boo']);
  assert.ok(freestyleRating([[0, 1], [1, 2], [2, 3]], 3) > freestyleRating([[0, 1]], 3) && freestyleRating([[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 0]], 6) < CROWD.jumpAt, 'freestyle: mix it up - never a big crowd');
  assert.ok(jamRating([1, 2, 3, 4, 5, 6], 6) > jamRating([5], 6) && jamRating([1], 20) < CROWD.leaveAt, 'free play: keep playing');
  // the instruments' notes
  assert.deepEqual(jamNotes('guitar', 0, false, 57, true), [57]);
  assert.equal(jamNotes('sax', 2, true, 60, false).length, 3);
  assert.ok(jamNotes('keytar', 7)[0] > jamNotes('keytar', 0)[0]);
  assert.deepEqual(jamNotes('bucketdrum', 0), [0]);
  for (const k of Object.keys(INSTRUMENTS)) assert.ok(ITEMS[k] && ITEMS[k].music === 'inst' && MUSIC_PRICES[k] > 0, k);
  // the controls the mini-games use
  assert.equal(MUSIC_KEYS.lanes.length, 4); assert.equal(MUSIC_KEYS.pads.length, 8);
});

test('the record store sells tapes, the boombox, the radio, the mat and the instruments; a boombox plays out loud for everyone, in sync', () => {
  const w = makeWorld();
  music.setRng(mulberry32(5));
  const spot = openSpot(w);
  const { p, conn, prof } = joinPlayer(w, { cash: 2000 });
  const { p: q, conn: qc } = joinPlayer(w);
  teleport(w, p.ped, spot.x, spot.y); teleport(w, q.ped, spot.x + 120, spot.y);
  // a record shop's counter (a hand plan's walk-in: poi.walk, store 'records')
  const poi = { id: w.map.pois.length, kind: 'delivery', walk: true, store: 'records', label: 'Second Spin Records', x: spot.x, y: spot.y, r: 40 };
  w.map.pois.push(poi);
  try {
    const menu = economy.buildMenu(w, p, poi);
    const ids = menu.opts.map((o) => o.id);
    for (const it of ['boombox', 'radio', 'dancemat', 'guitar', 'sax', 'bucketdrum', 'keytar', 'violin', tapeId('kickflip')]) assert.ok(ids.some((o) => o.startsWith(`i:${it}:`)), `sells ${it}`);
    const buy = (id) => economy.handleMenu(w, p, poi.id, menu.opts.find((o) => o.id.startsWith(`i:${id}:`)).id);
    buy('boombox'); buy(tapeId('kickflip')); buy('dancemat'); buy('guitar'); buy('radio');
    assert.equal(prof.inventory.boombox, 1); assert.equal(prof.inventory[tapeId('kickflip')], 1); assert.equal(prof.inventory.guitar, 1);
    assert.equal(prof.cash, 2000 - MUSIC_PRICES.boombox - MUSIC_PRICES.tape - MUSIC_PRICES.dancemat - MUSIC_PRICES.guitar - MUSIC_PRICES.radio);
    assert.ok(economy.buildMenu(w, p, poi).opts.find((o) => o.id.startsWith('i:boombox:')).dis, 'one boombox is enough');
  } finally { w.map.pois.pop(); }
  // out of the bag: on, carried, playing a station
  economy.useItem(w, p, 'boombox');
  run(w, 0.2);
  const b = [...w.stage.values()].find((s) => s.k === 'boombox');
  assert.ok(b && b.on && b.att === p.ped.id && b.st === 0, 'carried, on the first station');
  const seen = lastRec(qc, b.id);
  assert.ok(seen && seen.on === 1 && seen.st === 0 && seen.a === p.ped.id, 'the other player is told what it plays');
  // the tape: its song and when it started - the same moment for everyone
  economy.useItem(w, p, tapeId('kickflip'));
  run(w, 0.2);
  const r2 = lastRec(qc, b.id);
  assert.equal(r2.tr, TRACK.kickflip.i); assert.equal(r2.st, -1);
  assert.ok(Math.abs(r2.t0 - b.t0) < 0.01, 'the start time on the wire');
  // the menu: set it down, a station, off; someone joining gets the list
  music.onMenu(w, p, music.MENU_POI, 'mdown');
  assert.equal(b.att, 0);
  economy.useItem(w, p, 'boombox');   // (its menu again)
  music.onMenu(w, p, music.MENU_POI, 'ms:2');
  assert.equal(b.st, 2); assert.equal(b.tr, null);
  const { conn: late } = joinPlayer(w);
  run(w, 0.2);
  const all = musEv(late).find((e) => e.all);
  assert.ok(all && all.all.some((s) => s.id === b.id && s.st === 2 && s.on === 1), 'a player coming in hears it too');
  // left behind, it's packed away
  teleport(w, p.ped, spot.x + MUSIC_GEAR.awayPx + 200, spot.y);
  run(w, MUSIC_GEAR.awayS + 2);
  assert.ok(!w.stage.has(b.id), 'packed away');
  assert.equal(prof.inventory.boombox, 1, 'still yours');
  void conn;
});

test('shoot a boombox and it\'s wrecked: the music winds down, it lies there broken, it\'s gone from the bag', () => {
  const w = makeWorld();
  const spot = openSpot(w);
  const { p, prof } = joinPlayer(w, { inventory: { boombox: 1 } });
  const { p: q, conn: qc } = joinPlayer(w);
  teleport(w, p.ped, spot.x, spot.y);
  economy.useItem(w, p, 'boombox');
  music.onMenu(w, p, music.MENU_POI, 'mdown');
  const b = [...w.stage.values()].find((s) => s.k === 'boombox');
  teleport(w, p.ped, spot.x - 300, spot.y);
  // someone shoots it from across the plaza
  q.profile.weapons.pistol = 48; q.ped.weapon = 'pistol'; q.ped.mag = { pistol: 12 };
  teleport(w, q.ped, b.x - 120, b.y);
  for (let k = 0; k < 4 && !b.br; k++) { q.ped.nextAttack = 0; combat.tryAttack(w, q.ped, 0); run(w, 0.4); }
  assert.ok(b.br, 'wrecked');
  const wr = musEv(qc).flatMap((e) => e.s || []).find((s) => s.id === b.id && s.br);
  assert.ok(wr && wr.on === 1, 'told it broke while playing (the page glitches it and winds it down)');
  assert.ok(!prof.inventory.boombox, 'gone from the owner\'s bag');
  assert.ok(events(qc).some((e) => e.e === 'crowd' && e.k === 'smash'));
  assert.ok(w.stage.has(b.id), 'the wreck lies there');
  run(w, MUSIC_GEAR.wreckS + 1);
  assert.ok(!w.stage.has(b.id), 'and is cleared away');
  // a punch does a little; a blast wrecks it outright
  prof.inventory.radio = 1;
  teleport(w, p.ped, spot.x, spot.y);
  economy.useItem(w, p, 'radio');
  music.onMenu(w, p, music.MENU_POI, 'mdown');
  const r = [...w.stage.values()].find((s) => s.k === 'radio');
  teleport(w, q.ped, r.x - 16, r.y);
  assert.ok(music.swing(w, q.ped, WEAPONS.fists, 0) && r.hp === MUSIC_GEAR.radioHp - MUSIC_GEAR.punch && !r.br, 'a punch dents it');
  combat.blast(w, r.x + 20, r.y, 80, 20, q.ped);
  assert.ok(r.br, 'blown up');
});

test('the car radio: the dance button in a car flicks through the stations, and off', () => {
  const w = makeWorld();
  const { p } = joinPlayer(w);
  const v = [...w.entities.values()].find((e) => e.kind === K.VEH && e.def.kind === 'car' && !e.seats.some((s) => s));
  teleport(w, p.ped, v.x, v.y);
  v.seats[0] = p.ped.id; p.ped.vehId = v.id;
  const press = () => { p.prevBits = 0; music.carRadio(w, p); };
  press();
  const s = [...w.stage.values()].find((x) => x.k === 'car');
  assert.ok(s && s.att === v.id && s.st === 0);
  for (let k = 1; k < STATIONS.length; k++) { press(); assert.equal(s.st, k); }
  press();
  assert.ok(![...w.stage.values()].some((x) => x.k === 'car'), 'off after the last');
  music.onMsg(w, p, { a: 'car', st: 3 });
  assert.equal([...w.stage.values()].find((x) => x.k === 'car').st, 3, 'the phone\'s Radio app: a station');
  void IN;
});

// a player on their mat in an open spot, people walking by
function stageWithCrowd(seed, n = 16) {
  const w = makeWorld();
  music.setRng(mulberry32(seed));
  clearPeds(w);
  const spot = openSpot(w);
  const { p, prof, conn } = joinPlayer(w, { inventory: { dancemat: 1, [tapeId('heist-fm')]: 1 }, cash: 0 });
  teleport(w, p.ped, spot.x, spot.y);
  economy.useItem(w, p, 'dancemat');
  const mat = [...w.stage.values()].find((s) => s.k === 'mat');
  const civs = [];
  for (let k = 0; k < n; k++) { const a = k / n * 6.283, e = spawnNpc(w, 'casual', spot.x + Math.cos(a) * 200, spot.y + Math.sin(a) * 200, 'civ'); e.npc.state = 'wander'; civs.push(e); }
  return { w, p, prof, conn, mat, civs, spot };
}
// play the set: hit every note offMs off (null: miss them all), as the page would - each when it's due
function playSet(w, p, offMs) {
  const P = p.perf;
  const end = P.t0 + RHYTHM.setS + 2;
  while (w.time < end && p.perf === P && P.chart) {
    for (let i = 0; i < P.chart.length; i++) if (!P.judged.has(i) && offMs !== null && Math.abs(w.time - (P.t0 + P.chart[i].t)) < 0.03) music.onMsg(w, p, { a: 'hit', i, o: offMs });
    w.step();
  }
}

test('the rhythm game on the mat: hits judged on the server, a good set draws a big crowd that\'s really into it - jumping, filming, tipping', () => {
  const { w, p, prof, conn, mat } = stageWithCrowd(21);
  music.onMenu(w, p, music.MENU_POI, `mr:heist-fm`);
  const P = p.perf;
  assert.ok(P && P.kind === 'rhythm' && P.track === 'heist-fm' && mat.on && mat.tr === 'heist-fm', 'the mat plays the tape');
  const go = sentTo(conn).find((m) => m.t === 'arcade' && m.game === 'rhythm');
  assert.ok(go && go.seed === P.seed && Math.abs(go.t0 - P.t0) < 0.01, 'the page gets the chart\'s seed and the start');
  assert.deepEqual(chart(go.track, go.seed), P.chart, 'the page makes the same chart');
  // a hit for a note far ahead isn't taken (no scoring the whole set at once)
  music.onMsg(w, p, { a: 'hit', i: P.chart.length - 1, o: 0 });
  assert.equal(P.T.n, 0, 'a hit before its time is ignored');
  let most = 0, jumped = false, filmed = false;
  const watch = () => { for (const id of P.crowd) { const e = w.get(id); if (e.gt === 'dance' && e.dm === 11) jumped = true; if (e.filming === 2) filmed = true; } most = Math.max(most, P.crowd.size); };
  const end = P.t0 + RHYTHM.setS + 2;
  while (w.time < end && p.perf === P) {
    for (let i = 0; i < P.chart.length; i++) if (!P.judged.has(i) && Math.abs(w.time - (P.t0 + P.chart[i].t)) < 0.03) music.onMsg(w, p, { a: 'hit', i, o: 20 });
    w.step();
    if (w.tick % 10 === 0) watch();
  }
  assert.ok(P.T.grades[0] >= P.chart.length - 2, `every note perfect (${P.T.grades})`);
  assert.ok(most >= 9, `a good sized crowd (${most})`);
  assert.ok(jumped, 'jumping'); assert.ok(filmed, 'filming');
  assert.ok(P.tips > 0, `tips in the hat ($${P.tips})`);
  assert.ok(!p.perf, 'the set over');
  const res = musEv(conn).find((e) => e.res);
  assert.ok(res && res.res.score === P.T.score && res.res.acc > 0.95, 'the result to the page');
  assert.ok(prof.cash >= P.tips, 'the hat\'s takings picked up, standing by it');
  assert.ok(events(conn).some((e) => e.e === 'say' && /Woo|Yeah|Encore|Go go|Sick|Again|Whoa/.test(e.text)), 'cheers');
});

test('a sloppy set: the crowd drifts off unamused, some boo', () => {
  const { w, p, conn } = stageWithCrowd(33);
  music.onMenu(w, p, music.MENU_POI, `mr:${BEAT_TRACK}`);
  const P = p.perf;
  // a good start pulls a few in...
  let most = 0;
  const end = P.t0 + RHYTHM.setS + 2;
  while (w.time < end && p.perf === P) {
    const good = w.time < P.t0 + 14;
    for (let i = 0; i < P.chart.length; i++) if (!P.judged.has(i) && Math.abs(w.time - (P.t0 + P.chart[i].t)) < 0.03 && good) music.onMsg(w, p, { a: 'hit', i, o: 30 });
    w.step();
    most = Math.max(most, P.crowd.size);
  }
  // ...then every note missed
  assert.ok(most >= 3, `some stopped to watch (${most})`);
  assert.ok(P.T.rating < CROWD.booAt, `a bad finish (${P.T.rating.toFixed(2)})`);
  assert.ok(P.crowd.size <= 2, `they walked off (${P.crowd.size} left)`);
  assert.ok(events(conn).some((e) => e.e === 'say' && /Boo|Get off|Next|Yawn/.test(e.text)), 'booing');
  assert.ok(events(conn).some((e) => e.e === 'crowd' && e.k === 'boo'));
});

test('instruments: played out loud, the others hear the notes; a gig to a backing track; busking fills the hat; the hat can be swiped', () => {
  const { w, p, prof, conn, civs } = stageWithCrowd(44, 10);
  const { p: q, conn: qc, prof: qprof } = joinPlayer(w);
  teleport(w, q.ped, p.ped.x + 150, p.ped.y);
  prof.inventory.sax = 1;
  economy.useItem(w, p, 'sax');
  const P = p.perf;
  assert.ok(P && P.kind === 'jam' && p.ped.pp === 'sax', 'out, held like the busker\'s');
  assert.ok(sentTo(conn).some((m) => m.t === 'arcade' && m.game === 'jam' && m.inst === 'sax'), 'the jam screen opens');
  for (let k = 0; k < 6; k++) { music.onMsg(w, p, { a: 'note', p: k, c: k === 5 }); run(w, 0.3); }
  const heard = events(qc).filter((e) => e.e === 'jamn' && e.id === p.ped.id);
  assert.ok(heard.length >= 6, `the other player hears the notes (${heard.length})`);
  assert.equal(heard[0].i, INSTRUMENTS.sax.code);
  assert.ok(heard.some((e) => e.n.length === 3), 'a chord');
  for (let k = 0; k < 40; k++) music.onMsg(w, p, { a: 'note', p: 1 });
  assert.ok(P.notes.filter((t) => w.time - t < 1).length <= 14, 'no flood of notes');
  // a gig: the rhythm game, each hit a note
  music.onMsg(w, p, { a: 'gig', track: BEAT_TRACK });
  assert.equal(P.kind, 'gig');
  run(w, 0.1);
  assert.ok(musEv(conn).some((e) => e.go && e.go.track === BEAT_TRACK && e.go.seed === P.seed), 'the set starts on the page');
  const before = events(qc).filter((e) => e.e === 'jamn').length;
  playSet(w, p, 10);
  assert.ok(events(qc).filter((e) => e.e === 'jamn').length > before + 20, 'each hit heard');
  assert.ok(musEv(conn).some((e) => e.res && e.res.acc > 0.9), 'the gig\'s result');
  assert.ok(P.tips > 0 && P.crowd.size >= 4, `busking: a crowd (${P.crowd.size}) and tips ($${P.tips})`);
  assert.equal(P.kind, 'jam', 'back to free play after the set');
  // walk off and leave the hat: anyone can swipe it (a crime); the owner's told
  const hat = w.stage.get(P.hat), takings = hat.c;
  teleport(w, p.ped, hat.x + 140, hat.y);
  run(w, 0.5);
  music.onMsg(w, p, { a: 'stop' });
  assert.ok(!p.perf && w.stage.has(hat.id) && hat.c === takings && takings > 0, 'walked off: the hat lies there with the tips');
  {
    teleport(w, q.ped, hat.x + 10, hat.y);
    const it = music.interaction(w, q);
    assert.ok(it && /Swipe the tips/.test(it.label) && it.crime);
    const cash0 = qprof.cash;
    it.run();
    assert.equal(qprof.cash, cash0 + takings);
    run(w, 0.1);
    assert.ok(events(conn).some((e) => e.e === 'toast' && /swiped/.test(e.text)), 'the owner\'s told');
  }
  assert.ok(p.ped.pp !== 'sax', 'put away');
  void civs;
});

test('freestyle on the mat: the dance button\'s moves draw a small crowd, never a big one', () => {
  const { w, p, mat } = stageWithCrowd(55);
  teleport(w, p.ped, mat.x, mat.y);
  let most = 0;
  for (let k = 0; k < 24; k++) {
    dance.next(w, p);
    run(w, 1.5);
    if (p.perf) most = Math.max(most, p.perf.crowd.size);
  }
  assert.ok(most >= 2 && most <= CROWD.sizes.find(([r]) => r <= 0.66)[1], `a small crowd (${most})`);
});
