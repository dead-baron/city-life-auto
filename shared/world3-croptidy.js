// The stray crop scraps (the audit's cropInTown, 49 on 11-19 - "many are 1-30 tile scraps - the stray patch class"; the
// owner's 16:15 shot): a patch of crop field of at most SCRAP tiles in a town's or a city's district, or within
// CROP_BEACH tiles of a beach district's sand, goes back to grass, its crop strips and vine rows with it. The big fields
// the rule also counts (Gull Harbor's farms inside its district's line, 2,000+ tiles each) and the orchards by the beach
// are left: whole farms are the owner's call. The lint counts by the same test (cropWhy).
// For the whole-world build's done hook (shared/world3-world.js).
//   cropScraps3(m) -> { patches, tiles }
import { TILE, T } from './constants.js';
import { dropProps } from './world3-tidy.js';

export const FARM_STYLES = new Set(['rural', 'wild', 'desert', 'rocky', 'farm', 'forest', 'mountain']);
export const CROP_BEACH = 6, SCRAP = 40;

// why a crop at (x, y) is out of place: in a town's or city's district, or by a beach - else null
export function cropWhy(m, x, y) {
  const D = m.districtAt(x, y);
  // (a beach town's district may hold farms well back from the sand - the owner, 11-22 16:45: "get the farm away from
  // the beach": by the sand is what counts there)
  if (D && !FARM_STYLES.has(D.style) && D.style !== 'beach') return `in ${D.name} (${D.style})`;
  return byBeach(m, x, y) ? 'by a beach' : null;
}
// within CROP_BEACH tiles of a beach district's sand
export function byBeach(m, x, y) {
  const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
  for (let j = -CROP_BEACH; j <= CROP_BEACH; j += 2) for (let i = -CROP_BEACH; i <= CROP_BEACH; i += 2) {
    const X = tx + i, Y = ty + j;
    if (!m.inside(X, Y) || m.tiles[m.idx(X, Y)] !== T.SAND) continue;
    const d = m.districtAt(X * TILE, Y * TILE);
    if (d && d.style === 'beach') return true;
  }
  return false;
}

// The farms back from the beach (the owner, 11-22 16:45: "We should get the farm away from the beach"): every crop field
// tile within CROP_BEACH tiles of a beach's sand goes back to grass, whatever the size of its field; each field's outline
// shrinks to what's left of it (its fence runs with it - shared/fences.js fieldRuns), a field with nothing left goes;
// the crop strips and vine rows on the grass go too, and an orchard by a beach goes.
//   farmsOffBeach3(m) -> { tiles, fields, gone, orchards }
export function farmsOffBeach3(m) {
  const out = { tiles: 0, fields: 0, gone: 0, orchards: 0 };
  if (!m.tiles || !m.districtAt) return out;
  const cleared = new Set();
  const near = (tx, ty) => byBeach(m, (tx + 0.5) * TILE, (ty + 0.5) * TILE);
  for (let ty = m.y0; ty < m.y0 + m.h; ty++) for (let tx = m.x0; tx < m.x0 + m.w; tx++) {
    const i = m.idx(tx, ty);
    if (m.tiles[i] !== T.FIELD || !near(tx, ty)) continue;
    m.tiles[i] = T.GRASS; cleared.add(tx * 65536 + ty); out.tiles++;
  }
  if (!out.tiles && !(m.orchards || []).length) return out;
  if (m.fields && out.tiles) {
    const keep = [];
    for (const f of m.fields) {
      if (!f) continue;
      const tx0 = Math.floor(f.x / TILE), ty0 = Math.floor(f.y / TILE), tx1 = Math.ceil((f.x + f.w) / TILE) - 1, ty1 = Math.ceil((f.y + f.h) / TILE) - 1;
      let hit = false, x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      const share = new Map();   // (what's left, by district: the field keeps to the one most of it is in - squared at its edge)
      for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
        if (cleared.has(tx * 65536 + ty)) hit = true;
        if (m.inside(tx, ty) && m.tiles[m.idx(tx, ty)] === T.FIELD) { const d = m.dist[m.idx(tx, ty)]; share.set(d, (share.get(d) || 0) + 1); }
      }
      if (!hit) { keep.push(f); continue; }
      let main = -1, most = 0;
      for (const [d, n] of share) if (n > most) { most = n; main = d; }
      for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
        if (m.inside(tx, ty) && m.tiles[m.idx(tx, ty)] === T.FIELD && m.dist[m.idx(tx, ty)] === main) { x0 = Math.min(x0, tx); y0 = Math.min(y0, ty); x1 = Math.max(x1, tx); y1 = Math.max(y1, ty); }
      }
      if (x0 === Infinity) { out.gone++; continue; }
      // (and trimmed, an edge at a time - the one with the most of it - while another district's land is inside: the district
      // edge isn't straight, and a field squares at it - test/world3kestrel.test.js)
      const foreign = (ax0, ay0, ax1, ay1, side) => { let n = 0; const xs = side === 'w' ? [ax0, ax0] : side === 'e' ? [ax1, ax1] : [ax0, ax1], ys = side === 'n' ? [ay0, ay0] : side === 's' ? [ay1, ay1] : [ay0, ay1];
        for (let ty = ys[0]; ty <= ys[1]; ty++) for (let tx = xs[0]; tx <= xs[1]; tx++) { if (!m.inside(tx, ty)) continue; const i = m.idx(tx, ty); if (m.land[i] && m.dist[i] !== main) n++; } return n; };
      for (let k = 0; k < 400 && x0 <= x1 && y0 <= y1 && foreign(x0, y0, x1, y1, 'all') > 0; k++) {
        const c = [['w', foreign(x0, y0, x1, y1, 'w')], ['e', foreign(x0, y0, x1, y1, 'e')], ['n', foreign(x0, y0, x1, y1, 'n')], ['s', foreign(x0, y0, x1, y1, 's')]].sort((a, b) => b[1] - a[1])[0][0];
        if (c === 'w') x0++; else if (c === 'e') x1--; else if (c === 'n') y0++; else y1--;
      }
      if (x0 > x1 || y0 > y1) { out.gone++; continue; }
      const nx = Math.max(f.x, x0 * TILE), ny = Math.max(f.y, y0 * TILE), nx1 = Math.min(f.x + f.w, (x1 + 1) * TILE), ny1 = Math.min(f.y + f.h, (y1 + 1) * TILE);
      f.x = nx; f.y = ny; f.w = nx1 - nx; f.h = ny1 - ny;
      if (Array.isArray(f.fence)) f.fence = f.fence.map(([a, b]) => [Math.max(a, nx - 10), Math.min(b, nx1 + 10)]).filter(([a, b]) => b - a >= 48);
      keep.push(f); out.fields++;
    }
    m.fields = keep;
  }
  if (m.orchards) { const n0 = m.orchards.length; m.orchards = m.orchards.filter((o) => !byBeach(m, o.x + o.w / 2, o.y + o.h / 2)); out.orchards = n0 - m.orchards.length; }
  const gone = new Set();
  for (const p of m.props) if (p && (p.t === 'cropstrip' || p.t === 'vinerow' || p.t === 'crop') && cleared.has(Math.floor(p.x / TILE) * 65536 + Math.floor(p.y / TILE))) gone.add(p);
  if (gone.size) dropProps(m, gone);
  return out;
}

// The planted rows off the shore (the art pass, 11-24: three rows of sunflowers on a cobble point with the sea a tile
// off, lavender on a beach - the rows are planted before the coasts are shaped, and farmsOffBeach3 knows a beach by its
// district): a crop strip or an orchard row keeps SHORE_R tiles off any sand and off the sea (a lake's or a river's
// bank is a farm's own). A strip (m.orchards, rows along x) is cut back to its longest stretch that does; under
// SHORE_MIN tiles of it left, it goes. Its plants go with the ground they lose.
//   stripsOffShore3(m) -> { strips (looked at), trimmed, gone, plants }
export const SHORE_R = 3, SHORE_MIN = 6;
const ROW_SP = new Set(['lavender', 'sunflowers', 'apple', 'orange', 'lemon']);
export function stripsOffShore3(m) {
  const out = { strips: (m.orchards || []).length, trimmed: 0, gone: 0, plants: 0 };
  if (!m.tiles || !out.strips) return out;
  const memo = new Map();
  const shore = (tx, ty) => {
    const key = tx * 65536 + ty; let v = memo.get(key);
    if (v !== undefined) return v;
    v = false;
    for (let j = -SHORE_R; j <= SHORE_R && !v; j++) for (let i = -SHORE_R; i <= SHORE_R; i++) {
      const X = tx + i, Y = ty + j;
      if (!m.inside(X, Y)) continue;
      const q = m.idx(X, Y), t = m.tiles[q];
      if (t === T.SAND || ((t === T.WATER || t === T.DEEP) && !(m.lake && m.lake[q]) && !(m.river && m.river[q]))) { v = true; break; }
    }
    memo.set(key, v); return v;
  };
  const keep = [], cuts = [];   // (cuts: [x0, y0, x1, y1] px of ground a strip lost)
  for (const o of m.orchards) {
    const x0 = Math.floor(o.x / TILE), y0 = Math.floor(o.y / TILE), x1 = Math.ceil((o.x + o.w) / TILE) - 1, y1 = Math.ceil((o.y + o.h) / TILE) - 1;
    let a = -1, best = [0, -1], any = false;
    for (let tx = x0; tx <= x1 + 1; tx++) {
      let bad = tx > x1;
      for (let ty = y0; ty <= y1 && !bad; ty++) bad = shore(tx, ty);
      if (bad && tx <= x1) any = true;
      if (!bad) { if (a < 0) a = tx; } else { if (a >= 0 && tx - a > best[1] - best[0] + 1) best = [a, tx - 1]; a = -1; }
    }
    if (!any) { keep.push(o); continue; }
    if (best[1] - best[0] + 1 < SHORE_MIN) { out.gone++; cuts.push([o.x, o.y, o.x + o.w, o.y + o.h]); continue; }
    const nx0 = Math.max(o.x, best[0] * TILE), nx1 = Math.min(o.x + o.w, (best[1] + 1) * TILE);
    if (nx0 > o.x) cuts.push([o.x, o.y, nx0, o.y + o.h]);
    if (nx1 < o.x + o.w) cuts.push([nx1, o.y, o.x + o.w, o.y + o.h]);
    o.x = nx0; o.w = nx1 - nx0; keep.push(o); out.trimmed++;
  }
  m.orchards = keep;
  if (cuts.length) {
    const gone = new Set();
    for (const p of m.props) { if (!p || !ROW_SP.has(p.sp)) continue; for (const [cx0, cy0, cx1, cy1] of cuts) if (p.x >= cx0 && p.x < cx1 && p.y >= cy0 && p.y < cy1) { gone.add(p); break; } }
    out.plants = gone.size;
    if (gone.size) dropProps(m, gone);
  }
  return out;
}

export function cropScraps3(m) {
  const out = { patches: 0, tiles: 0 };
  if (!m.tiles || !m.districtAt) return out;
  const seen = new Uint8Array(m.tiles.length), gone = new Set();
  for (let ty = m.y0; ty < m.y0 + m.h; ty++) for (let tx = m.x0; tx < m.x0 + m.w; tx++) {
    const i0 = m.idx(tx, ty);
    if (seen[i0] || m.tiles[i0] !== T.FIELD) continue;
    const q = [tx, ty]; seen[i0] = 1;
    let wy = null;
    for (let h = 0; h < q.length; h += 2) {
      const x = q[h], y = q[h + 1];
      if (!wy) wy = cropWhy(m, (x + 0.5) * TILE, (y + 0.5) * TILE);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (!m.inside(nx, ny)) continue; const j = m.idx(nx, ny); if (!seen[j] && m.tiles[j] === T.FIELD) { seen[j] = 1; q.push(nx, ny); } }
    }
    const n = q.length / 2;
    if (!wy || n > SCRAP) continue;
    out.patches++; out.tiles += n;
    const cell = new Set();
    for (let h = 0; h < q.length; h += 2) { m.tiles[m.idx(q[h], q[h + 1])] = T.GRASS; cell.add(q[h] * 65536 + q[h + 1]); }
    for (const p of m.props) if (p && (p.t === 'cropstrip' || p.t === 'vinerow' || p.t === 'crop') && cell.has(Math.floor(p.x / TILE) * 65536 + Math.floor(p.y / TILE))) gone.add(p);
    if (m.fields) m.fields = m.fields.filter((f) => !(f && cell.has(Math.floor((f.x + f.w / 2) / TILE) * 65536 + Math.floor((f.y + f.h / 2) / TILE))));
  }
  if (gone.size) dropProps(m, gone);
  return out;
}
