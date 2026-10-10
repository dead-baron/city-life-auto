// Debug homes (the owner, 2026-10-10: "maybe a map you can open up and see all the homes available so that we can test
// them out"): every home on the map - a dot each on a little map of the land, coloured by kind, and a list grouped by
// kind (mansions, houses, apartments, shacks) with its district name and price. Tap one to go to its door (the server's
// dev command 'home', op 'go': server/dev.js devHome). Loaded only when the debug menu's "Every home" is pressed; it
// opens (or closes again) under the Homes section's buttons.
import { T, TILE, MAP_W, MAP_H } from '../shared/constants.js';
import { MAP_FRAME } from './hud.js';

// (the town's kinds first; the estates - farmhouses, cottages, beach houses... - after, whatever kinds the map has)
const KINDS = [['mansion', 'Mansions', '#ff7de9'], ['house', 'Houses', '#f2c21b'], ['apartment', 'Apartments', '#7de0ff'], ['shack', 'Shacks', '#c8a070']];
const ESTATE_COL = '#9dff7d';
const PLURAL = { beach: 'Beach houses', cottage: 'Creekside cottages', farmhouse: 'Farmhouses' };   // (shared/map.js ESTATE_TYPES)
const colOf = (k) => (KINDS.find((q) => q[0] === k) || [0, 0, ESTATE_COL])[2];
let land = null;   // the land as a little picture (one pixel per 4 tiles), drawn once per map

function landOf(map) {
  if (land && land.map === map) return land.cv;
  const s = 4, w = Math.ceil(MAP_W / s), h = Math.ceil(MAP_H / s), cv = document.createElement('canvas');   // (the world's whole frame: the picture is the world's)
  cv.width = w; cv.height = h;
  const g = cv.getContext('2d'), img = g.createImageData(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const t = map.inside(x * s, y * s) ? map.tiles[map.idx(x * s, y * s)] : T.DEEP, o = (y * w + x) * 4;
    const c = t === T.WATER || t === T.DEEP ? [11, 24, 48] : t === T.ROAD || t === T.BRIDGE ? [70, 72, 80] : t === T.BUILDING || t === T.WALL ? [52, 54, 62] : [34, 58, 38];
    img.data[o] = c[0]; img.data[o + 1] = c[1]; img.data[o + 2] = c[2]; img.data[o + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  land = { map, cv };
  return cv;
}

export function showHomes(map, go) {
  const body = document.querySelector('#dev .dev-sec-body:not(.hidden)');
  if (!body) return;
  const old = body.querySelector('.dev-homes');
  if (old) { old.remove(); return; }   // (pressed again: closed)
  const box = document.createElement('div'); box.className = 'dev-homes';
  body.appendChild(box);
  const homes = (map.homes || []).map((h, i) => ({ h, i }));
  const head = document.createElement('div'); head.className = 'dev-tp-group';
  head.textContent = `${homes.length} homes · tap one to go to its door`;
  box.appendChild(head);
  // the map
  const [fx0, fy0, fx1, fy1] = MAP_FRAME;
  const cv = document.createElement('canvas'); cv.className = 'dev-tp-map';
  box.appendChild(cv);
  const draw = (hover) => {
    const w = Math.min(720, box.clientWidth || 360), h = Math.round(w * (fy1 - fy0) / (fx1 - fx0)), dpr = Math.min(2, devicePixelRatio || 1);
    cv.width = w * dpr; cv.height = h * dpr; cv.style.width = w + 'px'; cv.style.height = h + 'px';
    const g = cv.getContext('2d'), sc = w / (fx1 - fx0), L = landOf(map), k = L.width / (MAP_W * TILE);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.imageSmoothingEnabled = false;
    g.drawImage(L, fx0 * k, fy0 * k, (fx1 - fx0) * k, (fy1 - fy0) * k, 0, 0, w, h);
    for (const q of homes) {
      const x = (q.h.x - fx0) * sc, y = (q.h.y - fy0) * sc, hot = q === hover;
      g.fillStyle = colOf(q.h.kind); g.strokeStyle = '#000'; g.lineWidth = 1;
      g.beginPath(); g.arc(x, y, hot ? 5 : q.h.kind === 'mansion' ? 3.5 : 2.5, 0, 6.283); g.fill(); g.stroke();
    }
    if (hover) {
      const x = (hover.h.x - fx0) * sc, y = (hover.h.y - fy0) * sc;
      g.font = '600 10px Rubik, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'bottom';
      g.lineWidth = 3; g.strokeStyle = 'rgba(0,0,0,.85)'; g.strokeText(hover.h.name, x, y - 6); g.fillStyle = '#fff'; g.fillText(hover.h.name, x, y - 6);
    }
  };
  const pick = (e) => {
    const r = cv.getBoundingClientRect(), sc = r.width / (fx1 - fx0);
    const wx = fx0 + (e.clientX - r.left) / sc, wy = fy0 + (e.clientY - r.top) / sc;
    let best = null, bd = 14 / sc;
    for (const q of homes) { const d = Math.hypot(q.h.x - wx, q.h.y - wy); if (d < bd) { bd = d; best = q; } }
    return best;
  };
  requestAnimationFrame(() => draw(null));
  cv.onpointermove = (e) => draw(pick(e));
  cv.onclick = (e) => { const q = pick(e); if (q) go(q.i); };
  // the list, kind by kind (by name within each)
  const others = [...new Set(homes.map((q) => q.h.kind))].filter((k) => !KINDS.some((q) => q[0] === k)).sort();
  for (const [kind, title] of [...KINDS, ...others.map((k) => [k, PLURAL[k] || `${k[0].toUpperCase()}${k.slice(1)}s`])]) {
    const of = homes.filter((q) => q.h.kind === kind).sort((a, b) => a.h.name.localeCompare(b.h.name, 'en', { numeric: true }));
    if (!of.length) continue;
    const g = document.createElement('div'); g.className = 'dev-tp-group'; g.textContent = `${title} (${of.length})`;
    box.appendChild(g);
    const row = document.createElement('div'); row.className = 'dev-tp-row';
    box.appendChild(row);
    for (const q of of) {
      const b = document.createElement('button');
      b.textContent = `${q.h.name} · $${Math.round((q.h.price || 0) / 1000)}k`;
      b.title = `Home ${q.i + 1}: ${q.h.kind}, $${(q.h.price || 0).toLocaleString('en-US')}, ${q.h.slots || 0} parking`;
      b.onclick = () => go(q.i);
      row.appendChild(b);
    }
  }
}
