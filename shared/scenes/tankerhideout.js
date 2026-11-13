// Tanker into the gang hideout: a driver floors a fuel tanker down the road at a gang's hideout, dives out at the last
// second, and the tanker ploughs into their parked cars and the gang standing round them - one blast, then the cars
// going up one after another.
export default {
  id: 'tankerhideout', n: 'Tanker into the gang hideout', g: 'Action', len: 22, linger: 4,
  place: { k: 'hideout', len: 1150 },
  anchors: ['start', 'end', 'mid', 'hideout'],
  time: 1290, weather: 'clear',
  cast: [
    { id: 'tanker', veh: 'tanker', at: { a: 'start', s: 18 } },
    { id: 'deke', arch: 'mugger', name: 'Deke_Burns', look: 'player', in: 'tanker', hp: 300, plot: true },
    { id: 'car1', veh: 'sedan', at: { a: 'end', f: 0, s: -30 }, ra: 1.5708, parked: true },
    { id: 'car2', veh: 'muscle', at: { a: 'end', f: 72, s: 34 }, ra: -1.4, parked: true },
    { id: 'van', veh: 'van', at: { a: 'end', f: 150, s: -10 }, ra: 1.75, parked: true },
    { id: 'gang', group: 6, arch: 'syndicate', role: 'gang', at: { a: 'end', f: 110, s: 10 }, spread: 85, weapon: 'pistol', post: true, ra: 3.1416 },
  ],
  beats: [
    { at: 0.3, who: 'gang.0', do: 'say', text: 'Who is that?' },
    { id: 'go', who: 'tanker', do: 'drive', to: { a: 'end', f: -320, s: 6 }, direct: true, speed: 1, max: 14 },
    { id: 'bail', who: 'deke', do: 'bail' },
    { who: 'gang', do: 'shoot', target: 'tanker', n: 3, max: 2, after: 'go' },
    { id: 'hit', do: 'wait', s: 3, until: { hit: 'tanker' }, after: 'bail' },
    { id: 'boom', do: 'explode', target: 'tanker' },
    { do: 'ignite', target: 'car1', s: 0.5 },
    { do: 'ignite', target: 'car2', s: 1.3 },
    { do: 'ignite', target: 'van', s: 2.4 },
    { who: 'deke', do: 'run', to: { a: 'end', f: -560, s: 150 }, max: 6, after: 'bail', wait: 1.6 },
    { who: 'deke', do: 'face', to: 'end' },
    { who: 'deke', do: 'emote', e: 'cheer', after: 'boom', wait: 1.8 },
    { who: 'deke', do: 'say', text: 'Special delivery.' },
  ],
  cam: [
    { at: 0, follow: 'tanker', z: 0.85, lead: 0.55, s: -30 },
    { on: 'bail', follow: 'deke', z: 1.0, lead: 0.2, ease: 0.6 },
    { on: 'bail', d: 0.9, hold: { a: 'end', f: -60 }, z: 0.72, ease: 0.9 },
    { on: 'boom', d: 3.5, between: ['deke', 'car2'], z: 0.8, ease: 2.5 },
  ],
};
