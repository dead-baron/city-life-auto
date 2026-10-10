// "Sugar Haze" - round 2, for the Haze station. Original; written to sit as close as it can to the owner's reference
// (Drippy Eye, Black Moth Super Rainbow) in everything but the tune: 87 BPM in A-flat with a slight shuffle, lush
// dripping analog synth lines over a steady mid-tempo beat, a sung vocoder-like lead, warm, slightly untuned and fuzzy,
// bass-heavy, sweet and childlike on top with something eerie underneath, and a lift a minute in.

const only = (bars, at) => Array.from({ length: bars }, (_, i) => (at[i] ? at[i].padEnd(16, '.') : '.'.repeat(16))).join('|');

const A_TUNE = 'C5/4. Eb5/8 Ab5/4 G5/4 | F5/4. Eb5/8 C5/2 | Db5/8 F5/8 Ab5/8 C6/8 Bb5/4 Ab5/4 | G5/2 Eb5/2 | C5/4. Eb5/8 Ab5/4 C6/4 | Bb5/4. Ab5/8 F5/2 | Db6/8 C6/8 Bb5/8 Ab5/8 F5/4 Db5/4 | Eb5/2. r/4 |';
const B_TUNE = 'F5/8 Ab5/8 C6/4 Db6/4 C6/4 | Bb5/4. G5/8 Eb5/2 | Eb5/8 G5/8 C6/4 Bb5/4 G5/4 | Ab5/2. r/4 | F5/8 Ab5/8 C6/4 Eb6/4 Db6/4 | C6/4. Bb5/8 G5/2 | F5/4 Ab5/4 Db6/4 C6/4 | Bb5/2 Eb5/2 |';
const A_CH = 'Abmaj7 | Fm7 | Dbmaj7 | Eb6 | Abmaj7 | Fm7 | Dbmaj7 | Eb6';
const B_CH = 'Dbmaj7 | Eb | Cm7 | Fm7 | Dbmaj7 | Eb | Bbm7 | Eb7sus4 Eb7';
const DRIP = { gen: 'arp', pattern: '0.2.4.2.1.3.5.3.', lo: 63, vol: 0.9 };
const BEAT = { kickFat: 'X.x.....X.x.x...', snareFat: '....X.......X...', hatDust: '..x...x...x...x.' };

export default {
  id: 'sugar-haze',
  title: 'Sugar Haze',
  bpm: 87,
  swing: 0.18,
  form: ['intro', 'A', 'A2', 'B', 'A3', 'outro'],
  loop: 1,
  echo: { beats: 0.75, fb: 0.38, mix: 0.2, lp: 2400, pingpong: 0.5 },
  lofi: { wow: 0.0028, flutter: 0.0004, drive: 0.4, hiss: 0.0018, lp: 5600 },
  master: { low: 2.5, tape: 0.45, ratio: 2.2, thrRel: 5, lufs: -14, hp: 45 },
  tracks: {
    voco: { inst: 'vocoLead', vol: 0.24, echo: 0.3, chorus: 0.5 },
    lead: { inst: 'hazeLead', vol: 0.28, pan: 0.2, echo: 0.3 },
    drip: { inst: 'warbleKeys', vol: 0.22, pan: -0.35, echo: 0.4 },
    bass: { inst: 'fatBass', set: { cut: 750, glide: 0.08 }, vol: 0.66, hp: 40, comp: { thr: -8, ratio: 3 } },
    pad: { inst: 'analogPad', set: { vib: [0.4, 0.18, 0] }, vol: 0.13, chorus: 0.7, duck: 0.3 },
    drums: { kit: true, vol: 0.9, hp: 38, comp: { thr: -10, ratio: 2.5, att: 0.008, rel: 0.1, makeup: 1 }, room: 0.2, drive: 0.3 },
  },
  sections: {
    intro: {
      bars: 4, chords: 'Abmaj7 | Fm7 | Dbmaj7 | Eb6',
      pad: { gen: 'pad', lo: 51, hi: 72, size: 4 },
      drip: DRIP,
      bass: { gen: 'bass', pattern: 'R-------R-------', lo: 36, vol: 0.8 },
      drums: { kickFat: only(4, { 3: 'X.......X.x.X.X.' }) },
    },
    A: {
      bars: 8, chords: A_CH,
      lead: A_TUNE,
      drip: DRIP,
      pad: { gen: 'pad', lo: 51, hi: 72, size: 4, vol: 0.8 },
      bass: { gen: 'bass', pattern: 'R..R..5.R..8..5.', lo: 36 },
      drums: BEAT,
    },
    A2: {
      bars: 8, chords: A_CH,
      voco: { line: A_TUNE.replace(/(\/[0-9.+]+)/g, '$1:a'), oct: -1 },
      lead: { line: A_TUNE, vol: 0.6 },
      drip: DRIP,
      pad: { gen: 'pad', lo: 51, hi: 72, size: 4, vol: 0.8 },
      bass: { gen: 'bass', pattern: 'R..R..5.R..8..5.', lo: 36 },
      drums: { ...BEAT, hatDust: 'x.x.x.x.x.x.x.x.' },
    },
    B: {
      bars: 8, chords: B_CH,
      voco: { line: B_TUNE.replace(/(\/[0-9.+]+)/g, '$1:o'), oct: -1 },
      lead: B_TUNE,
      drip: { ...DRIP, pattern: '0.2.4.6.5.4.2.1.' },
      pad: { gen: 'pad', lo: 51, hi: 72, size: 4 },
      bass: { gen: 'bass', pattern: 'R..R..5.R..8..5.', lo: 36 },
      drums: { ...BEAT, hatDust: 'x.x.x.x.x.x.x.x.', ohatDust: '......x.......x.', crash: only(8, { 0: 'X' }) },
    },
    A3: {
      bars: 8, chords: A_CH,
      voco: { line: A_TUNE.replace(/(\/[0-9.+]+)/g, '$1:a'), oct: -1 },
      lead: A_TUNE,
      drip: DRIP,
      pad: { gen: 'pad', lo: 51, hi: 72, size: 4, vol: 0.8 },
      bass: { gen: 'bass', pattern: 'R..R..5.R..8..5.', lo: 36 },
      drums: { ...BEAT, hatDust: 'x.x.x.x.x.x.x.x.' },
    },
    outro: {
      bars: 4, chords: 'Abmaj7 | Fm7 | Dbmaj7 | Abmaj7',
      voco: 'C4/1:a | Eb4/1:o | F4/1:a | Eb4/1:oo |',
      drip: { ...DRIP, vol: 0.7 },
      pad: { gen: 'pad', lo: 51, hi: 72, size: 4 },
      bass: { gen: 'bass', pattern: 'R-------R-------|R-------R-------|R-------R-------|R---------------', lo: 36, vol: 0.8 },
      drums: { kickFat: only(4, { 0: 'X.x.....X.x.x...', 1: 'X.x.....X.x.x...' }), snareFat: only(4, { 0: '....X.......X...', 1: '....X.......X...' }) },
    },
  },
};
