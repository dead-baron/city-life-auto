// The back alleys dressed (the user's concept sheets AL1-A..H): what stands and lies along the city's alleys, and
// the back walls that face one.
//   along the walls  wheelie bins, bin bags, cardboard boxes, pallets, crates, tyres, oil drums, a mattress against
//                    the wall, an abandoned shopping cart, a burn barrel in the rough end of town; flower pots and a
//                    bike uptown; a stray cat, a rat
//   on the asphalt   puddles (they mirror the lights at night), oil stains, leaves, litter, cracks, weeds along the
//                    wall foot, a drain grate, a manhole cover
//   the back walls   (an east-west alley's north side: the south face of the building behind it is what the camera
//                    sees) a back door with a bare bulb over it, a drainpipe, a vent breathing steam, AC boxes, a
//                    meter box, grime and tags sprayed on the wall, by the district's grit
//   open back lots   a chain-link fence along the alley
// More of it, and rougher, in the rough districts (Southside, the Pink Mile); tidy and planted uptown.
//
// Decoration only. None of it is solid and none of it is in map.props: the solid alley props (dumpsters, crates,
// drums, AC units: map.js dressAlleys) are the map's own, so the world - its signature, the server, the world map
// picture - is unchanged. Things stand only on an alley's own asphalt, in the strip along its walls (the middle
// lane stays clear for cars), away from both ends (nothing at the mouth on a street), from every door and walk-in
// doorway (map.pois), from the back doors placed here and from the solid props already there.
//
//   alleyDressing(m) -> { items: [{ k, x, y, v, side, nx, ny, e, g }], backs: Map(building index -> back), fences }
//     k: a DRESS kind; (x, y): its ground point (world px); v: variant 0..5; side: -1 | 1 (which side of the
//     alley); (nx, ny): the unit normal from the alley's centre line toward the wall it stands against; e: the edge
//     index; g: the district's grit 0..1
//     back: { x0, x1 (the wall's span, world px), y (the wall's foot), door (centre x, world px) | null, g, tag
//     (text) | null, tags (count), pipe (x), vent (x) | null, ac: [x...], meter (x) | null, fire: bool }
//     fences: [{ x0, y0, x1, y1 }] chain-link runs along open back lots
//   alleyBackOf(m, b, x0, x1): the back of building b between world x0 and x1 (a section of it), or null
//   gritOf(district): 0 (spotless) .. 1 (the roughest)
// Deterministic (hashed from positions) and pure: the art reads it (client/art2/game/statics.js, the alleys block)
// and test/worldbuild.test.js checks it. Works on the CityMap or its structured clone (fields only, no methods).
import { TILE, T } from './constants.js';
import { hash2 } from './rng.js';
import { pointAt } from './geom.js';
import { DISTRICTS } from './map.js';

// [half length along the wall, depth out from it] (px) of what stands; decals lie flat (0 depth: walked over)
export const DRESS = {
  bin: [7, 12], bins: [15, 12], bags: [15, 12], boxes: [13, 14], pallet: [15, 12], crates: [14, 14], tires: [9, 16],
  drum: [7, 12], mattress: [16, 7], cart: [11, 12], burn: [8, 14], pots: [15, 10], bike: [16, 8], cat: [7, 8], rat: [5, 6],
  puddle: [0, 0], oil: [0, 0], leaves: [0, 0], litter: [0, 0], crack: [0, 0], weeds: [0, 0], drain: [0, 0], manhole: [0, 0],
};
export const DECALS = new Set(['puddle', 'oil', 'leaves', 'litter', 'crack', 'weeds', 'drain', 'manhole']);
// original tags for the walls (no real crews, brands or names)
export const ALLEY_TAGS = ['RUST', 'KROW', 'OMEN', 'NOVA', 'ZEKE', 'HEX', 'DUSK', 'SKAB', 'VANDL', 'GLOW', 'MOTH', 'RIOT', 'ECHO', 'WAX', 'BLOK', 'FUZZ', 'SOUTH', 'JINX'];

const GRIT = { southside: 1, industrial: 0.95, factory: 0.95, harbor: 0.9, redlight: 0.85, nightlife: 0.72, apartments: 0.62, oldtown: 0.58,
  commercial: 0.5, arts: 0.5, beach: 0.35, civic: 0.3, houses: 0.22, towers: 0.18, luxury: 0.08 };
export function gritOf(d) {
  if (!d) return 0.5;
  let g = GRIT[d.style] ?? 0.45;
  if (d.tier === 'rough') g = Math.max(g, 0.95);
  else if (d.tier === 'low' || d.tier === 'red') g = Math.max(g, 0.62);
  else if (d.tier === 'lux') g = Math.min(g, 0.18);
  return g;
}

const MOUTH = 56;          // px kept clear at each end of an alley (where it meets a street)
const STEP = 22;           // px between the spots along each wall
const DOOR_CLEAR = 60;     // px kept clear round a door or a walk-in's doorway (map.pois)
const BACK_DOOR_CLEAR = 34;

const CACHE = new WeakMap(), BACKS = new WeakMap();
export function alleyDressing(m) {
  let D = CACHE.get(m);
  if (!D) { D = build(m); CACHE.set(m, D); }
  return D;
}
// just the back walls (cheap: the page's weather layer reads the vents from them)
export function alleyBacks(m) {
  let B = BACKS.get(m);
  if (!B) { B = buildBacks(m, helpers(m)); BACKS.set(m, B); }
  return B;
}

// the back of building b between world x0 and x1 (a section), or null when that wall doesn't face an alley
export function alleyBackOf(m, bi, x0, x1) {
  const bk = alleyBacks(m).get(bi);
  if (!bk || x1 <= bk.x0 || x0 >= bk.x1) return null;
  return bk;
}
// the vents on the back walls in [x0, x1) x [y0, y1) (world px): [{ x, y (the wall's foot), id }] - steam rises
// from them (client/render/weather.js)
export function alleyVentsIn(m, x0, y0, x1, y1) {
  const out = [];
  for (const bk of alleyBacks(m).values()) if (bk.vent !== null && bk.vent >= x0 && bk.vent < x1 && bk.y >= y0 && bk.y < y1) out.push({ x: bk.vent, y: bk.y, id: bk.vent * 7919 + bk.y });
  return out;
}

function helpers(m) {
  const W = m.w, H = m.h, tiles = m.tiles, rank = m.roadRank;
  const tile = (tx, ty) => (tx < 0 || ty < 0 || tx >= W || ty >= H ? T.WALL : tiles[ty * W + tx]);
  const isAlley = (tx, ty) => tx >= 0 && ty >= 0 && tx < W && ty < H && (tiles[ty * W + tx] === T.ROAD) && rank[ty * W + tx] === 1 && !(m.deck && m.deck[ty * W + tx]);
  const distAt = (x, y) => { const tx = Math.min(W - 1, Math.max(0, Math.floor(x / TILE))), ty = Math.min(H - 1, Math.max(0, Math.floor(y / TILE))); return DISTRICTS[m.dist[ty * W + tx]]; };
  // the doors: every POI (shop and walk-in doors, homes...) on a coarse grid
  const doors = new Map(), dk = (x, y) => (Math.floor(y / 128) + 64) * 4096 + Math.floor(x / 128) + 64;
  const addDoor = (x, y) => { const k = dk(x, y); let l = doors.get(k); if (!l) doors.set(k, (l = [])); l.push(x, y); };
  for (const p of m.pois || []) if (p && Number.isFinite(p.x)) addDoor(p.x, p.y);
  for (const h of m.homes || []) if (h && Number.isFinite(h.x)) addDoor(h.x, h.y);
  const nearDoor = (x, y, r) => {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const l = doors.get(dk(x + dx * 128, y + dy * 128)); if (!l) continue;
      for (let i = 0; i < l.length; i += 2) if ((l[i] - x) * (l[i] - x) + (l[i + 1] - y) * (l[i + 1] - y) < r * r) return true;
    }
    return false;
  };
  const nearSolid = (x, y, r) => {
    const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) for (const e of (m.solidProps && m.solidProps.get((ty + dy) * W + tx + dx)) || []) if ((e.x - x) * (e.x - x) + (e.y - y) * (e.y - y) < (r + e.r) * (r + e.r)) return true;
    return false;
  };
  return { W, H, tile, isAlley, distAt, nearDoor, nearSolid };
}

function build(m) {
  const X = helpers(m), { tile, isAlley, distAt, nearDoor, nearSolid } = X;
  const backs = alleyBacks(m);
  return dressEdges(m, X, backs, tile, isAlley, distAt, nearDoor, nearSolid);
}

// ---- 1. the back walls: buildings whose south face fronts an alley (most of the tiles just south of it are an
// alley's asphalt). Only plain backs (a World v2 back row, a plain roof block), never a shop or a walk-in.
function buildBacks(m, X) {
  const { isAlley, distAt, nearDoor, nearSolid } = X;
  const backs = new Map();
  (m.buildings || []).forEach((b, bi) => {
    if (!b || b.gone || b.walkIn || b.art || b.business || !(b.back || b.kind === 'roof') || b.tw < 3) return;
    const ty = b.ty + b.th;
    let n = 0;
    for (let tx = b.tx; tx < b.tx + b.tw; tx++) if (isAlley(tx, ty)) n++;
    if (n < b.tw * 0.6) return;
    const x0 = b.tx * TILE, x1 = (b.tx + b.tw) * TILE, y = ty * TILE, w = x1 - x0;
    const g = gritOf(distAt((x0 + x1) / 2, y - 16)), h = (s) => hash2(b.tx, b.ty, 7100 + s);
    // the back door: somewhere along the wall, clear of its ends, on alley asphalt and off any POI
    let door = null;
    if (w >= 96 && h(1) < 0.85) {
      for (let k = 0; k < 4 && door === null; k++) {
        const x = Math.round(x0 + 30 + h(2 + k) * (w - 60));
        if (isAlley(Math.floor(x / TILE), ty) && !nearDoor(x, y + 16, DOOR_CLEAR - 20) && !nearSolid(x, y + 14, 22)) door = x;   // (not behind a dumpster)
      }
    }
    const tags = g > 0.8 ? 1 + (h(9) < 0.55 ? 1 : 0) : g > 0.45 ? (h(9) < 0.5 ? 1 : 0) : h(9) < 0.12 ? 1 : 0;
    const side = (u) => { let x = Math.round(x0 + 14 + u * (w - 28)); if (door !== null && Math.abs(x - door) < 28) x = door + (x < door ? -30 : 30); return Math.min(x1 - 8, Math.max(x0 + 8, x)); };
    const ac = [];
    for (let i = 0; i < (w >= 200 ? 2 : 1); i++) if (h(20 + i) < 0.35 + 0.3 * g) ac.push(side(h(22 + i)));
    backs.set(bi, { b: bi, x0, x1, y, door, g, tags, tag: tags ? ALLEY_TAGS[Math.floor(h(10) * ALLEY_TAGS.length)] : null,
      pipe: side(h(11)), vent: door !== null && h(12) < 0.45 + 0.3 * g ? side(h(13)) : null, ac, meter: h(14) < 0.5 ? side(h(15)) : null, fire: h(16) < 0.55 });
  });
  return backs;
}

// ---- 2. along every alley
function dressEdges(m, X, backs, tile, isAlley, distAt, nearDoor, nearSolid) {
  // the back doors, by the tile row they open onto
  const backDoors = [];
  for (const bk of backs.values()) if (bk.door !== null) backDoors.push(bk.door, bk.y);
  const nearBackDoor = (x, y) => { for (let i = 0; i < backDoors.length; i += 2) if (Math.abs(backDoors[i] - x) < BACK_DOOR_CLEAR && Math.abs(backDoors[i + 1] - y) < 64) return true; return false; };
  const items = [], fences = [];
  (m.edges || []).forEach((e, ei) => {
    if (!e || e.kind !== 'alley' || e.lvl !== 0 || !e.pts || e.pts.length < 2 || !(e.len > MOUTH * 2 + 40)) return;
    const a = e.pts[0], z = e.pts[e.pts.length - 1];
    const g = gritOf(distAt((a.x + z.x) / 2, (a.y + z.y) / 2)), hw = e.hw || 48;
    const H0 = (s, k) => hash2(Math.round(a.x / 8) + ei * 3, Math.round(s), 7300 + k);
    let cat = H0(0, 1) < 0.4 ? MOUTH + 40 + H0(0, 2) * (e.len - 2 * MOUTH - 80) : -1;
    let rat = g > 0.55 && H0(0, 3) < 0.5 ? MOUTH + 30 + H0(0, 4) * (e.len - 2 * MOUTH - 60) : -1;
    let burn = g > 0.85 && H0(0, 5) < 0.4 ? MOUTH + 60 + H0(0, 6) * (e.len - 2 * MOUTH - 120) : -1;
    const drainAt = e.len * (0.4 + H0(0, 7) * 0.2), holeAt = e.len > 600 ? e.len * (0.18 + H0(0, 8) * 0.1) : -1;
    const push = (k, x, y, side, nx, ny, v) => items.push({ k, x: Math.round(x), y: Math.round(y), v, side, nx, ny, e: ei, g });
    let fenceRun = [null, null];
    for (let s = MOUTH; s <= e.len - MOUTH; s += STEP) {
      const q = pointAt(e.pts, s);
      // the asphalt itself: decals anywhere across it (never at the mouths)
      const u = H0(s, 10);
      if (Math.abs(s - drainAt) < STEP / 2) push('drain', q.x - q.ty * hw * 0.62, q.y + q.tx * hw * 0.62, 1, -q.ty, q.tx, 0);
      else if (holeAt > 0 && Math.abs(s - holeAt) < STEP / 2) push('manhole', q.x, q.y, 0, 0, 0, 0);
      else if (u < 0.05 + 0.1 * g) { const o = (H0(s, 11) - 0.5) * hw * 1.2; push('puddle', q.x - q.ty * o, q.y + q.tx * o, 0, 0, 0, Math.floor(H0(s, 12) * 6)); }
      else if (u < 0.08 + 0.16 * g) { const o = (H0(s, 11) - 0.5) * hw * 1.3, k = H0(s, 13); push(k < 0.3 * g ? 'oil' : k < 0.3 * g + 0.25 ? 'crack' : k < 0.5 + 0.25 * g ? 'litter' : 'leaves', q.x - q.ty * o, q.y + q.tx * o, 0, 0, 0, Math.floor(H0(s, 12) * 6)); }
      for (const side of [-1, 1]) {
        const nx = -q.ty * side, ny = q.tx * side;            // toward this side's wall
        const wx = q.x + nx * (hw + 20), wy = q.y + ny * (hw + 20);
        const wt = tile(Math.floor(wx / TILE), Math.floor(wy / TILE));
        // an east-west alley's south side is hidden behind the roofs of the buildings south of it
        if (ny > 0.7 && wt === T.BUILDING) continue;
        const open = wt === T.LOT || wt === T.GRASS || wt === T.DIRT;
        // a chain-link fence along an open back lot
        const fi = side < 0 ? 0 : 1;
        if (open && g > 0.25) { const fx = q.x + nx * (hw + 6), fy = q.y + ny * (hw + 6); if (!fenceRun[fi]) fenceRun[fi] = { x0: fx, y0: fy, x1: fx, y1: fy, n: 0 }; else { fenceRun[fi].x1 = fx; fenceRun[fi].y1 = fy; fenceRun[fi].n++; } }
        else if (fenceRun[fi]) { if (fenceRun[fi].n >= 3) fences.push(fenceRun[fi]); fenceRun[fi] = null; }
        const r = H0(s, 20 + fi);
        // weeds along the wall foot
        if (wt === T.BUILDING && r > 1 - 0.05 - 0.1 * g) { push('weeds', q.x + nx * (hw - 4), q.y + ny * (hw - 4), side, nx, ny, Math.floor(H0(s, 22 + fi) * 6)); continue; }
        let k = null;
        if (cat >= 0 && Math.abs(s - cat) < STEP / 2) { k = 'cat'; cat = -1; }
        else if (rat >= 0 && Math.abs(s - rat) < STEP / 2) { k = 'rat'; rat = -1; }
        else if (burn >= 0 && Math.abs(s - burn) < STEP / 2) { k = 'burn'; burn = -1; }
        else if (r < 0.16 + 0.4 * g + (wt === T.BUILDING ? 0.08 : 0)) k = pickKind(g, H0(s, 30 + fi));
        if (!k) continue;
        const [, dep] = DRESS[k], off = hw - dep / 2 - 3;
        const x = Math.round(q.x + nx * off), y = Math.round(q.y + ny * off);
        if (!isAlley(Math.floor(x / TILE), Math.floor(y / TILE)) || nearDoor(x, y, DOOR_CLEAR) || nearBackDoor(x, y) || nearSolid(x, y, DRESS[k][0] + 6)) continue;
        // not crowding the last thing put on this side
        const last = items.length ? items[items.length - 1] : null;
        if (last && last.e === ei && last.side === side && !DECALS.has(last.k) && (last.x - x) * (last.x - x) + (last.y - y) * (last.y - y) < 26 * 26) continue;
        push(k, x, y, side, nx, ny, Math.floor(H0(s, 40 + fi) * 6));
      }
    }
    for (const f of fenceRun) if (f && f.n >= 3) fences.push(f);
  });
  return { items, backs, fences };
}

// what stands against an alley wall, by the district's grit (0 tidy uptown .. 1 the roughest)
function pickKind(g, u) {
  const W = [
    ['bags', 2.4 + g], ['bin', 2], ['bins', g > 0.3 ? 1.4 : 0.4], ['boxes', 1.6], ['pallet', 0.4 + 1.4 * g], ['crates', 0.3 + 1.2 * g],
    ['tires', g > 0.6 ? 0.9 : 0], ['drum', g > 0.7 ? 0.8 : 0], ['mattress', g > 0.7 ? 0.8 : 0], ['cart', g > 0.55 ? 0.7 : 0],
    ['pots', g < 0.45 ? 3.2 * (1 - g) : 0], ['bike', g < 0.6 ? 0.8 : 0],
  ];
  let sum = 0; for (const [, w] of W) sum += w;
  let r = u * sum;
  for (const [k, w] of W) { r -= w; if (r < 0) return k; }
  return 'bags';
}
