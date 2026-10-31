// The in-game phone, the hub's PHONE tab (UI-3): the job you're on first (what it is, the step, the pay, Show on map,
// Quit job), then every app on one screen as a grid of line icons - no paging - and a row of quick actions apart from
// them. In an app its name is in the header with a 44 px Back. Find places (nearest of each kind, read from the shared
// map), the job board as short cards (what it is, the pay, how far, the first step: client/jobcard.js; one tap to
// accept), the Bounties app (server/systems/bounties.js), the Log of every note in full (client/notelog.js). It lives
// in the overlay system, so a controller navigates it like every other menu.
import { JOB_TIERS } from '../shared/rules.js';
import { DISTRICTS } from '../shared/mapcore.js';
import { TILE } from '../shared/constants.js';
import { jobCardHtml } from './jobcard.js';
import { noteLog, clearLog } from './notelog.js';
const LISTED = new Set(['patrol', 'fire', 'medic', 'drive', 'delivery', 'mail', 'farm']);   // (the job list's own sections; the rest under Work)
// the district a place is in, by name (as the paused tour's districtAt: kept here so the tour stays out of the page)
const districtAt = (map, x, y) => { const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE), d = map.inside(tx, ty) ? map.dist[map.idx(tx, ty)] : -1; return DISTRICTS[d] ? DISTRICTS[d].name : null; };

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Place finder categories -> POI kinds (labels say what you'd go there for)
export const PLACE_GROUPS = [
  { id: 'emergency', icon: '<b class="ic-h">H</b>', title: 'Hospitals & police', kinds: ['hospital', 'police'] },
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
  farm: 'harvest jobs', convenience: 'snacks, drinks, bandages', gasstation: 'snacks, drinks, bandages', courthouse: 'bounties', gang: 'syndicate turf / join the gang', smuggler: 'members only - boat to the Rock', charter: 'deep-sea charters (boat)', sar: 'search & rescue: sign on for rescue shifts',
  winery: 'wine tasting; buys grapes', clubhouse: 'the clubhouse bar', roadhouse: 'biker roadhouse: beer, rye; the clubs hang out', market: 'bread, fruit, honey; buys fruit', fruitstand: 'fruit, cider; pick your own', farmstand: 'honey, lemonade; buys honey',
  snack: 'hot dogs, lemonade', salvage: 'buys scrap', ride: 'rides', race: 'races: pull up to the start', bowling: 'ten-pin bowling: rent a lane', cinema: 'the pictures: tickets & popcorn',
};

const FEED_ICON = { snatch: '👜', drop: '📦', shootout: '💥', robbery: '🚨', arrest: '🚓', bounty: '🎯', wanted: '★', pet: '🐾', fight: '👊', faint: '🚑', wallet: '👛', streetrace: '🏁', copchase: '🚓', armored: '🚚' };

// line icons (24 x 24, the stroke in the text's colour): the apps and the quick actions
const P = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
export const ICON = {
  jobs: P('<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>'),
  places: P('<path d="M12 21s-7-6-7-11a7 7 0 0 1 14 0c0 5-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>'),
  transit: P('<rect x="5" y="3" width="14" height="14" rx="3"/><path d="M5 11h14M8 21l2-4M16 21l-2-4"/>'),
  feed: P('<path d="M4 5h13v14H6a2 2 0 0 1-2-2zM17 9h3v8a2 2 0 0 1-2 2"/><path d="M8 9h5M8 13h5"/>'),
  bounties: P('<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>'),
  homes: P('<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>'),
  skills: P('<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>'),
  crew: P('<circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M3 20a6 6 0 0 1 12 0M14 20a4 4 0 0 1 7 0"/>'),
  log: P('<path d="M4 5h16v11H8l-4 4z"/><path d="M8 9h8M8 12h5"/>'),
  camera: P('<path d="M4 8h4l2-3h4l2 3h4v11H4z"/><circle cx="12" cy="13" r="3.5"/>'),
  atm: P('<rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 9v6M18 9v6"/>'),
  dance: P('<path d="M9 18V6l10-2v12"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="16" r="2"/>'),
  radio: P('<rect x="3" y="8" width="18" height="12" rx="2"/><circle cx="8" cy="14" r="3"/><path d="M14 12h4M14 16h4M6 8l12-5"/>'),
  clear: P('<path d="M6 6l12 12M18 6L6 18"/>'),
  cruiser: P('<path d="M3 15l2-6h14l2 6v4H3z"/><path d="M10 6h4M12 4v2"/><circle cx="7.5" cy="17" r="1.5"/><circle cx="16.5" cy="17" r="1.5"/>'),
};
// the apps, in the grid's order: [screen, name]
const APPS = [['jobs', 'Jobs'], ['places', 'Places'], ['transit', 'Transit'], ['feed', 'City feed'], ['bounties', 'Bounties'], ['homes', 'Homes'], ['skills', 'Skills'], ['crew', 'Crew'], ['radio', 'Radio'], ['log', 'Log'], ['camera', 'Camera']];
const NAME = Object.fromEntries([...APPS, ['group', 'Places'], ['home', 'Phone']]);
// what a job is, by its type (the board's job: server phone.js boardFor)
const JOB_NAME = { courier: 'DELIVERY', farm: 'FARM', fieldwork: 'FARM WORK', patrol: 'PATROL', sar: 'SEARCH & RESCUE', dusting: 'CROP DUSTER', charter: 'CHARTER PILOT', coast: 'COAST GUARD', fire: 'FIREFIGHTER', medic: 'PARAMEDIC', cab: 'TAXI', bus: 'BUS DRIVER', towjob: 'TOW TRUCK', trainjob: 'TRAIN JOB', forklift: 'FORKLIFT', fishboat: 'FISHING BOAT', ranger: 'PARK RANGER' };
export function createPhone(ctx) {
  // ctx: { map(), pos(), isCop(), send(obj), setWaypoint(wp|null), waypoint(), toast(text, tone), refocus() }
  let screen = 'home', group = null, board = null, feed = null, bty = null, transit = null, skl = null, crew = null;
  let homes = null, RE = null, RADIO = null;   // the real-estate app (H65): the server's list, and its code - client/realestate.js, loaded when it opens
  let taking = null;   // the job just accepted: its waypoint once the server says yes
  const dist = (p) => { const me = ctx.pos(); return Math.hypot(p.x - me.x, p.y - me.y); };
  const m = (d) => `${Math.round(d / 32)}m`; // 1 tile = 1 m, same scale as the event arrows

  function render() {
    const el = $('ph-screen');
    $('ph-back').classList.toggle('hidden', screen === 'home');
    $('phone').classList.toggle('at-home', screen === 'home');
    ctx.title?.(NAME[screen === 'group' ? 'group' : screen] || 'Phone');
    if (screen === 'home') {
      const wp = ctx.waypoint();
      // crimes you saw (server law.js sawCrime): a minute to call each one in
      const saw = (board && board.saw) || [];
      const quick = [['atm', 'Nearest ATM'], ['dance', 'Dance']];
      if (ctx.canCruiser && ctx.canCruiser()) quick.push(['cruiser', 'Call a cruiser']);
      if (wp) quick.push(['clearwp', 'Clear waypoint']);
      el.innerHTML = saw.map((q) => `<div class="ph-card saw"><b>You saw: ${esc(q.label)}</b> by ${esc(q.name)}<small>${esc(q.desc)}</small>${q.done ? '<em>Called in</em>' : `<button data-report="${q.id}">📞 Call it in (${q.left}s)</button>`}</div>`).join('')
        + curJob()
        + `<div class="ph-grid">${APPS.map(([k, n]) => `<button class="ph-app" data-go="${k}">${ICON[k]}${n}</button>`).join('')}</div>`
        + `<div class="ph-quick"><small>QUICK</small>${quick.map(([k, n]) => `<button class="btn" data-act="${k === 'atm' ? 'atm' : k === 'clearwp' ? 'clearwp' : k}">${ICON[k === 'clearwp' ? 'clear' : k]}${n}</button>`).join('')}</div>`
        + (wp ? `<p class="ph-hint">Waypoint: <b>${esc(wp.label)}</b> · ${m(dist(wp))}</p>` : '');
    } else if (screen === 'places') {
      el.innerHTML = '<h3>Find a place</h3>' + PLACE_GROUPS.map((g) => `<button class="ph-row" data-group="${g.id}"><span class="ic">${g.icon}</span>${g.title}</button>`).join('');
    } else if (screen === 'group') {
      const g = PLACE_GROUPS.find((q) => q.id === group);
      const map = ctx.map();
      // (a place with more than one counter - the market's rows of stalls - is listed once, at the nearest)
      // (World v3's window: the whole world's places, from the index - map.places)
      const pois = (map.places || map.pois).filter((p) => p && g.kinds.includes(p.kind)).map((p) => ({ p, d: dist(p) })).sort((a, b) => a.d - b.d)
        .filter((q, i, all) => !all.slice(0, i).some((o) => o.p.label === q.p.label && Math.hypot(o.p.x - q.p.x, o.p.y - q.p.y) < 640));
      el.innerHTML = `<h3>${g.title}</h3>` + (pois.length ? pois.map(({ p, d }, i) =>
        `<button class="ph-row" data-poi="${p.id}"><span class="ic">${i === 0 ? '★' : '•'}</span><span class="nm">${esc(p.label)}<small>${esc(KIND_NOTE[p.kind] || '')} · ${esc((DISTRICTS[p.d] && DISTRICTS[p.d].name) || districtAt(map, p.x, p.y) || '')}</small></span><span class="d">${m(d)}</span></button>`).join('') : '<p class="ph-empty">None in the city yet.</p>');
    } else if (screen === 'feed') {
      const ago = (s) => (s < 60 ? `${s}s ago` : `${Math.round(s / 60)} min ago`);
      el.innerHTML = '<h3>City feed</h3><p class="ph-hint">What\'s going on anywhere in the city. Tap one to set a waypoint.</p>' + (!feed ? '<p class="ph-empty">Loading…</p>'
        : feed.length ? feed.map((f, i) => `<button class="ph-row feed ${esc(f.kind)}" data-feed="${i}"${f.x === null ? ' disabled' : ''}><span class="ic">${FEED_ICON[f.kind] || '•'}</span><span class="nm">${esc(f.text)}<small>${esc(f.where || 'the city')} · ${ago(f.ago)}</small></span><span class="d">${f.x === null ? '' : m(dist(f))}</span></button>`).join('')
          : '<p class="ph-empty">Quiet out there right now.</p>');
    } else if (screen === 'skills') {   // (the six skills, levelled by doing things: server skills.js)
      const me = ctx.me && ctx.me(), fel = me ? me.felonies | 0 : 0;
      const standing = me ? `<h3>Standing</h3><div class="ph-stand"><div><b class="good">${me.sam | 0}</b>Samaritan</div><div><b class="warn">${me.cexp | 0}</b>Criminal XP</div><div><b class="${fel ? 'bad' : ''}">${fel}</b>${fel === 1 ? 'Felony' : 'Felonies'} on record</div></div>` : '';   // (UI-8: the standing numbers, off the HUD)
      el.innerHTML = standing + '<h3>Skills</h3><div class="ph-apps"><button class="ph-app" data-act="workout" data-k="pushups"><b>💪</b>Push-ups here</button><button class="ph-app" data-act="workout" data-k="situps"><b>🧘</b>Sit-ups here</button></div>' + (!skl ? '<p class="ph-empty">Loading…</p>' : skl.list.map((k) => `<div class="ph-card skl"><b>${esc(k.name)}</b> level ${k.L} of ${k.max}<small>${esc(k.does)}: +${k.pct}%${k.need ? ` · ${k.xp}/${k.need} to the next` : ''}</small><i style="--w:${k.need ? Math.round(100 * k.xp / k.need) : 100}%"></i></div>`).join('')
        + '<h3>Today</h3><p class="ph-hint">Each counts up to a limit an in-game day - something else for the same skill still counts.</p>'
        + skl.today.map((t) => `<div class="ph-row"><span class="nm">${esc(t.name)}<small>${esc(t.skill)} · ${t.left ? `${t.left} xp left today` : 'done for today'}</small></span></div>`).join(''));
    } else if (screen === 'radio') {   // (the stations: the car radio in a vehicle, else your pocket radio or boombox - server music.js)
      if (!RADIO) { import('./music/stage.js').then((mod) => { RADIO = mod; if (screen === 'radio') render(); }).catch((e) => console.warn('[radio]', e)); el.innerHTML = '<p class="ph-empty">Loading…</p>'; return; }   // (loaded with the page's music: client/music/stage.js)
      const { STATIONS, stationAt, TRACK } = RADIO, now = RADIO.current ? RADIO.current.now() : performance.now() / 1000;
      el.innerHTML = '<p class="ph-hint">In a car: its radio (G flicks through them too). On foot: your pocket radio or boombox, if it\'s out. The record stores sell tapes, radios and boomboxes.</p>'
        + STATIONS.map((S, i) => `<button class="ph-row" data-st="${i}"><span class="ic">📻</span><span class="nm">${esc(S.freq)} ${esc(S.name)}<small>now: ${esc(TRACK[stationAt(i, now).track].title)}</small></span></button>`).join('')
        + '<button class="ph-row" data-st="-1"><span class="ic">⏻</span><span class="nm">Off</span></button>';
    } else if (screen === 'crew') {
      el.innerHTML = crewHtml(crew, m);
    } else if (screen === 'bounties') {
      el.innerHTML = bountiesHtml();
    } else if (screen === 'transit') {
      el.innerHTML = transitHtml();
    } else if (screen === 'homes') {
      if (RE) RE.render(el, homes, { ...ctx, dist });
      else { el.innerHTML = '<p class="ph-empty">Loading…</p>'; import('./realestate.js').then((mod) => { RE = mod; if (screen === 'homes') render(); }).catch((e) => console.warn('[homes]', e)); }
    } else if (screen === 'log') {   // every note in full, newest first (client/notelog.js; the HUD's notes are short)
      const L = noteLog(), ago = (t) => { const q = Math.round((Date.now() - t) / 1000); return q < 60 ? `${q}s ago` : q < 3600 ? `${Math.round(q / 60)} min ago` : `${Math.round(q / 3600)} h ago`; };
      el.innerHTML = L.length ? `<div class="ph-log">${L.map((e) => `<div class="lg-row ${esc(e.tone)}"><i></i><span>${esc(e.text)}${e.n > 1 ? ` ×${e.n}` : ''}<small>${ago(e.at)}</small></span></div>`).join('')}</div><button class="btn" data-act="clearlog">Clear the log</button>`
        : '<p class="ph-empty">Nothing yet. Every note that pops up is kept here in full.</p>';
    } else if (screen === 'jobs') {
      if (!board) { el.innerHTML = '<p class="ph-empty">Loading jobs…</p>'; return; }
      const job = board.job;
      const card = (j) => jobCardHtml(j, { dist: dist(j), busy: !!job, compact: true });
      const sec = (h, list) => (list.length ? `<h3>${h}</h3>` + list.sort((a2, b2) => ((a2.x || a2.y ? dist(a2) : 1e9) - (b2.x || b2.y ? dist(b2) : 1e9))).map(card).join('') : '');
      const J = board.jobs;
      el.innerHTML = curJob() + (job ? '' : '<p class="ph-hint">One job at a time. Accept one and it\'s on your map - or walk up to a hospital, a fire station or a taxi rank.</p>')
        + (ctx.isCop() ? sec('Patrol calls', J.filter((j) => j.kind === 'patrol')) : '')
        + sec('Emergency services', J.filter((j) => j.kind === 'fire' || j.kind === 'medic'))
        + sec('Driving', J.filter((j) => j.kind === 'drive'))
        + sec('Deliveries', J.filter((j) => j.kind === 'delivery' || j.kind === 'mail'))
        + sec('Farm', J.filter((j) => j.kind === 'farm'))
        + sec('Work', J.filter((j) => !j.fly && !LISTED.has(j.kind)))   // (the forklift, the fishing boat, the ranger, a firewood order - and any new kind)
        + sec('Flying and boats', J.filter((j) => j.fly));
    }
    wire(el);
    ctx.refocus();
  }

  // the job you're on (the board's job; the step from your self record): what it is, the step, the pay; Show on map, Quit
  function curJob() {
    const j = board && board.job, live = ctx.job && ctx.job();
    if (!j) return '';
    return `<div class="ph-cur"><div class="ph-cur-top"><span>ON A JOB · ${esc(JOB_NAME[j.type] || String(j.type || '').toUpperCase())}</span>${j.pay ? `<span>$${Math.round(j.pay).toLocaleString('en-US')}</span>` : ''}</div>`
      + `<b>${esc((live && live.text) || j.text)}</b><div class="ph-cur-acts">${live && (live.x || live.y) ? '<button class="btn btn-1" data-act="showjob">Show on map</button>' : ''}<button class="btn btn-x" data-act="cancel">Quit job</button></div></div>`;
  }
  function wire(el) {
    for (const b of el.querySelectorAll('[data-go="camera"]')) b.onclick = () => ctx.cine();   // (the Camera: the cinematic mode - client/director.js)
    for (const b of el.querySelectorAll('[data-go]:not([data-go="camera"])')) b.onclick = () => { screen = b.dataset.go; if (screen === 'jobs') ctx.send({ t: 'phone', a: 'board' }); if (screen === 'feed') { feed = null; ctx.send({ t: 'phone', a: 'feed' }); } if (screen === 'skills') ctx.send({ t: 'phone', a: 'skills' }); if (screen === 'crew') ctx.send({ t: 'phone', a: 'crew' }); if (screen === 'bounties') ctx.send({ t: 'phone', a: 'bounties' }); if (screen === 'transit') ctx.send({ t: 'phone', a: 'transit' }); if (screen === 'homes') { homes = null; ctx.send({ t: 'phone', a: 'homes' }); } render(); };
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
    for (const b of el.querySelectorAll('[data-act="workout"]')) b.onclick = () => { ctx.send({ t: 'phone', a: 'workout', k: b.dataset.k }); ctx.close(); };   // (a set where you stand: server workout.js)
    for (const b of el.querySelectorAll('[data-st]')) b.onclick = () => { ctx.send({ t: 'mus', a: 'tune', st: Number(b.dataset.st) }); ctx.close(); };
    for (const b of el.querySelectorAll('[data-act="dance"]')) b.onclick = () => { ctx.send({ t: 'phone', a: 'dance' }); ctx.close(); };   // (dance where you stand: the next move each time - server dance.js; G / L3 too)
    for (const b of el.querySelectorAll('[data-act="taxicall"]')) b.onclick = () => { b.disabled = true; ctx.send({ t: 'phone', a: 'taxi', op: 'call', tier: b.dataset.tier }); };
    for (const b of el.querySelectorAll('[data-act="taxicancel"]')) b.onclick = () => { b.disabled = true; ctx.send({ t: 'phone', a: 'taxi', op: 'cancel' }); };
    for (const b of el.querySelectorAll('[data-rail]')) b.onclick = () => {
      const st = railStations(ctx.map())[Number(b.dataset.rail)];
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
      const ct = (ctx.map().places || ctx.map().pois).filter((p) => p && p.kind === 'courthouse').sort((a, q) => Math.hypot(a.x - me.x, a.y - me.y) - Math.hypot(q.x - me.x, q.y - me.y))[0];
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
      for (const p of ctx.map().places || ctx.map().pois) { if (!p || (p.kind !== 'atm' && p.kind !== 'bank')) continue; const d = Math.hypot(p.x - me.x, p.y - me.y); if (d < bd) { bd = d; best = p; } }
      if (!best) { ctx.toast('No ATM anywhere near.', 'warn'); return; }
      ctx.setWaypoint({ x: best.x, y: best.y, label: best.kind === 'atm' ? 'Nearest ATM' : best.label, atm: true });
      ctx.toast(`Nearest ATM: ${m(bd)} away - follow the green $`, 'good');
      ctx.close();
    };
    for (const b of el.querySelectorAll('[data-group]')) b.onclick = () => { group = b.dataset.group; screen = 'group'; render(); };
    for (const b of el.querySelectorAll('[data-poi]')) b.onclick = () => {
      const p = (ctx.map().places || ctx.map().pois)[Number(b.dataset.poi)];
      ctx.setWaypoint({ x: p.x, y: p.y, label: p.label });
      ctx.toast(`Waypoint set: ${p.label}`, 'info');
      ctx.close();
    };
    for (const b of el.querySelectorAll('[data-take]')) b.onclick = () => { b.disabled = true; taking = board && board.jobs.find((q) => String(q.id) === b.dataset.take); ctx.send({ t: 'phone', a: 'take', id: b.dataset.take }); };
    for (const b of el.querySelectorAll('[data-act="showjob"]')) b.onclick = () => { const j = ctx.job && ctx.job(); if (j) ctx.showOnMap(j.x, j.y); };
    for (const b of el.querySelectorAll('[data-act="cruiser"]')) b.onclick = () => ctx.cruiser();
    for (const b of el.querySelectorAll('[data-act="clearlog"]')) b.onclick = () => { clearLog(); render(); };
    for (const b of el.querySelectorAll('[data-report]')) b.onclick = () => { b.disabled = true; ctx.send({ t: 'phone', a: 'report', id: b.dataset.report }); };
    for (const b of el.querySelectorAll('[data-act="cancel"]')) b.onclick = () => { if (b.dataset.sure) ctx.send({ t: 'phone', a: 'cancel' }); else { b.dataset.sure = '1'; b.textContent = 'Press again to quit'; } };
    wireCrew(el, () => crew, ctx);   // (the Crew app: server crews.js)
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
    h += '<h3>🚕 Rides</h3>' + (tx
      ? `<div class="ph-card">${tx.st === 'pickup' ? `Your ${tx.tier === 'std' ? 'taxi' : esc(tx.name)} is on its way (about ${Math.max(5, tx.eta)}s) - the yellow square on your map.` : tx.st === 'wait' ? 'Your taxi is waiting at the kerb - get in the back.' : tx.st === 'dest' ? 'Where to? Set a waypoint (Places, or tap the map).' : tx.st === 'ride' ? `On the way to ${esc(tx.to)}: ${tx.m} m, $${tx.fare} so far.` : `There: $${tx.fare}.`}${tx.st === 'pickup' || tx.st === 'wait' ? '<button data-act="taxicancel">Cancel the taxi</button>' : ''}</div>`
      : (transit.rs || []).map((r) => `<button class="ph-row" data-act="taxicall" data-tier="${r.k}"><span class="ic">${r.k === 'premium' ? '🎩' : r.k === 'saver' ? '🪫' : '🚕'}</span><span class="nm">${esc(r.name)}<small>${esc(r.note)}</small></span></button>`).join(''))
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
    const fr = (transit.ferries || []).filter((R) => !R.custody);   // (World v3's Prison Boat: no passengers)
    if (fr.length) {
      h += `<h3>⛴ Ferries</h3><p class="ph-hint">Walk aboard at the pier while the boat is in. On the car ferry, drive up to its stern and interact to take your car across. Free. Tap a pier for a waypoint.</p>`;
      const when = (s, inHere) => (inHere ? `in now · leaves in ${s}s` : s < 90 ? `next boat leaves in ${s}s` : `next boat leaves in ${Math.round(s / 60)} min`);
      for (const R of fr) {
        h += `<h3>${esc(R.name)} <small>${R.car ? 'cars and foot passengers' : 'foot passengers'} · ${m(R.len)}</small></h3>`;
        h += R.piers.map((pr, k) => `<button class="ph-row" data-pier="${R.id}:${k}"><span class="ic">⚓</span><span class="nm">${esc(R.stops ? R.stops[k] : `${k ? R.island : R.mainland} pier`)}<small>${R.leaves ? when(R.leaves[k], R.boat && R.boat.in === k) : 'no boat running'}</small></span><span class="d">${m(dist(pr))}</span></button>`).join('');
      }
    }
    const rail = ctx.map().rail;
    if (rail) {
      const sts = railStations(ctx.map()).map((st, i) => ({ st, i, d: dist(st) })).sort((a, b) => a.d - b.d).slice(0, 3);
      h += `<h3>🚆 Railway</h3><p class="ph-hint">${ctx.map().rails ? 'The main line\'s services run both ways round their loops; walk onto a stopped train at its platform.' : 'Trains run the whole loop round the city; walk onto a stopped train at any station.'} Free.</p>`
        + sts.map(({ st, i, d }) => `<button class="ph-row" data-rail="${i}"><span class="ic">≡</span><span class="nm">${esc(st.name)}<small>${st.services ? esc(st.services.join(' · ')) : st.under ? 'underground' : 'platform'}</small></span><span class="d">${m(d)}</span></button>`).join('');
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
    onSkills(msg) { skl = msg; if (screen === 'skills') render(); },
    onCrew(msg) { crew = msg; if (screen === 'crew') render(); },
    onTransit(msg) { transit = msg; if (screen === 'transit') render(); },
    onHomes(msg) { homes = msg; if (screen === 'homes') render(); },
    onBounties(msg) {
      bty = msg;
      if (msg.err) ctx.toast(msg.err, 'warn');
      if (screen === 'bounties') render();
    },
    onBoard(msg) {
      board = msg;
      if (msg.err) ctx.toast(msg.err, 'warn');
      if (msg.ok) {   // taken: its waypoint, and the hub away (the server's own note confirms the job)
        if (taking && (taking.x || taking.y)) ctx.setWaypoint({ x: taking.x, y: taking.y, label: taking.title });
        taking = null;
        ctx.close();
        return;
      }
      taking = null;
      if (screen === 'jobs' || screen === 'home') render();
    },
    get screen() { return screen; },
  };
}

// The Crew app's view (also the hub's People tab: client/hub.js): who's in it (online, how far, where), the quick lines,
// leaving; asked in by walking up to someone (server crews.js). m: a distance's words
export function crewHtml(crew, m, inPeople = false) {
  const h = (t) => (inPeople ? '' : `<h3>${t}</h3>`);
  if (!crew) return h('Crew') + '<p class="ph-empty">Loading…</p>';
  if (!crew.crew) return `${h('Crew')}<p class="ph-hint">No crew yet. Walk up to another player and press the action button to ask them in - up to ${crew.max} in a crew. In a crew you see each other on the map, can't hurt each other, send quick lines here, and split a bank job's drawers.</p>`;
  const C = crew.crew, n = C.members.length;
  return `${inPeople ? `<p class="ph-hint">${n} of ${crew.max} in your crew</p>` : `<h3>Your crew (${n}/${crew.max})</h3>`}`
    + C.members.map((q, k) => `<div class="ph-row"><span class="ic">${q.lead ? '★' : '•'}</span><span class="nm">${esc(q.n)}${q.me ? ' (you)' : ''}<small>${q.me ? (q.where ? esc(q.where) : '') : q.on ? (q.where ? `${esc(q.where)} · ${m(q.d || 0)}` : 'online') : 'offline'}</small></span>`
      + (!q.me && q.x !== null ? `<button data-mate="${k}" aria-label="Waypoint to ${esc(q.n)}">📍</button>` : '') + (C.lead && !q.me ? `<button data-kick="${k}" aria-label="Take ${esc(q.n)} off the crew">✕</button>` : '') + '</div>').join('')
    + '<h3>Say to the crew</h3><div class="ph-apps ph-says">' + crew.says.map((t, i) => `<button class="ph-app" data-say="${i}">${esc(t)}</button>`).join('') + '</div>'
    + '<button class="ph-row" data-act="crewleave"><span class="ic">🚪</span><span class="nm">Leave the crew</span></button>';
}
// its buttons: a quick line to the crew, a waypoint to one of them, taking someone off, leaving. ctx: { send, toast, setWaypoint, close }
export function wireCrew(el, getCrew, ctx) {
  for (const b of el.querySelectorAll('[data-say]')) b.onclick = () => { ctx.send({ t: 'phone', a: 'crewsay', i: Number(b.dataset.say) }); ctx.toast('Sent to the crew', 'info'); };
  for (const b of el.querySelectorAll('[data-mate]')) b.onclick = () => {
    const c = getCrew(), q = c && c.crew && c.crew.members[Number(b.dataset.mate)];
    if (!q || q.x === null) return;
    ctx.setWaypoint({ x: q.x, y: q.y, label: q.n });
    ctx.toast(`Waypoint: ${q.n}`, 'info');
    ctx.close();
  };
  for (const b of el.querySelectorAll('[data-kick]')) b.onclick = () => { b.disabled = true; const c = getCrew(), q = c && c.crew && c.crew.members[Number(b.dataset.kick)]; ctx.send({ t: 'phone', a: 'crewkick', k: Number(b.dataset.kick), n: q ? q.n : '' }); };
  for (const b of el.querySelectorAll('[data-act="crewleave"]')) b.onclick = () => { if (b.dataset.sure) ctx.send({ t: 'phone', a: 'crewleave' }); else { b.dataset.sure = '1'; b.textContent = 'Press again to leave the crew'; } };
}

// (H33) The railway's stations for the phone: today's loop's, or on World v3's main line one per station (its map point,
// every loop's platforms there) with the services calling - not just the first loop's.
function railStations(map) {
  if (!map.rails) return (map.rail && map.rail.stations) || [];
  const out = new Map();
  map.rails.forEach((r) => r.stations.forEach((st) => {
    const poi = map.pois && map.pois[st.poi], k = st.poi ?? st.name;
    let o = out.get(k);
    if (!o) out.set(k, (o = { name: st.name, x: poi ? poi.x : st.x, y: poi ? poi.y : st.y, under: st.under, services: [] }));
    if (r.service && !o.services.includes(r.service)) o.services.push(r.service);
  }));
  return [...out.values()];
}
