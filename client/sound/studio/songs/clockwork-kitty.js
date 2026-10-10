// "Clockwork Kitty" - round 2, for the quirkier shops and lobbies. Original; written to sit as close as it can to the
// owner's reference (Cats on Mars, The Seatbelts) in everything but the tune: 136 BPM in G, straight eighths, a light
// mechanical electronic beat with clockwork ticks (mostly percussion), a rubbery synth bass, bouncy toy-like synth
// tunes, surreal and carefree, the same level throughout so it loops.

const only = (bars, at) => Array.from({ length: bars }, (_, i) => (at[i] ? at[i].padEnd(16, '.') : '.'.repeat(16))).join('|');

const A_TUNE = "G5/8 B5/8 D6/8 B5/8 G5/8 B5/8 D6/4 | E6/8 D6/8 B5/8 G5/8 E5/4 r/4 | C6/8 E6/8 G6/8 E6/8 C6/8 E6/8 G6/4 | F#6/8 E6/8 D6/8 C6/8 A5/4 r/4 | "
  + "G5/8 B5/8 D6/8 B5/8 G5/8 B5/8 D6/4 | E6/8 G6/8 F#6/8 E6/8 B5/4 r/4 | C6/8 B5/8 A5/8 G5/8 F#5/8 G5/8 A5/8 F#5/8 | G5/4 r/4 G4/4 r/4 |";
const B_TUNE = 'E5/4 G5/8 B5/8+4 C6/4 | D6/4 B5/8 F#5/8+4 A5/4 | C6/4 A5/8 E5/8+4 G5/4 | F#5/4 E5/4 D5/4 C5/4 | E5/4 G5/8 B5/8+4 C6/4 | D6/4 B5/8 F#5/8+4 A5/4 | C6/4 E6/8 D6/8+4 B5/4 | A5/2 D5/2 |';
const A_CH = 'G | Em | C | D | G | Em | Am7 D7 | G';
const B_CH = 'Cmaj7 | Bm7 | Am7 | D7 | Cmaj7 | Bm7 | Am7 | D7';
const TICK = { kickTight: 'X.......X.......', rim: '....x.......x...', hat: 'xxx.xxx.xxx.xxx.', block: '..x...x...x...x.', clave: 'x..x..x...x..x..', shaker: 'oxoxoxoxoxoxoxox' };

export default {
  id: 'clockwork-kitty',
  title: 'Clockwork Kitty',
  bpm: 136,
  form: ['A', 'B', 'A2', 'tick', 'A3', 'end'],
  loop: 0,
  echo: { beats: 0.5, fb: 0.3, mix: 0.16, lp: 3200, pingpong: 0.7 },
  master: { low: 1.5, tape: 0.3, ratio: 2.2, lufs: -14.5 },
  tracks: {
    toy: { inst: 'toyPiano', vol: 0.34, pan: 0.2, echo: 0.3 },
    bop: { inst: 'squareLead', set: { cut: 2200, vib: [5.5, 0.08, 0.2] }, vol: 0.24, pan: -0.2, echo: 0.25 },
    marimba: { inst: 'marimba', vol: 0.34, pan: -0.35, echo: 0.2 },
    bass: { inst: 'rubberBass', vol: 0.42, comp: { thr: -8, ratio: 3 } },
    drums: { kit: true, vol: 1.5, comp: { thr: -10, ratio: 2.5, att: 0.005, rel: 0.07, makeup: 1 }, room: 0.2, width: 2, mix: { hat: 1.6, block: 1.4, clave: 1.4, rim: 1.3, kickTight: 0.6 } },
  },
  sections: {
    A: {
      bars: 8, chords: A_CH,
      toy: A_TUNE,
      bass: { gen: 'bass', pattern: 'R.8.R.8.5.8.R.8.', lo: 31 },
      drums: TICK,
    },
    B: {
      bars: 8, chords: B_CH,
      marimba: B_TUNE,
      bop: { gen: 'comp', pattern: '..x...x...x...x.', lo: 60, hi: 76, size: 3, gate: 0.4 },
      bass: { gen: 'bass', pattern: 'R.8.R.8.5.8.R.8.', lo: 31 },
      drums: { ...TICK, clave: '................' },
    },
    A2: {
      bars: 8, chords: A_CH,
      toy: A_TUNE,
      bop: { line: A_TUNE, oct: -1, vol: 0.7 },
      bass: { gen: 'bass', pattern: 'R.8.R.8.5.8.R.8.', lo: 31 },
      drums: TICK,
    },
    tick: {
      bars: 8, chords: B_CH,
      marimba: { gen: 'arp', pattern: '0.2.1.3.2.4.3.1.', lo: 60 },
      bass: { gen: 'bass', pattern: 'R.......5.......', lo: 31, vol: 0.85 },
      drums: { block: '..x...x...x...x.', clave: 'x..x..x...x..x..', rim: only(8, { 4: '....x.......x...', 5: '....x.......x...', 6: '....x.......x...', 7: '....x...x.x.xxxx' }), hat: only(8, { 6: 'x.x.x.x.x.x.x.x.', 7: 'x.x.x.x.x.x.x.x.' }) },
    },
    A3: {
      bars: 8, chords: A_CH,
      toy: A_TUNE,
      marimba: { harmOf: 'toy', min: 3, max: 5, vol: 0.8 },
      bop: { gen: 'comp', pattern: '..x...x...x...x.', lo: 60, hi: 76, size: 3, gate: 0.4 },
      bass: { gen: 'bass', pattern: 'R.8.R.8.5.8.R.8.', lo: 31 },
      drums: TICK,
    },
    end: {
      bars: 2, chords: 'G | G',
      toy: "G5/8 B5/8 D6/8 G6/8 D6/8 B5/8 G5/4 | !G6/4' r/4 r/2 |",
      bass: "G1/8 G2/8 G1/8 G2/8 D2/8 G2/8 D2/8 B1/8 | G1/4' r/4 r/2 |",
      drums: { kickTight: 'X.......X.......|X...............', block: '..x...x...x...x.|................', rim: '....x.......x...|................' },
    },
  },
};
