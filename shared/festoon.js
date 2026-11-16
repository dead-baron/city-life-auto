// Hanging lights (the owner, 2026-11-16: "more like bistro lights than Christmas lights ... some slack in the line and
// larger lights/lanterns"): how a run of lights hangs - the one place the art (client/art2/game/statics.js
// makeFestoon), the world build and the lint (shared/world3-festoons.js) read it. A run is a 'festoon' prop - { x, y,
// tx, ty, h, k, ends }: strung from (x, y) to (x + tx, y + ty) (px), made fast h px up at both ends, k 'lantern' (red
// paper lanterns, concept WC422), 'cable' (a bare cable) or none (bistro bulbs). Its sag at the middle is one of
// FESTOON.SAG of its span (by where it hangs: a little variety, few sprites); its lowest point over people's heads.
// Integer arithmetic only (the world comes out the same in every engine - shared/dmath.js).
import { TILE } from './constants.js';

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
const hashXY = (x, y) => { let h = Math.imul(Math.round(x) | 0, 73856093) ^ Math.imul(Math.round(y) | 0, 19349663); h = Math.imul(h ^ (h >>> 13), 1274126177); return (h ^ (h >>> 16)) >>> 0; };
export const festoonSpan = (f) => Math.hypot(f.tx || 0, f.ty || 0);
// the run's sag at its middle (px)
export const festoonSag = (f) => Math.round(festoonSpan(f) * FESTOON.SAG[hashXY(f.x, f.y) % 3]);
// how high its lowest point hangs (px)
export const festoonLow = (f) => (f.h || 40) - festoonSag(f);
// how high its lowest point must hang
export const festoonClear = (f) => (f.k === 'lantern' ? FESTOON.CLEAR_LANTERN : FESTOON.CLEAR);
export const festoonEnds = (f) => [{ x: f.x, y: f.y }, { x: f.x + (f.tx || 0), y: f.y + (f.ty || 0) }];

