// Vehicle damage you can see (task #402), the parts the page loads only once a vehicle is damaged: the plasma blade's
// cut (the 'vcut' event: a burst of molten sparks along the cut, glowing drips), the parts that fall off as it gets
// worse (the 'vpart' event: a bumper, the bonnet - thrown off and left lying, in its own paint), and the classic view's
// damage drawn on the car: scrapes and dents on the sides it was hit, a cracked windscreen, a crumpled end, a bumper
// gone, a door hanging open, bullet holes and the cut - every mark in its place, nothing sprinkled over it.
// The server decides it all (server/systems/vehicles.js); its word arrives as a vehicle's parent field
// (shared/vehicles.js packVehDamage). Art v2 draws the same damage into the voxel model (art2/vehicles.js applyDamage).
import { unpackVehDamage, VEHICLE_BY_INDEX, PAINTS, VPART, VZ } from '../../shared/vehicles.js';
import { pieceStrip, PIECE_RECT } from './boom.js';

const TAU = Math.PI * 2;
const PART_PIECE = { [VPART.BUMPER_F]: 'b', [VPART.BUMPER_B]: 'b', [VPART.BONNET]: 'h', [VPART.DOOR_L]: 'd', [VPART.DOOR_R]: 'd', [VPART.WHEEL]: 'w' };

export function vdmg(boom, ev, now) {
  if (!ev) return;
  const S = boom.S, fx = S.fx;
  if (ev.e === 'vcut') {
    // molten sparks sprayed both ways along the cut, a few glowing drips that fall and cool, a hot flash
    const e = S.ents.get(ev.id), def = e && e.d ? VEHICLE_BY_INDEX[e.d.m] : null, W = def ? def.W : 48, L = def ? def.L : 100;
    const c = Math.cos(ev.a || 0), s = Math.sin(ev.a || 0), along = ((ev.c || 128) - 1) / 254 * L - L / 2;
    const cx = ev.x + c * along, cy = ev.y + s * along;
    for (let i = 0; i < 26; i++) {
      const t = (Math.random() - 0.5) * W, x = cx - s * t, y = cy + c * t, side = Math.random() < 0.5 ? -1 : 1, sp = 60 + Math.random() * 200;
      fx.spawn(4, x, y, c * side * sp + (Math.random() - 0.5) * 60, s * side * sp + (Math.random() - 0.5) * 60, 0.4 + Math.random() * 0.5, 2, Math.random() < 0.5 ? '#ffb24a' : '#fff0b0', 0, 80 + Math.random() * 160);
    }
    for (let i = 0; i < 8; i++) { const t = (Math.random() - 0.5) * W; fx.spawn(10, cx - s * t, cy + c * t, (Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30, 1.2 + Math.random(), 1.6, '#ff8a2a', 0, 20 + Math.random() * 40); }
    S.flashes.push({ x: cx, y: cy, t: 0.35, r: 180, kind: 'boom' });
    return;
  }
  if (ev.e === 'vpart') {
    const e = S.ents.get(ev.id), p = PIECE_RECT[PART_PIECE[ev.k] || 'p'], paint = PAINTS[((((e && e.d && e.d.p) | 0) % PAINTS.length) + PAINTS.length) % PAINTS.length] || '#777';
    const [sx, w, h] = p;
    fx.chunk(pieceStrip(paint), sx, 0, w, h, w * 1.3, h * 1.3, ev.x, ev.y, ev.vx || 0, ev.vy || 0, 90 + Math.random() * 60, (Math.random() - 0.5) * 9, 24);
    fx.sparks(ev.x, ev.y, 6);
  }
}

// The classic view: the damage drawn over the car in its own frame (+x its nose, +y its right side), from its word.
export function classic(g, v, def) {
  const D = unpackVehDamage(v.parent >>> 0), st = D.stage;
  if ((!st && !D.holes && !D.cut) || def.kind === 'boat' || st >= 5) return;
  const L = def.L, W = def.W, hl = L / 2, hw = W / 2, Z = D.zones || (st ? VZ.F : 0), id = v.id | 0;
  const h = (n) => (((id * 2654435761 + n * 40503) >>> 0) % 1000) / 1000;
  g.save();
  g.lineCap = 'round';
  // scrapes: pale streaks along the hit sides
  if (st >= 1) {
    g.strokeStyle = 'rgba(235,235,230,.55)'; g.lineWidth = 1;
    for (let n = 0; n < 3; n++) {
      const x0 = -hl * 0.7 + h(n) * L * 0.6, len = L * (0.12 + h(n + 9) * 0.15);
      if (Z & VZ.L) { g.beginPath(); g.moveTo(x0, -hw + 1.5 + n); g.lineTo(x0 + len, -hw + 2 + n); g.stroke(); }
      if (Z & VZ.R) { g.beginPath(); g.moveTo(x0, hw - 1.5 - n); g.lineTo(x0 + len, hw - 2 - n); g.stroke(); }
    }
  }
  // dents: dark crescents pushed into the hit sides; a crumpled end: a jagged dark bite with folds across it
  if (st >= 2) {
    const deep = st >= 3 ? 9 : 4;
    g.fillStyle = 'rgba(20,20,24,.55)';
    for (const [z, sx] of [[VZ.F, 1], [VZ.B, -1]]) {
      if (!(Z & z)) continue;
      g.beginPath(); g.moveTo(sx * hl, -hw);
      for (let k = 0; k <= 6; k++) g.lineTo(sx * (hl - deep * (0.5 + 0.5 * h(k + z * 7))), -hw + (W * k) / 6);
      g.lineTo(sx * hl, hw); g.closePath(); g.fill();
      if (st >= 3) { g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 1; for (let k = 1; k < 4; k++) { const x = sx * (hl - deep - k * 4); g.beginPath(); g.moveTo(x, -hw * 0.7); g.lineTo(x + sx * 2, 0); g.lineTo(x, hw * 0.7); g.stroke(); } }
    }
    for (const [z, sy] of [[VZ.L, -1], [VZ.R, 1]]) {
      if (!(Z & z)) continue;
      const c = -hl * 0.1 + (h(z) - 0.5) * L * 0.2, span = L * (st >= 3 ? 0.24 : 0.15), d = st >= 3 ? 5 : 3;
      g.beginPath(); g.moveTo(c - span, sy * hw); g.quadraticCurveTo(c, sy * (hw - d * 2), c + span, sy * hw); g.closePath(); g.fill();
    }
    // the windscreen cracked: a star of fine lines
    g.strokeStyle = 'rgba(230,240,250,.8)'; g.lineWidth = 0.7;
    const wx = hl * 0.28, wy = (h(3) - 0.5) * W * 0.4;
    for (let k = 0; k < 6; k++) { const a = (k / 6) * TAU + h(k + 20); g.beginPath(); g.moveTo(wx, wy); g.lineTo(wx + Math.cos(a) * 6, wy + Math.sin(a) * 9); g.stroke(); }
  }
  // the parts gone: a bumper (the end dark), the bonnet (the engine showing); a door hanging open off the side
  g.fillStyle = '#1a1a1c';
  if (D.off & VPART.BUMPER_F) g.fillRect(hl - 3, -hw + 3, 3, W - 6);
  if (D.off & VPART.BUMPER_B) g.fillRect(-hl, -hw + 3, 3, W - 6);
  if (D.off & VPART.BONNET) { g.fillStyle = '#3a3a3e'; g.fillRect(hl * 0.45, -hw + 5, hl * 0.42, W - 10); g.fillStyle = '#25252a'; for (let k = 0; k < 3; k++) g.fillRect(hl * 0.5 + k * 6, -hw + 8, 4, W - 16); }
  for (const [bit, sy] of [[VPART.DOOR_L, -1], [VPART.DOOR_R, 1]]) {
    if (!(D.off & bit)) continue;
    g.save(); g.translate(hl * 0.25, sy * hw); g.rotate(sy * 0.55);
    g.fillStyle = PAINTS[((v.d.p | 0) % PAINTS.length + PAINTS.length) % PAINTS.length] || '#777'; g.fillRect(-L * 0.22, sy > 0 ? 0 : -3, L * 0.22, 3);
    g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(-L * 0.22, sy > 0 ? 2 : -3, L * 0.22, 1);
    g.restore();
    g.fillStyle = '#141416'; g.fillRect(-L * 0.0, sy > 0 ? hw - 2 : -hw, L * 0.22, 2);
  }
  // bullet holes: dark pits with a pale rim
  for (let n = 0; n < D.holes * 3; n++) {
    const x = (h(n + 40) - 0.5) * L * 0.8, y = (h(n + 70) - 0.5) * W * 0.8;
    g.fillStyle = 'rgba(230,230,225,.6)'; g.beginPath(); g.arc(x, y, 1.6, 0, TAU); g.fill();
    g.fillStyle = '#0c0c0e'; g.beginPath(); g.arc(x, y, 1, 0, TAU); g.fill();
  }
  // cut in two: a glowing line across where the blade went through
  if (D.cut) {
    const x = ((D.cut - 1) / 254) * L - hl;
    g.strokeStyle = 'rgba(20,12,8,.9)'; g.lineWidth = 3; g.beginPath(); g.moveTo(x, -hw - 1); g.lineTo(x + 2, hw + 1); g.stroke();
    g.strokeStyle = v.flags & 16 ? 'rgba(90,60,40,.9)' : 'rgba(255,150,60,.95)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(x, -hw - 1); g.lineTo(x + 2, hw + 1); g.stroke();
  }
  g.restore();
}
