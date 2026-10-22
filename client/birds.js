// Urban wildlife (GDD §10): the pigeons and gulls on the pavements, plazas, beaches and docks - client-side only, they
// scatter from cars and runners. They come and go off screen (the owner, 2026-10-15: "the pigeons that spawn randomly
// on the ground spawn in on screen, can we have them spawn in from off screen so they don't just appear"): each one
// starts out past the edge of the view, flies in and lands on its spot (gliding down as it comes), pecks about a while
// and flies off again - out of the view before it's let go. One that's scared (a car near, someone running by) takes off
// away from it. A handful at a time, the same objects used over and over (no allocation once the flock is made).
//   flock.tick(dt, view, cam, map, vehs, peds)   view: the frame's view box (world px, with its margin round the screen)
//   flock.list                                    the birds in the air or on the ground now, for the renderers:
//     { x, y, a (heading), z (px up), fly (s in the air, 0 on the ground), gull, peck }
import { PF } from '../shared/constants.js';

export const BIRDS = Object.freeze({
  MAX: 7,             // at most this many about (14 till 2026-10-21: the owner, 10-15, "Fewer pigeons")
  OUT: 170,           // where they come in from / are let go: this far past the view (which is 64 px past the screen)
  Z_IN: 110,          // flying in, they glide down from at most this high...
  GLIDE: 0.45,        // ...this many px of height per px still to go
  Z_OUT: 140,         // flying off, they climb to this
  CLIMB: 55,          // px a second
  IN_SPEED: [150, 200], OUT_SPEED: 230,
  STAY: [14, 50],     // seconds on the ground before they fly off (unless scared off sooner)
  NEXT: [2, 6],       // seconds between arrivals (0.6-2.4 before: fewer)
  NEAR_YOU: 200,      // they don't land closer than this to the middle of the view (you)
  SCARE_CAR: 110, SCARE_PED: 45,
});
const GROUND = new Set([2, 3, 4, 8, 9]);   // (pavement, road, plaza; sand and docks: the gulls')
const GULL = new Set([8, 9]);
const IN = 1, DOWN = 2, AWAY = 3;

export class Flock {
  constructor(rand = Math.random) { this.R = rand; this.list = []; this.free = []; this.next = 0; this.t = 0; }
  rr(a, b) { return a + this.R() * (b - a); }
  get() { return this.free.pop() || { x: 0, y: 0, a: 0, z: 0, fly: 0, gull: false, peck: 0, st: 0, tx: 0, ty: 0, vx: 0, vy: 0, sp: 0, stay: 0, life: 0 }; }
  drop(i) { const L = this.list, b = L[i]; L[i] = L[L.length - 1]; L.pop(); this.free.push(b); }
  // a spot to land on in the view (and the screen), on the right ground, not on top of you: [x, y, gull] or null
  spot(view, cam, map) {
    for (let k = 0; k < 4; k++) {
      const x = view.x0 + 64 + this.R() * (view.x1 - view.x0 - 128), y = view.y0 + 64 + this.R() * (view.y1 - view.y0 - 128);
      if (Math.hypot(x - cam.x, y - cam.y) < BIRDS.NEAR_YOU) continue;
      const t = map.tileAtPx(x, y);
      if (GROUND.has(t)) return this.at(x, y, GULL.has(t));
    }
    return null;
  }
  at(x, y, gull) { const s = this.tmp || (this.tmp = [0, 0, false]); s[0] = x; s[1] = y; s[2] = gull; return s; }
  // one bird (or two or three together) on its way in to (tx, ty) from past the edge of the view
  arrive(view, tx, ty, gull) {
    const a = this.R() * Math.PI * 2, ux = Math.cos(a), uy = Math.sin(a);   // (the way it flies: from the start to the spot)
    // back along it from the spot till it's OUT px past an edge of the view (past the bottom by its height as well: it's
    // drawn that much higher up the screen)
    const O = BIRDS.OUT, bx = ux > 0 ? (tx - view.x0 + O) / ux : ux < 0 ? (tx - view.x1 - O) / ux : Infinity, by = uy > 0 ? (ty - view.y0 + O) / uy : uy < 0 ? (ty - view.y1 - O - BIRDS.Z_IN) / uy : Infinity;
    const back = Math.min(bx, by);
    const n = this.R() < 0.3 ? 2 + (this.R() < 0.4 ? 1 : 0) : 1, sp = this.rr(BIRDS.IN_SPEED[0], BIRDS.IN_SPEED[1]);
    for (let k = 0; k < n && this.list.length < BIRDS.MAX; k++) {
      const b = this.get(), ox = k ? this.rr(-34, 34) : 0, oy = k ? this.rr(-24, 24) : 0, lag = k * this.rr(18, 40);
      b.tx = tx + ox; b.ty = ty + oy; b.gull = gull;
      b.x = b.tx - ux * (back + lag); b.y = b.ty - uy * (back + lag);
      b.a = a; b.sp = sp; b.vx = ux * sp; b.vy = uy * sp; b.st = IN; b.fly = 0.2 + k * 0.07; b.z = BIRDS.Z_IN; b.peck = this.R() * 3; b.life = 0;
      this.list.push(b);
    }
  }
  // off it goes, away from (fx, fy) (or anywhere: fx undefined)
  takeOff(b, fx, fy) {
    const a = fx === undefined ? this.R() * Math.PI * 2 : Math.atan2(b.y - fy, b.x - fx) + this.rr(-0.7, 0.7);
    b.st = AWAY; b.a = a; b.vx = Math.cos(a) * BIRDS.OUT_SPEED; b.vy = Math.sin(a) * BIRDS.OUT_SPEED; b.fly = 0.001; b.life = 0;
  }
  threat(b, vehs, peds) {
    for (const v of vehs) if (Math.hypot(v.rx - b.x, v.ry - b.y) < BIRDS.SCARE_CAR) return v;
    for (const p of peds) if ((p.flags & PF.MOVING) && Math.hypot(p.rx - b.x, p.ry - b.y) < BIRDS.SCARE_PED) return p;
    return null;
  }
  tick(dt, view, cam, map, vehs, peds) {
    this.t += dt;
    if (this.list.length < BIRDS.MAX && this.t >= this.next) {
      this.next = this.t + this.rr(BIRDS.NEXT[0], BIRDS.NEXT[1]);
      const s = this.spot(view, cam, map);
      if (s) this.arrive(view, s[0], s[1], s[2]);
    }
    const L = this.list;
    for (let i = L.length - 1; i >= 0; i--) {
      const b = L[i];
      if (b.st === IN) {
        const dx = b.tx - b.x, dy = b.ty - b.y, d = Math.hypot(dx, dy), step = b.sp * dt;
        b.fly += dt;
        if (d <= step) { b.x = b.tx; b.y = b.ty; b.z = 0; b.fly = 0; b.st = DOWN; b.stay = this.rr(BIRDS.STAY[0], BIRDS.STAY[1]); continue; }
        b.x += dx / d * step; b.y += dy / d * step; b.z = Math.min(BIRDS.Z_IN, (d - step) * BIRDS.GLIDE);
        // (the spot gone from under it - a car there now, someone running by - or the view gone off elsewhere)
        if (b.z < 40) { const q = this.threat(b, vehs, peds); if (q) { this.takeOff(b, q.rx, q.ry); continue; } }
        if (outside(b.tx, b.ty, view, 300) && outside(b.x, b.y, view, 300)) this.drop(i);
      } else if (b.st === DOWN) {
        b.peck += dt; b.stay -= dt;
        if (outside(b.x, b.y, view, 300)) { this.drop(i); continue; }   // (left behind: off the screen)
        const q = this.threat(b, vehs, peds);
        if (q) this.takeOff(b, q.rx, q.ry); else if (b.stay <= 0) this.takeOff(b);
      } else {
        b.x += b.vx * dt; b.y += b.vy * dt; b.fly += dt; b.life += dt; b.z = Math.min(BIRDS.Z_OUT, b.z + BIRDS.CLIMB * dt + (b.z < 10 ? 10 : 0));
        // (let go once it's out of the view - past the bottom by its height too: it's drawn up there - or after a while)
        if (b.x < view.x0 - 40 || b.x > view.x1 + 40 || b.y < view.y0 - 40 || b.y > view.y1 + 40 + b.z * 1.2 || b.life > 20) this.drop(i);
      }
    }
  }
}
function outside(x, y, v, m) { return x < v.x0 - m || x > v.x1 + m || y < v.y0 - m || y > v.y1 + m; }
