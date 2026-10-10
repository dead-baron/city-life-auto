// "Porch Light" - round 2, for gardening and the Garden station. Original; written to sit as close as it can to the
// owner's reference (Let Me Tell You About My Boat) in everything but the tune: C major, a slow two-beat sway with a
// soft acoustic guitar picking four notes to each, a glockenspiel tune on top, warm pads underneath, a warm middle
// and almost no high end, swelling gently in the middle. Reflective and close.

const only = (bars, at) => Array.from({ length: bars }, (_, i) => (at[i] ? at[i].padEnd(16, '.') : '.'.repeat(16))).join('|');

const A_TUNE = 'E5/4. D5/8 E5/4 G5/4 | D5/2 B4/4 G4/4 | C5/4. B4/8 C5/4 E5/4 | A4/2. r/4 | G4/4 C5/4 E5/4 G5/4 | F5/4. E5/8 D5/2 | A4/4 C5/4 B4/4 D5/4 | C5/2. r/4 |';
const B_TUNE = 'A5/4. G5/8 F5/4 C5/4 | G5/4. F5/8 E5/2 | F5/4 E5/4 D5/4 A4/4 | B4/2 D5/2 | A5/4. G5/8 F5/4 C5/4 | G5/4. F5/8 E5/4 C5/4 | D5/4 F5/4 E5/4 D5/4 | C5/1 |';
const A_CH = 'C | G/B | Am7 | Fmaj7 | C/E | Dm7 | Fmaj7 G | C';
const B_CH = 'Fmaj7 | Em7 | Dm7 | G | Fmaj7 | Em7 | Dm7 G | C';
const PICK = '0213021402130214';

export default {
  id: 'porch-light',
  title: 'Porch Light',
  bpm: 110,
  form: ['intro', 'A', 'A2', 'B', 'A3', 'outro'],
  loop: 1,
  echo: { beats: 1.5, fb: 0.32, mix: 0.18, lp: 2200, pingpong: 0.5 },
  master: { low: 2.5, tape: 0.3, ratio: 2, loudness: -15, top: 8500 },
  tracks: {
    guitar: { inst: 'nylonGuitar', set: { bright: 0.35 }, vol: 0.55, pan: -0.3, hp: 80, echo: 0.12, eq: [{ f: 220, g: 2, q: 0.8 }] },
    glock: { inst: 'glock', vol: 0.3, pan: 0.3, echo: 0.35, lp: 4000 },
    keys: { inst: 'epiano', vol: 0.18, pan: 0.1, echo: 0.25, lp: 3000 },
    pad: { inst: 'analogPad', set: { cut: 1100 }, vol: 0.14, chorus: 0.5, echo: 0.2 },
    bass: { inst: 'fingerBass', set: { cut: 420 }, vol: 0.55 },
  },
  sections: {
    intro: {
      bars: 4, chords: 'C | G/B | Am7 | Fmaj7',
      guitar: { gen: 'pick', pattern: PICK, lo: 40 },
      bass: { gen: 'bass', pattern: '................|................|R.......5.......|R.......5.......', lo: 31, vol: 0.8 },
    },
    A: {
      bars: 8, chords: A_CH,
      guitar: { gen: 'pick', pattern: PICK, lo: 40 },
      glock: A_TUNE,
      pad: { gen: 'pad', lo: 52, hi: 71, size: 3, vol: 0.7 },
    },
    A2: {
      bars: 8, chords: A_CH,
      guitar: { gen: 'pick', pattern: PICK, lo: 40 },
      glock: A_TUNE,
      keys: { harmOf: 'glock', min: 3, max: 5, vol: 0.8 },
      pad: { gen: 'pad', lo: 52, hi: 71, size: 3 },
      bass: { gen: 'bass', pattern: 'R...5...R...5...', lo: 31 },
    },
    B: {
      bars: 8, chords: B_CH,
      guitar: { gen: 'pick', pattern: PICK, lo: 40 },
      glock: B_TUNE,
      keys: { gen: 'comp', pattern: 'x.......x.......', lo: 55, hi: 72, size: 4, gate: 0.95 },
      pad: { gen: 'pad', lo: 52, hi: 71, size: 4, vol: 1.3 },
      bass: { gen: 'bass', pattern: 'R...5...R...5...', lo: 31 },
    },
    A3: {
      bars: 8, chords: A_CH,
      guitar: { gen: 'pick', pattern: PICK, lo: 40 },
      glock: A_TUNE,
      keys: { harmOf: 'glock', min: 3, max: 5, vol: 0.7 },
      pad: { gen: 'pad', lo: 52, hi: 71, size: 3, vol: 0.9 },
      bass: { gen: 'bass', pattern: 'R...5...R...5...', lo: 31, vol: 0.9 },
    },
    outro: {
      bars: 4, chords: 'C | G/B | Fmaj7 G | C',
      guitar: { gen: 'pick', pattern: '0213021402130214|0213021402130214|0213021402130214|0...............', lo: 40 },
      glock: 'E5/4. D5/8 E5/4 G5/4 | D5/2 B4/4 G4/4 | A4/4 C5/4 B4/4 D5/4 | C5/1 |',
      pad: { gen: 'pad', lo: 52, hi: 71, size: 3, vol: 0.7 },
    },
  },
};
