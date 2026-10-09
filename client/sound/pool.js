// The voice pool, the rate limits and where a sound sits (pure: test/sound.test.js).
//
// A phone can't mix fifty sounds at once, so one-shot sounds play in a fixed number of voices (engine.js makes a
// voice's few nodes when its sound starts and lets them go when it ends: an idle voice costs nothing). A sound asks
// with a priority (0 the background: footsteps, critters, drops; 1 small things; 2 the usual; 3 big; 4 the menus),
// how loud it will be where you are, and whether it's yours (your steps, your shots, your car):
// - the background only ever takes a free voice, and only while fewer than half the voices play background: it's
//   dropped rather than cutting anything off, and there's always room left for what matters;
// - anything else takes a free voice, or else the weakest playing one's (the lowest priority, then the quietest,
//   the older a little weaker) - but only one weaker than itself;
// - yours is never cut off, and always gets a voice if anything else could give one up.
// engine.js fades a sound that's cut off over some 40 ms.

export const PRI = Object.freeze({ AMBIENT: 0, MINOR: 1, NORMAL: 2, MAJOR: 3, UI: 4 });

export class VoicePool {
  constructor(max, { bgShare = 0.5 } = {}) {
    this.max = max;
    this.bgMax = Math.max(1, Math.floor(max * bgShare));
    this.busy = new Uint8Array(max);
    this.pri = new Float32Array(max);
    this.loud = new Float32Array(max);
    this.start = new Float64Array(max);
    this.end = new Float64Array(max);
    this.mine = new Uint8Array(max);
    this.stolen = false;   // (whether the last acquire took a playing sound's voice: it must fade out)
    this.why = '';         // (why the last acquire failed: 'bg' the background's share is full, 'full' nothing to give)
  }
  // a voice for a sound (or -1)
  acquire(pri, loud, now, dur, mine = false) {
    this.stolen = false; this.why = '';
    let free = -1, bg = 0;
    for (let k = 0; k < this.max; k++) {
      if (!this.busy[k] || this.end[k] <= now) { if (free < 0) free = k; } else if (this.pri[k] <= PRI.AMBIENT && !this.mine[k]) bg++;
    }
    const background = pri <= PRI.AMBIENT && !mine;
    if (background && bg >= this.bgMax) { this.why = 'bg'; return -1; }
    let i = free;
    if (i < 0) {
      if (background) { this.why = 'full'; return -1; }
      let weakest = Infinity;
      for (let k = 0; k < this.max; k++) {
        if (this.mine[k]) continue;   // (yours is never cut off)
        const s = this.score(this.pri[k], this.loud[k]) - Math.min(0.3, (now - this.start[k]) * 0.05);
        if (s < weakest) { weakest = s; i = k; }
      }
      if (i < 0 || (!mine && this.score(pri, loud) <= weakest)) { this.why = 'full'; return -1; }
      this.stolen = true;
    }
    this.busy[i] = 1; this.pri[i] = pri; this.loud[i] = loud; this.start[i] = now; this.end[i] = now + (dur || 0.5); this.mine[i] = mine ? 1 : 0;
    return i;
  }
  score(pri, loud) { return pri + Math.max(0, Math.min(1, loud)) * 0.9; }
  release(i) { this.busy[i] = 0; this.end[i] = 0; this.mine[i] = 0; }
  // the voices whose sound has finished, freed (each passed to done(i) first)
  reap(now, done) {
    for (let k = 0; k < this.max; k++) if (this.busy[k] && this.end[k] <= now) { if (done) done(k); this.busy[k] = 0; this.mine[k] = 0; }
  }
  active(now) { let n = 0; for (let k = 0; k < this.max; k++) if (this.busy[k] && this.end[k] > now) n++; return n; }
}

// A sound at (dx, dy) world px from the camera's centre, heard out to `range`: its gain (1 close by, easing to 0
// at the range), its pan (left / right by how far across it is) and a low-pass cutoff (far sounds lose their
// highs). Written into `out` (nothing allocated).
export function spatial(dx, dy, range, out) {
  const d = Math.sqrt(dx * dx + dy * dy), r = Math.max(1, range);
  const k = d >= r ? 0 : 1 - d / r;
  out.d = d;
  out.gain = k * k * (3 - 2 * k);
  out.pan = Math.max(-1, Math.min(1, dx / (r * 0.4))) * 0.8;
  out.lp = 350 + 17650 * Math.pow(k, 1.8);
  return out;
}

// A per-name rate limit: true if `name` may play now (and notes it), false while the same sound played less than
// `gap` seconds ago in about the same place (two shooters across the street are both heard; one gun's echoes of
// the same shot are not).
export class RateLimit {
  constructor(near = 120) { this.last = new Map(); this.near = near; }
  ok(name, gap, now, x, y) {
    const r = this.last.get(name);
    if (r && now - r.t < gap && (x === undefined || r.x === undefined || Math.abs(x - r.x) + Math.abs(y - r.y) < this.near)) return false;
    if (r) { r.t = now; r.x = x; r.y = y; } else this.last.set(name, { t: now, x, y });
    return true;
  }
}

// The background's budgets: at most so many a second of each (a token bucket: a short burst, then the rate), so a
// downpour, a crowd or a field of crickets can't flood the voices. Your own footsteps don't count against it.
export const BUDGET = Object.freeze({ step: 12, drop: 6, cricket: 5, crackle: 6, leaves: 4, twig: 3, stroke: 6, bird: 2, cavedrip: 3, clack: 8, drip: 3 });
export class Budget {
  constructor(per = BUDGET) { this.per = per; this.b = new Map(); }
  ok(name, now) {
    const n = this.per[name];
    if (!n) return true;
    let b = this.b.get(name);
    if (!b) { b = { v: n, t: now }; this.b.set(name, b); }
    b.v = Math.min(n, b.v + Math.max(0, now - b.t) * n); b.t = now;
    if (b.v < 1) return false;
    b.v -= 1;
    return true;
  }
}
