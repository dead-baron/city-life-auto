// "Getaway Job" - for the Heist station (round 1 draft). Original; the brief from the owner's reference (Tank!) is
// only the feel: fast Latin-swing big band, bongos and congas under a wall of brass, a driving bass figure, an alto
// sax solo, a hard-stop ending. G minor, 144 BPM, lightly swung.

const bar = (s) => s.padEnd(16, '.');
const only = (bars, at) => Array.from({ length: bars }, (_, i) => (at[i] ? bar(at[i]) : '.'.repeat(16))).join('|');

// the bass figure, in G, C, D and Eb (two bars, or one)
const BG = 'G2/8 r/8 G2/8 Bb2/8 r/8 C3/8 Db3/8 D3/8 | F3/8 r/8 D3/8 C3/8 r/8 Bb2/8 G2/4 |';
const BC = 'C3/8 r/8 C3/8 Eb3/8 r/8 F3/8 Gb3/8 G3/8 | Bb3/8 r/8 G3/8 F3/8 r/8 Eb3/8 C3/4 |';
const BD = 'D2/8 r/8 D2/8 F#2/8 r/8 A2/8 C3/8 C#3/8 | D3/8 r/8 C3/8 A2/8 r/8 F#2/8 D2/4 |';
const G1 = 'G2/8 r/8 G2/8 Bb2/8 r/8 C3/8 Db3/8 D3/8 |', D1 = 'D2/8 r/8 D2/8 F#2/8 r/8 A2/8 C3/8 C#3/8 |';
const Eb1 = 'Eb2/8 r/8 Eb2/8 G2/8 r/8 Bb2/8 C3/8 D3/8 |', Eb71 = 'Eb2/8 r/8 Eb2/8 G2/8 r/8 Bb2/8 Db3/8 D3/8 |';
const A_BASS = [BG, BC, BG, BD].join(' ');
const A_CHORDS = 'Gm7 | Gm7 | Cm7 | Cm7 | Gm7 | Gm7 | D7#9 | D7#9';

const THEME = "r/4 !D5/8' D5/8' r/8 F5/8 G5/4 | Bb5/8 A5/8 G5/8 F5/8 G5/2 | r/4 !D5/8' D5/8' r/8 F5/8 Bb5/4 | C6/8 Bb5/8 A5/8 G5/8 F5/4 D5/4 | "
  + "r/8 G5/8 G5/8 G5/8 Bb5/4 G5/4 | C6/8. Bb5/16 G5/8 F5/8+2 | r/4 F6/8' Eb6/8' D6/8' C6/8' A5/8' F#5/8 | !F#5/4' r/4 !D5/4' r/4 |";
const SHOUT = "!G5/8' !G5/8' r/8 !Bb5/8' r/8 !G5/8' !D6/4 | C6/8 Bb5/8 G5/8 F5/8 G5/4 r/4 | !G5/8' !G5/8' r/8 !Bb5/8' r/8 !C6/8' !Eb6/4 | D6/8 C6/8 Bb5/8 G5/8 C6/2 | "
  + "!D6/8' !D6/8' r/8 !D6/8' r/8 !F6/8' !G6/4 | F6/8 D6/8 C6/8 Bb5/8 G5/2 | r/4 !F6/8' !Eb6/8' !D6/8' !C6/8' !A5/8' !F#5/8 | !F#5/4' r/4 r/2 |";
const SOLO = 'r/4 D5/8 F5/8 G5/8 Bb5/8 A5/8 G5/8 | F5/4 D5/8 F5/8+4 r/4 | r/8 G4/8 Bb4/8 D5/8 F5/8 G5/8 Bb5/8 C6/8 | Db6/8 C6/8 Bb5/8 G5/8 F5/4 G5/4 | '
  + 'Eb6/4. D6/8 C6/8 Bb5/8 G5/4 | A5/8 Bb5/8 C6/8 Eb6/8 G6/2 | F6/8t Eb6/8t D6/8t C6/8t Bb5/8t A5/8t G5/4 F5/4 | D5/2. r/4 | '
  + 'r/8 G5/8 Bb5/8 D6/8 F6/4 Eb6/4 | D6/8 C6/8 A5/8 F#5/8 F5/8 Eb5/8 D5/4 | r/8 Bb5/8 A5/8 G5/8 Bb5/8 D6/8 G6/4 | F#6/8 F6/8 Eb6/8 D6/8 C6/8 A5/8 F#5/4 | '
  + 'G5/4 r/8 G5/16 A5/16 Bb5/8 C6/8 D6/4 | !G6/2 F6/8 D6/8 F6/4 | Eb6/8 Db6/8 Bb5/8 G5/8 Gb5/8 F5/8 Eb5/4 | D5/8 F5/8 F#5/8 A5/8 C6/8 Eb6/8 !D6/4 |';

const KIT = { ride: 'x.x.x.x.x.x.x.x.', pedal: '....x.......x...', kickSoft: 'X.....x.......x.', snare: '....X..o.o..X..o' };
const LATIN = { bongoH: 'x.o.x.o.x.o.x.o.', bongoL: '......x.......x.', congaSlap: '....x.......x...', congaH: '......x.......xx', congaL: '.......x........', shaker: 'xoxoxoxoxoxoxoxo' };

export default {
  id: 'heist-getaway',
  title: 'Getaway Job',
  bpm: 144,
  swing: 0.4,
  form: ['intro', 'vamp', 'A', 'A2', 'B', 'solo', 'shout', 'A3', 'end'],
  echo: { beats: 0.5, fb: 0.18, mix: 0.12, lp: 3000, pingpong: 0.5 },
  tracks: {
    trumpets: { inst: 'trumpet', vol: 0.42, pan: 0.32, echo: 0.2 },
    saxes: { inst: 'altoSax', vol: 0.36, pan: -0.32, echo: 0.2 },
    bones: { inst: 'trombone', vol: 0.38, pan: -0.1, echo: 0.12 },
    bass: { inst: 'upright', vol: 0.62, hp: 40 },
    piano: { inst: 'epiano', vol: 0.24, pan: 0.5, echo: 0.15 },
    drums: { kit: true, vol: 0.95, echo: 0.04, width: 1.6, mix: { kick: 0.75 } },
    perc: { kit: true, vol: 1.5, width: 2, echo: 0.06 },
  },
  sections: {
    intro: {
      bars: 4, chords: 'Gm7',
      drums: { ...KIT, snare: '....X..o.o..X..o|....X..o.o..X..o|....X..o.o..X..o|....X...X.X.XXXX', crash: only(4, {}) },
      perc: { ...LATIN, bongoH: '................|x.o.x.o.x.o.x.o.|x.o.x.o.x.o.x.o.|x.o.x.o.x.o.x.o.', congaSlap: '................|................|....x.......x...|....x.......x...' },
    },
    vamp: {
      bars: 4, chords: 'Gm7',
      bass: [BG, BG].join(' '),
      piano: { gen: 'comp', pattern: '..x..x.x|.x..x.x.', lo: 60, hi: 79, size: 4, gate: 0.6 },
      drums: { ...KIT, crash: only(4, { 0: 'X' }), tomH: only(4, { 3: '............X.x.' }), tomL: only(4, { 3: '..............XX' }) },
      perc: LATIN,
    },
    A: {
      bars: 8, chords: A_CHORDS,
      trumpets: THEME,
      bones: { line: THEME, oct: -1, vol: 0.8 },
      bass: A_BASS,
      piano: { gen: 'comp', pattern: '..x..x.x|.x..x.x.', lo: 60, hi: 79, size: 4, gate: 0.6 },
      drums: { ...KIT, crash: only(8, { 0: 'X' }) },
      perc: LATIN,
    },
    A2: {
      bars: 8, chords: A_CHORDS,
      trumpets: THEME,
      saxes: { harmOf: 'trumpets', min: 3, max: 5, vol: 0.95 },
      bones: { line: THEME, oct: -1, vol: 0.8 },
      bass: A_BASS,
      piano: { gen: 'comp', pattern: '..x..x.x|.x..x.x.', lo: 60, hi: 79, size: 4, gate: 0.6 },
      drums: { ...KIT, crash: only(8, { 0: 'X' }), snare: only(8, { 0: '....X..o.o..X..o', 1: '....X..o.o..X..o', 2: '....X..o.o..X..o', 3: '....X..o.o..X..o', 4: '....X..o.o..X..o', 5: '....X..o.o..X..o', 6: '....X..o.o..X..o', 7: '....X...x.x.XxXx' }) },
      perc: LATIN,
    },
    B: {
      bars: 8, chords: 'Ebmaj7 | Ebmaj7 | D7#9 | D7#9 | Cm7 | F7 | Bbmaj7 | A7b9 D7#9',
      trumpets: 'G5/2. F5/8 G5/8 | Bb5/4 A5/4 G5/4 D5/4 | F#5/2. r/8 A5/8 | C6/4 Bb5/4 A5/4 F#5/4 | Eb5/2. D5/8 Eb5/8 | F5/4 A5/4 C6/4 Eb6/4 | D6/2. C6/8 Bb5/8 | A5/4 G5/4 !F#5/4\' !D5/4\' |',
      saxes: { harmOf: 'trumpets', min: 3, max: 5, vol: 0.9 },
      bones: 'G3/1 | G3/1 | F#3/1 | F#3/1 | Eb3/1 | Eb3/1 | D3/1 | C#3/2 C3/2 |',
      bass: { gen: 'bass', pattern: 'R35a', lo: 31, gate: 0.85 },
      piano: { gen: 'comp', pattern: 'x..x....', lo: 60, hi: 79, size: 4, gate: 0.9 },
      drums: { ride: 'x.x.x.x.x.x.x.x.', pedal: '....x.......x...', kickSoft: 'X.......x.......', snare: '......o.....x...', crash: only(8, { 0: 'X', 4: 'X' }) },
      perc: { congaH: '......x.......xx', congaL: '.......x........', shaker: 'xoxoxoxoxoxoxoxo' },
    },
    solo: {
      bars: 16, chords: 'Gm7 | Gm7 | Gm7 | Gm7 | Cm7 | Cm7 | Gm7 | Gm7 | Ebmaj7 | D7#9 | Gm7 | D7#9 | Gm7 | Gm7 | Eb7 | D7#9',
      saxes: { line: SOLO, vol: 1.15 },
      bones: { line: "r/1 | r/1 | r/1 | r/1 | r/1 | r/1 | r/1 | r/1 | r/1 | r/1 | r/1 | r/1 | r/2 !G3/8' r/8 G3/4' | r/2 !G3/8' r/8 G3/4' | r/2 !Db4/8' r/8 Db4/4' | r/2 !C4/8' r/8 C4/4' |", vol: 0.7 },
      bass: [BG, BG, BC, BG, Eb1, D1, G1, D1, BG, Eb71, D1].join(' '),
      piano: { gen: 'comp', pattern: '..x..x.x|.x..x.x.', lo: 60, hi: 79, size: 4, gate: 0.55, vol: 0.85 },
      drums: { ...KIT, ride: 'x.x.x.xxx.x.x.xx', crash: only(16, { 0: 'X', 8: 'X' }) },
      perc: LATIN,
    },
    shout: {
      bars: 8, chords: A_CHORDS,
      trumpets: SHOUT,
      saxes: { harmOf: 'trumpets', min: 3, max: 5, vol: 0.95 },
      bones: { line: SHOUT, oct: -1, vol: 0.85 },
      bass: A_BASS,
      piano: { gen: 'comp', pattern: 'x.x.x.x.', lo: 60, hi: 79, size: 4, gate: 0.4 },
      drums: { ...KIT, crash: only(8, { 0: 'X', 4: 'X' }), snare: only(8, { 0: '....X..o.o..X..o', 1: '....X..o.o..X..o', 2: '....X..o.o..X..o', 3: '....X..o.o..X..o', 4: '....X..o.o..X..o', 5: '....X..o.o..X..o', 6: '....X..o.o..X..o', 7: '....X...XXXXXXXX' }) },
      perc: { ...LATIN, cowbell: 'X...x...X...x...', timbale: only(8, { 7: '........x.x.xxxx' }) },
    },
    A3: {
      bars: 8, chords: A_CHORDS,
      trumpets: THEME,
      saxes: { harmOf: 'trumpets', min: 3, max: 5, vol: 0.95 },
      bones: { line: THEME, oct: -1, vol: 0.8 },
      bass: A_BASS,
      piano: { gen: 'comp', pattern: '..x..x.x|.x..x.x.', lo: 60, hi: 79, size: 4, gate: 0.6 },
      drums: { ...KIT, crash: only(8, { 0: 'X' }), snare: only(8, { 0: '....X..o.o..X..o', 1: '....X..o.o..X..o', 2: '....X..o.o..X..o', 3: '....X..o.o..X..o', 4: '....X..o.o..X..o', 5: '....X..o.o..X..o', 6: '....X..o.o..X..o', 7: '....X...X.X.XXXX' }) },
      perc: { ...LATIN, cowbell: 'X...x...X...x...' },
    },
    end: {
      bars: 2, chords: 'Gm7 | Gm7',
      trumpets: "G4/8 A4/8 Bb4/8 C5/8 D5/8 F5/8 G5/8 A5/8 | !G5/4' r/4 r/2 |",
      saxes: "G4/8 A4/8 Bb4/8 C5/8 D5/8 F5/8 G5/8 A5/8 | !D5/4' r/4 r/2 |",
      bones: "G3/8 A3/8 Bb3/8 C4/8 D4/8 F4/8 G4/8 A4/8 | !Bb3/4' r/4 r/2 |",
      bass: "G2/8 A2/8 Bb2/8 C3/8 D3/8 F3/8 G3/8 A3/8 | !G2/4' r/4 r/2 |",
      piano: { gen: 'comp', pattern: '........|x.......', lo: 60, hi: 79, size: 4, gate: 0.3 },
      drums: { kick: 'X.......X.......|X...............', snare: 'X.X.X.X.XXXXXXXX|................', crash: only(2, { 1: 'X' }) },
      perc: { timbale: 'x.x.x.x.xxxxxxxx|X...............' },
    },
  },
};
