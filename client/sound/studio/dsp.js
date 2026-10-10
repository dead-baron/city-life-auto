// The studio's building blocks: the SNES output rate, a seeded random source (every render the same), pitch, band-
// limited oscillators, a state-variable filter, a biquad for EQ, envelopes and a soft clipper. Plain functions over
// Float32Arrays, no Web Audio: the same code renders a song in the browser (a worker, into one buffer) and in Node
// (tools/render-music.mjs, for listening to drafts).

export const SR = 32000;   // the SNES's own sample rate
export const TAU = Math.PI * 2;

// mulberry32: a small, fast, seeded generator in [0, 1)
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

export const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
export const dbToGain = (db) => Math.pow(10, db / 20);
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// PolyBLEP: the correction that takes the aliasing out of a saw's or a pulse's jump
export function blep(t, dt) {
  if (t < dt) { t /= dt; return t + t - t * t - 1; }
  if (t > 1 - dt) { t = (t - 1) / dt; return t * t + t + t + 1; }
  return 0;
}
export function sawAt(ph, dt) { return 2 * ph - 1 - blep(ph, dt); }
export function pulseAt(ph, dt, duty) { let v = ph < duty ? 1 : -1; v += blep(ph, dt); let p2 = ph - duty; if (p2 < 0) p2 += 1; v -= blep(p2, dt); return v; }
export function triAt(ph) { return ph < 0.5 ? 4 * ph - 1 : 3 - 4 * ph; }

// Topology-preserving state-variable filter (Simper): low, band and high pass at once; stable when swept
export class SVF {
  constructor(fc = 1000, q = 0.707) { this.ic1 = 0; this.ic2 = 0; this.lp = 0; this.bp = 0; this.hp = 0; this.set(fc, q); }
  set(fc, q) {
    const g = Math.tan(Math.PI * clamp(fc, 10, SR * 0.47) / SR);
    this.k = 1 / q; this.a1 = 1 / (1 + g * (g + this.k)); this.a2 = g * this.a1; this.a3 = g * this.a2;
  }
  run(x) {
    const v3 = x - this.ic2, v1 = this.a1 * this.ic1 + this.a2 * v3, v2 = this.ic2 + this.a2 * this.ic1 + this.a3 * v3;
    this.ic1 = 2 * v1 - this.ic1; this.ic2 = 2 * v2 - this.ic2;
    this.lp = v2; this.bp = v1; this.hp = x - this.k * v1 - v2;
    return v2;
  }
}

// RBJ biquad (peaking / shelves / pass): for a part's EQ
export class Biquad {
  constructor(type, f, q = 0.707, gainDb = 0) {
    const A = Math.pow(10, gainDb / 40), w = TAU * clamp(f, 10, SR * 0.47) / SR, cs = Math.cos(w), sn = Math.sin(w), al = sn / (2 * q);
    let b0, b1, b2, a0, a1, a2;
    if (type === 'peak') { b0 = 1 + al * A; b1 = -2 * cs; b2 = 1 - al * A; a0 = 1 + al / A; a1 = -2 * cs; a2 = 1 - al / A; }
    else if (type === 'low') { const s = 2 * Math.sqrt(A) * al; b0 = A * ((A + 1) - (A - 1) * cs + s); b1 = 2 * A * ((A - 1) - (A + 1) * cs); b2 = A * ((A + 1) - (A - 1) * cs - s); a0 = (A + 1) + (A - 1) * cs + s; a1 = -2 * ((A - 1) + (A + 1) * cs); a2 = (A + 1) + (A - 1) * cs - s; }
    else if (type === 'high') { const s = 2 * Math.sqrt(A) * al; b0 = A * ((A + 1) + (A - 1) * cs + s); b1 = -2 * A * ((A - 1) + (A + 1) * cs); b2 = A * ((A + 1) + (A - 1) * cs - s); a0 = (A + 1) - (A - 1) * cs + s; a1 = 2 * ((A - 1) - (A + 1) * cs); a2 = (A + 1) - (A - 1) * cs - s; }
    else if (type === 'lp') { b0 = (1 - cs) / 2; b1 = 1 - cs; b2 = (1 - cs) / 2; a0 = 1 + al; a1 = -2 * cs; a2 = 1 - al; }
    else if (type === 'hp') { b0 = (1 + cs) / 2; b1 = -(1 + cs); b2 = (1 + cs) / 2; a0 = 1 + al; a1 = -2 * cs; a2 = 1 - al; }
    else { b0 = al; b1 = 0; b2 = -al; a0 = 1 + al; a1 = -2 * cs; a2 = 1 - al; }   // 'bp'
    this.b0 = b0 / a0; this.b1 = b1 / a0; this.b2 = b2 / a0; this.a1 = a1 / a0; this.a2 = a2 / a0;
    this.x1 = 0; this.x2 = 0; this.y1 = 0; this.y2 = 0;
  }
  run(x) {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1; this.x1 = x; this.y2 = this.y1; this.y1 = y;
    return y;
  }
  apply(buf) { for (let i = 0; i < buf.length; i++) buf[i] = this.run(buf[i]); return buf; }
}

// ADSR as the SNES did it: a straight attack, then an exponential fall to the sustain level, and an exponential
// release once the key is let go. a, d, r in seconds (d and r are time constants), s 0-1. Returns the per-sample gain
// for nOn samples held plus the release tail (tail = r x 5).
export function envADSR(nOn, a, d, s, r) {
  const nTail = Math.ceil(Math.max(0.005, r) * 5 * SR), n = nOn + nTail, out = new Float32Array(n);
  const na = Math.max(1, Math.round(a * SR)), dk = d > 0 ? Math.exp(-1 / (d * SR)) : 0, rk = r > 0 ? Math.exp(-1 / (r * SR)) : 0;
  let v = 0;
  for (let i = 0; i < n; i++) {
    if (i < nOn) v = i < na ? Math.max(v, (i + 1) / na) : s + (v - s) * dk;
    else v *= rk;
    out[i] = v;
  }
  return out;
}

// A gentle saturator: unity at low level, rounding off toward +-1
export function soft(x, drive = 1) { if (drive <= 0) return x; const k = 1 + drive * 4; return Math.tanh(x * k) / Math.tanh(k); }

// Mix a mono buffer into a stereo pair at a start sample, with gain and equal-power pan (-1 left .. 1 right)
export function mixInto(L, R, buf, at, gain, pan) {
  const a = (clamp(pan, -1, 1) + 1) * Math.PI / 4, gl = Math.cos(a) * gain * Math.SQRT2, gr = Math.sin(a) * gain * Math.SQRT2;
  const n = Math.min(buf.length, L.length - at);
  for (let i = Math.max(0, -at); i < n; i++) { L[at + i] += buf[i] * gl; R[at + i] += buf[i] * gr; }
}

// A compressor for a part's channel (or two channels, linked): the level is followed with an attack and a release
// (s); over the threshold (dB under full scale, relative to the part's own loudest stretch when rel is set) it is
// turned down by the ratio; makeup brings the lot back up. Thickens drums and holds a bass steady.
export function compress(chs, o = {}) {
  const n = chs[0].length, at = Math.exp(-1 / ((o.att ?? 0.005) * SR)), rl = Math.exp(-1 / ((o.rel ?? 0.12) * SR)), ratio = o.ratio ?? 4;
  let peak = 1e-9;
  for (const c of chs) for (let i = 0; i < n; i++) { const a = Math.abs(c[i]); if (a > peak) peak = a; }
  const thr = peak * Math.pow(10, (o.thr ?? -12) / 20), mk = Math.pow(10, (o.makeup ?? 0) / 20);
  let env = 0;
  for (let i = 0; i < n; i++) {
    let lvl = 0;
    for (const c of chs) { const a = Math.abs(c[i]); if (a > lvl) lvl = a; }
    env = lvl > env ? at * env + (1 - at) * lvl : rl * env + (1 - rl) * lvl;
    const g = (env > thr ? Math.pow(env / thr, 1 / ratio - 1) : 1) * mk;
    for (const c of chs) c[i] *= g;
  }
}

// Short early reflections (a small room) added to a pair of channels: depth 0-1
export function room(L, R, depth = 0.3, size = 1) {
  const taps = [[0.0113, 0.55, 1], [0.0171, 0.45, -1], [0.0237, 0.38, 1], [0.0313, 0.3, -1], [0.0419, 0.22, 1], [0.0547, 0.15, -1]];
  const n = L.length, sL = L.slice(), sR = R.slice();
  for (const [dt, g, side] of taps) {
    const d = Math.round(dt * size * SR), gl = g * depth * (side > 0 ? 1 : 0.7), gr = g * depth * (side > 0 ? 0.7 : 1);
    for (let i = d; i < n; i++) { L[i] += sR[i - d] * gl; R[i] += sL[i - d] * gr; }
  }
}
