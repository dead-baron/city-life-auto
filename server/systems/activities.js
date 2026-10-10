// People going about their lives (task #423, concept sheet AV1): the owner, "populate the world with NPCs doing things -
// hunting, fishing, mining, farming, playing pool or games - so it feels deeper and alive". Activity spots are found by
// rules from the map (spotsOf, once per map):
//   anglers   two at a pier's rail, rods out over the water, a cooler at their feet
//   chess     two at a park's (a plaza's, a cafe's) table in town, sat facing each other over the board; one or two
//             standing by to watch
//   picnic    two or three sat on a picnic blanket (out in the country: round a picnic table)
//   painter   a street painter at an easel, painting the fountain (the statue, the gazebo, the big wheel) from a little way off
//   carwash   washing the car parked in a home's driveway: a sponge, a bucket (when a car's parked there: traffic.js)
//   chat      neighbours chatting between two homes next door to each other
//   pickers   two picking down the rows of a farm's field, a crate of produce by them
//   hunter    a hunter in blaze orange, a rifle slung on his back, walking the woods' edge by a hunting camp, his dog
//             out ahead
//   miners    swinging pickaxes at a quarry's rock face (one at the old mine's adit): the felling swing (net.js ch 5)
//   hoops     a pickup game at the courts (shared/hoops.js courtHoops): two to four shooting around, the ball (a K.BALL,
//             ballKind 'pickup': drawn as the hoops ball) dribbled, shot at the rim, the rebound bounced on to the next
//   pool      two at the Rusty Spur's pool table taking turns (round the table to the next shot, bent over the cue),
//             the other waiting at the end of the table with his cue up; a watcher or two
// and each is filled with its people when someone comes near (spawned out of everyone's sight, a few groups round a
// player at most), and emptied when nobody's near any more. They stand (sit) and loop a pose: the descriptor's gt (the
// client's personaPose: 'sit', 'sitlow') and prop (pp: 'easel', 'cooler', 'chess': client/art2/people.js), the anglers'
// rods (the fishing bit). They're townsfolk like any other (npc.js): a gunfight sends them running, a fight they stop to
// watch; once it's over they go back to what they were doing, or, far off by then, go on their way like anyone.
// The joggers and the dog walkers are the street personalities (personas.js), out where they belong.
import { K, T, TILE, WEATHER } from '../../shared/constants.js';
import { PED_BLOCK } from '../../shared/map.js';
import { mulberry32 } from '../../shared/rng.js';
import { inAnyView } from '../view.js';
import { dress } from './npclooks.js';
import { LOOKS } from './personas.js';
import { item } from '../../shared/look.js';
import { wildStyle } from './wildlife.js';
import { spawnNpc, despawnNpc } from './npc.js';
import { BUILDS } from '../entities.js';
import { courtHoops } from '../../shared/hoops.js';

let rng = mulberry32(42300);
export function setRng(r) { rng = r; }

export const ACT_NEAR = 1100;     // a spot this close to someone fills up (when nobody can see it)
export const ACT_DROP = 1600;     // ...and empties when nobody's this close (and nobody can see it)
export const ACT_MAX = 4;         // groups round one player at most
const GAP = 380;                  // never filled closer than this to anyone
const CELL = 1024;
const KINDS = {   // day / night: the chance a spot is on when someone comes near
  anglers: { day: 0.75, night: 0.35 },
  chess: { day: 0.7, night: 0 },
  picnic: { day: 0.65, night: 0 },
  painter: { day: 0.6, night: 0 },
  carwash: { day: 0.2, night: 0, cap: 1 },   // (cap: groups of a kind round one player at most - 2 if not said)
  chat: { day: 0.4, night: 0.1, cap: 1 },
  pickers: { day: 0.8, night: 0 },
  miners: { day: 0.8, night: 0.2 },
  hunter: { day: 0.7, night: 0 },
  hoops: { day: 0.75, night: 0.2, cap: 1 },
  pool: { day: 0.5, night: 0.9, cap: 1 },
};
// a hunter's look: the blaze-orange vest and cap, outdoor clothes, boots
const pk = (r, a) => a[Math.floor(r() * a.length) % a.length];
const MY_LOOKS = {
  hunter: { styles: [['outdoors', 1]], fem: 0.2, age: [1, 3, 3, 2, 1, 0], shade: 0, builds: 'casual', pool: 6,
    fix(L, r) {
      L.outfit.set = null; L.outfit.jacket = null; L.outfit.top = item('Hi-vis vest', 'orange', 'black');
      L.outfit.bottoms = item('Cargo pants', pk(r, ['olive', 'khaki', 'charcoal'])); L.outfit.shoes = item('Hiking boots', pk(r, ['brown', 'tan']));
      L.outfit.hat = item(r() < 0.6 ? 'Trucker cap' : 'Beanie', 'orange'); L.outfit.glasses = null; L.outfit.jewel = null; L.outfit.bag = null;
    } },
};
const ANCHOR = { pierrail: 'anglers', pier: 'anglers', fishtable: 'anglers', rods: 'anglers', picnic: 'chess', cafetable: 'chess', blanket: 'picnic', fountain: 'painter', statue: 'painter', gazebo: 'painter', mapboard: 'painter', ferris: 'painter' };

const walkable = (map, x, y) => { const t = map.tileAtPx(x, y); return !PED_BLOCK[t] && t !== T.ROAD && t !== T.BRIDGE && t !== T.WATER && t !== T.DEEP; };
const hsh = (x, y, s = 0) => { let h = (Math.floor(x) * 374761393 + Math.floor(y) * 668265263 + s * 2147483647) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
// no tree trunk, rock or post (the map's solid props) within pad of (x, y); a clear walk from one point to another
function freeAt(map, x, y, pad = 10) {
  const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
  for (let j = ty - 1; j <= ty + 1; j++) for (let i = tx - 1; i <= tx + 1; i++) for (const q of (map.solidProps && map.solidProps.get(map.idx(i, j))) || []) if (!q.off && Math.hypot(q.x - x, q.y - y) < q.r + pad) return false;
  return true;
}
function clearWalk(map, x0, y0, x1, y1) {
  const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 14);
  for (let k = 0; k <= n; k++) { const x = x0 + (x1 - x0) * k / n, y = y0 + (y1 - y0) * k / n; if (!walkable(map, x, y) || !freeAt(map, x, y, 12)) return false; }
  return true;
}
// which way the water is from a spot on the pier (radians), or null when there's none in reach
function waterward(map, x, y) {
  for (const r of [24, 40, 60]) for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4, t = map.tileAtPx(x + Math.cos(a) * r, y + Math.sin(a) * r); if (t === T.WATER || t === T.DEEP) return a; }
  return null;
}

// ---- the spots, by rules from the map (made once per map) ------------------------------------------------------------------
// { id, k, x, y, a (the way the activity faces: the water, the landmark), wild (out in the country) }; .cells: by 1024 px cell
const SPOTS = new WeakMap();
export function spotsOf(map) {
  let S = SPOTS.get(map);
  if (S) return S;
  const list = [], taken = [];
  const clear = (x, y, r) => !taken.some((q) => Math.abs(q.x - x) < r && Math.abs(q.y - y) < r);
  for (const p of map.props || []) {
    const k = ANCHOR[p.t];
    if (!k) continue;
    const wild = !!wildStyle(map, p.x, p.y);
    let s = null;
    if (k === 'anglers') {   // a standing spot on the deck by the rail, the water beside it
      for (let i = 0; i < 12 && !s; i++) {
        const a = hsh(p.x, p.y, i) * Math.PI * 2, d = 8 + hsh(p.x, p.y, i + 40) * 20, x = p.x + Math.cos(a) * d, y = p.y + Math.sin(a) * d;
        if (!walkable(map, x, y)) continue;
        const wa = waterward(map, x, y);
        if (wa === null) continue;
        const sx = x - Math.sin(wa) * 18, sy = y + Math.cos(wa) * 18;   // (the second angler, along the rail)
        if (walkable(map, sx, sy)) s = { x, y, a: wa };
      }
      if (s && !clear(s.x, s.y, 120)) s = null;
    } else if (k === 'chess') {   // a table in town (a park, a plaza, a cafe's): seats either side of it
      if (wild) { if (walkable(map, p.x - 16, p.y) && walkable(map, p.x + 16, p.y) && clear(p.x, p.y, 200)) list.push({ k: 'picnic', x: p.x, y: p.y, a: 0, wild, table: true }), taken.push({ x: p.x, y: p.y }); continue; }
      if (walkable(map, p.x - 16, p.y) && walkable(map, p.x + 16, p.y) && walkable(map, p.x, p.y + 28) && clear(p.x, p.y, 160)) s = { x: p.x, y: p.y, a: 0 };
    } else if (k === 'picnic') {   // on the blanket
      if (clear(p.x, p.y, 120)) s = { x: p.x, y: p.y, a: 0 };
    } else if (k === 'painter') {   // a little way off the landmark, on open ground, facing it
      if (wild) continue;
      for (let i = 0; i < 10 && !s; i++) {
        const a = hsh(p.x, p.y, i + 7) * Math.PI * 2, d = 78 + hsh(p.x, p.y, i + 70) * 40, x = p.x + Math.cos(a) * d, y = p.y + Math.sin(a) * d;
        if (walkable(map, x, y) && walkable(map, x + Math.cos(a + Math.PI) * 14, y + Math.sin(a + Math.PI) * 14)) s = { x, y, a: a + Math.PI };
      }
      if (s && !clear(s.x, s.y, 300)) s = null;
    }
    if (!s) continue;
    list.push({ k, x: s.x, y: s.y, a: s.a, wild });
    taken.push({ x: s.x, y: s.y });
  }
  // washing the car in the driveway (a home's driveway parking spot: when a car's parked there)
  (map.parking || []).forEach((p, i) => { if (p.drive && clear(p.x, p.y, 60)) { list.push({ k: 'carwash', x: p.x, y: p.y, a: p.a || 0, pi: i, wild: false }); taken.push({ x: p.x, y: p.y }); } });
  // neighbours chatting, on the front yards between two houses next door to each other (between their driveways)
  const drives = (map.parking || []).filter((p) => p.drive);
  for (let i = 1; i < drives.length; i++) {
    const h0 = drives[i - 1], h1 = drives[i], d = Math.hypot(h1.x - h0.x, h1.y - h0.y);
    if (d < 90 || d > 340) continue;
    const x = (h0.x + h1.x) / 2, y = (h0.y + h1.y) / 2, a = Math.atan2(h1.y - h0.y, h1.x - h0.x);
    if (!walkable(map, x - Math.cos(a) * 11, y - Math.sin(a) * 11) || !walkable(map, x + Math.cos(a) * 11, y + Math.sin(a) * 11) || !clear(x, y, 120)) continue;
    list.push({ k: 'chat', x, y, a, wild: false }); taken.push({ x, y });
  }
  // picking in the farms' fields
  for (const f of map.fields || []) {
    const x = f.x + f.w / 2, y = f.y + f.h / 2;
    if (!walkable(map, x - 22, y) || !walkable(map, x + 22, y) || !clear(x, y, 200)) continue;
    list.push({ k: 'pickers', x, y, a: Math.PI / 2, wild: true }); taken.push({ x, y });
  }
  // miners: at a quarry's rock face (the pit's back wall), and at the old mine's adit
  for (const q of map.quarries || []) {
    for (const f of [0.3, 0.7]) {
      const x = q.x + q.w * f, y = q.y + 26;
      if (walkable(map, x, y) && clear(x, y, 140)) { list.push({ k: 'miners', x, y, a: -Math.PI / 2, wild: true }); taken.push({ x, y }); }
    }
  }
  for (const p of map.props || []) {
    if (p.t !== 'mineportal') continue;
    for (const [dx, dy] of [[0, 40], [0, -40], [40, 0], [-40, 0]]) {
      const x = p.x + dx, y = p.y + dy;
      if (walkable(map, x, y) && clear(x, y, 140)) { list.push({ k: 'miners', x, y, a: Math.atan2(-dy, -dx), wild: true, single: true }); taken.push({ x, y }); break; }
    }
  }
  // a hunter and his dog along the woods by a hunting camp
  for (const n of map.natureSites || []) {
    if (n.kind !== 'huntcamp') continue;
    for (let i = 0; i < 40; i++) {
      const a = hsh(n.x, n.y, i + 90) * Math.PI * 2, d = 150 + hsh(n.x, n.y, i + 95) * 160, x = n.x + Math.cos(a) * d, y = n.y + Math.sin(a) * d;
      const x2 = x - Math.sin(a) * 150, y2 = y + Math.cos(a) * 150;
      if (!clearWalk(map, x, y, x2, y2) || !clear(x, y, 200)) continue;
      list.push({ k: 'hunter', x, y, a: Math.atan2(y2 - y, x2 - x), x2, y2, wild: true }); taken.push({ x, y });
      break;
    }
  }
  // a pickup game on each half court (shared/hoops.js): the spot out on the court in front of the rim, facing it
  for (const h of courtHoops(map)) {
    const c = h.court, mx = (c.x0 + c.x1) / 2, my = (c.y0 + c.y1) / 2, d = Math.hypot(mx - h.rim.x, my - h.rim.y) || 1;
    const x = h.rim.x + (mx - h.rim.x) / d * 70, y = h.rim.y + (my - h.rim.y) / d * 70;
    if (walkable(map, x, y) && clear(x, y, 60)) { list.push({ k: 'hoops', x, y, a: Math.atan2(h.rim.y - y, h.rim.x - x), rim: h.rim, court: c, wild: false }); taken.push({ x, y }); }
  }
  // pool at the Rusty Spur (its bar room's table: where client/art2/game/statics.js roadhouseRoom draws it)
  const pt = poolTable(map);
  if (pt) { list.push({ k: 'pool', x: pt.cx, y: pt.cy, a: 0, table: pt, wild: false }); taken.push({ x: pt.cx, y: pt.cy }); }
  const cells = new Map();
  list.forEach((s, i) => {
    s.id = i;
    const c = (Math.floor(s.x / CELL) << 16) | Math.floor(s.y / CELL);
    if (!cells.has(c)) cells.set(c, []);
    cells.get(c).push(s);
  });
  S = { list, cells };
  SPOTS.set(map, S);
  return S;
}
// the Rusty Spur's pool table { x0, y0, x1, y1, cx, cy } in world px, or null: the bar room's layout as roadhouseRoom
// (client/art2/game/statics.js) draws it - one section, the floor in front of the bar, the table 30% along it
export function poolTable(map) {
  const R = map.roadhouse, b = R && map.buildings[R.b], wi = b && b.walkIn, u = wi && wi.units.find((q) => q.kind === 'roadhouse');
  if (!u) return null;
  const ox = b.tx * TILE, oy = b.ty * TILE, ux0 = (Math.max(u.x0, b.tx) - b.tx) * TILE, ux1 = (Math.min(u.x1, b.tx + b.tw - 1) - b.tx + 1) * TILE;
  const Ya = (u.counterRow - b.ty) * TILE + 44, Yb = (wi.y1 - b.ty + 1) * TILE - 6, mid = (Ya + Yb) / 2, x0 = ux0 + 36, W = ux1 - ux0 - 72;
  if (Yb - Ya < 60 || W < 300) return null;
  const tx = ox + Math.round(x0 + W * 0.3), ty = oy + Math.round(mid - 22);
  return { x0: tx, y0: ty, x1: tx + 100, y1: ty + 52, cx: tx + 50, cy: ty + 26 };
}
export function spotsNear(map, x, y, r) {
  const S = spotsOf(map), out = [];
  for (let cx = Math.floor((x - r) / CELL); cx <= Math.floor((x + r) / CELL); cx++) for (let cy = Math.floor((y - r) / CELL); cy <= Math.floor((y + r) / CELL); cy++) {
    for (const s of S.cells.get((cx << 16) | cy) || []) if (Math.hypot(s.x - x, s.y - y) < r) out.push(s);
  }
  return out;
}

// ---- who's there, doing what ---------------------------------------------------------------------------------------------
// members: { x, y, a, arche, look (personas LOOKS key or an npclooks recipe), gt (the pose held), pp (the prop), fish, watch }
function members(s) {
  const c = Math.cos(s.a), sn = Math.sin(s.a), out = [];
  if (s.k === 'anglers') {
    out.push({ x: s.x, y: s.y, a: s.a, arche: 'casual', look: 'fisher', fish: true, pp: 'cooler' });
    out.push({ x: s.x - sn * 18, y: s.y + c * 18, a: s.a, arche: 'casual', look: 'fisher', fish: true });
  } else if (s.k === 'chess') {   // across the table (west and east of it), the board between them; one or two watching
    out.push({ x: s.x - 15, y: s.y, a: 0, arche: rng() < 0.5 ? 'senior' : 'casual', gt: 'sit', pp: 'chess' });
    out.push({ x: s.x + 15, y: s.y, a: Math.PI, arche: rng() < 0.6 ? 'senior' : 'casual', gt: 'sit' });
    const w = 1 + (rng() < 0.5 ? 1 : 0);
    for (let i = 0; i < w; i++) { const x = s.x + (i ? 12 : -8), y = s.y + 26 + i * 4; out.push({ x, y, a: Math.atan2(s.y - y, s.x - x), arche: rng() < 0.5 ? 'senior' : 'casual', watch: true }); }
  } else if (s.k === 'picnic') {
    if (s.table) {   // round a picnic table out in the country, eating
      out.push({ x: s.x - 16, y: s.y, a: 0, arche: 'casual', gt: 'sit' });
      out.push({ x: s.x + 16, y: s.y, a: Math.PI, arche: 'casual', gt: 'sit' });
    } else {          // sat on the blanket, facing each other, the cooler by them
      out.push({ x: s.x - 9, y: s.y + 2, a: 0, arche: 'casual', gt: 'sitlow' });
      out.push({ x: s.x + 9, y: s.y - 2, a: Math.PI, arche: 'casual', gt: 'sitlow' });
      if (rng() < 0.4) out.push({ x: s.x + 1, y: s.y + 10, a: -Math.PI / 2, arche: 'casual', gt: 'sitlow' });
    }
  } else if (s.k === 'painter') {
    out.push({ x: s.x, y: s.y, a: s.a, arche: 'casual', look: 'busker', pp: 'easel' });
  } else if (s.k === 'carwash') {   // beside the car (its .car: carAt), facing it, sponge in hand, the bucket by them
    const v = s.car, a = v ? v.a : s.a, side = s.side || 1, off = ((v && v.def.W) || 44) / 2 + 9, x = (v ? v.x : s.x) - Math.sin(a) * off * side, y = (v ? v.y : s.y) + Math.cos(a) * off * side;
    out.push({ x, y, a: Math.atan2((v ? v.y : s.y) - y, (v ? v.x : s.x) - x), arche: 'casual', pp: 'sponge' });
  } else if (s.k === 'chat') {      // face to face, a word over the fence
    out.push({ x: s.x - c * 11, y: s.y - sn * 11, a: s.a, arche: rng() < 0.4 ? 'senior' : 'casual', chat: true, pp: 'fence' });   // (the garden fence between them: drawn with him)
    out.push({ x: s.x + c * 11, y: s.y + sn * 11, a: s.a + Math.PI, arche: rng() < 0.4 ? 'senior' : 'casual', chat: true });
  } else if (s.k === 'miners') {    // swinging a pickaxe at the rock face (a second along the face, at a quarry)
    out.push({ x: s.x, y: s.y, a: s.a, arche: 'construction', chop: true });
    if (!s.single) out.push({ x: s.x - Math.sin(s.a) * 34, y: s.y + Math.cos(s.a) * 34, a: s.a, arche: 'construction', chop: true });
  } else if (s.k === 'hunter') {    // walking the edge of the woods and back, stopping to look about, the dog out ahead
    out.push({ x: s.x, y: s.y, a: s.a, arche: 'hiker', look: 'hunter', pp: 'rifle', patrol: [{ x: s.x, y: s.y }, { x: s.x2, y: s.y2 }], dog: true });
  } else if (s.k === 'pickers') {   // down along the rows, picking into a crate
    out.push({ x: s.x - 22, y: s.y, a: s.a, arche: 'farmer', gt: 'kneel', pp: 'crate' });
    out.push({ x: s.x + 22, y: s.y + 6, a: s.a, arche: 'farmer', gt: 'kneel' });
  } else if (s.k === 'hoops') {     // two to four round the key, facing the rim (shooting around: hoopSpot)
    const n = 2 + Math.floor(rng() * 3);
    for (let i = 0; i < n; i++) { const q = hoopSpot(s, i, n); out.push({ x: q.x, y: q.y, a: q.a, arche: rng() < 0.6 ? 'athlete' : 'casual', hoop: i }); }
  } else if (s.k === 'pool') {      // the one shooting bent over the table, the other waiting at its end, cue up; watchers
    const T = s.table;
    out.push({ ...poolSpot(T, 0), arche: rng() < 0.5 ? 'hustler' : 'casual', pool: 0, gt: 'cue' });
    out.push({ x: T.x1 + 16, y: T.cy + 8, a: Math.PI, arche: rng() < 0.5 ? 'hustler' : 'casual', pool: 1, pp: 'cueup' });
    const w = 1 + (rng() < 0.4 ? 1 : 0);
    for (let i = 0; i < w; i++) { const x = T.x0 - 14 - i * 12, y = T.y1 + 10 + i * 8; out.push({ x, y, a: Math.atan2(T.cy - y, T.cx - x), arche: rng() < 0.5 ? 'hustler' : 'casual', watch: true }); }
  }
  return out;
}
// where the i-th of n stands round the key (shooting around: a new spot after each shot), facing the rim
function hoopSpot(s, i, n, turn = 0) {
  const base = Math.atan2(s.y - s.rim.y, s.x - s.rim.x), spread = n > 1 ? 1.5 : 0;
  const a = base + (n > 1 ? (i / (n - 1) - 0.5) * spread : 0) + (turn ? (hsh(s.x, s.y, turn * 7 + i) - 0.5) * 0.8 : 0), d = 62 + ((i * 37 + turn * 23) % 70);
  let x = s.rim.x + Math.cos(a) * d, y = s.rim.y + Math.sin(a) * d;
  const C = s.court; x = Math.max(C.x0 + 8, Math.min(C.x1 - 8, x)); y = Math.max(C.y0 + 8, Math.min(C.y1 - 8, y));
  return { x, y, a: Math.atan2(s.rim.y - y, s.rim.x - x) };
}
// a shooter's place at the pool table (k: which shot), facing across it: the long sides and the ends
function poolSpot(T, k) {
  const j = k % 6, f = [0.3, 0.7, 0.5, 0.25, 0.75, 0.5][j];
  if (j < 2) return { x: T.x0 + 100 * f, y: T.y1 + 9, a: -Math.PI / 2 };
  if (j === 2) return { x: T.x0 - 9, y: T.cy, a: 0 };
  if (j < 5) return { x: T.x0 + 100 * f, y: T.y0 - 9, a: Math.PI / 2 };
  return { x: T.x1 + 9, y: T.cy - 6, a: Math.PI };
}
// the car parked in the driveway (no one in it), or null
function carAt(world, s) {
  for (const v of world.query(s.x, s.y, 24, K.VEH)) if (!v.removed && v.def && v.def.kind === 'car' && !(v.seats || []).some(Boolean) && Math.hypot(v.vx || 0, v.vy || 0) < 1) return v;
  return null;
}

// dress an NPC from a persona look (personas.js LOOKS) or keep the archetype's own
function dressAs(world, ped, look) {
  const rec = look && (MY_LOOKS[look] || LOOKS[look]);
  if (!rec) return;
  const g = dress(world, (MY_LOOKS[look] ? 'a:' : 'p:') + look, ped.x, ped.y, !!(world.clock && world.clock.isNight), rng, rec);
  if (!g) return;
  const old = ped.build, nb = BUILDS[g.bi] || old;
  ped.app = g.app; ped.app.bd = g.bi; ped.appVer = (ped.appVer || 0) + 1;
  if (old && nb && nb !== old) { ped.maxHp = ped.hp = Math.max(20, Math.round(ped.maxHp / old.hp * nb.hp)); ped.build = nb; }
}

// fill a spot with its people (null if any of them would be seen popping up, or someone's standing there)
export function fill(world, s, opts = {}) {
  const A = (world.acts ||= new Map());
  if (A.has(s.id)) return null;
  if (s.k === 'carwash') {   // only with a car parked there; on the side with room to stand
    const v = carAt(world, s);
    if (!v) return null;
    const off = (v.def.W || 44) / 2 + 9, ok = (k) => walkable(world.map, v.x - Math.sin(v.a) * off * k, v.y + Math.cos(v.a) * off * k) || world.map.tileAtPx(v.x - Math.sin(v.a) * off * k, v.y + Math.cos(v.a) * off * k) === T.ROAD;
    s.car = v; s.side = ok(1) ? 1 : ok(-1) ? -1 : 0;
    if (!s.side) { s.car = null; return null; }
  }
  const ms = members(s);
  s.car = null;
  for (const m of ms) {
    if (!opts.seen && inAnyView(world, m.x, m.y, 64)) return null;
    if (world.query(m.x, m.y, 10, K.PED).some((e) => !e.dead)) return null;
  }
  const g = { id: s.id, k: s.k, x: s.x, y: s.y, ids: [], at: world.time };
  for (const m of ms) {
    const ped = spawnNpc(world, m.arche, m.x, m.y, 'civ');
    dressAs(world, ped, m.look);
    ped.a = m.a; ped.vx = ped.vy = 0;
    const n = ped.npc;
    n.act = { g: s.id, k: s.k, x: m.x, y: m.y, a: m.a, gt: m.gt || null, pp: m.pp || null, fish: !!m.fish, watch: m.watch ? { x: s.x, y: s.y } : null, chat: !!m.chat, chop: !!m.chop, patrol: m.patrol || null, leg: 1, hoop: m.hoop ?? -1, pool: m.pool ?? -1 };
    n.state = 'idle'; n.until = world.time + 9999; n.sway = false; n.umbrellaType = false;
    pose(ped, true);
    g.ids.push(ped.id);
    if (m.dog) {   // the dog, out ahead of him (personas.js update: a walked dog's trot - here off the lead)
      const dog = world.spawnPed(m.x + 24, m.y, { hp: 40, archetype: 'pet:' + pk(rng, ['dog_spaniel', 'dog_golden', 'dog_black']), name: 'a dog', a: m.a, app: { bd: 1 } });
      dog.pet = { walked: ped.id, kind: 'dog', name: 'a dog', i: 1 };
      g.ids.push(dog.id);
    }
  }
  if (s.k === 'hoops') {   // the ball, in the first one's hands (stepPickup plays it)
    const h = world.get(g.ids[0]);
    const b = world.add({ id: world.newId(), kind: K.BALL, x: h.x, y: h.y, a: 0, z: 0, vx: 0, vy: 0, vz: 0, ballKind: 'pickup', cx: -1, cy: -1 });
    Object.assign(g, { ball: b.id, hold: 0, phase: 'dribble', t0: world.time, until: world.time + 1 + rng() * 2, turn: 0, spot: s });
  }
  if (s.k === 'pool') Object.assign(g, { turn: 0, shot: 0, until: world.time + 6 + rng() * 5, table: s.table });
  A.set(s.id, g);
  return g;
}
// ---- the pickup game: the ball dribbled, shot at the rim, the rebound bounced on to the next one --------------------------
const SHOT_S = 0.95, DROP_S = 0.45, PASS_S = 0.75;
const quad = (u, z0, apex, z1) => (1 - u) * (1 - u) * z0 + 2 * (1 - u) * u * (2 * apex - (z0 + z1) / 2) + u * u * z1;
function stepPickup(world, g) {
  const b = world.get(g.ball);
  if (!b || b.removed) return;
  const now = world.time, s = g.spot, rim = s.rim;
  const hs = g.ids.map((i) => world.get(i)).filter((e) => e && !e.removed && !e.dead && e.npc && e.npc.act && e.npc.act.hoop >= 0);
  const there = hs.filter((e) => Math.hypot(e.x - e.npc.act.x, e.y - e.npc.act.y) < 6);
  const H = hs[g.hold % (hs.length || 1)];
  if (hs.length < 2 || Math.hypot(H.x - H.npc.act.x, H.y - H.npc.act.y) > 60) { if (b.z > 0) b.z = Math.max(0, b.z - 6); return; }   // (the game's off: scared away - the ball lies there)
  for (const e of there) if (e !== H || g.phase !== 'dribble') e.a = Math.atan2(b.y - e.y, b.x - e.x);   // (watching the ball)
  if (g.phase === 'dribble') {
    const hx = H.x + Math.cos(H.a + 0.8) * 7, hy = H.y + Math.sin(H.a + 0.8) * 7;
    b.x = hx; b.y = hy; b.z = Math.abs(Math.sin((now - g.t0) * Math.PI * 3.2)) * 16; b.a = (b.a || 0) + 0.1;
    if (Math.hypot(H.x - H.npc.act.x, H.y - H.npc.act.y) >= 6) return;   // (walking to the spot: dribbling on the way)
    H.a = Math.atan2(rim.y - H.y, rim.x - H.x);
    if (now < g.until) return;
    const made = rng() < 0.45, d = Math.hypot(rim.x - H.x, rim.y - H.y) || 1, ux = (rim.x - H.x) / d, uy = (rim.y - H.y) / d;
    g.phase = 'shot'; g.t0 = now; g.made = made;
    g.path = { x0: H.x, y0: H.y, z0: 34, x1: made ? rim.x : rim.x - ux * 6, y1: made ? rim.y : rim.y - uy * 6, z1: rim.z, apex: Math.max(rim.z + 28, 58 + d * 0.2) };
    g.fall = made ? { x: rim.x, y: rim.y } : { x: rim.x - ux * (22 + rng() * 20) + uy * (rng() - 0.5) * 30, y: rim.y - uy * (22 + rng() * 20) - ux * (rng() - 0.5) * 30 };
    H.attackAnimUntil = now + 0.25;
    return;
  }
  const t = now - g.t0, P = g.path;
  if (g.phase === 'shot') {
    if (t <= SHOT_S) { const u = t / SHOT_S; b.x = P.x0 + (P.x1 - P.x0) * u; b.y = P.y0 + (P.y1 - P.y0) * u; b.z = quad(u, P.z0, P.apex, P.z1); b.a += 0.3; return; }
    if (!g.scored) { g.scored = true; world.emit(rim.x, rim.y, { e: 'hoop', x: Math.round(rim.x), y: Math.round(rim.y), in: g.made ? 1 : 0 }); }
    const u = Math.min(1, (t - SHOT_S) / DROP_S);
    b.x = P.x1 + (g.fall.x - P.x1) * u; b.y = P.y1 + (g.fall.y - P.y1) * u; b.z = Math.max(0, P.z1 * (1 - u * u));
    if (u < 1) return;
    // the rebound: on to the next one, a bounce on the way; the shooter off to a new spot
    g.scored = false; g.hold = (g.hold + 1) % hs.length; g.turn++;
    const q = hoopSpot(s, H.npc.act.hoop, hs.length, g.turn);
    H.npc.act.x = q.x; H.npc.act.y = q.y; H.npc.act.a = q.a;
    g.phase = 'pass'; g.t0 = now; g.path = { x0: b.x, y0: b.y };
    return;
  }
  // the pass: along the floor to the next one's hands, bouncing once half way
  const N = hs[g.hold % hs.length], u = Math.min(1, t / PASS_S), tx = N.x + Math.cos(N.a + 0.8) * 7, ty = N.y + Math.sin(N.a + 0.8) * 7;
  b.x = P.x0 + (tx - P.x0) * u; b.y = P.y0 + (ty - P.y0) * u;
  b.z = Math.max(0, u < 0.5 ? 22 * Math.sin(u * 2 * Math.PI) : 26 * Math.sin((u - 0.5) * Math.PI) * (1 - (u - 0.5)));
  b.a += 0.2;
  if (u >= 1) { g.phase = 'dribble'; g.t0 = now; g.until = now + 1.2 + rng() * 2.4; }
}
// ---- pool: the turn passes; the next one goes round the table to the shot, the other stands back with his cue up -----------
function stepPool(world, g) {
  if (world.time < g.until) return;
  const T = g.table, ps = g.ids.map((i) => world.get(i)).filter((e) => e && !e.removed && !e.dead && e.npc && e.npc.act && e.npc.act.pool >= 0);
  if (ps.length < 2) return;
  g.until = world.time + 6 + rng() * 6; g.turn ^= rng() < 0.7 ? 1 : 0; g.shot++;   // (a miss: the turn passes; potted one: again)
  for (const e of ps) {
    const a = e.npc.act, mine = a.pool === g.turn;
    const q = mine ? poolSpot(T, g.shot + Math.floor(rng() * 3)) : { x: T.x1 + 16, y: T.cy + 8, a: Math.PI };
    Object.assign(a, { x: q.x, y: q.y, a: q.a, gt: mine ? 'cue' : null, pp: mine ? null : 'cueup' });
  }
}
// hold the activity's pose and prop (on: at the spot; off: away from it - walking back, gone off)
function pose(ped, on) {
  const a = ped.npc.act, gt = on ? a.gt : null, pp = on ? a.pp : null;
  if ((ped.gt || null) !== gt || (ped.pp || null) !== pp) { ped.gt = gt; ped.pp = pp; ped.appVer = (ped.appVer || 0) + 1; }
  if (a.fish) ped.fishing = on ? (ped.fishing || { npc: true }) : null;
  if (a.chop && !!ped.chop !== on) { ped.chop = on ? { tool: 'pickaxe', npc: true } : null; ped.appVer = (ped.appVer || 0) + 1; }   // (the swing: net.js ch)
}

// npc.js update: for someone at an activity, wandering or standing about -> { inp, factor } or null (walk about like anyone)
const NO_INPUT = { bits: 0, mx: 0, my: 0, aim: 0 };
const seekTo = (ped, tx, ty, s = 1) => { const dx = tx - ped.x, dy = ty - ped.y, d = Math.hypot(dx, dy) || 1, m = Math.min(1, d / 24) * s; return { bits: 0, mx: dx / d * m, my: dy / d * m, aim: Math.atan2(dy, dx) }; };
const RAIN_OFF = new Set(['chess', 'picnic', 'painter', 'carwash', 'hoops']);
export function steer(world, ped, now) {
  const n = ped.npc, a = n.act;
  if (!a) return null;
  const d = Math.hypot(a.x - ped.x, a.y - ped.y);
  // far off after a scare, rained off (the picnic packs up, the painter folds the easel), the car driven away: on their way
  if (a.patrol) {   // the hunter: along the edge to the far end, a look about, and back
    if (d > 420 && Math.hypot(a.patrol[1].x - ped.x, a.patrol[1].y - ped.y) > 420) { pose(ped, false); n.act = null; n.state = 'wander'; return null; }
    pose(ped, true);
    if (now < (n.holdTo || 0)) { ped.vx = ped.vy = 0; if (now >= (n.lookAt || 0)) { n.lookAt = now + 1.5 + rng() * 2; ped.a += (rng() - 0.5) * 1.6; } return { inp: NO_INPUT, factor: 0.55 }; }
    const t = a.patrol[a.leg % 2];
    if (Math.hypot(t.x - ped.x, t.y - ped.y) < 8) { a.leg++; n.holdTo = now + 3 + rng() * 5; return { inp: NO_INPUT, factor: 0.55 }; }
    if (n.state !== 'idle') { n.state = 'idle'; n.until = now + 9999; }
    return { inp: seekTo(ped, t.x, t.y, 0.8), factor: 0.4 };
  }
  const off = d > 420 || (RAIN_OFF.has(a.k) && world.weather === WEATHER.RAIN) || (a.k === 'carwash' && now >= (n.carAt || 0) && !(n.carAt = now + 1, world.query(a.x, a.y, 48, K.VEH).some((v) => !v.removed && v.def && v.def.kind === 'car')));
  if (off) { pose(ped, false); n.act = null; n.state = 'wander'; n.until = 0; return null; }
  if (d > 5) { if (ped.gt || ped.pp || ped.fishing || ped.chop) pose(ped, false); return { inp: seekTo(ped, a.x, a.y, 0.9), factor: 0.55 }; }   // back to it
  ped.vx = ped.vy = 0;
  if (n.state !== 'idle') { n.state = 'idle'; n.until = now + 9999; }
  pose(ped, true);
  if (a.watch) {   // watching the game: on the board, now and then a glance about
    if (now >= (n.lookAt || 0)) { n.lookAt = now + 2 + rng() * 4; n.glance = rng() < 0.3 ? (rng() - 0.5) * 1.6 : 0; }
    ped.a = Math.atan2(a.watch.y - ped.y, a.watch.x - ped.x) + (n.glance || 0);
  } else if (a.chat) {   // talking: now and then a look away, a nod
    if (now >= (n.lookAt || 0)) { n.lookAt = now + 2 + rng() * 5; n.glance = rng() < 0.25 ? (rng() - 0.5) * 1.2 : 0; }
    ped.a = a.a + (n.glance || 0);
  } else ped.a = a.a;
  return { inp: NO_INPUT, factor: 0.55 };
}

// ---- every second: fill the spots round people, empty the ones nobody's near --------------------------------------------
export function update(world) {
  const A = world.acts;
  if (!A) { if (world.tick % 20 === 13) fillRound(world); return; }
  // every tick: away from their spot (running from trouble, stopped to watch it), the pose and the prop are put down -
  // nobody sits in mid air
  for (const g of A.values()) {
    if (g.k === 'hoops') stepPickup(world, g); else if (g.k === 'pool') stepPool(world, g);
  }
  for (const g of A.values()) for (const i of g.ids) {
    const e = world.get(i);
    if (e && e.npc && e.npc.act && !e.npc.act.patrol && (e.gt || e.pp || e.fishing || e.chop) && Math.hypot(e.x - e.npc.act.x, e.y - e.npc.act.y) > 5) pose(e, false);
  }
  if (world.tick % 20 === 13) fillRound(world);
}
function fillRound(world) {
  const A = (world.acts ||= new Map()), now = world.time;
  const anchors = [];
  for (const p of world.players.values()) if (p.ped && !p.ped.dead) anchors.push(p.ped);
  // empty the groups nobody's near (or whose people are all gone)
  for (const [id, g] of A) {
    g.ids = g.ids.filter((i) => { const e = world.get(i); return e && !e.removed && !e.dead && ((e.npc && e.npc.act) || (e.pet && e.pet.walked)); });
    const near = anchors.some((p) => Math.hypot(p.x - g.x, p.y - g.y) < ACT_DROP) || inAnyView(world, g.x, g.y, 64);
    if (g.ids.length && near) continue;
    if (!near) for (const i of g.ids) { const e = world.get(i); if (e && e.pet) { if (!inAnyView(world, e.x, e.y, 32)) world.remove(e); } else if (e && !inAnyView(world, e.x, e.y, 32)) despawnNpc(world, e); else if (e) { e.npc.act = null; e.gt = e.pp = null; e.fishing = null; e.chop = null; e.appVer = (e.appVer || 0) + 1; } }
    if (g.ball) { const b = world.get(g.ball); if (b && !b.removed) world.remove(b); }   // (the pickup game's ball)
    A.delete(id);
    (world.actRest ||= new Map()).set(id, now + (g.ids.length ? 30 : 240));   // (emptied by a scare: a good while before it's on again)
  }
  if (!(world.npcBudget > 0) || world.npcCount >= world.npcBudget * 0.85) return;
  const night = !!(world.clock && world.clock.isNight), rest = (world.actRest ||= new Map()), rain = world.weather === WEATHER.RAIN;
  for (const a of anchors) {
    if (a.ug || a.hidden) continue;
    let have = 0;
    const kinds = {};
    for (const g of A.values()) if (Math.hypot(g.x - a.x, g.y - a.y) < ACT_DROP) { have++; kinds[g.k] = (kinds[g.k] || 0) + 1; }
    if (have >= ACT_MAX) continue;
    for (const s of spotsNear(world.map, a.x, a.y, ACT_NEAR)) {
      if (A.has(s.id) || now < (rest.get(s.id) || 0) || (kinds[s.k] || 0) >= (KINDS[s.k].cap || 2)) continue;   // (not the whole street washing its cars at once)
      if (anchors.some((b) => Math.hypot(b.x - s.x, b.y - s.y) < GAP)) continue;
      const P = KINDS[s.k];
      if (rain && RAIN_OFF.has(s.k)) continue;
      if (rng() >= (night ? P.night : P.day)) { rest.set(s.id, now + 120 + rng() * 180); continue; }   // (not today: try again later)
      if (!fill(world, s)) { rest.set(s.id, now + 15); continue; }   // (in sight just now, no car in the driveway: a little later)
      kinds[s.k] = (kinds[s.k] || 0) + 1;
      if (++have >= ACT_MAX) break;
    }
  }
}
