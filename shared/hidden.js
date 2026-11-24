// What's switched off for the beta (finish or hide - the owner's call per item; DECISIONS "Product"). A small module of
// its own: the page reads it at once (shared/rules.js is not page code).
// Finish or hide (the owner, 11-24 08:44 - DECISIONS "Product"): the kayak races stay off until the kayaker sits in it
// and paddles - no start, no buoys, no place on the map or in Places, no Guide entry; kayaks still hire and ride.
export const RACES_HIDDEN = ['kayak'];
export const raceShown = (race) => !!race && !RACES_HIDDEN.includes(race.kind);
// a race's start on the map (its 'race' place) whose race is hidden
export const racePlaceHidden = (map, p) => !!p && p.kind === 'race' && (map.races || []).some((r) => !raceShown(r) && Math.abs(r.start.x - p.x) < 2 && Math.abs(r.start.y - p.y) < 2);
