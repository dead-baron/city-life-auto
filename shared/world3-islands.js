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
import { TILE } from './constants.js';
import { SEEDS } from './citylayout.js';
import { ISLAND_SEEDS } from './islands.js';
import { ARTS } from './metro.js';
import { setIslandBuilds, ISLAND_AT } from './map.js';
import { islandMask } from './world3.js';

// (asked = generateCity's opts: { island, keepLinks } - keepLinks keeps the roads to other islands, the bridges, as
// laid today: to measure what leaving them out changes)
export function islandOpts(key, asked = {}) {
  const seeds = SEEDS.concat(ISLAND_SEEDS);
  let today = null, mass = null, W = 0, H = 0;   // (W, H: the frame being built - the map's, from when its land is handed over)
  const tileOf = (x, y) => { const tx = Math.floor(x), ty = Math.floor(y); return tx >= 0 && ty >= 0 && tx < W && ty < H ? ty * W + tx : -1; };
  // (a planned business's home: its spot, its district's first seed, or where map.js seedOf puts it - the Arts
  // District's rectangle, Metro City for a district without seeds)
  const home = (sp) => { if (sp.at) return sp.at; const s = seeds.find((q) => q[0] === sp.d); return s ? [s[1], s[2]] : sp.d === 46 ? [(ARTS.x0 + ARTS.x1) >> 1, (ARTS.y0 + ARTS.y1) >> 1] : [800, 500]; };
  let own = null;
  const o = {
    island: key,
    islandAt: [],
    // a road that comes from another island (Northshore's two avenues, the bridges from Metro City run on through town:
    // islands.js) starts at this island's shore when that island isn't built: from (x, y0) down its land to the shore
    ownShore(x, y0) {
      let y = y0;
      if (!own || !own[y * W + x]) return null;
      while (y + 1 < H && own[(y + 1) * W + x]) y++;
      return { x: x * TILE, y: y * TILE };
    },
    land(land, m) {
      own = land;
      today = land.slice();
      W = m.w; H = m.h;
      const keep = islandMask(land, W, H, key, seeds);
      const N = W * H, lab = new Int8Array(N).fill(-1), st = new Int32Array(N);
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
      // today's landmasses the build's land is part of: the land beyond its seams (Dry Creek's fields for Metro City,
      // the airport's and Highland Woods' for Westport) - a road over a seam is the island's, one to another landmass
      // is a bridge
      mass = new Uint8Array(N);
      for (let i = 0; i < N; i++) {
        if (!keep[i] || mass[i]) continue;
        let sp = 0; mass[i] = 1; st[sp++] = i;
        while (sp) { const j = st[--sp]; for (const k of near(j, j % W)) if (k >= 0 && k < N && land[k] && !mass[k]) { mass[k] = 1; st[sp++] = k; } }
      }
      for (let i = 0; i < N; i++) if (!keep[i]) land[i] = 0;
    },
    special(sp, at, m) { const h = home(sp), i = h ? tileOf(h[0], h[1]) : -1; return !h || (i >= 0 && !!m.land[i]); },
    lines(lines, m) {
      const leftOut = [], overSeam = [];
      let others = 0;
      for (let k = lines.length; k--;) {
        let mine = false, seam = false, theirs = false;
        const on = [];
        for (const p of lines[k].pts) {
          const i = tileOf(p.x / TILE, p.y / TILE);
          if (i < 0) continue;
          if (m.land[i]) { mine = true; on.push(i % W, (i / W) | 0); } else if (today[i]) { if (mass[i]) seam = true; else theirs = true; }
        }
        // (its own, or over a seam onto land of its landmass another piece takes - kept whole, as today: it ends at
        // the designed shore later; or a bridge to another landmass - left out unless asked to keep it)
        if (mine && (!theirs || asked.keepLinks)) { if (seam) overSeam.push(lines[k].name || lines[k].kind); continue; }
        if (mine) leftOut.push({ name: lines[k].name || '', kind: lines[k].kind, on }); else others++;
        lines.splice(k, 1);
      }
      m.islandBuild = { island: key, leftOut: leftOut.reverse(), overSeam: overSeam.reverse(), otherLines: others, noRoom: [] };
    },
  };
  return o;
}
setIslandBuilds(islandOpts);
