// The four-way harness from the command line (test/gridlocksim.js): one busy crossroads with lights and one without,
// fed a heavy mix (trucks, buses) for some in-game minutes, a player at the corner - how many got across, the longest
// anything stood still near it, the tick.
//   flock /tmp/cla-heavy.lock node --max-old-space-size=2048 --expose-gc tools/gridlocksim.mjs [--min 10] [--seed 7] [--legacy]
// (World v3 by default: about 100 s and 2 GB to build; --legacy: today's small city, a few seconds)
import { runFourWay, snapshot, buildKnot, findFourWay, buildAmbulanceBlock } from '../test/gridlocksim.js';
import { World } from '../server/world.js';
import { joinPlayer, teleport } from '../test/helpers.js';
import { boxR } from '../server/systems/junctionbox.js';
import { writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { generateCity } from '../shared/map.js';
import { buildWorld3 } from '../server/world3.js';
import { MAIN_STATIONS3 } from '../shared/world3-layout.js';
import { TILE } from '../shared/constants.js';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const MIN = +opt('--min', 10), SEED = +opt('--seed', 7), LEGACY = args.includes('--legacy');
const which = opt('--only', 'both');
// (--save / --load: the built World v3 kept in a file between runs - v8's own serializer - for working on it: a few
// seconds to read back instead of the build's two minutes)
const LOAD = opt('--load', ''), SAVE = opt('--save', '');
let M;
if (LOAD) {
  const { deserialize } = await import('node:v8'), { readFileSync } = await import('node:fs'), { CityMap } = await import('../shared/mapcore.js');
  M = deserialize(readFileSync(LOAD));
  Object.setPrototypeOf(M, CityMap.prototype);
  console.log('[world] read back from', LOAD);
} else M = LEGACY ? generateCity(1337) : (await buildWorld3(1337, { log: (s) => console.log(s) })).map;
if (SAVE) {
  // (functions can't be kept: dropped from a copy - a run on the read-back map is for working on traffic, the final
  // numbers come from a real build)
  const { serialize } = await import('node:v8'), seen = new Set(), dropped = [];
  const strip = (o, path, depth) => {
    if (!o || typeof o !== 'object' || seen.has(o) || ArrayBuffer.isView(o) || depth > 8) return o;
    seen.add(o);
    if (o instanceof Map) { for (const [k, v] of o) { if (typeof v === 'function') { o.delete(k); dropped.push(path + '.' + k); } else strip(v, path + '.' + k, depth + 1); } return o; }
    if (o instanceof Set) return o;
    for (const k of Object.keys(o)) { const v = o[k]; if (typeof v === 'function') { delete o[k]; dropped.push(path + '.' + k); } else if (v && typeof v === 'object') strip(v, Array.isArray(o) ? path + '[]' : path + '.' + k, depth + 1); }
    return o;
  };
  strip(M, 'map', 0);
  console.log('[world] dropped', [...new Set(dropped)].slice(0, 20).join(' '));
  writeFileSync(SAVE, serialize(M)); console.log('[world] kept in', SAVE);
  process.exit(0);
}
if (typeof globalThis.gc === 'function') globalThis.gc();
const st = !LEGACY && MAIN_STATIONS3.find((q) => q.name === opt('--near', 'Midtown'));
const near = st ? { nearX: st.at[0] * TILE, nearY: st.at[1] * TILE } : {};
// --amb: an ambulance at work in the box, a flatbed stuck behind it, traffic waiting: how long till they're all through
if (args.includes('--amb')) {
  for (const lights of [false, true]) {
    const w = new World(M, { npcBudget: 0, throwErrors: true }), n = findFourWay(M, { lights, ...near });
    const { p } = joinPlayer(w); teleport(w, p.ped, n.x + boxR(n) + 140, n.y + boxR(n) + 140); p.ped.protectUntil = 1e9;
    const { amb, stuck, waiting } = buildAmbulanceBlock(w, n);
    const through = (v) => !w.get(v.id) || (v.ai && v.ai.from === n.id && Math.hypot(v.x - n.x, v.y - n.y) > boxR(n) + v.def.L / 2);
    const SNAP = opt('--snap', ''), still = new Map();
    let t = 0;
    for (; t < 90 * 20 && ![stuck, ...waiting].every(through); t++) {
      if (SNAP && t % 100 === 0) { const { svg } = snapshot(w, n, still, 350); const f = `${SNAP}/amb${lights ? 'L' : 'U'}-${t / 20}`; writeFileSync(f + '.svg', svg); execFileSync('rsvg-convert', ['-o', f + '.png', f + '.svg']); }
      w.step();
    }
    console.log(JSON.stringify({ lights, s: t / 20, flatbed: through(stuck), waitingThrough: waiting.filter(through).length + '/' + waiting.length, amb: Math.round(Math.hypot(amb.x - n.x, amb.y - n.y)), untied: w.knotsUntied || 0, realigned: w.realigned || 0 }));
  }
  process.exit(0);
}
// --knot: the owner's knot built in the box (test/gridlocksim.js buildKnot), a player watching: how long it takes to clear
if (args.includes('--knot')) {
  for (const lights of [false, true]) {
    const w = new World(M, { npcBudget: 0, throwErrors: true }), n = findFourWay(M, { lights, ...near });
    const { p } = joinPlayer(w); teleport(w, p.ped, n.x + boxR(n) + 140, n.y + boxR(n) + 140); p.ped.protectUntil = 1e9;
    const { knot, queue } = buildKnot(w, n);
    const out = (v) => !w.get(v.id) || Math.hypot(v.x - n.x, v.y - n.y) > boxR(n) + v.def.L / 2;
    const SNAP = opt('--snap', ''), still = new Map();
    let t = 0;
    for (; t < 60 * 20 && !knot.every(out); t++) {
      if (SNAP && t % 100 === 0) { const { svg } = snapshot(w, n, still, 350); const f = `${SNAP}/knot${lights ? 'L' : 'U'}-${t / 20}`; writeFileSync(f + '.svg', svg); execFileSync('rsvg-convert', ['-o', f + '.png', f + '.svg']); }
      w.step();
    }
    console.log(JSON.stringify({ lights, node: n.id, inBox: knot.map((v) => v.model), queued: queue.length, clearS: t / 20, left: knot.filter((v) => !out(v)).map((v) => v.model), untied: w.knotsUntied || 0 }));
  }
  process.exit(0);
}
for (const lights of which === 'both' ? [true, false] : [which === 'lights']) {
  const SNAP = opt('--snap', '');
  let k = 0;
  const snap = SNAP ? (w, n, still, v) => {
    const { svg, rows } = snapshot(w, n, still);
    const base = `${SNAP}/${lights ? 'L' : 'U'}${k++}-t${Math.round(w.time)}-v${v.id}`;
    writeFileSync(base + '.svg', svg); writeFileSync(base + '.json', JSON.stringify(rows, null, 0).replace(/},{/g, '},\n{'));
    try { execFileSync('rsvg-convert', ['-o', base + '.png', base + '.svg']); } catch { /* (no converter: the svg) */ }
  } : null;
  const r = runFourWay(M, { lights, seed: SEED, minutes: MIN, feedEvery: +opt('--feed', 3.5), snap, snapAfter: +opt('--snap-after', 30), ...near });
  delete r.world;
  console.log(JSON.stringify(r));
}
