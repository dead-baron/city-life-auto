// A flat over a shop has its own door (the audit's lobbyDoor, 161 on 11-26: "Midtown Apt #32's lobby door at THE
// TRESTLE TAP" - the flat's spot stood at the far end of the shop's window, under the shop's sign, with no door drawn
// there: the hand plans say "a flat over the shop, its own door at the other end of the front" - world3-hand.js - and
// only the spot was made). The build gives each such front a flat's door: a pier of the building's own wall at one end
// of the front with a painted door in it (client/art2/buildings.js storefront, shop.flat), the shop's window, awning
// and OPEN sign kept to the shop's side of it, and the home's spot at that door. The end nearest the spot the plan
// gave, when the shop's own doorway and an ATM in the wall leave it room; else the other end; else none (the lint's
// row stays). A lobby front with no business behind it, or one the homes are named for, is the flats' own way in (ownLobby).
// One rule for the build and the lint (tools/audit/worldrows.mjs lobbyDoor: a home at a shop front with no door of its own).
// For the whole-world build's done hook (shared/world3-world.js), after the walk-ins are cut and the ATMs are seated.
//   flatDoors3(m) -> { fronts, made, moved, none, lobbies }
import { TILE } from './constants.js';

// w: the door's width (facade px, as the shop's own: 2 to an art pixel); edge: from the front's end to the door; pier:
// the wall kept each side of it; clear: the least window left between the pier and what the front already holds; atm:
// half an ATM's width in the wall (client/art2/game/statics.js frontAtms); shopDoor / walkDoor: a shop door's span by
// its side, a walk-in's doorway inside its two tiles (statics.js: sec.doorX, sec.doorW)
export const FLATDOOR = { w: 18, h: 46, edge: 7, pier: 6, clear: 4, atm: 21, shopDoor: [10, 32], walkDoor: [4, 8] };

// the homes of building b whose spot is at its street front (the south wall's foot): [poi, ...]
export function frontHomes(b, homes) {
  if (!b || b.back) return [];
  const foot = (b.ty + b.th) * TILE;
  return (homes || []).filter((h) => h.y >= foot - TILE);
}
// the flat's door of a shop front, as the art draws it: its left edge in facade px from the building's west edge, or -1
export const flatDoorX = (b) => (b && b.art && b.art.shop && b.art.shop.flat ? b.art.shop.flat.x : -1);
// is home spot h at the flat's own door of b's front?
export function atFlatDoor(b, h) {
  const fx = flatDoorX(b);
  return fx >= 0 && Math.abs(b.tx * TILE + fx + FLATDOOR.w / 2 - h.x) <= 1;
}
// a lobby front that is the flats' own way in: no business behind it, or the homes named for the building itself
// (Coral Court's two wings under CORAL COURT: "Coral Court West Apt" in Coral Court West)
export const ownLobby = (b, hs, hasPlace) => !!(b.art && b.art.shop && b.art.shop.kind === 'lobby' && (!hasPlace || (!!b.name && hs.every((h) => h.label === b.name || String(h.label).startsWith(b.name + ' ')))));
// what a shop front already holds along its foot: [[x0, x1], ...] in facade px from the building's west edge - the
// shop's doorway (a walk-in's, where the interiors cut it; else by the plan's side) and the ATMs set into the wall
export function frontHeld(m, b, atms) {
  const sh = b.art.shop, W = b.tw * TILE, X0 = b.tx * TILE, foot = (b.ty + b.th) * TILE, out = [], F = FLATDOOR;
  const units = b.walkIn && b.walkIn.south !== false ? b.walkIn.units.filter((u) => u.door) : [];
  for (const u of units) out.push([(u.door.tx - b.tx) * TILE + F.walkDoor[0], (u.door.tx - b.tx + (u.door.w || 2)) * TILE - F.walkDoor[0]]);
  if (!units.length) {
    const dw = sh.doorW || (sh.kind === 'arcade' ? 30 : 22);
    const dx = typeof sh.door === 'number' ? sh.door : sh.door === 'right' ? W - dw - F.shopDoor[0] : F.shopDoor[0];
    out.push([dx, dx + dw]);
  }
  for (const p of atms) if (Math.abs(p.y - foot) < TILE && p.x > X0 - F.atm && p.x < X0 + W + F.atm) out.push([p.x - X0 - F.atm, p.x - X0 + F.atm]);
  return out;
}

export function flatDoors3(m) {
  const F = FLATDOOR, homesOf = new Map(), placeOf = new Set();
  for (const p of m.pois) {
    if (!p || p.b === undefined || p.b === null) continue;
    if (p.kind === 'home') { let l = homesOf.get(p.b); if (!l) homesOf.set(p.b, (l = [])); l.push(p); } else placeOf.add(p.b);
  }
  const atms = (m.props || []).filter((p) => p && p.t === 'atmw' && p.inside === undefined);
  const out = { fronts: 0, made: 0, moved: 0, none: 0, lobbies: 0 };
  for (const b of m.buildings) {
    const sh = b && !b.gone && b.tw !== undefined && b.art && b.art.shop;
    if (!sh) continue;
    delete sh.flat;
    const hs = frontHomes(b, homesOf.get(b.id));
    if (!hs.length) continue;
    out.fronts++;
    if (ownLobby(b, hs, placeOf.has(b.id))) { out.lobbies++; continue; }
    const W = b.tw * TILE, X0 = b.tx * TILE, held = frontHeld(m, b, atms), want = hs[0].x - X0 - F.w / 2;
    const fits = (fx) => fx >= F.edge && fx + F.w + F.edge <= W && held.every(([a, z]) => fx + F.w + F.pier + F.clear <= a || z + F.clear <= fx - F.pier);
    const ends = [F.edge, W - F.edge - F.w].sort((a, q) => Math.abs(a - want) - Math.abs(q - want));
    const fx = ends.find(fits);
    if (fx === undefined) { out.none++; continue; }
    sh.flat = { x: fx };
    if (fx !== ends[0]) out.moved++;
    for (const h of hs) {
      h.x = X0 + fx + F.w / 2;
      const home = h.home !== undefined && m.homes ? m.homes[h.home] : null;
      if (home) home.x = h.x;
    }
    out.made++;
  }
  return out;
}
