// Weather and the living street: wet roads, puddles that form as the rain goes on and dry up after,
// ripples on puddles and open water, splashes when people and cars go through, pools of water from
// smashed hydrants, fog rolling in off the water, steam out of manholes, the sky reflected on the
// water, and the rain itself (three depths of streaks, catching the light near lamps and headlights,
// drops bursting on the ground, lightning in a night storm).
// All of it is client-side decoration: deterministic where it's tied to the map (puddle and vent
// sites, fog banks), pooled where it moves.
import { T, TILE, MAP_W, MAP_H, CHUNK_PX } from '../../shared/constants.js';
import { hash } from './atmos.js';
import { freeCanvas } from '../platform.js';

const N = CHUNK_PX / TILE;
const SHAPES = 8;

// puddle shapes: soft-edged irregular blobs (white alpha masks), tinted per sky colour
let shapeCache = null;
function puddleShapes() {
  if (shapeCache) return shapeCache;
  shapeCache = [];
  for (let k = 0; k < SHAPES; k++) {
    const Wc = 96, Hc = 56, c = document.createElement('canvas'); c.width = Wc; c.height = Hc;
    const g = c.getContext('2d');
    for (let j = 0; j < 7; j++) {
      const cx = Wc / 2 + Math.sin(k * 2.1 + j * 1.7) * 22, cy = Hc / 2 + Math.cos(k * 1.3 + j * 2.6) * 9;
      const r = 13 + ((k * 5 + j * 3) % 7) * 2.6;
      const gr = g.createRadialGradient(cx, cy, 0, cx, cy, r);
      gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.7, 'rgba(255,255,255,.95)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr;
      g.save(); g.translate(cx, cy); g.scale(1.4, 0.75); g.translate(-cx, -cy);
      g.beginPath(); g.arc(cx, cy, r, 0, 6.283); g.fill();
      g.restore();
    }
    // harden the edge a little (puddles have a clear rim)
    const img = g.getImageData(0, 0, Wc, Hc);
    for (let i = 3; i < img.data.length; i += 4) { const a = img.data[i] / 255; img.data[i] = Math.round(255 * Math.min(1, Math.max(0, (a - 0.25) * 2.2))); }
    g.putImageData(img, 0, 0);
    shapeCache.push(c);
  }
  return shapeCache;
}
const tintCache = new Map();
function tinted(k, rgb) {
  const key = k + ':' + rgb.join(',');
  let c = tintCache.get(key);
  if (c) return c;
  if (tintCache.size > 400) { for (const c of tintCache.values()) freeCanvas(c); tintCache.clear(); }
  const s = puddleShapes()[k];
  c = document.createElement('canvas'); c.width = s.width; c.height = s.height;
  const g = c.getContext('2d');
  g.drawImage(s, 0, 0);
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`; g.fillRect(0, 0, c.width, c.height);
  tintCache.set(key, c);
  return c;
}
const qc = (v) => Math.max(0, Math.min(255, Math.round(v / 12) * 12));

// a tileable cloudy noise texture for fog (value noise, a few octaves)
let fogTex = null;
function fogTexture() {
  if (fogTex) return fogTex;
  const S = 128, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  const img = g.createImageData(S, S);
  const lattice = (n, x, y) => hash(((x % n) + n) % n, ((y % n) + n) % n, n * 97);
  const vnoise = (x, y, n) => {
    const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const a = lattice(n, x0, y0), b = lattice(n, x0 + 1, y0), c2 = lattice(n, x0, y0 + 1), d = lattice(n, x0 + 1, y0 + 1);
    return (a + (b - a) * sx) + ((c2 + (d - c2) * sx) - (a + (b - a) * sx)) * sy;
  };
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    let v = 0, amp = 0.55, tot = 0;
    for (const n of [4, 8, 16]) { v += vnoise(x / S * n, y / S * n, n) * amp; tot += amp; amp *= 0.5; }
    v /= tot;
    const a = Math.max(0, Math.min(1, (v - 0.25) * 1.6));
    const i = (y * S + x) * 4;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = 255; img.data[i + 3] = Math.round(a * 255);
  }
  g.putImageData(img, 0, 0);
  fogTex = c;
  return c;
}

const PUDDLE_DENS = { [T.ROAD]: 0.016, [T.SIDEWALK]: 0.008, [T.PLAZA]: 0.009, [T.LOT]: 0.03, [T.DIRT]: 0.045, [T.GRASS]: 0.004 };

export class Weather {
  constructor(map) {
    this.map = map;
    this.wet = 0;               // 0 dry .. 1 soaked (puddles grow with it)
    this.sites = new Map();     // chunk -> puddle sites
    this.vents = new Map();     // chunk -> steam vents
    this.pools = [];            // dynamic pools (smashed hydrants): { x, y, r, max, born, life }
    this.ripples = [];          // pooled rings { on, x, y, t, max, r, k }
    for (let i = 0; i < 90; i++) this.ripples.push({ on: false, x: 0, y: 0, t: 0, max: 1, r: 8, k: 1 });
    this.ri = 0;
    this.drops = [];
    this.burst = [];
    for (let i = 0; i < 70; i++) this.burst.push({ on: false, x: 0, y: 0, t: 0 });
    this.bi = 0;
    this.fogCv = document.createElement('canvas'); this.fg = this.fogCv.getContext('2d');
    this.fogMask = null;
    this.flash = 0; this.nextBolt = 20;
    this.lastSplash = new Map();
    this.visPuddles = [];
  }

  // ---- state ---------------------------------------------------------------------------------
  update(dt, raining, t) {
    // puddles take ~2 minutes of rain to fill, ~5 to dry up
    this.wet = Math.max(0, Math.min(1, this.wet + (raining ? dt / 110 : -dt / 300)));
    for (let i = this.pools.length - 1; i >= 0; i--) { const p = this.pools[i]; if (t - p.born > p.life) this.pools.splice(i, 1); }
    for (const r of this.ripples) if (r.on && (r.t += dt) > r.max) r.on = false;
    for (const b of this.burst) if (b.on && (b.t += dt) > 0.22) b.on = false;
    // lightning: now and then in a rain storm (brighter at night)
    this.flash = Math.max(0, this.flash - dt * 3.5);
    if (raining && this.wet > 0.3) {
      this.nextBolt -= dt;
      if (this.nextBolt <= 0) { this.flash = 1; this.nextBolt = 25 + Math.random() * 60; this.thunderIn = 0.6 + Math.random() * 1.8; }
    }
    if (this.thunderIn !== undefined) { this.thunderIn -= dt; if (this.thunderIn <= 0) { this.thunderIn = undefined; this.onThunder?.(); } }
  }
  ripple(x, y, r, max = 0.9, k = 1) {
    const o = this.ripples[this.ri]; this.ri = (this.ri + 1) % this.ripples.length;
    o.on = true; o.x = x; o.y = y; o.r = r; o.t = 0; o.max = max; o.k = k;
  }
  // a smashed hydrant floods the street round it
  addPool(x, y, max, t) { this.pools.push({ x, y, max, born: t, life: 200, k: Math.floor(hash(x | 0, y | 0) * SHAPES) }); }

  // ---- puddle sites ------------------------------------------------------------------------------
  _sites(cx, cy) {
    const key = cy * 1000 + cx;
    let s = this.sites.get(key);
    if (s) return s;
    s = [];
    const m = this.map;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const tx = cx * N + i, ty = cy * N + j;
      if (tx >= MAP_W || ty >= MAP_H) continue;
      const t = m.tiles[ty * MAP_W + tx];
      const d = PUDDLE_DENS[t];
      if (!d) continue;
      const h = hash(tx, ty, 91);
      if (h > d) continue;
      // bigger by the kerb and in dips; some only after a long soaking
      const h2 = hash(tx, ty, 92), h3 = hash(tx, ty, 93);
      s.push({ x: (tx + h2) * TILE, y: (ty + h3) * TILE, r: 14 + h2 * 26 + (t === T.LOT || t === T.DIRT ? 10 : 0), t0: h * 9 / d * 0.06, k: Math.floor(h3 * SHAPES), a: (h2 - 0.5) * 0.6 });
    }
    // steam vents (manholes / potholes) on the roads of this chunk
    const v = [];
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const tx = cx * N + i, ty = cy * N + j;
      if (tx >= MAP_W || ty >= MAP_H || m.tiles[ty * MAP_W + tx] !== T.ROAD || m.deck[ty * MAP_W + tx]) continue;
      if (hash(tx, ty, 57) < 0.0035) v.push({ x: (tx + 0.5) * TILE, y: (ty + 0.5) * TILE, id: tx * 7919 + ty });
    }
    this.vents.set(key, v);
    this.sites.set(key, s);
    return s;
  }
  _each(view, fn, vents = false) {
    for (let cy = Math.max(0, Math.floor(view.y0 / CHUNK_PX)); cy <= Math.floor(view.y1 / CHUNK_PX); cy++)
      for (let cx = Math.max(0, Math.floor(view.x0 / CHUNK_PX)); cx <= Math.floor(view.x1 / CHUNK_PX); cx++) {
        const s = this._sites(cx, cy);
        for (const p of vents ? this.vents.get(cy * 1000 + cx) : s) fn(p);
      }
  }

  // Puddles (world transform): the sky in them, the lights round them caught on the surface, and a
  // ripple now and then while it rains. lights: [{x, y, c:[r,g,b], a}] (the light sources in view).
  drawPuddles(g, view, sky, lights, raining, t, dt, quality) {
    const vis = this.visPuddles; vis.length = 0;
    const wet = this.wet;
    if (wet > 0.02) this._each(view, (p) => {
      if (wet <= p.t0) return;
      const k = Math.min(1, (wet - p.t0) / (1 - p.t0) * 1.6);
      if (p.x < view.x0 - 60 || p.x > view.x1 + 60 || p.y < view.y0 - 40 || p.y > view.y1 + 40) return;
      vis.push({ x: p.x, y: p.y, rx: p.r * (0.35 + 0.65 * k), k: p.k, a: p.a });
    });
    for (const p of this.pools) {
      const age = t - p.born;
      const k = Math.min(1, age / 12) * Math.min(1, (p.life - age) / 60);
      if (k <= 0) continue;
      vis.push({ x: p.x, y: p.y, rx: p.max * k, k: p.k, a: 0, pool: true });
    }
    if (!vis.length) return;
    const night = sky.night;
    // the water: darker than the ground, holding the sky's colour
    const deep = [qc(sky.sky[0] * 0.35 + 10), qc(sky.sky[1] * 0.35 + 14), qc(sky.sky[2] * 0.4 + 22)];
    const shine = [qc(sky.sky[0]), qc(sky.sky[1]), qc(sky.sky[2])];
    g.save();
    for (const p of vis) {
      const w = p.rx * 2.2, h = p.rx * 1.25;
      g.globalAlpha = 0.55;
      g.drawImage(tinted(p.k, deep), p.x - w / 2, p.y - h / 2, w, h);
      g.globalAlpha = 0.22 + 0.12 * (1 - night);
      g.drawImage(tinted((p.k + 3) % SHAPES, shine), p.x - w * 0.35, p.y - h * 0.3, w * 0.62, h * 0.5);
    }
    g.restore();
    // rain landing in them
    if (raining) {
      for (let k = 0; k < vis.length * dt * 5; k++) {
        const p = vis[(Math.random() * vis.length) | 0];
        this.ripple(p.x + (Math.random() - 0.5) * p.rx * 1.4, p.y + (Math.random() - 0.5) * p.rx * 0.6, 4 + Math.random() * 5, 0.7, 0.8);
      }
    }
    // the hydrant pools ripple from the spray even when it's dry
    for (const p of vis) if (p.pool && Math.random() < dt * 3) this.ripple(p.x + (Math.random() - 0.5) * p.rx, p.y + (Math.random() - 0.5) * p.rx * 0.5, 5 + Math.random() * 6, 0.9, 1);
  }

  // The lights caught in the puddles, drawn after the light map so they glow in the dark: each light
  // near a puddle leaves a short bright streak (its colour, a white-hot core) on the side facing it,
  // stretched toward the viewer like a reflection on wet tarmac. World transform.
  drawGlints(g, lights, quality, night = 0) {
    const vis = this.visPuddles;
    if (!vis.length || quality < 1) return;
    g.save();
    g.globalCompositeOperation = 'lighter';
    // at night the water still holds a little of the city's glow, so the puddles read as glassy
    if (night > 0.1) {
      g.globalAlpha = 0.16 * night;
      for (const p of vis) { const w = p.rx * 2.2, h = p.rx * 1.25; g.drawImage(tinted(p.k, [48, 60, 96]), p.x - w / 2, p.y - h / 2, w, h); }
    }
    for (const p of vis) for (const L of lights) {
      const dx = L.x - p.x, dy = L.y - p.y, d = Math.hypot(dx, dy);
      if (d > 220) continue;
      const a = L.a * (1 - d / 220);
      if (a < 0.04) continue;
      const w = Math.max(4, Math.min(p.rx * 0.45, 11)), h = Math.max(6, Math.min(p.rx * 0.95, 24));
      const ox = p.x + (dx / (d || 1)) * p.rx * 0.45, oy = p.y + (dy / (d || 1)) * p.rx * 0.18 + h * 0.15;
      g.globalAlpha = Math.min(0.75, a * 0.8);
      g.drawImage(tinted(p.k, [qc(L.c[0]), qc(L.c[1]), qc(L.c[2])]), ox - w / 2, oy - h / 2, w, h);
      g.globalAlpha = Math.min(0.5, a * 0.5);
      g.drawImage(tinted(p.k, [255, 255, 255]), ox - w * 0.2, oy - h * 0.3, w * 0.4, h * 0.6);
    }
    g.restore();
  }

  // Is (x, y) standing in water (a puddle, a hydrant pool)?
  puddleAt(x, y) {
    for (const p of this.visPuddles) { const dx = (x - p.x) / p.rx, dy = (y - p.y) / (p.rx * 0.55); if (dx * dx + dy * dy < 1) return p; }
    return null;
  }

  // Splashes: people and cars going through puddles throw water up and ring the surface.
  splashes(ents, fx, sound, now) {
    if (!this.visPuddles.length) return;
    for (const e of ents) {
      if (e._wx === undefined) { e._wx = e.rx; e._wy = e.ry; continue; }
      const sp = Math.hypot(e.rx - e._wx, e.ry - e._wy);
      e._wx = e.rx; e._wy = e.ry;
      if (sp < 1.2 || (e.rz || 0) > 0.1) continue;
      const p = this.puddleAt(e.rx, e.ry);
      if (!p) continue;
      const last = this.lastSplash.get(e.id) || 0;
      const car = e.kind === 2;
      if (now - last < (car ? 0.12 : 0.28)) continue;
      this.lastSplash.set(e.id, now);
      const n = car ? 8 + Math.min(14, sp * 1.5) : 4;
      for (let i = 0; i < n; i++) {
        const a = Math.random() * 6.283, s = (car ? 60 + sp * 14 : 30) * (0.5 + Math.random());
        fx.spawn(5, e.rx + Math.cos(a) * 6, e.ry + Math.sin(a) * 4, Math.cos(a) * s, Math.sin(a) * s, 0.35 + Math.random() * 0.25, 1.5 + Math.random() * 2, '#d6ecff', 0, car ? 90 : 50);
      }
      this.ripple(e.rx, e.ry, car ? 18 : 9, car ? 0.8 : 0.6, 1.2);
      sound(car ? 0.5 : 0.25);
    }
    if (this.lastSplash.size > 400) this.lastSplash.clear();
  }

  // ripples on open water while it rains
  rainOnWater(view, dt) {
    const m = this.map;
    for (let k = 0; k < dt * 26; k++) {
      const x = view.x0 + Math.random() * (view.x1 - view.x0), y = view.y0 + Math.random() * (view.y1 - view.y0);
      const t = m.tileAtPx(x, y);
      if (t === T.WATER || t === T.DEEP) this.ripple(x, y, 5 + Math.random() * 7, 0.9, 0.7);
    }
  }
  drawRipples(g) {
    g.save();
    g.lineWidth = 1.2;
    for (const r of this.ripples) {
      if (!r.on) continue;
      const k = r.t / r.max;
      g.strokeStyle = `rgba(225,240,255,${(0.55 * (1 - k) * r.k).toFixed(3)})`;
      g.beginPath(); g.ellipse(r.x, r.y, r.r * (0.3 + k), r.r * (0.3 + k) * 0.5, 0, 0, 6.283); g.stroke();
    }
    g.restore();
  }

  // Steam: some manholes breathe steam for a while, then stop (more of them on cold, wet nights).
  steam(view, fx, dt, t, sky) {
    const boost = 1 + sky.rain * 0.8 + sky.night * 0.4;
    this._each(view, (v) => {
      if (v.x < view.x0 - 40 || v.x > view.x1 + 40 || v.y < view.y0 - 60 || v.y > view.y1 + 40) return;
      if (hash(v.id, Math.floor(t / 45), 61) > 0.32 * boost) return;
      if (Math.random() > dt * 6) return;
      fx.spawn(2, v.x + (Math.random() - 0.5) * 12, v.y + (Math.random() - 0.5) * 6, 8 + (Math.random() - 0.5) * 14, -16 - Math.random() * 12, 2.6 + Math.random() * 1.6, 3 + Math.random() * 3, 'rgba(232,236,242,', 7);
    }, true);
  }
  // the vent itself (a manhole cover) drawn by the ground; this marks which ones are live
  ventsIn(view) { const out = []; this._each(view, (v) => out.push(v), true); return out; }

  // ---- fog ---------------------------------------------------------------------------------------
  _mask() {
    if (this.fogMask) return this.fogMask;
    // 1 px per 4 tiles: thick over and beside water, fading inland; some coasts foggier than others
    const m = this.map, S = 4, w = Math.ceil(MAP_W / S), h = Math.ceil(MAP_H / S);
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d');
    const img = g.createImageData(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const tx = Math.min(MAP_W - 1, x * S + 2), ty = Math.min(MAP_H - 1, y * S + 2), i = ty * MAP_W + tx;
      const ds = m.distSea ? m.distSea[i] / 4 : 99, dr = m.distRiver ? m.distRiver[i] / 4 : 99;
      const wet = !m.land[i] || m.lake[i] ? 1 : Math.max(0, 1 - Math.min(ds, dr * 1.4) / 46);
      const region = 0.55 + 0.45 * hash(Math.floor(tx / 90), Math.floor(ty / 90), 71);
      const a = Math.pow(wet, 1.4) * region;
      const k = (y * w + x) * 4;
      img.data[k] = img.data[k + 1] = img.data[k + 2] = 255; img.data[k + 3] = Math.round(255 * Math.min(1, a));
    }
    g.putImageData(img, 0, 0);
    this.fogMask = c;
    return c;
  }
  // Fog over the scene (device px, identity transform), drawn before the light map so the street
  // lights glow through it.
  drawFog(g, sky, cam, z, W, H, DPR, t) {
    const fog = sky.fog;
    const k = Math.max(fog.k, sky.rain * 0.18);
    if (k < 0.02) return;
    const fw = Math.ceil(W / 4), fh = Math.ceil(H / 4);
    if (this.fogCv.width !== fw || this.fogCv.height !== fh) { this.fogCv.width = fw; this.fogCv.height = fh; }
    const fg = this.fg;
    fg.globalCompositeOperation = 'copy';
    fg.globalAlpha = 1;
    // two layers of drifting cloud
    const tex = fogTexture(), sc = z / 4, ts = 1100 * sc;
    const vx0 = cam.x - W / 2 / z, vy0 = cam.y - H / 2 / z;
    for (let layer = 0; layer < 2; layer++) {
      const ox = ((-(vx0 + t * (14 + layer * 9)) * sc) % ts + ts) % ts - ts, oy = ((-(vy0 + t * (4 - layer * 3)) * sc) % ts + ts) % ts - ts;
      fg.globalCompositeOperation = layer ? 'source-over' : 'copy';
      fg.globalAlpha = layer ? 0.6 : 1;
      for (let y = oy; y < fh; y += ts) for (let x = ox; x < fw; x += ts) fg.drawImage(tex, x, y, ts, ts);
    }
    // keep it where the fog lies: by the water, and further inland the thicker it is
    const mask = this._mask();
    fg.globalCompositeOperation = 'destination-in';
    fg.globalAlpha = 1;
    const mw = 4 * TILE, sx = vx0 / mw, sy = vy0 / mw, sw = W / z / mw, sh = H / z / mw;
    fg.imageSmoothingEnabled = true;
    fg.drawImage(mask, sx, sy, sw, sh, 0, 0, fw, fh);
    if (fog.spread > 0.3 && fog.k > 0.2) { // a thick morning: a thin veil over the whole city too
      fg.globalCompositeOperation = 'destination-over';
      fg.globalAlpha = 0.35 * fog.spread;
      fg.fillStyle = '#fff'; fg.fillRect(0, 0, fw, fh);
    }
    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'source-over';
    g.imageSmoothingEnabled = true;
    // the fog's colour: bright and slightly warm by day, a cool grey at night (the light map then
    // darkens it - except round the lamps, where it glows)
    const tc = this._tintFog(sky);
    g.globalAlpha = Math.min(0.8, k * 0.85);
    g.drawImage(tc, 0, 0, g.canvas.width, g.canvas.height);
    g.restore();
  }
  _tintFog(sky) {
    if (!this.fogTint) { this.fogTint = document.createElement('canvas'); this.ft = this.fogTint.getContext('2d'); }
    const c = this.fogTint, w = this.fogCv.width, h = this.fogCv.height;
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    const ft = this.ft;
    ft.globalCompositeOperation = 'copy';
    ft.drawImage(this.fogCv, 0, 0);
    ft.globalCompositeOperation = 'source-in';
    const s = sky.sky, n = sky.night;
    ft.fillStyle = `rgb(${Math.round(225 + (s[0] - 200) * 0.15 * (1 - n))},${Math.round(228 + (s[1] - 200) * 0.12 * (1 - n))},${Math.round(232 + (s[2] - 200) * 0.1 * (1 - n))})`;
    ft.fillRect(0, 0, w, h);
    return c;
  }

  // ---- the rain itself (screen px) ---------------------------------------------------------------
  // lights: screen-space light sources [{x, y, r, c}] - streaks near them catch the light.
  drawRain(g, W, H, dt, lights, sky, quality, wind = 0.18) {
    const want = quality >= 2 ? 300 : quality >= 1 ? 200 : 120;
    while (this.drops.length < want) { const z = Math.random(); this.drops.push({ x: Math.random() * W, y: Math.random() * H, z, s: 520 + z * 620 }); }
    this.drops.length = want;
    const night = sky.night;
    g.save();
    g.lineCap = 'round';
    // three depths: far streaks thin and faint, near ones long and bright
    for (let layer = 0; layer < 3; layer++) {
      const lo = layer / 3, hi = (layer + 1) / 3;
      g.strokeStyle = `rgba(190,206,240,${(0.16 + layer * 0.1 + 0.06 * (1 - night)).toFixed(3)})`;
      g.lineWidth = 0.8 + layer * 0.5;
      g.beginPath();
      for (const r of this.drops) {
        if (r.z < lo || r.z >= hi) continue;
        r.y += r.s * dt; r.x -= r.s * wind * dt;
        if (r.y > H + 20) { r.y = -20; r.x = Math.random() * (W + 120); }
        if (r.x < -20) r.x += W + 40;
        const len = 8 + r.z * 16;
        g.moveTo(r.x, r.y); g.lineTo(r.x + len * wind, r.y - len);
      }
      g.stroke();
    }
    // streaks passing through a light's glow catch its colour
    if (lights.length && night > 0.15) {
      g.globalCompositeOperation = 'lighter';
      g.lineWidth = 1.4;
      for (const r of this.drops) {
        for (const L of lights) {
          const dx = r.x - L.x, dy = r.y - L.y, rr = L.r;
          if (dx > rr || dx < -rr || dy > rr || dy < -rr) continue;
          const d = Math.hypot(dx, dy);
          if (d > rr) continue;
          const a = (1 - d / rr) * 0.75 * night * L.a;
          g.strokeStyle = `rgba(${L.c[0]},${L.c[1]},${L.c[2]},${a.toFixed(3)})`;
          const len = 8 + r.z * 16;
          g.beginPath(); g.moveTo(r.x, r.y); g.lineTo(r.x + len * wind, r.y - len); g.stroke();
          break;
        }
      }
      g.globalCompositeOperation = 'source-over';
    }
    // drops bursting on the ground
    for (let k = 0; k < dt * (quality >= 1 ? 90 : 40); k++) { const b = this.burst[this.bi]; this.bi = (this.bi + 1) % this.burst.length; b.on = true; b.x = Math.random() * W; b.y = Math.random() * H; b.t = 0; }
    g.strokeStyle = `rgba(215,228,255,${(0.32 + 0.1 * (1 - night)).toFixed(3)})`;
    g.lineWidth = 1;
    g.beginPath();
    for (const b of this.burst) {
      if (!b.on) continue;
      const k = b.t / 0.22, r = 1.5 + k * 5;
      g.moveTo(b.x + r, b.y); g.ellipse(b.x, b.y, r, r * 0.45, 0, 0, 6.283);
    }
    g.stroke();
    // lightning
    if (this.flash > 0) {
      g.globalCompositeOperation = 'lighter';
      const f = this.flash * (0.35 + 0.5 * night) * (Math.random() < 0.2 ? 0.4 : 1);
      g.fillStyle = `rgba(200,215,255,${f.toFixed(3)})`;
      g.fillRect(0, 0, W, H);
    }
    g.restore();
  }

  // The sky on open water (world transform): a sheen of the sky's colour on every water tile in
  // view, strongest at sunrise and sunset.
  drawWaterSheen(g, view, sky, t) {
    const m = this.map;
    const a = 0.08 + 0.16 * sky.warm + 0.06 * sky.night;
    if (a < 0.02) return;
    const s = sky.sky;
    g.save();
    g.globalCompositeOperation = 'screen';
    const tx0 = Math.max(0, Math.floor(view.x0 / TILE)), tx1 = Math.min(MAP_W - 1, Math.floor(view.x1 / TILE));
    const ty0 = Math.max(0, Math.floor(view.y0 / TILE)), ty1 = Math.min(MAP_H - 1, Math.floor(view.y1 / TILE));
    for (let ty = ty0; ty <= ty1; ty++) {
      // a band of light rippling across the water, brighter toward the top of the screen (the far side)
      const band = 0.75 + 0.25 * Math.sin(ty * 0.35 + t * 0.8);
      g.fillStyle = `rgba(${s[0] | 0},${s[1] | 0},${s[2] | 0},${(a * band).toFixed(3)})`;
      let run = -1;
      for (let tx = tx0; tx <= tx1 + 1; tx++) {
        const w = tx <= tx1 && (m.tiles[ty * MAP_W + tx] === T.WATER || m.tiles[ty * MAP_W + tx] === T.DEEP);
        if (w && run < 0) run = tx;
        else if (!w && run >= 0) { g.fillRect(run * TILE, ty * TILE, (tx - run) * TILE, TILE); run = -1; }
      }
    }
    g.restore();
  }
}
