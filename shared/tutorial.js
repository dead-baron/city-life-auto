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
  ROB_WARMUP_S, ROB_TOSS_S, ROB_TAKE, ROB_ALARM_S, ROB_RESPONSE_S, ROB_ALARM_STARS,
  MATCH_COUNTDOWN_S, SOCCER_GOALS, SOCCER_MATCH_S, VOLLEY_POINTS, MATCH_PRIZE,
  TRAIN_SPEED, TRAIN_DWELL_S, TRAIN_DRAG_EXPLODE_S, CROSSING_WARN_PX, TRAIN_JOB_PAY, STRONGBOX_CRACK_S, TRAIN_ALARM_STARS, TRAIN_HEADWAY_S, MAIL_WARN_S,
  BAIL_HURT_SPEED, NPC_GRIT, NPC_CRITICAL, HIGHWAY_SPEED, BARRIER_BREAK_SPEED, BARRIER_REPAIR_S,
  POLICE_ARMORY, GANG_JOIN_FEE, POACH_PAY, NET_TIME_S, DEEPSEA_CATCH, DEEPSEA_PAY, FELONY_FINE, GANG_PROVOKE_SPEED, SHOOTOUT_EVERY_S, PAINT_PRICE, PAINT_TIME_S, HIDE_TIME_S, SPAWN_PROTECT_S,
  BOAT_RENTAL_S, BOAT_RENTAL_GRACE_S, BOAT_RENTAL_PRICE,
} from './rules.js';

// Bump when the tour changes enough that returning players should be offered it again.
export const TUTORIAL_VERSION = 17;

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
//   { crossings: 1 } (level crossings) | { rural: 1 } (the long rural run of the railway) | { ring: 1 } (the ring highway)
// route: an animated vehicle driving the road network between two targets (optional chaser).
export const STEPS = [
  // ---- the city ------------------------------------------------------------------------------
  { ch: 'city', title: 'Welcome to the city', at: { city: 1 },
    text: `${isle('D')} fills the big island in the middle of the bay: towers inside a ring highway, ${isle('R')} across the river, the farms and desert of ${isle('F')} out east. Highways run out over long bridges to ${isle('W')} in the west, ${isle('N')} in the north and ${isle('S')} in the south, and one more bridge to the little town on ${isle('P')}; ${isle('G')} and ${isle('C')} you reach by boat. Everyone shares one living world - other players, traffic, cops and crooks. Live as a citizen, a criminal or a police officer, and switch whenever you like.` },
  { ch: 'city', title: isle('D'), at: { island: 'D' },
    text: `The heart of it all. Downtown's towers and the Civic Center inside the ring, Broadway cutting across the grid on the diagonal, the Neon Strip and the Pink Mile toward the river, Bayside Heights' crescents and villas, Old Town's worn brick up north, the docks of the Harbor and the rough Yards in the south-west. The richer the street, the more people carry - and the faster the police turn up.` },
  { ch: 'city', title: 'The ring highway', at: { ring: 1 },
    text: `An elevated highway loops around downtown on concrete pillars, three lanes each way. Get on from the one-way frontage roads that run beside it: an on-ramp climbs up and merges from the right, exits peel off to the right and drop back down. Up on the deck there are no lights and no crossings - just traffic doing ${kmh(HIGHWAY_SPEED)} km/h (you can walk up a ramp, but mind the traffic). Down below, the avenues pass underneath it; anything up top is a level of its own, so you can't shoot or hit people on the street below. The concrete barriers hold at normal speeds, but ram one head-on faster than about ${kmh(BARRIER_BREAK_SPEED)} km/h and it gives way - over the edge you go, a hard drop onto the street below. The road crew puts a smashed barrier back after ${Math.round(BARRIER_REPAIR_S / 60)} minutes.` },
  { ch: 'city', title: isle('R'), at: { island: 'R' },
    text: `Across the river bridges: the winding streets and cul-de-sacs of Pine Hills, where houses and apartments are for sale, and the gang-run grid of Southside. A home becomes your respawn point and your garage.` },
  { ch: 'city', title: isle('F'), at: { island: 'F' },
    text: `Farm country east of the city: fields, farmhouses and the {{farm}}, which pays you to haul fresh produce back to town. Past the fields the desert takes over - mesas, cactus, a mirage of a lake, the cliffs and lonely homestead of Red Rock Canyon, and a little airstrip - with the Desert Highway looping round it from the county road to the Eastern Parkway, where every street of town ends.` },
  { ch: 'city', title: isle('W'), at: { island: 'W' },
    text: `The second city, over the Bay Bridge from Sunset Beach. Westport Center's towers, Lakeview's villas round the lake in Lakeview Park, the stadium, the brick lanes of the Old Quarter and the houses of West Hills sit inside the Westport Beltway. Down the south-west coast the piers of Port Westport (gang turf) run out to sea beside {{airport}} - ship cargo to the terminal like any delivery. North of town the Highland Road climbs into the Highland Woods, where dirt tracks lead to cabins for sale.` },
  { ch: 'city', title: isle('N'), at: { island: 'N' },
    text: `Two bridges run north from Old Town straight up into the grid of Northshore, inside the Northshore Loop, with big houses round The Bluffs to the east. West of town the Northern Causeway runs along the foot of the Granite Peaks to Westport; dirt trails climb to a mountain lodge and a tarn up in the rocks.` },
  { ch: 'city', title: isle('S'), at: { island: 'S' },
    text: `Over the Cedar Bridge from The Yards (or the Strait Bridge from Westport): the small town of Cedar Falls, the winding drives of the Lake District between its lakes, the fields of Cedar Farms with their own market stand that takes harvests, and the quays of South Port, all inside the Cedar Isle Loop. Dirt tracks run up into the Cedar Hills, where the fairways and ponds of the Cedar Hills Golf Club roll out across the countryside.` },
  { ch: 'city', title: isle('P'), at: { island: 'P' },
    text: `Over Pelican Way from Westport: a few streets of little shops and houses, and at the beach end a beach bar and the {{charter}} dock with jet skis tied up. Jet ski and boat races start from the buoys off its shore.` },
  { ch: 'city', title: isle('G'), at: { island: 'G' },
    text: `Two little islands far out in the south - the villages of Gull Harbor and Coral Cay, each round its village green. No bridge reaches them: take a boat. Out in the bay between Westport and Metro City lies Paradise Cay, a palm island with a beach camp, a cabin and a jetty to tie up at.` },
  { ch: 'city', title: 'The roads', at: { city: 1 },
    text: `Roads join up the way they would in a real city: highways meet major avenues and arterials at signalled junctions, those feed the streets, streets feed the little residential roads and cul-de-sacs, and out in the country the county roads lead off them to dirt tracks into the woods, the hills and the desert. A dirt track is slow going for anything but a pickup or a bike. Downtown the traffic lights hang from wires strung between the buildings; elsewhere they stand on poles at the kerb - and a pole, like a lamp post, goes over if you hit it hard enough.` },
  { ch: 'city', title: isle('C'), at: { island: 'C' },
    text: `The Syndicate's island fortress, off the far shore of ${isle('F')}. Guards shoot outsiders on sight, and the compound gate only opens for gang members - home of the {{smuggler}}.` },

  { ch: 'city', title: 'The railway', at: { pois: 'station' },
    text: `Three-car trains run one huge loop round the whole map at up to ${kmh(TRAIN_SPEED)} km/h, one into each station about every ${TRAIN_HEADWAY_S} seconds: through the middle of ${isle('W')}, over the long bay bridge to ${isle('N')}, across the channel into Old Town, down through the fields of ${isle('F')}, back through ${isle('R')}, then down into the subway under the heart of ${isle('D')}, out past The Yards, over the river mouth to ${isle('S')} and across the strait home again. Wherever it meets a highway it ducks under it through a short tunnel. They ease into every {{station}} for ${TRAIN_DWELL_S} seconds - a few stops on every island. Each platform has a clock counting down to the next train; when one is in, the platform edge glows green and arrows point at the doors - walk onto the platform and press [[action]] to board. At the subway stations, press [[action]] at the stairway down from the street while a train is in. Inside, the roof comes off so you can see the cars: walk through them while it moves, sit back and watch the city go by. [[vehicle]] gets you off at a station - or leap from the door of a moving train: at a crawl you just roll, at full speed the landing can break bones. Running alongside a slow train, or driving level with it, you can hop on too.` },
  { ch: 'city', title: 'Level crossings', at: { crossings: 1 },
    text: `Where the line crosses a road the gates drop when a train is within ${Math.round(CROSSING_WARN_PX / TILE)} m. Most drivers wait; some gamble, and cops on a chase often try to beat the train. You can smash straight through the arms. Nothing stops a train and nothing hurts it: anyone on the tracks gets thrown, and a car caught on the front of the engine is dragged along - steer it off within ${TRAIN_DRAG_EXPLODE_S} seconds or it blows up.` },
  // ---- basics --------------------------------------------------------------------------------
  { ch: 'basics', title: 'Moving and driving', at: { spawn: 'default' },
    text: `Move with [[move]] - push further to run. [[sprint]] sprints, [[dive]] dives out of the way. Walk up to any vehicle and press [[vehicle]] to get in: parked cars, traffic, even boats. [[gas]] accelerates, [[brake]] brakes hard and reverses. The cars have real weight: brake into a corner and the nose bites, carry too much speed and it pushes wide (worse in the rain). Steer while braking at speed, flick [[dive]] (the handbrake) with the wheel turned, or floor it through a tight turn and the tail slides out into a drift - keep the gas on and counter-steer to hold it, lift off to grip again. Hold [[dive]] with the gas floored at a standstill for a smoking burnout and let go to launch; add the wheel and you spin donuts. Taking a vehicle that isn't yours is a crime if anyone sees it. [[vehicle]] while moving bails out: slower than about ${kmh(BAIL_HURT_SPEED / 0.8)} km/h you just tuck and roll, unhurt; faster and the landing hurts - flat out, a faceplant or a wall can kill you.` },
  { ch: 'basics', title: 'Into the water', at: { poi: 'marina' },
    text: `Cars can drive right onto the docks - and off the end. A car in the water sinks and blows up, but you climb out and swim: slower, no running or fighting, and you can climb ashore anywhere. Boats from {{marina}} slip under the bridges; swim or sail under one and you're hidden beneath the deck.` },
  { ch: 'basics', title: 'Fighting', at: { spawn: 'default' },
    text: `Aim with [[aim]] and attack with [[fire]]. Land punches in quick succession to floor someone - 3 hits for most people, 4 for tough guys. [[nextw]] switches weapons, [[reload]] reloads, [[throw]] throws what you're carrying. Guns are deadly: a pistol drops most people in ${Math.ceil(70 / (WEAPONS.pistol.dmg * NPC_GUN_MULT))}-${Math.ceil(140 / (WEAPONS.pistol.dmg * NPC_GUN_MULT))} shots and a cop in ${Math.ceil(140 / (WEAPONS.pistol.dmg * NPC_GUN_MULT))}-${Math.ceil(203 / (WEAPONS.pistol.dmg * NPC_GUN_MULT * 0.9))}, SWAT in ${Math.ceil(220 / (WEAPONS.pistol.dmg * NPC_GUN_MULT))} or more - though some people are just harder to put down (about ${NPC_GRIT.filter(([g]) => g > 1).reduce((a, [, w]) => a + w, 0)}% take extra bullets, the toughest ${NPC_GRIT[NPC_GRIT.length - 1][0]}x as many). Below ${Math.round(NPC_CRITICAL * 100)}% health anyone bleeds, leaving a trail of blood; people that badly hurt stop fighting and limp away. A bazooka rocket wrecks any vehicle in one hit - the ${ARMORED_VEHICLES.map((id) => VEHICLES[id].name).join(' and the ')} take ${ARMORED_ROCKETS}. Cars shrug off ${Math.round((1 - 1 / VEHICLE_TOUGHNESS) * 100)}% of crash and gunfire damage; motorcycles don't, and a hard crash throws you off.` },
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
    text: `Grab a courier contract at {{warehouse}} in {{warehouse:where}} and haul crates to a {{delivery}} across the city. A company flatbed is parked by the pickup for you - taking it isn't stealing. Cargo rides in the open on every vehicle - one crate on a bike, jet ski or car trunk, a few in a pickup or van, more on a flatbed, a whole roof-load on an armored truck. Anyone can see it and ambush you, so drive smart.` },
  { ch: 'citizen', title: 'Harvest contracts', at: { poi: 'farm' }, route: { from: { poi: 'farm' }, to: { poi: 'grocery' }, veh: 'pickup' },
    text: `Load produce boxes into an open-cargo vehicle at the {{farm}} and deliver them to {{grocery}} in {{grocery:where}}.` },
  { ch: 'citizen', title: 'Fishing', at: { pois: 'tackle' },
    text: `Buy a fishing pole at a {{tackle}} shop like the one in {{tackle:where}} ($${price('tackle', 'rod')}), the {{fishmarket}} ($${price('fishmarket', 'rod')}) or {{sports}} ($${price('sports', 'rod')}), cast at the water's edge and strike when it bites. Bait changes what bites: ${ITEMS.worms.name.toLowerCase()} for bass, ${ITEMS.shrimp.name.toLowerCase()} for salmon, ${ITEMS.squid.name.toLowerCase()} for tuna, a ${ITEMS.glowlure.name.toLowerCase()} for catfish at night. Sell your catch at any tackle shop or the market.` },
  { ch: 'citizen', title: 'Out on the water', at: { poi: 'charter' },
    text: `Buy a jet ski, dinghy or speedboat at {{marina}}, or borrow one from a dock. NPC boaters cruise the bay and harbor police patrol it. Book a deep-sea charter at {{charter}}: head far from land, sit still and fish over the side for grouper, swordfish and marlin - land ${DEEPSEA_CATCH} for a $${DEEPSEA_PAY} bonus.` },
  { ch: 'citizen', title: 'Boat hire and boathouses', at: { poi: 'rental' },
    text: `No boat of your own? Hire one at {{rental}} or any other rental dock: a jet ski ($${BOAT_RENTAL_PRICE.jetski}), a dock motorboat ($${BOAT_RENTAL_PRICE.dinghy}) or a speedboat ($${BOAT_RENTAL_PRICE.speedboat}, not on the lakes) for ${Math.round(BOAT_RENTAL_S / 60)} minutes. Hand it back at any rental dock; leave it lying about and the company tows it home, but stay out more than ${BOAT_RENTAL_GRACE_S} seconds past your time and it's reported stolen. Some homes sit right on the water with a private pier and a boathouse: pull a boat you own into the slip to moor it, and take any of your boats out from the house.` },
  { ch: 'citizen', title: 'Races', at: { island: 'P' },
    text: `Pull up to a start buoy on a jet ski (jet ski sprint) or in a boat (boat classic) to enter. A countdown lets others join, then it's buoy to buoy - the arrow on your radar shows the next one. Prize money goes to the top three; turn up mid-race and you're in the next round. Leave your craft and you forfeit.` },
  { ch: 'citizen', title: 'Soccer and volleyball', at: { district: 'Greenfield Park' },
    text: `The ball is always out on the Greenfield Park pitch and the beach volleyball courts (Sunset Beach, Pelican Key) - kick it about any time with [[fire]] next to it. When two or more players are on, a match starts after ${MATCH_COUNTDOWN_S} seconds, sides picked by where you stand: soccer is first to ${SOCCER_GOALS} goals or the lead after ${Math.round(SOCCER_MATCH_S / 60)} minutes, volleyball first to ${VOLLEY_POINTS} points. Winners get $${MATCH_PRIZE}. Walk off and you forfeit; late arrivals play the next round. Weapons still work - if one side is wiped out, the last team standing wins.` },
  { ch: 'citizen', title: 'Shopping', at: { poi: 'coffee' },
    text: `Shops, banks, hospitals, the courthouse and police stations are walk-in: the doors slide open, the roof fades away while you're inside, and you deal with the clerk across the counter (the pawn shop and bank serve you through glass). {{coffee}} boosts your stamina regen, {{hardware}} and {{sports}} sell melee weapons, {{gunshop}} sells legal guns, and {{pawn}} buys and sells second-hand gear.` },
  { ch: 'citizen', title: 'Homes', at: { homes: 'Pine Hills' },
    text: `Buy a {{home}} - as many as you like. Each can be your respawn point (you can still pick a hospital when you die), adds garage space, and lets you rest, bank your cash and stash items and guns. Stand at your door and go inside: you blink for ${HIDE_TIME_S} seconds, slowly then fast, and you're hidden - nobody can see or hurt you, and the police lose track of you. Step out and you blink for ${SPAWN_PROTECT_S} seconds of protection. Inside you can change your outfit, check what you're carrying, and pick any car from your garage: say you're ready, the garage door rolls up and you ease out, blinking, before you take the wheel.` },
  { ch: 'citizen', title: 'Estates and garages', at: { estates: 1 },
    text: `A ${estate('farmhouse')} or a ${estate('cottage')} out in ${isle('F')}, on Cedar Farms, in the Highland Woods and the Cedar Hills or up in the Granite Peaks, a ${estate('beach')} on Sunset Beach and the ${estate('mansion')} up in Bayside Heights with its huge walled yard and pool. Pull up to any of your garages and the door rolls open to take your car; every car you own can be taken out at any home you own. New cars at {{dealer}} - walk its lot and buy whatever's in stock off the price tags, or order from the showroom - boats at {{marina}}, and {{garage}} repairs, washes and resprays.` },
  { ch: 'citizen', title: 'Good Samaritan points', at: { poi: 'evidence' },
    text: `Doing good earns Samaritan points: finish deliveries, stop a ${EVENT_KINDS.snatch.label.toLowerCase()} (an orange blip and arrow), then ${EVENT_KINDS.ret.label.toLowerCase()} to its owner (green), or carry contraband to the {{evidence}} for a reward. Points open up the badge (${ENFORCER_MIN_SAMARITAN}) and the bounty hunter license (${HUNTER_MIN_SAMARITAN}).` },

  // ---- criminal ------------------------------------------------------------------------------
  { ch: 'criminal', title: 'Crime needs a witness', at: { cameras: 1 },
    text: `Assault, theft, carjacking, murder - a crime only counts if someone sees it: a pedestrian, a cop, or one of the traffic cameras on poles at junctions. Nobody around? Nobody knows. Night shortens how far witnesses can see.` },
  { ch: 'criminal', title: 'Silent and deadly', at: { poi: 'fence' },
    text: `A ${WEAPONS.spistol.name.toLowerCase()} from {{fence}} only makes a cough - nobody hears it, so a kill only counts if someone actually watches. A ${WEAPONS.knife.name.toLowerCase()} in the back (or into someone who never saw you coming) kills in one stab, quietly.` },
  { ch: 'criminal', title: 'Holding up a store', at: { poi: 'gasstation' },
    text: `Walk into a {{convenience}}, a {{gasstation}}, any shop or a bank and point a gun at the clerk: hands go up, and after ${ROB_WARMUP_S} seconds they start throwing cash at you - a wad every ${ROB_TOSS_S} seconds (about $${ROB_TAKE.convenience}, more each time, ~$${ROB_TAKE.bank} at a bank). Somewhere ${ROB_ALARM_S.join(', ')} seconds in, a silent alarm trips: you jump to ${ROB_ALARM_STARS} stars, a ${EVENT_KINDS.robbery.label.toLowerCase()} shows on every radar, and squad cars pull up ${ROB_RESPONSE_S[0]}-${ROB_RESPONSE_S[1]} seconds later. How long do you dare stay? Anyone else who sees it reports you either way.` },
  { ch: 'criminal', title: 'The mail train', at: { rural: 1 },
    text: `Every third train hauls a mail car with a strongbox and two armed guards - step inside and they draw on you and give you ${MAIL_WARN_S} seconds to get out before they shoot. Take the job at {{fence}} (or just do it), get aboard - at a station, or climb on from a car driving alongside - work back to the mail car and crack the box: ${STRONGBOX_CRACK_S} seconds next to it and it goes over the side. Jump off, grab it and fence it for $${TRAIN_JOB_PAY}. Do it out on the long run through the fields of ${isle('F')} where nobody hears the alarm; crack it in town and the bell puts you on ${TRAIN_ALARM_STARS} stars. Wanted on a train? Police board at the next station.` },
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
  { ch: 'criminal', title: 'Join the Syndicate', at: { island: 'C' },
    text: `Walk into any {{gang}} and pay $${GANG_JOIN_FEE} to join (no cops). Members are left alone on the turf and the gate on Smuggler's Rock opens for them. The {{smuggler}} sells heavy hardware and hands out dirty work: net a pod of sea turtles ($${POACH_PAY.turtle}) or hunt dolphins ($${POACH_PAY.dolphin}) - hold a cargo boat still over the spot for ${NET_TIME_S} seconds, then bring the haul in. It's a felony if anyone sees you, and police boats patrol the bay.` },
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
    text: `Earn honestly, live outside the law, or keep the streets clean. See who else is in the city under Players online (in the menu or on the map). Watch this tour again any time from the title screen (not mid-game - no hiding in the tour when trouble finds you). See you on the streets.` },
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
  if (at.ring) {
    const deck = (map.edges || []).filter((e) => e.lvl === 1);
    if (!deck.length) return null;
    const pts = deck.flatMap((e) => e.pts);
    const ramps = (map.edges || []).filter((e) => e.lvl === 'ramp').map((e) => e.pts[Math.floor(e.pts.length / 2)]);
    return { ...box(pts, 300), marks: ramps.slice(0, 8).map((p) => ({ x: p.x, y: p.y, label: 'Ramp', kind: 'camera' })), label: 'The ring highway' };
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
  if (at.crossings) {
    const xs = (map.rail && map.rail.crossings) || [];
    if (!xs.length) return null;
    const c = xs.reduce((b, q) => (q.y < b.y ? q : b), xs[0]);
    return { x: c.x, y: c.y, w: 900, h: 620, marks: xs.map((q) => ({ x: q.x, y: q.y, label: 'Level crossing', kind: 'camera' })) };
  }
  if (at.rural) {
    const r = map.rail && map.rail.rural;
    if (!r) return null;
    const pts = map.rail.pts.filter((p) => p.s > r.s0 && p.s < r.s1);
    const mid = pts[Math.floor(pts.length / 2)];
    return { ...box(pts, 500), marks: [{ x: mid.x, y: mid.y, label: 'The rural run - robbery country', kind: 'drop' }] };
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
  // breadth-first over the ground-level streets (the tour car stays off the highway deck)
  const prev = new Map([[s.id, null]]);
  const q = [s.id];
  for (let qi = 0; qi < q.length; qi++) {
    const id = q[qi];
    if (id === g.id) break;
    for (const [eid, nid] of Object.entries(map.nodes[id].links)) {
      if (prev.has(nid) || map.nodes[nid].lvl !== 0 || (map.edges[+eid] && map.edges[+eid].lvl !== 0)) continue;
      prev.set(nid, { id, e: +eid }); q.push(nid);
    }
  }
  if (!prev.has(g.id)) return null;
  const steps = [];
  for (let id = g.id; id !== s.id;) { const p = prev.get(id); steps.unshift({ from: p.id, e: p.e }); id = p.id; }
  const pts = [{ x: from.x, y: from.y }, { x: s.x, y: s.y }];
  for (const st of steps) {
    const e = map.edges[st.e];
    const ep = e.a === st.from ? e.pts : e.pts.slice().reverse();
    for (let k = 1; k < ep.length; k++) pts.push({ x: ep[k].x, y: ep[k].y });
  }
  pts.push({ x: to.x, y: to.y });
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  return { pts, len, veh: route.veh, chaser: route.chaser || null, siren: !!route.siren, end: to };
}

// Which district / island a world point is in.
export function districtAt(map, x, y) {
  const d = map.dist[Math.floor(y / TILE) * MAP_W + Math.floor(x / TILE)];
  return DISTRICTS[d] ? DISTRICTS[d].name : null;
}
export function islandAt(map, x, y) {
  const k = map.islandAt ? map.islandAt(x, y) : null;
  return k ? ISLANDS[k].name : null;
}
const turfNames = () => DISTRICTS.filter((q) => q.turf).map((q) => q.name);
const andList = (l) => (l.length <= 1 ? l.join('') : l.slice(0, -1).join(', ') + ' and ' + l[l.length - 1]);

// {{kind}} -> in-game name of that place, {{kind:where}} -> its district, {{turfs}} -> gang turf
export function fillNames(map, text) {
  return text.replace(/\{\{(\w+)(?::(\w+))?\}\}/g, (s, kind, mod) => {
    if (kind === 'turfs') return andList(turfNames());
    const p = map.pois.find((q) => q.kind === kind);
    if (!p) return s;
    if (mod === 'where') return districtAt(map, p.x, p.y) || islandAt(map, p.x, p.y) || 'the city';
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
  const inside = (p) => map.zoneAt(p.x, p.y) === I.zone;
  const here = map.pois.filter((p) => !MINOR.has(p.kind) && inside(p)).map((p) => p.label);
  const homes = map.pois.filter((p) => p.kind === 'home' && inside(p)).length;
  const turf = DISTRICTS.filter((q, i) => q.turf && map.pois.length && (() => { for (let ty = y0; ty < y1; ty += 4) for (let tx = x0; tx < x1; tx += 4) if (map.dist[ty * MAP_W + tx] === i && map.zone[ty * MAP_W + tx] === I.zone) return true; return false; })()).map((q) => q.name);
  const parts = [];
  if (here.length) parts.push('Here: ' + andList([...new Set(here)]) + '.');
  if (homes) parts.push(`${homes} homes for sale.`);
  if (turf.length) parts.push(`Gang turf: ${andList(turf)}.`);
  return parts.join(' ');
}

// Labels for an island step: every notable place on it.
export function islandMarks(map, k) {
  const I = ISLANDS[k];
  return map.pois.filter((p) => !MINOR.has(p.kind) && map.zoneAt(p.x, p.y) === I.zone).map(poiMark);
}

export function actionsIn(text) { return [...text.matchAll(/\[\[(\w+)\]\]/g)].map((m) => m[1]); }
export function placesIn(text) { return [...text.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]); }
