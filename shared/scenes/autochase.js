// Autoplay: a police chase (the cinematic panel's "Cops chasing a getaway car", played on its own): a getaway car flat
// out along the wide streets, a squad car coming in behind it from out of sight (police.js chaseCar - the police's own
// pursuit from then), the camera on the getaway car, never on you. The owner, 11-14 20:21: "The car chase scene just had a
// car driving in an alley but you couldn't see the alley because it was behind buildings, and the car ended up crashing
// into something" - so the getaway is a racer (server/systems/racers.js): wide streets only (never an alley, a tunnel or a
// deck while a wide way exists), round whatever's in its way, a new way when it's boxed in; the place a wide street
// (place.wide), in the afternoon.
export default {
  id: 'autochase', n: 'Police chase through Midtown', g: 'action', note: 'tracking the getaway · afternoon', len: 22, linger: 2,
  place: { k: 'road', len: 1400, near: 'Midtown', far: 3200, wide: 1, traffic: 1 },
  anchors: ['start', 'end', 'mid', 'far'],
  time: 900, weather: 'clear',
  cast: [
    { id: 'car', veh: 'muscle', at: { a: 'start', s: 8 }, paint: 5 },
    { id: 'driver', arch: 'hustler', name: 'Rook_44', look: 'player', in: 'car', hp: 300, plot: true },
  ],
  beats: [
    { id: 'go', at: 0.3, who: 'car', do: 'race', to: 'far', traffic: 6, skill: [0.98] },
    { id: 'cops', at: 0.8, do: 'police', target: 'car' },
    { at: 2, who: 'driver', do: 'say', text: 'Lose them, lose them...' },
  ],
  cam: [
    { at: 0, follow: 'car', z: 1.1, lead: 0.2, s: 60 },
    { at: 3, follow: 'car', z: 0.92, lead: 0.55, ease: 2 },
    { on: 'go', d: 7, follow: 'car', z: 0.84, lead: -0.3, ease: 2.5 },
    { at: 15, follow: 'car', z: 0.95, lead: 0.5, ease: 2 },
  ],
};
