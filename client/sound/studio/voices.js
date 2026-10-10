// The studio's instruments. Each voice renders one note to a mono Float32Array (the note held, then its release),
// from the note (f Hz, dur s, vel 0-1, fPrev for a slide in) and its preset. SNES instruments were short sampled
// loops with an envelope; these are made by code instead, shaped to sit the same way in a mix:
//   synth  - oscillators (saw, pulse, triangle, sine, noise; unison) through a swept low-pass: leads, basses, brass,
//            strings, pads
//   fm     - two-operator FM: electric piano, slap bass, brass stabs, clavinet-ish plucks
//   bell   - partials with their own decays: glockenspiel, vibes, marimba, celesta
//   pluck  - Karplus-Strong strings: steel and nylon guitar, muted skank, harp, pizzicato, upright bass
//   flute  - a breathy sine with its harmonics and a chiff: flute, whistle, recorder
//   organ  - drawbars with key click and a little Leslie
//   vocal  - a sung vowel through formant filters: the vocoder-like voice

import { SR, TAU, SVF, sawAt, pulseAt, triAt, envADSR, soft, clamp } from './dsp.js';

const sinT = new Float32Array(4097);
for (let i = 0; i <= 4096; i++) sinT[i] = Math.sin((i / 4096) * TAU);
function sin1(ph) { ph -= Math.floor(ph); const x = ph * 4096, i = x | 0; return sinT[i] + (sinT[i + 1] - sinT[i]) * (x - i); }   // sin(2 pi ph)

function pitchMod(p, ev, t) {
  let s = 0;
  if (p.vib) { const [rate, depth, delay = 0] = p.vib; if (t > delay) s += Math.sin(TAU * rate * (t - delay)) * depth * Math.min(1, (t - delay) / 0.25); }
  if (p.scoop) { const [st, time] = p.scoop; if (t < time) s += st * (1 - t / time) * (1 - t / time); }
  if (p.fall && t > ev.dur - p.fall[1]) { const u = (t - (ev.dur - p.fall[1])) / p.fall[1]; s += p.fall[0] * u * u; }
  if (ev.fPrev && p.glide && t < p.glide) s += 12 * Math.log2(ev.fPrev / ev.f) * (1 - t / p.glide);
  return s;
}

// ---- synth -----------------------------------------------------------------------------------------------------
export function synth(ev, p, R) {
  const [a, d, s, r] = p.env || [0.005, 0.3, 0.7, 0.12];
  const nOn = Math.max(1, Math.round(ev.dur * SR)), env = envADSR(nOn, a, d, s, r), n = env.length, out = new Float32Array(n);
  const waves = p.waves || [{ w: 'saw', lvl: 1 }];
  const uni = p.uni || 1, uniDet = p.uniDet || 0;
  const voices = [];
  for (let u = 0; u < uni; u++) {
    const spread = uni === 1 ? 0 : (u / (uni - 1) - 0.5) * 2 * uniDet;
    const start = p.uniDelay ? Math.round(R() * p.uniDelay * SR) : 0;
    for (const w of waves) voices.push({ w: w.w, duty: w.duty ?? 0.5, mul: Math.pow(2, ((w.det || 0) + spread) / 1200 + (w.oct || 0)), lvl: (w.lvl ?? 1) / Math.sqrt(uni), ph: R(), start });
  }
  const cutBase = (p.cut || 20000) * (p.keyTrack ? Math.pow(ev.f / 261.6, p.keyTrack) : 1) * Math.pow(2, (p.velCut || 0) * (ev.vel - 0.7));
  const filt = p.cut ? new SVF(cutBase, p.q || 0.707) : null;
  const fenv = p.fenv || 0, fdec = p.fdec || 0.2, fatk = p.fatk || 0;
  const breath = p.breath || 0, bf = breath ? new SVF(Math.min(9000, ev.f * 3), 1.2) : null;
  const post = p.lp2 ? new SVF(p.lp2, 0.6) : null;
  const trem = p.trem, pwm = p.pwm;
  let fr = ev.f, dt = fr / SR;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    if ((i & 15) === 0) {
      fr = ev.f * Math.pow(2, pitchMod(p, ev, t) / 12); dt = fr / SR;
      if (filt) {
        const fe = fatk && t < fatk ? t / fatk : Math.exp(-(t - fatk) / fdec);
        filt.set(cutBase * Math.pow(2, fenv * fe), p.q || 0.707);
      }
    }
    let x = 0;
    const duty0 = pwm ? 0.5 + Math.sin(TAU * pwm[0] * t) * pwm[1] : 0;
    for (let k = 0; k < voices.length; k++) {
      const v = voices[k];
      if (i < v.start) continue;
      const vdt = dt * v.mul;
      let y;
      if (v.w === 'saw') y = sawAt(v.ph, vdt);
      else if (v.w === 'pulse') y = pulseAt(v.ph, vdt, pwm ? clamp(v.duty + duty0 - 0.5, 0.05, 0.95) : v.duty);
      else if (v.w === 'tri') y = triAt(v.ph);
      else if (v.w === 'sine') y = sin1(v.ph);
      else y = R() * 2 - 1;
      x += y * v.lvl;
      v.ph += vdt; if (v.ph >= 1) v.ph -= 1;
    }
    if (breath) x += bf.run(R() * 2 - 1) * breath * (t < 0.06 ? 2.5 : 1);
    if (filt) x = filt.run(x);
    if (p.drive) x = soft(x, p.drive);
    if (post) x = post.run(x);
    let g = env[i];
    if (trem) g *= 1 - trem[1] * (0.5 + 0.5 * Math.sin(TAU * trem[0] * t));
    out[i] = x * g;
  }
  return out;
}

// ---- fm --------------------------------------------------------------------------------------------------------
export function fm(ev, p, R) {
  const [a, d, s, r] = p.env || [0.002, 1.2, 0, 0.15];
  const nOn = Math.max(1, Math.round(ev.dur * SR)), env = envADSR(nOn, a, d, s, r), n = env.length, out = new Float32Array(n);
  const ratio = p.ratio ?? 1, ratio2 = p.ratio2 || 0, fb = p.fb || 0;
  const vb = 0.7 + 0.6 * ev.vel;   // (harder = brighter)
  const i0 = (p.index ?? 1) * vb, iS = (p.idxSus ?? 0.2) * i0, idec = p.idxDec || 0.4;
  const j0 = (p.index2 || 0) * vb, jdec = p.idx2Dec || 0.05;
  let pc = R(), pm = R(), pm2 = R(), prev = 0, pc2 = R();
  const det = p.det ? Math.pow(2, p.det / 1200) : 0;
  let fr = ev.f;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    if ((i & 15) === 0) fr = ev.f * Math.pow(2, pitchMod(p, ev, t) / 12);
    const I = iS + (i0 - iS) * Math.exp(-t / idec), J = j0 * Math.exp(-t / jdec);
    const m = sin1(pm + fb * prev); prev = m;
    const pmod = (I * m + (ratio2 ? J * sin1(pm2) : 0)) / TAU;   // (phase modulation, I in radians)
    let x = sin1(pc + pmod);
    if (det) x = 0.5 * (x + sin1(pc2 + pmod));
    const dtc = fr / SR;
    pc += dtc; pm += dtc * ratio; pm2 += dtc * ratio2; if (det) pc2 += dtc * det;
    let g = env[i];
    if (p.trem) g *= 1 - p.trem[1] * (0.5 + 0.5 * Math.sin(TAU * p.trem[0] * t));
    out[i] = x * g;
  }
  if (p.drive) for (let i = 0; i < n; i++) out[i] = soft(out[i], p.drive);
  return out;
}

// ---- bell (partials with their own decays) ---------------------------------------------------------------------
export function bell(ev, p, R) {
  const parts = p.partials || [[1, 1, 1.5], [2.76, 0.4, 0.5], [5.4, 0.15, 0.15]];
  const rel = p.rel || 0.25, nOn = Math.max(1, Math.round(ev.dur * SR)), nTail = Math.round(Math.max(rel * 5, 0.05) * SR);
  const longest = Math.max(...parts.map((q) => q[2]));
  const n = Math.min(nOn + nTail, Math.round(longest * 6 * SR) + 64), out = new Float32Array(n);
  const rk = Math.exp(-1 / (rel * SR));
  const ph = parts.map(() => R());
  let relG = 1;
  const hard = 0.6 + 0.4 * ev.vel;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    let x = 0;
    for (let k = 0; k < parts.length; k++) {
      const [ra, am, dec] = parts[k];
      const amp = am * Math.exp(-t / dec) * (k ? hard : 1);
      if (amp < 1e-5) continue;
      x += sin1(ph[k] + ev.f * ra * t) * amp;
    }
    if (p.click && i < 64) x += (R() * 2 - 1) * p.click * (1 - i / 64);
    if (i >= nOn) relG *= rk;
    let g = relG * Math.min(1, i / 16);
    if (p.trem) g *= 1 - p.trem[1] * (0.5 + 0.5 * Math.sin(TAU * p.trem[0] * t));
    out[i] = x * g;
  }
  return out;
}

// ---- pluck (Karplus-Strong with an all-pass tuner) -------------------------------------------------------------
export function pluck(ev, p, R) {
  const f = ev.f, L = SR / f;
  let N = Math.floor(L - 0.5 - 0.1); if (N < 2) N = 2;
  const dap = L - N - 0.5, C = (1 - dap) / (1 + dap);
  const sustain = p.mute ? (p.muteSus || 0.12) : (p.sustain || 2.5);
  const loss = Math.pow(0.001, 1 / (sustain * f));
  const relLoss = Math.pow(0.001, 1 / ((p.rel || 0.08) * f));
  const nOn = Math.max(1, Math.round(ev.dur * SR));
  const n = nOn + Math.round(Math.min(sustain, (p.rel || 0.08)) * 1.2 * SR) + 32;
  const out = new Float32Array(n), buf = new Float32Array(N);
  // the pluck: noise, darker for a softer pick and a lighter touch
  const bright = clamp((p.bright ?? 0.6) * (0.75 + 0.35 * ev.vel), 0.02, 1);
  const fc = 150 * Math.pow(2, bright * 6.5), ca = 1 - Math.exp(-TAU * Math.min(fc, SR * 0.45) / SR);
  let lp1 = 0, lp2 = 0;
  for (let i = 0; i < N * 2; i++) { lp1 += ca * ((R() * 2 - 1) - lp1); lp2 += ca * (lp1 - lp2); if (i >= N) buf[i - N] = lp2; }   // (the first lap warms the filters up)
  if (p.pick) { const k = Math.max(1, Math.round(N * p.pick)), tmp = buf.slice(); for (let i = 0; i < N; i++) buf[i] = tmp[i] - tmp[(i + k) % N]; }
  let mean = 0; for (let i = 0; i < N; i++) mean += buf[i]; mean /= N;
  let pk = 1e-9; for (let i = 0; i < N; i++) { buf[i] -= mean; pk = Math.max(pk, Math.abs(buf[i])); }
  for (let i = 0; i < N; i++) buf[i] *= 0.7 / pk;
  const damp = p.mute ? 0.55 : (p.damp || 0);
  let ptr = 0, xPrev = 0, apIn = 0, apOut = 0, dl = 0;
  for (let i = 0; i < n; i++) {
    const x = buf[ptr];
    out[i] = x;
    let avg = 0.5 * (x + xPrev);
    if (damp) { dl += (1 - damp) * (avg - dl); avg = dl; }
    const y = C * avg + apIn - C * apOut; apIn = avg; apOut = y;
    buf[ptr] = y * (i < nOn ? loss : relLoss);
    xPrev = x;
    if (++ptr >= N) ptr = 0;
  }
  if (p.drive) for (let i = 0; i < n; i++) out[i] = soft(out[i] * (1 + p.drive), p.drive);
  // a short fade-in so the pluck doesn't click
  for (let i = 0; i < 24 && i < n; i++) out[i] *= i / 24;
  return out;
}

// ---- flute -------------------------------------------------------------------------------------------------------
export function flute(ev, p, R) {
  const [a, d, s, r] = p.env || [0.04, 0.4, 0.85, 0.12];
  const nOn = Math.max(1, Math.round(ev.dur * SR)), env = envADSR(nOn, a, d, s, r), n = env.length, out = new Float32Array(n);
  const h = p.harm || [1, 0.22, 0.07, 0.03];
  const bp = new SVF(Math.min(10000, ev.f * 2), 2.5), air = p.air ?? 0.06, chiff = p.chiff ?? 0.25;
  let ph = R(), fr = ev.f;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    if ((i & 15) === 0) fr = ev.f * Math.pow(2, pitchMod(p, ev, t) / 12);
    let x = 0;
    for (let k = 0; k < h.length; k++) if (h[k]) x += sin1(ph * (k + 1)) * h[k];
    ph += fr / SR; if (ph > 1e6) ph -= 1e6;
    const nz = bp.run(R() * 2 - 1);
    x += nz * (air + (t < 0.05 ? chiff * (1 - t / 0.05) : 0));
    out[i] = x * env[i];
  }
  return out;
}

// ---- organ -------------------------------------------------------------------------------------------------------
export function organ(ev, p, R) {
  const [a, d, s, r] = p.env || [0.004, 0.1, 1, 0.06];
  const nOn = Math.max(1, Math.round(ev.dur * SR)), env = envADSR(nOn, a, d, s, r), n = env.length, out = new Float32Array(n);
  const bars = p.bars || [[0.5, 0.3], [1, 1], [1.5, 0.4], [2, 0.6], [3, 0.2], [4, 0.3]];
  const ph = bars.map(() => R());
  const [lr, ld] = p.leslie || [5.8, 0.12];
  const norm = 1 / bars.reduce((sum, b) => sum + b[1], 0);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const wob = 1 + Math.sin(TAU * lr * t) * 0.0015;   // (the Leslie's doppler)
    let x = 0;
    for (let k = 0; k < bars.length; k++) { x += sin1(ph[k]) * bars[k][1]; ph[k] += ev.f * bars[k][0] * wob / SR; }
    x *= norm;
    if (p.click && i < 96) x += (R() * 2 - 1) * p.click * (1 - i / 96);
    out[i] = x * env[i] * (1 - ld * (0.5 + 0.5 * Math.sin(TAU * lr * t + 1.3)));
  }
  if (p.drive) for (let i = 0; i < n; i++) out[i] = soft(out[i], p.drive);
  return out;
}

// ---- vocal (a sung vowel through formants: the vocoder-ish voice) ------------------------------------------------
const VOWELS = { a: [730, 1090, 2440], o: [570, 840, 2410], u: [300, 870, 2240], i: [270, 2290, 3010], e: [530, 1840, 2480], oo: [380, 950, 2300] };
export function vocal(ev, p, R) {
  const [a, d, s, r] = p.env || [0.03, 0.3, 0.9, 0.15];
  const nOn = Math.max(1, Math.round(ev.dur * SR)), env = envADSR(nOn, a, d, s, r), n = env.length, out = new Float32Array(n);
  const v0 = VOWELS[ev.vowel || p.vowel || 'a'] || VOWELS.a, v1 = VOWELS[p.vowelTo || ev.vowel || p.vowel || 'a'] || v0;
  const fl = [new SVF(v0[0], 9), new SVF(v0[1], 11), new SVF(v0[2], 13)], gains = [1, 0.7, 0.35];
  let ph = R(), ph2 = R(), fr = ev.f;
  const morph = p.morph || 0.5;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    if ((i & 15) === 0) {
      fr = ev.f * Math.pow(2, pitchMod(p, ev, t) / 12);
      const u = Math.min(1, t / morph);
      for (let k = 0; k < 3; k++) fl[k].set(v0[k] + (v1[k] - v0[k]) * u, [9, 11, 13][k]);
    }
    const dt = fr / SR;
    const src = sawAt(ph, dt) * 0.7 + pulseAt(ph2, dt * 1.003, 0.3) * 0.3 + (R() * 2 - 1) * (p.hiss || 0.04);
    ph += dt; if (ph >= 1) ph -= 1; ph2 += dt * 1.003; if (ph2 >= 1) ph2 -= 1;
    let x = 0;
    for (let k = 0; k < 3; k++) { fl[k].run(src); x += fl[k].bp * gains[k]; }
    out[i] = x * env[i] * 0.9;
  }
  return out;
}

export const VOICES = { synth, fm, bell, pluck, flute, organ, vocal };

// ---- presets: an instrument is a voice and its settings (a part can override any of them) ------------------------
export const PRESETS = {
  // leads
  chipLead: { voice: 'synth', waves: [{ w: 'pulse', duty: 0.25 }], env: [0.004, 0.25, 0.75, 0.1], vib: [5.5, 0.12, 0.22], cut: 5200, q: 0.8, glide: 0.05 },
  squareLead: { voice: 'synth', waves: [{ w: 'pulse', duty: 0.5 }, { w: 'pulse', duty: 0.5, det: 7, lvl: 0.5 }], env: [0.006, 0.3, 0.7, 0.12], vib: [5.2, 0.1, 0.3], cut: 4200, q: 0.9 },
  sawLead: { voice: 'synth', waves: [{ w: 'saw' }, { w: 'saw', det: 9, lvl: 0.7 }], env: [0.008, 0.3, 0.75, 0.15], vib: [5.4, 0.1, 0.25], cut: 2600, q: 1.2, fenv: 1.4, fdec: 0.18, keyTrack: 0.5 },
  synthBrass: { voice: 'synth', waves: [{ w: 'saw' }, { w: 'saw', det: -8 }, { w: 'pulse', duty: 0.35, det: 5, lvl: 0.5 }], env: [0.025, 0.4, 0.8, 0.14], cut: 900, q: 1, fenv: 2.2, fatk: 0.05, fdec: 0.35, keyTrack: 0.6, vib: [5, 0.08, 0.35], scoop: [-0.6, 0.06] },
  analogPad: { voice: 'synth', waves: [{ w: 'saw' }, { w: 'saw', det: 12 }, { w: 'saw', det: -11 }], env: [0.5, 1, 0.85, 0.8], cut: 1500, q: 0.8, keyTrack: 0.3, vib: [0.6, 0.06, 0] },
  warbleKeys: { voice: 'synth', waves: [{ w: 'tri' }, { w: 'pulse', duty: 0.3, det: 14, lvl: 0.35 }], env: [0.01, 0.8, 0.5, 0.3], cut: 2200, q: 0.9, vib: [4.2, 0.18, 0] },
  // brass and reeds
  trumpet: { voice: 'synth', waves: [{ w: 'saw' }, { w: 'pulse', duty: 0.42, lvl: 0.4 }], uni: 2, uniDet: 6, uniDelay: 0.012, env: [0.018, 0.25, 0.8, 0.09], cut: 1300, q: 1.1, fenv: 1.9, fatk: 0.03, fdec: 0.22, keyTrack: 0.8, velCut: 1.2, vib: [5.6, 0.1, 0.3], scoop: [-0.8, 0.05], breath: 0.03, drive: 0.25, lp2: 6000 },
  trombone: { voice: 'synth', waves: [{ w: 'saw' }, { w: 'tri', lvl: 0.5 }], uni: 2, uniDet: 5, uniDelay: 0.015, env: [0.03, 0.3, 0.8, 0.11], cut: 700, q: 1, fenv: 1.7, fatk: 0.05, fdec: 0.3, keyTrack: 0.8, velCut: 1, vib: [5, 0.08, 0.35], scoop: [-1, 0.07], glide: 0.09, breath: 0.02, drive: 0.2 },
  altoSax: { voice: 'synth', waves: [{ w: 'saw', lvl: 0.7 }, { w: 'pulse', duty: 0.28, lvl: 0.6 }], env: [0.02, 0.3, 0.85, 0.08], cut: 1800, q: 2.2, fenv: 1.1, fatk: 0.03, fdec: 0.25, keyTrack: 0.6, velCut: 1, vib: [5.2, 0.14, 0.18], scoop: [-1.2, 0.06], glide: 0.03, breath: 0.05, drive: 0.45, lp2: 4200 },
  tuba: { voice: 'synth', waves: [{ w: 'saw', lvl: 0.6 }, { w: 'tri' }], env: [0.025, 0.25, 0.75, 0.08], cut: 420, q: 0.9, fenv: 1.3, fatk: 0.03, fdec: 0.15, keyTrack: 0.6, velCut: 0.6, scoop: [-0.7, 0.05], breath: 0.01 },
  // strings
  strings: { voice: 'synth', waves: [{ w: 'saw' }], uni: 3, uniDet: 14, uniDelay: 0.02, env: [0.18, 0.6, 0.85, 0.35], cut: 2400, q: 0.7, keyTrack: 0.4, vib: [5.4, 0.09, 0.3] },
  tremStrings: { voice: 'synth', waves: [{ w: 'saw' }], uni: 3, uniDet: 14, uniDelay: 0.01, env: [0.04, 0.3, 0.9, 0.2], cut: 2600, q: 0.7, keyTrack: 0.4, trem: [14, 0.55] },
  // keys and mallets
  epiano: { voice: 'fm', ratio: 1, index: 1.4, idxDec: 0.5, idxSus: 0.25, ratio2: 14, index2: 0.7, idx2Dec: 0.04, env: [0.002, 1.6, 0, 0.18], det: 4, trem: [4.5, 0.12], gain: 1.7 },
  clav: { voice: 'fm', ratio: 3, index: 2, idxDec: 0.12, idxSus: 0.3, env: [0.001, 0.4, 0.2, 0.05], drive: 0.4 },
  glock: { voice: 'bell', partials: [[1, 1, 1.6], [2.76, 0.32, 0.45], [5.4, 0.12, 0.12], [8.93, 0.05, 0.05]], click: 0.15, rel: 0.6 },
  vibes: { voice: 'bell', partials: [[1, 1, 2.6], [4, 0.22, 0.5], [10, 0.05, 0.15]], rel: 0.35, trem: [5.5, 0.32], gain: 1.2 },
  marimba: { voice: 'bell', partials: [[1, 1, 0.55], [4, 0.25, 0.12], [9.2, 0.06, 0.04]], click: 0.05, rel: 0.12 },
  toyPiano: { voice: 'bell', partials: [[1, 1, 0.9], [3.01, 0.4, 0.25], [5.2, 0.2, 0.08], [7.1, 0.1, 0.04]], click: 0.08, rel: 0.15 },
  organ: { voice: 'organ', click: 0.08, gain: 2 },
  // guitars and plucked
  steelGuitar: { voice: 'pluck', bright: 0.62, sustain: 3.2, pick: 0.13, rel: 0.12, gain: 1.8 },
  nylonGuitar: { voice: 'pluck', bright: 0.45, sustain: 2.6, pick: 0.18, damp: 0.08, rel: 0.12, gain: 1.8 },
  skank: { voice: 'pluck', bright: 0.75, mute: true, muteSus: 0.16, pick: 0.1, gain: 2.6 },
  crunchGuitar: { voice: 'pluck', bright: 0.7, sustain: 4, pick: 0.12, drive: 2.2, rel: 0.06, gain: 0.6 },
  harp: { voice: 'pluck', bright: 0.45, sustain: 2.2, pick: 0.25, gain: 1.8 },
  // basses
  upright: { voice: 'pluck', bright: 0.3, sustain: 1.3, pick: 0.2, damp: 0.15, rel: 0.06, gain: 2.4 },
  fingerBass: { voice: 'synth', waves: [{ w: 'saw', lvl: 0.55 }, { w: 'sine' }], env: [0.004, 0.5, 0.6, 0.06], cut: 520, q: 1.1, fenv: 1.6, fdec: 0.09, keyTrack: 0.5, velCut: 0.8 },
  rubberBass: { voice: 'synth', waves: [{ w: 'pulse', duty: 0.5 }, { w: 'sine', lvl: 0.6 }], env: [0.003, 0.25, 0.55, 0.05], cut: 260, q: 3.2, fenv: 3.2, fdec: 0.07, keyTrack: 0.6, velCut: 1, glide: 0.04 },
  fuzzBass: { voice: 'synth', waves: [{ w: 'saw' }, { w: 'pulse', duty: 0.4, det: 9 }, { w: 'sine', oct: -1, lvl: 0.7 }], env: [0.006, 0.4, 0.85, 0.08], cut: 700, q: 1.4, fenv: 1.2, fdec: 0.15, drive: 2.2 },
  // voices
  vocoder: { voice: 'vocal', env: [0.04, 0.3, 0.9, 0.2], vib: [4.8, 0.12, 0.3], morph: 0.4 },
  // ---- round 2: thicker and warmer (the owner: "thick", "edgy", "less nasally") ----
  fatBass: { voice: 'synth', waves: [{ w: 'saw' }, { w: 'saw', det: 7 }, { w: 'sine', lvl: 0.9 }, { w: 'sine', oct: -1, lvl: 0.15 }], env: [0.004, 0.35, 0.8, 0.07], cut: 650, q: 1.2, fenv: 1.4, fdec: 0.12, keyTrack: 0.4, velCut: 0.6, drive: 0.5, glide: 0.04 },
  buzzBass: { voice: 'synth', waves: [{ w: 'saw' }, { w: 'pulse', duty: 0.32, det: 11 }, { w: 'saw', det: -8 }, { w: 'sine', oct: -1, lvl: 0.35 }], env: [0.006, 0.5, 0.9, 0.1], cut: 1300, q: 1.6, fenv: 0.8, fdec: 0.2, keyTrack: 0.3, drive: 0.9, lp2: 3200, glide: 0.05 },
  pickBass: { voice: 'synth', waves: [{ w: 'saw', lvl: 0.8 }, { w: 'pulse', duty: 0.45, lvl: 0.4 }, { w: 'sine' }], env: [0.003, 0.45, 0.55, 0.06], cut: 900, q: 1.3, fenv: 1.8, fdec: 0.06, keyTrack: 0.5, velCut: 1, drive: 0.6, lp2: 3000 },
  warmLead: { voice: 'synth', waves: [{ w: 'saw' }, { w: 'saw', det: 11, lvl: 0.8 }, { w: 'tri', oct: -1, lvl: 0.35 }], env: [0.012, 0.4, 0.8, 0.18], cut: 2100, q: 1.3, fenv: 0.9, fdec: 0.25, keyTrack: 0.5, vib: [5.2, 0.12, 0.3], glide: 0.06, drive: 0.35, lp2: 5000 },
  hazeLead: { voice: 'synth', waves: [{ w: 'tri' }, { w: 'saw', det: 23, lvl: 0.45 }, { w: 'pulse', duty: 0.4, det: -17, lvl: 0.3 }], env: [0.02, 0.5, 0.75, 0.25], cut: 2400, q: 1.1, vib: [3.6, 0.22, 0.05], glide: 0.08, drive: 0.4, lp2: 4500 },
  stab: { voice: 'synth', waves: [{ w: 'saw' }, { w: 'saw', det: 13 }, { w: 'saw', det: -12 }], env: [0.003, 0.18, 0.25, 0.08], cut: 900, q: 1.5, fenv: 2.4, fdec: 0.07, keyTrack: 0.3, drive: 0.35 },
  brassFat: { voice: 'synth', waves: [{ w: 'saw' }, { w: 'saw', det: 9 }, { w: 'saw', det: -10 }], uni: 2, uniDet: 8, uniDelay: 0.014, env: [0.02, 0.3, 0.85, 0.1], cut: 950, q: 0.75, fenv: 1.6, fatk: 0.035, fdec: 0.25, keyTrack: 0.55, velCut: 1, vib: [5.4, 0.08, 0.32], scoop: [-0.7, 0.05], drive: 0.4, lp2: 4800, breath: 0.015 },
  bonesFat: { voice: 'synth', waves: [{ w: 'saw' }, { w: 'saw', det: 8 }, { w: 'tri', lvl: 0.6 }], uni: 2, uniDet: 7, uniDelay: 0.016, env: [0.03, 0.3, 0.85, 0.12], cut: 600, q: 0.75, fenv: 1.4, fatk: 0.05, fdec: 0.3, keyTrack: 0.6, velCut: 0.9, scoop: [-0.9, 0.07], glide: 0.08, drive: 0.35, lp2: 3500 },
  tenorSax: { voice: 'synth', waves: [{ w: 'saw' }, { w: 'tri', lvl: 0.5 }, { w: 'pulse', duty: 0.4, lvl: 0.25 }], env: [0.018, 0.3, 0.9, 0.08], cut: 1500, q: 1.2, fenv: 0.9, fatk: 0.03, fdec: 0.22, keyTrack: 0.6, velCut: 1.1, vib: [5, 0.12, 0.25], scoop: [-1.1, 0.07], glide: 0.035, breath: 0.035, drive: 0.5, lp2: 3600 },
  pluckSynth: { voice: 'synth', waves: [{ w: 'saw' }, { w: 'tri', lvl: 0.7 }, { w: 'saw', det: 9, lvl: 0.5 }], env: [0.002, 0.28, 0.0, 0.12], cut: 900, q: 1.4, fenv: 2.6, fdec: 0.09, keyTrack: 0.5, velCut: 0.8, drive: 0.3 },
  vocoLead: { voice: 'vocal', env: [0.03, 0.3, 0.9, 0.2], vib: [4.4, 0.1, 0.25], morph: 0.25, hiss: 0.02, gain: 1.3 },
  dustyKeys: { voice: 'fm', ratio: 1, index: 1.1, idxDec: 0.6, idxSus: 0.3, ratio2: 7, index2: 0.3, idx2Dec: 0.03, env: [0.003, 1.4, 0.15, 0.25], det: 7, trem: [5, 0.18], gain: 1.6 },
  grimeOrgan: { voice: 'organ', bars: [[0.5, 0.5], [1, 1], [1.5, 0.6], [2, 0.7], [3, 0.3]], click: 0.15, drive: 0.8, gain: 1.4 },
  // flutes
  flute: { voice: 'flute', vib: [5, 0.13, 0.28], air: 0.05, chiff: 0.3 },
  whistle: { voice: 'flute', harm: [1, 0.06, 0.02], vib: [5.6, 0.2, 0.15], air: 0.025, chiff: 0.12, env: [0.025, 0.3, 0.9, 0.08] },
};
