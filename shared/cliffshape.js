// A cliff face's shape (the 'cliff' prop: shared/world3-relief.js lays them along the relief's cliff bands, the set
// pieces - the mines' adits, the coves - by hand; client/art2/game/statics.js draws them). One shape for both, so the
// rock drawn and the rock you can't walk into are the same (the owner, 2026-11-04: "There are cliffs in the desert that
// you can walk into"):
//   - cliffOutline: the rock's outline on the ground - a squashed superellipse across the face's box, ragged, its south
//     side straight round the middle (the art's plateau is cut to it);
//   - cliffSolid: the tiles a face makes solid - every tile mostly under the rock as it's drawn: its outline on the
//     ground, and, since the face stands up the screen (its tiers h px tall), the ground north of it that the face
//     hides - who stood there would be drawn inside the rock.
// No Math.pow (World v3 is built the same in every engine - shared/dmath.js): the superellipse's power by square roots.
import { TILE } from './constants.js';

export const CLIFF_PAD = 30;   // (the art's field round the box: the outline's ragged lobes and the plateau's jag)
const SLACK = 6;   // (px: the plateau's jag - its rock breaks a few px past the outline and its tiers' insets)
// v ** 0.55 for v in [0, 1], from square roots alone (0.5 + 1/32 + 1/64 + 1/512 + 1/1024 + 1/4096: 0.55005)
function pow55(v) {
  if (v <= 0) return 0;
  const r2 = Math.sqrt(v), r4 = Math.sqrt(r2), r8 = Math.sqrt(r4), r16 = Math.sqrt(r8), r32 = Math.sqrt(r16), r64 = Math.sqrt(r32);
  const r128 = Math.sqrt(r64), r256 = Math.sqrt(r128), r512 = Math.sqrt(r256), r1024 = Math.sqrt(r512), r2048 = Math.sqrt(r1024), r4096 = Math.sqrt(r2048);
  return r2 * r32 * r64 * r512 * r1024 * r4096;
}
// the art's hash (client/art2/gbuf.js hash): the same integers, so the same jitter
function hash(x, y, s = 0) { let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }

// the outline of a face w x d px (seed s) as [x, y] px from its anchor - the middle of its foot (the prop's x, y): x
// across, y up to -d (north) from 0 (the foot)
export function cliffOutline(w, d, s = 1) {
  const poly = [], TAU = Math.PI * 2;
  for (let k = 0; k < 48; k++) {
    const a = k / 48 * TAU, c = Math.cos(a), sn = Math.sin(a);
    let x = Math.sign(c) * pow55(Math.abs(c)) * w / 2, y = Math.sign(sn) * pow55(Math.abs(sn)) * d / 2;
    const j = 1 + (hash(k, 3, s) - 0.5) * 0.18 + Math.sin(a * 5 + s) * 0.05;
    x *= j; y *= j;
    if (sn > 0 && Math.abs(x) < w * 0.22) y = d / 2;   // (the face round the adit stays straight)
    poly.push([x, y - d / 2]);
  }
  return poly;
}
// the face's tiers (the art's plateau): [inset px from the outline, height px]
export const cliffTiers = (d, h) => [[0, h * 0.6], [d * 0.22, h * 0.84], [d * 0.42, h]];

const inPoly = (poly, x, y) => {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};
// how far inside the outline (px) a point is: the distance to its nearest edge, negative outside
function depthIn(poly, x, y) {
  let best = 1e9;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [ax, ay] = poly[j], [bx, by] = poly[i], ex = bx - ax, ey = by - ay, l2 = ex * ex + ey * ey;
    const t = l2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * ex + (y - ay) * ey) / l2)) : 0, dx = x - ax - ex * t, dy = y - ay - ey * t;
    best = Math.min(best, dx * dx + dy * dy);
  }
  const d = Math.sqrt(best);
  return inPoly(poly, x, y) ? d : -d;
}
// the tiles a face at (px, py) px makes solid: [[tx, ty]...] - each tile whose middle is under its rock as drawn (on
// the outline, or under one of its tiers as it stands up the screen: a point (x, y) is hidden if some point (x, y + z)
// south of it stands a tier at least z tall)
export function cliffSolid(px, py, w, d, h, s = 1) {
  const poly = cliffOutline(w, d, s), tiers = cliffTiers(d, h), out = [];
  const tx0 = Math.floor((px - w / 2 - CLIFF_PAD) / TILE), tx1 = Math.floor((px + w / 2 + CLIFF_PAD) / TILE);
  const ty0 = Math.floor((py - d - h - CLIFF_PAD) / TILE), ty1 = Math.floor((py + CLIFF_PAD) / TILE);
  for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
    const x = (tx + 0.5) * TILE - px, y = (ty + 0.5) * TILE - py;
    let hit = false;
    // (stepping south from the tile's middle: the ground there stands its tier's height - tall enough to hide it?)
    for (let z = 0; z <= h && !hit; z += 4) {
      if (y + z > 0) break;
      const dd = depthIn(poly, x, y + z);
      if (dd < -SLACK) continue;
      let th = 0;
      for (const [ins, hh] of tiers) if (dd >= ins - SLACK) th = hh;
      if (th >= z) hit = true;
    }
    if (hit) out.push([tx, ty]);
  }
  return out;
}
