import { VEHICLE_ART_SIZE } from './prefab-data.js';

// Vehicle fleet registry. Sizes in world pixels (L = length along forward axis, W = width).
// Speeds px/s (1 px ~ 4.5 cm). Cargo slots are local offsets [forward, right] in px.

export const VEHICLES = {
  compact:   { i: 0, name: 'Hatchback',        kind: 'car',  L: 84,  W: 44, max: 520, accel: 330, brake: 720, rev: 160, turn: 3.0, grip: 9.0, drift: 2.2, mass: 1.0, hp: 180, seats: 2, slots: [[-4, 0]], price: 2500 },
  sedan:     { i: 1, name: 'Sedan',            kind: 'car',  L: 100, W: 48, max: 560, accel: 300, brake: 700, rev: 170, turn: 2.7, grip: 8.5, drift: 2.0, mass: 1.2, hp: 220, seats: 4, slots: [[-8, 0]], price: 4000 },
  taxi:      { i: 2, name: 'Checker Taxi',     kind: 'car',  L: 100, W: 48, max: 560, accel: 310, brake: 700, rev: 170, turn: 2.7, grip: 8.5, drift: 2.0, mass: 1.2, hp: 230, seats: 4, slots: [] },
  sports:    { i: 3, name: 'Street Racer',     kind: 'car',  L: 96,  W: 48, max: 790, accel: 490, brake: 820, rev: 180, turn: 3.0, grip: 9.5, drift: 2.0, mass: 1.1, hp: 200, seats: 2, slots: [], price: 15000 },
  pickup:    { i: 4, name: 'Pickup Truck',     kind: 'car',  L: 110, W: 50, max: 520, accel: 290, brake: 650, rev: 170, turn: 2.5, grip: 8.0, drift: 2.2, mass: 1.5, hp: 280, seats: 2, slots: [[-18, -12], [-18, 12], [-40, -12], [-40, 12]], price: 6000 },
  flatbed:   { i: 5, name: 'Flatbed Work Truck', kind: 'car', L: 150, W: 56, max: 440, accel: 210, brake: 560, rev: 140, turn: 2.0, grip: 7.5, drift: 2.4, mass: 2.4, hp: 380, seats: 2, slots: [[2, -13], [2, 13], [-24, -13], [-24, 13], [-50, -13], [-50, 13]], price: 9000 },
  van:       { i: 6, name: 'Delivery Van',     kind: 'car',  L: 112, W: 54, max: 480, accel: 250, brake: 620, rev: 150, turn: 2.3, grip: 8.0, drift: 2.4, mass: 1.8, hp: 300, seats: 2, slots: [[-14, 0]], price: 7000 },
  bus:       { i: 7, name: 'City Bus',         kind: 'car',  L: 190, W: 60, max: 380, accel: 150, brake: 500, rev: 100, turn: 1.6, grip: 7.0, drift: 2.6, mass: 4.0, hp: 600, seats: 8, slots: [] },
  police:    { i: 8, name: 'Police Interceptor', kind: 'car', L: 100, W: 48, max: 690, accel: 430, brake: 820, rev: 190, turn: 2.9, grip: 9.0, drift: 2.2, mass: 1.4, hp: 420, seats: 4, slots: [], police: true },
  swat:      { i: 9, name: 'SWAT Response Truck', kind: 'car', L: 120, W: 58, max: 520, accel: 270, brake: 650, rev: 150, turn: 2.2, grip: 8.0, drift: 2.4, mass: 3.0, hp: 750, seats: 4, slots: [], police: true },
  ambulance: { i: 10, name: 'Ambulance',       kind: 'car',  L: 116, W: 54, max: 560, accel: 300, brake: 650, rev: 160, turn: 2.4, grip: 8.2, drift: 2.3, mass: 1.9, hp: 420, seats: 4, slots: [] },
  armored:   { i: 11, name: 'IronVault Armored Van', kind: 'car', L: 118, W: 56, max: 460, accel: 220, brake: 600, rev: 140, turn: 2.1, grip: 8.0, drift: 2.4, mass: 3.2, hp: 850, seats: 2, slots: [] },
  bike:      { i: 12, name: 'Sport Motorcycle', kind: 'bike', L: 48,  W: 20, max: 740, accel: 540, brake: 760, rev: 80,  turn: 3.6, grip: 10,  drift: 3.0, mass: 0.4, hp: 90,  seats: 2, slots: [[-18, 0]], price: 3000 },
  speedboat: { i: 13, name: 'Speedboat',       kind: 'boat', L: 104, W: 48, max: 600, accel: 270, brake: 260, rev: 120, turn: 2.0, grip: 2.4, drift: 1.2, mass: 1.6, hp: 260, seats: 4, slots: [[-24, -10], [-24, 10]], price: 8000 },
  dinghy:    { i: 14, name: 'Dock Motorboat',  kind: 'boat', L: 80,  W: 40, max: 420, accel: 210, brake: 220, rev: 110, turn: 2.2, grip: 2.8, drift: 1.4, mass: 1.0, hp: 160, seats: 2, slots: [[-20, 0]], price: 2500 },
};

export const VEHICLE_BY_INDEX = [];
for (const [id, v] of Object.entries(VEHICLES)) {
  v.id = id;
  VEHICLE_BY_INDEX[v.i] = v;
  // Models with concept art use the art's own proportions: the collision box IS the sprite.
  const art = VEHICLE_ART_SIZE[id];
  if (art) {
    const k = art[0] / v.L;
    v.L = art[0]; v.W = art[1];
    v.slots = v.slots.map(([f, r]) => [Math.round(f * k), Math.round(r * (art[1] / (v.W || art[1])))]);
  }
}

// Paint palette used for procedural placeholder sprites and NPC traffic variety.
export const PAINTS = [
  '#c8262b', '#2350c8', '#e8e8e8', '#2a2a2e', '#f2c21b', '#ef7a1a', '#2f9a3a', '#7a3ac8',
  '#e04a9a', '#25b8c0', '#b9b9b9', '#8a6a3a', '#1d2a5a', '#7a1d24',
];

export const TRAFFIC_MIX = [
  ['sedan', 30], ['compact', 25], ['taxi', 10], ['pickup', 12], ['van', 8], ['sports', 4],
  ['flatbed', 5], ['bike', 4], ['bus', 2],
];
export const PARKED_MIX = [['sedan', 30], ['compact', 30], ['pickup', 15], ['van', 8], ['sports', 6], ['bike', 6], ['flatbed', 5]];
