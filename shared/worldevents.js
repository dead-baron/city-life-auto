// World events shown to players as colour-coded radar blips and a short-lived guide arrow.
// Shared so the HUD, the server and the tutorial agree on names and colours.
export const EVENT_KINDS = {
  snatch: { color: '#ff9a1a', label: 'Snatch-and-grab', hint: 'Stop the thief' },
  drop: { color: '#c07aff', label: 'Contraband drop', hint: 'Rare crate landed' },
  ret: { color: '#3ddc84', label: 'Return the purse', hint: 'Take it back to its owner' },
  shootout: { color: '#ff3b3b', label: 'Gang shootout', hint: 'Syndicate vs police' },
  robbery: { color: '#ffd400', label: 'Store robbery', hint: 'Alarm tripped - police responding' },
  pet: { color: '#7fd8ff', label: 'Lost pet', hint: 'Find it and walk it home' },
  petret: { color: '#3ddc84', label: 'Pet\'s owner', hint: 'Walk the pet home' },
  revive: { color: '#ff4d6d', label: 'Player down', hint: 'Revive them' },
  amb: { color: '#ffffff', label: 'Ambulance', hint: 'On its way to you' },
  fight: { color: '#ff7a3d', label: 'Street fight', hint: 'Break it up' },
  faint: { color: '#ff6b8a', label: 'Someone collapsed', hint: 'Help them up' },
  wallet: { color: '#9be15d', label: 'Lost wallet', hint: 'It\'s on the ground behind them' },
  walletret: { color: '#3ddc84', label: 'Wallet\'s owner', hint: 'Give it back' },
  bikethief: { color: '#ff5a2a', label: 'Bike thief', hint: 'A club bike stolen - knock him off it' },   // (bikers.js, task #366)
};
export const EVENT_RANGE = 1300;    // events further away than this aren't popped up on screen (the phone's city feed has them all)
export const FEED_MAX = 40;         // the city feed keeps this many recent items
export const FEED_KEEP_S = 900;     // ...for at most this long
export const ARROW_SHOW_S = 10;     // the guide arrow fades out after this long
export const ARROW_FADE_S = 2;
