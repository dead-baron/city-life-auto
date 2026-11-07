// The world's low-detail picture on the page (2026-11-06, the owner on his Pixel 7 Pro flying over the desert: the ground was
// flat tan blocks - the stand-ins of chunks not baked yet). The server keeps every chunk's thumbnail at 1/16 (server/artlow.js,
// kept across builds of the art) and serves them a block of 21 x 21 chunks at a time (a World v3 region: one PNG, ~1 MB at
// most, far less over sea and desert). A chunk not ready is drawn from its thumbnail - the real art, blurred - instead of the
// flat stand-in (standin.js stays for what the server has no thumbnail of yet), and from high up in the air the ground is
// the thumbnails' until the server's chunk comes (host.js highAir: nothing baked on the page).
// Loaded by host.js when the art comes from a server (not part of the renderer's first load: tools/perf.mjs).
//
//   const L = new LowRes(host)     the blocks round the camera and ahead of it fetched as you go (want), each decoded
//                                  once (createImageBitmap, off the page's thread), at most KEEP of them held
//   L.want()                       each frame: the blocks the view and the look-ahead reach
//   L.has(cx, cy)                  the chunk's thumbnail is here
//   L.draw(g, cx, cy, n)           draws it into a 2D context n px square (true), or false
// A block that lands re-draws the stand-ins of its chunks still showing the flat one (_restand).
export const LOW_PX = 48, LOW_BLOCK = 21, CHUNK = 768;
const KEEP = 9, AGAIN_MS = 90000, FAIL_MS = 30000, OUT_MAX = 2;
export const lowWorld = (artKey) => (/-v3$/.test(artKey || '') ? 'v3' : 'today');
export const lowUrl = (cdn, world, bx, by) => `${cdn}low/${world}/${bx}_${by}.png`;
// the x-low-have header (base64 of a bitmap, chunk i of the block: bit i) -> Uint8Array
export function haveOf(b64) {
  if (!b64) return null;
  try { const s = atob(b64), a = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) a[i] = s.charCodeAt(i); return a; } catch { return null; }
}
// which blocks to have: the camera's, the ones the view reaches, and along (vx, vy) for s seconds - nearest first
export function blocksFor(x, y, vx, vy, s, halfW, halfH, grid) {
  const B = LOW_BLOCK * CHUNK, out = [], seen = new Set();
  const add = (px, py) => {
    const bx = Math.floor(px / B), by = Math.floor(py / B), k = by * 1000 + bx;
    if (bx < 0 || by < 0 || bx * LOW_BLOCK >= grid[0] || by * LOW_BLOCK >= grid[1] || seen.has(k)) return;
    seen.add(k); out.push([bx, by]);
  };
  add(x, y);
  for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) add(x + dx * halfW, y + dy * halfH);
  const sp = Math.hypot(vx, vy);
  if (sp > 60) for (let t = 2; t <= s; t += 2) add(x + vx * t, y + vy * t);
  return out;
}

export class LowRes {
  constructor(host, { fetchFn = typeof fetch === 'function' ? fetch.bind(globalThis) : null, decode = typeof createImageBitmap === 'function' ? (b) => createImageBitmap(b) : null } = {}) {
    this.h = host; this.fetch = fetchFn; this.decode = decode;
    this.world = lowWorld(host.artKey); this.base = host.cdn;
    this.blocks = new Map();   // by*1000+bx -> { st: 'out' | 'in' | 'none', img, have, at, used }
    this.out = 0; this.n = { got: 0, bytes: 0, miss: 0, drawn: 0, restand: 0 };
  }
  _key(cx, cy) { return Math.floor(cy / LOW_BLOCK) * 1000 + Math.floor(cx / LOW_BLOCK); }
  has(cx, cy) {
    const b = this.blocks.get(this._key(cx, cy));
    if (!b || !b.img || !b.have) return false;
    const i = (cy % LOW_BLOCK) * LOW_BLOCK + (cx % LOW_BLOCK);
    return !!(b.have[i >> 3] & (1 << (i & 7)));
  }
  draw(g, cx, cy, n) {
    if (!this.has(cx, cy)) return false;
    const b = this.blocks.get(this._key(cx, cy));
    b.used = performance.now();
    g.imageSmoothingEnabled = true;
    try { g.drawImage(b.img, (cx % LOW_BLOCK) * LOW_PX, (cy % LOW_BLOCK) * LOW_PX, LOW_PX, LOW_PX, 0, 0, n, n); } catch { return false; }
    this.n.drawn++;
    return true;
  }
  want() {
    const h = this.h;
    if (!this.fetch || !this.decode || !this.base || !h.grid) return;
    const v = h.camV ? h.camV.out : { x: 0, y: 0 }, hw = (h.vx1 - h.vx0) / 2 || 600, hh = (h.vy1 - h.vy0) / 2 || 600;
    const list = blocksFor(h.camX, h.camY, v.x, v.y, 20, hw + CHUNK, hh + CHUNK, h.grid), now = performance.now();
    for (const [bx, by] of list) {
      if (this.out >= OUT_MAX) break;
      const k = by * 1000 + bx, b = this.blocks.get(k);
      if (b) { b.used = now; if (b.st === 'out' || now < b.at) continue; }
      this._get(bx, by, k, b);
    }
    // (at most KEEP held: the least recently wanted goes - its picture closed)
    if (this.blocks.size > KEEP) {
      const wanted = new Set(list.map(([bx, by]) => by * 1000 + bx));
      const old = [...this.blocks].filter(([k, b]) => !wanted.has(k) && b.st !== 'out').sort((a, b) => a[1].used - b[1].used);
      for (const [k, b] of old.slice(0, this.blocks.size - KEEP)) { if (b.img && b.img.close) b.img.close(); this.blocks.delete(k); }
    }
  }
  _get(bx, by, k, prev) {
    const b = prev || { st: 'none', img: null, have: null, at: 0, used: performance.now() };
    b.st = 'out'; this.blocks.set(k, b); this.out++;
    const done = (ok, again) => { this.out--; b.st = ok ? 'in' : 'none'; b.at = performance.now() + again; };
    this.fetch(lowUrl(this.base, this.world, bx, by)).then(async (res) => {
      if (!res || res.status !== 200) { this.n.miss++; done(!!b.img, FAIL_MS); return; }
      const have = haveOf(res.headers && res.headers.get ? res.headers.get('x-low-have') : null), n = Number(res.headers && res.headers.get ? res.headers.get('x-low-n') : 0) || 0;
      const blob = await res.blob();
      const img = await this.decode(blob);
      if (b.img && b.img.close) b.img.close();
      b.img = img; b.have = have; this.n.got++; this.n.bytes += blob.size || 0;
      // (a block still filling in on the server: looked at again in a while)
      done(true, n >= LOW_BLOCK * LOW_BLOCK ? Infinity : AGAIN_MS);
      this._restand(bx, by);
    }).catch(() => { this.n.miss++; done(!!b.img, FAIL_MS); });
  }
  // the block's chunks still showing the flat stand-in: their thumbnail now (host.js phs, fallbacks; the engine's own)
  _restand(bx, by) {
    const h = this.h, E = h.E;
    if (!E || h.failed) return;
    const inB = (k) => Math.floor((k % 1000) / LOW_BLOCK) === bx && Math.floor(Math.floor(k / 1000) / LOW_BLOCK) === by;
    for (const [k, cv] of h.phs) if (!cv.lo && inB(k)) h.phs.delete(k);
    for (const k of h.fallbacks) {
      const cx = k % 1000, cy = Math.floor(k / 1000);
      if (!inB(k) || !this.has(cx, cy) || E.hasChunk(cx, cy) || (h._openSea && h._openSea(cx, cy))) continue;
      E.setChunkFallback(cx, cy, h._placeholder(cx, cy));
      this.n.restand++;
    }
  }
  stats() { return { blocks: this.blocks.size, ...this.n }; }
}

// ---- how far ahead the art is fetched and baked, and when the ground is the low-detail picture's (2026-11-06, the owner
// flying a helicopter over the desert on his Pixel 7 Pro: the ground stayed flat stand-ins). host.js _prebakeList,
// _fetchAhead, _chunks:
//   aheadPlan(sp, o)   the look-ahead at sp px/s: { L px, s seconds, w chunks either side, maxN listed, fetch downloads at
//                      once }; o: { air, phone, big, cap (keepCap), viewW, viewH (world px) }
//   highAir(alt, sp, was)   high and fast enough that the ground is drawn from the low-detail picture (lowres.js) until the
//                      server's chunk comes, nothing baked here (a phone's bake, ~1 s, can't keep up with what a high fast
//                      flight sees) - with a margin either way (was: the last answer)
export const CHUNK_PX = 768;
// the look-ahead's time: driving, the next 12 s; flying, 20 s (high up the view is wider and the ground comes faster -
// a helicopter flat out is 1,350 px/s, a plane 2,000)
export const AHEAD_S = 12, AHEAD_AIR_S = 20;
export const AHEAD_MAX = 14000, AHEAD_AIR_MAX = 30000;
export function aheadPlan(sp, o = {}) {
  const air = !!o.air, phone = !!o.phone, big = !!o.big;
  const s = air ? AHEAD_AIR_S : AHEAD_S;
  const L = sp > 120 ? Math.min(sp * s, air ? AHEAD_AIR_MAX : AHEAD_MAX) : 0;
  // (flying: the band as wide as the view across the way you go - its half-width in chunks, 1 to 3; driving: one each side)
  const vw = o.viewW || 0, vh = o.viewH || 0;
  const w = air ? Math.max(1, Math.min(3, Math.ceil(Math.max(vw, vh) / 2 / CHUNK_PX + 0.5))) : 1;
  // what's listed: the ring round you and the band ahead (its chunks along x its width), no more than the browser keeps
  // (most of it - what's drawn now is kept too)
  const base = big ? 96 : phone ? 64 : 120, band = Math.ceil(L / CHUNK_PX) * (2 * w + 1);
  const cap = Math.max(base, Math.floor((o.cap || (big ? 160 : phone ? 90 : 180)) * 0.8));
  const maxN = Math.min(cap, Math.max(base, band + 25));
  // downloads at once (worker.js fetchChunk: a download waits on the network, not the phone): more when it flies fast
  const fetch = (phone ? 4 : 6) + (air && sp > 600 ? 2 : 0);
  return { L, s, w, maxN, fetch };
}
// the low-detail ground from high up: from HIGH_ALT px up (15 m: the camera's pulled well back - render/aircraft.js
// zoomOut) at HIGH_SP px/s and faster; back to the page's own bakes below HIGH_ALT_OFF or slower than HIGH_SP_OFF
export const HIGH_ALT = 480, HIGH_ALT_OFF = 400, HIGH_SP = 260, HIGH_SP_OFF = 160;
export function highAir(alt, sp, was = false) {
  return was ? alt >= HIGH_ALT_OFF && sp >= HIGH_SP_OFF : alt >= HIGH_ALT && sp >= HIGH_SP;
}
