// Small things to do at the designed places (shared/naturesites.js):
//   - ring the old mission's bells: stand at its great doorway and haul on the rope, and three slow strikes carry
//     out over the desert for everyone near;
//   - the coin telescope at the end of Westport Pier: a dollar, and your view swings out over the bay to the seals
//     on their islets for a few seconds (the camera only: you stay where you are).
import { payFrom } from './economy.js';
const BELL_REACH = 48, BELL_RING_S = 6, SCOPE_REACH = 40, SCOPE_S = 7, SCOPE_PRICE = 1;

function mission(map) {
  if (map._mission === undefined) Object.defineProperty(map, '_mission', { value: (map.natureSites || []).find((q) => q.kind === 'mission') || null, enumerable: false, configurable: true });
  return map._mission;
}

function pier(map) {
  if (map._pier === undefined) Object.defineProperty(map, '_pier', { value: (map.natureSites || []).find((q) => q.kind === 'pier' && q.scope) || null, enumerable: false, configurable: true });
  return map._pier;
}

export function interaction(world, p) {
  const ped = p.ped;
  if (!ped || ped.vehId) return null;
  const ms = mission(world.map);
  if (ms && Math.hypot(ped.x - ms.door.x, ped.y - ms.door.y) < BELL_REACH) return { label: 'Ring the mission bells', run: () => ringBells(world, p) };
  const pr = pier(world.map);
  if (pr && Math.hypot(ped.x - pr.scope.x, ped.y - pr.scope.y) < SCOPE_REACH) return { label: `Look through the telescope ($${SCOPE_PRICE})`, run: () => lookOut(world, p) };
  return null;
}

// the telescope: the camera swings out to what it looks at for SCOPE_S seconds (moving cuts it short)
export function lookOut(world, p) {
  const pr = pier(world.map);
  if (!pr) return false;
  if (!payFrom(p, SCOPE_PRICE)) { world.notify(p, 'The telescope takes a dollar.', 'warn'); return false; }
  if (p.conn) p.conn.sendJSON({ t: 'look', x: pr.scope.look.x, y: pr.scope.look.y, s: SCOPE_S });
  world.notify(p, 'Clunk. Out on the islets the seals are hauled out in the sun.', 'good');
  p.meDirty = true;
  return true;
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
