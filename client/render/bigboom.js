// The huge blasts (task #398): a fuel tanker or a load of explosives going up (the 'explode' event's b: 3, a big load
// 4), as the clients play them on top of the ordinary explosion (render/boom.js). Loaded with render/wheels.js, which
// carries it (its tick and draw), with the first explosion - not with the page:
//   * more fireballs bursting round the first, one after another a moment later (the tank splitting, the crates going),
//     each with its flash, flames and sparks, a ring, its own boom and a jolt;
//   * a column of fire rolling up into a dark cap of smoke that hangs over it and drifts;
//   * a second, wider shockwave and a wall of dust rolling out with it;
//   * burning debris flung far - torn, charred metal trailing fire and smoke, burning on where it lands;
//   * pools of burning fuel left round it, flickering and smoking a good while and lighting the street (their glow drawn
//     here, their flames the pooled particles the renderers light);
//   * a wider scorch, soot thrown out round it;
//   * a long glow (the renderers' lights) and, near you, a rumble that keeps the screen shaking a while.
// Where things go comes from the event's seed (every player sees the same); pooled (fixed arrays here, the particles
// render/fx.js's and boom.js's glow blobs, rings and burners); thinned on Low (fx.thin).
import { mulberry32 } from '../../shared/rng.js';
import { soundEvent } from '../audio.js';
import { hazeSprite } from './boom.js';

const TAU = Math.PI * 2;

// burning debris: five torn, charred pieces of metal with a hot orange edge (a strip, made once)
const SHARD = [[0, 2, 10, 0, 11, 7, 2, 9], [1, 1, 11, 3, 8, 9, 0, 6], [2, 0, 11, 2, 10, 8, 1, 8], [0, 4, 6, 0, 11, 5, 5, 9], [1, 2, 9, 1, 11, 9, 0, 7]];
let SHARDS = null;
function shards() {
  if (SHARDS) return SHARDS;
  const c = document.createElement('canvas'); c.width = 60; c.height = 10;
  const g = c.getContext('2d');
  SHARD.forEach((p, i) => {
    g.beginPath();
    for (let j = 0; j < 8; j += 2) g.lineTo(i * 12 + p[j], p[j + 1]);
    g.closePath();
    g.fillStyle = i % 2 ? '#2e2a27' : '#47413b'; g.fill();
    g.strokeStyle = '#ff7a1a'; g.lineWidth = 1; g.stroke();
  });
  return (SHARDS = c);
}

// a free slot of a pool, or the one that started longest ago
function slot(pool) {
  let o = pool[0];
  for (const q of pool) { if (!q.on) return q; if (q.t0 < o.t0) o = q; }
  return o;
}
// how strongly a blast at (x, y) is felt where the camera is: 1 on top of it, 0 at reach px or more
const feel = (S, x, y, reach) => Math.max(0, 1 - Math.hypot(x - S.cam.x, y - S.cam.y) / reach);

export class Huge {
  constructor(B) {
    this.B = B; this.S = B.S;
    this.bursts = Array.from({ length: 16 }, () => ({ on: false, x: 0, y: 0, t0: 0, s: 0 }));
    this.pools = Array.from({ length: 24 }, () => ({ on: false, x: 0, y: 0, t0: 0, end: 0, s: 0, acc: 0, sacc: 0, ph: 0 }));
    this.rumble = { t0: -99, amp: 0, dur: 1 };
  }

  // A huge one went up (render/boom.js has played the ordinary explosion): big 3 a tanker or explosives, 4 a big load.
  add(ev, big, now) {
    const S = this.S, B = this.B, fx = S.fx, R = mulberry32((ev.s || 1) ^ 0x51ed270b), r = ev.r || 330, x = ev.x, y = ev.y, k = big - 2;
    // (Low: every other glow blob, piece of debris and soot mark - drawn from the seed all the same, so the pools and
    // the scorch land where everyone else sees them; the particles thin themselves)
    const lo = !!fx.thin;
    // 1. more fireballs round the first, one after another (tick sets them off)
    for (let i = 0, n = 2 + 2 * k; i < n; i++) {
      const a = R() * TAU, d = r * (0.12 + R() * 0.3), b = slot(this.bursts);
      b.on = true; b.x = x + Math.cos(a) * d; b.y = y + Math.sin(a) * d * 0.8; b.t0 = now + 0.12 + i * (0.14 + R() * 0.12); b.s = r * (0.2 + R() * 0.1);
    }
    // 2. a column of fire rolling up, into a dark cap of smoke that hangs and drifts
    for (let i = 0; i < 6 + 2 * k; i++) {
      const ox = (R() - 0.5) * r * 0.2, vx = (R() - 0.5) * 24, s1 = r * (0.2 + R() * 0.12);
      if (!(lo && i % 2)) B._blob(x + ox, y - i * 4, vx, 0, r * 0.08, s1, 1 + i * 0.14, 1, 0.95, 50 + i * 26);
    }
    for (let i = 0; i < 5 + 2 * k; i++) {
      const ox = (R() - 0.5) * r * 0.4, vx = (R() - 0.5) * 40, s1 = r * (0.45 + R() * 0.25), life = 5 + R() * 3, rise = 38 + R() * 26;
      if (!(lo && i % 2)) B._blob(x + ox, y - r * 0.1, vx, 0, r * 0.15, s1, life, 2, 0.45, rise);
    }
    // 3. a second, wider shockwave, and a wall of dust rolling out with it
    const ring = B._on(B.rings);
    ring.on = true; ring.x = x; ring.y = y; ring.r = r * 2.7; ring.t = 0; ring.life = 0.8 + 0.1 * k;
    for (let i = 0; i < 36; i++) { const a = R() * TAU, sp = 240 + R() * 220; fx.spawn(2, x + Math.cos(a) * r * 0.45, y + Math.sin(a) * r * 0.36, Math.cos(a) * sp, Math.sin(a) * sp * 0.8, 1.6 + R() * 1.2, 10 + R() * 6, 'rgba(160,148,132,', 16); }
    // 4. burning debris flung far: charred metal trailing fire and smoke (boom.js's burners), burning on where it lands
    const img = shards();
    for (let i = 0; i < 6 + 3 * k; i++) {
      const a = R() * TAU, sp = 180 + R() * r * 1.2, j = Math.floor(R() * 5), w = 9 + R() * 6, h = 7 + R() * 5, vz = 240 + R() * 320, va = (R() - 0.5) * 16, rest = 8 + R() * 6, burn = 5 + R() * 5;
      if (lo && i % 2) continue;
      fx.chunk(img, j * 12, 0, 12, 10, w, h, x + Math.cos(a) * r * 0.1, y + Math.sin(a) * r * 0.1, Math.cos(a) * sp, Math.sin(a) * sp, vz, va, rest);
      const c = fx.chunks[(fx.ci + fx.chunks.length - 1) % fx.chunks.length], b = B.burners[B.bu];
      B.bu = (B.bu + 1) % B.burners.length;
      b.c = c; b.until = now + burn; b.acc = 0;
    }
    // 5. pools of burning fuel left round it, burning on a good while
    for (let i = 0, n = 4 + 2 * k; i < n; i++) {
      const a = R() * TAU, d = r * (0.06 + R() * 0.5), p = slot(this.pools);
      p.on = true; p.x = x + Math.cos(a) * d; p.y = y + Math.sin(a) * d * 0.85; p.t0 = now; p.end = now + 7 + R() * 9 + 3 * k; p.s = 8 + R() * 12 + 4 * k; p.acc = 0; p.sacc = 0; p.ph = R() * TAU;
      fx.decal(3, p.x, p.y, R() * TAU, p.s * 1.3, '#111', now, 0.55);
    }
    // 6. a wider scorch, soot thrown out round it
    fx.decal(3, x, y, R() * TAU, r * 0.62, '#111', now, 0.5);   // (over boom.js's own: the middle burnt black, not a hole)
    for (let i = 0; i < 8 + 4 * k; i++) {
      const a = R() * TAU, d = r * (0.3 + R() * 0.55), rot = R() * TAU, s = r * (0.06 + R() * 0.1), al = 0.35 + R() * 0.3;
      if (!(lo && i % 2)) fx.decal(3, x + Math.cos(a) * d, y + Math.sin(a) * d, rot, s, '#111', now, al);
    }
    // 7. a long glow (the renderers' lights), and near you a rumble: the screen shaking on a while
    S.flashes.push({ x, y, t: 2 + k, r: r * 3.6, kind: 'boom' });
    const q = feel(S, x, y, 1200 + r * 6);
    if (q > 0) { const m = this.rumble; m.amp = Math.max(m.t0 + m.dur > now ? m.amp : 0, (14 + 8 * k) * q); m.t0 = now; m.dur = 1.6 + 0.5 * k; }
  }

  // each frame (render/boom.js tick, through the wheels): the fireballs that are due, the pools burning, the rumble
  tick(now, dt, lo) {
    const S = this.S, B = this.B, fx = S.fx;
    for (const b of this.bursts) {
      if (!b.on || now < b.t0) continue;
      b.on = false;
      // a white-hot core and lobes of fire, flames thrown out, sparks, a ring, its flash, its boom and a jolt
      B._blob(b.x, b.y, 0, 0, b.s * 0.15, b.s, 0.4, 0, 1, 0);
      for (let i = 0; i < 4; i++) { const a = Math.random() * TAU; B._blob(b.x, b.y, Math.cos(a) * b.s * 1.4, Math.sin(a) * b.s * 1.1, b.s * 0.2, b.s * 0.6, 0.7 + Math.random() * 0.4, 1, 0.9, 30); }
      for (let i = 0; i < 22; i++) { const a = Math.random() * TAU, sp = 60 + Math.random() * b.s * 3; fx.spawn(3, b.x, b.y, Math.cos(a) * sp, Math.sin(a) * sp, 0.4 + Math.random() * 0.4, 6 + Math.random() * 7, Math.random() < 0.5 ? '#ff7a1a' : '#ffd23a', 8); }
      fx.sparks(b.x, b.y, 10);
      const ring = B._on(B.rings);
      ring.on = true; ring.x = b.x; ring.y = b.y; ring.r = b.s * 2.2; ring.t = 0; ring.life = 0.4;
      S.flashes.push({ x: b.x, y: b.y, t: 0.5, r: b.s * 4, kind: 'boom' });
      soundEvent({ e: 'explode', x: b.x, y: b.y, r: b.s }, S);
      const q = feel(S, b.x, b.y, 1300);
      S.cam.shake = Math.max(S.cam.shake, 14 * q * q);
    }
    for (const p of this.pools) {
      if (!p.on) continue;
      const t = now - p.t0, left = p.end - now;
      if (left < -3) { p.on = false; continue; }   // (smouldered out)
      const heat = left > 0 ? Math.min(1, t * 3, left / 3 + 0.25) : 0;   // it flares up, burns, dies down
      p.acc += dt * 12 * heat * lo;
      for (; p.acc >= 1; p.acc--) {   // flames licking up off it
        const o = fx.spawn(3, p.x + (Math.random() - 0.5) * p.s * 1.6, p.y + (Math.random() - 0.5) * p.s, (Math.random() - 0.5) * 12, -16 - Math.random() * 22, 0.35 + Math.random() * 0.3, 4 + Math.random() * 5 * heat, Math.random() < 0.5 ? '#ff8a1a' : '#ffd23a', -5);
        o.vz = 30 + Math.random() * 50;
      }
      p.sacc += dt * (heat > 0 ? 2.5 : 1.2) * lo;   // thick smoke, then a wisp
      for (; p.sacc >= 1; p.sacc--) fx.smoke(p.x + (Math.random() - 0.5) * p.s, p.y - 6, true);
      if (heat > 0.3 && Math.random() < dt * 2 * lo) { const e = fx.spawn(10, p.x, p.y, (Math.random() - 0.5) * 30, (Math.random() - 0.5) * 20, 1.2 + Math.random(), 1.5, '#ff9a3a', 0, 40 + Math.random() * 60); e.ph = Math.random() * TAU; }
    }
    const m = this.rumble, u = (now - m.t0) / m.dur;
    if (u >= 0 && u < 1) S.cam.shake = Math.max(S.cam.shake, m.amp * (1 - u) * (1 - u));
  }

  // drawn over the world (with the wheels: art v2's overlay, the classic view's world pass): the burning pools' warm
  // glow, stronger at night
  draw(g, F) {
    const now = F.now, night = F.sky ? F.sky.night || 0 : 0;
    let any = false;
    for (const p of this.pools) if (p.on && p.end > now) { any = true; break; }
    if (!any) return;
    const h = hazeSprite();
    g.save();
    g.globalCompositeOperation = 'lighter';
    for (const p of this.pools) {
      if (!p.on || p.end <= now) continue;
      const heat = Math.min(1, (now - p.t0) * 3, (p.end - now) / 3 + 0.25), fl = 0.8 + 0.2 * Math.sin(now * 17 + p.ph), s = p.s * (3 + 2 * night);
      g.globalAlpha = (0.3 + 0.35 * night) * heat * fl;
      g.drawImage(h, p.x - s, p.y - s * 0.8, s * 2, s * 1.6);
    }
    g.restore();
  }
}
