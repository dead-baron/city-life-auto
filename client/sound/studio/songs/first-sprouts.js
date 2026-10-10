// "First Sprouts" - round 2, for farming and gardening, farm and garden shops, and the Garden station. Original;
// written to sit as close as it can to the owner's reference (Spring, from Stardew Valley) in everything but the tune:
// 119 BPM in A major, straight, starting very quietly and building, a bright whistling flute tune over a gentle
// acoustic guitar rhythm, light percussion, little retro synth chimes and a bouncy bass, with a breakdown before the
// last time through. Dynamic, not squashed.

const only = (bars, at) => Array.from({ length: bars }, (_, i) => (at[i] ? at[i].padEnd(16, '.') : '.'.repeat(16))).join('|');

const A_TUNE = 'C#5/4 E5/8 A5/8+4 G#5/8 F#5/8 | F#5/4 A5/4 D5/2 | E5/4 C#5/8 E5/8 A5/4 B5/4 | G#5/2. r/4 | A5/4 C#6/8 A5/8+4 F#5/8 E5/8 | D5/4 F#5/4 A5/4 F#5/4 | D5/8 E5/8 F#5/8 G#5/8 B5/4 G#5/4 | A5/2. r/4 |';
const B_TUNE = 'F#5/4. E5/8 D5/4 A5/4 | G#5/4. F#5/8 E5/2 | E5/8 G#5/8 B5/8 C#6/8 E6/4 C#6/4 | A5/2. r/4 | F#5/4. E5/8 D5/4 F#5/4 | B5/4. A5/8 G#5/4 E5/4 | D5/8 F#5/8 A5/8 B5/8 D6/4 B5/4 | E5/2. r/4 |';
const A_CH = 'A | D | A/C# | E | F#m | D | Bm7 E7 | A';
const B_CH = 'D | E | C#m7 | F#m | D | E | Bm7 | E7sus4 E7';
const CHIME = { gen: 'arp', pattern: '0.1.2.4.2.1.0.2.', lo: 69, vol: 0.8 };
const LIGHT = { kickSoft: 'x.......x.......', shaker: 'oxoxoxoxoxoxoxox', rim: '....x.......x...' };

export default {
  id: 'first-sprouts',
  title: 'First Sprouts',
  bpm: 119,
  form: ['intro', 'A', 'B', 'A2', 'rest', 'A3', 'outro'],
  loop: 1,
  echo: { beats: 0.75, fb: 0.28, mix: 0.16, lp: 3000, pingpong: 0.5 },
  master: { low: 1, tape: 0.2, ratio: 1.8, thrRel: 7, loudness: -15 },
  tracks: {
    flute: { inst: 'whistle', vol: 0.36, pan: 0.05, echo: 0.25 },
    chimes: { inst: 'toyPiano', vol: 0.18, pan: 0.45, echo: 0.35 },
    guitar: { inst: 'steelGuitar', set: { bright: 0.5 }, vol: 0.3, pan: -0.4, hp: 100, echo: 0.1 },
    bass: { inst: 'fingerBass', set: { cut: 600 }, vol: 0.66 },
    pad: { inst: 'strings', vol: 0.1, chorus: 0.4, lp: 3000 },
    perc: { kit: true, vol: 0.8, width: 1.8, echo: 0.06 },
  },
  sections: {
    intro: {
      bars: 6, chords: 'A | D | A | E | A | E',
      guitar: { gen: 'strum', pattern: 'D...D.dU', lo: 40, vol: 0.3 },
      chimes: { ...CHIME, vol: 0.3 },
    },
    A: {
      bars: 8, chords: A_CH,
      flute: A_TUNE,
      guitar: { gen: 'strum', pattern: 'D.dUd.DU', lo: 40 },
      chimes: CHIME,
      bass: { gen: 'bass', pattern: 'R..5R.5a', lo: 33 },
      perc: LIGHT,
    },
    B: {
      bars: 8, chords: B_CH,
      flute: B_TUNE,
      guitar: { gen: 'strum', pattern: 'D.dUd.DU', lo: 40 },
      chimes: { harmOf: 'flute', min: 3, max: 5, vol: 0.7 },
      pad: { gen: 'pad', lo: 52, hi: 72, size: 3 },
      bass: { gen: 'bass', pattern: 'R..5R.5a', lo: 33 },
      perc: { ...LIGHT, tamb: '....x.......x...' },
    },
    A2: {
      bars: 8, chords: A_CH,
      flute: A_TUNE,
      guitar: { gen: 'strum', pattern: 'D.dUd.DU', lo: 40 },
      chimes: CHIME,
      pad: { gen: 'pad', lo: 52, hi: 72, size: 3, vol: 0.8 },
      bass: { gen: 'bass', pattern: 'R..5R.5a', lo: 33 },
      perc: LIGHT,
    },
    rest: {
      bars: 4, chords: 'F#m | D | E | E7',
      guitar: { gen: 'strum', pattern: 'D...............', lo: 40, vol: 0.7 },
      chimes: { ...CHIME, vol: 0.9 },
      pad: { gen: 'pad', lo: 52, hi: 72, size: 3 },
    },
    A3: {
      bars: 8, chords: A_CH,
      flute: A_TUNE,
      chimes: { harmOf: 'flute', min: 3, max: 5, vol: 0.7 },
      guitar: { gen: 'strum', pattern: 'D.dUd.DU', lo: 40 },
      pad: { gen: 'pad', lo: 52, hi: 72, size: 3 },
      bass: { gen: 'bass', pattern: 'R..5R.5a', lo: 33 },
      perc: { ...LIGHT, tamb: only(8, { 0: 'x' }) },
    },
    outro: {
      bars: 4, chords: 'A | D | E | A',
      flute: 'C#5/4 E5/8 A5/8+4 G#5/8 F#5/8 | F#5/4 A5/4 D5/2 | E5/4 G#5/4 B5/4 G#5/4 | A5/1 |',
      guitar: { gen: 'strum', pattern: 'D.dUd.DU|D.dUd.DU|D.dUd.DU|D.......', lo: 40 },
      chimes: { ...CHIME, vol: 0.6 },
      bass: { gen: 'bass', pattern: 'R..5R.5a|R..5R.5a|R..5R.5a|R-------', lo: 33 },
    },
  },
};
