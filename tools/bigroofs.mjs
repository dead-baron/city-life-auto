// The big roofs survey (the owner, 2026-11-14: "There are still so many huge buildings that take up so much space and
// don't add anything interesting and cover so much of the street view. We don't see very many cool alleys"): build the
// live world (World v3, as the server does) and list every building footprint that is big (shared/world3-openblocks.js
// OPEN3: over 360 tiles of roof, or a street front over 26 / a depth over 22 tiles with over 220 of roof), why it
// stays one building (keepWhole: a walk-in, a trade, a place, a landmark, a set piece, a designed lot, a warehouse or a
// civic hall, an industrial district...) or that it had none and was opened up - before the pass (the world build's own
// count: m.world3.open) and after it, by district, with the roof tiles; then what the pass made.
//   node --expose-gc --max-old-space-size=2048 tools/bigroofs.mjs [--top 20] [--json out.json]   (heavy: under the heavy lock)
// (test/plainblocks.test.js keeps it at none left without a reason)
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const imp = (f) => import(pathToFileURL(join(ROOT, f)).href);
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const TOP = +arg('--top', 20);
const { buildWorld3 } = await imp('server/world3.js');
const { DISTRICTS } = await imp('shared/mapcore.js');
const t0 = Date.now();
const { map: m } = await buildWorld3(1337, { log: () => {} });
console.log(`World v3 built in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
const O0 = m.world3.open, F = O0.full, O = { ...O0, before: F.by.before, after: F.by.after };
const sum = (by, k) => Object.values(by).reduce((a, q) => a + q[k], 0);
const why = (L) => { const w = {}; for (const q of L) { const k = q.why || 'NONE (opened up)'; w[k] = (w[k] || 0) + 1; } return w; };
console.log(`big footprints before: ${F.before.length} (${sum(O.before, 'tiles')} roof tiles); with no reason to be one building: ${sum(O.before, 'open')} (${sum(O.before, 'openTiles')} tiles)`);
console.log('  why they stay whole:', JSON.stringify(why(F.before)));
console.log(`big footprints after: ${F.after.length} (${sum(O.after, 'tiles')} roof tiles); with no reason: ${sum(O.after, 'open')} (${sum(O.after, 'openTiles')} tiles)`);
console.log(`opened up: ${O.opened} buildings -> +${O.made} buildings, ${O.alleys} alleys and lanes, ${O.yards} courtyards and back lots, ${O.dice} dice games; ${O.tiles} tiles of footprint`);
const ds = [...new Set([...Object.keys(O.before), ...Object.keys(O.after)])].sort((a, b) => (O.before[b]?.openTiles || 0) - (O.before[a]?.openTiles || 0));
console.log('\ndistrict                    big before (tiles)   no reason before (tiles)   big after (tiles)   no reason after');
for (const d of ds) { const a = O.before[d] || { n: 0, tiles: 0, open: 0, openTiles: 0 }, b = O.after[d] || { n: 0, tiles: 0, open: 0, openTiles: 0 }; console.log(`${d.padEnd(26)} ${String(a.n).padStart(4)} (${String(a.tiles).padStart(6)})    ${String(a.open).padStart(4)} (${String(a.openTiles).padStart(6)})            ${String(b.n).padStart(4)} (${String(b.tiles).padStart(6)})    ${String(b.open).padStart(4)} (${String(b.openTiles).padStart(6)})`); }
const fmt = (q) => `  #${q.id} ${q.name || ''} ${q.tw}x${q.th} = ${q.area} at ${q.tx},${q.ty} ${DISTRICTS[q.d]?.name}${q.why ? ' - ' + q.why : ''}`;
console.log(`\nthe biggest opened up (before):`); for (const q of F.before.filter((q) => !q.why).sort((a, b) => b.area - a.area).slice(0, TOP)) console.log(fmt(q));
const left = F.after.filter((q) => !q.why);
console.log(`\nleft big with no reason (too narrow and shallow to cut): ${left.length}`); for (const q of left.slice(0, TOP)) console.log(fmt(q));
console.log(`\nthe biggest kept whole, with their reasons:`); for (const q of F.after.filter((q) => q.why).sort((a, b) => b.area - a.area).slice(0, TOP)) console.log(fmt(q));
if (arg('--json', null)) writeFileSync(arg('--json'), JSON.stringify({ before: F.before, after: F.after, opened: F.opened, by: { before: O.before, after: O.after }, alleys: m.openAlleys, yards: m.openYards }));
