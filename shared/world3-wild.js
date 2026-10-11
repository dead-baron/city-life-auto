// World v3 (docs/WORLD-V3.md 8.19): today's wild land's designed places brought into the whole-world build. Today's
// Highland Woods (district 29), Granite Peaks (33) and Dry Creek (9, 41, 42) are no piece of the v3 world (8.6: their
// positions go off the frame), but part 1.5 moves their places into the new regions and the owner split Dry Creek
// between Willow Valley and the Red Rock Desert (part 5). This step brings their country sites (shared/countryside.js
// SITES: the campgrounds, the roadside stops, the masts, the quarry, the observatory, the wind farms, the oil field, the
// solar farm, the drive-in, The Rusty Spur) to spots in their v3 region (WILD_SITES, the placement table), each placed
// by today's rules round its spot - open ground of its region, clear of the skeleton's roads, the main line, the
// stations, the towns and the desert's places - with its own access road to the nearest road it may join (never a
// highway: they cross nothing at grade). For the whole-world build only (shared/world3-world.js calls wildSites3 from
// its lines hook, after the skeleton's roads and the towns' streets; the page and the city worker never import this
// module). map.js's buildCountryside builds what stands on each lot, as today's.
import { TILE, T } from './constants.js';
import { rounded, measure, segX } from './geom.js';
import { skeletonLines, STATIONS, nearestOnPath } from './world3-skeleton.js';
import { SITES } from './countryside.js';
import { D3 } from './world3-biomes.js';
import { DESERT, HOLLOW, GULCH } from './world3-desert.js';
import { stamp } from './world3-towns.js';

// The placement table: each of today's country sites of the wild land, by name, at its spot in its v3 region (tiles; the
// lot is looked for within 60 tiles of it). Highland Woods' in the woods off Timber Road and Woods Road (the skeleton's
// "Redwood campgrounds" by Woods Road); Granite Peaks' up on the peaks off Summit Road, Falls Pass Road and Lookout Road;
// Dry Creek's desert places in the Red Rock Desert's west, off Mine Road, Route 9 and Mesa Road (the Route 9 stop at
// the skeleton's Route 9 point, The Rusty Spur by the Desert Highway at Mine Road's crossing).
export const WILD_SITES = [
  { name: 'Pine Ridge Campground', d: D3.WOODS, near: [880, 1520] },
  { name: 'Highland', d: D3.WOODS, near: [640, 1096] },
  { name: 'Highland Radio Mast', d: D3.WOODS, near: [760, 1050] },
  { name: 'Granite Quarry', d: D3.PEAKS, near: [1300, 440] },
  { name: 'Granite Peak Observatory', d: D3.PEAKS, near: [700, 175] },
  { name: 'Granite Cove Campground', d: D3.PEAKS, near: [560, 470] },
  { name: 'Windy Point Wind Farm', d: D3.PEAKS, near: [200, 610] },
  { name: 'North Ridge Mast', d: D3.PEAKS, near: [300, 120] },
  { name: 'Dry Creek Oil Field', d: D3.DESERT, near: [3980, 1130] },
  { name: 'Sunfield Solar Farm', d: D3.DESERT, near: [3990, 1440] },
  { name: 'Starlite Drive-In', d: D3.DESERT, near: [4200, 1520] },
  { name: 'Route 9', d: D3.DESERT, near: [3800, 1496] },
  { name: 'Mesa Radio Mast', d: D3.DESERT, near: [3740, 370] },
  { name: 'Dry Creek Wind Farm', d: D3.DESERT, near: [3700, 290] },
  { name: 'The Rusty Spur', d: D3.DESERT, near: [3740, 1150] },
];
// the room kept round the skeleton's lines (tiles): the highways', the main line's and its stations' as the desert's
// places keep (world3-desert.js), a road's own few tiles
export const WILD_ROOM = { hwy: 24, main: 18, station: 30, road: 4, place: 12 };
// what each kind of access road may join (countryside.js ACCESS_TO, without the highways: v3's are grade-separated)
const ACCESS = { dirt: new Set(['rural', 'dirt', 'art', 'st', 'drive', 'minor']), rural: new Set(['rural', 'dirt', 'art', 'ave', 'st', 'drive']) };
const GROUND = new Set([T.GRASS, T.DIRT, T.SAND]);
const R = 60, REACH = 90, M = 2;
// the distance from (x, y) to a polyline of [x, y] points (tiles)
function dPoly(P, x, y) {
  let best = Infinity;
  for (let j = 1; j < P.length; j++) {
    const ax = P[j - 1][0], ay = P[j - 1][1], dx = P[j][0] - ax, dy = P[j][1] - ay, L2 = dx * dx + dy * dy;
    const w = L2 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / L2)) : 0, qx = ax + dx * w - x, qy = ay + dy * w - y;
    best = Math.min(best, qx * qx + qy * qy);
  }
  return Math.sqrt(best);
}

// The desert's places (world3-desert.js, built later in the dress hook) and the towns' boxes: no lot there.
function placeBoxes() {
  const out = [GULCH.box, HOLLOW.box, DESERT.pit, DESERT.motel, DESERT.freight];
  for (const [x, y, r] of [[...DESERT.camp, 40], [...DESERT.lookout, 50], [...DESERT.arch, 40]]) out.push([x - r, y - r, x + r, y + r]);
  out.push([DESERT.dam[0], 560, DESERT.dam[1], 720]);
  return out;
}

export function wildSites3(lines, m) {
  const W = m.w, H = m.h, out = { placed: [], missed: [] };
  const SK = skeletonLines(), hwys = SK.filter((l) => l.kind === 'hwy'), mains = SK.filter((l) => l.kind === 'main');
  const tunnels = (m.world3?.roads?.tunnels || []).map((t) => ({ pts: t.pts.map((p) => (Array.isArray(p) ? p : [p.x / TILE, p.y / TILE])) }));
  const boxes = placeBoxes();
  const claimed = [];   // (the lots placed so far and their roads: tile rects)
  const byName = new Map(SITES.map((S) => [S.name, S]));
  const asPath = (l) => ({ pts: l.pts.map((p) => [p.x / TILE, p.y / TILE]) });
  const hwyLines = lines.filter((l) => l.kind === 'hwy' || l.kind === 'ramp');
  for (const P of WILD_SITES) {
    const S = byName.get(P.name);
    if (!S) { out.missed.push(P.name); continue; }
    const wx0 = P.near[0] - R - S.w - 8, wy0 = P.near[1] - R - S.h - 8, wx1 = P.near[0] + R + S.w + 8, wy1 = P.near[1] + R + S.h + 8;
    const box = [wx0, wy0, wx1, wy1], BW = wx1 - wx0, BH = wy1 - wy0;
    // the window's bad ground: not open ground of the site's region, water, reserved; the room round every line laid so
    // far, the skeleton's highways, main line and stations, the places' boxes and the lots claimed
    const bad = new Uint8Array(BW * BH);
    for (let y = wy0; y < wy1; y++) for (let x = wx0; x < wx1; x++) {
      const j = (y - wy0) * BW + x - wx0;
      if (x < 0 || y < 0 || x >= W || y >= H) { bad[j] = 1; continue; }
      const i = y * W + x;
      if (!m.land[i] || m.river[i] || m.lake[i] || m.dist[i] !== P.d || !GROUND.has(m.tiles[i]) || m.reserve[i]) bad[j] = 1;
    }
    for (const l of lines) {
      let hit = false;
      for (const p of l.pts) if (p.x / TILE > wx0 - 30 && p.x / TILE < wx1 + 30 && p.y / TILE > wy0 - 30 && p.y / TILE < wy1 + 30) { hit = true; break; }
      if (hit) stamp(bad, box, asPath(l), l.kind === 'hwy' || l.kind === 'ramp' ? WILD_ROOM.hwy : WILD_ROOM.road);
    }
    for (const h of hwys) stamp(bad, box, h.path, WILD_ROOM.hwy);
    for (const r of mains) stamp(bad, box, r.path, WILD_ROOM.main);
    for (const s of STATIONS) if (s.line === 'main') stamp(bad, box, { pts: [s.at, s.at] }, WILD_ROOM.station);
    for (const [a, b, c, d] of [...boxes.map(([a, b, c, d]) => [a - WILD_ROOM.place, b - WILD_ROOM.place, c + WILD_ROOM.place, d + WILD_ROOM.place]), ...claimed]) {
      for (let y = Math.max(wy0, b); y < Math.min(wy1, d); y++) for (let x = Math.max(wx0, a); x < Math.min(wx1, c); x++) bad[(y - wy0) * BW + x - wx0] = 1;
    }
    const sat = new Int32Array((BW + 1) * (BH + 1));
    for (let y = 0; y < BH; y++) for (let x = 0; x < BW; x++) sat[(y + 1) * (BW + 1) + x + 1] = bad[y * BW + x] + sat[y * (BW + 1) + x + 1] + sat[(y + 1) * (BW + 1) + x] - sat[y * (BW + 1) + x];
    const badIn = (x, y, w, h) => {
      x -= wx0; y -= wy0;
      if (x < 0 || y < 0 || x + w > BW || y + h > BH) return 1;
      return sat[(y + h) * (BW + 1) + x + w] - sat[y * (BW + 1) + x + w] - sat[(y + h) * (BW + 1) + x] + sat[y * (BW + 1) + x];
    };
    // the points an access road may join: on the ground-level roads of a kind it may meet, on land, off the highways
    // (14 tiles: the streets are cut back from them), out of the tunnels
    const ok = ACCESS[S.road], samples = [];
    for (const l of lines) {
      if (l.lvl !== 0 || !ok.has(l.kind) || l.foot || (l.culdesac && (l.kind === 'rural' || l.kind === 'dirt'))) continue;
      for (let k = 0; k + 1 < l.pts.length; k++) {
        const a = l.pts[k], b = l.pts[k + 1], n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / (2 * TILE)));
        for (let j = 0; j < n; j++) {
          const x = (a.x + (b.x - a.x) * (j / n)) / TILE, y = (a.y + (b.y - a.y) * (j / n)) / TILE;
          if (Math.abs(x - P.near[0]) > R + REACH || Math.abs(y - P.near[1]) > R + REACH) continue;
          const tx = Math.floor(x), ty = Math.floor(y);
          if (tx < 0 || ty < 0 || tx >= W || ty >= H || !m.land[ty * W + tx] || m.river[ty * W + tx]) continue;
          if (hwys.some((h) => nearestOnPath(h.path, x, y).d < 14) || tunnels.some((t) => dPoly(t.pts, x, y) < 12)) continue;
          samples.push({ x, y });
        }
      }
    }
    const nearest = (ex, ey) => { let bq = null, bd = Infinity; for (const q of samples) { const d = Math.hypot(q.x - ex, q.y - ey); if (d < bd) { bd = d; bq = q; } } return [bq, bd]; };
    const cands = [];
    for (let dy = -R; dy <= R; dy += 2) for (let dx = -R; dx <= R; dx += 2) {
      const x = P.near[0] + dx - (S.w >> 1), y = P.near[1] + dy - (S.h >> 1);
      if (badIn(x - M, y - M, S.w + 2 * M, S.h + 2 * M)) continue;
      const [q, qd] = nearest(x + S.w / 2, y + S.h);
      if (!q || qd > REACH) continue;
      cands.push({ x, y, q, score: Math.hypot(dx, dy) + qd * 0.6 + (q.y < y + S.h * 0.5 ? 30 : 0) });
    }
    cands.sort((a, b) => a.score - b.score || a.y - b.y || a.x - b.x);
    // the way in (countryside.js's): out of the bottom of the lot, round its side if the road is behind it - over dry
    // open ground, across no highway and clear of the main line
    const route = (x, y, q) => {
      const cx = x + S.w / 2, by = y + S.h, c = [[cx, by - 2], [cx, by + 3]];
      if (q.y < by + 1) { const sx = q.x < cx ? x - 4 : x + S.w + 4; c.push([sx, by + 3]); if (Math.abs(q.y - (by + 3)) > 6) c.push([sx, q.y + (q.y < by ? 4 : -4)]); }
      c.push([q.x, q.y]);
      return c.map(([a, b]) => ({ x: a * TILE, y: b * TILE }));
    };
    const fine = (pts) => {
      for (let k = 0; k + 1 < pts.length; k++) {
        const a = pts[k], b = pts[k + 1], n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / TILE));
        for (let j = 0; j <= n; j++) {
          const x = (a.x + (b.x - a.x) * (j / n)) / TILE, y = (a.y + (b.y - a.y) * (j / n)) / TILE, tx = Math.floor(x), ty = Math.floor(y);
          if (tx < 0 || ty < 0 || tx >= W || ty >= H || !m.land[ty * W + tx] || m.river[ty * W + tx] || m.lake[ty * W + tx]) return false;
          if (mains.some((r) => nearestOnPath(r.path, x, y).d < 10)) return false;
        }
        for (const h of hwyLines) for (let j = 0; j + 1 < h.pts.length; j++) if (segX(a, b, h.pts[j], h.pts[j + 1])) return false;
      }
      return true;
    };
    let best = null;
    for (const c of cands.slice(0, 40)) { const r = route(c.x, c.y, c.q); if (fine(r)) { best = { ...c, r }; break; } }
    if (!best) { out.missed.push(P.name); continue; }
    const { x, y } = best;
    const site = { ...S, near: [P.near[0], P.near[1]], x, y, d: m.dist[(y + (S.h >> 1)) * W + x + (S.w >> 1)], hx: x - (P.near[0] - S.near[0]), hy: y - (P.near[1] - S.near[1]), v3: true };
    m.countrySites.push(site);
    for (let ty = y - 1; ty < y + S.h + 1; ty++) for (let tx = x - 1; tx < x + S.w + 1; tx++) m.reserve[ty * W + tx] |= 32;
    claimed.push([x - 3, y - 3, x + S.w + 3, y + S.h + 3]);
    const pts = rounded(best.r, 4 * TILE, false, 8);
    measure(pts);
    const name = `${S.name} Road`.replace(' Road Road', ' Road');
    lines.push({ pts, kind: S.road, lvl: 0, name, culdesac: true });
    for (const p of pts) claimed.push([Math.floor(p.x / TILE) - 3, Math.floor(p.y / TILE) - 3, Math.floor(p.x / TILE) + 4, Math.floor(p.y / TILE) + 4]);
    out.placed.push({ name: S.name, type: S.type, x, y, w: S.w, h: S.h, d: site.d, road: name, joins: [Math.round(best.q.x), Math.round(best.q.y)] });
  }
  return out;
}

// Once the world is built: what stands on each lot (map.js buildCountryside), the summary for m.world3.wild.
export function wildDone(m, placed) {
  const names = new Set(WILD_SITES.map((P) => P.name));
  const sites = (m.countrySites || []).filter((s) => s.v3 && names.has(s.name));
  return { ...placed, built: sites.map((s) => s.name), quarries: (m.quarries || []).map((q) => q.name || null) };
}
