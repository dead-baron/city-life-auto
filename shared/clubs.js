// The three biker clubs of the Rusty Spur (concept sheet NP4, task #366): original clubs with their own names, colours
// and back patches. The server spawns and drives them (server/systems/bikers.js); the client draws the vests and patches
// (client/art2/people.js, the club patch block) from these colours.
//   vest: the cut's colour; shirt: worn under it; patch: [rocker / field colour, emblem colour]; emblem: what the
//   centre patch shows ('crow' | 'wheel' | 'jackal'); bikes: what they ride; paint: their bikes' paint (vehicles.js
//   PAINTS index)
export const CLUBS = [
  { id: 'ashcrows', name: 'Ashcrow MC', short: 'Ashcrows', colours: 'red and black', vest: '#1c1a1e', shirt: '#7a1d24', patch: ['#c8262b', '#18161a'], emblem: 'crow', bikes: ['chopper', 'bobber', 'vtwin', 'chopper', 'ratbike'], paint: [3, 0, 3, 13, 3] },
  { id: 'drifters', name: 'Dust Drifters MC', short: 'Drifters', colours: 'denim', vest: '#3e5a86', shirt: '#e6e2d8', patch: ['#e8e0c8', '#2a4a7a'], emblem: 'wheel', bikes: ['bagger', 'tourer', 'vtwin', 'bagger', 'trike'], paint: [12, 1, 12, 1, 12] },
  { id: 'jackals', name: 'Velvet Jackals MC', short: 'Jackals', colours: 'purple', vest: '#2a2030', shirt: '#4a2a6a', patch: ['#7a3ac8', '#e8c040'], emblem: 'jackal', bikes: ['vtwin', 'bobber', 'chopper', 'vtwin', 'bagger'], paint: [7, 7, 3, 7, 7] },
];
export const CLUB_BY_ID = Object.fromEntries(CLUBS.map((c, i) => [c.id, { ...c, i }]));
