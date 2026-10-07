// Small things to do at the designed places (shared/naturesites.js): for now, ring the old mission's bells - stand
// at its great doorway and haul on the rope, and three slow strikes carry out over the desert for everyone near.
const BELL_REACH = 48, BELL_RING_S = 6;

function mission(map) {
  if (map._mission === undefined) Object.defineProperty(map, '_mission', { value: (map.natureSites || []).find((q) => q.kind === 'mission') || null, enumerable: false, configurable: true });
  return map._mission;
}

export function interaction(world, p) {
  const ped = p.ped;
  if (!ped || ped.vehId) return null;
  const ms = mission(world.map);
  if (ms && Math.hypot(ped.x - ms.door.x, ped.y - ms.door.y) < BELL_REACH) return { label: 'Ring the mission bells', run: () => ringBells(world, p) };
  return null;
}

export function ringBells(world, p) {
  const ms = mission(world.map);
  if (!ms) return false;
  if ((world.bellsUntil || 0) > world.time) { world.notify(p, 'The bells are still ringing.', 'info'); return false; }
  world.bellsUntil = world.time + BELL_RING_S;
  world.emit(ms.door.x, ms.door.y - 140, { e: 'bells', x: ms.door.x, y: ms.door.y - 140, n: 3 });
  world.notify(p, 'You haul on the old rope. The bells ring out over the desert.', 'good');
  return true;
}
