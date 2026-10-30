// The park and the camp, as the page sees them (the server decides it all: server/systems/fireworks.js, campfires.js
// build, ducks.js; main.js loads this after the page and hands it every server event - ev() - and calls draw(g, F)
// over either view):
//   - fireworks ('fw': the kind, where, the fuse, the seed): the show worked out from the seed (shared/leisure.js
//     fwShow) and played out here - the fuse fizzing, rockets climbing on a trail of sparks and bursting (peony, ring,
//     willow, crackle, palm) over the rooftops, the fountain's cone of sparks; the stars drawn additively with a soft
//     glow, and each burst thrown on the city round it as light in its colour (S.xlights: the renderer's lights,
//     art2/game/host.js) - plus the whoosh, the bang and the crackle, near or far (client/sound/events.js);
//   - the players' own campfires ('camp'): the ring of stones, the logs stacked in it and their flames, the log seats
//     round it, the embers going up and the fire's light; anyone sat on a seat is shown sitting on it;
//   - a bunch of grapes thrown to the ducks ('duckfeed'): the grapes flying in and the ripples where they land.
// It also puts the fireworks and the Campfire Kit in the bag (shared/leisure.js registers them; their icons here).
import { fwShow, FW_COLS, FW_RGB, campSeats } from '../../shared/leisure.js';
import { FIREWORKS } from '../../shared/rules-leisure.js';
import { ITEM_ICON } from '../inventory.js';
import { soundEvent } from '../audio.js';

const MAXP = 2600;   // the sparks and stars, pooled
const GRAV = 46, DRAG = 2.1;
const FIRE_RGB = [1, 0.55, 0.2];

export class Leisure {
  constructor(S) {
    this.S = S; this.shows = new Map(); this.camps = new Map(); this.tosses = []; this.lights = []; this.lpool = []; this.emb = 0; this.last = 0;
    this.p = { n: 0, x: new Float32Array(MAXP), y: new Float32Array(MAXP), vx: new Float32Array(MAXP), vy: new Float32Array(MAXP), t: new Float32Array(MAXP), life: new Float32Array(MAXP), c: new Uint8Array(MAXP), f: new Uint8Array(MAXP), g: new Float32Array(MAXP) };
    this.glow = FW_COLS.map((c) => glowSprite(c));
    Object.assign(ITEM_ICON, { fwrocket: '🚀', fwfountain: '🎇', fwcake: '🎆', campkit: '🪵' });
    S.xlights = this.lights;
  }
  ev(ev) {
    if (ev.e === 'fw') this.light(ev);
    else if (ev.e === 'camp') { if (ev.off) { const c = this.camps.get(ev.id); this.camps.delete(ev.id); if (c && this.S.fx) for (let k = 0; k < 5; k++) this.S.fx.smoke(c.x + (Math.random() - 0.5) * 10, c.y - 4, k > 2); } else this.camps.set(ev.id, { id: ev.id, x: ev.x, y: ev.y, a: ev.a, on: !!ev.on, seats: campSeats(ev.x, ev.y, ev.a) }); }
    else if (ev.e === 'duckfeed') this.tosses.push({ x: ev.x, y: ev.y - 8, tx: ev.tx, ty: ev.ty, t0: performance.now() / 1000, landed: false });
  }
  // a firework lit (or burning when you came: the fuse left can be < 0)
  light(ev) {
    const now = performance.now() / 1000, show = fwShow(ev.k, ev.s);
    const go = now + (ev.f ?? FIREWORKS.fuseS);
    if (go + show.secs < now) return;
    this.shows.set(ev.id, { id: ev.id, k: ev.k, x: ev.x, y: ev.y, go, show, done: show.shots.map((s) => (go + s.t + s.up < now ? 2 : go + s.t < now ? 1 : 0)), fountAt: 0, end: go + show.secs });
  }
  // ---- the sparks and stars ----
  add(x, y, vx, vy, life, c, f = 0, g = 1) {
    const P = this.p;
    if (P.n >= MAXP) return;
    const i = P.n++;
    P.x[i] = x; P.y[i] = y; P.vx[i] = vx; P.vy[i] = vy; P.t[i] = 0; P.life[i] = life; P.c[i] = c; P.f[i] = f; P.g[i] = g;
  }
  step(dt) {
    const P = this.p, k = Math.exp(-DRAG * dt);
    for (let i = 0; i < P.n; i++) {
      P.t[i] += dt;
      if (P.t[i] >= P.life[i]) { const j = --P.n; P.x[i] = P.x[j]; P.y[i] = P.y[j]; P.vx[i] = P.vx[j]; P.vy[i] = P.vy[j]; P.t[i] = P.t[j]; P.life[i] = P.life[j]; P.c[i] = P.c[j]; P.f[i] = P.f[j]; P.g[i] = P.g[j]; i--; continue; }
      P.vx[i] *= k; P.vy[i] = P.vy[i] * k + GRAV * P.g[i] * dt;
      P.x[i] += P.vx[i] * dt; P.y[i] += P.vy[i] * dt;
    }
  }
  burst(x, y, s) {
    const n = s.n, sp = s.r / 0.48;   // (with the drag, a star thrown at sp goes about sp / DRAG)
    const two = s.col2 >= 0;
    if (s.pat === 'palm') {
      for (let a = 0; a < 8; a++) { const an = a / 8 * 6.283 + Math.random() * 0.2; for (let j = 0; j < 4; j++) this.add(x, y, Math.cos(an) * sp * (0.6 + j * 0.13), Math.sin(an) * sp * (0.6 + j * 0.13) - 20, 1.7 + Math.random() * 0.5, s.col, 2, 1.4); }
      return;
    }
    for (let j = 0; j < n; j++) {
      const an = j / n * 6.283 + Math.random() * 0.15, v = s.pat === 'ring' ? sp : sp * (0.45 + Math.random() * 0.6);
      const c = two && j & 1 ? s.col2 : s.col;
      if (s.pat === 'willow') this.add(x, y, Math.cos(an) * v * 0.8, Math.sin(an) * v * 0.8, 2.6 + Math.random() * 0.8, 3, 2, 2.2);   // (gold, drooping, trailing)
      else this.add(x, y, Math.cos(an) * v, Math.sin(an) * v, 1.2 + Math.random() * 0.7, c, s.pat === 'crackle' ? 1 : 0, 1);
    }
  }
  tick(F, now, dt) {
    const S = this.S, sky = F.sky || {}, night = sky.night || 0, L = this.lights;
    let li = 0;
    const lit = (x, y, z, r, col, k) => { if (k < 0.03) return; const o = this.lpool[li] || (this.lpool[li] = { x: 0, y: 0, z: 0, r: 0, col: null, k: 0 }); o.x = x; o.y = y; o.z = z; o.r = r; o.col = col; o.k = k; L[li++] = o; };
    const dk = 0.35 + 1.25 * night;
    for (const [id, W] of this.shows) {
      if (now > W.end) { this.shows.delete(id); continue; }
      if (now < W.go) {   // the fuse fizzing
        if (Math.random() < 0.5) this.add(W.x + 2, W.y - 6, (Math.random() - 0.5) * 40, -20 - Math.random() * 30, 0.25, 6, 3, 1);
        lit(W.x, W.y, 6, 60, FIRE_RGB, 0.4 * dk);
        continue;
      }
      W.show.shots.forEach((s, j) => {
        const t = now - W.go - s.t;
        if (t < 0) return;
        const bx = W.x + s.dx, by = W.y - s.h;
        if (W.done[j] === 0) { W.done[j] = 1; soundEvent({ e: 'fwup', x: W.x, y: W.y }, S); }
        if (W.done[j] === 1 && t < s.up) {   // climbing: the head and its trail
          const u = t / s.up, e = 1 - (1 - u) * (1 - u), hx = W.x + s.dx * e, hy = W.y - s.h * e;
          this.add(hx, hy, (Math.random() - 0.5) * 20, 10 + Math.random() * 20, 0.45, 6, 3, 0.5);
          lit(hx, W.y, s.h * e, 90, FIRE_RGB, 0.5 * dk);
        } else if (W.done[j] === 1) { W.done[j] = 2; this.burst(bx, by, s); soundEvent({ e: 'fwpop', x: bx, y: W.y, big: s.n > 38 ? 1 : 0, crk: s.pat === 'crackle' ? 1 : 0 }, S); }
        const bt = t - s.up;
        if (W.done[j] === 2 && bt >= 0 && bt < 1.5) { const fade = bt < 0.12 ? 1 : Math.max(0, 1 - (bt - 0.12) / 1.38); lit(bx, W.y, s.h, 300 + s.r * 2.4, FW_RGB[s.col], 2.4 * fade * fade * dk); }
      });
      const fo = W.show.fountain;
      if (fo && now - W.go < fo.secs) {   // the fountain's cone of sparks, the colour changing as it burns
        const u = (now - W.go) / fo.secs, c = u < 0.5 ? fo.col : fo.col2, n = Math.round(90 * dt * (u < 0.1 ? u * 10 : u > 0.9 ? (1 - u) * 10 : 1)) + 1;
        for (let k = 0; k < n; k++) this.add(W.x + (Math.random() - 0.5) * 3, W.y - 6, (Math.random() - 0.5) * 70, -150 - Math.random() * 90, 0.7 + Math.random() * 0.5, Math.random() < 0.3 ? 5 : c, 0, 5.4);
        const fl = 0.8 + 0.2 * Math.sin(now * 37 + id);
        lit(W.x, W.y, 18, 210, FW_RGB[c], 1.4 * fl * dk);
        if (now - W.fountAt > 0.45) { W.fountAt = now; soundEvent({ e: 'fwfount', x: W.x, y: W.y }, S); }
      }
    }
    // the campfires: embers up on the heat, their light
    const fx = S.fx;
    this.emb += dt;
    for (const c of this.camps.values()) {
      if (!c.on) continue;
      const fl = 0.8 + 0.2 * Math.sin(S.loopClock * 17 + c.x) * Math.sin(S.loopClock * 7.3 + c.y);
      lit(c.x, c.y, 10, 170, FIRE_RGB, (0.6 + 1.6 * night) * fl);
      if (fx && this.emb > 0.35 && Math.random() < 0.8) { const o = fx.spawn(10, c.x + (Math.random() - 0.5) * 8, c.y - 4, (Math.random() - 0.5) * 24, (Math.random() - 0.5) * 12, 1.2 + Math.random(), 1.3, Math.random() < 0.5 ? '#ffb040' : '#ffe08a', 0, 40 + Math.random() * 40); if (o) o.ph = Math.random() * 6.28; }
    }
    if (this.emb > 0.35) this.emb = 0;
    L.length = li;
  }
  draw(g, F) {
    const now = performance.now() / 1000, dt = Math.min(0.1, Math.max(0, now - (this.last || now)));
    this.last = now;
    if (!this.shows.size && !this.camps.size && !this.tosses.length && !this.p.n) { this.lights.length = 0; return; }
    this.tick(F, now, dt);
    this.step(dt);
    const v = F.view, S = this.S;
    g.save();
    // the campfires
    for (const c of this.camps.values()) {
      if (v && (c.x < v.x0 - 60 || c.x > v.x1 + 60 || c.y < v.y0 - 60 || c.y > v.y1 + 60)) continue;
      for (const st of c.seats) drawSeat(g, st.x, st.y + 3, st.a + Math.PI / 2);
      g.save(); g.translate(Math.round(c.x), Math.round(c.y)); g.scale(1.4, 1.4); drawFire(g, 0, 0, c.on, now + c.id); g.restore();   // (a little bigger than the map's: a fire to sit round)
      this.seated(g, c);
    }
    // the fireworks on the ground (the tubes, spent once the show's over)
    for (const W of this.shows.values()) drawTube(g, Math.round(W.x), Math.round(W.y), W.k, now < W.go);
    // the grapes in the air, the ripples where they land
    this.tosses = this.tosses.filter((q) => now - q.t0 < 0.7);
    for (const q of this.tosses) {
      const u = Math.min(1, (now - q.t0) / 0.6);
      if (u >= 1 && !q.landed) { q.landed = true; if (S.fx) { S.fx.ring(q.tx, q.ty, 10, 'rgba(210,230,255,', 0.5); S.fx.ring(q.tx + 5, q.ty + 2, 6, 'rgba(210,230,255,', 0.4); } continue; }
      if (u >= 1) continue;
      for (let k = 0; k < 5; k++) {
        const uu = Math.max(0, Math.min(1, u - k * 0.03)), x = q.x + (q.tx - q.x) * uu + (k - 2) * 2, y = q.y + (q.ty - q.y) * uu - Math.sin(uu * Math.PI) * 26 + (k & 1);
        g.fillStyle = k & 1 ? '#7a3a9a' : '#9a52b8'; g.fillRect(Math.round(x), Math.round(y), 2, 2);
      }
    }
    // the sparks and stars: additive, a soft glow round each
    const P = this.p;
    if (P.n) {
      g.globalCompositeOperation = 'lighter';
      for (let i = 0; i < P.n; i++) {
        const x = P.x[i], y = P.y[i];
        if (v && (x < v.x0 - 30 || x > v.x1 + 30 || y < v.y0 - 30 || y > v.y1 + 30)) continue;
        const u = P.t[i] / P.life[i], f = P.f[i];
        let a = u < 0.7 ? 1 : (1 - u) / 0.3;
        let c = P.c[i];
        if (f === 1 && u > 0.55) { c = 5; a *= Math.random() < 0.5 ? 1 : 0.2; }   // (crackle: glitter at the end)
        if (f === 3) { g.globalAlpha = a * 0.9; g.fillStyle = c === 6 ? '#ffc070' : FW_COLS[c]; g.fillRect(x | 0, y | 0, 1, 1); continue; }   // (a trail's spark)
        g.globalAlpha = a * (f === 2 ? 0.45 : 0.6);
        g.drawImage(this.glow[c], (x | 0) - 6, (y | 0) - 6);
        g.globalAlpha = a;
        g.fillStyle = u < 0.3 ? '#ffffff' : FW_COLS[c];
        g.fillRect((x | 0) - 1, (y | 0) - 1, 2, 2);
      }
      g.globalCompositeOperation = 'source-over';
      g.globalAlpha = 1;
    }
    g.restore();
  }
  // anyone sat on a log seat: the overlay cut away round them so they sit on it (the art v2 world is under this layer)
  seated(g, c) {
    const S = this.S;
    if (!S.art2 || !S.art2.ready) return;
    for (const e of S.ents.values()) {
      if (e.kind !== 1 || e.rx === undefined) continue;
      for (const st of c.seats) if (Math.abs(e.rx - st.x) < 7 && Math.abs(e.ry - st.y) < 7) g.clearRect(Math.round(e.rx) - 7, Math.round(e.ry) - 20, 14, 21);
    }
  }
}

// ---- the pictures (world px) ----------------------------------------------------------------------------------------
function glowSprite(col) {
  const c = typeof document !== 'undefined' ? document.createElement('canvas') : null;
  if (!c) return null;
  c.width = c.height = 12;
  const x = c.getContext('2d'), gr = x.createRadialGradient(6, 6, 0, 6, 6, 6);
  gr.addColorStop(0, col); gr.addColorStop(0.35, col + '88'); gr.addColorStop(1, col + '00');
  x.fillStyle = gr; x.fillRect(0, 0, 12, 12);
  return c;
}
// a log to sit on, lying across the way round the fire: bark, the cut ends' rings
function drawSeat(g, x, y, a) {
  const L = 10;
  g.save(); g.translate(Math.round(x), Math.round(y)); g.scale(1.25, 1.25); g.rotate(Math.round(a / (Math.PI / 8)) * (Math.PI / 8));
  g.fillStyle = 'rgba(0,0,0,.28)'; g.fillRect(-L, 1, L * 2 + 1, 4);
  g.fillStyle = '#5a3c22'; g.fillRect(-L, -3, L * 2, 6);
  g.fillStyle = '#7a5432'; g.fillRect(-L, -3, L * 2, 2);
  g.fillStyle = '#4a301a'; for (let k = -L + 3; k < L - 2; k += 5) g.fillRect(k, 0, 2, 1);
  g.fillStyle = '#c99a62'; g.fillRect(-L - 1, -3, 2, 6); g.fillRect(L - 1, -3, 2, 6);
  g.fillStyle = '#9a6c3e'; g.fillRect(-L - 1, -1, 2, 2); g.fillRect(L - 1, -1, 2, 2);
  g.restore();
}
// the ring of stones, the logs stacked in it, the flames (or the ash, put out)
function drawFire(g, x, y, on, t) {
  g.fillStyle = 'rgba(0,0,0,.3)'; g.beginPath(); g.ellipse(x, y + 2, 13, 7, 0, 0, 6.283); g.fill();
  g.fillStyle = '#2a2420'; g.beginPath(); g.ellipse(x, y, 9, 5, 0, 0, 6.283); g.fill();
  for (let k = 0; k < 9; k++) { const a = k / 9 * 6.283, sx = Math.round(x + Math.cos(a) * 11) - 2, sy = Math.round(y + Math.sin(a) * 6) - 1; g.fillStyle = k & 1 ? '#8a8a88' : '#a8a6a0'; g.fillRect(sx, sy, 4, 3); g.fillStyle = '#6a6866'; g.fillRect(sx, sy + 2, 4, 1); }
  // the logs, leant together
  g.fillStyle = '#5a3c22'; g.fillRect(x - 7, y - 2, 14, 3); g.fillRect(x - 2, y - 6, 3, 9);
  g.fillStyle = '#7a5432'; g.fillRect(x - 6, y - 4, 12, 2);
  g.fillStyle = '#c99a62'; g.fillRect(x - 8, y - 2, 2, 3); g.fillRect(x + 6, y - 2, 2, 3);
  if (!on) { g.fillStyle = '#4a4440'; g.fillRect(x - 4, y - 1, 8, 2); return; }
  // embers glowing in the bed, the flames licking up
  g.fillStyle = '#ff7a2a'; g.fillRect(x - 5, y, 3, 1); g.fillRect(x + 2, y, 3, 1);
  const f = (k) => Math.sin(t * (9 + k * 3.1) + k * 2.3);
  const flame = (dx, h, w, col) => { g.fillStyle = col; g.beginPath(); g.moveTo(x + dx - w, y); g.quadraticCurveTo(x + dx - w * 0.6, y - h * 0.6, x + dx + f(dx + 3) * 1.5, y - h); g.quadraticCurveTo(x + dx + w * 0.6, y - h * 0.6, x + dx + w, y); g.closePath(); g.fill(); };
  flame(-3, 9 + f(1) * 2, 3, '#e8501e'); flame(3, 10 + f(2) * 2, 3, '#e8501e'); flame(0, 14 + f(3) * 3, 4, '#ff8a2a');
  flame(-1, 9 + f(4) * 2, 2.5, '#ffc040'); flame(1, 7 + f(5) * 2, 2, '#fff0a0');
}
// a firework standing on the ground: a rocket on its stick, a fountain's cone, a cake's block of tubes
function drawTube(g, x, y, k, fuse) {
  g.fillStyle = 'rgba(0,0,0,.3)'; g.fillRect(x - 4, y + 1, 9, 2);
  if (k === 0) { g.fillStyle = '#7a5a32'; g.fillRect(x, y - 10, 1, 11); g.fillStyle = '#d83a2a'; g.fillRect(x - 1, y - 8, 3, 5); g.fillStyle = '#f0e0c0'; g.fillRect(x - 1, y - 9, 3, 1); }
  else if (k === 1) { g.fillStyle = '#2a7ad8'; g.beginPath(); g.moveTo(x - 4, y + 1); g.lineTo(x + 4, y + 1); g.lineTo(x + 1, y - 7); g.lineTo(x - 1, y - 7); g.closePath(); g.fill(); g.fillStyle = '#ffd84a'; g.fillRect(x - 3, y - 2, 6, 1); }
  else { g.fillStyle = '#c8302a'; g.fillRect(x - 5, y - 6, 10, 7); g.fillStyle = '#ffd84a'; g.fillRect(x - 5, y - 3, 10, 1); g.fillStyle = '#3a1a14'; for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) g.fillRect(x - 4 + i * 3, y - 6 + j * 4, 2, 1); }
  if (fuse) { g.fillStyle = Math.random() < 0.5 ? '#fff4d8' : '#ffb040'; g.fillRect(x + 2, y - 4, 2, 2); }
}
