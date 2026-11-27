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
import * as trunk from './trunk.js';

const stOf = (prof) => { const st = arms.stashOf(prof); st.items ||= {}; return st; };
// where things go at the door it's open at: your stash, or a vehicle's trunk (trunk.js: its own, with room for cap)
const poolOf = (p) => (p.stashAt && p.stashAt.k === 'trunk' ? trunk.poolOf(p, p.stashAt) : stOf(p.profile));
const full = (p, pool, id, isW) => { const at = p.stashAt; return !!(at && at.cap) && !(isW ? pool.weapons[id] !== undefined : pool.items[id] > 0) && trunk.used(pool) >= at.cap; };

export function stateMsg(p) {
  const at = p.stashAt, st = poolOf(p) || { items: {}, weapons: {} };
  const items = {}, weapons = {};
  for (const [id, n] of Object.entries(st.items)) if (n > 0 && ITEMS[id]) items[id] = n;
  for (const [id, n] of Object.entries(st.weapons || {})) if (WEAPONS[id]) weapons[id] = n | 0;
  return { t: 'stash', open: !!at, where: at ? at.label : '', name: at && at.k === 'trunk' ? 'TRUNK' : 'STASH', cap: (at && at.cap) || 0, items, weapons };
}
const send = (p) => { if (p.conn) p.conn.sendJSON(stateMsg(p)); };

// can it stay open: alive, free, near the door (inside the same home)
export function stillOpen(p, w = null) {
  const at = p.stashAt, ped = p.ped;
  if (!at || !ped || ped.dead || p.custody) return false;
  if (at.k === 'home') return !!(ped.home && ped.home.id === at.home && !ped.home.guest);
  if (at.k === 'trunk') return !!w && trunk.stillThere(w, p, at) && !!trunk.poolOf(p, at);
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
  for (const p of world.players.values()) if (p.stashAt && !stillOpen(p, world)) close(p);
}

// an item between your pockets and the stash -> error | null
export function moveItem(p, put, id, n) {
  const prof = p.profile, st = poolOf(p), it = ITEMS[id];
  if (!st) return 'Not open.';
  if (!it) return 'Not a thing you can stash.';
  const [from, to] = put ? [prof.inventory, st.items] : [st.items, prof.inventory];
  const have = from[id] || 0;
  if (have <= 0) return put ? 'You aren\'t carrying that.' : 'Not in your stash.';
  if (put && it.ride) return 'Keep it with you - a board or blades go home by themselves.';
  if (put && full(p, st, id, false)) return 'No room left in there.';
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
  if (!stillOpen(p, world)) { close(p); world.notify(p, 'It\'s closed - open your stash at home, a gun or pawn shop or your hideout, or a trunk at your vehicle\'s back.', 'info'); return; }
  const id = String(msg.id || '').slice(0, 40), put = a === 'put';
  let err;
  const pool = p.stashAt.k === 'trunk' ? poolOf(p) : null;   // (a trunk's weapons, else your stash's: arms.js)
  if (msg.k === 'w') {
    if (put) err = pool && full(p, pool, id, true) ? 'No room left in there.' : arms.toStash(p, id, pool && pool.weapons);
    else { err = arms.fromStash(p, id, pool && pool.weapons); const room = p.lastRoom || []; p.lastRoom = null; if (!err && room.length) world.notify(p, `The ${room.join(' and the ')} went in to make room.`, 'info'); }
  } else err = moveItem(p, put, id, msg.n);
  if (err) world.notify(p, err, 'warn');
  send(p);
}
