// The sound engine: the AudioContext's graph, the small buffers and wavetables made once at start, the voices the
// one-shot sounds play in, and where the listener is (the camera's centre).
//
// A one-shot sound (instruments.js) is a recipe that schedules a few oscillators and noise bursts into its voice:
// its level (with its distance and its trim, levels.js) -> a low-pass for distance (far or long sounds only) -> its
// pan -> the effects bus (and a little into the echo). A voice's nodes are made when its sound starts and let go
// when it ends (pool.js decides who gets one): an idle voice costs the audio thread nothing - on a phone that is the
// difference between a smooth mix and one that crackles and drops out (measured: tools/sound/bench.py).
//
// Cheap on the audio thread: every filter's and oscillator's parameters run at k-rate (a smooth change is worked
// out once per 128-sample block instead of for every sample: a filter sweeping at a-rate recomputes its
// coefficients 48,000 times a second). Only an FM carrier keeps a-rate (its modulator drives it at audio rate).
import { VoicePool, RateLimit, Budget, spatial, PRI } from './pool.js';
import { INSTR } from './instruments.js';
import { TRIM_DB } from './levels.js';

const TINY = 0.0001;

// Ease a parameter towards v (time constant tc) - unless that's where it's already going: the continuous voices
// update many parameters many times a second, and an unchanged value shouldn't add to the param's timeline.
export function setp(param, v, t, tc) {
  const last = param._to;
  if (last !== undefined && Math.abs(v - last) <= Math.max(1e-4, Math.abs(last) * 0.004)) return;
  param._to = v;
  param.setTargetAtTime(v, t, tc);
}
// a node's frequency / Q / detune / gain / playback rate at k-rate (where the browser can)
const KP = ['frequency', 'Q', 'detune', 'gain', 'playbackRate'];
export function krate(n) {
  for (let i = 0; i < KP.length; i++) { const p = n[KP[i]]; if (p && p.automationRate === 'a-rate') { try { p.automationRate = 'k-rate'; } catch { /* not here */ } } }
  return n;
}

// Seamless noise loops (pure, for the tests): `extra` samples past the end are made and crossfaded over the start,
// so the sample after the last is the one that would have come next - no click at the seam, even for brown noise.
export function loopSeam(d, extra) {
  const n = d.length - extra;
  for (let i = 0; i < extra; i++) { const k = i / extra; d[i] = d[i] * k + d[n + i] * (1 - k); }
  return d.subarray(0, n);
}

export class SoundEngine {
  constructor(ctx, mixer, { voices = 12, shared = null } = {}) {
    this.ctx = ctx; this.mix = mixer;
    this.listener = { x: 0, y: 0, inside: false, live: false };
    this.me = { x: 0, y: 0, live: false };   // (where you are: your own sounds are never cut off)
    if (shared) this.buf = shared.buf; else this.makeBuffers();
    this.makeWaves();
    this.pool = new VoicePool(voices);
    this.rate = new RateLimit();
    this.budget = new Budget();
    this.slots = new Array(voices).fill(null);
    this.cur = null;            // (the voice a recipe is filling: its nodes are noted there)
    this.trash = [];            // [node, time] pairs to disconnect once played (the music's notes, cut-off voices)
    this.sp = { d: 0, gain: 0, pan: 0, lp: 0 };
    this.muted = new Map();     // old sfx names silenced for a while (events.js A.mute)
    this.nextReap = 0; this.nextPos = 0;
    this.trims = {};
    for (const n in TRIM_DB) this.trims[n] = Math.pow(10, TRIM_DB[n] / 20);
    this.samples = new Map();   // name|key -> [AudioBuffer...] (null while rendering): the busiest little sounds, pre-rendered
    this.samplesOk = !shared && typeof window !== 'undefined' && !!(window.OfflineAudioContext || window.webkitOfflineAudioContext);
    // what became of every sound asked for (the debug menu, the bench)
    this.stats = { asked: 0, played: 0, far: 0, gap: 0, budget: 0, pool: 0, cut: 0 };
  }
  now() { return this.ctx.currentTime; }

  // ---- buffers and wavetables, made once ----
  makeBuffers() {
    const sr = this.ctx.sampleRate, X = 1024;
    const mk = (sec) => new Float32Array(Math.floor(sr * sec) + X);
    const wd = mk(2), pd = mk(2), bd = mk(3), cd = mk(2);
    let b0 = 0, b1 = 0, b2 = 0, br = 0;
    for (let i = 0; i < wd.length; i++) {
      const x = Math.random() * 2 - 1;
      wd[i] = x;
      b0 = 0.99765 * b0 + x * 0.099046; b1 = 0.963 * b1 + x * 0.2965164; b2 = 0.57 * b2 + x * 1.0526913;   // (pink: Paul Kellet's filter)
      pd[i] = (b0 + b1 + b2 + x * 0.1848) * 0.16;
    }
    for (let i = 0; i < bd.length; i++) { br = (br + 0.02 * (Math.random() * 2 - 1)) / 1.02; bd[i] = br * 3.2; }
    // crackle: sparse little clicks (16 a second, each a short decaying burst) for debris, fire, rattles and wings -
    // one buffer source where there were a dozen bursts of nodes
    for (let i = 0; i < cd.length; i++) cd[i] = 0;
    for (let k = 0, n = Math.floor(cd.length / sr * 16); k < n; k++) {
      const at = Math.floor(Math.random() * (cd.length - sr * 0.03)), len = Math.floor(sr * (0.002 + Math.random() * 0.012)), a = 0.4 + Math.random() * 0.6;
      for (let i = 0; i < len; i++) cd[at + i] += (Math.random() * 2 - 1) * a * Math.exp(-5 * i / len);
    }
    const buf = (d) => { const s = loopSeam(d, X), b = this.ctx.createBuffer(1, s.length, sr); b.getChannelData(0).set(s); return b; };
    this.buf = { white: buf(wd), pink: buf(pd), brown: buf(bd), crackle: buf(cd) };
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
      saw8: wave((k) => 1 / k, 8),              // a darker sawtooth: engines, brass (and every 'sawtooth')
      sq9: wave((k) => (k % 2 ? 1 / k : 0), 9), // a square with its top cut off (every 'square': no fizz)
      buzz: wave((k) => (k % 2 ? 1 / k : 0.6 / k), 14),   // a motorbike's rasp
      reed: wave((k) => (k === 1 ? 0.6 : k === 2 ? 1 : k === 3 ? 0.7 : k === 5 ? 0.3 : 0.05 / k), 10),
    };
  }

  // ---- a voice's nodes, made for its sound ----
  // the sound's level (the recipe plays into it) -> [low-pass for distance] -> [pan] -> the effects bus; a send to
  // the echo for sounds with one. (The low-pass and the pan only for sounds with a place; the low-pass only when it's
  // far enough to dull, or long enough to drift away.)
  voice(pos, lp, pan, g, send, long) {
    const c = this.ctx, out = c.createGain();
    out.gain.value = g;
    const s = { out, lp: null, pan: null, send: null, nodes: [], x: 0, y: 0, pos, vol: 1, range: 1000 };
    let last = out;
    if (pos && (lp < 15000 || long)) { const f = krate(c.createBiquadFilter()); f.type = 'lowpass'; f.Q.value = 0.4; f.frequency.value = lp; last.connect(f); last = f; s.lp = f; }
    if (pos && c.createStereoPanner) { const p = krate(c.createStereoPanner()); p.pan.value = pan; last.connect(p); last = p; s.pan = p; }
    last.connect(this.mix.sfx);
    if (send > 0) { const sg = c.createGain(); sg.gain.value = send; out.connect(sg); sg.connect(this.mix.echo); s.send = sg; }
    return s;
  }
  // a voice's nodes let go (when: stop the sources then; the rest disconnected a little after)
  free(s, when) {
    for (const n of s.nodes) { try { if (n.stop) n.stop(when); } catch { /* already stopped */ } this.trash.push(n, when + 0.05); }
    for (const n of [s.out, s.lp, s.pan, s.send]) if (n) this.trash.push(n, when + 0.05);
    s.nodes.length = 0;
  }
  // a sound cut off to make room: faded out over some 40 ms, never chopped
  cut(s, t) {
    const g = s.out.gain;
    try { g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.setTargetAtTime(0, t, 0.012); } catch { /* gone */ }
    this.free(s, t + 0.06);
  }
  // where a voice's sound is heard from (world px; undefined: no place) -> its gain; written to its nodes (smoothly
  // when it's already playing)
  place(x, y, range, vol) {
    const L = this.listener;
    let g = vol, pan = 0, lp = 18000;
    if (x !== undefined && L.live) {
      spatial(x - L.x, y - L.y, range, this.sp);
      g *= this.sp.gain; pan = this.sp.pan; lp = this.sp.lp;
      if (L.inside && this.sp.d > 170) { lp = Math.min(lp, 900); g *= 0.5; }   // (heard from indoors: through the walls)
    }
    this.sp.g = g; this.sp.p = pan; this.sp.f = lp;
    return g;
  }
  // is a sound at (x, y) yours? (your steps, your shots, your car: right where you are)
  mineAt(x, y) { const M = this.me; return M.live && x !== undefined && Math.abs(x - M.x) < 48 && Math.abs(y - M.y) < 48; }

  // ---- playing a sound ----
  // name: an instruments.js recipe; x, y: where (undefined: no place); vol: 0..; p: the recipe's parameters (p.mine:
  // it's yours). True if it started.
  play(name, x, y, vol = 1, p = null) {
    const I = INSTR[name];
    if (!I || !(vol > 0.01)) return false;
    const st = this.stats, t = this.ctx.currentTime;
    st.asked++;
    const pos = x !== undefined && x !== null && Number.isFinite(x);
    const range = I.range || 1000;
    const mine = !pos || !!(p && p.mine) || this.mineAt(x, y);
    vol *= this.trims[name] ?? 1;
    // the loudness where you are, before it costs anything
    let loud = vol;
    if (pos && this.listener.live) { spatial(x - this.listener.x, y - this.listener.y, range, this.sp); loud *= this.sp.gain; if (loud < 0.006) { st.far++; return false; } }
    if (I.gap && !this.rate.ok(name, I.gap, t, pos ? x : undefined, y)) { st.gap++; return false; }
    if (!mine && !this.budget.ok(name, t)) { st.budget++; return false; }
    const pri = pos ? (I.pri ?? PRI.NORMAL) : Math.max(I.pri ?? PRI.NORMAL, PRI.MAJOR);
    const i = this.pool.acquire(pri, loud, t, 0.5, mine);
    if (i < 0) { st.pool++; return false; }
    const old = this.slots[i];
    if (old) { if (this.pool.stolen) { this.cut(old, t); st.cut++; } else this.free(old, t); }
    const t0 = t + 0.015 + (I.delay || 0);
    const g = this.place(pos ? x : undefined, y, range, vol);
    const send = (this.listener.inside ? 0.3 : 1) * (I.send || 0);
    // the recipe plays into the voice's level (or one of its pre-rendered variants does); the rest of the voice is made
    // once we know how long it lasts
    const c = this.ctx, out = c.createGain();
    const s = { out, nodes: [] };
    let dur = 0, gv = 1;
    const list = I.cache && this.samplesOk ? this.sample(name, I, p || NOP) : null;
    if (list) {
      const b = list[Math.floor(Math.random() * list.length)], src = c.createBufferSource(), rate = 1 + (Math.random() * 2 - 1) * 0.05;
      src.buffer = b; src.playbackRate.value = rate; src.connect(out); src.start(t0);
      s.nodes.push(src);
      dur = b.duration / rate;
      gv = I.cacheVol ? I.cacheVol(p || NOP) : 1;
    } else {
      this.cur = s;
      try { dur = I.play(this, out, t0, 1, p || NOP, pos ? this.sp.d : 0) || 0.5; } catch (e) { console.warn('[sound]', name, e); dur = 0.5; }
      this.cur = null;
    }
    const v = this.voice(pos, this.sp.f, this.sp.p, g * gv, send, dur > 0.8);
    out.connect(v.out); v.nodes = s.nodes; v.nodes.push(out);
    v.x = x; v.y = y; v.vol = vol * gv; v.range = range;
    this.slots[i] = v;
    this.pool.end[i] = t0 + dur + 0.05;
    st.played++;
    return true;
  }
  // ---- pre-rendered samples for the busiest little sounds (footsteps, raindrops, crickets, crackle, bullets striking) ----
  // A recipe with `cache: n` is synthesised live the first time it plays (for its key: a footstep's surface), while n
  // variants of it are rendered in the background on an OfflineAudioContext; from then on each play is one buffer
  // source, a little faster or slower each time - no filters, no oscillators. (cacheP: the parameters to render with;
  // cacheVol: the part of the volume that depends on the parameters, applied as it plays; cacheLen: a variant's length.)
  sample(name, I, p) {
    const id = name + '|' + (I.cacheKey ? I.cacheKey(p) : '');
    const got = this.samples.get(id);
    if (got !== undefined) return got;
    this.samples.set(id, null);
    this.renderSamples(id, I, I.cacheP ? I.cacheP(p) : p);
    return null;
  }
  renderSamples(id, I, p) {
    const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext, sr = this.ctx.sampleRate;
    const n = I.cache, len = Math.ceil(sr * (I.cacheLen || 0.25)), at = Math.ceil(sr * 0.003);
    let oc;
    try { oc = new OAC(1, len * n, sr); } catch { this.samples.set(id, false); return; }
    const E = new SoundEngine(oc, { sfx: oc.destination, echo: oc.destination }, { voices: 1, shared: this });
    for (let k = 0; k < n; k++) { const g = oc.createGain(); g.connect(oc.destination); try { I.play(E, g, (k * len + at) / sr, 1, p, 0); } catch { /* a variant short */ } }
    let fin = false;
    const done = (buf) => {
      if (fin || !buf) return;
      fin = true;
      const d = buf.getChannelData(0), list = [];
      for (let k = 0; k < n; k++) {
        const v = d.subarray(k * len, (k + 1) * len);
        let end = v.length;
        while (end > 64 && Math.abs(v[end - 1]) < 1e-4) end--;   // (trimmed to where it falls silent)
        const b = this.ctx.createBuffer(1, Math.min(v.length, end + 64), sr);
        b.getChannelData(0).set(v.subarray(0, b.length));
        list.push(b);
      }
      this.samples.set(id, list);
    };
    oc.oncomplete = (e) => done(e.renderedBuffer);
    try { const r = oc.startRendering(); if (r && r.then) r.then(done, () => this.samples.set(id, false)); } catch { this.samples.set(id, false); }
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
  // ('square' and 'sawtooth' play their band-limited, softer wavetables: no fizz on a phone's speaker)
  tone(out, t, f, dur, v, o = NOP) {
    const c = this.ctx, osc = krate(c.createOscillator()), g = c.createGain();
    const ty = o.wave || (!o.type || o.type === 'square' ? 'sq9' : o.type === 'sawtooth' ? 'saw8' : null);
    if (ty) osc.setPeriodicWave(this.waves[ty]); else osc.type = o.type;
    osc.frequency.setValueAtTime(Math.max(10, f), t);
    if (o.f2) osc.frequency.exponentialRampToValueAtTime(Math.max(10, o.f2), t + (o.glide || dur));
    if (o.det) osc.detune.setValueAtTime(o.det, t);
    if (o.vib) { osc.detune.setValueAtTime(0, t + 0.08); for (let k = 1; k * 0.09 < dur; k++) osc.detune.linearRampToValueAtTime(k % 2 ? o.vib : -o.vib, t + 0.08 + k * 0.09); }
    this.env(g, t, v, o.a ?? 0.004, o.hold || 0, dur);
    let last = osc;
    if (o.lp) { const f2 = krate(c.createBiquadFilter()); f2.type = 'lowpass'; f2.frequency.value = o.lp; f2.Q.value = o.q || 0.7; osc.connect(f2); last = f2; this.note(f2, t + dur + 0.1); }
    last.connect(g); g.connect(out);
    osc.start(t); osc.stop(t + dur + 0.03);
    this.note(osc, t + dur + 0.1); this.note(g, t + dur + 0.1);
    return osc;
  }
  // a noise burst through a filter; o: color (white / pink / brown / crackle), ft (filter type), f, f2 (sweep to), q,
  // a, hold, rate. (A high band of noise is pink, not white, unless asked: a softer hiss.)
  noise(out, t, dur, v, o = NOP) {
    const c = this.ctx, src = krate(c.createBufferSource()), flt = krate(c.createBiquadFilter()), g = c.createGain();
    const b = this.buf[o.color || ((o.f || 1000) >= 2500 ? 'pink' : 'white')];
    const rate = o.rate || 1;
    src.buffer = b; src.loop = dur * rate > b.duration - 0.1;
    if (rate !== 1) src.playbackRate.value = rate;
    flt.type = o.ft || 'lowpass'; flt.frequency.setValueAtTime(o.f || 1000, t); flt.Q.value = o.q ?? 0.7;
    if (o.f2) flt.frequency.exponentialRampToValueAtTime(Math.max(20, o.f2), t + (o.glide || dur));
    this.env(g, t, v, o.a ?? 0.002, o.hold || 0, dur);
    src.connect(flt); flt.connect(g); g.connect(out);
    src.start(t, Math.random() * Math.max(0, b.duration - dur * rate - 0.05)); src.stop(t + dur + 0.03);
    this.note(src, t + dur + 0.1); this.note(flt, t + dur + 0.1); this.note(g, t + dur + 0.1);
    return src;
  }
  // a two-operator FM bell / tine: carrier f, modulator f * ratio, index decaying with the note
  fm(out, t, f, dur, v, ratio = 3.5, index = 2, o = NOP) {
    const c = this.ctx, car = c.createOscillator(), mod = krate(c.createOscillator()), mg = c.createGain(), g = c.createGain();
    car.type = 'sine'; mod.type = 'sine';
    car.frequency.setValueAtTime(f, t); mod.frequency.setValueAtTime(f * ratio, t);
    mg.gain.setValueAtTime(f * index, t); mg.gain.exponentialRampToValueAtTime(Math.max(1, f * index * 0.05), t + (o.mdecay || dur * 0.6));
    mod.connect(mg); mg.connect(car.frequency);
    if (o.env !== false) this.env(g, t, v, o.a ?? 0.003, o.hold || 0, dur); else g.gain.value = v;
    car.connect(g); g.connect(out);
    car.start(t); mod.start(t); car.stop(t + dur + 0.03); mod.stop(t + dur + 0.03);
    for (const n of [car, mod, mg, g]) this.note(n, t + dur + 0.1);
    return g;
  }

  // ---- each frame ----
  update(cam, inside) {
    const L = this.listener, t = this.ctx.currentTime;
    if (cam) { L.x = cam.x; L.y = cam.y; L.live = true; }
    L.inside = !!inside;
    if (t >= this.nextPos) {   // the longer sounds follow the camera (a long tail heard as you drive off)
      this.nextPos = t + 0.1;
      for (let i = 0; i < this.slots.length; i++) {
        const s = this.slots[i];
        if (!s || !s.pos || !this.pool.busy[i] || this.pool.end[i] - t < 0.25) continue;
        const g = this.place(s.x, s.y, s.range, s.vol);
        setp(s.out.gain, g, t, 0.06);
        if (s.pan) setp(s.pan.pan, this.sp.p, t, 0.06);
        if (s.lp) setp(s.lp.frequency, this.sp.f, t, 0.06);
      }
    }
    if (t >= this.nextReap) { this.nextReap = t + 0.25; this.reap(t); }
  }
  reap(t) {
    this.pool.reap(t, (i) => { const s = this.slots[i]; if (s) { this.free(s, t); this.slots[i] = null; } });
    // (the music's notes, the voices let go: disconnected once played)
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
