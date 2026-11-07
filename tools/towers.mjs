// The tall plain towers survey (the owner, 2026-11-06: "there are still a lot of really huge tall plain buildings, like
// park west tower"): build the live world (World v3, as the server does) and list the hand plans' towers of six floors
// and more - how tall the art draws each (px, and the tiles of the street north of it its wall covers), its footprint,
// and whether it's a plain slab (tools/plainmeasure.mjs surveyTowers: big, tall, and nothing but the towers' kit's look).
// Prints the counts by district, every slab, the parts of the split towers, and the area-shot rects round the worst.
//   node tools/towers.mjs [--json out.json] [--ids 1,2,3]   (heavy: under the heavy lock)
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const imp = (f) => import(pathToFileURL(join(ROOT, f)).href);
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const { buildWorld3 } = await imp('server/world3.js');
const { DISTRICTS } = await imp('shared/mapcore.js');
const { surveyTowers, TOWER_FLOORS, TOWER_FRONT, TOWER_AREA } = await imp('tools/plainmeasure.mjs');
const t0 = Date.now();
const { map: m } = await buildWorld3(1337, { log: () => {} });
const L = surveyTowers(m);
console.log(`World v3 built in ${((Date.now() - t0) / 1000).toFixed(0)} s: ${m.buildings.length} buildings; ${L.length} hand towers of 6+ floors, ${L.filter((q) => q.tall).length} of ${TOWER_FLOORS}+`);
const slabs = L.filter((q) => q.slab).sort((a, b) => b.tw * b.H - a.tw * a.H);
console.log(`plain slabs (${TOWER_FLOORS}+ floors, a front of ${TOWER_FRONT}+ tiles or ${TOWER_AREA}+ tiles of footprint, the towers' kit alone): ${slabs.length}`);
const byD = {};
for (const q of L.filter((q) => q.tall)) { const k = DISTRICTS[q.d]?.name || q.d; (byD[k] ||= { tall: 0, slabs: 0, wall: 0 }); byD[k].tall++; if (q.slab) { byD[k].slabs++; byD[k].wall += q.tw * q.Ht; } }
console.log('by district (tall towers, slabs, slab wall tiles - front x height):'); for (const [k, v] of Object.entries(byD).sort((a, b) => b[1].wall - a[1].wall)) console.log(`  ${k.padEnd(22)} ${String(v.tall).padStart(3)} ${String(v.slabs).padStart(3)} ${String(v.wall).padStart(6)}`);
const row = (q) => `  #${q.id} ${q.name} ${q.tw}x${q.th} ${q.floors} fl (${q.H} px, ${q.Ht} t) at ${q.tx},${q.ty} ${DISTRICTS[q.d]?.name} ${q.style}${q.home ? ' home' : ''}${q.role.length ? ' ' + q.role.join('/') : ''}${q.part ? ' part:' + q.part : ''} hides ${q.road} street tiles, ${q.hidden} places`;
console.log('\nthe slabs, widest walls first:'); for (const q of slabs) console.log(row(q));
console.log('\nthe tall towers kept (not slabs):'); for (const q of L.filter((q) => q.tall && !q.slab && !q.part)) console.log(row(q));
const parts = L.filter((q) => q.part);
if (parts.length) { console.log(`\nsplit tower parts (6+ floors): ${parts.length}`); for (const q of parts) console.log(row(q)); }
const ids = arg('--ids');
const pick = ids ? ids.split(',').map(Number).map((id) => m.buildings[id]) : slabs.slice(0, 5).map((q) => m.buildings[q.id]);
// (a phone in portrait at game zoom shows about 14 x 30 tiles: client/main.js baseZoom on a 412 x 915 screen)
const rects = pick.map((b) => { const cx = b.tx + b.tw / 2, w = Math.max(36, b.tw + 10); return [Math.round(cx - w / 2), b.ty - 30, Math.round(cx + w / 2), b.ty + b.th + 14]; });
console.log('\npictures: node tools/area-shot.mjs ' + rects.map((r, i) => `--rect ${r.join(',')} --s 2 --out shots/tower-${i + 1}.png`).join(' '));
const out = arg('--json');
if (out) writeFileSync(out, JSON.stringify({ towers: L, slabs: slabs.map((q) => q.id), byDistrict: byD, rects }, null, 1));
