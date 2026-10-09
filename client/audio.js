// The game's sound, as the rest of the client sees it: a small front for client/sound/ (everything synthesised in
// WebAudio - no audio files). The sound modules load on the first tap, click or key (the browser lets the audio
// start then; the title screen's music with it), so none of it is in the page's first load.
//   initAudio()            wake the audio (in a tap or a key: Safari's rule)
//   sfx(name, vol)         main.js's own sounds by their old names (client/sound/instruments.js LEGACY)
//   soundEvent(ev, S)      a server event's sound, placed where it happened (client/sound/events.js)
//   soundFrame(F, S)       each frame the world is drawn: engines, footsteps, ambience, the places' music
//   soundSettingsUi(el)    the Sound section of the Settings screen
//   soundStatus()          one line for the debug menu: on, off, loading, asleep, or unavailable (and why)
//
// It always starts (the owner, 2026-10-09: "doesn't seem to load all the time"): every touch, click and key wakes the
// audio until it's running - not just the first one - so a context that a phone started suspended, or that iOS
// "interrupted" (a call, Siri, the page in the background), comes back on the next tap; and the sound modules, if
// they failed to load (a flaky connection on the first tap), are fetched again on a later one.
import { settings, saveSettings } from './input.js';

let ctx = null, sys = null, loading = null, off = false, failed = 0, nextTry = 0, lastErr = '', noAudio = false;
const GESTURES = ['touchstart', 'touchend', 'pointerdown', 'keydown', 'click'];

// a one-sample silent sound, played in a tap: older iPhones only unlock the audio for a sound started in a gesture
function unlock() {
  try { const b = ctx.createBuffer(1, 1, ctx.sampleRate), s = ctx.createBufferSource(); s.buffer = b; s.connect(ctx.destination); s.start(0); } catch { /* not now */ }
}
// Wake the audio: resume it if it isn't running (suspended, or iOS's "interrupted"), and load the sound if it isn't
// loaded. In a tap or a key this always works; outside one (the tab coming back) it may not, and the next tap does.
function wake() {
  if (!ctx) return;
  if (!off && ctx.state !== 'running' && ctx.state !== 'closed') {
    try { const r = ctx.resume(); if (r && r.catch) r.catch(() => {}); } catch { /* not now */ }
    unlock();
  }
  if (!sys && !loading) load();
}
function load() {
  if (sys || loading || !ctx || performance.now() < nextTry) return;
  const mobile = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
  // (a failed module stays failed for the page's life under its own address: a retry asks under a new one)
  loading = import(failed ? `./sound/index.js?retry=${failed}` : './sound/index.js')
    .then((m) => {
      sys = m.createSound(ctx, settings.sound, { mobile }); loading = null;
      applyOff(sys.mix.prefs);
      if (/[?&]debug\b/.test(location.search)) window.__snd = sys;
    })
    .catch((e) => {
      failed++; lastErr = String((e && e.message) || e).slice(0, 80); loading = null;
      nextTry = performance.now() + Math.min(30000, 1500 * failed);   // (again on a tap after this)
      console.warn('[sound] could not load - will try again on a tap', e);
    });
}
export function initAudio() {
  if (ctx) { wake(); return; }
  if (noAudio) return;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) { noAudio = true; return; }
  try { ctx = new AC(); } catch (e) { ctx = null; lastErr = String((e && e.message) || e).slice(0, 80); failed++; return; }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) wake(); });
  window.addEventListener('pageshow', wake);
  window.addEventListener('focus', wake);
  wake();
}
// every tap, click or key: start the audio, or wake it (cheap when it's already running)
function gesture() { if (ctx) { if (ctx.state !== 'running' || !sys) wake(); } else initAudio(); }
if (typeof window !== 'undefined') for (const ev of GESTURES) window.addEventListener(ev, gesture, { passive: true, capture: true });

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

// The debug menu's line: is the sound on, and if not, why not.
export function soundStatus() {
  if (noAudio) return 'Sound: unavailable (this browser has no Web Audio)';
  if (!ctx) return failed ? `Sound: unavailable (${lastErr})` : 'Sound: waiting for a tap or a key';
  if (settings.sound && settings.sound.on === false) return 'Sound: off (Settings → Sound)';
  if (!sys) return loading ? 'Sound: loading…' : failed ? `Sound: unavailable (${lastErr}) - trying again on a tap` : 'Sound: loading…';
  if (ctx.state !== 'running') return `Sound: ${ctx.state} - tap to wake it`;
  let s = null;
  try { s = sys.status(); } catch { /* old */ }
  if (!s) return 'Sound: on';
  return `Sound: on · voices ${s.voices} · engines ${s.engines} · beds ${s.beds.length ? s.beds.join(' ') : 'none'} · ${s.played} played, ${s.pool + s.gap + s.budget} dropped, ${s.cut} cut off`;
}
