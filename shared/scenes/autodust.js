// Autoplay: crop dusting (the panel's "Crop dusting", on its own): the co-op's duster low over a field, pass after pass,
// the mist going down under the wing; the camera tracking alongside, then high and wide over the valley.
export default {
  id: 'autodust', n: 'Crop dusting (autoplay)', g: 'Autoplay', len: 22, linger: 0,
  place: { k: 'farm', near: 'Willow Valley' },
  anchors: ['p0', 'p1', 'p2', 'p3', 'in', 'field'],
  time: 560, weather: 'clear',
  cast: [
    { id: 'duster', veh: 'duster', at: 'in', air: 110 },
    { id: 'pilot', arch: 'farmer', name: 'SkyFarmer_Lu', look: 'player', in: 'duster' },
  ],
  beats: [
    { id: 'pass1', who: 'duster', do: 'fly', to: 'p1', route: ['p0', 'p1'], alt: 70, spray: true, speed: 0.75, max: 12 },
    { id: 'turn', who: 'duster', do: 'fly', to: 'p2', route: [{ a: 'p1', f: 500, s: 260 }, 'p2'], alt: 140, speed: 0.8, max: 9 },
    { id: 'pass2', who: 'duster', do: 'fly', to: 'p3', route: ['p2', 'p3'], alt: 70, spray: true, speed: 0.75, max: 12 },
  ],
  cam: [
    { at: 0, follow: 'duster', z: 0.85, lead: 0.5, s: -80 },
    { on: 'pass1', d: 2, follow: 'duster', z: 1.0, lead: 0.3, s: 120, ease: 2 },
    { on: 'turn', hold: 'field', z: 0.6, ease: 2.5 },
    { on: 'pass2', d: 1.5, follow: 'duster', z: 0.8, lead: 0.6, ease: 2 },
  ],
};
