// "Grease Fire" - round 2, for the Grease station, gang hideouts and the menus. Original; it is written to sit as
// close as it can to the owner's reference (TV All Greasy) in everything but the tune: 88 BPM, F minor, a huge
// buzzing bass riff (most of the weight under 250 Hz), a slow, heavy, crunchy beat with a lilt, fuzzy melting synths,
// a sweet little hook over a sinister bottom, and the whole thing through warped tape.

const only = (bars, at) => Array.from({ length: bars }, (_, i) => (at[i] ? at[i].padEnd(16, '.') : '.'.repeat(16))).join('|');

const RIFF = 'F2/8 F2/16 F2/16 r/8 Ab2/8 Bb2/8 B2/8 C3/8 Eb3/8 | C3/4 Bb2/8 Ab2/8+4 F2/8 Eb2/8 |';
const HOOK = 'C5/4. Ab4/8 C5/4 Eb5/4 | Db5/4. C5/8 Bb4/2 | C5/4. Ab4/8 C5/4 F5/4 | Eb5/4 Db5/8 C5/8 Ab4/2 | '
  + 'C5/4. Ab4/8 C5/4 Eb5/4 | Db5/4. C5/8 Bb4/4 Ab4/4 | G4/4 Ab4/4 Bb4/4 C5/4 | F4/1 |';
const A_CH = 'Fm9 | Fm9 | Fm9 | Fm9 | Dbmaj7/F | Dbmaj7/F | Eb6/F | Eb6/F';
const B_CH = 'Fm9 | Dbmaj7 | Fm9 | Dbmaj7 | Fm9 | Dbmaj7 | Eb6 | Fm9';
const BEAT = { kickDust: 'X.x.......x.....', snareDust: '....X.......X...', hatDust: 'x.o.x.o.x.o.x.o.' };
const BEAT2 = { kickDust: 'X.x.......x...x.', snareDust: '....X.......X...', hatDust: 'x.o.x.o.x.o.x...', ohatDust: '..............x.' };

export default {
  id: 'grease-fire',
  title: 'Grease Fire',
  bpm: 88,
  swing: 0.55,
  form: ['intro', 'A', 'B', 'A2', 'drop', 'B2', 'outro'],
  loop: 1,
  echo: { beats: 0.75, fb: 0.35, mix: 0.18, lp: 2200, pingpong: 0.3 },
  lofi: { wow: 0.0022, flutter: 0.0003, drive: 0.5, hiss: 0.0035, lp: 7800 },
  master: { low: 3, tape: 0.6, loudness: -12, ratio: 3, thrRel: 3, top: 10000 },
  tracks: {
    bass: { inst: 'buzzBass', set: { cut: 800, lp2: 1900, drive: 2.1, waves: [{ w: 'saw' }, { w: 'pulse', duty: 0.32, det: 11 }, { w: 'saw', det: -8 }, { w: 'sine', lvl: 1.2 }, { w: 'sine', oct: -1, lvl: 1.5 }] }, vol: 0.8, comp: { thr: -10, ratio: 3 } },
    hook: { inst: 'hazeLead', vol: 0.3, pan: 0.12, echo: 0.3, chorus: 0.25 },
    voco: { inst: 'vocoLead', vol: 0.26, pan: -0.15, echo: 0.35, chorus: 0.4 },
    melt: { inst: 'analogPad', set: { vib: [0.35, 0.25, 0], cut: 1100 }, vol: 0.11, chorus: 0.7, echo: 0.2, duck: 0.35 },
    keys: { inst: 'dustyKeys', vol: 0.14, pan: 0.35, echo: 0.25, duck: 0.25 },
    drums: { kit: true, vol: 1, comp: { thr: -14, ratio: 4, att: 0.004, rel: 0.1, makeup: 2 }, room: 0.25, drive: 0.4 },
  },
  sections: {
    intro: {
      bars: 4, chords: 'Fm9',
      bass: RIFF,
      melt: { gen: 'pad', lo: 53, hi: 72, size: 4, vol: 0.8 },
      drums: { hatDust: only(4, { 2: 'o...o...o...o...', 3: 'o...o...o...o.oo' }), snareDust: only(4, { 3: '............X.XX' }) },
    },
    A: {
      bars: 8, chords: A_CH,
      bass: RIFF,
      melt: { gen: 'pad', lo: 53, hi: 72, size: 4 },
      drums: BEAT,
    },
    B: {
      bars: 8, chords: B_CH,
      bass: RIFF,
      hook: HOOK,
      keys: { gen: 'comp', pattern: '..x...x...x...x.', lo: 55, hi: 74, size: 4, gate: 0.5 },
      melt: { gen: 'pad', lo: 53, hi: 72, size: 4, vol: 0.8 },
      drums: BEAT2,
    },
    A2: {
      bars: 8, chords: A_CH,
      bass: RIFF,
      voco: 'Ab4/1:a | G4/1:o | Ab4/1:a | Bb4/1:o | Ab4/1:a | G4/1:o | G4/1:a | Ab4/1:o |',
      keys: { gen: 'comp', pattern: '..x...x...x...x.', lo: 55, hi: 74, size: 4, gate: 0.5, vol: 0.8 },
      melt: { gen: 'pad', lo: 53, hi: 72, size: 4 },
      drums: BEAT2,
    },
    drop: {
      bars: 4, chords: 'Dbmaj7 | Dbmaj7 | Eb6 | Eb6',
      bass: { line: 'Db2/1 | Db2/1 | Eb2/1 | Eb2/2 F2/8 F2/16 F2/16 Ab2/8 B2/8 |', vol: 0.9 },
      voco: 'F4/1:o | Ab4/1:a | G4/1:o | Bb4/2:a C5/2:o |',
      melt: { gen: 'pad', lo: 53, hi: 72, size: 4, vol: 1.2 },
      drums: { kickDust: only(4, { 0: 'X', 1: 'X', 2: 'X', 3: 'X.......X.X.X.XX' }), snareDust: only(4, { 3: '........o.o.xxXX' }) },
    },
    B2: {
      bars: 8, chords: B_CH,
      bass: RIFF,
      hook: HOOK,
      voco: { harmOf: 'hook', min: 3, max: 5, vol: 0.85 },
      keys: { gen: 'comp', pattern: '..x...x...x...x.', lo: 55, hi: 74, size: 4, gate: 0.5 },
      melt: { gen: 'pad', lo: 53, hi: 72, size: 4, vol: 0.8 },
      drums: BEAT2,
    },
    outro: {
      bars: 4, chords: 'Fm9',
      bass: 'F2/8 F2/16 F2/16 r/8 Ab2/8 Bb2/8 B2/8 C3/8 Eb3/8 | C3/4 Bb2/8 Ab2/8+4 F2/8 Eb2/8 | F2/8 F2/16 F2/16 r/8 Ab2/8 Bb2/8 B2/8 C3/8 Eb3/8 | F2/1 |',
      hook: 'r/1 | r/1 | C5/4. Ab4/8 C5/4 Eb5/4 | F4/1 |',
      melt: { gen: 'pad', lo: 53, hi: 72, size: 4, vol: 0.8 },
      drums: { ...BEAT, kickDust: only(4, { 0: 'X.x.......x.....', 1: 'X.x.......x.....', 2: 'X.x.......x.....', 3: 'X' }), snareDust: only(4, { 0: '....X.......X...', 1: '....X.......X...', 2: '....X.......X...' }), hatDust: only(4, { 0: 'x.o.x.o.x.o.x.o.', 1: 'x.o.x.o.x.o.x.o.', 2: 'x.o.x.o.x.o.x.o.' }) },
    },
  },
};
