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
import { person } from './people.js';
import { randomPerson } from './peoplepresets.js';
import { LIGHT } from './palette.js';
import { W, setWarp } from './warp.js';
import { chalkboard } from './props.js';
import { mailbox } from './props-district.js';

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

function segDist2(px, py, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], l = dx * dx + dy * dy;
  let t = l ? ((px - a[0]) * dx + (py - a[1]) * dy) / l : 0; t = Math.max(0, Math.min(1, t));
  return (px - a[0] - t * dx) ** 2 + (py - a[1] - t * dy) ** 2;
}
// ---- the street plan -------------------------------------------------------------------------------
export class Streets {
  // w, h and every shape below are in design coordinates; they are placed through the layout warp
  // (warp.js), so the plan comes out at world size. isWalk / kind / kindAt take world coordinates.
  constructor(w, h, opt = {}) {
    this.w = Math.round(W.x(w)); this.h = Math.round(W.y(h));
    this.corner = (opt.corner ?? 16) * W.grow;        // kerb return radius at block corners
    this.sidewalk = (opt.sidewalk ?? 26) * W.walk;    // default sidewalk width from the kerb
    this.roads = []; this.bulbs = []; this.islands = []; this.zones = [];
    this.roadKind = opt.roadKind || 'asphalt';
    this.lotKind = opt.lotKind || 'sidewalk';
  }
  road(x, y, w, h, opt = {}) { const [X, Y, WW, HH] = W.rect(x, y, w, h); this.roads.push({ ...opt, x: X, y: Y, w: WW, h: HH }); return this; }
  bulb(cx, cy, r) { this.bulbs.push({ cx: W.x(cx), cy: W.y(cy), r: r * W.grow * 1.4 }); return this; }
  // a raised island inside the carriageway (median, traffic island): a rounded rectangle of pavement
  island(x, y, w, h, r = 8, kind = 'sidewalk') { const [X, Y, WW, HH] = W.rect(x, y, w, h); this.islands.push({ x: Math.round(X), y: Math.round(Y), w: Math.round(WW), h: Math.round(HH), r, kind }); return this; }
  // lot ground. shape: rect {x,y,w,h,r?}, circle {cx,cy,r}, path {path: [[x,y]...], width} (a winding
  // walk), blob {blob: {cx,cy,rx,ry,seed,wob}} (a pond, a flower bed) or poly {poly: [[x,y]...]}.
  // over: also covers the sidewalk band (driveways, plazas); road: may be painted on the carriageway.
  zone(kind, shape, opt = {}) {
    const z = { kind, ...shape, ...opt };
    if (z.sidewalk !== undefined) z.sidewalk *= W.walk;
    if (z.path) { z.path = z.path.map(([x, y]) => [W.x(x), W.y(y)]); z.width *= W.grow; }
    else if (z.blob) z.blob = { ...z.blob, cx: W.x(z.blob.cx), cy: W.y(z.blob.cy), rx: z.blob.rx * W.kx(z.blob.cx), ry: z.blob.ry * W.ky(z.blob.cy) };
    else if (z.poly) z.poly = z.poly.map(([x, y]) => [W.x(x), W.y(y)]);
    else if (z.cx !== undefined) { const k = Math.min(W.grow, Math.max(W.kx(z.cx), W.ky(z.cy))); z.cx = W.x(z.cx); z.cy = W.y(z.cy); z.r *= k; }
    else if (z.x !== undefined) { const [X, Y, WW, HH] = W.rect(z.x, z.y, z.w, z.h); z.x = X; z.y = Y; z.w = WW; z.h = HH; }
    if (z.path) { const hw = z.width / 2 + 1; z.bb = [Math.min(...z.path.map((p) => p[0])) - hw, Math.min(...z.path.map((p) => p[1])) - hw, Math.max(...z.path.map((p) => p[0])) + hw, Math.max(...z.path.map((p) => p[1])) + hw]; }
    else if (z.blob) { const b = z.blob, k = 1 + (b.wob ?? 0.25); z.bb = [b.cx - b.rx * k, b.cy - b.ry * k, b.cx + b.rx * k, b.cy + b.ry * k]; }
    else if (z.poly) z.bb = [Math.min(...z.poly.map((p) => p[0])), Math.min(...z.poly.map((p) => p[1])), Math.max(...z.poly.map((p) => p[0])), Math.max(...z.poly.map((p) => p[1]))];
    this.zones.push(z); return this;
  }

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
    if (z.bb && (x < z.bb[0] || y < z.bb[1] || x > z.bb[2] || y > z.bb[3])) return false;
    if (z.path) { const r2 = (z.width / 2) ** 2; for (let i = 1; i < z.path.length; i++) if (segDist2(x + 0.5, y + 0.5, z.path[i - 1], z.path[i]) <= r2) return true; return false; }
    if (z.blob) { const b = z.blob, a = Math.atan2(y - b.cy, x - b.cx), w = 1 + (b.wob ?? 0.25) * (Math.sin(a * 3 + (b.seed || 0)) * 0.6 + Math.sin(a * 5 + (b.seed || 0) * 2.3) * 0.4); return ((x + 0.5 - b.cx) / b.rx) ** 2 + ((y + 0.5 - b.cy) / b.ry) ** 2 < w * w; }
    if (z.poly) { let inside = false; const P = z.poly; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { if ((P[i][1] > y) !== (P[j][1] > y) && x < (P[j][0] - P[i][0]) * (y - P[i][1]) / (P[j][1] - P[i][1]) + P[i][0]) inside = !inside; } return inside; }
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
  // the ground kind at a design position (for placing things in the kits)
  kindD(x, y) { return this.kind(W.x(x), W.y(y)); }
  kind(x, y) { x |= 0; y |= 0; return x < 0 || y < 0 || x >= this.w || y >= this.h ? null : this.kinds[y * this.w + x]; }
  paint(G, seed = 1, kerbRed = () => false) {
    this.kinds = new Array(this.w * this.h);
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) this.kinds[y * this.w + x] = this.kindAt(x, y);
    paintGround(G, (x, y) => this.kinds[y * this.w + x], seed);
    kerbs(G, (x, y) => this.isWalk(x, y), kerbRed);
  }
}

// a lit sign panel standing on a roof edge on two legs, its face to the camera (the shop's colour,
// light stripes for lettering)
function roofSign(col, night) {
  const c = typeof col === 'string' ? [parseInt(col.slice(1, 3), 16), parseInt(col.slice(3, 5), 16), parseInt(col.slice(5, 7), 16)] : col;
  const G = new GBuf(34, 26); G.ax = 17; G.ay = 24;
  for (const lx of [6, 27]) for (let v = 0; v < 8; v++) G.put(lx, 24 - v, [44, 44, 50], [0, 1, 0], v, null, 0);
  for (let v = 8; v < 24; v++) for (let x = 1; x < 33; x++) {
    const edge = v === 8 || v === 23 || x === 1 || x === 32, text = !edge && v > 11 && v < 20 && x > 4 && x < 29 && (x % 4 !== 0) && ((x * 7 + v * 3) % 5 !== 0);
    const cc = edge ? [36, 34, 40] : text ? [250, 244, 228] : c;
    G.put(x, 24 - v, cc, [0, 1, 0], v, edge ? null : [...cc, (text ? 140 : 50) + night * 110], 0);
  }
  return G;
}
const P_CHALK = () => chalkboard(), P_MAIL = () => mailbox('#2c3a66');
// ---- the scene -------------------------------------------------------------------------------------
export class Scene {
  // w, h in design coordinates; warp: the layout stretch for this block (see warp.js), set before
  // anything is placed. Positions passed to the methods below are design coordinates.
  constructor(w, h, preset = 'golden', seed = 1, warp = null) {
    setWarp(warp || {});
    this.dw = w; this.dh = h;
    w = Math.round(W.x(w)); h = Math.round(W.y(h));
    this.w = w; this.h = h; this.preset = preset; this.seed = seed;
    this.isNight = preset === 'night' || preset === 'rain' || preset === 'indoor';
    this.night = this.isNight ? 1 : preset === 'golden' ? 0.4 : 0;     // lit windows, neon
    this.lampsOn = preset === 'noon' ? 0 : 1;
    this.carLights = preset === 'noon' ? 0 : 1;
    this.win = this.isNight ? 1.2 : preset === 'golden' ? 0.6 : 0.12; // window light strength
    this.G = new GBuf(w, h);
    this.items = []; this.lights = []; this.wires = [];
    this.sprites = new Map();
  }
  rnd(i, k = 0) { return hash(i, k, this.seed * 131 + 7); }
  add(spr, x, y, dz = 0, base = y) { this.items.push({ spr, x: W.x(x), y: W.y(y), dz, base: W.y(base) }); return spr; }
  addWorld(spr, x, y, dz = 0, base = y) { this.items.push({ spr, x, y, dz, base }); return spr; }
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
    const spr = makeBuilding(s), X = W.x(x), Y = W.y(y);
    this.addWorld(spr, X, Y);
    const b = { x: X, y: Y, w: spec.w, d: spec.d, H: buildingH(s), base: Y, spr };
    for (const e of spec.northDoors || []) this.entrance(b, e);
    return b;
  }
  // An entrance on a building's north face. With this camera that face is hidden, and so is the strip of
  // ground in front of it (the roof covers it on screen for as far as the building is tall). So the way
  // in is marked where it can be seen: a lit sign standing on the roof's north edge, and out on the
  // pavement beyond the roof's shadow an A-board (shops) or a mailbox (homes), with light spilling onto
  // it. The doorstep and mat are painted at the face too, for when the roof is cut away near the player.
  // e: { x (from the building's west edge), w, kind: 'shop'|'home'|'service', col, glow }
  entrance(b, e) {
    const G = this.G, x0 = Math.round(b.x + e.x), y0 = Math.round(b.y - b.d), w = e.w || 22, shop = e.kind !== 'home' && e.kind !== 'service';
    for (let k = 1; k <= 10; k++) for (let x = x0 - 3; x < x0 + w + 3; x++) {
      if (!G.inside(x, y0 - k)) continue;
      const st = k <= 4, mat = k > 4 && k <= 9 && x >= x0 + 2 && x < x0 + w - 2;
      const c = st ? [180 - k * 8, 176 - k * 8, 166 - k * 7] : mat ? (e.kind === 'service' ? [90, 92, 96] : [70, 54, 44]) : null;
      if (c) G.put(x, y0 - k, c, [0, 0, 1], st ? 5 - k : 0, null, 1 | 8);
    }
    const col = e.col || (shop ? '#c8343a' : '#2a4a6a'), out = y0 - b.H - 16;
    if (shop) {
      this.addWorld(roofSign(col, this.night), x0 + w / 2, y0 + 8, b.H, b.base + 0.5);
      this.addWorld(this.render(P_CHALK(), 0, 'chalk'), x0 + w / 2, out, 0, out);
    } else this.addWorld(this.render(P_MAIL(), 0, 'mail'), x0 + w / 2, out, 0, out);
    this.light(W.ix(x0 + w / 2), W.iy(out + 6), 30, shop ? 90 : 50, e.glow || [1, 0.82, 0.55], this.isNight ? 1.5 : this.preset === 'golden' ? 0.5 : 0.15);
  }
  // rooftop kit: (rx, ry) measured from the footprint's north-west corner (world offsets)
  onRoof(b, m, rx, ry, hd = 0, key = null) { return this.addWorld(this.render(m, hd, key), b.x + rx, b.y - b.d + ry, b.H, b.base + 0.5); }
  sprOnRoof(b, spr, rx, ry) { return this.addWorld(spr, b.x + rx, b.y - b.d + ry, b.H, b.base + 0.5); }
  render(m, hd = 0, key = null) {
    if (!key) return m.render(hd);
    const k = key + '@' + hd.toFixed(3); let spr = this.sprites.get(k);
    if (!spr) { spr = m.render(hd); this.sprites.set(k, spr); }
    return spr;
  }
  person(x, y, kind = null, dir = 2, pose = 'idle', seed = null) {
    const s = seed ?? Math.floor(x * 7 + y * 13);
    const app = typeof kind === 'object' && kind ? kind : randomPerson(s, kind);
    return this.add(person(app, dir, pose, (x + y) & 3), x, y);
  }
  // someone standing on something raised (a ship's deck, a stage) dz px above the ground
  personUp(x, y, dz, kind = null, dir = 0, pose = 'idle', seed = null) {
    const s = seed ?? Math.floor(x * 7 + y * 13);
    return this.add(person(typeof kind === 'object' && kind ? kind : randomPerson(s, kind), dir, pose, (x + y) & 3), x, y, dz, y + 0.6);
  }
  // someone in the water: head and shoulders above the surface, a ring of ripples round them
  swimmer(x, y, kind = null, dir = 0, seed = null) {
    const s = seed ?? Math.floor(x * 7 + y * 13);
    const full = person(typeof kind === 'object' && kind ? kind : randomPerson(s, kind), dir, 'idle', 0);
    const cut = 24, g = new GBuf(full.w, cut + 4); g.ax = full.ax; g.ay = cut;
    g.blit(full, 0, 0);
    for (let yy = cut - 2; yy < g.h; yy++) for (let xx = 0; xx < g.w; xx++) { const j = (yy * g.w + xx) * 4; g.col[j + 3] = 0; }
    for (let a = 0; a < 6.28; a += 0.12) { const rx = Math.round(g.ax + Math.cos(a) * 11), ry = Math.round(cut - 1 + Math.sin(a) * 3); if (hash(rx, ry, s) > 0.3) g.put(rx, ry, [224, 244, 244], [0, 0, 1], 0, null, 2); }
    return this.add(g, x, y);
  }
  light(x, y, z, r, col, k) { this.lights.push({ x: W.x(x), y: W.y(y), z, r: r * W.grow, col, k }); }
  // a street lamp's pool of light (the lamp model itself is placed by the caller)
  lampLight(x, y, z = 80, warm = LIGHT.sodium, s = 1) { if (this.lampsOn) this.light(x, y + 2, z, (this.isNight ? 190 : 100) * (0.6 + 0.4 * s), warm, (this.isNight ? 3.2 : 0.75) * s); }
  // headlights and tail lights for a vehicle at (x, y) facing heading a, of length L
  carLight(x, y, a, L = 100) {
    if (!this.carLights) return;
    for (const dd of [L * 0.6, L]) this.light(x + Math.cos(a) * dd, y + Math.sin(a) * dd, 10, 56 + dd * 0.3, LIGHT.headlight, (this.isNight ? 1.5 : 0.6) - dd * 0.004);
    this.light(x - Math.cos(a) * L * 0.56, y - Math.sin(a) * L * 0.56, 12, 40, LIGHT.tail, this.isNight ? 1.2 : 0.45);
  }
  windowGlow(x, y, z, r = 70, col = LIGHT.warmWindow, k = 1) { this.light(x, y, z, r, col, this.win * k); }
  // an overhead wire between two points (world X, Y, Z), sagging in the middle
  wire(x0, y0, z0, x1, y1, z1, sag = 10, col = [30, 30, 36]) { this.wires.push({ x0: W.x(x0), y0: W.y(y0), z0, x1: W.x(x1), y1: W.y(y1), z1, sag, col }); }

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
