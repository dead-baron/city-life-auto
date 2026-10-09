// The bag (inventory screen) and the quick wheel.
//
// Bag: everything you carry - weapons (tap to equip), usable items (use now, or pin to one of the
// four quick-wheel slots), and loot / fish / bait. Opens and closes in one press (I, D-pad →, the
// 🎒 button) and the city keeps running behind it; tapping off the panel closes it.
//
// Quick wheel: hold the use key (X / View / ITEMS) and four slots fan out round your character;
// point at one (mouse, right stick, or your finger) and let go to use it. A quick tap uses the slot
// you used last. On touch, tapping ITEMS opens the wheel and a tap on a slot uses it.
// The client only asks; the server checks you have the item and applies it.
import { WEAPONS, ITEMS } from '../shared/items.js';
import { weaponIcon } from './render/peds.js';
import { keyName } from './glyphs.js';

export const ITEM_ICON = {
  medkit: '✚', bandage: '🩹', coffee: '☕', energy: '⚡', cocktail: '🍸', revivekit: '⚕', flashlight: '🔦',
  lure: '🎣', worms: '🪱', shrimp: '🦐', squid: '🦑', glowlure: '✨',
  bass: '🐟', catfish: '🐟', salmon: '🐟', tuna: '🐟', grouper: '🐟', swordfish: '🐟', marlin: '🐟',
  purse: '👜', bonds: '📜', jewelry: '💎', scrap: '⚙', wallet: '👛',
  apple: '🍎', orange: '🍊', grapes: '🍇', hotdog: '🌭', bread: '🍞', honey: '🍯', lemonade: '🍋', cider: '🧃', redwine: '🍷', whitewine: '🥂', beer: '🍺', whiskey: '🥃', lavender: '💜', nugget: '🟡', quartz: '🔷', doubloon: '🪙',
  goldTrumpet: '🍄', bunCap: '🍄', shelfOyster: '🍄', redcap: '🍄', ghostglass: '🔮', goldStar: '⭐',
  venison: '🥩', rabbitMeat: '🥩', venisonSteak: '🍖', rabbitRoast: '🍗', deerHide: '🟫', antlers: '🦌', rabbitPelt: '🐇', coyotePelt: '🐺', raccoonPelt: '🦝',
};
const usable = (id) => !!(ITEMS[id] && (ITEMS[id].heal || ITEMS[id].buff || ITEMS[id].light)); // (the flashlight: switched on / off)
const SLOTS = 4;

export function createInventory({ el, send, me, onClose }) {
  let open = false;

  function render() {
    const m = me();
    if (!open || !m) return;
    const quick = m.quick || [];
    const weapons = (m.weapons || []).slice().sort((a, b) => (WEAPONS[a.id]?.i ?? 99) - (WEAPONS[b.id]?.i ?? 99));
    const items = Object.entries(m.inv || {}).filter(([k, n]) => n > 0 && ITEMS[k]);
    const use = items.filter(([k]) => usable(k) || ITEMS[k].tool);
    const other = items.filter(([k]) => !usable(k) && !ITEMS[k].tool);
    const body = el.querySelector('.inv-body');
    body.innerHTML = '';
    // the wheel, as it stands
    const wheel = document.createElement('div');
    wheel.className = 'inv-wheel';
    wheel.innerHTML = '<h3>Quick wheel <small>hold X / View / ITEMS, let go on a slot</small></h3>';
    const row = document.createElement('div'); row.className = 'inv-slots';
    for (let i = 0; i < SLOTS; i++) {
      const id = quick[i];
      const n = id ? (m.inv[id] || 0) : 0;
      const b = document.createElement('button');
      b.className = 'inv-slot' + (id ? '' : ' empty') + (id && !n ? ' out' : '');
      b.innerHTML = id ? `<span class="ic">${ITEM_ICON[id] || '•'}</span><span>${ITEMS[id].name}</span><small>${n ? 'x' + n : 'none left'}</small>` : `<span class="ic">${i + 1}</span><span>empty</span>`;
      b.title = id ? 'Clear this slot' : 'Pin an item here with its 1-4 buttons below';
      if (id) b.onclick = () => send({ t: 'inv', a: 'slot', i, id: null });
      row.appendChild(b);
    }
    wheel.appendChild(row);
    body.appendChild(wheel);
    // weapons
    const ws = section(body, 'Weapons');
    for (const w of weapons) {
      const def = WEAPONS[w.id];
      if (!def) continue;
      const b = document.createElement('button');
      b.className = 'inv-weapon' + (m.weapon === w.id ? ' on' : '');
      b.appendChild(weaponIcon(def.i));
      const t = document.createElement('span');
      t.innerHTML = `${def.name}<small>${def.mag ? `${w.mag} | ${Math.max(0, w.ammo - w.mag)}` : m.weapon === w.id ? 'equipped' : ''}</small>`;
      b.appendChild(t);
      b.onclick = () => send({ t: 'weapon', id: w.id });
      ws.appendChild(b);
    }
    // usable items: use now, or pin to a slot
    const is = section(body, 'Items');
    if (!use.length) is.innerHTML = '<p class="inv-none">Nothing to use. Pharmacies sell med kits and bandages; coffee shops, corner stores and clubs sell drinks.</p>';
    for (const [id, n] of use) {
      const it = ITEMS[id];
      const r = document.createElement('div'); r.className = 'inv-item';
      r.innerHTML = `<span class="ic">${ITEM_ICON[id] || '•'}</span><span class="nm">${it.name} <small>x${n}</small><em>${describe(id)}</em></span>`;
      if (usable(id)) {
        const u = document.createElement('button'); u.className = 'inv-use'; u.textContent = 'Use';
        if (it.light) { u.textContent = m.light ? 'Turn off' : 'Turn on'; u.classList.toggle('lit', !!m.light); }
        u.onclick = () => send({ t: 'inv', a: 'use', id });
        r.appendChild(u);
        for (let i = 0; i < SLOTS; i++) {
          const s = document.createElement('button');
          s.className = 'inv-pin' + (quick[i] === id ? ' on' : '');
          s.textContent = String(i + 1); s.title = `Put on quick slot ${i + 1}`;
          s.onclick = () => send({ t: 'inv', a: 'slot', i, id: quick[i] === id ? null : id });
          r.appendChild(s);
        }
      }
      is.appendChild(r);
    }
    if (other.length) {
      const os = section(body, 'Loot, fish & bait');
      for (const [id, n] of other) {
        const r = document.createElement('div'); r.className = 'inv-item';
        r.innerHTML = `<span class="ic">${ITEM_ICON[id] || '•'}</span><span class="nm">${ITEMS[id].name} <small>x${n}</small><em>${ITEMS[id].sell ? `sells for about $${ITEMS[id].sell}` : ''}</em></span>`;
        os.appendChild(r);
      }
    }
    el.querySelector('.inv-cash').textContent = `$${(m.cash || 0).toLocaleString()} cash · $${(m.bank || 0).toLocaleString()} bank`;
  }

  return {
    get open() { return open; },
    show() { open = true; el.classList.remove('hidden'); render(); },
    hide() { if (!open) return; open = false; el.classList.add('hidden'); onClose?.(); },
    toggle() { if (open) this.hide(); else this.show(); },
    refresh: render,
  };
}

function section(body, title) {
  const h = document.createElement('h3'); h.textContent = title; body.appendChild(h);
  const box = document.createElement('div'); box.className = 'inv-sec'; body.appendChild(box);
  return box;
}
function describe(id) {
  const it = ITEMS[id];
  if (id === 'revivekit') return 'revive a downed player to full health - never used up';
  if (id === 'flashlight') return `${keyName('light')} switches it on and off - no hand slot (you keep your weapon); everyone sees the beam`;
  if (id === 'medkit') return `+${it.heal} health, stops bleeding`;
  if (id === 'bandage') return `+${it.heal} health, stops bleeding`;
  if (it.food) return `+${it.heal} health (doesn't stop bleeding)${it.sell ? ` - or sell it for about $${it.sell}` : ''}`;
  if (it.buff === 'wine') return 'a glass or two: health comes back faster for 2 minutes';
  if (it.buff === 'coffee') return 'refills stamina, faster recovery for 60s';
  if (it.buff === 'energy') return 'extra stamina and speed for 60s';
  return '';
}

// ---- the quick wheel ------------------------------------------------------------------------------
// Four slots round a centre; pick(angle) gives the slot a direction points at (up, right, down, left).
export function createWheel({ el, send, me }) {
  let open = false, sel = -1, sticky = false;
  const slotAt = (dx, dy) => {
    if (Math.hypot(dx, dy) < 24) return -1;
    const a = Math.atan2(dy, dx); // 0 right, pi/2 down
    if (a > -Math.PI * 3 / 4 && a <= -Math.PI / 4) return 0;   // up
    if (a > -Math.PI / 4 && a <= Math.PI / 4) return 1;         // right
    if (a > Math.PI / 4 && a <= Math.PI * 3 / 4) return 2;      // down
    return 3;                                                    // left
  };
  function render() {
    const m = me();
    if (!m) return;
    const quick = m.quick || [];
    el.innerHTML = '';
    for (let i = 0; i < SLOTS; i++) {
      const id = quick[i], n = id ? (m.inv[id] || 0) : 0;
      const b = document.createElement('button');
      b.className = `wheel-slot s${i}` + (i === sel ? ' on' : '') + (!id || !n ? ' empty' : '');
      b.innerHTML = id ? `<span class="ic">${ITEM_ICON[id] || '•'}</span><span>${ITEMS[id].name}</span><small>${!n ? 'none' : ITEMS[id].light ? (m.light ? 'on' : 'off') : 'x' + n}</small>` : '<span class="ic">·</span><span>empty</span><small>pin one in the bag</small>';
      b.onpointerup = (e) => { e.stopPropagation(); sel = i; use(); };
      el.appendChild(b);
    }
    const c = document.createElement('div'); c.className = 'wheel-mid'; c.textContent = sel >= 0 && quick[sel] ? ITEMS[quick[sel]].name : 'Use...';
    el.appendChild(c);
  }
  function use() {
    const m = me();
    const id = m && m.quick && m.quick[sel];
    if (id && (m.inv[id] || 0) > 0) { send({ t: 'inv', a: 'use', id }); wheelLast = sel; }
    close();
  }
  function close() { open = false; sticky = false; sel = -1; el.classList.add('hidden'); }
  let wheelLast = 0;
  return {
    get open() { return open; },
    // hold-to-open (keyboard / pad); sticky: stays open until a slot is tapped (touch)
    show(isSticky = false) { open = true; sticky = isSticky; sel = -1; el.classList.remove('hidden'); render(); },
    point(dx, dy) { if (!open) return; const s = slotAt(dx, dy); if (s !== sel) { sel = s; render(); } },
    // let go of the key: use the slot pointed at; a quick tap (nothing pointed at) uses the last one
    release(quickTap) { if (!open || sticky) return; if (sel < 0 && quickTap) sel = wheelLast; if (sel >= 0) use(); else close(); },
    close,
    refresh() { if (open) render(); },
  };
}

// ---- the weapon picker (touch: hold WPN or the weapon box) ----------------------------------------------
// Every weapon you carry in a tray at the bottom of the screen, the one in your hands marked: tap one to take it
// out. Tapping off the tray, or picking, closes it. (A tap on WPN or the weapon box just takes out the next one.)
export function createWeaponPicker({ el, send, me }) {
  let open = false, sig = '', press = null;
  function render() {
    const m = me();
    if (!open || !m) return;
    const ws = (m.weapons || []).slice().sort((a, b) => (WEAPONS[a.id]?.i ?? 99) - (WEAPONS[b.id]?.i ?? 99));
    const s = m.weapon + '|' + ws.map((w) => `${w.id}:${w.mag}:${w.ammo}`).join(',');
    if (s === sig) return;
    sig = s;
    el.innerHTML = '';
    const box = document.createElement('div'); box.className = 'wp-box';
    const h = document.createElement('div'); h.className = 'wp-h'; h.textContent = 'Take out a weapon'; box.appendChild(h);
    const row = document.createElement('div'); row.className = 'wp-row';
    for (const w of ws) {
      const def = WEAPONS[w.id];
      if (!def) continue;
      const b = document.createElement('button');
      b.className = 'wp-w' + (m.weapon === w.id ? ' on' : '');
      b.appendChild(weaponIcon(def.i));
      const t = document.createElement('span');
      t.innerHTML = `${def.name}<small>${def.mag ? `${w.mag} | ${Math.max(0, w.ammo - w.mag)}` : m.weapon === w.id ? 'in your hands' : ''}</small>`;
      b.appendChild(t);
      // a touch picks only if it started on this button and didn't wander (the hold that opened the tray may end
      // over it; a drag scrolls a long tray)
      const pick = () => { const mm = me(); if (mm && mm.weapon !== w.id) send({ t: 'weapon', id: w.id }); close(); };
      b.addEventListener('touchstart', (e) => { e.stopPropagation(); const t = e.changedTouches[0]; press = { b, x: t.clientX, y: t.clientY }; }, { passive: true });
      b.addEventListener('touchmove', (e) => { const t = e.changedTouches[0]; if (press && Math.hypot(t.clientX - press.x, t.clientY - press.y) > 12) press = null; }, { passive: true });
      b.addEventListener('touchend', (e) => { e.preventDefault(); e.stopPropagation(); const ok = press && press.b === b; press = null; if (ok) pick(); }, { passive: false });
      b.addEventListener('click', (e) => { e.stopPropagation(); pick(); });
      row.appendChild(b);
    }
    box.appendChild(row);
    el.appendChild(box);
  }
  function close() { open = false; sig = ''; press = null; el.classList.add('hidden'); }
  // a tap off the tray closes it (the tray's own touches stop before here)
  const off = (e) => { if (e.target === el) { e.preventDefault(); close(); } };
  // (a touch that began before the tray opened - the hold on WPN - picks nothing when it lifts)
  el.addEventListener('touchend', (e) => { if (!press) e.preventDefault(); }, { passive: false });
  el.addEventListener('touchstart', off, { passive: false });
  el.addEventListener('mousedown', off);
  return {
    get open() { return open; },
    show() { open = true; sig = ''; el.classList.remove('hidden'); render(); },
    toggle() { if (open) close(); else this.show(); },
    close,
    refresh() { if (open) render(); },
  };
}
