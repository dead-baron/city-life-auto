// The debug menu (Dev Debug Mode and the playtest server's cheats): loaded the first time it's on, so nobody
// else's page carries it - the page's start-up code has no room to spare (tools/perf.mjs). main.js hands over what
// it needs (init) and calls setupDev / renderDevPlayers as before; the sections are client/devcats.js, the give
// panels client/devgive.js, the teleport map client/devtp.js.
import { input } from './input.js';
import { sfx, soundStatus } from './audio.js';
import { buildTeleport } from './devtp.js';
import { buildGive, buildQuickGive } from './devgive.js';
import { DEV_SECTIONS } from './devcats.js';

const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
let S, $, send, closeOverlay, topOverlay, requestPlayers, enterSpectate, openCreator, freshPress;
export function init(ctx) { ({ S, $, send, closeOverlay, topOverlay, requestPlayers, enterSpectate, openCreator, freshPress } = ctx); }

// The debug menu: give weapons first, teleport anywhere second, the free camera third, then a section per
// feature (client/devcats.js: weather and time, me, the law, vehicles, trains, jobs, crime, events, shops, homes,
// nature) that spawns the thing or takes you to the nearest place it happens - one section open at a time, so
// it stays short on a pad. Everyone online sits in the right-hand column (left / right on a pad jumps across).
// Every button presses in, clicks, and pops a note saying what it did.
function devPress(b, label, run) {
  b.onclick = () => {
    b.classList.remove('pressed'); void b.offsetWidth; b.classList.add('pressed');
    clearTimeout(b._pt); b._pt = setTimeout(() => b.classList.remove('pressed'), 380);   // (lit while it presses in, then back)
    if (input.device !== 'gamepad') b.blur();
    sfx('click', 0.8);
    S.hud.toast(`🛠 ${label.replace(/^[^A-Za-z0-9+$]+/, '')}`, 'info');
    run();
  };
}
// commands that only change your own screen
function devLocal(c, extra) {
  if (c === '@bolt') { if (S.wx) S.wx.strike((extra && extra.kind) || 'strike'); }   // (a strike near you, a bolt in the distance, a flash in the clouds)
  else if (c === '@storm') { if (S.wx) S.wx.stormForce = extra ? extra.mood : null; }   // (while it rains: render/lightning.js stormSpell's moods)
  else if (c === '@fog') S.fogForce = extra ? { k: extra.k, spread: extra.spread } : null;
  else if (c === '@bio') S.bioForce = extra ? [extra.k, 0.5] : null;   // (the sea's sparkle whatever the night: art2 host.js)
  else if (c === '@wardrobe') { closeOverlay('dev'); openCreator('dev'); }   // (the debug wardrobe: client/creator.js)
  else if (c === '@homes' && S.map) import('./devhomes.js').then((m) => m.showHomes(S.map, (id) => { send({ t: 'dev', c: 'home', op: 'go', id }); closeOverlay('dev'); }));   // (every home: client/devhomes.js)
}
export function setupDev() {
  const box = $('dev');
  const on = S.dev || S.devMode;
  $('b-dev').classList.toggle('on', !!on);
  $('b-dev').title = on ? 'Debug menu' : 'Debug menu (switches Dev Debug Mode on)';
  if (!on) { box.classList.add('hidden'); $('dev-btn').classList.add('hidden'); if (topOverlay() === 'dev') closeOverlay('dev'); return; }
  box.innerHTML = `<div class="dev-head"><b>🐞 ${S.devMode ? 'DEBUG · your progress is kept' : 'DEBUG · PLAYTEST CHEATS'}</b><button class="dev-x" title="Close">✕</button></div><div id="dev-sound" class="dev-sound">${soundStatus()}</div><div class="dev-cols"><div class="dev-cmds"></div><div id="dev-players"></div></div>`;
  box.querySelector('.dev-x').onclick = () => closeOverlay('dev');
  const cmds = box.querySelector('.dev-cmds');
  const add = (label, cls, run) => { const b = document.createElement('button'); b.textContent = label; if (cls) b.className = cls; if (run) devPress(b, label, run); cmds.appendChild(b); return b; };
  // 1. weapons and tools, one press; anything else to anyone from the give panel under it
  add('🔫 Give every weapon + tools', 'dev-top', () => send({ t: 'dev', c: 'guns' }));
  // ...or just one: pick a weapon or tool and who gets it (you, or anyone online)
  const qgBox = document.createElement('div'); qgBox.id = 'dev-qg'; cmds.appendChild(qgBox);
  S.devQuickGive = buildQuickGive(qgBox, { send, press: devPress, players: () => (S.plist && S.plist.l) || [] });
  const giveBtn = add('🎁 Give anything to me or a player…', 'dev-give-toggle');
  const giveBox = document.createElement('div'); giveBox.id = 'dev-give'; giveBox.className = 'hidden'; cmds.appendChild(giveBox);
  S.devGive = buildGive(giveBox, { send, press: devPress, players: () => (S.plist && S.plist.l) || [] });
  giveBtn.onclick = () => {
    const open = giveBox.classList.toggle('hidden') === false;
    giveBtn.textContent = open ? '🎁 Give ▲ (hide)' : '🎁 Give anything to me or a player…';
    if (open) { requestPlayers(); S.devGive.refreshTargets(); }
  };
  // 2. teleport anywhere: a map of every district, station and landmark (built the first time it's opened)
  const tpBtn = add('📍 Teleport anywhere…', 'dev-tp-toggle');
  const tpBox = document.createElement('div'); tpBox.id = 'dev-tp'; tpBox.className = 'hidden'; cmds.appendChild(tpBox);
  tpBtn.onclick = () => {
    const open = tpBox.classList.toggle('hidden') === false;
    tpBtn.textContent = open ? '📍 Teleport ▲ (hide)' : '📍 Teleport anywhere…';
    if (open && !tpBox.childElementCount && S.map) buildTeleport(tpBox, S.map, (pl) => {
      sfx('click', 0.8);
      send({ t: 'dev', c: 'tp', x: Math.round(pl.x), y: Math.round(pl.y) });
      S.hud.toast(`🛠 Teleported to ${pl.name}`, 'info');
      closeOverlay('dev');
    });
  };
  // 3. the free camera
  add('🎥 Spectate (free camera)', 'dev-spec', () => enterSpectate());
  // then a section per feature, one open at a time
  const bodies = [];
  for (const sec of DEV_SECTIONS) {
    const head = add(`${sec.title}`, 'dev-sec');
    const body = document.createElement('div'); body.className = 'dev-sec-body hidden'; cmds.appendChild(body);
    bodies.push([sec.id, head, body]);
    for (const [label, c, extra] of sec.items) {
      const b = document.createElement('button'); b.textContent = label;
      if (c === 'god') { b.id = 'dev-god'; b.classList.toggle('on', !!(S.me && S.me.god)); }
      const goes = c === 'near' || c === 'train' || c === 'home';
      devPress(b, label, () => { if (c[0] === '@') devLocal(c, extra); else send({ t: 'dev', c, ...(extra || {}) }); if (goes) closeOverlay('dev'); });
      body.appendChild(b);
    }
    head.onclick = () => {
      const open = body.classList.contains('hidden');
      for (const [, h, bd] of bodies) { bd.classList.add('hidden'); h.classList.remove('open'); }
      if (open) { body.classList.remove('hidden'); head.classList.add('open'); }
      S.devOpenSec = open ? sec.id : null;
      sfx('click', 0.5);
      if (input.device !== 'gamepad') head.blur();
    };
    if (S.devOpenSec === sec.id) { body.classList.remove('hidden'); head.classList.add('open'); }
  }
  if (S.devMode) add('⏏ Leave dev mode (keep my progress)', 'dev-leave', () => { send({ t: 'devmode', leave: true }); closeOverlay('dev'); });
  // erase this character and go through the first-time flow again (task #413: press twice; also in Settings)
  const fb = add('⟲ Start fresh: erase my character…', 'dev-fresh'), fm = document.createElement('p');
  fm.className = 'dev-none'; cmds.appendChild(fm);
  fb.onclick = () => freshPress(fb, (t) => { fm.textContent = t; });
  renderDevPlayers();
  if (topOverlay() !== 'dev') box.classList.add('hidden');   // (left open when it was opened while this loaded)
  $('dev-btn').classList.remove('hidden');
  if (S.playing && S.dev) S.hud.toast(S.practice ? 'Offline practice: nothing here is saved. Tap 🐞 (or press `) for the cheats panel.' : 'Dev mode: tap 🐞 or press ` (backtick) for the playtest panel.', 'info');
}
export function renderDevPlayers() {
  if (S.devGive) S.devGive.refreshTargets(); // the give menu's "give to" list
  if (S.devQuickGive) S.devQuickGive.refreshTargets();
  const el = $('dev-players');
  if (!el) return;
  const all = (S.plist && S.plist.l) || [];
  const ps = all.filter((q) => !q.me);
  el.innerHTML = `<b>PLAYERS ONLINE (${all.length || 1})</b>` + (ps.length ? '' : '<p class="dev-none">Just you right now.</p>');
  for (const q of ps) {
    const row = document.createElement('div'); row.className = 'dev-pl';
    row.innerHTML = `<span>${esc(q.n)}${q.dm ? ' <i>dev</i>' : ''}${q.god ? ' 🛡' : ''}<small>${esc(q.d || '')}${q.dead ? ' · down' : ''}</small></span>`;
    const acts = [['goto', '📍 Go to'], ['bring', '🧲 Bring'], ['gunsp', '🔫 Weapons + tools'], ['healp', '❤ Heal'], ['godp', q.god ? '🛡 Invincible: ON' : '🛡 Invincible: off'], ...(q.dm ? [] : [['grant', '🛠 Give dev']])];
    for (const [c, label] of acts) {
      const b = document.createElement('button'); b.textContent = label;
      if (c === 'godp' && q.god) b.classList.add('on');
      devPress(b, `${label} - ${q.n}`, () => { send({ t: 'dev', c, pid: q.id }); if (c === 'goto' || c === 'bring') closeOverlay('dev'); setTimeout(requestPlayers, 300); });
      row.appendChild(b);
    }
    el.appendChild(row);
  }
}
