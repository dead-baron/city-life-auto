// Showers round the world (nat5, the owner 2026-10-31: "Also can we add a few more bath houses and showers into the
// world?"): an outdoor shower - the post, its head, the slatted footboard (client/art2/props-wild.js beachShower) - on
// every public beach that has none (where you step onto the sand from the path or the grass behind it), a shower block -
// a timber hut of stalls under one roof, its sign (props-wild.js showerHut) - at each campground, and a pair of showers
// by the public pools and the water park's slides. Each one works (server/systems/showers.js: the wash, a little health),
// as the beaches' and the boardwalk's already do. For the whole-world build only (shared/world3-world.js's done hook,
// before the clutter and the tidy passes look the props over); the generator: never on the page.
import { TILE, T } from './constants.js';

export const SHOWERS3 = {
  beach: ['beach', 'cove', 'bonfire', 'wreck'],   // (the landmarks that are beaches: their types)
  camp: ['camp'], campSites: ['lakecamp', 'desertcamp', 'camp'],   // (the campgrounds: landmarks, and nature sites)
  pools: ['pool', 'waterpark'],   // (the public pools and the water park: nature sites)
  near: 10,   // (a beach with a shower this many tiles past its box keeps it)
  perTiles: 70,   // (a long beach: another shower every so many tiles along it)
};
const LAND = new Set([T.GRASS, T.DIRT, T.PLAZA, T.SIDEWALK, T.DOCK, T.LOT]);
const hh = (a, b, s) => { let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(s | 0, 2246822519); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

export function outdoorShowers3(m, H3) {
  const out = { beach: [], camp: [], pool: [] };
  if (!H3 || !H3.addProp) return out;
  const W = m.w, HH = m.h, S = SHOWERS3;
  const at = (x, y) => (x >= 0 && y >= 0 && x < W && y < HH ? m.tiles[y * W + x] : -1);
  // the tiles something already stands on (a prop within a tile of it), the showers there are
  const taken = new Set(), showers = [];
  for (const p of m.props || []) {
    if (!p) continue;
    const tx = Math.floor(p.x / TILE), ty = Math.floor(p.y / TILE);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) taken.add((ty + dy) * W + tx + dx);
    if (p.t === 'shower' || p.t === 'showerhut') showers.push(p);
  }
  const free = (x, y, r = 0) => { for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const i = (y + dy) * W + x + dx; if (taken.has(i) || (m.bld && m.bld[i] >= 0) || (m.solidProps && m.solidProps.has(i))) return false; } return true; };
  const put = (t, x, y, r, list, name) => {
    H3.addProp(m, t, Math.round((x + 0.5) * TILE), Math.round((y + 0.5) * TILE), r);
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) taken.add((y + dy) * W + x + dx);
    const e = { t, x: (x + 0.5) * TILE, y: (y + 0.5) * TILE };
    showers.push(e); list.push({ name, tx: x, ty: y });
  };
  const hasNear = (x0, y0, x1, y1) => showers.some((p) => p.x >= x0 * TILE && p.x < x1 * TILE && p.y >= y0 * TILE && p.y < y1 * TILE);
  // the beaches: on the sand, a step from the dry ground behind it (a path, the grass, the boardwalk), along the beach
  for (const L of m.landmarks || []) {
    if (!S.beach.includes(L.type)) continue;
    const x0 = Math.floor(L.x / TILE), y0 = Math.floor(L.y / TILE), x1 = Math.ceil((L.x + L.w) / TILE), y1 = Math.ceil((L.y + L.h) / TILE);
    if (hasNear(x0 - S.near, y0 - S.near, x1 + S.near, y1 + S.near)) continue;
    const n = Math.max(1, Math.min(3, Math.round((x1 - x0) / S.perTiles)));
    for (let k = 0; k < n; k++) {
      const cx = x0 + (x1 - x0) * (k + 0.5) / n, cy = (y0 + y1) / 2;
      let best = null, bs = Infinity;
      // (a narrow beach - a lagoon's strip of sand - has none clear of the water by two tiles: then one tile clear, then
      // the dry ground at its back, a few tiles round its box)
      for (let pass = 0; pass < 3 && !best; pass++) for (let y = y0 - (pass > 1 ? 3 : 0); y < y1 + (pass > 1 ? 3 : 0); y++) for (let x = x0 - (pass > 1 ? 3 : 0); x < x1 + (pass > 1 ? 3 : 0); x++) {
        const t0 = at(x, y);
        if ((pass < 2 ? t0 !== T.SAND : !(t0 === T.SAND || LAND.has(t0))) || !free(x, y, 1)) continue;
        let land = 0, wet = 0;
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const t = at(x + dx, y + dy); if (LAND.has(t) && Math.abs(dx) < 2 && Math.abs(dy) < 2) land++; if ((t === T.WATER || t === T.DEEP) && (pass === 0 || (Math.abs(dx) < 2 && Math.abs(dy) < 2))) wet++; }
        if (wet) continue;
        const sc = (land ? 0 : 40) + Math.abs(x - cx) * 2 + Math.abs(y - cy) * 0.5 + hh(x, y, 5301) * 3;   // (a step from the dry ground behind the beach, where there's one; else on the sand clear of the water)
        if (sc < bs) { bs = sc; best = [x, y]; }
      }
      if (best) put('shower', best[0], best[1], 6, out.beach, L.name);
    }
  }
  // the campgrounds: a shower block at the edge of each, on open ground beside the camp
  const camps = [];
  for (const L of m.landmarks || []) if (S.camp.includes(L.type)) camps.push({ name: L.name, x: (L.x + L.w / 2) / TILE, y: (L.y + L.h / 2) / TILE, r: Math.max(L.w, L.h) / 2 / TILE });
  for (const s of m.natureSites || []) if (S.campSites.includes(s.kind) && Number.isFinite(s.x) && !camps.some((c) => Math.hypot(c.x - s.x / TILE, c.y - s.y / TILE) < 40)) camps.push({ name: s.name, x: s.x / TILE, y: s.y / TILE, r: 10 });
  for (const c of camps) {
    if (showers.some((p) => Math.hypot(p.x / TILE - c.x, p.y / TILE - c.y) < c.r + 8)) continue;
    let best = null, bs = Infinity;
    const R = Math.round(c.r + 8);
    for (let y = Math.floor(c.y - R); y <= c.y + R; y++) for (let x = Math.floor(c.x - R); x <= c.x + R; x++) {
      const t = at(x, y);
      if ((t !== T.GRASS && t !== T.DIRT && t !== T.PLAZA) || !free(x, y, 1) || !free(x + 1, y, 1)) continue;
      let ok = true;
      for (let dy = -1; dy <= 1 && ok; dy++) for (let dx = -1; dx <= 2; dx++) { const u = at(x + dx, y + dy); if (u !== T.GRASS && u !== T.DIRT && u !== T.PLAZA) { ok = false; break; } }
      if (!ok) continue;
      const d = Math.hypot(x - c.x, y - c.y), sc = Math.abs(d - Math.max(4, c.r * 0.7)) + hh(x, y, 5302) * 2;
      if (sc < bs) { bs = sc; best = [x, y]; }
    }
    if (best) put('showerhut', best[0], best[1], 16, out.camp, c.name);
  }
  // the public pools and the water park: a pair of showers on the paving beside the water (the changing rooms' end)
  for (const s of m.natureSites || []) {
    if (!S.pools.includes(s.kind) || !Number.isFinite(s.x)) continue;
    const sx = s.x / TILE, sy = s.y / TILE;
    if (showers.some((p) => Math.hypot(p.x / TILE - sx, p.y / TILE - sy) < 20)) continue;
    const cands = [];
    for (let y = Math.floor(sy - 18); y <= sy + 18; y++) for (let x = Math.floor(sx - 22); x <= sx + 22; x++) {
      if (at(x, y) !== T.PLAZA || !free(x, y, 1)) continue;
      let wet = 0; for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) { const t = at(x + dx, y + dy); if (t === T.WATER || t === T.DEEP) wet++; }
      if (!wet || [[-1, 0], [1, 0], [0, -1], [0, 1]].some(([dx, dy]) => { const t = at(x + dx, y + dy); return t === T.WATER || t === T.DEEP; })) continue;
      cands.push([x, y, Math.hypot(x - sx, y - sy) + hh(x, y, 5303) * 4]);
    }
    cands.sort((a, b) => a[2] - b[2]);
    let n = 0;
    for (const [x, y] of cands) { if (n >= 2) break; if (!free(x, y, 1)) continue; put('shower', x, y, 6, out.pool, s.name); n++; }
  }
  return out;
}
