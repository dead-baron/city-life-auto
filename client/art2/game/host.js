// Art v2 live renderer: the host (docs/art-v2/GAME-RENDERER.md) - the bridge between client/main.js and
// the WebGL2 engine (engine.js). World2 owns the engine and the bake worker pool and turns main.js's
// frame packet F (camera, sky, who is on screen, the fx pools; see main.js prepFrame) into engine calls:
//   chunks   the static world baked per 768 px chunk in the workers (chunkbake.js): what is in view
//            first, then ahead of the camera; a budget of uploads a frame; the v1 ground chunk shown until
//            a bake lands; the cache kept to the quality tier; the chunks of a walk-in shop you stand in
//            rebaked in cutaway (opt.cutaway = building index)
//   sprites  moving things get their sprite keys from the providers (actors.js, peds.js) and the
//            sprites from the workers; until one arrives (or with no provider) the v1 art is converted
//            (bodies, lying bodies, cars with their side walls, trains, crates, bags, pets) or a small
//            one generated (particles, decals, birds, balls, rockets), so everything always shows
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
// api: helpers lent by main.js (pedLook, vehLift, birds, umbrellaSprite, seats, scales).
import { CHUNK, DECK_Z, groundZ } from './chunkbake.js';
import { WorkerPool } from './pool.js';
import { MAP_W, MAP_H, TILE, K, PF, VF } from '../../../shared/constants.js';
import { WATER_T, TRAIN_CARS, CROSSING_ARM } from '../../../shared/map.js';
import { signalFor } from '../../../shared/roads.js';
import { VEHICLE_BY_INDEX } from '../../../shared/vehicles.js';
import { ANIMAL_ART } from '../../../shared/animal-art.js';
import { atlas, drawVehicle, drawVehicleWreck, vehicleSide, drawCrate, drawBag } from '../../render/sprites.js';
import { bodySprite, lyingSprite, LW, LH } from '../../render/body.js';
import { charSprite, dir8, baseDir, CW, CH, FOOT_Y } from '../../render/chars.js';
import { drawTrainCar } from '../../render/trains.js';
import { lampHead } from '../../render/tiles.js';
import { countryLightY } from '../../render/country.js';
import { F_GROUND, F_CHAR, F_NOCAST } from '../gbuf.js';

export { DECK_Z };
const TAU = Math.PI * 2;
const CX = Math.ceil(MAP_W * TILE / CHUNK), CY = Math.ceil(MAP_H * TILE / CHUNK);
// per quality tier (Low/Xbox, Medium, High, Ultra): chunk cache, lights, vehicle headings, uploads a frame
const TIERS = [
  { chunks: 9, lights: 16, N: 16, chunkUp: 1, sprUp: 6, convert: 3, sprJobs: 8 },
  { chunks: 12, lights: 32, N: 32, chunkUp: 1, sprUp: 8, convert: 4, sprJobs: 12 },
  { chunks: 16, lights: 64, N: 32, chunkUp: 2, sprUp: 10, convert: 5, sprJobs: 16 },
  { chunks: 24, lights: 96, N: 64, chunkUp: 2, sprUp: 12, convert: 6, sprJobs: 24 },
];
const MARGIN = 300;        // world px baked round the view (shadows fall in from beyond its edge)
const AHEAD_S = 1.2;       // prefetch where the camera will be this many seconds ahead
const UP_N = [128, 128, 255, 255], FACE_N = [128, 196, 230, 255]; // flat ground; an upright figure facing the camera
const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

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

// ---- small raster helpers (fallback sprites) -------------------------------------------------------------
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
const appKeyOf = (a) => (a ? `${a.s}.${a.h}.${a.hc}.${a.t}.${a.tc}.${a.tc2}.${a.l}.${a.sh}.${a.ht}.${a.htc}.${a.b}.${a.bd}.${a.bandana ? 1 : 0}` : 'x');
const appKeys = new WeakMap();
const akey = (a) => { if (!a) return 'x'; let k = appKeys.get(a); if (!k) { k = appKeyOf(a); appKeys.set(a, k); } return k; };
const quant = (a, N) => ((Math.round(a / TAU * N) % N) + N) % N;

// the time-of-day keys of the presets (minutes after midnight), blended in between
const SKY_KEYS = [[0, 'night'], [320, 'night'], [352, 'dawn'], [395, 'dawn'], [470, 'morning'], [600, 'noon'], [900, 'noon'], [1000, 'afternoon'], [1090, 'golden'], [1150, 'golden'], [1192, 'dusk'], [1240, 'night'], [1440, 'night']];
// v1 light colours (0-255) in the Lighter's 0..1
const C = {
  head: [1, 0.93, 0.76], tail: [1, 0.16, 0.12], red: [1, 0.18, 0.14], blue: [0.3, 0.5, 1], fire: [1, 0.55, 0.2], flash: [1, 0.9, 0.67],
  sodium: [1, 0.73, 0.43], window: [1, 0.77, 0.47], warm: [1, 0.8, 0.55], white: [0.92, 0.94, 1], moon: [0.6, 0.67, 1], cyan: [0.47, 0.9, 1],
};
// signal lenses red, amber, green (v1's SIG_COL), and as light colours
const SIG_RGB = [[255, 59, 59], [255, 194, 61], [61, 220, 132]], SIG_RGB01 = SIG_RGB.map((c) => c.map((v) => v / 255));
const XARM_Z = 20, XPOST_H = 24;           // level crossing barrier: pivot height, post height
const XING0 = { d: 0, b: [0, 0] };

// ---- a 2D stand-in for the engine (?art2stub): the same API, painter's order, no lighting ---------------
class StubEngine {
  constructor(canvas) { this.cv = canvas; this.g = canvas.getContext('2d'); this.chunks = new Map(); this.fb = new Map(); this.spr = new Map(); this.list = []; this.n = 0; }
  static toCanvas(G) { const c = document.createElement('canvas'); c.width = G.w; c.height = G.h; const id = new ImageData(new Uint8ClampedArray(G.col), G.w, G.h); c.getContext('2d').putImageData(id, 0, 0); return c; }
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
    for (const [k, c] of this.chunks) g.drawImage(c, (k % 1000) * CHUNK, Math.floor(k / 1000) * CHUNK);
    this.list.sort((a, b) => a.y - b.y);
    for (const it of this.list) {
      const s = this.spr.get(it.key); if (!s) continue;
      g.globalAlpha = it.a;
      if (it.z0 < 0) { g.save(); g.translate(it.x, it.y); g.rotate(it.ang || 0); g.drawImage(s, -s.width / 2, -s.height / 2); g.restore(); }
      else g.drawImage(s, Math.round(it.x - s.ax), Math.round(it.y - it.z0 - s.ay));
      g.globalAlpha = 1;
    }
  }
  stats() { return { chunks: this.chunks.size, sprites: this.spr.size, lights: this.n, stub: true }; }
}

// ---- the host -----------------------------------------------------------------------------------------------
export class World2 {
  static async create(o) {
    let E = null, L = null, why = '';
    try { E = await import('./engine.js'); } catch (e) { why = String((e && e.message) || e); }
    try { L = await import('./lightgame.js'); } catch { L = null; }
    const q = qualityOf(o.gfx, o.lowMem);
    let engine = null;
    if (/[?&]art2nogl\b/.test(location.search)) return null; // (testing the fallback: as if there were no WebGL2)
    if (E && E.Art2Engine) { try { engine = E.Art2Engine.create(o.canvas, { quality: q, lowMem: !!o.lowMem }); } catch (e) { console.error('[art2] engine', e); engine = null; } }
    if (!engine && /[?&]art2stub\b/.test(location.search)) engine = new StubEngine(o.canvas);
    if (!engine) { if (why) console.warn('[art2] no engine:', why); return null; }
    const w = new World2(o, engine, L, q);
    w.init();
    return w;
  }

  constructor(o, engine, L, q) {
    this.S = o.S; this.map = o.map; this.gfx = o.gfx; this.lowMem = !!o.lowMem; this.api = o.api; this.onFail = o.onFail || (() => {});
    this.E = engine; this.L = L; this.q = q; this.tier = TIERS[q];
    this.W = 0; this.H = 0; this.dpr = 1;
    this.prov = { ground: false, statics: false, actors: false, peds: false };
    this.A = null; this.Pd = null;                 // provider modules on this thread (sprite keys)
    this.pool = null; this.failed = false; this.lost = 0;
    this.chunkState = new Map();                   // cy*1000+cx -> { mode, gh, lights } of an uploaded bake
    this.fallbacks = new Set();                    // chunks showing the v1 ground
    this.results = new Map();                      // job key -> { key, cx, cy, mode, r, prio } waiting for upload
    this.wantJobs = new Set(); this.wantChunks = new Map();
    this.chunkFails = new Map();
    this.upQ = []; this.upKeys = new Set();        // sprites back from the workers, waiting for upload
    this.badKeys = new Set();                      // sprite keys a provider failed on (fallback from then on)
    this.convBudget = 0; this.genBudget = 0; this.sprOut = 0; this.sprPrio = -1;
    this.cvs = [];                                 // scratch canvases
    this.lights = []; this.lightPool = [];
    this.liveHeads = [];                           // signal heads lit this frame: head, lens index, ...
    this.fLights = []; this.nfL = 0;               // furniture lights this frame (crossing flashers)
    this.presetA = {}; this.presetB = {}; this.presetC = {};
    this.lampGrid = null;
    this.ver = new Map();                          // chunk -> bake version (raised when the world changes there)
    this.adapted = new WeakMap();
    this.t = { clonePrep: 0, post: 0, workerInit: 0, bakeN: 0, bakeSum: 0, bakeMax: 0, upChunkMs: 0, frameMs: 0, convMs: 0 };
    this.n = { chunkUp: 0, fbSet: 0, sprReq: 0, sprUp: 0, conv: 0, gen: 0, lights: 0, drawn: 0, bakeErr: 0, sprErr: 0 };
    this.ghOf = (cx, cy) => { const s = this.chunkState.get(cy * 1000 + cx); return s ? s.gh : null; };
    this.lastErr = '';
    this.part = {}; this.pt = 0;
    this.noBake = /[?&]art2nobake\b/.test(typeof location !== 'undefined' ? location.search : '');
    this.ready = true; // drawable at once: the v1 ground stands in until bakes land
    if (engine.onContextLost) engine.onContextLost((what) => this._contextLost(what));
  }

  async init() {
    try {
      const [A, Pd] = await Promise.all([import('./actors.js').catch(() => null), import('./peds.js').catch(() => null)]);
      this.A = A; this.Pd = Pd;
    } catch { /* providers optional */ }
    if (this.failed) return;
    const t0 = performance.now();
    const M = worldData(this.map);
    this.t.clonePrep = performance.now() - t0;
    try {
      this.pool = new WorkerPool({ lowMem: this.lowMem });
      const r = await this.pool.init(M);
      this.t.post = r.ms.post; this.t.workerInit = r.ms.init;
      const p = r.providers || {};
      this.prov = { ground: !!p.ground, statics: !!p.statics, actors: !!p.actors && !!this.A, peds: !!p.peds && !!this.Pd };
      this.provErrors = p.errors || {};
      console.info(`[art2] ${r.workers} bake worker(s) ready: send ${this.t.post.toFixed(0)} ms, init ${this.t.workerInit.toFixed(0)} ms; providers ${JSON.stringify(this.prov)}`);
      if (this.pool.dead) console.warn('[art2] no bake workers: the v1 ground and sprites stand in');
    } catch (e) { console.error('[art2] worker pool', e); this.pool = null; }
  }

  resize(W, H, dpr) { this.W = W; this.H = H; this.dpr = dpr; if (this.E.resize) this.E.resize(W, H, dpr); }

  // engine.onContextLost: 'lost' (count it: twice and we fall back), 'restored' (everything must be uploaded
  // again: has* answer false, and what was waiting is dropped), 'failed' (the rebuild failed)
  _contextLost(what = 'lost') {
    if (what === 'lost') this.lost++;
    this.chunkState.clear(); this.fallbacks.clear(); this.results.clear(); this.upQ.length = 0; this.upKeys.clear();
    if (this.lost >= 2 || what === 'failed') { this.failed = true; this.ready = false; this.onFail(what === 'failed' ? 'the graphics could not be rebuilt' : 'the graphics memory was lost twice', true); }
  }

  dispose() {
    this.ready = false; this.failed = true;
    if (this.pool) this.pool.dispose();
    try { this.E.dispose(); } catch { /* gone */ }
    this.chunkState.clear(); this.results.clear(); this.upQ.length = 0;
  }

  // ---- the frame ---------------------------------------------------------------------------------------------
  frame(F) {
    if (this.failed) return;
    const t0 = performance.now();
    const E = this.E, S = this.S, z = F.z;
    this.F = F;
    const q = qualityOf(this.gfx, this.lowMem);
    if (q !== this.q) { this.q = q; this.tier = TIERS[q]; if (E.setQuality) E.setQuality(q); }
    // sprites snap to whole world px: the camera moves with the player's rounded position (plus the smooth
    // look-ahead) so the player stays steady on screen (engine.js integration notes)
    const sp = F.sp, camX = Math.round(sp.x) + (S.cam.x - sp.x) - F.shx / z, camY = Math.round(sp.y) + (S.cam.y - sp.y) - F.shy / z;
    const hw = this.W / 2 / z, hh = this.H / 2 / z;
    this.vx0 = camX - hw; this.vx1 = camX + hw; this.vy0 = camY - hh; this.vy1 = camY + hh;
    this.camX = camX; this.camY = camY;
    this.convBudget = this.tier.convert; this.genBudget = 48;
    const T = this.part, mk = (k) => { const n = performance.now(); T[k] = (T[k] || 0) * 0.9 + (n - this.pt) * 0.1; this.pt = n; };
    this.pt = t0;
    this._chunks(F); mk('chunks');
    const preset = this._preset(F);
    const wet = Math.max(S.rainK || 0, (S.wx ? S.wx.wet : 0) * 0.8);
    const flash = S.wx ? Math.min(1, S.wx.flash || 0) : 0, fog = F.sky.fog ? F.sky.fog.k : 0;
    // (viewW / viewH: the view in world px, what the scene covers)
    if (E.beginFrame({ camX, camY, zoom: z, viewW: this.W / z, viewH: this.H / z, time: F.now, preset, wet, quality: this.q, flash, fog }) === false) return;
    this.n.drawn = 0;
    mk('begin');
    this._uploadSprites(); mk('upload');
    this._decals(F); mk('decals');
    this._entities(F); mk('entities');
    this._furniture(F); mk('furniture');
    this._particles(F); mk('particles');
    this._lights(F); mk('lights');
    E.endFrame(); mk('end');
    this.t.frameMs = this.t.frameMs * 0.9 + (performance.now() - t0) * 0.1;
    F.mark('art2');
  }

  // ---- chunks ---------------------------------------------------------------------------------------------
  // need: what the engine draws this frame (the view plus the tier's shadow reach) - resident now, the v1
  // ground standing in until its bake lands; bake: that, plus a wider ring and the road ahead when
  // driving - baked in the background, uploaded while the engine has free slots.
  _chunks(F) {
    const E = this.E, S = this.S, tier = this.tier;
    const need = this.needChunks || (this.needChunks = new Map()), bake = this.wantChunks;
    need.clear(); bake.clear();
    const add = (m, x0, y0, x1, y1, base) => {
      const cx0 = Math.max(0, Math.floor(x0 / CHUNK)), cx1 = Math.min(CX - 1, Math.floor(x1 / CHUNK));
      const cy0 = Math.max(0, Math.floor(y0 / CHUNK)), cy1 = Math.min(CY - 1, Math.floor(y1 / CHUNK));
      for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
        const k = cy * 1000 + cx, d = Math.hypot((cx + 0.5) * CHUNK - this.camX, (cy + 0.5) * CHUNK - this.camY) + base;
        const cur = m.get(k);
        if (cur === undefined || d < cur) m.set(k, d);
      }
    };
    const reach = [36, 200, 300, 300][this.q];
    add(need, this.vx0 - reach, this.vy0 - reach - 64, this.vx1 + reach, this.vy1 + reach, 0);
    for (const [k, d] of need) bake.set(k, d);
    add(bake, this.vx0 - MARGIN, this.vy0 - MARGIN, this.vx1 + MARGIN, this.vy1 + MARGIN, 2000);
    // ahead of the camera: where it will be in a moment (driving)
    let vx = 0, vy = 0;
    if (S.pred && S.pred.kind === 'veh') { vx = S.pred.s.vx; vy = S.pred.s.vy; }
    if (vx * vx + vy * vy > 2500) add(bake, this.vx0 + vx * AHEAD_S, this.vy0 + vy * AHEAD_S, this.vx1 + vx * AHEAD_S, this.vy1 + vy * AHEAD_S, 4000);
    // standing in a walk-in shop: its chunks are baked cut away
    const cut = F.insideB ? F.insideB.id : -1;
    let cutBox = null;
    if (cut >= 0) { const b = F.insideB; cutBox = [b.tx * TILE - 40, b.ty * TILE - 360, (b.tx + b.tw) * TILE + 40, (b.ty + b.th) * TILE + 40]; }
    const modeOf = (cx, cy) => (cutBox && (cx + 1) * CHUNK > cutBox[0] && cx * CHUNK < cutBox[2] && (cy + 1) * CHUNK > cutBox[1] && cy * CHUNK < cutBox[3] ? cut : -1);
    // the v1 ground where nothing baked is resident: at once for what is on screen (as v1 itself does),
    // one a frame for the margins
    let fbBudget = 1;
    for (const k of need.keys()) {
      const cx = k % 1000, cy = Math.floor(k / 1000);
      if (E.hasChunk(cx, cy) || this._fallback(cx, cy) || !S.ground) continue;
      const onScreen = (cx + 1) * CHUNK > this.vx0 && cx * CHUNK < this.vx1 && (cy + 1) * CHUNK > this.vy0 && cy * CHUNK < this.vy1;
      if (!onScreen && fbBudget-- <= 0) continue;
      E.setChunkFallback(cx, cy, S.ground.get(cx, cy)); this.fallbacks.add(k); this.n.fbSet++;
    }
    const jobs = this.wantJobs; jobs.clear();
    const baking = !this.noBake && this.pool && !this.pool.dead && this.pool.ready && (this.prov.ground || this.prov.statics);
    if (baking) {
      let colBudget = 1;
      for (const [k, prio] of bake) {
        const cx = k % 1000, cy = Math.floor(k / 1000), mode = modeOf(cx, cy);
        const st = this.chunkState.get(k), ver = this.ver.get(k) || 0;
        if (st && st.mode === mode && st.ver === ver && E.hasChunk(cx, cy)) continue;
        if ((this.chunkFails.get(k) || 0) > 2) continue;
        const jk = `c${cx},${cy},${mode},${ver}`;
        jobs.add(jk);
        if (this.results.has(jk) || this.pool.has(jk) || this.results.size > 5) continue;
        const opt = { quality: this.q, seed: this.map.seed, lowMem: this.lowMem };
        if (mode >= 0) opt.cutaway = mode;
        if (!this.prov.ground) { // no ground provider: the statics go over the v1 ground's pixels
          const cv = S.ground && colBudget-- > 0 ? S.ground.get(cx, cy) : null;
          if (!cv) continue;
          opt.groundCol = cv.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, CHUNK, CHUNK).data;
        }
        this.pool.request(jk, 'bakeChunk', { cx, cy, opt }, prio, (r, err) => this._baked(jk, k, cx, cy, mode, prio, r, err, ver));
      }
    }
    if (this.pool && !this.pool.dead) this.pool.cancelWhere((jk) => jk[0] === 'c' && !jobs.has(jk));
    for (const jk of this.results.keys()) if (!jobs.has(jk)) this.results.delete(jk); // landed too late to matter
    // uploads, nearest first: what is needed now; the rest only into free slots
    if (this.results.size) {
      const ready = [...this.results.values()].sort((a, b) => a.prio - b.prio);
      let n = tier.chunkUp, free = Math.max(0, tier.chunks - (E.chunkKeys ? E.chunkKeys().length : 0));
      for (const res of ready) {
        if (n <= 0) break;
        if (!need.has(res.key)) { if (free <= 0) continue; free--; }
        n--;
        const t = performance.now();
        let ok = false;
        try { ok = E.uploadChunk(res.cx, res.cy, res.r.g) !== false; } catch (e) { console.error('[art2] uploadChunk', e); }
        this.results.delete(res.jk);
        if (!ok) continue;
        this.t.upChunkMs = performance.now() - t;
        this.chunkState.set(res.key, { mode: res.mode, ver: res.ver, gh: res.r.gh, lights: this._prepLights(res.r.lights || []), live: res.r.live || null });
        this.fallbacks.delete(res.key);
        this.n.chunkUp++;
      }
    }
    // the engine keeps its chunk slots (least recently drawn goes first): forget what it let go
    if ((this.frameNo = (this.frameNo || 0) + 1) % 30 === 0) {
      for (const k of this.chunkState.keys()) if (!E.hasChunk(k % 1000, Math.floor(k / 1000))) this.chunkState.delete(k);
      for (const k of this.fallbacks) if (!this._fallback(k % 1000, Math.floor(k / 1000))) this.fallbacks.delete(k);
    }
  }
  _fallback(cx, cy) { return this.E.hasFallback ? this.E.hasFallback(cx, cy) : this.fallbacks.has(cy * 1000 + cx); }
  _baked(jk, key, cx, cy, mode, prio, r, err, ver = 0) {
    if (err || !r) {
      this.n.bakeErr++; this.lastErr = String(err).slice(0, 300);
      this.chunkFails.set(key, (this.chunkFails.get(key) || 0) + 1);
      if (this.n.bakeErr <= 3) console.warn('[art2] chunk bake failed', cx, cy, this.lastErr);
      return;
    }
    if (r.errors && !this.loggedBakeErr) { this.loggedBakeErr = true; console.warn('[art2] chunk bake reported provider errors (fallbacks used)', JSON.stringify(r.errors).slice(0, 600)); }
    const ms = r.workerMs || 0;
    this.t.bakeN++; this.t.bakeSum += ms; this.t.bakeMax = Math.max(this.t.bakeMax, ms);
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
  _preset(F) {
    const P = this.L && this.L.PRESETS_GAME, blend = this.L && this.L.blendPresets;
    const sky = F.sky, S = this.S;
    if (!P || !blend) return null;
    const m = sky.minutes;
    let i = 0;
    while (i < SKY_KEYS.length - 2 && SKY_KEYS[i + 1][0] <= m) i++;
    const [ma, a] = SKY_KEYS[i], [mb, b] = SKY_KEYS[i + 1];
    let p = blend(P[a], P[b], smooth((m - ma) / Math.max(1, mb - ma)), this.presetA);
    const rk = S.rainK || 0;
    if (rk > 0.01) p = blend(p, sky.night > 0.5 ? P.storm : P.rain, Math.min(1, rk) * 0.92, this.presetB === p ? this.presetC : this.presetB);
    const fog = sky.fog ? sky.fog.k : 0;
    if (fog > 0.02) p = blend(p, P.fog, Math.min(1, fog) * 0.75, p === this.presetB ? this.presetC : this.presetB);
    // the sun where v1's sky puts it (the shadows agree with the HUD clock and the v1 views)
    if (sky.sun > 0.05 && sky.sunDir) {
      const sx = sky.sunDir.x, sy = sky.sunDir.y, l = Math.hypot(sx, sy) || 1;
      const elev = Math.atan(0.62 / Math.max(0.3, sky.shadowLen));
      const c = Math.cos(elev), s = Math.sin(elev);
      const d = p.sunDir || (p.sunDir = [0, 0, 1]);
      d[0] = -sx / l * c; d[1] = -sy / l * c; d[2] = s;
    }
    p.lampsOn = Math.max(p.lampsOn || 0, sky.night);
    p.rain = Math.max(p.rain || 0, rk);
    return p;
  }

  // ---- sprites --------------------------------------------------------------------------------------------
  // The provider's sprite (asking the workers for it), or the fallback key fb() gives meanwhile.
  _spr(prov, kind, key, args, fb) {
    if (key && this.prov[prov]) {
      if (this.E.hasSprite(key)) return key;
      // at most a tier's worth of sprite jobs out at a time (they go ahead of chunk bakes); yours first
      if (!this.badKeys.has(key) && !this.upKeys.has(key) && this.pool && !this.pool.dead && this.sprOut < this.tier.sprJobs) {
        const jk = 's' + key;
        if (!this.pool.has(jk)) {
          this.n.sprReq++; this.sprOut++;
          this.pool.request(jk, 'sprite', { kind, key, a: args }, this.sprPrio, (r, err) => {
            this.sprOut--;
            if (err || !r || !r.g) { this.n.sprErr++; this.badKeys.add(key); if (this.n.sprErr <= 3) console.warn('[art2] sprite failed', key, String(err).slice(0, 300)); return; }
            this.upQ.push(key, r.g); this.upKeys.add(key);
          });
        }
      }
    }
    return fb ? fb() : null;
  }
  _uploadSprites() {
    let n = this.tier.sprUp;
    while (this.upQ.length && n-- > 0) {
      const key = this.upQ.shift(), g = this.upQ.shift();
      this.upKeys.delete(key);
      let ok = false;
      try { ok = this.E.uploadSprite(key, g) !== false; } catch (e) { console.warn('[art2] uploadSprite', key, e); }
      if (ok) this.n.sprUp++; else this.badKeys.add(key);
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
  _have(key) { return this.E.hasSprite(key); }
  _conv(key, make, gen = false) {
    if (this.E.hasSprite(key)) return key;
    if (gen ? this.genBudget-- <= 0 : this.convBudget-- <= 0) return null;
    const t = performance.now();
    let G = null;
    try { G = make(); } catch (e) { console.warn('[art2] fallback sprite', key, e); G = null; }
    if (!G) return null;
    let ok = false;
    try { ok = this.E.uploadSprite(key, G) !== false; } catch (e) { console.warn('[art2] uploadSprite', key, e); }
    if (!ok) return null;
    this.t.convMs += performance.now() - t; gen ? this.n.gen++ : this.n.conv++;
    return key;
  }

  // a person: the provider's figure, or the v1 body converted (upright 8 directions, lying, swimming)
  _ped(p, now, me, F, scale = 1, extraZ = 0) {
    const api = this.api, E = this.E;
    if (p.flags & PF.INVEH) return;
    if (p.d && p.d.ar && p.d.ar.startsWith('pet:')) { this._pet(p, now, F); return; }
    if (p.blink === 3) return;
    const L = api.pedLook(p, now), f = p.flags, app = p.d.app || {};
    const d8 = dir8(p.ra);
    let pose = L.pose, fr = L.fr;
    const lying = !L.upright && (pose === 'down' || pose === 'dead') && !L.flying && !L.swimming;
    let ppose = L.swimming ? 'swim' : L.upright ? (pose === 'move' ? 'walk' + L.lvl : pose) : lying ? pose : pose === 'roll' ? 'roll' : 'down';
    let lift = 0;
    if (L.flying) { const k = L.flT / (p.flingDur || 1); lift = Math.sin(Math.PI * k) * 20; }
    const A2 = this.prov.peds ? this._app(app, p.d.ar) : null, pf = this.prov.peds && this.Pd.pedFrame ? this.Pd.pedFrame(ppose, fr) : fr;
    const key = this.prov.peds ? this.Pd.pedKey(A2, ppose, d8, pf, p.extra | 0) : null;
    const sk = this._spr('peds', 'ped', key, [A2, ppose, d8, pf, p.extra | 0], () => (L.upright || L.swimming ? this._fbUpright(app, d8, pose === 'move' ? 'move' + L.lvl : pose, fr, p.extra | 0, L.swimming) : this._fbLying(app, pose === 'dead' ? 1 : 0, p.ra + (L.flying || pose === 'roll' ? (now * 15 + p.id) % TAU : 0))));
    const key2 = sk || (p._v2k && this.E.hasSprite(p._v2k) ? p._v2k : null); // (the last one while a new one is made)
    if (!key2) return;
    p._v2k = key2;
    const o = this.opts;
    o.alpha = 1; o.flash = L.hitK > 0.4 ? L.hitK - 0.4 : 0; o.xray = !!me; o.flipX = false; o.shadow = true; o.tint = null;
    if (f & PF.GHOST) o.alpha = 0.45 + 0.2 * Math.sin(now * 8);
    if (p.blink) o.alpha *= Math.floor(now * (p.blink === 1 ? 3 : 10)) % 2 ? 0.18 : 1;
    const hx = L.hitK ? Math.cos(p.hitA) * 4 * L.hitK : 0, hy = L.hitK ? Math.sin(p.hitA) * 3 * L.hitK : 0;
    const z0 = this._z0(p, L.swimming) + lift + extraZ;
    E.drawSprite(key2, p.rx + hx, p.ry + hy, z0, o);
    this.n.drawn++;
    if (f & PF.UMBRELLA) {
      const i = p.id % api.UMBRELLA_COLORS.length, uk = this._conv(`v1um|${i}`, () => { const cv = api.umbrellaSprite(i); return fromCanvas(cv, cv.width / 2, cv.height / 2, () => 2); });
      if (uk) { o.flash = 0; E.drawSprite(uk, p.rx, p.ry, z0 + 46, o); }
    }
    void scale;
  }
  _fbUpright(app, d8, pose, fr, w, swim) {
    const kneel = pose === 'kneel';
    if (kneel) { pose = 'carry'; fr = 0; }
    const body = bodySprite(app, d8, pose, fr, w);
    const key = `v1u|${akey(app)}|${d8}|${pose}|${fr}|${w}|${swim ? 1 : 0}|${kneel ? 1 : 0}|${body ? 'b' : 'c'}`;
    return this._conv(key, () => {
      const api = this.api, [d, mirror0] = baseDir(d8);
      const spr = body || charSprite(app, d, pose, fr, w), mirror = body ? false : mirror0;
      const bs = api.PED_BUILD_SCALE[app.bd !== undefined ? app.bd : 1] || 1, sc = api.CSCALE * (0.92 + 0.08 * bs);
      const rows = swim ? 26 : kneel ? 34 : CH;
      const w2 = Math.ceil(CW * sc * bs), h2 = Math.ceil(rows * sc);
      const [cv, g] = this._sized(0, w2, h2);
      g.save(); if (mirror) { g.translate(w2, 0); g.scale(-1, 1); }
      g.drawImage(spr, 0, 0, CW, rows, 0, 0, w2, h2); g.restore();
      // feet on the ground point; kneeling sinks the body; swimming shows head and shoulders at the surface
      const ay = swim ? h2 + 2 : kneel ? Math.round((FOOT_Y - 8) * sc) : Math.round(FOOT_Y * sc);
      return fromCanvas(cv, w2 >> 1, ay, (x, y) => Math.max(0, ay - y), FACE_N, F_CHAR);
    });
  }
  _fbLying(app, kind, ang) {
    const ly = lyingSprite(app, kind);
    if (!ly) return null;
    const ai = quant(ang + Math.PI, 16);
    return this._conv(`v1l|${akey(app)}|${kind}|${ai}`, () => {
      const sc = 1.25, R = Math.ceil(Math.hypot(LW, LH) * sc / 2) + 2;
      const [cv, g] = this._sized(0, R * 2, R * 2);
      g.translate(R, R); g.rotate(ai * TAU / 16); g.drawImage(ly, -LW * sc / 2, -LH * sc / 2, LW * sc, LH * sc);
      return fromCanvas(cv, R, R, () => 2, UP_N, F_CHAR);
    });
  }
  _pet(p, now, F) {
    const kind = p.d.ar.slice(4), sp = p.as || 0, E = this.E;
    const A = this.prov.actors && this.A.animalKey ? this.A : null;
    const pose = sp > 70 ? 'run' : sp > 12 ? 'walk' : now - (p.stillSince ?? now) > 1.2 ? 'sit' : 'idle';
    const fr = pose === 'run' ? Math.floor(now * 14 + p.id) % 4 : pose === 'walk' ? Math.floor(now * 8 + p.id) % 4 : 0, d8 = dir8(p.ra);
    const n = A && A.ANIMAL_FRAMES ? A.ANIMAL_FRAMES[pose] || 1 : 4, key = A ? A.animalKey(kind, pose, d8, fr % n) : null;
    const sk = this._spr('actors', 'animal', key, [kind, pose, d8, fr % n], () => this._fbPet(kind, pose, fr, p.ra));
    if (sk) { this.opts.alpha = 1; this.opts.flash = 0; this.opts.xray = false; E.drawSprite(sk, p.rx, p.ry, this._z0(p, false), this.opts); this.n.drawn++; }
    void F;
  }
  _fbPet(kind, pose, fr, ra) {
    const art = ANIMAL_ART[kind];
    if (!art || !atlas.animals) return null;
    const f = art.f, r = !f ? art.r : pose === 'run' ? f.run[fr] : pose === 'walk' ? f.walk[fr] : pose === 'sit' ? f.sit : f.idle;
    const top = art.view === 'top', ai = top ? quant(ra, 16) : Math.cos(ra) < -0.2 ? 1 : 0;
    return this._conv(`v1a|${kind}|${r.join(',')}|${ai}`, () => {
      const [sx, sy, sw, sh] = r, pad = art.pad || 0;
      if (top) {
        const k = 0.9, R = Math.ceil(Math.hypot(sw, sh) * k / 2) + 2;
        const [cv, g] = this._sized(0, R * 2, R * 2);
        g.translate(R, R); g.rotate(ai * TAU / 16); g.drawImage(atlas.animals, sx, sy, sw, sh, -sw * k / 2, -sh * k / 2, sw * k, sh * k);
        return fromCanvas(cv, R, R, () => 6, UP_N, F_CHAR);
      }
      const k = 0.75, w = Math.ceil(sw * k), h = Math.ceil(sh * k);
      const [cv, g] = this._sized(0, w, h);
      if (ai) { g.translate(w, 0); g.scale(-1, 1); }
      g.drawImage(atlas.animals, sx, sy, sw, sh, 0, 0, w, h);
      const ay = Math.round((sh - pad) * k);
      return fromCanvas(cv, w >> 1, ay, (x, y) => Math.max(0, ay - y), FACE_N, F_CHAR);
    });
  }

  // a vehicle: the provider's model at heading hi of N, or the v1 car (top view raised on its side walls)
  _veh(v, now, me) {
    const def = VEHICLE_BY_INDEX[v.d.m];
    if (!def) return;
    const E = this.E, api = this.api, f = v.flags, N = this.tier.N;
    const sinking = def.kind !== 'boat' && WATER_T[this.map.tileAtPx(v.rx, v.ry)] === 1, sk = Math.min(1, (v.sinkT || 0) / 3);
    let key = null, st = null, hi = 0;
    if (this.prov.actors && this.A.vehicleKey) {
      hi = quant(v.ra, N);
      st = this.A.vehState ? this.A.vehState(f, Math.floor(now * 6) % 2 ? 1 : 2) : { lights: !!(f & VF.LIGHTS), siren: f & VF.SIREN ? 1 : 0, brake: !!(f & VF.BRAKE), wreck: !!(f & VF.WRECK), burn: !!(f & VF.BURN) };
      key = this.A.vehicleKey(v.d, st, hi, N);
    }
    const sk1 = this._spr('actors', 'vehicle', key, [v.d, st, hi, N], () => this._fbVeh(v, def, quant(v.ra, 32)));
    const sk2 = sk1 || (v._v2k && this.E.hasSprite(v._v2k) ? v._v2k : null);
    if (!sk2) return;
    v._v2k = sk2;
    const o = this.opts;
    o.alpha = sinking ? 1 - 0.75 * sk : 1; o.flash = 0; o.xray = !!me; o.flipX = false; o.shadow = !sinking; o.tint = null;
    if (v.blinkUntil > now) o.alpha *= Math.floor(now * 10) % 2 ? 0.25 : 1;
    const lean = def.kind === 'boat' ? 0 : -(v.lean || 0) * (def.kind === 'bike' ? 2.5 : 1.6);
    const z0 = this._z0(v, def.kind === 'boat') - (sinking ? sk * 8 : 0);
    E.drawSprite(sk2, v.rx - Math.sin(v.ra) * lean, v.ry, Math.max(0, z0), o);
    this.n.drawn++;
    // riders on bikes and jet skis sit in the open
    if (def.kind === 'bike' || def.id === 'jetski') {
      const seats = def.kind === 'bike' ? api.SEAT_BIKE : api.SEAT_JETSKI, lift = api.vehLift(def) + 2;
      for (const p of this.S.ents.values()) {
        if (p.kind !== K.PED || p.parent !== v.id || !p.d || (p.flags & PF.DEAD)) continue;
        const seat = seats[(p.flags & PF.PASSENGER) ? 1 : 0];
        const c = Math.cos(v.ra), s = Math.sin(v.ra), x = v.rx + c * seat[0] - s * seat[1], y = v.ry + s * seat[0] + c * seat[1];
        const d8 = dir8(v.ra), app = p.d.app || {}, pose = def.id === 'bicycle' ? 'pedal' : 'ride', A2 = this.prov.peds ? this._app(app, p.d.ar) : null;
        const pk = this.prov.peds ? this.Pd.pedKey(A2, pose, d8, 0, p.extra | 0) : null;
        const rk = this._spr('peds', 'ped', pk, [A2, pose, d8, 0, p.extra | 0], () => this._fbRider(app, d8));
        if (rk) { o.xray = p.id === this.S.myPedId; o.alpha = 1; E.drawSprite(rk, x, y, z0 + (pk && this.E.hasSprite(pk) ? 0 : lift), o); }
      }
    }
  }
  _fbVeh(v, def, hi) {
    const wreck = !!(v.flags & VF.WRECK), d = v.d;
    return this._conv(`v1v|${d.m}|${d.p}|${d.vr}|${d.tn}|${wreck ? 1 : 0}|${hi}|${atlas.ready ? 1 : 0}`, () => {
      const lift = Math.max(1, Math.round(this.api.vehLift(def))), a = hi * TAU / 32;
      const R = Math.ceil(Math.hypot(def.L, def.W) / 2) + 6, w = R * 2;
      const [top, tg] = this._sized(0, w, w);
      tg.translate(R, R); tg.rotate(a); if (wreck) drawVehicleWreck(tg, d, def); else drawVehicle(tg, d, def, 0);
      const side = vehicleSide(d, def, wreck), sw = side.width / 2, sh = side.height / 2;
      const [sc, sg] = this._sized(1, w, w);
      sg.translate(R, R); sg.rotate(a); sg.drawImage(side, -sw / 2, -sh / 2, sw, sh);
      const G = gbuf(w, w + lift, R, R + lift);
      // the side walls stacked up the screen (height k), then the top view on them
      const sd = sc.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, w).data;
      for (let k = 0; k < lift; k++) for (let y = 0; y < w; y++) for (let x = 0; x < w; x++) {
        const s = (y * w + x) * 4;
        if (sd[s + 3] < 128) continue;
        put(G, x, y + lift - k, [sd[s], sd[s + 1], sd[s + 2]], k, FACE_N);
      }
      return fromCanvas(top, R, R + lift, () => lift + 1, UP_N, 0, G, 0);
    });
  }
  _fbRider(app, d8) {
    const body = bodySprite(app, d8, 'idle', 0, 0);
    if (!body) return null;
    return this._conv(`v1r|${akey(app)}|${d8}`, () => {
      const sc = this.api.CSCALE * 0.92, rows = this.api.RIDER_H, w = Math.ceil(CW * sc), h = Math.ceil(rows * sc);
      const [cv, g] = this._sized(0, w, h);
      g.drawImage(body, 0, 0, CW, rows, 0, 0, w, h);
      const ay = h - Math.round(4 * sc);
      return fromCanvas(cv, w >> 1, ay, (x, y) => Math.max(0, ay - y), FACE_N, F_CHAR);
    });
  }

  _train(c, now, myTrain) {
    const def = TRAIN_CARS[c.d.c];
    if (!def) return;
    const inside = c.d.tr === myTrain, N = this.tier.N;
    const mode = `${inside && c.d.c !== 0 ? 'in' : 'roof'}${c.flags & 8 ? '-lit' : ''}${c.flags & 16 ? '-empty' : ''}`;
    let key = null, hi = quant(c.ra, N);
    if (this.prov.actors && this.A.trainKey) key = this.A.trainKey(c.d.c, mode, hi, N);
    const sk = this._spr('actors', 'train', key, [c.d.c, mode, hi, N], () => this._fbTrain(c, inside, quant(c.ra, 32)));
    if (!sk) return;
    const o = this.opts; o.alpha = 1; o.flash = 0; o.xray = false; o.shadow = true;
    this.E.drawSprite(sk, c.rx, c.ry, 0, o); this.n.drawn++;
  }
  _fbTrain(c, inside, hi) {
    const def = TRAIN_CARS[c.d.c];
    return this._conv(`v1t|${c.d.c}|${inside ? 1 : 0}|${c.flags & 26}|${hi}`, () => {
      const R = Math.ceil(Math.hypot(def.L, def.W) / 2) + 8, H = 14, w = R * 2;
      const [cv, g] = this._sized(0, w, w);
      drawTrainCar(g, { rx: R, ry: R, ra: hi * TAU / 32, d: c.d, flags: c.flags & ~4 }, inside, 0);
      // the car's own outline, darkened, stacked up as its sides; the roof (or the lit inside) on top
      const G = gbuf(w, w + H, R, R + H), d = cv.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, w).data;
      for (let k = 0; k < H; k++) for (let y = 0; y < w; y++) for (let x = 0; x < w; x++) {
        const s = (y * w + x) * 4;
        if (d[s + 3] < 200) continue;
        put(G, x, y + H - k, [d[s] * 0.45, d[s + 1] * 0.45, d[s + 2] * 0.5], k, FACE_N);
      }
      return fromCanvas(cv, R, R + H, () => H, UP_N, 0, G, 0);
    });
  }
  // the server appearance as the peds provider wants it (adapted once per descriptor, with its archetype)
  _app(a, ar) {
    if (!this.Pd || !this.Pd.adaptApp || !a) return a;
    let v = this.adapted.get(a);
    if (!v) { v = this.Pd.adaptApp(a, ar || null); this.adapted.set(a, v); }
    return v;
  }

  _small(kind, key, args, fb, x, y, z0) {
    const sk = this._spr('actors', kind, key, args, fb);
    if (!sk) return;
    const o = this.opts; o.alpha = 1; o.flash = 0; o.xray = false; o.shadow = true;
    this.E.drawSprite(sk, x, y, z0, o); this.n.drawn++;
  }
  _fbCanvasThing(key, draw, size, z) {
    return this._conv(key, () => { const [cv, g] = this._sized(0, size, size); g.translate(size / 2, size / 2); draw(g); return fromCanvas(cv, size / 2, size / 2 + z, () => z, UP_N, 0, gbuf(size, size + z, size / 2, size / 2 + z), 0); });
  }

  // ---- the moving things on screen -------------------------------------------------------------------------
  _entities(F) {
    const S = this.S, now = F.now, A = this.prov.actors ? this.A : null;
    this.opts = this.opts || { alpha: 1, flipX: false, flash: 0, xray: false, shadow: true, tint: null };
    const meVeh = S.pred && S.pred.kind === 'veh' ? S.ctrlId : -1;
    for (const v of F.vehs) { this.sprPrio = v.id === meVeh ? -3 : -1; this._veh(v, now, v.id === meVeh); }
    for (const p of F.peds) { this.sprPrio = p.id === S.myPedId ? -3 : -1; this._ped(p, now, p.id === S.myPedId, F); }
    this.sprPrio = -1;
    for (const p of F.riders) this._ped(p, now, p.id === S.myPedId, F, 0.8, 8);
    for (const c of F.cars) this._train(c, now, F.myTrain);
    for (const c of F.crates) {
      const st = c.flags & 3;
      let lift = st === 0 ? c.hp * 64 : st === 1 ? 26 : 0;
      if (st === 2) { const par = S.ents.get(c.parent), pd = par && par.d ? VEHICLE_BY_INDEX[par.d.m] : null; if (pd) lift = this.api.vehLift(pd) / 0.6 + 4; }
      const tier = c.d.t, label = c.d.l || '';
      const hi = quant(c.ra || 0, 16), key = A && A.crateKey ? A.crateKey(tier, label, hi, 16) : null;
      const par = st === 2 ? S.ents.get(c.parent) : null;
      this._small('crate', key, [tier, label, hi, 16], () => this._fbCanvasThing(`v1c|${tier}|${label}`, (g) => drawCrate(g, tier, label, 0), 36, 10), c.rx, c.ry, this._z0(par || c, false) + lift * 0.6);
    }
    for (const b of F.bags) {
      const hi = quant(b.ra || 0, 16), key = A && A.bagKey ? A.bagKey(b.d.t, hi, 16) : null;
      this._small('bag', key, [b.d.t, hi, 16], () => this._fbCanvasThing(`v1b|${b.d.t}`, (g) => drawBag(g, b.d.t, 0), 34, 3), b.rx, b.ry, this._z0(b, false));
    }
    for (const b of F.balls) {
      const t = b.d.t | 0, spin = quant(b.ra || 0, 4), key = A && A.ballKey ? A.ballKey(t, spin) : null;
      this._small('ball', key, [t, spin], () => this._genBall(t), b.rx, b.ry, (b.extra || 0) * 2 + this._z0(b, false));
    }
    for (const pr of F.projs) {
      const N = 32, hi = quant(pr.ra, N), w = pr.d.w | 0, key = A && A.projKey ? A.projKey(w, hi, N) : null;
      this._small('proj', key, [w, hi, N], () => this._genRocket(quant(pr.ra, 16)), pr.rx, pr.ry, 14 + ((pr.rz || 0) > 0.01 ? DECK_Z * pr.rz : 0));
    }
    // the birds (simulated in main.js): the providers' pigeons and gulls, flapping when they fly
    const ck = A && A.critterKey && A.critterInfo;
    for (const b of this.api.birds) {
      let k = null;
      if (ck) { // (frames: the critter's ground pose, its take-off frame, then its flight cycle)
        const kind = b.gull ? 'seagull' : 'pigeon', info = A.critterInfo(kind), nf = info ? info.frames : 1, fps = (info && info.fps) || 10;
        const air = info && info.air ? info.air : [0, nf - 1], ground = info && info.ground ? info.ground[0] : 0;
        const fr = !b.fly ? ground : b.fly < 0.12 && info && info.takeoff !== undefined ? info.takeoff : air[0] + Math.floor(b.fly * fps) % (air[1] - air[0] + 1);
        const left = Math.cos(b.a) < 0;
        k = this._spr('actors', 'critter', A.critterKey(kind, fr, left), [kind, fr, left], null);
      }
      k = k || this._genBird(!!b.gull, b.fly ? 1 : 0);
      if (!k) continue;
      const o = this.opts; o.alpha = 1; o.xray = false; o.flash = 0; o.shadow = true;
      this.E.drawSprite(k, b.x, b.y, b.fly ? Math.min(70, 8 + b.fly * 30) : 0, o);
    }
    // muzzle flashes (S.flashes, lit in _lights): the providers' flash sprite along the shot
    if (A && A.muzzleKey) for (const f of S.flashes) {
      if (f.kind === 'boom' || f.a === undefined) continue;
      const hi = quant(f.a, 16), frm = f.t > 0.045 ? 0 : f.t > 0.02 ? 1 : 2;
      const k = this._spr('actors', 'muzzle', A.muzzleKey(1, hi, 16, frm), [1, hi, 16, frm], null);
      if (k) { const o = this.opts; o.alpha = 1; o.flash = 0; o.xray = false; o.shadow = false; this.E.drawSprite(k, f.x, f.y, 18, o); }
    }
  }
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

  // ---- generated little sprites (particles, decals, birds, balls, rockets) -----------------------------------
  _genBall(t) {
    return this._conv(`gball|${t}`, () => {
      const G = gbuf(17, 17, 8, 15), c = t === 1 ? [247, 226, 122] : [246, 246, 246];
      for (let y = 0; y < 15; y++) for (let x = 0; x < 15; x++) {
        const dx = x - 7, dy = y - 7, d = Math.hypot(dx, dy);
        if (d > 7.2) continue;
        const edge = d > 6.2, n = [128 + dx * 16, 128 + dy * 16, 220, 255];
        put(G, x + 1, y, edge ? [27, 35, 51] : (t !== 1 && (dx * dx + dy * dy < 7 || (x + y) % 7 === 0)) ? [30, 30, 34] : c, Math.round(7 + Math.sqrt(Math.max(0, 49 - d * d))), n);
      }
      return G;
    }, true);
  }
  _genRocket(hi) {
    return this._conv(`grock|${hi}`, () => {
      const [cv, g] = this._sized(0, 24, 24);
      g.translate(12, 12); g.rotate(hi * TAU / 16);
      g.fillStyle = '#4a5a2a'; g.fillRect(-8, -3, 16, 6); g.fillStyle = '#c8262b'; g.fillRect(6, -3, 3, 6);
      return fromCanvas(cv, 12, 12, () => 3);
    }, true);
  }
  _genBird(gull, fly) {
    return this._conv(`gbird|${gull ? 1 : 0}|${fly}`, () => {
      const G = gbuf(fly ? 11 : 7, 5, fly ? 5 : 3, 4), c = gull ? [242, 242, 242] : [138, 143, 154], h = gull ? [255, 194, 61] : [58, 63, 74];
      if (fly) { for (let x = 0; x < 11; x++) put(G, x, x === 5 ? 1 : 2, c, 4); put(G, 5, 1, h, 5); }
      else { for (let y = 1; y < 4; y++) for (let x = 0; x < 5; x++) put(G, x, y, c, 4 - y); put(G, 5, 1, h, 4); }
      return G;
    }, true);
  }
  // particle types (render/fx.js): 1 blood, 2 smoke/steam, 3 fire, 4 sparks, 5 water, 6 geyser, 8 paper
  _genParticle(type, size, rgb) {
    return this._conv(`gfx|${type}|${size}|${rgb[0]},${rgb[1]},${rgb[2]}`, () => {
      if (type === 2) { // a soft puff: a dithered disc (the engine keeps texels whole)
        const r = size, G = gbuf(r * 2 + 1, r * 2 + 1, r, r * 2);
        for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
          const d = Math.hypot(x, y) / r;
          if (d > 1 || ((x + y) & 1 && d > 0.55) || ((x & 1) && (y & 1) && d > 0.8)) continue;
          put(G, x + r, y + r, rgb.map((v) => Math.min(255, v + (1 - d) * 18)), r - y, [128 + x * 6, 128 + y * 6, 230, 255], F_NOCAST);
        }
        return G;
      }
      const s = Math.max(1, size), G = gbuf(s, s, s >> 1, s - 1), emi = type === 3 || type === 4 ? 220 : 0;
      for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) put(G, x, y, rgb, s - 1 - y, UP_N, F_NOCAST, emi);
      return G;
    }, true);
  }
  _particles(F) {
    const fx = F.fx, E = this.E, o = this.opts, A = this.prov.actors && this.A.fxKey && this.A.v1ParticleFx ? this.A : null;
    const x0 = this.vx0 - 40, x1 = this.vx1 + 40, y0 = this.vy0 - 40, y1 = this.vy1 + 120;
    o.flash = 0; o.xray = false; o.shadow = false;
    for (let i = 0; i < fx.p.length; i++) {
      const p = fx.p[i];
      if (!p.on || p.x < x0 || p.x > x1 || p.y < y0 || p.y > y1) continue;
      const k = p.life / p.max;
      let key = null;
      if (A && A.v1ParticleFx) { const name = A.v1ParticleFx(p), frm = A.v1ParticleFrame(p); key = this._spr('actors', 'fx', A.fxKey(name, frm), [name, frm], null); }
      if (!key) {
        const size = p.type === 2 ? Math.max(3, Math.min(20, Math.round(p.size * 1.3))) : Math.max(1, Math.min(14, Math.round(p.size)));
        key = this._genParticle(p.type, size, rgbOf(p.color));
      }
      if (!key) continue;
      o.alpha = p.type === 2 ? Math.min(1, (1 - k) * 6) * k * 0.9 + 0.1 : p.type === 3 ? Math.min(1, k * 1.5) : p.type === 8 ? 1 : Math.min(1, k * 2);
      E.drawSprite(key, p.x, p.y, Math.max(0, p.z * (p.type === 8 ? 0.5 : 0.3)), o); // (v1's heights)
    }
    // wind-blown leaves (render/flora): their simulation runs without drawing
    const fl = this.S.flora;
    if (fl && fl.leaves && fl.leavesFrame) {
      fl.leavesFrame(NULL_CTX, F.view, F.dt, false);
      const COLS = [[63, 122, 52], [142, 188, 84], [200, 160, 56], [232, 138, 168]];
      o.alpha = 1;
      for (const l of fl.leaves) { if (!l.on) continue; const k2 = this._genParticle(8, 2, COLS[l.c] || COLS[0]); if (k2) E.drawSprite(k2, l.x, l.y, l.z * 0.3, o); }
    }
  }
  // decals (render/fx.js ring): the same fading and rain-washing as v1's drawDecals
  _decals(F) {
    const fx = F.fx, E = this.E, now = F.now, wet = F.rain, A = this.prov.actors && this.A.v1DecalFx && this.A.fxKey ? this.A : null;
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
      if (A && !(d.type === 1 && d.size < 4)) { const name = A.v1DecalFx(d), frm = A.v1DecalFrame(d); key = this._spr('actors', 'fx', A.fxKey(name, frm), [name, frm], null); } // (droplet spots stay v1-sized)
      key = key || this._genDecal(d);
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
    if (night > 0.35) {
      for (const p of F.peds) {
        const mine = p.id === S.myPedId;
        if ((!mine && !(p.flags & PF.BADGE)) || (p.flags & (PF.INVEH | PF.DEAD | PF.DOWN))) continue;
        this._light(p.rx + Math.cos(p.ra) * 8, p.ry + Math.sin(p.ra) * 8, 30 + this._z0(p, false), mine ? 230 : 200, C.white, 1.6 * night, [p.ra, 0.32, mine ? 230 : 200]);
      }
      const sp = F.sp;
      this._light(sp.x, sp.y, 40 + (sp.z ? DECK_Z * sp.z : 0), 100, C.moon, 0.5 * night);
    }
    for (const f of S.flashes) {
      if (f.kind === 'boom') { const e = Math.min(1.6, f.t * 3.2); this._light(f.x, f.y, 30, f.r * 1.3, C.fire, 2.4 * e); }
      else this._light(f.x, f.y, 20, f.r || 150, C.flash, 2.2 * Math.min(1.4, f.t * 22));
    }
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
      if (!inV(p.x, p.y) || p.kind === 'home' || p.kind === 'evidence' || p.kind === 'reception') return;
      this._light(p.x, p.y, 16, p.kind === 'atm' ? 60 : 120, p.kind === 'atm' ? C.cyan : C.warm, 1.2 * nightK);
    });
  }

  // ---- the world changing under the bakes ---------------------------------------------------------------------
  // A prop smashed or put back (main.js setPropBroken / propfix): every worker's copy of the world learns
  // it and the chunks it shows in are baked again (the old bake stays up until the new one lands).
  propChanged(i) {
    const p = this.map.props[i];
    if (!p) return;
    if (this.pool && !this.pool.dead) this.pool.broadcast('patch', { props: [[i, p.broken ? { a: p.broken.a || 0 } : null]] });
    // its screen footprint: standing up to ~320 px above its ground point, debris round it
    for (let cy = Math.floor((p.y - 320) / CHUNK); cy <= Math.floor((p.y + 40) / CHUNK); cy++)
      for (let cx = Math.floor((p.x - 120) / CHUNK); cx <= Math.floor((p.x + 120) / CHUNK); cx++) { const k = cy * 1000 + cx; this.ver.set(k, (this.ver.get(k) || 0) + 1); }
  }
  // after a reconnect: the server's list of what is broken replaces the workers' and everything rebakes
  resync() {
    const list = [], props = this.map.props || [];
    for (let i = 0; i < props.length; i++) if (props[i].broken) list.push([i, { a: props[i].broken.a || 0 }]);
    if (this.pool && !this.pool.dead) this.pool.broadcast('patch', { props: list, reset: true });
    for (const k of this.chunkState.keys()) this.ver.set(k, (this.ver.get(k) || 0) + 1);
  }

  // ---- reporting ---------------------------------------------------------------------------------------------
  stats() {
    const es = this.E.stats ? this.E.stats() : {};
    return {
      q: this.q, providers: this.prov, chunks: this.chunkState.size, fallbacks: this.fallbacks.size, results: this.results.size,
      pool: this.pool ? this.pool.stats() : null, t: { ...this.t, bakeAvg: this.t.bakeN ? this.t.bakeSum / this.t.bakeN : 0 }, n: { ...this.n },
      upQ: this.upQ.length / 2, badKeys: this.badKeys.size, lastErr: this.lastErr, engine: es, part: this.part,
    };
  }
  diag() {
    const p = this.pool ? this.pool.stats() : null, t = this.t;
    return `q${this.q} chunks ${this.chunkState.size}+${this.fallbacks.size}v1 (queue ${p ? p.queued : '-'}, run ${p ? p.running : '-'}) bake avg ${(t.bakeN ? t.bakeSum / t.bakeN : 0).toFixed(0)} max ${t.bakeMax.toFixed(0)} ms  sprites req ${this.n.sprReq} up ${this.n.sprUp} v1 ${this.n.conv} gen ${this.n.gen}  lights ${this.n.lights}  host ${t.frameMs.toFixed(1)} ms${this.lastErr ? '  err ' + this.lastErr.slice(0, 60) : ''}`;
  }
}

// a 2D context that draws nothing (to run v1's simulate-and-draw helpers for their simulation alone)
const NULL_CTX = new Proxy({}, { get: (t, k) => (k in t ? t[k] : () => {}), set: (t, k, v) => { t[k] = v; return true; } });
