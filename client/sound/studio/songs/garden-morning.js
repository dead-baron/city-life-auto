// "Tomatoes in the Morning" - for the Garden station and the farm and garden shops (round 1 draft). Original; the
// brief from the owner's references (Let Me Tell You About My Boat, Spring) is only the feel: a picked acoustic guitar,
// a glockenspiel tune, warm pads, a soft start that builds, then a whistling flute and a bouncy bass, nothing harsh.
// F major, 100 BPM, straight.

const bar = (s) => s.padEnd(16, '.');
const only = (bars, at) => Array.from({ length: bars }, (_, i) => (at[i] ? bar(at[i]) : '.'.repeat(16))).join('|');

const A_CHORDS = 'F | C/E | Dm7 | Bbmaj7 | F/A | Gm7 | Bbmaj7 C | F';
const B_CHORDS = 'Bb | C | Am7 | Dm7 | Bb | C | Gm7 | C7sus4 C7';
const TUNE = 'C5/4 F5/4 A5/4. G5/8 | G5/2 E5/4 C5/4 | D5/4 F5/4 A5/4 C6/4 | A5/2. r/4 | C6/4 A5/4 F5/4. G5/8 | Bb5/4 A5/8 G5/8 F5/4 D5/4 | D5/4 F5/4 E5/4 G5/4 | F5/2. r/4 |';
const B_TUNE = 'D6/8 C6/8 Bb5/8 C6/8 D6/4 F6/4 | E6/8 D6/8 C6/8 D6/8 E6/4 G6/4 | A6/4. G6/8 E6/4 C6/4 | D6/2. r/4 | '
  + 'F6/8 E6/8 D6/8 E6/8 F6/4 D6/4 | E6/8 D6/8 C6/8 D6/8 E6/4 C6/4 | Bb5/4 C6/4 D6/4 F6/4 | E6/2 r/8 G5/8 A5/8 Bb5/8 |';
const PICK = '02130214';   // (thumb on the bass and the fifth, fingers on the strings above: Travis-style)

export default {
  id: 'garden-morning',
  title: 'Tomatoes in the Morning',
  bpm: 100,
  form: ['intro', 'A', 'A2', 'B', 'A3', 'outro'],
  loop: 1,
  echo: { beats: 0.75, fb: 0.3, mix: 0.2, lp: 2800, pingpong: 0.5 },
  master: { top: 9000 },
  tracks: {
    guitar: { inst: 'nylonGuitar', vol: 0.5, pan: -0.4, hp: 90, echo: 0.15, eq: [{ f: 180, g: 2, q: 0.8 }] },
    glock: { inst: 'glock', vol: 0.3, pan: 0.45, echo: 0.35 },
    flute: { inst: 'whistle', vol: 0.34, pan: 0.1, echo: 0.3 },
    bass: { inst: 'fingerBass', vol: 0.42 },
    pad: { inst: 'strings', vol: 0.13, chorus: 0.5, echo: 0.25, lp: 3000 },
    perc: { kit: true, vol: 0.8, width: 1.8, echo: 0.08 },
  },
  sections: {
    intro: {
      bars: 4, chords: 'F | C/E | Dm7 | Bbmaj7 C',
      guitar: { gen: 'pick', pattern: PICK, lo: 40 },
    },
    A: {
      bars: 8, chords: A_CHORDS,
      guitar: { gen: 'pick', pattern: PICK, lo: 40 },
      glock: TUNE,
      pad: { gen: 'pad', lo: 53, hi: 72, size: 3, vol: 0.8 },
    },
    A2: {
      bars: 8, chords: A_CHORDS,
      guitar: { gen: 'pick', pattern: PICK, lo: 40 },
      flute: TUNE,
      glock: { harmOf: 'flute', min: 3, max: 5, vol: 0.6 },
      bass: { gen: 'bass', pattern: 'R..5R.5a', lo: 29 },
      pad: { gen: 'pad', lo: 53, hi: 72, size: 3 },
      perc: { shaker: 'oxoxoxoxoxoxoxox', kickSoft: 'x.......x.......' },
    },
    B: {
      bars: 8, chords: B_CHORDS,
      guitar: { gen: 'strum', pattern: 'D.dUd.DU', lo: 40, vol: 0.85 },
      flute: B_TUNE,
      glock: 'r/1 | r/1 | A6/2 G6/2 | F6/1 | r/1 | r/1 | D6/2 F6/2 | E6/1 |',
      bass: { gen: 'bass', pattern: 'R..5R.5a', lo: 29 },
      pad: { gen: 'pad', lo: 53, hi: 72, size: 3 },
      perc: { shaker: 'oxoxoxoxoxoxoxox', kickSoft: 'x.......x.......', rim: '....x.......x...', block: only(8, { 3: '..........x.x.x.', 7: '........x.x.x.x.' }) },
    },
    A3: {
      bars: 8, chords: A_CHORDS,
      guitar: { gen: 'pick', pattern: PICK, lo: 40 },
      flute: TUNE,
      glock: TUNE,
      bass: { gen: 'bass', pattern: 'R..5R.5a', lo: 29 },
      pad: { gen: 'pad', lo: 53, hi: 72, size: 3 },
      perc: { shaker: 'oxoxoxoxoxoxoxox', kickSoft: 'x.......x.......', rim: '....x.......x...', tamb: only(8, { 0: 'x' }) },
    },
    outro: {
      bars: 4, chords: 'F | C/E | Bbmaj7 C | F',
      guitar: { gen: 'pick', pattern: '02130214|02130214|02130214|0.......', lo: 40 },
      glock: 'C5/4 F5/4 A5/4. G5/8 | G5/2 E5/4 C5/4 | D5/4 F5/4 E5/4 G5/4 | F5/1 |',
      pad: { gen: 'pad', lo: 53, hi: 72, size: 3, vol: 0.8 },
      bass: { gen: 'bass', pattern: 'R.......|R.......|R...R...|R-------', lo: 29, vol: 0.8 },
    },
  },
};
