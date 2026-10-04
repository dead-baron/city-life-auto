// World events shown to players as colour-coded radar blips and a short-lived guide arrow.
// Shared so the HUD, the server and the tutorial agree on names and colours.
export const EVENT_KINDS = {
  snatch: { color: '#ff9a1a', label: 'Snatch-and-grab', hint: 'Stop the thief' },
  drop: { color: '#c07aff', label: 'Contraband drop', hint: 'Rare crate landed' },
  ret: { color: '#3ddc84', label: 'Return the purse', hint: 'Take it back to its owner' },
  shootout: { color: '#ff3b3b', label: 'Gang shootout', hint: 'Syndicate vs police' },
};
export const EVENT_RANGE = 2200;    // events further away than this aren't shown
export const ARROW_SHOW_S = 10;     // the guide arrow fades out after this long
export const ARROW_FADE_S = 2;
