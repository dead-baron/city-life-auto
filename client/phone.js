// The in-game phone: find places (nearest of each kind, read from the shared map), browse the
// job board (deliveries priced $ / $$ / $$$ by distance, farm harvests, police patrols), take
// or cancel your one job, and set a waypoint. The Bounties app (server/systems/bounties.js): the
// contracts out, taking one, and putting a bounty on someone who keeps killing you. It lives in the
// overlay system, so a controller navigates it like every other menu.
import { JOB_TIERS } from '../shared/rules.js';
import { DISTRICTS } from '../shared/map.js';
import { TILE, MAP_W } from '../shared/constants.js';
// the district a place is in, by name (as the paused tour's districtAt: kept here so the tour stays out of the page)
const districtAt = (map, x, y) => { const d = map.dist[Math.floor(y / TILE) * MAP_W + Math.floor(x / TILE)]; return DISTRICTS[d] ? DISTRICTS[d].name : null; };

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Place finder categories -> POI kinds (labels say what you'd go there for)
export const PLACE_GROUPS = [
  { id: 'emergency', icon: '✚', title: 'Hospitals & police', kinds: ['hospital', 'police'] },
  { id: 'money', icon: '$', title: 'Banks & ATMs', kinds: ['bank', 'atm'] },
  { id: 'shops', icon: '🛒', title: 'Shops', kinds: ['convenience', 'gasstation', 'gunshop', 'sports', 'hardware', 'pharmacy', 'coffee', 'grocery', 'clothing', 'barber', 'tackle'] },
  { id: 'out', icon: '🎡', title: 'Food, drink & days out', kinds: ['winery', 'clubhouse', 'roadhouse', 'market', 'fruitstand', 'farmstand', 'snack', 'ride', 'race', 'bowling', 'cinema'] },
  { id: 'sell', icon: '⇄', title: 'Sell stuff', kinds: ['pawn', 'fence', 'fishmarket', 'tackle', 'winery', 'market', 'fruitstand', 'farmstand', 'salvage'] },
  { id: 'cars', icon: '🔧', title: 'Cars & boats', kinds: ['garage', 'dealer', 'marina', 'rental'] },
  { id: 'work', icon: '💼', title: 'Work & law', kinds: ['warehouse', 'farm', 'courthouse'] },
  { id: 'gang', icon: '☠', title: 'Gang headquarters', kinds: ['gang', 'smuggler'] },
];
const KIND_NOTE = {
  hospital: 'heal up', police: 'badge, evidence', bank: 'deposit / withdraw', atm: 'deposit / withdraw', gunshop: 'guns & ammo', sports: 'bats, fishing',
  hardware: 'melee tools', pharmacy: 'med kits', coffee: 'stamina', grocery: 'produce drop-off', clothing: 'clothes, fitting room', barber: 'haircuts', pawn: 'buy & sell gear',
  fence: 'black market', fishmarket: 'sell fish, rods', tackle: 'rods, bait, sell fish', paint: 'respray & lose the heat', garage: 'repair, respray', dealer: 'buy cars', marina: 'buy boats', rental: 'hire a boat or jet ski', warehouse: 'courier jobs',
  farm: 'harvest jobs', convenience: 'snacks, drinks, bandages', gasstation: 'snacks, drinks, bandages', courthouse: 'bounties', gang: 'syndicate turf / join the gang', smuggler: 'members only - boat to the Rock', charter: 'deep-sea charters (boat)',
  winery: 'wine tasting; buys grapes', clubhouse: 'the clubhouse bar', roadhouse: 'biker roadhouse: beer, rye; the clubs hang out', market: 'bread, fruit, honey; buys fruit', fruitstand: 'fruit, cider; pick your own', farmstand: 'honey, lemonade; buys honey',
  snack: 'hot dogs, lemonade', salvage: 'buys scrap', ride: 'rides', race: 'races: pull up to the start', bowling: 'ten-pin bowling: rent a lane', cinema: 'the pictures: tickets & popcorn',
};

const FEED_ICON = { snatch: '👜', drop: '📦', shootout: '💥', robbery: '🚨', arrest: '🚓', bounty: '🎯', wanted: '★', pet: '🐾', fight: '👊', faint: '🚑', wallet: '👛', streetrace: '🏁', copchase: '🚓', armored: '🚚' };

export function createPhone(ctx) {
  // ctx: { map(), pos(), isCop(), send(obj), setWaypoint(wp|null), waypoint(), toast(text, tone), refocus() }
  let screen = 'home', group = null, board = null, feed = null, bty = null, transit = null;
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
          <button class="ph-app bty" data-go="bounties"><b>💀</b>Bounties</button>
          <button class="ph-app" data-go="transit"><b>🚌</b>Transit</button>
          <button class="ph-app" data-act="dance"><b>💃</b>Dance</button>
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
    } else if (screen === 'bounties') {
      el.innerHTML = bountiesHtml();
    } else if (screen === 'transit') {
      el.innerHTML = transitHtml();
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
    for (const b of el.querySelectorAll('[data-go]')) b.onclick = () => { screen = b.dataset.go; if (screen === 'jobs') ctx.send({ t: 'phone', a: 'board' }); if (screen === 'feed') { feed = null; ctx.send({ t: 'phone', a: 'feed' }); } if (screen === 'bounties') ctx.send({ t: 'phone', a: 'bounties' }); if (screen === 'transit') ctx.send({ t: 'phone', a: 'transit' }); render(); };
    for (const b of el.querySelectorAll('[data-stop]')) b.onclick = () => {
      const [l, k] = b.dataset.stop.split(':').map(Number);
      const L = transit && transit.lines.find((q) => q.id === l), st = L && L.stops[k];
      if (!st) return;
      ctx.setWaypoint({ x: st.x, y: st.y, label: `${L.name}: ${st.n}` });
      ctx.toast(`Waypoint: the ${L.name} stop at ${st.n}`, 'info');
      ctx.close();
    };
    for (const b of el.querySelectorAll('[data-pier]')) b.onclick = () => {
      const [r, k] = b.dataset.pier.split(':').map(Number);
      const R = transit && (transit.ferries || []).find((q) => q.id === r), pr = R && R.piers[k];
      if (!pr) return;
      const name = `${k ? R.island : R.mainland} pier`;
      ctx.setWaypoint({ x: pr.x, y: pr.y, label: `${R.name}: ${name}` });
      ctx.toast(`Waypoint: the ${R.name} at ${name}`, 'info');
      ctx.close();
    };
    for (const b of el.querySelectorAll('[data-act="dance"]')) b.onclick = () => { ctx.send({ t: 'phone', a: 'dance' }); ctx.close(); };   // (dance where you stand: the next move each time - server dance.js; G / L3 too)
    for (const b of el.querySelectorAll('[data-act="taxicall"]')) b.onclick = () => { b.disabled = true; ctx.send({ t: 'phone', a: 'taxi', op: 'call' }); };
    for (const b of el.querySelectorAll('[data-act="taxicancel"]')) b.onclick = () => { b.disabled = true; ctx.send({ t: 'phone', a: 'taxi', op: 'cancel' }); };
    for (const b of el.querySelectorAll('[data-rail]')) b.onclick = () => {
      const st = ctx.map().rail && ctx.map().rail.stations[Number(b.dataset.rail)];
      if (!st) return;
      ctx.setWaypoint({ x: st.x, y: st.y, label: st.name });
      ctx.toast(`Waypoint: ${st.name}`, 'info');
      ctx.close();
    };
    for (const b of el.querySelectorAll('[data-btake]')) b.onclick = () => { b.disabled = true; ctx.send({ t: 'phone', a: 'btake', id: b.dataset.btake }); };
    for (const b of el.querySelectorAll('[data-bplace]')) b.onclick = () => { const [pid, amt] = b.dataset.bplace.split(':'); b.disabled = true; ctx.send({ t: 'phone', a: 'bplace', pid, amt: Number(amt) }); };
    for (const b of el.querySelectorAll('[data-bseen]')) b.onclick = () => {
      const c = bty && bty.list.find((q) => q.id === b.dataset.bseen);
      if (!c || !c.seen) return;
      ctx.setWaypoint({ x: c.seen.x, y: c.seen.y, label: `${c.name} - last seen` });
      ctx.toast(`Waypoint: round where ${c.name} was last seen (${c.seen.d})`, 'info');
      ctx.close();
    };
    for (const b of el.querySelectorAll('[data-act="court"]')) b.onclick = () => {
      const me = ctx.pos();
      const ct = ctx.map().pois.filter((p) => p.kind === 'courthouse').sort((a, q) => Math.hypot(a.x - me.x, a.y - me.y) - Math.hypot(q.x - me.x, q.y - me.y))[0];
      if (!ct) return;
      ctx.setWaypoint({ x: ct.x, y: ct.y, label: ct.label });
      ctx.toast(`Waypoint set: ${ct.label}`, 'info');
      ctx.close();
    };
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

  // ---- the Transit app -----------------------------------------------------------------------------------------------
  // The bus lines (server transit.js): each line's stops in the order its buses call at them, when the next bus comes to
  // each (the nearest stop starred), and the railway's nearest stations. Tap a stop or a station for a waypoint.
  const eta = (s) => (s === null || s === undefined ? 'no bus out' : s < 20 ? 'arriving' : s < 90 ? `${s}s` : `${Math.round(s / 60)} min`);
  function transitHtml() {
    let h = '<h3>Transit</h3>';
    if (!transit) return h + '<p class="ph-empty">Loading…</p>';
    // a taxi: call one (or hail one going by), or how yours is getting on
    const tx = transit.taxi;
    h += '<h3>🚕 Taxi</h3>' + (tx
      ? `<div class="ph-card">${tx.st === 'pickup' ? `Your taxi is on its way (about ${Math.max(5, tx.eta)}s) - the yellow square on your map.` : tx.st === 'wait' ? 'Your taxi is waiting at the kerb - get in the back.' : tx.st === 'dest' ? 'Where to? Set a waypoint (Places, or tap the map).' : tx.st === 'ride' ? `On the way to ${esc(tx.to)}: ${tx.m} m, $${tx.fare} so far.` : `There: $${tx.fare}.`}${tx.st === 'pickup' || tx.st === 'wait' ? '<button data-act="taxicancel">Cancel the taxi</button>' : ''}</div>`
      : `<button class="ph-row" data-act="taxicall"><span class="ic">🚕</span><span class="nm">Call a taxi<small>$${transit.taxiFlag} + $${transit.taxiKm} a km, paid when you get out · or hail one going by</small></span></button>`)
      + '<p class="ph-hint">Your waypoint is where the driver takes you. Skip the ride on the way for the whole fare.</p>';
    h += `<h3>🚌 Buses</h3><p class="ph-hint">Wait at a stop and board the bus when it pulls up. Free, any distance. Get off at any stop with the vehicle key. Tap a stop for a waypoint.</p>`;
    let near = null, nd = Infinity;
    for (const L of transit.lines) L.stops.forEach((st, k) => { const d = dist(st); if (d < nd) { nd = d; near = `${L.id}:${k}`; } });
    for (const L of transit.lines) {
      h += `<h3><span class="ph-line" style="background:${esc(L.col)}"></span>${esc(L.name)} <small>${L.buses.length} bus${L.buses.length === 1 ? '' : 'es'} · ${L.stops.length} stops</small></h3>`;
      h += L.stops.map((st, k) => `<button class="ph-row" data-stop="${L.id}:${k}"><span class="ic">${near === `${L.id}:${k}` ? '★' : '•'}</span><span class="nm">${esc(st.n)}<small>next bus: ${eta(st.eta)}</small></span><span class="d">${m(dist(st))}</span></button>`).join('');
    }
    if (!transit.lines.length) h += '<p class="ph-empty">No bus lines in this city.</p>';
    // the ferries to the islands: each route's two piers, when its boat next leaves each (tap one for a waypoint)
    const fr = transit.ferries || [];
    if (fr.length) {
      h += `<h3>⛴ Ferries</h3><p class="ph-hint">Walk aboard at the pier while the boat is in. On the car ferry, drive up to its stern and interact to take your car across. Free. Tap a pier for a waypoint.</p>`;
      const when = (s, inHere) => (inHere ? `in now · leaves in ${s}s` : s < 90 ? `next boat leaves in ${s}s` : `next boat leaves in ${Math.round(s / 60)} min`);
      for (const R of fr) {
        h += `<h3>${esc(R.name)} <small>${R.car ? 'cars and foot passengers' : 'foot passengers'} · ${m(R.len)}</small></h3>`;
        h += R.piers.map((pr, k) => `<button class="ph-row" data-pier="${R.id}:${k}"><span class="ic">⚓</span><span class="nm">${esc(k ? R.island : R.mainland)} pier<small>${R.leaves ? when(R.leaves[k], R.boat && R.boat.in === k) : 'no boat running'}</small></span><span class="d">${m(dist(pr))}</span></button>`).join('');
      }
    }
    const rail = ctx.map().rail;
    if (rail) {
      const sts = rail.stations.map((st, i) => ({ st, i, d: dist(st) })).sort((a, b) => a.d - b.d).slice(0, 3);
      h += '<h3>🚆 Railway</h3><p class="ph-hint">Trains run the whole loop round the city; walk onto a stopped train at any station. Free.</p>'
        + sts.map(({ st, i, d }) => `<button class="ph-row" data-rail="${i}"><span class="ic">≡</span><span class="nm">${esc(st.name)}<small>${st.under ? 'underground' : 'platform'}</small></span><span class="d">${m(d)}</span></button>`).join('');
    }
    return h;
  }

  // ---- the Bounties app ----------------------------------------------------------------------------------------------
  const money = (n) => '$' + Math.round(n).toLocaleString('en-US');
  const mins = (s) => (s >= 3600 ? `${Math.floor(s / 3600)} h ${Math.round((s % 3600) / 60)} min` : `${Math.max(1, Math.round(s / 60))} min`);
  const ago = (s) => (s < 45 ? 'just now' : s < 3600 ? `${Math.round(s / 60)} min ago` : s < 86400 ? `${Math.round(s / 3600)} h ago` : `${Math.round(s / 86400)} days ago`);
  function bountiesHtml() {
    if (!bty) return '<h3>Bounties</h3><p class="ph-empty">Loading…</p>';
    const list = bty.list || [];
    const onMe = list.filter((c) => c.me), mine = list.filter((c) => c.own && !c.me), board = list.filter((c) => !c.me && !c.own);
    let h = '<h3>Bounties</h3>';
    // someone who keeps killing you: put a price on their head
    for (const r of bty.revenge || []) {
      h += `<div class="ph-card bty-rev"><b>${esc(r.name)} keeps killing you.</b> Put a price on their head: your own money from the bank, held in escrow. It's paid only to a hunter who gets them, and comes back to you if nobody does.<small>${r.has ? 'You have a bounty out on them already.' : `${mins(r.left)} left to decide · bank ${money(bty.bank)}`}</small>`
        + (r.has ? '' : `<div class="ph-amts">${bty.amounts.map((a) => `<button data-bplace="${esc(r.pid)}:${a}"${bty.bank < a || bty.wanted ? ' disabled' : ''}>${money(a)}</button>`).join('')}</div>${bty.wanted ? '<small>Not while you\'re wanted.</small>' : ''}`)
        + '</div>';
    }
    const clock = (c) => (c.on ? `${mins(c.left)} left` : `${mins(c.left)} left · clock stopped while they're away`);
    if (onMe.length) h += `<div class="ph-card bty-me"><b>💀 On your head: ${money(onMe.reduce((n, c) => n + c.amount, 0))}</b>${onMe.map((c) => `<small>${money(c.amount)} from ${esc(c.by)} · ${clock(c)} · ${c.takers ? `${c.takers} hunter${c.takers === 1 ? '' : 's'} on it` : 'no hunter on it yet'}</small>`).join('')}<small>The clock only runs while you're out in the city - hiding at home or logging off stops it.</small></div>`;
    if (mine.length) h += '<h3>Your bounties out</h3>' + mine.map((c) => `<div class="ph-card bty-own"><b>${esc(c.name)}</b> <span class="amt">${money(c.amount)}</span><small>${clock(c)} · ${c.takers ? `${c.takers} hunter${c.takers === 1 ? '' : 's'} on it` : 'no hunter on it yet'}</small></div>`).join('');
    h += '<h3>Contracts</h3>' + (bty.hunter
      ? '<p class="ph-hint">Take one and its target shows on your radar while they\'re out in the city. Kill, arrest or detain them (knock them down, then walk up) to collect.</p>'
      : `<p class="ph-hint">Contracts are for licensed bounty hunters (${bty.need}+ Samaritan, not wanted) and officers on duty. Register at the courthouse.</p><button class="ph-row" data-act="court"><span class="ic">⚖</span><span class="nm">Courthouse<small>set a waypoint</small></span></button>`);
    h += board.length ? board.map((c) => `<div class="ph-card bty"><b>${esc(c.name)}</b> <span class="amt">${money(c.amount)}</span>`
      + `<small>Wearing: ${esc(c.desc)}</small>`
      + `<small>${c.seen ? `Last seen: ${esc(c.seen.d || 'out of town')}, ${ago(c.seen.ago)}` : 'Not seen yet'}${c.on ? '' : ' · away right now'}</small>`
      + `<small>${clock(c)} · ${c.takers ? `${c.takers} hunter${c.takers === 1 ? '' : 's'} on it` : 'nobody on it yet'}</small>`
      + (c.mine ? `<em>✓ Your contract</em>${c.seen ? `<button data-bseen="${esc(c.id)}">📍 Head for where they were last seen</button>` : ''}`
        : `<button data-btake="${esc(c.id)}"${bty.hunter && !bty.wanted ? '' : ' disabled'}>🎯 Take the contract</button>`)
      + '</div>').join('') : '<p class="ph-empty">No bounties out right now.</p>';
    return h;
  }

  return {
    open() { screen = 'home'; group = null; render(); ctx.send({ t: 'phone', a: 'board' }); },
    // straight to one app (the hub's JOBS tab: 'jobs')
    openApp(s) { screen = s || 'home'; group = null; render(); if (s === 'jobs' || !s) ctx.send({ t: 'phone', a: 'board' }); },
    back() { if (screen === 'group') screen = 'places'; else screen = 'home'; render(); return true; },
    onFeed(msg) { feed = msg.items || []; if (screen === 'feed') render(); },
    onTransit(msg) { transit = msg; if (screen === 'transit') render(); },
    onBounties(msg) {
      bty = msg;
      if (msg.err) ctx.toast(msg.err, 'warn');
      if (screen === 'bounties') render();
    },
    onBoard(msg) {
      board = msg;
      if (msg.err) ctx.toast(msg.err, 'warn');
      if (msg.ok) { ctx.close(); return; } // the server's own message confirms the job
      if (screen === 'jobs' || screen === 'home') render();
    },
    get screen() { return screen; },
  };
}
