// "Waiting Room Disco" - round 2, for hospital lobbies (and the Haze station). Original; written to sit as close as it
// can to the owner's reference (Rollerdisco, Black Moth Super Rainbow) in everything but the tune: 112 BPM in C with
// E minor colour, a punchy driving electronic beat with busy sixteenth hats, warm low mids, bright, slightly detuned
// analog synths weaving a catchy retro line, a vocoder-ish voice, squashed and nearly mono, the same level throughout.

const only = (bars, at) => Array.from({ length: bars }, (_, i) => (at[i] ? at[i].padEnd(16, '.') : '.'.repeat(16))).join('|');

const A_TUNE = 'E5/8 G5/8 B5/4 A5/8 G5/8 E5/4 | D5/8 E5/8 G5/4 B4/2 | C5/8 E5/8 A5/4 G5/8 F5/8 E5/4 | D5/4 E5/8 G5/8+2 | '
  + 'E5/8 G5/8 B5/4 C6/8 B5/8 G5/4 | A5/8 G5/8 E5/4 D5/2 | C5/8 E5/8 A5/4 C6/8 B5/8 A5/4 | G5/2. r/4 |';
const B_TUNE = 'A5/4. G5/8 E5/4 C5/4 | F5/4. E5/8 D5/2 | G5/8 A5/8 B5/8 D6/8 F6/4 D6/4 | E6/2. r/4 | A5/4. G5/8 E5/4 C5/4 | F5/4. E5/8 D5/4 F5/4 | Ab5/4 F5/4 D5/4 C5/4 | D5/2 B4/2 |';
const A_CH = 'Cmaj7 | Em7 | Fmaj7 | G6 | Cmaj7 | Em7 | Fmaj7 | G6';
const B_CH = 'Am7 | Dm7 | G7 | Cmaj7 | Am7 | Dm7 | Fm6 | G7sus4 G7';
const BEAT = { kickTight: 'X.........X..x..', snareTight: '....X.......X...', hat: 'xxXx.xxxXxxx.xXx', clapFat: '....x.......x...' };

export default {
  id: 'waiting-room',
  title: 'Waiting Room Disco',
  bpm: 112,
  form: ['intro', 'A', 'B', 'A2', 'B2', 'outro'],
  loop: 1,
  echo: { beats: 0.75, fb: 0.28, mix: 0.14, lp: 2600 },
  lofi: { wow: 0.0014, flutter: 0.0002, drive: 0.6, hiss: 0.002, lp: 5200 },
  master: { low: 2.5, tape: 0.7, ratio: 3.5, thrRel: 2, loudness: -11.5, top: 8000 },
  tracks: {
    lead: { inst: 'hazeLead', set: { vib: [4.6, 0.12, 0.1], cut: 2000 }, vol: 0.34, pan: 0.05, echo: 0.2 },
    voco: { inst: 'vocoLead', vol: 0.24, pan: -0.1, echo: 0.25 },
    keys: { inst: 'warbleKeys', vol: 0.22, pan: 0.15, duck: 0.25 },
    bass: { inst: 'fatBass', set: { cut: 900 }, vol: 0.6, comp: { thr: -8, ratio: 3 } },
    pad: { inst: 'analogPad', vol: 0.12, chorus: 0.4, duck: 0.35 },
    drums: { kit: true, vol: 0.9, comp: { thr: -14, ratio: 4, att: 0.003, rel: 0.08, makeup: 2 }, room: 0.15, width: 0.8 },
  },
  sections: {
    intro: {
      bars: 4, chords: 'Cmaj7 | Em7 | Fmaj7 | G6',
      keys: { gen: 'comp', pattern: 'x..x..x.x..x..x.', lo: 55, hi: 74, size: 4, gate: 0.5 },
      bass: { gen: 'bass', pattern: '................|................|R.R.R.R.R.R.R.R.|R.R.R.R.R.R.R.8.', lo: 36 },
      drums: { hat: only(4, { 2: 'xxXx.xxxXxxx.xXx', 3: 'xxXx.xxxXxxx.xXx' }), kickTight: only(4, { 3: 'X...X...X...X.X.' }) },
    },
    A: {
      bars: 8, chords: A_CH,
      lead: A_TUNE,
      keys: { gen: 'comp', pattern: 'x..x..x.x..x..x.', lo: 55, hi: 74, size: 4, gate: 0.5 },
      bass: { gen: 'bass', pattern: 'R.R.8.R.R.R.5.8.', lo: 36 },
      drums: BEAT,
    },
    B: {
      bars: 8, chords: B_CH,
      voco: { line: B_TUNE.replace(/(\/[0-9.+]+)/g, '$1:o'), oct: -1 },
      lead: { line: B_TUNE, vol: 0.7 },
      keys: { gen: 'comp', pattern: 'x..x..x.x..x..x.', lo: 55, hi: 74, size: 4, gate: 0.5 },
      pad: { gen: 'pad', lo: 52, hi: 72, size: 4 },
      bass: { gen: 'bass', pattern: 'R.R.8.R.R.R.5.8.', lo: 36 },
      drums: { ...BEAT, ohat: '..x.......x.....' },
    },
    A2: {
      bars: 8, chords: A_CH,
      lead: A_TUNE,
      voco: { harmOf: 'lead', min: 3, max: 5, vol: 0.8 },
      keys: { gen: 'comp', pattern: 'x..x..x.x..x..x.', lo: 55, hi: 74, size: 4, gate: 0.5 },
      pad: { gen: 'pad', lo: 52, hi: 72, size: 4, vol: 0.8 },
      bass: { gen: 'bass', pattern: 'R.R.8.R.R.R.5.8.', lo: 36 },
      drums: BEAT,
    },
    B2: {
      bars: 8, chords: B_CH,
      voco: { line: B_TUNE.replace(/(\/[0-9.+]+)/g, '$1:a'), oct: -1 },
      lead: { line: B_TUNE, vol: 0.8 },
      keys: { gen: 'comp', pattern: 'x..x..x.x..x..x.', lo: 55, hi: 74, size: 4, gate: 0.5 },
      pad: { gen: 'pad', lo: 52, hi: 72, size: 4 },
      bass: { gen: 'bass', pattern: 'R.R.8.R.R.R.5.8.', lo: 36 },
      drums: { ...BEAT, ohat: '..x.......x.....' },
    },
    outro: {
      bars: 4, chords: 'Cmaj7 | Em7 | Fmaj7 | Cmaj7',
      lead: 'E5/8 G5/8 B5/4 A5/8 G5/8 E5/4 | D5/8 E5/8 G5/4 B4/2 | C5/8 E5/8 A5/4 G5/8 F5/8 E5/4 | C5/1 |',
      keys: { gen: 'comp', pattern: 'x..x..x.x..x..x.|x..x..x.x..x..x.|x..x..x.x..x..x.|x...............', lo: 55, hi: 74, size: 4, gate: 0.5 },
      bass: { gen: 'bass', pattern: 'R.R.8.R.R.R.5.8.|R.R.8.R.R.R.5.8.|R.R.8.R.R.R.5.8.|R---------------', lo: 36 },
      drums: { kickTight: 'X.........X..x..|X.........X..x..|X.........X..x..|X...............', snareTight: '....X.......X...|....X.......X...|....X...X.X.XXXX|................', hat: 'xxXx.xxxXxxx.xXx|xxXx.xxxXxxx.xXx|xxXx.xxxXxxx.xXx|................' },
    },
  },
};
