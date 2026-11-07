// The plain-block survey (the owner, 2026-11-03: "Huge, plain buildings block the street from view and add nothing"):
// build the live world (World v3, as the server does: server/world3.js buildWorld3) and list its building footprints
// by area and by how plain they are - no shop front on a street, no sign, nothing that makes it a place (a business,
// a home, a walk-in, a hand-dressed look). Prints a histogram of footprint areas (all and plain), the worst plain
// footprints with their district and where they came from, and the area-shot command that pictures them at game zoom.
//   node --expose-gc tools/plainblocks.mjs [--top 10] [--json out.json] [--dump all.json]   (heavy: under the heavy lock)
// (tools/plainmeasure.mjs holds the measure; test/plainblocks.test.js keeps the worst under its cap)
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const imp = (f) => import(pathToFileURL(join(ROOT, f)).href);
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const TOP = +arg('--top', 10);
const { buildWorld3 } = await imp('server/world3.js');
const { DISTRICTS } = await imp('shared/mapcore.js');
const { surveyBuildings, plainRuns, AREA_BINS, PLAIN_CAP } = await imp('tools/plainmeasure.mjs');
const t0 = Date.now();
const { map: m } = await buildWorld3(1337, { log: () => {} });
const S = surveyBuildings(m);
const L = S.list;
console.log(`World v3 built in ${((Date.now() - t0) / 1000).toFixed(0)} s: ${L.length} buildings, ${S.plain} plain (${(100 * S.plain / L.length).toFixed(1)}%)`);
// the histogram: footprint area in tiles, all buildings and the plain ones
const bar = (n, max) => '#'.repeat(Math.round(40 * n / Math.max(1, max)));
const hAll = AREA_BINS.map(() => 0), hPlain = AREA_BINS.map(() => 0), aPlain = AREA_BINS.map(() => 0);
for (const q of L) {
  const k = AREA_BINS.findIndex((v, i) => q.area >= v && (i === AREA_BINS.length - 1 || q.area < AREA_BINS[i + 1]));
  hAll[k]++; if (q.plain) { hPlain[k]++; aPlain[k] += q.area; }
}
const mx = Math.max(...hAll);
console.log('\nfootprint area (tiles)   all     plain   plain tiles');
AREA_BINS.forEach((v, i) => console.log(`${String(v).padStart(5)}${i < AREA_BINS.length - 1 ? '-' + String(AREA_BINS[i + 1] - 1).padEnd(5) : '+     '}  ${String(hAll[i]).padStart(6)}  ${String(hPlain[i]).padStart(6)}  ${String(aPlain[i]).padStart(8)}  ${bar(hPlain[i], mx)}`));
const over = L.filter((q) => q.plain && q.area > PLAIN_CAP);
console.log(`\nplain footprints over ${PLAIN_CAP} tiles: ${over.length} (${over.reduce((a, q) => a + q.area, 0)} tiles)`);
// by where they come from
const by = {};
for (const q of over) { const k = q.src; (by[k] ||= { n: 0, tiles: 0 }); by[k].n++; by[k].tiles += q.area; }
console.log('by source:', JSON.stringify(by));
// how deep the plain mass runs (neighbours stacked north-south with nothing open between them)
const R = plainRuns(m, S, 20);
const deep = { '21-30': 0, '31-50': 0, '51+': 0 };
for (const [n] of R.runs) deep[n > 50 ? '51+' : n > 30 ? '31-50' : '21-30']++;
console.log(`plain runs down a column (tiles of plain buildings unbroken north-south): longest ${R.longest}; columns with a run over 20: ${JSON.stringify(deep)}`);
const byD = {};
for (const q of over) { const k = DISTRICTS[q.d]?.name || q.d; byD[k] = (byD[k] || 0) + 1; }
console.log('by district:', JSON.stringify(byD));
// the worst: the biggest plain footprints, at most two in a district so the pictures cover the world
const worst = [], perD = {};
for (const q of L.filter((q) => q.plain).sort((a, b) => b.area - a.area)) {
  if ((perD[q.d] || 0) >= 2) continue;
  perD[q.d] = (perD[q.d] || 0) + 1; worst.push(q);
  if (worst.length >= TOP) break;
}
console.log(`\nthe worst ${TOP}:`);
for (const q of worst) console.log(`  #${q.id} ${q.tw}x${q.th} = ${q.area} at ${q.tx},${q.ty} ${DISTRICTS[q.d]?.name} (${DISTRICTS[q.d]?.style}) kind=${q.kind} src=${q.src}${q.back ? ' back' : ''} front=${q.front} score=${q.score}`);
// the pictures at game zoom (a 1080p screen shows about 48 x 27 tiles: client/main.js baseZoom), one world px a pixel
const VW = 48, VH = 27;
const rects = worst.map((q) => { const cx = q.tx + q.tw / 2, cy = q.ty + q.th / 2, w = Math.max(VW, q.tw + 8), h = Math.max(VH, q.th + 8); return [Math.round(cx - w / 2), Math.round(cy - h / 2), Math.round(cx + w / 2), Math.round(cy + h / 2)]; });
console.log('\npictures: node tools/area-shot.mjs ' + rects.map((r, i) => `--rect ${r.join(',')} --s ${r[2] - r[0] > 72 ? 2 : 1} --out shots/plain-${i + 1}.png`).join(' '));
const out = arg('--json');
if (out) writeFileSync(out, JSON.stringify({ longestRun: R.longest, deepRuns: deep, buildings: L.length, plain: S.plain, cap: PLAIN_CAP, over: over.length, overTiles: over.reduce((a, q) => a + q.area, 0), bins: AREA_BINS, all: hAll, plainBins: hPlain, plainTiles: aPlain, bySource: by, byDistrict: byD, worst, rects }, null, 1));
const dump = arg('--dump');
if (dump) writeFileSync(dump, JSON.stringify(L.map((q) => [q.id, q.tx, q.ty, q.tw, q.th, q.d, q.kind, q.src, q.plain ? 1 : 0, q.score, q.back ? 1 : 0])));
