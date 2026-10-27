// Music in the world (the owner's notes part 2: "Item - Radio/Boombox, can play it out loud for people to hear in game...
// Music can be purchased at record store and you can buy tape cassettes for your Boombox or you can play a radio station";
// "Breakdancing - can put down a cardboard mat and dance... a dance dance revolution or guitar hero type mini game";
// "Have instruments as items you can get and play them out loud for people in the area to hear"). The shared part, for the
// server (server/systems/music.js) and the screens that load once they're wanted (client/music/, client/sound/stage.js):
//   - TRACKS: the track list - every song the game can play, by id. For now they're the owner's song scores and the live
//     synth's little songs, played on the synth (tools/music/songbook.mjs compiles them: client/sound/songbook/, and
//     shared/music-songs.js, their lengths and beats). The owner's own recordings drop in here: give a track its `file`
//     ({ opus, mp3 } under assets/music, as tools/music/make-loop.py makes them, and `secs`, its length) and the game
//     plays the recording in place of the score - on tapes, the stations, the mat, everywhere.
//   - STATIONS: the radio's channels, a few songs each by genre, in rotation on the world's clock (stationAt: everyone
//     tuned in hears the same song at the same moment, with nothing to keep in step);
//   - the items (registered into shared/items.js ITEMS when this loads): the boombox, the pocket radio, the cardboard mat,
//     the instruments, a tape of each song;
//   - the rhythm game: its chart from a song's beats (chart), the judging of a hit (judge) and the score (tally);
//   - the crowd: how many a rating draws and how they take it (crowdSize, mood);
//   - the instruments' notes (jamNotes).
// Pure and deterministic (the chart from a seed: shared/rng.js).
import { ITEMS } from './items.js';
import { SONGS } from './music-songs.js';
import { MUSIC_PRICES, RHYTHM, CROWD, FREESTYLE, JAM } from './rules-music.js';
import { mulberry32 } from './rng.js';

// ---- the track list -----------------------------------------------------------------------------------------------
// id: the song (shared/music-songs.js; its score client/sound/songbook/<id>.json); title, by, genre: what the menus and the
// tapes say; tape: sold on cassette at the record stores; file / secs: the owner's recording, when there is one (null: the
// synth plays the score)
export const TRACKS = [
  { id: 'sunburnt-tape', title: 'Sunburnt Tape', by: 'Haze Collective', genre: 'haze', tape: true, file: null, secs: null },
  { id: 'sugar-haze', title: 'Sugar Haze', by: 'Haze Collective', genre: 'haze', tape: true, file: null, secs: null },
  { id: 'waiting-room', title: 'Waiting Room Disco', by: 'The Receptionists', genre: 'haze', tape: true, file: null, secs: null },
  { id: 'clockwork-kitty', title: 'Clockwork Kitty', by: 'Tin Whiskers', genre: 'haze', tape: true, file: null, secs: null },
  { id: 'heist-fm', title: 'Smash and Grab', by: 'The Getaway Big Band', genre: 'heist', tape: true, file: null, secs: null },
  { id: 'heist-getaway', title: 'Getaway Job', by: 'The Getaway Big Band', genre: 'heist', tape: true, file: null, secs: null },
  { id: 'precinct-brass', title: 'Badge and Brass', by: 'The Precinct Horns', genre: 'heist', tape: true, file: null, secs: null },
  { id: 'jester-parade', title: "Jester's Parade", by: 'Old Town Brass', genre: 'heist', tape: true, file: null, secs: null },
  { id: 'grease-fire', title: 'Grease Fire', by: 'Deep Fryer', genre: 'grease', tape: true, file: null, secs: null },
  { id: 'double-scoop', title: 'Double Scoop', by: 'Deep Fryer', genre: 'grease', tape: true, file: null, secs: null },
  { id: 'kickflip', title: 'Kickflip', by: 'Grip Tape', genre: 'skate', tape: true, file: null, secs: null },
  { id: 'rescue-run', title: 'Rescue Run', by: 'Siren Song', genre: 'skate', tape: true, file: null, secs: null },
  { id: 'menu-wide-awake', title: 'Wide Awake City', by: 'Siren Song', genre: 'skate', tape: true, file: null, secs: null },
  { id: 'first-sprouts', title: 'First Sprouts', by: 'The Allotments', genre: 'garden', tape: true, file: null, secs: null },
  { id: 'garden-morning', title: 'Tomatoes in the Morning', by: 'The Allotments', genre: 'garden', tape: true, file: null, secs: null },
  { id: 'porch-light', title: 'Porch Light', by: 'Cedar Point Pickers', genre: 'garden', tape: true, file: null, secs: null },
  // the live synth's own little loops (client/sound/music.js): the street beat every mat plays when you've no tape, the rest
  // what the shops and lobbies play
  { id: 'club', title: 'Street Beat', by: 'the mat', genre: 'beat', tape: false, file: null, secs: null },
  { id: 'shop', title: 'Aisle Bossa', by: 'In-Store Sounds', genre: 'lobby', tape: true, file: null, secs: null },
  { id: 'lobby', title: 'Lobby Hours', by: 'In-Store Sounds', genre: 'lobby', tape: true, file: null, secs: null },
  { id: 'drivein', title: 'Starlite Slow Dance', by: 'The Speaker Posts', genre: 'lobby', tape: true, file: null, secs: null },
];
export const TRACK = Object.fromEntries(TRACKS.map((t, i) => [t.id, Object.assign(t, { i })]));
export const BEAT_TRACK = 'club';   // (the mat's own beat)
export const trackSecs = (id) => (TRACK[id] && (TRACK[id].secs || (SONGS[id] && SONGS[id].secs))) || 30;
export const songOf = (id) => SONGS[id] || SONGS[BEAT_TRACK];

// ---- the radio's stations -----------------------------------------------------------------------------------------
export const STATIONS = [
  { id: 'haze', name: 'The Haze', freq: '94.5', tracks: ['sunburnt-tape', 'sugar-haze', 'waiting-room', 'clockwork-kitty'] },
  { id: 'heist', name: 'Heist FM', freq: '101.1', tracks: ['heist-fm', 'precinct-brass', 'heist-getaway', 'jester-parade'] },
  { id: 'grease', name: 'Grease', freq: '88.3', tracks: ['grease-fire', 'double-scoop'] },
  { id: 'skate', name: 'Skate Radio', freq: '106.6', tracks: ['kickflip', 'rescue-run', 'menu-wide-awake'] },
  { id: 'garden', name: 'Garden Country', freq: '90.7', tracks: ['first-sprouts', 'garden-morning', 'porch-light'] },
];
export const stationName = (i) => (STATIONS[i] ? `${STATIONS[i].freq} ${STATIONS[i].name}` : 'off');
// what a station is playing at world time t (s): { track, pos (s into it), left (s till the next) } - each station starts
// its round at its own moment, so they're never all on their first song together
export function stationAt(i, t) {
  const S = STATIONS[i];
  if (!S) return null;
  const len = S.tracks.map(trackSecs), all = len.reduce((a, b) => a + b, 0);
  let x = (((t + i * 41.3) % all) + all) % all;
  for (let k = 0; k < len.length; k++) { if (x < len[k]) return { track: S.tracks[k], pos: x, left: len[k] - x }; x -= len[k]; }
  return { track: S.tracks[0], pos: 0, left: len[0] };
}
// where a tape (or the mat's song) is, started at world time t0: it plays round and round
export const tapePos = (id, t0, t) => { const L = trackSecs(id); return (((t - t0) % L) + L) % L; };

// ---- the items ----------------------------------------------------------------------------------------------------
// music: what it is to the server (music.js use): the boombox and the radio play out loud, set down or carried; the mat
// is where you dance; an instrument is played (inst: INSTRUMENTS); a tape goes in the boombox. desc: the bag's line.
export const MUSIC_ITEMS = {
  boombox: { name: 'Boombox', tool: true, music: 'boombox', sell: 50, desc: 'take it out and it plays out loud for everyone round you - a tape or a station; use it again for the tapes, the stations, setting it down. Shoot one and it\'s wrecked' },
  radio: { name: 'Pocket Radio', tool: true, music: 'radio', sell: 15, desc: 'the radio stations, out loud on your hip (quieter than a boombox) - use it again to tune it, set it down or switch it off' },
  dancemat: { name: 'Cardboard Mat', tool: true, music: 'mat', sell: 0, desc: 'put it down and dance on it: freestyle with the dance button, or the action button for the rhythm game - a crowd gathers for a good show, a hat collects the tips' },
  guitar: { name: 'Acoustic Guitar', tool: true, music: 'inst', sell: 90, desc: 'play it out loud: free play or a gig (the rhythm game) - busk for tips into your hat' },
  keytar: { name: 'Keytar', tool: true, music: 'inst', sell: 140, desc: 'a synth on a strap: free play or a gig - busk for tips into your hat' },
  bucketdrum: { name: 'Bucket Drums', tool: true, music: 'inst', sell: 20, desc: 'upturned buckets and sticks: free play or a gig - busk for tips into your hat' },
  sax: { name: 'Saxophone', tool: true, music: 'inst', sell: 130, desc: 'play it out loud: free play or a gig - busk for tips into your hat' },
  violin: { name: 'Violin', tool: true, music: 'inst', sell: 110, desc: 'play it out loud: free play or a gig - busk for tips into your hat' },
};
export const tapeId = (track) => `tape_${track}`;
for (const t of TRACKS) if (t.tape) MUSIC_ITEMS[tapeId(t.id)] = { name: `Tape: ${t.title}`, music: 'tape', track: t.id, sell: 3, desc: `${t.by} on cassette - play it on your boombox (or dance to it on your mat)` };
Object.assign(ITEMS, MUSIC_ITEMS);
export const TAPES = TRACKS.filter((t) => t.tape).map((t) => tapeId(t.id));
// a record store's counter (server economy.js walkCounter): [item, price]
export const RECORD_STORE = [
  ...TAPES.map((id) => [id, MUSIC_PRICES.tape]),
  ['boombox', MUSIC_PRICES.boombox], ['radio', MUSIC_PRICES.radio], ['dancemat', MUSIC_PRICES.dancemat],
  ['guitar', MUSIC_PRICES.guitar], ['keytar', MUSIC_PRICES.keytar], ['bucketdrum', MUSIC_PRICES.bucketdrum], ['sax', MUSIC_PRICES.sax], ['violin', MUSIC_PRICES.violin],
];

// ---- the instruments ----------------------------------------------------------------------------------------------
// pp: how it's held (the buskers' props - client/art2/people.js: the keytar is slung like the guitar); voice: the live
// synth's (client/sound/stage.js); oct: where its notes sit; code: on the wire
export const INSTRUMENTS = {
  guitar: { pp: 'guitar', voice: 'pluck', oct: -12, code: 1 },
  keytar: { pp: 'guitar', voice: 'lead', oct: 0, code: 2 },
  bucketdrum: { pp: 'drums', voice: 'kit', oct: 0, code: 3 },
  sax: { pp: 'sax', voice: 'reed', oct: -12, code: 4 },
  violin: { pp: 'violin', voice: 'bow', oct: 0, code: 5 },
};
export const INST_BY_CODE = Object.keys(INSTRUMENTS).reduce((a, k) => { a[INSTRUMENTS[k].code] = k; return a; }, []);
export const PADS = 8;
const PENTA = [[0, 2, 4, 7, 9], [0, 3, 5, 7, 10]];
const KIT_PADS = [0, 1, 3, 2, 10, 8, 12, 4];   // (the bucket drums' pads: kick, snare, hat, clap, low tom, high tom, cymbal, open hat)
// the notes pad 0-7 plays on an instrument (chord: held for a chord) in a key (a MIDI tonic, minor or major): its
// pentatonic up from the tonic, a chord on the note; the drums: [the drum's code] (client/sound/stage.js KIT)
export function jamNotes(inst, pad, chord = false, key = 57, minor = true) {
  const I = INSTRUMENTS[inst];
  pad = Math.max(0, Math.min(PADS - 1, pad | 0));
  if (!I) return [];
  if (I.voice === 'kit') return chord ? [KIT_PADS[pad], 12] : [KIT_PADS[pad]];
  const sc = PENTA[minor ? 1 : 0], n = (key % 12) + 48 + 12 + I.oct + sc[pad % 5] + 12 * Math.floor(pad / 5);
  return chord ? [n, n + (minor ? 3 : 4), n + 7] : [n];
}

// ---- the rhythm game ----------------------------------------------------------------------------------------------
export const LANES = 4;
// a song's beat b in seconds from its top (its tempo map), and the other way round
export function beatTime(song, b) {
  let seg = song.tempo[0];
  for (const s of song.tempo) if (s[2] <= b) seg = s;
  return seg[0] + (b - seg[2]) * 60 / seg[1];
}
export function beatAt(song, t) {
  let seg = song.tempo[0];
  for (const s of song.tempo) if (s[0] <= t) seg = s;
  return seg[2] + (t - seg[0]) * seg[1] / 60;
}
// The chart for a set: notes [{ t (s from the song's top), lane }] on the song's beats (eighths at the most, never closer
// than minGap), a bar to count in, busier as the set goes on (RHYTHM.density); a fast song is charted on its half-time
// feel. From the seed alone: the server and the page make the same one.
export function chart(track, seed, setS = RHYTHM.setS) {
  const song = songOf(track), r = mulberry32(seed >>> 0), out = [];
  const spb = 60 / song.tempo[0][1], unit = spb < 0.4 ? 2 : 1, minGap = Math.max(RHYTHM.minGapBeats * spb * unit, 0.22);
  let last = -9, lastLane = -1, same = 0;
  for (let hb = 8 * unit; ; hb += unit) {   // (half-beats: an eighth a step - a quarter on a fast song's half-time)
    const b = hb / 2, t = Math.floor(b / song.beats) * song.secs + beatTime(song, b % song.beats);   // (the song goes round)
    if (t > setS - 0.4) break;
    const stage = Math.min(RHYTHM.density.length - 1, Math.floor(t / setS * RHYTHM.density.length)), d = RHYTHM.density[stage];
    const on = (hb / unit) % 2 === 0;
    const p = on ? Math.min(0.95, d * 0.9) : Math.max(0, d - 0.55) * 0.9;
    if (r() >= p || t - last < minGap) continue;
    let lane = Math.floor(r() * LANES) % LANES;
    if (lane === lastLane && ++same >= 2) { lane = (lane + 1 + Math.floor(r() * (LANES - 1))) % LANES; same = 0; } else if (lane !== lastLane) same = 0;
    out.push({ t: +t.toFixed(3), lane });
    last = t; lastLane = lane;
  }
  return out;
}
// a hit offMs off its note: 0 perfect, 1 great, 2 good, 3 a miss
export function judge(offMs) {
  const a = Math.abs(offMs);
  return a <= RHYTHM.perfectMs ? 0 : a <= RHYTHM.greatMs ? 1 : a <= RHYTHM.goodMs ? 2 : 3;
}
export const GRADE_NAMES = ['PERFECT', 'GREAT', 'GOOD', 'MISS'];
const GRADE_VALUE = [1, 0.8, 0.55, 0];
export const newTally = () => ({ score: 0, combo: 0, best: 0, n: 0, grades: [0, 0, 0, 0], rating: 0.5 });
// a note judged (grade): the combo, its multiplier, the points, the rating (how the crowd takes it: 0-1, following the
// recent notes - RHYTHM.rateK)
export function tally(T, grade) {
  T.n++; T.grades[grade]++;
  T.combo = grade < 3 ? T.combo + 1 : 0;
  T.best = Math.max(T.best, T.combo);
  const mult = Math.min(RHYTHM.comboMax, 1 + Math.floor(T.combo / RHYTHM.comboEvery) * RHYTHM.comboStep);
  T.score += Math.round(RHYTHM.points[grade] * mult);
  T.rating += (GRADE_VALUE[grade] - T.rating) * RHYTHM.rateK;
  return T;
}
// a set's accuracy, 0-1 (what the result screen shows)
export const accuracy = (T) => (T.n ? (T.grades[0] + T.grades[1] * 0.8 + T.grades[2] * 0.55) / T.n : 0);

// ---- the crowd ----------------------------------------------------------------------------------------------------
export function crowdSize(rating) { for (const [at, n] of CROWD.sizes) if (rating >= at) return n; return 0; }
// how someone watching takes it: 'hype' (jumping, cheering), 'into' (swaying, clapping), 'meh' (watching), 'bored'
// (drifting off), 'boo' (booing as they go)
export function mood(rating) {
  return rating >= CROWD.jumpAt ? 'hype' : rating >= CROWD.tipFrom ? 'into' : rating >= CROWD.leaveAt ? 'meh' : rating >= CROWD.booAt ? 'bored' : 'boo';
}
// the chance someone watching tips, per CROWD.tipEveryS
export const tipChance = (rating) => Math.max(0, (rating - CROWD.tipFrom) * CROWD.tipK);
// freestyle's rating: the moves danced (their [time, move]) in the last windowS s
export function freestyleRating(moves, now) {
  const seen = new Set();
  for (const [t, m] of moves) if (now - t <= FREESTYLE.windowS) seen.add(m);
  return Math.min(FREESTYLE.max, FREESTYLE.base + FREESTYLE.perMove * seen.size);
}
// free play's rating: the notes played (their times) in the last windowS s
export function jamRating(times, now) {
  let n = 0;
  for (const t of times) if (now - t <= JAM.windowS) n++;
  return times.length && now - times[times.length - 1] > JAM.idleS ? CROWD.leaveAt - 0.05 : Math.min(JAM.max, JAM.base + JAM.perNote * n);
}

// ---- on the wire ----------------------------------------------------------------------------------------------------
// the things that play, or are set down (server music.js): their kinds
export const KINDS = ['boombox', 'radio', 'car', 'mat', 'hat', 'jam'];
