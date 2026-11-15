// Open up the blocks (the owner, 2026-11-14: "There are still so many huge buildings that take up so much space and don't
// add anything interesting and cover so much of the street view. We don't see very many cool alleys, or a lot of streets
// are covered because of unnecessarily huge buildings around the world." - his screenshot: one huge flat grey roof with
// a row of AC units, the street squeezed above it). The earlier passes cut the plain slivers into lots (shared/map.js
// breakPlainBlocks, 11-06), split the big plain towers (world3-towers.js, 11-07) and capped the plain walls' heights
// over the street (the art's streetCap, 11-12); none of them touched a big FOOTPRINT of a low or mid-rise building - the
// hand plans' office blocks, car parks, condos and apartment slabs drawn whole, the old fill's long roofs.
//
// Once the world is built (World v3's last building pass, after the towers are split), each building footprint that is
// BIG (OPEN3: over `area` tiles of roof, or a street front over `front` tiles or a depth over `deep` with more than `min`
// tiles of roof) with NO REASON to be one building (keepWhole: no walk-in, no trade but its delivery stop, no place of
// its own - a station, a casino, a hospital, the police, a school: the POIs; not a landmark, a split tower, a set piece
// with its own roof kit, neon or lights, a town's own look, a generator's designed lot; not a warehouse, a factory, a
// church, a civic hall, a hotel, a mall - KEEP_ARCH; not in a district built of them - the yards, the harbor, the
// airport, the prison) is broken up in its own footprint:
//   - columns 8-15 tiles wide along its street front, WALKABLE ALLEYS of 3-4 tiles between them from the front street
//     through to the back (open at both ends where the back is open, else a dead end at a back yard);
//   - a footprint deeper than `rows[0]`: a front row 10-14 deep, a wide back lane (5-7: wide enough that the low front
//     row doesn't hide it from the camera) behind it, back rows of 10-14 with passages of 4-5 between them;
//   - the cells buildings of their own: the building keeps the front cell over its door - its id, name, art, sign,
//     delivery stop and home, all where they were (no home moves: no WORLD_VERSION bump) - and the others are new
//     plain buildings at the end of the list (no other building's id, so no other look, moves) of the district's own
//     kinds side by side (a walk-up by a shop row by an old row...), each its own height (a row with a lane behind it
//     2-3 storeys, so the lane and the backs across it show; the rest 2-4, 2-5 downtown), their fronts and doors on the street; a back row cell on a lane is
//     a back (b.back: its back door with a bulb, its pipes, a vent, tags and a fire escape - shared/alleys.js) or a small
//     shop onto the lane;
//   - some back cells left open: a courtyard (paving, a tree, benches, planters, string lights) or a back lot (asphalt,
//     dumpsters, pallets, crates); a single row of four or more cells gets a pocket courtyard on the street;
//   - the alleys come alive: a dumpster against a wall, string lights across some, a steam vent, a wall lamp; the rest of
//     their dressing - bins, bags, crates, pallets, a stray cat, puddles, the back walls' doors, pipes and tags - is the
//     art's (shared/alleys.js dresses m.openAlleys like the city's own alleys; nothing in map.props); a few street dice
//     games down the rough districts' lanes (m.diceSpots: server/systems/activities.js).
// Every choice is a hash of the footprint's corner (hash2); the rows from its top and depth alone, so neighbours of one
// depth (the old fill's slivers side by side) are cut at the same rows and their passages run on through. m.openAlleys
// [{ x, y, w, h, ns, d }] (tiles) and m.openYards [{ x, y, w, h, k }] say what was opened (the art, the lint, the tests).
import { TILE, T } from './constants.js';
import { hash2 } from './rng.js';
import { DISTRICTS } from './mapcore.js';
import { gritOf } from './alleys.js';

// area: roof tiles; front / deep: a street front or a depth this long with more than `min` tiles of roof; rows: deeper
// than this, rows with a lane behind the front one; cell: a column's width; alley: an alley's
export const OPEN3 = { area: 360, front: 26, deep: 22, min: 220, rows: 22, cell: [8, 15], alley: [3, 4], lane: [5, 7] };
export const bigRoof = (b) => { const a = b.tw * b.th; return a > OPEN3.area || (a > OPEN3.min && (b.tw > OPEN3.front || b.th > OPEN3.deep)); };
// the kinds that are one building by design (KEEP_ARCH) and the districts built of big ones (KEEP_STYLE)
const SPLIT_ARCH = new Set(['mixed', 'walkup', 'oldrow', 'rough', 'nightrow', 'office', 'glass', 'condo', 'block', 'townhouse', 'beachblock']);
const KEEP_STYLE = new Set(['industrial', 'factory', 'harbor', 'airport', 'rural', 'wild', 'desert', 'rocky', 'park', 'houses']);
const STYLE_ARCH = { towers: 'office', commercial: 'mixed', apartments: 'walkup', oldtown: 'oldrow', southside: 'rough', nightlife: 'nightrow', redlight: 'nightrow', civic: 'civicblock', luxury: 'condo', beach: 'beachblock', arts: 'oldrow' };
// the new buildings' kinds, by the district (the art draws each by its kind: client/art2/game/statics.js specOf)
const ARCHES = {
  towers: ['mixed', 'walkup', 'office', 'condo', 'mixed', 'oldrow'], civic: ['mixed', 'office', 'walkup', 'oldrow'], commercial: ['mixed', 'walkup', 'oldrow', 'mixed'],
  apartments: ['walkup', 'mixed', 'walkup', 'oldrow'], arts: ['oldrow', 'walkup', 'mixed', 'oldrow'], southside: ['rough', 'walkup', 'rough', 'mixed'],
  oldtown: ['oldrow', 'townhouse', 'mixed', 'oldrow'], nightlife: ['nightrow', 'mixed', 'walkup'], redlight: ['nightrow', 'mixed', 'walkup'],
  beach: ['beachblock', 'mixed', 'townhouse'], luxury: ['condo', 'mixed', 'townhouse'],
};
// the props fixed to a front wall (an alley never opens behind one)
const ATTACH = new Set(['atmw', 'textsign', 'picboard', 'plamp', 'motelsign', 'phonebox']);

const districtOf = (m, b) => m.dist[m.idx(Math.min(m.x0 + m.w - 1, b.tx + (b.tw >> 1)), Math.min(m.y0 + m.h - 1, b.ty + (b.th >> 1)))];
function archGuess(m, b, st) {
  if (b.arch) return b.arch;
  if (b.kind !== 'roof') return b.kind;
  const rk = b.roof >= 0 && m.roofs[b.roof] ? m.roofs[b.roof].kind : null;
  return rk === 'metal' ? 'warehouse' : rk === 'tile' ? 'house' : rk === 'glass' ? 'office' : STYLE_ARCH[st] || 'mixed';
}
// why a building stays one building (null: nothing - it's opened up if it's big). roles: building id -> its POIs' kinds
export function keepWhole(m, b, roles) {
  if (!b || b.gone || b.kind === 'motorpool') return 'gone';
  if (b.walkIn) return 'walk-in';
  if (b.hero) return 'hero corner';
  if (b.landmark) return 'landmark';
  if (b.towerPart && b.towerPart.role !== 'back') return 'split tower';   // (a split tower's back block is opened up: world3-towers.js)
  if (b.openKept) return 'opened (its own front)';
  if ((b.signs || []).some((q) => /\bPD\b|POLICE/.test(q.text || ''))) return 'police';
  if (b.business && b.business !== 'delivery') return 'trade';
  const R = (roles.get(b.id) || []).filter((k) => k !== 'delivery' && k !== 'home' && k !== 'atm');
  if (R.length) return 'place';
  if (b.art && (b.art.kit || b.art.neon || (b.art.lights && b.art.lights.length))) return 'set piece';
  if (b.look || b.handLook || b.lookW) return 'town look';
  if (b.prefab >= 0 && !b.hand) return 'designed lot';
  const D = DISTRICTS[districtOf(m, b)];
  if (!D || KEEP_STYLE.has(D.style)) return 'district';
  if (!SPLIT_ARCH.has(archGuess(m, b, D.style))) return 'kind';
  return null;
}
export function rolesOf(m) {
  const roles = new Map();
  for (const p of m.pois) if (p && p.b !== undefined) { const a = roles.get(p.b) || []; a.push(p.kind); roles.set(p.b, a); }
  return roles;
}
// the survey: every big footprint, why it stays whole (or null: opened up), by district -> { list: [{ id, name, tx, ty,
// tw, th, area, d, why }], by: { district: { n, tiles, open, openTiles } } }
export function surveyOpen(m) {
  const roles = rolesOf(m), list = [], by = {};
  for (const b of m.buildings) {
    if (!b || b.gone || !bigRoof(b)) continue;
    const why = keepWhole(m, b, roles), d = districtOf(m, b), k = DISTRICTS[d] ? DISTRICTS[d].name : String(d), area = b.tw * b.th;
    list.push({ id: b.id, name: b.name, tx: b.tx, ty: b.ty, tw: b.tw, th: b.th, area, d, why });
    const q = (by[k] ||= { n: 0, tiles: 0, open: 0, openTiles: 0 });
    q.n++; q.tiles += area; if (!why) { q.open++; q.openTiles += area; }
  }
  return { list, by };
}

export function openBlocks3(m, H3) {
  const out = { before: surveyOpen(m), opened: 0, made: 0, alleys: 0, yards: 0, dice: 0, tiles: 0, list: [] };
  if (!H3 || !H3.addProp) return out;
  const roles = rolesOf(m), n0 = m.buildings.length, opened = new Set();
  m.openAlleys ||= []; m.openYards ||= [];
  const todo = [];
  for (let i = 0; i < n0; i++) { const b = m.buildings[i]; if (b && !b.gone && bigRoof(b) && !keepWhole(m, b, roles)) todo.push(b); }
  // the props fixed to the front walls, by tile row
  const attach = new Map();
  for (const p of m.props) if (p && ATTACH.has(p.t)) { const k = Math.floor(p.y / TILE); let l = attach.get(k); if (!l) attach.set(k, (l = [])); l.push(p.x / TILE); }
  for (const b of todo) {
    const r = openBlock(m, b, H3, roles, attach, opened);
    if (!r) continue;
    out.opened++; out.made += r.made; out.alleys += r.alleys; out.yards += r.yards; out.tiles += r.tiles;
    out.list.push([b.id, r.made]);
  }
  // nothing that stood inside the walls (a roof's prop) left standing in the alleys and yards
  if (opened.size) H3.removeProps(m, (x, y) => opened.has(m.idx(Math.floor(x / TILE), Math.floor(y / TILE))) && !OWN.has(`${x},${y}`));
  OWN.clear();
  out.dice = diceDown(m, H3);
  out.after = surveyOpen(m);
  // (the map keeps the totals; the lists and the counts by district - tools/bigroofs.mjs, the tests - only on this build's own object)
  const full = { before: out.before.list, after: out.after.list, opened: out.list, by: { before: out.before.by, after: out.after.by } };
  const tot = (S) => ({ n: S.list.length, tiles: S.list.reduce((a, q) => a + q.area, 0), open: S.list.filter((q) => !q.why).length, openTiles: S.list.filter((q) => !q.why).reduce((a, q) => a + q.area, 0) });
  out.before = tot(out.before); out.after = tot(out.after); delete out.list;
  Object.defineProperty(out, 'full', { value: full, enumerable: false });
  return out;
}
// (the props this pass put down: kept when the inside's old props are cleared)
const OWN = new Set();
const prop = (m, H3, t, x, y, r = 0, extra = null) => { const px = Math.round(x * TILE), py = Math.round(y * TILE); H3.addProp(m, t, px, py, r, extra); OWN.add(`${px},${py}`); };

function openBlock(m, b, H3, roles, attach, opened) {
  const x = b.tx, y = b.ty, w = b.tw, h = b.th, d0 = districtOf(m, b), D = DISTRICTS[d0], st = D.style;
  const r = (k) => hash2(x * 7 + k, y * 13 - k, 2711);
  const tileAt = (tx, ty) => (m.inside(tx, ty) ? m.tiles[m.idx(tx, ty)] : T.WALL);
  const openT = (t) => t !== T.BUILDING && t !== T.WALL && t !== T.WATER && t !== T.DEEP;
  const rowOpen = (ty) => { let n = 0; for (let tx = x; tx < x + w; tx++) if (openT(tileAt(tx, ty))) n++; return n >= w * 0.5; };
  // its front: its door's side; with no door, a back's north side, or the side on a street (a split tower's back block
  // stands behind the tower's front on the street north of it)
  const frontN = b.door ? b.door.ty < y : !!b.back || (!rowOpen(y + h) && rowOpen(y - 1));
  const backOpen = frontN ? rowOpen(y + h) : rowOpen(y - 1);
  // what must stay on the building's own front: its door, its POIs, its signs, its home's door; the props on the wall
  const pins = [];
  const keep = [];
  if (b.door) keep.push(b.door.tx);
  for (const p of m.pois) if (p && p.b === b.id) keep.push(Math.floor(p.x / TILE));
  for (const s of b.signs || []) keep.push(Math.floor(s.x / TILE));
  const fy = frontN ? y - 1 : y + h;
  for (const k of [fy - 1, fy, fy + 1]) for (const px of attach.get(k) || []) if (px >= x - 1 && px < x + w + 1) pins.push(Math.floor(px));
  const k0 = keep.length ? Math.min(...keep) : null, k1 = keep.length ? Math.max(...keep) + 1 : null;
  // ---- the columns along the front: [x, w] cells with alleys [x, g] between (an alley never cuts the building's own
  // front span or opens behind a wall's prop)
  const cols = [], alleys = [];
  const blocked = (a, g) => (k0 !== null && a < k1 + 2 && a + g > k0 - 2) || pins.some((px) => px >= a - 1 && px <= a + g);
  if (w >= 19) {
    let at = x, k = 0;
    for (;;) {
      const g = r(40 + k) < 0.3 ? 4 : 3, rem = x + w - at;
      if (rem <= 16) break;
      let a = at + Math.min(OPEN3.cell[0] + Math.floor(r(50 + k) * (OPEN3.cell[1] - OPEN3.cell[0] + 1)), rem - g - 7);
      while (a + g + 6 <= x + w && blocked(a, g)) a++;
      if (a + g + 6 > x + w) break;
      cols.push([at, a - at]); alleys.push([a, g]); at = a + g; k++;
    }
    cols.push([at, x + w - at]);
  } else cols.push([x, w]);
  // ---- the rows from the front: [depth from the front, depth] with the lane or passage behind each (from the rows alone)
  const rr = (k) => hash2(y * 7 + h, k, 2741 + (frontN ? 1 : 0));
  const rows = [];
  if (h <= OPEN3.rows) rows.push([0, h, 0]);
  else {
    let fd = 10 + Math.floor(rr(1) * 5), gl = OPEN3.lane[0] + Math.floor(rr(2) * (OPEN3.lane[1] - OPEN3.lane[0] + 1));
    if (h - fd - gl < 8) { gl = Math.max(4, Math.min(gl, h - 17)); fd = h - gl - 8; }
    if (fd < 9) rows.push([0, h, 0]);
    else {
      rows.push([0, fd, gl]);
      let at = fd + gl, k = 3;
      while (h - at > 22) {
        const pg = 4 + Math.floor(rr(k + 1) * 2);
        let rd = 10 + Math.floor(rr(k) * 5);
        if (h - at - rd - pg < 8) rd = h - at - pg - 8;   // (the last row 8 deep at least, and never over 22)
        rows.push([at, rd, pg]); at += rd + pg; k += 2;
      }
      rows.push([at, h - at, 0]);
    }
  }
  if (cols.length === 1 && rows.length === 1) return null;   // (too narrow and too shallow to cut: left as it is)
  // depth from the front -> tile rows
  const tyOf = (d, dd) => (frontN ? y + d : y + h - d - dd);
  // ---- which cells stay open: a back row's cells now and then (never two side by side), a dead-end alley's yard at its
  // end, a pocket courtyard in a long single row
  const yard = new Set(), last = rows.length - 1;
  if (rows.length > 1) {
    for (let j = 1; j < rows.length; j++) cols.forEach((c, i) => { if (r(70 + j * 13 + i) < 0.28 && !yard.has(`${j},${i - 1}`)) yard.add(`${j},${i}`); });
    if (!backOpen) alleys.forEach((a, i) => { if (!yard.has(`${last},${i}`) && !yard.has(`${last},${i + 1}`)) yard.add(`${last},${r(90 + i) < 0.5 ? i : i + 1}`); });
  } else if (cols.length >= 4 && r(95) < 0.7) {
    const i = 1 + Math.floor(r(96) * (cols.length - 2));
    yard.add(`0,${i}`);
  }
  // the building's own cell: the front row's column over its front span (else the first)
  let ki = 0;
  if (k0 !== null) { const i = cols.findIndex(([cx, cw]) => k0 >= cx && k0 < cx + cw); if (i >= 0) ki = i; }
  yard.delete(`0,${ki}`);
  // ---- the ground: the alleys, the lanes and passages paved (people walk them: shared/map.js T.PLAZA), the yards
  const pave = (tx, ty, tw, th, t) => { for (let yy = ty; yy < ty + th; yy++) for (let xx = tx; xx < tx + tw; xx++) { const i = m.idx(xx, yy); m.tiles[i] = t; m.bld[i] = -1; opened.add(i); } };
  const g0 = gritOf(D);
  for (const [ax, g] of alleys) { pave(ax, y, g, h, T.PLAZA); m.openAlleys.push({ x: ax, y, w: g, h, ns: 1, d: d0 }); }
  for (const [dd, rd, gap] of rows) if (gap) { const ty = frontN ? y + dd + rd : y + h - dd - rd - gap; pave(x, ty, w, gap, T.PLAZA); m.openAlleys.push({ x, y: ty, w, h: gap, ns: 0, d: d0 }); }
  // ---- the cells
  const RK = st === 'oldtown' || st === 'arts' ? ['tar', 'gravel', 'tar'] : ['tar', 'gravel'];
  const arches = ARCHES[st] || ARCHES.commercial;
  let made = 0, yards = 0, lastArch = null, lastFl = 0;
  const oldX = b.tx;
  rows.forEach(([dd, rd], j) => cols.forEach(([cx, cw], i) => {
    const ty = tyOf(dd, rd), key = `${j},${i}`;
    if (yard.has(key)) { openYard(m, H3, cx, ty, cw, rd, j === 0, g0, r(200 + j * 17 + i), pave, frontN); yards++; return; }
    if (j === 0 && i === ki) {
      // the building keeps its front cell: id, name, art, door, delivery stop, home
      b.tx = cx; b.tw = cw; b.ty = ty; b.th = rd;
      if (b.roof >= 0 && m.roofs[b.roof]) Object.assign(m.roofs[b.roof], { tx: cx, ty, tw: cw, th: rd });
      if (b.prefab >= 0 && m.prefabs[b.prefab]) { const pf = m.prefabs[b.prefab], fr = frontN ? 0 : Math.max(0, pf.th - h); m.prefabs[b.prefab] = { ...pf, tx: cx, tw: cw, ty, th: rd + fr, solid: [0, 0, cw, rd] }; }
      if (b.art && b.art.shop && typeof b.art.shop.door === 'number') b.art.shop = { ...b.art.shop, door: Math.max(6, Math.min(cw * TILE - 30, b.art.shop.door + (oldX - cx) * TILE)) };
      if (b.art && b.art.spec) {
        const S = b.art.spec, dx = (oldX - cx) * TILE, W = cw * TILE;
        if (Array.isArray(S.windows)) S.windows = S.windows.map((q) => q + dx).filter((q) => q >= 6 && q + 16 <= W - 6);
        if (Array.isArray(S.doors)) S.doors = S.doors.map((q) => ({ ...q, x: q.x + dx })).filter((q) => q.x >= 0 && q.x + q.w <= W);
      }
      b.openKept = true;
      return;
    }
    // a new building of the district's kinds, never two of a kind or a height side by side
    let arch = arches[Math.floor(r(300 + j * 31 + i) * arches.length) % arches.length];
    if (arch === lastArch) arch = arches[(arches.indexOf(arch) + 1) % arches.length];
    lastArch = arch;
    // what its south face (the camera's) looks onto, and the lane north of it (a tall one would hide it): the front row
    // stays low behind a lane, so the lane and the backs across it show
    const face = frontN ? (j < last ? 'lane' : backOpen ? 'street' : 'closed') : j === 0 ? 'street' : 'lane';
    const gapN = frontN ? (j > 0 ? rows[j - 1][2] : 0) : rows[j][2];
    let lo = 2, hi = gapN ? (gapN >= 7 ? 3 : 2) : st === 'towers' || st === 'civic' ? 5 : 4;
    if (frontN && j === 0) hi = Math.min(hi, st === 'towers' || st === 'civic' ? 4 : 3);   // (its wall drawn up over the street north of it)
    if (arch === 'townhouse' || arch === 'beachblock') hi = Math.min(hi, 3);
    let fl = lo + Math.floor(r(400 + j * 31 + i) * (hi - lo + 1));
    if (fl === lastFl && hi > lo) fl = fl === hi ? fl - 1 : fl + 1;
    lastFl = fl;
    const back = face === 'closed' || (face === 'lane' && r(500 + j * 31 + i) < 0.55);
    const bid = m.buildings.length;
    m.roofs.push({ tx: cx, ty, tw: cw, th: rd, kind: RK[Math.floor(r(600 + j * 31 + i) * RK.length) % RK.length], seed: Math.floor(hash2(cx, ty, 2771) * 1e9), d: d0, b: bid });
    m.buildings.push({ id: bid, prefab: -1, roof: m.roofs.length - 1, tx: cx, ty, tw: cw, th: rd, kind: 'roof', arch, name: 'Building', business: null, signs: [], fl: [fl, fl], openOf: b.id, ...(back ? { back: true } : {}) });
    for (let yy = ty; yy < ty + rd; yy++) for (let xx = cx; xx < cx + cw; xx++) m.bld[m.idx(xx, yy)] = bid;
    made++;
  }));
  // ---- the alleys come alive (the solid kit; the rest is the art's: shared/alleys.js)
  alleys.forEach(([ax, g], i) => dressAlley(m, H3, ax, y, g, h, frontN, backOpen, g0, (k) => r(700 + i * 23 + k)));
  rows.forEach(([dd, rd, gap], j) => { if (!gap) return; const ty = frontN ? y + dd + rd : y + h - dd - rd - gap; dressLane(m, H3, x, ty, w, gap, g0, (k) => r(800 + j * 23 + k)); });
  return { made, alleys: alleys.length + rows.filter((q) => q[2]).length, yards, tiles: w * h };
}

// an N-S alley (ax, y, g wide, h long): a dumpster against a wall toward the back, a wall lamp at the mouth on the
// street side, string lights across it now and then (not down the rough districts'), a steam vent
function dressAlley(m, H3, ax, y, g, h, frontN, backOpen, grit, r) {
  const deep = frontN ? y + h - 2.5 : y + 2.5, side = r(1) < 0.5 ? 0 : 1, wx = side ? ax + g - 0.85 : ax + 0.85;
  if (h >= 10) prop(m, H3, ['dump_g', 'dump_b', 'dump_g', 'dump_o'][Math.floor(r(2) * 4)], wx, backOpen ? (y + h / 2) : deep, 10);
  if (h >= 14 && r(3) < 0.55) prop(m, H3, r(4) < 0.5 ? 'pallet_s' : 'crates', side ? ax + 0.8 : ax + g - 0.8, y + h * (0.3 + r(5) * 0.4), 0);
  if (r(6) < 0.4) prop(m, H3, 'steamvent', side ? ax + 0.6 : ax + g - 0.6, y + h * (0.25 + r(7) * 0.5), 0);
  if (grit < 0.85 && r(8) < 0.32) for (let k = 0; k < Math.min(3, Math.floor(h / 8)); k++) prop(m, H3, 'festoon', ax + 0.1, y + 3 + k * 6 + r(9 + k) * 2, 0, { tx: Math.round((g - 0.2) * TILE), ty: Math.round((r(12 + k) - 0.5) * TILE), h: 72, ends: ['wall', 'wall'] });
}
// a lane or a passage across the block (x, y, w long, g deep): back-door lamps on its north wall (the backs' faces), a
// dumpster or two, now and then string lights from wall to wall
function dressLane(m, H3, x, y, w, g, grit, r) {
  const n = Math.max(1, Math.floor(w / 18));
  for (let k = 0; k < n; k++) {
    const px = x + 4 + (k + r(k)) * (w - 8) / n;
    prop(m, H3, ['dump_g', 'dump_b', 'pallet_s', 'dump_g'][Math.floor(r(20 + k) * 4)], px, y + 0.9, 10);
    if (g >= 5 && r(40 + k) < 0.5) prop(m, H3, 'plamp', px + 2.5, y + 0.15, 0, { wall: true, a: Math.PI / 2 });
  }
  if (grit < 0.85 && g >= 4 && r(60) < 0.4) prop(m, H3, 'festoon', x + 3 + r(61) * (w - 12), y + 0.2, 0, { tx: Math.round(6 * TILE), ty: Math.round((g - 0.6) * TILE), h: 70, ends: ['wall', 'wall'] });
}
// a cell left open: a courtyard (paving, a tree, benches, planters, string lights) or a back lot (asphalt, dumpsters,
// pallets, crates; tires and a drum in the rough districts)
function openYard(m, H3, x, y, w, h, front, grit, u, pave, frontN) {
  const court = front || u < 0.55 - 0.3 * grit;
  pave(x, y, w, h, court ? T.PLAZA : T.LOT);
  m.openYards.push({ x, y, w, h, k: court ? 'court' : 'lot' });
  const cx = x + w / 2, cy = y + h / 2, hz = (k) => hash2(x + k, y - k, 2791);
  if (court) {
    if (w >= 6 && h >= 6) prop(m, H3, hz(1) < 0.5 ? 'tree_a' : 'tree_b', cx + (hz(2) - 0.5) * 2, cy + (frontN ? 1 : -1), 12, { sp: ['maple', 'streetPl', 'magnolia', 'cherry', 'olive'][Math.floor(hz(3) * 5)], k: 0.95 + hz(4) * 0.2 });
    for (const s of [-1, 1]) if (w >= 7) prop(m, H3, 'bench_m', cx + s * (w / 2 - 1.6), cy + 1, 0);
    prop(m, H3, ['planter_g', 'planter_sq', 'planter_fl'][Math.floor(hz(5) * 3)], x + 1.2, frontN ? y + h - 1.2 : y + 1.2, 8);
    prop(m, H3, ['planter_g', 'planter_sq', 'potted'][Math.floor(hz(6) * 3)], x + w - 1.2, frontN ? y + h - 1.2 : y + 1.2, 8);
    if (grit < 0.9 && hz(7) < 0.6) prop(m, H3, 'festoon', x + 0.6, y + 1.5, 0, { tx: Math.round((w - 1.2) * TILE), ty: Math.round((h - 3) * TILE * 0.5), h: 74, ends: ['wall', 'wall'] });
    if (!front && hz(8) < 0.5) prop(m, H3, 'plamp', cx, frontN ? y + h - 0.15 : y + 0.15, 0, { wall: true, a: frontN ? -Math.PI / 2 : Math.PI / 2 });
  } else {
    const n = Math.max(1, Math.floor(w / 6));
    for (let k = 0; k < n; k++) prop(m, H3, ['dump_g', 'dump_b', 'dump_o'][Math.floor(hz(10 + k) * 3)], x + 2 + k * (w - 4) / Math.max(1, n - 1 || 1), y + 1, 10);
    prop(m, H3, 'pallet_s', x + 1.5, y + h - 1.5, 0); prop(m, H3, 'crates', x + w - 1.6, y + h - 1.6, 0);
    if (grit > 0.6) { prop(m, H3, 'tires', x + w - 1.5, y + h / 2, 0); if (hz(12) < 0.5) prop(m, H3, 'drum', x + 1.4, y + h / 2, 8); }
    else if (hz(13) < 0.5) prop(m, H3, 'acunit', x + w / 2, y + 0.8, 8);
  }
}
// street dice down a few of the grittier districts' new lanes and back lots (GM8; m.diceSpots: activities.js plays the
// crew's game there), at most one a district and FOUR in all, far apart, dressed like Southside's: crates to sit on, a
// lamp on the wall, trash by it
function diceDown(m, H3) {
  const spots = (m.diceSpots ||= []), byD = new Set();
  let n = 0;
  const dOf = (a) => (a.d !== undefined ? a.d : m.dist[m.idx(a.x + (a.w >> 1), a.y + (a.h >> 1))]);
  const L = [...m.openAlleys.filter((a) => !a.ns && a.w >= 16 && a.h >= 5), ...m.openYards.filter((a) => a.k === 'lot' && a.w >= 8 && a.h >= 8)].map((a) => ({ a, k: hash2(a.x, a.y, 2811) })).sort((p, q) => p.k - q.k);
  for (const { a } of L) {
    if (n >= 4) break;
    const d = dOf(a), D = DISTRICTS[d];
    if (!D || gritOf(D) < 0.45 || byD.has(d)) continue;
    const x = (a.x + a.w / 2) * TILE, y = (a.y + a.h) * TILE - 14;
    if (spots.some((s) => Math.abs(s.x - x) < 60 * TILE && Math.abs(s.y - y) < 60 * TILE)) continue;
    spots.push({ x: Math.round(x), y: Math.round(y), a: 0, ix: 0, iy: -1, name: D.name, open: 1 });
    prop(m, H3, 'crates', x / TILE + 2.2, a.y + a.h - 0.5, 0); prop(m, H3, 'crates', x / TILE - 2.4, a.y + a.h - 0.5, 0);
    prop(m, H3, 'bags', x / TILE + 4.2, a.y + a.h - 0.45, 0);
    prop(m, H3, 'plamp', x / TILE, a.y + 0.15, 0, { wall: true, a: Math.PI / 2 });
    byD.add(d); n++;
  }
  return n;
}
