// The garden plots and the farm fields' rows on the page (H61: server/systems/gardening.js, farming.js), loaded the
// first time the server sends either. The server keeps them; this only draws what it's sent: S.garden, the plots near
// you ([x, y, crop, stage, flags] - crop -1 an empty plot; stage 0 seed .. 4 ripe; flags 1 dry, 2 wilted, 4 dead,
// 8 a prize one), and S.fields, the fields near you ({ x, y, w, h, v (rows run north-south), rw, segs, r: [state, growth
// %, done bits, field bits] a row }). Drawn on the ground under everything that stands on it, in both renderers - the
// classic view's world pass (drawV1) and art v2's ground decals (drawV2: art v2's ground is baked, the fields' crops
// with it, so the rows' live state goes on top of it near you). Small and cheap: a plot is one sprite (its soil and its
// three plants at their stage), a row a sprite per stretch of it (its look: stubble, ploughed, sown, growing, ripe);
// made once each, at the art's pixel (2 world px).
import { PAINTS, VEHICLE_BY_INDEX } from '../../shared/vehicles.js';

const P = 2;   // world px per art pixel
const hsh = (x, y, s) => { let h = (x * 374761393 + y * 668265263 + s * 974711) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

// ---- the look of a plot (the owner's FA5 concept): a raised bed - a wooden frame with corner posts, its front plank's
// face showing, dark soil (paler and dusty dry, dark and rich watered) - and its crop at its stage: 0 the seeds in the
// soil, 1 a sprout, 2 growing, 3 grown (in flower), 4 ready; wilted (fl 2) yellowing and drooping, dead (fl 4) brown and
// bare, a prize one (fl 8) bigger with a gleam - the prize pumpkin with its blue ribbon. Tall crops (corn, sunflowers,
// a tomato's stake) rise over the back of the bed: the sprite has TOP art px of headroom above it.
const GREEN = [[66, 138, 50], [44, 100, 36], [104, 176, 70]], WILT = [[164, 146, 66], [124, 106, 48], [190, 170, 96]], DEAD = [[104, 84, 58], [78, 62, 42], [124, 102, 70]];
const LEAF = [[52, 122, 46], [32, 84, 32], [86, 156, 60]], LETT = [[132, 200, 84], [84, 150, 54], [196, 236, 140]];
const WOOD = [[168, 116, 66], [134, 90, 52], [100, 66, 38], [70, 44, 26], [186, 134, 80]];   // top face, face, shade, dark, post
const SOIL = [[60, 39, 25], [84, 57, 37], [42, 27, 17]], SOIL_DRY = [[118, 88, 58], [140, 108, 72], [96, 70, 46]];
const BW = 28, BH = 14, TOP = 10;
export const PLOT_W = BW, PLOT_H = BH + TOP, PLOT_AY = TOP + (BH >> 1);   // art px (56 x 28 world px the bed; its middle the plot's point)
export function plotPixels(c, st, fl, set0) {
  const set = (x, y, rgb) => set0(x, y + TOP, rgb);
  for (let y = 0; y < BH; y++) for (let x = 0; x < BW; x++) {
    const side = x < 2 || x > BW - 3, post = side && (y < 3 || y > BH - 5), gr = hsh(x, y, 2) < 0.14;
    let col;
    if (post) col = x === 0 || x === BW - 1 || y === BH - 1 ? WOOD[3] : y === 0 || y === BH - 4 ? WOOD[4] : WOOD[0];
    else if (y === BH - 4 || y === 0) col = gr ? WOOD[1] : WOOD[0];                          // the rails' tops
    else if (y > BH - 4) col = y === BH - 1 ? WOOD[3] : y === BH - 2 ? WOOD[2] : gr ? WOOD[2] : WOOD[1];   // the front plank's face
    else if (y === 1) col = WOOD[2];                                                          // the back rail's inner face
    else if (side) col = x === 1 || x === BW - 2 ? (gr ? WOOD[1] : WOOD[0]) : WOOD[2];
    else { const S = fl & 1 ? SOIL_DRY : SOIL, h = hsh(x, y, 3); col = y === 2 ? S[2] : h > 0.84 ? S[1] : h < 0.12 ? S[2] : S[0]; }   // the soil (shaded under the back rail)
    set(x, y, col);
  }
  if (c >= 0) crop(c, st, fl, set);
}
const FRUIT = [[[220, 44, 36], [150, 24, 22], [255, 150, 128]], [[240, 132, 36], [200, 96, 24], [255, 186, 100]], null, [[238, 126, 30], [190, 86, 20], [255, 176, 80]], [[246, 210, 70], [196, 156, 40], [255, 240, 150]], [[226, 36, 52], [160, 20, 36], [255, 160, 160]], [[250, 204, 40], [214, 150, 20], [255, 236, 120]]];
const dull = (C) => C.map(([r, g, b]) => [r * 0.62 + 40 | 0, g * 0.58 + 30 | 0, b * 0.5 + 20 | 0]);
function crop(c, st, fl, set) {
  const dead = fl & 4, wilt = fl & 2, prize = fl & 8, G = dead ? DEAD : wilt ? WILT : c === 2 ? LETT : c === 3 || c === 5 ? LEAF : GREEN;
  const F = FRUIT[c] && (wilt ? dull(FRUIT[c]) : FRUIT[c]), B = 9;   // B: the row the plants stand in
  const at = (x, y, col) => { if (x > 1 && x < BW - 2 && y < BH - 4) set(x, y, col); };
  const dot = (x, y, C) => { at(x, y, C[2]); at(x + 1, y, C[0]); at(x, y + 1, C[0]); at(x + 1, y + 1, C[1]); };
  const blob = (cx, cy, rx, ry, k) => {
    for (let dy = -ry; dy <= ry; dy++) for (let dx = -rx; dx <= rx; dx++) {
      const d = (dx * dx) / (rx * rx + 0.6) + (dy * dy) / (ry * ry + 0.6);
      if (d > 1 || (dead && (dx + dy) & 1) || (d > 0.55 && hsh(cx + dx, cy + dy, k) < 0.25)) continue;
      at(cx + dx, cy + dy, d > 0.7 && dy > 0 ? G[1] : dx + dy < -1 && d < 0.6 ? G[2] : hsh(cx + dx, cy + dy, k + 5) < 0.2 ? G[1] : G[0]);
    }
  };
  const sprout = (x) => { at(x, B, G[1]); at(x, B - 1, G[0]); at(x - 1, B - 2, G[2]); at(x + 1, B - 2, G[0]); };
  const stalk = (x, h, leaves) => { for (let y = 0; y < h; y++) at(x, B - y, y & 1 ? G[1] : G[0]); if (leaves) for (let y = 2; y < h - 1; y += 3) { const s = (y / 3) & 1 ? 1 : -1, droop = wilt || dead ? 1 : 0; at(x + s, B - y + droop, G[0]); at(x + 2 * s, B - y + 1 + droop, G[2]); at(x + 3 * s, B - y + 1 + droop * 2, G[1]); } };
  if (st === 0) { for (let x = 4; x < BW - 4; x += 3) at(x + (x & 2 ? 1 : 0), 4 + ((x * 7) % 5), [204, 166, 100]); return; }   // the seeds, scattered
  if (st === 1) { for (const x of c === 2 || c === 3 ? [14] : c === 6 ? [9, 19] : [7, 14, 21]) sprout(x); return; }
  const big = st >= 3, ripe = st === 4 && !dead;
  if (c === 0) {   // tomatoes: bushes on a stake, yellow flowers, then the fruit
    if (big) for (let y = -7; y <= B; y++) at(14, y, [150, 112, 70]);
    for (const x of [7, 14, 21]) blob(x, big ? 4 : 7, big ? 4 : 2, big ? 4 : 2, x);
    if (st === 3 && !dead) for (const [x, y] of [[6, 2], [15, 1], [21, 4], [9, 5], [18, 6]]) at(x, y, [248, 220, 70]);
    if (ripe) for (const [x, y] of [[4, 4], [8, 1], [11, 5], [16, 2], [19, 6], [22, 2], [7, 6], [24, 5]]) dot(x, y, F);
  } else if (c === 1) {   // carrots: feathery tops, the orange shoulders showing
    for (const x of [6, 11, 16, 21]) {
      const h = st === 2 ? 4 : st === 3 ? 7 : 9;
      for (let y = 0; y < h; y++) { at(x, B - 1 - y, G[y & 1]); if (y > 0 && (y & 1)) { at(x - 1, B - 1 - y, G[2]); at(x + 1, B - y, G[0]); } if (y === h - 1) { at(x - 1, B - 1 - y, G[0]); at(x + 1, B - 1 - y, G[2]); } }
      if (big && !dead) { at(x, B, F[0]); if (ripe) { at(x - 1, B, F[2]); at(x + 1, B, F[1]); at(x, B + 1, F[1]); } }
    }
  } else if (c === 2) {   // lettuce: one head, a paler heart
    const r = st === 2 ? 3 : st === 3 ? 5 : 6;
    blob(14, 5, r + 2, r - 1, 7);
    if (!dead) for (let dy = -1; dy <= 1; dy++) for (let dx = -2; dx <= 2; dx++) if ((r > 3 || dx * dx < 2) && (dx + dy) & 1) at(14 + dx, 6 + dy, wilt ? G[2] : [176, 222, 120]);
    if (!dead) for (let dx = -r; dx <= r; dx += 2) at(14 + dx, 6 + (dx & 2 ? 1 : -1) * (r > 3 ? 2 : 1), G[1]);   // (the leaves' ruffled edges)
  } else if (c === 3) {   // pumpkins: the vine and its big leaves, then the pumpkin (the prize one bigger, ribboned)
    for (let x = 4; x < 25; x++) at(x, 8 + (((x >> 2) & 1) ? 0 : 1), G[1]);
    for (const [x, y] of big ? [[5, 6], [10, 4], [19, 4], [23, 7], [8, 8]] : [[7, 7], [14, 5], [21, 7]]) blob(x, y, 2, 2, x);
    if (big && !dead) {
      const R = ripe ? (prize ? 7 : 6) : 3, Q = ripe ? (prize ? 5 : 4) : 2, cx = 14, cy = 5, P = st === 3 ? [[178, 160, 60], [130, 120, 40], [206, 190, 90]] : F;
      for (let dy = -Q; dy <= Q; dy++) for (let dx = -R; dx <= R; dx++) if ((dx * dx) / (R * R + 0.5) + (dy * dy) / (Q * Q + 0.5) <= 1) at(cx + dx, cy + dy, dx < -R / 2 || dy > Q / 2 ? P[1] : dx === 0 || Math.abs(dx) === Math.ceil(R / 2) ? P[1] : dy < 0 && dx < 0 ? P[2] : P[0]);
      at(cx, cy - Q - 1, [86, 110, 40]); at(cx + 1, cy - Q - 2, [70, 92, 34]);
      if (prize && ripe) { const bx = cx + R - 1, by = cy + 1; for (const [x, y] of [[0, 0], [1, 0], [0, 1], [1, 1], [-1, 0], [2, 1], [0, -1], [1, 2]]) at(bx + x, by + y, x === 0 && y === 0 ? [200, 220, 255] : [40, 80, 200]); at(bx, by + 3, [30, 60, 170]); at(bx + 1, by + 3, [30, 60, 170]); at(bx, by + 4, [30, 60, 170]); }   // the blue ribbon
    }
  } else if (c === 4) {   // corn: tall stalks, leaves out to the sides, the tassels and the ears
    for (const x of [7, 14, 21]) {
      const h = st === 2 ? 5 : st === 3 ? 11 : 15;
      stalk(x, h, true);
      if (ripe || (st === 4 && wilt)) { at(x, B - h, F[0]); at(x - 1, B - h + 1, F[1]); at(x + 1, B - h + 1, F[0]); dot(x + 1, B - 7, F); at(x + 1, B - 5, G[0]); }
    }
  } else if (c === 5) {   // strawberries: low leafy clumps, white flowers, red berries
    for (const x of [7, 14, 21]) blob(x, 6, big ? 4 : 2, big ? 3 : 2, x + 3);
    if (st === 3 && !dead) for (const [x, y] of [[6, 5], [13, 6], [20, 5], [16, 8]]) { at(x, y, [250, 250, 244]); at(x + 1, y, [250, 250, 244]); at(x, y + 1, [250, 250, 244]); at(x + 1, y + 1, [240, 200, 60]); }
    if (ripe) for (const [x, y] of [[4, 8], [9, 7], [12, 8], [17, 7], [20, 8], [23, 7]]) dot(x, y, F);
  } else {   // sunflowers: two tall stalks, a green bud, then the big yellow heads (brown and hanging, wilted)
    for (const x of [9, 19]) {
      const h = st === 2 ? 5 : st === 3 ? 12 : 14;
      stalk(x, h, true);
      if (st === 3 && !dead) { at(x, B - h, G[0]); at(x - 1, B - h + 1, G[1]); at(x + 1, B - h + 1, G[1]); }
      if (st === 4 && !dead) {
        const hy = B - h - 1 + (wilt ? 3 : 0), hx = x + (wilt ? 2 : 0);
        for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) { const d = dx * dx + dy * dy; if (d <= 10) at(hx + dx, hy + dy, d <= 2 ? [96, 56, 24] : d <= 4 ? [124, 76, 30] : wilt ? [150, 110, 40] : (dx + dy) & 1 ? F[0] : F[1]); }
      }
    }
  }
  if (prize && ripe && c !== 3) { at(24, 2, [255, 238, 130]); at(23, 3, [255, 255, 226]); }   // a gleam: a prize one
}

// ---- the look of a row: 0 stubble, 1 ploughed, 2 sown, 3 sprouting, 4 growing, 5 tall, 6 ripe ----------------------
// (across: px across the row 0..w-1, along: px along it). The owner's FA4 concept, calm (H61's were busy and speckled):
// four crop lines to a row - ploughed ridges, the seed drills, the shoots, the leafy rows, the tall crop, ripe golden
// wheat, the pale stubble (and round bales: farmart drawV1 / drawV2) - little noise.
const STUB = [[198, 170, 108], [168, 140, 84], [214, 190, 130]], PLOW = [[76, 50, 30], [100, 68, 42], [124, 86, 54], [142, 100, 64]];
const RIPE = [[214, 176, 76], [180, 142, 54], [238, 208, 116]], CROPG = [[70, 132, 46], [46, 98, 34], [108, 168, 66]];
export function rowLook(s, g) { return s === 0 ? 0 : s === 1 ? 1 : s === 3 ? 6 : g < 8 ? 2 : g < 30 ? 3 : g < 65 ? 4 : 5; }
export function rowPixel(look, a, b) {
  const q = b & 7, ridge = Math.abs(q - 4);   // (0 on a crop line .. 4 between them)
  if (look === 0) return (b & 3) === 1 && (a & 1) ? STUB[1] : hsh(a, b >> 1, 6) > 0.95 ? STUB[2] : STUB[0];
  if (look === 1) return ridge === 0 ? PLOW[3] : ridge === 1 ? PLOW[2] : ridge >= 3 ? PLOW[0] : PLOW[1];   // ridges and furrows
  const soil = ridge === 4 ? PLOW[0] : PLOW[1];
  if (look === 2) return ridge === 0 && (a & 3) === 0 ? [184, 160, 96] : ridge === 0 ? PLOW[0] : soil;                   // the seed drills
  if (look === 3) return ridge === 0 && (a % 4) < 2 ? CROPG[2] : ridge === 1 && (a % 4) === 0 ? CROPG[0] : soil;         // the shoots
  if (look === 4) return ridge <= 2 ? ((a + ridge * 2) % 4 === 0 ? CROPG[2] : ridge === 2 ? CROPG[1] : CROPG[0]) : soil;   // the leafy rows
  if (look === 5) return ridge === 4 ? CROPG[1] : (a + ridge) % 4 === 0 ? CROPG[2] : CROPG[0];                            // tall
  return ridge === 4 ? RIPE[1] : (a + ridge) % 4 === 0 ? RIPE[2] : RIPE[0];                                                // ripe wheat
}
// a round bale left on the stubble (art px, BALE x BALE): the straw roll's face, its spiral, its shadow side
export const BALE = 15;
export function balePixels(set) {
  for (let y = 0; y < BALE; y++) for (let x = 0; x < BALE; x++) {
    const dx = x - 7, dy = y - 7, d = dx * dx + dy * dy;
    if (d > 50) continue;
    set(x, y, d > 40 ? (dx + dy > 0 ? [150, 118, 56] : [196, 162, 84]) : (Math.round(Math.sqrt(d)) & 1) ? [212, 180, 98] : [230, 202, 124]);
  }
}
const baleAt = (r, k) => hsh(r, k, 13) < 0.3;

// The plough behind the tractor (the owner's FA4: a red frame across the back and its row of steel discs on the
// drawbar): art px, facing +x (the drawbar toward the tractor) - art v2 draws it as a ground decal behind each tractor
// (drawV2), the classic view in drawTractor
export const PLOUGH_A = 14, PLOUGH_B = 27;
export function ploughPixels(set) {
  for (let y = 11; y <= 15; y++) for (let x = 7; x < PLOUGH_A; x++) if (y === 12 || y === 14 || x === PLOUGH_A - 1) set(x, y, [56, 56, 60]);   // the drawbar
  for (let y = 1; y < PLOUGH_B - 1; y++) { set(6, y, [168, 44, 34]); set(7, y, [120, 30, 24]); }                                                 // the frame
  for (let k = 0; k < 5; k++) {
    const cy = 3 + k * 5, cx = 3 + (k & 1);
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const d = dx * dx + dy * dy; if (d <= 5) set(cx + dx, cy + dy, d >= 4 ? [70, 70, 74] : dx + dy < 0 ? [214, 214, 218] : [168, 168, 174]); }   // a disc
    set(cx + 2, cy, [56, 56, 60]); set(cx + 3, cy, [56, 56, 60]);
  }
}

// The tractor in the classic view (art v2 has its own model; the classic atlas has none): seen from above, facing +x -
// the big rear wheels under the cab at the back, the small front ones by the hood, the exhaust stack, the cab's roof.
export function drawTractor(g, L, W, paint, wreck) {
  const body = wreck ? '#3b302b' : paint, dark = '#1b1a18';
  if (!wreck) {   // the plough behind (FA4)
    g.fillStyle = '#38383c'; g.fillRect(-L / 2 - 14, -3, 16, 6);
    g.fillStyle = '#a82c22'; g.fillRect(-L / 2 - 18, -W / 2 + 2, 4, W - 4);
    for (let k = 0; k < 5; k++) { g.fillStyle = '#46464a'; g.beginPath(); g.arc(-L / 2 - 24 - (k & 1) * 2, -W / 2 + 6 + k * (W - 12) / 4, 5, 0, 6.283); g.fill(); g.fillStyle = '#c8c8cc'; g.beginPath(); g.arc(-L / 2 - 25 - (k & 1) * 2, -W / 2 + 5 + k * (W - 12) / 4, 3, 0, 6.283); g.fill(); }
  }
  g.fillStyle = dark;
  g.fillRect(-L / 2 + 2, -W / 2, 32, 13); g.fillRect(-L / 2 + 2, W / 2 - 13, 32, 13);          // the rear tyres
  g.fillRect(L / 2 - 24, -W / 2 + 5, 17, 9); g.fillRect(L / 2 - 24, W / 2 - 14, 17, 9);       // the front tyres
  g.fillStyle = '#3a3936';
  for (let k = 0; k < 32; k += 5) { g.fillRect(-L / 2 + 3 + k, -W / 2, 2, 13); g.fillRect(-L / 2 + 3 + k, W / 2 - 13, 2, 13); }   // the treads
  g.fillStyle = body;
  g.fillRect(-L / 2 + 30, -W / 2 + 15, L - 32, W - 30);                                        // the hood
  g.fillRect(-L / 2 + 4, -W / 2 + 11, 32, W - 22);                                              // the cab
  g.fillStyle = wreck ? '#2a2420' : '#efede6';
  g.fillRect(-L / 2 + 6, -W / 2 + 13, 28, W - 26);                                              // its roof
  g.fillStyle = wreck ? '#221d1a' : '#3f5f7c';
  g.fillRect(-L / 2 + 30, -W / 2 + 13, 4, W - 26);                                              // the windscreen's edge
  g.fillStyle = dark;
  g.fillRect(L / 2 - 4, -W / 2 + 17, 3, W - 34);                                                // the grille
  g.beginPath(); g.arc(L / 2 - 18, -W / 2 + 19, 3, 0, 6.283); g.fill();                         // the exhaust stack
}

// The combine harvester in the classic view (facing +x): the wide header and its reel at the front, the body and the
// grain tank, the cab over the header, the unloading auger folded along the side, the big front wheels.
export function drawCombine(g, L, W, paint, wreck) {
  const body = wreck ? '#3b302b' : paint, dark = '#1b1a18';
  g.fillStyle = dark;
  g.fillRect(L / 2 - 58, -W / 2 + 16, 30, 16); g.fillRect(L / 2 - 58, W / 2 - 32, 30, 16);     // the drive wheels
  g.fillRect(-L / 2 + 8, -W / 2 + 26, 20, 12); g.fillRect(-L / 2 + 8, W / 2 - 38, 20, 12);     // the steering wheels
  g.fillStyle = body;
  g.fillRect(-L / 2 + 4, -W / 2 + 30, L - 34, W - 60);                                           // the body
  g.fillStyle = wreck ? '#2c2622' : '#9a2a22';
  g.fillRect(-L / 2 + 18, -W / 2 + 36, 50, W - 72);                                              // the grain tank
  g.fillStyle = wreck ? '#2a2420' : '#d8c070';
  g.fillRect(-L / 2 + 22, -W / 2 + 40, 42, W - 80);                                              // the grain in it
  g.fillStyle = wreck ? '#33291f' : '#5a5650';
  g.fillRect(L / 2 - 26, -W / 2 + 2, 24, W - 4);                                                 // the header
  g.fillStyle = wreck ? '#2b2620' : '#c8a640';
  for (let y = -W / 2 + 6; y < W / 2 - 6; y += 6) g.fillRect(L / 2 - 6, y, 5, 3);               // its cutter bar's teeth
  g.fillStyle = body;
  g.fillRect(L / 2 - 22, -W / 2 + 4, 4, W - 8);                                                  // the reel
  g.fillRect(-L / 2 + 30, -W / 2 + 22, 46, 6);                                                   // the auger, folded
  g.fillStyle = wreck ? '#2a2420' : '#efede6';
  g.fillRect(L / 2 - 52, -14, 24, 28);                                                           // the cab's roof
  g.fillStyle = wreck ? '#221d1a' : '#3f5f7c';
  g.fillRect(L / 2 - 30, -12, 3, 24);                                                            // its windscreen
}

const COMBINE_GREEN = '#3f9a2c';
export class FarmArt {
  constructor(S) { this.S = S; this.cv = new Map(); }
  drawTractor(g, def, p, wreck) { const c = def.id === 'combine'; (c ? drawCombine : drawTractor)(g, def.L, def.W, c && !p ? COMBINE_GREEN : PAINTS[p % PAINTS.length] || '#c8262b', wreck); }   // (the combine green: FA4)
  // ---- the classic view: canvases made once, drawn in the world pass ----
  _canvas(key, w, h, fill) {
    let c = this.cv.get(key);
    if (c) return c;
    c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d'), img = g.createImageData(w, h), d = img.data;
    fill((x, y, rgb) => { if (x < 0 || y < 0 || x >= w || y >= h) return; const i = (y * w + x) * 4; d[i] = rgb[0]; d[i + 1] = rgb[1]; d[i + 2] = rgb[2]; d[i + 3] = 255; });
    g.putImageData(img, 0, 0);
    this.cv.set(key, c);
    return c;
  }
  drawV1(g, view) {
    const S = this.S;
    if (S.fields && S.fields.length) {
      g.imageSmoothingEnabled = false;
      for (const f of S.fields) {
        if (f.x > view.x1 || f.y > view.y1 || f.x + f.w < view.x0 || f.y + f.h < view.y0) continue;
        const len = f.v ? f.h : f.w, sl = len / f.segs, n = f.r.length >> 2;
        for (let r = 0; r < n; r++) {
          const s = f.r[r * 4], gr = f.r[r * 4 + 1], m = f.r[r * 4 + 2], ok = f.r[r * 4 + 3];
          for (let k = 0; k < f.segs; k++) {
            if (!(ok & (1 << k))) continue;
            const x = f.v ? f.x + r * f.rw : f.x + k * sl, y = f.v ? f.y + k * sl : f.y + r * f.rw, w = f.v ? f.rw : sl, h = f.v ? sl : f.rw;
            if (x > view.x1 || y > view.y1 || x + w < view.x0 || y + h < view.y0) continue;
            const look = m & (1 << k) ? (s === 0 ? 1 : s === 1 ? 2 : 0) : rowLook(s, gr);   // (done behind the tractor: the next look)
            const c = this._canvas(`r${look}${f.v}`, 32, 32, (set) => { for (let b = 0; b < 32; b++) for (let a = 0; a < 32; a++) { const rgb = rowPixel(look, a, b); f.v ? set(b, a, rgb) : set(a, b, rgb); } });
            for (let t = 0; t < (f.v ? h : w); t += 64) {
              const span = Math.min(64, (f.v ? h : w) - t);
              if (f.v) g.drawImage(c, 0, 0, 32, span / P, x, y + t, w, span); else g.drawImage(c, 0, 0, span / P, 32, x + t, y, span, h);
            }
            if (look === 0 && baleAt(r, k)) g.drawImage(this._canvas('bale', BALE, BALE, balePixels), x + w / 2 - BALE, y + h / 2 - BALE, BALE * P, BALE * P);   // (a round bale on the stubble)
          }
        }
      }
    }
    for (const q of S.garden || []) {
      const [x, y, c, st, fl] = q;
      if (x < view.x0 - 40 || x > view.x1 + 40 || y < view.y0 - 30 || y > view.y1 + 30) continue;
      const cv = this._canvas(`p${c}:${st}:${fl}`, PLOT_W, PLOT_H, (set) => plotPixels(c, st, fl, set));
      g.drawImage(cv, x - PLOT_W, y - PLOT_AY * P, PLOT_W * P, PLOT_H * P);
    }
  }
  // ---- art v2: ground decals (the host's generated sprites: gbuf / put, made once and kept) ----
  drawV2(host, F, gbuf, put) {
    const S = this.S, E = host.E, x0 = host.vx0 - 64, x1 = host.vx1 + 64, y0 = host.vy0 - 64, y1 = host.vy1 + 64;
    const N = [128, 128, 255, 255], GROUND = 1;   // (flat ground: gbuf.js F_GROUND)
    if (S.fields && S.fields.length) for (const f of S.fields) {
      if (f.x > x1 || f.y > y1 || f.x + f.w < x0 || f.y + f.h < y0) continue;
      const len = f.v ? f.h : f.w, sl = Math.round(len / f.segs), n = f.r.length >> 2;
      for (let r = 0; r < n; r++) {
        const s = f.r[r * 4], gr = f.r[r * 4 + 1], m = f.r[r * 4 + 2], ok = f.r[r * 4 + 3];
        for (let k = 0; k < f.segs; k++) {
          if (!(ok & (1 << k))) continue;
          const x = f.v ? f.x + r * f.rw : f.x + k * (len / f.segs), y = f.v ? f.y + k * (len / f.segs) : f.y + r * f.rw;
          if (x > x1 || y > y1 || x + (f.v ? f.rw : sl) < x0 || y + (f.v ? sl : f.rw) < y0) continue;
          const look = m & (1 << k) ? (s === 0 ? 1 : s === 1 ? 2 : 0) : rowLook(s, gr);
          const key = host._conv(`farm|r${look}|${f.v}|${sl}|${f.rw}`, () => {
            const A = Math.ceil(sl / P), B = f.rw / P, w = f.v ? B : A, h = f.v ? A : B, G = gbuf(w, h, 0, 0);
            G.ap = P;
            for (let a = 0; a < A; a++) for (let b = 0; b < B; b++) put(G, f.v ? b : a, f.v ? a : b, rowPixel(look, a, b), 0, N, GROUND);
            return G;
          }, true);
          if (key) E.drawDecal(key, x, y, 0, 1, 0);
          if (look === 0 && baleAt(r, k)) {   // (a round bale on the stubble)
            const bk = host._conv('farm|bale', () => { const G = gbuf(BALE, BALE, BALE >> 1, BALE >> 1); G.ap = P; balePixels((px, py, rgb) => put(G, px, py, rgb, 0, N, GROUND)); return G; }, true);
            if (bk) E.drawDecal(bk, x + (f.v ? f.rw : sl) / 2, y + (f.v ? sl : f.rw) / 2, 0, 1, 0);
          }
        }
      }
    }
    for (const v of F.vehs || []) {   // the plough behind each tractor (FA4)
      const def = v.d && VEHICLE_BY_INDEX[v.d.m];
      if (!def || def.id !== 'tractor' || (v.flags & 16)) continue;   // (not a wreck: VF.WRECK)
      const key = host._conv('farm|plough', () => { const G = gbuf(PLOUGH_A, PLOUGH_B, PLOUGH_A >> 1, PLOUGH_B >> 1); G.ap = P; ploughPixels((px, py, rgb) => put(G, px, py, rgb, 0, N, GROUND)); return G; }, true);
      const a = v.ra || 0, d = def.L / 2 + PLOUGH_A;
      if (key) E.drawDecal(key, v.rx - Math.cos(a) * d, v.ry - Math.sin(a) * d, a, 1, 0);
    }
    for (const q of S.garden || []) {
      const [x, y, c, st, fl] = q;
      if (x < x0 || x > x1 || y < y0 || y > y1) continue;
      const key = host._conv(`farm|p${c}:${st}:${fl}`, () => {
        const G = gbuf(PLOT_W, PLOT_H, PLOT_W >> 1, PLOT_AY);
        G.ap = P;
        plotPixels(c, st, fl, (px, py, rgb) => put(G, px, py, rgb, 0, N, GROUND));
        return G;
      }, true);
      if (key) E.drawDecal(key, x, y, 0, 1, 0);
    }
  }
}
