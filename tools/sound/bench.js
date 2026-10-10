// The sound bench (tools/sound/bench.html, driven by tools/sound/bench.py): the real client/sound/ modules rendered on
// an OfflineAudioContext, measured.
//   runScene({ mobile })   a busy 30 s scene: traffic (5 cars and a police car with its siren passing), ten people
//                          walking round you, heavy rain at night in a park (then easing off: crickets), a gunfight
//                          (pistol, SMG, your shotgun), a car blown up, a crash, a nightclub over the road. How long the
//                          render takes against its 30 s, the peak and the loudness of the whole and of each bus, how
//                          hard the master's compressor works, how many sounds were played, dropped or cut off.
//   runBeds()              each ambience bed alone at gain 1 (the rain, the city, the wind...)
//   runSongs()             each song as it's heard in the game (the club inside and from over the road)
//   runInstruments()       every instrument alone, unplaced, at vol 1: its loudness and peak
// Loudness here: A-weighted RMS in dB below full scale (dBA), over the whole span or in sliding windows (the loudest
// 400 ms, the loudest 200 ms for short sounds). The A-weighting is the standard curve, bilinear at the render's rate.
import { createSound } from '../../client/sound/index.js';
import { SoundEngine } from '../../client/sound/engine.js';
import { Ambience } from '../../client/sound/ambience.js';
import { Music, SONGS } from '../../client/sound/music.js';
import { INSTR } from '../../client/sound/instruments.js';
import { SOUND_DEFAULTS, createMixer } from '../../client/sound/mixer.js';
import { TRACKS } from '../../client/sound/tracks.js';
import { loopPoints } from '../../client/sound/track.js';
import { T, VF, PF } from '../../shared/constants.js';
import { VEHICLES } from '../../shared/vehicles.js';
import { WEAPONS } from '../../shared/items.js';

const SR = 48000, Q = 128 / SR;
const db = (x) => (x > 0 ? 20 * Math.log10(x) : -200);
const dbp = (p) => (p > 0 ? 10 * Math.log10(p) : -200);
const r1 = (x) => Math.round(x * 10) / 10;

// ---- A-weighting: three second-order sections from the analog poles (20.6, 107.7, 737.9, 12194 Hz), unity at 1 kHz ----
function aSections(sr) {
  const k = 2 * sr, w = (f) => 2 * Math.PI * f, p = (a) => (k - a) / (k + a);
  const w1 = w(20.598997), w2 = w(107.65265), w3 = w(737.86223), w4 = w(12194.217);
  const S = [
    { b: [1, -2, 1].map((c) => c * (k * k) / ((k + w1) * (k + w1))), a: [1, -2 * p(w1), p(w1) * p(w1)] },
    { b: [1, -2, 1].map((c) => c * (k * k) / ((k + w2) * (k + w3))), a: [1, -(p(w2) + p(w3)), p(w2) * p(w3)] },
    { b: [1, 2, 1].map((c) => c / ((k + w4) * (k + w4))), a: [1, -2 * p(w4), p(w4) * p(w4)] },
  ];
  // the response at 1 kHz, to normalise
  const om = 2 * Math.PI * 1000 / sr;
  let mag = 1;
  for (const s of S) {
    const ev = (c) => { const re = c[0] + c[1] * Math.cos(-om) + c[2] * Math.cos(-2 * om), im = c[1] * Math.sin(-om) + c[2] * Math.sin(-2 * om); return Math.hypot(re, im); };
    mag *= ev(s.b) / ev(s.a);
  }
  S[0].b = S[0].b.map((c) => c / mag);
  return S;
}
const AS = aSections(SR);
export function aweight(x) {
  const y = new Float64Array(x.length);
  for (let i = 0; i < x.length; i++) y[i] = x[i];
  for (const { b, a } of AS) {
    let z1 = 0, z2 = 0;
    for (let i = 0; i < y.length; i++) { const v = y[i], o = b[0] * v + z1; z1 = b[1] * v - a[1] * o + z2; z2 = b[2] * v - a[2] * o; y[i] = o; }
  }
  return y;
}
// the measures of one signal (or a stereo pair: the mean of the two channels' powers)
export function measure(chs, { blockMs = 50 } = {}) {
  const n = chs[0].length, B = Math.round(SR * blockMs / 1000), nb = Math.floor(n / B);
  let peak = 0;
  for (const c of chs) for (let i = 0; i < n; i++) { const v = Math.abs(c[i]); if (v > peak) peak = v; }
  const blocks = new Float64Array(nb);
  let tot = 0;
  for (const c of chs) {
    const y = aweight(c);
    for (let b = 0; b < nb; b++) { let s = 0; for (let i = b * B; i < (b + 1) * B; i++) s += y[i] * y[i]; blocks[b] += s / B / chs.length; tot += s / chs.length; }
  }
  const win = (m) => { const out = []; let s = 0; for (let b = 0; b < nb; b++) { s += blocks[b]; if (b >= m) s -= blocks[b - m]; if (b >= m - 1) out.push(s / m); } return out; };
  const w400 = win(Math.round(400 / blockMs)), w200 = win(Math.max(1, Math.round(200 / blockMs)));
  const sorted = [...w400].sort((a, b) => a - b), pct = (q) => sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] : 0;
  return {
    peak: r1(db(peak)), rmsA: r1(dbp(tot / (nb * B))), max400: r1(dbp(Math.max(0, ...w400))), max200: r1(dbp(Math.max(0, ...w200))),
    p50: r1(dbp(pct(0.5))), p95: r1(dbp(pct(0.95))),
  };
}

// How hard the master's compressor works, from what goes in and what comes out (its own `reduction` readout means
// nothing in an offline render). In 10 ms blocks with sound in them: out - in, in dB. The quiet blocks give the
// compressor's own make-up gain (the WebAudio compressor adds one, by the spec, and any fixed gain after it: postDb);
// the reduction in a block is how far below that it fell.
function compWork(pre, post, postDb = 0) {
  // (the compressor looks ahead: what comes out is 6 ms late - WebKit's and Chromium's pre-delay)
  const n = pre[0].length, B = SR / 50, D = Math.round(SR * 0.006), d = [];
  for (let b = 0; b + B + D <= n; b += B) {
    let ei = 0, eo = 0;
    for (let c = 0; c < 2; c++) for (let i = b; i < b + B; i++) { ei += pre[c][i] * pre[c][i]; eo += post[c][i + D] * post[c][i + D]; }
    if (ei / (2 * B) > 1e-7) d.push(dbp(eo / ei));   // (above -70 dB)
  }
  if (!d.length) return { makeupDb: 0, maxReduction: 0, over3dB: 0, over6dB: 0 };
  const s = [...d].sort((a, b) => a - b), makeup = s[Math.floor(s.length * 0.9)];
  const red = d.map((x) => makeup - x);
  return { makeupDb: r1(makeup - postDb), postDb: r1(postDb), maxReduction: r1(Math.max(...red)), over3dB: r1(100 * red.filter((r) => r > 3).length / red.length), over6dB: r1(100 * red.filter((r) => r > 6).length / red.length), blocks: red.length };
}

// ---- counting what the audio graph is asked to make ----
function countNodes(ctx) {
  const made = {};
  for (const m of ['createOscillator', 'createBufferSource', 'createBiquadFilter', 'createGain', 'createStereoPanner', 'createDelay', 'createDynamicsCompressor', 'createConstantSource', 'createWaveShaper', 'createIIRFilter']) {
    const orig = ctx[m];
    if (!orig) continue;
    ctx[m] = function (...a) { made[m] = (made[m] || 0) + 1; const node = orig.apply(this, a); if (m === 'createDynamicsCompressor') ctx.__comp = node; return node; };
  }
  return made;
}

// ---- instrumenting the engine: every play, and what became of it ----
function instrument(E, mine) {
  const st = { calls: 0, played: 0, far: 0, gap: 0, pool: 0, budget: 0, other: 0, stolen: 0, stolenMine: 0, stolenFrom: {}, droppedBy: {}, byPri: {} };
  const slot = [];
  let cur = null, gapFail = false, poolFail = false;
  const rate = E.rate, okOrig = rate.ok.bind(rate);
  rate.ok = (...a) => { const r = okOrig(...a); if (!r) gapFail = true; return r; };
  const pool = E.pool, acqOrig = pool.acquire.bind(pool);
  pool.acquire = (...a) => {
    const i = acqOrig(...a);
    if (i < 0) poolFail = true;
    else {
      if (pool.stolen) { st.stolen++; const v = slot[i]; if (v) { st.stolenFrom[v.name] = (st.stolenFrom[v.name] || 0) + 1; if (v.mine) st.stolenMine++; } }
      slot[i] = cur;
    }
    return i;
  };
  const playOrig = E.play.bind(E);
  E.play = (name, x, y, vol = 1, p = null) => {
    st.calls++; gapFail = false; poolFail = false;
    cur = { name, mine: mine(x, y) };
    const budget0 = E.stats ? E.stats.budget : 0;
    const ok = playOrig(name, x, y, vol, p);
    const I = INSTR[name], pri = I ? (I.pri ?? 2) : -1;
    const b = st.byPri[pri] || (st.byPri[pri] = { calls: 0, played: 0 });
    b.calls++;
    if (ok) { st.played++; b.played++; } else {
      const why = gapFail ? 'gap' : poolFail ? 'pool' : E.stats && E.stats.budget > budget0 ? 'budget' : (vol > 0.01 && I) ? 'far' : 'other';
      st[why]++;
      if (why === 'pool' || why === 'gap' || why === 'budget') { const k = name + ':' + why; st.droppedBy[k] = (st.droppedBy[k] || 0) + 1; }
    }
    return ok;
  };
  return st;
}

// ---- the scene ----
const CX = 4900, CY = 5000;   // the camera's centre: the edge of a park, a road and a nightclub over the road
function sceneMap() {
  const club = { kind: 'club', poi: 7, x0: 0, x1: 0, door: { tx: Math.floor((CX + 380) / 32), ty: Math.floor(CY / 32), w: 2 } };
  const map = {
    w: 4000, h: 4000,
    tileAt(tx) { const x = tx * 32; return x < CX + 100 ? T.GRASS : x < CX + 200 ? T.SIDEWALK : T.ROAD; },
    tileAtPx(x, y) { return this.tileAt(Math.floor(x / 32), Math.floor(y / 32)); },
    districtAt(x) { return { style: x < CX + 100 ? 'park' : 'downtown' }; },
    props: [], homes: [], bays: [], gates: [], cameras: [], forage: [], rail: null,
    buildings: [{ id: 0, walkIn: { units: [club] } }], walkIns: [0], pois: [{ id: 7 }], bld: [],
  };
  return map;
}
const RNG = (seed) => () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };

// A yardstick for the machine's speed right now (the machine is shared: its speed changes from minute to minute): a
// fixed graph - 16 sawtooth oscillators through 16 low-passes - rendered for the same 30 s. The scene's cost is
// reported in multiples of it, as well as in milliseconds.
export async function runYardstick({ seconds = 30 } = {}) {
  const ctx = new OfflineAudioContext(2, SR * seconds, SR);
  const g = ctx.createGain(); g.gain.value = 0.02; g.connect(ctx.destination);
  for (let i = 0; i < 16; i++) { const o = ctx.createOscillator(), f = ctx.createBiquadFilter(); o.type = 'sawtooth'; o.frequency.value = 80 + i * 37; f.frequency.value = 900 + i * 50; o.connect(f); f.connect(g); o.start(); }
  const t0 = performance.now();
  await ctx.startRendering();
  return { wallMs: Math.round(performance.now() - t0) };
}

export async function runScene({ mobile = true, seconds = 30, silent = false, krate = false, off = [] } = {}) {
  const ctx = new OfflineAudioContext(10, SR * seconds, SR);
  const made = countNodes(ctx);
  if (krate) {   // (an experiment: every filter's and oscillator's parameters at k-rate)
    for (const m of ['createBiquadFilter', 'createOscillator']) { const o = ctx[m]; ctx[m] = function (...a) { const n = o.apply(this, a); for (const k of ['frequency', 'Q', 'detune', 'gain']) if (n[k] && n[k].automationRate) { try { n[k].automationRate = 'k-rate'; } catch { /* */ } } return n; }; }
  }
  const rnd = RNG(12345);
  // createSound starts a pulse timer: take it (the bench calls the pulse itself, on the render's clock)
  const si = window.setInterval; let pulseFn = null;
  window.setInterval = (fn) => { pulseFn = fn; return 0; };
  let sys;
  try { sys = silent ? null : createSound(ctx, { ...SOUND_DEFAULTS }, { mobile, timer: false }); } finally { window.setInterval = si; }   // (the default levels)
  const map = sceneMap();
  // (parts switched off, to see what costs what: veh, amb, people, places, events)
  if (sys) for (const k of off) { if (k === 'veh') sys.veh.update = () => {}; if (k === 'amb') sys.amb.update = () => {}; if (k === 'people') sys.people.update = () => {}; if (k === 'places') sys.places.update = () => false; }
  // the taps: master after the compressor (straight to the destination: channels 0-1), and before it, and each bus
  if (sys) {
    const mg = ctx.createChannelMerger(10);
    const tap = (node, ch) => { const sp = ctx.createChannelSplitter(2); node.connect(sp); sp.connect(mg, 0, ch); sp.connect(mg, 1, ch + 1); };
    tap(sys.mix.master, 2); tap(sys.mix.sfx, 4); tap(sys.mix.amb, 6); tap(sys.mix.mus, 8);
    mg.connect(ctx.destination);
  }
  const me = { id: 1, kind: 1, rx: CX, ry: CY, phase: 0, as: 0, flags: 0, d: {} };
  const ents = new Map([[1, me]]);
  const peds = [me];
  for (let i = 0; i < 10; i++) {
    const p = { id: 100 + i, kind: 1, cx: CX + (rnd() - 0.5) * 500, cy: CY + (rnd() - 0.5) * 500, r: 40 + rnd() * 120, a: rnd() * 6.28, as: 70 + rnd() * 70, phase: rnd() * 8, flags: PF.MOVING, d: {} };
    p.rx = p.cx; p.ry = p.cy; peds.push(p); ents.set(p.id, p);
  }
  const V = (id) => VEHICLES[id].i;
  const cars = [];
  const kinds = ['sedan', 'taxi', 'van', 'compact', 'bus'];
  for (let i = 0; i < 5; i++) {
    const south = i % 2 === 0;
    cars.push({ id: 200 + i, rx: CX + (south ? 260 : 330), ry: CY - 1100 + rnd() * 2200, vy: (south ? 1 : -1) * (180 + rnd() * 140), d: { m: V(kinds[i]) }, flags: VF.DRIVER });
  }
  const cop = { id: 300, rx: CX + 300, ry: CY - 2200, vy: 0, d: { m: V('police') }, flags: VF.DRIVER | VF.SIREN };
  const vehs = [...cars];
  const S = { map, ents, myPedId: 1, me: { cash: 100, wanted: 0, dead: false, reloading: false, weapon: 0 }, rainK: 1, cam: { x: CX, y: CY }, pred: null, ctrlId: 1, gateOpen: {}, xing: null, loopClock: 0 };
  const F = { vehs, peds, cars: [], clock: { dark: 1, isNight: true }, sub: 0, ug: 0 };
  // the events: [time, event, the old sfx main.js makes with it]
  const evs = [];
  const dv = (x, y) => Math.max(0, 1 - Math.hypot(x - CX, y - CY) / 1100);
  const shot = (t, w, x1, y1, x2, y2) => evs.push([t, { e: 'shot', w: WEAPONS[w].i, x1, y1, x2, y2 }, [[w === 'shotgun' ? 'heavy' : 'shot', dv(x1, y1)]]]);
  for (let t = 8; t < 20; t += 0.45 + rnd() * 0.35) shot(t, 'pistol', CX - 250, CY - 120, CX + 150 + rnd() * 40, CY + 60);
  for (let t = 9; t < 19; t += 2.2) for (let k = 0; k < 8; k++) shot(t + k * 0.075, 'smg', CX + 200, CY - 300, CX - 240 + rnd() * 30, CY - 110);
  for (const t of [10, 12.5, 15.5, 18]) shot(t, 'shotgun', CX, CY, CX - 250, CY - 120);
  for (const t of [11.2, 13.4, 16.8]) evs.push([t, { e: 'blood', x: CX - 250, y: CY - 120, a: 0, n: 6 }, [['hit', dv(CX - 250, CY - 120)]]]);
  evs.push([12, { e: 'scream', x: CX + 150, y: CY + 60 }, []]);
  evs.push([14, { e: 'explode', x: CX + 260, y: CY + 150, r: 160, k: 'pieces' }, [['explode', dv(CX + 260, CY + 150)]]]);
  evs.push([16, { e: 'crash', x: CX + 300, y: CY - 400, p: 0.7 }, [['crash', dv(CX + 300, CY - 400) * 1.1], ['glass', dv(CX + 300, CY - 400) * 0.5]]]);
  evs.push([17, { e: 'death', x: CX - 250, y: CY - 120 }, []]);
  evs.sort((a, b) => a[0] - b[0]);
  const mineAt = (x, y) => x === undefined || (Math.abs(x - me.rx) < 40 && Math.abs(y - me.ry) < 40);
  const st = sys ? instrument(sys.E, mineAt) : null;
  // events whose sound didn't play at all (the table's sound dropped, the old sfx muted)
  const evStat = { n: 0, heard: 0, silent: 0, silentKinds: {} };
  let ei = 0, jsMs = 0, frames = 0, pulses = 0;
  const seen = { horn: false, tyres: false, siren: false };   // (the engines' parts built while they sounded)
  const FRAME = Q * 13;
  if (sys) sys.pulse();   // (the scene: the game, not the title screen)
  const frame = (t) => {
    const j0 = performance.now();
    const dt = FRAME;
    S.loopClock = t;
    // the people walk their circles, a foot down twice a stride
    for (const p of peds) {
      if (p === me) { me.as = 110; me.rx = CX + Math.cos(t * 0.5) * 30; me.ry = CY + Math.sin(t * 0.5) * 30; me.phase = (me.phase + dt * 8 * 1.1) % 8; continue; }
      p.a += dt * p.as / p.r; p.rx = p.cx + Math.cos(p.a) * p.r; p.ry = p.cy + Math.sin(p.a) * p.r; p.phase = (p.phase + dt * 8 * (p.as / 100)) % 8;
    }
    // the traffic up and down the road; the police car through from 6 s to 16 s
    for (const c of cars) { c.ry += c.vy * dt; if (c.ry > CY + 1100) c.ry -= 2200; if (c.ry < CY - 1100) c.ry += 2200; }
    // a horn from 20 to 21.5 s, a drift (the tyres) from 22 to 24 s, on whichever car is nearest
    const near = cars.reduce((a, c) => (Math.abs(c.ry - CY) < Math.abs(a.ry - CY) ? c : a), cars[0]);
    for (const c of cars) c.flags = VF.DRIVER | (c === near && t >= 20 && t < 21.5 ? VF.HORN : 0) | (c === near && t >= 22 && t < 24 ? VF.DRIFT : 0);
    for (const c of cars) c.ra = (c.vy > 0 ? Math.PI / 2 : -Math.PI / 2) + (c.flags & VF.DRIFT ? 0.7 : 0);   // (the drift: sliding sideways)
    if (sys && sys.veh.voices) { for (const v of sys.veh.voices) { if (v.hornN) seen.horn = true; if (v.tyreN) seen.tyres = true; if (v.sirN) seen.siren = true; } }
    if (t >= 6 && t < 16.5) { if (!vehs.includes(cop)) vehs.push(cop); cop.ry = CY - 2200 + (t - 6) * 420; } else if (vehs.includes(cop)) vehs.splice(vehs.indexOf(cop), 1);
    // the rain: heavy, then easing off from 18 s (the crickets come back under 0.3)
    S.rainK = t < 18 ? 1 : Math.max(0.25, 1 - (t - 18) / 4 * 0.75);
    if (sys) {
      sys.frame(F, S);
      while (ei < evs.length && evs[ei][0] <= t) {
        const [, ev, legacy] = evs[ei++];
        if (off.includes('events')) continue;
        const before = st.played;
        sys.event(ev, S);
        for (const [n, v] of legacy) if (v > 0.02) sys.legacy(n, v);
        evStat.n++;
        if (st.played > before) evStat.heard++; else { evStat.silent++; evStat.silentKinds[ev.e] = (evStat.silentKinds[ev.e] || 0) + 1; }
      }
      if (frames % 3 === 0) { if (pulseFn) pulseFn(); else sys.pulse(); pulses++; }
    }
    frames++;
    jsMs += performance.now() - j0;
  };
  for (let i = 1; i * FRAME < seconds - 0.05; i++) { const t = i * FRAME; ctx.suspend(t).then(() => { frame(ctx.currentTime); ctx.resume(); }); }
  const t0 = performance.now();
  const buf = await ctx.startRendering();
  const wallMs = performance.now() - t0;
  const ch = (i) => buf.getChannelData(i);
  const out = { mobile, seconds, wallMs: Math.round(wallMs), jsMs: Math.round(jsMs), frames, pulses, made, seen, vehNodesAtEnd: sys && sys.veh.nodes ? sys.veh.nodes() : null };
  if (sys) {
    out.whole = measure([ch(0), ch(1)]);
    out.preComp = measure([ch(2), ch(3)]);
    out.sfx = measure([ch(4), ch(5)]);
    out.amb = measure([ch(6), ch(7)]);
    out.mus = measure([ch(8), ch(9)]);
    out.comp = compWork([ch(2), ch(3)], [ch(0), ch(1)], sys.mix.post ? db(sys.mix.post.gain.value) : 0);
    out.plays = st; out.events = evStat;
    if (sys.E.stats) out.engineStats = sys.E.stats;
  }
  return out;
}

// ---- the ambience beds, each alone at gain 1 ----
export async function runBeds({ seconds = 4 } = {}) {
  const res = {};
  const probe = new OfflineAudioContext(2, SR, SR);
  const names = Object.keys(new Ambience(new SoundEngine(probe, fakeMix(probe), { voices: 1 })).beds);
  for (const name of names) {
    const ctx = new OfflineAudioContext(2, SR * seconds, SR);
    const mix = fakeMix(ctx);
    const E = new SoundEngine(ctx, mix, { voices: 1 });
    const A = new Ambience(E);
    const b = A.beds[name];
    if (A.bedOn) A.bedOn(name, b);
    try { b.g.disconnect(); } catch { /* */ }
    b.g.gain.value = 1; b.g.connect(ctx.destination);
    const buf = await ctx.startRendering();
    // (from 1 s: the filters settled)
    const cut = (c) => c.subarray(SR);
    res[name] = measure([cut(buf.getChannelData(0)), cut(buf.getChannelData(1))]);
  }
  return res;
}
// any noise colour through a chain of filters ([type, frequency, Q]...) at gain 1: e.g. the old rain bed, white noise
// through a high-pass at 900 and a low-pass at 6500, to check a measurement made elsewhere
export async function runChain(color, filters, { seconds = 4 } = {}) {
  const ctx = new OfflineAudioContext(2, SR * seconds, SR);
  const E = new SoundEngine(ctx, fakeMix(ctx), { voices: 1 });
  const s = ctx.createBufferSource(); s.buffer = E.buf[color]; s.loop = true;
  let last = s;
  for (const [type, f, q] of filters) { const n = ctx.createBiquadFilter(); n.type = type; n.frequency.value = f; n.Q.value = q ?? 0.7; last.connect(n); last = n; }
  last.connect(ctx.destination); s.start();
  const buf = await ctx.startRendering();
  return measure([buf.getChannelData(0).subarray(SR), buf.getChannelData(1).subarray(SR)]);
}
// ---- the live path, as the game uses it: client/audio.js on a real AudioContext ----
// liveImport() before a real click (audio.js listens for the first gesture); then runLive() drives a few seconds of the
// scene through soundFrame / soundEvent / sfx on the real clock and returns what the debug menu would say.
let AUDIO = null;
export async function liveImport() { AUDIO = await import('../../client/audio.js'); return AUDIO.soundStatus(); }
export async function runLive({ seconds = 4 } = {}) {
  const A = AUDIO, said = [A.soundStatus()];
  for (let k = 0; k < 50 && !(await A.audioReady()); k++) await new Promise((r) => setTimeout(r, 100));
  said.push(A.soundStatus());
  const map = sceneMap();
  const me = { id: 1, kind: 1, rx: CX, ry: CY, phase: 0, as: 110, flags: 0, d: {} };
  const peds = [me];
  for (let i = 0; i < 6; i++) peds.push({ id: 100 + i, kind: 1, rx: CX + i * 40, ry: CY + 60, phase: i, as: 100, flags: PF.MOVING, d: {} });
  const S = { map, ents: new Map(peds.map((p) => [p.id, p])), myPedId: 1, me: { cash: 1, wanted: 0, dead: false, reloading: false, weapon: 0 }, rainK: 1, cam: { x: CX, y: CY }, pred: null, ctrlId: 1, gateOpen: {}, xing: null, loopClock: 0 };
  const F = { vehs: [{ id: 200, rx: CX + 300, ry: CY, d: { m: VEHICLES.sedan.i }, flags: VF.DRIVER }], peds, cars: [], clock: { dark: 1, isNight: true }, sub: 0, ug: 0 };
  const t0 = performance.now();
  let frames = 0, shots = 0;
  await new Promise((done) => {
    const tick = () => {
      const t = (performance.now() - t0) / 1000;
      for (const p of peds) { p.phase = (p.phase + 0.016 * 8) % 8; p.rx += 0.5; }
      F.vehs[0].ry = CY - 600 + t * 300;
      S.loopClock = t;
      A.soundFrame(F, S);
      if (frames % 20 === 0) { const ev = { e: 'shot', w: WEAPONS.pistol.i, x1: CX - 200, y1: CY, x2: CX + 100, y2: CY }; A.soundEvent(ev, S); A.sfx('shot', 0.8); shots++; }
      if (frames === 60) { A.soundEvent({ e: 'explode', x: CX + 200, y: CY, r: 120 }, S); A.sfx('explode', 0.8); }
      if (frames % 30 === 0) A.sfx('click', 0.8);
      frames++;
      if (t < seconds) setTimeout(tick, 16); else done();
    };
    tick();
  });
  said.push(A.soundStatus());
  return { said, frames, shots, samples: window.__snd ? [...window.__snd.E.samples.keys()] : 'no window.__snd (needs ?debug)' };
}
// a stand-in mixer for a lone engine: the effects bus straight to the speakers, the echo nowhere
function fakeMix(ctx) {
  const g = () => ctx.createGain();
  const sfx = g(), amb = g(), mus = g(), echo = g(), ambLp = ctx.createBiquadFilter();
  ambLp.frequency.value = 18000;
  sfx.connect(ctx.destination); amb.connect(ctx.destination); mus.connect(ctx.destination); ambLp.connect(amb);
  return { ctx, sfx, amb, mus, echo, ambIn: ambLp, ambLp, master: sfx, prefs: {}, apply() {} };
}

// ---- each song as it's heard: [song, level, low-pass] ----
export async function runSongs({ seconds = 10 } = {}) {
  const cases = { title: ['title', 0.7, 16000], clubInside: ['club', 0.75, 14000], clubOutside300: ['club', 0.85 * 0.4 * 0.4, 160 + 260 * 0.4], shop: ['shop', 0.5, 5200], lobby: ['lobby', 0.5, 6000] };
  const res = {};
  for (const [k, [song, lvl, lp]] of Object.entries(cases)) {
    const ctx = new OfflineAudioContext(2, SR * seconds, SR);
    const E = new SoundEngine(ctx, fakeMix(ctx), { voices: 1 });
    const M = new Music(E);
    const made = countNodes(ctx);
    M.set(song, lvl, lp);
    const step = 0.1;
    for (let t = step; t < seconds - 0.05; t += step) ctx.suspend(Math.round(t / Q) * Q).then(() => { M.set(song, lvl, lp); M.tick(); if (E.reap) E.reap(ctx.currentTime); ctx.resume(); });
    M.tick();
    const t0 = performance.now();
    const buf = await ctx.startRendering();
    const cut = (c) => c.subarray(SR * 2);
    res[k] = { ...measure([cut(buf.getChannelData(0)), cut(buf.getChannelData(1))]), wallMs: Math.round(performance.now() - t0), nodesPerSec: Math.round(Object.values(made).reduce((a, b) => a + b, 0) / seconds) };
  }
  return res;
}

// ---- every instrument alone: unplaced, vol 1, dry (no echo), through its strip at unity ----
const PARAMS = { step: { s: 'pavement', k: 1 }, impact: { s: 'pavement' }, explosion: { r: 110 }, crash: { p: 0.6 }, splash: { n: 10 }, churchbells: { n: 3 }, clack: { n: 2 }, pickaxe: { t: 2 }, treefall: { s: 2 }, babble: { mood: 'talk' }, thunder: { d: 900, k: 1 } };
export async function runInstruments({ names = Object.keys(INSTR), raw = false } = {}) {
  const res = {};
  for (const name of names) {
    const I = INSTR[name];
    const ctx = new OfflineAudioContext(2, SR * 7, SR);
    const E = new SoundEngine(ctx, fakeMix(ctx), { voices: 2 });
    if (raw && E.trims) E.trims = {};   // (measure the recipe itself, before its level trim)
    E.listener.live = false;
    const made = countNodes(ctx);
    const ok = E.play(name, undefined, undefined, 1, PARAMS[name] || null);
    const dur = E.pool.end ? Math.max(...Array.from(E.pool.end)) : 1;
    const buf = await ctx.startRendering();
    const n = Math.min(buf.length, Math.ceil(SR * Math.min(7, Math.max(0.25, dur + 0.1))));
    const m = measure([buf.getChannelData(0).subarray(0, n), buf.getChannelData(1).subarray(0, n)], { blockMs: 10 });
    // the sound's energy as a whole (a short click and a long rumble compared by what they put out)
    let e = 0;
    for (const c of [buf.getChannelData(0), buf.getChannelData(1)]) { const y = aweight(c.subarray(0, n)); for (let i = 0; i < y.length; i++) e += y[i] * y[i] / 2; }
    res[name] = { ok, pri: I.pri ?? 2, dur: r1(dur * 100) / 100, peak: m.peak, max200: m.max200, max400: m.max400, sel: r1(dbp(e / SR)), nodes: Object.values(made).reduce((a, b) => a + b, 0) };
  }
  return res;
}
// ---- your own car: 2 s driving straight, a hard start from a stop, a slide sideways, a burnout: the effects bus in each (#373) ----
export async function runTyres() {
  const parts = [['cruise', 2], ['launch', 2], ['slide', 2], ['burnout', 2]], seconds = parts.reduce((s, p) => s + p[1], 0);
  const ctx = new OfflineAudioContext(4, SR * seconds, SR);
  const si = window.setInterval; let pulseFn = null;
  window.setInterval = (fn) => { pulseFn = fn; return 0; };
  let sys;
  try { sys = createSound(ctx, { ...SOUND_DEFAULTS }, { mobile: true, timer: false }); } finally { window.setInterval = si; }
  const mg = ctx.createChannelMerger(4), sp = ctx.createChannelSplitter(2);
  sys.mix.sfx.connect(sp); sp.connect(mg, 0, 2); sp.connect(mg, 1, 3); mg.connect(ctx.destination);
  const map = sceneMap();
  const car = { id: 500, rx: CX + 300, ry: CY, ra: -Math.PI / 2, d: { m: VEHICLES.sedan.i }, flags: VF.DRIVER };
  const me = { id: 1, kind: 1, rx: car.rx, ry: car.ry, phase: 0, as: 0, flags: 0, d: {} };
  const S = { map, ents: new Map([[1, me]]), myPedId: 1, me: { cash: 0, wanted: 0, dead: false, reloading: false, weapon: 0 }, rainK: 0, cam: { x: car.rx, y: car.ry }, pred: { kind: 'veh' }, ctrlId: 500, gateOpen: {}, xing: null, loopClock: 0 };
  const F = { vehs: [car], peds: [me], cars: [], clock: { dark: 0, isNight: false }, sub: 0, ug: 0 };
  sys.pulse();
  const FRAME = Q * 13;
  let spd = 0;
  const frame = (t) => {
    const dt = FRAME;
    let at = 0, part = parts[0][0];
    for (const [name, len] of parts) { if (t < at + len) { part = name; break; } at += len; }
    let drift = false, ra = -Math.PI / 2;
    if (part === 'cruise') spd = 300;
    else if (part === 'launch') { spd = t - at < 0.3 ? 0 : Math.min(300, (t - at - 0.3) * 260); drift = spd < 140 && spd > 5; }
    else if (part === 'slide') { spd = 300; ra = -Math.PI / 2 + 0.75; drift = true; }
    else { spd = 0; drift = true; }
    car.ry -= spd * dt; car.ra = ra;
    car.flags = VF.DRIVER | (drift ? VF.DRIFT : 0);
    me.rx = car.rx; me.ry = car.ry; S.cam.x = car.rx; S.cam.y = car.ry; S.loopClock = t;
    sys.frame(F, S);
    if (Math.round(t / FRAME) % 3 === 0) { if (pulseFn) pulseFn(); else sys.pulse(); }
  };
  for (let i = 1; i * FRAME < seconds - 0.05; i++) { const t = i * FRAME; ctx.suspend(t).then(() => { frame(ctx.currentTime); ctx.resume(); }); }
  const buf = await ctx.startRendering();
  const out = {};
  let at = 0;
  for (const [name, len] of parts) {
    const a = Math.round((at + 0.4) * SR), b = Math.round((at + len) * SR);   // (from 0.4 s in: past the change)
    out[name] = measure([buf.getChannelData(2).slice(a, b), buf.getChannelData(3).slice(a, b)]);
    at += len;
  }
  return out;
}

// ---- a song as the game plays it, for listening (bench.py --render): through the real mixer at the default settings,
// as 16-bit stereo PCM in base64 ----
export async function renderSong({ song = 'title', seconds = 60, level = 0.7, only = null } = {}) {
  const ctx = new OfflineAudioContext(2, SR * seconds, SR);
  const E = new SoundEngine(ctx, createMixer(ctx, SOUND_DEFAULTS), { voices: 1 });
  const M = new Music(E), bank = SONGS[song].bank;
  if (bank) await M.load(bank);   // (its one-shots first, so the render starts on the downbeat)
  if (only) M.solo(song, only);   // (some parts on their own: the beat, the beat and the bass...)
  M.set(song, level);
  const step = 0.1;
  for (let t = step; t < seconds - 0.05; t += step) ctx.suspend(Math.round(t / Q) * Q).then(() => { M.set(song, level); M.tick(); E.reap(ctx.currentTime); ctx.resume(); });
  M.tick();
  const buf = await ctx.startRendering();
  const L = buf.getChannelData(0), Rc = buf.getChannelData(1), n = L.length, pcm = new Int16Array(n * 2);
  const q = (x) => Math.max(-32768, Math.min(32767, Math.round(x * 32767)));
  for (let i = 0; i < n; i++) { pcm[2 * i] = q(L[i]); pcm[2 * i + 1] = q(Rc[i]); }
  const u8 = new Uint8Array(pcm.buffer);
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return { sr: SR, b64: btoa(s) };
}

// ---- the recorded tracks (client/sound/tracks.js): each format fetched and decoded as the game does - its length, the
// memory it takes decoded, how long decoding takes, and the seam: the file must repeat itself, with the loop's length
// as its period, across both margins (seamDb: the difference, in dB under the signal), and the jump from the loop's
// end back to its start must be no bigger a step than the music's own (jumpStep: the step at the jump over the 99th
// percentile of the steps round it) ----
const b64 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
export async function runTracks() {
  const out = {};
  for (const [name, t] of Object.entries(TRACKS)) {
    for (const fmt of ['opus', 'mp3']) {
      const bytes = await (await fetch('../../' + t[fmt])).arrayBuffer();
      const oc = new OfflineAudioContext(t.channels, SR, SR);
      const t0 = performance.now();
      let buf;
      try { buf = await oc.decodeAudioData(bytes.slice(0)); } catch (e) { out[`${name}.${fmt}`] = { error: String(e) }; continue; }
      const ms = performance.now() - t0, d = buf.getChannelData(0), sr = buf.sampleRate, L = Math.round(t.loop * sr), m = Math.round(t.margin * sr);
      let e = 0, s = 0;
      for (let i = 0; i < 2 * m && i + L < d.length; i++) { const a = d[i], b = d[i + L]; e += (a - b) * (a - b); s += a * a; }
      const steps = [];
      for (let i = m + L - 2400; i < m + L - 1; i++) steps.push(Math.abs(d[i + 1] - d[i]));
      steps.sort((a2, b2) => a2 - b2);
      const jump = Math.abs(d[m] - d[m + L - 1]);
      out[`${name}.${fmt}`] = { kb: Math.round(bytes.byteLength / 1024), seconds: +buf.duration.toFixed(4), expected: +(t.loop + 2 * t.margin).toFixed(4), sampleRate: sr, channels: buf.numberOfChannels,
        decodeMs: Math.round(ms), decodedMB: +((buf.length * buf.numberOfChannels * 4) / 1048576).toFixed(1), seamDb: +(10 * Math.log10((e + 1e-20) / (s + 1e-20))).toFixed(1), jumpStep: +(jump / (steps[Math.floor(steps.length * 0.99)] || 1e-9)).toFixed(2) };
    }
  }
  return out;
}
// ---- a recorded track as it loops in the game, for listening (bench.py --render-track) ----
export async function renderTrack({ name = 'title', fmt = 'opus', seconds = 100 } = {}) {
  const t = TRACKS[name], bytes = await (await fetch('../../' + t[fmt])).arrayBuffer();
  const ctx = new OfflineAudioContext(2, SR * seconds, SR), buf = await ctx.decodeAudioData(bytes);
  const s = ctx.createBufferSource(), lp = loopPoints(t);
  s.buffer = buf; s.loop = true; s.loopStart = lp.start; s.loopEnd = lp.end; s.connect(ctx.destination); s.start(0, lp.start);
  const r = await ctx.startRendering(), L = r.getChannelData(0), R2 = r.getChannelData(1), pcm = new Int16Array(L.length * 2);
  const q = (x) => Math.max(-32768, Math.min(32767, Math.round(x * 32767)));
  for (let i = 0; i < L.length; i++) { pcm[2 * i] = q(L[i]); pcm[2 * i + 1] = q(R2[i]); }
  return { sr: SR, b64: b64(new Uint8Array(pcm.buffer)) };
}

window.bench = { renderSong, renderTrack, runTracks, runScene, runBeds, runSongs, runInstruments, runYardstick, runChain, liveImport, runLive, runTyres };
