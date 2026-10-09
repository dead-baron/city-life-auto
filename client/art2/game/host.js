// Art v2 live renderer: the host (docs/art-v2/GAME-RENDERER.md) - the bridge between client/main.js and
// the WebGL2 engine (engine.js). World2 owns the engine and the bake worker pool and turns main.js's
// frame packet F (camera, sky, who is on screen, the fx pools; see main.js prepFrame) into engine calls:
//   chunks   the static world baked per 768 px chunk in the workers (chunkbake.js): what is in view
//            first, then a wide ring round it and the road ahead; a budget of uploads a frame; a quick
//            placeholder (the ground's colours by tile) until a bake lands; the cache kept to the quality
//            tier; the chunks of a walk-in shop you stand in rebaked in cutaway (opt.cutaway = building)
//   sprites  moving things get their sprite keys from the providers (actors.js, peds.js) and the
//            sprites from the workers, asked for as soon as a thing is near (before it is on screen);
//            people and small things are made on this thread at once within a small budget a frame (your
//            own figure always). Only the new art is drawn: while a new frame or heading is being made a
//            thing keeps showing the last sprite it had
//   fades    whole buildings round the player ease to transparent (the engine shows the street under
//            them), so nothing standing in front of you hides you or what is near you
//   live     what moves on the static world: the lit lens of every signal head (the chunk bakes bring the
//            heads, chunkbake.signalLenses), level crossing barrier arms and flashers, sliding gates,
//            spike strips (as decals)
//   lights   the chunks' static lights (lamps keep v1's warm-up and flicker, windows and neon follow
//            the dark) and the moving ones (headlight and flashlight cones, tail and brake lights,
//            sirens, lit trains, muzzle flashes, explosions, fire, camp fires, signal heads, a light to
//            see yourself by), ranked by strength and distance, capped per tier
//   sky      skyAt() -> PRESETS_GAME blended by the time of day, toward rain / storm / fog by the
//            weather, the sun direction from the same sky that drives v1, lightning
// Height: a moving thing stands on the ground under it - kerbs and bridge decks come from the chunks'
// ground heights (chunkbake.groundZ) - or DECK_Z * lz up on the elevated highway (DECK_Z is shared with
// the statics so decks and the traffic on them agree). Boats and swimmers sit on the water (0).
//
//   const w = await World2.create({ S, map, canvas, gfx, lowMem, api, onFail })   null: no WebGL2
//   w.ready, w.resize(W, H, dpr), w.frame(F), w.propChanged(i), w.resync(), w.diag(), w.stats(), w.dispose()
// api: helpers lent by main.js (pedLook, vehLift, birds, umbrella colours, seats, scales).
import { CHUNK, DECK_Z, groundZ } from './chunkbake.js';
import { WorkerPool, takeWarmPool, isPhone } from './pool.js';
import { canopyGrid } from './canopy.js';
import { FORAGE_KINDS } from '../../../shared/foraging.js';
import { drawStandIn, STANDIN_PX } from './standin.js';
import { MAP_W, MAP_H, TILE, K, PF, VF } from '../../../shared/constants.js';
import { WATER_T, TRAIN_CARS, CROSSING_ARM, DISTRICTS } from '../../../shared/map.js';
import { T as TT } from '../../../shared/constants.js';
import { signalFor } from '../../../shared/signals.js';   // (the signals' timing: green, yellow, red)
import { BARRIER_PIECE } from '../../../shared/levels.js';
import { pointAt } from '../../../shared/geom.js';
import { VEHICLE_BY_INDEX } from '../../../shared/vehicles.js';
import { dir8 } from '../../render/chars.js';
import { lampHead } from '../../render/tiles.js';
import { countryLightY } from '../../render/country.js';
import { wind } from '../../render/flora/wind.js';
import { F_GROUND, F_NOCAST, F_WATER } from '../gbuf.js';
import { FERRIS, ferrisSite, ferrisCab, balloonRoutes, balloonAt, slideSite, slideRider } from '../../../shared/rides.js';
import { SPECIES, APOSE } from '../../../shared/fauna.js';
import { WEAPONS } from '../../../shared/items.js';
const PLASMA_I = WEAPONS.plasma.i;   // (the plasma blade: its light in the hand, _lights)

export { DECK_Z };
const TAU = Math.PI * 2;
const CX = Math.ceil(MAP_W * TILE / CHUNK), CY = Math.ceil(MAP_H * TILE / CHUNK);
// per quality tier (Low/Xbox, Medium, High, Ultra): chunk cache, lights, vehicle headings, uploads a frame
// syncMs: how long a frame may spend making sprites on this thread (people and small things)
// results: bakes back from the workers that may wait for an upload (2.3 MB each), so the road ahead keeps baking while
// the slots fill
const TIERS = [
  { chunks: 16, lights: 16, N: 16, chunkUp: 1, sprUp: 8, convert: 3, sprJobs: 12, syncMs: 2.5, results: 6 },
  { chunks: 20, lights: 32, N: 32, chunkUp: 1, sprUp: 10, convert: 4, sprJobs: 16, syncMs: 3.5, results: 8 },
  { chunks: 24, lights: 64, N: 32, chunkUp: 2, sprUp: 12, convert: 5, sprJobs: 24, syncMs: 4.5, results: 10 },
  { chunks: 32, lights: 96, N: 64, chunkUp: 2, sprUp: 14, convert: 6, sprJobs: 32, syncMs: 6, results: 12 },
];
const LOWMEM_CHUNKS = 10;
const MARGIN = 420;        // world px baked round the view (shadows fall in from beyond its edge)
const TOWN = new Set(['towers', 'commercial', 'civic', 'nightlife', 'redlight', 'industrial', 'factory', 'harbor', 'apartments', 'southside', 'oldtown', 'arts']);
const BAG_TINT = [0.86, 0.92, 1.0];  // a plastic bag: a paper sheet tinted cool
const GRAZERS = new Set(['deer', 'rabbit', 'cow', 'sheep', 'horse', 'goat']); // animals.js kinds that graze when still
const LYING = new Set(['down', 'dead', 'deadF', 'deadS', 'downF', 'downB', 'crawl']); // people flat on the ground (main.js pedLook)
const WILD_IDLE = new Set(['coyote', 'raccoon', 'pig']);                     // ...and wild ones that just stand (a pet sits)
// A wild animal's pose (actors.js ANIMAL_FRAMES) from what the server says it's doing (shared/fauna.js APOSE, the
// snapshot's extra byte) and how fast it's going: flying, swimming (a sea otter floats on its back), up a trunk,
// reared, charging, stalking low, bedded down, head down feeding, head up and alert; else by its speed. Dead: on its
// side (a bird with a wing out).
const BEARS = new Set(['blackbear', 'grizzly']);
function wildPose(p, S2, base, sp) {
  if (p.flags & PF.DEAD) return 'dead';
  if (p.flags & PF.DOWN) return 'lie';
  const ap = (p.extra || 0) & 31;
  if (ap === APOSE.fly) return 'fly';
  if (p.swim) return base === 'seaotter' && (ap === APOSE.float || sp < 25) ? 'float' : 'swim';
  switch (ap) {
    case APOSE.climb: return 'climb';
    case APOSE.rear: case APOSE.attack: return BEARS.has(base) ? 'rear' : sp > 30 ? 'run' : 'alert';
    case APOSE.charge: return 'run';
    case APOSE.stalk: return sp > 6 ? 'stalk' : 'stalk';
    case APOSE.rest: return S2.bird ? 'idle' : 'lie';
    case APOSE.sit: return S2.bird ? 'idle' : 'sit';
    case APOSE.graze: case APOSE.gnaw: case APOSE.drink: case APOSE.eat: case APOSE.peck: return sp > 12 ? 'walk' : S2.bird ? 'peck' : 'graze';
    case APOSE.alert: case APOSE.warn: case APOSE.call: case APOSE.flinch: return sp > 12 ? 'walk' : 'alert';
    default: return sp > 70 ? 'run' : sp > 12 ? 'walk' : 'idle';
  }
}
const UP_N = [128, 128, 255, 255], FACE_N = [128, 196, 230, 255]; // flat ground; an upright figure facing the camera
const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

// Which chunks to bake, and in what order (lower runs sooner).
//   need  the view (x0..y1, world px) plus the scene's margins (the shadow reach on the sun's side, room for
//         reflections on top): drawn this frame; priority = distance from the camera (0..~2000). On the move the
//         chunks only in the margins (they lend shadows at the edge; a stand-in does that well enough for a
//         moment) wait until the next MARGIN_S s of the road ahead is under way: 2000 + MARGIN_S * 1000 + distance
//   bake  need; then the sweep ahead when moving at (vx, vy) px/s: every chunk the view (grown by gx, gy: the
//         zoom-out to come) passes over in the next T s (1.5 s plus 1 s per 250 px/s, at most 6 s: a phone's
//         bakes take a second or more each, so the road ahead has to be started well before it shows), priority
//         2000 + the ms until it comes into view; then a ring of MARGIN round the view (6000 + distance) - not
//         behind you when moving, not at all at speed (the view itself is wider then)
// Returns the chunks coming into view within 1.5 s that aren't on screen yet, soonest first (their placeholders
// are drawn ahead).
const SWEEP_MAX = 6, SOON_S = 1.5, MARGIN_S = 1.2;
export function planBake(need, bake, view, vx, vy, reach, out = []) {
  out.length = 0;
  const camX = view.cx, camY = view.cy, gx = view.gx || 0, gy = view.gy || 0;
  const span = (a0, a1, b0, b1, v) => (v > 1e-3 ? [(a0 - b1) / v, (a1 - b0) / v] : v < -1e-3 ? [(a1 - b0) / v, (a0 - b1) / v] : a1 > b0 && a0 < b1 ? [-Infinity, Infinity] : null);
  // reach: the scene's margins round the view [left, top, right, bottom] (the shadow reach is on the sun's side
  // only), or one number for all sides (+64 on top)
  const m = Array.isArray(reach) ? reach : [reach, reach + 64, reach, reach];
  const R0 = view.x0 - m[0], R1 = view.y0 - m[1], R2 = view.x1 + m[2], R3 = view.y1 + m[3];
  const range = (a, b, n) => [Math.max(0, Math.floor(a / CHUNK)), Math.min(n - 1, Math.floor(b / CHUNK))];
  let [cx0, cx1] = range(R0, R2, CX), [cy0, cy1] = range(R1, R3, CY);
  const speed = Math.hypot(vx, vy), moving = speed > 300;
  for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
    const k = cy * 1000 + cx, d = Math.hypot((cx + 0.5) * CHUNK - camX, (cy + 0.5) * CHUNK - camY);
    const seen = (cx + 1) * CHUNK > view.x0 && cx * CHUNK < view.x1 && (cy + 1) * CHUNK > view.y0 && cy * CHUNK < view.y1;
    need.set(k, d); bake.set(k, moving && !seen ? 2000 + MARGIN_S * 1000 + d : d);
  }
  if (speed > 60) {
    const T = Math.min(SWEEP_MAX, 1.5 + speed / 250), S0 = R0 - gx, S1 = R1 - gy, S2 = R2 + gx, S3 = R3 + gy;
    [cx0, cx1] = range(Math.min(S0, S0 + vx * T), Math.max(S2, S2 + vx * T), CX);
    [cy0, cy1] = range(Math.min(S1, S1 + vy * T), Math.max(S3, S3 + vy * T), CY);
    const soon = [];
    for (let cy = cy0; cy <= cy1; cy++) {
      const sy = span(cy * CHUNK, (cy + 1) * CHUNK, S1, S3, vy);
      if (!sy) continue;
      for (let cx = cx0; cx <= cx1; cx++) {
        const sx = span(cx * CHUNK, (cx + 1) * CHUNK, S0, S2, vx);
        if (!sx) continue;
        const lo = Math.max(0, sx[0], sy[0]), hi = Math.min(T, sx[1], sy[1]);
        if (lo > hi) continue;
        // (within a row coming into view at once, the middle first: the edges of the screen matter least)
        const lat = Math.abs(((cx + 0.5) * CHUNK - camX) * vy - ((cy + 0.5) * CHUNK - camY) * vx) / speed;
        const k = cy * 1000 + cx, p = 2000 + lo * 1000 + lat * 0.12, cur = bake.get(k);
        if (cur === undefined || p < cur) bake.set(k, p);
        if (!need.has(k) && lo < SOON_S) soon.push([lo, k]);
      }
    }
    soon.sort((a, b) => a[0] - b[0]);
    for (const s of soon) out.push(s[1]);
  }
  if (speed < 450) {
    const ux = speed > 1 ? vx / speed : 0, uy = speed > 1 ? vy / speed : 0;
    [cx0, cx1] = range(view.x0 - MARGIN, view.x1 + MARGIN, CX);
    [cy0, cy1] = range(view.y0 - MARGIN, view.y1 + MARGIN, CY);
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
      const k = cy * 1000 + cx;
      if (bake.has(k)) continue;
      const dx = (cx + 0.5) * CHUNK - camX, dy = (cy + 0.5) * CHUNK - camY;
      if (speed > 150 && dx * ux + dy * uy < -CHUNK * 0.5) continue; // behind you
      bake.set(k, 6000 + Math.hypot(dx, dy));
    }
  }
  return out;
}

export function qualityOf(gfx, lowMem) {
  if (lowMem) return 0;
  const named = { low: 0, medium: 1, high: 2, ultra: 3 }[gfx.preset];
  if (named !== undefined) return named;
  return gfx.lighting >= 2 ? (gfx.resolution >= 2 ? 3 : 2) : gfx.lighting;
}

// WorldData: the client's CityMap as plain data for the workers (functions can't be cloned)
export function worldData(map) {
  const o = {};
  for (const k of Object.keys(map)) if (typeof map[k] !== 'function') o[k] = map[k];
  return o;
}

// ---- small raster helpers (the generated sprites: signal lenses, barrier arms, gates, umbrellas...) ----------
function gbuf(w, h, ax, ay) {
  const n = w * h;
  return { w, h, ax, ay, col: new Uint8ClampedArray(n * 4), nrm: new Uint8ClampedArray(n * 4), z: new Uint16Array(n), emi: new Uint8ClampedArray(n * 4), flag: new Uint8Array(n) };
}
function put(G, x, y, rgb, z, n = UP_N, flag = 0, e = 0) {
  if (x < 0 || y < 0 || x >= G.w || y >= G.h) return;
  const i = y * G.w + x, j = i * 4;
  G.col[j] = rgb[0]; G.col[j + 1] = rgb[1]; G.col[j + 2] = rgb[2]; G.col[j + 3] = 255;
  G.nrm[j] = n[0]; G.nrm[j + 1] = n[1]; G.nrm[j + 2] = n[2]; G.nrm[j + 3] = 255;
  G.z[i] = z; G.flag[i] = flag;
  if (e) { G.emi[j] = rgb[0]; G.emi[j + 1] = rgb[1]; G.emi[j + 2] = rgb[2]; G.emi[j + 3] = e; }
}
// a canvas's pixels as a sprite: alpha cut at half, a height per pixel from zf(x, y)
function fromCanvas(cv, ax, ay, zf, n = UP_N, flag = 0, out = null, oy = 0) {
  const w = cv.width, h = cv.height;
  const d = cv.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data;
  const G = out || gbuf(w, h, ax, ay);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const s = (y * w + x) * 4;
    if (d[s + 3] < 128) continue;
    const yy = y + oy;
    if (yy < 0 || yy >= G.h) continue;
    const i = yy * G.w + x, j = i * 4;
    G.col[j] = d[s]; G.col[j + 1] = d[s + 1]; G.col[j + 2] = d[s + 2]; G.col[j + 3] = 255;
    G.nrm[j] = n[0]; G.nrm[j + 1] = n[1]; G.nrm[j + 2] = n[2]; G.nrm[j + 3] = 255;
    G.z[i] = zf(x, yy); G.flag[i] = flag;
  }
  return G;
}
const rgbCache = new Map();
function rgbOf(c) {
  let v = rgbCache.get(c);
  if (v) return v;
  if (c[0] === '#') { const n = parseInt(c.slice(1, 7), 16); v = [n >> 16, (n >> 8) & 255, n & 255]; }
  else { const m = c.match(/(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/); v = m ? [+m[1], +m[2], +m[3]] : [200, 200, 200]; }
  rgbCache.set(c, v);
  return v;
}
const quant = (a, N) => ((Math.round(a / TAU * N) % N) + N) % N;

// The giant redwoods' fade ids (statics.js TREE_FADE + the prop's index) and their outlines: the half width (px) a
// tree covers in each 40 px of its height, from its foot up - the flared foot, the trunk, then the crown from about
// half way up - measured from the art (redwoods.js giantRedwood: where a third or more of nine trees is covered).
// The host fades one only when it's in front of you (_treeCovers).
const TREE_FADE = 1e6;
const RW_OUTLINE = {
  giantL: [112, 80, 72, 64, 64, 64, 64, 64, 64, 104, 136, 144, 144, 136, 104, 88, 88, 80],
  giant: [80, 56, 56, 56, 48, 48, 48, 48, 104, 128, 128, 112, 88, 80, 72, 16],
  giantS: [64, 40, 40, 40, 40, 40, 40, 88, 104, 96, 80, 72, 56],
  redwood2: [24, 16, 80, 80, 72, 64, 56, 48, 16],
};
// the time-of-day keys of the presets (minutes after midnight), blended in between: a long dark night (20:26-05:05,
// lit by the lamps, windows and headlights), first light, sunrise, the day, golden hour, sunset and blue hour
// (v1's sky, render/atmos.js KEYS, keeps to the same times; the night part of the loop runs at 0.6 s a minute)
const SKY_KEYS = [[0, 'night'], [305, 'night'], [338, 'predawn'], [372, 'dawn'], [400, 'dawn'], [470, 'morning'], [600, 'noon'], [900, 'noon'], [1000, 'afternoon'],
  [1085, 'golden'], [1140, 'golden'], [1172, 'sunset'], [1198, 'dusk'], [1226, 'night'], [1440, 'night']];
// how far the light comes from the sun's own place (v1's sky) rather than the night preset's moon: eased over in
// the faint light before sunrise (05:15-05:47) and after blue hour (20:00-20:32)
const sunUp = (m) => smooth((m - 315) / 32) * (1 - smooth((m - 1200) / 32));
// how dark the hour is (0 day .. 1 night, without the weather): rain turns to a storm and fog to a night mist by it
const darkAt = (m) => (m < 720 ? 1 - smooth((m - 330) / 70) : smooth((m - 1180) / 45));
// v1 light colours (0-255) in the Lighter's 0..1
const C = {
  head: [1, 0.93, 0.76], tail: [1, 0.16, 0.12], red: [1, 0.18, 0.14], blue: [0.3, 0.5, 1], fire: [1, 0.55, 0.2], flash: [1, 0.9, 0.67],
  sodium: [1, 0.73, 0.43], window: [1, 0.77, 0.47], warm: [1, 0.8, 0.55], white: [0.92, 0.94, 1], moon: [0.6, 0.67, 1], cyan: [0.47, 0.9, 1],
  legend: [0.82, 0.9, 1], plasma: [0.42, 0.66, 1],
  rare: [0.35, 0.65, 1], epic: [0.78, 0.47, 1], gold: [1, 0.8, 0.38],   // the dropped backpacks' glows
};
const CUT_A = { cut: 'a' }, CUT_B = { cut: 'b' };   // (the plasma blade's two halves: peds.js pedSprite opt)
// the depth a boat under a bridge is held to: over the water (ground, tested 4 px down) and a pier (4), under a deck (6)
const UNDER_Z = 1.5;
// signal lenses red, amber, green (v1's SIG_COL), and as light colours
const SIG_RGB = [[255, 59, 59], [255, 194, 61], [61, 220, 132]], SIG_RGB01 = SIG_RGB.map((c) => c.map((v) => v / 255));
const XARM_Z = 20, XPOST_H = 24;           // level crossing barrier: pivot height, post height
const XING0 = { d: 0, b: [0, 0] };

// ---- a 2D stand-in for the engine (?art2stub): the same API, painter's order, no lighting ---------------
class StubEngine {
  constructor(canvas) { this.cv = canvas; this.g = canvas.getContext('2d'); this.chunks = new Map(); this.fb = new Map(); this.spr = new Map(); this.list = []; this.n = 0; }
  // (a G-buffer, or the packed planes the workers send - p0 is the albedo - at G.ap world px per texel)
  static toCanvas(G) { const c = document.createElement('canvas'); c.width = G.w; c.height = G.h; const src = G.col || G.p0, id = new ImageData(new Uint8ClampedArray(src.buffer, src.byteOffset, G.w * G.h * 4).slice(), G.w, G.h); c.getContext('2d').putImageData(id, 0, 0); c.ap = G.ap || 1; return c; }
  setQuality() {} onContextLost() {} dispose() { this.chunks.clear(); this.spr.clear(); }
  resize(w, h, dpr) { this.W = w; this.H = h; this.dpr = dpr; this.cv.width = Math.round(w * dpr); this.cv.height = Math.round(h * dpr); }
  hasChunk(cx, cy) { return this.chunks.has(cy * 1000 + cx); }
  uploadChunk(cx, cy, G) { this.chunks.set(cy * 1000 + cx, StubEngine.toCanvas(G)); }
  setChunkFallback(cx, cy, cv) { this.fb.set(cy * 1000 + cx, cv); }
  dropChunk(cx, cy) { this.chunks.delete(cy * 1000 + cx); this.fb.delete(cy * 1000 + cx); }
  chunkKeys() { return [...new Set([...this.chunks.keys(), ...this.fb.keys()])].map((k) => [k % 1000, Math.floor(k / 1000)]); }
  hasSprite(k) { return this.spr.has(k); }
  uploadSprite(k, G) { const c = StubEngine.toCanvas(G); c.ax = G.ax; c.ay = G.ay; this.spr.set(k, c); }
  uploadSpriteFromCanvas(k, cv, ax, ay) { cv.ax = ax; cv.ay = ay; this.spr.set(k, cv); }
  beginFrame(o) { this.f = o; this.list.length = 0; this.n = 0; }
  drawSprite(key, x, y, z0 = 0, o = {}) { this.list.push({ key, x, y, z0, a: o.alpha ?? 1 }); }
  drawDecal(key, x, y, ang, alpha) { this.list.push({ key, x, y, z0: -1, a: alpha, ang }); }
  addLight() { this.n++; }
  endFrame() {
    const { g, f } = this, z = f.zoom * this.dpr;
    g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = '#10141c'; g.fillRect(0, 0, this.cv.width, this.cv.height);
    g.setTransform(z, 0, 0, z, Math.round(this.cv.width / 2 - f.camX * z), Math.round(this.cv.height / 2 - f.camY * z));
    g.imageSmoothingEnabled = false;
    for (const [k, c] of this.fb) if (!this.chunks.has(k)) g.drawImage(c, (k % 1000) * CHUNK, Math.floor(k / 1000) * CHUNK, CHUNK, CHUNK);
    for (const [k, c] of this.chunks) g.drawImage(c, (k % 1000) * CHUNK, Math.floor(k / 1000) * CHUNK, c.width * c.ap, c.height * c.ap);
    this.list.sort((a, b) => a.y - b.y);
    for (const it of this.list) {
      const s = this.spr.get(it.key); if (!s) continue;
      g.globalAlpha = it.a;
      if (it.z0 < 0) { g.save(); g.translate(it.x, it.y); g.rotate(it.ang || 0); g.drawImage(s, -s.width / 2, -s.height / 2); g.restore(); }
      else { const ap = s.ap || 1; g.drawImage(s, Math.round(it.x - s.ax * ap), Math.round(it.y - it.z0 - s.ay * ap), s.width * ap, s.height * ap); }
      g.globalAlpha = 1;
    }
  }
  stats() { return { chunks: this.chunks.size, sprites: this.spr.size, lights: this.n, stub: true }; }
}

// ---- the host -----------------------------------------------------------------------------------------------
export class World2 {
  // null when it can't run here; World2.lastWhy then says why
  static async create(o) {
    let E = null, L = null, why = '';
    World2.lastWhy = '';
    try { E = await import('./engine.js'); } catch (e) { why = 'the renderer could not load: ' + String((e && e.message) || e); }
    try { L = await import('./lightgame.js'); } catch { L = null; }
    const q = qualityOf(o.gfx, o.lowMem);
    let engine = null;
    if (/[?&]art2nogl\b/.test(location.search)) { World2.lastWhy = 'no WebGL2 (?art2nogl)'; return null; } // (testing: as if there were no WebGL2)
    // the art pixel: 2 world px (the 16-bit look); ?artpx=1 draws the art at full resolution (comparisons)
    const artPx = /[?&]artpx=1\b/.test(location.search) ? 1 : 2;
    if (E && E.Art2Engine) { try { engine = E.Art2Engine.create(o.canvas, { quality: q, lowMem: !!o.lowMem, artPx }); } catch (e) { console.error('[art2] engine', e); engine = null; why = String((e && e.message) || e); } if (!engine) why = why || E.Art2Engine.lastWhy || ''; }
    if (!engine && /[?&]art2stub\b/.test(location.search)) engine = new StubEngine(o.canvas);
    if (!engine) { World2.lastWhy = why || 'WebGL2 is not available'; console.warn('[art2] no engine:', World2.lastWhy); return null; }
    const w = new World2(o, engine, L, q);
    w.init();
    return w;
  }

  constructor(o, engine, L, q) {
    this.S = o.S; this.map = o.map; this.gfx = o.gfx; this.lowMem = !!o.lowMem; this.api = o.api; this.onFail = o.onFail || (() => {});
    this.worldKey = o.worldKey || null;            // the city is in this browser's copy under this key: the workers read it
    this.artKey = o.artKey || null;                // baked chunks are kept in the browser under this build of the art (chunkstore.js)
    this.cdn = o.artCdn || null;                   // the art from the server: where its baked chunks are (server/artcdn.js; worker.js)
    this.E = engine; this.L = L; this.q = q; this.tier = TIERS[q];
    this.W = 0; this.H = 0; this.dpr = 1;
    this.prov = { ground: false, statics: false, actors: false, peds: false };
    this.A = null; this.Pd = null;                 // provider modules on this thread (sprite keys)
    this.pool = null; this.failed = false; this.lost = 0;
    this.chunkState = new Map();                   // cy*1000+cx -> { mode, gh, lights, live, blds } of an uploaded bake
    this.fallbacks = new Set();                    // chunks showing a placeholder (the tiles' colours)
    this.results = new Map();                      // job key -> { key, cx, cy, mode, r, prio } waiting for upload
    this.wantJobs = new Set(); this.wantChunks = new Map();
    this.chunkFails = new Map();                   // chunk -> { n, t }: bakes that failed, tried again from t (backing off)
    this.upQ = new Map();                          // sprites back from the workers, waiting for upload (key -> planes)
    this.badKeys = new Set(); this.badAt = 0;      // sprite keys a provider failed on (tried again now and then)
    this.warmQ = []; this.warmed = false;          // sprites asked for ahead of need (the little things everyone sees)
    this.critInfo = {}; this.fxInf = {}; this.projWarm = new Set();
    this.losses = [];                              // when the graphics memory was lost (visible page only)
    this.convBudget = 0; this.genBudget = 0; this.sprOut = 0; this.sprPrio = -1; this.syncLeft = 0;
    this.fades = new Map();                        // building index -> 0..1 (eased round the player)
    this.phs = new Map();                          // placeholder canvases (chunk key -> canvas)
    this.cycles = new Map();                       // walk cycles asked for lately (key -> time)
    this.cvs = [];                                 // scratch canvases
    this.lights = []; this.lightPool = [];
    this.liveHeads = [];                           // signal heads lit this frame: head, lens index, ...
    this.fLights = []; this.nfL = 0;               // furniture lights this frame (crossing flashers)
    this.presetA = {}; this.presetB = {}; this.presetC = {};
    this.lampGrid = null;
    this.ver = new Map();                          // chunk -> bake version (raised when the world changes there)
    this.adapted = new WeakMap();
    this.t = { clonePrep: 0, post: 0, workerInit: 0, bakeN: 0, bakeSum: 0, bakeMax: 0, upChunkMs: 0, frameMs: 0, convMs: 0, syncMs: 0 };
    this.n = { chunkUp: 0, fbSet: 0, sprReq: 0, sprUp: 0, conv: 0, gen: 0, sync: 0, pre: 0, lights: 0, drawn: 0, bakeErr: 0, sprErr: 0 };
    this.ghOf = (cx, cy) => { const s = this.chunkState.get(cy * 1000 + cx); return s ? s.gh : null; };
    this.lastErr = '';
    this.part = {}; this.pt = 0;
    this.noBake = /[?&]art2nobake\b/.test(typeof location !== 'undefined' ? location.search : '');
    this.ready = true; // drawable at once: placeholders stand in until bakes land
    if (engine.onContextLost) engine.onContextLost((what) => this._contextLost(what));
    // the redwoods' canopy for the light (sunflecks, the beams through the gaps): once per map
    if (engine.setCanopy) { try { engine.setCanopy(canopyGrid(this.map)); } catch (e) { console.warn('[art2] canopy', e); } }
  }

  async init() {
    try {
      const t = performance.now();
      const [A, Pd] = await Promise.all([import('./actors.js').catch(() => null), import('./peds.js').catch(() => null)]);
      this.A = A; this.Pd = Pd;
      this._loadMark('artmods', performance.now() - t);
    } catch { /* providers optional */ }
    if (this.failed) return;
    const t0 = performance.now();
    const M = worldData(this.map);
    this.t.clonePrep = performance.now() - t0;
    try {
      this.pool = takeWarmPool({ lowMem: this.lowMem, artPx: this.E.ap || 1 });
      const r = await this.pool.init(M, this.worldKey, { artKey: this.artKey, cdn: this.cdn });
      this.resync(false);   // (what players changed in the world so far: a city read from the browser's copy has none of it)
      this.t.post = r.ms.post; this.t.workerInit = r.ms.init;
      this._providers(r.providers);
      this._loadMark('workers', r.ms.init);
      if (r.providers && r.providers.modsMs !== undefined) this._loadMark('workermods', r.providers.modsMs);
      if (r.providers && r.providers.readMs) this._loadMark('workerread', r.providers.readMs);
      this._loadMark('post', r.ms.post);
      console.info(`[art2] ${r.workers} bake worker(s) ready: send ${this.t.post.toFixed(0)} ms, init ${this.t.workerInit.toFixed(0)} ms; providers ${JSON.stringify(this.prov)}; caches ${JSON.stringify(this.pool.budget)} MB`);
    } catch (e) { console.error('[art2] worker pool', e); this.pool = null; }
    // without its workers nothing but people could be drawn: main.js starts the renderer again
    if (!this.failed && (!this.pool || this.pool.dead)) this._noWorkers();
  }
  // the load timeline (main.js): the workers ready, the first chunk of art, the whole screen drawn - each once
  _loadMark(k, ms) {
    const seen = this.loadSeen || (this.loadSeen = new Set());
    if (seen.has(k)) return;
    seen.add(k);
    if (this.onLoad) this.onLoad(k, ms); else (this.loadQ || (this.loadQ = [])).push([k, ms]);
  }
  _providers(p) {
    p = p || {};
    this.prov = { ground: !!p.ground, statics: !!p.statics, actors: !!p.actors && !!this.A, peds: !!p.peds && !!this.Pd };
    this.provErrors = p.errors || {};
  }
  _noWorkers() { this.failed = true; this.ready = false; this.onFail('its background workers could not start'); }
  // Every worker gone and the pool given up on replacing them (pool.js): a new pool, with the world and what is
  // broken in it - the stand-ins show meanwhile. At most three times in five minutes; after that (false) the
  // renderer stops and main.js starts it again from scratch.
  _revivePool() {
    if (this.reviving) return true;
    const now = performance.now();
    this.revives = (this.revives || []).filter((t) => now - t < 300000);
    if (this.revives.length >= 3) return false;
    this.revives.push(now); this.reviving = true; this.n.revived = (this.n.revived || 0) + 1;
    const old = this.pool;
    this.pool = null;
    try { if (old) old.dispose(); } catch { /* gone */ }
    this.sprOut = 0; this.results.clear(); this.upQ.clear(); this.chunkFails.clear(); this.badKeys.clear();
    console.warn('[art2] the bake workers were lost - starting new ones', old ? old.lastWhy : '');
    let p = null;
    try { p = new WorkerPool({ lowMem: this.lowMem, artPx: this.E.ap || 1 }); } catch (e) { console.error('[art2] worker pool', e); this.reviving = false; return false; }
    p.init(worldData(this.map), null, { artKey: this.artKey, cdn: this.cdn }).then((r) => {
      this.reviving = false;
      if (this.failed) { p.dispose(); return; }
      if (p.dead) { this.pool = p; return; } // (the next frame tries again, or gives up)
      this.pool = p;
      this._providers(r.providers);
      this.resync();
    }, () => { this.reviving = false; p.dispose(); this.pool = null; this._noWorkers(); });
    return true;
  }

  resize(W, H, dpr) { this.W = W; this.H = H; this.dpr = dpr; if (this.E.resize) this.E.resize(W, H, dpr); }

  // engine.onContextLost: 'lost', 'restored' (everything must be uploaded again: has* answer false, and what
  // was waiting is dropped), 'failed' (the rebuild failed). Phones drop the graphics of a page in the
  // background (and sometimes when it comes back): that is not counted. Only losses while it is on screen,
  // three within three minutes, give up on the new renderer for the session.
  _contextLost(what = 'lost') {
    const now = performance.now();
    if (what === 'lost') {
      const seen = typeof document === 'undefined' || (!document.hidden && now - (World2.shownAt || 0) > 3000);
      if (seen) this.losses.push(now);
      this.lost++;
    }
    this.chunkState.clear(); this.fallbacks.clear(); this.results.clear(); this.upQ.clear();
    this.losses = this.losses.filter((t) => now - t < 180000);
    if (this.losses.length >= 3 || what === 'failed') { this.failed = true; this.ready = false; this.onFail(what === 'failed' ? 'the graphics could not be rebuilt' : 'the graphics memory kept running out'); }
  }

  dispose() {
    this.ready = false; this.failed = true;
    if (this.pool) this.pool.dispose();
    try { this.E.dispose(); } catch { /* gone */ }
    this.chunkState.clear(); this.results.clear(); this.upQ.clear(); this.phs.clear(); this.fades.clear();
  }

  // ---- the frame ---------------------------------------------------------------------------------------------
  frame(F) {
    if (this.failed) return;
    if (this.pool && this.pool.dead && !this._revivePool()) { this._noWorkers(); return; }
    const t0 = performance.now();
    const E = this.E, S = this.S, z = F.z;
    this.F = F;
    const q = qualityOf(this.gfx, this.lowMem);
    if (q !== this.q) { this.q = q; this.tier = TIERS[q]; if (E.setQuality) E.setQuality(q); }
    // sprites snap to the art grid: the camera moves with the player's position rounded to it (plus the smooth
    // look-ahead) so the player stays steady on screen (engine.js integration notes)
    const ap = E.ap || 1, sp = F.sp, camX = Math.round(sp.x / ap) * ap + (S.cam.x - sp.x) - F.shx / z, camY = Math.round(sp.y / ap) * ap + (S.cam.y - sp.y) - F.shy / z;
    const hw = this.W / 2 / z, hh = this.H / 2 / z;
    this.vx0 = camX - hw; this.vx1 = camX + hw; this.vy0 = camY - hh; this.vy1 = camY + hh;
    this.camX = camX; this.camY = camY;
    this.convBudget = this.tier.convert; this.genBudget = 48;
    // people made on this thread this frame: more while the workers are still starting
    this.syncLeft = this.prov.peds ? this.tier.syncMs : Math.max(8, this.tier.syncMs * 2);
    if (F.now - this.badAt > 20) { this.badKeys.clear(); this.badAt = F.now; } // (a failure may have been passing)
    const T = this.part, mk = (k) => { const n = performance.now(); T[k] = (T[k] || 0) * 0.9 + (n - this.pt) * 0.1; this.pt = n; };
    this.pt = t0;
    this._chunks(F); mk('chunks');
    this._fetchAhead(F); this._prebake(F); mk('prebake');
    const preset = this._preset(F);
    const wet = Math.max(S.rainK || 0, (S.wx ? S.wx.wet : 0) * 0.8);
    const flash = S.wx ? Math.min(1, S.wx.flash || 0) : 0, fog = F.sky.fog ? F.sky.fog.k : 0;
    // (viewW / viewH: the view in world px, what the scene covers)
    this._fades(F, sp);
    // the wind the vegetation sways in (render/flora/wind.js, from the shared world clock); Settings' "Wind sway"
    // switch turns the swaying off
    E.swayOn = this.gfx.wind !== false;
    const Wd = this.windArr || (this.windArr = [0, 0, 1, 0]);
    Wd[0] = wind.strength; Wd[1] = wind.gust; Wd[2] = wind.dx; Wd[3] = wind.dy;
    if (E.beginFrame({ camX, camY, zoom: z, viewW: this.W / z, viewH: this.H / z, time: F.now, preset, wet, quality: this.q, flash, fog, fades: this.fades, wind: Wd, windT: S.loopTime || F.now }) === false) return;
    this.n.drawn = 0;
    mk('begin');
    this._uploadSprites(); mk('upload');
    this._decals(F); this._wakeTrail(F); mk('decals');
    this._entities(F); mk('entities');
    this._prefetch(F); mk('prefetch');
    this._furniture(F); mk('furniture');
    this._particles(F); mk('particles');
    this._lights(F); mk('lights');
    E.endFrame(); mk('end');
    this.t.frameMs = this.t.frameMs * 0.9 + (performance.now() - t0) * 0.1;
    F.mark('art2');
  }

  // ---- chunks ---------------------------------------------------------------------------------------------
  // need: what the engine draws this frame (the view plus the tier's shadow reach) - resident now, a
  // placeholder (roads, blocks and trees drawn simply) standing in until its bake lands; the engine keeps at
  // least that many chunk slots, so what is on screen never pushes itself out. bake, in this order: that; the
  // road ahead when moving (every chunk the view will sweep over in the next few seconds, by when it comes into
  // view); then a ring round the view, not behind you when moving and not at all at speed. A fast car on a
  // phone outruns a bake queue that spends its time on the ring (planBake, exported for the tests).
  _chunks(F) {
    const E = this.E, S = this.S, tier = this.tier;
    const need = this.needChunks || (this.needChunks = new Map()), bake = this.wantChunks;
    need.clear(); bake.clear();
    const v = this._camVel(F);
    // the view the camera is easing toward (it zooms out with speed): the sweep uses the larger of the two
    const zt = Math.min(F.z, (S.cam && S.cam.tz) || F.z), grow = Math.max(0, (this.W / 2 / zt) - (this.W / 2 / F.z)), growY = Math.max(0, (this.H / 2 / zt) - (this.H / 2 / F.z));
    const soon = planBake(need, bake, { x0: this.vx0, y0: this.vy0, x1: this.vx1, y1: this.vy1, cx: this.camX, cy: this.camY, gx: grow, gy: growY }, v.x, v.y, E.margins || [36, 200, 300, 300][this.q], this.soonKeys || (this.soonKeys = []));
    // the chunks coming into view within 1.5 s get their placeholder drawn ahead (one a frame), so a bake that is
    // late shows the simple version at once
    for (const k of soon) {
      const cx = k % 1000, cy = Math.floor(k / 1000);
      if (this.phs.has(k) || E.hasChunk(cx, cy)) continue;
      this._placeholder(cx, cy);
      break;
    }
    // standing in a walk-in shop: its chunks are baked cut away
    const cut = F.insideB ? F.insideB.id : -1;
    let cutBox = null;
    if (cut >= 0) { const b = F.insideB; cutBox = [b.tx * TILE - 40, b.ty * TILE - 360, (b.tx + b.tw) * TILE + 40, (b.ty + b.th) * TILE + 40]; }
    const modeOf = (cx, cy) => (cutBox && (cx + 1) * CHUNK > cutBox[0] && cx * CHUNK < cutBox[2] && (cy + 1) * CHUNK > cutBox[1] && cy * CHUNK < cutBox[3] ? cut : -1);
    const offSea = this._offSea();   // (past the map's edge: open sea)
    if (E.reserveChunks) E.reserveChunks(need.size + offSea + 1);
    // the placeholder where nothing baked is resident: at once for what is on screen, one a frame for the
    // margins
    let fbBudget = 1;
    for (const k of need.keys()) {
      const cx = k % 1000, cy = Math.floor(k / 1000);
      if (E.hasChunk(cx, cy) || this._fallback(cx, cy)) continue;
      const onScreen = (cx + 1) * CHUNK > this.vx0 && cx * CHUNK < this.vx1 && (cy + 1) * CHUNK > this.vy0 && cy * CHUNK < this.vy1;
      if (!onScreen && fbBudget-- <= 0) continue;
      // (a chunk of open sea - the bakes get to these last - waits as the sea's own stand-in, rolling with waves like
      // the sea past the map's edge, not a flat patch of blue: the user's 2026-10-08 report of the ocean "not loading")
      if (this._openSea(cx, cy)) E.setChunkFallback(cx, cy, this._seaStandIn(), F_GROUND | F_WATER);
      else E.setChunkFallback(cx, cy, this._placeholder(cx, cy));
      this.fallbacks.add(k); this.n.fbSet++;
    }
    const jobs = this.wantJobs; jobs.clear();
    const baking = !this.noBake && this.pool && !this.pool.dead && this.pool.ready && (this.prov.ground || this.prov.statics);
    if (baking) {
      for (const [k, prio] of bake) {
        const cx = k % 1000, cy = Math.floor(k / 1000), mode = modeOf(cx, cy);
        const st = this.chunkState.get(k), ver = this.ver.get(k) || 0;
        if (st && st.mode === mode && st.ver === ver && !st.preview && E.hasChunk(cx, cy)) continue;
        const fail = this.chunkFails.get(k);
        if (fail && performance.now() < fail.t) continue;
        const jk = `c${cx},${cy},${mode},${ver}`;
        jobs.add(jk);
        if (this.results.has(jk) || this.pool.has(jk) || this.results.size >= (tier.results || 6)) continue;
        const opt = { quality: this.q, seed: this.map.seed, lowMem: this.lowMem };
        if (mode >= 0) opt.cutaway = mode;
        // (it may come from - and go into - the browser's store of baked chunks: cut away round the building you're
        // in, it's kept as that; the worker adds what players changed there to the key)
        const ck = this.artKey ? `q${this.q}|a${this.E.ap || 1}|u1|${cx},${cy}${mode >= 0 ? `|c${mode}` : ''}` : null;
        this.pool.request(jk, 'bakeChunk', { cx, cy, opt, ck }, prio, (r, err) => this._baked(jk, k, cx, cy, mode, prio, r, err, ver));
      }
    }
    // a look in the browser's store of baked chunks first, for what the view needs and doesn't have: drawn at once,
    // and when it was kept with other props broken (exact: false) it stands in until its own bake lands
    if (baking && this.artKey) {
      const peeks = this.peeks || (this.peeks = new Map());
      for (const [k, d] of need) {
        const cx = k % 1000, cy = Math.floor(k / 1000);
        if (E.hasChunk(cx, cy)) continue;
        const mode = modeOf(cx, cy), ver = this.ver.get(k) || 0, pk = `p${cx},${cy},${ver},${mode}`;
        if (peeks.has(pk)) continue;
        peeks.set(pk, 1);
        this.pool.request(pk, 'peekChunk', { cx, cy, q: this.q, ck: `q${this.q}|a${this.E.ap || 1}|u1|${cx},${cy}${mode >= 0 ? `|c${mode}` : ''}` }, d - 1e6, (r, err) => {
          if (err || !r || r.none || !r.g || this.failed) { peeks.set(pk, 2); return; }
          peeks.set(pk, 2);
          if (r.cdn) { this.n.cdn = (this.n.cdn || 0) + 1; this.t.cdnSum = (this.t.cdnSum || 0) + (r.dlMs || 0); }   // (the server's: worker.js)
          this.results.set(pk, { jk: pk, key: k, cx, cy, mode, r, prio: d - 1e6, ver, preview: !r.exact });
        });
      }
      for (const [pk, st] of peeks) { if (st === 1 || this.results.has(pk)) jobs.add(pk); }   // (waiting, or landed and not yet up)
      if (peeks.size > 400) for (const [pk, st] of peeks) if (st === 2 && !this.results.has(pk)) peeks.delete(pk);
    }
    if (this.pre) for (const jk of this.pre.out) jobs.add(jk);   // (baking ahead into the store: _prebake)
    if (this.pool && !this.pool.dead) this.pool.cancelWhere((jk) => jk[0] === 'c' && !jobs.has(jk));
    for (const jk of this.results.keys()) if (!jobs.has(jk)) this.results.delete(jk); // landed too late to matter
    // the road ahead already resident (not on screen yet) is kept like what is drawn: the chunks left behind go first
    if (E.keepChunk) for (const k of bake.keys()) if (!need.has(k)) E.keepChunk(k % 1000, Math.floor(k / 1000));
    // uploads, nearest first: what is needed now; the rest into the slots not taken by what is wanted (a slot whose
    // chunk was left behind is free for the road ahead)
    if (this.results.size) {
      const ready = [...this.results.values()].sort((a, b) => a.prio - b.prio);
      const cap = E.chunkCap ? E.chunkCap() : this.lowMem ? Math.min(LOWMEM_CHUNKS, tier.chunks) : tier.chunks;
      let held = 0;
      if (E.chunkKeys) for (const ck of E.chunkKeys()) { const [x, y] = typeof ck === 'string' ? ck.split(',') : ck; if (bake.has(+y * 1000 + +x)) held++; }
      let n = tier.chunkUp, free = Math.max(0, cap - held);
      for (const res of ready) {
        if (n <= 0) break;
        if (!need.has(res.key)) { if (free <= 0) continue; free--; }
        if (res.preview || res.jk[0] === 'p') {   // (a look in the store: never over the real bake, or after it)
          const st = this.chunkState.get(res.key);
          if (st && !st.preview && st.ver === res.ver && E.hasChunk(res.cx, res.cy)) { this.results.delete(res.jk); continue; }
        }
        n--;
        const t = performance.now();
        let ok = false;
        try { const g = res.r.g; if (res.r.under) g.under = res.r.under; g.blds = res.r.blds || null; ok = E.uploadChunk(res.cx, res.cy, g) !== false; } catch (e) { console.error('[art2] uploadChunk', e); }
        this.results.delete(res.jk);
        if (!ok) continue;
        this.t.upChunkMs = performance.now() - t;
        this.chunkState.set(res.key, { mode: res.mode, ver: res.ver, preview: !!res.preview, gh: res.r.gh, lights: this._prepLights(res.r.lights || []), live: res.r.live || null, blds: res.r.blds && res.r.blds.length ? res.r.blds : null });
        if (res.r.kept) this.n.kept = (this.n.kept || 0) + 1;
        this.fallbacks.delete(res.key);
        this.n.chunkUp++;
        this._loadMark('art');
      }
    }
    // how often a chunk on screen is still a stand-in once the game is under way (the perf report: main.js), and how
    // long the longest such stretch lasted - on the move (over 300 px/s) and overall
    if (baking && this.loadSeen && this.loadSeen.has('screen')) {
      let miss = false;
      for (const k of need.keys()) {
        const cx = k % 1000, cy = Math.floor(k / 1000);
        if ((cx + 1) * CHUNK > this.vx0 && cx * CHUNK < this.vx1 && (cy + 1) * CHUNK > this.vy0 && cy * CHUNK < this.vy1 && !E.hasChunk(cx, cy)) { miss = true; break; }
      }
      const L = this.late || (this.late = { frames: 0, of: 0, run: 0, max: 0, moving: 0, movingLate: 0 }), dt = Math.min(0.2, F.dt || 0.016), mv = Math.hypot(v.x, v.y) > 300;
      L.of++; if (mv) L.moving++;
      if (miss) { L.frames++; if (mv) L.movingLate++; L.run += dt; if (L.run > L.max) L.max = L.run; } else L.run = 0;
      L.now = miss && mv;
    }
    // (the load timeline: the first time nothing on screen is a stand-in any more)
    if (baking && !(this.loadSeen && this.loadSeen.has('screen'))) {
      let missing = 0;
      for (const k of need.keys()) {
        const cx = k % 1000, cy = Math.floor(k / 1000);
        if ((cx + 1) * CHUNK > this.vx0 && cx * CHUNK < this.vx1 && (cy + 1) * CHUNK > this.vy0 && cy * CHUNK < this.vy1 && !E.hasChunk(cx, cy)) missing++;
      }
      if (!missing && this.n.chunkUp) this._loadMark('screen');
    }
    // the engine keeps its chunk slots (least recently drawn goes first): forget what it let go
    if ((this.frameNo = (this.frameNo || 0) + 1) % 30 === 0) {
      for (const k of this.chunkState.keys()) {
        if (E.hasChunk(k % 1000, Math.floor(k / 1000))) continue;
        this.chunkState.delete(k);
        if (this.peeks) for (const pk of this.peeks.keys()) if (pk.startsWith(`p${k % 1000},${Math.floor(k / 1000)},`)) this.peeks.delete(pk);   // (back in view: a look in the store again)
      }
      for (const k of this.fallbacks) if (!this._fallback(k % 1000, Math.floor(k / 1000))) this.fallbacks.delete(k);
    }
  }
  // whether any of a hull's length (bow, middle, stern) lies under a bridge deck (bridge tiles over the water)
  _underDeck(x, y, a, L) {
    const M = this.map, c = Math.cos(a) * L * 0.5, s = Math.sin(a) * L * 0.5;
    for (let k = -1; k <= 1; k++) if (M.tileAtPx(x + c * k, y + s * k) === TT.BRIDGE) return true;
    return false;
  }

  // ---- baking ahead into the browser's store --------------------------------------------------------------
  // When nothing on screen or on the road ahead is waiting for a bake, the workers bake the chunks round you into the
  // browser's store of baked chunks (chunkstore.js) without drawing them, nearest first: further along the way you are
  // heading, along the roads you could take from here (by distance along them), then a ring round you. Coming to
  // one later, its bake is a read from the store: tens of ms instead of a second or more on a phone. One worker is
  // always left for what the screen needs, nothing is baked ahead while the page is hidden, and at most PRE_N[phone]
  // chunks round you are kept (the store holds 90 on a phone, 180 elsewhere: pool.js keepCap).
  _prebake(F) {
    const P = this.pool;
    if (!this.artKey || this.lowMem || this.noBake || !P || P.dead || !P.ready || !(this.prov.ground || this.prov.statics)) return;
    if (typeof document !== 'undefined' && document.hidden) return;
    const pre = this.pre || (this.pre = { list: [], at: -1e9, out: new Set(), kept: new Set(), cx: -99, cy: -99, n: 0, done: 0, had: 0 });
    if (P.waiting && P.waiting((k) => k[0] === 'c' && k[1] !== 'B') > 0) return;   // a bake for the screen or the road ahead waits
    for (const k of this.wantChunks.keys()) { const cx = k % 1000, cy = Math.floor(k / 1000); if (!this.E.hasChunk(cx, cy) && !this.results.has(`c${cx},${cy},-1,${this.ver.get(k) || 0}`)) return; }
    const room = Math.max(1, (P.size || 1) - 1) - pre.out.size;
    if (room <= 0) return;
    const now = F.now, pcx = Math.floor(this.camX / CHUNK), pcy = Math.floor(this.camY / CHUNK);
    if (now - pre.at > 1.5 || pcx !== pre.cx || pcy !== pre.cy) { pre.list = this._prebakeList(); pre.at = now; pre.cx = pcx; pre.cy = pcy; }
    let n = room;
    while (n > 0 && pre.list.length) {
      const k = pre.list.shift(), cx = k % 1000, cy = Math.floor(k / 1000), kk = `${this.q}:${k}`;
      if (pre.kept.has(kk) || this.E.hasChunk(cx, cy) || (this.ver.get(k) || 0)) continue;   // (kept, drawn, or changed by players)
      if (this.fa && this.fa.out.has(`f${cx},${cy},${this.q}`)) continue;   // (on its way from the server: _fetchAhead)
      const jk = `cB${cx},${cy},${this.q}`;
      if (P.has(jk)) continue;
      n--; pre.out.add(jk);
      const q = this.q;
      P.request(jk, 'prebakeChunk', { cx, cy, opt: { quality: q, seed: this.map.seed, lowMem: this.lowMem }, ck: `q${q}|a${this.E.ap || 1}|u1|${cx},${cy}` }, 50000 + pre.n++, (r, err) => {
        pre.out.delete(jk);
        if (err === 'no workers' || (r && r.soon)) return;   // (the server has it in a moment: _fetchAhead picks it up)
        pre.kept.add(`${q}:${k}`);   // (kept now - or failed: not tried again this session)
        if (r && r.kept) { if (r.had) pre.had++; else pre.done++; }
      });
    }
  }
  // While the art comes from the server (server/artcdn.js, worker.js fetchChunk): the chunks round you and on the roads
  // ahead are downloaded into the store in parallel - a download is cheap next to a bake, and it never waits on the bakes
  // the screen needs. What the server hasn't baked yet is left to _prebake (baked here when there's time). Off with the
  // phone's data saver, while the page is hidden, and for the session once the workers say the server's art is off.
  _fetchAhead(F) {
    const P = this.pool;
    if (!this.cdn || this.cdnOff || !this.artKey || this.lowMem || this.noBake || !P || P.dead || !P.ready) return;
    if (typeof document !== 'undefined' && document.hidden) return;
    const pre = this.pre || (this.pre = { list: [], at: -1e9, out: new Set(), kept: new Set(), cx: -99, cy: -99, n: 0, done: 0, had: 0 });
    const fa = this.fa || (this.fa = { out: new Set(), tried: new Map(), n: 0, got: 0, had: 0, miss: 0, pausedAt: -1e9 });
    const now = F.now;
    if (now - fa.pausedAt < 15) return;   // (the server's still baking this part of the world: look again in a bit)
    const pcx = Math.floor(this.camX / CHUNK), pcy = Math.floor(this.camY / CHUNK);
    if (now - pre.at > 1.5 || pcx !== pre.cx || pcy !== pre.cy) { pre.list = this._prebakeList(); pre.at = now; pre.cx = pcx; pre.cy = pcy; }
    const MAX = isPhone() ? 4 : 6;
    for (const k of pre.list) {
      if (fa.out.size >= MAX) break;
      const cx = k % 1000, cy = Math.floor(k / 1000), q = this.q, kk = `${q}:${k}`;
      if (pre.kept.has(kk) || this.E.hasChunk(cx, cy) || (this.ver.get(k) || 0)) continue;
      if (now - (fa.tried.get(kk) ?? -1e9) < 20) continue;   // (not there a moment ago)
      const jk = `f${cx},${cy},${q}`;
      if (P.has(jk)) continue;
      fa.out.add(jk); fa.tried.set(kk, now);
      if (fa.tried.size > 4000) fa.tried.clear();
      P.request(jk, 'fetchChunk', { cx, cy, q, ck: `q${q}|a${this.E.ap || 1}|u1|${cx},${cy}` }, 40000 + fa.n++, (r, err) => {
        fa.out.delete(jk);
        if (err || !r) return;
        if (r.off) { this.cdnOff = true; return; }
        if (r.kept) { pre.kept.add(kk); if (r.had) fa.had++; else fa.got++; }
        else { fa.miss++; if (r.paused) fa.pausedAt = now; }
      });
    }
  }
  // the chunks to bake ahead, best first (see _prebake)
  _prebakeList() {
    const phone = isPhone(), RING = phone ? 3 : 4, ROAD = phone ? 4800 : 7500, AHEAD_S = 12, MAXN = phone ? 64 : 120;
    const out = new Map(), add = (cx, cy, p) => {
      if (cx < 0 || cy < 0 || cx >= CX || cy >= CY) return;
      const k = cy * 1000 + cx, c = out.get(k);
      if (c === undefined || p < c) out.set(k, p);
    };
    const x0 = this.camX, y0 = this.camY;
    // 1. the way you're heading, past the stretch _chunks bakes: a band three chunks wide, up to AHEAD_S s on
    const v = this.camV ? this.camV.out : null, sp = v ? Math.hypot(v.x, v.y) : 0;
    if (sp > 120) {
      const ux = v.x / sp, uy = v.y / sp, L = Math.min(sp * AHEAD_S, 14000);
      for (let d = 0; d <= L; d += CHUNK / 2) for (let o = -1; o <= 1; o++) add(Math.floor((x0 + ux * d - uy * o * CHUNK) / CHUNK), Math.floor((y0 + uy * d + ux * o * CHUNK) / CHUNK), d * 0.5 + Math.abs(o) * 300);
    }
    // 2. along the roads from here, by the distance along them (the ground level: a deck's chunks are its ground's)
    const net = this.map.net;
    if (net && net.nodes && net.nodes.length) {
      const dist = new Map(), open = [];
      for (const nd of net.nodes) { const d = Math.hypot(nd.x - x0, nd.y - y0); if (d < 700) { dist.set(nd.id, d); open.push(nd.id); } }
      while (open.length) {
        let bi = 0;
        for (let i = 1; i < open.length; i++) if (dist.get(open[i]) < dist.get(open[bi])) bi = i;
        const id = open[bi]; open[bi] = open[open.length - 1]; open.pop();
        const d0 = dist.get(id), nd = net.nodes[id];
        if (!nd || d0 > ROAD) continue;
        for (const eid of nd.edges) {
          const e = net.edges[eid];
          if (!e || !e.pts || e.dead) continue;
          const other = e.a === id ? e.b : e.a, back = e.a !== id;
          // its chunks, every 300 px along it from this end
          let along = 0;
          for (let i = 0; i < e.pts.length; i++) {
            const pt = e.pts[back ? e.pts.length - 1 - i : i], nx = e.pts[back ? Math.max(0, e.pts.length - 2 - i) : Math.min(e.pts.length - 1, i + 1)];
            const seg = Math.hypot(nx.x - pt.x, nx.y - pt.y), steps = Math.max(1, Math.ceil(seg / 300));
            for (let t = 0; t < steps; t++) { const f = t / steps, px = pt.x + (nx.x - pt.x) * f, py = pt.y + (nx.y - pt.y) * f; if (d0 + along + seg * f <= ROAD) add(Math.floor(px / CHUNK), Math.floor(py / CHUNK), d0 + along + seg * f); }
            along += seg;
          }
          const nd2 = d0 + (e.len || along);
          if (nd2 < (dist.get(other) ?? Infinity)) { if (!dist.has(other)) open.push(other); dist.set(other, nd2); }
        }
      }
    }
    // 3. a ring round you
    const pcx = Math.floor(x0 / CHUNK), pcy = Math.floor(y0 / CHUNK);
    for (let dy = -RING; dy <= RING; dy++) for (let dx = -RING; dx <= RING; dx++) add(pcx + dx, pcy + dy, 2500 + Math.hypot(dx, dy) * CHUNK);
    return [...out].sort((a, b) => a[1] - b[1]).slice(0, MAXN).map((e) => e[0]);
  }
  // Where the camera is heading (world px/s): the driven vehicle's own velocity (no lag), else the camera's
  // smoothed motion (riding a train, a bus or a taxi, spectating); a jump (teleport, respawn) resets it.
  _camVel(F) {
    const S = this.S, v = this.camV || (this.camV = { x: 0, y: 0, px: this.camX, py: this.camY, out: { x: 0, y: 0 } });
    const dt = Math.min(0.1, Math.max(0.001, F.dt || 0.016)), dx = this.camX - v.px, dy = this.camY - v.py;
    v.px = this.camX; v.py = this.camY;
    if (Math.abs(dx) + Math.abs(dy) > 900) { v.x = 0; v.y = 0; } else { const k = 1 - Math.exp(-5 * dt); v.x += (dx / dt - v.x) * k; v.y += (dy / dt - v.y) * k; }
    const o = v.out, p = S.pred && S.pred.kind === 'veh' && S.pred.s;
    o.x = p ? p.vx : v.x; o.y = p ? p.vy : v.y;
    return o;
  }
  _fallback(cx, cy) { return this.E.hasFallback ? this.E.hasFallback(cx, cy) : this.fallbacks.has(cy * 1000 + cx); }
  // Past the map's edge the sea runs on (shared/border.js). Those chunks are baked like any other - groundbake.js
  // makes open sea of everything past the edge - but kept apart from the map's own: the bookkeeping above keys
  // chunks by cy * 1000 + cx, which only holds inside the map, and they have no lights, heights or buildings.
  // Until a bake lands, a flat stand-in of the deep sea's colour that the light pass rolls with waves. Returns how
  // many such chunks the view takes (the engine keeps that many slots more).
  _offSea() {
    const E = this.E, pool = this.pool;
    if (!E.hasFallback) return 0;   // (the 2D stub engine keys chunks the map's way: no sea past the edge there)
    const x0 = Math.floor((this.vx0 - 64) / CHUNK), x1 = Math.floor((this.vx1 + 64) / CHUNK), y0 = Math.floor((this.vy0 - 64) / CHUNK), y1 = Math.floor((this.vy1 + 128) / CHUNK);
    const want = this.seaWant || (this.seaWant = new Set()), res = this.seaRes || (this.seaRes = new Map());
    want.clear();
    let n = 0;
    for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
      if (cx >= 0 && cy >= 0 && cx < CX && cy < CY) continue;
      n++;
      if (E.hasChunk(cx, cy)) continue;
      if (!E.hasFallback(cx, cy)) E.setChunkFallback(cx, cy, this._seaStandIn(), F_GROUND | F_WATER);
      const jk = `o${cx},${cy}`;
      want.add(jk);
      if (!pool || pool.dead || !pool.ready || this.noBake || res.has(jk) || pool.has(jk)) continue;
      pool.request(jk, 'bakeChunk', { cx, cy, opt: { quality: this.q, seed: this.map.seed, lowMem: this.lowMem, under: false }, ck: this.artKey ? `q${this.q}|a${this.E.ap || 1}|u0|${cx},${cy}` : null }, 1, (r, err) => { if (!err && r && r.g && !this.failed) res.set(jk, { cx, cy, g: r.g }); });
    }
    if (n || this.seaActive) {   // (bakes for sea that has gone out of view are called off)
      if (pool && !pool.dead) pool.cancelWhere((jk) => jk[0] === 'o' && !want.has(jk));
      this.seaActive = n > 0;
    }
    for (const [jk, r] of res) {   // (one landed bake a frame)
      res.delete(jk);
      if (!want.has(jk)) continue;
      try { E.uploadChunk(r.cx, r.cy, r.g); } catch (e) { console.error('[art2] uploadChunk (sea)', e); }
      break;
    }
    return n;
  }
  // is the chunk open sea (deep water all over, and nothing standing in it)? kept per chunk
  _openSea(cx, cy) {
    const k = cy * 1000 + cx, M = this.map, seaK = this.seaK || (this.seaK = new Map());
    let v = seaK.get(k);
    if (v === undefined) {
      v = true;
      for (let ty = cy * 24 - 1; ty < cy * 24 + 26 && v; ty += 2) for (let tx = cx * 24 - 1; tx < cx * 24 + 26; tx += 2) if (M.tileAt(tx, ty) !== TT.DEEP) { v = false; break; }
      seaK.set(k, v);
    }
    return v;
  }
  _seaStandIn() {
    if (this.seaCv) return this.seaCv;
    const cv = document.createElement('canvas'); cv.width = cv.height = 16;
    const g = cv.getContext('2d'); g.fillStyle = 'rgb(23,96,150)'; g.fillRect(0, 0, 16, 16);   // (the baked deep sea's average)
    return (this.seaCv = cv);
  }
  // A chunk's stand-in until its bake lands: the map drawn simply in the new ground's colours - roads with
  // their lines, building blocks, trees (standin.js, a millisecond or two). Never the old art.
  _placeholder(cx, cy) {
    const k = cy * 1000 + cx;
    let cv = this.phs.get(k);
    if (cv) return cv;
    cv = document.createElement('canvas'); cv.width = cv.height = STANDIN_PX;
    const t = performance.now();
    try { drawStandIn(cv.getContext('2d'), this.map, cx, cy); } catch (e) { if (!this.loggedStandIn) { this.loggedStandIn = true; console.warn('[art2] stand-in', e); } }
    this.t.standIn = (this.t.standIn || 0) * 0.8 + (performance.now() - t) * 0.2;
    if (this.phs.size >= 48) this.phs.delete(this.phs.keys().next().value);
    this.phs.set(k, cv);
    return cv;
  }

  // ---- see-through buildings --------------------------------------------------------------------------------
  // Whole buildings standing in front of you (their base south of you) whose picture covers the space round
  // you ease to transparent and back (the engine shows the street under them; past half way they stop hiding
  // what is behind them). Driving clears a wider space. A building already fading keeps a slightly bigger box,
  // so walking along its edge doesn't make it flicker.
  _fades(F, sp) {
    const S = this.S, inVeh = S.pred ? S.pred.kind === 'veh' : false, onTrain = F.myTrain !== undefined && F.myTrain >= 0;
    const z0 = (sp.z || 0) > 0.01 ? DECK_Z * sp.z : this._gz(sp.x, sp.y), px = sp.x, py = sp.y, sy = py - z0;
    // On a train only what really stands over you fades (passing beside buildings, the ones either side of the
    // track kept fading in and out); in a car a wider space round you, on foot a little less.
    const rx = onTrain ? 28 : inVeh ? 150 : 100, up = onTrain ? 70 : inVeh ? 160 : 128, down = onTrain ? 12 : 44;
    const want = this._fadeWant || (this._fadeWant = new Set());
    want.clear();
    const riding = !!(S.me && S.me.ride);   // (up on the wheel or in a balloon: nothing round your feet to see past)
    if (!F.sub && !F.spec && !riding) for (const st of this.chunkState.values()) { // (none while spectating)
      if (!st.blds) continue;
      for (const r of st.blds) {
        const b = r[0], fading = (this.fades.get(b) || 0) > 0.05, m = fading ? 24 : 0;
        if (r[5] <= py + 2) continue;   // (its foot north of yours: it stands behind you)
        // a giant redwood only when it's really in front of you (not every tree whose box you're near)
        if (b >= TREE_FADE) { if (!onTrain && this._treeCovers(b - TREE_FADE, px, sy, inVeh, fading ? 10 : 0)) want.add(b); continue; }
        if (r[3] < px - rx - m || r[1] > px + rx + m || r[4] < sy - up - m || r[2] > sy + down + m) continue;
        want.add(b);
      }
    }
    const k = 1 - Math.exp(-5 * Math.min(0.1, F.dt || 0.016));
    for (const b of want) if (!this.fades.has(b)) this.fades.set(b, 0);
    for (const [b, f] of this.fades) {
      const on = want.has(b), nf = f + ((on ? 0.88 : 0) - f) * k; // (a faint ghost of it stays: you still see its shape)
      if (!on && nf < 0.01) this.fades.delete(b); else this.fades.set(b, nf);
    }
  }
  // does the redwood (its prop index) stand in front of you? Your figure on screen - 12 px either side of you
  // (30 in a car), from your feet to 46 px up (40) - against the tree's outline at those heights on it (RW_OUTLINE).
  // pad: a little more once it's fading, so it doesn't flicker at the edge.
  _treeCovers(pi, px, sy, inVeh, pad) {
    const p = this.map.props && this.map.props[pi];
    if (!p) return false;
    const W = RW_OUTLINE[p.sp] || RW_OUTLINE.giant, dx = Math.abs(px - p.x) - (inVeh ? 30 : 12) - pad, fh = inVeh ? 40 : 46;
    if (dx >= 150) return false;
    for (let z = Math.max(0, p.y - sy), z1 = p.y - sy + fh; z <= z1; z += 10) {
      const i = Math.floor(z / 40);
      if (i >= W.length) break;
      if (dx < W[i]) return true;
    }
    return false;
  }
  _baked(jk, key, cx, cy, mode, prio, r, err, ver = 0) {
    if (err || !r) {
      this.n.bakeErr++; this.lastErr = String(err).slice(0, 300);
      if (this.n.bakeErr <= 3) console.warn('[art2] chunk bake failed', cx, cy, this.lastErr);
      if (err === 'no workers') return; // (the pool is being replaced: asked again once it is back)
      // tried again later, never given up on (a phone short of memory fails bakes for a while, then has room
      // again): 1 s, 2, 4 ... up to 30 s between tries - 2 minutes after a bake that hung its worker
      const f = this.chunkFails.get(key) || { n: 0, t: 0 }, now = performance.now();
      f.n++;
      f.t = now + (/too long/.test(this.lastErr) ? 120000 : Math.min(30000, 1000 * 2 ** Math.min(5, f.n - 1)));
      this.chunkFails.set(key, f);
      return;
    }
    this.chunkFails.delete(key);
    if (this.pre && mode < 0 && !r.errors) this.pre.kept.add(`${this.q}:${key}`);   // (the worker kept it: worker.js)
    if (r.errors && !this.loggedBakeErr) { this.loggedBakeErr = true; console.warn('[art2] chunk bake reported provider errors (fallbacks used)', JSON.stringify(r.errors).slice(0, 600)); }
    const ms = r.workerMs || 0;
    if (r.cdn) { this.n.cdn = (this.n.cdn || 0) + 1; this.t.cdnSum = (this.t.cdnSum || 0) + ms; }   // (downloaded from the server: worker.js)
    else { this.t.bakeN++; this.t.bakeSum += ms; this.t.bakeMax = Math.max(this.t.bakeMax, ms); }
    this.t.lastBake = r.bake;
    if (this.failed) return;
    this.results.set(jk, { jk, key, cx, cy, mode, r, prio, ver });
  }
  // static lights of a chunk: lamps matched to the v1 lamps (for their warm-up, flicker and breakage)
  _prepLights(list) {
    if (!list.length) return list;
    if (!this.lampGrid) {
      this.lampGrid = new Map();
      for (const l of this.map.lamps || []) { const k = Math.floor(l.y / 256) * 1000 + Math.floor(l.x / 256); let a = this.lampGrid.get(k); if (!a) this.lampGrid.set(k, a = []); a.push(l); }
    }
    for (const L of list) {
      if (L.kind !== 'lamp') continue;
      let best = null, bd = 72 * 72;
      const gx = Math.floor(L.x / 256), gy = Math.floor(L.y / 256);
      for (let y = gy - 1; y <= gy + 1; y++) for (let x = gx - 1; x <= gx + 1; x++) for (const l of this.lampGrid.get(y * 1000 + x) || []) {
        const h = lampHead(l);
        const d = Math.min((l.x - L.x) ** 2 + (l.y - L.y) ** 2, (h.x - L.x) ** 2 + (h.y - L.y) ** 2);
        if (d < bd) { bd = d; best = l; }
      }
      L._lamp = best;
    }
    return list;
  }

  // ---- the sky ---------------------------------------------------------------------------------------------
  // SKY_KEYS blend the presets by the clock, then toward rain (a storm after dark) and fog (a misty night stays dark).
  // The sun stands where v1's sky puts it (the shadows agree with the HUD clock and the v1 views) from first light to
  // blue hour; at night the light comes from the night preset's moon. The change-over is eased (sunUp) while the
  // direct light is faint, so neither the shadows nor the light jump - and nothing switches at a threshold.
  _preset(F) {
    const P = this.L && this.L.PRESETS_GAME, blend = this.L && this.L.blendPresets;
    const sky = F.sky, S = this.S;
    if (!P || !blend) return null;
    const m = sky.minutes;
    let i = 0;
    while (i < SKY_KEYS.length - 2 && SKY_KEYS[i + 1][0] <= m) i++;
    const [ma, a] = SKY_KEYS[i], [mb, b] = SKY_KEYS[i + 1];
    let p = blend(P[a], P[b], smooth((m - ma) / Math.max(1, mb - ma)), this.presetA);
    const dark = darkAt(m), rk = S.rainK || 0;
    if (rk > 0.01) {
      const wetP = dark <= 0 ? P.rain : dark >= 1 ? P.storm : blend(P.rain, P.storm, dark, this.presetD || (this.presetD = {}));
      p = blend(p, wetP, Math.min(1, rk) * 0.92, this.presetB);
    }
    const fog = sky.fog ? sky.fog.k : 0;
    if (fog > 0.02) {
      const fogP = !P.fogNight || dark <= 0 ? P.fog : dark >= 1 ? P.fogNight : blend(P.fog, P.fogNight, dark, this.presetE || (this.presetE = {}));
      p = blend(p, fogP, Math.min(1, fog) * 0.75, p === this.presetB ? this.presetC : this.presetB);
    }
    const up = sunUp(m);
    if (up > 0 && sky.sunDir) {
      const sx = sky.sunDir.x, sy = sky.sunDir.y, l = Math.hypot(sx, sy) || 1;
      const elev = Math.atan(0.62 / Math.max(0.3, sky.shadowLen));
      const c = Math.cos(elev), s = Math.sin(elev);
      const d = p.sunDir || (p.sunDir = [0, 0, 1]), dl = Math.hypot(d[0], d[1], d[2]) || 1, pz = d[2] / dl;
      const x = d[0] / dl + (-sx / l * c - d[0] / dl) * up, y = d[1] / dl + (-sy / l * c - d[1] / dl) * up, zz = pz + (s - pz) * up, n = Math.hypot(x, y, zz) || 1;
      d[0] = x / n; d[1] = y / n; d[2] = zz / n;
      if (this.L.sunKeep) this.L.sunKeep(p, pz, s, up);
    }
    p.lampsOn = Math.max(p.lampsOn || 0, sky.night);
    p.rain = Math.max(p.rain || 0, rk);
    p.motes = this._nature(F);
    return p;
  }
  // how much of the view is growing ground (grass, fields, the woods' floor; parks in town count for less): the dust
  // drifting in the low sun (lightgame.js). Sampled twice a second round the camera and eased.
  _nature(F) {
    const now = F.now, M = this.map;
    if (!M || !M.tiles) return 0;
    if (!(now - (this.natAt ?? -9) < 0.5)) {
      this.natAt = now;
      let n = 0, g = 0;
      for (let j = -3; j <= 3; j++) for (let i = -4; i <= 4; i++) {
        const tx = Math.floor((this.camX + i * 90) / TILE), ty = Math.floor((this.camY + j * 80) / TILE);
        if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) continue;
        n++;
        const k = ty * MAP_W + tx, t = M.tiles[k];
        if (t === TT.GRASS || t === TT.FIELD || t === TT.DIRT) g += TOWN.has((DISTRICTS[M.dist[k]] || {}).style) ? 0.35 : 1;
      }
      this.natT = n ? Math.min(1, (g / n) * 1.4) : 0;
    }
    const dt = Math.min(0.1, Math.max(0, now - (this.natPrev ?? now)));
    this.natPrev = now;
    this.natK = (this.natK ?? this.natT) + ((this.natT || 0) - (this.natK ?? this.natT)) * (1 - Math.exp(-dt * 0.8));
    return this.natK;
  }

  // ---- sprites --------------------------------------------------------------------------------------------
  // Only the new art is drawn. A sprite comes from the providers (actors.js, peds.js): resident already, made
  // on this thread at once (people, ~2 ms each, while the frame's budget lasts - your own figure always), or
  // asked of the workers and drawn once it lands. Meanwhile a thing keeps showing the last sprite it had
  // (thing._v2k); a vehicle or train seen for the first time takes the nearest heading already made.
  _spr(prov, kind, key, args) {
    if (!key) return null;
    if (this.E.hasSprite(key)) return key;
    const g = this.upQ.get(key);                   // back from a worker, not uploaded yet: now
    if (g) { this.upQ.delete(key); if (this._upload(key, g)) return key; }
    if (this.badKeys.has(key)) return null;
    if (kind === 'ped' && this._now(key, args)) return key;
    this._ask(prov, kind, key, args, this.sprPrio);
    return null;
  }
  // a person made on this thread, now: yours always, others while the frame's budget lasts
  _now(key, args) {
    const fn = this.Pd && this.Pd.pedSprite;
    if (!fn || (this.sprPrio !== -3 && this.syncLeft <= 0)) return false;
    const t = performance.now();
    let G = null;
    try { G = fn(...args); } catch (e) { this.badKeys.add(key); this.n.sprErr++; if (this.n.sprErr <= 3) console.warn('[art2] sprite failed', key, e); return false; }
    const ok = !!(G && G.w) && this._upload(key, G);
    const ms = performance.now() - t;
    this.syncLeft -= ms; this.t.syncMs += ms; this.n.sync++;
    if (ok && this.pool) { const jk = 's' + key; if (this.pool.has(jk)) { this.pool.cancel(jk); this.sprOut = Math.max(0, this.sprOut - 1); } }
    return ok;
  }
  // Ask the workers for a sprite. prio: lower runs sooner (-3 yours, -1 on screen, 0 and up ahead of need).
  // At most a tier's worth of jobs are out at once (asking ahead: half of that). An ask already queued only
  // has its priority raised. true when a job went out.
  _ask(prov, kind, key, args, prio = -1) {
    const pool = this.pool;
    if (!key || !pool || pool.dead || !pool.ready || !this.prov[prov]) return false;
    if (this.E.hasSprite(key) || this.upQ.has(key) || this.badKeys.has(key)) return false;
    const jk = 's' + key;
    if (pool.has(jk)) { pool.request(jk, 'sprite', null, prio, null); return false; }
    if (this.sprOut >= (prio >= 0 ? this.tier.sprJobs >> 1 : this.tier.sprJobs)) return false;
    this.n.sprReq++; this.sprOut++;
    pool.request(jk, 'sprite', { kind, key, a: args }, prio, (r, err) => {
      this.sprOut = Math.max(0, this.sprOut - 1);
      if (err || !r || !r.g) { this.n.sprErr++; this.badKeys.add(key); if (this.n.sprErr <= 3) console.warn('[art2] sprite failed', key, String(err).slice(0, 300)); return; }
      if (!this.failed && !this.E.hasSprite(key)) this.upQ.set(key, r.g);
    });
    return true;
  }
  _upload(key, g) {
    let ok = false;
    try { ok = this.E.uploadSprite(key, g) !== false; } catch (e) { console.warn('[art2] uploadSprite', key, e); }
    if (ok) this.n.sprUp++;
    return ok; // (a full atlas refuses for now: the sprite is asked for again when it is next needed)
  }
  _uploadSprites() {
    let n = this.tier.sprUp;
    for (const [key, g] of this.upQ) {
      if (n-- <= 0) break;
      this.upQ.delete(key);
      if (!this.E.hasSprite(key)) this._upload(key, g);
    }
  }
  _canvas(i, w, h) {
    let c = this.cvs[i];
    if (!c) c = this.cvs[i] = document.createElement('canvas');
    if (c.width < w || c.height < h) { c.width = Math.max(c.width, w); c.height = Math.max(c.height, h); }
    const g = c.getContext('2d', { willReadFrequently: true });
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, c.width, c.height); g.imageSmoothingEnabled = false;
    return [c, g];
  }
  // exact-size scratch: getImageData reads the whole canvas
  _sized(i, w, h) { const [c, g] = this._canvas(i, 1, 1); if (c.width !== w || c.height !== h) { c.width = w; c.height = h; } g.imageSmoothingEnabled = false; g.clearRect(0, 0, w, h); return [c, g]; }
  // a generated sprite (gen: from the frame's generous budget), made once and kept
  _conv(key, make, gen = false) {
    if (this.E.hasSprite(key)) return key;
    if (gen ? this.genBudget-- <= 0 : this.convBudget-- <= 0) return null;
    const t = performance.now();
    let G = null;
    try { G = make(); } catch (e) { console.warn('[art2] generated sprite', key, e); G = null; }
    if (!G) return null;
    let ok = false;
    try { ok = this.E.uploadSprite(key, G) !== false; } catch (e) { console.warn('[art2] uploadSprite', key, e); }
    if (!ok) return null;
    this.t.convMs += performance.now() - t; gen ? this.n.gen++ : this.n.conv++;
    return key;
  }
  // the nearest heading already made (within an eighth of a turn either way), for a thing seen the first time
  _near(keyOf, hi, N) {
    for (let d = 1; d <= N >> 3; d++) for (let s = -1; s <= 1; s += 2) { const k = keyOf((hi + s * d + N) % N); if (this.E.hasSprite(k)) return k; }
    return null;
  }
  // the server appearance as the peds provider wants it (adapted once per descriptor, with its archetype)
  _app(a, ar) {
    if (!this.Pd || !this.Pd.adaptApp || !a) return a;
    let v = this.adapted.get(a);
    if (!v) { v = this.Pd.adaptApp(a, ar || null); this.adapted.set(a, v); }
    return v;
  }
  // ...carrying a robbery's takings (the descriptor's mb: server hotmoney.js): the same look with the money sack on the back
  _bagged(A) {
    let v = (this.bagged ||= new WeakMap()).get(A);
    if (!v) { v = { ...A, back: 'moneybag' }; this.bagged.set(A, v); }
    return v;
  }

  // ---- people ---------------------------------------------------------------------------------------------
  // A person: the peds provider's figure (people.js) for their pose, heading and stride, the weapon in hand -
  // or the flashlight when they carry nothing and have it switched on. The rest of a stride is asked for as
  // soon as a walk starts (or turns), so the next frames are there in time.
  _ped(p, now, me, F, extraZ = 0) {
    const E = this.E, Pd = this.Pd;
    if (p.flags & PF.INVEH) return;
    if (p.d && p.d.ar && p.d.ar.startsWith('pet:')) { this._pet(p, now); return; }
    if (p.blink === 3 || !Pd || !Pd.pedKey) return;
    const api = this.api, L = api.pedLook(p, now), f = p.flags, pose = L.pose;
    const d8 = dir8(p.ra + (L.turn || 0));   // (spun round as they go down)
    const lying = !L.upright && LYING.has(pose) && !L.flying && !L.swimming;
    const ppose = L.swimming ? 'swim' : L.upright ? (pose === 'move' ? 'walk' + L.lvl : pose) : lying ? pose : pose === 'roll' ? 'roll' : 'down';
    let lift = 0;
    if (L.flying) { const k = L.flT / (p.flingDur || 1); lift = Math.sin(Math.PI * k) * 20; }
    const A1 = this._app(p.d.app || {}, p.d.ar), A2 = p.d.mb && A1 ? this._bagged(A1) : A1, pf = Pd.pedFrame(ppose, L.fr);
    if (lying && (f & PF.DEAD) && p.deadK === 'halved' && this._halves(p, A2, ppose, d8, pf)) return;   // (cut in two by the plasma blade)
    // unarmed with the flashlight on: it's in your hand; under an open umbrella (standing or walking): its shaft is
    const umb = !!(f & PF.UMBRELLA) && !(p.extra | 0) && !p.d.fl && (ppose === 'idle' || ppose.startsWith('walk')) && !!Pd.umbrellaTop;
    // (a player with their phone menu open holds the phone: d.ph 1, server phone.js - in place of the weapon; someone
    // filming or taking photos holds it up in both hands: d.ph 2, server npc.js spectacle)
    const phone = !!p.d.ph && (ppose === 'idle' || ppose.startsWith('walk'));
    const wpn = phone ? (p.d.ph === 2 ? 'phoneUp' : 'phone') : (p.extra | 0) || (p.d.fl ? 'flashlight' : umb ? 'umbrella' : 0);
    let sk = this._spr('peds', 'ped', Pd.pedKey(A2, ppose, d8, pf, wpn), [A2, ppose, d8, pf, wpn]);
    if (!sk) sk = p._v2k && E.hasSprite(p._v2k) ? p._v2k : null; // (the last one while the new one is made)
    if (ppose !== p._cp || d8 !== p._cd || wpn !== p._cw || A2 !== p._ca || (this.frameNo + p.id) % 40 === 0) {
      p._cp = ppose; p._cd = d8; p._cw = wpn; p._ca = A2;
      this._cycle(A2, ppose, d8, wpn, me ? -2 : 0);
    }
    if (!sk) return;
    p._v2k = sk;
    const o = this.opts;
    o.alpha = 1; o.flash = L.hitK > 0.4 ? L.hitK - 0.4 : 0; o.xray = !!me; o.flipX = false; o.shadow = true; o.tint = null;
    if (f & PF.GHOST) o.alpha = 0.45 + 0.2 * Math.sin(now * 8);
    if (p.blink) o.alpha *= Math.floor(now * (p.blink === 1 ? 3 : 10)) % 2 ? 0.18 : 1;
    const hx = L.hitK ? Math.cos(p.hitA) * 4 * L.hitK : 0, hy = L.hitK ? Math.sin(p.hitA) * 3 * L.hitK : 0;
    const z0 = this._z0(p, L.swimming) + lift + extraZ;
    o.under = L.swimming && this.map.tileAtPx(p.rx, p.ry) === TT.BRIDGE ? UNDER_Z : 0;   // (swimming under a bridge)
    E.drawSprite(sk, p.rx + hx, p.ry + hy, z0, o);
    o.under = 0;
    this.n.drawn++;
    if (f & PF.UMBRELLA) {
      const uk = this._genUmbrella(p.id % Math.max(1, (api.UMBRELLA_COLORS || []).length));
      if (uk) {
        o.flash = 0; o.xray = false;
        if (umb) { const t = Pd.umbrellaTop(d8, this._umbT || (this._umbT = [0, 0, 0])); E.drawSprite(uk, p.rx + hx + t[0], p.ry + hy + t[1], z0 + t[2], o); }  // on the shaft in the hand
        else E.drawSprite(uk, p.rx, p.ry, z0 + 44, o);
      }
    }
  }
  // Someone the plasma blade cut in two: the body as it lies, in two halves a little apart, the cut edges seared
  // (peds.js pedSprite opt.cut; both halves keep the body's anchor). false while the halves are still being made (the
  // whole body is drawn meanwhile).
  _halves(p, A2, ppose, d8, pf) {
    const Pd = this.Pd, E = this.E;
    const ka = this._spr('peds', 'ped', Pd.pedKey(A2, ppose, d8, pf, 0, CUT_A), [A2, ppose, d8, pf, 0, CUT_A]);
    const kb = this._spr('peds', 'ped', Pd.pedKey(A2, ppose, d8, pf, 0, CUT_B), [A2, ppose, d8, pf, 0, CUT_B]);
    if (!ka || !kb) return false;
    const o = this.opts;
    o.alpha = 1; o.flash = 0; o.xray = false; o.flipX = false; o.shadow = true; o.tint = null;
    const z0 = this._z0(p, false);
    E.drawSprite(ka, p.rx, p.ry, z0, o); E.drawSprite(kb, p.rx, p.ry, z0, o);
    this.n.drawn += 2;
    return true;
  }
  // every frame of a looping pose (stride, idle, carry...) at this heading, asked for ahead
  _cycle(A2, ppose, d8, wpn, prio) {
    const Pd = this.Pd, n = (Pd.PED_POSES && Pd.PED_POSES[ppose]) || 1;
    if (n < 2 || n > 8) return;
    for (let i = 0; i < n; i++) this._ask('peds', 'ped', Pd.pedKey(A2, ppose, d8, i, wpn), [A2, ppose, d8, i, wpn], prio);
  }
  // an open umbrella: a shallow dome of 8 panels in its colour, scalloped between the rib tips, darker ribs and rim, the
  // tip on top (sampled at quarter pixels, keeping the highest point per pixel, so the near slope has no gaps)
  _genUmbrella(i) {
    return this._conv(`gumb|${i}`, () => {
      const cols = this.api.UMBRELLA_COLORS || ['#c8262b'], base = rgbOf(cols[i] || cols[0]);
      const R = 13, H = 6, w = R * 2 + 1, h = R * 2 + H + 3, ax = R, ay = R + H + 1, PAN = Math.PI / 4;
      const G = gbuf(w, h, ax, ay);
      for (let Y = -R; Y <= R; Y += 0.25) for (let X = -R; X <= R; X += 0.25) {
        const a = Math.atan2(Y, X) + Math.PI, f = (a / PAN) % 1, edge = R * (0.93 + 0.07 * Math.abs(Math.cos(f * Math.PI)));   // scallops: the rim dips between rib tips
        const r = Math.hypot(X, Y);
        if (r > edge) continue;
        const r2 = (r * r) / (R * R), Z = H * (1 - r2), sx = Math.floor(X + ax + 0.5), sy = Math.floor(Y - Z + ay + 0.5), zz = Math.round(Z) + 1;
        if (sx < 0 || sy < 0 || sx >= w || sy >= h) continue;
        const ii = sy * w + sx;
        if (G.col[ii * 4 + 3] && G.z[ii] >= zz) continue;
        const rib = Math.min(f, 1 - f) * r < 0.45 && r > 2, rim = r > edge - 1.3, panel = Math.floor(a / PAN) & 1;
        const k = rib ? 0.62 : rim ? 0.66 : panel ? 0.86 : 1;
        const nx = 2 * H * X / (R * R), ny = 2 * H * Y / (R * R), nl = Math.hypot(nx, ny, 1);
        put(G, sx, sy, [base[0] * k, base[1] * k, base[2] * k], zz, [128 + nx / nl * 127, 128 + ny / nl * 127, 128 + 127 / nl, 255]);
      }
      put(G, ax, ay - H - 2, [40, 40, 44], H + 3); put(G, ax, ay - H - 1, [40, 40, 44], H + 2); // the tip
      return G;
    }, true);
  }

  // ---- animals, vehicles, trains, small things ------------------------------------------------------------------
  _pet(p, now) {
    const A = this.A, E = this.E;
    if (!A || !A.animalKey) return;
    const kind = p.d.ar.slice(4), base = kind.split(':')[0], sp = p.as || 0, still = now - (p.stillSince ?? now) > 1.2;
    const S2 = SPECIES[base];
    // a wild animal: what it's doing comes from the server (fauna.js APOSE in the extra byte; bit 7 in the water);
    // a pet or a farm animal: standing still a while it sits, or puts its head down and grazes (now and then looking
    // up); down or dead: lying on its side
    const pose = S2 ? wildPose(p, S2, base, sp)
      : p.flags & (PF.DEAD | PF.DOWN) ? 'lie' : sp > 70 ? 'run' : sp > 12 ? 'walk' : !still ? 'idle'
        : GRAZERS.has(kind) ? ((Math.floor(now / 3.3) + p.id) % 4 ? 'graze' : 'idle') : WILD_IDLE.has(kind) ? 'idle' : 'sit';
    const n = (A.ANIMAL_FRAMES && A.ANIMAL_FRAMES[pose]) || 1, d8 = dir8(p.ra);
    // cut in two by the plasma blade: the carcass in two halves, the cut edges seared (actors.js 'cutA' / 'cutB')
    if ((p.flags & PF.DEAD) && p.deadK === 'halved' && A.ANIMAL_FRAMES && A.ANIMAL_FRAMES.cutA) {
      const ka = this._spr('actors', 'animal', A.animalKey(kind, 'cutA', d8, 0), [kind, 'cutA', d8, 0]);
      const kb = this._spr('actors', 'animal', A.animalKey(kind, 'cutB', d8, 0), [kind, 'cutB', d8, 0]);
      if (ka && kb) {
        const o = this.opts; o.alpha = 1; o.flash = 0; o.xray = false; o.shadow = true; o.tint = null; o.flipX = false; o.air = false;
        const z0 = this._z0(p, false);
        E.drawSprite(ka, p.rx, p.ry, z0, o); E.drawSprite(kb, p.rx, p.ry, z0, o); this.n.drawn += 2;
        return;
      }
    }
    const rate = pose === 'run' ? 14 : pose === 'fly' ? (S2 && S2.size === 'medium' ? 7 : 11) : pose === 'walk' ? 8 : pose === 'stalk' ? 5 : pose === 'idle' ? 3 : pose === 'swim' ? 2.5 : 1.5;
    const fr = pose === 'dead' || (pose === 'lie' && p.flags & PF.DEAD) ? 0 : Math.floor(now * rate + p.id) % n;
    let sk = this._spr('actors', 'animal', A.animalKey(kind, pose, d8, fr), [kind, pose, d8, fr]);
    if (!sk) sk = p._v2k && E.hasSprite(p._v2k) ? p._v2k : null;
    if (pose !== p._cp || d8 !== p._cd) { p._cp = pose; p._cd = d8; for (let i = 0; i < n; i++) this._ask('actors', 'animal', A.animalKey(kind, pose, d8, i), [kind, pose, d8, i], 0); }
    if (!sk) return;
    p._v2k = sk;
    const o = this.opts; o.alpha = 1; o.flash = 0; o.xray = false; o.shadow = true; o.tint = null; o.flipX = false;
    // up in the air (a bird in flight: its shadow on the ground below), or up a trunk (a squirrel)
    const up = pose === 'fly' ? 34 + Math.sin(now * 2.3 + p.id) * 5 : pose === 'climb' ? 16 : 0;
    o.air = pose === 'fly';
    if (p.hitAt !== undefined && now - p.hitAt < 0.12) o.flash = 0.6;   // (hit: a white flash, like people)
    E.drawSprite(sk, p.rx, p.ry, this._z0(p, false) + up, o); this.n.drawn++;
    o.air = false;
  }

  // a vehicle: the actors provider's model at heading hi of N (by tier), its lights, brakes, siren, wreck;
  // the headings either side are asked for whenever it turns (yours sooner), and the siren's other flash
  _veh(v, now, me) {
    const def = VEHICLE_BY_INDEX[v.d.m], A = this.A;
    if (!def || !A || !A.vehicleKey || !A.vehState) return;
    const E = this.E, api = this.api, f = v.flags, N = this.tier.N;
    const sinking = def.kind !== 'boat' && WATER_T[this.map.tileAtPx(v.rx, v.ry)] === 1, sk = Math.min(1, (v.sinkT || 0) / 3);
    const hi = quant(v.ra, N), phase = Math.floor(now * 6) % 2 ? 1 : 2, st = A.vehState(f, phase);
    let use = this._spr('actors', 'vehicle', A.vehicleKey(v.d, st, hi, N), [v.d, st, hi, N]);
    if (!use && v._v2k && E.hasSprite(v._v2k)) use = v._v2k;
    if (!use) use = this._near((h) => A.vehicleKey(v.d, st, h, N), hi, N);
    if (v._hi !== hi || v._hn !== N || v._hf !== f) {
      v._hi = hi; v._hn = N; v._hf = f;
      for (let d = -1; d <= 1; d += 2) { const h = (hi + d + N) % N; this._ask('actors', 'vehicle', A.vehicleKey(v.d, st, h, N), [v.d, st, h, N], me ? -2 : 1); }
      if (f & VF.SIREN) { const s2 = A.vehState(f, 3 - phase); this._ask('actors', 'vehicle', A.vehicleKey(v.d, s2, hi, N), [v.d, s2, hi, N], me ? -2 : 0); }
    }
    // A ferry swings through heading after heading on every trip, and the car ferry's take a while to draw: once one is
    // near, all its headings are asked for, a few a frame and the nearest first, so a turn doesn't show an old heading
    if (def.ferry && v._allF !== (f & 1) + N * 2) { v._allF = (f & 1) + N * 2; v._allN = 0; }   // (its lights on at night: another set)
    if (def.ferry && (v._allN | 0) < N) {
      for (let n = 0; n < 3 && (v._allN | 0) < N && this.sprOut < this.tier.sprJobs >> 1; n++) {
        const k = v._allN | 0, h = (hi + ((k + 1) >> 1) * (k & 1 ? 1 : -1) + 2 * N) % N;
        this._ask('actors', 'vehicle', A.vehicleKey(v.d, st, h, N), [v.d, st, h, N], 3);
        v._allN = k + 1;
      }
    }
    if (!use) return;
    v._v2k = use;
    const o = this.opts;
    o.alpha = sinking ? 1 - 0.75 * sk : 1; o.flash = 0; o.xray = !!me; o.flipX = false; o.shadow = !sinking; o.tint = null;
    if (v.blinkUntil > now) o.alpha *= Math.floor(now * 10) % 2 ? 0.25 : 1;
    const lean = def.kind === 'boat' ? 0 : -(v.lean || 0) * (def.kind === 'bike' ? 2.5 : 1.6);
    const z0 = this._z0(v, def.kind === 'boat') - (sinking ? sk * 8 : 0);
    // a moving boat: its foam under the hull (bow collar, churned stern, the V close behind) and wake points
    // dropped for the trail that spreads and fades behind it (_wakeTrail)
    if (def.kind === 'boat' && A.wakeKey && !sinking) {
      const b = v.buf, sp = b && b.length > 1 ? Math.hypot(b[b.length - 1].x - b[b.length - 2].x, b[b.length - 1].y - b[b.length - 2].y) * 20 : 0;
      if (sp > 40) {
        const fr = Math.floor(now * 8) & 3, wk = this._spr('actors', 'wake', A.wakeKey(v.d, hi, N, fr), [v.d, hi, N, fr]);
        if (wk) { const wo = this.wakeO || (this.wakeO = {}); wo.alpha = Math.min(1, sp / 220); wo.shadow = false; wo.flash = 0; wo.xray = false; wo.flipX = false; wo.tint = null; E.drawSprite(wk, v.rx, v.ry, 0, wo); }
        if (now - (v._wkT || 0) > 0.09) { v._wkT = now; this._wakeDrop(v.rx - Math.cos(v.ra) * def.L * 0.45, v.ry - Math.sin(v.ra) * def.L * 0.45, v.ra, now, def.W * 0.5, sp); }
      }
    }
    // a boat (or a swimmer) part-way under a bridge: the deck over it hides it (o.under caps its depth below a deck's)
    const under = def.kind === 'boat' && this._underDeck(v.rx, v.ry, v.ra, def.L);
    o.under = under ? UNDER_Z : 0;
    E.drawSprite(use, v.rx - Math.sin(v.ra) * lean, v.ry, Math.max(0, z0), o);
    o.under = 0;
    this.n.drawn++;
    // riders on bikes and jet skis sit in the open
    const Pd = this.Pd;
    if ((def.kind === 'bike' || def.id === 'jetski') && Pd && Pd.pedKey) {
      const seats = def.kind === 'bike' ? api.SEAT_BIKE : api.SEAT_JETSKI, myPed = this.S.myPedId;
      for (const p of this.S.ents.values()) {
        if (p.kind !== K.PED || p.parent !== v.id || !p.d || (p.flags & PF.DEAD)) continue;
        const pass = (p.flags & PF.PASSENGER) !== 0, seat = !pass && def.seat !== undefined ? [def.seat, 0] : seats[pass ? 1 : 0];   // (a bicycle: where its saddle is)
        const c = Math.cos(v.ra), s = Math.sin(v.ra), x = v.rx + c * seat[0] - s * seat[1], y = v.ry + s * seat[0] + c * seat[1];
        const d8 = dir8(v.ra), pose = def.pedal ? 'pedal' : 'ride', A2 = this._app(p.d.app || {}, p.d.ar);
        const fr = pose === 'pedal' && (p.as || 0) > 20 ? Math.floor(p.phase || 0) % 4 : 0, wpn = p.extra | 0;
        const was = this.sprPrio;
        if (p.id === myPed) this.sprPrio = -3;
        let rk = this._spr('peds', 'ped', Pd.pedKey(A2, pose, d8, fr, wpn), [A2, pose, d8, fr, wpn]);
        this.sprPrio = was;
        if (!rk) rk = p._v2r && E.hasSprite(p._v2r) ? p._v2r : null;
        if (!rk) continue;
        p._v2r = rk;
        o.xray = false; o.alpha = 1;   // (a rider sits in the open: no see-through outline through the bike)
        o.under = under ? UNDER_Z : 0;   // (a jet ski under a bridge: its rider too)
        E.drawSprite(rk, x, y, Math.max(0, z0), o);
        o.under = 0;
      }
    }
  }

  _train(c, now, myTrain) {
    const def = TRAIN_CARS[c.d.c], A = this.A;
    if (!def || !A || !A.trainKey) return;
    const inside = c.d.tr === myTrain, N = this.tier.N;
    const mode = `${inside ? 'in' : 'roof'}${c.flags & 8 ? '-lit' : ''}${c.flags & 16 ? '-empty' : ''}`;
    const hi = quant(c.ra, N);
    let sk = this._spr('actors', 'train', A.trainKey(c.d.c, mode, hi, N), [c.d.c, mode, hi, N]);
    if (!sk && c._v2k && this.E.hasSprite(c._v2k)) sk = c._v2k;
    if (!sk) sk = this._near((h) => A.trainKey(c.d.c, mode, h, N), hi, N);
    if (c._hi !== hi || c._hm !== mode) {
      c._hi = hi; c._hm = mode;
      for (let d = -1; d <= 1; d += 2) { const h = (hi + d + N) % N; this._ask('actors', 'train', A.trainKey(c.d.c, mode, h, N), [c.d.c, mode, h, N], 1); }
    }
    if (!sk) return;
    c._v2k = sk;
    const o = this.opts; o.alpha = 1; o.flash = 0; o.xray = false; o.shadow = true; o.tint = null; o.flipX = false;
    this.E.drawSprite(sk, c.rx, c.ry, 0, o); this.n.drawn++;
  }

  // ---- the rides (shared/rides.js) -------------------------------------------------------------------------------
  // The Ferris wheel's sixteen gondolas going round on the world's loop clock (the wheel is baked without them; your
  // own cab glows a little while you ride it), and every balloon flight under way, from its route and how long it
  // has been up (main.js keeps S.rides from the server's broadcasts): it fades in as it fills on the field and out
  // as it empties after touch-down. The burners light up the night (_lights). And the sliders at Splash Canyon: up the
  // tower's stair, then down their slide on their backs, feet first (_slider).
  _rides(F, now) {
    const A = this.A, S = this.S, E = this.E, lit = this.balLit || (this.balLit = []);
    lit.length = 0;
    if (!A || !A.rideKey) return;
    const o = this.opts;
    o.flipX = false; o.tint = null; o.xray = false; o.shadow = true; o.alpha = 1;
    const wheel = ferrisSite(this.map);
    if (wheel && wheel.x > this.vx0 - 240 && wheel.x < this.vx1 + 240 && wheel.y > this.vy0 - 60 && wheel.y < this.vy1 + 400) {
      const t = S.loopTime || 0, mine = S.me && S.me.ride && S.me.ride.k === 'ferris' ? S.me.ride.cab : -1, c = this._cab || (this._cab = {});
      for (let k = 0; k < FERRIS.n; k++) {
        const col = k % FERRIS.cols, key = this._spr('actors', 'ride', A.rideKey('cab', col), ['cab', col]);
        if (!key) continue;
        ferrisCab(wheel, k, t, c);
        o.flash = k === mine ? 0.16 + 0.1 * Math.sin(now * 4) : 0; o.air = false;
        E.drawSprite(key, c.x, c.y, c.z, o); this.n.drawn++;
      }
    }
    if (S.rides && S.rides.size) {
      const routes = balloonRoutes(this.map), at = this._bal || (this._bal = {}), clock = performance.now() / 1000;
      for (const R of S.rides.values()) {
        if (R.k === 'slide') { this._slider(R, clock - R.at, now); continue; }
        const route = R.k === 'balloon' ? routes[R.r] : null;
        if (!route) continue;
        const t = clock - R.at;
        if (t < 0 || t > R.d + 2.5) continue;
        balloonAt(route, Math.min(t, R.d), R.d, at);
        if (at.x < this.vx0 - 200 || at.x > this.vx1 + 200 || at.y - at.z < this.vy0 - 560 || at.y - at.z > this.vy1 + 220) continue;
        const key = this._spr('actors', 'ride', A.rideKey('balloon', R.pal), ['balloon', R.pal]);
        if (!key) continue;
        o.alpha = Math.max(0, Math.min(1, t / 2.5, (R.d + 2.5 - t) / 2.5)); o.flash = 0; o.air = at.z > 24;
        if (o.alpha <= 0) continue;
        E.drawSprite(key, at.x, at.y, at.z, o); this.n.drawn++;
        lit.push(at.x, at.y, at.z, o.alpha);
      }
    }
    o.alpha = 1; o.flash = 0; o.air = false;
  }
  // Someone on a water slide t seconds after boarding (their entity is hidden while they ride: they're drawn from
  // the ride, in the looks it brought): walking up the tower's stair and along its top deck, then lying back in
  // the flume, feet first, on the way down - out of sight inside the tube (you see yourself through it).
  _slider(R, t, now) {
    const site = slideSite(this.map), Pd = this.Pd, S = this.S;
    if (!site || !Pd || !Pd.pedKey || t < 0 || t >= R.d) return;
    const at = slideRider(site, R.sl, t, this._sld || (this._sld = {})), mine = R.ped === S.myPedId;
    if (at.x < this.vx0 - 80 || at.x > this.vx1 + 80 || at.y - at.z < this.vy0 - 80 || at.y - at.z > this.vy1 + 80) return;
    const sl = site.slides[R.sl], tube = at.phase === 1 && sl.kind === 'tube' && at.at > 0.01 && at.at < 0.99;
    if (tube && !mine) return;
    const A2 = this._app(R.app || {}, R.ar), d8 = dir8(at.a), climbing = at.phase === 0;
    const ppose = climbing ? 'walk0' : 'downB', pf = climbing ? Pd.pedFrame('walk0', Math.floor(at.dist / 4.6)) : 0;
    this.sprPrio = mine ? -3 : -1;
    const sk = this._spr('peds', 'ped', Pd.pedKey(A2, ppose, d8, pf, 0), [A2, ppose, d8, pf, 0]);
    if (climbing && (R._cd !== d8 || R._ca !== A2)) { R._cd = d8; R._ca = A2; this._cycle(A2, ppose, d8, 0, mine ? -2 : 0); }
    this.sprPrio = -1;
    if (!sk) return;
    const o = this.opts;
    o.alpha = 1; o.flash = 0; o.xray = mine; o.flipX = false; o.shadow = true; o.tint = null; o.air = false;
    this.E.drawSprite(sk, at.x, at.y, at.z + (climbing ? 1 : tube ? 3 : 2), o); this.n.drawn++;
    o.xray = false;
  }

  // ---- foraging (shared/foraging.js) ---------------------------------------------------------------------------
  // The mushrooms on the redwood floor and the tidepools' golden stars, where they grow, while they're there (the
  // server says which spots are picked bare: S.forageGone). The glowing ones light up the dark round them (_lights).
  _forage(F) {
    const list = this.map.forage, A = this.A, lit = this.fgLit || (this.fgLit = []);
    lit.length = 0;
    if (!list || !list.length || !A || !A.forageKey) return;
    let g = this._fgrid;
    if (!g) { g = this._fgrid = new Map(); list.forEach((f, i) => { const k = Math.floor(f.y / 512) * 4096 + Math.floor(f.x / 512); let a = g.get(k); if (!a) g.set(k, (a = [])); a.push(i); }); }
    const gone = this.S.forageGone, o = this.opts;
    o.alpha = 1; o.flash = 0; o.xray = false; o.shadow = true; o.tint = null; o.flipX = false; o.air = false;
    for (let cy = Math.floor((this.vy0 - 40) / 512); cy <= Math.floor((this.vy1 + 60) / 512); cy++) for (let cx = Math.floor((this.vx0 - 40) / 512); cx <= Math.floor((this.vx1 + 40) / 512); cx++) {
      for (const i of g.get(cy * 4096 + cx) || []) {
        const f = list[i], K = FORAGE_KINDS[f.k];
        if (!K || (gone && gone.has(i)) || f.x < this.vx0 - 30 || f.x > this.vx1 + 30 || f.y < this.vy0 - 10 || f.y > this.vy1 + 40) continue;
        const v = i & 3, key = this._spr('actors', 'forage', A.forageKey(K.art, v), [K.art, v]);
        if (K.glow) lit.push(f.x, f.y, K.glow);
        if (!key) continue;
        this.E.drawSprite(key, f.x, f.y, this._gz(f.x, f.y), o); this.n.drawn++;
      }
    }
    void F;
  }

  _small(kind, key, args, e, x, y, z0) {
    let sk = this._spr('actors', kind, key, args);
    if (!sk) sk = e._v2k && this.E.hasSprite(e._v2k) ? e._v2k : null;
    if (!sk) return;
    e._v2k = sk;
    const o = this.opts; o.alpha = 1; o.flash = 0; o.xray = false; o.shadow = true; o.tint = null; o.flipX = false;
    this.E.drawSprite(sk, x, y, z0, o); this.n.drawn++;
  }

  // ---- the moving things on screen -------------------------------------------------------------------------
  _entities(F) {
    const S = this.S, now = F.now, A = this.A && this.A.crateKey ? this.A : null;
    this.opts = this.opts || { alpha: 1, flipX: false, flash: 0, xray: false, shadow: true, tint: null };
    const meVeh = S.pred && S.pred.kind === 'veh' ? S.ctrlId : -1;
    for (const v of F.vehs) { this.sprPrio = v.id === meVeh ? -3 : -1; this._veh(v, now, v.id === meVeh); }
    for (const p of F.peds) { this.sprPrio = p.id === S.myPedId ? -3 : -1; this._ped(p, now, p.id === S.myPedId, F); }
    for (const p of F.riders) { this.sprPrio = p.id === S.myPedId ? -3 : -1; this._ped(p, now, p.id === S.myPedId, F, 8); }
    this.sprPrio = -1;
    for (const c of F.cars) this._train(c, now, F.myTrain);
    this._rides(F, now);
    this._forage(F);
    if (A) {
      for (const c of F.crates) {
        const st = c.flags & 3;
        let lift = st === 0 ? c.hp * 64 : st === 1 ? 26 : 0;
        if (st === 2) { const par = S.ents.get(c.parent), pd = par && par.d ? VEHICLE_BY_INDEX[par.d.m] : null; if (pd) lift = this.api.vehLift(pd) / 0.6 + 4; }
        const tier = c.d.t, label = c.d.l || '', hi = quant(c.ra || 0, 16);
        const par = st === 2 ? S.ents.get(c.parent) : null;
        this._small('crate', A.crateKey(tier, label, hi, 16), [tier, label, hi, 16], c, c.rx, c.ry, this._z0(par || c, false) + lift * 0.6);
      }
      for (const b of F.bags) {
        if ((b.flags & 1) && Math.floor(now * 5) % 2) continue;   // about to vanish: it blinks
        const hi = quant(b.ra || 0, 16); this._small('bag', A.bagKey(b.d.t, hi, 16), [b.d.t, hi, 16], b, b.rx, b.ry, this._z0(b, false));
      }
      for (const b of F.balls) { const t = b.d.t | 0, spin = quant(b.ra || 0, 4); this._small('ball', A.ballKey(t, spin), [t, spin], b, b.rx, b.ry, (b.extra || 0) * 2 + this._z0(b, false)); }
      for (const pr of F.projs) {
        const N = 32, hi = quant(pr.ra, N), w = pr.d.w | 0;
        if (!this.projWarm.has(w)) { this.projWarm.add(w); for (let h = 0; h < N; h++) this.warmQ.unshift(['actors', 'proj', A.projKey(w, h, N), [w, h, N], -1]); }
        this._small('proj', A.projKey(w, hi, N), [w, hi, N], pr, pr.rx, pr.ry, 14 + ((pr.rz || 0) > 0.01 ? DECK_Z * pr.rz : 0));
      }
      // your arrows lying where they came down (me.arrows: walk over one to pick it up), on the ground
      const ma = S.me && S.me.arrows;
      if (ma) {
        this._arrowE ||= [];
        ma.forEach(([x, y, a], i) => { const N = 32, hi = quant(a, N), e = this._arrowE[i] || (this._arrowE[i] = {}); this._small('proj', A.projKey(24, hi, N), [24, hi, N], e, x, y, -12); });
      }
    }
    // the birds (simulated in main.js): the providers' pigeons and gulls, flapping when they fly
    if (A && A.critterKey && A.critterInfo) for (const b of this.api.birds) {
      const kind = b.gull ? 'seagull' : 'pigeon', info = this.critInfo[kind] || (this.critInfo[kind] = A.critterInfo(kind) || { frames: 1, fps: 10 });
      const nf = info.frames || 1, fps = info.fps || 10, air = info.air || [0, nf - 1], ground = info.ground ? info.ground[0] : 0;
      // (frames: the ground pose, the take-off frame, then the flight cycle)
      const fr = !b.fly ? ground : b.fly < 0.12 && info.takeoff !== undefined ? info.takeoff : air[0] + Math.floor(b.fly * fps) % (air[1] - air[0] + 1);
      const left = Math.cos(b.a) < 0;
      let k = this._spr('actors', 'critter', A.critterKey(kind, fr, left), [kind, fr, left]);
      if (!k) k = b._v2k && this.E.hasSprite(b._v2k) ? b._v2k : null;
      if (!k) continue;
      b._v2k = k;
      // flying: well up in the air (its shadow, when the sun reaches that far, falls well away from it) and no
      // mirror image in wet streets or water
      const o = this.opts; o.alpha = 1; o.xray = false; o.flash = 0; o.shadow = true; o.tint = null; o.flipX = false; o.air = !!b.fly;
      this.E.drawSprite(k, b.x, b.y, b.fly ? Math.min(140, 10 + b.fly * 55) : 0, o);
    }
    this.opts.air = false;
    // muzzle flashes (S.flashes, lit in _lights): the providers' flash sprite along the shot
    if (A && A.muzzleKey) for (const f of S.flashes) {
      if (f.kind === 'boom' || f.a === undefined) continue;
      const hi = quant(f.a, 16), frm = f.t > 0.045 ? 0 : f.t > 0.02 ? 1 : 2;
      const k = this._spr('actors', 'muzzle', A.muzzleKey(1, hi, 16, frm), [1, hi, 16, frm]);
      if (k) { const o = this.opts; o.alpha = 1; o.flash = 0; o.xray = false; o.shadow = false; o.tint = null; o.flipX = false; this.E.drawSprite(k, f.x, f.y, 18, o); }
    }
  }

  // ---- getting sprites ready before they are needed ---------------------------------------------------------------
  // Everything the server has sent that isn't on screen yet (within a ring round the view) has its sprite
  // asked for now - every few frames each, a few asks a frame - so it is there when it comes into view. The
  // queue of things asked for ahead (warmQ: the little sprites everyone sees, rockets once one is fired) goes
  // out while there is room.
  _prefetch(F) {
    const pool = this.pool;
    if (!pool || pool.dead || !pool.ready) return;
    if (!this.warmed && this.prov.actors && this.A) this._warm();
    const q = this.warmQ;
    for (let n = 4; q.length && n > 0;) {
      const it = q[0], key = it[2];
      if (this.E.hasSprite(key) || this.upQ.has(key) || this.badKeys.has(key) || pool.has('s' + key)) { q.shift(); continue; }
      if (!this._ask(it[0], it[1], key, it[3], it[4])) break; // (no room for more jobs yet)
      q.shift(); n--;
    }
    const S = this.S, now = F.now, A = this.A, Pd = this.Pd, fn = this.frameNo || 0;
    const x0 = this.vx0 - 520, x1 = this.vx1 + 520, y0 = this.vy0 - 520, y1 = this.vy1 + 520;
    const ox0 = this.vx0 - 60, ox1 = this.vx1 + 60, oy0 = this.vy0 - 100, oy1 = this.vy1 + 100;
    let budget = 8;
    for (const e of S.ents.values()) {
      if (budget <= 0) break;
      if (!e.d || (e.id + fn) % 6 || e.rx === undefined || e.rx < x0 || e.rx > x1 || e.ry < y0 || e.ry > y1) continue;
      if (e.rx > ox0 && e.rx < ox1 && e.ry > oy0 && e.ry < oy1) continue; // (on screen: drawn, so already asked)
      const prio = 2 + Math.hypot(e.rx - this.camX, e.ry - this.camY) / 1000;
      if (e.kind === K.PED && Pd && Pd.pedKey) {
        if ((e.flags & PF.INVEH) || e.blink === 3) continue;
        if (e.d.ar && e.d.ar.startsWith('pet:')) {
          if (!A || !A.animalKey) continue;
          const kind = e.d.ar.slice(4), d8 = dir8(e.ra), pose = (e.as || 0) > 12 ? 'walk' : 'idle';
          if (this._ask('actors', 'animal', A.animalKey(kind, pose, d8, 0), [kind, pose, d8, 0], prio)) budget--;
          continue;
        }
        const L = this.api.pedLook(e, now), pose = L.pose;
        if (!L.upright && !L.swimming) continue;
        const ppose = L.swimming ? 'swim' : pose === 'move' ? 'walk' + L.lvl : pose, d8 = dir8(e.ra), A2 = this._app(e.d.app || {}, e.d.ar);
        const wpn = (e.extra | 0) || (e.d.fl ? 'flashlight' : 0), pf = Pd.pedFrame(ppose, L.fr);
        if (this._ask('peds', 'ped', Pd.pedKey(A2, ppose, d8, pf, wpn), [A2, ppose, d8, pf, wpn], prio)) budget--;
      } else if (e.kind === K.VEH && A && A.vehicleKey && A.vehState) {
        const N = this.tier.N, hi = quant(e.ra || 0, N), st = A.vehState(e.flags, 1);
        if (this._ask('actors', 'vehicle', A.vehicleKey(e.d, st, hi, N), [e.d, st, hi, N], prio)) budget--;
      } else if (e.kind === K.TRAIN && A && A.trainKey && TRAIN_CARS[e.d.c]) {
        const N = this.tier.N, hi = quant(e.ra || 0, N), mode = `roof${e.flags & 8 ? '-lit' : ''}${e.flags & 16 ? '-empty' : ''}`;
        if (this._ask('actors', 'train', A.trainKey(e.d.c, mode, hi, N), [e.d.c, mode, hi, N], prio)) budget--;
      } else if (e.kind === K.CRATE && A && A.crateKey) {
        const hi = quant(e.ra || 0, 16), label = e.d.l || '';
        if (this._ask('actors', 'crate', A.crateKey(e.d.t, label, hi, 16), [e.d.t, label, hi, 16], prio)) budget--;
      } else if (e.kind === K.BAG && A && A.bagKey) {
        const hi = quant(e.ra || 0, 16);
        if (this._ask('actors', 'bag', A.bagKey(e.d.t, hi, 16), [e.d.t, hi, 16], prio)) budget--;
      }
    }
  }
  // once the workers are up: the sprites of the little things everyone sees, asked for a few a frame - the
  // pooled particles and decals (their art2 sets), muzzle flashes, pigeons and gulls, balls
  _warm() {
    this.warmed = true;
    const A = this.A, q = this.warmQ, P = 6;
    if (A.fxKey && A.fxInfo && A.FX_FOR_V1) {
      const names = new Set(['pSmokeDark', 'pSteam', 'pLeaf', 'pLeafAutumn', 'pPaper', 'dOil']);
      for (const t of Object.values(A.FX_FOR_V1.particle || {})) names.add(t.name);
      for (const t of Object.values(A.FX_FOR_V1.decal || {})) names.add(t.name);
      for (const n of names) { const inf = A.fxInfo(n); if (inf) for (let f = 0; f < inf.frames; f++) q.push(['actors', 'fx', A.fxKey(n, f), [n, f], P]); }
    }
    if (A.muzzleKey) for (let f = 0; f < 3; f++) for (let hi = 0; hi < 16; hi++) q.push(['actors', 'muzzle', A.muzzleKey(1, hi, 16, f), [1, hi, 16, f], P + 1]);
    if (A.critterKey && A.critterInfo) for (const kind of ['pigeon', 'seagull']) { const inf = A.critterInfo(kind); if (inf) for (let f = 0; f < inf.frames; f++) for (const l of [false, true]) q.push(['actors', 'critter', A.critterKey(kind, f, l), [kind, f, l], P]); }
    if (A.ballKey) for (const t of [0, 1, 2, 3]) for (let s = 0; s < 4; s++) q.push(['actors', 'ball', A.ballKey(t, s), [t, s], P + 1]);
  }
  _fx(name) { let i = this.fxInf[name]; if (i === undefined) i = this.fxInf[name] = (this.A && this.A.fxInfo ? this.A.fxInfo(name) : null) || null; return i; }
  _z0(e, water) {
    if ((e.rz || 0) > 0.01) return DECK_Z * e.rz;
    if (water) return 0;
    return this._gz(e.rx, e.ry);
  }
  _gz(x, y) { const z = groundZ(this.ghOf, x, y); return z > 4 ? z : 0; } // (kerbs and sidewalks: the engine lets feet through 4 px of ground)

  // ---- the live parts of the static world ----------------------------------------------------------------------
  // Lit signal lenses (the junction's phase on the statics' heads; heads whose lenses face away only light up
  // the street), level crossing barrier arms on their posts (raised, lowering while a train comes, the red
  // lamps flashing), sliding gates rolled aside as far as they are open, and police spike strips (decals).
  _furniture(F) {
    const S = this.S, M = this.map, E = this.E, o = this.opts, now = F.now;
    const x0 = this.vx0 - 120, x1 = this.vx1 + 120, y0 = this.vy0 - 40, y1 = this.vy1 + 160;
    o.alpha = 1; o.flash = 0; o.xray = false; o.flipX = false; o.tint = null; o.shadow = false;
    const heads = this.liveHeads; heads.length = 0; this.nfL = 0;
    for (const [k, st] of this.chunkState) {
      const lv = st.live;
      if (!lv || !lv.heads.length) continue;
      const cx = k % 1000, cy = Math.floor(k / 1000);
      if ((cx + 1) * CHUNK < x0 || cx * CHUNK > x1 || (cy + 1) * CHUNK < y0 || cy * CHUNK > y1) continue;
      for (const h of lv.heads) {
        if (h.x < x0 || h.x > x1 || h.y < y0 || h.y > y1) continue;
        const pr = h.pi >= 0 ? M.props[h.pi] : null, n = M.nodes[h.node];
        if ((pr && pr.broken) || !n) continue;
        const s = signalFor(n, h.edge, S.loopTime), i = s === 'R' ? 0 : s === 'Y' ? 1 : 2;
        heads.push(h, i);
        if (h.ny < 0.25) continue;
        const c = h.L[i], key = this._genLamp(i);
        if (key) E.drawSprite(key, c[0], c[1], c[2] - 2, o);
      }
    }
    // level crossings (v1's arm pivots, beside the statics' crossbuck posts)
    const xs = (M.rail && M.rail.crossings) || [];
    for (let i = 0; i < xs.length; i++) {
      const c = xs[i];
      if (c.x < x0 - 160 || c.x > x1 + 160 || c.y < y0 - 160 || c.y > y1 + 160) continue;
      const st = (S.xing && S.xing[i]) || XING0, anim = Math.max(0, Math.min(1, (S.xingAnim && S.xingAnim[i]) || 0)), down = !!st.d;
      const tx = Math.cos(c.a || 0), ty = Math.sin(c.a || 0), rx = -ty, ry = tx, hw = c.hw || 40;
      const flash = Math.floor(now * 3) % 2;
      for (let side = 0; side < 2; side++) {
        const sg = side ? -1 : 1;
        const px = c.x + rx * sg * CROSSING_ARM + tx * sg * (hw + 6), py = c.y + ry * sg * CROSSING_ARM + ty * sg * (hw + 6), gz = this._gz(px, py);
        o.shadow = true;
        const post = this._genXPost();
        if (post) E.drawSprite(post, px, py, gz, o);
        if (!(st.b && st.b[side])) { // (an arm knocked off is gone)
          const arm = this._genXArm(quant(Math.atan2(-ty * sg, -tx * sg), 16), Math.round(anim * 6), Math.max(8, Math.round((hw + 2) / 4) * 4));
          if (arm) E.drawSprite(arm, px, py, gz + XARM_Z, o);
        }
        if (down && (side ? !flash : flash)) { // the flashers, side to side
          o.shadow = false;
          const lk = this._genLamp(0);
          if (lk) E.drawSprite(lk, px, py + 2, gz + XPOST_H - 6, o);
          this._fLight(px, py + 4, gz + XPOST_H - 4, 90, SIG_RGB01[0], 1.6);
        }
      }
    }
    // sliding gates: the panel's visible part, from its leading edge to the far post
    const gates = M.gates || [];
    o.shadow = true;
    for (let i = 0; i < gates.length; i++) {
      const gt = gates[i];
      if (gt.club || gt.x < x0 - 200 || gt.x > x1 + 200 || gt.y < y0 - 200 || gt.y > y1 + 200) continue;
      const k = Math.max(0, Math.min(1, (S.gateAnim && S.gateAnim[i]) ?? (S.gateOpen && S.gateOpen[i] ? 1 : 0)));
      const vis = Math.round(gt.w * (1 - 0.92 * k) / 4) * 4;
      if (vis < 4) continue;
      const mid = gt.w / 2 - vis / 2, vert = !!gt.vertical, key = this._genGate(vert, vis, gt.rule === 'police');
      if (key) E.drawSprite(key, vert ? gt.x : gt.x + mid, vert ? gt.y + mid : gt.y, this._gz(gt.x, gt.y), o);
    }
    // police spike strips
    if (S.spikes && S.spikes.size) {
      const nowMs = performance.now();
      for (const s of S.spikes.values()) {
        if (nowMs > s.until || s.x < x0 || s.x > x1 || s.y < y0 || s.y > y1) continue;
        const key = this._genSpikes(Math.max(8, Math.round((s.half || 40) / 4) * 4));
        if (key) E.drawDecal(key, s.x, s.y, s.a || 0, 1, this._gz(s.x, s.y));
      }
    }
  }
  _fLight(x, y, z, r, col, k) {
    let L = this.fLights[this.nfL];
    if (!L) L = this.fLights[this.nfL] = { x: 0, y: 0, z: 0, r: 0, col: null, k: 0 };
    L.x = x; L.y = y; L.z = z; L.r = r; L.col = col; L.k = k;
    this.nfL++;
  }
  // a lit signal lens: an upright 3 x 4 face, glowing (anchor: its bottom row)
  _genLamp(i) {
    return this._conv(`glamp|${i}`, () => {
      const G = gbuf(3, 4, 1, 3);
      for (let y = 0; y < 4; y++) for (let x = 0; x < 3; x++) put(G, x, y, SIG_RGB[i], 4 - y, FACE_N, F_NOCAST, 255);
      return G;
    }, true);
  }
  // a crossing barrier's post: a dark pole with a pale cap
  _genXPost() {
    return this._conv('gxpost', () => {
      const H = XPOST_H, G = gbuf(3, H, 1, H - 1);
      for (let r = 0; r < H; r++) for (let x = 0; x < 3; x++) put(G, x, r, r < 2 ? [214, 214, 218] : x === 2 ? [52, 54, 62] : [88, 92, 102], H - 1 - r, r < 2 ? UP_N : FACE_N);
      return G;
    }, true);
  }
  // a barrier arm from its pivot, pointing ai/16 of a turn, lowered step/6 of a quarter turn (0 straight up,
  // 6 across the road), len px long, in red and white bands
  _genXArm(ai, step, len) {
    return this._conv(`gxarm|${ai}|${step}|${len}`, () => {
      const a = ai * TAU / 16, dx = Math.cos(a), dy = Math.sin(a), ph = step / 6 * Math.PI / 2, sp = Math.sin(ph), cp = Math.cos(ph);
      const ex = dx * len * sp, ey = dy * len * sp - len * cp; // the tip on screen, from the pivot
      const ax = Math.ceil(Math.max(0, -ex)) + 3, ay = Math.ceil(Math.max(0, -ey)) + 5;
      const G = gbuf(ax + Math.ceil(Math.max(0, ex)) + 4, ay + Math.ceil(Math.max(0, ey)) + 4, ax, ay), qx = -dy, qy = dx;
      for (let s = 0; s <= len; s += 0.5) {
        const band = s > 6 && Math.floor(s / 7) % 2 === 1, top = band ? [200, 38, 43] : [244, 244, 244], side = band ? [150, 28, 32] : [190, 190, 196];
        const gx = dx * s * sp, gy = dy * s * sp, z = s * cp;
        for (let t = -1.5; t <= 1.5; t += 0.5) for (let kz = 0; kz < 3; kz++) {
          const X = Math.round(ax + gx + qx * t), Y = Math.round(ay + gy + qy * t - z - kz), zz = Math.round(z + kz);
          if (X < 0 || Y < 0 || X >= G.w || Y >= G.h || (G.col[(Y * G.w + X) * 4 + 3] && G.z[Y * G.w + X] > zz)) continue; // (the topmost stays)
          put(G, X, Y, kz === 2 ? top : side, zz, kz === 2 ? UP_N : FACE_N);
        }
      }
      return G;
    }, true);
  }
  // a sliding gate panel with vis px of it showing (along x, or y when vertical): 8 px thick, 22 tall
  _genGate(vert, vis, police) {
    return this._conv(`ggate|${vert ? 1 : 0}|${vis}|${police ? 1 : 0}`, () => {
      const H = 22, gw = vert ? 8 : vis, gd = vert ? vis : 8;
      const base = police ? [216, 220, 228] : [90, 80, 72], mark = police ? [29, 58, 138] : [200, 38, 43], top = police ? [236, 238, 242] : [112, 102, 92];
      const G = gbuf(gw, gd + H + 1, gw >> 1, (gd >> 1) + H);
      const band = (u) => u % 24 >= 6 && u % 24 < 16;
      for (let y = 0; y < gd; y++) for (let x = 0; x < gw; x++) put(G, x, y, vert && band(y) && x > 1 && x < gw - 2 ? mark : top, H, UP_N);
      for (let r = 1; r <= H; r++) for (let x = 0; x < gw; x++) put(G, x, gd - 1 + r, !vert && band(x) && r > 3 && r < H - 3 ? mark : base, H - r, FACE_N);
      return G;
    }, true);
  }
  // a spike strip (v1's): a black band of steel teeth, yellow ends; a decal rotated with the strip
  _genSpikes(half) {
    return this._conv(`gspk|${half}`, () => {
      const w = half * 2 + 8, h = 18, [cv, g] = this._sized(0, w, h);
      g.translate(w / 2, h / 2);
      g.fillStyle = '#1c1e24'; g.fillRect(-half, -4, half * 2, 8);
      g.fillStyle = '#d8dde2';
      for (let x = -half + 4; x < half - 2; x += 7) { g.beginPath(); g.moveTo(x, -4); g.lineTo(x + 3, -8); g.lineTo(x + 6, -4); g.fill(); g.beginPath(); g.moveTo(x, 4); g.lineTo(x + 3, 8); g.lineTo(x + 6, 4); g.fill(); }
      g.fillStyle = '#f2c21b'; g.fillRect(-half - 3, -5, 4, 10); g.fillRect(half - 1, -5, 4, 10);
      return fromCanvas(cv, w / 2, h / 2, () => 0, UP_N, F_GROUND);
    }, true);
  }

  // ---- particles and decals ------------------------------------------------------------------------------------
  // The pooled particles (render/fx.js) drawn as the art2 effect frames (actors.js FX_FOR_V1 maps each
  // particle onto its set, the frame by its age). A frame not made yet is skipped (they are asked for as soon
  // as the workers start, so that is the first second at most).
  _particles(F) {
    const fx = F.fx, E = this.E, o = this.opts, A = this.A && this.A.fxKey && this.A.v1ParticleFx ? this.A : null;
    if (!A) return;
    const x0 = this.vx0 - 40, x1 = this.vx1 + 40, y0 = this.vy0 - 40, y1 = this.vy1 + 120;
    o.flash = 0; o.xray = false; o.shadow = false; o.tint = null; o.flipX = false;
    for (let i = 0; i < fx.p.length; i++) {
      const p = fx.p[i];
      if (!p.on || p.x < x0 || p.x > x1 || p.y < y0 || p.y > y1) continue;
      const k = p.life / p.max, name = A.v1ParticleFx(p), frm = A.v1ParticleFrame(p);
      const key = this._spr('actors', 'fx', A.fxKey(name, frm), [name, frm]);
      if (!key) continue;
      o.alpha = (p.type === 2 ? Math.min(1, (1 - k) * 6) * k * 0.9 + 0.1 : p.type === 3 ? Math.min(1, k * 1.5) : p.type === 8 ? 1 : Math.min(1, k * 2)) * (p.veil ?? 1);
      E.drawSprite(key, p.x, p.y, Math.max(0, p.z * (p.type === 8 ? 0.5 : 0.3)), o); // (v1's heights)
    }
    this._blown(F, o);
  }
  // What the wind carries, only in windy spells and gales (render/flora/wind.js: rare) - otherwise you see the
  // wind in the plants: leaves where trees grow (woods, parks, gardens, the country), now and then a sheet of
  // paper or a plastic bag in town, nothing over water, sand or desert. They blow in from the upwind side of
  // the view and tumble across it (a pool of 36).
  _blown(F, o) {
    const A = this.A, E = this.E, s = wind.strength, dt = Math.min(0.1, F.dt || 0.016);
    const B = this.blownPool || (this.blownPool = Array.from({ length: 36 }, () => ({ on: false, k: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, a: 0, life: 0 })));
    if (s > 0.45 && !F.sub && !F.spec) {
      this.blownAcc = (this.blownAcc || 0) + dt * (s - 0.45) * 12;
      for (; this.blownAcc >= 1; this.blownAcc -= 1) {
        const fromLeft = wind.dx >= 0, x = fromLeft ? this.vx0 - 20 : this.vx1 + 20, y = this.vy0 + Math.random() * (this.vy1 - this.vy0);
        const k = this._blownKind(x + (fromLeft ? 160 : -160), y);
        if (k < 0) continue;
        const b = B.find((q) => !q.on);
        if (!b) break;
        const sp = (k >= 2 ? 110 : 150) + s * 220;
        b.on = true; b.k = k; b.x = x; b.y = y; b.z = 8 + Math.random() * 30; b.life = 5 + Math.random() * 3; b.a = Math.random() * 6.28;
        b.vx = wind.dx * sp * (0.7 + Math.random() * 0.6); b.vy = wind.dy * sp * 0.4 + (Math.random() - 0.5) * 40;
      }
    }
    o.alpha = 1;
    for (const b of B) {
      if (!b.on) continue;
      b.life -= dt;
      if (b.life <= 0 || b.x < this.vx0 - 80 || b.x > this.vx1 + 80) { b.on = false; continue; }
      b.x += b.vx * dt; b.y += b.vy * dt + Math.sin(F.now * 3 + b.a) * 20 * dt; b.a += dt * (b.k === 3 ? 2.5 : 6);
      b.z = Math.max(2, b.z + Math.sin(F.now * 2 + b.a) * 10 * dt);
      const name = b.k === 0 ? 'pLeaf' : b.k === 1 ? 'pLeafAutumn' : 'pPaper', inf = this._fx(name), n = inf ? inf.frames : 1, frm = Math.floor(Math.abs(b.a) * 2) % n;
      const key = A && this._spr('actors', 'fx', A.fxKey(name, frm), [name, frm]);
      o.tint = b.k === 3 ? BAG_TINT : null;
      if (key) E.drawSprite(key, b.x, b.y, b.z * 0.3, o);
    }
    o.tint = null;
  }
  // 0 green leaves, 1 autumn leaves (where things grow), 2 a sheet of paper, 3 a plastic bag (in town, and only
  // a third as often), -1 nothing (water, sand, desert, bare ground)
  _blownKind(x, y) {
    const M = this.map, tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
    if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return -1;
    const i = ty * MAP_W + tx, t = M.tiles[i], st = (DISTRICTS[M.dist[i]] || {}).style;
    if (t === TT.WATER || t === TT.DEEP || t === TT.SAND || st === 'desert' || st === 'beach') return -1;
    if (TOWN.has(st)) return Math.random() < 0.33 ? (Math.random() < 0.3 ? 3 : 2) : -1;
    return t === TT.GRASS ? (Math.random() < 0.25 ? 1 : 0) : -1;
  }
  // ---- boat wakes ------------------------------------------------------------------------------------------
  // Each moving boat drops a wake point every ~0.1 s at its stern (a pooled ring of 320). A point draws two foam
  // streaks that spread outward from its track and fade over 3.6 s - the V a boat leaves behind it - and, for its
  // first second, the churned water of the stern. Flat foam decals on the water (the waves and glints stay).
  _wakeDrop(x, y, a, now, hw, sp) {
    const W = this.wakePts || (this.wakePts = { i: 0, n: 0, d: new Float32Array(320 * 6) });
    const j = W.i * 6;
    W.d[j] = x; W.d[j + 1] = y; W.d[j + 2] = a; W.d[j + 3] = now; W.d[j + 4] = hw; W.d[j + 5] = sp;
    W.i = (W.i + 1) % 320; W.n = Math.min(320, W.n + 1);
  }
  _wakeTrail(F) {
    const W = this.wakePts;
    if (!W || !W.n) return;
    const E = this.E, now = F.now, LIFE = 3.6, x0 = this.vx0 - 60, x1 = this.vx1 + 60, y0 = this.vy0 - 60, y1 = this.vy1 + 60;
    const streak = [this._genFoam(0), this._genFoam(1), this._genFoam(2)], churn = this._genFoam(3);
    for (let k = 0; k < W.n; k++) {
      const j = k * 6, age = now - W.d[j + 3];
      if (age < 0 || age > LIFE) continue;
      const x = W.d[j], y = W.d[j + 1];
      if (x < x0 || x > x1 || y < y0 || y > y1) continue;
      const a = W.d[j + 2], hw = W.d[j + 4], sp = W.d[j + 5], f = 1 - age / LIFE, alpha = Math.pow(f, 1.3) * Math.min(1, sp / 300) * 0.9;
      const spread = hw * 0.8 + age * (10 + sp * 0.035), nx = -Math.sin(a), ny = Math.cos(a);
      for (let s = -1; s <= 1; s += 2) {
        const key = streak[(k + (s > 0 ? 1 : 0)) % 3];
        if (key) E.drawDecal(key, x + nx * spread * s, y + ny * spread * s, a + s * 0.35, alpha, 0);
      }
      if (age < 1 && churn) E.drawDecal(churn, x, y, a, (1 - age) * alpha, 0);
    }
  }
  // foam: k 0-2 a streak along x (16 x 5), 3 the churned stern patch (24 x 14), white with blue-grey shading
  _genFoam(k) {
    return this._conv(`gfoam|${k}`, () => {
      const w = k < 3 ? 16 : 24, h = k < 3 ? 5 : 14, G = gbuf(w, h, w >> 1, h >> 1), rx = w / 2, ry = h / 2;
      const C1 = [236, 247, 252], C2 = [196, 224, 238];
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const dx = (x + 0.5 - rx) / rx, dy = (y + 0.5 - ry) / ry, d = dx * dx + dy * dy;
        const n = ((((x + k * 7) * 73856093) ^ ((y + k * 3) * 19349663)) >>> 8 & 15) / 15;
        if (d > 1 || n < d * 0.9 - 0.05) continue;
        put(G, x, y, n > 0.55 ? C1 : C2, 0, UP_N, F_GROUND);
      }
      return G;
    }, true);
  }
  // decals (render/fx.js ring): the same fading and rain-washing as v1's drawDecals; the art2 decal sets
  // (blood, footprints, scorch, skids, pools, oil, litter), tiny droplet spots as a few pixels of their colour
  _decals(F) {
    const fx = F.fx, E = this.E, now = F.now, wet = F.rain, A = this.A && this.A.v1DecalFx && this.A.fxKey ? this.A : null;
    fx.now = now;
    const x0 = this.vx0 - 40, x1 = this.vx1 + 40, y0 = this.vy0 - 40, y1 = this.vy1 + 40;
    for (let i = 0; i < fx.d.length; i++) {
      const d = fx.d[i];
      if (!d.on || d.x < x0 || d.x > x1 || d.y < y0 || d.y > y1) continue;
      const age = now - d.born;
      let a = d.alpha * (age > 240 ? Math.max(0, 1 - (age - 240) / 60) : 1);
      if (wet && d.type !== 3) { a *= 0.995; d.alpha *= 0.9995; }
      if (a <= 0.02) { d.on = false; continue; }
      let key = null;
      if (d.type === 1 && d.size < 4) key = this._genDecal(d);
      else if (A) { const name = A.v1DecalFx(d), frm = A.v1DecalFrame(d); key = this._spr('actors', 'fx', A.fxKey(name, frm), [name, frm]); }
      if (key) E.drawDecal(key, d.x, d.y, d.a, a, 0);
    }
  }
  _genDecal(d) {
    const t = d.type, sz = t === 1 || t === 5 ? Math.max(1, Math.min(24, Math.round(d.size))) : t === 3 ? Math.max(4, Math.min(64, Math.round(d.size / 4) * 4)) : t === 6 ? Math.max(1, Math.min(5, Math.round(d.size))) : 1;
    const rgb = rgbOf(d.color);
    return this._conv(`gdc|${t}|${sz}|${rgb.join(',')}`, () => {
      const blob = (rx, ry, extra) => {
        const w = Math.ceil(rx * 2 + (extra ? rx * 1.4 : 0)) + 2, h = Math.ceil(ry * 2) + 2, G = gbuf(w, h, Math.ceil(rx) + 1, h >> 1);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
          const dx = (x - G.ax + 0.5) / rx, dy = (y - G.ay + 0.5) / ry;
          const sat = extra && ((x - G.ax - rx) / (rx * 0.35)) ** 2 + ((y - G.ay) / (rx * 0.35)) ** 2 < 1;
          if (dx * dx + dy * dy <= 1 || sat) put(G, x, y, rgb, 0, UP_N, F_GROUND);
        }
        return G;
      };
      if (t === 1) return blob(sz, sz * 0.7, true);
      if (t === 5) return blob(sz, sz * 0.8, false);
      if (t === 3) { // scorch: a sooty dithered blotch
        const r = sz * 1.2, w = Math.ceil(r * 2), G = gbuf(w, w, w >> 1, w >> 1);
        for (let y = 0; y < w; y++) for (let x = 0; x < w; x++) {
          const dd = Math.hypot(x - w / 2, y - w / 2) / r;
          if (dd > 1 || (dd > 0.6 && ((x * 7 + y * 13) % 5) > 5 * (1 - dd) * 2)) continue;
          put(G, x, y, [16 + dd * 20, 13 + dd * 16, 10 + dd * 12], 0, UP_N, F_GROUND);
        }
        return G;
      }
      const [w, h] = t === 2 ? [6, 3] : t === 4 ? [8, 3] : [sz * 2, Math.max(1, Math.round(sz * 1.2))];
      const G = gbuf(w, h, w >> 1, h >> 1);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) put(G, x, y, rgb, 0, UP_N, F_GROUND);
      return G;
    }, true);
  }

  // ---- lights -------------------------------------------------------------------------------------------------
  _light(x, y, z, r, col, k, cone = null) {
    if (k < 0.02) return;
    let L = this.lightPool[this.lights.length];
    if (!L) L = this.lightPool[this.lights.length] = { x: 0, y: 0, z: 0, r: 0, col: null, k: 0, cone: null, s: 0, cn: { a: 0, spread: 0, len: 0 } };
    L.x = x; L.y = y; L.z = z; L.r = r; L.col = col; L.k = k;
    if (cone) { L.cn.a = cone[0]; L.cn.spread = cone[1]; L.cn.len = cone[2]; L.cone = L.cn; } else L.cone = null;
    const d = Math.hypot(x - this.camX, y - this.camY);
    L.s = k * Math.sqrt(r) / (1 + (d / 700) ** 2);
    this.lights.push(L);
  }
  _lights(F) {
    const S = this.S, sky = F.sky, night = sky.night, nightK = smooth((night - 0.05) / 0.5), now = F.now;
    this.lights.length = 0;
    const x0 = this.vx0 - 260, x1 = this.vx1 + 260, y0 = this.vy0 - 260, y1 = this.vy1 + 360;
    const inV = (x, y) => x > x0 && x < x1 && y > y0 && y < y1;
    // 1. the chunks' static lights (where a chunk has none baked yet: v1's lamps, windows and doors)
    for (const [k, st] of this.chunkState) {
      if (!st.lights.length) continue;
      const cx = k % 1000, cy = Math.floor(k / 1000);
      if ((cx + 1) * CHUNK < x0 || cx * CHUNK > x1 || (cy + 1) * CHUNK < y0 || cy * CHUNK > y1) continue;
      for (const L of st.lights) {
        if (L.kind === 'fire' || !inV(L.x, L.y)) continue;
        let kk = L.k;
        if (L.kind === 'lamp' && L._lamp) { if (L._lamp.broken) continue; kk *= L._lamp._lv ?? (night > 0.05 ? 1 : 0); }
        else if (L.night) kk *= nightK;
        this._light(L.x, L.y, L.z || 0, L.r, L.col, kk);
      }
    }
    if (night > 0.05) this._v1StaticLights(F, (x, y) => inV(x, y) && !this._litChunk(x, y), nightK);
    // the glowing mushrooms and golden stars (_forage): a soft pool of their colour in the dark
    if (nightK > 0.02 && this.fgLit) for (let i = 0; i < this.fgLit.length; i += 3) this._light(this.fgLit[i], this.fgLit[i + 1], 5, 58, this.fgLit[i + 2], 1.2 * nightK);
    // 2. moving lights
    for (const v of F.vehs) {
      const def = VEHICLE_BY_INDEX[v.d.m];
      if (!def) continue;
      const f = v.flags, c = Math.cos(v.ra), s = Math.sin(v.ra), zb = this._z0(v, def.kind === 'boat');
      const vl = this.prov.actors && this.A.vehicleLights ? this.A.vehicleLights(v.d) : null;
      const hl = (vl ? vl.L : def.L) / 2;
      if (f & VF.LIGHTS) {
        const fx = v.rx + c * hl, fy = v.ry + s * hl;
        this._light(fx, fy, zb + 8, 340, C.head, 2.4 * (0.35 + 0.65 * nightK), [v.ra, 0.42, 340]);
        for (const sd of [-1, 1]) this._light(v.rx - c * hl - s * def.W * 0.31 * sd, v.ry - s * hl + c * def.W * 0.31 * sd, zb + 8, f & VF.BRAKE ? 60 : 36, C.tail, f & VF.BRAKE ? 1.4 : 0.7);
      } else if (f & VF.BRAKE) this._light(v.rx - c * hl, v.ry - s * hl, zb + 8, 40, C.tail, 0.9);
      if (f & VF.SIREN) this._light(v.rx, v.ry, zb + 24, 240, Math.floor(now * 6) % 2 ? C.red : C.blue, 2.2);
      if (f & VF.BURN) this._light(v.rx, v.ry, zb + 20, 200, C.fire, 2.2 * (0.75 + 0.25 * Math.sin(now * 23 + v.id)));
    }
    for (const c of F.cars) {
      if (!(c.flags & 8)) continue;
      const def = TRAIN_CARS[c.d.c];
      this._light(c.rx, c.ry, 20, def.L * 0.75, C.window, 1.2);
      if (c.d.c === 0) this._light(c.rx + Math.cos(c.ra) * def.L / 2, c.ry + Math.sin(c.ra) * def.L / 2, 14, 460, C.head, 2.4, [c.ra, 0.36, 460]);
    }
    // signal heads: the lit lens of every head in a baked chunk (a little out in front), v1's heads elsewhere
    const hs = this.liveHeads, sigK = 0.25 + 1.2 * nightK;
    for (let j = 0; j < hs.length; j += 2) { const h = hs[j], i = hs[j + 1], c = h.L[i]; this._light(c[0] + h.nx * 8, c[1] + h.ny * 8, c[2], 56, SIG_RGB01[i], sigK); }
    for (const h of S.sigHeads || []) if (!this._liveAt(h.x, h.y)) this._light(h.x, h.y, 44, 56, h.rgb01 || (h.rgb01 = rgbOf(h.c).map((v) => v / 255)), sigK);
    for (let j = 0; j < this.nfL; j++) { const L = this.fLights[j]; this._light(L.x, L.y, L.z, L.r, L.col, L.k); }
    // flashlights: police on foot after dark (switched on as it gets dark, eased); a player's whenever it's
    // switched on (d.fl), brightest at night
    const copK = smooth((night - 0.25) / 0.3);
    for (const p of F.peds) {
      if ((p.flags & (PF.INVEH | PF.DEAD | PF.DOWN)) || p.swim || p.blink === 3) continue;
      const torch = !!(p.d && p.d.fl), cop = copK > 0.01 && !!(p.flags & PF.BADGE);
      if (!torch && !cop) continue;
      const len = torch ? 240 : 200;
      this._light(p.rx + Math.cos(p.ra) * 8, p.ry + Math.sin(p.ra) * 8, 30 + this._z0(p, false), len, C.white, 1.6 * (torch ? Math.max(night, 0.3) : night * copK), [p.ra, 0.32, len]);
    }
    // the dark is dark: a faint pool of moonlight round your own figure so you can see where you are (eased in)
    const selfK = smooth((night - 0.2) / 0.5);
    if (selfK > 0.01) { const sp = F.sp; this._light(sp.x, sp.y, 40 + (sp.z ? DECK_Z * sp.z : 0), 115, C.moon, 0.55 * selfK); }
    // dropped backpacks: the rare ones glow their rarity's colour (blue, purple; the legendary one gold and pulsing)
    for (const b of F.bags) {
      const t = (b.d.t | 0) - 4;
      if (t < 3 || !inV(b.rx, b.ry) || ((b.flags & 1) && Math.floor(now * 5) % 2)) continue;
      const pulse = t === 5 ? 0.8 + 0.2 * Math.sin(now * 2.6 + b.id) : 1;
      this._light(b.rx, b.ry, 16, t === 5 ? 130 : t === 4 ? 90 : 60, t === 5 ? C.gold : t === 4 ? C.epic : C.rare, (t === 5 ? 1.1 : t === 4 ? 0.8 : 0.5) * (0.6 + 0.9 * nightK) * pulse);
    }
    // the legends (the pure white animals, 'pet:<kind>:L'): a faint pale glow about them, plain at night
    for (const p of F.peds) if (p.d && p.d.ar && p.d.ar.endsWith(':L') && !(p.flags & PF.DEAD) && inV(p.rx, p.ry)) this._light(p.rx, p.ry, 14, 110, C.legend, 0.35 + 1.1 * nightK * (0.85 + 0.15 * Math.sin(now * 1.7 + p.id)));
    for (const f of S.flashes) {
      if (f.kind === 'boom') { const e = Math.min(1.6, f.t * 3.2); this._light(f.x, f.y, 30, f.r * 1.3, C.fire, 2.4 * e); }
      else if (f.kind === 'plasma') this._light(f.x, f.y, 26, f.r, C.plasma, 2.6 * Math.min(1.4, f.t * 5));   // (the hooded stranger, gone in a flash)
      else this._light(f.x, f.y, 20, f.r || 150, C.flash, 2.2 * Math.min(1.4, f.t * 22));
    }
    // the plasma blade gives off its own blue light in the hand
    for (const p of F.peds) {
      if ((p.extra | 0) !== PLASMA_I || (p.flags & (PF.INVEH | PF.DEAD)) || p.blink === 3 || !inV(p.rx, p.ry)) continue;
      this._light(p.rx + Math.cos(p.ra) * 10, p.ry + Math.sin(p.ra) * 10, 22 + this._z0(p, false), 96, C.plasma, 0.7 + 1.5 * nightK);
    }
    // the balloons' burners (the flame over the basket: shared/rides.js, client/art2/props-rural.js hotAirBalloon)
    const bl = this.balLit || [];
    for (let j = 0; j < bl.length; j += 4) this._light(bl[j], bl[j + 1], bl[j + 2] + 46, 150, C.fire, (0.5 + 1.5 * night) * bl[j + 3] * (0.85 + 0.15 * Math.sin(now * 19 + j)));
    let fires = 0;
    for (const o of F.fx.p) { if (!o.on || o.type !== 3 || fires > 26 || !inV(o.x, o.y)) continue; fires++; this._light(o.x, o.y, 10, 70, C.fire, 0.6); }
    // camp fires and flare stacks flicker (the statics' fire lights are left to these)
    const g = S.ground;
    if (g && g.overhead) {
      const [cx0, cx1, cy0, cy1] = F.chunkView;
      for (let cy = Math.max(0, cy0); cy <= cy1 + 2; cy++) for (let cx = Math.max(0, cx0 - 1); cx <= cx1 + 1; cx++) for (const p of g.overhead(cx, cy)) {
        if (p.broken || (p.t !== 'campfire' && p.t !== 'flare') || !inV(p.x, p.y)) continue;
        const fl = 0.8 + 0.2 * Math.sin(S.loopClock * 17 + p.x) * Math.sin(S.loopClock * 7.3 + p.y);
        if (p.t === 'campfire') { if (p.lit) this._light(p.x, p.y, 10, 170, C.fire, (0.6 + 1.6 * night) * fl); }
        else this._light(p.x, p.y, p.y - countryLightY(p, 0.96), 280, C.fire, (0.8 + 1.8 * night) * fl);
      }
    }
    // the strongest and nearest, up to the tier's cap
    const out = this.lights;
    out.sort((a, b) => b.s - a.s);
    const n = Math.min(out.length, this.tier.lights);
    for (let i = 0; i < n; i++) this.E.addLight(out[i]);
    this.n.lights = n;
  }
  // is (x, y) in a chunk whose bake brought its own static lights?
  _litChunk(x, y) { const st = this.chunkState.get(Math.floor(y / CHUNK) * 1000 + Math.floor(x / CHUNK)); return !!(st && st.lights.length); }
  // ... and a bake that brought its live parts (signal heads)?
  _liveAt(x, y) { const st = this.chunkState.get(Math.floor(y / CHUNK) * 1000 + Math.floor(x / CHUNK)); return !!(st && st.live); }
  // without the statics' lights: v1's street lamps, lit windows and shop doors (grid lookups, not scans)
  _grid(list, cell) {
    const m = new Map();
    for (const o of list || []) { const k = Math.floor(o.y / cell) * 4096 + Math.floor(o.x / cell); let a = m.get(k); if (!a) m.set(k, a = []); a.push(o); }
    return m;
  }
  _eachIn(grid, cell, fn) {
    const gx0 = Math.floor((this.vx0 - 260) / cell), gx1 = Math.floor((this.vx1 + 260) / cell), gy0 = Math.floor((this.vy0 - 260) / cell), gy1 = Math.floor((this.vy1 + 360) / cell);
    for (let gy = gy0; gy <= gy1; gy++) for (let gx = gx0; gx <= gx1; gx++) { const a = grid.get(gy * 4096 + gx); if (a) for (const o of a) fn(o); }
  }
  _v1StaticLights(F, inV, nightK) {
    const S = this.S;
    this.lampG ||= this._grid(this.map.lamps, 512);
    this.poiG ||= this._grid(this.map.pois, 512);
    this._eachIn(this.lampG, 512, (l) => {
      if (l.broken || !(l._lv > 0) || !inV(l.x, l.y)) return;
      const h = lampHead(l);
      this._light(h.x, h.y, 60, 200, C.sodium, 2.6 * l._lv);
    });
    for (const it of F.bl || []) {
      const b = it.b;
      if (b.kind === 'motorpool' || ((S.roofFade && S.roofFade[b.id]) || 0) > 0.3) continue;
      const k = nightK * (0.6 + 0.6 * ((b.id * 2654435761 >>> 0) % 100) / 100);
      for (let x = it.x0 + 48; x < it.x1 - 16; x += 110) if (inV(x, it.y1)) this._light(x, it.y1 + 10, 18, 90, C.window, k);
    }
    this._eachIn(this.poiG, 512, (p) => {
      if (!inV(p.x, p.y) || p.kind === 'home' || p.kind === 'evidence' || p.kind === 'reception' || p.kind === 'race') return;
      this._light(p.x, p.y, 16, p.kind === 'atm' ? 60 : 120, p.kind === 'atm' ? C.cyan : C.warm, 1.2 * nightK);
    });
  }

  // ---- the world changing under the bakes ---------------------------------------------------------------------
  // A prop smashed or put back (main.js setPropBroken / propfix), a campfire lit or put out (setFire): every worker's
  // copy of the world learns it and the chunks it shows in are baked again (the old bake stays up until the new one lands).
  propChanged(i) {
    const p = this.map.props[i];
    if (!p) return;
    if (this.pool && !this.pool.dead) this.pool.broadcast('patch', { props: [[i, p.broken ? { a: p.broken.a || 0 } : null]], ...(p.t === 'campfire' ? { lit: [[i, p.lit ? 1 : 0]] } : null) });
    // its screen footprint: standing up to ~320 px above its ground point, debris round it
    for (let cy = Math.floor((p.y - 320) / CHUNK); cy <= Math.floor((p.y + 40) / CHUNK); cy++)
      for (let cx = Math.floor((p.x - 120) / CHUNK); cx <= Math.floor((p.x + 120) / CHUNK); cx++) { const k = cy * 1000 + cx; this.ver.set(k, (this.ver.get(k) || 0) + 1); }
  }
  // A highway barrier smashed through or put back (main.js 'barrier' / 'barrierfix'): the workers learn it and the
  // chunks the pieces show in are baked again - the deck drawn open there, with its broken stubs (statics.js makeDeck)
  barrierChanged(keys, on) {
    if (!keys || !keys.length) return;
    if (this.pool && !this.pool.dead) this.pool.broadcast('patch', { barriers: keys.map((k) => [k, on ? 1 : 0]) });
    for (const k of keys) {
      const [ei, , pc] = String(k).split(':').map(Number), e = this.map.edges && this.map.edges[ei];
      if (!e || !e.pts || e.pts.length < 2) continue;
      const q = pointAt(e.pts, Math.max(0, Math.min(e.len || 0, (pc + 0.5) * BARRIER_PIECE)));
      // (the deck stands DECK_Z above its ground point: up to ~130 px of screen above it)
      for (let cy = Math.floor((q.y - 160) / CHUNK); cy <= Math.floor((q.y + 60) / CHUNK); cy++)
        for (let cx = Math.floor((q.x - 120) / CHUNK); cx <= Math.floor((q.x + 120) / CHUNK); cx++) { const ck = cy * 1000 + cx; this.ver.set(ck, (this.ver.get(ck) || 0) + 1); }
    }
  }
  // after a reconnect: the server's list of what is broken replaces the workers' and everything rebakes
  resync(rebake = true) {
    const list = [], lit = [], props = this.map.props || [];
    for (let i = 0; i < props.length; i++) { if (props[i].broken) list.push([i, { a: props[i].broken.a || 0 }]); if (props[i].t === 'campfire') lit.push([i, props[i].lit ? 1 : 0]); }
    const L = this.map.levels, barriers = L && L.broken ? [...L.broken.keys()].map((k) => [k, 1]) : [];
    if (this.pool && !this.pool.dead) this.pool.broadcast('patch', { props: list, lit, barriers, reset: true });
    if (rebake) for (const k of this.chunkState.keys()) this.ver.set(k, (this.ver.get(k) || 0) + 1);
  }

  // whether a chunk on screen is a stand-in right now while moving fast (main.js eases the camera's pull-back at speed
  // off while this keeps happening: a phone's bakes keep up with a smaller view)
  lateNow() { return !!(this.late && this.late.now); }

  // ---- reporting ---------------------------------------------------------------------------------------------
  stats() {
    const es = this.E.stats ? this.E.stats() : {};
    return {
      q: this.q, providers: this.prov, chunks: this.chunkState.size, placeholders: this.fallbacks.size, results: this.results.size,
      pool: this.pool ? this.pool.stats() : null, t: { ...this.t, bakeAvg: this.t.bakeN ? this.t.bakeSum / this.t.bakeN : 0 }, n: { ...this.n },
      upQ: this.upQ.size, sprOut: this.sprOut, warmQ: this.warmQ.length, fades: this.fades.size, badKeys: this.badKeys.size, lastErr: this.lastErr, engine: es, part: this.part,
      ahead: this.pre ? { baked: this.pre.done, had: this.pre.had, out: this.pre.out.size, list: this.pre.list.length } : null, late: this.late || null,
      fetched: this.fa ? { got: this.fa.got, had: this.fa.had, miss: this.fa.miss, out: this.fa.out.size, off: !!this.cdnOff } : null,
    };
  }
  diag() {
    const p = this.pool ? this.pool.stats() : null, t = this.t;
    return `q${this.q}${this.lowMem ? ' lowmem' : ''} chunks ${this.chunkState.size}+${this.fallbacks.size} placeholder (workers ${p ? p.workers + '/' + p.slots + (p.restarted ? ' restarted ' + p.restarted : '') : '-'}${this.n.revived ? ' new pool ' + this.n.revived : ''}, queue ${p ? p.queued : '-'}, run ${p ? p.running : '-'}, failing ${this.chunkFails.size}) bake avg ${(t.bakeN ? t.bakeSum / t.bakeN : 0).toFixed(0)} max ${t.bakeMax.toFixed(0)} ms (kept ${this.n.kept || 0}, ahead ${this.pre ? this.pre.done + '+' + this.pre.had : 0})${this.late ? ` late ${this.late.frames}/${this.late.of}` : ''}  sprites req ${this.n.sprReq} up ${this.n.sprUp} now ${this.n.sync} gen ${this.n.gen} out ${this.sprOut}  fades ${this.fades.size}  lights ${this.n.lights}  lost ${this.lost}  host ${t.frameMs.toFixed(1)} ms${this.lastErr ? '  err ' + this.lastErr.slice(0, 60) : ''}`;
  }
}

// when the page last came back on screen (a phone drops the graphics of a page in the background: losses
// just after coming back are not held against the renderer)
World2.shownAt = 0;
if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => { if (!document.hidden) World2.shownAt = performance.now(); });

