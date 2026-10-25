// Nobody walled in (the owner's notes 2, 10-24: "Need to make sure players can't just park a car outside the entrance of
// a building (like a hospital) and block people from getting out ... Maybe just a feature that lets you walk through
// vehicles or other placeable objects around the entry/exit points of things"). Every way in and out of somewhere -
// a shop's or a lobby's door (the map's places), a walk-in's doorway, a home's front and back doors and its garage, a
// station's and a subway kiosk's way out - is a doorway point here. Someone on foot within DOORWAY.r px of one isn't
// pushed out of a vehicle standing there (vehicles.js, the vehicle-vs-people step): they walk on through it, and keep
// walking through that same vehicle until they're clear of it (ped.passVeh), however far it reaches past the doorway.
// The vehicles are the only things anyone can put down in the world that a person on foot is pushed out of (crates and
// bags on the ground are walked over; the street furniture is the map's own, laid out clear of the doors), so that is
// all it takes. A vehicle moving at speed still hits them as ever. Players and the city's people alike; the page predicts no push from vehicles, so
// it agrees.
import { TILE } from '../../shared/constants.js';
import { DOORWAY } from '../../shared/rules-play.js';

const CELL = 256;
const SKIP = new Set(['atm', 'vending']);   // (a cash machine or a vending machine is no way in or out)

export function doorPoints(map) {
  const out = [];
  const add = (x, y) => { if (Number.isFinite(x) && Number.isFinite(y)) out.push(x, y); };
  for (const p of map.pois || []) if (!SKIP.has(p.kind)) { add(p.x, p.y); if (p.outside) add(p.outside.x, p.outside.y); }
  for (const h of map.homes || []) {
    add(h.x, h.y);
    if (h.back) add(h.back.x, h.back.y);
    if (h.garage) add(h.garage.x, h.garage.y);
    if (h.garageDoor) add(h.garageDoor.x, h.garageDoor.y);
  }
  for (const id of map.walkIns || []) {
    const b = map.buildings[id], wi = b && b.walkIn;
    if (wi) for (const u of wi.units) if (u.door) for (const dy of [0, wi.south ? 1 : -1]) add((u.door.tx + (u.door.w || 2) / 2) * TILE, (u.door.ty + dy + 0.5) * TILE);
  }
  for (const g of map.garages || []) add((g.tx + g.tw / 2) * TILE, (g.south ? g.ty + g.th : g.ty) * TILE);
  for (const r of map.rails || (map.rail ? [map.rail] : [])) for (const s of r.stations || []) {
    if (s.kiosk && s.kiosk.out) add(s.kiosk.out.x, s.kiosk.out.y);
    if (s.exit) add(s.exit.x, s.exit.y);
  }
  return out;
}

// the doorway points in a grid (made once per map)
function grid(map) {
  if (map._doorGrid) return map._doorGrid;
  const g = new Map(), pts = doorPoints(map);
  for (let k = 0; k < pts.length; k += 2) {
    const key = Math.floor(pts[k + 1] / CELL) * 65536 + Math.floor(pts[k] / CELL);
    let l = g.get(key); if (!l) g.set(key, (l = [])); l.push(pts[k], pts[k + 1]);
  }
  Object.defineProperty(map, '_doorGrid', { value: g, enumerable: false, configurable: true });
  return g;
}

// whether (x, y) is within r px of a way in or out
export function nearDoor(map, x, y, r = DOORWAY.r) {
  const g = grid(map), cx = Math.floor(x / CELL), cy = Math.floor(y / CELL), r2 = r * r;
  for (let j = cy - 1; j <= cy + 1; j++) for (let i = cx - 1; i <= cx + 1; i++) {
    const l = g.get(j * 65536 + i);
    if (l) for (let k = 0; k < l.length; k += 2) { const dx = l[k] - x, dy = l[k + 1] - y; if (dx * dx + dy * dy < r2) return true; }
  }
  return false;
}

// the vehicle-vs-people step, someone on foot overlapping vehicle v: true when they walk through it (by a doorway, or
// already on their way through it) instead of being pushed out
export function passes(world, ped, v) {
  const now = world.time;
  if ((ped.passVeh === v.id && now < (ped.passUntil || 0)) || nearDoor(world.map, ped.x, ped.y)) { ped.passVeh = v.id; ped.passUntil = now + DOORWAY.keepS; return true; }
  return false;
}
