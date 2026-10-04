import { VEHICLE_ART_SIZE } from './prefab-data.js';

// Vehicle fleet registry. Sizes in world pixels (L = length along forward axis, W = width).
// Speeds px/s (1 px ~ 4.5 cm). Cargo slots are local offsets [forward, right] in px: every
// vehicle can carry at least one crate (bikes and jet skis on a rear mount, cars on the trunk
// or roof), pickups and vans a few, work trucks more, armored trucks a whole roof-load.

export const VEHICLES = {
  compact:   { i: 0, name: 'Hatchback',        kind: 'car',  L: 84,  W: 44, max: 520, accel: 330, brake: 720, rev: 160, turn: 3.0, grip: 9.0, drift: 2.2, mass: 1.0, hp: 180, seats: 2, slots: [[-4, 0]], price: 2500 },
  sedan:     { i: 1, name: 'Sedan',            kind: 'car',  L: 100, W: 48, max: 560, accel: 300, brake: 700, rev: 170, turn: 2.7, grip: 8.5, drift: 2.0, mass: 1.2, hp: 220, seats: 4, slots: [[-8, 0]], price: 4000 },
  taxi:      { i: 2, name: 'Checker Taxi',     kind: 'car',  L: 100, W: 48, max: 560, accel: 310, brake: 700, rev: 170, turn: 2.7, grip: 8.5, drift: 2.0, mass: 1.2, hp: 230, seats: 4, slots: [[-28, 0]] },
  sports:    { i: 3, name: 'Street Racer',     kind: 'car',  L: 96,  W: 48, max: 790, accel: 490, brake: 820, rev: 180, turn: 3.0, grip: 9.5, drift: 2.0, mass: 1.1, hp: 200, seats: 2, slots: [[-30, 0]], price: 15000 },
  pickup:    { i: 4, name: 'Pickup Truck',     kind: 'car',  L: 110, W: 50, max: 520, accel: 290, brake: 650, rev: 170, turn: 2.5, grip: 8.0, drift: 2.2, mass: 1.5, hp: 280, seats: 2, slots: [[-18, -12], [-18, 12], [-40, -12], [-40, 12]], price: 6000 },
  flatbed:   { i: 5, name: 'Flatbed Work Truck', kind: 'car', L: 150, W: 56, max: 440, accel: 210, brake: 560, rev: 140, turn: 2.0, grip: 7.5, drift: 2.4, mass: 2.4, hp: 380, seats: 2, slots: [[14, -13], [14, 13], [-10, -13], [-10, 13], [-34, -13], [-34, 13], [-58, -13], [-58, 13]], price: 9000 },
  van:       { i: 6, name: 'Delivery Van',     kind: 'car',  L: 112, W: 54, max: 480, accel: 250, brake: 620, rev: 150, turn: 2.3, grip: 8.0, drift: 2.4, mass: 1.8, hp: 300, seats: 2, slots: [[-14, -12], [-14, 12]], price: 7000 },
  bus:       { i: 7, name: 'City Bus',         kind: 'car',  L: 190, W: 60, max: 380, accel: 150, brake: 500, rev: 100, turn: 1.6, grip: 7.0, drift: 2.6, mass: 4.0, hp: 600, seats: 8, slots: [[50, -14], [50, 14], [10, -14], [10, 14], [-30, -14], [-30, 14], [-66, -14], [-66, 14]] },
  police:    { i: 8, name: 'Police Interceptor', kind: 'car', L: 100, W: 48, max: 690, accel: 430, brake: 820, rev: 190, turn: 2.9, grip: 9.0, drift: 2.2, mass: 1.4, hp: 420, seats: 4, slots: [[-32, 0]], police: true },
  swat:      { i: 9, name: 'SWAT Response Truck', kind: 'car', L: 120, W: 58, max: 520, accel: 270, brake: 650, rev: 150, turn: 2.2, grip: 8.0, drift: 2.4, mass: 3.0, hp: 750, seats: 4, slots: [[30, -13], [30, 13], [8, -13], [8, 13], [-14, -13], [-14, 13], [-36, -13], [-36, 13]], police: true },
  ambulance: { i: 10, name: 'Ambulance',       kind: 'car',  L: 116, W: 54, max: 560, accel: 300, brake: 650, rev: 160, turn: 2.4, grip: 8.2, drift: 2.3, mass: 1.9, hp: 420, seats: 4, slots: [[-30, -12], [-30, 12]] },
  armored:   { i: 11, name: 'IronVault Armored Van', kind: 'car', L: 118, W: 56, max: 460, accel: 220, brake: 600, rev: 140, turn: 2.1, grip: 8.0, drift: 2.4, mass: 3.2, hp: 850, seats: 2, slots: [[38, -13], [38, 13], [16, -13], [16, 13], [-6, -13], [-6, 13], [-28, -13], [-28, 13], [-50, -13], [-50, 13]] },
  bike:      { i: 12, name: 'Sport Motorcycle', kind: 'bike', L: 48,  W: 20, max: 740, accel: 540, brake: 760, rev: 80,  turn: 3.6, grip: 10,  drift: 3.0, mass: 0.4, hp: 90,  seats: 2, slots: [[-18, 0]], price: 3000 },
  speedboat: { i: 13, name: 'Speedboat',       kind: 'boat', L: 104, W: 48, max: 600, accel: 270, brake: 260, rev: 120, turn: 2.0, grip: 2.4, drift: 1.2, mass: 1.6, hp: 260, seats: 4, slots: [[-24, -10], [-24, 10]], price: 8000 },
  dinghy:    { i: 14, name: 'Dock Motorboat',  kind: 'boat', L: 80,  W: 40, max: 420, accel: 210, brake: 220, rev: 110, turn: 2.2, grip: 2.8, drift: 1.4, mass: 1.0, hp: 160, seats: 2, slots: [[-20, 0]], price: 2500 },
  jetski:    { i: 16, name: 'Wave Jet Ski',    kind: 'boat', L: 46,  W: 22, max: 690, accel: 520, brake: 300, rev: 90,  turn: 3.2, grip: 3.2, drift: 1.6, mass: 0.5, hp: 110, seats: 2, slots: [[-15, 0]], price: 3500 },
  policeboat: { i: 17, name: 'Harbor Patrol Boat', kind: 'boat', L: 104, W: 48, max: 650, accel: 320, brake: 280, rev: 130, turn: 2.1, grip: 2.6, drift: 1.2, mass: 1.8, hp: 420, seats: 4, slots: [[-24, 0]], police: true, art: 'speedboat' },
  policebike: { i: 15, name: 'Police Motorcycle', kind: 'bike', L: 50, W: 20, max: 780, accel: 570, brake: 820, rev: 80, turn: 3.6, grip: 10.5, drift: 3.0, mass: 0.45, hp: 130, seats: 1, slots: [[-19, 0]], police: true, art: 'bike' },
  // work trucks (traffic on the highways and in the industrial districts)
  boxtruck:  { i: 18, name: 'Box Truck',        kind: 'car',  L: 150, W: 58, max: 450, accel: 200, brake: 540, rev: 130, turn: 1.9, grip: 7.4, drift: 2.4, mass: 2.8, hp: 420, seats: 2, slots: [[-20, 0]], price: 11000 },
  dumptruck: { i: 19, name: 'Dump Truck',       kind: 'car',  L: 140, W: 60, max: 420, accel: 190, brake: 520, rev: 120, turn: 1.9, grip: 7.4, drift: 2.4, mass: 3.4, hp: 520, seats: 2, slots: [[-6, -14], [-6, 14], [-30, -14], [-30, 14], [-54, -14], [-54, 14]], price: 14000 },
  mixer:     { i: 20, name: 'Cement Mixer',     kind: 'car',  L: 146, W: 60, max: 400, accel: 180, brake: 500, rev: 120, turn: 1.8, grip: 7.2, drift: 2.4, mass: 3.6, hp: 540, seats: 2, slots: [[-56, 0]] },
  tanker:    { i: 21, name: 'Tanker Truck',     kind: 'car',  L: 160, W: 58, max: 430, accel: 180, brake: 500, rev: 120, turn: 1.8, grip: 7.2, drift: 2.4, mass: 3.6, hp: 460, seats: 2, slots: [[-64, 0]] },
  garbage:   { i: 22, name: 'Garbage Truck',    kind: 'car',  L: 140, W: 60, max: 380, accel: 170, brake: 500, rev: 120, turn: 1.8, grip: 7.2, drift: 2.4, mass: 3.4, hp: 520, seats: 2, slots: [[-50, 0]] },
  firetruck: { i: 23, name: 'Fire Engine',      kind: 'car',  L: 176, W: 64, max: 470, accel: 200, brake: 520, rev: 120, turn: 1.7, grip: 7.2, drift: 2.4, mass: 4.0, hp: 700, seats: 4, slots: [[-30, -15], [-30, 15], [-60, -15], [-60, 15]] },
  towtruck:  { i: 24, name: 'Tow Truck',        kind: 'car',  L: 134, W: 58, max: 480, accel: 220, brake: 560, rev: 140, turn: 2.0, grip: 7.6, drift: 2.4, mass: 2.6, hp: 400, seats: 2, slots: [[-34, -13], [-34, 13]], price: 9500 },
  // pedal power: quiet, slow, nimble; it buckles instead of blowing up
  bicycle:   { i: 25, name: 'City Bicycle',     kind: 'bike', L: 40,  W: 14, max: 330, accel: 260, brake: 620, rev: 50,  turn: 3.9, grip: 10,  drift: 3.0, mass: 0.25, hp: 50, seats: 1, slots: [[-14, 0]], price: 250, pedal: true },
};

export const VEHICLE_BY_INDEX = [];
for (const [id, v] of Object.entries(VEHICLES)) {
  v.id = id;
  VEHICLE_BY_INDEX[v.i] = v;
  // Models with concept art use the art's own proportions: the collision box IS the sprite.
  const art = VEHICLE_ART_SIZE[v.art || id];
  if (art) {
    const k = art[0] / v.L, kw = art[1] / v.W;
    v.L = art[0]; v.W = art[1];
    v.slots = v.slots.map(([f, r]) => [Math.round(f * k), Math.round(r * Math.min(1, kw))]);
  }
}

// Paint palette used for procedural placeholder sprites and NPC traffic variety.
export const PAINTS = [
  '#c8262b', '#2350c8', '#e8e8e8', '#2a2a2e', '#f2c21b', '#ef7a1a', '#2f9a3a', '#7a3ac8',
  '#e04a9a', '#25b8c0', '#b9b9b9', '#8a6a3a', '#1d2a5a', '#7a1d24',
];

export const TRAFFIC_MIX = [
  ['sedan', 30], ['compact', 25], ['taxi', 10], ['pickup', 12], ['van', 8], ['sports', 4],
  ['flatbed', 4], ['bike', 4], ['bus', 2], ['boxtruck', 3], ['dumptruck', 1.5], ['mixer', 1], ['tanker', 1.5], ['garbage', 1], ['towtruck', 1], ['firetruck', 0.4],
];
// heavier on the highways and in the docks, yards and industrial districts
export const TRUCK_MODELS = new Set(['flatbed', 'boxtruck', 'dumptruck', 'mixer', 'tanker', 'garbage', 'towtruck']);
export const PARKED_MIX = [['sedan', 30], ['compact', 30], ['pickup', 15], ['van', 8], ['sports', 6], ['bike', 6], ['flatbed', 5]];

// A respray: a new paint colour and a different painted variant of the model, and the new colour
// laid over the bodywork (tint) so even a model with only one or two painted variants plainly
// changes colour. rand: () => 0..1.
export function respray(v, rand) {
  v.paint = (v.paint + 1 + Math.floor(rand() * (PAINTS.length - 1))) % PAINTS.length;
  v.variant = Math.floor(rand() * 1000);
  v.tint = v.paint;
  v.bloody = false;
  v.descVer = (v.descVer || 0) + 1;
}
