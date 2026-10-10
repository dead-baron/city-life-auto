// Vehicles (the owner's notes: "every vehicle its own engine"; sirens, horns, tyres). A few engine voices - each a
// small synth: an oscillator pair for the engine's note, a band of the shared noise for its rasp, a low-pass for its
// timbre, an amplitude wobble at the firing rate (the putter of an outboard, the lope of a V8). A voice's nodes are
// made when it takes a vehicle and let go when it gives it up; a siren, a horn and a tyre squeal are added to it only
// while they sound (measured: the old always-running voices, eight oscillators each, were over half the sound's
// work on a phone - tools/sound/bench.py). The nearest, loudest vehicles (yours first) get the voices; a voice
// follows its vehicle's speed and throttle, the siren bends as it passes (Doppler, straight into the frequencies).
// Trains rumble and clack; level crossings ring.
import { VEHICLE_BY_INDEX } from '../../shared/vehicles.js';
import { VF } from '../../shared/constants.js';
import { spatial } from './pool.js';
import { engineOn } from './events.js';
import { setp, krate } from './engine.js';

// The engine classes: f0..f1 the engine note from idle to the red line (Hz), gears, the wave, the sub-octave's level,
// the rasp (noise level and band), the timbre's low-pass from idle to full throttle, the firing wobble (am: depth,
// amr: its rate against the note), the volume, and the horn's notes.
const P = {
  small: { f0: 30, f1: 118, gears: 4, wave: 'buzz', sub: 0.35, noise: 0.16, nf: 1500, lp0: 480, lp1: 2300, q: 2, am: 0.15, amr: 1, vol: 0.3, horn: [523, 659], hw: 'square' },
  sedan: { f0: 26, f1: 96, gears: 4, wave: 'saw8', sub: 0.5, noise: 0.08, nf: 900, lp0: 360, lp1: 1500, q: 1.5, am: 0.08, amr: 1, vol: 0.3, horn: [392, 494], hw: 'square' },
  sports: { f0: 38, f1: 195, gears: 6, wave: 'buzz', sub: 0.4, noise: 0.14, nf: 2300, lp0: 600, lp1: 3800, q: 3, am: 0.1, amr: 1, vol: 0.38, horn: [440, 554], hw: 'square' },
  muscle: { f0: 22, f1: 118, gears: 4, wave: 'saw8', sub: 0.85, noise: 0.14, nf: 700, lp0: 300, lp1: 1800, q: 2.5, am: 0.4, amr: 0.5, vol: 0.4, horn: [330, 415], hw: 'saw8' },
  police: { f0: 25, f1: 130, gears: 5, wave: 'saw8', sub: 0.7, noise: 0.1, nf: 900, lp0: 380, lp1: 2400, q: 2, am: 0.2, amr: 0.5, vol: 0.38, horn: [370, 466], hw: 'saw8' },
  van: { f0: 24, f1: 86, gears: 5, wave: 'saw8', sub: 0.6, noise: 0.2, nf: 700, lp0: 320, lp1: 1250, q: 1.4, am: 0.16, amr: 1, vol: 0.34, horn: [349, 440], hw: 'square' },
  truck: { f0: 16, f1: 58, gears: 8, wave: 'saw8', sub: 0.9, noise: 0.32, nf: 520, lp0: 220, lp1: 950, q: 1.2, am: 0.45, amr: 1, vol: 0.44, horn: [185, 233, 277], hw: 'saw8' },
  bus: { f0: 15, f1: 52, gears: 6, wave: 'saw8', sub: 0.9, noise: 0.3, nf: 480, lp0: 200, lp1: 850, q: 1.2, am: 0.4, amr: 1, vol: 0.44, horn: [196, 247, 294], hw: 'saw8' },
  moto: { f0: 44, f1: 235, gears: 5, wave: 'buzz', sub: 0.2, noise: 0.22, nf: 2600, lp0: 700, lp1: 4300, q: 3, am: 0.55, amr: 1, vol: 0.36, horn: [622, 784], hw: 'square' },
  outboard: { f0: 20, f1: 96, gears: 0, wave: 'buzz', sub: 0.4, noise: 0.28, nf: 900, lp0: 420, lp1: 1900, q: 1.5, am: 0.75, amr: 1, vol: 0.36, boat: 1, horn: [110, 139], hw: 'saw8' },
  dinghy: { f0: 24, f1: 70, gears: 0, wave: 'buzz', sub: 0.3, noise: 0.25, nf: 1000, lp0: 400, lp1: 1500, q: 1.5, am: 0.85, amr: 1, vol: 0.3, boat: 1, horn: [147, 185], hw: 'square' },
  jetski: { f0: 46, f1: 205, gears: 0, wave: 'buzz', sub: 0.2, noise: 0.3, nf: 2200, lp0: 700, lp1: 3500, q: 2.5, am: 0.4, amr: 1, vol: 0.34, boat: 1, horn: [622, 784], hw: 'square' },
  ship: { f0: 9, f1: 22, gears: 0, wave: 'saw8', sub: 1, noise: 0.22, nf: 320, lp0: 150, lp1: 380, q: 1, am: 0.6, amr: 1, vol: 0.5, boat: 1, horn: [73, 92], hw: 'saw8' },
  pedal: { pedal: 1, vol: 0.14, nf: 5200 },
  // the motorcycles (task #366): a V-twin's slow lumpy burble (a deep note, a big wobble at half the firing rate), a sport
  // bike's four-cylinder scream (high and smooth to a high red line), a scooter's thin buzz, a dirt bike's two-stroke
  // ring (a nasal, wobbling ring-ding with lots of rasp), a café racer's single thump
  vtwin: { f0: 22, f1: 120, gears: 5, wave: 'saw8', sub: 0.8, noise: 0.18, nf: 700, lp0: 280, lp1: 1700, q: 2.2, am: 0.7, amr: 0.5, vol: 0.4, horn: [392, 466], hw: 'square' },
  sportbike: { f0: 52, f1: 310, gears: 6, wave: 'buzz', sub: 0.15, noise: 0.18, nf: 3200, lp0: 900, lp1: 5200, q: 3.5, am: 0.12, amr: 1, vol: 0.38, horn: [659, 831], hw: 'square' },
  scooter: { f0: 60, f1: 190, gears: 1, wave: 'buzz', sub: 0.1, noise: 0.24, nf: 3600, lp0: 900, lp1: 3000, q: 2, am: 0.3, amr: 1, vol: 0.26, horn: [784, 988], hw: 'square' },
  twostroke: { f0: 48, f1: 260, gears: 4, wave: 'buzz', sub: 0.12, noise: 0.34, nf: 3000, lp0: 1000, lp1: 4600, q: 5, am: 0.5, amr: 1, vol: 0.34, horn: [698, 880], hw: 'square' },
  thumper: { f0: 30, f1: 150, gears: 5, wave: 'saw8', sub: 0.5, noise: 0.2, nf: 1400, lp0: 450, lp1: 2600, q: 2.5, am: 0.55, amr: 1, vol: 0.36, horn: [587, 740], hw: 'square' },
};
export const ENGINE_CLASS = {
  compact: 'small', sedan: 'sedan', taxi: 'sedan', sports: 'sports', pickup: 'muscle', flatbed: 'truck', van: 'van', bus: 'bus',
  police: 'police', swat: 'truck', ambulance: 'van', armored: 'truck', bike: 'sportbike', policebike: 'moto', fbi: 'police', army: 'truck',
  speedboat: 'outboard', policeboat: 'outboard', dinghy: 'dinghy', jetski: 'jetski', ferry: 'ship', waterbus: 'ship',
  boxtruck: 'truck', dumptruck: 'truck', mixer: 'truck', tanker: 'truck', garbage: 'truck', firetruck: 'truck', towtruck: 'truck',
  bicycle: 'pedal', cruiser: 'pedal', mtb: 'pedal', roadbike: 'pedal', bmx: 'pedal', cargobike: 'pedal',
  vtwin: 'vtwin', tourer: 'vtwin', chopper: 'vtwin', bobber: 'vtwin', bagger: 'vtwin', trike: 'vtwin', ratbike: 'vtwin',
  caferacer: 'thumper', dirtbike: 'twostroke', scooter: 'scooter',
};
export const SIREN_KIND = { police: 'police', policebike: 'police', fbi: 'police', swat: 'police', policeboat: 'police', ambulance: 'ambulance', firetruck: 'fire' };
const AIR_BRAKES = new Set(['truck', 'bus']);
// the tyres' screech: its level at full slide (tools/sound/bench.py tyres: a few dB over your own engine); how hard it
// screeches, 0-1, from what the server says (sliding: VF.DRIFT) and what it looks like here - going sideways at speed, or
// spinning on the spot with the engine on for half a second (a burnout). A hard start in a straight line, also VF.DRIFT
// (it passes through the low speeds in a moment), is silent.
export const TYRE_LEVEL = 0.08;
export function screech(st, p) {
  if (!(st.flags & VF.DRIFT) || (p.pedal && st.spd < 60)) return 0;
  if (st.spd < 40) return st.on && !p.boat && !p.pedal && st.burnT > 0.5 ? 0.75 : 0;
  return Math.max(0, Math.min(1, (st.side - 60) / 200)) * Math.min(1, st.spd / 160);
}
const RANGE = 1000, EAR = RANGE * RANGE;

export class VehicleSounds {
  constructor(E, { voices = 4, level = 1 } = {}) {
    this.E = E; this.ctx = E.ctx;
    this.level = level;   // (the engines' and the trains' level against the effects: tools/sound/bench.py)
    this.states = new Map();
    this.sp = { d: 0, gain: 0, pan: 0, lp: 0 };
    this.noise = null;   // the tyres' and the rasp's noise, shared (made with the first voice)
    this.voices = [];
    for (let i = 0; i < voices; i++) this.voices.push({ veh: 0, n: null, cls: null, quietAt: 0, sirN: null, hornN: null, tyreN: null });
    this.nextAssign = 0; this.nextParam = 0; this.nextXing = 0; this.nextGc = 0;
    this.train = null;
  }
  noiseSrc() {
    if (!this.noise) { const s = krate(this.ctx.createBufferSource()); s.buffer = this.E.buf.white; s.loop = true; s.start(); this.noise = s; }
    return this.noise;
  }
  // ---- a voice's nodes: made when it takes a vehicle, let go when it gives it up ----
  g(v = 0) { const n = this.ctx.createGain(); n.gain.value = v; return n; }
  osc(w) { const o = krate(this.ctx.createOscillator()), W = this.E.waves[w]; if (W) o.setPeriodicWave(W); else o.type = w; return o; }
  bq(type, f, q) { const n = krate(this.ctx.createBiquadFilter()); n.type = type; n.frequency.value = f; n.Q.value = q; return n; }
  // the engine: its note (an oscillator and a sub-octave, unless it's pedalled), a band of noise for its rasp, a low-pass
  // for its timbre, a wobble at the firing rate -> the strip: a low-pass for distance -> pan -> level -> effects
  build(v, cls, t) {
    const c = this.ctx, p = P[cls] || P.sedan, n = { src: [], all: [] };
    const keep = (...a) => { for (const x of a) if (x) n.all.push(x); };
    n.lp = this.bq('lowpass', 8000, 0.7); n.out = this.g(0); n.pan = c.createStereoPanner ? krate(c.createStereoPanner()) : null;
    if (n.pan) { n.lp.connect(n.pan); n.pan.connect(n.out); } else n.lp.connect(n.out);
    n.out.connect(this.E.mix.sfx);
    n.filt = this.bq('lowpass', p.lp0 || 600, p.q || 1);
    n.amp = this.g(0.7); n.lfo = this.osc('sine'); n.amd = this.g(0); n.eng = this.g(0);
    n.lfo.connect(n.amd); n.amd.connect(n.amp.gain);
    n.filt.connect(n.amp); n.amp.connect(n.eng); n.eng.connect(n.lp);
    n.nf = this.bq('bandpass', p.nf || 1000, p.pedal ? 1.2 : 0.9); n.ng = this.g(0);
    this.noiseSrc().connect(n.nf); n.nf.connect(n.ng); n.ng.connect(n.filt);
    n.lfo.start(t); n.src.push(n.lfo);
    if (!p.pedal) {
      n.a = this.osc(p.wave); n.b = this.osc('triangle'); n.ga = this.g(0.6); n.gb = this.g(p.sub * 0.6);
      n.a.connect(n.ga); n.b.connect(n.gb); n.ga.connect(n.filt); n.gb.connect(n.filt);
      n.a.start(t); n.b.start(t); n.src.push(n.a, n.b);
    }
    keep(n.lp, n.out, n.pan, n.filt, n.amp, n.lfo, n.amd, n.eng, n.nf, n.ng, n.a, n.b, n.ga, n.gb);
    v.n = n; v.cls = cls; v.sirN = null; v.hornN = null; v.tyreN = null;
  }
  // let a part's nodes go: sources stopped at `when`, everything disconnected just after
  letGo(part, when) {
    if (!part) return;
    const E = this.E;
    for (const s of part.src) { try { s.stop(when); } catch { /* stopped */ } }
    for (const x of part.all) E.trash.push(x, when + 0.05);
    if (this.noise) for (const x of part.fed || (part.nf ? [part.nf] : [])) { try { this.noise.disconnect(x); } catch { /* gone */ } }
  }
  release(v, t) {   // the voice fades out and its nodes go
    if (!v.n) return;
    setp(v.n.out.gain, 0, t, 0.04);
    for (const part of [v.sirN, v.hornN, v.tyreN]) this.letGo(part, t + 0.25);
    this.letGo(v.n, t + 0.25);
    v.n = null; v.sirN = null; v.hornN = null; v.tyreN = null; v.cls = null;
  }
  // the siren: an oscillator swept by its own slow LFO (made while it wails)
  siren(v, kind, t) {
    if (v.sirN && v.sirN.kind === kind) return v.sirN;
    if (v.sirN) { this.letGo(v.sirN, t + 0.1); v.sirN.g.gain.setTargetAtTime(0, t, 0.03); }
    const s = this.osc(kind === 'fire' ? 'organ' : kind === 'ambulance' ? 'pulse12' : 'soft'), sl = this.osc('sine'), sld = this.g(0), g = this.g(0);
    s.frequency.value = 900; sl.connect(sld); sld.connect(s.frequency); s.connect(g); g.connect(v.n.lp);
    s.start(t); sl.start(t);
    v.sirN = { kind, s, sl, sld, g, src: [s, sl], all: [s, sl, sld, g] };
    return v.sirN;
  }
  // the horn: its two or three notes (made while it sounds)
  horn(v, p, dop, t) {
    if (v.hornN) return v.hornN;
    const hn = p.horn || [440, 554], hf = this.bq('lowpass', 2200, 0.7), g = this.g(0), src = [];
    for (const f of hn) { const o = this.osc(p.hw === 'saw8' ? 'saw8' : 'sq9'); o.frequency.value = f * dop; o.connect(hf); o.start(t); src.push(o); }
    hf.connect(g); g.connect(v.n.lp);
    v.hornN = { g, scale: hn.length > 2 ? 0.05 : 0.07, src, all: [...src, hf, g] };
    return v.hornN;
  }
  // the tyres (#373: it was a band of noise - a whoosh): rubber screeching on the road - two pitched tones, a little
  // apart and out of tune, their pitch juddering with the rubber's stick-slip and their level chattering, through a band
  // that gives them their bite, over a hiss of smoke. A boat's spray, a bike's skid: a band of the noise. Made while it
  // slides (params(): sideways, or spinning on the spot - not a hard start in a straight line).
  tyres(v, road) {
    if (v.tyreN) return v.tyreN;
    const g = this.g(0), noise = this.noiseSrc(), T = { g, src: [], all: [g], fed: [], at: 0 };
    if (road) {
      const a = this.osc('pulse25'), b = this.osc('soft'), am = this.g(0.6), bite = this.bq('bandpass', 1400, 0.8);
      const jl = this.bq('lowpass', 26, 0.7), jg = this.g(1600), cl = this.bq('lowpass', 13, 0.7), cg = this.g(16);
      const hiss = this.bq('bandpass', 3200, 1.4), hg = this.g(0.3);
      noise.connect(jl); jl.connect(jg); jg.connect(a.frequency); jg.connect(b.frequency);   // (the judder: about +-40 Hz)
      noise.connect(cl); cl.connect(cg); cg.connect(am.gain);                                 // (the chatter)
      noise.connect(hiss); hiss.connect(hg); hg.connect(g);                                    // (the smoke)
      a.connect(am); b.connect(am); am.connect(bite); bite.connect(g);
      a.start(); b.start();
      Object.assign(T, { a, b, hg });
      T.src.push(a, b); T.fed.push(jl, cl, hiss); T.all.push(a, b, am, bite, jl, jg, cl, cg, hiss, hg);
    } else {
      const nf = this.bq('bandpass', 1700, 7);
      noise.connect(nf); nf.connect(g);
      T.nf = nf; T.fed.push(nf); T.all.push(nf);
    }
    g.connect(v.n.lp);
    return (v.tyreN = T);
  }

  update(F, S, dt) {
    const E = this.E, L = E.listener, t = this.ctx.currentTime;
    // ---- each vehicle in earshot: its speed, throttle and engine state ----
    const mine = S.pred && S.pred.kind === 'veh' ? S.ctrlId : 0;
    if (mine !== this.mine) { const was = this.states.get(this.mine); if (was) was.mine = false; this.mine = mine; }   // (out of your car: it's just a car)
    for (const v of F.vehs) {
      const def = VEHICLE_BY_INDEX[v.d && v.d.m];
      if (!def) continue;
      const dx = v.rx - L.x, dy = v.ry - L.y, d2 = dx * dx + dy * dy;
      let st = this.states.get(v.id);
      if (d2 > EAR && v.id !== mine) { if (st) st.seen = 0; continue; }
      if (!st) { st = { x: v.rx, y: v.ry, spd: 0, prev: 0, thr: 0, rpm: 0, d: Math.sqrt(d2), dop: 1, on: v.id === mine || engineOn(v), horn: false, bellAt: 0, fastAt: -9, seen: t, voice: null, cls: ENGINE_CLASS[def.id] || 'sedan', def, tune: 0.95 + 0.1 * ((Math.imul(v.id, 2654435761) >>> 0) / 4294967296) }; this.states.set(v.id, st); }   // (tune: each one a little its own)
      let mx = v.rx - st.x, my = v.ry - st.y, mv = Math.hypot(mx, my);
      if (mv > 300) { mv = 0; mx = 0; my = 0; }   // (a teleport)
      st.x = v.rx; st.y = v.ry;
      const k = 1 - Math.exp(-6 * dt), idt = 1 / Math.max(dt, 1e-3);
      st.prev = st.spd;
      st.spd += (mv * idt - st.spd) * k;
      // how fast it's going sideways (to the way it faces): a slide - the tyres screech
      st.vx = (st.vx || 0) + (mx * idt - (st.vx || 0)) * k; st.vy = (st.vy || 0) + (my * idt - (st.vy || 0)) * k;
      const ra = v.ra ?? Math.atan2(st.vy, st.vx);
      st.side = Math.abs(-Math.sin(ra) * st.vx + Math.cos(ra) * st.vy);
      st.burnT = (v.flags & VF.DRIFT) && st.spd < 40 ? (st.burnT || 0) + dt : 0;   // (how long it's been spinning on the spot)
      const acc = (st.spd - st.prev) / Math.max(dt, 1e-3);
      const on = v.id === mine || engineOn(v) || (!!def.ferry && !(v.flags & (VF.WRECK | VF.DEAD)));   // (the ferries run their timetable with nobody at the wheel)
      if (on && !st.on && Math.sqrt(d2) < 700 && st.cls !== 'pedal' && !P[st.cls].boat && st.spd < 30) E.play('enginestart', v.rx, v.ry, 0.7, v.id === mine ? MINE : null);
      st.on = on;
      const thrT = !on ? 0 : (v.flags & VF.BRAKE) ? 0.08 : Math.max(0.12, Math.min(1, 0.3 + acc / Math.max(60, def.accel) * 1.4 + (st.spd > 40 ? 0.15 : 0)));
      st.thr += (thrT - st.thr) * (1 - Math.exp(-5 * dt));
      // the engine's note: up through the gears (it drops at each shift), straight up for boats
      const p = P[st.cls];
      const sf = Math.min(1.2, st.spd / Math.max(100, def.max));
      let rpm;
      if (!p.gears) rpm = Math.min(1, 0.06 + 0.9 * Math.pow(sf, 0.8) + st.thr * 0.12);
      else { const gf = sf * p.gears, gear = Math.min(p.gears - 1, Math.floor(gf)), w = gf - gear; rpm = st.spd < 12 ? 0.02 + st.thr * 0.12 : Math.min(1, 0.22 + 0.62 * (gear === p.gears - 1 ? Math.min(1, gf - gear) : w) + st.thr * 0.16); }
      st.rpm += (rpm - st.rpm) * (1 - Math.exp(-11 * dt));
      // Doppler: closing in raises the pitch, going away lowers it
      const d = Math.sqrt(d2), vr = (d - st.d) / Math.max(dt, 1e-3);
      st.d = d;
      const dop = Math.max(0.86, Math.min(1.14, 1 - vr / 2600));
      st.dop += (dop - st.dop) * (1 - Math.exp(-4 * dt));
      // the horn (a bicycle rings its bell instead), air brakes hissing as a truck or bus stops
      st.horn = !!(v.flags & VF.HORN);
      if (st.horn && p.pedal && t > st.bellAt) { E.play('bikebell', v.rx, v.ry, 0.8); st.bellAt = t + 0.6; }
      if (st.spd > 60) st.fastAt = t;
      if (AIR_BRAKES.has(st.cls) && on && st.spd < 8 && t - st.fastAt < 3 && st.fastAt > 0) { E.play('airbrake', v.rx, v.ry, 0.7); st.fastAt = -9; }
      st.flags = v.flags; st.seen = t; st.mine = v.id === mine;
      st.sir = (v.flags & VF.SIREN) ? SIREN_KIND[def.id] || 'police' : null;
    }
    // ---- who gets a voice (a few times a second) ----
    if (t >= this.nextAssign) { this.nextAssign = t + 0.2; this.assign(t); }
    // ---- the voices follow their vehicles ----
    if (t >= this.nextParam) { this.nextParam = t + 1 / 30; this.params(t); }
    this.trains(F, S, dt, t);
    if (t >= this.nextXing) { this.nextXing = t + 0.5; this.crossings(S); }
    if (t >= this.nextGc) { this.nextGc = t + 2; for (const [id, st] of this.states) if (t - st.seen > 1.5) { if (st.voice) st.voice.veh = 0; this.states.delete(id); } }
  }
  score(st) {
    const near = Math.max(0, 1 - st.d / RANGE);
    if (!st.on && !st.horn && !st.sir) return st.spd > 30 && st.cls === 'pedal' ? near * 0.5 : -1;   // (a parked car is silent)
    return (st.mine ? 10 : 0) + (st.horn ? 2 : 0) + (st.sir ? 2 : 0) + near * (0.5 + st.thr) + (st.spd > 40 ? 0.3 : 0);
  }
  assign(t) {
    // the best few vehicles; one keeping its voice wins ties (no flicker between two equals)
    const want = [];
    for (const [id, st] of this.states) {
      if (st.seen < t - 0.5) continue;
      const s = this.score(st) + (st.voice ? 0.15 : 0);
      if (s > 0) want.push([s, id, st]);
    }
    want.sort((a, b) => b[0] - a[0]);
    const n = this.voices.length, keep = new Set();
    for (let i = 0; i < Math.min(n, want.length); i++) keep.add(want[i][1]);
    for (const v of this.voices) if (v.veh && !keep.has(v.veh)) { const st = this.states.get(v.veh); if (st) st.voice = null; v.veh = 0; v.quietAt = t; this.release(v, t); }
    for (let i = 0; i < Math.min(n, want.length); i++) {
      const [, id, st] = want[i];
      if (st.voice) continue;
      const v = this.voices.find((q) => !q.veh);
      if (!v) break;
      if (v.n) this.release(v, t);
      v.veh = id; st.voice = v;
      this.build(v, st.cls, t);
    }
  }
  params(t) {
    const E = this.E, L = E.listener, sp = this.sp, tc = 0.04;
    for (const v of this.voices) {
      if (!v.veh || !v.n) continue;
      const st = this.states.get(v.veh);
      if (!st) { v.veh = 0; v.quietAt = t; this.release(v, t); continue; }
      const p = P[st.cls] || P.sedan, n = v.n;
      spatial(st.x - L.x, st.y - L.y, RANGE, sp);
      let lp = sp.lp, g = sp.gain;
      if (st.mine) { g = Math.max(g, 0.9); lp = 18000; }
      if (L.inside && !st.mine) { lp = Math.min(lp, 800); g *= 0.45; }
      setp(n.out.gain, g * (st.mine ? 1 : 0.8) * this.level, t, tc);
      setp(n.lp.frequency, lp, t, tc);
      if (n.pan) setp(n.pan.pan, st.mine ? sp.pan * 0.3 : sp.pan, t, tc);
      const dop = st.dop;
      // the engine
      if (p.pedal) {   // a bicycle: the chain ticking as it's pedalled, the freewheel's faster, softer tick coasting
        const moving = st.spd > 20, coast = st.thr < 0.2;
        setp(n.lfo.frequency, coast ? 16 : Math.max(2, st.spd / 22), t, 0.1);
        setp(n.amd.gain, 0.5, t, 0.1); setp(n.amp.gain, 0.5, t, 0.1);
        setp(n.ng.gain, moving ? (coast ? 0.05 : 0.1) : 0, t, 0.08);
        setp(n.filt.frequency, 9000, t, 0.1);
        setp(n.eng.gain, p.vol, t, 0.1);
      } else if (st.on) {
        const f = (p.f0 + (p.f1 - p.f0) * st.rpm) * st.tune;
        setp(n.a.frequency, f * dop, t, tc); setp(n.b.frequency, f * dop / 2, t, tc);
        setp(n.filt.frequency, p.lp0 + (p.lp1 - p.lp0) * (0.35 * st.rpm + 0.65 * st.thr), t, tc);
        setp(n.lfo.frequency, f * p.amr, t, tc);
        const am = p.am * (p.boat ? 1 - 0.5 * st.rpm : 1);
        setp(n.amd.gain, am * 0.5, t, tc); setp(n.amp.gain, 1 - am * 0.5, t, tc);
        setp(n.ng.gain, p.noise * (0.5 + st.thr) + (p.boat ? Math.min(0.5, st.spd / 900) : 0), t, tc);   // (a boat's wash rises with its speed)
        setp(n.nf.frequency, p.nf * (p.boat ? 0.8 + st.rpm : 1), t, tc);
        setp(n.eng.gain, p.vol * (0.5 + 0.5 * st.thr) * (st.mine ? 1 : 0.85), t, 0.06);
      } else setp(n.eng.gain, 0, t, 0.08);
      // the siren
      if (st.sir) {
        const S = this.siren(v, st.sir, t);
        const ph = (t + v.veh * 1.7) % 11;
        let base = 1000, rate = 0.18, depth = 420;
        if (st.sir === 'police' && ph > 8) { base = 1080; rate = 5.5; depth = 330; }                // the yelp, now and then
        else if (st.sir === 'ambulance') { base = 850; rate = 0.9; depth = 110; }                   // hi-lo
        else if (st.sir === 'fire') { base = 640; rate = 0.11; depth = 330; }                       // the slow mechanical wail
        setp(S.s.frequency, base * dop, t, 0.08); setp(S.sl.frequency, rate, t, 0.08); setp(S.sld.gain, depth * dop, t, 0.08);
        setp(S.g.gain, st.sir === 'fire' ? 0.07 : 0.06, t, 0.05);
      } else if (v.sirN) { v.sirN.g.gain.setTargetAtTime(0, t, 0.05); this.letGo(v.sirN, t + 0.3); v.sirN = null; }
      // the horn
      if (st.horn && !p.pedal) { const H = this.horn(v, p, dop, t); setp(H.g.gain, H.scale, t, 0.01); H.off = 0; }
      else if (v.hornN) {
        const H = v.hornN;
        if (!H.off) { H.off = t; setp(H.g.gain, 0, t, 0.03); } else if (t - H.off > 0.3) { this.letGo(H, t); v.hornN = null; }
      }
      // the tyres: a screech sliding sideways or spinning on the spot (a burnout), nothing on a hard start
      const sc = screech(st, p);
      if (sc > 0) {
        const road = !p.boat && !p.pedal, Ty = this.tyres(v, road);
        if (road) {
          const f = (st.spd < 40 ? 640 : 760 + 380 * Math.min(1, st.side / 420)) * dop;
          setp(Ty.a.frequency, f, t, 0.05); setp(Ty.b.frequency, f * 1.47, t, 0.05);
          setp(Ty.hg.gain, st.spd < 40 ? 0.45 : 0.3, t, 0.1);   // (more smoke in a burnout)
          setp(Ty.g.gain, sc * TYRE_LEVEL * (st.mine ? 1 : 0.8), t, 0.04);
        } else {
          setp(Ty.nf.frequency, p.boat ? 2600 : 800, t, 0.03); setp(Ty.nf.Q, p.boat ? 0.6 : 1, t, 0.05);
          setp(Ty.g.gain, (p.boat ? 0.25 : 0.2) * sc, t, 0.04);
        }
        Ty.at = t;
      } else if (v.tyreN) {
        setp(v.tyreN.g.gain, 0, t, 0.06);
        if (t - v.tyreN.at > 1) { this.letGo(v.tyreN, t); v.tyreN = null; }
      }
    }
  }

  // ---- trains: the rumble of the nearest moving train, its wheels clacking over the joints ----
  makeTrain() {
    const c = this.ctx, E = this.E;
    const src = krate(c.createBufferSource()); src.buffer = E.buf.brown; src.loop = true; src.start();
    const f = this.bq('lowpass', 150, 0.7);
    const motor = this.osc('saw8'); motor.frequency.value = 38; motor.start();
    const mf = this.bq('lowpass', 180, 0.7), mg = this.g(0.3);
    const g = this.g(0);
    const pan = c.createStereoPanner ? krate(c.createStereoPanner()) : null;
    src.connect(f); f.connect(g); motor.connect(mf); mf.connect(mg); mg.connect(g);
    if (pan) g.connect(pan);
    const out = pan || g;
    out.connect(E.mix.sfx);
    return { src, f, motor, g, pan, out, clackAt: 0, quietAt: 0, part: { src: [src, motor], all: [src, f, motor, mf, mg, g, pan].filter(Boolean) } };
  }
  trains(F, S, dt, t) {
    const L = this.E.listener;
    let best = null, bd = 1400, spd = 0;
    for (const c of F.cars) {
      const d = Math.hypot(c.rx - L.x, c.ry - L.y);
      if (d < bd) { bd = d; best = c; }
    }
    if (best) spd = Math.hypot(best.fdx || 0, best.fdy || 0) / Math.max(dt, 1e-3);
    const sub = !!F.sub, heard = best && spd > 15;
    const lvl = sub ? 0.5 + Math.min(0.4, spd / 900) : heard ? Math.pow(Math.max(0, 1 - bd / 1400), 1.6) * Math.min(0.55, 0.15 + spd / 900) : 0;
    if (lvl > 0.005 && !this.train) this.train = this.makeTrain();   // (made while a train is heard, let go after)
    const T = this.train;
    if (T) {
      setp(T.g.gain, lvl * this.level, t, 0.3);
      setp(T.f.frequency, sub ? 260 : 110 + Math.min(200, spd / 4), t, 0.3);
      setp(T.motor.frequency, 32 + Math.min(30, spd / 25), t, 0.3);
      if (T.pan && best && !sub) setp(T.pan.pan, Math.max(-0.8, Math.min(0.8, (best.rx - L.x) / 600)), t, 0.2);
      if (lvl <= 0.005) { if (!T.quietAt) T.quietAt = t; else if (t - T.quietAt > 2) { this.letGo(T.part, t); this.train = null; } } else T.quietAt = 0;
    }
    // the wheels: a clack-clack per rail joint, quicker the faster it goes
    this.clackAt = this.clackAt || 0;
    if ((heard || (sub && spd > 15)) && t > this.clackAt) {
      this.clackAt = t + Math.max(0.22, Math.min(1.4, 260 / Math.max(1, spd)));
      if (sub) this.E.play('clack', undefined, undefined, 0.5, { n: 2 });
      else this.E.play('clack', best.rx, best.ry, 0.9, { n: 2 });
    }
  }
  // ---- level crossings ring while their arms are down ----
  crossings(S) {
    const xs = S.map && S.map.rail && S.map.rail.crossings, L = this.E.listener;
    if (!xs || !S.xing) return;
    for (let i = 0; i < xs.length; i++) {
      const st = S.xing[i];
      if (!st || !st.d) continue;
      const c = xs[i];
      if (Math.abs(c.x - L.x) > 1000 || Math.abs(c.y - L.y) > 1000) continue;
      this.E.play('bell', c.x, c.y, 0.8);
    }
  }
  silence() {
    const t = this.ctx.currentTime;
    for (const v of this.voices) { if (v.veh) { const st = this.states.get(v.veh); if (st) st.voice = null; v.quietAt = t; } v.veh = 0; this.release(v, t); }
    if (this.train) { setp(this.train.g.gain, 0, t, 0.2); this.letGo(this.train.part, t + 0.5); this.train = null; }
  }
  idle() { /* (the voices let their nodes go as they give up their vehicles) */ }
  // how many nodes the vehicles hold right now (the bench, the debug line)
  nodes() { let n = 0; for (const v of this.voices) for (const p of [v.n, v.sirN, v.hornN, v.tyreN]) if (p) n += p.all.length; return n + (this.train ? this.train.part.all.length : 0); }
}
const MINE = Object.freeze({ mine: true });
