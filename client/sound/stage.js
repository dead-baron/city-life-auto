// The music out in the world (server/systems/music.js, the page's side of it: client/music/stage.js): the boomboxes, the
// pocket radios, the car radios, the dancers' mats and the gigs, each playing its song from where it is - full up close,
// falling off with distance (shared/rules-music.js MUSIC_HEAR), muffled through a car's body unless you're in it. A song
// is the owner's score compiled for the synth (tools/music/songbook.mjs: client/sound/songbook/<id>.json, fetched the first
// time it's wanted), its notes scheduled a moment ahead on the audio clock from where the song is now - the same moment
// for everyone, from the server's start time or the station's clock; or, once the owner's recording is in the track list
// (shared/music.js TRACKS file), the recording itself. Only the nearest two play (a phone's audio thread); a wrecked one
// glitches - stuttering, crackling - and winds down like a tape running out of battery.
// And the instruments played out loud (the 'jamn' event: someone's notes; yours play the moment you press, from
// client/music/play.js through playNotes), the crowd's cheers, claps and boos (the 'crowd' event).
import { INSTR } from './instruments.js';
import { EVENT_SOUNDS } from './events.js';
import { PRI } from './pool.js';
import { setp, krate } from './engine.js';
import { PF } from '../../shared/constants.js';
import { TRACK, INST_BY_CODE, INSTRUMENTS, jamNotes } from '../../shared/music.js';
import { MUSIC_HEAR, MUSIC_GEAR } from '../../shared/rules-music.js';

const R = Math.random;
const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
const LOOK = 0.3, TICK = 0.08, MAX_SOURCES = 2;
export let live = null;   // (the one in use: client/music/play.js plays your own notes through it)

// ---- the songbook ---------------------------------------------------------------------------------------------------
const BOOK = new Map();
// a song's score (null while it loads, or if it can't)
export function song(id) {
  const b = BOOK.get(id);
  if (b !== undefined) return b && b.then ? null : b;
  BOOK.set(id, fetch(new URL(`./songbook/${id}.json`, import.meta.url)).then((r) => (r.ok ? r.json() : null)).then((d) => { BOOK.set(id, d ? prep(d) : false); }).catch(() => BOOK.set(id, false)));
  return null;
}
// the parts as typed arrays: each note's start (ms), and the rest
function prep(d) {
  for (const p of d.parts) {
    const w = p.v === 'kit' ? 3 : 4, n = p.n.length / w;
    p.w = w; p.len = n; p.t = new Float64Array(n);
    for (let i = 0; i < n; i++) p.t[i] = p.n[i * w];
  }
  return d;
}
const lower = (a, x) => { let lo = 0, hi = a.length; while (lo < hi) { const m = (lo + hi) >> 1; if (a[m] < x) lo = m + 1; else hi = m; } return lo; };

// ---- the voices -----------------------------------------------------------------------------------------------------
const VOL = { lead: 0.05, bass: 0.075, brass: 0.032, reed: 0.045, keys: 0.024, bells: 0.04, pad: 0.011, organ: 0.016, pluck: 0.032, flute: 0.045, voco: 0.028, bow: 0.04 };
export function voiceNote(E, out, voice, t, f, dur, v) {
  switch (voice) {
    case 'bass': E.tone(out, t, f, dur, v, { type: 'triangle', a: 0.006, hold: dur * 0.5 }); E.tone(out, t, f / 2, dur, v * 0.5, { type: 'sine', a: 0.006, hold: dur * 0.5 }); break;
    case 'brass': E.tone(out, t, f, dur, v, { wave: 'saw8', a: 0.03, lp: 1900, hold: dur * 0.7 }); break;
    case 'reed': E.tone(out, t, f, dur, v, { wave: 'reed', a: 0.025, lp: 2800, hold: dur * 0.7, vib: dur > 0.3 ? 10 : 0 }); break;
    case 'keys': E.fm(out, t, f, Math.min(dur, 1.2), v, 1, 0.9, { mdecay: 0.25 }); break;
    case 'bells': E.fm(out, t, f, Math.min(dur, 0.9), v, 3.5, 0.6, { mdecay: 0.15 }); break;
    case 'pad': E.tone(out, t, f, dur, v, { wave: 'organ', a: 0.3, lp: 1500, hold: dur * 0.6 }); break;
    case 'organ': E.tone(out, t, f, dur, v, { wave: 'organ', a: 0.01, lp: 2600, hold: dur * 0.8 }); break;
    case 'pluck': E.tone(out, t, f, Math.min(dur, 0.7), v, { wave: 'saw8', a: 0.003, lp: 2400 }); break;
    case 'flute': E.tone(out, t, f, dur, v, { type: 'sine', a: 0.05, hold: dur * 0.7, vib: dur > 0.3 ? 9 : 0 }); E.noise(out, t, Math.min(dur, 0.2), v * 0.3, { ft: 'bandpass', f: f * 2, q: 2 }); break;
    case 'voco': E.tone(out, t, f, dur, v, { wave: 'saw8', a: 0.02, lp: 1300, q: 3, hold: dur * 0.6 }); break;
    case 'bow': E.tone(out, t, f, dur, v, { wave: 'saw8', a: 0.08, lp: 2600, hold: dur * 0.7, vib: 12 }); break;
    default: E.tone(out, t, f, dur, v, { wave: 'pulse25', a: 0.01, hold: dur * 0.5, vib: dur > 0.4 ? 12 : 0 });
  }
}
// the live kit (tools/music/songbook.mjs DRUM): kick, snare, clap, hat, open hat, tick, shaker, brush, three toms, a hand
// drum, a cymbal, a timbale
export function kitHit(E, out, d, t, v) {
  switch (d) {
    case 0: E.tone(out, t, 150, 0.17, v * 0.5, { type: 'sine', f2: 44, glide: 0.12, a: 0.002 }); break;
    case 1: E.noise(out, t, 0.12, v * 0.16, { ft: 'bandpass', f: 1900, q: 0.8 }); E.tone(out, t, 190, 0.06, v * 0.08, { type: 'triangle', f2: 130 }); break;
    case 2: for (let k = 0; k < 3; k++) E.noise(out, t + k * 0.011, 0.05 + k * 0.03, v * 0.13, { ft: 'bandpass', f: 1300, q: 1.1 }); break;
    case 3: E.noise(out, t, 0.05, v * 0.07, { ft: 'highpass', f: 7000 }); break;
    case 4: E.noise(out, t, 0.25, v * 0.06, { ft: 'highpass', f: 6500 }); break;
    case 5: E.noise(out, t, 0.02, v * 0.05, { ft: 'bandpass', f: 3500, q: 3 }); break;
    case 6: E.noise(out, t, 0.045, v * 0.04, { ft: 'bandpass', f: 6000, q: 1.2, a: 0.01 }); break;
    case 7: E.noise(out, t, 0.14, v * 0.06, { ft: 'bandpass', f: 3000, q: 0.6, a: 0.02 }); break;
    case 8: case 9: case 10: { const f = [220, 165, 120][d - 8]; E.tone(out, t, f, 0.22, v * 0.25, { type: 'sine', f2: f * 0.6, glide: 0.2 }); break; }
    case 11: E.tone(out, t, 330 + R() * 60, 0.12, v * 0.16, { type: 'sine', f2: 250 }); break;
    case 12: E.noise(out, t, 0.9, v * 0.06, { ft: 'highpass', f: 5000 }); break;
    case 13: E.tone(out, t, 520, 0.15, v * 0.12, { type: 'triangle', f2: 440 }); E.noise(out, t, 0.08, v * 0.05, { ft: 'bandpass', f: 4000 }); break;
    default:
  }
}

// ---- the crowd's sounds ---------------------------------------------------------------------------------------------
const rr = (a, b) => a + R() * (b - a);
Object.assign(INSTR, {
  // a cheer: a few voices whooping up, a wash of shouting under them (more the bigger the crowd: p.n)
  cheer: { pri: PRI.NORMAL, range: 900, gap: 1.2, play(E, o, t, v, p) {
    const n = Math.min(8, 2 + ((p && p.n) || 3) / 2);
    E.noise(o, t, 1.4, v * 0.12, { ft: 'bandpass', f: 1400, q: 0.7, a: 0.15 });
    for (let k = 0; k < n; k++) { const f = rr(380, 720), d = rr(0.3, 0.7); E.tone(o, t + rr(0, 0.5), f, d, v * 0.03, { wave: 'saw8', f2: f * rr(1.3, 1.7), glide: d * 0.8, lp: 2400, vib: 30, a: 0.04 }); }
    return 1.5;
  } },
  // claps: a ragged patter
  clap: { pri: PRI.MINOR, range: 700, gap: 1, play(E, o, t, v, p) {
    const n = Math.min(24, 6 + ((p && p.n) || 3) * 2);
    for (let k = 0; k < n; k++) E.noise(o, t + R() * 1.2, 0.04, v * rr(0.3, 0.55), { ft: 'bandpass', f: rr(1100, 1800), q: 1.2 });
    return 1.3;
  } },
  // a boo: a low voice sliding down
  boo: { pri: PRI.NORMAL, range: 800, gap: 0.5, play(E, o, t, v) { const f = rr(140, 200); E.tone(o, t, f, 0.9, v * 0.14, { wave: 'saw8', f2: f * 0.7, glide: 0.8, lp: 900, vib: 25, a: 0.08 }); E.noise(o, t, 0.8, v * 0.07, { ft: 'bandpass', f: 500, q: 1.4, a: 0.1 }); return 1; } },
});
Object.assign(EVENT_SOUNDS, {
  mus: null,   // (data: what plays where - client/music/stage.js)
  jamn: (ev, A) => { if (live && !(A.S && ev.id === A.S.myPedId)) live.jam(ev); },
  crowd: (ev, A) => { if (ev.k === 'smash') { A.at('glass', ev.x, ev.y, 0.9); A.at('clang', ev.x, ev.y, 0.6); return; } A.at(ev.k, ev.x, ev.y, Math.min(1.3, 0.55 + (ev.n || 1) * 0.07), { n: ev.n }); },
});

// ---- the sources --------------------------------------------------------------------------------------------------
export class StageSound {
  constructor(E) { this.E = E; this.ctx = E.ctx; this.vs = new Map(); this.jams = new Map(); this.next = 0; this.mobile = E.pool.max <= 12; live = this; }
  chain(pan = true) {
    const c = this.ctx, inp = c.createGain(), lp = krate(c.createBiquadFilter()), pn = pan && c.createStereoPanner ? krate(c.createStereoPanner()) : null, lvl = c.createGain();
    inp.gain.value = 4; lp.type = 'lowpass'; lp.frequency.value = 16000; lvl.gain.value = 0;
    inp.connect(lp); if (pn) { lp.connect(pn); pn.connect(lvl); } else lp.connect(lvl);
    lvl.connect(this.E.mix.mus);
    return { inp, lp, pan: pn, lvl };
  }
  // each frame (sound/index.js frame): what's playing near, how loud and where, its notes scheduled ahead
  update(F, S, t, scene) {
    const M = S.mus;
    if (!M || scene !== 'game') { this.silence(); return; }
    if (t < this.next) return;
    this.next = t + TICK;
    const L = this.E.listener, me = S.ents && S.ents.get(S.myPedId), myVeh = me && (me.flags & PF.INVEH) ? me.parent & 0x3fffffff : 0;
    const want = [];
    for (const s of M.sources()) {
      const range = MUSIC_HEAR[s.kind] || 400, d = Math.hypot(s.x - L.x, s.y - L.y);
      if (d >= range) continue;
      const inCar = s.kind === 'car' && s.att === myVeh, k = 1 - d / range;
      let g = (inCar ? 0.75 : 0.85 * k * k) * (s.kind === 'radio' ? 0.7 : 1), lp = inCar ? 16000 : 3500 + 12000 * k;
      if (s.kind === 'car' && !inCar) { lp = Math.min(lp, 700); g *= 0.6; }
      if (L.inside) { lp = Math.min(lp, 800); g *= 0.4; }
      want.push({ s, g, lp, pan: inCar ? 0 : Math.max(-0.8, Math.min(0.8, (s.x - L.x) / 400)) });
    }
    want.sort((a, b) => b.g - a.g);
    const keep = new Set();
    for (const w of want.slice(0, MAX_SOURCES)) { keep.add(w.s.id); this.play(w, t); }
    for (const [id, v] of this.vs) if (!keep.has(id)) this.fade(id, v, t);
    this.buskers(S, L, t);
  }
  // the city's own buskers (server personas.js: the guitarist, the saxophonist, the violinist, the drummer on the buckets)
  // play too: the nearest one noodles on their instrument, a pentatonic walk at an easy tempo, heard from their pitch
  buskers(S, L, t) {
    let best = null, bd = MUSIC_HEAR.jam;
    for (const e of S.ents.values()) {
      const pp = e.d && e.d.pp, inst = pp === 'guitar' ? 'guitar' : pp === 'sax' ? 'sax' : pp === 'violin' ? 'violin' : pp === 'drums' ? 'bucketdrum' : null;
      if (!inst || e.d.pl || e.rx === undefined || (e.flags & PF.DEAD)) continue;
      const d = Math.hypot(e.rx - L.x, e.ry - L.y);
      if (d < bd) { bd = d; best = { e, inst }; }
    }
    const B = this.busk || (this.busk = { c: this.chain(), id: 0, next: 0, deg: 2 });
    if (!best) { setp(B.c.lvl.gain, 0, t, 0.4); return; }
    if (B.id !== best.e.id) { B.id = best.e.id; B.next = t + 0.2; B.key = 55 + (best.e.id % 7); }
    const k = 1 - bd / MUSIC_HEAR.jam;
    setp(B.c.lvl.gain, 0.7 * k * k * (L.inside ? 0.4 : 1), t, 0.3);
    setp(B.c.lp.frequency, L.inside ? 800 : 3000 + 12000 * k, t, 0.3);
    if (B.c.pan) setp(B.c.pan.pan, Math.max(-0.8, Math.min(0.8, (best.e.rx - L.x) / 400)), t, 0.3);
    const I = INSTRUMENTS[best.inst], beat = 60 / 96 / 2;
    if (B.next < t) B.next = t + 0.05;
    while (B.next < t + LOOK) {
      if (B.next > t + 0.01 && R() < (I.voice === 'kit' ? 0.85 : 0.6)) {
        B.deg = Math.max(0, Math.min(7, B.deg + Math.round((R() - 0.5) * 3)));
        const notes = I.voice === 'kit' ? [[0, 3, 1, 3][Math.floor(B.next / beat) % 4]] : jamNotes(best.inst, B.deg, R() < 0.12, B.key, true);
        if (I.voice === 'kit') for (const n of notes) kitHit(this.E, B.c.inp, n, B.next, 0.55);
        else for (const n of notes) voiceNote(this.E, B.c.inp, I.voice, B.next, hz(n), beat * (R() < 0.3 ? 2 : 1) * 0.95, (VOL[I.voice] || 0.04) * 1.1 / Math.sqrt(notes.length));
      }
      B.next += beat;
    }
  }
  play(w, t) {
    const s = w.s;
    let v = this.vs.get(s.id);
    if (!v) { v = { id: s.id, c: this.chain(), track: null, data: null, u: -1, k0: 0, rate: 1, ctxT0: t, pos0: 0, quiet: 0, file: null }; this.vs.set(s.id, v); }
    v.quiet = 0;
    const broken = s.brAt !== null, wind = broken ? Math.max(0, 1 - (performance.now() / 1000 - s.brAt) / MUSIC_GEAR.windS) : 1;
    setp(v.c.lvl.gain, w.g * (broken ? wind : 1), t, 0.25);
    setp(v.c.lp.frequency, broken ? Math.max(200, w.lp * wind * wind) : w.lp, t, 0.2);
    if (v.c.pan) setp(v.c.pan.pan, w.pan, t, 0.25);
    if (broken && wind <= 0) return;
    if (s.track !== v.track) { this.stopFile(v); v.track = s.track; v.data = null; v.u = -1; }
    const T = TRACK[s.track];
    if (T && T.file) { this.playFile(v, s, T, t, broken ? wind : 1); return; }
    if (!v.data) { v.data = song(s.track); if (!v.data) return; v.u = -1; }
    const secs = v.data.secs;
    // where the song is now (s.pos: the server's word for it) - picked up from there when it's somewhere else
    const posNow = v.ctxT0 !== undefined && v.u >= 0 ? v.pos0 + (t - v.ctxT0) * v.rate : null;
    if (broken) {   // the wreck: slowing to a stop, stuttering now and then
      if (posNow === null) return;
      const r = Math.max(0.12, wind);
      const stutter = R() < 0.25;
      v.pos0 = posNow - (stutter ? 0.09 * (1 - wind) : 0); v.ctxT0 = t; v.rate = r; v.u = stutter ? v.pos0 : Math.max(v.u, v.pos0);
      if (R() < 0.5) this.E.noise(v.c.inp, t + R() * 0.05, 0.05, 0.03, { color: 'crackle', ft: 'bandpass', f: 2500, q: 0.7 });
    } else if (posNow === null || Math.abs(posNow - s.pos) > 0.25) { v.pos0 = s.pos; v.ctxT0 = t; v.rate = 1; v.u = s.pos; }
    if (s.pos < -0.05 && !broken) return;   // (a set's count-in: not started yet)
    const to = v.pos0 + (t + LOOK - v.ctxT0) * v.rate;
    this.schedule(v, Math.max(0, v.u), to, secs, broken ? v.rate : 1);
    v.u = Math.max(v.u, to);
  }
  // the song's notes from song time a to b (s; past its end it goes round), onto the audio clock
  schedule(v, a, b, secs, pitch) {
    if (b <= a) return;
    const E = this.E, now = this.ctx.currentTime, cap = this.mobile ? 28 : 64;
    let n = 0;
    for (let k = Math.floor(a / secs); k * secs < b; k++) {
      const lo = Math.max(0, (a - k * secs) * 1000), hi = Math.min(secs, b - k * secs) * 1000;
      for (const p of v.data.parts) {
        if (this.mobile && p.v === 'pad' && R() < 0.5) continue;
        for (let i = lower(p.t, lo); i < p.len && p.t[i] < hi; i++) {
          if (++n > cap) return;
          const st = k * secs + p.t[i] / 1000, at = v.ctxT0 + (st - v.pos0) / v.rate;
          if (at < now + 0.01) continue;
          const o = i * p.w, vel = p.n[o + p.w - 1] / 100;
          if (p.v === 'kit') kitHit(E, v.c.inp, p.n[o + 1], at, 0.6 * p.g * vel);
          else voiceNote(E, v.c.inp, p.v, at, hz(p.n[o + 2]) * Math.pow(pitch, 0.8), Math.max(0.04, p.n[o + 1] / 1000 / v.rate), (VOL[p.v] || 0.03) * p.g * vel * 1.2);
        }
      }
    }
  }
  // the owner's recording, once it's in the track list: decoded once, played from where the song is
  playFile(v, s, T, t, rate) {
    if (!v.file) {
      v.file = { buf: null, src: null };
      fetch(new URL('../../' + T.file.opus, import.meta.url)).then((r) => r.arrayBuffer()).then((b) => this.ctx.decodeAudioData(b)).catch(() => fetch(new URL('../../' + T.file.mp3, import.meta.url)).then((r) => r.arrayBuffer()).then((b) => this.ctx.decodeAudioData(b))).then((buf) => { v.file.buf = buf; }).catch(() => {});
      return;
    }
    if (!v.file.buf) return;
    if (!v.file.src) {
      const src = this.ctx.createBufferSource();
      src.buffer = v.file.buf; src.loop = true; src.connect(v.c.inp);
      src.start(t + 0.02, Math.max(0, s.pos) % v.file.buf.duration);
      v.file.src = src;
    }
    setp(v.file.src.playbackRate, Math.max(0.15, rate), t, 0.2);
  }
  stopFile(v) { if (v.file && v.file.src) { try { v.file.src.stop(); v.file.src.disconnect(); } catch { /* gone */ } } v.file = null; }
  fade(id, v, t) {
    setp(v.c.lvl.gain, 0, t, 0.3);
    if (!v.quiet) v.quiet = t;
    else if (t - v.quiet > 2) { this.stopFile(v); try { v.c.lvl.disconnect(); } catch { /* gone */ } this.vs.delete(id); }
  }
  silence() { const t = this.ctx.currentTime; for (const [id, v] of this.vs) this.fade(id, v, t); if (this.busk) setp(this.busk.c.lvl.gain, 0, t, 0.3); }
  // someone's notes on their instrument (the 'jamn' event), from where they stand
  jam(ev) {
    const inst = INST_BY_CODE[ev.i], I = INSTRUMENTS[inst];
    if (!I) return;
    let c = this.jams.get(ev.id);
    if (!c) { if (this.jams.size > 6) { const [k, o] = this.jams.entries().next().value; try { o.lvl.disconnect(); } catch { /* gone */ } this.jams.delete(k); } c = this.chain(); this.jams.set(ev.id, c); }
    const L = this.E.listener, d = Math.hypot(ev.x - L.x, ev.y - L.y), k = Math.max(0, 1 - d / MUSIC_HEAR.jam), t = this.ctx.currentTime;
    if (k <= 0) return;
    c.lvl.gain.setValueAtTime(0.8 * k * k * (L.inside ? 0.4 : 1), t);
    c.lp.frequency.setValueAtTime(L.inside ? 800 : 3000 + 12000 * k, t);
    if (c.pan) c.pan.pan.setValueAtTime(Math.max(-0.8, Math.min(0.8, (ev.x - L.x) / 400)), t);
    this.notes(c.inp, I, ev.n, t + 0.01);
  }
  notes(out, I, notes, t) {
    for (const n of notes || []) {
      if (I.voice === 'kit') kitHit(this.E, out, n, t, 0.7);
      else voiceNote(this.E, out, I.voice, t, hz(n), I.voice === 'pluck' ? 0.6 : 0.42, (VOL[I.voice] || 0.04) * 1.3 / Math.sqrt(notes.length));
    }
  }
  // your own notes, the moment you press (client/music/play.js)
  playNotes(inst, notes) {
    const I = INSTRUMENTS[inst];
    if (!I) return;
    if (!this.mine) { this.mine = this.chain(false); this.mine.lvl.gain.value = 0.85; }
    this.notes(this.mine.inp, I, notes, this.ctx.currentTime + 0.005);
  }
}
