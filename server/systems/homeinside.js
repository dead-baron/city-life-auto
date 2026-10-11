// Inside your own home (H62; the owner, 2026-10-11: "after the honest jobs are in can we get more of the owning a house
// features up? Like going inside your own house would be great to get going"). At your front door the action button
// opens it and you're in: the rooms of a little level of its own (shared/homelayout.js: a plan for the home's kind,
// furnished by its price - not part of the map, so World v3 can move the homes about), walls you can't walk through,
// doors between the rooms, and things to use where they stand:
//   the bed: sleep - the screen goes dark while the night passes for you (the whole city's night too when everyone online
//     is asleep at home); you wake at morning healed and rested, and this is where you wake up from now on (saved)
//   the wardrobe: your outfits (a new one from your wardrobe, the quick change, the mirror: looks.js)
//   the safe: your stash - things, guns and cash kept at home, safe from a death or an arrest (profile.stash)
//   the fridge: food kept at home (profile.stash's food) - put it in, eat it
//   the shower: stops the bleeding, puts out a burn, a little health back
//   the hall table: the home menu (respawn point, the bank, the garage list)
//   the garage's key board (a house's or a mansion's garage, through the door from the hall): your cars - pick one and
//     you drive it out (homes.driveOut)
//   the front door: back out into the street (a couple of seconds' protection, as ever)
// Friends: at someone else's door while they're in, the action button knocks; the owner lets them in from the hall table
// (who's knocking is listed there). A guest walks round with you - you see each other in there - and goes out by the
// front door; the things in the place are the owner's.
// Nobody can see or hurt you inside (you're out of the world's grid: world.place), and the police can't follow you in.
// The server walks you round (input), says what the action button does where you stand (interaction), and sends you
// where you are every tick ({ t: 'home' }); the page only draws it (client/render/homeview.js, loaded when you go in).
//   ped.home: { id, x, y, a (px, in the plan), mv (walking), sleep / shower (when it ends, world.time; 0 none), eatAt }
//   ped.home.guest: a guest's host (pid); p.knock: { home, at } someone at a door, knocking
//   p.homeMenu: the menu of the thing you're using ('wardrobe' | 'safe' | 'fridge' | 'garage' | 'hall'), null for none
import { DAY_PART_S } from '../../shared/constants.js';
import { IN } from '../../shared/input.js';
import { HOME_IN } from '../../shared/rules.js';
import { ITEMS } from '../../shared/items.js';
import { VEHICLES } from '../../shared/vehicles.js';
import { layout, planOf, tierOf, stepInside, useAt, blocked } from '../../shared/homelayout.js';
import { store } from '../store.js';
import * as homes from './homes.js';
import * as economy from './economy.js';

export const planFor = (h) => layout(planOf(h), tierOf(h));
const homeOf = (world, ped) => (ped && ped.home ? homes.homeById(world, ped.home.id) : null);
const money = (n) => `$${Math.round(n).toLocaleString()}`;

// ---- in and out -------------------------------------------------------------------------------------------------------
// You're in (homes.goInside): just inside the front door
export function enter(world, p, h) {
  const ped = p.ped;
  const L = planFor(h);
  ped.home = { id: h.id, x: L.spawn.x, y: L.spawn.y, a: -Math.PI / 2, mv: false, sleep: 0, shower: 0, eatAt: -9 };
  p.homeMenu = null;
  send(world, p, true);
}

// The action button at your own front door, outside: in you go (wanted, the key takes a moment - homes.beginEnter)
export function doorInteraction(world, p) {
  const ped = p.ped;
  if (!ped || ped.dead || ped.vehId || ped.hidden || ped.carrying || ped.entering || ped.ug) return null;
  const poi = world.map.poiNear(ped.x, ped.y);
  if (!poi || poi.kind !== 'home' || !world.homeOwner.has(poi.home) || homes.unitsAt(world, poi)) return null;   // (an apartment block's lobby: its list of units, economy.js)
  const h = world.map.homes[poi.home];
  if (world.homeOwner.get(h.id) === p.pid) {
    if (!p.homePre && p.conn) { p.homePre = 1; p.conn.sendJSON({ t: 'home', pre: 1 }); }   // (the page fetches the rooms' drawing now, so they're there the moment you're in)
    return { label: `Go inside ${h.name}`, run: () => goIn(world, p, h) };
  }
  const host = hostIn(world, h);   // (someone else's: if they're in, knock)
  if (!host) return null;
  if (p.knock && p.knock.home === h.id && world.time - p.knock.at < 20) return { label: `Waiting for ${host.name} to open the door...`, passive: true, run: () => {} };
  return { label: `Knock on the door (${host.name} is in)`, run: () => knock(world, p, h, host) };
}
// the owner of h, online and inside it (null: not in)
function hostIn(world, h) {
  const q = world.players.get(world.homeOwner.get(h.id));
  return q && q.ped && q.ped.home && q.ped.home.id === h.id && !q.ped.home.guest && q.ped.hidden ? q : null;
}
// (H65) the owner of h at home just now (an apartment block's lobby: who to knock at); a knock from the lobby list
export const someoneIn = (world, h) => !!hostIn(world, h);
export function knockAt(world, p, h) {
  const host = hostIn(world, h);
  if (!host) return 'Nobody\'s in.';
  if (host === p) return null;
  knock(world, p, h, host);
  return null;
}
// the bedrooms in a home's plan (the real-estate app, the lobby)
export const bedsIn = (h) => planFor(h).pieces.filter((q) => q.use === 'bed').length;
function knock(world, p, h, host) {
  p.knock = { home: h.id, at: world.time };
  world.emit(h.x, h.y, { e: 'door', x: h.x, y: h.y });
  world.notify(p, `You knock on ${host.name}'s door...`, 'info');
  world.notify(host, `${p.name} is knocking at your door - let them in from the hall table.`, 'info');
}
// at h's front door, knocking, and fit to come in
function knocking(world, q, h) {
  const ped = q.ped;
  return !!(q.knock && q.knock.home === h.id && world.time - q.knock.at < 90 && ped && !ped.dead && !ped.hidden && !ped.vehId && !ped.carrying && Math.hypot(ped.x - h.x, ped.y - h.y) < 120);
}
// a guest in: just inside the front door, beside the host's way in
function letIn(world, q, h, host) {
  const ped = q.ped, L = planFor(h);
  if (q.wanted > 0 && world.time - (q.seenAt || -99) < 1.5) return `Not with the police watching ${q.name}!`;
  q.knock = null;
  ped.entering = null; ped.inside = h.id; ped.hidden = true; ped.vx = 0; ped.vy = 0; ped.rollT = 0; ped.fishing = null;
  ped.x = h.x; ped.y = h.y;
  world.place(ped);
  const gx = [L.spawn.x + 20, L.spawn.x - 20, L.spawn.x].find((x) => !blocked(L, x, L.spawn.y));   // (beside the way in, not on the host)
  ped.home = { id: h.id, x: gx, y: L.spawn.y, a: -Math.PI / 2, mv: false, sleep: 0, shower: 0, eatAt: -9, guest: host.pid };
  q.homeMenu = null; q.meDirty = true;
  world.emit(h.x, h.y, { e: 'door', x: h.x, y: h.y });
  world.notify(q, `${host.name} lets you in. Nobody outside can see or hurt you in here.`, 'good');
  world.notify(host, `${q.name} is in.`, 'good');
  send(world, q, true); send(world, host, true);
  return null;
}
export function goIn(world, p, h) {
  const err = homes.beginEnter(world, p, h);
  if (err) { world.notify(p, err, 'bad'); return err; }
  if (!(p.wanted > 0)) homes.goInside(world, p, h);   // (not wanted: the door's open and you're in)
  return null;
}

// ---- a look round a home for sale (H65) -------------------------------------------------------------------------------
// At a home for sale (its door's menu, an apartment block's lobby, the real-estate app's waypoint) "Take a look inside":
// you walk its rooms as a visitor - nothing to use, no safe - and at the front door, its price and Buy (or step out).
// Bought from inside, it's yours where you stand. Someone else buys it while you're looking: you're shown out.
// ped.home.tour: 1 while you're a visitor.
export function tour(world, p, h) {
  const ped = p.ped;
  if (!ped || ped.dead || ped.vehId || ped.hidden || ped.ug) return 'Not right now.';
  if (!h || h.gone) return 'No such place.';
  if (world.homeOwner.has(h.id)) return world.homeOwner.get(h.id) === p.pid ? 'It\'s yours - just go in.' : 'That place is sold.';
  if (p.wanted > 0) return 'Not while the police are after you.';
  if (ped.carrying) return 'Set the crate down first.';
  const L = planFor(h);
  ped.entering = null; ped.inside = h.id; ped.hidden = true; ped.vx = 0; ped.vy = 0; ped.rollT = 0; ped.fishing = null;
  ped.x = h.x; ped.y = h.y;
  world.place(ped);
  ped.home = { id: h.id, x: L.spawn.x, y: L.spawn.y, a: -Math.PI / 2, mv: false, sleep: 0, shower: 0, eatAt: -9, tour: 1 };
  p.homeMenu = null; p.knock = null; p.meDirty = true;
  world.emit(h.x, h.y, { e: 'door', x: h.x, y: h.y });
  world.notify(p, `Having a look round ${h.name} - ${money(h.price)}. To buy it, the front door.`, 'info');
  send(world, p, true);
  return null;
}
const THING = { bed: 'The bed', wardrobe: 'The wardrobe', safe: 'The safe', fridge: 'The fridge', shower: 'The shower', hall: 'The hall table', garage: 'The garage' };

// Out through the front door
export function leave(world, p) {
  const ped = p.ped;
  if (!ped || !ped.home) return;
  ped.home = null; p.homeMenu = null;
  homes.leaveHome(world, p);
  if (p.conn) p.conn.sendJSON({ t: 'home', off: 1 });
}

// ---- walking round ----------------------------------------------------------------------------------------------------
// The input while you're inside (players.applyInput): walk, and the action button uses what's in reach. true: handled.
export function input(world, p, ped, inp, pressed, dt) {
  const s = ped.home, h = homeOf(world, ped);
  if (!s || !h) return false;
  if (s.sleep || s.shower) { s.mv = false; return true; }   // (asleep, in the shower: nothing to do but wait)
  s.mv = stepInside(planFor(h), s, inp.mx || 0, inp.my || 0, dt, HOME_IN.walk);
  if (pressed & (IN.ACTION | IN.VEHICLE)) { const act = interaction(world, p); if (act && !act.passive) act.run(); }
  return true;
}

const LABEL = {
  door: () => 'Step outside',
  bed: () => 'Sleep (wake up in the morning, rested)',
  wardrobe: () => 'Wardrobe - your outfits',
  safe: (world, p) => { const st = p.profile.stash || {}; return `The safe${st.cash ? ` (${money(st.cash)} in it)` : ''}`; },
  fridge: () => 'The fridge',
  shower: () => 'Take a shower',
  hall: () => 'Home - respawn point, bank, garage',
  garage: (world, p, h) => (h.garage ? 'Your cars - pick one to drive out' : 'This place has no garage'),
};
// What the action button does where you stand (players.findInteraction, for the prompt)
export function interaction(world, p) {
  const ped = p.ped, s = ped && ped.home, h = homeOf(world, ped);
  if (!s || !h) return null;
  if (s.sleep) return { label: 'Asleep... the night is passing', passive: true, run: () => {} };
  if (s.shower) return { label: 'In the shower...', passive: true, run: () => {} };
  const u = useAt(planFor(h), s.x, s.y, HOME_IN.reach);
  if (s.tour) {   // a visitor: the door is the way out (or the sale), the rest is to look at
    if (u && u.use === 'door') return { label: `The front door - buy ${h.name} (${money(h.price)}) or step outside`, run: () => openMenu(world, p, 'tour') };
    return { label: `${u ? `${THING[u.use] || 'That'} comes with the place - ` : 'Having a look round - '}${h.name}, ${money(h.price)}`, passive: true, run: () => {} };
  }
  if (!u) return { label: `${h.name} - walk up to something to use it`, passive: true, run: () => {} };
  if (s.guest && u.use !== 'door') { const host = world.players.get(s.guest); return { label: `The ${u.use === 'hall' ? 'hall table' : u.use === 'garage' ? 'garage' : u.use} - ${host ? `${host.name}'s` : 'not yours'}`, passive: true, run: () => {} }; }
  return { label: LABEL[u.use](world, p, h), run: () => use(world, p, h, u.use) };
}

export function use(world, p, h, what) {
  const ped = p.ped, s = ped.home;
  if (what === 'door') { leave(world, p); return; }
  if (what === 'bed') { s.sleep = world.time + HOME_IN.sleepS; s.mv = false; world.notify(p, 'You get into bed. Lights out...', 'info'); send(world, p, true); return; }
  if (what === 'shower') { s.shower = world.time + HOME_IN.showerS; s.mv = false; ped.bleeding = false; send(world, p, true); return; }   // (the bleeding stops as you step in)
  if (what === 'garage' && !h.garage) { world.notify(p, 'This place has no garage - your cars come out at a home with one.', 'info'); return; }
  openMenu(world, p, what);
}

// ---- the menus of the things you use ---------------------------------------------------------------------------------
function menuOf(world, p, h, what) {
  const prof = p.profile, st = prof.stash || {}, ped = p.ped;
  if (what === 'tour') {   // a visitor at the front door: the price and Buy, or out
    const L = planFor(h), beds = L.pieces.filter((q) => q.use === 'bed').length;
    const opts = [
      { id: 'hi:tbuy', label: `Buy ${h.name}`, price: h.price, note: `wallet ${money(prof.cash)} · bank ${money(prof.bank)}` },
      { id: 'hi:tout', label: 'Step outside' },
      { id: 'close', label: 'Keep looking' },
    ];
    const sub = `For sale: ${money(h.price)}. ${h.what ? `A ${h.what}` : `A ${h.kind === 'shack' ? 'shack' : h.kind}`}${h.floor > 1 ? ` on floor ${h.floor}` : ''}, ${beds} bedroom${beds === 1 ? '' : 's'}, room for ${h.slots} vehicle${h.slots === 1 ? '' : 's'}${h.dock ? ', a boathouse' : ''}. Yours: a respawn point, a safe, a bed, a garage you reach from any home you own.`;
    return { t: 'menu', poi: homes.homePoi(world, h).id, title: `${h.name} - for sale`, sub, opts, cash: prof.cash, bank: prof.bank, inside: true };
  }
  const base = economy.buildMenu(world, p, homes.homePoi(world, h)), all = base.opts;   // (the home menu's options: wardrobe and stash)
  const pick = (pre) => all.filter((o) => o.id === pre || o.id.startsWith(pre + ':'));
  const opts = [];
  let title = h.name, sub = '';
  if (what === 'wardrobe') {
    title = 'Wardrobe'; sub = 'Your clothes. Changing in here, nobody sees who walked in.';
    opts.push(...pick('houtfit'), ...pick('hlooks'), ...pick('hmirror'));
  } else if (what === 'safe') {
    title = 'The safe';
    sub = `Kept at home, safe from a death or an arrest. In the safe: ${money(st.cash || 0)} cash.`;
    opts.push({ id: 'hi:cin', label: `Put your cash in the safe (${money(prof.cash)})`, dis: !(prof.cash > 0) });
    opts.push({ id: 'hi:cout', label: `Take the cash out (${money(st.cash || 0)})`, dis: !(st.cash > 0) });
    opts.push(...pick('hst').filter((o) => !ITEMS[o.id.slice(4)].food), ...pick('hsw'), ...pick('htk').filter((o) => !ITEMS[o.id.slice(4)].food), ...pick('htw'));
  } else if (what === 'fridge') {
    title = 'The fridge';
    const food = Object.entries(st.items || {}).filter(([id, n]) => n > 0 && ITEMS[id] && ITEMS[id].food);
    sub = food.length ? `Health ${Math.round(ped.hp)}/${ped.maxHp}. Something to eat?` : 'Empty. Put food from your bag in here and it keeps.';
    for (const [id, n] of food) opts.push({ id: `hi:eat:${id}`, label: `Eat ${ITEMS[id].name}`, note: `+${ITEMS[id].heal} health · ${n} in the fridge` });
    for (const o of pick('hst')) if (ITEMS[o.id.slice(4)].food) opts.push({ ...o, label: o.label.replace(/^Stash /, 'Put in the fridge: ') });
    for (const o of pick('htk')) if (ITEMS[o.id.slice(4)].food) opts.push({ ...o, label: o.label.replace(/^Take /, 'Take out: '), note: '' });
  } else if (what === 'hall') {   // the home menu itself, and selling the place (you step out to hand the keys over)
    title = base.title; sub = base.sub;
    opts.push(...all.filter((o) => o.id !== 'close'));
    for (const q of world.players.values()) if (q !== p && knocking(world, q, h)) opts.unshift({ id: `hi:let:${q.pid}`, label: `Let ${q.name} in`, note: 'at your door' });
    opts.push({ id: 'hi:sell', label: `Sell this place (+${money(h.price * 0.6)} to the bank)`, note: 'you step outside' });
  } else if (what === 'garage') {
    title = 'Your garage';
    prof.vehicles.forEach((ov, i) => { const d = VEHICLES[ov.model]; if (d && d.kind !== 'boat' && d.kind !== 'air') opts.push({ id: `hi:car:${i}`, label: `Drive out in the ${d.name}`, note: 'the door rolls up' }); });
    opts.push(...pick('hboat'));
    sub = opts.length ? `${prof.vehicles.length}/${homes.garageCap(world, prof)} spaces used (shared by all your homes).` : 'No cars in here yet - drive one up to the garage door outside to park it.';
  }
  opts.push({ id: 'close', label: 'Done' });
  return { t: 'menu', poi: homes.homePoi(world, h).id, title, sub, opts, cash: prof.cash, bank: prof.bank, inside: true };
}
export function openMenu(world, p, what) {
  const h = homeOf(world, p.ped);
  if (!h || !p.conn) return;
  const m = menuOf(world, p, h, what);
  p.menu = { poi: m.poi };
  p.homeMenu = what;
  p.conn.sendJSON(m);
}

// A choice from one of those menus (economy.handleMenu asks first; true: done here). The home menu's own options (the
// wardrobe's, the stash's) are run by economy's `execute`, and the same menu comes back up to date.
export function onMenu(world, p, poiId, optId, execute) {
  const ped = p.ped, h = homeOf(world, ped);
  if (!p.homeMenu || !h || !ped.hidden) { p.homeMenu = null; return false; }
  const poi = world.map.pois[poiId];
  if (!poi || poi.kind !== 'home' || poi.home !== (h.lobby ?? h.id)) return false;   // (a unit's menus come from its building's lobby door)
  if (optId === 'close') { p.homeMenu = null; return true; }
  const what = p.homeMenu;
  const valid = menuOf(world, p, h, what).opts.find((o) => o.id === optId);
  let err = !valid ? 'That option is not available here.' : valid.dis ? 'Not available.' : null;
  if (!err) err = optId.startsWith('hi:') ? own(world, p, h, optId.split(':')) : execute(world, p, poi, optId);
  if (err) world.notify(p, err, 'bad');
  p.meDirty = true;
  if (ped.home && ped.hidden && p.homeMenu === what) openMenu(world, p, what);
  return true;
}

function own(world, p, h, parts) {
  const prof = p.profile, ped = p.ped;
  const st = (prof.stash ||= { items: {}, weapons: {} });
  st.items ||= {};
  switch (parts[1]) {
    case 'cin': { const n = prof.cash; if (!(n > 0)) return 'No cash on you.'; st.cash = (st.cash || 0) + n; prof.cash = 0; store.touch(); world.notify(p, `${money(n)} into the safe.`, 'good'); return null; }
    case 'cout': { const n = st.cash || 0; if (!(n > 0)) return 'The safe is empty.'; prof.cash += n; st.cash = 0; store.touch(); world.notify(p, `Took ${money(n)} out of the safe.`, 'good'); return null; }
    case 'eat': {
      const id = parts[2], it = ITEMS[id];
      if (!it || !it.food || !(st.items[id] > 0)) return 'None of that in the fridge.';
      if (world.time - ped.home.eatAt < HOME_IN.eatS) return null;
      if (ped.hp >= ped.maxHp && !it.hearty) return 'You\'re not hungry - you\'re at full health.';
      ped.home.eatAt = world.time;
      st.items[id]--;
      ped.hp = Math.min(ped.maxHp, ped.hp + it.heal);
      if (it.hearty) economy.applyBuff(world, ped, 'hearty');
      store.touch();
      world.notify(p, `Ate ${/^[aeiou]/i.test(it.name) ? 'an' : 'a'} ${it.name}. +${it.heal} health.`, 'good');
      return null;
    }
    case 'let': {
      const q = world.players.get(parts.slice(2).join(':'));
      if (!q || !knocking(world, q, h)) return 'Nobody at the door now.';
      return letIn(world, q, h, p);
    }
    case 'sell': {
      p.homeMenu = null;
      leave(world, p);
      return homes.sell(world, p, h);
    }
    case 'tbuy': {   // bought on a look round: yours, and you're in it
      if (!ped.home || !ped.home.tour) return 'Not on a look round.';
      const err = homes.buy(world, p, h, economy.payFrom);
      if (err) return err;
      ped.home.tour = 0;
      p.homeMenu = null;
      send(world, p, true);
      return null;
    }
    case 'tout': p.homeMenu = null; leave(world, p); return null;
    case 'car': {
      const i = Number(parts[2]);
      p.homeMenu = null;
      if (!h.garage) return 'This place has no garage.';
      const err = homes.driveOut(world, p, h, i);
      if (!err) { ped.home = null; if (p.conn) p.conn.sendJSON({ t: 'home', off: 1 }); }
      return err;
    }
    default: return 'Unknown option.';
  }
}

// ---- every tick ------------------------------------------------------------------------------------------------------
export function update(world) {
  for (const p of world.players.values()) {
    const ped = p.ped, s = ped && ped.home;
    if (!s) continue;
    const h = homes.homeById(world, s.id);
    // out some other way (the home menu's Step outside, the garage, the boathouse, dead, a dev command): gone from here
    const ok = s.tour ? !world.homeOwner.has(s.id) : world.homeOwner.get(s.id) === (s.guest || p.pid);   // (a look round: while it's still for sale)
    if (!h || !ped.hidden || ped.dead || ped.removed || ped.inside !== s.id || !ok) {
      if (h && !ped.dead && !ped.removed && ped.hidden && ped.inside === s.id) { homes.leaveHome(world, p); if (s.tour) world.notify(p, `${h.name} has just been sold - you're shown out.`, 'warn'); }   // (sold under a guest or a visitor: out they go)
      ped.home = null; p.homeMenu = null;
      if (p.conn) p.conn.sendJSON({ t: 'home', off: 1 });
      continue;
    }
    if (s.sleep && world.time >= s.sleep) wake(world, p, h);
    if (s.shower && world.time >= s.shower) {
      s.shower = 0;
      ped.hp = Math.min(ped.maxHp, ped.hp + HOME_IN.showerHeal); ped.bleeding = false; ped.burnT = 0;
      world.notify(p, 'Fresh and clean.', 'good');
      p.meDirty = true;
    }
    send(world, p, false);
  }
}

function wake(world, p, h) {
  const ped = p.ped, prof = p.profile;
  ped.home.sleep = 0;
  ped.hp = ped.maxHp; ped.bleeding = false; ped.stamina = 100;
  // the night passes for the whole city when everyone online is asleep at home (alone, it's you)
  const night = world.loopTime >= DAY_PART_S - 30 || world.clock.minutes < HOME_IN.wakeH * 60;
  const everyone = [...world.players.values()].every((q) => q === p || !q.conn || !q.ped || (q.ped.home && q.ped.home.sleep));
  if (night && everyone) {
    const wakeT = (HOME_IN.wakeH * 60 - 360) * DAY_PART_S / (14 * 60);   // (shared/constants.js gameClock: 06:00 is 0)
    if (world.loopTime >= DAY_PART_S - 30) world.day = (world.day || 0) + 1;
    world.loopTime = wakeT;
  }
  prof.spawnHome = h.id; prof.lastSpawn = `home:${h.id}`;   // (a save point: you wake up here after a death)
  store.touch();
  world.notify(p, night && everyone ? 'Good morning! You slept through the night - fully rested. You\'ll wake up here from now on.' : 'You had a good sleep - fully rested. You\'ll wake up here from now on.', 'good');
  p.meDirty = true;
  send(world, p, true);
}

// Where you are inside, to your page (every tick while you're in; the cars in the garage when something changed)
export function send(world, p, full) {
  const ped = p.ped, s = ped && ped.home;
  if (!s || !p.conn) return;
  const h = homes.homeById(world, s.id), L = planFor(h);
  const m = {
    t: 'home', id: h.id, plan: L.key, tier: L.tier, x: Math.round(s.x * 10) / 10, y: Math.round(s.y * 10) / 10, a: Math.round(s.a * 100) / 100,
    mv: s.mv ? 1 : 0, ack: p.ack, min: Math.round(world.clock.minutes),
    sleep: s.sleep ? Math.max(0, Math.round((s.sleep - world.time) * 10) / 10) : 0, shower: s.shower ? 1 : 0,
  };
  const others = [];
  for (const q of world.players.values()) {
    const o = q !== p && q.ped && q.ped.home && q.ped.hidden && q.ped.home.id === s.id ? q.ped.home : null;
    if (o) others.push({ n: q.name, x: Math.round(o.x), y: Math.round(o.y), a: Math.round(o.a * 100) / 100, mv: o.mv ? 1 : 0, sl: o.sleep ? 1 : 0, ...(full || world.tick % 20 === 0 ? { app: q.ped.app || null } : null) });
  }
  m.others = others;   // (their looks now and then: the page keeps them)
  if (full) {
    m.name = s.tour ? `${h.name} - for sale, ${money(h.price)}` : h.name; m.garage = h.garage ? 1 : 0; m.sleepS = HOME_IN.sleepS; m.wakeH = HOME_IN.wakeH;
    if (s.tour) m.tour = h.price;   // (a visitor: the price - the page may show it; the garage's bays empty)
    m.cars = s.tour ? [] : p.profile.vehicles.filter((ov) => VEHICLES[ov.model] && VEHICLES[ov.model].kind !== 'boat' && VEHICLES[ov.model].kind !== 'air').slice(0, L.bays.length).map((ov) => ({ m: ov.model, p: ov.paint | 0, v: ov.variant | 0 }));
  }
  p.conn.sendJSON(m);
}

// ---- dev ----------------------------------------------------------------------------------------------------------
// The dev command 'homein' (server/dev.js): msg.id (a home) or msg.kind (the first of that kind nobody else owns) -
// yours for nothing, and you're inside; msg.cars: cars of your own for the garage; msg.at: stand by that thing in there
// ('bed', 'safe', 'fridge', 'garage', 'door'...).
// Returns an error or null.
export function devIn(world, p, msg) {
  const ped = p.ped;
  if (!ped || ped.dead) return 'Not while you\'re down.';
  let h = homeOf(world, ped);
  if (msg.id != null || msg.kind) {
    const want = msg.id != null ? homes.homeById(world, Math.floor(Number(msg.id))) : world.map.homes.find((q) => q.kind === msg.kind && (!world.homeOwner.has(q.id) || world.homeOwner.get(q.id) === p.pid));
    if (!want) return 'No such home.';
    if (ped.vehId) return 'Get out of the vehicle first.';
    if (!world.homeOwner.has(want.id)) { (p.profile.homes ||= []).push(want.id); world.homeOwner.set(want.id, p.pid); store.touch(); }
    if (world.homeOwner.get(want.id) !== p.pid) return 'Someone else owns that one.';
    if (h && h.id !== want.id) leave(world, p);
    if (!ped.home) { if (ped.hidden) homes.leaveHome(world, p); ped.x = want.x; ped.y = want.y; world.place(ped); homes.goInside(world, p, want); }
    h = want;
  }
  if (!h || !ped.home) return 'Go inside one of your homes first (or give a home id or kind).';
  if (Array.isArray(msg.cars)) {   // (cars of your own, for the garage: msg.cars ['sedan', ...])
    for (const m of msg.cars.slice(0, 4)) if (VEHICLES[m] && p.profile.vehicles.length < homes.garageCap(world, p.profile)) p.profile.vehicles.push({ model: m, paint: p.profile.vehicles.length * 3 % 14, variant: 0 });
    store.touch();
    send(world, p, true);
  }
  if (msg.at) {
    const L = planFor(h);
    for (let ty = 0; ty < L.rows; ty++) for (let tx = 0; tx < L.cols; tx++) {
      const x = (tx + 0.5) * L.w / L.cols, y = (ty + 0.5) * L.h / L.rows;
      if (L.solid(tx, ty)) continue;
      const u = useAt(L, x, y, HOME_IN.reach);
      if (u && u.use === msg.at) { ped.home.x = x; ped.home.y = y; send(world, p, true); return null; }
    }
    return `No ${msg.at} in here.`;
  }
  return null;
}
