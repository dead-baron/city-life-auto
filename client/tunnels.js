// The tunnels' art (shared/tunnels.js has where they are): main.js loads this the first time one is near and calls
// drawTunnels on the overlay, in world space, over whichever renderer drew the city (art v2 or the classic one).
//   * from outside: the hill over the bore (the ground over the road), the portals at its mouths - a concrete headwall,
//     the dark opening, a lamp either side - and a closed mouth's red-and-white "ROAD CLOSED" barrier. Whatever is under
//     the hill isn't drawn at all for a viewer outside (main.js leaves it out of the frame: coverHides);
//   * from inside: the hill over YOUR tunnel fades away (about 0.3 s, as a walk-in's roof does) and the tunnel shows -
//     its walls, the dark rock beyond them, the lane markings, a row of lights along the ceiling, the dark between them,
//     and the headlights of the cars in there lighting the road ahead.
// Placeholder art in the game's palette, made in code (nothing to load).
import { underCover, coverHides, TUNNEL_WALL } from '../shared/tunnels.js';

// how open each tunnel's hill is (tunnel id -> 0: the hill drawn, 1: faded away, its inside showing)
const fades = new Map();
const hh = (x, y, s = 0) => { let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(s | 0, 0x9e3779b9); h = Math.imul(h ^ (h >>> 15), 0x85ebca6b); h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

// The hill over tunnel t fades away for someone at sp inside it (1) and stays for anyone else (0).
export function fadeTarget(map, sp, t) { return underCover(map, sp.x, sp.y) === t.id + 1 ? 1 : 0; }
// Is a thing at `thing` hidden from a viewer at `viewer`? (under a hill the viewer isn't under)
export function hiddenFor(map, viewer, thing) { return coverHides(map, viewer.x, viewer.y, thing.x, thing.y); }
// one step of the fade toward its target: ~0.3 s to open or close
export function stepFade(k, want, dt) { const n = k + (want - k) * (1 - Math.exp(-dt * 10)); return Math.abs(want - n) < 0.01 ? want : n; }

export function drawTunnels(g, F, map) {
  const dt = Math.min(0.1, F.dt || 0.016), v = F.view;
  for (const t of map.tunnels || []) {
    const k = stepFade(fades.get(t.id) || 0, fadeTarget(map, F.sp, t), dt);
    fades.set(t.id, k);
    const [x0, y0, x1, y1] = t.box;
    if (x1 < v.x0 || x0 > v.x1 || y1 < v.y0 || y0 > v.y1) continue;
    g.save();
    if (k > 0) drawInside(g, t, k, F, map);
    if (k < 1) drawHill(g, t, 1 - k);
    drawPortals(g, t, k);
    g.restore();
  }
}

// the centre line as points, and each point's unit normal
function pts(t) {
  if (t._p) return t._p;
  const L = t.line, n = L.length / 2, P = [];
  for (let k = 0; k < n; k++) {
    const a = Math.max(0, k - 1), b = Math.min(n - 1, k + 1);
    const dx = L[2 * b] - L[2 * a], dy = L[2 * b + 1] - L[2 * a + 1], l = Math.hypot(dx, dy) || 1;
    P.push({ x: L[2 * k], y: L[2 * k + 1], nx: -dy / l, ny: dx / l, tx: dx / l, ty: dy / l });
  }
  Object.defineProperty(t, '_p', { value: P, enumerable: false, configurable: true });
  return P;
}
// stroke the centre line (offset o px to its side) with width w
function band(g, P, o, w, style) {
  g.beginPath();
  for (let k = 0; k < P.length; k++) { const p = P[k], x = p.x + p.nx * o, y = p.y + p.ny * o; if (k) g.lineTo(x, y); else g.moveTo(x, y); }
  g.lineWidth = w; g.strokeStyle = style; g.stroke();
}

// the ground over the bore: a granite ridge with scrub and boulders, its crest catching the light
function drawHill(g, t, a) {
  const P = pts(t), W = 2 * (t.hw + TUNNEL_WALL) + 48;
  g.globalAlpha = a; g.lineCap = 'butt'; g.lineJoin = 'round';
  band(g, P, 0, W + 10, '#3b372f');
  band(g, P, 0, W, '#6f6858');
  band(g, P, -W * 0.12, W * 0.55, '#827a66');
  band(g, P, -W * 0.18, W * 0.22, '#958d77');
  band(g, P, -W * 0.2, 5, '#aaa28a');
  // scrub, pines and boulders on it (the same every frame)
  for (let k = 0; k < P.length; k++) for (let j = 0; j < 3; j++) {
    const p = P[k], r = hh(k, j, t.id), o = (hh(k, j + 7, t.id) - 0.5) * (W - 24), x = p.x + p.nx * o + p.tx * (r - 0.5) * 28, y = p.y + p.ny * o + p.ty * (r - 0.5) * 28;
    if (r < 0.45) { g.fillStyle = '#2f4a2c'; g.beginPath(); g.arc(x, y, 6 + r * 10, 0, 6.283); g.fill(); g.fillStyle = '#3f6138'; g.beginPath(); g.arc(x - 2, y - 2, 3 + r * 6, 0, 6.283); g.fill(); }
    else if (r < 0.6) { g.fillStyle = '#585246'; g.fillRect(x - 6, y - 4, 12, 8); g.fillStyle = '#9c947e'; g.fillRect(x - 6, y - 4, 12, 3); }
  }
  g.globalAlpha = 1;
}

// inside: the dark rock beyond the walls, the walls, the dim road with its markings, the ceiling lights, headlights
function drawInside(g, t, k, F, map) {
  const P = pts(t), R = TUNNEL_WALL + 30;
  g.globalAlpha = k; g.lineCap = 'butt'; g.lineJoin = 'round';
  for (const s of [-1, 1]) {
    band(g, P, s * (t.hw + 6 + R / 2), R, '#0d0d10');            // the rock beyond, in the dark
    band(g, P, s * (t.hw + 6), 12, '#55534f');                    // the tunnel's wall
    band(g, P, s * (t.hw + 1), 2, '#8a877f');                     // its foot, catching the light
  }
  band(g, P, 0, 2 * t.hw, 'rgba(6,8,14,0.55)');                   // the dark between the lights
  if (t.kind === 'road') { g.setLineDash([26, 22]); band(g, P, 0, 3, 'rgba(232,201,90,0.85)'); g.setLineDash([]); }
  // the lights along the ceiling, and the headlights of whatever's driving through
  g.globalCompositeOperation = 'lighter';
  for (let i = 1; i < P.length - 1; i += 3) {
    const p = P[i], gr = g.createRadialGradient(p.x, p.y, 4, p.x, p.y, t.hw * 1.2);
    gr.addColorStop(0, 'rgba(255,214,150,0.32)'); gr.addColorStop(1, 'rgba(255,214,150,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(p.x, p.y, t.hw * 1.2, 0, 6.283); g.fill();
  }
  for (const v of F.vehs || []) {
    if (v.rx === undefined || underCover(map, v.rx, v.ry) !== t.id + 1) continue;
    const c = Math.cos(v.ra || 0), s = Math.sin(v.ra || 0), x = v.rx + c * 110, y = v.ry + s * 110;
    const gr = g.createRadialGradient(x, y, 8, x, y, 120);
    gr.addColorStop(0, 'rgba(255,244,210,0.4)'); gr.addColorStop(1, 'rgba(255,244,210,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, 120, 0, 6.283); g.fill();
  }
  g.globalCompositeOperation = 'source-over';
  for (let i = 1; i < P.length - 1; i += 3) {   // the lamps themselves
    const p = P[i];
    g.fillStyle = '#fff2c8'; g.beginPath(); g.arc(p.x, p.y, 3.5, 0, 6.283); g.fill();
  }
  g.globalAlpha = 1;
}

// the portals: a headwall across each mouth, the dark opening into the hill, a lamp either side; a closed mouth's barrier
function drawPortals(g, t, k) {
  for (let m = 0; m < 2; m++) {
    const mo = t.mouths[m], ox = mo.ox, oy = mo.oy, nx = -oy, ny = ox, half = t.hw + TUNNEL_WALL + 18;
    const x = mo.x, y = mo.y;
    // the dark opening, just inside the face (gone once you're in and the hill has faded)
    if (k < 1) {
      g.globalAlpha = 1 - k;
      const d = 34;
      g.fillStyle = '#060608';
      g.beginPath();
      g.moveTo(x + nx * t.hw, y + ny * t.hw); g.lineTo(x - nx * t.hw, y - ny * t.hw);
      g.lineTo(x - nx * t.hw * 0.8 - ox * d, y - ny * t.hw * 0.8 - oy * d); g.lineTo(x + nx * t.hw * 0.8 - ox * d, y + ny * t.hw * 0.8 - oy * d);
      g.closePath(); g.fill();
      g.globalAlpha = 1;
    }
    // the headwall
    g.lineCap = 'butt';
    g.strokeStyle = '#8f8a7d'; g.lineWidth = 12;
    g.beginPath(); g.moveTo(x + nx * half - ox * 4, y + ny * half - oy * 4); g.lineTo(x + nx * t.hw, y + ny * t.hw); g.stroke();
    g.beginPath(); g.moveTo(x - nx * half - ox * 4, y - ny * half - oy * 4); g.lineTo(x - nx * t.hw, y - ny * t.hw); g.stroke();
    g.strokeStyle = '#b5af9f'; g.lineWidth = 4;
    g.beginPath(); g.moveTo(x + nx * t.hw, y + ny * t.hw); g.lineTo(x - nx * t.hw, y - ny * t.hw); g.stroke();   // the arch's lintel
    // a lamp either side, lit
    for (const s of [-1, 1]) {
      const lx = x + nx * s * (t.hw + 12) + ox * 6, ly = y + ny * s * (t.hw + 12) + oy * 6;
      const gr = g.createRadialGradient(lx, ly, 1, lx, ly, 26);
      gr.addColorStop(0, 'rgba(255,214,120,0.55)'); gr.addColorStop(1, 'rgba(255,214,120,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(lx, ly, 26, 0, 6.283); g.fill();
      g.fillStyle = '#ffe9a8'; g.beginPath(); g.arc(lx, ly, 3.5, 0, 6.283); g.fill();
    }
    if (!mo.closed) continue;
    // ROAD CLOSED: a striped barrier across the bore at the mouth, and its sign
    const bx = x - ox * 10, by = y - oy * 10;
    g.lineWidth = 10; g.strokeStyle = '#f2f2ee';
    g.beginPath(); g.moveTo(bx + nx * t.hw, by + ny * t.hw); g.lineTo(bx - nx * t.hw, by - ny * t.hw); g.stroke();
    g.setLineDash([14, 14]); g.strokeStyle = '#c8282a';
    g.beginPath(); g.moveTo(bx + nx * t.hw, by + ny * t.hw); g.lineTo(bx - nx * t.hw, by - ny * t.hw); g.stroke();
    g.setLineDash([]);
    const sx = x + ox * 30, sy = y + oy * 30;
    g.fillStyle = '#b81f22'; g.fillRect(sx - 44, sy - 10, 88, 20);
    g.strokeStyle = '#ffffff'; g.lineWidth = 2; g.strokeRect(sx - 42, sy - 8, 84, 16);
    g.fillStyle = '#ffffff'; g.font = 'bold 11px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('ROAD CLOSED', sx, sy + 1);
  }
}
