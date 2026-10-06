// Unified action-state bits shared by keyboard/mouse, gamepad and touch (GDD §13).

export const IN = {
  FIRE: 1,       // attack / shoot
  ACTION: 2,     // E - context interact (shops, crates, arrest, fishing, vehicles fallback)
  VEHICLE: 4,    // F / X button - enter / exit vehicle
  SPRINT: 8,     // Shift - sprint
  DIVE: 16,      // Space - dive roll on foot / handbrake in vehicle
  THROW: 32,     // Q - throw / drop carried crate
  RELOAD: 64,    // R
  HORN: 128,     // H - horn / siren
  AIMING: 256,   // aim vector is active (mouse moved / right stick deflected)
  USE: 512,      // X - use best healing item
  NEXTW: 1024,   // next weapon
  PREVW: 2048,   // previous weapon
  TANK: 4096,    // classic tank-style driving (optional keyboard setting)
  LIGHT: 8192,   // L / D-pad up on foot / 🔦 - flashlight on / off (if you have one)
};

export function quantizeAngle(a) {
  const t = ((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  return Math.round((t / (Math.PI * 2)) * 65535) & 0xffff;
}
export function dequantizeAngle(q) { return (q / 65535) * Math.PI * 2; }
export function quantizeAxis(v) { return Math.max(-127, Math.min(127, Math.round(v * 127))); }
export function dequantizeAxis(q) { return q / 127; }
