// "Sunburnt Tape" - round 2, for the main screen or out in the world (the Haze station). Original; written to sit as
// close as it can to the owner's reference (When the Sun Grows on Your Tongue, Black Moth Super Rainbow) in
// everything but the tune: 97 BPM in G, a spacey, warbling keyboard intro that floats for about fifteen seconds, then
// a lo-fi turntable beat with busy sixteenth hats, warm thick low mids, distorted synth swells, squashed and nearly
// mono, with a dip in the middle before it comes back.

const only = (bars, at) => Array.from({ length: bars }, (_, i) => (at[i] ? at[i].padEnd(16, '.') : '.'.repeat(16))).join('|');

const A_TUNE = 'B4/4 D5/4 F#5/4. E5/8 | D5/2 B4/4 A4/4 | G4/4 B4/4 E5/4. D5/8 | C5/2. r/4 | B4/4 D5/4 G5/4. F#5/8 | E5/2 D5/4 B4/4 | C5/4 E5/4 G5/4 E5/4 | F#5/2. r/4 |';
const B_TUNE = 'G5/4. F#5/8 E5/4 B4/4 | E5/4. D5/8 C5/4 G4/4 | A4/8 C5/8 E5/8 G5/8 A5/4 G5/4 | F#5/2 G5/4 A5/4 | G5/4. F#5/8 E5/4 B4/4 | E5/4. D5/8 C5/4 E5/4 | A5/8 G5/8 E5/8 C5/8 A4/4 C5/4 | D5/1 |';
const A_CH = 'Gmaj7 | Bm7 | Cmaj7 | D6 | Gmaj7 | Bm7 | Cmaj7 | D6';
const B_CH = 'Em9 | Cmaj7 | Am7 | D7 | Em9 | Cmaj7 | Am7 | D7';
const TURNTABLE = { kickDust: 'X.......X.x.....', snareDust: '....X.......X...', hatDust: 'xxXxxxXxxxXxxxXx' };

export default {
  id: 'sunburnt-tape',
  title: 'Sunburnt Tape',
  bpm: 97,
  form: ['float', 'A', 'B', 'dip', 'A2', 'B2', 'outro'],
  loop: 1,
  echo: { beats: 0.75, fb: 0.42, mix: 0.24, lp: 2200, pingpong: 0.4 },
  lofi: { wow: 0.0032, flutter: 0.0005, drive: 0.7, hiss: 0.004, lp: 5400 },
  master: { low: 2, tape: 0.7, ratio: 3.5, thrRel: 2, loudness: -12 },
  tracks: {
    keys: { inst: 'warbleKeys', vol: 0.3, pan: -0.1, echo: 0.35, chorus: 0.4 },
    lead: { inst: 'hazeLead', vol: 0.3, pan: 0.15, echo: 0.3 },
    swell: { inst: 'analogPad', set: { env: [0.9, 1, 0.9, 0.8], drive: 1.4, cut: 1600 }, vol: 0.15, chorus: 0.5, duck: 0.3 },
    bass: { inst: 'fatBass', set: { cut: 800 }, vol: 0.62, comp: { thr: -8, ratio: 3 } },
    drums: { kit: true, vol: 0.9, comp: { thr: -15, ratio: 4.5, att: 0.003, rel: 0.09, makeup: 2.5 }, room: 0.2, drive: 0.4, width: 0.8 },
  },
  sections: {
    float: {
      bars: 6, chords: 'Gmaj7 | Bm7 | Cmaj7 | D6 | Gmaj7 | D6',
      keys: { gen: 'arp', pattern: '0...2...1...3...', lo: 59, vol: 0.9 },
      swell: { gen: 'pad', lo: 52, hi: 74, size: 4 },
      lead: 'r/1 | B5/1 | r/1 | A5/1 | r/1 | F#5/2 A5/2 |',
    },
    A: {
      bars: 8, chords: A_CH,
      keys: { gen: 'comp', pattern: 'x..x..x...x..x..', lo: 55, hi: 74, size: 4, gate: 0.6 },
      lead: A_TUNE,
      bass: { gen: 'bass', pattern: 'R..R..5.R.R..8..', lo: 31 },
      drums: { ...TURNTABLE, crash: only(8, { 0: 'X' }) },
    },
    B: {
      bars: 8, chords: B_CH,
      keys: { gen: 'comp', pattern: 'x..x..x...x..x..', lo: 55, hi: 74, size: 4, gate: 0.6 },
      lead: B_TUNE,
      swell: { gen: 'pad', lo: 52, hi: 74, size: 4 },
      bass: { gen: 'bass', pattern: 'R..R..5.R.R..8..', lo: 31 },
      drums: { ...TURNTABLE, ohatDust: '..............x.' },
    },
    dip: {
      bars: 6, chords: 'Em9 | Cmaj7 | Am7 | D7 | Em9 | D7',
      keys: { gen: 'arp', pattern: '0...2...1...3...', lo: 59 },
      swell: { gen: 'pad', lo: 52, hi: 74, size: 4, vol: 1.2 },
      bass: { gen: 'bass', pattern: 'R-------R-------', lo: 31, vol: 0.8 },
      drums: { hatDust: 'x.x.x.x.x.x.x.x.', snareDust: only(6, { 5: '........x.x.XXXX' }) },
    },
    A2: {
      bars: 8, chords: A_CH,
      keys: { gen: 'comp', pattern: 'x..x..x...x..x..', lo: 55, hi: 74, size: 4, gate: 0.6 },
      lead: A_TUNE,
      swell: { gen: 'pad', lo: 52, hi: 74, size: 4, vol: 0.8 },
      bass: { gen: 'bass', pattern: 'R..R..5.R.R..8..', lo: 31 },
      drums: { ...TURNTABLE, crash: only(8, { 0: 'X' }) },
    },
    B2: {
      bars: 8, chords: B_CH,
      keys: { gen: 'comp', pattern: 'x..x..x...x..x..', lo: 55, hi: 74, size: 4, gate: 0.6 },
      lead: B_TUNE,
      swell: { gen: 'pad', lo: 52, hi: 74, size: 4 },
      bass: { gen: 'bass', pattern: 'R..R..5.R.R..8..', lo: 31 },
      drums: { ...TURNTABLE, ohatDust: '..............x.' },
    },
    outro: {
      bars: 4, chords: 'Gmaj7 | Bm7 | Cmaj7 | Gmaj7',
      keys: { gen: 'arp', pattern: '0...2...1...3...|0...2...1...3...|0...2...1...3...|0...............', lo: 59 },
      swell: { gen: 'pad', lo: 52, hi: 74, size: 4 },
      lead: 'B4/4 D5/4 F#5/4. E5/8 | D5/2 B4/4 A4/4 | G4/4 B4/4 E5/4. D5/8 | B4/1 |',
      bass: { gen: 'bass', pattern: 'R-------R-------|R-------R-------|R-------R-------|R---------------', lo: 31, vol: 0.8 },
      drums: { hatDust: only(4, { 0: 'xxXxxxXxxxXxxxXx', 1: 'xxXxxxXxxxXxxxXx' }), kickDust: only(4, { 0: 'X.......X.x.....', 1: 'X.......X.x.....' }), snareDust: only(4, { 0: '....X.......X...', 1: '....X.......X...' }) },
    },
  },
};
