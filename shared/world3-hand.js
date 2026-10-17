// World v3's handcrafted districts (the World v3 Handcraft Plan, 2026-10-17): districts laid out by hand instead of by
// the city's street grid and block filler. Each plan (shared/world3-midtown.js ...) says:
//   key, d (its district id), rect [x0, y0, x1, y1] (frame tiles: its area - the grid planner lays no street strictly
//   inside it, the block filler gets only what it leaves), streets() -> [{ name, kind, pts: [[x, y], ...] (tiles) }],
//   build(m, api, kit): every lot, prop and business laid before the generator looks for blocks (shared/map.js handApi:
//   handBuilding, addProp, roofOne...; kit: this module's composers, below).
// The generator side only (shared/world3-world.js wires it in): the page never imports this.
// Deterministic: integer data, hash2 / mulberry32 draws, no Math.random, no trigonometry.
import { TILE, T } from './constants.js';
import { MIDTOWN } from './world3-midtown.js';

export const HAND_PLANS = [MIDTOWN];
const M_IN = 2;   // (a street within this many tiles of a plan's edge is the edge's - the grid planner's)
export const handPlanAt = (x, y) => HAND_PLANS.find((p) => x > p.rect[0] + M_IN && y > p.rect[1] + M_IN && x < p.rect[2] - M_IN && y < p.rect[3] - M_IN) || null;
export const handDistricts = () => new Set(HAND_PLANS.map((p) => p.d));

// The plans' streets as the generator's lines (px), into the `lines` hook after the skeleton's roads.
const C = (v) => (v + 0.5) * TILE;
export function handStreets(lines) {
  const out = { streets: 0, len: 0 };
  for (const P of HAND_PLANS) for (const s of P.streets()) {
    lines.push({ pts: s.pts.map(([x, y]) => ({ x: C(x), y: C(y) })), kind: s.kind, lvl: 0, name: s.name, city: true, hand: P.key });
    out.streets++;
    for (let i = 1; i < s.pts.length; i++) out.len += Math.round(Math.hypot(s.pts[i][0] - s.pts[i - 1][0], s.pts[i][1] - s.pts[i - 1][1]));
  }
  return out;
}

// Every plan built (the generator's `hand` hook: after the roads, the rail and the plazas are laid, before the blocks).
export function buildHand(m, api) {
  const out = {};
  for (const P of HAND_PLANS) {
    const kit = makeKit(m, api, P);
    out[P.key] = P.build(m, api, kit);
    kit.seal();   // (what the plan left open in its area: paved or planted, so the block filler doesn't build over it)
    out[P.key].buildings = kit.count();
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// The kit: the composers a plan builds its blocks with. All in tiles; a row's front is its south edge.
export const FREE_T = new Set([T.GRASS]);
function makeKit(m, api, P) {
  const { handBuilding, addProp, hash2 } = api;
  const [X0, Y0, X1, Y1] = P.rect;
  const W = m.w;
  const used = new Uint8Array((X1 - X0) * (Y1 - Y0));   // tiles a lot or a dressed patch has taken
  const at = (x, y) => (x >= X0 && y >= Y0 && x < X1 && y < Y1 ? (y - Y0) * (X1 - X0) + (x - X0) : -1);
  let nb = 0;
  // a tile the plan may still build on: in its area, grass (not road, pavement, plaza, rail), not reserved, not taken
  const free = (x, y) => { const k = at(x, y); if (k < 0 || used[k]) return false; const i = y * W + x; return m.tiles[i] === T.GRASS && !m.reserve[i] && m.land[i] && !(m.river && m.river[i]); };
  const take = (x, y, w, h) => { for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) { const k = at(xx, yy); if (k >= 0) used[k] = 1; } };
  const allFree = (x, y, w, h) => { for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) if (!free(xx, yy)) return false; return true; };
  const rnd = (x, y, k) => hash2(x, y, 7000 + k);   // a draw fixed by where it is (so reworking one block moves nothing else)
  const pick = (list, r) => list[Math.min(list.length - 1, Math.floor(r * list.length))];
  const fill = (x, y, w, h, t) => { for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) { const k = at(xx, yy); if (k < 0) continue; const i = yy * W + xx; if (m.tiles[i] === T.GRASS && !m.reserve[i]) { m.tiles[i] = t; used[k] = 1; } } };
  const prop = (t, x, y, solid = 0, extra = null) => addProp(m, t, x * TILE, y * TILE, solid, extra);
  // repaint open ground the plan has already taken (a lawn on a paved court): never a road, a building or a kept plaza
  const paint = (x, y, w, h, t) => { for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) { const k = at(xx, yy); if (k < 0) continue; const i = yy * W + xx, c = m.tiles[i]; if ((c === T.GRASS || c === T.PLAZA || c === T.LOT) && !(m.reserve[i] & ~16) && m.bld[i] < 0) { m.tiles[i] = t; used[k] = 1; } } };

  const K = {
    m, P, free, take, allFree, rnd, pick, fill, paint, prop,
    count: () => nb,
    // one building (map.js handBuilding) on free tiles; null if they aren't all free
    building(o) {
      if (!allFree(o.x, o.y, o.w, o.h)) return null;
      take(o.x, o.y, o.w, o.h);
      nb++;
      return handBuilding(m, { d: P.d, ...o });
    },
    // the free extent of a column inside a band: [southmost free y, northmost free y] scanning north from yS (or null)
    column(x, y0, y1, mask = null) {
      const ok = mask ? (xx, yy) => free(xx, yy) && mask(xx, yy) : free;
      let s = -1;
      for (let y = y1; y >= y0; y--) if (ok(x, y)) { s = y; break; }
      if (s < 0) return null;
      let n = s;
      while (n - 1 >= y0 && ok(x, n - 1)) n--;
      return [s, n];
    },
    // A row of lots facing south along [x0, x1) inside the band [y0, y1] (tiles, inclusive): each lot from `next(x, room,
    // i)` -> { w, ...building options, depth } | { gap: w, kind: 'passage' | 'yard' | 'garden' | 'plaza' } | null (stop).
    // Each lot's front stands on the row's southmost free tile under all its columns (so it steps back along a
    // diagonal street: what's left in front is paved and planted), as deep as `depth` allows and the band is free.
    row(x0, x1, y0, y1, next, opt = {}) {
      const made = [], mk = opt.mask || null, col = (xx) => K.column(xx, y0, y1, mk);
      let x = x0, i = 0;
      while (x < x1) {
        // skip columns with nothing free in the band
        const c0 = col(x);
        if (!c0 || c0[0] - c0[1] + 1 < 4) { x++; continue; }
        const room = (() => { let r = 0; while (x + r < x1 && col(x + r)) r++; return r; })();
        const L = next(x, room, i++);
        if (!L) break;
        const w = Math.min(L.w || L.gap || 1, room);
        if (w < 1) break;
        // the lot's front: the northmost of its columns' southmost free tiles; its back: as deep as wanted and free
        let front = y1, back = y0;
        for (let xx = x; xx < x + w; xx++) { const c = col(xx); if (!c) { front = -1; break; } front = Math.min(front, c[0]); back = Math.max(back, c[1]); }
        if (front < 0) { x += w; continue; }
        const depth = Math.min(L.depth || 99, front - back + 1);
        const y = front - depth + 1;
        // the strip in front where the lot stepped back from the street (a diagonal's wedges): paved, a planter now and then
        for (let xx = x; xx < x + w; xx++) { const c = K.column(xx, front + 1, y1, mk); if (c) { fill(xx, front + 1, 1, c[0] - front, T.PLAZA); if (c[0] - front >= 2 && rnd(xx, front, 3) < 0.18) prop(pick(['planter_g', 'planter_sq', 'potted', 'bench_m', 'flowers_a'], rnd(xx, front, 4)), xx + 0.5, front + 1.5, 10); } }
        if (L.gap) { K.gap(L.kind || 'passage', x, y, w, depth, opt); made.push({ gap: L.kind, x, y, w, h: depth }); x += w; continue; }
        if (depth < (L.minDepth || 6)) { K.gap('plaza', x, y, w, depth, opt); x += w; continue; }
        const b = K.building({ ...L, x, y, w, h: depth });
        if (b) made.push(b); else K.gap('plaza', x, y, w, depth, opt);
        x += w;
      }
      return made;
    },
    // A gap between buildings: a paved passage (to the alley behind: bins, a bike), a walled yard (pallets, a dumpster,
    // a gate), a pocket garden (a tree, benches, flowers, an iron fence), or plain paving
    gap(kind, x, y, w, h, opt = {}) {
      if (kind === 'passage') {
        fill(x, y, w, h, T.PLAZA);
        prop(pick(['dump_g', 'dump_b', 'bikerack', 'trashcan'], rnd(x, y, 11)), x + w / 2, y + 2, 12);
        if (h >= 8 && rnd(x, y, 12) < 0.5) prop('bags', x + w / 2, y + 4, 0);
        return;
      }
      if (kind === 'yard') {
        fill(x, y, w, h, T.LOT);
        const pool = opt.rough ? ['pallet', 'tires', 'drum', 'dump_o', 'crates', 'bags'] : ['pallet_s', 'crates', 'dump_g', 'bikerack', 'planks'];
        for (let k = 0; k < Math.max(1, Math.floor((w * h) / 30)); k++) prop(pick(pool, rnd(x + k, y, 13)), x + 1 + rnd(x, y + k, 14) * Math.max(1, w - 2), y + 1 + rnd(x + k, y + k, 15) * Math.max(1, h - 4), 10);
        api.streetWall(m, x, y + h - 1, w, () => rnd(x, y, 16), w >= 5);
        return;
      }
      if (kind === 'garden') {
        fill(x, y, w, h, T.GRASS);
        prop(pick(['tree_a', 'tree_b'], rnd(x, y, 17)), x + w / 2, y + Math.min(h - 3, 4), 12, { sp: pick(['street', 'maple', 'oak'], rnd(x, y, 18)), k: 1.15 });
        if (w >= 5) { prop('bench_m', x + 1.5, y + h - 2, 0); prop('flowers_a', x + w - 2, y + h - 2.5, 0); }
        else prop('flowers_a', x + w / 2, y + h - 2.5, 0);
        if (h >= 8) prop(pick(['shrub_a', 'bush_c', 'flowers_big'], rnd(x, y, 19)), x + 1.5, y + 2, 0);
        return;
      }
      fill(x, y, w, h, T.PLAZA);
      if (w >= 3 && h >= 3 && rnd(x, y, 20) < 0.5) prop(pick(['planter_g', 'potted', 'bench_m', 'planter_sq'], rnd(x, y, 21)), x + w / 2, y + h / 2, 8);
    },
    // Close the plan's area: every tile left open is paved (by a street) or planted, and reserved from the block filler.
    seal() {
      for (let y = Y0; y < Y1; y++) for (let x = X0; x < X1; x++) {
        const k = at(x, y), i = y * W + x;
        // (the plan's own lawns and gardens kept from the block filler, which builds on any open grass it finds)
        if (used[k] && m.tiles[i] === T.GRASS) { m.reserve[i] |= 16; continue; }
        if (used[k] || m.tiles[i] !== T.GRASS || m.reserve[i] || !m.land[i]) continue;
        if (m.dist[i] !== P.d) continue;
        // (by a pavement: paved; deeper in: a patch of green - a back garden, the inside of a block)
        let pave = false;
        for (let dy = -1; dy <= 1 && !pave; dy++) for (let dx = -1; dx <= 1; dx++) { const t = m.tiles[(y + dy) * W + x + dx]; if (t === T.SIDEWALK || t === T.PLAZA) { pave = true; break; } }
        m.tiles[i] = pave ? T.PLAZA : T.GRASS;
        m.reserve[i] |= 16;
      }
    },
  };
  return K;
}
