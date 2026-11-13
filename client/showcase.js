// The Showcase (the owner, 2026-11-12: "add locations that have a great hand crafted touch to the cinematic lists so it's
// easy to find them"): World v3's hand-crafted places for the cinematics - the districts laid out by hand, the nature
// program's showcase scenes, the coasts' and islands' set pieces (docs/DEVLOG.md, the "handcrafted" and "by hand" entries).
// The cinematic mode (client/director.js) lists them in its panel - a press flies the drone camera there, at the place's
// zoom and time of day - and its Tour can run them only. Loaded with the director.
// Each: g its group, n its name on the list, q the names to look it up by in the teleport list (client/devtp.js
// teleportPlaces: the plans' places and sights, the landmarks, the districts - the first found), dx / dy where the camera
// stands from it (tiles), z the zoom (director.js ZOOMS), t the time of day (minutes after midnight), note what to look at.
import { TILE } from '../shared/constants.js';

export const SHOWCASE = [
  // ---- the coasts and the islands ----
  { g: 'Coasts and islands', n: 'Egret Point Light', q: ['Egret Point Light', 'Egret Point'], z: 0.85, t: 1125, note: 'the light on its point at golden hour' },   // (World v3 has no Lighthouse Rock: its tidepools had been laid by the Harbor Light, among the marina's boats)
  { g: 'Coasts and islands', n: 'Gull Point Light', q: ['Gull Point Light', 'Gull Harbor'], z: 0.85, t: 390, note: 'dawn on the ferry island' },
  { g: 'Coasts and islands', n: 'Gull Harbor quay', q: ['Quay Street', 'Gull Harbor'], z: 1, t: 540, note: 'the harbour village, the fleet in' },
  { g: 'Coasts and islands', n: 'Sunset Beach Pier', q: ['Sunset Beach Pier', 'Sunset Beach'], z: 0.85, t: 1205, note: 'the boardwalk and the Ferris wheel at dusk' },
  { g: 'Coasts and islands', n: 'Coral Cay lagoon', q: ['Tiki Point', 'Coral Cay'], z: 0.85, t: 930, note: 'the dive village and the reef' },
  { g: 'Coasts and islands', n: 'Macaw Cove', q: ['Macaw Cove'], z: 1, t: 540, note: 'the jungle falls into the cove' },
  { g: 'Coasts and islands', n: 'Pelican Point', q: ['Pelican Point', 'Pelican Key'], z: 0.85, t: 1125 },
  { g: 'Coasts and islands', n: 'North Point harbour', q: ['North Point'], z: 0.85, t: 540 },
  { g: 'Coasts and islands', n: 'The Bluffs', q: ['The Bluffs', 'The Bluffs Tennis Club'], z: 0.85, t: 1125, note: 'the villas on the headland' },
  { g: 'Coasts and islands', n: 'North Cape tidepools', q: ['North Cape Light', 'North Cape'], z: 1, t: 390 },
  { g: 'Coasts and islands', n: 'Redwood Cove', q: ['Redwood Cove'], z: 0.85, t: 450, note: 'try the fog' },
  { g: 'Coasts and islands', n: 'Northshore', q: ['Northshore'], z: 0.85, t: 930, note: 'the station town on the inlet' },
  // ---- the wild ----
  { g: 'The wild', n: 'Lakeside Greens', q: ['Lakeside Greens'], z: 0.85, t: 930, note: 'the golf course on the lake' },
  { g: 'The wild', n: 'Kestrel Beach', q: ['Kestrel Beach', 'Kestrel Lake'], z: 0.85, t: 1125 },
  { g: 'The wild', n: 'Granite Hot Springs', q: ['Granite Hot Springs'], z: 1, t: 1205, note: 'steam at dusk' },
  { g: 'The wild', n: 'Summit Tarn', q: ['Summit Tarn'], z: 0.85, t: 390 },
  { g: 'The wild', n: 'Eagle Crag', q: ['Eagle Crag'], z: 0.85, t: 540 },
  { g: 'The wild', n: 'Silver Thread Falls', q: ['Silver Thread Falls', 'Silver Thread Lake'], z: 1, t: 540 },
  { g: 'The wild', n: 'Redwood Creek Falls', q: ['Redwood Creek Falls'], z: 1, t: 450, note: 'the giants in the morning light' },
  { g: 'The wild', n: 'Hidden Pool', q: ['Hidden Pool'], z: 1.2, t: 720 },
  { g: 'The wild', n: 'Red Rock Canyon', q: ['Red Rock Canyon'], z: 0.85, t: 1125 },
  { g: 'The wild', n: 'Mirage Lake', q: ['Mirage Lake'], z: 0.85, t: 1205 },
  { g: 'The wild', n: 'Redwood Caverns', q: ['Redwood Caverns'], z: 1.2, t: 720, note: 'the cave mouth by the falls' },
  { g: 'The wild', n: 'Canyon Oasis', q: ['Canyon Oasis'], z: 1, t: 1125 },
  { g: 'The wild', n: 'Dry Creek Balloon Field', q: ['Dry Creek Balloon Field', 'Dry Creek'], z: 0.85, t: 450 },
  // ---- the city and the towns ----
  { g: 'The city and the towns', n: 'Greenfield Park', q: ['Greenfield Park'], z: 0.85, t: 540, note: 'the park on Downtown\'s axis' },
  { g: 'The city and the towns', n: 'Piazza Vecchia', q: ['Piazza Vecchia', 'Old Town'], z: 1, t: 1125, note: 'Old Town\'s square' },
  { g: 'The city and the towns', n: 'The Neon Strip', q: ['Lantern Lane Night Market', 'Neon Strip'], z: 0.85, t: 1380, note: 'the night market and the neon' },
  { g: 'The city and the towns', n: 'Lucky Mesa Strip', q: ['The Golden Lotus', 'Lucky Mesa'], z: 0.7, t: 1380, note: 'the casinos lit' },
  { g: 'The city and the towns', n: 'The Pink Mile', q: ['Siren Square', 'The Pink Mile'], z: 0.85, t: 1380, note: 'the motels round their pools' },
  { g: 'The city and the towns', n: 'Midtown and the El', q: ['The Trestle Spot', 'Union Square', 'Midtown'], z: 0.85, t: 1205, note: 'the El over Trestle Street' },
  { g: 'The city and the towns', n: 'The museum square', q: ['Museum Square', 'Arts District'], z: 0.85, t: 930, note: 'the Arts District' },
  { g: 'The city and the towns', n: 'Ocean Drive', q: ['The Bayside Ritz', 'Bayside Heights'], z: 0.85, t: 1125, note: 'Bayside Heights, the villas and the Ritz' },
  { g: 'The city and the towns', n: 'Lantern Lane', q: ['Lantern Lane', 'Old Quarter'], z: 1, t: 1380, note: 'the Old Quarter\'s lanterns' },
  { g: 'The city and the towns', n: 'The Harbor waterfront', q: ['Ferry Square', 'Harbor Marina'], z: 0.85, t: 1205, note: 'the ferry, the fish market, the marina' },
  { g: 'The city and the towns', n: 'Waves Stadium', q: ['Waves Stadium', 'Stadium District'], z: 0.7, t: 1205 },
  { g: 'The city and the towns', n: 'Westport Center Plaza', q: ['Westport Center Plaza', 'Westport Center'], z: 0.85, t: 1205 },
  { g: 'The city and the towns', n: 'Falls Green', q: ['Falls Green', 'Falls Center'], z: 0.85, t: 930, note: 'the town\'s main street' },
  { g: 'The city and the towns', n: 'Westport International', q: ['Westport International'], z: 0.7, t: 540, note: 'the airport' },
];

// where the camera stands for one (world px): the first of its names in the places (exactly, any case; then a place whose
// name starts with it), moved by its dx / dy - or null when this map has none of them
export function showcaseSpot(q, places) {
  const low = (s) => String(s || '').toLowerCase();
  let p = null;
  for (const n of q.q) { p = places.find((o) => low(o.name) === low(n)); if (p) break; }
  if (!p) for (const n of q.q) { p = places.find((o) => low(o.name).startsWith(low(n))); if (p) break; }
  return p ? { x: p.x + (q.dx || 0) * TILE, y: p.y + (q.dy || 0) * TILE } : null;
}
