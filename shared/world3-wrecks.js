// Wrecks under the water (the nature program, 2026-10-21; the owner, 10-16: "see-through clear water ... underwater
// rocks and wrecks"). The water was clear to its bed - pebbles, sand, seagrass, boulders - and nothing lay on it. Now a
// few sunken boats rest on the bed where the water is clear and shallow enough to see them: rowboats in the lakes,
// a fishing boat and a sloop in the sea's coves and shallows, each lying at its own angle, broken and weedy (the page
// draws them in the bed: client/art2/water.js wreckPx). They're on the map's nature sites ('sunken'), as places to find.
// For the whole-world build only (shared/world3-world.js's done hook). Deterministic: arithmetic, integer hashes.
import { TILE, T } from './constants.js';

const hh = (a, b, s) => { let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(s | 0, 2246822519); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

// kinds: the boats (px: length, beam); lake / sea: how many of each where; shore: tiles from the nearest land (at the
// least, at the most - clear and shallow enough to see); open: tiles of water all round; apart: tiles between two;
// step: the scan's (tiles)
export const WRECKS3 = {
  kinds: { rowboat: [58, 22], skiff: [96, 34], sloop: [168, 50] },
  lake: { n: 3, kinds: ['rowboat', 'rowboat', 'skiff'] },
  sea: { n: 5, kinds: ['skiff', 'sloop', 'skiff', 'sloop', 'rowboat'] },
  shore: [2.5, 6], open: 3, apart: 160, step: 4,
};

export function sunkenWrecks3(m) {
  const out = { lake: 0, sea: 0 };
  const R = WRECKS3, W = m.w, HH = m.h, idx = (x, y) => y * W + x, inF = (x, y) => x >= 0 && y >= 0 && x < W && y < HH;
  const wet = (i) => m.tiles[i] === T.WATER || m.tiles[i] === T.DEEP;
  // nothing built over it, no channel of a river running through, no dock or bridge by it
  const busy = (x, y) => { for (let dy = -6; dy <= 6; dy++) for (let dx = -6; dx <= 6; dx++) { if (!inF(x + dx, y + dy)) return true; const t = m.tiles[idx(x + dx, y + dy)]; if (t === T.DOCK || t === T.BRIDGE) return true; } return false; };
  const shoreAt = (x, y) => {   // tiles to the nearest land (by rings), or 99
    for (let r = 1; r <= Math.ceil(R.shore[1]) + 1; r++) for (let k = -r; k <= r; k++) for (const [dx, dy] of [[k, -r], [k, r], [-r, k], [r, k]]) { const X = x + dx, Y = y + dy; if (inF(X, Y) && !wet(idx(X, Y))) return Math.sqrt(dx * dx + dy * dy); }
    return 99;
  };
  const cand = { lake: [], sea: [] };
  for (let y = 8; y < HH - 8; y += R.step) for (let x = 8; x < W - 8; x += R.step) {
    const i = idx(x, y);
    if (m.tiles[i] !== T.WATER || (m.river && m.river[i])) continue;
    const where = m.lake && m.lake[i] ? 'lake' : 'sea';
    let open = true;
    for (let dy = -R.open; dy <= R.open && open; dy++) for (let dx = -R.open; dx <= R.open; dx++) if (!wet(idx(x + dx, y + dy)) || (m.river && m.river[idx(x + dx, y + dy)])) { open = false; break; }
    if (!open) continue;
    const d = shoreAt(x, y);
    if (d < R.shore[0] || d > R.shore[1] || busy(x, y)) continue;
    cand[where].push([x, y, hh(x, y, 7301 + (where === 'lake' ? 1 : 0))]);
  }
  const list = (m.wrecks ||= []);
  for (const where of ['lake', 'sea']) {
    const C = cand[where].sort((a, b) => a[2] - b[2]), Q = R[where];
    for (const [x, y] of C) {
      if (out[where] >= Q.n) break;
      if (list.some((w) => (w.x / TILE - x) * (w.x / TILE - x) + (w.y / TILE - y) * (w.y / TILE - y) < R.apart * R.apart)) continue;
      const kind = Q.kinds[out[where] % Q.kinds.length], [len, beam] = R.kinds[kind];
      const a = Math.round(hh(x, y, 7311) * 628) / 100, X = (x + 0.5) * TILE, Y = (y + 0.5) * TILE;
      list.push({ x: Math.round(X), y: Math.round(Y), a, len, beam, kind, v: Math.floor(hh(x, y, 7313) * 4) });
      (m.natureSites ||= []).push({ kind: 'sunken', boat: kind, x: Math.round(X), y: Math.round(Y), where });
      out[where]++;
    }
  }
  return out;
}
