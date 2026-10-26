// The hub's SETTINGS and PEOPLE tabs (UI-3, one hub instead of five ways in), loaded the first time either opens
// (client/main.js loadHub). Settings in sections - Controls · Sound · Graphics · Account · Help, the Danger zone apart -
// with the controls for the device you're on (the others one tab away), every row 44 px; Help holds what the old pause
// list had besides the tabs: unstuck, surrender, cinematic mode, fullscreen, exit to the title, installing, and the
// debug menu last and quiet. People: who's online (main.js renderPlayers fills it) and your crew (the Crew app's view).
import { KB, PAD, TOUCH } from '../shared/controls.js';
import { crewHtml, wireCrew } from './phone.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// what each action is called, grouped as you'd look for it: [group, [[action, words]...]]
export const BIND_GROUPS = [
  ['ON FOOT', [['move', 'Move'], ['sprint', 'Sprint'], ['aim', 'Aim'], ['fire', 'Attack or fire'], ['block', 'Block (fists, a bat, a blade)'], ['dive', 'Dive roll'], ['action', 'Interact'], ['throw', 'Throw or drop a crate'], ['reload', 'Reload'], ['nextw', 'Next weapon'], ['wpnwheel', 'Pick a weapon'], ['use', 'Quick wheel (items)'], ['light', 'Flashlight'], ['dance', 'Dance']]],
  ['AT THE WHEEL', [['vehicle', 'Get in or out'], ['gas', 'Gas'], ['brake', 'Brake, reverse'], ['steer', 'Steer'], ['horn', 'Horn and siren'], ['drivefire', 'Drive-by'], ['cruiser', 'Call a cruiser (police)']]],
  ['IN THE AIR', [['climb', 'Climb'], ['descend', 'Descend'], ['vehicle', 'Get out (again: jump)']]],
  ['MENUS', [['hub', 'Open the menu'], ['hubtab', 'Change tab'], ['map', 'Map'], ['phone', 'Phone'], ['bag', 'Bag'], ['back', 'Back']]],
];
export const DEVICES = [['kbm', 'Keyboard and mouse'], ['pad', 'Gamepad'], ['touch', 'Touch']];
// a binding's chip for a device: the controls tables (shared/controls.js), one source for every hint in the game
export function bindChip(dev, a) {
  const t = dev === 'pad' ? (PAD[a] || [''])[0] : dev === 'touch' ? TOUCH[a] : KB[a];
  return t ? `<span class="kchip">${esc(t)}</span>` : '<span class="kchip off">-</span>';
}
export function bindsHtml(dev) {
  return BIND_GROUPS.map(([g, rows]) => `<div class="set-binds"><h4>${g}</h4>${rows.filter(([a]) => (dev === 'pad' ? PAD[a] : dev === 'touch' ? TOUCH[a] : KB[a])).map(([a, w]) => `<div class="set-bind"><span>${esc(w)}</span>${bindChip(dev, a)}</div>`).join('')}</div>`).join('');
}
export const devOf = (d) => (d === 'gamepad' ? 'pad' : d === 'touch' ? 'touch' : 'kbm');

// ctx (client/main.js): { $, S, input, send, closeOverlay, topOverlay, refocus, unstuck, surrender(btn), cine, fullscreen,
//   exitToTitle, openDebug, leaveDev, openInstall, repairInstall, openCreator, crew() (the Crew app's last message) }
export function createHub(ctx) {
  const { $ } = ctx;
  let sec = 'controls', dev = null;
  const nav = $('set-nav');
  function showSec(s) {
    sec = s;
    for (const b of nav.querySelectorAll('[data-sec]')) { b.classList.toggle('on', b.dataset.sec === s); b.setAttribute('aria-selected', b.dataset.sec === s); }
    for (const el of $('settings').querySelectorAll('section[data-sec]')) el.hidden = el.dataset.sec !== s;
    $('set-body').scrollTop = 0;
    ctx.refocus();
  }
  function showDev(d) {
    dev = d;
    for (const b of $('set-dev').querySelectorAll('[data-dev]')) { b.classList.toggle('on', b.dataset.dev === d); b.setAttribute('aria-selected', b.dataset.dev === d); }
    $('set-binds').innerHTML = bindsHtml(d);
    // the options for that device only (a keyboard's driving, a pad's, vibration on a pad or a phone)
    for (const el of $('settings').querySelectorAll('[data-for]')) el.hidden = !el.dataset.for.split(' ').includes(d);
    $('set-note').textContent = `Only the ${DEVICES.find((q) => q[0] === d)[1].toLowerCase()} controls show here. ${DEVICES.filter((q) => q[0] !== d).map((q) => q[1]).join(' and ')}: one tab away.`;
  }
  for (const b of nav.querySelectorAll('[data-sec]')) b.onclick = () => showSec(b.dataset.sec);
  for (const b of $('set-dev').querySelectorAll('[data-dev]')) b.onclick = () => { showDev(b.dataset.dev); ctx.refocus(); };
  // Help: what the old pause menu held
  const help = {
    unstuck: () => { ctx.closeOverlay(); ctx.unstuck(); },
    surrender: (b) => ctx.surrender(b),
    cine: () => { ctx.closeOverlay(); ctx.cine(); },
    fullscreen: () => ctx.fullscreen(),
    title: () => { ctx.closeOverlay(); ctx.exitToTitle(); },
    install: () => ctx.openInstall(),
    look: () => { ctx.closeOverlay(); ctx.openCreator(); },
    devmode: () => { ctx.closeOverlay(); ctx.leaveDev(); },
    dev: () => { ctx.closeOverlay(); ctx.openDebug(); },
  };
  for (const b of $('settings').querySelectorAll('[data-h]')) b.onclick = () => help[b.dataset.h](b);

  return {
    // the Settings tab opened (also from the title screen: no game to unstick or leave, so those rows hide)
    settings() {
      const play = !!ctx.S.playing;
      for (const el of $('settings').querySelectorAll('.play-only')) el.hidden = !play;
      $('h-devmode').hidden = !play || !ctx.S.devMode || !!ctx.S.practice;
      if (!dev) dev = devOf(ctx.input.device);
      showDev(dev); showSec(sec);
    },
    get section() { return sec; },
    showSec, showDev,
    // the People tab: the crew under the players online
    people() {
      const c = ctx.crew(), el = $('pp-crew');
      if (!c) { el.innerHTML = '<p class="ph-empty">Loading…</p>'; return; }
      el.innerHTML = crewHtml(c, (d) => `${Math.round(d / 32)}m`, true);
      wireCrew(el, () => ctx.crew(), { send: ctx.send, toast: ctx.toast, setWaypoint: ctx.setWaypoint, close: () => ctx.closeOverlay() });
      ctx.refocus();
    },
  };
}
