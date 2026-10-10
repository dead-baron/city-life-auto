// Object-pooled particles (blood sprays, smoke, sparks, water, fire) and a ring buffer of
// persistent ground decals (blood pools, red footprints, skid marks, scorch) — no per-frame
// allocation on the hot path (GDD §14C, project rule: object pooling).

const MAX_P = 900;

// Scorch mark texture, built once: a soft sooty blotch with ragged edges and spatter, so an
// explosion leaves a believable burn instead of a flat dark disc.
let scorchTex = null;
function scorchTexture() {
  if (scorchTex) return scorchTex;
  const S = 128, c = document.createElement('canvas');
  c.width = S; c.height = S;
  const g = c.getContext('2d');
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const blob = (x, y, r, a) => {
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, `rgba(12,10,8,${a})`); gr.addColorStop(0.55, `rgba(20,16,12,${a * 0.6})`); gr.addColorStop(1, 'rgba(20,16,12,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 6.28); g.fill();
  };
  blob(64, 64, 46, 0.75);
  for (let i = 0; i < 14; i++) { const a = rnd() * 6.28, d = 14 + rnd() * 26; blob(64 + Math.cos(a) * d, 64 + Math.sin(a) * d, 10 + rnd() * 16, 0.35 + rnd() * 0.3); }
  g.fillStyle = 'rgba(14,12,10,0.7)';
  for (let i = 0; i < 40; i++) { const a = rnd() * 6.28, d = 30 + rnd() * 30, r = 0.8 + rnd() * 2.2; g.beginPath(); g.arc(64 + Math.cos(a) * d, 64 + Math.sin(a) * d, r, 0, 6.28); g.fill(); }
  scorchTex = c;
  return c;
}
const MAX_D = 700;

// soft round puffs for smoke and steam (one sprite per colour)
const puffs = new Map();
function puff(col) {
  let c = puffs.get(col);
  if (c) return c;
  c = document.createElement('canvas'); c.width = c.height = 48;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(24, 24, 0, 24, 24, 24);
  gr.addColorStop(0, col + '1)'); gr.addColorStop(0.45, col + '.6)'); gr.addColorStop(1, col + '0)');
  g.fillStyle = gr; g.fillRect(0, 0, 48, 48);
  puffs.set(col, c);
  return c;
}

export class FX {
  constructor() {
    this.p = new Array(MAX_P);
    for (let i = 0; i < MAX_P; i++) this.p[i] = { on: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, size: 1, color: '', type: 0, grow: 0, z: 0, vz: 0 };
    this.pi = 0;
    this.d = new Array(MAX_D);
    for (let i = 0; i < MAX_D; i++) this.d[i] = { on: false, x: 0, y: 0, a: 0, type: 0, size: 1, alpha: 1, born: 0, color: '' };
    this.di = 0;
    this.tracers = [];
    // flying chunks of smashed street furniture: a piece of the object's own sprite, spinning
    this.chunks = [];
    for (let i = 0; i < 40; i++) this.chunks.push({ on: false, img: null, sx: 0, sy: 0, sw: 0, sh: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, a: 0, va: 0, w: 0, h: 0, life: 0, rest: 0 });
    this.ci = 0;
    this.rings = [];
    this.texts = [];
    this.arcs = [];
  }
  spawn(type, x, y, vx, vy, life, size, color, grow = 0, vz = 0) {
    // "fewer particles": every other burst particle is skipped (the scratch object soaks up callers' edits)
    if (this.thin && type !== 6 && (this.skip = !this.skip)) return this.scratch || (this.scratch = {});
    const o = this.p[this.pi];
    this.pi = (this.pi + 1) % MAX_P;
    o.on = true; o.type = type; o.x = x; o.y = y; o.vx = vx; o.vy = vy; o.life = life; o.max = life; o.size = size; o.color = color; o.grow = grow; o.z = 0; o.vz = vz; o.veil = 1;   // (veil: drawn this much less solid - a manhole's thin steam)
    return o;
  }
  decal(type, x, y, a, size, color, now, alpha = 1) {
    const o = this.d[this.di];
    this.di = (this.di + 1) % MAX_D;
    o.on = true; o.type = type; o.x = x; o.y = y; o.a = a; o.size = size; o.color = color; o.born = now; o.alpha = alpha;
  }
  blood(x, y, a, n, now, rand = Math.random) {
    for (let i = 0; i < n; i++) {
      const sp = 60 + rand() * 180, aa = a + (rand() - 0.5) * 1.1;
      this.spawn(1, x, y, Math.cos(aa) * sp, Math.sin(aa) * sp, 0.35 + rand() * 0.3, 1.5 + rand() * 2, rand() < 0.5 ? '#8a0f14' : '#b0141c', 0, 80 + rand() * 60);
    }
    this.decal(1, x + Math.cos(a) * 12, y + Math.sin(a) * 12, a, 5 + n * 0.7, '#7a0d12', now, 0.85);
  }
  // A bullet hit (16-bit style): a cone of droplets out the far side, a little back-spatter, a
  // red puff, and splats on the ground behind the victim. Droplets that land leave spots too.
  bulletHit(x, y, a, now, rand = Math.random) {
    for (let i = 0; i < 14; i++) {
      const aa = a + (rand() - 0.5) * 0.9, sp = 140 + rand() * 260;
      this.spawn(1, x, y, Math.cos(aa) * sp, Math.sin(aa) * sp, 0.45 + rand() * 0.35, 2 + rand() * 2.5, rand() < 0.5 ? '#8a0f14' : '#c0161f', 0, 60 + rand() * 90);
    }
    for (let i = 0; i < 4; i++) {
      const aa = a + Math.PI + (rand() - 0.5) * 1.4, sp = 50 + rand() * 80;
      this.spawn(1, x, y, Math.cos(aa) * sp, Math.sin(aa) * sp, 0.3 + rand() * 0.2, 1.5 + rand() * 1.5, '#a0121a', 0, 40 + rand() * 40);
    }
    this.rings.push({ x, y, t: 0, max: 0.18, r: 9, color: 'rgba(200,24,32,' });
    for (let k = 0, n = 2 + Math.floor(rand() * 2); k < n; k++) {
      const d = 12 + rand() * 34, aa = a + (rand() - 0.5) * 0.6;
      this.decal(1, x + Math.cos(aa) * d, y + Math.sin(aa) * d, aa, 3 + rand() * 5, '#7a0d12', now, 0.85);
    }
  }
  drip(x, y, now, rand = Math.random) { this.decal(1, x + (rand() - 0.5) * 6, y + (rand() - 0.5) * 6, rand() * 6.28, 1.6 + rand() * 1.8, '#7a0d12', now, 0.8); }
  smoke(x, y, dark, rand = Math.random) {
    this.spawn(2, x + (rand() - 0.5) * 8, y + (rand() - 0.5) * 8, (rand() - 0.5) * 20, (rand() - 0.5) * 20 - 10, 1.2 + rand(), 6 + rand() * 4, dark ? 'rgba(40,40,40,' : 'rgba(170,170,170,', 14);
  }
  fire(x, y, rand = Math.random) {
    this.spawn(3, x + (rand() - 0.5) * 18, y + (rand() - 0.5) * 18, (rand() - 0.5) * 30, (rand() - 0.5) * 30, 0.4 + rand() * 0.3, 5 + rand() * 4, rand() < 0.5 ? '#ff9a1a' : '#ffd23a', -6);
  }
  sparks(x, y, n = 5, rand = Math.random) {
    for (let i = 0; i < n; i++) { const a = rand() * 6.28, s = 80 + rand() * 160; this.spawn(4, x, y, Math.cos(a) * s, Math.sin(a) * s, 0.2 + rand() * 0.2, 1.5, '#ffe58a'); }
  }
  splash(x, y, n = 10, rand = Math.random) {
    for (let i = 0; i < n; i++) { const a = rand() * 6.28, s = 30 + rand() * 90; this.spawn(5, x, y, Math.cos(a) * s, Math.sin(a) * s, 0.5 + rand() * 0.3, 2 + rand() * 2, '#d8f0ff', 0, 60); }
    this.rings.push({ x, y, t: 0, max: 0.9, r: 22, color: 'rgba(220,240,255,' });
  }
  explosion(x, y, r, now, rand = Math.random) {
    for (let i = 0; i < 40; i++) { const a = rand() * 6.28, s = 40 + rand() * r * 2.2; this.spawn(3, x, y, Math.cos(a) * s, Math.sin(a) * s, 0.4 + rand() * 0.5, 6 + rand() * 8, rand() < 0.5 ? '#ff7a1a' : '#ffd23a', 10); }
    for (let i = 0; i < 20; i++) this.smoke(x + (rand() - 0.5) * r, y + (rand() - 0.5) * r, true, rand);
    this.rings.push({ x, y, t: 0, max: 0.5, r: r * 1.4, color: 'rgba(255,220,140,' });
    this.decal(3, x, y, rand() * 6.28, r * 0.5, '#111', now, 0.7);
  }
  geyser(x, y, rand = Math.random) {
    for (let i = 0; i < 4; i++) this.spawn(6, x + (rand() - 0.5) * 6, y + (rand() - 0.5) * 6, (rand() - 0.5) * 40, (rand() - 0.5) * 40, 0.9, 3 + rand() * 3, rand() < 0.5 ? '#ffffff' : '#7ac8ff', 6, 120 + rand() * 80);
  }
  // melee impact: white-yellow star burst + ring, like a 16-bit "POW"
  impact(x, y, a, rand = Math.random) {
    for (let i = 0; i < 8; i++) {
      const aa = a + (rand() - 0.5) * 2.4, sp = 90 + rand() * 140;
      this.spawn(4, x, y, Math.cos(aa) * sp, Math.sin(aa) * sp, 0.18 + rand() * 0.1, 2.5, i % 2 ? '#fff6c0' : '#ffffff');
    }
    this.rings.push({ x, y, t: 0, max: 0.22, r: 16, color: 'rgba(255,250,210,' });
  }
  tracer(x1, y1, x2, y2, color = 'rgba(255,240,170,') { this.tracers.push({ x1, y1, x2, y2, t: 0, color }); }
  // a piece of a sprite (img rect sx,sy,sw,sh drawn w x h world px) thrown from (x, y)
  chunk(img, sx, sy, sw, sh, w, h, x, y, vx, vy, vz, va, rest = 6) {
    const o = this.chunks[this.ci]; this.ci = (this.ci + 1) % this.chunks.length;
    o.on = true; o.img = img; o.sx = sx; o.sy = sy; o.sw = sw; o.sh = sh; o.w = w; o.h = h;
    o.x = x; o.y = y; o.z = 2; o.vx = vx; o.vy = vy; o.vz = vz; o.a = 0; o.va = va; o.life = 0; o.rest = rest; o.vp = null;   // (vp: a vehicle's piece, for art v2 - render/vehdmg.js)
  }
  // bits that flutter down (paper, leaves, mail) and then lie where they land as litter
  flutter(x, y, n, colors, rand = Math.random, spread = 160, lift = 160) {
    for (let i = 0; i < n; i++) {
      const a = rand() * 6.283, sp = 20 + rand() * spread;
      const o = this.spawn(8, x, y, Math.cos(a) * sp, Math.sin(a) * sp, 2.2 + rand() * 1.8, 2 + rand() * 2.5, colors[i % colors.length], 0, lift * (0.5 + rand()));
      o.ph = rand() * 6.283;
    }
  }
  // litter left on the ground: small rotated scraps
  litter(x, y, n, colors, r, now, rand = Math.random) {
    for (let i = 0; i < n; i++) { const a = rand() * 6.283, d = Math.sqrt(rand()) * r; this.decal(6, x + Math.cos(a) * d, y + Math.sin(a) * d * 0.7, rand() * 6.283, 1.5 + rand() * 2.5, colors[i % colors.length], now, 0.95); }
  }
  ring(x, y, r, color, max = 0.6) { this.rings.push({ x, y, t: 0, max, r, color }); }
  // a blade's streak: an arc of radius r round (x, y), centred on heading a, sweeping across in the first third of
  // its life and fading out; glow: drawn again over the darkened scene at night (the plasma blade)
  slash(x, y, a, r, color = 'rgba(255,255,255,', max = 0.18, w = 3, glow = false) {
    if (this.arcs.length > 24) this.arcs.shift();
    this.arcs.push({ x, y, a, r, color, t: 0, max, w, glow });
  }
  drawArcs(g, glowOnly = false) {
    for (const s of this.arcs) {
      if (glowOnly && !s.glow) continue;
      const k = Math.min(1, s.t / s.max), a0 = s.a - 1.05, a1 = a0 + 2.1 * Math.min(1, k * 3 + 0.15);
      g.strokeStyle = s.color + (0.95 * (1 - k)).toFixed(2) + ')'; g.lineWidth = s.w * (1 - 0.5 * k); g.lineCap = 'round';
      g.beginPath(); g.arc(s.x, s.y, s.r, a0, a1); g.stroke();
      g.lineWidth = Math.max(1, s.w * 0.4); g.strokeStyle = s.color + (0.6 * (1 - k)).toFixed(2) + ')';
      g.beginPath(); g.arc(s.x, s.y, s.r * 0.82, a0 + 0.25, a1 - 0.1); g.stroke();
    }
    g.lineCap = 'butt';
  }
  floatText(x, y, text, color) { this.texts.push({ x, y, text, color, t: 0 }); }
  // A line said out loud: a speech bubble over the speaker (entity id) for `hold` seconds, following
  // them (aboard a moving train too) through this.resolve(id) -> { rx, ry }. A new line from the
  // same speaker replaces the last.
  say(id, x, y, text, color = '#ffd36b', hold = 2.6) {
    for (const t of this.texts) if (t.say && t.id === id) t.t = t.max;
    this.texts.push({ id, x, y, text, color, t: 0, max: hold, say: true });
  }

  update(dt) {
    for (let i = 0; i < MAX_P; i++) {
      const o = this.p[i];
      if (!o.on) continue;
      o.life -= dt;
      if (o.life <= 0) { o.on = false; continue; }
      if (o.type === 8) { // paper: drag, a slow sway, a gentle fall
        o.ph += dt * 5; o.vx = o.vx * 0.94 + Math.cos(o.ph) * 9; o.vy *= 0.94;
        o.x += o.vx * dt; o.y += o.vy * dt;
        o.vz = Math.max(-38, o.vz - 160 * dt); o.z += o.vz * dt;
        if (o.z <= 0) { o.on = false; this.decal(6, o.x, o.y, o.ph, o.size * 0.9, o.color, this.now || 0, 0.95); }
        continue;
      }
      if (o.type === 10) { // an ember (a campfire's, an explosion's): floats up on the heat, swaying, and fades
        o.ph = (o.ph || 0) + dt * 3; o.vx = o.vx * 0.96 + Math.cos(o.ph) * 5; o.vy *= 0.96;
        o.x += o.vx * dt; o.y += o.vy * dt; o.vz = o.vz * 0.97 + 10 * dt; o.z += o.vz * dt;
        continue;
      }
      o.x += o.vx * dt; o.y += o.vy * dt;
      const f = o.type === 2 ? 0.98 : 0.92;
      o.vx *= f; o.vy *= f;
      o.size += o.grow * dt;
      if (o.vz || o.z) {
        o.vz -= 400 * dt; o.z += o.vz * dt;
        if (o.z < 0) {
          o.z = 0; o.vz = 0;
          if (o.type === 9) { o.vx *= 0.3; o.vy *= 0.3; o.life = Math.min(o.life, 0.25); }   // (a chunk of concrete hits the street)
          if (o.type === 1) { o.on = false; if (Math.random() < 0.3) this.decal(1, o.x, o.y, Math.random() * 6.28, 1.2 + o.size * 0.5, '#7a0d12', this.now || 0, 0.8); } // a droplet lands
        }
      }
    }
    for (const c of this.chunks) {
      if (!c.on) continue;
      c.life += dt;
      if (c.z > 0 || c.vz > 0) {
        c.x += c.vx * dt; c.y += c.vy * dt; c.a += c.va * dt;
        c.vz -= 520 * dt; c.z += c.vz * dt;
        if (c.z <= 0) { c.z = 0; if (Math.abs(c.vz) > 90) { c.vz = -c.vz * 0.35; c.vx *= 0.5; c.vy *= 0.5; c.va *= 0.5; } else { c.vz = 0; c.vx = 0; c.vy = 0; c.va = 0; } }
      }
      if (c.life > c.rest + 1.5) c.on = false;
    }
    for (const arr of [this.tracers, this.rings, this.texts, this.arcs]) {
      for (let i = arr.length - 1; i >= 0; i--) { arr[i].t += dt; if (arr[i].t > (arr[i].max || (arr === this.tracers ? 0.08 : 1.4))) arr.splice(i, 1); }
    }
  }

  drawDecals(g, view, now, wet) {
    this.now = now;
    for (let i = 0; i < MAX_D; i++) {
      const d = this.d[i];
      if (!d.on) continue;
      if (d.x < view.x0 || d.x > view.x1 || d.y < view.y0 || d.y > view.y1) continue;
      const age = now - d.born;
      let a = d.alpha * (age > 240 ? Math.max(0, 1 - (age - 240) / 60) : 1);
      if (wet && d.type !== 3) a *= 0.995; // rain slowly washes stains
      if (wet && d.type !== 3) d.alpha *= 0.9995;
      if (a <= 0.02) { d.on = false; continue; }
      g.globalAlpha = a;
      g.fillStyle = d.color;
      if (d.type === 1) { // blood splat
        g.beginPath(); g.ellipse(d.x, d.y, d.size, d.size * 0.7, d.a, 0, 6.28); g.fill();
        g.beginPath(); g.arc(d.x + Math.cos(d.a) * d.size, d.y + Math.sin(d.a) * d.size, d.size * 0.35, 0, 6.28); g.fill();
      } else if (d.type === 2) { // footprint
        g.save(); g.translate(d.x, d.y); g.rotate(d.a); g.fillRect(-3, -2, 6, 3); g.restore();
      } else if (d.type === 3) { // scorch
        g.save(); g.translate(d.x, d.y); g.rotate(d.a);
        g.drawImage(scorchTexture(), -d.size * 1.2, -d.size * 1.2, d.size * 2.4, d.size * 2.4);
        g.restore();
      } else if (d.type === 4) { // skid
        g.save(); g.translate(d.x, d.y); g.rotate(d.a); g.fillRect(-4, -1.5, 8, 3); g.restore();
      } else if (d.type === 6) { // litter: a scrap of paper, a wrapper, a can
        g.save(); g.translate(d.x, d.y); g.rotate(d.a); g.fillRect(-d.size, -d.size * 0.6, d.size * 2, d.size * 1.2); g.restore();
      } else if (d.type === 5) { // body blood pool
        g.beginPath(); g.ellipse(d.x, d.y, d.size, d.size * 0.8, d.a, 0, 6.28); g.fill();
      }
    }
    g.globalAlpha = 1;
  }

  // The things that give off their own light, drawn again additively after the light map has
  // darkened the scene: flames, sparks, tracers (world transform).
  drawEmissive(g) {
    g.save();
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < MAX_P; i++) {
      const o = this.p[i];
      if (!o.on || (o.type !== 3 && o.type !== 4 && o.type !== 10)) continue;
      const k = o.life / o.max;
      g.globalAlpha = Math.min(1, k * 1.5) * (o.type === 3 ? 0.7 : 0.8);
      g.fillStyle = o.color;
      const s = o.size;
      g.fillRect(o.x - s / 2, o.y - s / 2 - o.z * 0.3, s, s);
    }
    g.globalAlpha = 1;
    g.lineWidth = 2;
    for (const t of this.tracers) {
      g.strokeStyle = t.color + (0.9 * (1 - t.t / 0.08)).toFixed(2) + ')';
      g.beginPath(); g.moveTo(t.x1, t.y1); g.lineTo(t.x2, t.y2); g.stroke();
    }
    this.drawArcs(g, true);
    g.restore();
  }

  drawParticles(g) {
    for (let i = 0; i < MAX_P; i++) {
      const o = this.p[i];
      if (!o.on) continue;
      const k = o.life / o.max;
      if (o.type === 2) { // a soft puff that fades in, then thins out as it spreads
        g.globalAlpha = Math.min(1, (1 - k) * 6) * k * (o.color.charCodeAt(5) === 50 ? 0.22 : 0.55) * (o.veil ?? 1); // steam (rgba(2..) is thinner than smoke
        const r = o.size * 1.6;
        g.drawImage(puff(o.color), o.x - r, o.y - r - o.z * 0.3, r * 2, r * 2);
        g.globalAlpha = 1;
        continue;
      }
      if (o.type === 8) { g.globalAlpha = 1; g.fillStyle = o.color; const w = o.size * (0.6 + 0.4 * Math.abs(Math.cos(o.ph))); g.fillRect(o.x - w / 2, o.y - o.size * 0.35 - o.z * 0.5, w, o.size * 0.7); continue; }
      g.globalAlpha = o.type === 3 ? Math.min(1, k * 1.5) : Math.min(1, k * 2);
      g.fillStyle = o.color;
      const s = o.size;
      g.fillRect(o.x - s / 2, o.y - s / 2 - o.z * 0.3, s, s);
    }
    g.globalAlpha = 1;
    for (const c of this.chunks) {
      if (!c.on || !c.img) continue;
      const fade = c.life > c.rest ? Math.max(0, 1 - (c.life - c.rest) / 1.5) : 1;
      g.globalAlpha = 0.35 * fade; g.fillStyle = '#000';
      g.beginPath(); g.ellipse(c.x + 2, c.y + 2, c.w * 0.4, c.h * 0.22, 0, 0, 6.283); g.fill();
      g.globalAlpha = fade;
      g.save(); g.translate(c.x, c.y - c.z * 0.6); g.rotate(c.a);
      g.drawImage(c.img, c.sx, c.sy, c.sw, c.sh, -c.w / 2, -c.h / 2, c.w, c.h);
      g.restore();
    }
    g.globalAlpha = 1;
    g.lineWidth = 2;
    for (const t of this.tracers) {
      g.strokeStyle = t.color + (1 - t.t / 0.08).toFixed(2) + ')';
      g.beginPath(); g.moveTo(t.x1, t.y1); g.lineTo(t.x2, t.y2); g.stroke();
    }
    for (const r of this.rings) {
      const k = r.t / r.max;
      g.strokeStyle = r.color + (1 - k).toFixed(2) + ')'; g.lineWidth = 3;
      g.beginPath(); g.arc(r.x, r.y, r.r * (0.3 + k), 0, 6.28); g.stroke();
    }
    this.drawArcs(g);
    this.drawTexts(g);
  }

  // floating text (rising and fading) and speech bubbles, in world px
  drawTexts(g) {
    g.font = 'bold 13px monospace'; g.textAlign = 'center';
    for (const t of this.texts) {
      if (t.say) { this.bubble(g, t); continue; }
      g.globalAlpha = Math.max(0, 1 - t.t / 1.4);
      g.fillStyle = '#000'; g.fillText(t.text, t.x + 1, t.y - t.t * 30 + 1);
      g.fillStyle = t.color; g.fillText(t.text, t.x, t.y - t.t * 30);
    }
    g.globalAlpha = 1;
  }
  bubble(g, t) {
    const e = t.id && this.resolve ? this.resolve(t.id) : null;
    if (e) { t.x = e.rx; t.y = e.ry; } // (gone from view: it stays where they were)
    const pop = Math.min(1, t.t / 0.12), a = Math.min(pop, (t.max - t.t) / 0.35);
    if (a <= 0) return;
    g.font = 'bold 12px monospace';
    const w = g.measureText(t.text).width + 12, h = 18, x = t.x, y = t.y - 40 - pop * 4;
    g.globalAlpha = a;
    g.fillStyle = 'rgba(12,12,16,.88)';
    g.fillRect(x - w / 2, y - h / 2, w, h);
    g.beginPath(); g.moveTo(x - 5, y + h / 2); g.lineTo(x + 5, y + h / 2); g.lineTo(x, y + h / 2 + 6); g.closePath(); g.fill(); // the tail, down to the speaker
    g.strokeStyle = t.color; g.lineWidth = 1.5; g.strokeRect(x - w / 2, y - h / 2, w, h);
    g.fillStyle = t.color; g.textBaseline = 'middle'; g.fillText(t.text, x, y + 1); g.textBaseline = 'alphabetic';
    g.font = 'bold 13px monospace';
  }
}
