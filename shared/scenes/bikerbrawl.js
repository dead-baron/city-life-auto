// Biker brawl at the Rusty Spur - all of it out front, in view (the owner, 11-14: "when the NPC goes into the building you
// cant see whats going on"): a stranger walks up the lot to the club members hanging round their bikes, mouths off at
// one, knocks him down, jumps on a club bike - and the clubs pile out of the bar onto theirs after him (bikers.js: the
// chase), down the road to town.
export default {
  id: 'bikerbrawl', n: 'Biker brawl at the Rusty Spur', g: 'action', note: 'the fight in the lot, the clubs after him · dusk', len: 28, linger: 1,
  place: { k: 'roadhouse' },
  anchors: ['door', 'doorIn', 'bar', 'lot', 'road', 'approach', 'porch', 'town', 'table'],
  time: 1215, weather: 'clear',
  cast: [
    { id: 'jax', arch: 'hustler', name: 'JaxRider77', look: 'player', at: { a: 'lot', dy: 230 }, a: -1.5708, hp: 420, weapon: 'fists', plot: true },
    { id: 'mark', arch: 'biker', at: { a: 'lot', dx: -40, dy: -10 }, a: 1.5708, hp: 160, weapon: 'fists', post: true },
    { id: 'pals', group: 2, arch: 'biker', at: { a: 'lot', dx: -120, dy: -30 }, spread: 34, post: true },
    { id: 'bike', pick: 'clubbike', near: 'lot' },
  ],
  beats: [
    { id: 'up', who: 'jax', do: 'walk', to: { who: 'mark', dy: 34 }, max: 9 },
    { who: 'jax', do: 'face', to: { who: 'mark' } },
    { who: 'jax', do: 'say', text: 'Whose junk is that parked out front?' },
    { who: 'mark', do: 'emote', emote: 'angry', wait: 0.4 },
    { who: 'pals', do: 'emote', emote: 'point' },
    { who: 'jax', do: 'emote', emote: 'laugh', wait: 0.6 },
    { id: 'hit', who: 'jax', do: 'attack', target: 'mark', hits: 2, max: 2.4, wait: 0.3 },
    { id: 'down', who: 'jax', do: 'knock', target: 'mark', n: 35 },
    { who: 'pals', do: 'emote', emote: 'wow', wait: 0.2 },
    { id: 'out', who: 'jax', do: 'run', to: { who: 'bike', s: 22 }, max: 5, after: 'down', wait: 0.2 },
    { id: 'get', who: 'jax', do: 'enter', veh: 'bike', max: 6 },
    { who: 'jax', do: 'club', target: 'jax', clubs: 3 },
    { id: 'ride', who: 'jax', do: 'drive', to: 'town', speed: 0.8, max: 40, wait: 0.6 },
  ],
  cam: [
    { at: 0, follow: 'jax', z: 1.32, lead: 0.4, dy: -40 },
    { on: 'up', d: 1.5, between: ['jax', 'mark'], z: 1.7, ease: 1.6 },
    { on: 'out', follow: 'jax', z: 1.4, lead: 0.35, ease: 0.6 },
    { on: 'get', d: 0.8, hold: { a: 'door', dy: 150 }, z: 1.0, ease: 1.2 },   // (the clubs out of the door and onto their bikes)
    { on: 'ride', d: 2.6, follow: 'jax', z: 0.9, lead: 0.75, s: 50, ease: 1.8 },
  ],
};
