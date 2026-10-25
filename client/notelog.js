// The notes' log (UI-3): every note the HUD shows (client/hud.js toast) is kept here in full, newest last, so a note
// can be short on screen and read again in the phone's Log app (client/phone.js). A few hundred bytes a note, the
// last LOG_MAX kept; this tab's session keeps them over a reload (sessionStorage - a convenience: none in a private
// window, and the log just starts empty).
export const LOG_MAX = 80;
const KEY = 'cla.notelog';
let log = null;
function load() {
  if (log) return log;
  try { const v = JSON.parse(sessionStorage.getItem(KEY) || '[]'); log = Array.isArray(v) ? v.filter((e) => e && typeof e.text === 'string').slice(-LOG_MAX) : []; } catch { log = []; }
  return log;
}
let saveT = 0;
function save() {
  clearTimeout(saveT);
  saveT = setTimeout(() => { try { sessionStorage.setItem(KEY, JSON.stringify(log)); } catch { /* storage blocked or full */ } }, 400);
}
// a note shown: the same words again straight after count up rather than fill the log
export function logNote(text, tone = 'info', at = Date.now()) {
  const L = load(), t = String(text || '').trim();
  if (!t) return;
  const last = L[L.length - 1];
  if (last && last.text === t && at - last.at < 60000) { last.n = (last.n || 1) + 1; last.at = at; }
  else { L.push({ text: t, tone: String(tone || 'info'), at }); if (L.length > LOG_MAX) L.splice(0, L.length - LOG_MAX); }
  save();
}
// the log, newest first (a copy)
export function noteLog() { return load().slice().reverse(); }
export function clearLog() { log = []; save(); }
