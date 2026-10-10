// The generator at a frame of its own (docs/WORLD-V3.md part 8.2): builds the world in a W x H frame - today's land in
// its top-left, the open sea beyond - and measures it: the time, the peak memory, the per-tile layers, the lists that
// grow with the sea. World v3's server builds 5040 x 4032; run it under the heavy lock, it takes a while and ~650 MB:
//   flock /tmp/cla-heavy.lock node tools/world-frame.mjs [W H] [--seed N]
// (test/mapwindow.test.js checks a frame 240 tiles bigger each way against today's, to the bit)
import { generateCity, mapSignature } from '../shared/map.js';
import { MAP_W, MAP_H, T } from '../shared/constants.js';

const args = process.argv.slice(2), num = args.filter((a) => /^\d+$/.test(a)).map(Number);
const si = args.indexOf('--seed'), seed = si >= 0 ? Number(args[si + 1]) : 1337;
const [W, H] = num.length >= 2 && si < 0 ? num : [5040, 4032];
const t0 = performance.now();
const m = generateCity(seed, { frame: { w: W, h: H } });
const ms = performance.now() - t0, mem = process.memoryUsage();
let layerBytes = 0, layers = 0, notSea = 0;
for (const k of Object.keys(m)) { const v = m[k]; if (ArrayBuffer.isView(v) && v.length === m.w * m.h) { layerBytes += v.byteLength; layers++; } }
for (let ty = 0; ty < m.h; ty++) { const r = m.row(ty); for (let tx = ty < MAP_H ? MAP_W : 0; tx < m.w; tx++) if (m.tiles[r + m.col(tx)] !== T.DEEP) notSea++; }
const MB = (b) => Math.round(b / 1048576);
console.log(`frame ${m.w} x ${m.h} (seed ${seed}): built in ${(ms / 1000).toFixed(1)} s; peak RSS ${Math.round(process.resourceUsage().maxRSS / 1024)} MB, now ${MB(mem.rss)} MB (heap ${MB(mem.heapUsed)} MB, array buffers ${MB(mem.arrayBuffers)} MB)`);
console.log(`${layers} per-tile layers: ${MB(layerBytes)} MB; beyond today's extent (${MAP_W} x ${MAP_H}): ${notSea ? `${notSea} tiles NOT the open sea` : 'the open sea'}`);
console.log(`props ${m.props.length}, buildings ${m.buildings.length}, solid props ${m.solidProps.size} tiles; the sea's points: seaPoints ${m.seaPoints.length}, offshore ${m.offshore.length}; signature ${mapSignature(m)}`);
