// The cinematic mode's follow scenes (the owner, 2026-10-24: "automatic scenes that has the camera follow NPCs like in cop
// chases or street races or fishing or surfing ... anything that can be automated with NPCs"): the kinds of thing the
// camera can follow someone doing. The server (server/systems/cinefollow.js) finds who's doing each - or, in dev mode,
// starts one where that's cheap - and tells the page whom to follow; the page (client/director.js) lists them and
// frames the shot. z: how wide the shot starts (the camera's zoom, as the panel's: below 1 further out).
// Not here, because nobody does them on their own yet: golf, tennis (the club pro only plays you), soccer and volleyball
// (players' matches), the jetski / raceway races (players' races).
export const CINE_KINDS = [
  { id: 'chase', g: 'Action', n: 'Police chase', z: 0.8 },
  { id: 'race', g: 'Action', n: 'Street race', z: 0.75 },
  { id: 'armored', g: 'Action', n: 'Armored truck run', z: 0.85 },
  { id: 'shootout', g: 'Action', n: 'Gang shootout', z: 0.95 },
  { id: 'fight', g: 'Action', n: 'Street fight', z: 1.2 },
  { id: 'mugging', g: 'Action', n: 'Purse snatcher', z: 1.1 },
  { id: 'bikers', g: 'Action', n: 'Biker club ride', z: 0.85 },
  { id: 'patrol', g: 'Action', n: 'Police on patrol', z: 0.9 },
  { id: 'policeair', g: 'Action', n: 'Police helicopter', z: 0.7 },
  { id: 'ambulance', g: 'Action', n: 'Ambulance call', z: 0.9 },
  { id: 'traffic', g: 'Vehicles', n: 'Traffic', z: 0.9 },
  { id: 'bus', g: 'Vehicles', n: 'City bus', z: 0.9 },
  { id: 'taxi', g: 'Vehicles', n: 'Taxi', z: 0.9 },
  { id: 'train', g: 'Vehicles', n: 'Main-line train', z: 0.7 },
  { id: 'ferry', g: 'Vehicles', n: 'Ferry', z: 0.75 },
  { id: 'boat', g: 'Vehicles', n: 'Boats', z: 0.85 },
  { id: 'plane', g: 'Vehicles', n: 'Plane taking off or landing', z: 0.65 },
  { id: 'newsheli', g: 'Vehicles', n: 'News helicopter', z: 0.7 },
  { id: 'combine', g: 'Country', n: 'Combine harvesting', z: 0.85 },
  { id: 'horse', g: 'Country', n: 'Horse rider', z: 1 },
  { id: 'wildlife', g: 'Country', n: 'Wildlife', z: 1.1 },
  { id: 'shark', g: 'Country', n: 'Shark', z: 0.9 },
  { id: 'hunter', g: 'Country', n: 'Hunter', z: 1.1 },
  { id: 'wilds', g: 'Country', n: 'Hikers, rangers, climbers', z: 1.2 },
  { id: 'fishing', g: 'Fun', n: 'Anglers', z: 1.2 },
  { id: 'surf', g: 'Fun', n: 'Surfer', z: 1.1 },
  { id: 'skate', g: 'Fun', n: 'Skaters', z: 1.2 },
  { id: 'hoops', g: 'Fun', n: 'Pickup basketball', z: 1.1 },
  { id: 'pool', g: 'Fun', n: 'Pool', z: 1.45 },
  { id: 'dance', g: 'Fun', n: 'Dancers', z: 1.3 },
  { id: 'chess', g: 'People', n: 'Chess in the park', z: 1.45 },
  { id: 'picnic', g: 'People', n: 'Picnic', z: 1.45 },
  { id: 'painter', g: 'People', n: 'Painter at an easel', z: 1.45 },
  { id: 'diners', g: 'People', n: 'Diners', z: 1.35 },
  { id: 'street', g: 'People', n: 'Street corner life', z: 1.3 },
  { id: 'characters', g: 'People', n: 'Street characters', z: 1.3 },
];
export const CINE_KIND = Object.fromEntries(CINE_KINDS.map((k) => [k.id, k]));
// the tour: a kind after another, mixed (the action between the quiet ones)
export const CINE_TOUR = ['race', 'fishing', 'train', 'chase', 'surf', 'combine', 'plane', 'skate', 'shootout', 'horse', 'boat', 'characters', 'armored', 'wildlife', 'hoops', 'bikers', 'ferry', 'dance', 'fight', 'chess', 'bus', 'wilds', 'policeair', 'picnic', 'mugging', 'hunter', 'newsheli', 'diners', 'patrol', 'painter', 'traffic', 'pool', 'ambulance', 'street', 'taxi', 'shark'];
// how long the tour stays with a kind (s) before it moves on, even if its scene is still going; and a subject at most
export const CINE_TOUR_S = 45, CINE_SUBJECT_S = 120;
