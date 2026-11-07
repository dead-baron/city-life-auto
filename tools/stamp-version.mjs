// Writes version.json: a content hash of everything the browser loads, the file list, each file's own hash, and
// the world's: client/boot.js compares it with the last version this browser ran; when it changed, the files that
// changed are re-fetched with cache: 'reload' before the game starts, so a push to GitHub Pages is live
// immediately instead of after the 10-minute HTTP cache expires (and only what changed is downloaded again).
// `world` is a hash of the world itself (the city generated from the seed, every field of it): the browser keeps the
// city it built under it (client/worldgen.js), so it only builds it again when the world changed - not for a change
// of code that leaves it the same. `art` is a hash of everything a kept chunk is made by (the bake's code, its packing
// and stored form - ART_ROOTS - and the world): baked chunks are kept under it (client/art2/game/chunkstore.js), in
// the browser and on the server (server/artcdn.js). `world3` and `art3` are World v3's (world3Hash, below). Run before
// committing:
//   node tools/stamp-version.mjs
import { readdirSync, readFileSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { join, relative, dirname, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { LIVE_WORLD } from '../shared/liveworld.js';

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
// everything a chunk bake reads: the bake worker's code (the world generator's included), and the world itself. Not
// what never goes into a kept chunk, and changes often - each change would throw away every browser's baked chunks:
// - the gameplay numbers (shared/rules.js: prices, timings, odds);
// - the actor sprites the same workers draw live (actors.js, peds.js and what only they use: the vehicles, animals and
//   effects) - test/perf.test.js checks the chunk baker doesn't reach them.
export const ART_SKIP = new Set(['shared/rules.js', 'client/art2/game/actors.js', 'client/art2/game/peds.js']);
// What a kept chunk is made by (2026-10-08): the bake itself (chunkbake.js and all it reads), the packing into art pixels
// (chunkpack.js) and the stored form (chunkstore.js). Not the bake worker round them (worker.js): how chunks are asked
// for, downloaded from the server or kept doesn't change a chunk, and a change there shouldn't throw away every
// browser's kept chunks and the server's baked ones.
export const ART_ROOTS = ['client/art2/game/chunkbake.js', 'client/art2/game/chunkpack.js', 'client/art2/game/chunkstore.js'];
export async function artHash(root = ROOT, world = null) {
  // (the rules' files - rules-base.js reaches the bake - by the values it reads, as world3Hash: not every number in them)
  const skip = new Set([...ART_SKIP, ...readdirSync(join(root, 'shared')).map((f) => `shared/${f}`).filter((f) => VALUE_FILES.test(f))]);
  const codes = ART_ROOTS.map((f) => codeHash(f, root, skip)), w = world || (await worldHash(root)).hash;
  const files = [...new Set(codes.flatMap((c) => c.files))].sort(), vals = await rulesValues(files, root);
  return { hash: createHash('sha1').update(codes.map((c) => c.hash).join('') + w + vals.join('\n')).digest('hex').slice(0, 12), files, values: vals.map((v) => v.slice(0, v.indexOf('='))) };
}
// World v3's world (a server run with CLA_WORLD=v3; docs/WORLD-V3.md 8.23, step 0 b): `world3`, a hash of what builds it
// - the v3 build's code (server/world3.js and everything it imports: the generator, shared/world3-*.js), the cut into
// region files (shared/regionpack.js) and today's world (the v3 build reads its districts and coast) - in tens of ms at
// every stamp, where hashing the world itself would take its 45 s build. Its region files and the regions and chunks
// the browsers keep are keyed by it ('<world3>-v3'; the art by `art3`, the art's hash of it: '<art3>-v3'), so they go
// when the v3 world's code changes - and a code change that leaves the world as it was re-keys them too (the price
// of not building it). Today's `world` and `art` don't move with it.
export const WORLD3_ROOTS = ['server/world3.js', 'shared/regionpack.js'];
// The game's numbers (shared/rules.js and its rules-*.js) are read by the v3 build in a few places only (the starter cars'
// spots, the car soccer arena's size, a barrier's strength): the hash takes the values the build's code imports from
// them, not the files - a change to a price or a timer re-keyed the whole v3 world and its art before, and the server baked
// all 45,864 chunks again (2026-11-06: four of that day's eight art3 changes were rules.js alone, the last half an hour
// before the owner flew over a desert of flat stand-ins).
export const VALUE_FILES = /^shared\/rules(-[a-z]+)?\.js$/;
// the names a set of files imports (or re-exports) from the rules (import { A, B as C } from './rules.js'), with their values: ['file:NAME', ...]
export async function rulesValues(files, root = ROOT) {
  const want = new Map(), whole = new Set();
  for (const f of files) {
    const src = readFileSync(join(root, f), 'utf8');
    // (a rules file reached some other way - import * as, a dynamic import, a path handed on: the whole file, as before)
    for (const m of src.matchAll(/['"](\.\.?\/[^'"\s]+\.js)['"]/g)) { const g = relative(root, resolve(dirname(join(root, f)), m[1])); if (VALUE_FILES.test(g) && !new RegExp(`(?:import|export)\\s*\\{[^}]*\\}\\s*from\\s*['"]${m[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]`).test(src)) whole.add(g); }
    for (const m of src.matchAll(/(?:import|export)\s*\{([^}]*)\}\s*from\s*['"](\.\.?\/[^'"]+\.js)['"]/g)) {
      const g = relative(root, resolve(dirname(join(root, f)), m[2]));
      if (!VALUE_FILES.test(g)) continue;
      const s = want.get(g) || new Set();
      for (const n of m[1].split(',')) { const k = n.trim().split(/\s+as\s+/)[0]; if (k) s.add(k); }
      want.set(g, s);
    }
  }
  const vals = [];
  const plain = (k, v) => (typeof v === 'function' ? String(v) : v instanceof Set || v instanceof Map ? [...v] : ArrayBuffer.isView(v) ? [...v] : v);
  for (const g of [...want.keys()].sort()) {
    const mod = await import(pathToFileURL(join(root, g)).href);
    for (const k of [...want.get(g)].sort()) vals.push(`${g}:${k}=${JSON.stringify(mod[k], plain)}`);
  }
  for (const g of [...whole].sort()) vals.push(`${g}:*=${createHash('sha1').update(readFileSync(join(root, g))).digest('hex')}`);
  return vals;
}
export async function world3Hash(root = ROOT, world) {
  const skip = new Set(readdirSync(join(root, 'shared')).map((f) => `shared/${f}`).filter((f) => VALUE_FILES.test(f)));
  const codes = WORLD3_ROOTS.map((f) => codeHash(f, root, skip));
  const files = [...new Set(codes.flatMap((c) => c.files))].sort();
  const vals = await rulesValues(files, root);
  return { hash: createHash('sha1').update(codes.map((c) => c.hash).join('') + world + vals.join('\n')).digest('hex').slice(0, 12), files, values: vals.map((v) => v.slice(0, v.indexOf('='))) };
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
  const world3 = (await world3Hash(ROOT, world)).hash, art3 = (await artHash(ROOT, world3)).hash;
  writeFileSync(join(ROOT, 'version.json'), JSON.stringify({ version, built: new Date().toISOString(), world, art, world3, art3, live: LIVE_WORLD, files, hashes }, null, 0) + '\n');
  console.log('version', version, files.length, 'files', 'world', world, 'art', art, 'world3', world3, 'art3', art3);
}
