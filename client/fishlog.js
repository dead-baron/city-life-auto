// The phone's Fish log (the owner, 11-16: the fish art "used on the catch card, the fish log, the fish market / cooler"):
// what's in your cooler now - each fish drawn, its weight, what it fetches - then every kind in the game by its water,
// the ones you've caught in colour with how many and your best, the rest dark shapes to find, the records board's
// biggest of each. Loaded when the app first opens (client/phone.js), with the fish's pixel art (client/fishart.js); the
// server sends the log (server/systems/fishing.js logInfo, the phone's 'fishlog').
import * as FS from '../shared/fish.js';
import { fishCanvas } from './fishart.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const money = (n) => `$${Math.round(n).toLocaleString('en-US')}`;
const WATER_TITLE = { pond: 'Ponds', lake: 'Lakes', river: 'Rivers', creek: 'Creeks', swamp: 'The marshes', shore: 'The shallows', pier: 'Piers', reef: 'The reef', offshore: 'Open water (a boat)', deep: 'The deep, after dark', cave: 'The cave pool' };
// each kind once, under the first water it lives in; the legendaries last
export function sections() {
  const by = new Map(FS.WATERS.map((w) => [w, []]));
  for (const f of FS.FISH) if (f.rare < 5) by.get(f.waters[0]).push(f);
  const out = FS.WATERS.map((w) => ({ id: w, title: WATER_TITLE[w], fish: by.get(w) })).filter((s) => s.fish.length);
  out.push({ id: 'legend', title: 'The legendaries', fish: FS.FISH.filter((f) => f.rare === 5) });
  return out;
}
// d: the server's { log: { id: [count, best lb] }, creel: [[id, lb]], rec: { id: [lb, who] }, max }
export function render(el, d) {
  if (!d) { el.innerHTML = '<p class="ph-empty">Loading…</p>'; return; }
  const log = d.log || {}, creel = d.creel || [], rec = d.rec || {}, n = Object.keys(log).length;
  let h = `<p class="ph-hint">${n} of ${FS.FISH.length} kinds caught. Sell your cooler at a fish market (best prices), a bait shop or a charter desk.</p>`;
  h += `<h3>Your cooler · ${creel.length}/${d.max || 0}</h3>`;
  if (creel.length) {
    let v = 0;
    h += '<div class="fl-cool">' + creel.map(([id, lb]) => { const f = FS.FISH_BY_ID[id]; if (!f) return ''; const p = FS.fishValue(f, lb); v += p; return `<div class="fl-c"><span class="fl-pic" data-fish="${f.id}"></span><b>${esc(f.name)}</b><small>${lb} lb · ${money(p)}</small></div>`; }).join('') + '</div>';
    h += `<p class="ph-hint">About ${money(v)} at a fish market.</p>`;
  } else h += '<p class="ph-empty">Empty - go fishing.</p>';
  for (const s of sections()) {
    h += `<h3>${esc(s.title)}</h3><div class="fl-grid">`;
    for (const f of s.fish) {
      const L = log[f.id], r = rec[f.id], stars = '★'.repeat(Math.min(5, f.rare));
      h += L ? `<div class="fl-f r${f.rare}"><span class="fl-pic" data-fish="${f.id}"></span><b>${esc(f.name)}</b><small>${stars} · ×${L[0]} · best ${L[1]} lb</small>${r ? `<small class="fl-rec">Record ${r[0]} lb (${esc(r[1])})</small>` : ''}</div>`
        : `<div class="fl-f no r${f.rare}"><span class="fl-pic" data-fish="${f.id}" data-ink="1"></span><b>${f.rare === 5 ? 'A legend' : '???'}</b><small>${stars}</small></div>`;
    }
    h += '</div>';
  }
  el.innerHTML = h;
  // the pictures: each kind's pixels at a whole scale (2x; 3x in the cooler's row)
  for (const sp of el.querySelectorAll('[data-fish]')) {
    const f = FS.FISH_BY_ID[sp.dataset.fish];
    const c = f && fishCanvas(f, sp.closest('.fl-cool') ? 3 : 2, sp.dataset.ink ? { ink: '#22303e' } : {});
    if (c) { c.setAttribute('aria-hidden', 'true'); sp.appendChild(c); }
  }
}
