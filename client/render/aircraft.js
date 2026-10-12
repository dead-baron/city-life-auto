// Aircraft on the page (shared/flight.js; loaded the first time one is near, or when you take the controls of one):
// the pilot's prediction (the same flightStep the server runs), and the drawing - over everything, in both renderers
// (the overlay canvas, the world's transform): the shadow on the ground offset by the altitude (away from the sun),
// the aircraft above it a little bigger the higher it is (nearer the camera), the rotor a blurred disc once it's up to
// speed (its blades seen turning while it spools), the plane's wings foreshortened as it banks, the propeller a blur;
// the helipads' H on the ground. Liveries after HE1 (the news / tour helicopter blue and white, the police one black and
// white with its light bar, the army's olive gunship), the light plane white with a red stripe.
import { VEHICLE_BY_INDEX } from '../../shared/vehicles.js';
import { VF } from '../../shared/constants.js';
import { flightStep, flightInput, altOfByte, airfields, isPlane, FLY, floorAt } from '../../shared/flight.js';

export { airfields };
// the pilot's own aircraft, predicted exactly as the server steps it (players.js -> aircraft.js)
export function predict(s, inp, dt, map, def, engine) { flightStep(s, flightInput(s, inp, def), dt, map, def, engine); }
// how far the camera pulls back at an altitude (the page's zoom is divided by it)
export const zoomOut = (alt) => 1 + Math.min(1.3, Math.max(0, alt || 0) / 650);
// Art v2 stands things up: something at a height is drawn that much up the screen. An aircraft is drawn lifted by its
// altitude the same way (its shadow stays on the ground), so one down on a roof sits on the drawn roof - V2_LIFT: the
// drawn height of a roof over its flying height (bldTop; measured on the hospitals' roofs). The camera follows two thirds of the
// lift of your own (main.js), so you and the ground under you both stay on screen.
export const V2_LIFT = 0.66;
export const liftOf = (alt) => Math.max(0, alt || 0) * V2_LIFT;

const LIVERY = {
  news: { body: '#e9edf2', trim: '#2c55b8', dark: '#1d2a4a', glass: '#3a5f86', tip: 'rgba(255,200,50,0.5)', cam: true },
  police: { body: '#1d1f24', trim: '#eef0f3', dark: '#0d0e10', glass: '#36506e', bar: true, tip: 'rgba(240,70,50,0.5)', lamp: true },
  army: { body: '#4f5d33', trim: '#6b7a44', dark: '#2f381e', glass: '#2c3a2a', tip: 'rgba(255,200,50,0.5)' },
  rescue: { body: '#d8382e', trim: '#f2f2f2', dark: '#7a1a14', glass: '#3a5f86', tip: 'rgba(245,245,245,0.55)', cross: true },
  plane: { body: '#f1f2f0', trim: '#c4302b', dark: '#9aa2a8', glass: '#3a5f86' },
};

// the altitude each aircraft is drawn at: yours from the prediction (e.ralt, set by main.js), the others' eased toward
// the wire's (a vehicle record's extra byte)
function altOf(v, dt) {
  if (v.ralt !== undefined && v.ralt !== null && v._own) return v.ralt;
  const want = altOfByte(v.extra | 0);
  v._alt = v._alt === undefined ? want : v._alt + (want - v._alt) * (1 - Math.exp(-8 * dt));
  return v._alt;
}

export function drawAir(g, F, S, dt, v2 = false) {
  const list = F.air;
  const sky = F.sky, sun = sky && sky.sunDir ? sky.sunDir : { x: 0.55, y: 0.83 };
  const now = F.now;
  drawPads(g, F, S, v2);
  const job = S.me && S.me.job;
  if (job && job.flare) { drawFlare(g, job.flare, now); flarePin(g, job.flare, now, (F.view.x1 - F.view.x0 - 128) / innerWidth); }   // (a rescue call: they're found - server sar.js)
  for (const v of list) {
    const def = VEHICLE_BY_INDEX[v.d.m];
    if (!def) continue;
    v._own = S.pred && S.pred.air && v.id === S.ctrlId;
    const alt = altOf(v, dt), f = v.flags | 0, lift = (v._lift = v2 ? liftOf(alt) : 0);
    const on = !!(f & VF.ROTOR) && !(f & VF.WRECK);
    v._spin = Math.max(0, Math.min(1, (v._spin || 0) + (on ? dt / 3 : -dt / 6)));
    if (v._own && S.pred.s.spool !== undefined) v._spin = S.pred.s.spool;
    v._ph = ((v._ph || 0) + dt * (2 + 26 * v._spin)) % (Math.PI * 2);
    if (isPlane(def)) bankOf(v);
    // art v2's block models (art2/aircraft.js, drawn by the host this frame - H66): the model, its rotor and, low down, its
    // shadow are the renderer's; here only the shadow once it's up off the ground, and the searchlight
    const modeled = v2 && performance.now() - (v._v2at || 0) < 250;
    // the shadow: on the ground (or the roof under it), away from the sun by the height above it, fainter and softer higher up
    const fl = floorAt(S.map, v.rx, v.ry), above = Math.max(0, alt - fl), so = 3 + above * 0.42, fade = Math.max(0.25, 1 - above / 1400) * (modeled ? Math.min(1, Math.max(0, (above - 30) / 40)) : 1);
    const spot = spotOf(v, dt);
    if (spot) drawBeam(g, v, def, spot, lift, now);
    if (fade > 0.01) {
      g.save();
      g.translate(v.rx + sun.x * so, v.ry + sun.y * so - (v2 ? liftOf(fl) : 0));
      g.rotate(v.ra);
      g.globalAlpha = 0.32 * fade;
      g.fillStyle = '#000';
      silhouette(g, def, v);
      if (!isPlane(def) && v._spin > 0.55) { g.globalAlpha = 0.1 * fade; g.beginPath(); g.arc(def.L * 0.06, 0, def.rotor, 0, Math.PI * 2); g.fill(); }
      g.restore();
    }
    if (modeled) {
      // (the rotor's blurred disc stays here, over the model's mast: a canvas blends it, the renderer can only dither)
      if (!isPlane(def) && v._spin > 0.55 && !(f & VF.WRECK)) {
        const k = 1 + Math.min(0.5, alt / 1600);
        g.save(); g.translate(v.rx + Math.cos(v.ra) * def.L * 0.06, v.ry + Math.sin(v.ra) * def.L * 0.06 - lift - 50); g.rotate(v.ra); g.scale(k, k);
        rotorDisc(g, def, LIVERY[def.livery] || LIVERY.news, v, 0);
        g.restore();
      }
      continue;
    }
    // the aircraft: nearer the camera the higher it is
    const k = 1 + Math.min(0.5, alt / 1600);
    g.save();
    g.translate(v.rx, v.ry - lift);   // (art v2: up the screen by its height)
    g.rotate(v.ra);
    g.scale(k, k);
    if (f & VF.WRECK) g.filter = 'brightness(0.35)';
    if (isPlane(def)) drawPlane(g, def, v, alt, now);
    else drawHeli(g, def, v, alt, now);
    g.filter = 'none';
    g.restore();
  }
  if (job && job.hoist) drawHoist(g, job.hoist, list, dt, now, v2);
}

function silhouette(g, def, v) {
  const L = def.L;
  if (isPlane(def)) {
    const span = def.span || def.W, c = Math.cos(v.rbank ?? v._bank ?? 0);
    g.fillRect(-L / 2, -8, L, 16);
    g.fillRect(-2, -span / 2 * c, 26, span * c);
    g.fillRect(-L / 2, -26, 14, 52);
    return;
  }
  g.beginPath(); g.ellipse(L * 0.12, 0, L * 0.36, def.W * 0.42, 0, 0, Math.PI * 2); g.fill();
  g.fillRect(-L / 2, -4, L * 0.4, 8);
}

function drawHeli(g, def, v, alt, now) {
  const L = def.L, W = def.W, C = LIVERY[def.livery] || LIVERY.news, gun = !!def.missiles;
  // skids (under the body)
  g.fillStyle = '#2b2d31';
  for (const sy of [-1, 1]) g.fillRect(-L * 0.12, sy * W * 0.46 - 2, L * 0.5, 4);
  // the tail boom and the fin, the tail rotor
  g.fillStyle = C.body; g.fillRect(-L / 2 + 6, -4, L * 0.46, 8);
  g.fillStyle = C.trim; g.fillRect(-L / 2 + 2, -11, 12, 22);
  g.fillStyle = 'rgba(210,214,220,0.55)'; g.beginPath(); g.ellipse(-L / 2 + 8, 13, 10, 3, 0, 0, Math.PI * 2); g.fill();
  // stub wings and the missile pods (the gunship)
  if (gun) {
    g.fillStyle = C.dark; g.fillRect(-4, -W * 0.95, 18, W * 1.9);
    g.fillStyle = '#1b1d1f'; for (const sy of [-1, 1]) { g.fillRect(-10, sy * W * 0.82 - 5, 30, 10); g.fillStyle = '#c33'; g.fillRect(19, sy * W * 0.82 - 3, 3, 6); g.fillStyle = '#1b1d1f'; }
  }
  // the skids' struts (H66: as the art v2 models, after HE1)
  g.fillStyle = '#2b2d31';
  for (const sy of [-1, 1]) for (const x of [-L * 0.04, L * 0.2]) g.fillRect(x, sy * W * 0.3 - 1.5, 4, sy * W * 0.16 + 3 * sy);
  // the body: a rounded cabin, shaded (the light from the top left, the far side darker), the stripe, the glass at the nose
  const rx = L * (gun ? 0.33 : 0.36), ry = W * (gun ? 0.3 : 0.42);
  g.fillStyle = C.body;
  g.beginPath(); g.ellipse(L * 0.12, 0, rx, ry, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = 'rgba(0,0,0,0.22)'; g.beginPath(); g.ellipse(L * 0.12, ry * 0.25, rx * 0.96, ry * 0.75, 0, 0, Math.PI); g.fill();
  g.fillStyle = 'rgba(255,255,255,0.16)'; g.beginPath(); g.ellipse(L * 0.08, -ry * 0.35, rx * 0.7, ry * 0.4, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = C.trim; g.fillRect(-L * 0.18, -W * 0.1, L * 0.6, W * 0.2);
  if (C.bar) { g.fillStyle = C.trim; g.fillRect(-L * 0.08, -ry * 0.92, L * 0.3, ry * 0.5); g.fillRect(-L * 0.08, ry * 0.42, L * 0.3, ry * 0.5); }   // (the police one's white doors)
  g.fillStyle = C.glass; g.beginPath(); g.ellipse(L * 0.34, 0, L * 0.13, W * (gun ? 0.22 : 0.34), 0, -Math.PI / 2, Math.PI / 2); g.fill();
  if (gun) { g.fillStyle = C.glass; g.beginPath(); g.ellipse(L * 0.16, 0, L * 0.09, W * 0.18, 0, 0, Math.PI * 2); g.fill(); }
  else { g.fillStyle = C.glass; for (const sy of [-1, 1]) g.fillRect(-L * 0.06, sy * ry * 0.82 - 3, L * 0.2, 6); }   // (the cabin's side windows)
  g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(L * 0.36, -W * 0.2, 4, W * 0.12);
  // the engine housing over the cabin and its exhausts; the news camera, the police searchlight under the nose; the rescue cross
  g.fillStyle = C.dark; g.fillRect(-L * 0.06, -7, L * 0.2, 14);
  g.fillStyle = '#2b2d31'; g.fillRect(-L * 0.09, -8, 5, 4); g.fillRect(-L * 0.09, 4, 5, 4);
  if (C.cam || C.lamp) { g.fillStyle = '#25272c'; g.beginPath(); g.arc(L * 0.42, 0, 5, 0, Math.PI * 2); g.fill(); if (C.lamp) { g.fillStyle = (v.parent >>> 24) & 128 ? '#fff6d8' : '#8a8c90'; g.fillRect(L * 0.42 + 1, -2, 4, 4); } }
  if (C.cross) { g.fillStyle = '#f4f4f4'; g.fillRect(L * 0.0 - 7, -2.5, 14, 5); g.fillRect(L * 0.0 - 2.5, -7, 5, 14); }
  // the police light bar: red and blue taking turns
  if (C.bar) { const on = Math.floor(now * 6) % 2; g.fillStyle = on ? '#ff3030' : '#661010'; g.fillRect(L * 0.02, -W * 0.3, 8, 8); g.fillStyle = on ? '#1c2a66' : '#3a6cff'; g.fillRect(L * 0.02, W * 0.3 - 8, 8, 8); }
  // the mast and the main rotor: blades turning while it spools, a blurred disc once it's up to speed
  const hx = L * 0.06, R = def.rotor, s = v._spin || 0;
  g.fillStyle = '#3a3c40'; g.beginPath(); g.arc(hx, 0, 6, 0, Math.PI * 2); g.fill();
  if (s > 0.55) rotorDisc(g, def, C, v, hx);
  if (s < 0.9) {
    g.globalAlpha *= 1 - Math.max(0, (s - 0.55) / 0.35);
    g.strokeStyle = '#4a4d52'; g.lineWidth = 5; g.lineCap = 'round';
    for (let i = 0; i < 4; i++) { const a = v._ph + i * Math.PI / 2; g.beginPath(); g.moveTo(hx, 0); g.lineTo(hx + Math.cos(a) * R, Math.sin(a) * R); g.stroke(); }
    g.lineCap = 'butt';
  }
  void alt;
}

// the main rotor up to speed: a blurred disc, streaks of the blades going round, the tips' paint a ring
function rotorDisc(g, def, C, v, hx) {
  const R = def.rotor, s = v._spin || 0;
  g.fillStyle = `rgba(200,205,212,${(0.16 + 0.1 * s).toFixed(3)})`;
  g.beginPath(); g.arc(hx, 0, R, 0, Math.PI * 2); g.fill();
  g.strokeStyle = 'rgba(235,238,242,0.35)'; g.lineWidth = 2;
  for (let i = 0; i < 4; i++) { const a = v._ph * 0.5 + i * Math.PI / 2; g.beginPath(); g.arc(hx, 0, R * (0.55 + 0.1 * i), a, a + 0.5); g.stroke(); }
  g.strokeStyle = C.tip || 'rgba(255,190,60,0.45)'; g.lineWidth = 3; g.beginPath(); g.arc(hx, 0, R - 3, 0, Math.PI * 2); g.stroke();   // (the tips' paint, a ring)
}
// the plane's bank (yours from the prediction; others' from their turning): v._bank
function bankOf(v) {
  const own = v._own ? v.rbank : null;
  if (own === null || own === undefined) { const turn = v._lastA === undefined ? 0 : ((v.ra - v._lastA + 3 * Math.PI) % (2 * Math.PI)) - Math.PI; v._lastA = v.ra; v._bank = (v._bank || 0) + (Math.max(-0.75, Math.min(0.75, turn * 12)) - (v._bank || 0)) * 0.1; }
  return own ?? v._bank ?? 0;
}
function drawPlane(g, def, v, alt, now) {
  const L = def.L, span = def.span || def.W, C = LIVERY.plane;
  // the bank: the wings foreshortened, the low wing darker
  const bank = v._own && v.rbank !== undefined && v.rbank !== null ? v.rbank : v._bank ?? 0, c = Math.cos(bank);
  // the tailplane and the fin
  g.fillStyle = C.body; g.fillRect(-L / 2, -26, 16, 52);
  g.fillStyle = C.trim; g.fillRect(-L / 2, -3, 18, 6);
  // the wings (high wing: drawn over the fuselage), the near / far shading by the bank
  const half = span / 2 * c;
  g.fillStyle = bank > 0 ? '#c9ccce' : C.body; g.fillRect(-4, -half, 28, half);
  g.fillStyle = bank < 0 ? '#c9ccce' : C.body; g.fillRect(-4, 0, 28, half);
  g.fillStyle = C.trim; g.fillRect(-4, -half, 28, 6); g.fillRect(-4, half - 6, 28, 6);
  // the fuselage (shaded), the cabin's glass, the stripe, the cowling, the fin's red top
  g.fillStyle = C.body; g.beginPath(); g.ellipse(4, 0, L / 2 - 2, 10, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = 'rgba(0,0,0,0.16)'; g.beginPath(); g.ellipse(4, 3, L / 2 - 4, 7, 0, 0, Math.PI); g.fill();
  g.fillStyle = C.trim; g.fillRect(-L / 2 + 8, -2, L - 24, 4);
  g.fillStyle = C.glass; g.fillRect(24, -8, 14, 16);
  g.fillStyle = '#5a5e64'; g.fillRect(L / 2 - 12, -6, 8, 12);
  g.fillStyle = C.trim; g.fillRect(-L / 2, -2, 8, 4);
  // the wing-tip lights (red left, green right) and the beacon
  const blink = Math.floor(now * 1.5) % 2;
  g.fillStyle = '#ff3b30'; g.fillRect(6, -half, 5, 4); g.fillStyle = '#34c759'; g.fillRect(6, half - 4, 5, 4);
  if (blink) { g.fillStyle = '#ff5050'; g.fillRect(-6, -2, 4, 4); }
  // the propeller: a blur at speed, the two blades turning slowly
  const s = v._spin || 0, nx = L / 2 + 4;
  g.fillStyle = '#333'; g.fillRect(L / 2 - 2, -3, 6, 6);
  if (s > 0.4) { g.fillStyle = `rgba(190,195,200,${(0.22 + 0.2 * s).toFixed(3)})`; g.beginPath(); g.ellipse(nx, 0, 3, 18, 0, 0, Math.PI * 2); g.fill(); }
  else { g.strokeStyle = '#2d2f33'; g.lineWidth = 3; const a = v._ph; g.beginPath(); g.moveTo(nx, Math.sin(a) * 17); g.lineTo(nx, -Math.sin(a) * 17); g.stroke(); }
  void alt;
}

// The police air unit's searchlight (server policeair.js: the vehicle record's damage word's top byte - bit 7 on, bits 0-4
// the way it points, 32 steps, bits 5-6 how far from under it: 0, 170, 340, 510 px), eased; null when it's off
export function spotOf(v, dt = 0.05) {
  const b = ((v.parent >>> 0) >>> 24) & 255;
  if (!(b & 128)) { v._spot = null; return null; }
  const a = (b & 31) / 32 * Math.PI * 2, d = ((b >> 5) & 3) * 170, x = v.rx + Math.cos(a) * d, y = v.ry + Math.sin(a) * d;
  const q = v._spot || (v._spot = { x, y });
  const k = 1 - Math.exp(-5 * dt);
  q.x += (x - q.x) * k; q.y += (y - q.y) * k;
  return q;
}
// the beam from the light under its nose down to the pool on the ground (SC4-B): a pale cone, brightest at the lamp; the
// pool itself is the renderer's light (art v2: host.js, art2/aircraft.js airLights; classic: main.js's lights) - here a
// soft glow over it so it reads in daylight-dim scenes too
function drawBeam(g, v, def, q, lift, now) {
  const c = Math.cos(v.ra), s = Math.sin(v.ra), k = 1 + Math.min(0.5, (v._alt || 0) / 1600);
  const lx = v.rx + c * def.L * 0.32 * k, ly = v.ry + s * def.L * 0.32 * k - lift;
  const dx = q.x - lx, dy = q.y - ly, d = Math.hypot(dx, dy) || 1, nx = -dy / d, ny = dx / d, r = 64 + Math.sin(now * 2.1) * 4;
  g.save();
  const gr = g.createLinearGradient(lx, ly, q.x, q.y);
  gr.addColorStop(0, 'rgba(255,248,220,0.38)'); gr.addColorStop(1, 'rgba(255,248,220,0.06)');
  g.fillStyle = gr;
  g.beginPath(); g.moveTo(lx + nx * 4, ly + ny * 4); g.lineTo(q.x + nx * r, q.y + ny * r); g.lineTo(q.x - nx * r, q.y - ny * r); g.lineTo(lx - nx * 4, ly - ny * 4); g.closePath(); g.fill();
  const rg = g.createRadialGradient(q.x, q.y, 6, q.x, q.y, r * 1.4);
  rg.addColorStop(0, 'rgba(255,250,230,0.34)'); rg.addColorStop(1, 'rgba(255,250,230,0)');
  g.fillStyle = rg; g.beginPath(); g.ellipse(q.x, q.y, r * 1.4, r * 1.1, 0, 0, Math.PI * 2); g.fill();
  g.restore();
}

// the helipads' H on the ground (and on the hospitals' roofs) - the yellow ring, the white H
function drawPads(g, F, S, v2) {
  const view = F.view, af = airfields(S.map);
  for (const p of af.pads) {
    const py = p.roof && v2 ? p.y - liftOf(p.alt) : p.y;   // (art v2 stands its buildings up: a roof pad up on the drawn roof)
    if (p.x < view.x0 - 100 || p.x > view.x1 + 100 || py < view.y0 - 100 || py > view.y1 + 100) continue;
    // (art v2: an aircraft's block model standing on it is under this canvas - the pad's paint would cover it: H66)
    if (v2 && F.air.some((v) => performance.now() - (v._v2at || 0) < 1500 && Math.abs(v.rx - p.x) < FLY.PAD_R && Math.abs(v.ry - p.y) < FLY.PAD_R && (v._alt || 0) - (p.alt || 0) < 60)) continue;
    const r = FLY.PAD_R * 0.8;
    g.save(); g.translate(p.x, py);
    g.globalAlpha = 0.85;
    g.fillStyle = 'rgba(60,62,66,0.85)'; g.beginPath(); g.arc(0, 0, r + 6, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#e8b52a'; g.lineWidth = 5; g.beginPath(); g.arc(0, 0, r - 4, 0, Math.PI * 2); g.stroke();
    g.fillStyle = p.kind === 'hospital' ? '#f2f2f2' : '#f2f2f2';
    g.fillRect(-18, -24, 9, 48); g.fillRect(9, -24, 9, 48); g.fillRect(-9, -4, 18, 8);
    if (p.kind === 'hospital') { g.fillStyle = '#d8382e'; g.fillRect(r - 22, -r + 10, 12, 4); g.fillRect(r - 18, -r + 6, 4, 12); }
    g.restore();
  }
}

// ---- search and rescue (server sar.js; the job target's flare and hoist) ------------------------------------------------
// The smoke flare by someone found out in the wild: a red glow on the ground and orange smoke rising, drifting off.
function drawFlare(g, [x, y], now) {
  g.save();
  for (let i = 0; i < 14; i++) {
    const ph = (now * 0.32 + i / 14) % 1, r = 8 + ph * 44;
    g.globalAlpha = (1 - ph) * 0.72;
    g.fillStyle = i % 3 ? '#ff7a3c' : '#ffa060';
    g.beginPath(); g.arc(x + ph * 80 + Math.sin(now * 1.3 + i * 2.1) * 9 * ph, y - ph * 170, r, 0, Math.PI * 2); g.fill();
  }
  g.globalAlpha = 0.25; g.fillStyle = '#ff3020'; g.beginPath(); g.arc(x, y, 16, 0, Math.PI * 2); g.fill();
  g.globalAlpha = 0.7 + 0.3 * Math.sin(now * 23); g.beginPath(); g.arc(x, y, 4, 0, Math.PI * 2); g.fill();
  g.restore();
}
// Its marker (U17): a round pin over it - the dark disc in a red ring, a lit flare inside, the point down to it; u = 1 / zoom
function flarePin(g, [x, y], now, u) {
  const r = 15 * u, cy = y - 46 * u - r + Math.sin(now * 3) * 2 * u;
  g.save();
  g.fillStyle = '#070b16'; g.beginPath(); g.arc(x, cy, r + 2.5 * u, 0, Math.PI * 2); g.moveTo(x - 9 * u, cy + r * 0.7); g.lineTo(x, cy + r + 12 * u); g.lineTo(x + 9 * u, cy + r * 0.7); g.fill();
  g.fillStyle = '#ff4a3a'; g.beginPath(); g.arc(x, cy, r, 0, Math.PI * 2); g.moveTo(x - 7 * u, cy + r * 0.7); g.lineTo(x, cy + r + 9 * u); g.lineTo(x + 7 * u, cy + r * 0.7); g.fill();
  g.fillStyle = '#1a1420'; g.beginPath(); g.arc(x, cy, r - 3 * u, 0, Math.PI * 2); g.fill();
  g.translate(x, cy); g.rotate(0.6);   // (the flare: a red stick, its cap, a flame off the top)
  g.fillStyle = '#e8302a'; g.fillRect(-2.2 * u, -4 * u, 4.4 * u, 12 * u); g.fillStyle = '#5a0f12'; g.fillRect(-2.2 * u, 5 * u, 4.4 * u, 3 * u);
  const fl = 1 + 0.15 * Math.sin(now * 19);
  g.fillStyle = '#ff9a2e'; g.beginPath(); g.ellipse(0, -7 * u, 3.6 * u, 4.6 * u * fl, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#fff2a0'; g.beginPath(); g.ellipse(0, -6.5 * u, 1.8 * u, 2.6 * u * fl, 0, 0, Math.PI * 2); g.fill();
  g.restore();
}
// The harness: [the helicopter's id, the cable paid out (px), clipped on, where they are]. Seen from above, the cable
// hangs out of the side door, its drawn length growing as it pays out (reaching for them when they're beside it); its
// yellow harness ring at the end - them hanging in it, swaying, once they're clipped on and winched up.
function drawHoist(g, h, list, dt, now, v2 = false) {
  const v = list.find((q) => q.id === h[0]), def = v && VEHICLE_BY_INDEX[v.d.m];
  if (!def) return;
  const alt = altOf(v, 0), k = 1 + Math.min(0.5, alt / 1600), c = Math.cos(v.ra), s = Math.sin(v.ra);
  const dx = v.rx + (c * def.L * 0.1 - s * def.W * 0.5) * k, dy = v.ry - (v._lift || 0) + (s * def.L * 0.1 + c * def.W * 0.5) * k;
  v._cable = v._cable === undefined ? h[1] : v._cable + (h[1] - v._cable) * Math.min(1, dt * 8);
  const len = v2 ? 6 + liftOf(alt) - liftOf(alt - v._cable) : 8 + v._cable * 0.4;   // (art v2: straight down the screen, as far as it's come down)
  let ax = v2 ? 0 : -s, ay = v2 ? 1 : c;
  if (!h[2] && !v2) { const tx = h[3] - dx, ty = h[4] - dy, d = Math.hypot(tx, ty); if (d > 1 && d < len * 1.6) { ax = tx / d; ay = ty / d; } }
  const sw = Math.sin(now * 2.3) * (h[2] ? 0.18 : 0.08) * (v2 ? 0.3 : 1), ex = dx + (ax * Math.cos(sw) - ay * Math.sin(sw)) * len, ey = dy + (ay * Math.cos(sw) + ax * Math.sin(sw)) * len;
  g.save();
  g.strokeStyle = 'rgba(0,0,0,0.3)'; g.lineWidth = 3; g.beginPath(); g.moveTo(dx + 6, dy + 8); g.lineTo(ex + 6 + len * 0.3, ey + 8 + len * 0.3); g.stroke();   // (its shadow)
  g.strokeStyle = '#202226'; g.lineWidth = 2.2; g.beginPath(); g.moveTo(dx, dy); g.lineTo(ex, ey); g.stroke();
  g.fillStyle = '#3a3c40'; g.fillRect(dx - 4, dy - 4, 8, 8);   // (the winch arm over the door)
  if (h[2]) {   // them, in the harness: arms up on the strop, legs dangling, the yellow sling round them
    g.strokeStyle = '#2c3440'; g.lineWidth = 4; g.lineCap = 'round';
    g.beginPath(); g.moveTo(ex - 4, ey + 14); g.lineTo(ex - 5, ey + 26 + Math.sin(now * 3) * 2); g.moveTo(ex + 4, ey + 14); g.lineTo(ex + 5, ey + 26 - Math.sin(now * 3) * 2); g.stroke();
    g.strokeStyle = '#3d6fb5'; g.beginPath(); g.moveTo(ex - 7, ey + 2); g.lineTo(ex - 3, ey - 9); g.moveTo(ex + 7, ey + 2); g.lineTo(ex + 3, ey - 9); g.stroke();
    g.lineCap = 'butt';
    g.fillStyle = '#3d6fb5'; g.beginPath(); g.ellipse(ex, ey + 6, 8, 11, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#e2b48c'; g.beginPath(); g.arc(ex, ey - 6, 6, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#ffd21f'; g.lineWidth = 3; g.beginPath(); g.ellipse(ex, ey + 6, 10, 6, 0, 0, Math.PI * 2); g.stroke();
  } else { g.strokeStyle = '#ffd21f'; g.lineWidth = 3; g.beginPath(); g.arc(ex, ey, 6, 0, Math.PI * 2); g.stroke(); }
  g.restore();
}
