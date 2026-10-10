// "Double Scoop" - round 2, for the menus and the Grease station. Original; written to sit as close as it can to the
// owner's reference (2 Thick Scoops) in everything but the tune: a slow, heavy half-time beat (63 BPM, felt at 126)
// with a strong shuffle, B minor smeared by distortion, a fat distorted bass, melted synth and vocoder-like voices,
// squashed hard, very wide, and soaked in tape hiss and wobble. One groove from start to end.

const only = (bars, at) => Array.from({ length: bars }, (_, i) => (at[i] ? at[i].padEnd(16, '.') : '.'.repeat(16))).join('|');

const BR1 = 'B1/8. B1/16 r/8 D2/8~ E2/4 F#2/16 E2/16 D2/8 |';
const BR2 = 'B1/8. B1/16 r/8 D2/8~ E2/4 G2/8~ F#2/8 |';
const BASS = [BR1, BR2, BR1, BR2].join(' ');
const MELT = 'F#4/8~ A4/8 B4/4 r/8 D5/8~ C#5/8 B4/8 | A4/4. F#4/8 E4/4 r/4 | F#4/8~ A4/8 B4/4 r/8 E5/8~ D5/8 B4/8 | C#5/4. A4/8 F#4/2 |';
const CH = 'Bm7 | Bm7 | Gmaj7 | F#7';
const BEAT = { kickDust: 'X......x..x.....', snareDust: '....o...X.....o.', hatDust: 'x.xxx.xxx.xxx.xx' };
const BEAT2 = { kickDust: 'X......x..x...x.', snareDust: '....o...X.....o.', hatDust: 'x.xxx.xxx.xxx.x.', ohatDust: '..............x.' };

export default {
  id: 'double-scoop',
  title: 'Double Scoop',
  bpm: 63,
  swing: 0.45,
  swingUnit: 0.5,
  form: ['intro', 'A', 'B', 'drop', 'A2', 'outro'],
  loop: 1,
  echo: { beats: 0.375, fb: 0.4, mix: 0.2, lp: 2000, pingpong: 0.7 },
  lofi: { wow: 0.0035, flutter: 0.0006, drive: 1, hiss: 0.006, lp: 6800, bits: 11 },
  master: { low: 3, tape: 0.8, ratio: 4, thrRel: 2, loudness: -11.5, top: 9500 },
  tracks: {
    bass: { inst: 'fatBass', set: { drive: 1.8, cut: 900 }, oct: 1, vol: 0.8, comp: { thr: -9, ratio: 4 } },
    melt: { inst: 'hazeLead', set: { vib: [3.2, 0.3, 0.02], fall: [-2, 0.12], lp2: 3200 }, vol: 0.28, echo: 0.35, chorus: 0.9 },
    voco: { inst: 'vocoLead', vol: 0.24, echo: 0.3, chorus: 0.95, chorusRate: 0.3 },
    stab: { inst: 'stab', set: { drive: 1.2 }, vol: 0.2, pan: 0.65, echo: 0.25, duck: 0.3 },
    drums: { kit: true, vol: 1, comp: { thr: -16, ratio: 5, att: 0.003, rel: 0.09, makeup: 3 }, room: 0.4, drive: 0.6, width: 2.4 },
  },
  sections: {
    intro: {
      bars: 2, chords: 'Bm7',
      bass: [BR1, BR2].join(' '),
      voco: 'D4/1:a | C#4/1:o |',
    },
    A: {
      bars: 8, chords: CH,
      bass: BASS,
      melt: MELT,
      drums: BEAT,
    },
    B: {
      bars: 8, chords: CH,
      bass: BASS,
      melt: { line: MELT, vol: 0.85 },
      voco: 'D4/1:a | D4/1:o | B3/1:a | C#4/1:u |',
      stab: { gen: 'comp', pattern: '..x.....x.x.....', lo: 54, hi: 74, size: 3, gate: 0.4 },
      drums: BEAT2,
    },
    drop: {
      bars: 4, chords: 'Gmaj7 | Gmaj7 | F#7 | F#7',
      bass: { line: 'G1/1 | G1/1 | F#1/1 | F#1/2 B1/8. B1/16 r/8 D2/8 |', vol: 0.9 },
      voco: 'B3/1:o | D4/1:a | C#4/1:o | A#3/1:a |',
      melt: 'r/1 | F#4/8~ A4/8 B4/4 r/2 | r/1 | C#5/4. A4/8 F#4/2 |',
      drums: { kickDust: only(4, { 0: 'X', 1: 'X', 2: 'X', 3: 'X.......X..x.xxx' }), snareDust: only(4, { 3: '........x.x.XXXX' }) },
    },
    A2: {
      bars: 8, chords: CH,
      bass: BASS,
      melt: MELT,
      voco: { harmOf: 'melt', min: 3, max: 5, vol: 0.8 },
      stab: { gen: 'comp', pattern: '..x.....x.x.....', lo: 54, hi: 74, size: 3, gate: 0.4 },
      drums: BEAT2,
    },
    outro: {
      bars: 2, chords: 'Bm7',
      bass: 'B1/8. B1/16 r/8 D2/8~ E2/4 F#2/16 E2/16 D2/8 | B1/1 |',
      voco: 'D4/1:a | B3/1:o |',
      drums: { kickDust: only(2, { 0: 'X......x..x.....', 1: 'X' }), snareDust: only(2, { 0: '....o...X.......' }), hatDust: only(2, { 0: 'x.xxx.xxx.xxx.xx' }) },
    },
  },
};
