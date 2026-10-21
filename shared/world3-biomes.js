// World v3, stage 3, step 2 (docs/WORLD-V3.md 8.8): the mainland's biomes, each with its own ground and dressing, as
// today's wild places are designed (docs/art-v2/targets WR2-A..C, NA1-A..F, N1..N8, E3c-f) - for the whole-world build
// only (shared/world3-world.js calls these through the generator's hooks; nothing live imports this module):
// - groundOf3(m, L, keep): the ground, in the generator's tiles, after the districts are painted (opts.dists): the
//   desert's sand sheets and dry washes by noise of several sizes (never a repeating band), the peaks' scree with alpine
//   meadows below the snow line, the ridge's scrub, the marsh's tidal creeks (shallow water, as a river's);
// - dress3(m, L, keep, H): what stands on it, before the wilds' own dressing (opts.dress; map.js buildWilds leaves
//   these districts to it, and Highland Woods' redwoods are its redwoodGroves', with stands of pine - opts.pine):
//   Granite Peaks' granite, scree boulders, mountain pines below the tree line, alpine meadows' flowers and dwarf shrubs;
//   North Ridge's rock and scrub; Willow Valley's patchwork of fields (the generator's crops), orchards, lavender and
//   sunflower rows, pastures, hedgerows and farmsteads with barns and silos, in sections clear of the county roads; the
//   Red Rock Desert's mesas, buttes and outcrops of sandstone, scrub, cacti, joshua trees and mesquite by patches,
//   mesquite along the washes; the coasts' dune and beach grass; the Egret Coast's reeds and cattails;
// - terrain3(m, L, cls): the terrain classes the renderer and the wildlife read (m.terrainCls, 4-tile cells) at the v3
//   frame, once the build is done (opts.done).
// Every choice is a hash of the tile (shared/rng.js hash2) or a value noise of it: deterministic, no random stream, no
// Math.sin (CLAUDE.md). `keep` is the room left along the skeleton's lines (skeletonRoom): nothing is put there, so the
// roads the next step lays (H27) find it clear.
import { T, TILE } from './constants.js';
import { hash2 } from './rng.js';
import { TERRAIN_CELL } from './worldmask-dims.js';
import { HIGHWAYS, ARTERIALS, MAIN_LINE } from './world3-skeleton.js';

// the mainland's districts (shared/world3-land.js DISTRICTS3)
export const D3 = { WOODS: 47, PEAKS: 48, VALLEY: 49, DESERT: 50, RIDGE: 51, SANDPIPER: 52, EGRET: 53, BEACHES: 54, PRISON: 55, ROCKS: 56 };
export const isMainland3 = (d) => d >= 47 && d <= 56;
// the districts dress3 dresses whole (map.js buildWilds skips them); Highland Woods is the wilds' (redwoodGroves)
export const dressedBy3 = (d) => d >= 48 && d <= 56;
// Willow Valley's sections: a county road may run along every line of this grid (x from County Road 7, y from Valley
// Road), the fields keep SECTION_ROOM tiles off it
export const SECTION = 250, SECTION_X0 = 2712 % 250, SECTION_ROOM = 12;

// value noise over tiles (s: feature size in tiles), 0..1
function vn(x, y, s, seed) {
  const fx = x / s, fy = y / s, ix = Math.floor(fx), iy = Math.floor(fy);
  let tx = fx - ix, ty = fy - iy; tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty);
  const a = hash2(ix, iy, seed), b = hash2(ix + 1, iy, seed), c = hash2(ix, iy + 1, seed), d = hash2(ix + 1, iy + 1, seed);
  return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
}
const sm = (a, b, v) => { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
const pick = (list, u) => list[Math.min(list.length - 1, Math.floor(u * list.length))];

// The room along the skeleton's lines: highways 22 tiles either side of the line, arterials and the main line 14
// (their own half-width and a margin) - a byte per tile of the frame.
export function skeletonRoom(W, H) {
  const keep = new Uint8Array(W * H);
  const lines = [...HIGHWAYS.map((l) => [l.pts, 22]), ...ARTERIALS.map((l) => [l.pts, 14]), ...MAIN_LINE.map((l) => [l.pts, 14])];
  for (const [pts, r] of lines) for (let s = 0; s + 1 < pts.length; s++) {
    const [ax, ay] = pts[s], [bx, by] = pts[s + 1], dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1;
    const x0 = Math.max(0, Math.floor(Math.min(ax, bx) - r)), x1 = Math.min(W - 1, Math.ceil(Math.max(ax, bx) + r));
    const y0 = Math.max(0, Math.floor(Math.min(ay, by) - r)), y1 = Math.min(H - 1, Math.ceil(Math.max(ay, by) + r));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2)), ex = x - ax - t * dx, ey = y - ay - t * dy;
      if (ex * ex + ey * ey <= r * r) keep[y * W + x] = 1;
    }
  }
  return keep;
}

// The peaks' height (0..1, for the snow line, the tree line and the meadows): big and middling noise, higher to the north.
// (v3b, docs/WORLD-V3.md part 9: the owner's mountains run along the north-west and the west, from the north coast at
// y ~250 down to y ~1450 - the snow's bias falls off over that span, not the old frame's top 760 rows)
export const peakHeight = (x, y) => 0.42 * vn(x, y, 260, 4801) + 0.26 * vn(x, y, 90, 4802) + 0.08 * vn(x, y, 24, 4803) + 0.3 * (1 - Math.min(1, Math.max(0, y - 250) / 1200));
export const SNOW_LINE = 0.68, TREE_LINE = 0.56;
// the terrain class of the snowfields (after today's 0-5; the renderer's ground bake draws it as snow: groundbake.js)
export const SNOW_CLS = 9;
// The desert's sand: sheets and dunes where several noises add up (no band, no repeat); the dry washes: thin winding
// lines where a big noise crosses its middle.
const sandAt = (x, y) => 0.5 * vn(x, y, 120, 5001) + 0.32 * vn(x, y, 37, 5002) + 0.18 * vn(x, y, 9, 5003) > 0.63;
const washAt = (x, y) => Math.abs(vn(x, y, 210, 5004) + 0.3 * vn(x, y, 47, 5005) - 0.65) < 0.0075;
// The marsh's tidal creeks: the same kind of line, wider, near the sea.
const creekAt = (x, y) => Math.abs(vn(x, y, 120, 5301) + 0.25 * vn(x, y, 30, 5302) - 0.62) < 0.012;

// ---- the ground ------------------------------------------------------------------------------------------------
export function groundOf3(m, L, keep) {
  const W = m.w, H = m.h, out = { sand: 0, wash: 0, meadow: 0, creek: 0 };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (!m.land[i]) continue;
    const d = L.dist[i];
    if (!isMainland3(d) || L.terrain[i] === 5) continue;   // (5: the beaches, sand already)
    if (d === D3.DESERT) {
      if (washAt(x, y) && !keep[i]) { m.tiles[i] = T.SAND; m.reserve[i] |= 128; out.wash++; }   // (128: gravel bars - the renderer's shingle)
      else if (sandAt(x, y)) { m.tiles[i] = T.SAND; out.sand++; }
      else m.tiles[i] = T.DIRT;
    } else if (d === D3.PEAKS) {
      const h = peakHeight(x, y);
      if (h < TREE_LINE - 0.04 && vn(x, y, 70, 4810) > 0.52) { m.tiles[i] = T.GRASS; out.meadow++; }   // (an alpine meadow)
      else m.tiles[i] = T.DIRT;
    } else if (d === D3.RIDGE || d === D3.PRISON || d === D3.ROCKS) {
      m.tiles[i] = vn(x, y, d === D3.RIDGE ? 40 : 12, 5101 + d) > (d === D3.PRISON ? 0.4 : 0.55) ? T.GRASS : T.DIRT;   // (Prison Island: grass worn to dirt in small patches)
    } else if (d === D3.EGRET) {
      if (creekAt(x, y) && !keep[i] && m.distSea[i] < 4 * 260) { m.land[i] = 0; m.river[i] = 1; m.tiles[i] = T.WATER; out.creek++; }
      else m.tiles[i] = T.GRASS;
    }
  }
  return out;
}

// ---- the dressing ----------------------------------------------------------------------------------------------
const CLEAR = new Set([T.ROAD, T.BRIDGE, T.BUILDING, T.FIELD, T.LOT, T.WALL, T.SIDEWALK, T.PLAZA, T.DOCK]);
export function dress3(m, L, keep, H) {
  const W = m.w, HH = m.h, add = H.addProp, n = { trees: 0, rocks: 0, mesas: 0, plants: 0, fields: 0, farms: 0, orchards: 0, hedges: 0 };
  const okTile = (i, ...ts) => m.land[i] && !m.reserve[i] && !keep[i] && ts.includes(m.tiles[i]);
  const clear = (tx, ty, r) => { for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const t = m.tileAt(tx + dx, ty + dy); if (CLEAR.has(t) || t === T.WATER || t === T.DEEP) return false; } return true; };
  const free = new Uint8Array(W * HH);   // (tiles a rock or a tree stands on, with room round it: nothing else there)
  const take = (tx, ty, r) => { for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const x = tx + dx, y = ty + dy; if (x >= 0 && y >= 0 && x < W && y < HH) free[y * W + x] = 1; } };
  const solidLine = (x, y, w, d) => { const k = Math.max(1, Math.round(w / Math.max(40, d))); for (let j = 0; j < k; j++) m.addSolidProp(x + (k === 1 ? 0 : (j / (k - 1) - 0.5) * (w - d * 0.8)), y, Math.max(14, Math.round(d * 0.42))); };
  // a rock: an outcrop of its style (w x d, h tall; sizes in steps, so the renderer's sprites are shared)
  const outcrop = (tx, ty, w, d, h, style, s) => {
    const x = (tx + 0.5) * TILE, y = (ty + 0.5) * TILE;
    w = Math.round(w / 16) * 16; d = Math.round(d / 16) * 16; h = Math.round(h / 10) * 10;
    add(m, 'outcrop', x, y, 0, { w, d, h, style, s: s % 4 });
    solidLine(x, y, w, d);
    take(tx, ty, Math.ceil(Math.max(w, d) / TILE / 2) + 1);
    n.rocks++;
  };
  const plant = (kind, tx, ty, sp, k, r = 0, jx = 0.5, jy = 0.5) => { add(m, kind, Math.round((tx + jx) * TILE), Math.round((ty + jy) * TILE), r, { sp, k }); free[ty * W + tx] = 1; };

  // the mesas and buttes of the Red Rock Desert, the granite of the peaks and the ridge: a big rock on a 36-tile grid
  // where the rock noise says so, smaller outcrops and boulders on a 12-tile grid. (H50: the relief's tables - m.tables,
  // world3-relief.js - are the desert's mesas now: no rock on a table, its talus or near its foot; a few buttes on the
  // flats, fewer still round the tables)
  const tabs = m.tables || [];
  const nearTable = (tx, ty, pad, k = 1) => tabs.some((t) => ((tx - t.x) / (t.rx * k + pad)) ** 2 + ((ty - t.y) / (t.ry * k + pad)) ** 2 < 1);
  // (on a table, its rim or its talus, pad tiles out: the tables' squarish rim - a superellipse whose distance runs on its
  // short radius, ragged by up to a fifth: world3-relief.js tableEdge)
  const onTable = (tx, ty, pad) => tabs.some((t) => { const a = (tx - t.x) / t.rx, b = (ty - t.y) / t.ry, l = (1 + pad / Math.min(t.rx, t.ry)) * 1.23, l2 = l * l; return a * a * a * a + b * b * b * b < l2 * l2; });
  for (let gy = 0; gy < HH; gy += 36) for (let gx = 0; gx < W; gx += 36) {
    const tx = gx + 6 + Math.floor(hash2(gx, gy, 5501) * 24), ty = gy + 6 + Math.floor(hash2(gx, gy, 5502) * 24);
    if (tx >= W - 8 || ty >= HH - 8) continue;
    const i = ty * W + tx, d = L.dist[i], u = hash2(gx, gy, 5503);
    if (!okTile(i, T.DIRT, T.GRASS, T.SAND) || !clear(tx, ty, 8)) continue;
    if (d === D3.DESERT) {
      const r = vn(tx, ty, 300, 5504);   // (the rock country: the mesas stand in groups, with open flats between)
      if (u >= sm(0.45, 0.75, r) * (tabs.length ? 0.3 : 0.7) || onTable(tx, ty, 30) || (nearTable(tx, ty, 30, 1.3) && u >= 0.08)) continue;   // (v3b: the tables stand close in the mesa country - the blocks on the flats between)
      if (hash2(gx, gy, 5505) < (tabs.length ? 0.12 : 0.45)) {   // a mesa: two to four flat-topped blocks in a row, the tallest in the middle
        const parts = 2 + Math.floor(hash2(gx, gy, 5506) * 3), a = hash2(gx, gy, 5507) < 0.5 ? 1 : 0;
        for (let k = 0; k < parts; k++) {
          const ox = a ? Math.round((k - (parts - 1) / 2) * 7) : Math.round((hash2(gx + k, gy, 5508) - 0.5) * 4), oy = a ? Math.round((hash2(gx, gy + k, 5509) - 0.5) * 3) : Math.round((k - (parts - 1) / 2) * 5);
          const mid = 1 - Math.abs(k - (parts - 1) / 2) / parts;
          if (keep[(ty + oy) * W + tx + ox] || !clear(tx + ox, ty + oy, 5)) continue;
          outcrop(tx + ox, ty + oy, 200 + hash2(gx + k, gy, 5510) * 120, 120 + hash2(gx, gy + k, 5511) * 70, 70 + mid * 50, 'sandstone', gx + gy + k);
        }
        n.mesas++;
      } else outcrop(tx, ty, 90 + u * 120, 70 + hash2(gx, gy, 5512) * 50, 80 + hash2(gx, gy, 5513) * 40, 'sandstone', gx + gy);   // a butte
    } else if (d === D3.PEAKS) {
      const h = peakHeight(tx, ty);
      if (u >= 0.2 + sm(0.4, 0.75, h) * 0.55) continue;   // (rockier the higher)
      outcrop(tx, ty, 120 + hash2(gx, gy, 5520) * 200, 60 + hash2(gx, gy, 5521) * 70, 50 + h * 60, 'granite', gx + gy);
    } else if (d === D3.RIDGE || d === D3.PRISON || d === D3.ROCKS) {
      if (u >= 0.35) continue;
      outcrop(tx, ty, 90 + hash2(gx, gy, 5530) * 120, 50 + hash2(gx, gy, 5531) * 50, 40 + hash2(gx, gy, 5532) * 30, d === D3.ROCKS ? 'basalt' : 'granite', gx + gy);
    }
  }
  for (let gy = 0; gy < HH; gy += 12) for (let gx = 0; gx < W; gx += 12) {
    const tx = gx + 2 + Math.floor(hash2(gx, gy, 5540) * 8), ty = gy + 2 + Math.floor(hash2(gx, gy, 5541) * 8);
    if (tx >= W - 4 || ty >= HH - 4) continue;
    const i = ty * W + tx, d = L.dist[i];
    if (!dressedBy3(d) || free[i] || !okTile(i, T.DIRT, T.GRASS, T.SAND) || !clear(tx, ty, 3)) continue;
    const u = hash2(gx, gy, 5542), rocky = d === D3.PEAKS ? 0.18 + peakHeight(tx, ty) * 0.3 : d === D3.DESERT ? 0.05 + vn(tx, ty, 300, 5504) * 0.12 : d === D3.RIDGE || d === D3.ROCKS || d === D3.PRISON ? 0.25 : 0;
    if (u >= rocky) continue;
    if (hash2(gx, gy, 5543) < 0.45) { if (d === D3.DESERT && onTable(tx, ty, 22)) continue; outcrop(tx, ty, 50 + u * 160, 34 + hash2(gx, gy, 5544) * 30, 26 + hash2(gx, gy, 5545) * 26, d === D3.DESERT ? 'sandstone' : 'granite', gx * 3 + gy); }
    else { const s = 52 + Math.floor(hash2(gx, gy, 5546) * 4) * 10; add(m, 'boulder', (tx + 0.5) * TILE, (ty + 0.5) * TILE, Math.round(s * 0.5), { s }); take(tx, ty, 2); n.rocks++; }
  }

  // Willow Valley: the sections between the county roads, each cut into fields, an orchard, lavender or sunflower rows,
  // a pasture - with hedgerows between - and in some a farmstead (the farmhouse, the barn and the silos)
  const pf = H.farmstead;
  for (let sy = 0; sy < HH; sy += SECTION) for (let sx = SECTION_X0 - SECTION; sx < W; sx += SECTION) {
    const x0 = sx + SECTION_ROOM, y0 = sy + SECTION_ROOM, x1 = sx + SECTION - SECTION_ROOM, y1 = sy + SECTION - SECTION_ROOM;
    // (a section counts when part of it is the valley's: the strips are checked tile by tile)
    let any = false;
    for (let y = Math.max(0, y0); y < Math.min(HH, y1) && !any; y += 16) for (let x = Math.max(0, x0); x < Math.min(W, x1); x += 16) if (L.dist[y * W + x] === D3.VALLEY) { any = true; break; }
    if (!any) continue;
    const across = hash2(sx, sy, 5601) < 0.5, k = 2 + Math.floor(hash2(sx, sy, 5602) * 3);   // (2-4 strips, across or down)
    const len = across ? y1 - y0 : x1 - x0, cuts = [0];
    for (let j = 1; j < k; j++) cuts.push(Math.round(len * (j / k + (hash2(sx + j, sy, 5603) - 0.5) * 0.12)));
    cuts.push(len);
    let farm = hash2(sx, sy, 5604) < 0.6;
    for (let j = 0; j < k; j++) {
      const a = cuts[j] + 3, b = cuts[j + 1] - 3;   // (a hedgerow's room between strips)
      const r = across ? [x0, y0 + a, x1, y0 + b] : [x0 + a, y0, x0 + b, y1];
      const u = hash2(sx + j * 7, sy + j * 3, 5605);
      const use = u < 0.55 ? 'field' : u < 0.67 ? 'orchard' : u < 0.74 ? 'lavender' : u < 0.8 ? 'sunflowers' : 'pasture';
      // a farmstead at the strip's road end, its yard round it
      if (farm && pf && r[2] - r[0] > pf.tw + 8 && r[3] - r[1] > pf.th + 10) {
        const fx = r[0] + 3, fy = r[1] + 3;
        let ok = true;
        for (let y = fy - 2; y < fy + pf.th + 2 && ok; y++) for (let x = fx - 2; x < fx + pf.tw + 2; x++) { const i = y * W + x; if (x < 0 || y < 0 || x >= W || y >= HH || L.dist[i] !== D3.VALLEY || !okTile(i, T.GRASS, T.DIRT)) { ok = false; break; } }
        if (ok) {
          H.farmhouse(fx, fy);
          for (let y = fy - 2; y < fy + pf.th + 2; y++) for (let x = fx - 2; x < fx + pf.tw + 2; x++) { free[y * W + x] = 1; m.reserve[y * W + x] |= 16; }
          // a windbreak of trees behind it
          for (let x = fx - 2; x < fx + pf.tw + 2; x += 3) if (y0 + 1 < fy - 4 && okTile((fy - 4) * W + x, T.GRASS)) { plant('tree_a', x, fy - 4, pick(['oak', 'maple', 'oak', 'willow'], hash2(x, fy, 5606)), 1.35, 12); n.trees++; }
          n.farms++;
          farm = false;
          r[across ? 1 : 0] = across ? fy + pf.th + 4 : fx + pf.tw + 4;   // (the rest of the strip is its field)
          if (across && r[1] >= r[3] - 6) continue;
        }
      }
      if (r[2] - r[0] < 8 || r[3] - r[1] < 8) continue;
      if (use === 'field') {
        // a long strip is two or three fields end to end, a farm track's room between (each its own crop)
        const long = across ? r[2] - r[0] : r[3] - r[1], parts = long > 140 ? 2 + Math.floor(hash2(sx + j, sy + 5, 5614) * 2) : 1;
        for (let q = 0; q < parts; q++) {
          const c0 = Math.round(long * (q / parts + (q ? (hash2(sx + q, sy + j, 5615) - 0.5) * 0.15 : 0))) + (q ? 2 : 0);
          const c1 = q < parts - 1 ? Math.round(long * ((q + 1) / parts + (hash2(sx + q + 1, sy + j, 5615) - 0.5) * 0.15)) - 2 : long;
          const f = across ? [r[0] + c0, r[1], r[0] + c1, r[3]] : [r[0], r[1] + c0, r[2], r[1] + c1];
          let cnt = 0;
          for (let y = f[1]; y < f[3]; y++) for (let x = f[0]; x < f[2]; x++) { const i = y * W + x; if (x >= 0 && y >= 0 && x < W && y < HH && L.dist[i] === D3.VALLEY && okTile(i, T.GRASS, T.DIRT)) { m.tiles[i] = T.FIELD; cnt++; } }
          if (cnt > 200) { m.fields.push({ x: f[0] * TILE, y: f[1] * TILE, w: (f[2] - f[0]) * TILE, h: (f[3] - f[1]) * TILE }); n.fields++; }
        }
      } else if (use === 'orchard' || use === 'lavender' || use === 'sunflowers') {
        const step = use === 'orchard' ? 4 : 3, sp = use === 'orchard' ? (hash2(sx, sy + j, 5607) < 0.7 ? 'apple' : 'orange') : use;
        let cnt = 0;
        for (let y = r[1] + 1; y < r[3] - 1; y += step) for (let x = r[0] + 1; x < r[2] - 1; x += use === 'orchard' ? 4 : 2) {
          const i = y * W + x;
          if (x < 0 || y < 0 || x >= W || y >= HH || L.dist[i] !== D3.VALLEY || free[i] || !okTile(i, T.GRASS, T.DIRT) || !clear(x, y, 1)) continue;
          if (use === 'orchard') plant('tree_a', x, y, sp, 1.1 + hash2(x, y, 5608) * 0.15, 12);
          else plant(use === 'lavender' ? 'shrub_a' : 'flowers_a', x, y, sp, 1);
          cnt++;
        }
        if (cnt) { if (use === 'orchard') { n.orchards++; n.trees += cnt; } else n.plants += cnt; }
      } else {   // a pasture: open grass with a few shade trees
        for (let y = r[1] + 4; y < r[3] - 4; y += 9) for (let x = r[0] + 4; x < r[2] - 4; x += 9) {
          const i = y * W + x;
          if (hash2(x, y, 5609) > 0.12 || L.dist[i] !== D3.VALLEY || free[i] || !okTile(i, T.GRASS) || !clear(x, y, 2)) continue;
          plant('tree_a', x, y, pick(['oak', 'oak', 'maple', 'willow'], hash2(y, x, 5610)), 1.4, 12); n.trees++;
        }
      }
      // the hedgerow along the strip's far side (most strips have one)
      if (j < k - 1 && hash2(sx + j, sy + 11, 5611) < 0.75) {
        const hy = across ? y0 + cuts[j + 1] : 0, hx = across ? 0 : x0 + cuts[j + 1];
        for (let s = across ? x0 : y0; s < (across ? x1 : y1); s += 2) {
          const x = across ? s : hx, y = across ? hy : s, i = y * W + x;
          if (x < 0 || y < 0 || x >= W || y >= HH || L.dist[i] !== D3.VALLEY || free[i] || !okTile(i, T.GRASS, T.DIRT)) continue;
          if (hash2(x, y, 5612) < 0.12) { plant('tree_a', x, y, pick(['oak', 'maple', 'birch'], hash2(y, x, 5613)), 1.3, 12); n.trees++; }
          else { plant('shrub_a', x, y, 'hedge', 1); n.hedges++; }
        }
      }
    }
  }

  // what grows: a plant on a 3-tile grid, chosen by the biome and the patch noise
  for (let gy = 0; gy < HH; gy += 3) for (let gx = 0; gx < W; gx += 3) {
    const tx = gx + Math.floor(hash2(gx, gy, 5701) * 3), ty = gy + Math.floor(hash2(gx, gy, 5702) * 3);
    if (tx < 2 || ty < 2 || tx >= W - 2 || ty >= HH - 2) continue;
    const i = ty * W + tx, d = L.dist[i];
    if (!dressedBy3(d) || free[i] || d === D3.VALLEY) continue;
    const t = m.tiles[i];
    if (!m.land[i] || m.reserve[i] & ~128 || keep[i] || (t !== T.GRASS && t !== T.DIRT && t !== T.SAND)) continue;
    const u = hash2(gx, gy, 5703), v = hash2(gy, gx, 5704);
    if (d === D3.DESERT) {
      const wash = m.reserve[i] & 128, patch = vn(tx, ty, 50, 5705), wet = !wash && (washAt(tx + 3, ty) || washAt(tx - 3, ty) || washAt(tx, ty + 3) || washAt(tx, ty - 3));
      if (wash) continue;
      if (wet) { if (u < 0.3 && clear(tx, ty, 2)) { plant('tree_a', tx, ty, pick(['mesquite', 'paloVerde', 'mesquite'], v), 1.15, 12); n.trees++; } continue; }
      const p = 0.012 + sm(0.45, 0.8, patch) * 0.09;
      if (u >= p || !clear(tx, ty, 1)) continue;
      const w = (u / p);
      if (w < 0.08 && t !== T.SAND) { plant('tree_a', tx, ty, pick(['joshua', 'joshua', 'mesquite', 'deadSnag'], v), 1.15, 12); n.trees++; }
      else if (w < 0.42) { plant('cactus', tx, ty, pick(['saguaroBig', 'saguaroMid', 'saguaroSmall', 'pear', 'barrel', 'cholla', 'ocotillo', 'agave', 'yucca'], v), 1, 8); n.plants++; }
      else { plant('shrub_a', tx, ty, pick(t === T.SAND ? ['dryGrass', 'tumble', 'bursage'] : ['creosote', 'sage', 'brittle', 'bursage', 'dryGrass', 'creosote'], v), 1); n.plants++; }
    } else if (d === D3.PEAKS) {
      const h = peakHeight(tx, ty);
      if (h >= SNOW_LINE) continue;   // (the snowfields: bare)
      if (h < TREE_LINE) {
        const stand = vn(tx, ty, 45, 5710);   // (stands of pine with open slopes between)
        if (u < sm(0.4, 0.62, stand) * 0.5 * (1 - sm(TREE_LINE - 0.12, TREE_LINE, h) * 0.7) && clear(tx, ty, 2)) { plant('tree_a', tx, ty, pick(['mtnPine', 'mtnFir', 'whitePine', 'mtnFir', 'mtnPine', 'larch'], v), 1.3 + hash2(tx, ty, 5711) * 0.25, 12); n.trees++; continue; }
      }
      if (t === T.GRASS && u < 0.18) { plant('flowers_a', tx, ty, pick(['aLupine', 'paintbrush', 'aDaisies', 'heather'], v), 1); n.plants++; }
      else if (u < 0.05 + (h < TREE_LINE + 0.05 ? 0.04 : 0)) { plant('shrub_a', tx, ty, pick(['juniper', 'heather', 'twisted', 'berryShrub'], v), 1); n.plants++; }
    } else if (d === D3.RIDGE || d === D3.PRISON || d === D3.ROCKS) {
      const p = t === T.GRASS ? 0.16 : 0.05;
      if (u >= p) continue;
      if (u < 0.012 && clear(tx, ty, 2)) { plant('tree_a', tx, ty, pick(['pondPine', 'mtnPine', 'deadSnag'], v), 1.25, 12); n.trees++; }
      else { plant('shrub_a', tx, ty, pick(['juniper', 'twisted', 'sage', 'dryGrass', 'heather'], v), 1); n.plants++; }
    } else if (d === D3.EGRET) {
      const nearW = m.distRiver[i] < 4 * 5 || m.distSea[i] < 4 * 3;
      if (t === T.SAND) { if (u < 0.2) { plant('shrub_b', tx, ty, pick(['duneGrass', 'beachGrass', 'duneGrass'], v), 1); n.plants++; } continue; }
      const reed = nearW ? 0.55 : sm(0.45, 0.7, vn(tx, ty, 35, 5720)) * 0.4;
      if (u < reed) { plant('shrub_a', tx, ty, pick(['reeds', 'cattails', 'reeds', 'tallGrass'], v), 1, 0, hash2(tx, ty, 5721), hash2(ty, tx, 5722)); n.plants++; }
      else if (u > 0.985 && clear(tx, ty, 2)) { plant('tree_a', tx, ty, pick(['willow', 'coastCypress'], v), 1.3, 12); n.trees++; }
    } else if (d === D3.SANDPIPER || d === D3.BEACHES) {
      // the dunes: the beach's landward half grows dune and beach grass, ice plant at its foot
      if (t !== T.SAND || m.distSea[i] < 4 * 12) continue;
      if (u < 0.22) { plant('shrub_b', tx, ty, pick(['duneGrass', 'beachGrass', 'duneGrass', 'icePlant'], v), 1); n.plants++; }
    }
  }
  return n;
}

// Highland Woods' stands of pine (redwoodGroves: no giant there, and firs, pines and cedars thick between): the
// woods' north and east, where they climb to the peaks and the valley, and patches through the redwoods.
export const pineAt3 = (L, W) => (tx, ty) => {
  const i = ty * W + tx;
  if (L.dist[i] !== D3.WOODS) return false;
  return 0.6 * vn(tx, ty, 160, 5801) + 0.4 * vn(tx, ty, 50, 5802) + (ty < 1100 ? (1100 - ty) / 1400 : 0) > 0.66;
};

// ---- the terrain classes at the v3 frame (m.terrainCls: what the renderer's ground and plants and the wildlife read)
export function terrain3(m, clsOf) {
  const cw = Math.floor(m.w / TERRAIN_CELL), ch = Math.floor(m.h / TERRAIN_CELL), cls = new Uint8Array(cw * ch);
  for (let cy = 0; cy < ch; cy++) for (let cx = 0; cx < cw; cx++) cls[cy * cw + cx] = clsOf(cx * TERRAIN_CELL + 2, cy * TERRAIN_CELL + 2);
  m.terrainCls = { cls, cw };
}
