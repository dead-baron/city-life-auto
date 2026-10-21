// The falls chain, part 1: the falls in view (the nature program, 2026-10-21; the handcraft research's 4.3: "each fall:
// a plunge pool, mist, a trail to a viewpoint"). The camera looks down from the south, and a tree's sprite stands up
// the screen from its foot: the giants south of Redwood Creek Falls hid it whole, and the woods' trees stood in front of
// the others. Now no tree stands where it would hide a fall - the redwoods out to as far as they stand tall (their
// sprites run some 20 tiles up the screen), the other trees a few tiles - so each fall shows from the trail below it.
// (The falls themselves are drawn a little higher and wider: client/art2/game/statics.js FALLS_LOOK.)
// For the whole-world build only (shared/world3-world.js's done hook, after the coasts'). Deterministic: arithmetic.
import { TILE } from './constants.js';

export const FALLS3 = {
  kinds: new Set(['creek', 'tarn', 'gorge', 'ledgefall']),   // the nature sites whose falls these are (Silver Thread Falls: its own, below; the ledge falls: world3-ledgefalls.js)
  tall: { re: /^(redwood|tree_)/, giant: /^redwood/, reach: 22, near: 6 },   // (tiles: how far south a giant's sprite reaches up over a fall; how far south any tree's does; either side, the fall's half-width plus this)
  side: { giant: 5, tree: 2 },   // (tiles either side of the fall's half-width: a giant's crown spreads wide)
};

export function fallsInView3(m, H3) {
  const out = { falls: 0, cleared: 0 };
  if (!H3 || !H3.removeProps) return out;
  const F = FALLS3, falls = [];
  for (const s of m.natureSites || []) if (F.kinds.has(s.kind) && s.falls && Number.isFinite(s.falls.x)) falls.push({ x: s.falls.x, y: s.falls.y, w: Math.max(s.falls.w || 64, 96) });
  const st = m.world3 && m.world3.west && m.world3.west.built && m.world3.west.built.falls;
  if (st && st.lip) falls.push({ x: (st.lip.x0 + st.lip.x1) / 2 * TILE, y: (st.lip.y + 3) * TILE, w: (st.lip.x1 - st.lip.x0) * TILE });
  out.falls = falls.length;
  if (!falls.length) return out;
  // (a tree hides a fall if it stands south of it, within the fall's width and a margin, near enough for its height)
  const hides = (p) => {
    if (!F.tall.re.test(p.t)) return false;
    const giant = F.tall.giant.test(p.t), reach = (giant ? F.tall.reach : F.tall.near) * TILE, side = (giant ? F.side.giant : F.side.tree) * TILE;
    return falls.some((f) => p.y > f.y - TILE && p.y < f.y + reach && Math.abs(p.x - f.x) < f.w / 2 + side);
  };
  const gone = new Set();
  for (const p of m.props) if (p && hides(p)) gone.add(p.x + ',' + p.y);
  if (gone.size) { const before = m.props.length; H3.removeProps(m, (x, y) => gone.has(x + ',' + y)); out.cleared = before - m.props.length; }
  return out;
}
