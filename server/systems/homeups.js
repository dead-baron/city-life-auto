// Home upgrades (the owner's notes 2, 10-24: "House upgrades, be able to add new rooms, new floors, basement, customize,
// expand garden, decorate, etc. ... gathering materials like wood or stone or other things across the world, or you can
// purchase them with money outright ... For apartments I think you just pull up to the garage still and able to upgrade
// the interior with different amenities or add-ons"; and of the firewood: "driving up to the home's garage with the wood
// will give an option to store that wood there or put it towards an upgrade to the home"). What there is and how the
// rooms are laid out: shared/homeups.js; what each takes: shared/rules-play.js HOME_UPS.
//   * Your garage (on foot by its door, or pulled up at the wheel): the garage menu - the materials kept there (firewood,
//     stone, scrap metal: profile.homeMats[home id], up to storeCap), unload the bag's stone and scrap into it, take a
//     bundle of firewood back out to carry; the firewood you bring (carried, or on the truck's bed) stacked there or put
//     straight towards an upgrade; and the upgrades.
//   * An upgrade's card: what it is, what it takes and what's in already (profile.homeUp[home id].p), put in what you
//     have (the garage's, then the bag's), or pay for the rest - the labour and the missing materials at MAT_PRICE - and
//     it's built at once. The hall table inside has the same list.
//   * Built: a floor up or a basement is a level of its own up or down the stairs (homeinside.js walks you round it:
//     ped.home.lv), a room fills a slot along its hall, an amenity goes into your furniture storage to place with
//     Decorate, garden beds dig more plots in the yard (gardening.js plotsOf), a parking space adds to the garage
//     (homes.garageCap), shelving and storerooms keep more materials.
//   * Inside, the upgrades' things (a plan's own or one you placed): the stairs, the fireplace (a bundle of firewood
//     from the garage: everyone in the home heals while it burns - world.homeFire), the hot tub, the home bar, the
//     exercise bike, the workbench (furniture made from the materials: HOME_CRAFTS - the crafting the bag will grow
//     into starts here) and the storeroom's shelves (the materials).
//   p.upMenu: { h (home id), v: 'garage' | 'list' | 'rooms' | 'card' | 'store' | 'craft' | 'stairs', id, lv }
import { K } from '../../shared/constants.js';
import { ITEMS } from '../../shared/items.js';
import { planOf } from '../../shared/homelayout.js';
import { PIECES, canPlace } from '../../shared/homedecor.js';
import { MATS, MAT_IDS, matOfItem, ROOMS, UPS, UP_IDS, roomId, parseRoom, builtOf, has, levelsOf, roomsOn, slotsOf, specOf, costKey, levelName, STAIRS, LEVEL_STAIRS } from '../../shared/homeups.js';
import { HOME_UPS, MAT_PRICE, HOME_STORE, HOME_AMEN, HOME_CRAFTS } from '../../shared/rules-play.js';
import { LOG_BUNDLE_PRICE, LOGS_LIFE_S } from '../../shared/rules.js';
import { store } from '../store.js';
import * as homes from './homes.js';
import * as homeinside from './homeinside.js';
import * as economy from './economy.js';
import * as skills from './skills.js';
import * as gardening from './gardening.js';
import { GARDEN } from '../../shared/rules.js';

export const UP_POI = -21;   // (the garage's and the upgrades' menus: not a place's - economy.js handleMenu asks onMenu first)
const GARAGE_R = 120;        // px from the garage's door: its menu, on foot or at the wheel
const money = (n) => `$${Math.round(n).toLocaleString()}`;
const plural = (n, m) => `${n} ${n === 1 ? MATS[m].one : MATS[m].many}`;

// ---- a home's upgrades and its materials -------------------------------------------------------------------------------
const ownerProf = (world, h) => { const pid = h && world.homeOwner.get(h.id); if (!pid) return null; const q = world.players.get(pid); return q ? q.profile : store.get(pid); };
// the upgrades of a home (its owner's: profile.homeUp[home id]), or null
export function upsOf(world, h) { const prof = h && ownerProf(world, h); return (prof && prof.homeUp && prof.homeUp[h.id]) || null; }
const upOf = (prof, hid) => { const all = (prof.homeUp ||= {}); return (all[hid] ||= { b: [], p: {} }); };
// the spec of a home's level for shared/homelayout.js layout (the plan as it came when nothing's built)
export const specFor = (world, h, lv = 0) => specOf(planOf(h), lv, world ? upsOf(world, h) : null);
export const levels = (world, h) => levelsOf(planOf(h), upsOf(world, h));
// the materials kept at a home's garage (the firewood stacked there before the upgrades came is moved in: homeWood)
export function matsAt(prof, hid) {
  const all = (prof.homeMats ||= {}), m = (all[hid] ||= { wood: 0, stone: 0, metal: 0 });
  if (prof.homeWood && prof.homeWood[hid]) { m.wood += prof.homeWood[hid]; delete prof.homeWood[hid]; }
  for (const k of MAT_IDS) m[k] = Math.max(0, m[k] | 0);
  return m;
}
const usedOf = (m) => MAT_IDS.reduce((n, k) => n + (m[k] || 0), 0);
// how much the garage keeps: by the plan, shelving, the basement and its storerooms
export function storeCap(prof, h) {
  const u = prof.homeUp && prof.homeUp[h.id], plan = planOf(h);
  let cap = HOME_STORE.base[plan] ?? 20;
  for (const id of builtOf(u)) { const U = UPS[id]; if (U && U.store) cap += U.store; if (U && U.level < 0) cap += HOME_STORE.basement; }
  for (const lv of levelsOf(plan, u)) for (const k of roomsOn(plan, u, lv)) if (k === 'store' && lv < 0) cap += HOME_STORE.room;
  return cap;
}
// a home's parking spaces and garden beds from its upgrades
export const parkingOf = (prof, hid) => builtOf(prof.homeUp && prof.homeUp[hid]).reduce((n, id) => n + ((UPS[id] && UPS[id].slots) || 0), 0);
export const bedsOf = (prof, hid) => builtOf(prof.homeUp && prof.homeUp[hid]).reduce((n, id) => n + ((UPS[id] && UPS[id].beds) || 0), 0);
// the materials in the bag: { stone: [[item, n], ...], metal: [...] } (the poorest metal first: copper ore, iron ore,
// then scrap)
function bagMats(prof) {
  const inv = prof.inventory || {}, out = {};
  for (const m of MAT_IDS) out[m] = MATS[m].items.map((id) => [id, inv[id] || 0]).filter(([, n]) => n > 0).sort((a, b) => (ITEMS[a[0]].sell || 0) - (ITEMS[b[0]].sell || 0));
  return out;
}
const bagCount = (prof, m) => bagMats(prof)[m].reduce((n, [, k]) => n + k, 0);
function takeBag(prof, m, n) {
  let left = n;
  for (const [id, k] of bagMats(prof)[m]) { const t = Math.min(k, left); prof.inventory[id] -= t; left -= t; if (!left) break; }
  return n - left;
}

// ---- what an upgrade takes ---------------------------------------------------------------------------------------------
export const costOf = (id) => HOME_UPS[costKey(id)] || { labour: 0 };
// the price of it all bought outright
export const priceOf = (id) => { const c = costOf(id); return (c.labour || 0) + MAT_IDS.reduce((n, m) => n + (c[m] || 0) * MAT_PRICE[m], 0); };
const putOf = (u, id) => (u.p && u.p[id]) || { wood: 0, stone: 0, metal: 0 };
// what's still to go in: { wood, stone, metal } and what paying for it would cost (the labour too)
export function missing(u, id) {
  const c = costOf(id), got = putOf(u, id), out = {};
  let pay = c.labour || 0;
  for (const m of MAT_IDS) { out[m] = Math.max(0, (c[m] || 0) - (got[m] || 0)); pay += out[m] * MAT_PRICE[m]; }
  out.pay = pay;
  return out;
}
const nameOf = (h, id) => { const r = parseRoom(id); if (r) return `${ROOMS[r.k].name} (${levelName(r.lv)})`; const U = UPS[id]; return U ? (planOf(h) === 'trailer' && U.trailer ? U.trailer : U.name) : id; };
// The upgrades on offer for a home now: [{ id, name, what }] - the ones for its plan not built yet (what they need built
// first), the empty rooms' kinds on each level
export function offered(prof, h, world = null) {
  const plan = planOf(h), u = (prof.homeUp && prof.homeUp[h.id]) || { b: [] }, out = [];
  for (const id of UP_IDS) {
    const U = UPS[id];
    if (!U.plans.includes(plan) || has(u, id) || (U.needs && !has(u, U.needs)) || (U.level !== undefined && !slotsOf(plan, U.level))) continue;
    if (U.beds && world && gardening.allSpots(world.map, h).length < GARDEN.plots + bedsOf(prof, h.id) + U.beds) continue;   // (no room in the yard for more beds)
    out.push({ id, name: nameOf(h, id), what: U.what });
  }
  return out;
}
// the levels with an empty slot: [{ lv, n (the first empty slot), free }]
export function roomSlots(prof, h) {
  const plan = planOf(h), u = prof.homeUp && prof.homeUp[h.id], out = [];
  for (const lv of levelsOf(plan, u)) {
    if (!lv) continue;
    const r = roomsOn(plan, u, lv), n = r.indexOf(null);
    if (n >= 0) out.push({ lv, n, free: r.filter((k) => !k).length });
  }
  return out;
}

// ---- building it -----------------------------------------------------------------------------------------------------
// The upgrade's done: built, and whoever's in the home sees the rooms change. A level's stairs come up through the
// ground floor where furniture of yours may stand: it goes back into storage.
export function build(world, p, h, id) {
  const prof = p.profile, u = upOf(prof, h.id), U = UPS[id], r = parseRoom(id);
  if (has(u, id)) return 'Built already.';
  u.b.push(id);
  if (u.p) delete u.p[id];
  if (U && U.piece) { prof.furn ||= {}; prof.furn[U.piece] = (prof.furn[U.piece] || 0) + 1; }
  let stowed = 0;
  if (U && U.level !== undefined) stowed = clearStairs(world, p, h);
  store.touch();
  p.meDirty = true;
  const nm = nameOf(h, id);
  world.notify(p, U && U.piece ? `${nm} is ready - in your furniture storage: place it from the hall table (Decorate).`
    : U && U.level !== undefined ? `${nm} is built at ${h.name}: the stairs are in ${planOf(h) === 'mansion' ? 'the great room' : planOf(h) === 'trailer' ? 'the floor by the kitchen' : 'the hall'}.${stowed ? ` (${stowed === 1 ? 'A piece of furniture' : `${stowed} pieces of furniture`} stood there: back in storage.)` : ''}`
    : r ? `The builders have finished: a ${ROOMS[r.k].name.toLowerCase()} on ${levelName(r.lv)} of ${h.name}.`
    : `Done: ${nm.toLowerCase()} at ${h.name}.`, 'good');
  for (const q of world.players.values()) if (q.ped && q.ped.home && q.ped.home.id === h.id) homeinside.refresh(world, q);
  return null;
}
// the ground floor's stairs' tiles: your pieces there back into storage; anyone standing there steps off
function clearStairs(world, p, h) {
  const S = STAIRS[planOf(h)];
  if (!S) return 0;
  const [sx, sy] = S.at, prof = p.profile, d = prof.decor && prof.decor[h.id];
  let n = 0;
  if (d && d.it) {
    const keep = [];
    for (const q of d.it) {
      const P = PIECES[q.k], w = P ? (q.r & 1 ? P.h : P.w) : 1, hh = P ? (q.r & 1 ? P.w : P.h) : 1;
      if (P && !P.wall && q.tx < sx + 2 && sx < q.tx + w && q.ty < sy + 2 && sy < q.ty + hh) { (prof.furn ||= {})[q.k] = (prof.furn[q.k] || 0) + 1; n++; } else keep.push(q);
    }
    if (n) prof.decor[h.id] = { ...d, it: keep };
  }
  for (const q of world.players.values()) {
    const s = q.ped && q.ped.home;
    if (!s || s.id !== h.id || (s.lv || 0)) continue;
    if (s.x > sx * 32 - 10 && s.x < (sx + 2) * 32 + 10 && s.y > sy * 32 - 10 && s.y < (sy + 2) * 32 + 10) { s.x = (S.arrive[0] + 0.5) * 32; s.y = (S.arrive[1] + 0.5) * 32; }
  }
  return n;
}
// Put in what you have towards it: the garage's materials first, then the bag's; all in, it's built
export function putIn(world, p, h, id) {
  const prof = p.profile, u = upOf(prof, h.id), m0 = missing(u, id), at = matsAt(prof, h.id);
  const got = (u.p[id] ||= { wood: 0, stone: 0, metal: 0 });
  let n = 0;
  for (const m of MAT_IDS) {
    let need = m0[m];
    const a = Math.min(need, at[m]); at[m] -= a; got[m] += a; need -= a; n += a;
    if (need > 0 && m !== 'wood') { const b = takeBag(prof, m, need); got[m] += b; n += b; }
  }
  if (!n) return 'You have none of what it needs - bring firewood, stone or scrap metal here, or pay for the rest.';
  store.touch();
  const left = missing(u, id);
  if (MAT_IDS.every((m) => !left[m])) {
    if (!economy.payFrom(p, left.pay)) { world.notify(p, `All the materials are in. The builders want ${money(left.pay)} for the work.`, 'info'); return null; }
    return build(world, p, h, id);
  }
  world.notify(p, `Put in ${n} - still to come: ${MAT_IDS.filter((m) => left[m]).map((m) => plural(left[m], m)).join(', ')}.`, 'good');
  return null;
}
// Pay for the rest (the labour, and the missing materials at MAT_PRICE) and it's built
export function payRest(world, p, h, id) {
  const u = upOf(p.profile, h.id), left = missing(u, id);
  if (!economy.payFrom(p, left.pay)) return `You need ${money(left.pay)} (cash + bank).`;
  return build(world, p, h, id);
}
// the materials put in towards it back into the garage (as many as it has room for; the rest stay in)
function takeBack(world, p, h, id) {
  const prof = p.profile, u = upOf(prof, h.id), got = u.p && u.p[id];
  if (!got) return 'Nothing put in yet.';
  const at = matsAt(prof, h.id), cap = storeCap(prof, h);
  let n = 0;
  for (const m of MAT_IDS) { const t = Math.min(got[m] || 0, cap - usedOf(at)); at[m] += t; got[m] -= t; n += t; }
  if (MAT_IDS.every((m) => !got[m])) delete u.p[id];
  store.touch();
  world.notify(p, n ? `${n} back on the garage's shelves.` : 'The garage is full - nothing could come back out.', n ? 'info' : 'warn');
  return null;
}

// ---- the materials at the garage -------------------------------------------------------------------------------------
// firewood bundles (crates: carried, or off a vehicle's bed) stacked in the garage, as many as it has room for: how many
export function stackWood(world, p, h, crates) {
  const prof = p.profile, at = matsAt(prof, h.id), room = storeCap(prof, h) - usedOf(at);
  const mine = crates.filter((c) => c && c.wood && !c.removed).slice(0, Math.max(0, room));
  if (!mine.length) { world.notify(p, `The garage at ${h.name} is full of materials (${usedOf(at)}/${storeCap(prof, h)}) - put some towards an upgrade, or build more storage.`, 'warn'); return 0; }
  removeCrates(world, p, mine);
  at.wood += mine.length;
  world.emit(h.garage.x, h.garage.y, { e: 'garagedoor', home: h.id });
  world.notify(p, `${mine.length === 1 ? 'A bundle' : `${mine.length} bundles`} of firewood stacked in your garage at ${h.name} (${at.wood} there) - for the home's upgrades and the fireplace.`, 'good');
  store.touch(); p.meDirty = true;
  return mine.length;
}
// firewood brought to the garage put straight towards an upgrade (no more than it still needs)
function woodTowards(world, p, h, crates, id) {
  const prof = p.profile, u = upOf(prof, h.id), need = missing(u, id).wood;
  const mine = crates.filter((c) => c && c.wood && !c.removed).slice(0, need);
  if (!mine.length) return 'It needs no more firewood.';
  removeCrates(world, p, mine);
  const got = (u.p[id] ||= { wood: 0, stone: 0, metal: 0 });
  got.wood += mine.length;
  world.emit(h.garage.x, h.garage.y, { e: 'garagedoor', home: h.id });
  store.touch(); p.meDirty = true;
  const left = missing(u, id);
  world.notify(p, `${mine.length === 1 ? 'A bundle' : `${mine.length} bundles`} of firewood towards ${nameOf(h, id).toLowerCase()}${MAT_IDS.some((m) => left[m]) ? ` - still to come: ${MAT_IDS.filter((m) => left[m]).map((m) => plural(left[m], m)).join(', ')}` : ' - all the materials are in'}.`, 'good');
  return null;
}
function removeCrates(world, p, list) {
  const ped = p.ped;
  for (const c of list) {
    if (ped.carrying === c.id) ped.carrying = 0;
    const v = c.state === 'loaded' ? world.get(c.parent) : null;
    if (v && v.cargo) v.cargo[c.slot] = 0;
    world.remove(c);
  }
}
// the bag's stone and scrap metal onto the garage's shelves (as much as there's room for)
function unloadBag(world, p, h) {
  const prof = p.profile, at = matsAt(prof, h.id);
  let n = 0;
  for (const m of ['stone', 'metal']) { const t = takeBag(prof, m, Math.min(bagCount(prof, m), storeCap(prof, h) - usedOf(at))); at[m] += t; n += t; }
  if (!n) return usedOf(at) >= storeCap(prof, h) ? 'The garage is full.' : 'No stone or scrap metal in your bag.';
  store.touch(); p.meDirty = true;
  world.notify(p, `Unloaded ${n} into the garage (${usedOf(at)}/${storeCap(prof, h)}).`, 'good');
  return null;
}
// stone or metal back into the bag (metal comes back as scrap)
function intoBag(world, p, h, m) {
  const prof = p.profile, at = matsAt(prof, h.id), n = at[m] || 0;
  if (!n || m === 'wood') return 'None here.';
  const id = MATS[m].items[0];
  prof.inventory[id] = (prof.inventory[id] || 0) + n; at[m] = 0;
  store.touch(); p.meDirty = true;
  world.notify(p, `${n} ${ITEMS[id].name} into your bag.`, 'good');
  return null;
}
// a bundle of firewood off the stack, in your arms (to sell, or take somewhere)
function takeBundle(world, p, h) {
  const prof = p.profile, ped = p.ped, at = matsAt(prof, h.id);
  if (!(at.wood > 0)) return 'No firewood stacked here.';
  if (ped.carrying || ped.vehId) return 'Your hands are full.';
  const c = world.spawnCrate(1, ped.x, ped.y, { label: 'Firewood', value: LOG_BUNDLE_PRICE, contraband: false, expires: world.time + LOGS_LIFE_S });
  c.logs = true; c.wood = true;
  c.state = 'carried'; c.parent = ped.id; c.z = 10; c.touched = true;
  ped.carrying = c.id;
  at.wood--;
  store.touch(); p.meDirty = true;
  return null;
}
// the firewood crates you've brought: the one you carry, or those on the bed of the vehicle you're driving
function woodHere(world, p) {
  const ped = p.ped;
  if (ped.vehId) { const v = world.get(ped.vehId); return v && v.cargo ? v.cargo.map((id) => (id ? world.get(id) : null)).filter((c) => c && c.wood) : []; }
  const c = ped.carrying ? world.get(ped.carrying) : null;
  return c && c.wood ? [c] : [];
}

// ---- the menus -------------------------------------------------------------------------------------------------------
// your home whose garage you're at (on foot, or at the wheel and stopped), or the home you're in
function homeHere(world, p) {
  const ped = p.ped, V = p.upMenu;
  if (!ped || ped.dead) return null;
  if (ped.hidden && ped.home && !ped.home.tour) {   // (inside: your own home - a guest only on the stairs)
    const h = homes.homeById(world, ped.home.id);
    return h && (world.homeOwner.get(h.id) === p.pid || (ped.home.guest && V && V.v === 'stairs')) ? h : null;
  }
  if (ped.hidden) return null;
  const v = ped.vehId ? world.get(ped.vehId) : null, x = v ? v.x : ped.x, y = v ? v.y : ped.y;
  const h = V ? homes.homeById(world, V.h) : null;
  if (h && h.garage && world.homeOwner.get(h.id) === p.pid && Math.hypot(h.garage.x - x, h.garage.y - y) < GARAGE_R + 40) return h;
  return homes.nearOwnGarage(world, p, x, y, GARAGE_R);
}
const matLine = (prof, h) => { const at = matsAt(prof, h.id); return `${plural(at.wood, 'wood')}, ${plural(at.stone, 'stone')}, ${plural(at.metal, 'metal')} (${usedOf(at)}/${storeCap(prof, h)} spaces)`; };
const needLine = (u, id) => { const c = costOf(id), got = putOf(u, id); return MAT_IDS.filter((m) => c[m]).map((m) => `${MATS[m].name} ${got[m] || 0}/${c[m]}`).join(' · ') || 'labour only'; };
function menuOf(world, p, h) {
  const prof = p.profile, V = p.upMenu, u = (prof.homeUp && prof.homeUp[h.id]) || { b: [], p: {} }, opts = [], inside = !!p.ped.hidden;
  u.p ||= {};
  let title = `Your garage - ${h.name}`, sub = '';
  const base = { t: 'menu', poi: UP_POI, cash: prof.cash, bank: prof.bank, ...(inside ? { inside: true } : null) };
  if (V.v === 'garage') {
    const wood = woodHere(world, p);
    sub = `Kept here: ${matLine(prof, h)}.`;
    if (wood.length) {
      opts.push({ id: 'u:stack', label: `Stack the ${wood.length === 1 ? 'bundle' : `${wood.length} bundles`} of firewood in the garage` });
      for (const o of offered(prof, h, world).concat(roomOffers(prof, h, true))) { const c = costOf(o.id), left = missing(u, o.id).wood; if (c.wood && left > 0 && (u.p[o.id] || opts.length < 6)) opts.push({ id: `u:tw:${o.id}`, label: `Put it towards ${o.name.toLowerCase()}`, note: `firewood ${(c.wood || 0) - left}/${c.wood}` }); }
    }
    const bs = bagCount(prof, 'stone'), bm = bagCount(prof, 'metal');
    if (bs || bm) opts.push({ id: 'u:unload', label: `Unload your bag: ${[bs && plural(bs, 'stone'), bm && plural(bm, 'metal')].filter(Boolean).join(', ')}` });
    if (!p.ped.vehId && !p.ped.carrying && matsAt(prof, h.id).wood > 0) opts.push({ id: 'u:take', label: 'Take a bundle of firewood off the stack', note: 'carry it', shut: 1 });
    opts.push({ id: 'u:list', label: 'Upgrade the home - new rooms, floors, amenities', note: `${builtOf(u).length} built` });
  } else if (V.v === 'list') {
    title = `Upgrades - ${h.name}`;
    sub = `The outside stays as it is; inside, it grows. Pay with materials from the garage and your bag, or with money. Kept here: ${matLine(prof, h)}.`;
    for (const r of roomSlots(prof, h)) opts.push({ id: `u:rooms:${r.lv}`, label: `Add a room on ${levelName(r.lv)}`, note: `${r.free} empty` });
    for (const o of offered(prof, h, world)) opts.push({ id: `u:card:${o.id}`, label: o.name, note: u.p[o.id] ? `under way · ${needLine(u, o.id)}` : `${money(priceOf(o.id))} or materials` });
    const done = builtOf(u).map((id) => nameOf(h, id));
    if (done.length) sub += ` Built: ${done.join(', ')}.`;
    if (!opts.length) sub += ' Everything this place can take is built.';
    if (!inside) opts.push({ id: 'u:back', label: 'Back to the garage' });
  } else if (V.v === 'rooms') {
    title = `A room on ${levelName(V.lv)}`;
    sub = 'Pick what goes in the next empty room along the hall.';
    for (const o of roomOffers(prof, h, false, V.lv)) opts.push({ id: `u:card:${o.id}`, label: o.name, note: u.p[o.id] ? `under way · ${needLine(u, o.id)}` : `${money(priceOf(o.id))} or materials` });
    opts.push({ id: 'u:list', label: 'Back' });
  } else if (V.v === 'card') {
    const id = V.id, left = missing(u, id), U = UPS[id], r = parseRoom(id);
    title = nameOf(h, id);
    sub = `${r ? `${ROOMS[r.k].what[0].toUpperCase()}${ROOMS[r.k].what.slice(1)}.` : U.what} Takes: ${needLine(u, id)} and ${money(costOf(id).labour || 0)} for the work. Kept here: ${matLine(prof, h)}.`;
    const can = MAT_IDS.some((m) => left[m] && (matsAt(prof, h.id)[m] > 0 || (m !== 'wood' && bagCount(prof, m) > 0)));
    opts.push({ id: `u:put:${id}`, label: 'Put in the materials you have', dis: !can, note: can ? 'from the garage, then your bag' : 'none of what it needs' });
    opts.push({ id: `u:pay:${id}`, label: MAT_IDS.some((m) => left[m]) ? 'Pay for the rest and build it now' : 'Pay the builders and build it', price: left.pay });
    if (u.p[id]) opts.push({ id: `u:out:${id}`, label: 'Take the materials put in back out' });
    opts.push({ id: r ? `u:rooms:${r.lv}` : 'u:list', label: 'Back' });
  } else if (V.v === 'store') {
    title = 'The materials';
    sub = `On the shelves here and in the garage: ${matLine(prof, h)}. Firewood comes stacked from a felled tree; stone from the mines and the hardware store; scrap metal from salvage and the caves' iron and copper ore.`;
    const bs = bagCount(prof, 'stone'), bm = bagCount(prof, 'metal'), at = matsAt(prof, h.id);
    if (bs || bm) opts.push({ id: 'u:unload', label: `Put away your bag's: ${[bs && plural(bs, 'stone'), bm && plural(bm, 'metal')].filter(Boolean).join(', ')}` });
    if (at.stone) opts.push({ id: 'u:bag:stone', label: `Take the stone into your bag (${at.stone})` });
    if (at.metal) opts.push({ id: 'u:bag:metal', label: `Take the scrap metal into your bag (${at.metal})` });
    opts.push({ id: 'u:list', label: 'The upgrades', note: `${builtOf(u).length} built` });
  } else if (V.v === 'craft') {
    title = 'The workbench';
    sub = `Make furniture from your materials - it goes into storage, to place with Decorate. Kept here: ${matLine(prof, h)}.`;
    const at = matsAt(prof, h.id);
    for (const [k, need] of Object.entries(HOME_CRAFTS)) {
      const ok = MAT_IDS.every((m) => (at[m] || 0) + (m === 'wood' ? 0 : bagCount(prof, m)) >= (need[m] || 0));
      opts.push({ id: `u:make:${k}`, label: `Make ${/^[aeiou]/i.test(PIECES[k].name) ? 'an' : 'a'} ${PIECES[k].name.toLowerCase()}`, dis: !ok, note: MAT_IDS.filter((m) => need[m]).map((m) => `${need[m]} ${MATS[m].name}`).join(', ') });
    }
  } else if (V.v === 'stairs') {
    title = 'The stairs';
    const s = p.ped.home, here = (s && s.lv) || 0;
    for (const lv of levels(world, h)) if (lv !== here) opts.push({ id: `u:go:${lv}`, label: `${lv > here ? 'Up' : 'Down'} to ${levelName(lv)}`, shut: 1 });
  }
  opts.push({ id: 'close', label: 'Done' });
  return { ...base, title, sub, opts };
}
// the rooms to put in the next empty slot of each level (lv: that one only; any: the first level's only, for the
// firewood list)
function roomOffers(prof, h, any = false, lv0 = null) {
  const out = [];
  for (const r of roomSlots(prof, h)) {
    if (lv0 !== null && r.lv !== lv0) continue;
    for (const k of Object.keys(ROOMS)) { const R = ROOMS[k]; if (r.lv > 0 ? R.up : R.down) out.push({ id: roomId(r.lv, r.n, k), name: `${R.name} (${levelName(r.lv)})` }); }
    if (any) break;
  }
  return out;
}
export function openMenu(world, p, h, v = 'garage', extra = null) {
  if (!p.conn || !h) return;
  p.upMenu = { h: h.id, v, ...(extra || null) };
  p.menu = { poi: UP_POI };
  p.conn.sendJSON(menuOf(world, p, h));
}
export function onMenu(world, p, poiId, opt) {
  if (poiId !== UP_POI) return false;
  const h = p.upMenu ? homeHere(world, p) : null;
  if (!h || h.id !== p.upMenu.h) { p.upMenu = null; if (opt !== 'close') world.notify(p, 'You walked away from the garage.', 'warn'); return true; }
  if (opt === 'close') { p.upMenu = null; return true; }
  const valid = menuOf(world, p, h).opts.find((o) => o.id === opt);
  const err = !valid ? 'That option is not available here.' : valid.dis ? 'Not available.' : run(world, p, h, opt.split(':'));
  if (err) world.notify(p, err, 'bad');
  if (valid && valid.shut) p.upMenu = null;   // (the page shuts it too: hud.js)
  p.meDirty = true;
  if (p.upMenu && p.conn) p.conn.sendJSON(menuOf(world, p, homeHere(world, p) || h));
  return true;
}
function run(world, p, h, parts) {
  const V = p.upMenu, id = parts.slice(2).join(':');
  switch (parts[1]) {
    case 'stack': { stackWood(world, p, h, woodHere(world, p)); return null; }
    case 'tw': return woodTowards(world, p, h, woodHere(world, p), id);
    case 'unload': return unloadBag(world, p, h);
    case 'take': return takeBundle(world, p, h);
    case 'bag': return intoBag(world, p, h, parts[2]);
    case 'list': V.v = 'list'; return null;
    case 'back': V.v = 'garage'; return null;
    case 'rooms': V.v = 'rooms'; V.lv = Number(parts[2]); return null;
    case 'card': V.v = 'card'; V.id = id; return null;
    case 'put': { const e = putIn(world, p, h, id); if (!e && has(upOf(p.profile, h.id), id)) V.v = 'list'; return e; }
    case 'pay': { const e = payRest(world, p, h, id); if (!e) V.v = 'list'; return e; }
    case 'out': return takeBack(world, p, h, id);
    case 'make': return craft(world, p, h, parts[2]);
    case 'go': { p.upMenu = null; homeinside.toLevel(world, p, h, Number(parts[2])); return null; }
    default: return 'Unknown option.';
  }
}

// ---- the workbench: furniture from your materials (HOME_CRAFTS) ---------------------------------------------------------
export function craft(world, p, h, k) {
  const prof = p.profile, need = HOME_CRAFTS[k], P = PIECES[k];
  if (!need || !P) return 'You can\'t make that.';
  const at = matsAt(prof, h.id);
  if (!MAT_IDS.every((m) => (at[m] || 0) + (m === 'wood' ? 0 : bagCount(prof, m)) >= (need[m] || 0))) return 'Not enough materials for that.';
  for (const m of MAT_IDS) { let n = need[m] || 0; const a = Math.min(n, at[m] || 0); at[m] -= a; n -= a; if (n) takeBag(prof, m, n); }
  prof.furn ||= {};
  prof.furn[k] = (prof.furn[k] || 0) + 1;
  (prof.stats ||= {}).crafted = (prof.stats.crafted || 0) + 1;
  store.touch(); p.meDirty = true;
  world.notify(p, `You make ${/^[aeiou]/i.test(P.name) ? 'an' : 'a'} ${P.name.toLowerCase()} at the workbench - in storage now: place it with Decorate.`, 'good');
  return null;
}

// ---- the prompts -----------------------------------------------------------------------------------------------------
// on foot by your own garage's door (nothing in your hands but firewood): its menu
export function garageInteraction(world, p) {
  const ped = p.ped;
  if (!ped || ped.dead || ped.vehId || ped.hidden) return null;
  const c = ped.carrying ? world.get(ped.carrying) : null;
  if (c && !c.wood) return null;
  const h = homes.nearOwnGarage(world, p, ped.x, ped.y, c ? GARAGE_R : 60);
  if (!h) return null;
  return { label: c ? `Your garage: stack the firewood, or put it towards an upgrade` : `Your garage at ${h.name} - materials and upgrades`, run: () => openMenu(world, p, h) };
}
// at the wheel, stopped by your garage with firewood on the back: the same menu (felling.js vehicleInteraction)
export function vehicleWood(world, p, v, wood) {
  const h = homes.nearOwnGarage(world, p, v.x, v.y, GARAGE_R);
  if (!h || !wood.some((c) => c.wood)) return null;
  return { label: `Your garage: stack the ${wood.length === 1 ? 'bundle' : `${wood.length} bundles`} of firewood, or put ${wood.length === 1 ? 'it' : 'them'} towards an upgrade`, run: () => openMenu(world, p, h) };
}

// ---- inside: the upgrades' things -------------------------------------------------------------------------------------
export const INSIDE = new Set(['stairs', 'fire', 'tub', 'bar', 'bike', 'bench', 'store']);
const GUEST_OK = new Set(['stairs', 'tub', 'bar', 'bike']);
export const fireOn = (world, h) => !!(world.homeFire && world.homeFire.get(h.id) > world.time);
// the prompt at one of them (homeinside.js interaction); s: ped.home, u: what's in reach (shared/homelayout.js useAt)
export function insideInteraction(world, p, h, s, u) {
  if ((s.guest || s.tour) && !GUEST_OK.has(u.use)) return { label: `${u.use === 'fire' ? 'The fireplace' : u.use === 'bench' ? 'The workbench' : 'The shelves'} - not yours`, passive: true, run: () => {} };
  if (s.tour) return { label: 'Having a look round', passive: true, run: () => {} };
  const prof = ownerProf(world, h) || p.profile, at = matsAt(prof, h.id);
  switch (u.use) {
    case 'stairs': {
      const lv = s.lv || 0, lvs = levels(world, h).filter((l) => l !== lv);
      if (lvs.length === 1) return { label: `${lvs[0] > lv ? 'Up' : 'Down'} the stairs to ${levelName(lvs[0])}`, run: () => homeinside.toLevel(world, p, h, lvs[0]) };
      const up = lvs.every((l) => l > lv), down = lvs.every((l) => l < lv);
      return { label: up ? 'Up the stairs - which floor?' : down ? 'Down the stairs - which floor?' : 'The stairs - up or down', run: () => openMenu(world, p, h, 'stairs') };
    }
    case 'fire': {
      if (fireOn(world, h)) return { label: 'The fire is burning - warm in here (everyone heals)', passive: true, run: () => {} };
      return { label: at.wood > 0 ? `Light the fire (a bundle of firewood - ${at.wood} in the garage)` : 'The fireplace - no firewood in the garage to burn', run: () => lightFire(world, p, h) };
    }
    case 'tub': return { label: 'Get in the hot tub', run: () => soak(world, p, h, s, u) };
    case 'bar': return { label: 'Pour yourself a glass at the bar', run: () => drink(world, p, s) };
    case 'bike': return { label: 'Ride the exercise bike (stamina)', run: () => ride(world, p, h, s, u) };
    case 'bench': return { label: 'The workbench - make furniture from your materials', run: () => openMenu(world, p, h, 'craft') };
    case 'store': return { label: `The materials: ${at.wood} firewood, ${at.stone} stone, ${at.metal} scrap`, run: () => openMenu(world, p, h, 'store') };
    default: return null;
  }
}
function lightFire(world, p, h) {
  const prof = p.profile, at = matsAt(prof, h.id);
  if (!(at.wood > 0)) { world.notify(p, 'No firewood in the garage. Fell a tree, cut it up and bring the bundles home.', 'warn'); return; }
  at.wood--;
  (world.homeFire ||= new Map()).set(h.id, world.time + HOME_AMEN.fireS);
  store.touch();
  world.notify(p, 'You light the fire. The room fills with a warm glow - anyone in here heals while it burns.', 'good');
  for (const q of world.players.values()) if (q.ped && q.ped.home && q.ped.home.id === h.id) homeinside.send(world, q, false);
}
function drink(world, p, s) {
  if (world.time - (s.barAt ?? -1e9) < HOME_AMEN.barS) { world.notify(p, 'One is enough for now.', 'info'); return; }
  s.barAt = world.time;
  economy.applyBuff(world, p.ped, 'wine');
  world.notify(p, 'A glass of something good: your health comes back faster for a while.', 'good');
}
const seatOn = (u) => ({ x: u.x + u.w / 2, y: u.y + u.h / 2 + 4, a: Math.PI / 2 });
function soak(world, p, h, s, u) {
  s.seat = seatOn(u); s.soak = 1; s.ride = 0; s.mv = false;
  world.notify(p, 'Into the hot tub. Health and stamina come back fast - move to get out.', 'good');
  homeinside.send(world, p, true);
}
function ride(world, p, h, s, u) {
  s.seat = { x: u.x + u.w / 2, y: u.y + u.h / 2, a: Math.PI / 2 }; s.ride = world.time; s.soak = 0; s.mv = false;
  world.notify(p, 'On the bike: keep riding for stamina - move to get off.', 'info');
  homeinside.send(world, p, true);
}
// every tick for each player inside a home (homeinside.update): the fire's warmth, the tub, the bike
export function stepInside(world, p, s, h, dt) {
  const ped = p.ped;
  if (fireOn(world, h) && ped.hp < ped.maxHp && !ped.bleeding) { ped.hp = Math.min(ped.maxHp, ped.hp + HOME_AMEN.heal * dt); if (world.tick % 20 === 0) p.meDirty = true; }
  if (s.seat && s.soak && !s.bath) {
    if (ped.hp < ped.maxHp) ped.hp = Math.min(ped.maxHp, ped.hp + HOME_AMEN.tubHeal * dt);
    ped.stamina = Math.min(skills.staminaFull(world, ped), (ped.stamina || 0) + 20 * dt);
    if (world.tick % 20 === 0) p.meDirty = true;
  }
  if (s.seat && s.ride) {
    if (world.time - (s.rideBeat ?? s.ride) >= HOME_AMEN.bikeS) { s.rideBeat = world.time; skills.gain(world, p, 'bike'); }
  }
}

// ---- the home sold, or taken back: what the upgrades were worth -----------------------------------------------------------
// what selling a home pays for its upgrades (HOME_STORE.back of what they'd cost now) and for the materials kept there (half
// their price); they go with the place. Returns the dollars.
export function sellOff(prof, hid) {
  const u = prof.homeUp && prof.homeUp[hid];
  let pay = 0;
  for (const id of builtOf(u)) pay += priceOf(id) * HOME_STORE.back;
  for (const got of Object.values((u && u.p) || {})) for (const m of MAT_IDS) pay += (got[m] || 0) * MAT_PRICE[m] * 0.5;
  const at = prof.homeMats && prof.homeMats[hid];
  if (at) for (const m of MAT_IDS) pay += (at[m] || 0) * MAT_PRICE[m] * 0.5;
  if (prof.homeWood && prof.homeWood[hid]) { pay += prof.homeWood[hid] * MAT_PRICE.wood * 0.5; delete prof.homeWood[hid]; }
  if (prof.homeUp) delete prof.homeUp[hid];
  if (prof.homeMats) delete prof.homeMats[hid];
  return Math.round(pay);
}
// (a world rebuilt under it: bought back at full price - homes.checkWorld)
export function worldRefund(prof, hid) {
  const u = prof.homeUp && prof.homeUp[hid];
  let pay = 0;
  for (const id of builtOf(u)) pay += priceOf(id);
  const half = sellOff(prof, hid);   // (the materials at half: as a sale)
  return Math.round(pay + half - builtOf(u).reduce((n, id) => n + priceOf(id) * HOME_STORE.back, 0));
}

// ---- dev ---------------------------------------------------------------------------------------------------------------
// The dev command 'homeup' (server/dev.js; a home of yours - the one you're in, or by its garage): msg.build [ids] built
// for nothing ('floor2', 'basement', 'room:1:1:gym', ...), msg.mats { wood, stone, metal } into its garage, msg.menu
// 'garage' | 'list' opens that menu, msg.lv go to that level (inside), msg.fire light the fireplace, msg.place pieces
export function devHomeUp(world, p, msg) {
  const ped = p.ped;
  const h = (ped && ped.home && homes.homeById(world, ped.home.id)) || homes.nearOwnGarage(world, p, ped.x, ped.y, 400) || homes.ownedHomes(world, p.profile)[0];
  if (!h || world.homeOwner.get(h.id) !== p.pid) return 'Own a home first (dev homein).';
  const u = upOf(p.profile, h.id);
  for (const id of [].concat(msg.build || [])) if ((UPS[id] || parseRoom(id)) && !has(u, id)) build(world, p, h, id);
  if (msg.mats) { const at = matsAt(p.profile, h.id); for (const m of MAT_IDS) at[m] += Math.max(0, msg.mats[m] | 0); store.touch(); }
  if (msg.fire) (world.homeFire ||= new Map()).set(h.id, world.time + HOME_AMEN.fireS);
  if (Array.isArray(msg.place)) {   // ([[kind, tx, ty, turn, level], ...]: placed as Decorate would, where they fit)
    const prof = p.profile;
    for (const [k, tx, ty, r = 0, lv = 0] of msg.place) {
      const key = homeinside.decorKey(h, lv), d0 = (prof.decor && prof.decor[key]) || { it: [] }, q = { k, tx, ty, r };
      if (!PIECES[k] || canPlace(homeinside.planFor(h, world, lv), d0, q)) continue;
      (prof.decor ||= {})[key] = { ...d0, it: [...(d0.it || []), q], plan: planOf(h) };
    }
    store.touch();
  }
  if (msg.lv !== undefined && ped.home) homeinside.toLevel(world, p, h, msg.lv | 0);
  if (msg.menu) openMenu(world, p, h, msg.menu);
  if (ped.home) homeinside.send(world, p, true);
  return null;
}
export const _test = { menuOf: (world, p, h) => menuOf(world, p, h), homeHere };
void K;
