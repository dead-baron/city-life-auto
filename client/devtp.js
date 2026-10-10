// Debug teleport: every district (grouped by island) and the landmarks - the stations, the scene
// paintings - on a little city map and as a list. Tap a dot or a name to go there. Each place gets
// a spot you can stand on, worked out once from the map: the open pavement nearest the middle of
// the district (or open ground where it has no streets).
import { T, TILE, MAP_W, MAP_H } from '../shared/constants.js';
import { DISTRICTS, ISLANDS } from '../shared/map.js';
import { MAP_FRAME } from './hud.js';

const PAVED = new Set([T.SIDEWALK, T.PLAZA]);
const OPEN = new Set([T.LOT, T.GRASS, T.SAND, T.DIRT, T.DOCK, T.FIELD]);
let cache = null;

function zoneName(map, x, y) {
  const z = map.zone[map.idx(Math.floor(x / TILE), Math.floor(y / TILE))];
  for (const I of Object.values(ISLANDS)) if (I.zone === z) return I.name;
  return 'Outer islands & the wild';
}

// The standable spot nearest (x, y) among tiles where ok(tile index) holds: paved first, then open ground.
function spotNear(map, x, y, ok) {
  let best = null, bd = Infinity;
  const cx = Math.floor(x / TILE), cy = Math.floor(y / TILE);
  for (let r = 0; r < 160 && !best; r += 4) {
    for (let ty = cy - r; ty <= cy + r; ty++) for (let tx = cx - r; tx <= cx + r; tx++) {
      if (Math.max(Math.abs(tx - cx), Math.abs(ty - cy)) < r - 4 || !map.inside(tx, ty)) continue;
      const i = map.idx(tx, ty), t = map.tiles[i];
      if (!ok(i) || map.deck[i] || !(PAVED.has(t) || OPEN.has(t))) continue;
      const d = Math.hypot(tx - cx, ty - cy) + (PAVED.has(t) ? 0 : 12);
      if (d < bd) { bd = d; best = { x: (tx + 0.5) * TILE, y: (ty + 0.5) * TILE }; }
    }
  }
  return best;
}

export function teleportPlaces(map) {
  if (cache && cache.map === map) return cache.list;
  // district centroids (sampled every 3rd tile), merging districts that share a name
  const acc = new Map();
  for (let ty = Math.ceil(map.y0 / 3) * 3; ty < map.y0 + map.h; ty += 3) for (let tx = Math.ceil(map.x0 / 3) * 3; tx < map.x0 + map.w; tx += 3) {
    const t = map.tiles[map.idx(tx, ty)];
    if (t === T.WATER || t === T.DEEP) continue;
    const d = map.dist[map.idx(tx, ty)];
    const name = DISTRICTS[d] && DISTRICTS[d].name;
    if (!name) continue;
    const a = acc.get(name) || acc.set(name, { ids: new Set(), x: 0, y: 0, n: 0 }).get(name);
    a.ids.add(d); a.x += tx; a.y += ty; a.n++;
  }
  const list = [];
  for (const [name, a] of acc) {
    if (a.n < 6) continue;
    const cx = (a.x / a.n + 0.5) * TILE, cy = (a.y / a.n + 0.5) * TILE;
    const at = spotNear(map, cx, cy, (i) => a.ids.has(map.dist[i]));
    if (!at) continue;
    list.push({ name, group: zoneName(map, at.x, at.y), x: at.x, y: at.y, kind: 'district' });
  }
  for (const st of (map.rail && map.rail.stations) || []) {
    const p = st.kiosk ? { x: st.kiosk.out.x, y: st.kiosk.out.y + 40 } : spotNear(map, st.platform.x, st.platform.y, () => true);
    if (p) list.push({ name: st.name, group: 'Stations', x: p.x, y: p.y, kind: 'station' });
  }
  for (const pt of (map.paintings || []).concat(map.landmarks || [])) {
    if (!pt.name) continue;
    const p = spotNear(map, pt.x + pt.w / 2, pt.y + pt.h / 2, () => true);
    if (p) list.push({ name: pt.name, group: 'Landmarks', x: p.x, y: p.y, kind: 'landmark' });
  }
  const order = [...Object.values(ISLANDS).map((I) => I.name), 'Outer islands & the wild', 'Stations', 'Landmarks'];
  list.sort((a, b) => order.indexOf(a.group) - order.indexOf(b.group) || a.name.localeCompare(b.name));
  cache = { map, list };
  return list;
}

// Fill `box` with the picker: a map with a dot per place, then the places grouped as buttons.
export function buildTeleport(box, map, go) {
  const list = teleportPlaces(map);
  box.innerHTML = '';
  const [fx0, fy0, fx1, fy1] = MAP_FRAME;
  const cv = document.createElement('canvas');
  cv.className = 'dev-tp-map';
  box.appendChild(cv);
  const draw = (img, hover) => {
    const w = Math.min(720, box.clientWidth || 360), h = Math.round(w * (fy1 - fy0) / (fx1 - fx0));
    const dpr = Math.min(2, devicePixelRatio || 1);
    cv.width = w * dpr; cv.height = h * dpr; cv.style.width = w + 'px'; cv.style.height = h + 'px';
    const g = cv.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = '#0b1830'; g.fillRect(0, 0, w, h);
    const sc = w / (fx1 - fx0);
    if (img) { const kx = img.width / (MAP_W * TILE), ky = img.height / (MAP_H * TILE);   // (the world map picture: the whole frame)
      g.drawImage(img, fx0 * kx, fy0 * ky, (fx1 - fx0) * kx, (fy1 - fy0) * ky, 0, 0, w, h); }
    g.font = '600 9px Rubik, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'bottom';
    for (const p of list) {
      const x = (p.x - fx0) * sc, y = (p.y - fy0) * sc, hot = p === hover;
      g.fillStyle = p.kind === 'district' ? '#f2c21b' : p.kind === 'station' ? '#f28c28' : '#7de0ff';
      g.strokeStyle = '#000'; g.lineWidth = 1.5;
      g.beginPath(); g.arc(x, y, hot ? 6 : 4, 0, 6.283); g.fill(); g.stroke();
      if (hot || p.kind === 'district') { g.lineWidth = 3; g.strokeStyle = 'rgba(0,0,0,.85)'; g.strokeText(p.name, x, y - 5); g.fillStyle = hot ? '#fff' : '#ffeaa0'; g.fillText(p.name, x, y - 5); }
    }
    return sc;
  };
  const img = new Image();
  img.onload = () => draw(img);
  // (assets/worldmap.webp is the old world: the teleport map is drawn from the map data until World v2 has its own image)
  requestAnimationFrame(() => draw(img.complete && img.naturalWidth ? img : null));
  const pick = (e) => {
    const r = cv.getBoundingClientRect(), sc = r.width / (fx1 - fx0);
    const wx = fx0 + (e.clientX - r.left) / sc, wy = fy0 + (e.clientY - r.top) / sc;
    let best = null, bd = 22 / sc;
    for (const p of list) { const d = Math.hypot(p.x - wx, p.y - wy); if (d < bd) { bd = d; best = p; } }
    return best;
  };
  cv.onpointermove = (e) => draw(img.complete && img.naturalWidth ? img : null, pick(e));
  cv.onclick = (e) => { const p = pick(e); if (p) go(p); };
  // the list, island by island
  let group = null, row = null;
  for (const p of list) {
    if (p.group !== group) {
      group = p.group;
      const h = document.createElement('div'); h.className = 'dev-tp-group'; h.textContent = group; box.appendChild(h);
      row = document.createElement('div'); row.className = 'dev-tp-row'; box.appendChild(row);
    }
    const b = document.createElement('button');
    b.textContent = p.name;
    b.onclick = () => go(p);
    row.appendChild(b);
  }
}
