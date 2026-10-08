// Writes version.json: a content hash of everything the browser loads, the file list, each file's own hash, and
// the world's: client/boot.js compares it with the last version this browser ran; when it changed, the files that
// changed are re-fetched with cache: 'reload' before the game starts, so a push to GitHub Pages is live
// immediately instead of after the 10-minute HTTP cache expires (and only what changed is downloaded again).
// `world` is a hash of the world itself (the city generated from the seed, every field of it): the browser keeps the
// city it built under it (client/worldgen.js), so it only builds it again when the world changed - not for a change
// of code that leaves it the same. `art` is a hash of everything a chunk bake reads (the bake worker's code and the
// world): baked chunks are kept under it (client/art2/game/chunkstore.js). Run before committing:
//   node tools/stamp-version.mjs
import { readdirSync, readFileSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { join, relative, dirname, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const ROOT = new URL('..', import.meta.url).pathname;
// a hash of a module and everything it imports, however deep (but the files in skip)
export function codeHash(entry, root = ROOT, skip = null) {
  const seen = new Set(), wh = createHash('sha1');
  const visit = (f) => {
    if (seen.has(f) || (skip && skip.has(relative(root, f)))) return;
    seen.add(f);
    const src = readFileSync(f, 'utf8');
    // (every relative .js path written in it: static and dynamic imports, paths handed to a loader, worker URLs)
    for (const m of src.matchAll(/['"](\.\.?\/[^'"\s]+\.js)['"]/g)) { const g = resolve(dirname(f), m[1]); if (existsSync(g)) visit(g); }
  };
  visit(join(root, entry));
  for (const f of [...seen].sort()) { wh.update(relative(root, f)); wh.update(readFileSync(f)); }
  return { hash: wh.digest('hex').slice(0, 12), files: [...seen].map((f) => relative(root, f)).sort() };
}
// A canonical hash of plain data: the same values give the same hash, whatever order an object's keys were added in
// or how the engine holds a number (v8.serialize tells a small integer from the same number held as a double, so two
// identical cities can serialize differently). Typed arrays by their bytes, Maps and Sets in their order, an object
// seen twice by reference.
export function canonicalHash(value) {
  const h = createHash('sha1');
  let buf = Buffer.allocUnsafe(1 << 20), n = 0;
  const room = (k) => { if (n + k > buf.length) { h.update(buf.subarray(0, n)); n = 0; if (k > buf.length) buf = Buffer.allocUnsafe(k); } };
  const tag = (t) => { room(1); buf[n++] = t; };
  const str = (v) => { const b = Buffer.from(v, 'utf8'); room(5 + b.length); buf.writeUInt32LE(b.length, n); n += 4; b.copy(buf, n); n += b.length; };
  const num = (v) => { room(9); buf[n++] = 1; buf.writeDoubleLE(v, n); n += 8; };
  const seen = new Map();
  const walk = (v) => {
    if (v === null) return tag(2);
    switch (typeof v) {
      case 'number': return num(v);
      case 'string': tag(3); return str(v);
      case 'boolean': return tag(v ? 4 : 5);
      case 'undefined': return tag(6);
      case 'bigint': tag(7); return str(String(v));
      case 'function': return tag(8);
      default: break;
    }
    if (seen.has(v)) { tag(9); return num(seen.get(v)); }
    seen.set(v, seen.size);
    if (ArrayBuffer.isView(v)) { tag(10); str(v.constructor.name); const b = Buffer.from(v.buffer, v.byteOffset, v.byteLength); room(4); buf.writeUInt32LE(b.length, n); n += 4; h.update(buf.subarray(0, n)); n = 0; h.update(b); return; }
    if (v instanceof Map) { tag(11); num(v.size); for (const [k, x] of v) { walk(k); walk(x); } return; }
    if (v instanceof Set) { tag(12); num(v.size); for (const x of v) walk(x); return; }
    if (Array.isArray(v)) { tag(13); num(v.length); for (let i = 0; i < v.length; i++) walk(v[i]); return; }
    const ks = Object.keys(v).sort();
    tag(14); num(ks.length);
    for (const k of ks) { str(k); walk(v[k]); }
  };
  walk(value);
  h.update(buf.subarray(0, n));
  return h.digest('hex');
}
// the world: a hash of the city as generated (what the browser keeps: shared/map.js cityData), given or generated here
export async function worldHash(root = ROOT, map = null) {
  const { generateCity, cityData } = await import(pathToFileURL(join(root, 'shared/map.js')).href);
  return { hash: canonicalHash(cityData(map || generateCity(1337))).slice(0, 12) };
}
// everything a chunk bake reads: the bake worker's code (the world generator's included), and the world itself. Not the
// gameplay numbers (shared/rules.js: prices, timings, odds - nothing a bake draws): they change often, and each change
// would throw away every browser's baked chunks.
export const ART_SKIP = new Set(['shared/rules.js']);
export async function artHash(root = ROOT, world = null) {
  const code = codeHash('client/art2/game/worker.js', root, ART_SKIP), w = world || (await worldHash(root)).hash;
  return { hash: createHash('sha1').update(code.hash + w).digest('hex').slice(0, 12), files: code.files };
}
// the stamp (only when run as a script: tests import worldHash)
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const DIRS = ['client', 'shared', 'server', 'assets'];
  const SKIP = /(^|\/)(node_modules|data|logs|fonts\/OFL)/;
  const files = [];
  const walk = (d) => {
    for (const n of readdirSync(join(ROOT, d))) {
      const p = join(d, n);
      if (SKIP.test(p)) continue;
      if (statSync(join(ROOT, p)).isDirectory()) walk(p);
      else if (/\.(js|css|json|png|webp|woff)$/.test(n)) files.push(relative(ROOT, join(ROOT, p)));
    }
  };
  for (const d of DIRS) walk(d);
  for (const f of ['index.html', 'manifest.webmanifest']) files.push(f);
  files.sort();
  const h = createHash('sha1');
  const hashes = [];
  for (const f of files) { const b = readFileSync(join(ROOT, f)); h.update(f); h.update(b); hashes.push(createHash('sha1').update(b).digest('hex').slice(0, 10)); }
  const version = h.digest('hex').slice(0, 12);
  const world = (await worldHash()).hash, art = (await artHash(ROOT, world)).hash;
  writeFileSync(join(ROOT, 'version.json'), JSON.stringify({ version, built: new Date().toISOString(), world, art, files, hashes }, null, 0) + '\n');
  console.log('version', version, files.length, 'files', 'world', world, 'art', art);
}
