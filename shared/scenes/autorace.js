// Autoplay: a street race at night (the panel's "Street race on the Neon Strip"): four cars on a wide street, two by two,
// off together and racing - the owner, 11-14 20:21: "the cars just drive in a cluster then stop at stop lights, they don't
// act like they're racing - they should be swerving in and out of traffic and pedestrians should be jumping out of the
// way". So: the race beat (server/systems/racers.js) - through the lights, each at its own pace (the back row quicker:
// overtakes), weaving through the traffic put along the way (traffic: the city's own cars from then, braking and honking
// as they're shaved past), and at the first junction people crossing who dive clear. The camera low at the line, wide at
// the junction as the pack comes through it, then racing alongside.
export default {
  id: 'autorace', n: 'Street race on the Neon Strip', g: 'action', note: 'through the traffic and the lights · night', len: 22, linger: 2,
  place: { k: 'road', len: 700, near: 'Neon Strip', far: 3600, wide: 1, junction: 650, traffic: 1 },
  anchors: ['start', 'end', 'mid', 'far', 'cross'],
  time: 1350, weather: 'clear',
  cast: [
    { id: 'r1', veh: 'sports', at: { a: 'start', f: 120, s: 10 }, paint: 2 },
    { id: 'r2', veh: 'muscle', at: { a: 'start', f: 120, s: 46 }, paint: 7 },
    { id: 'r3', veh: 'sports', at: { a: 'start', f: 0, s: 10 }, paint: 9 },
    { id: 'r4', veh: 'muscle', at: { a: 'start', f: 0, s: 46 }, paint: 4 },
    { id: 'd1', arch: 'hustler', name: 'NeonNyx', look: 'player', in: 'r1' },
    { id: 'd2', arch: 'casual', name: 'Gearhead_J', look: 'player', in: 'r2' },
    { id: 'd3', arch: 'hustler', name: 'drift_queen', look: 'player', in: 'r3' },
    { id: 'd4', arch: 'casual', name: 'Bobby_V8', look: 'player', in: 'r4' },
    { id: 'crowd', group: 5, arch: 'casual', at: { a: 'start', f: 160, s: -90 }, spread: 60, post: true, ra: 1.5708 },
    // people crossing at the junction as the pack comes through (the city's own walkers: they dive out of the way)
    { id: 'walkers', group: 4, arch: 'casual', at: { a: 'cross', f: -60, s: 120 }, spread: 26 },
  ],
  beats: [
    { at: 0.4, who: 'crowd.0', do: 'say', text: 'Three... two... one...' },
    { at: 0.8, who: 'crowd', do: 'emote', emote: 'cheer' },
    { id: 'go', at: 2.2, who: 'r1', units: ['r2', 'r3', 'r4'], do: 'race', to: 'far', traffic: 9 },
    { at: 2.6, who: 'walkers', do: 'walk', to: { a: 'cross', f: -60, s: -150 } },
  ],
  cam: [
    { at: 0, hold: { a: 'start', f: 300, s: 30 }, z: 1.3 },
    { at: 1.8, between: ['r1', 'r4'], z: 1.15, ease: 1.2 },
    { on: 'go', d: 0.8, hold: { a: 'cross', f: -120 }, z: 0.82, ease: 1.6 },
    { on: 'go', d: 5, follow: 'r3', z: 0.88, lead: 0.25, s: 50, ease: 2 },   // (a short lead: at 700 px/s up a street the screen's short way, a long one runs the car off the frame)
    { on: 'go', d: 12, follow: 'r1', z: 0.84, lead: 0.3, ease: 2.5 },
  ],
};
