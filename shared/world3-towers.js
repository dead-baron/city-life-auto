// No huge tall plain towers (the owner, 2026-11-06: "there are still a lot of really huge tall plain buildings, like park
// west tower. If we need those big buildings in to share the performance costs then that's understandable, but it would
// be cool to make those buildings more interesting, less tall, maybe split them up into multiple buildings"). His call:
// the biggest plain towers become several buildings of different heights, with setbacks, rooftop detail and shops at the
// street; a few real landmark towers stay downtown (TOWER_LANDMARKS).
//
// A hand plan's tower (shared/world3-downtown.js towerKit, shared with the Civic Center and Westport) is drawn whole: its
// floors across its whole front, one wall of glass or stone as wide as its lot - Park West Tower's 48 tiles, 16 floors
// (922 px, 29 tiles of the street north of it under its wall). Once the world is built (after the plain blocks are cut:
// shared/map.js breakPlainBlocks, and Southside's lots), each plain one - no business but its delivery stop or a home
// behind its lobby, no walk-in, no set-piece kit, no neon, its own light none - over TOWER3.front tiles of front or
// TOWER3.area of footprint, TOWER3.floors floors or more, is split in its own footprint (Midtown's and the Downtown
// concepts' proportions: a slim tower on the avenue, mid-rise wings stepping down from it, low shops on the pavement):
//   - the tower: slim (10-20 tiles of front) over its own door, so its lobby, its name, its delivery stop or its home stay
//     where they were; lower (at most TOWER3.cap floors, two less than it had, and lower still where its wall would cover
//     a place or a sign to the north), its top floors a setback crown (the art's `up`: client/art2/game/statics.js);
//   - either side of it, in pieces of at most 26 tiles: a wing set back behind a podium of one or two floors of shops,
//     or a mid-rise of three to six floors with its shop on the pavement - the floors stepping down away from the tower,
//     its skin another of the city's (stone by glass, brick by stone), its windows and cornice its own;
//   - a footprint deeper than TOWER3.deep: its back a lower block (or two) behind them, brick with a water tank or
//     offices, its roof dressed by its kind;
//   - the roofs: the tower's and the offices' plant (the art's kit by archetype), the wings' terraces (planters, palms,
//     umbrellas - a condo's) or roof gardens, the podiums' roof gardens, the back blocks' water tanks and chimneys.
// The tiles don't change (the footprint stays one built mass, only its parts are buildings of their own: m.bld), nor the
// tower's lot (its prefab record), door, sign, POIs or home. The tower keeps the building's id (and so its look's seed);
// the other parts are new buildings at the end of the list, so no other building's id - and no other look - moves. Every
// choice is a hash of the footprint's corner (hash2): no random stream, nothing else shifts.
import { TILE } from './constants.js';
import { hash2 } from './rng.js';

// the landmark towers kept as they are: the city's crown on the park's axis, the bank plaza's pair (WC353/354), the hotel
// on its fountain drive (WC356), Westport's own crown
export const TOWER_LANDMARKS = ['Greenfield Tower', 'Union Trust Tower', 'Sterling Tower', 'Grand Neon Hotel', 'Westport Center Tower'];
// floors: a tower this tall or more is split if it's big - a front of `front` tiles or `area` of footprint; cap: the
// tallest a split tower stands (its crown included); slim: its widest front; deep: a front zone's deepest (behind it, the
// back block); piece: the widest of the side pieces; most: the most buildings a tower becomes
export const TOWER3 = { floors: 8, front: 24, area: 600, cap: 12, slim: 20, deep: 28, piece: 26, most: 5 };
// the wall a tower of f floors draws (px: a shop's ground floor, the floors over it, the cornice and a 12 px parapet -
// client/art2/buildings.js buildingH), and the most floors whose wall stays within t tiles
const wallPx = (f) => 26 + 56 * f;
const floorsIn = (t) => Math.floor((t * TILE - 26) / 56);

const GLASS = ['#2a4a6a', '#2e5670', '#284256', '#36606e', '#3a4e66', '#3a5a72'];
const STONE = ['#ddd2bc', '#d4c8b0', '#c8bca4', '#e2dac6', '#cfc4ae', '#b8b0a2'];
const BRICK = ['#a85a42', '#8e4a3a', '#b8705a', '#7a4a3a', '#9a5a46'];
const CONCRETE = ['#c8c4bc', '#b8b4aa', '#d8d4cc'];
const SIGNC = [['#1e2a3a', [236, 214, 150]], ['#16202c', [240, 236, 220]], ['#2a2420', [236, 200, 140]], ['#f0ece4', [30, 42, 58]], ['#2f4a3a', [240, 232, 200]], ['#5a2a2e', [250, 230, 190]]];
// the shops along the podiums and the mid-rises' ground floors: their storefront (client/art2/buildings.js), names, awnings
const SHOPS = [
  ['cafe', ['Corner Roast', 'Daybreak Coffee', 'Little Press', 'Copper Kettle', 'Steam & Bean', 'Morning Glory'], [['#2f5a4a', '#f0ece4'], ['#6a4a2a', '#f0ece4']]],
  ['florist', ['Petal & Stem', 'Bloom Room', 'Green Thumb'], [['#2f6a4e', '#f0ece4'], ['#c8a0b0', '#f0ece4']]],
  ['books', ['Inkwell Books', 'Chapter One', 'Page & Spine'], [['#2a3a5a', '#2a3a5a'], ['#5a2a2e', '#efe6d0']]],
  ['clothes', ['Linen House', 'Northwind', 'Tailor & Thread', 'Sable'], [['#16202c', '#16202c'], ['#3a3a44', '#e8e4dc']]],
  ['bar', ['The Brass Rail', 'Highball', 'Copper Still'], [['#5a2a2e', '#efe6d0'], ['#2a2420', '#2a2420']]],
  ['diner', ['Uptown Diner', 'Blue Plate'], [['#a8343a', '#f0ece4'], ['#2a6ab0', '#f0ece4']]],
  ['laundry', ['Press & Fold', 'Fresh Pressed'], [['#2a6ab0', '#f0ece4']]],
  ['mart', ['Metro Market', 'Daily Fresh', 'City Grocer'], [['#2f8a72', '#f0ece4'], ['#a83a2a', '#e8e4dc']]],
  ['records', ['Groove Records', 'Side B'], [['#2a2c38', '#2a2c38']]],
];

export function towers3(m) {
  const out = { split: 0, made: 0, kept: [], list: [] };
  const roles = new Map();   // (building -> its POIs' kinds)
  for (const p of m.pois) if (p && p.b !== undefined) { const a = roles.get(p.b) || []; a.push(p.kind); roles.set(p.b, a); }
  const n0 = m.buildings.length;
  for (let i = 0; i < n0; i++) {
    const b = m.buildings[i];
    if (!b || b.gone || !b.hand || !b.whole || b.back || !b.door || !b.art || !b.art.spec || b.walkIn || b.hero) continue;
    const S = b.art.spec, F = S.floors || 0;
    if (F < TOWER3.floors || (b.tw < TOWER3.front && b.tw * b.th < TOWER3.area)) continue;
    if (b.art.kit || b.art.neon || (b.art.lights && b.art.lights.length) || S.height) continue;
    if ((b.business && b.business !== 'delivery') || (roles.get(b.id) || []).some((k) => k !== 'delivery' && k !== 'home')) continue;
    if (TOWER_LANDMARKS.includes(b.name)) { out.kept.push(b.id); continue; }
    const parts = splitTower(m, b);
    out.split++; out.made += parts.length - 1;
    out.list.push([b.id, ...parts.slice(1)]);
  }
  return out;
}

function splitTower(m, b) {
  const x = b.tx, y = b.ty, w = b.tw, h = b.th, dtx = b.door.tx, S = b.art.spec, F = S.floors;
  const r = (k) => hash2(x * 7 + k, y * 13 - k, 1607);
  const pk = (list, k) => list[Math.floor(r(k) * list.length) % list.length];
  const glass = (S.style || 'glass') === 'glass', homes = b.home !== undefined;
  // the front zone (its south edge the street front) and the back block behind it
  const D = h <= TOWER3.deep ? h : Math.max(18, Math.min(TOWER3.deep, h - 8, 22 + Math.floor(r(1) * 7))), k = h - D;
  // the tower: slim, over its door (a tile or two of the front either side of the door), sides under 6 tiles taken in
  let tw = w - 6 < 10 ? w : Math.min(TOWER3.slim, Math.max(10, Math.round(w * (0.3 + 0.12 * r(2)))));
  let lo = Math.max(x, dtx - tw + 3), hi = Math.min(x + w - tw, dtx - 2);
  if (lo > hi) lo = hi = Math.max(x, Math.min(x + w - tw, dtx - (tw >> 1)));
  let tx0 = lo + Math.floor(r(3) * (hi - lo + 1));
  if (tx0 - x > 0 && tx0 - x < 6) { if (dtx < x + tw - 1) tx0 = x; else { tw += tx0 - x; tx0 = x; } }
  const R0 = x + w - tx0 - tw;
  if (R0 > 0 && R0 < 6) { if (dtx > x + w - tw) tx0 = x + w - tw; else tw += R0; }
  // its height: two floors less, at most the cap, its wall over the street north of its back block 14 tiles at most -
  // and lower while it would cover a place or a sign to the north
  let Ft = Math.max(Math.min(F, 7), Math.min(TOWER3.cap, F - 2, floorsIn(k + 14)));
  // (a part standing back kb tiles from the footprint's north edge, f floors: lowered while its wall would hide a place or
  // a sign north of the footprint, down to `min`)
  const lower = (f, px, pw, py, kb, min) => { while (f > min && covered(m, b.id, px, pw, py, Math.ceil(wallPx(f) / TILE) - kb)) f--; return f; };
  Ft = lower(Ft, tx0, tw, y, k, 7);
  const crown = Ft >= 9 && tw >= 10 && D >= 14 ? 2 + (r(4) < 0.4 ? 1 : 0) : 0;
  // the tower keeps the building: its footprint the slim front part, its art lower with its crown set back on it
  b.tx = tx0; b.tw = tw; b.ty = y + k; b.th = D;
  S.floors = Ft - crown;
  if (b.art.shop) b.art.shop.door = Math.max(10, Math.min(tw * TILE - 32, (dtx - tx0) * TILE + 5));
  if (crown) b.art.up = { w: 1 + Math.floor(r(5) * 2), e: 1 + Math.floor(r(6) * 2), n: 1 + Math.floor(r(7) * 2), s: 2 + Math.floor(r(8) * 3), floors: crown };
  b.towerPart = { of: b.id, role: 'tower' };
  const parts = [b.id];
  const add = (role, px, py, pw, ph, o) => {
    const id = m.buildings.length;
    const sg = o.art.shop && o.art.shop.sign ? [{ x: Math.round((px + pw / 2) * TILE), y: Math.round((py + ph - 0.6) * TILE), text: o.art.shop.sign.text }] : [];   // (its shop's sign on the street: the street trees keep off it - world3-greens.js)
    const nb = { id, prefab: -1, tx: px, ty: py, tw: pw, th: ph, kind: b.kind, name: o.name, business: null, signs: sg, hand: true, arch: o.arch, whole: true, art: o.art, towerPart: { of: b.id, role } };
    m.buildings.push(nb);
    for (let yy = py; yy < py + ph; yy++) for (let xx = px; xx < px + pw; xx++) m.bld[m.idx(xx, yy)] = id;
    parts.push(id);
    return nb;
  };
  // the sides, out from the tower: pieces of at most TOWER3.piece tiles, the floors stepping down; each a wing set back
  // behind a podium of shops or a mid-rise with its shop on the pavement (neighbours differ). Planned first, so the group
  // stays at most TOWER3.most buildings: one back block, then the outermost podiums made mid-rises
  const skins = sideSkins(glass, S, r), plan = [];
  let q = 0;
  for (const [sx, sw, dir] of [[x, tx0 - x, -1], [tx0 + tw, x + w - tx0 - tw, 1]]) {
    if (sw <= 0) continue;
    const n = Math.ceil(sw / TOWER3.piece), pieces = [];
    for (let i = 0, at = 0; i < n; i++) { const pw = i === n - 1 ? sw - at : Math.floor(sw / n); pieces.push([at, pw]); at += pw; }
    if (dir < 0) pieces.reverse();   // (inner first: next to the tower)
    let top = Ft - 3, last = null;
    pieces.forEach(([off, pw], j) => {
      const px = sx + off, kq = 20 + q * 10;
      const fl = lower(Math.max(3, Math.min(top, Math.round(Ft * (0.35 + 0.3 * r(kq))) - j)), px, pw, y, k, 3);
      top = fl - 1;
      let mode = D >= 16 && pw >= 6 && r(kq + 1) < 0.58 ? 'podium' : 'mid';
      if (mode === last && D >= 16 && pw >= 6) mode = mode === 'podium' ? 'mid' : 'podium';
      last = mode;
      plan.push({ px, pw, fl, kq, j, out: j, mode, skin: skins[q++ % skins.length], name: `${b.name} ${dir < 0 ? 'West' : 'East'}${pieces.length > 1 ? ' ' + (j + 1) : ''}` });
    });
  }
  let backs = k >= 8 ? (w > 44 ? 2 : 1) : 0;
  const count = () => 1 + backs + plan.reduce((a, p) => a + (p.mode === 'podium' ? 2 : 1), 0);
  if (count() > TOWER3.most && backs === 2) backs = 1;
  for (const p of plan.slice().sort((a, c) => c.out - a.out)) if (count() > TOWER3.most && p.mode === 'podium') p.mode = 'mid';
  let lastShop = null;
  for (const p of plan.slice().sort((a, c) => a.px - c.px)) {   // (west to east: no two of a trade side by side)
    const { px, pw, fl, kq, skin, name } = p, shop = shopOf(r, kq + 5, pw, lastShop);
    lastShop = shop.kind;
    if (p.mode === 'podium') {
      const pd = 6 + Math.floor(r(kq + 2) * 3);
      add('wing', px, y + k, pw, D - pd, { name: name + ' Wing', arch: homes || r(kq + 3) < 0.4 ? 'condo' : 'office', art: partArt(skin, fl, r, kq, { noShop: true, terrace: true, balconies: homes || r(kq + 4) < 0.35 }) });
      add('podium', px, y + h - pd, pw, pd, { name: shop.name, arch: 'mixed', art: partArt(podiumSkin(skin, r, kq), 1 + (r(kq + 6) < 0.45 ? 1 : 0), r, kq + 50, { shop, garden: r(kq + 7) < 0.65 }) });
    } else add('mid', px, y + k, pw, D, { name: shop.name, arch: 'mixed', art: partArt(skin, Math.min(fl, 6), r, kq, { shop, garden: r(kq + 7) < 0.3 }) });
  }
  // the back: a lower block (two over a wide footprint) behind the front zone
  if (backs) {
    const two = backs === 2, cut = two ? x + Math.round(w * (0.4 + 0.2 * r(80))) : x + w;
    for (const [bx, bw, kk] of two ? [[x, cut - x, 81], [cut, x + w - cut, 86]] : [[x, w, 81]]) {
      // (on the street to the north: six floors at most, its wall no deeper over that street than its pavement and lanes)
      const fl = lower(Math.max(4, Math.min(6, Ft - 4 - Math.floor(r(kk) * 3))), bx, bw, y, 0, 4);
      const brick = r(kk + 1) < 0.55;
      const skin = brick ? { style: 'brick', tone: pk(BRICK, kk + 2), win: pk(['pair', 'loft', 'even'], kk + 3), cornice: pk(['dentil', 'bracket'], kk + 4) } : { style: 'concrete', wall: pk(CONCRETE, kk + 2), win: pk(['even', 'loft'], kk + 3), cornice: null };
      add('back', bx, y, bw, k, { name: `${b.name} Court`, arch: brick ? 'walkup' : 'office', art: partArt(skin, fl, r, kk, { noShop: true, fire: brick }) });
    }
  }
  return parts;
}

// the side pieces' skins, by the tower's: glass beside stone and brick, stone beside glass, never two alike in a row
function sideSkins(glass, S, r) {
  const st = (k) => ({ style: 'stone', wall: STONE[Math.floor(r(k) * STONE.length)], win: ['even', 'pair', 'arch', 'tall'][Math.floor(r(k + 1) * 4)], cornice: ['dentil', 'step', 'bracket'][Math.floor(r(k + 2) * 3)] });
  const br = (k) => ({ style: 'brick', tone: BRICK[Math.floor(r(k) * BRICK.length)], win: ['pair', 'even', 'arch', 'bay'][Math.floor(r(k + 1) * 4)], cornice: ['dentil', 'bracket'][Math.floor(r(k + 2) * 2)] });
  const gl = (k) => ({ style: 'glass', tint: GLASS.filter((c) => c !== S.wallColor)[Math.floor(r(k) * (GLASS.length - 1))], win: 'tall', cornice: null });
  const list = glass ? [st(40), br(44), st(48), br(52)] : [gl(40), br(44), gl(48), st(52)];   // (never glass by a glass tower: it would read as the tower)
  const s = Math.floor(r(39) * list.length);
  return [...list.slice(s), ...list.slice(0, s)];
}
// a podium's skin: stone or stucco under brick and glass, the wing's own over stone
function podiumSkin(skin, r, k) {
  if (skin.style === 'stone') return { ...skin, win: 'arch' };
  return r(k + 8) < 0.5 ? { style: 'stone', wall: STONE[Math.floor(r(k + 9) * STONE.length)], win: 'arch', cornice: 'dentil' } : { style: 'stucco', wall: ['#e8e2d2', '#d8ccb4', '#e6dccb'][Math.floor(r(k + 9) * 3)], win: 'even', cornice: 'step' };
}
function shopOf(r, k, pw, not = null) {
  let si = Math.floor(r(k) * SHOPS.length);
  if (SHOPS[si][0] === not) si = (si + 1 + Math.floor(r(k + 7) * (SHOPS.length - 1))) % SHOPS.length;   // (never two of a trade side by side)
  const [kind, names, awn] = SHOPS[si];
  const name = names[Math.floor(r(k + 1) * names.length)], [bg, fg] = SIGNC[Math.floor(r(k + 2) * SIGNC.length)];
  return { kind, name, door: r(k + 3) < 0.5 ? 'left' : 'right', open: true, people: 1 + Math.floor(r(k + 4) * 2), awning: pw >= 6 && r(k + 5) < 0.7 ? awn[Math.floor(r(k + 6) * awn.length)] : null, sign: { text: name.toUpperCase(), bg, fg, lit: true } };
}
// a part's art, as the towers' kit makes a tower's (shared/world3-downtown.js towerKit tower): its spec and its front
function partArt(skin, floors, r, k, o) {
  const glass = skin.style === 'glass';
  const spec = { floors, style: skin.style, ...(glass ? { wallColor: skin.tint } : skin.style === 'brick' ? { brickTone: skin.tone } : { wallColor: skin.wall }), win: skin.win, cornice: skin.cornice,
    parapet: 6 + Math.floor(r(k + 30) * 4) * 2, grime: 0.03 + r(k + 31) * 0.07, lip: 10, rimW: 5,
    roofMat: o.garden ? 'green' : o.terrace ? ['paver', 'deck', 'green', 'membrane'][Math.floor(r(k + 32) * 4)] : ['gravel', 'membrane', 'tar', 'gravel'][Math.floor(r(k + 32) * 4)] };
  if (o.garden) spec.garden = true;
  if (o.balconies) spec.balconies = true;
  if (o.fire && floors >= 4 && r(k + 33) < 0.6) spec.fireEscape = [12 + Math.floor(r(k + 34) * 6) * 8, 50];
  if (!o.shop) return { spec, noShop: true };
  return { spec, shop: o.shop };
}
// would a wall `t` tiles tall over the strip [x0, x0 + w) north of y cover a place (not a delivery stop) or another
// building's sign
function covered(m, self, x0, w, y, t) {
  if (t <= 0) return false;
  const X0 = x0 * TILE, X1 = (x0 + w) * TILE, Y0 = (y - t) * TILE, Y1 = y * TILE;
  for (const p of m.pois) if (p && p.b !== self && p.kind !== 'delivery' && p.x >= X0 && p.x < X1 && p.y >= Y0 && p.y < Y1) return true;
  for (let ty = Math.max(m.y0, y - t - 1); ty < y; ty++) for (let tx = x0; tx < x0 + w; tx++) {
    if (!m.inside(tx, ty)) continue;
    const o = m.buildings[m.bld[m.idx(tx, ty)]];
    if (o && o.id !== self && o.signs && o.signs.some((s) => s.x >= X0 && s.x < X1 && s.y >= Y0 && s.y < Y1)) return true;
  }
  return false;
}
