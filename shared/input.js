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
  BLOCK: 16384,  // guard: right mouse · LT on foot · touch aim stick (combat.js)
  DANCE: 32768,  // G / L3 / the phone's 💃 - dance where you stand, the next move each press (server dance.js)
  // 65536 and up: free - the input is 32 bits on the wire (protocol.js: a second word); keep below 2^31 (signed ops)
};

// ---- the gamepad (client/input.js; tasks #301, #411) ----------------------------------------------------------------
// Firing on a pad: RT on foot and from a passenger seat. At the wheel (the classic trigger driving) RT is the gas, so a
// drive-by is R3 - click the stick you're aiming with. The right stick only aims; pushing it into its outer ring fires
// only with Settings' "right stick full push fires" (ring: off by default). p: { rt, r3 (held), rx, ry }.
export function padFires(p, driving, ring) {
  return !!((driving ? p.r3 : p.rt > 0.35) || (ring && Math.hypot(p.rx || 0, p.ry || 0) > 0.9));
}

// A bumper tapped or held (LB -1, RB 1): let go within WHEEL_HOLD_MS it's a tap (the previous / next weapon); held past
// it, the weapon wheel opens (hold), and letting go picks (release). One bumper at a time: the other is ignored while
// one is down. step(lb, rb, nowMs) -> { tap, hold, release }, each -1, 1 or 0.
export const WHEEL_HOLD_MS = 300;
export function createTapHold(holdMs = WHEEL_HOLD_MS) {
  let side = 0, at = 0, held = false;
  return {
    step(lb, rb, now) {
      const out = { tap: 0, hold: 0, release: 0 };
      if (!side) { if (lb || rb) { side = lb ? -1 : 1; at = now; held = false; } return out; }
      if (side < 0 ? lb : rb) { if (!held && now - at >= holdMs) { held = true; out.hold = side; } return out; }
      if (held) out.release = side; else out.tap = side;
      side = 0; held = false;
      return out;
    },
    get held() { return held ? side : 0; },
  };
}

// The weapon wheel's slots: n round a circle, slot 0 at the top, clockwise (screen y down). slotAt: the slot a direction
// points at. wheelPicker(n, start): the right stick picks straight away; the left one only once it has been back in the
// middle since the wheel opened (it may still be walking you along); the one pushed further wins, and the last slot
// pointed at stays picked when the sticks go back to the middle - so letting go of the bumper takes it out.
export function slotAt(dx, dy, n) {
  return Math.round((Math.atan2(dx, -dy) / (2 * Math.PI)) * n + n) % n;
}
export function wheelPicker(n, start = -1) {
  let sel = start, armL = false;
  return (lx, ly, rx, ry) => {
    const ml = Math.hypot(lx, ly), mr = Math.hypot(rx, ry);
    if (ml < 0.3) armL = true;
    const r = mr >= 0.5 && !(armL && ml > mr), l = !r && armL && ml >= 0.5;
    if (r || l) sel = slotAt(r ? rx : lx, r ? ry : ly, n);
    return sel;
  };
}

export function quantizeAngle(a) {
  const t = ((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  return Math.round((t / (Math.PI * 2)) * 65535) & 0xffff;
}
export function dequantizeAngle(q) { return (q / 65535) * Math.PI * 2; }
export function quantizeAxis(v) { return Math.max(-127, Math.min(127, Math.round(v * 127))); }
export function dequantizeAxis(q) { return q / 127; }

// A keyboard's wheel (car-style driving, IN.TANK): eased over to full lock in KB_STEER.in s, back in .out s
export const KB_STEER = { in: 0.22, out: 0.11 };
export function easeSteer(cur, target, dt) {
  const back = target * cur < 0 || Math.abs(target) < Math.abs(cur);
  const step = dt / (back ? KB_STEER.out : KB_STEER.in), d = target - cur;
  return Math.abs(d) <= step ? target : cur + Math.sign(d) * step;
}

// The touch aim stick: its ring fires only with the FIRE toggle on; short of it (or toggled off) it aims and guards
export function touchStick(m, wasFiring, fireOn) {
  const firing = !!fireOn && (wasFiring ? m > 0.8 : m > 0.92);
  return { firing, aiming: m > 0.2, guard: m > 0.2 && !firing };
}
