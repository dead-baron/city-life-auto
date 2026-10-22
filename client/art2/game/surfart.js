// The surf breaks' waves in the new art (surfing: server/systems/surf.js, shared/surf.js - the same waves, from the same
// clock: the world's tick, as the page renders it). Loaded by the host the first time a break is near you (me.surf.b).
// Each wave is drawn flat on the water as decals along its crest, turned to the beach: while it's green, the bright lip of
// the crest and the dark, steep face in front of it, building as it rises; where it has broken - from one end, the break
// peeling along the crest - churning white water, thinning as it washes in. The ends taper off along the beach.
import { wavesAt, broken, SURF } from '../../../shared/surf.js';

const STEP = 26;   // px along the crest between pieces
const UP_N = [128, 128, 255];
function gbuf(w, h, ax, ay) {
  const n = w * h;
  return { w, h, ax, ay, col: new Uint8ClampedArray(n * 4), nrm: new Uint8ClampedArray(n * 4), z: new Uint16Array(n), emi: new Uint8ClampedArray(n * 4), flag: new Uint8Array(n) };
}
function put(G, x, y, rgb) {
  if (x < 0 || y < 0 || x >= G.w || y >= G.h) return;
  const i = y * G.w + x, j = i * 4;
  G.col[j] = rgb[0]; G.col[j + 1] = rgb[1]; G.col[j + 2] = rgb[2]; G.col[j + 3] = 255;
  G.nrm[j] = UP_N[0]; G.nrm[j + 1] = UP_N[1]; G.nrm[j + 2] = UP_N[2]; G.nrm[j + 3] = 255;
  G.flag[i] = 1;   // (the ground: lit as the water's surface is)
}
const hh = (x, y, s) => { let h = (x * 374761393 + y * 668265263 + s * 2246822519) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
// the pieces (a few variants each, so the line isn't a repeat): along x, across y (the beach is toward +y)
const MAKE = {
  // the crest's lip: a bright broken line, a softer row behind it
  lip: (v) => () => {
    const w = STEP + 8, h = 6, G = gbuf(w, h, w >> 1, 2);
    for (let x = 0; x < w; x++) {
      const e = hh(x, v, 1);
      if (e > 0.08) put(G, x, 2, [240, 248, 250]);
      if (e > 0.3) put(G, x, 1, [214, 236, 240]);
      if (hh(x, v, 2) > 0.25) put(G, x, 3, [226, 242, 244]);
      if (hh(x, v, 6) > 0.55) put(G, x, 4, [176, 214, 220]);
    }
    return G;
  },
  // the face in front of the crest: the water standing up, darker, dithered
  face: (v) => () => {
    const w = STEP + 8, h = 20, G = gbuf(w, h, w >> 1, 0);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const k = 1 - y / h;
      if (hh(x, y + v * 31, 3) < k * 0.85) put(G, x, y, y < 3 ? [70, 150, 160] : y < 9 ? [30, 104, 124] : [24, 92, 112]);
    }
    return G;
  },
  // the back of the swell behind the crest: the water lifting, lighter toward the top
  back: (v) => () => {
    const w = STEP + 8, h = 14, G = gbuf(w, h, w >> 1, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const k = y / h;
      if (hh(x, y + v * 29, 4) < k * k * 0.8) put(G, x, y, y > h - 4 ? [150, 214, 222] : [96, 182, 198]);
    }
    return G;
  },
  // white water: churning foam, densest at its front edge
  white: (v) => () => {
    const w = STEP + 10, h = 26, G = gbuf(w, h, w >> 1, 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const k = y < 6 ? 0.92 : 0.92 - (y - 6) / (h - 6) * 0.8, r = hh(x, y + v * 37, 5);
      if (r < k) put(G, x, y, r < k * 0.5 ? [240, 248, 250] : [196, 226, 232]);
    }
    return G;
  },
};
// each piece's four variants: the decal's key and the function that makes it, built once (no garbage a frame)
const PIECES = {};
for (const [k, mk] of Object.entries(MAKE)) PIECES[k] = [0, 1, 2, 3].map((v) => [`sf${k}|${v}`, mk(v)]);
const conv = (host, k, v) => { const P = PIECES[k][v]; return host._conv(P[0], P[1], true); };
const WS = [];
export function drawWaves(host, F, breaks, t) {
  const E = host.E, x0 = host.vx0 - 80, x1 = host.vx1 + 80, y0 = host.vy0 - 80, y1 = host.vy1 + 120;
  for (const B of breaks) {
    // (the break near the view at all?)
    if (Math.max(Math.abs(B.x - (x0 + x1) / 2) - (x1 - x0) / 2, Math.abs(B.y - (y0 + y1) / 2) - (y1 - y0) / 2) > B.half + SURF.start + 60) continue;
    const ang = Math.atan2(B.nx, -B.ny), ux = -B.ny, uy = B.nx;   // (the pieces' +x along the beach, +y toward it; u: along it)
    for (const w of wavesAt(B, t, WS)) {
      const rise = Math.min(1, w.age / 3) * (0.7 + w.size * 0.3), wash = Math.min(1, (w.d - SURF.shore) / 90);
      if (rise * wash < 0.05) continue;
      const steep = w.green ? Math.min(1, (SURF.start - w.d) / 200) : 1;   // (the face standing up as it comes in)
      let j = 0;
      for (let a = -B.half + STEP / 2; a < B.half; a += STEP, j++) {
        // (shared/surf.js breakPt, inline: a along the beach, d out from it)
        const px = B.x + ux * a + B.nx * w.d, py = B.y + uy * a + B.ny * w.d;
        if (px < x0 || px > x1 || py < y0 || py > y1) continue;
        const end = Math.min(1, (B.half - Math.abs(a)) / 90), v = (w.id * 7 + j) & 3;
        if (broken(B, w, a)) {
          const k = conv(host, 'white', v);
          if (k) E.drawDecal(k, px - B.nx * 4, py - B.ny * 4, ang, 0.95 * wash * end, 0);
        } else {
          const kf = conv(host, 'face', v), kl = conv(host, 'lip', v), kb = conv(host, 'back', v);
          if (kb) E.drawDecal(kb, px, py, ang, 0.6 * rise * end, 0);
          if (kf) E.drawDecal(kf, px - B.nx * 2, py - B.ny * 2, ang, 0.9 * rise * end * steep, 0);
          if (kl) E.drawDecal(kl, px, py, ang, Math.min(1, 1.1 * rise) * end, 0);
        }
      }
    }
  }
}
