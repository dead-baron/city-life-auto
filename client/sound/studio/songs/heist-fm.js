// "Smash and Grab" - round 2, for the Heist station (the car you're given for a heist or a mission). Original; written
// to sit as close as it can to the owner's reference (Tank!) in everything but the tune: fast (142 BPM), lightly
// swung Latin big band in C with blue notes, a driving bass figure under bongos, congas and timbales, a fat wall of
// brass up front (trumpets, saxes and trombones in harmony), a roaring tenor sax solo in the middle, a shout chorus
// and a hard stop.

const only = (bars, at) => Array.from({ length: bars }, (_, i) => (at[i] ? at[i].padEnd(16, '.') : '.'.repeat(16))).join('|');

// the bass figure in C, F and G (two bars), and one-bar versions
const BC = 'C2/8 r/16 C2/16 Eb2/8 E2/8 G2/8 r/8 Bb2/8 G2/8 | C3/8 Bb2/8 G2/8 F2/16 Eb2/16 r/8 C2/8 G1/8 Bb1/8 |';
const BF = 'F2/8 r/16 F2/16 Ab2/8 A2/8 C3/8 r/8 Eb3/8 C3/8 | F3/8 Eb3/8 C3/8 Bb2/16 Ab2/16 r/8 F2/8 C2/8 Eb2/8 |';
const BG = 'G1/8 r/16 G1/16 Bb1/8 B1/8 D2/8 r/8 F2/8 D2/8 | G2/8 F2/8 D2/8 C2/16 Bb1/16 r/8 G1/8 D2/8 F2/8 |';
const C1 = 'C2/8 r/8 C2/8 E2/8 G2/8 r/8 Bb2/8 G2/8 |', G1 = 'G1/8 r/8 G1/8 B1/8 D2/8 r/8 F2/8 D2/8 |', Ab1 = 'Ab1/8 r/8 Ab1/8 C2/8 Eb2/8 r/8 Gb2/8 Eb2/8 |';
const A_BASS = [BC, BF, BC, BG].join(' ');
const A_CH = 'C7#9 | C7#9 | F7 | F7 | C7#9 | C7#9 | G7#9 | G7#9';

const THEME = "r/8 !G4/8' C5/8' Eb5/8' r/8 E5/8 G5/4 | Bb5/8 A5/8 G5/8 Eb5/8 E5/8 C5/8 r/4 | r/8 !G4/8' C5/8' Eb5/8' r/8 G5/8 Bb5/4 | C6/8 Bb5/8 G5/8 F5/8 Eb5/8 C5/8 !G5/4' | "
  + "!C6/8' !C6/8' r/8 !Bb5/8' r/8 !G5/8' !Eb5/4 | F5/8 Eb5/8 C5/8 Bb4/8 C5/2 | r/4 Ab5/8' G5/8' F#5/8' F5/8' Eb5/8' D5/8 | !C5/4' r/4 !G4/4' r/4 |";
const BRIDGE = "C6/2. Bb5/8 C6/8 | Eb6/4 C6/4 Bb5/4 Ab5/4 | B5/2. r/8 D6/8 | F6/4 D6/4 B5/4 G5/4 | A5/2. G5/8 A5/8 | C6/4 A5/4 F5/4 Eb5/4 | Gb5/2 F5/4 Eb5/4 | !D5/4' r/4 !G4/4' r/4 |";
const SHOUT = "!C6/8' !C6/8' r/8 !Bb5/8' r/8 !G5/8' !E5/4 | Eb5/8 E5/8 G5/8 Bb5/8 C6/4 r/4 | !C6/8' !C6/8' r/8 !Eb6/8' r/8 !C6/8' !A5/4 | Bb5/8 A5/8 G5/8 F5/8 Eb5/2 | "
  + "!G5/8' !G5/8' r/8 !Bb5/8' r/8 !C6/8' !Eb6/4 | D6/8 C6/8 Bb5/8 G5/8 E5/2 | r/4 !Ab5/8' !G5/8' !F#5/8' !F5/8' !Eb5/8' !D5/8 | !C5/4' r/4 r/2 |";
const SOLO = 'r/4 G4/8 Bb4/8 C5/8 Eb5/8 E5/8 G5/8 | Bb5/4 A5/8 G5/8 E5/4 C5/4 | r/8 C5/8 Eb5/8 E5/8 G5/8 A5/8 Bb5/8 C6/8 | Db6/8 C6/8 Bb5/8 G5/8 Gb5/8 F5/8 Eb5/4 | '
  + 'F5/4. A5/8 C6/8 Eb6/8 D6/8 C6/8 | A5/8 F5/8 Eb5/8 C5/8 A4/2 | G5/8t A5/8t Bb5/8t C6/8t D6/8t E6/8t G6/4 E6/4 | C6/2. r/4 | '
  + 'r/8 Eb5/8 Gb5/8 Ab5/8 C6/4 Bb5/4 | B5/8 Bb5/8 F5/8 D5/8 B4/8 Ab4/8 G4/4 | r/8 E5/8 G5/8 Bb5/8 C6/8 E6/8 G6/4 | F6/8 E6/8 D6/8 Bb5/8 Ab5/8 F5/8 D5/4 | '
  + 'C5/4 r/8 C5/16 D5/16 Eb5/8 E5/8 G5/4 | !C6/2 Bb5/8 G5/8 Bb5/4 | C6/8 Bb5/8 Gb5/8 Eb5/8 C5/8 Bb4/8 Ab4/4 | G4/8 B4/8 D5/8 F5/8 Ab5/8 Bb5/8 !B5/4 |';

const KIT = { kickTight: 'X.....x.......x.', snareTight: '....X..o.o..X..o', ride: 'x.x.x.x.x.x.x.x.', pedal: '....x.......x...' };
const LATIN = { bongoH: 'x.o.x.o.x.o.x.o.', bongoL: '......x.......x.', congaSlap: '....x.......x...', congaH: '......x.......xx', congaL: '.......x........', shaker: 'xoxoxoxoxoxoxoxo' };
const FILL = (bars) => only(bars, { [bars - 1]: '....X...X.X.XXXX' });

export default {
  id: 'heist-fm',
  title: 'Smash and Grab',
  bpm: 142,
  swing: 0.32,
  form: ['intro', 'A', 'A2', 'B', 'solo', 'shout', 'A3', 'end'],
  echo: { beats: 0.5, fb: 0.2, mix: 0.12, lp: 3200, pingpong: 0.6 },
  master: { low: 2, tape: 0.5, ratio: 2.6, loudness: -12.5 },
  tracks: {
    trumpets: { inst: 'brassFat', set: { cut: 1250, lp2: 6500, velCut: 1.3 }, vol: 0.42, pan: 0.32, echo: 0.18 },
    saxes: { inst: 'tenorSax', oct: 0, vol: 0.34, pan: -0.32, echo: 0.18 },
    bones: { inst: 'bonesFat', vol: 0.4, pan: -0.1, echo: 0.12 },
    bass: { inst: 'upright', vol: 0.62, hp: 38, comp: { thr: -8, ratio: 3 } },
    sub: { inst: 'fatBass', set: { cut: 260, fenv: 0.6, drive: 0.4 }, vol: 0.14, hp: 45 },
    drums: { kit: true, vol: 0.9, comp: { thr: -14, ratio: 3.5, att: 0.003, rel: 0.08, makeup: 1.5 }, room: 0.3, width: 1.8, mix: { kickTight: 0.7 } },
    perc: { kit: true, vol: 1.5, width: 2.6, echo: 0.06 },
  },
  sections: {
    intro: {
      bars: 4, chords: 'C7#9',
      bass: { line: [BC, BC].join(' '), vol: 1 },
      sub: [BC, BC].join(' '),
      perc: { ...LATIN, bongoH: 'x.o.x.o.x.o.x.o.' },
      drums: { ride: only(4, { 2: 'x.x.x.x.x.x.x.x.', 3: 'x.x.x.x.x.x.x.x.' }), pedal: '....x.......x...', snareTight: FILL(4), crash: only(4, {}) },
    },
    A: {
      bars: 8, chords: A_CH,
      trumpets: THEME,
      bones: { line: THEME, oct: -1, vol: 0.85 },
      bass: A_BASS, sub: A_BASS,
      drums: { ...KIT, crash: only(8, { 0: 'X' }) },
      perc: LATIN,
    },
    A2: {
      bars: 8, chords: A_CH,
      trumpets: THEME,
      saxes: { harmOf: 'trumpets', min: 3, max: 5, vol: 0.95 },
      bones: { line: THEME, oct: -1, vol: 0.85 },
      bass: A_BASS, sub: A_BASS,
      drums: { ...KIT, crash: only(8, { 0: 'X' }), snareTight: only(8, { 0: '....X..o.o..X..o', 1: '....X..o.o..X..o', 2: '....X..o.o..X..o', 3: '....X..o.o..X..o', 4: '....X..o.o..X..o', 5: '....X..o.o..X..o', 6: '....X..o.o..X..o', 7: '....X...x.x.XxXx' }) },
      perc: LATIN,
    },
    B: {
      bars: 8, chords: 'Ab7 | Ab7 | G7#9 | G7#9 | F7 | F7 | Ab7 | G7#9',
      trumpets: BRIDGE,
      saxes: { harmOf: 'trumpets', min: 3, max: 5, vol: 0.9 },
      bones: 'Gb3/1 | Gb3/1 | F3/1 | F3/1 | Eb3/1 | Eb3/1 | Gb3/1 | F3/1 |',
      bass: { gen: 'bass', pattern: 'R35a', lo: 31, gate: 0.85 },
      sub: { gen: 'bass', pattern: 'R35a', lo: 31, gate: 0.85 },
      drums: { ride: 'x.x.x.x.x.x.x.x.', pedal: '....x.......x...', kickTight: 'X.......x.......', snareTight: '......o.....x...', crash: only(8, { 0: 'X', 4: 'X' }) },
      perc: { congaH: '......x.......xx', congaL: '.......x........', shaker: 'xoxoxoxoxoxoxoxo', timbale: only(8, { 7: '........x.x.xxxx' }) },
    },
    solo: {
      bars: 16, chords: 'C7 | C7 | C7 | C7 | F7 | F7 | C7 | C7 | Ab7 | G7#9 | C7 | G7#9 | C7 | C7 | Ab7 | G7#9',
      saxes: { line: SOLO, vol: 1.25 },
      bones: { line: "r/1 | r/1 | r/1 | r/1 | r/1 | r/1 | r/1 | r/1 | r/1 | r/1 | r/1 | r/1 | r/2 !G3/8' r/8 G3/4' | r/2 !G3/8' r/8 G3/4' | r/2 !Gb3/8' r/8 Gb3/4' | r/2 !F3/8' r/8 F3/4' |", vol: 0.8 },
      trumpets: { line: "r/1 | r/1 | r/1 | r/1 | r/1 | r/1 | r/1 | r/1 | r/1 | r/1 | r/1 | r/1 | r/2 !E5/8' r/8 E5/4' | r/2 !E5/8' r/8 E5/4' | r/2 !Eb5/8' r/8 Eb5/4' | r/2 !D5/8' r/8 D5/4' |", vol: 0.7 },
      bass: [BC, BC, BF, BC, Ab1, G1, C1, G1, BC, Ab1, G1].join(' '),
      sub: [BC, BC, BF, BC, Ab1, G1, C1, G1, BC, Ab1, G1].join(' '),
      drums: { ...KIT, ride: 'x.x.x.xxx.x.x.xx', crash: only(16, { 0: 'X', 8: 'X' }), snareTight: only(16, { 15: '....X...x.x.XXXX' }) },
      perc: LATIN,
    },
    shout: {
      bars: 8, chords: A_CH,
      trumpets: SHOUT,
      saxes: { harmOf: 'trumpets', min: 3, max: 5, vol: 0.95 },
      bones: { line: SHOUT, oct: -1, vol: 0.9 },
      bass: A_BASS, sub: A_BASS,
      drums: { ...KIT, crash: only(8, { 0: 'X', 4: 'X' }), snareTight: only(8, { 0: '....X..o.o..X..o', 1: '....X..o.o..X..o', 2: '....X..o.o..X..o', 3: '....X..o.o..X..o', 4: '....X..o.o..X..o', 5: '....X..o.o..X..o', 6: '....X..o.o..X..o', 7: '....X...XXXXXXXX' }) },
      perc: { ...LATIN, cowbell: 'X...x...X...x...', timbale: only(8, { 7: '........x.x.xxxx' }) },
    },
    A3: {
      bars: 8, chords: A_CH,
      trumpets: THEME,
      saxes: { harmOf: 'trumpets', min: 3, max: 5, vol: 0.95 },
      bones: { line: THEME, oct: -1, vol: 0.85 },
      bass: A_BASS, sub: A_BASS,
      drums: { ...KIT, crash: only(8, { 0: 'X' }), snareTight: only(8, { 7: '....X...X.X.XXXX' }) },
      perc: { ...LATIN, cowbell: 'X...x...X...x...' },
    },
    end: {
      bars: 2, chords: 'C7#9 | C7#9',
      trumpets: "G4/8 A4/8 Bb4/8 C5/8 D5/8 Eb5/8 E5/8 G5/8 | !C6/4' r/4 r/2 |",
      saxes: "G4/8 A4/8 Bb4/8 C5/8 D5/8 Eb5/8 E5/8 G5/8 | !Eb5/4' r/4 r/2 |",
      bones: "G3/8 A3/8 Bb3/8 C4/8 D4/8 Eb4/8 E4/8 G4/8 | !Bb3/4' r/4 r/2 |",
      bass: "C2/8 D2/8 Eb2/8 E2/8 G2/8 A2/8 Bb2/8 B2/8 | !C2/4' r/4 r/2 |",
      sub: "C2/8 D2/8 Eb2/8 E2/8 G2/8 A2/8 Bb2/8 B2/8 | !C2/4' r/4 r/2 |",
      drums: { kickTight: 'X.......X.......|X...............', snareTight: 'X.X.X.X.XXXXXXXX|................', crash: only(2, { 1: 'X' }) },
      perc: { timbale: 'x.x.x.x.xxxxxxxx|X...............' },
    },
  },
};
