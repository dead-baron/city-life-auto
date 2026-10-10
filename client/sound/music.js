// Music (the owner's notes: "no soundtrack playing over the game. Music plays on the title screen. Otherwise music
// lives in the world: a nightclub's bass, muffled from outside and loud and clear inside; shops with their own
// fitting music (light, elevator-style), or none at all"). A small step sequencer with a look-ahead (notes are
// scheduled a fraction of a second ahead on the audio clock, so a slow frame never makes them stumble) and four
// songs, SNES-flavoured: the title (the owner's own track, below) and three originals - soft pulse leads, a triangle
// bass, FM electric piano and vibes, light drums, and an echo. Each song plays through its own chain (level,
// low-pass, pan) so the club can be muffled through its walls and placed where it is.

import { setp, krate } from './engine.js';

const R = Math.random;
// sample banks (banks/*.js): one-shots cut from the owner's own tracks, fetched the first time a song that plays them
// starts - never part of the page's code
const BANKS = { menu: () => import('./banks/menu.js') };
// a bank's one-shots as AudioBuffers: 16-bit PCM in base64, each at its own rate, brought back to the level the score's
// gains are on (norm)
export function decodeBank(ctx, bank) {
  const out = {};
  for (const k in bank) {
    const o = bank[k], bin = atob(o.pcm), n = bin.length >> 1, buf = ctx.createBuffer(1, n, o.rate), d = buf.getChannelData(0), g = (o.norm || 1) / 32767;
    for (let i = 0; i < n; i++) { const v = bin.charCodeAt(2 * i) | (bin.charCodeAt(2 * i + 1) << 8); d[i] = (v > 32767 ? v - 65536 : v) * g; }
    out[k] = buf;
  }
  return out;
}
// a step's length in s (a song with a tempo for each bar follows it)
export function stepLen(S, i) { return 60 / (S.tempo ? S.tempo[Math.floor(i / S.steps) % S.tempo.length] : S.bpm) / (S.steps / 4); }
const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
const _ = -1;   // (a held note)

// ---- the title: the owner's own track ("CLA Main Screen", 2026-10-10), transcribed into the engine ----
// F minor at 92 BPM, 20 bars that loop: four bars of the riff alone, then eight with the drums, played twice (as the
// owner cut it). The riff is one buzzy, vocoder-like synth - a sawtooth through three vowel formants that move with the
// notes, each note scooping up into its pitch: F, A♭ and G, the little turn the track hangs on (a rest, F, A♭, F, then
// G-A♭-F twice), over a sub bass on F. Every fourth bar turns D♭ to C. The drums are a dusty boom-bap kit (the kick on
// 1 and 3, the snare on 2 and 4, the hats on the off-beats, ghost notes dragging late), partly crunched; the fourth
// bars bring a fill, a break, or the drums dropping out at the loop's seam. Over it all: tape hiss, a slow wow in the
// pitch, the top rolled off. (Measured from the owner's MP3 - its tempo, beat, bass, chords and riff - by a script in
// a scratch folder; the MP3 isn't in the repository.)
//   I the riff alone, T its turn (the drums' pickup); G the groove; F a turn with a fill; B a turn with a break (and
//   the pickup); E the loop's last bar, the drums out
export const TITLE_FORM = 'IIITGGGFGGGBGGGFGGGE';
const F1 = 29, C1 = 24, Db1 = 25, F2 = 41, G2 = 43, Ab2 = 44, C3 = 48, Db3 = 49, G3 = 55, Ab3 = 56;
// the riff in each bar of the intro and the groove: [step, note, length in steps, accent]
export const TITLE_RIFF = [[2, F2, 2, 0.85], [4, Ab2, 2, 1], [6, F2, 2, 0.8], [8, G2, 1, 0.95], [9, Ab2, 1, 0.9], [10, F2, 2, 0.8], [12, G2, 1, 0.95], [13, Ab2, 1, 0.9], [14, F2, 2, 0.8]];
// The score: for each step (16 a bar), its events - { p: part, n: notes, len: steps, v: accent, late: steps behind
// the grid }. Parts: vox (the riff), sub (the bass), the drums (kick, snare, ghost, hat, tick, crash), and open (the
// riff's formants: 0 dark, as in the intro, 1 open and talking, once the drums are in).
export function titleScore(form = TITLE_FORM) {
  const S = 16, sc = Array.from({ length: form.length * S }, () => []);
  const at = (b, s, ev) => sc[b * S + s].push(ev);
  for (let b = 0; b < form.length; b++) {
    const k = form[b], turn = k !== 'I' && k !== 'G', after = b === 0 || !'IG'.includes(form[b - 1]);
    const open = k === 'I' || k === 'T' ? 0 : 1;
    at(b, 0, { p: 'open', o: open });
    if (!turn) {
      if (after) at(b, 0, { p: 'vox', n: [F2], len: 2, v: 1 });   // (F on the one, coming out of a turn)
      for (const [s, n, len, v] of TITLE_RIFF) at(b, s, { p: 'vox', n: open && n === F2 ? [F2, C3] : [n], len, v });
      if (k === 'I') at(b, 0, { p: 'sub', n: [F1], len: 12, v: 0.4 });
      else for (const s of [0, 2, 6, 10, 14]) at(b, s, { p: 'sub', n: [F1], len: 2, v: 1 });
    } else {
      at(b, 0, { p: 'vox', n: [Db3, Ab3], len: 8, v: 0.9 });
      at(b, 8, { p: 'vox', n: [C3, G3], len: 8, v: 0.9 });
      at(b, 0, { p: 'sub', n: [Db1], len: 8, v: 0.9 });
      at(b, 8, { p: 'sub', n: [C1], len: 8, v: 0.8 });
    }
    if (k === 'G') {
      for (const s of [0, 8]) at(b, s, { p: 'kick', v: 1 });
      for (const s of [4, 12]) at(b, s, { p: 'snare', v: 1 });
      for (const s of [2, 6, 10, 14]) at(b, s, { p: 'hat', v: 1 });
      for (const s of [3, 7, 11]) at(b, s, { p: 'ghost', v: s === 7 ? 1 : 0.7, late: 0.5 });   // (the 'a's, dragged late)
      for (const s of [1, 9]) at(b, s, { p: 'tick', v: 0.6 });
    } else if (k === 'F') {
      at(b, 0, { p: 'kick', v: 1 }); at(b, 8, { p: 'kick', v: 0.9 });
      [0.45, 0.6, 0.75, 0.9].forEach((v, s) => at(b, s, { p: 'snare', v }));   // (a roll into the second beat)
      at(b, 4, { p: 'snare', v: 1 }); at(b, 12, { p: 'snare', v: 1 });
      for (const s of [6, 7, 10, 13, 14, 15]) at(b, s, { p: 'hat', v: s % 2 ? 0.6 : 0.9, late: s % 2 ? 0.3 : 0 });
    }
    if (k === 'T' || k === 'B') { at(b, 12, { p: 'snare', v: 1.15 }); at(b, 12, { p: 'crash', v: 1 }); at(b, 14, { p: 'hat', v: 1 }); }
  }
  return sc;
}
// ---- the menu, take two: the owner's second main-screen track ("CLA Main Screen", 2026-10-10, made with their YuE2
// instrumental workflow), rebuilt in the engine a layer at a time (the owner: "build the beat first to match it, then
// layer on the other instruments") ----
// D minor, a two-bar loop - D minor (bar A), then A7 (bar B) - eight times round, 16 bars, the tempo creeping from 86.1
// to 87 BPM as the recording's does. The beat is the recording's own: its drum stem cut into four one-shots (the
// kick, the snare, a ghost note, the hat: banks/menu.js) and transcribed bar by bar (each one-shot's place and gain
// fitted to the stem's band picture), the typical A and B bars kept, then each hit's level checked against the stem
// in its own band and evened up: [step, one-shot, gain on the full-scale sound in the recording's units, how late in
// 16ths]. Kick on 1, the and of 3 and the and of 4 (and the and of 2 in B), snare
// on 2 and 4, hats on the eighths, ghost notes dragged a little late after 2 and 3, a pickup into the next bar.
export const MENU_BEAT = {
  A: [[0, 'kick', 1.05, 0], [0, 'hat', 0.02, 0], [2, 'hat', 0.08, 0], [4, 'snare', 0.76, -0.02], [6, 'hat', 0.08, 0], [7, 'ghost', 0.27, 0.12],
    [8, 'hat', 0.1, 0.03], [9, 'ghost', 0.25, 0.14], [10, 'kick', 1.02, 0.01], [10, 'hat', 0.04, 0], [12, 'snare', 0.68, -0.01], [14, 'kick', 0.93, 0.03],
    [14, 'hat', 0.06, 0.02]],
  B: [[0, 'kick', 1.23, 0], [0, 'hat', 0.03, -0.01], [2, 'hat', 0.1, 0], [4, 'snare', 0.9, -0.03], [6, 'kick', 0.66, -0.02], [6, 'hat', 0.08, -0.01],
    [7, 'ghost', 0.28, 0.09], [8, 'hat', 0.1, 0], [9, 'ghost', 0.25, 0.1], [10, 'kick', 0.92, 0], [10, 'hat', 0.045, 0], [12, 'snare', 0.75, -0.01],
    [13, 'ghost', 0.14, 0.14], [14, 'kick', 0.79, 0.03], [14, 'hat', 0.06, 0.02], [15, 'ghost', 0.08, 0.09], [15, 'ghost', 0.18, 0.57], [15, 'hat', 0.02, 0.58]],
};
export const MENU_TEMPO = [86.1, 86.16, 86.22, 86.28, 86.35, 86.41, 86.47, 86.53, 86.6, 86.66, 86.72, 86.78, 86.85, 86.91, 86.97, 87.04];
// The bass, measured the same way from the recording's low end (its pitch on the same grid, each note's level in a
// narrow band round its fundamental, how it falls and where it lets go), median over the eight repeats: [step, note,
// length in 16ths (to where it lets go), level - the fundamental's peak in the recording's units]. Bar A: a long low D
// for half the bar, then four quiet eighths an octave up, each let go a little early; bar B: a short A on the one, a
// rest, a long G (A7's seventh) to the end of the bar. It's almost all fundamental (G's octave sits 33 dB down), and
// the mix ducks it under each snare (6 dB, back within a tenth of a second) and, a little, each kick.
export const MENU_BASS = {
  A: [[0, 38, 8, 0.3], [8, 50, 1.25, 0.043], [10, 50, 1.25, 0.056], [12, 50, 1.25, 0.035], [14, 50, 1.25, 0.037]],
  B: [[0, 45, 1.1, 0.06], [6, 43, 7.75, 0.235]],
};
// a wave's peak against its fundamental (Web Audio normalises a periodic wave to its own peak)
function wavePeak(h) { let m = 0; for (let i = 0; i < 512; i++) { let y = 0; for (let k = 1; k < h.length; k++) y += h[k] * Math.sin(k * i * Math.PI / 256); m = Math.max(m, Math.abs(y)); } return m; }
const SUB = [0, 1, 0.06, 0.03];   // (the menu's bass: a sine with a breath of its octave and twelfth)
export function menuScore(bars = 16) {
  const S = 16, sc = Array.from({ length: bars * S }, () => []);
  for (let b = 0; b < bars; b++) {
    const k = b % 2 ? 'B' : 'A';
    for (const [s, h, v, late] of MENU_BEAT[k]) sc[b * S + s].push({ p: 'hit', s: h, v, late });
    for (const [s, n, len, v] of MENU_BASS[k]) sc[b * S + s].push({ p: 'mbass', n: [n], len, v });
  }
  return sc;
}
// the riff's three formants for each note (by pitch class): the synth "says" something a little different on each
const FORMANT = { 5: [700, 1060, 2450], 8: [900, 1380, 2750], 7: [810, 1230, 2600], 1: [860, 1300, 2700], 0: [770, 1170, 2550] };
// the riff's fuzz (a soft saturation) and the drums' crunch (six bits, softly clipped), as wave-shaper curves
function curve(fn, n = 1025) { const c = new Float32Array(n); for (let i = 0; i < n; i++) c[i] = fn((i / (n - 1)) * 2 - 1); return c; }
const FUZZ = curve((x) => Math.tanh(1.6 * x) / Math.tanh(1.6));
const CRUSH = curve((x) => Math.tanh(1.5 * Math.round(x * 16) / 16) / Math.tanh(1.5), 2049);   // (five bits)
const CRUSH4 = curve((x) => Math.tanh(1.8 * Math.round(x * 8) / 8) / Math.tanh(1.8), 2049);   // (four: the drums)

// ---- the other songs: notes as MIDI numbers per step (0 a rest, _ hold the last), drums as pattern strings per bar ----
const CH = {   // root (bass octave) and the chord's tones (an octave up)
  C: [36, [60, 64, 67]], Am: [45, [57, 60, 64]], F: [41, [57, 60, 65]], G: [43, [55, 59, 62]], Dm: [38, [57, 62, 65]], Em: [40, [55, 59, 64]],
  Fmaj7: [41, [57, 60, 64, 65]], Em7: [40, [55, 59, 62, 64]], Dm7: [38, [57, 60, 62, 65]], Cmaj7: [36, [55, 59, 60, 64]],
  Am7: [45, [55, 57, 60, 64]], G7: [43, [53, 55, 59, 62]], Bb: [46, [58, 62, 65]],
};
export const SONGS = {
  // the title (above): its score; its make-up gain (less than the others': a little louder than the old title, by the bench);
  // and its tape - the hiss's level, the wow's wavers [Hz, seconds the delay swings], where the top is rolled off, how
  // hard the drums are pushed into the saturation, and the share of them crunched
  title: { bpm: 92, steps: 16, bars: TITLE_FORM.length, echo: 0.14, gain: 2.4, drumVol: 0.8, score: titleScore(),
    fx: { hiss: 0.01, wow: [[0.55, 0.0022], [0.21, 0.0016], [6.5, 0.00007]], top: 9500, drive: 5, crunch: 0.65, grit: 0.35 } },
  // the menu's second track (above): its tempo bar by bar, its tuning (cents sharp, as the recording's bass and keys hold
  // their notes), its one-shots, a light tape - the recording's own sounds already carry its grit, so nothing is
  // squashed or crunched again - and the recording's duck: everything but the drums dipping under each kick and snare
  menu: { bpm: 86.57, tempo: MENU_TEMPO, steps: 16, bars: 16, tune: 7, bank: 'menu', echo: 0, gain: 1.6, score: menuScore(),
    fx: { hiss: 0.0015, wow: [[0.5, 0.0004], [0.19, 0.0003]], top: 16000, drive: 0, crunch: 0, grit: 0, glue: false, vox: false, duck: { kick: 0.3, snare: 0.5 } } },
  // the club: A minor, four on the floor, an off-beat bass, open hats, a stab now and then
  club: { bpm: 124, steps: 16, bars: 8, echo: 0.15,
    chords: ['Am', 'Am', 'F', 'G', 'Am', 'Am', 'F', 'Em'], bassPat: [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 2], bassInst: 'clubbass',
    stabPat: [0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0], stabVol: 0.03,
    drums: { kick: 'x...x...x...x...', clap: '....x.......x...', hat: '..x...x...x...x.', tick: '.x.x.x.x.x.x.x.x' }, drumVol: 0.62 },   // (the kick ran the club over full scale inside: tools/sound/bench.py songs)
  // a shop: F major, a light bossa - electric piano on the off-beats, a soft bass, a shaker
  shop: { bpm: 100, steps: 8, bars: 8, swing: 0.06, echo: 0.2,
    chords: ['Fmaj7', 'Em7', 'Dm7', 'Cmaj7', 'Fmaj7', 'Em7', 'Dm7', 'G7'], bassPat: [1, 0, 0, 2, 0, 1, 0, 0], compPat: [0, 0, 1, 0, 0, 1, 0, 1],
    lead: { inst: 'vibes', vol: 0.05, notes: [
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      81, _, 79, 77, _, 76, _, _, 74, _, 76, 77, _, 79, _, _, 77, _, 76, 74, _, 72, _, 74, 76, _, _, _, 0, 0, 0, 0] },
    drums: { shaker: 'xxxxxxxx', brush: '..x...x.' }, drumVol: 0.5 },
  // a lobby (the bank, the hospital): slow vibes over a pad, nothing to hurry anyone
  lobby: { bpm: 78, steps: 8, bars: 8, echo: 0.3,
    chords: ['Cmaj7', 'Am7', 'Dm7', 'G7', 'Cmaj7', 'Am7', 'Fmaj7', 'G7'], bassPat: [1, 0, 0, 0, 2, 0, 0, 0], padVol: 0.016,
    lead: { inst: 'vibes', vol: 0.055, notes: [
      76, _, _, 79, _, _, 77, _, 76, _, 72, _, _, _, 0, 0, 74, _, _, 77, _, _, 76, _, 74, _, 71, _, _, _, 0, 0,
      72, _, 76, _, 79, _, 84, _, 81, _, _, _, 76, _, 0, 0, 77, _, 81, _, 79, _, 77, _, 74, _, _, _, _, _, 0, 0] } },
};

// ---- the instruments (notes go through E.tone / E.fm / E.noise into a song's chain) ----
function play(E, out, inst, t, m, dur, v) {
  const f = hz(m);
  switch (inst) {
    case 'lead': E.tone(out, t, f, dur, v, { wave: 'pulse25', a: 0.012, vib: dur > 0.4 ? 14 : 0 }); E.tone(out, t, f * 2, dur * 0.6, v * 0.12, { type: 'sine', a: 0.01 }); break;
    case 'bass': E.tone(out, t, f, dur, v, { type: 'triangle', a: 0.006 }); break;
    case 'clubbass': E.tone(out, t, f, dur, v, { wave: 'saw8', a: 0.004, lp: 420, q: 4 }); E.tone(out, t, f / 2, dur, v * 0.8, { type: 'sine', a: 0.004 }); break;
    case 'arp': E.tone(out, t, f, dur, v, { wave: 'pulse12', a: 0.004 }); break;
    case 'epiano': E.fm(out, t, f, dur, v, 1, 0.9, { mdecay: 0.25 }); E.tone(out, t, f * 2, 0.15, v * 0.25, { type: 'sine' }); break;
    case 'vibes': E.fm(out, t, f, dur, v, 4, 0.25, { mdecay: 0.12 }); E.tone(out, t, f * 1.003, dur, v * 0.5, { type: 'sine' }); break;
    case 'pad': E.tone(out, t, f, dur, v, { wave: 'organ', a: 0.35, lp: 1600 }); break;
    case 'stab': E.tone(out, t, f, dur, v, { wave: 'saw8', a: 0.004, lp: 2400 }); break;
    default: break;
  }
}
function drum(E, out, kind, t, v) {
  switch (kind) {
    case 'kick': E.tone(out, t, 150, 0.17, v * 0.5, { type: 'sine', f2: 44, glide: 0.12, a: 0.002 }); break;
    case 'snare': E.noise(out, t, 0.12, v * 0.16, { ft: 'bandpass', f: 1900, q: 0.8 }); E.tone(out, t, 190, 0.06, v * 0.08, { type: 'triangle', f2: 130 }); break;
    case 'clap': for (let k = 0; k < 3; k++) E.noise(out, t + k * 0.011, 0.05 + k * 0.03, v * 0.13, { ft: 'bandpass', f: 1300, q: 1.1 }); break;
    case 'hat': E.noise(out, t, 0.05, v * 0.07, { ft: 'highpass', f: 7000 }); break;
    case 'tick': E.noise(out, t, 0.02, v * 0.035, { ft: 'highpass', f: 8000 }); break;
    case 'shaker': E.noise(out, t, 0.045, v * (0.03 + R() * 0.02), { ft: 'bandpass', f: 6000, q: 1.2, a: 0.01 }); break;
    case 'brush': E.noise(out, t, 0.14, v * 0.06, { ft: 'bandpass', f: 3000, q: 0.6, a: 0.02 }); break;
    default: break;
  }
}
// the title's riff note: two sawtooths a few cents apart, each scooping up into its pitch, through a low-pass that
// opens as the note starts (wider when the riff is open) - into the vocoder's formants (the player's tape chain)
function voxNote(E, out, t, f, dur, v, open) {
  const c = E.ctx, lp = krate(c.createBiquadFilter()), g = c.createGain();
  const hi = Math.min(9000, f * (30 + 32 * open)), lo = Math.min(6000, f * (18 + 22 * open));
  lp.type = 'lowpass'; lp.Q.value = 1.8;
  lp.frequency.setValueAtTime(lo, t); lp.frequency.linearRampToValueAtTime(hi, t + 0.025); lp.frequency.setTargetAtTime(lo, t + 0.025, 0.15);
  for (const d of [-6, 6]) {
    const o = krate(c.createOscillator());
    o.setPeriodicWave(E.waves.saw48); o.frequency.setValueAtTime(f, t);
    o.detune.setValueAtTime(d - 45, t); o.detune.setTargetAtTime(d, t, 0.025);
    o.connect(lp); o.start(t); o.stop(t + dur + 0.05); E.note(o, t + dur + 0.1);
  }
  E.env(g, t, v, 0.012, dur * 0.55, dur);
  lp.connect(g); g.connect(out);
  E.note(lp, t + dur + 0.1); E.note(g, t + dur + 0.1);
}
// the title's dusty kit: a short, punchy kick with a click, a noisy snare with a little body, ghost notes, hats
function dusty(E, out, kind, t, v, low = 45, hats = 1) {
  switch (kind) {
    case 'kick': E.tone(out, t, 150, 0.42, v * 0.7, { type: 'sine', f2: low, glide: 0.08, a: 0.002 }); if (low < 50) E.tone(out, t, 55, 0.3, v * 0.3, { type: 'sine', a: 0.004 }); E.tone(out, t, 117, 0.08, v * 0.22, { type: 'triangle', f2: 70, a: 0.001 }); E.noise(out, t, 0.018, v * 0.14, { ft: 'bandpass', f: 2600, q: 0.9 }); break;
    case 'snare': E.tone(out, t, 220, 0.12, v * 0.22, { type: 'triangle', f2: 160, glide: 0.06 }); E.noise(out, t, 0.14, v * 0.3, { ft: 'bandpass', f: 1800, q: 0.8 }); E.noise(out, t, 0.22, v * 0.6, { ft: 'bandpass', f: 4300, q: 0.55 }); E.noise(out, t, 0.12, v * 0.25, { ft: 'bandpass', f: 2800, q: 0.9 }); E.noise(out, t, 0.06, v * 0.2, { ft: 'highpass', f: 7600 }); break;
    case 'ghost': E.noise(out, t, 0.06, v * 0.2, { ft: 'bandpass', f: 3600, q: 0.8 }); E.tone(out, t, 210, 0.045, v * 0.08, { type: 'triangle', f2: 170 }); break;
    case 'hat': E.noise(out, t, 0.15, v * 0.2 * hats, { ft: 'highpass', f: 3800, color: 'white' }); break;
    case 'tick': E.noise(out, t, 0.025, v * 0.08, { ft: 'highpass', f: 8500 }); break;
    case 'crash': E.noise(out, t, 1.2, v * 0.15, { ft: 'highpass', f: 4200, color: 'white' }); E.noise(out, t, 0.5, v * 0.1, { ft: 'bandpass', f: 6500, q: 0.7 }); break;
    default: break;
  }
}

export class Music {
  constructor(E) { this.E = E; this.ctx = E.ctx; this.players = {}; this.banks = {}; this.loads = {}; }
  // a song's sample bank, fetched the first time it's wanted: its buffers, null while on its way, false if it failed
  // (the song then plays without it)
  bank(name) { if (!(name in this.banks)) this.load(name); return this.banks[name]; }
  load(name) {
    if (this.loads[name]) return this.loads[name];
    this.banks[name] = null;
    const get = BANKS[name];
    this.loads[name] = (get ? get() : Promise.reject(new Error('no bank ' + name))).then((m) => { this.banks[name] = decodeBank(this.ctx, m.BANK); },
      (e) => { this.banks[name] = false; console.warn('[sound] bank', name, e); });
    return this.loads[name];
  }
  // play only some of a song's parts (the bench and the debug menu: hear the beat on its own); null for all
  solo(name, parts) { const p = this.player(name); p.only = parts && parts.length ? new Set(parts) : null; }
  // a song's player and its chain: level -> low-pass -> pan -> the music bus, with a small echo of its own
  player(name) {
    if (this.players[name]) return this.players[name];
    const c = this.ctx, S = SONGS[name];
    const inp = c.createGain(), lp = krate(c.createBiquadFilter()), pan = c.createStereoPanner ? krate(c.createStereoPanner()) : null, lvl = c.createGain();
    lp.type = 'lowpass'; lp.frequency.value = 16000; lvl.gain.value = 0;
    inp.gain.value = S.gain || 4;   // (the notes are written quiet: the songs' make-up gain)
    if (pan) { lp.connect(pan); pan.connect(lvl); } else lp.connect(lvl);
    const d = c.createDelay(1), fb = c.createGain(), dk = krate(c.createBiquadFilter()), send = c.createGain();
    d.delayTime.value = (60 / S.bpm) * 0.75; fb.gain.value = 0.3; dk.type = 'lowpass'; dk.frequency.value = 2200; send.gain.value = S.echo || 0;
    inp.connect(send); send.connect(d); d.connect(dk); dk.connect(fb); fb.connect(d); dk.connect(lp);
    const p = { name, S, inp, lp, pan, lvl, on: false, step: 0, nextT: 0, want: 0, quietAt: 0, fx: null, open: 1 };
    if (S.fx) this.tape(p); else inp.connect(lp);
    this.players[name] = p;
    return p;
  }
  // The title's tape chain: the song through a slowly wavering delay (the wow - its pitch drifts as the delay stretches
  // and shrinks) and a low-pass (the top rolled off); the riff's notes into the vocoder (the note's body, and three
  // vowel formants the riff moves as it plays, then a little fuzz); the drums partly through the crunch. The hiss and the
  // wavers that drive the wow are sources: they run only while the song does (tapeOn / tapeOff).
  tape(p) {
    const c = this.ctx, X = p.S.fx, gain = (v, to) => { const g = c.createGain(); g.gain.value = v; if (to) g.connect(to); return g; };
    const bp = (f, q) => { const n = krate(c.createBiquadFilter()); n.type = 'bandpass'; n.frequency.value = f; n.Q.value = q; return n; };
    const shaper = (cv) => { const n = c.createWaveShaper(); n.curve = cv; return n; };
    const wow = c.createDelay(0.05), top = krate(c.createBiquadFilter());
    wow.delayTime.value = 0.012; top.type = 'lowpass'; top.frequency.value = X.top; top.Q.value = 0.5;
    // (heavier, grittier: the whole song squeezed by a compressor that lets the drums pump it, and a share of it through
    // the five-bit crunch - as the owner put it, "crunchy" and "heavy")
    // (a stage set to 0 or false is left out: a song made of the recording's own sounds needs no more grit)
    let glue = gain(1);
    if (X.glue !== false) {
      glue = c.createDynamicsCompressor();
      glue.threshold.value = X.glue ? X.glue[0] : -20; glue.knee.value = 6; glue.ratio.value = X.glue ? X.glue[1] : 3.5; glue.attack.value = 0.004; glue.release.value = 0.15;
    }
    if (X.grit) { const grit = shaper(CRUSH); p.inp.connect(gain(1 - X.grit, glue)); p.inp.connect(gain(2, grit)); grit.connect(gain(X.grit / 2, glue)); } else p.inp.connect(glue);
    glue.connect(gain(0.6, wow)); wow.connect(top); top.connect(p.lp);
    const F = p.fx = { wow, top, vox: null, drums: gain(1), src: [] };
    if (X.duck) F.ton = gain(1, p.inp);   // (everything but the drums, ducked under them: 'hit')
    if (X.vox !== false) {
      const vox = gain(1), fA = bp(700, 3.5), fB = bp(1150, 5), fC = bp(2600, 5), gA = gain(0.25), gB = gain(0.5), gC = gain(0.4), drive = gain(7), fuzz = shaper(FUZZ);
      const low = krate(c.createBiquadFilter()), body = gain(0.6, drive);
      low.type = 'lowpass'; low.frequency.value = 900; low.Q.value = 0.7;   // (the note's body: its fundamental and first few harmonics)
      vox.connect(low); low.connect(body);
      for (const [f, g] of [[fA, gA], [fB, gB], [fC, gC]]) { vox.connect(f); f.connect(g); g.connect(drive); }
      drive.connect(fuzz); fuzz.connect(gain(0.34, p.inp));
      Object.assign(F, { vox, body, fA, fB, fC, gA, gB, gC });
    }
    // (the drums squashed a little first - a saturation that rounds off the hits' peaks, as a tape pushed hard does)
    const mix = gain(1);
    if (X.drive) { const sat = shaper(FUZZ); F.drums.connect(gain(X.drive, sat)); sat.connect(gain(1 / X.drive, mix)); } else F.drums.connect(mix);
    if (X.crunch) { const crush = shaper(CRUSH4); mix.connect(gain(1 - X.crunch, p.inp)); mix.connect(gain(2.5, crush)); crush.connect(gain(X.crunch / 2.5, p.inp)); } else mix.connect(p.inp);
  }
  tapeOn(p, t) {
    const c = this.ctx, X = p.S.fx, F = p.fx;
    for (const [f, depth] of X.wow) { const o = c.createOscillator(), g = c.createGain(); o.frequency.value = f; g.gain.value = depth; o.connect(g); g.connect(F.wow.delayTime); o.start(t); F.src.push(o, g); }
    if (!X.hiss) return;
    const n = c.createBufferSource(), hp = krate(c.createBiquadFilter()), g = c.createGain();
    n.buffer = this.E.buf.pink; n.loop = true; hp.type = 'highpass'; hp.frequency.value = 2500; g.gain.value = X.hiss;
    n.connect(hp); hp.connect(g); g.connect(F.top); n.start(t, R() * 1.5);
    F.src.push(n, hp, g);
  }
  tapeOff(p) {
    const t = this.ctx.currentTime;
    for (const n of p.fx.src) { try { if (n.stop) n.stop(t); } catch { /* stopped */ } try { n.disconnect(); } catch { /* gone */ } }
    p.fx.src.length = 0;
  }
  // how loud a song should be now (0: stop it after it fades); lp / pan: its muffle and place
  set(name, level, lp = 16000, pan = 0) {
    const p = this.players[name] || (level > 0 ? this.player(name) : null);
    if (!p) return;
    const t = this.ctx.currentTime;
    p.want = level;
    if (level > 0.001 && !p.on) { p.lvl.connect(this.E.mix.mus); p.on = true; p.step = 0; p.nextT = t + 0.1; p.quietAt = 0; if (p.fx) this.tapeOn(p, t); }
    if (!p.on) return;
    setp(p.lvl.gain, level, t, level > p.lvl.gain.value ? 0.6 : 0.9);
    setp(p.lp.frequency, lp, t, 0.3);
    if (p.pan) setp(p.pan.pan, pan, t, 0.3);
  }
  // schedule the notes due in the next ~0.3 s (from the frame and from a timer, whichever comes first)
  tick() {
    const t = this.ctx.currentTime;
    for (const name in this.players) {
      const p = this.players[name];
      if (!p.on) continue;
      if (p.want <= 0.001) {
        if (!p.quietAt) p.quietAt = t;
        else if (t - p.quietAt > 4) { try { p.lvl.disconnect(); } catch { /* gone */ } p.on = false; if (p.fx) this.tapeOff(p); continue; }
      } else p.quietAt = 0;
      if (p.S.bank && this.bank(p.S.bank) === null) { p.nextT = t + 0.1; continue; }   // (its one-shots are on their way: it starts when they're here)
      if (p.nextT < t - 0.5) p.nextT = t + 0.05;   // (the tab was asleep: start again from now, not catch up)
      // (a note that's already late - the page stalled longer than the look-ahead - is skipped, not started in the past:
      // its envelope would jump instead of ramping, and that jump is a click)
      while (p.nextT < t + 0.3) { const i = p.step; if (p.nextT > t + 0.012) this.step(p, i, p.nextT); p.step = (i + 1) % (p.S.steps * p.S.bars); p.nextT += stepLen(p.S, i); }
    }
  }
  step(p, i, t0) {
    const S = p.S, E = this.E, out = p.inp, sd = stepLen(S, i), bar = Math.floor(i / S.steps), s = i % S.steps;
    if (S.score) { for (const ev of S.score[i % S.score.length]) if (!p.only || p.only.has(ev.p)) this.event(p, ev, t0 + (ev.late || 0) * sd + (R() - 0.5) * 0.005, sd); return; }
    const t = t0 + (S.swing && s % 2 ? sd * S.swing * 4 : 0) + (R() - 0.5) * 0.006;   // (a little swing, a human wobble)
    const hum = () => 0.85 + R() * 0.3;
    const chord = S.chords ? CH[S.chords[bar % S.chords.length]] : null;
    if (S.lead) {
      const n = S.lead.notes, m = n[i % n.length];
      if (m > 0) { let len = 1; while (n[(i + len) % n.length] === _ && len < 16) len++; play(E, out, S.lead.inst, t, m, len * sd * 0.95, S.lead.vol * hum()); }
    }
    if (chord) {
      const [root, tones] = chord;
      if (S.bassPat && S.bassPat[s]) { const m = S.bassPat[s] === 2 ? root + 7 : S.bassPat[s] === 3 ? root + 12 : root; play(E, out, S.bassInst || 'bass', t, m, sd * (S.bassInst ? 0.8 : 1.6), (S.bassInst ? 0.09 : 0.08) * hum()); }
      if (S.arpPat && S.arpPat[s] && R() > 0.08) play(E, out, 'arp', t, tones[(S.arpPat[s] - 1) % tones.length] + 12, sd * 0.9, S.arpVol * hum());
      if (S.compPat && S.compPat[s]) for (const m of tones) play(E, out, 'epiano', t, m, sd * 1.6, 0.018 * hum());
      if (S.stabPat && S.stabPat[s] && R() < 0.6) for (const m of tones) play(E, out, 'stab', t, m + 12, sd * 0.5, S.stabVol * hum());
      if (S.padVol && s === 0) for (const m of tones) play(E, out, 'pad', t, m, sd * S.steps * 0.98, S.padVol);
    }
    if (S.drums) for (const k in S.drums) { const pat = S.drums[k]; if (pat[s % pat.length] === 'x') drum(E, out, k, t, S.drumVol * hum()); }
  }
  // a scored song's event at t (sd: a step's length): the riff's notes (and the formants moving to the vowel it
  // "says" on that note), the bass, the drums; 'open' turns the formants up once the drums are in
  event(p, ev, t, sd) {
    const E = this.E, F = p.fx, hum = 0.88 + R() * 0.24, tn = (p.S.tune || 0) / 100;
    switch (ev.p) {
      case 'open': p.open = ev.o; if (F && F.vox) { setp(F.body.gain, ev.o ? 0.22 : 0.6, t, 0.25); setp(F.gA.gain, ev.o ? 1.5 : 0.25, t, 0.25); setp(F.gB.gain, ev.o ? 1.6 : 0.5, t, 0.25); setp(F.gC.gain, ev.o ? 1.1 : 0.4, t, 0.25); } break;
      case 'vox': {
        const at = t + 0.016, fm = FORMANT[ev.n[0] % 12] || FORMANT[5];   // (the riff a hair behind the beat: lazy)
        if (F) { F.fA.frequency.setTargetAtTime(fm[0], at, 0.03); F.fB.frequency.setTargetAtTime(fm[1], at, 0.03); F.fC.frequency.setTargetAtTime(fm[2], at, 0.03); }
        ev.n.forEach((m, k) => voxNote(E, F && F.vox ? F.vox : p.inp, at, hz(m), ev.len * sd * 0.94, 0.05 * ev.v * hum * (k ? 0.5 : 1), p.open));
        if (p.open) E.noise(p.inp, at, 0.035, 0.025 * ev.v * hum, { ft: 'bandpass', f: 4500, q: 0.9 });   // (a hiss of a consonant on each note, as a vocoder's voice has, once it's talking)
        break;
      }
      case 'sub': E.tone(p.inp, t, hz(ev.n[0]), ev.len * sd * 0.92, 0.32 * ev.v * hum, { wave: 'soft', a: 0.01 }); break;
      // (the menu's: detuned keys plucked through a low-pass; a nasal lead - a thin pulse through a resonant filter, a
      // little vibrato; a rubbery bass that slides up into each note)
      case 'keys': for (const m of ev.n) for (const d of [-9, 9]) E.tone(p.inp, t, hz(m + tn), ev.len * sd, 0.1 * ev.v * hum, { wave: 'saw8', det: d, lp: 1000, q: 1.2, a: 0.004 }); break;
      case 'lead': E.tone(p.inp, t + 0.01, hz(ev.n[0] + tn), ev.len * sd * 0.95, 0.16 * ev.v * hum, { wave: 'pulse12', lp: 1000, q: 3, a: 0.012, hold: ev.len * sd * 0.5, vib: ev.len > 2 ? 12 : 0 }); break;
      case 'rbass': { const f = hz(ev.n[0] + tn); E.tone(p.inp, t, f * 0.94, ev.len * sd * 0.95, 0.13 * ev.v * hum, { wave: 'soft', f2: f, glide: 0.06, a: 0.006, hold: ev.len * sd * 0.4 }); break; }
      // (the menu's bass, as measured: almost a sine, swelling in over 70 ms from a few cents flat, falling away slowly -
      // about 10 dB a second - and let go at the note's end; ev.v is the fundamental's peak in the recording's units)
      case 'mbass': {
        const c = this.ctx, f = hz(ev.n[0] + tn), dur = ev.len * sd, end = t + dur + 0.6;
        const W = this.sub || (this.sub = { w: c.createPeriodicWave(new Float32Array(SUB.length), Float32Array.from(SUB)), k: wavePeak(SUB) });
        const o = c.createOscillator(), g = c.createGain(), v = ev.v * W.k * (0.95 + R() * 0.1);
        o.setPeriodicWave(W.w);
        o.frequency.setValueAtTime(f * 0.988, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.06);
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + 0.07);
        g.gain.setTargetAtTime(0, t + 0.07, 0.85); g.gain.setTargetAtTime(0, t + dur, 0.08);
        o.connect(g); g.connect(F && F.ton ? F.ton : p.inp); o.start(t); o.stop(end);
        E.note(o, end); E.note(g, end);
        break;
      }
      // (a one-shot from the song's bank, at its gain - give or take the drummer's few per cent)
      case 'hit': {
        const B = this.banks[p.S.bank], buf = B && B[ev.s];
        if (!buf) break;
        const c = this.ctx, src = c.createBufferSource(), g = c.createGain(), end = t + buf.duration + 0.1;
        src.buffer = buf; g.gain.value = ev.v * (p.S.drumVol || 1) * (0.94 + R() * 0.12);
        src.connect(g); g.connect(F ? F.drums : p.inp); src.start(t);
        // (the mix ducking everything but the drums under a kick or a snare: down within 20 ms, back within a tenth)
        const dk = F && F.ton && p.S.fx.duck && p.S.fx.duck[ev.s];
        if (dk) { const tg = F.ton.gain; tg.setTargetAtTime(1 - dk, t - 0.005, 0.012); tg.setTargetAtTime(1, t + 0.04, 0.04); }
        E.note(src, end); E.note(g, end);
        break;
      }
      default: dusty(E, F ? F.drums : p.inp, ev.p, t, ev.v * hum * (p.S.drumVol || 1), p.S.kick || 45, p.S.hats ?? 1); break;
    }
  }
  silence() { for (const name in this.players) this.set(name, 0); }
}
