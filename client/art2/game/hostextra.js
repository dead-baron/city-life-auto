// What the renderer (host.js) needs only now and then, loaded the first time it's needed - not before the first frame
// (the renderer's code budget: tools/perf.mjs; docs/WORLD-V3.md 8.12.1): World v3's window swap (reworld), the debug
// overlay's line (diag) and the 2D stand-in for the engine (?art2stub, testing).
import { CHUNK } from './chunkgeom.js';
import { canopyGrid } from './canopy.js';
import { worldData } from './host.js';
import { TILE } from '../../../shared/constants.js';

// World v3's window moved (client/main.js swapWorld, docs/WORLD-V3.md 8.12): the same renderer on the new window - the
// bake workers get it (each its own copy, as at the start), the grids worked out from the map are dropped; the chunks
// baked stay (a chunk is the same art in both windows: a window keeps a region round the player). host.js setMap has
// swapped the map in already; old is the window the workers had until now.
export function reworld(w, map, old) {
  const t = performance.now(), E = w.E, n = CHUNK / TILE;
  // A chunk baked against the old window while the player was outside it (a teleport) has its walls and open sea in
  // it - baked again, as is one within a chunk of the old window's edge; the rest is the same art in both windows. So
  // are the bakes for such chunks still on their way (the screen's, asked for once the camera had jumped: they come
  // back with the old version and are dropped), and the stand-ins drawn from the old window there (the sea's, where
  // the old window had no land: 8.9's open item 4 - they stayed up until a bake landed, 40 s and more).
  const outside = (k) => {
    const cx = k % 1000, cy = Math.floor(k / 1000), x0 = (cx - 1) * n, y0 = (cy - 1) * n, x1 = (cx + 2) * n - 1, y1 = (cy + 2) * n - 1;
    return !(old && old.inside && old.inside(x0, y0) && old.inside(x1, y1));
  };
  const bump = new Set();
  for (const k of w.chunkState.keys()) if (outside(k)) bump.add(k);
  for (const k of w.wantChunks.keys()) if (outside(k)) bump.add(k);
  for (const r of w.results.values()) if (outside(r.key)) bump.add(r.key);
  for (const k of bump) w.ver.set(k, (w.ver.get(k) || 0) + 1);
  for (const k of [...w.fallbacks]) {
    if (!outside(k)) continue;
    const cx = k % 1000, cy = Math.floor(k / 1000);
    w.phs.delete(k);
    if (E.hasFallback && E.hasFallback(cx, cy) && E.dropChunk) { E.dropChunk(cx, cy); w.fallbacks.delete(k); }
  }
  for (const k of [...w.phs.keys()]) if (outside(k)) w.phs.delete(k);
  w.seaK = null;
  if (E.setCanopy) { try { E.setCanopy(canopyGrid(map)); } catch (e) { console.warn('[art2] canopy', e); } }
  if (w.pool && w.pool.reworld) w.pool.reworld(worldData(map));
  w.workerMap = map;
  w.resync(false);
  w.t.reworld = performance.now() - t;
  w.n.reworld = (w.n.reworld || 0) + 1;
}

// the debug overlay's line about the renderer (client/main.js, ?debug)
export function diag(w) {
  const p = w.pool ? w.pool.stats() : null, t = w.t;
  return `q${w.q}${w.lowMem ? ' lowmem' : ''} chunks ${w.chunkState.size}+${w.fallbacks.size} placeholder (workers ${p ? p.workers + '/' + p.slots + (p.restarted ? ' restarted ' + p.restarted : '') : '-'}${w.n.revived ? ' new pool ' + w.n.revived : ''}, queue ${p ? p.queued : '-'}, run ${p ? p.running : '-'}, failing ${w.chunkFails.size}) bake avg ${(t.bakeN ? t.bakeSum / t.bakeN : 0).toFixed(0)} max ${t.bakeMax.toFixed(0)} ms (kept ${w.n.kept || 0}, ahead ${w.pre ? w.pre.done + '+' + w.pre.had : 0})${w.late ? ` late ${w.late.frames}/${w.late.of}` : ''}  sprites req ${w.n.sprReq} up ${w.n.sprUp} now ${w.n.sync} gen ${w.n.gen} out ${w.sprOut}  fades ${w.fades.size}  lights ${w.n.lights}  lost ${w.lost}  host ${t.frameMs.toFixed(1)} ms${w.lastErr ? '  err ' + w.lastErr.slice(0, 60) : ''}`;
}

// ---- a 2D stand-in for the engine (?art2stub): the same API, painter's order, no lighting ---------------
export class StubEngine {
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
