// The knocked-out screen (task #403, reworked for UI-4 to the LandDeath mockup; hud.js loads it a few seconds into the
// game, so the page doesn't carry it). Its phases (deathPanel):
//   - 'scene': for DEATH_REVEAL_S only the title over where it happened, the camera pulling back (main.js), red at the
//     edges round it (U11);
//   - 'open': the map of the places to wake up beside the panel (upright: the map over it) - KNOCKED OUT (or WASTED),
//     how it happened (on a phone too), the choices while you're down (call for help, the ambulance or the rescue boat,
//     cancel the request), the places to wake up as numbered rows matching the numbered marks on the map (tap either),
//     WAKE UP HERE and the time till you wake on your own;
//   - 'bar': the back control (Esc, B on a pad, ▾ HIDE) - or WAKE UP HERE - folds it to a slim bar with the countdown, to
//     watch the scene; the same control, or a tap on the bar, opens it again.
// Waking up always comes when the timer runs out (shared/rules.js RESPAWN_SECONDS: "whatever you press"): WAKE UP HERE
// settles the place and folds the choices away. The choices take keys and pad buttons only while they show (main.js
// reads hud.deathRevealed): H / X call for help, J / Y the ambulance, C / LB cancel, the arrows / the D-pad the next
// place that way on the map, Enter / A wake up here. While the screen is up a timer redraws it four times a second.
import { DEATH_REVEAL_S } from '../shared/rules.js';
import { input } from './input.js';
import { keyName } from './glyphs.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const WAKE_ROWS = 5;   // the places listed (and marked): the nearest few, your homes among them

// the phase for D { at: when you went down, fold } at now (ms): 'off' alive, 'scene', then 'open' or 'bar'
export function deathPanel(D, dead, now) {
  if (!dead) { D.at = 0; D.fold = false; D.fit = false; return 'off'; }
  if (!D.at) D.at = now;
  return now - D.at < DEATH_REVEAL_S * 1000 ? 'scene' : D.fold ? 'bar' : 'open';
}
// the back control: folds the choices away, or opens them again - only once they're up (true if it did)
export function deathFold(D, now) {
  if (!D.at || now - D.at < DEATH_REVEAL_S * 1000) return false;
  D.fold = !D.fold;
  return true;
}
// the seconds left before you wake up: the server's count (me.respawnIn) run on from when that update came in
export function deathLeft(D, me, now) {
  if (D.me !== me) { D.me = me; D.meAt = now; }
  return Math.max(0, (me.respawnIn || 0) - (now - D.meAt) / 1000);
}
// what the screen offers for a self record: { title, cause, help: [[action, label, cls, disabled]], places: [the rows,
// nearest first, the picked one among them], wake } - the same flow down (revivable) and wasted
export function deathChoices(me, pick = null) {
  const dn = me.down, down = !!(dn && !dn.finished), opts = me.spawnOpts || [], at = me.deadAt || null;
  const far = (o) => (at && o.x !== undefined ? Math.hypot(o.x - at[0], o.y - at[1]) : 0);
  const chosenId = pick ?? me.spawnChoice;
  const sorted = [...opts].sort((a, b) => far(a) - far(b));
  let places = sorted.slice(0, WAKE_ROWS);
  const ch = opts.find((o) => o.id === chosenId);
  if (ch && !places.includes(ch)) places = [...places.slice(0, WAKE_ROWS - 1), ch];
  const wet = dn && dn.wet, aw = wet ? 'rescue boat' : 'ambulance';
  const help = !down ? [] : [
    ['help', dn.help ? 'Call again' : 'Call for help', 'help', false],
    dn.amb ? ['ambx', `Cancel the ${aw}`, 'amb on', false] : ['amb', `${wet ? 'Rescue boat' : 'Ambulance'} $${dn.fee}${dn.ambUsed ? ' (used)' : ''}`, 'amb', !dn.canAmb],
    ...(dn.help ? [['cancel', 'Cancel request', 'cancel', false]] : []),
  ];
  return { title: down ? 'KNOCKED OUT' : 'WASTED', cause: me.deathCause || '', help, places: places.map((o) => ({ ...o, d: far(o) / 32, on: !!ch && o.id === ch.id })), chosen: ch || places[0] || null, wake: !!(ch || places.length), down, fee: dn ? dn.fee : 0, wet, canAmb: !!(dn && dn.canAmb) };
}
const km = (m) => (m >= 1000 ? `${(m / 1000).toFixed(1)} KM` : `${Math.max(10, Math.round(m / 10) * 10)} M`);
const left = (s) => (s >= 60 ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}` : `${Math.ceil(s)} S`);

const CSS = `
#d-panel { position: absolute; left: 50%; bottom: max(16px, env(safe-area-inset-bottom)); transform: translate(-50%, 14px); opacity: 0; z-index: 16; box-sizing: border-box;
  width: min(1000px, calc(100vw - 32px)); height: min(520px, calc(100vh - 32px)); display: grid; grid-template-columns: minmax(0, 1.1fr) minmax(300px, 1fr); gap: var(--s3);
  transition: opacity .4s ease, transform .4s ease; color: var(--cream); font: 600 var(--fs-3) var(--ui); }
#death.reveal #d-panel { opacity: 1; transform: translate(-50%, 0); pointer-events: auto; }
#d-panel > section { position: relative; min-height: 0; display: flex; flex-direction: column; background: var(--panel-bg); border: 2px solid var(--gold); border-radius: var(--r2); box-shadow: var(--shadow); overflow: hidden; }
#d-map canvas { flex: 1; min-height: 0; width: 100%; display: block; touch-action: none; cursor: crosshair; }
#d-map .dm-tip { position: absolute; left: var(--s3); bottom: var(--s2); font: 600 var(--fs-2) var(--ui); color: var(--cream); text-shadow: var(--halo-s); pointer-events: none; }
#d-side { padding: var(--s3) var(--s4); gap: var(--s2); }
#d-side h2 { margin: 0; display: flex; align-items: center; gap: var(--s2); font: 700 var(--fs-5) var(--pixel); letter-spacing: 2px; color: var(--danger); text-shadow: var(--lift); }
#d-side h2 .d-x { margin-left: auto; }
#d-cause { margin: 0; color: var(--cream); font: 600 var(--fs-3) var(--ui); line-height: 1.25; }
#d-help { display: flex; flex-wrap: wrap; gap: 6px; }
#d-help:empty { display: none; }
#d-help button, .d-x { min-height: var(--tap); padding: 0 var(--s3); border-radius: var(--r2); border: 2px solid var(--gold-a); background: var(--navy); color: var(--cream); font: 700 var(--fs-2) var(--ui); cursor: pointer; touch-action: manipulation; }
#d-help .help { border-color: var(--danger); background: var(--danger-t); }
#d-help .amb.on { border-color: var(--cream); background: var(--navy3); }
#d-help button:disabled { opacity: .45; cursor: default; }
#d-help small { flex-basis: 100%; color: var(--dim); font-size: var(--fs-2); }
#d-side i.k { font-style: normal; margin-left: 6px; padding: 0 var(--s1); border-radius: var(--r1); background: var(--cream); color: var(--ink); font: 700 var(--fs-1) var(--pixel); }
#d-side .d-lbl { font: 400 var(--fs-2) var(--pixel); letter-spacing: 1px; color: var(--gold); }
#d-rows { flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 6px; }
#d-rows button { display: flex; align-items: center; gap: 10px; min-height: var(--tap-l); padding: 0 var(--s3); border-radius: var(--r2); border: 2px solid var(--edge); background: var(--navy); color: var(--cream); font: 700 var(--fs-3) var(--ui); text-align: left; cursor: pointer; touch-action: manipulation; }
#d-rows button.on { border-color: var(--gold); background: var(--navy3); }
#d-rows .n { flex: none; display: grid; place-items: center; width: 26px; height: 26px; border-radius: var(--r3); background: var(--danger); color: var(--ink); font: 700 var(--fs-2) var(--pixel); }
#d-rows button.on .n { background: var(--gold); }
#d-rows .nm { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
#d-rows .dd { flex: none; font: 400 var(--fs-2) var(--pixel); color: var(--dim); }
#d-go { display: flex; align-items: center; gap: var(--s3); }
#d-wake { flex: 1; min-height: 52px; border: 0; border-radius: var(--r2); background: var(--gold); color: var(--ink); font: 700 var(--fs-4) var(--ui); letter-spacing: .5px; cursor: pointer; touch-action: manipulation; }
#d-wake:active { transform: scale(.97); }
#d-auto { flex: none; text-align: right; font: 400 var(--fs-2) var(--pixel); color: var(--dim); line-height: 1.3; }
#d-bar { display: none; }
#death.fold #d-panel { width: auto; height: auto; max-width: calc(100vw - 32px); display: block; cursor: pointer; }
#death.fold #d-panel > section { display: none; }
#death.fold #d-bar { display: flex; align-items: center; gap: var(--s3); min-height: var(--tap); padding: 0 var(--s4); background: var(--panel-bg); border: 2px solid var(--gold); border-radius: var(--r2); box-shadow: var(--shadow); font: 600 var(--fs-3) var(--ui); }
#d-bar b { font: 700 var(--fs-3) var(--pixel); letter-spacing: 2px; color: var(--danger); }
#d-bar .open { color: var(--gold); }
@media (max-height: 520px) { #d-panel { height: calc(100vh - 24px); bottom: 12px; width: calc(100vw - 24px); gap: var(--s2); } #d-side { padding: var(--s2) var(--s3); gap: 6px; } #d-side h2 { font-size: var(--fs-4); } #d-rows button { min-height: var(--tap); } #d-wake { min-height: var(--tap); font-size: var(--fs-3); } }
@media (max-aspect-ratio: 1/1) { #d-panel { grid-template-columns: minmax(0, 1fr); grid-template-rows: minmax(0, 38%) minmax(0, 1fr); top: max(12px, env(safe-area-inset-top)); bottom: max(12px, env(safe-area-inset-bottom)); height: auto; width: calc(100vw - 24px); } }
`;

let wired = false, timer = 0;
function build(H) {
  const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
  const p = document.createElement('div');
  p.id = 'd-panel';
  p.innerHTML = '<section id="d-map"><canvas></canvas><span class="dm-tip">Tap a marker or a row to choose</span></section>'
    + '<section id="d-side"><h2><span id="d-tag">KNOCKED OUT</span><button class="d-x" type="button" id="d-hide"></button></h2><p id="d-cause"></p><div id="d-help"></div><span class="d-lbl">WAKE UP AT</span><div id="d-rows"></div>'
    + '<div id="d-go"><button id="d-wake" type="button">WAKE UP HERE</button><span id="d-auto"></span></div></section>'
    + '<div id="d-bar"><b id="d-bar-t"></b><span id="d-bar-l"></span><span class="open" id="d-bar-o"></span></div>';
  $('death').appendChild(p);
  p.addEventListener('click', (e) => {
    if (H.dp.fold) { back(H); return; }
    if (e.target.closest('#d-hide')) { back(H); return; }
    if (e.target.closest('#d-wake')) { wake(H); return; }
    const r = e.target.closest('#d-rows [data-id]');
    if (r) { const o = (H.me.spawnOpts || []).find((q) => q.id === r.dataset.id); if (o) pick(H, o); return; }
    const hb = e.target.closest('#d-help [data-a]');
    if (hb && !hb.disabled) H.onDown?.(hb.dataset.a);
  });
  mapInput(H, p.querySelector('canvas'));
}

// H: the HUD (client/hud.js): H.dp the panel's state, H.spawnPick a spot picked here and not yet echoed by the server
export function draw(H, me) {
  const d = $('death'), now = performance.now(), ph = deathPanel(H.dp, !!me.dead, now);
  H.deathRevealed = ph === 'open';
  if (ph !== 'off' && !timer) { timer = setInterval(() => { if (H.me) draw(H, H.me); }, 250); timer.unref?.(); }
  else if (ph === 'off' && timer) { clearInterval(timer); timer = 0; }
  if (ph === 'off') { d.classList.add('hidden'); d.classList.remove('reveal', 'fold'); H.spawnPick = null; H.dp.me = null; H.dp.woke = false; return; }
  if (!wired) { wired = true; build(H); }
  d.classList.remove('hidden'); d.classList.toggle('reveal', ph !== 'scene'); d.classList.toggle('fold', ph === 'bar');
  const opts = me.spawnOpts || [];
  // (a spot picked here shows at once; the server's echo of it clears the pick)
  if (H.spawnPick === me.spawnChoice || !opts.some((o) => o.id === H.spawnPick)) H.spawnPick = null;
  const C = deathChoices(me, H.spawnPick);
  if ($('d-title').textContent !== C.title) $('d-title').textContent = $('d-tag').textContent = C.title;
  if ($('d-cause').textContent !== C.cause) $('d-cause').textContent = C.cause;
  const kb = input.device === 'keyboard', pad = input.device === 'gamepad';
  const k = (key, padBtn) => (kb ? ` <i class="k">${key}</i>` : pad ? ` <i class="k">${padBtn}</i>` : '');
  const bk = kb || pad ? ` <i class="k">${keyName('back')}</i>` : '';
  const hideH = `▾ HIDE${bk}`;
  if ($('d-hide').innerHTML !== hideH) $('d-hide').innerHTML = hideH;
  // the choices while you're down (the same order as ever: call for help, the ambulance, cancel)
  const keys = { help: ['H', 'X'], amb: ['J', 'Y'], ambx: ['J', 'Y'], cancel: ['C', 'LB'] };
  const hsig = C.help.map((b) => b.join()).join('|') + input.device;
  const hb = $('d-help');
  if (hb.dataset.sig !== hsig) {
    hb.dataset.sig = hsig;
    hb.innerHTML = C.help.map(([a, l, cls, dis]) => `<button type="button" class="${cls}" data-a="${a}"${dis ? ' disabled' : ''}>${a === 'help' ? '✚ ' : a === 'cancel' ? '✕ ' : C.wet ? '🚤 ' : '🚑 '}${esc(l)}${k(...keys[a])}</button>`).join('')
      + (C.down && !C.canAmb && !me.down.amb && !me.down.ambUsed ? `<small>(${C.wet ? 'a rescue boat' : 'an ambulance'} needs $${C.fee} in the bank)</small>` : '');
  }
  // the places to wake up: numbered rows, the same numbers on the map
  const rows = $('d-rows'), rsig = C.places.map((o) => o.id + (o.on ? '*' : '')).join();
  if (rows.dataset.sig !== rsig) {
    rows.dataset.sig = rsig;
    rows.innerHTML = C.places.map((o, i) => `<button type="button" data-id="${esc(o.id)}" class="${o.on ? 'on' : ''}"><span class="n">${o.kind === 'home' ? '⌂' : i + 1}</span><span class="nm">${esc(o.label)}</span>${me.deadAt && o.x !== undefined ? `<span class="dd">${km(o.d)}</span>` : ''}</button>`).join('');
    requestAnimationFrame(() => rows.querySelector('.on')?.scrollIntoView({ block: 'nearest' }));
  }
  const rem = deathLeft(H.dp, me, now), dn = me.down;
  const auto = rem > 0 ? (C.down && dn.help ? `HELP COMING<br>AUTO IN ${left(rem)}` : `AUTO IN<br>${left(rem)}`) : 'WAKING...';
  if ($('d-auto').innerHTML !== auto) $('d-auto').innerHTML = auto;
  const wk = H.dp.woke ? `✓ WAKING UP HERE${kb ? ' <i class="k">ENTER</i>' : pad ? ' <i class="k">A</i>' : ''}` : `WAKE UP HERE${kb ? ' <i class="k">ENTER</i>' : pad ? ' <i class="k">A</i>' : ''}`;
  if ($('d-wake').innerHTML !== wk) $('d-wake').innerHTML = wk;
  $('d-wake').disabled = !C.wake;
  // the bar, folded
  $('d-bar-t').textContent = C.title;
  const bl = C.chosen ? `Waking up at ${C.chosen.label} in ${left(rem).toLowerCase()}` : `Waking up in ${left(rem).toLowerCase()}`;
  if ($('d-bar-l').textContent !== bl) $('d-bar-l').textContent = bl;
  const bo = kb || pad ? `▴ the choices${bk}` : '▴ tap for the choices';
  if ($('d-bar-o').innerHTML !== bo) $('d-bar-o').innerHTML = bo;
  spawnMap(H, me, C, ph === 'open');
}
// the back control (Esc, B, ▾ HIDE, a tap on the bar): fold or open the choices; false before they're up
export function back(H) {
  if (!deathFold(H.dp, performance.now())) return false;
  if (H.me) draw(H, H.me);
  return true;
}
// WAKE UP HERE (Enter, A, the button): the place settled - you wake there when the timer's out - and the choices folded
// away to watch
export function wake(H) {
  const me = H.me;
  if (!me || !me.dead || !H.deathRevealed) return false;
  const C = deathChoices(me, H.spawnPick);
  if (C.chosen) { H.spawnPick = C.chosen.id; H.onRespawn?.(C.chosen.id); }
  H.dp.woke = true;
  if (!H.dp.fold) deathFold(H.dp, performance.now());
  draw(H, me);
  return true;
}
// the next (1) or the previous (-1) place to wake up - with the map up, the next one that way on it (ax: 'h' the
// arrows left and right, 'v' up and down)
export function step(H, s, ax) {
  const me = H.me, opts = (me && me.spawnOpts) || [];
  if (!opts.length || !H.deathRevealed) return;
  const C = deathChoices(me, H.spawnPick), list = C.places.length ? C.places : opts;
  const i = Math.max(0, list.findIndex((o) => o.on));
  let o = list[(i + s + list.length) % list.length];
  const c = list[i];
  if (SM.wm && ax && c && c.x !== undefined) {
    let best = null, bs = Infinity;
    for (const q of list) {
      if (q.id === c.id || q.x === undefined) continue;
      const dx = q.x - c.x, dy = q.y - c.y, along = (ax === 'h' ? dx : dy) * s, side = Math.abs(ax === 'h' ? dy : dx);
      if (along <= 0) continue;
      const sc = along + side * 2;
      if (sc < bs) { bs = sc; best = q; }
    }
    if (best) o = best;
  }
  pick(H, opts.find((q) => q.id === o.id) || o);
}
function pick(H, o) {
  H.spawnPick = o.id; H.onRespawn?.(o.id); H.dp.woke = false;
  if (SM.wm && o.x !== undefined) SM.keepInView(o);
  draw(H, H.me);
}

// ---- the map of the places to wake up (client/worldmap.js, loaded with the screen) ------------------------------
const SM = { wm: null, loading: null, places: [], hits: [], at: null, fitted: false, keepInView: () => {} };
function spawnMap(H, me, C, show) {
  if (!show && SM.wm) return;   // (fetched as you go down, while the scene plays: ready when the choices come up)
  const c = $('d-panel').querySelector('canvas');
  if (!SM.wm) {
    SM.loading ||= import('./worldmap.js').then((M) => { SM.wm = M.createWorldMap(H.map); SM.fitted = false; if (H.me) draw(H, H.me); }).catch((e) => { SM.loading = null; console.warn('[deathscreen] the map', e); });
    return;
  }
  if (SM.wm.map !== H.map) { SM.wm = null; SM.loading = null; return; }
  SM.places = C.places; SM.at = me.deadAt || null; SM.chosen = C.chosen;
  if (!SM.fitted) SM.fitted = fit(H, c);
  render(H, c);
}
function mapInput(H, c) {
  const pts = new Map();
  let drag = 0, pinch = 0;
  c.addEventListener('pointerdown', (e) => { c.setPointerCapture(e.pointerId); pts.set(e.pointerId, [e.offsetX, e.offsetY]); drag = 0; if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = Math.hypot(a[0] - b[0], a[1] - b[1]); } });
  c.addEventListener('pointermove', (e) => {
    const p = pts.get(e.pointerId);
    if (!p || !SM.wm) return;
    if (pts.size === 2) {
      pts.set(e.pointerId, [e.offsetX, e.offsetY]);
      const [a, b] = [...pts.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      if (pinch > 0 && d > 0) SM.wm.zoom(d / pinch, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, c.clientWidth, c.clientHeight);
      pinch = d; drag = 99; render(H, c); return;
    }
    const dx = e.offsetX - p[0], dy = e.offsetY - p[1];
    drag += Math.abs(dx) + Math.abs(dy);
    if (drag > 6) { SM.wm.pan(dx, dy); render(H, c); }
    pts.set(e.pointerId, [e.offsetX, e.offsetY]);
  });
  const up = (e) => {
    const was = pts.has(e.pointerId), n = pts.size;
    pts.delete(e.pointerId);
    if (!was || n > 1 || drag > 6 || e.type === 'pointercancel') return;
    let best = null, bd = 30;   // a tap: the mark under it (or nearest it, within reach)
    for (const [x, y, o] of SM.hits) { const d = Math.hypot(x - e.offsetX, y - e.offsetY); if (d < bd) { bd = d; best = o; } }
    if (best) pick(H, (H.me.spawnOpts || []).find((q) => q.id === best.id) || best);
  };
  c.addEventListener('pointerup', up); c.addEventListener('pointercancel', up);
  c.addEventListener('wheel', (e) => { e.preventDefault(); e.stopPropagation(); if (SM.wm) { SM.wm.zoom(e.deltaY < 0 ? 1.25 : 0.8, e.offsetX, e.offsetY, c.clientWidth, c.clientHeight); render(H, c); } }, { passive: false });
  // a picked spot off the map's edge (zoomed in): the view moves to it
  SM.keepInView = (o) => {
    const wm = SM.wm, [ox, oy] = wm.origin, sc = wm.scale, x = (o.x - ox) * sc, y = (o.y - oy) * sc;
    if (x < 20 || y < 20 || x > c.clientWidth - 20 || y > c.clientHeight - 20) wm.center(o.x, o.y);
  };
}
// the view at first: where you went down and the places listed in sight
function fit(H, c) {
  const wm = SM.wm, cw = c.clientWidth, ch = c.clientHeight, at = SM.at;
  if (!cw || !ch) return false;
  const pts = [];
  if (at) pts.push(at);
  for (const o of SM.places.slice(0, 3)) if (o.x !== undefined) pts.push([o.x, o.y]);
  if (SM.chosen && SM.chosen.x !== undefined) pts.push([SM.chosen.x, SM.chosen.y]);
  if (!pts.length) return true;
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  wm.view.z = 1;
  wm.draw(c, { me: null, mini: H.mini }, 0, 0, 0, { cats: new Set() });   // (works out the fit for this size)
  const need = Math.max((x1 - x0 + 2400) * wm.fit / cw, (y1 - y0 + 2400) * wm.fit / ch);
  wm.view.z = Math.max(1, Math.min(6, 1 / need));
  wm.center((x0 + x1) / 2, (y0 + y1) / 2);
  return true;
}
function render(H, c) {
  const wm = SM.wm;
  if (!wm || !c.clientWidth) return;
  const at = SM.at;
  // the ground, the railway, the district names - no places' icons: only the numbered places to wake up
  wm.draw(c, { me: null, mini: H.mini }, -1e6, -1e6, 0, { cats: new Set() });
  const g = c.getContext('2d'), [ox, oy] = wm.origin, sc = wm.scale;
  const P = (x, y) => [(x - ox) * sc, (y - oy) * sc];
  const css = getComputedStyle(document.documentElement), col = (k) => css.getPropertyValue(k).trim();
  const ink = col('--ink'), gold = col('--gold'), danger = col('--danger'), cream = col('--cream');
  g.font = '700 14px "CLA Pixel", "Barlow Condensed", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  if (at) {   // where you fell: a red ring, its name over it
    const [x, y] = P(at[0], at[1]);
    g.strokeStyle = danger; g.lineWidth = 3; g.beginPath(); g.arc(x, y, 9, 0, 6.28); g.stroke();
    g.font = '700 14px "Barlow Condensed", sans-serif'; g.fillStyle = ink; g.fillText('You fell here', x + 1, y - 21); g.fillStyle = cream; g.fillText('You fell here', x, y - 22);
  }
  SM.hits = [];
  g.font = '700 14px "CLA Pixel", "Barlow Condensed", sans-serif';
  SM.places.forEach((o, i) => {
    if (o.x === undefined) return;
    const [x, y] = P(o.x, o.y), on = o.on, r = on ? 18 : 15;
    if (x < -20 || y < -20 || x > c.clientWidth + 20 || y > c.clientHeight + 20) return;
    if (on) { g.fillStyle = 'rgba(226,189,87,.3)'; g.beginPath(); g.arc(x, y, r + 7, 0, 6.28); g.fill(); }
    g.fillStyle = on ? gold : danger; g.strokeStyle = ink; g.lineWidth = 2.5;
    g.beginPath(); g.arc(x, y, r, 0, 6.28); g.fill(); g.stroke();
    g.fillStyle = ink; g.fillText(o.kind === 'home' ? '⌂' : String(i + 1), x, y + 1);
    SM.hits.push([x, y, o]);
  });
}
