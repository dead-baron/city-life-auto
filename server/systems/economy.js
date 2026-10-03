// Map commerce economy (GDD §11): storefront menus, bank/ATM, hospital reception,
// pharmacy/coffee/vending buffs, weapon/pawn/black-market shops, dealership + owned
// vehicles, Fresh Coat garage (respray / wash / repair / disguise), clothing disguises,
// police HQ badge desk and the courthouse bounty office.
import { K } from '../../shared/constants.js';
import { WEAPONS, ITEMS, SHOPS } from '../../shared/items.js';
import { VEHICLES, PAINTS } from '../../shared/vehicles.js';
import { mulberry32 } from '../../shared/rng.js';
import { playerOutfit } from '../entities.js';
import { store } from '../store.js';
import * as law from './law.js';
import * as jobs from './jobs.js';
import * as combat from './combat.js';
import * as homes from './homes.js';

const HOSPITAL_FEE = 150;
const rng = mulberry32(77);

export function poiLabel(world, p, poi) {
  switch (poi.kind) {
    case 'delivery': case 'evidence': case 'reception': return null;
    case 'home': {
      const h = world.map.homes[poi.home];
      const owner = world.homeOwner.get(h.id);
      if (owner === p.pid) return `Your ${h.kind} (rest, garage, spawn)`;
      if (owner) return null;
      return `For sale: ${h.name} - $${h.price.toLocaleString()}`;
    }
    case 'atm': return 'Use ATM';
    case 'vending': return 'Buy an Energy Drink';
    case 'police': return p.badge ? 'Police HQ (duty desk)' : 'Police HQ (apply / badge)';
    case 'courthouse': return 'Courthouse (bounties)';
    case 'farm': return 'Farm Co-op (harvest contracts)';
    case 'warehouse': return 'Portside Logistics (courier jobs)';
    default: return `Enter ${poi.label}`;
  }
}

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

function weaponOffer(o, prof) {
  const w = WEAPONS[o.id];
  const owned = prof.weapons[o.id] !== undefined;
  return { id: `w:${o.id}:${o.price}`, label: w.name, price: o.price, dis: owned, note: owned ? 'owned' : (w.illegal ? 'illegal' : '') };
}

export function buildMenu(world, p, poi) {
  const prof = p.profile;
  const kind = poi.kind;
  const opts = [];
  let title = poi.label, sub = '';
  const shopKey = kind === 'vending' ? 'vending' : kind;
  const shop = SHOPS[shopKey];
  if (shop && kind !== 'dealer' && kind !== 'marina' && kind !== 'garage' && kind !== 'clothing') {
    title = shop.title;
    for (const o of shop.buy) {
      if (o.kind === 'weapon') opts.push(weaponOffer(o, prof));
      else if (o.kind === 'ammo') opts.push({ id: `a:${o.id}:${o.price}:${o.qty}`, label: `${WEAPONS[o.id].name} ammo x${o.qty}`, price: o.price, dis: prof.weapons[o.id] === undefined, note: prof.weapons[o.id] === undefined ? 'need weapon' : `have ${prof.weapons[o.id]}` });
      else if (o.kind === 'item') opts.push({ id: `i:${o.id}:${o.price}:${o.qty}`, label: `${ITEMS[o.id].name}${o.qty > 1 ? ' x' + o.qty : ''}`, price: o.price, note: prof.inventory[o.id] ? `have ${prof.inventory[o.id]}` : '' });
    }
    for (const id of shop.sells || []) {
      const n = prof.inventory[id] || 0;
      if (n > 0) opts.push({ id: `s:${id}`, label: `Sell ${ITEMS[id].name} (x${n})`, price: -ITEMS[id].sell, note: n > 1 ? 'sells all' : '' });
    }
    if (shop.sellsWeapons) {
      for (const id of Object.keys(prof.weapons)) {
        if (id === 'fists' || id === 'taser' || id === 'baton') continue;
        opts.push({ id: `sw:${id}`, label: `Sell ${WEAPONS[id].name}`, price: -Math.round(weaponPrice(id) * 0.4) });
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
      break;
    case 'police':
      sub = p.badge ? 'On duty. Arrest wanted suspects, seize contraband, keep it clean.' : `Badge requirements: ${law.ENFORCER_MIN_SAMARITAN} Samaritan points, zero felonies. You: ${prof.samaritan} pts, ${prof.felonies} felonies.`;
      if (!p.badge) opts.push({ id: 'duty:on', label: 'Pick up badge, uniform & keys' });
      else { opts.push({ id: 'cruiser', label: 'Requisition a Police Interceptor' }); opts.push({ id: 'duty:off', label: 'Go off duty' }); }
      break;
    case 'courthouse': {
      sub = p.hunter ? 'Licensed Bounty Hunter: targets appear as radar pings.' : `Register as a Bounty Hunter (${law.HUNTER_MIN_SAMARITAN}+ Samaritan, not wanted).`;
      opts.push(p.hunter ? { id: 'hunter:off', label: 'Hand in hunter license' } : { id: 'hunter:on', label: 'Register as Bounty Hunter' });
      for (const [pid, t] of p.robbedBy) {
        const q = world.players.get(pid);
        if (!q || world.time - t > 1800) continue;
        for (const amt of [100, 500, 1000]) opts.push({ id: `bounty:${pid}:${amt}`, label: `Place $${amt} bounty on ${q.name}`, price: amt, note: 'from bank' });
      }
      const active = [...world.players.values()].filter((q) => q.bounty > 0);
      if (active.length) sub += ' Active: ' + active.map((q) => `${q.name} $${q.bounty}`).join(', ');
      break;
    }
    case 'clothing':
      title = SHOPS.clothing.title;
      sub = 'A fresh outfit drops your public wanted level to 0 (if no cop is watching). Your peak record is remembered.';
      opts.push({ id: 'outfit', label: 'Buy a new outfit', price: 120, dis: p.badge, note: p.badge ? 'off duty only' : '' });
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
        opts.push({ id: `vb:${o.id}`, label: `${d.name}${d.slots.length ? ` (${d.slots.length} cargo slot${d.slots.length > 1 ? 's' : ''})` : ''}`, price: d.price });
      }
      ownedVehicleOpts(prof, opts, kind === 'marina');
      break;
    }
    case 'home': {
      const h = world.map.homes[poi.home];
      const mine = world.homeOwner.get(h.id) === p.pid;
      title = h.name;
      if (!mine) {
        sub = `A ${h.kind} with a ${h.slots}-car garage. Owning it makes it a respawn point (no more waking up at the hospital) and stores vehicles you park out front.`;
        opts.push({ id: 'hbuy', label: `Buy this ${h.kind}`, price: h.price });
      } else {
        sub = `Garage: ${prof.vehicles.length}/${homes.garageCap(world, prof)} vehicles. Drive any car up to the driveway and press E to park it here.`;
        opts.push({ id: 'hrest', label: 'Rest (full health, stop bleeding)' });
        opts.push({ id: 'hspawn', label: prof.spawnHome === h.id ? 'Respawn point: HERE' : 'Make this my respawn point', dis: prof.spawnHome === h.id });
        prof.vehicles.forEach((ov, i) => { const d = VEHICLES[ov.model]; if (d && d.kind !== 'boat') opts.push({ id: `hcar:${i}`, label: `Take out ${d.name}`, note: 'garage' }); });
        opts.push({ id: 'hsell', label: `Sell (+$${Math.round(h.price * 0.6).toLocaleString()} to bank)` });
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
      sub = 'Carry contraband or stolen cargo to the door to sell it. No questions asked.';
      break;
    default: break;
  }
  if (!opts.length) opts.push({ id: 'close', label: 'Leave' });
  return { t: 'menu', poi: poi.id, title, sub, opts, cash: prof.cash, bank: prof.bank };
}

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
  if (optId !== 'close' && p.conn) p.conn.sendJSON(buildMenu(world, p, poi));
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
    case 'w': {
      const id = parts[1], price = Number(parts[2]);
      if (!pay(p, price)) return 'Not enough money.';
      const w = WEAPONS[id];
      prof.weapons[id] = w.mag ? w.mag * 2 : 0;
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
      if (!pay(p, price)) return 'Not enough money.';
      const it = ITEMS[id];
      if (it.buff) { applyBuff(world, ped, it.buff); world.notify(p, `${it.name}: ${it.buff === 'coffee' ? 'stamina refilled, faster recovery' : 'more stamina + speed boost'} for 60s.`, 'good'); }
      else prof.inventory[id] = (prof.inventory[id] || 0) + qty;
      store.touch();
      return null;
    }
    case 's': {
      const id = parts[1];
      const n = prof.inventory[id] || 0;
      if (n <= 0) return 'Nothing to sell.';
      const gain = ITEMS[id].sell * n;
      prof.inventory[id] = 0;
      prof.cash += gain;
      world.notify(p, `Sold ${n}x ${ITEMS[id].name} for $${gain}.`, 'good');
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
      prof.cash += gain;
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
        world.notify(p, 'Badge on. You are now an Enforcer. Taser, baton and sidearm issued.', 'good');
      } else {
        law.goOffDuty(world, p);
        const dv = world.get(p.dutyVehicle);
        if (dv && !dv.seats.some((s) => s)) world.remove(dv);
        world.notify(p, 'Off duty.', 'info');
      }
      return null;
    }
    case 'cruiser': {
      if (!p.badge) return 'On-duty officers only.';
      const old = world.get(p.dutyVehicle);
      if (old && !old.seats.some((s) => s)) world.remove(old);
      const lot = poi.spawnLot || { x: poi.x, y: poi.y + 80, a: 0 };
      const v = world.spawnVehicle('police', lot.x, lot.y, lot.a, {});
      v.issuedTo = p.pid; v.despawnable = false; v.npcOwned = false;
      p.dutyVehicle = v.id;
      world.notify(p, 'Interceptor waiting in the HQ lot. H toggles the siren.', 'good');
      return null;
    }
    case 'hunter': {
      if (parts[1] === 'on') { const e = law.registerHunter(world, p); if (e) return e; world.notify(p, 'Licensed. Bounty targets show as radar pings.', 'good'); }
      else { p.hunter = false; }
      return null;
    }
    case 'bounty': return law.placeBounty(world, p, parts[1], Number(parts[2]));
    case 'outfit': {
      const blocked = disguiseBlocked(world, p);
      if (blocked) return blocked;
      if (!pay(p, 120)) return 'Not enough money.';
      const fresh = playerOutfit(rng);
      fresh.s = prof.outfit ? prof.outfit.s : fresh.s;
      prof.outfit = fresh;
      ped.app = { ...fresh };
      ped.appVer = (ped.appVer || 0) + 1;
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
        v.paint = (v.paint + 1 + Math.floor(rng() * (PAINTS.length - 1))) % PAINTS.length;
        v.variant = Math.floor(rng() * 1000);
        v.bloody = false; v.descVer = (v.descVer || 0) + 1;
        applyDisguise(world, p);
      } else if (parts[0] === 'wash') {
        if (!pay(p, 20)) return 'Not enough money.';
        v.bloody = false;
        world.notify(p, 'Squeaky clean.', 'good');
      } else {
        if (!pay(p, 300)) return 'Not enough money.';
        v.hp = v.def.hp; v.burnUntil = 0;
        world.notify(p, 'Body work done.', 'good');
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
    case 'hbuy': return homes.buy(world, p, world.map.homes[poi.home], pay);
    case 'hsell': return homes.sell(world, p, world.map.homes[poi.home]);
    case 'hspawn': { prof.spawnHome = poi.home; store.touch(); world.notify(p, 'You will wake up here after you die.', 'good'); return null; }
    case 'hrest': { ped.hp = ped.maxHp; ped.bleeding = false; ped.stamina = 100; world.emit(ped.x, ped.y, { e: 'heal', x: ped.x, y: ped.y }); world.notify(p, 'You rested up. Full health.', 'good'); return null; }
    case 'hcar': {
      const h = world.map.homes[poi.home];
      const e = homes.spawnOwnedAt(world, p, Number(parts[1]), h.garage);
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

function applyDisguise(world, p) {
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
