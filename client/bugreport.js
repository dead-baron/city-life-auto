// Report a bug (the owner, 11-14): one form, in the phone - its Report bug app, the pause list's REPORT A BUG and
// Settings > Help open it (client/phone.js, main.js). "What happened?", what kind of problem it was (a pad has no keys
// to type with: a pick is enough), "Include a screenshot" (on), Send and Cancel; then a short thank-you. Sent with it to
// the game server (POST /report with the page's own token: server/bugreports.js): a picture of the game as drawn the
// frame the form opened (the canvases only - no menus over it), at most BUG_REPORT.shotW px wide, WebP (JPEG where a
// browser can't), under BUG_REPORT.shotKb; the build, the frame rate, the graphics preset, the input device, the screen,
// the HUD's area name and the page's last errors (client/errors.js). The server adds who and where the player is -
// never an email, an address or a token. Loaded the first time it opens.
// api (main.js bugApi): { grab(fn(canvases)), token(), base(), discord(), page(), back(), close(), refocus() }
import { BUG_REPORT as R } from '../shared/rules-page.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
let st = null;   // this opening: { phase: 'form' | 'sent', kind, text, shot (a Blob | null), url (its preview), waiting, busy, el }

// a new opening (the phone's app entered): the form empty, a fresh screenshot
export function reset() {
  if (st && st.url) URL.revokeObjectURL(st.url);
  st = null;
}

// the screenshot: the frame's canvases drawn into one, scaled to the width - at once, inside the frame (a WebGL canvas
// is cleared after it's shown), then encoded under the size
function compose(list) {
  const src = (list || []).filter((c) => c && c.width && c.height);
  if (!src.length) return null;
  const top = src[src.length - 1], k = Math.min(1, R.shotW / top.width);
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(top.width * k)); c.height = Math.max(1, Math.round(top.height * k));
  const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, c.width, c.height);
  for (const s of src) g.drawImage(s, 0, 0, c.width, c.height);
  return c;
}
const blobOf = (c, type, q) => new Promise((ok) => { try { c.toBlob((b) => ok(b), type, q); } catch { ok(null); } });
async function encode(c) {
  const max = R.shotKb * 1024;
  for (let pass = 0; pass < 4 && c; pass++) {
    let b = await blobOf(c, 'image/webp', 0.7);
    const type = b && b.type === 'image/webp' ? 'image/webp' : 'image/jpeg';   // (Safari has no WebP encoder: a PNG back)
    for (let q = 0.7; ; q -= 0.15) {
      if (!b || b.type !== type) b = await blobOf(c, type, q);
      if (b && b.size <= max) return b;
      if (q < 0.4) break;
      b = null;
    }
    const s = document.createElement('canvas');   // (still too big: three quarters the size, again)
    s.width = Math.round(c.width * 0.75); s.height = Math.round(c.height * 0.75);
    s.getContext('2d').drawImage(c, 0, 0, s.width, s.height);
    c = s;
  }
  return null;
}
function takeShot(api) {
  st.waiting = true;
  const mine = st;
  const done = (b) => { if (st !== mine) return; st.waiting = false; st.shot = b; if (b) st.url = URL.createObjectURL(b); paintShot(); };
  const t = setTimeout(() => { api.grab(null); done(null); }, 1500);   // (no frame drawn - a hidden tab: no picture)
  api.grab((list) => { clearTimeout(t); let c = null; try { c = compose(list); } catch { c = null; } if (!c) { done(null); return; } encode(c).then(done, () => done(null)); });
}
function paintShot() {
  const el = st && st.el;
  if (!el || !el.isConnected) return;
  const img = el.querySelector('#br-prev'), note = el.querySelector('#br-shotnote'), on = el.querySelector('#br-shot');
  if (!img) return;
  if (st.url) { img.src = st.url; img.hidden = !on.checked; }
  note.textContent = st.waiting ? 'Taking the screenshot...' : st.shot ? (on.checked ? `${Math.max(1, Math.round(st.shot.size / 1024))} KB` : 'not sent') : 'no screenshot this time';
}

// into the phone's screen (every render of it: the form kept as it is while it's up)
export function render(el, api) {
  if (!st) { st = { phase: 'form', kind: 'other', text: '', shot: null, url: null, waiting: false, busy: false, el: null }; takeShot(api); }
  if (st.el === el && el.querySelector(st.phase === 'form' ? '#br-form' : '#br-done')) return;
  st.el = el;
  if (st.phase === 'sent') { thanks(el, api); return; }
  el.innerHTML = `<div class="br" id="br-form">
<label class="br-l" for="br-text">What happened?</label>
<textarea id="br-text" maxlength="${R.text}" rows="5" placeholder="What you were doing, what you expected, and what happened instead">${esc(st.text)}</textarea>
<small class="br-count" id="br-count"></small>
<p class="br-l">What kind of problem?</p>
<div class="br-kinds">${R.kinds.map(([k, n]) => `<button type="button" class="btn br-kind" data-kind="${k}" aria-pressed="${k === st.kind}">${esc(n)}</button>`).join('')}</div>
<label class="srow br-shotrow"><span>Include a screenshot <small id="br-shotnote"></small></span><input type="checkbox" id="br-shot"${st.noShot ? '' : ' checked'}></label>
<img id="br-prev" class="br-prev" alt="The screenshot that goes with it" hidden>
<p class="ph-hint">Sent with it: where you are, your device and browser, the game's version, its frame rate and recent errors. Never your email or password.</p>
<p class="br-msg" id="br-msg" role="status"></p>
<div class="br-go"><button type="button" class="btn" id="br-cancel">Cancel</button><button type="button" class="btn br-send" id="br-send">Send</button></div>
</div>`;
  const $ = (s) => el.querySelector(s), ta = $('#br-text');
  const count = () => { $('#br-count').textContent = `${ta.value.length} / ${R.text}`; };
  ta.oninput = () => { st.text = ta.value; count(); };
  ta.onkeydown = (e) => { if (e.key === 'Escape') { e.preventDefault(); ta.blur(); } };   // (Esc leaves the box; again, the form)
  count();
  for (const b of el.querySelectorAll('[data-kind]')) b.onclick = () => { st.kind = b.dataset.kind; for (const q of el.querySelectorAll('[data-kind]')) q.setAttribute('aria-pressed', q === b); };
  $('#br-shot').onchange = () => { st.noShot = !$('#br-shot').checked; paintShot(); };
  $('#br-cancel').onclick = () => { reset(); api.back(); };
  $('#br-send').onclick = () => send(api);
  paintShot();
  api.refocus();
}

async function send(api) {
  const el = st.el, msg = el.querySelector('#br-msg'), btn = el.querySelector('#br-send');
  if (st.busy) return;
  const text = st.text.trim().slice(0, R.text);
  if (!text && st.kind === 'other') { msg.textContent = 'Say what happened (or pick what kind of problem it was).'; return; }
  const token = api.token(), base = api.base();
  if (!token || !base) { msg.textContent = 'Reports go to the online game - connect first, then try again.'; return; }
  if (st.waiting && !st.noShot) { msg.textContent = 'One moment - the screenshot is nearly ready.'; return; }
  st.busy = true; btn.disabled = true; msg.textContent = 'Sending...';
  try {
    const shot = st.shot && !st.noShot ? await b64(st.shot) : '';
    const r = await fetch(base + '/report', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, credentials: 'omit', body: JSON.stringify({ text, kind: st.kind, shot, page: api.page() }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.ok) throw new Error(j.err || `The server answered ${r.status} - try again in a moment.`);
    st.phase = 'sent';
    if (st.url) { URL.revokeObjectURL(st.url); st.url = null; }
    thanks(el, api);
  } catch (e) {
    msg.textContent = e && e.message && !/fetch|network/i.test(e.message) ? e.message : 'It didn\'t go through - check your connection and try again.';
  } finally { if (st) st.busy = false; if (btn.isConnected) btn.disabled = false; }
}
const b64 = (blob) => new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(String(r.result).replace(/^data:[^,]*,/, '')); r.onerror = () => no(r.error); r.readAsDataURL(blob); });

function thanks(el, api) {
  const d = api.discord();
  el.innerHTML = `<div class="br br-done" id="br-done"><h3>Thanks - it's on its way</h3><p class="ph-hint">Your report went to the team with a picture of the moment. We read every one.${d ? ' Follow up, or tell us more, on our Discord.' : ''}</p>
<div class="br-go">${d ? '<button type="button" class="btn" id="br-discord">Join our Discord</button>' : ''}<button type="button" class="btn br-send" id="br-ok">Done</button></div></div>`;
  const ok = el.querySelector('#br-ok');
  ok.onclick = () => { reset(); api.close(); };
  const dc = el.querySelector('#br-discord');
  if (dc) dc.onclick = () => window.open(d, '_blank', 'noopener');
  api.refocus();
}
