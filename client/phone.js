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
  { id: 'shops', icon: '🛒', title: 'Shops', kinds: ['convenience', 'gasstation', 'gunshop', 'sports', 'hardware', 'pharmacy', 'coffee', 'grocery', 'clothing', 'tackle'] },
  { id: 'out', icon: '🎡', title: 'Food, drink & days out', kinds: ['winery', 'clubhouse', 'market', 'fruitstand', 'farmstand', 'snack', 'ride', 'race'] },
  { id: 'sell', icon: '⇄', title: 'Sell stuff', kinds: ['pawn', 'fence', 'fishmarket', 'tackle', 'winery', 'market', 'fruitstand', 'farmstand', 'salvage'] },
  { id: 'cars', icon: '🔧', title: 'Cars & boats', kinds: ['garage', 'dealer', 'marina', 'rental'] },
  { id: 'work', icon: '💼', title: 'Work & law', kinds: ['warehouse', 'farm', 'courthouse'] },
  { id: 'gang', icon: '☠', title: 'Gang headquarters', kinds: ['gang', 'smuggler'] },
];
const KIND_NOTE = {
  hospital: 'heal up', police: 'badge, evidence', bank: 'deposit / withdraw', atm: 'deposit / withdraw', gunshop: 'guns & ammo', sports: 'bats, fishing',
  hardware: 'melee tools', pharmacy: 'med kits', coffee: 'stamina', grocery: 'produce drop-off', clothing: 'new outfit / disguise', pawn: 'buy & sell gear',
  fence: 'black market', fishmarket: 'sell fish, rods', tackle: 'rods, bait, sell fish', paint: 'respray & lose the heat', garage: 'repair, respray', dealer: 'buy cars', marina: 'buy boats', rental: 'hire a boat or jet ski', warehouse: 'courier jobs',
  farm: 'harvest jobs', convenience: 'snacks, drinks, bandages', gasstation: 'snacks, drinks, bandages', courthouse: 'bounties', gang: 'syndicate turf / join the gang', smuggler: 'members only - boat to the Rock', charter: 'deep-sea charters (boat)',
  winery: 'wine tasting; buys grapes', clubhouse: 'the clubhouse bar', market: 'bread, fruit, honey; buys fruit', fruitstand: 'fruit, cider; pick your own', farmstand: 'honey, lemonade; buys honey',
  snack: 'hot dogs, lemonade', salvage: 'buys scrap', ride: 'rides', race: 'races: pull up to the start',
};

const FEED_ICON = { snatch: '👜', drop: '📦', shootout: '💥', robbery: '🚨', arrest: '🚓', bounty: '🎯', wanted: '★' };

export function createPhone(ctx) {
  // ctx: { map(), pos(), isCop(), send(obj), setWaypoint(wp|null), waypoint(), toast(text, tone), refocus() }
  let screen = 'home', group = null, board = null, feed = null;
  const dist = (p) => { const me = ctx.pos(); return Math.hypot(p.x - me.x, p.y - me.y); };
  const m = (d) => `${Math.round(d / 32)}m`; // 1 tile = 1 m, same scale as the event arrows

  function render() {
    const el = $('ph-screen');
    $('ph-back').classList.toggle('hidden', screen === 'home');
    if (screen === 'home') {
      const wp = ctx.waypoint();
      const job = board && board.job;
      // crimes you saw (server law.js sawCrime): a minute to call each one in
      const saw = (board && board.saw) || [];
      el.innerHTML = `
        ${saw.map((q) => `<div class="ph-card saw"><b>You saw: ${esc(q.label)}</b> by ${esc(q.name)}<small>${esc(q.desc)}</small>${q.done ? '<em>Called in</em>' : `<button data-report="${q.id}">📞 Call it in (${q.left}s)</button>`}</div>`).join('')}
        <div class="ph-apps">
          <button class="ph-app" data-go="places"><b>📍</b>Places</button>
          <button class="ph-app" data-go="jobs"><b>💼</b>Jobs${ctx.isCop() ? ' & patrols' : ''}</button>
          <button class="ph-app atm" data-act="atm"><b>$</b>Nearest ATM</button>
          <button class="ph-app" data-go="feed"><b>📰</b>City feed</button>
          ${wp ? '<button class="ph-app" data-act="clearwp"><b>✕</b>Clear waypoint</button>' : ''}
        </div>
        ${wp ? `<div class="ph-card">Waypoint: <b>${esc(wp.label)}</b> · ${m(dist(wp))}</div>` : ''}
        ${job ? `<div class="ph-card job">Current job: <b>${esc(job.text)}</b><button data-act="cancel">Cancel job</button></div>` : ''}`;
    } else if (screen === 'places') {
      el.innerHTML = '<h3>Find a place</h3>' + PLACE_GROUPS.map((g) => `<button class="ph-row" data-group="${g.id}"><span class="ic">${g.icon}</span>${g.title}</button>`).join('');
    } else if (screen === 'group') {
      const g = PLACE_GROUPS.find((q) => q.id === group);
      const map = ctx.map();
      // (a place with more than one counter - the market's rows of stalls - is listed once, at the nearest)
      const pois = map.pois.filter((p) => g.kinds.includes(p.kind)).map((p) => ({ p, d: dist(p) })).sort((a, b) => a.d - b.d)
        .filter((q, i, all) => !all.slice(0, i).some((o) => o.p.label === q.p.label && Math.hypot(o.p.x - q.p.x, o.p.y - q.p.y) < 640));
      el.innerHTML = `<h3>${g.title}</h3>` + (pois.length ? pois.map(({ p, d }, i) =>
        `<button class="ph-row" data-poi="${p.id}"><span class="ic">${i === 0 ? '★' : '•'}</span><span class="nm">${esc(p.label)}<small>${esc(KIND_NOTE[p.kind] || '')} · ${esc(districtAt(map, p.x, p.y) || '')}</small></span><span class="d">${m(d)}</span></button>`).join('') : '<p class="ph-empty">None in the city yet.</p>');
    } else if (screen === 'feed') {
      const ago = (s) => (s < 60 ? `${s}s ago` : `${Math.round(s / 60)} min ago`);
      el.innerHTML = '<h3>City feed</h3><p class="ph-hint">What\'s going on anywhere in the city. Tap one to set a waypoint.</p>' + (!feed ? '<p class="ph-empty">Loading…</p>'
        : feed.length ? feed.map((f, i) => `<button class="ph-row feed ${esc(f.kind)}" data-feed="${i}"${f.x === null ? ' disabled' : ''}><span class="ic">${FEED_ICON[f.kind] || '•'}</span><span class="nm">${esc(f.text)}<small>${esc(f.where || 'the city')} · ${ago(f.ago)}</small></span><span class="d">${f.x === null ? '' : m(dist(f))}</span></button>`).join('')
          : '<p class="ph-empty">Quiet out there right now.</p>');
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
    for (const b of el.querySelectorAll('[data-go]')) b.onclick = () => { screen = b.dataset.go; if (screen === 'jobs') ctx.send({ t: 'phone', a: 'board' }); if (screen === 'feed') { feed = null; ctx.send({ t: 'phone', a: 'feed' }); } render(); };
    for (const b of el.querySelectorAll('[data-feed]')) b.onclick = () => {
      const f = feed && feed[Number(b.dataset.feed)];
      if (!f || f.x === null) return;
      ctx.setWaypoint({ x: f.x, y: f.y, label: f.text });
      ctx.toast(`Waypoint set: ${f.text}`, 'info');
      ctx.close();
    };
    for (const b of el.querySelectorAll('[data-act="atm"]')) b.onclick = () => {
      // the nearest cash machine (a bank counter does the same job)
      const me = ctx.pos();
      let best = null, bd = Infinity;
      for (const p of ctx.map().pois) { if (p.kind !== 'atm' && p.kind !== 'bank') continue; const d = Math.hypot(p.x - me.x, p.y - me.y); if (d < bd) { bd = d; best = p; } }
      if (!best) { ctx.toast('No ATM anywhere near.', 'warn'); return; }
      ctx.setWaypoint({ x: best.x, y: best.y, label: best.kind === 'atm' ? 'Nearest ATM' : best.label, atm: true });
      ctx.toast(`Nearest ATM: ${m(bd)} away - follow the green $`, 'good');
      ctx.close();
    };
    for (const b of el.querySelectorAll('[data-group]')) b.onclick = () => { group = b.dataset.group; screen = 'group'; render(); };
    for (const b of el.querySelectorAll('[data-poi]')) b.onclick = () => {
      const p = ctx.map().pois[Number(b.dataset.poi)];
      ctx.setWaypoint({ x: p.x, y: p.y, label: p.label });
      ctx.toast(`Waypoint set: ${p.label}`, 'info');
      ctx.close();
    };
    for (const b of el.querySelectorAll('[data-take]')) b.onclick = () => ctx.send({ t: 'phone', a: 'take', id: b.dataset.take });
    for (const b of el.querySelectorAll('[data-report]')) b.onclick = () => { b.disabled = true; ctx.send({ t: 'phone', a: 'report', id: b.dataset.report }); };
    for (const b of el.querySelectorAll('[data-act="cancel"]')) b.onclick = () => ctx.send({ t: 'phone', a: 'cancel' });
    for (const b of el.querySelectorAll('[data-act="clearwp"]')) b.onclick = () => { ctx.setWaypoint(null); render(); };
  }

  return {
    open() { screen = 'home'; group = null; render(); ctx.send({ t: 'phone', a: 'board' }); },
    back() { if (screen === 'group') screen = 'places'; else screen = 'home'; render(); return true; },
    onFeed(msg) { feed = msg.items || []; if (screen === 'feed') render(); },
    onBoard(msg) {
      board = msg;
      if (msg.err) ctx.toast(msg.err, 'warn');
      if (msg.ok) { ctx.close(); return; } // the server's own message confirms the job
      if (screen === 'jobs' || screen === 'home') render();
    },
    get screen() { return screen; },
  };
}
