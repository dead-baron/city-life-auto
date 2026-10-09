// The world map screen (the UI concept U7, docs/art-v2/targets/U7_map.png): the city as the game draws it, seen from
// above (assets/map, baked by tools/build-worldmap2.mjs: an overview at 1/32 shown at once, 512 px tiles at 1/16
// fetched as you zoom in), district names on dark plates, the places by kind as little pixel icons (the panel's
// categories switch them on and off), the railway, bus lines and ferries, the GPS route to your waypoint along the
// roads (client/route.js), you, and what you're after. On duty it is the police dispatch map. Loaded the first time
// the map opens (main.js), so the page's first load stays light; draws the old tile map until the art is in, or when
// the art is for another world (its signature isn't the running world's).
import { TILE } from '../shared/constants.js';
import { PACK_TIERS } from '../shared/items.js';
import { EVENT_KINDS } from '../shared/worldevents.js';
import { mapSignature } from '../shared/map.js';
import { MAP_FRAME, districtCentroids, iconSkip, packIcon } from './hud.js';
import { MAP_CATS, KIND_ICON, MAJOR_KINDS } from './mapwaypoints.js';
import { drawIcon } from './pixicons.js';

const PIXEL = '"CLA Pixel", "Barlow Condensed", monospace';
const SEA = '#2f74c0';

export function createWorldMap(map) { return new WorldMap(map); }

class WorldMap {
  constructor(map) {
    this.map = map;
    this.view = { z: 1, cx: (MAP_FRAME[0] + MAP_FRAME[2]) / 2, cy: (MAP_FRAME[1] + MAP_FRAME[3]) / 2 };
    this.scale = 1; this.origin = [0, 0]; this.fit = 1;
    this.art = null; this.ov = null; this.tiles = new Map();
    this.hits = [];   // the icons drawn last frame, for clicks: [x, y, r, poi]
    this.loadArt();
  }

  async loadArt() {
    try {
      const meta = await (await fetch('assets/map/meta.json', { cache: 'no-cache' })).json();
      if (meta.sig !== mapSignature(this.map)) { console.warn('[map] assets/map is another world\'s picture: the tile map is shown'); return; }
      this.art = meta;
      const im = new Image();
      im.decoding = 'async';
      im.onload = () => { this.ov = im; };
      im.src = 'assets/map/overview.webp';
    } catch (e) { console.warn('[map] no map art', e); }
  }
  tile(c, r) {
    const k = c + ',' + r;
    let t = this.tiles.get(k);
    if (!t) {
      t = { im: new Image(), ok: false };
      t.im.decoding = 'async';
      t.im.onload = () => { t.ok = true; };
      t.im.src = `assets/map/t/${c}_${r}.webp`;
      this.tiles.set(k, t);
    }
    return t.ok ? t.im : null;
  }

  // ---- the view: zoom about a point, pan, centre -------------------------------------------------------------
  zoom(k, sx, sy, cw, ch) {
    const V = this.view, sc = this.scale;
    if (sx === undefined) { sx = cw / 2; sy = ch / 2; }
    const [ox, oy] = this.origin;
    const wx = ox + sx / sc, wy = oy + sy / sc;   // the world point under the finger stays put
    const z = Math.max(1, Math.min(10, V.z * k));
    const ns = this.fit * z;
    V.z = z; V.cx = wx - sx / ns + cw / ns / 2; V.cy = wy - sy / ns + ch / ns / 2;
  }
  pan(dx, dy) { this.view.cx -= dx / this.scale; this.view.cy -= dy / this.scale; }
  center(x, y) { this.view.cx = x; this.view.cy = y; }
  reset() { this.view.z = 1; }
  toWorld(sx, sy) { return [this.origin[0] + sx / this.scale, this.origin[1] + sy / this.scale]; }
  // the icon under a click (CSS px on the canvas), if any
  hitAt(sx, sy) {
    let best = null, bd = 16;
    for (const [x, y, r, p] of this.hits) { const d = Math.hypot(x - sx, y - sy); if (d < Math.max(bd, r) && (!best || d < bd)) { best = p; bd = d; } }
    return best;
  }

  // ---- drawing ------------------------------------------------------------------------------------------------
  // hud: the HUD (its me, plist, transit, waypoint, mapFilter, mini), cx/cy/heading: you; opts: { cats: Set of the
  // categories switched on, route: the GPS route or null, cross: show the cross in the middle (a pad picks with it) }
  draw(c, hud, cx, cy, heading, opts) {
    const cw = c.clientWidth, ch = c.clientHeight;
    if (!cw || !ch) return;
    const dpr = Math.min(2, devicePixelRatio || 1);
    if (c.width !== Math.round(cw * dpr) || c.height !== Math.round(ch * dpr)) { c.width = Math.round(cw * dpr); c.height = Math.round(ch * dpr); }
    const g = c.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const [fx0, fy0, fx1, fy1] = MAP_FRAME, WW = fx1 - fx0, WH = fy1 - fy0;
    const fit = Math.min(cw / WW, ch / WH) * 0.98;
    const V = this.view, sc = fit * V.z;
    // keep the frame on screen: zoomed out it sits in the middle; zoomed in, its edge stops at the screen's
    const vw = cw / sc, vh = ch / sc;
    V.cx = vw >= WW ? (fx0 + fx1) / 2 : Math.max(fx0 + vw / 2, Math.min(fx1 - vw / 2, V.cx));
    V.cy = vh >= WH ? (fy0 + fy1) / 2 : Math.max(fy0 + vh / 2, Math.min(fy1 - vh / 2, V.cy));
    const ox = V.cx - vw / 2, oy = V.cy - vh / 2;
    this.scale = sc; this.origin = [ox, oy]; this.fit = fit;
    const P = (x, y) => [(x - ox) * sc, (y - oy) * sc];
    const me = hud.me, police = !!(me && me.faction === 'enforcer');
    const now = performance.now();
    this.hits = [];

    // the ground: the baked picture (overview, and the tiles once zoomed in past it), else the tile map
    g.fillStyle = SEA; g.fillRect(0, 0, cw, ch);
    const A = this.art;
    if (A && this.ov) {
      g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
      const k = 1 / (A.scale * A.overview);   // overview px per world px
      const sx0 = Math.max(A.x0, ox), sy0 = Math.max(A.y0, oy), sx1 = Math.min(A.x0 + A.w * A.scale, ox + vw), sy1 = Math.min(A.y0 + A.h * A.scale, oy + vh);
      if (sx1 > sx0 && sy1 > sy0) {
        g.drawImage(this.ov, (sx0 - A.x0) * k, (sy0 - A.y0) * k, (sx1 - sx0) * k, (sy1 - sy0) * k, (sx0 - ox) * sc, (sy0 - oy) * sc, (sx1 - sx0) * sc, (sy1 - sy0) * sc);
        // zoomed in past the overview's own pixels: the 1/16 tiles where they're loaded
        if (sc * A.scale * A.overview * dpr > 1.15) {
          const TW = A.tile * A.scale;   // a tile's size in world px
          const c0 = Math.max(0, Math.floor((sx0 - A.x0) / TW)), c1 = Math.min(A.cols - 1, Math.floor((sx1 - A.x0 - 1) / TW));
          const r0 = Math.max(0, Math.floor((sy0 - A.y0) / TW)), r1 = Math.min(A.rows - 1, Math.floor((sy1 - A.y0 - 1) / TW));
          for (let r = r0; r <= r1; r++) for (let cc = c0; cc <= c1; cc++) {
            const im = this.tile(cc, r);
            if (!im) continue;
            const wx = A.x0 + cc * TW, wy = A.y0 + r * TW;
            g.drawImage(im, (wx - ox) * sc, (wy - oy) * sc, im.width * A.scale * sc, im.height * A.scale * sc);
          }
        }
      }
    } else if (hud.mini) {
      g.imageSmoothingEnabled = false;
      g.drawImage(hud.mini, ox / TILE, oy / TILE, vw / TILE, vh / TILE, 0, 0, cw, ch);
    }
    if (police) { g.fillStyle = 'rgba(8,16,40,.35)'; g.fillRect(0, 0, cw, ch); }

    // the railway: a dark line with light ties (dashed where it runs underground)
    if (this.map.rail) {
      const pts = this.map.rail.pts;
      g.lineCap = 'round'; g.lineJoin = 'round';
      for (const [under, col, wd, dash] of [[false, 'rgba(18,14,10,.85)', 4.5, []], [false, '#efe6cf', 1.6, [3, 4]], [true, 'rgba(18,14,10,.6)', 3, [5, 5]]]) {
        g.strokeStyle = col; g.lineWidth = wd; g.setLineDash(dash);
        g.beginPath();
        for (let i = 0; i < pts.length; i++) {
          const a = pts[i], b = pts[(i + 1) % pts.length];
          if (!!a.under !== under) continue;
          const [x1, y1] = P(a.x, a.y), [x2, y2] = P(b.x, b.y);
          g.moveTo(x1, y1); g.lineTo(x2, y2);
        }
        g.stroke();
      }
      g.setLineDash([]);
    }
    const cats = opts.cats || new Set(MAP_CATS.map((q) => q.id));
    const T = hud.transit;
    // the bus lines (the Transit category): each line's streets in its colour, its stops ringed in it
    if (cats.has('transit') && T && T.lines) {
      g.lineCap = 'round'; g.lineJoin = 'round';
      const route = (L) => { g.beginPath(); L.path.forEach(([x0, y0], i) => { const [x, y] = P(x0, y0); if (i) g.lineTo(x, y); else g.moveTo(x, y); }); g.closePath(); };
      for (const L of T.lines) {
        g.strokeStyle = 'rgba(0,0,0,.5)'; g.lineWidth = 5.5; route(L); g.stroke();
        g.strokeStyle = L.col; g.lineWidth = 3; route(L); g.stroke();
      }
      for (const L of T.lines) {
        for (const s of L.stops) {
          const [x, y] = P(s.x, s.y);
          if (x < -10 || y < -10 || x > cw + 10 || y > ch + 10) continue;
          g.fillStyle = '#fff'; g.strokeStyle = L.col; g.lineWidth = 2.5; g.beginPath(); g.arc(x, y, 4, 0, 6.28); g.fill(); g.stroke();
          if (V.z >= 5) plateText(g, x, y - 13, s.n, 11, '#ffffff', false);
        }
        for (const b of L.buses) {
          const [x, y] = P(b.x, b.y);
          g.save(); g.translate(x, y); g.rotate(b.a);
          g.fillStyle = L.col; g.strokeStyle = '#0a0f1d'; g.lineWidth = 1.5; g.fillRect(-7, -4, 14, 8); g.strokeRect(-7, -4, 14, 8);
          g.restore();
        }
      }
    }
    // the ferries: each route dashed in sea blue, an anchor at each pier, and where its boat is
    if (cats.has('transit') && T && T.ferries) {
      g.lineCap = 'round'; g.lineJoin = 'round';
      for (const R of T.ferries) {
        for (const [col, wd] of [['rgba(0,0,0,.35)', 4], [R.car ? '#bff0ff' : '#e4f8ff', 2.2]]) {
          g.strokeStyle = col; g.lineWidth = wd; g.setLineDash([7, 6]);
          g.beginPath(); R.path.forEach(([x0, y0], i) => { const [x, y] = P(x0, y0); if (i) g.lineTo(x, y); else g.moveTo(x, y); }); g.stroke();
        }
        g.setLineDash([]);
        R.piers.forEach((pr, k) => {
          const [x, y] = P(pr.x, pr.y);
          iconPlate(g, x, y, 'anchor', 22, '#0d2a44', '#7de8ff');
          this.hits.push([x, y, 12, { x: pr.x, y: pr.y, label: `${k ? R.island : R.mainland} ferry` }]);
          if (V.z >= 2.2) plateText(g, x, y - 20, `${k ? R.island : R.mainland} ferry`, 11, '#bfefff', false);
        });
        if (R.boat) {
          const [x, y] = P(R.boat.x, R.boat.y), l = R.car ? 9 : 6;
          g.save(); g.translate(x, y); g.rotate(R.boat.a);
          g.fillStyle = '#f0eee6'; g.strokeStyle = '#0c2a40'; g.lineWidth = 1.5;
          g.beginPath(); g.moveTo(-l, -l / 2.4); g.lineTo(l * 0.6, -l / 2.4); g.lineTo(l, 0); g.lineTo(l * 0.6, l / 2.4); g.lineTo(-l, l / 2.4); g.closePath(); g.fill(); g.stroke();
          g.restore();
        }
      }
    }
    // the route to your waypoint: yellow dots along the roads
    if (opts.route && opts.route.pts.length > 1) {
      const pts = opts.route.pts;
      g.lineCap = 'round'; g.lineJoin = 'round';
      g.strokeStyle = 'rgba(10,15,29,.75)'; g.lineWidth = 7; g.setLineDash([]);
      g.beginPath(); pts.forEach((p, i) => { const [x, y] = P(p.x, p.y); if (i) g.lineTo(x, y); else g.moveTo(x, y); }); g.stroke();
      g.strokeStyle = '#ffd34a'; g.lineWidth = 4; g.setLineDash([0.1, 8]); g.lineDashOffset = -(now / 60) % 8.1;
      g.beginPath(); pts.forEach((p, i) => { const [x, y] = P(p.x, p.y); if (i) g.lineTo(x, y); else g.moveTo(x, y); }); g.stroke();
      g.setLineDash([]); g.lineDashOffset = 0;
    }

    // what's drawn so far, in 12 px cells: a label or an icon only goes where it covers nothing drawn before it (the
    // district names first, then the places by importance), so a busy corner of town shows its main places
    const occ = new Set(), CELL = 12;
    const cellsOf = (x0, y0, x1, y1, f) => { for (let yy = Math.floor(y0 / CELL); yy <= Math.floor(y1 / CELL); yy++) for (let xx = Math.floor(x0 / CELL); xx <= Math.floor(x1 / CELL); xx++) if (f(yy * 4096 + xx)) return true; return false; };
    const isFree = (b) => !cellsOf(b[0] + 2, b[1] + 2, b[2] - 2, b[3] - 2, (k) => occ.has(k));
    const claim = (b) => { cellsOf(b[0], b[1], b[2], b[3], (k) => { occ.add(k); return false; }); };
    const free = (x, y, tw, th) => { const b = [x - tw / 2 - 3, y - th / 2 - 2, x + tw / 2 + 3, y + th / 2 + 2]; if (!isFree(b)) return false; claim(b); return true; };
    // district names, on dark plates (gang turf in red)
    const fs = Math.round(Math.max(11, Math.min(16, cw / 80)));
    for (const d of districtCentroids(this.map)) {
      const [x, y] = P(d.x, d.y);
      if (x < -100 || y < -30 || x > cw + 100 || y > ch + 30) continue;
      claim(plateText(g, x, y, d.name.toUpperCase(), fs, d.turf ? '#ff9c8c' : '#f6ecd0', true));
    }
    // the landmarks' names, once zoomed in
    if (V.z >= 2) {
      const lfs = Math.max(10, fs - 3);
      g.font = `${lfs}px ${PIXEL}`;
      const named = new Set();
      for (const pt of (this.map.paintings || []).concat(this.map.landmarks || [])) {
        if (!pt.name || named.has(pt.name)) continue;
        const [x, y] = P(pt.x + pt.w / 2, pt.y + pt.h + 40), lab = pt.name;
        if (x < -150 || y < -30 || x > cw + 150 || y > ch + 30 || !free(x, y, g.measureText(lab).width, lfs)) continue;
        named.add(pt.name);
        outlined(g, x, y, lab, '#cfeeff');
      }
    }

    // the places: an icon on a plate per kind (the categories switched on; the busy little ones once zoomed in)
    const big = V.z >= 2.2;
    const iconPx = V.z >= 3 ? 24 : V.z >= 1.6 ? 22 : 18;
    const kindCat = catOfKind();
    // you and your waypoint keep their spots clear
    const [mx, my] = P(cx, cy);
    claim([mx - 14, my - 14, mx + 14, my + 14]);
    if (hud.waypoint) { const [wx, wy] = P(hud.waypoint.x, hud.waypoint.y); claim([wx - 14, wy - 30, wx + 14, wy + 4]); }
    for (const p of placesByRank(this.map)) {
      const ic = KIND_ICON[p.kind];
      const cat = kindCat.get(p.kind);
      if (!cat || !cats.has(cat)) continue;
      if (!big && !MAJOR_KINDS.has(p.kind)) continue;
      if ((p.kind === 'home' && V.z < 3.2) || (p.kind === 'atm' && V.z < 4.5)) continue;   // (homes for sale and ATMs: close up only, there are so many)
      const [x, y] = P(p.x, p.y);
      if (x < -20 || y < -20 || x > cw + 20 || y > ch + 20) continue;
      const s = p.kind === 'atm' || p.kind === 'home' ? iconPx - 4 : iconPx, b = [x - s / 2, y - s / 2, x + s / 2, y + s / 2];
      if (!isFree(b)) continue;
      claim(b);
      iconPlate(g, x, y, ic, s);
      this.hits.push([x, y, s / 2 + 2, p]);
    }
    if (me) {
      // your homes, always
      for (const hm of me.homes || []) { const [x, y] = P(hm.x, hm.y); iconPlate(g, x, y, 'home', iconPx + 2, '#123a22', '#7dffa8'); this.hits.push([x, y, 14, { x: hm.x, y: hm.y, label: hm.name || 'Home' }]); }
      if (me.rumor) { const [x, y] = P(me.rumor.x, me.rumor.y); g.strokeStyle = '#ffd36b'; g.lineWidth = 2; g.setLineDash([5, 4]); g.beginPath(); g.arc(x, y, me.rumor.r * sc, 0, 6.28); g.stroke(); g.setLineDash([]); }
      if (me.taxi && (me.taxi.st === 'pickup' || me.taxi.st === 'wait')) { const [x, y] = P(me.taxi.x, me.taxi.y); g.fillStyle = '#ffd21f'; g.strokeStyle = '#000'; g.lineWidth = 2; g.fillRect(x - 7, y - 7, 14, 14); g.strokeRect(x - 7, y - 7, 14, 14); plateText(g, x, y - 18, 'YOUR TAXI', 11, '#ffd21f', true); }
      if (me.cruiser && me.cruiser.s !== 'none' && me.cruiser.s !== 'in') { const [x, y] = P(me.cruiser.x, me.cruiser.y); g.fillStyle = '#3b6bff'; g.strokeStyle = '#fff'; g.lineWidth = 2; g.fillRect(x - 7, y - 7, 14, 14); g.strokeRect(x - 7, y - 7, 14, 14); }
      for (const ev of me.happen || []) {
        const kind = EVENT_KINDS[ev.k];
        if (!kind) continue;
        const [x, y] = P(ev.x, ev.y);
        const ph = (now / 900) % 1;
        g.strokeStyle = kind.color; g.globalAlpha = 1 - ph; g.lineWidth = 2; g.beginPath(); g.arc(x, y, 6 + ph * 14, 0, 6.28); g.stroke(); g.globalAlpha = 1;
        g.fillStyle = kind.color; g.strokeStyle = '#0a0f1d'; g.lineWidth = 2; g.beginPath(); g.arc(x, y, 7, 0, 6.28); g.fill(); g.stroke();
        plateText(g, x, y - 18, kind.label, 11, '#ffffff', true);
        this.hits.push([x, y, 10, { x: ev.x, y: ev.y, label: kind.label }]);
      }
      // the places of the category picked in the panel: numbered pins
      if (hud.mapFilter) {
        g.textAlign = 'center'; g.textBaseline = 'middle';
        hud.mapFilter.forEach((p, i) => {
          const [x, y] = P(p.x, p.y);
          g.fillStyle = '#ffd34a'; g.strokeStyle = '#0a0f1d'; g.lineWidth = 2;
          g.beginPath(); g.arc(x, y, 9, 0, 6.28); g.fill(); g.stroke();
          g.font = `11px ${PIXEL}`; g.fillStyle = '#10131c'; g.fillText(String(i + 1), x, y + 0.5);
          this.hits.push([x, y, 10, p]);
        });
      }
      // other players (positions only reach devs; everyone else gets the list with districts)
      for (const q of hud.plist || []) {
        if (q.me || q.x === undefined) continue;
        const [x, y] = P(q.x, q.y);
        g.fillStyle = q.dead ? '#888' : '#5dff9a'; g.strokeStyle = '#0a0f1d'; g.lineWidth = 2;
        g.beginPath(); g.arc(x, y, 5.5, 0, 6.28); g.fill(); g.stroke();
        plateText(g, x, y - 14, q.n, 11, '#c8ffd8', false);
      }
      if (me.job) { const [x, y] = P(me.job.x, me.job.y); g.fillStyle = '#ffd34a'; g.strokeStyle = '#0a0f1d'; g.lineWidth = 2.5; g.beginPath(); g.arc(x, y, 8, 0, 6.28); g.fill(); g.stroke(); drawIcon(g, 'jobs', x, y - 20, 16); }
      // police / bounty intel (the server already applies the visibility rules)
      for (const r of me.radar || []) {
        const [x, y] = P(r.x, r.y);
        if (r.k === 'search') {
          g.fillStyle = 'rgba(255,60,60,.16)'; g.strokeStyle = '#ff5a5a'; g.lineWidth = 1.5; g.setLineDash([4, 3]);
          g.beginPath(); g.arc(x, y, Math.max(6, r.r * sc), 0, 6.28); g.fill(); g.stroke(); g.setLineDash([]);
          plateText(g, x, y - Math.max(6, r.r * sc) - 10, `LAST SEEN ${'★'.repeat(r.s)}`, 11, '#ff9a9a', true);
        } else if (r.k === 'wanted') {
          g.fillStyle = (now / 200 | 0) % 2 ? '#ff3b3b' : '#3b6bff'; g.beginPath(); g.arc(x, y, 6, 0, 6.28); g.fill();
          g.strokeStyle = '#fff'; g.lineWidth = 1.5; g.stroke();
          plateText(g, x, y - 15, `SUSPECT ${'★'.repeat(r.s)}`, 11, '#ffffff', true);
        } else if (r.k === 'bounty') {
          g.strokeStyle = '#ffc23d'; g.lineWidth = 2; g.beginPath(); g.arc(x, y, Math.max(6, r.r * sc), 0, 6.28); g.stroke();
          plateText(g, x, y - Math.max(6, r.r * sc) - 10, `${r.n} $${r.b}`, 11, '#ffc23d', true);
        } else if (r.k === 'pack') {
          const TT = PACK_TIERS[r.t] || PACK_TIERS[1];
          packIcon(g, x, y, r, 1.6);
          plateText(g, x, y - 20, `YOUR ${TT.name.toUpperCase()} · ${Math.floor(r.s / 60)}:${String(r.s % 60).padStart(2, '0')}`, 11, TT.col, true);
        }
      }
      if (police) for (const d of me.dispatch || []) {
        const [x, y] = P(d.x, d.y);
        const fresh = d.age < 30, pulse = fresh ? 4 + 4 * ((now / 600) % 1) : 0;
        g.globalAlpha = Math.max(0.35, 1 - d.age / 400);
        g.fillStyle = '#ff9a2a'; g.strokeStyle = '#000'; g.lineWidth = 1.5;
        g.beginPath(); g.moveTo(x, y - 7); g.lineTo(x + 6, y + 5); g.lineTo(x - 6, y + 5); g.closePath(); g.fill(); g.stroke();
        if (pulse) { g.strokeStyle = '#ff9a2a'; g.beginPath(); g.arc(x, y, 8 + pulse, 0, 6.28); g.stroke(); }
        plateText(g, x, y + 16, `${d.l} · ${d.age < 60 ? d.age + 's' : Math.round(d.age / 60) + 'm'} ago`, 11, '#ffd0a0', true);
        g.globalAlpha = 1;
      }
      // your waypoint: a pin, its name on a plate
      if (hud.waypoint) {
        const [x, y] = P(hud.waypoint.x, hud.waypoint.y);
        drawIcon(g, 'pin', x, y - 13, 26);
        plateText(g, x, y - 34, hud.waypoint.label, 12, '#ffd34a', true);
      }
    }
    // you: a yellow arrow (pulsing ring)
    const [px, py] = P(cx, cy);
    const ph = (now / 1100) % 1;
    g.strokeStyle = `rgba(255,211,74,${(0.7 * (1 - ph)).toFixed(3)})`; g.lineWidth = 2; g.beginPath(); g.arc(px, py, 10 + ph * 16, 0, 6.28); g.stroke();
    g.save(); g.translate(px, py); g.rotate(heading);
    g.fillStyle = '#ffd34a'; g.strokeStyle = '#10131c'; g.lineWidth = 2.5; g.lineJoin = 'round';
    g.beginPath(); g.moveTo(13, 0); g.lineTo(-8, -9); g.lineTo(-3, 0); g.lineTo(-8, 9); g.closePath(); g.stroke(); g.fill();
    g.restore();
    // a pad picks with the cross in the middle
    if (opts.cross) {
      const x = cw / 2, y = ch / 2;
      g.strokeStyle = '#10131c'; g.lineWidth = 4; g.beginPath(); g.moveTo(x - 12, y); g.lineTo(x + 12, y); g.moveTo(x, y - 12); g.lineTo(x, y + 12); g.stroke();
      g.strokeStyle = '#ffffff'; g.lineWidth = 2; g.beginPath(); g.moveTo(x - 11, y); g.lineTo(x + 11, y); g.moveTo(x, y - 11); g.lineTo(x, y + 11); g.stroke();
      g.beginPath(); g.arc(x, y, 7, 0, 6.28); g.stroke();
    }
    // the compass and the scale, bottom right
    compass(g, cw - 34, ch - 40);
    scaleBar(g, cw - 74, ch - 16, sc);
    // the dispatch map's header
    if (police) {
      const n = (me.dispatch || []).length, sus = (me.radar || []).filter((r) => r.k === 'wanted' || r.k === 'search').length;
      plateText(g, cw / 2, 18, `POLICE DISPATCH · ${(me.rank || 'Officer').toUpperCase()} · ${n} report${n === 1 ? '' : 's'} · ${sus} suspect${sus === 1 ? '' : 's'}`, 13, '#9fc4ff', true);
    }
  }
}

// the places worth an icon, the most important first (MAJOR_KINDS in order, then the rest): what a crowded spot shows
let RANKED = null;
function placesByRank(map) {
  if (RANKED && RANKED.map === map) return RANKED.list;
  const skip = iconSkip(map), order = [...MAJOR_KINDS], rank = (k) => { const i = order.indexOf(k); return i < 0 ? 99 : i; };
  const list = map.pois.filter((p) => KIND_ICON[p.kind] && !skip.has(p.id)).sort((a, b) => rank(a.kind) - rank(b.kind) || a.id - b.id);
  RANKED = { map, list };
  return list;
}

// which category a place kind belongs to (the first that lists it)
let KIND_CAT = null;
function catOfKind() {
  if (KIND_CAT) return KIND_CAT;
  KIND_CAT = new Map();
  for (const c of MAP_CATS) for (const k of c.kinds) if (!KIND_CAT.has(k)) KIND_CAT.set(k, c.id);
  return KIND_CAT;
}

// text on a dark plate (rounded, a thin light rim), centred on (x, y); returns its box
function plateText(g, x, y, text, size, col, rim) {
  g.font = `${size}px ${PIXEL}`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  const w = Math.ceil(g.measureText(text).width) + 12, h = size + 9;
  const x0 = Math.round(x - w / 2), y0 = Math.round(y - h / 2);
  g.fillStyle = 'rgba(12,18,34,.86)';
  roundRect(g, x0, y0, w, h, 4); g.fill();
  if (rim) { g.strokeStyle = 'rgba(214,222,240,.55)'; g.lineWidth = 1; roundRect(g, x0 + 0.5, y0 + 0.5, w - 1, h - 1, 4); g.stroke(); }
  g.fillStyle = col; g.fillText(text, x, y + 1);
  return [x0, y0, x0 + w, y0 + h];
}
// text with a dark outline, no plate
function outlined(g, x, y, text, col) {
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 3; g.strokeStyle = 'rgba(8,12,24,.85)'; g.strokeText(text, x, y);
  g.fillStyle = col; g.fillText(text, x, y);
}
// a place's icon on a little dark rounded plate
function iconPlate(g, x, y, icon, size, fill = 'rgba(12,18,34,.88)', rim = 'rgba(224,230,244,.7)') {
  const s = Math.round(size), x0 = Math.round(x - s / 2), y0 = Math.round(y - s / 2);
  g.fillStyle = fill; roundRect(g, x0, y0, s, s, 4); g.fill();
  g.strokeStyle = rim; g.lineWidth = 1.2; roundRect(g, x0 + 0.5, y0 + 0.5, s - 1, s - 1, 4); g.stroke();
  drawIcon(g, icon, x, y, Math.round(s * 0.62));
}
function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r);
  g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  g.lineTo(x + r, y + h); g.quadraticCurveTo(x, y + h, x, y + h - r);
  g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y);
  g.closePath();
}
function compass(g, x, y) {
  g.save();
  g.fillStyle = 'rgba(12,18,34,.8)'; g.beginPath(); g.arc(x, y, 17, 0, 6.28); g.fill();
  g.strokeStyle = 'rgba(224,230,244,.7)'; g.lineWidth = 1.2; g.stroke();
  g.fillStyle = '#ffffff';
  g.beginPath(); g.moveTo(x, y - 13); g.lineTo(x + 4, y); g.lineTo(x - 4, y); g.closePath(); g.fill();
  g.fillStyle = '#8f98b0';
  g.beginPath(); g.moveTo(x, y + 13); g.lineTo(x + 4, y); g.lineTo(x - 4, y); g.closePath(); g.fill();
  g.font = `10px ${PIXEL}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#ffd34a'; g.fillText('N', x, y - 23);
  g.restore();
}
// a scale bar ending at x (its right end), in metres (32 px = 1 m)
function scaleBar(g, x, y, sc) {
  const pxPerM = 32 * sc;
  const nice = [10, 20, 50, 100, 200, 500, 1000, 2000].find((m) => m * pxPerM >= 46) || 2000;
  const w = nice * pxPerM;
  g.save();
  g.fillStyle = 'rgba(12,18,34,.75)'; roundRect(g, x - w - 10, y - 13, w + 20, 20, 4); g.fill();
  g.strokeStyle = '#ffffff'; g.lineWidth = 2;
  g.beginPath(); g.moveTo(x - w, y - 2); g.lineTo(x - w, y + 2); g.lineTo(x, y + 2); g.lineTo(x, y - 2); g.stroke();
  g.font = `10px ${PIXEL}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#ffffff';
  g.fillText(nice >= 1000 ? `${nice / 1000} km` : `${nice} m`, x - w / 2, y - 6);
  g.restore();
}
