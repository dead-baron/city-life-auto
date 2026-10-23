// Map commerce economy (GDD §11): storefront menus, bank/ATM, hospital reception,
// pharmacy/coffee/vending buffs, weapon/pawn/black-market shops, dealership + owned
// vehicles, Fresh Coat garage (respray / wash / repair / disguise), clothing disguises,
// police HQ badge desk and the courthouse bounty office.
import * as lights from './lights.js';
import { K } from '../../shared/constants.js';
import { WEAPONS, ITEMS, SHOPS, CRAFTS, MATERIAL_NAME, materialIds } from '../../shared/items.js';
import { VEHICLES, PAINTS, respray } from '../../shared/vehicles.js';
import { mulberry32 } from '../../shared/rng.js';
import * as looks from './looks.js';
import { STORES, storeOf } from '../../shared/wardrobe.js';
import { store } from '../store.js';
import * as law from './law.js';
import * as bounties from './bounties.js';
import * as fishing from './fishing.js';
import * as jobs from './jobs.js';
import * as combat from './combat.js';
import * as homes from './homes.js';
import * as station from './station.js';
import * as gang from './gang.js';
import * as cruiser from './cruiser.js';
import * as trains from './trains.js';
import * as rentals from './rentals.js';
import * as horses from './horses.js';
import * as hotmoney from './hotmoney.js';
import * as farming from './farming.js';

import * as homeinside from './homeinside.js';
import * as mortgage from './mortgage.js';
import * as mail from './mail.js';
import * as skate from './skate.js';
import * as casino from './casino.js';
import * as skills from './skills.js';
import * as arcade from './arcade.js';
import { PIECES as DECOR_PIECES, KINDS as DECOR_KINDS, priceOf as decorPrice } from '../../shared/homedecor.js';

import { SKATEBOARD_PRICE, SURFBOARD_PRICE, REVIVE_KIT_PRICE, HOSPITAL_FEE, FELONY_FINE, HIDE_TIME_S, POLICE_ARMORY, GANG_JOIN_FEE, POACH_PAY, DEEPSEA_CATCH, DEEPSEA_PAY, TRAIN_JOB_PAY, FLASHLIGHT_PRICE, WINE_S, HEARTY_HP, HEARTY_S, SCENT_S } from '../../shared/rules.js';
const rng = mulberry32(77);

// A hand plan's walk-in shop's counter (World v3's Midtown: shared/world3-hand.js poi.walk, poi.store): what it has for
// you by its trade - a bar's drinks, a deli's or a grocer's food, the laundromat's machines, the bookshop's and the
// record shop's pieces for your home (shared/homedecor.js); a tailor or an optician just a clerk to say hello to
const FOODISH = /Deli|Butcher|Cheese|Spice|Produce|Bodega|Mini Mart|Market|Discount|Lotto/;
function walkCounter(poi) {
  const st = poi.store, n = poi.label || '';
  if (st === 'bar') return { items: [['whiskey', 8], ['redwine', 10]], sub: 'A quiet one at the bar.' };
  if (st === 'laundry') return { items: [], wash: true, decor: ['washer'], sub: 'Wash and dry while you wait - or take a machine home.' };
  if (st === 'books') return { items: [], decor: ['bookshelf', 'armchair', 'lamp'], sub: 'New and used. A reading corner for your place, delivered.' };
  if (st === 'records') return { items: [], decor: ['turntable', 'crates', 'art'], sub: 'Crates of vinyl, a listening booth. Take the sound home.' };
  if (FOODISH.test(n)) return { items: [['bread', 5], ['apple', 3], ['energy', 8]], sub: 'Fresh in this morning.' };
  return null;
}
export function poiLabel(world, p, poi) {
  if (casino.isCasino(poi)) return casino.label(poi);   // (Lucky Mesa's casinos: the slots and the tables - casino.js)
  if (arcade.isArcade(world, poi)) return arcade.label(poi);   // (the arcades: a credit, the prize counter - arcade.js)
  if (poi.walk && poi.kind === 'delivery') return walkCounter(poi) ? `Counter - ${poi.label}` : null;
  switch (poi.kind) {
    case 'delivery': case 'evidence': case 'reception': case 'paint': case 'ride': case 'race': return null;   // (a ride's boarding point: server/systems/rides.js; a race's start: races.js)
    case 'bowling': return null;   // (Pinwheel Lanes' shoe counter: server/systems/bowling.js)
    case 'cinema': return `${poi.label} - tickets & popcorn`;   // (the shop menu: shared/items.js SHOPS.cinema; the screens: server/systems/cinema.js)
    case 'gang': return gang.isMember(p) ? 'Syndicate HQ (members)' : 'Syndicate HQ (join the gang)';
    case 'smuggler': return "Smuggler's Den";
    case 'charter': return 'Charter desk (deep-sea fishing)';
    case 'station': { const eta = trains.nextTrainIn(world, poi.station, poi); return eta < 1 ? `${poi.label} - train in! Walk up to the doors` : `${poi.label} - next train ${Math.round(eta)}s (timetable)`; }
    case 'home': {
      const us = homes.unitsAt(world, poi);   // (an apartment block: its lobby - H65)
      if (us) {
        const mine = us.filter((id) => world.homeOwner.get(id) === p.pid).length, free = us.filter((id) => !world.homeOwner.has(id)).length;
        return `${poi.label} - the lobby: ${mine ? `your home${mine > 1 ? 's' : ''}, ` : ''}${free} of ${us.length} for sale`;
      }
      const h = world.map.homes[poi.home];
      const owner = world.homeOwner.get(h.id);
      if (owner === p.pid) return `Your ${h.kind} (rest, garage, spawn)`;
      if (owner) return null;
      return `For sale: ${h.name} - $${h.price.toLocaleString()}`;
    }
    case 'atm': return p.profile.cash > 0 ? `ATM - $${p.profile.cash.toLocaleString()} on you to deposit` : 'Use ATM';
    case 'club': return `Bar - ${poi.label}`;
    case 'roadhouse': return `Bar - ${poi.label} (beer, rye)`;
    case 'vending': return 'Buy an Energy Drink';
    case 'police': return p.badge ? 'Front desk (armory, motor pool, off duty)' : 'Front desk (join the police)';
    case 'courthouse': return 'Courthouse desk (bounties, fines)';
    case 'hospital': return 'Hospital front desk';
    case 'bank': return 'Bank teller';
    case 'pawn': return 'Pawn window';
    case 'farm': return 'Farm Co-op (contracts, seeds, horses)';
    case 'warehouse': return 'Portside Logistics (courier jobs)';
    default:
      if (poi.counter && COUNTER[poi.kind]) return COUNTER[poi.kind].label(poi.label);
      return poi.outside ? `Counter - ${poi.label}` : `Enter ${poi.label}`;
  }
}

// The counters out at the countryside places (shared/naturesites.js addCounter): what the prompt says
// when you walk up, the menu title, and the line under it.
const COUNTER = {
  winery: { label: (l) => `${l} - tasting room`, title: (l) => SHOPS.winery.title, sub: 'Estate reds and whites, poured by the bottle: a glass or two and your health comes back faster for a couple of minutes. The cellar pays more for grapes than any shop in town - pick them off the vines up the hill.' },
  fruitstand: { label: (l) => `${l} (fruit, cider)`, title: (l) => l, sub: 'Fresh off the trees out back - pick your own for free, or buy a bag here. A cup of pressed cider puts the spring back in your step. They buy apples and oranges.' },
  market: { label: (l) => `${l} - the stalls`, title: (l) => l, sub: 'Bread, fruit and honey from the farms round about. The stallholders buy fruit and honey too.' },
  snack: { label: (l) => `${l} (hot dogs, lemonade)`, title: (l) => l, sub: 'Hot dogs, ice-cold lemonade and energy drinks.' },
  tackle: { label: (l) => `${l} (bait, rods; sells fish)`, title: (l) => l, sub: null },
  clubhouse: { label: (l) => `${l} - the bar`, title: (l) => `${l} - ${SHOPS.clubhouse.title}`, sub: 'Members and guests welcome. Cocktails, coffee, a fine red and a hot dog at the turn.' },
  farmstand: { label: (l) => `${l} - farm stand (honey)`, title: (l) => SHOPS.farmstand.title, sub: 'Lavender honey from the hives at the end of the rows, and fresh lemonade. They buy honey back.' },
  salvage: { label: (l) => `${l} - yard office (buys scrap)`, title: (l) => SHOPS.salvage.title, sub: 'The foreman buys component scrap for more than the pawn shop pays. Bring it to the window.' },
  assay: { label: (l) => `${l} (pickaxes; buys ore)`, title: (l) => SHOPS.assay.title, sub: 'Ore from the quarry\'s faces, the mine\'s outcrops and the cave under the peaks: the assayer pays more than any pawn shop. Pickaxes for every rock - the best ore needs the best pick.' },
  lodge: { label: (l) => `${l} (hunting gear; buys game, hides and pelts)`, title: (l) => SHOPS.lodge.title, sub: 'Rifles, bows and arrows, knives, the varmint rifle, a ghillie cloak and cover scent. Bring in what you take - field dress it where it fell, with a Hunting Knife for a whole hide - and they pay best for it: one clean shot from the right weapon makes a perfect hide. The work bench makes clothing from hides and pelts.' },
  huntcamp: { label: (l) => `${l} (ammunition, arrows; buys game)`, title: (l) => l, sub: 'Rounds, arrows, knives and cover scent for the hunt. The outfitter buys what you bring in, for a little less than the lodge.' },
  trapper: { label: (l) => `${l} (pelts and furs; makes clothing)`, title: (l) => l, sub: 'The trapper pays best for pelts, hides, antlers, claws and feathers - and at the bench makes gloves, moccasins, fur hats, buckskin and bearskin from them. The city clothing shops pay well for those.' },
  butcher: { label: (l) => `${l} (buys meat)`, title: (l) => l, sub: 'Raw game and cooked meals: the butcher pays more for meat than anyone.' },
};

// The work bench (a trapper's cabin, the lodge): what can be made from what's in the bag (shared/items.js CRAFTS)
const have = (prof, mat) => materialIds(mat).reduce((n, id) => n + (prof.inventory[id] || 0), 0);
function craftOptions(p, opts) {
  const prof = p.profile;
  for (const c of CRAFTS) {
    const missing = c.needs.filter(([mat, n]) => have(prof, mat) < n);
    const what = c.needs.map(([mat, n]) => `${n} ${MATERIAL_NAME[mat] || ITEMS[mat].name.toLowerCase()}`).join(' + ');
    const noBow = c.ammo && prof.weapons[c.ammo[0]] === undefined;
    opts.push({ id: `craft:${c.id}`, label: `Make ${c.ammo ? c.name : ITEMS[c.id].name} (${what})`, dis: missing.length > 0 || noBow, note: noBow ? 'need a bow' : missing.length ? 'not enough' : 'make' });
  }
}
function craft(world, p, id) {
  const c = CRAFTS.find((q) => q.id === id), prof = p.profile;
  if (!c) return 'Nothing like that is made here.';
  if (c.needs.some(([mat, n]) => have(prof, mat) < n)) return 'You don\'t have what it takes.';
  for (const [mat, n] of c.needs) {
    let left = n;
    for (const mid of materialIds(mat)) { const k = Math.min(left, prof.inventory[mid] || 0); if (k > 0) { prof.inventory[mid] -= k; if (!prof.inventory[mid]) delete prof.inventory[mid]; left -= k; } if (!left) break; }
  }
  if (c.ammo) { prof.weapons[c.ammo[0]] = (prof.weapons[c.ammo[0]] || 0) + c.ammo[1]; world.notify(p, `${c.name}: ${c.ammo[1]} arrows in your quiver.`, 'good'); }
  else { prof.inventory[c.id] = (prof.inventory[c.id] || 0) + 1; world.notify(p, `Made: ${ITEMS[c.id].name}.${ITEMS[c.id].crafted ? ' The clothing shops in the city pay best for it.' : ''}`, 'good'); }
  store.touch();
  return null;
}

// What a counter pays for one of an item: its own price when it has one (the winery pays more for grapes), else the usual
const sellPrice = (shop, id) => (shop && shop.sellPrice && shop.sellPrice[id]) || ITEMS[id].sell;

// Pay off your felony record (courthouse or Police HQ) - a clean record lets you join the force.
function recordOption(p, opts) {
  const n = p.profile.felonies || 0;
  if (n <= 0) return;
  opts.push({ id: 'payrecord', label: `Pay felony fines - clear your record (${n} felon${n === 1 ? 'y' : 'ies'})`, price: n * FELONY_FINE, dis: p.wanted > 0, note: p.wanted > 0 ? 'not while wanted' : '' });
}

export function payFrom(p, amount) { return pay(p, amount); }
function pay(p, amount) {
  const prof = p.profile;
  if (prof.cash + prof.bank < amount) return false;
  const fromCash = Math.min(prof.cash, amount);
  prof.cash -= fromCash;
  prof.bank -= amount - fromCash;
  store.touch();
  p.meDirty = true;
  return true;
}

// Rough 0-5 bars for the armory cards: damage per second, range, accuracy.
function weaponStats(id) {
  const w = WEAPONS[id];
  const dps = (w.dmg * (w.pellets || 1)) / (w.cd || 1);
  const bar = (v, max) => Math.max(1, Math.min(5, Math.round((v / max) * 5)));
  return { pow: bar(dps, 150), rng: bar(w.range || 0, 1050), acc: bar(0.22 - (w.spread || 0), 0.22) };
}

function weaponOffer(o, prof) {
  const w = WEAPONS[o.id];
  const owned = prof.weapons[o.id] !== undefined;
  return { id: `w:${o.id}:${o.price}`, label: w.name, price: o.price, dis: owned, note: owned ? 'owned' : (w.illegal ? 'illegal' : ''), wpn: w.i };
}

export function buildMenu(world, p, poi) {
  let atmMore = false;   // (an ATM's pop-up: "Use ATM" last, after the hot money's row)
  const prof = p.profile;
  const ped = () => p.ped;
  const kind = poi.kind;
  const opts = [];
  let title = poi.label, sub = '', interior = null;
  if (kind === 'hardware' && p.furnShop === poi.id) return furnitureMenu(p, poi);   // (H67: the furniture counter)
  if (casino.isCasino(poi)) return casino.menu(world, p, poi);   // (a casino's floor: casino.js)
  if (arcade.isArcade(world, poi)) return arcade.menu(world, p, poi);   // (an arcade's counter: arcade.js)
  if (kind === 'delivery' && poi.walk) {   // (a walk-in shop's counter: walkCounter)
    const W = walkCounter(poi) || { items: [], sub: 'Just looking.' }, none = !(prof.homes || []).length, furn = prof.furn || {};
    for (const [id, price] of W.items) opts.push({ id: `i:${id}:${price}:1`, label: ITEMS[id].name, price, note: prof.inventory[id] ? `have ${prof.inventory[id]}` : '' });
    if (W.wash) opts.push({ id: 'wash', label: 'Wash and dry your clothes', price: 6 });
    for (const k of W.decor || []) opts.push({ id: `fb:${k}`, label: DECOR_PIECES[k].name, price: decorPrice(k), dis: none, note: `for your home${furn[k] ? ` · ${furn[k]} in storage` : ''}` });
    if (!opts.length) opts.push({ id: 'close', label: 'Leave' });
    return { t: 'menu', poi: poi.id, title: poi.label, sub: W.sub, opts, cash: prof.cash, bank: prof.bank };
  }
  const shopKey = kind === 'vending' ? 'vending' : kind;
  const shop = kind === 'smuggler' && !gang.isMember(p) ? null : SHOPS[shopKey];
  if (shop && kind !== 'dealer' && kind !== 'marina' && kind !== 'garage' && kind !== 'clothing') {
    title = kind === 'gunshop' || kind === 'coffee' || poi.own || poi.fixed ? poi.label : shop.title;   // (the gun shops and the cafes round the world, World v3's new shops and the hand plans' named ones: each its own name - shared/world3-shops.js, world3-hand.js)
    if (kind === 'coffee' && poi.food) opts.push({ id: 'i:hotdog:7:1', label: 'A plate of the day', price: 7, note: prof.inventory.hotdog ? `have ${prof.inventory.hotdog}` : '' }, { id: 'i:bread:4:1', label: ITEMS.bread.name, price: 4, note: '' });
    for (const o of shop.buy) {
      if (o.kind === 'weapon') opts.push(weaponOffer(o, prof));
      else if (o.kind === 'ammo') { const an = WEAPONS[o.id].ammoName; opts.push({ id: `a:${o.id}:${o.price}:${o.qty}`, label: an ? `${an[0].toUpperCase()}${an.slice(1)} x${o.qty}` : `${WEAPONS[o.id].name} ammo x${o.qty}`, price: o.price, dis: prof.weapons[o.id] === undefined, note: prof.weapons[o.id] === undefined ? `need the ${WEAPONS[o.id].name}` : `have ${prof.weapons[o.id]}` }); }
      else if (o.kind === 'item') {
        const have = prof.inventory[o.id] || 0, tool = !!ITEMS[o.id].tool; // a tool is never used up: one is enough
        opts.push({ id: `i:${o.id}:${o.price}:${o.qty}`, label: `${ITEMS[o.id].name}${o.qty > 1 ? ' x' + o.qty : ''}`, price: o.price, dis: tool && have > 0, note: tool && have > 0 ? 'have one' : have ? `have ${have}` : '' });
      }
    }
    if (poi.counter && COUNTER[kind]) {
      title = COUNTER[kind].title(poi.label);
      if (COUNTER[kind].sub) sub = COUNTER[kind].sub;
    }
    if (kind === 'roadhouse') sub = 'A biker roadhouse: cold beer, rye, coffee and a hot dog. Mind the club patches - hurt one of them and you answer to all of them.';
    if (kind === 'club') {
      title = poi.label;
      sub = 'The bar. A cocktail fills your stamina past full for a minute. Open from dusk till dawn.';
    }
    { const fsub = fishing.shopOptions(p, kind, opts); if (fsub) sub = fsub; }   // (a fish market, a bait shop, a charter desk: sell the catch, choose the bait - fishing.js)
    for (const id of shop.sells || []) {
      const n = prof.inventory[id] || 0;
      if (n > 0) opts.push({ id: `s:${id}`, label: `Sell ${ITEMS[id].name} (x${n})`, price: -sellPrice(shop, id), note: n > 1 ? 'sells all' : '' });
    }
    if (shop.crafts) craftOptions(p, opts);
    if (shop.sellsWeapons) {
      for (const id of Object.keys(prof.weapons)) {
        if (id === 'fists' || id === 'taser' || id === 'baton') continue;
        opts.push({ id: `sw:${id}`, label: `Sell ${WEAPONS[id].name}`, price: -Math.round(weaponPrice(id) * 0.4), wpn: WEAPONS[id].i });
      }
    }
  }
  if (kind === 'hardware') opts.unshift({ id: 'furn', label: 'Furniture & decor for your home', note: 'sofas, lamps, rugs, a wall TV...' });   // (H67)
  switch (kind) {
    case 'bank': case 'atm':
      title = kind === 'bank' ? 'First Pixel Bank' : 'ATM';
      sub = `Wallet $${prof.cash} - Bank $${prof.bank}. Banked money is safe when you die.`;
      // an ATM's pop-up first: all your cash in at a press (the menu closes), or the machine's full menu (the owner,
      // 10-06: "ATMs no longer deposit on their own: a pop-up with 'Deposit all' and 'Use ATM', on foot only" -
      // walking up to one used to bank everything)
      if (kind === 'atm' && p.atmFull !== poi.id) {
        opts.push({ id: 'dep:all', label: prof.cash > 0 ? `Deposit all ($${prof.cash.toLocaleString()})` : 'Deposit all', dis: prof.cash <= 0, shut: 1 });
        atmMore = true;
        break;
      }
      for (const amt of [100, 1000]) opts.push({ id: `dep:${amt}`, label: `Deposit $${amt}`, dis: prof.cash < amt });
      opts.push({ id: 'dep:all', label: 'Deposit everything', dis: prof.cash <= 0 });
      for (const amt of [100, 500, 1000]) opts.push({ id: `wd:${amt}`, label: `Withdraw $${amt}`, dis: prof.bank < amt });
      break;
    case 'hospital':
      sub = 'Step onto the ER reception mat to be healed instantly.';
      opts.push({ id: 'heal', label: 'Full treatment + stop bleeding', price: HOSPITAL_FEE });
      opts.push({ id: `i:revivekit:${REVIVE_KIT_PRICE}:1`, label: 'Revive Kit (revive downed players, reusable)', price: REVIVE_KIT_PRICE, dis: (prof.inventory.revivekit || 0) > 0, note: prof.inventory.revivekit ? 'have one' : '' });
      break;
    case 'police': {
      const where = p.ped && p.ped.interior && p.ped.interior.poi === poi.id ? p.ped.interior.kind : null;
      interior = where;
      if (where === 'armory') {
        title = 'HQ Armory';
        sub = 'The door locks behind you. Check out one long gun (your service pistol always comes along), then head out back to the motor pool and take any cruiser or motorcycle.';
        for (const id of POLICE_ARMORY) {
          const has = prof.weapons[id] !== undefined;
          opts.push({ id: `arm:${id}`, label: `${has ? 'Restock' : 'Take'} ${WEAPONS[id].name}`, note: has ? `carrying ${(prof.weapons[id] || 0) + (p.ped.mag[id] || 0)} rds` : `${WEAPONS[id].mag}-round mag`, wpn: WEAPONS[id].i, stats: weaponStats(id) });
        }
        opts.push({ id: 'armexit', label: 'Out the back door to the motor pool ▶' });
        opts.push({ id: 'sleave', label: 'Back out to the front desk' });
      } else {
        title = poi.label + ' - front desk';
        sub = p.badge ? 'On duty. Arrest wanted suspects, seize contraband, keep it clean. Your gear and vehicles are through the armory.' : `Sign-up requirements: ${law.ENFORCER_MIN_SAMARITAN} Samaritan points, zero felonies. You: ${prof.samaritan} pts, ${prof.felonies} felonies.`;
        recordOption(p, opts);
        if (!p.badge) opts.push({ id: 'duty:on', label: 'Sign up as a police officer' });
        else { opts.push({ id: 'armgo', label: 'Armory & motor pool (weapons, vehicles)' }); opts.push({ id: 'duty:off', label: 'Go off duty' }); }
      }
      break;
    }
    case 'courthouse': {
      sub = p.hunter ? 'Licensed Bounty Hunter: take contracts in the Bounties app on your phone - their targets show on your radar.' : `Register as a Bounty Hunter (${law.HUNTER_MIN_SAMARITAN}+ Samaritan, not wanted), then take contracts in the Bounties app on your phone.`;
      recordOption(p, opts);
      opts.push(p.hunter ? { id: 'hunter:off', label: 'Hand in hunter license' } : { id: 'hunter:on', label: 'Register as Bounty Hunter' });
      bounties.courthouseOptions(world, p, opts);   // someone who keeps killing you: put a price on their head
      const active = bounties.summary(world);
      sub += active.length ? ` Bounties out: ${active.join(', ')}.` : ' No bounties out right now.';
      break;
    }
    case 'clothing':
      title = poi.label;
      sub = `${(STORES[storeOf(poi)] || {}).line || 'Clothes'}. Try things on in the fitting room. A fresh outfit drops your public wanted level to 0 (if no cop is watching); your peak record is remembered. They buy handmade furs and buckskin.`;
      opts.push({ id: 'outfit', label: 'Buy a new outfit (whatever fits)', price: 120, dis: p.badge, note: p.badge ? 'off duty only' : '' });
      if (storeOf(poi) === 'kickflip' || storeOf(poi) === 'surf') { const have = (prof.inventory.skateboard || 0) > 0; opts.push({ id: `i:skateboard:${SKATEBOARD_PRICE}:1`, label: ITEMS.skateboard.name, price: SKATEBOARD_PRICE, dis: have, note: have ? 'have one' : 'ride it anywhere smooth' }); }   // (the skate shop's decks, the surf shops' cruisers)
      if (storeOf(poi) === 'surf') { const have = (prof.inventory.surfboard || 0) > 0; opts.push({ id: `i:surfboard:${SURFBOARD_PRICE}:1`, label: ITEMS.surfboard.name, price: SURFBOARD_PRICE, dis: have, note: have ? 'have one' : 'paddle out at a surf break and catch a wave' }); }   // (surfing: surf.js)
      for (const id of SHOPS.clothing.sells) { const n = prof.inventory[id] || 0; if (n > 0) opts.push({ id: `s:${id}`, label: `Sell ${ITEMS[id].name} (x${n})`, price: -sellPrice(SHOPS.clothing, id), note: n > 1 ? 'sells all' : '' }); }
      break;
    case 'garage': {
      title = SHOPS.garage.title;
      const v = myVehicleNear(world, p, poi);
      sub = v ? `Servicing your ${v.def.name}.` : 'Drive a vehicle onto the lot to service it.';
      opts.push({ id: 'respray', label: 'Respray (disguise, cleans blood)', price: 250, dis: !v });
      opts.push({ id: 'wash', label: 'Car wash (removes hood blood)', price: 20, dis: !v });
      opts.push({ id: 'repair', label: 'Repair body damage', price: 300, dis: !v });
      ownedVehicleOpts(prof, opts, false);
      break;
    }
    case 'dealer': case 'marina': {
      title = SHOPS[kind].title;
      for (const o of SHOPS[kind].buy) {
        const d = VEHICLES[o.id];
        opts.push({ id: `vb:${o.id}`, label: `${d.name}${d.slots.length ? ` (${d.slots.length} cargo slot${d.slots.length > 1 ? 's' : ''})` : ''}`, price: d.price, note: d.blurb || '' });
      }
      ownedVehicleOpts(prof, opts, kind === 'marina');
      break;
    }
    case 'home': {
      const h = homes.homeFor(world, p, poi);   // (inside an apartment block's unit: that unit - H65)
      const mine = world.homeOwner.get(h.id) === p.pid;
      const inside = !!(ped() && ped().hidden && ped().inside === h.id);
      const us = homes.unitsAt(world, poi);
      if (us && !inside) {   // an apartment block's lobby: its homes, floor by floor
        const pick = p.lobbyUnit != null && us.includes(p.lobbyUnit) ? homes.homeById(world, p.lobbyUnit) : null;
        if (pick && !world.homeOwner.has(pick.id)) {   // (H67) a flat for sale picked from the lobby's list: look round or buy
          title = `${poi.label} - Unit ${pick.unit || 1}`;
          sub = `For sale: ${unitWhat(pick)}.`;
          opts.push(...unitSaleOpts(pick), { id: 'hu:back:0', label: 'Back to the lobby' });
          break;
        }
        title = `${poi.label} - the lobby`;
        sub = `${us.length} homes in this building, three doors a landing. Yours to go in; for sale to look round or buy (each a respawn point with a safe, a bed and parking out front); someone else's to knock at while they're in.`;
        lobbyOpts(world, p, us, opts);
        break;
      }
      title = inside ? `${h.name} - inside` : h.name;
      if (!mine) {
        sub = `A ${h.dock ? 'waterfront ' : ''}${KIND_NAME[h.kind] || h.kind} with a ${h.slots}-car garage${h.dock ? ' and its own boat dock and boathouse' : ''}. Own as many homes as you like: each one is a respawn point, a safe place to hide and stash things, and adds garage space you can reach from any of your homes.`;
        opts.push({ id: 'htour', label: 'Take a look inside', note: 'walk round it first' });   // (H65: homeinside.js tour)
        opts.push({ id: 'hbuy', label: `Buy this ${KIND_NAME[h.kind] || h.kind}`, price: h.price });
        { const t = mortgage.terms(h); opts.push({ id: 'hmort', label: `Buy with a mortgage: ${t.days} payments of $${t.pay.toLocaleString()} a day`, price: t.deposit, note: 'deposit' }); }   // (H65: mortgage.js)
      } else {
        const st = prof.stash || {};
        const stashed = Object.entries(st.items || {}).filter(([, n]) => n > 0).length + Object.keys(st.weapons || {}).length;
        sub = inside
          ? `You're hidden inside - nobody can see you or hurt you. Wallet $${prof.cash}, bank $${prof.bank}. Stash: ${stashed} kind${stashed === 1 ? '' : 's'} of things.`
          : `Garage: ${prof.vehicles.length}/${homes.garageCap(world, prof)} vehicles (shared by all your homes)${h.garage ? '. Drive up to the garage door to park' : ''}${h.dock ? '; pull a boat into the boathouse to moor it' : ''}. Go inside to hide, stash things and rest.`;
        if (inside) opts.push({ id: 'hleave', label: 'Step outside' });
        else opts.push({ id: 'hhide', label: 'Go inside (hide)', note: `${HIDE_TIME_S}s`, dis: p.wanted > 0 && world.time - (p.seenAt || -99) < 1.5 });
        opts.push({ id: 'hrest', label: 'Rest (full health, stop bleeding)' });
        if (prof.cash > 0) opts.push({ id: 'dep:all', label: `Deposit cash ($${prof.cash}) to the bank` });
        if (inside) {
          const inv = Object.entries(prof.inventory).filter(([id, n]) => n > 0 && ITEMS[id]).map(([id, n]) => `${ITEMS[id].name} x${n}`);
          const guns = Object.keys(prof.weapons).filter((id) => id !== 'fists' && WEAPONS[id]).map((id) => WEAPONS[id].name);
          sub += ` Carrying: ${[...inv, ...guns].join(', ') || 'nothing'}.`;
          if (p.pendingCar != null && prof.vehicles[p.pendingCar] && h.garage) {
            const d = VEHICLES[prof.vehicles[p.pendingCar].model];
            opts.unshift({ id: 'hcarno', label: 'Not yet - stay inside' });
            opts.unshift({ id: `hcargo:${p.pendingCar}`, label: `Ready? Head out in the ${d.name} ▶`, note: 'garage door opens' });
          }
          opts.push({ id: 'houtfit', label: 'Change outfit', note: p.badge ? 'off duty only' : 'free', dis: p.badge });
          opts.push({ id: 'hlooks', label: 'Quick change', note: p.badge ? 'off duty only' : 'your saved looks', dis: p.badge });   // (server/systems/looks.js)
          opts.push({ id: 'hmirror', label: 'The mirror', note: p.badge ? 'off duty only' : 'change anything about your look', dis: p.badge });
          for (const [id, n] of Object.entries(prof.inventory)) if (n > 0 && ITEMS[id]) opts.push({ id: `hst:${id}`, label: `Stash ${ITEMS[id].name} x${n}` });
          for (const id of Object.keys(prof.weapons)) if (!NO_STASH.has(id) && WEAPONS[id]) opts.push({ id: `hsw:${id}`, label: `Stash ${WEAPONS[id].name}`, note: WEAPONS[id].mag ? `${prof.weapons[id]} rds` : '', wpn: WEAPONS[id].i });
          for (const [id, n] of Object.entries(st.items || {})) if (n > 0 && ITEMS[id]) opts.push({ id: `htk:${id}`, label: `Take ${ITEMS[id].name} x${n}`, note: 'stash' });
          for (const id of Object.keys(st.weapons || {})) if (WEAPONS[id]) opts.push({ id: `htw:${id}`, label: `Take ${WEAPONS[id].name}`, note: 'stash', wpn: WEAPONS[id].i });
        }
        opts.push({ id: 'hspawn', label: prof.spawnHome === h.id ? 'Respawn point: HERE' : 'Make this my respawn point', dis: prof.spawnHome === h.id });
        if (h.garage) prof.vehicles.forEach((ov, i) => { const d = VEHICLES[ov.model]; if (d && d.kind !== 'boat') opts.push({ id: `hcar:${i}`, label: inside ? `Garage: ${d.name}` : `Take out ${d.name}`, note: inside ? 'drive out' : 'garage' }); });
        if (h.dock) prof.vehicles.forEach((ov, i) => { const d = VEHICLES[ov.model]; if (d && d.kind === 'boat') opts.push({ id: `hboat:${i}`, label: inside ? `Boathouse: ${d.name}` : `Take out your ${d.name}`, note: inside ? 'head down to the dock' : 'boathouse' }); });
        if (!inside) opts.push({ id: 'hsell', label: `Sell (+$${Math.round(h.price * 0.6).toLocaleString()} to bank)` });
      }
      break;
    }
    case 'warehouse':
      sub = 'Haul a crate to a storefront. Cargo is visible - keep it safe from ambushes.';
      opts.push({ id: 'job:courier', label: p.job ? 'You already have a job' : 'Take a courier contract', dis: !!p.job });
      if (p.job) opts.push({ id: 'job:quit', label: 'Abandon current job' });
      break;
    case 'farm':
      sub = 'Load produce boxes into an open-cargo vehicle and haul them to FreshHub Grocery.';
      opts.push({ id: 'job:farm', label: p.job ? 'You already have a job' : 'Take a harvest contract (4 boxes)', dis: !!p.job });
      if (p.job) opts.push({ id: 'job:quit', label: 'Abandon current job' });
      title = poi.label;   // (the co-op's counter: seeds and what you grow - SHOPS.farm; farm work on the fields - farming.js)
      sub = 'Harvest contracts, farm work on the fields with the co-op tractor (paid by the row), seeds for your garden - and they buy what you grow. Horses to hire or buy, and yours saddled up.';
      if (!p.job) opts.push({ id: 'job:fieldwork', label: 'Farm work: the co-op tractor on the fields (paid by the row)' });
      if (!p.job && farming.anyRipe(world)) opts.push({ id: 'job:combine', label: 'Harvest: the co-op combine on the ripe rows (two at a time)' });
      opts.push(...horses.menuOpts(world, p, poi));   // (#325: hire one, buy one, saddle up yours - horses.js)
      break;
    case 'grocery':
      sub = 'Carry Produce Boxes to the front door to get paid. They buy what you grow in your garden, too.';
      opts.push({ id: 'close', label: 'OK' });
      break;
    case 'fence':
      sub = 'Carry contraband or stolen cargo to the door to sell it. No questions asked. Word is the mail train carries a strongbox...';
      opts.push({ id: 'trainjob', label: 'Job: rob the mail train', price: -TRAIN_JOB_PAY, dis: !!p.job, note: p.job ? 'busy' : 'when fenced' });
      if (p.job && p.job.type === 'trainjob') opts.push({ id: 'job:quit', label: 'Abandon current job' });
      break;
    case 'rental':
      sub = rentals.subFor(world, p, poi);
      opts.push(...rentals.menuOpts(world, p, poi));
      break;
    case 'station': {
      const b = trains.stationBoard(world, poi);
      title = b.title; sub = b.sub;
      opts.push({ id: 'close', label: 'OK' });
      break;
    }
    case 'gang':
      title = 'Syndicate HQ';
      if (!gang.isMember(p)) {
        sub = `Join the Syndicate: the turf leaves you alone, and the gate to the compound on Smuggler's Rock opens for you (boat only). Initiation $${GANG_JOIN_FEE}. Cops need not apply.`;
        opts.push({ id: 'gjoin', label: 'Join the Syndicate', price: GANG_JOIN_FEE, dis: p.badge, note: p.badge ? 'not while on duty' : '' });
      } else {
        sub = 'You\'re one of us. Work comes out of the Den on Smuggler\'s Rock - take a boat east across the bay.';
        opts.push({ id: 'gleave', label: 'Leave the Syndicate' });
      }
      break;
    case 'smuggler':
      if (!gang.isMember(p)) { title = "Smuggler's Den"; sub = '"Members only. Get off my rock."'; break; }
      sub = 'Hardware, and work nobody else will give you. Poached sea life is a felony if anyone sees you net it.';
      opts.push({ id: 'poach:turtle', label: 'Job: net a pod of sea turtles', price: -POACH_PAY.turtle, dis: !!p.job, note: p.job ? 'busy' : 'paid in cash' });
      opts.push({ id: 'poach:dolphin', label: 'Job: dolphin hunt', price: -POACH_PAY.dolphin, dis: !!p.job, note: p.job ? 'busy' : 'paid in cash' });
      break;
    case 'charter':
      sub += ` Deep water starts well away from land: sit still in a boat out there and fish over the side - the tuna and the billfish by day, the deep's strange ones after dark. A Big-Game Rod holds them.`;
      opts.unshift({ id: 'deepsea', label: `Deep-sea charter: land ${DEEPSEA_CATCH} offshore fish`, price: -DEEPSEA_PAY, dis: !!p.job, note: p.job ? 'busy' : 'bonus' });
      break;
    case 'barber':   // (the barbershops and the hair salons: map.js buildClothesShops, looks.js cut)
      title = poi.label;
      sub = poi.salon ? 'Cuts and colour, previewed on you before you pay.' : 'Cut, colour, beard and moustache, previewed on you before you pay.';
      opts.push({ id: 'chair', label: poi.salon ? 'Take a seat: cut or colour' : 'Take a seat: cut, colour, beard, moustache' });
      break;
    default: break;
  }
  // clothes to buy (task #364): every store that sells clothes has a fitting room (looks.js openShop)
  if (storeOf(poi) && kind !== 'barber') opts.unshift({ id: 'fit', label: 'The fitting room: try on and buy clothes' });
  hotmoney.menuOpts(world, p, poi, opts);   // the robbery bag: banked far from the robbery, stashed at home, fenced
  if (atmMore) opts.push({ id: 'atmfull', label: 'Use ATM', note: 'deposit or withdraw an amount' });
  if (!opts.length) opts.push({ id: 'close', label: 'Leave' });
  return { t: 'menu', poi: poi.id, title, sub, opts, cash: prof.cash, bank: prof.bank, interior };
}

const KIND_NAME = { farmhouse: 'farmhouse', cottage: 'coastal cottage', beach: 'beach house', mansion: 'mansion', house: 'house', apartment: 'apartment', shack: 'shack' };

// An apartment block's lobby (H65; server/systems/homes.js buildUnits): a row for each of its homes - yours (go in), for
// sale (look round, buy), someone else's (knock while they're in)
function lobbyOpts(world, p, us, opts) {
  for (const id of us) {
    const u = homes.homeById(world, id), o = world.homeOwner.get(id);
    if (!u) continue;
    const nm = `Unit ${u.unit || 1}`, what = unitWhat(u);
    if (o === p.pid) opts.push({ id: `hu:in:${id}`, label: `${nm} - yours: go in`, note: what });
    else if (o) {
      const prof = store.get(o), inNow = homeinside.someoneIn(world, u);
      opts.push({ id: `hu:knock:${id}`, label: `${nm} - ${prof && prof.name ? `${prof.name}'s` : 'taken'}${inNow ? ': knock' : ''}`, note: inNow ? 'they\'re in' : 'nobody in', dis: !inNow });
    } else {
      opts.push({ id: `hu:unit:${id}`, label: `${nm} for sale - look round or buy`, price: u.price, note: what });   // (H67: one row a flat - its own menu)
    }
  }
  // a home of yours in here: your cars come out at the building's parking out front
  if (us.some((id) => world.homeOwner.get(id) === p.pid)) p.profile.vehicles.forEach((ov, i) => { const d = VEHICLES[ov.model]; if (d && d.kind !== 'boat' && d.kind !== 'air') opts.push({ id: `hcar:${i}`, label: `Take out ${d.name}`, note: 'parking out front' }); });
}
// (H67) a flat in a block: what it is; for sale, its look round and its purchase (unit 1, the map's own home, keeps the
// options' old names) - the unit's own menu from the lobby's row, and still taken straight from the lobby
function unitWhat(u) { const beds = homeinside.bedsIn(u); return `${u.what || 'apartment'}, ${(u.floor || 1) > 1 ? `floor ${u.floor}` : 'ground floor'} · ${beds} bed${beds === 1 ? '' : 's'} · parks ${u.slots}`; }
function unitSaleOpts(u) {
  const one = u.lobby == null, nm = `Unit ${u.unit || 1}`;
  return [{ id: one ? 'htour' : `hu:tour:${u.id}`, label: `${nm} - take a look inside`, note: 'walk round it first' }, { id: one ? 'hbuy' : `hu:buy:${u.id}`, label: `Buy ${nm} (${u.what || 'apartment'})`, price: u.price }];
}
const NO_STASH = new Set(['fists', 'taser', 'baton', 'service']);

function ownedVehicleOpts(prof, opts, boats) {
  prof.vehicles.forEach((ov, i) => {
    const d = VEHICLES[ov.model];
    if (!d || (d.kind === 'boat') !== boats) return;
    opts.push({ id: `vg:${i}`, label: `Retrieve your ${d.name}`, note: 'owned' });
  });
}

function weaponPrice(id) {
  for (const s of Object.values(SHOPS)) for (const o of s.buy || []) if (o.kind === 'weapon' && o.id === id) return o.price;
  return 100;
}

function myVehicleNear(world, p, poi) {
  const v = world.get(p.lastVehicle);
  if (!v || v.wreckAt) return null;
  if (Math.hypot(v.x - poi.x, v.y - poi.y) > 320) return null;
  if (v.seats.some((s) => s && s !== p.ped.id)) return null;
  return v;
}

// (H67) the hardware store's furniture counter: the pieces for your home (shared/homedecor.js; prices in shared/rules.js
// DECOR), each delivered to your homes' storage (profile.furn) to place from the hall table's Decorate
function furnitureMenu(p, poi) {
  const prof = p.profile, furn = prof.furn || {}, none = !(prof.homes || []).length, opts = [];
  for (const k of DECOR_KINDS) {
    const P = DECOR_PIECES[k];
    opts.push({ id: `fb:${k}`, label: P.name, price: decorPrice(k), dis: none, note: `${P.cat}${P.w * P.h > 1 ? ` · ${P.w}x${P.h}` : ''}${furn[k] ? ` · ${furn[k]} in storage` : ''}` });
  }
  opts.push({ id: 'fback', label: 'Back to the hardware' });
  opts.push({ id: 'close', label: 'Close' });
  return { t: 'menu', poi: poi.id, title: 'Furniture & decor', sub: none ? 'Style your life - once you have a home to put it in.' : 'Style your life. Delivered to your home: place it from the hall table (Decorate).', opts, cash: prof.cash, bank: prof.bank };
}

export function openMenu(world, p, poi) {
  if (!p.conn) return;
  p.menu = { poi: poi.id };
  p.furnShop = null; p.lobbyUnit = null; p.atmFull = null;
  if (casino.isCasino(poi)) casino.open(world, p, poi);
  p.arcadePrizes = null;
  p.conn.sendJSON(buildMenu(world, p, poi));
}

export function handleMenu(world, p, poiId, optId) {
  if (homeinside.onMenu(world, p, poiId, String(optId || ''), execute)) return;   // (the bed, the safe, the fridge... at home: homeinside.js)
  const poi = world.map.pois[poiId];
  const ped = p.ped;
  if (!poi || !ped || ped.dead || ped.vehId) return;
  if (Math.hypot(ped.x - poi.x, ped.y - poi.y) > poi.r + 40) { world.notify(p, 'You walked away from the counter.', 'warn'); return; }
  const shut = !!(buildMenu(world, p, poi).opts.find((o) => o.id === optId) || {}).shut;   // (an option that closes its menu: the page closes it too)
  const err = execute(world, p, poi, String(optId || ''));
  if (err) world.notify(p, err, 'bad');
  if (optId === 'close' || shut) { p.furnShop = null; p.lobbyUnit = null; p.atmFull = null; }
  p.meDirty = true;
  if (!shut && !['close', 'hhide', 'hleave', 'armexit', 'sleave', 'htour'].includes(optId) && !optId.startsWith('hcargo') && !/^hu:(in|tour):/.test(optId) && p.conn) p.conn.sendJSON(buildMenu(world, p, poi));
}

function execute(world, p, poi, opt) {
  const prof = p.profile;
  const ped = p.ped;
  const parts = opt.split(':');
  let valid = buildMenu(world, p, poi).opts.find((o) => o.id === opt);
  if (!valid && poi.kind === 'home' && /^(htour|hbuy|hu:(tour|buy):)/.test(opt)) {   // (H67: a flat's look round or purchase, straight from its lobby)
    for (const id of homes.unitsAt(world, poi) || []) { const u = homes.homeById(world, id); if (u && !world.homeOwner.has(id)) valid = unitSaleOpts(u).find((o) => o.id === opt) || valid; }
  }
  if (!valid) return 'That option is not available here.';
  if (valid.dis) return 'Not available.';
  switch (parts[0]) {
    case 'close': return null;
    case 'wash': if (!pay(p, 6)) return 'Not enough money.'; world.notify(p, 'Forty minutes and a magazine later: your clothes come out clean and warm.', 'good'); return null;   // (a laundromat's machines)
    case 'furn': p.furnShop = poi.id; return null;   // (H67: the furniture counter - furnitureMenu)
    case 'fback': p.furnShop = null; return null;
    case 'fb': {
      const k = parts[1], P = DECOR_PIECES[k];
      if (!P) return 'Not sold here.';
      if (!(prof.homes || []).length) return 'You need a home to put it in - buy one first.';
      const cost = prof.coupon ? Math.round(decorPrice(k) * (1 - prof.coupon / 100)) : decorPrice(k);   // (H71: a coupon from the mail)
      if (!pay(p, cost)) return 'Not enough money.';
      if (prof.coupon) { world.notify(p, `Your coupon from the mail: ${prof.coupon}% off.`, 'good'); prof.coupon = 0; }
      prof.furn ||= {};
      prof.furn[k] = (prof.furn[k] || 0) + 1;
      mail.post(p, 'pkg', `Delivered from ${poi.kind === 'hardware' ? 'Nail & Gear Hardware' : poi.label}: ${/^[aeiou]/i.test(P.name) ? 'an' : 'a'} ${P.name.toLowerCase()}, in your home's storage.`);   // (H71: the package's note in your mailbox)
      store.touch();
      world.notify(p, `Bought ${/^[aeiou]/i.test(P.name) ? 'an' : 'a'} ${P.name.toLowerCase()} - delivered to your home's storage. Place it from the hall table: Decorate.`, 'good');
      return null;
    }
    case 'hot': return hotmoney.execute(world, p, poi, parts[1]);
    case 'cs': return casino.execute(world, p, poi, opt, pay);   // (a bet at a casino: casino.js)
    case 'ar': return arcade.execute(world, p, poi, opt, pay);   // (an arcade: arcade.js)
    case 'trainjob': return trains.startTrainJob(world, p);
    case 'w': {
      const id = parts[1], price = Number(parts[2]);
      if (!pay(p, price)) return 'Not enough money.';
      const w = WEAPONS[id];
      prof.weapons[id] = w.starter ?? (w.mag ? w.mag * 2 : 0);
      if (w.mag) ped.mag[id] = w.mag;
      combat.selectWeapon(world, ped, id);
      world.notify(p, `Bought ${w.name}.`, 'good');
      return null;
    }
    case 'a': {
      const id = parts[1], price = Number(parts[2]), qty = Number(parts[3]);
      if (prof.weapons[id] === undefined) return 'You need the weapon first.';
      if (!pay(p, price)) return 'Not enough money.';
      prof.weapons[id] += qty;
      return null;
    }
    case 'i': {
      const id = parts[1], price = Number(parts[2]), qty = Number(parts[3]);
      const it = ITEMS[id];
      if (it.tool && prof.inventory[id] > 0) return `You already have a ${it.name}.`; // tools are never used up: one is enough (checked before paying)
      if (!pay(p, price)) return 'Not enough money.';
      prof.inventory[id] = (prof.inventory[id] || 0) + qty;
      autoSlot(p, id);
      if (it.buff) world.notify(p, `${it.name} in your bag - drink it from the quick wheel (${'X / View / ITEMS'}).`, 'good');
      if (it.light) world.notify(p, `${it.name} in your bag - press L to switch it on and off (or use it from the bag). It doesn't take a hand: you keep your weapon.`, 'good');
      if (it.board) world.notify(p, `${it.name} in your bag - hop on with the vehicle button (F / X / CAR) where there's no car to get into, or use it from the bag. Ride it on roads, pavements and plazas.`, 'good');
      store.touch();
      return null;
    }
    case 'craft': return craft(world, p, parts[1]);
    case 's': {
      const id = parts[1];
      const n = prof.inventory[id] || 0;
      if (n <= 0) return 'Nothing to sell.';
      const gain = sellPrice(SHOPS[poi.kind === 'vending' ? 'vending' : poi.kind], id) * n;
      prof.inventory[id] = 0;
      prof.bank += gain; // shop sales are paid straight into the bank
      world.notify(p, `Sold ${n}x ${ITEMS[id].name}: $${gain} deposited to your bank.`, 'good');
      store.touch();
      return null;
    }
    case 'sw': {
      const id = parts[1];
      if (prof.weapons[id] === undefined || id === 'fists') return 'You do not have that.';
      const gain = Math.round(weaponPrice(id) * 0.4);
      delete prof.weapons[id];
      delete ped.mag[id];
      if (ped.weapon === id) ped.weapon = 'fists';
      prof.bank += gain;
      world.notify(p, `Sold the ${WEAPONS[id].name}: $${gain} deposited to your bank.`, 'good');
      store.touch();
      return null;
    }
    case 'atmfull': p.atmFull = poi.id; return null;   // (the ATM's full menu: amounts to deposit and withdraw)
    case 'dep': {
      const amt = parts[1] === 'all' ? prof.cash : Number(parts[1]);
      if (amt <= 0 || prof.cash < amt) return 'Not enough cash on you.';
      prof.cash -= amt; prof.bank += amt; store.touch();
      if (poi.kind === 'atm') world.emit(poi.x, poi.y, { e: 'deposit', x: poi.x, y: poi.y, n: amt });   // (the machine's whirr)
      world.notify(p, `${poi.kind === 'atm' ? 'ATM: deposited' : 'Deposited'} $${amt.toLocaleString()} - bank $${prof.bank.toLocaleString()}.`, 'good');
      return null;
    }
    case 'wd': {
      const amt = Number(parts[1]);
      if (prof.bank < amt) return 'Insufficient funds.';
      prof.bank -= amt; prof.cash += amt; store.touch();
      return null;
    }
    case 'heal': {
      if (!pay(p, HOSPITAL_FEE)) return 'You cannot afford treatment.';
      ped.hp = ped.maxHp; ped.bleeding = false;
      world.notify(p, 'Patched up. Good as new.', 'good');
      return null;
    }
    case 'duty': {
      if (parts[1] === 'on') {
        const e = law.goOnDuty(world, p);
        if (e) return e;
        station.toArmory(world, p, poi);
        world.notify(p, 'Sworn in! Badge, uniform, taser, nightstick and service pistol issued. You\'re in the armory - pick a weapon, then out back to the motor pool.', 'good');
      } else {
        law.goOffDuty(world, p); // the cruiser system returns the car to the pool
        world.notify(p, 'Off duty.', 'info');
      }
      return null;
    }
    case 'armgo': return station.toArmory(world, p, poi);
    case 'gjoin': return gang.join(world, p, pay);
    case 'gleave': return gang.leave(world, p);
    case 'poach': return jobs.startPoach(world, p, poi, parts[1]);
    case 'deepsea': return jobs.startDeepSea(world, p, poi);
    case 'arm': return station.takeWeapon(world, p, parts[1]);
    case 'armexit': station.toMotorPool(world, p); return null;
    case 'sleave': station.leave(world, p); return null;
    case 'payrecord': {
      const n = prof.felonies || 0;
      if (n <= 0) return 'Your record is already clean.';
      if (p.wanted > 0) return 'Turn yourself in first - you are wanted right now.';
      if (!pay(p, n * FELONY_FINE)) return `You need $${n * FELONY_FINE} (cash or bank).`;
      prof.felonies = 0; prof.peakWanted = 0;
      world.notify(p, `Fines paid: $${n * FELONY_FINE}. Your record is clean.`, 'good');
      p.meDirty = true;
      store.touch();
      return null;
    }
    case 'bait': {
      if (parts[1] === 'auto') { prof.bait = null; world.notify(p, 'You\'ll put on whichever bait suits the water.', 'info'); return null; }
      if (!ITEMS[parts[1]] || !ITEMS[parts[1]].bait) return 'Not bait.';
      prof.bait = parts[1]; world.notify(p, `You'll fish with ${ITEMS[parts[1]].name} while you have it.`, 'info'); return null;
    }
    case 'creel': return fishing.sellCatch(world, p, poi.kind);
    case 'armory': return law.restockService(world, p);
    case 'cruiser': {
      if (!p.badge) return 'On-duty officers only.';
      const lot = poi.spawnLot || { x: poi.x, y: poi.y + 80, a: 0 };
      cruiser.issueAt(world, p, lot.x, lot.y, lot.a);
      world.notify(p, 'Interceptor waiting in the HQ lot - follow the arrow. H toggles the siren.', 'good');
      return null;
    }
    case 'hunter': {
      if (parts[1] === 'on') { const e = law.registerHunter(world, p); if (e) return e; world.notify(p, 'Licensed. Take contracts in the Bounties app on your phone: their targets show as rough pings on your radar.', 'good'); }
      else { p.hunter = false; }
      return null;
    }
    case 'bounty': return bounties.place(world, p, parts[1], Number(parts[2]));
    case 'outfit': {
      const blocked = disguiseBlocked(world, p);
      if (blocked) return blocked;
      if (!pay(p, 120)) return 'Not enough money.';
      looks.wear(world, p, looks.freshOutfit(prof, rng() * 4294967296), true);   // (a new outfit, yours to keep; body, face and hair kept)
      applyDisguise(world, p);
      return null;
    }
    case 'respray': case 'wash': case 'repair': {
      const v = myVehicleNear(world, p, poi);
      if (!v) return 'Bring your vehicle onto the lot first.';
      if (parts[0] === 'respray') {
        if (v.def.horse) return "We don't paint horses.";   // (its coat is its own: horses.js)
        if (v.cargo.some((c) => c)) return 'Unload the cargo first - we do not respray loaded vehicles.';
        const blocked = disguiseBlocked(world, p);
        if (blocked) return blocked;
        if (!pay(p, 250)) return 'Not enough money.';
        respray(v, rng);
        applyDisguise(world, p);
      } else if (parts[0] === 'wash') {
        if (!pay(p, 20)) return 'Not enough money.';
        v.bloody = false;
        world.notify(p, 'Squeaky clean.', 'good');
      } else {
        if (!pay(p, 300)) return 'Not enough money.';
        v.hp = v.def.hp; v.burnUntil = 0; v.flat = false; v.dead = false; v.deadBoomAt = 0; v.deadFireAt = 0;
        v.dz = 0; v.zh = null; v.holes = 0; v.off = 0; v.dst = 0; v.plasmaHits = 0;   // (the dents beaten out, the holes filled, new parts: task #402)
        world.notify(p, 'Body work done (and new tyres).', 'good');
      }
      return null;
    }
    case 'vb': {
      const d = VEHICLES[parts[1]];
      if (!d || !d.price) return 'Not for sale.';
      if (prof.vehicles.length >= homes.garageCap(world, prof)) return `Garage full (${prof.vehicles.length}/${homes.garageCap(world, prof)}). Buy a home for more garage space.`;
      if (!pay(p, d.price)) return 'Not enough money (cash + bank).';
      prof.vehicles.push({ model: parts[1], paint: Math.floor(rng() * PAINTS.length) });
      store.touch();
      world.notify(p, `You bought a ${d.name}! It is waiting for you outside.`, 'good');
      spawnOwned(world, p, poi, prof.vehicles.length - 1);
      return null;
    }
    case 'vg': return spawnOwned(world, p, poi, Number(parts[1]));
    case 'rent': return rentals.rent(world, p, poi, parts[1], pay);
    case 'rentback': return rentals.giveBack(world, p);
    case 'horse': return parts[1] === 'hire' ? horses.hire(world, p, poi, pay) : parts[1] === 'back' ? horses.giveBack(world, p) : parts[1] === 'buy' ? horses.buy(world, p, poi, Number(parts[2]) | 0, pay) : 'No such thing.';
    case 'hboat': {
      const h = homes.homeFor(world, p, poi);
      if (!h.dock) return 'This place has no boat dock.';
      return homes.boatOut(world, p, h, Number(parts[1]));
    }
    case 'hbuy': return homes.buy(world, p, homes.homeFor(world, p, poi), pay);
    case 'htour': return homeinside.tour(world, p, homes.homeFor(world, p, poi));   // a look round before you buy (H65: homeinside.js)
    case 'hmort': return mortgage.buyWith(world, p, homes.homeFor(world, p, poi), pay);   // a deposit down, the rest paid a day at a time (H65)
    case 'hu': {   // an apartment block's lobby: a unit - yours to go in, for sale to look round or buy, someone's to knock at
      if (parts[1] === 'back') { p.lobbyUnit = null; return null; }
      const us = homes.unitsAt(world, poi), u = homes.homeById(world, parts[2]);
      if (parts[1] === 'unit') { if (!us || !u || !us.includes(u.id)) return 'No such home in this building.'; p.lobbyUnit = u.id; return null; }   // (H67: its own menu)
      if (!us || !u || !us.includes(u.id)) return 'No such home in this building.';
      if (parts[1] === 'in') { homeinside.goIn(world, p, u); return null; }   // (goIn says why not itself)
      if (parts[1] === 'tour') return homeinside.tour(world, p, u);
      if (parts[1] === 'buy') return homes.buy(world, p, u, pay);
      if (parts[1] === 'knock') return homeinside.knockAt(world, p, u);
      return 'Unknown option.';
    }
    case 'hsell': return homes.sell(world, p, homes.homeFor(world, p, poi));
    case 'hspawn': { const hid = homes.homeFor(world, p, poi).id; prof.spawnHome = hid; prof.lastSpawn = `home:${hid}`; store.touch(); world.notify(p, 'You will wake up here after you die.', 'good'); return null; }
    case 'hrest': { ped.hp = ped.maxHp; ped.bleeding = false; ped.stamina = skills.staminaFull(world, ped); world.emit(ped.x, ped.y, { e: 'heal', x: ped.x, y: ped.y }); world.notify(p, 'You rested up. Full health.', 'good'); return null; }
    case 'hhide': return homes.beginEnter(world, p, homes.homeFor(world, p, poi));
    case 'hleave': homes.leaveHome(world, p); return null;
    case 'hst': case 'htk': {
      const id = parts[1];
      const st = (prof.stash ||= { items: {}, weapons: {} }); st.items ||= {};
      const [from, to] = parts[0] === 'hst' ? [prof.inventory, st.items] : [st.items, prof.inventory];
      const n = from[id] || 0;
      if (n <= 0) return 'Nothing there.';
      from[id] = 0; to[id] = (to[id] || 0) + n;
      if (parts[0] === 'hst' && prof.bait === id) prof.bait = null;
      store.touch();
      world.notify(p, parts[0] === 'hst' ? `Stashed ${n}x ${ITEMS[id].name}.` : `Took ${n}x ${ITEMS[id].name}.`, 'good');
      return null;
    }
    case 'hsw': {
      const id = parts[1];
      if (prof.weapons[id] === undefined || NO_STASH.has(id)) return 'You do not have that.';
      const st = (prof.stash ||= { items: {}, weapons: {} }); st.weapons ||= {};
      st.weapons[id] = (st.weapons[id] || 0) + (prof.weapons[id] || 0) + (ped.mag[id] || 0);
      delete prof.weapons[id]; delete ped.mag[id];
      if (ped.weapon === id) ped.weapon = 'fists';
      store.touch();
      world.notify(p, `Stashed the ${WEAPONS[id].name}.`, 'good');
      return null;
    }
    case 'htw': {
      const id = parts[1];
      const st = prof.stash || {};
      if (!st.weapons || st.weapons[id] === undefined) return 'Not in your stash.';
      const rounds = st.weapons[id];
      delete st.weapons[id];
      const w = WEAPONS[id];
      if (w.mag) { const inMag = Math.min(w.mag, rounds); ped.mag[id] = Math.max(ped.mag[id] || 0, inMag); prof.weapons[id] = (prof.weapons[id] || 0) + rounds - inMag; }
      else prof.weapons[id] = prof.weapons[id] || 0;
      store.touch();
      world.notify(p, `Took the ${w.name}.`, 'good');
      return null;
    }
    case 'hcarno': p.pendingCar = null; return null;
    case 'hcargo': {
      const h = homes.homeFor(world, p, poi);
      const idx = Number(parts[1]);
      p.pendingCar = null;
      if (!ped.hidden || !h.garage) return 'Not right now.';
      return homes.driveOut(world, p, h, idx);
    }
    case 'fit': case 'chair': return looks.openShop(world, p, poi);   // the fitting room, the barber's chair
    case 'hlooks': case 'hmirror': {   // the quick-change wheel or the whole creator, at home: changing here counts as unseen
      p.lookHomeAt = world.time;
      if (p.conn) p.conn.sendJSON({ ...looks.stateMsg(p, world), open: parts[0] === 'hlooks' ? 'wheel' : 'edit' });
      return null;
    }
    case 'houtfit': {
      if (p.badge) return 'Hand in the uniform (go off duty) first.';
      looks.wear(world, p, looks.freshOutfit(prof, rng() * 4294967296, true));   // (from your own wardrobe)
      if (ped.hidden) applyDisguise(world, p); // nobody saw you change
      world.notify(p, 'New outfit on.', 'good');
      return null;
    }
    case 'hcar': {
      const h = homes.homeFor(world, p, poi);
      if (!h.garage) return 'This place has no garage.';
      if (ped.hidden) { p.pendingCar = Number(parts[1]); return null; } // inside: confirm first
      const e = homes.spawnOwnedAt(world, p, Number(parts[1]), { ...h.garage, home: h.id });
      if (!e) world.notify(p, 'Your ride is in the driveway.', 'good');
      return e;
    }
    case 'job': {
      if (parts[1] === 'quit') { jobs.failJob(world, p, 'Job abandoned.'); return null; }
      if (p.job) return 'Finish your current job first.';
      if (parts[1] === 'fieldwork' || parts[1] === 'combine') return farming.startWork(world, p, poi, parts[1] === 'combine' ? 'combine' : 'tractor');   // (the tractor, the combine on the fields: farming.js)
      return parts[1] === 'courier' ? jobs.startCourier(world, p, poi) : jobs.startFarm(world, p, poi);
    }
    default: return 'Unknown option.';
  }
}

function spawnOwned(world, p, poi, idx) {
  const ov = p.profile.vehicles[idx];
  if (!ov) return 'No such vehicle.';
  let spot;
  if (VEHICLES[ov.model].kind === 'boat') {
    let best = null, bd = Infinity;
    for (const m of world.map.marina) { const dd = Math.hypot(m.x - poi.x, m.y - poi.y); if (dd < bd) { bd = dd; best = m; } }
    spot = best;
  } else if (VEHICLES[ov.model].horse) spot = horses.spotAt(world, poi);   // (a horse: brought round onto open ground)
  else spot = poi.spawnLot || { x: poi.x, y: poi.y + 90, a: -Math.PI / 2 };
  return homes.spawnOwnedAt(world, p, idx, spot);
}

function disguiseBlocked(world, p) {
  if (p.wanted > 0 && world.time - p.seenAt < 3) return 'Cops have eyes on you - lose them before changing your look!';
  return null;
}

export function applyDisguise(world, p) {
  const prof = p.profile;
  if (p.wanted > 0) {
    prof.peakWanted = Math.max(prof.peakWanted, p.wanted);
    prof.peakWantedAt = Date.now();
    law.clearWanted(world, p);
    p.disguised = true;
    world.notify(p, `Disguised. Public wanted level dropped to 0 - but your ${prof.peakWanted}-star peak is on file. Stay clean.`, 'good');
  } else if (prof.peakWanted > 0) {
    p.disguised = true;
    world.notify(p, 'New look. Your past record is still on file.', 'info');
  } else world.notify(p, 'Looking sharp.', 'good');
  store.touch();
}

export function applyBuff(world, ped, buff) {
  if (buff === 'coffee') { ped.buffs.coffee = world.time + 60; ped.stamina = skills.staminaFull(world, ped); }
  if (buff === 'energy') { ped.buffs.energy = world.time + 60; ped.stamina = skills.staminaFull(world, ped); }   // (a full tank: with the stamina skill, more - skills.js)
  if (buff === 'wine') ped.buffs.wine = world.time + WINE_S;   // (combat.js: health comes back faster)
  if (buff === 'scent') ped.buffs.scent = world.time + SCENT_S;   // (wildlife.js: no animal smells you)
  // a hearty meal (cooked big game): more health while it lasts - topped up, not stacked (heartyEnd puts it back)
  if (buff === 'hearty') {
    if (!(ped.buffs.hearty > world.time)) { ped.baseHp = ped.baseHp || ped.maxHp; ped.maxHp = ped.baseHp + HEARTY_HP; ped.hp += HEARTY_HP; }
    ped.buffs.hearty = world.time + HEARTY_S;
  }
}
// the hearty meal wears off: back to your usual health
function heartyEnd(world) {
  const now = world.time;
  for (const p of world.players.values()) {
    const ped = p.ped;
    if (!ped || !ped.buffs.hearty || ped.buffs.hearty > now) continue;
    delete ped.buffs.hearty;
    ped.maxHp = ped.baseHp || 100;
    ped.hp = Math.min(ped.hp, ped.maxHp);
    p.meDirty = true;
  }
}

// The quick bar: four slots of usable items (a flashlight there switches it on and off). A newly bought
// usable item fills the first empty slot.
export const QUICK_SLOTS = 4;
export const USABLE = (id) => { const it = ITEMS[id]; return !!(it && (it.heal || it.buff || it.light)); };
export function quickSlots(p) {
  const prof = p.profile;
  if (!Array.isArray(prof.quick)) prof.quick = ['medkit', 'bandage', 'energy', 'coffee'];
  while (prof.quick.length < QUICK_SLOTS) prof.quick.push(null);
  return prof.quick;
}
function autoSlot(p, id) {
  if (!USABLE(id)) return;
  const q = quickSlots(p);
  if (q.includes(id)) return;
  const i = q.indexOf(null);
  if (i >= 0) q[i] = id;
}
export function setQuick(p, i, id) {
  const q = quickSlots(p);
  if (!(i >= 0 && i < QUICK_SLOTS)) return;
  if (id !== null && !USABLE(id)) return;
  if (id !== null) { const j = q.indexOf(id); if (j >= 0) q[j] = q[i]; } // assigning an item that's in another slot swaps them
  q[i] = id;
  p.meDirty = true;
  store.touch();
}

// The lights (server/systems/lights.js, task #359): the flashlight, the headlamp, the hard hat's lamp, the lantern and
// the heavy flashlight are switched on and off with L / D-pad up / the touch button, from the bag or the quick wheel.
// profile.light is the switch; the light shines while it's on and you still have one (syncLight, every tick). Other
// players see it through the spawn descriptor (net.js: fl, the light's code).
export function toggleLight(world, p, on) { return lights.toggle(world, p, on); }
export function syncLight(world, p) { lights.sync(world, p); }

// Use one of an item from the bag: med kits and bandages heal, drinks give their boost; the flashlight
// switches on or off.
export function useItem(world, p, id) {
  const ped = p.ped, inv = p.profile.inventory, it = ITEMS[id];
  if (!ped || ped.dead || !it) return;
  if ((inv[id] || 0) <= 0) { world.notify(p, `No ${it.name} left.`, 'warn'); return; }
  if (it.light) { lights.use(world, p, id); return; }   // (a light: chosen and switched on; a flare or a glow stick lit and dropped)
  if (it.board) { skate.toggle(world, p); return; }   // (the skateboard: on it where you stand, or off - skate.js)
  if (it.tool) { world.notify(p, id === 'revivekit' ? 'The Revive Kit is for someone else: stand over a downed player and hold the action button.' : `${it.name} isn't used like that.`, 'info'); return; }
  if (it.heal) {
    if (ped.hp >= ped.maxHp && (it.food || !ped.bleeding) && !(it.hearty && !(ped.buffs.hearty > world.time + HEARTY_S * 0.5))) { world.notify(p, it.food ? 'You\'re not hungry - you\'re at full health.' : 'You are already healthy.', 'info'); return; }
    inv[id]--;
    if (it.hearty) applyBuff(world, ped, 'hearty');
    if (it.cooked) skills.gain(world, p, 'meal');   // (a cooked meal: constitution - skills.js)
    ped.hp = Math.min(ped.maxHp, ped.hp + it.heal); if (it.stopBleed) ped.bleeding = false;   // (food doesn't stop bleeding)
    world.emit(ped.x, ped.y, { e: 'heal', x: ped.x, y: ped.y });
    world.notify(p, it.food ? `Ate a ${it.name.replace(/^Bunch of /, 'bunch of ')}.${it.hearty ? ` A hearty meal: +${HEARTY_HP} health for ${Math.round(HEARTY_S / 60)} minutes.` : ''}` : `Used ${it.name}.`, 'good');
  } else if (it.buff) {
    inv[id]--;
    applyBuff(world, ped, it.buff);
    world.notify(p, it.buff === 'wine' ? `${it.name}: a glass or two - you heal faster for ${Math.round(WINE_S / 60)} minutes.` : it.buff === 'scent' ? `${it.name}: no animal will smell you for ${Math.round(SCENT_S / 60)} minutes, whatever the wind.` : `${it.name}: ${it.buff === 'coffee' ? 'stamina refilled, faster recovery' : 'more stamina + speed boost'} for 60s.`, 'good');
  } else { world.notify(p, `You can't use ${it.name}.`, 'info'); return; }
  p.meDirty = true;
  store.touch();
}

export function useHealItem(world, p) {
  const ped = p.ped;
  const inv = p.profile.inventory;
  if (!ped || ped.dead) return;
  if (ped.hp >= ped.maxHp && !ped.bleeding) { world.notify(p, 'You are already healthy.', 'info'); return; }
  let use = null;
  if ((inv.medkit || 0) > 0 && (ped.hp < ped.maxHp * 0.6 || !(inv.bandage > 0))) use = 'medkit';
  else if ((inv.bandage || 0) > 0) use = 'bandage';
  if (!use) { world.notify(p, 'No medical supplies. Pharmacies sell kits and bandages.', 'warn'); return; }
  inv[use]--;
  const it = ITEMS[use];
  ped.hp = Math.min(ped.maxHp, ped.hp + it.heal);
  ped.bleeding = false;
  world.emit(ped.x, ped.y, { e: 'heal', x: ped.x, y: ped.y });
  world.notify(p, `Used ${it.name}.`, 'good');
  p.meDirty = true;
  store.touch();
}

export function update(world) {
  if (world.tick % 5 !== 0) return;
  const now = world.time;
  heartyEnd(world);
  for (const poi of world.map.pois) {
    if (poi.kind !== 'reception') continue;
    for (const p of world.players.values()) {
      const ped = p.ped;
      if (!ped || ped.dead || ped.vehId) continue;
      if (Math.hypot(ped.x - poi.x, ped.y - poi.y) > poi.r) continue;
      if (ped.hp >= ped.maxHp && !ped.bleeding) continue;
      if (now - p.lastHealAt < 5) continue;
      p.lastHealAt = now;
      if (!pay(p, HOSPITAL_FEE)) { world.notify(p, `ER treatment costs $${HOSPITAL_FEE}.`, 'warn'); continue; }
      ped.hp = ped.maxHp; ped.bleeding = false;
      world.emit(ped.x, ped.y, { e: 'heal', x: ped.x, y: ped.y });
      world.notify(p, `ER reception: fully healed for $${HOSPITAL_FEE}.`, 'good');
    }
  }
}

homes.setMenuBuilder(buildMenu);
station.setMenuBuilder(buildMenu);
