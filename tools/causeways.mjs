// Roads laid on the sea as land (the owner, 11-25: a highway bridge drawn with a hard edge against the water, "it
// should be a bridge that things can go under ... a passable channel underneath for boats and swimmers and fish and
// animals"). World v3 built as the server builds it; every road tile (T.ROAD, on a road edge) with open water within
// R tiles on both sides of it - east and west, or north and south - is a causeway tile: road where a bridge should
// be. Connected runs of them, longest first, with their boxes; beside them how many T.BRIDGE tiles the world has.
//   node tools/causeways.mjs [R=7] [min=10]     (heavy: under flock /tmp/cla-heavy.lock)
import { join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
const ROOT = fileURLToPath(new URL('..', import.meta.url)), imp = (f) => import(pathToFileURL(join(ROOT, f)).href);
const R = +(process.argv[2] || 7), MIN = +(process.argv[3] || 10);
const { buildWorld3 } = await imp('server/world3.js');
const { T } = await imp('shared/constants.js');
const { map: M } = await buildWorld3(1337, { log: () => {} });
export function causewayRuns(M, T, R = 7, MIN = 10) {
  const wet = (x, y) => { if (!M.inside(x, y)) return false; const t = M.tiles[M.idx(x, y)]; return t === T.WATER || t === T.DEEP; };
  const side = (x, y, dx, dy) => { for (let k = 1; k <= R; k++) { const X = x + dx * k, Y = y + dy * k; if (!M.inside(X, Y)) return false; const t = M.tiles[M.idx(X, Y)]; if (t === T.WATER || t === T.DEEP) return true; if (t !== T.ROAD && t !== T.SIDEWALK && t !== T.BRIDGE) return false; } return false; };
  const mark = new Map(); let bridge = 0;
  for (let y = M.y0; y < M.y0 + M.h; y++) for (let x = M.x0; x < M.x0 + M.w; x++) {
    const t = M.tiles[M.idx(x, y)];
    if (t === T.BRIDGE) bridge++;
    if (t !== T.ROAD) continue;
    if ((side(x, y, 1, 0) && side(x, y, -1, 0)) || (side(x, y, 0, 1) && side(x, y, 0, -1))) mark.set(x + ',' + y, 0);
  }
  const runs = [];
  for (const k of mark.keys()) {
    if (mark.get(k)) continue;
    const q = [k]; mark.set(k, 1); let n = 0, x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
    while (q.length) { const [x, y] = q.pop().split(',').map(Number); n++; x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const j = (x + dx) + ',' + (y + dy); if (mark.has(j) && !mark.get(j)) { mark.set(j, 1); q.push(j); } } }
    if (Math.max(x1 - x0, y1 - y0) + 1 >= MIN) runs.push({ n, box: [x0, y0, x1, y1], len: Math.max(x1 - x0, y1 - y0) + 1 });
  }
  runs.sort((a, b) => b.len - a.len);
  return { runs, tiles: mark.size, bridge };
}
const r = causewayRuns(M, T, R, MIN);
console.log(`${r.tiles} road tiles with water within ${R} tiles on both sides; ${r.runs.length} runs of ${MIN} tiles or more; ${r.bridge} bridge tiles in the world`);
for (const q of r.runs.slice(0, 40)) console.log(`  ${q.len} long, ${q.n} tiles, box ${q.box.join(',')}`);
