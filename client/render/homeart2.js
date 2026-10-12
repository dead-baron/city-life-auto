// Inside your home in art v2 (H64; the owner's M1/M4/HO1-HO3 concepts): the plan (shared/homelayout.js) drawn in the
// game's own 3/4 view - the floors by room (wood, tiles, carpet, the garage's concrete, rugs by the price), the walls
// standing up with their south faces showing, the back (north) wall full height with its windows, pictures and lamps,
// the rest cut low so you see in (as the walk-in businesses are: client/art2/interior.js), the front door in the cut
// front wall, the garage's roller door; the furniture as voxel models (client/art2/props-home.js), and you, your
// friends and the cars in the garage drawn as in the street (art v2's people and cars, at the street's size) - all
// sorted by where they stand, so you walk behind the bed's foot and the cut walls. Lit on the CPU once per light (the
// day through the windows, the lamps and each room's light at night): no WebGL of its own. homeview.js loads this
// only with art v2 on - its imports (the renderer's people and cars) are in the page already by then.
import { GBuf, hash, vnoise, step, bayer, F_GLASS } from '../art2/gbuf.js';
import { ramp } from '../art2/palette.js';
import { MAKERS, LOOK } from '../art2/props-home.js';
import { pedSprite } from '../art2/game/peds.js';
import { vehicleSprite, animalSprite } from '../art2/game/actors.js';
import { TILE_IN, CAR_IN } from '../../shared/homelayout.js';
import { VEHICLES } from '../../shared/vehicles.js';

const T = TILE_IN;
export const HF = 46, HC = 14;   // the walls' heights (world px): the back wall full, the rest cut low
export const YARD = 72;          // the ground drawn round the place (world px)
const UP = [0, 0, 1], SOUTH = [0, 1, 0];
const WALLISH = new Set(['#', '=', 'D', 'R', 'U', 'E']);   // (U a flat's door, E the lift: a lobby's back wall - H71)
const FLOORISH = new Set(['.', 'c', 't', 'g', '+']);

// the rooms: the plan's open tiles flooded between the walls (a doorway joins none), each with its kind
function rooms(L) {
  const id = new Int16Array(L.cols * L.rows).fill(-1), list = [];
  for (let y = 0; y < L.rows; y++) for (let x = 0; x < L.cols; x++) {
    const ch = L.cell(x, y);
    if (WALLISH.has(ch) || ch === '+' || id[y * L.cols + x] >= 0) continue;
    const r = { i: list.length, tiles: [], kind: 'living', x0: x, y0: y, x1: x, y1: y };
    const q = [[x, y]]; id[y * L.cols + x] = r.i;
    while (q.length) {
      const [cx, cy] = q.pop(); r.tiles.push([cx, cy]);
      r.x0 = Math.min(r.x0, cx); r.x1 = Math.max(r.x1, cx); r.y0 = Math.min(r.y0, cy); r.y1 = Math.max(r.y1, cy);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + dx, ny = cy + dy, c2 = L.cell(nx, ny);
        if (nx < 0 || ny < 0 || nx >= L.cols || ny >= L.rows || WALLISH.has(c2) || c2 === '+' || id[ny * L.cols + nx] >= 0) continue;
        id[ny * L.cols + nx] = r.i; q.push([nx, ny]);
      }
    }
    const has = (s) => r.tiles.some(([tx, ty]) => s.includes(L.cell(tx, ty)));
    r.kind = has('g') ? 'garage' : has('B') ? 'bed' : has('HL') ? 'bath' : has('K') ? 'kitchen' : 'living';
    list.push(r);
  }
  // a doorway takes the room of a floor beside it
  for (let y = 0; y < L.rows; y++) for (let x = 0; x < L.cols; x++) if (L.cell(x, y) === '+') {
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const j = (y + dy) * L.cols + x + dx; if (x + dx >= 0 && x + dx < L.cols && y + dy >= 0 && y + dy < L.rows && id[j] >= 0) { id[y * L.cols + x] = id[j]; break; } }
  }
  return { id, list, at: (x, y) => (x < 0 || y < 0 || x >= L.cols || y >= L.rows ? null : list[id[y * L.cols + x]] || null) };
}

// ---- the looks of the surfaces, by tier ------------------------------------------------------------------------------
const WOOD = ['#8c7458', '#9a6c44', '#a8784a', '#c49464'].map((c) => ramp(c, 6, 3));
const CARPET = ['#6e6a5c', '#5a6a86', '#7a4e48', '#4a3a5e'].map((c) => ramp(c, 6, 3));
const TILE = [['#c8c6b6', '#a8a696'], ['#dcdcd2', '#7a9ab0'], ['#e6e4da', '#c8d0d6'], ['#f2f0ea', '#dedad0']].map((p) => p.map((c) => ramp(c, 5, 2)));
const CONC = ramp('#8e8c88', 6, 3);
const RUNNER = ramp('#8a2e2a', 6, 3);   // (H71: a lobby's landing)
const PAPER = { living: ['#b8a888', '#c8b48e', '#d8c49a', '#3e4a5a'], bed: ['#a8a090', '#8aa0b4', '#9ab08e', '#6a2e36'], kitchen: ['#d0ccb8', '#e0dcc8', '#e8e4d4', '#e8e6de'], bath: ['#c8ccc4', '#d8e4ea', '#d8e4ea', '#e8eef0'] };
const OUTSIDE = ['#8a929a', '#8e4a3c', '#b8a07a', '#d8d0c0'];   // the front wall's outside: tin, brick, siding, stone
const CAP = ramp('#3a3440', 5, 2), RIM = ramp('#8a8070', 5, 2);

function floorPx(kind, tier, wx, wy, x, y) {
  if (kind === 't') {
    const P = TILE[tier], s = 16, gx = wx % s, gy = wy % s;
    if (gx < 1 || gy < 1) return step(ramp('#8a8a84', 5, 2), 0.45, x, y, 0.2);
    const ch = ((Math.floor(wx / s) + Math.floor(wy / s)) & 1) && tier <= 1;
    let t = 0.55 + (hash(Math.floor(wx / s), Math.floor(wy / s), 3) - 0.5) * 0.18 + (gx < 3 && gy < 3 ? 0.15 : 0);
    if (tier >= 3 && Math.abs(Math.sin((wx + wy * 0.6) * 0.09 + vnoise(wx, wy, 14, 2) * 4)) < 0.06) t -= 0.25;   // the marble's veins
    return step(P[ch ? 1 : 0], t, x, y, 0.4);
  }
  if (kind === 'u') { const e = Math.min(wy - 36, 156 - wy); return step(RUNNER, e < 8 ? (e < 2 ? 0.25 : 0.62) : 0.45 + (vnoise(wx, wy, 6, 4) - 0.5) * 0.2 + ((Math.floor(wx / 8) + Math.floor(wy / 8)) & 1 ? 0.06 : 0), x, y, 0.5); }   // (H71: a lobby's runner, its border)
  if (kind === 'c') return step(CARPET[tier], 0.5 + (vnoise(wx, wy, 6, 4) - 0.5) * 0.3 + (hash(wx, wy, 7) - 0.5) * 0.12, x, y, 0.6);
  if (kind === 'g') {
    let t = 0.52 + (vnoise(wx, wy, 26, 5) - 0.5) * 0.22 + (hash(wx >> 1, wy >> 1, 6) - 0.5) * 0.08;
    if (wx % 96 < 1 || wy % 96 < 1) t -= 0.2;   // the slab's joints
    return step(CONC, t, x, y, 0.5);
  }
  // wood: planks east-west, staggered joints, grain; a trailer's scuffed
  const row = Math.floor(wy / 8), off = Math.floor(hash(row, 1, 9) * 64), lx = (wx + off) % 64;
  if (wy % 8 < 1) return WOOD[tier][1];
  let t = 0.52 + (hash(Math.floor((wx + off) / 64), row, 2) - 0.5) * 0.3 + (vnoise(wx * 0.3, wy * 3, 10, 3) - 0.5) * 0.18;
  if (lx < 1) t -= 0.3;
  if (tier === 0 && vnoise(wx, wy, 18, 8) > 0.7) t -= 0.15;
  return step(WOOD[tier], t, x, y, 0.5);
}
// a rug: its field, a border, a medallion, the fringe at the ends
function rug(G, ap, rx, ry, rw, rh, tier, seed) {
  const C = [['#8a6a4a', '#6a4a30', '#c8a070'], ['#3e5a8a', '#2a3a5a', '#d8c890'], ['#7a2e2a', '#4a1e1e', '#d8b060'], ['#7a1d24', '#2a1a3a', '#e8c050']][tier].map((c) => ramp(c, 5, 2));
  for (let y = Math.floor(ry / ap); y < Math.ceil((ry + rh) / ap); y++) for (let x = Math.floor(rx / ap); x < Math.ceil((rx + rw) / ap); x++) {
    const u = x * ap - rx, v = y * ap - ry, e = Math.min(u, v, rw - u, rh - v);
    if (e < 0) continue;
    let c;
    if ((u < 3 || u > rw - 3) && (y & 1)) c = ramp('#e8e0c8', 4, 2)[2];   // the fringe
    else if (e < 4) c = step(C[1], 0.45, x, y, 0.3);
    else if (e < 7) c = step(C[2], 0.5 + ((Math.floor(u / 4) + Math.floor(v / 4)) & 1 ? 0.15 : -0.1), x, y, 0.3);
    else { const m = Math.abs(u - rw / 2) / rw + Math.abs(v - rh / 2) / rh; c = step(m < 0.18 ? C[2] : C[0], 0.45 + (hash(Math.floor(u / 3), Math.floor(v / 3), seed) - 0.5) * 0.25 + (m < 0.22 && m > 0.16 ? -0.3 : 0), x, y, 0.4); }
    G.put(x, y, c, UP, 0);
  }
}

// ---- building the scene ---------------------------------------------------------------------------------------------
export class HomeArt {
  // Built a little at a time (work(ms) each frame: a phone never stalls on the way in - homeview.js draws the classic
  // view until it's ready), then lit the same way for each step of the day
  // (H71) prev: the drawing of the same home before a change of decor - its yard, walls, floor and furniture models are
  // kept where the change didn't touch them (a piece placed, moved or turned: only the furniture and the floor's shadows
  // and rugs are made again; the paint: the walls; a new floor: the floor), so a change is a moment, not seconds
  constructor(L, ap = 2, prev = null) {
    this.L = L; this.ap = ap; this.tier = L.tier; this.R = prev && prev.R && (prev.L.base || prev.L) === (L.base || L) ? prev.R : rooms(L);
    this.items = []; this.lamps = []; this.windows = []; this.floor = null;
    this.envKey = ''; this.people = new Map(); this.cars = new Map(); this.figs = new Map();
    this.prev = prev; this.models = new Map();
    this.ready = false; this.job = this.build(); this.lightJob = null;
  }
  *build() {
    const P = this.prev, same = !!P && P.ap === this.ap && (P.L.base || P.L) === (this.L.base || this.L) && !P.job;
    this.prev = null;
    const d = this.L.decor || {}, d0 = (same && P.L.decor) || {}, eq = (a, b) => JSON.stringify(a || {}) === JSON.stringify(b || {});
    if (same) { this.models = P.models; this.figs = P.figs; this.yard = { G: P.yard.G, x: P.yard.x, y: P.yard.y }; } else this.buildYard();
    yield;
    if (same && P.floorBase && eq(d.floor, d0.floor)) this.floorBase = P.floorBase;
    yield* this.buildFloor();
    if (same && P.wallItems && eq(d.wall, d0.wall)) {
      this.wallItems = P.wallItems;
      for (const it of P.wallItems) this.items.push({ G: it.G, x: it.x, y: it.y, base: it.base, wall: it.wall });
      this.lamps.push(...P.lamps.filter((l) => l.kind === 'sconce'));
    } else yield* this.buildWalls();
    yield* this.buildFurniture();
  }
  // (H71) your pet's lit sprite: art v2's own dog or cat (as in the street), shaded where it stands
  pet(art, pose, d8, fr, x, y) {
    const key = `pet|${art}|${pose}|${d8}|${fr}`, pk = `${key}|${Math.round(x / 16)}|${Math.round(y / 16)}`;
    let c = this.people.get(pk);
    if (!c) {
      if (this.people.size > 160) this.people.clear();
      let G = this.figs.get(key);
      if (!G) { if (this.figs.size > 120) this.figs.clear(); G = animalSprite('pet:' + art, pose, d8, fr); this.figs.set(key, G); }
      const s = G.ap || 1;
      c = { cv: this.shade(G, x - G.ax * s, y - G.ay * s, s, this.E), ax: G.ax * s, ay: G.ay * s, w: G.w * s, h: G.h * s };
      this.people.set(pk, c);
    }
    return c;
  }
  // do the building and the lighting for up to ms; ready once it's all built and lit
  work(ms) {
    const t = performance.now();
    while (performance.now() - t < ms) {
      const j = this.job || this.lightJob;
      if (!j) break;
      if (j.next().done) { if (this.job) this.job = null; else this.lightJob = null; }
    }
    this.ready = !this.job && !!(this.floor && this.floor.cv && this.yard.cv) && this.items.every((it) => it.cv);
    return this.ready;
  }
  floorKind(tx, ty) {
    const f = this.L.floorAt && this.L.floorAt(tx, ty);   // (H67: a new floor laid in the room - shared/homedecor.js)
    if (f) return f[1] === '.' ? '.' : f[1];
    const ch = this.L.cell(tx, ty);
    if (ch === 'c' && /^lobby/.test(this.L.key)) return 'u';   // (H71: a lobby's landing - the red runner)
    if (ch === 't' || ch === 'g' || ch === 'c') return ch;
    const r = this.R.at(tx, ty);
    if (r && r.kind === 'garage') return 'g';
    if (r && (r.kind === 'bath')) return 't';
    if (r && r.kind === 'bed' && this.tier >= 2 && !r.tiles.some(([x, y]) => L4K(this.L, x, y))) return 'c';   // (a bedroom carpeted - not a great room with the kitchen in it)
    return '.';
  }
  // the ground round the place (the concepts show a home cut away in its lot): a lawn - a yard of paving round an
  // apartment - the path from the front door, the drive from the garage, a few flowers along the front of a good one
  buildYard() {
    const L = this.L, ap = this.ap, M = YARD, G = new GBuf(Math.ceil((L.w + 2 * M) / ap), Math.ceil((L.h + 2 * M) / ap));
    const paved = /^(apartment|studio|penthouse|lobby)/.test(L.key), grass = ramp(['#7a8a3e', '#6a9236', '#5e9a34', '#4e9a3a'][this.tier], 6, 3), pave = ramp('#b8b0a0', 6, 3), conc = ramp('#9c9a94', 6, 3);
    let r0 = L.cols, r1 = -1;
    for (let tx = 0; tx < L.cols; tx++) if (L.cell(tx, L.rows - 1) === 'R') { r0 = Math.min(r0, tx); r1 = Math.max(r1, tx); }
    for (let y = 0; y < G.h; y++) for (let x = 0; x < G.w; x++) {
      const wx = x * ap - M, wy = y * ap - M;
      if (wx >= 0 && wy >= 0 && wx < L.w && wy < L.h) continue;
      let c;
      const path = L.door && wy >= L.h && Math.abs(wx - L.door.x) < 18, drive = r1 >= 0 && wy >= L.h && wx >= r0 * T && wx < (r1 + 1) * T;
      if (drive) c = step(conc, 0.5 + (vnoise(wx, wy, 20, 7) - 0.5) * 0.2 + (wy % 48 < 1 ? -0.2 : 0), x, y, 0.4);
      else if (path || paved) c = step(pave, 0.55 + ((((wx % 16) + 16) % 16 < 1 || (((wy % 16) + 16) % 16) < 1) ? -0.3 : (hash(wx >> 4, wy >> 4, 3) - 0.5) * 0.2), x, y, 0.3);
      else {
        c = step(grass, 0.5 + (vnoise(wx, wy, 14, 2) - 0.5) * 0.3 + (hash(x, y, 5) - 0.5) * 0.25, x, y, 0.6);
        if (this.tier >= 1 && wy >= L.h && wy < L.h + 12 && hash(wx >> 2, wy >> 2, 8) > 0.8) c = [[220, 70, 80], [240, 200, 70], [180, 120, 220]][Math.floor(hash(wx >> 2, 1, 9) * 3)];   // flowers along the front
      }
      G.put(x, y, c, UP, 0);
    }
    this.yard = { G, x: -M, y: -M };
  }
  *buildFloor() {
    const L = this.L, ap = this.ap;
    const G = this.floorBase ? cloneG(this.floorBase) : new GBuf(Math.ceil(L.w / ap), Math.ceil(L.h / ap));   // (H71: the bare floor kept from before a change of decor)
    if (!this.floorBase) {
      for (let y = 0; y < G.h; y++) {
        for (let x = 0; x < G.w; x++) {
          const wx = x * ap, wy = y * ap, tx = Math.floor(wx / T), ty = Math.floor(wy / T);
          if (WALLISH.has(L.cell(tx, ty)) && L.cell(tx, ty) !== 'D') continue;
          const f = this.L.floorAt && this.L.floorAt(tx, ty);
          G.put(x, y, floorPx(this.floorKind(tx, ty), f ? f[2] : this.tier, wx, wy, x, y), UP, 0);
        }
        if (y % 24 === 23) yield;
      }
      // a threshold across each doorway, along the wall it's in
      const sill = ramp(this.tier >= 2 ? '#c8b89a' : '#6a5038', 4, 2);
      for (let ty = 0; ty < L.rows; ty++) for (let tx = 0; tx < L.cols; tx++) {
        if (L.cell(tx, ty) !== '+') continue;
        const across = WALLISH.has(L.cell(tx - 1, ty)) || WALLISH.has(L.cell(tx + 1, ty));   // (in a wall running east-west)
        for (let y = Math.floor(ty * T / ap); y < (ty + 1) * T / ap; y++) for (let x = Math.floor(tx * T / ap); x < (tx + 1) * T / ap; x++) {
          const u = x * ap - tx * T, v = y * ap - ty * T, k = across ? v : u;
          if (k >= 11 && k < 21) G.put(x, y, step(sill, k === 11 || k === 20 ? 0.2 : 0.6, x, y, 0.3), UP, 0);
        }
      }
      this.floorBase = cloneG(G);
    }
    // a soft shadow along the foot of every wall's face (the walls stand up)
    for (let y = 0; y < G.h; y++) for (let x = 0; x < G.w; x++) {
      const wy = y * ap, tx = Math.floor(x * ap / T), ty = Math.floor(wy / T), above = L.cell(tx, ty - 1);
      if (!WALLISH.has(above) || WALLISH.has(L.cell(tx, ty))) continue;
      const k = wy - ty * T; if (k > 8) continue;
      const j = (y * G.w + x) * 4, m = 0.6 + k * 0.05;
      G.col[j] *= m; G.col[j + 1] *= m; G.col[j + 2] *= m;
    }
    // a soft shadow under each piece of furniture, a little to the south-east (the light's from the windows behind)
    for (const p0 of L.pieces) {
      if (p0.flat || p0.wall) continue;   // (H67: a rug, a picture or a TV on the wall)
      const p = p0.ch === 'P' ? { x: p0.x + 8, y: p0.y + 12, w: p0.w - 16, h: p0.h - 14 } : p0;   // (a plant's pot: a small one)
      for (let y = Math.floor((p.y + 3) / ap); y < (p.y + p.h + 5) / ap; y++) for (let x = Math.floor((p.x + 2) / ap); x < (p.x + p.w + 4) / ap; x++) {
        if (!G.inside(x, y)) continue;
        const j = (y * G.w + x) * 4, e = Math.min(x * ap - p.x - 2, y * ap - p.y - 3, p.x + p.w + 4 - x * ap, p.y + p.h + 5 - y * ap), m = e < 3 ? 0.84 : 0.7;
        G.col[j] *= m; G.col[j + 1] *= m; G.col[j + 2] *= m;
      }
    }
    // the garage's bays painted on the floor, and an oil stain
    for (const b of L.bays) for (let y = Math.floor((b.y - 56) / ap); y < (b.y + 56) / ap; y++) for (const ex of [b.x - CAR_IN.w / 2 - 6, b.x + CAR_IN.w / 2 + 4]) for (let k = 0; k < 2; k += ap) G.put(Math.floor((ex + k) / ap), y, ramp('#e8d890', 4, 2)[1], UP, 0);
    // rugs, by the price: in front of the couch, by the bed, under the table; the mat inside the front door
    const t = this.tier;
    if (t >= 1) for (const p of L.pieces) {
      let r = null;
      if (p.ch === 'C') r = p.w > p.h ? { x: p.x - 4, y: p.y - 60, w: p.w + 16, h: 52 } : this.L.solid(p.tx - 1, p.ty) ? { x: p.x + p.w + 6, y: p.y + 4, w: 64, h: p.h - 8 } : { x: p.x - 70, y: p.y + 4, w: 64, h: p.h - 8 };
      else if (p.ch === 'B') r = { x: p.x - 8, y: p.y + 12, w: p.w + 16, h: p.h + 10 };
      else if (p.ch === 'T' && t >= 2) r = { x: p.x - 6, y: p.y - 6, w: p.w + 12, h: p.h + 12 };
      if (r) rug(G, ap, r.x, r.y, r.w, r.h, t, p.tx * 7 + p.ty);
    }
    if (L.door) rug(G, ap, L.door.x - 20, L.door.y - T / 2 - 18, 40, 16, Math.min(1, t), 5);
    for (const p of L.pieces) if (p.flat) rug(G, ap, p.x + 3, p.y + 3, p.w - 6, p.h - 6, Math.max(1, t), p.tx * 5 + p.ty * 3 + p.dec);   // (H67: the rugs you've put down)
    this.floor = { G, x: 0, y: 0 };
  }
  // the walls: a sprite for each run along a row (sorted by where it stands), its cap and - where it shows - its face
  *buildWalls() {
    const L = this.L, ap = this.ap, t = this.tier, R = this.R, n0 = this.items.length;
    const hOf = (tx, ty) => (WALLISH.has(L.cell(tx, ty)) ? (ty === 0 ? HF : HC) : 0);
    const last = L.rows - 1;
    for (let ty = 0; ty < L.rows; ty++) {
      let tx = 0;
      while (tx < L.cols) {
        if (!WALLISH.has(L.cell(tx, ty)) || L.cell(tx, ty) === 'D') { tx++; continue; }
        let tx1 = tx; while (tx1 + 1 < L.cols && WALLISH.has(L.cell(tx1 + 1, ty)) && L.cell(tx1 + 1, ty) !== 'D') tx1++;
        const h = hOf(tx, ty), wx0 = tx * T, wy0 = ty * T - h, W = (tx1 - tx + 1) * T;
        const G = new GBuf(Math.ceil(W / ap), Math.ceil((T + h) / ap));
        for (let y = 0; y < G.h; y++) for (let x = 0; x < G.w; x++) {
          const wx = wx0 + x * ap, wy = wy0 + y * ap, ctx = Math.floor(wx / T), ch = L.cell(ctx, ty);
          const below = ty < last ? hOf(ctx, ty + 1) : 0, faceTop = (ty + 1) * T - h;
          if (wy < faceTop) {   // the cap
            const u = wy - wy0, edge = (u < ap && !WALLISH.has(L.cell(ctx, ty - 1))) || (u >= T - ap && !WALLISH.has(L.cell(ctx, ty + 1))) || (wx - wx0 < ap && !WALLISH.has(L.cell(ctx - 1, ty))) || (wx0 + W - wx <= ap && !WALLISH.has(L.cell(ctx + 1, ty)));
            G.put(x, y, edge ? step(RIM, 0.5, x, y, 0.3) : step(CAP, 0.45 + (hash(x >> 2, y >> 2, 4) - 0.5) * 0.1, x, y, 0.3), UP, h);
            continue;
          }
          if (below >= h) continue;   // (the wall goes on south: the next row's cap covers this)
          const v = (ty + 1) * T - wy;   // height up the face
          G.put(x, y, this.facePx(ch, ctx, ty, wx, v, h, x, y), SOUTH, v);
          if (ch === '=' && this.inGlass(ctx, ty, wx, v)) G.flag[y * G.w + x] |= F_GLASS;
        }
        // pictures and a wall lamp along the back wall's face, by the price
        if (ty === 0 && t >= 1) this.decorateBack(G, wx0, wy0, tx, tx1, h);
        this.items.push({ G, x: wx0, y: wy0, base: (ty + 1) * T + (ty === last ? 1 : 0), wall: true });
        tx = tx1 + 1;
      }
      yield;
    }
    // the front door: a gap in the cut front wall, the door shut in it, the step outside
    if (L.door) {
      const ap2 = this.ap, G = new GBuf(Math.ceil(T / ap2), Math.ceil((T + HC) / ap2)), wx0 = L.door.tx * T, wy0 = L.door.ty * T - HC;
      const dr = ramp(t >= 3 ? '#4a2a1c' : t >= 2 ? '#7a3a2a' : '#6a5038', 5, 2);
      for (let y = 0; y < G.h; y++) for (let x = 0; x < G.w; x++) {
        const wx = wx0 + x * ap2, wy = wy0 + y * ap2, u = wx - wx0;
        if (u < 3 || u >= T - 3) { const v = (L.door.ty + 1) * T - wy; if (wy < (L.door.ty + 1) * T - HC) G.put(x, y, step(RIM, 0.4, x, y, 0.3), UP, HC); else G.put(x, y, step(CAP, 0.6, x, y, 0.3), SOUTH, v); continue; }
        const v = (L.door.ty + 1) * T - wy;
        if (v >= 0 && v < HC && wy > L.door.ty * T + 4) G.put(x, y, step(dr, 0.45 + (Math.abs(u - T / 2) < 1 ? -0.3 : 0) + (u === T - 9 && v > 5 && v < 9 ? 0.6 : 0), x, y, 0.3), SOUTH, v);
      }
      this.items.push({ G, x: wx0, y: wy0, base: (L.door.ty + 1) * T + 1 });
    }
    this.wallItems = this.items.slice(n0);   // (H71: kept for the next drawing after a change of decor)
    void R;
  }
  inGlass(tx, ty, wx, v) { const u = wx - tx * T; return v >= 14 && v < 38 && u >= (L4ch(this.L, tx - 1, ty) ? 0 : 4) && u < (L4ch(this.L, tx + 1, ty) ? T : T - 4); }
  facePx(ch, tx, ty, wx, v, h, x, y) {
    const L = this.L, t = this.tier, last = L.rows - 1;
    if (ty === last) {   // the outside of the front wall (the roller door in it)
      if (ch === 'R') return step(ramp('#a8acb2', 5, 2), 0.5 + (v % 3 === 0 ? -0.35 : 0.1), x, y, 0.2);
      const kind = L.key === 'trailer' ? 0 : L.key === 'apartment' || /^lobby/.test(L.key) ? 1 : L.key === 'mansion' ? 3 : 2;
      return step(ramp(OUTSIDE[kind], 5, 2), 0.5 + (kind === 0 ? (wx % 6 < 1 ? -0.3 : 0) : kind === 1 ? ((v % 4 === 0 || (wx + (Math.floor(v / 4) & 1) * 4) % 9 === 0) ? -0.35 : 0) : kind === 2 ? (v % 4 === 0 ? -0.25 : 0) : (v % 7 === 0 || wx % 14 === 0 ? -0.2 : 0)), x, y, 0.3);
    }
    const u = wx - tx * T;
    if (ch === 'U' || ch === 'E') {   // (H71) a flat's door along a lobby's landing, its brass number plate; the lift's steel doors
      const lt = L.cell(tx - 1, ty) === ch, rt = L.cell(tx + 1, ty) === ch;
      if (ch === 'E') {
        if (!lt && v >= 38 && v < 42 && u >= T - 6) return [240, 190, 80];   // (the floor lamp over it)
        if (v < 37 && (u >= 3 || lt) && (u < T - 3 || rt)) return step(ramp('#a8b0b8', 5, 2), 0.6 + ((u === T - 1 && rt) || (u === 0 && lt) ? -0.6 : 0) + (u % 7 === 0 ? -0.1 : 0), x, y, 0.2);
        if (v < 39) return step(ramp('#5a6068', 4, 2), 0.5, x, y, 0.2);
      } else {
        const dr = ramp(t >= 3 ? '#4a2a1c' : t >= 2 ? '#7a3a2a' : t >= 1 ? '#3e5a4a' : '#6a5038', 5, 2);
        if (v < 35 && u >= 5 && u < T - 5) return step(dr, 0.5 + ((v === 18 || u === 9 || u === T - 10) ? -0.25 : 0) + (u === T - 9 && v >= 15 && v < 18 ? 0.7 : 0) + (v >= 28 && v < 32 && u >= 13 && u < 19 ? 0.6 : 0), x, y, 0.3);
        if (v < 37 && u >= 3 && u < T - 3) return step(ramp(t >= 2 ? '#f0ece0' : '#5a4636', 4, 2), 0.55, x, y, 0.2);
      }
    }
    if ((u < 3 && L.cell(tx - 1, ty) === '+') || (u >= T - 3 && L.cell(tx + 1, ty) === '+')) return step(ramp(t >= 2 ? '#f0ece0' : LOOK[t].wood, 4, 2), u === 1 || u === T - 2 ? 0.75 : 0.4, x, y, 0.2);   // a doorway's casing
    if (v < 3) return step(ramp(t >= 2 ? '#f0ece0' : '#5a4636', 4, 2), 0.5, x, y, 0.2);   // the skirting
    const r = this.R.at(tx, ty + 1) || this.R.at(tx, ty + 2);
    const kind = r ? r.kind : 'living';
    if (ch === '=') {
      if (this.inGlass(tx, ty, wx, v)) return [120, 160, 200];   // (the sky's colour comes with the light: relight)
      const frame = v >= 12 && v < 40 && u >= 2 && u < T - 2;
      if (frame) return step(ramp(t >= 2 ? '#f0ece4' : '#a08a6a', 4, 2), v < 14 ? 0.3 : 0.6, x, y, 0.2);
      if (t >= 1 && v >= 12 && v < 44 && (u < 4 || u >= T - 4) && !L4ch(L, tx + (u < 4 ? -1 : 1), ty)) return step(ramp(LOOK[t].cover, 5, 2), 0.5 + (wx % 3 === 0 ? -0.2 : 0), x, y, 0.3);   // the curtains
    }
    const paint = L.paintAt && L.paintAt(tx, ty);   // (H67: the room's walls painted - shared/homedecor.js)
    if (paint) return step(ramp(paint, 6, 3), 0.55 + (t >= 1 && (wx % 10 < 1) ? -0.06 : 0) + (vnoise(wx, v, 12, 3) - 0.5) * 0.08, x, y, 0.4);
    if (kind === 'garage') return step(ramp('#9a9a96', 6, 3), 0.55 + (v % 8 === 0 || (wx + (Math.floor(v / 8) & 1) * 8) % 16 === 0 ? -0.25 : 0), x, y, 0.3);
    if (L.key === 'trailer') return step(ramp('#9a7a56', 6, 3), 0.5 + (wx % 8 < 1 ? -0.3 : 0) + (hash(wx >> 3, 1, 3) - 0.5) * 0.2, x, y, 0.4);   // wood panelling
    const base = PAPER[kind][t] || PAPER.living[t];
    if (kind === 'bath' || kind === 'kitchen') return step(ramp(base, 5, 2), 0.55 + (wx % 8 < 1 || v % 8 === 0 ? -0.25 : 0), x, y, 0.3);
    if (t >= 2 && v < h * 0.4 && h > HC) return step(ramp(LOOK[t].wood, 5, 2), 0.5 + (v === Math.floor(h * 0.4) - 1 ? 0.3 : wx % 12 < 1 ? -0.2 : 0), x, y, 0.3);   // the wainscot
    return step(ramp(base, 6, 3), 0.55 + (t >= 1 && (wx % 10 < 1) ? -0.08 : 0) + (vnoise(wx, v, 12, 3) - 0.5) * 0.1, x, y, 0.4);
  }
  decorateBack(G, wx0, wy0, tx0, tx1, h) {
    const L = this.L, ap = this.ap, t = this.tier;
    for (let tx = tx0; tx <= tx1; tx++) {
      const ch = L.cell(tx, 0), below = L.cell(tx, 1);
      if (ch !== '#' || !FLOORISH.has(below) || hash(tx, t, 21) > 0.45) continue;
      if (L4ch(L, tx - 1, 0) || L4ch(L, tx + 1, 0)) continue;
      // a picture in a frame
      const pw = 18, ph = 14, u0 = tx * T + 7, v0 = 18;
      const sc = ramp(['#4a7aa8', '#c87a4a', '#5a8a5a'][Math.floor(hash(tx, 3, 5) * 3)], 5, 2);
      for (let v = v0; v < v0 + ph; v++) for (let u = u0; u < u0 + pw; u++) {
        const x = Math.floor((u - wx0) / ap), y = Math.floor(((1) * T - v - wy0) / ap);
        const fr = u < u0 + 2 || u >= u0 + pw - 2 || v < v0 + 2 || v >= v0 + ph - 2;
        G.put(x, y, fr ? step(ramp(t >= 3 ? '#d8b050' : '#6a4a2a', 4, 2), 0.5, x, y, 0.2) : step(sc, (v - v0) / ph * 0.8 + 0.1, x, y, 0.5), SOUTH, v);
      }
      if (t >= 2 && hash(tx, 9, 2) > 0.5) {   // a wall lamp beside it
        this.lamps.push({ x: tx * T + 29, y: T + 2, z: 36, kind: 'sconce' });
        for (let v = 30; v < 40; v++) for (let uu = tx * T + 27; uu < tx * T + 32; uu++) {
          const x = Math.floor((uu - wx0) / ap), y = Math.floor((T - v - wy0) / ap), lit = v >= 33;
          G.put(x, y, lit ? [250, 226, 170] : [176, 140, 70], SOUTH, v, lit ? [255, 214, 140, 200] : null);
        }
      }
    }
    void h;
  }
  // the furniture: each piece a voxel model turned to face the room
  *buildFurniture() {
    const L = this.L, ap = this.ap;
    const wall = (x, y) => WALLISH.has(L.cell(x, y));
    for (const p of L.pieces) {
      const make = MAKERS[p.ch];
      if (!make) continue;
      if (p.flat) continue;   // (H67: a rug - drawn on the floor)
      let face = 's';
      if (p.face) face = p.face;   // (H67: the shop's pieces face the way you turned them)
      else if (p.ch === 'Z' || p.ch === 'M') face = 's';   // (H71: a lobby's stairs climb away to the back wall; the mailboxes on it)
      else if (p.ch === 'C' || p.ch === 'O') face = p.h > p.w ? (wall(p.tx - 1, p.ty) ? 'e' : 'w') : wall(p.tx, p.ty + p.th) ? 'n' : 's';
      else if (p.ch === 'V') { const c = L.pieces.find((q) => q.ch === 'C'); face = c && c.y + c.h <= p.y && Math.abs(c.x + c.w / 2 - p.x - p.w / 2) < c.y - p.y ? 'n' : 's'; }   // (seen from the side a set is a sliver: it faces the camera unless the couch is north of it)
      else if (p.ch !== 'T' && p.ch !== 'P' && p.ch !== 'B') face = wall(p.tx, p.ty - 1) ? 's' : wall(p.tx, p.ty + p.th) ? 'n' : wall(p.tx - 1, p.ty) ? 'e' : wall(p.tx + p.tw, p.ty) ? 'w' : 's';
      const side = face === 'e' || face === 'w', mw = side ? p.h : p.w, md = side ? p.w : p.h;
      const head = { s: 0, n: Math.PI, e: -Math.PI / 2, w: Math.PI / 2 }[face];
      const seed = p.ch === 'a' ? p.tx * 3 + p.ty + p.dec : 0, mk = `${p.ch}|${mw}|${md}|${this.tier}|${seed}|${face}`;
      let G = this.models.get(mk);   // (H71: a model made once - a change of decor makes only the new pieces)
      if (!G) { G = make(mw, md, this.tier, seed).render(head, { px: ap, dither: 0.35 }); this.models.set(mk, G); }
      const cx = p.x + p.w / 2, cy = p.y + p.h / 2;
      const it = { G, x: cx - G.ax * ap, y: cy - G.ay * ap, base: p.y + p.h, piece: p };
      if ('VAblv'.includes(p.ch)) it.remake = (on) => make(mw, md, this.tier, on).render(head, { px: ap, dither: 0.35 });
      if (p.wall) { it.base = p.face === 's' ? p.y + 2 : p.y + p.h; }   // (H67: hung on the wall: sorted with the wall behind it)
      if (p.ch === 'l') this.lamps.push({ x: cx, y: cy, z: 54, kind: 'lamp' });
      if (p.ch === 'b') this.lamps.push({ x: cx - 4, y: cy - 1, z: 34, kind: 'lamp' });
      if (p.ch === 'v') this.lamps.push({ x: cx, y: cy, z: 30, kind: 'tv' });
      this.items.push(it);
      if (p.ch === 'A') this.lamps.push({ x: p.x + 9, y: p.y + 18, z: 44, kind: 'lamp' });
      if (p.ch === 'V') this.lamps.push({ x: cx, y: cy, z: 24, kind: 'tv' });
      yield;
    }
  }

  // ---- the light --------------------------------------------------------------------------------------------------
  // d: daylight 0 night .. 1 day. The day comes in through the windows; at night each room's light and the lamps are on.
  env(d) {
    const L = this.L, night = 1 - d, dusk = Math.max(0, 1 - Math.abs(d - 0.5) * 3);
    const amb = [0.2 + 0.58 * d + 0.08 * dusk, 0.21 + 0.53 * d, 0.3 + 0.42 * d - 0.06 * dusk];
    const lights = [];
    for (let tx = 0; tx < L.cols; tx++) if (L.cell(tx, 0) === '=' && !L4ch(L, tx - 1, 0)) {
      let n = 1; while (L.cell(tx + n, 0) === '=') n++;
      if (d > 0.05) lights.push({ x: (tx + n / 2) * T, y: T + 6, z: 30, r: 150 + n * 20, c: dusk > 0.3 ? [1.1, 0.7, 0.4] : [0.95, 0.92, 0.82], k: 0.75 * d });
      else lights.push({ x: (tx + n / 2) * T, y: T + 6, z: 30, r: 90, c: [0.35, 0.45, 0.8], k: 0.25 });   // (the moon and the city's glow)
    }
    if (night > 0.25) {
      for (const r of this.R.list) {
        const w = (r.x1 - r.x0 + 1) * T, h = (r.y1 - r.y0 + 1) * T;
        lights.push({ x: (r.x0 + r.x1 + 1) / 2 * T, y: (r.y0 + r.y1 + 1) / 2 * T, z: 70, r: Math.max(w, h) * 0.8 + 70, c: r.kind === 'garage' || r.kind === 'bath' ? [0.95, 0.97, 1.0] : [1.2, 0.86, 0.54], k: 1.0 * night });
      }
      for (const l of this.lamps) if (l.kind !== 'tv') lights.push({ x: l.x, y: l.y, z: l.z, r: l.kind === 'lamp' ? 110 : 80, c: [1.25, 0.85, 0.5], k: 0.9 * night });
    }
    for (const l of this.lamps) if (l.kind === 'tv' && night > 0.25) lights.push({ x: l.x, y: l.y + 10, z: l.z, r: 90, c: [0.45, 0.6, 1.1], k: 0.45 * night });
    if (/^lobby/.test(L.key) && night > 0.25) for (let tx = 2; tx < L.cols - 1; tx += 4) lights.push({ x: (tx + 0.5) * T, y: 2.5 * T, z: 64, r: 150, c: [1.2, 0.88, 0.58], k: 0.75 * night });   // (H71: a lobby's ceiling lights along the hall and the landing)
    for (const l of lights) l.r2 = l.r * l.r;
    const sky = d > 0.6 ? [150 + 60 * d, 196 + 30 * d, 238] : d > 0.05 ? [236, 150 + 40 * d, 90 + 60 * d] : [26, 36, 70];
    return { d, amb, lights, sky, emiK: 0.35 + 0.9 * night, on: night > 0.25 ? 1 : 0 };
  }
  // light a buffer whose top-left is at world (ox, oy) into a canvas
  shade(G, ox, oy, ap, E, cv, sky = false) {
    const w = G.w, h = G.h;
    if (!cv) cv = document.createElement('canvas');
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    const g = cv.getContext('2d'), id = g.createImageData(w, h), o = id.data, col = G.col, nrm = G.nrm, emi = G.emi, zz = G.z, fl = G.flag, Ls = E.lights;
    for (let i = 0, n = w * h; i < n; i++) {
      const j = i * 4;
      if (!col[j + 3]) continue;
      const px = i % w, py = (i / w) | 0;
      let nx = 0, ny = 0, nz = 1;
      if (nrm[j + 3]) { nx = nrm[j] / 127.5 - 1; ny = nrm[j + 1] / 127.5 - 1; nz = nrm[j + 2] / 127.5 - 1; }
      const Z = zz[i], X = ox + (px + 0.5) * ap, Y = oy + (py + 0.5) * ap + Z;
      const a = 0.66 + 0.34 * (nz * 0.5 + 0.5) + ny * 0.06;
      let r = E.amb[0] * a, gg = E.amb[1] * a, b = E.amb[2] * a;
      for (let k = 0; k < Ls.length; k++) {
        const Lk = Ls[k], dx = Lk.x - X, dy = Lk.y - Y, dz = Lk.z - Z, d2 = dx * dx + dy * dy + dz * dz;
        if (d2 >= Lk.r2) continue;
        const dd = Math.sqrt(d2) || 1, f = 1 - dd / Lk.r, ndl = (nx * dx + ny * dy + nz * dz) / dd;
        const q = f * f * (0.3 + 0.7 * Math.max(0, ndl)) * Lk.k;
        r += Lk.c[0] * q; gg += Lk.c[1] * q; b += Lk.c[2] * q;
      }
      // light in a few bands, dithered: the hand-shaded look of the street
      const lum = (r + gg + b) / 3, band = Math.max(0.12, Math.round(lum * 6 + bayer(px, py) * 0.7) / 6), s = band / Math.max(0.05, lum);
      r *= s; gg *= s; b *= s;
      let cr = col[j] * r, cg = col[j + 1] * gg, cb = col[j + 2] * b;
      if (sky && (fl[i] & F_GLASS)) { const k2 = 0.75; cr = cr * (1 - k2) + E.sky[0] * k2; cg = cg * (1 - k2) + E.sky[1] * k2; cb = cb * (1 - k2) + E.sky[2] * k2; if (E.d < 0.05 && hash(px, py, 3) > 0.93) { cr = 250; cg = 210; cb = 120; } }
      if (emi[j + 3]) { const e = (emi[j + 3] / 255) * E.emiK; cr += emi[j] * e; cg += emi[j + 1] * e; cb += emi[j + 2] * e; }
      o[j] = cr; o[j + 1] = cg; o[j + 2] = cb; o[j + 3] = 255;
    }
    g.putImageData(id, 0, 0);
    return cv;
  }
  // light everything again for a new light (the time of day in eight steps)
  relight(d) {
    if (this.job) return;   // (still building)
    const q = Math.round(d * 8) / 8, key = String(q);
    if (key === this.envKey) return;
    this.envKey = key; this.E = this.env(q);
    this.people.clear(); this.cars.clear();
    this.lightJob = this.lightAll(this.E);
  }
  *lightAll(E) {   // (piece by piece: until it's done the rest keep the light they had)
    const ap = this.ap;
    const cv = this.shade(this.floor.G, 0, 0, ap, E, this.floor.cv2);
    this.floor.cv2 = this.floor.cv; this.floor.cv = cv;   // (two canvases: the one on screen is never half lit)
    yield;
    const yv = this.shade(this.yard.G, this.yard.x, this.yard.y, ap, { ...E, lights: [] }, this.yard.cv2);   // (outdoors: the sky's light only)
    this.yard.cv2 = this.yard.cv; this.yard.cv = yv;
    yield;
    for (const it of this.items) {
      if (it.remake && it.on !== E.on) { it.on = E.on; it.G = it.remake(E.on); }
      const c = this.shade(it.G, it.x, it.y, ap, E, it.cv2, !!it.wall);
      it.cv2 = it.cv; it.cv = c;
      if (it.piece && it.piece.use && !it.ol) it.ol = outline(it.G, null);
      else if (it.remake && it.piece && it.piece.use) it.ol = outline(it.G, it.ol);
      yield;
    }
  }

  // ---- what moves: you and your friends, the cars in the garage ---------------------------------------------------
  // a person's lit sprite: the street's own figure (art v2's people), shaded where they stand
  person(app, pose, dir8, frame, x, y) {
    const key = `${JSON.stringify(app)}|${pose}|${dir8}|${frame}`, pk = `${key}|${Math.round(x / 16)}|${Math.round(y / 16)}`;
    let c = this.people.get(pk);
    if (!c) {
      if (this.people.size > 160) this.people.clear();
      let G = this.figs.get(key);   // (the figure made once - a few ms - and shaded again only where it stands)
      if (!G) { if (this.figs.size > 120) this.figs.clear(); G = pedSprite(app, pose, dir8, frame, 0, { ar: 'player' }); this.figs.set(key, G); }
      c = { cv: this.shade(G, x - G.ax, y - G.ay, 1, this.E), ax: G.ax, ay: G.ay };
      this.people.set(pk, c);
    }
    return c;
  }
  car(c, i) {
    const k = `${c.m}|${c.p}|${c.v}|${i}`;
    let s = this.cars.get(k);
    if (!s) {
      const def = VEHICLES[c.m], b = this.L.bays[i];
      if (!def || !b) return null;
      const G = vehicleSprite({ m: def.i, p: c.p, vr: c.v }, {}, 24, 32), sap = G.ap || 1;
      s = { cv: this.shade(G, b.x - G.ax * sap, b.y - G.ay * sap, sap, this.E), x: b.x - G.ax * sap, y: b.y - G.ay * sap, w: G.w * sap, h: G.h * sap, base: b.y + CAR_IN.l / 2 };
      this.cars.set(k, s);
    }
    return s;
  }
}
// (H71) a copy of a buffer (the bare floor, kept to lay the next decor's shadows and rugs on)
function cloneG(G) {
  const C = new GBuf(G.w, G.h);
  C.col.set(G.col); C.nrm.set(G.nrm); C.z.set(G.z); C.emi.set(G.emi); C.flag.set(G.flag);
  return C;
}
const L4ch = (L, tx, ty) => L.cell(tx, ty) === '=';
const L4K = (L, tx, ty) => L.cell(tx, ty) === 'K' || L.cell(tx, ty) === 'T';
// a 1 px ring round a sprite's shape, for the thing in reach (drawn pulsing over it)
function outline(G, cv) {
  const w = G.w + 2, h = G.h + 2;
  if (!cv) cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const g = cv.getContext('2d'), id = g.createImageData(w, h), o = id.data;
  const on = (x, y) => x >= 0 && y >= 0 && x < G.w && y < G.h && G.col[(y * G.w + x) * 4 + 3] > 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (on(x - 1, y - 1)) continue;
    if (on(x - 2, y - 1) || on(x, y - 1) || on(x - 1, y - 2) || on(x - 1, y)) { const j = (y * w + x) * 4; o[j] = 255; o[j + 1] = 214; o[j + 2] = 90; o[j + 3] = 255; }
  }
  g.putImageData(id, 0, 0);
  return cv;
}
