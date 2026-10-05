// Hand-designed city blocks: areas of the map rebuilt from a designer's painting of them.
//
// The workflow: fly over the city in spectator mode, save a screenshot (and the schematic view)
// of a neighbourhood, paint over it, and hand the painting back. Each block of the painting is
// cut out (tools/build_blocks.py), fitted to the block it was painted over and laid on the
// ground curb to curb; the buildings, doors, businesses and the painted street furniture that
// should block your way are listed here, in tiles from the block's top-left corner.
//
// area: [tx, ty, tw, th] curb to curb (the block plus its sidewalk ring) - the art is fitted to
// exactly this rectangle. A block listed here gets no generated buildings, lots or street
// furniture; the generator's shops that would have stood on it (`claims` names them) are put
// here instead, and any it can't host (the gun shop, the dealership, the marina...) are built
// elsewhere as usual.
//
// building: { r: [x, y, w, h], name, biz, kind, door: x } - r is the whole painted building
//   (roof and front, it hides whoever walks behind it); the door is on its bottom edge at tile
//   column `door` (from the block's left). biz: a business kind (a shop menu, a hospital, the
//   police...) or 'delivery' (a courier drop-off) or null (just a building).
// solids: painted things you bump into, [x, y, radius] in world px from the block's corner
//   (trees, lamp posts, benches, bins, planters, fences). lamps: [x, y, hx, hy] a painted lamp
//   post's foot and its lamp head, which lights up after dark (the post is solid).
// spawn: [x, y] tile where a business's own vehicles turn up (the police station's cruisers).
// subway: [x, y] moves the block's subway entrance plaza (8x4 tiles) to this tile.
// pool: [x, y, w, h] the police motor pool's painted, fenced lot (its gate on the south side).
export const HAND_BLOCKS = [
  // ---- Midtown / Northgate / Downtown, from the "downtown concept" paintings ------------------------
  { key: 'mt_garage', area: [693, 477, 22, 20], claims: ['Fresh Coat Garage'],
    buildings: [{ r: [4, 1, 10, 16], name: 'Fresh Coat Garage', biz: 'garage', kind: 'repair', door: 9 }, { r: [14, 1, 6, 16], name: 'Auto Care', kind: 'shop', door: 17 }] },
  { key: 'mt_coffee', area: [721, 477, 24, 20], claims: ['Bean Machine Coffee'],
    buildings: [{ r: [2, 0, 13, 16], name: 'Bean Machine Coffee', biz: 'coffee', kind: 'rest2', door: 8 }, { r: [15, 0, 6, 16], kind: 'shop', door: 18 }] },
  { key: 'ng_cannery', area: [751, 477, 22, 20], claims: [],
    buildings: [{ r: [4, 4, 14, 13], name: 'South Port Cannery', biz: 'delivery', kind: 'warehouse', door: 13 }] },
  { key: 'dt_vellori', area: [783, 477, 22, 20], claims: ['Vellori'],
    buildings: [{ r: [2, 0, 6, 15], kind: 'shop', door: 4 }, { r: [8, 0, 11, 13], name: 'Vellori', biz: 'delivery', kind: 'vellori', door: 13 }] },
  { key: 'dt_dailyfork', area: [811, 477, 24, 20], claims: [],
    buildings: [{ r: [2, 0, 20, 12], name: 'The Daily Fork', biz: 'delivery', kind: 'rest1', door: 8 }] },
  { key: 'dt_plaza1', area: [841, 477, 22, 20], claims: [], plaza: true },
  { key: 'mt_grocery', area: [693, 503, 22, 22], claims: ['FreshHub Grocery'],
    buildings: [{ r: [2, 8, 10, 11], name: 'FreshHub Grocery', biz: 'grocery', kind: 'strip', door: 6 }, { r: [12, 8, 8, 11], kind: 'shop', door: 16 }] },
  { key: 'mt_pharmacy', area: [721, 503, 24, 22], claims: ['MediMart Pharmacy'],
    buildings: [{ r: [2, 0, 14, 20], name: 'MediMart Pharmacy', biz: 'pharmacy', kind: 'conv', door: 10 }, { r: [16, 0, 5, 20], kind: 'shop', door: 18 }] },
  { key: 'mt_hardware', area: [751, 503, 22, 22], claims: ['Falls Hardware'],
    buildings: [{ r: [2, 5, 18, 13], name: 'Falls Hardware', biz: 'delivery', kind: 'strip', door: 10 }] },
  { key: 'dt_citygeneral', area: [783, 503, 22, 22], claims: ['Westport General'],
    buildings: [{ r: [2, 0, 19, 17], name: 'City General', biz: 'hospital', kind: 'hospital', door: 11 }] },
  { key: 'dt_plaza2', area: [811, 503, 24, 22], claims: [], plaza: true },
  { key: 'dt_clinic', area: [841, 503, 22, 22], claims: ['Cedar Falls Clinic'],
    buildings: [{ r: [2, 0, 18, 18], name: 'Cedar Falls Clinic', biz: 'hospital', kind: 'hospital', door: 11 }] },
  { key: 'mt_fitness', area: [693, 531, 22, 20], claims: [],
    buildings: [{ r: [3, 0, 17, 15], name: 'Fitness', biz: 'delivery', kind: 'shop', door: 8 }], subway: [10, 15] },
  { key: 'mt_books', area: [721, 531, 24, 20], claims: [],
    buildings: [{ r: [2, 0, 20, 16], name: 'Books', biz: 'delivery', kind: 'shop', door: 10 }] },
  { key: 'mt_electronics', area: [751, 531, 22, 20], claims: [],
    buildings: [{ r: [2, 0, 18, 15], name: 'Electronics', biz: 'delivery', kind: 'shop', door: 8 }] },
  { key: 'dt_plaza3', area: [783, 531, 22, 20], claims: [], plaza: true },
  { key: 'dt_police', area: [811, 531, 24, 20], claims: ['Metro City PD - HQ'],
    buildings: [{ r: [3, 0, 19, 10], name: 'Metro City PD - HQ', biz: 'police', kind: 'police', door: 12, spawn: [6, 14] }], pool: [1, 11, 11, 7] },
  { key: 'dt_cityhall', area: [841, 531, 22, 20], claims: [],
    buildings: [{ r: [3, 0, 16, 13], name: 'City Hall', biz: 'delivery', kind: 'civic', door: 11 }] },
];

export const HAND_BY_KEY = Object.fromEntries(HAND_BLOCKS.map((h) => [h.key, h]));
