// The quick wheel, the weapon picker and the weapon wheel (the bag itself, the hub's BAG tab: client/bag.js).
//
// Quick wheel: hold the use key (X / View / ITEMS) and four slots fan out round your character;
// point at one (mouse, right stick, or your finger) and let go to use it. A quick tap uses the slot
// you used last. On touch, tapping ITEMS opens the wheel and a tap on a slot uses it.
// The client only asks; the server checks you have the item and applies it.
// Weapon wheel (a pad: hold RB or LB): everything you carry round a circle in the order the bumpers step through it;
// point a stick at one and let go of the bumper to take it out.
import { WEAPONS, ITEMS, weaponOrder } from '../shared/items.js';
import { wheelPicker } from '../shared/input.js';
import { weaponIcon } from './render/peds.js';

export const ITEM_ICON = {
  medkit: '✚', bandage: '🩹', coffee: '☕', energy: '⚡', cocktail: '🍸', revivekit: '⚕', flashlight: '🔦', surfboard: '🏄', parachute: '🪂', drill: '🛠',
  lure: '🎣', worms: '🪱', shrimp: '🦐', squid: '🦑', glowlure: '✨', crickets: '🦗', minnows: '🐟', doughballs: '⚪', chum: '🪣', dryfly: '🪰',
  caneRod: '🎣', baitcaster: '🎣', flyRod: '🎣', surfRod: '🎣', gameRod: '🎣',
  bass: '🐟', catfish: '🐟', salmon: '🐟', tuna: '🐟', grouper: '🐟', swordfish: '🐟', marlin: '🐟',
  purse: '👜', bonds: '📜', jewelry: '💎', scrap: '⚙', wallet: '👛',
  apple: '🍎', orange: '🍊', grapes: '🍇', hotdog: '🌭', bread: '🍞', honey: '🍯', lemonade: '🍋', cider: '🧃', redwine: '🍷', whitewine: '🥂', beer: '🍺', whiskey: '🥃', lavender: '💜', nugget: '🟡', quartz: '🔷', doubloon: '🪙',
  goldTrumpet: '🍄', bunCap: '🍄', shelfOyster: '🍄', redcap: '🍄', ghostglass: '🔮', goldStar: '⭐',
  wildBerries: '🫐', wildHerbs: '🌿', wildHoneycomb: '🍯', blackTruffle: '🟤', geode: '🪨', amethystGeode: '💜', fossilFern: '🪨', ammonite: '🐚', arrowhead: '🔺', riverMussels: '🦪', riverPearl: '⚪', goldFlakes: '✨', antlerShed: '🦌', eagleFeather: '🪶', trowel: '🔧', goldPan: '🥘',
  headlamp: '🔦', hardhat: '⛑', lantern: '🏮', flare: '🧨', glowstick: '🟢', batteries: '🔋', hatchet: '🪓', axe: '🪓', fellaxe: '🪓', chainsaw: '🪚', sawfuel: '⛽',   // (lights and felling: #358, #359)
  venison: '🥩', rabbitMeat: '🥩', venisonSteak: '🍖', rabbitRoast: '🍗', deerHide: '🟫', antlers: '🦌', rabbitPelt: '🐇', coyotePelt: '🐺', wolfPelt: '🐺', raccoonPelt: '🦝',
  filmTicket: '🎟', popcorn: '🍿',   // (The Grand Theatre's counter)
  seed_tomato: '🌱', seed_carrot: '🌱', seed_lettuce: '🌱', seed_pumpkin: '🌱', tomato: '🍅', carrot: '🥕', lettuce: '🥬', pumpkin: '🎃', prize_tomato: '🍅', prize_carrot: '🥕', prize_lettuce: '🥬', prize_pumpkin: '🎃',   // (gardening: H61)
  seed_corn: '🌱', seed_strawberry: '🌱', seed_sunflower: '🌱', corn: '🌽', strawberry: '🍓', sunflower: '🌻', prize_corn: '🌽', prize_strawberry: '🍓', prize_sunflower: '🌻',   // (H78)
};
const SLOTS = 4;

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

// ---- the weapon picker (touch: hold the weapon plate) -----------------------------------------------------
// Every weapon you carry in a tray at the bottom of the screen, the one in your hands marked: tap one to take it
// out. Tapping off the tray, or picking, closes it. (A tap on the weapon plate just takes out the next one.)
export function createWeaponPicker({ el, send, me }) {
  let open = false, sig = '', press = null;
  function render() {
    const m = me();
    if (!open || !m) return;
    const by = new Map((m.weapons || []).map((w) => [w.id, w])), ws = weaponOrder([...by.keys()]).map((id) => by.get(id));   // (the order a tap steps through them)
    const s = m.weapon + '|' + (m.blade | 0) + '|' + ws.map((w) => `${w.id}:${w.mag}:${w.ammo}`).join(',');
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
      b.appendChild(weaponIcon(def.i, m.blade));
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
  // (a touch that began before the tray opened - the hold on the weapon plate - picks nothing when it lifts)
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

// A weapon's icon cut down to its own pixels (render/peds.js weaponIcon keeps the art's whole box round it) and scaled
// to fit w x h, kept per weapon, colour and size: the wheel draws a slot's icon again whenever the pick moves. A canvas
// sits in one place at a time, and each slot of the wheel shows a different weapon.
const fitted = new Map();
export function fittedIcon(wi, bc, w, h) {
  const key = `${wi}|${bc | 0}|${w}x${h}`;
  let c = fitted.get(key);
  if (c) return c;
  const src = weaponIcon(wi, bc), W = src.width, H = src.height, d = src.getContext('2d').getImageData(0, 0, W, H).data;
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (d[(y * W + x) * 4 + 3] > 24) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0) return src;
  const bw = x1 - x0 + 1, bh = y1 - y0 + 1, k = Math.min(w / bw, h / bh, 2.5);
  c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(bw * k)); c.height = Math.max(1, Math.round(bh * k));
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.drawImage(src, x0, y0, bw, bh, 0, 0, c.width, c.height);
  if (fitted.size > 200) fitted.clear();
  fitted.set(key, c);
  return c;
}

// ---- the weapon wheel (a pad: hold RB or LB) --------------------------------------------------------------------------
// Every weapon you carry round a circle, in the order the bumpers step through them (the first at the top, clockwise:
// the plasma blade, last, just left of your fists); the one in your hands is picked to start with. point(sticks) moves
// the pick (shared/input.js wheelPicker), pick() takes it out and closes.
export function createWeaponWheel({ el, send, me }) {
  let open = false, ids = [], sel = -1, cur = -1, pointer = null, shown = '';
  function render() {
    const m = me();
    if (!open || !m) return;
    const key = `${sel}|${m.weapon}|${m.blade | 0}|${ids.join(',')}`;
    if (key === shown) return;
    shown = key;
    el.innerHTML = '';
    // the ring grows with what you carry, up to the screen's size, and the slots shrink to fit round it (the debug menu's
    // every weapon is 30 of them); each weapon fills its slot (no names round the ring: the one picked is named inside)
    const n = ids.length, R = Math.min(Math.max(90, n * 12), Math.min(innerWidth, innerHeight) * 0.42);
    const sw = Math.round(Math.max(30, Math.min(64, (2 * Math.PI * R) / n - 6))), sh = Math.round(sw * 0.66);
    el.style.background = `radial-gradient(circle at 50% 50%, rgba(0,0,0,.5) 0, rgba(0,0,0,.38) ${Math.round(R + sw * 0.6)}px, transparent ${Math.round(R + sw * 1.6)}px)`;
    ids.forEach((id, i) => {
      const def = WEAPONS[id], a = (i / n) * Math.PI * 2, b = document.createElement('div');
      b.className = 'ww-s' + (i === sel ? ' on' : '') + (id === m.weapon ? ' cur' : '');
      b.style.width = sw + 'px'; b.style.height = sh + 'px'; b.style.margin = `${-sh >> 1}px 0 0 ${-sw >> 1}px`;
      b.style.transform = `translate(${Math.round(Math.sin(a) * R)}px, ${Math.round(-Math.cos(a) * R)}px)${i === sel ? ' scale(1.2)' : ''}`;
      b.appendChild(fittedIcon(def.i, m.blade, sw - 10, sh - 8));
      el.appendChild(b);
    });
    const def = WEAPONS[ids[sel]], w = def && (m.weapons || []).find((q) => q.id === def.id);
    const mid = document.createElement('div'); mid.className = 'ww-mid';
    mid.innerHTML = def ? `${def.name}<small>${def.mag && w ? `${w.mag} | ${Math.max(0, w.ammo - w.mag)}` : def.id === m.weapon ? 'in your hands' : ''}</small>` : '';
    el.appendChild(mid);
  }
  function close() { open = false; shown = ''; el.classList.add('hidden'); }
  return {
    get open() { return open; },
    show() {
      const m = me();
      ids = weaponOrder((m && m.weapons || []).map((w) => w.id));
      if (ids.length < 2) return false;
      cur = sel = Math.max(0, ids.indexOf(m.weapon));
      pointer = wheelPicker(ids.length, sel);
      open = true; shown = ''; el.classList.remove('hidden'); render();
      return true;
    },
    point(a) { if (!open || !a) return; const s = pointer(a.lx, a.ly, a.rx, a.ry); if (s !== sel) { sel = s; render(); } },
    pick() { if (!open) return; if (sel >= 0 && sel !== cur && ids[sel]) send({ t: 'weapon', id: ids[sel] }); close(); },
    close,
    refresh() { if (open) render(); },
  };
}
