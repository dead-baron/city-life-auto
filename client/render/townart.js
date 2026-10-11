// The classic renderer's World v3 small towns (H40, docs/WORLD-V3.md 8.13.2), seen from above: a town building's own
// roof over its lot's painted art (b.look / the lot's look, shared/world3-towns.js townModels) - the shopfronts' tar
// roofs behind their false fronts, gables for the houses, cabins, clinic, sheriff, motel, co-op and the white church,
// the sawmill's ribbed shed and its dirt log yard, the elevator's head house; and m.townKit's models - porches, the
// sawmill's logs, loader and saw line, silos, the steeple, the dock, sacks, boards, the boardwalk's rails, benches and
// lamps, the pier's shelter.
import { TILE, CHUNK_PX } from '../../shared/constants.js';

const FLAT = new Set(['shopfront', 'beachshop', 'lodgerow', 'surfrow', 'feedrow']);
const GABLE = { cabin: '#3e5a4c', farmhouse: '#5a5e6a', cottage: '#a8604a', stilts: '#5a7a8a', clinic: '#6a7280', sheriff: '#4a3a30', motel: '#7a4a3a', coop: '#7a7c84', church: '#4a4e58' };
function gable(g, x, y, w, h, c, ns) {
  g.fillStyle = c; g.fillRect(x, y, w, h);
  g.fillStyle = 'rgba(255,255,255,.14)'; if (ns) g.fillRect(x, y, w / 2, h); else g.fillRect(x, y, w, h / 2);
  g.fillStyle = 'rgba(0,0,0,.25)'; if (ns) g.fillRect(x + w / 2 - 1, y, 2, h); else g.fillRect(x, y + h / 2 - 1, w, 2);
  g.fillStyle = 'rgba(0,0,0,.12)'; for (let k = 6; k < (ns ? w : h); k += 6) if (ns) g.fillRect(x + k, y, 1, h); else g.fillRect(x, y + k, w, 1);
}
// over a lot drawn from the prefab sheet (tiles.js drawPrefab): the building's footprint (sol: the prefab's solid)
export function drawTownLook(g, p, sol) {
  const L = p.look, x = (p.tx + sol[0]) * TILE, y = (p.ty + sol[1]) * TILE, w = (sol[2] - sol[0]) * TILE, h = (sol[3] - sol[1]) * TILE;
  if (FLAT.has(L)) {   // (a low gable behind the false front's top along the street)
    gable(g, x, y, w, h, L === 'beachshop' || L === 'surfrow' ? '#6a5a50' : '#4e4844', false);
    g.fillStyle = L === 'beachshop' || L === 'surfrow' ? '#d8c8a8' : '#7a5a3e'; g.fillRect(x, y + h - 7, w, 7);
    return;
  }
  if (L === 'sawmill' || L === 'elevator') {
    const sw = Math.round((sol[2] - sol[0]) * (L === 'sawmill' ? 0.56 : 0.32)) * TILE;
    g.fillStyle = L === 'sawmill' ? '#8a7a5a' : '#a8a49a'; g.fillRect(x + sw, y, w - sw, h);   // the log yard's dirt, the bins' concrete
    g.fillStyle = L === 'sawmill' ? '#7a8088' : '#9aa0a6'; g.fillRect(x, y, sw, h);
    g.fillStyle = 'rgba(0,0,0,.2)'; for (let k = 4; k < sw; k += 5) g.fillRect(x + k, y, 1, h);
    if (L === 'elevator') { g.fillStyle = '#c8c4b8'; g.fillRect(x + sw / 2 - 18, y + h / 2 - 18, 36, 36); }
    return;
  }
  if (GABLE[L]) gable(g, x, y, w, h, GABLE[L], L === 'church');
}

// m.townKit's models, from above (within reach of the chunk cx, cy)
export function drawTownKit(g, k, cx, cy) {
  const x0 = cx * CHUNK_PX, y0 = cy * CHUNK_PX, r = (k.len || 120) / 2 + 60;
  if (k.x + r < x0 || k.x - r > x0 + CHUNK_PX || k.y + r < y0 || k.y - r > y0 + CHUNK_PX) return;
  const L = k.len || 0;
  g.save(); g.translate(k.x, k.y); g.rotate(k.a || 0);
  switch (k.k) {
    case 'porch': g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(-L / 2, -12, L, 34); g.fillStyle = '#6a5444'; g.fillRect(-L / 2, -17, L, 30); g.fillStyle = 'rgba(0,0,0,.2)'; for (let x = -L / 2 + 5; x < L / 2; x += 5) g.fillRect(x, -17, 1, 30); break;
    case 'logs': for (let i = 0; i < 4; i++) { g.fillStyle = i % 2 ? '#5a3e2a' : '#6a4a32'; g.fillRect(-L / 2, -20 + i * 10, L, 9); g.fillStyle = '#d8b47a'; g.fillRect(L / 2 - 3, -20 + i * 10, 3, 9); } break;
    case 'loader': g.fillStyle = '#e0b020'; g.fillRect(-42, -20, 64, 40); g.fillStyle = '#2a3444'; g.fillRect(-14, -12, 20, 24); g.fillStyle = '#5a3e2a'; g.fillRect(26, -23, 12, 46); break;
    case 'saw': g.fillStyle = '#3a3a3c'; g.fillRect(-14, -L / 2, 28, L); g.fillStyle = '#5a3e2a'; g.fillRect(-8, -6, 16, L / 2); g.fillStyle = '#e0b020'; g.fillRect(-18, -L / 2 + 6, 36, 18); break;
    case 'silos': { const n = k.n || 4, s = L / n, rr = Math.min(48, s / 2 - 2); for (let i = 0; i < n; i++) { const sx = -L / 2 + s * (i + 0.5); g.fillStyle = 'rgba(0,0,0,.25)'; g.beginPath(); g.arc(sx + 8, 8, rr, 0, 6.283); g.fill(); g.fillStyle = '#dcd8cc'; g.beginPath(); g.arc(sx, 0, rr, 0, 6.283); g.fill(); g.fillStyle = '#9aa0a8'; g.beginPath(); g.arc(sx, 0, rr * 0.35, 0, 6.283); g.fill(); } g.fillStyle = '#7a7e86'; g.fillRect(-L / 2, -4, L, 8); break; }
    case 'steeple': g.fillStyle = 'rgba(0,0,0,.3)'; g.fillRect(-8, -8, 44, 40); g.fillStyle = '#f2f0ea'; g.fillRect(-16, -16, 32, 32); g.fillStyle = '#4a4e58'; g.fillRect(-10, -10, 20, 20); g.fillStyle = '#d8b048'; g.fillRect(-1, -7, 2, 14); g.fillRect(-5, -3, 10, 2); break;
    case 'dock': g.fillStyle = '#b8b2a6'; g.fillRect(-L / 2, -18, L, 36); g.fillStyle = '#e0b020'; g.fillRect(-L / 2, 16, L - 40, 2); g.fillStyle = '#e8dcc0'; for (let x = -L / 2 + 14; x < L / 2 - 74; x += 70) g.fillRect(x, -12, 30, 24); break;
    case 'sacks': g.fillStyle = '#d8c8a0'; g.fillRect(-16, -13, 32, 26); g.fillStyle = 'rgba(0,0,0,.2)'; g.fillRect(-16, 0, 32, 1); break;
    case 'boards': { const n = k.n || 5, C = ['#e8604a', '#2fb0d8', '#f0d040', '#3a9a7a', '#f0eee8']; for (let i = 0; i < n; i++) { g.fillStyle = C[i % 5]; g.beginPath(); g.ellipse(-n * 5 + 5 + i * 10, -6, 4, 10, 0, 0, 6.283); g.fill(); } break; }
    case 'rail': g.fillStyle = '#ece6d8'; g.fillRect(-L / 2, -1.5, L, 3); break;
    case 'bench': g.fillStyle = '#6a4a32'; g.fillRect(-16, -5, 32, 10); break;
    case 'lamp': g.fillStyle = '#2a2c30'; g.beginPath(); g.arc(0, 0, 3, 0, 6.283); g.fill(); g.fillStyle = '#f8e8b8'; g.beginPath(); g.arc(0, -2, 2, 0, 6.283); g.fill(); break;
    case 'shelter': g.fillStyle = 'rgba(0,0,0,.28)'; g.fillRect(-36, -26, 84, 64); g.fillStyle = '#4a5a6a'; g.fillRect(-42, -32, 84, 64); g.fillStyle = 'rgba(255,255,255,.15)'; g.fillRect(-42, -32, 84, 32); break;
  }
  g.restore();
}
