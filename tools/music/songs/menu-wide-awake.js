// "Wide Awake City" - a main-menu theme (round 1 draft). An original tune; what it takes from the owner's reference
// (Ping Island / Lightning Strike Rescue Op) is only the brief: a driving sixteenth-note synth bass and arpeggios,
// crisp machine drums with congas on top, acoustic guitar strummed underneath, bright major with borrowed minor
// chords, adventurous and a little whimsical. D major, 112 BPM, straight.

const bar = (s) => s.padEnd(16, '.');
const only = (bars, at) => Array.from({ length: bars }, (_, i) => (at[i] ? bar(at[i]) : '.'.repeat(16))).join('|');   // (a pattern for some bars of a section)

const THEME = 'r/8 A4/16 D5/16 F#5/8 A5/4. G5/8 F#5/8 | F5/8 E5/8 D5/8 C5/8+4 A4/4 | r/8 B4/16 D5/16 G5/8 B5/4. A5/8 G5/8 | F#5/4 E5/8 D5/8 E5/2 | '
  + 'D5/8 F5/8 Bb5/4 A5/8 G5/8 F5/4 | E5/8 G5/8 C6/4 Bb5/8 A5/8 G5/4 | F#5/8 G5/8 A5/8 B5/8+4 D6/4 | D6/8 C#6/8 B5/8 A5/8 G5/8 E5/8 C#5/4 |';
const A_CHORDS = 'Dmaj7 | F6 | Gadd9 | Dmaj7 | Bb | C | Em7 | A7sus4 A7';
const GROOVE = { kick: 'X.....x.X.....x.', snare: '....X.......X..o', hat: 'x.xxx.xxx.xxx.xx', congaH: '..x...x...x.x.x.', congaL: '.......o.......o' };
const GROOVE2 = { kick: 'X.....x.X.....x.', snare: '....X.......X..o', hat: 'x..ox..ox..ox..o', ohat: '..x...x...x...x.', congaH: '..x...x...x.x.x.', congaL: '.......o.......o' };

export default {
  id: 'menu-wide-awake',
  title: 'Wide Awake City',
  bpm: 112,
  form: ['intro', 'A', 'A2', 'B', 'bd', 'A3', 'outro'],
  loop: 1,
  echo: { beats: 0.75, fb: 0.32, mix: 0.26, lp: 3400, pingpong: 0.55 },
  tracks: {
    lead: { inst: 'chipLead', vol: 0.4, pan: 0.08, echo: 0.3 },
    brass: { inst: 'synthBrass', vol: 0.36, pan: -0.2, echo: 0.22 },
    counter: { inst: 'glock', vol: 0.3, pan: -0.45, echo: 0.4 },
    arp: { inst: 'chipLead', set: { env: [0.002, 0.11, 0.2, 0.05], cut: 2600, vib: null, glide: 0 }, vol: 0.22, pan: 0.5, echo: 0.5 },
    bass: { inst: 'rubberBass', vol: 0.44 },
    guitar: { inst: 'steelGuitar', vol: 0.34, pan: -0.55, hp: 120, echo: 0.1 },
    pad: { inst: 'analogPad', vol: 0.12, chorus: 0.6, echo: 0.2 },
    drums: { kit: true, vol: 1, echo: 0.06, width: 1.6, mix: { snare: 1.2, hat: 1.2 } },
  },
  sections: {
    intro: {
      bars: 4, chords: 'D5 | D5 | Bb | C',
      bass: { gen: 'bass', pattern: 'R.RR8.R.R.RR5.8.', lo: 36 },
      arp: { gen: 'arp', pattern: '0123432101234321', lo: 62, vol: 0.8 },
      guitar: { gen: 'strum', pattern: '........|........|D.DU.UDU|D.DU.UDU' },
      drums: {
        kick: 'X.......X.......|X.......X.......|X.....x.X.....x.|X.....x.X.x.X.x.',
        hat: 'o.o.o.o.o.o.o.o.|o.o.o.o.o.o.o.o.|x.xxx.xxx.xxx.xx|x.xxx.xxx.......',
        snare: '................|................|....X.......X...|....x...xxxxXXXX',
        congaH: '................|..x...x...x...x.|..x...x...x...x.|..x...x.........',
      },
    },
    A: {
      bars: 8, chords: A_CHORDS,
      lead: THEME,
      bass: { gen: 'bass', pattern: 'R.RR8.R.R.RR5.8.', lo: 36 },
      arp: { gen: 'arp', pattern: '0123432101234321', lo: 62 },
      guitar: { gen: 'strum', pattern: 'D.DU.UDU' },
      drums: { ...GROOVE, crash: only(8, { 0: 'X' }) },
    },
    A2: {
      bars: 8, chords: A_CHORDS,
      lead: THEME,
      counter: { harmOf: 'lead', min: 3, max: 5, vol: 0.7 },
      bass: { gen: 'bass', pattern: 'R.RR8.R.R.RR5.8.', lo: 36 },
      arp: { gen: 'arp', pattern: '0123432101234321', lo: 62 },
      guitar: { gen: 'strum', pattern: 'D.DU.UDU' },
      pad: { gen: 'pad', lo: 50, hi: 72, size: 4 },
      drums: { ...GROOVE2, crash: only(8, { 0: 'X' }) },
    },
    B: {
      bars: 8, chords: 'Bm7 | Gmaj7 | Em7 | F#7 | Bm7 | Gmaj7 | Bb | C',
      brass: 'F#5/4. E5/8 D5/4 B4/4 | D5/8 E5/8 F#5/8 G5/8+4 F#5/8 D5/8 | E5/4. D5/8 B4/4 G4/4 | A#4/8 C#5/8 E5/8 F#5/8+2 | '
        + 'F#5/4. E5/8 D5/4 F#5/4 | B5/4. A5/8 G5/4 F#5/4 | F5/8 G5/8 A5/8 Bb5/8+4 D6/4 | E6/8 D6/8 C6/8 Bb5/8 A5/8 G5/8 E5/4 |',
      bass: { gen: 'bass', pattern: 'R8R8R8R8', lo: 36 },
      arp: { gen: 'arp', pattern: '0123432101234321', lo: 62, vol: 0.85 },
      guitar: { gen: 'strum', pattern: 'D.DU.UDU' },
      pad: { gen: 'pad', lo: 50, hi: 72, size: 4 },
      drums: {
        kick: 'X.....x.X.....x.', snare: only(8, { 0: '....X.......X...', 1: '....X.......X...', 2: '....X.......X...', 3: '....X.......X...', 4: '....X.......X...', 5: '....X.......X...', 6: '....X.......X...', 7: '....X...' }),
        ride: 'x.x.x.x.x.x.x.x.', congaH: '..x...x...x.x.x.', congaL: '.......o.......o',
        tomH: only(8, { 7: '........X.x.....' }), tomM: only(8, { 7: '............X.x.' }),
        crash: only(8, { 0: 'X' }),
      },
    },
    bd: {
      bars: 8, chords: 'Dmaj7 | Bm7 | Gmaj7 | A7sus4 | Dmaj7 | Bm7 | Gmaj7 | A7sus4 A7',
      counter: 'A5/4 D6/4 F#6/2 | F#6/4 E6/4 D6/2 | B5/4 D6/4 G6/2 | E6/1 | A5/4 D6/4 F#6/2 | A6/4 G6/4 F#6/4 E6/4 | D6/4 E6/4 B5/2 | C#6/1 |',
      bass: { gen: 'bass', pattern: 'R-------|R-------|R-------|R-------|R...R...|R...R...|R...R...|R.R.R.R.', lo: 36, vol: 0.85 },
      arp: { gen: 'arp', pattern: '0123432101234321', lo: 62, vol: 0.6 },
      pad: { gen: 'pad', lo: 50, hi: 72, size: 4, vol: 1.2 },
      drums: {
        kickSoft: only(8, { 0: 'X', 1: 'X', 2: 'X', 3: 'X', 4: 'X.......X.......', 5: 'X.......X.......', 6: 'X.......X.......', 7: 'X.......X.......' }),
        shaker: 'oxoxoxoxoxoxoxox',
        hat: only(8, { 4: 'x.x.x.x.x.x.x.x.', 5: 'x.x.x.x.x.x.x.x.', 6: 'x.x.x.x.x.x.x.x.' }),
        snare: only(8, { 7: 'oooooooxxxxxXXXX' }),
        swell: only(8, { 7: 'X' }),
      },
    },
    A3: {
      bars: 8, chords: A_CHORDS,
      lead: THEME,
      brass: { line: THEME, oct: -1, vol: 0.55 },
      counter: { harmOf: 'lead', min: 3, max: 5, vol: 0.7 },
      bass: { gen: 'bass', pattern: 'R.RR8.R.R.RR5.8.', lo: 36 },
      arp: { gen: 'arp', pattern: '0123432101234321', lo: 62 },
      guitar: { gen: 'strum', pattern: 'D.DU.UDU' },
      pad: { gen: 'pad', lo: 50, hi: 72, size: 4 },
      drums: { ...GROOVE2, crash: only(8, { 0: 'X', 4: 'X' }) },
    },
    outro: {
      bars: 4, chords: 'Dmaj7 | F6 | Gadd9 | D',
      lead: 'r/8 A4/16 D5/16 F#5/8 A5/4. G5/8 F#5/8 | F5/8 E5/8 D5/8 C5/8+4 A4/4 | r/8 B4/16 D5/16 G5/8 B5/4. A5/8 G5/8 | !D6/1 |',
      counter: 'r/1 | r/1 | r/1 | D6/1 |',
      bass: { gen: 'bass', pattern: 'R.RR8.R.R.RR5.8.|R.RR8.R.R.RR5.8.|R.RR8.R.R.RR5.8.|R---------------', lo: 36 },
      arp: { gen: 'arp', pattern: '0123432101234321|0123432101234321|0123432101234321|0...............', lo: 62 },
      guitar: { gen: 'strum', pattern: 'D.DU.UDU|D.DU.UDU|D.DU.UDU|D.......' },
      pad: { gen: 'pad', lo: 50, hi: 72, size: 4 },
      drums: {
        kick: 'X.....x.X.....x.|X.....x.X.....x.|X.....x.X.....x.|X...............',
        snare: '....X.......X..o|....X.......X..o|....X...X.X.XXXX|................',
        hat: 'x.xxx.xxx.xxx.xx|x.xxx.xxx.xxx.xx|x.xxx.xxx.......|................',
        crash: only(4, { 3: 'X' }),
      },
    },
  },
};
