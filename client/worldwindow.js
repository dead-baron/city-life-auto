// The page's window of the world (World v3, docs/WORLD-V3.md 8.12): the 3 x 3 regions round the player
// (shared/regionpack.js regionsNear - shifted in at the frame's edge, so always 3 x 3 where the frame has them), kept
// by the city worker (client/worldgen.js) and moved as the player crosses a region's border:
//   - near the border of the region the window was centred on (within `near` tiles), the regions the next window
//     would bring in are fetched early;
//   - once the player is `past` tiles beyond it (a little hysteresis: no back and forth along a border), want() says
//     which window to move to, and assemble() builds it from what was fetched (shared/regionpack.js assembleCity with
//     opts.window), the page swaps it in (client/main.js) and calls moved();
//   - a player outside the window altogether (a teleport, a respawn) moves it at once.
// Today's world is 3 x 3 regions: its window is the whole map and never moves.
// What's kept: each region's file as it came (gzipped: about 35-260 KB at v3), the most recently used `keep` of them
// (and in the browser, client/regionstore.js: the worker's fetchRegion looks there first).
// Each region is checked as it's assembled against the index's signature for it (part 8 item 5): one that doesn't match
// (or doesn't open) is dropped - here and in the browser's store (forget) - and fetched again past every cache; if that
// one doesn't match either, the window isn't assembled and the error says so.
import { assembleCity, regionsNear, regionXYOf, windowRect, regionMatches } from '../shared/regionpack.js';

const OFFS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
const same = (a, b) => !!a && !!b && a.length === b.length && a.every((k, i) => k === b[i]);

export class WindowKeeper {
  // frame: the index's [W, H, R, nx, ny]; fetchRegion(key, fresh) -> the file's bytes as kept (fresh: past every cache);
  // open(kept) -> its raw bytes; sigs: the index's signatures (null: nothing checked); forget(key): drop a kept file
  constructor({ frame, fetchRegion, open = async (b) => b, sigs = null, forget = null, near = 96, past = 16, keep = 24 }) {
    this.frame = frame; this.fetchRegion = fetchRegion; this.open = open; this.sigs = sigs; this.forget = forget; this.refused = [];
    this.near = near; this.past = past; this.keep = Math.max(9, keep);
    this.cache = new Map();   // key -> Promise of its bytes (in the order they were last used)
    this.pending = new Set();
    this.keys = null; this.rect = null; this.home = null;
  }
  // the window round a tile: { keys, rect, home } (home: the region it's centred on)
  windowFor(tx, ty) {
    const keys = regionsNear(this.frame, tx, ty);
    return { keys, rect: windowRect(this.frame, keys), home: regionXYOf(this.frame, tx, ty) };
  }
  get(k, fresh = false) {
    let p = fresh ? null : this.cache.get(k);
    if (p) { this.cache.delete(k); this.cache.set(k, p); return p; }
    this.cache.delete(k);
    p = Promise.resolve().then(() => this.fetchRegion(k, fresh));
    this.cache.set(k, p);
    this.pending.add(p);
    p.then(() => this.pending.delete(p), () => { this.pending.delete(p); if (this.cache.get(k) === p) this.cache.delete(k); });
    this.trim();
    return p;
  }
  prefetch(keys) { for (const k of keys) if (!this.cache.has(k)) this.get(k).catch(() => {}); }
  // (the oldest dropped, never the window's own)
  trim() {
    for (const k of this.cache.keys()) {
      if (this.cache.size <= this.keep) break;
      if (!this.keys || !this.keys.includes(k)) this.cache.delete(k);
    }
  }
  idle() { return Promise.allSettled([...this.pending]); }
  // the first window: round (tx, ty)
  async start(tx, ty) {
    const w = this.windowFor(tx, ty);
    await Promise.all(w.keys.map((k) => this.get(k)));
    this.moved(w);
    return w;
  }
  // the player is at tile (tx, ty): null (the window stays; what may come next is fetched early), or the window to move to
  want(tx, ty) {
    if (!this.rect || !Number.isFinite(tx) || !Number.isFinite(ty)) return null;
    const [x0, y0, w, h] = this.rect, R = this.frame[2];
    const outside = tx < x0 || ty < y0 || tx >= x0 + w || ty >= y0 + h;
    const hx0 = this.home[0] * R, hy0 = this.home[1] * R, hx1 = hx0 + R - 1, hy1 = hy0 + R - 1;
    const d = Math.max(hx0 - tx, tx - hx1, hy0 - ty, ty - hy1, 0);
    if (outside || d >= this.past) {
      const nw = this.windowFor(tx, ty);
      if (same(nw.keys, this.keys)) { this.home = nw.home; return null; }   // (at the frame's edge, or today's world: the same window)
      this.prefetch(nw.keys);
      return nw;
    }
    if (Math.min(tx - hx0, hx1 - tx, ty - hy0, hy1 - ty) < this.near) {
      for (const [dx, dy] of OFFS) { const nw = this.windowFor(tx + dx * this.near, ty + dy * this.near); if (!same(nw.keys, this.keys)) this.prefetch(nw.keys); }
    }
    return null;
  }
  // the plain city of a window (shared/regionpack.js assembleCity's form, with x0, y0, w, h and frame)
  async assemble(indexBytes, win) {
    const files = await Promise.all(win.keys.map((k) => this.region(k)));
    return assembleCity(indexBytes, files, { window: win.rect });
  }
  // a region's raw bytes, checked against its signature (fetched again once if they don't match)
  async region(k) {
    for (let again = false; ; again = true) {
      let raw = null;
      try { raw = await this.open(await this.get(k, again)); } catch { raw = null; }
      if (raw && regionMatches(this.sigs, k, raw)) return raw;
      this.cache.delete(k); this.refused.push(k);
      if (this.forget) { try { await this.forget(k); } catch { /* best effort */ } }
      if (again) throw new Error(`the region ${k} isn't the server's (${raw ? 'its signature differs' : 'a bad file'}), fetched again too`);
    }
  }
  moved(win) { this.keys = win.keys.slice(); this.rect = win.rect.slice(); this.home = win.home ? win.home.slice() : regionXYOf(this.frame, win.rect[0] + win.rect[2] / 2, win.rect[1] + win.rect[3] / 2); this.trim(); }
}
