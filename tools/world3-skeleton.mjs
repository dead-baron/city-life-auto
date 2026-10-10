// World v3's skeleton (shared/world3-skeleton.js) as JSON, for the picture (tools/world-v3-skeleton.py) and for reading:
// the lines with their paths, tunnels and bridges, the crossings worked out from them, the summary.
//
//   node tools/world3-skeleton.mjs [out.json]        (default: print the summary only)
//   python3 tools/world-v3-skeleton.py out.json <grids dir> docs/world-v3-layout-v2.png
import { writeFileSync } from 'node:fs';
import { skeletonData } from '../shared/world3-skeleton.js';

const data = skeletonData();
const out = process.argv[2];
if (out) writeFileSync(out, JSON.stringify(data));
const s = data.summary;
console.log('km:', JSON.stringify(s.km));
console.log('tunnels:', JSON.stringify(s.tunnels));
console.log('bridges:', JSON.stringify(s.bridges));
console.log('stations:', JSON.stringify(s.stations));
console.log('crossings:', JSON.stringify(s.crossings), ' junctions:', JSON.stringify(s.junctions));
for (const l of data.lines) if (l.kind !== 'ferry') console.log(`  ${l.kind.padEnd(4)} ${l.name.padEnd(30)} ${String(l.length).padStart(5)} m  min r ${l.minRadius}`);
if (out) console.log('wrote', out);
