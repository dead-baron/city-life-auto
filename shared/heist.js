// A bank's vault door (bank heists - the server: server/systems/heist.js; the page draws it: client/vault.js). It's on
// the back wall behind the counter, a little to the side of the teller's spot, in every bank you can walk into. You stand
// in front of it to work on it. This only reads a built map (a walk-in's room: shared/map.js buildInteriors).
//   vaultOf(b) -> { x, y (the door's middle at the foot of the wall), sx, sy (where you stand to work it), dir (+1: the
//   room runs down the screen from the wall), u (the bank's unit), x0, x1 (the unit's floor, px) } | null
import { TILE } from './constants.js';

// the door's frame (px wide, tall up the wall, `up` px clear of the floor), the round door; where you stand: `side` px to
// its left (the drill's on that side, the teller's on the other - so whoever stands there or walks behind the counter
// doesn't hide the door: client/vault.js) and up to `stand` px out from the wall (as far as the room behind the counter
// allows)
export const VAULT = { w: 40, h: 30, up: 6, r: 12, side: 32, stand: 40 };

export function vaultOf(b) {
  const wi = b && b.walkIn, u = wi && wi.units.find((q) => q.kind === 'bank');
  if (!u) return null;
  const dir = wi.south ? 1 : -1, wallY = (wi.south ? wi.y0 : wi.y1 + 1) * TILE;
  const behind = wi.south ? u.counterRow - wi.y0 : wi.y1 - u.counterRow;   // (rows of floor between the wall and the counter)
  const cx = (u.x0 + u.x1 + 1) / 2 * TILE;   // (the teller's spot)
  const x = Math.max((u.x0 + 2) * TILE, cx - 2.5 * TILE);
  return { x, y: wallY, sx: x - VAULT.side, sy: wallY + dir * Math.min(VAULT.stand, behind * TILE - 14), dir, u, x0: u.x0 * TILE, x1: (u.x1 + 1) * TILE };
}
export function bankAt(m, x, y) {
  const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
  if (!m.inside(tx, ty) || !m.bld) return null;
  const id = m.bld[m.idx(tx, ty)], b = m.buildings[id];
  return b && b.walkIn && b.walkIn.units.some((q) => q.kind === 'bank') ? b : null;
}
