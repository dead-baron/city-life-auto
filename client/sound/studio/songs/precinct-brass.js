// "Badge and Brass" - round 2, for the Precinct station (police cars). Original; written to sit as close as it can
// to the owner's reference (the Brooklyn Nine-Nine opening theme) in everything but the tune: 108 BPM, E sliding
// between minor and major like bluesy rock, a punchy brass section up front, a groovy overdriven bass, a driving rock
// beat, a sharp brass blast to open and one big hit to end. The reference is a 20-second sting; for a radio station
// this one runs about a minute and a half and loops.

const only = (bars, at) => Array.from({ length: bars }, (_, i) => (at[i] ? at[i].padEnd(16, '.') : '.'.repeat(16))).join('|');

const RIFF = "!E5/8' r/8 !E5/8' G5/8 A5/8 Bb5/8 B5/4 | D6/8 B5/8 A5/8 G5/8 E5/4 r/4 | !E5/8' r/8 !E5/8' G5/8 A5/8 Bb5/8 B5/8 D6/8 | E6/8 D6/8 B5/8 A5/8 !G5/8' !A5/8' !B5/4' |";
const HORNS_B = "C#6/4. B5/8 A5/4 G5/4 | E5/8 G5/8 A5/8 C#6/8 E6/2 | D6/4. B5/8 G5/4 E5/4 | G#5/8 A5/8 B5/8 D6/8 E6/2 | "
  + "E6/4. D6/8 C6/4 Bb5/4 | D#6/4. C#6/8 B5/4 A5/4 | !E6/8' !E6/8' r/8 !D6/8' r/8 !B5/8' !G5/4 | !E5/4' r/4 r/2 |";
const BASS1 = 'E2/8 E2/16 E3/16 r/8 E2/8 G2/8 A2/8 Bb2/8 B2/8 |', BASS2 = 'E2/8 E2/16 E3/16 r/8 D3/8 B2/8 A2/8 G2/8 E2/8 |';
const BASS_A = [BASS1, BASS2, BASS1, BASS2].join(' ');
const GTR_A = "E3+B3+E4/8' r/8 E3+B3+E4/8' r/8 r/4 G3+D4+G4/8' A3+E4+A4/8' | E3+B3+E4/8' r/8 E3+B3+E4/8' r/8 r/2 |";
const ROCK = { kickFat: 'X.....x.X.x.....', snareFat: '....X.......X...', hat: 'xxXxxxXxxxXxxxXx' };

export default {
  id: 'precinct-brass',
  title: 'Badge and Brass',
  bpm: 108,
  form: ['blast', 'A', 'B', 'A2', 'break', 'B2', 'end'],
  loop: 1,
  echo: { beats: 0.5, fb: 0.2, mix: 0.1, lp: 3500 },
  master: { low: 2, tape: 0.5, ratio: 2.8, loudness: -12 },
  tracks: {
    horns: { inst: 'brassFat', set: { cut: 1650, lp2: 8500, velCut: 1.4 }, vol: 0.44, pan: 0.25, echo: 0.12 },
    saxes: { inst: 'tenorSax', vol: 0.32, pan: -0.3, echo: 0.12 },
    bass: { inst: 'pickBass', vol: 0.62, comp: { thr: -8, ratio: 3 } },
    guitar: { inst: 'crunchGuitar', vol: 0.3, pan: -0.6, hp: 120 },
    organ: { inst: 'grimeOrgan', vol: 0.12, pan: 0.6, duck: 0.2 },
    drums: { kit: true, vol: 0.55, comp: { thr: -14, ratio: 4, att: 0.003, rel: 0.08, makeup: 2 }, room: 0.35, width: 1.8 },
  },
  sections: {
    blast: {
      bars: 2, chords: 'E7#9 | E7#9',
      horns: "!E5/4' r/4 r/8 !E5/8' !G5/8' !B5/8' | !E6/2 r/2 |",
      saxes: "!B4/4' r/4 r/8 !B4/8' !D5/8' !G5/8' | !B5/2 r/2 |",
      bass: "!E2/4' r/4 r/8 E2/8 G2/8 B2/8 | E3/2 r/8 B2/8 A2/8 G2/8 |",
      guitar: "!E3+B3+E4/4' r/4 r/2 | E3+B3+E4/2 r/2 |",
      drums: { kickFat: 'X...........X.X.|X.......X.......', snareFat: '........x.x.X.X.|........x.xxXXXX', crash: 'X...............|X...............' },
    },
    A: {
      bars: 8, chords: 'E7#9',
      horns: RIFF,
      bass: BASS_A,
      guitar: GTR_A,
      drums: { ...ROCK, crash: only(8, { 0: 'X', 4: 'X' }) },
    },
    B: {
      bars: 8, chords: 'A7 | A7 | E7#9 | E7#9 | C7 | B7 | E7#9 | E7#9',
      horns: HORNS_B,
      saxes: { harmOf: 'horns', min: 3, max: 5, vol: 0.95 },
      bass: { gen: 'bass', pattern: 'R.R8R.5.R.R87.5.', lo: 33 },
      organ: { gen: 'comp', pattern: 'x.......x.......', lo: 55, hi: 74, size: 4, gate: 0.9 },
      guitar: { gen: 'comp', pattern: 'x..x..x.........', lo: 40, power: true, gate: 0.35 },
      drums: { ...ROCK, ohat: '..x...x...x...x.', hat: 'x...x...x...x...', crash: only(8, { 0: 'X', 4: 'X' }), tomH: only(8, { 7: '........X.X.....' }), tomL: only(8, { 7: '............X.X.' }) },
    },
    A2: {
      bars: 8, chords: 'E7#9',
      horns: RIFF,
      saxes: { line: RIFF, oct: -1, vol: 0.9 },
      bass: BASS_A,
      guitar: GTR_A,
      organ: { gen: 'comp', pattern: '....x.......x...', lo: 55, hi: 74, size: 4, gate: 0.5 },
      drums: { ...ROCK, crash: only(8, { 0: 'X', 4: 'X' }), snareFat: only(8, { 7: '....X...x.x.XXXX' }) },
    },
    break: {
      bars: 4, chords: 'E7#9',
      bass: [BASS1, BASS2, BASS1, 'E2/8 E2/16 E3/16 r/8 D3/8 B2/8 A2/8 Bb2/8 B2/8 |'].join(' '),
      drums: { kickFat: 'X.....x.X.x.....', snareFat: only(4, { 0: '....X.......X...', 1: '....X.......X...', 2: '....X.......X...', 3: '....X...X.X.XXXX' }), hat: 'x.x.x.x.x.x.x.x.' },
      organ: { gen: 'comp', pattern: 'x...............', lo: 55, hi: 74, size: 4, gate: 0.95, vol: 0.8 },
    },
    B2: {
      bars: 8, chords: 'A7 | A7 | E7#9 | E7#9 | C7 | B7 | E7#9 | E7#9',
      horns: HORNS_B,
      saxes: { harmOf: 'horns', min: 3, max: 5, vol: 0.95 },
      bass: { gen: 'bass', pattern: 'R.R8R.5.R.R87.5.', lo: 33 },
      organ: { gen: 'comp', pattern: 'x.......x.......', lo: 55, hi: 74, size: 4, gate: 0.9 },
      guitar: { gen: 'comp', pattern: 'x..x..x.........', lo: 40, power: true, gate: 0.35 },
      drums: { ...ROCK, ohat: '..x...x...x...x.', hat: 'x...x...x...x...', crash: only(8, { 0: 'X', 4: 'X' }), snareFat: only(8, { 7: '....X...X.X.XXXX' }) },
    },
    end: {
      bars: 2, chords: 'E7#9 | E7#9',
      horns: "!E5/8' !G5/8' !A5/8' !Bb5/8' !B5/8' !D6/8' !D#6/8' !E6/8' | !E6/4' r/4 r/2 |",
      saxes: "!B4/8' !D5/8' !E5/8' !F5/8' !F#5/8' !A5/8' !A#5/8' !B5/8' | !G#5/4' r/4 r/2 |",
      bass: "E2/8 G2/8 A2/8 Bb2/8 B2/8 D3/8 D#3/8 E3/8 | !E2/4' r/4 r/2 |",
      guitar: "r/1 | !E3+B3+E4+G#4/4' r/4 r/2 |",
      drums: { kickFat: 'X.X.X.X.X.X.X.X.|X...............', snareFat: 'x.x.x.x.XXXXXXXX|X...............', crash: '................|X...............' },
    },
  },
};
