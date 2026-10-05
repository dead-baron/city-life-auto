// What each player can see, and what they're sent.
// The client tells the server how much world its screen shows at rest (half-width/height in
// world px); the server mirrors the client camera (zooms out up to 1.5x with speed, leads
// ahead of a moving vehicle) to get each player's camera rectangle. Everything that spawns
// does so outside every camera, and the net-cull window is that camera plus a prefetch margin
// (stretched further ahead of fast movers), so entities reach the client before they scroll
// onto the screen instead of popping in mid-view.
export const DEFAULT_VIEW = { hw: 780, hh: 440 }; // a 1080p desktop at rest
const MAX_VIEW = { hw: 1100, hh: 700 };
const MIN_VIEW = { hw: 200, hh: 150 };
export const NET_MARGIN = 360;     // sent this far past the screen edge
export const NET_KEEP = 200;       // hysteresis: already-known entities stay until this much further out
const PREFETCH_S = 0.9;            // and an extra stretch ahead of you: where you'll be in ~1 s

export function setView(p, hw, hh) {
  hw = Number(hw); hh = Number(hh);
  if (!Number.isFinite(hw) || !Number.isFinite(hh)) return;
  p.view = {
    hw: Math.max(MIN_VIEW.hw, Math.min(MAX_VIEW.hw, hw)),
    hh: Math.max(MIN_VIEW.hh, Math.min(MAX_VIEW.hh, hh)),
  };
}

// The thing the camera follows: your vehicle, else you (a train rider moves with the car).
export function focusOf(world, p) {
  const ped = p.ped;
  if (!ped) return null;
  const veh = ped.vehId ? world.get(ped.vehId) : null;
  return veh || ped;
}

// The player's camera rectangle right now (same maths as the client camera).
export const DOWN_ZOOM_OUT = 1.45; // how far the camera has pulled back once you've been down a while (client: main.js)
export function viewRect(world, p, out = {}) {
  const f = focusOf(world, p);
  if (!f) return null;
  const moving = !!(p.ped.vehId || p.ped.onTrain);
  const vx = moving ? f.vx || 0 : 0, vy = moving ? f.vy || 0 : 0;
  const speed = Math.hypot(vx, vy);
  const zoomOut = p.ped.dead ? DOWN_ZOOM_OUT : 1 + Math.min(0.5, speed / 1300); // down: the camera slowly pulls back
  const v = p.view || DEFAULT_VIEW;
  const cx = f.x + Math.max(-560, Math.min(560, vx)) * 0.25, cy = f.y + Math.max(-560, Math.min(560, vy)) * 0.25;
  const hw = v.hw * zoomOut, hh = v.hh * zoomOut;
  out.x0 = cx - hw; out.x1 = cx + hw; out.y0 = cy - hh; out.y1 = cy + hh;
  out.vx = vx; out.vy = vy;
  return out;
}

// The rectangle a player is sent: the camera, a margin all round, stretched ahead of travel.
export function netRect(world, p, out = {}) {
  if (!viewRect(world, p, out)) return null;
  out.x0 -= NET_MARGIN; out.x1 += NET_MARGIN; out.y0 -= NET_MARGIN; out.y1 += NET_MARGIN;
  const ax = out.vx * PREFETCH_S, ay = out.vy * PREFETCH_S;
  if (ax > 0) out.x1 += ax; else out.x0 += ax;
  if (ay > 0) out.y1 += ay; else out.y0 += ay;
  return out;
}

const tmp = {};
// Is (x, y) on (or within pad px of) anyone's screen? Spawners use this to stay out of sight.
export function inAnyView(world, x, y, pad = 96) {
  for (const p of world.players.values()) {
    if (!p.conn || !p.ped) continue;
    if (!viewRect(world, p, tmp)) continue;
    if (x >= tmp.x0 - pad && x <= tmp.x1 + pad && y >= tmp.y0 - pad && y <= tmp.y1 + pad) return true;
  }
  return false;
}
