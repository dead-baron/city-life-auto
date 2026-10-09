// The voice pool and where a sound sits (pure: test/sound.test.js).
//
// A phone can't mix fifty sounds at once, so one-shot sounds play through a fixed number of voices (engine.js
// makes one strip of nodes per slot, once). A sound asks for a slot with a priority (0 a footstep or a cricket,
// 1 small things, 2 the usual, 3 big or yours, 4 the menus) and how loud it will be where you are: a free slot
// if there is one; otherwise it takes the weakest playing sound's slot (the lowest priority, then the quietest,
// then the oldest) - but only one weaker than itself. A footstep never cuts off an explosion.

export const PRI = Object.freeze({ AMBIENT: 0, MINOR: 1, NORMAL: 2, MAJOR: 3, UI: 4 });

export class VoicePool {
  constructor(max) {
    this.max = max;
    this.busy = new Uint8Array(max);
    this.pri = new Float32Array(max);
    this.loud = new Float32Array(max);
    this.start = new Float64Array(max);
    this.end = new Float64Array(max);
    this.stolen = false;   // (whether the last acquire took a playing sound's slot: its nodes must stop)
  }
  // a slot for a sound (or -1: everything playing matters more)
  acquire(pri, loud, now, dur) {
    this.stolen = false;
    let i = -1;
    for (let k = 0; k < this.max; k++) if (!this.busy[k] || this.end[k] <= now) { i = k; break; }
    if (i < 0) {
      let weakest = Infinity;
      for (let k = 0; k < this.max; k++) {
        const s = this.score(this.pri[k], this.loud[k]) - Math.min(0.2, (now - this.start[k]) * 0.02);   // (older a little weaker)
        if (s < weakest) { weakest = s; i = k; }
      }
      if (i < 0 || this.score(pri, loud) <= weakest) return -1;
      this.stolen = true;
    }
    this.busy[i] = 1; this.pri[i] = pri; this.loud[i] = loud; this.start[i] = now; this.end[i] = now + dur;
    return i;
  }
  score(pri, loud) { return pri + Math.max(0, Math.min(1, loud)) * 0.9; }
  release(i) { this.busy[i] = 0; this.end[i] = 0; }
  // the slots whose sound has finished, freed (each passed to done(i) first)
  reap(now, done) {
    for (let k = 0; k < this.max; k++) if (this.busy[k] && this.end[k] <= now) { if (done) done(k); this.busy[k] = 0; }
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

// A per-name rate limit: true if `name` may play now (and notes it), false while it played less than `gap`
// seconds ago.
export class RateLimit {
  constructor() { this.last = new Map(); }
  ok(name, gap, now) {
    const t = this.last.get(name);
    if (t !== undefined && now - t < gap) return false;
    this.last.set(name, now);
    return true;
  }
}
