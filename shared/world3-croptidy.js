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
  if (D && !FARM_STYLES.has(D.style)) return `in ${D.name} (${D.style})`;
  const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
  for (let j = -CROP_BEACH; j <= CROP_BEACH; j += 2) for (let i = -CROP_BEACH; i <= CROP_BEACH; i += 2) {
    const X = tx + i, Y = ty + j;
    if (!m.inside(X, Y) || m.tiles[m.idx(X, Y)] !== T.SAND) continue;
    const d = m.districtAt(X * TILE, Y * TILE);
    if (d && d.style === 'beach') return 'by a beach';
  }
  return null;
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
