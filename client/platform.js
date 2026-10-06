// What kind of device this is, for the few things that have to change with it. Consoles (Edge on
// Xbox above all) give the browser very little memory: every cached canvas and decoded image counts
// against it, and when it runs out the page loses its graphics or the tab is closed. LOW_MEM keeps the
// caches small there.
// Edge on Xbox doesn't always say "Xbox" in its user agent (it can ask for desktop pages), so a Windows
// browser whose only pointer is coarse - the pad-driven cursor: no mouse, no trackpad, no pen - counts as
// a console too. A player can also say what the device is in Settings (localStorage cla.device: console,
// pc or mobile; it applies from the next load), or add ?console=1 to the address.
const NAV = typeof navigator !== 'undefined' ? navigator : null;
const UA = (NAV && NAV.userAgent) || '';
const QS = typeof location !== 'undefined' ? location.search : '';
const mq = (q) => { try { return typeof matchMedia === 'function' && matchMedia(q).matches; } catch { return false; } };
let forced = null;
try { forced = typeof localStorage !== 'undefined' ? localStorage.getItem('cla.device') : null; } catch { /* storage blocked */ }
if (/[?&]console=1\b/.test(QS)) forced = 'console';
export const DEVICE_FORCED = forced === 'console' || forced === 'pc' || forced === 'mobile' ? forced : null;
const padCursor = /Windows NT/i.test(UA) && mq('(pointer: coarse)') && !mq('(any-pointer: fine)');
// why this counts as a console ('' if it doesn't): shown in Settings and the diagnostics
export const CONSOLE_WHY = DEVICE_FORCED === 'console' ? 'set in Settings'
  : /Xbox/i.test(UA) ? 'Xbox browser' : /PlayStation|Nintendo/i.test(UA) ? 'console browser'
  : padCursor ? 'Windows with only a pad-driven cursor' : NAV && 'gamepadInputEmulation' in NAV ? 'Xbox gamepad cursor' : '';
export const IS_CONSOLE = DEVICE_FORCED ? DEVICE_FORCED === 'console' : !!CONSOLE_WHY;
export const IS_XBOX = IS_CONSOLE && !/PlayStation|Nintendo/i.test(UA);
export const LOW_MEM = IS_CONSOLE || /[?&]lowmem\b/.test(QS);
export function setDeviceKind(kind) { try { if (kind) localStorage.setItem('cla.device', kind); else localStorage.removeItem('cla.device'); } catch { /* storage blocked */ } }

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
