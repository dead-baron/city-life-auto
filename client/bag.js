// The bag (UI-3, the hub's BAG tab; the owner: "much cleaner and modern and easier to work through"): everything you
// carry as a grid of cells by category - weapons, healing, food and drink, tools, clothes, fishing, hunting, the garden,
// valuables - with a filter and a sort, and one thing's details beside it: its name, what it does, how many, and what you
// can do with it (Use / Equip / Drop / pin it to the quick wheel's four slots). The quick wheel's slots under the grid.
// The client only asks; the server checks and does it (server/session.js inv, weapon; economy.js useItem, setQuick;
// cargo.js dropItem). Loaded the first time the bag opens (client/main.js). The layout keeps a place for crafting.
import { WEAPONS, ITEMS, BLADE_COLORS } from '../shared/items.js';
import { ITEM_ICON, fittedIcon } from './inventory.js';
import { keyName } from './glyphs.js';
import { input } from './input.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const SLOTS = 4;
const usable = (id) => !!(ITEMS[id] && (ITEMS[id].heal || ITEMS[id].buff || ITEMS[id].light));
// the categories, in the grid's order: [id, name, test(item def, id)] - an item goes in the first that takes it
export const BAG_CATS = [
  ['weapons', 'Weapons'],
  ['healing', 'Healing', (it, id) => (it.heal && !it.food) || id === 'revivekit'],
  ['food', 'Food & drink', (it) => it.food || it.buff === 'coffee' || it.buff === 'energy' || it.buff === 'wine' || it.stamina],
  ['clothes', 'Clothes', (it) => it.crafted || it.camo],
  ['fishing', 'Fishing', (it) => it.bait || it.rod || it.fish],
  ['tools', 'Tools & lights', (it) => it.tool || it.light || it.chute || it.fell || it.buff],
  ['hunting', 'Hunting', (it) => it.game || it.pelt],
  ['garden', 'Garden', (it) => it.seed || it.crop || it.prize],
  ['valuables', 'Valuables', (it) => it.loot || it.protected],
  ['other', 'Other', () => true],
];
export function itemCat(id) {
  const it = ITEMS[id];
  if (!it) return 'other';
  for (const [c, , test] of BAG_CATS) if (test && test(it, id)) return c;
  return 'other';
}
const SORTS = [['kind', 'By kind'], ['name', 'A-Z'], ['count', 'Most'], ['value', 'Value']];

// what an item does, in a line
export function describe(id) {
  const it = ITEMS[id];
  if (!it) return '';
  if (id === 'revivekit') return 'Revive a downed player to full health - never used up.';
  if (id === 'surfboard') return 'In the sea you lie on it and paddle. At a surf break, paddle for the beach as a wave comes, then carve along its face.';
  if (id === 'parachute') return `Jump out of a helicopter or a plane high up, then ${keyName('action')} opens it. One jump.`;
  if (id === 'drill') return 'A bank job: set it at a vault door behind the counter. The alarm goes at once; it works through in about a minute.';
  if (id === 'flashlight') return `${keyName('light')} switches it on and off. Held in your free hand; everyone sees the beam.`;
  if (id === 'headlamp' || id === 'hardhat') return `${keyName('light')} switches it on and off - hands free${id === 'hardhat' ? '; the hat takes some of a falling tree or rock' : ''}. Runs on batteries.`;
  if (id === 'lantern') return 'A warm glow all round you, in one hand. Use it again while lit to set it down.';
  if (id === 'flare') return 'Strike it and throw it: a red light for about a minute.';
  if (id === 'glowstick') return 'Snap it and drop it: a little glow for a few minutes.';
  if (id === 'batteries') return 'A fresh set goes into a light by itself when its batteries run flat.';
  if (it.fell) return `Hold the action button at a tree to fell it${id === 'hatchet' ? ' (small trees only)' : id === 'axe' ? ' (not the giant redwoods)' : id === 'chainsaw' ? ' - the fastest, loud, runs on fuel' : ''}.`;
  if (id === 'sawfuel') return 'Fills the chainsaw when it runs dry.';
  if (it.heal && !it.food) return `+${it.heal} health, stops bleeding.`;
  if (it.food) return `+${it.heal} health (doesn't stop bleeding)${it.hearty ? ' - a hearty meal' : ''}.`;
  if (it.buff === 'wine') return 'Health comes back faster for 2 minutes.';
  if (it.buff === 'coffee') return 'Refills stamina; faster recovery for 60 s.';
  if (it.buff === 'energy') return 'Extra stamina and speed for 60 s.';
  if (it.buff === 'scent') return 'No animal smells you for a while, whatever the wind.';
  if (it.rod) return 'A fishing rod: cast from the shore, a pier or a boat.';
  if (it.bait) return `Bait for fishing${it.night ? ' - best at night' : ''}.`;
  if (it.fish) return 'A catch: a fish market or a tackle shop buys it.';
  if (it.crafted || it.camo) return it.camo ? 'Camouflage: the animals see you less.' : 'Made from what you hunted. A trading post buys it.';
  if (it.game || it.pelt) return 'From a hunt: a butcher, a lodge or a trapper buys it; cook the meat at home.';
  if (it.seed) return 'Plant it in a garden plot at your home.';
  if (it.illegal) return 'Illegal to carry - a fence buys it.';
  return it.sell ? 'Something to sell.' : '';
}

const loadPref = (k, d) => { try { return localStorage.getItem('cla.bag.' + k) || d; } catch { return d; } };
const savePref = (k, v) => { try { localStorage.setItem('cla.bag.' + k, v); } catch { /* storage blocked */ } };

// el: the #inv tab; send(msg); me() the self record; refocus() after a render (the pad's focus)
export function createBag({ el, send, me, refocus }) {
  let open = false, cat = loadPref('cat', 'all'), sort = loadPref('sort', 'kind'), sel = null, armDrop = '';
  el.innerHTML = `<div class="bag"><div class="bag-tools"><span class="bag-cash"></span><div class="bag-cats" role="tablist" aria-label="Show"></div>`
    + `<label class="bag-sort"><span>Sort</span><select aria-label="Sort">${SORTS.map(([k, n]) => `<option value="${k}">${n}</option>`).join('')}</select></label></div>`
    + '<div class="bag-grid" role="list"></div><aside class="bag-detail" aria-live="polite"></aside><div class="bag-wheel"></div>'
    + '<section class="bag-craft" hidden aria-label="Crafting"></section></div>';
  const $q = (s) => el.querySelector(s), grid = $q('.bag-grid');
  $q('.bag-sort select').value = sort;
  $q('.bag-sort select').onchange = (e) => { sort = e.target.value; savePref('sort', sort); render(); };
  grid.addEventListener('scroll', () => cue(grid), { passive: true });

  // everything you carry: [{ k, kind: 'w' | 'i', id, name, n, cat, value }]
  function things(m) {
    const out = [];
    for (const w of m.weapons || []) { const d = WEAPONS[w.id]; if (d) out.push({ k: 'w:' + w.id, kind: 'w', id: w.id, name: d.name, n: 1, cat: 'weapons', value: 0, w, i: d.i }); }
    for (const [id, n] of Object.entries(m.inv || {})) if (n > 0 && ITEMS[id]) out.push({ k: 'i:' + id, kind: 'i', id, name: ITEMS[id].name, n, cat: itemCat(id), value: (ITEMS[id].sell || 0) * n });
    const order = new Map(BAG_CATS.map(([c], i) => [c, i]));
    const by = {
      kind: (a, b) => order.get(a.cat) - order.get(b.cat) || (a.kind === 'w' ? (WEAPONS[a.id].i - WEAPONS[b.id].i) : a.name.localeCompare(b.name)),
      name: (a, b) => a.name.localeCompare(b.name),
      count: (a, b) => b.n - a.n || a.name.localeCompare(b.name),
      value: (a, b) => b.value - a.value || a.name.localeCompare(b.name),
    };
    return out.sort(by[sort] || by.kind);
  }
  function cell(t, m) {
    const pin = t.kind === 'i' ? (m.quick || []).indexOf(t.id) : -1, on = t.kind === 'w' && m.weapon === t.id;
    const b = document.createElement('button');
    b.className = 'bag-cell' + (t.k === sel ? ' sel' : '') + (on ? ' on' : '');
    b.dataset.k = t.k; b.setAttribute('role', 'listitem');
    b.innerHTML = `<span class="bc-ic">${t.kind === 'i' ? esc(ITEM_ICON[t.id] || '•') : ''}</span><span class="bc-nm">${esc(t.name)}</span>`
      + (t.kind === 'w' && WEAPONS[t.id].mag ? `<span class="bc-n">${t.w.mag}|${Math.max(0, t.w.ammo - t.w.mag)}</span>` : t.n > 1 ? `<span class="bc-n">×${t.n}</span>` : '')
      + (on ? '<span class="bc-tag">IN HAND</span>' : pin >= 0 ? `<span class="bc-tag">SLOT ${pin + 1}</span>` : '');
    if (t.kind === 'w') b.querySelector('.bc-ic').appendChild(fittedIcon(t.i, m.blade, 64, 36));
    b.onclick = () => { sel = sel === t.k && !portrait() ? null : t.k; armDrop = ''; render(); };
    return b;
  }
  const portrait = () => document.body.classList.contains('portrait');

  function detail(t, m) {
    const d = $q('.bag-detail');
    el.querySelector('.bag').classList.toggle('has-sel', !!t);
    if (!t) { d.innerHTML = `<p class="bag-hint">Pick something to see what it does.<br>${wheelHint()}</p>`; return; }
    const quick = m.quick || [];
    const it = t.kind === 'i' ? ITEMS[t.id] : null, def = t.kind === 'w' ? WEAPONS[t.id] : null;
    const what = t.kind === 'w' ? weaponLine(def) : describe(t.id);
    const count = t.kind === 'w' ? (def.mag ? `${t.w.mag} in the gun · ${Math.max(0, t.w.ammo - t.w.mag)} spare` : '') : `${t.n} carried${it.sell ? ` · sells for about $${it.sell} each` : ''}`;
    let acts = '';
    if (t.kind === 'w') {
      acts += m.weapon === t.id ? (t.id === 'fists' ? '' : '<button class="btn" data-a="holster">Put away</button>') : '<button class="btn btn-1" data-a="equip">Equip</button>';
      if (t.id === 'plasma') acts += `<div class="bag-blade"><small>Blade colour</small>${BLADE_COLORS.map((bc, i) => `<button class="sw${i === (m.blade | 0) ? ' on' : ''}" data-blade="${i}" aria-label="${esc(bc.name)}" style="--sw:${esc(bc.c)};--swc:${esc(bc.core)}"></button>`).join('')}</div>`;
    } else if (usable(t.id)) acts += `<button class="btn btn-1" data-a="use">${it.light ? (m.light ? 'Turn off' : 'Turn on') : 'Use'}</button>`;
    if (t.kind === 'i' && usable(t.id)) acts += `<div class="bag-pins"><small>Quick wheel slot</small>${Array.from({ length: SLOTS }, (_, i) => `<button class="btn bag-pin${quick[i] === t.id ? ' on' : ''}" data-pin="${i}" aria-pressed="${quick[i] === t.id}">${i + 1}</button>`).join('')}</div>`;
    if (t.id !== 'fists') acts += `<button class="btn btn-x" data-a="drop">${armDrop === t.k ? 'Press again to drop it' : t.n > 1 ? 'Drop one' : 'Drop'}</button>` + (t.n > 1 ? `<button class="btn btn-x" data-a="dropall">${armDrop === t.k + '*' ? `Press again: drop all ${t.n}` : `Drop all ${t.n}`}</button>` : '');
    d.innerHTML = `<div class="bd-head"><span class="bd-ic">${t.kind === 'i' ? esc(ITEM_ICON[t.id] || '•') : ''}</span><div><h3>${esc(t.name)}</h3><small>${esc(BAG_CATS.find((c) => c[0] === t.cat)[1])}</small></div>`
      + '<button class="x bd-x" data-a="close" aria-label="Back to the bag">✕</button></div>'
      + `<p class="bd-what">${esc(what)}</p>${count ? `<p class="bd-n">${esc(count)}</p>` : ''}<div class="bd-acts">${acts}</div>`;
    if (t.kind === 'w') d.querySelector('.bd-ic').appendChild(fittedIcon(def.i, m.blade, 96, 54));
    for (const b of d.querySelectorAll('[data-a]')) b.onclick = () => act(b.dataset.a, t);
    for (const b of d.querySelectorAll('[data-pin]')) b.onclick = () => { const i = Number(b.dataset.pin); send({ t: 'inv', a: 'slot', i, id: quick[i] === t.id ? null : t.id }); };
    for (const b of d.querySelectorAll('[data-blade]')) b.onclick = () => send({ t: 'look', a: 'blade', c: Number(b.dataset.blade) });
  }
  function act(a, t) {
    if (a === 'close') { sel = null; armDrop = ''; render(); return; }
    if (a === 'equip') send({ t: 'weapon', id: t.id });
    else if (a === 'holster') send({ t: 'weapon', id: 'fists' });
    else if (a === 'use') send({ t: 'inv', a: 'use', id: t.id });
    else if (a === 'drop' || a === 'dropall') {
      // two presses: dropping isn't something to do by accident (it lands in a bag at your feet: anyone can take it)
      const key = t.k + (a === 'dropall' ? '*' : '');
      if (armDrop !== key) { armDrop = key; render(); return; }
      armDrop = '';
      send({ t: 'inv', a: 'drop', id: t.id, w: t.kind === 'w', n: a === 'dropall' ? t.n : 1 });
      if (a === 'dropall' || t.n <= 1) sel = null;
    }
    render();
  }
  const weaponLine = (d) => (d.type === 'melee' ? 'A melee weapon: up close.' : d.type === 'tool' ? 'A tool you hold.' : d.type === 'throw' ? 'Thrown: aim and let go.' : `${d.mag ? `A ${d.mag}-round magazine. ` : ''}Aim and fire; ${keyName('reload')} reloads.`);
  const wheelHint = () => `${input.device === 'gamepad' ? 'Hold View' : input.device === 'touch' ? 'Hold ITEMS' : `Hold ${keyName('use')}`} for the quick wheel, then let go on a slot.`;

  function render() {
    const m = me();
    if (!open || !m) return;
    const all = things(m), cats = new Set(all.map((t) => t.cat));
    if (cat !== 'all' && !cats.has(cat)) cat = 'all';
    // the filter: All, then each category you have something in
    const cb = $q('.bag-cats');
    cb.innerHTML = [['all', 'All'], ...BAG_CATS.filter(([c]) => cats.has(c))].map(([c, n]) => `<button class="chip${c === cat ? ' on' : ''}" role="tab" aria-selected="${c === cat}" data-cat="${c}">${n}</button>`).join('');
    for (const b of cb.querySelectorAll('[data-cat]')) b.onclick = () => { cat = b.dataset.cat; savePref('cat', cat); render(); };
    $q('.bag-cash').innerHTML = `<b>$${(m.cash || 0).toLocaleString('en-US')}</b> cash · $${(m.bank || 0).toLocaleString('en-US')} bank${m.creel ? ` · cooler ${m.creel.n}/${m.creel.max} fish (~$${m.creel.v.toLocaleString('en-US')})` : ''}`;
    const shown = all.filter((t) => cat === 'all' || t.cat === cat);
    grid.innerHTML = '';
    let last = '';
    for (const t of shown) {
      if (cat === 'all' && sort === 'kind' && t.cat !== last) { last = t.cat; const h = document.createElement('h4'); h.className = 'bag-h'; h.textContent = BAG_CATS.find((c) => c[0] === t.cat)[1]; grid.appendChild(h); }
      grid.appendChild(cell(t, m));
    }
    if (!shown.length) grid.innerHTML = '<p class="bag-hint">Nothing here yet. Pharmacies sell med kits and bandages; coffee shops and corner stores sell drinks.</p>';
    if (sel && !all.some((t) => t.k === sel)) sel = null;
    detail(all.find((t) => t.k === sel) || null, m);
    // the quick wheel as it stands (a slot picks its item; pin from an item's details)
    const quick = m.quick || [];
    $q('.bag-wheel').innerHTML = `<small>QUICK WHEEL</small>${Array.from({ length: SLOTS }, (_, i) => { const id = quick[i], n = id ? m.inv[id] || 0 : 0; return `<button class="bag-slot${id ? '' : ' empty'}" data-slot="${i}"${id ? '' : ' disabled'}><b>${i + 1}</b>${id ? `<span>${esc(ITEM_ICON[id] || '•')}</span>${esc(ITEMS[id].name)}${n ? '' : ' (none left)'}` : 'empty'}</button>`; }).join('')}`;
    for (const b of el.querySelectorAll('[data-slot]')) b.onclick = () => { const id = quick[Number(b.dataset.slot)]; if (id) { sel = 'i:' + id; render(); } };
    cue(grid);
    refocus?.();
  }
  return {
    get open() { return open; },
    show() { open = true; render(); },
    hide() { open = false; sel = null; armDrop = ''; },
    refresh: render,
    // the pad's B with something picked: back to the grid first
    back() { if (sel) { sel = null; armDrop = ''; render(); return true; } return false; },
  };
}
// a scroller with more below shows a fade at its foot (the scroll cue)
export function cue(el) { el.classList.toggle('cue-down', el.scrollTop + el.clientHeight < el.scrollHeight - 4); }
