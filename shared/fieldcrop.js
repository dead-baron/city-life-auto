// What grows in each of the map's fields (map.fields, by index): the crop the chunks' ground is baked with
// (client/art2/game/groundbake.js fieldKindAt - the same rule, held to it by test/harvestart.test.js) and the one the
// combine reports harvesting (server/systems/farming.js) - so what you see in a field is what you're told you cut. A
// field baked ploughed (PLOW) is sown with wheat by the farm work. Integer hashing only: the same everywhere.
export const FIELD_KINDS = ['WHEAT', 'CORN', 'PLOW', 'VEG', 'HAY', 'WHEAT', 'CORN'];
// (client/art2/ground.js hh: the bake's hash)
const hh = (x, y, s) => { let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(s | 0, 0x9e3779b9); h = Math.imul(h ^ (h >>> 15), 0x85ebca6b); h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
// the bake's kind for field f of a map whose seed is `seed` (the bake's: (seed | 0) & 0xffff)
export const fieldKind = (f, seed) => FIELD_KINDS[Math.floor(hh(f, 0, (((seed ?? 1337) | 0) & 0xffff) + 9) * FIELD_KINDS.length)];
// the crop harvested there: its name, the unit and what a stretch of one row yields (FARM.segs stretches a row; a
// combine's header takes two rows), the grain's colour (the tank, the spout: render/farmart.js)
export const CROPS = {
  WHEAT: { name: 'wheat', unit: 'bu', per: 6, grain: '#d8b450' },
  CORN: { name: 'corn', unit: 'bu', per: 9, grain: '#e8c040' },
  VEG: { name: 'soybeans', unit: 'bu', per: 4, grain: '#c8b47a' },
  HAY: { name: 'hay', unit: 'bales', per: 0.5, grain: '#c8c070' },
};
export const cropOf = (f, seed) => { const k = fieldKind(f, seed); return CROPS[k === 'PLOW' ? 'WHEAT' : k]; };
