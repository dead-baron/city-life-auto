// Map commerce economy (GDD §11): storefront menus, bank/ATM, hospital reception,
// pharmacy/coffee/vending buffs, weapon/pawn/black-market shops, dealership + owned
// vehicles, Fresh Coat garage (respray / wash / repair / disguise), clothing disguises,
// police HQ badge desk and the courthouse bounty office.
import { K } from '../../shared/constants.js';
import { WEAPONS, ITEMS, SHOPS, CRAFTS, MATERIAL_NAME, materialIds } from '../../shared/items.js';
import { VEHICLES, PAINTS, respray } from '../../shared/vehicles.js';
import { mulberry32 } from '../../shared/rng.js';
import * as looks from './looks.js';
import { store } from '../store.js';
import * as law from './law.js';
import * as bounties from './bounties.js';
import * as jobs from './jobs.js';
import * as combat from './combat.js';
import * as homes from './homes.js';
import * as station from './station.js';
import * as gang from './gang.js';
import * as cruiser from './cruiser.js';
import * as trains from './trains.js';
import * as rentals from './rentals.js';
import * as hotmoney from './hotmoney.js';

import { REVIVE_KIT_PRICE, ATM_DEPOSIT_PX, HOSPITAL_FEE, FELONY_FINE, HIDE_TIME_S, POLICE_ARMORY, GANG_JOIN_FEE, POACH_PAY, DEEPSEA_CATCH, DEEPSEA_PAY, TRAIN_JOB_PAY, FLASHLIGHT_PRICE, WINE_S, HEARTY_HP, HEARTY_S, SCENT_S } from '../../shared/rules.js';
const rng = mulberry32(77);

export function poiLabel(world, p, poi) {
  switch (poi.kind) {
    case 'delivery': case 'evidence': case 'reception': case 'paint': case 'ride': case 'race': return null;   // (a ride's boarding point: server/systems/rides.js; a race's start: races.js)
    case 'gang': return gang.isMember(p) ? 'Syndicate HQ (members)' : 'Syndicate HQ (join the gang)';
    case 'smuggler': return "Smuggler's Den";
    case 'charter': return 'Charter desk (deep-sea fishing)';
    case 'station': { const eta = trains.nextTrainIn(world, poi.station); return eta < 1 ? `${poi.label} - train in! Walk up to the doors` : `${poi.label} - next train ${Math.round(eta)}s (timetable)`; }
    case 'home': {
      const h = world.map.homes[poi.home];
      const owner = world.homeOwner.get(h.id);
      if (owner === p.pid) return `Your ${h.kind} (rest, garage, spawn)`;
      if (owner) return null;
      return `For sale: ${h.name} - $${h.price.toLocaleString()}`;
    }
    case 'atm': return 'Use ATM';
    case 'club': return `Bar - ${poi.label}`;
    case 'vending': return 'Buy an Energy Drink';
    case 'police': return p.badge ? 'Front desk (armory, motor pool, off duty)' : 'Front desk (join the police)';
    case 'courthouse': return 'Courthouse desk (bounties, fines)';
    case 'hospital': return 'Hospital front desk';
    case 'bank': return 'Bank teller';
    case 'pawn': return 'Pawn window';
    case 'farm': return 'Farm Co-op (harvest contracts)';
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
  clubhouse: { label: (l) => `${l} - the bar`, title: (l) => SHOPS.clubhouse.title, sub: 'Members and guests welcome. Cocktails, coffee, a fine red and a hot dog at the turn.' },
  farmstand: { label: (l) => `${l} - farm stand (honey)`, title: (l) => SHOPS.farmstand.title, sub: 'Lavender honey from the hives at the end of the rows, and fresh lemonade. They buy honey back.' },
  salvage: { label: (l) => `${l} - yard office (buys scrap)`, title: (l) => SHOPS.salvage.title, sub: 'The foreman buys component scrap for more than the pawn shop pays. Bring it to the window.' },
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
  const prof = p.profile;
  const ped = () => p.ped;
  const kind = poi.kind;
  const opts = [];
  let title = poi.label, sub = '', interior = null;
  const shopKey = kind === 'vending' ? 'vending' : kind;
  const shop = kind === 'smuggler' && !gang.isMember(p) ? null : SHOPS[shopKey];
  if (shop && kind !== 'dealer' && kind !== 'marina' && kind !== 'garage' && kind !== 'clothing') {
    title = kind === 'gunshop' ? poi.label : shop.title;   // (the gun shops round the world: each its own name)
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
    if (kind === 'club') {
      title = poi.label;
      sub = 'The bar. A cocktail fills your stamina past full for a minute. Open from dusk till dawn.';
    }
    if (kind === 'tackle') {
      sub = 'Bait changes what bites: worms for bass, shrimp for salmon, squid for tuna, a glow lure for catfish at night.';
      for (const id of ['worms', 'shrimp', 'squid', 'glowlure', 'lure']) if ((prof.inventory[id] || 0) > 0) opts.push({ id: `bait:${id}`, label: `Fish with ${ITEMS[id].name}`, note: prof.bait === id ? 'selected' : `have ${prof.inventory[id]}`, dis: prof.bait === id });
    }
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
  switch (kind) {
    case 'bank': case 'atm':
      title = kind === 'bank' ? 'First Pixel Bank' : 'ATM';
      sub = `Wallet $${prof.cash} - Bank $${prof.bank}. Banked money is safe when you die.`;
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
      title = SHOPS.clothing.title;
      sub = 'A fresh outfit drops your public wanted level to 0 (if no cop is watching). Your peak record is remembered. They buy handmade furs and buckskin.';
      opts.push({ id: 'outfit', label: 'Buy a new outfit', price: 120, dis: p.badge, note: p.badge ? 'off duty only' : '' });
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
      const h = world.map.homes[poi.home];
      const mine = world.homeOwner.get(h.id) === p.pid;
      const inside = !!(ped() && ped().hidden && ped().inside === h.id);
      title = inside ? `${h.name} - inside` : h.name;
      if (!mine) {
        sub = `A ${h.dock ? 'waterfront ' : ''}${KIND_NAME[h.kind] || h.kind} with a ${h.slots}-car garage${h.dock ? ' and its own boat dock and boathouse' : ''}. Own as many homes as you like: each one is a respawn point, a safe place to hide and stash things, and adds garage space you can reach from any of your homes.`;
        opts.push({ id: 'hbuy', label: `Buy this ${KIND_NAME[h.kind] || h.kind}`, price: h.price });
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
      break;
    case 'grocery':
      sub = 'Carry Produce Boxes to the front door to get paid.';
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
      sub += ` Deep water starts well away from land: sit still in a boat out there and fish over the side. Squid brings in the marlin.`;
      opts.unshift({ id: 'deepsea', label: `Deep-sea charter: land ${DEEPSEA_CATCH} offshore fish`, price: -DEEPSEA_PAY, dis: !!p.job, note: p.job ? 'busy' : 'bonus' });
      break;
    default: break;
  }
  hotmoney.menuOpts(world, p, poi, opts);   // the robbery bag: banked far from the robbery, stashed at home, fenced
  if (!opts.length) opts.push({ id: 'close', label: 'Leave' });
  return { t: 'menu', poi: poi.id, title, sub, opts, cash: prof.cash, bank: prof.bank, interior };
}

const KIND_NAME = { farmhouse: 'farmhouse', cottage: 'coastal cottage', beach: 'beach house', mansion: 'mansion', house: 'house', apartment: 'apartment', shack: 'shack' };
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

export function openMenu(world, p, poi) {
  if (!p.conn) return;
  p.menu = { poi: poi.id };
  p.conn.sendJSON(buildMenu(world, p, poi));
}

export function handleMenu(world, p, poiId, optId) {
  const poi = world.map.pois[poiId];
  const ped = p.ped;
  if (!poi || !ped || ped.dead || ped.vehId) return;
  if (Math.hypot(ped.x - poi.x, ped.y - poi.y) > poi.r + 40) { world.notify(p, 'You walked away from the counter.', 'warn'); return; }
  const err = execute(world, p, poi, String(optId || ''));
  if (err) world.notify(p, err, 'bad');
  p.meDirty = true;
  if (!['close', 'hhide', 'hleave', 'armexit', 'sleave'].includes(optId) && !optId.startsWith('hcargo') && p.conn) p.conn.sendJSON(buildMenu(world, p, poi));
}

function execute(world, p, poi, opt) {
  const prof = p.profile;
  const ped = p.ped;
  const parts = opt.split(':');
  const valid = buildMenu(world, p, poi).opts.find((o) => o.id === opt);
  if (!valid) return 'That option is not available here.';
  if (valid.dis) return 'Not available.';
  switch (parts[0]) {
    case 'close': return null;
    case 'hot': return hotmoney.execute(world, p, poi, parts[1]);
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
    case 'dep': {
      const amt = parts[1] === 'all' ? prof.cash : Number(parts[1]);
      if (amt <= 0 || prof.cash < amt) return 'Not enough cash on you.';
      prof.cash -= amt; prof.bank += amt; store.touch();
      world.notify(p, `Deposited $${amt}.`, 'good');
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
    case 'bait': { if (!ITEMS[parts[1]] || !ITEMS[parts[1]].bait) return 'Not bait.'; prof.bait = parts[1]; world.notify(p, `You'll fish with ${ITEMS[parts[1]].name} while you have it.`, 'info'); return null; }
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
      looks.wear(world, p, looks.freshOutfit(prof, rng() * 4294967296));   // (a new outfit; body, face and hair kept)
      applyDisguise(world, p);
      return null;
    }
    case 'respray': case 'wash': case 'repair': {
      const v = myVehicleNear(world, p, poi);
      if (!v) return 'Bring your vehicle onto the lot first.';
      if (parts[0] === 'respray') {
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
    case 'hboat': {
      const h = world.map.homes[poi.home];
      if (!h.dock) return 'This place has no boat dock.';
      return homes.boatOut(world, p, h, Number(parts[1]));
    }
    case 'hbuy': return homes.buy(world, p, world.map.homes[poi.home], pay);
    case 'hsell': return homes.sell(world, p, world.map.homes[poi.home]);
    case 'hspawn': { prof.spawnHome = poi.home; prof.lastSpawn = `home:${poi.home}`; store.touch(); world.notify(p, 'You will wake up here after you die.', 'good'); return null; }
    case 'hrest': { ped.hp = ped.maxHp; ped.bleeding = false; ped.stamina = 100; world.emit(ped.x, ped.y, { e: 'heal', x: ped.x, y: ped.y }); world.notify(p, 'You rested up. Full health.', 'good'); return null; }
    case 'hhide': return homes.beginEnter(world, p, world.map.homes[poi.home]);
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
      const h = world.map.homes[poi.home];
      const idx = Number(parts[1]);
      p.pendingCar = null;
      if (!ped.hidden || !h.garage) return 'Not right now.';
      return homes.driveOut(world, p, h, idx);
    }
    case 'hlooks': case 'hmirror': {   // the quick-change wheel or the whole creator, at home: changing here counts as unseen
      p.lookHomeAt = world.time;
      if (p.conn) p.conn.sendJSON({ ...looks.stateMsg(p), open: parts[0] === 'hlooks' ? 'wheel' : 'edit' });
      return null;
    }
    case 'houtfit': {
      if (p.badge) return 'Hand in the uniform (go off duty) first.';
      looks.wear(world, p, looks.freshOutfit(prof, rng() * 4294967296));
      if (ped.hidden) applyDisguise(world, p); // nobody saw you change
      world.notify(p, 'New outfit on.', 'good');
      return null;
    }
    case 'hcar': {
      const h = world.map.homes[poi.home];
      if (!h.garage) return 'This place has no garage.';
      if (ped.hidden) { p.pendingCar = Number(parts[1]); return null; } // inside: confirm first
      const e = homes.spawnOwnedAt(world, p, Number(parts[1]), { ...h.garage, home: h.id });
      if (!e) world.notify(p, 'Your ride is in the driveway.', 'good');
      return e;
    }
    case 'job': {
      if (parts[1] === 'quit') { jobs.failJob(world, p, 'Job abandoned.'); return null; }
      if (p.job) return 'Finish your current job first.';
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
  } else spot = poi.spawnLot || { x: poi.x, y: poi.y + 90, a: -Math.PI / 2 };
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
  if (buff === 'coffee') { ped.stamina = 100; ped.buffs.coffee = world.time + 60; }
  if (buff === 'energy') { ped.buffs.energy = world.time + 60; ped.stamina = 140; }
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

// Walk up to a cash machine with money on you and it goes straight into the bank.
function quickDeposits(world) {
  for (const p of world.players.values()) {
    const ped = p.ped;
    if (!ped || ped.dead || ped.vehId || ped.hidden || p.profile.cash <= 0) { if (p) p.atAtm = null; continue; }
    let at = null;
    for (const q of world.map.atms) if (Math.abs(q.x - ped.x) < ATM_DEPOSIT_PX && Math.abs(q.y - ped.y) < ATM_DEPOSIT_PX && Math.hypot(q.x - ped.x, q.y - ped.y) < ATM_DEPOSIT_PX) { at = q; break; }
    if (!at) { p.atAtm = null; continue; }
    if (p.atAtm === at.id) continue; // once per visit
    p.atAtm = at.id;
    const amt = p.profile.cash;
    p.profile.cash = 0; p.profile.bank += amt;
    store.touch();
    p.meDirty = true;
    world.emit(at.x, at.y, { e: 'deposit', x: at.x, y: at.y, n: amt });
    world.notify(p, `ATM: deposited $${amt.toLocaleString()} - bank $${p.profile.bank.toLocaleString()}.`, 'good');
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

// The flashlight: in the bag (never used up, no hand slot - you keep your weapon), switched on and off with
// L / D-pad up / 🔦, from the bag or the quick wheel. profile.light is the switch; the light shines while it's
// on and you still have one (syncLight). Other players see it through the spawn descriptor (net.js: fl).
export function toggleLight(world, p, on) {
  const prof = p.profile;
  if ((prof.inventory.flashlight || 0) <= 0) {
    if (world.time - (p.noLightAt ?? -99) > 6) { p.noLightAt = world.time; world.notify(p, `You don't have a flashlight - hardware stores, corner stores and gas stations sell them ($${FLASHLIGHT_PRICE}).`, 'warn'); }
    return false;
  }
  prof.light = on === undefined ? !prof.light : !!on;
  syncLight(world, p);
  p.meDirty = true;
  store.touch();
  return true;
}
// Keeps the ped's light in step with the switch (every tick, players.update): off when you go down or lose the
// flashlight (dropped when you went down, sold, stashed) - and a new one starts off.
export function syncLight(world, p) {
  const prof = p.profile, ped = p.ped;
  if (prof.light && !((prof.inventory.flashlight || 0) > 0)) { prof.light = false; p.meDirty = true; }
  const on = !!(prof.light && ped && !ped.dead);
  if (ped && !!ped.flashOn !== on) { ped.flashOn = on; ped.appVer = (ped.appVer || 0) + 1; p.meDirty = true; }
}

// Use one of an item from the bag: med kits and bandages heal, drinks give their boost; the flashlight
// switches on or off.
export function useItem(world, p, id) {
  const ped = p.ped, inv = p.profile.inventory, it = ITEMS[id];
  if (!ped || ped.dead || !it) return;
  if ((inv[id] || 0) <= 0) { world.notify(p, `No ${it.name} left.`, 'warn'); return; }
  if (it.light) { toggleLight(world, p); return; }
  if (it.tool) { world.notify(p, id === 'revivekit' ? 'The Revive Kit is for someone else: stand over a downed player and hold the action button.' : `${it.name} isn't used like that.`, 'info'); return; }
  if (it.heal) {
    if (ped.hp >= ped.maxHp && (it.food || !ped.bleeding) && !(it.hearty && !(ped.buffs.hearty > world.time + HEARTY_S * 0.5))) { world.notify(p, it.food ? 'You\'re not hungry - you\'re at full health.' : 'You are already healthy.', 'info'); return; }
    inv[id]--;
    if (it.hearty) applyBuff(world, ped, 'hearty');
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
  quickDeposits(world);
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
