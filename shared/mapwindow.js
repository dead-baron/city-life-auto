// A window onto the world (World v3, docs/WORLD-V3.md part 8, item 1): a CityMap that holds a rectangle of the world's
// tiles and answers every query in world tiles as the whole map does inside it. The client will keep only the land
// round the player (a 3 x 3 window of regions); code that reads the map indexes it through m.idx / m.inside, so a
// window and the whole map read alike.
//   windowOf(map, x0, y0, w, h) -> a CityMap with x0, y0, w, h of its own:
//   - every per-tile layer (a typed array of map.w x map.h: tiles, dist, zone, river, reserve, deck, lvl0Block,
//     roadAxis, roadRank, bld, cover, land, lake, distSea, ...) cut to the rectangle;
//   - the tile-keyed maps (solidProps, flow: keyed by the tile's index) cut and keyed by the window's index;
//   - the lists (props, pois, buildings, roads, nodes, edges, ...) kept whole for now (the region files split them);
//   - caches (fields named _...) left behind: they're worked out again for the window when asked.
// Outside the rectangle tileAt answers T.WALL (nothing moves into land the window doesn't hold), past the world's edge
// the open sea as before.
import { CityMap, cityFromData } from './map.js';

const TILE_KEYED = new Set(['solidProps', 'flow']);

export function windowOf(map, x0, y0, w, h) {
  // (the rectangle, inside the map it's cut from)
  const ax = Math.max(map.x0, x0 | 0), ay = Math.max(map.y0, y0 | 0);
  const bx = Math.min(map.x0 + map.w, (x0 | 0) + (w | 0)), by = Math.min(map.y0 + map.h, (y0 | 0) + (h | 0));
  if (bx <= ax || by <= ay) throw new Error(`windowOf: (${x0}, ${y0}, ${w}, ${h}) holds none of the map`);
  const W = bx - ax, H = by - ay, N = map.w * map.h;
  const win = {};
  for (const k of Object.keys(map)) {
    const v = map[k];
    if (k[0] === '_') continue;
    if (ArrayBuffer.isView(v) && !(v instanceof DataView) && v.length === N) {
      // (each tile through the map's own index: the source may be laid out otherwise; the window is rows of W)
      const out = new v.constructor(W * H);
      for (let ty = ay; ty < by; ty++) { const r = map.row(ty), d = (ty - ay) * W - ax; for (let tx = ax; tx < bx; tx++) out[d + tx] = v[r + map.col(tx)]; }
      win[k] = out;
    } else if (TILE_KEYED.has(k) && v instanceof Map) {
      const out = new Map();
      for (let ty = ay; ty < by; ty++) for (let tx = ax; tx < bx; tx++) { const e = v.get(map.idx(tx, ty)); if (e !== undefined) out.set((ty - ay) * W + (tx - ax), e); }
      win[k] = out;
    } else win[k] = v;
  }
  win.x0 = ax; win.y0 = ay; win.w = W; win.h = H;
  // the wild biome at a tile (terrainCls.at, a closure over the map's own layers): the window's own
  if (map.terrainCls) win.terrainCls = { cls: map.terrainCls.cls, cw: map.terrainCls.cw };
  const m = cityFromData(win);
  if (!(m instanceof CityMap)) throw new Error('windowOf: not a CityMap');
  return m;
}
