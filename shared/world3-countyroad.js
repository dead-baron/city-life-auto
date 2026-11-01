// Willow Valley's county roads by hand (the nature showcase, 2026-10-31: concept SC3-E, "the wheat county road" - and
// D13, FA4 beside it). A stretch of a real valley road made the concept, about 46 tiles of it (the player one tile):
//   - one side, the farm's: the power poles with their sagging lines, a split-rail fence a little back from the road
//     with sunflowers along it, the field gate in it - a dirt lane in through it, the farmer and his red pickup at it
//     (server/systems/countyroad.js puts them there) - the farm pond to its left with the windmill pump and its round
//     trough, reeds round the far rim; the tall corn on to the right of the lane; big round trees;
//   - the other side, the field's: wooden posts along the road's edge, the irrigation canal along it in its grassy
//     banks (reeds, a concrete culvert carrying a crossing over it at the lane), then the wheat - half of it harvested:
//     the stubble and its straw rows baked into the ground (client/art2/game/groundbake.js: a field's cut), the rest
//     standing; the red combine working the line between them (server/systems/countyroad.js: the ambient combine,
//     its dust and chaff, the crows after it), hay bales on the stubble.
// The kit (canal and culvert along a county road, the windmill pond, sunflower borders, the fence and its gate, the
// half-cut field) is laid the same way along the valley's other county roads: COUNTY3.stretches, each found on the map
// from a point on its road - the field side whichever has the wheat, the pond only where there's open grass for it.
// For the whole-world build only (shared/world3-world.js's done hook, after the verges). Deterministic: arithmetic and
// integer hashes (the road's direction from its points, no trigonometry).
import { TILE, T } from './constants.js';
import { pointAt } from './geom.js';
import { fieldKind } from './fieldcrop.js';
import { skeletonRoom } from './world3-biomes.js';

const RES = 32, D_VALLEY = 49;
const hh = (a, b, s) => { let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(s | 0, 2246822519); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
// The stretches (tiles): at - a point on the road; half - tiles either way along it (u: east along an east-west road,
// south along a north-south one); gate, pond - along the road where the lane and the pond are; corn - the farm side's
// field begins this far along (cut back or carried on to there: the lane and the pond in the grass before it); wheat -
// the field side's wheat carried on to this far along; hero - the concept's own (the combine works it); trees - [u, v]
// (v: tiles out on the farm side, negative: the field side). The field's cut is always its half further along.
export const COUNTY3 = {
  canal: { from: 1.6, to: 5.0 },   // (tiles out from the road's edge: the canal's near and far bank)
  stretches: [
    { name: 'Lake Road', at: [3212, 1250], half: 23, gate: 8, pond: -8, corn: 11, wheat: 24, hero: 1, trees: [[-21, 6], [-24, 3], [21, -7], [24, -4], [-18, 15], [-22, -10], [17, -12], [2.5, 17]] },
    { name: 'Orchard Road', at: [3511, 1370], half: 23, gate: 3, trees: [[-20, 6], [21, -8]] },
    { name: 'Valley Parkway', at: [3649, 1416], half: 22, gate: -6, trees: [[16, 6], [-19, -7]] },
    { name: 'North Coast Road', at: [3893, 756], half: 22, gate: 4, pond: -9, trees: [[-20, 7], [18, 9]] },
    { name: 'Lakeshore Drive', at: [3484, 1306], half: 20, gate: 2, pond: -9, trees: [[-14, 8], [14, 6]] },
  ],
};

export function countyRoads3(m, H3) {
  const out = { stretches: 0, canal: 0, posts: 0, sunflowers: 0, ponds: 0, cut: 0, missed: [] };
  if (!H3 || !H3.addProp || !m.edges) return out;
  const W = m.w, HH = m.h, inF = (x, y) => x >= 0 && y >= 0 && x < W && y < HH, idx = (x, y) => y * W + x;
  const seed = ((m.seed ?? 1337) | 0) & 0xffff;
  const props = [], P = (t, x, y, r = 0, ex = null) => props.push([t, Math.round(x), Math.round(y), r, ex]);
  const drop = [];   // (boxes in px whose standing props go: [x0, y0, x1, y1])
  // (open ground the kit may dig or lay a lane on: not a building's, a deck's, the rail's or another handmade place's)
  const soft = (i) => { const t = m.tiles[i]; return (t === T.GRASS || t === T.DIRT || t === T.FIELD || t === T.SAND) && !(m.reserve[i] & (1 | 2 | 8 | 16 | 32)) && !(m.bld && m.bld[i] >= 0) && !(m.deck && m.deck[i]); };
  const fieldAt = (x, y) => m.fields.findIndex((f) => x >= f.x && x < f.x + f.w && y >= f.y && y < f.y + f.h);
  // a field carried on to (x, y) along a road (ew: an east-west one): its rect grown that way, the open ground in it sown
  // (its crop the field's own: the bake draws a field's tiles by the rect they're in)
  // (a grown field keeps off the skeleton's lines and leaves the green bank by the water: world3-biomes.js skeletonRoom, the verges)
  let keep = null; const room = () => keep || (keep = skeletonRoom(W, HH));
  const nearWet = (x, y) => { for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { if (!inF(x + dx, y + dy)) continue; const t = m.tiles[idx(x + dx, y + dy)]; if (t === T.WATER || t === T.DEEP) return true; } return false; };
  const growField = (f, x, y, ew) => {
    const o = { x: f.x, y: f.y, w: f.w, h: f.h };
    if (ew) { const gx = Math.round(x / TILE) * TILE; if (gx < f.x) { f.w += f.x - gx; f.x = gx; } else f.w = Math.max(f.w, gx - f.x); }
    else { const gy = Math.round(y / TILE) * TILE; if (gy < f.y) { f.h += f.y - gy; f.y = gy; } else f.h = Math.max(f.h, gy - f.y); }
    for (let ty2 = f.y / TILE; ty2 < (f.y + f.h) / TILE; ty2++) for (let tx2 = f.x / TILE; tx2 < (f.x + f.w) / TILE; tx2++) {
      const X2 = tx2 * TILE, Y2 = ty2 * TILE;
      if (X2 >= o.x && X2 < o.x + o.w && Y2 >= o.y && Y2 < o.y + o.h) continue;
      const i = idx(tx2, ty2);
      if (inF(tx2, ty2) && (m.tiles[i] === T.GRASS || m.tiles[i] === T.DIRT) && !(m.reserve[i] & (1 | 8 | 16 | 32)) && !(m.bld && m.bld[i] >= 0) && m.dist[i] === D_VALLEY && fieldAt(X2 + 1, Y2 + 1) === m.fields.indexOf(f) && !room()[i] && !nearWet(tx2, ty2)) m.tiles[i] = T.FIELD;
    }
  };
  m.countyRoads = [];
  for (const S of COUNTY3.stretches) {
    // the road: the level street edge nearest the point, where along it the point is, its heading there
    const ax = (S.at[0] + 0.5) * TILE, ay = (S.at[1] + 0.5) * TILE;
    let best = null;
    for (const e of m.edges) {
      if (e.lvl !== 0 || e.bridge || !e.pts || e.pts.length < 2) continue;
      for (let k = 1; k < e.pts.length; k++) {
        const a = e.pts[k - 1], b = e.pts[k], dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, ((ax - a.x) * dx + (ay - a.y) * dy) / l2));
        const d = Math.hypot(a.x + dx * t - ax, a.y + dy * t - ay);
        if (!best || d < best.d) best = { e, d, s: a.s + Math.sqrt(l2) * t };
      }
    }
    if (!best || best.d > 3 * TILE) { out.missed.push(S.name); continue; }
    const e = best.e, c = pointAt(e.pts, best.s), fw = c.tx > 0.5 || (Math.abs(c.tx) <= 0.5 && c.ty > 0) ? 1 : -1;   // (+u: east, or south)
    const tx = c.tx * fw, ty = c.ty * fw, nx = -ty, ny = tx, hwT = (e.hw || 64) / TILE;
    // which side the wheat is: the canal goes that side (cs: +1 the normal's), the farm the other
    const kindAt = (sd) => { let w = 0; for (let u = -S.half; u <= S.half; u += 4) for (const o of [8, 14]) { const x = c.x + tx * u * TILE + nx * sd * (hwT + o) * TILE, y = c.y + ty * u * TILE + ny * sd * (hwT + o) * TILE, f = fieldAt(x, y); if (f >= 0 && fieldKind(f, seed) === 'WHEAT' && m.tiles[idx(Math.floor(x / TILE), Math.floor(y / TILE))] === T.FIELD) w++; } return w; };
    const cs = kindAt(1) >= kindAt(-1) ? 1 : -1;
    // a point at (u along, v out: + the canal's side, - the farm's) in px, and its tile
    const X = (u, v) => c.x + tx * u * TILE + nx * cs * v * TILE, Y = (u, v) => c.y + ty * u * TILE + ny * cs * v * TILE;
    const tileOf = (u, v) => { const x = Math.floor(X(u, v) / TILE), y = Math.floor(Y(u, v) / TILE); return inF(x, y) ? idx(x, y) : -1; };
    const ang = (dx, dy) => Math.atan2(ty * dx + ny * cs * dy, tx * dx + nx * cs * dy);   // (a heading given along/out)
    const box = (u0, v0, u1, v1) => { const xs = [X(u0, v0), X(u1, v0), X(u0, v1), X(u1, v1)], ys = [Y(u0, v0), Y(u1, v0), Y(u0, v1), Y(u1, v1)]; return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]; };
    const C = COUNTY3.canal, v0 = hwT + C.from, v1 = hwT + C.to, gate = S.gate ?? 0;
    const rec = { name: S.name, hero: !!S.hero, x: Math.round(c.x), y: Math.round(c.y), a: Math.round(Math.atan2(ty, tx) * 1000) / 1000, field: -1, cut: null, gate: null, pickup: null, farmer: null };
    // ---- the field side: the wheat field - half cut (the half further along the road), the canal between it and the
    // road, posts along the road's edge
    {
      let fi = -1;
      for (let v = v1 + 2; v <= v1 + 14 && fi < 0; v += 3) for (let u = -S.half; u <= S.half && fi < 0; u += 3) { const f = fieldAt(X(u, v), Y(u, v)); if (f >= 0 && fieldKind(f, seed) === 'WHEAT') fi = f; }
      if (fi >= 0) {
        const f = m.fields[fi];
        // (carried on along the road to `wheat`: the grass there sown, the rect grown)
        if (S.wheat !== undefined) growField(f, X(S.wheat, v1 + 2), Y(S.wheat, v1 + 2), Math.abs(tx) > Math.abs(ty));
        // the cut: the half of it further along the road
        const r = Math.abs(tx) > Math.abs(ty) ? [Math.max(f.x, c.x + tx * TILE * 0), f.y, f.x + f.w, f.y + f.h] : [f.x, Math.max(f.y, c.y), f.x + f.w, f.y + f.h];
        if (r[2] - r[0] < 6 * TILE || r[3] - r[1] < 6 * TILE) { r[0] = f.x + (Math.abs(tx) > Math.abs(ty) ? f.w / 2 : 0); r[1] = f.y + (Math.abs(tx) > Math.abs(ty) ? 0 : f.h / 2); }
        f.cut = r.map((q) => Math.round(q));
        rec.field = fi; rec.cut = f.cut; out.cut++;
        // hay bales left on the stubble
        for (let k = 0; k < 5; k++) { const bx = f.cut[0] + (0.2 + hh(fi, k, 71) * 0.6) * (f.cut[2] - f.cut[0]), by = f.cut[1] + (0.2 + hh(fi, k, 72) * 0.6) * (f.cut[3] - f.cut[1]); P('hayBale', bx, by, 10); }
      }
      // the canal: two tiles of water in grassy banks, the lane carried over it at the gate on a culvert (its tiles a
      // bridge's: the water drawn on under it)
      for (let u = -S.half; u <= S.half; u += 0.4) for (let v = v0; v <= v1; v += 0.4) {
        const i = tileOf(u, v);
        if (i < 0 || !soft(i) || m.dist[i] !== D_VALLEY) continue;
        out.canal++;
        m.tiles[i] = Math.abs(u - gate) < 1.6 ? T.BRIDGE : T.WATER; m.land[i] = 0; if (m.lake) m.lake[i] = 1; if (m.river) m.river[i] = 0; m.reserve[i] |= RES;
      }
      for (let u = gate - 1.6; u <= gate + 1.6; u += 0.4) for (const v of [hwT + 0.3, hwT + 0.9, hwT + 1.4, v1 + 0.4]) { const i = tileOf(u, v); if (i >= 0 && soft(i) && m.tiles[i] !== T.WATER) { m.tiles[i] = T.DIRT; m.reserve[i] |= RES; } }
      drop.push(box(-S.half, hwT - 0.2, S.half, v1 + 1.2));
      P('culvert', X(gate, (v0 + v1) / 2), Y(gate, (v0 + v1) / 2), 0, { a: Math.round(ang(0, 1) * 1000) / 1000, len: Math.round((v1 - v0 + 1.8) * TILE), w: 84 });
      // posts along the road's edge, reeds and cattails along the banks, wildflowers
      for (let u = -S.half + 1; u <= S.half; u += 2.6) { if (Math.abs(u - gate) < 2.4) continue; P('post', X(u, hwT + 0.9), Y(u, hwT + 0.9), 4, { h: 28 }); out.posts++; }
      for (let u = -S.half; u <= S.half; u += 2.2) {   // (reeds and cattails in clumps on both banks)
        if (Math.abs(u - gate) < 2.8) continue;
        const h = hh(Math.round(u * 10), S.at[0], 81);
        if (h < 0.55) for (let k = 0; k < 3; k++) { const du = (hh(Math.round(u * 10), k, 86) - 0.5) * 1.6, dv = hh(Math.round(u * 10), k, 87) * 0.5; P('shrub_a', X(u + du, v1 + 0.1 - dv), Y(u + du, v1 + 0.1 - dv), 0, { sp: k === 1 || h < 0.2 ? 'cattails' : 'reeds', k: 1.1 }); }
        else if (h < 0.75) for (let k = 0; k < 2; k++) P('shrub_a', X(u + k * 0.7, v0 + 0.15), Y(u + k * 0.7, v0 + 0.15), 0, { sp: 'reeds', k: 0.95 });
        else if (h < 0.85) P('flowers_a', X(u, v0 - 0.6), Y(u, v0 - 0.6), 0, { sp: 'poppies', k: 1 });
      }
    }
    // ---- the farm side: the fence and its gate, sunflowers along it, the lane in, the pond with its windmill pump and
    // round trough, the corn from beside the lane, the power line ----
    const fv = -(hwT + 2.6);
    drop.push(box(-S.half, -(hwT - 0.2), S.half, fv - 1.5));
    // the farm side's field: begun beside the lane (the corn to the right of it), its cut-off part grass again
    if (S.corn !== undefined) {
      let fi = -1;
      for (let v = fv - 4; v >= fv - 16 && fi < 0; v -= 3) for (let u = S.corn + 2; u <= S.half + 8 && fi < 0; u += 2) { const f = fieldAt(X(u, v), Y(u, v)); if (f >= 0) fi = f; }
      if (fi >= 0) {
        const f = m.fields[fi], ex = X(S.corn, 0), ey = Y(S.corn, 0), ew = Math.abs(tx) > Math.abs(ty);
        if ((ew ? f.x : f.y) > (ew ? ex : ey)) growField(f, ex, ey, ew);
        else {   // (cut back to there: the part before it grass again)
          if (ew) { const x1 = f.x + f.w; f.x = Math.round(ex / TILE) * TILE; f.w = x1 - f.x; } else { const y1 = f.y + f.h; f.y = Math.round(ey / TILE) * TILE; f.h = y1 - f.y; }
          for (let u = -S.half - 4; u < S.corn; u += 0.4) for (let v = -hwT; v >= fv - 30; v -= 0.4) { const i = tileOf(u, v); if (i < 0) continue; const x = (i % W + 0.5) * TILE, y = (Math.floor(i / W) + 0.5) * TILE; if (m.tiles[i] === T.FIELD && !(x >= f.x && x < f.x + f.w && y >= f.y && y < f.y + f.h)) m.tiles[i] = T.GRASS; }
        }
        drop.push(box(-S.half - 4, fv, S.corn, fv - 30));
        rec.corn = fi;
      }
    }
    // the fence: split rails along the farm side, the gate's posts, a mailbox
    for (const [a, b] of [[-S.half, gate - 1.8], [gate + 1.8, S.half]]) {
      for (let u = a; u < b - 0.5; u += 8) { const u2 = Math.min(b, u + 8); P('fenceline', X(u, fv), Y(u, fv), 0, { kind: 'wood', tx: Math.round(X(u2, fv) - X(u, fv)), ty: Math.round(Y(u2, fv) - Y(u, fv)) }); }
    }
    for (const sd of [-1, 1]) P('post', X(gate + sd * 1.8, fv), Y(gate + sd * 1.8, fv), 5, { h: 44 });
    P('mailbox', X(gate - 2.6, -(hwT + 1.2)), Y(gate - 2.6, -(hwT + 1.2)), 0, null);
    // sunflowers along the fence on the road's side, wildflowers among them
    for (let u = -S.half + 0.6; u < S.half; u += 0.62) {
      if (Math.abs(u - gate) < 2.6) continue;
      const left = u < gate, h = hh(Math.round(u * 10), S.at[1], 83);
      if (left || h < 0.55) {   // (dense clumps of tall sunflowers, two deep along the fence; a gap now and then)
        if (hh(Math.round(u * 3), S.at[0], 85) < 0.12) continue;
        P('flowers_big', X(u, fv + 0.55), Y(u, fv + 0.55), 0, { sp: 'sunflowers', k: 1.45 });
        if (h < 0.7) P('flowers_big', X(u + 0.3, fv + 1.25), Y(u + 0.3, fv + 1.25), 0, { sp: 'sunflowers', k: 1.2 });
        out.sunflowers++;
      } else if (h < 0.8) P('flowers_a', X(u, fv + 0.9), Y(u, fv + 0.9), 0, { sp: h < 0.7 ? 'poppies' : 'daisies', k: 1 });
    }
    // the lane: dirt from the road through the gate, wheel ruts with grass between
    for (let v = -hwT + 0.2; v >= fv - 16; v -= 0.4) for (let w = -1.4; w <= 1.4; w += 0.4) {
      const i = tileOf(gate + w, v);
      if (i < 0 || !soft(i) || m.tiles[i] === T.FIELD) continue;
      m.tiles[i] = Math.abs(w) < 0.5 && v < fv ? T.GRASS : T.DIRT; m.reserve[i] |= RES;
    }
    rec.gate = { x: Math.round(X(gate, fv)), y: Math.round(Y(gate, fv)) };
    rec.pickup = { x: Math.round(X(gate, fv - 4.5)), y: Math.round(Y(gate, fv - 4.5)), a: Math.round(ang(0, 1) * 1000) / 1000 };
    rec.farmer = { x: Math.round(X(gate + 1.6, fv - 2.4)), y: Math.round(Y(gate + 1.6, fv - 2.4)), a: Math.round(ang(-1, 1) * 1000) / 1000 };
    drop.push(box(gate - 3, -hwT, gate + 3, fv - 16));
    // the pond: where there's open grass for it - a ragged round, reeds round its far rim, lilies; the windmill pump and
    // its round trough on the lane's side of it
    if (S.pond !== undefined) {
      const pu = S.pond > gate ? Math.min(S.pond, gate - 9) : S.pond, pv = fv - 8.5, R = 4.6, PX = X(pu, pv), PY = Y(pu, pv);
      const ptx = Math.floor(PX / TILE), pty = Math.floor(PY / TILE);
      let ok = true;
      for (let dy = -6; dy <= 6 && ok; dy++) for (let dx = -6; dx <= 6; dx++) { if (!inF(ptx + dx, pty + dy)) { ok = false; break; } const i = idx(ptx + dx, pty + dy); if (!soft(i) || m.tiles[i] === T.FIELD || m.dist[i] !== D_VALLEY) { ok = false; break; } }
      if (ok) {
        for (let dy = -6; dy <= 6; dy++) for (let dx = -6; dx <= 6; dx++) {
          const j = (((dx + 7) * 5 + (dy + 7) * 3) % 6), rr = R * (0.84 + 0.24 * hh(j, ptx + pty, 901)), d2 = dx * dx + dy * dy * 1.2;
          if (d2 > rr * rr) continue;
          const i = idx(ptx + dx, pty + dy);
          m.tiles[i] = T.WATER; m.land[i] = 0; if (m.lake) m.lake[i] = 2; if (m.river) m.river[i] = 0; m.reserve[i] |= RES;
          if (d2 > (rr - 1.3) * (rr - 1.3) && dy * cs * ny + dx * cs * nx < 0 && hh(dx, dy, 902) < 0.6) P('shrub_a', (ptx + dx + 0.5) * TILE, (pty + dy + 0.5) * TILE, 0, { sp: hh(dx, dy, 903) < 0.5 ? 'reeds' : 'cattails', k: 1 });
        }
        for (let j = 0; j < 4; j++) P('lily', PX + (hh(j, 1, 904) - 0.5) * R * TILE, PY + (hh(j, 2, 904) - 0.5) * R * TILE * 0.8, 0, { v: j });
        drop.push([PX - 8 * TILE, PY - 8 * TILE, PX + 8 * TILE, PY + 8 * TILE]);
        const wu = pu + (gate > pu ? 5.4 : -5.4), wx = X(wu, pv + 2.4), wy = Y(wu, pv + 2.4);
        P('windmill', wx, wy, 18, { h: 176 });
        if (m.addSolidProp) m.addSolidProp(wx, wy, 18);
        P('stocktank', X(wu + (gate > pu ? 2.4 : -2.4), pv + 3.4), Y(wu + (gate > pu ? 2.4 : -2.4), pv + 3.4), 16, { r: 15 });
        P('boulder', X(pu - 4.6, pv + 1), Y(pu - 4.6, pv + 1), 12, { s: 26 });
        m.natureSites.push({ kind: 'pond', name: `${S.name} farm pond`, x: Math.round(PX), y: Math.round(PY), r: Math.round(R * TILE) });
        rec.pond = { x: Math.round(PX), y: Math.round(PY), r: Math.round(R * TILE) };
        out.ponds++;
      }
    }
    // the power line: poles on the farm side between the road and the fence, wired pole to pole
    let prev = null;
    for (let u = -S.half + 2; u <= S.half; u += 9) {
      const x = Math.round(X(u, -(hwT + 1.2))), y = Math.round(Y(u, -(hwT + 1.2)));
      props.push(['upole', x, y, 5, prev ? { wx: prev[0], wy: prev[1] } : null]);
      prev = [x, y];
    }
    // big round trees (the corners framed)
    for (const [u, v] of S.trees || []) { const i = tileOf(u, -v); if (i >= 0 && (soft(i) || m.tiles[i] === T.GRASS) && m.tiles[i] !== T.FIELD && m.tiles[i] !== T.WATER) P('tree_a', X(u, -v), Y(u, -v), 14, { sp: 'oak', k: 1.75 + hh(u, v, 88) * 0.35 }); }
    // the verges gone dry and golden in late summer (the ground bake: world3-countyroad.js rec.dry)
    rec.dry = box(-S.half - 6, -(hwT + 26), S.half + 6, hwT + 26).map((q) => Math.round(q));
    // the crops standing tall where they show (the hero's view): the wheat's standing half and the corn as strips of
    // stalks over their ground, the strips' ends staggered so the cut's edge and the field's run soft
    if (S.hero) {
      const strips = (fi, kind, u0, u1, vA, vB, cut) => {
        if (fi < 0) return;
        const f = m.fields[fi];
        for (let v = vA; v * Math.sign(vB - vA) <= vB * Math.sign(vB - vA); v += Math.sign(vB - vA) * (kind === 'corn' ? 1.8 : 1.5)) for (let u = u0 + hh(Math.round(v * 7), fi, 89) * 2; u < u1; u += kind === 'corn' ? 3.6 : 3.7) {
          const x = X(u + 1.8, v), y = Y(u + 1.8, v), tx2 = Math.floor(x / TILE), ty2 = Math.floor(y / TILE);
          if (!inF(tx2, ty2) || m.tiles[idx(tx2, ty2)] !== T.FIELD || !(x >= f.x && x < f.x + f.w && y >= f.y && y < f.y + f.h)) continue;
          if (cut && x + 60 >= cut[0] + (hh(Math.round(v * 5), 3, 90) - 0.3) * 70) continue;
          P('cropstrip', x, y, 0, { k: kind });
        }
      };
      strips(rec.corn ?? -1, 'corn', -S.half, S.half + 2, fv - 1.4, fv - 32, null);
    }
    m.natureSites.push({ kind: 'countyroad', name: S.name, x: rec.x, y: rec.y });
    (m.landmarks ||= []).push({ name: `${S.name} (the county road)`, type: 'farmroad', x: rec.x - S.half * TILE, y: rec.y - 20 * TILE, w: S.half * 2 * TILE, h: 40 * TILE });
    m.countyRoads.push(rec);
    out.stretches++;
  }
  // what stood where the canal, the lane, the pond, the fence line and the cut-back corn are now (their trees, shrubs,
  // flowers, rocks, the old poles and fences)
  if (drop.length && H3.removeProps) {
    const STAND = /^(tree_|shrub_|bush_|flowers_|boulder|log$|upole|fenceline|post$|mailbox|hayBale|scarecrow)/, gone = new Set();
    for (const p of m.props) if (p && STAND.test(p.t) && drop.some(([x0, y0, x1, y1]) => p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1)) gone.add(p.x + ',' + p.y);
    if (gone.size) H3.removeProps(m, (x, y) => gone.has(x + ',' + y));
  }
  for (const [t, x, y, r, ex] of props) H3.addProp(m, t, x, y, r, ex);
  return out;
}
