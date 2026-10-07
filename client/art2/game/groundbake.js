// Art v2 in the game: the ground of one world chunk (docs/art-v2/GAME-RENDERER.md, "Ground: groundbake.js").
//
//   bakeGround(M, cx, cy, opt) -> GBuf 768 x 768, ax = ay = 0, covering world X [cx*768, +768) and screen Y
//   (= world Y at z 0) [cy*768, +768); groundSteps(...) is the same as a generator that yields between its
//   phases (a worker answers other jobs in between). M is the CityMap from shared/map.js generateCity() or its structured
//   clone (fields are read directly, no methods). opt: { quality 0..3, seed (default M.seed), deckZ (bridge
//   deck height, default 6) }. Pure, deterministic (no Math.random), worker safe; the scratch buffers are
//   allocated once per worker (about 22 MB) and reused, the result's typed arrays are fresh (transferable).
//   Quality: 0 materials, markings and water only (flat grass); 1 + dense turf, manholes, drains, arrows and
//   half the strewn cover; 2 full cover; 3 half again more cover. All tiers cost about the same (~250 ms CPU).
//   bakeSwatches(names, opt) -> GBuf: the materials laid out like the E1 sheet (a preview: tools/art2).
//   groundHeight(M, x, y, deckZ) -> px: the baked surface height under a moving thing (its z0 on pavements,
//   piers and bridge decks: sidewalks are z 3 per the contract, so feet would otherwise be depth-clipped).
//   Development: opt.profile adds G.prof (ms per phase), opt.debug adds G.debug (the window's material map).
//
// How a chunk is made (all in a window 48 px wider than the chunk on every side, so neighbourhood work - kerbs,
// shore distances, decorations that spill over - agrees across chunk borders):
//   1. tiles   per-tile facts for the window: type, district (style, wealth, walk / plaza / road textures),
//              biome (terrainCls), zone, sea / river / lake, water depth (deep tiles, distance to land), the
//              land's material (lawn, park, clover, meadow, pasture, forest floor, dry grass, alpine, dirt,
//              desert with hardpan, red rock, scree, beach, shingle, rock shore, dunes, crops, quarry, golf...)
//   2. vectors the ground-level roads of M.edges as distance fields (owning edge, along s, across v): asphalt
//              (hw), sidewalks (city kinds, 2 - 2.6 tiles like the tile raster), gravel shoulders (county
//              roads), cul-de-sac bulbs, rounded kerb returns at every junction corner (fillets), ramp gores,
//              bridge decks over water, the ground part of ramps (gravel under their lifted part); driveways
//              (M.homes garages), gas station aprons and pump islands (M.pumps); the railway (ballast,
//              sleepers, rails, level-crossing panels, trestle decks over water) and station platforms
//   3. classes per pixel: soft ground blends organically between tiles (domain-warped lookups), coastlines
//              and lawn / paving edges are smoothed (blurred tile fields, thresholded), hard ground stays square
//   4. shores  a chamfer distance to the land / water boundary: foam, wet sand, clear shallows, quay walls
//   5. paint   every material from ground.js GSHADE (E1 sheet) and water.js seaPx / stillPx, with normals for
//              relief; heights: sidewalks and plazas z 3, docks 4, kerb faces 3..1, bridge decks up to deckZ,
//              platforms 6, crops 2-5, rails 3, parapets, bollards and pilings up to deckZ + 9
//   6. roads   lane lines from laneOffset, double yellow, dashes, edge lines, concrete or planted medians, stop
//              lines, zebras (herringbone brick crosswalks in rich districts) from zebraCrossings, arrows, gore
//              chevrons, parking stalls with oil stains (M.parking), courts and pitches (M.venues), runway and
//              taxiway marks, race-track kerbs, wear by district wealth (tyre tracks, hairline and alligator
//              cracks, patches, potholes, gutter puddles), gutter grime, manholes, drains, red kerbs at hydrants
//   7. decor   by quality: dense E1-style turf on lawns, parks and meadows; leaves and tree pits under trees
//              (M.props), litter by wealth, weeds, pebbles, shells, starfish, seaweed, cones, twigs, mushrooms;
//              upright cover (z 1-14): flowers, seed heads, ferns, reeds, dune grass, dry tufts, scrub, lilies
// Flags: ground F_GROUND | F_WET (rain darkens it), water F_GROUND | F_WATER, puddles F_GROUND | F_WATER | F_WET;
// cover and crops add F_LEAF (mown turf also F_NOCAST: self-shaded, it casts no shadow).
import { GBuf, F_GROUND, F_WATER, F_WET, F_LEAF } from '../gbuf.js';
import { MAT, ramp } from '../palette.js';
import { GSHADE, GS, gsReset, coverSprite, turfGround, turfFlat, cloverAt, hh, vnc, worley, shadeStep as sd } from '../ground.js';
import { seaPx, stillPx, WP, WATER } from '../water.js';
import { T, TILE, MAP_W, MAP_H } from '../../../shared/constants.js';
import { DISTRICTS, WILD_STYLES, terrainAt, railAt, wildBiome } from '../../../shared/map.js';
import { Z } from '../../../shared/citylayout.js';
import { laneOffset, zebraCrossings, edgeZ } from '../../../shared/roads.js';

export const CHUNK = 768;
const PAD = 48, WN = CHUNK + PAD * 2, WA = WN * WN, TP = 4, TN = WN / TILE + TP * 2 + 1;
const DECK_LIFT = 88;                                  // shared/levels.js: px per deck level (ramp heights)
const CITY = new Set(['ave', 'blvd', 'st', 'minor', 'drive', 'front', 'art']);
const TREES = new Set(['tree_a', 'tree_b']), PALMS = new Set(['palm_a', 'palm_b', 'palm_c', 'palm_d', 'palm_s']);

// ---- materials ---------------------------------------------------------------------------------------------
// id -> [GSHADE name, kind]; kind: 0 soft land, 1 hard ground, 2 water, 3 road-like (asphalt / dirt: kerb faces
// land on these), 4 raised paving (z 3)
const MATS = [];
const M_ = {};
function mat(name, shader, kind) { M_[name] = MATS.length; MATS.push([shader, kind]); }
mat('NONE', 'foundation', 1);
mat('LAWN', 'grassLawn', 0); mat('PARK', 'grassPark', 0); mat('MEADOW', 'grassMeadow', 0); mat('DRYGRASS', 'grassDry', 0);
mat('ALPINE', 'grassAlpine', 0); mat('FOREST', 'forestFloor', 0); mat('FORESTDIRT', 'forestDirt', 0); mat('PASTURE', 'pasture', 0);
mat('GOLF', 'grassGolf', 0); mat('CLOVER', 'grassClover', 0); mat('DIRT', 'dirtPebbly', 0); mat('DESERT', 'desertGround', 0);
mat('CRACKED', 'earthCracked', 0); mat('REDROCK', 'redRock', 0); mat('SCREE', 'scree', 0); mat('GRAVEL', 'gravelGrey', 0);
mat('MUD', 'mudRuts', 0); mat('BEACH', 'sandBeach', 0); mat('DUNE', 'sandDune', 0); mat('QUARRY', 'quarryRock', 0);
mat('UNDERDECK', 'underDeck', 0); mat('WETSAND', 'sandWet', 0); mat('ROCKSHORE', 'rockShore', 0); mat('SHINGLE', 'pebbleBeach', 0);
mat('WHEAT', 'cropWheat', 1); mat('CORN', 'cropCorn', 1); mat('CORNV', 'cropCornV', 1); mat('VEG', 'cropVeg', 1);
mat('HAY', 'cropHay', 1); mat('PLOW', 'soilPlowed', 1); mat('PLOWV', 'soilPlowedV', 1);
mat('ROAD', 'asphaltFresh', 3); mat('ROADOLD', 'asphaltOld', 3); mat('DIRTROAD', 'dirtPebbly', 3); mat('SHOULDER', 'gravelGrey', 3);
mat('LOT', 'lotAsphalt', 3); mat('YARD', 'yardSlab', 3); mat('APRON', 'apron', 3); mat('GRAVLOT', 'gravelGrey', 3);
mat('TRACK', 'asphaltFresh', 3); mat('RUNWAY', 'asphaltOld', 3); mat('GORE', 'asphaltFresh', 3); mat('DECK', 'asphaltOld', 3); mat('DECKF', 'asphaltFresh', 3);
mat('WALKC', 'slabConcrete', 4); mat('WALKCR', 'slabCracked', 4); mat('WALKS', 'slabStone', 4); mat('WALKB', 'brickRun', 4); mat('WALKO', 'cobbleSett', 4);
mat('PLAZAC', 'slabPlaza', 4); mat('PLAZAS', 'slabStone', 4); mat('PLAZAB', 'brickHerring', 4); mat('PLAZAO', 'cobbleSett', 4);
mat('DRIVE', 'slabDrive', 4); mat('APRONG', 'apron', 3); mat('ISLAND', 'slabConcrete', 4); mat('PATH', 'pathGravel', 4); mat('BOARD', 'boardwalk', 4); mat('BOARDV', 'boardwalkV', 4); mat('DOCK', 'planks', 4); mat('DOCKX', 'planksX', 4); mat('DECKWALK', 'slabConcrete', 4);
mat('FOUND', 'foundation', 1); mat('WALL', 'foundation', 1); mat('FLOOR', 'floorTile', 1); mat('FLOORW', 'floorWood', 1); mat('COUNTER', 'counterTop', 1);
mat('BALLAST', 'ballastStone', 1); mat('PLATFORM', 'slabPlaza', 1); mat('RAILDECK', 'planksX', 1);
mat('SEA', '', 2); mat('RIVER', '', 2); mat('LAKE', '', 2); mat('POND', '', 2);
const NM = MATS.length;
const KIND = new Uint8Array(NM), SHADER = [];
for (let i = 0; i < NM; i++) { KIND[i] = MATS[i][1]; SHADER[i] = GSHADE[MATS[i][0]] || null; }
// interior floors come from the older ground kinds
SHADER[M_.FLOOR] = (x, y, s) => interior('tileWhite', x, y, s); SHADER[M_.FLOORW] = (x, y, s) => interior('woodFloor', x, y, s);
const TURFPAL = new Int8Array(NM).fill(-1), TURFCLOV = new Float32Array(NM);
TURFPAL[M_.LAWN] = 0; TURFPAL[M_.PARK] = 1; TURFPAL[M_.CLOVER] = 1; TURFPAL[M_.MEADOW] = 2; TURFPAL[M_.PASTURE] = 2; TURFPAL[M_.DRYGRASS] = 3; TURFPAL[M_.ALPINE] = 4; TURFPAL[M_.FOREST] = 2;
TURFCLOV[M_.PARK] = 0.12; TURFCLOV[M_.CLOVER] = 0.55; TURFCLOV[M_.PASTURE] = 0.15; TURFCLOV[M_.LAWN] = 0.05;
const WALKS = { concrete: M_.WALKC, slate: M_.WALKS, brick: M_.WALKB }, PLAZAS = { concrete: M_.PLAZAC, slate: M_.PLAZAS, brick: M_.PLAZAB };
const isWater = (m) => KIND[m] === 2, isSoft = (m) => KIND[m] === 0, roadLike = (m) => KIND[m] === 3, raised = (m) => KIND[m] === 4;
// land whose edge against the water is smoothed (soft ground, paving, lots - not roads, buildings or piers)
const SMOOTH = new Uint8Array(NM);
for (let m = 0; m < NM; m++) SMOOTH[m] = (KIND[m] === 0 || KIND[m] === 4 || KIND[m] === 3) && m !== M_.ROAD && m !== M_.ROADOLD && m !== M_.DIRTROAD && m !== M_.DOCK && m !== M_.DOCKX && m !== M_.DECK && m !== M_.DECKF && m !== M_.DECKWALK && m !== M_.GORE ? 1 : 0;
const WSTYLE = new Set(WILD_STYLES);
// district wealth -> road wear (0 clean .. 1 broken), litter, weeds
const WEAR = { lux: 0.05, neon: 0.3, mid: 0.3, red: 0.5, suburb: 0.22, low: 0.55, rough: 0.9, industrial: 0.65, rural: 0.5, wild: 0.45 };
const LITTER = { lux: 0.1, neon: 0.7, mid: 0.4, red: 0.8, suburb: 0.15, low: 0.6, rough: 1, industrial: 0.7, rural: 0.2, wild: 0.05 };

// ---- per-worker scratch (allocated once; a worker bakes one chunk at a time) ----------------------------------
let B = null;
function scratch() {
  if (B) return B;
  B = {
    mat: new Uint8Array(WA), zb: new Uint8Array(WA), aux: new Uint8Array(WA), sub: new Uint8Array(WA),
    rE: new Int16Array(WA), rD: new Float32Array(WA), rS: new Float32Array(WA), rV: new Float32Array(WA),
    lS: new Float32Array(WA), lV: new Float32Array(WA), dist: new Uint16Array(WA), ex: new Uint8Array(WA),
    tt: new Uint8Array(TN * TN), td: new Uint8Array(TN * TN), tb: new Uint8Array(TN * TN), tz: new Uint8Array(TN * TN), tm: new Uint8Array(TN * TN),
    tf: new Float32Array(TN * TN), tdp: new Float32Array(TN * TN), tw: new Uint8Array(TN * TN), tsand: new Uint8Array(TN * TN), tdeck: new Uint8Array(TN * TN),
    tres: new Uint8Array(TN * TN), tbld: new Int16Array(TN * TN), tsf: new Float32Array(TN * TN), tso: new Int8Array(TN * TN),
    tfl: new Uint8Array(TN * TN), twear: new Float32Array(TN * TN),
    wx: new Float32Array((WN / 4 + 2) * (WN / 4 + 2)), wy: new Float32Array((WN / 4 + 2) * (WN / 4 + 2)),
  };
  return B;
}
// aux bits
const A_FILLET = 1, A_BULB = 2, A_GORE = 4, A_CHEV = 8, A_RAIL = 16, A_UNDER = 32, A_XING = 64, A_PLAT = 128;

// ---- the baker -------------------------------------------------------------------------------------------------
export function bakeGround(M, cx, cy, opt = {}) {
  const it = groundSteps(M, cx, cy, opt);
  let r = it.next();
  while (!r.done) r = it.next();
  return r.value;
}
// The same bake one phase at a time: a generator that yields between phases and returns the GBuf, so a worker
// can answer other jobs (sprites for things on screen) in between (worker.js). Only one bake at a time per
// worker: the phases share the worker's scratch buffers.
export function* groundSteps(M, cx, cy, opt = {}) {
  const b = scratch();
  const q = opt.quality ?? 2, seed = ((opt.seed ?? M.seed ?? 1337) | 0) & 0xffff;
  const X0 = cx * CHUNK, Y0 = cy * CHUNK, WX0 = X0 - PAD, WY0 = Y0 - PAD;
  const TX0 = Math.floor(WX0 / TILE) - TP, TY0 = Math.floor(WY0 / TILE) - TP;
  // ap 2: the live game draws the chunk at 1 art pixel = 2 world px - the paint (lane lines, zebras, stop lines,
  // arrows, stalls, court lines, wear) is decided once per art pixel so it comes out in whole art pixels
  const C = { M, b, q, seed, X0, Y0, WX0, WY0, TX0, TY0, deckZ: opt.deckZ ?? 6, E: [], ap: opt.artPx === 2 ? 2 : 1 };
  const G = new GBuf(CHUNK, CHUNK); G.ax = 0; G.ay = 0;
  const prof = opt.profile ? {} : null;
  C.prof = prof;
  for (const [name, f] of [['tiles', tileFacts], ['roads', roadField], ['rail', railField], ['classify', classify], ['shore', shoreDistance], ['paint', paint], ['markings', markings], ['edges', edges], ['decor', decor], ['surf', surf]]) {
    const t0 = prof ? performance.now() : 0;
    f(C, G);
    if (prof) prof[name] = Math.round(performance.now() - t0);
    yield name;
  }
  if (prof) G.prof = prof;
  if (opt.debug) G.debug = { mat: b.mat.slice(), rE: b.rE.slice(), rD: b.rD.slice(), aux: b.aux.slice(), names: Object.keys(M_), E: C.E.map((e) => e.id), PAD, WN };
  return G;
}

// The height of the baked ground surface at world (x, y), for the engine's z0 of things standing there (the
// depth test would otherwise clip the feet of a person on a z 3 sidewalk): pavements, plazas and promenades 3,
// piers 4, bridge decks deckZ, everything else 0. Tile resolution: the baked kerb lines are smooth, so within a
// few px of a kerb this can be off by the kerb's 3 px, and station platforms (baked at 6, along the track)
// report their tiles' 3.
export function groundHeight(M, x, y, deckZ = 6) {
  const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
  if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return 0;
  const t = M.tiles[ty * MAP_W + tx];
  return t === T.SIDEWALK || t === T.PLAZA ? 3 : t === T.DOCK ? 4 : t === T.BRIDGE ? deckZ : 0;
}

// A preview of the world materials laid out like the E1 sheet, through the same paint, edge and decoration code
// as the chunks: names are material keys (MATERIALS) or [upper, lower] pairs split across the cell along a wavy
// line (['BEACH', 'SEA'] gives the waterline). opt: { cols (5), quality (2), seed }. Returns a 768 x 768 GBuf.
export const MATERIALS = M_;
export const E1_SWATCHES = ['LAWN', 'CLOVER', 'MEADOW', 'FOREST', 'MUD', 'GRAVEL', 'DIRT', 'PLOW', 'DUNE', 'REDROCK', 'CRACKED', 'BEACH', ['WETSAND', 'SEA'], ['ROCKSHORE', 'RIVER'], 'WALKO', 'WALKB', 'PLAZAB', 'WALKC', 'WALKCR', 'ROAD'];
export function bakeSwatches(names = E1_SWATCHES, opt = {}) {
  const b = scratch(), cols = opt.cols ?? 5, rows = Math.ceil(names.length / cols), seed = ((opt.seed ?? 1337) | 0) & 0xffff;
  const C = { M: { props: [], nodes: [], edges: [], parking: [], venues: [], airports: [] }, b, q: opt.quality ?? 2, seed, X0: 0, Y0: 0, WX0: -PAD, WY0: -PAD, TX0: Math.floor(-PAD / TILE) - TP, TY0: Math.floor(-PAD / TILE) - TP, deckZ: 6, E: [] };
  b.rE.fill(-1); b.aux.fill(0); b.ex.fill(0); b.zb.fill(0); b.td.fill(1); b.tdp.fill(0.35); b.tsand.fill(1); b.tw.fill(0);
  const cw = CHUNK / cols, ch = CHUNK / rows, gap = 5;
  for (let py = 0; py < WN; py++) for (let px = 0; px < WN; px++) {
    const x = px - PAD, y = py - PAD, i = py * WN + px, c = Math.floor(x / cw), r = Math.floor(y / ch), lx = x - c * cw, ly = y - r * ch;
    let m = M_.NONE;
    if (x >= 0 && y >= 0 && x < CHUNK && y < CHUNK && lx >= gap && ly >= gap && lx < cw - gap && ly < ch - gap && r * cols + c < names.length) {
      const n = names[r * cols + c];
      m = Array.isArray(n) ? M_[ly < ch * 0.48 + Math.sin(x * 0.06) * 9 + (vnc(x, y, 13, seed) - 0.5) * 10 ? n[0] : n[1]] : M_[n];
    }
    b.mat[i] = m; b.zb[i] = raised(m) ? 3 : 0;
  }
  const G = new GBuf(CHUNK, CHUNK); G.ax = 0; G.ay = 0;
  shoreDistance(C); paint(C, G); edges(C, G); decor(C, G);
  return G;
}

// ---- 1. tiles ----------------------------------------------------------------------------------------------------
const FIELD_KINDS = ['WHEAT', 'CORN', 'PLOW', 'VEG', 'HAY', 'WHEAT', 'CORN'];
function tileFacts(C) {
  const { M, b, TX0, TY0, seed } = C;
  const { cls, cw } = M.terrainCls;
  const fields = M.fields || [], paint = M.paintings || [], quarries = M.quarries || [], races = M.raceways || [], airports = M.airports || [];
  for (let j = 0; j < TN; j++) for (let i = 0; i < TN; i++) {
    const tx = TX0 + i, ty = TY0 + j, k = j * TN + i;
    if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) { b.tt[k] = T.DEEP; b.td[k] = 13; b.tb[k] = 0; b.tz[k] = 0; b.tw[k] = 1; b.tdeck[k] = 0; b.tres[k] = 0; b.tbld[k] = -1; b.tm[k] = M_.SEA; continue; }
    const g = ty * MAP_W + tx, t = M.tiles[g];
    b.tt[k] = t; b.td[k] = M.dist[g]; b.tz[k] = M.zone[g]; b.tdeck[k] = M.deck[g]; b.tres[k] = M.reserve[g]; b.tbld[k] = M.bld[g];
    b.tb[k] = M.land[g] ? wildBiome(M.dist[g], terrainAt(cls, cw, tx, ty)) : 0;
    b.tw[k] = t === T.WATER || t === T.DEEP || t === T.BRIDGE || t === T.DOCK ? 1 : 0;
    // water kind / land material
    const X = tx * TILE + 16, Y = ty * TILE + 16, D = DISTRICTS[b.td[k]] || DISTRICTS[13], st = D.style, wild = WSTYLE.has(st), bio = b.tb[k];
    let m;
    if (t === T.WATER || t === T.DEEP || t === T.BRIDGE) m = M.lake[g] ? M_.LAKE : !M.land[g] ? (M.river[g] ? M_.RIVER : M_.SEA) : M_.POND;
    else if (t === T.DOCK) m = runAxis(M, tx, ty, T.DOCK) ? M_.DOCK : M_.DOCKX;
    else if (t === T.GRASS) {
      if (b.tdeck[k]) m = M_.UNDERDECK;
      else if (b.tres[k] & 128) m = M_.PASTURE;                 // (a river's lush banks, even in dry country: Willow River)
      else if (inRects(paint, X, Y, 'golf')) m = M_.GOLF;
      else if (!wild) m = (b.tres[k] & 64) ? M_.FOREST : (b.tres[k] & 32) ? M_.MEADOW : st === 'park' ? (hh(tx >> 3, ty >> 3, seed + 5) > 0.75 ? M_.CLOVER : M_.PARK) : (D.tier === 'rough' || D.tier === 'industrial') ? M_.DRYGRASS : st === 'beach' ? M_.MEADOW : M_.LAWN;   // (32: a designed nature place in town - meadow, not lawn)
      else if (st === 'rural' || st === 'airport') m = bio === 2 ? M_.FOREST : bio === 3 ? M_.DRYGRASS : st === 'airport' ? M_.LAWN : M_.PASTURE;
      else if (st === 'desert') m = M_.DRYGRASS;
      else m = bio === 2 ? M_.FOREST : bio === 4 ? (b.tz[k] === Z.EAST ? M_.DRYGRASS : M_.ALPINE) : bio === 3 ? M_.DRYGRASS : bio === 5 ? M_.MEADOW : M_.MEADOW;
    } else if (t === T.DIRT) {
      if (inRects(quarries, X, Y)) m = M_.QUARRY;
      else if (inRects(paint, X, Y, 'canyon')) m = M_.REDROCK;
      else if (b.tdeck[k]) m = M_.UNDERDECK;
      else if (b.tres[k] & 2) m = M_.GRAVEL;
      else if (!wild) m = (D.tier === 'industrial' || D.tier === 'rough') ? M_.GRAVEL : M_.DIRT;
      else if (bio === 3 || st === 'desert') m = M_.DESERT;
      else if (bio === 4) m = b.tz[k] === Z.EAST && st !== 'rural' ? M_.REDROCK : st === 'rural' ? M_.DIRT : M_.SCREE;
      else if (bio === 2) m = M_.FORESTDIRT;
      else m = M_.DIRT;
    } else if (t === T.SAND) {
      // wild coasts by their land: rock shores below mountains, shingle under the forests, sand elsewhere
      if (b.tres[k] & 128) m = M_.SHINGLE;                      // (a river's gravel bars)
      else if ((b.tres[k] & 36) === 36) m = M_.BEACH;            // (a designed beach - the cove's sand - whatever the coast round it)
      else if ((bio === 4 || (bio === 2 && wild)) && WSTYLE.has(st) && st !== 'beach') m = bio === 4 ? (vnc(X, Y, 211, seed + 3) > 0.35 ? M_.ROCKSHORE : M_.SHINGLE) : (vnc(X, Y, 173, seed + 5) > 0.5 ? M_.SHINGLE : M_.BEACH);
      else m = (bio === 3 || st === 'desert') && M.distSea[g] > 24 ? M_.DUNE : M_.BEACH;
    }
    else if (t === T.FIELD) {
      const f = fields.findIndex((r) => X >= r.x && X < r.x + r.w && Y >= r.y && Y < r.y + r.h);
      const fk = FIELD_KINDS[Math.floor(hh(f >= 0 ? f : tx >> 3, f >= 0 ? 0 : ty >> 3, seed + 9) * FIELD_KINDS.length)];
      const long = f >= 0 && fields[f].w > fields[f].h;
      m = fk === 'CORN' ? (long ? M_.CORN : M_.CORNV) : fk === 'PLOW' ? (long ? M_.PLOW : M_.PLOWV) : M_[fk];
    } else if (t === T.SIDEWALK) m = walkOf(D);
    else if (t === T.PLAZA) {
      if ((b.tres[k] & 4) && (st === 'beach' || st === 'park')) m = runAxis(M, tx, ty, T.PLAZA) ? M_.BOARDV : M_.BOARD;
      else if (st === 'oldtown') m = M_.PLAZAO;
      else if (st === 'park') m = M_.PATH;
      else m = PLAZAS[D.plaza] ?? M_.PLAZAC;
    } else if (t === T.LOT) {
      if (inRects(races, X, Y)) m = M_.TRACK;
      else if (airports.some((a) => inRect(a.runway, X, Y))) m = M_.RUNWAY;
      else if (airports.some((a) => inRect(a.taxi, X, Y))) m = M_.LOT;
      else if (st === 'airport') m = M_.APRON;
      else if (D.tier === 'industrial') m = M_.YARD;
      else if (st === 'rural' || wild) m = M_.GRAVLOT;
      else if (b.tres[k] & 1) m = M_.GRAVLOT;
      else m = M_.LOT;
    } else if (t === T.ROAD) m = D.road === 'asphalt_worn' ? M_.ROADOLD : M_.ROAD;
    else if (t === T.BUILDING) m = M_.FOUND;
    else if (t === T.WALL) m = inRects(paint, X, Y, 'canyon') ? M_.REDROCK : (b.tres[k] & 32) ? M_.SCREE : M_.WALL;   // (32: a designed place's rock - cliffs, escarpments - natural rubble round their sprites)
    else if (t === T.FLOOR) { const bi = b.tbld[k], bd = bi >= 0 ? M.buildings[bi] : null; m = bd && /house|apt|home|shack|mansion|farm/.test(bd.kind) ? M_.FLOORW : M_.FLOOR; }
    else if (t === T.COUNTER) m = M_.COUNTER;
    else m = M_.FOUND;
    b.tm[k] = m;
  }
  // blurred wetness (rounds the coast's tile steps), deep-water fraction, sandy shores
  for (let j = 0; j < TN; j++) for (let i = 0; i < TN; i++) {
    const k = j * TN + i;
    if (i === 0 || j === 0 || i === TN - 1 || j === TN - 1) { b.tf[k] = b.tw[k]; b.tdp[k] = b.tt[k] === T.DEEP ? 1 : 0; continue; }
    b.tf[k] = b.tw[k] * 0.5 + (b.tw[k - 1] + b.tw[k + 1] + b.tw[k - TN] + b.tw[k + TN]) * 0.1 + (b.tw[k - TN - 1] + b.tw[k - TN + 1] + b.tw[k + TN - 1] + b.tw[k + TN + 1]) * 0.025;
    const dp = (t) => (t === T.DEEP ? 1 : 0);
    b.tdp[k] = dp(b.tt[k]) * 0.4 + (dp(b.tt[k - 1]) + dp(b.tt[k + 1]) + dp(b.tt[k - TN]) + dp(b.tt[k + TN])) * 0.15;
    if (b.tw[k] && b.tt[k] !== T.DEEP) b.tdp[k] = Math.max(b.tdp[k], landDist(M, TX0 + i, TY0 + j) / 18);
    let s = 0;
    for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) { const kk = k + dj * TN + di; if (kk >= 0 && kk < TN * TN && (b.tm[kk] === M_.BEACH || b.tm[kk] === M_.DUNE)) s = 1; }
    let hard = 0;
    for (const kk of [k - 1, k + 1, k - TN, k + TN, k - TN - 1, k - TN + 1, k + TN - 1, k + TN + 1]) if (!b.tw[kk] && KIND[b.tm[kk]] !== 0) hard = 1;
    b.tsand[k] = s ? 1 : hard ? 2 : 0;
  }
  // lawn against paving: a blurred softness per tile (soft 1, paving 0), so diagonal edges come out smooth
  for (let k = 0; k < TN * TN; k++) { const m = b.tm[k]; b.tso[k] = b.tw[k] ? -1 : isSoft(m) ? 1 : ((KIND[m] === 4 && m !== M_.DOCK && m !== M_.DOCKX) || (KIND[m] === 3 && m !== M_.ROAD && m !== M_.ROADOLD)) ? 0 : -1; }
  for (let j = 1; j < TN - 1; j++) for (let i = 1; i < TN - 1; i++) {
    const k = j * TN + i, v = (kk) => (b.tso[kk] < 0 ? b.tso[k] : b.tso[kk]);
    b.tsf[k] = b.tso[k] < 0 ? -1 : v(k) * 0.5 + (v(k - 1) + v(k + 1) + v(k - TN) + v(k + TN)) * 0.1 + (v(k - TN - 1) + v(k - TN + 1) + v(k + TN - 1) + v(k + TN + 1)) * 0.025;
  }
  // which per-pixel blends a tile needs (bilinear cells are indexed by their top-left tile): 1 coast, 2 lawn vs
  // paving, 4 the soft-border warp; and the road wear of each tile's district
  for (let j = 0; j < TN; j++) for (let i = 0; i < TN; i++) {
    const k = j * TN + i;
    b.twear[k] = WEAR[(DISTRICTS[b.td[k]] || DISTRICTS[1]).tier] ?? 0.3;
    if (i === TN - 1 || j === TN - 1 || i === 0 || j === 0) { b.tfl[k] = 0; continue; }
    const c = [k, k + 1, k + TN, k + TN + 1];
    let f = 0;
    const w0 = b.tf[k];
    if (w0 !== 0 && w0 !== 1 || c.some((kk) => b.tf[kk] !== w0)) f |= 1;
    if (c.every((kk) => b.tsf[kk] >= 0) && c.some((kk) => b.tso[kk] !== b.tso[k])) f |= 2;
    if (isSoft(b.tm[k])) for (const kk of [k - 1, k + 1, k - TN, k + TN, k - TN - 1, k - TN + 1, k + TN - 1, k + TN + 1]) if (isSoft(b.tm[kk]) && b.tm[kk] !== b.tm[k] && !b.tw[kk]) { f |= 4; break; }
    b.tfl[k] = f;
  }
  // the warp of soft ground borders: a coarse grid of offsets (bilinear per pixel)
  const GW = WN / 4 + 2;
  for (let j = 0; j < GW; j++) for (let i = 0; i < GW; i++) {
    const X = C.WX0 + i * 4, Y = C.WY0 + j * 4;
    b.wx[j * GW + i] = (vnc(X, Y, 23, seed + 31) - 0.5) * 26 + (vnc(X, Y, 7, seed + 33) - 0.5) * 7;
    b.wy[j * GW + i] = (vnc(X, Y, 23, seed + 37) - 0.5) * 26 + (vnc(X, Y, 7, seed + 39) - 0.5) * 7;
  }
}
// true when a run of this tile type through (tx, ty) is longer along x than along y
function runAxis(M, tx, ty, t) {
  let h = 0, v = 0;
  for (let d = 1; d < 12 && M.tiles[ty * MAP_W + tx + d] === t; d++) h++;
  for (let d = 1; d < 12 && M.tiles[ty * MAP_W + tx - d] === t; d++) h++;
  for (let d = 1; d < 12 && M.tiles[(ty + d) * MAP_W + tx] === t; d++) v++;
  for (let d = 1; d < 12 && M.tiles[(ty - d) * MAP_W + tx] === t; d++) v++;
  return h >= v;
}
// the pavement of a district: concrete slabs (cracked where poor), stone in rich districts, cobbles in the old town,
// pale herringbone pavers by the beach, red brick on the strips
function walkOf(D) {
  if (D.style === 'oldtown') return M_.WALKO;
  if (D.style === 'beach') return M_.PLAZAB;
  if (D.walk === 'concrete') return D.tier === 'rough' || D.tier === 'low' || D.tier === 'industrial' ? M_.WALKCR : M_.WALKC;
  return WALKS[D.walk] ?? M_.WALKC;
}
// tiles from (tx, ty) to the nearest land, probed along 8 directions out to 18 tiles (coarse, but smooth enough
// once blurred into the per-pixel depth: the river inlet is far wider than a chunk)
const PROBE = Array.from({ length: 16 }, (_, k) => [Math.cos(k * Math.PI / 8), Math.sin(k * Math.PI / 8)]);
function landDist(M, tx, ty) {
  for (let r = 1; r <= 18; r++) for (const [dx, dy] of PROBE) {
    const x = Math.round(tx + dx * r), y = Math.round(ty + dy * r);
    if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) continue;
    const t = M.tiles[y * MAP_W + x];
    if (t !== T.WATER && t !== T.DEEP && t !== T.BRIDGE) return r;
  }
  return 18;
}
const inRect = (r, X, Y) => r && X >= r.x && X < r.x + r.w && Y >= r.y && Y < r.y + r.h;
const inRects = (list, X, Y, key) => list.some((r) => (!key || r.key === key) && inRect(r, X, Y));

// ---- 2. roads as distance fields ------------------------------------------------------------------------------
function edgeInfo(M, e) {
  if (e._gb) return e._gb;
  const P = e.pts;
  if (P[0].s === undefined) { let s = 0; P[0].s = 0; for (let i = 1; i < P.length; i++) { s += Math.hypot(P[i].x - P[i - 1].x, P[i].y - P[i - 1].y); P[i].s = s; } }
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const p of P) { if (p.x < x0) x0 = p.x; if (p.y < y0) y0 = p.y; if (p.x > x1) x1 = p.x; if (p.y > y1) y1 = p.y; }
  const aligned = P.every((p, i) => i === 0 || Math.abs(p.x - P[i - 1].x) < 1 || Math.abs(p.y - P[i - 1].y) < 1);
  // the pavement: the width the map gave this road (shared/map.js edgeWalk: 112 / 96 / 64 px by district class),
  // a little wider on curves where the tile raster steps out past the smooth kerb line
  const city = CITY.has(e.kind), walk = city ? (e.walk ?? 2 * TILE) + (aligned ? 0 : 0.6 * TILE) : e.kind === 'rural' ? 18 : 0;
  const L = P[P.length - 1].s, na = M.nodes[e.a], nb = M.nodes[e.b];
  const t0 = ((na && na.trim[e.id]) || 0) + 6, t1 = L - ((nb && nb.trim[e.id]) || 0) - 6;
  const linked = na && nb && na.edges.length >= 3 && nb.edges.length >= 3 && t1 - t0 < 138 && e.kind !== 'hwy';
  // bridge spans: where the centre line runs over water, with a short run onto each bank
  const wet = [];
  if (e.lvl === 0) {
    let s0 = -1;
    for (let s = 0; s <= L + 8; s += 8) {
      const p = pointOn(P, Math.min(s, L)), tx = Math.floor(p.x / TILE), ty = Math.floor(p.y / TILE);
      const t = tx >= 0 && ty >= 0 && tx < MAP_W && ty < MAP_H ? M.tiles[ty * MAP_W + tx] : T.DEEP;
      const w = s <= L && (t === T.BRIDGE || t === T.WATER || t === T.DEEP);
      if (w && s0 < 0) s0 = s;
      if (!w && s0 >= 0) { wet.push([Math.max(0, s0 - 26), Math.min(L, s + 18)]); s0 = -1; }
    }
  }
  e._gb = { bb: [x0, y0, x1, y1], aligned, city, walk, R: e.hw + walk + (city ? 20 : 4), L, t0, t1, linked, wet, sp: simplify(P, 0.3) };
  return e._gb;
}
// Douglas-Peucker: the polyline with points dropped while it stays within tol px of the original (the distance
// field is rasterised from it: far fewer, longer segments on the curves); keeps each point's arc length s
function simplify(P, tol) {
  const n = P.length, keep = new Uint8Array(n);
  keep[0] = keep[n - 1] = 1;
  const stack = [[0, n - 1]];
  while (stack.length) {
    const [a, c] = stack.pop();
    const ax = P[a].x, ay = P[a].y, dx = P[c].x - ax, dy = P[c].y - ay, L = Math.hypot(dx, dy) || 1e-9;
    let best = -1, bd = tol;
    for (let k = a + 1; k < c; k++) { const d = Math.abs((P[k].x - ax) * dy - (P[k].y - ay) * dx) / L; if (d > bd) { bd = d; best = k; } }
    if (best >= 0) { keep[best] = 1; stack.push([a, best], [best, c]); }
  }
  const out = [];
  for (let k = 0; k < n; k++) if (keep[k]) out.push(P[k]);
  return out;
}
function pointOn(P, s) {
  let lo = 0, hi = P.length - 1;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (P[mid].s <= s) lo = mid; else hi = mid - 1; }
  const a = P[lo], c = P[Math.min(P.length - 1, lo + 1)], seg = (c.s - a.s) || 1, t = Math.max(0, Math.min(1, (s - a.s) / seg));
  const dx = c.x - a.x, dy = c.y - a.y, l = Math.hypot(dx, dy) || 1;
  return { x: a.x + dx * t, y: a.y + dy * t, tx: dx / l, ty: dy / l };
}
function roadField(C) {
  const { M, b, WX0, WY0 } = C;
  b.rE.fill(-1); b.rD.fill(1e9); b.aux.fill(0);
  const X1 = WX0 + WN, Y1 = WY0 + WN;
  const list = M.edges.filter((e) => e.lvl === 0).concat(M.edges.filter((e) => e.lvl === 'ramp'));
  for (const e of list) {
    const I = edgeInfo(M, e), [x0, y0, x1, y1] = I.bb, R = I.R;
    if (x1 + R < WX0 || x0 - R > X1 || y1 + R < WY0 || y0 - R > Y1) continue;
    const k = C.E.length, ramp = e.lvl === 'ramp';
    C.E.push(e);
    const P = I.sp, hw = e.hw;
    for (let n = 0; n + 1 < P.length; n++) {
      const a = P[n], c = P[n + 1], sx = c.x - a.x, sy = c.y - a.y, L2 = sx * sx + sy * sy || 1e-6, sl = Math.sqrt(L2), nx = -sy / sl, ny = sx / sl;
      const bx0 = Math.max(0, Math.floor(Math.min(a.x, c.x) - R - WX0)), bx1 = Math.min(WN - 1, Math.ceil(Math.max(a.x, c.x) + R - WX0));
      const by0 = Math.max(0, Math.floor(Math.min(a.y, c.y) - R - WY0)), by1 = Math.min(WN - 1, Math.ceil(Math.max(a.y, c.y) + R - WY0));
      if (bx0 > bx1 || by0 > by1) continue;
      for (let py = by0; py <= by1; py++) {
        const Y = WY0 + py + 0.5 - a.y;
        for (let px = bx0, i = py * WN + bx0; px <= bx1; px++, i++) {
          const X = WX0 + px + 0.5 - a.x;
          let t = (X * sx + Y * sy) / L2; t = t < 0 ? 0 : t > 1 ? 1 : t;
          const dx = X - sx * t, dy = Y - sy * t, d = Math.sqrt(dx * dx + dy * dy), val = d - hw;
          if (val >= b.rD[i] || d >= R) continue;
          // a ramp is road only while it is still on the ground; under its lifted part lies plain ground
          if (ramp && edgeZ(e, e.a, a.s + t * sl) * DECK_LIFT > 3) { if (val < 0 && b.rD[i] >= 0) b.aux[i] |= A_UNDER; continue; }
          b.rD[i] = val; b.rE[i] = k; b.rS[i] = a.s + t * sl; b.rV[i] = X * nx + Y * ny;
        }
      }
    }
  }
  const T0 = C.prof ? performance.now() : 0;
  culdesacs(C); const T1 = C.prof ? performance.now() : 0;
  fillets(C); const T2 = C.prof ? performance.now() : 0;
  gores(C); const T3 = C.prof ? performance.now() : 0;
  lots(C);
  if (C.prof) Object.assign(C.prof, { r_cds: Math.round(T1 - T0), r_fil: Math.round(T2 - T1), r_gore: Math.round(T3 - T2), r_lots: Math.round(performance.now() - T3) });
}
// driveways from each house's garage spot down to the street, and gas station aprons with pump islands
const EX_DRIVE = 1, EX_APRON = 2, EX_ISLAND = 4;
function lots(C) {
  const { M, b, WX0, WY0 } = C;
  b.ex.fill(0);
  const near = (x, y, r) => x > WX0 - r && x < WX0 + WN + r && y > WY0 - r && y < WY0 + WN + r;
  const fill = (x0, y0, x1, y1, bit, test) => {
    for (let py = Math.max(0, Math.floor(y0 - WY0)); py <= Math.min(WN - 1, Math.ceil(y1 - WY0)); py++)
      for (let px = Math.max(0, Math.floor(x0 - WX0)); px <= Math.min(WN - 1, Math.ceil(x1 - WX0)); px++) { const i = py * WN + px; if (!test || test(i, WX0 + px, WY0 + py)) b.ex[i] |= bit; }
  };
  const tileAt = (x, y) => { const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE); return tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H ? T.WALL : M.tiles[ty * MAP_W + tx]; };
  for (const h of M.homes || []) {
    const g = h.garage;
    if (!g || /apart|apt/.test(h.kind) || !near(g.x, g.y, 400)) continue;
    const dx = Math.round(Math.cos(g.a)), dy = Math.round(Math.sin(g.a));
    if (Math.abs(dx) + Math.abs(dy) !== 1) continue;
    // from the building's face to the first road tile ahead
    let back = 0; while (back < 160 && tileAt(g.x - dx * back, g.y - dy * back) !== T.BUILDING) back += 8;
    let fwd = 0; while (fwd < 360 && tileAt(g.x + dx * fwd, g.y + dy * fwd) !== T.ROAD) fwd += 8;
    if (fwd >= 360) continue;
    const ax = g.x - dx * Math.min(back, 150), ay = g.y - dy * Math.min(back, 150), bx = g.x + dx * (fwd + 4), by = g.y + dy * (fwd + 4), hw = 34;
    fill(Math.min(ax, bx) - (dy ? hw : 0), Math.min(ay, by) - (dx ? hw : 0), Math.max(ax, bx) + (dy ? hw : 0), Math.max(ay, by) + (dx ? hw : 0), EX_DRIVE, (i, x, y) => { const t = tileAt(x, y); return t === T.GRASS || t === T.SIDEWALK || t === T.DIRT || t === T.PLAZA; });
  }
  for (const p of M.pumps || []) {
    if (!near(p.x, p.y, 200)) continue;
    fill(p.x - 64, p.y - 92, p.x + 64, p.y + 44, EX_APRON, (i, x, y) => { const t = tileAt(x, y); return t === T.GRASS || t === T.SIDEWALK || t === T.LOT || t === T.PLAZA || t === T.DIRT; });
    fill(p.x - 22, p.y - 9, p.x + 22, p.y + 9, EX_ISLAND, null);
  }
}
// cul-de-sac turning circles: an asphalt disk and its pavement ring
function culdesacs(C) {
  const { M, b, WX0, WY0 } = C;
  for (const n of M.nodes) {
    if (!n.culdesac || n.lvl !== 0 || !n.bulb) continue;
    const r = n.bulb, R = r + 2.6 * TILE;
    if (n.x + R < WX0 || n.x - R > WX0 + WN || n.y + R < WY0 || n.y - R > WY0 + WN) continue;
    const e = M.edges[n.edges[0]];
    let k = C.E.indexOf(e);
    if (k < 0) { edgeInfo(M, e); k = C.E.length; C.E.push(e); }
    for (let py = Math.max(0, Math.floor(n.y - R - WY0)); py <= Math.min(WN - 1, Math.ceil(n.y + R - WY0)); py++)
      for (let px = Math.max(0, Math.floor(n.x - R - WX0)); px <= Math.min(WN - 1, Math.ceil(n.x + R - WX0)); px++) {
        const d = Math.hypot(WX0 + px + 0.5 - n.x, WY0 + py + 0.5 - n.y), val = d - r, i = py * WN + px;
        if (d > R) continue;
        if (val < b.rD[i]) { b.rD[i] = val; b.rE[i] = k; b.rS[i] = e.a === n.id ? 0 : edgeInfo(M, e).L; b.rV[i] = 0; }
        if (val < 0) b.aux[i] |= A_BULB;
      }
  }
}
// rounded kerb returns: at every ground junction, the corner between two neighbouring roads gets a quarter
// round of asphalt (radius by class), so the kerb sweeps round the block corner instead of meeting square
function fillets(C) {
  const { M, b, WX0, WY0 } = C;
  for (const n of M.nodes) {
    if (n.lvl !== 0 || n.edges.length < 2) continue;
    if (n.x < WX0 - 400 || n.x > WX0 + WN + 400 || n.y < WY0 - 400 || n.y > WY0 + WN + 400) continue;
    const ids = n.edges.filter((id) => M.edges[id].lvl === 0).sort((p, q) => n.dirs[p] - n.dirs[q]);
    if (ids.length < 2) continue;
    for (let a = 0; a < ids.length; a++) {
      const e1 = M.edges[ids[a]], e2 = M.edges[ids[(a + 1) % ids.length]];
      if (e1 === e2) continue;
      let th = n.dirs[e2.id] - n.dirs[e1.id]; if (a === ids.length - 1) th += Math.PI * 2;
      if (th < 0.35 || th > 2.75) continue;
      const kind = (e) => (e.kind === 'alley' ? 14 : e.kind === 'dirt' ? 18 : CITY.has(e.kind) ? 44 : 30);
      const r = Math.min(Math.min(kind(e1), kind(e2)), 46 * Math.tan(th / 2));   // acute corners get tight returns (no slivers)
      const a1 = n.dirs[e1.id], a2 = n.dirs[e2.id], u1 = [Math.cos(a1), Math.sin(a1)], u2 = [Math.cos(a2), Math.sin(a2)];
      // the kerb lines on the sides facing each other
      let n1 = [-u1[1], u1[0]]; if (n1[0] * u2[0] + n1[1] * u2[1] < 0) n1 = [-n1[0], -n1[1]];
      let n2 = [-u2[1], u2[0]]; if (n2[0] * u1[0] + n2[1] * u1[1] < 0) n2 = [-n2[0], -n2[1]];
      const p1 = [n.x + n1[0] * e1.hw, n.y + n1[1] * e1.hw], p2 = [n.x + n2[0] * e2.hw, n.y + n2[1] * e2.hw];
      const den = u1[0] * u2[1] - u1[1] * u2[0];
      if (Math.abs(den) < 0.05) continue;
      const t1 = ((p2[0] - p1[0]) * u2[1] - (p2[1] - p1[1]) * u2[0]) / den, Cx = p1[0] + u1[0] * t1, Cy = p1[1] + u1[1] * t1;
      const half = th / 2, tl = r / Math.tan(half), bis = [u1[0] + u2[0], u1[1] + u2[1]], bl = Math.hypot(bis[0], bis[1]) || 1;
      const Ox = Cx + bis[0] / bl * r / Math.sin(half), Oy = Cy + bis[1] / bl * r / Math.sin(half);
      const T1 = [Cx + u1[0] * tl, Cy + u1[1] * tl], T2 = [Cx + u2[0] * tl, Cy + u2[1] * tl];
      const kE = C.E.indexOf(e1.hw >= e2.hw ? e1 : e2);
      if (kE < 0) continue;
      const xs = [Cx, T1[0], T2[0], Ox], ys = [Cy, T1[1], T2[1], Oy];
      const bx0 = Math.max(0, Math.floor(Math.min(...xs) - WX0)), bx1 = Math.min(WN - 1, Math.ceil(Math.max(...xs) - WX0));
      const by0 = Math.max(0, Math.floor(Math.min(...ys) - WY0)), by1 = Math.min(WN - 1, Math.ceil(Math.max(...ys) - WY0));
      for (let py = by0; py <= by1; py++) for (let px = bx0; px <= bx1; px++) {
        const X = WX0 + px + 0.5, Y = WY0 + py + 0.5, i = py * WN + px;
        if (b.rD[i] < 0) continue;
        // inside the corner wedge (beyond both kerb lines), within the tangent points, outside the circle
        const q1 = (X - p1[0]) * n1[0] + (Y - p1[1]) * n1[1], q2 = (X - p2[0]) * n2[0] + (Y - p2[1]) * n2[1];
        if (q1 < 0 || q2 < 0) continue;
        const along1 = (X - Cx) * u1[0] + (Y - Cy) * u1[1], along2 = (X - Cx) * u2[0] + (Y - Cy) * u2[1];
        if (along1 > tl + 0.5 || along2 > tl + 0.5) continue;
        const dO = Math.hypot(X - Ox, Y - Oy);
        if (dO <= r) continue;
        b.rD[i] = -0.5; b.rE[i] = kE; b.rS[i] = -1; b.rV[i] = 1e4; b.aux[i] |= A_FILLET;
      }
    }
  }
}
// ramp gores: the strip between a slip ramp and the frontage road is road, chevron-hatched between the lanes
function gores(C) {
  const { M, b, WX0, WY0 } = C;
  for (const gr of M.gores || []) {
    const P = gr.pts, n = P.length;
    if (n < 3) continue;
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const p of P) { x0 = Math.min(x0, p.x, p.qx); y0 = Math.min(y0, p.y, p.qy); x1 = Math.max(x1, p.x, p.qx); y1 = Math.max(y1, p.y, p.qy); }
    const pad = gr.hw + gr.rhw;
    if (x1 + pad < WX0 || x0 - pad > WX0 + WN || y1 + pad < WY0 || y0 - pad > WY0 + WN) continue;
    const side = P.map((p) => { const dx = p.x - p.qx, dy = p.y - p.qy, d = Math.hypot(dx, dy) || 1; return [dx / d, dy / d]; });
    const roadEdge = P.map((p, i) => [p.qx + side[i][0] * (gr.rhw - 2), p.qy + side[i][1] * (gr.rhw - 2)]);
    const rampNear = P.map((p, i) => [p.x - side[i][0] * gr.hw, p.y - side[i][1] * gr.hw]);
    const rampFar = P.map((p, i) => [p.x + side[i][0] * (gr.hw + 1), p.y + side[i][1] * (gr.hw + 1)]);
    const outer = roadEdge.concat(rampFar.slice().reverse()), inner = roadEdge.concat(rampNear.slice().reverse());
    const k = C.E.indexOf(M.edges[gr.road]);
    scanFill(outer, WX0, WY0, (i) => {
      b.aux[i] |= A_GORE;
      if (b.rD[i] >= 0) { b.rD[i] = -0.5; if (k >= 0) { b.rE[i] = k; b.rV[i] = 1e4; b.rS[i] = -1; } }
    });
    scanFill(inner, WX0, WY0, (i) => { b.aux[i] |= A_CHEV; });
    C.gores = C.gores || [];
    C.gores.push({ roadEdge, rampNear, P });
  }
}
// fill a polygon ([x, y] world points) over the window, row by row (even-odd spans); fn(window index)
const XS = new Float64Array(1024);
function scanFill(poly, WX0, WY0, fn) {
  let y0 = 1e9, y1 = -1e9;
  for (const p of poly) { if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; }
  const n = poly.length;
  for (let py = Math.max(0, Math.floor(y0 - WY0)); py <= Math.min(WN - 1, Math.ceil(y1 - WY0)); py++) {
    const y = WY0 + py + 0.5;
    let c = 0;
    for (let a = 0, z = n - 1; a < n; z = a++) {
      const ya = poly[a][1], yz = poly[z][1];
      if ((ya > y) !== (yz > y) && c < XS.length) XS[c++] = poly[a][0] + (y - ya) / (yz - ya) * (poly[z][0] - poly[a][0]);
    }
    const xs = XS.subarray(0, c).sort();
    for (let q = 0; q + 1 < c; q += 2) {
      for (let px = Math.max(0, Math.ceil(xs[q] - WX0 - 0.5)); px <= Math.min(WN - 1, Math.floor(xs[q + 1] - WX0 - 0.5)); px++) fn(py * WN + px);
    }
  }
}
function inPoly(poly, x, y) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i], [xj, yj] = poly[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; }
  return c;
}

// ---- 2b. the railway --------------------------------------------------------------------------------------------
const RAIL_HB = 30;                                    // half width of the ballast bed
function railField(C) {
  const { M, b, WX0, WY0 } = C;
  b.lS.fill(0); b.lV.fill(1e9);
  const R = M.rail;
  if (!R || !R.pts) return;
  const P = R.pts, n = P.length, X1 = WX0 + WN, Y1 = WY0 + WN, rr = RAIL_HB + 2;
  C.railBridge = [];
  for (let i = 0; i < n; i++) {
    const a = P[i], c = P[(i + 1) % n];
    if (a.under || c.under) continue;
    if (Math.max(a.x, c.x) + rr < WX0 || Math.min(a.x, c.x) - rr > X1 || Math.max(a.y, c.y) + rr < WY0 || Math.min(a.y, c.y) - rr > Y1) continue;
    const sx = c.x - a.x, sy = c.y - a.y, L2 = sx * sx + sy * sy || 1e-6, sl = Math.sqrt(L2), nx = -sy / sl, ny = sx / sl, s0 = a.s;
    const bridge = !!(a.bridge || c.bridge) ? 1 : 0;
    for (let py = Math.max(0, Math.floor(Math.min(a.y, c.y) - rr - WY0)); py <= Math.min(WN - 1, Math.ceil(Math.max(a.y, c.y) + rr - WY0)); py++) {
      const Y = WY0 + py + 0.5 - a.y;
      for (let px = Math.max(0, Math.floor(Math.min(a.x, c.x) - rr - WX0)); px <= Math.min(WN - 1, Math.ceil(Math.max(a.x, c.x) + rr - WX0)); px++) {
        const X = WX0 + px + 0.5 - a.x, i2 = py * WN + px;
        let t = (X * sx + Y * sy) / L2; t = t < 0 ? 0 : t > 1 ? 1 : t;
        const dx = X - sx * t, dy = Y - sy * t, d = Math.sqrt(dx * dx + dy * dy);
        if (d > RAIL_HB || d >= Math.abs(b.lV[i2])) continue;
        b.lV[i2] = X * nx + Y * ny; b.lS[i2] = s0 + t * sl;
        b.aux[i2] |= A_RAIL; C.hasRail = 1;
        if (bridge) b.sub[i2] = 1; else b.sub[i2] = 0;
      }
    }
  }
  // (level crossings need no list: track over a road surface becomes a crossing panel in classify())
  // station platforms (open-air): a band beside the track, inner..outer px from its centre, rasterised piece by
  // piece along the line (every pixel of each quad is tested, so the band has no holes)
  for (const st of R.stations || []) {
    if (st.under) continue;
    const half = st.half || 112, inner = st.inner || 40, outer = st.outer || 104, sdn = st.side || 1;
    if (st.x + half + 140 < WX0 || st.x - half - 140 > X1 || st.y + half + 140 < WY0 || st.y - half - 140 > Y1) continue;
    for (let s0 = -half; s0 < half; s0 += 16) {
      const s1 = Math.min(half, s0 + 16), p = railAt(R, st.s + s0), q = railAt(R, st.s + s1);
      const ux = q.x - p.x, uy = q.y - p.y, L = Math.hypot(ux, uy) || 1, tx = ux / L, ty = uy / L, nx = -ty * sdn, ny = tx * sdn;
      const xs = [p.x + nx * inner, p.x + nx * outer, q.x + nx * inner, q.x + nx * outer], ys = [p.y + ny * inner, p.y + ny * outer, q.y + ny * inner, q.y + ny * outer];
      for (let py = Math.max(0, Math.floor(Math.min(...ys) - WY0)); py <= Math.min(WN - 1, Math.ceil(Math.max(...ys) - WY0)); py++)
        for (let px = Math.max(0, Math.floor(Math.min(...xs) - WX0)); px <= Math.min(WN - 1, Math.ceil(Math.max(...xs) - WX0)); px++) {
          const dx = WX0 + px + 0.5 - p.x, dy = WY0 + py + 0.5 - p.y, u = dx * tx + dy * ty, o = dx * nx + dy * ny;
          if (u < 0 || u > L + 0.5 || o < inner || o > outer) continue;
          const i = py * WN + px;
          b.aux[i] |= A_PLAT; C.hasPlat = 1;
          b.lS[i] = s0 + half + u; b.lV[i] = 2000 + (o - inner);          // platform coordinates: along, from the edge (+2000)
        }
    }
  }
}

// ---- 3. classes ------------------------------------------------------------------------------------------------
function classify(C) {
  const { M, b, seed, WX0, WY0, TX0, TY0 } = C;
  const GW = WN / 4 + 2;
  for (let py = 0; py < WN; py++) {
    const Y = WY0 + py, tj = Math.floor(Y / TILE) - TY0, fy = Y / TILE - 0.5 - TY0, j0 = Math.floor(fy), vy = fy - j0, gy = py >> 2, gfy = (py & 3) / 4;
    for (let px = 0; px < WN; px++) {
      const X = WX0 + px, i = py * WN + px, ti = tj * TN + Math.floor(X / TILE) - TX0;
      const t = b.tt[ti];
      let m = b.tm[ti];
      const fx = X / TILE - 0.5 - TX0, i0 = Math.floor(fx), vx = fx - i0, k00 = j0 * TN + i0, fl = b.tfl[k00];
      // --- coastline: smoothed tile wetness, thresholded with a little noise
      if (fl & 1) {
        const wv = (b.tf[k00] * (1 - vx) + b.tf[k00 + 1] * vx) * (1 - vy) + (b.tf[k00 + TN] * (1 - vx) + b.tf[k00 + TN + 1] * vx) * vy;
        if (wv > 0.04 && wv < 0.96) {
          const nz = b.tsand[ti] === 2 && !isSoft(m) ? 0 : (vnc(X, Y, 13, seed + 1) - 0.5) * 0.18 + (vnc(X, Y, 5, seed + 2) - 0.5) * 0.07, v = wv + nz;
          if (SMOOTH[m] && v > 0.5) {                     // the water invades the shore: the wettest corner's water
            const best = corner(b, k00, 1);
            if (best >= 0) m = isWater(b.tm[best]) ? b.tm[best] : M_.SEA;
          } else if (isWater(m) && v < 0.5) {              // the land rounds off into the water's corner
            const best = corner(b, k00, 0);
            if (best >= 0 && SMOOTH[b.tm[best]]) m = b.tm[best];
          }
        }
      }
      // --- lawn against paving: threshold the blurred softness
      if (fl & 2 && (isSoft(m) || b.tso[ti] === 0) && t !== T.WATER && t !== T.DEEP) {
        const sv = (b.tsf[k00] * (1 - vx) + b.tsf[k00 + 1] * vx) * (1 - vy) + (b.tsf[k00 + TN] * (1 - vx) + b.tsf[k00 + TN + 1] * vx) * vy;
        const want = sv > 0.5 ? 1 : 0;
        if ((want === 1) !== isSoft(m)) { const best = softCorner(b, k00, want); if (best >= 0) m = b.tm[best]; }
      }
      // --- soft ground borders: look up the tile through a smooth warp
      if (b.tfl[ti] & 4 && isSoft(m) && t !== T.WATER && t !== T.DEEP) {
        const gi = gy * GW + (px >> 2), gfx = (px & 3) / 4;
        const ox = (b.wx[gi] * (1 - gfx) + b.wx[gi + 1] * gfx) * (1 - gfy) + (b.wx[gi + GW] * (1 - gfx) + b.wx[gi + GW + 1] * gfx) * gfy;
        const oy = (b.wy[gi] * (1 - gfx) + b.wy[gi + 1] * gfx) * (1 - gfy) + (b.wy[gi + GW] * (1 - gfx) + b.wy[gi + GW + 1] * gfx) * gfy;
        const t2 = (Math.floor((Y + oy) / TILE) - TY0) * TN + Math.floor((X + ox) / TILE) - TX0;
        if (t2 >= 0 && t2 < TN * TN && isSoft(b.tm[t2]) && !b.tw[t2]) m = b.tm[t2];
      }
      // --- vectors: roads, sidewalks, shoulders, bridge decks
      const a = b.aux[i];
      let z = 0;
      const k = b.rE[i];
      if (k >= 0) {
        const e = C.E[k], I = e._gb, val = b.rD[i];
        const s = b.rS[i], wetSpan = I.wet.length && inSpans(I.wet, s);
        if (val < 0) {
          if (e.kind === 'dirt' && !(a & (A_FILLET | A_BULB))) m = M_.DIRTROAD;
          else if (wetSpan && !(a & A_FILLET)) { m = DISTRICTS[b.td[ti]].road === 'asphalt_worn' ? M_.DECK : M_.DECKF; z = deckRamp(C, I.wet, s); }
          else m = DISTRICTS[b.td[ti]].road === 'asphalt_worn' ? M_.ROADOLD : M_.ROAD;
          if (e.kind === 'dirt' && (a & A_FILLET)) m = M_.DIRTROAD;
        } else if (I.city && (val < I.walk || (t === T.SIDEWALK && val < I.walk + 18))) {   // (a 112 px pavement fills its 4th tile row)
          if (wetSpan) { if (Math.abs(b.rV[i]) < e.hw + 14) { m = M_.DECKWALK; z = deckRamp(C, I.wet, s) + 3; } }
          else if (t !== T.BUILDING && t !== T.WALL && t !== T.FLOOR && t !== T.COUNTER && t !== T.DOCK && !isWater(m)) {
            m = walkOf(DISTRICTS[b.td[ti]]);
          }
        } else if (e.kind === 'rural' && val < I.walk && isSoft(m)) m = M_.SHOULDER;
        else if (e.kind === 'rural' && val < I.walk + 34 && (m === M_.DIRT || m === M_.MUD) && t === T.DIRT) {
          for (let n = 0; n < 8; n++) { const kk = ti + NB8[n]; const mm = b.tm[kk]; if (isSoft(mm) && mm !== M_.DIRT && mm !== M_.MUD && b.tt[kk] !== T.DIRT) { m = mm; break; } }
        }
        else if (t === T.SIDEWALK && I.city && val < I.walk + 40) {
          for (let n = 0; n < 4; n++) { const kk = ti + NB8[n]; if (isSoft(b.tm[kk]) && !b.tw[kk]) { m = b.tm[kk]; break; } }
        }
      } else if (a & A_UNDER) m = M_.GRAVEL;
      if (a & A_GORE && !(k >= 0 && b.rD[i] < 0)) m = M_.GORE;
      const ex = b.ex[i];
      if (ex && !(k >= 0 && b.rD[i] < 0)) { if (ex & EX_ISLAND) m = M_.ISLAND; else if (ex & EX_APRON) m = M_.APRONG; else if (ex & EX_DRIVE && !isWater(m)) m = M_.DRIVE; }
      // --- the railway over whatever it crosses
      if (a & A_PLAT && !roadLike(m) && !isWater(m)) { m = M_.PLATFORM; z = 6; }
      else if (a & A_RAIL) {
        if (roadLike(m) && m !== M_.SHOULDER) b.aux[i] |= A_XING;
        else if (b.sub[i] || isWater(m) || m === M_.DECK || m === M_.DECKF) { m = M_.RAILDECK; z = C.deckZ; }
        else { m = M_.BALLAST; z = 1; }
      }
      if (raised(m) && !z) z = m === M_.DOCK || m === M_.DOCKX ? 4 : 3;
      b.mat[i] = m; b.zb[i] = z;
    }
  }
}
// the wettest (wet 1) or driest (wet 0) of the four corners of a bilinear cell, among wet / dry tiles
function corner(b, k, wet) {
  let best = -1, bw = wet ? -1 : 2;
  for (let n = 0; n < 4; n++) {
    const kk = k + (n & 1) + (n >> 1) * TN;
    if (wet ? b.tw[kk] && b.tf[kk] > bw : !b.tw[kk] && b.tf[kk] < bw) { bw = b.tf[kk]; best = kk; }
  }
  return best;
}
function softCorner(b, k, want) {
  let best = -1, bv = want ? -1 : 2;
  for (let n = 0; n < 4; n++) { const kk = k + (n & 1) + (n >> 1) * TN; if (b.tso[kk] === want && (want ? b.tsf[kk] > bv : b.tsf[kk] < bv)) { bv = b.tsf[kk]; best = kk; } }
  return best;
}
const NB8 = [-1, 1, -TN, TN, -2, 2, -2 * TN, 2 * TN];
const inSpans = (sp, s) => { for (const [a, c] of sp) if (s >= a && s <= c) return true; return false; };
// a bridge deck rises from the abutment over its first px
function deckRamp(C, sp, s) { for (const [a, c] of sp) if (s >= a && s <= c) return Math.max(0, Math.min(C.deckZ, Math.round(Math.min(s - a, c - s) / 4))); return 0; }

// ---- 4. distance to the shore (chamfer 10 / 14 over the window) --------------------------------------------------
// dist: tenths of a px from each pixel to the nearest land / water boundary (water side and land side alike);
// piers and bridge decks count as water here (they stand over it). Capped: only the first 47 px are used.
const WATERISH = new Uint8Array(256);
function shoreDistance(C) {
  const { b } = C, D = b.dist, Mt = b.mat;
  for (let m = 0; m < NM; m++) WATERISH[m] = isWater(m) || m === M_.DOCK || m === M_.DOCKX || m === M_.DECK || m === M_.DECKF || m === M_.DECKWALK || m === M_.RAILDECK ? 1 : 0;
  const mask = b.wmask || (b.wmask = new Uint8Array(WA));
  let nw = 0;
  for (let i = 0; i < WA; i++) { const w = WATERISH[Mt[i]]; mask[i] = w; nw += w; }
  if (nw === 0 || nw === WA) { D.fill(65535); return; }
  for (let py = 0; py < WN; py++) {
    const r = py * WN;
    for (let px = 0; px < WN; px++) {
      const i = r + px, w = mask[i];
      D[i] = (px > 0 && mask[i - 1] !== w) || (px < WN - 1 && mask[i + 1] !== w) || (py > 0 && mask[i - WN] !== w) || (py < WN - 1 && mask[i + WN] !== w) ? 5 : 65535;
    }
  }
  for (let py = 1; py < WN; py++) {
    const r = py * WN;
    for (let px = 1; px < WN - 1; px++) {
      const i = r + px; let v = D[i];
      const a = D[i - 1] + 10, b2 = D[i - WN] + 10, c = D[i - WN - 1] + 14, d = D[i - WN + 1] + 14;
      if (a < v) v = a; if (b2 < v) v = b2; if (c < v) v = c; if (d < v) v = d;
      D[i] = v;
    }
  }
  for (let py = WN - 2; py >= 0; py--) {
    const r = py * WN;
    for (let px = WN - 2; px >= 1; px--) {
      const i = r + px; let v = D[i];
      const a = D[i + 1] + 10, b2 = D[i + WN] + 10, c = D[i + WN + 1] + 14, d = D[i + WN - 1] + 14;
      if (a < v) v = a; if (b2 < v) v = b2; if (c < v) v = c; if (d < v) v = d;
      D[i] = v;
    }
  }
}

// ---- 4b. surf: how far each texel is from the shoreline, kept in the albedo's alpha for the engine's lighting
// (it draws the waves breaking toward the shore and the swash running up the beach and back from it):
// 191 + px out into the sea or a lake (to 47), 191 - px up a beach (to 30), 255 elsewhere. The alpha is still
// coverage (above a half: drawn), so nothing else changes. Runs last, over the decorations too.
const SURF_LAND = new Uint8Array(NM);
for (const k of ['BEACH', 'WETSAND', 'SHINGLE', 'DUNE', 'ROCKSHORE']) SURF_LAND[M_[k]] = 1;
function surf(C, G) {
  const { b } = C, col = G.col, fl = G.flag;
  for (let y = 0; y < CHUNK; y++) {
    const r = (y + PAD) * WN + PAD;
    for (let x = 0; x < CHUNK; x++) {
      const dd = b.dist[r + x];
      if (dd >= 470) continue;
      const m = b.mat[r + x], gi = y * CHUNK + x;
      if (!(fl[gi] & F_GROUND)) continue;
      const d = Math.round(dd / 10);
      if (m === M_.SEA || m === M_.LAKE) { if (fl[gi] & F_WATER) col[gi * 4 + 3] = 191 + d; }
      else if (SURF_LAND[m] && d <= 30) col[gi * 4 + 3] = 191 - d;
    }
  }
}

// ---- 5. paint --------------------------------------------------------------------------------------------------
const NUP = 255, NMID = 128;
function putN(G, gi, nx, ny) { const j = gi * 4, l = 1 / Math.sqrt(nx * nx + ny * ny + 1); G.nrm[j] = (nx * l * 0.5 + 0.5) * 255; G.nrm[j + 1] = (ny * l * 0.5 + 0.5) * 255; G.nrm[j + 2] = (l * 0.5 + 0.5) * 255; G.nrm[j + 3] = 255; }
function paint(C, G) {
  const { b, seed, WX0, WY0, TX0, TY0 } = C, col = G.col, nrm = G.nrm, zz = G.z, fl = G.flag, emi = G.emi;
  for (let y = 0; y < CHUNK; y++) {
    const py = y + PAD, Y = WY0 + py, fy = Y / TILE - 0.5 - TY0, j0 = Math.floor(fy), vy = fy - j0;
    for (let x = 0; x < CHUNK; x++) {
      const px = x + PAD, X = WX0 + px, i = py * WN + px, gi = y * CHUNK + x, j = gi * 4, m = b.mat[i];
      let c, nx = 0, ny = 0, f = F_GROUND | F_WET, z = b.zb[i];
      if (KIND[m] === 2) {
        const d = Math.min(47, b.dist[i] / 10);
        const fx = X / TILE - 0.5 - TX0, i0 = Math.floor(fx), vx = fx - i0, k00 = j0 * TN + i0;
        const dpt = (b.tdp[k00] * (1 - vx) + b.tdp[k00 + 1] * vx) * (1 - vy) + (b.tdp[k00 + TN] * (1 - vx) + b.tdp[k00 + TN + 1] * vx) * vy;
        const dd = Math.min(1, Math.max(d / 90, dpt));
        const ti = (Math.floor(Y / TILE) - TY0) * TN + Math.floor(X / TILE) - TX0;
        const r = m === M_.SEA ? seaPx(X, Y, d, dd, b.tsand[ti], seed + 13) : stillPx(X, Y, d, m === M_.POND ? Math.min(1, d / 50) : dd, m === M_.RIVER ? 1 : 0, b.tsand[ti] === 1 ? 0 : 1, seed + 17);
        c = r.c; nx = r.nx; ny = r.ny; f = F_GROUND | F_WATER;
        if (r.e) { emi[j] = 255; emi[j + 1] = 246; emi[j + 2] = 222; emi[j + 3] = r.e; }
      } else if (TURFPAL[m] >= 0 && m !== M_.DRYGRASS && m !== M_.ALPINE && m !== M_.FOREST) {
        c = C.q >= 1 ? turfGround(TURFPAL[m], X, Y, seed, TURFCLOV[m]) : turfFlat(TURFPAL[m], X, Y, seed);
      } else {
        gsReset();
        c = SHADER[m](X, Y, seed);
        nx = GS.nx; ny = GS.ny;
        if (GS.h) { z += GS.h; if (m >= M_.WHEAT && m <= M_.HAY) f = F_GROUND | F_WET | F_LEAF; }
        if (GS.water) f = F_GROUND | F_WATER | F_WET;
      }
      col[j] = c[0]; col[j + 1] = c[1]; col[j + 2] = c[2]; col[j + 3] = 255;
      if (nx || ny) putN(G, gi, nx, ny); else { nrm[j] = NMID; nrm[j + 1] = NMID; nrm[j + 2] = NUP; nrm[j + 3] = 255; }
      zz[gi] = z; fl[gi] = f;
    }
  }
}
function interior(kind, x, y, s) {                        // the indoor floors (shop tiles, wooden floors)
  if (kind === 'tileWhite') { const S = 12, lx = x % S, ly = y % S; let t = 0.6 + (hh(Math.floor(x / S), Math.floor(y / S), s + 3) - 0.5) * 0.12; if (lx === 0 || ly === 0) t -= 0.28; else if (lx === 1 || ly === 1) t += 0.08; return sd(TILEW, t, x, y, 0.4); }
  const row = Math.floor(y / 6), off = (row * 37) % 60, lx = (x + off) % 60;
  let t = 0.55 + (hh(Math.floor((x + off) / 60), row, s + 9) - 0.5) * 0.25; if (y % 6 === 0 || lx === 0) t -= 0.25;
  return sd(MAT.woodDock, t, x, y, 0.4);
}
const TILEW = MAT.concrete;

// ---- 6. road markings, wear and street furniture on the ground -------------------------------------------------------
const WHITE = MAT.paintWhite, YELLOW = ramp('#d6c24e', 4, 2, { dark: 0.4 });
function setC(G, gi, c) { const j = gi * 4; G.col[j] = c[0]; G.col[j + 1] = c[1]; G.col[j + 2] = c[2]; }
function darken(G, gi, k) { k = k < 0 ? 0 : k > 1 ? 1 : k; const j = gi * 4; G.col[j] *= k; G.col[j + 1] *= k; G.col[j + 2] *= k * 1.03; }
function lineSpec(e) {
  const L = [], hw = e.hw, k = e.kind;
  const add = (o, w, colr, on = 0, off = 0, a = 1) => L.push([o, w / 2, colr, on, off, a]);
  if (k === 'ave' || k === 'blvd') {
    add(4, 2.5, 1); add(-4, 2.5, 1);
    for (const sg of [1, -1]) { for (let n = 0; n < e.nl - 1; n++) add(sg * (laneOffset(e, n) + laneOffset(e, n + 1)) / 2, 2.5, 0, 22, 26); add(sg * (hw - 9), 2, 0, 0, 0, 0.75); }
  } else if (k === 'front') { add(0, 2.5, 0, 22, 26); for (const sg of [1, -1]) add(sg * (hw - 9), 2, 0, 0, 0, 0.75); }
  else if (k === 'st' || k === 'drive') { add(0, 2.5, 1, 20, 20); for (const sg of [1, -1]) add(sg * (hw - 8), 2, 0, 0, 0, 0.55); }
  else if (k === 'minor') add(0, 2, 0, 14, 20, 0.8);
  else if (k === 'rural') { add(0, 2, 1, 24, 30, 0.85); for (const sg of [1, -1]) add(sg * (hw - 6), 1.6, 0, 0, 0, 0.5); }
  else if (k === 'art') { add(3, 2.5, 1); add(-3, 2.5, 1); for (const sg of [1, -1]) add(sg * (hw - 9), 2, 0, 0, 0, 0.75); }
  else if (k === 'hwy') {
    for (const sg of [1, -1]) {
      add(sg * (e.median / 2 - 2), 2.5, 1);
      for (let n = 0; n + 1 < e.nl; n++) add(sg * (laneOffset(e, n) + laneOffset(e, n + 1)) / 2, 3, 0, 26, 30);
      add(sg * (hw - 9), 2.5, 0, 0, 0, 0.85);
    }
  } else if (k === 'ramp') for (const sg of [1, -1]) add(sg * (hw - 7), 2, 0, 0, 0, 0.8);
  return L;
}
function markings(C, G) {
  const { M, b, seed, WX0, WY0, TX0, TY0, q } = C, A2 = C.ap === 2;
  for (const e of C.E) { if (!e._gb.lines) { const L = lineSpec(e); e._gb.lines = Float32Array.from(L.flat()); } }
  for (let y = 0; y < CHUNK; y++) {
    const py = y + PAD, rpy = (A2 ? y & ~1 : y) + PAD, Y = WY0 + rpy;
    for (let x = 0; x < CHUNK; x++) {
      const px = x + PAD, i = py * WN + px, m = b.mat[i];
      if (m !== M_.ROAD && m !== M_.ROADOLD && m !== M_.DECK && m !== M_.DECKF && m !== M_.GORE && m !== M_.DIRTROAD) continue;
      // (the paint of the art pixel this px is in: read at its top-left px - A2 - for all four of its px)
      const rpx = (A2 ? x & ~1 : x) + PAD, ri = rpy * WN + rpx;
      const X = WX0 + rpx, gi = y * CHUNK + x, k = b.rE[ri], a = b.aux[ri];
      let wear = b.twear[(Math.floor(Y / TILE) - TY0) * TN + Math.floor(X / TILE) - TX0];
      if (a & A_CHEV) { chevron(C, G, gi, X, Y); continue; }
      if (k < 0) continue;
      const e = C.E[k], I = e._gb, s = b.rS[ri], v = b.rV[ri];
      if (e.kind === 'hwy' || e.kind === 'ramp') wear = Math.min(wear, 0.12);
      if (e.kind === 'hwy' && Math.abs(v) < e.median / 2 - 4 && s > I.t0 - 6 && s < I.t1 + 6) {     // the concrete median
        const av = Math.abs(v), edge = av > e.median / 2 - 6;
        setC(G, gi, sd(MEDIAN, edge ? 0.3 : 0.55 + (hh(X >> 2, Y, C.seed) - 0.5) * 0.12, X, Y, 0.3)); G.z[gi] = edge ? 2 : 4; putN(G, gi, 0, edge ? 0.8 : 0);
        continue;
      }
      if (e.kind === 'blvd' && Math.abs(v) < 6 && s > I.t0 && s < I.t1) {                          // a planted median
        const av = Math.abs(v);
        setC(G, gi, av > 4.5 ? sd(MAT.curb, 0.7, X, Y, 0.3) : GSHADE.grassPark(X, Y, C.seed)); G.z[gi] = 3;
        continue;
      }
      if (m === M_.DIRTROAD) {                                    // wheel ruts and the grassy hump between them
        const av = Math.abs(v);
        if (av > 14 && av < 30) { darken(G, gi, av > 18 && av < 26 ? 0.8 : 0.9); if (hh(X, Y, seed) > 0.97) setC(G, gi, sd(MAT.soil, 0.3, X, Y, 0)); }
        else if (av < 7 && vnc(X, Y, 9, seed + 3) > 0.45 && e.kind === 'dirt') { const c = GSHADE.grassMeadow(X, Y, seed); setC(G, gi, c); }
        continue;
      }
      if (a & (A_FILLET | A_BULB) || s < 0 || v > 9e3) { roadWear(C, G, gi, X, Y, wear, 0, 0, e); continue; }
      roadWear(C, G, gi, X, Y, wear, s, v, e);
      // lane lines (not in the junction boxes, nor on short links between two junctions)
      if (s >= I.t0 && s <= I.t1 && !I.linked && Math.abs(v) < e.hw) {
        const Ls = I.lines;
        for (let n = 0; n < Ls.length; n += 6) {
          const o = Ls[n], h = Ls[n + 1], on = Ls[n + 3], off = Ls[n + 4], al = Ls[n + 5], dv = v - o;
          if (dv > h || dv < -h) continue;
          if (on && (((s % (on + off)) + on + off) % (on + off)) >= on) continue;
          if (e.kind === 'blvd' && o < 6 && o > -6) continue;
          if (hh(X, Y, seed + 41) > 0.97 - wear * 0.3 || (al < 0.8 && Math.abs(dv) > h - 0.5 && hh(X, Y, seed + 45) > al)) continue;   // worn paint
          setC(G, gi, sd(Ls[n + 2] ? YELLOW : WHITE, 0.55 + (hh(X, Y, seed + 43) - 0.5) * 0.3, X, Y, 0));
        }
      }
      // tyre tracks: two darker bands per lane, polished by traffic
      if (s >= I.t0 && s <= I.t1 && e.kind !== 'alley') {
        const lw = e.oneway ? e.w / e.nl : (e.w / 2 - e.median / 2) / e.nl, av = Math.abs(v) - (e.oneway ? -e.w / 2 : e.median / 2), lo = ((av % lw) + lw) % lw;
        if (Math.abs(lo - lw * 0.3) < 5 || Math.abs(lo - lw * 0.7) < 5) darken(G, gi, 0.94);
        else if (Math.abs(lo - lw * 0.5) < 3 && vnc(X, Y, 7, seed + 51) > 0.7) darken(G, gi, 0.82);   // oil drips mid-lane
      }
      if (e.kind === 'alley') { const av = Math.abs(v); if (av < 2) darken(G, gi, 0.75); else if (av > e.hw - 7) darken(G, gi, 0.82 + (e.hw - av) * 0.02); }
    }
  }
  stopLines(C, G);
  crossings(C, G);
  parking(C, G); venues(C, G); runways(C, G);                       // (at every quality: they matter for play)
  if (q >= 1) { arrows(C, G); covers(C, G); }
  if (C.hasRail) railTrack(C, G);
  if (C.hasPlat) platforms(C, G);
}
// broken asphalt by wealth: alligator cracking, patches of newer asphalt, potholes, fine cracks
function roadWear(C, G, gi, X, Y, wear, s, v, e) {
  const sd0 = C.seed;
  if (e && e._gb.city && s > 0) {                                  // grime collects in the gutter along the kerb
    const av = Math.abs(v);
    if (av > e.hw - 7 && av <= e.hw + 1) darken(G, gi, 0.86 + (e.hw - av) * 0.015 + (hh(X, Y, sd0 + 77) - 0.5) * 0.05);
  }
  if (wear < 0.12) return;
  if (wear >= 0.2) {                                               // long hairline cracks
    const w = worley(X * 0.7 + 0.5, Y * 0.7 + 0.5, 29, sd0 + 79, 0.95);
    if (w.d2 - w.d1 < 0.42 && vnc(X, Y, 61, sd0 + 81) > 0.82 - wear * 0.35) { darken(G, gi, 0.72); return; }
  }
  if (vnc(X, Y, 53, sd0 + 61) > 1.1 - wear * 0.45) {
    const w = worley(X + 0.5, Y + 0.5, 7, sd0 + 63, 0.9);
    if (w.d2 - w.d1 < 0.7) { darken(G, gi, 0.6); return; }
  }
  if (e && s > 0 && e.kind !== 'hwy' && e.kind !== 'ramp') {      // patches of newer asphalt, cut square along the lane
    const seg = Math.floor(s / 70), lane = Math.floor((v + 400) / 40), ph = hh(seg + e.id * 977, lane, sd0 + 65);
    if (ph < wear * 0.16) {
      const ls = s - seg * 70, lv = v + 400 - lane * 40, a0 = 6 + hh(seg, lane, sd0 + 66) * 14, a1 = 50 + hh(seg, lane, sd0 + 67) * 18, w0 = 2 + hh(seg, lane, sd0 + 68) * 8, w1 = 30 + hh(seg, lane, sd0 + 69) * 9;
      if (ls > a0 && ls < a1 && lv > w0 && lv < w1) { const rim = ls < a0 + 1.2 || ls > a1 - 1.2 || lv < w0 + 1.2 || lv > w1 - 1.2; darken(G, gi, rim ? 0.7 : 0.88); return; }
    }
  }
  if (wear > 0.5 && e && s > 0 && Math.abs(v) > e.hw - 26 && vnc(X, Y, 19, sd0 + 71) > 1.2 - wear * 0.45) {   // a puddle in the gutter
    setC(G, gi, sd(PUDDLE, 0.3 + (vnc(X, Y, 5, sd0 + 73) - 0.5) * 0.4, X, Y, 0.4)); G.flag[gi] = F_GROUND | F_WATER | F_WET; return;
  }
  if (wear > 0.6) {                                               // potholes
    const w = worley(X + 0.5, Y + 0.5, 61, sd0 + 67, 0.9);
    const r = 4 + w.h * 7;
    if (w.h > 1.35 - wear * 0.45 && w.d1 < r) { const t = w.d1 / r; if (t > 0.75) darken(G, gi, 0.8); else { setC(G, gi, sd(POTHOLE, 0.25 + (w.dy > 0 ? 0.35 : 0) - t * 0.2, X, Y, 0.4)); G.flag[gi] |= F_WATER; } }
  }
}
const POTHOLE = MAT.asphalt, MEDIAN = MAT.stone, PUDDLE = ramp('#3a4a5c', 5, 2, { dark: 0.5, light: 0.45 });
function chevron(C, G, gi, X, Y) {
  // diagonal white bars within the gore
  if (((X + Y) % 22 + 22) % 22 < 4 && hh(X, Y, C.seed) > 0.08) setC(G, gi, sd(WHITE, 0.6, X, Y, 0));
}
// visit the chunk pixels inside a rotated rectangle: centre (x, y), unit direction (ux, uy) of its u axis, half
// extents hu (along u) and hv (across, v positive to the right of u); fn(gi, u, v, gx, gy, i) (i: window index)
// (ap 2: u, v at the centre of each px's art pixel and gx, gy its top-left - one decision per art pixel)
function rect(C, x, y, ux, uy, hu, hv, fn) {
  const ex = Math.abs(ux) * hu + Math.abs(uy) * hv, ey = Math.abs(uy) * hu + Math.abs(ux) * hv, A2 = C.ap === 2;
  let x0 = Math.max(0, Math.floor(x - ex - C.X0)), x1 = Math.min(CHUNK - 1, Math.ceil(x + ex - C.X0));
  let y0 = Math.max(0, Math.floor(y - ey - C.Y0)), y1 = Math.min(CHUNK - 1, Math.ceil(y + ey - C.Y0));
  if (A2) { x0 &= ~1; y0 &= ~1; x1 = Math.min(CHUNK - 1, x1 | 1); y1 = Math.min(CHUNK - 1, y1 | 1); }
  for (let gy = y0; gy <= y1; gy++) for (let gx = x0; gx <= x1; gx++) {
    const qx = A2 ? gx & ~1 : gx, qy = A2 ? gy & ~1 : gy, h = A2 ? 1 : 0.5;
    const dx = qx + C.X0 + h - x, dy = qy + C.Y0 + h - y, u = dx * ux + dy * uy, v = dy * ux - dx * uy;
    if (u < -hu || u > hu || v < -hv || v > hv) continue;
    fn(gy * CHUNK + gx, u, v, qx, qy, (gy + PAD) * WN + gx + PAD);
  }
}
function plot(C, G, X, Y, fn) {
  let x = Math.floor(X - C.X0), y = Math.floor(Y - C.Y0);
  if (C.ap === 2) {   // (the whole art pixel)
    x &= ~1; y &= ~1;
    for (let k = 0; k < 4; k++) { const xx = x + (k & 1), yy = y + (k >> 1); if (xx >= 0 && yy >= 0 && xx < CHUNK && yy < CHUNK) fn(yy * CHUNK + xx, x, y); }
    return;
  }
  if (x >= 0 && y >= 0 && x < CHUNK && y < CHUNK) fn(y * CHUNK + x, x, y);
}
// stop lines on the approaches to signalled junctions (across the lanes arriving at the junction)
function stopLines(C, G) {
  const { M, b } = C;
  for (const e of C.E) {
    if (e.lvl !== 0 || e.kind === 'alley' || e.kind === 'minor' || e.kind === 'dirt' || e.kind === 'hwy') continue;
    for (const end of [e.a, e.b]) {
      const n = M.nodes[end];
      if (!n || n.lvl !== 0 || !n.light || n.edges.length < 3) continue;
      const t = n.trim[e.id] || 0, atA = end === e.a;
      if (t < 8 || (e.oneway && atA) || e._gb.linked) continue;
      const s = atA ? t + 48 : e._gb.L - t - 48;
      if (s < 0 || s > e._gb.L) continue;
      const p = pointOn(e.pts, s);
      const v0 = e.oneway || atA ? -e.hw + 6 : 2, v1 = e.oneway || !atA ? e.hw - 6 : -2, vc = (v0 + v1) / 2;
      rect(C, p.x - p.ty * vc, p.y + p.tx * vc, p.tx, p.ty, 2.5, (v1 - v0) / 2, (gi, u, v, gx, gy, i) => { if (roadLike(b.mat[i])) setC(G, gi, sd(WHITE, 0.62, gx, gy, 0)); });
    }
  }
}
// zebra crossings (or herringbone brick crosswalks with white edges in rich districts)
function crossings(C, G) {
  const { M, b, seed } = C;
  const xs = zebraCrossings(M);
  for (const xc of xs.values()) {
    if (Math.abs(xc.x - C.X0 - CHUNK / 2) > CHUNK / 2 + xc.hw + 40 || Math.abs(xc.y - C.Y0 - CHUNK / 2) > CHUNK / 2 + xc.hw + 40) continue;
    const HL = 24, HW = xc.hw + 3, ti = Math.floor(xc.y / TILE) * MAP_W + Math.floor(xc.x / TILE), lux = (DISTRICTS[M.dist[ti]] || DISTRICTS[1]).tier === 'lux';
    rect(C, xc.x, xc.y, Math.cos(xc.a), Math.sin(xc.a), HL, HW, (gi, u, w, gx, gy, i) => {
      const m = b.mat[i];
      if (m !== M_.ROAD && m !== M_.ROADOLD) return;
      const X = gx + C.X0, Y = gy + C.Y0;
      if (lux) { if (Math.abs(Math.abs(u) - HL + 1.5) < 1.5) setC(G, gi, sd(WHITE, 0.6, X, Y, 0)); else setC(G, gi, GSHADE.brickHerring(X, Y, seed)); return; }
      const st = ((w + HW) % 14 + 14) % 14;
      if (st < 8 && hh(X, Y, seed + 5) > 0.05 && (vnc(X, Y, 9, seed + 7) > 0.08 || hh(X, Y, seed + 9) > 0.5)) setC(G, gi, sd(WHITE, 0.6 + (st < 1 ? 0.12 : st > 6 ? -0.1 : 0), X, Y, 0));
    });
  }
}
// direction arrows on one-way frontage roads
function arrows(C, G) {
  const { b } = C;
  for (const e of C.E) {
    if (!(e.kind === 'front' && e.oneway)) continue;
    const I = e._gb;
    for (let s = I.t0 + 140; s < I.t1 - 60; s += 420) {
      const p = pointOn(e.pts, s);
      for (let ln = 0; ln < e.nl; ln++) {
        const o = laneOffset(e, ln);
        rect(C, p.x - p.ty * o, p.y + p.tx * o, p.tx, p.ty, 18, 10, (gi, u, w, gx, gy, i) => {
          if ((u < 4 && Math.abs(w) < 3) || (u >= 4 && Math.abs(w) < (18 - u) * 0.72)) if (roadLike(b.mat[i])) setC(G, gi, sd(WHITE, 0.6, gx, gy, 0));
        });
      }
    }
  }
}
// manholes on the road, drains at the kerb near each end of a block
function covers(C, G) {
  const { b, seed } = C;
  for (const e of C.E) {
    if (e.lvl !== 0 || e.kind === 'dirt' || e.kind === 'rural' || e.kind === 'hwy') continue;
    const I = e._gb;
    for (let s = I.t0 + 60 + hh(e.id, 1, seed) * 120; s < I.t1 - 30; s += 300 + hh(e.id, Math.floor(s), seed) * 200) {
      const p = pointOn(e.pts, s), o = (hh(e.id, Math.floor(s) + 3, seed) - 0.5) * e.hw;
      rect(C, p.x - p.ty * o, p.y + p.tx * o, 1, 0, 7, 7, (gi, x, y, gx, gy, i) => {
        const d = Math.hypot(x, y);
        if (d > 6.8 || !roadLike(b.mat[i])) return;
        let t = d > 5.6 ? 0.08 : ((Math.round(x) + Math.round(y)) & 3) === 0 ? 0.55 : 0.32;
        if (d > 4.4 && d <= 5.6) t = 0.62;
        setC(G, gi, sd(MAT.metalDark, t + (x + y < 0 ? 0.08 : 0), gx, gy, 0.3));
      });
    }
    if (!I.city) continue;
    for (const s of [I.t0 + 62, I.t1 - 62]) for (const sg of [1, -1]) {
      if (s < 0 || s > I.L) continue;
      const p = pointOn(e.pts, s), o = sg * (e.hw - 5);
      rect(C, p.x - p.ty * o, p.y + p.tx * o, p.tx, p.ty, 7, 2.5, (gi, u, w, gx, gy, i) => {
        if (!roadLike(b.mat[i])) return;
        setC(G, gi, Math.abs(w) > 1.8 || Math.abs(u) > 6 ? MAT.metalDark[3] : (Math.floor(u + 7) & 1) ? MAT.metalDark[0] : MAT.metalDark[2]);
      });
    }
  }
}
function propsNear(C, pad) {
  if (C._props && C._props.pad >= pad) return C._props.list;
  const X0 = C.X0 - pad, Y0 = C.Y0 - pad, X1 = C.X0 + CHUNK + pad, Y1 = C.Y0 + CHUNK + pad;
  const list = (C.M.props || []).filter((p) => p.x >= X0 && p.x < X1 && p.y >= Y0 && p.y < Y1);
  C._props = { pad, list };
  return list;
}
// parking stalls: white lines either side of each spot, an oil stain where the engine sits
function parking(C, G) {
  const { M, b, seed } = C;
  for (const sp of M.parking || []) {
    if (sp.x < C.X0 - 80 || sp.x > C.X0 + CHUNK + 80 || sp.y < C.Y0 - 80 || sp.y > C.Y0 + CHUNK + 80) continue;
    const HL = 52, HW = 31;
    rect(C, sp.x, sp.y, Math.cos(sp.a), Math.sin(sp.a), HL, HW, (gi, u, w, gx, gy, i) => {
      if (!roadLike(b.mat[i])) return;
      const X = gx + C.X0, Y = gy + C.Y0;
      if (Math.abs(Math.abs(w) - HW + 1) < 1.1 && u > -HL + 6) { if (hh(X, Y, seed + 3) > 0.1) setC(G, gi, sd(WHITE, 0.58, X, Y, 0)); }
      else if (Math.hypot(u - 22, w * 1.4) < 12 && vnc(X, Y, 4, seed + 71) > 0.45) darken(G, gi, 0.82);
    });
  }
}
// sports courts and pitches laid on the ground
function venues(C, G) {
  const { M, b } = C;
  for (const v of M.venues || []) {
    const r = v.rect;
    if (r.x > C.X0 + CHUNK || r.x + r.w < C.X0 || r.y > C.Y0 + CHUNK || r.y + r.h < C.Y0) continue;
    const pitch = v.kind === 'soccer', lc = pitch ? WHITE : MAT.woodDark;
    const line = (X, Y) => plot(C, G, X, Y, (gi, x, y) => setC(G, gi, sd(lc, pitch ? 0.68 : 0.5, x, y, 0)));
    for (let X = r.x; X <= r.x + r.w; X += 0.5) for (const Y of [r.y, r.y + 1, r.y + r.h - 1, r.y + r.h]) line(X, Y);
    for (let Y = r.y; Y <= r.y + r.h; Y += 0.5) for (const X of [r.x, r.x + 1, r.x + r.w - 1, r.x + r.w]) line(X, Y);
    if (pitch) {
      for (let Y = r.y; Y <= r.y + r.h; Y += 0.5) line(r.x + r.w / 2, Y);
      for (let a = 0; a < 6.283; a += 0.01) line(r.x + r.w / 2 + Math.cos(a) * r.h * 0.18, r.y + r.h / 2 + Math.sin(a) * r.h * 0.18);
      const bw = Math.min(r.w * 0.12, 90), bh = r.h * 0.5;
      for (const sx of [0, 1]) { const x0 = sx ? r.x + r.w - bw : r.x; for (let X = x0; X <= x0 + bw; X += 0.5) { line(X, r.y + (r.h - bh) / 2); line(X, r.y + (r.h + bh) / 2); } for (let Y = r.y + (r.h - bh) / 2; Y <= r.y + (r.h + bh) / 2; Y += 0.5) line(sx ? x0 : x0 + bw, Y); }
    } else for (let Y = r.y; Y <= r.y + r.h; Y += 0.5) line(v.netX ?? r.x + r.w / 2, Y);
  }
}
// airport runways: edge lines, a dashed centre line, threshold bars; taxiways get a yellow centre line
function runways(C, G) {
  const { M } = C;
  for (const ap of M.airports || []) {
    const r = ap.runway, tx = ap.taxi;
    if (r && !(r.x > C.X0 + CHUNK || r.x + r.w < C.X0 || r.y > C.Y0 + CHUNK || r.y + r.h < C.Y0)) {
      const vert = r.h > r.w, len = vert ? r.h : r.w, wid = vert ? r.w : r.h;
      for (let a = 0; a < len; a += 1) for (let w = 0; w < wid; w += 1) {
        const X = vert ? r.x + w : r.x + a, Y = vert ? r.y + a : r.y + w;
        const edge = w > 10 && w < 14 || (w > wid - 14 && w < wid - 10), centre = Math.abs(w - wid / 2) < 2 && (a % 90) < 50 && a > 200 && a < len - 200;
        const thr = (a < 120 || a > len - 120) && (a % 120 > 30 && a % 120 < 110) && ((w - 30) % 26 + 26) % 26 < 14 && w > 30 && w < wid - 30;
        if (edge || centre || thr) plot(C, G, X, Y, (gi, x, y) => setC(G, gi, sd(WHITE, 0.62, x, y, 0)));
        else if (hh(X >> 2, Y >> 2, 5) > 0.97 && ((a % 300) < 30)) plot(C, G, X, Y, (gi) => darken(G, gi, 0.85));    // tyre marks
      }
    }
    if (tx && !(tx.x > C.X0 + CHUNK || tx.x + tx.w < C.X0 || tx.y > C.Y0 + CHUNK || tx.y + tx.h < C.Y0)) {
      const vert = tx.h > tx.w;
      for (let a = 0; a < (vert ? tx.h : tx.w); a++) for (let w = -1; w <= 1; w++) plot(C, G, vert ? tx.x + tx.w / 2 + w : tx.x + a, vert ? tx.y + a : tx.y + tx.h / 2 + w, (gi, x, y) => setC(G, gi, sd(YELLOW, 0.6, x, y, 0)));
    }
  }
}
// the railway: sleepers on ballast, two rails; level-crossing panels with the rails let in; trestle decks over water
const SLEEPER = MAT.woodDark;
function railTrack(C, G) {
  const { b, seed } = C;
  for (let y = 0; y < CHUNK; y++) for (let x = 0; x < CHUNK; x++) {
    const i = (y + PAD) * WN + x + PAD;
    if (!(b.aux[i] & A_RAIL)) continue;
    const gi = y * CHUNK + x, s = b.lS[i], v = b.lV[i], av = Math.abs(v), X = x + C.X0, Y = y + C.Y0, m = b.mat[i];
    const xing = b.aux[i] & A_XING, deck = m === M_.RAILDECK;
    if (xing) {                                                  // a rubber-and-concrete crossing panel
      if (av < 23) { const lx = ((s % 24) + 24) % 24; setC(G, gi, sd(PANEL, lx < 1 ? 0.1 : 0.45 + (hh(X, Y, seed) - 0.5) * 0.2, X, Y, 0.4)); }
    } else if (deck) {
      if (av > 30) continue;
      if (av > 27) { setC(G, gi, sd(MAT.metalDark, av > 29 ? 0.15 : 0.5, X, Y, 0.3)); G.z[gi] = C.deckZ + 4; continue; }   // girders
      const lx = ((s % 18) + 18) % 18;
      setC(G, gi, sd(SLEEPER, lx < 12 ? 0.5 + (hh(Math.floor(s / 18), 1, seed) - 0.5) * 0.3 + (lx === 0 ? 0.15 : 0) : 0.1, X, Y, 0.4));
    } else if (av < 22) {                                        // sleepers
      const lx = ((s % 18) + 18) % 18;
      if (lx < 10 && av < 21) { setC(G, gi, sd(SLEEPER, 0.42 + (lx === 0 ? 0.18 : 0) + (hh(Math.floor(s / 18), 3, seed) - 0.5) * 0.25 - (av > 19 ? 0.1 : 0), X, Y, 0.4)); G.z[gi] = 2; }
    } else if (av > 26) darken(G, gi, 0.88);                     // the ballast shoulder falls away
    // the rails (both cases): 2 px of steel with a bright running surface, a dark base
    const ra = Math.abs(av - 12);
    if (ra < 1.6) { setC(G, gi, ra < 0.6 ? MAT.chrome[4] : v > 0 === av > 12 ? MAT.metal[3] : MAT.metalDark[1]); G.z[gi] = (deck ? C.deckZ : 0) + 3; G.flag[gi] = F_GROUND | F_WET; }
    else if (ra < 2.6 && !xing) setC(G, gi, MAT.metalDark[0]);
  }
}
const PANEL = MAT.asphaltWorn;
// station platforms: paving, a pale coping at the track edge, the yellow line, tactile studs; a face down to the track
function platforms(C, G) {
  const { b, seed } = C;
  for (let y = 0; y < CHUNK; y++) for (let x = 0; x < CHUNK; x++) {
    const i = (y + PAD) * WN + x + PAD;
    if (b.mat[i] !== M_.PLATFORM) continue;
    const gi = y * CHUNK + x, o = b.lV[i] - 2000, X = x + C.X0, Y = y + C.Y0;
    if (o < 5) setC(G, gi, sd(MAT.curb, 0.85 - (o < 1.5 ? 0.25 : 0), X, Y, 0.3));
    else if (o < 9) setC(G, gi, sd(YELLOW, 0.6, X, Y, 0.3));
    else if (o < 15 && ((Math.floor(b.lS[i] / 4) + (y & 1)) & 1) && (x & 1)) setC(G, gi, sd(YELLOW, 0.45, X, Y, 0.3));
  }
}

// ---- 7. edges: kerbs and their faces, quay walls, pier faces, wet sand, banks, lawn edges, deck parapets -----------
function edges(C, G) {
  const { b, seed } = C;
  const M = b.mat, Z = b.zb;
  const hyd = propsNear(C, 40).filter((p) => p.t === 'hydrant');
  // bollards on the quays: every so often along a paved edge over the water (the window margin too, so a bollard
  // on a chunk border comes out whole in both chunks)
  for (let y = -4; y < CHUNK + 4; y++) for (let x = -4; x < CHUNK + 4; x++) {
    const i = (y + PAD) * WN + x + PAD, X = x + C.X0, Y = y + C.Y0;
    if (KIND[M[i]] !== 4 || M[i] === M_.DOCK || M[i] === M_.DOCKX || ((X * 7 + Y * 13) % 151) !== 0) continue;
    if (!(isWater(M[i + 3 * WN]) || isWater(M[i - 3 * WN]) || isWater(M[i + 3]) || isWater(M[i - 3])) || isWater(M[i + WN]) || isWater(M[i - WN]) || isWater(M[i + 1]) || isWater(M[i - 1])) continue;
    for (let v = -3; v <= 3; v++) for (let u = -3; u <= 3; u++) {
      const d = u * u + v * v; if (d > 9) continue;
      const gx = x + u, gy = y + v; if (gx < 0 || gy < 0 || gx >= CHUNK || gy >= CHUNK) continue;
      const gi = gy * CHUNK + gx; setC(G, gi, d > 6 ? MAT.metalDark[0] : u + v < -1 ? MAT.metalDark[4] : MAT.metalDark[2]); G.z[gi] = Z[i] + (d > 6 ? 3 : 6); putN(G, gi, u * 0.25, v * 0.25);
    }
  }
  for (let y = 0; y < CHUNK; y++) for (let x = 0; x < CHUNK; x++) {
    const py = y + PAD, px = x + PAD, i = py * WN + px, gi = y * CHUNK + x, m = M[i], X = x + C.X0, Y = y + C.Y0;
    const k = KIND[m];
    if (k === 4) {
      if (m === M_.DECKWALK) {                                  // the walkway on a bridge: a parapet on its outer edge
        const e = C.E[b.rE[i]], av = e ? Math.abs(b.rV[i]) - e.hw : 0;
        if (av > 10) { setC(G, gi, av > 12.5 ? MAT.metalDark[1] : sd(MAT.concrete, 0.82, X, Y, 0.3)); G.z[gi] = Z[i] + (av > 12.5 ? 9 : 5); continue; }
      }
      if (m === M_.DOCK || m === M_.DOCKX) {                    // pilings along the pier's edges
        const along = m === M_.DOCK ? Y : X;
        if (b.dist[i] < 40 && ((along % 44) + 44) % 44 < 3) { setC(G, gi, sd(MAT.woodDark, 0.2 + (((along % 44) + 44) % 44 === 0 ? 0.25 : 0), X, Y, 0.3)); G.z[gi] = 8; }
        continue;
      }
      if (m === M_.PATH) {                                      // a path's edge: compacted, grass creeping in
        let soft = 0;
        for (let r = 1; r <= 2 && !soft; r++) if (isSoft(M[i - r]) || isSoft(M[i + r]) || isSoft(M[i - r * WN]) || isSoft(M[i + r * WN])) soft = r;
        if (soft) { if (hh(X, Y, seed + 3) > 0.6) setC(G, gi, GSHADE.grassPark(X, Y, seed)); else darken(G, gi, 0.84); }
        continue;
      }
      // a paved surface: kerb stones where it meets a road or the water
      let near = 0;
      for (let r = 1; r <= 3 && !near; r++) if (low(M[i - r]) || low(M[i + r]) || low(M[i - r * WN]) || low(M[i + r * WN])) near = r;
      if (near && m !== M_.DOCK && m !== M_.DOCKX && m !== M_.BOARD && m !== M_.BOARDV) {
        const wetSide = isWater(M[i - near]) || isWater(M[i + near]) || isWater(M[i - near * WN]) || isWater(M[i + near * WN]);
        let R = wetSide ? MAT.concrete : MAT.curb;
        if (!wetSide) for (const h of hyd) if (Math.abs(h.x - X) < 24 && Math.abs(h.y - Y) < 24) { R = MAT.kerbRed; break; }
        setC(G, gi, sd(R, near === 1 ? 0.5 : near === 2 ? 0.88 : 0.74 + (hh(X >> 3, Y >> 3, seed) - 0.5) * 0.12, X, Y, 0.3));
      }
    } else if (k === 3 || k === 2) {
      // the face of a raised edge just north of this pixel, facing the camera: kerbs over roads, quay walls, pier
      // and deck sides and earth banks over the water (scan up through this pixel's own kind of low ground)
      for (let r = 1; r <= 12; r++) {
        if (py - r < 0) break;
        const up = M[i - r * WN];
        if (k === 2 ? isWater(up) : roadLike(up)) continue;
        const deck = up === M_.DECK || up === M_.DECKF || up === M_.RAILDECK || up === M_.DECKWALK, dock = up === M_.DOCK || up === M_.DOCKX;
        const bank = k === 2 && isSoft(up) && up !== M_.BEACH && up !== M_.DUNE && up !== M_.WETSAND;
        const quay = k === 2 && !isSoft(up) && !deck && !dock;
        if (!quay && !deck && !dock && !bank && KIND[up] !== 4 && up !== M_.PLATFORM) break;
        const H = quay ? 12 : dock ? 6 : bank ? 3 : up === M_.PLATFORM ? 6 : Z[i - r * WN];
        if (r > H) break;
        let c;
        if (dock) c = sd(MAT.woodDark, 0.38 - r * 0.05 + ((X % 24) < 3 ? -0.2 : 0), X, Y, 0.3);
        else if (bank) c = sd(MAT.soil, 0.28 - r * 0.06 + hh(X, r, seed) * 0.1, X, Y, 0.4);
        else if (quay) c = r >= H - 2 ? sd(MAT.leafDark, 0.2 + hh(X, r, seed) * 0.2, X, Y, 0.3) : sd(MAT.concrete, 0.36 - r / H * 0.16 + (vnc(X, Y, 6, seed) - 0.5) * 0.12 + (X % 40 === 0 ? -0.12 : 0), X, Y, 0.4);
        else if (deck) c = sd(MAT.concrete, 0.3 - r * 0.03, X, Y, 0.3);
        else c = sd(MAT.curb, 0.24 - (r - 1) * 0.06, X, Y, 0.3);
        if (quay && (X + 7) % 210 < 9) c = ((X + 7) % 210) % 7 < 2 || r % 3 === 0 ? MAT.metalDark[r % 3 === 0 ? 3 : 2] : c;   // ladders
        setC(G, gi, c); putN(G, gi, 0, 2.2); G.z[gi] = Math.max(0, H - r + 1); G.flag[gi] = F_GROUND | F_WET;
        break;
      }
      if (m === M_.TRACK) {                                     // red-and-white kerbs along a race track's edges
        let edge = 0;
        for (let r = 1; r <= 7 && !edge; r++) if (M[i - r] !== M_.TRACK || M[i + r] !== M_.TRACK || M[i - r * WN] !== M_.TRACK || M[i + r * WN] !== M_.TRACK) edge = r;
        if (edge) { setC(G, gi, ((Math.floor(X / 14) + Math.floor(Y / 14)) & 1) ? sd(MAT.kerbRed, 0.6, X, Y, 0.3) : sd(MAT.paintWhite, 0.7, X, Y, 0.3)); G.z[gi] = Z[i] + 1; }
      }
      if (m === M_.DECK || m === M_.DECKF) {                    // expansion joints across a bridge deck, parapets along it
        const e = C.E[b.rE[i]];
        if (e) {
          const av = Math.abs(b.rV[i]);
          if (av > e.hw - 5 && !(e._gb.city)) { setC(G, gi, av > e.hw - 1.5 ? MAT.metalDark[1] : sd(MAT.concrete, 0.8, X, Y, 0.3)); G.z[gi] = Z[i] + (av > e.hw - 1.5 ? 9 : 5); }
          else if (av < e.hw && ((b.rS[i] % 64) + 64) % 64 < 1.5) setC(G, gi, MAT.metalDark[2]);
        }
      }
    } else if (k === 0) {
      // soft ground meeting water: wet sand, a muddy lip, damp grass; elsewhere a damp edge against paving
      const d = b.dist[i] / 10;
      if (d < 12) {
        if (m === M_.BEACH || m === M_.DUNE) { if (d < 7 + vnc(X, Y, 9, seed) * 5) setC(G, gi, GSHADE.sandWet(X, Y, seed)); }
        else if (m === M_.ROCKSHORE || m === M_.SHINGLE) { if (d < 6) darken(G, gi, 0.72 + d * 0.04); }
        else if (d < 3) setC(G, gi, sd(MAT.soil, 0.3 + d * 0.15 + hh(X, Y, seed) * 0.15, X, Y, 0.6));
        else if (d < 6) darken(G, gi, 0.8 + d * 0.025);
      } else if (KIND[M[i - WN]] === 4 || KIND[M[i - 1]] === 4 || KIND[M[i + 1]] === 4 || KIND[M[i + WN]] === 4) darken(G, gi, 0.8);
    }
  }
}
const low = (m) => KIND[m] === 3 || KIND[m] === 2;
// ---- 8. decorations ------------------------------------------------------------------------------------------------
// stamp a cover sprite with its root at world (X, Y): each pixel is kept only where it stands at least as high
// as what is already there (the depth rule, so overlaps come out the same in every chunk)
function stamp(C, G, spr, X, Y, z0 = 0) {
  const ox = Math.round(X) - C.X0 - spr.ax, oy = Math.round(Y) - C.Y0 - spr.ay;
  for (let y = 0; y < spr.h; y++) {
    const gy = oy + y; if (gy < 0 || gy >= CHUNK) continue;
    for (let x = 0; x < spr.w; x++) {
      const si = y * spr.w + x; if (!spr.col[si * 4 + 3]) continue;
      const gx = ox + x; if (gx < 0 || gx >= CHUNK) continue;
      const gi = gy * CHUNK + gx, z = spr.z[si] + z0;
      if (z < G.z[gi]) continue;
      const sj = si * 4, j = gi * 4;
      G.col[j] = spr.col[sj]; G.col[j + 1] = spr.col[sj + 1]; G.col[j + 2] = spr.col[sj + 2];
      G.nrm[j] = spr.nrm[sj]; G.nrm[j + 1] = spr.nrm[sj + 1]; G.nrm[j + 2] = spr.nrm[sj + 2];
      G.z[gi] = z;
      G.flag[gi] = spr.flag[si] | F_GROUND | F_WET;            // (cover is ground: rain wets it, nothing mirrors it)
    }
  }
}
// what is strewn on each material: [cover kind, variants, per-cell chance]; cells of CELL px
const CELL = 6;
const COVER = {};
const cov = (names, list) => { for (const n of names.split(' ')) COVER[M_[n]] = list; };
cov('LAWN', [['flower', 1, 0.003], ['leaf', 5, 0.004]]);
cov('PARK CLOVER', [['flower', 7, 0.012], ['leaf', 5, 0.005]]);
cov('GOLF', [['tuft', 6, 0.01]]);
cov('MEADOW', [['seed', 4, 0.12], ['flower', 7, 0.1], ['tuftTall', 8, 0.06]]);
cov('PASTURE', [['flower', 7, 0.02], ['clod', 3, 0.01], ['tuftTall', 8, 0.04]]);
cov('DRYGRASS', [['tuftDry', 8, 0.2], ['pebble', 6, 0.03], ['seed', 4, 0.03], ['weed', 4, 0.03]]);
cov('ALPINE', [['tuftAlp', 6, 0.25], ['rock', 6, 0.03], ['flower', 7, 0.015], ['pebble', 6, 0.03]]);
cov('FOREST', [['fern', 6, 0.14], ['cone', 4, 0.05], ['twig', 6, 0.08], ['leaf', 5, 0.04], ['mushroom', 4, 0.008], ['rock', 3, 0.01]]);
cov('FORESTDIRT', [['twig', 6, 0.05], ['cone', 4, 0.03], ['fern', 6, 0.02], ['pebble', 6, 0.03]]);
cov('DIRT', [['pebble', 6, 0.04], ['tuftDry', 8, 0.025], ['twig', 6, 0.01], ['weed', 4, 0.01]]);
cov('MUD', [['pebble', 6, 0.03], ['tuft', 6, 0.02]]);
cov('DESERT', [['pebble', 6, 0.05], ['tuftDry', 8, 0.035], ['scrub', 6, 0.012], ['redStone', 5, 0.012]]);
cov('CRACKED', [['tuftDry', 8, 0.02], ['pebble', 6, 0.03]]);
cov('REDROCK', [['redStone', 6, 0.06], ['tuftDry', 8, 0.05], ['scrub', 6, 0.015]]);
cov('SCREE', [['rock', 6, 0.05], ['tuftAlp', 6, 0.05]]);
cov('GRAVEL', [['weed', 4, 0.03], ['tuftDry', 8, 0.012]]);
cov('BEACH', [['shell', 4, 0.02], ['pebble', 6, 0.03], ['starfish', 1, 0.002], ['seaweed', 4, 0.004]]);
cov('SHINGLE', [['seaweed', 4, 0.01], ['shell', 4, 0.006], ['rock', 3, 0.01]]);
cov('ROCKSHORE', [['rock', 6, 0.04], ['seaweed', 4, 0.012], ['tuftAlp', 6, 0.02]]);
cov('DUNE', [['duneGrass', 6, 0.03], ['pebble', 6, 0.006], ['tuftDry', 8, 0.01]]);
cov('UNDERDECK', [['pebble', 6, 0.03], ['weed', 4, 0.02]]);
cov('SHOULDER', [['pebble', 6, 0.04], ['tuftDry', 8, 0.04], ['weed', 4, 0.03]]);
cov('GRAVLOT', [['weed', 4, 0.012], ['pebble', 6, 0.02]]);
cov('QUARRY', [['rock', 6, 0.03], ['pebble', 6, 0.05]]);
cov('BALLAST', [['weed', 4, 0.01]]);
function decor(C, G) {
  const { M, b, q, seed } = C;
  if (q <= 0) return;
  const dens = q === 1 ? 0.45 : q === 2 ? 1 : 1.5;
  // fallen leaves and tree pits under the trees
  for (const p of propsNear(C, 60)) {
    if (!TREES.has(p.t)) continue;
    const pi = Math.floor(p.y - C.WY0) * WN + Math.floor(p.x - C.WX0);
    const m = pi >= 0 && pi < WA ? b.mat[pi] : 0;
    if (raised(m)) treePit(C, G, p.x, p.y);
    const n = Math.round((raised(m) || roadLike(m) ? 26 : 40) * dens);
    for (let k = 0; k < n; k++) {
      const a = hh(k, Math.round(p.x), seed + 81) * 6.283, r = Math.sqrt(hh(k, Math.round(p.y), seed + 83)) * 52;
      stamp(C, G, coverSprite('leaf', (hh(k, 7, seed + Math.round(p.x)) * 5) | 0), p.x + Math.cos(a) * r * 1.25, p.y + Math.sin(a) * r * 0.85 + 6, zAt(C, p.x + Math.cos(a) * r * 1.25, p.y + Math.sin(a) * r * 0.85 + 6));
    }
  }
  turf(C, G, 1);                                              // (the grass itself: full density from q1 up)
  crops(C, G, dens);
  // cover on soft ground and loose decals: one candidate per CELL x CELL world cell
  const c0x = Math.floor((C.X0 - 16) / CELL), c1x = Math.ceil((C.X0 + CHUNK + 16) / CELL), c0y = Math.floor((C.Y0 - 4) / CELL), c1y = Math.ceil((C.Y0 + CHUNK + 20) / CELL);
  for (let cy = c0y; cy < c1y; cy++) for (let cx = c0x; cx < c1x; cx++) {
    const h0 = hh(cx, cy, seed + 91), X = cx * CELL + hh(cy, cx, seed + 93) * CELL, Y = cy * CELL + hh(cx + 3, cy, seed + 95) * CELL;
    const px = Math.floor(X - C.WX0), py = Math.floor(Y - C.WY0);
    if (px < 0 || py < 0 || px >= WN || py >= WN) continue;
    const i = py * WN + px, m = b.mat[i];
    const list = COVER[m];
    if (list) {
      let acc = 0;
      for (const [kind, nv, p] of list) {
        acc += p * dens;
        if (h0 < acc) { stamp(C, G, coverSprite(kind, (hh(cx, cy, seed + 97) * nv) | 0), X, Y, b.zb[i]); break; }
      }
      continue;
    }
    if (isWater(m)) {                                        // lily pads and reeds at pond and lake edges
      const d = b.dist[i] / 10;
      if ((m === M_.POND || m === M_.LAKE) && d < 22 && h0 < 0.05 * dens) stamp(C, G, coverSprite('lily', (hh(cx, cy, seed + 99) * 6) | 0), X, Y, 0);
      else if ((m === M_.POND || m === M_.LAKE || m === M_.RIVER) && d < 4 && h0 < 0.1 * dens) stamp(C, G, coverSprite('reed', (hh(cx, cy, seed + 101) * 6) | 0), X, Y, 0);
      continue;
    }
    // paving and asphalt: litter and weeds by wealth
    const ti = (Math.floor(Y / TILE) - C.TY0) * TN + Math.floor(X / TILE) - C.TX0, D = DISTRICTS[b.td[ti]] || DISTRICTS[1];
    const lit = (LITTER[D.tier] ?? 0.3) * dens;
    if ((raised(m) || roadLike(m)) && h0 < 0.004 * lit) litterAt(C, G, X, Y, b.zb[i], cx * 7 + cy);
    else if ((raised(m) || m === M_.LOT || m === M_.YARD) && h0 > 1 - 0.025 * lit * (WEAR[D.tier] ?? 0.3)) stamp(C, G, coverSprite('weed', (h0 * 400) & 3), X, Y, b.zb[i]);
  }
}
// grass as E1 draws it: overlapping tufts in staggered rows, each a fan of blades with sunlit tips, stamped north
// to south so nearer tufts cover farther ones (on dry and alpine grass they thin out and the ground shows)
function turf(C, G, dens) {
  const { b, seed } = C, RY = 4, RX = 6;
  const r0 = Math.floor((C.Y0 - 2) / RY), r1 = Math.ceil((C.Y0 + CHUNK + 10) / RY);
  for (let r = r0; r < r1; r++) {
    const ox = (r & 1) * 3 + (r % 3);
    for (let c = Math.floor((C.X0 - 8 - ox) / RX); c <= Math.ceil((C.X0 + CHUNK + 8) / RX); c++) {
      const h0 = hh(c, r, seed + 111);
      if (dens < 1 && h0 > dens + 0.15) continue;
      const X = c * RX + ox + (hh(r, c, seed + 113) - 0.5) * 3, Y = r * RY + (h0 - 0.5) * 2;
      const px = Math.floor(X - C.WX0), py = Math.floor(Y - C.WY0);
      if (px < 0 || py < 0 || px >= WN || py >= WN) continue;
      const m = b.mat[py * WN + px], pal = TURFPAL[m];
      if (pal < 0) continue;
      if ((m === M_.DRYGRASS || m === M_.ALPINE) && h0 > 0.55) continue;
      if (m === M_.FOREST && (h0 > 0.3 || vnc(X, Y, 29, seed + 121) < 0.45)) continue;   // grass only in sunny patches
      if (TURFCLOV[m] && cloverAt(X | 0, Y | 0, seed, TURFCLOV[m])) continue;
      const tall = m === M_.MEADOW && vnc(X, Y, 31, seed + 115) > 0.45 ? 5 : pal, pv = vnc(X, Y, 53, seed + 119) + (h0 - 0.5) * 0.3;
      const shade = pv < 0.38 ? 0 : pv > 0.64 ? 2 : 1;
      stamp(C, G, coverSprite('turf', (tall * 3 + shade) * 16 + ((hh(c, r, seed + 117) * 12) | 0)), X, Y, b.zb[py * WN + px]);
    }
  }
}
// standing wheat: rows of clumps 3 px apart, rows 5 px apart, stamped north to south so nearer stalks cover
// farther ones (corn is drawn by its ground shader, plants seen from above). The ears are F_LEAF: they sway in
// the wind (engine STATIC_FS) and gusts roll across the field as bands of brighter ears.
function crops(C, G, dens) {
  const { b, seed } = C;
  for (const [mats, kind, RY, RX, nv] of [[[M_.WHEAT], 'wheat', 5, 3, 8]]) {
    const r0 = Math.floor((C.Y0 - 2) / RY), r1 = Math.ceil((C.Y0 + CHUNK + 16) / RY);
    for (let r = r0; r < r1; r++) {
      const ox = (r & 1) * (RX >> 1);
      for (let c = Math.floor((C.X0 - 8 - ox) / RX); c <= Math.ceil((C.X0 + CHUNK + 8) / RX); c++) {
        const h0 = hh(c, r, seed + 131);
        if (h0 > 0.55 + dens * 0.4) continue;                   // (a few gaps; fewer on the lower tiers)
        const X = c * RX + ox + (hh(r, c, seed + 133) - 0.5) * 1.5, Y = r * RY + (h0 - 0.5);
        const px = Math.floor(X - C.WX0), py = Math.floor(Y - C.WY0);
        if (px < 0 || py < 0 || px >= WN || py >= WN || !mats.includes(b.mat[py * WN + px])) continue;
        stamp(C, G, coverSprite(kind, (hh(c, r, seed + 137) * nv) | 0), X, Y, b.zb[py * WN + px]);
      }
    }
  }
}
function zAt(C, X, Y) { const px = Math.floor(X - C.WX0), py = Math.floor(Y - C.WY0); return px >= 0 && py >= 0 && px < WN && py < WN ? C.b.zb[py * WN + px] : 0; }
// a square tree pit in the paving: an iron grate over soil, framed by a kerb
function treePit(C, G, X, Y) {
  const s = 11;
  rect(C, X, Y, 1, 0, s + 0.5, s + 0.5, (gi, x, y) => {
    const e = Math.max(Math.abs(Math.floor(x)), Math.abs(Math.floor(y)));
    setC(G, gi, e >= s ? MAT.curb[2] : e === s - 1 ? MAT.curb[4] : e % 3 === 0 ? MAT.metalDark[1] : ((Math.floor(x) + Math.floor(y)) & 1) ? MAT.soil[1] : MAT.soil[2]);
  });
}
const LITTER_COLS = [[226, 222, 210], [200, 60, 50], [70, 120, 190], [236, 200, 80], [120, 120, 126], [190, 160, 120], [60, 140, 80]];
function litterAt(C, G, X, Y, z, k) {
  const c = LITTER_COLS[k % LITTER_COLS.length], kind = (k >> 3) % 3;
  const pts = kind === 0 ? [[0, 0, 1], [1, 0, 1], [0, 1, 0.75], [1, 1, 0.6]] : kind === 1 ? [[0, 0, 1], [1, 0, 0.8], [2, 0, 0.7]] : [[0, 0, 1], [1, 1, 0.8]];
  for (const [dx, dy, k2] of pts) plot(C, G, X + dx, Y + dy, (gi) => { const j = gi * 4; G.col[j] = c[0] * k2; G.col[j + 1] = c[1] * k2; G.col[j + 2] = c[2] * k2; });
}
