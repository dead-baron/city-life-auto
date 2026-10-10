// World v3's island builds (docs/WORLD-V3.md 4.7): generateCity(seed, { island }) builds one piece of part 2's table
// (shared/world3.js ISLAND_BUILDS) alone, in today's frame (placed in the v3 frame by its offset afterwards). Importing
// this module is what lets generateCity take `island` (it registers the builder with map.js), so none of it is in the
// page's code: the live world never builds an island alone. What an island build is:
// - its land (world3.js islandMask): the rest of today's land is sea;
// - a piece cut from a landmass that ISLAND_AT names (the airport, Highland Woods, Granite Peaks lose the point that names
//   theirs) keeps the landmass's zone;
// - the planned businesses of its own districts (their planned spot or their district's seed on its land);
// - only its own roads: the other islands' (islandRoads, countrysideRoads, laid from data over what is now sea) are left
//   out, and so is a road that leaves it for another piece's land (a bridge, a road over a cut): the skeleton's, later,
//   listed in m.islandBuild.leftOut with where it ran on the island (`on`: tile x, y pairs - the seam it leaves).
// What it can't build yet is in 4.7 (the railway is still laid whole; ids, names and the random stream are world-wide).
import { MAP_W, MAP_H, TILE } from './constants.js';
import { SEEDS } from './citylayout.js';
import { ISLAND_SEEDS } from './islands.js';
import { ARTS } from './metro.js';
import { setIslandBuilds, ISLAND_AT } from './map.js';
import { islandMask } from './world3.js';

export function islandOpts(key) {
  const seeds = SEEDS.concat(ISLAND_SEEDS);
  let today = null;
  const tileOf = (x, y) => { const tx = Math.floor(x), ty = Math.floor(y); return tx >= 0 && ty >= 0 && tx < MAP_W && ty < MAP_H ? ty * MAP_W + tx : -1; };
  // (a planned business's home: its spot, its district's first seed, or where map.js seedOf puts it - the Arts
  // District's rectangle, Metro City for a district without seeds)
  const home = (sp) => { if (sp.at) return sp.at; const s = seeds.find((q) => q[0] === sp.d); return s ? [s[1], s[2]] : sp.d === 46 ? [(ARTS.x0 + ARTS.x1) >> 1, (ARTS.y0 + ARTS.y1) >> 1] : [800, 500]; };
  const o = {
    island: key,
    islandAt: [],
    land(land) {
      today = land.slice();
      const keep = islandMask(land, MAP_W, MAP_H, key, seeds);
      const W = MAP_W, N = W * MAP_H, lab = new Int8Array(N).fill(-1), st = new Int32Array(N);
      const near = (j, x) => [x > 0 ? j - 1 : -1, x < W - 1 ? j + 1 : -1, j - W, j + W];
      // today's landmasses that ISLAND_AT names, then a point on each of the build's own landmasses with that zone
      ISLAND_AT.forEach(([[x, y]], a) => {
        const s0 = y * W + x;
        if (!land[s0] || lab[s0] >= 0) return;
        let sp = 0; lab[s0] = a; st[sp++] = s0;
        while (sp) { const j = st[--sp]; for (const k of near(j, j % W)) if (k >= 0 && k < N && lab[k] < 0 && land[k]) { lab[k] = a; st[sp++] = k; } }
      });
      const done = new Uint8Array(N);
      for (let i = 0; i < N; i++) {
        if (!keep[i] || done[i]) continue;
        let sp = 0; done[i] = 1; st[sp++] = i;
        while (sp) { const j = st[--sp]; for (const k of near(j, j % W)) if (k >= 0 && k < N && keep[k] && !done[k]) { done[k] = 1; st[sp++] = k; } }
        if (lab[i] >= 0) o.islandAt.push([[i % W, (i / W) | 0], ISLAND_AT[lab[i]][1]]);
      }
      for (let i = 0; i < N; i++) if (!keep[i]) land[i] = 0;
    },
    special(sp, at, m) { const h = home(sp), i = h ? tileOf(h[0], h[1]) : -1; return !h || (i >= 0 && !!m.land[i]); },
    lines(lines, m) {
      const leftOut = [];
      let others = 0;
      for (let k = lines.length; k--;) {
        let mine = false, theirs = false;
        const on = [];
        for (const p of lines[k].pts) { const i = tileOf(p.x / TILE, p.y / TILE); if (i < 0) continue; if (m.land[i]) { mine = true; on.push(i % MAP_W, (i / MAP_W) | 0); } else if (today[i]) theirs = true; }
        if (mine && !theirs) continue;
        if (mine) leftOut.push({ name: lines[k].name || '', kind: lines[k].kind, on }); else others++;
        lines.splice(k, 1);
      }
      m.islandBuild = { island: key, leftOut: leftOut.reverse(), otherLines: others, noRoom: [] };
    },
  };
  return o;
}
setIslandBuilds(islandOpts);
