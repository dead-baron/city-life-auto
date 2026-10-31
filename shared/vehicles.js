import { VEHICLE_ART_SIZE } from './prefab-data.js';
import { HORSE } from './rules-base.js';

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
  ambulance: { i: 10, name: 'Ambulance',       kind: 'car',  L: 116, W: 54, max: 560, accel: 300, brake: 650, rev: 160, turn: 2.4, grip: 8.2, drift: 2.3, mass: 1.9, hp: 420, seats: 4, slots: [[-30, -12], [-30, 12]], siren: true },
  armored:   { i: 11, name: 'IronVault Armored Van', kind: 'car', L: 118, W: 56, max: 460, accel: 220, brake: 600, rev: 140, turn: 2.1, grip: 8.0, drift: 2.4, mass: 3.2, hp: 850, seats: 2, slots: [[38, -13], [38, 13], [16, -13], [16, 13], [-6, -13], [-6, 13], [-28, -13], [-28, 13], [-50, -13], [-50, 13]] },
  bike:      { i: 12, name: 'Sport Motorcycle', kind: 'bike', L: 48,  W: 20, max: 760, accel: 580, brake: 780, rev: 80,  turn: 3.6, grip: 10,  drift: 3.0, mass: 0.4, hp: 90,  seats: 2, slots: [[-18, 0]], price: 3000, rough: 1.6, ride: 'tuck', moto: 'sport', blurb: 'very fast, fierce off the line' },
  // crew: where each seat sits in an open boat, [px forward, px right] of the middle - the driver's, the one beside it,
  // then the back seats (both renderers draw who's in it there: task #420; the snapshot says who's in a back seat)
  speedboat: { i: 13, name: 'Speedboat',       kind: 'boat', L: 104, W: 48, max: 600, accel: 270, brake: 260, rev: 120, turn: 2.0, grip: 2.4, drift: 1.2, mass: 1.6, hp: 260, seats: 4, slots: [[-24, -10], [-24, 10]], price: 8000, crew: [[-9, 11], [-9, -11], [-35, 10], [-35, -10]] },
  dinghy:    { i: 14, name: 'Dock Motorboat',  kind: 'boat', L: 80,  W: 40, max: 420, accel: 210, brake: 220, rev: 110, turn: 2.2, grip: 2.8, drift: 1.4, mass: 1.0, hp: 160, seats: 2, slots: [[-20, 0]], price: 2500, crew: [[-22, 3], [0, 0]] },
  // a wooden rowboat: oars, no engine (the Redwood Caverns' river: world3-caves.js, underground.js)
  rowboat:   { i: 66, name: 'Rowboat',         kind: 'boat', L: 64,  W: 28, max: 250, accel: 130, brake: 220, rev: 90,  turn: 2.0, grip: 3.0, drift: 1.5, mass: 0.6, hp: 90,  seats: 2, slots: [[-22, 0]], price: 600, oars: true, crew: [[2, 0], [-16, 0]] },
  // a river kayak: one seat, a double paddle (Silver Thread Lake's hire, the Redwood River run)
  kayak:     { i: 67, name: 'River Kayak',     kind: 'boat', L: 52,  W: 16, max: 300, accel: 230, brake: 240, rev: 80,  turn: 3.0, grip: 3.2, drift: 1.6, mass: 0.3, hp: 60,  seats: 1, slots: [[-17, 0]], price: 450, paddle: true, crew: [[-1, 0]] },
  // a golf cart (the owner, 10-08): parked on the courses' cart paths (m.parking spots with model 'golfcart')
  golfcart:  { i: 68, name: 'Golf Cart',        kind: 'car',  L: 54,  W: 30, max: 300, accel: 190, brake: 520, rev: 120, turn: 3.0, grip: 8.0, drift: 2.0, mass: 0.6, hp: 120, seats: 2, slots: [[-20, 0]], price: 1800, rough: 0.6 },
  jetski:    { i: 16, name: 'Wave Jet Ski',    kind: 'boat', L: 46,  W: 22, max: 690, accel: 520, brake: 300, rev: 90,  turn: 3.2, grip: 3.2, drift: 1.6, mass: 0.5, hp: 110, seats: 2, slots: [[-15, 0]], price: 3500, crew: [[-2, 0], [-14, 0]] },
  policeboat: { i: 17, name: 'Harbor Patrol Boat', kind: 'boat', L: 104, W: 48, max: 650, accel: 320, brake: 280, rev: 130, turn: 2.1, grip: 2.6, drift: 1.2, mass: 1.8, hp: 420, seats: 4, slots: [[-24, 0]], police: true, art: 'speedboat' },   // (a wheelhouse: no crew shown)
  // the search-and-rescue boat (rescue.js): a rigid inflatable, lights and siren; the crew at the console, the rescued aft
  rescueboat: { i: 45, name: 'Rescue Boat',    kind: 'boat', L: 96,  W: 48, max: 620, accel: 340, brake: 300, rev: 130, turn: 2.3, grip: 2.8, drift: 1.2, mass: 1.5, hp: 420, seats: 4, slots: [[-34, 0]], siren: true, crew: [[-6, 6], [-6, -6], [-28, 7], [-28, -7]] },
  // the off-road ambulance (ems.js, RS1): a white and orange 4x4
  rescue4x4: { i: 46, name: 'Rescue 4x4',     kind: 'car',  L: 104, W: 50, max: 600, accel: 330, brake: 660, rev: 170, turn: 2.5, grip: 8.6, drift: 2.3, mass: 1.8, hp: 420, seats: 4, slots: [[-28, -11], [-28, 11]], siren: true, rough: 0.55 },
  policebike: { i: 15, name: 'Police Motorcycle', kind: 'bike', L: 50, W: 20, max: 780, accel: 570, brake: 820, rev: 80, turn: 3.6, grip: 10.5, drift: 3.0, mass: 0.45, hp: 130, seats: 1, slots: [[-19, 0]], police: true, art: 'bike', moto: 'tourer' },
  // work trucks (traffic on the highways and in the industrial districts)
  boxtruck:  { i: 18, name: 'Box Truck',        kind: 'car',  L: 150, W: 58, max: 450, accel: 200, brake: 540, rev: 130, turn: 1.9, grip: 7.4, drift: 2.4, mass: 2.8, hp: 420, seats: 2, slots: [[-20, 0]], price: 11000 },
  dumptruck: { i: 19, name: 'Dump Truck',       kind: 'car',  L: 140, W: 60, max: 420, accel: 190, brake: 520, rev: 120, turn: 1.9, grip: 7.4, drift: 2.4, mass: 3.4, hp: 520, seats: 2, slots: [[-6, -14], [-6, 14], [-30, -14], [-30, 14], [-54, -14], [-54, 14]], price: 14000 },
  mixer:     { i: 20, name: 'Cement Mixer',     kind: 'car',  L: 146, W: 60, max: 400, accel: 180, brake: 500, rev: 120, turn: 1.8, grip: 7.2, drift: 2.4, mass: 3.6, hp: 540, seats: 2, slots: [[-56, 0]] },
  tanker:    { i: 21, name: 'Tanker Truck',     kind: 'car',  L: 160, W: 58, max: 430, accel: 180, brake: 500, rev: 120, turn: 1.8, grip: 7.2, drift: 2.4, mass: 3.6, hp: 460, seats: 2, slots: [[-64, 0]] },
  garbage:   { i: 22, name: 'Garbage Truck',    kind: 'car',  L: 140, W: 60, max: 380, accel: 170, brake: 500, rev: 120, turn: 1.8, grip: 7.2, drift: 2.4, mass: 3.4, hp: 520, seats: 2, slots: [[-50, 0]] },
  firetruck: { i: 23, name: 'Fire Engine',      kind: 'car',  L: 176, W: 64, max: 470, accel: 200, brake: 520, rev: 120, turn: 1.7, grip: 7.2, drift: 2.4, mass: 4.0, hp: 700, seats: 4, slots: [[-30, -15], [-30, 15], [-60, -15], [-60, 15]], siren: true },
  towtruck:  { i: 24, name: 'Tow Truck',        kind: 'car',  L: 134, W: 58, max: 480, accel: 220, brake: 560, rev: 140, turn: 2.0, grip: 7.6, drift: 2.4, mass: 2.6, hp: 400, seats: 2, slots: [[-34, -13], [-34, 13]], price: 9500 },
  // pedal power (a bike buckles, pedal). rough: how much grass, dirt and sand slow it (1: as a car). seat: where the
  // rider sits, px forward of the middle. (the commuter keeps the id 'bicycle')
  bicycle:   { i: 25, name: 'Commuter Bike',    kind: 'bike', L: 40,  W: 14, max: 330, accel: 260, brake: 620, rev: 50,  turn: 3.9, grip: 10,  drift: 3.0, mass: 0.25, hp: 50, seats: 1, slots: [[-14, 0]], price: 250, pedal: true, rough: 1, seat: 2, blurb: 'everyday, quick in town' },
  cruiser:   { i: 26, name: 'Beach Cruiser',    kind: 'bike', L: 42,  W: 16, max: 290, accel: 220, brake: 560, rev: 50,  turn: 3.4, grip: 11.5, drift: 3.4, mass: 0.3, hp: 55, seats: 1, slots: [[-15, 0]], price: 220, pedal: true, rough: 0.5, seat: 0, blurb: 'steady, fat tyres for the beach' },
  mtb:       { i: 27, name: 'Mountain Bike',    kind: 'bike', L: 42,  W: 16, max: 340, accel: 290, brake: 700, rev: 50,  turn: 3.9, grip: 10.5, drift: 3.0, mass: 0.28, hp: 65, seats: 1, slots: [[-15, 0]], price: 480, pedal: true, rough: 0.25, seat: 2, blurb: 'rides rough ground' },
  roadbike:  { i: 28, name: 'Road Bike',        kind: 'bike', L: 42,  W: 12, max: 430, accel: 300, brake: 600, rev: 50,  turn: 3.6, grip: 9.5, drift: 2.8, mass: 0.2, hp: 40, seats: 1, slots: [[-15, 0]], price: 650, pedal: true, rough: 1.5, seat: 3, blurb: 'fastest on the road, poor off it' },
  bmx:       { i: 29, name: 'BMX',              kind: 'bike', L: 34,  W: 14, max: 310, accel: 330, brake: 720, rev: 50,  turn: 4.5, grip: 10.5, drift: 3.2, mass: 0.2, hp: 55, seats: 1, slots: [[-11, 0]], price: 300, pedal: true, rough: 0.6, seat: 1, blurb: 'small and nimble' },
  // the ferries to the islands (server/systems/ferries.js): run to a timetable, never driven, never hurt
  ferry:     { i: 31, name: 'Car Ferry',        kind: 'boat', L: 470, W: 150, max: 320, accel: 60, brake: 80, rev: 60, turn: 0.4, grip: 2, drift: 1, mass: 60, hp: 99999, seats: 24, slots: [[-140, -40], [-140, 40]], ferry: true },
  waterbus:  { i: 32, name: 'Water Bus',        kind: 'boat', L: 240, W: 76,  max: 320, accel: 60, brake: 80, rev: 60, turn: 0.5, grip: 2, drift: 1, mass: 30, hp: 99999, seats: 16, slots: [[-80, 0]], ferry: true },
  // the shopping cart (task #329; crew: the kicker, the one in the basket). The horse (#325, horses.js): no engine,
  // rough 0, never into the water (physics.js HORSE_BLOCK), a canter unless spurred to a gallop; it bolts, never burns.
  // Its coat is its variant (horses.js COATS).
  horse:     { i: 51, name: 'Horse',            kind: 'bike', L: 56,  W: 18, max: 440, accel: 300, brake: 560, rev: 40,  turn: 3.4, grip: 11,  drift: 3.0, mass: 0.6, hp: 150, seats: 2, slots: [[-20, 0]], price: HORSE.price, horse: true, rough: 0, seat: 2, blurb: 'four legs: anywhere off the road; a gallop tires it' },
  cart:      { i: 50, name: 'Shopping Cart',    kind: 'bike', L: 30,  W: 20, max: 330, accel: 250, brake: 420, rev: 60,  turn: 3.7, grip: 7.0, drift: 2.4, mass: 0.22, hp: 60, seats: 2, slots: [[1, 0]], pedal: true, cart: true, rough: 2.4, crew: [[-20, 0], [3, 0]], blurb: 'kick it along, ride the back rail; one rides in the basket' },
  // the skateboard (2026-10-24): lying about like the carts, ridden as the board (server skate.js)
  skateboard: { i: 52, name: 'Skateboard', kind: 'bike', L: 26, W: 10, max: 300, accel: 300, brake: 430, rev: 0, turn: 4, grip: 14, drift: 3, mass: 0.1, hp: 40, seats: 1, slots: [], pedal: true, board: true, rough: 3 },
  cargobike: { i: 30, name: 'Cargo Bike',       kind: 'bike', L: 58,  W: 18, max: 280, accel: 190, brake: 520, rev: 50,  turn: 3.0, grip: 10,  drift: 2.8, mass: 0.45, hp: 75, seats: 1, slots: [[15, 0], [-19, 0]], price: 900, pedal: true, rough: 1.1, seat: -11, blurb: 'slow, carries two crates' },
  // the five-star response (police.js): the FBI's black SUVs, the army's olive trucks
  fbi:       { i: 33, name: 'Federal SUV',      kind: 'car',  L: 104, W: 50, max: 660, accel: 380, brake: 780, rev: 180, turn: 2.6, grip: 8.8, drift: 2.2, mass: 1.8, hp: 520, seats: 4, slots: [[-36, 0]], police: true },
  army:      { i: 34, name: 'Army Truck',       kind: 'car',  L: 120, W: 58, max: 480, accel: 240, brake: 620, rev: 140, turn: 2.0, grip: 8.0, drift: 2.4, mass: 3.2, hp: 900, seats: 4, slots: [[30, -13], [30, 13], [8, -13], [8, 13], [-14, -13], [-14, 13], [-36, -13], [-36, 13]], police: true, military: true, art: 'swat' },
  // ---- the motorcycles (MC1, task #366). ride: the rider's pose; stable: three wheels (never throws its rider); seat:
  // where the rider sits; sprite: the classic view's stand-in; moto: its family (traffic.js mixes, the engine sound)
  vtwin:     { i: 35, name: 'Dustwing 1200',    kind: 'bike', L: 54,  W: 20, max: 640, accel: 400, brake: 700, rev: 70,  turn: 3.0, grip: 10.5, drift: 3.2, mass: 0.6, hp: 120, seats: 2, slots: [[-20, 0]], price: 5200, rough: 1.1, seat: -4, sprite: 'bike', moto: 'cruiser', blurb: 'the classic cruiser: low, heavy, steady' },
  tourer:    { i: 36, name: 'Longhaul GT',      kind: 'bike', L: 58,  W: 26, max: 660, accel: 380, brake: 720, rev: 70,  turn: 2.8, grip: 10.5, drift: 3.2, mass: 0.75, hp: 140, seats: 2, slots: [[-24, 0]], price: 9800, rough: 1.1, seat: -1, sprite: 'bike', moto: 'tourer', blurb: 'fairing, panniers, a seat for two' },
  chopper:   { i: 37, name: 'Hellfork Chopper', kind: 'bike', L: 66,  W: 20, max: 650, accel: 420, brake: 600, rev: 60,  turn: 2.1, grip: 9.5, drift: 3.0, mass: 0.55, hp: 110, seats: 1, slots: [[-26, 0]], price: 7400, rough: 1.2, seat: -9, ride: 'chop', sprite: 'bike', moto: 'cruiser', blurb: 'the long fork: wide turns, all style' },
  bobber:    { i: 38, name: 'Stubtail Bobber',  kind: 'bike', L: 50,  W: 20, max: 620, accel: 430, brake: 700, rev: 70,  turn: 3.2, grip: 10.5, drift: 3.2, mass: 0.5, hp: 110, seats: 1, slots: [[-18, 0]], price: 4800, rough: 1.1, seat: -3, sprite: 'bike', moto: 'cruiser', blurb: 'stripped down, fat tyres, one seat' },
  caferacer: { i: 39, name: 'Ton-Up Racer',     kind: 'bike', L: 50,  W: 18, max: 700, accel: 470, brake: 760, rev: 70,  turn: 3.6, grip: 10.5, drift: 3.0, mass: 0.42, hp: 95, seats: 1, slots: [[-18, 0]], price: 4400, rough: 1.3, seat: -2, ride: 'tuck', sprite: 'bike', moto: 'single', blurb: 'clip-ons and a hump seat: quick on the bends' },
  dirtbike:  { i: 40, name: 'Clodhopper 250',   kind: 'bike', L: 48,  W: 18, max: 520, accel: 480, brake: 700, rev: 70,  turn: 3.8, grip: 10,  drift: 3.4, mass: 0.32, hp: 80, seats: 1, slots: [[-18, 0]], price: 2600, rough: 0.2, seat: -1, sprite: 'bike', moto: 'dirt', blurb: 'knobbly tyres: flies over dirt and grass' },
  scooter:   { i: 41, name: 'Zuzu 50',          kind: 'bike', L: 40,  W: 18, max: 330, accel: 300, brake: 640, rev: 60,  turn: 4.3, grip: 10,  drift: 3.0, mass: 0.28, hp: 60, seats: 2, slots: [[-14, 0]], price: 1400, rough: 1.4, seat: -3, sprite: 'bike', moto: 'scooter', blurb: 'slow, nimble, cheap to run' },
  trike:     { i: 42, name: 'Tribuck Trike',    kind: 'bike', L: 60,  W: 38, max: 560, accel: 330, brake: 680, rev: 80,  turn: 2.6, grip: 11,  drift: 3.4, mass: 0.9, hp: 160, seats: 2, slots: [[-26, 0]], price: 8600, rough: 1.1, seat: 4, stable: true, sprite: 'bike', moto: 'cruiser', blurb: 'three wheels: never throws you off' },
  ratbike:   { i: 43, name: 'Rustbucket',       kind: 'bike', L: 54,  W: 22, max: 600, accel: 420, brake: 640, rev: 70,  turn: 3.0, grip: 10,  drift: 3.4, mass: 0.6, hp: 140, seats: 1, slots: [[-20, 0]], price: 2200, rough: 0.8, seat: -3, sprite: 'bike', moto: 'cruiser', blurb: 'wire, rust and leather bags: goes anywhere' },
  bagger:    { i: 44, name: 'Saddlebag King',   kind: 'bike', L: 58,  W: 26, max: 640, accel: 370, brake: 700, rev: 70,  turn: 2.8, grip: 10.5, drift: 3.2, mass: 0.75, hp: 140, seats: 2, slots: [[-24, 0]], price: 8800, rough: 1.1, seat: -2, sprite: 'bike', moto: 'cruiser', blurb: 'batwing fairing, hard bags' },
  // ---- aircraft (flight.js, aircraft.js): climb / sink px/s, ceiling px; turn: yaw rate (heli) or turn per radian of
  // bank (plane); vr lift-off, stall, bank (rad); rotor radius, span (drawn); livery (the clients)
  heli:       { i: 60, name: 'Skylark Helicopter', kind: 'air', air: 'heli', L: 150, W: 54, max: 720, accel: 340, brake: 400, rev: 0, turn: 1.9, grip: 8, drift: 2, mass: 1.6, hp: 320, seats: 4, slots: [[-34, 0]], climb: 170, sink: 200, ceiling: 1000, rotor: 76, livery: 'news' },
  policeheli: { i: 61, name: 'Police Air Unit',    kind: 'air', air: 'heli', L: 150, W: 54, max: 760, accel: 360, brake: 400, rev: 0, turn: 2.0, grip: 8, drift: 2, mass: 1.6, hp: 420, seats: 4, slots: [[-34, 0]], climb: 180, sink: 210, ceiling: 1000, rotor: 76, police: true, livery: 'police' },
  plane:      { i: 62, name: 'Larkspur 172',       kind: 'air', air: 'plane', L: 128, W: 112, max: 1150, accel: 190, brake: 420, rev: 0, turn: 1.25, grip: 8, drift: 2, mass: 1.4, hp: 280, seats: 2, slots: [[-34, 0]], climb: 140, sink: 210, ceiling: 1000, vr: 520, stall: 400, bank: 0.75, span: 168, livery: 'plane' },
  gunship:    { i: 63, name: 'Hornet Gunship',     kind: 'air', air: 'heli', L: 160, W: 50, max: 820, accel: 400, brake: 400, rev: 0, turn: 2.2, grip: 8, drift: 2, mass: 2.0, hp: 700, seats: 2, slots: [[-40, 0]], climb: 200, sink: 230, ceiling: 1000, rotor: 80, military: true, missiles: true, livery: 'army' },

  // ---- the tank (H58; debug only): tracks, a turret, shells (tank.js; rules.js TANK); armor: small arms' damage
  // multiplied by it; rockets: a rocket or a shell takes 1/rockets of it
  tank:      { i: 47, name: 'Ironclad Battle Tank', kind: 'car', L: 150, W: 80, max: 270, accel: 150, brake: 700, rev: 170, turn: 1.25, grip: 16, drift: 14, mass: 14, hp: 3000, seats: 1, slots: [[-62, 0]], tracks: true, turret: true, armor: 0.06, rockets: 6, rough: 0.15 },
  // ---- the SAR helicopter (H59, sar.js; hoist: the cable drawn) and the crop duster (dusting.js; spray: the mist drawn)
  duster:     { i: 65, name: 'Hopper Ag-Wing',     kind: 'air', air: 'plane', L: 128, W: 112, max: 950, accel: 210, brake: 440, rev: 0, turn: 1.55, grip: 8, drift: 2, mass: 1.2, hp: 240, seats: 1, slots: [[-30, 0]], climb: 150, sink: 220, ceiling: 800, vr: 440, stall: 340, bank: 0.85, span: 168, livery: 'duster', spray: true },
  rescueheli: { i: 64, name: 'Lifeline Rescue Helicopter', kind: 'air', air: 'heli', L: 156, W: 56, max: 740, accel: 350, brake: 400, rev: 0, turn: 2.0, grip: 8, drift: 2, mass: 1.7, hp: 420, seats: 4, slots: [[-36, 0]], climb: 175, sink: 205, ceiling: 1000, rotor: 78, hoist: true, livery: 'rescue' },
  // ---- the farm's tractor and combine (H61, farming.js): driven down a row they plough, sow or harvest it
  tractor:   { i: 48, name: 'Furrowmaster Tractor', kind: 'car', L: 84, W: 54, max: 250, accel: 170, brake: 600, rev: 110, turn: 2.0, grip: 11, drift: 6, mass: 3.2, hp: 900, seats: 1, slots: [[-34, 0]], rough: 0.08 },
  combine:   { i: 49, name: 'Reaper Combine Harvester', kind: 'car', L: 150, W: 120, max: 190, accel: 110, brake: 500, rev: 80, turn: 1.4, grip: 12, drift: 8, mass: 6, hp: 1400, seats: 1, slots: [[-60, 0]], rough: 0.08 },
  // the forklift (batch 8: server forklift.js): the forks out in front - its one cargo slot, a pallet on them; the forks'
  // height rides the wire (net.js); model in client/art2/fleet.js
  forklift:  { i: 85, name: 'Forklift',         kind: 'car',  L: 56,  W: 32, max: 240, accel: 210, brake: 640, rev: 170, turn: 3.4, grip: 9.5, drift: 1.4, mass: 1.6, hp: 260, seats: 1, slots: [[41, 0]], sprite: 'golfcart' },
  // ---- the fleet of batch 4 (the owner: "Add more vehicle and boat types", "more helicopter and plane looks"): their
  // models in client/art2/fleet.js (loaded when one is first seen); sprite: the classic view's stand-in. Where they turn
  // up: server traffic.js (by district), boats.js and the marinas (big water only), aircraft.js, airtraffic.js.
  convertible: { i: 76, name: 'Riviera Convertible', kind: 'car', L: 104, W: 50, max: 600, accel: 320, brake: 680, rev: 170, turn: 2.6, grip: 8.4, drift: 2.2, mass: 1.3, hp: 220, seats: 2, slots: [[-38, 0]], price: 18000, sprite: 'sports' },
  lowrider:  { i: 53, name: 'Bajito Lowrider',  kind: 'car',  L: 112, W: 50, max: 540, accel: 280, brake: 660, rev: 160, turn: 2.4, grip: 8.2, drift: 2.5, mass: 1.5, hp: 240, seats: 4, slots: [[-40, 0]], price: 12000, sprite: 'sedan' },
  muscle:    { i: 54, name: 'Stallion 440',     kind: 'car',  L: 104, W: 50, max: 770, accel: 480, brake: 760, rev: 180, turn: 2.6, grip: 8.4, drift: 2.6, mass: 1.4, hp: 240, seats: 2, slots: [[-36, 0]], price: 16000, sprite: 'sports' },
  hothatch:  { i: 55, name: 'Zipper GTi',       kind: 'car',  L: 82,  W: 46, max: 680, accel: 440, brake: 780, rev: 170, turn: 3.1, grip: 9.4, drift: 2.0, mass: 1.0, hp: 190, seats: 4, slots: [[-28, 0]], price: 9500, sprite: 'compact' },
  jeep:      { i: 56, name: 'Trailcat 4x4',     kind: 'car',  L: 92,  W: 50, max: 560, accel: 330, brake: 680, rev: 170, turn: 2.7, grip: 8.8, drift: 2.2, mass: 1.5, hp: 300, seats: 4, slots: [[-30, -11], [-30, 11]], price: 9000, rough: 0.35, sprite: 'pickup' },
  movingvan: { i: 57, name: 'Haul-Away Moving Van', kind: 'car', L: 132, W: 56, max: 440, accel: 210, brake: 560, rev: 130, turn: 2.0, grip: 7.6, drift: 2.4, mass: 2.4, hp: 380, seats: 2, slots: [[-30, 0]], price: 8500, sprite: 'boxtruck' },
  icecream:  { i: 58, name: 'Mr. Frosty Ice Cream Van', kind: 'car', L: 114, W: 54, max: 420, accel: 220, brake: 600, rev: 140, turn: 2.3, grip: 8.0, drift: 2.4, mass: 1.8, hp: 300, seats: 2, slots: [[-34, 0]], price: 6500, sprite: 'van' },
  sailboat:  { i: 59, name: 'Gull 26 Sailboat', kind: 'boat', L: 118, W: 40, max: 340, accel: 110, brake: 160, rev: 70,  turn: 1.5, grip: 2.4, drift: 1.4, mass: 1.6, hp: 220, seats: 4, slots: [[-34, 0]], price: 9000, sprite: 'speedboat', crew: [[-42, 0], [-30, -9], [-30, 9], [-20, 0]] },
  pontoon:   { i: 69, name: 'Sunday Pontoon',   kind: 'boat', L: 112, W: 52, max: 360, accel: 150, brake: 220, rev: 100, turn: 1.7, grip: 2.6, drift: 1.3, mass: 1.8, hp: 260, seats: 6, slots: [[-34, -12], [-34, 12], [26, -12], [26, 12]], price: 7500, sprite: 'dinghy', crew: [[8, 12], [8, -12], [-14, 14], [-14, -14], [-34, 14], [-34, -14]] },
  trawler:   { i: 70, name: 'Fishing Trawler',  kind: 'boat', L: 150, W: 56, max: 380, accel: 120, brake: 180, rev: 90,  turn: 1.3, grip: 2.2, drift: 1.2, mass: 3.4, hp: 600, seats: 4, slots: [[-46, -12], [-46, 12], [-24, -12], [-24, 12]], price: 22000, sprite: 'speedboat' },
  cabincruiser: { i: 71, name: 'Seaview 32 Cruiser', kind: 'boat', L: 128, W: 50, max: 520, accel: 220, brake: 240, rev: 110, turn: 1.8, grip: 2.4, drift: 1.2, mass: 2.2, hp: 380, seats: 4, slots: [[-44, -10], [-44, 10]], price: 26000, sprite: 'speedboat' },
  rib:       { i: 72, name: 'Sport RIB',        kind: 'boat', L: 88,  W: 42, max: 640, accel: 330, brake: 300, rev: 130, turn: 2.4, grip: 2.9, drift: 1.2, mass: 1.2, hp: 300, seats: 4, slots: [[-30, 0]], price: 9000, sprite: 'dinghy', crew: [[-4, 5], [-4, -5], [-24, 6], [-24, -6]] },
  // the aircraft's: the news crew's own helicopter, the air ambulance (a hospital's pad), the floatplane (it lands on water:
  // floats - server aircraft.js, vehicles.js; the water rolls it at 0.4 of max: vr under that)
  newsheli:  { i: 73, name: 'Channel 7 SkyCam', kind: 'air', air: 'heli', L: 150, W: 54, max: 720, accel: 340, brake: 400, rev: 0, turn: 1.9, grip: 8, drift: 2, mass: 1.6, hp: 320, seats: 3, slots: [[-34, 0]], climb: 170, sink: 200, ceiling: 1000, rotor: 76, livery: 'tv' },
  medheli:   { i: 74, name: 'Mercy Air Ambulance', kind: 'air', air: 'heli', L: 156, W: 56, max: 740, accel: 350, brake: 400, rev: 0, turn: 2.0, grip: 8, drift: 2, mass: 1.7, hp: 380, seats: 4, slots: [[-36, 0]], climb: 175, sink: 205, ceiling: 1000, rotor: 78, siren: true, livery: 'med' },
  seaplane:  { i: 75, name: 'Otter Floatplane', kind: 'air', air: 'plane', L: 128, W: 112, max: 880, accel: 200, brake: 300, rev: 0, turn: 1.3, grip: 8, drift: 2, mass: 1.5, hp: 300, seats: 4, slots: [[-34, 0]], climb: 135, sink: 200, ceiling: 900, vr: 320, stall: 280, bank: 0.75, span: 168, floats: true, livery: 'sea' },
  // the big rigs (b8a): hitch - the local x of the fifth wheel / the kingpin (server/systems/rigs.js)
  semi:      { i: 77, name: 'Roadking Semi',     kind: 'car',  L: 124, W: 58, max: 520, accel: 230, brake: 560, rev: 130, turn: 2.0, grip: 7.6, drift: 2.3, mass: 3.4, hp: 620, seats: 2, slots: [[-44, 0]], hitch: -32, sprite: 'boxtruck' },
  trailer:   { i: 78, name: 'Flatbed Trailer',  kind: 'car',  L: 250, W: 60, max: 600, accel: 0, brake: 300, rev: 0, turn: 0, grip: 6, drift: 2, mass: 3.0, hp: 700, seats: 1, slots: [[80, -14], [80, 14], [44, -14], [44, 14], [8, -14], [8, 14], [-28, -14], [-28, 14], [-64, -14], [-64, 14]], trailer: true, hitch: 103, axle: -88, sprite: 'flatbed' },
  boxtrailer: { i: 79, name: 'Box Van Trailer', kind: 'car',  L: 250, W: 60, max: 600, accel: 0, brake: 300, rev: 0, turn: 0, grip: 6, drift: 2, mass: 3.2, hp: 760, seats: 1, slots: [[-112, 0]], trailer: true, hitch: 103, axle: -88, sprite: 'boxtruck' },
};
// the motorcycles (the sport bike 'bike' and the police tourer among them)
export const MOTOS = Object.keys(VEHICLES).filter((id) => VEHICLES[id].kind === 'bike' && !VEHICLES[id].pedal);
export const PEDAL_BIKES = Object.keys(VEHICLES).filter((id) => VEHICLES[id].pedal && !VEHICLES[id].cart && !VEHICLES[id].board);

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

// A vehicle in a word, the way a job names the one it issues you ("your helicopter", "your cab" - the owner, 10-23:
// "Helicopter is referred to as 'your truck' during a job"): client/main.js drawJobTruck's plate, the jobs' notes.
const WORD_OF = { ambulance: 'ambulance', taxi: 'cab', bus: 'bus', firetruck: 'fire engine', tractor: 'tractor', combine: 'combine', towtruck: 'tow truck', police: 'cruiser', semi: 'rig', trailer: 'trailer', boxtrailer: 'trailer', van: 'van' };
export function vehicleWord(def) {
  if (!def) return 'vehicle';
  if (WORD_OF[def.id]) return WORD_OF[def.id];
  if (def.kind === 'air') return def.air === 'heli' ? 'helicopter' : 'plane';
  if (def.kind === 'boat') return 'boat';
  if (def.horse) return 'horse';
  if (def.kind === 'bike') return def.pedal ? 'bike' : 'motorbike';
  return TRUCK_MODELS.has(def.id) || /Truck/.test(def.name) ? 'truck' : 'car';
}

// Paint palette used for procedural placeholder sprites and NPC traffic variety.
export const PAINTS = [
  '#c8262b', '#2350c8', '#e8e8e8', '#2a2a2e', '#f2c21b', '#ef7a1a', '#2f9a3a', '#7a3ac8',
  '#e04a9a', '#25b8c0', '#b9b9b9', '#8a6a3a', '#1d2a5a', '#7a1d24',
];

// (no buses: they run their lines - server/systems/transit.js)
export const TRAFFIC_MIX = [
  ['sedan', 30], ['compact', 25], ['taxi', 10], ['pickup', 12], ['van', 8], ['sports', 4],
  ['flatbed', 4], ['bike', 4], ['boxtruck', 3], ['dumptruck', 1.5], ['mixer', 1], ['tanker', 1.5], ['garbage', 1], ['towtruck', 1], ['firetruck', 0.4],
  // cyclists (kept off the highway and its ramps: server/systems/traffic.js)
  ['bicycle', 2.2], ['roadbike', 1.2], ['cruiser', 0.7], ['cargobike', 0.6], ['mtb', 0.5], ['bmx', 0.4],
];
// what's locked up at the street bike racks (server/systems/traffic.js)
export const RACK_MIX = [['bicycle', 4], ['cruiser', 2], ['roadbike', 1.5], ['mtb', 1.5], ['bmx', 1], ['cargobike', 0.6]];
// heavier on the highways and in the docks, yards and industrial districts
export const TRUCK_MODELS = new Set(['flatbed', 'boxtruck', 'dumptruck', 'mixer', 'tanker', 'garbage', 'towtruck', 'movingvan']);
export const PARKED_MIX = [['sedan', 30], ['compact', 30], ['pickup', 15], ['van', 8], ['sports', 6], ['bike', 7], ['flatbed', 5]];
// Which motorcycle, where (traffic.js swaps a mix's 'bike' for one): by road kind (hwy, dirt), then the district's style.
export const MOTO_MIX = {
  hwy: [['bike', 5], ['tourer', 2], ['vtwin', 2], ['bagger', 2], ['caferacer', 1], ['trike', 0.5]],
  dirt: [['dirtbike', 8], ['ratbike', 1]],
  towers: [['bike', 5], ['scooter', 4], ['caferacer', 1.5], ['vtwin', 0.6]],
  commercial: [['scooter', 4], ['bike', 2.5], ['caferacer', 1], ['vtwin', 0.8]],
  nightlife: [['scooter', 3], ['bike', 3], ['caferacer', 1.5], ['bobber', 1], ['chopper', 0.5]],
  redlight: [['bike', 2], ['bobber', 1.5], ['chopper', 1], ['ratbike', 1], ['scooter', 1]],
  beach: [['scooter', 6], ['bobber', 1], ['vtwin', 1], ['bike', 1]],
  oldtown: [['scooter', 3], ['caferacer', 2], ['bobber', 1.5], ['vtwin', 1]],
  arts: [['scooter', 3], ['caferacer', 2.5], ['bobber', 1.5]],
  industrial: [['vtwin', 2], ['ratbike', 2], ['bike', 1], ['bobber', 1]],
  rural: [['vtwin', 3], ['bagger', 2.5], ['tourer', 1.5], ['trike', 1], ['ratbike', 1], ['dirtbike', 1], ['bobber', 1]],
  desert: [['vtwin', 3], ['bagger', 2], ['chopper', 2], ['ratbike', 1.5], ['trike', 1], ['dirtbike', 1], ['bobber', 1]],
  wild: [['dirtbike', 3], ['vtwin', 2], ['tourer', 1.5], ['ratbike', 1], ['bagger', 1]],
  town: [['bike', 3], ['scooter', 3], ['vtwin', 1.5], ['caferacer', 1], ['bobber', 1], ['bagger', 0.5], ['tourer', 0.5], ['trike', 0.3], ['ratbike', 0.3]],
};
export const motoMix = (roadKind, style) => (roadKind === 'dirt' ? MOTO_MIX.dirt : roadKind === 'hwy' ? MOTO_MIX.hwy : MOTO_MIX[style] || MOTO_MIX.town);

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

// ---- damage you can see (task #402) ----
// The clients draw it from one word (a vehicle record's parent field): bits 0-2 the stage (VDMG), 3-6 the sides hit (VZ),
// 7-9 bullet holes, 10-15 parts gone or hanging (VPART), 16-23 where a plasma blade cut it (1 tail .. 255 nose; 0 not).
export const VDMG = { NEW: 0, SCUFFED: 1, DENTED: 2, CRUMPLED: 3, HANGING: 4, BURNT: 5 };
export const VZ = { F: 1, B: 2, L: 4, R: 8 };
// BUMPER_F / BUMPER_B / BONNET: fallen off; DOOR_L / DOOR_R: hanging open; WHEEL: a buckled front wheel
export const VPART = { BUMPER_F: 1, BUMPER_B: 2, DOOR_L: 4, DOOR_R: 8, BONNET: 16, WHEEL: 32 };
// the stage from health (0..1), a dead engine and a wreck
export const damageStage = (hp, dead, wreck) => (wreck ? 5 : dead ? 4 : hp < 0.35 ? 3 : hp < 0.6 ? 2 : hp < 0.85 ? 1 : 0);
export const packVehDamage = (o) => ((o.stage & 7) | ((o.zones & 15) << 3) | ((o.holes & 7) << 7) | ((o.off & 63) << 10) | ((o.cut & 255) << 16)) >>> 0;
export const unpackVehDamage = (w) => ({ stage: Math.min(5, (w >>> 0) & 7), zones: (w >>> 3) & 15, holes: (w >>> 7) & 7, off: (w >>> 10) & 63, cut: (w >>> 16) & 255 });
// which side of a box (centre x, y, heading a, half length hl, half width hw) a point is on: VZ.F / B / L / R
// (heading 0 faces east; its right side faces south)
export function hitZone(x, y, a, hl, hw, px, py) {
  const c = Math.cos(a), s = Math.sin(a), dx = px - x, dy = py - y;
  const lx = (dx * c + dy * s) / hl, ly = (dy * c - dx * s) / hw;
  if (Math.abs(lx) >= Math.abs(ly)) return lx >= 0 ? VZ.F : VZ.B;
  return ly >= 0 ? VZ.R : VZ.L;
}
