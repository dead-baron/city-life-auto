// Every one-shot sound, synthesised (engine.js play): no files. Each recipe is
//   name: { pri, range, gap, send, play(E, out, t, v, p) -> seconds }
// pri: pool.js priority; range: how far off it's heard (world px); gap: its rate limit (s); send: how much goes into
// the echo. play schedules E.tone / E.noise / E.fm into `out` from time t and returns how long it lasts. Every recipe
// varies itself a little each time (pitch, timing, which partials) so nothing repeats exactly.
import { PRI } from './pool.js';
import { STEP } from './surface.js';

const R = Math.random;
const rr = (a, b) => a + R() * (b - a);
const vary = (x, k = 0.06) => x * (1 + (R() * 2 - 1) * k);
const pick = (a) => a[Math.floor(R() * a.length)];
const { AMBIENT, MINOR, NORMAL, MAJOR, UI } = PRI;

// a few small clicks scattered over a span (debris, crackle, rattles)
function clicks(E, out, t, n, span, v, f0, f1, dur = 0.012) {
  for (let k = 0; k < n; k++) E.noise(out, t + R() * span, dur * rr(0.6, 1.4), v * rr(0.4, 1), { ft: 'bandpass', f: rr(f0, f1), q: 1.6 });
}
// a gunshot: the crack, the body's thump, the tail rolling off the buildings
function gun(E, out, t, v, c) {
  E.noise(out, t, c.crackDur, v * c.crack, { ft: 'bandpass', f: vary(c.crackF), f2: c.crackF * 0.35, q: 0.8 });
  if (c.snap) E.noise(out, t, 0.02, v * c.snap, { ft: 'highpass', f: 3500 });
  E.tone(out, t, vary(c.bodyF, 0.08), c.bodyDur, v * c.body, { type: 'sine', f2: c.bodyF * 0.3 });
  E.noise(out, t + 0.01, c.tail, v * c.tailV, { color: 'pink', ft: 'lowpass', f: c.tailF, f2: 160, a: 0.01 });
  return c.tail + 0.05;
}
function rack(E, out, t, v) {   // a pump or a bolt worked: two clacks
  E.noise(out, t, 0.03, v * 0.5, { ft: 'bandpass', f: vary(1800), q: 2 }); E.tone(out, t, vary(420), 0.03, v * 0.15, { type: 'square', f2: 300 });
  E.noise(out, t + vary(0.12), 0.035, v * 0.6, { ft: 'bandpass', f: vary(1300), q: 2 }); E.tone(out, t + 0.12, vary(330), 0.04, v * 0.15, { type: 'square', f2: 220 });
}
function bell(E, out, t, f, dur, v, ratio = 2.4, index = 1.6) { E.fm(out, t, f, dur, v, ratio, index); E.tone(out, t, f * 2.01, dur * 0.5, v * 0.25, { type: 'sine' }); }

export const INSTR = {
  // ======== the menus, the phone, money, the stars ========
  click: { pri: UI, gap: 0.035, play(E, o, t, v) { E.tone(o, t, vary(1050, 0.03), 0.03, v * 0.12, { wave: 'pulse25' }); E.tone(o, t + 0.028, vary(1400, 0.03), 0.03, v * 0.07, { wave: 'pulse25' }); return 0.07; } },
  notify: { pri: UI, gap: 0.3, play(E, o, t, v) { E.tone(o, t, 988, 0.12, v * 0.08, { type: 'sine', a: 0.01 }); E.tone(o, t + 0.07, 1319, 0.16, v * 0.06, { type: 'sine', a: 0.01 }); return 0.25; } },
  good: { pri: UI, gap: 0.2, play(E, o, t, v) { bell(E, o, t, 1319, 0.35, v * 0.12, 3, 1); bell(E, o, t + 0.09, 1976, 0.5, v * 0.1, 3, 1); return 0.6; } },
  bad: { pri: UI, gap: 0.3, play(E, o, t, v) { E.tone(o, t, 196, 0.22, v * 0.1, { wave: 'saw8', f2: 150, lp: 900 }); E.tone(o, t + 0.12, 147, 0.28, v * 0.1, { wave: 'saw8', f2: 120, lp: 800 }); return 0.42; } },
  alert: { pri: UI, gap: 0.45, play(E, o, t, v) { E.tone(o, t, 660, 0.12, v * 0.12, { wave: 'pulse25' }); E.tone(o, t + 0.12, 990, 0.15, v * 0.12, { wave: 'pulse25' }); return 0.3; } },
  phoneopen: { pri: UI, gap: 0.2, play(E, o, t, v) { E.tone(o, t, 1175, 0.06, v * 0.08, { type: 'sine' }); E.tone(o, t + 0.06, 1568, 0.09, v * 0.08, { type: 'sine' }); E.noise(o, t, 0.05, v * 0.05, { ft: 'highpass', f: 4000 }); return 0.17; } },
  phoneclose: { pri: UI, gap: 0.2, play(E, o, t, v) { E.tone(o, t, 1568, 0.05, v * 0.07, { type: 'sine' }); E.tone(o, t + 0.05, 1047, 0.08, v * 0.07, { type: 'sine' }); return 0.15; } },
  coin: { pri: UI, gap: 0.08, play(E, o, t, v) { const f = vary(1760, 0.03); bell(E, o, t, f, 0.18, v * 0.1, 3.01, 0.8); bell(E, o, t + 0.07, f * 1.335, 0.3, v * 0.1, 3.01, 0.8); return 0.4; } },
  cashin: { pri: UI, gap: 0.4, play(E, o, t, v) {   // money in: a jingle and the till's bell
    for (let k = 0; k < 4; k++) bell(E, o, t + k * vary(0.045), vary(2600, 0.15), 0.12, v * 0.05, 3.01, 0.7);
    bell(E, o, t + 0.2, 2093, 0.5, v * 0.09, 2.4, 1.2); return 0.75;
  } },
  cashout: { pri: UI, gap: 0.4, play(E, o, t, v) { E.noise(o, t, 0.16, v * 0.08, { ft: 'bandpass', f: 3000, q: 0.8 }); E.tone(o, t + 0.05, 784, 0.1, v * 0.06, { type: 'sine', f2: 523 }); return 0.25; } },
  starup: { pri: UI, gap: 0.5, play(E, o, t, v) {   // a star more: a tense brass stab, up
    for (const [d, f] of [[0, 233], [0.13, 311]]) { E.tone(o, t + d, f, 0.26, v * 0.1, { wave: 'saw8', lp: 1600 }); E.tone(o, t + d, f * 1.5, 0.22, v * 0.05, { wave: 'saw8', lp: 1600 }); }
    E.noise(o, t + 0.13, 0.12, v * 0.12, { ft: 'bandpass', f: 1800, q: 0.7 }); return 0.45;
  } },
  stardown: { pri: UI, gap: 0.5, play(E, o, t, v) { E.tone(o, t, 659, 0.18, v * 0.07, { wave: 'pulse12' }); E.tone(o, t + 0.16, 494, 0.3, v * 0.07, { wave: 'pulse12' }); return 0.5; } },
  death: { pri: UI, gap: 3, play(E, o, t, v) {   // the death screen: a low, slow, falling chord
    const ch = [[0, 220, 262, 330], [0.55, 196, 233, 294], [1.1, 165, 196, 247]];
    for (const [d, ...fs] of ch) for (const f of fs) E.tone(o, t + d, f, 1.5, v * 0.06, { wave: 'organ', a: 0.08, lp: 1400 });
    E.tone(o, t, 55, 2.6, v * 0.12, { type: 'sine', a: 0.2 }); return 2.7;
  } },
  reloadout: { pri: MAJOR, gap: 0.2, play(E, o, t, v) { E.noise(o, t, 0.02, v * 0.4, { ft: 'highpass', f: 2600 }); E.tone(o, t, 900, 0.025, v * 0.1, { type: 'square', f2: 500 }); E.noise(o, t + 0.12, 0.05, v * 0.25, { ft: 'bandpass', f: 700, q: 1.5 }); return 0.2; } },
  reloadin: { pri: MAJOR, gap: 0.2, play(E, o, t, v) { E.noise(o, t, 0.035, v * 0.45, { ft: 'bandpass', f: 1500, q: 1.6 }); rack(E, o, t + 0.12, v * 0.8); return 0.4; } },
  goal: { pri: UI, gap: 1, play(E, o, t, v) { for (const [d, f] of [[0, 784], [0.1, 988], [0.2, 1175], [0.3, 1568]]) E.tone(o, t + d, f, 0.25, v * 0.08, { wave: 'pulse25' }); E.noise(o, t, 1.2, v * 0.08, { color: 'pink', ft: 'bandpass', f: 1500, q: 0.4, a: 0.2 }); return 1.3; } },
  racego: { pri: UI, gap: 1, play(E, o, t, v) { E.tone(o, t, 1568, 0.5, v * 0.1, { wave: 'pulse25', hold: 0.3 }); return 0.55; } },
  checkpoint: { pri: UI, gap: 0.3, play(E, o, t, v) { E.tone(o, t, 1047, 0.1, v * 0.08, { wave: 'pulse12' }); E.tone(o, t + 0.08, 1568, 0.18, v * 0.08, { wave: 'pulse12' }); return 0.3; } },
  ridebell: { pri: UI, gap: 1, play(E, o, t, v) { bell(E, o, t, 1047, 0.6, v * 0.08); bell(E, o, t + 0.2, 1319, 0.8, v * 0.08); return 1; } },

  // ======== footsteps and the body ========
  step: { pri: AMBIENT, range: 520, play(E, o, t, v, p) {
    const s = STEP[p.s] || STEP.pavement, k = p.k ?? 1, vv = v * s.v * (0.35 + 0.65 * Math.min(1.4, k)) * (p.soft ? 0.4 : 1) * rr(0.8, 1.1);
    if (s.splash) { E.noise(o, t, s.dur * (s.splash === 2 ? 1.6 : 1), vv * 0.6, { ft: 'bandpass', f: vary(s.f, 0.2), f2: s.f * 2, q: 0.8, a: 0.02 }); E.tone(o, t + 0.02, vary(420, 0.2), 0.06, vv * 0.12, { type: 'sine', f2: 900 }); return 0.4; }
    E.noise(o, t, vary(s.dur, 0.15), vv * 0.55, { ft: 'bandpass', f: vary(s.f, 0.12), q: s.q });
    if (s.thump) E.tone(o, t, vary(s.thump, 0.1), 0.05, vv * 0.35, { type: 'sine', f2: s.thump * 0.6 });
    if (s.grit) E.noise(o, t + 0.012, 0.03, vv * 0.3 * s.grit, { ft: 'highpass', f: vary(4200, 0.15) });
    if (s.swish) E.noise(o, t + 0.01, 0.12, vv * 0.25, { color: 'pink', ft: 'highpass', f: 2600, a: 0.03 });
    if (s.hollow) E.tone(o, t, vary(s.hollow, 0.08), 0.08, vv * 0.22, { type: 'triangle', f2: s.hollow * 0.8 });
    if (s.ring) E.fm(o, t, vary(s.ring, 0.1), 0.18, vv * 0.06, 2.76, 1.2);
    if (s.squeak && R() < 0.12) E.tone(o, t + 0.03, vary(2400, 0.2), 0.05, vv * 0.05, { type: 'sine', f2: 2900 });
    return 0.3;
  } },
  twig: { pri: MINOR, range: 600, gap: 0.08, play(E, o, t, v) { E.noise(o, t, 0.012, v * 0.6, { ft: 'highpass', f: vary(2500) }); E.noise(o, t + rr(0.01, 0.03), 0.02, v * 0.45, { ft: 'bandpass', f: vary(1300), q: 2 }); E.tone(o, t, vary(700, 0.2), 0.02, v * 0.08, { type: 'square', f2: 300 }); return 0.1; } },
  leaves: { pri: AMBIENT, range: 520, play(E, o, t, v) { E.noise(o, t, rr(0.12, 0.22), v * 0.3, { color: 'pink', ft: 'bandpass', f: vary(3000, 0.2), q: 0.6, a: 0.02 }); clicks(E, o, t, 4, 0.12, v * 0.2, 2500, 5000, 0.008); return 0.3; } },
  roll: { pri: NORMAL, range: 700, gap: 0.2, play(E, o, t, v) { E.noise(o, t, 0.22, v * 0.25, { color: 'pink', ft: 'bandpass', f: 900, f2: 500, q: 0.7, a: 0.05 }); E.tone(o, t + 0.2, 90, 0.12, v * 0.35, { type: 'sine', f2: 50 }); E.noise(o, t + 0.2, 0.08, v * 0.3, { ft: 'lowpass', f: 600 }); return 0.4; } },
  knockdown: { pri: NORMAL, range: 900, play(E, o, t, v) { E.tone(o, t, vary(85), 0.22, v * 0.6, { type: 'sine', f2: 38 }); E.noise(o, t, 0.12, v * 0.5, { ft: 'lowpass', f: 700 }); E.noise(o, t + 0.05, 0.25, v * 0.15, { color: 'pink', ft: 'bandpass', f: 1200, q: 0.6 }); return 0.4; } },
  bodyfall: { pri: NORMAL, range: 800, gap: 0.05, play(E, o, t, v) { E.tone(o, t + 0.25, vary(75), 0.2, v * 0.45, { type: 'sine', f2: 40 }); E.noise(o, t + 0.25, 0.14, v * 0.35, { ft: 'lowpass', f: 600 }); E.noise(o, t + 0.36, 0.1, v * 0.2, { ft: 'lowpass', f: 450 }); return 0.6; } },
  thud: { pri: MINOR, range: 800, gap: 0.06, play(E, o, t, v) { E.tone(o, t, vary(110), 0.13, v * 0.4, { type: 'sine', f2: 55 }); E.noise(o, t, 0.06, v * 0.3, { ft: 'lowpass', f: 800 }); return 0.2; } },
  kick: { pri: MINOR, range: 700, gap: 0.06, play(E, o, t, v) { E.tone(o, t, vary(160), 0.08, v * 0.4, { type: 'sine', f2: 70 }); E.noise(o, t, 0.03, v * 0.35, { ft: 'bandpass', f: 1100, q: 1 }); return 0.15; } },
  drip: { pri: AMBIENT, range: 300, gap: 0.3, play(E, o, t, v) { E.tone(o, t, vary(1800, 0.2), 0.04, v * 0.15, { type: 'sine', f2: 2600 }); return 0.08; } },

  // ======== fists, blades, clubs ========
  whoosh: { pri: MINOR, range: 600, gap: 0.05, play(E, o, t, v) { E.noise(o, t, vary(0.12), v * 0.3, { ft: 'bandpass', f: vary(900), f2: 1800, q: 1.8, a: 0.04 }); return 0.16; } },
  whoosh_heavy: { pri: MINOR, range: 700, gap: 0.06, play(E, o, t, v) { E.noise(o, t, vary(0.22), v * 0.38, { color: 'pink', ft: 'bandpass', f: vary(500), f2: 1100, q: 1.4, a: 0.07 }); return 0.26; } },
  whoosh_blade: { pri: MINOR, range: 600, gap: 0.05, play(E, o, t, v) { E.noise(o, t, vary(0.14), v * 0.3, { ft: 'bandpass', f: vary(2600), f2: 4200, q: 3, a: 0.05 }); E.tone(o, t + 0.05, vary(3400), 0.08, v * 0.02, { type: 'sine' }); return 0.2; } },
  punch: { pri: NORMAL, range: 800, gap: 0.04, play(E, o, t, v) { E.noise(o, t, 0.05, v * 0.65, { ft: 'lowpass', f: vary(1300), f2: 400 }); E.tone(o, t, vary(130), 0.08, v * 0.45, { type: 'sine', f2: 60 }); E.noise(o, t, 0.012, v * 0.3, { ft: 'highpass', f: 3000 }); return 0.12; } },
  bonk: { pri: NORMAL, range: 850, gap: 0.04, play(E, o, t, v) { E.noise(o, t, 0.06, v * 0.6, { ft: 'bandpass', f: vary(700), q: 1.2 }); E.tone(o, t, vary(190), 0.1, v * 0.4, { type: 'triangle', f2: 90 }); E.tone(o, t, vary(95), 0.14, v * 0.4, { type: 'sine', f2: 45 }); return 0.18; } },
  baton: { pri: NORMAL, range: 800, gap: 0.04, play(E, o, t, v) { E.noise(o, t, 0.035, v * 0.55, { ft: 'bandpass', f: vary(1100), q: 1.6 }); E.tone(o, t, vary(240), 0.07, v * 0.3, { type: 'triangle', f2: 140 }); return 0.12; } },
  cut: { pri: NORMAL, range: 750, gap: 0.04, play(E, o, t, v) { E.noise(o, t, 0.07, v * 0.45, { ft: 'bandpass', f: vary(2200), f2: 900, q: 1.5 }); E.noise(o, t + 0.03, 0.09, v * 0.4, { ft: 'lowpass', f: 700 }); return 0.15; } },
  stab: { pri: MAJOR, range: 800, gap: 0.1, play(E, o, t, v) { E.noise(o, t, 0.07, v * 0.5, { ft: 'bandpass', f: 700, q: 1.6 }); E.noise(o, t + 0.055, 0.16, v * 0.55, { ft: 'lowpass', f: 300 }); E.tone(o, t + 0.055, 95, 0.16, v * 0.25, { type: 'sine', f2: 55 }); return 0.25; } },
  slash: { pri: MAJOR, range: 800, gap: 0.1, play(E, o, t, v) { E.noise(o, t, 0.2, v * 0.3, { ft: 'bandpass', f: 2600, f2: 4000, q: 2.4, a: 0.05 }); E.noise(o, t + 0.11, 0.12, v * 0.5, { ft: 'lowpass', f: 900 }); return 0.26; } },
  hum: { pri: NORMAL, range: 800, gap: 0.12, play(E, o, t, v) { E.tone(o, t, 92, 0.34, v * 0.16, { wave: 'saw8', f2: 150, lp: 900 }); E.tone(o, t, 184, 0.3, v * 0.07, { type: 'sine', f2: 320 }); return 0.36; } },
  sear: { pri: NORMAL, range: 800, gap: 0.08, play(E, o, t, v) { E.noise(o, t, 0.45, v * 0.3, { ft: 'highpass', f: 4200 }); E.tone(o, t, 130, 0.22, v * 0.12, { wave: 'saw8', f2: 80 }); return 0.46; } },
  zing: { pri: NORMAL, range: 900, gap: 0.06, play(E, o, t, v) { E.tone(o, t, vary(2400), 0.18, v * 0.09, { type: 'sine', f2: 900 }); E.noise(o, t, 0.05, v * 0.2, { ft: 'highpass', f: 3600 }); return 0.2; } },

  // ======== guns ========
  gun_pistol: { pri: MAJOR, range: 1700, gap: 0.03, send: 0.25, play(E, o, t, v) { return gun(E, o, t, v, { crack: 0.9, crackF: 2400, crackDur: 0.08, snap: 0.3, body: 0.35, bodyF: 190, bodyDur: 0.07, tail: 0.32, tailV: 0.22, tailF: 1400 }); } },
  gun_revolver: { pri: MAJOR, range: 1900, gap: 0.05, send: 0.3, play(E, o, t, v) { return gun(E, o, t, v, { crack: 1, crackF: 1800, crackDur: 0.11, snap: 0.35, body: 0.45, bodyF: 150, bodyDur: 0.1, tail: 0.5, tailV: 0.3, tailF: 1100 }); } },
  gun_silenced: { pri: NORMAL, range: 600, gap: 0.04, play(E, o, t, v) { E.noise(o, t, 0.05, v * 0.4, { ft: 'bandpass', f: vary(1300), q: 1.4 }); E.tone(o, t, vary(900), 0.012, v * 0.12, { type: 'square' }); E.noise(o, t + 0.02, 0.04, v * 0.15, { ft: 'highpass', f: 3000 }); return 0.1; } },
  gun_smg: { pri: MAJOR, range: 1600, gap: 0.03, send: 0.18, play(E, o, t, v) { return gun(E, o, t, v, { crack: 0.75, crackF: vary(3000), crackDur: 0.05, snap: 0.25, body: 0.3, bodyF: 220, bodyDur: 0.04, tail: 0.18, tailV: 0.18, tailF: 1600 }); } },
  gun_rifle: { pri: MAJOR, range: 2100, gap: 0.04, send: 0.35, play(E, o, t, v) { return gun(E, o, t, v, { crack: 0.85, crackF: 1500, crackDur: 0.14, snap: 0.7, body: 0.45, bodyF: 120, bodyDur: 0.12, tail: 0.7, tailV: 0.32, tailF: 900 }); } },
  gun_shotgun: { pri: MAJOR, range: 2000, gap: 0.08, send: 0.4, play(E, o, t, v) {
    E.noise(o, t, 0.3, v * 1, { ft: 'lowpass', f: 2600, f2: 300 }); E.noise(o, t, 0.03, v * 0.5, { ft: 'highpass', f: 2500 });
    E.tone(o, t, vary(90), 0.25, v * 0.7, { type: 'sine', f2: 34 });
    E.noise(o, t + 0.02, 0.9, v * 0.3, { color: 'brown', ft: 'lowpass', f: 700, f2: 120, a: 0.02 });
    rack(E, o, t + vary(0.45), v * 0.7); return 0.95;
  } },
  gun_sniper: { pri: MAJOR, range: 2800, gap: 0.2, send: 0.5, play(E, o, t, v) {
    E.noise(o, t, 0.02, v * 1, { ft: 'highpass', f: 3500 });
    E.noise(o, t, 0.25, v * 0.8, { ft: 'bandpass', f: 1200, f2: 250, q: 0.7 });
    E.tone(o, t, 70, 0.3, v * 0.6, { type: 'sine', f2: 30 });
    E.noise(o, t + 0.03, 1.4, v * 0.35, { color: 'brown', ft: 'lowpass', f: 600, f2: 90, a: 0.04 });
    rack(E, o, t + vary(0.65), v * 0.55); return 1.45;
  } },
  gun_rocket: { pri: MAJOR, range: 1800, gap: 0.2, send: 0.3, play(E, o, t, v) { E.noise(o, t, 0.08, v * 0.7, { ft: 'lowpass', f: 900 }); E.tone(o, t, 80, 0.15, v * 0.5, { type: 'sine', f2: 40 }); E.noise(o, t + 0.03, 0.7, v * 0.45, { ft: 'bandpass', f: 500, f2: 2600, q: 0.8, a: 0.05 }); return 0.75; } },
  spray: { pri: NORMAL, range: 700, gap: 0.12, play(E, o, t, v) { E.noise(o, t, 0.4, v * 0.28, { ft: 'highpass', f: vary(3200), a: 0.02 }); E.noise(o, t, 0.06, v * 0.15, { ft: 'bandpass', f: 1200, q: 2 }); return 0.42; } },
  taser: { pri: NORMAL, range: 700, gap: 0.08, play(E, o, t, v) { E.tone(o, t, vary(2400), 0.3, v * 0.06, { wave: 'buzz', f2: 1700, lp: 5000 }); clicks(E, o, t, 14, 0.3, v * 0.5, 2500, 6000, 0.006); return 0.35; } },
  twang: { pri: NORMAL, range: 700, gap: 0.08, play(E, o, t, v) { E.tone(o, t, vary(150), 0.2, v * 0.3, { type: 'triangle', f2: 118 }); E.tone(o, t, vary(300), 0.1, v * 0.08, { type: 'sine', f2: 240 }); E.noise(o, t, 0.08, v * 0.12, { ft: 'highpass', f: 3200 }); return 0.22; } },
  thwack: { pri: NORMAL, range: 700, gap: 0.05, play(E, o, t, v) { E.noise(o, t, 0.05, v * 0.5, { ft: 'lowpass', f: 900 }); E.tone(o, t, vary(170), 0.07, v * 0.22, { type: 'sine', f2: 80 }); return 0.1; } },
  impact: { pri: MINOR, range: 900, gap: 0.02, play(E, o, t, v, p) {
    switch (p.s) {
      case 'grass': case 'dirt': case 'sand': E.noise(o, t, 0.06, v * 0.5, { ft: 'lowpass', f: vary(600) }); E.noise(o, t + 0.02, 0.1, v * 0.15, { color: 'pink', ft: 'highpass', f: 2500 }); return 0.15;
      case 'water': case 'deep': E.tone(o, t, vary(700, 0.2), 0.06, v * 0.2, { type: 'sine', f2: 220 }); E.noise(o, t, 0.1, v * 0.3, { ft: 'bandpass', f: 1500, q: 0.8 }); return 0.15;
      case 'wood': return INSTR.impact_wood.play(E, o, t, v);
      case 'metal': E.fm(o, t, vary(2100, 0.15), 0.25, v * 0.12, 2.76, 1.4); E.noise(o, t, 0.02, v * 0.4, { ft: 'highpass', f: 3000 }); return 0.28;
      default:   // concrete, brick, asphalt: a chip, and now and then the ricochet's whine
        E.noise(o, t, 0.035, v * 0.55, { ft: 'highpass', f: vary(2600) }); E.noise(o, t + 0.01, 0.05, v * 0.2, { ft: 'bandpass', f: 900, q: 1 });
        if (R() < 0.3) E.tone(o, t + 0.02, vary(2800, 0.2), 0.16, v * 0.05, { type: 'sine', f2: 1200 });
        return 0.2;
    }
  } },
  impact_flesh: { pri: NORMAL, range: 800, gap: 0.03, play(E, o, t, v) { E.noise(o, t, 0.05, v * 0.5, { ft: 'lowpass', f: vary(800), f2: 300 }); E.tone(o, t, vary(110), 0.06, v * 0.3, { type: 'sine', f2: 60 }); return 0.1; } },
  impact_wood: { pri: MINOR, range: 800, gap: 0.03, play(E, o, t, v) { E.tone(o, t, vary(320), 0.05, v * 0.35, { type: 'triangle', f2: 200 }); E.noise(o, t, 0.04, v * 0.4, { ft: 'bandpass', f: vary(900), q: 1.6 }); return 0.1; } },
  ricochet: { pri: MINOR, range: 900, gap: 0.05, play(E, o, t, v) { E.noise(o, t, 0.02, v * 0.5, { ft: 'highpass', f: 3000 }); E.tone(o, t + 0.01, vary(3000, 0.25), rr(0.12, 0.22), v * 0.07, { type: 'sine', f2: vary(1100) }); return 0.25; } },
  hit: { pri: MINOR, range: 800, gap: 0.04, play(E, o, t, v) { E.noise(o, t, 0.06, v * 0.4, { ft: 'lowpass', f: vary(600) }); E.tone(o, t, vary(120), 0.06, v * 0.2, { type: 'sine', f2: 70 }); return 0.1; } },

  // ======== explosions, fire, crashes, breaking things ========
  explosion: { pri: MAJOR, range: 3200, gap: 0.05, send: 0.6, play(E, o, t, v, p) {
    const big = Math.min(1.4, (p.r || 100) / 100), wet = p.wet ? 0.35 : 1;
    E.noise(o, t, 0.08, v * 0.9 * wet, { ft: 'highpass', f: 1200 });                                         // the crack
    E.noise(o, t, 1.6 * big, v * 1, { ft: 'lowpass', f: 3200 * wet, f2: 140, a: 0.003 });                     // the blast
    E.tone(o, t, vary(68), 1.2 * big, v * 0.9, { type: 'sine', f2: 22 });                                   // the thump in your chest
    E.noise(o, t + 0.12, 4 * big, v * 0.6, { color: 'brown', ft: 'lowpass', f: 420, f2: 70, a: 0.25, glide: 4 * big });   // the long rolling tail
    clicks(E, o, t + 0.25, 10, 1.4, v * 0.25 * wet, 1500, 4500, 0.02);                                       // debris raining down
    return 4.1 * big;
  } },
  tyrepop: { pri: NORMAL, range: 1200, gap: 0.1, play(E, o, t, v) { E.noise(o, t, 0.08, v * 0.8, { ft: 'lowpass', f: 1800 }); E.tone(o, t, 120, 0.08, v * 0.3, { type: 'sine', f2: 50 }); E.noise(o, t + 0.05, 0.6, v * 0.2, { ft: 'highpass', f: 2600, a: 0.02 }); return 0.7; } },
  crash: { pri: NORMAL, range: 1500, gap: 0.08, send: 0.2, play(E, o, t, v, p) {
    const k = Math.max(0.15, Math.min(1, p.p ?? 0.5));
    E.tone(o, t, vary(110), 0.25, v * (0.4 + 0.5 * k), { type: 'sine', f2: 40 });
    E.noise(o, t, 0.2 + 0.35 * k, v * (0.45 + 0.4 * k), { ft: 'bandpass', f: vary(900), f2: 380, q: 0.9 });
    for (let i = 0; i < 2 + Math.round(k * 3); i++) E.tone(o, t + R() * 0.06, vary(pick([320, 517, 813, 1170]), 0.1), rr(0.12, 0.4) * (0.5 + k), v * 0.07, { type: pick(['square', 'triangle']), f2: rr(150, 400) });
    if (k > 0.55) clicks(E, o, t + 0.1, 6, 0.5, v * 0.25, 1500, 4000, 0.015);
    return 0.4 + 0.5 * k;
  } },
  scrape: { pri: MINOR, range: 900, gap: 0.15, play(E, o, t, v) { E.noise(o, t, 0.35, v * 0.3, { ft: 'bandpass', f: vary(2400), q: 4, a: 0.03 }); E.tone(o, t, vary(1700), 0.3, v * 0.03, { type: 'sawtooth', f2: 1500 }); return 0.36; } },
  glass: { pri: NORMAL, range: 1100, gap: 0.08, play(E, o, t, v) {
    E.noise(o, t, 0.3, v * 0.45, { ft: 'highpass', f: 4200 });
    for (let k = 0; k < 7; k++) E.fm(o, t + R() * 0.4, rr(2400, 6000), rr(0.05, 0.16), v * rr(0.03, 0.07), 1.41, 1);
    return 0.6;
  } },
  rubble: { pri: NORMAL, range: 1400, gap: 0.2, play(E, o, t, v) { E.noise(o, t, 1.2, v * 0.45, { color: 'brown', ft: 'lowpass', f: 800, f2: 150, a: 0.03 }); clicks(E, o, t + 0.1, 12, 1.1, v * 0.3, 700, 2500, 0.025); return 1.25; } },
  woodcrunch: { pri: NORMAL, range: 1000, gap: 0.08, play(E, o, t, v) { E.noise(o, t, 0.12, v * 0.55, { ft: 'bandpass', f: vary(800), q: 1.2 }); clicks(E, o, t, 7, 0.22, v * 0.4, 600, 2200, 0.02); E.tone(o, t, vary(180), 0.08, v * 0.2, { type: 'triangle', f2: 110 }); return 0.3; } },
  foliage: { pri: MINOR, range: 900, gap: 0.08, play(E, o, t, v) { E.noise(o, t, 0.5, v * 0.35, { color: 'pink', ft: 'bandpass', f: 2800, q: 0.5, a: 0.03 }); clicks(E, o, t, 8, 0.4, v * 0.2, 2000, 5000, 0.01); return 0.55; } },
  clang: { pri: NORMAL, range: 1100, gap: 0.06, play(E, o, t, v) { E.fm(o, t, vary(520, 0.1), 0.45, v * 0.14, 1.53, 2.2); E.fm(o, t, vary(1310, 0.1), 0.25, v * 0.06, 2.1, 1.5); E.noise(o, t, 0.08, v * 0.3, { ft: 'bandpass', f: 1200, q: 1 }); return 0.5; } },
  clank: { pri: MINOR, range: 900, gap: 0.15, play(E, o, t, v) { E.tone(o, t, vary(310), 0.18, v * 0.14, { type: 'square', f2: 250 }); E.fm(o, t, 620, 0.2, v * 0.06, 1.5, 1.5); return 0.22; } },
  gush: { pri: MINOR, range: 900, gap: 0.4, play(E, o, t, v) { E.noise(o, t, 1.5, v * 0.4, { ft: 'bandpass', f: 1100, q: 0.4, a: 0.08 }); return 1.5; } },
  paper: { pri: MINOR, range: 600, gap: 0.12, play(E, o, t, v) { E.noise(o, t, 0.3, v * 0.3, { ft: 'highpass', f: 2600, a: 0.02 }); return 0.32; } },
  spikes: { pri: NORMAL, range: 900, gap: 0.5, play(E, o, t, v) { clicks(E, o, t, 14, 0.5, v * 0.5, 1800, 4500, 0.02); E.noise(o, t, 0.45, v * 0.2, { ft: 'bandpass', f: 2500, q: 1.5 }); return 0.55; } },
  ignite: { pri: NORMAL, range: 700, gap: 0.3, play(E, o, t, v) { E.noise(o, t, 0.06, v * 0.3, { ft: 'highpass', f: 3800 }); E.noise(o, t + 0.09, 0.7, v * 0.4, { color: 'brown', ft: 'lowpass', f: 500, a: 0.1 }); clicks(E, o, t + 0.2, 6, 0.6, v * 0.3, 2000, 4000, 0.01); return 0.85; } },
  douse: { pri: NORMAL, range: 700, gap: 0.3, play(E, o, t, v) { E.noise(o, t, 0.9, v * 0.3, { ft: 'highpass', f: 3000, a: 0.03 }); E.tone(o, t + 0.06, 90, 0.1, v * 0.18, { type: 'sine', f2: 60 }); E.tone(o, t + 0.22, 80, 0.1, v * 0.15, { type: 'sine', f2: 55 }); return 0.95; } },
  crackle: { pri: AMBIENT, range: 700, play(E, o, t, v) { clicks(E, o, t, 1 + Math.floor(R() * 3), 0.12, v * 0.5, 1800, 5000, 0.008); if (R() < 0.15) E.noise(o, t + 0.05, 0.04, v * 0.4, { ft: 'bandpass', f: vary(1100), q: 1.2 }); return 0.2; } },

  // ======== vehicles ========
  cardoor: { pri: MINOR, range: 800, gap: 0.12, play(E, o, t, v) { E.noise(o, t, 0.012, v * 0.4, { ft: 'highpass', f: 3000 }); E.tone(o, t + 0.01, vary(115), 0.12, v * 0.45, { type: 'sine', f2: 65 }); E.noise(o, t + 0.01, 0.09, v * 0.4, { ft: 'lowpass', f: 700 }); return 0.16; } },
  housedoor: { pri: MINOR, range: 700, gap: 0.12, play(E, o, t, v) { E.noise(o, t, 0.015, v * 0.3, { ft: 'bandpass', f: 2500, q: 2 }); E.tone(o, t + 0.12, vary(140), 0.1, v * 0.35, { type: 'triangle', f2: 80 }); E.noise(o, t + 0.12, 0.08, v * 0.3, { ft: 'lowpass', f: 900 }); return 0.25; } },
  rollerdoor: { pri: MINOR, range: 900, gap: 0.8, play(E, o, t, v) { clicks(E, o, t, 28, 1.7, v * 0.3, 1200, 2600, 0.012); E.tone(o, t, 62, 1.8, v * 0.12, { wave: 'saw8', lp: 320, a: 0.1 }); return 1.85; } },
  gate: { pri: MINOR, range: 900, gap: 0.5, play(E, o, t, v) { E.tone(o, t, vary(300), 0.45, v * 0.05, { wave: 'saw8', f2: 210, lp: 900, vib: 40 }); E.fm(o, t + 0.4, vary(440), 0.4, v * 0.12, 1.53, 2); return 0.85; } },
  gatearm: { pri: MINOR, range: 900, gap: 0.5, play(E, o, t, v) { E.tone(o, t, 110, 0.9, v * 0.08, { wave: 'saw8', f2: 150, lp: 500, a: 0.1 }); return 0.95; } },
  enginestart: { pri: NORMAL, range: 900, gap: 0.3, play(E, o, t, v) {
    for (let k = 0; k < 3; k++) { E.tone(o, t + k * 0.11, vary(48), 0.09, v * 0.25, { wave: 'saw8', lp: 400 }); E.noise(o, t + k * 0.11, 0.06, v * 0.2, { ft: 'lowpass', f: 500 }); }
    E.tone(o, t + 0.34, 55, 0.5, v * 0.35, { wave: 'saw8', f2: 95, glide: 0.18, lp: 900 }); return 0.85;
  } },
  airbrake: { pri: MINOR, range: 900, gap: 1.5, play(E, o, t, v) { E.noise(o, t, 0.7, v * 0.35, { ft: 'highpass', f: 2400, a: 0.01 }); return 0.72; } },
  bikebell: { pri: NORMAL, range: 800, gap: 0.35, play(E, o, t, v) { bell(E, o, t, vary(2350, 0.03), 0.35, v * 0.09, 2.76, 1.2); bell(E, o, t + 0.15, 2350, 0.45, v * 0.08, 2.76, 1.2); return 0.6; } },
  bell: { pri: MINOR, range: 900, gap: 0.45, play(E, o, t, v) { bell(E, o, t, 1245, 0.28, v * 0.1, 3.2, 1.6); return 0.3; } },   // a level crossing's bell
  clack: { pri: AMBIENT, range: 1100, play(E, o, t, v, p) {   // a train's wheels over a rail joint: clack-clack
    for (let k = 0; k < (p.n || 2); k++) { E.noise(o, t + k * 0.085, 0.03, v * 0.5, { ft: 'lowpass', f: 1500 }); E.tone(o, t + k * 0.085, vary(170), 0.03, v * 0.2, { type: 'triangle', f2: 110 }); }
    return 0.25;
  } },
  trainhorn: { pri: MAJOR, range: 2800, gap: 0.6, send: 0.3, play(E, o, t, v) { return horn(E, o, t, v, 1.1); } },
  trainhornshort: { pri: MAJOR, range: 2800, gap: 0.6, send: 0.3, play(E, o, t, v) { return horn(E, o, t, v, 0.5); } },
  burner: { pri: NORMAL, range: 900, gap: 0.9, play(E, o, t, v) { E.noise(o, t, 1.5, v * 0.42, { ft: 'lowpass', f: 380, a: 0.08 }); E.noise(o, t, 1.2, v * 0.08, { ft: 'bandpass', f: 1900, q: 0.5, a: 0.08 }); return 1.55; } },

  // ======== water ========
  splash: { pri: NORMAL, range: 900, gap: 0.06, play(E, o, t, v, p) {
    const k = Math.min(1.6, (p.n || 10) / 12);
    E.noise(o, t, 0.25 + 0.3 * k, v * (0.3 + 0.2 * k), { ft: 'bandpass', f: vary(1300), f2: 600, q: 0.6 });
    E.noise(o, t + 0.02, 0.2 + 0.4 * k, v * 0.2, { ft: 'highpass', f: 3000, a: 0.03 });
    for (let i = 0; i < 3; i++) E.tone(o, t + R() * 0.25, rr(500, 1100), 0.05, v * 0.06, { type: 'sine', f2: rr(1200, 2000) });
    return 0.75;
  } },
  stroke: { pri: AMBIENT, range: 500, play(E, o, t, v) { E.noise(o, t, 0.28, v * 0.3, { ft: 'bandpass', f: vary(1000), f2: 1800, q: 0.7, a: 0.05 }); E.tone(o, t + 0.1, vary(500, 0.2), 0.06, v * 0.05, { type: 'sine', f2: 900 }); return 0.35; } },
  cast: { pri: MINOR, range: 600, gap: 0.5, play(E, o, t, v) { E.noise(o, t, 0.2, v * 0.25, { ft: 'bandpass', f: 1500, f2: 3500, q: 2, a: 0.05 }); clicks(E, o, t + 0.05, 10, 0.4, v * 0.12, 3000, 5000, 0.006); E.tone(o, t + 0.55, 600, 0.06, v * 0.1, { type: 'sine', f2: 250 }); return 0.65; } },
  bite: { pri: UI, gap: 0.3, play(E, o, t, v) { for (const d of [0, 0.15]) { E.tone(o, t + d, vary(520, 0.04), 0.07, v * 0.18, { type: 'sine', f2: 260 }); E.noise(o, t + d, 0.05, v * 0.12, { ft: 'bandpass', f: 1500, q: 1 }); } return 0.3; } },

  // ======== voices and animals ========
  babble: { pri: MINOR, range: 650, gap: 0.25, play(E, o, t, v, p) {   // a speech bubble: an RPG's text blips, never words
    const n = 3 + Math.floor(R() * 4), base = p.mood === 'happy' ? rr(330, 420) : rr(200, 330);
    let d = 0;
    for (let k = 0; k < n; k++) { E.tone(o, t + d, base * pick([1, 1.12, 1.26, 0.9, 1.5]), 0.055, v * 0.05, { wave: 'pulse25', lp: 2200 }); d += rr(0.065, 0.1); }
    return d + 0.1;
  } },
  scream: { pri: NORMAL, range: 900, gap: 0.4, play(E, o, t, v) { const f = rr(520, 760); E.tone(o, t, f, 0.6, v * 0.09, { wave: 'saw8', f2: f * 0.7, lp: 2000, vib: 60, a: 0.03 }); E.noise(o, t, 0.5, v * 0.06, { ft: 'bandpass', f: 1700, q: 1.5, a: 0.03 }); return 0.62; } },
  yelp: { pri: MINOR, range: 700, gap: 0.3, play(E, o, t, v) { E.tone(o, t, rr(320, 420), 0.16, v * 0.08, { wave: 'saw8', f2: rr(650, 850), lp: 2000 }); return 0.18; } },
  growl: { pri: NORMAL, range: 1000, gap: 0.6, play(E, o, t, v) { E.noise(o, t, 0.7, v * 0.5, { ft: 'bandpass', f: vary(170), q: 1.4, a: 0.06 }); E.tone(o, t, vary(68), 0.7, v * 0.22, { type: 'sawtooth', f2: 50, lp: 400, vib: 80 }); return 0.75; } },
  screech: { pri: NORMAL, range: 1000, gap: 0.8, play(E, o, t, v) { E.tone(o, t, vary(980), 0.55, v * 0.07, { type: 'sawtooth', f2: 420, lp: 3000 }); E.noise(o, t, 0.45, v * 0.12, { ft: 'bandpass', f: 2400, q: 2 }); return 0.6; } },
  honk: { pri: MINOR, range: 900, gap: 0.3, play(E, o, t, v) { E.tone(o, t, vary(330), 0.14, v * 0.08, { wave: 'reed', f2: 290 }); E.tone(o, t + 0.18, vary(310), 0.16, v * 0.08, { wave: 'reed', f2: 260 }); return 0.36; } },
  bellow: { pri: NORMAL, range: 1300, gap: 1, play(E, o, t, v) { E.tone(o, t, vary(150), 0.9, v * 0.12, { wave: 'reed', f2: 105, lp: 700, a: 0.08 }); return 0.95; } },
  flutter: { pri: MINOR, range: 900, gap: 0.25, play(E, o, t, v) { for (let k = 0; k < 7; k++) E.noise(o, t + k * vary(0.045), 0.05, v * 0.15, { ft: 'bandpass', f: vary(1700), q: 1.4 }); return 0.4; } },
  poof: { pri: MINOR, range: 700, gap: 0.1, play(E, o, t, v) { E.noise(o, t, 0.3, v * 0.25, { color: 'pink', ft: 'bandpass', f: 600, f2: 2000, q: 0.6, a: 0.02 }); return 0.32; } },
  heal: { pri: MINOR, range: 600, gap: 0.3, play(E, o, t, v) { for (const [d, f] of [[0, 784], [0.08, 988], [0.16, 1319]]) E.tone(o, t + d, f, 0.3, v * 0.05, { type: 'sine', a: 0.02 }); return 0.5; } },
  revive: { pri: NORMAL, range: 800, gap: 0.5, play(E, o, t, v) { E.tone(o, t, 70, 0.15, v * 0.4, { type: 'sine', f2: 40 }); E.noise(o, t, 0.06, v * 0.4, { ft: 'lowpass', f: 900 }); E.tone(o, t + 0.2, 523, 0.5, v * 0.06, { wave: 'pulse12', f2: 1047, glide: 0.3 }); return 0.75; } },

  // ======== money, finds, the town's alarms ========
  cashtoss: { pri: NORMAL, range: 800, gap: 0.1, play(E, o, t, v) { for (let k = 0; k < 5; k++) bell(E, o, t + R() * 0.25, rr(2200, 3600), 0.12, v * 0.04, 3.01, 0.6); E.noise(o, t, 0.35, v * 0.15, { ft: 'highpass', f: 2800, a: 0.03 }); return 0.5; } },
  pickup: { pri: NORMAL, range: 700, gap: 0.1, play(E, o, t, v) { E.noise(o, t, 0.1, v * 0.15, { ft: 'bandpass', f: 2000, q: 0.7 }); E.tone(o, t + 0.05, 880, 0.08, v * 0.07, { wave: 'pulse25' }); E.tone(o, t + 0.12, 1320, 0.12, v * 0.07, { wave: 'pulse25' }); return 0.26; } },
  deposit: { pri: NORMAL, range: 700, gap: 0.3, play(E, o, t, v) { E.noise(o, t, 0.14, v * 0.2, { ft: 'bandpass', f: 2600, q: 0.8 }); bell(E, o, t + 0.12, 2093, 0.6, v * 0.08, 2.4, 1.2); return 0.75; } },
  pluck: { pri: MINOR, range: 500, gap: 0.15, play(E, o, t, v) { E.noise(o, t, 0.12, v * 0.25, { color: 'pink', ft: 'bandpass', f: 2600, q: 0.6 }); E.tone(o, t + 0.08, vary(600), 0.04, v * 0.1, { type: 'sine', f2: 300 }); return 0.16; } },
  alarmbell: { pri: MAJOR, range: 1500, gap: 1, send: 0.2, play(E, o, t, v) {   // an electric alarm bell, ringing out (and slowly fading)
    for (let k = 0; k < 40; k++) { const tt = t + k * 0.055; E.fm(o, tt, 1180, 0.05, v * 0.08 * (1 - k / 48), 2.71, 1.4, { a: 0.001 }); }
    return 2.3;
  } },
  camera: { pri: MINOR, range: 700, gap: 0.4, play(E, o, t, v) { E.tone(o, t, 1500, 0.06, v * 0.08, { type: 'square' }); E.tone(o, t + 0.12, 1500, 0.06, v * 0.08, { type: 'square' }); return 0.2; } },
  shutter: { pri: MINOR, range: 600, gap: 0.09, play(E, o, t, v) { E.noise(o, t, 0.03, v * 0.3, { ft: 'highpass', f: 3800 }); E.noise(o, t + 0.055, 0.04, v * 0.22, { ft: 'highpass', f: 2600 }); return 0.1; } },
  doorbell: { pri: NORMAL, range: 700, gap: 0.25, play(E, o, t, v, p) {   // the little brass bell over an old shop's door
    const f = p.f || vary(1700, 0.05);
    bell(E, o, t, f, 0.9, v * 0.1, 2.4, 1.5); bell(E, o, t + vary(0.11), f * 0.99, 0.8, v * 0.07, 2.4, 1.5); bell(E, o, t + vary(0.24), f * 1.005, 0.6, v * 0.04, 2.4, 1.2);
    return 1.1;
  } },
  slidingdoor: { pri: AMBIENT, range: 500, gap: 0.4, play(E, o, t, v) { E.noise(o, t, 0.5, v * 0.12, { color: 'pink', ft: 'bandpass', f: 500, f2: 300, q: 0.8, a: 0.1 }); return 0.52; } },
  churchbell: { pri: NORMAL, range: 3000, gap: 0.6, send: 0.3, play(E, o, t, v) { E.fm(o, t, 196, 2.8, v * 0.2, 1.4, 1.8); E.tone(o, t, 392, 2.2, v * 0.08, { type: 'sine' }); E.tone(o, t, 466, 1.6, v * 0.04, { type: 'triangle' }); return 2.9; } },
  churchbells: { pri: MAJOR, range: 3000, gap: 2, send: 0.35, play(E, o, t, v, p) {
    const n = p.n || 3;
    for (let k = 0; k < n; k++) { const tt = t + k * 1.15, f = k % 2 ? 175 : 196; E.fm(o, tt, f, 2.8, v * 0.2, 1.4, 1.8); E.tone(o, tt, f * 2, 2.2, v * 0.08, { type: 'sine' }); E.tone(o, tt, f * 2.38, 1.6, v * 0.04, { type: 'triangle' }); }
    return n * 1.15 + 2;
  } },
  // (golf and hoops)
  golfhit: { pri: MINOR, range: 700, gap: 0.12, play(E, o, t, v) { E.tone(o, t, 1500, 0.05, v * 0.16, { type: 'triangle', f2: 1000 }); E.noise(o, t, 0.06, v * 0.22, { ft: 'highpass', f: 2600 }); return 0.1; } },
  putt: { pri: MINOR, range: 600, gap: 0.12, play(E, o, t, v) { E.tone(o, t, 900, 0.05, v * 0.1, { type: 'triangle', f2: 600 }); return 0.08; } },
  golfcup: { pri: NORMAL, range: 600, gap: 0.4, play(E, o, t, v) { E.tone(o, t, 660, 0.08, v * 0.14, { type: 'triangle' }); E.tone(o, t + 0.09, 520, 0.1, v * 0.12, { type: 'triangle' }); E.tone(o, t + 0.26, 990, 0.18, v * 0.12, { type: 'sine' }); return 0.45; } },
  swish: { pri: NORMAL, range: 700, gap: 0.3, play(E, o, t, v) { E.noise(o, t, 0.25, v * 0.22, { ft: 'bandpass', f: 2400, q: 0.6 }); return 0.27; } },
  hoopin: { pri: NORMAL, range: 700, gap: 0.3, play(E, o, t, v) { E.tone(o, t, 420, 0.06, v * 0.12, { type: 'triangle', f2: 340 }); E.noise(o, t, 0.2, v * 0.16, { ft: 'bandpass', f: 2200, q: 0.6 }); return 0.22; } },

  // ======== the world around you (ambience.js schedules these) ========
  cricket: { pri: AMBIENT, range: 900, play(E, o, t, v) { const f = vary(4300, 0.08), n = 2 + Math.floor(R() * 3); for (let k = 0; k < n; k++) E.tone(o, t + k * 0.032, f, 0.022, v * 0.03, { type: 'sine' }); return n * 0.032 + 0.05; } },
  owl: { pri: AMBIENT, range: 1400, send: 0.3, play(E, o, t, v) {   // hoo... hoo-hoo
    const f = rr(330, 380), seq = R() < 0.5 ? [[0, 0.35], [0.6, 0.18], [0.85, 0.42]] : [[0, 0.3], [0.45, 0.5]];
    for (const [d, l] of seq) E.tone(o, t + d, f, l, v * 0.07, { wave: 'soft', a: 0.07, f2: f * 0.93 });
    return 1.4;
  } },
  bird: { pri: AMBIENT, range: 900, play(E, o, t, v) {   // a little song: a few quick sweeps, each bird its own
    const base = rr(2200, 3800), n = 2 + Math.floor(R() * 5), up = R() < 0.5;
    let d = 0;
    for (let k = 0; k < n; k++) { const f = base * pick([1, 1.12, 1.25, 0.89]); E.tone(o, t + d, f, rr(0.04, 0.09), v * 0.035, { type: 'sine', f2: f * (up ? 1.3 : 0.75) }); d += rr(0.06, 0.12); }
    return d + 0.1;
  } },
  gull: { pri: AMBIENT, range: 1200, play(E, o, t, v) { const n = 2 + Math.floor(R() * 3); for (let k = 0; k < n; k++) E.tone(o, t + k * 0.22, vary(1150, 0.08), 0.18, v * 0.035, { wave: 'reed', f2: 760, lp: 3000, vib: 50 }); return n * 0.22 + 0.1; } },
  dog: { pri: AMBIENT, range: 1400, send: 0.2, play(E, o, t, v) {
    const n = 1 + Math.floor(R() * 3), f = rr(380, 520);
    for (let k = 0; k < n; k++) { const tt = t + k * rr(0.25, 0.4); E.tone(o, tt, f, 0.11, v * 0.05, { wave: 'reed', f2: f * 0.7, lp: 1500 }); E.noise(o, tt, 0.08, v * 0.06, { ft: 'bandpass', f: 900, q: 1.2 }); }
    return n * 0.4 + 0.1;
  } },
  farsiren: { pri: AMBIENT, range: 6000, play(E, o, t, v) { const os = E.tone(o, t, 700, 4, v * 0.03, { type: 'triangle', a: 1, lp: 1400 }); os.frequency.linearRampToValueAtTime(1150, t + 1); os.frequency.linearRampToValueAtTime(700, t + 2); os.frequency.linearRampToValueAtTime(1150, t + 3); os.frequency.linearRampToValueAtTime(800, t + 4); return 4.1; } },
  farhorn: { pri: AMBIENT, range: 6000, play(E, o, t, v) { const d = rr(0.15, 0.35); E.tone(o, t, vary(392, 0.1), d, v * 0.03, { type: 'square', lp: 1000 }); E.tone(o, t, vary(494, 0.1), d, v * 0.025, { type: 'square', lp: 1000 }); return d + 0.05; } },
  drop: { pri: AMBIENT, range: 400, play(E, o, t, v) { E.tone(o, t, rr(1600, 3400), 0.025, v * 0.03, { type: 'sine', f2: 1000 }); return 0.04; } },
  thunder: { pri: MAJOR, gap: 3, play(E, o, t, v) { E.noise(o, t, 0.25, v * 0.3, { ft: 'highpass', f: 1500 }); E.noise(o, t, 3, v * 0.7, { color: 'brown', ft: 'lowpass', f: 400, f2: 70, a: 0.05 }); E.noise(o, t + 0.3, 2.2, v * 0.5, { color: 'brown', ft: 'lowpass', f: 160, a: 0.4 }); return 3.1; } },
};
function horn(E, o, t, v, d) { for (const [f, w, k] of [[277, 'saw8', 0.1], [349, 'saw8', 0.08], [415, 'reed', 0.06]]) E.tone(o, t, f, d, v * k, { wave: w, lp: 1800, a: 0.04, hold: d - 0.15 }); return d + 0.05; }

// main.js's own sfx(name) calls (client/audio.js): the old names, played by these recipes. null: that sound now
// comes from the frame (vehicles.js: sirens, horns, the trains' rumble, the crossings' bells).
export const LEGACY = {
  shot: 'gun_pistol', heavy: 'gun_rifle', explode: 'explosion', door: 'housedoor', cash: 'coin', swing: 'whoosh', pop: 'tyrepop',
  siren: null, horn: null, rumble: null, bell: null,
};
