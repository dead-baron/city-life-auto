// Buildings in 3/4 view. The camera looks down at an angle from the south, so every building
// shows its roof (lifted by the wall height) and its south facade below it, like the concept
// art. Lots cut from the concept sheets are already drawn that way (their fronts are in the
// art), so they stay as they are; every other building's roof - the top-down art baked into
// the ground chunks (procedural roofs, the mansion, shacks) - is lifted H px up the screen and
// gets a facade painted here per building style and district (shopfronts with awnings and signs, apartment windows,
// glass towers, corrugated warehouses, civic stone, houses, shacks) and cached. Buildings are
// drawn in the depth-sorted pass with people and vehicles, so anyone north of a building is
// hidden behind it; the local player's own building turns see-through when it hides them.
import { TILE, CHUNK_PX } from '../../shared/constants.js';
import { DISTRICTS } from '../../shared/map.js';
import { hash2, mulberry32 } from '../../shared/rng.js';
import { atlas } from './sprites.js';
import { drawRoof, drawHandGlow } from './tiles.js';
import { PREFABS } from '../../shared/prefab-data.js';

// facade style per building kind; H = visible wall height in world px (foreshortened)
const KIND_STYLE = {
  house1: 'house', house2: 'house', house3: 'house', apt1: 'apt', apt2: 'apt', tower1: 'tower', tower2: 'tower', hotel: 'hotel',
  hospital: 'civic', police: 'civic', fire: 'civic', school: 'civic', church: 'church', bank: 'bank', courthouse: 'civic',
  conv: 'shop', strip: 'shop', market: 'shop', rest1: 'shop', rest2: 'shop', club: 'club', dealer: 'shop', gas: 'shop',
  repair: 'garage', warehouse: 'warehouse', industrial: 'warehouse', construction: 'warehouse',
  mansion: 'mansion', beachbar: 'shack', charter: 'shack', den: 'shack',
};
const STYLE = {
  house: { H: 34, floors: 1, walls: ['#e6d9bf', '#d8c6a2', '#c8d4da', '#e8e1d2', '#d6b598', '#bfcfb4'] },
  mansion: { H: 46, floors: 1, walls: ['#efe6d2', '#e8dcc0'] },
  apt: { H: 66, floors: 3, walls: ['#9a5a44', '#a5634a', '#8a6c58', '#7c5242', '#b07a5c'] },
  office: { H: 60, floors: 3, walls: ['#9c9a94', '#aaa59a', '#8f9398', '#b3aa98'] },
  tower: { H: 84, floors: 4, walls: ['#3d5873', '#35506a', '#475f70'] },
  hotel: { H: 80, floors: 4, walls: ['#cbb895', '#bfae8e'] },
  shop: { H: 52, floors: 2, walls: ['#a8644a', '#c2b59a', '#8f8a84', '#b9a07c', '#9a7458', '#7f8b8e'] },
  club: { H: 50, floors: 2, walls: ['#2a2430', '#24202c', '#302838'] },
  bank: { H: 62, floors: 2, walls: ['#d2c8b2', '#c8bea6'] },
  civic: { H: 58, floors: 2, walls: ['#cfc6b0', '#c4bba4', '#d8d2c2'] },
  church: { H: 60, floors: 1, walls: ['#c9bfa8'] },
  garage: { H: 42, floors: 1, walls: ['#8c8a86', '#9a948a'] },
  warehouse: { H: 44, floors: 1, walls: ['#6f7c74', '#7a7064', '#64707e', '#7e6a5a', '#77797a'] },
  shack: { H: 30, floors: 1, walls: ['#8a6a44', '#7a5c3a'] },
};
const AWNINGS = ['#c8262b', '#2a6a3a', '#2350c8', '#e8b923', '#7a3ac8', '#1f7a7a', '#d0603a', '#3a3a44'];
const NEON = ['#ff3ea5', '#3ef0ff', '#b46bff', '#ffd23e', '#4dff7a'];

function styleOf(map, b) {
  let k = KIND_STYLE[b.kind];
  if (!k && b.kind === 'roof') {
    const r = map.roofs[b.roof];
    const ds = DISTRICTS[(r && r.d) ?? 0].style;
    k = r && r.kind === 'glass' ? 'tower' : r && r.kind === 'metal' ? 'warehouse' : r && r.kind === 'tile' ? 'house'
      : ds === 'apartments' || ds === 'southside' ? 'apt' : ds === 'nightlife' ? 'shop' : 'office';
  }
  return k || null;
}

const shadeHex = (hex, amt) => {
  const n = parseInt(hex.slice(1), 16);
  const f = (v) => Math.max(0, Math.min(255, Math.round(amt >= 0 ? v + (255 - v) * amt : v * (1 + amt))));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
};

export class BuildingLayer {
  constructor(map, ground) {
    this.map = map;
    this.ground = ground;
    this.list = [];
    this.byChunk = new Map();
    this.facades = new Map(); // id -> { cv, glow }
    this.roofCv = new Map();  // id -> the roof art (procedural, 1 px per world px)
    for (const b of map.buildings) {
      if (b.gone || b.kind === 'motorpool') continue; // an open lot: nothing stands up off the ground
      const flat = !(b.roof >= 0 && map.roofs[b.roof]); // concept-art lots (fronts already in the art), the mansion
      const st = flat ? 'lot' : styleOf(map, b);
      if (!st) continue;
      const S = STYLE[st];
      const x0 = b.tx * TILE, y0 = b.ty * TILE, w = b.tw * TILE, h = b.th * TILE;
      // big footprints read as taller; a shallow lot can't carry a huge facade
      // neighbours in a row aren't all the same height
      const vary = 0.82 + 0.4 * (((b.tx * 7919 + b.ty * 104729) >>> 0) % 1000) / 1000;
      const H = flat ? 0 : Math.round(Math.min(S.H * vary * (st === 'tower' || st === 'office' || st === 'apt' ? 0.85 + Math.min(0.35, b.tw * b.th / 900) : 1), h * 1.1));
      const d = map.districtAt(x0 + w / 2, y0 + h / 2);
      const item = { b, st, H, flat, x0, y0, x1: x0 + w, y1: y0 + h, w, h, d, seed: (b.tx * 7919 + b.ty * 104729) >>> 0 };
      this.list.push(item);
      for (let cy = Math.floor((y0 - H) / CHUNK_PX); cy <= Math.floor((y0 + h) / CHUNK_PX); cy++)
        for (let cx = Math.floor(x0 / CHUNK_PX); cx <= Math.floor((x0 + w) / CHUNK_PX); cx++) {
          const key = cy * 1000 + cx;
          if (!this.byChunk.has(key)) this.byChunk.set(key, []);
          this.byChunk.get(key).push(item);
        }
    }
    this.byId = new Map(this.list.map((it) => [it.b.id, it]));
  }

  // buildings whose drawn extent (lifted roof + facade) overlaps the view
  inView(view) {
    const out = [], seen = new Set();
    for (let cy = Math.floor(view.y0 / CHUNK_PX); cy <= Math.floor((view.y1 + 120) / CHUNK_PX); cy++)
      for (let cx = Math.floor(view.x0 / CHUNK_PX); cx <= Math.floor(view.x1 / CHUNK_PX); cx++)
        for (const it of this.byChunk.get(cy * 1000 + cx) || []) {
          if (seen.has(it)) continue;
          seen.add(it);
          if (it.x1 < view.x0 || it.x0 > view.x1 || it.y1 < view.y0 || it.y0 - it.H > view.y1) continue;
          out.push(it);
        }
    return out;
  }

  // Is (x, y) hidden behind / under this building as drawn?
  hides(it, x, y, pad = 0) {
    return x > it.x0 - pad && x < it.x1 + pad && y > it.y0 - it.H - pad && y < it.y1 - 4;
  }

  draw(g, it, alpha = 1) {
    const { x0, y0, w, h, H } = it;
    g.save();
    if (alpha < 1) g.globalAlpha = alpha;
    g.imageSmoothingEnabled = false;
    if (it.flat) {
      // a concept-art lot: its own (already 3/4) art from the ground chunks, drawn in the sorted
      // pass so people inside / behind it are covered, and so it can fade when you walk in
      const cx0 = Math.floor(x0 / CHUNK_PX), cx1 = Math.floor((x0 + w - 1) / CHUNK_PX), cy0 = Math.floor(y0 / CHUNK_PX), cy1 = Math.floor((y0 + h - 1) / CHUNK_PX);
      for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
        const cv = this.ground.get(cx, cy);
        const bx = cx * CHUNK_PX, by = cy * CHUNK_PX;
        const sx = Math.max(x0, bx), sy = Math.max(y0, by), ex = Math.min(x0 + w, bx + CHUNK_PX), ey = Math.min(y0 + h, by + CHUNK_PX);
        if (ex <= sx || ey <= sy) continue;
        g.drawImage(cv, sx - bx, sy - by, ex - sx, ey - sy, sx, sy, ex - sx, ey - sy);
      }
      g.restore();
      return;
    }
    // the roof, lifted H px onto its walls
    g.drawImage(this.roof(it), x0, y0 - H);
    // roof edge: a lit lip along the front and a soft shade where the roof meets the wall
    g.fillStyle = 'rgba(255,255,255,.16)'; g.fillRect(x0, y0 + h - H - 2, w, 2);
    const f = this.facade(it);
    g.drawImage(f.cv, x0, y0 + h - H);
    g.restore();
  }

  // night: lit windows / shopfronts / neon (drawn additively by the lighting pass)
  drawGlow(g, it) {
    if (!it.flat) { const f = this.facade(it); if (f.glow) g.drawImage(f.glow, it.x0, it.y1 - it.H); }
    // a hand-designed block: its painting's lit windows and signs on this building and the
    // pavement just in front of it
    if (it.b.hand) {
      const ha = (this.map.handArt || []).find((a) => a.key === it.b.hand);
      if (ha) drawHandGlow(g, ha, [it.x0, it.y0, it.x1, it.y1 + 2 * TILE]);
      return;
    }
    // the lot's own emissive art (rooftop signs, lobby light), lifted with the roof
    const p = it.b.prefab >= 0 ? this.map.prefabs[it.b.prefab] : null;
    if (p && atlas.prefabGlow) {
      const pf = PREFABS[p.key];
      const [si, sx, sy, sw, sh] = pf.src;
      const img = atlas.prefabGlow[si];
      if (!img) return;
      const x = p.tx * TILE, y = p.ty * TILE, pw = p.tw * TILE, ph = p.th * TILE;
      g.save();
      if (!it.flat) { g.beginPath(); g.rect(it.x0, it.y0 - it.H, it.w, it.h); g.clip(); } // a lifted roof's glow goes up with it
      g.translate(0, -it.H);
      if (p.rot === 2) { g.translate(x + pw, y + ph); g.rotate(Math.PI); g.drawImage(img, sx, sy, sw, sh, 0, 0, pw, ph); }
      else g.drawImage(img, sx, sy, sw, sh, x, y, pw, ph);
      g.restore();
    }
  }

  roof(it) {
    let cv = this.roofCv.get(it.b.id);
    if (cv) { this.roofCv.delete(it.b.id); this.roofCv.set(it.b.id, cv); return cv; }
    const r = this.map.roofs[it.b.roof];
    cv = document.createElement('canvas'); cv.width = it.w; cv.height = it.h;
    const g = cv.getContext('2d');
    g.save(); g.beginPath(); g.rect(0, 0, it.w, it.h); g.clip();
    g.translate(-it.x0, -it.y0);
    drawRoof(g, r);
    g.restore();
    this.roofCv.set(it.b.id, cv);
    if (this.roofCv.size > 60) this.roofCv.delete(this.roofCv.keys().next().value);
    return cv;
  }

  facade(it) {
    let f = this.facades.get(it.b.id);
    if (f) { this.facades.delete(it.b.id); this.facades.set(it.b.id, f); return f; }
    f = paintFacade(this.map, it);
    this.facades.set(it.b.id, f);
    if (this.facades.size > 160) this.facades.delete(this.facades.keys().next().value);
    return f;
  }
}

// ---- facade painter ------------------------------------------------------------------------------
function paintFacade(map, it) {
  const { b, st, H, w } = it;
  const S = STYLE[st];
  const rnd = mulberry32(it.seed);
  const cv = document.createElement('canvas'); cv.width = w; cv.height = H;
  const gl = document.createElement('canvas'); gl.width = w; gl.height = H;
  const g = cv.getContext('2d'), q = gl.getContext('2d');
  const wall = S.walls[it.seed % S.walls.length];
  const rough = !!it.d.turf || it.d.style === 'southside';
  const lux = it.d.style === 'towers' || it.d.style === 'civic';
  const lit = (x, y, ww, hh, col, a = 0.85) => { q.globalAlpha = a; q.fillStyle = col; q.fillRect(x, y, ww, hh); q.globalAlpha = 1; };

  // wall body with a light gradient (sun from the top-left) and texture
  g.fillStyle = wall; g.fillRect(0, 0, w, H);
  const grd = g.createLinearGradient(0, 0, w, 0);
  grd.addColorStop(0, 'rgba(255,255,255,.07)'); grd.addColorStop(1, 'rgba(0,0,0,.12)');
  g.fillStyle = grd; g.fillRect(0, 0, w, H);
  texture(g, st, wall, w, H, it.seed);
  // cornice under the roof lip
  g.fillStyle = 'rgba(0,0,0,.38)'; g.fillRect(0, 0, w, 3);
  g.fillStyle = shadeHex(wall, 0.25); g.fillRect(0, 3, w, 2);

  const doorX = b.door ? (b.door.tx - b.tx) * TILE + TILE / 2 : w / 2;
  const southDoor = b.door ? b.door.ty >= b.ty + b.th - 1 : true;
  const walkIn = b.walkIn;

  if (st === 'tower' || st === 'hotel' || st === 'office' || st === 'apt') {
    const floors = S.floors;
    const fh = (H - 6) / floors;
    const pitch = st === 'tower' ? 16 : 24;
    for (let fl = 1; fl < floors; fl++) {
      const y = 6 + (fl - 1) * fh;
      if (st === 'tower') { // glass curtain wall: panels and mullions
        g.fillStyle = '#28394a'; g.fillRect(0, y + fh - 2, w, 2);
        for (let x = 4; x < w - 4; x += pitch) {
          g.fillStyle = (hash2(x, fl, it.seed) < 0.5) ? '#5d84a6' : '#4b6f90'; g.fillRect(x, y + 2, pitch - 3, fh - 5);
          g.fillStyle = 'rgba(220,240,255,.28)'; g.fillRect(x, y + 2, 3, fh - 5);
          if (hash2(x, fl + 9, it.seed) < 0.45) lit(x, y + 2, pitch - 3, fh - 5, '#ffe4a8', 0.7);
        }
      } else {
        for (let x = 6; x < w - 10; x += pitch) win(g, q, x, y + 3, st === 'apt' ? 12 : 14, fh - 8, st, rough, rnd, it, x + fl * 97);
        g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(0, y + fh - 1, w, 1);
      }
    }
    // the street level: lobby, shop or entrance
    const gy = 6 + (floors - 1) * fh;
    if (b.business && walkIn) shopfront(g, q, it, gy, H - gy, doorX, southDoor, rnd, rough, lux);
    else lobby(g, q, it, gy, H - gy, doorX, st, rough);
  } else if (st === 'shop' || st === 'club' || st === 'bank' || st === 'civic') {
    const gy = Math.round(H * (st === 'shop' || st === 'club' ? 0.42 : 0.4));
    const pitch = 24;
    for (let x = 6; x < w - 10; x += pitch) win(g, q, x, 9, 14, gy - 14, st, rough, rnd, it, x);
    if (st === 'civic' || st === 'bank') { // columns + a name band
      g.fillStyle = shadeHex(wall, 0.35);
      for (let x = 10; x < w - 6; x += 40) g.fillRect(x, gy, 6, H - gy - 4);
      sign(g, q, b.name, w / 2, gy - 1, Math.min(w - 16, 160), '#2a2c34', '#f2e6c4', false);
      entrance(g, q, doorX, H, 28, 20, '#3a4a5a', true);
      g.fillStyle = shadeHex(wall, -0.25); g.fillRect(doorX - 22, H - 4, 44, 4); // steps
    } else shopfront(g, q, it, gy, H - gy, doorX, southDoor, rnd, rough, lux, st === 'club');
  } else if (st === 'house' || st === 'mansion') {
    const wy = 8, wh = H - 20;
    for (let x = 8; x < w - 14; x += 30) {
      if (Math.abs(x + 7 - doorX) < 18) continue;
      win(g, q, x, wy, 14, wh, 'house', rough, rnd, it, x);
    }
    door(g, q, doorX, H, st === 'mansion' ? 18 : 12, H - 10, st === 'mansion' ? '#6b4428' : ['#7a4a2a', '#2a4a7a', '#7a2a2a', '#3a5a3a'][it.seed % 4]);
    if (st === 'mansion') { g.fillStyle = '#f8f4ea'; for (const dx of [-30, -18, 16, 28]) g.fillRect(doorX + dx, 6, 4, H - 8); }
    lit(doorX - 2, H - 16, 4, 4, '#ffd89a', 0.9);
    g.fillStyle = shadeHex(wall, -0.3); g.fillRect(0, H - 3, w, 3); // foundation
  } else if (st === 'warehouse' || st === 'garage') {
    // corrugated cladding + roller doors
    for (let x = 0; x < w; x += 4) { g.fillStyle = x % 8 ? 'rgba(0,0,0,.08)' : 'rgba(255,255,255,.06)'; g.fillRect(x, 6, 2, H - 6); }
    const n = Math.max(1, Math.min(4, Math.floor(w / 96)));
    for (let k = 0; k < n; k++) {
      const dx = (k + 0.5) * w / n, dw = Math.min(56, w / n - 12);
      g.fillStyle = '#3a3d42'; g.fillRect(dx - dw / 2 - 2, H - 34, dw + 4, 34);
      g.fillStyle = st === 'garage' ? '#c8c4ba' : '#9aa0a6'; g.fillRect(dx - dw / 2, H - 32, dw, 32);
      g.fillStyle = 'rgba(0,0,0,.18)'; for (let y = H - 30; y < H; y += 4) g.fillRect(dx - dw / 2, y, dw, 1);
      g.fillStyle = '#e8b923'; g.fillRect(dx - dw / 2, H - 2, dw, 2);
      lit(dx - 3, H - 38, 6, 3, '#fff1c0', 0.9);
    }
    if (b.name && st === 'garage') sign(g, q, b.name, w / 2, 14, Math.min(w - 12, 120), '#f2f2ee', '#c8262b', false);
  } else if (st === 'church') {
    g.fillStyle = '#5a6a8a';
    for (let x = 14; x < w - 14; x += 26) { g.beginPath(); g.moveTo(x, 40); g.lineTo(x, 18); g.arc(x + 6, 18, 6, Math.PI, 0); g.lineTo(x + 12, 40); g.fill(); lit(x, 14, 12, 26, '#ffcf7a', 0.5); }
    entrance(g, q, doorX, H, 20, 30, '#5a3a24', false);
  } else if (st === 'shack') {
    g.fillStyle = 'rgba(0,0,0,.2)'; for (let y = 8; y < H; y += 5) g.fillRect(0, y, w, 1);
    win(g, q, 10, 8, 12, 10, 'house', true, rnd, it, 3);
    door(g, q, doorX, H, 12, H - 8, '#5a3a20');
    if (b.name) sign(g, q, b.name, w / 2, 7, Math.min(w - 8, 110), '#3a2414', '#ffd36b', true);
  }
  // rough districts: tags, grime and the odd boarded window
  if (rough) {
    for (let k = 0; k < Math.max(1, w / 90); k++) graffiti(g, 6 + rnd() * (w - 50), H - 26 + rnd() * 10, rnd);
    g.fillStyle = 'rgba(30,20,10,.18)'; g.fillRect(0, H - 10, w, 10);
  }
  // ground contact: a dark seam and ambient occlusion
  g.fillStyle = 'rgba(0,0,0,.45)'; g.fillRect(0, H - 1, w, 1);
  g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(0, 0, 2, H); g.fillStyle = 'rgba(0,0,0,.2)'; g.fillRect(w - 2, 0, 2, H);
  return { cv, glow: gl };
}

function texture(g, st, wall, w, H, seed) {
  if (st === 'apt' || (st === 'shop' && seed % 3 === 0) || st === 'shack') {
    // brick / plank courses
    g.fillStyle = 'rgba(0,0,0,.12)';
    for (let y = 6, r = 0; y < H; y += 4, r++) { g.fillRect(0, y, w, 1); for (let x = (r & 1) * 4; x < w; x += 8) g.fillRect(x, y, 1, 4); }
  } else if (st !== 'tower') {
    for (let y = 6; y < H; y += 3) for (let x = 0; x < w; x += 3) {
      const h = hash2(x, y, seed);
      if (h < 0.82) continue;
      g.fillStyle = h > 0.92 ? 'rgba(255,255,255,.07)' : 'rgba(0,0,0,.07)'; g.fillRect(x, y, 2, 2);
    }
  }
}

function win(g, q, x, y, ww, wh, st, rough, rnd, it, salt) {
  const boarded = rough && hash2(salt, it.seed, 5) < 0.18;
  g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(x - 1, y - 1, ww + 2, wh + 2);
  if (boarded) {
    g.fillStyle = '#8a6a44'; g.fillRect(x, y, ww, wh);
    g.fillStyle = '#6b4e30'; for (let k = 2; k < wh; k += 4) g.fillRect(x, y + k, ww, 1);
    return;
  }
  const glass = st === 'house' ? '#7ea2b8' : '#5f7f99';
  g.fillStyle = glass; g.fillRect(x, y, ww, wh);
  g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(x + 1, y + 1, 2, wh - 2);
  g.fillStyle = 'rgba(255,255,255,.18)'; g.fillRect(x + 3, y + 1, 2, Math.max(1, wh / 2));
  if (st === 'house' || st === 'apt') { g.fillStyle = 'rgba(240,240,232,.9)'; g.fillRect(x - 1, y + wh, ww + 2, 2); } // sill
  if (st === 'house') { g.fillStyle = 'rgba(60,40,30,.55)'; g.fillRect(x - 4, y, 3, wh); g.fillRect(x + ww + 1, y, 3, wh); } // shutters
  if (hash2(salt, it.seed, 11) < 0.5) { q.globalAlpha = 0.8; q.fillStyle = hash2(salt, it.seed, 3) < 0.7 ? '#ffd890' : '#bfe0ff'; q.fillRect(x, y, ww, wh); q.globalAlpha = 1; }
  void rnd;
}

function shopfront(g, q, it, gy, gh, doorX, southDoor, rnd, rough, lux, club = false) {
  const { w, b } = it;
  const awn = club ? '#141018' : AWNINGS[it.seed % AWNINGS.length];
  // display glass along the street level
  g.fillStyle = '#26282e'; g.fillRect(0, gy, w, gh);
  g.fillStyle = club ? '#1a1520' : '#4f6f88'; g.fillRect(4, gy + 10, w - 8, gh - 14);
  // interior hints: shelves / goods / people silhouettes behind the glass
  for (let x = 8; x < w - 10; x += 10) {
    const h = hash2(x, gy, it.seed);
    g.fillStyle = h < 0.33 ? 'rgba(220,200,120,.35)' : h < 0.66 ? 'rgba(200,90,80,.3)' : 'rgba(120,200,160,.28)';
    g.fillRect(x, gy + gh - 14 - (h * 8 | 0), 6, 6 + (h * 8 | 0));
  }
  g.fillStyle = 'rgba(255,255,255,.22)'; for (let x = 6; x < w - 8; x += 36) g.fillRect(x, gy + 11, 3, gh - 16);
  q.globalAlpha = club ? 0.35 : 0.75; q.fillStyle = club ? NEON[it.seed % NEON.length] : '#ffe7b0'; q.fillRect(4, gy + 10, w - 8, gh - 14); q.globalAlpha = 1;
  // mullions
  g.fillStyle = '#1c1e22'; for (let x = 4; x < w - 4; x += 48) g.fillRect(x, gy + 10, 2, gh - 14);
  // the door (sliding glass on a walk-in, timber otherwise)
  if (southDoor) {
    g.fillStyle = '#1c1e22'; g.fillRect(doorX - 13, gy + 8, 26, gh - 8);
    g.fillStyle = b.walkIn ? '#8fbfd8' : '#6b4a2a'; g.fillRect(doorX - 11, gy + 10, 22, gh - 10);
    g.fillStyle = 'rgba(255,255,255,.3)'; g.fillRect(doorX - 9, gy + 12, 2, gh - 14);
  }
  // awning (striped canvas) or a neon band
  if (club) {
    const neon = NEON[it.seed % NEON.length];
    g.fillStyle = neon; g.fillRect(0, gy, w, 3); lit(q, 0, gy - 2, w, 7, neon, 0.95);
  } else {
    for (let x = 0; x < w; x += 8) { g.fillStyle = (x / 8) & 1 ? shadeHex(awn, 0.35) : awn; g.fillRect(x, gy, 8, 9); }
    g.fillStyle = 'rgba(0,0,0,.3)'; g.fillRect(0, gy + 9, w, 2);
    for (let x = 0; x < w; x += 8) { g.fillStyle = (x / 8) & 1 ? shadeHex(awn, 0.35) : awn; g.beginPath(); g.moveTo(x, gy + 9); g.lineTo(x + 8, gy + 9); g.lineTo(x + 4, gy + 12); g.fill(); }
  }
  // the business sign over the awning (the name the map gives it)
  const name = (b.signs && b.signs[0] && b.signs[0].text) || b.name;
  if (name) {
    const neonSign = club || it.d.style === 'nightlife';
    sign(g, q, name, w / 2, gy - 1, Math.min(w - 10, 9 * name.length + 18), neonSign ? '#120e18' : lux ? '#1c1f28' : '#f2efe6', neonSign ? NEON[(it.seed >> 3) % NEON.length] : lux ? '#e8c87a' : '#2a2c34', neonSign);
  }
  if (rough) { g.fillStyle = 'rgba(80,60,40,.25)'; g.fillRect(4, gy + 10, w - 8, gh - 14); }
  void rnd;
}
function lit(q, x, y, w, h, c, a) { q.globalAlpha = a; q.fillStyle = c; q.fillRect(x, y, w, h); q.globalAlpha = 1; }

function lobby(g, q, it, gy, gh, doorX, st, rough) {
  const { w } = it;
  g.fillStyle = 'rgba(0,0,0,.22)'; g.fillRect(0, gy, w, 2);
  for (let x = 6; x < w - 10; x += 24) if (Math.abs(x + 7 - doorX) > 20) win(g, q, x, gy + 5, 14, gh - 10, st, rough, null, it, x + 777);
  entrance(g, q, doorX, gy + gh, 24, gh - 4, st === 'tower' || st === 'hotel' ? '#7fa8c4' : '#4a3a2a', st === 'tower' || st === 'hotel');
}

function entrance(g, q, x, bottom, w, h, col, glass) {
  g.fillStyle = 'rgba(0,0,0,.45)'; g.fillRect(x - w / 2 - 2, bottom - h - 2, w + 4, h + 2);
  g.fillStyle = col; g.fillRect(x - w / 2, bottom - h, w, h);
  if (glass) { g.fillStyle = 'rgba(255,255,255,.3)'; g.fillRect(x - w / 2 + 2, bottom - h + 2, 2, h - 4); g.fillStyle = '#20242a'; g.fillRect(x - 1, bottom - h, 2, h); }
  q.globalAlpha = 0.8; q.fillStyle = '#ffe2a0'; q.fillRect(x - w / 2, bottom - h, w, h); q.globalAlpha = 1;
}
function door(g, q, x, bottom, w, h, col) {
  g.fillStyle = 'rgba(0,0,0,.4)'; g.fillRect(x - w / 2 - 1, bottom - h - 1, w + 2, h + 1);
  g.fillStyle = col; g.fillRect(x - w / 2, bottom - h, w, h);
  g.fillStyle = 'rgba(255,255,255,.18)'; g.fillRect(x - w / 2 + 1, bottom - h + 1, 1, h - 2);
  g.fillStyle = '#e8c060'; g.fillRect(x + w / 2 - 3, bottom - h / 2, 2, 2);
  void q;
}

// a sign board with the name in a chunky pixel font
function sign(g, q, text, cx, bottom, maxW, bg, fg, neon) {
  const t = String(text).toUpperCase().slice(0, 22);
  g.save();
  g.font = 'bold 9px monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
  const tw = Math.min(maxW, g.measureText(t).width + 10);
  const h = 13, x = Math.round(cx - tw / 2), y = Math.round(bottom - h);
  g.fillStyle = 'rgba(0,0,0,.45)'; g.fillRect(x + 1, y + 1, tw, h);
  g.fillStyle = bg; g.fillRect(x, y, tw, h);
  g.strokeStyle = neon ? fg : 'rgba(0,0,0,.5)'; g.lineWidth = 1; g.strokeRect(x + 0.5, y + 0.5, tw - 1, h - 1);
  g.fillStyle = fg; g.fillText(t, cx, y + h / 2 + 0.5, tw - 6);
  g.restore();
  // signs glow at night (neon strongly, painted boards with a lamp)
  q.save(); q.font = 'bold 9px monospace'; q.textAlign = 'center'; q.textBaseline = 'middle';
  q.globalAlpha = neon ? 1 : 0.55; q.fillStyle = neon ? fg : '#fff2c8';
  q.fillText(t, cx, y + h / 2 + 0.5, tw - 6);
  if (neon) { q.globalAlpha = 0.35; q.fillRect(x - 2, y - 2, tw + 4, h + 4); }
  q.restore();
}

const TAGS = ['#e83a5f', '#3ae8d0', '#f2c21b', '#9a5bff', '#ffffff', '#48d14a'];
function graffiti(g, x, y, rnd) {
  g.save();
  g.lineWidth = 2; g.lineCap = 'round';
  g.strokeStyle = TAGS[Math.floor(rnd() * TAGS.length)];
  g.beginPath(); g.moveTo(x, y + 6);
  for (let k = 0; k < 6; k++) g.quadraticCurveTo(x + k * 6 + 3, y - 2 + rnd() * 10, x + k * 6 + 6, y + 2 + rnd() * 8);
  g.stroke();
  g.strokeStyle = 'rgba(0,0,0,.5)'; g.lineWidth = 1; g.stroke();
  g.restore();
}
