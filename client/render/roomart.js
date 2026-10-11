// The classic renderer's fit-outs drawn plainly, top-down, where the concept paintings no longer match the game (loaded
// with the first walk-in interior: client/render/tiles.js interiorArt):
//   - the food places (IN8; shared/foodrooms.js lays them out, as art v2 draws them): the diner's checker floor, red
//     booths and stools, the jukebox; the fast-food place's queue lane, drinks machine, small tables and menu boards; the
//     restaurant's planks, tables with cloths and candles, the host stand and the runner; the kitchen behind each counter
//   - the hospital's and the police station's lobbies as the B takes have them (IN1-B, IN2-B), in place of the old
//     paintings: the hospital's white tile, the white desk with its blue stripe, the blue waiting chairs, the pharmacy
//     window, the red doors, the lifts; the police lobby's stone tile, wood desk and flag, chairs, notice board, clock and
//     shield, and the armory cage in the officers' corner (the cells: tiles.js cellsArt, drawn after)
// Pure art: what you can do in there comes from the server.
import { foodLayout } from '../../shared/foodrooms.js';

const rect = (g, c, x, y, w, h) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
function tiles(g, x, y, w, h, s, a, b, grout) {
  for (let yy = 0; yy < h; yy += s) for (let xx = 0; xx < w; xx += s) rect(g, ((xx / s + yy / s) & 1) ? a : b, x + xx, y + yy, Math.min(s, w - xx), Math.min(s, h - yy));
  if (grout) { g.fillStyle = grout; for (let xx = 0; xx < w; xx += s) g.fillRect(x + xx, y, 1, h); for (let yy = 0; yy < h; yy += s) g.fillRect(x, y + yy, w, 1); }
}
function plant(g, x, y, r = 7) { rect(g, '#9a5030', x - r * 0.6, y - r * 0.6, r * 1.2, r * 1.2); g.fillStyle = '#3f8a3e'; g.beginPath(); g.arc(x, y - 1, r, 0, 6.283); g.fill(); g.fillStyle = '#5aa84c'; g.beginPath(); g.arc(x - 2, y - 3, r * 0.55, 0, 6.283); g.fill(); }

// one walk-in unit: true when drawn here (tiles.js then skips its plain fit-out and the painting)
export function roomArt(g, m, b, u, ox, oy, TILE) {
  if (u.kind === 'coffee') return food(g, b, u, ox, oy, TILE);
  if (u.kind === 'hospital' || u.kind === 'police') return lobby(g, m, b, u, ox, oy, TILE);
  return false;
}

function food(g, b, u, ox, oy, TILE) {
  const L = foodLayout(b, u, TILE);
  if (!L) return false;
  const X0 = L.X0 - ox, X1 = L.X1 - ox, W = X1 - X0, back = L.back - oy, cy = L.cy - oy, Ya = L.Ya - oy, Yb = L.Yb - oy, st = L.style;
  // the floors: quarry tile behind the counter; the diner's checker, fast food's cream tile, the restaurant's planks
  tiles(g, X0, back, W, cy - back, 16, '#9e4a3a', '#a85242', '#70382e');
  if (st === 'diner') tiles(g, X0, cy, W, Yb - cy, 12, '#2c2c32', '#e6e4dc');
  else if (st === 'fastfood') tiles(g, X0, cy, W, Yb - cy, 16, '#ebe5d4', '#e2dcc8', '#c8c0ac');
  else { rect(g, '#644028', X0, cy, W, Yb - cy); g.fillStyle = '#4a2e1e'; for (let y = cy; y < Yb; y += 8) g.fillRect(X0, y, W, 1); if (L.host) { rect(g, '#c49646', L.dc - ox - 14, L.host.y0 - oy, 28, Yb - (L.host.y0 - oy)); rect(g, '#8c2026', L.dc - ox - 11, L.host.y0 - oy, 22, Yb - (L.host.y0 - oy)); } }
  // the back wall's band, the kitchen line along it (the grill / fryers / stove), the menu boards or the pass's heat lamps
  rect(g, st === 'diner' ? '#c42c30' : st === 'fastfood' ? '#d42c28' : '#3a5a48', X0, back, W, 4);
  if (cy - back >= TILE) {
    rect(g, '#b8bcc2', X0 + 4, back + 4, W - 8, 9); rect(g, '#8a8e96', X0 + 4, back + 12, W - 8, 1);
    if (st === 'diner') { rect(g, '#323034', X0 + 10, back + 5, 30, 7); g.fillStyle = '#ec7a28'; for (let k = 0; k < 3; k++) g.fillRect(X0 + 13 + k * 9, back + 7, 4, 3); }
    else if (st === 'fastfood') { for (let k = 0; k < 2; k++) { rect(g, '#34363c', X0 + 10 + k * 16, back + 5, 13, 7); rect(g, '#e4ba46', X0 + 12 + k * 16, back + 7, 9, 3); } }
    else { g.fillStyle = '#1e1e22'; for (let k = 0; k < 4; k++) g.fillRect(X0 + 10 + (k & 1) * 12, back + 5 + (k >> 1) * 4, 4, 3); }
    if (st === 'fastfood') { const n = Math.max(1, Math.min(3, Math.floor((W - 8) / 46))), bw = Math.floor((W - 8 - 6 * (n + 1)) / n); for (let i = 0; i < n; i++) { const x = X0 + 10 + i * (bw + 6); rect(g, '#2e2c34', x, back, bw, 4); g.fillStyle = '#f4c43c'; for (let k = 2; k < bw - 6; k += 9) g.fillRect(x + k, back + 1, 5, 2); } }
    else { g.fillStyle = '#ffaa50'; for (let x = X0 + 46; x < X1 - 10; x += 14) g.fillRect(x, back + 6, 5, 2); }
  }
  // the counter (to the gap at its end): the diner's red with chrome, fast food's red with a yellow band, the restaurant's wood
  const cb = W > 128 ? X1 - TILE : X1 - 6;
  rect(g, st === 'restaurant' ? '#6a4630' : '#eeece4', X0 + 2, cy + 6, cb - X0 - 2, 20);
  rect(g, st === 'restaurant' ? '#4a3020' : st === 'diner' ? '#b8343a' : '#c8302e', X0 + 2, cy + 22, cb - X0 - 2, 6);
  rect(g, st === 'diner' ? '#d4d8de' : st === 'fastfood' ? '#f4c428' : '#c8a050', X0 + 2, cy + 24, cb - X0 - 2, 2);
  const tx = L.tillX - ox; rect(g, '#34363c', tx - 6, cy + 9, 12, 8); rect(g, '#78dc8c', tx - 3, cy + 10, 4, 3);
  if (st === 'diner') { const px = Math.min(cb - 24, tx + 26); rect(g, '#cce6ee', px, cy + 9, 18, 11); g.fillStyle = '#d6965a'; for (let k = 0; k < 3; k++) g.fillRect(px + 3 + k * 5, cy + 13, 3, 3); }
  else if (st === 'fastfood') { for (const k of [-1, 1]) { const x = tx + k * 22; if (x > X0 + 8 && x < cb - 16) rect(g, '#c8343a', x, cy + 10, 14, 10); } }
  else { g.fillStyle = '#f4f2ec'; for (let x = X0 + 10; x < cb - 10; x += 22) g.fillRect(x, cy + 12, 4, 4); }
  // the floor's furniture
  for (const B of L.booths) { const x = B.x0 - ox, y = B.y0 - oy, w = B.x1 - B.x0, h = B.y1 - B.y0; rect(g, '#b02e32', x, y, w, 10); rect(g, '#b02e32', x, y + h - 10, w, 10); rect(g, '#86222a', x, y, w, 3); rect(g, '#86222a', x, y + h - 3, w, 3); rect(g, '#eceae2', x + 2, y + 11, w - 4, h - 22); rect(g, '#c83030', x + 6, y + 15, 2, 2); rect(g, '#ecc832', x + 10, y + 15, 2, 2); }
  for (const S of L.stools) { g.fillStyle = '#c43a3c'; g.beginPath(); g.arc(S.x - ox, S.y - oy, 4, 0, 6.283); g.fill(); g.fillStyle = '#e66a6a'; g.fillRect(S.x - ox - 2, S.y - oy - 2, 2, 2); }
  if (L.jukebox) { const J = L.jukebox; rect(g, '#5a3a26', J.x0 - ox, J.y0 - oy, J.x1 - J.x0, J.y1 - J.y0); ['#ff7a3c', '#ffd250', '#5ac8ff', '#ff5ac8'].forEach((c, k) => rect(g, c, J.x0 - ox + 3 + k * 4, J.y0 - oy + 3, 3, J.y1 - J.y0 - 6)); }
  if (L.queue) { const Q = L.queue; for (const qx of [Q.x0, Q.x1]) { rect(g, '#2a3c96', qx - ox, Q.y0 - oy, 2, Q.y1 - Q.y0); g.fillStyle = '#d4d8de'; for (let y = Q.y0; y <= Q.y1; y += 16) g.fillRect(qx - ox - 1, y - oy - 1, 4, 4); } }
  if (L.drinks) { const D = L.drinks; rect(g, '#2a2c34', D.x0 - ox, D.y0 - oy, D.x1 - D.x0, D.y1 - D.y0); ['#c8283a', '#3c96dc', '#f0be28', '#50b45a'].forEach((c, k) => rect(g, c, D.x0 - ox + 2 + k * 4, D.y0 - oy + 3, 3, 6)); }
  for (const T2 of L.tables) {
    const x0 = T2.x0 - ox, y0 = T2.y0 - oy, w = T2.x1 - T2.x0, h = T2.y1 - T2.y0;
    if (T2.cloth) { rect(g, '#4a2e1e', x0 - 9, y0 + 5, 7, h - 10); rect(g, '#4a2e1e', x0 + w + 2, y0 + 5, 7, h - 10); rect(g, '#d6d2c8', x0 - 1, y0 - 1, w + 2, h + 2); rect(g, '#f4f2ec', x0, y0, w, h); rect(g, '#ffd678', x0 + w / 2 - 1, y0 + h / 2 - 1, 2, 2); rect(g, '#ffffff', x0 + 3, y0 + h / 2 - 2, 4, 4); rect(g, '#ffffff', x0 + w - 7, y0 + h / 2 - 2, 4, 4); }
    else { rect(g, '#c8343a', x0 - 9, y0 + 3, 7, h - 6); rect(g, '#e8b830', x0 + w + 2, y0 + 3, 7, h - 6); rect(g, '#f0ece0', x0, y0, w, h); rect(g, '#c83228', x0 + 4, y0 + 5, 3, 3); }
  }
  if (L.host) { const H = L.host; rect(g, '#5a3a26', H.x0 - ox, H.y0 - oy, H.x1 - H.x0, H.y1 - H.y0); rect(g, '#f0ecdc', H.x0 - ox + 3, H.y0 - oy + 2, 5, 4); }
  if (st === 'restaurant') { plant(g, X0 + 12, Yb - 12); plant(g, X1 - 12, Yb - 12); }
  rect(g, 'rgba(40,36,34,.55)', L.dc - ox - 16, Yb - 12, 32, 12);
  return true;
}

function lobby(g, m, b, u, ox, oy, TILE) {
  const wi = b.walkIn, south = !!wi.south, dir = south ? 1 : -1;
  const X0 = u.x0 * TILE - ox, X1 = (u.x1 + 1) * TILE - ox, W = X1 - X0;
  const back = (south ? wi.y0 : wi.y1 + 1) * TILE - oy, front = (south ? wi.y1 + 1 : wi.y0) * TILE - oy, depth = Math.abs(front - back);
  const R = (c, x, d, w, dd) => rect(g, c, x, south ? back + d : back - d - dd, w, dd);   // (d: the distance from the back wall)
  const cyD = Math.abs(u.counterRow * TILE - oy + (south ? 0 : TILE) - back), dc = (u.door.tx + (u.door.w || 2) / 2) * TILE - ox;
  const chairs = (x0, n, d, col) => { for (let i = 0; i < n; i++) { R(col, x0 + i * 13, d, 11, 9); R('#2a4a80', x0 + i * 13, d + 9, 11, 3); } };
  const plantD = (x, d, r) => plant(g, x, south ? back + d : back - d, r);
  if (u.kind === 'hospital') {
    tiles(g, X0, Math.min(back, front), W, depth, 16, '#eceff1', '#e4e8eb', '#c6cace');
    R('#3a6aa8', X0, 0, W, 3);
    const at = (f) => X0 + Math.round(W * f);
    R('#c4342e', at(0.47) - 24, 0, 48, 5); R('#5a1e1e', at(0.47) - 1, 0, 2, 5);                       // (the red doors to the back)
    R('#96a0a8', at(0.68) - 32, 0, 64, 8); for (let k = 0; k < 8; k++) R(['#cc4840', '#ecc850', '#4c92cc', '#74b464'][k & 3], at(0.68) - 28 + k * 7, 2, 5, 4);   // (the pharmacy window's shelves)
    for (const f of [0.86, 0.94]) if (at(f) + 18 < X1 - 8) R('#b0b6be', at(f) - 15, 0, 30, 4);            // (the lifts)
    R('#2a2e38', at(0.12), 0, 20, 12); R('#e8505a', at(0.12) + 3, 3, 14, 6);                           // (the vending machine)
    R('#e2e4e6', at(0.2), 2, 10, 8); R('#6eaae6', at(0.2) + 2, 3, 6, 4);                                // (the water cooler)
    // the desk: a long white top, a wood front with a blue stripe, its middle curving out toward the lobby
    const lo = X0 + 6, gapR = X1 - (W > 128 ? 34 : 6), mid = (lo + gapR) / 2, half = (gapR - lo) / 2;
    for (let x = lo; x < gapR; x += 2) { const bulge = Math.round(Math.max(0, Math.cos(Math.min(1, Math.abs(x - mid) / (half * 0.55)) * Math.PI / 2)) * 7); R('#ecebe6', x, cyD + 6, 2, 20 + bulge); R('#a07650', x, cyD + 22 + bulge, 2, 4); R('#3a6aa8', x, cyD + 24 + bulge, 2, 2); }
    for (const f of [0.38, 0.6]) R('#2a2e36', lo + (gapR - lo) * f, cyD + 9, 9, 4);
    // the waiting area: rows of blue chairs either side of the aisle from the doors, plants, mats
    for (let d = depth - 57, row = 0; d >= cyD + 70 && row < 3; d -= 46, row++) for (const side of [-1, 1]) {
      const room = side < 0 ? dc - 48 - (X0 + 40) : X1 - 40 - (dc + 48), n = Math.max(0, Math.min(5, Math.floor(room / 13)));
      if (n >= 2) for (let k = 0; k < (room > 190 ? 2 : 1); k++) chairs(side < 0 ? dc - 48 - n * 13 - k * (n * 13 + 30) : dc + 48 + k * (n * 13 + 30), n, d, '#3a62a8');
    }
    plantD(X0 + 16, 14, 8); plantD(X1 - 16, 14, 8); plantD(dc - 36, depth - 30, 7); plantD(dc + 36, depth - 30, 7);
    R('rgba(58,66,80,.8)', dc - 22, depth - 44, 44, 16);
    return true;
  }
  // police: pale stone tile; the wood desk with the computer, the flag; chairs either side of the doors; the notice board,
  // the clock and the shield on the back wall; the armory cage east of the cells
  tiles(g, X0, Math.min(back, front), W, depth, 16, '#c4bca6', '#bcb49e', '#a49c8c');
  R('#5a5c64', X0, 0, W, 3);
  const lo = X0 + 6, gapR = X1 - (W > 128 ? 34 : 6), mx = (lo + gapR) / 2;
  R('#8a6040', lo, cyD + 6, gapR - lo, 20); R('#6a4a32', lo, cyD + 22, gapR - lo, 4);
  R('#22262e', mx - 4, cyD + 9, 10, 4); R('#d8d6d0', mx + 12, cyD + 12, 10, 6);
  R('#c8a860', Math.max(X0 + 14, lo - 2) - 1, cyD + 38, 3, 3); R('#c82c2c', Math.max(X0 + 14, lo - 2) + 2, cyD + 36, 10, 6); R('#283c8c', Math.max(X0 + 14, lo - 2) + 2, cyD + 36, 4, 3);
  const k = u.cells !== undefined && m.cellBlocks ? m.cellBlocks[u.cells] : null;
  if (!k || k.south) { R('#b08256', X0 + Math.round(W * 0.3) - 26, 0, 52, 4); R('#f0f0e8', X0 + Math.round(W * 0.52) - 4, 0, 8, 4); R('#d6b046', X0 + Math.round(W * 0.7) - 5, 0, 10, 5); }
  if (k && k.south && k.bars.length) {
    const ex = Math.max(...k.bars.map((q) => Math.max(q[0], q[2]))) - ox, XE = X1 - 8, yb = (k.bars.find((q) => q[1] === q[3]) || k.bars[0])[1] - oy;
    if (XE - ex > 40) {
      const y0 = Math.min(back, yb), h = Math.abs(yb - back);
      rect(g, '#9aa0a8', ex + 4, y0, XE - ex - 4, h);
      g.fillStyle = '#7a8088'; for (let x = ex + 4; x < XE; x += 4) g.fillRect(x, y0, 1, h); for (let y = y0; y < y0 + h; y += 4) g.fillRect(ex + 4, y, XE - ex - 4, 1);
      g.fillStyle = '#28282c'; for (let x = ex + 10; x < XE - 6; x += 7) g.fillRect(x, y0 + 2, 2, 10);   // (the rifles racked on the back wall)
      g.fillStyle = '#5a6a44'; for (let x = ex + 8; x < XE - 12; x += 16) g.fillRect(x, y0 + h - 12, 12, 8);   // (the ammo cases)
      rect(g, "#5a5e66", ex + 4, yb - 2, XE - ex - 4, 3);
    }
  }
  for (let d = depth - 57, row = 0; d >= cyD + 76 && row < 2; d -= 50, row++) for (const side of [-1, 1]) {
    const room = side < 0 ? dc - 44 - (X0 + 44) : X1 - 44 - (dc + 44), n = Math.max(0, Math.min(4, Math.floor(room / 13)));
    if (n >= 2) for (let q = 0; q < Math.min(3, Math.floor((room + 30) / (n * 13 + 30))); q++) chairs(side < 0 ? dc - 44 - n * 13 - q * (n * 13 + 30) : dc + 44 + q * (n * 13 + 30), n, d, '#3a62a8');
  }
  R('#e2e4e6', X0 + 12, depth - 88, 10, 8); plantD(X0 + 22, depth - 32, 8); plantD(X1 - 22, depth - 32, 8); plantD(dc - 34, depth - 30, 7); plantD(dc + 34, depth - 30, 7);
  R('rgba(58,66,80,.8)', dc - 22, depth - 44, 44, 16);
  return true;
}
