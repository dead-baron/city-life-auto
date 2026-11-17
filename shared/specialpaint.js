// The special car paints (a vehicle's tint index from SPECIAL_BASE up), apart from shared/vehicles.js PAINTS - the shop and
// traffic palette, which a respray and the Fresh Coat garage pick from. One so far: the Founder's Pack's (shared/rules.js
// SUPPORT.paint; server/systems/cosmetics.js paintMenu), a chrome-gold metallic: a brassy gold, kept as it is (not toned
// like the palette's paints: client/art2/vehicles.js carPaint), with a stronger sky sheen (sheen: x the model's own) so it
// reads as metal. Kept in its own small file: the live vehicle sprites (client/art2/game/actors.js) read it, and nothing a
// baked chunk is made of does.
export const SPECIAL_BASE = 64;
export const SPECIAL_PAINTS = {
  64: { id: 'chromegold', name: 'Chrome gold', hex: '#d9b25e', sheen: 2.2 },
};
export const specialPaint = (tn) => (tn >= SPECIAL_BASE && Object.hasOwn(SPECIAL_PAINTS, tn) ? SPECIAL_PAINTS[tn] : null);
