// The debug menu (Dev Debug Mode and the playtest server's cheats): loaded the first time it's on, so nobody
// else's page carries it - the page's start-up code has no room to spare (tools/perf.mjs). main.js hands over what
// it needs (init) and calls setupDev / renderDevPlayers as before, and passes the debug menu's keys and pad to it
// (S.devNav); the sections are client/devcats.js, the give panels client/devgive.js, the teleport client/devtp.js.
//
// Pages, not one long list (the owner, 2026-10-17: "easier to get through, for mobile and for desktop, with any
// controller ... detect what control scheme and what device and orientation you're on"): the home page has the quick
// presses and a tile per category - Teleport, Give, Players and each test section; a category opens as its own page
// (◀ back to the home page). Find (the box at the top) searches every command and every place at once.
// How it lays out, by what you hold and how the screen is turned (#dev's classes, client/style.css):
//   - touch (dv-touch): big buttons, two across in portrait (the panel the whole screen), three or four in landscape
//     with a short header; the teleport map above the list in portrait, beside it in landscape
//   - a controller (dv-pad): the D-pad or the left stick moves between the buttons as they sit on screen (up, down,
//     left, right - not through one long list), A presses, B goes back a page and then closes, LB / RB the previous /
//     next category (in Teleport: the previous / next group), Start closes; the hints line says so
//   - mouse and keyboard (dv-kb): the arrows or WASD move the same way, Enter / Space / E press, Esc back, [ / ] or
//     Page Up / Down the previous / next category, / (or F) to Find
import { input } from './input.js';
import { sfx, soundStatus } from './audio.js';
import { teleportPlaces, teleportGroups, teleportMap } from './devtp.js';
import { buildGive, buildQuickGive } from './devgive.js';
import { DEV_SECTIONS } from './devcats.js';

// its look (moved here from client/style.css with the UI overhaul, 2026-10-24: only a page with the debug menu on loads
// it): the game's tokens and parts - navy, a gold rim, Barlow - laid out by what you hold and how the screen is turned
const CSS = `#dev { position: absolute; right: 10px; top: 200px; z-index: 12; width: 190px; max-height: 70vh; overflow-y: auto; padding: var(--s2); background: var(--panel-bg); border: 2px solid var(--gold); border-radius: var(--r2); color: var(--cream); }
#dev.as-overlay { position: absolute; inset: auto; left: 50%; top: 50%; transform: translate(-50%, -50%); z-index: 41; display: flex; flex-direction: column; width: min(900px, 96vw); height: min(86vh, 780px); max-height: none; overflow: hidden; padding: 0; box-shadow: var(--shadow); }
#dev.as-overlay.hidden { display: none; }
#dev b { color: var(--gold); font-size: var(--fs-2); }
#dev button { display: block; width: 100%; margin-top: var(--s1); min-height: 36px; padding: 5px var(--s2); font: 600 var(--fs-2) var(--ui); background: var(--navy2); color: var(--cream); border: 1px solid var(--edge); border-radius: var(--r1); cursor: pointer; touch-action: manipulation; transition: transform .06s, background var(--t1); }
#dev button:active { transform: scale(.95) translateY(1px); background: var(--gold) !important; color: var(--ink) !important; }
#dev button.pressed { animation: devpress .35s ease-out; }
@keyframes devpress { 0% { transform: scale(.93) translateY(1px); background: var(--gold); color: var(--ink); } 100% { transform: none; } }
#dev button.on { border-color: var(--money) !important; box-shadow: inset 0 0 0 1px var(--money); }
#dev button.pfocus, #dev select.pfocus { outline: 3px solid var(--gold); outline-offset: 1px; }
#dev button.pfocus { background: var(--pick), var(--navy2) !important; color: var(--cream) !important; }
#dev select { min-width: 0; padding: var(--s1); background: var(--navy); color: var(--cream); border: 1px solid var(--gold-a); border-radius: var(--r1); font: 600 var(--fs-2) var(--ui); }
#dev .dev-sound { margin: var(--s1) 0 2px; font: 400 var(--fs-1)/1.3 var(--pixel); color: var(--money); }
#dev .dev-leave, #dev .dev-fresh { background: transparent !important; border-color: var(--danger) !important; color: var(--danger) !important; }
#dev .dev-fresh.armed { background: var(--danger) !important; color: var(--ink) !important; animation: freshpulse .8s ease-out infinite; }
#dev .dev-x { width: auto !important; margin: 0 !important; padding: var(--s1) 10px !important; }
#dev .dev-pl { display: flex; flex-wrap: wrap; align-items: center; gap: var(--s1); margin-top: 6px; padding-top: 6px; border-top: 1px solid var(--line); }
#dev .dev-pl span { flex: 1 0 100%; font: 600 var(--fs-2) var(--ui); }
#dev .dev-pl span small { margin-left: 6px; color: var(--dim); font-weight: 500; }
#dev .dev-pl i { color: var(--heat); font-style: normal; font-size: var(--fs-1); }
#dev .dev-pl button { display: inline-block; width: auto; flex: 1; margin-top: 0; font-size: var(--fs-1); }
#dev .dev-pl .dv-grid { flex: 1 0 100%; }
#dev .dev-none { margin: var(--s1) 0; color: var(--dim); font-size: var(--fs-1); }
#dev .dev-top { background: var(--pick), var(--navy2) !important; border-color: var(--gold) !important; font-size: var(--fs-3) !important; }
#dev .dev-spec { border-color: var(--money) !important; margin-bottom: 6px; }
#dev .dev-tp-map { display: block; width: 100%; border: 2px solid var(--ink); cursor: pointer; touch-action: manipulation; }
#dev .dev-tp-group, #dev .dv-label { margin: var(--s3) 0 2px; color: var(--gold); font: 700 var(--fs-1) var(--pixel); text-transform: uppercase; letter-spacing: .04em; }
#dev .dev-tp-row { display: flex; flex-wrap: wrap; gap: var(--s1); }
#dev .dev-tp-row button { display: inline-block; width: auto; margin: 0; padding: var(--s1) var(--s2); font-size: var(--fs-1); }
#dev #dev-qg .dev-qg { display: flex; gap: 6px; margin: 2px 0 6px; }
#dev #dev-qg select { flex: 1; } #dev #dev-qg select:last-of-type { flex: 0 0 34%; }
#dev #dev-give { padding: var(--s1) 0 var(--s2); margin-bottom: 6px; border-bottom: 1px solid var(--line); }
#dev #dev-give label { display: flex; align-items: center; gap: var(--s2); margin-top: var(--s1); font: 600 var(--fs-1) var(--ui); color: var(--dim); }
#dev #dev-give label span { flex: 0 0 70px; }
#dev #dev-give select { flex: 1; }
#dev #dev-give .dev-give-btns { display: flex; gap: 6px; }
#dev #dev-give .dev-give-btns button { flex: 1; }
#dev .dev-qg-go, #dev .dev-give-go { background: var(--gold) !important; color: var(--ink) !important; border-color: var(--gold) !important; }
#dev #dev-give .dev-give-all { border-color: var(--heat) !important; }
#dev #dev-give .dev-give-note { margin: var(--s1) 0 0; color: var(--dim); font-size: var(--fs-1); }
#dev .dv-head { display: flex; align-items: center; gap: var(--s2); flex: 0 0 auto; padding: var(--s2) 10px; background: var(--navy); border-bottom: 2px solid var(--gold); }
#dev .dv-head .dv-back, #dev .dv-head .dev-x { width: auto; margin: 0; padding: 0 14px; flex: 0 0 auto; font-size: var(--fs-3); border: 2px solid var(--gold); border-radius: var(--r2); }
#dev .dv-head .dev-x { margin-left: auto !important; }
#dev .dv-title { display: flex; flex-direction: column; min-width: 0; flex: 0 1 auto; }
#dev .dv-title b { font: 700 var(--fs-1) var(--pixel); color: var(--gold); }
#dev .dv-title span { font: 700 var(--fs-3) var(--ui); color: var(--cream); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
#dev .dv-find { flex: 1 1 140px; min-width: 0; min-height: 36px; padding: 6px 10px; background: var(--navy); color: var(--cream); border: 2px solid var(--gold-a); border-radius: var(--r1); font: 600 var(--fs-2) var(--ui); }
#dev .dv-find.pfocus, #dev .dv-find:focus { outline: none; border-color: var(--gold); }
#dev .dv-hint { flex: 0 0 auto; padding: var(--s1) 10px 0; font: 600 var(--fs-1) var(--ui); color: var(--dim); }
#dev .dv-hint:empty { display: none; }
#dev .dv-body { flex: 1 1 auto; overflow-y: auto; padding: 6px 10px 14px; -webkit-overflow-scrolling: touch; overscroll-behavior: contain; }
#dev .dv-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 6px; margin: var(--s1) 0; }
#dev .dv-grid > button { margin: 0 !important; text-align: left; border-radius: var(--r2); }
#dev .dv-tiles { grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); }
#dev .dv-tile { display: flex !important; align-items: center; gap: 10px; min-height: 54px; border-color: var(--gold-a) !important; font-size: var(--fs-3) !important; }
#dev .dv-tile i { flex: 0 0 auto; font-style: normal; font-size: var(--fs-4); line-height: 1; }
#dev .dv-tile span { min-width: 0; line-height: 1.15; }
#dev .dv-tile.dv-t-tp { border-color: var(--info) !important; } #dev .dv-tile.dv-t-give { border-color: var(--heat) !important; } #dev .dv-tile.dv-t-pl { border-color: var(--money) !important; }
#dev .dv-chips { display: flex; gap: 6px; overflow-x: auto; padding: 2px 0 var(--s2); scrollbar-width: thin; }
#dev .dv-chip { flex: 0 0 auto; width: auto !important; margin: 0 !important; padding: 0 var(--s3) !important; border-radius: var(--r3); font-size: var(--fs-2) !important; white-space: nowrap; }
#dev .dv-chip.on { background: var(--gold) !important; color: var(--ink) !important; border-color: var(--gold) !important; }
#dev .dv-tp { display: grid; grid-template-columns: minmax(0, 1fr); gap: 10px; }
#dev.dv-land .dv-tp { grid-template-columns: auto minmax(0, 1fr); align-items: start; }
#dev.dv-land .dv-tp-map { position: sticky; top: 0; }
#dev .dv-tp-map canvas { display: block; max-width: 100%; border: 2px solid var(--gold); border-radius: var(--r1); cursor: pointer; touch-action: manipulation; }
#dev .dv-tp-list .dv-label:first-child { margin-top: 0; }
#dev .dv-places { grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); }
#dev .dv-places button { font-size: var(--fs-2) !important; padding: 6px var(--s2) !important; }
#dev .dv-nav { margin-top: 14px; grid-template-columns: 1fr 1fr; }
#dev .dv-step { color: var(--dim) !important; font-size: var(--fs-1) !important; }
#dev .dv-foot { margin-top: var(--s4); }
#dev .dv-body #dev-players { border: 0; padding: 0; max-height: none; overflow: visible; }
#dev.dv-touch button { min-height: var(--tap); font-size: var(--fs-3) !important; }
#dev.dv-touch .dv-chip, #dev.dv-touch select { min-height: var(--tap); }
#dev.dv-touch .dv-find { min-height: var(--tap); font-size: var(--fs-3); }
#dev.dv-pad button { min-height: 42px; }
#dev.as-overlay.dv-port { width: 100vw; height: 100%; left: 0; top: 0; transform: none; border-radius: 0; padding-top: env(safe-area-inset-top); padding-bottom: env(safe-area-inset-bottom); }
#dev.dv-port .dv-grid, #dev.dv-port .dv-tiles, #dev.dv-port .dv-places { grid-template-columns: 1fr 1fr; }
#dev.dv-port .dv-head { flex-wrap: wrap; }
#dev.dv-port .dv-find { flex-basis: 100%; order: 5; }
#dev.as-overlay.dv-short { height: 100%; top: 0; transform: translate(-50%, 0); width: min(1000px, 100vw); border-radius: 0; padding-left: env(safe-area-inset-left); padding-right: env(safe-area-inset-right); }
#dev.as-overlay.dv-short.dv-port { transform: none; }
#dev.dv-short .dv-head { padding: var(--s1) var(--s2); }
#dev.dv-short .dv-title b, #dev.dv-short .dv-hint { display: none; }
#dev.dv-short.dv-land .dv-grid, #dev.dv-short.dv-land .dv-tiles { grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); }
#dev.dv-short .dv-tile { min-height: 46px; }`;
if (typeof document !== 'undefined') document.head.appendChild(Object.assign(document.createElement('style'), { textContent: CSS }));

const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
let S, $, send, closeOverlay, topOverlay, requestPlayers, enterSpectate, openCreator, freshPress, openMap;
export function init(ctx) { ({ S, $, send, closeOverlay, topOverlay, requestPlayers, enterSpectate, openCreator, freshPress, openMap } = ctx); }
// (main.js passes the debug menu's keys and pad here while it's the top screen; turning the phone lays it out again)
let wired = false;
function wire() {
  S.devNav = { pad: devPad, key: devKey, opened: onOpen };
  if (wired) return;
  wired = true;
  addEventListener('resize', () => { if (!$('dev').classList.contains('hidden')) { layout(); if (UI.page === 'tp') render(); } });
}

// the pages: 'home', 'tp' (teleport), 'give', 'players', 'find' (the Find box's results), or a section's id
const UI = { page: 'home', from: null, tpGroup: null, q: '', focusKey: null, ctl: 'kb' };
const PAGES = () => ['tp', 'give', 'players', ...DEV_SECTIONS.map((s) => s.id)];
const iconOf = (t) => { const m = /^\s*(\S+)\s/.exec(t); return m && !/[A-Za-z0-9]/.test(m[1]) ? m[1] : '•'; };
const nameOf = (t) => t.replace(/^\s*\S+\s/, (s) => (/[A-Za-z0-9]/.test(s) ? s : ''));

// what you're holding and how the screen is turned: the classes the layout hangs on
function layout() {
  const box = $('dev');
  const coarse = matchMedia && matchMedia('(pointer: coarse)').matches;
  const ctl = input.device === 'gamepad' ? 'pad' : input.device === 'touch' || (coarse && input.device !== 'keyboard') ? 'touch' : 'kb';
  const land = innerWidth >= innerHeight, short = innerHeight < 520;
  for (const [c, on] of [['dv-pad', ctl === 'pad'], ['dv-touch', ctl === 'touch'], ['dv-kb', ctl === 'kb'], ['dv-land', land], ['dv-port', !land], ['dv-short', short]]) box.classList.toggle(c, on);
  UI.ctl = ctl;
  const hint = box.querySelector('.dv-hint');
  if (hint) hint.textContent = HINTS[ctl] || '';
}
const HINTS = {
  pad: 'D-pad / stick: move · A: press · B: back · LB / RB: category · Start: close',
  kb: 'Arrows / WASD: move · Enter: press · Esc: back · [ ]: category · /: find',
  touch: '',
};

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
// a section's command, as its button runs it
function runItem([, c, extra]) {
  if (c[0] === '@') devLocal(c, extra); else send({ t: 'dev', c, ...(extra || {}) });
  if (c === 'near' || c === 'train' || c === 'home' || c === 'sky' || c === 'cart' || c === 'arcade') closeOverlay('dev');   // (the carts: out of the way to watch - the head-on crash sets off a few seconds later, server/devplay.js)
}
function teleport(pl) {
  sfx('click', 0.8);
  send({ t: 'dev', c: 'tp', x: Math.round(pl.x), y: Math.round(pl.y), snap: 1 });   // (the server finds the ground: server/dev.js tpSpot)
  S.hud.toast(`🛠 Teleported to ${pl.name}`, 'info');
  closeOverlay('dev');
}

export function setupDev() {
  wire();
  const box = $('dev');
  const on = S.dev || S.devMode;
  if (!on) { box.classList.add('hidden'); $('dev-btn').classList.add('hidden'); if (topOverlay() === 'dev') closeOverlay('dev'); return; }
  render();
  if (topOverlay() !== 'dev') box.classList.add('hidden');   // (left open when it was opened while this loaded)
  $('dev-btn').classList.remove('hidden');
  if (S.playing && S.dev) S.hud.toast(S.practice ? 'Offline practice: nothing here is saved. The DEV button (or `) opens the cheats panel.' : 'Dev mode: the DEV button, ` (backtick) or MENU → Settings › Help → Debug menu opens the playtest panel.', 'info');
}
// opened (main.js openOverlay): the home page, laid out for what you hold, the first button lit for a pad or keys
function onOpen() {
  if (UI.page === 'find') UI.page = 'home';
  render();
  focusFirst();
}

// ---- the pages --------------------------------------------------------------------------------------------------
function title() {
  if (UI.page === 'home') return S.devMode ? 'your progress is kept' : 'playtest cheats';
  if (UI.page === 'tp') return '📍 Teleport';
  if (UI.page === 'give') return '🎁 Give';
  if (UI.page === 'players') return '👥 Players online';
  if (UI.page === 'find') return '🔎 Find';
  const sec = DEV_SECTIONS.find((s) => s.id === UI.page);
  return sec ? sec.title : '';
}
function render() {
  const box = $('dev');
  const home = UI.page === 'home', findable = home || UI.page === 'find' || UI.page === 'tp';
  box.innerHTML = `<div class="dv-head">${home ? '' : '<button class="dv-back" title="Back">◀</button>'}<div class="dv-title"><b>🐞 DEBUG</b><span>${esc(title())}</span></div>`
    + `${findable ? `<input class="dv-find" type="search" placeholder="${UI.page === 'tp' ? 'Find a place…' : 'Find a command or place…'}" autocomplete="off" spellcheck="false">` : ''}<button class="dev-x" title="Close">✕</button></div>`
    + '<div class="dv-hint"></div><div class="dv-body"></div>';
  box.querySelector('.dev-x').onclick = () => closeOverlay('dev');
  const back = box.querySelector('.dv-back');
  if (back) back.onclick = () => goBack();
  const find = box.querySelector('.dv-find');
  if (find) {
    find.value = UI.q;
    find.oninput = () => {
      UI.q = find.value;
      if (UI.page === 'tp') { fillTeleport(box.querySelector('.dv-body')); return; }
      const want = UI.q.trim() ? 'find' : 'home';
      if (UI.page !== want) { UI.page = want; render(); const f2 = $('dev').querySelector('.dv-find'); if (f2) { f2.focus(); f2.setSelectionRange(f2.value.length, f2.value.length); } return; }
      if (want === 'find') fillFind($('dev').querySelector('.dv-body'));
    };
    find.onkeydown = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); if (find.value) { find.value = ''; find.oninput(); } else find.blur(); }
      else if (e.key === 'ArrowDown' || e.key === 'Enter') { e.preventDefault(); find.blur(); const first = focusables().find((el) => !el.closest('.dv-head')); if (first) { if (e.key === 'Enter' && UI.q.trim()) first.click(); else setFocus(first); } }
    };
  }
  layout();
  const body = box.querySelector('.dv-body');
  if (home) fillHome(body);
  else if (UI.page === 'tp') fillTeleport(body);
  else if (UI.page === 'give') fillGive(body);
  else if (UI.page === 'players') { body.innerHTML = '<div id="dev-players"></div>'; requestPlayers(); renderDevPlayers(); }
  else if (UI.page === 'find') fillFind(body);
  else fillSection(body, DEV_SECTIONS.find((s) => s.id === UI.page));
}
const grid = (parent, cls = '') => { const g = document.createElement('div'); g.className = `dv-grid ${cls}`; parent.appendChild(g); return g; };
const label = (parent, t) => { const l = document.createElement('div'); l.className = 'dv-label'; l.textContent = t; parent.appendChild(l); return l; };
function button(parent, text, cls, run, key) {
  const b = document.createElement('button');
  b.innerHTML = cls && cls.includes('dv-tile') ? `<i>${esc(iconOf(text))}</i><span>${esc(nameOf(text))}</span>` : esc(text);
  if (cls) b.className = cls;
  if (key) b.dataset.k = key;
  if (run) devPress(b, text, run);
  parent.appendChild(b);
  return b;
}
function open(page) {
  UI.from = UI.page; UI.page = page; UI.q = ''; UI.focusKey = null;
  sfx('click', 0.5);
  render();
  focusFirst();
}
function goBack() {
  if (UI.page === 'home') { closeOverlay('dev'); return; }
  const was = UI.page;
  UI.page = 'home'; UI.q = '';
  sfx('click', 0.4);
  render();
  const tile = $('dev').querySelector(`[data-k="page:${was}"]`);
  if (tile && UI.ctl !== 'touch') setFocus(tile); else focusFirst();
}
// the previous / next category (LB / RB, [ / ]): in Teleport the groups instead
function step(d) {
  if (UI.page === 'tp') {
    const gs = [null, ...teleportGroups(S.map)], i = gs.indexOf(UI.tpGroup);
    UI.tpGroup = gs[(i + d + gs.length) % gs.length];
    fillTeleport($('dev').querySelector('.dv-body'));
    const chip = $('dev').querySelector('.dv-chip.on');
    if (chip) { setFocus(chip); chip.scrollIntoView({ block: 'nearest', inline: 'center' }); }
    sfx('click', 0.4);
    return;
  }
  const P = PAGES(), i = P.indexOf(UI.page);
  if (i < 0) { if (UI.page === 'home') open(P[d > 0 ? 0 : P.length - 1]); return; }
  open(P[(i + d + P.length) % P.length]);
}

function fillHome(body) {
  body.innerHTML = `<div id="dev-sound" class="dev-sound">${esc(soundStatus())}</div>`;
  // the quick presses
  const q = grid(body, 'dv-quick');
  button(q, '🔫 Every weapon + tools', 'dev-top', () => send({ t: 'dev', c: 'guns' }), 'q:guns');
  const god = button(q, '🛡 Invincible (toggle)', '', () => send({ t: 'dev', c: 'god' }), 'q:god');
  god.id = 'dev-god'; god.classList.toggle('on', !!(S.me && S.me.god));
  button(q, '❤ Heal', '', () => send({ t: 'dev', c: 'heal' }), 'q:heal');
  button(q, '🎥 Spectate (free camera)', 'dev-spec', () => enterSpectate(), 'q:spec');
  // the categories: a tile each
  label(body, 'Categories');
  const t = grid(body, 'dv-tiles');
  const n = ((S.plist && S.plist.l) || []).length || 1;
  const tile = (text, page, cls = '') => { const b = button(t, text, `dv-tile ${cls}`, null, `page:${page}`); b.onclick = () => open(page); return b; };
  tile('📍 Teleport anywhere', 'tp', 'dv-t-tp');
  tile('🎁 Give anything', 'give', 'dv-t-give');
  tile(`👥 Players online (${n})`, 'players', 'dv-t-pl');
  for (const sec of DEV_SECTIONS) tile(sec.title, sec.id);
  // the way out of dev mode, starting fresh
  const f = grid(body, 'dv-foot');
  if (S.devMode) button(f, '⏏ Leave dev mode (keep my progress)', 'dev-leave', () => { send({ t: 'devmode', leave: true }); closeOverlay('dev'); }, 'q:leave');
  // erase this character and go through the first-time flow again (task #413: press twice; also in Settings)
  const fb = button(f, '⟲ Start fresh: erase my character…', 'dev-fresh', null, 'q:fresh'), fm = document.createElement('p');
  fm.className = 'dev-none'; body.appendChild(fm);
  fb.onclick = () => freshPress(fb, (tx) => { fm.textContent = tx; });
}
function fillSection(body, sec) {
  body.innerHTML = '';
  if (!sec) return;
  const g = grid(body, 'dv-items');
  for (const it of sec.items) {
    const [text, c] = it;
    const b = button(g, text, '', () => runItem(it), `i:${sec.id}:${text}`);
    if (c === 'god') { b.id = 'dev-god'; b.classList.toggle('on', !!(S.me && S.me.god)); }
  }
  // (the other categories, a press away: LB / RB or [ ] for the next, these for the near ones)
  const P = PAGES(), i = P.indexOf(sec.id), nav = grid(body, 'dv-nav');
  const b0 = button(nav, `◀ ${pageTitle(P[(i - 1 + P.length) % P.length])}`, 'dv-step'), b1 = button(nav, `${pageTitle(P[(i + 1) % P.length])} ▶`, 'dv-step');
  b0.onclick = () => step(-1); b1.onclick = () => step(1);
}
const pageTitle = (p) => ({ tp: '📍 Teleport', give: '🎁 Give', players: '👥 Players' }[p] || (DEV_SECTIONS.find((s) => s.id === p) || { title: p }).title);
function fillGive(body) {
  body.innerHTML = '';
  label(body, 'One weapon or tool');
  const qg = document.createElement('div'); qg.id = 'dev-qg'; body.appendChild(qg);
  S.devQuickGive = buildQuickGive(qg, { send, press: devPress, players: () => (S.plist && S.plist.l) || [] });
  label(body, 'Anything, to me or a player');
  const gv = document.createElement('div'); gv.id = 'dev-give'; body.appendChild(gv);
  S.devGive = buildGive(gv, { send, press: devPress, players: () => (S.plist && S.plist.l) || [] });
  requestPlayers(); S.devGive.refreshTargets();
}
// Teleport: the groups as chips (All first), the map with the shown places' dots, the places as buttons; Find filters
function fillTeleport(body) {
  body.innerHTML = '';
  if (!S.map) { body.innerHTML = '<p class="dev-none">The map isn\'t loaded yet.</p>'; return; }
  const all = teleportPlaces(S.map), groups = teleportGroups(S.map), q = UI.q.trim().toLowerCase();
  const chips = document.createElement('div'); chips.className = 'dv-chips'; body.appendChild(chips);
  // (anywhere: the whole world's map - tap a spot, TELEPORT HERE; the owner, 10-16: "Teleport anywhere: a real map")
  if (openMap) { const w = button(chips, '🗺 Anywhere: the world map', 'dv-chip', null, 'g:@map'); w.onclick = () => { closeOverlay('dev'); openMap(); S.hud.toast('🛠 Tap a spot on the map, then TELEPORT HERE', 'info'); }; }
  for (const g of [null, ...groups]) {
    const n = g ? all.filter((p) => p.group === g).length : all.length;
    const c = button(chips, `${g || 'All'} (${n})`, `dv-chip${UI.tpGroup === g ? ' on' : ''}`, null, `g:${g || ''}`);
    c.onclick = () => { UI.tpGroup = g; fillTeleport(body); const on = $('dev').querySelector('.dv-chip.on'); if (on && UI.ctl !== 'touch') setFocus(on); };
  }
  const shown = all.filter((p) => (q ? p.name.toLowerCase().includes(q) || p.group.toLowerCase().includes(q) : !UI.tpGroup || p.group === UI.tpGroup));
  const split = document.createElement('div'); split.className = 'dv-tp'; body.appendChild(split);
  const mapBox = document.createElement('div'); mapBox.className = 'dv-tp-map'; split.appendChild(mapBox);
  const cv = document.createElement('canvas'); mapBox.appendChild(cv);
  const listBox = document.createElement('div'); listBox.className = 'dv-tp-list'; split.appendChild(listBox);
  if (!shown.length) listBox.innerHTML = `<p class="dev-none">No place called "${esc(UI.q)}".</p>`;
  let group = null, row = null;
  for (const p of shown) {
    if (p.group !== group && (!UI.tpGroup || q)) { group = p.group; label(listBox, group); row = null; }
    row ||= grid(listBox, 'dv-places');
    const b = button(row, p.name, '', null, `p:${p.group}:${p.name}`);
    b.onclick = () => teleport(p);
    b.onpointerenter = () => tm && tm.ring(p);
  }
  // (the map's width: the panel's - beside the list in landscape, above it in portrait)
  const land = $('dev').classList.contains('dv-land');
  const w = land ? Math.min(420, Math.max(220, split.clientWidth * 0.42)) : Math.min(560, split.clientWidth || innerWidth - 40);
  const tm = teleportMap(cv, S.map, shown.length ? shown : all, { mini: S.hud && S.hud.mini, go: teleport, width: w });
}
// Find: every command whose label has the words, and every place whose name has them
function fillFind(body) {
  body.innerHTML = '';
  const q = UI.q.trim().toLowerCase();
  if (!q) return;
  const words = q.split(/\s+/), has = (t) => { const s = t.toLowerCase(); return words.every((w) => s.includes(w)); };
  let n = 0;
  const cmds = [];
  for (const sec of DEV_SECTIONS) for (const it of sec.items) if (has(it[0]) || has(sec.title)) cmds.push([sec, it]);
  if (cmds.length) {
    label(body, `Commands (${cmds.length})`);
    const g = grid(body, 'dv-items');
    for (const [sec, it] of cmds.slice(0, 60)) { button(g, `${it[0]}`, '', () => runItem(it), `i:${sec.id}:${it[0]}`).title = sec.title; n++; }
  }
  const pages = [['📍 Teleport anywhere', 'tp'], ['🎁 Give anything', 'give'], ['👥 Players online', 'players'], ...DEV_SECTIONS.map((s) => [s.title, s.id])].filter(([t]) => has(t));
  if (pages.length) { label(body, 'Categories'); const g = grid(body, 'dv-tiles'); for (const [t, p] of pages) { const b = button(g, t, 'dv-tile', null, `page:${p}`); b.onclick = () => open(p); n++; } }
  if (S.map) {
    const places = teleportPlaces(S.map).filter((p) => has(p.name) || has(p.group));
    if (places.length) {
      label(body, `Places to teleport to (${places.length})`);
      const g = grid(body, 'dv-places');
      for (const p of places.slice(0, 80)) { const b = button(g, `📍 ${p.name}`, '', null, `p:${p.group}:${p.name}`); b.title = p.group; b.onclick = () => teleport(p); n++; }
    }
  }
  if (!n) body.innerHTML = `<p class="dev-none">Nothing matches "${esc(UI.q)}".</p>`;
}

export function renderDevPlayers() {
  if (S.devGive) S.devGive.refreshTargets(); // the give menu's "give to" list
  if (S.devQuickGive) S.devQuickGive.refreshTargets();
  const pl = $('dev').querySelector('.dv-t-pl span');
  const all = (S.plist && S.plist.l) || [];
  if (pl) pl.textContent = `Players online (${all.length || 1})`;
  const el = $('dev-players');
  if (!el) return;
  const ps = all.filter((q) => !q.me);
  el.innerHTML = ps.length ? '' : '<p class="dev-none">Just you right now.</p>';
  for (const q of ps) {
    const row = document.createElement('div'); row.className = 'dev-pl';
    row.innerHTML = `<span>${esc(q.n)}${q.dm ? ' <i>dev</i>' : ''}${q.god ? ' 🛡' : ''}<small>${esc(q.d || '')}${q.dead ? ' · down' : ''}</small></span>`;
    const acts = [['goto', '📍 Go to'], ['bring', '🧲 Bring'], ['gunsp', '🔫 Weapons + tools'], ['healp', '❤ Heal'], ['godp', q.god ? '🛡 Invincible: ON' : '🛡 Invincible: off'], ...(q.dm ? [] : [['grant', '🛠 Give dev']])];
    const g = grid(row, 'dv-items');
    for (const [c, text] of acts) {
      const b = button(g, text, c === 'godp' && q.god ? 'on' : '', () => { send({ t: 'dev', c, pid: q.id }); if (c === 'goto' || c === 'bring') closeOverlay('dev'); setTimeout(requestPlayers, 300); }, `pl:${q.id}:${c}`);
      void b;
    }
    el.appendChild(row);
  }
}

// ---- moving between the buttons: as they sit on screen ------------------------------------------------------------
function focusables() {
  const box = $('dev');
  return [...box.querySelectorAll('button, select, input')].filter((el) => !el.disabled && el.offsetParent !== null && !(UI.ctl === 'pad' && el.classList.contains('dv-find')));
}
function current() { return $('dev').querySelector('.pfocus'); }
function setFocus(el) {
  if (!el) return;
  $('dev').querySelectorAll('.pfocus').forEach((x) => x.classList.remove('pfocus'));
  el.classList.add('pfocus');
  if (el.tagName === 'INPUT') el.focus();
  el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}
function focusFirst() {
  $('dev').querySelectorAll('.pfocus').forEach((x) => x.classList.remove('pfocus'));
  if (UI.ctl === 'touch') return;   // (nothing lit for a finger)
  const f = focusables().filter((el) => !el.closest('.dv-head'));
  const k = UI.focusKey && f.find((el) => el.dataset.k === UI.focusKey);
  setFocus(UI.page === 'tp' ? $('dev').querySelector('.dv-chip.on') || f[0] : k || f[0]);
}
// the nearest button that way (dx, dy: -1, 0 or 1): ahead of this one, the same row or column first
function move(dx, dy) {
  const f = focusables(), cur = current();
  if (!cur || !f.includes(cur)) { focusFirst(); return; }
  const r0 = cur.getBoundingClientRect(), cx = r0.left + r0.width / 2, cy = r0.top + r0.height / 2;
  let best = null, bs = Infinity;
  for (const el of f) {
    if (el === cur) continue;
    const r = el.getBoundingClientRect(), ex = r.left + r.width / 2, ey = r.top + r.height / 2;
    const along = dx ? (ex - cx) * dx : (ey - cy) * dy;
    if (along <= 4) continue;
    const across = dx ? Math.abs(ey - cy) : Math.abs(ex - cx);
    const overlap = dx ? r.bottom > r0.top + 3 && r.top < r0.bottom - 3 : r.right > r0.left + 3 && r.left < r0.right - 3;
    const s = along + across * (overlap ? 0.3 : 2.5) + (overlap ? 0 : 60);
    if (s < bs) { bs = s; best = el; }
  }
  if (best) { setFocus(best); sfx('click', 0.25); }
}
function press(el) {
  if (!el) return;
  if (el.tagName === 'SELECT') { el.selectedIndex = (el.selectedIndex + 1) % el.options.length; el.dispatchEvent(new Event('change')); }
  else if (el.tagName === 'INPUT') el.focus();
  else el.click();
}
function devPad(inp) {
  if (UI.ctl !== 'pad' && input.device === 'gamepad') layout();
  const el = current();
  if (inp.menuNav) { if (!el) focusFirst(); else move(0, inp.menuNav); }
  if (inp.menuLR) {
    if (el && el.tagName === 'SELECT') { el.selectedIndex = (el.selectedIndex + inp.menuLR + el.options.length) % el.options.length; el.dispatchEvent(new Event('change')); }
    else if (!el) focusFirst(); else move(inp.menuLR, 0);
  }
  if (inp.menuTab) step(inp.menuTab);
  if (inp.menuSelect) { if (el) press(el); else focusFirst(); }
  if (inp.menuBack) goBack();
  if (inp.padStart) { while (topOverlay()) closeOverlay(); }
  return true;
}
function devKey(k) {
  if (UI.ctl !== 'kb' && input.device === 'keyboard') layout();
  const el = current();
  const dir = { ArrowUp: [0, -1], KeyW: [0, -1], ArrowDown: [0, 1], KeyS: [0, 1], ArrowLeft: [-1, 0], KeyA: [-1, 0], ArrowRight: [1, 0], KeyD: [1, 0] }[k];
  if (dir) {
    if (el && el.tagName === 'SELECT' && dir[0]) { el.selectedIndex = (el.selectedIndex + dir[0] + el.options.length) % el.options.length; el.dispatchEvent(new Event('change')); return true; }
    if (!el) focusFirst(); else move(dir[0], dir[1]);
    return true;
  }
  if (k === 'Enter' || k === 'Space' || k === 'KeyE') { if (el) press(el); else focusFirst(); return true; }
  if (k === 'Escape' || k === 'Backspace') { goBack(); return true; }
  if (k === 'BracketLeft' || k === 'PageUp' || k === 'KeyQ') { step(-1); return true; }
  if (k === 'BracketRight' || k === 'PageDown') { step(1); return true; }
  if (k === 'Slash' || k === 'KeyF') {
    if (UI.page !== 'home' && UI.page !== 'tp' && UI.page !== 'find') { UI.page = 'home'; render(); }
    const f = $('dev').querySelector('.dv-find');
    if (f) { setFocus(f); f.focus(); }
    return true;
  }
  return k !== 'Backquote';   // (the backtick closes it: main.js)
}
