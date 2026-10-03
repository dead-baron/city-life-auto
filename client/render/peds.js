// Top-down 16-bit character renderer.
//
// Every character is painted on a 24x24 pixel-art grid (1 art pixel = 2 world px, the same
// scale as the concept-art buildings), facing +x, with 3-tone shading and a dark outline
// in the style of the concept character sheets. Outfits are layered from the appearance
// record the server sends (skin, hair, top, bottoms, shoes, headwear, accessories), so
// every archetype - Syndicate gang member, construction crew, executive, socialite, cop,
// SWAT, medic, hustler... - plus every player outfit gets a full animation set:
// idle (breathing), walk 8, run 8, punch 2x4, melee swing 2x4, aim, carry, fish, dive
// roll 4, knocked down / stunned and dead. Results are cached per appearance+pose+frame.

const G = 24;              // art grid
const SKINS = ['#f1c9a5', '#e0ac7e', '#c68953', '#a86b3c', '#7d4a26', '#4f2f1a'];
const OUTLINE = '#120d16';

// ---- colour helpers -------------------------------------------------------------
function hex(c) {
  if (!c) return '#888888';
  if (c.length === 4) return '#' + c[1] + c[1] + c[2] + c[2] + c[3] + c[3];
  return c;
}
function tone(c, amt) {
  const n = parseInt(hex(c).slice(1), 16);
  const f = (v) => Math.max(0, Math.min(255, Math.round(amt >= 0 ? v + (255 - v) * amt : v * (1 + amt))));
  const r = f(n >> 16), g = f((n >> 8) & 255), b = f(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}
const hi = (c) => tone(c, 0.28);
const lo = (c) => tone(c, -0.32);
const dk = (c) => tone(c, -0.55);

// ---- tiny pixel painter ---------------------------------------------------------
class Px {
  constructor(g) { this.g = g; }
  p(x, y, c) { if (x < 0 || y < 0 || x >= G || y >= G) return; this.g.fillStyle = c; this.g.fillRect(Math.round(x), Math.round(y), 1, 1); }
  r(x, y, w, h, c) { this.g.fillStyle = c; this.g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); }
  disc(cx, cy, rad, c, filter = null) {
    for (let y = Math.floor(cy - rad - 1); y <= Math.ceil(cy + rad); y++)
      for (let x = Math.floor(cx - rad - 1); x <= Math.ceil(cx + rad); x++) {
        const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
        if (dx * dx + dy * dy <= rad * rad && (!filter || filter(x, y, dx, dy))) this.p(x, y, c);
      }
  }
  // shaded blob: highlight on the upper-left (light from top-left), shadow lower-right
  blob(cx, cy, rx, ry, c) {
    for (let y = Math.floor(cy - ry - 1); y <= Math.ceil(cy + ry); y++)
      for (let x = Math.floor(cx - rx - 1); x <= Math.ceil(cx + rx); x++) {
        const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
        const d = dx * dx + dy * dy;
        if (d > 1) continue;
        const l = -dx * 0.6 - dy * 0.8;
        this.p(x, y, l > 0.45 && d > 0.15 ? hi(c) : l < -0.45 && d > 0.25 ? lo(c) : c);
      }
  }
  line(x0, y0, ang, len, c, w = 1) {
    for (let i = 0; i <= len; i++) {
      const x = x0 + Math.cos(ang) * i, y = y0 + Math.sin(ang) * i;
      this.p(x, y, c);
      if (w > 1) this.p(x - Math.sin(ang), y + Math.cos(ang), c);
    }
  }
}

// ---- weapons in art pixels (held in a hand at hx,hy pointing along ang) --------------
function weapon(P, w, hx, hy, ang) {
  const L = (len, c, wid = 1) => P.line(hx, hy, ang, len, c, wid);
  switch (w) {
    case 1: L(9, '#b8864a', 2); P.line(hx, hy, ang, 2, '#5a3a1a', 2); break;                // bat
    case 2: L(4, '#d8dde2'); P.line(hx, hy, ang, 1, '#3a2a1a'); break;                       // knife
    case 3: L(7, '#c8262b'); P.p(hx + Math.cos(ang) * 7 + Math.cos(ang + 1.6), hy + Math.sin(ang) * 7 + Math.sin(ang + 1.6), '#c8262b'); break; // crowbar
    case 4: L(8, '#6b4a2a'); P.line(hx + Math.cos(ang) * 8 - Math.cos(ang + 1.57) * 2, hy + Math.sin(ang) * 8 - Math.sin(ang + 1.57) * 2, ang + 1.57, 4, '#6a6e76', 2); break; // sledge
    case 5: L(7, '#16161a', 2); break;                                                          // baton
    case 6: L(3, '#f2c21b', 2); P.line(hx, hy, ang, 1, '#222'); break;                         // taser
    case 7: L(4, '#2a2a30', 2); break;                                                          // pistol
    case 8: L(5, '#3a3a40', 2); P.p(hx + Math.cos(ang) * 5, hy + Math.sin(ang) * 5, '#9aa0aa'); break; // revolver
    case 9: P.line(hx - Math.cos(ang) * 3, hy - Math.sin(ang) * 3, ang, 3, '#6b4a2a', 2); L(8, '#3a3a40', 2); break; // shotgun
    case 10: P.line(hx - Math.cos(ang) * 4, hy - Math.sin(ang) * 4, ang, 4, '#2a2a30', 2); L(10, '#2a2a30', 2); P.p(hx + Math.cos(ang) * 4, hy + Math.sin(ang) * 4, '#555'); break; // rifle
    case 11: L(5, '#1e1e24', 2); P.p(hx + Math.cos(ang + 1.57) * 2, hy + Math.sin(ang + 1.57) * 2, '#1e1e24'); break; // smg
    case 12: P.line(hx - Math.cos(ang) * 5, hy - Math.sin(ang) * 5, ang, 14, '#4a5a2a', 2); P.p(hx + Math.cos(ang) * 9, hy + Math.sin(ang) * 9, '#c8262b'); break; // bazooka
    case 13: L(10, '#3a2a1a'); break;                                                          // fishing rod
    default: break;
  }
}

// ---- body parts -------------------------------------------------------------------
function legs(P, a, stride, run) {
  const pants = hex(a.l || '#333'), shoes = hex(a.sh || '#222');
  const dress = a.t === 5;
  for (const [y, s] of [[8, stride], [13, -stride]]) {
    const x0 = 10 + Math.min(0, s), len = 3 + Math.abs(s);
    if (!dress || Math.abs(s) > 1) {
      P.r(x0, y, len, 3, dress ? SKINS[a.s ?? 1] : pants);
      P.r(x0, y + 2, len, 1, lo(dress ? SKINS[a.s ?? 1] : pants));
    }
    const fx = s >= 0 ? 12 + s : 9 + s;
    P.r(fx, y, 2 + (run ? 1 : 0), 3, shoes);
    P.p(fx + (s >= 0 ? 1 + (run ? 1 : 0) : 0), y, hi(shoes));
  }
}

function arm(P, a, side, reach, yo = 0, sleeveLen = 3) {
  // side: -1 = upper (left) arm, +1 = lower (right) arm. reach: how far forward the hand is.
  const skin = SKINS[a.s ?? 1];
  const top = hex(a.tc || '#888');
  const shortSleeve = a.t === 0 || a.t === 5;
  const sy = side < 0 ? 4 + yo : 18 + yo;
  const x0 = 11;
  const len = 3 + reach;
  const sl = shortSleeve ? 1 : Math.min(len, sleeveLen + reach);
  P.r(x0, sy, len, 2, skin);
  P.r(x0, sy + (side < 0 ? 0 : 1), len, 1, lo(skin));
  P.r(x0, sy, sl, 2, a.t === 7 ? hex(a.tc) : top);
  if (!shortSleeve) P.p(x0, sy + (side < 0 ? 0 : 1), lo(top));
  // hand
  P.r(x0 + len - 1, sy - (side < 0 ? 0 : 0), 2, 2, skin);
  P.p(x0 + len, sy + (side < 0 ? 0 : 1), hi(skin));
  return { hx: x0 + len, hy: sy + 0.5 };
}

function torso(P, a) {
  const c = hex(a.tc || '#888'), c2 = hex(a.tc2 || '#ddd');
  const skin = SKINS[a.s ?? 1];
  if (a.t === 5) P.blob(11.2, 12, 5.6, 7.6, lo(c));          // dress skirt flare under the top
  if (a.t === 7) P.blob(12, 12, 5, 8.2, hi(c));          // fur coat bulk
  if (a.t === 2) P.blob(9.2, 12, 2.4, 3.6, lo(c));         // hoodie hood behind the head
  P.blob(12, 12, 3.8, 7.3, c);                              // shoulders/chest
  switch (a.t) {
    case 0: // tank / tee: bare shoulders
      P.r(10, 5, 4, 2, skin); P.r(10, 17, 4, 2, skin); P.r(10, 6, 4, 1, lo(skin));
      break;
    case 1: // suit: white collar + tie
      P.r(15, 9, 1, 6, '#f0f0ec'); P.r(16, 10, 1, 4, c2); P.r(9, 6, 1, 12, lo(c));
      break;
    case 3: // work / hi-vis vest: reflective stripes
      P.r(9, 7, 7, 1, c2); P.r(9, 16, 7, 1, c2); P.r(15, 8, 1, 8, c2); P.p(15, 7, '#ffffff'); P.p(15, 16, '#ffffff');
      break;
    case 4: // cardigan: buttons
      for (let y = 6; y <= 18; y += 3) P.p(15, y, c2); P.r(9, 7, 1, 10, lo(c));
      break;
    case 6: // uniform: badge + epaulettes
      P.p(15, 7, c2); P.p(15, 8, hi(c2)); P.r(10, 5, 3, 1, c2); P.r(10, 18, 3, 1, c2); P.r(14, 15, 2, 2, '#e8e8e8');
      break;
    case 7: // fur collar
      for (let y = 5; y <= 19; y++) if (y % 2 === 0) { P.p(9, y, '#fffbe8'); P.p(16, y, '#fffbe8'); }
      P.p(15, 8, c2); P.p(15, 16, c2);
      break;
    default: break;
  }
  if (a.b === 3) P.r(9, 18, 3, 3, '#555');                  // tool bag
}

function head(P, a, lying = false) {
  const skin = SKINS[a.s ?? 1];
  const hair = hex(a.hc || '#222');
  const cx = lying ? 19 : 12.5, cy = 12;
  P.blob(cx, cy, 3, 3, skin);
  P.p(cx + 2.6, cy - 0.5, lo(skin));                                 // nose tip
  if (a.bandana) { P.disc(cx, cy, 3.1, '#c8262b', (x) => x + 0.5 > cx + 0.8); P.p(cx - 3, cy + 1, '#c8262b'); }
  const ht = a.ht || 0;
  if (ht === 0) {
    const hs = a.h ?? 0;
    if (hs === 2) { P.blob(cx - 0.6, cy, 3.9, 3.9, hair); P.disc(cx, cy, 2.4, skin, (x) => x + 0.5 > cx + 1.2); }
    else if (hs !== 3) {
      P.disc(cx, cy, 3.1, hair, (x, y, dx) => dx < (hs === 1 ? 1 : 0.4));
      P.p(cx - 2, cy - 1.5, hi(hair));
      if (hs === 4) { P.r(cx - 5, cy - 1, 2, 2, hair); P.p(cx - 6, cy, lo(hair)); }
      if (hs === 5) P.disc(cx - 3.4, cy, 1.4, lo(hair));
    } else P.p(cx - 1, cy - 2, hi(skin));
  } else {
    const hc = hex(a.htc || '#222');
    if (ht === 1) { P.blob(cx - 0.3, cy, 3.2, 3.2, hc); P.r(cx + 2.5, cy - 2, 2, 4, lo(hc)); P.p(cx - 1.5, cy - 1, hi(hc)); }        // cap
    else if (ht === 2) { P.disc(cx, cy, 4, lo(hc)); P.blob(cx, cy, 3.2, 3.2, hc); P.r(cx - 3, cy, 6, 1, lo(hc)); P.p(cx - 1, cy - 2, '#ffffff'); } // hard hat
    else if (ht === 3) { P.disc(cx, cy, 4.8, lo(hc)); P.blob(cx, cy, 2.6, 2.6, hc); }                                                   // sun hat
    else if (ht === 4) { P.blob(cx - 0.3, cy, 3.3, 3.3, hc); for (let y = cy - 2; y <= cy + 2; y += 2) P.r(cx - 3, y, 5, 1, lo(hc)); } // beanie
    else if (ht === 5) { P.blob(cx - 0.2, cy, 3.5, 3.5, hc); P.r(cx + 1.6, cy - 2, 2, 4, '#5a7a9a'); P.p(cx + 2, cy - 2, '#9fc8ef'); } // SWAT helmet + visor
  }
  if (a.b === 2) { P.r(cx - 2, cy - 7, 3, 2, '#c8262b'); P.p(cx - 3, cy - 6, '#7a1d24'); }                                     // purse strap
}

function lyingBody(P, a, fr, dead) {
  const top = hex(a.tc || '#888');
  const pants = hex(a.l || '#333'), shoes = hex(a.sh || '#222');
  const skin = SKINS[a.s ?? 1];
  const spread = dead ? 2 : fr ? 1 : 0;
  // legs toward -x
  P.r(3, 9 - spread, 7, 3, a.t === 5 ? skin : pants); P.r(3, 13 + spread, 7, 3, a.t === 5 ? skin : pants);
  P.r(1, 9 - spread, 2, 3, shoes); P.r(1, 13 + spread, 2, 3, shoes);
  // arms out
  P.r(12, 5 - spread, 5, 2, a.t === 0 || a.t === 5 ? skin : top); P.r(16, 4 - spread, 2, 2, skin);
  P.r(12, 17 + spread, 5, 2, a.t === 0 || a.t === 5 ? skin : top); P.r(16, 18 + spread, 2, 2, skin);
  if (a.t === 5) P.blob(10, 12, 4.5, 5, lo(top));
  P.blob(12, 12, 4.8, 5, top);
  if (a.t === 3) { P.r(9, 9, 1, 7, hex(a.tc2)); P.r(14, 9, 1, 7, hex(a.tc2)); }
  head(P, a, true);
}

// ---- pose composer ------------------------------------------------------------------
// pose: idle walk run punch swing aim carry fish roll down dead
function paint(P, a, pose, fr, w) {
  if (pose === 'dead' || pose === 'down') { lyingBody(P, a, fr, pose === 'dead'); return; }
  if (pose === 'roll') {
    const ang = (fr & 3) * Math.PI / 2;
    P.blob(12, 12, 6, 6, hex(a.tc || '#888'));
    P.blob(12 + Math.cos(ang) * 3, 12 + Math.sin(ang) * 3, 3, 3, hex(a.hc || '#222'));
    P.p(12 - Math.cos(ang) * 4, 12 - Math.sin(ang) * 4, hex(a.sh || '#222'));
    return;
  }
  const walkCycle = [0, 1, 2, 3, 3, 2, 1, 0].map((v, i) => (i < 4 ? v : -v));
  let stride = 0;
  if (pose === 'walk' || pose === 'carry') stride = Math.round(walkCycle[fr & 7] * 1.5);
  if (pose === 'run') stride = Math.round(walkCycle[fr & 7] * 2.1);
  legs(P, a, stride, pose === 'run');

  const armSw = pose === 'walk' ? -Math.round(stride * 0.6) : pose === 'run' ? -Math.round(stride * 0.6) : 0;
  let hands = null;
  if (pose === 'punch') {
    const side = fr >> 2, f = fr & 3;
    const ext = [0, 6, 9, 4][f];
    torso(P, a);
    if (side === 0) { hands = arm(P, a, -1, ext, ext > 4 ? 2 : 1); arm(P, a, 1, 2, -2); }
    else { hands = arm(P, a, 1, ext, ext > 4 ? -2 : -1); arm(P, a, -1, 2, 2); }
    if (f === 2) P.r(hands.hx, hands.hy - 1.5, 2, 3, tone(SKINS[a.s ?? 1], 0.15)); // fist
  } else if (pose === 'swing') {
    torso(P, a);
    const f = fr & 3, dir = (fr >> 2) ? -1 : 1;
    const ang = [-1.5, -0.6, 0.45, 1.25][f] * dir;
    const hx = 15 + Math.cos(ang) * 1.5, hy = 12 + Math.sin(ang) * 3;
    arm(P, a, -1, 3, 3); arm(P, a, 1, 3, -3);
    P.r(hx, hy - 1, 2, 2, SKINS[a.s ?? 1]);
    weapon(P, w, hx + 1, hy, ang);
    if (f === 2) P.line(hx + Math.cos(ang - 0.5 * dir) * 9, hy + Math.sin(ang - 0.5 * dir) * 9, ang + 1.4 * dir, 3, 'rgba(255,255,255,0.7)');
  } else if (pose === 'aim' || pose === 'carry' || pose === 'fish') {
    torso(P, a);
    const reach = pose === 'aim' ? 5 : 4;
    const l = arm(P, a, -1, reach, pose === 'aim' ? 4 : 1);
    arm(P, a, 1, reach, pose === 'aim' ? -4 : -1);
    hands = { hx: l.hx, hy: 12 };
    if (pose === 'aim' && w) weapon(P, w, hands.hx, 11.5, 0);
    if (pose === 'fish') weapon(P, 13, hands.hx, 11.5, -0.35);
  } else {
    torso(P, a);
    const breathe = pose === 'idle' && (fr & 4) ? 1 : 0;
    arm(P, a, -1, 1 + armSw, -breathe * 0 );
    const r = arm(P, a, 1, 1 - armSw, 0);
    // holstered / held melee weapon hangs from the right hand
    if (w > 0 && w <= 6) weapon(P, w, r.hx - 1, r.hy + 1, 0.5);
    else if (w >= 7 && w <= 12 && pose !== 'run') weapon(P, w, r.hx - 1, r.hy + 1, 0.15);
    if (a.b === 1) { P.r(r.hx - 3, r.hy + 1.5, 4, 3, '#3a2414'); P.r(r.hx - 2, r.hy + 1.5, 2, 1, '#6b4a2a'); }   // briefcase
  }
  head(P, a);
}

// ---- outline + cache --------------------------------------------------------------------
const art = typeof document !== 'undefined' ? document.createElement('canvas') : null;
if (art) { art.width = G; art.height = G; }

export function paintCharacter(out, scale, app, pose, fr, weapon) {
  const g = art.getContext('2d', { willReadFrequently: true });
  g.clearRect(0, 0, G, G);
  paint(new Px(g), app || {}, pose, fr | 0, weapon | 0);
  // 1px dark outline around every opaque pixel (concept-sheet style)
  const img = g.getImageData(0, 0, G, G);
  const d = img.data;
  const solid = (x, y) => x >= 0 && y >= 0 && x < G && y < G && d[(y * G + x) * 4 + 3] > 40;
  const edge = [];
  for (let y = 0; y < G; y++) for (let x = 0; x < G; x++)
    if (!solid(x, y) && (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1))) edge.push(x, y);
  g.fillStyle = OUTLINE;
  for (let i = 0; i < edge.length; i += 2) g.fillRect(edge[i], edge[i + 1], 1, 1);
  const og = out.getContext('2d');
  og.imageSmoothingEnabled = false;
  og.clearRect(0, 0, out.width, out.height);
  // soft drop shadow, then the sprite
  og.globalAlpha = 0.28;
  og.filter = 'brightness(0)';
  og.drawImage(art, scale * 0.6, scale * 0.9, G * scale, G * scale);
  og.filter = 'none';
  og.globalAlpha = 1;
  og.drawImage(art, 0, 0, G * scale, G * scale);
}

export const CHAR_GRID = G;
