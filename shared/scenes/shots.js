// The shot list (the owner, 2026-11-14: "I really want to highlight the best looking things. I want to have a diverse range
// of subjects to get footage of. I want good camera movement and the best areas to show off"): the camera panel's shots,
// in its sections (index.js SECTIONS). Each is a director's scene (the same script format: index.js) - its place, its
// time of day and weather (this screen's: client/director.js), a cast where it has a subject, and its own camera move,
// 10-30 s, then it ends. The action scenes are their own files (bikerbrawl.js, tankerhideout.js ...); these are the rest.
// The places are the QA sweep's best (DEVLOG 11-13 / 11-14: the Showcase spots that frame right - not Hidden Pool, Eagle
// Crag, North Point, Pelican Point or Waves Stadium).
// The camera moves (move(...)): over a place's anchor 'here' -
//   push   a slow push in toward it from r px out (from the way dir points), the zoom closing in
//   pan    a slow slide across it, side to side along dir (r either side)
//   orbit  round it at r px, from a0 to a1 (radians)
//   crane  in close on it, then a long pull back and up to the whole place
//   wide   a locked wide shot, the faintest drift
// Shared by the server and the page: no Math at load (shared/dmath.js's rule) - the directions are given as unit [x, y].
const SPAN = { push: 'slow push-in', pan: 'pan along', orbit: 'orbit', crane: 'crane up', wide: 'locked wide' };
const TOD = (m) => (m < 330 || m >= 1290 ? 'night' : m < 480 ? 'dawn' : m < 660 ? 'morning' : m < 1020 ? 'day' : m < 1170 ? 'golden hour' : 'dusk');
export function move(kind, { z = 0.9, s = 16, dir = [1, 0], r = 420, a0 = -0.6, a1 = 0.9, at = 'here' } = {}) {
  const [c, sn] = dir, P = (k) => ({ a: at, dx: c * r * k, dy: sn * r * k });
  if (kind === 'pan') return [{ at: 0, move: [P(-1), P(1)], dur: s, z }];
  if (kind === 'orbit') return [{ at: 0, orbit: at, r, a0, a1, dur: s, z }];
  if (kind === 'crane') return [{ at: 0, move: [at, { a: at, dy: -r * 0.25 }], dur: s, z: [z * 1.6, z * 0.72] }];
  if (kind === 'wide') return [{ at: 0, move: [P(-0.08), P(0.08)], dur: s, z }];
  return [{ at: 0, move: [P(-1), at], dur: s, z: [z * 0.82, z * 1.18] }];   // push
}
// a place shot: no cast, the camera's move over a named place (q: the names to look it up by, the first found)
const place = (id, g, n, q, kind, o = {}) => ({
  id, n, g, note: `${SPAN[kind]} · ${o.weather && o.weather !== 'clear' ? `${o.weather}, ` : ''}${o.tl ? 'time-lapse' : TOD(o.t ?? 1125)}`,
  len: (o.s || 16) + 1, linger: 0, place: { k: 'named', q, dx: o.dx, dy: o.dy }, anchors: ['here'], time: o.t ?? 1125, weather: o.weather || 'clear',
  ...(o.tl ? { tl: o.tl } : null), ...(o.bio ? { bio: 1 } : null),
  cast: o.cast || [], beats: o.beats || [{ do: 'wait', s: o.s || 16 }], cam: o.cam || move(kind, o),
});
// someone doing an emote again and again (every `step` s from t0, n times)
const again = (who, emote, t0, step, n) => Array.from({ length: n }, (_, i) => ({ at: t0 + i * step, who, do: 'emote', emote }));

export const SHOTS = [
  // ---- City & Neon at night ----
  place('shotnightmarket', 'city', 'The Neon Strip night market', ['Lantern Lane Night Market', 'Neon Strip'], 'push', { t: 1380, z: 0.95, dir: [0, 1], r: 520, s: 18 }),
  place('shotcasinos', 'city', 'Lucky Mesa\'s casinos lit up', ['The Golden Lotus', 'The Strip'], 'crane', { t: 1390, z: 0.85, r: 700, s: 18 }),
  place('shotpinkmile', 'city', 'The Pink Mile motels', ['Siren Square', 'The Pink Mile'], 'pan', { t: 1395, z: 0.9, r: 600, s: 18 }),
  place('shottrestle', 'city', 'The El over Trestle Street', ['The Trestle Spot', 'Union Square', 'Midtown'], 'pan', { t: 1215, z: 0.9, dir: [0, 1], r: 560, s: 18 }),
  place('shotlanterns', 'city', 'Lantern Lane\'s lanterns', ['Lantern Lane', 'Old Quarter'], 'orbit', { t: 1380, z: 1.05, r: 300, s: 18, a0: -0.4, a1: 1.1 }),
  place('shotoceandrive', 'city', 'Ocean Drive after dark', ['The Bayside Ritz', 'Bayside Heights'], 'pan', { t: 1350, z: 0.9, r: 560, s: 18 }),
  // ---- Nature & Countryside ----
  place('showfalls', 'nature', 'Redwood Creek Falls', ['Redwood Creek Falls'], 'push', { t: 450, z: 1.14, r: 600, s: 18, dir: [0, 1] }),
  place('shotsilverfalls', 'nature', 'Silver Thread Falls', ['Silver Thread Falls', 'Silver Thread Lake'], 'crane', { t: 540, z: 1.0, r: 600, s: 18 }),
  place('shottarn', 'nature', 'Summit Tarn and its falls at dawn', ['Summit Tarn Falls', 'Summit Tarn'], 'orbit', { t: 400, z: 0.9, r: 380, s: 18 }),
  place('shotoasis', 'nature', 'Canyon Oasis at golden hour', ['Canyon Oasis'], 'pan', { t: 1125, z: 0.95, r: 520, s: 18 }),
  place('shotlupines', 'nature', 'Wildflowers in Lupine Meadow', ['Lupine Meadow'], 'pan', { t: 1110, z: 1.1, r: 420, s: 16 }),
  place('shotjunglefalls', 'nature', 'Coral Cay\'s jungle falls', ['Coral Cay Falls'], 'push', { t: 600, z: 1.1, r: 480, s: 16, dir: [0, 1] }),
  place('shotgreens', 'nature', 'Lakeside Greens', ['Lakeside Greens'], 'pan', { t: 930, z: 0.85, r: 600, s: 16, dir: [0, 1] }),
  {   // a pickup straight across a ripe wheat field: the crop laid flat behind it (render/fx.js tracks), the camera alongside
    id: 'shotwheat', n: 'Wheat field: a pickup cuts a swath', g: 'nature', note: 'tracking alongside · golden hour', len: 18, linger: 1,
    place: { k: 'farm', near: 'Willow Valley' }, anchors: ['p0', 'p1', 'p2', 'p3', 'in', 'field'], time: 1120, weather: 'clear',
    cast: [{ id: 'truck', veh: 'pickup', at: { a: 'p0', f: 120 }, paint: 4, offroad: true }, { id: 'farmer', arch: 'construction', in: 'truck' }],
    beats: [{ id: 'go', at: 1.2, who: 'truck', do: 'drive', to: { a: 'p1', f: -140 }, direct: true, speed: 0.42, max: 14 }],
    cam: [{ at: 0, follow: 'truck', z: 1.2, lead: 0.2, s: -110 }, { at: 2.5, follow: 'truck', z: 1.05, lead: 0.5, s: -150, ease: 2 }, { on: 'go', d: 9, hold: 'p0', z: 0.85, ease: 3, dx: 0 }],
  },
  {   // a rider at a canter along the field's edge, the valley behind
    id: 'shothorse', n: 'Horseback across the valley', g: 'nature', note: 'tracking alongside · golden hour', len: 18, linger: 1,
    place: { k: 'farm', near: 'Willow Valley' }, anchors: ['p0', 'p1', 'p2', 'p3', 'in', 'field'], time: 1140, weather: 'clear',
    cast: [{ id: 'horse', veh: 'horse', at: { a: 'p3', f: -260, s: 140 }, offroad: true }, { id: 'rider', arch: 'hiker', in: 'horse' }],
    beats: [{ id: 'go', at: 0.8, who: 'horse', do: 'drive', to: { a: 'p0', f: 900, s: -40 }, direct: true, speed: 0.55, max: 16 }],
    cam: [{ at: 0, follow: 'horse', z: 1.35, lead: 0.3, s: 70 }, { at: 4, follow: 'horse', z: 1.0, lead: 0.7, s: 120, ease: 3 }],
  },
  // ---- Coast & Water ----
  place('showpier', 'coast', 'Sunset Beach Pier at dusk', ['Sunset Beach Pier', 'Sunset Beach'], 'pan', { t: 1205, z: 1.02, r: 520, s: 16 }),
  place('showlighthouse', 'coast', 'Egret Point Light', ['Egret Point Light', 'Egret Point'], 'orbit', { t: 1125, z: 1.02, r: 360, s: 16 }),   // (World v3 has no Lighthouse Rock: client/showcase.js)
  place('shotmarina', 'coast', 'The Harbor marina', ['Harbor Marina', 'Ferry Square'], 'pan', { t: 1130, z: 0.95, r: 520, s: 18 }),
  place('shotcoralcay', 'coast', 'Coral Cay lagoon', ['Tiki Point', 'Coral Cay'], 'crane', { t: 930, z: 0.95, r: 600, s: 18 }),
  place('shotmacaw', 'coast', 'Macaw Cove', ['Macaw Cove'], 'push', { t: 560, z: 1.0, r: 520, s: 16, dir: [0, 1] }),
  place('shotgull', 'coast', 'Gull Harbor at dawn', ['Quay Street', 'Gull Harbor'], 'pan', { t: 400, z: 0.95, r: 480, s: 16 }),
  {   // a speedboat flat out across open water, the camera tracking alongside it
    id: 'shotspeedboat', n: 'Speedboat across the bay', g: 'coast', note: 'tracking alongside · golden hour', len: 16, linger: 1,
    place: { k: 'water', near: 'Sunset Beach Pier', len: 1700 }, anchors: ['start', 'end', 'mid', 'shore'], time: 1125, weather: 'clear',
    cast: [{ id: 'boat', veh: 'speedboat', at: { a: 'start', f: 60 } }, { id: 'skipper', arch: 'hustler', in: 'boat' }],
    beats: [{ id: 'go', at: 0.6, who: 'boat', do: 'drive', to: { a: 'end', f: -60 }, direct: true, pass: true, speed: 0.85, max: 14 }],
    cam: [{ at: 0, follow: 'boat', z: 1.15, lead: 0.2, s: 90 }, { at: 3, follow: 'boat', z: 0.95, lead: 0.55, s: 150, ease: 2.5 }],
  },
  // ---- People & Life ----
  place('shotdance', 'people', 'Dancing on Piazza Vecchia', ['Piazza Vecchia', 'Old Town'], 'orbit', {
    t: 1215, z: 1.35, r: 170, s: 20, a0: 0.3, a1: 1.9,
    cast: [{ id: 'crowd', group: 7, arch: 'socialite', at: 'here', spread: 70, post: true }, { id: 'band', arch: 'hustler', at: { a: 'here', dy: -95 }, a: 1.5708, post: true }],
    beats: [{ at: 0.2, who: 'crowd', do: 'dance', s: 19 }, ...again('band', 'guitar', 0.4, 3.2, 6), { do: 'wait', s: 20 }],
  }),
  place('shotboardwalk', 'people', 'The boardwalk crowd at sunset', ['Sunset Beach Pier', 'Sunset Beach'], 'push', {
    t: 1170, z: 1.35, r: 260, s: 18, dir: [0, 1],
    cast: [{ id: 'busker', arch: 'casual', at: { a: 'here', dy: -30 }, a: 1.5708, post: true }, { id: 'fans', group: 6, arch: 'casual', at: { a: 'here', dy: 40 }, spread: 55, post: true }],
    beats: [...again('busker', 'guitar', 0.3, 3.1, 6), ...again('fans.0', 'clap', 1, 3.5, 5), ...again('fans.1', 'cheer', 2, 4, 4), ...again('fans.2', 'wave', 1.5, 4, 4), { at: 5, who: 'fans.3', do: 'dance', s: 12 }, ...again('fans.4', 'love', 3, 5, 3), { do: 'wait', s: 18 }],
  }),
  place('shotworkout', 'people', 'Morning workout in Greenfield Park', ['Greenfield Park'], 'crane', {
    t: 560, z: 1.1, r: 420, s: 18,
    cast: [{ id: 'gym', group: 6, arch: 'athlete', at: 'here', spread: 80, post: true }],
    beats: [...again('gym.0', 'pushups', 0.2, 4.2, 4), ...again('gym.1', 'stretch', 0.6, 3.4, 5), ...again('gym.2', 'flex', 1, 3.4, 5), ...again('gym.3', 'pushups', 1.5, 4.2, 4), ...again('gym.4', 'stretch', 0.3, 3.4, 5), ...again('gym.5', 'cheer', 2, 4, 4), { do: 'wait', s: 18 }],
  }),
  place('shotpicnic', 'people', 'Friends by Kestrel Lake', ['Kestrel Beach', 'Kestrel Lake'], 'orbit', {
    t: 1120, z: 1.4, r: 150, s: 18, a0: -0.2, a1: 1.2,
    cast: [{ id: 'pals', group: 5, arch: 'casual', at: 'here', spread: 45, post: true }],
    beats: [{ at: 0.2, who: 'pals.0', do: 'emote', emote: 'sit' }, { at: 0.3, who: 'pals.1', do: 'emote', emote: 'sit' }, { at: 0.4, who: 'pals.2', do: 'emote', emote: 'lie' }, ...again('pals.3', 'laugh', 1, 3.5, 4), ...again('pals.4', 'guitar', 0.5, 3.2, 5), ...again('pals.0', 'laugh', 4, 5, 3), { do: 'wait', s: 18 }],
  }),
  {   // the bar room with its roof off (the camera inside: client/director.js roofAt) - the table, the regulars round it
    id: 'shotpool', n: 'Pool night at the Rusty Spur', g: 'people', note: 'slow push-in · night', len: 18, linger: 0,
    place: { k: 'roadhouse' }, anchors: ['door', 'doorIn', 'bar', 'lot', 'road', 'approach', 'porch', 'town', 'table'], time: 1290, weather: 'clear',
    cast: [{ id: 'regs', group: 4, arch: 'biker', role: 'gang', at: { a: 'table', dy: 46 }, spread: 70, post: true }],
    beats: [...again('regs.0', 'laugh', 1, 4.5, 3), ...again('regs.1', 'cheer', 2.5, 5, 3), ...again('regs.2', 'point', 3, 5, 3), ...again('regs.3', 'clap', 4, 5, 3), { do: 'wait', s: 17 }],
    cam: [{ at: 0, move: [{ a: 'table', dy: 120 }, { a: 'table', dy: 20 }], dur: 17, z: [1.25, 1.75] }],
  },
  // ---- Vehicles & Flight ----
  {   // a helicopter low across Downtown's towers at golden hour, the camera alongside
    id: 'shotheli', n: 'Helicopter over Downtown', g: 'vehicles', note: 'tracking alongside · golden hour', len: 18, linger: 0,
    place: { k: 'named', q: ['Downtown'] }, anchors: ['here'], time: 1125, weather: 'clear',
    cast: [{ id: 'heli', veh: 'heli', at: { a: 'here', dx: -1400, dy: 200 }, a: 0, air: 240 }, { id: 'pilot', arch: 'executive', in: 'heli' }],
    beats: [{ id: 'fly', at: 0.2, who: 'heli', do: 'fly', to: { a: 'here', dx: 1500, dy: -200 }, route: [{ a: 'here', dx: -200, dy: 60 }], alt: 240, speed: 0.55, max: 18 }],
    cam: [{ at: 0, follow: 'heli', z: 0.95, lead: 0.4, s: 120 }, { at: 6, follow: 'heli', z: 0.78, lead: 0.8, s: 60, ease: 4 }],
  },
  {   // a plane low over the airport, on its way in
    id: 'shotplane', n: 'A plane over Westport International', g: 'vehicles', note: 'locked wide, then follow · morning', len: 16, linger: 0,
    place: { k: 'near', kind: 'runway', near: 'Westport International' }, anchors: ['here'], time: 560, weather: 'clear',
    cast: [{ id: 'plane', veh: 'plane', at: { a: 'here', dy: 1500 }, a: -1.5708, air: 260 }, { id: 'pilot', arch: 'executive', in: 'plane' }],
    beats: [{ id: 'fly', at: 0.2, who: 'plane', do: 'fly', to: { a: 'here', dy: -2600 }, alt: 200, speed: 0.6, max: 16 }],
    cam: [{ at: 0, hold: { a: 'here', dy: 200 }, z: 0.8 }, { at: 3.5, follow: 'plane', z: 0.8, lead: 0.5, s: -100, ease: 2.5 }],
  },
  {   // a touring bike through the peaks at golden hour, the camera riding alongside
    id: 'shotpeaks', n: 'Motorcycle through Granite Peaks', g: 'vehicles', note: 'tracking alongside · golden hour', len: 18, linger: 0,
    place: { k: 'road', len: 2200, near: 'Granite Peaks' }, anchors: ['start', 'end', 'mid'], time: 1125, weather: 'clear',
    cast: [{ id: 'bike', veh: 'tourer', at: { a: 'start', s: 10 } }, { id: 'rider', arch: 'hiker', in: 'bike' }],
    beats: [{ id: 'go', at: 0.4, who: 'bike', do: 'drive', to: { a: 'end', s: 10 }, straight: true, pass: true, speed: 0.6, max: 16 }],
    cam: [{ at: 0, follow: 'bike', z: 1.3, lead: 0.2, s: 60 }, { at: 3, follow: 'bike', z: 1.05, lead: 0.6, s: 110, ease: 2.5 }, { at: 11, follow: 'bike', z: 0.85, lead: 0.9, ease: 3 }],
  },
  {   // a pickup kicking up the desert road at sunset
    id: 'shotdesert', n: 'A pickup on the desert road', g: 'vehicles', note: 'tracking alongside · golden hour', len: 16, linger: 0,
    place: { k: 'road', len: 1300, near: 'Red Rock Desert', maxD: 14000 }, anchors: ['start', 'end', 'mid'], time: 1150, weather: 'clear',
    cast: [{ id: 'truck', veh: 'pickup', at: { a: 'start', s: 10 }, paint: 6 }, { id: 'driver', arch: 'construction', in: 'truck' }],
    beats: [{ id: 'go', at: 0.4, who: 'truck', do: 'drive', to: { a: 'end', s: 10 }, straight: true, pass: true, speed: 0.7, max: 14 }],
    cam: [{ at: 0, follow: 'truck', z: 1.2, lead: 0.3, s: -80 }, { at: 4, follow: 'truck', z: 0.9, lead: 0.8, s: -40, ease: 3 }],
  },
  {   // a convertible down the coast road at dusk
    id: 'shotcruise', n: 'Sports car down the coast road', g: 'vehicles', note: 'tracking alongside · dusk', len: 16, linger: 0,
    place: { k: 'road', len: 2000, near: 'Bayside Heights' }, anchors: ['start', 'end', 'mid'], time: 1195, weather: 'clear',
    cast: [{ id: 'car', veh: 'sports', at: { a: 'start', s: 10 }, paint: 2 }, { id: 'driver', arch: 'socialite', in: 'car' }],
    beats: [{ id: 'go', at: 0.4, who: 'car', do: 'drive', to: { a: 'end', s: 10 }, straight: true, pass: true, speed: 0.7, max: 14 }],
    cam: [{ at: 0, follow: 'car', z: 1.25, lead: 0.2, s: 70 }, { at: 3, follow: 'car', z: 1.0, lead: 0.7, s: 100, ease: 2.5 }],
  },
  place('shotballoons', 'vehicles', 'Balloons over Dry Creek at dawn', ['Dry Creek Balloon Field', 'Dry Creek'], 'crane', { t: 450, z: 0.95, r: 600, s: 18 }),
  // ---- Weather & Time-lapse ----
  place('shotrain', 'weather', 'Rain on Midtown at night', ['The Trestle Spot', 'Union Square', 'Midtown'], 'push', { t: 1380, weather: 'rain', z: 1.0, r: 480, s: 18 }),
  place('shotstorm', 'weather', 'A thunderstorm over Downtown', ['Greenfield Park', 'Downtown'], 'crane', { t: 1300, weather: 'storm', z: 0.95, r: 700, s: 20 }),
  place('shotfog', 'weather', 'Fog over Redwood Cove', ['Redwood Cove'], 'pan', { t: 450, weather: 'fog', z: 0.85, r: 600, s: 18 }),
  place('shotharborlapse', 'weather', 'The Harbor, dusk into night', ['Ferry Square', 'Harbor Marina'], 'pan', { tl: [1140, 1420], z: 0.85, r: 520, s: 24 }),
  place('shotsunrise', 'weather', 'Sunrise over Mirage Lake', ['Mirage Lake'], 'wide', { tl: [320, 520], z: 0.8, r: 400, s: 22 }),
  place('shotsparkle', 'weather', 'The sea sparkling at night', ['Sunset Beach', 'Sunset Beach Pier'], 'pan', { t: 1400, bio: 1, z: 0.9, r: 420, s: 18, dy: 6 }),
];
