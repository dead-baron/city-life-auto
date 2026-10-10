// The debug menu's test sections (client/main.js setupDev), one per feature. Each button sends a dev command
// (server/dev.js): most spawn the thing, or take you to the nearest place it happens ('near' + the kind of
// place - pois, landmarks, nature places, race starts, pitches). Commands starting with '@' only change your own
// screen (fog, a lightning strike). An entry: [label, command, extra fields for the message].
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
    ['🚤 Speedboat', 'car', { m: 'speedboat' }], ['📦 Loaded flatbed (cargo)', 'cargo'], ['🔧 Garage', 'near', { k: 'garage' }],
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
    ['🚉 Call a train to this station', 'calltrain'], ['🚆 Hop on the nearest train', 'train'],
    ['🚏 Nearest platform', 'near', { k: 'platform' }], ['🚇 Nearest subway entrance', 'near', { k: 'subway' }],
  ] },
  { id: 'jobs', title: '💼 Jobs', items: [
    ['📦 Courier (pick-up counter)', 'near', { k: 'delivery' }], ['🌾 Farm work', 'near', { k: 'farm' }],
    ['🎣 Fishing (tackle shop)', 'near', { k: 'tackle' }], ['🐟 Fish market', 'near', { k: 'fishmarket' }],
    ['🛥 Deep-sea charter', 'near', { k: 'charter' }], ['🏭 Warehouse', 'near', { k: 'warehouse' }],
  ] },
  { id: 'crime', title: '💰 Crime', items: [
    ['🏪 Rob a store', 'near', { k: 'convenience' }], ['🏦 Rob a bank', 'near', { k: 'bank' }], ['🏧 ATM', 'near', { k: 'atm' }],
    ['🔫 Gun shop', 'near', { k: 'gunshop' }], ['💍 Pawn shop', 'near', { k: 'pawn' }], ['🕶 Fence', 'near', { k: 'fence' }], ['💰 +$1,000 hot money (stolen here)', 'hot'],
    ['🏴 Gang HQ', 'near', { k: 'gang' }], ['🏝 Smuggler\'s Den', 'near', { k: 'smuggler' }],
    ['🎁 Contraband drop', 'drop', { n: 4 }], ['👜 Snatch-and-grab nearby', 'snatch'], ['👊 A street fight nearby', 'happen', { k: 'fight' }], ['👮 A fight the police break up', 'happen', { k: 'fight', cops: 1 }], ['🚑 Someone collapses nearby', 'happen', { k: 'faint' }], ['👛 Someone drops a wallet nearby', 'happen', { k: 'wallet' }],
  ] },
  { id: 'fun', title: '🎉 Events & sport', items: [
    ['🐶 Lost pet nearby', 'pet'], ['🏁 Water race start (craft waiting)', 'near', { k: 'race' }], ['🏐 Pitch or court', 'near', { k: 'venue' }],
    ['🎬 Drive-in', 'near', { k: 'drivein' }], ['🏎 Raceway', 'near', { k: 'raceway' }], ['🪩 Club', 'near', { k: 'club' }],
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
    ['🦦 River otters', 'animal', { k: 'otter' }], ['🦦 Sea otters (protected)', 'animal', { k: 'seaotter' }], ['🐇 Rabbits', 'animal', { k: 'rabbit' }],
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
    ['🛶 Pine Lake camp', 'near', { k: 'lakecamp' }], ['🏊 Stadium Lido (pool)', 'near', { k: 'pool' }], ['🏞 Cedar Creek', 'near', { k: 'towncreek' }], ['⚓ Wreck Island', 'near', { k: 'wreck' }], ['🌿 Bluffs Maze Garden', 'near', { k: 'maze' }], ['♨ Granite Hot Springs', 'near', { k: 'springs' }], ['🌊 Splash Canyon Water Park', 'near', { k: 'waterpark' }], ['🪵 Driftwood Point', 'near', { k: 'coastfalls' }], ['🏀 North Point Courts', 'near', { k: 'courts' }], ['🎣 Westport Pier', 'near', { k: 'pier' }], ['🍇 Willow River Vineyard', 'near', { k: 'vineyard' }], ['⛳ Cedar Hills Golf Club', 'near', { k: 'golf' }], ['🍎 Willow River Orchard', 'near', { k: 'orchard' }], ['🦭 Seal Islets', 'near', { k: 'seals' }], ['🎈 Dry Creek Balloon Field', 'near', { k: 'balloons' }], ['⛪ Old Mission Ruins', 'near', { k: 'mission' }], ['🌿 Fern Gorge', 'near', { k: 'gorge' }], ['🗿 The Sentinel Stones', 'near', { k: 'stones' }], ['🧺 Old Town Market', 'near', { k: 'market' }], ['✈ Dry Creek Boneyard', 'near', { k: 'boneyard' }], ['💜 Cedar Point Lavender', 'near', { k: 'lavender' }],
  ] },
  { id: 'wardrobe', title: '👗 Debug wardrobe', items: [['👗 Every piece and option (saving adds them to my wardrobe)…', '@wardrobe']] },
  // rescue anywhere (tasks #409, #420: server/dev.js devRescue)
  { id: 'rescue', title: '🛟 Rescue (water & wilds)', items: [
    ['🚤 Go down in the water (the rescue boat comes)', 'rescue', { at: 'water' }], ['🚑 Go down out in the wilds (off-road ambulance)', 'rescue', { at: 'wild' }],
    ['🛥 Boats with people aboard (riders in open boats)', 'rescue', { at: 'crew' }], ['🚤 Rescue boat', 'car', { m: 'rescueboat' }],
  ] },
];
