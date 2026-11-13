// Autoplay: a gang shootout (the panel's "Gang shootout in The Yards", on its own): a squad pulls up on a gang outside
// its hideout and it all goes off - the gang's and the police's own fighting once it starts (npc.js startFight); the
// camera across the street between them.
export default {
  id: 'autoshootout', n: 'Gang shootout (autoplay)', g: 'Autoplay', len: 20, linger: 2,
  place: { k: 'hideout', len: 900 },
  anchors: ['start', 'end', 'mid', 'hideout'],
  time: 1290, weather: 'clear',
  cast: [
    { id: 'cruiser1', veh: 'police', at: { a: 'mid', f: -60, s: -20 }, ra: 0.5, siren: true, parked: true },
    { id: 'cruiser2', veh: 'police', at: { a: 'mid', f: -170, s: 30 }, ra: -0.4, siren: true, parked: true },
    { id: 'cops', group: 4, arch: 'cop', role: 'cop', at: { a: 'mid', f: -110, s: 0 }, spread: 70, weapon: 'pistol', ra: 0 },
    { id: 'gang', group: 5, arch: 'syndicate', role: 'gang', at: { a: 'mid', f: 260, s: 10 }, spread: 80, weapon: 'pistol', ra: 3.1416 },
    { id: 'boss', arch: 'syndicate', role: 'gang', name: 'Big_Sal', look: 'player', at: { a: 'mid', f: 330, s: -20 }, weapon: 'rifle', ra: 3.1416, hp: 260 },
  ],
  beats: [
    { at: 0.5, who: 'cops.0', do: 'say', text: 'Police! Hands where we can see them!' },
    { at: 1.6, who: 'boss', do: 'say', text: 'Not today, officer.' },
    { id: 'fire', at: 2.8, who: 'gang', do: 'attack', target: 'cops', max: 14 },
    { at: 2.9, who: 'cops', do: 'attack', target: 'gang', max: 14 },
    { at: 3.2, who: 'boss', do: 'shoot', target: 'cruiser1', n: 8, max: 4 },
    { at: 4, do: 'wait', s: 14 },   // (the fight goes on: the scene runs its length)
  ],
  cam: [
    { at: 0, hold: { a: 'mid', f: 90, s: -60 }, z: 1.05 },
    { at: 2.4, move: [{ a: 'mid', f: 60, s: -80 }, { a: 'mid', f: 150, s: 60 }], dur: 9, z: [1.0, 0.85], ease: 1 },
    { at: 11.5, between: ['boss', 'cruiser1'], z: 0.85, ease: 2 },
  ],
};
