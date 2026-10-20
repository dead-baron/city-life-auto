// World v3's inland water as bodies (the water upgrade, 2026-10-18; docs/handcraft research, nature and water 2.3).
// Every inland water tile was river water (m.river) and nothing said which water it was: Kestrel Lake, the mountain
// lakes and every pool were drawn as rivers, and no river said which way it ran (the art drew its current along the
// screen's rows, and the light's chop made the glints streak north-east). This says, once the world is built:
// - m.waters (kept whole in the index: a few KB) - for the art (client/art2/water.js waterTiles / waterPx) and the systems that
//   ask what water a tile is:
//     ch: the channels, each { k, w, t, v, pts }: k 'creek' | 'river' | 'marsh' | 'lake' (a lake laid as a wide piece of
//         stream), w its width (tiles), t its setting ('alpine' | 'forest' | 'valley' | 'desert' | 'marsh': the water's
//         colour and clarity), v how fast it runs (0 still .. 1 a mountain creek), pts its centre line as the land
//         stamped it (shared/world3-land.js smoothPath), downstream: from its high end to its low (m.relief), else to
//         its end at the sea, else as it was traced;
//     lk: the lakes laid as polygons, each { k: 'lake' | 'pond', t, box } (Kestrel Lake, Greenfield Pond).
// - m.lake on their tiles: 1 a lake, 2 a pond (still, fresh water: the fishing, the wildlife, the art's LAKE and POND)
//   - the lakes laid as polygons or wide pieces, and the water dug on land (the parks' ponds, the nature sites' pools:
//   a pond, or a lake when over LAKE_TILES; their creeks keep running - m.flow).
// For the whole-world build only (shared/world3-world.js's done hook). Deterministic: arithmetic and sqrt.
import { T } from './constants.js';
import { STREAMS, RIVER, LAKES } from './world3-skeleton.js';
import { smoothPath, stampPath, scanPoly, smoothPoly, SMOOTH } from './world3-land.js';

// the wide pieces of stream that are lakes (the sketch drew them as blobs on its rivers), by their first point: the
// woods' lake above Silver Thread Falls (three pieces), the high tarn's two and the lake below it in Granite Peaks, the
// lake in the Pine Lake hills (two); and (the nature program, 2026-10-20: still water lies still) the wide reach between
// the high tarns' two (drawn as running river till then) and the broad pool on the river down toward Old Town
export const LAKE_PIECES = new Set(['1748,1088', '1796,1094', '1500,560', '1478,404', '1482,402', '1330,1364', '1202,1352', '1500,558', '2596,1628']);
// the Egret Coast's marsh: a channel whose middle is in this box (tiles) is a marsh channel (braided, slow, murky)
export const MARSH_BOX = [820, 1890, 1530, 3300];
// the desert's water from this column east (the Copper River, the canyon)
export const DESERT_X = 4250;
// a pond dug on land bigger than this (tiles) is a lake
export const LAKE_TILES = 1500;

const key = (p) => `${p[0]},${p[1]}`;
const len = (pts) => { let l = 0; for (let j = 1; j < pts.length; j++) { const dx = pts[j][0] - pts[j - 1][0], dy = pts[j][1] - pts[j - 1][1]; l += Math.sqrt(dx * dx + dy * dy); } return l; };
const r1 = (v) => Math.round(v * 10) / 10;

export function waterBodies3(m) {
  const W = m.w, H = m.h, N = W * H, relief = m.relief || null;
  const wet = (i) => m.tiles[i] === T.WATER || m.tiles[i] === T.DEEP || m.tiles[i] === T.BRIDGE;
  const under = (i) => wet(i) || (m.tiles[i] === T.DOCK && !m.land[i]);   // (a pier's deck over the water: the water under it is the lake's too)
  const at = (x, y) => { const tx = Math.round(x), ty = Math.round(y); return tx >= 0 && ty >= 0 && tx < W && ty < H ? ty * W + tx : -1; };
  const hAt = (p) => { const i = at(p[0], p[1]); if (!relief || i < 0) return 0; let s = 0, n = 0; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const j = at(p[0] + dx, p[1] + dy); if (j >= 0) { s += relief[j]; n++; } } return n ? s / n : 0; };   // (the relief is dithered: a 5 x 5 mean)
  // the sea near an end: open water that is neither a river's nor a lake's nor dug on land
  const seaNear = (p, r) => { for (let dy = -r; dy <= r; dy += 2) for (let dx = -r; dx <= r; dx += 2) { const i = at(p[0] + dx, p[1] + dy); if (i >= 0 && wet(i) && !m.land[i] && !m.river[i]) return true; } return false; };
  const out = { ch: [], lk: [] }, sum = { creek: 0, river: 0, marsh: 0, lake: 0, pond: 0, flowedBack: 0, lakeTiles: 0, pondTiles: 0 };
  for (const S of [RIVER, ...STREAMS].filter(Boolean)) {
    let pts = smoothPath(S).pts.map((p) => [r1(p[0]), r1(p[1])]);
    const L = len(pts), mid = pts[pts.length >> 1], w = S.width;
    const lake = LAKE_PIECES.has(key(S.first || S.pts[0])), marsh = !lake && mid[0] >= MARSH_BOX[0] && mid[0] <= MARSH_BOX[2] && mid[1] >= MARSH_BOX[1] && mid[1] <= MARSH_BOX[3];
    const ha = hAt(pts[0]), hb = hAt(pts[pts.length - 1]), drop = Math.abs(ha - hb);
    // downstream: downhill; on the flat, to the sea
    let flip = false;
    if (drop >= 2) flip = ha < hb;
    else { const sa = seaNear(pts[0], (w >> 1) + 6), sb = seaNear(pts[pts.length - 1], (w >> 1) + 6); if (sa && !sb) flip = true; }
    if (flip) { pts = pts.reverse(); sum.flowedBack++; }
    let hm = 0; for (let j = 0; j < pts.length; j += Math.max(1, pts.length >> 3)) hm = Math.max(hm, hAt(pts[j]));
    const k = lake ? 'lake' : marsh ? 'marsh' : S === RIVER || w >= 30 ? 'river' : 'creek';
    const t = marsh ? 'marsh' : hm >= 100 ? 'alpine' : mid[0] >= DESERT_X ? 'desert' : hm < 12 ? 'valley' : 'forest';
    const slope = L > 0 ? drop / L : 0;
    const v = k === 'lake' ? 0 : k === 'marsh' ? 0.12 : Math.min(1, Math.max(k === 'creek' ? 0.45 : 0.3, 0.3 + slope * 9));
    out.ch.push({ k, w, t, v: r1(v), pts });
    sum[k]++;
    if (lake) stampPath(pts, w / 2 + 1, W, H, (i) => { if (under(i) && m.river[i] && !m.lake[i]) { m.lake[i] = 1; sum.lakeTiles++; } });
  }
  // the lakes laid as polygons: Kestrel Lake (a lake) and Greenfield Pond (a pond, the park's)
  LAKES.forEach((Lk, n) => {
    const pond = /pond/i.test(Lk.name), v = pond ? 2 : 1, box = [1e9, 1e9, -1e9, -1e9];
    scanPoly(smoothPoly(Lk.poly, SMOOTH.lake), W, H, (y, a, b) => {
      for (let i = y * W + a, e = y * W + b; i < e; i++) if (under(i) && !m.land[i]) { m.lake[i] = v; sum[pond ? 'pondTiles' : 'lakeTiles']++; }
      box[0] = Math.min(box[0], a); box[1] = Math.min(box[1], y); box[2] = Math.max(box[2], b); box[3] = Math.max(box[3], y + 1);
    });
    // (what was dug into it since - a district's plan reshaping Greenfield Pond, Granite Cove's bay off Kestrel Lake - is
    // it too: its water joined to it, near it)
    if (box[2] > box[0]) {
      const pad = 24, x0 = Math.max(0, box[0] - pad), y0 = Math.max(0, box[1] - pad), x1 = Math.min(W, box[2] + pad), y1 = Math.min(H, box[3] + pad);
      const q = [];
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (m.lake[y * W + x] === v) q.push(y * W + x);
      for (let h = 0; h < q.length; h++) {
        const i = q[h], x = i % W, y = (i / W) | 0;
        for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
          if (nx < x0 || ny < y0 || nx >= x1 || ny >= y1) continue;
          const j = ny * W + nx;
          if (m.lake[j] || !under(j) || m.land[j] || !m.river[j]) continue;
          m.lake[j] = v; sum[pond ? 'pondTiles' : 'lakeTiles']++; q.push(j);
        }
      }
      out.lk.push({ k: pond ? 'pond' : 'lake', t: pond ? 'park' : 'valley', box: [x0, y0, x1, y1], name: Lk.name });
      sum[pond ? 'pond' : 'lake']++;
    }
  });
  // the water dug on land (the parks' ponds, the nature sites' pools and lakes): ponds, or lakes when big; a creek
  // that runs (m.flow) stays a creek
  const flow = m.flow || null, seen = new Uint8Array(N), st = [];
  for (let s = 0; s < N; s++) {
    if (seen[s] || !m.land[s] || !wet(s) || m.lake[s] || (flow && flow.has(s))) continue;
    const comp = [];
    seen[s] = 1; st.push(s);
    while (st.length) {
      const i = st.pop(); comp.push(i);
      const x = i % W;
      for (const j of [x > 0 ? i - 1 : -1, x + 1 < W ? i + 1 : -1, i - W, i + W]) {
        if (j < 0 || j >= N || seen[j] || !m.land[j] || !wet(j) || m.lake[j] || (flow && flow.has(j))) continue;
        seen[j] = 1; st.push(j);
      }
    }
    const v = comp.length > LAKE_TILES ? 1 : 2;
    for (const i of comp) m.lake[i] = v;
    sum[v === 1 ? 'lakeTiles' : 'pondTiles'] += comp.length;
  }
  m.waters = out;
  return sum;
}
