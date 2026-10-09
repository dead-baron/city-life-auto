// The face close up (R px per world px; CC2, CB2), for whatever draws people bigger than the game does - tools, tests, a
// portrait some day: person(app, dir, pose, frame, { res: 4, closeFace }) stamps it through the head's frame. (Moved out
// of people.js on 2026-10-09: the creator shows the game's own sprite now, so no player needs these 4 KB.)
// Almond eyes with a lid line, the white, a coloured iris, a pupil and a catchlight; brows by shape; nostrils and the
// shadow under the nose; lips parted by a dark line; age lines from the 40s (crow's feet, the folds by the mouth, the
// forehead) and grey brows; freckles, a beauty mark, dimples, blush and makeup; glasses, goggles, a patch or a party
// mask; piercings, a scar, a face tattoo. Each feature is drawn in its own patch of the head's surface (u across, v up,
// in world px), so it turns and foreshortens with the head.
import { hash, bayer } from './gbuf.js';
import { CLOSE } from './people.js';

const { SA, CA, NOSE, WHITE, LASH, hexRgb, lum } = CLOSE;
export function closeFace(B, fig, P, A, D, w, h, AX, AY, R) {
  const { PID, CR, CG, CB } = B;
  const hp = fig.prims[fig.head], c = hp.c, M = hp.M, r = hp.r, K = fig.head, W = fig.W, F = A.face || {}, mk = A.makeup || null;
  const proj = (l0, l1, l2) => {
    const lx = l0 * r[0], ly = l1 * r[1], lz = l2 * r[2];
    const X = c[0] + M[0] * lx + M[1] * ly + M[2] * lz, Y = c[1] + M[3] * lx + M[4] * ly + M[5] * lz, Z = c[2] + M[6] * lx + M[7] * ly + M[8] * lz;
    const nx = M[0] * l0 / r[0] + M[1] * l1 / r[1] + M[2] * l2 / r[2], ny = M[3] * l0 / r[0] + M[4] * l1 / r[1] + M[5] * l2 / r[2], nz = M[6] * l0 / r[0] + M[7] * l1 / r[1] + M[8] * l2 / r[2];
    return [AX + X * R, AY + (Y * SA - Z * CA) * R, (ny * CA + nz * SA) / (Math.hypot(nx, ny, nz) || 1)];
  };
  const onHead = (i) => PID[i] === K || PID[i] === K + 1 || PID[i] === K + 2;   // (the head, the jaw, the nose)
  const skin = W.skin, hairR = W.hairR, age = D.age | 0, fem = D.fem;
  const mix = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
  const put = (x, y, col, k = 1) => {
    x = Math.floor(x); y = Math.floor(y);
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const i = y * w + x;
    if (!onHead(i)) return;
    if (k >= 1) { CR[i] = col[0]; CG[i] = col[1]; CB[i] = col[2]; } else { CR[i] += (col[0] - CR[i]) * k; CG[i] += (col[1] - CG[i]) * k; CB[i] += (col[2] - CB[i]) * k; }
  };
  // a patch of the surface round the unit point at azimuth az (0 = the nose's line, + = the head's right), height l2:
  // calls fn(u, v, x, y) for every pixel near it (u, v in world px from the centre); null when it faces away
  const patch = (az, l2, ext, fn, minFc = 0.18) => {
    const pt = (a, z) => { const cz = Math.sqrt(Math.max(0.05, 1 - z * z)); return proj(Math.sin(a) * cz, Math.cos(a) * cz, z); };
    const p0 = pt(az, l2);
    if (p0[2] < minFc) return null;
    const ce = Math.sqrt(Math.max(0.05, 1 - l2 * l2)), pu = pt(az + 0.05, l2), pv = pt(az, l2 + 0.05), su = 0.05 * r[0] * ce, sv = 0.05 * r[2];
    const ux = (pu[0] - p0[0]) / su, uy = (pu[1] - p0[1]) / su;   // screen px per world px across the surface
    const vx = (pv[0] - p0[0]) / sv, vy = (pv[1] - p0[1]) / sv;   // ... and up it
    const det = ux * vy - uy * vx;
    if (Math.abs(det) < 0.05 * R * R) return null;
    const ex = Math.ceil(ext * R * 1.3) + 1;
    for (let y = Math.floor(p0[1] - ex); y <= p0[1] + ex; y++) for (let x = Math.floor(p0[0] - ex); x <= p0[0] + ex; x++) {
      const dx = x + 0.5 - p0[0], dy = y + 0.5 - p0[1];
      fn((dx * vy - dy * vx) / det, (ux * dy - uy * dx) / det, x, y);
    }
    return p0;
  };
  // the eyes sit 21 deg either side of the nose; as the head turns the near one slides back round (as face() does)
  const fh = Math.hypot(M[1], M[4]), turn = fh > 0.2 ? Math.abs(M[1]) / fh : 0, near = M[3] >= 0 ? 1 : -1;
  const azE = (s) => s * (21 + (s === near ? 12 * turn : 0)) * Math.PI / 180;
  const covered = A.mask || A.bandana || A.medmask, glasses = A.glasses;
  const ET = [[1.5, 0.82, 0.6, 0.7], [1.4, 0.95, 0.75, 0.55], [1.5, 0.56, 0.42, 0.8], [1.45, 0.72, 0.56, 0.7], [1.65, 1.02, 0.78, 0.6], [1.45, 0.7, 0.56, 0.7]][F.eyes | 0] || [1.5, 0.82, 0.6, 0.7];
  const [ew, eTop, eBot, ePow] = ET;
  const irisC = F.eyeColor ? hexRgb(F.eyeColor) : [70, 44, 26], irisD = mix(irisC, [10, 8, 12], 0.45), irisL = mix(irisC, [255, 250, 230], 0.22);
  const shadowC = mk && (mk.kind === 'smoky eyes' || mk.kind === 'goth') ? [42, 30, 46] : mk && mk.kind === 'glam' ? hexRgb(mk.color || '#7a3ac8') : null;
  const browC = age >= 4 ? mix(lum(hairR[1]) > 0.5 ? hairR[0] : hairR[1], [168, 166, 170], age >= 5 ? 0.6 : 0.35) : lum(hairR[2]) > 0.55 ? hairR[0] : hairR[1];
  const eyesAt = [];
  for (const s of [-1, 1]) {
    const az = azE(s), out = s;   // u grows toward the head's right; the outer corner is on the eye's own side
    // the eye
    const p0 = patch(az, 0.14, ew + 0.6, (u, v, x, y) => {
      const uo = u * out, un = u / ew;
      if (Math.abs(un) > 1.08) return;
      const q = Math.max(0, 1 - un * un), top = eTop * Math.pow(q, ePow) - (F.eyes === 5 ? 0.18 : 0), bot = -eBot * Math.pow(q, 0.9);
      if (!P.eyes) { if (Math.abs(v - bot * 0.3) < 0.2 && Math.abs(un) < 1) put(x, y, LASH); return; }
      const lid = F.eyes === 3 || F.eyes === 5 ? 0.42 : 0.3;
      if (v <= top + (fem ? 0.2 : 0.12) && v >= top - lid && Math.abs(un) <= 1.02) { put(x, y, LASH); return; }
      if (fem && uo > ew * 0.75 && uo < ew + 0.45 && v > top - 0.15 && v < top + 0.35 + (uo - ew * 0.75) * 0.5) { put(x, y, LASH); return; }   // the lashes' flick
      if (v < top - lid && v > bot) {
        // the iris looks a little toward the camera; the upper lid shades it
        const iu = u - out * 0.05, iv = v + 0.02, ir = eTop * 0.95 + 0.06, d = Math.hypot(iu, iv * 1.08);
        if (d < ir) {
          if (d < ir * 0.42) { put(x, y, [16, 12, 16]); return; }
          put(x, y, iv > ir * 0.25 ? irisD : iv < -ir * 0.45 ? irisL : irisC);
          if (Math.abs(iu + 0.2) < 0.5 / R && Math.abs(iv - 0.14) < 0.5 / R) put(x, y, [252, 252, 248]);
          return;
        }
        put(x, y, mix(WHITE, skin[2], 0.12 + Math.abs(un) * 0.3 + (v > top - lid - 0.25 ? 0.18 : 0)));
        return;
      }
      if (v <= bot && v > bot - 0.28 && uo > -ew * 0.2 && Math.abs(un) < 0.95) put(x, y, skin[1], 0.5);   // the lower lid
      if (shadowC && !glasses && v > top + 0.1 && v < top + 0.75 && Math.abs(un) < 1.05) put(x, y, shadowC, 0.55);
      if (F.eyes === 3 && v > top + 0.3 && v < top + 0.55 && Math.abs(un) < 0.9) put(x, y, skin[1], 0.6);   // the hooded fold
      if (age >= 3 && uo > ew + 0.15 && uo < ew + 0.7 && (Math.abs(v - (uo - ew) * 0.5) < 0.12 || Math.abs(v + (uo - ew) * 0.6) < 0.12) && (x + y) % 2 === 0) put(x, y, skin[1], 0.7);   // crow's feet
      if (age >= 3 && v < bot - 0.35 && v > bot - 0.6 && Math.abs(un) < 0.75) put(x, y, skin[1], 0.35 + age * 0.06);   // bags under the eyes
    }, 0.12);
    if (p0) eyesAt.push({ s, p: p0 });
    // the brow
    if (!A.mask) patch(az + s * 0.02, 0.38, ew + 0.9, (u, v, x, y) => {
      if (glasses === 'sun' || glasses === 'goggles' || glasses === 'domino') return;
      const uo = u * out, un = uo / (ew + 0.55);
      if (un < -0.95 || un > 1.05) return;
      const arch = F.brows === 3 ? 0.42 : F.brows === 4 ? 0.05 : 0.22;
      const mid = arch * (1 - un * un) - (un < -0.6 ? 0.1 : 0) - (un > 0.7 ? (un - 0.7) * 0.9 : 0);
      const th = [0.32, 0.46, 0.2, 0.3, 0.34, 0.5][F.brows | 0] ?? 0.32, taper = th * (un > 0.5 ? 1 - (un - 0.5) * 0.9 : 1) + (fem ? -0.04 : 0.04);
      const jag = F.brows === 5 ? (hash(Math.floor(u * 3), 1, 9) - 0.5) * 0.3 : 0;
      if (Math.abs(v - mid) < taper + jag) put(x, y, Math.abs(v - mid) > taper * 0.55 && v < mid ? mix(browC, skin[2], 0.3) : browC);
    }, 0.12);
  }
  // the nose: two nostrils, the shadow under the tip, a soft line down the side away from the light
  const nz = NOSE[F.nose | 0] || NOSE[0];
  if (!covered) patch(0, -0.24, 2.4, (u, v, x, y) => {
    const nw = 0.75 * nz[0];
    if (v < -0.1 * nz[1] - 0.3 && v > -0.1 * nz[1] - 0.55 && Math.abs(Math.abs(u) - nw * 0.55) < 0.17) put(x, y, skin[0], 0.55);
    else if (Math.abs(u + 0.12) < 0.13 && v > 0.2 && v < 1.2 * nz[1]) put(x, y, skin[4], 0.35);   // the light down the bridge
    else if (v < -0.1 * nz[1] - 0.6 && v > -0.1 * nz[1] - 0.95 && Math.abs(u) < nw * 0.9) put(x, y, skin[1], 0.4);
    else if (u > nw * 0.55 && u < nw * 0.55 + 0.32 && v > -0.4 && v < 1.6 * nz[1]) put(x, y, skin[1], 0.35);
    if (age >= 2 && Math.abs(u) > nw + 0.5 && Math.abs(u) < nw + 1.6 && v < -0.35 && v > -2.4) {   // the folds from the nose to the mouth
      const t = (-v - 0.35) / 2.05, cu = nw + 0.65 + t * 0.55;
      if (Math.abs(Math.abs(u) - cu) < 0.16 + age * 0.015) put(x, y, skin[1], 0.25 + age * 0.08);
    }
  }, 0.2);
  // the mouth
  if (!covered) {
    const am = near * turn * 0.12, LIPS = [[1.05, 0.26, 0.36], [1.0, 0.14, 0.22], [1.08, 0.36, 0.5], [1.35, 0.26, 0.36], [0.95, 0.34, 0.38], [0.78, 0.24, 0.32]][F.lips | 0] || [1.05, 0.26, 0.36];
    const [mw, upT, loT] = LIPS;
    const lipC = mk && mk.color && (mk.kind === 'lipstick' || mk.kind === 'glam') ? hexRgb(mk.color) : mk && mk.kind === 'goth' ? [40, 24, 40] : fem || (mk && mk.kind === 'natural') ? mix(skin[2], [196, 70, 78], 0.4) : mix(skin[2], [170, 80, 74], 0.18);
    const lipD = mix(lipC, [20, 10, 14], 0.3), lipL = mix(lipC, [255, 236, 226], 0.22), line = mix(skin[0], [30, 12, 14], 0.4);
    patch(am, -0.45, mw + 1.2, (u, v, x, y) => {
      const un = u / mw;
      if (Math.abs(un) <= 1) {
        const bow = F.lips === 4 ? Math.abs(Math.abs(un) - 0.35) * -0.25 + 0.08 : 0, corner = (1 - un * un);
        if (Math.abs(v) < 0.13 + 0.05 * corner) { put(x, y, line); return; }
        if (v > 0 && v < upT * corner + 0.12 + bow) { put(x, y, lipD, fem || mk ? 1 : 0.7); return; }
        if (v < 0 && v > -(loT * Math.pow(corner, 0.7) + 0.12)) { put(x, y, v < -loT * 0.5 && Math.abs(un) < 0.4 ? lipL : lipC, fem || mk ? 1 : 0.65); return; }
      }
      if (F.dimples && Math.abs(Math.abs(un) - 1.32) < 0.12 && v > -0.35 && v < 0.25) put(x, y, skin[1], 0.8);
      if (age >= 4 && Math.abs(Math.abs(un) - 1.2) < 0.1 && v < -0.2 && v > -0.9) put(x, y, skin[1], 0.4);   // the marionette lines
      if ((A.piercings | 0) & 8 && Math.abs(u - mw * 0.45) < 0.3 && Math.abs(v + loT + 0.2) < 0.3) put(x, y, [214, 218, 226]);
    }, 0.15);
  }
  // the forehead's lines (the 60s on)
  if (age >= 4 && !A.mask) patch(0, 0.62, 3, (u, v, x, y) => { if (Math.abs(u) < 2.4 && (Math.abs(v) < 0.1 || (age >= 5 && Math.abs(v - 0.55) < 0.1))) put(x, y, skin[1], 0.35); }, 0.3);
  // marks: freckles, a beauty mark, blush, a scar, a face tattoo, the nose and brow piercings
  const mark = (az, l2, ext, fn, minFc) => patch(az, l2, ext, fn, minFc);
  if (!A.mask) {
    if (F.freckles) for (let i = 0; i < 14; i++) {
      const az = (hash(i, 3, 17) - 0.5) * 1.3, z = -0.14 + hash(i, 5, 17) * 0.24;
      if (Math.abs(az) < 0.1 && z < -0.05) continue;
      mark(az, z, 0.3, (u, v, x, y) => { if (u * u + v * v < 0.07 + 0.05 * (i & 1)) put(x, y, skin[1], 0.8); }, 0.3);
    }
    if (mk && (mk.kind === 'blush' || mk.kind === 'glam')) for (const s of [-1, 1]) mark(s * 0.62, -0.2, 1.6, (u, v, x, y) => { const d = (u * u) / 1.6 + (v * v) / 0.6; if (d < 1 && bayer(x, y) + 0.5 > d * 0.8) put(x, y, [228, 120, 128], 0.35); }, 0.25);
    if ((A.tattoo | 0) & 16) mark(0.55, -0.02, 0.8, (u, v, x, y) => { if ((Math.abs(u) < 0.14 && Math.abs(v) < 0.55) || (Math.abs(v - 0.15) < 0.14 && Math.abs(u) < 0.4)) put(x, y, [40, 46, 80]); }, 0.3);
    if ((A.piercings | 0) & 4) mark(0.42, 0.42, 0.4, (u, v, x, y) => { if (u * u + v * v < 0.08) put(x, y, [214, 218, 226]); }, 0.3);
    if (!covered) {
      if (F.mole) mark(0.32, -0.36, 0.4, (u, v, x, y) => { if (u * u + v * v < 0.1) put(x, y, [66, 36, 28]); }, 0.35);
      if ((A.piercings | 0) & 2) mark(0.12, -0.27, 0.4, (u, v, x, y) => { if (u * u + v * v < 0.07) put(x, y, [214, 218, 226]); }, 0.4);
      if (A.scar) {
        const SC = [null, [0.5, -0.1, 0.62, -0.3], [0.38, 0.5, 0.38, -0.02], [0.14, -0.38, 0.17, -0.55], [0.03, -0.75, 0.15, -0.77], [0.36, 0.48, 0.5, 0.4]][A.scar | 0];
        if (SC) { const sc = mix(skin[4], [250, 214, 200], 0.3); for (let t = 0; t <= 1; t += 0.1) mark(SC[0] + (SC[2] - SC[0]) * t, SC[1] + (SC[3] - SC[1]) * t, 0.3, (u, v, x, y) => { if (u * u + v * v < 0.06) put(x, y, sc); }, 0.3); }
      }
    }
  }
  // glasses and the like, over the eyes
  if (glasses && eyesAt.length) {
    const gc = hexRgb(A.glassColor || '#1a1a1e'), lens = A.lens ? hexRgb(A.lens) : glasses === 'domino' ? gc : [26, 28, 38], lensD = mix(lens, [0, 0, 0], 0.35);
    for (const s of [-1, 1]) {
      const e = eyesAt.find((q) => q.s === s);
      if (glasses === 'patch' && s === 1) { patch(azE(s), 0.14, 1.6, (u, v, x, y) => { if (Math.abs(u) < 1.2 && v > -0.95 && v < 0.85 - Math.abs(u) * 0.25) put(x, y, Math.abs(v) > 0.7 ? mix(gc, [255, 255, 255], 0.15) : gc); }, 0.1); continue; }
      if (glasses === 'patch') continue;
      if (!e) continue;
      patch(azE(s), 0.12, ew + 1.4, (u, v, x, y) => {
        const uo = u * s, hw = ew + (glasses === 'goggles' ? 0.95 : 0.6), top = glasses === 'goggles' ? 1.0 : 0.72, bot = glasses === 'goggles' ? -0.95 : -0.75;
        const inL = Math.abs(u) <= hw && v <= top && v >= bot, rim = inL && (Math.abs(u) > hw - 0.32 || v > top - 0.3 || v < bot + 0.3);
        if (glasses === 'sun' || glasses === 'domino' || glasses === 'goggles') {
          if (!inL && !(glasses === 'domino' && Math.abs(u) <= hw + 0.5 && v <= top + 0.2 && v >= bot - 0.1)) { if (uo < -hw && uo > -hw - 1.2 && Math.abs(v - top + 0.2) < 0.2) put(x, y, gc); return; }   // the bridge
          if (glasses === 'goggles' && rim) { put(x, y, gc); return; }
          const shine = (u * s + v * 0.8 > 0.3 && u * s + v * 0.8 < 0.65) || (uo < -0.2 && v > top - 0.55 && v < top - 0.3);
          put(x, y, glasses === 'goggles' ? (shine ? mix(hexRgb(A.glassTrim || '#ef7a1a'), [255, 255, 255], 0.4) : hexRgb(A.glassTrim || '#ef7a1a')) : shine && glasses === 'sun' ? mix(lens, [200, 220, 240], 0.5) : v > 0.1 ? lensD : lens);
          return;
        }
        // round glasses: a thin rim round each eye and the bridge
        const ru = Math.abs(u) / hw, rv = (v - (top + bot) / 2) / ((top - bot) / 2), d = ru * ru + rv * rv;
        if (d < 1 && d > 0.62) put(x, y, gc);
        else if (uo < -hw * 0.85 && uo > -hw - 1.2 && Math.abs(v - 0.15) < 0.16) put(x, y, gc);
      }, 0.08);
    }
  }
}
