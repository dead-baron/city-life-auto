// The red rock desert by hand, part 2 (the nature showcase, 2026-10-31): the red rock kit (shared/naturesites.js, its
// last section - stack, wash, waterhole, trailhead, bloom; the canyon's own scene is laid there with the nature sites)
// spread over the World v3 desert's places. For the whole-world build only (shared/world3-world.js's done hook; the page
// and the city worker never import it). Deterministic: arithmetic, integer hashes.
import { TILE, T } from './constants.js';
import { stack, wash, waterhole, trailhead, bloom, rrSpline as spline, rrHash as hh, bbOf, rrOpen as open } from './naturesites.js';

// ---- the whole world (World v3's done hook, after the desert's waters: shared/world3-world.js) -----------------------
// The kit over the desert's places: the canyon's pool given its clear turquoise and the biomes' scatter cleared off its
// floor; every tinaja made a waterhole in a dry wash (SC3-F) - the shade tree, the braided gravel and the cracked mud
// running away from it, red stacks framing it, and at the first a dirt-bike track along the bank; the first highway
// pull-off made the desert trailhead (NT1-B), the others dressed from its kit; the Red Rock Trail's start marked; Mirage
// Camp framed by stacks and flowers; the Red Rock Arch's flats with stacks. Returns a summary.
const PULLOFF_KIT = new Set(['pergola', 'picnic', 'otank', 'trashcan']);
export const SHOW_WASH = [4677, 898];   // (tiles: the showcase wash's tinaja is the one nearest)
const SCATTER = new Set(['tree_a', 'tree_b', 'shrub_a', 'shrub_b', 'bush_a', 'bush_b', 'bush_c', 'cactus', 'boulder', 'rock', 'flowers_a', 'flowers_big', 'palm_a', 'palm_b', 'outcrop']);
export function desertKit3(m, H3) {
  const out = { canyon: 0, waterholes: [], trailhead: null, pulloffs: 0, trail: 0, mirage: 0, arch: 0, stacks: 0 };
  if (!H3 || !H3.addProp) return out;
  const P = [], solids = [], gone = new Set();
  const K = { m, add: (t, x, y, r = 0, ex = null) => { P.push([t, Math.round(x), Math.round(y), r, ex]); }, solid: (x, y, r) => solids.push([Math.round(x), Math.round(y), r]) };
  const stk = (x, y, w, d, h, s, l = 0) => { if (stack(K, x, y, w, d, h, s, l)) out.stacks++; };
  const clearRound = (x, y, r, all = false) => { for (const p of m.props) if (p && !p.rr && (all || SCATTER.has(p.t)) && Math.abs(p.x - x) < r && Math.abs(p.y - y) < r && Math.hypot(p.x - x, p.y - y) < r) gone.add(p.x + ',' + p.y); };
  const sites = (k) => (m.natureSites || []).filter((s) => s.kind === k);
  // the canyon: the pool's look, the floor's scatter gone (the biomes dressed it after the nature sites)
  const oa = sites('oasis')[0], pt = (m.paintings || []).find((p) => p.key === 'canyon');
  if (oa && oa.box && pt) {
    const [x0, y0, x1, y1] = oa.box;
    for (let ty = y0; ty < y1; ty++) for (let tx = x0; tx < x1; tx++) { const i = ty * m.w + tx; if (m.tiles[i] === T.WATER && m.lake) { m.lake[i] = 2; if (m.river) m.river[i] = 0; } }
    if (m.waters && Array.isArray(m.waters.lk)) m.waters.lk.unshift({ k: 'pond', t: 'alpine', box: [x0, y0, x1, y1] });
    for (const p of m.props) if (p && !p.rr && SCATTER.has(p.t) && p.x >= pt.x && p.y >= pt.y && p.x < pt.x + pt.w && p.y < pt.y + pt.h) gone.add(p.x + ',' + p.y);
    out.canyon = 1;
  }
  // the tinajas: waterholes in dry washes
  const tin = sites('tinaja');
  // (the showcase - SC3-F's own, with the dirt-bike track - is the one under the Dry Creek mesas north of the motel: the
  // nearest to SHOW_WASH; the rest the same kit)
  const show = tin.reduce((b, s, i) => (b < 0 || Math.hypot(s.x / TILE - SHOW_WASH[0], s.y / TILE - SHOW_WASH[1]) < Math.hypot(tin[b].x / TILE - SHOW_WASH[0], tin[b].y / TILE - SHOW_WASH[1]) ? i : b), -1);
  tin.forEach((s, j) => {
    const k = j === show ? 0 : j + 1;
    const R = s.r || 64, x = s.x, y = s.y, sd = hh(x, y, 2501) < 0.5 ? 1 : -1;
    // the wash: from the pool's flank away from the cliff, south and off to one side, braided, 30 tiles or so
    const cp = [[x + sd * (R + 20), y + R * 0.4]];
    for (let j = 1; j <= 6; j++) cp.push([x + sd * (R + 40 + j * 70) + (hh(k, j, 2502) - 0.5) * 120, y + R + j * 150]);
    for (const [a, b] of cp.slice(1)) clearRound(a, b, 110);   // (not round the pool: the tinaja's own rim stays)
    const hw = 92 + Math.round(hh(k, 1, 2503) * 30), cw = spline(cp, 40);
    for (const [a, b] of cw.slice(2)) clearRound(a, b, hw * 2);   // (the banks: the grey scatter gone, the kit's red rock and sand instead)
    const W = wash(K, cp, hw, { seed: 2504 + k, bank: 6 });
    // (the showcase's dirt-bike track round the far bank: laid first, so no rock stands on it)
    const bike = k === 0 ? spline(W.pts.filter((q, j) => j % 3 === 0).map(([a, b], j, A) => [a - sd * (470 + Math.sin(j / Math.max(1, A.length - 1) * 3.14) * 120), b]), 14) : null;
    const offBike = (px, py, r) => !bike || !bike.some(([a, b]) => Math.hypot(a - px, b - py) < r + 50);
    waterhole(K, x, y, R, { seed: 2510 + k });
    // red rock along both banks below the pool (SC3-F's walls of stacked blocks), a stack west of the pool
    for (let j = 6, n = 0; j < W.pts.length - 2; j += 9, n++) {
      const [x0, y0] = W.pts[j - 1], [x1, y1] = W.pts[j], l = Math.hypot(x1 - x0, y1 - y0) || 1, ex = -(y1 - y0) / l, ey = (x1 - x0) / l, side = n % 2 ? 1 : -1;
      const w = 200 + Math.round(hh(k, j, 2521) * 80), d = Math.round(w * 0.62), h = 90 + Math.round(hh(k, j, 2522) * 40), off = hw * 1.9 + w * 0.42;
      for (const sg of [side, -side]) {   // (both banks: a mass of stacked blocks, a lower one beside it)
        const ax = x1 + ex * sg * off, ay = y1 + ey * sg * off, bx = x1 + ex * sg * (off + w * 0.55) - ey * 90, by = y1 + ey * sg * (off + w * 0.55) + ex * 90;
        if (offBike(ax, ay, w * 0.45)) stk(ax, ay, w, d, h, 2520 + k * 31 + j + sg);
        if (hh(k, j + sg, 2523) < 0.35 && offBike(bx, by, w * 0.35)) stk(bx, by, Math.round(w * 0.7), Math.round(d * 0.7), Math.round(h * 0.6), 2525 + k * 31 + j + sg);
      }
    }
    if (offBike(x - sd * (R + 300), y + 60, 80)) stk(x - sd * (R + 300), y + 60, 170, 110, 140, 2540 + k);
    // the first: a dirt-bike track along the far bank, dust on it
    if (k === 0) {
      const tp = bike;   // (round the far bank, sweeping out and back)
      (m.tracks ||= []).push({ pts: tp.map(([a, b]) => [Math.round(a), Math.round(b)]), hw: 26, bb: bbOf(tp, 40), ruts: 1, px: 1 });
      for (const [a, b] of tp) clearRound(a, b, 30);
      m.parking.push({ x: Math.round(tp[tp.length >> 1][0]), y: Math.round(tp[tp.length >> 1][1]), a: Math.PI / 2, model: 'dirtbike', bare: 1 });
    }
    out.waterholes.push({ x: Math.round(x / TILE), y: Math.round(y / TILE), wash: W.pts.length });
    (m.landmarks ||= []).push({ name: k === 0 ? 'Coyote Wash' : 'Dry Wash Waterhole', type: 'wash', x: Math.round(Math.min(...W.pts.map((q) => q[0])) - 64), y: Math.round(y - R), w: Math.round(Math.max(...W.pts.map((q) => q[0])) - Math.min(...W.pts.map((q) => q[0])) + 128), h: Math.round(W.pts[W.pts.length - 1][1] - y + R) });
  });
  // the pull-offs: the first made the trailhead, the others dressed with its kit
  const po = sites('pulloff'), ends = po.map((s) => hwyNear(m, s.x, s.y));
  // (the trailhead: the pull-off on the straightest east-west stretch, as the concept's highway)
  // (the trailhead: the pull-off with nothing built round it - no motel in the shot - on the straightest stretch)
  const built = (s) => { let n = 0; for (let ty = Math.floor(s.y / TILE) - 32; ty <= Math.floor(s.y / TILE) + 32; ty += 2) for (let tx = Math.floor(s.x / TILE) - 32; tx <= Math.floor(s.x / TILE) + 32; tx += 2) { if (tx < 0 || ty < 0 || tx >= m.w || ty >= m.h) continue; const t = m.tiles[ty * m.w + tx]; if (t === T.BUILDING || t === T.LOT || t === T.PLAZA || t === T.SIDEWALK) n++; } return n; };
  const score = po.map((s, i) => (ends[i] ? built(s) * 10 + Math.abs(ends[i].uy) : 1e9));
  const th = score.reduce((b, v, i) => (v < 1e9 && (b < 0 || v < score[b]) ? i : b), -1);
  po.forEach((s, j) => {
    const e = ends[j], k = j === th ? 0 : j + 1;
    if (!e) return;
    const ux = e.ux, uy = e.uy; let nx = -uy, ny = ux;
    if ((s.x - e.x) * nx + (s.y - e.y) * ny < 0) { nx = -nx; ny = -ny; }
    const edge = { x: e.x + nx * (e.hw + 10), y: e.y + ny * (e.hw + 10), ux, uy, nx, ny };
    if (k === 0) {
      for (let a = -24; a <= 26; a += 2) for (let b = 1; b <= 34; b += 2) clearRound(edge.x + (ux * a + nx * b) * TILE, edge.y + (uy * a + ny * b) * TILE, 40);
      for (const p of m.props) if (p && PULLOFF_KIT.has(p.t) && Math.hypot(p.x - s.x, p.y - s.y) < 9 * TILE) gone.add(p.x + ',' + p.y);   // (the pull-off's own: the trailhead's cluster replaces them)
      s.kind = 'trailhead';   // (a pull-off no longer: the trailhead)
      out.trailhead = trailhead(K, edge, { seed: 2550, name: 'Red Rock Trailhead' });
      out.trailhead.at = [Math.round(edge.x / TILE), Math.round(edge.y / TILE)];
      s.name = 'Red Rock Trailhead'; s.trailhead = 1;
      (m.landmarks ||= []).push({ name: 'Red Rock Trailhead', type: 'trail', x: Math.round(edge.x - 16 * TILE), y: Math.round(edge.y - 30 * TILE), w: 38 * TILE, h: 30 * TILE });
    } else {
      // stacks behind, saguaros and Joshua trees, flowers, a cairn and a map board by the table
      const Q = (a, b) => [edge.x + (ux * a + nx * b) * TILE, edge.y + (uy * a + ny * b) * TILE];
      for (const [a, b, w, d, h] of [[-10, 13, 200, 130, 160], [9, 15, 170, 110, 140], [-2, 21, 220, 140, 170]]) { const [px, py] = Q(a, b); clearRound(px, py, 90); stk(px, py, w, d, h, 2560 + k * 9 + a); }
      for (const [a, b, sp] of [[-8, 6, 'saguaroBig'], [9, 7, 'joshua'], [12, 4, 'saguaroMid'], [-12, 9, 'joshua']]) { const [px, py] = Q(a, b); if (open(m, px, py)) K.add(sp === 'joshua' ? 'tree_a' : 'cactus', px, py, 8, { sp, k: 1.1, rr: 1 }); }
      for (const [a, b] of [[-5, 9], [4, 10], [10, 11]]) { const [px, py] = Q(a, b); bloom(K, px, py, 4, 24, 2570 + k * 5 + a); }
      { const [px, py] = Q(2, 9.5); if (open(m, px, py)) K.add('mapboard', px, py, 8, { rr: 1 }); }
      { const [px, py] = Q(6, 13); if (open(m, px, py)) K.add('rcairn', px, py, 0, { k: 4, v: k, rr: 1 }); }
      out.pulloffs++;
    }
  });
  // the Red Rock Trail's start (the MX park's east gate): the map board, cairns up the first stretch, stacks, flowers
  const rt = sites('route').find((s) => /Red Rock/.test(s.name || ''));
  if (rt) {
    const x = rt.x, y = rt.y;
    for (const [dx, dy, w, d, h] of [[180, -360, 190, 120, 150], [420, -200, 210, 140, 170], [440, 220, 160, 100, 130]]) { clearRound(x + dx, y + dy, 90); stk(x + dx, y + dy, w, d, h, 2580 + dx); }
    for (let j = 0; j < 5; j++) { const px = x + 60 + j * 70, py = y - 40 - j * 40; if (open(m, px, py)) { K.add('rcairn', px, py, 0, { k: 3 + (j % 3), v: j, rr: 1 }); out.trail++; } }
    for (const [dx, dy] of [[120, 180], [300, 60], [60, -160]]) bloom(K, x + dx, y + dy, 4, 24, 2590 + dx);
    // a shade ramada and its table by the start, the map board
    const rx = x + 170, ry = y + 40;
    if (open(m, rx, ry) && open(m, rx - 60, ry - 40) && open(m, rx + 60, ry + 40)) { clearRound(rx, ry, 90); K.add('ramada', rx, ry, 0, { w: 120, d: 80, rr: 1 }); for (const [ox, oy] of [[-56, -36], [56, -36], [-56, 36], [56, 36]]) K.solid(rx + ox, ry + oy, 5); K.add('picnic', rx, ry + 8, 10, { rr: 1 }); K.add('mapboard', rx + 110, ry - 20, 8, { rr: 1 }); out.trail++; }
  }
  // Mirage Camp: stacks to its north and east, flowers, the roadrunner
  const mc = sites('desertcamp')[0];
  if (mc) {
    for (const [dx, dy, w, d, h] of [[-440, -440, 210, 140, 170], [480, -400, 190, 120, 150], [600, 120, 170, 110, 130], [-600, -60, 160, 100, 120]]) { const px = mc.x + dx, py = mc.y + dy; clearRound(px, py, 90); if (stack(K, px, py, w, d, h, 2600 + dx)) { out.mirage++; out.stacks++; } }
    for (const [dx, dy] of [[-200, 160], [240, 200], [300, -160], [-300, -200]]) bloom(K, mc.x + dx, mc.y + dy, 5, 28, 2610 + dx);
    if (open(m, mc.x + 220, mc.y + 60)) K.add('roadrunner', mc.x + 220, mc.y + 60, 0, { a: 0.4, rr: 1 });
  }
  // the Red Rock Arch's flats: stacks round it, a wash under it, flowers
  const ar = (m.landmarks || []).find((l) => l.name === 'Red Rock Arch');
  if (ar) {
    const x = ar.x + ar.w * 0.37, y = ar.y + ar.h * 0.45;
    for (const [dx, dy, w, d, h] of [[-440, -100, 210, 140, 170], [-360, 260, 170, 110, 130], [140, 360, 190, 120, 150]]) { clearRound(x + dx, y + dy, 90); if (stack(K, x + dx, y + dy, w, d, h, 2620 + dx)) { out.arch++; out.stacks++; } }
    wash(K, [[x - 40, y - 300], [x, y - 100], [x + 20, y + 120], [x - 60, y + 340], [x - 20, y + 560]], 70, { seed: 2630 });
    for (const [dx, dy] of [[-200, 100], [200, -120]]) bloom(K, x + dx, y + dy, 4, 24, 2640 + dx);
  }
  // (a tinaja's own rim - its boulders, its palo verde, its cactus - stays: world3-tinajas.js)
  for (const p of m.props) if (p && gone.has(p.x + ',' + p.y) && tin.some((t) => Math.hypot(p.x - t.x, p.y - t.y) < (t.r || 64) + 5 * TILE)) gone.delete(p.x + ',' + p.y);
  if (gone.size && H3.removeProps) H3.removeProps(m, (x, y) => gone.has(x + ',' + y));
  for (const [t, x, y, r, e] of P) H3.addProp(m, t, x, y, r, e);
  if (m.addSolidProp) for (const [x, y, r] of solids) m.addSolidProp(x, y, r);
  return out;
}
// the highway nearest (x, y) px: its point, its heading there (unit), its half width
function hwyNear(m, x, y) {
  let best = null;
  for (const e of m.edges || []) {
    if (!e || e.kind !== 'hwy' || e.lvl || !Array.isArray(e.pts)) continue;
    const pts = e.pts.map((p) => [p.x ?? p[0], p.y ?? p[1]]);
    for (let k = 1; k < pts.length; k++) {
      const [ax, ay] = pts[k - 1], [bx, by] = pts[k], dx = bx - ax, dy = by - ay, L = Math.sqrt(dx * dx + dy * dy) || 1, t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (L * L))), px = ax + dx * t, py = ay + dy * t, d = Math.hypot(px - x, py - y);
      if (!best || d < best.d) best = { x: px, y: py, ux: dx / L, uy: dy / L, hw: e.hw || 40, d };
    }
  }
  return best && best.d < 20 * TILE ? best : null;
}
