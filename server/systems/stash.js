// The stash, opened (the owner, 11-23: "store items in my home or safe lockers around the world ... and you can access
// the same pool of items/inventory/weapons"; docs/DECISIONS.md): one pool per character - profile.stash { items, weapons },
// the home safe's and the gun counters' (arms.js) and the fridge's (homeinside.js) - nothing in it lost to a death or an
// arrest. Opened from its doors (the menus' "Open your stash" row: economy.js, homeinside.js, hideout.js), it shows in
// the Inventory beside what you carry (client/bag.js: carried | stash, drag between or TO STASH / TAKE):
//   - a door: { k: 'home' | 'counter' | 'hideout', label, x, y, home? } - p.stashAt while open; walking off (STASH.reach
//     from where it was opened), leaving the home, dying or being held closes it
//   - { t: 'stash', a: 'put' | 'take', k: 'i' | 'w', id, n? } (n: how many of an item, all of them by default);
//     a weapon goes in or out with its rounds (arms.js toStash / fromStash: its class full, one swaps back in)
//   - { t: 'stash', a: 'close' }
// -> the page gets { t: 'stash', open, where, items, weapons } after each.
import { ITEMS, WEAPONS } from '../../shared/items.js';
import { STASH } from '../../shared/rules.js';
import { store } from '../store.js';
import * as arms from './arms.js';

const stOf = (prof) => { const st = arms.stashOf(prof); st.items ||= {}; return st; };

export function stateMsg(p) {
  const st = stOf(p.profile), at = p.stashAt;
  const items = {}, weapons = {};
  for (const [id, n] of Object.entries(st.items)) if (n > 0 && ITEMS[id]) items[id] = n;
  for (const [id, n] of Object.entries(st.weapons || {})) if (WEAPONS[id]) weapons[id] = n | 0;
  return { t: 'stash', open: !!at, where: at ? at.label : '', items, weapons };
}
const send = (p) => { if (p.conn) p.conn.sendJSON(stateMsg(p)); };

// can it stay open: alive, free, near the door (inside the same home)
export function stillOpen(p) {
  const at = p.stashAt, ped = p.ped;
  if (!at || !ped || ped.dead || p.custody) return false;
  if (at.k === 'home') return !!(ped.home && ped.home.id === at.home && !ped.home.guest);
  return !ped.home && Math.hypot(ped.x - at.x, ped.y - at.y) <= STASH.reach;
}

export function open(world, p, door) {
  if (!p.ped || p.ped.dead || p.custody) return 'Not right now.';
  p.stashAt = { ...door, at: world.time };
  send(p);
  return null;
}
export function close(p) { if (!p.stashAt) return; p.stashAt = null; send(p); }

// every tick (players.js): closed once you walk off
export function update(world) {
  if (world.tick % 5) return;
  for (const p of world.players.values()) if (p.stashAt && !stillOpen(p)) close(p);
}

// an item between your pockets and the stash -> error | null
export function moveItem(p, put, id, n) {
  const prof = p.profile, st = stOf(prof), it = ITEMS[id];
  if (!it) return 'Not a thing you can stash.';
  const [from, to] = put ? [prof.inventory, st.items] : [st.items, prof.inventory];
  const have = from[id] || 0;
  if (have <= 0) return put ? 'You aren\'t carrying that.' : 'Not in your stash.';
  if (put && it.ride) return 'Keep it with you - a board or blades go home by themselves.';
  const k = Number.isInteger(n) && n > 0 ? Math.min(n, have) : have;
  from[id] = have - k; if (!from[id]) delete from[id];
  to[id] = (to[id] || 0) + k;
  if (put && prof.bait === id && !prof.inventory[id]) prof.bait = null;
  p.meDirty = true;
  store.touch();
  return null;
}

export function handle(world, p, msg) {
  const a = String(msg.a || '');
  if (a === 'close') { close(p); return; }
  if (a !== 'put' && a !== 'take') return;
  if (!stillOpen(p)) { close(p); world.notify(p, 'Your stash is closed - open it at home, a gun or pawn shop, or your hideout.', 'info'); return; }
  const id = String(msg.id || '').slice(0, 40), put = a === 'put';
  let err;
  if (msg.k === 'w') {
    if (put) err = arms.toStash(p, id);
    else { err = arms.fromStash(p, id); const room = p.lastRoom || []; p.lastRoom = null; if (!err && room.length) world.notify(p, `The ${room.join(' and the ')} went in to make room.`, 'info'); }
  } else err = moveItem(p, put, id, msg.n);
  if (err) world.notify(p, err, 'warn');
  send(p);
}
