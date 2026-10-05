// Lighting: modern light over the pixel-art world, in screen space, without touching the art.
//
//  * Light map: a half-resolution buffer filled with the sky's ambient colour, every light source
//    added on top ('lighter'), then multiplied over the scene. By day it's white (nothing changes);
//    at golden hour it warms everything; at night it's deep blue and only the lights show the world.
//  * Bloom / volumetrics: additive glows drawn over the result - lamp halos, light shafts down from
//    the lamp heads, headlight beams, neon bloom (the neon layer blurred by down- and up-scaling),
//    muzzle flashes and explosion fireballs. Thicker in fog and rain, as light scatters.
//  * Post: the sky's colour grade, sun glow off the side of the screen the sun is on, slow god rays
//    at sunrise and golden hour, a soft vignette, and a tilt-shift blur at the top and bottom of the
//    screen so the city reads like a model town.
// Lights are pooled (no allocation per frame) and drawn from cached tinted sprites (no gradient
// objects per light per frame). Quality: 2 high, 1 medium (no tilt-shift, lighter bloom), 0 low.

const SPR = 128;
let baseSprite = null, coneSprite = null;
function radialSprite() {
  if (baseSprite) return baseSprite;
  const c = document.createElement('canvas'); c.width = c.height = SPR;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(SPR / 2, SPR / 2, 0, SPR / 2, SPR / 2, SPR / 2);
  // a soft inverse-square-ish falloff
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.12, 'rgba(255,255,255,.82)');
  gr.addColorStop(0.3, 'rgba(255,255,255,.42)'); gr.addColorStop(0.55, 'rgba(255,255,255,.15)');
  gr.addColorStop(0.8, 'rgba(255,255,255,.04)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, SPR, SPR);
  baseSprite = c;
  return c;
}
// a light cone pointing +x from its apex at the left edge, centred vertically
function coneBase() {
  if (coneSprite) return coneSprite;
  const Wc = 256, Hc = 128;
  const c = document.createElement('canvas'); c.width = Wc; c.height = Hc;
  const g = c.getContext('2d');
  const img = g.createImageData(Wc, Hc);
  for (let y = 0; y < Hc; y++) for (let x = 0; x < Wc; x++) {
    const u = x / Wc, v = (y + 0.5 - Hc / 2) / (Hc / 2);
    const wid = 0.1 + 0.9 * u;
    const side = Math.abs(v) / wid;
    if (side >= 1) continue;
    const across = 1 - side * side;
    const along = Math.pow(1 - u, 1.25) * Math.min(1, u * 14);
    const a = across * along;
    const i = (y * Wc + x) * 4;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = 255; img.data[i + 3] = Math.round(255 * a);
  }
  g.putImageData(img, 0, 0);
  coneSprite = c;
  return c;
}
const tinted = new Map();
function tint(base, rgb, key) {
  const k = key + rgb.join(',');
  let c = tinted.get(k);
  if (c) return c;
  c = document.createElement('canvas'); c.width = base.width; c.height = base.height;
  const g = c.getContext('2d');
  g.drawImage(base, 0, 0);
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`; g.fillRect(0, 0, c.width, c.height);
  tinted.set(k, c);
  return c;
}
const q = (v) => Math.max(0, Math.min(255, Math.round(v / 8) * 8)); // colour buckets for the sprite cache
const keyRGB = (c) => [q(c[0]), q(c[1]), q(c[2])];

export const LIGHT = {
  sodium: [255, 186, 110], warm: [255, 206, 140], white: [235, 240, 255], head: [255, 236, 190], red: [255, 50, 40],
  amber: [255, 170, 40], green: [70, 255, 140], blue: [70, 120, 255], fire: [255, 140, 50], flash: [255, 230, 170],
  window: [255, 196, 120], cyan: [120, 230, 255], pink: [255, 90, 200], moon: [150, 170, 255],
};

export class Lighting {
  constructor() {
    this.lights = []; this.nL = 0;     // light map: {x, y, r, c, a, kind 0 point / 1 cone, ang, len, w}
    this.glows = []; this.nG = 0;      // additive over the scene: same shape
    this.lightCv = document.createElement('canvas'); this.lg = this.lightCv.getContext('2d');
    this.bloomA = document.createElement('canvas'); this.ba = this.bloomA.getContext('2d');
    this.bloomB = document.createElement('canvas'); this.bb = this.bloomB.getContext('2d');
    this.tiltA = document.createElement('canvas'); this.ta = this.tiltA.getContext('2d');
    this.tiltB = document.createElement('canvas'); this.tb = this.tiltB.getContext('2d');
    this.vig = null;
    this.W = 0; this.H = 0;
    this.quality = 2;
  }
  resize(W, H) {
    if (W === this.W && H === this.H) return;
    this.W = W; this.H = H;
    this.lightCv.width = Math.ceil(W / 2); this.lightCv.height = Math.ceil(H / 2);
    this.bloomA.width = Math.ceil(W / 4); this.bloomA.height = Math.ceil(H / 4);
    this.bloomB.width = Math.ceil(W / 12); this.bloomB.height = Math.ceil(H / 12);
    this.tiltA.width = Math.ceil(W / 3); this.tiltA.height = Math.ceil(H / 3);
    this.tiltB.width = Math.ceil(W / 6); this.tiltB.height = Math.ceil(H / 6);
    this.vig = null;
  }
  begin(sky, cam, z, quality) {
    this.nL = 0; this.nG = 0;
    this.sky = sky; this.cam = cam; this.z = z; this.quality = quality;
  }
  _push(arr, n, x, y, r, c, a, kind, ang, len, w) {
    let o = arr[n];
    if (!o) arr[n] = o = {};
    o.x = x; o.y = y; o.r = r; o.c = c; o.a = a; o.kind = kind; o.ang = ang; o.len = len; o.w = w;
  }
  // a point light (world px): radius r, colour, intensity 0..1+
  add(x, y, r, c, a) { if (a > 0.01) this._push(this.lights, this.nL++, x, y, r, c, a, 0, 0, 0, 0); }
  // a cone of light from (x, y) along angle ang: length len, half-width at the end w
  cone(x, y, ang, len, w, c, a) { if (a > 0.01) this._push(this.lights, this.nL++, x, y, 0, c, a, 1, ang, len, w); }
  // additive bloom over the scene: a soft glow / a volumetric beam
  glow(x, y, r, c, a) { if (a > 0.01) this._push(this.glows, this.nG++, x, y, r, c, a, 0, 0, 0, 0); }
  beam(x, y, ang, len, w, c, a) { if (a > 0.01) this._push(this.glows, this.nG++, x, y, 0, c, a, 1, ang, len, w); }

  _draw(g, o, sx, sy, k) {
    const c = keyRGB(o.c);
    if (o.kind === 0) {
      const r = o.r * k;
      if (sx < -r || sy < -r || sx > g.canvas.width + r || sy > g.canvas.height + r) return;
      g.globalAlpha = Math.min(1, o.a);
      g.drawImage(tint(radialSprite(), c, 'r'), sx - r, sy - r, r * 2, r * 2);
      if (o.a > 1) { g.globalAlpha = Math.min(1, o.a - 1); g.drawImage(tint(radialSprite(), c, 'r'), sx - r, sy - r, r * 2, r * 2); }
    } else {
      const len = o.len * k, w = o.w * k;
      g.save(); g.translate(sx, sy); g.rotate(o.ang);
      g.globalAlpha = Math.min(1, o.a);
      g.drawImage(tint(coneBase(), c, 'c'), 0, -w, len, w * 2);
      g.restore();
    }
  }

  // Multiply the light map over the scene (g in device px with an identity transform). The sky's
  // colour grade and the vignette are folded into it, so the whole thing is one full-screen pass.
  applyLightMap(g, DPR) {
    const sky = this.sky;
    const amb = sky.amb, gr = sky.grade;
    const dayish = amb[0] > 0.985 && amb[1] > 0.985 && amb[2] > 0.985;
    const vignette = this.quality >= 2 || !dayish;
    if (dayish && gr[3] < 0.01 && !vignette) return;
    const lg = this.lg, lw = this.lightCv.width, lh = this.lightCv.height;
    lg.globalCompositeOperation = 'source-over';
    lg.globalAlpha = 1;
    // ambient, tinted by the sky's grade (golden hour warms, blue hour cools)
    const ga = Math.min(0.6, gr[3] * 2.2);
    const tint = (k) => amb[k] * (1 - ga + ga * (gr[k] / 255) * 1.12);
    lg.fillStyle = `rgb(${Math.min(255, Math.round(tint(0) * 255))},${Math.min(255, Math.round(tint(1) * 255))},${Math.min(255, Math.round(tint(2) * 255))})`;
    lg.fillRect(0, 0, lw, lh);
    lg.globalCompositeOperation = 'lighter';
    if (!dayish) {
      const k = this.z / 2, cx = this.cam.x, cy = this.cam.y, W = this.W, H = this.H;
      for (let i = 0; i < this.nL; i++) {
        const o = this.lights[i];
        this._draw(lg, o, ((o.x - cx) * this.z + W / 2) / 2, ((o.y - cy) * this.z + H / 2) / 2, k);
      }
    }
    lg.globalAlpha = 1;
    if (vignette) {
      if (!this.vig) {
        const v = document.createElement('canvas'); v.width = 256; v.height = 144;
        const vg = v.getContext('2d');
        const rg = vg.createRadialGradient(128, 72, 40, 128, 72, 150);
        rg.addColorStop(0, 'rgba(255,255,255,1)'); rg.addColorStop(0.6, 'rgba(240,240,244,1)'); rg.addColorStop(1, 'rgba(170,170,185,1)');
        vg.fillStyle = rg; vg.fillRect(0, 0, 256, 144);
        this.vig = v;
      }
      lg.globalCompositeOperation = 'multiply';
      lg.drawImage(this.vig, 0, 0, lw, lh);
    }
    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'multiply';
    g.imageSmoothingEnabled = true;
    g.drawImage(this.lightCv, 0, 0, this.W * DPR, this.H * DPR);
    g.restore();
  }

  // Additive glows, beams and flares (g in device px).
  applyGlows(g, DPR) {
    if (!this.nG) return;
    g.save();
    g.setTransform(DPR, 0, 0, DPR, 0, 0);
    g.globalCompositeOperation = 'lighter';
    const k = this.z, cx = this.cam.x, cy = this.cam.y, W = this.W, H = this.H;
    for (let i = 0; i < this.nG; i++) {
      const o = this.glows[i];
      this._draw(g, o, (o.x - cx) * k + W / 2, (o.y - cy) * k + H / 2, k);
    }
    g.restore();
  }

  // A soft bloom of an emissive layer (the neon / lit-window canvas, device px): blurred by scaling
  // down twice and back up.
  bloom(g, src, a) {
    if (this.quality < 1 || a <= 0.01) return;
    const ba = this.ba, bb = this.bb;
    ba.globalCompositeOperation = 'copy'; ba.imageSmoothingEnabled = true;
    ba.drawImage(src, 0, 0, this.bloomA.width, this.bloomA.height);
    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'lighter';
    g.imageSmoothingEnabled = true;
    g.globalAlpha = a * 0.32;
    g.drawImage(this.bloomA, 0, 0, g.canvas.width, g.canvas.height);
    if (this.quality >= 2) {
      bb.globalCompositeOperation = 'copy'; bb.imageSmoothingEnabled = true;
      bb.drawImage(this.bloomA, 0, 0, this.bloomB.width, this.bloomB.height);
      g.globalAlpha = a * 0.42;
      g.drawImage(this.bloomB, 0, 0, g.canvas.width, g.canvas.height);
    }
    g.restore();
  }

  // Sun glow and god rays at a low sun, then tilt-shift (g in device px).
  post(g, DPR, t, tiltShift) {
    const sky = this.sky, W = this.W, H = this.H;
    const warm = sky.warm * (1 - sky.night * 0.7);
    if (warm > 0.02 && this.quality >= 1) {
      g.save();
      g.setTransform(DPR, 0, 0, DPR, 0, 0);
      // low sun: warm light washing in from the side it's on (east in the morning, west at dusk)
      const fromRight = sky.minutes < 720;
      const bw = W * 0.45, bx = fromRight ? W - bw : 0;
      const lin = g.createLinearGradient(fromRight ? W : 0, 0, fromRight ? W - bw : bw, H * 0.25);
      const c = fromRight ? '255,160,130' : '255,175,90';
      lin.addColorStop(0, `rgba(${c},${(0.26 * warm).toFixed(3)})`); lin.addColorStop(1, `rgba(${c},0)`);
      g.globalCompositeOperation = 'lighter';
      g.fillStyle = lin; g.fillRect(bx, 0, bw, H);
      if (this.quality >= 2) {
        // god rays: long soft shafts slanting away from the sun, drifting slowly
        const ang = fromRight ? Math.PI * 0.8 : Math.PI * 0.2;
        const x0 = fromRight ? W : 0;
        for (let k = 0; k < 5; k++) {
          const ph = (t * 0.012 + k * 0.21) % 1;
          const a = 0.045 * warm * Math.sin(ph * Math.PI) * (0.6 + 0.4 * Math.sin(k * 2.3 + t * 0.2));
          if (a < 0.004) continue;
          const off = (ph - 0.5) * H * 1.8;
          g.save();
          g.translate(x0, off);
          g.rotate(ang);
          const wdt = 34 + (k % 3) * 30;
          const lg2 = g.createLinearGradient(0, -wdt, 0, wdt);
          lg2.addColorStop(0, 'rgba(255,220,160,0)'); lg2.addColorStop(0.5, `rgba(255,214,150,${a.toFixed(3)})`); lg2.addColorStop(1, 'rgba(255,220,160,0)');
          g.fillStyle = lg2; g.fillRect(0, -wdt, Math.hypot(W, H), wdt * 2);
          g.restore();
        }
      }
      g.restore();
    }
    if (tiltShift && this.quality >= 2) this.tilt(g);
  }

  // Tilt-shift: the top and bottom of the screen slightly out of focus (a model city).
  tilt(g) {
    const cw = g.canvas.width, ch = g.canvas.height;
    const ta = this.ta, tb = this.tb;
    ta.globalCompositeOperation = 'copy'; ta.imageSmoothingEnabled = true;
    ta.drawImage(g.canvas, 0, 0, this.tiltA.width, this.tiltA.height);
    tb.globalCompositeOperation = 'copy'; tb.imageSmoothingEnabled = true;
    tb.drawImage(this.tiltA, 0, 0, this.tiltB.width, this.tiltB.height);
    // keep only the bands: opaque at the very top and bottom, clear across the middle
    tb.globalCompositeOperation = 'destination-in';
    const h = this.tiltB.height;
    const m = tb.createLinearGradient(0, 0, 0, h);
    m.addColorStop(0, 'rgba(0,0,0,.95)'); m.addColorStop(0.2, 'rgba(0,0,0,.35)'); m.addColorStop(0.36, 'rgba(0,0,0,0)');
    m.addColorStop(0.68, 'rgba(0,0,0,0)'); m.addColorStop(0.84, 'rgba(0,0,0,.4)'); m.addColorStop(1, 'rgba(0,0,0,.95)');
    tb.fillStyle = m; tb.fillRect(0, 0, this.tiltB.width, h);
    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'source-over';
    g.imageSmoothingEnabled = true;
    const bw = this.tiltB.width, top = Math.ceil(h * 0.36), bot = Math.floor(h * 0.68);
    g.drawImage(this.tiltB, 0, 0, bw, top, 0, 0, cw, ch * top / h);
    g.drawImage(this.tiltB, 0, bot, bw, h - bot, 0, ch * bot / h, cw, ch * (h - bot) / h);
    g.restore();
  }
}
