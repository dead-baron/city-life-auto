// The death screen (task #403; hud.js loads it the first time you go down, so the page doesn't carry it). The owner:
// "The death menu shouldn't cover the screen, and you can back out of its buttons (call for help, call an ambulance,
// select spawn) to see the scene without them." Its phases (deathPanel):
//   - 'scene': for DEATH_REVEAL_S only the title over where it happened, the camera pulling back (main.js), red at the
//     edges round it (U11);
//   - 'open': the choices in a compact panel docked at the bottom (U11) - how you went down, the countdown, Call for
//     help, the ambulance, cancel the request, and where to wake up, one spot at a time with arrows by it;
//   - 'bar': the back control (Esc, B on a pad, the panel's ▾ hide button) folds the panel to a slim bar with the
//     countdown and how to bring the choices back; the same control, or a tap on the bar, opens it again.
// The choices take keys and pad buttons only while they show (main.js reads hud.deathRevealed). While the screen is up a
// timer redraws it four times a second: the choices come up on time and the countdown runs on between the server's
// updates (about one a second).
// The spawn map (the owner, 10-23: "a spawn point map when you are choosing a place to spawn so you can see it on the
// map"): with the choices, a card with the world map (client/worldmap.js, loaded then) - every place you can wake up
// marked (the hospitals, the clinics and first-aid posts, the ranger stations, the homes you own), the one picked
// ringed in yellow with its name, the nearest to where you went down tagged, you where you fell - and under it the
// places nearest first. Tap or click one on the map or in the list to pick it; the arrow keys / the D-pad step to the
// next one that way on the map; drag to look round, the wheel or a pinch to zoom. ✕ folds the map away (the panel's
// 🗺 brings it back); it goes with the choices when they're folded.
import { DEATH_REVEAL_S } from '../shared/rules.js';
import { input } from './input.js';
import { keyName } from './glyphs.js';
import { drawIcon } from './pixicons.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// the phase for D { at: when you went down, fold } at now (ms): 'off' alive, 'scene', then 'open' or 'bar'
export function deathPanel(D, dead, now) {
  if (!dead) { D.at = 0; D.fold = false; D.noMap = false; D.fit = false; return 'off'; }
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

let wired = false, timer = 0;
// H: the HUD (client/hud.js): H.dp the panel's state, H.spawnPick a spot picked here and not yet echoed by the server
export function draw(H, me) {
  const d = $('death'), now = performance.now(), ph = deathPanel(H.dp, !!me.dead, now);
  H.deathRevealed = ph === 'open';
  if (ph !== 'off' && !timer) { timer = setInterval(() => { if (H.me) draw(H, H.me); }, 250); timer.unref?.(); }
  else if (ph === 'off' && timer) { clearInterval(timer); timer = 0; }
  if (!wired) {
    wired = true;
    $('d-panel').addEventListener('click', (e) => {
      if (H.dp.fold || e.target.closest('#d-hide')) { back(H); return; }
      if (e.target.closest('.d-mapb')) { H.dp.noMap = !H.dp.noMap; draw(H, H.me); return; }
      const s = e.target.closest('.d-step'); if (s) step(H, +s.dataset.s);
    });
  }
  if (ph === 'off') { d.classList.add('hidden'); d.classList.remove('reveal', 'fold'); H.spawnPick = null; H.dp.me = null; spawnMap(H, me, null, false); return; }
  d.classList.remove('hidden'); d.classList.toggle('reveal', ph !== 'scene'); d.classList.toggle('fold', ph === 'bar');
  const dn = me.down, down = !!(dn && !dn.finished), opts = me.spawnOpts || [];
  // (a spot picked here shows at once; the server's echo of it clears the pick)
  if (H.spawnPick === me.spawnChoice || !opts.some((o) => o.id === H.spawnPick)) H.spawnPick = null;
  const ci = Math.max(0, opts.findIndex((o) => o.id === (H.spawnPick ?? me.spawnChoice))), chosen = opts[ci];
  const title = down ? 'DOWN' : 'WASTED';
  if ($('d-title').textContent !== title) $('d-title').textContent = $('d-tag').textContent = title;
  const cause = me.deathCause || '';
  if ($('d-cause').textContent !== cause) $('d-cause').textContent = cause;
  const rem = deathLeft(H.dp, me, now), left = Math.ceil(rem), at = chosen ? ' at ' + chosen.label : '';
  const tt = rem > 0 ? (down
    ? `${dn.help ? 'Waiting for help' : 'You can still be revived'} · waking up${at} in ${left >= 60 ? `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}` : left + 's'}`
    : `Waking up${at} in ${left}...`) : '';
  if ($('d-timer').textContent !== tt) $('d-timer').textContent = tt;
  const pad = input.device === 'gamepad', kb = input.device === 'keyboard';
  const k = (key, padBtn) => (kb ? ` <i>${key}</i>` : pad ? ` <i>${padBtn}</i>` : '');
  if (d.dataset.dev !== input.device) {   // the hide button and the bar's hint, for the device in hand
    d.dataset.dev = input.device;
    const bk = kb || pad ? ` <i>${keyName('back')}</i>` : '';
    $('d-hide').innerHTML = '▾ hide' + bk;
    $('d-fold').innerHTML = bk ? '▴ choices' + bk : '▴ tap for the choices';
  }
  // downed: call for help (again: re-alert), the ambulance, give up the request (back to the countdown)
  const hb = $('d-help');
  const wet = dn && dn.wet, aw = wet ? 'rescue boat' : 'ambulance', ai = wet ? '🚤' : '🚑';   // (down in the water: the rescue boat comes)
  const amb = dn && dn.amb ? ['ambx', `${ai} Cancel ${aw}${k('J', 'Y')}`, 'amb on'] : ['amb', `${ai} Call ${wet ? 'a' : 'an'} ${aw} $${dn ? dn.fee : ''}${dn && dn.ambUsed ? ' (used)' : ''}${k('J', 'Y')}`, dn && dn.canAmb ? 'amb' : 'amb off'];
  const btns = !down ? [] : !dn.help
    ? [['help', `<b class="medic">✚</b> Call for help${k('H', 'X')}`, 'help'], amb]
    : [['help', `<b class="medic">✚</b> Call again${k('H', 'X')}`, 'help'], amb, ['cancel', `✕ Cancel request${k('C', 'LB')}`, 'cancel']];
  const hsig = btns.map((b) => b[1] + b[2]).join('|');
  if (hb.dataset.sig !== hsig) {
    hb.dataset.sig = hsig; hb.innerHTML = '';
    for (const [a, html, cls] of btns) {
      const b = document.createElement('button');
      b.className = 'help-btn ' + cls; b.innerHTML = html; b.dataset.a = a;
      b.disabled = cls.endsWith('off');
      b.onclick = () => H.onDown?.(a);
      hb.appendChild(b);
    }
    if (down && !dn.canAmb && !dn.amb && !dn.ambUsed) { const n = document.createElement('small'); n.textContent = `(${wet ? 'a' : 'an'} ${aw} needs $${dn.fee} in the bank)`; hb.appendChild(n); }
  }
  // where to wake up: one spot at a time, stepped with the arrows by it (or the keys, the D-pad)
  const box = $('d-spawn'), sig = opts.map((o) => o.id).join() + '|' + (chosen && chosen.id) + '|' + input.device;
  if (box.dataset.sig !== sig) {
    box.dataset.sig = sig;
    box.innerHTML = chosen ? `<span class="d-lbl">Wake up at</span><button class="d-step" data-s="-1" aria-label="Previous spot">◀</button><b class="d-pick">${chosen.kind === 'home' ? '⌂' : '<span style="color:#e0182d">H</span>'} ${esc(chosen.label)}${opts.length > 1 ? ` <small>${ci + 1}/${opts.length}</small>` : ''}</b><button class="d-step" data-s="1" aria-label="Next spot">▶</button>${k('← →', 'D-pad')}<button class="d-step d-mapb" data-m="1" aria-label="Show the map" title="Show the map">🗺</button>` : '';
  }
  spawnMap(H, me, chosen, ph === 'open' && opts.length > 0);
}
// the back control (Esc, B, the hide button, a tap on the bar): fold or open the choices; false before they're up
export function back(H) {
  if (!deathFold(H.dp, performance.now())) return false;
  if (H.me) draw(H, H.me);
  return true;
}
// the next (1) or the previous (-1) place to wake up - with the map up, the next one that way on it (ax: 'h' the
// arrows left and right, 'v' up and down)
export function step(H, s, ax) {
  const me = H.me, opts = (me && me.spawnOpts) || [];
  if (!opts.length || !H.deathRevealed) return;
  const i = Math.max(0, opts.findIndex((o) => o.id === (H.spawnPick ?? me.spawnChoice)));
  let o = opts[(i + s + opts.length) % opts.length];
  const c = opts[i];
  if (SM && SM.on && ax && c && c.x !== undefined) {
    let best = null, bs = Infinity;
    for (const q of opts) {
      if (q === c || q.x === undefined) continue;
      const dx = q.x - c.x, dy = q.y - c.y, along = (ax === 'h' ? dx : dy) * s, side = Math.abs(ax === 'h' ? dy : dx);
      if (along <= 0) continue;
      const sc = along + side * 2;
      if (sc < bs) { bs = sc; best = q; }
    }
    if (best) o = best;
  }
  pick(H, o);
}
function pick(H, o) {
  H.spawnPick = o.id; H.onRespawn?.(o.id);
  if (SM && SM.wm && o.x !== undefined) SM.keepInView(o);
  draw(H, H.me);
}

// ---- the spawn map ---------------------------------------------------------------------------------------------
let SM = null;
const CSS = `
#d-map { position: absolute; z-index: 16; right: max(12px, env(safe-area-inset-right)); top: max(12px, env(safe-area-inset-top)); width: min(46vw, 600px); height: min(56vh, 460px);
  display: flex; flex-direction: column; box-sizing: border-box; pointer-events: auto; background: var(--panel-bg, #0d1630); border: 2px solid var(--rim, #e2bd57); border-radius: 8px;
  box-shadow: 0 0 0 2px var(--ink, #070b16), 0 8px 24px rgba(0,0,0,.5); color: var(--cream, #f6ecd0); font: 13px var(--pixel, monospace); overflow: hidden; }
#d-map.hidden { display: none; }
#d-map header { display: flex; align-items: center; gap: 8px; padding: 4px 8px; font-weight: 700; letter-spacing: 1px; }
#d-map header span { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
#d-map header small { font-weight: 400; letter-spacing: 0; color: #c9d0e4; }
#d-map header button { flex: none; font: 13px var(--pixel, monospace); color: var(--cream, #f6ecd0); background: #0b1226; border: 1px solid rgba(226,189,87,.6); border-radius: 5px; padding: 1px 8px; cursor: pointer; }
#d-map canvas { flex: 1; min-height: 0; width: 100%; display: block; touch-action: none; cursor: crosshair; }
#d-map .dm-list { display: flex; gap: 6px; overflow-x: auto; padding: 6px 8px; flex: none; scrollbar-width: thin; }
#d-map .dm-list button { flex: none; font: 12px var(--pixel, monospace); color: #fff; background: #0b1226; border: 2px solid rgba(226,189,87,.35); border-radius: 6px; padding: 4px 8px; cursor: pointer; white-space: nowrap; }
#d-map .dm-list button.on { border-color: #ffd34a; background: rgba(226,189,87,.28); }
#d-map .dm-list button.near::after { content: ' · nearest'; color: #7dffa8; }
#d-map .dm-list button small { color: #c9d0e4; }
@media (max-aspect-ratio: 1/1) { #d-map { left: max(8px, env(safe-area-inset-left)); right: max(8px, env(safe-area-inset-right)); top: max(8px, env(safe-area-inset-top)); width: auto; height: 46vh; } }
@media (max-height: 500px) and (min-aspect-ratio: 1/1) { #d-map { top: 8px; right: 8px; width: 46vw; height: calc(100vh - 128px); } }
@media (max-height: 500px) and (min-aspect-ratio: 1/1) { .touch #d-map { height: calc(100vh - 182px); } }   /* (clear of the panel's 44 px buttons) */
.d-mapb { margin-left: 6px; }
`;
// what kind of place a spot is, for its mark
const markOf = (o) => (o.kind === 'home' ? ['home', '#123a22', '#7dffa8'] : /Ranger/.test(o.label) ? ['pharmacy', '#123a22', '#9fe6a8'] : /Clinic|Urgent|First Aid|Infirmary/.test(o.label) ? ['clinic', '#0d2244', '#9fc4ff'] : ['hospital', '#3a0d14', '#ffb0b0']);
const km = (d) => (d >= 1000 ? `${(d / 1000).toFixed(1)} km` : `${Math.round(d / 10) * 10} m`);

function spawnMap(H, me, chosen, show) {
  const on = show && !H.dp.noMap;
  if (!SM) {
    if (!on) return;
    SM = { on: false, wm: null, loading: null, el: null, opts: [], hits: [] };
  }
  SM.on = on; H.sm = SM;   // (H.sm: what the map drew - its marks - for a look from the debug hook)
  if (!on) { if (SM.el) SM.el.classList.add('hidden'); return; }
  if (!SM.el) build(H);
  SM.el.classList.remove('hidden');
  if (!SM.wm) {
    SM.loading ||= import('./worldmap.js').then((M) => { SM.wm = M.createWorldMap(H.map); SM.fitted = false; if (H.me) draw(H, H.me); }).catch(() => { SM.loading = null; });
    return;
  }
  if (SM.wm.map !== H.map) { SM.wm = null; SM.loading = null; return; }
  const opts = me.spawnOpts || [], at = me.deadAt || null;
  SM.opts = opts; SM.at = at; SM.chosen = chosen;
  const far = (o) => (at && o.x !== undefined ? Math.hypot(o.x - at[0], o.y - at[1]) : 0);
  const near = opts.filter((o) => o.kind !== 'home' && o.x !== undefined).reduce((a, b) => (!a || far(b) < far(a) ? b : a), null);
  SM.near = near;
  // the list: the picked one, then nearest first
  const list = SM.el.querySelector('.dm-list'), sorted = [...opts].sort((a, b) => far(a) - far(b));
  const sig = sorted.map((o) => o.id).join() + '|' + (chosen && chosen.id);
  if (list.dataset.sig !== sig) {
    list.dataset.sig = sig; list.innerHTML = '';
    for (const o of sorted) {
      const b = document.createElement('button');
      b.className = (chosen && o.id === chosen.id ? 'on ' : '') + (near && o.id === near.id ? 'near' : '');
      b.innerHTML = `${o.kind === 'home' ? '⌂' : '✚'} ${esc(o.label)}${at && o.x !== undefined ? ` <small>${km(far(o) / 32)}</small>` : ''}`;
      b.onclick = () => pick(H, o);
      list.appendChild(b);
      if (chosen && o.id === chosen.id) requestAnimationFrame(() => b.scrollIntoView({ block: 'nearest', inline: 'nearest' }));
    }
  }
  const hint = SM.el.querySelector('header small'), dev = input.device;
  const ht = dev === 'gamepad' ? 'D-pad: the next one that way' : dev === 'keyboard' ? 'click one · arrows: the next that way' : 'tap one to wake up there';
  if (hint.textContent !== ht) hint.textContent = ht;
  render(H);
}
function build(H) {
  const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
  const el = document.createElement('div');
  el.id = 'd-map';
  el.innerHTML = '<header><span>WAKE UP WHERE? <small></small></span><button type="button" title="Hide the map">✕</button></header><canvas></canvas><div class="dm-list"></div>';
  document.getElementById('death').appendChild(el);
  SM.el = el;
  el.querySelector('header button').onclick = () => { H.dp.noMap = true; draw(H, H.me); };
  const c = el.querySelector('canvas'), pts = new Map();
  let drag = 0, pinch = 0;
  c.addEventListener('pointerdown', (e) => { c.setPointerCapture(e.pointerId); pts.set(e.pointerId, [e.offsetX, e.offsetY]); drag = 0; if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = Math.hypot(a[0] - b[0], a[1] - b[1]); } });
  c.addEventListener('pointermove', (e) => {
    const p = pts.get(e.pointerId);
    if (!p || !SM.wm) return;
    if (pts.size === 2) {
      pts.set(e.pointerId, [e.offsetX, e.offsetY]);
      const [a, b] = [...pts.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      if (pinch > 0 && d > 0) SM.wm.zoom(d / pinch, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, c.clientWidth, c.clientHeight);
      pinch = d; drag = 99; render(H); return;
    }
    const dx = e.offsetX - p[0], dy = e.offsetY - p[1];
    drag += Math.abs(dx) + Math.abs(dy);
    if (drag > 6) { SM.wm.pan(dx, dy); render(H); }
    pts.set(e.pointerId, [e.offsetX, e.offsetY]);
  });
  const up = (e) => {
    const was = pts.has(e.pointerId), n = pts.size;
    pts.delete(e.pointerId);
    if (!was || n > 1 || drag > 6 || e.type === 'pointercancel') return;
    // a tap: the mark under it (or nearest it, within reach)
    let best = null, bd = 26;
    for (const [x, y, o] of SM.hits) { const d = Math.hypot(x - e.offsetX, y - e.offsetY); if (d < bd) { bd = d; best = o; } }
    if (best) pick(H, best);
  };
  c.addEventListener('pointerup', up); c.addEventListener('pointercancel', up);
  c.addEventListener('wheel', (e) => { e.preventDefault(); e.stopPropagation(); if (SM.wm) { SM.wm.zoom(e.deltaY < 0 ? 1.25 : 0.8, e.offsetX, e.offsetY, c.clientWidth, c.clientHeight); render(H); } }, { passive: false });
  // a picked spot off the map's edge (zoomed in): the view moves to it
  SM.keepInView = (o) => {
    const wm = SM.wm, cv = SM.el.querySelector('canvas'), [ox, oy] = wm.origin, sc = wm.scale, x = (o.x - ox) * sc, y = (o.y - oy) * sc;
    if (x < 20 || y < 20 || x > cv.clientWidth - 20 || y > cv.clientHeight - 20) wm.center(o.x, o.y);
  };
}
// the view at first: where you went down and the few places nearest it (the picked one too) in sight
function fit(H) {
  const wm = SM.wm, c = SM.el.querySelector('canvas'), cw = c.clientWidth, ch = c.clientHeight, at = SM.at;
  if (!cw || !ch) return false;
  const pts = [];
  if (at) pts.push(at);
  const far = (o) => (at ? Math.hypot(o.x - at[0], o.y - at[1]) : 0);
  const near = SM.opts.filter((o) => o.x !== undefined).sort((a, b) => far(a) - far(b)).slice(0, 3);
  for (const o of near) pts.push([o.x, o.y]);
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
function render(H) {
  const wm = SM.wm, c = SM.el.querySelector('canvas');
  if (!wm || !c.clientWidth) return;
  if (!SM.fitted) SM.fitted = fit(H);
  const at = SM.at;
  // the map itself: the ground, the railway, the district names, you where you fell (no places' icons: only the spots)
  wm.draw(c, { me: null, mini: H.mini }, at ? at[0] : -1e6, at ? at[1] : -1e6, -Math.PI / 2, { cats: new Set() });
  const g = c.getContext('2d'), [ox, oy] = wm.origin, sc = wm.scale, now = performance.now();
  const P = (x, y) => [(x - ox) * sc, (y - oy) * sc];
  SM.hits = [];
  const ch = SM.chosen;
  for (const o of SM.opts) {
    if (o.x === undefined) continue;
    const [x, y] = P(o.x, o.y), [icon, fill, rim] = markOf(o), big = ch && o.id === ch.id, s = big ? 24 : 18;
    if (x < -20 || y < -20 || x > c.clientWidth + 20 || y > c.clientHeight + 20) continue;
    g.fillStyle = fill; g.strokeStyle = rim; g.lineWidth = 1.5;
    g.beginPath(); g.roundRect ? g.roundRect(x - s / 2, y - s / 2, s, s, 4) : g.rect(x - s / 2, y - s / 2, s, s); g.fill(); g.stroke();
    drawIcon(g, icon, x, y, Math.round(s * 0.62));
    if (SM.near && o.id === SM.near.id) { const ph = (now / 900) % 1; g.strokeStyle = `rgba(125,255,168,${(0.9 * (1 - ph)).toFixed(2)})`; g.lineWidth = 2; g.beginPath(); g.arc(x, y, s * 0.7 + ph * 10, 0, 6.28); g.stroke(); }
    if (big) { g.strokeStyle = '#ffd34a'; g.lineWidth = 3; g.beginPath(); g.arc(x, y, s * 0.82, 0, 6.28); g.stroke(); }
    SM.hits.push([x, y, o]);
  }
  // the names: the picked one, the nearest
  for (const o of [SM.near, ch]) {
    if (!o || o.x === undefined) continue;
    const [x, y] = P(o.x, o.y), lab = (o === ch ? '' : 'NEAREST · ') + o.label;
    g.font = '12px "CLA Pixel", monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
    const w = g.measureText(lab).width + 12, lx = Math.max(w / 2 + 2, Math.min(c.clientWidth - w / 2 - 2, x)), ly = o === ch ? y - 26 : y + 24;
    g.fillStyle = 'rgba(12,18,34,.9)'; g.fillRect(lx - w / 2, ly - 9, w, 18);
    g.fillStyle = o === ch ? '#ffd34a' : '#7dffa8'; g.fillText(lab, lx, ly + 1);
    if (o === ch && SM.near && ch.id === SM.near.id) break;
  }
}
