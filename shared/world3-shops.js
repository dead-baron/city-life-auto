// World v3b: shops where you need them (the owner, 2026-10-15: "enough shops around the world so it's easier to
// purchase weapons or equipment and food/items you might need ... access to things you need in each district
// somewhere ... the undeveloped natural areas a bit more empty, only some specialized shops that fit the theme of the
// district like a hunting lodge or fishing tackle shop ... elsewhere it would be good if you can find stores and ATMs
// easily"). The whole-world build only (shared/world3-world.js hands these to the generator: map.js calls `shops`
// right after the street ATMs, `done` the rest); the page and the city worker never load this module.
//
// - SHOP_NEEDS: the four needs and the place kinds that meet each (shared/items.js SHOPS: what each sells) - weapons
//   (firearms and their rounds), equipment (tools, lights, fishing and hunting kit), food and everyday items (food,
//   drink, bandages), cash (ATMs and bank tellers). tools/world3b/shops.mjs measures the world by them.
// - placeKind3(d): the kind of place a district is - the city, a town, a beach town, a village, or the wild land.
// - shops3(m, H): every built-up district (the city's, the towns, the beach towns, the villages) gets each need within
//   SHOP_REACH of every bit of its streets, and a place of each of its own (the park and the airfield: food and cash
//   only). The farthest street from what a district lacks is served first, by a row of shops in the plain building
//   nearest it - a building with no business and no home in it, its front on the pavement: a gun shop, a hardware or
//   sports or tackle store, a corner store (whatever the spot still lacks: each unit its own door, sign and map point),
//   an ATM against its front wall. Where no plain building stands near enough, a small row of shops goes up on open
//   ground by the street; where none fits either, a snack cart (food) or an ATM kiosk (cash) on the pavement. The wild
//   land gets a few themed places only (WILD_SHOPS3: a trailhead store, a farm crossroads' feed and general store, a
//   desert trading post, the marsh outfitters, the fishing village's general store), each with an ATM.
// - stationAtms3(m, H): an ATM by every station (the station houses are seated in the done hook first) and every gas
//   station that has none near.
// Deterministic: integer tiles, squared distances, positions hashed (rng.js); no Math.random, no trigonometry.
import { TILE, T } from './constants.js';
import { DISTRICTS } from './mapcore.js';
import { hash2 } from './rng.js';
import { propGrid } from './propgrid.js';
import { handPlanAt } from './world3-hand.js';
import { POSTS3, roadNear3, STORE_KEYS, NOT_INTO } from './world3-medics.js';

export const SHOP_NEEDS = {
  weapons: ['gunshop', 'pawn', 'fence', 'lodge', 'huntcamp'],
  equipment: ['hardware', 'sports', 'tackle', 'fishmarket', 'charter', 'lodge', 'huntcamp', 'gasstation', 'assay'],
  food: ['convenience', 'gasstation', 'coffee', 'pharmacy', 'market', 'fruitstand', 'farmstand', 'winery', 'snack', 'roadhouse', 'butcher', 'huntcamp', 'clubhouse'],
  cash: ['atm', 'bank'],
};
export const NEED_KEYS = Object.keys(SHOP_NEEDS);
// how far (tiles, straight line) the farthest bit of a built-up district's streets may be from each need: weapons and
// equipment a short drive (400 tiles: about 70 s on foot), food and cash a short walk (140 tiles: about 25 s running)
export const SHOP_REACH = { weapons: 400, equipment: 400, food: 140, cash: 140 };

// the kind of place a district is (DISTRICTS ids): the north coast's station town, harbour and villas, the mainland's
// towns (Timber Bend, Willow Crossing, Lucky Mesa's three, Copper Gulch); the villages (Gull Harbor, Coral Cay, Egret
// Point); the beach towns (the beach style: Sunset Beach, Pelican Key, the Northshore Beaches, Sandpiper Bay); the
// city's districts; everything else - and the Sandpiper Coast, no town on it yet - the wild land
const TOWN = new Set([31, 32, 34, 57, 58, 60, 61, 62, 63]);
const VILLAGE = new Set([43, 44, 65]);
const CITY = new Set([0, 1, 2, 3, 4, 5, 6, 7, 8, 12, 16, 17, 18, 23, 25, 26, 27, 28, 30, 35, 36, 37, 46]);
const UNBUILT = new Set([52]);
export function placeKind3(d) {
  const D = DISTRICTS[d];
  if (!D) return 'none';
  if (TOWN.has(d)) return 'town';
  if (VILLAGE.has(d)) return 'village';
  if (UNBUILT.has(d)) return 'wild';
  if (D.style === 'beach') return 'beach';
  if (CITY.has(d)) return 'city';
  return 'wild';
}
// the park and the airfield: no shops of their own - a snack cart and an ATM where their streets are far from any
const OPEN = new Set([12, 27]);
// the towns whose buildings take the town's own look (world3-towns.js townModels): a plain building there keeps its kind
const TOWN_LOOKS = new Set([57, 58, 59]);

// the names (invented): a gun shop each its own, the chains by their counter's title (shared/items.js SHOPS), the corner
// stores and the snack carts by the street
const GUN3 = ['Marksman Firearms', 'Trigger Point Guns', 'Steel Barrel Supply', 'Cartridge & Co.', 'Safe Shot Firearms', 'Breech & Bore', 'Straight Shooter Arms', 'Sure Aim Gun Shop', 'Deadeye Arms', 'Range Day Firearms', 'Blue Steel Guns', 'Old Glory Arms'];
const MART3 = ['Quick Mart', 'Corner Deli', '24/7 Market', 'Speedy Stop', 'Daily Mart', 'Handy Mart', 'Night Owl Market', 'Pocket Grocer', 'Main Street Mart', 'Sunrise Market'];
const CART3 = ['Hot Dog Cart', 'Street Eats Cart', 'Lemonade Stand', 'Snack Shack Cart'];
const CHAIN = { hardware: ['Nail & Gear Hardware', 'HARDWARE'], sports: ['Home Run Sports', 'SPORTS'], tackle: ['Hook & Line Bait', 'BAIT & TACKLE'], pharmacy: ['MediMart Pharmacy', 'PHARMACY'] };

// The wild land's themed places: [district, where (a road's crossroads: the busiest ground-level junction of the
// district out in the country, nearest its middle; or a place: the first POI of that kind in district `in`), the units
// [kind, name] (west to east), the roof]. Each gets an ATM by its door. (The marsh outfitters stand by the Westport
// Raceway, Egret Point's far end in the marsh, 700 tiles from the village.)
export const WILD_SHOPS3 = [
  { d: 47, at: 'junction', units: [['convenience', 'Redwood Trailhead Store']], roof: 'shingle' },
  { d: 49, at: 'junction', units: [['hardware', 'Valley Feed & Tool'], ['convenience', 'Crossroads General Store']], roof: 'metal' },
  { d: 50, at: 'junction', units: [['convenience', 'Desert Junction Trading Post'], ['hardware', 'Prospector Supply']], roof: 'tar' },
  { d: 53, at: 'race', in: 65, units: [['huntcamp', 'Egret Marsh Outfitters'], ['tackle', 'Marsh Bait & Tackle']], roof: 'shingle' },
  { d: 65, at: 'fishmarket', in: 65, units: [['convenience', 'Egret Point General Store'], ['gunshop', 'Egret Point Sporting Arms']], roof: 'shingle' },
];

const WALK = new Set([T.SIDEWALK, T.PLAZA, T.LOT]);
const VERGE = new Set([T.GRASS, T.DIRT, T.SAND]);
const PATH = new Set([T.SIDEWALK, T.PLAZA, T.LOT, T.GRASS, T.DIRT, T.SAND, T.DOCK]);   // (what a shopper walks over to the door)
const OPEN_GROUND = new Set([T.GRASS, T.DIRT, T.SAND, T.LOT, T.PLAZA]);
const FRONT_OK = new Set([T.GRASS, T.DIRT, T.SAND, T.LOT, T.PLAZA, T.SIDEWALK]);
// what may be cleared off a new building's lot: greenery, park furniture, loose clutter (never an ATM, a signal pole, a
// bus stop, a station's or a sign's)
const KEEP = new Set(['atmw', 'sigpole', 'busstop', 'upole', 'billboard', 'textsign', 'roadsign', 'fingerpost', 'mapboard', 'rails', 'cliff', 'cliffwall', 'redwood']);
const needsOf = (kind) => NEED_KEYS.filter((k) => SHOP_NEEDS[k].includes(kind));

// The pass (map.js, after the street ATMs). H: { addProp, removeProps, simpleBuilding, wallAtm(b, x, look, loose) }
export function shops3(m, H) {
  const out = { rows: 0, built: 0, retyped: 0, carts: 0, kiosks: 0, atms: 0, units: {}, stuck: {}, wild: 0, list: [] };
  const W = m.w, X0 = m.x0 || 0, Y0 = m.y0 || 0;
  const tileAt = (tx, ty) => m.tileAt(tx, ty);
  const roadBy = (tx, ty) => { for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (tileAt(tx + dx, ty + dy) === T.ROAD) return true; return false; };
  const distAt = (tx, ty) => (m.inside(tx, ty) ? m.dist[m.idx(tx, ty)] : -1);
  // the places that meet each need: [x, y] in tiles
  const src = {};
  for (const k of NEED_KEYS) src[k] = [];
  const own = DISTRICTS.map(() => ({ weapons: 0, equipment: 0, food: 0, cash: 0 }));
  const addSrc = (kind, x, y) => { const d = distAt(Math.floor(x), Math.floor(y)); for (const k of needsOf(kind)) { src[k].push(x, y); if (d >= 0 && own[d]) own[d][k]++; } };
  for (const p of m.pois) addSrc(p.kind, p.x / TILE, p.y / TILE);
  // the street samples of each built-up district (every third tile each way; a highway's lanes are no street)
  const samples = new Map();
  for (let ty = Y0; ty < Y0 + m.h; ty += 3) {
    const r = m.row(ty);
    for (let tx = X0; tx < X0 + W; tx += 3) {
      const i = r + m.col(tx), t = m.tiles[i];
      if ((t !== T.ROAD && t !== T.SIDEWALK) || m.roadRank[i] === 3) continue;
      const d = m.dist[i], pk = placeKind3(d);
      if (pk === 'wild' || pk === 'none') continue;
      let a = samples.get(d); if (!a) samples.set(d, (a = [])); a.push(tx, ty);
    }
  }
  // the plain buildings: no business, no home, not gone, a prefab-less roof with its front (south) on the pavement
  const busy = new Set();
  for (const p of m.pois) if (p.b !== undefined && p.b !== null) busy.add(p.b);
  for (const h of m.homes || []) if (h && h.b !== undefined) busy.add(h.b);
  const cands = new Map();   // district -> [{ b, d, fx, fy }]
  for (const b of m.buildings) {
    if (!b || b.gone || b.kind !== 'roof' || b.prefab >= 0 || busy.has(b.id) || b.home !== undefined || b.walkIn || b.name === 'Lot' || b.tw < 6 || b.th < 4) continue;
    if (m.handBuilt && m.handBuilt.has(b)) continue;   // (a handcrafted district's own buildings - its casinos, its halls - stay what its plan made them)
    const d = distAt(b.tx + (b.tw >> 1), b.ty + (b.th >> 1)), pk = placeKind3(d);
    if (pk === 'wild' || pk === 'none' || OPEN.has(d)) continue;
    const fy = b.ty + b.th;
    let walk = 0;
    for (let x = b.tx; x < b.tx + b.tw; x++) { const i = m.inside(x, fy) ? m.idx(x, fy) : -1; if (i >= 0 && WALK.has(m.tiles[i]) && !m.deck[i] && !(m.reserve[i] & 3)) walk++; }
    if (walk < b.tw * 0.6) continue;
    const mx = b.tx + (b.tw >> 1);
    let street = false;
    for (let k = 0; k <= 12 && !street; k++) { const t = tileAt(mx, fy + k); if (t === T.ROAD || t === T.SIDEWALK) street = true; else if (!PATH.has(t)) break; }
    if (!street) continue;
    let a = cands.get(d); if (!a) cands.set(d, (a = [])); a.push({ b, d, fx: mx + 0.5, fy: fy + 0.7 });
  }
  const used = new Set();
  // a POI's door point on the pavement in front of building b at tile column tx (moved along to the nearest column in
  // [x0, x1] with no solid prop on it)
  const solidNear = (x, y, r) => { const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE); for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { if (!m.inside(tx + dx, ty + dy)) continue; for (const e of m.solidProps.get(m.idx(tx + dx, ty + dy)) || []) if (Math.abs(e.x - x) < r + e.r && Math.abs(e.y - y) < r + e.r) return true; } return false; };
  const doorCol = (b, x0, x1, want) => {
    const fy = b.ty + b.th;
    for (let k = 0; k <= x1 - x0; k++) for (const s of k ? [1, -1] : [1]) {
      const tx = want + s * k;
      if (tx < x0 || tx > x1) continue;
      const t = tileAt(tx, fy);
      if (!FRONT_OK.has(t) || solidNear((tx + 0.5) * TILE, (fy + 0.7) * TILE, 14)) continue;
      return tx;
    }
    return want;
  };
  const gone = new Set();   // ("x,y" of the props cleared off the new buildings' lots: removed once, at the end)
  const nameN = { gun: 0, mart: 0, cart: 0 };
  const unitName = (kind, D) => {
    if (kind === 'gunshop') { const n = GUN3[nameN.gun++ % GUN3.length]; return [`${n} - ${D.name}`, n]; }
    if (kind === 'convenience') { const n = MART3[nameN.mart++ % MART3.length]; return [`${n} - ${D.name}`, n]; }
    const c = CHAIN[kind];
    return c ? [`${c[0]} - ${D.name}`, c[0]] : [`${kind} - ${D.name}`, kind];
  };
  // a row of shops in building b: units [kind, label?, sign?] west to east, each its own door; an ATM by the front when
  // `atm`. Returns the new POIs.
  const row = (b, units, atm, d, opts = {}) => {
    const D = DISTRICTS[d], n = units.length, uw = Math.floor(b.tw / n), pois = [];
    const fy = b.ty + b.th;
    units.forEach(([kind, label0, sign0], k) => {
      const [label, sign] = label0 ? [label0, sign0 || label0] : unitName(kind, D);
      const x0 = b.tx + k * uw, x1 = k === n - 1 ? b.tx + b.tw - 1 : x0 + uw - 1;
      const tx = doorCol(b, x0 + 1, x1 - 1, x0 + ((x1 - x0 + 1) >> 1));
      const poi = { id: m.pois.length, kind, label, x: (tx + 0.5) * TILE, y: (fy + 0.7) * TILE, r: 44, b: b.id, own: 1, ...(opts.counter ? { counter: true } : {}) };
      m.pois.push(poi);
      pois.push(poi);
      b.signs.push({ x: (x0 + x1 + 1) / 2 * TILE, y: (fy - 0.6) * TILE, text: sign });
      if (k === 0) { b.name = label; b.door = { tx, ty: fy }; }
      addSrc(kind, poi.x / TILE, poi.y / TILE);
      out.units[kind] = (out.units[kind] || 0) + 1;
      out.list.push([d, kind, label]);
    });
    if (!TOWN_LOOKS.has(d) || b.kind !== 'roof') b.kind = 'strip';
    b.shop3 = 1;
    busy.add(b.id);
    if (atm) {
      // against the front wall at either end, else between two doors, else a kiosk on the pavement in front
      const xs = [(b.tx + b.tw) * TILE - 30, b.tx * TILE + 30];
      for (let k = 1; k < n; k++) xs.push((b.tx + k * uw) * TILE);
      let a = null;
      for (const loose of [false, true]) for (const x of xs) if (!a) a = H.wallAtm(b, x, ATM_LOOK[Math.floor(hash2(b.tx, b.ty, 77) * ATM_LOOK.length)], loose);
      if (!a) a = kiosk((b.tx + (b.tw >> 1)), fy + 1, 6);
      if (a) { addSrc('atm', a.x / TILE, a.y / TILE); out.atms++; pois.atm = a; }
    }
    return pois;
  };
  // an ATM kiosk at the back edge of a pavement tile within r tiles of (tx, ty) (map.js kioskAtm's rules), nearest first
  // (out in the country, with no pavement: on the verge beside the road - loose)
  const kiosk = (tx, ty, r, d = -1) => kiosk1(tx, ty, r, d, false) || kiosk1(tx, ty, r, d, true);
  const kiosk1 = (tx, ty, r, d, loose) => {
    for (let k = 0; k <= r; k++) for (let dy = -k; dy <= k; dy++) for (let dx = -k; dx <= k; dx += (Math.abs(dy) === k ? 1 : 2 * k || 1)) {
      const x = tx + dx, y = ty + dy;
      if (!m.inside(x, y)) continue;
      const i = m.idx(x, y);
      if (!(loose ? VERGE.has(m.tiles[i]) && roadBy(x, y) : WALK.has(m.tiles[i])) || m.reserve[i] & 3 || m.deck[i] || (d >= 0 && (m.dist[i] !== d || distAt(x, y + 1) !== d))) continue;   // (its map point, a tile down, in the district too)
      if (tileAt(x, y - 1) === T.ROAD || tileAt(x, y - 1) === T.WATER || tileAt(x, y - 1) === T.DEEP) continue;
      if (tileAt(x - 1, y) === T.ROAD || tileAt(x + 1, y) === T.ROAD) continue;
      const px = (x + 0.5) * TILE, py = y * TILE + 4;
      if (solidNear(px, py + 20, 30) || m.pois.some((p) => Math.abs(p.x - px) < 60 && Math.abs(p.y - py - 30) < 60)) continue;
      H.addProp(m, 'atmw', px, py + 20, 11, { v: 'kiosk' });
      const poi = { id: m.pois.length, kind: 'atm', label: 'ATM', x: px, y: py + 42, r: 36 };
      m.pois.push(poi);
      out.kiosks++;
      return poi;
    }
    return null;
  };
  // a snack cart (a counter: hot dogs, lemonade, energy drinks) on a pavement tile within r tiles of (tx, ty)
  const cart = (tx, ty, r, d) => cart1(tx, ty, r, d, false) || cart1(tx, ty, r, d, true);
  const cart1 = (tx, ty, r, d, loose) => {
    const ok = (t) => (loose ? VERGE.has(t) : t === T.SIDEWALK || t === T.PLAZA);
    for (let k = 0; k <= r; k++) for (let dy = -k; dy <= k; dy++) for (let dx = -k; dx <= k; dx += (Math.abs(dy) === k ? 1 : 2 * k || 1)) {
      const x = tx + dx, y = ty + dy;
      if (!m.inside(x, y)) continue;
      const i = m.idx(x, y);
      if (!ok(m.tiles[i]) || (loose && !roadBy(x, y)) || m.reserve[i] & 3 || m.deck[i] || m.dist[i] !== d) continue;
      if (!ok(tileAt(x, y + 1)) || distAt(x, y + 1) !== d) continue;   // (room to stand at it - its map point there, in the district too)
      const px = (x + 0.5) * TILE, py = (y + 0.5) * TILE;
      if (solidNear(px, py, 36) || m.pois.some((p) => Math.abs(p.x - px) < 80 && Math.abs(p.y - py) < 80)) continue;
      H.addProp(m, 'foodcart', px, py, 0);
      const n = CART3[nameN.cart++ % CART3.length];
      const poi = { id: m.pois.length, kind: 'snack', label: `${n} - ${DISTRICTS[d].name}`, x: px, y: py + 30, r: 36, counter: true, own: 1 };
      m.pois.push(poi);
      addSrc('snack', poi.x / TILE, poi.y / TILE);
      out.carts++; out.list.push([d, 'snack', poi.label]);
      return poi;
    }
    return null;
  };
  // a new building w x h on open ground within r tiles of (tx, ty) in district d: its front (south) on open ground with a
  // street within 4 tiles of it; nothing built, reserved or kept there; the greenery on it cleared
  // (the lot's depth: 6 tiles if there's room, else 5, else 4)
  // (wild: out in the country - the street up to 10 tiles off, the waterfront's strip allowed)
  // (okD(d): the districts a lot may be in, by its north-west corner's)
  const lot = (tx, ty, w, h, r, d, any = false, wild = false, okD = null) => { for (const hh of [h, h - 1, h - 2]) { const at = lot1(tx, ty, w, hh, r, d, any, wild, okD); if (at) return [...at, hh]; } return null; };
  const lot1 = (tx, ty, w, h, r, d, any, wild, okD) => {
    const spots = [];
    for (let y0 = ty - r - h; y0 <= ty + r; y0++) for (let x0 = tx - r - (w >> 1); x0 <= tx + r - (w >> 1); x0++) {
      const cx = x0 + (w >> 1), cy = y0 + h, e = (cx - tx) * (cx - tx) + (cy - ty) * (cy - ty);
      if (e <= r * r) spots.push([e, y0, x0]);
    }
    spots.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]);
    for (const [, y0, x0] of spots) if ((!okD || okD(distAt(x0, y0))) && lotOk(x0, y0, w, h, d, any, wild)) return [x0, y0];
    return null;
  };
  const lotOk = (x0, y0, w, h, d, any, wild) => {
    // (never on a handcrafted district's ground - its forecourts, its squares, its lawns are its plan's)
    if (handPlanAt(x0, y0) || handPlanAt(x0 + w, y0) || handPlanAt(x0, y0 + h) || handPlanAt(x0 + w, y0 + h)) return false;
    const resOk = wild ? ~4 : ~0;
    for (let y = y0 - 1; y <= y0 + h; y++) for (let x = x0 - 1; x <= x0 + w; x++) {
      if (!m.inside(x, y)) return false;
      const i = m.idx(x, y), t = m.tiles[i], edge = y === y0 - 1 || x === x0 - 1 || x === x0 + w, front = y === y0 + h;
      if (m.deck[i] || (m.lake && m.lake[i]) || t === T.WATER || t === T.DEEP || t === T.ROAD || t === T.BRIDGE) return false;
      if (edge && !front) { if (m.reserve[i] & 3) return false; continue; }   // (a wall of the building next door may stand right behind it)
      if (m.bld[i] >= 0) return false;
      if (front) { if (!FRONT_OK.has(t) || m.reserve[i] & 3) return false; continue; }
      if (!OPEN_GROUND.has(t) || (m.reserve[i] & resOk) || (!any && m.dist[i] !== d)) return false;
    }
    let street = false;
    const mx = x0 + (w >> 1);
    for (let k = 1; k <= (wild ? 10 : 6) && !street; k++) { const t = tileAt(mx, y0 + h + k); if (t === T.ROAD || t === T.SIDEWALK) street = true; else if (!PATH.has(t)) break; }
    if (!street) return false;
    const px0 = x0 * TILE - 8, py0 = y0 * TILE - 8, px1 = (x0 + w) * TILE + 8, py1 = (y0 + h + 1) * TILE + 8;
    if (m.pois.some((p) => { const r = p.kind === 'home' ? 96 : 64; return p.x > px0 - r && p.x < px1 + r && p.y > py0 - r && p.y < py1 + r; })) return false;
    if (m.prefabs.some((q) => q && !q.gone && q.tx * TILE < px1 && (q.tx + q.tw) * TILE > px0 && q.ty * TILE < py1 && (q.ty + q.th) * TILE > py0)) return false;   // (another lot's yard)
    if ((m.stalls || []).some((s) => s.x < px1 && s.x + s.w > px0 && s.y < py1 && s.y + s.h > py0)) return false;
    if ((m.fields || []).some((f) => f.x < px1 && f.x + f.w > px0 && f.y < py1 && f.y + f.h > py0)) return false;
    if ((m.landmarks || []).some((l) => l.x < px1 && l.x + l.w > px0 && l.y < py1 && l.y + l.h > py0)) return false;
    for (const pr of propsIn(px0, py0, px1, py1)) if (KEEP.has(pr.t)) return false;
    return true;
  };
  const PG = propGrid(m);   // (this pass only adds props until its end: propgrid.js)
  const propsIn = (x0, y0, x1, y1) => { const o = []; PG.each(x0 - 1, y0 - 1, x1 + 1, y1 + 1, (pr) => { if (pr && pr.x >= x0 && pr.x <= x1 && pr.y >= y0 && pr.y <= y1 && !gone.has(pr)) o.push(pr); }); return o; };
  const build = (x0, y0, w, h, d, units, roof = 'tar') => {
    const px0 = x0 * TILE - 8, py0 = y0 * TILE - 8, px1 = (x0 + w) * TILE + 8, py1 = (y0 + h + 1) * TILE + 8;
    for (const pr of propsIn(px0, py0, px1, py1)) gone.add(pr);
    for (let y = y0 - 1; y <= y0 + h + 1; y++) for (let x = x0 - 1; x <= x0 + w; x++) {   // (the bare solids on the lot: a cut log's, a fence post's)
      if (!m.inside(x, y)) continue;
      const k = m.idx(x, y), arr = m.solidProps.get(k);
      if (!arr) continue;
      const kept = arr.filter((e) => !(e.pi < 0 && e.x >= px0 && e.x <= px1 && e.y >= py0 && e.y <= py1));
      if (kept.length !== arr.length) { if (kept.length) m.solidProps.set(k, kept); else m.solidProps.delete(k); }
    }
    const b = H.simpleBuilding(m, x0, y0, w, h, units[0][1] || 'Shops', 'strip', d, roof);
    for (let x = x0; x < x0 + w; x++) { const i = m.idx(x, y0 + h); if (m.tiles[i] === T.GRASS || m.tiles[i] === T.DIRT || m.tiles[i] === T.SAND) m.tiles[i] = T.PLAZA; }   // (its forecourt)
    out.built++;
    return b;
  };
  // A storefront of a generic business (a boutique, a row of stores, an office's or a bank branch's ground floor, an
  // auto repair, a factory's: names the generator gives by the dozen - map.js GENERIC_NAMES) near (tx, ty) taken over
  // when no plain building is near: its door (the POI) becomes the shop's, its sign the shop's.
  const RETYPE = new Set(['royale', 'crown', 'diamond', 'monarch', 'vellori', 'boutique', 'shops1', 'shops2', 'tattoo', 'trail', 'tower1', 'tower2', 'bank2', 'repair', 'industrial']);
  const labelN = new Map();
  for (const p of m.pois) if (p.kind === 'delivery') labelN.set(p.label, (labelN.get(p.label) || 0) + 1);
  const GENERIC = new Set(['Storefronts', 'Office Tower', 'Glass Tower', 'Auto Repair', 'Factory', 'First City Bank', 'Crown Boutique', 'Royale Fashion', 'Crown Couture']);
  // (named: where nothing else will do - no plain building, no generic storefront, no open ground near - a named
  // business's storefront, by the rules the clinics take theirs (world3-medics.js): a shop, a restaurant or a small
  // office's lot building with nothing but storefronts in it, no home, not a handcrafted district's, not a painted one)
  const homeB = new Set();
  for (const h of m.homes || []) if (h && h.b !== undefined) homeB.add(h.b);
  const doorKinds = new Map();   // building -> the kinds of its doors
  const kindIn = (bi, kind) => { let s = doorKinds.get(bi); if (!s) doorKinds.set(bi, (s = new Set())); s.add(kind); };
  for (const p of m.pois) if (p.b !== undefined && p.b !== null) kindIn(p.b, p.kind);
  const namedOk = (p, b) => {
    if (b.prefab < 0 || b.home !== undefined || homeB.has(b.id) || (m.handBuilt && m.handBuilt.has(b))) return false;
    const key = (m.prefabs[b.prefab] && m.prefabs[b.prefab].key) || '';
    if (!STORE_KEYS.test(key) || NOT_INTO.test(p.label || '') || NOT_INTO.test(b.name || '')) return false;
    for (const k of doorKinds.get(b.id) || []) if (k !== 'delivery') return false;
    return true;
  };
  const storefront = (tx, ty, r, d, ownOnly, named = false) => {
    let best = null, bd = r * r;
    for (const p of m.pois) {
      if (p.kind !== 'delivery' || p.fixed || p.b === undefined || p.b === null) continue;
      const b = m.buildings[p.b];
      if (!b || b.gone || b.walkIn) continue;
      const x = p.x / TILE, y = p.y / TILE, pd = distAt(Math.floor(x), Math.floor(y));
      if (ownOnly && pd !== d) continue;
      const pk = placeKind3(pd);
      if (pk === 'wild' || pk === 'none') continue;
      const e = (x - tx) * (x - tx) + (y - ty) * (y - ty) + (pd === d ? 0 : 1600);
      if (e >= bd) continue;
      if (named ? !namedOk(p, b) : !RETYPE.has(b.kind) || !(GENERIC.has(p.label) || labelN.get(p.label) > 1)) continue;
      bd = e; best = p;
    }
    return best;
  };
  const retype = (p, kind) => {
    const d = distAt(Math.floor(p.x / TILE), Math.floor(p.y / TILE)), [label, sign] = unitName(kind, DISTRICTS[d]), old = p.label, b = m.buildings[p.b];
    p.kind = kind; p.label = label; p.own = 1;
    kindIn(p.b, kind);
    if (b.name === old) b.name = label;
    let signed = false;
    for (const sg of b.signs || []) if (sg.text === old) { sg.text = sign; signed = true; }
    if (!signed && b.prefab >= 0) { const south = m.prefabs[b.prefab].rot === 0; (b.signs ||= []).push({ x: p.x, y: south ? (b.ty + b.th - 0.6) * TILE : (b.ty + 0.6) * TILE, text: sign }); }
    addSrc(kind, p.x / TILE, p.y / TILE);
    out.units[kind] = (out.units[kind] || 0) + 1; out.retyped++;
    out.list.push([d, kind, label]);
  };
  // the units a spot still lacks (the need that called first), at most what the front has room for (5 tiles a unit)
  const UNIT_OF = (need, d, x, y) => {
    const st = DISTRICTS[d].style;
    if (need === 'weapons') return 'gunshop';
    if (need === 'food') return 'convenience';
    if (need === 'equipment') {
      const i = m.inside(Math.floor(x), Math.floor(y)) ? m.idx(Math.floor(x), Math.floor(y)) : -1, wet = i >= 0 && ((m.distSea && m.distSea[i] < 24 * 4) || (m.distRiver && m.distRiver[i] < 16 * 4));
      if (wet && (st === 'beach' || st === 'harbor' || VILLAGE.has(d))) return 'tackle';
      if (st === 'beach' || st === 'luxury' || st === 'park') return 'sports';
      return 'hardware';
    }
    return null;
  };
  // (a lot in any built-up district near the spot: across a district's edge)
  const lotNear = (tx, ty, w, r) => { const at = lot(tx, ty, w, 6, r, -1, true); if (!at) return null; const pk = placeKind3(distAt(at[0], at[1])); return pk === 'wild' || pk === 'none' || OPEN.has(distAt(at[0], at[1])) ? null : at; };
  // (...and the nearest in one, past any open ground in the wild land, the park or the airfield nearer)
  const builtUp = (d) => { const pk = placeKind3(d); return pk !== 'wild' && pk !== 'none' && !OPEN.has(d); };
  const lotBuilt = (tx, ty, w, r) => lot(tx, ty, w, 6, r, -1, true, false, builtUp);
  const near2 = (k, x, y) => { let e = Infinity; const a = src[k]; for (let j = 0; j < a.length; j += 2) { const q = (a[j] - x) * (a[j] - x) + (a[j + 1] - y) * (a[j + 1] - y); if (q < e) e = q; } return Math.sqrt(e); };
  // a row of shops built on the lot at (from lot(): [x0, y0, depth]) w tiles wide, for the needs ks of the spot (tx, ty)
  // served (sv: the district's served(), as it stands)
  let sv = null;
  const buildRow = (at, w, ks, tx, ty) => {
    const bd2 = distAt(at[0], at[1]);
    const b = build(at[0], at[1], w, at[2], bd2, ks.map((k) => [UNIT_OF(k, bd2, tx, ty)]));
    const ps = row(b, ks.map((k) => [UNIT_OF(k, bd2, tx, ty)]), true, bd2);
    for (const p of ps) for (const k of needsOf(p.kind)) sv(k, p.x / TILE, p.y / TILE);
    if (ps.atm) sv('cash', ps.atm.x / TILE, ps.atm.y / TILE);
  };
  // the districts, one by one
  const order = [...samples.keys()].sort((a, b) => a - b);
  for (const d of order) {
    const S = samples.get(d), n = S.length >> 1, D = DISTRICTS[d];
    // (the park and the airfield: food and cash; the remote villages no gun shop - everything else: SHOP_NEEDS)
    const needs = OPEN.has(d) ? ['food', 'cash'] : VILLAGE.has(d) ? NEED_KEYS.filter((k) => k !== 'weapons') : NEED_KEYS;
    // each sample's distance to the nearest of each need (only the places within reach of the district's box count)
    let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
    for (let j = 0; j < n; j++) { const x = S[2 * j], y = S[2 * j + 1]; if (x < bx0) bx0 = x; if (x > bx1) bx1 = x; if (y < by0) by0 = y; if (y > by1) by1 = y; }
    const dd = {};
    for (const k of needs) {
      const a = new Float64Array(n).fill(4 * SHOP_REACH[k]), cap = 4 * SHOP_REACH[k], L = src[k];
      for (let q = 0; q < L.length; q += 2) {
        const sx = L[q], sy = L[q + 1];
        if (sx < bx0 - cap || sx > bx1 + cap || sy < by0 - cap || sy > by1 + cap) continue;
        for (let j = 0; j < n; j++) { const ex = S[2 * j] - sx, ey = S[2 * j + 1] - sy, e = ex * ex + ey * ey; if (e < a[j] * a[j]) a[j] = Math.sqrt(e); }
      }
      dd[k] = a;
    }
    const served = (k, x, y) => { const a = dd[k]; if (!a) return; for (let j = 0; j < n; j++) { const ex = S[2 * j] - x, ey = S[2 * j + 1] - y, e = ex * ex + ey * ey; if (e < a[j] * a[j]) a[j] = Math.sqrt(e); } };
    const giveUp = (k, x, y) => { const a = dd[k], R = SHOP_REACH[k] * 0.6; for (let j = 0; j < n; j++) { const ex = S[2 * j] - x, ey = S[2 * j + 1] - y; if (ex * ex + ey * ey < R * R) a[j] = 0; } out.stuck[`${D.name} ${k}`] = (out.stuck[`${D.name} ${k}`] || 0) + 1; };
    const lacking = {};
    sv = served;
    for (let it = 0; it < 120; it++) {
      // the worst-served sample (by need, against its reach); once all are served, a need with no place of its own
      let wk = null, wj = -1, wr = 1;
      for (const k of needs) { const a = dd[k], R = SHOP_REACH[k]; for (let j = 0; j < n; j++) if (a[j] / R > wr) { wr = a[j] / R; wj = j; wk = k; } }
      if (wj < 0 && !OPEN.has(d)) for (const k of needs) if (!own[d][k] && (lacking[k] || 0) < 3) { wk = k; let best = -1; for (let j = 0; j < n; j++) if (dd[k][j] > best) { best = dd[k][j]; wj = j; } break; }
      if (wj < 0) break;
      const tx = S[2 * wj], ty = S[2 * wj + 1], R = SHOP_REACH[wk];
      const ownOnly = wr <= 1;   // (only for a place of its own: it must be in the district - three tries each, each at the
      // street then farthest from one: a try that lands its place over the district's edge serves that street, so the
      // next is elsewhere)
      if (ownOnly) lacking[wk] = (lacking[wk] || 0) + 1;
      // the plain building nearest the spot (its own district's first), within three quarters of the reach
      let best = null, bd = (R * 0.75) * (R * 0.75);
      for (const [cd, list] of cands) {
        if (ownOnly && cd !== d) continue;
        const pen = cd === d ? 0 : 1600;
        for (const c of list) { if (used.has(c.b.id) || busy.has(c.b.id)) continue; const e = (c.fx - tx) * (c.fx - tx) + (c.fy - ty) * (c.fy - ty) + pen; if (e < bd) { bd = e; best = c; } }
      }
      const want = (x, y) => {
        const u = [];
        for (const k of ['weapons', 'equipment', 'food']) if (needs.includes(k) && (k === wk || near2(k, x, y) > SHOP_REACH[k] * 0.5 || (!own[d][k] && distAt(Math.floor(x), Math.floor(y)) === d))) u.push(k);
        return u;
      };
      if (best) {
        used.add(best.b.id);
        const ks = want(best.fx, best.fy), room = Math.max(1, Math.min(3, Math.floor(best.b.tw / 5)));
        while (ks.length > room) { const drop = ks.findIndex((k) => k !== wk); ks.splice(drop < 0 ? ks.length - 1 : drop, 1); }
        const atm = wk === 'cash' || near2('cash', best.fx, best.fy) > SHOP_REACH.cash * 0.5 || !own[best.d].cash;
        const units = ks.map((k) => [UNIT_OF(k, best.d, best.fx, best.fy)]);
        if (!units.length) {   // (only cash wanted here: an ATM against the building's front, as the street ATMs stand)
          const b = best.b, xs = [(b.tx + b.tw / 2) * TILE, b.tx * TILE + 30, (b.tx + b.tw) * TILE - 30];
          let a = null;
          for (const loose of [false, true]) for (const x of xs) if (!a) a = H.wallAtm(b, x, ATM_LOOK[Math.floor(hash2(b.tx, b.ty, 78) * ATM_LOOK.length)], loose);
          if (!a) a = kiosk(Math.floor(best.fx), Math.floor(best.fy) + 1, 4);
          if (a) { addSrc('atm', a.x / TILE, a.y / TILE); out.atms++; served('cash', a.x / TILE, a.y / TILE); } else giveUp(wk, tx, ty);
          continue;
        }
        const ps = row(best.b, units, atm, best.d);
        out.rows++;
        for (const p of ps) for (const k of needsOf(p.kind)) if (dd[k]) served(k, p.x / TILE, p.y / TILE);
        if (ps.atm) served('cash', ps.atm.x / TILE, ps.atm.y / TILE);
        continue;
      }
      // no plain building near: a generic storefront taken over (weapons, equipment)
      if (wk === 'weapons' || wk === 'equipment') {
        const p = storefront(tx, ty, R * 0.75, d, ownOnly);
        if (p) { retype(p, UNIT_OF(wk, distAt(Math.floor(p.x / TILE), Math.floor(p.y / TILE)), p.x / TILE, p.y / TILE)); served(wk, p.x / TILE, p.y / TILE); continue; }
      }
      // or a small row of shops on open ground by the street (not in the park or on the airfield)
      if (!OPEN.has(d) && wk !== 'cash') {
        const ks = want(tx, ty), w = ks.length >= 3 ? 16 : ks.length === 2 ? 11 : 7;
        const lr = wk === 'food' ? 48 : Math.min(160, Math.floor(R * 0.4));
        // (in the district; else in any built-up one near; else - only to bring a far street within reach - on open
        // ground by the road just over its edge, in the country: a roadside store)
        const at = lot(tx, ty, w, 6, lr, d) || (ownOnly ? null : lotNear(tx, ty, w, lr) || lot(tx, ty, w, 6, lr, -1, true, true));
        if (at) { buildRow(at, w, ks, tx, ty); continue; }
      }
      if (wk === 'food') { const p = cart(tx, ty, 24, d); if (p) { served('food', p.x / TILE, p.y / TILE); continue; } }
      if (wk === 'cash') { const a = kiosk(tx, ty, 24, ownOnly ? d : -1); if (a) { addSrc('atm', a.x / TILE, a.y / TILE); out.atms++; served('cash', a.x / TILE, a.y / TILE); continue; } }
      // nowhere to build: a named business's storefront taken over (2026-10-24: the back gardens that replaced the roof
      // blocks behind the houses - map.js fillerInner - took the plain buildings Sunset Beach's gun shop stood in)
      if (wk !== 'cash') {
        const p = storefront(tx, ty, R * 0.75, d, ownOnly, true);
        if (p) { const k = UNIT_OF(wk, distAt(Math.floor(p.x / TILE), Math.floor(p.y / TILE)), p.x / TILE, p.y / TILE); retype(p, k); for (const n of needsOf(k)) if (dd[n]) served(n, p.x / TILE, p.y / TILE); continue; }
      }
      // or, for a gun shop or a hardware store (a short drive) - not in a remote village - farther off, over the district's
      // edge: in a plain building, a named storefront or on open ground, just inside the reach (2026-10-24: Downtown,
      // built by hand to its edges between the park and the handcrafted districts, had its south-east corner's hardware
      // store from Pine Hills' pass by luck, and lost it when Pine Hills' shops moved)
      if (!ownOnly && (wk === 'weapons' || wk === 'equipment') && !VILLAGE.has(d)) {
        const rf = R - 10;
        let c = null, cd2 = rf * rf;
        for (const [, list] of cands) for (const q of list) { if (used.has(q.b.id) || busy.has(q.b.id)) continue; const e = (q.fx - tx) * (q.fx - tx) + (q.fy - ty) * (q.fy - ty); if (e < cd2) { cd2 = e; c = q; } }
        if (c) {
          used.add(c.b.id);
          const ps = row(c.b, [[UNIT_OF(wk, c.d, c.fx, c.fy)]], near2('cash', c.fx, c.fy) > SHOP_REACH.cash * 0.5 || !own[c.d].cash, c.d);
          out.rows++;
          for (const q of ps) for (const k of needsOf(q.kind)) served(k, q.x / TILE, q.y / TILE);
          if (ps.atm) served('cash', ps.atm.x / TILE, ps.atm.y / TILE);
          continue;
        }
        const p = storefront(tx, ty, rf, d, false, true);
        if (p) { const k = UNIT_OF(wk, distAt(Math.floor(p.x / TILE), Math.floor(p.y / TILE)), p.x / TILE, p.y / TILE); retype(p, k); for (const n of needsOf(k)) served(n, p.x / TILE, p.y / TILE); continue; }
        const at = lotBuilt(tx, ty, 7, rf);
        if (at) { buildRow(at, 7, [wk], tx, ty); continue; }
      }
      if (ownOnly) lacking[wk] = 3;   // (nothing to be had here: no more tries)
      else giveUp(wk, tx, ty);
    }
  }
  // the wild land's themed places
  for (const S of WILD_SHOPS3) {
    const anchor = S.at === 'junction' ? junction(m, S.d) : (() => { const p = m.pois.find((q) => q.kind === S.at && distAt(Math.floor(q.x / TILE), Math.floor(q.y / TILE)) === S.in); return p ? [Math.floor(p.x / TILE), Math.floor(p.y / TILE)] : null; })();
    if (!anchor) { out.stuck[`${DISTRICTS[S.d].name} (wild)`] = 1; continue; }   // (a district with no roads)
    const w = S.units.length > 1 ? 12 : 8;
    let at = lot(anchor[0], anchor[1], w, 6, 60, S.d, false, true) || lot(anchor[0], anchor[1], w, 6, 60, S.d, true, true);
    // (none by its crossroads: along its roads, nearest that first)
    if (!at) for (const [x, y] of roadSpots(m, S.d, anchor)) { at = lot(x, y, w, 6, 16, S.d, false, true); if (at) break; }
    // (still none - a village's harbour built up to the water: on open ground near it, over the district's edge if need be)
    if (!at) at = lot(anchor[0], anchor[1], w, 6, 120, -1, true, true);
    if (!at) { out.stuck[`${DISTRICTS[S.d].name} (wild)`] = 1; continue; }
    const b = build(at[0], at[1], w, at[2], distAt(at[0], at[1]), S.units, S.roof);
    row(b, S.units.map(([k, name]) => [k, name, name]), true, distAt(at[0], at[1]), { counter: true });
    out.wild++;
  }
  // open ground for a lifeguard tower within 40 tiles of (tx, ty): 3 x 4 tiles of sand, grass or paving, nothing built,
  // reserved, kept or solid on it, nothing's map point near
  const towerSpot = (tx, ty) => {
    for (let k = 2; k <= 40; k++) for (let dy = -k; dy <= k; dy++) for (let dx = -k; dx <= k; dx += (Math.abs(dy) === k ? 1 : 2 * k)) {
      const x = tx + dx, y = ty + dy;
      let ok = true;
      for (let yy = y - 1; yy <= y + 2 && ok; yy++) for (let xx = x - 1; xx <= x + 1 && ok; xx++) {
        if (!m.inside(xx, yy)) { ok = false; break; }
        const i = m.idx(xx, yy);
        if (!(m.tiles[i] === T.SAND || m.tiles[i] === T.GRASS || m.tiles[i] === T.PLAZA) || m.bld[i] >= 0 || m.reserve[i] & 3 || m.deck[i] || m.solidProps.has(i)) ok = false;
      }
      if (!ok || solidNear((x + 0.5) * TILE, (y + 0.5) * TILE, 40) || m.pois.some((p) => Math.abs(p.x - (x + 0.5) * TILE) < 96 && Math.abs(p.y - (y + 1) * TILE) < 96)) continue;
      if (propsIn((x - 1) * TILE, (y - 1) * TILE, (x + 2) * TILE, (y + 3) * TILE).some((pr) => KEEP.has(pr.t))) continue;
      return [x, y];
    }
    return null;
  };
  // where there's no town: a ranger station or a first-aid post by the road nearest its spot, somewhere to come round
  // (kind 'hospital': a respawn point - shared/world3-medics.js)
  out.posts = [];
  for (const [name, xy, roof] of POSTS3) {
    const at0 = typeof xy === 'string' ? m.pois.find((q) => q.label === xy) : null, a = at0 ? [Math.floor(at0.x / TILE), Math.floor(at0.y / TILE)] : typeof xy === 'string' ? null : roadNear3(m, xy[0], xy[1]);   // (a place's name: by it)
    let at = null, w = 8;
    if (a) for (const [ww, hh, r] of [[8, 6, 30], [7, 5, 60], [6, 5, 90]]) { at = lot(a[0], a[1], ww, hh, r, -1, true, true); if (at) { w = ww; break; } }
    if (!at && a) for (const [x, y] of roadSpots(m, distAt(a[0], a[1]), a)) { at = lot(x, y, 8, 6, 16, -1, true, true); if (at) break; }
    if (!at) {
      // (no room for a building - a handcrafted key built up to its beaches: a lifeguard tower with the first-aid post at
      // its foot, on open ground near the road)
      const q = a && towerSpot(a[0], a[1]);
      if (!q) { out.stuck[name] = 1; continue; }
      for (const pr of propsIn((q[0] - 1) * TILE, (q[1] - 1) * TILE, (q[0] + 2) * TILE, (q[1] + 3) * TILE)) gone.add(pr);   // (the greenery off its spot)
      H.addProp(m, 'lifeguard', (q[0] + 0.5) * TILE, (q[1] + 0.5) * TILE, 16);
      m.pois.push({ id: m.pois.length, kind: 'hospital', label: name, x: (q[0] + 0.5) * TILE, y: (q[1] + 1.8) * TILE, r: 44, counter: true, own: 1 });
      out.posts.push([name, q[0], q[1], 'tower']);
      continue;
    }
    const d = distAt(at[0], at[1]), b = build(at[0], at[1], w, at[2], d, [['hospital', name]], roof);
    row(b, [['hospital', name, name]], false, d, { counter: true });
    out.posts.push([name, at[0], at[1]]);
  }
  if (gone.size) { const keys = new Set([...gone].map((p) => p.x + ',' + p.y)); H.removeProps(m, (x, y) => keys.has(x + ',' + y)); }
  return out;
}
const ATM_LOOK = ['blue', 'red', 'green', 'gold', 'grey', 'canopy', 'leaf', 'hood', 'recess', 'cash', 'wood', 'frame'];

// a district's ground-level roads every 24 tiles (no highway, no alley), nearest (ax, ay) first, at most 80 of them
function roadSpots(m, d, [ax, ay]) {
  const out = [];
  for (let ty = m.y0 || 0; ty < (m.y0 || 0) + m.h; ty += 24) {
    const r = m.row(ty);
    for (let tx = m.x0 || 0; tx < (m.x0 || 0) + m.w; tx += 24) { const i = r + m.col(tx); if (m.tiles[i] === T.ROAD && m.roadRank[i] === 2 && m.dist[i] === d) out.push([tx, ty]); }
  }
  out.sort((a, b) => ((a[0] - ax) * (a[0] - ax) + (a[1] - ay) * (a[1] - ay)) - ((b[0] - ax) * (b[0] - ax) + (b[1] - ay) * (b[1] - ay)) || a[0] - b[0] || a[1] - b[1]);
  return out.slice(0, 80);
}
// The busiest ground-level crossroads of district d out in the country (most roads meeting, no highway, no town's
// district within 60 tiles of it), nearest the middle of the district's such crossroads: [tx, ty]. With none, a bend
// or a joint of its roads (two meeting) the same way.
export function junction(m, d) {
  const built = (tx, ty) => { for (let dy = -60; dy <= 60; dy += 12) for (let dx = -60; dx <= 60; dx += 12) { if (!m.inside(tx + dx, ty + dy)) continue; const pk = placeKind3(m.dist[m.idx(tx + dx, ty + dy)]); if (pk !== 'wild' && pk !== 'none') return true; } return false; };
  for (const min of [3, 2]) {
    const inD = [];
    for (const nd of m.nodes) {
      if (!nd || nd.lvl !== 0 || !nd.edges || nd.edges.length < min) continue;
      const tx = Math.floor(nd.x / TILE), ty = Math.floor(nd.y / TILE);
      if (!m.inside(tx, ty) || m.dist[m.idx(tx, ty)] !== d) continue;
      if (nd.edges.some((id) => { const e = m.edges[id]; return !e || e.kind === 'hwy' || e.kind === 'ramp' || e.foot; })) continue;
      if (built(tx, ty)) continue;
      inD.push([tx, ty, Math.min(4, nd.edges.length)]);
    }
    if (!inD.length) continue;
    let sx = 0, sy = 0;
    for (const [x, y] of inD) { sx += x; sy += y; }
    sx /= inD.length; sy /= inD.length;
    inD.sort((a, b) => b[2] - a[2] || ((a[0] - sx) * (a[0] - sx) + (a[1] - sy) * (a[1] - sy)) - ((b[0] - sx) * (b[0] - sx) + (b[1] - sy) * (b[1] - sy)) || a[0] - b[0] || a[1] - b[1]);
    return [inD[0][0], inD[0][1]];
  }
  return null;
}

// An ATM by every station's map point and every gas station that has none within reach (the done hook, once the
// station houses stand where they stay: world3-rail.js seatStationHouses). H: { addProp }
export function stationAtms3(m, H) {
  let n = 0;
  const atms = m.pois.filter((p) => p.kind === 'atm' || p.kind === 'bank');
  const has = (x, y, r) => atms.some((a) => Math.abs(a.x - x) < r && Math.abs(a.y - y) < r && Math.hypot(a.x - x, a.y - y) < r);
  const solidNear = (x, y, r) => { const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE); for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { if (!m.inside(tx + dx, ty + dy)) continue; for (const e of m.solidProps.get(m.idx(tx + dx, ty + dy)) || []) if (Math.hypot(e.x - x, e.y - y) < r + e.r) return true; } return false; };
  const rails = [];
  for (const R of m.rails || []) for (let j = 0; j < R.pts.length; j += 2) { const p = R.pts[j]; if (!p.under) rails.push(p); }
  const nearRail = (x, y) => rails.some((p) => Math.abs(p.x - x) < 120 && Math.abs(p.y - y) < 120);
  for (const p of m.pois) {
    if (p.kind !== 'station' && p.kind !== 'gasstation') continue;
    if (has(p.x, p.y, p.kind === 'station' ? 480 : 320)) continue;
    const tx0 = Math.floor(p.x / TILE), ty0 = Math.floor(p.y / TILE);
    let done = null;
    for (let k = 2; k <= 8 && !done; k++) for (let dy = -k; dy <= k && !done; dy++) for (let dx = -k; dx <= k && !done; dx += (Math.abs(dy) === k ? 1 : 2 * k)) {
      const x = tx0 + dx, y = ty0 + dy;
      if (!m.inside(x, y)) continue;
      const i = m.idx(x, y), t = m.tiles[i];
      if (!WALK.has(t) || m.reserve[i] & 3 || m.deck[i] || !WALK.has(m.tileAt(x, y + 1))) continue;
      const px = (x + 0.5) * TILE, py = y * TILE + 4;
      if (nearRail(px, py) || solidNear(px, py + 20, 34) || m.pois.some((q) => Math.abs(q.x - px) < 56 && Math.abs(q.y - py - 30) < 56)) continue;
      H.addProp(m, 'atmw', px, py + 20, 11, { v: 'kiosk' });
      done = { id: m.pois.length, kind: 'atm', label: 'ATM', x: px, y: py + 42, r: 36 };
      m.pois.push(done);
      atms.push(done);
      n++;
    }
  }
  m.atms = m.pois.filter((p) => p.kind === 'atm');
  return n;
}
