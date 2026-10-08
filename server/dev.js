// Playtest/debug commands: accepted when the server runs with CLA_DEV=1 (offline practice), or
// online from a player in Dev Debug Mode (devmode.js - nothing they do there is saved).
import { surfaceZ } from '../shared/levels.js';
import { PED_BLOCK } from '../shared/map.js';
import { DAY_LOOP_S, DAY_PART_S, STAR_HEAT, T, WEATHER } from '../shared/constants.js';
import { VEHICLES } from '../shared/vehicles.js';
import { WEAPONS, ITEMS } from '../shared/items.js';
import { store } from './store.js';
import * as env from './systems/environment.js';
import * as jobs from './systems/jobs.js';
import * as law from './systems/law.js';
import * as bounties from './systems/bounties.js';
import * as combat from './systems/combat.js';
import * as npc from './systems/npc.js';
import * as gangwar from './systems/gangwar.js';
import * as cruiser from './systems/cruiser.js';
import * as trains from './systems/trains.js';
import * as devmode from './devmode.js';
import * as pets from './systems/pets.js';
import * as wildlife from './systems/wildlife.js';
import * as wanderer from './systems/wanderer.js';
import { SPECIES } from '../shared/fauna.js';

// make a live animal the pure white legend of its kind (dev: see one up close)
function w2legend(world, e) {
  const S = SPECIES[e.wild.kind];
  if (!S || !S.legend) return;
  world.remove(e);
  wildlife.spawnAnimal(world, e.wild.kind, e.x, e.y, e.wild.herd, { legend: true, lead: true });
}

const { clearSpot } = cruiser;

export const DEV_COMMANDS = ['god', 'godp', 'gunsp', 'healp', 'shootout', 'die', 'snatch', 'cargo', 'rain', 'clear', 'night', 'day', 'money', 'wanted', 'clean', 'record', 'cop', 'promote', 'samaritan', 'pet', 'car', 'guns', 'give', 'drop', 'heal', 'tp', 'train', 'calltrain', 'goto', 'bring', 'grant', 'spectate', 'time', 'near', 'wxhold', 'clockhold', 'hunt', 'animal', 'wind', 'wanderer', 'bounty', 'hunter', 'revenge'];

// "Take me there": the places a test can start from, by key - a kind of place on the map (pois), a
// landmark type, a designed nature place, a street-race start or a pitch / court. near() finds the
// closest one to the player and puts them on open ground beside it (inside, at the desk, for walk-ins).
export const NEAR_KINDS = {
  subway: (m) => m.rail.stations.filter((s) => s.under && s.kiosk).map((s) => ({ x: s.kiosk.out.x, y: s.kiosk.out.y, name: s.name })),
  platform: (m) => m.rail.stations.filter((s) => !s.under).map((s) => ({ x: s.platform.x, y: s.platform.y, name: s.name })),
  race: (m) => (m.races || []).filter((r) => r.start).map((r) => ({ x: r.start.x, y: r.start.y, name: r.name || 'Race start', craft: r.kind === 'jetski' ? 'jetski' : r.kind === 'boat' ? 'speedboat' : null })),
  venue: (m) => (m.venues || []).filter((v) => v.rect).map((v) => ({ x: v.rect.x + v.rect.w / 2, y: v.rect.y + v.rect.h + 24, name: v.name || v.kind })),
  nature: (m) => (m.natureSites || []).map((q) => ({ x: q.x, y: q.y, name: q.name || q.kind })),
  beaver: (m) => (m.beaverPonds || []).map((b) => ({ x: b.x + 160, y: b.y + 140, name: `${b.name || 'Heron Marsh'} beaver pond` })),
  campfire: (m) => m.props.filter((q) => q && q.t === 'campfire').map((q) => ({ x: q.x, y: q.y + 30, name: 'a campfire' })),
  stargaze: (m) => { const s = (m.countrySites || []).find((q) => q.type === 'observatory'); return s ? m.props.filter((q) => q && q.t === 'scope' && q.x >= s.x * 32 && q.x <= (s.x + s.w) * 32 && q.y >= s.y * 32 && q.y <= (s.y + s.h) * 32).map((q) => ({ x: q.x + 14, y: q.y + 24, name: 'the observatory telescope' })) : []; },
};
export function nearTargets(m, k) {
  if (NEAR_KINDS[k]) return NEAR_KINDS[k](m);
  const pois = m.pois.filter((q) => q.kind === k).map((q) => ({ x: q.x, y: q.y, name: q.label || q.name || k }));   // (walk-ins: at the desk inside)
  if (pois.length) return pois;
  const lm = (m.landmarks || []).filter((l) => l.type === k).map((l) => ({ x: l.x + (l.w || 0) / 2, y: l.y + (l.h || 0) / 2, name: l.name || k }));
  if (lm.length) return lm;
  return (m.natureSites || []).filter((q) => q.kind === k).map((q) => ({ x: q.x, y: q.y, name: q.name || k }));
}
// open ground you can stand on (or, water: open water), as close to (x, y) as there is within reach
function standAt(world, x, y, reach = 320, water = false) {
  const m = world.map;
  const ok = (px, py) => { const t = m.tileAtPx(px, py); return water ? t === T.WATER || t === T.DEEP : !PED_BLOCK[t] && !m.isWater(px, py); };
  if (ok(x, y)) return { x, y };
  for (let r = 16; r <= reach; r += 16) for (let k = 0, n = Math.max(16, Math.round(r / 10)); k < n; k++) { const a = (k / n) * Math.PI * 2, px = x + Math.cos(a) * r, py = y + Math.sin(a) * r; if (ok(px, py)) return { x: px, y: py }; }
  return null;
}
export function near(world, p, k) {
  const ped = p.ped;
  if (!ped || ped.dead) return '[dev] Not while you\'re down.';
  const list = nearTargets(world.map, String(k || '').slice(0, 24));
  if (!list.length) return `[dev] There's no "${k}" on this map.`;
  let best = null, bd = Infinity;
  for (const q of list) { const d = Math.hypot(q.x - ped.x, q.y - ped.y); if (d > 120 && d < bd) { bd = d; best = q; } } // (the next one along if you're already at one)
  best ||= list[0];
  const at = standAt(world, best.x, best.y, best.craft ? 1800 : 320);   // (a race out on the water: the nearest shore)
  if (!at) return `[dev] Couldn't find open ground by ${best.name}.`;
  if (ped.onTrain) trains.alight(world, ped, ped.x, ped.y);
  if (ped.vehId) return '[dev] Get out of the vehicle first.';
  ped.sub = false; ped.x = at.x; ped.y = at.y; ped.lz = 0; ped.vx = 0; ped.vy = 0; p.teleportAt = world.time;
  if (best.craft) { // and the right craft in the water beside you
    const wat = standAt(world, at.x + Math.sign(best.x - at.x) * 40, at.y + Math.sign(best.y - at.y) * 40, 400, true);
    if (wat) { const v = world.spawnVehicle(best.craft, wat.x, wat.y, Math.atan2(best.y - wat.y, best.x - wat.x), { npcOwned: false }); v.issuedTo = p.pid; }
  }
  world.notify(p, `[dev] At ${best.name}.`, 'info');
  return null;
}

export const GIVE_MAX = 999;
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const TOOL_ITEMS = () => Object.keys(ITEMS).filter((id) => ITEMS[id].tool);

// Put something in a player's bag. Weapons come with n magazines of ammo (one loaded; melee weapons and
// tools: just the weapon), items n of them (a tool - flashlight, revive kit - just one: it never wears out).
function addThing(q, kind, id, n) {
  const prof = q.profile, ped = q.ped;
  if (kind === 'weapon') {
    const w = WEAPONS[id];
    prof.weapons[id] = (prof.weapons[id] || 0) + (w.mag ? w.mag * n : 0);
    if (w.mag && ped) ped.mag[id] = Math.max(ped.mag[id] || 0, Math.min(w.mag, prof.weapons[id]));
  } else {
    prof.inventory[id] = ITEMS[id].tool ? Math.max(1, prof.inventory[id] || 0) : (prof.inventory[id] || 0) + n;
  }
}

// Dev give: anything from the catalogs to yourself or any online player.
//   msg: { pid (absent: yourself), kind: 'weapon' | 'item' | 'all', id (weapon or item id), n (1..GIVE_MAX) }
// 'all' gives every weapon (n magazines each) and every item (n each, tools one). Returns an error or null.
export function give(world, p, msg) {
  const q = msg.pid ? world.players.get(String(msg.pid)) : p;
  if (!q || !q.conn) return '[dev] That player isn\'t online.';
  const n = Math.max(1, Math.min(GIVE_MAX, Math.floor(Number(msg.n)) || 1));
  const kind = String(msg.kind || ''), id = String(msg.id || '').slice(0, 30);
  let what;
  if (kind === 'all') {
    for (const wid of Object.keys(WEAPONS)) if (wid !== 'fists') addThing(q, 'weapon', wid, n);
    for (const iid of Object.keys(ITEMS)) addThing(q, 'item', iid, n);
    what = 'every weapon and item in the game';
  } else if (kind === 'weapon') {
    if (!own(WEAPONS, id) || id === 'fists') return `[dev] No weapon "${id}".`;
    addThing(q, 'weapon', id, n);
    what = WEAPONS[id].mag ? `${WEAPONS[id].name} + ${n} mag${n > 1 ? 's' : ''}` : WEAPONS[id].name;
  } else if (kind === 'item') {
    if (!own(ITEMS, id)) return `[dev] No item "${id}".`;
    addThing(q, 'item', id, n);
    what = ITEMS[id].tool ? ITEMS[id].name : `${n}x ${ITEMS[id].name}`;
  } else return '[dev] Give what? (kind: weapon, item or all)';
  q.meDirty = true;
  store.touch();
  if (q !== p) world.notify(q, `${p.name} (dev) gave you: ${what}.`, 'good');
  world.notify(p, q === p ? `[dev] Given to you: ${what}.` : `[dev] Gave ${q.name}: ${what}.`, 'info');
  return null;
}

// Find a clear spot near the player for a dev-spawned vehicle (never inside buildings).

export function command(world, p, c, msg) {
  const ped = p.ped;
  const prof = p.profile;
  switch (c) {
    case 'rain': env.startRain(world, Math.max(30, Math.min(3600, Number(msg.s) || 300))); if (world.weatherHold) world.weatherHold.w = WEATHER.RAIN; break;   // (msg.s: for how long)
    case 'clear': env.stopRain(world); if (world.weatherHold) world.weatherHold.w = WEATHER.CLEAR; break;
    case 'wxhold': // hold the weather as it is (rain keeps falling, or no rain rolls in) until let go
      world.weatherHold = world.weatherHold ? null : { w: world.weather };
      if (!world.weatherHold && world.weather === WEATHER.RAIN) world.rainUntil = world.time + 120;
      world.notify(p, world.weatherHold ? '[dev] Weather held: no change until you let it go.' : '[dev] Weather back to normal.', 'info'); break;
    case 'clockhold': world.clockHold = !world.clockHold; world.notify(p, world.clockHold ? '[dev] Clock frozen at this time of day.' : '[dev] Clock running again.', 'info'); break;
    case 'near': { const err = near(world, p, msg.k); if (err) world.notify(p, err, 'warn'); break; }
    case 'night': world.loopTime = DAY_PART_S + 5; break;
    case 'day': world.loopTime = 90; break;
    case 'time': { // jump the clock to a time of day: msg.m minutes after midnight
      const mins = ((Number(msg.m) % 1440) + 1440) % 1440;
      // 06:00-20:00 is the day part (DAY_PART_S), 20:00-06:00 the rest of the loop
      world.loopTime = mins >= 360 && mins < 1200 ? (mins - 360) / 840 * DAY_PART_S : DAY_PART_S + (((mins - 1200 + 1440) % 1440) / 600) * (DAY_LOOP_S - DAY_PART_S);
      break;
    }
    case 'money': prof.cash += 5000; prof.bank += 20000; world.notify(p, '[dev] +$5,000 cash, +$20,000 bank', 'info'); break;
    case 'wanted': {
      if (!ped) break;
      const s = Math.max(1, Math.min(5, Number(msg.n) || 2));
      law.addHeat(world, p, STAR_HEAT[s] - p.heat + 1, ped.x, ped.y);
      break;
    }
    case 'clean': law.clearWanted(world, p); prof.peakWanted = 0; break;
    case 'bounty': bounties.devOnMe(world, p); break;                         // a test bounty on your own head
    case 'hunter': law.clearWanted(world, p); if (p.badge) law.goOffDuty(world, p); p.hunter = true; p.faction = 'hunter'; p.meDirty = true; world.notify(p, '[dev] Licensed bounty hunter: take contracts in the Bounties app.', 'info'); break;
    case 'revenge': { const err = bounties.devUnlock(world, p); if (err) world.notify(p, `[dev] ${err}`, 'warn'); break; }
    case 'record': // wipe the criminal record: no wanted level, no felonies, no peak-wanted memory
      law.clearWanted(world, p); prof.peakWanted = 0; prof.felonies = 0; prof.firedUntil = 0; p.disguised = false;
      world.notify(p, '[dev] Criminal record wiped - no felonies on file.', 'info'); p.meDirty = true; break;
    case 'cop': { // join the force on the spot (record wiped, enough Samaritan points), keep current rank
      law.clearWanted(world, p); prof.peakWanted = 0; prof.felonies = 0; prof.firedUntil = 0;
      prof.samaritan = Math.max(prof.samaritan, law.ENFORCER_MIN_SAMARITAN + 10);
      const err = p.badge ? null : law.goOnDuty(world, p);
      if (!err && !(ped && ped.vehId && world.get(ped.vehId)?.cruiserOf === p.pid)) cruiser.issueNow(world, p);
      world.notify(p, err ? `[dev] ${err}` : `[dev] On duty as ${law.POLICE_RANKS[law.policeRank(prof)].name}. Dispatch map: M / Start → Map / tap the radar.`, err ? 'bad' : 'good');
      break;
    }
    case 'promote': { // jump to the next police rank
      const r = law.policeRank(prof);
      if (r < law.POLICE_RANKS.length - 1) law.addPolicePts(world, p, law.POLICE_RANKS[r + 1].pts - (prof.policePts || 0));
      else world.notify(p, '[dev] Already Chief of Police.', 'info');
      break;
    }
    case 'shootout': world.notify(p, gangwar.startShootout(world, p) ? '[dev] Shootout started nearby.' : '[dev] No gang turf near you - go toward The Yards or Southside.', 'info'); break;
    case 'die': if (ped && !ped.dead) combat.damage(world, ped, 99999, null, 'crash', 0); break;
    case 'snatch': npc.snatchEvent(world, p); world.notify(p, '[dev] A mugger is on the way to a nearby pedestrian.', 'info'); break;
    case 'pet': pets.spawnLost(world, p); world.notify(p, '[dev] A pet ran off nearby.', 'info'); break;
    case 'samaritan': prof.samaritan += 50; world.notify(p, '[dev] +50 Samaritan', 'info'); break;
    case 'car': {
      if (!ped) break;
      const model = VEHICLES[msg.m] ? msg.m : 'pickup';
      let sp = clearSpot(world, ped, VEHICLES[model]);
      if ((ped.lz || 0) > 0.5) { // up on the deck: somewhere on the deck beside you
        sp = { x: ped.x, y: ped.y, a: ped.a };
        for (let k = 0; k < 16; k++) { const a = (k * Math.PI) / 8, x = ped.x + Math.cos(a) * 110, y = ped.y + Math.sin(a) * 110; if (surfaceZ(world.map, x, y, 1) !== null) { sp = { x, y, a: 0 }; break; } }
      }
      const v = world.spawnVehicle(model, sp.x, sp.y, sp.a, { npcOwned: false });
      v.issuedTo = p.pid;
      v.lz = ped.lz || 0; // up on the highway with you
      break;
    }
    case 'guns': // every weapon in the game with ammo (the police's and the hunters' too), med kits, and every tool / bit of equipment
      for (const [id, w] of Object.entries(WEAPONS)) {
        if (id === 'fists' || w.type === 'deploy') continue;
        prof.weapons[id] = (prof.weapons[id] || 0) + (w.mag ? Math.max(w.mag * 5, w.starter || 0) : 0);
        if (w.mag && ped) ped.mag[id] = w.mag;
      }
      prof.inventory.medkit = (prof.inventory.medkit || 0) + 3;
      for (const id of TOOL_ITEMS()) prof.inventory[id] = Math.max(1, prof.inventory[id] || 0);
      break;
    case 'hunt': // the hunter's kit: the hunting rifle, the bow and arrows, the varmint rifle, the hunting knife, the cloak, scent
      for (const id of ['huntrifle', 'bow', 'varmint', 'huntknife']) { const w = WEAPONS[id]; prof.weapons[id] = (prof.weapons[id] || 0) + (w.mag ? Math.max(w.mag * 4, 30) : 0); if (w.mag && ped) ped.mag[id] = w.mag; }
      prof.inventory.camoCloak = 1; prof.inventory.coverScent = (prof.inventory.coverScent || 0) + 3; prof.inventory.flashlight = Math.max(1, prof.inventory.flashlight || 0);
      if (ped) combat.selectWeapon(world, ped, 'bow');
      world.notify(p, '[dev] Hunting kit: rifle, bow + arrows, varmint rifle, hunting knife, ghillie cloak, cover scent.', 'info');
      break;
    case 'animal': { // an animal (or its group) out of sight nearby: msg.k kind, msg.young / msg.legend, msg.stalk (a predator that stalks you)
      if (!ped) break;
      const kind = String(msg.k || 'deer');
      if (!SPECIES[kind] && !wildlife.LIVESTOCK[kind]) { world.notify(p, `[dev] No animal "${kind}".`, 'warn'); break; }
      const S = SPECIES[kind];
      const ang = ped.a + Math.PI + (Math.random() - 0.5), d = msg.stalk ? 520 : 300;
      let x = ped.x + Math.cos(ang) * d, y = ped.y + Math.sin(ang) * d;
      if (S && (S.swims === 'float' || kind === 'beaver' || kind === 'otter' || kind === 'duck' || kind === 'goose')) { const wat = standAt(world, x, y, 900, true); if (wat) { x = wat.x; y = wat.y; } }
      else { const g = standAt(world, x, y, 400); if (g) { x = g.x; y = g.y; } }
      if (S && msg.stalk) {   // one of them, on your trail
        const a = wildlife.spawnAnimal(world, kind, x, y, 0, { lead: true });
        a.wild.predator = true; a.wild.stalkOf = ped.id; a.wild.state = 'stalk'; a.wild.until = world.time + 60;
        world.notify(p, `[dev] ${a.name} is stalking you.`, 'info');
        break;
      }
      if (S && !msg.single) {
        const n = wildlife.spawnGroup(world, kind, x, y, false);
        if (msg.legend || msg.young) for (const e of wildlife.animals(world)) if (e.wild.kind === kind && Math.hypot(e.x - x, e.y - y) < 120 && e.wild.lead) { if (msg.legend) { w2legend(world, e); } break; }
        world.notify(p, `[dev] ${S.name} x${n} nearby.`, 'info');
      } else {
        const a = wildlife.spawnAnimal(world, kind, x, y, 0, { young: !!msg.young, legend: !!msg.legend, lead: true });
        world.notify(p, `[dev] ${a.name} nearby.`, 'info');
      }
      if (msg.calm) for (const e of wildlife.animals(world)) if (Math.hypot(e.x - x, e.y - y) < 160) e.wild.calmUntil = world.time + (Number(msg.calm) > 1 ? Number(msg.calm) : 40);   // (calm a while: to look at)
      break;
    }
    case 'dummy': { // a few people standing still just ahead of you, to try the blades (and anything else) on: msg.n of
      // them (1-6, default 3), msg.hp to set their health (1: every blow is a killing blow, to see how they fall)
      if (!ped || ped.vehId) break;
      const n = Math.max(1, Math.min(6, Number(msg.n) || 3));
      let made = 0;
      for (let i = 0; i < n; i++) {
        const a = (ped.a || 0) + (i - (n - 1) / 2) * 0.55, d = 44 + (i % 2) * 18, x = ped.x + Math.cos(a) * d, y = ped.y + Math.sin(a) * d;
        if (PED_BLOCK[world.map.tileAtPx(x, y)]) continue;
        const q = npc.spawnNpc(world, 'casual', x, y);
        if (!q) continue;
        q.npc.desk = { x, y, a: a + Math.PI }; q.npc.keep = true; q.a = a + Math.PI;
        if (Number(msg.hp) > 0) q.hp = q.maxHp = Number(msg.hp);
        made++;
      }
      world.notify(p, `[dev] ${made} practice ${made === 1 ? 'dummy' : 'dummies'} in front of you.`, 'info');
      break;
    }
    case 'wanderer': { // the hooded stranger who sells the plasma blade, a few steps away
      if (!ped) break;
      const s = wanderer.appear(world, { x: ped.x + Math.cos(ped.a) * 90, y: ped.y + Math.sin(ped.a) * 90 });
      world.notify(p, s ? '[dev] A hooded stranger stands nearby.' : '[dev] No room for him here.', 'info');
      break;
    }
    case 'wind': // where the wind blows from: msg.a (radians) - or back to the weather's own
      world.windHold = Number.isFinite(msg.a) ? { a: msg.a, s: 0.8 } : null;
      if (ped && msg.toMe) world.windHold = { a: Math.atan2(-Math.sin(ped.a), -Math.cos(ped.a)), s: 0.8 };
      world.notify(p, world.windHold ? '[dev] The wind is held.' : '[dev] The wind is free again.', 'info');
      break;
    case 'give': { const err = give(world, p, msg); if (err) world.notify(p, err, 'warn'); break; }
    case 'cargo': {
      // a flatbed pre-loaded with one crate of every tier, for open-cargo playtests
      if (!ped) break;
      const sp = clearSpot(world, ped, VEHICLES.flatbed);
      const v = world.spawnVehicle('flatbed', sp.x, sp.y, sp.a, { npcOwned: false });
      v.issuedTo = p.pid;
      [1, 2, 3, 4, 1, 2].forEach((tier, i) => {
        const c = world.spawnCrate(tier, v.x, v.y, { owner: p.pid, contraband: false });
        c.state = 'loaded'; c.parent = v.id; c.slot = i; v.cargo[i] = c.id;
      });
      break;
    }
    case 'drop': jobs.spawnDrop(world, Number(msg.n) === 4 ? 4 : 3); break;
    case 'heal': if (ped) { ped.hp = ped.maxHp; ped.bleeding = false; } break;
    case 'train': { // hop aboard a train right now (nearest, or msg.n), in car msg.car (default: the first coach)
      if (!ped || ped.dead || !world.trains.length) break;
      if (ped.onTrain) trains.alight(world, ped, ped.x, ped.y);
      let t = world.trains[Number(msg.n)] || null;
      if (!t) { let bd = Infinity; for (const q of world.trains) { const e = world.get(q.cars[0].id); const d = Math.hypot(e.x - ped.x, e.y - ped.y); if (d < bd) { bd = d; t = q; } } }
      const ci = Math.max(1, Math.min(t.cars.length - 1, Number(msg.car) || 1));
      trains.board(world, ped, t, ci, 0, 0, 0);
      world.notify(p, `[dev] Aboard train ${t.i}, car ${ci}.`, 'info');
      break;
    }
    case 'calltrain': { // bring the next train into the nearest station, doors open
      if (!ped || ped.dead || !world.trains.length) break;
      const r = trains.callTrain(world, ped.x, ped.y);
      if (r) world.notify(p, `[dev] A train is waiting at ${r.st.name}.`, 'info');
      break;
    }
    case 'tp': if (ped && ped.onTrain) trains.alight(world, ped, ped.x, ped.y); if (ped) ped.sub = false;
      if (ped && !ped.vehId && Number.isFinite(msg.x) && Number.isFinite(msg.y)) { ped.x = msg.x; ped.y = msg.y; ped.lz = msg.lz === 1 && surfaceZ(world.map, msg.x, msg.y, 1) !== null ? 1 : 0; p.teleportAt = world.time; } break; // lz: 1 = up on the highway deck
    case 'god': devmode.setInvincible(world, p, null); break;              // invincible (toggle)
    case 'spectate':                                                        // free camera: your character stays put, safe
      if (msg.on && !p.spectating) { p.spectating = true; p.specWasGod = !!p.invincible; p.invincible = true; if (ped) { ped.hp = ped.maxHp; ped.bleeding = false; } }
      else if (!msg.on && p.spectating) { p.spectating = false; p.invincible = p.specWasGod; }
      p.meDirty = true;
      break;
    case 'godp': devmode.setInvincible(world, p, msg.pid); break;          // make another player invincible (toggle)
    case 'gunsp': case 'healp': {                                          // give another player weapons / heal them
      const q = world.players.get(String(msg.pid));
      if (!q || !q.ped || q.ped.dead) { world.notify(p, '[dev] Can\'t reach that player right now.', 'warn'); break; }
      if (c === 'healp') { q.ped.hp = q.ped.maxHp; q.ped.bleeding = false; world.notify(q, `${p.name} (dev) healed you.`, 'good'); world.notify(p, `[dev] Healed ${q.name}.`, 'info'); }
      else { command(world, q, 'guns', {}); world.notify(p, `[dev] Gave ${q.name} weapons.`, 'info'); }
      q.meDirty = true;
      break;
    }
    case 'goto': devmode.goTo(world, p, msg.pid); break;     // teleport to an online player
    case 'bring': devmode.bring(world, p, msg.pid); break;   // fetch an online player to you
    case 'grant': devmode.grant(world, p, msg.pid); break;   // give someone Dev Debug Mode (their progress stops saving too)
    default: world.notify(p, `[dev] unknown command ${c}. Try: ${DEV_COMMANDS.join(', ')}`, 'warn'); return;
  }
  world.loopTime %= DAY_LOOP_S;
  p.meDirty = true;
  store.touch();
}
