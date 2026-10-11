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
import { joinPlace } from './world3-crossings.js';
import { ISLANDS as SK_ISLANDS } from './world3-skeleton.js';

// A placement (docs/WORLD-V3.md 8.4): the piece built at its place in another frame - today's position p (tiles) goes to
// at + (p - from) * scale (`from`: today's [x0, y0, ...], the picture's; shared/world3-skeleton.js ISLANDS' `picture`).
// dx, dy: the offset at - from (whole tiles), what position seeds and hashes take back off (map.js LX / LY), so a place
// built at scale 1 is today's, moved.
export function placement(place) {
  const at = place.at, from = place.from, s = place.scale ?? 1;
  if (!Number.isInteger(at[0] - from[0]) || !Number.isInteger(at[1] - from[1])) throw new Error('placement: at - from must be whole tiles');
  return { at: [at[0], at[1]], from: [from[0], from[1]], s, dx: at[0] - from[0], dy: at[1] - from[1] };
}
// a byte grid of W x H with today's land at its top-left, moved to the placement (scale 1: by its offset; else each tile
// takes today's at from + (p - at) / scale, the picture's way: shared/world3-land.js)
function placeGrid(g, W, H, pl) {
  const out = new Uint8Array(W * H);
  if (pl.s === 1) {
    for (let y = Math.max(0, -pl.dy); y < H && y + pl.dy < H; y++) for (let x = Math.max(0, -pl.dx); x < W && x + pl.dx < W; x++) { const v = g[y * W + x]; if (v) out[(y + pl.dy) * W + x + pl.dx] = v; }
    return out;
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const sx = pl.from[0] + Math.floor((x + 0.5 - pl.at[0]) / pl.s), sy = pl.from[1] + Math.floor((y + 0.5 - pl.at[1]) / pl.s);
    if (sx >= 0 && sy >= 0 && sx < W && sy < H) out[y * W + x] = g[sy * W + sx];
  }
  return out;
}

// (asked = generateCity's opts: { island, keepLinks, place } - keepLinks keeps the roads to other islands, the bridges, as
// laid today: to measure what leaving them out changes; place: { at, scale, from } builds it at its place, 8.4)
export function islandOpts(key, asked = {}) {
  const seeds = SEEDS.concat(ISLAND_SEEDS);
  const pl = asked.place ? placement(asked.place) : null;
  const PX = (x) => (pl ? pl.at[0] + (x - pl.from[0]) * pl.s : x), PY = (y) => (pl ? pl.at[1] + (y - pl.from[1]) * pl.s : y);
  let today = null, mass = null, W = 0, H = 0;   // (W, H: the frame being built - the map's, from when its land is handed over)
  const tileOf = (x, y) => { const tx = Math.floor(x), ty = Math.floor(y); return tx >= 0 && ty >= 0 && tx < W && ty < H ? ty * W + tx : -1; };
  // (a planned business's home: its spot, its district's first seed, or where map.js seedOf puts it - the Arts
  // District's rectangle, Metro City for a district without seeds)
  const home = (sp) => { if (sp.at) return sp.at; const s = seeds.find((q) => q[0] === sp.d); return s ? [s[1], s[2]] : sp.d === 46 ? [(ARTS.x0 + ARTS.x1) >> 1, (ARTS.y0 + ARTS.y1) >> 1] : [800, 500]; };
  let own = null;
  // (asked.land: the v3 frame's land, shared/world3-land.js buildLand3 - the build's land is the place's there: the
  // land of its zones in its picture's rectangle (the polygon, less the canal); the canal is the generator's river
  // (boatable, bridged); its districts and zones are the land layer's. The frame must be the land's.)
  const land3 = asked.land || null, Z3 = asked.zones || [1, 2];
  const land3Land = (land, m) => {
    const L = land3.layers, N = m.w * m.h;
    if (land3.w !== m.w || land3.h !== m.h) throw new Error(`island build on the v3 land: the frame must be the land's (${land3.w} x ${land3.h})`);
    W = m.w; H = m.h;
    const pic = asked.place;
    let x0 = Math.max(0, pic.at[0] - 40), y0 = Math.max(0, pic.at[1] - 40);
    let x1 = Math.min(W, Math.ceil(pic.at[0] + (pic.from[2] - pic.from[0]) * (pic.scale ?? 1)) + 40), y1 = Math.min(H, Math.ceil(pic.at[1] + (pic.from[3] - pic.from[1]) * (pic.scale ?? 1)) + 40);
    // (and the island's polygon, which can reach past the picture: Metro City's new east shore, beyond today's cut at
    // Dry Creek - the rectangle cut it ruler-straight at the picture's edge - H21)
    const isl = SK_ISLANDS.find((I) => I.key === key);
    if (isl && isl.poly) for (const [x, y] of isl.poly) { x0 = Math.max(0, Math.min(x0, x - 40)); y0 = Math.max(0, Math.min(y0, y - 40)); x1 = Math.min(W, Math.max(x1, x + 40)); y1 = Math.min(H, Math.max(y1, y + 40)); }
    land.fill(0);
    today = new Uint8Array(N); mass = new Uint8Array(N);
    for (let i = 0; i < N; i++) if (L.land[i]) today[i] = 1;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const i = y * W + x;
      if (L.land[i] && Z3.includes(L.zone[i])) { land[i] = 1; mass[i] = 1; }
      else if (L.water[i] === 5) m.river[i] = 1;   // (WATER3.CANAL)
    }
    // (the canal's water within 12 tiles of the open sea is the sea's: its mouths, and where it ate a thin strip of land
    // and lies against the sea - drawn as river there, it showed as a band)
    const dd = new Int16Array(N).fill(-1), q = [];
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const i = y * W + x;
      if (!m.river[i]) continue;
      for (const k of [i - 1, i + 1, i - W, i + W]) if (L.water[k] === 1 || L.water[k] === 2) { dd[i] = 0; q.push(i); break; }
    }
    for (let h = 0; h < q.length; h++) {
      const i = q[h];
      if (dd[i] >= 12) continue;
      for (const k of [i - 1, i + 1, i - W, i + W]) if (m.river[k] && dd[k] < 0) { dd[k] = dd[i] + 1; q.push(k); }
    }
    for (const i of q) m.river[i] = 0;
    // (what that leaves of the canal apart from its body - a wedge cut off on Pine Hills' north-west shore - is the
    // sea's too: the canal is one water)
    const comp = new Int32Array(N).fill(-1), sizes = [];
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const s0 = y * W + x;
      if (!m.river[s0] || comp[s0] >= 0) continue;
      const c = sizes.length, st = [s0];
      comp[s0] = c; let n = 0;
      while (st.length) { const i = st.pop(); n++; for (const k of [i - 1, i + 1, i - W, i + W]) if (m.river[k] && comp[k] < 0) { comp[k] = c; st.push(k); } }
      sizes.push(n);
    }
    const body = sizes.indexOf(Math.max(...sizes, 0));
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = y * W + x; if (m.river[i] && comp[i] !== body) m.river[i] = 0; }
    o.box = [x0, y0, x1, y1];   // (the land's rectangle: map.js's coast drives reach the new east shore)
    o.noRail = true;   // (the railway isn't the island's: the skeleton's main line replaces it - listed in leftOut)
    own = land;
    o.ownRiver = true;   // (the canal is the river: map.js's trace of today's river would mark the bay's water)
    o.zones = (mm) => { for (let i = 0; i < N; i++) if (land[i]) mm.zone[i] = L.zone[i]; };
    o.dists = (mm) => { for (let i = 0; i < N; i++) if (land[i]) mm.dist[i] = L.dist[i]; };
  };
  const o = {
    island: key,
    islandAt: [],
    place: pl,
    // a road that comes from another island (Northshore's two avenues, the bridges from Metro City run on through town:
    // islands.js) starts at this island's shore when that island isn't built: from (x, y0) down its land to the shore
    ownShore(x, y0) {
      let y = y0;
      if (!own || !own[y * W + x]) return null;
      while (y + 1 < H && own[(y + 1) * W + x]) y++;
      return { x: x * TILE, y: y * TILE };
    },
    land(land, m) {
      if (land3) return land3Land(land, m);
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
      if (pl) {
        // (placed: the land, today's and its landmasses moved to the place; the zone points with them)
        const k2 = placeGrid(land, W, H, pl);
        land.set(k2);
        today = placeGrid(today, W, H, pl); mass = placeGrid(mass, W, H, pl);
        o.islandAt = o.islandAt.map(([[x, y], z]) => [[Math.floor(PX(x)), Math.floor(PY(y))], z]);
      }
    },
    special(sp, at, m) { const h = home(sp), i = h ? tileOf(PX(h[0]), PY(h[1])) : -1; return !h || (i >= 0 && !!m.land[i]); },
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
      // (on the v3 land: the canal's bridges, the roads off the place cut at the shore, the railway left out - H21,
      // shared/world3-crossings.js)
      if (land3) {
        m.islandBuild.crossings = joinPlace(lines, m, own, !!SK_ISLANDS.find((I) => I.key === key)?.canal);
        m.islandBuild.leftOut.push({ name: 'The railway', kind: 'rail', on: [] });
      }
    },
  };
  return o;
}
setIslandBuilds(islandOpts);
