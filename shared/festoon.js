// Hanging lights (the owner, 2026-11-16: "hanging lights are okay when they had something to hang from. They don't need
// to be straight across either it would be better if they had some slack and maybe larger light bulbs instead of strings
// of lights, so more like bistro lights than Christmas lights. And lanterns could look more like lanterns, like the red
// lanterns in the concepts"). Every run of lights in the world is a 'festoon' prop - { x, y, tx, ty, h, k, ends }: strung
// from (x, y) to (x + tx, y + ty) (px), made fast h px up at both ends, k 'lantern' (red paper lanterns, concept WC422),
// 'cable' (a bare cable) or none (bistro bulbs). This file is the one place that says what a run hangs from and how
// much it sags - the world build (hangLights3, the done hook's last word on the lights), the art (client/art2/game/
// statics.js makeFestoon) and the lint (tools/placementlint.mjs 'festoons') all read it.
//   - ends: what each end is made fast to - 'wall' (a bracket on a building's face or an awning's), 'pole' (a post of its
//     own, drawn with the run), or the thing standing there: 'tree', 'palm', 'lamp' (a lamp post), 'stall' (a stall's,
//     a pergola's, a gazebo's, a gate's frame). A run with nothing at an end gets a post if the ground there takes one,
//     else it comes down. Across a road only between buildings, posts or lamps on both sides - never a post in the road.
//   - slack: the line sags at its middle by FESTOON.SAG of its span (one of three, by where it hangs - a little
//     variety, few sprites), and its lowest point stays over a head (FESTOON.CLEAR): a long run is raised (to H_MAX at
//     most) or cut into spans with a post at each cut.
// Shared code run in the world build: integer arithmetic only (no Math.sin & co: the world comes out the same in every
// engine - shared/dmath.js).
import { TILE, T } from './constants.js';

export const FESTOON = {
  SAG: [0.08, 0.1, 0.12],   // the sag at the middle, a share of the span (by festoonSag's hash)
  CLEAR: 38,                // px: the line's lowest point at least this high - its bulbs over people's heads
  CLEAR_LANTERN: 54,        // ... a lantern line's: the lanterns hang LANTERN_DROP under it
  H_MAX: 80,                // px: a run is raised to at most this to keep its slack over people's heads
  SPAN_MAX: 10 * TILE,      // px: a longer run is cut into equal spans, a post at each cut
  END_R: 20,                // px: a tree, a lamp post, a stall this near an end holds it
  WALL_R: 18,               // px: a building's face (its tiles) this near an end takes a bracket
  BULB_GAP: 22,             // px along the run between two bistro bulbs (the art: statics.js makeFestoon)
  LANTERN_GAP: 34,          // ... between two paper lanterns
  LANTERN_DROP: 21,         // px a lantern hangs under its line, tassel and all
};
// the things a line can be made fast to, by prop type -> the end's name (tall enough to hold a line over people's heads:
// not a bollard, a lantern on its short post or a food cart - an end there gets a post of its own beside it)
export const ANCHOR_OF = (t) => (/^(tree_[ab]|redwood|deadtree)$/.test(t) ? 'tree'
  : /^palm(_[abcds])?$/.test(t) ? 'palm'
  : /^(lamp|plamp|bannerpole|upole|flagpole|sigpole)$/.test(t) ? 'lamp'
  : /^(stall|mstall|tent|pergola|perg|gazebo|pavilion|bathpav|gatearch|gatepier|bandstand|tbar|stilthut|cottage)$/.test(t) ? 'stall'
  : null);
// ... and by the prop itself: a tall timber post (p.h, the hand plans' market posts) holds one too
export const anchorOf = (p) => ANCHOR_OF(p.t) || (p.t === 'post' && (p.h || 0) >= 40 ? 'post' : null);
export const HELD = new Set(['wall', 'pole', 'tree', 'palm', 'lamp', 'stall', 'post']);

const hashXY = (x, y) => { let h = Math.imul(Math.round(x) | 0, 73856093) ^ Math.imul(Math.round(y) | 0, 19349663); h = Math.imul(h ^ (h >>> 13), 1274126177); return (h ^ (h >>> 16)) >>> 0; };
export const festoonSpan = (f) => Math.hypot(f.tx || 0, f.ty || 0);
// the run's sag at its middle (px)
export const festoonSag = (f) => Math.round(festoonSpan(f) * FESTOON.SAG[hashXY(f.x, f.y) % 3]);
// how high its lowest point hangs (px)
export const festoonLow = (f) => (f.h || 40) - festoonSag(f);
// how high its lowest point must hang
export const festoonClear = (f) => (f.k === 'lantern' ? FESTOON.CLEAR_LANTERN : FESTOON.CLEAR);
export const festoonEnds = (f) => [{ x: f.x, y: f.y }, { x: f.x + (f.tx || 0), y: f.y + (f.ty || 0) }];

// The world's look-ups the checks need: tiles, buildings, the anchoring props near a point
export function festoonWorld(m) {
  const C = 64, grid = new Map();
  (m.props || []).forEach((p) => { if (!p || !anchorOf(p)) return; const k = Math.floor(p.x / C) * 65536 + Math.floor(p.y / C); let l = grid.get(k); if (!l) grid.set(k, (l = [])); l.push(p); });
  const tileAt = (x, y) => { const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE); return m.inside(tx, ty) ? m.tiles[m.idx(tx, ty)] : -1; };
  const bldAt = (x, y) => { const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE); if (!m.inside(tx, ty)) return false; const i = m.idx(tx, ty); return (m.bld && m.bld[i] >= 0) || m.tiles[i] === T.BUILDING || m.tiles[i] === T.WALL; };
  const wallNear = (x, y) => { const r = FESTOON.WALL_R; return [[0, 0], [0, -r], [0, r], [-r, 0], [r, 0]].some(([dx, dy]) => bldAt(x + dx, y + dy)); };
  // the nearest anchoring thing to (x, y) within END_R: { p, kind } or null
  const anchorNear = (x, y) => {
    let best = null, bd = FESTOON.END_R + 1;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) for (const p of grid.get((Math.floor(x / C) + i) * 65536 + Math.floor(y / C) + j) || []) {
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < bd) { bd = d; best = p; }
    }
    return best ? { p: best, kind: anchorOf(best) } : null;
  };
  // a post can stand here: open ground, not a road, the water, a building or the rails' bed
  const postOk = (x, y) => { const t = tileAt(x, y); return t >= 0 && t !== T.ROAD && t !== T.BRIDGE && t !== T.WATER && t !== T.DEEP && t !== T.BUILDING && t !== T.WALL && !bldAt(x, y); };
  const roadUnder = (f) => { const [a, b] = festoonEnds(f), n = Math.max(1, Math.ceil(festoonSpan(f) / 8)); let k = 0; for (let i = 0; i <= n; i++) { const t = tileAt(a.x + (b.x - a.x) * i / n, a.y + (b.y - a.y) * i / n); if (t === T.ROAD || t === T.BRIDGE) k++; } return k; };
  return { tileAt, bldAt, wallNear, anchorNear, postOk, roadUnder };
}

// What's wrong with a run as it stands (the lint's look, and the build's): null, or why
export function festoonWhy(W, f) {
  const ends = f.ends || [];
  for (let i = 0; i < 2; i++) {
    const e = ends[i], p = festoonEnds(f)[i];
    if (!HELD.has(e)) return `end ${i + 1} made fast to nothing`;
    if (e === 'wall' && !W.wallNear(p.x, p.y)) return `end ${i + 1}: a bracket with no wall`;
    if (e === 'pole' && !W.postOk(p.x, p.y)) return `end ${i + 1}: a post on ${W.tileAt(p.x, p.y) === T.ROAD ? 'the road' : 'no ground'}`;
    if (e !== 'wall' && e !== 'pole') { const a = W.anchorNear(p.x, p.y); if (!a) return `end ${i + 1}: no ${e} there`; }
  }
  if (f.k === 'cable') return null;
  const span = festoonSpan(f), sag = festoonSag(f);
  if (span > 24 && (sag < span * FESTOON.SAG[0] - 1 || sag > span * FESTOON.SAG[2] + 1)) return `sag ${sag} px on a ${Math.round(span)} px span`;
  if (span > 24 && festoonLow(f) < festoonClear(f)) return `hangs to ${festoonLow(f)} px (under a head)`;
  if (span > FESTOON.SPAN_MAX + 1) return `a ${Math.round(span / TILE)}-tile span with no post`;
  return null;
}

// The world build's last word on the lights (shared/world3-world.js done hook, after every pass that strings any): each
// run's ends made fast to what stands there (or a post, or the run comes down), a long run cut into spans with posts,
// raised so its slack clears heads. H: the build's { addProp, removeProps }. Arithmetic only; one pass over the runs.
export function hangLights3(m, H) {
  const out = { runs: 0, posts: 0, walls: 0, held: 0, split: 0, raised: 0, dropped: 0 };
  if (!Array.isArray(m.props)) return out;
  const W = festoonWorld(m), gone = [], add = [];
  // what holds end i (p: where it is) -> { k, x, y }: the end moved onto what holds it - the wall's face, the trunk, the
  // lamp post - so the line meets it; null if nothing can
  const face = (x, y) => {   // (the nearest point on a building's face within WALL_R: along the four ways, 2 px steps)
    let best = null;
    for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) for (let d = 0; d <= FESTOON.WALL_R; d += 2) if (W.bldAt(x + dx * d, y + dy * d)) { if (!best || d < best.d) best = { d, x: x + dx * Math.max(0, d - 3), y: y + dy * Math.max(0, d - 3) }; break; }
    return best;
  };
  const endOf = (f, i, p) => {
    const want = (f.ends || [])[i], w = W.wallNear(p.x, p.y) ? face(p.x, p.y) : null;
    if (want === 'wall' && w) return { k: 'wall', x: w.x, y: w.y };
    const a = W.anchorNear(p.x, p.y);
    if (a) return { k: a.kind, x: a.p.x, y: a.p.y };   // (the lamp, the tree, the stall there holds it: no post beside it)
    if (want !== 'pole' && w) return { k: 'wall', x: w.x, y: w.y };
    if (W.postOk(p.x, p.y)) return { k: 'pole', x: p.x, y: p.y };
    return w ? { k: 'wall', x: w.x, y: w.y } : null;
  };
  for (const f of m.props) {
    if (!f || f.t !== 'festoon') continue;
    out.runs++;
    const span = festoonSpan(f);
    // a long run: cut into equal spans, a post at each cut (moved along a little off a road or a wall)
    if (f.k !== 'cable' && span > FESTOON.SPAN_MAX) {
      const n = Math.ceil(span / FESTOON.SPAN_MAX), cuts = [0];
      let ok = true;
      for (let i = 1; i < n; i++) {
        let c = -1;
        for (const d of [0, 0.12, -0.12, 0.24, -0.24, 0.36, -0.36]) { const t = (i + d) / n, x = f.x + (f.tx || 0) * t, y = f.y + (f.ty || 0) * t; if (W.postOk(x, y)) { c = t; break; } }
        if (c < 0) { ok = false; break; }
        cuts.push(c);
      }
      if (ok) {
        cuts.push(1);
        const tx = f.tx || 0, ty = f.ty || 0, x0 = f.x, y0 = f.y, e0 = (f.ends || [])[0], e1 = (f.ends || [])[1];
        for (let i = 0; i + 1 < cuts.length; i++) {
          const ax = x0 + tx * cuts[i], ay = y0 + ty * cuts[i], bx = x0 + tx * cuts[i + 1], by = y0 + ty * cuts[i + 1];
          const seg = { t: 'festoon', x: Math.round(ax), y: Math.round(ay), tx: Math.round(bx - Math.round(ax)), ty: Math.round(by - Math.round(ay)), h: f.h, ends: [i === 0 ? e0 : 'pole', i === cuts.length - 2 ? e1 : 'pole'], ...(f.k ? { k: f.k } : {}) };
          if (i === 0) Object.assign(f, seg); else add.push(seg);
        }
        out.split++;
      }
    }
  }
  for (const s of add) { if (H && H.addProp) { const { t, x, y, ...extra } = s; H.addProp(m, t, x, y, 0, extra); } else m.props.push(s); }   // (at the end of the list: no other prop's number moves)
  for (const f of m.props) {
    if (!f || f.t !== 'festoon') continue;
    const P = festoonEnds(f), q = [endOf(f, 0, P[0]), endOf(f, 1, P[1])];
    if (!q[0] || !q[1]) { gone.push(f); continue; }
    const e = q.map((a) => a.k);
    f.ends = e; f.x = Math.round(q[0].x); f.y = Math.round(q[0].y); f.tx = Math.round(q[1].x) - f.x; f.ty = Math.round(q[1].y) - f.y;
    if (festoonSpan(f) < TILE) { gone.push(f); continue; }   // (both ends on the one thing: no run)
    for (const k of e) { if (k === 'pole') out.posts++; else if (k === 'wall') out.walls++; else out.held++; }
    if (f.k === 'cable') continue;
    // its slack over people's heads: raised as far as H_MAX; past that, a run this long and this low comes down
    const low = festoonLow(f);
    if (low < festoonClear(f)) {
      const h = (f.h || 40) + (festoonClear(f) - low);
      if (h <= FESTOON.H_MAX) { f.h = h; out.raised++; } else { gone.push(f); continue; }
    }
  }
  if (gone.length) {
    out.dropped = gone.length;
    const g = new Set(gone);
    if (H && H.removeProps) { const at = new Set(gone.map((f) => f.x + ',' + f.y)); H.removeProps(m, (x, y) => at.has(x + ',' + y) && m.props.some((q) => g.has(q) && q.x === x && q.y === y)); }
    else m.props = m.props.filter((q) => !g.has(q));
  }
  return out;
}
