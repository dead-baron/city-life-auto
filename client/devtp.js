// Debug teleport: every district (grouped by island), every station of every line, the landmarks and scene paintings,
// and World v3's handcrafted districts' own places and sights - as a list and as dots on a little map of the world.
// Press one to go there: the server picks the open pavement nearest it (server/dev.js tpSpot - the page holds only a
// window of World v3's world, so it can't look at a far place's ground itself).
// Everything here comes from what the page holds of the whole world (the index's lists: shared/regionpack.js): the
// districts' middles (map.mids), the rail loops, the landmarks, the plans' records (map.world3hand) - never the window's
// tiles or buildings, which only cover where you are (the bug the owner hit, 2026-10-17: only the nearby districts
// listed, and none of World v3's places).
import { TILE } from '../shared/constants.js';
import { DISTRICTS } from '../shared/mapcore.js';
import { mapFrameOf, districtCentroids, drawMini } from './hud.js';

let cache = null;
const OUTER = 'Outer islands & the wild';

export function teleportPlaces(map) {
  if (cache && cache.map === map) return cache.list;
  const list = [], have = new Set();
  const add = (name, group, x, y, kind) => {
    if (!name || !Number.isFinite(x) || !Number.isFinite(y)) return;
    const k = `${group}|${name}`;
    if (have.has(k)) return;
    have.add(k); list.push({ name, group, x, y, kind });
  };
  // the districts: their middles (merged where districts share a name), grouped by island
  const by = new Map();
  for (const c of districtCentroids(map)) {
    const a = by.get(c.name) || by.set(c.name, { x: 0, y: 0, n: 0 }).get(c.name);
    a.x += c.x; a.y += c.y; a.n++;
  }
  for (const [name, a] of by) {
    const D = DISTRICTS.find((q) => q && q.name === name);
    add(name, D && D.isl ? D.isl : OUTER, a.x / a.n, a.y / a.n, 'district');
  }
  // the stations: every line's (World v3 runs a loop per line - map.rail is only the first)
  for (const r of map.rails || (map.rail ? [map.rail] : [])) for (const st of (r && r.stations) || []) {
    const p = st.kiosk && st.kiosk.out ? { x: st.kiosk.out.x, y: st.kiosk.out.y + 40 } : st.platform ? st.platform : st;
    add(st.name, 'Stations', p.x, p.y, 'station');
  }
  for (const pt of (map.paintings || []).concat(map.landmarks || [])) if (pt && pt.name) add(pt.name, 'Landmarks', pt.x + (pt.w || 0) / 2, pt.y + (pt.h || 0) / 2, 'landmark');
  // World v3's handcrafted districts (shared/world3-hand.js buildHand: map.world3hand, a record per plan): the places each
  // plan named - its squares, parks, markets - then its sights (the set pieces and the key businesses, at their doors)
  const v3 = [];
  for (const H of Object.values(map.world3hand || {})) {
    if (!H || !H.rect || !DISTRICTS[H.d]) continue;
    const dn = DISTRICTS[H.d].name, g = `${dn} · places`, gs = `${dn} · buildings`;
    v3.push(g, gs);
    for (const pl of H.places || []) add(pl.name, g, ((pl.x0 + pl.x1) / 2) * TILE, ((pl.y0 + pl.y1) / 2) * TILE, 'v3');
    for (const s of H.sights || []) add(s.name, gs, s.x, s.y, 'v3shop');
  }
  const isles = [...new Set(list.filter((p) => p.kind === 'district').map((p) => p.group))].filter((g) => g !== OUTER).sort();
  const order = [...v3, ...isles, OUTER, 'Stations', 'Landmarks'];
  list.sort((a, b) => order.indexOf(a.group) - order.indexOf(b.group) || a.name.localeCompare(b.name));
  cache = { map, list, groups: order.filter((g) => list.some((p) => p.group === g)) };
  return list;
}
export function teleportGroups(map) { teleportPlaces(map); return cache.groups; }

// a little map of the world with a dot per place (the minimap's picture under it when the HUD has one): tap a dot to
// go there; `only` the places to dot (the list shown), `hot` the one to ring
export function teleportMap(cv, map, places, { mini = null, go, width = 360 } = {}) {
  const [fx0, fy0, fx1, fy1] = mapFrameOf(map);
  let hover = null;
  const draw = () => {
    const w = Math.max(160, Math.round(width)), h = Math.round(w * (fy1 - fy0) / (fx1 - fx0)), dpr = Math.min(2, devicePixelRatio || 1);
    cv.width = w * dpr; cv.height = h * dpr; cv.style.width = w + 'px'; cv.style.height = h + 'px';
    const g = cv.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = '#0b1830'; g.fillRect(0, 0, w, h);
    if (mini) { g.imageSmoothingEnabled = false; drawMini(g, mini, fx0 / TILE, fy0 / TILE, (fx1 - fx0) / TILE, (fy1 - fy0) / TILE, 0, 0, w, h); g.fillStyle = 'rgba(6,12,24,.35)'; g.fillRect(0, 0, w, h); }
    const sc = w / (fx1 - fx0);
    g.font = '600 10px Rubik, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'bottom';
    for (const p of places) {
      const x = (p.x - fx0) * sc, y = (p.y - fy0) * sc, hot = p === hover;
      g.fillStyle = p.kind === 'district' ? '#f2c21b' : p.kind === 'station' ? '#f28c28' : p.kind === 'v3' || p.kind === 'v3shop' ? '#ff6ad5' : '#7de0ff';
      g.strokeStyle = '#000'; g.lineWidth = 1.5;
      g.beginPath(); g.arc(x, y, hot ? 6 : 3.5, 0, 6.283); g.fill(); g.stroke();
      if (hot || (p.kind === 'district' && places.length < 80)) { g.lineWidth = 3; g.strokeStyle = 'rgba(0,0,0,.85)'; g.strokeText(p.name, x, y - 5); g.fillStyle = hot ? '#fff' : '#ffeaa0'; g.fillText(p.name, x, y - 5); }
    }
  };
  const pick = (e) => {
    const r = cv.getBoundingClientRect(), sc = r.width / (fx1 - fx0);
    const wx = fx0 + (e.clientX - r.left) / sc, wy = fy0 + (e.clientY - r.top) / sc;
    let best = null, bd = 24 / sc;
    for (const p of places) { const d = Math.hypot(p.x - wx, p.y - wy); if (d < bd) { bd = d; best = p; } }
    return best;
  };
  cv.onpointermove = (e) => { const p = pick(e); if (p !== hover) { hover = p; draw(); } };
  cv.onpointerleave = () => { if (hover) { hover = null; draw(); } };
  cv.onclick = (e) => { const p = pick(e); if (p) go(p); };
  draw();
  return { ring(p) { hover = p; draw(); } };
}
