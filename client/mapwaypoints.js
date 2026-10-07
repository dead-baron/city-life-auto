// Waypoints from the world map: a side panel of place categories (nearest first), the matching
// places light up on the map, and choosing one - or clicking anywhere on the map - sets your
// waypoint. Built from the shared map data, so new places show up automatically.
import { PLACE_GROUPS } from './phone.js';
import { districtAt } from '../shared/tutorial.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// map categories = the phone's place groups plus homes and fishing spots
export const MAP_GROUPS = [
  ...PLACE_GROUPS,
  { id: 'fishing', icon: '🎣', title: 'Fishing & boats', kinds: ['tackle', 'fishmarket', 'marina', 'rental', 'charter'] },
  { id: 'homes', icon: '⌂', title: 'Homes for sale', kinds: ['home'] },
  { id: 'travel', icon: '✈', title: 'Stations & airports', kinds: ['station', 'airport'] },
];

export const ROLE_ICON = { citizen: '•', criminal: '☠', police: '★', hunter: '◎' };
export const ROLE_NAME = { citizen: 'Citizen', criminal: 'Wanted', police: 'Police', hunter: 'Bounty hunter' };

export function createMapWaypoints(ctx) {
  // ctx: { map(), pos(), setWaypoint(w|null), waypoint(), refocus(), setFilter(list|null), myHomes(), players() }
  let group = null;
  const dist = (p) => { const me = ctx.pos(); return Math.hypot(p.x - me.x, p.y - me.y); };
  const fmt = (d) => `${Math.round(d / 32)}m`;

  function places(g) {
    const map = ctx.map();
    let list = map.pois.filter((p) => g.kinds.includes(p.kind));
    if (g.id === 'homes') {
      const mine = new Set(ctx.myHomes().map((h) => h.id));
      list = list.filter((p) => !mine.has(p.home)).slice(0, 400);
    }
    return list.map((p) => ({ p, d: dist(p) })).sort((a, b) => a.d - b.d)
      .filter((q, i, all) => !all.slice(0, i).some((o) => o.p.label === q.p.label && Math.hypot(o.p.x - q.p.x, o.p.y - q.p.y) < 640))   // (the market's rows of stalls: once)
      .slice(0, g.id === 'homes' ? 12 : 30);
  }

  function render() {
    const el = $('bm-list');
    const wp = ctx.waypoint();
    if (!group) {
      ctx.setFilter(null);
      const mine = ctx.myHomes();
      el.innerHTML = '<h3>Set a waypoint</h3>'
        + (wp ? `<button class="bm-row clear" data-clear="1">✕ Clear waypoint <small>${esc(wp.label)}</small></button>` : '')
        + (mine.length ? `<button class="bm-row" data-mine="1"><span class="ic">⌂</span>My homes</button>` : '')
        + `<button class="bm-row" data-players="1"><span class="ic">👥</span>Players online${ctx.players().length ? ` (${ctx.players().length})` : ''}</button>`
        + MAP_GROUPS.map((g) => `<button class="bm-row" data-group="${g.id}"><span class="ic">${g.icon}</span>${g.title}</button>`).join('')
        + '<p class="bm-hint">…or click / tap anywhere on the map to drop a marker.</p>';
    } else if (group === 'players') {
      // everyone online: name, role and district (devs also get their spot on the map)
      ctx.setFilter(null);
      const ps = ctx.players();
      el.innerHTML = `<button class="bm-row back" data-back="1">◀ Players online (${ps.length})</button>`
        + (ps.length ? ps.map((q, i) => `<button class="bm-row" data-pl="${i}"${q.x === undefined ? ' disabled' : ''}><span class="ic">${q.me ? '★' : ROLE_ICON[q.r] || '•'}</span><span class="nm">${esc(q.n)}${q.me ? ' (you)' : ''}${q.dm ? ' [dev]' : ''}<small>${esc(ROLE_NAME[q.r] || '')}${q.w ? ' ' + '★'.repeat(q.w) : ''}${q.d ? ' · ' + esc(q.d) : ''}</small></span></button>`).join('') : '<p class="bm-hint">Just you.</p>');
      el.querySelectorAll('[data-pl]').forEach((b) => { b.onclick = () => { const q = ps[Number(b.dataset.pl)]; if (q && q.x !== undefined) { ctx.setWaypoint({ x: q.x, y: q.y, label: q.n }); render(); } }; });
    } else {
      const list = group === 'mine'
        ? ctx.myHomes().map((h) => ({ p: { id: -1, x: h.x, y: h.y, label: h.name, home: h.id }, d: dist(h) }))
        : places(MAP_GROUPS.find((q) => q.id === group));
      ctx.setFilter(list.map(({ p }) => p));
      const title = group === 'mine' ? 'My homes' : MAP_GROUPS.find((q) => q.id === group).title;
      el.innerHTML = `<button class="bm-row back" data-back="1">◀ ${esc(title)}</button>`
        + (list.length ? list.map(({ p, d }, i) => `<button class="bm-row" data-i="${i}"><span class="ic">${i + 1}</span><span class="nm">${esc(p.label)}<small>${esc(districtAt(ctx.map(), p.x, p.y) || '')}</small></span><span class="d">${fmt(d)}</span></button>`).join('') : '<p class="bm-hint">None in the city.</p>');
      el.querySelectorAll('[data-i]').forEach((b) => { b.onclick = () => { const { p } = list[Number(b.dataset.i)]; ctx.setWaypoint({ x: p.x, y: p.y, label: p.label }); render(); }; });
    }
    el.querySelectorAll('[data-group]').forEach((b) => { b.onclick = () => { group = b.dataset.group; render(); }; });
    el.querySelectorAll('[data-mine]').forEach((b) => { b.onclick = () => { group = 'mine'; render(); }; });
    el.querySelectorAll('[data-players]').forEach((b) => { b.onclick = () => { group = 'players'; render(); }; });
    el.querySelectorAll('[data-back]').forEach((b) => { b.onclick = () => { group = null; render(); }; });
    el.querySelectorAll('[data-clear]').forEach((b) => { b.onclick = () => { ctx.setWaypoint(null); render(); }; });
    ctx.refocus();
  }

  return {
    open() { group = null; render(); },
    back() { if (group) { group = null; render(); return true; } return false; },
    refresh: render,
    refreshPlayers() { if (group === 'players' || !group) render(); },
    get inGroup() { return !!group; },
  };
}
