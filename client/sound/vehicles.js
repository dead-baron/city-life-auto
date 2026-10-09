// Vehicles (the owner's notes: "every vehicle its own engine"; sirens, horns, tyres). A few engine voices - each a
// small synth made once and kept running: an oscillator pair for the engine's note, a band of the shared noise for
// its rasp, a low-pass for its timbre, an amplitude wobble at the firing rate (the putter of an outboard, the lope
// of a V8), plus a siren, a horn and a tyre squeal on the same strip. The nearest, loudest vehicles (yours first)
// get the voices; a voice follows its vehicle's speed and throttle, the siren bends as it passes (Doppler).
// Trains rumble and clack; level crossings ring.
import { VEHICLE_BY_INDEX } from '../../shared/vehicles.js';
import { VF } from '../../shared/constants.js';
import { spatial } from './pool.js';
import { engineOn } from './events.js';

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
};
export const ENGINE_CLASS = {
  compact: 'small', sedan: 'sedan', taxi: 'sedan', sports: 'sports', pickup: 'muscle', flatbed: 'truck', van: 'van', bus: 'bus',
  police: 'police', swat: 'truck', ambulance: 'van', armored: 'truck', bike: 'moto', policebike: 'moto', fbi: 'police', army: 'truck',
  speedboat: 'outboard', policeboat: 'outboard', dinghy: 'dinghy', jetski: 'jetski', ferry: 'ship', waterbus: 'ship',
  boxtruck: 'truck', dumptruck: 'truck', mixer: 'truck', tanker: 'truck', garbage: 'truck', firetruck: 'truck', towtruck: 'truck',
  bicycle: 'pedal', cruiser: 'pedal', mtb: 'pedal', roadbike: 'pedal', bmx: 'pedal', cargobike: 'pedal',
};
export const SIREN_KIND = { police: 'police', policebike: 'police', fbi: 'police', swat: 'police', policeboat: 'police', ambulance: 'ambulance', firetruck: 'fire' };
const AIR_BRAKES = new Set(['truck', 'bus']);
const RANGE = 1000, EAR = RANGE * RANGE;

export class VehicleSounds {
  constructor(E, { voices = 5 } = {}) {
    this.E = E; this.ctx = E.ctx;
    this.states = new Map();
    this.sp = { d: 0, gain: 0, pan: 0, lp: 0 };
    const c = this.ctx;
    this.noise = c.createBufferSource(); this.noise.buffer = E.buf.white; this.noise.loop = true; this.noise.start();
    this.voices = [];
    for (let i = 0; i < voices; i++) this.voices.push(this.makeVoice());
    this.nextAssign = 0; this.nextParam = 0; this.nextXing = 0; this.nextGc = 0;
    this.train = this.makeTrain();
  }
  makeVoice() {
    const c = this.ctx, E = this.E;
    const g = (v = 0) => { const n = c.createGain(); n.gain.value = v; return n; };
    const osc = (type) => { const o = c.createOscillator(); if (E.waves[type]) o.setPeriodicWave(E.waves[type]); else o.type = type; o.start(); return o; };
    const v = { veh: 0, cls: null, sleeping: true, quietAt: 0 };
    v.a = osc('saw8'); v.b = osc('triangle'); v.ga = g(0.6); v.gb = g(0.4);
    v.nf = c.createBiquadFilter(); v.nf.type = 'bandpass'; v.nf.Q.value = 0.9; v.ng = g(0);
    v.filt = c.createBiquadFilter(); v.filt.type = 'lowpass'; v.filt.frequency.value = 600;
    v.amp = g(0.7); v.lfo = osc('sine'); v.amd = g(0);
    v.eng = g(0);   // the engine's level
    v.a.connect(v.ga); v.b.connect(v.gb); v.ga.connect(v.filt); v.gb.connect(v.filt);
    this.noise.connect(v.nf); v.nf.connect(v.ng); v.ng.connect(v.filt);
    v.filt.connect(v.amp); v.lfo.connect(v.amd); v.amd.connect(v.amp.gain); v.amp.connect(v.eng);
    // the strip: distance low-pass -> pan -> level
    v.lp = c.createBiquadFilter(); v.lp.type = 'lowpass'; v.lp.frequency.value = 8000;
    v.pan = c.createStereoPanner ? c.createStereoPanner() : null; v.out = g(0);
    v.eng.connect(v.lp);
    if (v.pan) { v.lp.connect(v.pan); v.pan.connect(v.out); } else v.lp.connect(v.out);
    // the siren: an oscillator swept by its own LFO
    v.s = osc('soft'); v.sl = osc('sine'); v.sld = g(0); v.sg = g(0);
    v.s.frequency.value = 900; v.sl.connect(v.sld); v.sld.connect(v.s.frequency); v.s.connect(v.sg); v.sg.connect(v.lp);
    // the horn: up to three notes
    v.h = [osc('square'), osc('square'), osc('square')]; v.hg = g(0); v.hf = c.createBiquadFilter(); v.hf.type = 'lowpass'; v.hf.frequency.value = 2200;
    for (const o of v.h) o.connect(v.hf);
    v.hf.connect(v.hg); v.hg.connect(v.lp);
    // the tyres: a squeal (or a boat's spray, a bike's gravel)
    v.qf = c.createBiquadFilter(); v.qf.type = 'bandpass'; v.qf.Q.value = 7; v.qg = g(0);
    this.noise.connect(v.qf); v.qf.connect(v.qg); v.qg.connect(v.lp);
    return v;
  }
  wake(v) { if (v.sleeping) { v.out.connect(this.E.mix.sfx); v.sleeping = false; } }
  sleep(v) { if (!v.sleeping) { try { v.out.disconnect(); } catch { /* not connected */ } v.sleeping = true; } }
  // a voice takes on a vehicle's class
  dress(v, cls, sir, t) {
    const p = P[cls] || P.sedan, E = this.E;
    v.cls = cls;
    if (!p.pedal) { if (E.waves[p.wave]) v.a.setPeriodicWave(E.waves[p.wave]); v.gb.gain.setValueAtTime(p.sub * 0.6, t); v.ga.gain.setValueAtTime(0.6, t); }
    else { v.ga.gain.setValueAtTime(0, t); v.gb.gain.setValueAtTime(0, t); }
    v.nf.frequency.setValueAtTime(p.nf || 1000, t); v.nf.Q.value = p.pedal ? 1.2 : 0.9;
    v.filt.Q.value = p.q || 1;
    const hn = p.horn || [440, 554];
    for (let i = 0; i < 3; i++) { const o = v.h[i]; if (E.waves[p.hw]) o.setPeriodicWave(E.waves[p.hw]); else o.type = p.hw || 'square'; o.frequency.setValueAtTime(hn[i] || hn[0] * 1.5, t); }
    v.hscale = hn.length > 2 ? 0.05 : 0.07;
    if (sir) { const w = sir === 'fire' ? 'organ' : sir === 'ambulance' ? 'pulse12' : 'soft'; v.s.setPeriodicWave(E.waves[w]); }
    v.sir = sir;
  }

  update(F, S, dt) {
    const E = this.E, L = E.listener, t = this.ctx.currentTime;
    // ---- each vehicle in earshot: its speed, throttle and engine state ----
    const mine = S.pred && S.pred.kind === 'veh' ? S.ctrlId : 0;
    for (const v of F.vehs) {
      const def = VEHICLE_BY_INDEX[v.d && v.d.m];
      if (!def) continue;
      const dx = v.rx - L.x, dy = v.ry - L.y, d2 = dx * dx + dy * dy;
      let st = this.states.get(v.id);
      if (d2 > EAR && v.id !== mine) { if (st) st.seen = 0; continue; }
      if (!st) { st = { x: v.rx, y: v.ry, spd: 0, prev: 0, thr: 0, rpm: 0, d: Math.sqrt(d2), dop: 1, on: v.id === mine || engineOn(v), horn: false, bellAt: 0, fastAt: -9, seen: t, voice: null, cls: ENGINE_CLASS[def.id] || 'sedan', def }; this.states.set(v.id, st); }
      let mv = Math.hypot(v.rx - st.x, v.ry - st.y);
      if (mv > 300) mv = 0;   // (a teleport)
      st.x = v.rx; st.y = v.ry;
      const k = 1 - Math.exp(-6 * dt);
      st.prev = st.spd;
      st.spd += (mv / Math.max(dt, 1e-3) - st.spd) * k;
      const acc = (st.spd - st.prev) / Math.max(dt, 1e-3);
      const on = v.id === mine || engineOn(v);
      if (on && !st.on && Math.sqrt(d2) < 700 && st.cls !== 'pedal' && !P[st.cls].boat && st.spd < 30) E.play('enginestart', v.rx, v.ry, 0.7);
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
    for (const v of this.voices) if (v.veh && !keep.has(v.veh)) { const st = this.states.get(v.veh); if (st) st.voice = null; v.veh = 0; v.quietAt = t; }
    for (let i = 0; i < Math.min(n, want.length); i++) {
      const [, id, st] = want[i];
      if (st.voice) continue;
      const v = this.voices.find((q) => !q.veh);
      if (!v) break;
      v.veh = id; st.voice = v;
      this.dress(v, st.cls, st.sir, t);
      v.out.gain.setValueAtTime(0, t);
      this.wake(v);
    }
  }
  params(t) {
    const E = this.E, L = E.listener, sp = this.sp, tc = 0.04;
    for (const v of this.voices) {
      if (!v.veh) {
        v.out.gain.setTargetAtTime(0, t, 0.05); v.sg.gain.setTargetAtTime(0, t, 0.05); v.hg.gain.setTargetAtTime(0, t, 0.02); v.qg.gain.setTargetAtTime(0, t, 0.05);
        if (!v.sleeping && t - v.quietAt > 0.5) this.sleep(v);
        continue;
      }
      const st = this.states.get(v.veh);
      if (!st) { v.veh = 0; v.quietAt = t; continue; }
      const p = P[st.cls] || P.sedan;
      spatial(st.x - L.x, st.y - L.y, RANGE, sp);
      let lp = sp.lp, g = sp.gain;
      if (st.mine) { g = Math.max(g, 0.9); lp = 18000; }
      if (L.inside && !st.mine) { lp = Math.min(lp, 800); g *= 0.45; }
      v.out.gain.setTargetAtTime(g * (st.mine ? 1 : 0.8), t, tc);
      v.lp.frequency.setTargetAtTime(lp, t, tc);
      if (v.pan) v.pan.pan.setTargetAtTime(st.mine ? sp.pan * 0.3 : sp.pan, t, tc);
      const cents = 1200 * Math.log2(st.dop);
      // the engine
      if (p.pedal) {   // a bicycle: the chain ticking as it's pedalled, the freewheel's faster, softer tick coasting
        const moving = st.spd > 20, coast = st.thr < 0.2;
        v.lfo.frequency.setTargetAtTime(coast ? 16 : Math.max(2, st.spd / 22), t, 0.1);
        v.amd.gain.setTargetAtTime(0.5, t, 0.1); v.amp.gain.setTargetAtTime(0.5, t, 0.1);
        v.ng.gain.setTargetAtTime(moving ? (coast ? 0.05 : 0.1) : 0, t, 0.08);
        v.filt.frequency.setTargetAtTime(9000, t, 0.1);
        v.eng.gain.setTargetAtTime(p.vol, t, 0.1);
      } else if (st.on) {
        const f = p.f0 + (p.f1 - p.f0) * st.rpm;
        v.a.frequency.setTargetAtTime(f, t, tc); v.b.frequency.setTargetAtTime(f / 2, t, tc);
        v.a.detune.setTargetAtTime(cents * 0.5, t, tc); v.b.detune.setTargetAtTime(cents * 0.5, t, tc);
        v.filt.frequency.setTargetAtTime(p.lp0 + (p.lp1 - p.lp0) * (0.35 * st.rpm + 0.65 * st.thr), t, tc);
        v.lfo.frequency.setTargetAtTime(f * p.amr, t, tc);
        const am = p.am * (p.boat ? 1 - 0.5 * st.rpm : 1);
        v.amd.gain.setTargetAtTime(am * 0.5, t, tc); v.amp.gain.setTargetAtTime(1 - am * 0.5, t, tc);
        v.ng.gain.setTargetAtTime(p.noise * (0.5 + st.thr) + (p.boat ? Math.min(0.5, st.spd / 900) : 0), t, tc);   // (a boat's wash rises with its speed)
        v.nf.frequency.setTargetAtTime(p.nf * (p.boat ? 0.8 + st.rpm : 1), t, tc);
        v.eng.gain.setTargetAtTime(p.vol * (0.5 + 0.5 * st.thr) * (st.mine ? 1 : 0.85), t, 0.06);
      } else v.eng.gain.setTargetAtTime(0, t, 0.08);
      // the siren
      if (st.sir) {
        const ph = (t + v.veh * 1.7) % 11;
        let base = 1000, rate = 0.18, depth = 420;
        if (st.sir === 'police' && ph > 8) { base = 1080; rate = 5.5; depth = 330; }                // the yelp, now and then
        else if (st.sir === 'ambulance') { base = 850; rate = 0.9; depth = 110; }                   // hi-lo
        else if (st.sir === 'fire') { base = 640; rate = 0.11; depth = 330; }                       // the slow mechanical wail
        v.s.frequency.setTargetAtTime(base, t, 0.08); v.sl.frequency.setTargetAtTime(rate, t, 0.08); v.sld.gain.setTargetAtTime(depth, t, 0.08);
        v.s.detune.setTargetAtTime(cents, t, tc);
        v.sg.gain.setTargetAtTime(st.sir === 'fire' ? 0.07 : 0.06, t, 0.05);
        if (v.sir !== st.sir) { v.sir = st.sir; v.s.setPeriodicWave(this.E.waves[st.sir === 'fire' ? 'organ' : st.sir === 'ambulance' ? 'pulse12' : 'soft']); }
      } else v.sg.gain.setTargetAtTime(0, t, 0.08);
      // the horn
      v.hg.gain.setTargetAtTime(st.horn && !p.pedal ? v.hscale : 0, t, st.horn ? 0.01 : 0.03);
      for (const o of v.h) o.detune.setTargetAtTime(cents, t, tc);
      // the tyres
      const drift = (st.flags & VF.DRIFT) && st.spd > 60;
      if (drift) {
        const q = p.boat ? [2600, 0.6] : p.pedal ? [800, 1] : [1700 + 500 * Math.sin(t * 6.3 + v.veh), 7];
        v.qf.frequency.setTargetAtTime(q[0], t, 0.03); v.qf.Q.value = q[1];
        v.qg.gain.setTargetAtTime((p.boat ? 0.25 : p.pedal ? 0.2 : 0.5) * Math.min(1, st.spd / 260), t, 0.04);
      } else v.qg.gain.setTargetAtTime(0, t, 0.06);
    }
  }

  // ---- trains: the rumble of the nearest moving train, its wheels clacking over the joints ----
  makeTrain() {
    const c = this.ctx, E = this.E;
    const src = c.createBufferSource(); src.buffer = E.buf.brown; src.loop = true; src.start();
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 150;
    const motor = c.createOscillator(); motor.setPeriodicWave(E.waves.saw8); motor.frequency.value = 38; motor.start();
    const mf = c.createBiquadFilter(); mf.type = 'lowpass'; mf.frequency.value = 180; const mg = c.createGain(); mg.gain.value = 0.3;
    const g = c.createGain(); g.gain.value = 0;
    const pan = c.createStereoPanner ? c.createStereoPanner() : null;
    src.connect(f); f.connect(g); motor.connect(mf); mf.connect(mg); mg.connect(g);
    if (pan) { g.connect(pan); }
    return { src, f, motor, g, pan, out: pan || g, on: false, clackAt: 0, quietAt: 0 };
  }
  trains(F, S, dt, t) {
    const T = this.train, L = this.E.listener;
    let best = null, bd = 1400, spd = 0;
    for (const c of F.cars) {
      const d = Math.hypot(c.rx - L.x, c.ry - L.y);
      if (d < bd) { bd = d; best = c; }
    }
    if (best) spd = Math.hypot(best.fdx || 0, best.fdy || 0) / Math.max(dt, 1e-3);
    const sub = !!F.sub, heard = best && spd > 15;
    const lvl = sub ? 0.5 + Math.min(0.4, spd / 900) : heard ? Math.pow(Math.max(0, 1 - bd / 1400), 1.6) * Math.min(0.55, 0.15 + spd / 900) : 0;
    if (lvl > 0.005 && !T.on) { T.out.connect(this.E.mix.sfx); T.on = true; }
    if (T.on) {
      T.g.gain.setTargetAtTime(lvl, t, 0.3);
      T.f.frequency.setTargetAtTime(sub ? 260 : 110 + Math.min(200, spd / 4), t, 0.3);
      T.motor.frequency.setTargetAtTime(32 + Math.min(30, spd / 25), t, 0.3);
      if (T.pan && best && !sub) T.pan.pan.setTargetAtTime(Math.max(-0.8, Math.min(0.8, (best.rx - L.x) / 600)), t, 0.2);
      if (lvl <= 0.005) { if (!T.quietAt) T.quietAt = t; else if (t - T.quietAt > 2) { try { T.out.disconnect(); } catch { /* gone */ } T.on = false; T.quietAt = 0; } } else T.quietAt = 0;
    }
    // the wheels: a clack-clack per rail joint, quicker the faster it goes
    if ((heard || (sub && spd > 15)) && t > T.clackAt) {
      T.clackAt = t + Math.max(0.22, Math.min(1.4, 260 / Math.max(1, spd)));
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
    for (const v of this.voices) { if (v.veh) { const st = this.states.get(v.veh); if (st) st.voice = null; } v.veh = 0; v.out.gain.setTargetAtTime(0, t, 0.05); v.quietAt = t; }
    if (this.train.on) this.train.g.gain.setTargetAtTime(0, t, 0.2);
  }
  idle(t) { for (const v of this.voices) if (!v.veh && !v.sleeping && t - v.quietAt > 0.5) this.sleep(v); }
}
