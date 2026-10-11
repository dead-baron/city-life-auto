// The classic renderer's World v3 container port (shared/map.js buildContainerPort; art v2 draws the same props as
// voxel models, client/art2/game/statics.js): the container stacks, the quay's ship-to-shore gantry cranes, the moored
// ship's sections, straddle carriers, light masts, the gate's barrier and the cranes' rails. Loaded when the first of
// them is drawn (client/render/tiles.js), so the page's startup code doesn't carry it. Drawn in code in the 3/4 view:
// a thing's height rises up the screen from its base.
const COLS = ['#a8402e', '#2f5a8a', '#3e6a4a', '#c88a30', '#7a7e84', '#6a3a5a', '#2f7a7a'];
const HS = [[3, 4, 2], [2, 3, 3], [4, 4, 3], [2, 2, 3], [3, 2, 4], [2, 4, 2]];
const LINE = '#14161c';
const shade = (hex, k) => {
  const n = parseInt(hex.slice(1), 16), f = (v) => Math.max(0, Math.min(255, Math.round(v * k)));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
};
const rect = (g, c, x, y, w, h) => { g.fillStyle = c; g.fillRect(x, y, w, h); };

// a block of stacks: three rows of boxes along y, each column as tall as its tiers (the south faces show)
function stack(g, p) {
  const v = (p.v || 0) % 6, hs = HS[v], x0 = p.x - 80, y0 = p.y - 128, Z = 0.58;
  for (let c = 0; c < 3; c++) {
    const n = hs[c], col = COLS[(v * 5 + c * 3 + (n - 1) * 2) % COLS.length], h = n * 58 * Z, x = x0 + c * 53 + 1;
    rect(g, LINE, x - 1, y0 - h - 1, 53, 256 + 2);
    rect(g, shade(col, 0.72), x, y0 + 254 - h, 51, h);   // the south face: the doors of the top boxes and those below
    for (let k = 0; k < n; k++) rect(g, shade(col, 0.5), x, y0 + 254 - k * 58 * Z - 2, 51, 2);
    rect(g, col, x, y0 - h, 51, 254);                    // the roof of the top box
    for (let yy = 4; yy < 254; yy += 8) rect(g, shade(col, 0.85), x + 2, y0 - h + yy, 47, 1);
  }
}
// a gantry crane: the legs on the rails, the portal, the boom out over the water (west unless p.a), the house on top
function crane(g, p) {
  const e = p.a ? -1 : 1, x = p.x, y = p.y, H = 226 * 0.62, red = '#c4482e', dk = '#8e3222';
  for (const lx of [-51, 51]) for (const dy of [-64, 64]) { rect(g, LINE, x + lx - 4, y + dy - H - 1, 8, H + 2); rect(g, red, x + lx - 3, y + dy - H, 6, H); }
  for (const dy of [-64, 64]) rect(g, dk, x - 54, y + dy - 0.58 * H, 108, 5);
  const bx0 = e > 0 ? x - 351 : x + 351 - 470, by = y - 40 - H;
  rect(g, LINE, bx0 - 1, by - 1, 472, 82); rect(g, red, bx0, by, 470, 80); rect(g, dk, bx0, by + 70, 470, 10);
  for (let k = 0; k < 470; k += 24) rect(g, dk, bx0 + k, by + 8, 2, 62);
  const hx = e > 0 ? x + 11 : x - 11 - 64;
  rect(g, LINE, hx - 1, by - 26, 66, 28); rect(g, '#e8e4d8', hx, by - 25, 64, 26);
  const tx = x - e * 281;
  rect(g, '#3a3c44', tx - 18, by + 20, 36, 40);
  if (p.k) { rect(g, LINE, tx - 27, y - 74, 54, 132); rect(g, COLS[3], tx - 26, y - 73, 52, 130); }
  g.strokeStyle = '#2a2c32'; g.lineWidth = 1; g.beginPath(); g.moveTo(tx - 10, by + 60); g.lineTo(tx - 10, y - 70); g.moveTo(tx + 10, by + 60); g.lineTo(tx + 10, y - 70); g.stroke();
}
// a section of the moored ship, running north-south (p.v: 0 the bow, 1 a hold, 2 the stern)
const HULL = ['#2a3a5a', '#7a2a24', '#2a4a3a', '#3a3c44'];
function ship(g, p) {
  const v = p.v || 0, c = (p.c || 0) % 4, L = v === 0 ? 320 : 256, x0 = p.x - 110, y0 = p.y - L / 2, FB = 30;
  g.fillStyle = LINE; g.beginPath();
  if (v === 0) { g.moveTo(x0 - 1, y0 - FB); g.lineTo(x0 + 221, y0 - FB); g.lineTo(x0 + 221, y0 + L * 0.4 - FB); g.quadraticCurveTo(x0 + 221, y0 + L - FB, x0 + 110, y0 + L + 1 - FB); g.quadraticCurveTo(x0 - 1, y0 + L - FB, x0 - 1, y0 + L * 0.4 - FB); }
  else g.rect(x0 - 1, y0 - FB - 1, 222, L + 2);
  g.fill();
  g.fillStyle = HULL[c]; g.beginPath();
  if (v === 0) { g.moveTo(x0, y0 - FB); g.lineTo(x0 + 220, y0 - FB); g.lineTo(x0 + 220, y0 + L * 0.4 - FB); g.quadraticCurveTo(x0 + 220, y0 + L - FB, x0 + 110, y0 + L - FB); g.quadraticCurveTo(x0, y0 + L - FB, x0, y0 + L * 0.4 - FB); }
  else g.rect(x0, y0 - FB, 220, L);
  g.fill();
  rect(g, '#5a6a5a', x0 + 6, y0 - FB + 2, 208, v === 0 ? L * 0.5 : L - 4);
  const boxes = (ya, n, tiers) => { for (let j = 0; j < 4; j++) for (let s = 0; s < n; s++) { const col = COLS[(c * 3 + j * 5 + s * 2) % COLS.length], h = tiers[j % tiers.length] * 20; rect(g, LINE, x0 + 6 + j * 52, ya + s * 127 - FB - h, 52, 127); rect(g, col, x0 + 7 + j * 52, ya + s * 127 - FB - h + 1, 50, 125); } };
  if (v === 1) boxes(y0, 2, [3, 2, 3, 2]);
  else if (v === 0) boxes(y0, 1, [2, 3, 3, 2]);
  else {
    rect(g, LINE, x0 + 29, y0 + 19 - FB - 90, 162, 102); rect(g, '#ece8de', x0 + 30, y0 + 20 - FB - 90, 160, 100);
    for (let z = 0; z < 4; z++) rect(g, '#2a3a4a', x0 + 40, y0 + 104 - FB - z * 22, 140, 6);
    rect(g, '#2a2c34', x0 + 92, y0 + 2 - FB - 110, 36, 40);
    boxes(y0 + 130, 1, [2, 2, 1, 2]);
  }
}
function straddle(g, p) {
  const x = p.x - 32, y = p.y - 48, H = 70;
  for (const lx of [0, 54]) { rect(g, LINE, x + lx - 1, y - H - 1, 12, 98); rect(g, '#e0a828', x + lx, y - H, 10, 96); }
  rect(g, '#e0a828', x, y - H, 64, 10); rect(g, '#e0a828', x, y - H + 80, 64, 10); rect(g, '#e8e4d8', x + 42, y - H + 66, 20, 18);
}
function mast(g, p, night) {
  rect(g, LINE, p.x - 2, p.y - 92, 4, 92); rect(g, '#3a3c44', p.x - 1, p.y - 91, 2, 90);
  rect(g, LINE, p.x - 14, p.y - 98, 28, 7); rect(g, night ? '#fff6d2' : '#d8d4c4', p.x - 13, p.y - 97, 26, 5);
}
function gate(g, p) {
  const v = !!p.a;
  rect(g, LINE, p.x - (v ? 3 : 46), p.y - (v ? 46 : 18), v ? 6 : 92, v ? 92 : 6);
  for (let k = 0; k < 90; k += 10) rect(g, (k / 10) % 2 ? '#f0eee8' : '#d8402e', v ? p.x - 2 : p.x - 45 + k, v ? p.y - 45 + k : p.y - 17, v ? 4 : 10, v ? 10 : 4);
}
function rail(g, p) { const L = p.len || 256; rect(g, '#8e8c84', p.x - 4, p.y - L / 2, 8, L); rect(g, '#5a5c62', p.x - 1, p.y - L / 2, 2, L); }

export function drawPortProp(g, p, night) {
  switch (p.t) {
    case 'cstack': stack(g, p); break;
    case 'gcrane': crane(g, p); break;
    case 'cship': ship(g, p); break;
    case 'straddle': straddle(g, p); break;
    case 'ymast': mast(g, p, night); break;
    case 'ygate': gate(g, p); break;
    case 'crail': rail(g, p); break;
  }
}
