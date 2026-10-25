// The surf breaks' waves in the new art (surfing: server/systems/surf.js, shared/surf.js - the same waves, from the same
// clock: the world's tick, as the page renders it). Loaded by the host the first time a break is near you (me.surf.b).
// Each wave is drawn flat on the water as decals along its crest (shared/surf.js crestD: bowed back at the ends and
// wandering along its length, each piece turned to the crest's own line), and goes through its life as a real one does
// (the owner's notes 2, p7: "smaller waves and bigger waves, have them swell and curl over and behave more like real
// waves"):
//   swell      far out, a low broad hump: the lighter back, a faint darker face, no lip yet;
//   steepening nearer its break line (its own: a big wave breaks further out) the face darkens and stands up and the lip
//              forms - broken where the crest stands low (gapAt: the gaps you can't catch), feathering spray on the
//              highest sections;
//   curl       just ahead of the break, as it peels along the crest, the lip throws forward over a dark tube, spray off it;
//   white water behind the break: churning foam, its front uneven, foam lace trailing behind it and thinning;
//   swash      where it reaches the sand (the water's edge found on the map, piece by piece) it runs on up the beach as a thin
//              uneven line - tongues and scallops (runupAt) - slows, drains back and leaves the sand dark and wet a moment.
// The pieces come in three sizes (small, mid, big: the crest's height there) and four variants each, so no two look alike.
import { wavesAt, broken, crestD, heightAt, gapAt, runupAt, SURF } from '../../../shared/surf.js';
import { WATER_T } from '../../../shared/mapcore.js';

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
// (each piece thins out toward its ends, so the pieces overlapping along the crest blend into one line, not a row of blocks)
const tp = (x, w) => { const u = Math.abs(x - (w - 1) / 2) / (w / 2); return u < 0.55 ? 1 : Math.max(0, 1 - (u - 0.55) * 1.8); };
const FOAM = [240, 248, 250], FOAM2 = [214, 236, 240], FOAM3 = [190, 224, 230], LIP2 = [176, 214, 220];
const FACE = [[64, 146, 160], [28, 98, 120], [18, 76, 100]], BACK = [[156, 220, 228], [104, 190, 206]], TUBE = [12, 58, 80];
// the pieces: along x, across y (the beach is toward +y); c the size (0 small, 1 mid, 2 big), v the variant
const MAKE = {
  // the back of the swell behind the crest: the water lifting, lighter toward the top
  back: (c, v) => () => {
    const w = STEP + 8, h = 16 + c * 10, G = gbuf(w, h, w >> 1, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const k = y / h;
      if (hh(x, y + v * 29, 4 + c) < k * k * 0.9 * tp(x, w)) put(G, x, y, y > h - 4 ? BACK[0] : BACK[1]);
    }
    return G;
  },
  // the face in front of the crest: the water standing up, darker, dithered - taller on a bigger wave
  face: (c, v) => () => {
    const w = STEP + 8, h = 14 + c * 12, G = gbuf(w, h, w >> 1, 0);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const k = 1 - y / h;
      if (hh(x, y + v * 31, 3 + c) < (0.35 + k * 0.6) * tp(x, w)) put(G, x, y, FACE[y < 3 ? 0 : y < h * 0.45 ? 1 : 2]);
    }
    return G;
  },
  // the crest's lip: a bright broken line, a softer row behind it
  lip: (c, v) => () => {
    const w = STEP + 8, h = 5 + c, G = gbuf(w, h, w >> 1, 2);
    for (let x = 0; x < w; x++) {
      const e = hh(x, v, 1 + c);
      if (e > 0.08) put(G, x, 2, FOAM);
      if (c && e > 0.2) put(G, x, 3, FOAM);
      if (e > 0.3) put(G, x, 1, FOAM2);
      if (hh(x, v, 2) > 0.25) put(G, x, 3, [226, 242, 244]);
      if (c && hh(x, v, 6) > 0.55) put(G, x, 4, LIP2);
    }
    return G;
  },
  // the lip thrown forward over the tube: the crest's line, the dark hollow under the curl, the curl's bright edge out
  // in front of it, spray off the top
  curl: (c, v) => () => {
    const w = STEP + 8, h = 14 + c * 6, G = gbuf(w, h, w >> 1, 3), t = 4 + c * 3;
    for (let x = 0; x < w; x++) {
      const r = hh(x, v, 41 + c), lo = 3 + t + (r > 0.7 ? 1 : 0);
      for (let y = 3; y < lo; y++) put(G, x, y, y < 4 ? FOAM2 : TUBE);   // (the hollow)
      for (let y = lo; y < lo + 2 + (c > 1 ? 1 : 0); y++) put(G, x, y, r > 0.15 ? FOAM : FOAM2);   // (the lip coming down)
      if (r > 0.45) put(G, x, lo + 2 + c, FOAM3);
      if (hh(x, v + 7, 43) > 0.7) put(G, x, 2, FOAM);
      if (hh(x, v + 9, 44) > 0.82) put(G, x, hh(x, v, 45) < 0.5 ? 0 : 1, FOAM2);   // (spray off the top)
    }
    return G;
  },
  // feathering: spray blown back off the highest crests
  feather: (c, v) => () => {
    const w = STEP + 8, h = 8, G = gbuf(w, h, w >> 1, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (hh(x, y + v * 13, 51) < 0.08 + y * 0.04) put(G, x, y, y > h - 3 ? FOAM : FOAM2);
    return G;
  },
  // white water: churning foam, densest at its uneven front edge, deeper on a bigger wave
  white: (c, v) => () => {
    const w = STEP + 10, h = 22 + c * 14, G = gbuf(w, h, w >> 1, 4);
    for (let x = 0; x < w; x++) {
      const f = Math.floor(hh(x >> 2, v, 61) * 4);   // (the front's ragged edge)
      for (let y = f; y < h; y++) {
        const k = y < 6 + f ? 0.92 : 0.92 - (y - 6 - f) / (h - 6) * 0.85, r = hh(x, y + v * 37, 5 + c);
        if (r < k * tp(x, w)) put(G, x, y, r < k * 0.5 ? FOAM : FOAM3);
      }
    }
    return G;
  },
  // foam lace left behind the white water: a thinning net of foam
  lace: (c, v) => () => {
    const w = STEP + 10, h = 18 + c * 6, G = gbuf(w, h, w >> 1, 0);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const n = hh(x >> 1, y >> 1, 71 + v), m = hh((x + 3) >> 2, (y + 1) >> 2, 73 + v);
      if ((n < 0.22 && m < 0.6) || (m > 0.92 && n < 0.6)) put(G, x, y, (y & 3) ? FOAM3 : FOAM2);
    }
    return G;
  },
  // the swash's edge on the sand: a thin uneven foam line, the thin sheet of water behind it (seaward: -y)
  swash: (c, v) => () => {
    const w = STEP + 8, h = 16, G = gbuf(w, h, w >> 1, h - 3);
    for (let x = 0; x < w; x++) {
      const j = hh(x >> 2, v, 81) < 0.35 ? 1 : 0;
      for (let y = h - 4 - j; y < h - 1 - j; y++) if (hh(x, y, 82 + v) > 0.12 + (1 - tp(x, w)) * 0.6) put(G, x, y, FOAM);
      if (hh(x, v, 83) > 0.6) put(G, x, h - 1 - j, FOAM2);
      for (let y = 0; y < h - 4 - j; y++) if (hh(x, y + v * 17, 84) < (0.12 + (y / h) * 0.34) * tp(x, w)) put(G, x, y, y > h - 7 ? [222, 238, 234] : [192, 218, 212]);
    }
    return G;
  },
  // the sand the swash wet: darker, its top edge where it ran up to
  wet: (c, v) => () => {
    const w = STEP + 8, h = 12, G = gbuf(w, h, w >> 1, h - 1);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (hh(x, y + v * 19, 91) < (0.8 - (h - 1 - y) * 0.06) * tp(x, w)) put(G, x, y, y > h - 3 ? [176, 150, 104] : [190, 164, 116]);
    return G;
  },
};
// each piece's three sizes by four variants: the decal's key and the function that makes it, built once (no garbage a frame)
const PIECES = {};
for (const [k, mk] of Object.entries(MAKE)) PIECES[k] = [0, 1, 2].map((c) => [0, 1, 2, 3].map((v) => [`sf2${k}|${c}|${v}`, mk(c, v)]));
export const PIECE_KINDS = Object.keys(MAKE);
const conv = (host, k, c, v) => { const P = PIECES[k][c][v]; return host._conv(P[0], P[1], true); };
export const sizeClass = (h) => (h < 0.7 ? 0 : h < 1.1 ? 1 : 2);
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

// Where the water ends a along break B (px out from its waterline: the beach isn't quite straight), from the map:
// scanning in along the break's normal for the first tile that isn't water. null while that bit of the map isn't here.
export function edgeAt(M, B, a) {
  if (!M || !M.tileAtPx) return 0;
  const ux = -B.ny, uy = B.nx;
  let last = 120;
  for (let d = 120; d >= -120; d -= 6) {
    const x = B.x + ux * a + B.nx * d, y = B.y + uy * a + B.ny * d, tx = Math.floor(x / 32), ty = Math.floor(y / 32);
    if (M.inside && !M.inside(tx, ty)) return null;
    if (WATER_T[M.tileAtPx(x, y)] !== 1) return last;
    last = d;
  }
  return 0;
}
// What one piece of wave w is a along break B (pure: the tests check it against the server's arithmetic): the crest
// there (d, px out), the stage - 'swell' | 'steep' | 'curl' | 'white' | 'swash' | null (gone) - and the pieces to draw:
// [kind, size class, d (px out: where it goes), alpha]. e: where the water ends there (edgeAt).
export function pieceOf(B, w, a, e, out = []) {
  out.length = 0;
  const d = crestD(B, w, a), end = Math.min(1, (B.half - Math.abs(a)) / 90);
  if (end <= 0) return { d, stage: null, list: out };
  const h = heightAt(B, w, a), c = sizeClass(h), rise = Math.min(1, w.age / 3);
  if (d > e + 4) {
    if (broken(B, w, a) || d < e + 40) {   // (behind the break - or reaching the beach unbroken: a shorebreak)
      const tb = w.edge === null ? 0 : Math.max(0, B.side * (w.edge - a) / SURF.peel), thin = clamp01((d - e) / 60), cw = Math.max(0, c - (thin < 0.5 ? 1 : 0));
      out.push(['white', cw, d - 4, 0.95 * end * (0.45 + 0.55 * thin)]);
      const lace = 0.6 * end * clamp01(1 - tb / 4) * (0.4 + 0.6 * thin);
      if (lace > 0.05) out.push(['lace', cw, d + 14 + c * 6, lace]);
      return { d, stage: 'white', list: out };
    }
    const s = clamp01((w.brk + 200 - d) / 200), ah = w.edge === null ? Infinity : B.side * (a - w.edge);
    out.push(['back', c, d, (0.45 + 0.4 * s) * rise * end]);
    out.push(['face', c, d - 2, (0.45 + 0.55 * s) * Math.min(1, h / 0.8) * rise * end]);
    if (ah < 110) {   // (just ahead of the break: the lip pitching over)
      out.push(['curl', c, d - 1, Math.min(1, 1.25 - ah / 110) * end]);
      return { d, stage: 'curl', list: out };
    }
    if (s > 0.3 && !gapAt(B, w, a)) out.push(['lip', c, d, Math.min(1, (s - 0.3) * 2.5) * Math.min(1, 1.1 * rise) * end]);
    if (s > 0.75 && h > 1) out.push(['feather', c, d + 3, 0.5 * end]);
    return { d, stage: s > 0.3 ? 'steep' : 'swell', list: out };
  }
  // up the sand: the swash, from when the white water reached the water's edge here
  const ts = (e + 4 - d) / SURF.speed, up = SURF.swashUp, dn = SURF.swashDown;
  if (ts > up + dn + 0.5) return { d, stage: null, list: out };
  const R = runupAt(B, w, a);
  if (ts < up) {
    const p = 1 - (1 - ts / up) * (1 - ts / up);
    out.push(['swash', 0, e - R * p, end * (0.95 - 0.2 * p)]);
  } else {
    const q = clamp01((ts - up) / dn), p = 1 - q * q * (3 - 2 * q) * 0.85;
    out.push(['wet', 0, e - R, end * 0.4 * (1 - q * 0.7) * clamp01((up + dn + 0.5 - ts) / 0.5)]);
    if (q < 1) out.push(['swash', 1, e - R * p, end * (1 - q) * 0.8]);
  }
  return { d, stage: 'swash', list: out };
}

const WS = [], LIST = [];
export function drawWaves(host, F, breaks, t) {
  const E = host.E, M = host.map, x0 = host.vx0 - 80, x1 = host.vx1 + 80, y0 = host.vy0 - 80, y1 = host.vy1 + 120;
  for (const B of breaks) {
    // (the break near the view at all?)
    if (Math.max(Math.abs(B.x - (x0 + x1) / 2) - (x1 - x0) / 2, Math.abs(B.y - (y0 + y1) / 2) - (y1 - y0) / 2) > B.half + SURF.start + 60) continue;
    const ux = -B.ny, uy = B.nx;   // (along the beach; the pieces' +y toward it)
    // the water's edge piece by piece (found once the map is here)
    const n = Math.ceil((2 * B.half) / STEP);
    if (!B.edges || B.edges.length !== n) B.edges = new Array(n).fill(null);
    for (const w of wavesAt(B, t, WS)) {
      let j = 0;
      for (let a = -B.half + STEP / 2; a < B.half; a += STEP, j++) {
        let e = B.edges[j];
        if (e === null) { e = edgeAt(M, B, a); B.edges[j] = e; if (e === null) e = 0; }
        const P = pieceOf(B, w, a, e, LIST);
        if (!P.stage) continue;
        // (shared/surf.js breakPt, inline) and the crest's own line here: the piece turned along it
        const px = B.x + ux * a + B.nx * P.d, py = B.y + uy * a + B.ny * P.d;
        if (px < x0 - 40 || px > x1 + 40 || py < y0 - 40 || py > y1 + 40) continue;
        const sl = (crestD(B, w, a + 8) - crestD(B, w, a - 8)) / 16, ang = Math.atan2(uy + B.ny * sl, ux + B.nx * sl);
        const v = (w.id * 7 + j) & 3;
        for (const [k, c, d, al] of P.list) {
          if (al <= 0.02) continue;
          const key = conv(host, k, c, v);
          if (!key) continue;
          const qx = B.x + ux * a + B.nx * d, qy = B.y + uy * a + B.ny * d;
          E.drawDecal(key, qx, qy, ang, al, P.stage === 'swash' && host._gz ? host._gz(qx, qy) : 0);
        }
      }
    }
  }
}
