// World v3: somewhere to come round in every part of the world (the owner, 10-23: "Make sure there is a clinic or
// hospital to spawn at spread around the world so you have a wide range of areas you can respawn at, one for each
// district/region"). You wake up at a hospital, a clinic or a first-aid post - every POI of kind 'hospital' is one
// (shared/map.js m.hospitals; server/systems/homes.js spawnOptions). Before this pass the city's hospitals, the towns'
// clinics and Lucky Mesa's left whole regions an hour's walk from any (tools: the audit in docs/devlog-pending/b3b.md):
// the islands (Gull Harbor, Coral Cay, Pelican Key), the Egret Coast, the Granite Peaks and Highland Woods' far side, the
// desert east of Copper Gulch, the Sandpiper Coast, the airport, Southside, and the city's north and east.
//   - clinics3(m) (map.js, just before the walk-ins are built): in a built-up district a storefront becomes a clinic - a
//     walk-in with its ER reception like the towns' (map.js buildInteriors gives it the room, the counter and the
//     receptionist): the 'delivery' door of a lot building nearest the spot asked for (a plain storefront before a named
//     one; never a church, a hotel, a warehouse, a stadium...), its sign the clinic's.
//   - POSTS3 (shared/world3-shops.js shops3, with the wild land's themed places): where there's no town, a small
//     building by the road nearest the spot - a ranger station in the woods and the mountains, a first-aid post on the
//     coasts and in the desert - with the clinic's counter at its door.
//   - DROP_SPECIALS3: a planned hospital whose district builds its own by hand (Northshore's Medical Center) isn't
//     placed again somewhere else (it landed in Copper Gulch, next door to the town's clinic).
// Whole-world build only (shared/world3-world.js hands it to the generator); the page never loads it. Deterministic:
// integer tiles, squared distances.
import { TILE, T } from './constants.js';

// [district, name, the spot (tiles) it should be nearest]
export const CLINICS3 = [
  [2, 'Northgate Clinic', [3250, 1620]],               // (Midtown and Northgate: the city's north)
  [3, 'Yards Urgent Care', [4050, 1730]],              // (The Yards and the Stadium District)
  [46, 'Arts District Clinic', [2600, 2500]],          // (the Arts District and the Pink Mile)
  [6, 'Southside Community Clinic', [3780, 3090]],
  [14, 'Pelican Key Clinic', [3680, 3320]],
  [43, 'Gull Harbor Clinic', [1697, 3537]],
  [27, 'Westport International First Aid', [1756, 2731]],
  [28, 'West Hills Clinic', [1450, 2950]],
  [54, 'Northshore Beaches Clinic', [2400, 740]],
];
// [name, the spot (tiles) or a place's name, roof] - built by the road nearest the spot (or by the place)
export const POSTS3 = [
  ['Coral Cay First Aid Post', 'Tiki Point', 'shingle'],   // (by the north beach's bar: a lifeguard tower - the key is built up to its beaches)
  ['Egret Point Clinic', [1137, 3140], 'shingle'],
  ['Egret Marsh Ranger Station', [900, 2450], 'shingle'],
  ['Pine Gulch Ranger Station', [600, 1800], 'shingle'],         // (Highland Woods' south-west and the Egret Coast's north)
  ['Highland Ranger Station', [1117, 650], 'shingle'],
  ['Granite Peaks Ranger Station', [600, 850], 'shingle'],
  ['Summit Road Ranger Station', [1850, 400], 'shingle'],
  ['Red Rock First Aid Post', [5600, 1700], 'tar'],
  ['Eastern Desert First Aid Post', [5950, 1000], 'tar'],
  ['Sandpiper Junction First Aid Post', [4800, 2250], 'shingle'],
];
export const DROP_SPECIALS3 = new Set(['Northshore Medical']);

// the lot buildings a clinic may move into (the prefab's key): storefronts, shops, restaurants, small offices (the shops
// pass takes one by the same rules where a gun shop or a store can go nowhere else - world3-shops.js storefront)
export const STORE_KEYS = /^(apt1|apt2|rest1|rest2|strip|shanty|shops|liquor|conv|quickstop|diner|boutique|tattoo|trail|repair|bank2)/;
export const NOT_INTO = /church|chapel|hotel|motel|inn\b|lodge|warehouse|factory|freight|cargo|stadium|galleria|station|school|library|museum|theatre|club|bar\b|saloon|tap\b|pub\b|bank|police|fire|casino|salvage|mill|elevator/i;

export function clinics3(m) {
  const out = { made: [], none: [] };
  const busyKinds = new Map();   // building -> the kinds of its other doors
  for (const p of m.pois) if (p.b !== undefined && p.b !== null) { let s = busyKinds.get(p.b); if (!s) busyKinds.set(p.b, (s = new Set())); s.add(p.kind); }
  const distAt = (x, y) => { const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE); return m.inside(tx, ty) ? m.dist[m.idx(tx, ty)] : -1; };
  for (const [d, name, at] of CLINICS3) {
    let best = null, bk = Infinity;
    for (const p of m.pois) {
      if (p.kind !== 'delivery' || p.b === undefined || p.b === null || distAt(p.x, p.y) !== d) continue;
      const b = m.buildings[p.b];
      if (!b || b.gone || b.prefab < 0 || b.tw < 5 || b.th < 5) continue;
      const key = (m.prefabs[b.prefab] && m.prefabs[b.prefab].key) || '';
      if (!STORE_KEYS.test(key) || NOT_INTO.test(p.label || '') || NOT_INTO.test(b.name || '')) continue;
      // (only doors that make it a walk-in: nothing but storefronts and its own helpers in the building)
      const ks = busyKinds.get(p.b);
      if (ks && [...ks].some((k) => k !== 'delivery')) continue;
      const dx = p.x / TILE - at[0], dy = p.y / TILE - at[1];
      const k = dx * dx + dy * dy + (p.fixed ? 120 * 120 : 0);   // (a plain storefront before a named place)
      if (k < bk) { bk = k; best = p; }
    }
    if (!best) { out.none.push(name); continue; }
    const b = m.buildings[best.b], old = best.label;
    best.kind = 'hospital'; best.label = name; best.fixed = true; best.r = 48;
    let signed = false;
    for (const sg of b.signs || []) if (sg.text === old) { sg.text = name; signed = true; }
    if (!signed) { const south = m.prefabs[b.prefab].rot === 0; (b.signs ||= []).push({ x: best.x, y: south ? (b.ty + b.th - 0.6) * TILE : (b.ty + 0.6) * TILE, text: name }); }
    if (b.name === old) b.name = name;
    m.pois.push({ id: m.pois.length, kind: 'reception', label: 'ER Reception', x: best.x, y: best.y, r: 36, b: b.id });
    busyKinds.get(best.b).add('hospital');
    out.made.push([name, Math.floor(best.x / TILE), Math.floor(best.y / TILE), old]);
  }
  return out;
}

// the ground-level road tile (no highway's) nearest (tx, ty) within r tiles, searched in rings every 2 tiles
export function roadNear3(m, tx, ty, r = 260) {
  for (let k = 0; k <= r; k += 2) {
    let best = null, bd = Infinity;
    for (let dy = -k; dy <= k; dy += 2) for (let dx = -k; dx <= k; dx += (Math.abs(dy) === k ? 2 : 2 * k || 2)) {
      const x = tx + dx, y = ty + dy;
      if (!m.inside(x, y)) continue;
      const i = m.idx(x, y);
      if (m.tiles[i] !== T.ROAD || m.deck[i] || m.roadRank[i] === 3) continue;
      const e = dx * dx + dy * dy;
      if (e < bd) { bd = e; best = [x, y]; }
    }
    if (best) return best;
  }
  return null;
}
