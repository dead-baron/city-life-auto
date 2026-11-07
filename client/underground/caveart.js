// The caves' own art (the owner, notes 2: "caves are still placeholder art inside"; 11-06: "cave interior art looks
// unfinished ... we want to have the exit of the cave look like an exit"), for the underground view
// (client/underground/view.js, which loads this with itself - nothing of it before you're near a cave). Concepts: N3
// (the mine cave), MI1, MI2, MI5.
//   bakeCave(V, g, cx, cy)  a 512 px tile of a cave, painted pixel by pixel at the game's art pixel (2 world px) and
//     drawn up 2x with no smoothing, so it is as crisp as the city's ground:
//     - the walls: a south face standing 30-56 px tall in columns of rock (lit on their left, shadowed on their right,
//       ledges across them, flowstone teeth hanging from the lip, wet and dark by the water, roots and moss where the
//       roof is shallow); over it the rock's top heaped with boulders - big and small, the nearer overlapping the
//       further, each a dome lit from the top left with its facets, crevices dark between them - fading into the dark;
//     - the floor: packed earth in patches with crisp edges, grit and specks, pebbles with their light and shadow,
//       rubble thick at the walls' feet, short cracks, puddles, moss in the den, the sea cave's cobbles, grass and ferns
//       where daylight comes down a shaft, the kit's worn paths; the docks' planks;
//     - the water: deep and dark in the middle, clear and pebbled at the edge, a lake glowing teal, white over a cascade;
//     - each way out (K.exits: shared/caverns.js lightCave): the floor turning to the ground outside (grass, dirt, sand),
//       the opening widening into daylight beyond, the rock either side of it lit by the day;
//     - the things that don't move, baked in with it (bakeProps): rails, trestles, docks' posts, stairs, timber sets,
//       stalagmites and stalactites, the kit's and the caverns' things, the lanterns' posts and brackets, the mushrooms
//       and crystals, the den's bed, an adit's timbered portal and the WAY OUT board at every way out.
//   the things that move, drawn each frame (view.js dressing): the lanterns' flames, drops off the stalactites, glow-
//     worms twinkling, bats on the roof, glints; the shafts of daylight and the daylight in at a way out (shaftBeam,
//     exitBeam); a find lying in the light (shared/caverns.js lightCave; the server decides it: server/systems/underground.js).
import { C } from '../../shared/underground.js';
import { TILE } from '../../shared/constants.js';

export const A = 2;          // world px to an art pixel (the game's: client/art2/gbuf.js ART_PX)
const FACE_MIN = 30, FACE_VAR = 26;   // px: how high a wall's south face stands (30..56, varying along it)
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
// a shade of ramp R for v (0..1), ordered-dithered between its two nearest shades (amp: how much of a step it dithers)
const pick = (R, v, x, y, amp = 0.95) => R[cl(Math.floor(v * R.length + BAY[(y & 3) * 4 + (x & 3)] * amp), 0, R.length - 1)];
// the stones: the rock's top (the dark it fades into), its faces' three tones, flowstone; a scene's own floor
const STONE = {
  basalt: { top: ramp('#2e2a26', 5, 0.5, 1.4), face: [ramp('#5c5248', 7), ramp('#6a5c4c', 7), ramp('#4e4a46', 7)], flow: ramp('#8c8272', 4, 0.7, 1.3) },
  granite: { top: ramp('#302e2c', 5, 0.5, 1.4), face: [ramp('#66625c', 7), ramp('#74685c', 7), ramp('#58585a', 7)], flow: ramp('#9a948a', 4, 0.7, 1.3) },
  crystal: { top: ramp('#26243a', 5, 0.5, 1.5), face: [ramp('#4c4866', 7), ramp('#5a4a70', 7), ramp('#3e4a66', 7)], flow: ramp('#8a86b0', 4, 0.7, 1.3) },
  sea: { top: ramp('#222428', 5, 0.5, 1.4), face: [ramp('#3e4044', 7), ramp('#46443e', 7), ramp('#363a40', 7)], flow: ramp('#6a7076', 4, 0.7, 1.3) },
  // (the mine cave scene's, shared/cavekit.js: N3's warm purple-brown rock; Copper Gulch's red)
  mine: { floor: ramp('#5e4632', 6, 0.5, 1.5), top: ramp('#2c2428', 5, 0.5, 1.45), face: [ramp('#625058', 7), ramp('#6e5a52', 7), ramp('#544a56', 7)], flow: ramp('#9a8278', 4, 0.7, 1.3) },
  red: { floor: ramp('#6a4a32', 6, 0.5, 1.5), top: ramp('#36241e', 5, 0.5, 1.45), face: [ramp('#80482e', 7), ramp('#8e5634', 7), ramp('#62402e', 7)], flow: ramp('#b88262', 4, 0.7, 1.3) },
};
const FLOOR = ramp('#524638', 7, 0.5, 1.5), MOSSF = ramp('#36482a', 6, 0.5, 1.5), COB = ramp('#4c4e52', 6, 0.5, 1.5), GRASS = ramp('#4e6a30', 6, 0.5, 1.5);
const PEB = ramp('#6a6258', 5, 0.55, 1.5), WATER = ramp('#16394a', 7, 0.45, 1.9), FOAM = ramp('#c8dce2', 4, 0.8, 1.15), ROOT = ramp('#4a3422', 3, 0.6, 1.3), MOSS = ramp('#4a6a2a', 4, 0.6, 1.4);
const PUD = ramp('#1a2e38', 4, 0.6, 1.6), PUDW = ramp('#2a4a5a', 6, 0.5, 2.1), TEAL = ramp('#1d6a76', 7, 0.42, 2.0), PLANK = ramp('#6a4a2e', 5, 0.5, 1.4);
// the ground outside a way out, by what lies outside it; the daylight beyond, too bright to see into
const OUTSIDE = { grass: ramp('#5a7a34', 6, 0.55, 1.45), dirt: ramp('#8a7254', 6, 0.55, 1.4), sand: ramp('#c2ae86', 6, 0.6, 1.25), redsand: ramp('#b4703e', 6, 0.55, 1.4) };
const TUFT = { grass: ramp('#6e9a3c', 3, 0.7, 1.4), dirt: ramp('#7a8a3e', 3, 0.7, 1.35), sand: ramp('#8a9a5a', 3, 0.7, 1.3), redsand: ramp('#a8a050', 3, 0.7, 1.3) };
const GLARE = [[255, 236, 196], [255, 244, 218], [255, 250, 236]];
// what lies outside a way out (E: a cave's exit): the map's ground at the mouth if the map has it there, else by its kind
export function exitGround(E, map, stone) {
  const t = map && map.tileAtPx && map.inside && map.inside(Math.floor(E.x / TILE), Math.floor((E.y + 40) / TILE)) ? map.tileAtPx(E.x, E.y + 40) : -1;
  if (t === 1 || t === 11) return 'grass';   // (T.GRASS, T.FIELD)
  if (t === 8) return stone === 'red' ? 'redsand' : 'sand';   // (T.SAND)
  if (t === 10 || t === 3 || t === 2) return stone === 'red' ? 'redsand' : 'dirt';   // (T.DIRT, a road, a sidewalk)
  return E.kind === 'sea' ? 'sand' : E.kind === 'falls' ? 'grass' : stone === 'red' ? 'redsand' : 'dirt';
}

// the cells round a tile (M cells of margin), each cave's stone and how deep in each cell is, the shafts near it
const M = 3;
export function bakeCave(V, g, cx, cy) {
  const L = V.L, CT = 512 / TILE, gx0 = cx * CT - M, gy0 = cy * CT - M, GN = CT + 2 * M;
  const code = new Int8Array(GN * GN), opn = new Float32Array(GN * GN), wet = new Float32Array(GN * GN), sty = new Array(GN * GN), dep = new Uint8Array(GN * GN);
  const caves = (L.caves || []).filter((K) => { const R = K.region; return R && ((R.x0 < gx0 + GN && R.y0 < gy0 + GN && R.x0 + R.w > gx0 && R.y0 + R.h > gy0) || (K.exits || []).some((E) => E.x > cx * 512 - 260 && E.x < cx * 512 + 772 && E.y > cy * 512 - 260 && E.y < cy * 512 + 772)); });
  if (!caves.length) return false;
  const chs = [];
  for (const K of caves) for (const c of K.chambers) chs.push({ c, K });
  for (let j = 0; j < GN; j++) for (let i = 0; i < GN; i++) {
    const k = j * GN + i, tx = gx0 + i, ty = gy0 + j, x = (tx + 0.5) * TILE, y = (ty + 0.5) * TILE;
    let v = C.ROCK;
    for (const K of caves) { const R = K.region; if (tx >= R.x0 && ty >= R.y0 && tx < R.x0 + R.w && ty < R.y0 + R.h) { v = R.c[(ty - R.y0) * R.w + tx - R.x0]; break; } }
    code[k] = v; opn[k] = v === C.ROCK ? 0 : 1; wet[k] = v === C.RIVER || v === C.POOL || v === C.CASCADE ? 1 : 0;
    // the nearest chamber: its stone and its depth
    let best = null, bd = Infinity;
    for (const q of chs) { const d = Math.hypot(q.c.x - x, q.c.y - y) - (q.c.r || 120); if (d < bd) { bd = d; best = q; } }
    const cav = best && best.K.kind === 'cavern', kind = best && best.c.kind, gl = best && best.c.glow;
    sty[k] = kind === 'sea' ? STONE.sea : kind === 'crystal' || gl === 'crystal' ? STONE.crystal : best && best.c.stone ? STONE[best.c.stone] : cav ? STONE.basalt : STONE.granite;
    dep[k] = best ? best.c.depth || 1 : 2;
  }
  const bil = (F, x, y) => {
    const u = x / TILE - 0.5 - gx0, w = y / TILE - 0.5 - gy0, i = Math.floor(u), j = Math.floor(w), fu = u - i, fw = w - j;
    const I = cl(i, 0, GN - 2), J = cl(j, 0, GN - 2), k = J * GN + I;
    return (F[k] * (1 - fu) + F[k + 1] * fu) * (1 - fw) + (F[k + GN] * (1 - fu) + F[k + GN + 1] * fu) * fw;
  };
  const cellK = (x, y) => cl(Math.floor(y / TILE) - gy0, 0, GN - 1) * GN + cl(Math.floor(x / TILE) - gx0, 0, GN - 1);
  const x0 = cx * 512, y0 = cy * 512, AW = 512 / A, MB = Math.ceil((FACE_MIN + FACE_VAR) / A) + 4, AH = AW + MB;
  // the moss and cobble discs, the shafts (with the grass and ferns in their light), the ways out near this tile
  const discs = [], shafts = [], lakes = [], segs = [], exits = [];
  for (const K of caves) {
    if (K.kit) { for (const d of K.kit.puddles) discs.push({ ...d, k: 4 }); for (const d of K.kit.lakes) lakes.push(d); for (const pl of K.kit.paths || []) for (let i = 1; i < pl.length; i++) segs.push([pl[i - 1][0], pl[i - 1][1], pl[i][0], pl[i][1]]); }   // (the kit's: shared/cavekit.js)
    for (const d of K.moss || []) discs.push({ ...d, k: 1 });
    for (const d of K.cobbles || []) discs.push({ ...d, k: 2 });
    for (const s of K.shafts || []) if (s.x > x0 - 300 && s.x < x0 + 812 && s.y > y0 - 300 && s.y < y0 + 812) shafts.push(s);
    for (const E of K.exits || []) if (E.x > x0 - 400 && E.x < x0 + 912 && E.y > y0 - 400 && E.y < y0 + 912) exits.push({ E, G: OUTSIDE[E.ground || 'dirt'], T: TUFT[E.ground || 'dirt'], grass: (E.ground || 'dirt') === 'grass' });
  }
  const s0 = (L.seed | 0) ^ 0x5ca1;
  const opAt = (x, y) => bil(opn, x, y) + (vn(x, y, 30, s0) - 0.5) * 0.6 + (vn(x, y, 9, s0 + 1) - 0.5) * 0.22;
  // 1. what each art pixel is: rock (0), floor (1), water (2) - the cells' fields, noise in the edges
  const cls = new Uint8Array(AW * AH), O = new Float32Array(AW * AH), Wt = new Float32Array(AW * AH);
  for (let ay = 0; ay < AH; ay++) for (let ax = 0; ax < AW; ax++) {
    const x = x0 + ax * A + 1, y = y0 + ay * A + 1, i = ay * AW + ax;
    const o = opAt(x, y);
    O[i] = o;
    if (o < 0.5) { cls[i] = 0; continue; }
    const w = bil(wet, x, y) + (vn(x, y, 22, s0 + 2) - 0.5) * 0.34;
    Wt[i] = w; cls[i] = w > 0.5 ? 2 : 1;
  }
  // 2. how far up each rock pixel is from the open floor below it (a wall's south face)
  const run = new Uint16Array(AW * AH);
  for (let ax = 0; ax < AW; ax++) { let r = 999, bw = 0; for (let ay = AH - 1; ay >= 0; ay--) { const i = ay * AW + ax; if (cls[i] === 0) { r++; } else { r = 0; bw = cls[i] === 2 ? 1 : 0; } run[i] = Math.min(r, 0x7fff) | (r > 0 && bw ? 0x8000 : 0); } }
  // 2b. how far each rock pixel lies from the open (art px x3, a chamfer pass each way over the tile and a margin round
  // it, so the tiles meet): the boulders fade into the dark
  const PD = 64, PW = AW + 2 * PD, PH = AH + 2 * PD, pf = new Uint16Array(PW * PH);
  for (let py = 0; py < PH; py++) for (let px = 0; px < PW; px++) {
    const ax = px - PD, ay = py - PD, j = py * PW + px;
    if (ax >= 0 && ay >= 0 && ax < AW && ay < AH) { pf[j] = cls[ay * AW + ax] === 0 ? 999 : 0; continue; }
    pf[j] = opAt(x0 + ax * A + 1, y0 + ay * A + 1) < 0.5 ? 999 : 0;
  }
  for (let py = 0; py < PH; py++) for (let px = 0; px < PW; px++) { const i = py * PW + px; if (!pf[i]) continue; let v = pf[i]; if (px) v = Math.min(v, pf[i - 1] + 3); if (py) { v = Math.min(v, pf[i - PW] + 3); if (px) v = Math.min(v, pf[i - PW - 1] + 4); if (px < PW - 1) v = Math.min(v, pf[i - PW + 1] + 4); } pf[i] = v; }
  for (let py = PH - 1; py >= 0; py--) for (let px = PW - 1; px >= 0; px--) { const i = py * PW + px; if (!pf[i]) continue; let v = pf[i]; if (px < PW - 1) v = Math.min(v, pf[i + 1] + 3); if (py < PH - 1) { v = Math.min(v, pf[i + PW] + 3); if (px < PW - 1) v = Math.min(v, pf[i + PW + 1] + 4); if (px) v = Math.min(v, pf[i + PW - 1] + 4); } pf[i] = v; }
  const far = (ax, ay) => pf[(ay + PD) * PW + ax + PD];
  // 3. the colours
  const img = new ImageData(AW, AW), D = img.data;
  const out = { s: 0, w: 0, X: null };
  for (let ay = 0; ay < AW; ay++) for (let ax = 0; ax < AW; ax++) {
    const i = ay * AW + ax, x = x0 + ax * A + 1, y = y0 + ay * A + 1, ck = cellK(x, y), S = sty[ck];
    let c = cls[i], col = null;
    // a way out near: where this pixel lies along it (s: px out past the mouth, w: across it)
    let X = null;
    for (const q of exits) { const E = q.E, dx = x - E.x, dy = y - E.y, s = dx * E.ux + dy * E.uy; if (s < -190 || s > 230) continue; const w = -dx * E.uy + dy * E.ux; if (Math.abs(w) > 150) continue; X = q; out.s = s; out.w = w; break; }
    if (X) {
      const E = X.E, s = out.s, aw = Math.abs(out.w), hwN = E.hw + (vn(x, y, 14, s0 + 70) - 0.5) * 10 + Math.max(0, s) * 0.32;
      if (s > -4 && aw < hwN) {   // (the opening, and the day beyond it - further out the view ends in the dark)
        const b = BAY[(ay & 3) * 4 + (ax & 3)] + 0.5;
        if (s > 140 && (s - 140) / 70 > b * 0.85 + (vn(x, y, 16, s0 + 78) - 0.5) * 0.4) c = 0;
        else { D.set(outsidePx(X, x, y, ax, ay, s, aw / hwN, s0), i * 4); D[i * 4 + 3] = 255; continue; }
      }
      if (c === 1 && s > -170) {   // (the floor turning to the ground outside, toward the mouth)
        const p = (s + 170) / 166;
        if (vn(x, y, 11, s0 + 72) + (hh(ax >> 1, ay >> 1, s0 + 71) - 0.5) * 0.12 < p * 1.15 - 0.2) { D.set(outsidePx(X, x, y, ax, ay, Math.min(-1, s), 0, s0), i * 4); D[i * 4 + 3] = 255; continue; }
      }
      if (c === 0 && s > -70 && s < 60 && aw < hwN + 46) X.rim = cl(1 - (aw - hwN) / 46) * (1 - Math.max(0, -s) / 70); else X.rim = 0;
    }
    const rim = X ? X.rim : 0;
    if (c === 0) col = rockPx(S, x, y, ax, ay, run[i], far(ax, ay), O[i], dep[ck], rim, s0);
    else if (c === 1) {
      if (code[ck] === C.DOCK && !V.onTrestle(x, y)) col = plankPx(x, y, ax, ay);
      else col = floorPx(S, x, y, ax, ay, i, AW, cls, O, discs, shafts, segs, s0);
    } else col = waterPx(S, x, y, ax, ay, Wt[i], lakes, code[ck], s0);
    const j = i * 4; D[j] = col[0]; D[j + 1] = col[1]; D[j + 2] = col[2]; D[j + 3] = 255;
  }
  const small = document.createElement('canvas'); small.width = AW; small.height = AW;
  const sg = small.getContext('2d');
  sg.putImageData(img, 0, 0);
  // 4. the things that don't move, drawn into the same art pixels
  sg.setTransform(1 / A, 0, 0, 1 / A, -x0 / A, -y0 / A);
  bakeProps(V, sg, caves, x0, y0);
  sg.setTransform(1, 0, 0, 1, 0, 0);
  g.imageSmoothingEnabled = false;
  g.drawImage(small, 0, 0, 512, 512);
  return true;
}

// a wall: its south face (fy px up from the floor below it, while under the face's height there) or the rock's top,
// heaped with boulders that fade into the dark (dpx: how far from the open); rim: the daylight from a way out on it
function rockPx(S, x, y, ax, ay, rn, farV, o, depth, rim, s0) {
  const rr = rn & 0x7fff, overW = rn & 0x8000, fy = rr * A, fh = FACE_MIN + Math.floor(vn(x, 0, 64, s0 + 60) * FACE_VAR);
  if (fy > 0 && fy <= fh) {
    // the face: columns of rock (lit left, shadowed right), ledges across them, the foot in shadow, flowstone teeth
    const t = fy / fh, xx = x + (vn(x, y, 26, s0 + 61) - 0.5) * 7, cw = 9, col = Math.floor(xx / cw), u = xx / cw - col;
    const tone = S.face[Math.floor(hh(col, 7, s0) * 3)], off = hh(col, 2, s0) * 14, band = Math.floor((y + off) / 15), inB = (y + off) - band * 15;
    let v = 0.3 + 0.42 * t + (hh(col, 1, s0) - 0.5) * 0.2 + (vn(x, y, 5, s0 + 6) - 0.5) * 0.12;
    if (u < 0.22) v += 0.15; else if (u > 0.78) v -= 0.2;
    if (inB < 2 && hh(col, band, 11) < 0.55) v -= 0.3; else if (inB < 4 && hh(col, band, 11) < 0.55) v += 0.08;
    if (t < 0.14) v -= 0.22 * (1 - t / 0.14);
    if (t > 0.9) v += 0.1;
    if (overW) v -= 0.24;
    v += rim * 0.3;
    let c = pick(tone, cl(v), x >> 1, y >> 1, 0.6);
    if (overW && hh(x >> 1, y >> 1, 3) > 0.94) c = S.flow[3];                            // (the wet glinting)
    const tl = hh(col, 3, s0) < 0.42 ? (0.22 + hh(col, 4, s0) * 0.5) * fh : 0, tu = Math.abs(u - 0.5) * 2;
    if (tl && fh - fy < tl * (1 - tu * tu)) c = pick(S.flow, cl(0.35 + (u < 0.5 ? 0.35 : 0) + (1 - (fh - fy) / tl) * 0.2), x >> 1, y >> 1, 0.5);   // (flowstone teeth hanging from the lip)
    if (depth <= 1 && !overW) {                                                         // (shallow under the ground: roots, moss)
      const rc = Math.floor(x / 3), rl = hh(rc, 9, s0) < 0.07 ? 4 + hh(rc, 10, s0) * 18 : 0;
      if (rl && fh - fy < rl && ((x + Math.floor((fh - fy) / 5)) % 3) < 2) c = pick(ROOT, hh(rc, 11) * 0.8 + 0.2, x >> 1, y >> 1);
      if (fh - fy < 3 && vn(x, y, 11, s0 + 12) > 0.55) c = pick(MOSS, 0.6, x >> 1, y >> 1);
    }
    return c;
  }
  // the top: boulders, the nearer (lower on the screen) over the further, domes lit from the top left
  const dpx = farV / 3 * A, fade = cl(1 - (dpx - 22) / 120);
  if (fade <= 0) return pick(S.top, cl(0.05 + (vn(x, y, 40, s0 + 62) - 0.5) * 0.08), ax, ay, 0.5);
  const cs = 26, gx = Math.floor(x / cs), gy = Math.floor(y / cs);
  let bx = 0, by = 0, br = 0, bq = 2, bid = 0, bestY = -1e9;
  for (let j = -1; j <= 1; j++) for (let k = -1; k <= 1; k++) {
    const qx = gx + k, qy = gy + j, cxb = (qx + 0.2 + hh(qx, qy, s0 + 50) * 0.6) * cs, cyb = (qy + 0.2 + hh(qx, qy, s0 + 51) * 0.6) * cs, r = cs * (0.5 + hh(qx, qy, s0 + 52) * 0.42);
    const dx = x - cxb, dy = (y - cyb) * 1.18, q = (dx * dx + dy * dy) / (r * r);
    if (q < 1 && cyb > bestY) { bestY = cyb; bx = dx; by = dy; br = r; bq = q; bid = qx * 7919 + qy; }
  }
  if (bq >= 1) return pick(S.top, cl(0.04 + 0.08 * fade), ax, ay, 0.4);   // (the crevices between them)
  const nz = Math.sqrt(1 - bq), nx = bx / br, ny = by / br, f = Math.floor(((Math.atan2(ny, nx) + 3.1416) / 6.2832) * 5 + hh(bid, 1, s0) * 5) % 5;
  const lam = -0.45 * nx - 0.55 * ny + 0.7 * nz;
  let v = 0.1 + Math.round(lam * 5) / 5 * 0.64 + (hh(bid, f + 2, s0) - 0.5) * 0.2 + (vn(x, y, 6, s0 + 53) - 0.5) * 0.08;   // (its light in steps, each facet its own tilt)
  if (bq > 0.78 && nx + ny > 0.2) v -= 0.16;                                             // (its shadowed rim, low right)
  if (fy > fh && fy <= fh + 4) v += 0.12;                                                // (the lip over a face)
  v = v * (0.25 + 0.75 * fade) + rim * 0.32;
  let c = pick(S.face[Math.floor(hh(bid, 54) * 3)], cl(v), ax, ay, 0.55);
  if (v > 0.62 && !rim && hh(ax, ay, s0 + 55) > 0.8) c = S.flow[3];                     // (the light catching it)
  if (depth <= 1 && ny < -0.45 && fade > 0.6 && vn(x, y, 10, s0 + 15) > 0.7) c = pick(MOSS, 0.4 + nz * 0.3, ax, ay);   // (moss on the tops near the open)
  return c;
}

// the floor: packed earth in patches with crisp edges, grit, pebbles, rubble at the walls' feet, cracks; its kind
// (moss, cobbles, the shafts' grass, a puddle, a worn path)
function floorPx(S, x, y, ax, ay, i, AW, cls, O, discs, shafts, segs, s0) {
  const ao = cl((O[i] - 0.5) / 0.45), above = ay > 0 && cls[i - AW] === 0 ? 1 : ay > 1 && cls[i - 2 * AW] === 0 ? 0.65 : ay > 2 && cls[i - 3 * AW] === 0 ? 0.35 : 0;
  const pn = vn(x, y, 46, s0 + 16) * 0.6 + vn(x, y, 13, s0 + 17) * 0.4;
  let v = 0.5 + (pn < 0.4 ? -0.1 : pn > 0.6 ? 0.08 : 0) + (vn(x, y, 120, s0 + 18) - 0.5) * 0.12;
  const gr = hh(ax, ay, s0 + 60);
  if (gr < 0.07) v += 0.14; else if (gr > 0.93) v -= 0.13;                               // (grit)
  v *= 0.5 + 0.5 * ao; v -= above * 0.28;
  let R2 = S.floor || FLOOR, kind = 0;
  for (const d of discs) if ((x - d.x) * (x - d.x) + (y - d.y) * (y - d.y) < d.r * d.r) { kind = d.k; break; }
  let lit = 0;
  for (const s of shafts) { const q = Math.hypot(x - s.x, y - s.y) / s.r; if (q < 0.8) lit = Math.max(lit, 1 - q / 0.8); }
  if (kind === 1) R2 = MOSSF; else if (kind === 2) R2 = COB;
  if (kind === 4) {   // (a puddle: its edge wavering, shallow - the floor showing at its rim, a sheen of the light across it)
    let pq = 9;
    for (const d of discs) if (d.k === 4) pq = Math.min(pq, Math.hypot(x - d.x, y - d.y) / d.r + (vn(x, y, 10, s0 + 40) - 0.5) * 0.5);
    if (pq < 0.82) { const sh = vn(x * 0.6, y * 1.6, 12, s0 + 49); return pq > 0.62 ? pick(R2, cl(v - 0.12), ax, ay) : pick(PUDW, cl(0.3 + (0.62 - pq) * 0.5 + (sh > 0.6 ? 0.35 : 0) + (hh(ax >> 1, ay, 9) > 0.96 ? 0.4 : 0)), ax, ay); }
    if (pq < 1.05) v -= 0.18;
    kind = 0;
  }
  if (lit > 0 && vn(x, y, 8, s0 + 18) < lit * 1.1) { R2 = GRASS; v += 0.1; kind = 3; }
  if (segs.length && !kind) {   // (a worn path: packed earth, paler and smoother, two ruts down it; gravel strewn off it)
    let pd = 1e9;
    for (const [sx, sy, ex, ey] of segs) { const dx = ex - sx, dy = ey - sy, l2 = dx * dx + dy * dy || 1, u = cl(((x - sx) * dx + (y - sy) * dy) / l2), qx = sx + dx * u - x, qy = sy + dy * u - y; pd = Math.min(pd, qx * qx + qy * qy); }
    const pr = Math.sqrt(pd); pd = pr + (vn(x, y, 14, s0 + 44) - 0.5) * 14;
    if (pd < 26) { v = 0.6 + (pn < 0.45 ? -0.04 : 0.03) + (gr < 0.05 ? 0.1 : gr > 0.95 ? -0.1 : 0) - (Math.abs(pr - 9) < 1.6 && hh(ax >> 2, ay >> 2, s0 + 45) > 0.15 ? 0.1 : 0); kind = 5; }   // (the ruts: straight along it, worn in and out)
  }
  let col = pick(R2, cl(v), ax, ay, 0.5);
  // pebbles (a stone a grid cell, lit from the top left, its shadow low right) - and rubble, bigger, at the walls' feet
  for (const [gc, sd, big] of [[12, 19, 0], [22, 23, 1]]) {
    if (kind === 3 || kind === 5) break;
    const gxk = Math.floor(x / gc), gyk = Math.floor(y / gc), ph = hh(gxk, gyk, s0 + sd);
    if (ph > (big ? 0.85 * (1 - ao) * (1 - ao) : 0.05 + 0.6 * (1 - ao))) continue;
    const scx = (gxk + 0.25 + hh(gxk, gyk, s0 + sd + 1) * 0.5) * gc, scy = (gyk + 0.25 + hh(gxk, gyk, s0 + sd + 2) * 0.5) * gc, sr = big ? 3 + hh(gxk, gyk, s0 + sd + 3) * 5 : 1.6 + hh(gxk, gyk, s0 + sd + 3) * 2.4;
    const dx = x - scx, dy = y - scy, q = (dx * dx + dy * dy * 1.3) / (sr * sr);
    if (q < 1) { col = pick(big ? S.face[Math.floor(hh(gxk, gyk, 5) * 3)] : PEB, cl(0.55 - (dx + dy) / sr * 0.3 + (q < 0.3 && dx + dy < 0 ? 0.15 : 0)), ax, ay, 0.4); break; }
    if (q < 1.9 && dx + dy > 0) { col = pick(R2, cl(v - 0.3), ax, ay, 0.4); break; }   // (its shadow)
  }
  // short cracks across the open floor (never long rings)
  if (!kind && ao > 0.6) {
    const cg = 44, qx = Math.floor(x / cg), qy = Math.floor(y / cg);
    if (hh(qx, qy, s0 + 29) < 0.22) {   // (a crack: three short jagged legs from a point)
      const ox = (qx + 0.3 + hh(qx, qy, s0 + 30) * 0.4) * cg, oy = (qy + 0.3 + hh(qx, qy, s0 + 31) * 0.4) * cg;
      for (let k = 0; k < 3; k++) {
        const a = hh(qx, qy, s0 + 32 + k) * 6.283, ln = 6 + hh(qx, qy, s0 + 35 + k) * 12, ex = ox + Math.cos(a) * ln, ey = oy + Math.sin(a) * ln * 0.7;
        const dx = ex - ox, dy = ey - oy, u = cl(((x - ox) * dx + (y - oy) * dy) / (dx * dx + dy * dy || 1)), jx = (hh(Math.floor(u * 4), k, qx + qy) - 0.5) * 3;
        if (Math.hypot(ox + dx * u + jx - x, oy + dy * u - y) < 1.3) { col = pick(R2, cl(v - 0.26), ax, ay, 0.2); break; }
      }
    }
  }
  if (kind === 3 && hh(Math.floor(x / 7), Math.floor(y / 7), s0 + 25) < 0.2 * lit) {   // (a fern in the daylight)
    const fx = (Math.floor(x / 7) + 0.5) * 7, fy2 = (Math.floor(y / 7) + 0.5) * 7, dx = x - fx, dy = y - fy2;
    if (Math.abs(dy + Math.abs(dx) * 0.5) < 1.2 && Math.abs(dx) < 6) col = GRASS[5];
  }
  return col;
}
// the water: deep and dark in the middle, clear over pebbles at its edge, a light rim where it laps; a lake that glows;
// white over a cascade
function waterPx(S, x, y, ax, ay, w, lakes, v0, s0) {
  const dd = cl((w - 0.5) * 2.4), v = 0.85 - dd * 0.7 + (vn(x, y, 18, s0 + 26) - 0.5) * 0.12;
  let lk = 0, col;
  for (const d of lakes) { const q = Math.hypot(x - d.x, y - d.y) / d.r; if (q < 1) lk = Math.max(lk, 1 - q); }
  if (lk > 0) {   // (a lake that glows: clear teal over its pebbles, the light's net rippling on its bed)
    const net = Math.abs(vn(x, y, 26, s0 + 41) - 0.5) < 0.035 || Math.abs(vn(x + 13, y, 17, s0 + 42) - 0.5) < 0.03;
    col = pick(TEAL, cl(0.78 - dd * 0.62 + Math.min(0.12, lk * 0.2) + (net ? 0.13 : 0) + (vn(x, y, 18, s0 + 26) - 0.5) * 0.12), ax, ay);
  } else col = pick(WATER, cl(v), ax, ay);
  if (dd < 0.2 && hh(ax >> 1, ay >> 1, s0 + 27) < 0.3) col = pick(PEB, 0.35 + dd, ax, ay);
  if (dd < 0.05) col = WATER[6];   // (where it laps)
  if (v0 === C.CASCADE) col = pick(FOAM, cl(vn(x, y * 0.5, 5, s0 + 28) * 1.2), ax, ay);
  return col;
}
// a dock's planks over the water (across it, a dark seam between, a nail now and then)
function plankPx(x, y, ax, ay) {
  const b = Math.floor(y / 8), inB = y - b * 8, k = hh(b, Math.floor(x / 60), 3);
  if (inB < 2) return PLANK[0];
  return pick(PLANK, cl(0.45 + (k - 0.5) * 0.3 + (inB < 4 ? 0.15 : 0) + (hh(Math.floor(x / 3), b, 5) - 0.5) * 0.12), ax, ay, 0.4);
}
// the ground outside a way out, and the daylight past it (t: how far across the opening, 0 the middle - 1 its side)
function outsidePx(X, x, y, ax, ay, s, t, s0) {
  const G = X.G, glare = cl((s - 80) / 90) * (1 - t * 0.6), b = BAY[(ay & 3) * 4 + (ax & 3)] + 0.5;
  if (glare > 0.02 && glare > b) return GLARE[Math.min(2, Math.floor(glare * 3))];
  let v = 0.42 + (vn(x, y, 12, s0 + 73) - 0.5) * 0.3 + cl(s / 120) * 0.3 - t * t * 0.18;
  const gr = hh(ax, ay, s0 + 74);
  if (gr < 0.08) v += 0.16; else if (gr > 0.92) v -= 0.14;
  let c = pick(G, cl(v), ax, ay, 0.7);
  if (X.grass ? hh(ax, ay >> 1, s0 + 75) < 0.22 : hh(Math.floor(x / 9), Math.floor(y / 9), s0 + 76) < 0.12 && Math.abs((x % 9) - 4.5) < 2 && (y % 9) < 4) c = pick(X.T, cl(v + 0.1), ax, ay);   // (blades of grass; a tuft on the dirt or the sand)
  else if (hh(Math.floor(x / 10), Math.floor(y / 10), s0 + 77) < 0.08 && (x % 10) < 3 && (y % 10) < 3) c = pick(PEB, cl(0.7 - (x % 10 + y % 10) * 0.08), ax, ay);   // (a pebble)
  return c;
}

// ---- the things in a cave (baked into the tiles: now === null; or their moving part, drawn each frame) -----------------
// a stalagmite (s: its size) - and over the tall ones its stalactite, hanging from the roof toward it
export function spike(g, s) {
  const k = s.s, h = 12 + k * 18, w = 5 + k * 6, x = s.x, y = s.y;
  g.fillStyle = 'rgba(0,0,0,.4)'; g.beginPath(); g.ellipse(x + 5, y + 2, w + 4, w * 0.45 + 2, 0, 0, 6.283); g.fill();
  g.fillStyle = 'rgba(40,60,70,.45)'; g.beginPath(); g.ellipse(x, y + 1, w * 0.8, w * 0.32, 0, 0, 6.283); g.fill();   // (the drip pool round its foot)
  const cone = (x0, y0, ww, hh2, down) => {
    const d = down ? 1 : -1;
    g.fillStyle = '#564a48'; g.beginPath(); g.moveTo(x0 - ww, y0); g.quadraticCurveTo(x0 - ww * 0.3, y0 + d * hh2 * 0.55, x0, y0 + d * hh2); g.quadraticCurveTo(x0 + ww * 0.3, y0 + d * hh2 * 0.55, x0 + ww, y0); g.closePath(); g.fill();
    g.fillStyle = '#9a8a80'; g.beginPath(); g.moveTo(x0 - ww * 0.7, y0); g.quadraticCurveTo(x0 - ww * 0.25, y0 + d * hh2 * 0.5, x0 - 0.5, y0 + d * hh2 * 0.96); g.lineTo(x0 - ww * 0.15, y0); g.closePath(); g.fill();
    g.fillStyle = 'rgba(30,24,20,.35)'; for (let r = 1; r < 4; r++) g.fillRect(x0 - ww * (1 - r * 0.22), y0 + d * hh2 * r * 0.22, ww * 2 * (1 - r * 0.22), 1);   // (its growth rings)
    g.fillStyle = 'rgba(230,220,200,.7)'; g.fillRect(x0 - 1, y0 + d * hh2 * 0.93 - 1, 1.5, 1.5);
  };
  cone(x, y, w, h, false);
  if (k > 1.05 && !s.nohang) { const top = y - h - 26 - k * 10; g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(x - w * 0.9, top - 4, w * 1.8, 4); cone(x + 1, top, w * 0.8, 14 + k * 10, true); }
}
// the glowing things: mushrooms (and glow ferns round them), glow-worms' threads, crystals
// (baked: the mushrooms and the crystals, at their glow; each frame: the worms twinkling - the halos are view.js glows)
export function glowThing(g, gl, now) {
  const baked = now === null, pulse = baked ? 0.95 : 0.75 + 0.25 * Math.sin(now * 1.3 + gl.x * 0.01);
  if ((gl.kind === 'worms') === baked) return;
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
      const gr = 0;
      void gr;
      const sx = Math.round(wx / A) * A, sy = Math.round(wy / A) * A;   // (on the art pixels)
      for (let b = 1; b < 4; b++) { g.fillStyle = `rgba(180,240,255,${(0.12 + 0.25 * tw) * (b / 4)})`; g.fillRect(sx, Math.round((wy - l * (1 - b / 4)) / A) * A, A, A); }   // (the beads of its thread)
      g.fillStyle = `rgba(150,235,255,${0.55 + 0.45 * tw})`; g.fillRect(sx, sy, A, A);
    }
  } else {
    const cH = gl.hue ? [110, 190, 255] : [175, 120, 255];
    if (gl.big) { g.save(); g.translate(gl.x, gl.y); g.scale(1.9, 1.9); g.translate(-gl.x, -gl.y); }
    for (let k = 0; k < 6; k++) {
      const cx = gl.x + (hh(gl.x, k, 6) - 0.5) * 34, cy = gl.y + (hh(gl.y, k, 7) - 0.5) * 22, h2 = 8 + hh(k, 2, gl.x) * 16, w2 = 2.5 + hh(k, 3, gl.y) * 2.5, lean = (hh(k, 4, gl.x) - 0.5) * 0.7;
      g.save(); g.translate(cx, cy); g.rotate(lean);
      g.fillStyle = `rgba(${cH[0] * 0.45},${cH[1] * 0.45},${cH[2] * 0.6},${0.95})`; g.beginPath(); g.moveTo(-w2, 0); g.lineTo(-w2, -h2 * 0.75); g.lineTo(0, -h2); g.lineTo(w2, -h2 * 0.75); g.lineTo(w2, 0); g.closePath(); g.fill();
      g.fillStyle = `rgba(${cH[0]},${cH[1]},${cH[2]},${0.85 * pulse})`; g.beginPath(); g.moveTo(-w2, 0); g.lineTo(-w2, -h2 * 0.75); g.lineTo(0, -h2); g.lineTo(0, 0); g.closePath(); g.fill();
      g.fillStyle = `rgba(240,240,255,${0.9 * pulse})`; g.fillRect(-w2 + 0.5, -h2 * 0.72, 1, h2 * 0.5);
      g.restore();
    }
    g.fillStyle = `rgba(${cH[0]},${cH[1]},${cH[2]},.25)`; for (let k = 0; k < 8; k++) g.fillRect(gl.x + (hh(k, 1, gl.x) - 0.5) * 40, gl.y + 6 + (hh(k, 2, gl.y) - 0.5) * 10, 2, 1);   // (shards at the foot)
    if (gl.big) g.restore();
  }
}
// a lantern: on its post (a dock's, by a mouth) or hung on the wall from an iron bracket (l.hung, n toward the rock)
// (baked: its post or bracket and its cage; each frame: the flame, flickering, on the art pixels)
export function lantern(g, l, now) {
  const lx = Math.round(l.x / A) * A, ly = Math.round((l.y - 24) / A) * A;
  if (now !== null) {
    const f = 0.8 + 0.2 * Math.sin(now * 9 + l.x) * Math.sin(now * 5.3 + l.y);
    g.fillStyle = `rgba(255,214,130,${0.85 * f})`; g.fillRect(lx - 2, ly - 4, 4, 6);
    g.fillStyle = `rgba(255,250,220,${f})`; g.fillRect(lx - 2, ly - 2, 2, 4);
    return;
  }
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
  g.fillStyle = '#26242a'; g.fillRect(lx - 4, ly - 8, 8, 2); g.fillRect(lx - 4, ly + 2, 8, 2); g.fillRect(lx - 4, ly - 6, 2, 8); g.fillRect(lx + 2, ly - 6, 2, 8);
  g.fillStyle = '#8a6a3a'; g.fillRect(lx - 2, ly - 6, 4, 8);
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
    g.fillStyle = `rgba(255,250,235,${a})`; g.fillRect(Math.round(x / A) * A, Math.round(y / A) * A, A, A);
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

// ---- the mine cave's kit (shared/cavekit.js K.kit, the nature showcase's N3), drawn each frame ------------------------
// rails: two steel rails on timber sleepers along a line of points (px)
export function rails(g, pts) {
  const seg = [];
  for (let i = 1; i < pts.length; i++) { const [ax, ay] = pts[i - 1], [bx, by] = pts[i], l = Math.hypot(bx - ax, by - ay) || 1; seg.push([ax, ay, bx, by, l, (bx - ax) / l, (by - ay) / l]); }
  // (the sleepers: across the line every 11 px, a little uneven)
  let carry = 0;
  for (const [ax, ay, , , l, ux, uy] of seg) {
    for (let s = carry; s < l; s += 11) {
      const x = ax + ux * s, y = ay + uy * s, j = hh(Math.round(x), Math.round(y), 3) - 0.5;
      g.fillStyle = 'rgba(0,0,0,.35)'; g.beginPath(); g.moveTo(x - uy * 13 + 2, y + ux * 13 + 3); g.lineTo(x + uy * 13 + 2, y - ux * 13 + 3); g.lineTo(x + uy * 13 + 2 + ux * 4, y - ux * 13 + 3 + uy * 4); g.lineTo(x - uy * 13 + 2 + ux * 4, y + ux * 13 + 3 + uy * 4); g.fill();
      g.strokeStyle = j > 0.3 ? '#4a3220' : '#5c3e26'; g.lineWidth = 4.5; g.beginPath(); g.moveTo(x - uy * (12 + j * 3), y + ux * (12 + j * 3)); g.lineTo(x + uy * (12 - j * 3), y - ux * (12 - j * 3)); g.stroke();
      g.strokeStyle = 'rgba(150,110,70,.55)'; g.lineWidth = 1; g.beginPath(); g.moveTo(x - uy * 11 - ux, y + ux * 11 - uy); g.lineTo(x + uy * 11 - ux, y - ux * 11 - uy); g.stroke();
    }
    carry = ((carry - l) % 11 + 11) % 11;
  }
  for (const sd of [-7, 7]) {
    g.strokeStyle = '#2a2a2e'; g.lineWidth = 3; g.beginPath();
    pts.forEach(([x, y], i) => { const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, nx = -(b[1] - a[1]) / l, ny = (b[0] - a[0]) / l; if (i) g.lineTo(x + nx * sd, y + ny * sd); else g.moveTo(x + nx * sd, y + ny * sd); });
    g.stroke();
    g.strokeStyle = '#a8aab0'; g.lineWidth = 1.2; g.stroke();
  }
}
// a timber trestle over the water: the deck of planks along it, its posts standing down into the water on cross-braced
// bents, a rail of timber along either side
export function trestle(g, t, now) {
  const dx = t.x1 - t.x0, dy = t.y1 - t.y0, l = Math.hypot(dx, dy) || 1, ux = dx / l, uy = dy / l, nx = -uy, ny = ux, hw = t.hw + 6;
  const at = (s, o) => [t.x0 + ux * s + nx * o, t.y0 + uy * s + ny * o];
  // the bents under it: posts down into the water from the deck's lower edge, braced, their reflections
  for (let s = 24; s < l - 10; s += 64) {
    const [px, py] = at(s, hw), H = 26;
    g.fillStyle = 'rgba(10,30,40,.45)'; g.fillRect(px - 9, py + H, 18, 4);
    g.fillStyle = 'rgba(255,200,120,.10)'; g.fillRect(px - 3, py + H + 4, 6, 14);   // (the post in the water)
    g.strokeStyle = '#3a2614'; g.lineWidth = 2; g.beginPath(); g.moveTo(px - 12, py + 4); g.lineTo(px + 12, py + H - 2); g.moveTo(px + 12, py + 4); g.lineTo(px - 12, py + H - 2); g.stroke();
    for (const o of [-12, 12]) { g.fillStyle = '#3e2a18'; g.fillRect(px + o - 3, py, 6, H + 2); g.fillStyle = '#6a4a2c'; g.fillRect(px + o - 3, py, 2, H + 2); g.fillStyle = 'rgba(200,230,240,.35)'; g.fillRect(px + o - 5, py + H, 10, 1.5); }
  }
  // the deck
  g.fillStyle = 'rgba(0,0,0,.4)';
  { const a = at(0, -hw), b = at(l, -hw), c = at(l, hw + 6), d = at(0, hw + 6); g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.lineTo(c[0], c[1]); g.lineTo(d[0], d[1]); g.fill(); }
  for (let s = 0; s < l; s += 7) {
    const a = at(s, -hw), b = at(s, hw), k = hh(Math.round(s), Math.round(t.x0), 5);
    g.strokeStyle = k < 0.2 ? '#5a3c22' : k < 0.6 ? '#7a5432' : '#86603a'; g.lineWidth = 6; g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke();
    g.strokeStyle = 'rgba(30,18,8,.6)'; g.lineWidth = 1; g.beginPath(); g.moveTo(a[0] + ux * 3, a[1] + uy * 3); g.lineTo(b[0] + ux * 3, b[1] + uy * 3); g.stroke();
  }
  // its side beams and the railing: posts every 48 px, a top rail
  for (const o of [-hw, hw]) {
    const a = at(0, o), b = at(l, o);
    g.strokeStyle = '#3a2614'; g.lineWidth = 4; g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke();
    for (let s = 6; s < l; s += 48) { const [x, y] = at(s, o); g.fillStyle = '#3e2a18'; g.fillRect(x - 2.5, y - 16, 5, 16); g.fillStyle = '#7a5634'; g.fillRect(x - 2.5, y - 16, 1.5, 16); }
    g.strokeStyle = '#4e3420'; g.lineWidth = 3; g.beginPath(); g.moveTo(a[0], a[1] - 14); g.lineTo(b[0], b[1] - 14); g.stroke();
    g.strokeStyle = '#8a643e'; g.lineWidth = 1; g.beginPath(); g.moveTo(a[0], a[1] - 15.5); g.lineTo(b[0], b[1] - 15.5); g.stroke();
  }
  void now;
}
// a stalactite hanging from the roof's rim (the rock's top over a wall's face): a long tapering cone, banded, a drop
// at its tip now and then
export function drip(g, d, now) {
  const k = d.s, h = 18 + k * 26, w = 4 + k * 4, x = d.x, y = d.y - 22;
  if (now !== null) {   // (each frame: a drop off its tip now and then)
    const t = (now * 0.4 + hh(x, y, 2)) % 3;
    if (t < 1) { g.fillStyle = `rgba(190,225,240,${0.8 * (1 - t)})`; g.fillRect(Math.round(x / A) * A, Math.round((y + h + t * 40) / A) * A, A, A); }
    return;
  }
  g.fillStyle = '#4a4046'; g.beginPath(); g.moveTo(x - w, y); g.quadraticCurveTo(x - w * 0.3, y + h * 0.55, x, y + h); g.quadraticCurveTo(x + w * 0.3, y + h * 0.55, x + w, y); g.closePath(); g.fill();
  g.fillStyle = '#8a7c76'; g.beginPath(); g.moveTo(x - w * 0.7, y); g.quadraticCurveTo(x - w * 0.25, y + h * 0.5, x - 0.5, y + h * 0.95); g.lineTo(x - w * 0.1, y); g.closePath(); g.fill();
  g.fillStyle = 'rgba(20,14,16,.4)'; for (let r = 1; r < 5; r++) g.fillRect(x - w * (1 - r * 0.18), y + h * r * 0.18, w * 2 * (1 - r * 0.18), 1);
}
// bats asleep on the roof: hanging upside down, wings folded, one stirring now and then
export function roostBats(g, r, now) {
  for (let k = 0; k < 6; k++) {
    const bx = Math.round((r.x + (hh(r.i, k, 1) - 0.5) * 70) / A) * A, by = Math.round((r.y - 14 + (hh(r.i, k, 2) - 0.5) * 22) / A) * A, st = Math.sin(now * 2 + k * 1.7) > 0.96 ? 2 : 0;
    g.fillStyle = 'rgba(0,0,0,.3)'; g.fillRect(bx - 3, by + 14, 6, 2);
    g.strokeStyle = '#141016'; g.lineWidth = 1; g.beginPath(); g.moveTo(bx, by - 8); g.lineTo(bx, by - 4); g.stroke();
    g.fillStyle = '#1e1820'; g.beginPath(); g.moveTo(bx - 4 - st, by - 4); g.quadraticCurveTo(bx - 5 - st, by + 4, bx, by + 7); g.quadraticCurveTo(bx + 5 + st, by + 4, bx + 4 + st, by - 4); g.closePath(); g.fill();
    g.fillStyle = '#3a2e34'; g.fillRect(bx - 1.5, by - 4, 3, 7);
    g.fillStyle = '#2a2026'; g.beginPath(); g.arc(bx, by + 6.5, 2.2, 0, 6.283); g.fill();
    g.fillStyle = '#c84a3a'; g.fillRect(bx - 1.3, by + 6.5, 0.9, 0.9); g.fillRect(bx + 0.5, by + 6.5, 0.9, 0.9);
  }
}
// the kit's things on the cave floor (t.t): the adit's portal, an ore cart, a chest, barrels, crates, a pickaxe, a
// plank, a broken cart and its timbers, orange mushrooms, a rope fence, a plank fence, rubble
const box = (g, x, y, w, h, c0, c1, c2) => { g.fillStyle = c0; g.fillRect(x, y, w, h); g.fillStyle = c1; g.fillRect(x, y, w, 2); g.fillStyle = c2; g.fillRect(x, y + h - 2, w, 2); };
export function kitThing(g, t, now) {
  const x = Math.round(t.x), y = Math.round(t.y);
  const shadow = (w, h, ox = 3) => { g.fillStyle = 'rgba(0,0,0,.38)'; g.beginPath(); g.ellipse(x + ox, y + 3, w, h, 0, 0, 6.283); g.fill(); };
  switch (t.t) {
    case 'adit': {   // the timbered portal of the old workings: posts, a heavy lintel, braces, the dark beyond
      g.fillStyle = '#050405'; g.fillRect(x - 30, y - 58, 60, 62);
      const gr = g.createLinearGradient(x, y + 4, x, y - 58); gr.addColorStop(0, 'rgba(60,40,24,.6)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x - 28, y - 56, 56, 60);
      for (const o of [-36, 30]) { box(g, x + o, y - 64, 8, 68, '#4a3220', '#7a5634', '#2a1c10'); g.fillStyle = '#6a4a2c'; g.fillRect(x + o, y - 64, 2, 68); g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(x + o + 6, y - 64, 2, 68); }
      box(g, x - 42, y - 74, 84, 12, '#4e3420', '#8a643e', '#2a1c10');
      g.fillStyle = '#2a2a2e'; for (const o of [-34, 30]) { g.fillRect(x + o, y - 70, 4, 4); }
      g.strokeStyle = '#3a2614'; g.lineWidth = 4; g.beginPath(); g.moveTo(x - 28, y - 62); g.lineTo(x - 14, y - 76 + 14); g.moveTo(x + 28, y - 62); g.lineTo(x + 14, y - 62); g.stroke();
      g.fillStyle = 'rgba(0,0,0,.4)'; g.fillRect(x - 42, y - 62, 84, 3);
      break;
    }
    case 'cart': {   // a timber ore cart heaped with rock, iron-bound, on its wheels
      shadow(24, 8);
      g.fillStyle = '#1c1a1c'; for (const o of [-14, 14]) { g.beginPath(); g.arc(x + o, y + 2, 5, 0, 6.283); g.fill(); }
      g.fillStyle = '#6a6c72'; for (const o of [-14, 14]) g.fillRect(x + o - 1, y + 1, 2, 2);
      g.fillStyle = '#4a3220'; g.beginPath(); g.moveTo(x - 22, y - 18); g.lineTo(x + 22, y - 18); g.lineTo(x + 18, y); g.lineTo(x - 18, y); g.closePath(); g.fill();
      g.fillStyle = '#6e4c2e'; g.fillRect(x - 22, y - 18, 44, 4);
      g.fillStyle = '#5a3c22'; for (let k = -16; k < 18; k += 8) g.fillRect(x + k, y - 14, 1, 13);
      g.fillStyle = '#2a2a2e'; g.fillRect(x - 21, y - 11, 42, 2); g.fillRect(x - 21, y - 18, 2, 18); g.fillRect(x + 19, y - 18, 2, 18);
      for (let k = 0; k < 9; k++) { const rx = x - 16 + hh(k, 1, x) * 32, ry = y - 22 + hh(k, 2, y) * 6, r = 3 + hh(k, 3) * 3; g.fillStyle = k % 3 ? '#6a6466' : '#8a8486'; g.beginPath(); g.arc(rx, ry, r, 0, 6.283); g.fill(); g.fillStyle = 'rgba(255,255,255,.18)'; g.fillRect(rx - r * 0.5, ry - r * 0.6, 1.5, 1.5); }
      g.fillStyle = '#ffe27a'; g.fillRect(x + 4, y - 24, 2, 2);   // (a glint of ore)
      break;
    }
    case 'chest': {
      shadow(14, 5);
      box(g, x - 13, y - 14, 26, 16, '#5a3a20', '#7a5432', '#2a1a0c');
      g.fillStyle = '#6e4a2a'; g.fillRect(x - 13, y - 19, 26, 6); g.fillStyle = '#8a6038'; g.fillRect(x - 13, y - 19, 26, 2);
      g.fillStyle = '#2a2a2e'; g.fillRect(x - 10, y - 19, 2, 21); g.fillRect(x + 8, y - 19, 2, 21);
      g.fillStyle = '#d8b040'; g.fillRect(x - 2, y - 13, 4, 4);
      break;
    }
    case 'barrel': {
      shadow(10, 4);
      g.fillStyle = '#5a3a20'; g.beginPath(); g.ellipse(x, y - 8, 10, 12, 0, 0, 6.283); g.fill();
      g.fillStyle = '#7a5232'; g.fillRect(x - 6, y - 19, 4, 22);
      g.fillStyle = '#2a2a2e'; g.fillRect(x - 10, y - 14, 20, 2); g.fillRect(x - 10, y - 2, 20, 2);
      g.fillStyle = '#6e4a2a'; g.beginPath(); g.ellipse(x, y - 19, 8, 3.5, 0, 0, 6.283); g.fill(); g.fillStyle = '#4a3020'; g.beginPath(); g.ellipse(x, y - 19, 6, 2.2, 0, 0, 6.283); g.fill();
      break;
    }
    case 'crate': case 'crates': {
      const one = (cx, cy, s) => {
        g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(cx - s / 2 + 3, cy + 1, s, 4);
        box(g, cx - s / 2, cy - s, s, s, '#7a5a34', '#9a7448', '#4a3420');
        g.strokeStyle = '#4a3420'; g.lineWidth = 2; g.strokeRect(cx - s / 2 + 1, cy - s + 1, s - 2, s - 2);
        g.beginPath(); g.moveTo(cx - s / 2 + 2, cy - s + 2); g.lineTo(cx + s / 2 - 2, cy - 2); g.stroke();
        g.fillStyle = 'rgba(255,230,180,.15)'; g.fillRect(cx - s / 2 + 2, cy - s + 2, s - 4, 2);
      };
      if (t.t === 'crates') { one(x - 12, y, 24); one(x + 13, y + 2, 22); one(x - 1, y - 22, 22); } else one(x, y, 22);
      break;
    }
    case 'pick': {   // a pickaxe leant against the rock
      g.strokeStyle = '#7a5532'; g.lineWidth = 3; g.beginPath(); g.moveTo(x - 4, y + 2); g.lineTo(x + 6, y - 26); g.stroke();
      g.strokeStyle = '#9aa0a8'; g.lineWidth = 3.5; g.beginPath(); g.moveTo(x - 6, y - 26); g.quadraticCurveTo(x + 6, y - 32, x + 18, y - 22); g.stroke();
      g.fillStyle = '#d0d4da'; g.fillRect(x + 1, y - 30, 4, 2);
      break;
    }
    case 'plank': { shadow(16, 3); g.save(); g.translate(x, y); g.rotate(-1.2); g.fillStyle = '#5a3c22'; g.fillRect(-26, -3, 52, 6); g.fillStyle = '#7a5634'; g.fillRect(-26, -3, 52, 2); g.restore(); break; }
    case 'brokencart': {   // an old cart on its side, its ore spilled, a wheel off
      shadow(22, 8);
      g.save(); g.translate(x, y); g.rotate(0.35);
      g.fillStyle = '#3e2a18'; g.fillRect(-20, -16, 40, 18); g.fillStyle = '#5e4028'; g.fillRect(-20, -16, 40, 3);
      g.fillStyle = '#241812'; g.fillRect(-16, -12, 32, 11);
      g.fillStyle = '#2a2a2e'; g.fillRect(-20, -9, 40, 2);
      g.restore();
      g.fillStyle = '#1c1a1c'; g.beginPath(); g.arc(x + 22, y + 8, 5.5, 0, 6.283); g.fill(); g.fillStyle = '#5a5c62'; g.fillRect(x + 21, y + 7, 2, 2);
      for (let k = 0; k < 7; k++) { g.fillStyle = k % 2 ? '#6a6466' : '#848082'; g.beginPath(); g.arc(x - 12 + hh(k, 4, x) * 24, y + 6 + hh(k, 5, y) * 8, 2.5 + hh(k, 6) * 2, 0, 6.283); g.fill(); }
      break;
    }
    case 'timbers': {   // fallen props and boards in a heap
      for (let k = 0; k < 4; k++) { const a = -0.6 + k * 0.45 + (hh(k, 7, x) - 0.5) * 0.4; g.save(); g.translate(x + (k - 1.5) * 6, y + (hh(k, 8, y) - 0.5) * 10); g.rotate(a); g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(-24, 2, 48, 4); g.fillStyle = k % 2 ? '#5a3c22' : '#4a3220'; g.fillRect(-24, -4, 48, 8); g.fillStyle = '#7a5634'; g.fillRect(-24, -4, 48, 2); g.restore(); }
      break;
    }
    case 'shroom': {   // a clump of orange cave mushrooms, white-spotted
      for (let k = 0; k < 6; k++) {
        const mx = x + (hh(k, 1, x) - 0.5) * 30, my = y + (hh(k, 2, y) - 0.5) * 16, r = 3 + hh(k, 3, x) * 4, st = 3 + r * 0.9;
        g.fillStyle = 'rgba(0,0,0,.3)'; g.fillRect(mx - r + 1, my, r * 2, 2);
        g.fillStyle = '#e8dcc8'; g.fillRect(mx - 1, my - st, 2, st);
        g.fillStyle = '#a8401c'; g.beginPath(); g.ellipse(mx, my - st, r, r * 0.65, 0, 3.14159, 6.283); g.fill();
        g.fillStyle = '#e07032'; g.beginPath(); g.ellipse(mx - r * 0.15, my - st - 0.5, r * 0.75, r * 0.45, 0, 3.14159, 6.283); g.fill();
        g.fillStyle = '#f8e8d0'; g.fillRect(mx - r * 0.4, my - st - r * 0.35, 1.2, 1.2); g.fillRect(mx + r * 0.3, my - st - r * 0.2, 1, 1);
      }
      break;
    }
    case 'ropefence': {   // posts along the water's edge, a rope sagging between them
      const n = 4, pts = [];
      for (let k = 0; k <= n; k++) pts.push([x + (t.tx - x) * k / n, y + (t.ty - y) * k / n]);
      g.strokeStyle = '#a08860'; g.lineWidth = 1.5;
      for (let k = 1; k <= n; k++) { const [ax, ay] = pts[k - 1], [bx, by] = pts[k]; g.beginPath(); g.moveTo(ax, ay - 18); g.quadraticCurveTo((ax + bx) / 2, (ay + by) / 2 - 8, bx, by - 18); g.stroke(); }
      for (const [px, py] of pts) { g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(px - 1, py, 7, 3); g.fillStyle = '#4a3220'; g.fillRect(px - 3, py - 22, 6, 23); g.fillStyle = '#7a5634'; g.fillRect(px - 3, py - 22, 2, 23); }
      break;
    }
    case 'fence': {   // boards nailed across a gap in the rock
      for (const o of [-18, 18]) { g.fillStyle = '#3e2a18'; g.fillRect(x + o - 3, y - 30, 6, 32); }
      for (const [o, a] of [[-22, 0.05], [-10, -0.08], [2, 0.1]]) { g.save(); g.translate(x, y + o * 0.6); g.rotate(a); g.fillStyle = '#5e4028'; g.fillRect(-26, -4, 52, 7); g.fillStyle = '#86603a'; g.fillRect(-26, -4, 52, 2); g.restore(); }
      break;
    }
    case 'fern': {   // a clump of fern and moss at a wall's foot
      g.fillStyle = 'rgba(30,50,20,.5)'; g.beginPath(); g.ellipse(x, y + 1, 14, 5, 0, 0, 6.283); g.fill();
      for (let k = 0; k < 7; k++) {
        const a = -2.9 + k * 0.42 + (hh(k, 1, x) - 0.5) * 0.3, l = 9 + hh(k, 2, y) * 8, ex = x + Math.cos(a) * l, ey = y + Math.sin(a) * l * 0.8;
        g.strokeStyle = k % 2 ? '#3e6a2a' : '#5a8a34'; g.lineWidth = 2; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + Math.cos(a) * l * 0.5, y + Math.sin(a) * l * 0.5 - 4, ex, ey); g.stroke();
        g.fillStyle = '#7aa848'; for (let f = 1; f < 4; f++) g.fillRect(x + Math.cos(a) * l * f / 4 - 1, y + Math.sin(a) * l * f / 4 * 0.8 - 2, 2, 1.5);
      }
      break;
    }
    case 'boulder': {   // a boulder at the water's edge: rounded, lit from the top left, a wet dark line where it meets the water
      const r = 9 + (t.s || 1) * 7, k = hh(x, y, 4);
      g.fillStyle = 'rgba(120,200,210,.25)'; g.beginPath(); g.ellipse(x + 1, y + 3, r * 1.15, r * 0.45, 0, 0, 6.283); g.fill();
      g.fillStyle = '#2a2428'; g.beginPath(); g.ellipse(x, y - r * 0.35, r * (1 + k * 0.3), r * (0.7 + k * 0.2), k - 0.5, 0, 6.283); g.fill();
      g.fillStyle = k < 0.33 ? '#5e5058' : k < 0.66 ? '#6e6058' : '#544c52'; g.beginPath(); g.ellipse(x - r * 0.12, y - r * 0.48, r * 0.86, r * 0.66, 0, 0, 6.283); g.fill();
      g.fillStyle = 'rgba(255,230,200,.28)'; g.beginPath(); g.ellipse(x - r * 0.35, y - r * 0.75, r * 0.4, r * 0.22, -0.4, 0, 6.283); g.fill();
      if (k > 0.6) { g.fillStyle = '#4a6a2a'; g.fillRect(x - r * 0.5, y - r * 1.05, r * 0.6, 2); }
      break;
    }
    case 'rubble': {
      for (let k = 0; k < 9; k++) { const rx = x + (hh(k, 1, x) - 0.5) * 50, ry = y + (hh(k, 2, y) - 0.5) * 30, r = 3 + hh(k, 3, x) * 6; g.fillStyle = 'rgba(0,0,0,.35)'; g.beginPath(); g.ellipse(rx + 2, ry + 2, r, r * 0.6, 0, 0, 6.283); g.fill(); g.fillStyle = k % 3 ? '#5e5258' : '#7a6c70'; g.beginPath(); g.ellipse(rx, ry, r, r * 0.7, 0, 0, 6.283); g.fill(); g.fillStyle = 'rgba(255,240,220,.18)'; g.fillRect(rx - r * 0.5, ry - r * 0.5, 2, 1.5); }
      break;
    }
    case 'shoring': { g.fillStyle = '#5a3c22'; g.fillRect(x - 30, y - 34, 7, 36); g.fillRect(x + 23, y - 34, 7, 36); g.fillRect(x - 34, y - 40, 68, 8); g.fillStyle = '#7a5634'; g.fillRect(x - 34, y - 40, 68, 2); break; }
    case 'gold': { for (let k = 0; k < 7; k++) { g.fillStyle = k % 2 ? '#c8961e' : '#ffe27a'; g.fillRect(Math.round(x - 10 + hh(k, 2, x) * 20), Math.round(y - 6 + hh(k, 3, y) * 10), 4, 2); } g.fillStyle = '#fff'; g.fillRect(x + 2, y - 4, 2, 2); break; }
    default: return false;
  }
  return true;
}

// ---- a cavern's own things that don't move (its plan's: shared/world3-caves.js) ----------------------------------------
// a dock's posts and the rope along it
function dockPosts(g, d) {
  const ux = d.x1 - d.x0, uy = d.y1 - d.y0, l = Math.hypot(ux, uy) || 1, nx = -uy / l * d.hw, ny = ux / l * d.hw;
  for (const t of [0.15, 0.55, 0.95]) for (const s2 of [-1, 1]) { const x = Math.round(d.x0 + ux * t + nx * s2), y = Math.round(d.y0 + uy * t + ny * s2); g.fillStyle = '#2a1a0e'; g.fillRect(x - 3, y - 3, 6, 8); g.fillStyle = '#5a3c22'; g.fillRect(x - 3, y - 5, 6, 6); g.fillStyle = '#7a5634'; g.fillRect(x - 3, y - 5, 2, 6); }
  g.strokeStyle = 'rgba(200,180,130,.8)'; g.lineWidth = 2; g.beginPath(); g.moveTo(d.x0 + nx, d.y0 + ny - 3); g.lineTo(d.x1 + nx, d.y1 + ny - 3); g.stroke();
}
// timber stairs up the bank beside a cascade
function stairs(g, st) {
  g.save(); g.translate(st.x, st.y); g.rotate(Math.atan2(st.uy, st.ux));
  g.fillStyle = '#3a2614'; g.fillRect(-st.len / 2, -15, st.len, 30);
  for (let x = -st.len / 2 + 2, k = 0; x < st.len / 2 - 4; x += 8, k++) { g.fillStyle = k % 2 ? '#6e4c2e' : '#7a5634'; g.fillRect(x, -13, 6, 26); g.fillStyle = '#9a7448'; g.fillRect(x, -13, 6, 2); }
  g.fillStyle = '#2a1c10'; g.fillRect(-st.len / 2, -16, st.len, 3); g.fillRect(-st.len / 2, 13, st.len, 3);
  g.restore();
}
// the den: a bed of old leaves and bones
function denBed(g, d) {
  g.fillStyle = '#4a3820'; g.beginPath(); g.ellipse(d.x, d.y, 48, 30, 0, 0, 6.283); g.fill();
  for (let k = 0; k < 60; k++) { g.fillStyle = ['#6e5630', '#8a5a26', '#5a4528', '#9a6a2a'][k & 3]; g.fillRect(Math.round(d.x - 42 + hh(k, 1) * 84), Math.round(d.y - 26 + hh(k, 2) * 52), 4, 2); }
  g.fillStyle = '#d8d0bc'; for (let k = 0; k < 5; k++) { const bx = Math.round(d.x - 50 + hh(k, 7) * 100), by = Math.round(d.y + 20 + hh(k, 8) * 16); g.fillRect(bx, by, 10, 2); g.fillRect(bx - 2, by - 2, 4, 6); g.fillRect(bx + 8, by - 2, 4, 6); }
}

// ---- the way out (K.exits: shared/caverns.js lightCave) ------------------------------------------------------------------
// the WAY OUT board's letters, 3x5 (W 5x5) on the art pixels
const GLYPH = { W: ['10001', '10001', '10101', '10101', '01010'], A: ['010', '101', '111', '101', '101'], Y: ['101', '101', '010', '010', '010'], O: ['111', '101', '101', '101', '111'], U: ['101', '101', '101', '101', '111'], T: ['111', '010', '010', '010', '010'] };
function word(g, w, x, y) { for (const ch of w) { const G = GLYPH[ch]; for (let r = 0; r < 5; r++) for (let c = 0; c < G[r].length; c++) if (G[r][c] === '1') g.fillRect(x + c * A, y + r * A, A, A); x += (G[0].length + 1) * A; } }
// the board: weathered planks in a dark frame, WAY / OUT painted on it, an arrow under the words the way out (ux, uy)
export function wayBoard(g, x, y, ux, uy) {
  x = Math.round(x / A) * A; y = Math.round(y / A) * A;
  const W2 = 17 * A, H2 = 20 * A, bx = x - Math.round(W2 / 2 / A) * A, by = y;
  g.fillStyle = 'rgba(0,0,0,.4)'; g.fillRect(bx + A, by + A, W2, H2);
  g.fillStyle = '#2a1a0e'; g.fillRect(bx, by, W2, H2);
  for (let r = 0; r < 3; r++) { g.fillStyle = r === 1 ? '#6a4a2c' : '#5e4228'; g.fillRect(bx + A, by + A + r * 6 * A, W2 - 2 * A, 6 * A - A); }
  g.fillStyle = '#7e5a36'; g.fillRect(bx + A, by + A, W2 - 2 * A, A);
  g.fillStyle = '#f2e4b4';
  word(g, 'WAY', bx + 2 * A, by + 2 * A); word(g, 'OUT', bx + 3 * A, by + 8 * A);
  // the arrow: the nearest of the four ways to (ux, uy), 5 art px across
  const ax2 = bx + 6 * A, ay2 = by + 14 * A, dn = Math.abs(uy) >= Math.abs(ux);
  for (let k = 0; k < 5; k++) for (let j = 0; j < 5; j++) {
    const a = dn ? (uy > 0 ? j : 4 - j) : (ux > 0 ? k : 4 - k), b = dn ? k : j;   // (a: along the arrow, b: across it)
    const on = (a >= 2 && Math.abs(b - 2) <= 4 - a) || (a < 2 && b === 2);
    if (on) g.fillRect(ax2 + k * A + A * 0, ay2 + j * A - A, A, A);
  }
  g.fillStyle = '#c8b888'; g.fillRect(bx + A, by + H2 - 2 * A, W2 - 2 * A, A);
}
// a way out's dressing: an adit's timbered portal across the mouth (posts, a heavy cap beam, braces) with the board hung
// from it; a cave mouth's board on a post beside the path in; the lanterns either side are the cave's (K.lanterns, exit)
export function exitDress(g, E) {
  const nx = -E.uy, ny = E.ux, s = -10, mx = E.x + E.ux * s, my = E.y + E.uy * s, hw = E.hw + 4, H = 46;
  if (E.kind === 'adit') {
    const ax = mx - nx * hw, ay = my - ny * hw, bx = mx + nx * hw, by = my + ny * hw;
    for (const [x0, y0] of [[ax, ay], [bx, by]]) { const x = Math.round(x0 / A) * A, y = Math.round(y0 / A) * A; g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(x - 2, y, 12, 4); g.fillStyle = '#3e2a18'; g.fillRect(x - 5, y - H, 10, H + 2); g.fillStyle = '#6e4c2e'; g.fillRect(x - 5, y - H, 3, H + 2); g.fillStyle = '#2a1c10'; g.fillRect(x + 3, y - H, 2, H + 2); }
    g.strokeStyle = '#2e1e10'; g.lineWidth = 10; g.beginPath(); g.moveTo(ax - nx * 8, ay - ny * 8 - H); g.lineTo(bx + nx * 8, by + ny * 8 - H); g.stroke();
    g.strokeStyle = '#7a5634'; g.lineWidth = 3; g.beginPath(); g.moveTo(ax - nx * 8, ay - ny * 8 - H - 4); g.lineTo(bx + nx * 8, by + ny * 8 - H - 4); g.stroke();
    g.strokeStyle = '#4a3220'; g.lineWidth = 4; g.beginPath(); g.moveTo(ax + nx * 4, ay + ny * 4 - H + 16); g.lineTo(ax + nx * 18, ay + ny * 18 - H + 2); g.moveTo(bx - nx * 4, by - ny * 4 - H + 16); g.lineTo(bx - nx * 18, by - ny * 18 - H + 2); g.stroke();
    g.fillStyle = '#2a2a2e'; for (const [x, y] of [[ax, ay], [bx, by]]) g.fillRect(Math.round(x / A) * A - 2, Math.round((y - H - 2) / A) * A, 4, 4);   // (the iron straps)
    g.fillStyle = '#1e1c1c'; g.fillRect(Math.round((mx - 12) / A) * A, Math.round((my - H + 4) / A) * A, A, 8); g.fillRect(Math.round((mx + 12) / A) * A, Math.round((my - H + 4) / A) * A, A, 8);   // (its chains)
    wayBoard(g, mx, my - H + 10, E.ux, E.uy);
  } else {
    const px = Math.round((E.x - E.ux * 64 + nx * (E.hw - 2)) / A) * A, py = Math.round((E.y - E.uy * 64 + ny * (E.hw - 2)) / A) * A;
    g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(px - 2, py, 10, 4);
    g.fillStyle = '#3e2a18'; g.fillRect(px - 3, py - 40, 6, 42); g.fillStyle = '#6e4c2e'; g.fillRect(px - 3, py - 40, 2, 42);
    wayBoard(g, px, py - 52, E.ux, E.uy);
  }
}
// the daylight in at a way out, over the dark (adding light, view.js glows): the glare of the opening, a fan of light
// along the floor in from it with dust turning in it (k: how bright it is outside, tint: the sky's colour at full)
export function exitBeam(g, E, now, k, tint) {
  if (k <= 0.02) return;
  const [r, gg, b] = tint, ox = E.x + E.ux * 90, oy = E.y + E.uy * 90, ix = E.x - E.ux * 260, iy = E.y - E.uy * 260, nx = -E.uy, ny = E.ux;
  const gl = g.createRadialGradient(ox, oy, 0, ox, oy, 150);
  gl.addColorStop(0, `rgba(${r},${gg},${b},${0.24 * k})`); gl.addColorStop(0.5, `rgba(${r},${gg},${b},${0.1 * k})`); gl.addColorStop(1, `rgba(${r},${gg},${b},0)`);
  g.fillStyle = gl; g.beginPath(); g.arc(ox, oy, 150, 0, 6.283); g.fill();
  const gr = g.createLinearGradient(E.x + E.ux * 10, E.y + E.uy * 10, ix, iy);
  gr.addColorStop(0, `rgba(${r},${gg},${b},${0.13 * k})`); gr.addColorStop(0.5, `rgba(${r},${gg},${b},${0.05 * k})`); gr.addColorStop(1, `rgba(${r},${gg},${b},0)`);
  g.fillStyle = gr;
  for (const f of [1, 0.6]) {
    const w0 = E.hw * 1.05 * f, w1 = E.hw * 2.6 * f, sx = E.x + E.ux * 10, sy = E.y + E.uy * 10;
    g.beginPath(); g.moveTo(sx - nx * w0, sy - ny * w0); g.lineTo(sx + nx * w0, sy + ny * w0); g.lineTo(ix + nx * w1, iy + ny * w1); g.lineTo(ix - nx * w1, iy - ny * w1); g.closePath(); g.fill();
  }
  for (let i = 0; i < 18; i++) {   // the dust in it, drifting in
    const u = (hh(i, 1, E.x) + now * (0.02 + hh(i, 2) * 0.02)) % 1, v = hh(i, 3, E.y) - 0.5, w = E.hw * (1 + 1.5 * u) * 1.6 * v;
    const x = E.x + E.ux * (10 - 250 * u) + nx * w + Math.sin(now * 0.7 + i) * 3, y = E.y + E.uy * (10 - 250 * u) + ny * w;
    g.fillStyle = `rgba(255,250,235,${(0.25 + 0.45 * Math.abs(Math.sin(now * 1.1 + i * 2.1))) * k * Math.sin(u * Math.PI)})`; g.fillRect(Math.round(x / A) * A, Math.round(y / A) * A, A, A);
  }
}
// ---- the things that don't move, baked into a tile's art pixels (sg: its canvas, in world px; x0, y0: the tile's corner)
export function bakeProps(V, sg, caves, x0, y0) {
  const M2 = 180, inT = (x, y, m = M2) => x > x0 - m && x < x0 + 512 + m && y > y0 - m && y < y0 + 512 + m + 60;
  const items = [];   // [y, draw] - the nearer (lower on the screen) over the further
  for (const K of caves) {
    const kit = K.kit;
    if (kit) {
      for (const t of kit.trestles) if (inT((t.x0 + t.x1) / 2, (t.y0 + t.y1) / 2, Math.abs(t.x1 - t.x0) / 2 + Math.abs(t.y1 - t.y0) / 2 + M2)) trestle(sg, t, null);
      for (const r of kit.rails) if (r.some(([x, y]) => inT(x, y, 300))) rails(sg, r);
      for (const d of kit.drips) if (inT(d.x, d.y)) items.push([d.y - 30, () => drip(sg, d, null)]);
      for (const t of K.things || []) if (inT(t.x, t.y)) items.push([t.y, () => kitThing(sg, t, null)]);
    } else for (const t of K.things || []) if (inT(t.x, t.y)) items.push([t.y, () => kitThing(sg, t, null)]);
    for (const d of K.docks || []) if (inT((d.x0 + d.x1) / 2, (d.y0 + d.y1) / 2, M2 + 120)) dockPosts(sg, d);
    for (const st of K.stairs || []) if (inT(st.x, st.y)) stairs(sg, st);
    if (K.den && inT(K.den.x, K.den.y)) denBed(sg, K.den);
    for (const t of K.timbers || []) if (inT(t.x, t.y)) items.push([t.y, () => timber(sg, t)]);
    for (const s of K.spikes) if (inT(s.x, s.y)) items.push([s.y, () => spike(sg, s)]);
    for (const gl of K.glow) if (gl.kind !== 'worms' && inT(gl.x, gl.y)) items.push([gl.y, () => glowThing(sg, gl, null)]);
    for (const l of K.lanterns || []) if (inT(l.x, l.y)) items.push([l.y, () => lantern(sg, l, null)]);
    for (const E of K.exits || []) if (inT(E.x, E.y, M2 + 60)) items.push([E.y - 10, () => exitDress(sg, E)]);
  }
  items.sort((a, b) => a[0] - b[0]);
  for (const [, f] of items) f();
}
