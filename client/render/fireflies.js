// Fireflies (task #342; concept FX2). The owner: "occasional lightning-bug FX, rare and beautiful" - at night, rare,
// in natural areas and parks, sometimes at the campfires. Client-only: nothing the server knows about.
//   Where: a coarse grid over the world (FLIES.cell tiles); on a night when they're out at all (FLIES.nights of
//   them), now and then a cell of open grass in the wilds, the country or a park holds a glade of a few fireflies
//   (FLIES.chance), and a campfire out in the wilds, a rest spot's above all, often has some round it
//   (FLIES.campChance). The same for everyone that night (hash2 of the place and the day; nothing random but the
//   flies' own phases), a different scatter the next night.
//   How: each fly wanders slowly round its spot (a lazy Lissajous drift), rising and settling, and blinks: dark,
//   then an eight-step glow up and down (concept FX2's eight frames), every few seconds, out of step with the rest.
//   Drawn on the overlay in world space after dark, additive: a soft yellow-green glow and a bright core.
//   Cheap: the flies are a small pool (never more than FLIES.max at once, the nearest glades first), the grid
//   cells' answers are kept for the night, none on Low (main.js never loads this module there), fewer on Medium,
//   none in the rain, underground or indoors.
import { hash2 } from '../../shared/rng.js';
import { DISTRICTS } from '../../shared/map.js';
import { T, TILE, MAP_W, MAP_H } from '../../shared/constants.js';

export const FLIES = {
  cell: 12,             // tiles per grid cell (384 px)
  nights: 0.65,         // the share of nights they come out at all
  chance: 0.012,        // a grass cell's chance of a glade, on such a night
  campChance: 0.45,     // a campfire in the wilds' chance (a rest spot's: 0.7)
  per: [3, 6],          // flies in a glade
  max: { medium: 8, high: 14 },   // alive at once (Low: none)
  nightMin: 0.35,       // the sky's night factor they start to show at (full by +0.3)
  period: [2.6, 5.6],   // seconds between one fly's flashes
  glow: 0.95,           // seconds a flash lasts (eight steps up and down)
  rescan: 0.5,          // seconds between looks at which glades are in view
};
const NATURE = new Set(['wild', 'rural', 'park', 'rocky']);

let SPR = null;
function glowSprite() {
  if (SPR) return SPR;
  const c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(32, 32) : Object.assign(document.createElement('canvas'), { width: 32, height: 32 });
  const g = c.getContext('2d'), gr = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  gr.addColorStop(0, 'rgba(250,255,170,1)'); gr.addColorStop(0.18, 'rgba(220,250,110,0.85)'); gr.addColorStop(0.5, 'rgba(170,230,60,0.28)'); gr.addColorStop(1, 'rgba(120,200,40,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 32, 32);
  return (SPR = c);
}

export class Fireflies {
  constructor(S) { this.S = S; this.pool = []; this.live = []; this.cells = new Map(); this.night = -1; this.map = null; this.camps = []; this.scanAt = -9; this.want = []; this.t = 0; }
  // the campfires out in the wilds (found once a city): [x, y, rest]
  campsOf(M) {
    if (this.map === M) return this.camps;
    this.map = M; this.camps = []; this.cells.clear();
    if (!M || !M.props) return this.camps;
    const rest = new Set((M.restSpots || []).map((s) => `${s.x},${s.y}`));
    for (const p of M.props) {
      if (!p || p.t !== 'campfire') continue;
      const i = Math.floor(p.y / TILE) * MAP_W + Math.floor(p.x / TILE), d = DISTRICTS[M.dist[i]];
      if (d && NATURE.has(d.style)) this.camps.push([p.x, p.y, rest.has(`${p.x},${p.y}`) ? 1 : 0]);
    }
    return this.camps;
  }
  // a grid cell's glade tonight (or null)
  gladeAt(M, cx, cy, n) {
    if (hash2(cx + n * 7919, cy - n * 104729, 931) >= FLIES.chance) return null;
    const C = FLIES.cell, tx = cx * C + Math.floor(hash2(cx, cy + n, 932) * C), ty = cy * C + Math.floor(hash2(cx + n, cy, 933) * C);
    if (tx < 2 || ty < 2 || tx >= MAP_W - 2 || ty >= MAP_H - 2) return null;
    const i = ty * MAP_W + tx, d = DISTRICTS[M.dist[i]];
    if (M.tiles[i] !== T.GRASS || !d || !NATURE.has(d.style)) return null;
    const h = hash2(cx, cy, 934 + n);
    return { x: (tx + 0.5) * TILE, y: (ty + 0.5) * TILE, r: 60 + h * 50, n: FLIES.per[0] + Math.floor(h * (FLIES.per[1] - FLIES.per[0] + 1)), ring: 0, key: `${cx},${cy}` };
  }
  // which glades are in view (the nearest first)
  scan(F, M, n) {
    const v = F.view, C = FLIES.cell * TILE, out = this.want;
    out.length = 0;
    for (let cy = Math.floor((v.y0 - 120) / C); cy <= Math.floor((v.y1 + 120) / C); cy++) for (let cx = Math.floor((v.x0 - 120) / C); cx <= Math.floor((v.x1 + 120) / C); cx++) {
      const k = cy * 4096 + cx;
      let gl = this.cells.get(k);
      if (gl === undefined) { gl = this.gladeAt(M, cx, cy, n); this.cells.set(k, gl); }
      if (gl) out.push(gl);
    }
    for (const [x, y, rest] of this.campsOf(M)) {
      if (x < v.x0 - 200 || x > v.x1 + 200 || y < v.y0 - 200 || y > v.y1 + 200) continue;
      if (hash2(Math.round(x) + n * 31, Math.round(y), 935) >= (rest ? 0.7 : FLIES.campChance)) continue;
      const k = `f${x},${y}`;
      let gl = this.cells.get(k);
      if (!gl) { gl = { x, y, r: 120, n: 4, ring: 70, key: k }; this.cells.set(k, gl); }
      out.push(gl);
    }
    const cxm = (v.x0 + v.x1) / 2, cym = (v.y0 + v.y1) / 2;
    out.sort((a, b) => Math.hypot(a.x - cxm, a.y - cym) - Math.hypot(b.x - cxm, b.y - cym));
  }
  // flies to the glades in view (up to the cap), the rest back to the pool
  assign(cap) {
    const live = this.live;
    for (const f of live) { f.g.want = 0; f.g.have = 0; }
    let room = cap;
    for (const gl of this.want) { gl.have = 0; gl.want = Math.max(0, Math.min(gl.n, room)); room -= gl.want; }
    for (const f of live) if (f.out < 0) { if (f.g.have < f.g.want) f.g.have++; else f.out = 0; }   // (one too many fades out, then goes back)
    for (const gl of this.want) for (; gl.have < gl.want; gl.have++) live.push(this.spawn(gl));
  }
  spawn(gl) {
    const f = this.pool.pop() || {}, R = Math.random;
    const a = R() * 6.283, r = gl.ring ? gl.ring + R() * (gl.r - gl.ring) : R() * gl.r;
    f.g = gl; f.hx = Math.cos(a) * r; f.hy = Math.sin(a) * r * 0.8;
    f.ax = 14 + R() * 22; f.ay = 10 + R() * 16; f.s1 = 0.12 + R() * 0.16; f.s2 = 0.1 + R() * 0.14; f.p1 = R() * 6.283; f.p2 = R() * 6.283;
    f.zb = 10 + R() * 14; f.zs = 0.3 + R() * 0.3;
    f.per = FLIES.period[0] + R() * (FLIES.period[1] - FLIES.period[0]); f.off = R() * f.per;
    f.in = 0; f.out = -1; f.x = gl.x + f.hx; f.y = gl.y + f.hy; f.z = f.zb;
    return f;
  }
  // each frame (world transform set): the flies' drift and blink, drawn additive
  draw(g, F, gfx) {
    const S = this.S, M = S.map, sky = F.sky, live = this.live;
    const night = sky ? sky.night || 0 : 0, dt = Math.min(0.1, F.dt || 0.016);
    const cap = !gfx || !gfx.particles ? 0 : gfx.lighting >= 2 ? FLIES.max.high : FLIES.max.medium;
    let k = Math.max(0, Math.min(1, (night - FLIES.nightMin) / 0.3)) * Math.max(0, 1 - (S.rainK || 0) * 2.5);
    if (F.sub || F.insideB || !M || !M.dist) k = 0;
    const n = S.day || 0;
    if (n !== this.night) { this.night = n; this.cells.clear(); }
    const on = k > 0 && cap > 0 && hash2(n, 17, 930) < FLIES.nights;
    this.t += dt;
    if (this.t - this.scanAt > FLIES.rescan) {
      this.scanAt = this.t;
      if (on) this.scan(F, M, n); else this.want.length = 0;
      this.assign(on ? cap : 0);
    }
    if (!live.length) return;
    const t = this.t, spr = glowSprite(), G = FLIES.glow;
    g.save();
    g.globalCompositeOperation = 'lighter';
    for (let i = live.length - 1; i >= 0; i--) {
      const f = live[i];
      // fade in when it comes, out when it goes (then back to the pool)
      if (f.out >= 0) { f.out += dt; if (f.out > 1.2) { live[i] = live[live.length - 1]; live.pop(); this.pool.push(f); continue; } }
      else f.in = Math.min(1, f.in + dt * 0.6);
      const fade = f.out >= 0 ? Math.max(0, 1 - f.out / 1.2) * f.in : f.in;
      // the drift: round its home in the glade, rising and settling
      f.x = f.g.x + f.hx + Math.sin(t * f.s1 * 6.283 + f.p1) * f.ax + Math.sin(t * f.s2 * 10.7 + f.p2) * f.ax * 0.3;
      f.y = f.g.y + f.hy + Math.sin(t * f.s2 * 6.283 + f.p2 * 1.3) * f.ay + Math.cos(t * f.s1 * 9.1 + f.p1) * f.ay * 0.3;
      f.z = f.zb + Math.sin(t * f.zs * 6.283 + f.p1) * 6;
      // the blink: dark, then eight steps of glow up and down
      const c = (t + f.off) % f.per;
      if (c >= G) continue;
      const step = Math.min(7, Math.floor((c / G) * 8)), b = [0.25, 0.55, 0.85, 1, 1, 0.8, 0.5, 0.22][step];
      const a = b * fade * k;
      if (a < 0.02) continue;
      const s = 5 + 7 * b, y = f.y - f.z;
      g.globalAlpha = Math.min(1, a);
      g.drawImage(spr, f.x - s, y - s, s * 2, s * 2);
      g.globalAlpha = Math.min(1, a * 1.2);
      g.fillStyle = '#fbffd0';
      g.fillRect(f.x - 0.8, y - 0.8, 1.6, 1.6);
    }
    g.restore();
  }
}
