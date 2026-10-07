// World v2: the streets of Metro City (docs/WORLD-V2.md, stage 1). The island keeps its skeleton - the
// elevated ring highway with its frontage roads, the avenues that cross under it and carry on over the
// bridges, Broadway on the diagonal, Bayside Heights' crescents, Pine Hills' winding drives - but the
// uniform grid between the avenues is gone. Each district lays its own streets between them:
//  * the blocks are real-sized and every one is different: the east-west streets (and so the block
//    depths) are spaced by the district's pattern, and every row of blocks picks its own north-south
//    streets - some carry straight on, some jog, most stop at a T - so block lengths vary and long rows
//    of buildings run between the side streets. Junctions along a street are either one crossroads or
//    at least MINSEP apart (a jog of a few metres is two sets of lights whose queues lock each other):
//    streets across an avenue line up with the ones on the other side or keep clear of them;
//  * deep blocks get a service alley along the middle, behind the two rows of buildings (the south row
//    fronts the street below it, facing the camera; the north row backs onto the alley), long ones now
//    and then a passage through; downtown and the civic quarter leave the odd block open as a plaza;
//  * Old Town's lanes are narrow and wander (no two parallel), with small squares where they meet.
// Units: tiles unless a name says px. Roads with an odd width in tiles (avenues 9, alleys 3) run along
// tile centres (x.5), even ones (streets 6, lanes 4) along tile edges, so the tile raster is exactly as
// wide as the road drawn over it. Deterministic: every choice is a hash of where it is.
import { TILE } from './constants.js';
import { clipLine } from './citylayout.js';
import { dsin } from './dmath.js';

const T = (v) => v * TILE;
function hash(x, y, seed) {
  let h = (Math.imul(Math.round(x * 4) | 0, 374761393) + Math.imul(Math.round(y * 4) | 0, 668265263) + Math.imul(seed | 0, 2147483647)) | 0;
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
const lerp = (a, b, t) => a + (b - a) * t;

// The avenues (two lanes each way, a median): north-south ones cross the whole island and carry on over
// the bridges (868 and 958 south over the river, 958 north to Northshore, 688 south to Cedar Isle),
// east-west ones run from coast to coast (556 is the Bay Bridge's way into town). bow: a gentle curve,
// amp tiles at its middle, between x0 and x1 (North Boulevard sweeps south through the core, High
// Street follows the Old Town shore); from: where one starts - at a junction already there, not a few
// metres off it (Central Avenue at the frontage road north of the ring rather than on at Coast Drive;
// North Boulevard where Cedar Avenue meets the inner frontage road, beside: though the highway's
// corner is right there).
export const AVES_X = [
  { x: 598.5, name: 'Shore Avenue' }, { x: 688.5, name: 'Cedar Avenue' }, { x: 774.5, name: 'Central Avenue', from: 410 },
  { x: 868.5, name: 'Bridge Avenue', bridge: true }, { x: 958.5, name: 'Northbridge Avenue', bridge: true },
];
export const AVES_Y = [
  { y: 380.5, name: 'High Street', from: 770, bow: { amp: -4, x0: 770, x1: 1047 } },
  { y: 476.5, name: 'North Boulevard', kind: 'blvd', from: 688.5, beside: true, bow: { amp: 7, x0: 688.5, x1: 1010 } },
  { y: 556.5, name: 'Bay Avenue' },
  { y: 724.5, name: 'Southside Avenue' }, { y: 808.5, name: 'Dock Avenue' },
];
// (dsin: the same bits in every engine - BROADWAY below is worked out when this module loads, outside generateCity's
// deterministic maths: shared/dmath.js)
export const aveY = (a, x) => (a.bow && x > a.bow.x0 && x < a.bow.x1 ? a.y + a.bow.amp * dsin(Math.PI * (x - a.bow.x0) / (a.bow.x1 - a.bow.x0)) : a.y);
const CURVED = new Map(AVES_Y.filter((a) => a.bow).map((a) => [a.y, (x) => aveY(a, x)]));
// Through streets that aren't avenues: Harbor Street (Old Town's way to the Harbor Bridge north, and on
// south through Southside) and the two streets round Greenfield Park.
const THROUGH = [
  { pts: [[1018, 220], [1018, 920]], name: 'Harbor Street' },
  { pts: [[748, 556.5], [748, 650]], name: 'Park Lane' },
  { pts: [[688.5, 580], [774.5, 580]], name: 'Park Street' },
];
// The hero corner: the crossroads of two streets in Midtown that the art targets show (docs/art-v2/targets R1, AT1,
// AT2: the diner with the coffee-cup neon, the corner mart with its striped awning, the brick walk-up with the fire
// escapes). The plan lays a crossroads here even where its own draws would run past (map.js buildHeroCorner dresses
// the four corners). Tiles: x on a tile edge (a street is 6 wide), y the line Madison Street runs along.
export const HERO = { x: 724, y: 519.5 };
// Broadway: the diagonal boulevard through the core, from the park corner up to the Civic Center. It
// bends at the avenue crossings it meets and goes straight through them (a big square where three
// roads cross) - a diagonal that missed them by a few metres would leave three sets of lights round a
// tiny triangle, and their queues would lock each other solid.
const NORTH_BLVD = AVES_Y.find((a) => a.name === 'North Boulevard');
export const BROADWAY = [[748, 580], [774.5, 556.5], [868.5, aveY(NORTH_BLVD, 868.5)], [914, 429]];

// District street patterns. depth: spacing of the east-west streets (centre to centre), len: of the
// north-south ones; through: chance a north-south street carries straight on across the next street
// (else a new one starts somewhere else: a T-junction), jog: chance one that carries on is offset (by
// 14-20 tiles); alley: chance of a service alley along a block at least alleyMin deep; passage: chance of a
// north-south alley through a block at least passMin long; plaza: chance a block is left open; wobble:
// how far (tiles) the lanes wander; lane: the street kind ('minor' = a narrow lane).
export const PATTERNS = {
  towers: { depth: [36, 46], len: [46, 72], through: 0.55, jog: 0.2, alley: 1, alleyMin: 58, passage: 0.25, passMin: 62, plaza: 0.12 },
  civic: { depth: [40, 52], len: [50, 80], through: 0.6, jog: 0.2, alley: 0.6, alleyMin: 50, passage: 0.15, passMin: 70, plaza: 0.2 },
  commercial: { depth: [38, 48], len: [44, 80], through: 0.45, jog: 0.3, alley: 0.95, alleyMin: 36, passage: 0.3, passMin: 60, plaza: 0.04 },
  nightlife: { depth: [34, 44], len: [40, 70], through: 0.4, jog: 0.35, alley: 1, alleyMin: 32, passage: 0.35, passMin: 54, plaza: 0.05 },
  redlight: { depth: [32, 42], len: [38, 66], through: 0.4, jog: 0.35, alley: 1, alleyMin: 30, passage: 0.35, passMin: 52, plaza: 0.03 },
  apartments: { depth: [36, 46], len: [42, 72], through: 0.5, jog: 0.3, alley: 0.85, alleyMin: 36, passage: 0.2, passMin: 60, plaza: 0.03 },
  oldtown: { depth: [24, 32], len: [22, 40], through: 0.3, jog: 0.45, alley: 0.1, alleyMin: 30, passage: 0.1, passMin: 38, plaza: 0.12, wobble: 2.6, lane: 'minor' },
  southside: { depth: [32, 40], len: [34, 60], through: 0.5, jog: 0.3, alley: 0.85, alleyMin: 30, passage: 0.3, passMin: 50, plaza: 0 },
  beach: { depth: [34, 44], len: [44, 76], through: 0.5, jog: 0.25, alley: 0.4, alleyMin: 36, passage: 0.1, passMin: 60, plaza: 0.05 },
  industrial: { depth: [44, 64], len: [56, 96], through: 0.7, jog: 0.1, alley: 0, alleyMin: 99, passage: 0, passMin: 999, plaza: 0 },
  factory: { depth: [44, 64], len: [56, 96], through: 0.7, jog: 0.1, alley: 0, alleyMin: 99, passage: 0, passMin: 999, plaza: 0 },
  harbor: { depth: [44, 64], len: [56, 96], through: 0.6, jog: 0.15, alley: 0, alleyMin: 99, passage: 0, passMin: 999, plaza: 0 },
};

// Where the local streets are laid: areas cut into cells by the avenues and through streets (their
// edges are road centre lines or the island's own limits; the clip test keeps everything on land, off
// the highway band, out of the park, the river and the districts that keep their own street plans).
const AREAS = [
  { name: 'innerNW', xs: [668, 688.5, 774.5], ys: [450, 476.5, 556.5] },
  { name: 'innerSW', xs: [688.5, 748, 774.5], ys: [556.5, 580, 634] },
  { name: 'inner', xs: [774.5, 868.5, 958.5, 1002], ys: [450, 476.5, 556.5, 634] },
  { name: 'oldtown', xs: [770, 868.5, 958.5, 1018, 1047], ys: [292, 380.5, 410] },
  { name: 'northwest', xs: [600, 688.5, 774.5], ys: [384, 452] },
  { name: 'west', xs: [556, 598.5, 630], ys: [428, 476.5, 556.5, 664] },
  { name: 'south', xs: [628, 688.5, 748, 774.5, 868.5, 904], ys: [668, 756] },
  { name: 'southside', xs: [920, 958.5, 1018, 1047], ys: [584, 724.5, 808.5, 922] },
];

const EW_NAMES = ['Market', 'Union', 'Grand', 'Spring', 'Commerce', 'Pearl', 'Jefferson', 'Madison', 'Franklin', 'Liberty', 'Mercer', 'Hudson', 'Canal', 'Bleecker',
  'Fulton', 'Water', 'Front', 'King', 'Queen', 'Charter', 'Mint', 'Bond', 'Clay', 'Garden', 'Mill', 'Chapel', 'Church', 'Bank', 'Exchange', 'Wall', 'Court', 'Temple'];
const NS_NAMES = ['Elm', 'Oak', 'Maple', 'Cedar', 'Pine', 'Walnut', 'Cherry', 'Birch', 'Ash', 'Willow', 'Poplar', 'Laurel', 'Hazel', 'Linden', 'Spruce', 'Juniper',
  'Alder', 'Chestnut', 'Hawthorn', 'Rowan', 'Sycamore', 'Magnolia', 'Olive', 'Myrtle', 'Holly', 'Ivy', 'Sage', 'Aspen'];

// ctx: { m, Z, BAND, at(x, y) -> tile index or -1, inPark(x, y), lines }. Pushes the lines; returns
// { aves: avenue lines (for the ramps), westEnd, northEnd(x), southEnd(x), plazas: [{ x0, y0, x1, y1 }] }.
export function metroRoads(ctx) {
  const { m, Z, BAND, at, inPark, lines } = ctx;
  const styleAt = (x, y) => { const i = at(x, y); return i < 0 ? null : ctx.styleOf(m.dist[i]); };
  // avenues: across the island, under the highway, over the river bridges
  const okAve = (vertical, bridge, beside) => (x, y) => {
    const i = at(x, y);
    if (i < 0) return false;
    if (!m.land[i]) return vertical && bridge && !!m.river[i];
    const z = m.zone[i];
    if (z !== Z.CITY && z !== Z.SOUTH) return false;
    if (m.distSea[i] < 8 * 4) return false;
    if (m.distRiver[i] < 6 * 4 && !(vertical && bridge)) return false;
    if (inPark(x, y)) return false;
    if (!beside && m.ringD[i] < BAND + 13 && ctx.ringH[i] === (vertical ? 2 : 1)) return false; // never alongside the highway
    if (z === Z.SOUTH) return vertical && bridge ? true : m.dist[i] === 6;
    return true;
  };
  // local streets: stop at the frontage roads, keep off the coast and river drives
  const okLocal = (vertical) => (x, y) => {
    const i = at(x, y);
    if (i < 0 || !m.land[i] || m.river[i] || m.lake[i]) return false;
    const z = m.zone[i];
    if (z !== Z.CITY && z !== Z.SOUTH) return false;
    if (m.distSea[i] < 8 * 4 || m.distRiver[i] < 6 * 4) return false;
    if (inPark(x, y)) return false;
    const rd = m.ringD[i];
    if (rd < BAND + 1) return false;
    if (rd < BAND + 13 && ctx.ringH[i] === (vertical ? 2 : 1)) return false;
    const d = m.dist[i];
    if (!ctx.gridded(d)) return false; // Bayside's crescents, Pine Hills' drives, the park keep their own plans
    return z !== Z.SOUTH || d === 6;
  };
  const aves = [];
  const vEnds = new Map();
  for (const a of AVES_X) {
    for (const pts of clipLine([{ x: T(a.x), y: T(a.from || 200) }, { x: T(a.x), y: T(930) }], okAve(true, !!a.bridge), 8 * TILE)) {
      const l = { pts, kind: 'ave', lvl: 0, name: a.name, vx: a.x };
      lines.push(l); aves.push(l);
      if (!vEnds.has(a.x)) vEnds.set(a.x, []);
      vEnds.get(a.x).push(l);
    }
  }
  let westEnd = null;
  for (const a of AVES_Y) {
    const line = [];
    for (let x = a.from || 520; x <= 1060; x += 4) line.push({ x: T(x), y: T(aveY(a, x)) });
    for (const pts of clipLine(line, okAve(false, false, !!a.beside), 8 * TILE)) {
      const l = { pts, kind: a.kind || 'ave', lvl: 0, name: a.name, hy: a.y };
      lines.push(l); aves.push(l);
      if (a.y === 556.5 && (!westEnd || pts[0].x < westEnd.x)) westEnd = pts[0];
    }
  }
  for (const t of THROUGH) {
    const vertical = t.pts[0][0] === t.pts[1][0];
    for (const pts of clipLine(t.pts.map(([x, y]) => ({ x: T(x), y: T(y) })), okLocal(vertical), 8 * TILE)) {
      const l = { pts, kind: 'st', lvl: 0, name: t.name, vx: vertical ? t.pts[0][0] : undefined };
      lines.push(l);
      if (vertical) { if (!vEnds.has(t.pts[0][0])) vEnds.set(t.pts[0][0], []); vEnds.get(t.pts[0][0]).push(l); }
    }
  }
  // Broadway, between the frontage roads at either end
  for (const p of clipLine(BROADWAY.map(([x, y]) => ({ x: T(x), y: T(y) })), (x, y) => { const i = at(x, y); return i >= 0 && !!m.land[i] && m.ringD[i] >= BAND - 1 && m.zone[i] === Z.CITY && !inPark(x, y); }, 8 * TILE, 8)) {
    const l = { pts: p, kind: 'blvd', lvl: 0, name: 'Broadway' };
    lines.push(l); aves.push(l);
  }
  const bwY = (x) => { for (let k = 0; k + 1 < BROADWAY.length; k++) { const [x0, y0] = BROADWAY[k], [x1, y1] = BROADWAY[k + 1]; if (x >= x0 && x <= x1) return lerp(y0, y1, (x - x0) / (x1 - x0)); } return null; };

  // Junctions already laid along each street line - 'x<x>': the ys where streets meet the north-south
  // line x, 'y<y>': the xs where streets meet the east-west line y (an avenue's are shared by the cells
  // either side of it). A new street meets a line either right at a junction already there (a
  // crossroads) or well clear of it: two sets of lights a few metres apart lock each other's queues.
  const MINSEP = 14, BWSEP = 20; // tiles between junctions along a street; clear of Broadway's wide diagonal crossings
  const ends = new Map();
  const endsOn = (key) => { let l = ends.get(key); if (!l) ends.set(key, (l = [])); return l; };
  const clearOf = (keys, v) => keys.every((key) => endsOn(key).every((e) => Math.abs(e.v - v) < 0.5 || Math.abs(e.v - v) >= MINSEP));
  // where a street wants to be if that fits, else the nearest that does of: lined up with a junction
  // near there, pushed clear of it, pushed clear of Broadway
  const settle = (want, keys, bw, fits) => {
    const near = keys.flatMap((key) => endsOn(key)).filter((e) => Math.abs(e.v - want) < MINSEP);
    const tries = [want, ...near.flatMap((e) => [e.v, e.v - MINSEP, e.v + MINSEP]), ...bw.flatMap((b) => [b - BWSEP, b + BWSEP])];
    return tries.sort((a, b) => Math.abs(a - want) - Math.abs(b - want)).find(fits) ?? null;
  };
  const named = (list, v) => { const e = list.find((q) => Math.abs(q.v - v) < 0.5 && q.name); return e ? e.name : null; };

  const plazas = [];
  let nEW = 0, nNS = 0;
  for (const A of AREAS) for (let ci = 0; ci + 1 < A.xs.length; ci++) for (let cj = 0; cj + 1 < A.ys.length; cj++) {
    const cell = { x0: A.xs[ci], x1: A.xs[ci + 1], y0: A.ys[cj], y1: A.ys[cj + 1], seed: ci * 31 + cj * 7 + A.name.length * 101 };
    const midX = (cell.x0 + cell.x1) / 2;
    const P = (x, y) => PATTERNS[styleAt(x, y)] || null;
    const P0 = P(midX, (cell.y0 + cell.y1) / 2) || P(midX, cell.y0 + 12) || P(midX, cell.y1 - 12);
    if (!P0) continue;
    // the park keeps its square: no streets in the cell it fills
    if (inPark(midX, (cell.y0 + cell.y1) / 2) && inPark(cell.x0 + 10, (cell.y0 + cell.y1) / 2)) continue;
    const sides = ['x' + cell.x0, 'x' + cell.x1];
    const curveY = (y, x) => { const f = CURVED.get(y); return f ? f(x) : y; };
    // the cell's corners are junctions on its sides too (an avenue crossing, a through street's end)
    for (const x of [cell.x0, cell.x1]) for (const y of [cell.y0, cell.y1]) { endsOn('x' + x).push({ v: curveY(y, x) }); endsOn('y' + y).push({ v: x }); }
    // 1. east-west streets: block depths by the district's pattern; the last block takes what's left
    const bwSide = [cell.x0, cell.x1].map(bwY).filter((v) => v !== null);
    const ys = [cell.y0], ewNames = [null];
    for (let y = cell.y0, k = 0; k < 12; k++) {
      const p = P(midX, y + 16) || P0;
      const lo = p.depth[0] * 0.72;
      let want = y + Math.round(lerp(p.depth[0], p.depth[1], hash(midX, y, cell.seed + 11)));
      if (HERO.x > cell.x0 && HERO.x < cell.x1 && HERO.y > y && HERO.y < cell.y1 && Math.abs(want - HERO.y) <= 12) want = HERO.y;   // (the hero corner's street)
      if (cell.y1 - want < lo) break;
      const ny = settle(want, sides, bwSide, (v) => v - y >= lo && cell.y1 - v >= lo && bwSide.every((b) => Math.abs(b - v) >= BWSEP) && clearOf(sides, v));
      if (ny === null) break;
      // across an avenue from a street already there: the same street carries on
      ewNames.push(named(endsOn(sides[0]), ny) || named(endsOn(sides[1]), ny) || `${EW_NAMES[(nEW++ + Math.floor(ny)) % EW_NAMES.length]} Street`);
      ys.push(ny); y = ny;
    }
    ys.push(cell.y1);
    for (let k = 1; k + 1 < ys.length; k++) for (const s of sides) endsOn(s).push({ v: ys[k], name: ewNames[k] });
    const wob = (seed, v, amp, lam) => (amp ? amp * (0.62 * Math.sin(v / lam * Math.PI * 2 + hash(seed, 1, 5) * 6.28) + 0.38 * Math.sin(v / (lam * 0.47) * Math.PI * 2 + hash(seed, 2, 5) * 6.28)) : 0);
    // the east-west street k at x (Old Town's lanes wander - though they meet the avenues square, where
    // the streets across line up with them; a curving avenue along the cell's edge curves)
    const edgeY = (k, x) => curveY(ys[k], x);
    const settleIn = (x) => Math.max(0, Math.min(1, (x - cell.x0) / 8, (cell.x1 - x) / 8));
    const ewY = (k, x) => (k === 0 || k === ys.length - 1 ? edgeY(k, x) : ys[k] + wob(ys[k] * 13 + cell.seed, x, (P(x, ys[k]) || P0).wobble || 0, 38) * settleIn(x));
    const ewKind = (k) => ((P(midX, ys[k]) || P0).lane || 'st');
    for (let k = 1; k + 1 < ys.length; k++) {
      const pts = [];
      for (let x = cell.x0; x <= cell.x1 + 0.01; x += 2) pts.push({ x: T(Math.min(x, cell.x1)), y: T(ewY(k, Math.min(x, cell.x1))) });
      if (pts[pts.length - 1].x < T(cell.x1)) pts.push({ x: T(cell.x1), y: T(ewY(k, cell.x1)) });
      for (const piece of clipLine(pts, okLocal(false), 6 * TILE, 12)) lines.push({ pts: piece, kind: ewKind(k), lvl: 0, name: ewNames[k] });
    }
    // where Broadway crosses east-west street k (null: it doesn't, in this cell)
    const bwCross = (k) => {
      let px = null, pd = null;
      for (let x = cell.x0; x <= cell.x1 + 0.01; x += 1) {
        const by = bwY(x);
        const d = by === null ? null : by - ewY(k, x);
        if (d !== null && pd !== null && (d === 0 || (d < 0) !== (pd < 0))) return lerp(px, x, pd / (pd - d));
        px = x; pd = d;
      }
      return null;
    };
    // 2. each row of blocks picks its own north-south streets
    for (let k = 0; k + 1 < ys.length; k++) {
      const ya = ys[k], yb = ys[k + 1], ym = (ya + yb) / 2;
      const lns = ['y' + ya, 'y' + yb];
      const bwRow = [bwCross(k), bwCross(k + 1)].filter((v) => v !== null);
      // the streets that reach the row's north side from above (the row above, or across the avenue)
      const prev = endsOn(lns[0]).filter((e) => e.v > cell.x0 + 0.5 && e.v < cell.x1 - 0.5);
      const xsRow = [];
      let hero = HERO.x > cell.x0 && HERO.x < cell.x1 && (Math.abs(ya - HERO.y) < 0.6 || Math.abs(yb - HERO.y) < 0.6);
      for (let x = cell.x0, n = 0; n < 12; n++) {
        const p = P(x + 24, ym) || P0;
        const lo = p.len[0] * 0.6, hi = p.len[0] * 0.65;
        const want = x + Math.round(lerp(p.len[0], p.len[1], hash(x, ya, cell.seed + 23)));
        const fits = (v) => v - x >= lo && cell.x1 - v >= hi && bwRow.every((b) => Math.abs(b - v) >= BWSEP) && clearOf(lns, v);
        let nx = null;
        // the hero corner's north-south street, before the plan's own next one would crowd it or run past it
        if (hero && HERO.x > x && want >= HERO.x - MINSEP && fits(HERO.x)) { nx = HERO.x; hero = false; }
        // carry a street from above straight on (now and then with a real jog) when one is about here
        const cont = prev.find((q) => q.v > x + lo && Math.abs(q.v - want) < p.len[0] * 0.45);
        if (nx === null && cont && hash(cont.v, ya, cell.seed + 29) < p.through) {
          const tries = [cont.v];
          if (hash(cont.v, ya, cell.seed + 31) < p.jog) {
            const s = hash(cont.v, ya, cell.seed + 37) < 0.5 ? -1 : 1, j = MINSEP + Math.floor(hash(cont.v, ya, cell.seed + 41) * 7);
            tries.unshift(cont.v + s * j, cont.v - s * j);
          }
          nx = tries.find(fits) ?? null;
        }
        if (nx === null) nx = settle(want, lns, bwRow, fits);
        if (nx === null) break;
        const name = named(prev, nx) || `${NS_NAMES[(nNS++ + Math.floor(nx)) % NS_NAMES.length]} Street`;
        xsRow.push({ x: nx, name });
        for (const key of lns) endsOn(key).push({ v: nx, name });
        x = nx;
      }
      for (const s of xsRow) {
        const p = P(s.x, ym) || P0;
        const amp = p.wobble || 0;
        const y0 = ewY(k, s.x), y1 = ewY(k + 1, s.x);
        const pts = [];
        const n = Math.max(2, Math.ceil(Math.abs(y1 - y0) / 2));
        for (let i = 0; i <= n; i++) { const t = i / n, y = lerp(y0, y1, t); pts.push({ x: T(s.x + wob(s.x * 7 + cell.seed, y, amp, 34) * Math.sin(Math.PI * t)), y: T(y) }); }
        for (const piece of clipLine(pts, okLocal(true), 6 * TILE, 12)) lines.push({ pts: piece, kind: p.lane || 'st', lvl: 0, name: s.name });
      }
      // 3. the blocks of this row: service alleys along the middle, passages, plazas
      const bx = [cell.x0, ...xsRow.map((s) => s.x), cell.x1];
      for (let b = 0; b + 1 < bx.length; b++) {
        const x0 = bx[b], x1 = bx[b + 1], cx = (x0 + x1) / 2;
        const p = P(cx, ym) || P0;
        const h = hash(cx, ym, cell.seed + 53);
        if (hash(cx, ym, cell.seed + 59) < p.plaza && x1 - x0 < 80 && yb - ya < 70) { plazas.push({ x0, y0: ya, x1, y1: yb }); continue; }
        if (yb - ya >= p.alleyMin && h < p.alley) {
          // along the middle of the block (a straight alley on tile centres; parallel to a curving street)
          const f = 0.48 + (hash(cx, ym, cell.seed + 61) - 0.5) * 0.12;
          const curved = CURVED.has(ya) || CURVED.has(yb) || (P(cx, ya) || P0).wobble;
          const pts = [];
          if (!curved) { const ay = Math.floor(ya + (yb - ya) * f) + 0.5; pts.push({ x: T(x0), y: T(ay) }, { x: T(x1), y: T(ay) }); }
          else for (let x = x0; x <= x1 + 0.01; x += 2) { const xx = Math.min(x, x1); pts.push({ x: T(xx), y: T(lerp(ewY(k, xx), ewY(k + 1, xx), f)) }); }
          for (const piece of clipLine(pts, okLocal(false), 6 * TILE, 12)) lines.push({ pts: piece, kind: 'alley', lvl: 0, name: 'Service Alley' });
        }
        const ax = Math.floor(x0 + (x1 - x0) * (0.42 + hash(cx, ym, cell.seed + 71) * 0.16)) + 0.5;
        // a passage through: never out right at a junction, nor across Broadway
        const by = bwY(ax);
        const passClear = lns.every((key) => endsOn(key).every((e) => Math.abs(e.v - ax) >= 6)) && bwRow.every((b) => Math.abs(b - ax) >= BWSEP)
          && (by === null || by < Math.min(ewY(k, ax), ewY(k + 1, ax)) - 8 || by > Math.max(ewY(k, ax), ewY(k + 1, ax)) + 8);
        if (x1 - x0 >= p.passMin && passClear && hash(cx, ym, cell.seed + 67) < p.passage) {
          const pts = [{ x: T(ax), y: T(ewY(k, ax)) }, { x: T(ax), y: T(ewY(k + 1, ax)) }];
          for (const piece of clipLine(pts, okLocal(true), 6 * TILE, 12)) lines.push({ pts: piece, kind: 'alley', lvl: 0, name: 'Back Alley' });
        }
      }
    }
  }
  const end = (list, pick) => { if (!list || !list.length) return null; return pick(list); };
  return {
    aves, plazas, westEnd,
    northEnd: (x) => end(vEnds.get(x) || vEnds.get(x + 0.5), (l) => l.slice().sort((p, q) => p.pts[0].y - q.pts[0].y)[0].pts[0]),
    southEnd: (x) => end(vEnds.get(x) || vEnds.get(x + 0.5), (l) => { const s = l.slice().sort((p, q) => q.pts[q.pts.length - 1].y - p.pts[p.pts.length - 1].y)[0]; return s.pts[s.pts.length - 1]; }),
  };
}
