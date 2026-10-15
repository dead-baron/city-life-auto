// World v3b's airstrips (the owner, 2026-10-14: "the farm should have a small farm runway or two for crop dusters"):
// the two grass strips of Willow Valley and Brightwater, among the farm valley's fields, and Lucky Mesa's dirt strip -
// AIRSTRIPS3 (shared/world3-wild.js, data: frame tiles). Each is built in the world build's dressing pass
// (world3-world.js dress -> buildAirstrips3): the strip itself (packed dirt, mown edges kept clear of trees and
// anything else), white markers down both edges and the threshold lights at the ends, a windsock, a tin hangar, a
// fuel tank with drums, a light plane parked on the apron (a crop duster's yellow on the farm strips), and a dirt track
// out to the road. Listed as nature sites of kind 'airstrip' with their strip's rectangle (`strip`, world px: the
// flight code takes its heading from it - shared/flight.js airfields) and `duster` on the farm strips.
// Deterministic (integer data; no Math.random, no trigonometry): the world comes out the same in every engine.
import { T, TILE } from './constants.js';
import { AIRSTRIPS3 } from './world3-wild.js';

const RES = 32;   // (m.reserve: what naturesites.js marks as a designed place's - no trees, no dressing)
const OPEN = new Set([T.GRASS, T.DIRT, T.SAND, T.FIELD]);

// H: { addProp, simpleBuilding, removeProps } (map.js's dressing hook)
export function buildAirstrips3(m, H, strips = AIRSTRIPS3) {
  const out = [];
  const inFrame = (tx, ty) => tx >= 0 && ty >= 0 && tx < m.w && ty < m.h;
  const idx = (tx, ty) => ty * m.w + tx;
  const add = (t, tx, ty, r = 0, extra = null) => H.addProp(m, t, Math.round(tx * TILE), Math.round(ty * TILE), r, extra);
  for (const A0 of strips) {
    // the strip where the plan has it, else the nearest spot round it where the strip, its margin and the hangar's
    // yard stand on open ground - no road, no building, no water across it (the city and the farm roads grew round
    // the plan's spots); everything of the strip's moves with it
    const fits = (dx, dy) => {
      const [a0, b0, a1, b1] = A0.runway, [hx0, hy0, hw0, hh0] = A0.hangar;
      for (const [x0, y0, x1, y1] of [[a0 - 3, b0 - 3, a1 + 3, b1 + 3], [hx0 - 4, hy0 - 4, hx0 + hw0 + 6, hy0 + hh0 + 6]]) {
        for (let ty = y0 + dy; ty < y1 + dy; ty++) for (let tx = x0 + dx; tx < x1 + dx; tx++) if (!inFrame(tx, ty) || !OPEN.has(m.tiles[idx(tx, ty)])) return false;
      }
      return true;
    };
    let shift = null;
    for (let r = 0; r <= 260 && !shift; r += 4) {
      for (let dy = -r; dy <= r && !shift; dy += 4) for (let dx = -r; dx <= r; dx += (Math.abs(dy) === r ? 4 : 2 * r || 4)) if (fits(dx, dy)) { shift = [dx, dy]; break; }
    }
    if (!shift) continue;
    const [sdx, sdy] = shift, mv = (p) => [p[0] + sdx, p[1] + sdy];
    const A = { ...A0, runway: [A0.runway[0] + sdx, A0.runway[1] + sdy, A0.runway[2] + sdx, A0.runway[3] + sdy], hangar: [A0.hangar[0] + sdx, A0.hangar[1] + sdy, A0.hangar[2], A0.hangar[3]], windsock: mv(A0.windsock), tank: mv(A0.tank), track: null };
    const [x0, y0, x1, y1] = A.runway;
    const ew = x1 - x0 >= y1 - y0;
    const [hx, hy, hw, hh] = A.hangar;
    // the track: from the hangar's yard straight out to the nearest road (along a row, then a column), within 200 tiles
    {
      const cx = hx + (hw >> 1), cy = hy + hh + 4;
      let best = null;
      for (let r = 2; r <= 200 && !best; r += 2) for (const [ex, ey] of [[cx + r, cy], [cx - r, cy], [cx, cy + r], [cx, cy - r]]) if (inFrame(ex, ey) && m.tiles[idx(ex, ey)] === T.ROAD) { best = [ex, ey]; break; }
      A.track = best ? [[cx, cy], best] : [];
    }
    // clear what the dressing put there - the strip and a margin round it, the hangar's yard, the track
    const M = 3, box = [x0 - M, y0 - M, x1 + M, y1 + M], yard = [hx - 4, hy - 4, hx + hw + 6, hy + hh + 6];
    const inBox = (B, px, py) => px >= B[0] * TILE && px < B[2] * TILE && py >= B[1] * TILE && py < B[3] * TILE;
    const track = A.track || [];
    const nearTrack = (px, py) => {
      for (let i = 1; i < track.length; i++) {
        const [ax, ay] = track[i - 1], [bx, by] = track[i];
        const qx = px / TILE, qy = py / TILE, dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1;
        const k = Math.max(0, Math.min(1, ((qx - ax) * dx + (qy - ay) * dy) / L2));
        const ex = ax + dx * k - qx, ey = ay + dy * k - qy;
        if (ex * ex + ey * ey < 9) return true;
      }
      return false;
    };
    if (H.removeProps) H.removeProps(m, (px, py) => inBox(box, px, py) || inBox(yard, px, py) || nearTrack(px, py));
    // the strip: packed dirt (the grass strips' edges stay grass, mown: reserved, nothing grows on them)
    for (let ty = box[1]; ty < box[3]; ty++) for (let tx = box[0]; tx < box[2]; tx++) {
      if (!inFrame(tx, ty)) continue;
      const i = idx(tx, ty), t = m.tiles[i];
      if (!OPEN.has(t)) continue;
      const onStrip = tx >= x0 && tx < x1 && ty >= y0 && ty < y1;
      if (onStrip) {
        const edge = ew ? ty === y0 || ty === y1 - 1 : tx === x0 || tx === x1 - 1;
        m.set(tx, ty, A.surface === 'grass' && edge ? T.GRASS : T.DIRT);
      } else if (t === T.FIELD) m.set(tx, ty, T.GRASS);   // (the crops stop short of the strip's margin)
      m.reserve[i] |= RES;
    }
    // the markers down the edges, the thresholds' green and red
    const L = ew ? x1 - x0 : y1 - y0;
    for (let k = 2; k < L - 1; k += 6) {
      if (ew) { add('rwlight', x0 + k, y0 + 0.2, 0, { c: 'w' }); add('rwlight', x0 + k, y1 - 0.2, 0, { c: 'w' }); }
      else { add('rwlight', x0 + 0.2, y0 + k, 0, { c: 'w' }); add('rwlight', x1 - 0.2, y0 + k, 0, { c: 'w' }); }
    }
    const W = ew ? y1 - y0 : x1 - x0;
    for (let k = 1; k < W; k += 3) {
      if (ew) { add('rwlight', x0 + 0.2, y0 + k, 0, { c: 'g' }); add('rwlight', x1 - 0.2, y0 + k, 0, { c: 'r' }); }
      else { add('rwlight', x0 + k, y1 - 0.2, 0, { c: 'g' }); add('rwlight', x0 + k, y0 + 0.2, 0, { c: 'r' }); }
    }
    // the hangar and its yard (packed dirt), the fuel tank and drums, the windsock, the plane on the apron
    for (let ty = yard[1]; ty < yard[3]; ty++) for (let tx = yard[0]; tx < yard[2]; tx++) {
      if (!inFrame(tx, ty)) continue;
      const i = idx(tx, ty);
      if (OPEN.has(m.tiles[i])) { m.set(tx, ty, T.DIRT); m.reserve[i] |= RES; }
    }
    let hangar = null;
    if (H.simpleBuilding) {
      let free = true;
      for (let ty = hy; ty < hy + hh && free; ty++) for (let tx = hx; tx < hx + hw; tx++) if (!inFrame(tx, ty) || !OPEN.has(m.tiles[idx(tx, ty)])) { free = false; break; }
      if (free) hangar = H.simpleBuilding(m, hx, hy, hw, hh, `${A.name} Hangar`, 'hangar', m.dist[idx(hx, hy)], 'metal');
    }
    const [wx, wy] = A.windsock;
    add('windsock', wx, wy, 4, { a: 0.3 });
    const [fx, fy] = A.tank;
    add('otank', fx, fy, 22);
    add('drum', fx + 2.2, fy + 0.6, 6); add('drum', fx + 2.9, fy + 0.1, 6); add('drum', fx + 2.6, fy + 1.3, 6);
    // the plane: on the apron beside the hangar, its nose to the strip (a crop duster's yellow on the farm strips)
    const px = ew ? hx + hw + 4 : hx - 4, py = ew ? hy + hh / 2 : hy + hh + 4;
    const duster = A.surface === 'grass';
    add('lplane', px, py, 26, { c: duster ? 3 : 1, a: ew ? -Math.PI / 2 : 0 });
    // the track out to the road: packed dirt three tiles wide
    for (let i = 1; i < track.length; i++) {
      const [ax, ay] = track[i - 1], [bx, by] = track[i];
      const steps = Math.max(Math.abs(bx - ax), Math.abs(by - ay));
      for (let s = 0; s <= steps; s++) {
        const cx = Math.round(ax + ((bx - ax) * s) / (steps || 1)), cy = Math.round(ay + ((by - ay) * s) / (steps || 1));
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const tx = cx + dx, ty = cy + dy;
          if (!inFrame(tx, ty)) continue;
          const j = idx(tx, ty);
          if (OPEN.has(m.tiles[j])) { m.set(tx, ty, T.DIRT); m.reserve[j] |= RES; }
        }
      }
    }
    const site = {
      kind: 'airstrip', name: A.name,
      x: Math.round(((x0 + x1) / 2) * TILE), y: Math.round(((y0 + y1) / 2) * TILE),
      strip: { x: x0 * TILE, y: y0 * TILE, w: (x1 - x0) * TILE, h: (y1 - y0) * TILE },
      plane: { x: Math.round(px * TILE), y: Math.round(py * TILE) },
      ...(duster ? { duster: true } : null),
      ...(hangar ? { b: hangar.id } : null),
    };
    (m.natureSites ||= []).push(site);
    (m.landmarks ||= []).push({ name: A.name, type: 'airstrip', x: box[0] * TILE, y: box[1] * TILE, w: (box[2] - box[0]) * TILE, h: (box[3] - box[1]) * TILE });
    out.push(site);
  }
  return out;
}
