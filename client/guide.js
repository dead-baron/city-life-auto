// The phone's Guide app (UI-10's slot; the first-time experience): the in-game wiki - its words and numbers from the
// game's data (shared/guide.js), each control named by the device in hand (client/glyphs.js). Loaded the first time the
// app opens (client/phone.js), never with the page. A search box over every entry; the sections fold open one at a time;
// "Replay the arrival" and "Show tips again" (server/systems/ftue.js: { t: 'intro', a: 'replay' | 'tips' }), and while
// the first goal is on, "Skip the first goal".
//   render(el, ctx)   ctx: { map(), send(o), close(), refocus(), me(), take() (a section asked for: a tip's "More in your
//                     Guide" - once) }
import { guideSections, searchGuide } from '../shared/guide.js';
import { glyph } from './glyphs.js';
import { icon as pix } from './touchicons.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const body = (b) => esc(b).replace(/\[\[(\w+)\]\]/g, (s, a) => glyph(a));
const mark = (h, q) => { if (!q) return h; let out = h; for (const w of q.toLowerCase().split(/\s+/).filter((x) => x.length > 1)) out = out.replace(new RegExp(`(?![^<]*>)(${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'), '<mark>$1</mark>'); return out; };
const SEC_PIX = { around: 'transit', earn: 'jobs', law: 'siren', places: 'places', activities: 'arcade', property: 'homes', items: 'bag' };
let open = null, query = '', secs = null, secsMap = null;

function sections(map) {
  if (!secs || secsMap !== map) { secs = guideSections(map); secsMap = map; }
  return secs;
}
// (a fresh read each time the app opens: a rule changed by an update shows straight away)
export function reset() { secs = null; }

export function render(el, ctx) {
  const map = ctx.map(), S = sections(map), me = ctx.me && ctx.me(), f = me && me.ftue;
  const want = ctx.take && ctx.take();
  if (want) { open = want; query = ''; }
  const entry = (sec, e) => `<div class="gd-e" id="gd-${esc(sec.id)}-${esc(e.id)}"><b>${mark(esc(e.t), query)}</b><p>${mark(body(e.b), query)}</p></div>`;
  let h = '<div class="ph-guide-top"><span class="ph-tile">' + pix('guide') + '</span><div><h3>The city guide</h3><p class="ph-hint">Honest work, a hustle, the great outdoors - you can do all of it. Here\'s how.</p></div></div>';
  if (f && f.st === 'goal') h += `<div class="ph-card gd-goal"><b>Your first goal · step ${f.step} of 3</b><small>${esc(f.line || '')}</small><button class="btn" data-gd="skip">Skip the first goal</button></div>`;
  h += `<label class="bm-search gd-search">${pix('search')}<input id="gd-q" class="field" type="search" placeholder="Search the guide" autocomplete="off" spellcheck="false" value="${esc(query)}"></label>`;
  if (query.trim()) {
    const hits = searchGuide(S, query);
    h += hits.length ? `<p class="ph-hint">${hits.length} found</p><div class="gd-hits">${hits.map(({ sec, e }) => `<small class="gd-in">${esc(sec.title)}</small>${entry(sec, e)}`).join('')}</div>` : '<p class="ph-empty">Nothing found. Try another word.</p>';
  } else {
    h += '<div class="ph-acc">' + S.map((sec) => {
      const on = sec.id === open;
      return `<button class="ph-row ph-grp${on ? ' open' : ''}" data-gsec="${esc(sec.id)}" aria-expanded="${on}"><span class="ic">${pix(SEC_PIX[sec.id] || 'guide')}</span><span class="nm">${esc(sec.title)}<small>${esc(sec.blurb)}</small></span><span class="chev">${pix('chevron')}</span></button>`
        + (on ? `<div class="ph-sub gd-sec">${sec.entries.map((e) => entry(sec, e)).join('')}</div>` : '');
    }).join('') + '</div>';
  }
  h += '<div class="gd-acts"><button class="btn" data-gd="replay">Replay the arrival</button><button class="btn" data-gd="tips">Show tips again</button></div>';
  el.innerHTML = h;
  const q = el.querySelector('#gd-q');
  if (q) {
    q.oninput = () => { query = q.value; const pos = q.selectionStart; render(el, { ...ctx, take: null }); const q2 = el.querySelector('#gd-q'); if (q2) { q2.focus(); try { q2.setSelectionRange(pos, pos); } catch { /* (a search box that won't) */ } } };
    q.onkeydown = (e) => { if (e.key === 'Escape' && q.value) { e.stopPropagation(); query = ''; render(el, { ...ctx, take: null }); } };
  }
  for (const b of el.querySelectorAll('[data-gsec]')) b.onclick = () => { open = open === b.dataset.gsec ? null : b.dataset.gsec; render(el, { ...ctx, take: null }); if (open) b.scrollIntoView?.({ block: 'start' }); };
  for (const b of el.querySelectorAll('[data-gd]')) b.onclick = () => {
    const a = b.dataset.gd;
    if (a === 'skip') { if (b.dataset.sure) { ctx.send({ t: 'intro', a: 'skip' }); ctx.close(); } else { b.dataset.sure = '1'; b.textContent = 'Press again to skip it'; } return; }
    ctx.send({ t: 'intro', a });
    ctx.close();
  };
  if (want) { const s = el.querySelector(`[data-gsec="${want}"]`); s?.scrollIntoView?.({ block: 'start' }); }
  ctx.refocus();
}
