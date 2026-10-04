// 3/4-view characters (the concept-art look): people stand upright on screen and face one of
// 8 directions - you see faces from the front, backs of heads from behind, profiles from the
// side. Painted procedurally on a 32x44 art grid from the same appearance record the server
// sends (skin, hair, top, bottoms, shoes, headwear, extras), with 3-tone shading, light from the
// top-left and a dark outline. Five directions are painted (S, SW, W, NW, N); the other three
// are mirrors. Animation is part-based: legs, arms, body and head move per frame, so every
// outfit gets idle, walk, run, punch, melee swing, aim, carry and fishing in all directions.
// Placeholder art until the drawn rig (docs: Art Overhaul Plan) replaces it; cached per
// appearance + direction + pose + frame.

export const CW = 32, CH = 44;          // art grid
export const FOOT_Y = 42;               // the feet's ground line in art px
export const SKINS = ['#f1c9a5', '#e0ac7e', '#c68953', '#a86b3c', '#7d4a26', '#4f2f1a'];
export const OUTLINE = '#1a1220';

export function hex(c) {
  if (!c) return '#888888';
  if (c.length === 4) return '#' + c[1] + c[1] + c[2] + c[2] + c[3] + c[3];
  return c;
}
export function tone(c, amt) {
  const n = parseInt(hex(c).slice(1), 16);
  const f = (v) => Math.max(0, Math.min(255, Math.round(amt >= 0 ? v + (255 - v) * amt : v * (1 + amt))));
  return `#${((f(n >> 16) << 16) | (f((n >> 8) & 255) << 8) | f(n & 255)).toString(16).padStart(6, '0')}`;
}
export const hi = (c) => tone(c, 0.3), lo = (c) => tone(c, -0.3), dk = (c) => tone(c, -0.5);

export class P {
  constructor(g) { this.g = g; }
  p(x, y, c) { if (x < 0 || y < 0 || x >= CW || y >= CH) return; this.g.fillStyle = c; this.g.fillRect(Math.round(x), Math.round(y), 1, 1); }
  r(x, y, w, h, c) { if (w <= 0 || h <= 0) return; this.g.fillStyle = c; this.g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); }
  // shaded ellipse (light from the top-left)
  blob(cx, cy, rx, ry, c, clip = null) {
    for (let y = Math.floor(cy - ry - 1); y <= Math.ceil(cy + ry); y++)
      for (let x = Math.floor(cx - rx - 1); x <= Math.ceil(cx + rx); x++) {
        const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry, d = dx * dx + dy * dy;
        if (d > 1 || (clip && !clip(x, y, dx, dy))) continue;
        const l = -dx * 0.55 - dy * 0.8;
        this.p(x, y, l > 0.5 && d > 0.12 ? hi(c) : l < -0.42 && d > 0.3 ? lo(c) : c);
      }
  }
  // a rounded, shaded box (torsos, legs, arms)
  box(x, y, w, h, c, shadeRight = true) {
    if (w <= 0 || h <= 0) return;
    this.r(x, y, w, h, c);
    this.r(x, y, 1, h, hi(c));
    if (shadeRight) this.r(x + w - 1, y, 1, h, lo(c));
    this.r(x, y + h - 1, w, 1, lo(c));
  }
  line(x0, y0, ang, len, c, w = 1) {
    for (let i = 0; i <= len; i++) {
      const x = x0 + Math.cos(ang) * i, y = y0 + Math.sin(ang) * i;
      this.p(x, y, c);
      if (w > 1) this.p(x - Math.sin(ang), y + Math.cos(ang), c);
    }
  }
}

// facing vectors (screen) for the 5 painted directions
const DIRV = [[0, 1], [-0.75, 0.66], [-1, 0], [-0.75, -0.66], [0, -1]];
const FRONT = (d) => d <= 1, BACK = (d) => d >= 3;

// ---- weapons (art px, held at hx,hy pointing along ang) ------------------------------------
export function weapon(Pp, w, hx, hy, ang) {
  const L = (len, c, wid = 1) => Pp.line(hx, hy, ang, len, c, wid);
  const back = (len, c, wid = 2) => Pp.line(hx - Math.cos(ang) * len, hy - Math.sin(ang) * len, ang, len, c, wid);
  switch (w) {
    case 1: L(11, '#b8864a', 2); Pp.line(hx, hy, ang, 2, '#5a3a1a', 2); break;                 // bat
    case 2: L(5, '#d8dde2'); break;                                                               // knife
    case 3: L(9, '#c8262b'); break;                                                               // crowbar
    case 4: L(10, '#6b4a2a'); Pp.line(hx + Math.cos(ang) * 10 - Math.cos(ang + 1.57) * 2, hy + Math.sin(ang) * 10 - Math.sin(ang + 1.57) * 2, ang + 1.57, 4, '#6a6e76', 2); break; // sledge
    case 5: L(9, '#16161a', 2); break;                                                            // baton
    case 6: L(4, '#f2c21b', 2); break;                                                            // taser
    case 7: case 14: L(5, w === 14 ? '#14161c' : '#2a2a30', 2); break;                            // pistols
    case 8: L(6, '#3a3a40', 2); break;                                                            // revolver
    case 19: L(5, '#2a2a30', 2); Pp.line(hx + Math.cos(ang) * 5, hy + Math.sin(ang) * 5, ang, 4, '#55585f', 2); break; // silenced
    case 9: case 18: back(3, '#6b4a2a'); L(9, '#3a3a40', 2); break;                               // shotguns
    case 10: case 15: case 17: back(4, '#2a2a30'); L(11, '#2a2a30', 2); break;                    // rifles
    case 16: back(4, '#3a3f2a'); L(14, '#22252c', 2); break;                                      // marksman
    case 11: L(6, '#1e1e24', 2); break;                                                           // smg
    case 12: back(5, '#4a5a2a'); L(10, '#4a5a2a', 2); break;                                      // bazooka
    case 13: L(14, '#3a2a1a'); break;                                                             // rod
    default: break;
  }
}

// ---- body parts -------------------------------------------------------------------------------
function legs(Pp, a, d, ph, amp, run) {
  const pants = hex(a.l || '#334'), shoes = hex(a.sh || '#222'), skin = SKINS[a.s ?? 1];
  const dress = a.t === 5;
  const legC = dress ? skin : pants;
  const s = Math.sin(ph);
  if (d === 2) { // profile: the legs scissor
    const st = Math.round(s * amp * 1.6);
    for (const [k, col] of [[-1, lo(legC)], [1, legC]]) {
      const off = st * k;
      Pp.box(14 + off, 34, 4, 6, col);
      Pp.r(12 + off, 40, 6, 2, k > 0 ? shoes : lo(shoes)); Pp.p(12 + off, 40, hi(shoes));
    }
    return;
  }
  const narrow = d === 1 || d === 3;
  const lx = narrow ? 12 : 11, rx = narrow ? 17 : 17;
  const liftL = Math.max(0, s) * amp, liftR = Math.max(0, -s) * amp;
  const back = BACK(d);
  for (const [x, lift, near] of [[lx, liftL, d === 1 || d === 3 ? 0 : 1], [rx, liftR, 1]]) {
    const hgt = 6 - Math.round(lift * 0.6);
    Pp.box(x, 34, 5, hgt, near ? legC : lo(legC));
    const fy = 34 + hgt;
    Pp.r(x - (d === 1 ? 1 : 0), fy, 5 + (d === 1 || d === 3 ? 1 : 0), 2, shoes);
    if (!back) Pp.p(x, fy, hi(shoes));
  }
  if (dress) { Pp.blob(16, 33, 7, 4, lo(hex(a.tc))); }
}

function torso(Pp, a, d, bob) {
  const c = hex(a.tc || '#888'), c2 = hex(a.tc2 || '#ddd'), skin = SKINS[a.s ?? 1];
  const side = d === 2, three = d === 1 || d === 3;
  const x = side ? 12 : three ? 10 : 9, w = side ? 9 : three ? 12 : 14;
  const y = 20 + bob;
  if (a.t === 7) Pp.blob(16, y + 6, w / 2 + 2, 8, hi(c));       // fur coat bulk
  if (a.t === 5) Pp.blob(16, y + 11, w / 2 + 2, 5, lo(c));      // dress flare
  Pp.box(x, y, w, 13, c);
  Pp.r(x + 1, y, w - 2, 1, hi(c));
  // belt / waist
  if (a.t !== 5 && a.t !== 7) Pp.r(x, y + 12, w, 2, hex(a.l || '#334'));
  if (BACK(d)) {
    if (a.t === 2) Pp.blob(16, y + 1, 4, 3, lo(c));             // hood down the back
    if (a.t === 6) Pp.r(x + 2, y + 3, w - 4, 2, c2);            // uniform back band
    if (a.t === 3) { Pp.r(x, y + 4, w, 1, c2); Pp.r(x, y + 9, w, 1, c2); }
    return;
  }
  const mid = side ? x + 2 : x + w / 2;
  switch (a.t) {
    case 0: Pp.r(mid - 2, y, 4, 2, skin); break;                                   // tee: neckline
    case 1: Pp.r(mid - 1, y, 3, 6, '#f0f0ec'); Pp.r(mid, y + 1, 1, 6, c2); break;   // suit: shirt + tie
    case 2: Pp.r(mid - 3, y, 6, 2, lo(c)); Pp.r(mid - 1, y + 2, 1, 4, c2); Pp.r(mid + 1, y + 2, 1, 4, c2); Pp.r(x + 2, y + 7, w - 4, 3, lo(c)); break; // hoodie
    case 3: Pp.r(x, y + 4, w, 2, c2); Pp.r(x, y + 9, w, 1, c2); if (!side) { Pp.r(mid - 1, y, 2, 12, c2); } break; // hi-vis vest
    case 4: for (let k = 2; k < 12; k += 3) Pp.p(mid, y + k, c2); break;            // cardigan buttons
    case 6: Pp.p(mid + 3, y + 3, c2); Pp.p(mid + 3, y + 4, hi(c2)); Pp.r(x, y, 3, 1, c2); Pp.r(x + w - 3, y, 3, 1, c2); break; // uniform badge
    case 7: for (let k = 0; k < 12; k += 2) { Pp.p(mid - 3, y + k, '#fff6e0'); Pp.p(mid + 2, y + k, '#fff6e0'); } break;
    default: break;
  }
  if (a.b === 3) Pp.box(side ? x + w - 3 : x + w - 4, y + 9, 4, 4, '#555');            // tool bag
}

// arm from the shoulder; dx/dy = hand offset; returns the hand position
function arm(Pp, a, sx, sy, dx, dy, far) {
  const c = hex(a.tc || '#888'), skin = SKINS[a.s ?? 1];
  const bare = a.t === 0 || a.t === 5;
  const steps = Math.max(Math.abs(dx), Math.abs(dy), 1);
  const col = far ? lo(bare ? skin : c) : bare ? skin : c;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps, x = sx + dx * t, y = sy + dy * t;
    const sleeve = !bare && t < 0.75;
    Pp.r(x - 1, y - 1, 3, 3, sleeve ? col : far ? lo(skin) : skin);
  }
  const hx = sx + dx, hy = sy + dy;
  Pp.r(hx - 1, hy - 1, 3, 3, far ? lo(skin) : skin);
  Pp.p(hx - 1, hy - 1, hi(skin));
  return { hx, hy };
}

function head(Pp, a, d, bob) {
  const skin = SKINS[a.s ?? 1], hair = hex(a.hc || '#2a1a10');
  const cx = d === 2 ? 15 : 16, cy = 12 + bob;
  const hs = a.h ?? 0, ht = a.ht || 0;
  // back-of-head hair mass first (long hair falls behind)
  if (ht === 0 && (hs === 2 || hs === 5) && !BACK(d)) Pp.blob(cx + (d === 2 ? 2 : 0), cy + 4, 8, 7, lo(hair));
  Pp.blob(cx, cy, 8, 8, skin);
  if (BACK(d)) {
    // seen from behind: hair everywhere (bald: a skin dome with an ear)
    if (hs !== 3 || ht) Pp.blob(cx, cy - (hs === 1 ? 1 : 0), 8.4, 8.2, hair, (x, y, dx, dy) => dy < (hs === 2 || hs === 5 ? 1.2 : 0.75));
    if (hs === 2 && !ht) Pp.blob(cx, cy + 6, 6, 5, hair);                 // long hair down the back
    if (hs === 5 && !ht) Pp.blob(cx, cy - 7, 3, 2.5, hair);               // bun
    if (d === 3) Pp.r(cx - 8, cy, 2, 3, skin);                            // ear / cheek peeking out
  } else {
    // face: eyes, brows, a hint of mouth, shifted toward the facing side
    const fx = d === 0 ? 0 : d === 1 ? -2 : -4;
    const eye = '#20161a';
    if (d === 2) { Pp.r(cx - 5, cy + 1, 2, 2, eye); Pp.p(cx - 8, cy + 2, lo(skin)); Pp.r(cx - 5, cy + 5, 2, 1, lo(skin)); }
    else {
      Pp.r(cx - 4 + fx, cy + 1, 2, 3, eye); Pp.r(cx + 2 + fx + (d === 1 ? -1 : 0), cy + 1, 2, 3, eye);
      Pp.p(cx - 4 + fx, cy + 1, '#ffffff'); Pp.p(cx + 2 + fx + (d === 1 ? -1 : 0), cy + 1, '#ffffff');
      Pp.r(cx - 1 + fx, cy + 5, 2, 1, lo(skin));
    }
    if (a.bandana) Pp.r(cx - 7, cy + 3, 14, 4, '#c8262b');
    // hair on top / sides
    if (hs !== 3 && !ht) {
      const fringe = hs === 1 ? 2 : hs === 4 ? 0 : 1;
      Pp.blob(cx, cy - 2, 8.4, 6.5, hair, (x, y, dx, dy) => dy < -0.15 + fringe * 0.12 || (d === 2 ? dx > 0.1 : (dx < -0.78 || dx > 0.78) && dy < 0.6));
      if (hs === 4) { Pp.r(cx - 1, cy - 11, 3, 4, hair); Pp.p(cx, cy - 12, hi(hair)); } // mohawk
      if (hs === 5) Pp.blob(cx + (d === 2 ? 3 : 0), cy - 8, 3, 2.5, hair);              // bun
      if (hs === 2) { Pp.r(cx - 9, cy, 2, 9, hair); if (d !== 2) Pp.r(cx + 7, cy, 2, 9, hair); }
      Pp.p(cx - 3, cy - 6, hi(hair)); Pp.p(cx - 2, cy - 6, hi(hair));
    }
    if (a.b === 4) { Pp.r(cx - 6 + fx, cy + 1, 12, 2, '#14161a'); }      // sunglasses (extra)
  }
  // headwear (every direction)
  if (ht) {
    const hc = hex(a.htc || '#222');
    const fwd = DIRV[d];
    if (ht === 1) { // cap with the brim pointing where they face
      Pp.blob(cx, cy - 3, 8.2, 5.5, hc, (x, y, dx, dy) => dy < 0.5);
      if (!BACK(d)) Pp.r(cx - 6 + fwd[0] * 5, cy - 1, d === 2 ? 7 : 12, 2, lo(hc));
      else Pp.r(cx - 2, cy + 1, 4, 1, lo(hc));
    } else if (ht === 2) { Pp.blob(cx, cy - 3, 8.6, 6, hc, (x, y, dx, dy) => dy < 0.55); Pp.r(cx - 9, cy, 18, 2, lo(hc)); Pp.p(cx - 3, cy - 7, '#ffffff'); } // hard hat
    else if (ht === 3) { Pp.blob(cx, cy - 1, 11, 4, lo(hc)); Pp.blob(cx, cy - 4, 6, 4, hc); }                                                         // sun hat
    else if (ht === 4) { Pp.blob(cx, cy - 3, 8.4, 6.2, hc, (x, y, dx, dy) => dy < 0.4); for (let y = cy - 7; y <= cy; y += 2) Pp.r(cx - 7, y, 14, 1, lo(hc)); } // beanie
    else if (ht === 5) { Pp.blob(cx, cy - 2, 8.8, 7, hc, (x, y, dx, dy) => dy < 0.6); if (!BACK(d)) Pp.r(cx - 6 + fwd[0] * 3, cy + 1, d === 2 ? 5 : 12, 3, '#5a7a9a'); } // SWAT helmet + visor
  }
  if (a.b === 2) Pp.r(cx + 6, cy + 7, 2, 8, '#c8262b');                   // purse strap
}

// ---- pose composer -------------------------------------------------------------------------------
// pose: idle, move0..move3 (stroll..sprint), punch, swing, aim, carry, fish
function paint(Pp, a, d, pose, fr, w) {
  const lvl = pose.startsWith('move') ? Number(pose[4]) || 0 : -1;
  const ph = ((fr & 7) * Math.PI) / 4;
  const amp = lvl >= 0 ? [1.2, 1.8, 2.4, 3.2][lvl] : pose === 'carry' ? 1.2 : 0;
  const run = lvl >= 2;
  const bob = lvl >= 0 ? -Math.round(Math.abs(Math.sin(ph)) * (run ? 1.5 : 0.8)) : pose === 'idle' && (fr & 4) ? -1 : 0;
  const fv = DIRV[d];
  const side = d === 2, back = BACK(d);
  // shoulders
  const sL = side ? [15, 22 + bob] : [d === 1 || d === 3 ? 9 : 8, 22 + bob];
  const sR = side ? [17, 22 + bob] : [d === 1 || d === 3 ? 23 : 24, 22 + bob];
  const swing = lvl >= 0 ? Math.sin(ph) * amp * 1.4 : 0;
  // what each hand does
  let lh, rh, held = null;
  const aimAng = Math.atan2(fv[1] * 0.8, fv[0]);
  const reachTo = (len) => [Math.round(fv[0] * len), Math.round(fv[1] * len * 0.55) + 1];
  if (pose === 'aim' || pose === 'fish') {
    const [dx, dy] = reachTo(8);
    rh = { dx, dy }; lh = side ? { dx: dx - 1, dy: dy + 1 } : { dx: Math.round(dx * 0.7) + 3, dy };
    held = { w: pose === 'fish' ? 13 : w, ang: pose === 'fish' ? aimAng - 0.6 * Math.sign(fv[0] || 1) : aimAng };
  } else if (pose === 'punch') {
    const f = fr & 3, ext = [1, 6, 9, 4][f], left = (fr >> 2) === 1;
    const [dx, dy] = reachTo(ext);
    if (left) { lh = { dx, dy }; rh = { dx: 0, dy: 8 }; } else { rh = { dx, dy }; lh = { dx: 0, dy: 8 }; }
  } else if (pose === 'swing') {
    const f = fr & 3, sw = [-1.4, -0.5, 0.5, 1.3][f] * ((fr >> 2) ? -1 : 1);
    const ang = aimAng + sw;
    rh = { dx: Math.round(Math.cos(ang) * 7), dy: Math.round(Math.sin(ang) * 4) + 2 };
    lh = { dx: 0, dy: 8 };
    held = { w, ang };
  } else if (pose === 'carry') {
    const [dx, dy] = reachTo(6);
    lh = { dx: side ? dx : dx + 3, dy: dy - 3 }; rh = { dx: side ? dx : dx - 3, dy: dy - 3 };
  } else {
    // arms hang and swing with the stride
    if (side) { lh = { dx: Math.round(-swing), dy: 8 }; rh = { dx: Math.round(swing), dy: 8 }; }
    else { lh = { dx: -1, dy: 8 - Math.round(Math.max(0, swing)) }; rh = { dx: 1, dy: 8 - Math.round(Math.max(0, -swing)) }; }
    if (w > 0 && w !== 13) held = { w, ang: w <= 6 ? Math.PI / 2 + (side ? -0.4 * Math.sign(fv[0]) : 0.3) : aimAng + (side ? 0 : 0.6) }; // carried low
  }
  const drawArm = (which) => {
    const s = which === 'l' ? sL : sR, h = which === 'l' ? lh : rh;
    const far = side ? which === 'r' : false;
    const res = arm(Pp, a, s[0], s[1], h.dx, h.dy, far);
    if (which === 'r' && held && held.w) weapon(Pp, held.w, res.hx, res.hy, held.ang);
    if (which === 'r' && a.b === 1 && pose !== 'aim' && pose !== 'carry') Pp.box(res.hx - 2, res.hy + 1, 5, 4, '#3a2414'); // briefcase
  };
  // draw order: far side of the body first (profile: the far arm; from behind: the head
  // covers whatever is held up in front)
  if (side) drawArm('r');
  legs(Pp, a, d, ph, run ? amp : amp * 0.9, run);
  torso(Pp, a, d, bob);
  if (back) { drawArm('l'); drawArm('r'); head(Pp, a, d, bob); }
  else { head(Pp, a, d, bob); drawArm('l'); if (!side) drawArm('r'); }
}

// ---- cache ------------------------------------------------------------------------------------------
const art = typeof document !== 'undefined' ? document.createElement('canvas') : null;
if (art) { art.width = CW; art.height = CH; }
const cache = new Map();
const appKey = (a) => (a ? `${a.s}${a.h}${a.hc}${a.t}${a.tc}${a.tc2}${a.l}${a.sh}${a.ht}${a.htc}${a.b}${a.bandana ? 1 : 0}` : 'x');

// world angle -> one of 8 directions: 0 S, 1 SW, 2 W, 3 NW, 4 N, 5 NE, 6 E, 7 SE.
export function dir8(ang) {
  const o = ((Math.round(ang / (Math.PI / 4)) % 8) + 8) % 8; // 0 E,1 SE,2 S,3 SW,4 W,5 NW,6 N,7 NE
  return [6, 7, 0, 1, 2, 3, 4, 5][o];
}
// painted base direction + whether to mirror it
export function baseDir(d8) { return d8 <= 4 ? [d8, false] : [8 - d8, true]; }

export function charSprite(app, d, pose, fr, weapon) {
  const key = `${appKey(app)}|${d}|${pose}|${fr}|${weapon}`;
  let cv = cache.get(key);
  if (cv) return cv;
  const g = art.getContext('2d', { willReadFrequently: true });
  g.clearRect(0, 0, CW, CH);
  paint(new P(g), app || {}, d, pose, fr | 0, weapon | 0);
  const img = g.getImageData(0, 0, CW, CH), px = img.data;
  const solid = (x, y) => x >= 0 && y >= 0 && x < CW && y < CH && px[(y * CW + x) * 4 + 3] > 40;
  cv = document.createElement('canvas'); cv.width = CW; cv.height = CH;
  const o = cv.getContext('2d');
  o.fillStyle = OUTLINE;
  for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++)
    if (!solid(x, y) && (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1))) o.fillRect(x, y, 1, 1);
  o.drawImage(art, 0, 0);
  if (cache.size > 4000) cache.delete(cache.keys().next().value);
  cache.set(key, cv);
  return cv;
}
void dk;
