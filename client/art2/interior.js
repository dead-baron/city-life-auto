// Art v2 cut-away interiors: a room seen from the game camera with its walls cut down, the way the
// G1, J2/J3 and T1 targets show them. The back (north) wall stands full height so its face carries the
// room's character - tiles, brick, posters, screens, lit signs, a door; the side walls and the front
// (south) wall are cut to a low cap so the room and the people in it stay in view. Doorways are gaps
// in the cut walls, or doors in the back wall, open or shut.
//
//   room(sc, { x, y, w, d, floor, wall, wallH, cut, t, doors, deco, lights })
//     x, y      the floor's north-west corner (design px; interiors use no warp)
//     floor     a ground kind (tileWhite, platform, checker, rubber, woodFloor, yard, ...)
//     wall      'tile' | 'brick' | 'concrete' | 'cinder' | 'painted' ; wallColor, band (a colour band)
//     doors     [{ side: 'n'|'s'|'w'|'e', at, w, open, kind: 'door'|'glass'|'bars'|'steel' }]
//     deco      north-wall decoration: [{ kind: 'poster'|'map'|'screens'|'sign'|'window'|'board'|
//               'fan'|'pipe'|'clock'|'lamp'|'mirror', at, v, w, h, text, col }]
// Floors and the back wall go straight into the scene's G-buffer; the south wall is a sprite sorted
// with everything else, so people standing behind it are covered properly.
import { GBuf, hash, vnoise, step, F_GLASS, F_NOCAST } from './gbuf.js';
import { MAT, ramp, LIGHT } from './palette.js';
import { paintRect } from './ground.js';
import { drawText, textWidth } from './font.js';

const S_N = [0, 1, 0], UP = [0, 0, 1];
const set = (G, x, y, c, n = S_N, z = null) => { x |= 0; y |= 0; if (!G.inside(x, y)) return; const i = y * G.w + x, j = i * 4; G.col[j] = c[0]; G.col[j + 1] = c[1]; G.col[j + 2] = c[2]; G.col[j + 3] = 255; if (n) { G.nrm[j] = (n[0] * 0.5 + 0.5) * 255; G.nrm[j + 1] = (n[1] * 0.5 + 0.5) * 255; G.nrm[j + 2] = (n[2] * 0.5 + 0.5) * 255; G.nrm[j + 3] = 255; } if (z !== null) G.z[i] = z; G.emi[j + 3] = 0; G.flag[i] = 0; };
const glow = (G, x, y, e) => G.glow(x | 0, y | 0, e);

function wallPixel(o, u, v, seed, x, y) {
  const H = o.wallH;
  if (o.wall === 'tile') {
    const band = o.band && v > H * 0.18 && v < H * 0.3, base = v < H * 0.12;
    const R = band ? ramp(o.band, 5, 2) : base ? ramp(o.band || '#5a6a7a', 5, 2) : ramp(o.wallColor || '#e4e2d8', 5, 2);
    const g = u % 10 === 0 || v % 8 === 0;
    return step(R, (g ? 0.25 : 0.6) + (hash(u >> 3, v >> 3, seed) - 0.5) * 0.12 - (v < 4 ? 0.15 : 0), x, y, 0.3);
  }
  if (o.wall === 'brick') {
    const row = Math.floor(v / 4), off = (row & 1) * 4, mortar = v % 4 === 0 || (u + off) % 9 === 0;
    if (mortar) return step(MAT.concrete, 0.3, x, y, 0.3);
    return step(ramp(o.wallColor || '#8e4a3c', 6, 3), 0.48 + (hash(Math.floor((u + off) / 9), row, seed) - 0.5) * 0.35 + (vnoise(u, v, 20, seed) - 0.5) * 0.2, x, y, 0.5);
  }
  if (o.wall === 'cinder') {
    const row = Math.floor(v / 8), off = (row & 1) * 8, mortar = v % 8 === 0 || (u + off) % 16 === 0;
    return step(ramp(o.wallColor || '#9a9a96', 6, 3), (mortar ? 0.28 : 0.55) + (hash(Math.floor((u + off) / 16), row, seed) - 0.5) * 0.12 + (o.band && v < H * 0.35 ? -0.18 : 0), x, y, 0.4);
  }
  const R = ramp(o.wallColor || (o.wall === 'concrete' ? '#8a8a86' : '#c8c0b0'), 6, 3);
  let t = 0.55 + (vnoise(u, v, 18, seed) - 0.5) * 0.2 + (hash(u, v, seed) > 0.96 ? 0.08 : 0);
  if (o.wall === 'concrete' && (u % 60 === 0 || v % 30 === 0)) t -= 0.18;
  if (o.band && v < H * 0.3) return step(ramp(o.band, 5, 2), t, x, y, 0.4);
  return step(R, t, x, y, 0.5);
}

export function room(sc, o) {
  const G = sc.G, t = o.t ?? 10, H = o.wallH ?? 84, cut = o.cut ?? 16, seed = o.seed ?? 7;
  const opt = { ...o, wallH: H };
  const x0 = Math.round(o.x), y0 = Math.round(o.y), w = Math.round(o.w), d = Math.round(o.d);
  const capC = ramp(o.capColor || '#6e6c6a', 5, 2);
  // floor
  paintRect(G, x0, y0, w, d, o.floor || 'platform', seed);
  // a soft shadow line along the foot of the back wall
  for (let x = x0; x < x0 + w; x++) for (let k = 0; k < 6; k++) { const j = ((y0 + k) * G.w + x) * 4; if (G.inside(x, y0 + k)) { const m = 0.62 + k * 0.06; G.col[j] *= m; G.col[j + 1] *= m; G.col[j + 2] *= m; } }
  const gaps = (side) => (o.doors || []).filter((dd) => dd.side === side);
  const inGap = (side, a) => gaps(side).some((dd) => a >= dd.at && a < dd.at + dd.w);
  // the back wall: full height, its face toward the camera, a cap of wall thickness on top
  if (o.north === 'cut') {
    for (let x = x0 - t; x < x0 + w + t; x++) { if (inGap('n', x - x0)) continue; for (let k = 0; k < t; k++) set(G, x, y0 - t + k - cut, step(capC, k === 0 ? 0.8 : 0.5, x, k, 0.3), UP, cut); for (let v = 0; v < cut; v++) set(G, x, y0 - v, wallPixel(opt, x + 400, v, seed, x, y0 - v), S_N, v); }
  } else if (o.north !== false) {
    for (let v = 0; v < H; v++) for (let x = x0 - t; x < x0 + w + t; x++) set(G, x, y0 - v, wallPixel(opt, x - x0 + 400, v, seed, x, y0 - v), S_N, v);
    for (let k = 0; k < t; k++) for (let x = x0 - t; x < x0 + w + t; x++) set(G, x, y0 - H - k, step(capC, k === 0 ? 0.8 : 0.5, x, k, 0.3), UP, H);
    for (const dd of gaps('n')) backDoor(G, x0 + dd.at, y0, dd.w, dd.h || 56, dd, sc.night);
    for (const dc of o.deco || []) deco(G, x0 + dc.at, y0, dc, sc.night, seed);
  }
  // side walls: cut low, shown as their caps (gaps for side doorways)
  for (const [side, xs] of [['w', x0 - t], ['e', x0 + w]]) if (o[side === 'w' ? 'west' : 'east'] !== false) {
    for (let Y = y0; Y < y0 + d + t; Y++) {
      if (inGap(side, Y - y0)) continue;
      for (let k = 0; k < t; k++) set(G, xs + k, Y - cut, step(capC, k === 0 || k === t - 1 ? 0.75 : 0.5, xs + k, Y, 0.3), UP, cut);
    }
  }
  // the front wall: a cut sprite, sorted with the people
  if (o.south !== false) {
    const S = new GBuf(w + 2 * t, t + cut + 2); S.ax = t; S.ay = t + cut;
    for (let x = -t; x < w + t; x++) {
      if (inGap('s', x)) continue;
      for (let k = 0; k < t; k++) S.put(x + t, k, step(capC, k === 0 ? 0.8 : 0.55, x, k, 0.3), UP, cut, null, 0);
      for (let v = 0; v < cut; v++) S.put(x + t, t + v, wallPixel(opt, x + 800, cut - v, seed, x, v), S_N, cut - v, null, 0);
    }
    for (const dd of gaps('s')) if (dd.leaf !== false) frontLeaf(S, dd.at + t, t, dd, cut);
    sc.add(S, x0, y0 + d, 0, y0 + d + t);
  }
  for (const L of o.lights || []) sc.light(x0 + L[0], y0 + L[1], L[2] ?? 60, L[3] ?? 140, L[4] || LIGHT.warmWindow, L[5] ?? (sc.isNight ? 1.6 : 0.9));
  return { x: x0, y: y0, w, d, H };
}

// a door in the back wall (shut, open onto a lit corridor, a steel door, a glass door, a barred gate)
function backDoor(G, x0, y0, w, h, dd, night) {
  for (let v = 0; v < h; v++) for (let x = 0; x < w; x++) {
    const X = x0 + x, Y = y0 - v, frame = x < 2 || x >= w - 2 || v >= h - 2;
    let c;
    if (frame) c = step(MAT.metalDark, x < 2 || v >= h - 2 ? 0.6 : 0.35, X, v, 0);
    else if (dd.open && dd.stairs) { const tread = Math.floor(v / 7), ly = v % 7; c = step(ramp('#9a9890', 5, 2), 0.25 + (v / h) * 0.5 + (ly === 6 ? 0.25 : ly === 0 ? -0.2 : 0), X, Y, 0.4); if (x === 3 || x === w - 4) c = [200, 160, 60]; glow(G, X, Y, [255, 214, 160, (v / h) * (40 + night * 90)]); }
    else if (dd.open) { c = step(ramp('#c8a870', 5, 2), 0.3 + (v / h) * 0.4, X, Y, 0.6); glow(G, X, Y, [255, 210, 150, 40 + night * 100]); }
    else if (dd.kind === 'bars') c = (x % 5 === 0 || v % 18 === 0) ? MAT.metalDark[3] : step(ramp('#3a3a40', 5, 2), 0.4, X, Y, 0.3);
    else if (dd.kind === 'glass') { c = step(MAT.glass, 0.45 + ((x + v) % 9 < 2 ? 0.3 : 0), X, Y, 0.3); }
    else c = step(ramp(dd.color || '#4a5a6a', 5, 2), 0.55 + (Math.abs(v - h * 0.6) < 1 ? -0.3 : 0) + (x === w - 6 && Math.abs(v - h * 0.45) < 2 ? 0.4 : 0), X, Y, 0.3);
    set(G, X, Y, c, S_N, v);
    if (dd.kind === 'glass' && !frame) G.flag[(Y | 0) * G.w + (X | 0)] |= F_GLASS;
  }
  // an exit sign over it
  if (dd.exit) for (let v = h + 3; v < h + 9; v++) for (let x = w / 2 - 8; x < w / 2 + 8; x++) { set(G, x0 + x, y0 - v, [60, 200, 110], S_N, v); glow(G, x0 + x, y0 - v, [80, 255, 140, 150 + night * 100]); }
}
// a door leaf in a front-wall gap: open (swung back into the room, seen edge-on) or shut
function frontLeaf(S, x0, y0, dd, cut) {
  const R = ramp(dd.kind === 'glass' ? '#7aa8c0' : dd.kind === 'bars' ? '#3a3c44' : dd.color || '#6a4a30', 5, 2);
  if (dd.open) for (let k = 0; k < Math.min(dd.w, 24); k++) S.put(x0 + 1, y0 - k, R[3], UP, cut, null, 0);
  else for (let x = 0; x < dd.w; x++) for (let k = 0; k < 4; k++) S.put(x0 + x, y0 + k, step(R, dd.kind === 'bars' && x % 4 ? 0.2 : 0.6, x, k, 0.3), UP, cut, null, 0);
}

// decoration on the back wall's face
function deco(G, x0, y0, dc, night, seed) {
  const v0 = dc.v ?? 20, w = dc.w ?? 30, h = dc.h ?? 36;
  const px = (x, v, c, e) => { set(G, x0 + x, y0 - v0 - v, c, S_N, v0 + v); if (e) glow(G, x0 + x, y0 - v0 - v, e); };
  if (dc.kind === 'poster') {
    const R = ramp(dc.col || '#2f6aa8', 5, 2), sun = dc.sun ?? true;
    for (let v = 0; v < h; v++) for (let x = 0; x < w; x++) {
      const frame = x === 0 || v === 0 || x === w - 1 || v === h - 1, tt = v / h;
      let c = frame ? MAT.metalDark[2] : tt > 0.55 ? step(R, 0.3 + tt * 0.4, x, v, 0.4) : step(ramp('#e89a5a', 5, 2), 0.3 + tt, x, v, 0.4);
      if (sun && Math.hypot(x - w * 0.6, v - h * 0.55) < w * 0.16) c = [250, 220, 120];
      if (!frame && Math.abs(x - w * 0.3 - (v - h * 0.3) * 0.1) < 1 && tt > 0.3) c = [40, 34, 44];
      px(x, v, c);
    }
  } else if (dc.kind === 'map') {
    const lines = [[220, 60, 60], [60, 160, 90], [230, 190, 60], [70, 110, 210], [180, 90, 200]];
    for (let v = 0; v < h; v++) for (let x = 0; x < w; x++) {
      const frame = x < 2 || v < 2 || x >= w - 2 || v >= h - 2;
      let c = frame ? MAT.metalDark[3] : [236, 234, 224];
      lines.forEach((L, i) => { const ly = Math.round(h * (0.25 + i * 0.12) + Math.sin((x + i * 7) * 0.08) * 4); if (!frame && Math.abs(v - ly) < 1) c = L; if (!frame && x % 14 === 7 && Math.abs(v - ly) < 2) c = [250, 250, 250]; });
      px(x, v, c);
    }
  } else if (dc.kind === 'screens') {
    const cols = dc.cols || 4, rows = dc.rows || 2, sw = Math.floor(w / cols), sh = Math.floor(h / rows);
    for (let v = 0; v < h; v++) for (let x = 0; x < w; x++) {
      const lx = x % sw, lv = v % sh, edge = lx < 2 || lv < 2;
      let c = edge ? [30, 30, 36] : step(ramp('#4a6a88', 5, 2), 0.2 + hash(Math.floor(x / 3) + Math.floor(x / sw) * 31, Math.floor(v / 3), seed) * 0.45, x, v, 0.4);
      px(x, v, c, edge ? null : [150, 190, 230, 30 + night * 40]);
    }
  } else if (dc.kind === 'sign') {
    const sx = dc.sx || 2, tw = textWidth(dc.text || '', { sx, gap: 1 }), ww = Math.max(w, tw + 10), hh = 5 * sx + 8, bg = ramp(dc.col || '#2a4a8a', 5, 2), fg = dc.fg || [250, 248, 240];
    for (let v = 0; v < hh; v++) for (let x = 0; x < ww; x++) px(x, v, (x === 0 || v === 0 || x === ww - 1 || v === hh - 1) ? MAT.metalDark[2] : bg[2], dc.lit ? [...bg[3], 40 + night * 80] : null);
    drawText((x, y) => { set(G, x0 + x, y0 - v0 - hh + y, fg, S_N, v0 + 4); if (dc.lit) glow(G, x0 + x, y0 - v0 - hh + y, [...fg, 120 + night * 100]); }, dc.text || '', Math.floor((ww - tw) / 2), 4, { sx, sy: sx, gap: 1 });
  } else if (dc.kind === 'window') {
    for (let v = 0; v < h; v++) for (let x = 0; x < w; x++) {
      const frame = x < 2 || v < 2 || x >= w - 2 || v >= h - 2 || x % 16 === 0, streak = (x + v) % 13 < 3;
      px(x, v, frame ? MAT.metalDark[2] : dc.lit ? [236, 200, 140] : step(MAT.glass, 0.4 + (streak ? 0.3 : 0), x, v, 0.4), !frame && dc.lit ? [255, 210, 150, 80 + night * 100] : null);
    }
  } else if (dc.kind === 'board') {
    for (let v = 0; v < h; v++) for (let x = 0; x < w; x++) { const frame = x < 2 || v < 2 || x >= w - 2 || v >= h - 2; let c = frame ? ramp('#7a5a3a', 5, 2)[2] : [190, 150, 100]; if (!frame && hash(x >> 2, v >> 2, seed) > 0.72) c = [[240, 236, 224], [240, 220, 120], [210, 230, 240]][(x + v) % 3]; px(x, v, c); }
  } else if (dc.kind === 'fan') {
    const r = (dc.w ?? 20) / 2;
    for (let v = -r; v <= r; v++) for (let x = -r; x <= r; x++) { const dd = Math.hypot(x, v); if (dd > r) continue; const a = Math.atan2(v, x); px(x + r, v + r, dd > r - 2 ? MAT.metalDark[2] : (Math.round(a * 1.9) & 1) ? MAT.metal[3] : MAT.metalDark[1]); }
  } else if (dc.kind === 'clock') {
    const r = 6; for (let v = -r; v <= r; v++) for (let x = -r; x <= r; x++) { const dd = Math.hypot(x, v); if (dd > r) continue; px(x + r, v + r, dd > r - 1.5 ? MAT.metalDark[1] : (x === 0 && v > -5 && v < 1) || (v === 0 && x > 0 && x < 4) ? [30, 30, 30] : [240, 238, 230]); }
  } else if (dc.kind === 'lamp') {                                          // a wall lamp (glow strip)
    for (let v = 0; v < 6; v++) for (let x = 0; x < w; x++) px(x, v, v < 1 || v > 4 ? MAT.metalDark[2] : [255, 244, 220], v >= 1 && v <= 4 ? [255, 240, 210, 200 + night * 55] : null);
  } else if (dc.kind === 'pipe') {
    for (let x = 0; x < w; x++) for (let v = 0; v < 5; v++) px(x, v, step(ramp(dc.col || '#7a4a36', 5, 2), 0.25 + (v === 3 ? 0.4 : v === 1 ? 0.15 : 0), x, v, 0.2));
  } else if (dc.kind === 'mirror') {
    for (let v = 0; v < h; v++) for (let x = 0; x < w; x++) { const frame = x === 0 || v === 0 || x === w - 1 || v === h - 1 || x % 30 === 0; px(x, v, frame ? MAT.metal[2] : step(ramp('#a8c4d0', 5, 2), 0.45 + ((x + v) % 17 < 3 ? 0.3 : 0), x, v, 0.4)); G.flag[((y0 - v0 - v) | 0) * G.w + ((x0 + x) | 0)] |= F_GLASS; }
  } else if (dc.kind === 'silhouette') {                                   // a poster of a figure (boxers, athletes)
    for (let v = 0; v < h; v++) for (let x = 0; x < w; x++) { const frame = x === 0 || v === 0 || x === w - 1 || v === h - 1; const body = Math.abs(x - w / 2) < (v > h * 0.6 ? w * 0.12 : v > h * 0.3 ? w * 0.28 : 0) || Math.hypot(x - w / 2, v - h * 0.82) < w * 0.12; px(x, v, frame ? MAT.metalDark[2] : body ? [44, 40, 48] : [214, 206, 190]); }
  }
}

// the dark ground round an underground cut-away, with a few service pipes along the walls
export function underground(sc, x, y, w, h) { paintRect(sc.G, x, y, w, h, 'bedrock', 3); }
