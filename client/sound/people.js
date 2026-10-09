// People (and animals): footsteps by surface and speed - quicker and harder running, soft sneaking - from each
// walker's own stride (main.js prepFrame's walk-cycle phase: a step at each half of the cycle); leaves crunching
// and twigs snapping under anyone moving fast through the woods; swimming strokes; the dive-roll. And you: the
// money in and out, the wanted stars going up and down, a reload, the phone, the death screen.
import { PF } from '../../shared/constants.js';
import { surfaceAt, woodsAt } from './surface.js';

const R = Math.random;
const NEAR = 520, MAX_STEPS = 8;

export class People {
  constructor(E) {
    this.E = E;
    this.pp = { s: 'pavement', k: 1, soft: false };   // (the step's parameters: one object, reused)
    this.me = null; this.nextMe = 0; this.phoneEl = null;
  }
  update(F, S, dt) {
    const E = this.E, L = E.listener, map = S.map;
    let n = 0;
    for (const p of F.peds) {
      const ph = p.phase || 0, prev = p.sndPh ?? ph;
      p.sndPh = ph;
      const f = p.flags;
      // the dive-roll: a tumble and a thump as it lands
      const rolling = !!(f & PF.ROLL);
      if (rolling && !p.sndRoll && Math.abs(p.rx - L.x) < NEAR && Math.abs(p.ry - L.y) < NEAR) E.play('roll', p.rx, p.ry, p.id === S.myPedId ? 1 : 0.7);
      p.sndRoll = rolling;
      if (f & (PF.INVEH | PF.DEAD | PF.DOWN) || rolling || n >= MAX_STEPS) continue;
      if (!((prev < 4 && ph >= 4) || ph < prev)) continue;   // (a foot comes down twice a cycle)
      const spd = p.as || 0;
      if (spd < 14) continue;
      const dx = p.rx - L.x, dy = p.ry - L.y;
      if (dx * dx + dy * dy > NEAR * NEAR) continue;
      n++;
      const mine = p.id === S.myPedId, animal = !!(p.d && p.d.ar);
      const pp = this.pp;
      pp.k = Math.min(1.5, spd / 150);
      pp.soft = spd < 60 || animal;   // (sneaking, strolling: soft; paws and hooves soft too)
      if (p.swim) { if (ph < prev) E.play('stroke', p.rx, p.ry, mine ? 0.9 : 0.6); continue; }
      pp.s = surfaceAt(map, p.rx, p.ry, p.rz || 0);
      E.play('step', p.rx, p.ry, (mine ? 0.95 : 0.6) * (animal ? 0.6 : 1), pp);
      // fast through the woods: the leaves crunch, now and then a twig snaps (sneaking through stays quiet)
      if (spd > 140 && (pp.s === 'grass' || pp.s === 'dirt') && woodsAt(map, p.rx, p.ry)) {
        E.play('leaves', p.rx, p.ry, mine ? 0.8 : 0.6);
        if (R() < 0.22) E.play('twig', p.rx, p.ry, mine ? 0.9 : 0.7);
      }
    }
    this.watchMe(S);
  }
  // your own state, a few times a second: money, the stars, reloading, the phone, dying
  watchMe(S) {
    const E = this.E, t = E.ctx.currentTime;
    if (t < this.nextMe) return;
    this.nextMe = t + 0.1;
    const me = S.me;
    if (!me) { this.me = null; return; }
    const was = this.me;
    this.phoneEl ||= document.getElementById('phone');
    const phone = !!(this.phoneEl && !this.phoneEl.classList.contains('hidden'));
    const now = { cash: me.cash || 0, wanted: me.wanted || 0, dead: !!me.dead, rel: !!me.reloading, wpn: me.weapon, phone };
    if (was) {
      if (now.cash > was.cash) E.play('cashin', undefined, undefined, 0.8);
      else if (now.cash < was.cash) E.play('cashout', undefined, undefined, 0.7);
      if (now.wanted > was.wanted) E.play('starup', undefined, undefined, 0.8);
      else if (now.wanted < was.wanted) E.play('stardown', undefined, undefined, 0.7);
      if (now.dead && !was.dead) E.play('death', undefined, undefined, 0.9);
      if (now.rel && !was.rel) E.play('reloadout', undefined, undefined, 0.8);
      else if (!now.rel && was.rel && now.wpn === was.wpn) E.play('reloadin', undefined, undefined, 0.8);
      if (now.phone !== was.phone) E.play(now.phone ? 'phoneopen' : 'phoneclose', undefined, undefined, 0.8);
    }
    this.me = now;
  }
}
