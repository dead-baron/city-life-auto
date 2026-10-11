// The real-estate app on the phone (H65; server/systems/realestate.js works out the list): the homes for sale - where
// (the district and how well-to-do it is), the price, the kind, the bedrooms, the parking, the yard, a picture of the
// plan - a waypoint to each, and your own homes with what they're worth. Loaded the first time the app opens (the
// page's start-up code only has its button: client/phone.js), so it costs the page nothing until then.
import { layout } from '../shared/homelayout.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const money = (n) => '$' + Math.round(n).toLocaleString('en-US');
const TIER = { lux: 'upscale', mid: 'middling', low: 'modest', rough: 'rough end' };
const SORTS = [['near', 'Nearest'], ['cheap', 'Cheapest'], ['dear', 'Priciest']];
const KINDS = [['all', 'All'], ['apartment', 'Apartments'], ['house', 'Houses'], ['big', 'Big'], ['cheap', 'Under $15k']];

// ---- the plan's picture: the rooms from above, a few pixels a tile (made once a plan and furnishing) -------------------
const FLOOR = { '.': '#b08a5e', c: '#8f6276', t: '#cdd6da', g: '#8e8e8e', '+': '#a07c52' };
const WALL = { '#': '#262b35', '=': '#8fc6e8', D: '#e08a3c', R: '#5c6470' };
const PIECE = { B: '#5d7fd8', W: '#7a5230', S: '#3b3b3b', F: '#eef2f3', H: '#6fc3df', A: '#9c6b3c', Y: '#c0392b', K: '#9ea3a8', T: '#8b5a2b', C: '#8a5a9a', V: '#1d1d1d', L: '#fafafa', N: '#dcdcdc', O: '#a0522d', Q: '#5d4037', P: '#3c9a40' };
const pics = new Map();
function planPic(plan, tier) {
  const k = plan + ':' + tier;
  if (pics.has(k)) return pics.get(k);
  let url = '';
  try {
    const L = layout(plan, tier), px = 5;
    const cv = document.createElement('canvas');
    cv.width = L.cols * px; cv.height = L.rows * px;
    const g = cv.getContext('2d');
    for (let ty = 0; ty < L.rows; ty++) for (let tx = 0; tx < L.cols; tx++) {
      const ch = L.cell(tx, ty);
      g.fillStyle = WALL[ch] || FLOOR[ch] || FLOOR['.'];
      g.fillRect(tx * px, ty * px, px, px);
    }
    for (const q of L.pieces) { g.fillStyle = PIECE[q.ch] || '#777'; g.fillRect(q.tx * px + 1, q.ty * px + 1, q.tw * px - 2, q.th * px - 2); }
    url = cv.toDataURL();
  } catch (e) { url = ''; }
  pics.set(k, url);
  return url;
}

let style = false;
function addStyle() {
  if (style) return;
  style = true;
  const st = document.createElement('style');
  st.textContent = '.re-chips{display:flex;flex-wrap:wrap;gap:4px;margin:4px 0}.re-chips button{padding:3px 8px;border-radius:10px;border:1px solid #4a5568;background:#1c2230;color:#cbd5e1;font-size:12px}.re-chips button.on{background:#2f855a;border-color:#48bb78;color:#fff}'
    + '.re-row{display:flex;gap:8px;align-items:center;width:100%;text-align:left}.re-row img{width:64px;height:auto;max-height:56px;object-fit:contain;image-rendering:pixelated;border-radius:3px;background:#111;flex:none}.re-row .nm{flex:1;min-width:0}.re-row .d{white-space:nowrap;text-align:right}.re-row .d b{display:block;color:#9ae6b4}'
    + '.re-mine{border-left:3px solid #48bb78}';
  document.head.appendChild(st);
}

// the app's screen, drawn into the phone (el) from the server's list (msg: null while it's on its way)
let sort = 'near', kind = 'all';
export function render(el, msg, ctx) {
  addStyle();
  if (msg) { sort = msg.sort || sort; kind = msg.kind || kind; }
  let h = '<h3>🏠 Homes</h3>';
  if (!msg) { el.innerHTML = h + '<p class="ph-empty">Loading…</p>'; return; }
  const where = (r) => `${r.d ? esc(r.d) : 'out of town'}${r.dt ? ` (${TIER[r.dt] || esc(r.dt)})` : ''}`;
  const what = (r) => `${esc(r.w)}${r.u ? ` · unit ${r.u}${r.fl > 1 ? `, floor ${r.fl}` : ', ground floor'}` : ''}`;
  const has = (r) => `${r.beds} bed${r.beds === 1 ? '' : 's'} · ${r.k === 'apartment' ? 'parks' : 'garage'} ${r.g}${r.yard ? ` · yard: ${r.yard} plot${r.yard === 1 ? '' : 's'}` : ''}${r.dock ? ' · boathouse' : ''}`;
  if (msg.mine && msg.mine.length) {
    const worth = msg.mine.reduce((n, r) => n + r.worth, 0);
    h += `<p class="ph-hint">Yours: ${msg.mine.length} home${msg.mine.length === 1 ? '' : 's'}, worth ${money(worth)}.</p>`;
    h += msg.mine.map((r) => `<button class="ph-row re-row re-mine" data-hwp="m${r.id}"><img alt="" src="${planPic(r.pl, r.tr)}"><span class="nm">${esc(r.n)}${r.spawn ? ' ★' : ''}<small>${what(r)} · ${where(r)}</small><small>${has(r)}</small></span><span class="d">worth<b>${money(r.worth)}</b><small>sells ${money(r.back)}</small></span></button>`).join('');
  }
  h += `<h3>For sale <small>${msg.total} of ${msg.homes} homes</small></h3>`;
  h += `<div class="re-chips">${SORTS.map(([k, t]) => `<button data-hsort="${k}" class="${k === sort ? 'on' : ''}">${t}</button>`).join('')}</div>`;
  h += `<div class="re-chips">${KINDS.map(([k, t]) => `<button data-hkind="${k}" class="${k === kind ? 'on' : ''}">${t}</button>`).join('')}</div>`;
  h += '<p class="ph-hint">Tap one for a waypoint. At its door: take a look inside, then buy it at the front door - or straight from the menu. Apartment blocks list their flats in the lobby.</p>';
  h += msg.sale.length ? msg.sale.map((r) => `<button class="ph-row re-row" data-hwp="s${r.id}"><img alt="" src="${planPic(r.pl, r.tr)}"><span class="nm">${esc(r.n)}<small>${what(r)} · ${where(r)}</small><small>${has(r)}</small></span><span class="d"><b>${money(r.p)}</b><small>${Math.round(ctx.dist(r) / 32)}m</small></span></button>`).join('')
    : '<p class="ph-empty">Nothing like that for sale right now.</p>';
  if (msg.matching > msg.sale.length) h += `<p class="ph-hint">… and ${msg.matching - msg.sale.length} more.</p>`;
  el.innerHTML = h;
  for (const b of el.querySelectorAll('[data-hsort]')) b.onclick = () => { sort = b.dataset.hsort; ctx.send({ t: 'phone', a: 'homes', sort, kind }); };
  for (const b of el.querySelectorAll('[data-hkind]')) b.onclick = () => { kind = b.dataset.hkind; ctx.send({ t: 'phone', a: 'homes', sort, kind }); };
  for (const b of el.querySelectorAll('[data-hwp]')) b.onclick = () => {
    const k = b.dataset.hwp, id = Number(k.slice(1));
    const r = (k[0] === 'm' ? msg.mine : msg.sale).find((q) => q.id === id);
    if (!r) return;
    ctx.setWaypoint({ x: r.x, y: r.y, label: r.n });
    ctx.toast(k[0] === 'm' ? `Waypoint: ${r.n}` : `Waypoint: ${r.n} - ${money(r.p)}. At the door: take a look inside.`, 'info');
    ctx.close();
  };
}
