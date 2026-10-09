// Performance budgets: what a phone pays to get into the city and keep it drawn, measured in node so every build
// checks it (test/perf.test.js runs these against BUDGET; this script prints the report).
//   node tools/perf.mjs            the report (exit code 1 when something is over budget)
//   node tools/perf.mjs --quick    without the timings (just the sizes)
// Measured:
//   code      what each part of the page loads before it can do its job, in files and bytes (as sent: gzipped) -
//             the page itself, the worker that builds the city, the renderer, a bake worker
//   assets    what the page fetches to show the title screen (stylesheet, fonts, logo, icons)
//   city      building the city from the seed, as a multiple of a fixed CPU yardstick (so a slow or busy machine
//             doesn't fail it, a real slowdown does); and its weight (what a worker is sent, what the browser keeps)
//   bake      baking a sample of chunks (downtown, suburbs, woods, beach, farms, sea) on Medium and Ultra, from cold,
//             the same way; and the size of a kept (gzipped) chunk
// Budgets have room to grow. When one fails, the message says what grew; raising a budget is a decision - say why
// in docs/DEVLOG.md.
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { gzipSync } from 'node:zlib';
import { serialize } from 'node:v8';
import { pathToFileURL } from 'node:url';

const ROOT = resolve(new URL('..', import.meta.url).pathname);

// ---- the budgets ---------------------------------------------------------------------------------------------
// (set 2026-10-07 after the loading work, the sizes at about 1.15x what they were then - KB as sent, gzipped - and the
// times at about 1.6x, as multiples of the yardstick: room for the city to grow, not for an accident)
export const BUDGET = {
  code: {
    page: { files: 88, kb: 720 },        // client/boot.js + main.js and everything they import at once (76 files, 620 KB)
    city: { files: 26, kb: 320 },        // client/worldgen.js: the city built off the page's thread (22, 277)
    renderer: { files: 28, kb: 354 },    // art2/game/host.js and what it loads before drawing, beyond the page's (23, 302; 350 -> 352 for the hood pose, task #361; 352 -> 354 for the paramedics' stretcher, task #313)
    bake: { files: 74, kb: 950 },        // a bake worker, its providers included (63, 823)
  },
  assetsKb: 290,                         // the title screen: stylesheet, fonts, logo, icons (247)
  cityX: 40,                             // building the city, in yardsticks (20-25x; 8.5 s on the test machine before)
  cityMb: 46,                            // the city as sent to a worker / kept by the browser (37.3 MB)
  bakeX: 90,                             // the sample of chunks on Medium and Ultra, from cold, in yardsticks (45-57x)
  keptChunkKb: 1000,                     // the biggest kept chunk of the sample, gzipped (722 KB)
};

// ---- code: a module and everything it pulls in ----------------------------------------------------------------
// static: imports that load with it; dynamic too: every relative .js path written in it (dynamic imports, paths
// handed to a loader, worker URLs) - what it will load before it is any use
export function closure(entries, { dynamic = false, root = ROOT } = {}) {
  const seen = new Set();
  const visit = (f) => {
    if (seen.has(f) || !existsSync(f)) return;
    seen.add(f);
    const src = readFileSync(f, 'utf8');
    for (const m of src.matchAll(/(?:^|\n)\s*(?:import|export)\s(?:[^;'"]*?from\s*)?['"](\.[^'"]+)['"]/g)) visit(resolve(dirname(f), m[1]));
    if (dynamic) for (const m of src.matchAll(/['"](\.\.?\/[^'"\s]+\.js)['"]/g)) visit(resolve(dirname(f), m[1]));
  };
  for (const e of entries) visit(join(root, e));
  return [...seen].map((f) => relative(root, f)).sort();
}
const sizeOf = (files, root = ROOT) => {
  let raw = 0, gz = 0;
  for (const f of files) { const b = readFileSync(join(root, f)); raw += b.length; gz += gzipSync(b, { level: 6 }).length; }
  return { files: files.length, kb: Math.round(gz / 1024), rawKb: Math.round(raw / 1024) };
};
export function codeReport(root = ROOT) {
  const page = closure(['client/boot.js', 'client/main.js'], { root });
  const inPage = new Set(page);
  const renderer = closure(['client/art2/game/host.js', 'client/art2/game/engine.js', 'client/art2/game/lightgame.js', 'client/art2/game/actors.js', 'client/art2/game/peds.js'], { root }).filter((f) => !inPage.has(f));
  return {
    page: sizeOf(page, root),
    city: sizeOf(closure(['client/worldgen.js'], { root }), root),
    renderer: sizeOf(renderer, root),
    bake: sizeOf(closure(['client/art2/game/worker.js'], { dynamic: true, root }), root),
    pageHasRenderer: page.includes('client/art2/game/host.js'),
  };
}
// the title screen's own fetches: index.html's stylesheet, preloaded font and pictures, and the stylesheet's fonts
export function assetReport(root = ROOT) {
  const html = readFileSync(join(root, 'index.html'), 'utf8');
  const css = readFileSync(join(root, 'client/style.css'), 'utf8');
  const files = new Set(['index.html', 'client/style.css']);
  for (const m of html.matchAll(/(?:href|src)="([^"#?]+\.(?:png|webp|woff2?|css))"/g)) files.add(m[1]);
  for (const m of css.matchAll(/url\(['"]?([^'")]+\.(?:woff2?|png|webp))['"]?\)/g)) files.add(join('client', m[1]).replace(/\\/g, '/'));
  let kb = 0;
  const list = [];
  for (const f of files) {
    const p = resolve(root, f);
    if (!existsSync(p)) continue;
    const b = readFileSync(p), sent = /\.(png|webp|woff2?)$/.test(f) ? b.length : gzipSync(b, { level: 6 }).length;
    kb += sent / 1024; list.push([relative(root, p), Math.round(sent / 1024)]);
  }
  return { kb: Math.round(kb), list };
}

// ---- time: a fixed CPU yardstick -------------------------------------------------------------------------------
// typed-array number crunching, object churn, a Map and a sort - the kinds of work the city and the bakes do. The
// best of five, so a hiccup doesn't count.
export function yardstick() {
  let best = Infinity;
  for (let rep = 0; rep < 5; rep++) {
    const t0 = performance.now();
    let h = 0x811c9dc5;
    const a = new Float64Array(1 << 16), m = new Map();
    for (let r = 0; r < 24; r++) {
      for (let i = 0; i < a.length; i++) { a[i] = Math.sqrt(i * 1.5 + r) * 0.7 + (h & 255); h = Math.imul(h ^ i, 16777619) >>> 0; }
      for (let i = 0; i < 6000; i++) { const k = (h + i * 7919) & 8191; m.set(k, { x: i, y: r }); h ^= m.size; }
      const objs = [];
      for (let i = 0; i < 20000; i++) objs.push({ x: i, y: a[(i * 31) & 0xffff] });
      objs.sort((p, q) => p.y - q.y || p.x - q.x);
      h ^= objs[r].x;
    }
    if (h === 42) console.log('');   // (keeps the work from being thrown away)
    best = Math.min(best, performance.now() - t0);
  }
  return best;
}

// the sample of chunks: chunk coordinates by kind of place (768 px chunks)
export const SAMPLE = [['downtown', 34, 21], ['midtown', 29, 22], ['suburb', 36, 31], ['woods', 8, 8], ['beach', 25, 21], ['farms', 32, 40], ['sea', 3, 3]];

export async function cpuReport(root = ROOT) {
  const imp = (f) => import(pathToFileURL(join(root, f)).href);
  const yard = yardstick();
  const { generateCity, cityData } = await imp('shared/map.js');
  let t = performance.now();
  const map = generateCity(1337);
  const cityMs = performance.now() - t;
  const data = cityData(map);
  const cityMb = serialize(data).length / 1e6;
  // the bakes, as a worker does them: a structured clone of the city, the providers, cold caches
  const { bakeChunk, loadProviders, SpriteCache, providers } = await imp('client/art2/game/chunkbake.js');
  const GB = await imp('client/art2/gbuf.js');
  const M = structuredClone(data);
  Object.setPrototypeOf(M, Object.getPrototypeOf(map));
  await loadProviders();
  const bakes = {};
  let bakeMs = 0, keptKb = 0;
  for (const q of [1, 3]) {
    const cache = new SpriteCache(40e6);
    for (const [name, cx, cy] of SAMPLE) {
      t = performance.now();
      const r = bakeChunk(M, cx, cy, { quality: q, seed: 1337, artPx: 2 }, cache, providers);
      const pk = GB.downsample2(GB.packGBuf(r.g), { run: GB.CHUNK_RUN });
      const ms = performance.now() - t;
      bakeMs += ms;
      bakes[`${name} q${q}`] = Math.round(ms);
      const u = r.under && r.blds && r.blds.length ? GB.downsampleUnder(r.under, r.g.w, r.g.h, pk.pick) : null;
      const bin = Buffer.concat([pk.p0, pk.p1, pk.p2, u, r.gh].filter(Boolean).map((a) => Buffer.from(a.buffer, a.byteOffset, a.byteLength)));
      keptKb = Math.max(keptKb, gzipSync(bin, { level: 6 }).length / 1024);
    }
  }
  return { yardMs: Math.round(yard), cityMs: Math.round(cityMs), cityX: +(cityMs / yard).toFixed(1), cityMb: +cityMb.toFixed(1), bakeMs: Math.round(bakeMs), bakeX: +(bakeMs / yard).toFixed(1), bakes, keptChunkKb: Math.round(keptKb) };
}

// what is over budget: [what, how much, budget, the advice]
export function overBudget(code, assets, cpu) {
  const out = [];
  for (const [k, b] of Object.entries(BUDGET.code)) {
    const v = code[k];
    if (v.kb > b.kb) out.push([`${k} code`, `${v.kb} KB`, `${b.kb} KB`, 'something heavy joined it: load it later (a dynamic import) or trim it']);
    if (v.files > b.files) out.push([`${k} code`, `${v.files} files`, `${b.files} files`, 'more modules means more requests before it can start']);
  }
  if (code.pageHasRenderer) out.push(['page code', 'includes the renderer', 'loaded when the city is in', 'main.js must import art2/game/host.js dynamically']);
  if (assets.kb > BUDGET.assetsKb) out.push(['title screen assets', `${assets.kb} KB`, `${BUDGET.assetsKb} KB`, 'a picture or font grew: shrink it or load it later']);
  if (cpu) {
    if (cpu.cityX > BUDGET.cityX) out.push(['building the city', `${cpu.cityX}x`, `${BUDGET.cityX}x`, 'a pass got slower: tools/perf.mjs, then node --cpu-prof on generateCity']);
    if (cpu.cityMb > BUDGET.cityMb) out.push(['the city\'s weight', `${cpu.cityMb} MB`, `${BUDGET.cityMb} MB`, 'every bake worker holds a copy, and the browser keeps one']);
    if (cpu.bakeX > BUDGET.bakeX) out.push(['baking chunks', `${cpu.bakeX}x`, `${BUDGET.bakeX}x`, 'a chunk takes a phone longer to draw: profile bakeChunk']);
    if (cpu.keptChunkKb > BUDGET.keptChunkKb) out.push(['a kept chunk', `${cpu.keptChunkKb} KB`, `${BUDGET.keptChunkKb} KB`, 'the browser keeps fewer of them in the same room']);
  }
  return out;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const quick = process.argv.includes('--quick');
  const code = codeReport(), assets = assetReport();
  const cpu = quick ? null : await cpuReport();
  const pad = (s, n) => String(s).padEnd(n);
  console.log('Code (what each part loads before it can start; KB as sent, gzipped):');
  for (const [k, b] of Object.entries(BUDGET.code)) console.log(`  ${pad(k, 9)} ${pad(code[k].files + ' files', 10)} ${pad(code[k].kb + ' KB', 8)} (${code[k].rawKb} KB raw)   budget ${b.files} files, ${b.kb} KB`);
  console.log(`Title screen assets: ${assets.kb} KB (budget ${BUDGET.assetsKb})  ${assets.list.map(([f, kb]) => `${f} ${kb}`).join(', ')}`);
  if (cpu) {
    console.log(`Yardstick: ${cpu.yardMs} ms on this machine`);
    console.log(`City: built in ${cpu.cityMs} ms = ${cpu.cityX}x (budget ${BUDGET.cityX}x); ${cpu.cityMb} MB as sent / kept (budget ${BUDGET.cityMb})`);
    console.log(`Bakes: ${cpu.bakeMs} ms = ${cpu.bakeX}x (budget ${BUDGET.bakeX}x); biggest kept chunk ${cpu.keptChunkKb} KB (budget ${BUDGET.keptChunkKb})`);
    console.log('  ' + Object.entries(cpu.bakes).map(([k, v]) => `${k} ${v}`).join(' · '));
  }
  const over = overBudget(code, assets, cpu);
  if (over.length) { console.log('\nOVER BUDGET:'); for (const [w, v, b, a] of over) console.log(`  ${w}: ${v} (budget ${b}) - ${a}`); process.exit(1); }
  console.log('\nAll within budget.');
}
