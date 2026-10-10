// A burning wheel off an explosion, rolling away down the street (task #412: shared/wheelpath.js), as the clients play
// it - loaded with the first explosion (render/boom.js), not with the page. Its whole roll is worked out from the
// 'explode' event's seed over the map the moment it goes up (wheelPath: every client gets the same frames) and played
// back here: where it is between two frames; a puff of dust and a flare where it bounces, sparks where it knocks into a
// wall or a post, a splash and steam where it goes into the water; flames and thick smoke off it, burning bits dropping
// off it and a streak of burnt rubber behind it while it rolls; lying flat it burns down to a wisp of smoke and leaves a
// burnt patch. Drawn as a short cylinder - the far face, the tread, the near face with its rim, hub and lugs going round
// as it rolls - upright, leaning as it wobbles, or flat, raised off its shadow while it's in the air.
// Pooled (four wheels, each with a frame buffer kept for good; the fire is render/fx.js's particles and decals), thinned
// on Low (fx.thin).
import { wheelPlan, wheelPath, wheelSize, WHEEL_DT, WHEEL_F, WHEEL_MAX, WF } from '../../shared/wheelpath.js';
import { boomPlan } from '../../shared/explosions.js';
import { hazeSprite } from './boom.js';
import { Huge } from './bigboom.js';

const TAU = Math.PI * 2;
const H = 0.7;   // px up the screen for every px of height (as it's drawn)

export class Wheels {
  // B: render/boom.js's Booms. The huge blasts' extra layers (task #398, render/bigboom.js) come in with this module
  // and tick and draw with it.
  constructor(S, B) {
    this.S = S;
    this.list = Array.from({ length: 4 }, () => ({ on: false, f: new Float32Array(WHEEL_MAX * WHEEL_F), n: 0, sunk: false, t0: 0, end: 0, out: 0, life: 0, r: 7, w: 5, last: 0, acc: 0, sacc: 0, dacc: 0, mx: 0, my: 0, x: 0, y: 0, z: 0, h: 0, lean: 0, spin: 0, burn: 0 }));
    this.huge = new Huge(B || S.boom);
  }

  // A vehicle blew up and the server says a wheel came off (ev.wh): its roll from the seed, worked out now - in a free
  // slot, or the one that's been going longest. now: when it went up (the module may have come in a moment after).
  spawn(ev, def, now) {
    const roll = wheelPlan(ev.s, def, boomPlan(ev.s, def, ev.b));   // (ev.b: the blast's size - a load of explosives aboard makes it a huge one)
    if (!roll || !this.S.map) return;
    let w = this.list[0];
    for (const o of this.list) { if (!o.on) { w = o; break; } if (o.t0 < w.t0) w = o; }
    const P = wheelPath(roll, def, ev.x, ev.y, ev.a || 0, this.S.map, w.f), sz = wheelSize(def);
    w.on = true; w.n = P.n; w.sunk = P.sunk; w.t0 = now; w.end = (P.n - 1) * WHEEL_DT;
    w.out = P.sunk ? w.end : Math.max(w.end + 3, roll.burn);   // (lying there it burns on a few seconds at least)
    w.life = P.sunk ? w.end + 0.01 : w.out + 4;                 // (then smoulders a while)
    w.r = sz.r; w.w = sz.w; w.last = 0; w.acc = 0; w.sacc = 0; w.dacc = 0; w.mx = w.f[0]; w.my = w.f[1]; w.burn = 1;
    this._at(w, 0);
  }

  // where it is t s into its roll: between two frames (the frame before, returned)
  _at(w, t) {
    const F = w.f, fi = Math.max(0, Math.min(w.n - 1, t / WHEEL_DT)), i0 = Math.floor(fi), i1 = Math.min(w.n - 1, i0 + 1), u = fi - i0;
    const a = i0 * WHEEL_F, b = i1 * WHEEL_F;
    let dh = F[b + 3] - F[a + 3];
    if (dh > Math.PI) dh -= TAU; else if (dh < -Math.PI) dh += TAU;
    w.x = F[a] + (F[b] - F[a]) * u; w.y = F[a + 1] + (F[b + 1] - F[a + 1]) * u; w.z = F[a + 2] + (F[b + 2] - F[a + 2]) * u;
    w.h = F[a + 3] + dh * u; w.lean = F[a + 4] + (F[b + 4] - F[a + 4]) * u; w.spin = F[a + 5] + (F[b + 5] - F[a + 5]) * u;
    return i0;
  }

  // a bounce (a puff of dust, a flare), a hop at a kerb, a knock against a wall or a post (sparks), into the water
  _hit(k, x, y) {
    const fx = this.S.fx;
    if (k === WF.SUNK) { fx.splash(x, y, 14); for (let i = 0; i < 5; i++) fx.smoke(x, y, false); return; }   // (steam)
    for (let i = 0; i < (k === WF.BOUNCE ? 4 : 2); i++) { const a = Math.random() * TAU; fx.spawn(2, x + Math.cos(a) * 5, y + Math.sin(a) * 3, Math.cos(a) * 50, Math.sin(a) * 30, 0.7, 5, 'rgba(150,140,128,', 10); }
    fx.sparks(x, y, k === WF.KNOCK ? 9 : 3);
    for (let i = 0; i < (k === WF.KNOCK ? 4 : 2); i++) fx.fire(x, y);
  }

  // Each frame (render/boom.js tick): where each one is, what it hit since, and its fire - flames and smoke off it
  // (less as it burns out, then a wisp of smoke), burning bits dropping off it and a streak of burnt rubber behind it
  // while it rolls; lo: half the particles on Low.
  tick(now, dt, lo) {
    for (const w of this.list) if (w.on) this._tick(w, now, dt, lo);
    this.huge.tick(now, dt, lo);
  }
  _tick(w, now, dt, lo) {
    const fx = this.S.fx, t = now - w.t0;
    if (t < 0 || t > w.life) { w.on = false; if (t > w.life && !w.sunk) fx.decal(3, w.x, w.y, Math.random() * TAU, w.r * 1.3, '#111', now, 0.55); return; }   // (a burnt patch where it lay)
    const i0 = this._at(w, t), F = w.f;
    for (let i = w.last + 1; i <= i0; i++) { const j = i * WHEEL_F; if (F[j + 6]) this._hit(F[j + 6], F[j], F[j + 1]); }
    w.last = Math.max(w.last, i0);
    if (w.sunk && i0 >= w.n - 1) { w.on = false; return; }
    const rolling = t < w.end, burn = rolling ? 1 : Math.max(0, 1 - (t - w.end) / Math.max(0.5, w.out - w.end));
    w.burn = burn;
    const top = w.z + 2 * w.r * Math.abs(Math.cos(w.lean)) + w.w * Math.abs(Math.sin(w.lean));
    w.acc += dt * 26 * burn * lo;
    for (; w.acc >= 1; w.acc--) {   // flames licking up off it
      const o = fx.spawn(3, w.x + (Math.random() - 0.5) * w.r, w.y + (Math.random() - 0.5) * w.r * 0.6, (Math.random() - 0.5) * 14, -10 - Math.random() * 16, 0.3 + Math.random() * 0.25, 4 + Math.random() * 3 * burn, Math.random() < 0.5 ? '#ff9a1a' : '#ffd23a', -4);
      o.z = (top * 0.8) / 0.3; o.vz = 40 + Math.random() * 60;
    }
    w.sacc += dt * (burn > 0 ? 3 + 7 * burn : t < w.life - 1 ? 2 : 0) * lo;
    for (; w.sacc >= 1; w.sacc--) fx.smoke(w.x, w.y - top * 0.7, true);   // (thick and black; a wisp once it's out)
    if (!rolling || burn < 0.3) return;
    if (w.z >= 1) { w.mx = w.x; w.my = w.y; }
    else if (Math.hypot(w.x - w.mx, w.y - w.my) > 14) {   // burnt rubber on the road behind it
      fx.decal(4, w.x, w.y, w.h, 0, '#141210', now, 0.5);
      w.mx = w.x; w.my = w.y;
    }
    w.dacc += dt * 4 * lo;
    for (; w.dacc >= 1; w.dacc--) {   // a burning bit drops off it and burns out on the ground, an ember drifting up
      const o = fx.spawn(3, w.x + (Math.random() - 0.5) * 4, w.y + (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 20, (Math.random() - 0.5) * 12, 0.8 + Math.random() * 0.7, 3 + Math.random() * 1.5, Math.random() < 0.6 ? '#ff7a1a' : '#ffd23a', -1);
      o.z = top / 0.6;
      if (Math.random() < 0.4) { const e = fx.spawn(10, w.x, w.y, (Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30, 1 + Math.random(), 1.4, '#ff9a3a', 0, 30 + Math.random() * 40); e.ph = Math.random() * TAU; }
    }
  }

  // Drawn in the world (the world transform set: art v2 on its overlay, render/boom.js draw; the classic view after its
  // particles): its shadow; the disc - A along the ground the way it faces, B its up, tilted with the lean - as an
  // ellipse; the far face, the tread (the faces' outline swept across the tyre: where the disc reaches furthest across
  // the axle, both ends - edge on, all there is to see), the near face (the one facing the viewer, who looks from the
  // south and above) with its rim, hub and lugs; on fire, a glow round it and the tread's edge glowing.
  draw(g, F) {
    this.huge.draw(g, F);   // (the burning pools' glow under the wheels)
    const now = F.now, night = F.sky ? F.sky.night || 0 : 0;
    let any = false;
    for (const w of this.list) if (w.on && !(w.sunk && now - w.t0 >= w.end)) { any = true; break; }
    if (!any) return;
    const tread = night > 0.5 ? '#0d0c0c' : '#161514', face = night > 0.5 ? '#151413' : '#22201e', rim = night > 0.5 ? '#3a3836' : '#5c5955', lug = night > 0.5 ? '#6a6662' : '#8e8a84';
    g.save();
    for (const w of this.list) {
      if (!w.on || (w.sunk && now - w.t0 >= w.end)) continue;
      const fade = Math.min(1, Math.max(0, (w.life - (now - w.t0)) / 1.5));
      if (fade <= 0) continue;
      const ch = Math.cos(w.h), sh = Math.sin(w.h), cl = Math.cos(w.lean), sl = Math.sin(w.lean), r = w.r;
      const Ax = r * ch, Ay = r * sh, Bx = -sh * sl * r, By = (ch * sl - H * cl) * r;
      const nx = -sh * cl * w.w / 2, ny = (ch * cl + H * sl) * w.w / 2;
      const cx = w.x, cy = w.y - (w.z + r * Math.abs(cl) + w.w / 2 * Math.abs(sl)) * H;
      g.globalAlpha = 0.32 * fade * Math.max(0.3, 1 - w.z / 90);
      g.fillStyle = '#000';
      g.beginPath(); g.ellipse(w.x + 2, w.y + 2, r * (0.55 + 0.45 * Math.abs(sl)) + 1, Math.max(2, r * Math.abs(sl), w.w * 0.6), w.h, 0, TAU); g.fill();
      const near = ch * cl - sl >= 0 ? 1 : -1, ex = cx + nx * near, ey = cy + ny * near;
      g.globalAlpha = fade;
      disc(g, cx - nx * near, cy - ny * near, Ax, Ay, Bx, By, 1, tread);
      const dl = Math.hypot(nx, ny) || 1, px = -ny / dl, py = nx / dl, ta = Math.atan2(px * Bx + py * By, px * Ax + py * Ay);
      const sx = Ax * Math.cos(ta) + Bx * Math.sin(ta), sy = Ay * Math.cos(ta) + By * Math.sin(ta);
      g.fillStyle = tread;
      g.beginPath(); g.moveTo(cx + sx - nx, cy + sy - ny); g.lineTo(cx + sx + nx, cy + sy + ny); g.lineTo(cx - sx + nx, cy - sy + ny); g.lineTo(cx - sx - nx, cy - sy - ny); g.closePath(); g.fill();
      disc(g, ex, ey, Ax, Ay, Bx, By, 1, face);
      disc(g, ex, ey, Ax, Ay, Bx, By, 0.56, rim);
      disc(g, ex, ey, Ax, Ay, Bx, By, 0.22, '#1e1c1a');
      g.fillStyle = lug;
      for (let q = 0; q < 4; q++) {   // (rolling on along A, the top goes forward: the angle from A towards B falls)
        const a = q * Math.PI / 2 - w.spin, u = Math.cos(a) * 0.38, v = Math.sin(a) * 0.38;
        g.fillRect(ex + Ax * u + Bx * v - 0.6, ey + Ay * u + By * v - 0.6, 1.2, 1.2);
      }
      if (w.burn > 0.02) {
        const fl = 0.75 + 0.25 * Math.sin(now * 23 + w.t0 * 7), s = r * 2.6;
        g.globalCompositeOperation = 'lighter';
        g.globalAlpha = 0.5 * w.burn * fl * fade;
        g.drawImage(hazeSprite(), cx - s, cy - s, s * 2, s * 2);
        g.globalAlpha = 0.55 * w.burn * fl * fade;
        g.strokeStyle = '#ff7a1a'; g.lineWidth = 1;
        g.save(); g.transform(Ax, Ay, Bx, By, ex, ey); g.beginPath(); g.arc(0, 0, 0.92, 0, TAU); g.restore(); g.stroke();
        g.globalCompositeOperation = 'source-over';
      }
    }
    g.restore();
  }
}

// an ellipse: the disc with conjugate radii A and B round (x, y), scaled by k, filled
function disc(g, x, y, Ax, Ay, Bx, By, k, col) {
  g.save(); g.transform(Ax * k, Ay * k, Bx * k, By * k, x, y);
  g.fillStyle = col; g.beginPath(); g.arc(0, 0, 1, 0, TAU); g.fill();
  g.restore();
}
