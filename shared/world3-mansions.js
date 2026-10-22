// More than one mansion (the owner, 10-16): World v3 had the one - the Hilltop Mansion on Bayside Heights' headland
// (shared/map.js mansion, laid by world3-bayside.js). The finest villa of each rich district (style 'luxury': Bayside
// Heights, The Bluffs) is now a mansion too: its owner gets a mansion's rooms (shared/homelayout.js planOf: the
// mansion's plan, its garage's bays), a mansion's price and six garage slots. It keeps its name and its villa - already
// the grandest houses in town, a lot wider than the Hilltop Mansion's house. The finest: the dearest villa with a garage,
// then the biggest. For the whole-world build only (shared/world3-world.js's done hook). Deterministic.
import { TILE } from './constants.js';

export const MANSIONS3 = { price: 150000, rise: 1.6, slots: 6, round: 5000 };
// (a mansion with a street-numbered name - "Lake District House #2881" - takes one of these, in turn)
const MANOR = ['Lakeview Manor', 'Cedar Hall', 'Rosewood Manor', 'Larchmont', 'Whitfield Hall'];

export function moreMansions3(m) {
  const out = [], best = new Map();
  for (const h of m.homes) {
    if (!h || h.kind !== 'house' || !h.garage || h.unit || h.block != null) continue;
    const d = m.districtAt(h.x, h.y);
    if (!d || d.style !== 'luxury') continue;
    const b = m.buildings[h.b], area = b ? b.tw * b.th : 0, cur = best.get(d.id);
    if (!cur || h.price > cur.h.price || (h.price === cur.h.price && (area > cur.area || (area === cur.area && h.id < cur.h.id)))) best.set(d.id, { h, area, d });
  }
  for (const { h, d } of [...best.values()].sort((a, b) => a.h.id - b.h.id)) {
    const S = MANSIONS3, was = h.price;
    h.kind = 'mansion';
    h.price = Math.max(S.price, Math.round((was * S.rise) / S.round) * S.round);
    h.slots = S.slots;
    if (/#\d+$/.test(h.name)) {
      h.name = MANOR[out.length % MANOR.length];
      for (const p of m.pois) if (p && p.kind === 'home' && p.home === h.id) p.label = h.name;
    }
    out.push({ name: h.name, d: d.name, was, price: h.price, x: Math.round(h.x / TILE), y: Math.round(h.y / TILE) });
  }
  return out;
}
