// The studio's drums and percussion, made by code: a kit (kicks, snares, claps, hats, cymbals, toms), Latin
// percussion (congas, bongos, timbales, cowbell, shaker, tambourine, claves, block) and orchestral timpani. Each hit
// is one mono buffer from its velocity; the seeded random source gives every hit a little life of its own.

import { SR, TAU, SVF, soft } from './dsp.js';

function buf(sec) { return new Float32Array(Math.max(1, Math.round(sec * SR))); }

// a metallic cluster (six detuned squares, the classic drum-machine cymbal), high-passed
function metal(n, freqs, R, hpF, bpF) {
  const out = new Float32Array(n), ph = freqs.map(() => R()), hp = new SVF(hpF, 0.7), bp = bpF ? new SVF(bpF, 0.9) : null;
  for (let i = 0; i < n; i++) {
    let x = 0;
    for (let k = 0; k < freqs.length; k++) { ph[k] += freqs[k] / SR; if (ph[k] >= 1) ph[k] -= 1; x += ph[k] < 0.5 ? 1 : -1; }
    x = x / freqs.length + (R() * 2 - 1) * 0.35;
    hp.run(x); x = hp.hp;
    if (bp) { bp.run(x); x = bp.bp * 1.6 + x * 0.4; }
    out[i] = x;
  }
  return out;
}
const HAT_F = [205.3, 304.4, 369.6, 522.7, 540.0, 800.0].map((f) => f * 1.9);
const RIDE_F = [245, 371, 433, 587, 666, 913].map((f) => f * 1.4);

function tone(n, f0, f1, pdec, adec, R, harm = 0) {
  const out = new Float32Array(n);
  let ph = R();
  for (let i = 0; i < n; i++) {
    const t = i / SR, f = f1 + (f0 - f1) * Math.exp(-t / pdec);
    ph += f / SR;
    out[i] = (Math.sin(TAU * ph) + harm * Math.sin(TAU * ph * 2.03)) * Math.exp(-t / adec);
  }
  return out;
}
function noiseHit(n, R, att, dec, filt) {
  const out = new Float32Array(n), f = filt ? new SVF(filt[0], filt[1]) : null;
  for (let i = 0; i < n; i++) {
    const t = i / SR, e = (att ? Math.min(1, t / att) : 1) * Math.exp(-t / dec);
    let x = R() * 2 - 1;
    if (f) { f.run(x); x = filt[2] === 'hp' ? f.hp : filt[2] === 'lp' ? f.lp : f.bp; }
    out[i] = x * e;
  }
  return out;
}
function add(a, b, g = 1) { const n = Math.min(a.length, b.length); for (let i = 0; i < n; i++) a[i] += b[i] * g; return a; }

export const DRUMS = {
  kick: (v, R) => { const n = buf(0.38).length, o = tone(n, 155, 50, 0.032, 0.2, R); add(o, noiseHit(240, R, 0, 0.003, [3000, 0.7, 'hp']), 0.5 * v); for (let i = 0; i < n; i++) o[i] = soft(o[i] * 1.2, 0.3); return o; },
  kick808: (v, R) => { const n = buf(0.9).length, o = tone(n, 120, 44, 0.05, 0.5, R); for (let i = 0; i < n; i++) o[i] = soft(o[i] * 1.4, 0.6); return o; },
  kickSoft: (v, R) => tone(buf(0.3).length, 110, 52, 0.025, 0.16, R),
  snare: (v, R) => { const n = buf(0.3).length, o = tone(n, 240, 185, 0.02, 0.07, R, 0.5); for (let i = 0; i < n; i++) o[i] *= 0.55; return add(o, noiseHit(n, R, 0, 0.11 + 0.05 * v, [1900, 0.6, 'hp']), 0.75 + 0.25 * v); },
  snareLo: (v, R) => { const o = DRUMS.snare(v, R); for (let i = 0; i < o.length; i++) { const q = Math.round(o[i] * 24) / 24; o[i] = soft(q * 1.6, 0.8); } for (let i = 1; i < o.length; i += 2) o[i] = o[i - 1]; return o; },
  clap: (v, R) => { const n = buf(0.32).length, o = new Float32Array(n), f = new SVF(1250, 1.6); for (let i = 0; i < n; i++) { const t = i / SR; let e = 0; for (const s of [0, 0.011, 0.022]) if (t >= s) e = Math.max(e, Math.exp(-(t - s) / 0.006)); e = Math.max(e, t > 0.03 ? Math.exp(-(t - 0.03) / 0.12) * 0.6 : 0); f.run(R() * 2 - 1); o[i] = f.bp * e * 2.2; } return o; },
  rim: (v, R) => add(tone(buf(0.06).length, 900, 820, 0.01, 0.018, R), noiseHit(buf(0.05).length, R, 0, 0.012, [1800, 2, 'bp']), 1.4),
  brush: (v, R) => noiseHit(buf(0.35).length, R, 0.03, 0.12, [5000, 0.5, 'lp']),
  snap: (v, R) => noiseHit(buf(0.08).length, R, 0, 0.012, [2400, 3, 'bp']),
  hat: (v, R) => { const n = buf(0.09).length, o = metal(n, HAT_F, R, 7000, 10000); for (let i = 0; i < n; i++) o[i] *= Math.exp(-(i / SR) / (0.018 + 0.02 * v)); return o; },
  ohat: (v, R) => { const n = buf(0.6).length, o = metal(n, HAT_F, R, 6500, 9500); for (let i = 0; i < n; i++) o[i] *= Math.exp(-(i / SR) / 0.22); return o; },
  pedal: (v, R) => { const n = buf(0.06).length, o = metal(n, HAT_F, R, 7500, 10000); for (let i = 0; i < n; i++) o[i] *= Math.exp(-(i / SR) / 0.012) * 0.7; return o; },
  ride: (v, R) => { const n = buf(1.6).length, o = metal(n, RIDE_F, R, 4500, 7000); const bell = tone(n, 2650, 2650, 1, 0.5, R); for (let i = 0; i < n; i++) o[i] = o[i] * 0.55 * Math.exp(-(i / SR) / 0.55) + bell[i] * 0.08; return o; },
  rideBell: (v, R) => { const n = buf(1.4).length, o = tone(n, 2650, 2650, 1, 0.6, R, 0.4); add(o, metal(n, RIDE_F, R, 5000), 0.15); return o; },
  crash: (v, R) => { const n = buf(2.2).length, o = metal(n, RIDE_F.map((f) => f * 1.3), R, 3200); for (let i = 0; i < n; i++) o[i] *= Math.exp(-(i / SR) / 0.7) * 0.9; return o; },
  tomH: (v, R) => add(tone(buf(0.45).length, 330, 210, 0.04, 0.2, R), noiseHit(buf(0.05).length, R, 0, 0.01, [1500, 0.8, 'bp']), 0.3),
  tomM: (v, R) => add(tone(buf(0.5).length, 250, 160, 0.045, 0.24, R), noiseHit(buf(0.05).length, R, 0, 0.01, [1300, 0.8, 'bp']), 0.3),
  tomL: (v, R) => add(tone(buf(0.6).length, 180, 110, 0.05, 0.3, R), noiseHit(buf(0.05).length, R, 0, 0.01, [1000, 0.8, 'bp']), 0.3),
  congaH: (v, R) => add(tone(buf(0.3).length, 370, 330, 0.012, 0.13, R, 0.15), noiseHit(buf(0.03).length, R, 0, 0.006, [2500, 1, 'bp']), 0.25),
  congaL: (v, R) => add(tone(buf(0.35).length, 245, 215, 0.014, 0.17, R, 0.15), noiseHit(buf(0.03).length, R, 0, 0.006, [2000, 1, 'bp']), 0.25),
  congaSlap: (v, R) => add(tone(buf(0.12).length, 420, 360, 0.008, 0.04, R), noiseHit(buf(0.08).length, R, 0, 0.02, [1700, 1.2, 'bp']), 1.3),
  bongoH: (v, R) => add(tone(buf(0.16).length, 600, 520, 0.008, 0.06, R, 0.2), noiseHit(buf(0.02).length, R, 0, 0.004, [3500, 1, 'bp']), 0.3),
  bongoL: (v, R) => add(tone(buf(0.2).length, 430, 380, 0.008, 0.08, R, 0.2), noiseHit(buf(0.02).length, R, 0, 0.004, [3000, 1, 'bp']), 0.3),
  timbale: (v, R) => { const n = buf(0.5).length, o = tone(n, 690, 640, 0.01, 0.16, R, 0.5); add(o, metal(n, [690, 1012, 1350, 1790], R, 1200), 0.12); return o; },
  cowbell: (v, R) => { const n = buf(0.35).length, o = new Float32Array(n), bp = new SVF(2100, 1.5); let a = R(), b = R(); for (let i = 0; i < n; i++) { const t = i / SR; a += 562 / SR; b += 845 / SR; const x = (a % 1 < 0.5 ? 1 : -1) + (b % 1 < 0.5 ? 1 : -1); bp.run(x); o[i] = bp.bp * (0.6 * Math.exp(-t / 0.02) + 0.4 * Math.exp(-t / 0.15)); } return o; },
  shaker: (v, R) => noiseHit(buf(0.12).length, R, 0.008, 0.035, [7500, 1, 'bp']),
  tamb: (v, R) => { const n = buf(0.3).length, o = noiseHit(n, R, 0.002, 0.09, [7000, 0.7, 'hp']); const j = [5300, 6100, 7400, 8800, 9600]; for (let i = 0; i < n; i++) { const t = i / SR; let x = 0; for (const f of j) x += Math.sin(TAU * f * t + f); o[i] += x * 0.06 * Math.exp(-t / 0.12) * (1 + 0.5 * Math.sin(TAU * 37 * t)); } return o; },
  clave: (v, R) => tone(buf(0.1).length, 2500, 2480, 0.01, 0.025, R),
  block: (v, R) => add(tone(buf(0.1).length, 1050, 1000, 0.01, 0.03, R), tone(buf(0.06).length, 1820, 1800, 0.01, 0.015, R), 0.4),
  timp: (v, R, f = 98) => { const n = buf(2.4).length, o = new Float32Array(n); const P = [[1, 1, 1.6], [1.5, 0.45, 0.9], [1.99, 0.28, 0.6], [2.44, 0.14, 0.4]]; const ph = P.map(() => R()); for (let i = 0; i < n; i++) { const t = i / SR, drop = 1 + 0.02 * Math.exp(-t / 0.05); let x = 0; for (let k = 0; k < P.length; k++) { ph[k] += f * P[k][0] * drop / SR; x += Math.sin(TAU * ph[k]) * P[k][1] * Math.exp(-t / P[k][2]); } o[i] = x; } return add(o, noiseHit(buf(0.08).length, R, 0, 0.02, [400, 0.8, 'lp']), 0.6); },
  swell: (v, R, len = 2) => { const n = buf(len + 0.6).length, o = metal(n, RIDE_F.map((f) => f * 1.2), R, 3500); for (let i = 0; i < n; i++) { const t = i / SR; o[i] *= t < len ? Math.pow(t / len, 2) : Math.exp(-(t - len) / 0.25); } return o; },
};

// where each sits in the stereo picture (the drummer's view, a little narrow, as SNES mixes were) and how loud
export const KIT = {
  kick: [0, 0.95], kick808: [0, 0.95], kickSoft: [0, 0.8], snare: [0.05, 0.62], snareLo: [0.05, 0.62], clap: [0.05, 0.5], rim: [0.1, 0.38], brush: [0.05, 0.3], snap: [-0.15, 0.35],
  hat: [0.3, 0.26], ohat: [0.3, 0.24], pedal: [0.3, 0.2], ride: [-0.35, 0.24], rideBell: [-0.35, 0.22], crash: [-0.25, 0.3],
  tomH: [0.2, 0.55], tomM: [-0.05, 0.55], tomL: [-0.25, 0.6],
  congaH: [0.35, 0.42], congaL: [0.25, 0.45], congaSlap: [0.35, 0.4], bongoH: [-0.35, 0.36], bongoL: [-0.3, 0.36], timbale: [-0.2, 0.36], cowbell: [-0.2, 0.24], shaker: [0.45, 0.16], tamb: [-0.45, 0.18], clave: [0.4, 0.26], block: [0.3, 0.3],
  timp: [-0.1, 0.85], swell: [-0.2, 0.26],
};
