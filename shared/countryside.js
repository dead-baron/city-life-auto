// Out in the country: places that give the wild ground between the towns something to drive to.
// Campgrounds in the woods, roadside stops (a quick stop, a diner and a filling station on one forecourt),
// radio masts on the ridges, wind farms, an oil field, a solar farm, a drive-in cinema, a quarry,
// an observatory and a raceway. Each one finds open ground near its spot when the roads are laid
// out (clear of every road, the railway, the airports and the sea), claims it, and gets its own
// access road from the nearest road. map.js builds what stands on it later (buildCountryside).
//
// Tiles unless a name says px. No randomness of its own: hash2 only, so the rest of the city never
// shifts because of anything here.
import { TILE, MAP_W, MAP_H, T } from './constants.js';
import { hash2 } from './rng.js';
import { rounded, measure, pointAt, segX } from './geom.js';

// type: what gets built; near: the spot to look round; w, h: the lot; road: the access road's kind
export const SITES = [
  // Highland Woods (Westport)
  { type: 'camp', name: 'Pine Ridge Campground', near: [80, 246], w: 26, h: 18, road: 'rural' },
  { type: 'stop', name: 'Highland', near: [196, 222], w: 46, h: 18, road: 'rural' },
  { type: 'mast', name: 'Highland Radio Mast', near: [196, 96], w: 10, h: 10, road: 'dirt' },
  // Granite Peaks (Northshore)
  { type: 'quarry', name: 'Granite Quarry', near: [486, 78], w: 44, h: 32, road: 'rural' },
  { type: 'observatory', name: 'Granite Peak Observatory', near: [770, 50], w: 20, h: 16, road: 'rural' },
  { type: 'camp', name: 'Granite Cove Campground', near: [556, 204], w: 26, h: 18, road: 'rural' },
  { type: 'wind', name: 'Windy Point Wind Farm', near: [728, 214], w: 36, h: 26, road: 'rural' },
  { type: 'mast', name: 'North Ridge Mast', near: [640, 46], w: 10, h: 10, road: 'dirt' },
  // Dry Creek
  { type: 'oil', name: 'Dry Creek Oil Field', near: [1124, 336], w: 56, h: 46, road: 'rural' },
  { type: 'solar', name: 'Sunfield Solar Farm', near: [1214, 330], w: 34, h: 36, road: 'dirt' },
  { type: 'drivein', name: 'Starlite Drive-In', near: [1140, 896], w: 40, h: 30, road: 'rural' },
  { type: 'stop', name: 'Route 9', near: [1190, 764], w: 46, h: 18, road: 'rural' },
  { type: 'mast', name: 'Mesa Radio Mast', near: [1206, 284], w: 10, h: 10, road: 'dirt' },
  { type: 'wind', name: 'Dry Creek Wind Farm', near: [1252, 600], w: 22, h: 52, road: 'dirt' },
  // Cedar Hills (Cedar Isle)
  { type: 'camp', name: 'Cedar Hills Campground', near: [944, 1076], w: 26, h: 18, road: 'rural' },
  { type: 'wind', name: 'Cedar Point Wind Farm', near: [900, 1112], w: 36, h: 22, road: 'rural' },
  // the open ground past Westport International
  { type: 'raceway', name: 'Westport Raceway', near: [284, 812], w: 62, h: 34, road: 'rural' },
];

// what each kind of access road may join (the road hierarchy: a dirt track never meets a highway)
const ACCESS_TO = {
  dirt: new Set(['rural', 'dirt', 'art', 'st', 'drive', 'minor']),
  rural: new Set(['rural', 'dirt', 'art', 'hwy', 'ave', 'st', 'drive']),
};

// ---- layout ------------------------------------------------------------------------------------
// ctx: { m, lines, isLand, lake, seaD, wildAt(tx, ty), avoid: [[x, y, w, h] tiles] }
export function countrysideRoads(ctx) {
  const { m, lines } = ctx;
  const W = MAP_W, H = MAP_H;
  m.countrySites = [];
  // "can't build here": not wild land, water, lakes, rivers, the shore, the railway, and a few
  // tiles round every road line already laid out
  const bad = new Uint8Array(W * H);
  for (let ty = 0; ty < H; ty++) for (let tx = 0; tx < W; tx++) {
    const i = ty * W + tx;
    if (!ctx.isLand(tx, ty) || ctx.lake(tx, ty) || m.river[i] || ctx.seaD(tx, ty) < 3 || !ctx.wildAt(tx, ty)) bad[i] = 1;
  }
  const stamp = (x, y, r) => {
    const cx = Math.floor(x / TILE), cy = Math.floor(y / TILE);
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const tx = cx + dx, ty = cy + dy; if (tx >= 0 && ty >= 0 && tx < W && ty < H) bad[ty * W + tx] = 1; }
  };
  const samples = []; // points along the roads an access road may join: { x, y } px
  for (const l of lines) {
    const p = l.pts, wide = l.kind === 'hwy' ? 5 : 3;
    for (let k = 0; k + 1 < p.length; k++) {
      const a = p[k], b = p[k + 1], n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 16));
      for (let j = 0; j <= n; j++) {
        const x = a.x + (b.x - a.x) * (j / n), y = a.y + (b.y - a.y) * (j / n);
        stamp(x, y, wide);
        if (l.lvl === 0 && !l.culdesac && j % 2 === 0) samples.push({ x, y, kind: l.kind });
      }
    }
  }
  for (const q of m.railPts || []) stamp(q.x, q.y, 6);
  // streets that run up to a ground-level highway get cut back from it later (map.js
  // clipAtHighways): don't count on joining them anywhere near one
  const nearHwy = new Uint8Array(W * H);
  for (const l of lines) if (l.kind === 'hwy' && l.lvl === 0) for (let k = 0; k + 1 < l.pts.length; k++) {
    const a = l.pts[k], b = l.pts[k + 1], n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / (4 * TILE)));
    for (let j = 0; j <= n; j++) {
      const cx = Math.floor((a.x + (b.x - a.x) * (j / n)) / TILE), cy = Math.floor((a.y + (b.y - a.y) * (j / n)) / TILE);
      for (let dy = -14; dy <= 14; dy++) for (let dx = -14; dx <= 14; dx++) { const tx = cx + dx, ty = cy + dy; if (tx >= 0 && ty >= 0 && tx < W && ty < H) nearHwy[ty * W + tx] = 1; }
    }
  }
  for (let k = samples.length - 1; k >= 0; k--) { const q = samples[k]; if (q.kind !== 'hwy' && nearHwy[Math.floor(q.y / TILE) * W + Math.floor(q.x / TILE)]) samples.splice(k, 1); }
  for (const [ax, ay, aw, ah] of ctx.avoid || []) for (let ty = ay; ty < ay + ah; ty++) for (let tx = ax; tx < ax + aw; tx++) if (tx >= 0 && ty >= 0 && tx < W && ty < H) bad[ty * W + tx] = 1;
  // summed-area table, so a whole lot is tested in one look
  const sat = new Int32Array((W + 1) * (H + 1));
  const build = () => {
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) sat[(y + 1) * (W + 1) + x + 1] = bad[y * W + x] + sat[y * (W + 1) + x + 1] + sat[(y + 1) * (W + 1) + x] - sat[y * (W + 1) + x];
  };
  build();
  const satIn = (x, y, w, h) => (x < 0 || y < 0 || x + w > W || y + h > H ? 1 : sat[(y + h) * (W + 1) + x + w] - sat[y * (W + 1) + x + w] - sat[(y + h) * (W + 1) + x] + sat[y * (W + 1) + x]);
  // what's been claimed since the table was built (the lots placed so far and their roads in)
  const claimed = []; // tile rects [x0, y0, x1, y1), inclusive-exclusive
  const badIn = (x, y, w, h) => {
    if (satIn(x, y, w, h)) return 1;
    for (const [a, b, c, d] of claimed) if (a < x + w && c > x && b < y + h && d > y) return 1;
    return 0;
  };

  const hwys = lines.filter((l) => l.kind === 'hwy' && l.lvl === 0);
  const crossesHwy = (pts) => {
    for (let k = 0; k + 1 < pts.length; k++) for (const h of hwys) for (let j = 0; j + 1 < h.pts.length; j++) if (segX(pts[k], pts[k + 1], h.pts[j], h.pts[j + 1])) return true;
    return false;
  };
  // the way in: out of the bottom of the lot, round its side if the road is behind it
  const route = (S, x, y, q) => {
    const cx = x + S.w / 2, by = y + S.h;
    const qx = q.x / TILE, qy = q.y / TILE;
    const corners = [[cx, by - 2], [cx, by + 3]];
    if (qy < by + 1) {
      const sx = qx < cx ? x - 4 : x + S.w + 4;
      corners.push([sx, by + 3]);
      if (Math.abs(qy - (by + 3)) > 6) corners.push([sx, qy + (qy < by ? 4 : -4)]);
    }
    corners.push([qx, qy]);
    return corners.map(([a, b]) => ({ x: a * TILE, y: b * TILE }));
  };
  for (const S of SITES) {
    const M = 2;
    const ok = ACCESS_TO[S.road];
    // (roads on the same piece of land only: never across the water to the next island)
    const comp = m.compLab ? m.compLab[S.near[1] * W + S.near[0]] : -1;
    const sameLand = (q) => !m.compLab || comp < 0 || m.compLab[Math.floor(q.y / TILE) * W + Math.floor(q.x / TILE)] === comp;
    const near = samples.filter((q) => ok.has(q.kind) && Math.abs(q.x / TILE - S.near[0]) < 160 && Math.abs(q.y / TILE - S.near[1]) < 160 && sameLand(q));
    // bucketed, so finding the nearest one is a look round a few cells, not a scan of them all
    const CELL = 16 * TILE, buckets = new Map();
    near.forEach((q, i) => { const k = Math.floor(q.x / CELL) * 4096 + Math.floor(q.y / CELL); let b = buckets.get(k); if (!b) buckets.set(k, (b = [])); b.push(i); });
    const nearest = (ex, ey) => {
      const cx = Math.floor(ex / CELL), cy = Math.floor(ey / CELL);
      let bi = -1, bd = Infinity;
      for (let r = 0; r < 14; r++) {
        if (bi >= 0 && (r - 1) * CELL > bd) break;
        for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const b = buckets.get((cx + dx) * 4096 + cy + dy);
          if (b) for (const i of b) { const q = near[i], d = Math.hypot(q.x - ex, q.y - ey); if (d < bd || (d === bd && i < bi)) { bd = d; bi = i; } }
        }
      }
      return bi < 0 ? [null, Infinity] : [near[bi], bd];
    };
    const cands = [];
    for (let dy = -60; dy <= 60; dy += 2) for (let dx = -60; dx <= 60; dx += 2) {
      const x = S.near[0] + dx - (S.w >> 1), y = S.near[1] + dy - (S.h >> 1);
      if (badIn(x - M, y - M, S.w + 2 * M, S.h + 2 * M)) continue;
      // the nearest road below or beside the entrance (the middle of the bottom edge)
      const ex = (x + S.w / 2) * TILE, ey = (y + S.h) * TILE;
      const [q, qd] = nearest(ex, ey);
      if (!q || qd > 90 * TILE) continue;
      const above = q.y < (y + S.h * 0.5) * TILE ? 30 : 0; // a road behind the lot means a long way round
      cands.push({ x, y, q, score: Math.hypot(dx, dy) + qd / TILE * 0.6 + above });
    }
    cands.sort((a, b) => a.score - b.score);
    // a track that would have to cross a highway to get there isn't a way in
    // ...nor one that would have to bridge the sea or a lake
    const dry = (pts) => {
      for (let k = 0; k + 1 < pts.length; k++) {
        const a = pts[k], b = pts[k + 1], n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 16));
        for (let j = 0; j <= n; j++) { const tx = (a.x + (b.x - a.x) * (j / n)) / TILE, ty = (a.y + (b.y - a.y) * (j / n)) / TILE; if (!ctx.isLand(tx, ty) || ctx.lake(tx, ty) || ctx.seaD(tx, ty) < 3) return false; }
      }
      return true;
    };
    const best = cands.find((c) => { const r = route(S, c.x, c.y, c.q); return dry(r) && (S.road !== 'dirt' || !crossesHwy(r)); });
    if (!best) continue;
    const { x, y, q } = best;
    const site = { ...S, x, y, d: m.dist[(y + (S.h >> 1)) * W + x + (S.w >> 1)] };
    m.countrySites.push(site);
    for (let ty = y - 1; ty < y + S.h + 1; ty++) for (let tx = x - 1; tx < x + S.w + 1; tx++) m.reserve[ty * W + tx] |= 32;
    claimed.push([x - 1, y - 1, x + S.w + 1, y + S.h + 1]);
    const pts = rounded(route(S, x, y, q), 4 * TILE, false, 8);
    measure(pts);
    lines.push({ pts, kind: S.road, lvl: 0, name: `${S.name} Road`.replace(' Road Road', ' Road'), culdesac: true });
    // the access road is now a road too (later lots keep off it)
    for (let k = 0; k + 1 < pts.length; k++) {
      const a = pts[k], b = pts[k + 1], n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 16));
      for (let j = 0; j <= n; j++) { const tx = Math.floor((a.x + (b.x - a.x) * (j / n)) / TILE), ty = Math.floor((a.y + (b.y - a.y) * (j / n)) / TILE); claimed.push([tx - 3, ty - 3, tx + 4, ty + 4]); }
    }
  }
}

// ---- building ----------------------------------------------------------------------------------
// H: map.js helpers { simpleBuilding, placePrefab, addProp, clearArea, rand }
export function buildCountryside(m, H) {
  m.landmarks = m.landmarks || [];
  m.quarries = []; m.raceways = [];
  for (const s of m.countrySites || []) {
    H.clearArea(m, s.x, s.y, s.w, s.h);
    const fn = BUILD[s.type];
    if (fn) fn(m, s, H);
    m.landmarks.push({ name: s.name, type: s.type, x: s.x * TILE, y: s.y * TILE, w: s.w * TILE, h: s.h * TILE });
  }
}

const px = (t) => (t + 0.5) * TILE;
const fill = (m, x, y, w, h, t) => { for (let ty = y; ty < y + h; ty++) for (let tx = x; tx < x + w; tx++) if (tx >= 0 && ty >= 0 && tx < MAP_W && ty < MAP_H) m.set(tx, ty, t); };
const hs = (s, k, salt) => hash2(s.x * 31 + k, s.y * 17 + k * 7, salt);
// the lot's own way in: the bottom middle down to where its access road starts
const gateway = (m, s, t, wd = 3) => fill(m, s.x + (s.w >> 1) - (wd >> 1), s.y + s.h - 3, wd, 4, t);
const treesRound = (m, s, H, skip) => {
  for (let k = 0; k < (s.w + s.h) * 2; k += 3) {
    const per = 2 * (s.w + s.h);
    const t = (k + hs(s, k, 3) * 2) % per;
    let tx, ty;
    if (t < s.w) { tx = s.x + t; ty = s.y; } else if (t < s.w + s.h) { tx = s.x + s.w - 1; ty = s.y + t - s.w; } else if (t < 2 * s.w + s.h) { tx = s.x + s.w - 1 - (t - s.w - s.h); ty = s.y + s.h - 1; } else { tx = s.x; ty = s.y + s.h - 1 - (t - 2 * s.w - s.h); }
    if (skip && skip(tx, ty)) continue;
    if (m.tiles[ty * MAP_W + tx] !== T.GRASS && m.tiles[ty * MAP_W + tx] !== T.DIRT) continue;
    const h = hs(s, k, 4);
    H.addProp(m, h < 0.5 ? 'tree_a' : h < 0.8 ? 'tree_b' : 'shrub_a', px(tx), px(ty), h < 0.8 ? 12 : 0);
  }
};

const BUILD = {
  // tents round a dirt loop, a fire pit and a picnic table at every pitch, the ranger station
  camp(m, s, H) {
    fill(m, s.x, s.y, s.w, s.h, T.GRASS);
    const x0 = s.x + 3, x1 = s.x + s.w - 4, y0 = s.y + 3, y1 = s.y + s.h - 5;
    fill(m, x0, y0, x1 - x0 + 1, 2, T.DIRT); fill(m, x0, y1, x1 - x0 + 1, 2, T.DIRT);
    fill(m, x0, y0, 2, y1 - y0 + 2, T.DIRT); fill(m, x1 - 1, y0, 2, y1 - y0 + 2, T.DIRT);
    const mid = s.x + (s.w >> 1);
    fill(m, mid - 3, y1 + 2, 6, s.y + s.h - y1 - 2, T.DIRT); // car park at the gate
    for (const dx of [-2, 2]) m.parking.push({ x: (mid + dx) * TILE, y: (s.y + s.h - 1.5) * TILE, a: -Math.PI / 2, drive: true });
    const d = s.d;
    H.simpleBuilding(m, s.x + s.w - 8, s.y + s.h - 4, 5, 3, `${s.name} Ranger Station`, 'ranger', d, 'tile', { x: (s.x + s.w - 5.5) * TILE, y: (s.y + s.h - 1.2) * TILE, text: 'Ranger Station' });
    m.pois.push({ id: m.pois.length, kind: 'delivery', label: `${s.name} Ranger Station`, x: (s.x + s.w - 5.5) * TILE, y: (s.y + s.h - 0.4) * TILE, r: 40, b: m.buildings.length - 1 });
    H.simpleBuilding(m, s.x + 3, s.y + s.h - 4, 4, 3, 'Restrooms', 'restrooms', d, 'tile');
    for (const dx of [-4, 4]) H.addProp(m, 'lamp', (mid + dx) * TILE, (s.y + s.h - 0.6) * TILE);
    // pitches in two rows inside the loop
    let k = 0;
    for (const py of [y0 + 2, y1 - 3]) for (let pxx = x0 + 3; pxx + 4 <= x1 - 1; pxx += 5, k++) {
      if (hs(s, k, 9) < 0.15) continue; // an empty pitch
      fill(m, pxx, py, 4, 3, T.DIRT);
      const v = Math.floor(hs(s, k, 10) * 3);
      H.addProp(m, 'tent', (pxx + 1.5) * TILE, (py + 1) * TILE, 12, { v });
      H.addProp(m, 'campfire', (pxx + 3.3) * TILE, (py + 2.3) * TILE, 0, { lit: hs(s, k, 11) < 0.75 });
      H.addProp(m, 'picnic', (pxx + 0.9) * TILE, (py + 2.6) * TILE, 8);
    }
    treesRound(m, s, H, (tx, ty) => ty >= s.y + s.h - 4);
    for (let n = 0; n < 6; n++) { const tx = x0 + 3 + Math.floor(hs(s, n, 12) * (x1 - x0 - 5)), ty = y0 + 5 + Math.floor(hs(s, n, 13) * 2); if (m.tiles[ty * MAP_W + tx] === T.GRASS) H.addProp(m, hs(s, n, 14) < 0.6 ? 'tree_b' : 'bush_c', px(tx), px(ty), 10); }
  },

  // a forecourt along the road: a quick stop, a diner and a filling station side by side
  stop(m, s, H) {
    fill(m, s.x, s.y, s.w, s.h, T.GRASS);
    const apron = 4;
    fill(m, s.x, s.y + s.h - apron, s.w, apron, T.LOT);
    const row = { d: s.d, x: s.x, y: s.y, w: s.w, h: s.h - apron, face: 'S' };
    const r = () => 0.5;
    H.placePrefab(m, row, 'quickstop', s.x + 1, { biz: ['convenience'], names: [`${s.name} Quick Stop`] }, r);
    H.placePrefab(m, row, 'diner', s.x + 17, { biz: ['delivery'], names: [`${s.name} Diner`] }, r);
    H.placePrefab(m, row, 'gas', s.x + 32, { biz: ['delivery'], names: [`${s.name} Fuel`] }, r);
    for (let k = 0; k < 6; k++) m.parking.push({ x: (s.x + 4 + k * 7.4) * TILE, y: (s.y + s.h - 1.6) * TILE, a: -Math.PI / 2, drive: true });
    for (const fx of [0.02, 0.36, 0.66, 0.98]) H.addProp(m, 'lamp', (s.x + s.w * fx) * TILE, (s.y + s.h - 0.5) * TILE);
    H.addProp(m, 'billboard', (s.x + s.w * 0.5) * TILE, (s.y + 1.4) * TILE, 10, { ad: Math.floor(hs(s, 1, 20) * 6) });
    treesRound(m, s, H, (tx, ty) => ty >= s.y + 2);
  },

  // a lattice mast on a fenced pad, a hut for the transmitter
  mast(m, s, H) {
    fill(m, s.x, s.y, s.w, s.h, T.GRASS);
    fill(m, s.x + 1, s.y + 1, s.w - 2, s.h - 2, T.DIRT);
    gateway(m, s, T.DIRT);
    H.addProp(m, 'radiotower', (s.x + s.w / 2) * TILE, (s.y + s.h / 2 - 0.5) * TILE, 14);
    H.simpleBuilding(m, s.x + 1, s.y + s.h - 4, 3, 2, 'Transmitter Hut', 'hut', s.d, 'metal');
    H.addProp(m, 'acunit', (s.x + s.w - 2.5) * TILE, (s.y + s.h - 2.5) * TILE, 10);
  },

  // a terraced pit (render/country.js draws it), spoil heaps, the site office and the haul trucks
  quarry(m, s, H) {
    fill(m, s.x, s.y, s.w, s.h, T.DIRT);
    const pit = { x: (s.x + 4) * TILE, y: (s.y + 2) * TILE, w: (s.w - 8) * TILE, h: (s.h - 9) * TILE };
    m.quarries.push(pit);
    H.simpleBuilding(m, s.x + 2, s.y + s.h - 6, 7, 4, `${s.name} Office`, 'office', s.d, 'metal', { x: (s.x + 5.5) * TILE, y: (s.y + s.h - 2.2) * TILE, text: s.name });
    m.pois.push({ id: m.pois.length, kind: 'delivery', label: `${s.name} Office`, x: (s.x + 5.5) * TILE, y: (s.y + s.h - 1.4) * TILE, r: 40, b: m.buildings.length - 1 });
    for (let k = 0; k < 4; k++) m.parking.push({ x: (s.x + s.w - 14 + k * 3.2) * TILE, y: (s.y + s.h - 3) * TILE, a: -Math.PI / 2, drive: true });
    for (let k = 0; k < 14; k++) {
      // round the rim of the pit
      const a = hs(s, k, 30) * Math.PI * 2;
      const x = pit.x + pit.w / 2 + Math.cos(a) * (pit.w / 2 + 40), y = pit.y + pit.h / 2 + Math.sin(a) * (pit.h / 2 + 30);
      if (y > (s.y + s.h - 7) * TILE || x < (s.x + 1) * TILE || x > (s.x + s.w - 1) * TILE || y < (s.y + 0.5) * TILE) continue;
      const h = hs(s, k, 31);
      H.addProp(m, h < 0.45 ? 'gravel' : 'boulder', x, y, h < 0.45 ? 0 : 14);
    }
    for (const [fx, t] of [[0.62, 'cone'], [0.66, 'cone'], [0.7, 'cone'], [0.4, 'drum'], [0.43, 'tires']]) H.addProp(m, t, (s.x + s.w * fx) * TILE, (s.y + s.h - 6.5) * TILE, t === 'cone' ? 0 : 9);
    H.addProp(m, 'lamp', (s.x + 10) * TILE, (s.y + s.h - 1) * TILE);
  },

  // the domed observatory on the summit (one big prop on a solid footprint), a car park, viewers
  observatory(m, s, H) {
    fill(m, s.x, s.y, s.w, s.h, T.GRASS);
    fill(m, s.x + 3, s.y + 2, s.w - 6, s.h - 6, T.PLAZA);
    fill(m, s.x + 3, s.y + s.h - 4, s.w - 6, 4, T.LOT);
    const cx = s.x + s.w / 2;
    fill(m, Math.floor(cx) - 2, s.y + 3, 5, 3, T.WALL);
    H.addProp(m, 'dome', cx * TILE, (s.y + 6) * TILE, 0);
    for (let k = 0; k < 4; k++) m.parking.push({ x: (s.x + 5 + k * 3.4) * TILE, y: (s.y + s.h - 2) * TILE, a: -Math.PI / 2, drive: true });
    H.addProp(m, 'scope', (s.x + 4) * TILE, (s.y + 2.6) * TILE, 6);
    H.addProp(m, 'scope', (s.x + s.w - 4) * TILE, (s.y + 2.6) * TILE, 6);
    H.addProp(m, 'bench_m', (s.x + 5) * TILE, (s.y + 9) * TILE, 0);
    H.addProp(m, 'bench_m', (s.x + s.w - 5) * TILE, (s.y + 9) * TILE, 0);
    for (const fx of [0.2, 0.8]) H.addProp(m, 'lamp', (s.x + s.w * fx) * TILE, (s.y + s.h - 4.3) * TILE);
    m.pois.push({ id: m.pois.length, kind: 'delivery', label: s.name, x: cx * TILE, y: (s.y + 8.8) * TILE, r: 44 });
  },

  // turbines on pads along service tracks
  wind(m, s, H) {
    fill(m, s.x, s.y, s.w, s.h, T.GRASS);
    const mid = s.x + (s.w >> 1);
    fill(m, mid - 1, s.y + 2, 2, s.h - 2, T.DIRT);
    const cols = Math.max(1, Math.floor((s.w - 4) / 11)), rows = Math.max(1, Math.floor((s.h - 4) / 12));
    let k = 0;
    for (let j = 0; j < rows; j++) {
      const ty = s.y + 4 + j * 12 + (rows === 1 ? Math.floor((s.h - 8) / 2) : 0);
      fill(m, s.x + 3, ty + 2, s.w - 6, 2, T.DIRT);
      for (let i = 0; i < cols; i++, k++) {
        const tx = s.x + 3 + Math.floor((i + 0.5) * (s.w - 6) / cols);
        fill(m, tx - 1, ty - 1, 3, 3, T.DIRT);
        H.addProp(m, 'turbine', px(tx), px(ty), 10, { ph: hs(s, k, 40) });
      }
    }
  },

  // nodding donkeys on their pads, the tank farm and a flare stack by the gate, the company office
  oil(m, s, H) {
    fill(m, s.x, s.y, s.w, s.h, T.DIRT);
    const mid = s.x + (s.w >> 1);
    let k = 0;
    for (let ty = s.y + 4; ty < s.y + s.h - 14; ty += 10) for (let tx = s.x + 5; tx < s.x + s.w - 4; tx += 11, k++) {
      const jx = tx + Math.floor(hs(s, k, 50) * 4) - 2, jy = ty + Math.floor(hs(s, k, 51) * 3) - 1;
      if (hs(s, k, 52) < 0.15) continue;
      fill(m, jx - 3, jy - 2, 7, 4, T.DIRT);
      H.addProp(m, 'pumpjack', px(jx), px(jy), 30, { ph: hs(s, k, 53) });
      if (hs(s, k, 54) < 0.4) H.addProp(m, 'drum', px(jx + 4), px(jy + 1), 9);
    }
    // the tank farm and the office by the gate
    fill(m, s.x + 2, s.y + s.h - 12, 18, 10, T.LOT);
    for (let i = 0; i < 3; i++) H.addProp(m, 'otank', (s.x + 5 + i * 5.4) * TILE, (s.y + s.h - 7) * TILE, 44);
    H.addProp(m, 'pipes', (s.x + 10) * TILE, (s.y + s.h - 3.2) * TILE, 0);
    H.addProp(m, 'flare', (s.x + 21.5) * TILE, (s.y + s.h - 9) * TILE, 8);
    H.simpleBuilding(m, mid + 4, s.y + s.h - 7, 8, 4, 'Dry Creek Oil Co.', 'office', s.d, 'metal', { x: (mid + 8) * TILE, y: (s.y + s.h - 3.2) * TILE, text: 'Dry Creek Oil Co.' });
    m.pois.push({ id: m.pois.length, kind: 'delivery', label: 'Dry Creek Oil Co.', x: (mid + 8) * TILE, y: (s.y + s.h - 2.4) * TILE, r: 40, b: m.buildings.length - 1 });
    for (let k2 = 0; k2 < 3; k2++) m.parking.push({ x: (mid + 14 + k2 * 3.2) * TILE, y: (s.y + s.h - 4.5) * TILE, a: -Math.PI / 2, drive: true });
    H.addProp(m, 'lamp', (mid - 3) * TILE, (s.y + s.h - 1) * TILE);
  },

  // rows of panels, a track down the middle, inverters at the row ends
  solar(m, s, H) {
    fill(m, s.x, s.y, s.w, s.h, T.GRASS);
    const mid = s.x + (s.w >> 1);
    fill(m, mid - 1, s.y + 1, 2, s.h - 1, T.DIRT);
    fill(m, s.x + 1, s.y + s.h - 3, s.w - 2, 2, T.DIRT);
    for (let ty = s.y + 2; ty < s.y + s.h - 4; ty += 3) {
      for (let tx = s.x + 2; tx + 2 <= s.x + s.w - 1; tx += 2) {
        if (tx >= mid - 2 && tx <= mid + 1) continue;
        H.addProp(m, 'solar', (tx + 1) * TILE, (ty + 0.6) * TILE, 0);
      }
      H.addProp(m, 'acunit', (mid) * TILE, (ty + 1) * TILE, 0);
    }
  },

  // the screen, rows of speaker posts to park beside, the snack bar and the marquee at the gate
  drivein(m, s, H) {
    fill(m, s.x, s.y, s.w, s.h, T.LOT);
    const cx = s.x + s.w / 2;
    H.addProp(m, 'dscreen', cx * TILE, (s.y + 4) * TILE, 0);
    fill(m, Math.floor(cx) - 4, s.y + 3, 8, 1, T.WALL);
    let k = 0;
    for (let r = 0; r < 4; r++) {
      const yy = s.y + 9 + r * 4;
      for (let xx = s.x + 4; xx <= s.x + s.w - 4; xx += 3.5, k++) {
        const bow = ((xx - cx) / (s.w / 2)) ** 2 * 2.2; // the rows curve round to face the screen
        const y = (yy - bow) * TILE;
        H.addProp(m, 'dspeaker', xx * TILE, y, 4);
        if (Math.abs(xx - cx) > 2) m.parking.push({ x: (xx + 1.6) * TILE, y: y + 18, a: -Math.PI / 2, drive: true });
      }
    }
    H.simpleBuilding(m, Math.floor(cx) - 3, s.y + s.h - 7, 6, 4, `${s.name} Snack Bar`, 'snackbar', s.d, 'tile', { x: cx * TILE, y: (s.y + s.h - 3.2) * TILE, text: 'Snack Bar' });
    m.pois.push({ id: m.pois.length, kind: 'delivery', label: `${s.name} Snack Bar`, x: cx * TILE, y: (s.y + s.h - 2.4) * TILE, r: 40, b: m.buildings.length - 1 });
    H.addProp(m, 'marquee', (cx + 6) * TILE, (s.y + s.h - 1.4) * TILE, 8);
    for (const fx of [0.05, 0.95]) H.addProp(m, 'lamp', (s.x + s.w * fx) * TILE, (s.y + s.h - 1) * TILE);
  },

  // an oval of asphalt (render/country.js paints the kerbs and the start line), the grandstand
  // along the back straight and the pit garages
  raceway(m, s, H) {
    fill(m, s.x, s.y, s.w, s.h, T.GRASS);
    const ox = s.x + 2, oy = s.y + 6, ow = s.w - 4, oh = s.h - 10;
    const track = { x: ox * TILE, y: oy * TILE, w: ow * TILE, h: oh * TILE, band: 5 * TILE };
    m.raceways.push(track);
    // the band between the outer and inner stadium shapes is drivable asphalt
    const inStadium = (tx, ty, x, y, w, h) => {
      const r = h / 2, cx0 = x + r, cx1 = x + w - r, cy = y + r;
      const qx = tx < cx0 ? cx0 : tx > cx1 ? cx1 : tx;
      return Math.hypot(tx - qx, ty - cy) <= r;
    };
    for (let ty = oy; ty < oy + oh; ty++) for (let tx = ox; tx < ox + ow; tx++) {
      const cxp = tx + 0.5, cyp = ty + 0.5;
      if (inStadium(cxp, cyp, ox, oy, ow, oh) && !inStadium(cxp, cyp, ox + 5, oy + 5, ow - 10, oh - 10)) m.set(tx, ty, T.LOT);
    }
    // the way in from the gate to the track, and the paddock
    const mid = s.x + (s.w >> 1);
    fill(m, mid - 2, oy + oh - 2, 4, s.y + s.h - (oy + oh) + 2, T.LOT);
    H.simpleBuilding(m, mid - 14, s.y + 1, 28, 4, 'Grandstand', 'grandstand', s.d, 'metal', { x: mid * TILE, y: (s.y + 4.8) * TILE, text: s.name });
    m.pois.push({ id: m.pois.length, kind: 'delivery', label: s.name, x: mid * TILE, y: (s.y + 5.6) * TILE, r: 44, b: m.buildings.length - 1 });
    fill(m, mid + 4, s.y + s.h - 4, 16, 4, T.LOT);
    H.simpleBuilding(m, mid + 5, s.y + s.h - 4, 14, 2, 'Pit Garages', 'pits', s.d, 'metal');
    for (let k = 0; k < 4; k++) m.parking.push({ x: (mid + 6.5 + k * 3.4) * TILE, y: (s.y + s.h - 1) * TILE, a: -Math.PI / 2, drive: true });
    for (const fx of [0.12, 0.88]) H.addProp(m, 'lamp', (s.x + s.w * fx) * TILE, (s.y + 5.4) * TILE);
    for (let k = 0; k < 5; k++) H.addProp(m, 'tires', (ox + 12 + k * ((ow - 24) / 4)) * TILE, (oy + oh / 2) * TILE, 9);
  },
};

// ---- utility poles ---------------------------------------------------------------------------------
// Wooden poles along the country roads, each wired to the one before it (render draws the sagging
// wires between their tops). wildAt(tx, ty): open country, not town.
export function buildPowerLines(m, H, wildAt) {
  const W = MAP_W;
  const okGround = (tx, ty) => {
    if (tx < 1 || ty < 1 || tx >= W - 1 || ty >= MAP_H - 1) return false;
    const i = ty * W + tx, t = m.tiles[i];
    if (t !== T.GRASS && t !== T.DIRT && t !== T.SAND && t !== T.FIELD) return false;
    if (m.reserve[i] & (32 | 16 | 2) || m.deck[i] || !wildAt(tx, ty)) return false;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const q = m.tiles[i + dy * W + dx]; if (q === T.BUILDING || q === T.WALL || q === T.WATER || q === T.DEEP) return false; }
    return true;
  };
  for (const e of m.edges) {
    if (e.lvl !== 0 || !(e.kind === 'rural' || (e.kind === 'hwy' && !e.bridge))) continue;
    if (e.len < 30 * TILE) continue;
    const side = hash2(e.id, 3, 801) < 0.5 ? -1 : 1;
    const off = e.hw + 1.3 * TILE;
    let prev = null;
    for (let s = 3 * TILE; s < e.len - 3 * TILE; s += 9 * TILE) {
      const pt = pointAt(e.pts, s);
      const x = pt.x - pt.ty * off * side, y = pt.y + pt.tx * off * side;
      const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
      if (!okGround(tx, ty)) { prev = null; continue; }
      const p = H.addProp(m, 'upole', x, y, 5);
      if (prev && Math.hypot(prev.x - x, prev.y - y) < 11 * TILE) { p.wx = prev.x; p.wy = prev.y; }
      prev = p;
    }
  }
}


// Runway lights: white edge lights down both sides, green at the threshold, red at the far end,
// blue along the taxiway (they come on at dusk).
export function runwayLights(m, H) {
  for (const ap of m.airports || []) {
    const r = ap.runway, t = ap.taxi;
    for (let y = r.y + 40; y < r.y + r.h - 30; y += 5 * TILE) for (const x of [r.x + 4, r.x + r.w - 4]) H.addProp(m, 'rwlight', x, y, 0, { c: 'w' });
    for (let x = r.x + 10; x < r.x + r.w - 6; x += 22) { H.addProp(m, 'rwlight', x, r.y + 6, 0, { c: 'g' }); H.addProp(m, 'rwlight', x, r.y + r.h - 6, 0, { c: 'r' }); }
    for (let y = t.y + 40; y < t.y + t.h - 30; y += 7 * TILE) for (const x of [t.x + 3, t.x + t.w - 3]) H.addProp(m, 'rwlight', x, y, 0, { c: 'b' });
  }
}
