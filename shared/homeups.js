// Home upgrades (the owner's notes 2, 10-24: "House upgrades, be able to add new rooms, new floors, basement, customize,
// expand garden, decorate, etc. You can do this by gathering materials like wood or stone or other things across the
// world, or you can purchase them with money outright. I dont think it needs to change the outside of the house but you
// can just expand the inside of that property so its larger and larger rooms and put on new rooms or new levels or a
// basement with more storage or all sorts of useful upgrades or amenities that you can add onto basically any home.").
// The outside stays as it is; the inside grows. What a home can be given and what each is made of; the server builds
// them (server/systems/homeups.js) and walks you round the result, the page draws it - both lay the rooms out from here
// (shared/homelayout.js layout reads a plan's spec: specOf).
//
// The materials (MATS): firewood (the bundles you cut off a felled trunk: crates, stacked at the garage - server
// felling.js), building stone and scrap metal (bag items: shared/items.js, mat). A home's garage keeps them
// (profile.homeMats[home id]: { wood, stone, metal }); what an upgrade is made of is put in from there and the bag, a
// little at a time if you like (profile.homeUp[home id].p[upgrade]), and what's missing can be paid for instead
// (shared/rules-play.js HOME_UPS: the labour and the materials' prices).
//
// Upgrades (UPS), by the plan of the home (shared/homelayout.js planOf: trailer, apartment / studio / penthouse, house,
// mansion):
//   a floor upstairs, a third floor, a basement - a level of its own, up or down the stairs (ROOM_SLOTS rooms along its
//     hall, the first fitted as it's built: a bedroom upstairs, a storeroom down below)
//   a room in one of a level's empty slots (ROOMS: a bedroom, a bathroom, a study, a home gym, a games room, a home
//     cinema, a workshop, a wine cellar, a storeroom, a sunroom)
//   amenities (fireplace, hot tub, home bar, exercise bike): a piece into your furniture storage, placed where you like
//     with Decorate (shared/homedecor.js PIECES - each one used where it stands)
//   more garden beds in the yard, another parking space, garage shelving (room for more materials)
// profile.homeUp[home id] = { b: [built: 'floor2', 'room:1:2:gym', ...], p: { [upgrade id]: { wood, stone, metal } put in } }

// ---- the materials ----------------------------------------------------------------------------------------------------
// items: the bag items that count as it (the first is its own: building stone; scrap metal is the scrap, and the iron
// and copper ore mined in the caves)
export const MATS = {
  wood: { name: 'firewood', one: 'bundle of firewood', many: 'bundles of firewood', items: [] },
  stone: { name: 'stone', one: 'block of building stone', many: 'blocks of building stone', items: ['stone'] },
  metal: { name: 'scrap metal', one: 'piece of scrap metal', many: 'pieces of scrap metal', items: ['scrap', 'ironOre', 'copperOre'] },
};
export const MAT_IDS = Object.keys(MATS);
export const matOfItem = (id) => MAT_IDS.find((m) => MATS[m].items.includes(id)) || null;

// ---- the rooms --------------------------------------------------------------------------------------------------------
// Each is 6 x 4 tiles behind the hall, entered from the hall at its third column (the tile at [2, 3] stays clear);
// up: may go upstairs, down: in the basement. The letters are the plans' (shared/homelayout.js): ^ the stairs, and the
// upgrades' own pieces - p fireplace, % hot tub, m bar, e exercise bike, z shelves, & a woodpile
export const ROOMS = {
  bed: { name: 'Bedroom', up: 1, down: 0, what: 'a bed, a wardrobe, bedside lamps', rows: ['bBBbWW', '.BB...', '......', 'l.....'] },
  bath: { name: 'Bathroom', up: 1, down: 1, what: 'a shower, a bath, a toilet and a basin', rows: ['HHtLNt', 'tttttt', 'hhtttP', 'tttttt'] },
  study: { name: 'Study', up: 1, down: 1, what: 'bookshelves, a desk, a reading chair', rows: ['QQ.QQ.', '......', '.TT.O.', 'l....P'] },
  gym: { name: 'Home gym', up: 1, down: 1, what: 'exercise bikes: stamina, a session a day', rows: ['e.e.e.', '......', '......', 'P....P'] },
  games: { name: 'Games room', up: 1, down: 1, what: 'a pool table and two arcade cabinets', rows: ['j.j..P', '...xxx', '...xxx', 'O.....'] },
  cinema: { name: 'Home cinema', up: 1, down: 1, what: 'a big screen and a row of seats', rows: ['.VVVV.', '......', '..iiii', 'l....O'] },
  workshop: { name: 'Workshop', up: 0, down: 1, what: 'a workbench to make furniture from your materials, shelves', rows: ['kk.zz&', '......', '......', '&&...P'] },
  cellar: { name: 'Wine cellar', up: 0, down: 1, what: 'a bar to pour a drink at, armchairs', rows: ['mmmm.z', '......', '.O..O.', '......'] },
  store: { name: 'Storeroom', up: 0, down: 1, what: 'shelves and woodpiles: room for more materials', rows: ['zz.zz.', '......', 'zz...&', '&&....'] },
  sun: { name: 'Sunroom', up: 1, down: 0, what: 'plants and easy chairs in the light', rows: ['P.P.P.', '......', '.O.O..', 'P....P'] },
};
export const ROOM_IDS = Object.keys(ROOMS);
// how many rooms each level of a plan has along its hall (the first built with the level)
export const ROOM_SLOTS = { house: { 1: 3, 2: 3, '-1': 3 }, mansion: { 1: 4, 2: 4, '-1': 4 }, trailer: { '-1': 2 } };
export const slotsOf = (plan, lv) => ((ROOM_SLOTS[plan] || {})[lv] || 0);
// where the stairs go on the ground floor (2 x 2 tiles: at) and where you come off them (arrive: a tile), by plan; on
// a level up or down they're at the west end of its hall
export const STAIRS = { house: { at: [12, 6], arrive: [11, 7] }, mansion: { at: [9, 6], arrive: [8, 7] }, trailer: { at: [4, 1], arrive: [4, 3] } };
export const LEVEL_STAIRS = { at: [1, 6], arrive: [3, 7] };
export const levelName = (lv) => (lv === 1 ? 'the second floor' : lv === 2 ? 'the third floor' : lv < 0 ? 'the basement' : 'the ground floor');

// ---- the upgrades -----------------------------------------------------------------------------------------------------
// plans: the plans it's for; needs: built first; level / first: a level and the room it comes with; piece: an amenity
// (the furniture kind it puts in storage); beds / slots / store: garden beds, parking spaces, materials it adds
const ALL = ['trailer', 'apartment', 'studio', 'penthouse', 'house', 'mansion'];
const YARD = ['trailer', 'house', 'mansion'];
export const UPS = {
  floor2: { name: 'A second floor', plans: ['house', 'mansion'], level: 1, first: 'bed', what: 'Stairs up to a landing, a bedroom, and room along the hall for more rooms.' },
  floor3: { name: 'A third floor', plans: ['house', 'mansion'], needs: 'floor2', level: 2, first: 'study', what: 'Another landing up the stairs: a study, and room for more.' },
  basement: { name: 'A basement', plans: ['house', 'mansion', 'trailer'], level: -1, first: 'store', what: 'Stairs down to a storeroom - room for many more materials - and space for more rooms.', trailer: 'A storm cellar' },
  fireplace: { name: 'A fireplace', plans: ALL, piece: 'fireplace', what: 'Burns a bundle of firewood from the garage: a warm room - everyone in the home heals while it burns.' },
  hottub: { name: 'A hot tub', plans: ['apartment', 'penthouse', 'house', 'mansion'], piece: 'hottub', what: 'Soak in it: health and stamina come back fast.' },
  bar: { name: 'A home bar', plans: ALL, piece: 'bar', what: 'Pour yourself a glass: health comes back faster for a while.' },
  bike: { name: 'An exercise bike', plans: ALL, piece: 'exbike', what: 'Ride it at home for stamina (a session a day).' },
  garden1: { name: 'Two more garden beds', plans: YARD, beds: 2, what: 'Two more beds dug in the yard to grow things in.' },
  garden2: { name: 'Two more garden beds again', plans: YARD, needs: 'garden1', beds: 2, what: 'Two more beds in the yard.' },
  parking1: { name: 'Another parking space', plans: ALL, slots: 1, what: 'Room for one more vehicle (shared by all your homes, as ever).' },
  parking2: { name: 'One more parking space', plans: ['house', 'mansion', 'penthouse'], needs: 'parking1', slots: 1, what: 'Room for another vehicle.' },
  shelving: { name: 'Garage shelving', plans: ALL, store: 20, what: 'Racks along the garage wall: room for more materials.' },
};
export const UP_IDS = Object.keys(UPS);
// the room upgrade's id: a room of kind k in slot n of level lv
export const roomId = (lv, n, k) => `room:${lv}:${n}:${k}`;
export const parseRoom = (id) => { const m = /^room:(-?\d+):(\d+):(\w+)$/.exec(id || ''); return m && ROOMS[m[3]] ? { lv: +m[1], n: +m[2], k: m[3] } : null; };
// what's built, as a list (null / missing: nothing)
export const builtOf = (u) => (u && Array.isArray(u.b) ? u.b : []);
export const has = (u, id) => builtOf(u).includes(id);
// the levels a home has (0 the ground floor always), lowest first
export function levelsOf(plan, u) {
  const out = [0];
  for (const id of builtOf(u)) { const U = UPS[id]; if (U && U.level !== undefined && U.plans.includes(plan)) out.push(U.level); }
  return out.sort((a, b) => a - b);
}
// the rooms on level lv: an array of slot -> room kind (null: an empty slot)
export function roomsOn(plan, u, lv) {
  const n = slotsOf(plan, lv), out = new Array(n).fill(null);
  if (!levelsOf(plan, u).includes(lv)) return out;
  const lev = UP_IDS.find((id) => UPS[id].level === lv);
  if (lev && n) out[0] = UPS[lev].first;
  for (const id of builtOf(u)) { const r = parseRoom(id); if (r && r.lv === lv && r.n < n) out[r.n] = r.k; }
  return out;
}
// The plan spec a home's level is laid out by (shared/homelayout.js layout): the plan's own key for the ground floor as
// it came, else plan~level~code - the ground floor's code 'u' / 'd' / 'ud' (the stairs up, down), a level's its rooms
// (a kind, or '-' for an empty slot). Only what changes the rooms is in it, so the page lays out exactly what the server
// does.
export function specOf(plan, lv, u) {
  const lvs = levelsOf(plan, u);
  if (!lv) {
    const up = lvs.some((l) => l > 0), down = lvs.some((l) => l < 0);
    return up || down ? `${plan}~0~${up ? 'u' : ''}${down ? 'd' : ''}` : plan;
  }
  if (!lvs.includes(lv)) return plan;
  return `${plan}~${lv}~${roomsOn(plan, u, lv).map((k) => k || '-').join(',')}`;
}
// The rows of a level up or down: its rooms along the back (6 x 4 each, walls between), the doorways into the built
// ones, the hall along the front with the stairs at its west end; windows along the back and the front upstairs, none
// below ground. An empty slot is bare concrete behind a wall (no way in) - room to build.
export function levelRows(plan, lv, rooms, tier = 0) {
  const n = Math.max(1, rooms.length), W = 1 + 7 * n, up = lv > 0;
  const wall = (win) => { let s = ''; for (let x = 0; x < W; x++) s += win && x > 0 && x < W - 1 && (x % 7 === 3 || x % 7 === 4) ? '=' : '#'; return s; };
  const rows = [wall(up)];
  for (let r = 0; r < 4; r++) {
    let s = '#';
    for (let k = 0; k < n; k++) { const R = ROOMS[rooms[k]]; s += (R ? R.rows[r] : 'gggggg') + '#'; }
    rows.push(s);
  }
  let d = '#';
  for (let k = 0; k < n; k++) d += (ROOMS[rooms[k]] ? '##+###' : '######') + '#';
  rows.push(d);
  const hall = up ? (tier >= 2 ? 'c' : '.') : 'g';
  for (let r = 0; r < 2; r++) rows.push('#^^' + hall.repeat(W - 4 - (up && r === 0 ? 1 : 0)) + (up && r === 0 ? 'P' : '') + '#');
  rows.push(wall(up));
  return rows;
}

// ---- what an upgrade takes ---------------------------------------------------------------------------------------------
// costs: rules-play.js HOME_UPS (by upgrade id; a room by its kind: room:<kind>) - { labour, wood, stone, metal }
export const costKey = (id) => { const r = parseRoom(id); return r ? `room:${r.k}` : id; };
