// Autoplay: a police chase (the cinematic panel's "Cops chasing a getaway car", played on its own): a getaway car flat
// out down a long road, a squad car coming in behind it from out of sight (police.js chaseCar - the police's own pursuit
// from then), the camera on the getaway car, never on you.
export default {
  id: 'autochase', n: 'Police chase (autoplay)', g: 'Autoplay', len: 22, linger: 2,
  place: { k: 'road', len: 2400, near: 'Midtown', far: 2400 },
  anchors: ['start', 'end', 'mid', 'far'],
  time: 1230, weather: 'clear',
  cast: [
    { id: 'car', veh: 'muscle', at: { a: 'start', s: 8 }, paint: 5 },
    { id: 'driver', arch: 'hustler', name: 'Rook_44', look: 'player', in: 'car', hp: 300, plot: true },
  ],
  beats: [
    { id: 'go', who: 'car', do: 'drive', to: { a: 'end', s: 8 }, straight: true, pass: true, speed: 0.82, max: 12 },
    { id: 'cops', at: 0.8, do: 'police', target: 'car' },
    { at: 2, who: 'driver', do: 'say', text: 'Lose them, lose them...' },
    { who: 'car', do: 'drive', to: 'far', speed: 0.85, max: 14, after: 'go' },
  ],
  cam: [
    { at: 0, follow: 'car', z: 1.14, lead: 0.2, s: 60 },
    { at: 3, follow: 'car', z: 0.96, lead: 0.65, ease: 2 },
    { on: 'go', d: 6, follow: 'car', z: 0.84, lead: -0.35, ease: 2.5 },
    { at: 15, follow: 'car', z: 1.02, lead: 0.6, ease: 2 },
  ],
};
