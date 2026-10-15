// World v3 (docs/WORLD-V3.md 8.20): the west coast - part 1.5 R3, the Egret Coast (concepts N7, NK1-D, NK1-O, E3e,
// NT1-F), and R2's coast, the Highland Woods' (NT1-E, SC3-A, SC3-B, NR1-E, N8-B, NA1-A). At the skeleton's TOWNS /
// LANDMARKS / STREAMS (shared/world3-skeleton.js): Egret Point, the fishing village at the Redwood Coast Road's end -
// Wharf Street down to its quay and piers, the fish market, the fleet moored, the charter boat, the bar, the bait shop,
// the fishing shacks (homes) - Light Road on to Egret Point Light at the arm's tip, the Westport Raceway's new dirt
// oval and grandstand by the road (today's race starts there); the salt marsh's boardwalks with the bird hide and the
// duck blinds, the dunes' board ramps down to the west beach; on the Highland coast Silver Thread Falls over its basalt
// columns at the head of Silver Thread Creek with the viewing platform, North Cape Light on the cliff with the tide
// pools below, the coves and sea stacks down the Redwood Coast Road. For the whole-world build only
// (shared/world3-world.js calls these, one call each; the page and the city worker never import this module):
// - paintWest3(L, W, H): Egret Point's district (shared/mapcore.js DISTRICTS 65: a wild district - the generator builds
//   nothing there, buildWest does) on the land layer - the village, the raceway, Light Road's and Raceway Road's
//   strips - so the marsh's tidal creeks (world3-biomes.js groundOf3: the Egret Coast's own district) don't cut them.
// - layWest3(lines, m): the village's streets - Wharf Street across the Redwood Coast Road's last stretch to the quay,
//   Light Road off it south to the light, Raceway Road across the arterial to the raceway's gate.
// - buildWest(m, addProp) (from the dress hook, before the biomes' dressing - what it builds is kept from it, reserve 4).
// - westDone(m): the summary (m.world3.west).
import { TILE, T } from './constants.js';

export const WEST_IDS = { egret: 65 };
const Z = 65;
// Egret Point (tiles; v3b, docs/WORLD-V3.md part 9: the owner's marsh peninsula, its south-east coast): the village
// along Wharf Street (row 3230) from the Redwood Coast Road's end (world3-towns.js TOWN_ROADS3) east to the quay on the
// peninsula's east shore, facing the bay; Light Road south-west from it to the light on the rocky south tip; Raceway
// Road off the coast road to the raceway up the west side.
export const EGRET = {
  key: 'egret', name: 'Egret Point', d: Z, at: [1220, 3230], box: [1098, 3198, 1356, 3266],
  road: 3230,
  streets: [
    ['Wharf Street', [[1100, 3230], [1332, 3230]]],
    ['Light Road', [[1230, 3230], [1230, 3290], [1120, 3350], [990, 3396]]],
    ['Raceway Road', [[740, 2606], [896, 2606]]],   // (v3b: on across the Egret Coast Road to the raceway's gate)
  ],
};
// the set pieces (tiles)
export const WEST = {
  raceway: [858, 2560, 920, 2596],         // the raceway's ground (the oval, the grandstand along its north side; v3b: east of the Egret Coast Road, which crossed it at 800-862)
  light: [982, 3410],                      // Egret Point Light, on the south tip by the water, rocks round it
  hide: [700, 2560],                       // the bird hide at the boardwalk's west end
  boardwalk: [[968, 2700], [936, 2712], [904, 2694], [872, 2704], [846, 2676], [812, 2664], [786, 2630], [752, 2618], [726, 2588], [700, 2566]],   // (off Light Road, winding west across the marsh)
  pond: [[962, 2846], [932, 2856], [906, 2848], [884, 2858]],                       // (a spur off Light Road out to the pond's platform)
  blinds: [[880, 2760], [790, 2700], [740, 2820]],                                 // the duck blinds, by the creeks
  ramps: [2500, 2600, 2700],              // the dunes' board ramps down to the west beach, at these rows
  falls: [1745, 1030],                     // Silver Thread Falls: the sketch's big falls into the woods' lake (STREAMS3)
  cape: [560, 830],                        // North Cape Light (LANDMARKS): built on the north-west headland's cliff west of here
  coves: [2480, 2560, 2660],               // the coves down the Redwood Coast Road (the marsh's west coast), at these rows (v3b: on its 2464-2712 stretch, the coast 95-120 tiles off)
};
// the pictures' views (tools/world3-world-map.mjs --towns: docs/world-v3-town-<key>.png)
export const WEST_VIEWS = [
  { key: 'egret', name: 'Egret Point: the village, the quay and piers', box: [1060, 3150, 1400, 3300] },
  { key: 'egretlight', name: 'Egret Point Light, Light Road and the marsh boardwalk', box: [680, 2540, 1300, 3440] },
  { key: 'raceway', name: 'The Westport Raceway by the Redwood Coast Road', box: [720, 2520, 960, 2640] },
  { key: 'silverfalls', name: 'Silver Thread Falls and its viewing platform', box: [1680, 960, 1810, 1100] },
  { key: 'northcape', name: 'North Cape Light and its tide pools', box: [400, 770, 640, 890] },
];

const ROOM = 5;   // (Light Road's and Raceway Road's strips: this many tiles either side)

// Egret Point's district on the land layer: the village's box, the raceway's, the streets' strips (land only).
export function paintWest3(L, W, H) {
  let n = 0;
  const put = (x, y) => { if (x < 0 || y < 0 || x >= W || y >= H) return; const i = y * W + x; if (!L.land[i] || L.dist[i] === Z) return; L.dist[i] = Z; n++; };
  const box = ([x0, y0, x1, y1]) => { for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) put(x, y); };
  box(EGRET.box); box(WEST.raceway);
  for (const [name, P] of EGRET.streets) {
    if (name === 'Wharf Street') continue;
    for (let j = 1; j < P.length; j++) {
      const [ax, ay] = P[j - 1], [bx, by] = P[j], len = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay)));
      for (let k = 0; k <= len; k++) { const cx = Math.round(ax + (bx - ax) * k / len), cy = Math.round(ay + (by - ay) * k / len); for (let dy = -ROOM; dy <= ROOM; dy++) for (let dx = -ROOM; dx <= ROOM; dx++) put(cx + dx, cy + dy); }
    }
  }
  // the light's patch at the tip
  box([WEST.light[0] - 12, WEST.light[1] - 16, WEST.light[0] + 12, WEST.light[1] + 6]);
  return n;
}

// The village's streets (kind 'st', on the one network: Wharf Street and Raceway Road cross the Redwood Coast Road).
export function layWest3(lines, m) {
  const out = { streets: 0, len: 0 };
  for (const [name, P] of EGRET.streets) {
    lines.push({ pts: P.map(([x, y]) => ({ x: (x + 0.5) * TILE, y: (y + 0.5) * TILE })), kind: name === 'Wharf Street' ? 'st' : 'rural', lvl: 0, name, town: EGRET.key });   // (the lanes to the light and the raceway: country roads)
    out.streets++;
    for (let j = 1; j < P.length; j++) out.len += Math.round(Math.hypot(P[j][0] - P[j - 1][0], P[j][1] - P[j - 1][1]));
  }
  return out;
}

// ---- the set pieces -------------------------------------------------------------------------------------------------
const GROUND = new Set([T.GRASS, T.DIRT, T.SAND]);
const hash = (x, y, s) => { let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(s | 0, 2246822519); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

// a building of ours (a roof record for the classic renderer; `art` its look for art v2, or none: the kind's archetype)
function addBld(m, x, y, w, h, kind, name, roofKind, art, sign) {
  const W = m.w, bid = m.buildings.length;
  for (let ty = y; ty < y + h; ty++) for (let tx = x; tx < x + w; tx++) { const i = ty * W + tx; if (tx < 0 || ty < 0 || tx >= W || ty >= m.h || !m.land[i] || !GROUND.has(m.tiles[i]) || m.bld[i] >= 0) return null; }
  m.roofs.push({ tx: x, ty: y, tw: w, th: h, kind: roofKind, seed: (Math.imul(x, 7919) ^ Math.imul(y, 104729)) >>> 0, d: m.dist[(y + (h >> 1)) * W + x + (w >> 1)], b: bid });
  const b = { id: bid, prefab: -1, roof: m.roofs.length - 1, tx: x, ty: y, tw: w, th: h, kind, name, business: null, signs: sign ? [sign] : [] };
  if (art) b.art = { noShop: true, ...art };
  m.buildings.push(b);
  for (let ty = y; ty < y + h; ty++) for (let tx = x; tx < x + w; tx++) { m.set(tx, ty, T.BUILDING); m.bld[ty * W + tx] = bid; m.reserve[ty * W + tx] |= 4; }
  return b;
}

export function buildWest(m, addProp) {
  const W = m.w, HH = m.h;
  const out = { village: [], homes: 0, piers: 0, boats: 0, quay: 0, raceway: null, light: null, boardwalk: 0, hide: null, blinds: 0, ramps: 0, falls: null, platform: 0, cape: null, pools: 0, stacks: 0, coves: 0, tracks: 0, props: 0 };
  const inF = (x, y) => x >= 0 && y >= 0 && x < W && y < HH;
  const tile = (x, y) => (inF(x, y) ? m.tiles[y * W + x] : T.DEEP);
  const sea = (x, y) => { if (!inF(x, y)) return true; const i = y * W + x; return !m.land[i] && !m.river[i] && (m.tiles[i] === T.WATER || m.tiles[i] === T.DEEP); };
  const open = (x, y) => inF(x, y) && m.land[y * W + x] && GROUND.has(m.tiles[y * W + x]) && m.bld[y * W + x] < 0;
  const keep = (x0, y0, x1, y1) => { for (let y = Math.max(0, y0); y < Math.min(HH, y1); y++) for (let x = Math.max(0, x0); x < Math.min(W, x1); x++) m.reserve[y * W + x] |= 4; };
  const prop = (t, tx, ty, r, extra) => { if (!open(Math.floor(tx), Math.floor(ty))) return false; addProp(m, t, tx * TILE, ty * TILE, r, extra); out.props++; return true; };
  const wet = (t, tx, ty, r, extra) => { const x = Math.floor(tx), y = Math.floor(ty); if (!inF(x, y) || (m.tiles[y * W + x] !== T.WATER && m.tiles[y * W + x] !== T.DEEP)) return false; addProp(m, t, tx * TILE, ty * TILE, r, extra); out.props++; return true; };
  const landmark = (name, type, x0, y0, x1, y1) => (m.landmarks ||= []).push({ name, type, x: x0 * TILE, y: y0 * TILE, w: (x1 - x0) * TILE, h: (y1 - y0) * TILE });
  const poi = (kind, label, x, y, extra) => { const p = { id: m.pois.length, kind, label, x: Math.round(x * TILE), y: Math.round(y * TILE), r: 44, fixed: true, ...extra }; m.pois.push(p); return p; };
  // a dirt track along a polyline (tiles), hw tiles each side, over open ground only (a road it meets stays road)
  const track = (pts, hw = 1.6, t = T.DIRT) => {
    let n = 0;
    for (let j = 1; j < pts.length; j++) {
      const [ax, ay] = pts[j - 1], [bx, by] = pts[j], L = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) * 2));
      for (let k = 0; k <= L; k++) {
        const cx = ax + (bx - ax) * k / L, cy = ay + (by - ay) * k / L, R = Math.ceil(hw);
        for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
          if (dx * dx + dy * dy > hw * hw) continue;
          const x = Math.floor(cx + dx), y = Math.floor(cy + dy);
          if (!open(x, y)) continue;
          const i = y * W + x;
          if (m.tiles[i] !== t) n++;
          m.tiles[i] = t; m.reserve[i] |= 4;
        }
      }
    }
    out.tracks += n;
    return n;
  };
  // a boardwalk: decking two tiles wide along a polyline, over the marsh and over its creeks alike
  const deck = (pts, hw = 1.1) => {
    let n = 0;
    for (let j = 1; j < pts.length; j++) {
      const [ax, ay] = pts[j - 1], [bx, by] = pts[j], L = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) * 2));
      for (let k = 0; k <= L; k++) {
        const cx = ax + (bx - ax) * k / L, cy = ay + (by - ay) * k / L;
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
          if (dx * dx + dy * dy > hw * hw) continue;
          const x = Math.floor(cx + dx), y = Math.floor(cy + dy);
          if (!inF(x, y)) continue;
          const i = y * W + x, t = m.tiles[i];
          if (m.bld[i] >= 0 || !(GROUND.has(t) || (t === T.WATER && m.river[i]))) continue;
          m.tiles[i] = T.DOCK; m.reserve[i] |= 4 | 16; n++;
        }
      }
    }
    return n;
  };
  // the shore: the first sea tile from (x, y) stepping (dx, dy), within n steps (null if none)
  const shore = (x, y, dx, dy, n) => { for (let k = 0; k < n; k++) { const tx = x + dx * k, ty = y + dy * k; if (sea(tx, ty)) return [tx, ty]; } return null; };
  // the first land tile of row y going east from x0 - 40 (a west-facing coast), or x0 + 40
  const coastX = (y, x0) => { let x = x0 - 40; while (x < x0 + 40 && sea(x, y)) x++; return x; };
  // the nearest top-left corner to (x, y), within r tiles, where a w x h footprint is all open ground
  const spot = (x, y, w, h, r) => {
    for (let d = 0; d <= r; d++) for (let dy = -d; dy <= d; dy++) for (let dx = -d; dx <= d; dx += (Math.abs(dy) === d ? 1 : 2 * d || 1)) {
      const tx = x + dx, ty = y + dy;
      let ok = true;
      for (let yy = ty; yy < ty + h && ok; yy++) for (let xx = tx; xx < tx + w; xx++) if (!open(xx, yy)) { ok = false; break; }
      if (ok) return [tx, ty];
    }
    return null;
  };

  // 1. Egret Point: the quay along the shore at Wharf Street's end, the piers out into the sheltered water with the fleet
  // moored along them and the charter boat at the end of one; the fish market, the bar, the bait shop and the charter
  // office by the quay; the fishing shacks along Wharf Street (homes, for sale as today's shacks); nets, crates, pots.
  {
    const R = EGRET.road, quay = [];
    for (let y = R - 26; y <= R + 30; y++) {
      const s = shore(1318, y, 1, 0, 60);
      if (!s) continue;
      for (let x = s[0] - 10; x < s[0]; x++) { if (!open(x, y) && tile(x, y) !== T.ROAD) continue; if (tile(x, y) === T.ROAD) continue; m.tiles[y * W + x] = T.DOCK; m.reserve[y * W + x] |= 4 | 16; quay.push([x, y]); out.quay++; }
    }
    // the piers: three tiles wide from the quay's edge, 22 tiles into the water; the boats along both sides
    const boats = [];
    let charter = null;
    for (const [k, py] of [R - 20, R - 8, R + 8, R + 20].entries()) {
      const s = shore(1318, py, 1, 0, 60);
      if (!s) continue;
      const [sx] = s;
      let laid = 0;
      for (let x = sx; x < sx + 22; x++) for (let o = -1; o <= 1; o++) { const y = py + o; if (!inF(x, y)) continue; const i = y * W + x; if (m.tiles[i] === T.WATER || m.tiles[i] === T.DEEP) { m.tiles[i] = T.DOCK; m.reserve[i] |= 16; laid++; } }
      if (!laid) continue;
      out.piers++;
      addProp(m, 'lamp', (sx + 21.4) * TILE, (py + 1.6) * TILE); out.props++;
      for (let j = 0; j < 5; j++) for (const side of [-1, 1]) {
        if (hash(k, j * 2 + side, 71) < 0.3) continue;
        const bx = sx + 3.5 + j * 3.6, by = py + side * 2.7;
        if (k === 1 && j === 4 && side === 1) continue;   // (the charter boat's berth)
        boats.push({ x: Math.round(bx * TILE), y: Math.round(by * TILE), a: 0, kind: hash(k, j, 72) < 0.7 ? 'dinghy' : 'speedboat' });
      }
      if (k === 1) charter = [sx + 18, py + 2.7];
      // pots, crates and a fish table along the pier
      for (const [dx, t] of [[5, 'crates'], [10, 'drum'], [15, 'crates']]) if (hash(k, dx, 73) < 0.6) { addProp(m, t, (sx + dx) * TILE, (py + 0.2) * TILE, 0); out.props++; }
    }
    if (charter) boats.push({ x: Math.round(charter[0] * TILE), y: Math.round(charter[1] * TILE), a: 0, kind: 'speedboat', charter: true });
    for (const b of boats) m.marina.push(b);
    out.boats = boats.length;
    // nets and gear on the quay, a bench looking out
    let q = 0;
    for (const [x, y] of quay) { if (hash(x, y, 74) > 0.07) continue; addProp(m, ['crates', 'pallet', 'fishtable', 'drum', 'rods', 'lifering'][q++ % 6], (x + 0.5) * TILE, (y + 0.5) * TILE, 0); out.props++; }
    // the businesses by the quay (north and south of Wharf Street's end), the shacks along the road
    const named = (x, y, w, h, kind, name, sideN, poiKind, extra) => {
      const b = addBld(m, x, y, w, h, kind, name, 'metal', null, { x: (x + w / 2) * TILE, y: (sideN ? y + h + 0.8 : y - 0.8) * TILE, text: name });
      if (!b) return null;
      out.village.push(name);
      if (poiKind) poi(poiKind, name, x + w / 2, sideN ? y + h + 1 : y - 1, { b: b.id, ...extra });
      return b;
    };
    named(1298, R - 15, 14, 8, 'market', 'Egret Point Fish Market', true, 'fishmarket');
    named(1280, R - 13, 12, 7, 'club', 'The Gaff Hook', true, 'club');
    named(1302, R + 6, 9, 6, 'tackle2', 'Egret Point Bait & Tackle', false, 'tackle');
    const ch = named(1288, R + 6, 8, 5, 'charter', 'Egret Point Charters', false, 'charter');
    if (ch && charter) { const p = m.pois[m.pois.length - 1]; p.boat = { x: Math.round(charter[0] * TILE), y: Math.round(charter[1] * TILE) }; }
    // the fishing shacks: weathered siding, tin roofs, either side of the road; homes as today's shacks
    const walls = ['#8a9aa0', '#a08a70', '#7a8a7a', '#b0a088', '#6e7e88', '#9a7a62'];
    let k = 0;
    // (irregular: widths 6-8, set back 0-2 tiles, gaps of 3-7 - a village's row, not a suburb's)
    for (const N of [true, false]) for (let x = 1128, w = 7; x + 8 <= 1274; x += w + 3 + Math.floor(hash(x, N ? 6 : 7, 85) * 5)) {
      w = 6 + Math.floor(hash(x, N ? 1 : 2, 82) * 3);
      if (!N && x + w >= 1222 && x <= 1238) continue;   // (Light Road's mouth)
      const h = 5 + Math.floor(hash(x, N ? 3 : 4, 84) * 2), back = Math.floor(hash(x, N ? 5 : 8, 83) * 3);
      const y = N ? R - 5 - h - back : R + 6 + back;
      const b = addBld(m, x, y, w, h, 'shack', `Fishing Shack`, 'metal', { spec: { floors: 1, style: 'siding', wallColor: walls[k % walls.length], pitch: 'gable', roof: 'metal', roofColor: ['#7a8288', '#8a6a50', '#6a7076'][k % 3], slope: 0.4 + (k % 3) * 0.08 } });
      k++;
      if (!b) continue;
      const id = m.homes.length, door = { x: (x + w / 2) * TILE, y: (N ? y + h + 0.8 : y - 0.8) * TILE };
      const home = { id, kind: 'shack', name: `Egret Point Shack #${id + 1}`, price: 6000, slots: 1, x: door.x, y: door.y, garage: { x: (x + w - 0.8) * TILE, y: (N ? y + h + 1.6 : y - 1.6) * TILE, a: N ? -Math.PI / 2 : Math.PI / 2 }, b: b.id };
      m.homes.push(home);
      m.pois.push({ id: m.pois.length, kind: 'home', home: id, label: home.name, x: door.x, y: door.y, r: 40, b: b.id });
      b.home = id; b.name = home.name; out.homes++;
      // nets drying, pots and a skiff on blocks beside some
      if (k % 3 === 0) prop('crates', x - 1.2, N ? y + 2 : y + 4, 10);
      if (k % 4 === 1) prop('drum', x + 8, N ? y + 3 : y + 2, 6);
    }
    for (let j = 0; j < 4; j++) addProp(m, 'lamp', (1142 + j * 44) * TILE, (R - 3.2) * TILE), out.props++;
    keep(EGRET.box[0], EGRET.box[1], EGRET.box[2], EGRET.box[3]);
    landmark('Egret Point', 'harbor', EGRET.box[0], EGRET.box[1], EGRET.box[2], EGRET.box[3]);
  }

  // 2. Egret Point Light on the tip, Light Road's end, the keeper's cottage, a bench; the beach below it
  {
    const at = spot(WEST.light[0] - 2, WEST.light[1] - 2, 5, 5, 10);
    if (at) {
      const lx = at[0] + 2, ly = at[1] + 2;
      for (let y = ly - 6; y < ly + 6; y++) for (let x = lx - 7; x < lx + 8; x++) if (open(x, y) && m.tiles[y * W + x] !== T.SAND) { m.tiles[y * W + x] = T.DIRT; m.reserve[y * W + x] |= 4; }
      const b = addBld(m, lx - 2, ly - 2, 5, 5, 'lighthouse', 'Egret Point Light', 'tile', null, { x: (lx + 0.5) * TILE, y: (ly + 3.4) * TILE, text: 'Egret Point Light' });
      if (b) out.light = [lx, ly];
      prop('cottage', lx - 9, ly - 6, 12, { w: 84, d: 54 });
      prop('pbench', lx + 6, ly - 3, 0, { a: Math.PI / 2 });
      // the rocks of the point round its foot and out into the surf (basalt, barnacled at the waterline)
      for (const [dx, dy, w, d, h] of [[-5, 3, 64, 40, 40], [4, 4, 80, 48, 46], [0, 7, 96, 56, 36], [-8, 6, 48, 32, 30], [8, 8, 56, 36, 30]]) { addProp(m, 'outcrop', (lx + dx) * TILE, (ly + dy) * TILE, 0, { w, d, h, style: 'basalt', s: dx + dy }); m.addSolidProp((lx + dx) * TILE, (ly + dy) * TILE, Math.round(d * 0.42)); out.props++; }
      for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI + 0.2, x = lx + Math.cos(a) * 11, y = ly + 4 + Math.sin(a) * 7; if (!wet('boulder', x, y, 12, { s: 18 + k * 2, style: 'basalt', barn: 1 })) prop('boulder', x, y, 12, { s: 18 + k * 2, style: 'basalt', barn: 1 }); }
      track([[990, 3396], [lx + 1, ly - 3]], 1.8);   // (from Light Road's end)
      keep(lx - 12, ly - 16, lx + 12, ly + 8);
      landmark('Egret Point Light', 'lighthouse', lx - 8, ly - 8, lx + 9, ly + 8);
    }
  }

  // 3. The Westport Raceway's new spot: a dirt oval on the flat ground by the Redwood Coast Road, the grandstand's
  // bleachers along its north straight, the pit shed and the office by the gate on Raceway Road; today's race (map.js:
  // the first raceway with a start line) starts on its south straight
  {
    const [x0, y0, x1, y1] = WEST.raceway;
    let clear = 0, all = 0;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { all++; if (open(x, y)) clear++; }
    if (clear > all * 0.9) {
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (open(x, y)) { m.tiles[y * W + x] = T.GRASS; m.reserve[y * W + x] |= 4; }
      const ox = x0 + 2, oy = y0 + 6, ow = x1 - x0 - 4, oh = y1 - y0 - 10;
      const track2 = { x: ox * TILE, y: oy * TILE, w: ow * TILE, h: oh * TILE, band: 5 * TILE, dirt: true, name: 'Westport Raceway' };
      track2.start = { x: Math.round(track2.x + track2.w / 2 + 40), y: track2.y + track2.h - track2.band, w: 24, h: track2.band };
      const inStadium = (tx, ty, x, y, w, h) => { const r = h / 2, cx0 = x + r, cx1 = x + w - r, cy = y + r, qx = tx < cx0 ? cx0 : tx > cx1 ? cx1 : tx; return Math.hypot(tx - qx, ty - cy) <= r; };
      let band = 0;
      for (let ty = oy; ty < oy + oh; ty++) for (let tx = ox; tx < ox + ow; tx++) {
        const cx = tx + 0.5, cy = ty + 0.5;
        if (inStadium(cx, cy, ox, oy, ow, oh) && !inStadium(cx, cy, ox + 5, oy + 5, ow - 10, oh - 10)) { m.tiles[ty * W + tx] = T.DIRT; band++; }
      }
      m.raceways.push(track2);
      const mid = (x0 + x1) >> 1;
      // the grandstand: two runs of bleachers on the north side, facing the track; the start's banner over the line
      for (const dx of [-9, 9]) { addProp(m, 'bleachers', (mid + dx) * TILE, (y0 + 4.2) * TILE, 0, { len: 15 * TILE, rows: 4 }); out.props++; }
      addProp(m, 'textsign', track2.start.x + 12, track2.y + track2.h + 30, 0, { text: 'START', bg: '#1a1a1a', fg: [240, 240, 240], z: 50 }); out.props++;
      for (let k = 0; k < 6; k++) prop('tires', ox + 10 + k * ((ow - 20) / 5), oy + oh / 2, 9);
      const pits = addBld(m, mid + 6, y1 - 3, 12, 3, 'pits', 'Pit Garages', 'metal', null);
      const office = addBld(m, mid - 8, y1 - 3, 7, 3, 'snackbar', 'Raceway Snack Bar', 'metal', null, { x: (mid - 4.5) * TILE, y: (y1 + 0.6) * TILE, text: 'Snack Bar' });
      if (office) poi('delivery', 'Westport Raceway Snack Bar', mid - 4.5, y1 + 0.8, { b: office.id });
      for (let k = 0; k < 4; k++) m.parking.push({ x: (mid + 7.5 + k * 3) * TILE, y: (y1 + 2) * TILE, a: -Math.PI / 2, drive: true });
      track([[mid + 0.5, y1 + 9], [mid + 0.5, y1]], 2.2);   // (the drive in from Raceway Road)
      out.raceway = { band, pits: !!pits, office: !!office, start: [Math.round(track2.start.x / TILE), Math.round(track2.start.y / TILE)] };
      keep(x0, y0, x1, y1);
      landmark('Westport Raceway', 'raceway', x0, y0, x1, y1);
    }
  }

  // 4. The salt marsh: a boardwalk from Light Road west across the reeds and the creeks to the bird hide; the duck
  // blinds by the creeks with decoys on the water; the dunes' board ramps down to the west beach
  {
    out.boardwalk = deck(WEST.boardwalk) + deck(WEST.pond);
    // the pond's platform: decking 7 x 5 at the spur's end, out over the water, a rail and a bench
    {
      const [px, py] = WEST.pond[WEST.pond.length - 1];
      for (let y = py - 2; y <= py + 2; y++) for (let x = px - 6; x <= px; x++) { if (!inF(x, y)) continue; const i = y * W + x, t = m.tiles[i]; if (m.bld[i] < 0 && (GROUND.has(t) || (t === T.WATER && m.river[i]))) { m.tiles[i] = T.DOCK; m.reserve[i] |= 4 | 16; out.boardwalk++; } }
      addProp(m, 'pierrail', (px - 3) * TILE, (py + 2.8) * TILE, 0, { len: 7 * TILE, a: 0 }); addProp(m, 'pbench', (px - 3) * TILE, (py - 1.5) * TILE, 0, { a: Math.PI / 2 }); out.props += 2;
    }
    const hs = spot(WEST.hide[0] - 4, WEST.hide[1] - 7, 8, 4, 16) || [WEST.hide[0] - 4, WEST.hide[1] - 7];
    const hx = hs[0] + 4, hy = hs[1] + 7;
    const hide = addBld(m, hx - 4, hy - 7, 8, 4, 'hut', 'Egret Marsh Bird Hide', 'tar', { spec: { floors: 1, style: 'siding', wallColor: '#6a5a40', pitch: 'gable', roof: 'shingle', roofColor: '#4e4434', slope: 0.3 } });
    if (hide) { out.hide = [hx, hy]; prop('scope', hx + 5, hy - 3, 6); prop('mapboard', hx + 4, hy - 1, 8); }
    landmark('Egret Marsh', 'marsh', 640, 2200, 1200, 3000);
    // herons and egrets along the boardwalk's creeks, ducks on the water
    for (let k = 0; k < WEST.boardwalk.length - 1; k++) {
      const [ax, ay] = WEST.boardwalk[k], [bx, by] = WEST.boardwalk[k + 1];
      for (let j = 0; j < 6; j++) { const x = ax + (bx - ax) * (j + 0.5) / 6 + (hash(k, j, 75) - 0.5) * 16, y = ay + (by - ay) * (j + 0.5) / 6 + (hash(j, k, 75) - 0.5) * 16; if (wet('heron', x, y, 0) || wet('duck', x, y, 0, { a: hash(k, j, 76) * 6.28 })) continue; }
    }
    for (const [bx, by] of WEST.blinds) {
      // the blind at the nearest creek bank within 30 tiles: a reed-roofed hide on the bank, decoys on the water
      let best = null;
      for (let r = 0; r < 50 && !best; r++) for (let a = 0; a < 24 && !best; a++) { const x = Math.round(bx + Math.cos(a / 24 * 6.283) * r), y = Math.round(by + Math.sin(a / 24 * 6.283) * r); if (inF(x, y) && m.river[y * W + x] && m.tiles[y * W + x] === T.WATER) best = [x, y]; }
      const at = best && spot(best[0] - 1, best[1] - 6, 3, 3, 6);
      if (!at) continue;
      const cx = best[0], cy = best[1];
      const b = addBld(m, at[0], at[1], 3, 3, 'hut', 'Duck Blind', 'tar', { spec: { floors: 1, style: 'siding', wallColor: '#8a7a4a', pitch: 'gable', roof: 'shingle', roofColor: '#9a8a50', slope: 0.5 } });
      if (!b) continue;
      out.blinds++;
      for (let j = 0; j < 4; j++) wet('duck', cx - 2 + j * 1.6, cy + 1 + hash(cx, j, 77) * 2, 0, { a: hash(j, cy, 78) * 6.28 });
      track([[at[0] + 1.5, at[1] + 3.5], [at[0] + 5, at[1] + 10]], 1.2);
    }
    // the dunes' board ramps: from the marsh over the dune and down to the waterline, at a few rows on the west shore
    for (const ry of WEST.ramps) {
      let x = 420; while (x < 900 && !(inF(x, ry) && m.land[ry * W + x])) x++;   // (the west shore: the first land)
      if (x >= 900) continue;
      let sx = x; while (sx < x + 40 && tile(sx, ry) === T.SAND) sx++;          // (the sand's inland edge)
      const n = deck([[sx + 6, ry], [x + 1, ry]], 1.1);
      if (n) { out.ramps++; prop('post', sx + 7, ry - 1.5, 0); prop('post', sx + 7, ry + 1.5, 0); prop('driftwood', x + 4, ry + 4, 0, { len: 90, a: 0.4 }); }
    }
  }

  // 5. Silver Thread Falls: a band of basalt columns across the head of Silver Thread Creek, the falls over it into a
  // plunge pool, the creek above it, the viewing platform on the west bank by Falls Pass Road, a pull-off
  {
    const [fx, fy] = WEST.falls;
    // the stream's head: the northmost water of the creek near the point
    let head = null;
    // (v3b: the falls stand on the woods' river above its lake - the point itself is the river's: the head is there)
    const wide = inF(fx, fy) && m.river[fy * W + fx] && m.tiles[fy * W + fx] === T.WATER;
    if (wide) head = [fx, fy];
    for (let y = fy - 20; y < fy + 30 && !head; y++) for (let x = fx - 20; x < fx + 20; x++) if (inF(x, y) && m.river[y * W + x] && m.tiles[y * W + x] === T.WATER) { head = [x, y]; break; }
    if (head) {
      const [cx] = head, cy = head[1];
      // the plunge pool (water, as the creek's), the cliff band north of it (solid), the upper creek above
      const poolR = 14;
      for (let y = cy - 2; y < cy + poolR + 4; y++) for (let x = cx - poolR - 2; x <= cx + poolR + 2; x++) {
        const dx = x - cx - 4, dy = (y - cy - poolR * 0.5) * 1.2;
        if (dx * dx + dy * dy > poolR * poolR || !inF(x, y)) continue;
        const i = y * W + x;
        if (m.tiles[i] === T.ROAD || m.tiles[i] === T.BRIDGE || m.tiles[i] === T.SIDEWALK) continue;
        m.land[i] = 0; m.river[i] = 1; m.tiles[i] = T.WATER; m.reserve[i] |= 4;
      }
      const top = cy - 5;
      let x0 = cx - 10, x1 = cx + 20;
      let cliff = 0;
      if (wide) {
        // (the band across the whole river: its water on these rows the basalt lip, ground of the woods - 47 - the
        // river falling over it into the pool)
        const rw = (x, y) => inF(x, y) && m.river[y * W + x] && m.tiles[y * W + x] === T.WATER;
        while (rw(x0 - 1, cy - 3)) x0--;
        while (rw(x1 + 1, cy - 3)) x1++;
        for (let y = top; y < cy - 2; y++) for (let x = x0; x <= x1; x++) if (rw(x, y)) { const i = y * W + x; m.land[i] = 1; m.river[i] = 0; m.dist[i] = 47; m.tiles[i] = T.WALL; m.reserve[i] |= 4; cliff++; }
      }
      for (let y = top; y < cy - 2; y++) for (let x = x0; x <= x1; x++) { if (!open(x, y)) continue; m.tiles[y * W + x] = T.WALL; m.reserve[y * W + x] |= 4; cliff++; }
      for (let x = x0; x < x1; x += 6) addProp(m, 'cliffwall', (x + 3) * TILE, (cy - 2.4) * TILE, 0, { len: 6 * TILE, h: 120 + (x % 3) * 10, d: 64, s: x }), out.props++;
      // the upper creek: a narrow channel north over the cliff top, from the peaks
      for (let y = top - 40; y < top; y++) { const x = Math.round(cx + 2 + 4 * Math.sin((y - top) / 9)); for (let dx = -2; dx <= 2; dx++) { if (!open(x + dx, y)) continue; const i = y * W + x + dx; m.land[i] = 0; m.river[i] = 1; m.tiles[i] = T.WATER; m.reserve[i] |= 4; } }
      // the falls: three streams side by side over the band (SC3-A), the middle one the broadest
      for (const [dx, w, sd] of [[-4, 48, 17], [3, 72, 19], [10, 40, 23]]) { addProp(m, 'coastfall', (cx + dx) * TILE, (cy - 1.6) * TILE, 0, { w, drop: 140, s: sd, kind: 'cliff', mist: 0.9 }); out.props++; }
      for (const [dx, dy, r] of [[-7, 3, 14], [10, 4, 12], [-9, 9, 10], [12, 11, 14], [3, 13, 9]]) wet('boulder', cx + 2 + dx, cy + dy, r, { s: r * 2 + 4, style: 'basalt', moss: 1 });
      // the viewing platform: decking on the west bank, a rail and a scope, a bench; the trail from the road
      let px = null, east = false;
      for (let x = cx - poolR + 2; x > cx - poolR - 16 && px === null; x--) { let ok = true; for (let y = cy + 2; y < cy + 8 && ok; y++) for (let dx = 0; dx < 6; dx++) if (!open(x - dx, y)) { ok = false; break; } if (ok) px = x - 5; }
      for (let x = cx + poolR + 6; x < cx + poolR + 20 && px === null; x++) { let ok = true; for (let y = cy + 2; y < cy + 8 && ok; y++) for (let dx = 0; dx < 6; dx++) if (!open(x + dx, y)) { ok = false; break; } if (ok) { px = x; east = true; } }
      if (px !== null) {
        for (let y = cy + 2; y < cy + 8; y++) for (let x = px; x < px + 6; x++) { m.tiles[y * W + x] = T.DOCK; m.reserve[y * W + x] |= 4 | 16; out.platform++; }
        addProp(m, 'pierrail', (px + 3) * TILE, (cy + 1.8) * TILE, 0, { len: 6 * TILE, a: 0 }); addProp(m, 'scope', (px + 4.5) * TILE, (cy + 2.8) * TILE, 6); addProp(m, 'pbench', (px + 1.5) * TILE, (cy + 5) * TILE, 0, { a: -Math.PI / 2 }); out.props += 3;
        // the trail west to Falls Pass Road (the first road tile), the pull-off beside it
        if (!east) { let rx = px - 1; while (rx > px - 40 && tile(rx, cy + 5) !== T.ROAD) rx--; track([[px, cy + 5], [rx + 2, cy + 5]], 1.3); prop('mapboard', px - 3, cy + 3, 8); }
        out.platformSide = east ? 'east' : 'west';
      }
      out.falls = { head: [cx, cy], cliff };
      keep(cx - poolR - 20, top - 42, cx + poolR + 24, cy + poolR + 6);
      landmark('Silver Thread Falls', 'falls', cx - 30, top - 10, cx + 30, cy + poolR + 6);
    }
  }

  // 6. North Cape Light: on the cliff top west of the Redwood Coast Road, a track to it; the cliff band along the shore,
  // basalt faces, the stairs down; tide pools on the widened beach below, barnacled rocks, sea stacks in the surf
  {
    const [kx, ky] = WEST.cape;
    const s = shore(kx, ky, -1, 0, 300);
    if (s) {
      const sx = s[0];   // (the first sea tile west of the point)
      // the beach below: sand from the sea up 8 tiles
      for (let y = ky - 26; y <= ky + 26; y++) { const x = coastX(y, sx); for (let j = 0; j < 8; j++) if (open(x + j, y)) { m.tiles[y * W + x + j] = T.SAND; m.reserve[y * W + x + j] |= 4; } }
      // the cliff band on the beach's inland edge (two rows of rock), its basalt faces, a gap for the stairs
      const cliffX = (y) => { let x = coastX(y, sx); while (x < sx + 60 && tile(x, y) === T.SAND) x++; return x; };
      let rock = 0;
      for (let y = ky - 24; y <= ky + 24; y++) {
        const x = cliffX(y);
        if (Math.abs(y - ky - 8) <= 1) continue;   // (the stairs' gap)
        for (let j = 0; j < 2; j++) if (open(x + j, y)) { m.tiles[y * W + x + j] = T.WALL; m.reserve[y * W + x + j] |= 4; rock++; }
        if ((y - ky) % 6 === 0) addProp(m, 'cliffwall', (x - 0.4) * TILE, (y + 0.5) * TILE, 0, { len: 6 * TILE, h: 74 + (Math.abs(y) % 3) * 8, d: 56, s: y }), out.props++;
      }
      const gx = cliffX(ky + 8);
      addProp(m, 'stairs', (gx - 1) * TILE, (ky + 8.6) * TILE, 0, { len: 2 * TILE + 16, h: 70, w: 30 }); out.props++;
      // the light on the cliff top, the keeper's cottage, the track in from the road
      const lx = cliffX(ky) + 8, ly = ky;
      for (let y = ly - 6; y < ly + 7; y++) for (let x = lx - 5; x < lx + 14; x++) if (open(x, y)) { m.tiles[y * W + x] = T.DIRT; m.reserve[y * W + x] |= 4; }
      const b = addBld(m, lx - 2, ly - 2, 5, 5, 'lighthouse', 'North Cape Light', 'tile', null, { x: (lx + 0.5) * TILE, y: (ly + 3.4) * TILE, text: 'North Cape Light' });
      if (b) out.cape = [lx, ly];
      prop('cottage', lx + 8, ly + 1, 12, { w: 84, d: 54 });
      let rx = lx + 12; while (rx < lx + 260 && tile(rx, ly) !== T.ROAD) rx++;
      if (tile(rx, ly) === T.ROAD) track([[lx + 6, ly + 4], [rx - 1, ly + 4]], 1.6);
      prop('pbench', lx + 3, ly + 5, 0);
      // the tide pools: shallow pools in the sand, barnacled basalt round them, life in them; crabs
      const LIFE = ['starfish', 'urchin', 'anemone', 'starfish', 'urchin'];
      for (let y = ky - 22; y <= ky + 22; y += 3) {
        const x = coastX(y, sx);
        if (hash(x, y, 79) < 0.35) continue;
        const px = x + 2 + hash(x, y, 80) * 2, py = y + hash(y, x, 80);
        for (let yy = Math.floor(py - 1); yy <= py + 1; yy++) for (let xx = Math.floor(px - 1); xx <= px + 1; xx++) if (tile(xx, yy) === T.SAND && (xx + 0.5 - px) ** 2 + (yy + 0.5 - py) ** 2 <= 1.4) { m.tiles[yy * W + xx] = T.WATER; m.reserve[yy * W + xx] |= 4; }
        addProp(m, 'boulder', (px + 1.6) * TILE, py * TILE, 12, { s: 18, style: 'basalt', barn: 1 }); out.props++;
        if (wet(LIFE[out.pools % LIFE.length], px, py, 0, { v: out.pools % 4 })) out.pools++;
        if (out.pools % 3 === 1) prop('crab', px + 2.5, py + 0.8, 0, { a: hash(px, py, 81) * 6.28 });
      }
      // sea stacks out in the surf, a gull on one
      for (const [dy, d, r, h] of [[-14, 14, 26, 150], [-2, 22, 18, 100], [10, 11, 30, 160], [20, 18, 16, 90]]) {
        const tx = coastX(ky + dy, sx) - d, ty = ky + dy;
        if (!sea(tx, ty)) continue;
        addProp(m, 'seastack', tx * TILE, ty * TILE, r, { s: (tx + ty) % 4 + 1, r, h }); out.stacks++; out.props++;
      }
      addProp(m, 'gull', (sx - 14) * TILE, (ky - 14.4) * TILE, 0, { a: 0.5, z: 140 }); out.props++;
      keep(sx - 2, ky - 28, lx + 16, ky + 28);
      landmark('North Cape Light', 'lighthouse', lx - 8, ly - 8, lx + 14, ly + 10);
      landmark('North Cape tide pools', 'tidepools', sx - 4, ky - 24, sx + 14, ky + 24);
    }
  }

  // 7. The coves down the Redwood Coast Road: from a pull-off by the road, a track west through the trees to a cove -
  // a beach between two basalt points, sea stacks offshore, driftwood on the sand, the stairs down
  {
    const road = m.edges.filter((e) => e.name === 'Redwood Coast Road' && e.lvl === 0);
    const roadX = (y) => {   // (the road's x on row y: along the laid edges' segments)
      for (const e of road) for (let j = 1; j < e.pts.length; j++) {
        const a = e.pts[j - 1], b = e.pts[j], ya = a.y / TILE, yb = b.y / TILE;
        if ((y - ya) * (y - yb) > 0 || ya === yb) continue;
        return (a.x + (b.x - a.x) * (y - ya) / (yb - ya)) / TILE;
      }
      return null;
    };
    for (const cy of WEST.coves) {
      const rx = roadX(cy);
      if (rx === null) continue;
      const s = shore(Math.floor(rx) - 8, cy, -1, 0, 300);
      if (!s) continue;
      const sx = s[0];
      // the cove: a bay bitten out of the shore (sea, 12 tiles in), its beach round it
      const bx = coastX(cy, sx), CR = 12;
      for (let y = cy - CR; y <= cy + CR; y++) for (let x = bx - 2; x <= bx + CR; x++) {
        if (!inF(x, y) || (x - bx + 2) ** 2 / (CR * CR) + (y - cy) ** 2 / (CR * CR) > 1) continue;
        const i = y * W + x;
        if (!m.land[i] || !GROUND.has(m.tiles[i]) || m.bld[i] >= 0) continue;
        m.land[i] = 0; m.river[i] = 0; m.tiles[i] = T.WATER; m.reserve[i] |= 4;
      }
      // the beach: sand 10 tiles up from the sea, 24 tiles along
      let sand = 0;
      for (let y = cy - 12; y <= cy + 12; y++) { const x = coastX(y, sx); for (let j = 0; j < 10; j++) if (open(x + j, y)) { m.tiles[y * W + x + j] = T.SAND; m.reserve[y * W + x + j] |= 4; sand++; } }
      // the points either side: basalt walls out to the water, the faces
      for (const py of [cy - 14, cy + 14]) {
        const x = coastX(py, sx);
        for (let yy = py - 2; yy <= py + 2; yy++) for (let j = -1; j < 12; j++) if (open(x + j, yy)) { m.tiles[yy * W + x + j] = T.WALL; m.reserve[yy * W + x + j] |= 4; }
        addProp(m, 'cliffwall', (x + 5) * TILE, (py + 2.6) * TILE, 0, { len: 12 * TILE, h: 80, d: 60, s: py }); out.props++;
      }
      // sea stacks in the cove's mouth, driftwood on the sand
      for (const [dy, d, r, h] of [[-8, 10, 22, 120], [5, 16, 16, 90], [12, 7, 26, 140]]) { const tx = coastX(cy + dy, sx) - d, ty = cy + dy; if (sea(tx, ty)) { addProp(m, 'seastack', tx * TILE, ty * TILE, r, { s: (tx + ty) % 4 + 1, r, h }); out.stacks++; out.props++; } }
      for (const [dx, dy, len, a] of [[3, -4, 110, 0.2], [5, 3, 80, -0.3], [2, 8, 120, 0.5]]) { const x = coastX(cy + dy, sx); prop('driftwood', x + dx, cy + dy, 0, { len, a }); }
      // the pull-off by the road and the track down
      const ex = (() => { let x = coastX(cy, sx); while (x < sx + 60 && tile(x, cy) === T.SAND) x++; return x; })();
      const n = track([[Math.floor(rx) - 6, cy], [ex + 1, cy]], 1.6);
      for (let y = cy - 3; y <= cy + 3; y++) for (let x = Math.floor(rx) - 14; x < Math.floor(rx) - 5; x++) if (open(x, y)) { m.tiles[y * W + x] = T.DIRT; m.reserve[y * W + x] |= 4; }
      prop('picnic', Math.floor(rx) - 10, cy - 2, 8);
      keep(sx - 2, cy - 18, Math.floor(rx) - 4, cy + 18);
      if (sand && n) { out.coves++; landmark(['Redwood Cove North', 'Sea Stack Cove', 'Driftwood Cove'][out.coves - 1] || 'Cove', 'cove', sx - 4, cy - 16, sx + 16, cy + 16); }
    }
  }
  return out;
}

// After the build: what the west coast has (m.world3.west).
export function westDone(m) {
  const at = (p) => m.dist[Math.floor(p.y / TILE) * m.w + Math.floor(p.x / TILE)];
  const pois = m.pois.filter((p) => p && at(p) === Z), kinds = {};
  for (const p of pois) kinds[p.kind] = (kinds[p.kind] || 0) + 1;
  let blds = 0;
  for (const b of m.buildings) if (b && m.dist[(b.ty + (b.th >> 1)) * m.w + b.tx + (b.tw >> 1)] === Z) blds++;
  const race = (m.races || []).find((r) => r.name === 'Westport Raceway');
  return { buildings: blds, pois: pois.length, kinds, race: race ? [Math.round(race.start.x / TILE), Math.round(race.start.y / TILE)] : null };
}
