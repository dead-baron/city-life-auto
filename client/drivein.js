// The Starlite Drive-In as this page sees it (the owner's #322; loaded near it: main.js drawDriveIn). After dark the
// features play on the big screen - the film drawn over the screen's sheet (client/cinema.js film; between them the
// intermission card), its light thrown over the lot (art v2: S.dinLight, art2/game/host.js) and its score on the
// speakers (S.dinSound: sound/places.js plays the 'drivein' song, faint across the lot, clear when you're tuned in).
// Tuned in, the camera eases back to take in the screen from your stall (cam, pull). The server says what's on
// (server/systems/drivein.js meInfo: the 'me' payload's din, about once a second); this only keeps the film's clock
// in between.
import { FEATURES, SHOW, driveInOf } from '../shared/drivein.js';
import { film, intermission } from './cinema.js';

const HEAR = 900;   // the speakers heard this far from the middle of the lot

export class DriveInView {
  constructor(S) { this.S = S; this.map = null; this.D = null; this.clock = null; this.last = null; this.camK = 0; this.lastT = 0; this.pull = 1; }
  site() {
    const S = this.S;
    if (S.map !== this.map) { this.map = S.map; this.D = driveInOf(S.map); this.clock = null; }
    return this.D;
  }
  // what's on, its clock kept here: { f, k, n, t0 } (t0: when it started on this page's clock - before now: playing)
  show(now) {
    const d = this.S.me && this.S.me.din;
    if (!d) { this.clock = null; this.last = null; return null; }
    if (d !== this.last) {
      this.last = d;
      const t0 = now - d.at, c = this.clock;
      if (!c || c.f !== d.f || c.k !== d.k || Math.abs(c.t0 - t0) > 1.5) this.clock = { f: d.f, k: d.k, n: d.n, t0 };
      else c.n = d.n;
    }
    return this.clock;
  }
  // the screen's sheet in the world (px): art v2's model (art2/props-kit.js outdoorScreen(200, 100)) or the classic
  // view's sprite (render/country.js dscreen, drawn 1.5x)
  sheet(v2) {
    const D = this.D;
    return v2 ? { x: D.sx - 99, y: D.sy - 122, w: 199, h: 102 } : { x: D.sx - 145.5, y: D.sy - 185, w: 291, h: 120 };
  }
  draw(g, F, v2) {
    const S = this.S, D = this.site(), now = performance.now() / 1000;
    S.dinLight = null; S.dinSound = null;
    const c = D && !F.sub ? this.show(now) : null;
    const watching = !!(c && S.me && S.me.din && S.me.din.w);
    this.track(now, watching);
    if (!c) return;
    const t = now - c.t0, V = F.view, r = this.sheet(v2);
    if (V && S.cam && S.cam.tz > 0) this.vh = (V.y1 - V.y0) * S.cam.zoom / (S.cam.tz * this.pull);   // (the view's height without the pull: cam)
    // the score: from every speaker post across the lot, clear on your own
    const L = F.sp || S.cam, dl = Math.hypot((D.x0 + D.x1) / 2 - L.x, (D.y0 + D.y1) / 2 - L.y);
    if (watching) S.dinSound = { k: 0.5, lp: 9000, pan: 0 };
    else if (dl < HEAR) { const k = 1 - dl / HEAR; S.dinSound = { k: 0.32 * k * k, lp: 700 + 2400 * k, pan: Math.max(-0.6, Math.min(0.6, ((D.x0 + D.x1) / 2 - L.x) / 600)) }; }
    if (V && (r.x > V.x1 + 20 || r.x + r.w < V.x0 - 20 || r.y > V.y1 + 20 || r.y + r.h < V.y0 - 20)) return;
    const light = t < 0
      ? intermission(g, r.x, r.y, r.w, r.h, -t, (FEATURES[c.f] || FEATURES[0]).title, c.k === 0, now)
      : film(g, r.x, r.y, r.w, r.h, Math.min(t, SHOW.len), FEATURES[c.f] || FEATURES[0], SHOW.len);
    // the film's light over the lot, shifting with the picture (strongest in the dark)
    const night = F.sky ? F.sky.night : 1;
    if (v2 && night > 0.05) S.dinLight = { x: D.sx, y: D.sy + 230, z: 70, r: 470, col: [light[0] / 255, light[1] / 255, light[2] / 255], k: 1.5 * night };
  }
  // the camera while you watch: eased round to take in the screen and your stall - the screen's top a fifth of the way
  // down the view (clear of the prompt), your car above its foot, the view pulled back only as far as that needs
  track(now, on) {
    const dt = Math.min(0.1, Math.max(0, now - (this.lastT || now)));
    this.lastT = now;
    this.camK += ((on ? 1 : 0) - this.camK) * (1 - Math.exp(-2.2 * dt));
    if (!on && this.camK < 0.002) this.camK = 0;
    this.pull = 1 + ((this.pullWant || 1) - 1) * this.camK;
  }
  cam(tx, ty) {
    const D = this.D, k = this.camK;
    if (!D || k <= 0) return null;
    const vh = this.vh || 700, top = D.sy - 125, span = ty + 40 - top;
    this.pullWant = Math.max(1, Math.min(1.6, span / (0.68 * vh)));
    const e = k * k * (3 - 2 * k), x = tx * 0.4 + D.sx * 0.6, y = top + 0.28 * vh * this.pullWant;
    return [tx + (x - tx) * e, ty + (y - ty) * e];
  }
}
