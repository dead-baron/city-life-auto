// Music (the owner's notes: "no soundtrack playing over the game. Music plays on the title screen. Otherwise music
// lives in the world: a nightclub's bass, muffled from outside and loud and clear inside; shops with their own
// fitting music (light, elevator-style), or none at all"). A small step sequencer with a look-ahead (notes are
// scheduled a fraction of a second ahead on the audio clock, so a slow frame never makes them stumble) and four
// original songs, SNES-flavoured: soft pulse leads, a triangle bass, FM electric piano and vibes, light drums, and
// an echo. Each song plays through its own chain (level, low-pass, pan) so the club can be muffled through its
// walls and placed where it is. All melodies here are original.

import { setp, krate } from './engine.js';

const R = Math.random;
const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
const _ = -1;   // (a held note)

// ---- the songs: notes as MIDI numbers per step (0 a rest, _ hold the last), drums as pattern strings per bar ----
// The title: C major, easy-going, a lead over a walking arpeggio (A then B, 8 bars each).
const TITLE_LEAD = [
  76, _, 79, _, 81, 79, 76, _, 72, _, 76, _, 74, 72, 69, _, 77, _, 81, _, 84, _, 81, 79, 79, _, _, _, 74, _, 79, _,
  76, 79, 84, _, 83, _, 79, _, 81, _, 76, _, 72, _, 76, _, 77, _, 76, 74, _, 69, 74, 77, 79, _, _, _, _, _, 0, 0,
  81, _, 79, _, 77, _, 72, _, 74, _, 79, _, 83, _, 86, _, 88, _, 86, 83, _, 79, 76, _, 84, _, 83, 81, _, 76, _, _,
  81, _, 84, _, 77, _, 81, _, 83, _, 86, _, 79, _, 83, _, 84, _, _, _, 79, _, 76, _, 72, _, _, _, _, _, 0, 0,
];
const TITLE_CHORDS = ['C', 'Am', 'F', 'G', 'C', 'Am', 'Dm', 'G', 'F', 'G', 'Em', 'Am', 'F', 'G', 'C', 'C'];
const CH = {   // root (bass octave) and the chord's tones (an octave up)
  C: [36, [60, 64, 67]], Am: [45, [57, 60, 64]], F: [41, [57, 60, 65]], G: [43, [55, 59, 62]], Dm: [38, [57, 62, 65]], Em: [40, [55, 59, 64]],
  Fmaj7: [41, [57, 60, 64, 65]], Em7: [40, [55, 59, 62, 64]], Dm7: [38, [57, 60, 62, 65]], Cmaj7: [36, [55, 59, 60, 64]],
  Am7: [45, [55, 57, 60, 64]], G7: [43, [53, 55, 59, 62]], Bb: [46, [58, 62, 65]],
};
export const SONGS = {
  title: { bpm: 96, steps: 8, bars: 16, swing: 0.04, echo: 0.3,
    lead: { inst: 'lead', notes: TITLE_LEAD, vol: 0.075 },
    chords: TITLE_CHORDS, bassPat: [1, 0, 2, 0, 1, 0, 3, 0], arpPat: [1, 2, 3, 2, 1, 2, 3, 2], arpVol: 0.022,
    drums: { kick: 'x...x...', snare: '......x.', hat: '.x.x.x.x' }, drumVol: 0.6 },
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

export class Music {
  constructor(E) { this.E = E; this.ctx = E.ctx; this.players = {}; }
  // a song's player and its chain: level -> low-pass -> pan -> the music bus, with a small echo of its own
  player(name) {
    if (this.players[name]) return this.players[name];
    const c = this.ctx, S = SONGS[name];
    const inp = c.createGain(), lp = krate(c.createBiquadFilter()), pan = c.createStereoPanner ? krate(c.createStereoPanner()) : null, lvl = c.createGain();
    lp.type = 'lowpass'; lp.frequency.value = 16000; lvl.gain.value = 0;
    inp.gain.value = 4;   // (the notes are written quiet: the songs' make-up gain)
    inp.connect(lp); if (pan) { lp.connect(pan); pan.connect(lvl); } else lp.connect(lvl);
    const d = c.createDelay(1), fb = c.createGain(), dk = krate(c.createBiquadFilter()), send = c.createGain();
    d.delayTime.value = (60 / S.bpm) * 0.75; fb.gain.value = 0.3; dk.type = 'lowpass'; dk.frequency.value = 2200; send.gain.value = S.echo || 0;
    inp.connect(send); send.connect(d); d.connect(dk); dk.connect(fb); fb.connect(d); dk.connect(lp);
    const p = { name, S, inp, lp, pan, lvl, on: false, step: 0, nextT: 0, want: 0, quietAt: 0 };
    this.players[name] = p;
    return p;
  }
  // how loud a song should be now (0: stop it after it fades); lp / pan: its muffle and place
  set(name, level, lp = 16000, pan = 0) {
    const p = this.players[name] || (level > 0 ? this.player(name) : null);
    if (!p) return;
    const t = this.ctx.currentTime;
    p.want = level;
    if (level > 0.001 && !p.on) { p.lvl.connect(this.E.mix.mus); p.on = true; p.step = 0; p.nextT = t + 0.1; p.quietAt = 0; }
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
        else if (t - p.quietAt > 4) { try { p.lvl.disconnect(); } catch { /* gone */ } p.on = false; continue; }
      } else p.quietAt = 0;
      if (p.nextT < t - 0.5) p.nextT = t + 0.05;   // (the tab was asleep: start again from now, not catch up)
      // (a note that's already late - the page stalled longer than the look-ahead - is skipped, not started in the past:
      // its envelope would jump instead of ramping, and that jump is a click)
      while (p.nextT < t + 0.3) { if (p.nextT > t + 0.012) this.step(p, p.step, p.nextT); p.step = (p.step + 1) % (p.S.steps * p.S.bars); p.nextT += 60 / p.S.bpm / (p.S.steps / 4); }
    }
  }
  step(p, i, t0) {
    const S = p.S, E = this.E, out = p.inp, sd = 60 / S.bpm / (S.steps / 4), bar = Math.floor(i / S.steps), s = i % S.steps;
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
  silence() { for (const name in this.players) this.set(name, 0); }
}
