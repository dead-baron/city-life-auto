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
      for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
        if (cleared.has(tx * 65536 + ty)) hit = true;
        if (m.inside(tx, ty) && m.tiles[m.idx(tx, ty)] === T.FIELD) { x0 = Math.min(x0, tx); y0 = Math.min(y0, ty); x1 = Math.max(x1, tx); y1 = Math.max(y1, ty); }
      }
      if (!hit) { keep.push(f); continue; }
      if (x0 === Infinity) { out.gone++; continue; }
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
