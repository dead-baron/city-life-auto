// The art's chunk geometry: the size of a chunk, the highway deck's height, the ground-height grid a bake hands back
// and groundZ, which reads it. The renderer on the page's thread needs only these, not the bake (chunkbake.js, which
// re-exports them, runs in the bake workers): kept apart so the page never loads the bake code (docs/WORLD-V3.md 8.12.1).
export const CHUNK = 768;
export const DECK_Z = 88;
export const EL_Z = 128;           // the El's deck (World v3's main line over Midtown's Trestle Street: shared/world3-rail.js EL); a train's lz is its share of it           // height of the elevated highway deck (lz = 1); shared/levels.js DECK_LIFT
export const GROUND_TOL = 4;        // flat ground this much higher than a sprite pixel still lets it through
export const GH_CELL = 4, GH_EXTRA = 64;
export const GH_W = CHUNK / GH_CELL, GH_H = (CHUNK + GH_EXTRA) / GH_CELL;

// The ground height (world px) under world (X, Y): what moving things standing there are raised by.
// grids: (cx, cy) -> gh of a baked chunk (or null).
export function groundZ(grids, X, Y) {
  const cx = Math.floor(X / CHUNK), cy = Math.floor(Y / CHUNK);
  const gx = ((X - cx * CHUNK) / GH_CELL) | 0;
  let z = 0;
  const a = grids(cx, cy);
  if (a) z = a[(((Y - cy * CHUNK) / GH_CELL) | 0) * GH_W + gx];
  const b = Y - (cy - 1) * CHUNK < CHUNK + GH_EXTRA ? grids(cx, cy - 1) : null; // a deck drawn up into the chunk to the north
  if (b) { const v = b[(((Y - (cy - 1) * CHUNK) / GH_CELL) | 0) * GH_W + gx]; if (v > z) z = v; }
  return z;
}
