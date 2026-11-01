// The tropics by hand (the nature showcase, 2026-10-31; the owner: "hand crafted nature areas that really follow the
// concepts ... treating concepts like actual areas ... then scale and replicate that style across the world"). Coral
// Cay's east lobe was a uniform grid of palms with one dirt path, the lodge and a row of cabins. Now it is the island
// of NA1-E (the paradise coral cay), with SC3-H (the jungle lagoon) as a cove on its east shore:
// - the volcanic spine: black basalt masses climbing north from the inner lagoon to the north beach, vines down their
//   faces and shrubs on their ledges; Coral Cay Falls drops off it in two tiers into the inner lagoon, a pool of the
//   reef's clear turquoise with boulders and a mossy islet in it and swimmers snorkelling; a sand beach on its south side;
// - the trails: winding dirt from Cay Road to the lagoon, timber steps up the spine's west side to a lookout over the
//   falls, on east to the north beach; another to the mangrove inlet, another down to the beach bar, another to the cove;
// - the mangrove inlet bitten into the north shore, mangroves on their arching roots round it and in its shallows, the
//   boardwalk out over the water to a thatched hut on stilts;
// - the south beach: the thatched beach bar on its deck (The Lagoon Bar), hammocks between the palms, deck chairs and
//   parasols, a surfboard; the T-jetty out over the reef with a speedboat and a rowboat;
// - black rock outcrops along the white beaches, reef heads in the clear shallows, sea turtles and snorkelers; the
//   wreck out on the outer reef (Corsair Reef); the islet offshore to the south-east with its stilt house; macaws in the
//   palms;
// - Macaw Cove (SC3-H): a cove dug back into the east shore, a falls off tiered black basalt into it, rocks and a mossy
//   islet in the water, a reef band of black heads across its mouth, a timber dock with a moored rowboat, a sand beach
//   with crabs, shells and a driftwood log, dense jungle framing it (palms, banana and monstera, red ginger), parrots;
//   a trail in from Cay Road's end.
// The kit (each a function below, reused): rockShore (black rock along a beach), jungleFrame (big palms behind,
// banana and monstera, then flower clumps at the edges, the jungle floor's cover), reefBand (black reef heads off a
// shore), jungleFalls (a falls off tiered basalt into a pool), tropicDock (a timber jetty, its posts and its boats),
// plus the trails. Replicated on Wreck Beach (the west lobe's tip) and Tiki Point's north beach, and on the islet.
// For the whole-world build only (shared/world3-world.js's done hook, after the coasts by hand). Deterministic:
// arithmetic, integer hashes, and Math's functions only inside generateCity.
import { TILE, T } from './constants.js';

const D = 44, RES = 32, KEEP = 4, JUNGLE = 64, ROCK = 192;
const hh = (a, b, s) => { let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(s | 0, 2246822519); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

// (tiles) where each piece lies: the east lobe (its box), the falls and the inner lagoon, the trails' control points,
// the mangrove inlet, the beach bar's column and the jetty's, the cove, the islet, the wreck, the kit's other spots
export const TROPIC3 = {
  lobe: [4344, 3318, 4512, 3548],
  falls: { name: 'Coral Cay Falls', x: 4426, y: 3381, w: 104, drop: 210, pool: [4426, 3390, 14.5, 8.5], lagoon: 'The Inner Lagoon' },
  spine: { line: [[4426, 3377], [4430, 3364], [4425, 3350], [4433, 3336]], hw: [8, 12], h: [50, 214], box: [4410, 3330, 4446, 3378] },   // (its centre line from the falls north to the beach, its half-width, its heights)
  trails: [
    [[4404, 3443], [4398, 3431], [4409, 3419], [4403, 3408], [4414, 3399]],                 // Cay Road to the lagoon's beach
    [[4412, 3394], [4404, 3387], [4401, 3376], [4405, 3366], [4412, 3358]],                 // up the spine's west side (steps) to the lookout
    [[4440, 3394], [4451, 3384], [4449, 3370], [4459, 3357], [4466, 3344], [4470, 3334]],   // on east to the north beach
    [[4380, 3449], [4373, 3434], [4379, 3416], [4369, 3398], [4373, 3382], [4369, 3369]],                 // to the mangroves' boardwalk
    [[4414, 3452], [4409, 3468], [4418, 3484], [4411, 3500], [4413, 3512]],                 // down to the beach bar
    [[4458, 3452], [4455, 3464], [4452, 3480], [4462, 3496]],                               // to Macaw Cove
  ],
  steps: [1],   // (the trails with timber steps: up the spine)
  inlet: { pts: [[4366, 3324], [4363, 3336], [4370, 3347], [4364, 3358]], hw: [7, 6, 5, 3.5], hut: [4368, 3341], walk: [[4369, 3368], [4364, 3361], [4371, 3353], [4368, 3346]] },
  bar: { x: 4410, name: 'The Lagoon Bar' }, jetty: { x: 4430, len: 14, head: 14 },
  cove: { name: 'Macaw Cove', falls: 'Macaw Falls', c: [4478, 3482, 12, 11], mouth: [3475, 3490] },
  islet: { c: [4497, 3563, 11, 7] },
  headlands: [[4478, 3336, 7, 151], [4500, 3398, 6, 153], [4476, 3512, 6, 155], [4372, 3534, 7, 157], [4352, 3330, 4, 159]],   // (tiles: centre, radius, seed)
  wreck: { name: 'Corsair Reef', at: [4510, 3343], a: -0.5 },
  wreckBeach: [4006, 3396, 4040, 3462],   // (the kit on the west lobe's tip, round Wreck Beach)
  tiki: { rocks: [[4128, 3318], [4140, 3312], [4236, 3314], [4250, 3320]] },   // (the kit on the north beach either side of Tiki Point)
};
const BIG = ['coconut', 'coconut', 'royal', 'fanSkirt', 'leaning', 'coconut'];

export function tropic3(m, H3) {
  const out = { rocks: 0, boulders: 0, palms: 0, plants: 0, trails: 0, steps: 0, sea: 0, land: 0, docks: 0, critters: 0, places: [] };
  if (!H3 || !H3.addProp || !m.land) return out;
  const W = m.w, HH = m.h, inF = (x, y) => x >= 1 && y >= 1 && x < W - 1 && y < HH - 1, idx = (x, y) => y * W + x;
  const C = TROPIC3, [LX0, LY0, LX1, LY1] = C.lobe;
  if (!inF(LX1 + 30, LY1 + 50)) return out;
  // (a land tile of the key's to take the zone from)
  const ref = idx(4420, 3420);
  if (m.dist[ref] !== D || !m.land[ref]) return out;
  const tileAt = (x, y) => (inF(x, y) ? m.tiles[idx(x, y)] : -1);
  const sea = (x, y) => { if (!inF(x, y)) return false; const i = idx(x, y), t = m.tiles[i]; return (t === T.WATER || t === T.DEEP) && !m.land[i] && !(m.lake && m.lake[i]) && !(m.river && m.river[i]); };
  const built = (i) => m.bld && m.bld[i] >= 0;
  const soft = (x, y) => { if (!inF(x, y)) return false; const i = idx(x, y), t = m.tiles[i]; return m.land[i] && (t === T.GRASS || t === T.SAND || t === T.DIRT) && !built(i); };
  const toSea = (x, y) => {
    if (!inF(x, y)) return;
    const i = idx(x, y), t = m.tiles[i];
    if (!(soft(x, y) || ((t === T.WATER || t === T.DEEP) && !m.land[i]))) return;
    if (m.land[i]) out.sea++;
    m.tiles[i] = T.WATER; m.land[i] = 0; if (m.lake) m.lake[i] = 0; if (m.river) m.river[i] = 0; m.dist[i] = D; m.reserve[i] = (m.reserve[i] & ~(JUNGLE | 128)) | RES | KEEP;
  };
  const toLand = (x, y, t) => { const i = idx(x, y); if (!m.land[i]) out.land++; m.tiles[i] = t; m.land[i] = 1; m.dist[i] = D; if (m.zone) m.zone[i] = m.zone[ref]; if (m.lake) m.lake[i] = 0; if (m.river) m.river[i] = 0; m.reserve[i] |= RES | KEEP; };
  // what's taken: tiles a trail, a deck, a rock or a plant stands on (nothing else goes there), and the tiles of what
  // stood there before (the district's own props: its lamps, signs, hammocks)
  const taken = new Set();
  const take = (x, y, r = 0) => { for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) taken.add(idx(Math.floor(x) + dx, Math.floor(y) + dy)); };
  for (const p of m.props) if (p) { const x = p.x / TILE, y = p.y / TILE; if (x > 3990 && x < 4535 && y > 3290 && y < 3610) take(x, y, p.t === 'palm_a' || p.t === 'tree_a' || p.t === 'shrub_a' || p.t === 'palm_s' ? 0 : 1); }
  const free = (x, y) => soft(x, y) && !taken.has(idx(Math.floor(x), Math.floor(y)));
  const nearT = (x, y, r, pred) => { for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (pred(Math.floor(x) + dx, Math.floor(y) + dy)) return true; return false; };
  const hard = (x, y) => { const t = tileAt(x, y); return t === T.ROAD || t === T.SIDEWALK || t === T.BUILDING || t === T.DOCK || t === T.PLAZA || t === T.LOT || t === T.BRIDGE || (inF(x, y) && built(idx(x, y))); };
  const P = (t, x, y, r = 0, ex = null) => H3.addProp(m, t, Math.round(x * TILE), Math.round(y * TILE), r, ex);
  const solid = (x, y, r) => m.addSolidProp(Math.round(x * TILE), Math.round(y * TILE), r);
  const place = (name, type, x0, y0, x1, y1) => { (m.landmarks ||= []).push({ name, type, x: x0 * TILE, y: y0 * TILE, w: (x1 - x0) * TILE, h: (y1 - y0) * TILE }); out.places.push(name); };
  // a wobbly blob: inside test (tiles), its edge wandering by wob of its radius
  const blob = (cx, cy, rx, ry, seed, wob = 0.18) => { const p1 = hh(seed, 1, 5) * 6.283, p2 = hh(seed, 2, 5) * 6.283; return (x, y) => { const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry, a = Math.atan2(dy, dx), r = 1 + wob * (0.6 * Math.sin(3 * a + p1) + 0.4 * Math.sin(5 * a + p2)); return dx * dx + dy * dy <= r * r; }; };
  const spline = (cp, step = 0.5) => {
    const pts = [];
    for (let i = 0; i < cp.length - 1; i++) {
      const p0 = cp[Math.max(0, i - 1)], p1 = cp[i], p2 = cp[i + 1], p3 = cp[Math.min(cp.length - 1, i + 2)], n = Math.max(2, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / step));
      for (let k = 0; k < n; k++) { const t = k / n, t2 = t * t, t3 = t2 * t, f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3); pts.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]); }
    }
    pts.push(cp[cp.length - 1].slice());
    return pts;
  };

  // ---- the kit ----------------------------------------------------------------------------------------------------
  // a mass of black rock (tiles: centre x, y; px: w, d, h; j: a jungle's - vines and shrubs on it): the ground under it
  // bare basalt, solid over its footprint
  // (no tall tree on a rock or just south of it, where its crown would hide the rock's face: noTall)
  const noTall = new Set();
  function rock(x, y, w, d, h, s, j = 1, wet = false) {
    P('outcrop', x, y, 0, { w, d, h, style: 'lava', s, j, rock: 1 });
    for (let ty = Math.floor(y - d / 2 / TILE) - 1; ty <= Math.ceil(y + d / 2 / TILE + h / TILE) + 3; ty++) for (let tx = Math.floor(x - w / 2 / TILE) - 1; tx <= Math.ceil(x + w / 2 / TILE) + 1; tx++) noTall.add(idx(tx, ty));
    const rx = w / 2 / TILE, ry = d / 2 / TILE;
    for (let ty = Math.floor(y - ry); ty <= Math.floor(y + ry); ty++) for (let tx = Math.floor(x - rx); tx <= Math.floor(x + rx); tx++) {
      const u = (tx + 0.5 - x) / rx, v = (ty + 0.5 - y) / ry;
      if (u * u + v * v > 1 || !inF(tx, ty)) continue;
      const i = idx(tx, ty);
      if (soft(tx, ty)) { m.tiles[i] = T.SAND; m.reserve[i] = (m.reserve[i] & ~128) | ROCK | RES | KEEP; }
      taken.add(i);
    }
    for (let py = -d / 2 + 12; py <= d / 2 - 10; py += 22) for (let px = -w / 2 + 12; px <= w / 2 - 12; px += 22) { const u = px / (w / 2), v = py / (d / 2); if (u * u + v * v <= 0.85) m.addSolidProp(Math.round(x * TILE + px), Math.round(y * TILE + py), 14); }
    if (!wet) out.rocks++; else out.boulders++;
  }
  const boulder = (x, y, s, moss = 0) => { P('boulder', x, y, Math.round(s * 0.4), { s, style: 'lava', moss, rock: 1 }); take(x, y, 0); out.boulders++; };
  const palm = (x, y, sp, k) => { P('palm_a', x, y, sp === 'banana' ? 0 : 10, { sp, k }); take(x, y, 0); out.palms++; };
  const plant = (t, x, y, ex) => { P(t, x, y, 0, ex); take(x, y, 0); out.plants++; };
  const clearOfWays = (x, y, r) => !nearT(x, y, r, (tx, ty) => hard(tx, ty) || tileAt(tx, ty) === T.DIRT);

  // a massif of black rock over the tiles where test(x, y): overlapping masses on a staggered grid, each as high as
  // hgt(x, y) says (px), the ground between them bare basalt, nothing growing on it but what hangs off the rock
  function ridge(x0, y0, x1, y1, test, hgt, seed, step = [4, 3]) {
    let n = 0;
    const pocket = new Set();
    for (let gy = y0, row = 0; gy <= y1; gy += step[1], row++) for (let gx = x0 + (row & 1 ? step[0] / 2 : 0); gx <= x1; gx += step[0]) {
      const x = gx + (hh(gx, gy, seed) - 0.5) * 1.4, y = gy + (hh(gy, gx, seed + 1) - 0.5) * 1.0;
      if (!test(Math.floor(x), Math.floor(y)) || !clearOfWays(x, y, 2)) continue;
      if (hh(gx >> 1, gy >> 1, seed + 4) < 0.2) { pocket.add(idx(Math.floor(x), Math.floor(y))); if (soft(Math.floor(x), Math.floor(y))) palm(x, y, BIG[Math.floor(hh(gx, gy, seed + 5) * BIG.length)], 1.3 + hh(gy, gx, seed + 6) * 0.3); continue; }   // (a pocket of green in the rock: a palm up out of it, ferns and the big leaves round its foot)
      const h = Math.round(hgt(x, y) / 12) * 12;
      if (h < 12) continue;
      const big = hh(gx, gy, seed + 2) < 0.5;
      rock(x, y, big ? 192 : 160, big ? 128 : 108, h, Math.floor(hh(gx, gy, seed + 3) * 4), 1);
      n++;
    }
    for (let y = y0 - 1; y <= y1 + 1; y++) for (let x = x0 - 1; x <= x1 + 1; x++) if (test(x, y) && soft(x, y) && !nearT(x, y, 1, (a, b) => tileAt(a, b) === T.DIRT || pocket.has(idx(a, b)))) { const i = idx(x, y); m.tiles[i] = T.SAND; m.reserve[i] = (m.reserve[i] & ~128) | ROCK | RES | KEEP; taken.add(i); noTall.add(i); }
    return n;
  }
  // black rock along a beach: on the shore tiles in the box (sand by the sea), a cluster every so often - an outcrop
  // half in the water, boulders round it, some out in the shallows
  function rockShore(x0, y0, x1, y1, seed, every = 12, keepOut = () => false) {
    const cells = new Map();
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      if (!soft(x, y) || tileAt(x, y) !== T.SAND || !nearT(x, y, 1, sea) || keepOut(x, y)) continue;
      const k = Math.floor(x / every) * 4096 + Math.floor(y / every), h = hh(x, y, seed);
      if (!cells.has(k) || h < cells.get(k)[2]) cells.set(k, [x, y, h]);
    }
    for (const [x, y, h] of cells.values()) {
      if (hh(x >> 3, y >> 3, seed + 1) > 0.78 || !clearOfWays(x, y, 3) || taken.has(idx(x, y))) continue;
      // (which way the sea is: the cluster leans out into it)
      let sx = 0, sy = 0; for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) if (sea(x + dx, y + dy)) { sx += dx; sy += dy; }
      const L = Math.hypot(sx, sy) || 1, ux = sx / L, uy = sy / L, big = h < 0.5;
      rock(x + 0.5 + ux * 0.6, y + 0.5 + uy * 0.6, big ? 112 : 80, big ? 70 : 52, big ? 62 : 42, x + y, 0, true);
      for (let k = 0; k < (big ? 3 : 2); k++) { const a = (hh(k, x, seed + 9) - 0.5) * 2.6 + Math.atan2(uy, ux), bx = x + 0.5 + Math.cos(a) * 2.4, by = y + 0.5 + Math.sin(a) * 2; if (!hard(Math.floor(bx), Math.floor(by))) boulder(bx, by, 30 + Math.round(hh(k, y, seed + 10) * 16)); }
      for (let k = 0; k < 4; k++) { const a = hh(k, x, seed + 2) * 6.283, r = 1.8 + hh(k, y, seed + 3) * 2.2, bx = x + 0.5 + ux * 1.5 + Math.cos(a) * r, by = y + 0.5 + uy * 1.5 + Math.sin(a) * r; if (!hard(Math.floor(bx), Math.floor(by))) boulder(bx, by, 12 + Math.round(hh(k, x + y, seed + 4) * 16)); }
    }
  }
  // black reef heads off a shore: sea tiles lo..hi tiles out from the land, sparse clusters; the shallows' turtles
  function reefBand(x0, y0, x1, y1, lo, hi, seed, keepOut = () => false) {
    for (let y = y0; y < y1; y += 3) for (let x = x0; x < x1; x += 3) {
      const jx = x + Math.floor(hh(x, y, seed) * 3), jy = y + Math.floor(hh(y, x, seed) * 3);
      if (!sea(jx, jy) || keepOut(jx, jy) || hh(jx >> 2, jy >> 2, seed + 1) > 0.34) continue;
      if (nearT(jx, jy, lo, (a, b) => !sea(a, b)) || !nearT(jx, jy, hi, (a, b) => !sea(a, b))) continue;
      const n = 1 + Math.floor(hh(jx, jy, seed + 2) * 3);
      for (let k = 0; k < n; k++) boulder(jx + 0.5 + (hh(k, jx, seed + 3) - 0.5) * 2.4, jy + 0.5 + (hh(k, jy, seed + 4) - 0.5) * 2.4, 10 + Math.round(hh(k, jx + jy, seed + 5) * 14));
    }
  }
  // broken foam along a line from (x0, y0) to (x1, y1) tiles: short flat dashes lying along the water, each a little off
  // the line, gaps between (never one long strip standing in the sea)
  function foamDashes(x0, y0, x1, y1, seed) {
    const L = Math.hypot(x1 - x0, y1 - y0), n = Math.max(2, Math.round(L / 1.1));
    for (let k = 0; k <= n; k++) {
      if (hh(k, seed, 3) < 0.22) continue;
      const t = k / n, x = x0 + (x1 - x0) * t + Math.sin(t * 5.3 + seed) * 0.9 + (hh(k, seed, 4) - 0.5) * 1.2, y = y0 + (y1 - y0) * t + (hh(k, seed, 5) - 0.5) * 0.5;
      if (!sea(Math.floor(x), Math.floor(y))) continue;
      P('surf', x, y, 0, { len: 32 + Math.floor(hh(k, seed, 6) * 3) * 16, w: 6 + Math.floor(hh(k, seed, 7) * 2) * 2, s: (k + seed) % 4 });
    }
  }
  // the surf breaking white over the reef's outer edge: on the sea tiles about d tiles from the land, every few tiles a
  // band of foam along the shore's line (across the land's direction)
  function surfLine(x0, y0, x1, y1, d, seed, keepOut = () => false) {
    const land = (a, b) => inF(a, b) && !sea(a, b);
    for (let y = y0; y < y1; y += 5) for (let x = x0; x < x1; x += 5) {
      const jx = x + Math.floor(hh(x, y, seed) * 5), jy = y + Math.floor(hh(y, x, seed) * 5);
      if (!sea(jx, jy) || keepOut(jx, jy) || nearT(jx, jy, d - 1, land) || !nearT(jx, jy, d + 1, land) || hh(jx >> 3, jy >> 3, seed + 1) > 0.8) continue;
      let sx = 0, sy = 0; for (let dy = -d - 1; dy <= d + 1; dy++) for (let dx = -d - 1; dx <= d + 1; dx++) if (land(jx + dx, jy + dy)) { sx += dx; sy += dy; }
      if (Math.abs(sx) > Math.abs(sy)) foamDashes(jx + 0.5, jy - 2, jx + 0.5, jy + 3, jx * 7 + jy); else P('surf', jx + 0.5, jy + 0.5, 0, { len: 160 + Math.round(hh(jx, jy, seed + 2) * 4) * 16, w: 26, s: jx + jy });   // (a north-south line: broken dashes down it; an east-west one: a band along it)
      out.surf = (out.surf || 0) + 1;
    }
  }
  // the jungle on the open ground inside test(x, y): the floor's cover (reserve 64), then by how far a tile is from the
  // jungle's edge (a trail, the sand, the water, the rock): big palms in the depths in groves with clearings, banana
  // and bird of paradise and the big leaves a little in, red ginger, hibiscus and ferns in clumps along the edge;
  // macaws in some of the palms
  // (a clearing in the jungle: the grove noise's open places - grass and the light coming in)
  const clearingAt = (x, y, seed, o) => (o.clear ?? 0.66) < hh(x >> 3, y >> 3, seed + 3) * 0.55 + hh(x >> 4, y >> 4, seed + 16) * 0.25 + hh(x >> 2, y >> 2, seed + 21) * 0.2;
  function jungleFrame(x0, y0, x1, y1, test, seed, o = {}) {
    const w = x1 - x0, h = y1 - y0, dist = new Int16Array(w * h).fill(-1), q = [];
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      if (!test(x, y) || !free(x, y) || tileAt(x, y) === T.DIRT) continue;
      const k = (y - y0) * w + x - x0;
      let edge = false;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const a = x + dx, b = y + dy; if (!(test(a, b) && free(a, b) && tileAt(a, b) !== T.DIRT)) { edge = true; break; } }
      dist[k] = edge ? 0 : 999;
      if (edge) q.push(k);
    }
    for (let qi = 0; qi < q.length; qi++) { const k = q[qi], x = k % w, y = (k / w) | 0; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const a = x + dx, b = y + dy; if (a < 0 || b < 0 || a >= w || b >= h) continue; const kk = b * w + a; if (dist[kk] > dist[k] + 1) { dist[kk] = dist[k] + 1; q.push(kk); } } }
    const cells = [];
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const k = (y - y0) * w + x - x0; if (dist[k] < 0) continue; const i = idx(x, y); const open = clearingAt(x, y, seed, o); if (m.tiles[i] === T.GRASS && !open) m.reserve[i] = (m.reserve[i] & ~128) | JUNGLE | RES; else if (open) m.reserve[i] = (m.reserve[i] & ~(JUNGLE | 128)) | RES; cells.push([x, y, open ? -1 : dist[k]]); }
    for (const [x, y, de] of cells) {
      if (taken.has(idx(x, y))) continue;
      if (de < 0) {   // a clearing: open grass, a palm standing alone now and then, flowers in drifts
        const u = hh(x, y, seed + 19);
        if (u < 0.018 && !noTall.has(idx(x, y)) && clearOfWays(x + 0.5, y + 0.5, 1)) palm(x + 0.5, y + 0.5, u < 0.009 ? 'leaning' : 'coconut', 1.35);
        else if (u < 0.05 && hh(x >> 2, y >> 2, seed + 20) < 0.5) plant(u < 0.035 ? 'ginger' : 'shrub_a', x + 0.5, y + 0.5, { s: x + y, sp: 'hibiscus', k: 1.05 });
        continue;
      }
      const u = hh(x, y, seed), jx = x + 0.2 + hh(y, x, seed + 1) * 0.6, jy = y + 0.2 + hh(x + 7, y, seed + 2) * 0.6;
      const ox = Math.floor(hh(x >> 2, y >> 2, seed + 14) * 4), oy = Math.floor(hh(y >> 2, x >> 2, seed + 15) * 3);
      if (de >= 2 && (x + ox) % 4 === 0 && (y + oy) % 3 === 0 && !noTall.has(idx(x, y))) {   // the canopy: groves of broad-leaved trees and palms, clearings between
        const g = hh(x >> 3, y >> 3, seed + 3) * 0.55 + hh(x >> 4, y >> 4, seed + 16) * 0.25 + hh(x >> 1, y >> 1, seed + 4) * 0.2;
        if (g < (o.dense ?? 0.62) && clearOfWays(jx, jy, 1)) {
          const v = hh(x, y, seed + 5), pal = v < (o.palms ?? 0.68) || de < 3;   // (palms toward the edges and in the light; the big leaves deep in)
          if (pal) palm(jx, jy, BIG[Math.floor(hh(y, x, seed + 17) * BIG.length)], 1.25 + hh(x, y, seed + 6) * 0.35);
          else { P('mangrove', jx, jy, 12, { s: x + y * 5, j: 1, k: 1 + hh(x, y, seed + 18) * 0.4 }); take(jx, jy, 0); out.palms++; }
          if (hh(x, y, seed + 7) < (o.birds ?? 0.03)) P('macaw', jx + 0.1, jy + 0.12, 0, { k: hh(y, x, seed + 8) < 0.5 ? 1 : 0, z: (pal ? 96 : 54) + Math.round(hh(x, y, seed + 9) * 20), a: hh(x, y, seed + 10) * 6.28 }), out.critters++;
        }
      } else if (de >= 1 && u < (de <= 3 ? 0.22 : 0.07) && (x + y) % 2 === 0) {   // the understorey: banana, bird of paradise, the big leaves
        if (clearOfWays(jx, jy, 0)) { if (u < 0.08) palm(jx, jy, 'banana', 1.15); else plant(u < 0.13 ? 'palm_s' : 'shrub_a', jx, jy, { sp: u < 0.13 ? 'bird' : hh(x, y, seed + 11) < 0.5 ? 'monstera' : 'elephant', k: 1.15 }); }
      } else if (de === 0 && u < 0.3 && hh(x >> 2, y >> 2, seed + 12) < 0.55) {   // the edge: flowers in clumps
        const v = hh(x, y, seed + 13);
        if (v < 0.4) plant('ginger', jx, jy, { s: x + y }); else plant('shrub_a', jx, jy, { sp: v < 0.7 ? 'hibiscus' : v < 0.85 ? 'fern' : 'bougain', k: 1.05 });
      }
    }
    return cells.length;
  }
  // a falls off tiered basalt into a pool (sea water: the reef's clear turquoise): the pool dug, the rock behind and
  // either side stepping down, the falls (two tiers) over the middle, boulders in the pool and a mossy islet
  function jungleFalls(F, seed, tiers) {
    const [pcx, pcy, prx, pry] = F.pool, inPool = blob(pcx, pcy, prx, pry, seed, 0.16);
    for (let y = Math.floor(pcy - pry - 3); y <= Math.ceil(pcy + pry + 3); y++) for (let x = Math.floor(pcx - prx - 3); x <= Math.ceil(pcx + prx + 3); x++) if (inPool(x, y)) { toSea(x, y); taken.add(idx(x, y)); }
    // its beach on its south side: sand two tiles round the water (the rock is on its north)
    for (let y = Math.floor(pcy - 1); y <= Math.ceil(pcy + pry + 4); y++) for (let x = Math.floor(pcx - prx - 3); x <= Math.ceil(pcx + prx + 3); x++) {
      if (!inF(x, y) || inPool(x, y) || !m.land[idx(x, y)] || built(idx(x, y)) || !nearT(x, y, 2, (a, b) => inPool(a, b))) continue;
      const i = idx(x, y); if (m.tiles[i] === T.GRASS || m.tiles[i] === T.DIRT || m.tiles[i] === T.SAND) { m.tiles[i] = T.SAND; m.reserve[i] = (m.reserve[i] & ~(JUNGLE | 128)) | RES | KEEP; out.poolBeach = (out.poolBeach || 0) + 1; }
    }
    for (const [x, y, w, d, h] of tiers) rock(x, y, w, d, h, x * 3 + y, 1);
    heroFalls(F.x, F.y + 0.4, F.w, F.drop, seed);
    for (const dx of [-2, -1, 0, 1, 2]) take(F.x + dx, F.y, 1);
    for (let k = 0; k < 7; k++) { const a = 3.4 + hh(k, 1, seed) * 2.6, r = 0.75 + hh(k, 2, seed) * 0.2, bx = pcx + Math.cos(a) * prx * r, by = pcy + Math.sin(a) * pry * r; if (sea(Math.floor(bx), Math.floor(by))) boulder(bx, by, 14 + Math.round(hh(k, 3, seed) * 14), 1); }
    for (let k = 0; k < 5; k++) { const a = 0.3 + hh(k, 4, seed) * 2.5, r = 0.7 + hh(k, 5, seed) * 0.25, bx = pcx + Math.cos(a) * prx * r, by = pcy + Math.sin(a) * pry * r; if (sea(Math.floor(bx), Math.floor(by))) boulder(bx, by, 12 + Math.round(hh(k, 6, seed) * 12), k & 1); }
    return inPool;
  }
  // the hero of a scene: a broad fall stepping down the black rock in two tiers, the white water and the foam where it
  // lands, the spray drifting off
  function heroFalls(x, y, w, drop, seed) {
    P('coastfall', x, y, 0, { kind: 'twoTier', w, drop, s: seed % 29, mist: 1, stone: 'lava' });
    P('surf', x, y + 1.2, 0, { len: Math.round(w * 2.2), w: 22, s: seed }); P('surf', x - 0.6, y + 2.6, 0, { len: Math.round(w * 1.6), w: 14, s: seed + 1 });
    P('steam', x, y + 1.6, 0, { w: Math.round(w * 2.2), h: 70, s: seed % 7 });
  }
  // a timber jetty from the shore at (x, y) out dir (0 south, 1 north, 2 east, 3 west) len tiles, 2 wide, a head across
  // its end head tiles wide (0: none); posts along it, a lamp at the end
  function tropicDock(x, y, dir, len, head = 0, wide = 2) {
    const [ux, uy] = [[0, 1], [0, -1], [1, 0], [-1, 0]][dir], [vx, vy] = [Math.abs(uy), Math.abs(ux)];
    const lay = (tx, ty) => { if (!inF(tx, ty)) return; const i = idx(tx, ty), t = m.tiles[i]; if (sea(tx, ty) || t === T.SAND || t === T.GRASS) { m.tiles[i] = T.DOCK; m.reserve[i] |= RES | KEEP; taken.add(i); } };
    for (let s = -1; s < len; s++) for (let o = 0; o < wide; o++) lay(x + ux * s + vx * o, y + uy * s + vy * o);
    if (head) for (let s = len; s < len + 3; s++) for (let o = -Math.floor(head / 2) + 1; o <= Math.ceil(head / 2); o++) lay(x + ux * s + vx * o, y + uy * s + vy * o);
    for (let s = 2; s < len; s += 3) for (const o of [-0.15, wide + 0.15]) P('post', x + ux * (s + 0.5) + vx * o + (vx ? 0 : 0.5), y + uy * (s + 0.5) + vy * o + (vy ? 0 : 0.5), 0, { h: 30 });
    const ex = x + ux * (len + (head ? 2.5 : 0)) + 0.5 + vx * 0.5, ey = y + uy * (len + (head ? 2.5 : 0)) + 0.5 + vy * 0.5;
    P('lamp', ex + vx * (head ? head / 2 - 0.4 : 1.4), ey + vy * (head ? head / 2 - 0.4 : 1.4), 5, { style: 'iron', lift: 4 });
    out.docks++;
    return { ex, ey, ux, uy, vx, vy };
  }
  // a trail: dirt along a smooth wobbling line (on the sand it stays sand), a tile and a half wide; with steps, timber
  // steps where it climbs
  function trail(cp, steps = false) {
    const pts = spline(cp, 0.4);
    for (const [x, y] of pts) for (const [dx, dy] of [[0, 0], [0.7, 0], [0, 0.7], [0.7, 0.7]]) {
      const tx = Math.floor(x + dx - 0.35), ty = Math.floor(y + dy - 0.35);
      if (!soft(tx, ty)) continue;
      const i = idx(tx, ty);
      if (m.tiles[i] === T.GRASS) m.tiles[i] = T.DIRT;
      m.reserve[i] = (m.reserve[i] & ~(JUNGLE | 128)) | RES | 16; taken.add(i);
    }
    if (steps) for (let k = 4; k < pts.length - 4; k += 7) { const [ax, ay] = pts[k - 2], [bx, by] = pts[k + 2]; P('logsteps', pts[k][0], pts[k][1], 0, { w: 40, a: Math.atan2(by - ay, bx - ax) + Math.PI / 2 }); out.steps++; }
    out.trails++;
    return pts;
  }

  // ---- Coral Cay's east lobe (NA1-E) --------------------------------------------------------------------------------
  // (the district's own leftovers on the wild side go: the old jungle path's parksign stays by the road)
  const shoreS = (x) => { for (let y = 3470; y < 3600; y++) if (sea(x, y)) return y; return null; };
  const shoreN = (x) => { for (let y = 3400; y > 3290; y--) if (sea(x, y)) return y; return null; };
  const shoreE = (y) => { for (let x = 4440; x < 4540; x++) if (sea(x, y)) return x; return null; };
  // the cove (dug first: the trails and the rock know where its water is)
  const CV = C.cove, [ccx, ccy, crx, cry] = CV.c, inCove = blob(ccx, ccy, crx, cry, 71, 0.15);
  let coveOk = false;
  {
    const e0 = shoreE(CV.mouth[0]), e1 = shoreE(CV.mouth[1]);
    if (e0 !== null && e1 !== null) {
      coveOk = true;
      const shore = new Map(); for (let y = CV.mouth[0]; y <= CV.mouth[1]; y++) shore.set(y, shoreE(y) ?? e0);   // (the sea's edge before the cove is dug)
      for (let y = ccy - cry - 2; y <= ccy + cry + 2; y++) for (let x = ccx - crx - 2; x <= ccx + crx + 2; x++) if (inCove(x, y)) toSea(x, y);
      // the mouth: from the cove out east to the sea, its sides wandering
      // the mouth: from the cove out east to the sea, its width wandering as it goes (no ruled edges)
      const my = (CV.mouth[0] + CV.mouth[1]) / 2, mh = (CV.mouth[1] - CV.mouth[0]) / 2, ex = Math.max(...shore.values()) + 2;
      for (let x = ccx; x <= ex; x += 0.5) { const t = (x - ccx) / (ex - ccx), r = mh * (0.78 + 0.22 * Math.sin(t * 7.1 + 1.3)) + t * 1.5, cy = my + 1.6 * Math.sin(t * 4.3); for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) for (let xx = Math.floor(x - 1); xx <= Math.ceil(x + 1); xx++) if ((xx + 0.5 - x) * (xx + 0.5 - x) + (y + 0.5 - cy) * (y + 0.5 - cy) <= r * r) toSea(xx, y); }
      // its beach: the dry ground within three tiles of its water to the south and west is sand
      for (let y = ccy - 2; y <= ccy + cry + 5; y++) for (let x = ccx - crx - 4; x <= ccx + crx + 6; x++) if (soft(x, y) && nearT(x, y, 3, (a, b) => sea(a, b) && b >= ccy - 4)) { m.tiles[idx(x, y)] = T.SAND; m.reserve[idx(x, y)] |= RES | KEEP; }
    }
  }
  // the mangrove inlet in the north shore
  const IN = C.inlet, inletPts = spline(IN.pts, 0.5);
  const inletW = (k) => { const t = k / (inletPts.length - 1) * (IN.hw.length - 1), a = Math.floor(t), f = t - a; return IN.hw[a] + ((IN.hw[Math.min(IN.hw.length - 1, a + 1)] ?? IN.hw[a]) - IN.hw[a]) * f; };
  const inletT = new Set();
  inletPts.forEach(([x, y], k) => { const r = inletW(k) * (0.85 + 0.3 * hh(Math.round(x), Math.round(y), 81)); for (let ty = Math.floor(y - r); ty <= Math.ceil(y + r); ty++) for (let tx = Math.floor(x - r); tx <= Math.ceil(x + r); tx++) if ((tx + 0.5 - x) * (tx + 0.5 - x) + (ty + 0.5 - y) * (ty + 0.5 - y) <= r * r && (soft(tx, ty) || sea(tx, ty))) { toSea(tx, ty); inletT.add(idx(tx, ty)); } });
  // the falls and the inner lagoon, the spine climbing north from it
  const F = C.falls;
  const inPool = jungleFalls(F, 37, [
    [F.x, F.y - 2.2, 200, 70, F.drop - 4], [F.x - 6, F.y - 1.4, 120, 64, 176], [F.x + 6.2, F.y - 1.2, 120, 64, 164],
    [F.x - 9.5, F.y + 1.6, 96, 60, 44], [F.x + 10, F.y + 2, 100, 60, 40], [F.x - 13.5, F.y + 5.5, 70, 50, 22], [F.x + 14, F.y + 6, 76, 50, 20],
  ]);
  {
    const S = C.spine, cl = spline(S.line, 0.5);
    const near = (x, y) => { let b = 1e9, k0 = 0; cl.forEach(([cx, cy], k) => { const d = (cx - x) * (cx - x) + (cy - y) * (cy - y); if (d < b) { b = d; k0 = k; } }); const t = k0 / (cl.length - 1), w = S.hw[0] + (S.hw[1] - S.hw[0]) * Math.sin(t * Math.PI) + (hh(Math.round(x), Math.round(y), 61) - 0.5) * 2; return [Math.sqrt(b), w, t]; };
    out.spine = ridge(S.box[0], S.box[1], S.box[2], S.box[3], (x, y) => { const [d, w] = near(x + 0.5, y + 0.5); return d <= w && !inPool(x, y) && !nearT(x, y, 1, (a, b) => inPool(a, b)); }, (x, y) => { const [d, w, t] = near(x, y); return S.h[0] + (S.h[1] - S.h[0]) * Math.sqrt(Math.max(0, 1 - d / w)) * (1 - 0.4 * t) * (t > 0.85 ? (1 - t) / 0.15 : 1); }, 63);
  }
  P('outcrop', F.pool[0] - 4, F.pool[1] + 1.4, 18, { w: 54, d: 36, h: 16, style: 'lava', s: 3, j: 1, rock: 1 });   // the mossy islet in the lagoon
  for (const [dx, dy, k, a] of [[3, 1.5, 0, 0.6], [-1, -2, 2, 2.4]]) P('snorkeler', F.pool[0] + dx, F.pool[1] + dy, 0, { k, a }), out.critters++;
  P('ringfloat', F.pool[0] + 6, F.pool[1] - 1, 0, { v: 1 });
  (m.natureSites ||= []).push({ kind: 'jfalls', hand: true, name: F.name, x: Math.round(F.x * TILE), y: Math.round((F.y + 3) * TILE), falls: { x: Math.round(F.x * TILE), y: Math.round(F.y * TILE), w: F.w, drop: F.drop }, pool: { x: Math.round(F.pool[0] * TILE), y: Math.round(F.pool[1] * TILE) } });
  place(F.name, 'falls', F.x - 8, F.y - 10, F.x + 8, F.y + 2);
  place(F.lagoon, 'beach', F.pool[0] - F.pool[2], F.pool[1] - F.pool[3], F.pool[0] + F.pool[2], F.pool[1] + F.pool[3] + 3);
  // the trails (and the steps up the spine), the lookout over the falls
  C.trails.forEach((cp, k) => { if (k === 5 && !coveOk) return; trail(cp, C.steps.includes(k)); });
  const LK = C.trails[1][C.trails[1].length - 1];
  P('pbench', LK[0] + 0.5, LK[1] - 0.6, 6, { a: 0 }); P('scope', LK[0] + 2, LK[1] - 0.2, 4); P('fingerpost', C.trails[0][0][0] + 1.4, C.trails[0][0][1] - 0.6, 0, { text: 'FALLS' });
  // the mangroves' boardwalk out to the hut on stilts in the inlet
  {
    const pts = spline(IN.walk, 0.4);
    for (const [x, y] of pts) for (const [dx, dy] of [[0, 0], [0.8, 0], [0, 0.8], [0.8, 0.8]]) { const tx = Math.floor(x + dx - 0.4), ty = Math.floor(y + dy - 0.4); if (!inF(tx, ty)) continue; const i = idx(tx, ty); if (sea(tx, ty) || soft(tx, ty)) { m.tiles[i] = T.DOCK; m.reserve[i] |= RES | KEEP; taken.add(i); } }
    for (let k = 3; k < pts.length; k += 5) if (sea(Math.floor(pts[k][0]), Math.floor(pts[k][1]))) { P('post', pts[k][0] - 0.9, pts[k][1], 0, { h: 20 }); P('post', pts[k][0] + 0.9, pts[k][1], 0, { h: 20 }); }
    const [hx, hy] = IN.hut;
    for (let ty = hy - 1; ty <= hy + 2; ty++) for (let tx = hx - 1; tx <= hx + 2; tx++) { const i = idx(tx, ty); if (sea(tx, ty) || soft(tx, ty)) { m.tiles[i] = T.DOCK; m.reserve[i] |= RES | KEEP; } taken.add(i); }
    P('stilthut', hx + 0.5, hy + 0.5, 0, { lift: 22 }); for (const [dx, dy] of [[-1, -0.4], [0, -0.4], [1, -0.4]]) solid(hx + 0.5 + dx, hy + 0.5 + dy, 14);
    // the mangroves round the inlet's edge, in its shallows and on its banks
    let n = 0;
    for (const i of inletT) {
      const x = i % W, y = (i / W) | 0;
      if (!nearT(x, y, 1, (a, b) => soft(a, b)) || hh(x, y, 83) > 0.5 || taken.has(i) || nearT(x, y, 1, (a, b) => tileAt(a, b) === T.DOCK)) continue;
      P('mangrove', x + 0.5, y + 0.5, 12, { s: x + y, k: hh(y, x, 84) < 0.4 ? 1.3 : 1 }); take(x, y, 1); n++;
    }
    for (let y = 3326; y < 3372; y++) for (let x = 4348; x < 4392; x++) if (free(x, y) && nearT(x, y, 2, (a, b) => inletT.has(idx(a, b))) && hh(x, y, 85) < 0.3 && clearOfWays(x, y, 1)) { P('mangrove', x + 0.5, y + 0.5, 12, { s: x * 3 + y, k: 1 }); take(x, y, 1); n++; }
    out.mangroves = n;
    place('Mangrove Inlet', 'beach', 4352, 3324, 4384, 3364);
  }
  // the south beach: the thatched bar on its deck, hammocks, deck chairs, the surfboard; the T-jetty
  {
    const bx = C.bar.x, sy = shoreS(bx);
    if (sy !== null) {
      const by = sy - 6;
      for (let y = by - 2; y <= by + 2; y++) for (let x = bx - 3; x <= bx + 3; x++) if (soft(x, y)) { m.tiles[idx(x, y)] = T.DOCK; m.reserve[idx(x, y)] |= RES | KEEP; }
      take(bx, by, 3);
      P('tbar', bx + 0.5, by + 0.4, 0);
      for (const dx of [-1.4, 0, 1.4]) solid(bx + 0.5 + dx, by - 0.4, 15);
      (m.pois ||= []).push({ id: m.pois.length, kind: 'snack', label: C.bar.name, x: Math.round((bx + 0.5) * TILE), y: Math.round((by + 2.2) * TILE), r: 44, counter: true });
      P('textsign', bx + 0.5, by + 2.9, 0, { text: 'THE LAGOON BAR', bg: '#3a5a3a', fg: [255, 222, 140], z: 26, sx: 1 });
      P('torch', bx - 2.6, by + 2.4, 6); P('torch', bx + 3.6, by + 2.4, 6);
      P('surfboard', bx + 4.6, by - 0.4, 0, { v: 1 });
      for (let k = 0; k < 2; k++) { const hx = bx - 9 - k * 6; palm(hx, by - 1, 'coconut', 1.35); palm(hx + 4.4, by - 0.2, 'leaning', 1.3); P('hammock', hx + 2.2, by - 0.4, 0, { len: 120 }); }
      for (let k = 0; k < 4; k++) { const lx = bx + 6 + k * 3.2, ly = sy - 2.6; if (soft(Math.floor(lx), Math.floor(ly))) { P('lounger', lx, ly, 0, { v: k % 4, a: -Math.PI / 2 }); if (k % 2 === 0) P(['umbrella_y', 'umbrella_g'][k / 2], lx + 1.4, ly - 0.4, 0); take(lx, ly, 0); } }
      for (let k = 0; k < 3; k++) P('cafetable', bx - 2 + k * 2.4, by + 3.8, 6), take(bx - 2 + k * 2.4, by + 3.8, 0);
      palm(bx + 7, by - 4, 'leaning', 1.45); palm(bx - 5, by + 2.4, 'leaning', 1.4); palm(bx + 13, by - 1, 'coconut', 1.35); palm(bx + 26, by + 0.5, 'leaning', 1.4);   // (either side of the jetty's foot, clear of it)
      place(C.bar.name, 'beach', bx - 4, by - 3, bx + 5, by + 4);
    }
    const jx = C.jetty.x, jy = shoreS(jx);
    if (jy !== null) {
      const J = tropicDock(jx, jy - 1, 0, C.jetty.len, C.jetty.head);
      m.marina.push({ x: Math.round((jx + 6) * TILE), y: Math.round((jy + C.jetty.len + 4.6) * TILE), a: 0, kind: 'speedboat' });
      P('rowboat', jx - 1.6, jy + C.jetty.len - 3, 0, { a: Math.PI / 2 });
      P('cooler', jx + 1, jy + C.jetty.len + 1, 0, { v: 1 }); P('ropecoil', jx + 0.2, jy + 4, 0);
      m.dropSites.push({ x: Math.round(J.ex * TILE), y: Math.round(J.ey * TILE), name: 'the end of the Lagoon Bar jetty' });
    }
  }
  // the cove (SC3-H): tiered basalt on its north-west with its falls, rocks and the mossy islet in the water, the reef
  // band across its mouth, the dock and the moored rowboat on its south beach, crabs, shells, a driftwood log
  if (coveOk) {
    const fx = ccx - 6, fy = ccy - cry + 1.6;
    rock(fx, fy - 2.2, 170, 70, 164, 11); rock(fx - 5.4, fy - 1.2, 110, 64, 140, 12); rock(fx + 5.8, fy - 1.6, 110, 64, 132, 13);
    // the basalt wrapping the cove's north and west, stepping down to the water and higher further back
    const ring = (x, y) => { if (inCove(x, y) || sea(x, y) || (Math.abs(x + 0.5 - fx) < 4.5 && y + 0.5 > fy - 2.5) || y > ccy + 3 || x > ccx + crx - 1) return false; for (let r = 1; r <= 7; r++) for (const [dx, dy] of [[r, 0], [0, r], [r, r], [-r, r], [r, -r]]) if (inCove(x + dx, y + dy)) return x < ccx + 2 || y < ccy - cry + 4; return false; };
    const dCove = (x, y) => { for (let r = 1; r <= 9; r++) for (let a = 0; a < 8; a++) { const X = Math.round(x + Math.cos(a * 0.785) * r), Y = Math.round(y + Math.sin(a * 0.785) * r); if (inCove(X, Y)) return r; } return 9; };
    out.coveRock = ridge(ccx - crx - 8, ccy - cry - 8, ccx + crx, ccy + 3, ring, (x, y) => 40 + dCove(x, y) * 20, 67, [3.5, 2.5]);
    heroFalls(fx, fy + 0.6, 84, 168, 23);
    P('coastfall', fx - 5.6, fy + 2.4, 0, { kind: 'ledge', w: 18, drop: 52, s: 27, mist: 0.4, stone: 'lava' });
    P('outcrop', ccx + 1, ccy - 1, 18, { w: 60, d: 40, h: 18, style: 'lava', s: 2, j: 1, rock: 1 });   // the mossy islet
    for (const [dx, dy, s] of [[-3, 3, 20], [5, -4, 16], [7, 3, 22], [-5, -3, 14], [2, 6, 12]]) boulder(ccx + dx, ccy + dy, s, 1);
    reefBand(ccx + crx - 2, CV.mouth[0] - 6, ccx + crx + 14, CV.mouth[1] + 6, 0, 6, 91);
    foamDashes(ccx + crx + 9, CV.mouth[0] - 7, ccx + crx + 10, CV.mouth[1] + 7, 97);   // (the surf breaking over the reef band across the mouth: broken dashes along it)
    // the dock from the south beach, the rowboat moored by it
    let dy = ccy + cry; while (dy > ccy && !sea(ccx + 4, dy)) dy--;
    const J = tropicDock(ccx + 3, dy + 2, 1, 8, 6, 3);
    P('rowboat', J.ex + 2, J.ey + 1.4, 0, { a: Math.PI / 2 - 0.2 }); P('ropecoil', ccx + 5, dy + 1.4, 0);
    const beach = [];
    for (let y = ccy - 4; y <= ccy + cry + 5; y++) for (let x = ccx - crx - 4; x <= ccx + crx + 6; x++) if (free(x, y) && tileAt(x, y) === T.SAND) beach.push([x, y]);
    // the life of the beach by the water's edge: crabs scuttling, sea stars and shells washed up, two driftwood logs
    const edge = beach.filter(([x, y]) => nearT(x, y, 2, sea));
    edge.forEach(([x, y], k) => { const u = hh(x, y, 93); if (u < 0.16) { P('crab', x + 0.5, y + 0.5, 0, { a: hh(y, x, 94) * 6.28 }); take(x, y, 0); out.critters++; } else if (u < 0.3) { P('starfish', x + 0.3 + hh(k, 1, 95) * 0.4, y + 0.5, 0, { v: k % 4 }); take(x, y, 0); } });
    for (const f of [0.35, 0.75]) { const lg = beach.filter(([x, y]) => !taken.has(idx(x, y)) && !nearT(x, y, 1, sea))[Math.floor(beach.length * f * 0.5)]; if (lg) { P('driftwood', lg[0] + 0.5, lg[1] + 0.5, 0, { len: 120, a: 0.3 + f }); take(lg[0], lg[1], 1); } }
    P('snorkeler', ccx - 2, ccy + 4, 0, { k: 1, a: 2.1 }); out.critters++;
    for (const [dx, dy, k, z] of [[-9, -7, 0, 104], [12, -5, 1, 96]]) P('macaw', fx + dx, fy + dy, 0, { k, z, a: 1.2 }), out.critters++;
    P('macaw', ccx + 2, ccy - 6, 0, { k: 0, fly: 1, z: 70, a: 0.4 }); out.critters++;
    (m.natureSites ||= []).push({ kind: 'jfalls', hand: true, name: CV.falls, x: Math.round(fx * TILE), y: Math.round((fy + 3) * TILE), falls: { x: Math.round(fx * TILE), y: Math.round(fy * TILE), w: 84, drop: 168 }, cove: true });
    place(CV.name, 'beach', ccx - crx, ccy - cry, ccx + crx + 4, ccy + cry);
  }
  // the islet offshore to the south-east: sand round it, jungle on its middle, black rock on its shore, the stilt house
  // on its east side with a little jetty to it
  {
    const [icx, icy, irx, iry] = C.islet.c, inI = blob(icx, icy, irx, iry, 101, 0.2), ok = [];
    let clear = true;
    for (let y = icy - iry - 6; y <= icy + iry + 6 && clear; y++) for (let x = icx - irx - 6; x <= icx + irx + 6; x++) if (!sea(x, y)) { clear = false; break; }
    if (clear) {
      for (let y = icy - iry - 2; y <= icy + iry + 2; y++) for (let x = icx - irx - 2; x <= icx + irx + 2; x++) if (inI(x, y)) { toLand(x, y, T.SAND); ok.push([x, y]); }
      for (const [x, y] of ok) if (inI(x - 2, y) && inI(x + 2, y) && inI(x, y - 2) && inI(x, y + 2)) m.tiles[idx(x, y)] = T.GRASS;
      for (let y = icy - iry - 5; y <= icy + iry + 5; y++) for (let x = icx - irx - 5; x <= icx + irx + 5; x++) if (inF(x, y) && m.tiles[idx(x, y)] === T.DEEP && !m.land[idx(x, y)]) m.tiles[idx(x, y)] = T.WATER;
      rockShore(icx - irx - 2, icy - iry - 2, icx + irx + 3, icy + iry + 3, 103, 7, (x) => x > icx + irx - 4);
      jungleFrame(icx - irx, icy - iry, icx + irx + 1, icy + iry + 1, (x, y) => inI(x, y) && tileAt(x, y) === T.GRASS, 105, { dense: 0.95, birds: 0.08 });
      for (const [dx, dy, sp] of [[-5, -2, 'coconut'], [-1, -3, 'royal'], [3, -1, 'leaning'], [-7, 2, 'leaning'], [1, 2, 'coconut'], [6, 3, 'fanSkirt']]) if (inI(icx + dx, icy + dy) && !taken.has(idx(icx + dx, icy + dy))) palm(icx + dx + 0.5, icy + dy + 0.5, sp, 1.35);
      P('macaw', icx - 0.5, icy - 2.4, 0, { k: 1, z: 104, a: 0.8 }); out.critters++;
      const hx = icx + irx + 3, hy = icy;
      for (let ty = hy - 1; ty <= hy + 2; ty++) for (let tx = hx - 1; tx <= hx + 2; tx++) if (sea(tx, ty)) { m.tiles[idx(tx, ty)] = T.DOCK; m.reserve[idx(tx, ty)] |= RES | KEEP; }
      for (let tx = hx - 4; tx < hx - 1; tx++) for (const ty of [hy, hy + 1]) if (sea(tx, ty) || tileAt(tx, ty) === T.SAND) { m.tiles[idx(tx, ty)] = T.DOCK; m.reserve[idx(tx, ty)] |= RES | KEEP; }
      P('stilthut', hx + 0.5, hy + 0.5, 0, { lift: 22, tin: 1 }); for (const dx of [-1, 0, 1]) solid(hx + 0.5 + dx, hy + 0.1, 14);
      P('canoe', hx + 1, hy + 3.4, 0, { a: 0.1, c: 2 });
      place('Turtle Islet', 'beach', icx - irx, icy - iry, icx + irx + 4, icy + iry);
    }
  }
  // the wreck on the outer reef
  {
    const [wx, wy] = C.wreck.at, a = C.wreck.a;
    if (sea(wx, wy) && sea(wx - 4, wy) && sea(wx + 4, wy)) {
      P('wreck', wx, wy, 0, { a });
      for (let u = -90; u <= 90; u += 30) m.addSolidProp(Math.round(wx * TILE + Math.cos(a) * u), Math.round(wy * TILE + Math.sin(a) * u), 22);
      for (const [dx, dy, s] of [[-5, 3, 18], [4, -4, 14], [6, 3, 20], [-3, -4, 12]]) boulder(wx + dx, wy + dy, s);
      P('gull', wx + 1, wy - 0.6, 0, { a: 0.6, z: 34 });
      place(C.wreck.name, 'wreck', wx - 6, wy - 5, wx + 6, wy + 5);
    }
  }
  // black rock along the lobe's beaches (not at the bar, the jetty, the cove's beach or the trails' ends), reef heads
  // in the shallows off it, turtles
  const busyAt = (x, y) => (Math.abs(x - C.bar.x) < 14 && y > 3490) || (Math.abs(x - C.jetty.x) < 6 && y > 3490) || (coveOk && inCove(x, y)) || (x > ccx - crx - 4 && x < ccx + crx + 6 && y > ccy - cry - 4 && y < ccy + cry + 6);
  rockShore(LX0 + 6, LY0, LX1 + 4, LY1 + 12, 111, 11, busyAt);
  // the black rock headlands that break the beaches (NA1-E's piles of basalt out into the water): the rock over the sand
  // there, highest inland
  const dSea = (x, y) => { for (let r = 1; r <= 8; r++) if (nearT(x, y, r, sea)) return r; return 9; };
  for (const [hx, hy, hr, seed] of C.headlands) { const inH = blob(hx, hy, hr, hr * 0.8, seed, 0.25); out.headlands = (out.headlands || 0) + ridge(hx - hr - 1, hy - hr, hx + hr + 1, hy + hr, (x, y) => inH(x, y) && soft(x, y) && !busyAt(x, y), (x, y) => 28 + dSea(Math.floor(x), Math.floor(y)) * 14, seed, [3, 2.5]); }
  reefBand(LX0, LY0 - 16, LX1 + 18, LY1 + 26, 6, 10, 113, (x, y) => (Math.abs(x - C.jetty.x - 3) < 12 && y > 3500) || Math.hypot(x - C.islet.c[0], y - C.islet.c[1]) < 16);
  surfLine(LX0, LY0 - 18, LX1 + 20, LY1 + 26, 11, 117, (x, y) => (Math.abs(x - C.jetty.x - 3) < 12 && y > 3500) || Math.hypot(x - C.islet.c[0], y - C.islet.c[1]) < 14 || (x > ccx && Math.abs(y - (CV.mouth[0] + CV.mouth[1]) / 2) < 16));
  for (const [x, y, a] of [[4392, 3549], [4402, 3556, 1.2], [4462, 3534, 2.6], [4481, 3352, 4]]) if (sea(x, y)) { P('turtle', x + 0.5, y + 0.5, 0, { a: a || 0.4 }); out.critters++; }
  if (sea(4446, 3548)) P('snorkeler', 4446.5, 3548.5, 0, { k: 2, a: 5.2 }), out.critters++;
  // the beach narrowed: the lobe's sand more than five tiles from the sea grows over (the jungle comes down to it)
  for (let y = LY0; y < LY1; y++) for (let x = LX0; x < LX1; x++) if (free(x, y) && tileAt(x, y) === T.SAND && !(m.reserve[idx(x, y)] & KEEP) && !nearT(x, y, 5, sea)) m.tiles[idx(x, y)] = T.GRASS;
  // the jungle: everything still open on the lobe, not the beaches
  const lobeJ = (x, y) => x > LX0 && x < LX1 && y > LY0 && y < LY1 && tileAt(x, y) === T.GRASS && !inPool(x, y);
  out.jungle = jungleFrame(LX0, LY0, LX1, LY1, lobeJ, 121, { birds: 0.035 });
  // macaws round the falls
  for (const [dx, dy, k, z] of [[-12, -2, 0, 100], [13, -1, 1, 108], [-16, 6, 1, 96]]) P('macaw', F.x + dx, F.y + dy, 0, { k, z, a: dx > 0 ? 3.6 : 0.3 }), out.critters++;
  P('macaw', F.x + 4, F.y + 2, 0, { k: 0, fly: 1, z: 80, a: 2.6 }); out.critters++;

  // ---- the kit elsewhere: Wreck Beach on the west lobe's tip, Tiki Point's north beach ------------------------------
  {
    const [x0, y0, x1, y1] = C.wreckBeach;
    rockShore(x0 - 4, y0 - 20, x1, y1 + 20, 131, 9, (x, y) => Math.abs(y - 3428) < 7);
    reefBand(x0 - 20, y0 - 20, x1, y1 + 20, 5, 11, 133, (x, y) => Math.abs(y - 3428) < 5);
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (free(x, y) && tileAt(x, y) === T.SAND && !(m.reserve[idx(x, y)] & KEEP) && !nearT(x, y, 6, sea) && Math.abs(y - 3428) > 6) m.tiles[idx(x, y)] = T.GRASS;
    const edgeX = (y) => 4031 + 3 * Math.sin(y * 0.21) + 2 * hh(y >> 2, 7, 137);   // (its inland edge wanders, no ruled line)
    jungleFrame(x0, y0, x1, y1, (x, y) => tileAt(x, y) === T.GRASS && x < edgeX(y), 135, { dense: 0.8, birds: 0.06 });
  }
  for (const [x, y] of C.tiki.rocks) { let sy = y; while (sy > y - 14 && !sea(x, sy)) sy--; if (sea(x, sy)) { rock(x + 0.5, sy + 1.2, 110, 64, 36, x, 0, true); for (let k = 0; k < 4; k++) boulder(x + (hh(k, x, 141) - 0.5) * 6, sy + 0.5 - hh(k, y, 142) * 2.5, 12 + Math.round(hh(k, 3, 143) * 16)); } }
  reefBand(4120, 3290, 4260, 3318, 5, 11, 145);
  return out;
}
