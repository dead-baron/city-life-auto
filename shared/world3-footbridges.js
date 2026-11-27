// Every footbridge can be walked and seen (the redwood overhaul's crossings, 2026-11-24; the owner, 18:00: "a lot of
// bridges over streams aren't at the right angle or they don't actually let you walk over them"). Counted in the built
// world first: thirteen footbridges over water (plank bridges, log bridges, the creek sites' own). Three were pictures
// only - the Stadium park's across its pond and West Hills' two over the creek had water tiles under them, no deck;
// log bridges on a trail that clips a lake's edge ended in the water; the Giants Loop's ended on grass a tile and a
// half from its trail; Highland Way's had a giant redwood standing over its south end.
// One pass over all of them, after every place is made:
//   - the deck: bridge tiles under the whole of it wherever there is water (walked over, swum under - the trails' own
//     rule, shared/world3-trails.js);
//   - the banks: an end that stops over water is carried on to the bank (never shortened); a short bridge with no bank
//     within reach is no crossing and goes (three log stubs where a trail steps onto a road's bridge over a lake);
//   - the ends: where a bridge's end has no path at it and one runs within a few tiles on its own bank, a worn link is
//     laid to it - dirt in the wilds, paving where the path is paved;
//   - in sight: no tree left standing where its trunk or crown is drawn over the deck (the camera looks north - the
//     woods' finds' rule, shared/world3-clearings.js COVER).
// For the whole-world build only (shared/world3-world.js). Deterministic: arithmetic only; Math's trig only inside
// generateCity (withDeterministicMath).
import { TILE, T } from './constants.js';
import { COVER, TREE_COVER } from './world3-clearings.js';

const RES = 32;
export const FOOTBRIDGE = {
  kinds: ['fbridge', 'logbridge'],   // (a rope bridge hangs over a gorge's rock: its own deck, shared/world3-trails.js)
  half: 14,       // px: the deck's half width
  bank: 28,       // px of deck on the bank beyond the water's edge
  reach: 6,       // tiles: how far an end is carried on to find its bank
  link: 7,        // tiles: how far a path may be for a link to be laid to it
  stub: 96,       // px: a bridge no longer than this with no bank to reach is taken out
};
const PATH = new Set([T.DIRT, T.SIDEWALK, T.PLAZA, T.ROAD, T.SAND, T.LOT, T.DOCK]);
const PAVED = new Set([T.SIDEWALK, T.PLAZA]);
const GROWS = /^(tree_|redwood$|shrub_|bush_|flowers_|rwstump$|rwlog$|log$|boulder$|rootplate$)/;
const TALL = /^(tree_a|tree_b|redwood)$/;

export function footbridges3(m, H3) {
  const out = { bridges: 0, decked: 0, lengthened: 0, links: 0, linkTiles: 0, cleared: 0, dry: 0, noBank: 0, stubs: 0 };
  const F = FOOTBRIDGE, W = m.w, HH = m.h, inF = (x, y) => x >= 0 && y >= 0 && x < W && y < HH, idx = (x, y) => y * W + x;
  const tAt = (x, y) => { const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE); return inF(tx, ty) ? m.tiles[idx(tx, ty)] : -1; };
  const wet = (t) => t === T.WATER || t === T.DEEP, over = (t) => wet(t) || t === T.BRIDGE;
  const list = [];
  for (const p of m.props) if (p && F.kinds.includes(p.t)) list.push({ p, x: p.x, y: p.y, a: p.a || 0, len: p.len || 140 });
  for (const s of m.natureSites || []) if (s.footbridge) list.push({ p: null, x: s.footbridge.x, y: s.footbridge.y, a: s.footbridge.a || 0, len: s.footbridge.len || 140 });
  const drop = new Set(), decks = [], stubs = new Set();
  for (const b of list) {
    out.bridges++;
    const ux = Math.cos(b.a), uy = Math.sin(b.a);
    // the water it crosses, along its own line: from the water nearest its middle out to both banks
    let c = null;
    for (let d = 0; d <= b.len / 2 && c === null; d += 8) for (const sg of [1, -1]) if (over(tAt(b.x + ux * d * sg, b.y + uy * d * sg))) { c = d * sg; break; }
    if (c === null) { out.dry++; continue; }
    const edge = (sg) => {
      let last = c, land = 0;
      for (let d = c + sg * 8; Math.abs(d) <= b.len / 2 + F.reach * TILE; d += sg * 8) {
        if (over(tAt(b.x + ux * d, b.y + uy * d))) { last = d; land = 0; } else if (++land >= 3) return last;
      }
      return null;
    };
    const d0 = edge(-1), d1 = edge(1);
    let lo = -b.len / 2, hi = b.len / 2;
    if (d0 === null || d1 === null) {
      if (b.p && b.len <= F.stub) { stubs.add(b.p.x + ',' + b.p.y); out.stubs++; continue; }
      out.noBank++;
    }
    else if (b.p && (d0 - F.bank < lo - 8 || d1 + F.bank > hi + 8)) {
      // an end over the water: on to its bank
      lo = Math.min(lo, d0 - F.bank); hi = Math.max(hi, d1 + F.bank);
      const mid = (lo + hi) / 2;
      b.x += ux * mid; b.y += uy * mid; b.len = Math.round((hi - lo) / 8) * 8; lo = -b.len / 2; hi = b.len / 2;
      b.p.x = Math.round(b.x); b.p.y = Math.round(b.y); b.p.len = b.len; b.x = b.p.x; b.y = b.p.y;
      out.lengthened++;
    }
    // the deck
    let laid = 0;
    for (let d = lo; d <= hi; d += 8) for (const o of [-F.half, 0, F.half]) {
      const px = b.x + ux * d - uy * o, py = b.y + uy * d + ux * o, tx = Math.floor(px / TILE), ty = Math.floor(py / TILE);
      if (!inF(tx, ty)) continue;
      const i = idx(tx, ty);
      if (wet(m.tiles[i])) { m.tiles[i] = T.BRIDGE; m.reserve[i] |= RES; laid++; }
    }
    if (laid) out.decked++;
    for (let d = lo; d <= hi; d += 16) decks.push([b.x + ux * d, b.y + uy * d]);
    // its ends: a path at each, or a link to the one near by on the same bank
    for (const sg of [-1, 1]) {
      const ex = b.x + ux * sg * (b.len / 2 + 12), ey = b.y + uy * sg * (b.len / 2 + 12), etx = Math.floor(ex / TILE), ety = Math.floor(ey / TILE);
      if (!inF(etx, ety) || over(m.tiles[idx(etx, ety)])) continue;
      let has = false;
      for (let dy = -1; dy <= 1 && !has; dy++) for (let dx = -1; dx <= 1; dx++) if (inF(etx + dx, ety + dy) && PATH.has(m.tiles[idx(etx + dx, ety + dy)])) { has = true; break; }
      if (has) continue;
      // the nearest path tile on this bank, in a straight line over dry ground
      let best = null;
      for (let dy = -F.link; dy <= F.link; dy++) for (let dx = -F.link; dx <= F.link; dx++) {
        const tx = etx + dx, ty = ety + dy, dd = dx * dx + dy * dy;
        if (!inF(tx, ty) || dd > F.link * F.link || !PATH.has(m.tiles[idx(tx, ty)]) || (best && dd >= best.dd)) continue;
        if ((dx * ux + dy * uy) * sg < -1) continue;   // (not back across the water)
        let dry = true;
        for (let k = 1, n = Math.ceil(Math.sqrt(dd) * 2); k < n && dry; k++) if (over(tAt(ex + dx * TILE * k / n, ey + dy * TILE * k / n))) dry = false;
        if (dry) best = { tx, ty, dd };
      }
      if (!best) continue;
      const paved = PAVED.has(m.tiles[idx(best.tx, best.ty)]), gx = (best.tx + 0.5) * TILE, gy = (best.ty + 0.5) * TILE, n = Math.ceil(Math.hypot(gx - ex, gy - ey) / 8);
      for (let k = 0; k <= n; k++) {
        const px = ex + (gx - ex) * k / n, py = ey + (gy - ey) * k / n;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const tx = Math.floor(px / TILE) + dx, ty = Math.floor(py / TILE) + dy;
          if (!inF(tx, ty) || Math.hypot((tx + 0.5) * TILE - px, (ty + 0.5) * TILE - py) > 20) continue;
          const i = idx(tx, ty);
          if (m.tiles[i] !== T.GRASS || (m.bld && m.bld[i] >= 0)) continue;
          m.tiles[i] = paved ? T.PLAZA : T.DIRT; m.reserve[i] |= RES; m.reserve[i] &= ~128; out.linkTiles++;
        }
        for (const p of m.props) if (p && GROWS.test(p.t) && Math.abs(p.x - px) < 26 && Math.abs(p.y - py) < 26) drop.add(p.x + ',' + p.y);
      }
      out.links++;
    }
  }
  // in sight: what stands south of a deck and is drawn over it
  if (decks.length) {
    for (const p of m.props) {
      if (!p || !TALL.test(p.t)) continue;
      const c = p.t === 'redwood' ? COVER[p.sp] || COVER.giant : TREE_COVER, s = p.k && p.t === 'redwood' ? Math.min(1, p.k) : 1, tw = c[0] * s, th = c[1] * s, cw = c[2] * s;
      let hit = 0;
      for (const [x, y] of decks) {
        const dy = p.y - y, dx = Math.abs(p.x - x);
        if (dy <= -6 || dy > th || dx >= cw) continue;
        if (dy < th * 0.42 ? dx < tw + 10 : true) { if (++hit >= 2) break; }
      }
      if (hit >= 2) drop.add(p.x + ',' + p.y);
    }
  }
  if ((drop.size || stubs.size) && H3 && H3.removeProps) {
    const keep = new Set(list.filter((b) => b.p).map((b) => b.p.x + ',' + b.p.y));
    const before = m.props.length;
    H3.removeProps(m, (x, y) => { const k = x + ',' + y; return stubs.has(k) || (drop.has(k) && !keep.has(k)); });
    out.cleared = before - m.props.length - stubs.size;
  }
  return out;
}
