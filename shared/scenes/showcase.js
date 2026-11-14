// Autoplay for the Showcase's hand-crafted places (client/showcase.js; the owner, 11-13: "every cinematic scene and
// location ... should already have camera movements in and run on its own in a predetermined way"): each a scene with no
// cast - only the camera's planned move over the place (the server's view goes with it, so the city lives there as round
// a player). The moves:
//   track:  a slow slide across it, side to side (dir: which way, a unit [x, y]; r: how far either side, px)
//   reveal: in close on it, then a long pull back and up to the whole place
//   orbit:  round it at r px, from a0 to a1 (radians)
//   dolly:  a slow push in toward it from r px out (from the way dir points)
// show(id, n, q, move, opts) -> a scene: q the names to look it up by (as client/showcase.js's), z its zoom, t its time
// of day, s how long the move takes.
const show = (id, n, q, move, { z = 0.85, t = 1125, s = 16, dir = [1, 0], r = 420, a0 = -0.6, a1 = 0.9 } = {}) => {
  const [c, sn] = dir;   // (no Math while the module loads: shared/dmath.js's rule)
  const cam = move === 'track' ? [{ at: 0, move: [{ a: 'here', dx: -c * r, dy: -sn * r }, { a: 'here', dx: c * r, dy: sn * r }], dur: s, z }]
    : move === 'reveal' ? [{ at: 0, move: ['here', { a: 'here', dy: -60 }], dur: s, z: [z * 1.6, z * 0.75] }]
      : move === 'orbit' ? [{ at: 0, orbit: 'here', r, a0, a1, dur: s, z }]
        : [{ at: 0, move: [{ a: 'here', dx: -c * r, dy: -sn * r }, 'here'], dur: s, z: [z * 0.85, z * 1.15] }];
  return { id, n, g: 'Showcase (autoplay)', len: s + 1, linger: 0, place: { k: 'named', q }, anchors: ['here'], time: t, weather: 'clear', cast: [], beats: [{ do: 'wait', s }], cam };
};
export const SHOWCASE_SCENES = [
  show('showlighthouse', 'Lighthouse Rock', ['Lighthouse Tidepools', 'Lighthouse Rock'], 'orbit', { z: 0.85, t: 1125, r: 360 }),
  show('showpier', 'Sunset Beach Pier', ['Sunset Beach Pier', 'Sunset Beach'], 'track', { z: 0.85, t: 1205, r: 520 }),
  show('showpiazza', 'Piazza Vecchia', ['Piazza Vecchia', 'Old Town'], 'reveal', { z: 0.9, t: 1125 }),
  show('showfalls', 'Redwood Creek Falls', ['Redwood Creek Falls'], 'dolly', { z: 0.95, t: 450, r: 600 }),
];
