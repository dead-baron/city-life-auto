// Logical actions and how each device triggers them. The HUD prompts and the tutorial both read
// these tables, so a rebind here updates every hint in the game.
export const KEY_ACTION = { E: 'action', F: 'vehicle', Q: 'throw', R: 'reload', X: 'use', H: 'horn', SPACE: 'dive', TAB: 'nextw', M: 'map', CLICK: 'fire', SHIFT: 'sprint', V: 'cruiser', P: 'phone', I: 'bag', L: 'light', G: 'dance' };
// (on a skateboard the fire button is the trick button: shared/skate.js)
// (light shares D-pad up with the horn: the horn is only in a vehicle, the flashlight only on foot)
// On a pad (tasks #301, #411): RT fires and the right stick only aims (Settings: "right stick full push fires" puts the
// stick-ring fire back); at the wheel RT is the gas, so a drive-by is R3 - click the stick you aim with. A tap of RB / LB
// takes out the next / previous weapon (LB from your fists: the plasma blade, if you have it); holding either opens the
// weapon wheel - point a stick at one and let go (shared/input.js createTapHold, wheelPicker).
export const PAD = {
  action: ['B', 'b'], vehicle: ['X', 'x'], throw: ['Y', 'y'], dive: ['A', 'a'], reload: ['R3', 'stick'], use: ['VIEW', 'sys'],
  horn: ['D↑', 'sys'], nextw: ['RB', 'bumper'], prevw: ['LB', 'bumper'], wpnwheel: ['HOLD RB / LB', 'bumper'], map: ['MENU', 'sys'], fire: ['RT', 'bumper'], drivefire: ['R3', 'stick'],
  sprint: ['FULL STICK', 'stick'], cruiser: ['D↓', 'sys'], phone: ['D←', 'sys'], bag: ['D→', 'sys'], light: ['D↑', 'sys'],
  move: ['L-STICK', 'stick'], aim: ['R-STICK', 'stick'], gas: ['RT', 'bumper'], brake: ['LT', 'bumper'], pause: ['MENU', 'sys'], back: ['B', 'b'],
  steer: ['L-STICK', 'stick'], block: ['LT', 'bumper'],
  dance: ['L3', 'stick'],
  trick: ['RT', 'bumper'],   // (on a skateboard: shared/skate.js)
  radio: ['📱 RADIO', 'sys'], lanes: ['D-PAD / X A Y RB', 'sys'], pads: ['D-PAD + X A Y RB', 'sys'], chord: ['LT', 'bumper'],
};
// (back: the death screen's choices folded away to watch the scene, and opened again - task #403)
export const TOUCH = {
  action: 'ACT', vehicle: 'CAR', throw: 'THROW', dive: 'ROLL', reload: 'RELOAD', use: 'ITEMS', bag: '🎒', horn: 'HORN', nextw: 'WPN', prevw: 'WPN', wpnwheel: 'HOLD WPN', map: 'MAP', fire: 'FIRE', drivefire: 'FIRE', sprint: 'FULL THUMB', cruiser: 'COP CAR', phone: '📱', light: '🔦',
  move: 'LEFT THUMB', aim: 'AIM STICK', gas: 'LEFT THUMB', brake: 'BRAKE', pause: '⚙', back: '▾ HIDE',
  steer: 'LEFT THUMB', block: 'HOLD AIM STICK',
  dance: '📱 DANCE',
  trick: 'TRICK',
  radio: '📱 RADIO', lanes: 'TAP THE LANES', pads: 'TAP THE PADS', chord: 'CHORD',
};
export const KB = {
  action: 'E', vehicle: 'F', throw: 'Q', dive: 'SPACE', reload: 'R', use: 'X', horn: 'H', nextw: 'TAB', prevw: 'WHEEL', wpnwheel: '1-9', map: 'M', fire: 'CLICK', drivefire: 'CLICK', sprint: 'SHIFT', cruiser: 'V', phone: 'P', bag: 'I', light: 'L',
  move: 'WASD', aim: 'MOUSE', gas: 'W', brake: 'S', pause: 'ESC', back: 'ESC',
  steer: 'A/D', block: 'RMB',
  dance: 'G',
  trick: 'CLICK',
  radio: 'G', lanes: '← ↓ ↑ → / DFJK', pads: 'A-K', chord: 'SHIFT',
};
// the music games' keys (client/music/play.js): the lanes, the pads by key code and pad button, the chord (radio: G in a car)
export const MUSIC_KEYS = { lanes: [['ArrowLeft', 'KeyD'], ['ArrowDown', 'KeyF'], ['ArrowUp', 'KeyJ'], ['ArrowRight', 'KeyK']], pads: ['KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG', 'KeyH', 'KeyJ', 'KeyK'], padLanes: [[14, 2], [13, 0], [12, 3], [15, 5]], padPads: [14, 13, 12, 15, 2, 0, 3, 5], padChord: 6 };
export const ACTIONS = Object.keys(KB);
