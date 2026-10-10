// Lights to carry (task #359). Every light is an item (shared/items.js) described here: its beam (a cone where you face,
// or a round glow), how far it reaches, its colour, whether it takes a hand, and what keeps it going (batteries that run
// down slowly; a flare or a glow stick burns out). The server (server/systems/lights.js) switches them, runs them down and
// keeps the ones set on the ground; the renderer draws them through the game's one lighting path (client/carrylights.js
// -> art2/game/host.js), so they light the caves and the sewers like anywhere else.
//
//   LIGHTS[id]: { w, beam, range, spread, col, k, hand, fuel, burn, drop, hat, weapon, name }
//     w       the light's code on the wire (a ped's descriptor fl; a light on the ground's k)
//     beam    'cone' (where you face: spread is its half-angle) or 'glow' (round)
//     range   how far it reaches (px);  col  its colour (0-1 rgb);  k  its brightness
//     hand    takes a hand: dark while you hold something in both (an axe, a rifle: TWO_HANDED); the headlamp and the
//             hard hat's lamp leave your hands free
//     fuel    seconds of light from a set of batteries (BATTERY_S times its thrift)
//     burn    a flare or a glow stick: lit once, it burns this long and is gone
//     drop    can be set down or thrown, and stays lit there
//     hat     worn on the head (the hard hat: some protection from a falling tree or rock - HARDHAT_GUARD)
import { BATTERY_S, FLARE_S, GLOWSTICK_S } from './rules.js';

export const LIGHTS = {
  flashlight: { w: 1, name: 'Flashlight', beam: 'cone', range: 240, spread: 0.32, col: [1, 0.96, 0.84], k: 1.6, hand: true, fuel: BATTERY_S },
  headlamp:   { w: 2, name: 'Headlamp', beam: 'cone', range: 190, spread: 0.4, col: [0.92, 0.96, 1], k: 1.3, hand: false, fuel: BATTERY_S * 1.4 },
  hardhat:    { w: 3, name: 'Hard Hat with Lamp', beam: 'cone', range: 210, spread: 0.38, col: [1, 0.93, 0.76], k: 1.4, hand: false, fuel: BATTERY_S * 1.2, hat: true },
  lantern:    { w: 4, name: 'Lantern', beam: 'glow', range: 170, col: [1, 0.72, 0.38], k: 1.5, hand: true, fuel: BATTERY_S * 1.6, drop: true },
  heavyflash: { w: 5, name: 'Heavy Flashlight', beam: 'cone', range: 330, spread: 0.28, col: [1, 0.98, 0.9], k: 2.1, hand: true, fuel: BATTERY_S * 0.8, weapon: true },
  flare:      { w: 6, name: 'Road Flare', beam: 'glow', range: 260, col: [1, 0.22, 0.16], k: 2.2, burn: FLARE_S, drop: true },
  glowstick:  { w: 7, name: 'Glow Stick', beam: 'glow', range: 74, col: [0.35, 1, 0.45], k: 1.1, burn: GLOWSTICK_S, drop: true },
};
export const LIGHT_BY_CODE = [];
for (const [id, L] of Object.entries(LIGHTS)) { L.id = id; LIGHT_BY_CODE[L.w] = L; }
// a glow stick's colours (it snaps green, blue or pink, in turn)
export const GLOW_COLS = [[0.35, 1, 0.45], [0.35, 0.7, 1], [1, 0.4, 0.85]];
export const GLOW_NAMES = ['green', 'blue', 'pink'];
// the lights you switch on and wear or hold, in the order the light button picks one when you haven't chosen
export const CARRIED = ['headlamp', 'hardhat', 'flashlight', 'lantern'];
// what takes both hands: a hand light goes dark while you hold one of these (the bag keeps it switched on for later)
export const TWO_HANDED = new Set(['sledge', 'shotgun', 'rifle', 'rocket', 'prifle', 'psniper', 'passault', 'pshotgun', 'huntrifle', 'varmint', 'bow', 'firebow']);
export const twoHanded = (weaponId, W) => TWO_HANDED.has(weaponId) || !!(W && W[weaponId] && W[weaponId].twoHand);
// the light a ped shows, from its descriptor's code (fl): the definition, or null
export const lightOf = (code) => (code ? LIGHT_BY_CODE[code | 0] || LIGHT_BY_CODE[1] : null);
