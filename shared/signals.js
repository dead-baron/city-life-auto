// Traffic signals' timing (the user's notes, 2026-10-08: "add yellow lights on traffic lights before going red"). Each
// signalled junction (shared/roads.js buildNetwork: n.light, n.group per arriving road, n.phases, n.phase) runs a 24 s
// cycle (it divides the 1200 s chrono loop evenly: no jump where the loop wraps): green, then two and a half seconds of
// yellow, then red - and half a second of red all round before the cross street gets its green, so a car that went
// through on the yellow is clear of the box first. The main road (group 0: the way of the widest road through it) has
// the longer green, 10 s to the cross street's 8. A junction with roads from three directions gives each its turn
// (8 s: 5 green, 2.5 yellow, 0.5 all red). n.phase (0..23, from the junction's place) staggers the junctions' cycles.
// (Kept apart from shared/roads.js: the chunk bake doesn't read signals, so changing their timing leaves the baked art
// as it is. roads.js's own signalFor, the older timing with a short yellow that nothing used, is gone.)
export const SIGNAL_CYCLE = 24;          // s
const GREEN = [10, 8], YELLOW = 2.5, CLEAR = 0.5; // a two-way junction: the main road 10 s green, the cross street 8
const SLOT = 8, SLOT_G = 5, SLOT_Y = 2.5;         // a three-way one: each its 8 s turn

// The signal facing traffic that arrives at node n along edge edgeId at time tSec: 'G' | 'Y' | 'R'
export function signalFor(n, edgeId, tSec) {
  if (!n.light) return 'G';
  const g = n.group[edgeId] ?? 0;
  const t = (((tSec + (n.phase || 0)) % SIGNAL_CYCLE) + SIGNAL_CYCLE) % SIGNAL_CYCLE;
  if (n.phases === 3) {
    const slot = Math.floor(t / SLOT), u = t - slot * SLOT;
    if (slot !== g) return 'R';
    return u < SLOT_G ? 'G' : u < SLOT_G + SLOT_Y ? 'Y' : 'R';
  }
  // (the main road from 0, the cross street once the main road's green, yellow and all-red are done)
  const g1 = g === 0 ? 0 : 1, u = g1 ? (t - (GREEN[0] + YELLOW + CLEAR) + SIGNAL_CYCLE) % SIGNAL_CYCLE : t;
  return u < GREEN[g1] ? 'G' : u < GREEN[g1] + YELLOW ? 'Y' : 'R';
}

