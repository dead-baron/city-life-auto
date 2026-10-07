// Shooting hoops at North Point Courts: where the rims are, and the power that drops the ball in from where you
// stand. server/systems/hoops.js plays it; the client draws the meter with its green band (the swing meter is
// golf's: shared/golf.js swingMeter).
export const HOOP_MIN = 40, HOOP_MAX = 300;   // you shoot from this close to the rim to this far (px, along the ground)
export const HOOP_HANDS = 34;                 // the ball leaves your hands this high

// The hoops (the courts' site record: each one's rim and its half court), or [].
export function courtHoops(map) {
  if (map._hoops === undefined) {
    const s = (map.natureSites || []).find((q) => q.kind === 'courts' && q.hoops && q.hoops[0] && q.hoops[0].rim);
    Object.defineProperty(map, '_hoops', { value: s ? s.hoops : [], enumerable: false, configurable: true });
  }
  return map._hoops;
}
// the hoop whose half court you're on (its index), or -1
export function hoopAt(map, x, y, pad = 0) {
  return courtHoops(map).findIndex((h) => x >= h.court.x0 - pad && x < h.court.x1 + pad && y >= h.court.y0 - pad && y < h.court.y1 + pad);
}
const k01 = (d) => Math.max(0, Math.min(1, (d - HOOP_MIN) / (HOOP_MAX - HOOP_MIN)));
// the meter reading that drops it in from d px out, and how far either side of it still goes in
export function idealPower(d) { return 0.22 + 0.66 * k01(d); }
export function shotWindow(d) { return 0.11 - 0.05 * k01(d); }
