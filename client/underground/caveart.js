// The caves' own art (the owner, notes 2: "caves are still placeholder art inside"), for the underground view
// (client/underground/view.js, which loads this with itself - nothing of it before you're near a cave):
//   bakeCave(V, g, cx, cy)  a 512 px tile of a cave's rock, floor and water, painted pixel by pixel at 2 px a pixel:
//     the walls' outline worn round (the cells' edges with noise in them), the rock's top dark and the south faces
//     standing up in layered strata with ledge lines, cracks, flowstone, drip teeth under the rim, wet and dark by the
//     water, roots and moss hanging in where the chambers are shallow; the floor mottled, shadowed at the walls'
//     feet, rubble and pebbles toward the walls, puddles, cracks, moss in the den, the sea cave's cobbles, ferns and
//     grass where daylight comes down a shaft; the water deep and dark in the middle, clear and pebbled at the edges,
//     white over the cascades. Each cave has its stone: a mine's grey granite, a cavern's brown basalt; a crystal
//     chamber's rock gone blue-violet, the sea cave's black and wet.
//   the things in it, drawn each frame: stalagmites (and the stalactites over the tall ones), glowing mushrooms, glow
//     ferns, glow-worms' threads, crystal clusters, lanterns hung on the walls, the miners' timber sets, the shafts of
//     daylight with the dust turning in them, and a find lying in the light (shared/caverns.js lightCave; the server
//     decides the find: server/systems/underground.js).
import { C } from '../../shared/underground.js';
import { TILE } from '../../shared/constants.js';

const A = 2;                 // world px to an art pixel
const FACE_H = 26;           // px: how high a wall's south face stands
const hh = (x, y, s = 0) => { let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(s | 0, 0x9e3779b9); h = Math.imul(h ^ (h >>> 15), 0x85ebca6b); h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
function vn(x, y, cell, s) {
  const gx = Math.floor(x / cell), gy = Math.floor(y / cell), fx = x / cell - gx, fy = y / cell - gy;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = hh(gx, gy, s), b = hh(gx + 1, gy, s), c = hh(gx, gy + 1, s), d = hh(gx + 1, gy + 1, s);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}
const BAY = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => v / 16 - 0.5);
const cl = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
const rgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
// a ramp of n shades round a colour, dark to light (the shadows cooler, the lights warmer)
function ramp(h, n = 6, dk = 0.42, lt = 1.5) {
  const c = rgb(h), out = [];
  for (let i = 0; i < n; i++) { const t = i / (n - 1), k = dk + (lt - dk) * t; out.push([cl(c[0] * k + (t - 0.5) * 10, 0, 255), cl(c[1] * k, 0, 255), cl(c[2] * k + (0.5 - t) * 14, 0, 255)]); }
  return out;
}
const pick = (R, v, x, y) => R[cl(Math.floor(v * R.length + BAY[(y & 3) * 4 + (x & 3)] * 0.95), 0, R.length - 1)];
// the stones: [top, face, face's second band, face's third, flowstone], by cave and chamber
const STONE = {
  basalt: { top: ramp('#2e2a26', 5, 0.5, 1.4), face: [ramp('#5c5248'), ramp('#6a5c4c'), ramp('#4e4a46')], flow: ramp('#8c8272', 4, 0.7, 1.3) },
  granite: { top: ramp('#302e2c', 5, 0.5, 1.4), face: [ramp('#66625c'), ramp('#74685c'), ramp('#58585a')], flow: ramp('#9a948a', 4, 0.7, 1.3) },
  crystal: { top: ramp('#26243a', 5, 0.5, 1.5), face: [ramp('#4c4866'), ramp('#5a4a70'), ramp('#3e4a66')], flow: ramp('#8a86b0', 4, 0.7, 1.3) },
  sea: { top: ramp('#222428', 5, 0.5, 1.4), face: [ramp('#3e4044'), ramp('#46443e'), ramp('#363a40')], flow: ramp('#6a7076', 4, 0.7, 1.3) },
};
const FLOOR = ramp('#463e35', 6, 0.5, 1.45), MOSSF = ramp('#36482a', 6, 0.5, 1.5), COB = ramp('#4c4e52', 6, 0.5, 1.5), GRASS = ramp('#4e6a30', 6, 0.5, 1.5);
const PEB = ramp('#6a6258', 5, 0.55, 1.45), WATER = ramp('#16394a', 7, 0.45, 1.9), FOAM = ramp('#c8dce2', 4, 0.8, 1.15), ROOT = ramp('#4a3422', 3, 0.6, 1.3), MOSS = ramp('#4a6a2a', 4, 0.6, 1.4);
const PUD = ramp('#1a2e38', 4, 0.6, 1.6);

// the cells round a tile (M cells of margin), each cave's stone and how deep in each cell is, the shafts near it
const M = 3;
export function bakeCave(V, g, cx, cy) {
  const L = V.L, CT = 512 / TILE, gx0 = cx * CT - M, gy0 = cy * CT - M, GN = CT + 2 * M;
  const code = new Int8Array(GN * GN), opn = new Float32Array(GN * GN), wet = new Float32Array(GN * GN), sty = new Array(GN * GN), dep = new Uint8Array(GN * GN);
  const caves = (L.caves || []).filter((K) => { const R = K.region; return R && R.x0 < gx0 + GN && R.y0 < gy0 + GN && R.x0 + R.w > gx0 && R.y0 + R.h > gy0; });
  if (!caves.length) return false;
  const chs = [];
  for (const K of caves) for (const c of K.chambers) chs.push({ c, K });
  for (let j = 0; j < GN; j++) for (let i = 0; i < GN; i++) {
    const k = j * GN + i, tx = gx0 + i, ty = gy0 + j, x = (tx + 0.5) * TILE, y = (ty + 0.5) * TILE;
    let v = C.ROCK;
    for (const K of caves) { const R = K.region; if (tx >= R.x0 && ty >= R.y0 && tx < R.x0 + R.w && ty < R.y0 + R.h) { v = R.c[(ty - R.y0) * R.w + tx - R.x0]; break; } }
    code[k] = v; opn[k] = v === C.ROCK ? 0 : 1; wet[k] = v === C.RIVER || v === C.POOL || v === C.CASCADE || v === C.DOCK ? 1 : 0;
    // the nearest chamber: its stone and its depth
    let best = null, bd = Infinity;
    for (const q of chs) { const d = Math.hypot(q.c.x - x, q.c.y - y) - (q.c.r || 120); if (d < bd) { bd = d; best = q; } }
    const cav = best && best.K.kind === 'cavern', kind = best && best.c.kind, gl = best && best.c.glow;
    sty[k] = kind === 'sea' ? STONE.sea : kind === 'crystal' || gl === 'crystal' ? STONE.crystal : cav ? STONE.basalt : STONE.granite;
    dep[k] = best ? best.c.depth || 1 : 2;
  }
  const bil = (F, x, y) => {
    const u = x / TILE - 0.5 - gx0, w = y / TILE - 0.5 - gy0, i = Math.floor(u), j = Math.floor(w), fu = u - i, fw = w - j;
    const I = cl(i, 0, GN - 2), J = cl(j, 0, GN - 2), k = J * GN + I;
    return (F[k] * (1 - fu) + F[k + 1] * fu) * (1 - fw) + (F[k + GN] * (1 - fu) + F[k + GN + 1] * fu) * fw;
  };
  const cellK = (x, y) => cl(Math.floor(y / TILE) - gy0, 0, GN - 1) * GN + cl(Math.floor(x / TILE) - gx0, 0, GN - 1);
  const x0 = cx * 512, y0 = cy * 512, AW = 512 / A, MB = Math.ceil(FACE_H / A) + 4, AH = AW + MB;
  // the moss and cobble discs, the shafts (with the grass and ferns in their light) near this tile
  const discs = [], shafts = [];
  for (const K of caves) {
    for (const d of K.moss || []) discs.push({ ...d, k: 1 });
    for (const d of K.cobbles || []) discs.push({ ...d, k: 2 });
    for (const s of K.shafts || []) if (s.x > x0 - 300 && s.x < x0 + 812 && s.y > y0 - 300 && s.y < y0 + 812) shafts.push(s);
  }
  const s0 = (L.seed | 0) ^ 0x5ca1;
  // 1. what each art pixel is: rock (0), floor (1), water (2) - the cells' fields, noise in the edges
  const cls = new Uint8Array(AW * AH), O = new Float32Array(AW * AH), Wt = new Float32Array(AW * AH);
  for (let ay = 0; ay < AH; ay++) for (let ax = 0; ax < AW; ax++) {
    const x = x0 + ax * A + 1, y = y0 + ay * A + 1, i = ay * AW + ax;
    const o = bil(opn, x, y) + (vn(x, y, 30, s0) - 0.5) * 0.6 + (vn(x, y, 9, s0 + 1) - 0.5) * 0.22;
    O[i] = o;
    if (o < 0.5) { cls[i] = 0; continue; }
    const w = bil(wet, x, y) + (vn(x, y, 22, s0 + 2) - 0.5) * 0.34;
    Wt[i] = w; cls[i] = w > 0.5 ? 2 : 1;
  }
  // 2. how far up each rock pixel is from the open floor below it (a wall's south face, FACE_H px of it)
  const run = new Uint16Array(AW * AH);
  for (let ax = 0; ax < AW; ax++) { let r = 999, bw = 0; for (let ay = AH - 1; ay >= 0; ay--) { const i = ay * AW + ax; if (cls[i] === 0) { r++; } else { r = 0; bw = cls[i] === 2 ? 1 : 0; } run[i] = r + (bw << 15) * (r > 0 ? 1 : 0); } }
  // 3. the colours
  const img = new ImageData(AW, AW), D = img.data;
  for (let ay = 0; ay < AW; ay++) for (let ax = 0; ax < AW; ax++) {
    const i = ay * AW + ax, x = x0 + ax * A + 1, y = y0 + ay * A + 1, ck = cellK(x, y), S = sty[ck], c = cls[i];
    let col;
    if (c === 0) {
      const rr = run[i] & 0x7fff, overW = run[i] >> 15, fy = rr * A;
      if (fy > 0 && fy <= FACE_H) {
        // the face: strata in bands (lighter up top, the foot in shadow), ledge lines, cracks, flowstone, drip teeth
        const t = fy / FACE_H, wob = (vn(x, 0, 40, s0 + 4) - 0.5) * 10 + (vn(x, y, 13, s0 + 5) - 0.5) * 3, band = Math.floor((y + wob) / 7), inB = ((y + wob) % 7 + 7) % 7;
        const tone = S.face[Math.floor(hh(band, Math.floor(x / 90), 7) * 3)];
        let v = 0.18 + 0.62 * t + (vn(x, y, 6, s0 + 6) - 0.5) * 0.3 + (inB < 1 ? -0.28 : inB < 2 ? 0.16 : 0);
        if (t < 0.15) v -= 0.25;
        if (hh(Math.floor(x / 4), band, 11) < 0.07) v -= 0.35;                       // (a crack down the band)
        if (overW) v -= 0.22;                                                          // (wet by the water)
        col = pick(tone, cl(v), ax, ay);
        if (overW && hh(ax, ay, 3) > 0.93) col = S.flow[3];                            // (the wet glinting)
        const fl = vn(x, 0, 7, s0 + 8);
        if (fl > 0.8 && t > 0.2) col = pick(S.flow, cl((fl - 0.8) * 4 + t * 0.4), ax, ay);   // (flowstone streaking down)
        const tc = Math.floor(x / 8), tl = hh(tc, 3, s0) < 0.4 ? 3 + hh(tc, 4, s0) * 10 : 0, u = Math.abs((x % 8) - 4) / 4;
        if (tl && FACE_H - fy < tl * (1 - u)) col = pick(S.flow, 0.4 + (1 - u) * 0.5, ax, ay);   // (drip teeth under the rim)
        if (dep[ck] <= 1 && !overW) {                                                  // (shallow under the ground: roots, moss)
          const rc = Math.floor(x / 3), rl = hh(rc, 9, s0) < 0.09 ? 4 + hh(rc, 10, s0) * 18 : 0;
          if (rl && FACE_H - fy < rl && ((x + Math.floor((FACE_H - fy) / 5)) % 3) < 2) col = pick(ROOT, hh(rc, 11) * 0.8 + 0.2, ax, ay);
          if (FACE_H - fy < 3 && vn(x, y, 11, s0 + 12) > 0.55) col = pick(MOSS, 0.6, ax, ay);
        }
      } else {
        // the rock's top: dark, mottled, lighter toward its rim (the lip over a face, the edges onto the open)
        const near = cl((O[i] - 0.18) / 0.32), lip = fy > FACE_H && fy <= FACE_H + 4 ? 0.35 : 0;
        const v = 0.12 + near * 0.45 + lip + (vn(x, y, 12, s0 + 13) - 0.5) * 0.35 + (vn(x, y, 4, s0 + 14) - 0.5) * 0.2;
        col = pick(S.top, cl(v), ax, ay);
        if ((lip || near > 0.75) && dep[ck] <= 1 && vn(x, y, 10, s0 + 15) > 0.62) col = pick(MOSS, 0.4 + near * 0.3, ax, ay);
      }
    } else if (c === 1) {
      // the floor: mottled; dark at the walls' feet and under a face; its kind (moss, cobbles, the shafts' grass)
      const ao = cl((O[i] - 0.5) / 0.4), above = ay > 0 && cls[i - AW] === 0 ? 1 : ay > 1 && cls[i - 2 * AW] === 0 ? 0.6 : ay > 2 && cls[i - 3 * AW] === 0 ? 0.3 : 0;
      let v = 0.46 + (vn(x, y, 15, s0 + 16) - 0.5) * 0.5 + (vn(x, y, 5, s0 + 17) - 0.5) * 0.26;
      v *= 0.55 + 0.45 * ao; v -= above * 0.3;
      let R2 = FLOOR, kind = 0;
      for (const d of discs) if ((x - d.x) * (x - d.x) + (y - d.y) * (y - d.y) < d.r * d.r) { kind = d.k; break; }
      let lit = 0;
      for (const s of shafts) { const q = Math.hypot(x - s.x, y - s.y) / s.r; if (q < 0.8) lit = Math.max(lit, 1 - q / 0.8); }
      if (kind === 1) R2 = MOSSF; else if (kind === 2) R2 = COB;
      if (lit > 0 && vn(x, y, 8, s0 + 18) < lit * 1.1) { R2 = GRASS; v += 0.1; kind = 3; }
      col = pick(R2, cl(v), ax, ay);
      // pebbles and rubble: more toward the walls (a stone a grid cell, lit from the top left)
      const gc = 12, gxk = Math.floor(x / gc), gyk = Math.floor(y / gc), ph = hh(gxk, gyk, s0 + 19);
      if (kind !== 3 && ph < 0.06 + 0.5 * (1 - ao)) {
        const scx = (gxk + 0.25 + hh(gxk, gyk, s0 + 20) * 0.5) * gc, scy = (gyk + 0.25 + hh(gxk, gyk, s0 + 21) * 0.5) * gc, sr = 1.6 + hh(gxk, gyk, s0 + 22) * (2 + 3 * (1 - ao));
        const dx = x - scx, dy = y - scy, q = (dx * dx + dy * dy) / (sr * sr);
        if (q < 1) col = pick(PEB, cl(0.55 - (dx + dy) / sr * 0.35 + (kind === 2 ? 0.1 : 0)), ax, ay);
        else if (q < 1.7 && dx + dy > 0) col = pick(R2, cl(v - 0.3), ax, ay);   // (its shadow)
      }
      // puddles in the open floor, cracks across it
      const pv = vn(x, y, 30, s0 + 23);
      if (!kind && ao > 0.8 && pv > 0.8) col = pv < 0.81 ? pick(FLOOR, cl(v - 0.25), ax, ay) : pick(PUD, cl(0.25 + (pv - 0.8) * 3 + (hh(ax >> 1, ay >> 1, 5) > 0.96 ? 0.6 : 0)), ax, ay);
      else if (!kind && ao > 0.5 && vn(x, y, 80, s0 + 29) > 0.62 && Math.abs(vn(x, y, 46, s0 + 24) - 0.5) < 0.006) col = pick(FLOOR, cl(v - 0.22), ax, ay);
      if (kind === 3 && hh(Math.floor(x / 7), Math.floor(y / 7), s0 + 25) < 0.08 * lit) {   // (a fern in the daylight)
        const fx = (Math.floor(x / 7) + 0.5) * 7, fy2 = (Math.floor(y / 7) + 0.5) * 7, dx = x - fx, dy = y - fy2;
        if (Math.abs(dy + Math.abs(dx) * 0.5) < 1.2 && Math.abs(dx) < 6) col = GRASS[5];
      }
    } else {
      // the water: deep and dark in the middle, clear over pebbles at its edge; white over a cascade
      const w = Wt[i], dd = cl((w - 0.5) * 2.4), v = 0.85 - dd * 0.7 + (vn(x, y, 18, s0 + 26) - 0.5) * 0.12;
      col = pick(WATER, cl(v), ax, ay);
      if (dd < 0.2 && hh(ax >> 1, ay >> 1, s0 + 27) < 0.3) col = pick(PEB, 0.35 + dd, ax, ay);
      if (code[ck] === C.CASCADE) col = pick(FOAM, cl(vn(x, y * 0.5, 5, s0 + 28) * 1.2), ax, ay);
    }
    const j = i * 4; D[j] = col[0]; D[j + 1] = col[1]; D[j + 2] = col[2]; D[j + 3] = 255;
  }
  const small = document.createElement('canvas'); small.width = AW; small.height = AW;
  small.getContext('2d').putImageData(img, 0, 0);
  g.imageSmoothingEnabled = false;
  g.drawImage(small, 0, 0, 512, 512);
  return true;
}

// ---- the things in a cave, drawn each frame ------------------------------------------------------------------------
// a stalagmite (s: its size) - and over the tall ones its stalactite, hanging from the roof toward it
export function spike(g, s) {
  const k = s.s, h = 12 + k * 18, w = 5 + k * 6, x = s.x, y = s.y;
  g.fillStyle = 'rgba(0,0,0,.4)'; g.beginPath(); g.ellipse(x + 5, y + 2, w + 4, w * 0.45 + 2, 0, 0, 6.283); g.fill();
  g.fillStyle = 'rgba(40,60,70,.45)'; g.beginPath(); g.ellipse(x, y + 1, w * 0.8, w * 0.32, 0, 0, 6.283); g.fill();   // (the drip pool round its foot)
  const cone = (x0, y0, ww, hh2, down) => {
    const d = down ? 1 : -1;
    g.fillStyle = '#5a5248'; g.beginPath(); g.moveTo(x0 - ww, y0); g.quadraticCurveTo(x0 - ww * 0.3, y0 + d * hh2 * 0.55, x0, y0 + d * hh2); g.quadraticCurveTo(x0 + ww * 0.3, y0 + d * hh2 * 0.55, x0 + ww, y0); g.closePath(); g.fill();
    g.fillStyle = '#8a7f6e'; g.beginPath(); g.moveTo(x0 - ww * 0.7, y0); g.quadraticCurveTo(x0 - ww * 0.25, y0 + d * hh2 * 0.5, x0 - 0.5, y0 + d * hh2 * 0.96); g.lineTo(x0 - ww * 0.15, y0); g.closePath(); g.fill();
    g.fillStyle = 'rgba(30,24,20,.35)'; for (let r = 1; r < 4; r++) g.fillRect(x0 - ww * (1 - r * 0.22), y0 + d * hh2 * r * 0.22, ww * 2 * (1 - r * 0.22), 1);   // (its growth rings)
    g.fillStyle = 'rgba(230,220,200,.7)'; g.fillRect(x0 - 1, y0 + d * hh2 * 0.93 - 1, 1.5, 1.5);
  };
  cone(x, y, w, h, false);
  if (k > 1.05) { const top = y - h - 26 - k * 10; g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(x - w * 0.9, top - 4, w * 1.8, 4); cone(x + 1, top, w * 0.8, 14 + k * 10, true); }
}
// the glowing things: mushrooms (and glow ferns round them), glow-worms' threads, crystals
export function glowThing(g, gl, now) {
  const pulse = 0.75 + 0.25 * Math.sin(now * 1.3 + gl.x * 0.01);
  if (gl.kind === 'mush') {
    for (let k = 0; k < 4; k++) {   // fronds of glow fern behind them
      const a = -1.9 + k * 0.5 + (hh(gl.x, k, 5) - 0.5) * 0.4, l = 10 + hh(gl.y, k, 6) * 10, bx = gl.x + (hh(gl.x, k, 7) - 0.5) * 30, by = gl.y + 4;
      g.strokeStyle = `rgba(70,200,170,${0.55 * pulse})`; g.lineWidth = 1.2; g.beginPath(); g.moveTo(bx, by); g.quadraticCurveTo(bx + Math.cos(a) * l * 0.6, by + Math.sin(a) * l * 0.6 - 3, bx + Math.cos(a) * l, by + Math.sin(a) * l); g.stroke();
      g.fillStyle = `rgba(120,255,220,${0.7 * pulse})`; for (let f = 1; f < 4; f++) g.fillRect(bx + Math.cos(a) * l * f / 4 - 1, by + Math.sin(a) * l * f / 4 - 1, 1.5, 1.5);
    }
    for (let k = 0; k < 6; k++) {
      const mx = gl.x + (hh(gl.x, k) - 0.5) * 28, my = gl.y + (hh(gl.y, k) - 0.5) * 18, r = 2.5 + hh(k, gl.x) * 3.5, st = 3 + r;
      g.fillStyle = '#d8efe6'; g.fillRect(mx - 0.8, my - st + 1, 1.6, st);
      g.fillStyle = `rgba(40,150,140,${0.9 * pulse})`; g.beginPath(); g.ellipse(mx, my - st + 1, r, r * 0.55, 0, 3.14159, 6.283); g.fill();
      g.fillStyle = `rgba(110,250,225,${0.95 * pulse})`; g.beginPath(); g.ellipse(mx - r * 0.2, my - st, r * 0.7, r * 0.35, 0, 3.14159, 6.283); g.fill();
      g.fillStyle = `rgba(230,255,250,${pulse})`; g.fillRect(mx - r * 0.4, my - st - r * 0.3, 1.2, 1.2); g.fillRect(mx + r * 0.3, my - st - r * 0.1, 1, 1);
    }
  } else if (gl.kind === 'worms') {
    for (let k = 0; k < 18; k++) {
      const wx = gl.x + (hh(gl.x, k, 3) - 0.5) * 100, wy = gl.y + (hh(gl.y, k, 4) - 0.5) * 76, tw = 0.5 + 0.5 * Math.sin(now * (0.7 + hh(k, 9)) + k * 1.7), l = 6 + hh(k, gl.x, 8) * 14;
      const gr = g.createLinearGradient(wx, wy - l, wx, wy);
      gr.addColorStop(0, 'rgba(160,230,255,0)'); gr.addColorStop(1, `rgba(160,230,255,${0.25 + 0.2 * tw})`);
      g.strokeStyle = gr; g.lineWidth = 0.7; g.beginPath(); g.moveTo(wx, wy - l); g.lineTo(wx + Math.sin(now * 0.6 + k) * 0.6, wy); g.stroke();
      for (let b = 1; b < 4; b++) { g.fillStyle = `rgba(180,240,255,${(0.15 + 0.25 * tw) * (b / 4)})`; g.fillRect(wx - 0.5, wy - l * (1 - b / 4), 1, 1); }   // (the beads of its thread)
      g.fillStyle = `rgba(120,230,255,${0.55 + 0.45 * tw})`; g.fillRect(wx - 0.9, wy - 0.9, 1.8, 1.8);
    }
  } else {
    const cH = gl.hue ? [110, 170, 255] : [175, 120, 255];
    for (let k = 0; k < 6; k++) {
      const cx = gl.x + (hh(gl.x, k, 6) - 0.5) * 34, cy = gl.y + (hh(gl.y, k, 7) - 0.5) * 22, h2 = 8 + hh(k, 2, gl.x) * 16, w2 = 2.5 + hh(k, 3, gl.y) * 2.5, lean = (hh(k, 4, gl.x) - 0.5) * 0.7;
      g.save(); g.translate(cx, cy); g.rotate(lean);
      g.fillStyle = `rgba(${cH[0] * 0.45},${cH[1] * 0.45},${cH[2] * 0.6},${0.95})`; g.beginPath(); g.moveTo(-w2, 0); g.lineTo(-w2, -h2 * 0.75); g.lineTo(0, -h2); g.lineTo(w2, -h2 * 0.75); g.lineTo(w2, 0); g.closePath(); g.fill();
      g.fillStyle = `rgba(${cH[0]},${cH[1]},${cH[2]},${0.85 * pulse})`; g.beginPath(); g.moveTo(-w2, 0); g.lineTo(-w2, -h2 * 0.75); g.lineTo(0, -h2); g.lineTo(0, 0); g.closePath(); g.fill();
      g.fillStyle = `rgba(240,240,255,${0.9 * pulse})`; g.fillRect(-w2 + 0.5, -h2 * 0.72, 1, h2 * 0.5);
      g.restore();
    }
    g.fillStyle = `rgba(${cH[0]},${cH[1]},${cH[2]},.25)`; for (let k = 0; k < 8; k++) g.fillRect(gl.x + (hh(k, 1, gl.x) - 0.5) * 40, gl.y + 6 + (hh(k, 2, gl.y) - 0.5) * 10, 2, 1);   // (shards at the foot)
  }
}
// a lantern: on its post (a dock's, by a mouth) or hung on the wall from an iron bracket (l.hung, n toward the rock)
export function lantern(g, l, now) {
  const f = 0.8 + 0.2 * Math.sin(now * 9 + l.x) * Math.sin(now * 5.3 + l.y);
  const lx = l.x, ly = l.y - 24;
  if (l.hung) {
    const wx = l.x + (l.nx || 0) * 14, wy = l.y + (l.ny || 0) * 14 - 34;
    g.strokeStyle = '#2c2a2a'; g.lineWidth = 2; g.beginPath(); g.moveTo(wx, wy); g.lineTo(wx, wy + 4); g.lineTo(lx, ly - 10); g.stroke();
    g.lineWidth = 1; g.beginPath(); g.moveTo(lx, ly - 10); g.lineTo(lx, ly - 6); g.stroke();
    g.fillStyle = '#1e1c1c'; g.fillRect(wx - 2, wy - 2, 4, 6);
  } else {
    g.fillStyle = 'rgba(0,0,0,.35)'; g.beginPath(); g.ellipse(l.x + 3, l.y + 1, 6, 2.5, 0, 0, 6.283); g.fill();
    g.fillStyle = '#3a2614'; g.fillRect(l.x - 2, l.y - 22, 4, 24); g.fillStyle = '#5a3c22'; g.fillRect(l.x - 2, l.y - 22, 1.5, 24);
    g.fillStyle = '#2a2a2e'; g.fillRect(l.x - 5, l.y - 22, 10, 2);
  }
  g.fillStyle = '#26242a'; g.fillRect(lx - 4, ly - 7, 8, 2); g.fillRect(lx - 3.5, ly + 3, 7, 2); g.fillRect(lx - 4, ly - 5, 1, 8); g.fillRect(lx + 3, ly - 5, 1, 8);
  g.fillStyle = `rgba(255,214,130,${0.85 * f})`; g.fillRect(lx - 3, ly - 5, 6, 8);
  g.fillStyle = `rgba(255,250,220,${f})`; g.fillRect(lx - 1, ly - 3, 2, 4);
}
// a timber set across a passage: a post at either wall, the cap beam over them
export function timber(g, t) {
  const nx = -t.uy, ny = t.ux, ax = t.x - nx * t.l, ay = t.y - ny * t.l, bx = t.x + nx * t.r, by = t.y + ny * t.r, H = 34;
  g.fillStyle = 'rgba(0,0,0,.3)'; for (const [x, y] of [[ax, ay], [bx, by]]) { g.beginPath(); g.ellipse(x + 3, y + 2, 6, 3, 0, 0, 6.283); g.fill(); }
  for (const [x, y] of [[ax, ay], [bx, by]]) { g.fillStyle = '#4a3220'; g.fillRect(x - 3, y - H, 6, H); g.fillStyle = '#6e4c2e'; g.fillRect(x - 3, y - H, 2, H); g.fillStyle = '#2e1e12'; g.fillRect(x - 3, y - 3, 6, 3); }
  g.strokeStyle = '#3a2616'; g.lineWidth = 6; g.beginPath(); g.moveTo(ax, ay - H); g.lineTo(bx, by - H); g.stroke();
  g.strokeStyle = '#6a4a2c'; g.lineWidth = 2; g.beginPath(); g.moveTo(ax, ay - H - 2); g.lineTo(bx, by - H - 2); g.stroke();
  g.strokeStyle = 'rgba(20,14,10,.6)'; g.lineWidth = 1; for (const [x, y] of [[ax, ay], [bx, by]]) { g.beginPath(); g.moveTo(x, y - H + 2); g.lineTo(x + (bx - ax) * 0.12 * (x === ax ? 1 : -1), y - H + 2 + (by - ay) * 0.12 * (x === ax ? 1 : -1) + 8); g.stroke(); }   // (the braces)
}
// the daylight down a shaft: a beam leaning in from the opening in the roof, dust turning in it, its pool on the floor
// (drawn over the dark, adding light: k how bright it is outside, tint the sky's colour)
export function shaftBeam(g, s, now, k, tint) {
  if (k <= 0.02) return;
  const tx = s.x + (s.lean || 0), ty = s.y - 260, [r, gg, b] = tint;
  const gr = g.createLinearGradient(tx, ty, s.x, s.y);
  gr.addColorStop(0, `rgba(${r},${gg},${b},0)`); gr.addColorStop(0.45, `rgba(${r},${gg},${b},${0.035 * k})`); gr.addColorStop(1, `rgba(${r},${gg},${b},${0.06 * k})`);
  g.fillStyle = gr;
  for (const f of [1, 0.75, 0.5, 0.28]) {   // (nested: its edges soft, its middle brightest)
    const w0 = s.r * 0.22 * f, w1 = s.r * 0.62 * f, sw = Math.sin(now * 0.3 + f * 5) * 3;
    g.beginPath(); g.moveTo(tx - w0 + sw, ty); g.lineTo(tx + w0 + sw, ty); g.lineTo(s.x + w1, s.y); g.quadraticCurveTo(s.x, s.y + w1 * 0.25, s.x - w1, s.y); g.closePath(); g.fill();
  }
  const w0 = s.r * 0.22, w1 = s.r * 0.62;
  const pr = g.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r * 0.8);
  pr.addColorStop(0, `rgba(${r},${gg},${b},${0.22 * k})`); pr.addColorStop(1, `rgba(${r},${gg},${b},0)`);
  g.fillStyle = pr; g.beginPath(); g.ellipse(s.x, s.y, s.r * 0.8, s.r * 0.5, 0, 0, 6.283); g.fill();
  for (let i = 0; i < 26; i++) {   // the dust in it, turning slowly as it sinks
    const u = (hh(i, 1, s.x) + now * (0.015 + hh(i, 2) * 0.02)) % 1, v = hh(i, 3, s.y) - 0.5, wob = Math.sin(now * 0.7 + i) * 4;
    const x = tx + (s.x - tx) * u + v * (w0 + (w1 - w0) * u) * 1.6 + wob, y = ty + (s.y - ty) * u;
    const a = (0.3 + 0.5 * Math.abs(Math.sin(now * 1.3 + i * 2.1))) * k * Math.sin(u * Math.PI);
    g.fillStyle = `rgba(255,250,235,${a})`; g.fillRect(x, y, 1.4, 1.4);
  }
}
// a find lying in the light (S.ugFind: the server's): an old lantern on its side, or a flashlight - a glint now and then
export function find(g, f, now) {
  const [, x, y, id] = f;
  g.fillStyle = 'rgba(0,0,0,.35)'; g.beginPath(); g.ellipse(x + 2, y + 3, 9, 3, 0, 0, 6.283); g.fill();
  if (id === 'lantern') {
    g.save(); g.translate(x, y); g.rotate(1.25);
    g.fillStyle = '#2a2a2e'; g.fillRect(-5, -8, 10, 2); g.fillRect(-4, 5, 8, 2); g.fillRect(-5, -6, 1, 11); g.fillRect(4, -6, 1, 11);
    g.fillStyle = '#7a6a4a'; g.fillRect(-4, -6, 8, 11); g.fillStyle = '#b8a070'; g.fillRect(-3, -5, 2, 9);
    g.strokeStyle = '#2a2a2e'; g.lineWidth = 1.2; g.beginPath(); g.arc(0, -10, 4, 3.4, 6.0); g.stroke();
    g.restore();
  } else {
    g.save(); g.translate(x, y); g.rotate(0.4);
    g.fillStyle = '#3a3e44'; g.fillRect(-9, -2.5, 14, 5); g.fillStyle = '#5a6068'; g.fillRect(-9, -2.5, 14, 1.5);
    g.fillStyle = '#4a4e56'; g.fillRect(5, -4, 5, 8); g.fillStyle = '#c8c4a8'; g.fillRect(9.5, -3, 1, 6);
    g.restore();
  }
  const t = (now * 0.5 + x * 0.001) % 2.6;
  if (t < 0.3) { const a = Math.sin(t / 0.3 * Math.PI); g.fillStyle = `rgba(255,255,240,${a})`; g.fillRect(x - 0.75, y - 7, 1.5, 7); g.fillRect(x - 3.5, y - 4.25, 7, 1.5); }
}
