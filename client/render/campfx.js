// The campfire (the owner's notes, task #360): "when it crackles, embers rise into the air and the fire flares; a soft
// volumetric glow round it." Every lit campfire in view sends a thin stream of embers up on its heat (pooled
// particles, type 10: render/fx.js); a loud crackle of the one you can hear (the ambience's crackle: client/sound/
// ambience.js calls S.onCrackle) makes it flare - a burst of embers and flame, its light jumping up (a warm flash in
// the renderer's lights) - and the others flare now and then on their own. After dark a soft warm haze hangs round
// each fire, breathing with it (two glow sprites, additive, over the world). Fewer embers on Low.
import { hazeSprite } from './boom.js';

export class Campfires {
  constructor(S) { this.S = S; this.list = null; this.map = null; this.flare = new Map(); this.acc = 0; this.inView = []; }
  // the map's campfires (found once a city)
  fires() {
    const M = this.S.map;
    if (this.map !== M) { this.map = M; this.list = []; if (M && M.props) for (const p of M.props) if (p && p.t === 'campfire') this.list.push(p); }
    return this.list;
  }
  // a crackle you heard (the nearest fire): a loud one makes that fire flare
  crackle(x, y, vol) {
    if (vol < 0.8) return;
    for (const p of this.fires()) if (p.lit && Math.abs(p.x - x) < 6 && Math.abs(p.y - y) < 6) { this.flareUp(p, vol); return; }
  }
  flareUp(p, k) {
    const S = this.S, fx = S.fx, now = S.loopClock;
    this.flare.set(p, now);
    for (let i = 0; i < 6 + k * 8; i++) { const o = fx.spawn(10, p.x + (Math.random() - 0.5) * 10, p.y + (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 50, (Math.random() - 0.5) * 30, 1.2 + Math.random() * 1.6, 1.5, Math.random() < 0.5 ? '#ffb040' : '#ffe08a', 0, 70 + Math.random() * 90); o.ph = Math.random() * 6.28; }
    for (let i = 0; i < 3; i++) fx.fire(p.x, p.y);
    S.flashes.push({ x: p.x, y: p.y, t: 0.24, r: 90, kind: 'boom' });
  }
  // each frame: the fires in view, their embers, now and then a flare of their own
  tick(F) {
    const S = this.S, fx = S.fx, v = F.view, dt = Math.min(0.1, F.dt || 0.016), list = this.inView;
    list.length = 0;
    for (const p of this.fires()) if (p.lit && !p.broken && p.x > v.x0 - 60 && p.x < v.x1 + 60 && p.y > v.y0 - 60 && p.y < v.y1 + 90) list.push(p);
    if (!list.length) return;
    this.acc += dt * (fx.thin ? 1.6 : 3.2);
    for (; this.acc >= 1; this.acc--) {
      const p = list[Math.floor(Math.random() * list.length)];
      const o = fx.spawn(10, p.x + (Math.random() - 0.5) * 12, p.y + (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 16, (Math.random() - 0.5) * 10, 1.3 + Math.random() * 1.4, 1.4, Math.random() < 0.6 ? '#ff9a3a' : '#ffd070', 0, 40 + Math.random() * 50);
      o.ph = Math.random() * 6.28;
    }
    if (Math.random() < dt * 0.35 * list.length) this.flareUp(list[Math.floor(Math.random() * list.length)], 0.5 + Math.random() * 0.4);
  }
  // the haze round each fire after dark (world transform set; additive)
  draw(g, F) {
    const night = F.sky ? F.sky.night || 0 : 0, list = this.inView;
    if (night < 0.08 || !list.length) return;
    const spr = hazeSprite(), now = this.S.loopClock;
    g.save();
    g.globalCompositeOperation = 'lighter';
    for (const p of list) {
      const fl = (now - (this.flare.get(p) ?? -9)), boost = fl < 0.6 ? 1 - fl / 0.6 : 0;
      const br = 0.85 + 0.1 * Math.sin(now * 2.1 + p.x) + 0.05 * Math.sin(now * 13 + p.y);
      const k = Math.min(1, (night - 0.08) * 1.6) * br;
      let r = 92 * (1 + 0.15 * boost);
      g.globalAlpha = 0.32 * k * (1 + 0.6 * boost);
      g.drawImage(spr, p.x - r, p.y - 14 - r * 0.85, r * 2, r * 1.7);
      r = 34 * (1 + 0.3 * boost);
      g.globalAlpha = 0.45 * k * (1 + boost);
      g.drawImage(spr, p.x - r, p.y - 8 - r, r * 2, r * 2);
    }
    g.restore();
  }
}
