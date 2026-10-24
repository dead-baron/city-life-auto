// World v3b: nothing blocking on the streets, the pavements, the tracks or the doors (the owner, 2026-10-15: "There are
// fences that spawn over sidewalks ... they don't spawn over streets or sidewalks or train tracks", "Some world objects
// are spawning on the train tracks like mossy logs"). The last pass of the whole-world build (shared/world3-world.js'
// `done` hook, after everything else is laid); the page and the city worker never load this module.
//
// What may stand where (judge):
// - a street's roadway or a bridge deck (ROAD and BRIDGE tiles; an alley's asphalt is its own: below): nothing. A
//   lamp or a signal pole standing on it moves to the nearest kerb (its signal's arm with it); anything else goes.
// - a pavement (SIDEWALK): street furniture only (FURNITURE: lamps, signal and utility poles, benches, bins, hydrants,
//   mail and news boxes, phone boxes, bus shelters, planters, bike racks, bollards, signs, ATMs, a vendor's cart, cafe
//   umbrellas, the trees and shrubs in their pits); dumpsters, crates, tyres, pallets, drums, rocks, logs, fences, any
//   other clutter go.
// - an alley's asphalt (a ROAD tile of roadRank 1: map.js dressAlleys): what stands against its walls (ALLEY_DRESS),
//   the wall lamps; nothing else.
// - a dirt road's bed (a ground-level 'dirt' edge's dirt tiles, DIRT_BED px in from its edges), and the pavement out in the country (a
//   wild district's: WILD_STYLES): nothing that grows - no tree, palm, shrub, bush, flower or cactus.
// - a handcrafted plan's own fence runs (HAND_RUNS: its railings, hedges, yard and lot fences) stop at a street: cut back
//   to their longest stretch off the roadway (cutHandRuns).
// - the track (each line's surface track: not below ground, not in a bore): no prop's body within TRACK_CLEAR px of
//   a track's centre line (a log or a fence along its whole length); a station's platform: lamps only.
// - a door (a building's door tile, a walk-in's doorway, the spot in front of a door a place's map point stands on):
//   nothing solid on it.
// ATMs always stay (their POIs are kept by index). The fields' rail fences (the renderer draws one along each field's
// north edge: client/art2/game/statics.js) are laid as runs over open ground only (field.fence), the hay bales and the
// scarecrow left out where they would stand on a road (field.bales, field.crow).
//   clearClutter3(m, H, hand) -> { dropped: { 'type tile': n }, moved: { 'type': n }, fields: n, kit: n }   H: { removeProps }; hand: the handcrafted plans' own props, left be
//     (default m.handProps: handLaid(m, before) marks them as the plans lay them)
//   clutterOn(m, hand) -> [{ t, x, y, why }]   what still stands where it may not (the test's and the tool's check)
// Deterministic: no Math.random; a heading's cosine and sine are shared/dmath.js'; the moves are to spots in whole px.
import { TILE, T } from './constants.js';
import { dcos, dsin } from './dmath.js';
import { DISTRICTS, WILD_STYLES } from './mapcore.js';

export const FURNITURE = new Set(['lamp', 'sigpole', 'upole', 'hydrant', 'hydrant_y', 'trashcan', 'bench_a', 'bench_b', 'bench_m', 'pbench', 'mailbox', 'phonebox',
  'news_a', 'news_b', 'news_c', 'planter_g', 'planter_sq', 'planter_fl', 'potted', 'bollard', 'bikerack', 'busstop', 'atmw', 'atm', 'foodcart', 'foodcart_b',
  'umbrella_y', 'umbrella_r', 'umbrella_b', 'umbrella_g', 'cafetable', 'vend_a', 'vend_cola', 'vend_c', 'roadsign', 'textsign', 'fingerpost', 'mapboard', 'chalkboard',
  'billboard', 'tree_a', 'tree_b', 'palm_a', 'palm_b', 'palm_c', 'palm_d', 'palm_s', 'shrub_a', 'shrub_b', 'bush_a', 'bush_b', 'bush_c', 'flowers_a', 'flowers_big',
  'flowerbed', 'bags', 'scope', 'lifering', 'post', 'lantern', 'festoon', 'dspeaker', 'stand']);
export const ALLEY_DRESS = new Set(['dump_g', 'dump_b', 'dump_o', 'crates', 'acunit', 'drum', 'tires', 'pallet', 'pallet_b', 'pallet_s', 'bags', 'lamp',
  'steamvent', 'handtruck', 'spool', 'pipes', 'planks', 'trashpile', 'burnbarrel']);   // (the 2026-10-23 alleys' extra kinds: map.js dressAlleys)
// the pavement's inner ring (map.js buildStreetProps) by district style, World v3's: street furniture only - the
// industrial and rough districts' dumpsters, drums, pallets, crates, spools, cones and tyres stay in their yards
export const PAVEMENT3 = {
  industrial: ['trashcan', 'bollard', 'phonebox', 'news_c', 'tree_b'], factory: ['trashcan', 'bollard', 'phonebox', 'news_c'], harbor: ['bollard', 'trashcan', 'bench_m', 'phonebox'],
  southside: ['trashcan', 'shrub_b', 'phonebox', 'news_c', 'mailbox'], redlight: ['trashcan', 'news_b', 'palm_s', 'phonebox', 'bollard'],
  oldtown: ['trashcan', 'bench_a', 'mailbox', 'news_c', 'phonebox', 'tree_b'],
};
// what moves to the kerb rather than going
const MOVES = new Set(['lamp', 'sigpole', 'upole', 'mailbox']);
// px from a track's centre line that a prop's body keeps clear of (a train is 76 px wide: 38 either side)
export const TRACK_CLEAR = 38;
const POLE_GROUND = new Set([T.SIDEWALK, T.PLAZA, T.GRASS, T.LOT, T.DIRT, T.SAND]);
// (a bridge carries a street when it is on the road net: a boardwalk's, a footbridge's, a log bridge's deck is not one)
const STREET = (m, i) => (m.tiles[i] === T.BRIDGE && m.roadRank[i] > 0) || (m.tiles[i] === T.ROAD && m.roadRank[i] !== 1);
// not props at all: the marks of a painted block (the art shows it)
const MARKS = new Set(['painted', 'plamp']);
// what grows (the owner, 10-23: "Dirt trails getting a lot of vegetation growing on it ... fully stacked with bushes and
// trees", "full flowers and bushes coming out of the sidewalk doesn't look right"): nothing of it on a dirt road's bed
// (the tiles it lays as dirt, their middles DIRT_BED px in from its edges: map.js rasterRoads - the wild's scrub and
// trees were laid before the tracks), nor on the pavement
// out in the country (the valley's flowers and the desert's scrub, laid before the pavements were); the street trees
// and the beds in town stay. (The giant redwoods - Giant's Gate stands over its lane - are placed by hand.)
const GROWS = /^(tree_|palm_|shrub_|bush_|flowers_|cactus$)/;
export const DIRT_BED = 12;

// the handcrafted districts' plans (world3-hand.js) lay their own dressing - their medians' palms, the lights strung
// over their streets, their market stalls, their yards' fences - placed and checked by hand: handLaid(m, before) marks
// every prop not in before (a Set of the props there were) as theirs, on m.handProps (a WeakSet, not enumerable: never
// copied or sent)
export function handLaid(m, before, beforeB = null) {
  if (!m.handProps) Object.defineProperty(m, 'handProps', { value: new WeakSet(), enumerable: false, configurable: true });
  for (const p of m.props) if (p && !before.has(p)) m.handProps.add(p);
  // ...and the buildings they put up, on m.handBuilt (the same): no other pass makes shops of them - shared/world3-shops.js
  if (!beforeB) return;
  if (!m.handBuilt) Object.defineProperty(m, 'handBuilt', { value: new WeakSet(), enumerable: false, configurable: true });
  for (const b of m.buildings) if (b && !beforeB.has(b)) m.handBuilt.add(b);
}

// a prop's body: its extent as a segment (fences, logs, rails: their two ends) and a radius round it
function body(p, solidR) {
  let ax = p.x, ay = p.y, bx = p.x, by = p.y;
  if (p.x1 !== undefined) { bx = p.x1; by = p.y1; }
  else if ((p.tx !== undefined || p.ty !== undefined) && (p.t === 'chainfence' || p.t === 'hedgerun' || p.t === 'rail')) { bx = p.x + (p.tx || 0); by = p.y + (p.ty || 0); }
  else if (p.len && (p.t === 'log' || p.t === 'rwlog' || p.t === 'gnawlog' || p.t === 'driftwood' || p.t === 'bamboo' || p.t === 'crail' || p.t === 'creekrail' || p.t === 'pierrail' || p.t === 'vinerow')) {
    const a = p.a || 0, c = dcos(a), s = dsin(a), h = p.len / 2;   // (shared/dmath.js: the same bits in every engine)
    ax = p.x - c * h; ay = p.y - s * h; bx = p.x + c * h; by = p.y + s * h;
  }
  const r = p.t === 'boulder' ? (p.s || 52) * 0.5 : p.t === 'outcrop' || p.t === 'seastack' ? Math.max(solidR, 24) : p.t === 'rwlog' ? 28 : p.t === 'log' ? 12 : solidR || 4;
  return { ax, ay, bx, by, r };
}
// the points along a body every 16 px (its middle and ends; for a round one its middle and four points at 0.7 r)
function bodyPts(B) {
  const L = Math.sqrt((B.bx - B.ax) * (B.bx - B.ax) + (B.by - B.ay) * (B.by - B.ay)), out = [];
  if (L < 1) { out.push([B.ax, B.ay]); const k = B.r * 0.7; if (k >= 8) out.push([B.ax - k, B.ay], [B.ax + k, B.ay], [B.ax, B.ay - k], [B.ax, B.ay + k]); return out; }
  const n = Math.max(1, Math.ceil(L / 16));
  for (let j = 0; j <= n; j++) out.push([B.ax + (B.bx - B.ax) * j / n, B.ay + (B.by - B.ay) * j / n]);
  return out;
}

// the context the rules read: the surface track's points by cell, the platforms, the door tiles
function context(m) {
  const C = 128, key = (cx, cy) => (cx + 4096) * 8192 + cy + 4096, cells = new Map();
  for (const R of m.rails || []) for (const p of R.pts || []) {
    if (p.under || p.bore) continue;
    const k = key(Math.floor(p.x / C), Math.floor(p.y / C));
    let a = cells.get(k); if (!a) cells.set(k, (a = [])); a.push(p.x, p.y);
  }
  const trackD = (x, y) => {
    let d = Infinity; const cx = Math.floor(x / C), cy = Math.floor(y / C);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const a = cells.get(key(cx + dx, cy + dy)); if (a) for (let j = 0; j < a.length; j += 2) { const ex = a[j] - x, ey = a[j + 1] - y, e = ex * ex + ey * ey; if (e < d) d = e; } }
    return Math.sqrt(d);
  };
  const plats = [];
  for (const R of m.rails || []) for (const st of R.stations || []) if (!st.under) plats.push({ x: st.x, y: st.y, c: dcos(st.a || 0), s: dsin(st.a || 0), side: st.side || 1, half: st.half || 112, inner: st.inner || 40, outer: st.outer || 104 });
  const onPlatform = (x, y) => plats.some((P) => {
    const dx = x - P.x, dy = y - P.y;
    if (Math.abs(dx) > 600 || Math.abs(dy) > 600) return false;
    const along = dx * P.c + dy * P.s, across = (-dx * P.s + dy * P.c) * P.side;
    return Math.abs(along) < P.half + 16 && across > P.inner - 8 && across < P.outer + 16;
  });
  // a ground-level dirt road's bed: the tiles whose middle is within its half width less DIRT_BED of its line (the tiles it
  // laid as dirt)
  const dirtBed = new Set();
  for (const e of m.edges || []) {
    if (!e || e.kind !== 'dirt' || e.lvl || e.tunnel || !e.pts || e.pts.length < 2) continue;
    const hw = (e.hw || 32) - DIRT_BED, r = Math.ceil(hw / TILE) + 1;
    for (let k = 1; k < e.pts.length; k++) {
      const a = e.pts[k - 1], b = e.pts[k], L = Math.sqrt((b.x - a.x) * (b.x - a.x) + (b.y - a.y) * (b.y - a.y)), n = Math.max(1, Math.ceil(L / 8));
      for (let j = 0; j <= n; j++) {
        const x = a.x + (b.x - a.x) * j / n, y = a.y + (b.y - a.y) * j / n, tx0 = Math.floor(x / TILE), ty0 = Math.floor(y / TILE);
        for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
          const tx = tx0 + dx, ty = ty0 + dy;
          if (!m.inside(tx, ty)) continue;
          const ex = (tx + 0.5) * TILE - x, ey = (ty + 0.5) * TILE - y;
          if (ex * ex + ey * ey < hw * hw) dirtBed.add(m.idx(tx, ty));
        }
      }
    }
  }
  const doors = new Set();
  const door = (tx, ty) => { if (m.inside(tx, ty)) doors.add(m.idx(tx, ty)); };
  for (const b of m.buildings) {
    if (!b || b.gone) continue;
    if (b.door) { door(b.door.tx, b.door.ty); door(b.door.tx + 1, b.door.ty); }
    if (b.walkIn) for (const u of b.walkIn.units) { const fy = u.door.ty + (b.walkIn.south ? 1 : -1); for (let k = 0; k < (u.door.w || 2); k++) door(u.door.tx + k, fy); }
  }
  for (const p of m.pois) {
    if (p.b === undefined || p.b === null || p.kind === 'atm') continue;
    const o = p.outside || p, tx = Math.floor(o.x / TILE), ty = Math.floor(o.y / TILE);
    if (m.inside(tx, ty) && m.tiles[m.idx(tx, ty)] !== T.BUILDING && m.tiles[m.idx(tx, ty)] !== T.FLOOR) door(tx, ty);
  }
  return { trackD, onPlatform, doors, dirtBed };
}

// why prop p may not stand where it is (null: it may)
function judge(m, X, p, solidR, hand = null) {
  if (p.t === 'atmw' || p.t === 'atm' || MARKS.has(p.t)) return null;
  // (a handcrafted district's own dressing - its medians' palms, the lights strung over its streets, its market stalls,
  // its yards' fences - stands where its plan put it: only something solid on a door goes)
  if (hand && hand.has(p)) { if (solidR > 0) { const tx = Math.floor(p.x / TILE), ty = Math.floor(p.y / TILE); if (m.inside(tx, ty) && X.doors.has(m.idx(tx, ty))) return 'door'; } return null; }
  // (street furniture by where it stands - its foot; anything else by its whole body: a log's or a fence's length, a
  // rock's bulk)
  if (GROWS.test(p.t)) {   // (what grows: by its foot)
    const tx = Math.floor(p.x / TILE), ty = Math.floor(p.y / TILE);
    if (m.inside(tx, ty)) {
      const i = m.idx(tx, ty);
      if (X.dirtBed.has(i)) return 'dirt';
      if (m.tiles[i] === T.SIDEWALK && WILD_STYLES.has((DISTRICTS[m.dist[i]] || {}).style)) return 'sidewalk';
    }
  }
  const furn = FURNITURE.has(p.t), B = body(p, solidR), pts = furn ? [[p.x, p.y]] : bodyPts(B);
  for (const [x, y] of pts) {
    const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
    if (!m.inside(tx, ty)) continue;
    const i = m.idx(tx, ty), t = m.tiles[i];
    if (STREET(m, i)) return 'road';
    if (t === T.ROAD && !(ALLEY_DRESS.has(p.t) || (p.t === 'lamp' && p.wall))) return 'alley';
    if (t === T.SIDEWALK && !furn) return 'sidewalk';
  }
  for (const [x, y] of pts) if (X.trackD(x, y) < TRACK_CLEAR + B.r) return 'track';
  if (p.t !== 'lamp' && X.onPlatform(p.x, p.y)) return 'platform';
  if (solidR > 0 || !furn) {
    const tx = Math.floor(p.x / TILE), ty = Math.floor(p.y / TILE);
    if (m.inside(tx, ty) && X.doors.has(m.idx(tx, ty))) return 'door';
  }
  return null;
}
const solidOf = (m) => { const o = new Map(); for (const [i, e] of m.propSolid || []) o.set(i, e); return o; };

export function clutterOn(m, hand = m.handProps || null) {
  const X = context(m), S = solidOf(m), out = [];
  m.props.forEach((p, i) => { if (!p) return; const e = S.get(i), why = judge(m, X, p, e && !e.off ? e.r : 0, hand); if (why) out.push({ t: p.t, x: p.x, y: p.y, why }); });
  return out;
}

// The guard. H: { removeProps } (map.js)
export function clearClutter3(m, H, hand = m.handProps || null) {
  const out = { dropped: {}, moved: {}, fields: 0, kit: 0 };
  const X = context(m), S = solidOf(m);
  const drop = new Set(), extra = [];
  const tileName = (x, y) => { const t = m.tileAtPx(x, y); return t === T.ROAD ? 'road' : t === T.BRIDGE ? 'bridge' : t === T.SIDEWALK ? 'sidewalk' : 'ground'; };
  m.props.forEach((p, i) => {
    if (!p) return;
    const e = S.get(i), r = e && !e.off ? e.r : 0, why = judge(m, X, p, r, hand);
    if (!why) return;
    if (why === 'road' && MOVES.has(p.t)) {
      const to = kerb(m, p.x, p.y);
      if (to) {
        const [nx, ny] = to, ox = p.x, oy = p.y;
        p.x = nx; p.y = ny;
        if (!judge(m, X, p, r, hand)) {
          if (e) moveSolid(m, e, nx, ny);
          if (p.t === 'sigpole') for (const sg of m.signals || []) {
            if (!sg) continue;
            if (!sg.wire && sg.x === ox && sg.y === oy) { sg.x = nx; sg.y = ny; }
            if (sg.wire) for (const q of sg.poles) if (q[0] === ox && q[1] === oy) { q[0] = nx; q[1] = ny; }
          }
          out.moved[p.t] = (out.moved[p.t] || 0) + 1;
          return;
        }
        p.x = ox; p.y = oy;
      }
    }
    const k = `${p.t} ${why === 'road' || why === 'sidewalk' || why === 'alley' ? tileName(p.x, p.y) : why}`;   // ('dirt': on a dirt road's bed)
    out.dropped[k] = (out.dropped[k] || 0) + 1;
    drop.add(p);
    // (a lying log's or a fence's own solids along its length: map.js buildWilds, redwoodGroves - bare entries)
    const B = body(p, r);
    if (B.ax !== B.bx || B.ay !== B.by) extra.push(B);
  });
  if (drop.size) {
    const gone = new Set([...drop].map((p) => p.x + ',' + p.y));
    // the bare solid entries along a dropped log or fence (within its body), by their position
    if (extra.length) for (const arr of m.solidProps.values()) for (const e of arr) {
      if (e.pi >= 0) continue;
      for (const B of extra) if (segD(e.x, e.y, B) < B.r + 18) { gone.add(e.x + ',' + e.y); break; }
    }
    H.removeProps(m, (x, y) => gone.has(x + ',' + y));
  }
  // the handcrafted plans' own fence runs (a seawall's railing, a hedge, a yard's or a lot's fence: no solid along them)
  // stop at a street: cut back to their longest stretch off the roadway, or gone when that's under HAND_RUN_MIN px (the
  // owner, 10-23: "fences still spawning in the middle of the street" - a promenade's railing carried on across the road
  // where it bridges the water)
  if (hand) out.cut = cutHandRuns(m, hand, solidOf(m), H);   // (the solids by prop index again: the drops above re-indexed them)
  // the fields' fences: runs over open ground only; the bales and the scarecrow kept off the roads
  const openAt = (x, y) => { const t = m.tileAtPx(x, y); return t !== T.ROAD && t !== T.BRIDGE && t !== T.SIDEWALK && t !== T.WATER && t !== T.DEEP && t !== T.BUILDING && t !== T.WALL && t !== T.DOCK && X.trackD(x, y) >= TRACK_CLEAR + 6; };
  for (const f of m.fields || []) {
    const y = f.y - 10, runs = [];
    let a = null, last = null;
    for (let x = f.x - 10; x <= f.x + f.w + 10; x += 8) {
      if (openAt(x, y)) { if (a === null) a = x; last = x; }
      else if (a !== null) { if (last - a >= 32) runs.push([a, last]); a = null; }
    }
    if (a !== null && last - a >= 32) runs.push([a, last]);
    const whole = runs.length === 1 && runs[0][0] === f.x - 10 && runs[0][1] >= f.x + f.w + 2;
    if (!whole) { f.fence = runs; out.fields++; }
    let bales = true;
    for (let k = 0; k < 3; k++) if (!openAt(f.x + 30 + k * 34, f.y + f.h + 26)) bales = false;
    if (!bales) f.bales = 0;
    if (!openAt(f.x + f.w * 0.5, f.y + f.h * 0.4)) f.crow = 0;
  }
  // the towns' kit (world3-towns.js townModels: decoration the renderer draws) off the roadways and the track
  if (m.townKit) {
    const keep = [];
    for (const k of m.townKit) {
      const tx = Math.floor(k.x / TILE), ty = Math.floor(k.y / TILE), i = m.inside(tx, ty) ? m.idx(tx, ty) : -1;
      if (k.k !== 'porch' && ((i >= 0 && STREET(m, i)) || X.trackD(k.x, k.y) < TRACK_CLEAR + 8)) { out.kit++; continue; }
      keep.push(k);
    }
    m.townKit = keep;
  }
  return out;
}
export const HAND_RUNS = new Set(['rail', 'hedgerun', 'chainfence', 'yfence', 'fenceline']), HAND_RUN_MIN = 24;
function cutHandRuns(m, hand, S, H) {
  let cut = 0;
  const gone = new Set();
  m.props.forEach((p, i) => {
    if (!p || !hand.has(p) || !HAND_RUNS.has(p.t)) return;
    const e = S.get(i);
    if (e && !e.off && e.r > 0) return;   // (one with a solid of its own: as it is)
    const B = body(p, 0), L = Math.sqrt((B.bx - B.ax) * (B.bx - B.ax) + (B.by - B.ay) * (B.by - B.ay));
    if (L < 1) return;
    // (a roadway the run crosses - a street's or an alley's asphalt, a bridge's deck: not one it runs along, its kerb a
    // tile's step in under it, nor a plan's own yard paving)
    const n = Math.max(1, Math.ceil(L / 8)), ok = [], along = Math.abs(B.bx - B.ax) >= Math.abs(B.by - B.ay) ? 2 : 1;
    for (let j = 0; j <= n; j++) {
      const x = B.ax + (B.bx - B.ax) * j / n, y = B.ay + (B.by - B.ay) * j / n, tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
      const i = m.inside(tx, ty) ? m.idx(tx, ty) : -1, road = i >= 0 && (m.tiles[i] === T.ROAD || m.tiles[i] === T.BRIDGE) && m.roadRank[i] > 0;
      ok.push(!(road && (m.roadAxis[i] & 3) !== along));
    }
    if (ok.every(Boolean)) return;
    let best = [-1, -1], a = -1;
    for (let j = 0; j <= n + 1; j++) {
      if (j <= n && ok[j]) { if (a < 0) a = j; continue; }
      if (a >= 0 && j - 1 - a > best[1] - best[0]) best = [a, j - 1];
      a = -1;
    }
    const len = best[0] < 0 ? 0 : (best[1] - best[0]) * L / n;
    cut++;
    if (len < HAND_RUN_MIN) { gone.add(p); return; }
    const ax = Math.round(B.ax + (B.bx - B.ax) * best[0] / n), ay = Math.round(B.ay + (B.by - B.ay) * best[0] / n), bx = Math.round(B.ax + (B.bx - B.ax) * best[1] / n), by = Math.round(B.ay + (B.by - B.ay) * best[1] / n);
    if (p.x1 !== undefined) { p.x = ax; p.y = ay; p.x1 = bx; p.y1 = by; }
    else { p.x = ax; p.y = ay; p.tx = bx - ax; p.ty = by - ay; }
  });
  if (gone.size) {
    const at = new Set([...gone].map((p) => p.x + ',' + p.y));
    H.removeProps(m, (x, y) => at.has(x + ',' + y));
  }
  return cut;
}
const segD = (x, y, B) => {
  const dx = B.bx - B.ax, dy = B.by - B.ay, L = dx * dx + dy * dy;
  const t = L ? Math.max(0, Math.min(1, ((x - B.ax) * dx + (y - B.ay) * dy) / L)) : 0, ex = B.ax + dx * t - x, ey = B.ay + dy * t - y;
  return Math.sqrt(ex * ex + ey * ey);
};
// the nearest kerb spot to (x, y): the spot nearest it in the nearest tile a pole may stand on, within 8 tiles (a
// mast arm reaches 7: statics.js); null with none
function kerb(m, x, y) {
  const tx0 = Math.floor(x / TILE), ty0 = Math.floor(y / TILE);
  let best = null, bd = Infinity;
  for (let dy = -8; dy <= 8; dy++) for (let dx = -8; dx <= 8; dx++) {
    const tx = tx0 + dx, ty = ty0 + dy;
    if (!m.inside(tx, ty) || !POLE_GROUND.has(m.tiles[m.idx(tx, ty)]) || m.deck[m.idx(tx, ty)]) continue;
    // (the spot in that tile nearest the pole, 6 px in from its edges)
    const px = Math.max(tx * TILE + 6, Math.min((tx + 1) * TILE - 6, x)), py = Math.max(ty * TILE + 6, Math.min((ty + 1) * TILE - 6, y));
    const e = (px - x) * (px - x) + (py - y) * (py - y);
    if (e < bd) { bd = e; best = [Math.round(px), Math.round(py)]; }
  }
  return best;
}
// a prop's solid entry moved to (x, y): out of its tile's list into the new one's
function moveSolid(m, e, x, y) {
  const k0 = m.idx(Math.floor(e.x / TILE), Math.floor(e.y / TILE)), a = m.solidProps.get(k0);
  if (a) { const j = a.indexOf(e); if (j >= 0) a.splice(j, 1); if (!a.length) m.solidProps.delete(k0); }
  e.x = x; e.y = y;
  const k1 = m.idx(Math.floor(x / TILE), Math.floor(y / TILE));
  let b = m.solidProps.get(k1); if (!b) m.solidProps.set(k1, (b = []));
  b.push(e);
}
