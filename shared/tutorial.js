// The guided tour ("tutorial cut scene"). Pure data + resolvers, shared by the client (which
// flies a camera over the real, live-rendered city) and the test suite (which fails the build
// when the tour falls out of date).
//
// Keeping it current:
//  * Places are referenced by POI kind / district / island, never by coordinates. They are
//    resolved against generateCity() at play time, so moving or renaming a building moves the
//    camera and the labels with it. {{kind}} in text becomes that place's in-game name.
//  * Numbers come from shared/rules.js and the shop catalog, so balance changes update the text.
//  * [[action]] becomes the right key / button / touch label for the player's device
//    (shared/controls.js).
//  * test/tutorial.test.js requires every POI kind, island, gang turf, control action and rule
//    to be covered here - add a place type or control and the tests tell you to teach it.
import { ISLANDS, DISTRICTS, ESTATE_TYPES } from './map.js';
import { TILE, MAP_W, MAP_H, STAR_HEAT, DAY_LOOP_S, DAY_PART_S } from './constants.js';
import { SHOPS, WEAPONS, ITEMS } from './items.js';
import { VEHICLES } from './vehicles.js';
import { EVENT_KINDS, ARROW_SHOW_S } from './worldevents.js';
import {
  ENFORCER_MIN_SAMARITAN, HUNTER_MIN_SAMARITAN, MISCONDUCT_GRACE, MISCONDUCT_RESET_MS, MISCONDUCT_WEIGHT, FIRED_LOCKOUT_MS,
  SERVICE_AMMO, SERVICE_MAG, CALL_COOLDOWN_S, SUBDUE_S, POLICE_RANKS, BUST_FINE_PER_STAR, ARREST_REWARD_PER_STAR,
  RESPAWN_SECONDS, GHOST_SECONDS, HOSPITAL_FEE, JOB_TIERS, PATROL_PAY, PATROL_SEARCH_S,
  NPC_GUN_MULT, VEHICLE_TOUGHNESS, ARMORED_ROCKETS, ARMORED_VEHICLES,
  POLICE_ARMORY, FELONY_FINE, GANG_PROVOKE_SPEED, SHOOTOUT_EVERY_S, PAINT_PRICE, PAINT_TIME_S, HIDE_TIME_S, SPAWN_PROTECT_S,
} from './rules.js';

// Bump when the tour changes enough that returning players should be offered it again.
export const TUTORIAL_VERSION = 6;

const price = (shop, id) => (SHOPS[shop].buy.find((o) => o.id === id) || {}).price;
const min = (ms) => Math.round(ms / 60000);
const dayMin = Math.round(DAY_PART_S / 60), nightMin = Math.round((DAY_LOOP_S - DAY_PART_S) / 60);
const isle = (k) => ISLANDS[k].name;
const kmh = (pxPerS) => Math.round((pxPerS / TILE) * 3.6); // 1 tile = 1 m
const estate = (k) => `${ESTATE_TYPES[k].name} ($${Math.round(ESTATE_TYPES[k].price / 1000)}k)`;

export const CHAPTERS = [
  { id: 'city', title: 'The City' },
  { id: 'basics', title: 'Survival Basics' },
  { id: 'citizen', title: 'Citizen Path' },
  { id: 'criminal', title: 'Criminal Path' },
  { id: 'police', title: 'Police Path' },
  { id: 'end', title: 'Your Move' },
];

// at: what the camera frames. One of
//   { city: 1 } | { island: 'D' } | { district: 'Neon Strip' } | { poi: kind } | { pois: kind }
//   { spawn: 'default' } | { cameras: 1 } | { dropSites: 1 } | { turf: 1 } | { homes: districtName } | { estates: 1 }
// route: an animated vehicle driving the road network between two targets (optional chaser).
export const STEPS = [
  // ---- the city ------------------------------------------------------------------------------
  { ch: 'city', title: 'Welcome to the city', at: { city: 1 },
    text: `Four islands joined by bridges: ${isle('I')}, ${isle('R')}, ${isle('D')} and the quiet ${isle('F')}. Everyone shares one living city - other players, traffic, cops and crooks. Live as a citizen, a criminal or a police officer, and switch whenever you like.` },
  { ch: 'city', title: isle('D'), at: { island: 'D' },
    text: `The heart of the city: offices, shops, government and the bright lights of the Neon Strip.` },
  { ch: 'city', title: isle('R'), at: { island: 'R' },
    text: `Houses and apartments you can buy, beaches and quiet streets. A home becomes your respawn point and your garage.` },
  { ch: 'city', title: isle('I'), at: { island: 'I' },
    text: `Docks, cranes, warehouses and rail yards - where the city's cargo comes and goes.` },
  { ch: 'city', title: isle('F'), at: { island: 'F' },
    text: `Farmland across the water from the city. The {{farm}} pays you to haul fresh produce back to town.` },

  // ---- basics --------------------------------------------------------------------------------
  { ch: 'basics', title: 'Moving and driving', at: { spawn: 'default' },
    text: `Move with [[move]] - push further to run. [[sprint]] sprints, [[dive]] dives out of the way. Walk up to any vehicle and press [[vehicle]] to get in: parked cars, traffic, even boats. [[gas]] accelerates, [[brake]] brakes and reverses. Taking one that isn't yours is a crime if anyone sees it. Bail out of a fast car and you tumble along the road - hit a wall at speed and it can kill you.` },
  { ch: 'basics', title: 'Into the water', at: { poi: 'marina' },
    text: `Cars can drive right onto the docks - and off the end. A car in the water sinks and blows up, but you climb out and swim: slower, no running or fighting, and you can climb ashore anywhere. Boats from {{marina}} slip under the bridges; swim or sail under one and you're hidden beneath the deck.` },
  { ch: 'basics', title: 'Fighting', at: { spawn: 'default' },
    text: `Aim with [[aim]] and attack with [[fire]]. Land punches in quick succession to floor someone - 3 hits for most people, 4 for tough guys. [[nextw]] switches weapons, [[reload]] reloads, [[throw]] throws what you're carrying. Guns are deadly: a pistol drops most people in ${Math.ceil(70 / (WEAPONS.pistol.dmg * NPC_GUN_MULT))}-${Math.ceil(140 / (WEAPONS.pistol.dmg * NPC_GUN_MULT))} shots and a cop in ${Math.ceil(140 / (WEAPONS.pistol.dmg * NPC_GUN_MULT))}-${Math.ceil(203 / (WEAPONS.pistol.dmg * NPC_GUN_MULT * 0.9))}, SWAT in ${Math.ceil(220 / (WEAPONS.pistol.dmg * NPC_GUN_MULT))} or more. A bazooka rocket wrecks any vehicle in one hit - the ${ARMORED_VEHICLES.map((id) => VEHICLES[id].name).join(' and the ')} take ${ARMORED_ROCKETS}. Cars shrug off ${Math.round((1 - 1 / VEHICLE_TOUGHNESS) * 100)}% of crash and gunfire damage; motorcycles don't, and a hard crash throws you off.` },
  { ch: 'basics', title: 'Your HUD and the map', at: { city: 1 },
    text: `The HUD shows your weapon, cash on hand, bank balance, wanted stars and the clock, plus the radar in the corner. [[map]] opens the full city map: pick a category - hospitals and police, banks and ATMs, shops, places to sell, garages, jobs, fishing, gang HQs, homes - to number every match on the map, choose one to set a waypoint, or tap anywhere on the map to drop your own. [[pause]] opens the pause menu (settings and controls). A day lasts ${dayMin} minutes and night ${nightMin} - at night witnesses see less and rain makes the roads slick.` },
  { ch: 'basics', title: 'Your phone', at: { city: 1 },
    text: `[[phone]] opens your phone. Places finds the nearest hospital, bank, ATM, shop, place to sell, garage or gang HQ and sets a waypoint - a subtle blip on your radar, or an arrow on its rim when it's far. Jobs lists deliveries priced ${JOB_TIERS.map((t) => t.name).join(' / ')} by distance (about $${Math.round(JOB_TIERS[0].base + JOB_TIERS[0].maxDist * 0.6 * JOB_TIERS[0].perPx)} to $${Math.round(JOB_TIERS[2].base + 9000 * JOB_TIERS[2].perPx)}) and farm harvests. One job at a time - cancel it from the phone and take another.` },
  { ch: 'basics', title: 'Hospitals', at: { pois: 'hospital' },
    text: `Hurt? Step onto the {{reception}} mat at any hospital for full treatment ($${HOSPITAL_FEE}). Below 30% health you bleed - [[use]] uses a med kit or bandage from the {{pharmacy}}. {{vending}}s sell energy drinks. If you die you wake up after ${RESPAWN_SECONDS} seconds - at any hospital you choose, or a home you own - and everything you carried stays on the street. You appear at one of several spots around the building, blinking for ${SPAWN_PROTECT_S} seconds: you can move, but you can't shoot or be hurt.` },
  { ch: 'basics', title: 'Cash vs. bank', at: { poi: 'bank' },
    text: `Cash on you is lost when you die or get robbed. Deposit it at the {{bank}} or any {{atm}}. Your bank balance is always safe, and anything you sell at a shop is paid straight into it. Log out mid-fight and your body stays in the world for ${GHOST_SECONDS} seconds.` },

  // ---- citizen -------------------------------------------------------------------------------
  { ch: 'citizen', title: 'The honest living', at: { poi: 'warehouse' }, route: { from: { poi: 'warehouse' }, to: { poi: 'delivery' }, veh: 'van' },
    text: `Grab a courier contract at {{warehouse}} in {{warehouse:where}} and haul crates to a {{delivery}} across the city. A company flatbed is parked by the pickup for you - taking it isn't stealing. Cargo rides in the open on pickups and flatbeds - anyone can see it and ambush you, so drive smart.` },
  { ch: 'citizen', title: 'Harvest contracts', at: { poi: 'farm' }, route: { from: { poi: 'farm' }, to: { poi: 'grocery' }, veh: 'pickup' },
    text: `Load produce boxes into an open-cargo vehicle at the {{farm}} and deliver them to {{grocery}} in {{grocery:where}}.` },
  { ch: 'citizen', title: 'Fishing', at: { pois: 'tackle' },
    text: `Buy a fishing pole at a {{tackle}} shop like the one in {{tackle:where}} ($${price('tackle', 'rod')}), the {{fishmarket}} ($${price('fishmarket', 'rod')}) or {{sports}} ($${price('sports', 'rod')}), cast at the water's edge and strike when it bites. Bait changes what bites: ${ITEMS.worms.name.toLowerCase()} for bass, ${ITEMS.shrimp.name.toLowerCase()} for salmon, ${ITEMS.squid.name.toLowerCase()} for tuna, a ${ITEMS.glowlure.name.toLowerCase()} for catfish at night. Sell your catch at any tackle shop or the market.` },
  { ch: 'citizen', title: 'Shopping', at: { poi: 'coffee' },
    text: `{{coffee}} boosts your stamina regen, {{hardware}} and {{sports}} sell melee weapons, {{gunshop}} sells legal guns, and {{pawn}} buys and sells second-hand gear.` },
  { ch: 'citizen', title: 'Homes', at: { homes: 'Pine Hills' },
    text: `Buy a {{home}} - as many as you like. Each can be your respawn point (you can still pick a hospital when you die), adds garage space, and lets you rest, bank your cash and stash items and guns. Stand at your door and go inside: you blink for ${HIDE_TIME_S} seconds, slowly then fast, and you're hidden - nobody can see or hurt you, and the police lose track of you. Step out and you blink for ${SPAWN_PROTECT_S} seconds of protection.` },
  { ch: 'citizen', title: 'Estates and garages', at: { estates: 1 },
    text: `Out past the city: a ${estate('farmhouse')}, the ${estate('cottage')}, a ${estate('beach')} on the sand and the ${estate('mansion')} with its huge yard and pool. Pull up to any of your garages and the door rolls open to take your car; every car you own can be taken out at any home you own. New cars at {{dealer}}, boats at {{marina}}, and {{garage}} repairs, washes and resprays.` },
  { ch: 'citizen', title: 'Good Samaritan points', at: { poi: 'evidence' },
    text: `Doing good earns Samaritan points: finish deliveries, stop a ${EVENT_KINDS.snatch.label.toLowerCase()} (an orange blip and arrow), then ${EVENT_KINDS.ret.label.toLowerCase()} to its owner (green), or carry contraband to the {{evidence}} for a reward. Points open up the badge (${ENFORCER_MIN_SAMARITAN}) and the bounty hunter license (${HUNTER_MIN_SAMARITAN}).` },

  // ---- criminal ------------------------------------------------------------------------------
  { ch: 'criminal', title: 'Crime needs a witness', at: { cameras: 1 },
    text: `Assault, theft, carjacking, murder - a crime only counts if someone sees it: a pedestrian, a cop, or one of the traffic cameras on poles at junctions. Nobody around? Nobody knows. Night shortens how far witnesses can see.` },
  { ch: 'criminal', title: 'Wanted stars', at: { district: 'Civic Center' }, route: { from: { poi: 'bank' }, to: { district: 'Southside' }, veh: 'sports', chaser: 'police' },
    text: `A reported crime earns wanted stars (★ at ${STAR_HEAT[1]} heat up to ★★★★★ at ${STAR_HEAT[5]}). Police come for you - tasers at low stars, guns from 3, SWAT at 4-5. Break line of sight and they only know a search circle that grows; stay hidden and the heat fades.` },
  { ch: 'criminal', title: 'Lying low', at: { poi: 'clothing' },
    text: `A new outfit at {{clothing}} ($${price('clothing', 'outfit')}) drops your public wanted level - but only if no cop is watching. The city remembers your peak: commit even a small crime in disguise and the heat spikes straight back. A respray at {{garage}} ($${price('garage', 'respray')}) hides a hot car and cleans the blood off the hood.` },
  { ch: 'criminal', title: 'Spray & Go', at: { pois: 'paint' },
    text: `Drive into the bay at a {{paint}} shop and stop. If nobody is watching, the shutter comes down for ${PAINT_TIME_S} seconds and you roll out in a new colour ($${PAINT_PRICE}, no repairs) - and with a clean wanted level. Seen going in while you're wanted? They won't touch it. Unload your cargo first.` },
  { ch: 'criminal', title: 'Contraband drops', at: { dropSites: 1 }, route: { from: { dropSites: 1 }, to: { poi: 'fence' }, veh: 'flatbed', chaser: 'police' },
    text: `Every few minutes rare crates land at a drop site - a ${EVENT_KINDS.drop.label.toLowerCase()} shows as a purple blip and rumor circle on the radar. Event arrows fade after ${ARROW_SHOW_S} seconds; the blips stay. Iron vaults and carbon-gold cases are worth a fortune at {{fence}} in {{fence:where}}, the black market (it also sells a Micro SMG for $${price('fence', 'smg')}). Everyone else wants them too.` },
  { ch: 'criminal', title: 'Gang turf', at: { turf: 1 },
    text: `{{turfs}} belong to the syndicate, run from headquarters like {{gang}} - your phone shows where. Their members attack outsiders, and fighting back on their turf isn't a crime. Muggers also prowl the streets - drop one and return the purse for Samaritan points.` },
  { ch: 'criminal', title: 'Gangs vs. police', at: { pois: 'gang' },
    text: `The syndicate leaves cops alone until provoked: an officer tearing past them faster than about ${kmh(GANG_PROVOKE_SPEED)} km/h, or shooting nearby, and they open fire - and the cops fight back. Every ${Math.round(SHOOTOUT_EVERY_S[0] / 60)}-${Math.round(SHOOTOUT_EVERY_S[1] / 60)} minutes a ${EVENT_KINDS.shootout.label.toLowerCase()} breaks out near the turf (a red blip and arrow). Stay clear, or pick a side.` },
  { ch: 'criminal', title: 'Busted or wasted', at: { poi: 'police' },
    text: `Get knocked out by a cop and cuffed and you're BUSTED: fined $${BUST_FINE_PER_STAR} per star, illegal weapons and contraband confiscated. Die and your wanted level is wiped, but you drop everything you carried. Felonies stay on your record and keep you off the police force - until you pay the fines ($${FELONY_FINE} per felony, not while wanted) at {{police}} or {{courthouse}} for a clean record.` },

  // ---- police --------------------------------------------------------------------------------
  { ch: 'police', title: 'Joining the force', at: { poi: 'police' },
    text: `Walk in the front door of {{police}} in {{police:where}} and sign up at the front desk (${ENFORCER_MIN_SAMARITAN}+ Samaritan points, zero felonies). You get a uniform, taser, nightstick and the ${WEAPONS.service.name} (${SERVICE_MAG}-round mag, ${SERVICE_AMMO} rounds), then the door locks behind you in the armory: check out one of the ${POLICE_ARMORY.filter((id) => id !== 'service').map((id) => WEAPONS[id].name.replace(/^Police /, '').toLowerCase()).join(', ')}. Your own weapons still work. No ducking inside mid-fight, and not while you're wanted.` },
  { ch: 'police', title: 'The motor pool', at: { poi: 'police' },
    text: `Out the armory's back door is the fenced motor pool: cruisers and police motorcycles, free to take - pick whichever you like. The sliding gate opens for officers only. Come back any time and drive in to swap; new recruits always find fresh vehicles waiting. Anyone else who takes one is stealing a police vehicle.` },
  { ch: 'police', title: 'Your cruiser', at: { poi: 'police' }, route: { from: { poi: 'police' }, to: { district: 'Neon Strip' }, veh: 'police', siren: 1 },
    text: `[[horn]] toggles the siren - with it on, traffic ahead slows and eases over to the kerb to let you through (never onto people). Some patrols ride police motorcycles too. Your cruiser is the blue square on your map. Wrecked or stolen? After ${CALL_COOLDOWN_S} seconds press [[cruiser]] and dispatch drives a new one to you, locked just for you. Leave it behind for long and it's towed back to HQ.` },
  { ch: 'police', title: 'Dispatch', at: { district: 'Downtown' },
    text: `On duty, [[map]] becomes the dispatch map: every crime that was witnessed or reported, live suspects you can see, and the search area for ones you can't. Crimes near you pulse red on the radar, and criminals in sight wear a small flashing marker.` },
  { ch: 'police', title: 'Patrol calls', at: { district: 'Neon Strip' },
    text: `On duty, your phone's Jobs app lists patrol calls. Drive to the district, look around for ${PATROL_SEARCH_S[0]}-${PATROL_SEARCH_S[1]} seconds and a crime kicks off nearby - stop the suspect for $${PATROL_PAY[0]}-${PATROL_PAY[1]}, paid to your bank.` },
  { ch: 'police', title: 'Making an arrest', at: { district: 'Midtown' },
    text: `A suspect must be knocked out before you can cuff them: floor them with punches, tase them, tackle them with [[dive]], or run them down. They stay down for ${SUBDUE_S} seconds - walk up and press [[action]] to cuff them for $${ARREST_REWARD_PER_STAR} per star. Even a dead suspect's body has to be booked.` },
  { ch: 'police', title: 'Code of conduct', at: { poi: 'police' },
    text: `Officers get ${MISCONDUCT_GRACE} strikes of misconduct (killing someone counts ${MISCONDUCT_WEIGHT.murder}, killing a cop ${MISCONDUCT_WEIGHT.copMurder}); each is forgotten after ${min(MISCONDUCT_RESET_MS)} minutes. Your HUD shows the count and warns you at the last one. One more and you're fired for ${min(FIRED_LOCKOUT_MS)} minutes - and that crime counts like anyone's.` },
  { ch: 'police', title: 'Armory and promotions', at: { poi: 'police' },
    text: `The HQ armory restocks your service pistol for free. Arrests and bounties earn promotions: ${POLICE_RANKS.map((r) => r.name).join(' → ')}. Higher ranks keep crime reports on the map longer.` },
  { ch: 'police', title: 'Bounty hunting', at: { poi: 'courthouse' },
    text: `Not a cop? Register at {{courthouse}} in {{courthouse:where}} as a bounty hunter (${HUNTER_MIN_SAMARITAN}+ Samaritan, not wanted). Bounty targets show as rough pings on your radar. Robbed by another player? Put a price on their head here.` },

  // ---- end -----------------------------------------------------------------------------------
  { ch: 'end', title: 'Pick your path', at: { city: 1 },
    text: `Earn honestly, live outside the law, or keep the streets clean. Watch this tour again any time from the title screen (not mid-game - no hiding in the tour when trouble finds you). See you on the streets.` },
];

// ---- resolvers -----------------------------------------------------------------------------
const WW = MAP_W * TILE, WH = MAP_H * TILE;
function box(pts, pad = 0) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pts) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
  return { x: (x0 + x1) / 2, y: (y0 + y1) / 2, w: x1 - x0 + pad * 2, h: y1 - y0 + pad * 2 };
}
function districtTiles(map, d) {
  let sx = 0, sy = 0, n = 0, x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let ty = 0; ty < MAP_H; ty += 2) for (let tx = 0; tx < MAP_W; tx += 2) {
    if (map.dist[ty * MAP_W + tx] !== d) continue;
    sx += tx; sy += ty; n++;
    x0 = Math.min(x0, tx); y0 = Math.min(y0, ty); x1 = Math.max(x1, tx); y1 = Math.max(y1, ty);
  }
  if (!n) return null;
  return { x: (sx / n + 0.5) * TILE, y: (sy / n + 0.5) * TILE, w: (x1 - x0 + 2) * TILE, h: (y1 - y0 + 2) * TILE };
}
const poiMark = (p) => ({ x: p.x, y: p.y, label: p.label, kind: p.kind });

// Where a step points the camera: { x, y, w, h } in world px plus labelled markers.
export function resolveTarget(map, at, ref) {
  if (!at || at.city) return { x: WW / 2, y: WH / 2, w: WW, h: WH, marks: [] };
  if (at.island) {
    const I = ISLANDS[at.island];
    if (!I) return null;
    const [x0, y0, x1, y1] = I.box;
    return { x: (x0 + x1) / 2 * TILE, y: (y0 + y1) / 2 * TILE, w: (x1 - x0) * TILE, h: (y1 - y0) * TILE, marks: islandMarks(map, at.island), label: I.name };
  }
  if (at.district) {
    const d = DISTRICTS.findIndex((q) => q.name === at.district);
    const r = d >= 0 ? districtTiles(map, d) : null;
    return r ? { ...r, w: Math.min(r.w, 2600), h: Math.min(r.h, 2000), marks: [], label: at.district } : null;
  }
  if (at.poi) {
    const list = map.pois.filter((p) => p.kind === at.poi);
    if (!list.length) return null;
    // with a reference point (route ends), pick the nearest; otherwise the first one
    let p = list[0];
    if (ref) p = list.reduce((b, q) => (Math.hypot(q.x - ref.x, q.y - ref.y) < Math.hypot(b.x - ref.x, b.y - ref.y) ? q : b), list[0]);
    if (at.poi === 'delivery' && ref) p = list.filter((q) => Math.hypot(q.x - ref.x, q.y - ref.y) > 1800).sort((a, b) => Math.hypot(a.x - ref.x, a.y - ref.y) - Math.hypot(b.x - ref.x, b.y - ref.y))[0] || p;
    return { x: p.x, y: p.y, w: 900, h: 620, marks: [poiMark(p)] };
  }
  if (at.pois) {
    const list = map.pois.filter((p) => p.kind === at.pois);
    if (!list.length) return null;
    return { ...box(list, 500), marks: list.map(poiMark) };
  }
  if (at.spawn) {
    const s = map.spawns[at.spawn];
    return s ? { x: s.x, y: s.y, w: 700, h: 480, marks: [] } : null;
  }
  if (at.cameras) {
    const hq = map.pois.find((p) => p.kind === 'police') || { x: WW / 2, y: WH / 2 };
    const cams = [...map.cameras].sort((a, b) => Math.hypot(a.x - hq.x, a.y - hq.y) - Math.hypot(b.x - hq.x, b.y - hq.y)).slice(0, 3);
    if (!cams.length) return null;
    return { ...box(cams, 450), marks: cams.map((c) => ({ x: c.x, y: c.y, label: 'Traffic camera', kind: 'camera' })) };
  }
  if (at.dropSites) {
    if (!map.dropSites.length) return null;
    if (ref) { const s = map.dropSites.reduce((b, q) => (Math.hypot(q.x - ref.x, q.y - ref.y) < Math.hypot(b.x - ref.x, b.y - ref.y) ? q : b)); return { x: s.x, y: s.y, w: 900, h: 600, marks: [{ x: s.x, y: s.y, label: 'Drop site', kind: 'drop' }] }; }
    return { ...box(map.dropSites, 900), marks: map.dropSites.map((s) => ({ x: s.x, y: s.y, label: 'Drop site', kind: 'drop' })) };
  }
  if (at.turf) {
    const parts = DISTRICTS.map((q, i) => (q.turf ? districtTiles(map, i) : null)).filter(Boolean);
    if (!parts.length) return null;
    const names = DISTRICTS.filter((q) => q.turf).map((q) => q.name);
    return { ...box(parts.flatMap((r) => [{ x: r.x - r.w / 2, y: r.y - r.h / 2 }, { x: r.x + r.w / 2, y: r.y + r.h / 2 }])), marks: parts.map((r, i) => ({ x: r.x, y: r.y, label: names[i], kind: 'turf' })) };
  }
  if (at.estates) {
    const list = map.homes.filter((h) => ESTATE_TYPES[h.kind]);
    if (!list.length) return null;
    return { ...box(list, 400), marks: list.map((h) => ({ x: h.x, y: h.y, label: h.name, kind: 'home' })) };
  }
  if (at.homes) {
    const d = DISTRICTS.findIndex((q) => q.name === at.homes);
    const list = map.pois.filter((p) => p.kind === 'home' && (d < 0 || map.dist[Math.floor(p.y / TILE) * MAP_W + Math.floor(p.x / TILE)] === d)).slice(0, 4);
    if (!list.length) return null;
    return { ...box(list, 350), marks: list.map(poiMark) };
  }
  return null;
}

// Road route between two targets (BFS over the junction graph), as a polyline in world px.
export function resolveRoute(map, route) {
  const a = resolveTarget(map, route.from);
  if (!a) return null;
  const from = a.marks[0] || a;
  const b = resolveTarget(map, route.to, from);
  if (!b) return null;
  const to = b.marks[0] || b;
  const s = map.nearestNode(from.x, from.y), g = map.nearestNode(to.x, to.y);
  if (!s || !g) return null;
  const prev = new Map([[s.id, -1]]);
  const q = [s.id];
  while (q.length) {
    const id = q.shift();
    if (id === g.id) break;
    for (const nid of Object.values(map.nodes[id].links)) if (!prev.has(nid)) { prev.set(nid, id); q.push(nid); }
  }
  const chain = [];
  for (let id = g.id; id !== -1 && id !== undefined; id = prev.get(id)) chain.unshift(map.nodes[id]);
  if (chain[0] !== s) return null;
  const pts = [{ x: from.x, y: from.y }, ...chain.map((n) => ({ x: n.x, y: n.y })), { x: to.x, y: to.y }];
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  return { pts, len, veh: route.veh, chaser: route.chaser || null, siren: !!route.siren, end: to };
}

// Which district / island a world point is in.
export function districtAt(map, x, y) {
  const d = map.dist[Math.floor(y / TILE) * MAP_W + Math.floor(x / TILE)];
  return DISTRICTS[d] ? DISTRICTS[d].name : null;
}
export function islandAt(x, y) {
  const tx = x / TILE, ty = y / TILE;
  for (const I of Object.values(ISLANDS)) { const [x0, y0, x1, y1] = I.box; if (tx >= x0 && tx < x1 && ty >= y0 && ty < y1) return I.name; }
  return null;
}
const turfNames = () => DISTRICTS.filter((q) => q.turf).map((q) => q.name);
const andList = (l) => (l.length <= 1 ? l.join('') : l.slice(0, -1).join(', ') + ' and ' + l[l.length - 1]);

// {{kind}} -> in-game name of that place, {{kind:where}} -> its district, {{turfs}} -> gang turf
export function fillNames(map, text) {
  return text.replace(/\{\{(\w+)(?::(\w+))?\}\}/g, (s, kind, mod) => {
    if (kind === 'turfs') return andList(turfNames());
    const p = map.pois.find((q) => q.kind === kind);
    if (!p) return s;
    if (mod === 'where') return districtAt(map, p.x, p.y) || islandAt(p.x, p.y) || 'the city';
    if (kind === 'home') return 'home';
    if (kind === 'delivery') return 'storefront';
    return p.label;
  });
}

// Island steps list what is actually there today (read from the map, never typed by hand).
const MINOR = new Set(['delivery', 'home', 'vending', 'atm', 'reception', 'evidence']);
export function stepExtra(map, step) {
  if (!step.at || !step.at.island) return '';
  const I = ISLANDS[step.at.island];
  const [x0, y0, x1, y1] = I.box;
  const inside = (p) => p.x / TILE >= x0 && p.x / TILE < x1 && p.y / TILE >= y0 && p.y / TILE < y1;
  const here = map.pois.filter((p) => !MINOR.has(p.kind) && inside(p)).map((p) => p.label);
  const homes = map.pois.filter((p) => p.kind === 'home' && inside(p)).length;
  const turf = DISTRICTS.filter((q, i) => q.turf && map.pois.length && (() => { for (let ty = y0; ty < y1; ty += 4) for (let tx = x0; tx < x1; tx += 4) if (map.dist[ty * MAP_W + tx] === i) return true; return false; })()).map((q) => q.name);
  const parts = [];
  if (here.length) parts.push('Here: ' + andList([...new Set(here)]) + '.');
  if (homes) parts.push(`${homes} homes for sale.`);
  if (turf.length) parts.push(`Gang turf: ${andList(turf)}.`);
  return parts.join(' ');
}

// Labels for an island step: every notable place on it.
export function islandMarks(map, k) {
  const I = ISLANDS[k];
  const [x0, y0, x1, y1] = I.box;
  return map.pois.filter((p) => !MINOR.has(p.kind) && p.x / TILE >= x0 && p.x / TILE < x1 && p.y / TILE >= y0 && p.y / TILE < y1).map(poiMark);
}

export function actionsIn(text) { return [...text.matchAll(/\[\[(\w+)\]\]/g)].map((m) => m[1]); }
export function placesIn(text) { return [...text.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]); }
