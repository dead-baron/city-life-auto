// Autoplay: a street race at night (the panel's "Street race on the Neon Strip at night", on its own): four cars lined up
// two by two on a long straight, off together flat out; the camera low at the line, then racing alongside the leaders.
export default {
  id: 'autorace', n: 'Street race (autoplay)', g: 'Autoplay', len: 14, linger: 3,
  place: { k: 'road', len: 3000, near: 'Neon Strip', far: 2000 },
  anchors: ['start', 'end', 'mid', 'far'],
  time: 1380, weather: 'clear',
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
  ],
  beats: [
    { at: 0.4, who: 'crowd.0', do: 'say', text: 'Three... two... one...' },
    { at: 0.8, who: 'crowd', do: 'emote', emote: 'cheer' },
    { id: 'go', at: 2.2, who: 'r1', do: 'drive', to: { a: 'end', f: 400, s: 10 }, straight: true, pass: true, speed: 0.68, max: 14 },
    { at: 2.2, who: 'r2', do: 'drive', to: { a: 'end', f: 400, s: 46 }, straight: true, pass: true, speed: 0.67, max: 14 },
    { at: 2.3, who: 'r3', do: 'drive', to: { a: 'end', f: 400, s: 10 }, straight: true, pass: true, speed: 0.69, max: 14 },
    { at: 2.3, who: 'r4', do: 'drive', to: { a: 'end', f: 400, s: 46 }, straight: true, pass: true, speed: 0.66, max: 14 },
  ],
  cam: [
    { at: 0, hold: { a: 'start', f: 300, s: 30 }, z: 1.1 },
    { at: 1.8, between: ['r1', 'r4'], z: 1.0, ease: 1.2 },
    { on: 'go', d: 1.2, follow: 'r1', z: 0.8, lead: 0.5, s: 70, ease: 1.5 },
    { on: 'go', d: 5, follow: 'r3', z: 0.75, lead: 0.9, ease: 2 },
  ],
};
