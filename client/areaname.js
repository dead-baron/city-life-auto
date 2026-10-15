// The name of where you are, for the HUD's title card (hud.js showDistrict) - the map's district under you, but the
// water doesn't change it (the owner, 2026-10-15: "passing over any water like on the train says you're in the bay for
// a second ... let's not have you switch locations if you're in a body of water that's inside a district like a river
// passing through it"). The open sea's tiles are all the sea's district (shared/mapcore.js WATER_D, Liberty Bay), so a
// bridge or a train over an inlet, a channel between two islands, a harbour or a river mouth used to flash it up. Now:
//   - a river or a lake (the map's river / lake layers) keeps the name you came in with, whatever district it lies in;
//   - the sea keeps it too while there's land of some district near (AREA.NEAR_T tiles - by boat or swimming
//     AREA.AFLOAT_T: out on the water itself the shore drops away sooner), and on a train it never names the sea;
//   - only well out at sea does the sea's own name come up, after AREA.SEA_S seconds of it; and once it's up, it goes
//     back to a district only on land or right by it (AREA.BACK_T tiles) - no back and forth along a coast;
//   - on land, as before: a new district once you've been in it AREA.LAND_S seconds.
// Pure (no DOM): test/areaname.test.js. The land is looked for on a coarse grid round you, only over open water and
// once per tile you move onto.
import { TILE } from '../shared/constants.js';
import { DISTRICTS, WATER_D } from '../shared/mapcore.js';

export const AREA = Object.freeze({ NEAR_T: 48, AFLOAT_T: 22, BACK_T: 8, SEA_S: 1.5, LAND_S: 0.6, STEP_T: 3 });

// The nearest tile of a district that isn't the sea within r tiles of (tx, ty), on a grid of AREA.STEP_T (and the ring
// of tiles right round you): { d (tiles), id (its district) } or null. Inside the map's window only.
export function landNear(map, tx, ty, r) {
  let best = null, bd = Infinity;
  const look = (x, y) => {
    if (!map.inside(x, y)) return;
    const d = map.dist[map.idx(x, y)];
    if (d === WATER_D || !DISTRICTS[d]) return;
    const dd = Math.max(Math.abs(x - tx), Math.abs(y - ty));
    if (dd < bd) { bd = dd; best = { d: dd, id: d }; }
  };
  for (let y = ty - 1; y <= ty + 1; y++) for (let x = tx - 1; x <= tx + 1; x++) look(x, y);
  if (best) return best;
  const s = AREA.STEP_T, x0 = tx - r, y0 = ty - r;
  for (let y = y0 + ((ty - y0) % s); y <= ty + r; y += s) for (let x = x0 + ((tx - x0) % s); x <= tx + r; x += s) look(x, y);
  return best;
}

export class AreaTracker {
  constructor() { this.reset(); }
  reset() { this.shown = null; this.cand = null; this.candAt = 0; this.key = -1; this.here = null; }
  // What's under (x, y) px - the district it names, or null to keep what's shown. o.afloat: on a boat or swimming;
  // o.train: riding a train.
  under(map, x, y, o = {}) {
    const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
    const key = (o.train ? 2 : o.afloat ? 1 : 0) * 1e9 + ty * 65536 + tx;
    if (key === this.key && this.shownAtKey === this.shown) return this.here;
    this.key = key; this.shownAtKey = this.shown;
    const D = map.districtAt(x, y);
    const inside = map.inside(tx, ty), i = inside ? map.idx(tx, ty) : -1;
    const inland = inside && ((map.river && map.river[i]) || (map.lake && map.lake[i]));
    let here;
    if (D && D.id !== WATER_D && !inland) here = D;                              // land (or a district's own water)
    else if (inland) here = this.shown || this.landed(map, tx, ty, AREA.NEAR_T); // a river, a lake: whoever's it is
    else {
      // the sea: near land it's still where you were (or the nearest land's, with nothing shown yet)
      const sea = DISTRICTS[WATER_D];
      if (this.shown && this.shown.id === WATER_D) { const l = landNear(map, tx, ty, AREA.BACK_T); here = l ? DISTRICTS[l.id] : sea; }
      else if (o.train) here = this.shown || this.landed(map, tx, ty, AREA.NEAR_T);
      else {
        const l = landNear(map, tx, ty, o.afloat ? AREA.AFLOAT_T : AREA.NEAR_T);
        here = l ? (this.shown || DISTRICTS[l.id]) : sea;
      }
    }
    this.here = here || null;
    return this.here;
  }
  landed(map, tx, ty, r) { const l = landNear(map, tx, ty, r); return l ? DISTRICTS[l.id] : null; }
  // Each frame: the district to put up on the title card now, or null. now in seconds.
  update(map, x, y, now, o = {}) {
    const here = this.under(map, x, y, o);
    if (!here || (this.shown && here.name === this.shown.name)) { this.cand = null; return null; }
    if (!this.cand || this.cand.name !== here.name) { this.cand = here; this.candAt = now; return null; }
    if (now - this.candAt < (here.id === WATER_D ? AREA.SEA_S : AREA.LAND_S)) return null;
    this.shown = here; this.cand = null;
    return here;
  }
}
