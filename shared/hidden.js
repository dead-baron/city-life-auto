// What's switched off for the beta (finish or hide - the owner's call per item; DECISIONS "Product"). A small module of
// its own: the page reads it at once (shared/rules.js is not page code).
// Finish or hide (the owner, 11-24 08:44 - DECISIONS "Product"): a race kind listed here is off - no start, no buoys,
// no place on the map or in Places, no Guide entry (its vehicles still hire and ride). The kayak races were, till the
// kayaker sat in it and paddled (11-27: shared/physics.js PADDLE, people.js 'paddle') - none now.
export const RACES_HIDDEN = [];
export const raceShown = (race) => !!race && !RACES_HIDDEN.includes(race.kind);
// a race's start on the map (its 'race' place) whose race is hidden
export const racePlaceHidden = (map, p) => !!p && p.kind === 'race' && (map.races || []).some((r) => !raceShown(r) && Math.abs(r.start.x - p.x) < 2 && Math.abs(r.start.y - p.y) < 2);
