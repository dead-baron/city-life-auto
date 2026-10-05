// What kind of device this is, for the few things that have to change with it. Consoles (Edge on
// Xbox above all) give the browser very little graphics memory: every cached canvas and decoded
// image counts against it, and when it runs out the page loses its canvases. LOW_MEM keeps the
// caches small there.
export const IS_CONSOLE = typeof navigator !== 'undefined' && /Xbox|PlayStation|Nintendo/i.test(navigator.userAgent || '');
export const LOW_MEM = IS_CONSOLE || /[?&]lowmem\b/.test(typeof location !== 'undefined' ? location.search : '');

// Drop a canvas's pixels now (an evicted cache entry), rather than whenever the garbage collector
// gets round to it: on a console that wait is what runs the memory out.
export function freeCanvas(cv) { if (cv && cv.width) { cv.width = 0; cv.height = 0; } }

// A size-capped cache of canvases: the oldest is freed when it's full.
export function capSet(map, key, cv, max) {
  while (map.size >= max) { const k = map.keys().next().value; freeCanvas(map.get(k)); map.delete(k); }
  map.set(key, cv);
}

// Live canvas count and pixels (for the diagnostics overlay): every canvas the page makes is
// remembered weakly, so the overlay can show whether graphics memory is creeping up.
const canvasRefs = [];
if (typeof document !== 'undefined' && typeof WeakRef === 'function') {
  const make = Document.prototype.createElement;
  Document.prototype.createElement = function (tag, opts) {
    const el = make.call(this, tag, opts);
    if (typeof tag === 'string' && tag.toLowerCase() === 'canvas') canvasRefs.push(new WeakRef(el));
    return el;
  };
}
export function canvasStats() {
  let n = 0, px = 0;
  for (let i = canvasRefs.length - 1; i >= 0; i--) {
    const c = canvasRefs[i].deref();
    if (!c) { canvasRefs[i] = canvasRefs[canvasRefs.length - 1]; canvasRefs.pop(); continue; }
    if (!c.width || !c.height) continue;
    n++; px += c.width * c.height;
  }
  return { n, mb: px * 4 / 1e6 };
}
