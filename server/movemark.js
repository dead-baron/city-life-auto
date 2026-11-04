// A move the server made (a seat, a door, a ride's end, a cell, a rescue - anything that sets a player's position rather
// than walking or driving them there): noted so the movement audit (server/anticheat.js) doesn't take it for a teleport.
export function moved(ped) {
  const p = ped && ped.player;
  if (p) p.movedSeq = (p.movedSeq || 0) + 1;
}
