// Explosions that make you go whoa (task #363), and being run over or riding a car's hood (task #361), as the
// clients play them. The server's 'explode' event carries a seed: the plan it makes (shared/explosions.js) and the
// throws below come from it, so every player sees the same pieces fly and the same wreck go up and come down where
// the server put it. An explosion is layered:
//   a white-hot flash that lights everything round it for a moment (the renderer's lights, strongest at night, and
//   a flash over the screen when it's close); an expanding fireball that rolls and breaks up into flames (soft glow
//   blobs, additive, over flame particles); a shockwave ring racing out over the ground with a skirt of dust;
//   sparks and burning embers flung out; a thick smoke column that rises and drifts on the wind for a long while;
//   debris - rubble and, when it blows apart, its doors, hood, wheels and panels in its own paint, scorched, that
//   tumble, bounce and burn out; a scorch on the ground; and a shake that falls off with distance.
//   Now and then a burning wheel rolls away (task #412: render/wheels.js, loaded with the first explosion).
// Everything is pooled (the particles in render/fx.js, the glow blobs, rings, columns and flights here: fixed
// arrays, nothing made per frame) and thinned on Low ('Fewer particles': fx.thin).
import { boomPlan } from '../../shared/explosions.js';
import { mulberry32 } from '../../shared/rng.js';
import { VEHICLE_BY_INDEX, PAINTS } from '../../shared/vehicles.js';
import { DECK_LIFT } from '../../shared/levels.js';
import { wind } from './flora/index.js';

const TAU = Math.PI * 2;
const ease = (k) => 1 - (1 - k) * (1 - k);

// soft round sprites, made once: 0 the fireball's hot glow, 1 fire, 2 smoke, 3 the warm haze
let SPR = null;
function sprites() {
  if (SPR) return SPR;
  const mk = (stops) => {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    for (const [o, col] of stops) gr.addColorStop(o, col);
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    return c;
  };
  SPR = [
    mk([[0, 'rgba(255,255,240,1)'], [0.3, 'rgba(255,236,150,.9)'], [0.65, 'rgba(255,150,40,.45)'], [1, 'rgba(255,90,10,0)']]),
    mk([[0, 'rgba(255,200,90,.95)'], [0.4, 'rgba(255,110,20,.7)'], [0.75, 'rgba(190,40,10,.3)'], [1, 'rgba(120,20,0,0)']]),
    mk([[0, 'rgba(28,26,25,.9)'], [0.5, 'rgba(38,36,34,.55)'], [1, 'rgba(50,48,46,0)']]),
    mk([[0, 'rgba(255,170,80,.55)'], [0.45, 'rgba(255,120,40,.22)'], [1, 'rgba(255,90,20,0)']]),
  ];
  return SPR;
}
export const hazeSprite = () => sprites()[3];

// the pieces a car blows apart into, drawn small in its paint, scorched: one strip of six per paint
// (door, hood, wheel, panel, trunk, bumper), cached by paint
export const PIECE_RECT = { d: [0, 16, 10], h: [16, 18, 14], w: [34, 10, 10], p: [44, 14, 8], t: [58, 14, 10], b: [72, 20, 5] };
const strips = new Map();
export function pieceStrip(paint) {
  let c = strips.get(paint);
  if (c) return c;
  c = document.createElement('canvas'); c.width = 92; c.height = 14;
  const g = c.getContext('2d'), R = mulberry32(paint.length * 7 + paint.charCodeAt(1));
  for (const k of 'dhwptb') {
    const [x, w, h] = PIECE_RECT[k];
    if (k === 'w') { g.fillStyle = '#141414'; g.beginPath(); g.arc(x + 5, 5, 5, 0, TAU); g.fill(); g.fillStyle = '#8a8a86'; g.beginPath(); g.arc(x + 5, 5, 2, 0, TAU); g.fill(); continue; }
    g.fillStyle = k === 'b' ? '#6b6b68' : paint; g.fillRect(x, 0, w, h);
    if (k === 'd') { g.fillStyle = '#1c2a33'; g.fillRect(x + 2, 1, w - 4, 3); }
    g.fillStyle = 'rgba(0,0,0,.45)'; g.fillRect(x, h - 2, w, 2);
    for (let i = 0; i < 5; i++) { g.fillStyle = `rgba(14,12,10,${(0.35 + R() * 0.5).toFixed(2)})`; g.fillRect(x + R() * (w - 3), R() * (h - 3), 2 + R() * 4, 2 + R() * 3); }   // (scorched)
  }
  if (strips.size > 16) strips.clear();
  strips.set(paint, c);
  return c;
}

export class Booms {
  constructor(S) {
    this.S = S;
    this.blobs = Array.from({ length: 128 }, () => ({ on: false, x: 0, y: 0, vx: 0, vy: 0, s: 0, s1: 0, t: 0, life: 1, spr: 0, a: 1, rise: 0 }));
    this.rings = Array.from({ length: 12 }, () => ({ on: false, x: 0, y: 0, r: 0, t: 0, life: 0.5 }));
    this.cols = Array.from({ length: 12 }, () => ({ on: false, x: 0, y: 0, t: 0, dur: 0, acc: 0, pacc: 0, big: 1 }));
    this.flights = Array.from({ length: 6 }, () => ({ on: false, id: 0, t0: 0, T: 1, h: 0, spin: 0, flip: 0, acc: 0 }));
    this.burners = Array.from({ length: 24 }, () => ({ c: null, until: 0, acc: 0 }));
    this.bumps = Array.from({ length: 8 }, () => ({ id: 0, t0: -9 }));
    this.riders = Array.from({ length: 8 }, () => ({ on: false, id: 0, t0: 0 }));
    this.wheels = null; this.wheelsP = null;   // (render/wheels.js, once loaded)
    this.flash = { t: 0, k: 0 };
    this.bi = 0; this.bu = 0; this.bp = 0;
  }
  _blob(x, y, vx, vy, s, s1, life, spr, a, rise) {
    const b = this.blobs[this.bi]; this.bi = (this.bi + 1) % this.blobs.length;
    b.on = true; b.x = x; b.y = y; b.vx = vx; b.vy = vy; b.s = s; b.s1 = s1; b.t = 0; b.life = life; b.spr = spr; b.a = a; b.rise = rise;
    return b;
  }
  _on(arr) { for (const o of arr) if (!o.on) return o; return arr[0]; }

  // The 'explode' event (a vehicle: ev.id/m/k/pc, its seed ev.s; a rocket: just x, y, r and the seed).
  explode(ev, now, near) {
    const S = this.S, fx = S.fx, def = ev.m !== undefined ? VEHICLE_BY_INDEX[ev.m] : null;
    const R = mulberry32((ev.s || 1) ^ 0x2c1b3c6d), lo = !!fx.thin, n = lo ? 0.5 : 1;
    const r = ev.r || 100, big = ev.b ?? (r > 100 ? 1 : 0), x = ev.x, y = ev.y;   // (b: shared/explosions.js blastSize)
    const plan = def && ev.s ? boomPlan(ev.s, def, big) : null;
    const scale = Math.min(3, r / 110);
    // 1. the white-hot flash: the renderer's lights (a white burst, then the fire's glow), a flash over the screen
    S.flashes.push({ x, y, t: 0.16, r: r * 5 });
    S.flashes.push({ x, y, t: 0.9 + big * 0.3, r: r * 3.2, kind: 'boom' });
    this.flash.k = Math.max(this.flash.t > 0 ? this.flash.k : 0, Math.min(1, near * (0.55 + 0.15 * big))); this.flash.t = 0.2;
    // 2. the fireball: a white-yellow core swells, then lobes roll out and up, cooling to orange and red
    this._blob(x, y, 0, 0, r * 0.1, r * 0.75, 0.42, 0, 1, 0);
    const lobes = Math.round((6 + big * 2) * n);
    for (let i = 0; i < lobes; i++) {
      const a = (i / lobes) * TAU + (R() - 0.5) * 0.8, sp = r * (0.5 + R() * 0.7);
      this._blob(x + Math.cos(a) * r * 0.12, y + Math.sin(a) * r * 0.12, Math.cos(a) * sp, Math.sin(a) * sp * 0.8, r * 0.18, r * (0.38 + R() * 0.2), 0.75 + R() * 0.5 + big * 0.15, 1, 0.95, 26 + R() * 30);
    }
    for (let i = 0; i < 46 * scale; i++) {   // flames bursting out of it (pooled particles, drawn by the renderer)
      const a = R() * TAU, sp = 40 + R() * r * 2.4;
      fx.spawn(3, x, y, Math.cos(a) * sp, Math.sin(a) * sp, 0.45 + R() * 0.6, 6 + R() * 9, R() < 0.5 ? '#ff7a1a' : '#ffd23a', 10);
    }
    // 3. the shockwave on the ground, and a skirt of dust thrown out with it
    const ring = this._on(this.rings);
    ring.on = true; ring.x = x; ring.y = y; ring.r = r * (2 + big * 0.4); ring.t = 0; ring.life = 0.5 + big * 0.08;
    for (let i = 0; i < 18 * scale; i++) {
      const a = R() * TAU, d = r * 0.3;
      fx.spawn(2, x + Math.cos(a) * d, y + Math.sin(a) * d, Math.cos(a) * (220 + R() * 160), Math.sin(a) * (220 + R() * 160), 0.9 + R() * 0.6, 7 + R() * 4, 'rgba(176,164,146,', 16);
    }
    // 4. sparks and embers flung out (they arc up and fall; embers float up and drift a while)
    for (let i = 0; i < 26 * scale; i++) { const a = R() * TAU, sp = 140 + R() * 360; fx.spawn(4, x, y, Math.cos(a) * sp, Math.sin(a) * sp, 0.5 + R() * 0.6, 2, R() < 0.6 ? '#ffe58a' : '#fff6d0', 0, 120 + R() * 280); }
    for (let i = 0; i < 22 * scale; i++) { const a = R() * TAU, sp = 40 + R() * 160; const o = fx.spawn(10, x + (R() - 0.5) * r * 0.4, y + (R() - 0.5) * r * 0.4, Math.cos(a) * sp, Math.sin(a) * sp, 1.6 + R() * 2.2, 1.6 + R(), R() < 0.5 ? '#ff9a3a' : '#ffd070', 0, 60 + R() * 140); o.ph = R() * TAU; }
    // 5. the smoke column: rising and drifting for a long while (longer for the big ones)
    const col = this._on(this.cols);
    col.on = true; col.x = x; col.y = y; col.t = 0; col.dur = 12 + big * 6 + R() * 4; col.acc = 0; col.pacc = 0; col.big = big;
    for (let i = 0; i < 16 * scale; i++) fx.smoke(x + (R() - 0.5) * r, y + (R() - 0.5) * r, true, R);
    // 6. debris: rubble and grit; a vehicle blown apart throws its own pieces (from the seed: everyone sees the same)
    for (let i = 0; i < 12 * scale; i++) { const a = R() * TAU, sp = 80 + R() * 260; fx.spawn(9, x, y, Math.cos(a) * sp, Math.sin(a) * sp, 1.3 + R() * 0.8, 3 + R() * 3, R() < 0.5 ? '#3c3a38' : '#5e554c', 0, 140 + R() * 300); }
    if (plan && plan.pieces.length) this._pieces(ev, plan, def, now);
    // a burning wheel rolling away (ev.wh: render/wheels.js)
    if (def) { const W = this._wheels(); if (ev.wh && S.map && !S.ugLayer) W.then((w) => w && w.spawn(ev, def, now)); }
    // 7. the scorch it leaves (a big blast: blotches round it too)
    fx.decal(3, x, y, R() * TAU, r * 0.5, '#111', now, 0.8);
    for (let i = 0; i < big; i++) { const a = R() * TAU, d = r * (0.35 + R() * 0.3); fx.decal(3, x + Math.cos(a) * d, y + Math.sin(a) * d, R() * TAU, r * 0.22, '#111', now, 0.65); }
    // 8. blown up into the air: the wreck rises, spins (or rolls over) and comes down where the server says
    if (plan && plan.launch && ev.k === 'launch' && ev.id) {
      const f = this._on(this.flights), L = plan.launch;
      f.on = true; f.id = ev.id; f.t0 = now; f.T = L.t; f.h = L.h; f.spin = L.spin; f.flip = L.flip; f.acc = 0;
    }
    // 9. the shake, falling off with distance (bigger blasts reach further)
    const d = Math.hypot(x - S.cam.x, y - S.cam.y), k = Math.max(0, 1 - d / (900 + r * 5));
    S.cam.shake = Math.max(S.cam.shake, (12 + big * 8) * k * k);
    // a huge one: more on top (render/bigboom.js)
    if (big > 2) this._wheels().then((w) => w && w.huge.add(ev, big, now));
  }

  _pieces(ev, plan, def, now) {
    const S = this.S, fx = S.fx, e = S.ents.get(ev.id), paint = PAINTS[(((e && e.d && e.d.p) ?? (ev.s % PAINTS.length)) % PAINTS.length + PAINTS.length) % PAINTS.length] || '#777';
    const img = pieceStrip(paint), a0 = ev.a || 0, lo = !!fx.thin;
    plan.pieces.forEach((p, i) => {
      if (lo && i % 2) return;
      const [sx, w, h] = PIECE_RECT[p.c] || PIECE_RECT.p, a = a0 + p.a, k = p.c === 'w' ? 1 : 1.2;
      fx.chunk(img, sx, 0, w, h, w * k, h * k, ev.x + Math.cos(a) * def.L * 0.2, ev.y + Math.sin(a) * def.W * 0.2, Math.cos(a) * p.sp, Math.sin(a) * p.sp, p.vz, p.va, 6 + (p.vz % 5));
      const c = fx.chunks[(fx.ci + fx.chunks.length - 1) % fx.chunks.length], b = this.burners[this.bu];
      c.vp = { k: p.c, paint };   // (what it is: art v2 draws it - host.js _particles)
      this.bu = (this.bu + 1) % this.burners.length;
      b.c = c; b.until = now + 3 + (p.sp % 4); b.acc = 0;
    });
  }

  // a vehicle cut in two, a part off one, the classic view's damage on a car (task #402): render/vehdmg.js, loaded with
  // the first (the cut's halves slide apart from e.cutAt)
  vdmg(ev, now) {
    if (ev && ev.e === 'vcut') { const e = this.S.ents.get(ev.id); if (e) e.cutAt = now; }
    (this.vdP ||= import('./vehdmg.js').then((m) => (this.vd = m)).catch((e) => { console.warn('[vehdmg]', e); return null; })).then((m) => m && m.vdmg(this, ev, now));
  }
  vdmgDraw(g, v, def) { if (this.vd) this.vd.classic(g, v, def); else this.vdmg(null, 0); }

  // render/wheels.js: loaded with the first explosion, not with the page
  _wheels() {
    return this.wheelsP ||= import('./wheels.js').then((m) => (this.wheels = new m.Wheels(this.S, this))).catch((e) => { console.warn('[wheels]', e); return null; });
  }
  // (the classic view's world pass; art v2: in draw)
  drawWheels(g, F) { if (this.wheels) this.wheels.draw(g, F); }

  // a wreck blown up into the air slams down (the 'wreckland' event): dust, sparks, a flare of fire, a jolt
  land(ev, now) {
    const S = this.S, fx = S.fx, big = ev.big || 1;
    for (let i = 0; i < 14; i++) { const a = Math.random() * TAU; fx.spawn(2, ev.x + Math.cos(a) * 30, ev.y + Math.sin(a) * 20, Math.cos(a) * 150, Math.sin(a) * 110, 0.9, 7, 'rgba(160,150,136,', 12); }
    fx.sparks(ev.x, ev.y, 14);
    for (let i = 0; i < 10; i++) fx.fire(ev.x, ev.y);
    const ring = this._on(this.rings);
    ring.on = true; ring.x = ev.x; ring.y = ev.y; ring.r = 90 + big * 20; ring.t = 0; ring.life = 0.35;
    S.flashes.push({ x: ev.x, y: ev.y, t: 0.4, r: 260, kind: 'boom' });
    const d = Math.hypot(ev.x - S.cam.x, ev.y - S.cam.y), k = Math.max(0, 1 - d / 1000);
    S.cam.shake = Math.max(S.cam.shake, 9 * k);
  }

  // run over: the car jolts going over (its bump) - the body's pose is pedLook's (p.runAt)
  bump(vid, now) { const b = this.bumps[this.bp]; this.bp = (this.bp + 1) % this.bumps.length; b.id = vid; b.t0 = now; }

  // up on a car's hood (the 'hood' event): drawn clinging on (pedLook's 'hood' pose), lifted to the hood's height;
  // thrown off ('hoodoff') it's an ordinary fling
  hood(ev, now) {
    const e = this.S.ents.get(ev.id), r = this._on(this.riders);
    if (e) { e.hoodV = ev.v; e.hoodAt = now; }
    r.on = true; r.id = ev.id; r.t0 = now;
  }
  hoodOff(ev) { const e = this.S.ents.get(ev.id); if (e) e.hoodV = 0; for (const r of this.riders) if (r.id === ev.id) r.on = false; }

  // each frame, before the world is drawn: the flights (lift, spin, the roll's dark underside), the bumps, the hood
  // riders lifted onto the hood, the smoke columns and the burning pieces
  tick(F) {
    const S = this.S, fx = S.fx, now = F.now, dt = Math.min(0.1, F.dt || 0.016), lo = fx.thin ? 0.5 : 1;
    for (const f of this.flights) {
      if (!f.on) continue;
      const e = S.ents.get(f.id), k = (now - f.t0) / f.T;
      if (!e || k >= 1 || k < 0) { f.on = false; if (e) e.tint = null; continue; }
      const lift = f.h * 4 * k * (1 - k);
      e.rz = (e.rz || 0) + lift / DECK_LIFT;
      const turns = Math.round(f.spin);   // (whole turns, or a wobble: it lands facing the way the server has it)
      e.ra += turns ? turns * TAU * ease(k) : f.spin * 0.9 * Math.sin(Math.PI * k);
      e.tint = f.flip ? (e.tintA || (e.tintA = [1, 1, 1])) : null;
      if (f.flip) { const u = 1 - 0.6 * Math.abs(Math.sin(Math.PI * k)); e.tint[0] = u; e.tint[1] = u; e.tint[2] = u; }
      f.acc += dt * 30 * lo;
      for (; f.acc >= 1; f.acc--) { const o = fx.spawn(3, e.rx + (Math.random() - 0.5) * 20, e.ry + (Math.random() - 0.5) * 14, 0, 0, 0.35, 7, '#ff9a1a', -4); o.z = lift / 0.3; fx.smoke(e.rx, e.ry - lift, true); }
    }
    for (const b of this.bumps) {
      const k = (now - b.t0) / 0.24;
      if (k < 0 || k >= 1) continue;
      const e = S.ents.get(b.id);
      if (e) e.rz = (e.rz || 0) + 4 * Math.sin(Math.PI * k) / DECK_LIFT;
    }
    for (const r of this.riders) {
      if (!r.on) continue;
      const e = S.ents.get(r.id);
      if (!e || !e.hoodV || now - r.t0 > 3) { r.on = false; if (e) e.hoodV = 0; continue; }
      // on the car as it's drawn (yours is drawn ahead of the server, predicted): a third of the way to its nose
      const v = S.ents.get(e.hoodV), def = v && v.d ? VEHICLE_BY_INDEX[v.d.m] : null;
      if (def) {
        const c = Math.cos(v.ra), s = Math.sin(v.ra), ly = Math.max(-def.W / 4, Math.min(def.W / 4, -(e.rx - v.rx) * s + (e.ry - v.ry) * c));
        e.rx = v.rx + c * def.L * 0.28 - s * ly; e.ry = v.ry + s * def.L * 0.28 + c * ly; e.ra = v.ra + Math.PI; e.rz = v.rz || 0;
      }
      e.rz = (e.rz || 0) + 12 / DECK_LIFT;
    }
    for (const c of this.cols) {
      if (!c.on) continue;
      c.t += dt;
      if (c.t > c.dur) { c.on = false; continue; }
      const fade = 1 - c.t / c.dur, rate = (5 + c.big * 3) * fade * lo;
      c.acc += dt * rate; c.pacc += dt * (1.6 + c.big) * fade * lo;
      const wx = wind.dx * (12 + wind.strength * 40), wy = wind.dy * 8;
      for (; c.acc >= 1; c.acc--) fx.spawn(2, c.x + (Math.random() - 0.5) * 16, c.y + (Math.random() - 0.5) * 10, wx + (Math.random() - 0.5) * 12, wy - 34 - Math.random() * 26, 3.5 + Math.random() * 2.5, 9 + Math.random() * 4, 'rgba(34,32,30,', 7);
      for (; c.pacc >= 1; c.pacc--) this._blob(c.x + (Math.random() - 0.5) * 18, c.y - 10, wx * 1.2 + (Math.random() - 0.5) * 10, wy - 30 - Math.random() * 18, 18, 70 + c.big * 30 + Math.random() * 30, 5 + Math.random() * 3, 2, 0.34 * (0.4 + 0.6 * fade), 0);
    }
    if (this.wheels) this.wheels.tick(now, dt, lo);
    for (const b of this.burners) {
      const c = b.c;
      if (!c || !c.on || now > b.until) { b.c = null; continue; }
      b.acc += dt * 14 * lo;
      for (; b.acc >= 1; b.acc--) {
        const o = fx.spawn(3, c.x + (Math.random() - 0.5) * 4, c.y + (Math.random() - 0.5) * 3, 0, 0, 0.3, 4, Math.random() < 0.5 ? '#ff9a1a' : '#ffd23a', -3);
        o.z = c.z * 2;
        if (Math.random() < 0.3) fx.smoke(c.x, c.y - c.z * 0.6, true);
      }
    }
    // the fireball's blobs and the rings age here (drawn by draw)
    for (const b of this.blobs) {
      if (!b.on) continue;
      b.t += dt;
      if (b.t >= b.life) { b.on = false; continue; }
      const drag = Math.exp(-3 * dt);
      b.vx *= drag; b.vy *= drag; b.x += b.vx * dt; b.y += (b.vy - b.rise) * dt;
      // breaking up into flames as it cools
      if (b.spr === 1 && b.t > b.life * 0.35 && Math.random() < dt * 10 * lo) fx.fire(b.x, b.y);
    }
    for (const r of this.rings) if (r.on && (r.t += dt) > r.life) r.on = false;
    if (this.flash.t > 0) this.flash.t -= dt;
  }

  // drawn over the world (world transform set): the glowing fireball (additive), the smoke plume, the shockwave;
  // then the flash over the screen (screen transform)
  draw(g, F, W, H, DPR) {
    const spr = sprites(), night = F.sky ? F.sky.night || 0 : 0;
    if (this.wheels) this.wheels.draw(g, F);
    g.save();
    // smoke under the fire
    for (const b of this.blobs) {
      if (!b.on || b.spr !== 2) continue;
      const k = b.t / b.life, s = b.s + (b.s1 - b.s) * ease(k);
      g.globalAlpha = b.a * Math.min(1, k * 5) * (1 - k);
      g.drawImage(spr[2], b.x - s, b.y - s, s * 2, s * 2);
    }
    g.globalCompositeOperation = 'lighter';
    for (const b of this.blobs) {
      if (!b.on || b.spr === 2) continue;
      const k = b.t / b.life, s = b.s + (b.s1 - b.s) * ease(Math.min(1, k * 1.6));
      g.globalAlpha = b.a * (1 - k) * (b.spr === 0 ? 1 : 0.55 + 0.3 * night);
      g.drawImage(spr[b.spr], b.x - s, b.y - s, s * 2, s * 2);
    }
    g.globalCompositeOperation = 'source-over';
    for (const r of this.rings) {
      if (!r.on) continue;
      const k = r.t / r.life, rad = r.r * ease(k);
      g.globalAlpha = (1 - k) * (1 - k) * 0.6;
      g.strokeStyle = '#ffeacc'; g.lineWidth = 2 + 9 * (1 - k);
      g.beginPath(); g.ellipse(r.x, r.y, rad, rad * 0.86, 0, 0, TAU); g.stroke();
      g.globalAlpha = (1 - k) * 0.35; g.lineWidth = 2;
      g.beginPath(); g.ellipse(r.x, r.y, rad * 0.8, rad * 0.69, 0, 0, TAU); g.stroke();
    }
    g.restore();
    if (this.flash.t > 0 && this.flash.k > 0.02) {
      g.save();
      g.setTransform(DPR, 0, 0, DPR, 0, 0);
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = Math.min(1, this.flash.t / 0.2) * this.flash.k * (0.45 + 0.4 * night);
      g.fillStyle = '#fff2d8'; g.fillRect(0, 0, W, H);
      g.restore();
    }
  }
}
