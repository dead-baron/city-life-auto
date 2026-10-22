// Every waterway to the sea (the owner, 2026-10-21: "Noticed not all waterways are connecting to the ocean", Kestrel
// Lake's channel north stopping short of the North Coast Road's bridge - a strip of sand and the road's south pavement
// between it and the sea under the bridge). World v3's rivers were joined to the sea when they were laid
// (world3-land.js); a lake's channel, or a river's end dressed afterwards (a beach, a road's pavement laid across it),
// can still stop a few tiles short of the sea it runs to. This finds each place where a river's or a lake's water (not
// a pond's: a pond is still water with no way out) comes within a few tiles of the sea without meeting it anywhere near
// there, and cuts the gap through: the open ground between the two waters becomes water, as wide as they face each
// other, and a road or its pavement across the gap becomes bridge (the bake decks a road over water, its pavements
// too). For the whole-world build only (shared/world3-world.js's done hook, after the water bodies). Deterministic:
// integer arithmetic.
import { T, TILE } from './constants.js';

// gap: tiles of land between the two waters at the most; meet: a place where the two already meet this near (tiles)
// needs no cut; band: how far off the shortest way across a tile may lie and still be cut (tiles: the channel's width);
// most: tiles one cut may take at the most (a long beach between a lagoon and the sea is a beach, not a gap)
export const OUTLET3 = { gap: 10, meet: 16, band: 1, most: 320 };

const CUT = new Set([T.SAND, T.GRASS, T.DIRT, T.SIDEWALK, T.ROAD]);

export function waterOutlets3(m, H3) {
  const out = { places: 0, cut: [], left: [] };   // (left: a place it looked at and didn't cut, and why)
  if (!m.distSea) return out;
  const W = m.w, H = m.h, N = W * H, S = OUTLET3;
  const wet = (i) => m.tiles[i] === T.WATER || m.tiles[i] === T.DEEP || m.tiles[i] === T.BRIDGE;
  const sea = (i) => wet(i) && !m.land[i] && !(m.lake && m.lake[i]) && !(m.river && m.river[i]);
  const inland = (i) => wet(i) && ((m.river && m.river[i]) || (m.lake && m.lake[i] === 1));
  const nb = (i, f) => { const x = i % W; if (x > 0) f(i - 1); if (x < W - 1) f(i + 1); if (i >= W) f(i - W); if (i < N - W) f(i + W); };
  // the river and lake water near the sea (m.distSea: a quarter-tile chamfer from the land's first sea)
  const lim = Math.min(255, (S.gap + 3) * 4), seeds = [];
  for (let i = 0; i < N; i++) if (m.distSea[i] <= lim && inland(i)) seeds.push(i);
  const done = new Uint8Array(seeds.length), R = S.gap + S.meet;
  for (let a = 0; a < seeds.length; a++) {
    if (done[a]) continue;
    const ax = seeds[a] % W, ay = (seeds[a] - ax) / W;
    // this place's water near the sea: the seeds round it
    const here = [];
    for (let b = a; b < seeds.length; b++) {
      const bx = seeds[b] % W, by = (seeds[b] - bx) / W;
      if (by - ay > 2 * R) break;
      if (!done[b] && Math.abs(bx - ax) <= R && by - ay <= R) { done[b] = 1; here.push(seeds[b]); }
    }
    // where the two already meet near here (a river's mouth): nothing to cut
    let meets = false;
    for (const i of here) { nb(i, (j) => { if (sea(j)) meets = true; }); if (meets) break; }
    if (!meets) {
      const x0 = Math.max(0, ax - R - S.meet), x1 = Math.min(W - 1, ax + R + S.meet), y0 = Math.max(0, ay - S.meet), y1 = Math.min(H - 1, ay + 2 * R + S.meet);
      for (let y = y0; y <= y1 && !meets; y++) for (let x = x0; x <= x1; x++) { const i = y * W + x; if (inland(i)) { nb(i, (j) => { if (sea(j)) meets = true; }); if (meets) break; } }
    }
    if (meets) continue;
    out.places++;
    // the land round this water out to gap tiles: how far each tile is from it, through ground that can be cut
    const dB = new Map(), q = [];
    for (const i of here) nb(i, (j) => { if (!dB.has(j) && !wet(j) && CUT.has(m.tiles[j])) { dB.set(j, 1); q.push(j); } });
    let hit = -1;
    for (let h = 0; h < q.length && hit < 0; h++) {
      const i = q[h], d = dB.get(i);
      nb(i, (j) => { if (hit >= 0) return; if (sea(j)) { hit = i; return; } if (d < S.gap && !dB.has(j) && !wet(j) && CUT.has(m.tiles[j])) { dB.set(j, d + 1); q.push(j); } });
    }
    if (hit < 0) { out.left.push({ x: ax, y: ay, why: 'no way across' }); continue; }
    const L = dB.get(hit);
    // the sea's side: how far each of those tiles is from the sea, the same way
    const dS = new Map(), q2 = [];
    for (const i of dB.keys()) { let s = false; nb(i, (j) => { if (sea(j)) s = true; }); if (s) { dS.set(i, 1); q2.push(i); } }
    for (let h = 0; h < q2.length; h++) { const i = q2[h], d = dS.get(i); nb(i, (j) => { if (dB.has(j) && !dS.has(j)) { dS.set(j, d + 1); q2.push(j); } }); }
    // the cut: every tile on a way across no longer than the shortest by `band`
    const cut = [...dB.keys()].filter((i) => dS.has(i) && dB.get(i) + dS.get(i) - 1 <= L + S.band);
    if (!cut.length || cut.length > S.most) { out.left.push({ x: ax, y: ay, why: `too wide (${cut.length})` }); continue; }
    // a pavement is cut only where its road goes over too (a bridge's deck carries its pavements; a pavement alone over
    // water would be a hole in the street): a bridge already there, or a road in the cut
    const roadCut = new Set(cut.filter((i) => m.tiles[i] === T.ROAD));
    const decked = (i) => { const x = i % W, y = (i - x) / W; for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) { const X = x + dx, Y = y + dy; if (X < 0 || Y < 0 || X >= W || Y >= H) continue; const j = Y * W + X; if (m.tiles[j] === T.BRIDGE || roadCut.has(j)) return true; } return false; };
    if (cut.some((i) => m.tiles[i] === T.SIDEWALK && !decked(i))) { out.left.push({ x: ax, y: ay, why: 'a pavement with no road over' }); continue; }
    // the water of the place it comes from: a river's, or a lake's
    let rivers = 0;
    for (const i of here) if (m.river && m.river[i]) rivers++;
    const asRiver = rivers * 2 >= here.length, lakeV = m.lake ? m.lake[here[0]] : 0;   // (Kestrel Lake's reach carries both)
    for (const i of cut) {
      const t = m.tiles[i];
      m.tiles[i] = t === T.ROAD || t === T.SIDEWALK ? T.BRIDGE : T.WATER;
      m.land[i] = 0;
      if (m.river) m.river[i] = asRiver ? 1 : 0;
      if (m.lake) m.lake[i] = lakeV;
      if (m.reserve) m.reserve[i] &= ~(128 | 64 | 32);
    }
    if (H3 && H3.removeProps) { const gone = new Set(cut); H3.removeProps(m, (px, py) => gone.has(Math.floor(py / TILE) * W + Math.floor(px / TILE))); }   // (what stood on the ground cut away)
    const x = hit % W, y = (hit - x) / W;
    out.cut.push({ x, y, tiles: cut.length, gap: L, bridged: cut.filter((i) => m.tiles[i] === T.BRIDGE).length, kind: lakeV ? 'lake' : 'river' });
  }
  return out;
}
