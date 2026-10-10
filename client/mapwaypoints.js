// The world map's side panel (the UI concept U7): MAP, the place categories with a box each that shows or hides
// their icons on the map (pick a category's name for its places, nearest first - picking one sets your waypoint),
// your waypoint, the transit legend, zoom, Set Waypoint (where the cross is, on a pad), your homes and who's online.
// Built from the shared map data, so new places show up by themselves. client/worldmap.js draws the map itself.
import { DISTRICTS } from '../shared/map.js';
import { TILE, MAP_W } from '../shared/constants.js';
// the district a place is in, by name (as the paused tour's districtAt: kept here so the tour stays out of the page)
const districtAt = (map, x, y) => { const d = map.dist[Math.floor(y / TILE) * MAP_W + Math.floor(x / TILE)]; return DISTRICTS[d] ? DISTRICTS[d].name : null; };
import { iconImg } from './pixicons.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// the categories: [id, icon, title, place kinds] (a kind goes in the first that lists it)
export const MAP_CATS = [
  { id: 'shops', icon: 'shop', title: 'Shops', kinds: ['convenience', 'gasstation', 'gunshop', 'sports', 'hardware', 'pharmacy', 'grocery', 'clothing', 'tackle', 'pawn', 'fishmarket', 'butcher', 'lodge', 'barber'] },
  { id: 'jobs', icon: 'jobs', title: 'Jobs', kinds: ['warehouse', 'farm', 'courthouse', 'salvage', 'huntcamp', 'trapper'] },
  { id: 'services', icon: 'services', title: 'Services', kinds: ['hospital', 'police', 'bank', 'atm', 'garage', 'paint', 'dealer'] },
  { id: 'transit', icon: 'transit', title: 'Transit', kinds: ['station', 'airport', 'marina', 'rental', 'charter'] },
  { id: 'homes', icon: 'home', title: 'Safehouses', kinds: ['home'] },
  { id: 'fun', icon: 'activity', title: 'Activities', kinds: ['ride', 'race', 'clubhouse', 'roadhouse', 'winery', 'market', 'fruitstand', 'farmstand', 'snack', 'club', 'coffee', 'bowling', 'cinema'] },
  { id: 'gangs', icon: 'skull', title: 'Gangs', kinds: ['gang', 'smuggler', 'fence'] },
];
// each kind's icon (client/pixicons.js)
export const KIND_ICON = {
  convenience: 'shop', gasstation: 'fuel', gunshop: 'gun', sports: 'activity', hardware: 'services', pharmacy: 'pharmacy', grocery: 'shop',
  clothing: 'shirt', tackle: 'fish', pawn: 'shop', fishmarket: 'fish', butcher: 'shop', lodge: 'tent', barber: 'shirt',
  warehouse: 'jobs', farm: 'farm', courthouse: 'jobs', salvage: 'services', huntcamp: 'tent', trapper: 'tent',
  hospital: 'hospital', police: 'police', bank: 'bank', atm: 'bank', garage: 'car', paint: 'car', dealer: 'car',
  station: 'transit', airport: 'plane', marina: 'anchor', rental: 'anchor', charter: 'anchor',
  home: 'home', ride: 'star', race: 'car', clubhouse: 'activity', roadhouse: 'bar', winery: 'bar', market: 'shop', fruitstand: 'shop', farmstand: 'shop', snack: 'food',
  club: 'bar', coffee: 'food', gang: 'skull', smuggler: 'skull', fence: 'skull', bowling: 'activity', cinema: 'activity',
};
// shown zoomed all the way out; the rest (the corner shops, the ATMs) once zoomed in
export const MAJOR_KINDS = new Set(['hospital', 'police', 'bank', 'gunshop', 'station', 'airport', 'garage', 'paint', 'dealer', 'clothing', 'farm', 'warehouse',
  'courthouse', 'marina', 'ride', 'race', 'clubhouse', 'roadhouse', 'gang', 'smuggler', 'winery', 'club', 'pawn', 'fence', 'salvage', 'huntcamp', 'lodge', 'bowling', 'cinema']);

export const ROLE_ICON = { citizen: '•', criminal: '☠', police: '★', hunter: '◎' };
export const ROLE_NAME = { citizen: 'Citizen', criminal: 'Wanted', police: 'Police', hunter: 'Bounty hunter' };

const KEY = 'cla.mapcats';
function loadCats() {
  try { const v = JSON.parse(localStorage.getItem(KEY) || 'null'); if (Array.isArray(v)) return new Set(v); } catch { /* private mode */ }
  return new Set(MAP_CATS.map((c) => c.id).filter((id) => id !== 'homes'));
}

export function createMapWaypoints(ctx) {
  // ctx: { map(), pos(), setWaypoint(w|null), waypoint(), refocus(), setFilter(list|null), myHomes(), players(), transit(),
  //        police(), zoom(k), findMe(), markHere(), device() }
  let group = null;
  const cats = loadCats();
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify([...cats])); } catch { /* private mode */ } };
  const dist = (p) => { const me = ctx.pos(); return Math.hypot(p.x - me.x, p.y - me.y); };
  const fmt = (d) => (d >= 1000 * 32 ? `${(d / 32000).toFixed(1)} km` : `${Math.round(d / 32)} m`);

  function places(g) {
    const map = ctx.map();
    let list = map.pois.filter((p) => g.kinds.includes(p.kind));
    if (g.id === 'homes') {
      const mine = new Set(ctx.myHomes().map((h) => h.id));
      list = list.filter((p) => !mine.has(p.home));
    }
    return list.map((p) => ({ p, d: dist(p) })).sort((a, b) => a.d - b.d)
      .filter((q, i, all) => !all.slice(0, i).some((o) => o.p.label === q.p.label && Math.hypot(o.p.x - q.p.x, o.p.y - q.p.y) < 640))   // (the market's rows of stalls: once)
      .slice(0, g.id === 'homes' ? 12 : 30);
  }
  const padGlyph = (b, label) => (ctx.device() === 'gamepad' ? `<span class="g-pad pad-${b.toLowerCase()}">${b}</span> ` : '') + label;

  function legend() {
    const T = ctx.transit();
    const rows = [];
    for (const L of (T && T.lines) || []) rows.push(`<div class="lg"><i class="ln" style="background:${esc(L.col)}"></i>${esc(L.name)}</div>`);
    rows.push('<div class="lg"><i class="ln rail"></i>Railway</div>');
    if (T && T.ferries && T.ferries.length) rows.push('<div class="lg"><i class="ln ferry"></i>Ferry route</div>');
    rows.push('<div class="lg"><i class="dot"></i>Bus stop</div>');
    rows.push(`<div class="lg">${iconImg('anchor', 14)}Ferry pier</div>`);
    return `<div class="bm-legend">${rows.join('')}</div>`;
  }

  function render() {
    const el = $('bm-list');
    const wp = ctx.waypoint();
    if (!group) {
      ctx.setFilter(null);
      const mine = ctx.myHomes(), ps = ctx.players();
      el.innerHTML = `<h2 class="bm-title">${ctx.police() ? 'DISPATCH' : 'MAP'}</h2>`
        + (wp ? `<div class="bm-wp">${iconImg('pin', 18)}<span>${esc(wp.label)}<small>${fmt(dist(wp))}</small></span><button class="bm-x" data-clear="1" title="Clear the waypoint">${iconImg('close', 12)}</button></div>` : '')
        + '<div class="bm-cats">' + MAP_CATS.map((c) => `<div class="bm-cat"><button class="bm-catname" data-group="${c.id}">${iconImg(c.icon, 20)}<span>${c.title}</span></button><button class="bm-check${cats.has(c.id) ? ' on' : ''}" data-toggle="${c.id}" title="Show on the map" aria-pressed="${cats.has(c.id)}"></button></div>`).join('') + '</div>'
        + legend()
        + `<div class="bm-zoomrow"><button class="bm-zb" data-zoom="-1" title="Zoom out">${iconImg('minus', 6)}</button><button class="bm-zb" data-zoom="1" title="Zoom in">${iconImg('plus', 14)}</button><span>Zoom</span><button class="bm-zb me" data-me="1" title="Find me">${iconImg('find', 18)}</button></div>`
        + `<button class="bm-setwp" data-mark="1">${padGlyph('Y', 'Set Waypoint')}</button>`
        + '<div class="bm-more">'
        + (mine.length ? `<button class="bm-row" data-mine="1">${iconImg('home', 16)}My homes (${mine.length})</button>` : '')
        + `<button class="bm-row" data-players="1">${iconImg('people', 16)}Players online${ps.length ? ` (${ps.length})` : ''}</button>`
        + '</div>';
    } else if (group === 'players') {
      // everyone online: name, role and district (devs also get their spot on the map)
      ctx.setFilter(null);
      const ps = ctx.players();
      el.innerHTML = `<button class="bm-row back" data-back="1">◀ Players online (${ps.length})</button>`
        + (ps.length ? ps.map((q, i) => `<button class="bm-row" data-pl="${i}"${q.x === undefined ? ' disabled' : ''}><span class="ic">${q.me ? '★' : ROLE_ICON[q.r] || '•'}</span><span class="nm">${esc(q.n)}${q.me ? ' (you)' : ''}${q.dm ? ' [dev]' : ''}<small>${esc(ROLE_NAME[q.r] || '')}${q.w ? ' ' + '★'.repeat(q.w) : ''}${q.d ? ' · ' + esc(q.d) : ''}</small></span></button>`).join('') : '<p class="bm-hint">Just you.</p>');
      el.querySelectorAll('[data-pl]').forEach((b) => { b.onclick = () => { const q = ps[Number(b.dataset.pl)]; if (q && q.x !== undefined) { ctx.setWaypoint({ x: q.x, y: q.y, label: q.n }); render(); } }; });
    } else {
      const g = MAP_CATS.find((q) => q.id === group);
      const list = group === 'mine'
        ? ctx.myHomes().map((h) => ({ p: { id: -1, x: h.x, y: h.y, label: h.name, home: h.id }, d: dist(h) }))
        : places(g);
      ctx.setFilter(list.map(({ p }) => p));
      const title = group === 'mine' ? 'My homes' : g.title;
      el.innerHTML = `<button class="bm-row back" data-back="1">◀ ${esc(title)}</button>`
        + (list.length ? list.map(({ p, d }, i) => `<button class="bm-row" data-i="${i}"><span class="ic">${i + 1}</span><span class="nm">${esc(p.label)}<small>${esc(districtAt(ctx.map(), p.x, p.y) || '')}</small></span><span class="d">${fmt(d)}</span></button>`).join('') : '<p class="bm-hint">None in the city.</p>');
      el.querySelectorAll('[data-i]').forEach((b) => { b.onclick = () => { const { p } = list[Number(b.dataset.i)]; ctx.setWaypoint({ x: p.x, y: p.y, label: p.label }); render(); }; });
    }
    el.querySelectorAll('[data-group]').forEach((b) => { b.onclick = () => { group = b.dataset.group; render(); }; });
    el.querySelectorAll('[data-toggle]').forEach((b) => { b.onclick = () => toggle(b.dataset.toggle); });
    el.querySelectorAll('[data-mine]').forEach((b) => { b.onclick = () => { group = 'mine'; render(); }; });
    el.querySelectorAll('[data-players]').forEach((b) => { b.onclick = () => { group = 'players'; render(); }; });
    el.querySelectorAll('[data-back]').forEach((b) => { b.onclick = () => { group = null; render(); }; });
    el.querySelectorAll('[data-clear]').forEach((b) => { b.onclick = () => { ctx.setWaypoint(null); render(); }; });
    el.querySelectorAll('[data-zoom]').forEach((b) => { b.onclick = () => ctx.zoom(Number(b.dataset.zoom) > 0 ? 1.6 : 1 / 1.6); });
    el.querySelectorAll('[data-me]').forEach((b) => { b.onclick = () => ctx.findMe(); });
    el.querySelectorAll('[data-mark]').forEach((b) => { b.onclick = () => { ctx.markHere(); render(); }; });
    ctx.refocus();
  }
  function toggle(id) {
    if (cats.has(id)) cats.delete(id); else cats.add(id);
    save();
    const b = $('bm-list').querySelector(`[data-toggle="${id}"]`);
    if (b) { b.classList.toggle('on', cats.has(id)); b.setAttribute('aria-pressed', cats.has(id)); }
  }

  return {
    open() { group = null; render(); },
    back() { if (group) { group = null; render(); return true; } return false; },
    refresh: render,
    refreshPlayers() { if (group === 'players') render(); },
    // the transit legend, when the lines come in (in place: the panel's focus stays where it is)
    refreshLegend() { const el = $('bm-list').querySelector('.bm-legend'); if (el) el.outerHTML = legend(); },
    toggle,
    cats,
    get inGroup() { return !!group; },
  };
}
