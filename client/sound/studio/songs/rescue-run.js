// "Rescue Run" - round 2, the main-menu theme. Original; written to sit as close as it can to the owner's reference
// (Ping Island / Lightning Strike Rescue Op) in everything but the tune: two parts like the reference - an adventurous
// first half at 96 BPM in A with borrowed chords, then an urgent action half at 123 BPM in A minor - driven by a big,
// pulsing synth bass (most of the weight in the low end), arpeggiated synth plucks, crisp drum-machine beats with
// congas, bongos and a tambourine on top, an acoustic guitar strummed underneath, and quiet breakdowns.

const only = (bars, at) => Array.from({ length: bars }, (_, i) => (at[i] ? at[i].padEnd(16, '.') : '.'.repeat(16))).join('|');

const P1_CH = 'A | A | F | G | A | A | C | G E7';
const P1_LEAD = 'E5/8 A5/8 C#6/8 B5/8 A5/4 E5/4 | F#5/8 E5/8 C#5/8 E5/8 A4/2 | A5/8 C6/8 F5/8 A5/8 C6/4 E6/4 | D6/8 B5/8 G5/8 D6/8+2 | '
  + 'E5/8 A5/8 C#6/8 B5/8 A5/4 E5/4 | F#5/8 E5/8 C#5/8 E5/8 A5/4 C#6/4 | E6/8 D6/8 C6/8 G5/8 E5/4 G5/4 | F#5/8 G5/8 A5/8 B5/8 G#5/4 E5/4 |';
const P2_CH = 'Am | F | C | G | Am | F | G | E7';
const P2_LEAD = 'A5/8 r/8 A5/8 C6/8 E6/4 D6/8 C6/8 | A5/4 F5/4 r/2 | G5/8 r/8 G5/8 C6/8 E6/4 D6/8 C6/8 | B5/4 G5/4 r/2 | '
  + 'A5/8 C6/8 E6/8 A6/8 G6/8 E6/8 C6/8 A5/8 | F6/8 E6/8 C6/8 A5/8 F5/4 r/4 | G5/8 A5/8 B5/8 D6/8 G6/4 F6/4 | E6/8 D6/8 B5/8 G#5/8 E5/2 |';
const MACHINE = { kickTight: 'X.......X.x.....', clapFat: '....X.......X...', hat: 'xxXxxxXxxxXxxxXx' };
const LATIN = { congaH: '..x...x...x.x...', congaL: '.......x.......x', bongoH: 'x...x...x...x...', tamb: '....x.......x...' };
const DRIVE = { kickTight: 'X.....x.X.x...x.', snareTight: '....X.......X...', clapFat: '....X.......X...', hat: 'xxXxxxXxxxXxxxXx', ohat: '..x.......x.....' };

export default {
  id: 'rescue-run',
  title: 'Rescue Run',
  bpm: 96,
  form: ['intro', 'A', 'A2', 'B', 'calm', 'B2', 'end'],
  loop: 1,
  echo: { beats: 0.75, fb: 0.32, mix: 0.24, lp: 3000, pingpong: 0.8, spread: 1.5 },
  master: { low: 2.5, tape: 0.4, ratio: 2.6, loudness: -12.5 },
  tracks: {
    bass: { inst: 'fatBass', vol: 0.8, comp: { thr: -10, ratio: 3 } },
    arp: { inst: 'pluckSynth', vol: 0.3, echo: 0.45, chorus: 0.8 },
    lead: { inst: 'warmLead', vol: 0.36, pan: -0.05, echo: 0.28 },
    brass: { inst: 'brassFat', vol: 0.34, pan: -0.45, echo: 0.15 },
    guitar: { inst: 'steelGuitar', vol: 0.3, pan: 0.65, hp: 140, echo: 0.1 },
    pad: { inst: 'analogPad', vol: 0.11, chorus: 0.7, echo: 0.2, duck: 0.3 },
    drums: { kit: true, vol: 0.85, comp: { thr: -14, ratio: 4, att: 0.003, rel: 0.08, makeup: 2 }, room: 0.25, width: 2 },
    perc: { kit: true, vol: 1.3, width: 2.6, echo: 0.08 },
  },
  sections: {
    intro: {
      bars: 4, chords: 'A | A | F | G',
      bass: { gen: 'bass', pattern: 'R.R.R.8.R.R.5.8.', lo: 33 },
      arp: { gen: 'arp', pattern: '0123210301232103', lo: 57, vol: 0.8 },
      perc: { ...LATIN, bongoH: only(4, { 2: 'x...x...x...x...', 3: 'x...x...x.x.xxxx' }) },
      drums: { hat: only(4, { 2: 'x.x.x.x.x.x.x.x.', 3: 'xxXxxxXxxxXxxxXx' }), clapFat: only(4, { 3: '............X.XX' }) },
    },
    A: {
      bars: 8, chords: P1_CH,
      bass: { gen: 'bass', pattern: 'R.R.R.8.R.R.5.8.', lo: 33 },
      arp: { gen: 'arp', pattern: '0123210301232103', lo: 57 },
      lead: P1_LEAD,
      guitar: { gen: 'strum', pattern: 'D.......D..U.U..', lo: 40 },
      drums: { ...MACHINE, crash: only(8, { 0: 'X' }) },
      perc: LATIN,
    },
    A2: {
      bars: 8, chords: P1_CH,
      bass: { gen: 'bass', pattern: 'R.R.R.8.R.R.5.8.', lo: 33 },
      arp: { gen: 'arp', pattern: '0123210301232103', lo: 57 },
      lead: P1_LEAD,
      brass: { harmOf: 'lead', min: 3, max: 5, vol: 0.55 },
      guitar: { gen: 'strum', pattern: 'D.......D..U.U..', lo: 40 },
      pad: { gen: 'pad', lo: 50, hi: 72, size: 4 },
      drums: { ...MACHINE, crash: only(8, { 0: 'X' }), snareTight: only(8, { 7: '....x...x.x.XXXX' }) },
      perc: LATIN,
    },
    B: {
      bars: 8, bpm: 123, chords: P2_CH,
      bass: { gen: 'bass', pattern: 'R.RR8.R.R.RR5.8.', lo: 33 },
      arp: { gen: 'arp', pattern: '0123210301232103', lo: 57, vol: 0.85 },
      lead: P2_LEAD,
      brass: { gen: 'comp', pattern: 'X..x..x...x.x...', lo: 55, hi: 76, size: 4, gate: 0.5 },
      pad: { gen: 'pad', lo: 50, hi: 72, size: 4, vol: 0.8 },
      drums: { ...DRIVE, crash: only(8, { 0: 'X', 4: 'X' }) },
      perc: { ...LATIN, bongoH: 'x.x.x.x.x.x.x.x.' },
    },
    calm: {
      bars: 8, bpm: 123, chords: 'Am | F | C | G | Am | F | G | E7',
      bass: { gen: 'bass', pattern: 'R.......R.......', lo: 33, vol: 0.8 },
      arp: { gen: 'arp', pattern: '0123210301232103', lo: 57, vol: 0.7 },
      pad: { gen: 'pad', lo: 50, hi: 72, size: 4, vol: 1.3 },
      guitar: { gen: 'strum', pattern: 'D...............', lo: 40, vol: 0.8 },
      perc: { congaH: only(8, { 4: '..x...x...x.x...', 5: '..x...x...x.x...', 6: '..x...x...x.x...', 7: '..x...x...x.x.xx' }), tamb: only(8, { 6: '....x.......x...', 7: '....x...x.x.x.x.' }) },
      drums: { kickTight: only(8, { 4: 'X.......X.......', 5: 'X.......X.......', 6: 'X.......X.x.....', 7: 'X.......X.x.X.x.' }), snareTight: only(8, { 7: '........x.x.XXXX' }), swell: only(8, { 7: 'X' }) },
    },
    B2: {
      bars: 8, bpm: 123, chords: P2_CH,
      bass: { gen: 'bass', pattern: 'R.RR8.R.R.RR5.8.', lo: 33 },
      arp: { gen: 'arp', pattern: '0123210301232103', lo: 57 },
      lead: P2_LEAD,
      brass: { gen: 'comp', pattern: 'X..x..x...x.x...', lo: 55, hi: 76, size: 4, gate: 0.5 },
      guitar: { gen: 'strum', pattern: 'D.......D..U.U..', lo: 40 },
      pad: { gen: 'pad', lo: 50, hi: 72, size: 4, vol: 0.8 },
      drums: { ...DRIVE, crash: only(8, { 0: 'X', 4: 'X' }) },
      perc: { ...LATIN, bongoH: 'x.x.x.x.x.x.x.x.' },
    },
    end: {
      bars: 2, bpm: 123, chords: 'Am | Am',
      lead: "A5/8 C6/8 E6/8 A6/8 G6/8 E6/8 C6/8 E6/8 | !A6/4' r/4 r/2 |",
      brass: { gen: 'comp', pattern: '................|X...............', lo: 55, hi: 76, size: 4, gate: 0.6 },
      bass: "A1/8 A1/8 A2/8 A1/8 C2/8 D2/8 E2/8 G2/8 | !A1/4' r/4 r/2 |",
      drums: { kickTight: 'X.....x.X.x.X.x.|X...............', snareTight: '....X...X.X.XXXX|................', crash: only(2, { 1: 'X' }) },
      perc: { bongoH: 'x.x.x.x.xxxxxxxx|X...............' },
    },
  },
};
