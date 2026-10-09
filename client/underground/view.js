// The view under the ground: down the sewers or in the cave (shared/underground.js has the layout; main.js loads this
// module the first time you go down - nothing of it loads before). While you're underground it draws the whole frame on
// the overlay canvas instead of the city renderer: the tunnels and chambers (baked into 512 px tiles of pixel art the
// first time they come into view), the water moving, the dressing (grates, pipes and ladders in the sewers; stalagmites,
// glowing mushrooms, glow worms, crystals, the den in the cave; the subway's track behind the grille at the station
// door), the people, animals and boats down there, rats and bats, dust and falling rocks, sparks off a pickaxe - and
// then the dark over all of it, lifted only round carried lights (main.js carriedLights: the flashlight and every light
// item that goes through it), the street light coming down the grates, and the glowing things.
// Placeholder art in the game's palette, made in code: the sewer and mining sheets (SW1-SW2, MI1-MI7) replace it.
import { undergroundOf, C, UG, UG_AMBIENT, cellAtPx } from '../../shared/underground.js';
import { TILE, K, PF } from '../../shared/constants.js';
import { VEHICLE_BY_INDEX } from '../../shared/vehicles.js';

const CH = 512, CT = CH / TILE;   // a baked tile of the underground: px, cells
const hh = (x, y, s = 0) => { let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(s | 0, 0x9e3779b9); h = Math.imul(h ^ (h >>> 15), 0x85ebca6b); h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
// the ores' colours (their glints in the rock: here and up at the quarry - main.js drawVeinsTop)
export const ORE_COL = { coal: ['#151515', '#3a3a3a'], copperOre: ['#b8642c', '#e39a5c'], ironOre: ['#8a4a32', '#c47a5a'], silverOre: ['#b9c2cf', '#f1f5fb'], goldOre: ['#c8961e', '#ffe27a'], gem: ['#8d2fb0', '#e48cff'], diamond: ['#b8f1ff', '#ffffff'] };
const SHIRTS = ['#a8433a', '#3f6fa8', '#4f8a4a', '#c08a2e', '#7a4a8a', '#4a8a86', '#b0b0a8', '#6a5040'];
const SKIN = ['#e8bf98', '#c99872', '#a8774f', '#7a5236', '#f0cfae'];

export function createUgView(S, api) { return new UgView(S, api); }

class UgView {
  constructor(S, api) {
    this.S = S; this.api = api || {};
    this.map = S.map; this.L = undergroundOf(S.map);
    this.tiles = new Map();          // key -> canvas (baked)
    this.dark = document.createElement('canvas');
    this.fxs = [];                   // sparks, chips, grit, dust: { x, y, vx, vy, z, vz, t, life, c, s }
    this.bats = [];                  // bats in the air: { x, y, vx, vy, t, life, ph }
    this.rubble = [];                // where rocks came down
    this.rats = (this.L.rats || []).map((r, i) => ({ ...r, ox: r.x, oy: r.y, u: hh(i, 3) * 120 - 60, sp: 0, flee: 0, i }));
    this.drop = 0;
  }
  dispose() { this.tiles.clear(); }

  // ---- the server's events down here ----
  onEvent(ev) {
    const now = performance.now() / 1000;
    if (ev.e === 'pick') {
      const n = ev.done ? 16 : 7;
      for (let k = 0; k < n; k++) {
        const a = Math.random() * 6.283, s = 40 + Math.random() * (ev.done ? 140 : 90);
        this.fxs.push({ x: ev.x, y: ev.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, z: 6, vz: 60 + Math.random() * 80, t: now, life: 0.35 + Math.random() * 0.4, c: k % 3 ? '#ffe9a0' : '#8a8178', s: k % 3 ? 1.5 : 2.5, spark: k % 3 !== 0 });
      }
    } else if (ev.e === 'bats') {
      const ax = ev.x - (ev.fx ?? ev.x - 1), ay = ev.y - (ev.fy ?? ev.y);
      const base = Math.atan2(ay, ax);
      for (let k = 0; k < (ev.n || 14); k++) {
        const a = base + (Math.random() - 0.5) * 2.4, s = 160 + Math.random() * 140;
        this.bats.push({ x: ev.x + (Math.random() - 0.5) * 30, y: ev.y + (Math.random() - 0.5) * 30, vx: Math.cos(a) * s, vy: Math.sin(a) * s, t: now + Math.random() * 0.4, life: 2.6 + Math.random() * 1.4, ph: Math.random() * 6 });
      }
    } else if (ev.e === 'dust') {
      this.dust = { x: ev.x, y: ev.y, until: now + (ev.s || 1.6) };
    } else if (ev.e === 'rockfall') {
      this.dust = null;
      for (let k = 0; k < 22; k++) { const a = Math.random() * 6.283, s = 30 + Math.random() * 120; this.fxs.push({ x: ev.x, y: ev.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, z: 4, vz: 30 + Math.random() * 70, t: now, life: 0.6 + Math.random() * 0.8, c: k % 2 ? '#6d6458' : '#9a8f80', s: 2 + Math.random() * 3 }); }
      this.rubble.push({ x: ev.x, y: ev.y, t: now, fall: now });
      if (this.rubble.length > 12) this.rubble.shift();
    }
  }

  // ---- baking the rock, the walkways, the water into tiles ----
  bake(cx, cy) {
    const cv = document.createElement('canvas'); cv.width = CH; cv.height = CH;
    const g = cv.getContext('2d'), L = this.L;
    const x0 = cx * CH, y0 = cy * CH;
    const cell = (tx, ty) => cellAtPx(L, (tx + 0.5) * TILE, (ty + 0.5) * TILE);
    for (let j = 0; j < CT; j++) for (let i = 0; i < CT; i++) {
      const tx = cx * CT + i, ty = cy * CT + j, v = cell(tx, ty), px = i * TILE, py = j * TILE;
      const sewer = this.ugAt(tx, ty) === UG.SEWER;
      if (v === C.ROCK) {
        // rock: black deep in; a face where it meets the open (brick in the sewers, rough stone in the cave)
        let open = 0;
        for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) if (cell(tx + dx, ty + dy) !== C.ROCK) open++;
        g.fillStyle = '#070708'; g.fillRect(px, py, TILE, TILE);
        if (!open) continue;
        if (sewer) {
          g.fillStyle = '#4b2e22'; g.fillRect(px, py, TILE, TILE);
          g.fillStyle = '#6a4030';
          for (let r = 0; r < 4; r++) for (let b = 0; b < 3; b++) { const ox = (r % 2) * 5; g.fillRect(px + b * 11 + ox, py + r * 8 + 1, 9, 6); }
          g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(px, py + TILE - 4, TILE, 4);
        } else {
          const n = hh(tx, ty, 5);
          g.fillStyle = n < 0.5 ? '#2c2824' : '#34302b'; g.fillRect(px, py, TILE, TILE);
          g.fillStyle = '#423c35';
          for (let k = 0; k < 5; k++) g.fillRect(px + Math.floor(hh(tx, ty, 10 + k) * 28), py + Math.floor(hh(tx, ty, 20 + k) * 28), 4, 3);
          g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(px + 1, py + 1, 3, TILE - 2);
        }
      } else if (v === C.WALK || v === C.SHAFT) {
        g.fillStyle = '#4a4943'; g.fillRect(px, py, TILE, TILE);
        g.fillStyle = '#55544d'; g.fillRect(px + 1, py + 1, TILE - 2, TILE - 2);
        for (let k = 0; k < 4; k++) { g.fillStyle = hh(tx, ty, k) < 0.5 ? '#3f3e39' : '#5d5b53'; g.fillRect(px + Math.floor(hh(tx, ty, 30 + k) * 30), py + Math.floor(hh(tx, ty, 40 + k) * 30), 2, 2); }
        if (hh(tx, ty, 9) < 0.12) { g.fillStyle = 'rgba(70,90,40,.35)'; g.fillRect(px + 4, py + 6, 14, 9); }   // (slime)
      } else if (v === C.STREAM) {
        g.fillStyle = '#2c3324'; g.fillRect(px, py, TILE, TILE);
        g.fillStyle = '#37402b'; g.fillRect(px, py + 10, TILE, 12);
      } else if (v === C.FLOOR) {
        const n = hh(tx, ty, 2);
        g.fillStyle = n < 0.33 ? '#3a352f' : n < 0.66 ? '#403a33' : '#363129'; g.fillRect(px, py, TILE, TILE);
        for (let k = 0; k < 3; k++) { g.fillStyle = hh(tx, ty, 50 + k) < 0.5 ? '#4d463d' : '#2a2620'; g.fillRect(px + Math.floor(hh(tx, ty, 60 + k) * 28), py + Math.floor(hh(tx, ty, 70 + k) * 28), 3 + (k & 1), 2); }
      } else if (v === C.RIVER) {
        g.fillStyle = '#0d1d2a'; g.fillRect(px, py, TILE, TILE);
        let edge = false;
        for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) if (cell(tx + dx, ty + dy) !== C.RIVER) edge = true;
        if (edge) { g.fillStyle = '#1a3242'; g.fillRect(px, py, TILE, TILE); }
      } else if (v === C.POOL) {
        g.fillStyle = '#16303a'; g.fillRect(px, py, TILE, TILE);
        g.fillStyle = '#21414c'; g.fillRect(px + 3, py + 3, TILE - 6, TILE - 6);
      }
    }
    // the ladders' feet under the manholes
    for (const r of L.routes) for (const m of r.manholes) {
      if (m.x < x0 - 40 || m.x > x0 + CH + 40 || m.y < y0 - 40 || m.y > y0 + CH + 40) continue;
      const lx = m.x - x0, ly = m.y - y0;
      g.fillStyle = '#2a2a2a'; g.beginPath(); g.arc(lx, ly, 22, 0, 6.283); g.fill();
      g.strokeStyle = '#8a8f96'; g.lineWidth = 3; g.beginPath(); g.moveTo(lx - 9, ly - 20); g.lineTo(lx - 9, ly + 16); g.moveTo(lx + 9, ly - 20); g.lineTo(lx + 9, ly + 16); g.stroke();
      g.lineWidth = 2; for (let k = -16; k <= 12; k += 7) { g.beginPath(); g.moveTo(lx - 9, ly + k); g.lineTo(lx + 9, ly + k); g.stroke(); }
    }
    // pipes in the sewer walls, outlets dribbling into the stream
    for (const p of L.pipes || []) {
      if (p.x < x0 - 40 || p.x > x0 + CH + 40 || p.y < y0 - 40 || p.y > y0 + CH + 40) continue;
      const lx = p.x - x0, ly = p.y - y0;
      g.fillStyle = '#5e6a5a'; g.beginPath(); g.arc(lx, ly, 9, 0, 6.283); g.fill();
      g.fillStyle = '#1b1f1a'; g.beginPath(); g.arc(lx, ly, 6, 0, 6.283); g.fill();
    }
    // the den: a bed of old leaves and bones
    if (L.cave) {
      const d = L.cave.den;
      if (d.x > x0 - 80 && d.x < x0 + CH + 80 && d.y > y0 - 80 && d.y < y0 + CH + 80) {
        const lx = d.x - x0, ly = d.y - y0;
        g.fillStyle = '#5a4528'; g.beginPath(); g.ellipse(lx, ly, 46, 30, 0, 0, 6.283); g.fill();
        g.fillStyle = '#6e5630'; for (let k = 0; k < 30; k++) g.fillRect(lx - 40 + hh(k, 1) * 80, ly - 24 + hh(k, 2) * 48, 4, 2);
        g.fillStyle = '#d8d0bc'; for (let k = 0; k < 5; k++) { const bx = lx - 50 + hh(k, 7) * 100, by = ly + 20 + hh(k, 8) * 16; g.fillRect(bx, by, 10, 2); g.fillRect(bx - 1, by - 1, 3, 4); g.fillRect(bx + 9, by - 1, 3, 4); }
      }
    }
    return cv;
  }
  ugAt(tx, ty) { for (const R of this.L.regions) if (tx >= R.x0 && ty >= R.y0 && tx < R.x0 + R.w && ty < R.y0 + R.h) return R.ug; return 0; }
  tile(cx, cy, budget) {
    const k = cy * 4096 + cx;
    let t = this.tiles.get(k);
    if (t === undefined && budget.n > 0) { budget.n--; t = this.bake(cx, cy); this.tiles.set(k, t); if (this.tiles.size > 60) { const first = this.tiles.keys().next().value; this.tiles.delete(first); } }
    return t || null;
  }

  // ---- the frame ----
  draw(g, F, W, H, DPR) {
    const S = this.S, L = this.L, view = F.view, now = performance.now() / 1000, dt = Math.min(0.1, F.dt || 0.016);
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = '#030304'; g.fillRect(0, 0, g.canvas.width, g.canvas.height);
    g.setTransform(...S.worldTf);
    g.imageSmoothingEnabled = false;
    const budget = { n: this.tiles.size < 4 ? 6 : 2 };
    for (let cy = Math.floor(view.y0 / CH); cy <= Math.floor(view.y1 / CH); cy++) for (let cx = Math.floor(view.x0 / CH); cx <= Math.floor(view.x1 / CH); cx++) {
      const t = this.tile(cx, cy, budget);
      if (t) g.drawImage(t, cx * CH, cy * CH, CH + 0.5, CH + 0.5);
    }
    g.imageSmoothingEnabled = true;
    this.water(g, view, now);
    this.dressing(g, view, now, F);
    this.veins(g, view, now);
    this.subway(g, view, F);
    this.critters(g, view, now, dt, F);
    for (const v of F.vehs) this.vehicle(g, v);
    const peds = F.peds.filter((p) => !p.parent);
    peds.sort((a, b) => a.ry - b.ry);
    for (const p of peds) this.ped(g, p, now);
    this.effects(g, now, dt);
    this.darkness(g, F, W, H, DPR, now);
    this.glows(g, view, now);
  }

  water(g, view, now) {
    const L = this.L, tx0 = Math.floor(view.x0 / TILE), tx1 = Math.floor(view.x1 / TILE), ty0 = Math.floor(view.y0 / TILE), ty1 = Math.floor(view.y1 / TILE);
    for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
      const v = cellAtPx(L, (tx + 0.5) * TILE, (ty + 0.5) * TILE);
      if (v !== C.STREAM && v !== C.RIVER) continue;
      const h = hh(tx, ty, 77), ph = (now * (v === C.RIVER ? 0.45 : 0.9) + h) % 1;
      g.fillStyle = v === C.RIVER ? 'rgba(120,170,200,.16)' : 'rgba(150,160,90,.18)';
      g.fillRect(tx * TILE + ph * TILE, ty * TILE + 6 + h * 18, 7, 2);
      g.fillRect(tx * TILE + ((ph + 0.5) % 1) * TILE, ty * TILE + 3 + ((h * 7) % 1) * 22, 5, 1.5);
    }
  }
  dressing(g, view, now, F) {
    const L = this.L, inView = (x, y, m = 60) => x > view.x0 - m && x < view.x1 + m && y > view.y0 - m && y < view.y1 + m;
    for (const gr of L.grates || []) {   // a grate up in the street: bars of light on the walkway under it
      if (!inView(gr.x, gr.y)) continue;
      g.fillStyle = 'rgba(20,20,22,.6)'; g.fillRect(gr.x - 14, gr.y - 9, 28, 18);
      g.fillStyle = 'rgba(200,190,150,.10)'; for (let k = -12; k <= 10; k += 5) g.fillRect(gr.x + k, gr.y - 8, 2, 16);
    }
    for (const p of L.pipes || []) {   // a dribble from each outlet
      if (!inView(p.x, p.y)) continue;
      const t = (now * 2 + p.x) % 1;
      g.fillStyle = 'rgba(140,150,90,.5)'; g.fillRect(p.x - p.nx * (6 + t * 16) - 1, p.y - p.ny * (6 + t * 16) - 1, 3, 3);
    }
    for (const r of L.routes) if (r.door && inView(r.door.x, r.door.y, 120)) {   // the service door into the station
      const d = r.door;
      g.fillStyle = '#3d4a42'; g.fillRect(d.x - 18, d.y - 26, 36, 40);
      g.fillStyle = '#56685c'; g.fillRect(d.x - 15, d.y - 23, 30, 34);
      g.fillStyle = '#d8c25a'; g.fillRect(d.x + 8, d.y - 6, 4, 4);
      g.fillStyle = '#1e7a46'; g.fillRect(d.x - 16, d.y - 40, 32, 11);
      g.fillStyle = '#e8f4ea'; g.font = 'bold 8px monospace'; g.textAlign = 'center'; g.fillText('METRO', d.x, d.y - 31.5);
    }
    if (!L.cave) return;
    const K2 = L.cave;
    for (const s of K2.spikes) {   // stalagmites (and their stalactites' drips)
      if (!inView(s.x, s.y)) continue;
      const h = 10 + s.s * 14;
      g.fillStyle = 'rgba(0,0,0,.35)'; g.beginPath(); g.ellipse(s.x + 4, s.y + 2, 7 * s.s + 3, 3 * s.s + 2, 0, 0, 6.283); g.fill();
      g.fillStyle = '#6b6358'; g.beginPath(); g.moveTo(s.x - 6 * s.s - 2, s.y); g.lineTo(s.x, s.y - h); g.lineTo(s.x + 6 * s.s + 2, s.y); g.closePath(); g.fill();
      g.fillStyle = '#8a8174'; g.beginPath(); g.moveTo(s.x - 2, s.y - 2); g.lineTo(s.x, s.y - h); g.lineTo(s.x + 1, s.y - 2); g.closePath(); g.fill();
    }
    for (const gl of K2.glow) {
      if (!inView(gl.x, gl.y, 120)) continue;
      const pulse = 0.75 + 0.25 * Math.sin(now * 1.3 + gl.x * 0.01);
      if (gl.kind === 'mush') {
        for (let k = 0; k < 5; k++) {
          const mx = gl.x + (hh(gl.x, k) - 0.5) * 26, my = gl.y + (hh(gl.y, k) - 0.5) * 18, r = 2.5 + hh(k, gl.x) * 3;
          g.fillStyle = '#cfeee6'; g.fillRect(mx - 0.75, my, 1.5, 4);
          g.fillStyle = `rgba(90,240,215,${0.85 * pulse})`; g.beginPath(); g.ellipse(mx, my, r, r * 0.6, 0, 3.14159, 6.283); g.fill();
        }
      } else if (gl.kind === 'worms') {
        for (let k = 0; k < 14; k++) {
          const wx = gl.x + (hh(gl.x, k, 3) - 0.5) * 90, wy = gl.y + (hh(gl.y, k, 4) - 0.5) * 70, tw = 0.5 + 0.5 * Math.sin(now * (1 + hh(k, 9)) + k);
          g.strokeStyle = 'rgba(160,220,255,.12)'; g.lineWidth = 0.6; g.beginPath(); g.moveTo(wx, wy - 8); g.lineTo(wx, wy); g.stroke();
          g.fillStyle = `rgba(120,230,255,${0.5 + 0.5 * tw})`; g.fillRect(wx - 0.8, wy - 0.8, 1.6, 1.6);
        }
      } else {   // crystals
        for (let k = 0; k < 4; k++) {
          const cx = gl.x + (hh(gl.x, k, 6) - 0.5) * 30, cy = gl.y + (hh(gl.y, k, 7) - 0.5) * 20, h2 = 8 + hh(k, 2) * 10;
          g.fillStyle = `rgba(170,120,255,${0.8 * pulse})`; g.beginPath(); g.moveTo(cx - 3, cy); g.lineTo(cx, cy - h2); g.lineTo(cx + 3, cy); g.closePath(); g.fill();
        }
      }
    }
    for (const r of this.rubble) {
      if (!inView(r.x, r.y)) continue;
      const k = Math.min(1, (performance.now() / 1000 - r.fall) / 0.25);
      if (k < 1) { g.fillStyle = '#7a7064'; g.beginPath(); g.arc(r.x, r.y - (1 - k) * 120, 9, 0, 6.283); g.fill(); continue; }
      g.fillStyle = '#6d6458'; for (let j = 0; j < 7; j++) g.fillRect(r.x - 14 + hh(j, r.x | 0) * 28, r.y - 9 + hh(j, r.y | 0) * 18, 5, 4);
      g.fillStyle = '#8a8070'; g.beginPath(); g.arc(r.x, r.y, 7, 0, 6.283); g.fill();
    }
  }
  veins(g, view, now) {
    const S = this.S, ug = S.ugLayer || 0, bare = new Map((S.ugVeins || []).map((q) => [q[0], q]));
    for (const v of this.L.veins) {
      if ((v.ug || 0) !== ug) continue;
      const st = bare.get(v.i), at = v.alts[st ? st[1] : 0] || v.alts[0];
      if (at.x < view.x0 - 40 || at.x > view.x1 + 40 || at.y < view.y0 - 40 || at.y > view.y1 + 40) continue;
      if (st && st[2] > 0 && (performance.now() - (S.ugVeinsAt || 0)) / 1000 < st[2]) continue;   // (worked out: growing back)
      drawVein(g, v.ore, at.x, at.y, now, v.i);
    }
  }
  // the subway's track behind the grille, where a route meets a station
  subway(g, view, F) {
    const rail = this.S.map.rail;
    if (!rail) return;
    const doors = this.L.routes.filter((r) => r.door && r.door.x > view.x0 - 500 && r.door.x < view.x1 + 500 && r.door.y > view.y0 - 500 && r.door.y < view.y1 + 500);
    for (const r of doors) {
      const d = r.door, ox = d.tx - d.x, oy = d.ty - d.y, l = Math.hypot(ox, oy) || 1, ux = -Math.sin(d.a), uy = Math.cos(d.a);
      void ux; void uy;
      // a slot of tunnel beyond the door: the rails, a platform edge, the grille between
      g.save();
      g.translate(d.tx, d.ty); g.rotate(d.a);
      g.fillStyle = '#0b0b0c'; g.fillRect(-260, -46, 520, 92);
      g.fillStyle = '#3a3026'; for (let x = -256; x < 256; x += 18) g.fillRect(x, -22, 8, 44);
      g.fillStyle = '#9aa0a8'; g.fillRect(-260, -14, 520, 3); g.fillRect(-260, 11, 520, 3);
      g.fillStyle = '#c9b23a'; g.fillRect(-260, -46, 520, 4);
      g.restore();
      // the train, when one is in (its cars are sent to whoever is near the line: the subway's own level)
      for (const c of F.cars || []) {
        if (Math.hypot(c.rx - d.tx, c.ry - d.ty) > 600) continue;
        g.save(); g.translate(c.rx, c.ry); g.rotate(c.ra);
        g.fillStyle = '#5d6a75'; g.fillRect(-150, -26, 300, 52); g.fillStyle = '#e8d890'; for (let x = -130; x < 140; x += 40) g.fillRect(x, -24, 22, 6);
        g.restore();
      }
      g.strokeStyle = 'rgba(160,170,180,.5)'; g.lineWidth = 1;
      const gx = d.x + ox / l * 40, gy = d.y + oy / l * 40;
      for (let k = -40; k <= 40; k += 8) { g.beginPath(); g.moveTo(gx - oy / l * k, gy + ox / l * k - 6); g.lineTo(gx - oy / l * k, gy + ox / l * k + 6); g.stroke(); }
    }
  }
  critters(g, view, now, dt, F) {
    const me = F.meEnt, mx = me ? me.rx : -1e9, my = me ? me.ry : -1e9;
    // rats: scurrying up and down the walkway's edge; off they run when someone comes near
    for (const r of this.rats) {
      if (r.ox < view.x0 - 300 || r.ox > view.x1 + 300 || r.oy < view.y0 - 300 || r.oy > view.y1 + 300) continue;
      const near = Math.hypot(mx - r.x, my - r.y) < 90;
      if (near) r.flee = 1.2;
      r.flee = Math.max(0, r.flee - dt);
      const want = r.flee > 0 ? (r.u > 0 ? 1 : -1) * 160 : Math.sin(now * 0.7 + r.i) * 40;
      r.sp += (want - r.sp) * Math.min(1, dt * 6);
      r.u += r.sp * dt;
      if (Math.abs(r.u) > 120) { r.u = Math.sign(r.u) * 120; r.sp = -r.sp * 0.3; }
      r.x = r.ox + r.dx * r.u; r.y = r.oy + r.dy * r.u;
      const a = Math.atan2(r.dy, r.dx) + (r.sp < 0 ? Math.PI : 0);
      g.save(); g.translate(r.x, r.y); g.rotate(a);
      g.strokeStyle = '#8a6a5a'; g.lineWidth = 1; g.beginPath(); g.moveTo(-5, 0); g.quadraticCurveTo(-10, Math.sin(now * 12 + r.i) * 3, -15, 0); g.stroke();
      g.fillStyle = '#4a3d36'; g.beginPath(); g.ellipse(0, 0, 6, 3.4, 0, 0, 6.283); g.fill();
      g.fillStyle = '#5c4d44'; g.beginPath(); g.ellipse(5, 0, 2.6, 2.2, 0, 0, 6.283); g.fill();
      g.restore();
    }
    // bats: flying off from the roost, wings flapping, gone into the dark
    this.bats = this.bats.filter((b) => now - b.t < b.life);
    for (const b of this.bats) {
      if (now < b.t) continue;
      b.vx += (Math.random() - 0.5) * 600 * dt; b.vy += (Math.random() - 0.5) * 600 * dt;
      b.x += b.vx * dt; b.y += b.vy * dt;
      const f = Math.sin(now * 28 + b.ph) * 5;
      g.strokeStyle = '#151217'; g.lineWidth = 2; g.beginPath(); g.moveTo(b.x - 7, b.y - f); g.lineTo(b.x, b.y); g.lineTo(b.x + 7, b.y - f); g.stroke();
    }
    // a few bats asleep at each roost (dark shapes on the roof)
    if (this.L.cave && this.S.ugLayer === UG.CAVE) for (const r of this.L.cave.roosts) {
      if (r.x < view.x0 - 60 || r.x > view.x1 + 60 || r.y < view.y0 - 60 || r.y > view.y1 + 60) continue;
      g.fillStyle = '#121014';
      for (let k = 0; k < 6; k++) { const bx = r.x + (hh(r.i, k, 1) - 0.5) * 60, by = r.y + (hh(r.i, k, 2) - 0.5) * 40; g.beginPath(); g.ellipse(bx, by, 2.6, 4, 0, 0, 6.283); g.fill(); }
    }
  }
  vehicle(g, v) {
    const def = v.d && VEHICLE_BY_INDEX[v.d.m];
    if (!def) return;
    g.save(); g.translate(v.rx, v.ry); g.rotate(v.ra);
    const Lh = def.L / 2, Wh = def.W / 2;
    g.fillStyle = 'rgba(0,0,0,.35)'; g.beginPath(); g.ellipse(4, 4, Lh, Wh, 0, 0, 6.283); g.fill();
    g.fillStyle = '#e9e4d8'; g.beginPath(); g.moveTo(Lh, 0); g.quadraticCurveTo(Lh * 0.6, -Wh, -Lh * 0.2, -Wh); g.lineTo(-Lh, -Wh * 0.85); g.lineTo(-Lh, Wh * 0.85); g.lineTo(-Lh * 0.2, Wh); g.quadraticCurveTo(Lh * 0.6, Wh, Lh, 0); g.fill();
    g.fillStyle = '#3c6a7a'; g.fillRect(-Lh + 8, -Wh * 0.55, Lh * 1.3, Wh * 1.1);
    g.fillStyle = '#c9c2b2'; g.fillRect(-Lh * 0.1, -Wh * 0.7, 6, Wh * 1.4);
    g.fillStyle = '#26282c'; g.fillRect(-Lh - 8, -5, 10, 10);
    g.restore();
  }
  ped(g, p, now) {
    const x = p.rx, y = p.ry, a = p.ra || 0, dead = !!(p.flags & PF.DEAD), ar = (p.d && p.d.ar) || '';
    if (ar.startsWith('pet:')) return this.animal(g, p, ar.slice(4).split(':')[0], now);
    const h = hh(p.id, 1), shirt = p.flags & PF.BADGE ? '#1f2c4a' : SHIRTS[Math.floor(h * SHIRTS.length)], skin = SKIN[Math.floor(hh(p.id, 2) * SKIN.length)];
    g.save(); g.translate(x, y);
    g.fillStyle = 'rgba(0,0,0,.35)'; g.beginPath(); g.ellipse(2, 5, 10, 5, 0, 0, 6.283); g.fill();
    if (dead) { g.rotate(a); g.fillStyle = shirt; g.fillRect(-11, -5, 18, 10); g.fillStyle = skin; g.beginPath(); g.arc(10, 0, 5, 0, 6.283); g.fill(); g.restore(); return; }
    g.rotate(a);
    const st = Math.sin((p.phase || 0) * Math.PI / 4) * 4;
    g.fillStyle = '#2a2a30'; g.fillRect(-3 + st, -6, 6, 4); g.fillRect(-3 - st, 2, 6, 4);   // feet
    g.fillStyle = shirt; g.beginPath(); g.ellipse(0, 0, 6, 9, 0, 0, 6.283); g.fill();
    g.fillStyle = skin; g.beginPath(); g.arc(2 - st * 0.4, -9, 2.6, 0, 6.283); g.arc(2 + st * 0.4, 9, 2.6, 0, 6.283); g.fill();   // hands
    const sw = p.pickAt !== undefined ? (this.S.loopClock - p.pickAt) / 0.42 : 9;
    if (sw < 1) {   // the pickaxe: up over the shoulder and down onto the rock
      const ang = -1.4 + sw * 2.0;
      g.save(); g.rotate(ang);
      g.strokeStyle = '#7a5532'; g.lineWidth = 2.5; g.beginPath(); g.moveTo(2, 4); g.lineTo(20, 4); g.stroke();
      g.strokeStyle = '#a9b0b8'; g.lineWidth = 3; g.beginPath(); g.moveTo(20, -4); g.quadraticCurveTo(23, 4, 20, 12); g.stroke();
      g.restore();
    }
    g.fillStyle = skin; g.beginPath(); g.arc(1, 0, 5, 0, 6.283); g.fill();
    g.fillStyle = hh(p.id, 3) < 0.5 ? '#2a1d14' : '#5a3a22'; g.beginPath(); g.arc(-0.5, 0, 4.4, 1.6, 4.7); g.fill();
    if (p.flags & PF.BADGE) { g.fillStyle = '#16203a'; g.beginPath(); g.arc(0, 0, 5.2, 1.2, 5.1); g.fill(); }
    g.restore();
  }
  animal(g, p, kind, now) {
    const x = p.rx, y = p.ry, a = p.ra || 0, pose = (p.extra || 0) & 31, big = /bear|grizzly/.test(kind);
    g.save(); g.translate(x, y); g.rotate(a);
    const s = big ? 1 : 0.6;
    g.fillStyle = 'rgba(0,0,0,.35)'; g.beginPath(); g.ellipse(3, 5, 24 * s, 13 * s, 0, 0, 6.283); g.fill();
    const fur = kind === 'grizzly' ? '#6a4a2a' : big ? '#2a221c' : '#7a6a54';
    if (pose === 8) {   // asleep, curled up
      g.fillStyle = fur; g.beginPath(); g.ellipse(0, 0, 18 * s, 14 * s, 0, 0, 6.283); g.fill();
      g.fillStyle = '#4a3a2c'; g.beginPath(); g.arc(10 * s, 6 * s, 6 * s, 0, 6.283); g.fill();
    } else {
      const st = Math.sin(now * (pose === 4 ? 14 : 6)) * 3 * s;
      g.fillStyle = fur;
      for (const [lx, ly] of [[10, -9], [10, 9], [-10, -9], [-10, 9]]) g.fillRect((lx + (lx > 0 ? st : -st)) * s - 3, ly * s - 3, 6 * s, 6 * s);
      g.beginPath(); g.ellipse(0, 0, 20 * s, 11 * s, 0, 0, 6.283); g.fill();
      g.beginPath(); g.arc(19 * s, 0, 7 * s, 0, 6.283); g.fill();
      g.fillStyle = '#5a4a3a'; g.beginPath(); g.arc(25 * s, 0, 3 * s, 0, 6.283); g.fill();
      g.fillStyle = fur; g.beginPath(); g.arc(17 * s, -6 * s, 2.6 * s, 0, 6.283); g.arc(17 * s, 6 * s, 2.6 * s, 0, 6.283); g.fill();
    }
    g.restore();
  }
  effects(g, now, dt) {
    this.fxs = this.fxs.filter((f) => now - f.t < f.life);
    for (const f of this.fxs) {
      f.x += f.vx * dt; f.y += f.vy * dt; f.vx *= Math.exp(-3 * dt); f.vy *= Math.exp(-3 * dt);
      f.vz -= 400 * dt; f.z = Math.max(0, f.z + f.vz * dt);
      const k = 1 - (now - f.t) / f.life;
      g.globalAlpha = Math.max(0, k);
      g.fillStyle = f.c; g.fillRect(f.x - f.s / 2, f.y - f.z - f.s / 2, f.s, f.s);
    }
    g.globalAlpha = 1;
    if (this.dust && now < this.dust.until) {   // grit trickling from a cracked roof
      const d = this.dust;
      g.fillStyle = 'rgba(170,160,140,.7)';
      for (let k = 0; k < 10; k++) { const t = (now * 1.6 + k / 10) % 1; g.fillRect(d.x + (hh(k, 5) - 0.5) * 22, d.y - 60 + t * 60, 1.5, 3); }
      g.fillStyle = 'rgba(170,160,140,.18)'; g.beginPath(); g.ellipse(d.x, d.y, 16, 7, 0, 0, 6.283); g.fill();
    }
  }
  // The dark: everything above is covered but for round the lights. On its own canvas: black, with the lights cut out of
  // it (destination-out), then laid over the frame.
  darkness(g, F, W, H, DPR, now) {
    const S = this.S, L = this.L, cv = this.dark;
    if (cv.width !== g.canvas.width || cv.height !== g.canvas.height) { cv.width = g.canvas.width; cv.height = g.canvas.height; }
    const d = cv.getContext('2d'), ug = S.ugLayer || 0;
    d.setTransform(1, 0, 0, 1, 0, 0);
    d.globalCompositeOperation = 'source-over';
    d.clearRect(0, 0, cv.width, cv.height);
    d.fillStyle = `rgba(2,2,5,${1 - (UG_AMBIENT[ug] || 0)})`;
    d.fillRect(0, 0, cv.width, cv.height);
    d.setTransform(...S.worldTf);
    d.globalCompositeOperation = 'destination-out';
    const hole = (x, y, r, k) => {
      if (k <= 0.01) return;
      const gr = d.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, `rgba(0,0,0,${Math.min(1, k)})`); gr.addColorStop(0.55, `rgba(0,0,0,${Math.min(1, k) * 0.55})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
      d.fillStyle = gr; d.beginPath(); d.arc(x, y, r, 0, 6.283); d.fill();
    };
    // carried lights: whatever main.js's carriedLights records (the flashlight's cone and every light item)
    const rec = this.rec || (this.rec = { list: [] });
    rec.list.length = 0;
    const R = {
      cone: (x, y, a, len, deg, c, k) => rec.list.push({ t: 'cone', x, y, a, len, deg, k }),
      beam: (x, y, a, len, w, c, k) => rec.list.push({ t: 'cone', x, y, a, len, deg: 18, k: k * 3 }),
      add: (x, y, r, c, k) => rec.list.push({ t: 'pt', x, y, r, k }),
      glow: (x, y, r, c, k) => rec.list.push({ t: 'pt', x, y, r: r * 1.6, k: k * 0.8 }),
    };
    if (this.api.carriedLights) this.api.carriedLights(R, F.peds, 1, 0);
    for (const l of rec.list) {
      if (l.t === 'pt') { hole(l.x, l.y, l.r, l.k); continue; }
      const half = ((l.deg || 60) / 2) * Math.PI / 180, gr = d.createRadialGradient(l.x, l.y, 0, l.x, l.y, l.len);
      gr.addColorStop(0, `rgba(0,0,0,${Math.min(1, l.k)})`); gr.addColorStop(0.6, `rgba(0,0,0,${Math.min(1, l.k) * 0.7})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
      d.fillStyle = gr; d.beginPath(); d.moveTo(l.x, l.y); d.arc(l.x, l.y, l.len, l.a - half, l.a + half); d.closePath(); d.fill();
      hole(l.x, l.y, 46, Math.min(1, l.k) * 0.6);   // (the spill round your feet)
    }
    // the light of a burning vehicle, muzzle flashes (S.flashes) - anything bright for a moment
    for (const f of S.flashes || []) hole(f.x, f.y, (f.r || 120) * 1.2, 0.9);
    // the street light coming down the sewer grates (the day's, or the street lamps' at night)
    const day = F.sky ? 1 - (F.sky.night || 0) : 1;
    if (ug === UG.SEWER) for (const gr of L.grates || []) hole(gr.x, gr.y, 90, 0.18 + 0.55 * day);
    // the glowing things
    if (ug === UG.CAVE && L.cave) for (const gl of L.cave.glow) hole(gl.x, gl.y, gl.r, gl.k * (0.85 + 0.15 * Math.sin(now * 1.3 + gl.x * 0.01)));
    // just enough to make yourself out by
    const me = F.meEnt;
    if (me) hole(me.rx, me.ry, 64, ug === UG.SEWER ? 0.3 : 0.18);
    d.globalCompositeOperation = 'source-over';
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.drawImage(cv, 0, 0);
    g.setTransform(...S.worldTf);
  }
  // the glowing things' own colour, added over the dark (soft blue-green halos)
  glows(g, view, now) {
    const L = this.L, S = this.S;
    if ((S.ugLayer || 0) !== UG.CAVE || !L.cave) return;
    g.save();
    g.globalCompositeOperation = 'lighter';
    for (const gl of L.cave.glow) {
      if (gl.x < view.x0 - gl.r || gl.x > view.x1 + gl.r || gl.y < view.y0 - gl.r || gl.y > view.y1 + gl.r) continue;
      const pulse = 0.8 + 0.2 * Math.sin(now * 1.3 + gl.x * 0.01), col = gl.kind === 'crystal' ? '150,110,255' : gl.kind === 'worms' ? '90,200,255' : '60,230,200';
      const gr = g.createRadialGradient(gl.x, gl.y, 0, gl.x, gl.y, gl.r * 0.7);
      gr.addColorStop(0, `rgba(${col},${0.22 * gl.k * pulse})`); gr.addColorStop(1, `rgba(${col},0)`);
      g.fillStyle = gr; g.beginPath(); g.arc(gl.x, gl.y, gl.r * 0.7, 0, 6.283); g.fill();
    }
    g.restore();
  }
}

// An ore vein in the rock: a dark seam with glints of its ore (here, and up at the quarry - main.js).
export function drawVein(g, ore, x, y, now, i = 0) {
  const c = ORE_COL[ore] || ORE_COL.coal;
  g.fillStyle = 'rgba(20,18,16,.55)'; g.beginPath(); g.ellipse(x, y, 13, 8, 0, 0, 6.283); g.fill();
  for (let k = 0; k < 6; k++) {
    const gx = x + (hh(i, k, 11) - 0.5) * 20, gy = y + (hh(i, k, 12) - 0.5) * 12, s = 2 + hh(i, k, 13) * 3;
    g.fillStyle = k % 2 ? c[0] : c[1]; g.fillRect(gx - s / 2, gy - s / 2, s, s);
  }
  const tw = Math.sin(now * 3 + i) * 0.5 + 0.5;
  if (tw > 0.85) { g.fillStyle = 'rgba(255,255,255,.9)'; g.fillRect(x + (hh(i, 1) - 0.5) * 14, y + (hh(i, 2) - 0.5) * 8, 1.5, 1.5); }
}
export { K };
export const layout = (map) => undergroundOf(map);
