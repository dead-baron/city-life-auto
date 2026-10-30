// One short card for a job (UI-3, the owner's bar: "jobs should be easier to take on and understand"): what it is, what
// it pays, how far, and the first step - with one Accept. The phone's Jobs app lists these (client/phone.js), and the
// same card comes up when you Act at a job's place - a hospital's doors, a fire station, a taxi rank (the server's
// { t: 'jobcard' }: server/systems/phone.js jobCard). Accepting asks the server ({ t: 'phone', a: 'take' }); its answer
// sets the waypoint and puts the card (or the hub) away. Loaded with the phone or with the first card.
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const P = (d) => `<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
// a line icon for each kind of job
export const JOB_ICON = {
  delivery: P('<path d="M3 8l9-5 9 5v8l-9 5-9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/>'),
  patrol: P('<path d="M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6z"/>'),
  farm: P('<path d="M12 21V11M12 11c0-4 3-6 7-6 0 4-3 6-7 6zM12 14c0-3-2-5-6-5 0 3 2 5 6 5z"/>'),
  fly: P('<path d="M3 13l18-6-4 12-5-4-4 3v-5z"/>'),
  fire: P('<path d="M12 21c-4 0-6-3-6-6 0-4 4-6 4-11 3 2 4 4 4 7 1-1 2-2 2-4 2 2 2 5 2 8 0 3-2 6-6 6z"/>'),
  medic: P('<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M12 8v8M8 12h8"/>'),
  drive: P('<path d="M3 15l2-6h14l2 6v4H3z"/><circle cx="7.5" cy="17" r="1.5"/><circle cx="16.5" cy="17" r="1.5"/>'),
  coast: P('<circle cx="12" cy="5" r="2"/><path d="M12 7v14M5 13a7 7 0 0 0 14 0M8 10h8"/>'),
  wood: P('<rect x="3" y="13" width="18" height="6" rx="3"/><rect x="5" y="6" width="14" height="6" rx="3"/><circle cx="6" cy="16" r="1.5"/><circle cx="8" cy="9" r="1.5"/>'),   // (a firewood order: server woodjob.js)
};
export const jobKind = (j) => (j.fly ? (j.kind === 'coast' ? 'coast' : 'fly') : JOB_ICON[j.kind] ? j.kind : j.kind === 'sar' || j.kind === 'charter' || j.kind === 'dusting' ? 'fly' : 'delivery');
const money = (n) => '$' + Math.round(n).toLocaleString('en-US');
export const payText = (j) => (j.lo && j.hi && j.hi > j.lo ? `${money(j.lo)}-${money(j.hi)}` : money(j.lo || j.pay || 0));
export const fmtDist = (d) => (d >= 32000 ? `${(d / 32000).toFixed(1)} km` : `${Math.round(d / 32)} m`);   // (32 px a metre: the event arrows' scale)

// the card's markup: j the board's entry; o: { dist (px), busy (you have a job), here (at its place: no distance),
// compact (the Jobs app's list: no description, Accept beside the first step) }
export function jobCardHtml(j, o = {}) {
  const d = o.here ? '' : o.dist == null || !(j.x || j.y) ? '' : fmtDist(o.dist);
  const go = `<button class="btn btn-1 jc-go" data-take="${esc(j.id)}"${o.busy ? ' disabled' : ''}>${o.busy ? (o.compact ? 'Busy' : 'Finish your job first') : 'Accept'}</button>`;
  return `<div class="jc${o.compact ? ' compact' : ''}" data-kind="${jobKind(j)}"><div class="jc-top"><span class="jc-ic">${JOB_ICON[jobKind(j)]}</span><span class="jc-t"><b>${esc(j.title)}</b>${j.sub && !o.compact ? `<small>${esc(j.sub)}</small>` : ''}</span>`
    + `<span class="jc-pay">${payText(j)}<small>${esc(j.per || 'the job')}</small></span></div>`
    + `<div class="jc-row"><span class="jc-step"><i>FIRST</i>${esc(j.step || 'Head there and start')}</span>${d ? `<span class="jc-d">${d}</span>` : ''}${o.compact ? go : ''}</div>`
    + `${o.compact ? '' : go}</div>`;
}

// The card at a job's place (Act): over the game, the game running, Accept or Not now. ctx: { send, openOverlay,
// closeOverlay, topOverlay, pos(), setWaypoint(w) } from client/main.js
let shown = null;
export function showJobCard(msg, ctx) {
  let el = document.getElementById('jobcard');
  if (!el) {
    el = document.createElement('div'); el.id = 'jobcard'; el.className = 'overlay hidden';
    el.addEventListener('pointerdown', (e) => { if (e.target === el) ctx.closeOverlay('jobcard'); });
    document.getElementById('game').appendChild(el);
  }
  const j = msg.job;
  shown = j;
  el.innerHTML = `<div class="panel jc-pop" role="dialog" aria-label="A job"><div class="mhead"><h2>${esc(msg.where || 'A JOB HERE')}</h2><button class="x" data-close aria-label="Close">✕</button></div>`
    + jobCardHtml(j, { here: true, busy: !!msg.busy }) + '<button class="btn jc-no" data-jc="no">Not now</button></div>';
  el.querySelector('[data-take]').onclick = (e) => { e.currentTarget.disabled = true; ctx.send({ t: 'phone', a: 'take', id: j.id, card: 1 }); };
  el.querySelector('[data-jc=no]').onclick = () => ctx.closeOverlay('jobcard');
  el.querySelector('[data-close]').onclick = () => ctx.closeOverlay('jobcard');
  if (ctx.topOverlay() !== 'jobcard') ctx.openOverlay('jobcard');
}
// the server's answer to Accept: taken - the waypoint on its place and the card away; refused - the card says why
export function jobTaken(msg, ctx) {
  const el = document.getElementById('jobcard');
  if (!el || !shown) return false;
  if (msg.ok) {
    if (shown.x || shown.y) ctx.setWaypoint({ x: shown.x, y: shown.y, label: shown.title });
    shown = null;
    if (ctx.topOverlay() === 'jobcard') ctx.closeOverlay('jobcard');
    return true;
  }
  const b = el.querySelector('[data-take]');
  if (b && msg.err) { b.disabled = false; b.textContent = 'Accept'; let p = el.querySelector('.jc-err'); if (!p) { p = document.createElement('p'); p.className = 'jc-err'; b.before(p); } p.textContent = msg.err; }
  return true;
}
