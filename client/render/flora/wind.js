// The universal wind. Everything that moves in the air reads it: grass, crops, bushes and trees
// sway with it, rain slants with it, leaves and petals blow in it, smoke drifts on it.
//
// It's worked out from the shared world clock (loopTime), so every player sees the same weather:
// the loop is split into 90 s spells, each hashed to a mood - mostly calm (only the faint idle sway),
// now and then a breeze, a windy spell as a rarer event, a gale rarest of all - and rain stirs it up.
// Spells blend into each other over the last fifth. Over the base strength, gusts roll across the
// ground as travelling waves, so a wheat field shows bands of wind sweeping over it. (User, 2026-10-06:
// wind should be a rarer event, with a subtle idle sway on the vegetation the rest of the time.)
import { hash } from '../atmos.js';

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
  }
  // loopTime: the shared world clock (s); rain 0..1
  update(loopTime, rain) {
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
    this.strength = s; this.gust = gs;
    // the direction wanders slowly through the day (mostly across the screen, where sway reads best)
    const day = Math.floor(loopTime / 1200);
    const base = hash(day, 3, 812) < 0.5 ? 0 : Math.PI;
    this.dir = base + Math.sin(loopTime * 0.004 + day) * 0.45 + (hash(day, 5, 813) - 0.5) * 0.5;
    this.dx = Math.cos(this.dir); this.dy = Math.sin(this.dir);
  }
  // The wind on a plant at (x, y) world px, time t (s): a signed push across the screen, roughly
  // -1..1 (positive leans right). phase: the plant's own jitter (0..1) so neighbours don't move as one.
  sway(x, y, t, phase = 0) {
    const s = this.strength;
    if (s <= 0) return 0;
    const along = x * this.dx + y * this.dy;
    // two travelling waves (the gusts) and a little flutter of its own
    const w1 = Math.sin(along * 0.006 - t * (1.1 + s * 1.6));
    const w2 = Math.sin(along * 0.017 + (x * this.dy - y * this.dx) * 0.004 - t * (2.3 + s * 2) + 1.3);
    const g = 0.5 + 0.5 * (0.65 * w1 + 0.35 * w2);
    const flutter = Math.sin(t * (2.6 + phase * 2.2) + phase * 6.283) * 0.18;
    const push = s * ((1 - this.gust) * 0.55 + this.gust * g * 1.25) + flutter * (0.25 + s);
    return push * this.dx;
  }
  // a strength 0..1 for things that don't care where they are (rain slant, smoke drift)
  get now() { return this.strength; }
}

export const wind = new Wind();
