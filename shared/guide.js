// The Guide (the phone's app, client/guide.js): the in-game wiki, written from the game's own data so its numbers never
// drift - the rules (shared/rules.js), the shops' prices and the items (shared/items.js), the rods (shared/fish.js), the
// vehicles (shared/vehicles.js), and the controls by name ([[action]]: the page shows the key, the pad button or the touch
// button for the device in hand - shared/controls.js). Built when it's asked for (guideSections), never as the module
// loads, so a number changed anywhere shows the next time the Guide opens.
//   guideSections(map?) -> [{ id, title, blurb, entries: [{ id, t (title), b (body, [[action]] tokens) }] }]
//     map: the built map, if there is one - Places then counts what the world has of each kind
//   searchGuide(sections, q) -> [{ sec, e }] the entries whose title or body has every word of q
// Keeping it current (CLAUDE.md, the first-time experience): when a system changes, change its entry here (and its
// first-time moment in server/systems/ftue.js); test/guide.test.js checks the numbers come from the data.
import {
  STARTER, FTUE, HOSPITAL_FEE, RESPAWN_SECONDS, STAR_HEAT, BUST_FINE_PER_STAR, FELONY_FINE, ENFORCER_MIN_SAMARITAN, HUNTER_MIN_SAMARITAN,
  GANG_JOIN_FEE, MAILJOB, CAB, BUSJOB, TOWJOB, MEDIC, FISHING, DEEPSEA_PAY, DEEPSEA_CATCH, PAINT_PRICE, HIDE_TIME_S, AMBULANCE_FEE,
  REVIVE_KIT_PRICE, FLASHLIGHT_PRICE, BOAT_RENTAL_PRICE, BOAT_RENTAL_S, TRAIN_JOB_PAY, HOT_FENCE_CUT, HOT_PAWN_CUT, HOT_FAR_PX, JOB_TIERS,
  WORK_TRUCK_RETURN, ROB_TAKE, ROB_ALARM_S, HEIST, HELP_S, GHOST_SECONDS, DICE, MORTGAGE, POACH_PAY, SKILL, CRAZY, FARM,
} from './rules.js';
import { FORK, RANGER } from './rules-work.js';
import { SHOPS, ITEMS } from './items.js';
import { RODS } from './fish.js';
import { VEHICLES } from './vehicles.js';

const $ = (n) => '$' + Math.round(n).toLocaleString('en-US');
const pct = (k) => `${Math.round(k * 100)}%`;
const mins = (s) => { const m = s / 60; return `${Number.isInteger(m) ? m : m.toFixed(1)} minute${m === 1 ? '' : 's'}`; };
const meters = (px) => `${Math.round(px / 32)} m`;   // (32 px a meter: the map's own scale)
const priceOf = (shop, id, kind) => { const o = SHOPS[shop] && SHOPS[shop].buy.find((q) => q.id === id && (!kind || q.kind === kind)); return o ? o.price : null; };
const shopName = (shop) => (SHOPS[shop] ? SHOPS[shop].title : shop);
const rodName = (id) => RODS[id].name;
const andList = (l) => (l.length <= 1 ? l.join('') : `${l.slice(0, -1).join(', ')} and ${l[l.length - 1]}`);

// the places by kind: what each is for (the Places section; counted from the map when there is one)
const PLACE_NOTES = [
  ['hospital', 'Hospitals', () => `Walk in and step onto reception for full treatment (${$(HOSPITAL_FEE)}). You can wake up at any of them.`],
  ['police', 'Police stations', () => `Sign up for the force (${ENFORCER_MIN_SAMARITAN}+ Samaritan, no felonies), pay off felonies (${$(FELONY_FINE)} each).`],
  ['courthouse', 'Courthouses', () => `Register as a bounty hunter (${HUNTER_MIN_SAMARITAN}+ Samaritan); pay off felonies.`],
  ['bank', 'Banks and ATMs', () => 'Walk up to a cash machine and everything you carry goes into your bank, where nobody can take it.'],
  ['station', 'Train stations', () => 'Free trains both ways around the line; a parking lot and a taxi stand at most of them.'],
  ['convenience', 'Corner stores', () => `Snacks, coffee, energy drinks, bandages (${$(priceOf('convenience', 'bandage'))}) and flashlights.`],
  ['pharmacy', 'Pharmacies', () => `Med kits (${$(priceOf('pharmacy', 'medkit'))}), bandages and revive kits (${$(priceOf('pharmacy', 'revivekit'))}).`],
  ['gunshop', 'Gun stores', () => `From a pistol at ${$(priceOf('gunshop', 'pistol', 'weapon'))} up; ammunition too.`],
  ['clothing', 'Clothing stores', () => 'New clothes - and a change of look drops your wanted level if no officer is watching.'],
  ['garage', 'Fresh Coat Garages', () => `Repairs, a respray (${$(priceOf('garage', 'respray'))}) and your starter car if you've lost it.`],
  ['paint', 'Spray & Go', () => `Drive into the bay unseen: a new color and a clean wanted level (${$(PAINT_PRICE)}).`],
  ['dealer', 'Car dealerships', () => 'Buy a car; it goes in your garage. Your starter car is free here too.'],
  ['marina', 'Marinas', () => 'Buy a boat or a jet ski.'],
  ['rental', 'Boat hire', () => `A jet ski (${$(BOAT_RENTAL_PRICE.jetski)}) or a speedboat (${$(BOAT_RENTAL_PRICE.speedboat)}) for ${mins(BOAT_RENTAL_S)}.`],
  ['tackle', 'Bait and tackle', () => `Rods from ${$(priceOf('tackle', 'caneRod'))}, bait; they buy your catch.`],
  ['fishmarket', 'Fish markets', () => 'They buy your catch, and sell rods.'],
  ['warehouse', 'Depots', () => 'Courier contracts: haul a crate to a storefront.'],
  ['farm', 'Farm co-ops', () => `Harvest contracts and farm work on the fields (from ${$(FARM.pay.sow)} a row).`],
  ['pawn', 'Pawn shops', () => `Buy and sell gear; they take hot money for a ${pct(HOT_PAWN_CUT)} cut.`],
  ['fence', 'The black market', () => `Buys stolen cargo and hot money (a ${pct(HOT_FENCE_CUT)} cut), sells silent guns, and has the mail train job.`],
  ['gang', 'Gang HQs', () => `Join the Syndicate for ${$(GANG_JOIN_FEE)}: its turf leaves members be.`],
  ['bowling', 'Bowling alleys', () => 'Rent a lane.'],
  ['cinema', 'Cinemas', () => 'Tickets, popcorn and a film.'],
  ['bathhouse', 'Bathhouses', () => 'Showers, hot baths and a sauna.'],
];

export function guideSections(map = null) {
  const count = (kind) => (map ? (map.places || map.pois || []).filter((q) => q && q.kind === kind).length : 0);
  const starter = VEHICLES.starter.name;
  const tiers = JOB_TIERS.map((t) => t.base);
  const rods = Object.keys(RODS).filter((id) => priceOf('tackle', id) !== null).map((id) => `${rodName(id)} ${$(priceOf('tackle', id))}`);
  const drive = SKILL.act.drive;
  const sections = [
    { id: 'around', title: 'Getting around', blurb: 'On foot, at the wheel, and the city\'s free transit.', entries: [
      { id: 'move', t: 'On foot', b: '[[move]] moves you; push all the way to run. [[sprint]] sprints and [[dive]] dives out of the way.' },
      { id: 'drive', t: 'Driving', b: `Walk up to any vehicle and press [[vehicle]] to get in. [[gas]] goes, [[brake]] brakes and reverses. Taking one that isn't yours is a crime if anyone sees it. Driving earns driving skill (up to ${drive.cap} xp a day).` },
      { id: 'starter', t: 'Your starter car', b: `A ${starter}, registered to you and free. Lose it and another is free at any public garage - a station parking lot, a Fresh Coat Garage or a dealership - ${mins(STARTER.cooldownS)} later. Own a home with a garage and it lives there.` },
      { id: 'map', t: 'The map and waypoints', b: '[[map]] opens the map: pick a place, or tap anywhere, for a waypoint and a route along the roads.' },
      { id: 'bus', t: 'Buses', b: 'Free, any distance. Wait at a stop and press [[action]] when the bus pulls up; [[vehicle]] gets you off at any stop. Your phone\'s Transit app shows when the next one comes.' },
      { id: 'train', t: 'Trains', b: 'Free. When a train is in, walk up to its doors and press [[action]] to board; [[vehicle]] gets you off at a station. Each platform counts down to the next train.' },
      { id: 'ferry', t: 'Ferries', b: 'Free. Walk aboard at the pier while the boat is in; on a car ferry, drive up to its stern and press [[action]].' },
      { id: 'taxi', t: 'Taxis', b: 'Call one from your phone\'s Transit app: it drives to wherever your waypoint is.' },
      { id: 'boats', t: 'Boats', b: `Hire one at a boat rental dock - a kayak (${$(BOAT_RENTAL_PRICE.kayak)}), a jet ski (${$(BOAT_RENTAL_PRICE.jetski)}), a speedboat (${$(BOAT_RENTAL_PRICE.speedboat)}) - for ${mins(BOAT_RENTAL_S)}, or buy one at a marina.` },
    ] },
    { id: 'earn', title: 'Ways to earn', blurb: 'Honest work, a hustle, or the great outdoors - you can do all of it.', entries: [
      { id: 'jobs', t: 'Finding work', b: 'One job at a time. Your phone\'s Jobs app lists them with what they pay, or walk up to a job\'s place and press [[action]] for its card.' },
      { id: 'mail', t: 'Mail carrier', b: `At a post office: a walking round of ${MAILJOB.walk} homes (${$(MAILJOB.letter)} a letter) or a van round of ${MAILJOB.van} with parcels (${$(MAILJOB.parcel)} each), and ${$(MAILJOB.bonus)} for the whole round.` },
      { id: 'courier', t: 'Deliveries', b: `Haul a crate from a depot to a storefront: from ${$(Math.min(...tiers))} by the distance. Cargo rides in the open - anyone can ambush you for it.` },
      { id: 'cab', t: 'Taxi and bus driving', b: `A taxi from any rank: ${$(CAB.flag)} a fare plus ${$(CAB.perKm)} a km, and up to ${pct(CAB.tip)} more for a smooth ride. Crazy Taxi pays against the clock. A bus line pays ${$(BUSJOB.perStop)} a stop on time and ${$(BUSJOB.perPax)} a passenger.` },
      { id: 'service', t: 'Paramedic, firefighter, tow truck', b: `Sign on at a hospital, a fire station or an impound: calls paid ${$(MEDIC.pay.minor)}-${$(MEDIC.pay.serious)} for a patient, ${$(TOWJOB.pay)} and up for a tow.` },
      { id: 'yard', t: 'Forklift, ranger, the farm', b: `A forklift shift pays ${$(FORK.perLoad)} a pallet; a park ranger ${$(Math.min(...Object.values(RANGER.pay)))}-${$(Math.max(...Object.values(RANGER.pay)))} a task; farm work ${$(FARM.pay.harvest)} a harvested row.` },
      { id: 'truck', t: 'The work truck', b: `A job's vehicle is yours while it lasts. Bring it back when you're done for ${$(WORK_TRUCK_RETURN)} more.` },
      { id: 'fishpay', t: 'Fishing for money', b: `Your cooler holds ${FISHING.creel} fish; sell them at a bait shop or a fish market. A deep-sea charter pays ${$(DEEPSEA_PAY)} for ${DEEPSEA_CATCH} offshore fish.` },
      { id: 'hustle', t: 'A little hustle', b: `The black market buys stolen cargo and has the mail train job (${$(TRAIN_JOB_PAY)} when the strongbox is fenced). Robbing a till pays about ${$(ROB_TAKE.convenience)} a wad; a bank's vault up to ${$(HEIST.cash)}. All of it is a crime - see The law.` },
    ] },
    { id: 'law', title: 'The law', blurb: 'What counts as a crime, the stars, and getting back up.', entries: [
      { id: 'witness', t: 'Crimes need a witness', b: 'A crime counts only if someone sees it: a passer-by, an officer or a camera. Safety mode (Settings) asks before you do something that would be one.' },
      { id: 'stars', t: 'Wanted stars', b: `Each reported crime adds heat: one star at ${STAR_HEAT[1]}, five at ${STAR_HEAT[5]}. Get out of the officers' sight and lie low - the heat fades. Change your look unseen, or drive a car into a Spray & Go, to lose it faster.` },
      { id: 'busted', t: 'Busted', b: `Knocked out by an officer and cuffed: fined ${$(BUST_FINE_PER_STAR)} a star, and illegal gear taken. Felonies stay on your record until you pay ${$(FELONY_FINE)} each at a police station or a courthouse.` },
      { id: 'down', t: 'Knocked down', b: `Down, you drop your cash and what you carry. You have ${RESPAWN_SECONDS} seconds to pick where to wake up - a hospital or a home of yours - or call for help and wait up to ${mins(HELP_S)} for a revive. An ambulance costs ${$(AMBULANCE_FEE)} if it brings you round.` },
      { id: 'hot', t: 'Hot money', b: `A robbery's takings go in a bag on your back. Bank them at an ATM at least ${meters(HOT_FAR_PX)} from where you took them (while no one's after you), stash them at a home, or sell them to a fence for a ${pct(HOT_FENCE_CUT)} cut.` },
      { id: 'robbery', t: 'Holding up a store', b: `Point a gun at a clerk and they hand over the till. A silent alarm trips ${ROB_ALARM_S.slice(0, -1).join(', ')} or ${ROB_ALARM_S[ROB_ALARM_S.length - 1]} seconds in - you never know which.` },
      { id: 'badge', t: 'Joining the force', b: `With ${ENFORCER_MIN_SAMARITAN}+ Samaritan points and no felonies, sign up at a police station: a uniform, a cruiser, patrol calls. Bounty hunting takes ${HUNTER_MIN_SAMARITAN}+ points.` },
      { id: 'leave', t: 'Logging off', b: `Close the game mid-fight and your body stays in the city ${GHOST_SECONDS} seconds. The pause menu's Log off counts you out safely.` },
    ] },
    { id: 'places', title: 'Places', blurb: map ? 'What the city has, and what each is for. Your phone\'s Places app finds the nearest.' : 'What each place is for. Your phone\'s Places app finds the nearest.', entries:
      PLACE_NOTES.map(([kind, t, b]) => ({ id: kind, t: map && count(kind) ? `${t} (${count(kind)})` : t, b: b() })).filter((e) => !map || count(e.id) || e.id === 'paint') },
    { id: 'activities', title: 'Activities', blurb: 'Things to do that aren\'t work.', entries: [
      { id: 'fishing', t: 'Fishing', b: `Face the water with a rod and hold [[action]] to cast - let go for the distance. When the bobber dives, press to strike, then hold to keep the fish in your bar. Rods: ${andList(rods)}. Bait changes what bites.` },
      { id: 'games', t: 'Games in town', b: 'Arcades, bowling, pool, the cinema, the drive-in after dark, chess in the park and back-alley dice.' },
      { id: 'dice', t: 'Street dice', b: `A crew shooting dice down an alley or a back passage in a rough part of town, like Southside's: ${$(DICE.bet)} a roll from the cash you carry, even money.` },
      { id: 'races', t: 'Races and skating', b: 'Pull up to a race\'s start to enter. Skate parks score your tricks; beaches have surf.' },
      { id: 'crazy', t: 'Crazy Taxi', b: `A run against the clock from any taxi rank: ${CRAZY.startS} seconds on it to start, more for each fare you get there fast.` },
      { id: 'skills', t: 'Skills', b: `Six skills level up as you do things, ${SKILL.max} levels each - up to +${pct(SKILL.top)} at the top. Your phone's Skills app shows them.` },
    ] },
    { id: 'property', title: 'Property', blurb: 'Homes, garages and what they do for you.', entries: [
      { id: 'homes', t: 'Homes', b: `Buy as many as you like (your phone's Homes app lists them). A home is a place to wake up, stash cash and gear, and hide: inside, nobody can see or hurt you - you blink in for ${HIDE_TIME_S} seconds at the door.` },
      { id: 'mortgage', t: 'Mortgages', b: `${pct(MORTGAGE.deposit)} down; the bank lends the rest, ${pct(MORTGAGE.rate)} on top, paid from your bank a day at a time over ${MORTGAGE.days} in-game days. Miss more than ${MORTGAGE.miss} in a row and it takes the home back.` },
      { id: 'garage', t: 'Garages', b: 'Drive up to your garage and the door rolls open for your car. Every car you own can be taken out at any of your homes.' },
      { id: 'gang', t: 'The Syndicate', b: `Members pay ${$(GANG_JOIN_FEE)} once; the turf leaves them be, and the Smuggler's Den has their work: poaching runs from ${$(POACH_PAY.turtle)}.` },
    ] },
    { id: 'items', title: 'Items', blurb: 'Your bag, healing, lights and gear.', entries: [
      { id: 'bag', t: 'Your bag', b: '[[bag]] opens your bag; it doesn\'t pause the city. Hold [[use]] for the quick wheel: point at a thing and let go to use it.' },
      { id: 'heal', t: 'Healing', b: `A bandage heals ${ITEMS.bandage.heal} and stops bleeding (${$(priceOf('pharmacy', 'bandage'))} at a pharmacy), a med kit ${ITEMS.medkit.heal} (${$(priceOf('pharmacy', 'medkit'))}). A hospital patches you up fully for ${$(HOSPITAL_FEE)}.` },
      { id: 'revive', t: 'Reviving someone', b: `Hold [[action]] over someone who's down. A revive kit (${$(REVIVE_KIT_PRICE)}) brings them back at full health and is never used up.` },
      { id: 'light', t: 'Lights', b: `A flashlight (${$(FLASHLIGHT_PRICE)} at hardware and corner stores) never wears out: [[light]] switches it on and off.` },
      { id: 'shop', t: 'Buying', b: 'At a counter, pick a line to buy it. Your cash goes first, then your bank. Things you can use go in your bag.' },
      { id: 'rods', t: 'Rods and bait', b: `A ${rodName('caneRod')} holds up to ${RODS.caneRod.lb} lb; a ${rodName('rod')} ${RODS.rod.lb} lb. Each fish hooked uses one bait. The great outdoors start comes with a ${ITEMS[FTUE.rod].name.toLowerCase()} and ${FTUE.bait[1]} ${ITEMS[FTUE.bait[0]].name.toLowerCase()}.` },
    ] },
  ];
  return sections;
}

// every word of q in an entry's title or body (the tokens read as their names): [{ sec, e }]
export function searchGuide(sections, q) {
  const words = String(q || '').toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const out = [];
  for (const sec of sections) for (const e of sec.entries) {
    const hay = `${e.t} ${e.b} ${sec.title}`.toLowerCase().replace(/\[\[(\w+)\]\]/g, ' $1 ');
    if (words.every((w) => hay.includes(w))) out.push({ sec, e });
  }
  return out;
}
