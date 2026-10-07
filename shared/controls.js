// Logical actions and how each device triggers them. The HUD prompts and the tutorial both read
// these tables, so a rebind here updates every hint in the game.
export const KEY_ACTION = { E: 'action', F: 'vehicle', Q: 'throw', R: 'reload', X: 'use', H: 'horn', SPACE: 'dive', TAB: 'nextw', M: 'map', CLICK: 'fire', SHIFT: 'sprint', V: 'cruiser', P: 'phone', I: 'bag', L: 'light' };
// (light shares D-pad up with the horn: the horn is only in a vehicle, the flashlight only on foot)
export const PAD = {
  action: ['B', 'b'], vehicle: ['X', 'x'], throw: ['Y', 'y'], dive: ['A', 'a'], reload: ['R3', 'stick'], use: ['VIEW', 'sys'],
  horn: ['D↑', 'sys'], nextw: ['RB', 'bumper'], map: ['MENU', 'sys'], fire: ['RT', 'bumper'], sprint: ['FULL STICK', 'stick'], cruiser: ['D↓', 'sys'], phone: ['D←', 'sys'], bag: ['D→', 'sys'], light: ['D↑', 'sys'],
  move: ['L-STICK', 'stick'], aim: ['R-STICK', 'stick'], gas: ['RT', 'bumper'], brake: ['LT', 'bumper'], pause: ['MENU', 'sys'],
};
export const TOUCH = {
  action: 'ACT', vehicle: 'CAR', throw: 'THROW', dive: 'ROLL', reload: 'RELOAD', use: 'ITEMS', bag: '🎒', horn: 'HORN', nextw: 'WPN', map: 'MAP', fire: 'FIRE', sprint: 'FULL THUMB', cruiser: 'COP CAR', phone: '📱', light: '🔦',
  move: 'LEFT THUMB', aim: 'AIM STICK', gas: 'LEFT THUMB', brake: 'BRAKE', pause: '⚙',
};
export const KB = {
  action: 'E', vehicle: 'F', throw: 'Q', dive: 'SPACE', reload: 'R', use: 'X', horn: 'H', nextw: 'TAB', map: 'M', fire: 'CLICK', sprint: 'SHIFT', cruiser: 'V', phone: 'P', bag: 'I', light: 'L',
  move: 'WASD', aim: 'MOUSE', gas: 'W', brake: 'S', pause: 'ESC',
};
export const ACTIONS = Object.keys(KB);
