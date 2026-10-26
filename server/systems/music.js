// Music and street performance (the owner's notes part 2; the shared part - the track list, the stations, the items, the
// rhythm game's chart and judging, the crowd's moods: shared/music.js; the numbers: shared/rules-music.js). All of it
// decided here; the page only draws it and plays it (client/music/stage.js, client/sound/stage.js):
//   - The boombox and the pocket radio: taken out of the bag they play out loud, carried (on the shoulder, on the hip)
//     or set down; a boombox plays a tape you own or a station, the radio a station. Everyone near hears the same song at
//     the same moment: what's on the wire is which song and when it started (a tape) or which station (the stations run
//     on the world's clock: shared/music.js stationAt). One set down can be shot (or hit, or caught in a blast): wrecked,
//     its music glitches and winds down, and it lies there broken a while; the owner's is gone from their bag.
//   - The car radio: the dance button in a car (G), or the phone's Radio app, flicks through the stations; anyone near
//     hears it through the body, the people in it loud and clear.
//   - The cardboard mat: put it down and dance on it. The dance button freestyles (each press the next move); the action
//     button on it starts the rhythm game to a song (the mat's street beat, or a tape of yours) - the page plays the
//     notes falling down four lanes, sends each hit, and the hits are judged here (in time with the note, with room for the
//     network's lag), scored and rated. The performer dances as the hits land.
//   - The instruments: taken out of the bag you play them - free play (pads and chords, heard by everyone near: the 'jamn'
//     event) or a gig (the rhythm game to a backing track, each hit a note on the instrument).
//   - The crowd: a performance draws the people walking by (npc.js state 'mcrowd': crowdStep), as many as its rating is
//     worth; a good one has them jumping, cheering, filming and tipping into the hat set down by the performer; a bad one
//     and they drift off unamused, some booing as they go. The hat's takings are the performer's to pick up - or anyone's
//     to swipe when they've walked off.
// On the wire: the 'mus' event (broadcast) with the things that play or lie there ({ s: [record] } changed, { off: [id] }
// gone, { all: [record] } for a player coming in, { res } a set's result, { go } a gig's set starting - those two to the
// performer alone), 'jamn' (an instrument's notes, near the player), 'crowd' (a cheer, a boo: its sound), 'say'.
import { K, T } from '../../shared/constants.js';
import { ITEMS, WEAPONS } from '../../shared/items.js';
import { segCircle } from '../../shared/math.js';
import { mulberry32 } from '../../shared/rng.js';
import { PED_BLOCK } from '../../shared/mapcore.js';
import { DANCE_PLAYER } from '../../shared/dance.js';
import {
  TRACK, TRACKS, STATIONS, BEAT_TRACK, KINDS, INSTRUMENTS, tapeId, stationAt, stationName, songOf, chart, judge, newTally, tally, accuracy,
  crowdSize, mood, tipChance, freestyleRating, jamRating, jamNotes, GRADE_NAMES,
} from '../../shared/music.js';
import { MUSIC_GEAR, RHYTHM, CROWD, JAM } from '../../shared/rules-music.js';
import { store } from '../store.js';
import * as law from './law.js';
import { openRide } from './vehicles.js';

export const MENU_POI = -7;   // (the boombox's / the mat's menu: not a place's - economy.js handleMenu asks onMenu first)
const KIND = Object.fromEntries(KINDS.map((k, i) => [k, i]));
const NO_INPUT = { bits: 0, mx: 0, my: 0, aim: 0 };
const CAR_EMPTY_S = 30, CHEER_GAP = [4, 9], MAT_REACH = 34, JAM_WANDER = 70;
const CHEERS = ['Woo!', 'Yeah!', 'Encore!', 'Go go go!', 'Sick!', 'Again!', 'Whoa!'];
const BOOS = ['Boo!', 'Booo...', 'Get off!', 'Next!', 'Yawn.'];
let rng = mulberry32(9301);
export function setRng(r) { rng = r; }   // (tests)

const stage = (world) => (world.stage ||= new Map());
const seekTo = (ped, tx, ty, s = 1) => { const dx = tx - ped.x, dy = ty - ped.y, d = Math.hypot(dx, dy) || 1, m = Math.min(1, d / 24) * s; return { bits: 0, mx: dx / d * m, my: dy / d * m, aim: Math.atan2(dy, dx) }; };
const walkable = (map, x, y) => { const t = map.tileAtPx(x, y); return !PED_BLOCK[t] && t !== T.ROAD && t !== T.BRIDGE && t !== T.WATER && t !== T.DEEP; };
const byPid = (world, pid) => world.players.get(pid) || null;
const touch = (p) => { p.meDirty = true; store.touch(); };
const bump = (ped) => { ped.appVer = (ped.appVer || 0) + 1; };

// ---- the records ----------------------------------------------------------------------------------------------------
// { id, k, x, y, att (the ped carrying it, the car it's in: 0 set down), owner (pid), name, on, tr (a track id: a tape,
//   the mat's or a gig's song), st (a station: -1 none), t0 (when the song started, world time), hp, br (wrecked at),
//   c (the hat's takings), i (an instrument's code), until (a hat or a wreck lying there till) }
function wire(world, s) {
  return { id: s.id, k: KIND[s.k], x: Math.round(s.x), y: Math.round(s.y), a: s.att || 0, tr: s.tr && TRACK[s.tr] ? TRACK[s.tr].i : -1, st: s.st ?? -1, t0: +(s.t0 || 0).toFixed(2), on: s.on ? 1 : 0, br: s.br ? 1 : 0, c: s.c || 0, i: s.i || 0, o: s.name || '' };
}
function send(world, ...ss) { world.broadcast({ e: 'mus', now: +world.time.toFixed(2), tk: world.tick, s: ss.map((s) => wire(world, s)) }); }
function add(world, p, k, x, y, extra = {}) {
  world.stageN = (world.stageN || 0) + 1;
  const s = { id: world.stageN, k, x, y, att: 0, owner: p ? p.pid : null, name: p ? p.name : '', on: false, tr: null, st: -1, t0: world.time, hp: k === 'boombox' ? MUSIC_GEAR.boomboxHp : MUSIC_GEAR.radioHp, br: 0, c: 0, i: 0, at: world.time, ...extra };
  stage(world).set(s.id, s);
  send(world, s);
  return s;
}
function remove(world, s) {
  if (!stage(world).delete(s.id)) return;
  world.broadcast({ e: 'mus', now: +world.time.toFixed(2), tk: world.tick, off: [s.id] });
  const p = s.owner && byPid(world, s.owner);
  if (p && p.mus && p.mus[s.k] === s.id) delete p.mus[s.k];
}
export const list = (world) => [...stage(world).values()].map((s) => wire(world, s));
// a player's own boombox / radio / mat out in the world
function own(world, p, k) {
  const id = p.mus && p.mus[k], s = id && stage(world).get(id);
  return s && !s.br ? s : null;
}
function mine(world, p, k, s) { (p.mus ||= {})[k] = s.id; return s; }
// what's playing on it, in words
function nowPlaying(world, s) {
  if (!s.on) return 'switched off';
  if (s.st >= 0) { const at = stationAt(s.st, world.time); return `${stationName(s.st)}: ${TRACK[at.track].title}`; }
  return s.tr ? `${TRACK[s.tr].title} (${TRACK[s.tr].by})` : 'nothing';
}
const tapesOf = (p) => TRACKS.filter((t) => t.tape && (p.profile.inventory[tapeId(t.id)] || 0) > 0);

// ---- using the items (economy.js useItem: the bag's Use, the quick wheel) ------------------------------------------
export function use(world, p, id) {
  const ped = p.ped, it = ITEMS[id];
  if (!ped || ped.dead || !it || !it.music) return;
  if (ped.vehId) { world.notify(p, it.music === 'radio' || it.music === 'boombox' ? 'In a vehicle: the car radio - the dance button, or the Radio app on your phone.' : 'Not in a vehicle.', 'info'); return; }
  switch (it.music) {
    case 'boombox': case 'radio': {
      const s = own(world, p, it.music);
      if (s) { openMenu(world, p, s); return; }
      const last = (p.musLast ||= {})[it.music] || {};
      const tr = it.music === 'boombox' && last.tr && (p.profile.inventory[tapeId(last.tr)] || 0) > 0 ? last.tr : null;
      const n = mine(world, p, it.music, add(world, p, it.music, ped.x, ped.y, { att: ped.id, on: true, tr, st: tr ? -1 : last.st ?? 0, t0: world.time }));
      world.notify(p, `Your ${it.name.toLowerCase()} is on: ${nowPlaying(world, n)}.`, 'info');
      openMenu(world, p, n);   // (what to play, set it down)
      world.emit(ped.x, ped.y, { e: 'lightclick', x: Math.round(ped.x), y: Math.round(ped.y), on: 1 });
      return;
    }
    case 'tape': {
      let b = own(world, p, 'boombox');
      if (!b && (p.profile.inventory.boombox || 0) <= 0) { world.notify(p, 'A tape needs a boombox to play on - the record stores sell them.', 'warn'); return; }
      if (!b) b = mine(world, p, 'boombox', add(world, p, 'boombox', ped.x, ped.y, { att: ped.id }));
      playTape(world, p, b, it.track);
      return;
    }
    case 'mat': {
      const m = own(world, p, 'mat');
      if (m && Math.hypot(m.x - ped.x, m.y - ped.y) < MAT_REACH + 10) { openMenu(world, p, m); return; }
      if (p.perf) stopPerf(world, p, 'moved');
      const x = ped.x, y = ped.y;
      const mat = m || mine(world, p, 'mat', add(world, p, 'mat', x, y));
      if (m) { m.x = x; m.y = y; send(world, m); }
      world.notify(p, 'You lay the cardboard mat down. Dance on it - the dance button for each move - or pick the rhythm game.', 'info');
      openMenu(world, p, mat);
      return;
    }
    case 'inst': startJam(world, p, id); return;
    default:
  }
}
function playTape(world, p, b, track) {
  b.tr = track; b.st = -1; b.on = true; b.t0 = world.time;
  ((p.musLast ||= {}).boombox ||= {}).tr = track;
  send(world, b);
  world.notify(p, `Tape in: ${TRACK[track].title} - ${TRACK[track].by}.`, 'info');
}
function tune(world, p, s, st) {
  s.st = st; s.tr = null; s.on = true; s.t0 = world.time;
  ((p.musLast ||= {})[s.k] ||= {}).st = st;
  if (s.k === 'boombox') delete p.musLast.boombox.tr;
  send(world, s);
  world.notify(p, `Tuned to ${nowPlaying(world, s)}.`, 'info');
}

// ---- the boombox's and the mat's menus ------------------------------------------------------------------------------
function menuOf(world, p, s) {
  const opts = [], carried = s.att === (p.ped && p.ped.id);
  if (s.k === 'mat') {
    opts.push({ id: `mr:${BEAT_TRACK}`, label: `Rhythm game: ${TRACK[BEAT_TRACK].title}`, note: 'the mat\'s own beat', shut: 1 });
    for (const t of tapesOf(p)) opts.push({ id: `mr:${t.id}`, label: `Rhythm game: ${t.title}`, note: `${t.by} - your tape`, shut: 1 });
    opts.push({ id: 'mfree', label: 'Freestyle', note: 'the dance button: the next move', shut: 1 });
    opts.push({ id: 'maway', label: 'Pick up the mat', shut: 1 });
    return { t: 'menu', poi: MENU_POI, title: 'Your cardboard mat', sub: 'Dance for a crowd: the better the show, the bigger the crowd and the more go in your hat. A sloppy one and they walk off - some boo.', opts, cash: p.profile.cash, bank: p.profile.bank };
  }
  if (s.k === 'boombox') for (const t of tapesOf(p)) opts.push({ id: `mt:${t.id}`, label: `Tape: ${t.title}`, note: s.on && s.tr === t.id ? 'playing' : t.by });
  STATIONS.forEach((S, i) => opts.push({ id: `ms:${i}`, label: `${S.freq} ${S.name}`, note: s.on && s.st === i ? 'playing' : '' }));
  opts.push(s.on ? { id: 'moff', label: 'Switch it off' } : { id: 'mon', label: 'Switch it on' });
  opts.push(carried ? { id: 'mdown', label: 'Set it down here', shut: 1 } : { id: 'mup', label: 'Pick it up and carry it', shut: 1 });
  opts.push({ id: 'maway', label: 'Put it away in your bag', shut: 1 });
  const nm = ITEMS[s.k].name;
  return { t: 'menu', poi: MENU_POI, title: `Your ${nm.toLowerCase()}`, sub: `Now: ${nowPlaying(world, s)}. Everyone near hears it.${s.k === 'boombox' ? ' Tapes from the record stores.' : ''}`, opts, cash: p.profile.cash, bank: p.profile.bank };
}
function openMenu(world, p, s) {
  p.musMenu = s.id;
  if (p.conn) p.conn.sendJSON(menuOf(world, p, s));
}
// a choice from the menu (economy.js handleMenu): true if it was ours
export function onMenu(world, p, poiId, opt) {
  if (poiId !== MENU_POI) return false;
  const s = p.musMenu && stage(world).get(p.musMenu), ped = p.ped;
  if (!s || s.owner !== p.pid || s.br || !ped || ped.dead) { p.musMenu = null; return true; }
  if (opt === 'close') { p.musMenu = null; return true; }
  if (!menuOf(world, p, s).opts.some((o) => o.id === opt)) return true;
  if (!s.att && Math.hypot(s.x - ped.x, s.y - ped.y) > MUSIC_GEAR.reachPx + 30) { world.notify(p, 'You walked away from it.', 'warn'); return true; }
  const [a, b] = opt.split(':');
  let reopen = true;
  if (a === 'mt') playTape(world, p, s, b);
  else if (a === 'ms') tune(world, p, s, Number(b));
  else if (a === 'moff') { s.on = false; send(world, s); }
  else if (a === 'mon') { s.on = true; if (s.st < 0 && !s.tr) s.st = 0; s.t0 = world.time; send(world, s); }
  else if (a === 'mdown') { s.att = 0; s.x = ped.x + Math.cos(ped.a) * 14; s.y = ped.y + Math.sin(ped.a) * 14; send(world, s); reopen = false; world.notify(p, 'Set down. It plays on - anyone can shoot it, mind.', 'info'); }
  else if (a === 'mup') { s.att = ped.id; send(world, s); reopen = false; }
  else if (a === 'maway') { packAway(world, p, s); reopen = false; }
  else if (a === 'mr') { reopen = false; startDance(world, p, s, TRACK[b] ? b : BEAT_TRACK); }
  else if (a === 'mfree') { reopen = false; if (!ped.dancing) { ped.x = s.x; ped.y = s.y; world.place(ped); setMove(ped, DANCE_PLAYER[0]); } world.notify(p, 'Freestyle! The dance button for the next move - mix it up and the crowd grows.', 'info'); }
  touch(p);
  if (reopen) openMenu(world, p, s); else p.musMenu = null;
  return true;
}
function packAway(world, p, s) {
  if (p.perf && (p.perf.src === s.id || s.k === 'mat')) stopPerf(world, p, 'packed');
  remove(world, s);
  world.notify(p, `${ITEMS[s.k].name} back in your bag.`, 'info');
}

// ---- the action button near your things (players.js findInteraction) ------------------------------------------------
export function interaction(world, p) {
  const ped = p.ped;
  if (!ped || ped.dead || ped.vehId || ped.carrying) return null;
  let best = null, bd = MUSIC_GEAR.reachPx;
  for (const s of stage(world).values()) {
    if (s.att || s.br || s.k === 'car' || s.k === 'jam') continue;
    const d = Math.hypot(s.x - ped.x, s.y - ped.y);
    if (d >= bd) continue;
    if (s.k === 'hat') { if (s.c > 0 && !(s.owner !== p.pid && performing(world, s))) { best = s; bd = d; } continue; }
    if (s.owner === p.pid) { best = s; bd = d; }
  }
  if (!best) return null;
  const s = best;
  if (s.k === 'hat') {
    if (s.owner === p.pid) return { label: `Pick up your hat ($${s.c} in it)`, run: () => takeHat(world, p, s) };
    return { label: `Swipe the tips from ${s.name || 'a'}'s hat ($${s.c})`, crime: true, run: () => takeHat(world, p, s) };
  }
  if (s.k === 'mat') return p.perf && p.perf.mat === s.id ? null : { label: 'Your mat: the rhythm game, freestyle, pick it up', run: () => openMenu(world, p, s) };
  return { label: `Your ${ITEMS[s.k].name.toLowerCase()}: ${nowPlaying(world, s)}`, run: () => openMenu(world, p, s) };
}
const performing = (world, hat) => { const p = byPid(world, hat.owner); return !!(p && p.perf && p.perf.hat === hat.id); };
function takeHat(world, p, s) {
  if (!stage(world).has(s.id) || s.c <= 0) return;
  const amt = s.c;
  p.profile.cash += amt;
  world.emit(s.x, s.y, { e: 'cash', x: Math.round(s.x), y: Math.round(s.y) });
  if (s.owner !== p.pid) {
    law.crime(world, p.ped, 'tipTheft', null, s.x, s.y);
    const o = byPid(world, s.owner);
    if (o) world.notify(o, `${p.name} swiped the $${amt} from your hat!`, 'bad');
    world.notify(p, `+$${amt} from the hat.`, 'good');
    s.c = 0; send(world, s);
  } else {
    world.notify(p, `+$${amt} in tips.`, 'good');
    if (p.perf && p.perf.hat === s.id) { s.c = 0; send(world, s); } else remove(world, s);
  }
  touch(p);
}

// ---- the car radio ------------------------------------------------------------------------------------------------
const radioCar = (def) => def.kind === 'car' || def.kind === 'air' || (def.kind === 'boat' && !openRide(def));
function carRec(world, v) { for (const s of stage(world).values()) if (s.k === 'car' && s.att === v.id) return s; return null; }
// the dance button in a vehicle, the phone's Radio app (st: a station, -1 off; undefined: the next one round)
export function carRadio(world, p, st) {
  const ped = p.ped, v = ped && ped.vehId && world.get(ped.vehId);
  if (!v || v.kind !== K.VEH) return false;
  if (!radioCar(v.def)) { world.notify(p, `No radio on a ${v.def.name.toLowerCase()} - a pocket radio or a boombox plays out loud on foot.`, 'info'); return false; }
  let s = carRec(world, v);
  const next = st !== undefined ? st : s ? s.st + 1 : 0;
  if (next < 0 || next >= STATIONS.length) { if (s) remove(world, s); world.notify(p, 'Car radio off.', 'info'); return true; }
  if (!s) s = add(world, p, 'car', v.x, v.y, { att: v.id, owner: null, name: '' });
  s.st = next; s.on = true; s.t0 = world.time; s.empty = 0;
  send(world, s);
  world.notify(p, `Car radio: ${nowPlaying(world, s)}`, 'info');
  return true;
}

// ---- performing: the mat (freestyle, the rhythm game), the instruments (free play, a gig) ----------------------------
function setMove(ped, dm) { ped.gt = 'dance'; ped.dm = dm; ped.dancing = true; ped.vx = 0; ped.vy = 0; bump(ped); }
function hatFor(world, p, x, y) {
  for (const s of stage(world).values()) if (s.k === 'hat' && s.owner === p.pid && Math.hypot(s.x - x, s.y - y) < 120) { s.until = 0; return s; }
  return add(world, p, 'hat', x, y);
}
function newPerf(world, p, kind, extra) {
  if (p.perf) stopPerf(world, p, 'again');
  const ped = p.ped;
  p.perf = { id: (world.perfN = (world.perfN || 0) + 1), kind, at: world.time, x: ped.x, y: ped.y, T: newTally(), moves: [], notes: [], crowd: new Set(), drawAt: world.time + 1, leaveAt: world.time + 3, cheerAt: world.time + 4, lookAt: 0, tipAt: world.time + CROWD.tipEveryS, judged: new Set(), next: 0, ...extra };
  return p.perf;
}
// the rhythm game on your mat: the mat plays the song, the page the notes
function startDance(world, p, mat, track) {
  const ped = p.ped;
  ped.x = mat.x; ped.y = mat.y; world.place(ped);
  const seed = (rng() * 2 ** 31) >>> 0, t0 = world.time + 1.5;
  const hat = hatFor(world, p, mat.x + 30, mat.y + 10);
  const P = newPerf(world, p, 'rhythm', { mat: mat.id, src: mat.id, hat: hat.id, track, seed, t0, chart: chart(track, seed) });
  mat.tr = track; mat.st = -1; mat.on = true; mat.t0 = t0;
  send(world, mat);
  setMove(ped, DANCE_PLAYER[0]);
  if (p.conn) p.conn.sendJSON({ t: 'arcade', game: 'rhythm', id: 0, mode: 'dance', track, seed, t0: +t0.toFixed(2), now: +world.time.toFixed(2), tk: world.tick, setS: RHYTHM.setS });
  return P;
}
// an instrument out of the bag: free play, a hat at your feet
function startJam(world, p, inst) {
  const ped = p.ped, I = INSTRUMENTS[inst];
  if (!I) return null;
  if (ped.dancing) { ped.dancing = false; if (ped.gt === 'dance') { ped.gt = null; ped.dm = undefined; } }
  const hat = hatFor(world, p, ped.x + Math.cos(ped.a) * 26, ped.y + Math.sin(ped.a) * 26);
  const src = add(world, p, 'jam', ped.x, ped.y, { att: ped.id, i: I.code, on: true });
  const P = newPerf(world, p, 'jam', { inst, hat: hat.id, src: src.id, key: 57, minor: true });
  ped.pp = I.pp; ped.vx = 0; ped.vy = 0; bump(ped);
  if (p.conn) p.conn.sendJSON({ t: 'arcade', game: 'jam', id: 0, inst, key: 57, minor: true, tapes: tapesOf(p).map((t) => t.id), now: +world.time.toFixed(2), tk: world.tick, setS: RHYTHM.setS });
  world.notify(p, `You take out your ${ITEMS[inst].name.toLowerCase()}. Play for the people walking by - a good gig fills your hat.`, 'info');
  return P;
}
// a gig: the rhythm game on the instrument, to a backing track (yours, or the street beat)
function startGig(world, p, track) {
  const P = p.perf;
  if (!P || (P.kind !== 'jam' && P.kind !== 'gig')) return;
  if (track !== BEAT_TRACK && !((p.profile.inventory[tapeId(track)] || 0) > 0)) track = BEAT_TRACK;
  const src = stage(world).get(P.src), song = songOf(track), seed = (rng() * 2 ** 31) >>> 0, t0 = world.time + 1.5;
  Object.assign(P, { kind: 'gig', track, seed, t0, chart: chart(track, seed), T: newTally(), judged: new Set(), next: 0, key: song.key, minor: song.minor });
  if (src) { src.tr = track; src.t0 = t0; src.on = true; send(world, src); }
  queue(p, { e: 'mus', now: +world.time.toFixed(2), tk: world.tick, go: { track, seed, t0: +t0.toFixed(2), setS: RHYTHM.setS, key: song.key, minor: song.minor } });
}
const queue = (p, ev) => (p.evq ||= []).push(ev);
// the end of it: the hat's takings to you if you're by it, the result of a set
export function stopPerf(world, p, why = 'stop') {
  const P = p.perf, ped = p.ped;
  if (!P) return;
  p.perf = null;
  if (P.kind === 'rhythm' || P.kind === 'gig') {
    const T = P.T;
    queue(p, { e: 'mus', now: +world.time.toFixed(2), tk: world.tick, res: { score: T.score, acc: +accuracy(T).toFixed(3), best: T.best, grades: T.grades, crowd: P.crowd.size, tips: P.tips || 0, n: P.chart ? P.chart.length : 0 } });
    if (T.n >= 8) world.notify(p, `Set over: ${T.score.toLocaleString()} points, ${Math.round(accuracy(T) * 100)}% on the beat, best combo ${T.best}.${P.tips ? ` $${P.tips} in tips.` : ''}`, accuracy(T) >= 0.7 ? 'good' : 'info');
  }
  const mat = P.mat && stage(world).get(P.mat);
  if (mat) { mat.on = false; mat.tr = null; send(world, mat); }
  if (P.kind === 'jam' || P.kind === 'gig') { const src = stage(world).get(P.src); if (src) remove(world, src); if (ped && INSTRUMENTS[P.inst] && ped.pp === INSTRUMENTS[P.inst].pp) { ped.pp = null; bump(ped); } }
  if (ped && ped.dancing && (P.kind === 'rhythm' || why !== 'danced')) { ped.dancing = false; if (ped.gt === 'dance') { ped.gt = null; ped.dm = undefined; } bump(ped); }
  const hat = stage(world).get(P.hat);
  if (hat) {
    if (ped && !ped.dead && hat.c > 0 && Math.hypot(hat.x - ped.x, hat.y - ped.y) < 90) takeHat(world, p, hat);
    else if (!hat.c) remove(world, hat);
    else hat.until = world.time + CROWD.hatKeepS;
  }
  if (why === 'quit' || why === 'stop') world.emit(P.x, P.y, { e: 'crowd', x: Math.round(P.x), y: Math.round(P.y), k: P.crowd.size >= 4 && rating(world, P) >= CROWD.tipFrom ? 'cheer' : 'clap', n: P.crowd.size });
}
function rating(world, P) {
  if (P.kind === 'rhythm' || P.kind === 'gig') return P.T.rating;
  if (P.kind === 'free') return freestyleRating(P.moves, world.time);
  return jamRating(P.notes, world.time);
}

// ---- from the page (session.js: { t: 'mus', a }) ----------------------------------------------------------------------
export function onMsg(world, p, msg) {
  const P = p.perf, ped = p.ped;
  switch (msg.a) {
    case 'hit': {   // a hit in the rhythm game: i the note, o how far off (ms, as the page heard it)
      if (!P || !P.chart || !ped || ped.dead) return;
      const i = msg.i | 0, n = P.chart[i];
      if (!n || P.judged.has(i)) return;
      const Ts = P.t0 + n.t, now = world.time;
      if (process.env.CLA_MUSDBG) console.log('[musdbg] hit', i, 'now', now.toFixed(2), 'Ts', Ts.toFixed(2), 'o', msg.o);
      if (now < Ts - RHYTHM.earlyS || now > Ts + RHYTHM.lateS) return;   // (not in time with that note by the server's clock: a hit for later, or long gone)
      const g = judge(Math.max(-1000, Math.min(1000, Number(msg.o) || 0)));
      P.judged.add(i);
      onJudged(world, p, P, g, n);
      return;
    }
    case 'note': {   // free play: pad p (0-7), c a chord
      if (!P || P.kind !== 'jam' || !ped || ped.dead) return;
      const now = world.time;
      while (P.notes.length && now - P.notes[0] > JAM.windowS + 1) P.notes.shift();
      if (P.notes.filter((t) => now - t < 1).length >= JAM.maxRate) return;
      P.notes.push(now);
      emitNotes(world, ped, P, jamNotes(P.inst, msg.p | 0, !!msg.c, P.key, P.minor));
      return;
    }
    case 'gig': startGig(world, p, TRACK[msg.track] ? String(msg.track) : BEAT_TRACK); return;
    case 'free': if (P && P.kind === 'gig') { const src = stage(world).get(P.src); if (src) { src.tr = null; send(world, src); } Object.assign(P, { kind: 'jam', chart: null, key: 57, minor: true }); } return;
    case 'stop': if (P) stopPerf(world, p, 'quit'); return;
    case 'car': carRadio(world, p, msg.st === undefined ? undefined : Number(msg.st) | 0); return;
    case 'tune': {   // the phone's Radio app on foot: your radio, else your boombox
      if (ped && ped.vehId) { carRadio(world, p, Number(msg.st) | 0); return; }
      const s = own(world, p, 'radio') || own(world, p, 'boombox');
      if (!s) { world.notify(p, 'Nothing to tune: take out your pocket radio or your boombox (the record stores sell them).', 'info'); return; }
      const st = Number(msg.st) | 0;
      if (st < 0 || st >= STATIONS.length) { s.on = false; send(world, s); return; }
      tune(world, p, s, st);
      return;
    }
    case 'list': if (world.time - (p.musListAt || -9) > 2) { p.musListAt = world.time; queue(p, { e: 'mus', now: +world.time.toFixed(2), tk: world.tick, all: list(world) }); } return;
    default:
  }
}
function emitNotes(world, ped, P, notes) {
  world.emit(ped.x, ped.y, { e: 'jamn', id: ped.id, x: Math.round(ped.x), y: Math.round(ped.y), i: INSTRUMENTS[P.inst].code, n: notes });
}
const LANE_PAD = [0, 2, 4, 6];
function onJudged(world, p, P, g, n) {
  tally(P.T, g);
  const ped = p.ped;
  if (P.kind === 'gig' && g < 3 && n) emitNotes(world, ped, P, jamNotes(P.inst, LANE_PAD[n.lane] + (P.T.combo >= 20 ? 1 : 0), P.T.combo >= 10 && P.T.combo % 4 === 0, P.key, P.minor));
  if (P.kind === 'rhythm') {   // the dance as the hits land: the next move every few in a row; a miss, a stumble back to the two-step
    if (g < 3 && P.T.combo % 4 === 0) setMove(ped, DANCE_PLAYER[(DANCE_PLAYER.indexOf(ped.dm) + 1 + DANCE_PLAYER.length) % DANCE_PLAYER.length]);
    else if (g === 3 && P.T.combo === 0 && ped.dm !== DANCE_PLAYER[0]) setMove(ped, DANCE_PLAYER[0]);
  }
  void GRADE_NAMES;
}

// ---- the crowd ------------------------------------------------------------------------------------------------------
// someone walking by stops to watch: a spot round the performer, facing them
function recruit(world, perfPed, P) {
  const now = world.time, cand = [];
  for (const e of world.query(perfPed.x, perfPed.y, CROWD.drawPx, K.PED)) {
    const n = e.npc;
    if (!n || e.dead || e.vehId || e.hidden || e.onTrain || e.wild || e.pet) continue;
    if (n.role !== 'civ' || n.persona || n.act || n.desk || n.guard || n.keep || n.state !== 'wander') continue;
    if (n.mcSeen && n.mcSeen.perf === P.id && now - n.mcSeen.t < CROWD.againS) continue;
    cand.push(e);
  }
  if (!cand.length) return false;
  cand.sort((a, b) => Math.hypot(a.x - perfPed.x, a.y - perfPed.y) - Math.hypot(b.x - perfPed.x, b.y - perfPed.y));
  const e = cand[Math.floor(rng() * Math.min(3, cand.length))];
  for (let k = 0; k < 10; k++) {
    const a = rng() * Math.PI * 2, d = CROWD.standPx[0] + rng() * (CROWD.standPx[1] - CROWD.standPx[0]);
    const sx = perfPed.x + Math.cos(a) * d, sy = perfPed.y + Math.sin(a) * d;
    if (!walkable(world.map, sx, sy)) continue;
    let crowded = false;
    for (const id of P.crowd) { const o = world.get(id); if (o && o.npc && o.npc.mc && Math.hypot(o.npc.mc.x - sx, o.npc.mc.y - sy) < 18) { crowded = true; break; } }
    if (crowded) continue;
    e.npc.state = 'mcrowd'; e.npc.mcSeen = { perf: P.id, t: now };
    e.npc.mc = { b: perfPed.id, perf: P.id, x: sx, y: sy, film: rng() < 0.35, tip: false, look: 0 };
    e.vx = 0; e.vy = 0;
    P.crowd.add(e.id);
    return true;
  }
  return false;
}
function release(world, ped, P, boo = false) {
  const n = ped.npc;
  if (P) P.crowd.delete(ped.id);
  if (!n) return;
  const mc = n.mc, b = mc && world.get(mc.b);
  if (boo) { world.emit(ped.x, ped.y, { e: 'say', id: ped.id, x: Math.round(ped.x), y: Math.round(ped.y), text: BOOS[Math.floor(rng() * BOOS.length) % BOOS.length] }); world.emit(ped.x, ped.y, { e: 'crowd', x: Math.round(ped.x), y: Math.round(ped.y), k: 'boo', n: 1 }); }
  if (n.state === 'mcrowd') n.state = 'wander';
  n.mc = null;
  if (b) n.awayFrom = Math.atan2(ped.y - b.y, ped.x - b.x);
  look(ped, 'off');
}
// how someone watching shows it: jumping, swaying, filming, just watching
function look(ped, how) {
  const dance = how === 'jump' ? 11 : how === 'bounce' ? 1 : how === 'sway' ? 6 : -1, film = how === 'film';
  let ch = false;
  if (dance >= 0) { if (ped.gt !== 'dance' || ped.dm !== dance) { ped.gt = 'dance'; ped.dm = dance; ch = true; } } else if (ped.gt === 'dance') { ped.gt = null; ped.dm = undefined; ch = true; }
  if (film && !ped.filming) { ped.phoneOut = 1; ped.filming = 2; ch = true; } else if (!film && ped.filming) { ped.filming = 0; ped.phoneOut = 0; ch = true; }
  if (ch) bump(ped);
}
// npc.js state 'mcrowd': to their spot, then watching; up to the hat with a tip when they mean to; off when it's over
export function crowdStep(world, ped, now) {
  const n = ped.npc, mc = n.mc, b = mc && world.get(mc.b), P = b && b.player && b.player.perf;
  if (!mc || !b || b.dead || b.removed || !P || P.id !== mc.perf) { release(world, ped, P); return NO_INPUT; }
  let tx = mc.x, ty = mc.y;
  if (mc.tip) {
    const hat = stage(world).get(P.hat);
    if (!hat) mc.tip = false;
    else {
      tx = hat.x + (ped.x < hat.x ? -10 : 10); ty = hat.y + 6;
      if (Math.hypot(tx - ped.x, ty - ped.y) < 12) { mc.tip = false; tipInto(world, b.player, P, hat, ped); }
    }
  }
  if (Math.hypot(tx - ped.x, ty - ped.y) > 8) { if (ped.gt === 'dance' || ped.filming) look(ped, 'off'); return seekTo(ped, tx, ty, 0.6); }
  ped.vx = ped.vy = 0; ped.a = Math.atan2(b.y - ped.y, b.x - ped.x);
  return NO_INPUT;
}
function tipInto(world, p, P, hat, by) {
  const now = world.time, r = rating(world, P);
  p.tipLog = (p.tipLog || []).filter(([t]) => now - t < 3600);
  const had = p.tipLog.reduce((a, [, v]) => a + v, 0);
  if (had >= CROWD.tipCapHour) return;
  const amt = Math.min(CROWD.tipCapHour - had, Math.max(CROWD.tip[0], Math.round(CROWD.tip[0] + rng() * (CROWD.tip[1] - CROWD.tip[0]) * r)));
  p.tipLog.push([now, amt]);
  hat.c += amt; P.tips = (P.tips || 0) + amt;
  send(world, hat);
  world.emit(hat.x, hat.y, { e: 'cash', x: Math.round(hat.x), y: Math.round(hat.y) });
  if (by) world.emit(by.x, by.y, { e: 'thanks', id: by.id, x: Math.round(by.x), y: Math.round(by.y), text: `+$${amt}` });
}
// a performance's crowd, a few times a second: grow it to what the show's worth, thin it when it isn't, how they take it
function crowdUpdate(world, p, P) {
  const now = world.time, ped = p.ped, r = rating(world, P), want = crowdSize(r), md = mood(r);
  for (const id of [...P.crowd]) { const e = world.get(id); if (!e || e.dead || e.removed || !e.npc || e.npc.state !== 'mcrowd' || !e.npc.mc || e.npc.mc.perf !== P.id) { P.crowd.delete(id); if (e && e.npc && !e.npc.mc) look(e, 'off'); } }
  const started = !P.t0 || now >= P.t0;
  if (started && P.crowd.size < want && now >= P.drawAt) { P.drawAt = now + CROWD.everyS; recruit(world, ped, P); }
  if (P.crowd.size && now >= P.leaveAt && (md === 'bored' || md === 'boo' || P.crowd.size > want + 1)) {
    P.leaveAt = now + 2 + rng() * 1.5;
    const ids = [...P.crowd], e = world.get(ids[Math.floor(rng() * ids.length) % ids.length]);
    if (e) release(world, e, P, md === 'boo' && rng() < 0.6);
  }
  if (now >= P.lookAt) {   // (how each one's taking it, now and then: not all at once)
    P.lookAt = now + 0.8;
    for (const id of P.crowd) {
      const e = world.get(id), mc = e && e.npc && e.npc.mc;
      if (!mc || mc.tip || Math.hypot(mc.x - e.x, mc.y - e.y) > 10 || rng() < 0.5) continue;
      const how = md === 'hype' ? (mc.film && r >= CROWD.filmAt ? 'film' : rng() < 0.65 ? 'jump' : 'bounce') : md === 'into' ? (mc.film && r >= CROWD.filmAt ? 'film' : rng() < 0.5 ? 'sway' : rng() < 0.5 ? 'bounce' : 'watch') : 'watch';
      look(e, how);
    }
  }
  if ((md === 'hype' || md === 'into') && P.crowd.size >= 3 && now >= P.cheerAt) {   // (a cheer goes up)
    P.cheerAt = now + CHEER_GAP[0] + rng() * (CHEER_GAP[1] - CHEER_GAP[0]) * (md === 'hype' ? 0.6 : 1);
    const ids = [...P.crowd], e = world.get(ids[Math.floor(rng() * ids.length) % ids.length]);
    if (e) { world.emit(e.x, e.y, { e: 'say', id: e.id, x: Math.round(e.x), y: Math.round(e.y), text: CHEERS[Math.floor(rng() * CHEERS.length) % CHEERS.length] }); world.emit(ped.x, ped.y, { e: 'crowd', x: Math.round(ped.x), y: Math.round(ped.y), k: md === 'hype' ? 'cheer' : 'clap', n: P.crowd.size }); }
  }
  if (now >= P.tipAt) {   // (now and then one steps up to the hat)
    P.tipAt = now + CROWD.tipEveryS;
    const ch = tipChance(r);
    if (ch > 0) for (const id of P.crowd) { const e = world.get(id), mc = e && e.npc && e.npc.mc; if (mc && !mc.tip && rng() < ch) { mc.tip = true; look(e, 'off'); } }
  }
}

// ---- shot, hit, blown up ----------------------------------------------------------------------------------------------
const breakable = (s) => (s.k === 'boombox' || s.k === 'radio') && !s.att && !s.br;
function damage(world, s, dmg, by) {
  s.hp -= dmg;
  world.emit(s.x, s.y, { e: 'spark', x: Math.round(s.x), y: Math.round(s.y) });
  if (s.hp <= 0) wreck(world, s, by);
}
export function wreck(world, s, by = null) {
  if (s.br) return;
  s.br = world.time; s.on = s.on ? 1 : 0; s.until = world.time + MUSIC_GEAR.wreckS;
  send(world, s);
  s.on = false;
  world.emit(s.x, s.y, { e: 'crowd', x: Math.round(s.x), y: Math.round(s.y), k: 'smash', n: 0 });
  const p = s.owner && byPid(world, s.owner);
  if (p) {
    const inv = p.profile.inventory;
    if ((inv[s.k] || 0) > 0) { inv[s.k]--; if (!inv[s.k]) delete inv[s.k]; }
    if (p.mus && p.mus[s.k] === s.id) delete p.mus[s.k];
    if (p.perf && p.perf.src === s.id) stopPerf(world, p, 'wrecked');
    world.notify(p, by && by.player === p ? `You wrecked your own ${ITEMS[s.k].name.toLowerCase()}.` : `Your ${ITEMS[s.k].name.toLowerCase()} was smashed to pieces${by && by.player ? ` by ${by.player.name}` : ''}.`, 'bad');
    touch(p);
  }
}
// a bullet's path (combat.js hitscan): the nearest boombox or radio set down along it before tmax (0-1 along it) - hit
// for dmg; its t, or -1
export function shot(world, shooter, x1, y1, x2, y2, tmax, dmg) {
  if (!world.stage || !world.stage.size || (shooter && shooter.sub)) return -1;
  let best = null, bt = tmax;
  for (const s of world.stage.values()) {
    if (!breakable(s)) continue;
    const t = segCircle(x1, y1, x2, y2, s.x, s.y, s.k === 'boombox' ? 9 : 6);
    if (t >= 0 && t < bt) { bt = t; best = s; }
  }
  if (!best) return -1;
  damage(world, best, dmg, shooter);
  return bt;
}
// a swing that found no one (combat.js melee): a boombox or a radio in reach, in front
export function swing(world, ped, w, aim) {
  if (!world.stage || !world.stage.size) return false;
  for (const s of world.stage.values()) {
    if (!breakable(s)) continue;
    const d = Math.hypot(s.x - ped.x, s.y - ped.y);
    if (d > (w.range || 28) + 10) continue;
    let da = Math.atan2(s.y - ped.y, s.x - ped.x) - aim; da = Math.atan2(Math.sin(da), Math.cos(da));
    if (Math.abs(da) > (w.arc || 1.2) / 2 + 0.3) continue;
    damage(world, s, w === WEAPONS.fists ? MUSIC_GEAR.punch : Math.max(MUSIC_GEAR.punch, (w.dmg || 10) * 0.6), ped);
    return true;
  }
  return false;
}
export function blast(world, x, y, r, by = null) {
  if (!world.stage || !world.stage.size) return;
  for (const s of [...world.stage.values()]) if (breakable(s) && Math.hypot(s.x - x, s.y - y) < r) wreck(world, s, by);
}

// ---- every tick ---------------------------------------------------------------------------------------------------
export function update(world) {
  const now = world.time;
  // a player coming in (or back): everything there is
  for (const p of world.players.values()) if (p.conn && p.musConn !== p.conn) { p.musConn = p.conn; if (world.stage && world.stage.size) queue(p, { e: 'mus', now: +now.toFixed(2), all: list(world) }); }
  for (const p of world.players.values()) { if (p.perf) perfStep(world, p, p.perf); else if (p.mus && p.mus.mat && p.ped && p.ped.dancing) afterDance(world, p); }
  if (world.tick % 5) return;
  if (!world.stage || !world.stage.size) return;
  for (const s of [...world.stage.values()]) {
    if (s.until && now >= s.until && (s.br || s.k === 'hat')) { if (s.k !== 'hat' || !performing(world, s)) { remove(world, s); continue; } }
    if (s.k === 'car') {
      const v = world.get(s.att);
      if (!v || v.removed || v.wreckAt) { remove(world, s); continue; }
      s.x = v.x; s.y = v.y;
      if (v.seats.some((id) => id)) s.empty = 0; else if (!s.empty) s.empty = now; else if (now - s.empty > CAR_EMPTY_S) remove(world, s);
      continue;
    }
    if (s.br || !s.owner) continue;
    const p = byPid(world, s.owner), ped = p && p.ped;
    if (s.att) {   // carried: it follows; dropped where they go down
      const c = world.get(s.att);
      if (!c || c.removed) { s.att = 0; send(world, s); continue; }
      s.x = c.x; s.y = c.y;
      if ((c.dead || c.vehId || (world.time < (c.downUntil || 0))) && s.k !== 'jam') { s.att = 0; s.x = c.x + 8; s.y = c.y + 6; send(world, s); }
      continue;
    }
    // left behind: packed back into the bag (gone with an owner who's left)
    const far = !p || !p.conn || !ped || ped.dead || Math.hypot(ped.x - s.x, ped.y - s.y) > MUSIC_GEAR.awayPx;
    if (s.k === 'hat') continue;
    if (!far) { s.away = 0; continue; }
    if (!s.away) s.away = now;
    else if (now - s.away > MUSIC_GEAR.awayS) { remove(world, s); if (p) world.notify(p, `You left your ${ITEMS[s.k].name.toLowerCase()} behind: it's back in your bag.`, 'info'); }
  }
}
function perfStep(world, p, P) {
  const ped = p.ped, now = world.time;
  if (!ped || ped.dead || ped.vehId || ped.hidden || !p.conn) { stopPerf(world, p, 'gone'); return; }
  const mat = P.mat && stage(world).get(P.mat);
  if (P.mat && (!mat || Math.hypot(ped.x - mat.x, ped.y - mat.y) > MAT_REACH + 16)) { stopPerf(world, p, 'moved'); return; }
  if ((P.kind === 'jam' || P.kind === 'gig') && Math.hypot(ped.x - P.x, ped.y - P.y) > JAM_WANDER) { stopPerf(world, p, 'moved'); return; }
  if (P.kind === 'free') {
    if (ped.dancing) { P.idle = 0; if (ped.dm !== P.lastDm) { P.lastDm = ped.dm; P.moves.push([now, ped.dm]); if (P.moves.length > 40) P.moves.shift(); } }
    else if (!P.idle) P.idle = now;
    else if (now - P.idle > 3) { stopPerf(world, p, 'danced'); return; }
  }
  if (P.chart) {   // the notes nobody hit, past their time: misses
    while (P.next < P.chart.length && now > P.t0 + P.chart[P.next].t + RHYTHM.lateS) { if (!P.judged.has(P.next)) { P.judged.add(P.next); onJudged(world, p, P, 3, null); } P.next++; }
    if (now > P.t0 + RHYTHM.setS + RHYTHM.lateS) {
      if (P.kind === 'rhythm') { stopPerf(world, p, 'done'); return; }
      const T = P.T;   // (a gig's set over: its result, and the instrument back to free play)
      queue(p, { e: 'mus', now: +now.toFixed(2), res: { score: T.score, acc: +accuracy(T).toFixed(3), best: T.best, grades: T.grades, crowd: P.crowd.size, tips: P.tips || 0, n: P.chart.length } });
      const src = stage(world).get(P.src);
      if (src) { src.tr = null; send(world, src); }
      Object.assign(P, { kind: 'jam', chart: null, key: 57, minor: true, notes: [now] });
    }
  }
  if (world.tick % 5 === 2) crowdUpdate(world, p, P);
}
// dancing on your own mat (the dance button, the phone's Dance): a freestyle (update)
export function afterDance(world, p) {
  const ped = p.ped;
  if (!ped || !ped.dancing || p.perf) return;
  const m = own(world, p, 'mat');
  if (!m || Math.hypot(ped.x - m.x, ped.y - m.y) > MAT_REACH) return;
  const hat = hatFor(world, p, m.x + 30, m.y + 10);
  const P = newPerf(world, p, 'free', { mat: m.id, src: m.id, hat: hat.id });
  P.lastDm = ped.dm; P.moves.push([world.time, ped.dm]);
  m.tr = BEAT_TRACK; m.st = -1; m.on = true; m.t0 = world.time;
  send(world, m);
}
