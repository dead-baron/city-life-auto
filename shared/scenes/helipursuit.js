// Helicopter pursuit: a getaway car runs a police roadblock, the cruisers swing round after it (police.js's pursuit), the
// police air unit picks it up from above (policeair.js), the driver loses it at speed and runs for it into an alley - the
// officers after him on foot.
export default {
  id: 'helipursuit', n: 'Helicopter pursuit', g: 'Action', len: 20, linger: 4,
  place: { k: 'road', len: 2600, near: 'Downtown', far: 1600 },
  anchors: ['start', 'end', 'mid', 'far'],
  time: 1320, weather: 'clear',
  cast: [
    { id: 'getaway', veh: 'sports', at: { a: 'start', s: 6 }, paint: 3 },
    { id: 'vince', arch: 'hustler', name: 'VinnyVroom', look: 'player', in: 'getaway', hp: 320, plot: true },
    { id: 'rb1', veh: 'police', at: { a: 'start', f: 1150, s: -72 }, ra: 1.5708, crew: 'cop', siren: true, parked: true },
    { id: 'rb2', veh: 'police', at: { a: 'start', f: 1175, s: 76 }, ra: -1.5708, crew: 'cop', siren: true, parked: true },
    { id: 'cops', group: 2, arch: 'cop', role: 'cop', at: { a: 'start', f: 1090, s: -150 }, spread: 30, weapon: 'pistol', ra: 3.1416 },
  ],
  beats: [
    { at: 0.6, who: 'cops.0', do: 'say', text: 'Stop the vehicle!' },
    { id: 'ram', who: 'getaway', do: 'drive', to: { a: 'start', f: 1420, s: 6 }, direct: true, speed: 1, max: 9 },
    { at: 1.2, who: 'cops', do: 'shoot', target: 'getaway', n: 4, max: 3 },
    { id: 'chase', do: 'police', target: 'getaway', units: ['rb1', 'rb2'], after: 'ram' },
    { id: 'flee', who: 'getaway', do: 'drive', to: { a: 'end', f: 300, s: 20 }, straight: true, pass: true, speed: 0.85, max: 8 },
    { id: 'heli', at: 1.5, do: 'heli', target: 'getaway' },
    { id: 'crashed', who: 'getaway', do: 'crash', after: 'ram', wait: 2.4 },
    { who: 'vince', do: 'exit', after: 'crashed', wait: 1.1 },
    { who: 'vince', do: 'say', text: 'Not today!' },
    { id: 'alley', who: 'vince', do: 'run', to: { alley: 'vince' }, max: 7 },
  ],
  cam: [
    { at: 0, hold: { a: 'start', f: 900 }, z: 0.94 },
    { at: 2.6, follow: 'getaway', z: 1.02, lead: 0.55, ease: 1.4 },
    { on: 'flee', d: 0.6, follow: 'getaway', z: 0.74, lead: 0.6, ease: 1.6 },
    { on: 'crashed', follow: 'getaway', z: 1.14, lead: 0.15, ease: 0.7 },
    { on: 'alley', follow: 'vince', z: 1.32, lead: 0.45, ease: 1.0 },
  ],
};
