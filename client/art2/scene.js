// Art v2 scene composer: the shared plumbing every district generator uses.
//
//   Streets  - the street plan of a scene: road rectangles, cul-de-sac bulbs and raised islands
//              (medians, traffic islands). Block corners are rounded by a morphological opening of the
//              pavement (erode then dilate by the kerb radius), so any layout gets proper kerb returns.
//              Lot ground (lawns, driveways, plazas, pools) is laid on top as zones.
//   Scene    - the G-buffer plus everything that stands up (buildings, props, vehicles, people, trees),
//              sorted back to front by where they touch the ground, with rooftop kit, overhead wires and
//              the scene's point lights. finish() -> { G, lights } for the Lighter.
//
// World units: 1 px = 1 world px (about 4.5 cm). Projection: screen x = X, screen y = Y - Z.
import { GBuf, hash } from './gbuf.js';
import { paintGround, kerbs } from './ground.js';
import { makeBuilding, buildingH } from './buildings.js';
import { person, randomPerson } from './people.js';
import { LIGHT } from './palette.js';

// ---- exact Euclidean distance transform (Felzenszwalb & Huttenlocher) -----------------------------
// mask[i] = 1 marks the features; returns the squared distance from every pixel to the nearest one.
function edt1(f, n, d, v, z) {
  let k = 0; v[0] = 0; z[0] = -1e20; z[1] = 1e20;
  for (let q = 1; q < n; q++) {
    let s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) { k--; s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]); }
    k++; v[k] = q; z[k] = s; z[k + 1] = 1e20;
  }
  k = 0;
  for (let q = 0; q < n; q++) { while (z[k + 1] < q) k++; d[q] = (q - v[k]) ** 2 + f[v[k]]; }
}
export function distSq(mask, w, h) {
  const INF = 1e12, out = new Float64Array(w * h), m = Math.max(w, h);
  const f = new Float64Array(m), d = new Float64Array(m), v = new Int32Array(m), z = new Float64Array(m + 1);
  for (let i = 0; i < w * h; i++) out[i] = mask[i] ? 0 : INF;
  for (let x = 0; x < w; x++) { for (let y = 0; y < h; y++) f[y] = out[y * w + x]; edt1(f, h, d, v, z); for (let y = 0; y < h; y++) out[y * w + x] = d[y]; }
  for (let y = 0; y < h; y++) { for (let x = 0; x < w; x++) f[x] = out[y * w + x]; edt1(f, w, d, v, z); for (let x = 0; x < w; x++) out[y * w + x] = d[x]; }
  return out;
}

// ---- the street plan -------------------------------------------------------------------------------
export class Streets {
  constructor(w, h, opt = {}) {
    this.w = w; this.h = h;
    this.corner = opt.corner ?? 16;        // kerb return radius at block corners
    this.sidewalk = opt.sidewalk ?? 26;    // default sidewalk width from the kerb
    this.roads = []; this.bulbs = []; this.islands = []; this.zones = [];
    this.roadKind = opt.roadKind || 'asphalt';
    this.lotKind = opt.lotKind || 'sidewalk';
  }
  road(x, y, w, h, opt = {}) { this.roads.push({ x, y, w, h, ...opt }); return this; }
  bulb(cx, cy, r) { this.bulbs.push({ cx, cy, r }); return this; }
  // a raised island inside the carriageway (median, traffic island): a rounded rectangle of pavement
  island(x, y, w, h, r = 8, kind = 'sidewalk') { this.islands.push({ x, y, w, h, r, kind }); return this; }
  // lot ground. shape: rect {x,y,w,h,r?} or circle {cx,cy,r}. over: also covers the sidewalk band
  // (driveways, plazas); road: may be painted on the carriageway (bus lane, parking bays).
  zone(kind, shape, opt = {}) { this.zones.push({ kind, ...shape, ...opt }); return this; }

  build() {
    const { w, h } = this, n = w * h;
    const road = new Uint8Array(n);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let r = 0;
      for (const q of this.roads) if (x >= q.x && x < q.x + q.w && y >= q.y && y < q.y + q.h) { r = 1; break; }
      if (!r) for (const b of this.bulbs) if ((x - b.cx) ** 2 + (y - b.cy) ** 2 < b.r * b.r) { r = 1; break; }
      road[y * w + x] = r;
    }
    // opening: keep pavement that is at least `corner` from any road, then grow it back by `corner`
    const R = this.corner, dRoad = distSq(road, w, h);
    const core = new Uint8Array(n);
    for (let i = 0; i < n; i++) core[i] = dRoad[i] > R * R ? 1 : 0;
    const dCore = distSq(core, w, h);
    const walk = new Uint8Array(n);
    for (let i = 0; i < n; i++) walk[i] = !road[i] && dCore[i] <= R * R + 0.5 ? 1 : 0;
    for (const s of this.islands) for (let y = s.y; y < s.y + s.h; y++) for (let x = s.x; x < s.x + s.w; x++) {
      if (x < 0 || y < 0 || x >= w || y >= h) continue;
      const cx = Math.max(s.x + s.r, Math.min(s.x + s.w - s.r, x + 0.5)), cy = Math.max(s.y + s.r, Math.min(s.y + s.h - s.r, y + 0.5));
      if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= s.r * s.r) walk[y * w + x] = 2;
    }
    this.walk = walk;
    // distance in from the kerb, for the sidewalk band
    const notWalk = new Uint8Array(n);
    for (let i = 0; i < n; i++) notWalk[i] = walk[i] ? 0 : 1;
    const dk = distSq(notWalk, w, h);
    this.kerbDist = new Float32Array(n);
    for (let i = 0; i < n; i++) this.kerbDist[i] = Math.sqrt(dk[i]);
    return this;
  }
  isWalk(x, y) { x |= 0; y |= 0; if (x < 0 || y < 0 || x >= this.w || y >= this.h) return this.isWalk(Math.max(0, Math.min(this.w - 1, x)), Math.max(0, Math.min(this.h - 1, y))); return this.walk[y * this.w + x] > 0; }
  isRoad(x, y) { return !this.isWalk(x, y); }
  inZone(z, x, y) {
    if (z.cx !== undefined) return (x + 0.5 - z.cx) ** 2 + (y + 0.5 - z.cy) ** 2 < z.r * z.r;
    if (x < z.x || y < z.y || x >= z.x + z.w || y >= z.y + z.h) return false;
    if (!z.r) return true;
    const cx = Math.max(z.x + z.r, Math.min(z.x + z.w - z.r, x + 0.5)), cy = Math.max(z.y + z.r, Math.min(z.y + z.h - z.r, y + 0.5));
    return (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= z.r * z.r;
  }
  kindAt(x, y) {
    const i = y * this.w + x, wk = this.walk[i];
    for (let k = this.zones.length - 1; k >= 0; k--) {
      const z = this.zones[k];
      if (!this.inZone(z, x, y)) continue;
      if (!wk && !z.road) continue;
      if (wk && !z.road && !z.over && this.kerbDist[i] <= (z.sidewalk ?? this.sidewalk)) continue;
      return z.kind;
    }
    if (!wk) { for (const q of this.roads) if (q.kind && x >= q.x && x < q.x + q.w && y >= q.y && y < q.y + q.h) return q.kind; return this.roadKind; }
    if (wk === 2) { for (const s of this.islands) if (x >= s.x && x < s.x + s.w && y >= s.y && y < s.y + s.h) return s.kind; }
    return this.kerbDist[i] <= this.sidewalk ? 'sidewalk' : this.lotKind;
  }
  kind(x, y) { x |= 0; y |= 0; return x < 0 || y < 0 || x >= this.w || y >= this.h ? null : this.kinds[y * this.w + x]; }
  paint(G, seed = 1, kerbRed = () => false) {
    this.kinds = new Array(this.w * this.h);
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) this.kinds[y * this.w + x] = this.kindAt(x, y);
    paintGround(G, (x, y) => this.kinds[y * this.w + x], seed);
    kerbs(G, (x, y) => this.isWalk(x, y), kerbRed);
  }
}

// ---- the scene -------------------------------------------------------------------------------------
export class Scene {
  constructor(w, h, preset = 'golden', seed = 1) {
    this.w = w; this.h = h; this.preset = preset; this.seed = seed;
    this.isNight = preset === 'night' || preset === 'rain';
    this.night = this.isNight ? 1 : preset === 'golden' ? 0.4 : 0;     // lit windows, neon
    this.lampsOn = preset === 'noon' ? 0 : 1;
    this.carLights = preset === 'noon' ? 0 : 1;
    this.win = this.isNight ? 1.2 : preset === 'golden' ? 0.6 : 0.12; // window light strength
    this.G = new GBuf(w, h);
    this.items = []; this.lights = []; this.wires = [];
    this.sprites = new Map();
  }
  rnd(i, k = 0) { return hash(i, k, this.seed * 131 + 7); }
  add(spr, x, y, dz = 0, base = y) { this.items.push({ spr, x, y, dz, base }); return spr; }
  // a voxel model, rendered once per (model, heading) when a key is given
  vox(m, x, y, hd = 0, dz = 0, base = y, key = null) {
    let spr;
    if (key) { const k = key + '@' + hd.toFixed(3); spr = this.sprites.get(k); if (!spr) { spr = m.render(hd); this.sprites.set(k, spr); } }
    else spr = m.render(hd);
    return this.add(spr, x, y, dz, base);
  }
  // a building whose footprint's south-west corner sits at (x, y); returns its placement for roof kit
  building(spec, x, y) {
    const s = { night: this.night, ...spec };
    const spr = makeBuilding(s);
    this.add(spr, x, y);
    return { x, y, w: spec.w, d: spec.d, H: buildingH(s), base: y, spr };
  }
  // rooftop kit: (rx, ry) measured from the footprint's north-west corner
  onRoof(b, m, rx, ry, hd = 0, key = null) { return this.vox(m, b.x + rx, b.y - b.d + ry, hd, b.H, b.base + 0.5, key); }
  sprOnRoof(b, spr, rx, ry) { return this.add(spr, b.x + rx, b.y - b.d + ry, b.H, b.base + 0.5); }
  person(x, y, kind = null, dir = 2, pose = 'idle', seed = null) {
    const s = seed ?? Math.floor(x * 7 + y * 13);
    const app = typeof kind === 'object' && kind ? kind : randomPerson(s, kind);
    return this.add(person(app, dir, pose, (x + y) & 3), x, y);
  }
  light(x, y, z, r, col, k) { this.lights.push({ x, y, z, r, col, k }); }
  // a street lamp's pool of light (the lamp model itself is placed by the caller)
  lampLight(x, y, z = 80, warm = LIGHT.sodium) { if (this.lampsOn) this.light(x, y + 2, z, this.isNight ? 190 : 100, warm, this.isNight ? 3.2 : 0.75); }
  // headlights and tail lights for a vehicle at (x, y) facing heading a, of length L
  carLight(x, y, a, L = 100) {
    if (!this.carLights) return;
    for (const dd of [L * 0.6, L]) this.light(x + Math.cos(a) * dd, y + Math.sin(a) * dd, 10, 56 + dd * 0.3, LIGHT.headlight, (this.isNight ? 1.5 : 0.6) - dd * 0.004);
    this.light(x - Math.cos(a) * L * 0.56, y - Math.sin(a) * L * 0.56, 12, 40, LIGHT.tail, this.isNight ? 1.2 : 0.45);
  }
  windowGlow(x, y, z, r = 70, col = LIGHT.warmWindow, k = 1) { this.light(x, y, z, r, col, this.win * k); }
  // an overhead wire between two points (world X, Y, Z), sagging in the middle
  wire(x0, y0, z0, x1, y1, z1, sag = 10, col = [30, 30, 36]) { this.wires.push({ x0, y0, z0, x1, y1, z1, sag, col }); }

  finish() {
    const G = this.G;
    this.items.sort((a, b) => a.base - b.base);
    for (const it of this.items) G.blit(it.spr, Math.round(it.x - it.spr.ax), Math.round(it.y - it.spr.ay - it.dz), it.dz);
    for (const w of this.wires) {
      const n = Math.ceil(Math.hypot(w.x1 - w.x0, w.y1 - w.y0 - (w.z1 - w.z0)) * 1.5) + 2;
      for (let i = 0; i <= n; i++) {
        const t = i / n, X = w.x0 + (w.x1 - w.x0) * t, Y = w.y0 + (w.y1 - w.y0) * t, Z = w.z0 + (w.z1 - w.z0) * t - w.sag * 4 * t * (1 - t);
        const sx = Math.round(X), sy = Math.round(Y - Z);
        if (!G.inside(sx, sy) || G.z[sy * G.w + sx] > Z + 2) continue;
        G.put(sx, sy, w.col, [0, 0.3, 0.95], Z, null, 0);
      }
    }
    // the renderer takes 64 point lights: keep the strongest
    const lights = this.lights.filter((l) => l.k > 0.02).sort((a, b) => b.k * b.r - a.k * a.r).slice(0, 64);
    return { G, lights };
  }
}
