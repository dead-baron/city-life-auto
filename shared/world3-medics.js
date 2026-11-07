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
//   - its front on a street you can see it from (the owner, 11-03: Northgate Clinic opened straight under the El, "can
//     we move it so you can see the actual entrance on the street"): streetFront3 - the ground just outside the wall its
//     doorway goes in, and a few rows on, is open street: no railway's bed, no viaduct, El or highway deck over it, and
//     a road close in front.
//   - DROP_SPECIALS3: a planned hospital whose district builds its own by hand (Northshore's Medical Center) isn't
//     placed again somewhere else (it landed in Copper Gulch, next door to the town's clinic).
// Whole-world build only (shared/world3-world.js hands it to the generator); the page never loads it. Deterministic:
// integer tiles, squared distances.
import { TILE, T } from './constants.js';
import { elAt } from './world3-rail.js';

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
  ['Coral Cay First Aid Station', 'Tiki Point', 'shingle'],   // (by the north beach's bar: a lifeguard tower - the key is built up to its beaches)
  ['Egret Point Clinic', [1137, 3140], 'shingle'],
  ['Egret Marsh Ranger Station', [900, 2450], 'shingle'],
  ['Pine Gulch Ranger Station', [600, 1800], 'shingle'],         // (Highland Woods' south-west and the Egret Coast's north)
  ['Highland Ranger Station', [1117, 650], 'shingle'],
  ['Granite Peaks Ranger Station', [600, 850], 'shingle'],
  ['Summit Road Ranger Station', [1850, 400], 'shingle'],
  ['Red Rock First Aid Station', [5600, 1700], 'tar'],
  ['Eastern Desert First Aid Station', [5950, 1000], 'tar'],
  ['Sandpiper Junction First Aid Station', [4800, 2250], 'shingle'],
];
export const DROP_SPECIALS3 = new Set(['Northshore Medical']);

// the lot buildings a clinic may move into (the prefab's key): storefronts, shops, restaurants, small offices (the shops
// pass takes one by the same rules where a gun shop or a store can go nowhere else - world3-shops.js storefront)
export const STORE_KEYS = /^(apt1|apt2|rest1|rest2|strip|shanty|shops|liquor|conv|quickstop|diner|boutique|tattoo|trail|repair|bank2)/;
export const NOT_INTO = /church|chapel|hotel|motel|inn\b|lodge|warehouse|factory|freight|cargo|stadium|galleria|station|school|library|museum|theat(?:re|er)|club|bar\b|saloon|tap\b|pub\b|bank|police|fire|casino|salvage|mill|elevator/i;

// The wall a lot building's doorway goes in: where its own door is, else its prefab's front (map.js walkInSouth wants
// the same first)
export const doorSouth3 = (m, b) => (b.door ? b.door.ty >= b.ty + b.th : m.prefabs[b.prefab].rot === 0);
// Tiles under something in the air or on a railway's bed: the El (world3-rail.js elAt), the main line's other raised
// stretches, the elevated highway's deck (m.deck), a railway at grade (reserve bit 2). -> (i) => bool
export function overhead3(m) {
  const up = new Set();
  for (const R of m.rails || []) for (const p of R.pts) {
    if (!p.elevated && !(p.ez > 0)) continue;
    const cx = Math.floor(p.x / TILE), cy = Math.floor(p.y / TILE);
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) if (m.inside(cx + dx, cy + dy)) up.add(m.idx(cx + dx, cy + dy));
  }
  return (i, tx, ty) => up.has(i) || !!m.deck[i] || (m.reserve[i] & 2) !== 0 || elAt(tx, ty) > 0;
}
// Rows out in front of a doorway that must be open street, and how far out the road may be
export const FRONT_ROWS = 4, ROAD_WITHIN = 6;
const OPEN = new Set([T.SIDEWALK, T.PLAZA, T.LOT, T.ROAD, T.GRASS, T.DIRT]);
// Does building b's front (south: its south wall) face open street? The row just outside the wall, across the building
// inside its corners, is ground you walk on; it and the next FRONT_ROWS - 1 rows have nothing over them, no tracks, no
// bridge; a road (no highway's) within ROAD_WITHIN rows. over: overhead3(m)
export function streetFront3(m, b, south, over) {
  const dir = south ? 1 : -1, oy = south ? b.ty + b.th : b.ty - 1;
  let road = false;
  for (let k = 0; k < ROAD_WITHIN; k++) {
    const ty = oy + dir * k;
    for (let tx = b.tx + 1; tx < b.tx + b.tw - 1; tx++) {
      if (!m.inside(tx, ty)) return false;
      const i = m.idx(tx, ty), t = m.tiles[i];
      if (k < FRONT_ROWS && (over(i, tx, ty) || t === T.BRIDGE || t === T.WATER || t === T.DEEP)) return false;
      if (k === 0 && !OPEN.has(t)) return false;
      if (t === T.ROAD && m.roadRank[i] !== 3 && !over(i, tx, ty)) road = true;
    }
  }
  return road;
}

export function clinics3(m) {
  const out = { made: [], none: [], passed: [] };
  const over = overhead3(m);
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
      // (a plain storefront before a named place - but the district's own storefront already named for the clinic, a
      // hand plan's - Northgate's WC072 - before anything: one Northgate Clinic, not two)
      const k = p.label === name ? -1 : dx * dx + dy * dy + (p.fixed ? 120 * 120 : 0);
      if (k >= bk) continue;
      if (!streetFront3(m, b, doorSouth3(m, b), over)) { out.passed.push([name, p.label || b.name, Math.floor(p.x / TILE), Math.floor(p.y / TILE)]); continue; }   // (its front under the El, on the tracks...)
      bk = k; best = p;
    }
    if (!best) { out.none.push(name); continue; }
    const b = m.buildings[best.b], old = best.label;
    best.kind = 'hospital'; best.label = name; best.fixed = true; best.r = 48;
    let signed = false;
    for (const sg of b.signs || []) if (sg.text === old) { sg.text = name; signed = true; }
    // (its sign on its front: where its door is - a hand plan facing a street to the north has it there - as map.js
    // walkInSouth first wants the walk-in's doorway; else the prefab's front)
    if (!signed) { const south = doorSouth3(m, b); (b.signs ||= []).push({ x: best.x, y: south ? (b.ty + b.th - 0.6) * TILE : (b.ty + 0.6) * TILE, text: name }); }
    if (b.name === old) b.name = name;
    m.pois.push({ id: m.pois.length, kind: 'reception', label: 'ER Reception', x: best.x, y: best.y, r: 36, b: b.id });
    busyKinds.get(best.b).add('hospital');
    out.made.push([name, Math.floor(best.x / TILE), Math.floor(best.y / TILE), old]);
  }
  return out;
}

// A police station on each island town whose roads reach no other (the owner, 11-07: "on the islands they will just drive
// into the ocean, so we might need to have a little police station on the islands with cities in it"): a storefront in
// the island's town becomes its station - a walk-in with the front desk and, where the room's wide enough, the cells
// (map.js buildInteriors and shared/cells.js buildCellBlocks, which run after this). Picked as clinics3 picks (and after
// it: a clinic's storefront isn't taken), the door nearest the spot, a wide one first (room for the cells); with none
// (the island towns are handcrafted, every shop a real one), any plain named building of the town's that's only a
// courier's address - not an inn, a church, a barn, a ticket booth (loose). The POI is the building's own, its kind
// changed - nothing is added, so no other place's id moves. sub: a precinct (the police spawn and the helicopter stay at
// the headquarters). An island town with neither (Coral Cay: its one plain building is the eco lodge) has no station:
// its arrests fade to the nearest cells (server/systems/custody.js fadeIn). [district, name, the spot (tiles)]
export const PRECINCTS3 = [
  [43, 'Gull Harbor Police', [1697, 3537]],   // (Gull Harbor's roads join nobody else's: 17 junctions of its own)
  [44, 'Coral Cay Police', [4250, 3440]],      // (Coral Cay's: 19)
];
export function precincts3(m) {
  const out = { made: [], none: [] };
  const over = overhead3(m);
  const busyKinds = new Map();
  for (const p of m.pois) if (p.b !== undefined && p.b !== null) { let s = busyKinds.get(p.b); if (!s) busyKinds.set(p.b, (s = new Set())); s.add(p.kind); }
  const distAt = (x, y) => { const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE); return m.inside(tx, ty) ? m.dist[m.idx(tx, ty)] : -1; };
  for (const [d, name, at] of PRECINCTS3) {
    let best = null;
    for (const loose of [false, true]) {
      let bk = Infinity;
      for (const p of m.pois) {
        if (p.kind !== 'delivery' || p.b === undefined || p.b === null || distAt(p.x, p.y) !== d) continue;
        const b = m.buildings[p.b];
        if (!b || b.gone || b.prefab < 0 || b.tw < 8 || b.th < 6) continue;
        const key = (m.prefabs[b.prefab] && m.prefabs[b.prefab].key) || '';
        if ((!loose && !STORE_KEYS.test(key)) || /church|chapel|warehouse|hotel|barn/.test(key) || NOT_INTO.test(p.label || '') || NOT_INTO.test(b.name || '') || /barn|farm/i.test(p.label || '')) continue;
        const ks = busyKinds.get(p.b);
        if (ks && [...ks].some((k) => k !== 'delivery')) continue;
        const dx = Math.floor(p.x / TILE) - at[0], dy = Math.floor(p.y / TILE) - at[1];
        const k = dx * dx + dy * dy + (b.tw >= 10 ? 0 : 60 * 60) + (p.fixed ? 120 * 120 : 0);   // (wide enough for the cells first)
        if (k >= bk || (!loose && !streetFront3(m, b, doorSouth3(m, b), over))) continue;
        bk = k; best = p;
      }
      if (best) break;
    }
    if (!best) { out.none.push(name); continue; }
    const b = m.buildings[best.b], old = best.label;
    best.kind = 'police'; best.label = name; best.fixed = true; best.r = 48; best.sub = true;
    let signed = false;
    for (const sg of b.signs || []) if (sg.text === old) { sg.text = name; signed = true; }
    if (!signed) { const south = doorSouth3(m, b); (b.signs ||= []).push({ x: best.x, y: south ? (b.ty + b.th - 0.6) * TILE : (b.ty + 0.6) * TILE, text: name }); }
    if (b.name === old) b.name = name;
    busyKinds.get(best.b).add('police');
    out.made.push([name, Math.floor(best.x / TILE), Math.floor(best.y / TILE), old, best.id]);
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
