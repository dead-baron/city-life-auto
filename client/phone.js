// The in-game phone: find places (nearest of each kind, read from the shared map), browse the
// job board (deliveries priced $ / $$ / $$$ by distance, farm harvests, police patrols), take
// or cancel your one job, and set a waypoint. It lives in the overlay system, so a controller
// navigates it like every other menu.
import { JOB_TIERS } from '../shared/rules.js';
import { districtAt } from '../shared/tutorial.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Place finder categories -> POI kinds (labels say what you'd go there for)
export const PLACE_GROUPS = [
  { id: 'emergency', icon: '✚', title: 'Hospitals & police', kinds: ['hospital', 'police'] },
  { id: 'money', icon: '$', title: 'Banks & ATMs', kinds: ['bank', 'atm'] },
  { id: 'shops', icon: '🛒', title: 'Shops', kinds: ['gunshop', 'sports', 'hardware', 'pharmacy', 'coffee', 'grocery', 'clothing', 'tackle'] },
  { id: 'sell', icon: '⇄', title: 'Sell stuff', kinds: ['pawn', 'fence', 'fishmarket', 'tackle'] },
  { id: 'cars', icon: '🔧', title: 'Cars & boats', kinds: ['garage', 'dealer', 'marina'] },
  { id: 'work', icon: '💼', title: 'Work & law', kinds: ['warehouse', 'farm', 'courthouse'] },
  { id: 'gang', icon: '☠', title: 'Gang headquarters', kinds: ['gang'] },
];
const KIND_NOTE = {
  hospital: 'heal up', police: 'badge, evidence', bank: 'deposit / withdraw', atm: 'deposit / withdraw', gunshop: 'guns & ammo', sports: 'bats, fishing',
  hardware: 'melee tools', pharmacy: 'med kits', coffee: 'stamina', grocery: 'produce drop-off', clothing: 'new outfit / disguise', pawn: 'buy & sell gear',
  fence: 'black market', fishmarket: 'sell fish, rods', tackle: 'rods, bait, sell fish', paint: 'respray & lose the heat', garage: 'repair, respray', dealer: 'buy cars', marina: 'buy boats', warehouse: 'courier jobs',
  farm: 'harvest jobs', courthouse: 'bounties', gang: 'syndicate turf - careful',
};

export function createPhone(ctx) {
  // ctx: { map(), pos(), isCop(), send(obj), setWaypoint(wp|null), waypoint(), toast(text, tone), refocus() }
  let screen = 'home', group = null, board = null;
  const dist = (p) => { const me = ctx.pos(); return Math.hypot(p.x - me.x, p.y - me.y); };
  const m = (d) => `${Math.round(d / 32)}m`; // 1 tile = 1 m, same scale as the event arrows

  function render() {
    const el = $('ph-screen');
    $('ph-back').classList.toggle('hidden', screen === 'home');
    if (screen === 'home') {
      const wp = ctx.waypoint();
      const job = board && board.job;
      el.innerHTML = `
        <div class="ph-apps">
          <button class="ph-app" data-go="places"><b>📍</b>Places</button>
          <button class="ph-app" data-go="jobs"><b>💼</b>Jobs${ctx.isCop() ? ' & patrols' : ''}</button>
          ${wp ? '<button class="ph-app" data-act="clearwp"><b>✕</b>Clear waypoint</button>' : ''}
        </div>
        ${wp ? `<div class="ph-card">Waypoint: <b>${esc(wp.label)}</b> · ${m(dist(wp))}</div>` : ''}
        ${job ? `<div class="ph-card job">Current job: <b>${esc(job.text)}</b><button data-act="cancel">Cancel job</button></div>` : ''}`;
    } else if (screen === 'places') {
      el.innerHTML = '<h3>Find a place</h3>' + PLACE_GROUPS.map((g) => `<button class="ph-row" data-group="${g.id}"><span class="ic">${g.icon}</span>${g.title}</button>`).join('');
    } else if (screen === 'group') {
      const g = PLACE_GROUPS.find((q) => q.id === group);
      const map = ctx.map();
      const pois = map.pois.filter((p) => g.kinds.includes(p.kind)).map((p) => ({ p, d: dist(p) })).sort((a, b) => a.d - b.d);
      el.innerHTML = `<h3>${g.title}</h3>` + (pois.length ? pois.map(({ p, d }, i) =>
        `<button class="ph-row" data-poi="${p.id}"><span class="ic">${i === 0 ? '★' : '•'}</span><span class="nm">${esc(p.label)}<small>${esc(KIND_NOTE[p.kind] || '')} · ${esc(districtAt(map, p.x, p.y) || '')}</small></span><span class="d">${m(d)}</span></button>`).join('') : '<p class="ph-empty">None in the city yet.</p>');
    } else if (screen === 'jobs') {
      if (!board) { el.innerHTML = '<p class="ph-empty">Loading jobs…</p>'; return; }
      const job = board.job;
      const rows = (k) => board.jobs.filter((j) => j.kind === k).sort((a, b) => (a.tier ?? 0) - (b.tier ?? 0) || dist(a) - dist(b));
      const jobRow = (j) => `<button class="ph-row job" data-take="${j.id}"${job ? ' disabled' : ''}><span class="ic tier">${j.kind === 'delivery' ? JOB_TIERS[j.tier].name : j.kind === 'patrol' ? '🚔' : '🌾'}</span><span class="nm">${esc(j.title)}<small>${j.kind === 'delivery' ? `pickup ${m(dist(j))} away · ${Math.round(j.limit / 60)} min limit` : j.kind === 'patrol' ? `${m(dist(j))} away · stop the crime` : `${m(dist(j))} away · 4 boxes`}</small></span><span class="d">$${j.pay}</span></button>`;
      el.innerHTML = (job ? `<div class="ph-card job">On a job: <b>${esc(job.text)}</b><button data-act="cancel">Cancel job</button></div>` : '<p class="ph-hint">One job at a time. Take one and it\'s marked on your map. You can also walk up to the warehouse or farm.</p>')
        + (ctx.isCop() ? '<h3>Patrol calls</h3>' + (rows('patrol').map(jobRow).join('') || '<p class="ph-empty">Quiet right now.</p>') : '')
        + '<h3>Deliveries</h3><p class="ph-hint">$ nearby · $$ across town · $$$ island to island</p>' + rows('delivery').map(jobRow).join('')
        + '<h3>Farm</h3>' + rows('farm').map(jobRow).join('');
    }
    wire(el);
    ctx.refocus();
  }

  function wire(el) {
    for (const b of el.querySelectorAll('[data-go]')) b.onclick = () => { screen = b.dataset.go; if (screen === 'jobs') ctx.send({ t: 'phone', a: 'board' }); render(); };
    for (const b of el.querySelectorAll('[data-group]')) b.onclick = () => { group = b.dataset.group; screen = 'group'; render(); };
    for (const b of el.querySelectorAll('[data-poi]')) b.onclick = () => {
      const p = ctx.map().pois[Number(b.dataset.poi)];
      ctx.setWaypoint({ x: p.x, y: p.y, label: p.label });
      ctx.toast(`Waypoint set: ${p.label}`, 'info');
      ctx.close();
    };
    for (const b of el.querySelectorAll('[data-take]')) b.onclick = () => ctx.send({ t: 'phone', a: 'take', id: b.dataset.take });
    for (const b of el.querySelectorAll('[data-act="cancel"]')) b.onclick = () => ctx.send({ t: 'phone', a: 'cancel' });
    for (const b of el.querySelectorAll('[data-act="clearwp"]')) b.onclick = () => { ctx.setWaypoint(null); render(); };
  }

  return {
    open() { screen = 'home'; group = null; render(); ctx.send({ t: 'phone', a: 'board' }); },
    back() { if (screen === 'group') screen = 'places'; else screen = 'home'; render(); return true; },
    onBoard(msg) {
      board = msg;
      if (msg.err) ctx.toast(msg.err, 'warn');
      if (msg.ok) { ctx.close(); return; } // the server's own message confirms the job
      if (screen === 'jobs' || screen === 'home') render();
    },
    get screen() { return screen; },
  };
}
