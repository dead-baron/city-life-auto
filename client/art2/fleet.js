// Art v2's batch-4 fleet (the owner's shipping notes: "Add more vehicle and boat types"): the vintage convertible, the
// lowrider, the muscle car, the hot hatch, the open-top 4x4, the moving van, the ice-cream van; the sailboat, the pontoon,
// the fishing trawler, the cabin cruiser, the sport RIB. Built with vehicles.js's kit (KIT: the car body, the truck cab,
// the shells, the wheels and lamps) and added to its tables when this loads (addModels) - out of the renderer's code:
// the page loads this the first time one is seen (game/actors.js vehType), the workers before their first job.
// Coordinates as vehicles.js: x from the rear (0) to the front, y across (0 the left side), z up.
import { addModels, KIT } from './vehicles.js';
import { MAT } from './palette.js';
import { hash } from './gbuf.js';

const { R, deco, shell, glassy, wheels, crateOn, carBody, thirdBrake, truckCab, chassis, truckRear, boxBody, roofKit, rescueBoat } = KIT;
const DIMS = { convertible: [104, 50], lowrider: [112, 50], muscle: [104, 50], hothatch: [82, 46], jeep: [92, 50], movingvan: [132, 56], icecream: [114, 54], sailboat: [118, 40], pontoon: [112, 52], trawler: [150, 56], cabincruiser: [128, 50], rib: [88, 42], semi: [124, 58], trailer: [250, 60], boxtrailer: [250, 60], forklift: [96, 32] };
const TALL = { convertible: 30, lowrider: 29, muscle: 30, hothatch: 31, jeep: 40, movingvan: 60, icecream: 64, sailboat: 96, pontoon: 34, trawler: 70, cabincruiser: 46, rib: 26, semi: 60, trailer: 30, boxtrailer: 66, forklift: 44 };
const PAINT = { convertible: '#5ab0a8', lowrider: '#7a2a8a', muscle: '#d88a2a', hothatch: '#c8302c', jeep: '#5e6e3e', movingvan: '#e8702a', icecream: '#f2a6c0', sailboat: '#22305a', pontoon: '#2f8a86', trawler: '#a8342a', cabincruiser: '#22305a', rib: '#4a4c52', semi: '#c8302c', trailer: '#5a5e66', boxtrailer: '#e8e6e0', forklift: '#e8b018' };
// the car bodies (vehicles.js carBody's spec: x along the length as a fraction of it)
const BODY = {
  convertible: { belt: 17, nose: 13, tail: 15.5, hood: 0.64, boot: 0.24, roof: 17, wheels: [0.19, 0.8], wr: 7.5, seams: [0.52], lampW: 9, rf: 8, rr: 6, shoulder: 0.4, tailUp: 2 },
  lowrider: { belt: 15.5, nose: 12, tail: 14, hood: 0.7, boot: 0.24, cab: [0.27, 0.72], roof: 28, fr: 12, br: 10, ci0: 3, ci1: 6.5, wheels: [0.17, 0.82], wr: 6.5, ww: 6, wi: 3.5, z0: 2, seams: [0.36, 0.55], pillars: [0.5], lampW: 8 },
  muscle: { belt: 18, nose: 14, tail: 17, hood: 0.66, boot: 0.12, cab: [0.16, 0.66], roof: 29, fr: 15, br: 19, ci0: 3.5, ci1: 7, wheels: [0.18, 0.8], wr: 7.6, ww: 8, wi: 1.8, seams: [0.5], pillars: [], lampW: 9, rf: 6, rr: 5, shoulder: 0.35 },
  hothatch: { belt: 17, nose: 12.5, tail: 16, hood: 0.76, boot: 0.04, cab: [0.05, 0.74], roof: 30, fr: 11, br: 4, ci0: 3, ci1: 6, wheels: [0.17, 0.82], wr: 7.2, ww: 7.5, wi: 1.6, rf: 8, rr: 6, lampW: 8, seams: [0.5], pillars: [0.48], tailUp: 3 },
  jeep: { belt: 24, nose: 22, tail: 23, hood: 0.64, boot: 0.02, roof: 24, wheels: [0.18, 0.8], wr: 9, ww: 8, wi: 1.4, z0: 7, rf: 3, rr: 3, lampW: 7, lampZ: 17, seams: [0.46], shoulder: 0.1, frontRound: 0.3, rearRound: 0.3 },
  icecream: { belt: 25, nose: 21, tail: 24.5, hood: 0.84, boot: 0, cab: [0, 0.88], roof: 46, fr: 9, br: 0, ci0: 0.5, ci1: 2.5, wheels: [0.17, 0.81], wr: 8, z0: 5, seams: [0.7], pillars: [], lampW: 8, lampZ: 17, tailUp: 4, rr: 4, rf: 8,
    win: (x, y, z, face) => face === 'front' || (face === 'side' && x > 77 && x < 93 && z > 31) || (face === 'back' && z > 30 && z < 41) },
};
const PASTEL = ['#f2a6c0', '#a8e0c8', '#a8c8f0', '#f2e0a0'];

// an open cockpit cut into a body without a roof (the convertible's, the 4x4's): the floor at fz, its seats
function cockpit(m, M, b, x0, x1, fz, seat) {
  m.fill((x, y) => (x > x0 && x < x1 && Math.abs(y - b.cy) < b.hw0 - 2.4 ? 0 : -1), 0, 0, Math.floor(fz), m.w, m.d, m.h);
  deco(m, M.interior, x0, 0, fz - 1, x1, m.d, fz + 1, (x, y, z, v, side) => side === 'z');
  return (sx, w, back) => {   // a seat: from sx (rear) w long, the back at the rear; a bench across, or two buckets
    for (const [ya, yb] of back === 2 ? [[b.cy - b.hw0 + 3, b.cy - 1.5], [b.cy + 1.5, b.cy + b.hw0 - 3]] : [[b.cy - b.hw0 + 3, b.cy + b.hw0 - 3]]) {
      m.box(sx, ya, fz, sx + w, yb, fz + 4, seat); m.box(sx, ya, fz + 4, sx + 2.5, yb, fz + 10, seat);
    }
  };
}
// whitewalls: a white ring on each tyre's outer face
const whitewalls = (m, M, b, white) => deco(m, white, 0, 0, 0, m.w, m.d, b.wr * 2 + 1, (x, y, z, v, side) => v === M.tyre && side === 'y' && b.wx.some((wx) => { const d = Math.hypot(x - wx, z - b.wr); return d > b.wr * 0.7 && d < b.wr * 0.88; }));

function car(type, m, M, A, V, o) {
  const L = m.w, W = m.d, v = (o.variant | 0) & 7, s = { ...BODY[type] }, cream = m.mat({ ramp: R('#e8dcc0'), k: 3 });
  if (type === 'lowrider') M.rim = m.mat({ ramp: R(v & 1 ? '#c8ccd4' : '#e0b040', 6, 3, { light: 0.7 }), k: 3, shade: (x, y, z) => { const L2 = m.look || {}, w = (L2.wheels || []).reduce((a, q) => (Math.abs(x - q) < Math.abs(x - a) ? q : a), 0), a = Math.atan2(z - (L2.wr || 6), x - w); return Math.round(a * 6.4) % 2 ? 0.8 : -0.6; } });   // (wire wheels, gold or chrome)
  if (type === 'convertible' || type === 'lowrider' || type === 'muscle') s.bumper = M.chrome;
  const b = carBody(m, M, s), cy = b.cy;
  if (s.cab) thirdBrake(m, M, b, s.cab[0] + 0.02, s.roof);
  if (type === 'convertible') {
    // a fifties droptop: the cockpit open to the sky, a bench front and back in cream, the wrapround windscreen, the top
    // folded down behind the rear seat, tail fins, a chrome spear down each side, whitewalls; two-tone on some
    const seat = cockpit(m, M, b, L * 0.3, L * 0.62, 9, cream);
    seat(L * 0.48, L * 0.09); seat(L * 0.32, L * 0.09);
    m.box(L * 0.6, cy - b.hw0 + 3, 13, L * 0.62, cy + b.hw0 - 3, 18, M.dark);                                    // the dash
    m.cyl('x', 0, cy - 8, 18, 3, L * 0.575, L * 0.585, M.trim, 2, 0);                                            // the wheel
    for (let z = b.belt; z < b.belt + 8; z++) { const x = L * 0.63 - (z - b.belt) * 0.55; m.box(x, 4, z, x + 1, W - 4, z + 1, z > b.belt + 6.5 ? M.chrome : M.glass); }
    m.ell(L * 0.27, cy, b.belt + 1, L * 0.04, b.hw0 - 3, 2.6, m.mat({ ramp: R(v & 2 ? '#2a2a2e' : '#d8c8a0'), k: 3 }));   // the folded top
    for (const y of [2, W - 4]) for (let x = 0; x < L * 0.2; x++) m.box(x, y, b.belt, x + 1, y + 2, b.belt + 4.5 * (1 - x / (L * 0.2)) + 0.5, M.body);   // the fins
    deco(m, M.chrome, L * 0.12, 0, b.belt - 5, L * 0.86, W, b.belt - 4, (x, y, z, vv, side) => side === 'y');
    if (V.twoTone) deco(m, M.white, L * 0.2, 0, b.belt - 4, L * 0.75, W, b.belt + 1, (x, y, z, vv, side) => side === 'y' && vv === M.body);
    whitewalls(m, M, b, M.white);
    A.seat = [L * 0.52, cy - W * 0.18, 13];
  }
  if (type === 'lowrider') {
    // long and slammed on its little wire wheels, chrome everywhere - the spear down the side, the bumpers - pinstripes on
    // the hood, flames licking back from the front wheels on some, a continental kit (the spare on the back) on others
    deco(m, M.chrome, L * 0.05, 0, b.belt - 3, L * 0.95, W, b.belt - 2, (x, y, z, vv, side) => side === 'y');
    deco(m, M.gold, L * 0.72, 0, 0, L, W, m.h, (x, y, z, vv, side) => side === 'z' && vv === M.body && (Math.abs(Math.abs(y - cy) - 7 - Math.sin(x * 0.25) * 2) < 0.5));
    if (v & 2) deco(m, (x, y, z) => (z > b.belt - 6 + Math.sin(x * 0.7) * 2.5 ? M.stripeYellow : M.stripeRed), L * 0.6, 0, b.z0 + 2, L * 0.97, W, b.belt + 0.5, (x, y, z, vv, side) => side === 'y' && vv === M.body && z > b.belt - 9 + Math.sin(x * 0.9 + y) * 3 - (L * 0.97 - x) * 0.12);
    if (v & 4) { m.box(0, cy - 9, 3, 3, cy + 9, 6, M.chrome); m.cyl('x', 0, cy, 12, 6.5, 0, 3, M.tyre, 3.5, M.rim); }
    if (V.twoTone) deco(m, M.white, 0, 0, s.roof - 1.5, L, W, m.h, (x, y, z, vv, side) => side === 'z' && vv === M.body);
    whitewalls(m, M, b, M.white);
  }
  if (type === 'muscle') {
    // the fastback: a hood scoop, a ducktail spoiler, fat rear tyres, the racing stripes over it nose to tail on most
    m.box(L * 0.74, cy - 5, b.belt - 1, L * 0.86, cy + 5, b.belt + 2.5, M.body);
    m.box(L * 0.855, cy - 4, b.belt - 0.5, L * 0.865, cy + 4, b.belt + 2, M.dark);
    m.box(0, 3, s.tail, L * 0.06, W - 3, s.tail + 2.5, M.body);
    if (!(v & 4)) deco(m, v & 1 ? M.black : M.white, 0, 0, 0, L, W, m.h, (x, y, z, vv, side) => side === 'z' && vv === M.body && Math.abs(Math.abs(y - cy) - 3.5) < 1.6);
    deco(m, M.dark, L - 3, 0, b.lz - 1, L, W, b.lz + b.lh + 1, (x, y, z, vv, side) => side === 'x' && Math.abs(y - cy) < b.hw0 - 1);   // (the full-width black grille)
    for (const y of [cy - 9, cy + 7]) m.box(-1, y, 3, 3, y + 2, 5, M.chrome);
  }
  if (type === 'hothatch') {
    // a hot hatch: the roof spoiler, a stripe along the sills, a red line through the grille, twin pipes
    m.box(L * 0.02, 6, s.roof - 1, L * 0.1, W - 6, s.roof + 0.5, M.dark);
    deco(m, v & 1 ? M.white : M.black, 0, 0, b.z0 + 2, L, W, b.z0 + 5, (x, y, z, vv, side) => side === 'y' && vv === M.body);
    deco(m, M.stripeRed, L - 3, 0, b.lz + 1, L, W, b.lz + 2, (x, y, z, vv, side) => side === 'x' && Math.abs(y - cy) < b.hw0 - 2);
    for (const y of [cy + 4, cy + 8]) m.box(-1, y, 3, 3, y + 2, 5, M.chrome);
  }
  if (type === 'jeep') {
    // an open-top 4x4: the tub open behind the windscreen, two buckets and a bench, the roll bar over them, the spare on
    // the back, round lamps and a slotted grille, knobbly tyres; the back of the tub (A.bed) takes crates
    const seat = cockpit(m, M, b, L * 0.06, L * 0.6, 14, M.seat);
    seat(L * 0.4, L * 0.1, 2); seat(L * 0.14, L * 0.1);
    m.box(L * 0.58, cy - b.hw0 + 2, 14, L * 0.6, cy + b.hw0 - 2, 25, M.dark);
    m.cyl('x', 0, cy - 8, 25, 3, L * 0.55, L * 0.56, M.trim, 2, 0);
    for (let z = b.belt; z < b.belt + 11; z++) m.box(L * 0.62, 3, z, L * 0.64, W - 3, z + 1, z > b.belt + 9.5 || z < b.belt + 1 ? M.trim : M.glass);
    for (const x of [L * 0.36, L * 0.13]) { for (const y of [4, W - 6]) m.box(x, y, b.belt, x + 2, y + 2, b.belt + 15, M.trim); m.box(x, 4, b.belt + 13, x + 2, W - 4, b.belt + 15, M.trim); }
    for (const y of [4, W - 6]) m.box(L * 0.13, y, b.belt + 13, L * 0.36 + 2, y + 2, b.belt + 15, M.trim);
    m.cyl('x', 0, cy, 18, 8, -2, 3, M.tyre, 4.5, M.rim);
    deco(m, M.dark, L - 3, 0, 9, L, W, b.belt - 2, (x, y, z, vv, side) => side === 'x' && Math.abs(y - cy) < 9 && Math.round(y) % 3 === 0);
    A.bed = 14; A.seat = [L * 0.45, cy - W * 0.18, 18];
    (o.cargo || []).forEach((t, i) => crateOn(m, 4 + (i % 2) * 13, 6 + Math.floor(i / 2) * 14, 14, t, M));
  }
  if (type === 'icecream') {
    // the ice-cream van: pastel and white, the serving hatch lit on the kerb side under a striped awning, the menu by
    // it, a giant cone on the roof, the chimes' horn at the front of it
    const pastel = m.mat({ ramp: R(PASTEL[v & 3]), k: 3 }), cone = m.mat({ ramp: R('#d8a858'), k: 3, shade: (x, y, z) => (((x + z) | 0) % 3 === 0 || ((x - z) | 0) % 3 === 0 ? -0.9 : 0) });
    deco(m, (x, y, z) => (z < 22 ? pastel : M.white), 0, 0, 0, L, W, s.roof, (x, y, z, vv, side) => vv === M.body && (side !== 'z' || x > L * 0.86));
    deco(m, (x) => (Math.floor(x / 5) % 2 ? M.white : pastel), 0, 0, s.roof - 1, L * 0.86, W, m.h, (x, y, z, vv, side) => side === 'z' && vv === M.body);
    deco(m, M.hatch, L * 0.28, W - 2, 26, L * 0.62, W, 40, (x, y, z, vv, side) => side === 'y');
    m.box(L * 0.26, W - 2, 40, L * 0.64, W, 42, M.awn); m.box(L * 0.26, W - 1, 38, L * 0.64, W, 40, M.awn2);
    m.box(L * 0.27, W - 3, 25, L * 0.63, W, 26, M.steel);
    for (const [x, c] of [[0.66, '#e8603a'], [0.72, '#5ab0d8'], [0.78, '#e8c040']]) deco(m, m.mat({ ramp: R(c), k: 3 }), L * x, W - 2, 28, L * x + 4, W, 34, (xx, y, z, vv, side) => side === 'y');
    m.box(L * 0.45 - 5, W / 2 - 5, s.roof, L * 0.45 + 5, W / 2 + 5, s.roof + 2, M.steel);
    for (let z = s.roof + 2; z < s.roof + 14; z++) { const r = (z - s.roof - 2) * 0.62 + 1; m.cyl('z', L * 0.45, W / 2, 0, r, z, z + 1, cone); }
    m.ell(L * 0.45, W / 2, s.roof + 17, 8.5, 8.5, 6.5, pastel); m.ell(L * 0.45 + 1, W / 2, s.roof + 23.5, 2, 2, 2, M.stripeRed);
    m.box(L * 0.78, W / 2 - 2, s.roof, L * 0.84, W / 2 + 2, s.roof + 4, M.chrome);
    A.seat = [L * 0.76, cy - W * 0.2, 28];
  }
}

function movingVan(m, M, A, o) {
  // a cab-over moving van: a short-nosed cab in the hire firm's colour, the white box with its loft over the cab, the
  // firm's band and arrow down the sides in that colour, the roll-up door and a loading step at the back
  const L = m.w, W = m.d, cy = W / 2, cabH = 40, cx0 = truckCab(m, M, L - 1, cabH, { cabL: 24, hood: 12, stack: false, hoodZ: 23 });
  chassis(m, M, cx0, cx0 + 4);
  m.look = { ...m.look, belt: 28, z0: 7, roof: cabH, wheels: [L * 0.17, L * 0.82], wr: 8.5 };
  const box = (x, y, z, sh) => (z > 12 && z < 27 && sh.side < 1.6 ? M.body : sh.side < 1.6 && Math.round(x) % 20 === 0 ? M.seam : M.white);
  boxBody(m, 2, cx0 - 1, 9, 58, box, { r: 1.5, rz: 1.5 });
  shell(m, { x0: cx0 - 3, x1: cx0 + 15, y0: 2, y1: W - 2, z0: cabH + 1, z1: 58, fr: 7, r: 2, rz: 2, mat: (x, y, z) => (z < cabH + 4 ? M.body : M.white) });
  roofKit(m, M, 2, cx0 + 12, 57, { step: 20 });
  const ax = L * 0.4, az = 39;
  deco(m, M.body, ax - 26, 0, az - 9, ax + 18, W, az + 9, (x, y, z, vv, side) => side === 'y' && (x < ax + 4 ? Math.abs(z - az) < 3 : Math.abs(z - az) < 9 - (x - ax - 4) * 0.65));   // the arrow
  deco(m, M.seam, 0, 0, 10, 2, W, 56, (x, y, z, vv, side) => side === 'x' && Math.round(z) % 5 === 0);   // (the roll-up door's slats)
  m.box(-1, 6, 5, 4, W - 6, 7, M.steel);
  wheels(m, [L * 0.17, L * 0.82], 8.5, M, { width: 8, inset: 2 });
  truckRear(m, M, 12);
  A.fire.push([L * 0.4, cy, 30]);
}

// ---- the big rigs (b8a: server/systems/rigs.js) ----------------------------------------------------------------------
// the tractor unit: a long-nosed conventional with a sleeper box behind the cab, twin chrome stacks, the fuel tanks and the
// fifth wheel's greased plate over the tandem drive axles (shared/vehicles.js semi.hitch: 32 px behind the middle)
function semi(m, M, A) {
  const L = m.w, W = m.d, cy = W / 2, cabH = 52, cx0 = truckCab(m, M, L - 1, cabH, { cabL: 30, hood: 24, hoodZ: 28, stack: false });
  chassis(m, M, cx0, cx0 + 4);
  m.look = { ...m.look, belt: 32, z0: 7, roof: cabH, wheels: [L * 0.14, L * 0.3, L * 0.84], wr: 9.5 };
  shell(m, { x0: cx0 - 18, x1: cx0 + 2, y0: 3, y1: W - 3, z0: 9, z1: cabH + 4, r: 3, rz: 4, mat: (x, y, z, sh) => (sh.side < 1.6 && z > 20 && z < 24 ? M.chrome : M.cab || M.body) });   // the sleeper
  deco(m, M.glass, cx0 - 12, 0, 34, cx0 - 6, W, 40, (x, y, z, vv, side) => side === 'y');
  for (const y of [1.5, W - 3.5]) { m.cyl('z', cx0 - 20, y + 1, 0, 1.8, 14, cabH + 16, M.chrome); m.box(cx0 - 22, y, cabH + 14, cx0 - 18, y + 2, cabH + 16, M.trim); }   // the stacks
  const fifth = L / 2 - 32;
  m.box(4, 8, 11, cx0 - 22, W - 8, 14, M.trim);
  m.cyl('z', fifth, cy, 0, 11, 14, 16, M.steel); m.box(fifth - 11, cy - 2, 14, fifth - 4, cy + 2, 16.5, M.dark);   // the plate and its slot
  for (const y of [1, W - 4]) m.box(0, y, 4, 3, y + 3, 16, M.dark);   // (the mud flaps)
  wheels(m, [L * 0.14, L * 0.3, L * 0.84], 9.5, M, { width: 8, inset: 2 });
  truckRear(m, M, 12);
  A.exhaust = [cx0 - 20, 2.5, cabH + 16];
  A.fire.push([L * 0.62, cy, 30]);
}
// a trailer: the frame and its tandem axles at the back, the landing legs up front, the kingpin under the nose; the
// flatbed's plank deck with stake pockets and a headboard (its load: the crates, drawn on their own), or the box van's
// tall white box with its ribs, a reefer unit on the nose of some, the swing doors and their bars at the back
function trailer(type, m, M, A, V) {
  const L = m.w, W = m.d, cy = W / 2, box = type === 'boxtrailer';
  m.look = { ...m.look, belt: 26, z0: 8, roof: box ? 64 : 26, wheels: [L * 0.07, L * 0.15], wr: 9.5 };
  m.box(2, 8, 12, L - 4, W - 8, 17, M.trim);                                                                          // the frame rails
  for (const x of [L * 0.74, L * 0.76]) for (const y of [7, W - 10]) m.box(x, y, 0, x + 3, y + 3, 14, M.steel);        // the landing legs
  m.box(L * 0.73, 6, 1, L * 0.78, W - 6, 2, M.trim);
  if (!box) {
    m.box(1, 2, 17, L - 2, W - 2, 21, M.body);
    m.box(1, 3, 21, L - 3, W - 3, 23, M.wood);
    deco(m, M.seam, 1, 3, 22, L - 3, W - 3, 23.5, (x, y, z, vv, side) => side === 'z' && Math.round(y) % 9 === 0);
    for (let x = 6; x < L - 8; x += 18) for (const y of [1, W - 3]) m.box(x, y, 17, x + 3, y + 2, 26, M.trim);         // stake pockets, stakes
    m.box(L - 7, 2, 23, L - 2, W - 2, 30, M.body);                                                                    // the headboard
    deco(m, M.steel, L - 7, 2, 23, L - 2, W - 2, 30, (x, y, z) => (z | 0) % 3 === 0);
    A.bed = 23;
  } else {
    boxBody(m, 1, L - 2, 16, 64, (x, y, z, sh) => (sh.side < 1.6 && Math.round(x) % 14 === 0 ? M.seam : sh.side < 1.6 && z > 20 && z < 24 && V.twoTone ? M.stripeRed || M.trim : M.body), { r: 1.5, rz: 1.5 });
    roofKit(m, M, 2, L - 4, 63, { step: 28 });
    if (V.rack) m.box(L - 6, 10, 34, L + 0, W - 10, 58, M.white);                                                     // a reefer unit on the nose
    deco(m, M.seam, 0, cy - 0.5, 17, 2, cy + 0.5, 63, (x, y, z, vv, side) => side === 'x');                           // the swing doors
    for (const y of [cy - 10, cy - 4, cy + 4, cy + 10]) deco(m, M.chrome, 0, y - 0.5, 18, 2, y + 0.5, 62, (x, yy, z, vv, side) => side === 'x');   // their bars
    if (V.rusty) deco(m, M.rust || M.seam, 0, 0, 16, L, W, 30, (x, y, z, vv, side) => side === 'y' && hash(x | 0, z | 0, 9) > 0.86);
  }
  for (const y of [2, W - 5]) m.box(L * 0.03, y, 4, L * 0.04, y + 3, 15, M.dark);                                    // (the mud flaps)
  wheels(m, [L * 0.07, L * 0.15], 9.5, M, { width: 8, inset: 2 });
  truckRear(m, M, 12);
  A.fire.push([L * 0.5, cy, box ? 40 : 24]);
}
// the forklift (batch 8: server forklift.js): the yellow body and its counterweight, the seat under the overhead guard, the
// mast at the front and the carriage with its two tines - up the mast to o.reel's height (0 down, 1 carrying, 2 a pallet's
// height up, 3 higher: the wire's fork stage, as the pallet on them is drawn). The body is the middle 56 px (its length in
// play), the tines out in front of it to where the pallet sits (its cargo slot).
const FORK_Z = [0, 2, 14, 22];
function forklift(m, M, A, o) {
  const W = m.d, cy = W / 2, x0 = 20, x1 = 76, fz = FORK_Z[(o.reel | 0) & 3];
  m.box(x0, 4, 3, x0 + 12, W - 4, 19, M.body); m.box(x0, 5, 3, x0 + 2, W - 5, 17, M.dark);   // (the counterweight, its back)
  m.box(x0 + 10, 5, 4, x1 - 10, W - 5, 13, M.body); m.box(x0 + 10, 5, 4, x1 - 10, W - 5, 6, M.lower);
  m.box(x1 - 12, 7, 6, x1 - 8, W - 7, 16, M.dark);   // (the dash and the levers)
  m.box(x0 + 22, cy - 6, 13, x0 + 30, cy + 6, 16, M.seat || M.dark); m.box(x0 + 21, cy - 6, 16, x0 + 23, cy + 6, 24, M.seat || M.dark);
  for (const x of [x0 + 14, x1 - 12]) for (const y of [5, W - 7]) m.box(x, y, 13, x + 2, y + 2, 37, M.trim);
  for (let x = x0 + 14; x <= x1 - 10; x += 4) m.box(x, 5, 36, x + 1, W - 5, 38, M.trim);
  m.box(x0 + 14, 5, 36, x1 - 10, 7, 38, M.trim); m.box(x0 + 14, W - 7, 36, x1 - 10, W - 5, 38, M.trim);
  m.box(x0 + 30, cy - 1.5, 38, x0 + 33, cy + 1.5, 41, M.amber);   // (the beacon)
  for (const y of [7, W - 9]) m.box(x1 - 6, y, 2, x1 - 3, y + 2, 44, M.steel);   // (the mast)
  m.box(x1 - 6, 7, 42, x1 - 3, W - 7, 44, M.steel);
  m.box(x1 - 3, 6, fz + 1, x1, W - 6, fz + 11, M.dark);   // (the carriage, then the tines out to the front)
  for (const y of [cy - 7, cy + 4]) m.box(x1, y, fz, m.w, y + 3, fz + 1.4, M.steel);
  wheels(m, [x0 + 8, x1 - 12], 6, M, { width: 5, inset: 1 });
  A.head.push([x1 - 4, 6, 30], [x1 - 4, W - 6, 30]); A.tail.push([x0, 7, 14], [x0, W - 7, 14]);
  A.seat = [x0 + 26, cy, 16]; A.fire.push([x0 + 8, cy, 14]); A.bed = 1;
}

// ---- the boats ------------------------------------------------------------------------------------------------------
// a hull: its plan narrowing to the bow from fraction bow of the length, its sides flaring to the deck at hz; the top
// of the sides (the sheer, rising bowRise toward the bow) in top, a band in band from za to zb, below in low; the deck in
// deck (null: open inside down to floor - an open boat)
function hull(m, o) {
  const L = m.w, W = m.d, cy = W / 2, hz = o.hz, bow = o.bow ?? 0.66;
  m.fill((x, y, z) => {
    const t = x / L, bt = t > bow ? (t - bow) / (1 - bow) : 0, rise = (o.rise || 0) * bt * bt;
    const half = (W / 2 - 1) * (1 - bt * bt * 0.95) * (0.62 + 0.38 * Math.min(1, z / hz)) * (t < 0.02 ? 0.93 : 1);
    if (Math.abs(y - cy) > half || z > hz + rise) return -1;
    if (z > hz + rise - 2) return Math.abs(y - cy) > half - 2.2 ? o.top : o.deck;
    if (z >= o.za && z < o.zb) return o.band;
    return z < o.za ? o.low : o.top;
  }, 0, 0, 0, L, W, Math.ceil(hz + (o.rise || 0) + 1));
}
const rail = (m, M, x0, x1, ys, z, h = 5) => { for (const y of ys) { m.box(x0, y, z + h - 1, x1, y + 1, z + h, M.chrome); for (let x = x0; x < x1; x += 7) m.box(x, y, z, x + 1, y + 1, z + h, M.chrome); } };

function boat(type, m, M, A, V, o) {
  const L = m.w, W = m.d, cy = W / 2, v = (o.variant | 0) & 7;
  const teak = m.mat({ ramp: MAT.woodDock, k: 3, shade: (x, y) => ((y | 0) % 3 === 0 ? -0.9 : 0) });
  const nonslip = m.mat({ ramp: R('#e4ddc8'), k: 3, shade: (x, y) => (((x | 0) + (y | 0)) % 4 === 0 ? -0.5 : 0) });
  const anti = m.mat({ ramp: R('#8a2a24'), k: 2 });
  if (type === 'sailboat') {
    // a 26 ft sloop: a white hull with its paint along the boot-top, the cabin trunk and its ports, the cockpit aft with
    // its benches and the tiller, the mast with the mainsail set on its boom and the jib to the bow, the stays, the pulpit
    const hz = 11;
    hull(m, { hz, bow: 0.6, rise: 3, top: M.white, deck: nonslip, band: M.body, za: 4, zb: 7, low: anti });
    m.fill((x, y) => (x > L * 0.06 && x < L * 0.36 && Math.abs(y - cy) < W / 2 - 5 ? 0 : -1), 0, 0, hz - 4, L, W, hz + 1);
    deco(m, teak, L * 0.06, 0, hz - 5, L * 0.36, W, hz - 3, (x, y, z, vv, side) => side === 'z');
    for (const y of [5, W - 10]) m.box(L * 0.08, y, hz - 4, L * 0.34, y + 5, hz - 1, M.white);
    shell(m, { x0: L * 0.36, x1: L * 0.66, y0: 8, y1: W - 8, z0: hz - 1, z1: hz + 6, fr: 5, br: 1, r: 3, rz: 2, mat: (x, y, z, sh) => (sh.side < 1.6 && z > hz + 1 && z < hz + 4 && Math.round(x) % 9 < 3 ? M.glass : M.white) });
    m.box(L * 0.02, cy - 0.5, hz, L * 0.16, cy + 0.5, hz + 2, M.wood);                                         // the tiller
    const mx = L * 0.6, top = hz + 82, bz = hz + 12, bx = L * 0.1;
    m.cyl('z', mx, cy, 0, 1.3, hz, top, M.steel);
    m.box(bx, cy - 0.8, bz - 1, mx, cy + 0.8, bz + 1, M.steel);                                                  // the boom
    const sail = m.mat({ ramp: R('#f4f2ea', 6, 3, { light: 0.6 }), k: 3, shade: (x, y, z) => (Math.round(z) % 11 === 0 ? -0.8 : 0) }), cloth = v & 1 ? M.stripeRed : M.stripeBlue;
    for (let x = Math.ceil(bx + 1); x < mx; x++) {
      const t = (x - bx) / (mx - bx), zt = bz + (top - 4 - bz) * t;
      for (let z = bz + 1; z < zt; z++) { const u = (z - bz) / (top - bz), belly = Math.sin(Math.PI * u) * 3 * (1 - Math.abs(t - 0.6)); m.box(x, cy + belly - 0.5, z, x + 1, cy + belly + 1, z + 1, Math.abs(z - (bz + 14)) < 1.5 ? cloth : sail); }
    }
    for (let x = Math.ceil(mx + 2); x < L * 0.97; x++) {   // the jib: from the masthead's lower part down to the bow, its foot along the deck
      const t = (x - mx) / (L * 0.97 - mx), zt = hz + 64 * (1 - t) + 3;
      for (let z = hz + 3; z < zt; z++) { const belly = Math.sin(Math.PI * (z - hz) / 70) * 2.4 * (1 - t); m.box(x, cy - belly - 0.5, z, x + 1, cy - belly + 0.5, z + 1, sail); }
    }
    for (let k = 0; k <= 1; k += 0.01) m.box(L * 0.01 + (mx - L * 0.01) * k, cy, hz + 3 + (top - hz - 3) * k, L * 0.01 + (mx - L * 0.01) * k + 1, cy + 1, hz + 4 + (top - hz - 3) * k, M.trim);   // the backstay
    rail(m, M, L * 0.82, L * 0.96, [5, W - 6], hz + 1, 4);
    A.seat = [L * 0.24, cy, hz - 2]; A.head.push([L - 2, cy, hz + 2]); A.tail.push([1, cy, hz]); A.fire.push([L * 0.5, cy, hz + 4]);
  }
  if (type === 'pontoon') {
    // a party pontoon: two aluminium tubes under a flat carpeted deck, the fence round it in the paint with its rail,
    // couches down the sides and across the stern, the bimini over the middle, the helm on the right, an outboard
    const alu = m.mat({ ramp: MAT.metal, k: 3, shade: (x) => (Math.round(x) % 12 === 0 ? -0.7 : 0) }), carpet = m.mat({ ramp: R('#5a6a7a'), k: 2, shade: (x) => ((x | 0) % 2 ? -0.4 : 0) });
    for (const y of [11, W - 11]) { m.cyl('x', 0, y, 6, 6, 3, L - 12, alu); for (let k = 0; k < 9; k++) m.cyl('x', 0, y, 6, 6 - k * 0.6, L - 12 + k, L - 11 + k, alu); }
    m.box(2, 1, 11, L - 6, W - 1, 13, carpet);
    deco(m, M.trim, 2, 0, 11, L - 6, W, 12, (x, y, z, vv, side) => side !== 'z');
    for (const [x0, x1] of [[4, L * 0.44], [L * 0.52, L - 10]]) for (const y of [1, W - 2]) { m.box(x0, y, 13, x1, y + 1, 21, M.body); m.box(x0, y, 21, x1, y + 1, 22, M.chrome); }
    m.box(L - 10, 1, 13, L - 8, W - 1, 21, M.body); m.box(2, 1, 13, 4, cy - 6, 21, M.body); m.box(2, cy + 6, 13, 4, W - 1, 21, M.body);
    const vinyl = m.mat({ ramp: R('#ece4d0'), k: 3 }), acc = M.body;
    for (const [x0, x1, y0, y1] of [[6, L * 0.4, 2, 9], [6, L * 0.4, W - 9, W - 2], [L * 0.56, L - 12, 2, 9], [5, 10, 9, W - 9]]) { m.box(x0, y0, 13, x1, y1, 17, vinyl); deco(m, acc, x0, y0, 13, x1, y1, 16, (x, y, z, vv, side) => side !== 'z'); }
    for (const x of [L * 0.3, L * 0.68]) for (const y of [3, W - 4]) m.box(x, y, 13, x + 1, y + 1, 33, M.chrome);
    m.box(L * 0.28, 3, 32, L * 0.7, W - 3, 34, m.mat({ ramp: R(v & 1 ? '#2a3a5a' : '#ece4d0'), k: 3 }));
    m.box(L * 0.52, W - 14, 13, L * 0.6, W - 4, 22, M.white); m.box(L * 0.58, W - 13, 22, L * 0.6, W - 5, 26, M.glass);
    m.box(-2, cy - 4, 4, 5, cy + 4, 20, M.dark); m.box(-2, cy - 3, 18, 6, cy + 3, 22, M.trim);
    A.seat = [L * 0.55, W - 10, 16]; A.head.push([L - 4, cy, 14]); A.tail.push([1, cy - 8, 14], [1, cy + 8, 14]); A.fire.push([L * 0.4, cy, 16]);
  }
  if (type === 'trawler') {
    // a fishing trawler: a deep hull in its paint, white bulwarks, the wheelhouse forward with its windows, a mast and the
    // outrigger booms raised, the net drum and the gantry at the stern, fish boxes on the open deck, life rings
    const hz = 18, cy2 = cy, net = m.mat({ ramp: R('#3a6a4a'), k: 2, shade: (x, y, z) => (((x + z) | 0) % 2 ? -0.7 : 0.3) });
    hull(m, { hz, bow: 0.7, rise: 6, top: M.white, deck: m.mat({ ramp: R('#6a6e70'), k: 2 }), band: M.body, za: 2, zb: 14, low: M.black });
    for (const y of [1, W - 3]) m.box(L * 0.05, y, hz, L * 0.7, y + 2, hz + 4, M.white);
    shell(m, { x0: L * 0.52, x1: L * 0.76, y0: 8, y1: W - 8, z0: hz, z1: hz + 20, fr: 3, r: 2, rz: 2, mat: glassy(M.white, M.glass, { band: [hz + 11, hz + 17], pillars: [L * 0.6, L * 0.68] }) });
    m.box(L * 0.54, 7, hz + 20, L * 0.75, W - 7, hz + 21, M.trim);
    m.cyl('z', L * 0.64, cy2, 0, 1.4, hz + 21, hz + 46, M.trim);
    m.box(L * 0.6, cy2 - 4, hz + 26, L * 0.68, cy2 + 4, hz + 27, M.steel);                                       // (the radar)
    for (const sd of [-1, 1]) for (let k = 0; k < 30; k++) { const y = cy2 + sd * (4 + k * 0.82), z = hz + 20 + k * 1.05; m.box(L * 0.5, y - 0.6, z, L * 0.5 + 1.5, y + 0.6, z + 1, M.steel); }   // the outriggers
    m.cyl('z', L * 0.5, cy2, 0, 1.6, hz, hz + 26, M.steel);
    m.cyl('y', L * 0.12, 0, hz + 6, 6, cy - 14, cy + 14, net);                                                    // the net drum
    for (const y of [cy - 18, cy + 16]) m.box(L * 0.04, y, hz, L * 0.06, y + 2, hz + 22, M.body);
    m.box(L * 0.04, cy - 18, hz + 20, L * 0.06, cy + 18, hz + 22, M.body);                                       // (the gantry)
    const fish = m.mat({ ramp: R('#2f6ab0'), k: 3 });
    for (let k = 0; k < (v & 3) + 2; k++) m.box(L * 0.22 + (k % 3) * 9, 8 + Math.floor(k / 3) * 26, hz, L * 0.22 + (k % 3) * 9 + 7, 18 + Math.floor(k / 3) * 26, hz + 4, fish);
    const ring = m.mat({ ramp: R('#ef6a1a'), k: 3 });
    for (const y of [2, W - 3]) m.cyl('y', L * 0.62, 0, hz + 9, 3.5, y, y + 1, ring, 2, 0);
    if (V.rusty) deco(m, M.rust, 0, 0, 0, L, W, hz + 4, (x, y, z, vv, side) => side === 'y' && hash(x | 0, 1, 5) > 0.82 && hash(x | 0, z | 0, 6) > 0.3);
    A.seat = [L * 0.66, cy, hz + 4]; A.head.push([L - 3, cy, hz + 4]); A.tail.push([1, cy - 6, hz], [1, cy + 6, hz]); A.fire.push([L * 0.6, cy, hz + 10]);
  }
  if (type === 'cabincruiser') {
    // a cabin cruiser: a white hull with its paint along the sheer and the hull's port lights, the foredeck and its rail,
    // the cabin with the raked windscreen, the flybridge on top (its helm and seats, the radar arch), the cockpit's
    // seats aft and the teak swim platform
    const hz = 14;
    hull(m, { hz, bow: 0.62, rise: 4, top: M.white, deck: nonslip, band: M.body, za: 9, zb: 12, low: M.white });
    deco(m, M.black, 0, 0, 0, L, W, 4, (x, y, z, vv, side) => side === 'y');
    deco(m, M.glass, L * 0.42, 0, 6, L * 0.62, W, 8, (x, y, z, vv, side) => side === 'y' && Math.round(x) % 8 < 5);
    m.fill((x, y) => (x > L * 0.07 && x < L * 0.34 && Math.abs(y - cy) < W / 2 - 4 ? 0 : -1), 0, 0, hz - 5, L, W, hz + 1);
    deco(m, teak, L * 0.07, 0, hz - 6, L * 0.34, W, hz - 4, (x, y, z, vv, side) => side === 'z');
    m.box(L * 0.08, 4, hz - 5, L * 0.14, W - 4, hz, M.seat); m.box(L * 0.08, 4, hz - 5, L * 0.3, 9, hz, M.seat);
    m.box(-2, 3, hz - 8, 3, W - 3, hz - 6, teak);
    shell(m, { x0: L * 0.34, x1: L * 0.78, y0: 5, y1: W - 5, z0: hz - 1, z1: hz + 13, fr: 12, br: 0, r: 3, rz: 3, mat: glassy(M.white, M.glass, { band: [hz + 4, hz + 11], pillars: [L * 0.5, L * 0.6] }) });
    m.box(L * 0.38, 8, hz + 13, L * 0.6, W - 8, hz + 15, M.white);
    for (const y of [11, W - 18]) { m.box(L * 0.44, y, hz + 15, L * 0.5, y + 7, hz + 19, M.seat); m.box(L * 0.44, y, hz + 19, L * 0.46, y + 7, hz + 23, M.seat); }
    m.box(L * 0.52, cy - 6, hz + 15, L * 0.56, cy + 6, hz + 20, M.dark);
    rail(m, M, L * 0.38, L * 0.6, [8, W - 9], hz + 15, 5);
    for (const y of [7, W - 9]) m.box(L * 0.38, y, hz + 15, L * 0.4, y + 2, hz + 30, M.white);
    m.box(L * 0.38, 7, hz + 28, L * 0.4, W - 7, hz + 30, M.white); m.box(L * 0.37, cy - 3, hz + 30, L * 0.41, cy + 3, hz + 32, M.dark);   // (the radar arch)
    rail(m, M, L * 0.8, L * 0.97, [4, W - 5], hz + 2, 5);
    A.seat = [L * 0.53, cy - 2, hz + 18]; A.head.push([L - 2, cy, hz + 3]); A.tail.push([1, cy - 8, hz], [1, cy + 8, hz]); A.fire.push([L * 0.5, cy, hz + 8]);
  }
  if (type === 'rib') rescueBoat(m, M, A, L, W, true);   // (the rescue boat's hull without its kit: the tubes in its paint)
  if (!A.wake) A.wake = [0, cy];
  if (!A.seat) A.seat = [L * 0.4, cy, 10];
}

addModels({
  dims: DIMS, tall: TALL, paint: PAINT, civil: ['convertible', 'lowrider', 'muscle', 'hothatch', 'jeep', 'movingvan', 'sailboat', 'pontoon', 'cabincruiser', 'rib', 'trawler', 'semi'],
  build(type, m, M, A, V, o) {
    if (BODY[type]) car(type, m, M, A, V, o);
    else if (type === 'movingvan') movingVan(m, M, A, o);
    else if (type === 'semi') semi(m, M, A);
    else if (type === 'trailer' || type === 'boxtrailer') trailer(type, m, M, A, V);
    else if (type === 'forklift') forklift(m, M, A, o);
    else if (DIMS[type]) boat(type, m, M, A, V, o);
    else return false;
    return true;
  },
});
export const FLEET = Object.keys(DIMS);
