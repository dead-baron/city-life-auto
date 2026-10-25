// Facade dressing by the district (the owner's notes 2: "bump up some of the building dressing so it has more variety and
// details to go with it like graffiti or street art or fire escape stairs or vines or things in the window or balconies
// or any other details you can pull from the concepts"). Two halves, both seeded by the building (its id and section:
// the same in every bake and browser, never Math.random):
//   dressPlan(spec, o)   statics.js, once a section's spec is made: more of what buildings.js already paints where the
//                        district wants it - fire escapes up the brick walk-ups, balconies on the flats, ivy and
//                        vines in the old town and the leafy streets, tags and murals in the rough districts and on the
//                        blank side walls - and spec.dress for the new pieces below;
//   dressFacade(G, ...)  buildings.js makeBuilding, after the walls, windows and doors: drainpipes down a corner, canvas
//                        awnings over the windows, window AC units, satellite dishes, washing strung between windows,
//                        pots on the sills, posters pasted on the ground floor, a shop's roller shutter pulled down,
//                        planters by the door. (The windows' own contents - blinds, plants, a cat, a lamp - are sash's.)
import { MAT, ramp } from './palette.js';
import { hash, step, F_GLASS, F_LEAF } from './gbuf.js';

const H32 = (a, b) => hash(a | 0, b | 0, 4219);
const BRICK = new Set(['brick', 'brickDark']), FLATS = new Set(['condo', 'beachblock', 'mixed', 'hotel', 'oldrow', 'walkup', 'townhouse']);
const HOMEY = new Set(['walkup', 'rough', 'condo', 'oldrow', 'townhouse', 'mixed', 'beachblock', 'nightrow', 'block', 'house', 'cottage']);
const TAGS = ['SOUTH', 'RATS', 'VIBE', 'KING', 'ZONE', 'REBEL', 'OMEN', 'CREW', 'NOVA', 'GHOST', 'FLOW', 'ACE'];
const MURALS = ['sunset', 'waves', 'flowers', 'geo', 'tiger', 'skyline', 'koi'];
const AWN = ['#2e5a3e', '#8a2a2a', '#23324e', '#c8a040', '#2e6a6a', '#6a3a6a', '#e0d8c8'];
// o: { id, k (section), st (district style), tier, A (archetype), H (wall height), w, walkIn (a shop you walk into) }
export function dressPlan(spec, o) {
  if (spec.motel || spec.style === 'glass' || spec.pitch === 'mansard') return;
  const r = (n) => H32(o.id * 37 + o.k, n), { st, tier, A, H, w } = o, fl = spec.floors || 1;
  const rough = tier === 'rough', low = rough || tier === 'low' || tier === 'red' || tier === 'neon', homey = HOMEY.has(A);
  const old = st === 'oldtown' || st === 'apartments' || st === 'arts';
  if (spec.blank) {   // a side wall: street art in the rough districts, the arts district, by the beach and the clubs
    if (w >= 96 && H >= 50 && !spec.mural && (rough || st === 'arts' || st === 'beach' || st === 'nightlife' || low) && r(1) < (st === 'arts' ? 0.6 : 0.35)) spec.mural = { x: 6, w: w - 12, h: Math.min(H - 10, 64 + Math.floor(r(2) * 30)), kind: MURALS[Math.floor(r(3) * MURALS.length)] };
    else if ((rough || low) && r(4) < 0.5) { spec.graffiti = Math.max(spec.graffiti || 0, 1 + Math.floor(r(5) * 2)); spec.tagText ||= r(6) < 0.5 ? TAGS[Math.floor(r(7) * TAGS.length)] : null; }
    if (old && r(8) < 0.3) spec.ivy = Math.max(spec.ivy || 0, 0.5);
    return;
  }
  if (!homey && !spec.shop) return;
  if (BRICK.has(spec.style) && fl >= 2 && w >= 110 && !spec.fireEscape && !spec.balconies && r(9) < (rough || old ? 0.7 : 0.45)) spec.fireEscape = [r(10) < 0.5 ? 10 : w - 62, 50];
  else if (FLATS.has(A) && fl >= 2 && !spec.fireEscape && !spec.balconies && !BRICK.has(spec.style) && r(11) < 0.45) spec.balconies = true;
  if (!spec.ivy && (old || st === 'luxury' || st === 'houses') && r(12) < (st === 'oldtown' ? 0.4 : 0.22)) spec.ivy = 0.3 + r(13) * 0.3;
  if (!spec.shop && (rough || (low && r(14) < 0.4) || (st === 'arts' && r(15) < 0.35)) && st !== 'luxury') {   // (not over a shop's sign)
    spec.graffiti = Math.min(3, (spec.graffiti || 0) + 1);
    if (!spec.tagText && r(16) < 0.4) spec.tagText = TAGS[Math.floor(r(17) * TAGS.length)];
  }
  const D = {};
  if (r(20) < 0.55) D.pipe = r(21) < 0.5 ? 2 : w - 6;
  if (fl > 1 && (st === 'beach' || st === 'luxury' || st === 'oldtown' || st === 'commercial' || st === 'arts' || st === 'apartments') && r(22) < 0.4) D.awn = AWN[Math.floor(r(23) * AWN.length)];
  D.ac = rough || low ? 0.3 : st === 'apartments' || st === 'commercial' || st === 'southside' ? 0.2 : 0.06;
  if ((rough || low || st === 'apartments') && r(24) < 0.45) D.dish = 1;
  if (fl > 1 && (rough || old || st === 'southside') && r(25) < 0.25) D.wash = 1;
  if (r(26) < 0.5) D.sill = 1;
  if (spec.shop && (rough || low || st === 'arts' || st === 'nightlife') && r(27) < 0.6) D.posters = 2 + Math.floor(r(28) * 4);
  if (spec.shop && !o.walkIn && rough && r(29) < 0.45) D.shutter = 0.35 + r(30) * 0.65;
  if (!spec.shop && spec.doors && spec.doors.length && !rough && r(31) < 0.55) D.pots = 1;
  spec.dress = D;
}

const setC = (G, x, y, c) => { if (!G.inside(x, y)) return; const j = (y * G.w + x) * 4; G.col[j] = c[0]; G.col[j + 1] = c[1]; G.col[j + 2] = c[2]; G.col[j + 3] = 255; };
const wall = (G, x, y) => G.inside(x, y) && G.col[(y * G.w + x) * 4 + 3] && !(G.flag[y * G.w + x] & F_GLASS);
const CLOTH = [[220, 70, 70], [70, 120, 200], [240, 236, 226], [240, 200, 70], [90, 170, 110], [200, 110, 180], [60, 60, 70]];
const POSTER = [[226, 80, 84], [244, 206, 70], [70, 180, 200], [240, 236, 224], [156, 92, 210], [36, 40, 52]];
function ac(G, x0, y0) { for (let y = 0; y < 8; y++) for (let x = 0; x < 12; x++) setC(G, x0 + x, y0 + y, y === 0 ? MAT.metal[5] : x === 11 || y === 7 ? MAT.metal[1] : y > 2 && x > 1 && x < 10 && y % 2 === 0 ? MAT.metal[2] : MAT.metal[3]); setC(G, x0 + 9, y0 + 8, [70, 80, 90]); }
// wins: the upper floors' windows [x, y (top), w, h, floor]; fy: wall height -> sprite row
export function dressFacade(G, spec, wins, w, d, H, gH, fy, seed) {
  const D = spec.dress, r = (a, b) => hash(a, b, seed + 977);
  // a drainpipe down a corner: its hopper under the cornice, brackets, a shoe at the foot
  if (D.pipe !== undefined) for (let y = fy(H - 8); y < d + H - 1; y++) for (let k = 0; k < 3; k++) {
    const X = D.pipe + k, top = y < fy(H - 12), br = (y - d) % 22 === 0;
    setC(G, X + (top ? k - 1 : 0), y, step(MAT.metalDark, k === 1 ? 0.6 : br ? 0.15 : 0.35, X, y, 0));
    if (br) setC(G, X + 3, y, MAT.metalDark[1]);
  }
  wins.forEach(([px, py, pw, wh, f], i) => {
    // a canvas awning over the window: striped, scalloped
    if (D.awn && r(i, 1) < 0.8) { const R = ramp(D.awn, 5, 2); for (let y = 0; y < 6; y++) for (let x = -2; x < pw + 2; x++) { if (y === 5 && (x + 2) % 4 === 3) continue; setC(G, px + x, py - 7 + y, (Math.floor((x + 2) / 3) & 1) && D.awn !== '#e0d8c8' ? [236, 230, 218] : step(R, 0.75 - y * 0.08, px + x, y, 0.4)); } }
    // the window's AC unit, poking out at the bottom of the sash
    if (r(i, 2) < D.ac) ac(G, px + (r(i, 3) < 0.5 ? 1 : Math.max(1, pw - 13)), py + wh - 8);
    // a satellite dish beside it
    if (D.dish && i % 5 === 2 && wall(G, px + pw + 5, py + 6)) for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) { const q = (x - 3) * (x - 3) + (y - 3) * (y - 3); if (q < 11) setC(G, px + pw + 3 + x, py + 3 + y, q < 3 ? [150, 154, 160] : [214, 216, 220]); if (x === 3 && y === 6) setC(G, px + pw + 6, py + 11, MAT.metalDark[1]); }
    // pots on the sill: a geranium, a fern
    if (D.sill && !spec.balconies && r(i, 4) < 0.35) for (let p = 0; p < 2; p++) { const x0 = px + 2 + p * Math.max(4, pw - 8); for (let y = 0; y < 3; y++) for (let x = 0; x < 4; x++) setC(G, x0 + x, py + wh - 3 + y, MAT.terracotta[3 - (x >> 1)]); for (let k = 0; k < 7; k++) { const lx = x0 + Math.floor(r(k, i * 3 + p) * 5) - 1, ly = py + wh - 4 - Math.floor(r(i * 3 + p, k) * 4); setC(G, lx, ly, k === 3 && p === 0 ? [226, 70, 90] : MAT.leaf[3 + (k % 3)]); G.flag[ly * G.w + lx] |= F_LEAF; } }
    // washing strung across to the next window along
    const nx = wins[i + 1];
    if (D.wash && nx && nx[4] === f && nx[0] - (px + pw) < 60 && r(i, 5) < 0.3) {
      const x0 = px + pw + 1, x1 = nx[0] - 1, y0 = py + 6;
      for (let x = x0; x <= x1; x++) { const t = (x - x0) / Math.max(1, x1 - x0), y = y0 + Math.round(4 * t * (1 - t) * 4); setC(G, x, y, [70, 66, 62]); }
      for (let x = x0 + 3, c = 0; x < x1 - 3; x += 6, c++) { const t = (x - x0) / Math.max(1, x1 - x0), y = y0 + Math.round(16 * t * (1 - t)) + 1, col = CLOTH[Math.floor(r(c, i + 7) * CLOTH.length)], hh = 4 + Math.floor(r(i, c) * 4); for (let k = 0; k < hh; k++) for (let q = 0; q < 4; q++) setC(G, x + q, y + k, k === hh - 1 && q % 2 ? col.map((v) => v * 0.8) : col); }
    }
  });
  const y0 = d + H;
  // posters pasted on the ground floor's wall, some torn
  if (D.posters) for (let i = 0; i < D.posters; i++) {
    const x0 = 3 + Math.floor(r(i, 11) * Math.max(1, w - 14)), yt = y0 - 30 - Math.floor(r(i, 12) * 10), col = POSTER[Math.floor(r(i, 13) * POSTER.length)];
    if (!wall(G, x0, yt) || !wall(G, x0 + 8, yt + 11)) continue;
    for (let y = 0; y < 12; y++) for (let x = 0; x < 9; x++) { if (y > 8 && x > 4 && r(i, 14) < 0.5) continue; const line = y > 2 && y % 3 === 0 && x > 1 && x < 7; setC(G, x0 + x, yt + y, line ? [40, 36, 40] : y < 3 ? col.map((v) => v * 0.7) : col); }
  }
  // a roller shutter pulled down over a shop's windows (not its door): steel slats, a lock bar at the bottom
  if (D.shutter && spec.shop) {
    const sh = spec.shop, dw = sh.doorW || 22, dx = sh.door === 'right' ? w - dw - 10 : sh.door === 'left' ? 10 : sh.door | 0;
    const top = fy(gH - 18), bot = top + Math.round((y0 - 7 - top) * D.shutter);
    for (let y = top; y < bot; y++) for (let x = 4; x < w - 4; x++) { if (x >= dx - 2 && x < dx + dw + 2) continue; setC(G, x, y, y === bot - 1 ? MAT.metalDark[1] : step(MAT.metal, (y - top) % 3 === 0 ? 0.25 : 0.5, x, y, 0.3)); G.flag[y * G.w + x] &= ~F_GLASS; }
  }
  // planters either side of the door
  if (D.pots && spec.doors) for (const q of spec.doors) {
    if (q.kind !== 'door') continue;
    for (const x0 of [q.x - 9, q.x + (q.w || 18) + 2]) for (let y = 0; y < 13; y++) for (let x = 0; x < 7; x++) {
      if (y < 7 ? r(x, y + x0) < 0.35 || Math.abs(x - 3) > 3 - (y < 2 ? 1 : 0) : false) continue;
      const X = x0 + x, Y = y0 - 13 + y;
      setC(G, X, Y, y < 7 ? MAT.leaf[2 + ((x + y) % 4)] : step(MAT.stone, 0.55 - (y - 7) * 0.06, X, Y, 0.3));
      if (y < 7) G.flag[Y * G.w + X] |= F_LEAF;
    }
  }
}
