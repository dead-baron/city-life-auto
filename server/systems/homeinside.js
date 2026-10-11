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
// Nobody can see or hurt you inside (you're out of the world's grid: world.place), and the police can't follow you in.
// The server walks you round (input), says what the action button does where you stand (interaction), and sends you
// where you are every tick ({ t: 'home' }); the page only draws it (client/render/homeview.js, loaded when you go in).
//   ped.home: { id, x, y, a (px, in the plan), mv (walking), sleep / shower (when it ends, world.time; 0 none), eatAt }
//   p.homeMenu: the menu of the thing you're using ('wardrobe' | 'safe' | 'fridge' | 'garage'), null for the home menu
import { DAY_PART_S } from '../../shared/constants.js';
import { IN } from '../../shared/input.js';
import { HOME_IN } from '../../shared/rules.js';
import { ITEMS } from '../../shared/items.js';
import { VEHICLES } from '../../shared/vehicles.js';
import { layout, planOf, tierOf, stepInside, useAt } from '../../shared/homelayout.js';
import { store } from '../store.js';
import * as homes from './homes.js';
import * as economy from './economy.js';

export const planFor = (h) => layout(planOf(h), tierOf(h));
const homeOf = (world, ped) => (ped && ped.home ? world.map.homes[ped.home.id] : null);
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
  if (!poi || poi.kind !== 'home' || world.homeOwner.get(poi.home) !== p.pid) return null;
  const h = world.map.homes[poi.home];
  return { label: `Go inside ${h.name}`, run: () => goIn(world, p, h) };
}
export function goIn(world, p, h) {
  const err = homes.beginEnter(world, p, h);
  if (err) { world.notify(p, err, 'bad'); return err; }
  if (!(p.wanted > 0)) homes.goInside(world, p, h);   // (not wanted: the door's open and you're in)
  return null;
}

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
  if (!u) return { label: `${h.name} - walk up to something to use it`, passive: true, run: () => {} };
  return { label: LABEL[u.use](world, p, h), run: () => use(world, p, h, u.use) };
}

export function use(world, p, h, what) {
  const ped = p.ped, s = ped.home;
  if (what === 'door') { leave(world, p); return; }
  if (what === 'bed') { s.sleep = world.time + HOME_IN.sleepS; s.mv = false; world.notify(p, 'You get into bed. Lights out...', 'info'); send(world, p, true); return; }
  if (what === 'shower') { s.shower = world.time + HOME_IN.showerS; s.mv = false; ped.bleeding = false; send(world, p, true); return; }   // (the bleeding stops as you step in)
  if (what === 'hall') { p.homeMenu = null; homes.openInside(world, p); return; }
  if (what === 'garage' && !h.garage) { world.notify(p, 'This place has no garage - your cars come out at a home with one.', 'info'); return; }
  openMenu(world, p, what);
}

// ---- the menus of the things you use ---------------------------------------------------------------------------------
function menuOf(world, p, h, what) {
  const prof = p.profile, st = prof.stash || {}, ped = p.ped;
  const all = economy.buildMenu(world, p, homes.homePoi(world, h)).opts;   // (the home menu's options: wardrobe and stash)
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
  if (!poi || poi.kind !== 'home' || poi.home !== h.id) return false;
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
    const h = world.map.homes[s.id];
    // out some other way (the home menu's Step outside, the garage, the boathouse, dead, a dev command): gone from here
    if (!h || !ped.hidden || ped.dead || ped.removed || ped.inside !== s.id || world.homeOwner.get(s.id) !== p.pid) {
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
  const h = world.map.homes[s.id], L = planFor(h);
  const m = {
    t: 'home', id: h.id, plan: L.key, tier: L.tier, x: Math.round(s.x * 10) / 10, y: Math.round(s.y * 10) / 10, a: Math.round(s.a * 100) / 100,
    mv: s.mv ? 1 : 0, ack: p.ack, min: Math.round(world.clock.minutes),
    sleep: s.sleep ? Math.max(0, Math.round((s.sleep - world.time) * 10) / 10) : 0, shower: s.shower ? 1 : 0,
  };
  if (full) {
    m.name = h.name; m.garage = h.garage ? 1 : 0; m.sleepS = HOME_IN.sleepS; m.wakeH = HOME_IN.wakeH;
    m.cars = p.profile.vehicles.filter((ov) => VEHICLES[ov.model] && VEHICLES[ov.model].kind !== 'boat' && VEHICLES[ov.model].kind !== 'air').slice(0, L.bays.length).map((ov) => ({ m: ov.model, p: ov.paint | 0, v: ov.variant | 0 }));
  }
  p.conn.sendJSON(m);
}

// ---- dev ----------------------------------------------------------------------------------------------------------
// The dev command 'homein' (server/dev.js): msg.id (a home) or msg.kind (the first of that kind nobody else owns) -
// yours for nothing, and you're inside; msg.at: stand by that thing in there ('bed', 'safe', 'fridge', 'garage'...).
// Returns an error or null.
export function devIn(world, p, msg) {
  const ped = p.ped;
  if (!ped || ped.dead) return 'Not while you\'re down.';
  let h = homeOf(world, ped);
  if (msg.id != null || msg.kind) {
    const want = msg.id != null ? world.map.homes[Math.floor(Number(msg.id))] : world.map.homes.find((q) => q.kind === msg.kind && (!world.homeOwner.has(q.id) || world.homeOwner.get(q.id) === p.pid));
    if (!want) return 'No such home.';
    if (ped.vehId) return 'Get out of the vehicle first.';
    if (!world.homeOwner.has(want.id)) { (p.profile.homes ||= []).push(want.id); world.homeOwner.set(want.id, p.pid); store.touch(); }
    if (world.homeOwner.get(want.id) !== p.pid) return 'Someone else owns that one.';
    if (h && h.id !== want.id) leave(world, p);
    if (!ped.home) { if (ped.hidden) homes.leaveHome(world, p); ped.x = want.x; ped.y = want.y; world.place(ped); homes.goInside(world, p, want); }
    h = want;
  }
  if (!h || !ped.home) return 'Go inside one of your homes first (or give a home id or kind).';
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
