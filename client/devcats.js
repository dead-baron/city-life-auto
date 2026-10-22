// The debug menu's test sections (client/main.js setupDev), one per feature. Each button sends a dev command
// (server/dev.js): most spawn the thing, or take you to the nearest place it happens ('near' + the kind of
// place - pois, landmarks, nature places, race starts, pitches). Commands starting with '@' only change your own
// screen (fog, a lightning strike). An entry: [label, command, extra fields for the message].
import { FISH, RARITY, WATER_NAME } from '../shared/fish.js';
export const DEV_SECTIONS = [
  { id: 'wx', title: '🌦 Weather & time', items: [
    ['🌧 Rain (10 min)', 'rain', { s: 600 }], ['☀ Clear skies', 'clear'], ['🔒 Hold the weather (toggle)', 'wxhold'],
    ['⚡ Lightning: a strike near you (your screen)', '@bolt', { kind: 'strike' }], ['🌩 Lightning: a bolt in the distance (your screen)', '@bolt', { kind: 'bolt' }],
    ['☁ Lightning: a flash in the clouds (your screen)', '@bolt', { kind: 'sky' }], ['⛈ A thunderstorm while it rains (your screen)', '@storm', { mood: 3 }],
    ['⛈ Storms back to the clock', '@storm', null], ['🌫 Thick fog (your screen)', '@fog', { k: 0.9, spread: 1 }],
    ['🌁 Light mist (your screen)', '@fog', { k: 0.45, spread: 0.4 }], ['🌤 Fog back to the clock', '@fog', null],
    ['🌊 The sea sparkling tonight (your screen)', '@bio', { k: 1 }], ['🌊 Sea sparkle back to the nights', '@bio', null],
    ['🌅 06:00 dawn', 'time', { m: 360 }], ['🌞 09:00 morning', 'time', { m: 540 }], ['☀ 12:00 noon', 'time', { m: 720 }],
    ['🌇 15:00 afternoon', 'time', { m: 900 }], ['🌆 18:30 golden hour', 'time', { m: 1110 }], ['🌃 20:15 dusk', 'time', { m: 1215 }],
    ['🌙 23:00 night', 'time', { m: 1380 }], ['🌌 03:00 small hours', 'time', { m: 180 }], ['⏸ Freeze the clock (toggle)', 'clockhold'],
  ] },
  { id: 'me', title: '🧍 Me', items: [
    ['🛡 Invincible (toggle)', 'god'], ['❤ Heal', 'heal'], ['💵 +$25k', 'money'], ['😇 +50 Samaritan', 'samaritan'],
    ['📜 Wipe criminal record', 'record'], ['☠ Die (respawn test)', 'die'], ['🎒 Dropped backpacks, Common to Legendary', 'packs'],
  ] },
  // the owner's 2026-10-18 batch, everything in one place to try (server/devplay.js; World v3's places: the 'place' command)
  { id: 'new', title: '🆕 New: skate, carts, fishing, places', items: [
    ['🛹 A skateboard, and on it', 'skate', { k: 'on' }], ['🛹 The skate spot (Midtown, by the El), on your board', 'skate', { k: 'spot' }],
    ['🛒 Me at a cart\'s handle, a friend in the basket', 'cart', { k: 'pair' }], ['💥 Two loaded carts head on, just ahead', 'cart', { k: 'headon' }],
    ['🎣 Every rod and 20 of every bait', 'fish', { k: 'kit' }], ['🏞 Fishing: the nearest river bank', 'fish', { k: 'go', w: 'river' }],
    ['🌳 Garden Crescent (Midtown)', 'place', { n: 'Garden Crescent' }], ['🏟 Waves Stadium (the Stadium District)', 'place', { n: 'Waves Stadium' }],
    ['🛍 Westport Galleria (the Stadium District)', 'place', { n: 'Westport Galleria' }], ['🦆 Stadium Ponds (fishing)', 'place', { n: 'Stadium Ponds' }],
  ] },
  { id: 'skate', title: '🛹 Skateboarding', items: [
    ['🛹 A skateboard, and on it', 'skate', { k: 'on' }], ['🛹 The nearest skate spot, on your board', 'skate', { k: 'spot' }],
    ['⏱ A skate session there (5 min, goals, a high score)', 'skate', { k: 'session' }],
    ['🛤 Lined up on the nearest ledge, flat bar or bench (grind it)', 'skate', { k: 'rail' }],
    ['📐 Lined up on the nearest kicker, quarter pipe or pyramid', 'skate', { k: 'ramp' }],
    ['⚡ The special meter full (SPECIAL on: tricks worth three times)', 'skate', { k: 'special' }],
    ['🛹 Skaters riding laps at the skate spot', 'act', { k: 'skaters' }], ['🌧 Rain (wet boards)', 'rain'], ['☀ Clear skies', 'clear'],
  ] },
  { id: 'cart', title: '🛒 Shopping carts', items: [
    ['🛒 A cart beside me', 'car', { m: 'cart' }], ['🛒 Me at the handle, a friend in the basket', 'cart', { k: 'pair' }],
    ['🛒 Me at the handle, the basket empty', 'car', { m: 'cart', in: 1 }], ['💥 Two loaded carts head on, just ahead (everyone flies)', 'cart', { k: 'headon' }],
    ['⤵ A cart over on its side (take it to stand it up)', 'cart', { k: 'tipped' }], ['🗑 A crushed cart', 'cart', { k: 'crushed' }],
    ['🛒 The nearest grocery (carts by the door)', 'near', { k: 'grocery' }],
  ] },
  { id: 'fish', title: '🎣 Fishing', items: [
    ['🎣 Every rod and 20 of every bait', 'fish', { k: 'kit' }],
    ['🏞 A pond', 'fish', { k: 'go', w: 'pond' }], ['🏞 A lake', 'fish', { k: 'go', w: 'lake' }], ['🏞 A river', 'fish', { k: 'go', w: 'river' }],
    ['🏞 A creek', 'fish', { k: 'go', w: 'creek' }], ['🌀 A river\'s calm pocket (the big trout)', 'fish', { k: 'go', spot: 'pocket' }], ['🪨 The fishing rocks (stripers, redfish)', 'fish', { k: 'go', spot: 'point' }], ['🦢 The marshes', 'fish', { k: 'go', w: 'swamp' }], ['🏖 The shallows', 'fish', { k: 'go', w: 'shore' }],
    ['⚓ A pier', 'fish', { k: 'go', w: 'pier' }], ['🐠 The reef (the southern keys)', 'fish', { k: 'go', w: 'reef' }],
    ['🚤 Out at sea in a boat (open water; the deep after dark)', 'fish', { k: 'boat' }], ['🦇 The cave\'s still pool', 'fish', { k: 'cave' }],
    ['✨ The Golden Koi\'s lily pond (a park\'s)', 'fish', { k: 'go', spot: 'lily' }], ['✨ Old Ironsides\' lake drop-off', 'fish', { k: 'go', w: 'lake', spot: 'drop' }],
    ['✨ The Rainbow King: below a waterfall', 'fish', { k: 'go', spot: 'falls' }], ['✨ Big Muddy: a river under a bridge (at night)', 'fish', { k: 'go', w: 'river', spot: 'bridge' }],
    ['✨ The Swamp Dragon and the Silver King: the salt marsh', 'fish', { k: 'go', w: 'swamp', spot: 'mangrove' }], ['✨ The Barn Door: a pier\'s pilings', 'fish', { k: 'go', w: 'pier', spot: 'pilings' }],
    ['⚡ The next bite at once', 'fish', { k: 'bite', f: 'now' }], ['🐟 The next fish: a rare one or a trophy from this water', 'fish', { k: 'bite', f: 'rare' }],
    ['✨ The next fish: this water\'s legendary', 'fish', { k: 'bite', f: 'legend' }], ['🪶 Easy fights (toggle)', 'fish', { k: 'easy' }],
    ['🌆 18:30 dusk (the dusk fish)', 'time', { m: 1110 }], ['🌙 23:00 night (the night fish)', 'time', { m: 1380 }], ['☀ 12:00 noon', 'time', { m: 720 }],
    ['🧊 Ten fish in my cooler', 'fish', { k: 'cooler' }], ['📒 Empty my fishing log and my cooler', 'fish', { k: 'clear' }], ['🏆 Wipe the records board', 'fish', { k: 'records' }],
    ['🎣 Bait & tackle shop', 'near', { k: 'tackle' }], ['🐟 Fish market (sell the catch)', 'near', { k: 'fishmarket' }], ['🛥 Charter desk (deep-sea charter)', 'near', { k: 'charter' }],
  ] },
  // the next bite, any kind of fish (shared/fish.js FISH): the next cast hooks it, wherever you are
  { id: 'fishes', title: '🐟 The next fish: every kind', items: FISH.map((f) => [`${f.rare === 5 ? '✨' : '🐟'} ${f.name} (${RARITY[f.rare]}; ${f.waters.map((w) => WATER_NAME[w]).join(', ')})`, 'fish', { k: 'bite', f: f.id }]) },
  { id: 'blades', title: '🗡 Blades & practice', items: [
    ['🎯 3 practice dummies in front of you', 'dummy'], ['🎯 3 one-hit dummies (see how they fall)', 'dummy', { hp: 1 }],
    ['🗡 The hooded stranger (sells the plasma blade)', 'wanderer'], ['⚔ Pawn shop (swords)', 'near', { k: 'pawn' }],
    ['🗡 Fence (katanas)', 'near', { k: 'fence' }],
  ] },
  { id: 'law', title: '🚨 Wanted & police', items: [
    ['★ 1 star (a word)', 'wanted', { soft: 1 }], ['★★ 2 stars', 'wanted', { n: 2 }], ['★★★★ 4 stars', 'wanted', { n: 4 }], ['🧽 Clear wanted', 'clean'],
    ['👮 Join the police', 'cop'], ['⬆ Promote police rank', 'promote'], ['🏛 Police station', 'near', { k: 'police' }],
    ['⚖ Courthouse', 'near', { k: 'courthouse' }], ['💥 Gang vs police shootout', 'shootout'],
    ['💀 A test bounty on me (the golden skull)', 'bounty'], ['🎯 Licensed bounty hunter', 'hunter'], ['💀 Let me put a bounty on the nearest player', 'revenge'],
  ] },
  { id: 'veh', title: '🚗 Vehicles', items: [
    ['🏎 Sports car', 'car', { m: 'sports' }], ['🛻 Pickup', 'car', { m: 'pickup' }], ['🏍 Motorbike', 'car', { m: 'bike' }],
    ['🚤 Speedboat', 'car', { m: 'speedboat' }], ['⛳ Golf cart', 'car', { m: 'golfcart' }], ['📦 Loaded flatbed (cargo)', 'cargo'], ['🔧 Garage', 'near', { k: 'garage' }],
    ['🎨 Paint shop', 'near', { k: 'paint' }], ['🚘 Car dealer', 'near', { k: 'dealer' }], ['🔑 Rentals', 'near', { k: 'rental' }],
    ['⛽ Filling station', 'near', { k: 'gasstation' }], ['⚓ Marina', 'near', { k: 'marina' }],
  ] },
  { id: 'boom', title: '💥 Explosions', items: [
    ['💥 Small blast ahead', 'blast', { k: 'small' }], ['💥 Medium blast ahead', 'blast', { k: 'medium' }], ['💥 Big blast ahead', 'blast', { k: 'big' }],
    ['💥 Ultra blast ahead', 'blast', { k: 'ultra' }], ['🚗 A car goes up', 'blast', { k: 'car' }], ['🛢 A tanker goes up', 'blast', { k: 'tanker' }],
    ['🧨 An explosives truck goes up', 'blast', { k: 'truck' }], ['🔗 A tanker by a row of cars', 'blast', { k: 'row' }], ['🧍 A crowd round a tanker', 'blast', { k: 'crowd' }],
  ] },
  { id: 'bikes', title: '🚲 Bicycles', items: [
    ['🚲 Commuter bike', 'car', { m: 'bicycle' }], ['🏖 Beach cruiser', 'car', { m: 'cruiser' }], ['🚵 Mountain bike', 'car', { m: 'mtb' }],
    ['🚴 Road bike', 'car', { m: 'roadbike' }], ['🛞 BMX', 'car', { m: 'bmx' }], ['📦 Cargo bike (two crates)', 'car', { m: 'cargobike' }],
    ['🔒 Nearest bike rack', 'near', { k: 'bikerack' }],
  ] },
  { id: 'motos', title: '🏍 Motorcycles', items: [
    ['🏍 Dustwing cruiser', 'car', { m: 'vtwin' }], ['🧳 Longhaul tourer', 'car', { m: 'tourer' }], ['🔱 Hellfork chopper', 'car', { m: 'chopper' }],
    ['🏍 Stubtail bobber', 'car', { m: 'bobber' }], ['☕ Ton-Up racer', 'car', { m: 'caferacer' }], ['🏁 Sport bike', 'car', { m: 'bike' }],
    ['🌄 Clodhopper dirt bike', 'car', { m: 'dirtbike' }], ['🛵 Zuzu scooter', 'car', { m: 'scooter' }], ['🔺 Tribuck trike', 'car', { m: 'trike' }],
    ['🚓 Police tourer', 'car', { m: 'policebike' }], ['🦴 Rustbucket rat bike', 'car', { m: 'ratbike' }], ['💼 Saddlebag bagger', 'car', { m: 'bagger' }],
  ] },
  { id: 'rail', title: '🚆 Trains', items: [
    ['🚉 Call a train to this station', 'calltrain'], ['🚆 Hop on the nearest train', 'train'], ['🚇 Hop on the nearest subway', 'train', { sub: 1 }],
    ['🚏 Nearest platform', 'near', { k: 'platform' }], ['🚇 Nearest subway entrance', 'near', { k: 'subway' }],
  ] },
  { id: 'jobs', title: '💼 Jobs', items: [
    ['📦 Courier (pick-up counter)', 'near', { k: 'delivery' }], ['🌾 Farm work', 'near', { k: 'farm' }],
    ['🎣 Fishing (tackle shop)', 'near', { k: 'tackle' }], ['🐟 Fish market', 'near', { k: 'fishmarket' }],
    ['🛥 Deep-sea charter', 'near', { k: 'charter' }], ['🏭 Warehouse', 'near', { k: 'warehouse' }],
  ] },
  { id: 'crime', title: '💰 Crime', items: [
    ['🏪 Rob a store', 'near', { k: 'convenience' }], ['🏦 Rob a bank', 'near', { k: 'bank' }], ['🔩 A bank\'s vault (bring a drill)', 'near', { k: 'vault' }], ['🏧 ATM', 'near', { k: 'atm' }],
    ['🔫 Gun shop', 'near', { k: 'gunshop' }], ['💍 Pawn shop', 'near', { k: 'pawn' }], ['🕶 Fence', 'near', { k: 'fence' }], ['💰 +$1,000 hot money (stolen here)', 'hot'],
    ['🏴 Gang HQ', 'near', { k: 'gang' }], ['🏝 Smuggler\'s Den', 'near', { k: 'smuggler' }],
    ['🚂 The mail train (on the desert run if one is)', 'train', { mail: 1 }], ['🎁 Contraband drop', 'drop', { n: 4 }], ['👜 Snatch-and-grab nearby', 'snatch'], ['👊 A street fight nearby', 'happen', { k: 'fight' }], ['👮 A fight the police break up', 'happen', { k: 'fight', cops: 1 }], ['🚑 Someone collapses nearby', 'happen', { k: 'faint' }], ['👛 Someone drops a wallet nearby', 'happen', { k: 'wallet' }],
  ] },
  { id: 'fun', title: '🎉 Events & sport', items: [
    ['🐶 Lost pet nearby', 'pet'], ['🏁 Water race start (craft waiting)', 'near', { k: 'race' }], ['🏐 Pitch or court', 'near', { k: 'venue' }],
    ['🎬 Drive-in', 'near', { k: 'drivein' }], ['🏎 Raceway', 'near', { k: 'raceway' }], ['🪩 Club', 'near', { k: 'club' }],
    ['🎾 Tennis court', 'near', { k: 'tennis' }], ['🏄 A surf break (with a board)', 'near', { k: 'surf' }], ['🕹 Arcade', 'near', { k: 'arcade' }], ['🎱 Pool table (Rusty Spur)', 'near', { k: 'pooltable' }],
    ['🎰 Casino', 'near', { k: 'casino' }], ['🎲 Street dice', 'near', { k: 'dice' }],
    ['🏁 Street race nearby', 'street', { k: 'race' }], ['🚓 Police chase nearby', 'street', { k: 'chase' }], ['🚚 Armored truck nearby', 'street', { k: 'armored' }],
  ] },
  { id: 'shops', title: '🏪 Shops & services', items: [
    ['🏥 Hospital', 'near', { k: 'hospital' }], ['💊 Pharmacy', 'near', { k: 'pharmacy' }], ['👕 Clothing', 'near', { k: 'clothing' }],
    ['☕ Coffee', 'near', { k: 'coffee' }], ['🛒 Grocery', 'near', { k: 'grocery' }], ['🔨 Hardware', 'near', { k: 'hardware' }],
    ['⚽ Sports shop', 'near', { k: 'sports' }], ['🏪 Corner shop', 'near', { k: 'convenience' }], ['✈ Airport', 'near', { k: 'airport' }],
  ] },
  { id: 'hunt', title: '🦌 Hunting & wildlife', items: [
    ['🏹 Hunting kit (rifle, bow, varmint, knife, cloak)', 'hunt'],
    ['🦌 Deer herd', 'animal', { k: 'deer' }], ['🦌 Elk herd', 'animal', { k: 'elk' }], ['🦌 Moose', 'animal', { k: 'moose' }],
    ['🐻 Black bear (maybe with cubs)', 'animal', { k: 'blackbear' }], ['🐻 Grizzly', 'animal', { k: 'grizzly' }],
    ['🐆 Mountain lion stalking you', 'animal', { k: 'cougar', stalk: 1 }], ['🐈 Bobcat', 'animal', { k: 'bobcat' }], ['🐺 Coyotes', 'animal', { k: 'coyote' }],
    ['🦊 Red fox', 'animal', { k: 'redfox' }], ['🦊 Grey fox', 'animal', { k: 'greyfox' }], ['🐐 Mountain goats', 'animal', { k: 'mtgoat' }],
    ['🐗 Wild boar', 'animal', { k: 'boar' }], ['🦝 Raccoons', 'animal', { k: 'raccoon' }], ['🦫 Beavers', 'animal', { k: 'beaver' }],
    ['🦦 River otters', 'animal', { k: 'otter' }], ['🦦 Sea otters (protected)', 'animal', { k: 'seaotter' }], ['🦈 A great white (swim out to sea)', 'animal', { k: 'shark' }], ['🐇 Rabbits', 'animal', { k: 'rabbit' }],
    ['🐺 Grey wolf pack', 'animal', { k: 'wolf' }], ['🪶 Great blue heron', 'animal', { k: 'heron' }], ['🦅 Osprey', 'animal', { k: 'osprey' }], ['🦅 Bald eagle', 'animal', { k: 'eagle' }],
    ['🎯 Watch: wolves run down a deer', 'animal', { scene: 'wolves' }], ['🎯 Watch: a lion stalks a deer', 'animal', { scene: 'cougar' }], ['🎯 Watch: an eagle takes a rabbit', 'animal', { scene: 'eagle' }],
    ['🎯 Watch: a fox mousing', 'animal', { scene: 'fox' }], ['🎯 Watch: a heron fishing', 'animal', { scene: 'heron' }], ['🎯 Watch: a bear fishing', 'animal', { scene: 'bear' }],
    ['🎯 Watch: an otter fishing', 'animal', { scene: 'otter' }], ['🎯 Watch: an osprey dives', 'animal', { scene: 'osprey' }],
    ['🐿 Squirrel', 'animal', { k: 'squirrel' }], ['🐦 Quail covey', 'animal', { k: 'quail' }], ['🐓 Pheasants', 'animal', { k: 'pheasant' }],
    ['🦃 Wild turkeys', 'animal', { k: 'turkey' }], ['🦆 Ducks', 'animal', { k: 'duck' }], ['🦆 Geese', 'animal', { k: 'goose' }],
    ['✨ Legendary white hart', 'animal', { k: 'deer', legend: 1, single: 1 }], ['✨ Legendary pale bear', 'animal', { k: 'blackbear', legend: 1, single: 1 }],
    ['🌬 Wind in your face (scent behind you)', 'wind', { toMe: 1 }], ['🌬 Wind back to the weather', 'wind'],
    ['🏕 Hunting Lodge', 'near', { k: 'lodge' }], ['⛺ Hunting camp', 'near', { k: 'huntcamp' }], ['🪵 Trapper\'s cabin', 'near', { k: 'trapper' }],
    ['🥩 Game butcher', 'near', { k: 'butcher' }], ['🦫 Beaver pond', 'near', { k: 'beaver' }],
  ] },
  { id: 'homes', title: '🏠 Homes', items: [['🏠 Nearest home', 'home', { op: 'near' }], ['⏭ Next home', 'home', { op: 'next' }], ['⏮ Previous home', 'home', { op: 'prev' }], ['🗺 Every home (map, list)…', '@homes']] },
  { id: 'nature', title: '🌲 Nature & landmarks', items: [
    ['🌿 Next nature place', 'near', { k: 'nature' }], ['⛺ Campground', 'near', { k: 'camp' }], ['🔥 Campfire (light it, sit by it)', 'near', { k: 'campfire' }], ['💧 Waterfall', 'near', { k: 'falls' }],
    ['🌴 Canyon oasis', 'near', { k: 'oasis' }], ['🦀 Tidepools', 'near', { k: 'tidepools' }], ['🔥 Bonfire beach', 'near', { k: 'bonfire' }],
    ['🔭 Fire lookout', 'near', { k: 'lookout' }], ['🦢 Heron Marsh', 'near', { k: 'marsh' }], ['🌸 Botanical gardens', 'near', { k: 'gardens' }],
    ['⛏ Old mine', 'near', { k: 'mine' }], ['🔭 Observatory', 'near', { k: 'observatory' }], ['🔭 Stargazing telescope (after dark)', 'near', { k: 'stargaze' }], ['🪨 Quarry', 'near', { k: 'quarry' }],
    ['🌬 Wind farm', 'near', { k: 'wind' }], ['🛢 Oil field', 'near', { k: 'oil' }], ['☀ Solar farm', 'near', { k: 'solar' }],
    ['⛽ Roadside stop', 'near', { k: 'stop' }], ['🛩 Desert airstrip', 'near', { k: 'airstrip' }], ['🌳 Lakeview Park', 'near', { k: 'park' }],
    ['🛶 Pine Lake camp', 'near', { k: 'lakecamp' }], ['🏊 Stadium Lido (pool)', 'near', { k: 'pool' }], ['🏞 Cedar Creek', 'near', { k: 'towncreek' }], ['⚓ Wreck Island', 'near', { k: 'wreck' }], ['🌿 The maze against the clock', 'near', { k: 'maze' }], ['♨ Granite Hot Springs', 'near', { k: 'springs' }], ['🌊 Splash Canyon Water Park', 'near', { k: 'waterpark' }], ['🪵 Driftwood Point', 'near', { k: 'coastfalls' }], ['🏀 North Point Courts', 'near', { k: 'courts' }], ['🎡 The pier with the Ferris wheel', 'near', { k: 'pier' }], ['🍇 Willow River Vineyard', 'near', { k: 'vineyard' }], ['⛳ The golf course (Lakeside Greens)', 'near', { k: 'golf' }], ['🍎 Willow River Orchard', 'near', { k: 'orchard' }], ['🦭 Seal Islets', 'near', { k: 'seals' }], ['🎈 Dry Creek Balloon Field', 'near', { k: 'balloons' }], ['⛪ Old Mission Ruins', 'near', { k: 'mission' }], ['🌿 Fern Gorge', 'near', { k: 'gorge' }], ['🗿 The Sentinel Stones', 'near', { k: 'stones' }], ['🧺 Old Town Market', 'near', { k: 'market' }], ['✈ Dry Creek Boneyard', 'near', { k: 'boneyard' }], ['💜 Cedar Point Lavender', 'near', { k: 'lavender' }],
  ] },
  { id: 'wardrobe', title: '👗 Debug wardrobe', items: [['👗 Every piece and option (saving adds them to my wardrobe)…', '@wardrobe']] },
  // rescue anywhere (tasks #409, #420: server/dev.js devRescue)
  { id: 'rescue', title: '🛟 Rescue (water & wilds)', items: [
    ['🚤 Go down in the water (the rescue boat comes)', 'rescue', { at: 'water' }], ['🚑 Go down out in the wilds (off-road ambulance)', 'rescue', { at: 'wild' }],
    ['🛥 Boats with people aboard (riders in open boats)', 'rescue', { at: 'crew' }], ['🚤 Rescue boat', 'car', { m: 'rescueboat' }],
  ] },
  // a night out (IN14: server/systems/bowling.js)
  { id: 'nightout', title: '🎳 Bowling & cinema', items: [['🎳 Pinwheel Lanes (bowling alley, at the shoe counter)', 'near', { k: 'bowling' }], ['🎬 The Grand Theatre (cinema, at the ticket counter)', 'near', { k: 'cinema' }]] },
  // people going about their lives (task #423: server/systems/activities.js) - the nearest spot, filled, you a little way off
  { id: 'activities', title: '🎣 People going about', items: [
    ['🎣 Anglers on a pier', 'act', { k: 'anglers' }], ['♟ Chess in the park', 'act', { k: 'chess' }], ['🧺 A picnic', 'act', { k: 'picnic' }],
    ['🎨 A street painter', 'act', { k: 'painter' }], ['🧽 Washing the car', 'act', { k: 'carwash' }], ['💬 Neighbours chatting', 'act', { k: 'chat' }],
    ['🍅 Pickers in a field', 'act', { k: 'pickers' }], ['⛏ Miners at the rock face', 'act', { k: 'miners' }],
    ['🦺 A hunter and his dog', 'act', { k: 'hunter' }], ['🏀 A pickup game at the courts', 'act', { k: 'hoops' }], ['🎱 Pool at the Rusty Spur', 'act', { k: 'pool' }],
    ['🍔 Eating at a diner (a cafe, a bistro)', 'act', { k: 'diners' }],
  ] },
  // the people of the wilds (Nature-C4: server/systems/wildfolk.js) - the nearest spot, filled, you a little way off
  { id: 'wildfolk', title: '🥾 People of the wilds', items: [
    ['🎩 A park ranger on the beat (talk to them)', 'act', { k: 'ranger' }], ['🥾 Backpackers or a runner on a trail', 'act', { k: 'trail' }],
    ['🔭 A birdwatcher by the water', 'act', { k: 'birders' }], ['🎣 An angler at a creek\'s hold', 'act', { k: 'holds' }],
    ['🛶 A kayaker on the shore', 'act', { k: 'kayakers' }], ['🧗 Climbers at a crag', 'act', { k: 'climbers' }],
    ['🍄 A forager on their round', 'act', { k: 'foragers' }], ['🏕 A camper cooking by the tent', 'act', { k: 'campcook' }],
  ] },
  // vehicle damage you can see (task #402: server/dev.js 'vdmg')
  { id: 'vdmg', title: '🚗 Vehicle damage', items: [
    ['🚗 Scuffed (front)', 'vdmg', { s: 1 }], ['🚗 Dented (front)', 'vdmg', { s: 2 }], ['🚗 Crumpled (front, bumper off)', 'vdmg', { s: 3 }],
    ['🚗 Rear-ended (crumpled back)', 'vdmg', { s: 3, z: 2 }], ['🚗 Engine dead (door hanging, then fire)', 'vdmg', { s: 4 }], ['🔫 Shot up', 'vdmg', { s: 'shot' }],
    ['🗡 Cut in two (plasma blade)', 'vdmg', { s: 'cut' }], ['🛻 Pickup at its worst', 'vdmg', { s: 4, m: 'pickup' }], ['🚐 Van at its worst', 'vdmg', { s: 4, m: 'van' }],
  ] },
  // flying (shared/flight.js, server/systems/aircraft.js): an aircraft beside you; the airport's runway and the airstrip
  { id: 'air', title: '🚁 Aircraft', items: [
    ['🚁 Helicopter', 'car', { m: 'heli' }], ['✈ Light plane', 'car', { m: 'plane' }], ['🚁 Attack helicopter (missiles)', 'car', { m: 'gunship' }],
    ['🚔 Police helicopter', 'car', { m: 'policeheli' }], ['🛫 A light plane in the air, you flying it', 'car', { m: 'plane', alt: 500, in: 1 }], ['🚁 A helicopter in the air, you flying it', 'car', { m: 'heli', alt: 400, in: 1 }], ['🛫 A runway (take off from it)', 'near', { k: 'runway' }],
    ['🪂 Skydive: high over here, a parachute in your bag', 'sky', { alt: 900, chute: 1 }], ['🪂 Skydive with no parachute (steer for the water)', 'sky', { alt: 900 }], ['🪂 A parachute in my bag', 'give', { kind: 'item', id: 'parachute', n: 1 }], ['🅷 A helipad', 'near', { k: 'helipad' }], ['🛩 Desert airstrip', 'near', { k: 'airstrip' }],
  ] },
  // fire on people, the tank, the explosion tester (H58: server burning.js, tank.js, boomtest.js)
  { id: 'fire', title: '🔥 Fire, the tank & the Boom Tester', items: [
    ['🧨 Boom Tester (shoot it: the blast where it lands; reload picks the kind)', 'give', { kind: 'weapon', id: 'boomtest', n: 1 }],
    ['🪖 A tank (drive; the turret follows your aim; fire the cannon)', 'car', { m: 'tank' }],
    ['🔥 Set me on fire (roll, run or find water)', 'burn', { k: 'me' }], ['🔥 People on fire ahead of me', 'burn', { k: 'crowd' }],
    ['🌧 Rain (fires go out faster)', 'rain'],
    ['🚒 Firefighter: a grass fire', 'firejob', { k: 'grass' }], ['🚒 Firefighter: a car on fire', 'firejob', { k: 'car' }], ['🚒 Firefighter: a burning wreck', 'firejob', { k: 'wreck' }],
    ['🚒 Firefighter: someone on fire', 'firejob', { k: 'person' }], ['🚒 Firefighter: a dumpster fire', 'firejob', { k: 'dumpster' }], ['🚒 Firefighter: a kitchen fire', 'firejob', { k: 'kitchen' }],
    ['🚑 Paramedic: someone who fell (treat them)', 'medicjob', { k: 'minor' }], ['🚑 Paramedic: someone badly hurt (to a hospital)', 'medicjob', { k: 'serious' }],
  ] },
  // gardening and farm work (H61: server gardening.js, farming.js)
  { id: 'farm', title: '🌱 Gardening & farm work', items: [
    ['🏡 A garden of my own (the nearest house, plants at every stage, seeds)', 'garden'], ['🍅 Everything in my gardens ripe', 'garden', { k: 'ripe' }],
    ['🚜 A tractor at the fields (the rows in every state)', 'farm'], ['🌾 A combine at the fields (it harvests two ripe rows at once)', 'farm', { k: 'combine' }], ['🌧 Rain (it waters the gardens)', 'rain'],
  ] },
  // driving for a living (H72: server taxijob.js, busjob.js, towjob.js)
  { id: 'drive', title: '🚕 Taxi, bus & tow truck', items: [
    ['🚕 Taxi driver: a cab, a fare hailing beside me', 'cabjob'], ['🚌 Bus driver: the nearest line', 'busjob'], ['🛻 Tow truck: a car to tow', 'towjob'],
  ] },
];
