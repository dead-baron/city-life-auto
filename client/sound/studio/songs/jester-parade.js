// "Jester's Parade" - round 2, an alternative main-menu theme. Original; written to sit as close as it can to the
// owner's reference (the Disenchantment opening theme) in everything but the tune: a fast, brass-heavy band piece
// at 121 BPM in F-sharp minor leaning on A major, a punchy tuba bass with almost no deep sub, syncopated trumpet tunes,
// trombone slides, a lively marching drumbeat, a stop-time break, about a minute long.

const only = (bars, at) => Array.from({ length: bars }, (_, i) => (at[i] ? at[i].padEnd(16, '.') : '.'.repeat(16))).join('|');

const A_TUNE = "r/8 C#5/8 F#5/8 A5/8 G#5/8 F#5/8 E#5/8 F#5/8 | A5/4 C#6/4 B5/8 A5/8 G#5/4 | r/8 D5/8 F#5/8 A5/8 B5/8 A5/8 F#5/8 D5/8 | E#5/4 G#5/4 B5/4 G#5/4 | "
  + "r/8 C#5/8 F#5/8 A5/8 G#5/8 F#5/8 E#5/8 F#5/8 | B5/4 D6/4 C#6/8 B5/8 A5/4 | G#5/8 A5/8 B5/8 C#6/8 D6/8 C#6/8 B5/8 G#5/8 | !F#5/4' !C#5/4' !F#4/4' r/4 |";
const A_CH = 'F#m | F#m | D | C#7 | F#m | Bm | C#7 | F#m';
const BREAK = "!A5/4' r/4 r/2 | !G#5/4' r/4 r/2 | !F#5/4' r/4 r/2 | !E5/4' r/4 D5/8 E5/8 F#5/8 G#5/8 | A5/4. B5/8 C#6/4 A5/4 | D6/4. C#6/8 B5/4 F#5/4 | B5/8 C#6/8 D6/8 B5/8 G#5/8 A5/8 B5/8 G#5/8 | E#5/4 G#5/4 C#6/4 r/4 |";
const B_CH = 'A | E | D | E7 | A | D | Bm7 E7 | C#7';
const MARCH = { kickSoft: 'X.......X.......', snareTight: '....X.o.o...X.oo', crash: '................', hat: 'x.x.x.x.x.x.x.x.' };

export default {
  id: 'jester-parade',
  title: "Jester's Parade",
  bpm: 121,
  swing: 0.06,
  form: ['fanfare', 'A', 'B', 'A2', 'coda'],
  loop: 1,
  echo: { beats: 0.5, fb: 0.2, mix: 0.1, lp: 3500 },
  master: { low: 1, tape: 0.5, ratio: 2.6, loudness: -12.5 },
  tracks: {
    trumpets: { inst: 'brassFat', set: { cut: 1350, lp2: 7000, velCut: 1.3 }, vol: 0.42, pan: 0.25, echo: 0.12 },
    bones: { inst: 'bonesFat', set: { glide: 0.12 }, vol: 0.38, pan: -0.25, echo: 0.1 },
    horns: { inst: 'tenorSax', vol: 0.28, pan: -0.45, echo: 0.1 },
    tuba: { inst: 'tuba', set: { drive: 0.9, cut: 700 }, vol: 0.5, hp: 95 },
    drums: { kit: true, vol: 0.6, comp: { thr: -14, ratio: 3.5, att: 0.003, rel: 0.08, makeup: 1.5 }, room: 0.4, width: 1.6, hp: 90, mix: { kickSoft: 0.5 } },
  },
  sections: {
    fanfare: {
      bars: 2, chords: 'C#7 | C#7',
      trumpets: "!C#5/8' !E#5/8' !G#5/8' !B5/8' !C#6/4 r/4 | !G#5/8' !B5/8' !C#6/8' !E#6/8' !G#6/4 r/4 |",
      bones: "!C#3/8' !E#3/8' !G#3/8' !B3/8' !C#4/4 r/4 | !G#3/8' !B3/8' !C#4/8' !E#4/8' !G#4/4 r/4 |",
      tuba: "!C#2/4' r/4 !C#2/4' r/4 | !G#1/4' r/4 !C#2/4' r/4 |",
      drums: { snareTight: 'x.x.xxxxXXXXXXXX|x.x.xxxxXXXXXXXX', crash: '................|........X.......', kickFat: 'X...X...X...X...|X...X...X.......' },
    },
    A: {
      bars: 8, chords: A_CH,
      trumpets: A_TUNE,
      bones: { gen: 'comp', pattern: '....x.......x...', lo: 50, hi: 66, size: 3, gate: 0.5 },
      tuba: { gen: 'bass', pattern: 'R.......5.....a.', lo: 30, gate: 0.6 },
      drums: { ...MARCH, crash: only(8, { 0: 'X', 4: 'X' }) },
    },
    B: {
      bars: 8, chords: B_CH,
      trumpets: BREAK,
      bones: "!A3/4' r/4 r/2 | !G#3/4' r/4 r/2 | !F#3/4' r/4 r/2 | !E3/4' r/4 r/2 | C#4/2~ E4/2 | F#4/2~ A4/2 | D4/2 B3/2 | E#3/2 G#3/2 |",
      horns: { harmOf: 'trumpets', min: 3, max: 5, vol: 0.9 },
      tuba: "!A1/4' r/4 r/2 | !E1/4' r/4 r/2 | !D2/4' r/4 r/2 | !E2/4' r/4 r/2 | A1/4 E2/4 A1/4 E2/4 | D2/4 A1/4 D2/4 A1/4 | B1/4 F#2/4 E2/4 B1/4 | C#2/4 G#1/4 C#2/4 C2/4 |",
      drums: { kickFat: only(8, { 0: 'X', 1: 'X', 2: 'X', 3: 'X', 4: 'X.......X.......', 5: 'X.......X.......', 6: 'X.......X.......', 7: 'X.......X.......' }), snareTight: only(8, { 0: '....x.x.xxXX.xXX', 1: '....x.x.xxXX.xXX', 2: '....x.x.xxXX.xXX', 3: '....xxxxXXXX....', 4: '....X.o.o...X.oo', 5: '....X.o.o...X.oo', 6: '....X.o.o...X.oo', 7: '....X...X.X.XXXX' }), crash: only(8, { 0: 'X', 1: 'X', 2: 'X', 3: 'X', 4: 'X' }) },
    },
    A2: {
      bars: 8, chords: A_CH,
      trumpets: A_TUNE,
      horns: { harmOf: 'trumpets', min: 3, max: 5, vol: 0.9 },
      bones: { line: A_TUNE, oct: -1, vol: 0.7 },
      tuba: { gen: 'bass', pattern: 'R.......5.....a.', lo: 30, gate: 0.6 },
      drums: { ...MARCH, crash: only(8, { 0: 'X', 4: 'X' }) },
    },
    coda: {
      bars: 4, chords: 'F#m | D | C#7 | F#m',
      trumpets: "r/8 C#5/8 F#5/8 A5/8 G#5/8 F#5/8 E#5/8 F#5/8 | A5/4 F#5/4 D5/4 F#5/4 | G#5/8 A5/8 B5/8 C#6/8 E#6/4 G#6/4 | !F#6/4' r/4 r/2 |",
      bones: "F#3/2 A3/2 | D3/2 F#3/2 | E#3/2 G#3/2 | !F#3/4' r/4 r/2 |",
      horns: "C#5/2 F#5/2 | F#5/2 A5/2 | G#5/2 B5/2 | !C#5/4' r/4 r/2 |",
      tuba: "F#1/4 C#2/4 F#1/4 C#2/4 | D2/4 A1/4 D2/4 A1/4 | C#2/4 G#1/4 C#2/4 G#1/4 | !F#1/4' r/4 r/2 |",
      drums: { kickFat: 'X.......X.......|X.......X.......|X...X...X...X...|X...............', snareTight: '....X.o.o...X.oo|....X.o.o...X.oo|xxxxxxxxXXXXXXXX|X...............', crash: '................|................|................|X...............' },
    },
  },
};
