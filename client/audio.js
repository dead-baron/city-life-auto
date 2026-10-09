// The game's sound, as the rest of the client sees it: a small front for client/sound/ (everything synthesised in
// WebAudio - no audio files). The sound modules load on the first tap, click or key (the browser lets the audio
// start then; the title screen's music with it), so none of it is in the page's first load.
//   initAudio()            wake the audio (in a tap or a key: Safari's rule)
//   sfx(name, vol)         main.js's own sounds by their old names (client/sound/instruments.js LEGACY)
//   soundEvent(ev, S)      a server event's sound, placed where it happened (client/sound/events.js)
//   soundFrame(F, S)       each frame the world is drawn: engines, footsteps, ambience, the places' music
//   soundSettingsUi(el)    the Sound section of the Settings screen
import { settings, saveSettings } from './input.js';

let ctx = null, sys = null, loading = null, off = false;

// Safari (an iPhone above all) starts the sound suspended unless it's made in a tap, and suspends it when the page
// goes to the background or a call comes in: it's woken on the next touch, click or key, and on coming back.
function wake() { if (ctx && !off && ctx.state !== 'running') { try { const r = ctx.resume(); if (r && r.catch) r.catch(() => {}); } catch { /* not now */ } } }
export function initAudio() {
  if (ctx) { wake(); return; }
  try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { ctx = null; return; }
  for (const ev of ['touchend', 'pointerdown', 'keydown']) window.addEventListener(ev, wake, { passive: true, capture: true });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) wake(); });
  const mobile = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
  loading = import('./sound/index.js')
    .then((m) => { sys = m.createSound(ctx, settings.sound, { mobile }); applyOff(sys.mix.prefs); if (/[?&]debug\b/.test(location.search)) window.__snd = sys; })
    .catch((e) => console.warn('[sound] could not load', e));
}
// the first tap, click or key anywhere (the title screen's music starts with it)
const first = () => { for (const ev of FIRST) window.removeEventListener(ev, first, true); initAudio(); };
const FIRST = ['pointerdown', 'touchend', 'keydown', 'click'];
if (typeof window !== 'undefined') for (const ev of FIRST) window.addEventListener(ev, first, { passive: true, capture: true });

// (a fault in the sound is reported, once per kind, and never stops the game)
const seen = new Set();
function fault(where, e) { const k = where + (e && e.message); if (seen.size < 50 && !seen.has(k)) { seen.add(k); console.warn('[sound] ' + where, e); } }
export function sfx(name, vol = 1) { if (sys && vol > 0.02) { try { sys.legacy(name, vol); } catch (e) { fault('sfx ' + name, e); } } }
export function soundEvent(ev, S) { if (!sys) return false; try { return sys.event(ev, S); } catch (e) { fault('event ' + (ev && ev.e), e); return false; } }
export function soundFrame(F, S) { if (sys) { try { sys.frame(F, S); } catch (e) { fault('frame', e); } } }

// sound switched off: the audio sleeps (no work for a phone), and wakes when it's back on
function applyOff(p) {
  off = !p.on;
  if (!ctx) return;
  if (off) setTimeout(() => { if (off && ctx.state === 'running') ctx.suspend().catch(() => {}); }, 300);
  else wake();
}
export function soundSettingsUi(el) {
  if (!el) return;
  import('./sound/ui.js').then((m) => m.buildSoundUi(el, settings, saveSettings, (p) => { if (sys) sys.setPrefs(p); applyOff(p); }))
    .catch((e) => console.warn('[sound] settings', e));
}
export const audioReady = () => (loading || Promise.resolve()).then(() => !!sys);
