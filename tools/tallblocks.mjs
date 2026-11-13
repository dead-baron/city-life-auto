// The tall blocks survey (the owner, 2026-11-12: "there are still a lot of tall buildings that don't really add anything to
// the game, it just blocks views of the street behind it"): build the live world (World v3, as the server does), then every
// building section as the art draws it, before the art's street cap (client/art2/game/statics.js STREET_CAP: off) and
// after it - how many sections with no reason to stand tall hide more than STREET_CAP.tiles tiles of street north of them,
// the worst of them, and the tall ones that have a reason (a walk-in, a trade, a place, a named hand-planned building) and
// what they cover. tools/plainmeasure.mjs surveyBlockers holds the measure; test/plainblocks.test.js keeps it at none.
//   node --expose-gc tools/tallblocks.mjs [--top 15] [--json out.json]   (heavy: under the heavy lock)
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const imp = (f) => import(pathToFileURL(join(ROOT, f)).href);
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const TOP = +arg('--top', 15);
const { buildWorld3 } = await imp('server/world3.js');
const { DISTRICTS } = await imp('shared/mapcore.js');
const { surveyBlockers, blockersOf } = await imp('tools/plainmeasure.mjs');
const { STREET_CAP } = await imp('client/art2/game/statics.js');
const t0 = Date.now();
const { map: m } = await buildWorld3(1337, { log: () => {} });
console.log(`World v3 built in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
const before = await surveyBlockers(m, { on: false }), after = await surveyBlockers(m, { on: true });
const cap = STREET_CAP.tiles, B0 = await blockersOf(before), B1 = await blockersOf(after);
const tiles = (L) => L.reduce((a, q) => a + q.hidden, 0);
console.log(`sections: ${before.length}; with no reason to stand tall: ${before.filter((q) => !q.purpose).length}`);
console.log(`blockers (no reason, over ${STREET_CAP.rows} rows of street across the front and ${cap} tiles in all): before ${B0.length} (${new Set(B0.map((q) => q.b)).size} buildings, ${tiles(B0)} street tiles hidden), after ${B1.length} (${tiles(B1)})`);
console.log(`street tiles hidden by the plain sections in all: before ${tiles(before.filter((q) => !q.purpose))}, after ${tiles(after.filter((q) => !q.purpose))}`);
const byD = {};
for (const q of B0) { const k = DISTRICTS[q.d]?.name || q.d; byD[k] = (byD[k] || 0) + 1; }
console.log('before, by district:', JSON.stringify(byD));
const fmt = (q) => `  #${q.b} ${q.name || ''} ${q.tw}x${q.th} at ${q.tx},${q.ty} ${DISTRICTS[q.d]?.name} - ${q.floors} floors, ${q.H} px, ${q.hidden} street tiles`;
console.log(`\nthe worst ${TOP} before:`); for (const q of [...B0].sort((a, b) => b.hidden - a.hidden).slice(0, TOP)) console.log(fmt(q));
const { blocks } = await imp('client/art2/game/statics.js');
const tall = after.filter((q) => q.purpose && blocks(q.hidden, q.tw)).sort((a, b) => b.hidden - a.hidden);
console.log(`\nwith a reason to stand tall and as much of the street hidden: ${tall.length}; the most:`); for (const q of tall.slice(0, TOP)) console.log(fmt(q));
if (arg('--json', null)) writeFileSync(arg('--json'), JSON.stringify({ before: B0, after: B1, tall: tall.slice(0, 60) }));
