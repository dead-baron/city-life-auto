// For test/dmath.test.js (run as a child process): build the world and print its signature, a hash of everything in
// it (every field, every number's exact bits) and which of the engine's implementation-approximated Math functions the
// build called. With 'nudge', those functions first get moved by one bit on about one argument in sixteen - as another
// engine's maths library would (Safari's against Chrome's): a build that doesn't depend on them comes out the same.
//   node test/dmath-world.mjs [nudge] [seed]
const nudge = process.argv[2] === 'nudge', seed = Number(process.argv[3] || 1337);
const F64 = new Float64Array(1), U32 = new Uint32Array(F64.buffer);
const APPROX = ['sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'atan2', 'sinh', 'cosh', 'tanh', 'asinh', 'acosh', 'atanh', 'exp', 'expm1', 'log', 'log1p', 'log2', 'log10', 'pow', 'cbrt', 'hypot', 'random'];
const calls = {};
for (const f of APPROX) {
  const o = Math[f];
  calls[f] = 0;
  Math[f] = function (...a) {
    calls[f]++;
    const r = o.apply(Math, a);
    if (!nudge || f === 'random' || !Number.isFinite(r) || r === 0) return r;
    F64[0] = (+a[0]) + (+a[1] || 0);
    if (((Math.imul(U32[0] ^ U32[1], 2654435761) >>> 0) >>> 28) !== 5) return r;
    F64[0] = r;
    if (U32[0] === 0xffffffff) return r;
    U32[0] += 1;
    return F64[0];
  };
}
const { generateCity, mapSignature } = await import('../shared/map.js');
const m = generateCity(seed);

// FNV-1a over everything reachable from the map, in a fixed order
let h = 0x811c9dc5 >>> 0;
const byte = (b) => { h = Math.imul(h ^ (b & 0xff), 0x01000193) >>> 0; };
const word = (v) => { byte(v); byte(v >>> 8); byte(v >>> 16); byte(v >>> 24); };
const str = (s) => { word(s.length); for (let i = 0; i < s.length; i++) word(s.charCodeAt(i)); };
const seen = new Map();
function walk(v) {
  if (v === null) return word(1);
  if (v === undefined) return word(2);
  const t = typeof v;
  if (t === 'number') { F64[0] = v; word(3); word(U32[0]); word(U32[1]); return; }
  if (t === 'boolean') return word(v ? 4 : 5);
  if (t === 'string') { word(6); str(v); return; }
  if (t === 'function' || t === 'symbol' || t === 'bigint') { word(7); str(String(t)); return; }
  if (seen.has(v)) { word(8); word(seen.get(v)); return; }
  seen.set(v, seen.size);
  if (ArrayBuffer.isView(v)) { word(9); str(v.constructor.name); const b = new Uint8Array(v.buffer, v.byteOffset, v.byteLength); word(b.length); for (let i = 0; i < b.length; i++) byte(b[i]); return; }
  if (v instanceof Map) { word(10); word(v.size); for (const [k, x] of v) { walk(k); walk(x); } return; }
  if (v instanceof Set) { word(11); word(v.size); for (const x of v) walk(x); return; }
  if (Array.isArray(v)) { word(12); word(v.length); for (const x of v) walk(x); return; }
  word(13);
  const keys = Object.keys(v);
  word(keys.length);
  for (const k of keys) { str(k); walk(v[k]); }
}
walk(m);
const used = Object.fromEntries(Object.entries(calls).filter(([, n]) => n));
process.stdout.write(JSON.stringify({ sig: mapSignature(m), hash: h.toString(16), used }));
