// The universal wind. Everything that moves in the air reads it: grass, crops, bushes and trees
// sway with it, rain slants with it, leaves and petals blow in it, smoke drifts on it.
//
// It's worked out from the shared world clock (the clock counting the days: main.js passes the server's day x the
// loop + loopTime), so every player sees the same weather: time is split into 90 s spells, each hashed to a mood -
// mostly calm (only the faint idle sway), now and then a breeze, a windy spell as a rarer event, a gale rarest of
// all - and rain stirs it up. Spells blend into each other over the last fifth; the strength and the direction ease
// toward what the clock says over a few seconds, so nothing jumps (not at the turn of the day, nor when the clock
// is corrected). (User, 2026-10-06: wind should be a rarer event, with a subtle idle sway on the vegetation the rest
// of the time.)
//
// The vegetation (art v2 engine.js STATIC_FS; render/flora for the classic renderer) moves with it in gust patches
// that travel with the wind - two layers of them, gd, moving at different speeds and a little apart, so patches
// gather, sweep over a field or a stand of trees and fade - and each stand and each cluster of leaves sways in its
// own time on the flutter clock ft (task #385, the owner: "all the trees kind of move in a big wave"). Like air,
// these are summed frame by frame, never the clock times the wind's speed now (which made the gust bands race
// whenever the wind changed): gd wraps at AIR_P as air does, ft at FLUT_P - the sway's frequencies are whole turns
// over it, so neither wrap ever shows.
//
// air: how far the air has carried things (world px, x and y), for what drifts with it - the redwood canopy's leaf
// clumps (art v2 lightgame.js: the sunflecks and the beams through the gaps). It is the wind's velocity summed frame
// by frame, never the clock times the wind's speed now: that moved the whole pattern by the session's age times any
// change in the wind, so after a while every breeze picking up, every turn of the wind, sent the dappled light
// racing over the forest floor (task #388). The velocity eases toward the wind's over a few seconds (a gust or the
// turn of the loop swings it round, never jumps it), a step is at most a tenth of a second (a tab back from the
// background, a hitch), and the sums wrap at AIR_P - the noise they move repeats over it, so the wrap never shows and
// the numbers stay small (precise) however long the session.
import { hash } from '../atmos.js';

export const AIR_P = 8192, FLUT_P = 256;
const GK1 = 2 * Math.PI * 8 / AIR_P, GK2 = 2 * Math.PI * 21 / AIR_P;   // (sway's gust patches: 1024 and 390 px waves)
const SPELL_S = 90;
const MOODS = [
  // [chance, strength, gustiness, name]
  [0.8, 0.1, 0.3, 'calm'],
  [0.13, 0.3, 0.5, 'breezy'],
  [0.055, 0.58, 0.65, 'windy'],
  [0.015, 0.88, 0.8, 'gale'],
];
function mood(spell) {
  const h = hash(spell, 0, 811);
  let acc = 0;
  for (const m of MOODS) { acc += m[0]; if (h < acc) return m; }
  return MOODS[0];
}

export class Wind {
  constructor() {
    this.strength = 0.12;   // 0 still .. 1 gale
    this.gust = 0.35;       // how much it comes and goes
    this.dir = 0;           // angle the wind blows toward (radians, 0 = east)
    this.dx = 1; this.dy = 0;
    this.name = 'calm';
    this.force = null;      // dev override: a strength 0..1 (window.CLA.wind)
    this.t = 0;
    this.air = [0, 0];      // how far the air has carried things (px, wrapped at AIR_P)
    this.vx = 0; this.vy = 0; this.vOn = false;   // (its velocity, eased)
    this.gd = [0, 0, 0, 0]; // how far the two layers of gust patches have travelled (px, wrapped at AIR_P)
    this.ft = 0;            // the flutter clock (s, faster in a stronger wind, wrapped at FLUT_P)
  }
  // loopTime: the shared world clock (s; counting the days); rain 0..1; dt: the frame's seconds (moves the air, eases
  // the wind toward what the clock says; none: the wind is just what the clock says)
  update(loopTime, rain, dt = -1) {
    this.t = loopTime;
    const spell = Math.floor(loopTime / SPELL_S), ph = loopTime / SPELL_S - spell;
    const a = mood(spell), b = mood(spell + 1);
    const k = ph < 0.8 ? 0 : (ph - 0.8) / 0.2;   // blend into the next spell over its last 15 s
    const kk = k * k * (3 - 2 * k);
    let s = a[1] + (b[1] - a[1]) * kk;
    let gs = a[2] + (b[2] - a[2]) * kk;
    this.name = kk < 0.5 ? a[3] : b[3];
    // rain brings wind with it
    if (rain > 0) { s = Math.max(s, 0.45 * rain + s * (1 - rain)); gs = Math.max(gs, 0.6 * rain); if (rain > 0.5 && this.name === 'calm') this.name = 'rainy'; }
    if (this.force !== null) { s = this.force; gs = 0.4 + 0.4 * this.force; this.name = 'forced'; }
    // the direction wanders slowly through the day (mostly across the screen, where sway reads best)
    const day = Math.floor(loopTime / 1200);
    const base = hash(day, 3, 812) < 0.5 ? 0 : Math.PI;
    const dir = base + Math.sin(loopTime * 0.004 + day) * 0.45 + (hash(day, 5, 813) - 0.5) * 0.5;
    // (eased toward all that: 2 s for the strength, 8 for the direction - a new day's wind swings round)
    const snap = !this.vOn || !(dt >= 0), d = snap ? 0 : Math.min(0.1, dt), ke = snap ? 1 : 1 - Math.exp(-d / 2), kd = snap ? 1 : 1 - Math.exp(-d / 8);
    this.strength += (s - this.strength) * ke; this.gust += (gs - this.gust) * ke;
    let ex = this.dx + (Math.cos(dir) - this.dx) * kd, ey = this.dy + (Math.sin(dir) - this.dy) * kd;
    const el = Math.hypot(ex, ey);
    if (el < 1e-3) { ex = Math.cos(dir); ey = Math.sin(dir); } else { ex /= el; ey /= el; }
    this.dx = ex; this.dy = ey; this.dir = Math.atan2(ey, ex);
    this.carry(d);
  }
  // the air moving on: its velocity (3 px/s in calm air, 15 in a gale) eased toward the wind's, summed into air; the
  // gust patches travelling (140 px/s in calm air, 400 in a gale; the second layer at 55% of that, 26 degrees off);
  // the flutter clock running (0.6 s a second in calm air, 2 in a gale)
  carry(dt) {
    const d = Math.min(0.1, Math.max(0, +dt || 0)), s = this.strength, sp = 3 + s * 12, tx = this.dx * sp, ty = this.dy * sp;
    if (!this.vOn) { this.vx = tx; this.vy = ty; this.vOn = true; }
    const k = 1 - Math.exp(-d / 3);
    this.vx += (tx - this.vx) * k; this.vy += (ty - this.vy) * k;
    const A = this.air, G = this.gd, wrap = (v) => ((v % AIR_P) + AIR_P) % AIR_P;
    A[0] = wrap(A[0] + this.vx * d); A[1] = wrap(A[1] + this.vy * d);
    const vl = Math.hypot(this.vx, this.vy) || 1, ux = this.vx / vl, uy = this.vy / vl, gv = (140 + 260 * s) * d;
    G[0] = wrap(G[0] + ux * gv); G[1] = wrap(G[1] + uy * gv);
    G[2] = wrap(G[2] + (ux * 0.9 - uy * 0.44) * gv * 0.55); G[3] = wrap(G[3] + (uy * 0.9 + ux * 0.44) * gv * 0.55);
    this.ft = (this.ft + d * (0.6 + 1.4 * s)) % FLUT_P;
  }
  // The wind on a plant at (x, y) world px, time t (s): a signed push across the screen, roughly
  // -1..1 (positive leans right). phase: the plant's own jitter (0..1) so neighbours don't move as one.
  // (The classic renderer's plants: gust patches travelling with gd, so a change in the wind never races them -
  // blobs of waves that are whole turns over the air's ring in x and in y, so gd's wrap never shows.)
  sway(x, y, t, phase = 0) {
    const s = this.strength, G = this.gd;
    if (s <= 0) return 0;
    // two layers of gust patches and a little flutter of its own
    const p1 = Math.sin((x - G[0]) * GK1) * Math.sin((y - G[1]) * GK1 + 1.1);
    const p2 = Math.sin((x - G[2]) * GK2 + 0.7) * Math.sin((y - G[3]) * GK2 + 2.3);
    const g = 0.5 + 0.5 * (0.7 * p1 + 0.3 * p2);
    const flutter = Math.sin(t * (2.6 + phase * 2.2) + phase * 6.283) * 0.18;
    const push = s * ((1 - this.gust) * 0.55 + this.gust * g * 1.25) + flutter * (0.25 + s);
    return push * this.dx;
  }
  // a strength 0..1 for things that don't care where they are (rain slant, smoke drift)
  get now() { return this.strength; }
}

export const wind = new Wind();
