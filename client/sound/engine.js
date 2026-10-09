// The sound engine: the AudioContext's graph, the small buffers and wavetables made once at start, the voice
// strips the one-shot sounds play through, and where the listener is (the camera's centre).
//
// A one-shot sound (instruments.js) is a recipe that schedules a few oscillators and noise bursts into a strip:
// in -> low-pass -> pan -> gain -> the effects bus (and a little into the echo). The strips are made once
// (pool.js decides which one a sound gets, by priority); a sound's own source nodes are the only nodes made for
// it, and they're stopped and disconnected when its slot is reaped. Nothing is made per frame in steady state.
import { VoicePool, RateLimit, spatial, PRI } from './pool.js';
import { INSTR } from './instruments.js';

const TINY = 0.0001;

// Ease a parameter towards v (time constant tc) - unless that's where it's already going: the continuous voices
// update many parameters many times a second, and an unchanged value shouldn't add to the param's timeline.
export function setp(param, v, t, tc) {
  const last = param._to;
  if (last !== undefined && Math.abs(v - last) <= Math.max(1e-4, Math.abs(last) * 0.004)) return;
  param._to = v;
  param.setTargetAtTime(v, t, tc);
}

export class SoundEngine {
  constructor(ctx, mixer, { voices = 24 } = {}) {
    this.ctx = ctx; this.mix = mixer;
    this.listener = { x: 0, y: 0, inside: false, live: false };
    this.makeBuffers();
    this.makeWaves();
    this.pool = new VoicePool(voices);
    this.rate = new RateLimit();
    this.strips = [];
    for (let i = 0; i < voices; i++) this.strips.push(this.makeStrip());
    this.cur = null;            // (the strip a recipe is filling: its nodes are noted there)
    this.trash = [];            // [node, time] pairs to disconnect once played (the music's notes)
    this.sp = { d: 0, gain: 0, pan: 0, lp: 0 };
    this.muted = new Map();     // old sfx names silenced for a while (events.js A.mute)
    this.nextReap = 0; this.nextPos = 0;
  }
  now() { return this.ctx.currentTime; }

  // ---- buffers and wavetables, made once ----
  makeBuffers() {
    const sr = this.ctx.sampleRate, mk = (sec) => this.ctx.createBuffer(1, Math.floor(sr * sec), sr);
    const w = mk(2), p = mk(2), b = mk(3);
    const wd = w.getChannelData(0), pd = p.getChannelData(0), bd = b.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, br = 0;
    for (let i = 0; i < wd.length; i++) {
      const x = Math.random() * 2 - 1;
      wd[i] = x;
      b0 = 0.99765 * b0 + x * 0.099046; b1 = 0.963 * b1 + x * 0.2965164; b2 = 0.57 * b2 + x * 1.0526913;   // (pink: Paul Kellet's filter)
      pd[i] = (b0 + b1 + b2 + x * 0.1848) * 0.16;
    }
    for (let i = 0; i < bd.length; i++) { br = (br + 0.02 * (Math.random() * 2 - 1)) / 1.02; bd[i] = br * 3.2; }
    // crossfade the loops' seams so the beds never click
    for (const d of [wd, pd, bd]) { const n = 512; for (let i = 0; i < n; i++) { const k = i / n; d[i] = d[i] * k + d[d.length - n + i] * (1 - k); } }
    this.buf = { white: w, pink: p, brown: b };
  }
  makeWaves() {
    const ctx = this.ctx, wave = (fn, n = 24) => {
      const re = new Float32Array(n + 1), im = new Float32Array(n + 1);
      for (let k = 1; k <= n; k++) im[k] = fn(k);
      return ctx.createPeriodicWave(re, im);
    };
    const pulse = (duty) => (k) => (2 / (k * Math.PI)) * Math.sin(k * Math.PI * duty);
    this.waves = {
      pulse25: wave(pulse(0.25), 18),           // the SNES-ish soft pulse leads (few harmonics: a gaussian-filtered sample's warmth)
      pulse12: wave(pulse(0.125), 18),
      soft: wave((k) => (k === 1 ? 1 : k === 2 ? 0.28 : k === 3 ? 0.12 : 0), 4),
      organ: wave((k) => (k === 1 ? 1 : k === 2 ? 0.5 : k === 4 ? 0.25 : k === 8 ? 0.1 : 0), 8),
      saw8: wave((k) => 1 / k, 8),              // a darker sawtooth: engines, brass
      buzz: wave((k) => (k % 2 ? 1 / k : 0.6 / k), 14),   // a motorbike's rasp
      reed: wave((k) => (k === 1 ? 0.6 : k === 2 ? 1 : k === 3 ? 0.7 : k === 5 ? 0.3 : 0.05 / k), 10),
    };
  }

  // ---- the strips ----
  makeStrip() {
    const c = this.ctx;
    const inp = c.createGain(), lp = c.createBiquadFilter(), pan = c.createStereoPanner ? c.createStereoPanner() : null, out = c.createGain(), send = c.createGain();
    lp.type = 'lowpass'; lp.frequency.value = 18000; lp.Q.value = 0.4;
    out.gain.value = 0; send.gain.value = 0;
    inp.connect(lp);
    if (pan) { lp.connect(pan); pan.connect(out); } else lp.connect(out);
    out.connect(this.mix.sfx); out.connect(send); send.connect(this.mix.echo);
    return { inp, lp, pan, out, send, nodes: [], x: 0, y: 0, pos: false, vol: 1, range: 1000 };
  }
  stopStrip(s) {
    for (const n of s.nodes) { try { if (n.stop) n.stop(); } catch { /* already stopped */ } try { n.disconnect(); } catch { /* gone */ } }
    s.nodes.length = 0;
  }
  // where a strip's sound is heard from (world px; undefined: no place)
  placeStrip(s, x, y, range, vol, t, now) {
    const L = this.listener;
    let g = vol, pan = 0, lp = 18000;
    if (x !== undefined && L.live) {
      spatial(x - L.x, y - L.y, range, this.sp);
      g *= this.sp.gain; pan = this.sp.pan; lp = this.sp.lp;
      if (L.inside && this.sp.d > 170) { lp = Math.min(lp, 900); g *= 0.5; }   // (heard from indoors: through the walls)
    }
    if (now) {
      s.out.gain.setTargetAtTime(g, t, 0.06); s.lp.frequency.setTargetAtTime(lp, t, 0.06); if (s.pan) s.pan.pan.setTargetAtTime(pan, t, 0.06);
    } else {
      s.out.gain.setValueAtTime(g, t); s.lp.frequency.setValueAtTime(lp, t); if (s.pan) s.pan.pan.setValueAtTime(pan, t);
    }
    return g;
  }

  // ---- playing a sound ----
  // name: an instruments.js recipe; x, y: where (undefined: no place); vol: 0..; p: the recipe's parameters
  play(name, x, y, vol = 1, p = null) {
    const I = INSTR[name];
    if (!I || vol <= 0.01) return false;
    const t = this.ctx.currentTime;
    const pos = x !== undefined && x !== null && Number.isFinite(x);
    const range = I.range || 1000;
    // the loudness where you are, before it costs anything
    let loud = vol;
    if (pos && this.listener.live) { spatial(x - this.listener.x, y - this.listener.y, range, this.sp); loud *= this.sp.gain; if (loud < 0.012) return false; }
    if (I.gap && !this.rate.ok(name, I.gap, t)) return false;
    const pri = pos ? (I.pri ?? PRI.NORMAL) : Math.max(I.pri ?? PRI.NORMAL, PRI.MAJOR);
    const i = this.pool.acquire(pri, loud, t, 0.5);
    if (i < 0) return false;
    const s = this.strips[i];
    if (this.pool.stolen || s.nodes.length) {   // (a sound cut off: a quick fade, then its nodes go)
      s.out.gain.cancelScheduledValues(t); s.out.gain.setValueAtTime(s.out.gain.value, t); s.out.gain.linearRampToValueAtTime(0, t + 0.012);
      const old = s.nodes.splice(0);
      for (const n of old) { try { if (n.stop) n.stop(t + 0.015); } catch { /* done */ } this.trash.push(n, t + 0.05); }
    }
    s.x = x; s.y = y; s.pos = pos; s.vol = vol; s.range = range;
    const t0 = t + 0.015 + (I.delay || 0);
    s.out.gain.cancelScheduledValues(t0);
    this.placeStrip(s, pos ? x : undefined, y, range, vol, t0, false);
    s.send.gain.setValueAtTime(this.listener.inside ? (I.send || 0) * 0.3 : I.send || 0, t0);
    this.cur = s;
    let dur = 0.5;
    try { dur = I.play(this, s.inp, t0, 1, p || NOP, pos ? this.sp.d : 0) || 0.5; } catch (e) { console.warn('[sound]', name, e); }
    this.cur = null;
    this.pool.end[i] = t0 + dur + 0.05;
    return true;
  }
  mute(name, sec) { this.muted.set(name, this.ctx.currentTime + sec); }
  isMuted(name) { const u = this.muted.get(name); return u !== undefined && u > this.ctx.currentTime; }

  // ---- the building blocks the recipes use ----
  note(n, end) { if (this.cur) this.cur.nodes.push(n); else this.trash.push(n, end); }
  env(g, t, v, a, hold, dur) {
    g.gain.setValueAtTime(TINY, t);
    g.gain.linearRampToValueAtTime(v, t + a);
    if (hold > 0) g.gain.setValueAtTime(v, t + a + hold);
    g.gain.exponentialRampToValueAtTime(TINY, t + Math.max(dur, a + hold + 0.01));
  }
  // an oscillator: f Hz for dur s at volume v; o: type / wave, f2 (glide to), glide (s), a (attack), hold, det (cents), lp
  tone(out, t, f, dur, v, o = NOP) {
    const c = this.ctx, osc = c.createOscillator(), g = c.createGain();
    if (o.wave) osc.setPeriodicWave(this.waves[o.wave]); else osc.type = o.type || 'square';
    osc.frequency.setValueAtTime(Math.max(10, f), t);
    if (o.f2) osc.frequency.exponentialRampToValueAtTime(Math.max(10, o.f2), t + (o.glide || dur));
    if (o.det) osc.detune.setValueAtTime(o.det, t);
    if (o.vib) { osc.detune.setValueAtTime(0, t + 0.08); for (let k = 1; k * 0.09 < dur; k++) osc.detune.linearRampToValueAtTime(k % 2 ? o.vib : -o.vib, t + 0.08 + k * 0.09); }
    this.env(g, t, v, o.a ?? 0.004, o.hold || 0, dur);
    let last = osc;
    if (o.lp) { const f2 = c.createBiquadFilter(); f2.type = 'lowpass'; f2.frequency.value = o.lp; f2.Q.value = o.q || 0.7; osc.connect(f2); last = f2; this.note(f2, t + dur + 0.1); }
    last.connect(g); g.connect(out);
    osc.start(t); osc.stop(t + dur + 0.03);
    this.note(osc, t + dur + 0.1); this.note(g, t + dur + 0.1);
    return osc;
  }
  // a noise burst through a filter; o: color (white / pink / brown), ft (filter type), f, f2 (sweep to), q, a, hold, rate
  noise(out, t, dur, v, o = NOP) {
    const c = this.ctx, src = c.createBufferSource(), flt = c.createBiquadFilter(), g = c.createGain();
    const b = this.buf[o.color || 'white'];
    src.buffer = b; src.loop = dur > b.duration - 0.1;
    if (o.rate) src.playbackRate.setValueAtTime(o.rate, t);
    flt.type = o.ft || 'lowpass'; flt.frequency.setValueAtTime(o.f || 1000, t); flt.Q.value = o.q ?? 0.7;
    if (o.f2) flt.frequency.exponentialRampToValueAtTime(Math.max(20, o.f2), t + (o.glide || dur));
    this.env(g, t, v, o.a ?? 0.002, o.hold || 0, dur);
    src.connect(flt); flt.connect(g); g.connect(out);
    src.start(t, Math.random() * Math.max(0, b.duration - dur - 0.05)); src.stop(t + dur + 0.03);
    this.note(src, t + dur + 0.1); this.note(flt, t + dur + 0.1); this.note(g, t + dur + 0.1);
    return src;
  }
  // a two-operator FM bell / tine: carrier f, modulator f * ratio, index decaying with the note
  fm(out, t, f, dur, v, ratio = 3.5, index = 2, o = NOP) {
    const c = this.ctx, car = c.createOscillator(), mod = c.createOscillator(), mg = c.createGain(), g = c.createGain();
    car.type = 'sine'; mod.type = 'sine';
    car.frequency.setValueAtTime(f, t); mod.frequency.setValueAtTime(f * ratio, t);
    mg.gain.setValueAtTime(f * index, t); mg.gain.exponentialRampToValueAtTime(Math.max(1, f * index * 0.05), t + (o.mdecay || dur * 0.6));
    mod.connect(mg); mg.connect(car.frequency);
    this.env(g, t, v, o.a ?? 0.003, o.hold || 0, dur);
    car.connect(g); g.connect(out);
    car.start(t); mod.start(t); car.stop(t + dur + 0.03); mod.stop(t + dur + 0.03);
    for (const n of [car, mod, mg, g]) this.note(n, t + dur + 0.1);
    return car;
  }

  // ---- each frame ----
  update(cam, inside) {
    const L = this.listener, t = this.ctx.currentTime;
    if (cam) { L.x = cam.x; L.y = cam.y; L.live = true; }
    L.inside = !!inside;
    if (t >= this.nextPos) {   // the playing sounds follow the camera (a long tail heard as you drive off)
      this.nextPos = t + 0.1;
      for (let i = 0; i < this.strips.length; i++) {
        const s = this.strips[i];
        if (this.pool.busy[i] && s.pos && this.pool.end[i] - t > 0.25) this.placeStrip(s, s.x, s.y, s.range, s.vol, t, true);
      }
    }
    if (t >= this.nextReap) { this.nextReap = t + 0.25; this.reap(t); }
  }
  reap(t) {
    this.pool.reap(t, (i) => { const s = this.strips[i]; this.stopStrip(s); s.out.gain.setValueAtTime(0, t); });
    // (the music's notes, once played)
    const tr = this.trash;
    if (tr.length) {
      let w = 0;
      for (let k = 0; k < tr.length; k += 2) {
        if (tr[k + 1] <= t) { try { tr[k].disconnect(); } catch { /* gone */ } } else { tr[w++] = tr[k]; tr[w++] = tr[k + 1]; }
      }
      tr.length = w;
    }
  }
}
const NOP = Object.freeze({});
