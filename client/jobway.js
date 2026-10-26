// The way to your job (the owner, 10-23: "On jobs let's give a waypoint arrow or line that helps players know where
// they're going for the job"; "Search and rescue missions should give you a waypoint to the area or objective"). The
// server decides where the job wants you (phone.jobTarget: me.job's x, y - the fare, the stop, the wreck, the patient,
// the hospital, the fire, the search circle's middle - and its area, a rescue call's circle); the page only draws it.
// Loaded the first time you have a job (client/main.js) - out of the page's first load.
//   drawJobWay(g, S, view, sp, now, z)   in the world's transform: off screen, an arrow at the screen's edge pointing to
//                                        the target with how far it is; a search circle drawn round its area (and, in
//                                        it, "SEARCH AREA" over you)
//   routeTo(S, inVeh)                    where the GPS line along the roads goes for the job (client/route.js), or null:
//                                        in an aircraft or a boat (no roads up there) - the job's truck first while you're
//                                        out of it; snapped to a grid so a target on the move doesn't re-route every frame
import { VEHICLE_BY_INDEX } from '../shared/vehicles.js';

const COL = '#ffd34a', EDGE = '#070b16', PX_M = 32;   // (32 px a metre: the map's own scale - client/mapwaypoints.js)
export const fmtDist = (d) => (d >= 1000 * PX_M ? `${(d / (1000 * PX_M)).toFixed(1)} km` : `${Math.max(1, Math.round(d / PX_M))} m`);

export function drawJobWay(g, S, view, sp, now, z) {
  const j = S.me && S.me.job;
  if (!j || !Number.isFinite(j.x) || !Number.isFinite(j.y)) return;
  const u = 1 / z;
  g.save();
  // a rescue call's search circle (server sar.js target area): dashed round it, in the world
  if (j.area) {
    const [ax, ay, ar] = j.area;
    g.setLineDash([18 * u, 12 * u]); g.lineDashOffset = -now * 30 * u;
    g.strokeStyle = 'rgba(7,11,22,.5)'; g.lineWidth = 6 * u; g.beginPath(); g.arc(ax, ay, ar, 0, 6.283); g.stroke();
    g.strokeStyle = '#ffae2a'; g.lineWidth = 3 * u; g.stroke();
    g.setLineDash([]);
    if (Math.hypot(sp.x - ax, sp.y - ay) < ar) {   // (in it: look about - no arrow to the middle)
      plate(g, sp.x, view.y0 + (open()[1] + 12) * u, 'SEARCH AREA - LOOK FOR THEM', u, '#ffd08a');
      g.restore();
      return;
    }
  }
  if (j.veh) { g.restore(); return; }   // (get to the job's truck first: its own ring and arrow - main.js drawJobTruck)
  const [ml, mt, mr, mb] = open(), x = j.x, y = j.y, x0 = view.x0 + ml * u, x1 = view.x1 - mr * u, y0 = view.y0 + mt * u, y1 = view.y1 - mb * u;
  if (x >= x0 && x <= x1 && y >= y0 && y <= y1) { g.restore(); return; }   // (on screen: the marker over it - main.js)
  // (from you - or the nearest point of that open part of the screen - out toward the target, to its edge)
  const cx = Math.min(x1, Math.max(x0, sp.x)), cy = Math.min(y1, Math.max(y0, sp.y)), dx = x - cx, dy = y - cy;
  const k = Math.min((dx < 0 ? cx - x0 : x1 - cx) / (Math.abs(dx) || 1e-6), (dy < 0 ? cy - y0 : y1 - cy) / (Math.abs(dy) || 1e-6));
  const ex = cx + dx * k, ey = cy + dy * k, a = Math.atan2(dy, dx), s = 20 * u, pulse = 0.85 + 0.15 * Math.sin(now * 5);
  g.save(); g.translate(ex, ey); g.rotate(a); g.globalAlpha = pulse;
  g.fillStyle = COL; g.strokeStyle = EDGE; g.lineWidth = 2.5 * u;
  g.beginPath(); g.moveTo(s, 0); g.lineTo(-s * 0.8, -s * 0.85); g.lineTo(-s * 0.35, 0); g.lineTo(-s * 0.8, s * 0.85); g.closePath(); g.fill(); g.stroke();
  g.restore();
  // how far, just inside the arrow (toward the middle of the screen)
  const d = Math.hypot(x - sp.x, y - sp.y), back = 46 * u;
  plate(g, ex - Math.cos(a) * back, ey - Math.sin(a) * back, `${j.area ? 'SEARCH ' : ''}${fmtDist(d)}`, u, '#fff');
  g.restore();
}

// the part of the screen the arrow keeps to, as screen px in from the left, top, right and bottom: on a phone the open
// middle, clear of the HUD along the top, the sticks and the buttons (a phone on its side: the action buttons fill the
// right; upright: the round buttons down the right, the prompt over you, the sticks and the buttons below)
function open() {
  const b = document.body.classList;
  return !b.contains('touch') ? [94, 94, 94, 94] : b.contains('portrait') ? [40, 340, 80, 330] : [175, 110, 370, 130];
}

// a little navy plate with the text on it, centred on (x, y)
function plate(g, x, y, text, u, col) {
  g.font = `700 ${12 * u}px "CLA Pixel", "Barlow Condensed", sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
  const w = g.measureText(text).width + 14 * u, h = 20 * u;
  g.globalAlpha = 0.9; g.fillStyle = '#0d162d'; g.strokeStyle = '#c9d6ee'; g.lineWidth = 1.5 * u;
  g.beginPath(); g.rect(x - w / 2, y - h / 2, w, h); g.fill(); g.stroke();
  g.globalAlpha = 1; g.fillStyle = col; g.fillText(text, x, y + u);
}

const SNAP = 96;
export function routeTo(S, inVeh) {
  const j = S.me && S.me.job;
  if (!j || !Number.isFinite(j.x)) return null;
  if (inVeh) {
    const e = S.ents.get(S.ctrlId), def = e && e.d ? VEHICLE_BY_INDEX[e.d.m] : null;
    if (def && (def.kind === 'air' || def.kind === 'boat')) return null;
  }
  const [x, y] = j.veh ? j.veh : [j.x, j.y];
  return { x: Math.round(x / SNAP) * SNAP, y: Math.round(y / SNAP) * SNAP };
}
