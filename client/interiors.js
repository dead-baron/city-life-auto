// Building interiors drawn top-down in the game's pixel style, shown behind the menu while you
// are inside: the police station lobby (front desk), the locked armory, and a cell when you've been booked
// (server custody.js; the bail and the time left are on the jail panel over it). Pure client art -
// what you can do in there comes from the server.
import { pedSprite, PED_BOX } from './render/sprites.js';
import { weaponIcon } from './render/peds.js';
import { POLICE_ARMORY } from '../shared/rules.js';
import { WEAPONS } from '../shared/items.js';
import { atlas } from './render/sprites.js';
import { INTERIOR_RECTS } from '../shared/interior-art.js';

const UNIFORM = { t: 6, tc: '#1d2a5a', tc2: '#f2c21b', l: '#1d2a5a', ht: 1, htc: '#1d2a5a' };
const SHORT = { service: 'PISTOL', prifle: 'RIFLE', psniper: 'MARKSMAN', passault: 'ASSAULT', pshotgun: 'SHOTGUN' };
const icons = new Map();
const icon = (i) => { if (!icons.has(i)) icons.set(i, weaponIcon(i)); return icons.get(i); };

function floor(g, x, y, w, h, a, b, s = 24) {
  for (let yy = 0; yy < h; yy += s) for (let xx = 0; xx < w; xx += s) {
    g.fillStyle = ((xx / s + yy / s) & 1) ? a : b;
    g.fillRect(x + xx, y + yy, Math.min(s, w - xx), Math.min(s, h - yy));
  }
}
function walls(g, x, y, w, h, c = '#2b2f3a') {
  g.fillStyle = c;
  g.fillRect(x - 10, y - 10, w + 20, 10); g.fillRect(x - 10, y + h, w + 20, 10);
  g.fillRect(x - 10, y, 10, h); g.fillRect(x + w, y, 10, h);
}
function person(g, app, x, y, a, scale = 2.2) {
  const spr = pedSprite(app || {}, 'idle', 0, 0);
  g.save(); g.translate(x, y); g.rotate(a); g.imageSmoothingEnabled = false;
  g.drawImage(spr, -PED_BOX * scale / 2, -PED_BOX * scale / 2, PED_BOX * scale, PED_BOX * scale);
  g.restore();
}
function label(g, text, x, y, c = '#fff', size = 13) {
  g.font = `bold ${size}px monospace`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = 'rgba(0,0,0,.6)'; g.fillText(text, x + 1, y + 1);
  g.fillStyle = c; g.fillText(text, x, y);
}

function lobby(g, x, y, w, h, me, t) {
  floor(g, x, y, w, h, '#c9c4b6', '#bdb7a8');
  walls(g, x, y, w, h);
  // blue carpet runner from the front door to the desk
  g.fillStyle = '#1d3a8a'; g.fillRect(x + w / 2 - 40, y + h * 0.42, 80, h * 0.58);
  // front desk (counter) with the sergeant behind it
  g.fillStyle = '#5a4128'; g.fillRect(x + w * 0.2, y + h * 0.26, w * 0.6, 26);
  g.fillStyle = '#7a5a38'; g.fillRect(x + w * 0.2, y + h * 0.26, w * 0.6, 6);
  g.fillStyle = '#20232b'; g.fillRect(x + w * 0.62, y + h * 0.26 + 8, 30, 14); // monitor
  g.fillStyle = '#7fd0ff'; g.fillRect(x + w * 0.62 + 3, y + h * 0.26 + 10, 24, 9);
  person(g, { ...me, ...UNIFORM, h: '#2a1a10' }, x + w / 2, y + h * 0.2, Math.PI / 2);
  label(g, 'FRONT DESK', x + w / 2, y + h * 0.26 + 40, '#f2c21b');
  // flags, badge crest, benches, plants, wanted board
  g.fillStyle = '#1d3a8a'; g.fillRect(x + 20, y + 6, 18, 28); g.fillStyle = '#c8262b'; g.fillRect(x + 42, y + 6, 18, 28);
  g.fillStyle = '#f2c21b'; g.beginPath(); g.arc(x + w / 2, y + 16, 12, 0, 6.28); g.fill();
  g.fillStyle = '#1d2a5a'; g.beginPath(); g.arc(x + w / 2, y + 16, 7, 0, 6.28); g.fill();
  for (const bx of [x + 30, x + w - 130]) { g.fillStyle = '#6b4a2a'; g.fillRect(bx, y + h * 0.62, 100, 18); g.fillStyle = '#4a3220'; g.fillRect(bx, y + h * 0.62 + 18, 100, 4); }
  for (const [px, py] of [[x + 22, y + h - 30], [x + w - 22, y + h - 30], [x + 22, y + h * 0.45]]) { g.fillStyle = '#6b4a2a'; g.fillRect(px - 9, py - 9, 18, 18); g.fillStyle = '#2f7a2a'; g.beginPath(); g.arc(px, py - 4, 12, 0, 6.28); g.fill(); }
  g.fillStyle = '#e8e2d0'; g.fillRect(x + w - 120, y + 8, 100, 50);
  for (let k = 0; k < 3; k++) { g.fillStyle = '#d0c8b0'; g.fillRect(x + w - 114 + k * 32, y + 14, 26, 36); g.fillStyle = '#3a2a1a'; g.fillRect(x + w - 106 + k * 32, y + 18, 10, 10); }
  label(g, 'WANTED', x + w - 70, y + 66, '#c8262b', 11);
  // doors: armory (officers only) and the street
  const lit = Math.floor(t * 2) % 2;
  g.fillStyle = '#4a4e58'; g.fillRect(x + w - 10, y + h * 0.3, 10, 60);
  g.fillStyle = lit ? '#ff3030' : '#801010'; g.fillRect(x + w - 16, y + h * 0.3 - 8, 6, 6);
  label(g, 'ARMORY ▶', x + w - 52, y + h * 0.3 + 30, '#9fb7ff', 11);
  g.fillStyle = '#8fd0ff'; g.fillRect(x + w / 2 - 36, y + h, 72, 10);
  label(g, 'EXIT', x + w / 2, y + h - 12, '#fff', 11);
  person(g, me, x + w / 2, y + h * 0.42, -Math.PI / 2);
}

function armory(g, x, y, w, h, me, t) {
  floor(g, x, y, w, h, '#4c5260', '#454b58', 32);
  walls(g, x, y, w, h, '#1a1d24');
  // weapon racks along the top wall, one per department weapon
  const n = POLICE_ARMORY.length;
  for (let k = 0; k < n; k++) {
    const id = POLICE_ARMORY[k];
    const rx = x + 24 + k * ((w - 48) / n), rw = (w - 48) / n - 10;
    g.fillStyle = '#2a2d36'; g.fillRect(rx, y + 8, rw, 70);
    g.fillStyle = '#5a5f6c'; g.fillRect(rx, y + 8, rw, 4);
    const ic = icon(WEAPONS[id].i);
    const s = Math.min((rw - 16) / Math.max(ic.width, 1), 50 / Math.max(ic.height, 1));
    g.imageSmoothingEnabled = false;
    g.drawImage(ic, rx + rw / 2 - ic.width * s / 2, y + 40 - ic.height * s / 2, ic.width * s, ic.height * s);
    label(g, SHORT[id] || id.toUpperCase(), rx + rw / 2, y + 90, '#cfd6e6', rw < 110 ? 9 : 11);
  }
  // lockers and an ammo crate
  for (let k = 0; k < 5; k++) { g.fillStyle = k % 2 ? '#36506e' : '#3d5a7a'; g.fillRect(x + 10, y + 120 + k * 34, 30, 30); g.fillStyle = '#9fb7d0'; g.fillRect(x + 32, y + 130 + k * 34, 3, 8); }
  g.fillStyle = '#4a5a2a'; g.fillRect(x + w * 0.42, y + h * 0.6, 70, 40); label(g, 'AMMO', x + w * 0.42 + 35, y + h * 0.6 + 20, '#f2c21b', 11);
  // the back door to the motor pool: locked until you're kitted out
  const lit = Math.floor(t * 2) % 2;
  g.fillStyle = '#5a5f6c'; g.fillRect(x + w - 10, y + h * 0.55, 10, 70);
  g.fillStyle = lit ? '#30ff60' : '#107a30'; g.fillRect(x + w - 18, y + h * 0.55 - 10, 7, 7);
  label(g, 'MOTOR POOL ▶', x + w - 64, y + h * 0.55 + 35, '#9fffb0', 11);
  g.fillStyle = '#20232b'; g.fillRect(x + w / 2 - 40, y + h, 80, 10);
  label(g, '🔒 LOBBY', x + w / 2, y + h - 12, '#ffb0b0', 11);
  person(g, me, x + w / 2 + 40, y + h * 0.5, -Math.PI / 2);
}

// A holding cell seen from above: concrete, a steel bench with you sitting on it, a steel toilet and basin, a high
// barred window throwing a patch of light, the bars and the door along the front, and the corridor beyond with a
// guard's desk under a flickering strip light.
function cell(g, x, y, w, h, me, t) {
  const cw = w * 0.62, ch = h * 0.72, cx = x + (w - cw) / 2, cy = y + 6;
  floor(g, x, y, w, h, '#3d4048', '#383b43', 28);                       // the corridor
  floor(g, cx, cy, cw, ch, '#6c6a64', '#66645e', 20);                   // the cell's concrete
  walls(g, cx, cy, cw, ch, '#24262c');
  // the light from the window, drifting a little through the day
  g.fillStyle = 'rgba(255,240,190,.13)';
  g.beginPath(); const lx = cx + cw * 0.62 + Math.sin(t * 0.05) * 6;
  g.moveTo(lx - 16, cy); g.lineTo(lx + 16, cy); g.lineTo(lx + 44, cy + ch * 0.55); g.lineTo(lx - 2, cy + ch * 0.55); g.closePath(); g.fill();
  g.fillStyle = '#9fb3c8'; g.fillRect(lx - 16, cy - 10, 32, 6);
  g.fillStyle = '#24262c'; for (let k = 0; k < 4; k++) g.fillRect(lx - 14 + k * 9, cy - 10, 2, 6);
  // the bench along the left wall, you on it
  g.fillStyle = '#8e939c'; g.fillRect(cx + 6, cy + ch * 0.2, 34, ch * 0.62);
  g.fillStyle = '#6e737c'; g.fillRect(cx + 6, cy + ch * 0.2 + ch * 0.62 - 5, 34, 5);
  person(g, me, cx + 26, cy + ch * 0.48, 0);
  // the steel toilet and basin in the far corner
  g.fillStyle = '#b8bec8'; g.fillRect(cx + cw - 40, cy + 8, 30, 22); g.fillStyle = '#d8dde4'; g.beginPath(); g.ellipse(cx + cw - 25, cy + 40, 12, 10, 0, 0, 6.28); g.fill();
  g.fillStyle = '#4a4e58'; g.beginPath(); g.ellipse(cx + cw - 25, cy + 40, 6, 5, 0, 0, 6.28); g.fill();
  // the bars along the front, the door in them
  const by = cy + ch;
  g.fillStyle = '#1c1e24'; g.fillRect(cx - 10, by, cw + 20, 6);
  for (let bx = cx + 4; bx < cx + cw; bx += 12) { g.fillStyle = '#a8adb6'; g.fillRect(bx, by - 2, 4, 10); g.fillStyle = '#5a5e68'; g.fillRect(bx + 3, by - 2, 1, 10); }
  g.strokeStyle = '#d0b050'; g.lineWidth = 2; g.strokeRect(cx + cw * 0.7, by - 3, cw * 0.22, 12);   // the door's frame
  g.fillStyle = '#d0b050'; g.fillRect(cx + cw * 0.7 + 3, by + 2, 5, 4);                              // its lock
  // the corridor: a guard's desk and the strip light (flickering now and then)
  const fl = Math.sin(t * 13) > 0.97 ? 0.4 : 1;
  g.fillStyle = `rgba(220,235,255,${0.1 * fl})`; g.fillRect(x, by + 14, w, h - (by + 14 - y));
  const dy = y + h - 66;   // the desk (the guard sits on its far side, facing the cells)
  g.fillStyle = '#5a4128'; g.fillRect(x + w - 150, dy, 120, 26); g.fillStyle = '#7a5a38'; g.fillRect(x + w - 150, dy, 120, 5);
  g.fillStyle = '#20232b'; g.fillRect(x + w - 120, dy + 4, 24, 12); g.fillStyle = '#7fd0ff'; g.fillRect(x + w - 117, dy + 6, 18, 8);
  person(g, { ...me, ...UNIFORM, h: '#2a1a10' }, x + w - 90, dy + 44, -Math.PI / 2);
}

export function drawInterior(cv, kind, me, t) {
  const g = cv.getContext('2d');
  const W = cv.width, H = cv.height;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.fillStyle = '#07080b'; g.fillRect(0, 0, W, H);
  // the room sits to the right of the menu panel on wide screens, centred otherwise
  const wide = W > H * 1.2;
  const rw = Math.min(wide ? W * 0.52 : W * 0.9, 720), rh = Math.min(H * 0.78, rw * 0.72);
  const x = wide ? W - rw - Math.max(30, W * 0.06) : (W - rw) / 2;
  const y = wide ? (H - rh) / 2 : H - rh - 20;
  if (kind === 'jail') { cell(g, x, y, rw, rh, me, t); return; }
  // the concept painting of the station's front desk / armory cage when it has loaded
  const art = atlas.interiors && INTERIOR_RECTS[kind === 'armory' ? 'armory' : 'policedesk'];
  if (art) { painted(g, art, x, y, rw, rh, kind, t); return; }
  if (kind === 'armory') armory(g, x, y, rw, rh, me, t); else lobby(g, x, y, rw, rh, me, t);
}

// The painting fitted into the room box (letterboxed, crisp), with the room's name and the
// way on (motor pool / armory) labelled over it.
function painted(g, [sx, sy, sw, sh], x, y, w, h, kind, t) {
  const k = Math.min(w / sw, h / sh);
  const dw = sw * k, dh = sh * k, dx = x + (w - dw) / 2, dy = y + (h - dh) / 2;
  g.fillStyle = '#14161c'; g.fillRect(dx - 8, dy - 8, dw + 16, dh + 16);
  g.imageSmoothingEnabled = k < 1;
  g.drawImage(atlas.interiors, sx, sy, sw, sh, dx, dy, dw, dh);
  g.imageSmoothingEnabled = true;
  const lit = Math.floor(t * 2) % 2;
  if (kind === 'armory') {
    label(g, 'HQ ARMORY', dx + dw / 2, dy - 18, '#f2c21b', 14);
    g.fillStyle = lit ? '#30ff60' : '#107a30'; g.fillRect(dx + dw - 14, dy + dh / 2 - 4, 8, 8);
    label(g, 'MOTOR POOL ▶', dx + dw - 60, dy + dh + 18, '#9fffb0', 12);
  } else {
    label(g, 'FRONT DESK', dx + dw / 2, dy - 18, '#f2c21b', 14);
    g.fillStyle = lit ? '#ff3030' : '#801010'; g.fillRect(dx + dw + 2, dy + dh * 0.25, 6, 6);
    label(g, 'ARMORY ▶', dx + dw + 44, dy + dh * 0.25 + 3, '#9fb7ff', 11);
  }
}
