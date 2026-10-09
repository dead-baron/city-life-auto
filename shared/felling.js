// Felling trees (task #358). Which of the map's props are trees and how big (small street trees and orchard trees up
// to the giant redwoods), what each cutting tool can take on and how fast, which way a tree falls (away from the side
// it was cut from), what it lands on, and the log bundles it breaks into. Pure and deterministic: the server
// (server/systems/felling.js) and the client (client/carrylights.js draws the fall) both use it.
//
//   treeSize(prop) -> 0 (not a tree) .. 4 (a giant redwood)
//   TREE_SIZES[size]: { name, work, logs, len, wide, dmg }: work: how much cutting it takes (tool rate x seconds);
//     logs: the bundles it breaks into; len / wide: the trunk lying on the ground (px); dmg: the hurt where it lands
//   FELL_TOOLS[id]: { max, rate, name, fuel, loud }: the biggest size it can cut, its cutting rate (work per second)
//   fellTime(tool, size) -> seconds, or Infinity when the tool can't cut that size
//   fallAngle(tree, x, y) -> the angle it falls at, away from a cutter standing at (x, y)
//   underFall(tree, a, size, x, y) -> 0 (clear), or how squarely (0-1] a falling tree lands on (x, y)
//   logSpots(tree, a, size) -> [[x, y], ...] where its log bundles lie, along the fallen trunk
export const TREE_SIZES = [
  null,
  { name: 'small tree', work: 4, logs: 1, len: 64, wide: 12, dmg: 30 },
  { name: 'tree', work: 10, logs: 2, len: 104, wide: 16, dmg: 60 },
  { name: 'big redwood', work: 24, logs: 4, len: 190, wide: 22, dmg: 110 },
  { name: 'giant redwood', work: 64, logs: 9, len: 330, wide: 34, dmg: 400 },
];
export const FELL_TOOLS = {
  hatchet:  { name: 'Hatchet', max: 1, rate: 1 },
  axe:      { name: 'Axe', max: 3, rate: 1.6 },
  fellaxe:  { name: 'Felling Axe', max: 4, rate: 2.2 },
  chainsaw: { name: 'Chainsaw', max: 4, rate: 6.5, fuel: true, loud: true },
};
export const FELL_TOOL_ORDER = ['chainsaw', 'fellaxe', 'axe', 'hatchet'];   // the best one you carry does the cutting

// sizes by kind (tree_a / tree_b: the street trees and the parks' are small, the woods' named kinds bigger)
const SMALL_SP = new Set(['apple', 'cherry', 'magnolia', 'pear', 'orange', 'lemon', 'olive']);
const PALM_SMALL = new Set(['palm_s', 'palm_d']);
export function treeSize(p) {
  if (!p) return 0;
  const t = p.t;
  if (t === 'redwood') return p.sp === 'redwood2' ? 3 : 4;
  if (t === 'tree_a' || t === 'tree_b') return !p.sp || SMALL_SP.has(p.sp) ? 1 : 2;
  if (PALM_SMALL.has(t)) return 1;
  if (t === 'palm_a' || t === 'palm_b' || t === 'palm_c') return 2;
  return 0;
}
export const treeName = (p) => {
  const s = treeSize(p);
  if (!s) return '';
  if (p.t === 'redwood') return TREE_SIZES[s].name;
  if (p.t.startsWith('palm')) return 'palm';
  return p.sp && !/^tree/.test(p.sp) ? p.sp.replace(/([A-Z])/g, ' $1').toLowerCase().replace('maple autumn', 'maple').replace('pond pine', 'pine') + ' tree' : TREE_SIZES[s].name;
};

export function fellTime(tool, size) {
  const T = FELL_TOOLS[tool], S = TREE_SIZES[size];
  if (!T || !S || size > T.max) return Infinity;
  return S.work / T.rate;
}
// the best tool in a bag (inventory counts) for a tree of this size, or null
export function bestTool(inv, size) {
  for (const id of FELL_TOOL_ORDER) if ((inv[id] || 0) > 0 && FELL_TOOLS[id].max >= size) return id;
  return null;
}

// away from the cutter: the tree tips over the far side of the cut
export function fallAngle(tree, x, y) {
  const dx = tree.x - x, dy = tree.y - y;
  return dx === 0 && dy === 0 ? 0 : Math.atan2(dy, dx);
}
// a point under the falling trunk (and its crown, a little wider towards the top): how squarely it's hit, 0 if clear
export function underFall(tree, a, size, x, y) {
  const S = TREE_SIZES[size];
  if (!S) return 0;
  const c = Math.cos(a), s = Math.sin(a), dx = x - tree.x, dy = y - tree.y;
  const along = dx * c + dy * s, across = Math.abs(-dx * s + dy * c);
  if (along < 4 || along > S.len) return 0;
  const half = S.wide / 2 + 8 + (along / S.len) * S.wide * 0.8;   // the crown spreads near the top
  if (across > half) return 0;
  return Math.max(0.35, 1 - across / half);
}
// where its log bundles lie: spread along the fallen trunk
export function logSpots(tree, a, size) {
  const S = TREE_SIZES[size];
  if (!S) return [];
  const c = Math.cos(a), s = Math.sin(a), out = [];
  for (let k = 0; k < S.logs; k++) {
    const d = S.len * (0.18 + 0.72 * (S.logs === 1 ? 0.3 : k / (S.logs - 1)));
    const side = (k % 2 ? 1 : -1) * Math.min(14, S.wide * 0.45);
    out.push([Math.round(tree.x + c * d - s * side), Math.round(tree.y + s * d + c * side)]);
  }
  return out;
}
// the angle on the wire: 0..63
export const angleCode = (a) => ((Math.round(a / (Math.PI * 2) * 64) % 64) + 64) % 64;
export const codeAngle = (q) => (q / 64) * Math.PI * 2;
