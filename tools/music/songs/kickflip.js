// "Kickflip" - round 2, for the Skate station, the skate shops and skate contests. Original; written to sit as close
// as it can to the owner's reference (Superman, Goldfinger) in everything but the tune: fast ska-punk in D (a two at
// 196 BPM), clean off-beat guitar chops to start, then distorted power chords, a bass pumping on every beat, a brass
// section with the tune, fast punk drums, bright and flat out from start to end.

const only = (bars, at) => Array.from({ length: bars }, (_, i) => (at[i] ? at[i].padEnd(16, '.') : '.'.repeat(16))).join('|');

const VERSE = 'F#5/4 A5/4 D6/4 A5/4 | B5/2 A5/4 G5/4 | E5/4 F#5/4 A5/4 E5/4 | F#5/1 | D5/4 F#5/4 B5/4 A5/4 | G5/2 B5/4 D6/4 | C#6/4 B5/4 A5/4 E5/4 | A5/2. r/4 |';
const CHORUS = 'r/8 B5/8 B5/8 A5/8 B5/4 D6/4 | C#6/8 B5/8 A5/8 C#6/8+2 | r/8 F#5/8 F#5/8 E5/8 F#5/4 A5/4 | B5/8 A5/8 F#5/8 D5/8+2 | '
  + "r/8 B5/8 B5/8 A5/8 B5/4 D6/4 | E6/8 D6/8 C#6/8 E6/8+2 | F#6/4 E6/4 D6/4 B5/4 | !A5/4' r/4 !A5/4' r/4 |";
const V_CH = 'D | G | A | D | Bm | G | A | A';
const C_CH = 'G | A | D | Bm | G | A | Bm G | A';
const PUNK = { kickTight: 'X.......X.......', snareTight: '....X.......X...', hat: 'x.x.x.x.x.x.x.x.' };
const SKANK = { gen: 'comp', pattern: '..x...x...x...x.', lo: 59, hi: 74, size: 3, gate: 0.6 };
const POWER = () => ({ gen: 'comp', pattern: 'x.x.x.x.x.x.x.x.', lo: 38, power: true, gate: 0.8 });

export default {
  id: 'kickflip',
  title: 'Kickflip',
  bpm: 196,
  form: ['intro', 'V', 'C', 'V2', 'C2', 'bridge', 'C3', 'end'],
  loop: 1,
  echo: { beats: 0.5, fb: 0.15, mix: 0.08, lp: 3500 },
  master: { low: 1.5, tape: 0.4, ratio: 2.2, lufs: -13.5, hp: 40 },
  tracks: {
    horns: { inst: 'brassFat', set: { cut: 1400, lp2: 7000, velCut: 1.3 }, vol: 0.42, pan: 0.2, echo: 0.1 },
    saxes: { inst: 'tenorSax', vol: 0.32, pan: -0.25, echo: 0.1 },
    skank: { inst: 'skank', vol: 0.5, pan: 0.5 },
    power: { inst: 'crunchGuitar', vol: 0.28, pan: -0.55, hp: 110 },
    bass: { inst: 'pickBass', set: { drive: 0.45 }, vol: 0.6, hp: 42, comp: { thr: -8, ratio: 3 } },
    drums: { kit: true, vol: 0.75, comp: { thr: -10, ratio: 2.5, att: 0.006, rel: 0.07, makeup: 1 }, room: 0.3, width: 1.6 },
  },
  sections: {
    intro: {
      bars: 8, chords: V_CH,
      skank: SKANK,
      bass: { gen: 'bass', pattern: '................|................|................|................|R...R...R...R...|R...R...R...R...|R...R...R...R...|R...R...R.5.8.5.', lo: 33 },
      drums: { hat: only(8, { 4: 'x.x.x.x.x.x.x.x.', 5: 'x.x.x.x.x.x.x.x.', 6: 'x.x.x.x.x.x.x.x.', 7: 'x.x.x.x.x.x.x.x.' }), snareTight: only(8, { 7: '........X.X.XXXX' }) },
    },
    V: {
      bars: 8, chords: V_CH,
      horns: VERSE,
      skank: SKANK,
      power: POWER(),
      bass: { gen: 'bass', pattern: 'R...R...5...R...', lo: 33 },
      drums: { ...PUNK, crash: only(8, { 0: 'X' }) },
    },
    C: {
      bars: 8, chords: C_CH,
      horns: CHORUS,
      saxes: { harmOf: 'horns', min: 3, max: 5, vol: 0.95 },
      power: POWER(),
      skank: { ...SKANK, vol: 0.8 },
      bass: { gen: 'bass', pattern: 'R...R...R...R...', lo: 33 },
      drums: { ...PUNK, ride: 'x.x.x.x.x.x.x.x.', hat: '................', crash: only(8, { 0: 'X', 2: 'X', 4: 'X', 6: 'X' }), snareTight: only(8, { 7: '....X...X.X.XXXX' }) },
    },
    V2: {
      bars: 8, chords: V_CH,
      horns: VERSE,
      saxes: { line: VERSE, oct: -1, vol: 0.85 },
      skank: SKANK,
      power: POWER(),
      bass: { gen: 'bass', pattern: 'R...R...5...R...', lo: 33 },
      drums: { ...PUNK, crash: only(8, { 0: 'X' }) },
    },
    C2: {
      bars: 8, chords: C_CH,
      horns: CHORUS,
      saxes: { harmOf: 'horns', min: 3, max: 5, vol: 0.95 },
      power: POWER(),
      skank: { ...SKANK, vol: 0.8 },
      bass: { gen: 'bass', pattern: 'R...R...R...R...', lo: 33 },
      drums: { ...PUNK, ride: 'x.x.x.x.x.x.x.x.', hat: '................', crash: only(8, { 0: 'X', 2: 'X', 4: 'X', 6: 'X' }), snareTight: only(8, { 7: '....X...X.X.XXXX' }) },
    },
    bridge: {
      bars: 8, chords: 'Bm | Bm | G | G | Em | Em | A | A',
      saxes: 'F#5/1 | D5/1 | B4/1 | D5/1 | E5/1 | G5/1 | A5/1 | C#5/2 E5/2 |',
      skank: SKANK,
      bass: { gen: 'bass', pattern: 'R.......R.......', lo: 33 },
      drums: { kickTight: 'X...............', snareTight: '........X.......', hat: 'x...x...x...x...', tomL: only(8, { 7: '........XxXxXXXX' }), crash: only(8, { 0: 'X' }) },
    },
    C3: {
      bars: 8, chords: C_CH,
      horns: CHORUS,
      saxes: { harmOf: 'horns', min: 3, max: 5, vol: 0.95 },
      power: POWER(),
      skank: { ...SKANK, vol: 0.8 },
      bass: { gen: 'bass', pattern: 'R...R...R...R...', lo: 33 },
      drums: { ...PUNK, ride: 'x.x.x.x.x.x.x.x.', hat: '................', crash: only(8, { 0: 'X', 2: 'X', 4: 'X', 6: 'X' }), snareTight: only(8, { 7: '....X...X.X.XXXX' }) },
    },
    end: {
      bars: 2, chords: 'D | D',
      horns: "!D6/4' r/4 !D6/4' r/4 | !D6/4' r/4 r/2 |",
      saxes: "!A5/4' r/4 !A5/4' r/4 | !F#5/4' r/4 r/2 |",
      power: "D3+A3+D4/4' r/4 D3+A3+D4/4' r/4 | D3+A3+D4/4' r/4 r/2 |",
      bass: "D2/4' r/4 D2/4' r/4 | D2/4' r/4 r/2 |",
      drums: { kickTight: 'X.......X.......|X...............', snareTight: 'X.......X.......|................', crash: 'X.......X.......|X...............' },
    },
  },
};
