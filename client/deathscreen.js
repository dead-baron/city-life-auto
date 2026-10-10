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
import { DEATH_REVEAL_S } from '../shared/rules.js';
import { input } from './input.js';
import { keyName } from './glyphs.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// the phase for D { at: when you went down, fold } at now (ms): 'off' alive, 'scene', then 'open' or 'bar'
export function deathPanel(D, dead, now) {
  if (!dead) { D.at = 0; D.fold = false; return 'off'; }
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
      const s = e.target.closest('.d-step'); if (s) step(H, +s.dataset.s);
    });
  }
  if (ph === 'off') { d.classList.add('hidden'); d.classList.remove('reveal', 'fold'); H.spawnPick = null; H.dp.me = null; return; }
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
  const amb = dn && dn.amb ? ['ambx', `🚑 Cancel ambulance${k('J', 'Y')}`, 'amb on'] : ['amb', `🚑 Call an ambulance $${dn ? dn.fee : ''}${dn && dn.ambUsed ? ' (used)' : ''}${k('J', 'Y')}`, dn && dn.canAmb ? 'amb' : 'amb off'];
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
    if (down && !dn.canAmb && !dn.amb && !dn.ambUsed) { const n = document.createElement('small'); n.textContent = `(an ambulance needs $${dn.fee} in the bank)`; hb.appendChild(n); }
  }
  // where to wake up: one spot at a time, stepped with the arrows by it (or the keys, the D-pad)
  const box = $('d-spawn'), sig = opts.map((o) => o.id).join() + '|' + (chosen && chosen.id) + '|' + input.device;
  if (box.dataset.sig !== sig) {
    box.dataset.sig = sig;
    box.innerHTML = chosen ? `<span class="d-lbl">Wake up at</span><button class="d-step" data-s="-1" aria-label="Previous spot">◀</button><b class="d-pick">${chosen.kind === 'home' ? '⌂' : '✚'} ${esc(chosen.label)}${opts.length > 1 ? ` <small>${ci + 1}/${opts.length}</small>` : ''}</b><button class="d-step" data-s="1" aria-label="Next spot">▶</button>${k('← →', 'D-pad')}` : '';
  }
}
// the back control (Esc, B, the hide button, a tap on the bar): fold or open the choices; false before they're up
export function back(H) {
  if (!deathFold(H.dp, performance.now())) return false;
  if (H.me) draw(H, H.me);
  return true;
}
// the next (1) or the previous (-1) place to wake up
export function step(H, s) {
  const me = H.me, opts = (me && me.spawnOpts) || [];
  if (!opts.length || !H.deathRevealed) return;
  const i = Math.max(0, opts.findIndex((o) => o.id === (H.spawnPick ?? me.spawnChoice))), o = opts[(i + s + opts.length) % opts.length];
  H.spawnPick = o.id; H.onRespawn?.(o.id); draw(H, me);
}
