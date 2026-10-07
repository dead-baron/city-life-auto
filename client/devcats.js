// The debug menu's test sections (client/main.js setupDev), one per feature. Each button sends a dev command
// (server/dev.js): most spawn the thing, or take you to the nearest place it happens ('near' + the kind of
// place - pois, landmarks, nature places, race starts, pitches). Commands starting with '@' only change your own
// screen (fog, a lightning strike). An entry: [label, command, extra fields for the message].
export const DEV_SECTIONS = [
  { id: 'wx', title: '🌦 Weather & time', items: [
    ['🌧 Rain (10 min)', 'rain', { s: 600 }], ['☀ Clear skies', 'clear'], ['🔒 Hold the weather (toggle)', 'wxhold'],
    ['⚡ Lightning strike (your screen)', '@bolt'], ['🌫 Thick fog (your screen)', '@fog', { k: 0.9, spread: 1 }],
    ['🌁 Light mist (your screen)', '@fog', { k: 0.45, spread: 0.4 }], ['🌤 Fog back to the clock', '@fog', null],
    ['🌅 06:00 dawn', 'time', { m: 360 }], ['🌞 09:00 morning', 'time', { m: 540 }], ['☀ 12:00 noon', 'time', { m: 720 }],
    ['🌇 15:00 afternoon', 'time', { m: 900 }], ['🌆 18:30 golden hour', 'time', { m: 1110 }], ['🌃 20:15 dusk', 'time', { m: 1215 }],
    ['🌙 23:00 night', 'time', { m: 1380 }], ['🌌 03:00 small hours', 'time', { m: 180 }], ['⏸ Freeze the clock (toggle)', 'clockhold'],
  ] },
  { id: 'me', title: '🧍 Me', items: [
    ['🛡 Invincible (toggle)', 'god'], ['❤ Heal', 'heal'], ['💵 +$25k', 'money'], ['😇 +50 Samaritan', 'samaritan'],
    ['📜 Wipe criminal record', 'record'], ['☠ Die (respawn test)', 'die'],
  ] },
  { id: 'law', title: '🚨 Wanted & police', items: [
    ['★★ 2 stars', 'wanted', { n: 2 }], ['★★★★ 4 stars', 'wanted', { n: 4 }], ['🧽 Clear wanted', 'clean'],
    ['👮 Join the police', 'cop'], ['⬆ Promote police rank', 'promote'], ['🏛 Police station', 'near', { k: 'police' }],
    ['⚖ Courthouse', 'near', { k: 'courthouse' }], ['💥 Gang vs police shootout', 'shootout'],
  ] },
  { id: 'veh', title: '🚗 Vehicles', items: [
    ['🏎 Sports car', 'car', { m: 'sports' }], ['🛻 Pickup', 'car', { m: 'pickup' }], ['🏍 Motorbike', 'car', { m: 'bike' }],
    ['🚤 Speedboat', 'car', { m: 'speedboat' }], ['📦 Loaded flatbed (cargo)', 'cargo'], ['🔧 Garage', 'near', { k: 'garage' }],
    ['🎨 Paint shop', 'near', { k: 'paint' }], ['🚘 Car dealer', 'near', { k: 'dealer' }], ['🔑 Rentals', 'near', { k: 'rental' }],
    ['⛽ Filling station', 'near', { k: 'gasstation' }], ['⚓ Marina', 'near', { k: 'marina' }],
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
    ['🔫 Gun shop', 'near', { k: 'gunshop' }], ['💍 Pawn shop', 'near', { k: 'pawn' }], ['🕶 Fence', 'near', { k: 'fence' }],
    ['🏴 Gang HQ', 'near', { k: 'gang' }], ['🏝 Smuggler\'s Den', 'near', { k: 'smuggler' }],
    ['🎁 Contraband drop', 'drop', { n: 4 }], ['👜 Snatch-and-grab nearby', 'snatch'],
  ] },
  { id: 'fun', title: '🎉 Events & sport', items: [
    ['🐶 Lost pet nearby', 'pet'], ['🏁 Water race start (craft waiting)', 'near', { k: 'race' }], ['🏐 Pitch or court', 'near', { k: 'venue' }],
    ['🎬 Drive-in', 'near', { k: 'drivein' }], ['🏎 Raceway', 'near', { k: 'raceway' }], ['🪩 Club', 'near', { k: 'club' }],
  ] },
  { id: 'shops', title: '🏪 Shops & services', items: [
    ['🏥 Hospital', 'near', { k: 'hospital' }], ['💊 Pharmacy', 'near', { k: 'pharmacy' }], ['👕 Clothing', 'near', { k: 'clothing' }],
    ['☕ Coffee', 'near', { k: 'coffee' }], ['🛒 Grocery', 'near', { k: 'grocery' }], ['🔨 Hardware', 'near', { k: 'hardware' }],
    ['⚽ Sports shop', 'near', { k: 'sports' }], ['🏪 Corner shop', 'near', { k: 'convenience' }], ['✈ Airport', 'near', { k: 'airport' }],
  ] },
  { id: 'homes', title: '🏠 Homes', items: [['🏠 Nearest home', 'near', { k: 'home' }]] },
  { id: 'nature', title: '🌲 Nature & landmarks', items: [
    ['🌿 Next nature place', 'near', { k: 'nature' }], ['⛺ Campground', 'near', { k: 'camp' }], ['💧 Waterfall', 'near', { k: 'falls' }],
    ['🌴 Canyon oasis', 'near', { k: 'oasis' }], ['🦀 Tidepools', 'near', { k: 'tidepools' }], ['🔥 Bonfire beach', 'near', { k: 'bonfire' }],
    ['🔭 Fire lookout', 'near', { k: 'lookout' }], ['🦢 Heron Marsh', 'near', { k: 'marsh' }], ['🌸 Botanical gardens', 'near', { k: 'gardens' }],
    ['⛏ Old mine', 'near', { k: 'mine' }], ['🔭 Observatory', 'near', { k: 'observatory' }], ['🪨 Quarry', 'near', { k: 'quarry' }],
    ['🌬 Wind farm', 'near', { k: 'wind' }], ['🛢 Oil field', 'near', { k: 'oil' }], ['☀ Solar farm', 'near', { k: 'solar' }],
    ['⛽ Roadside stop', 'near', { k: 'stop' }], ['🛩 Desert airstrip', 'near', { k: 'airstrip' }], ['🌳 Lakeview Park', 'near', { k: 'park' }],
    ['🛶 Pine Lake camp', 'near', { k: 'lakecamp' }], ['🏊 Stadium Lido (pool)', 'near', { k: 'pool' }], ['🏞 Cedar Creek', 'near', { k: 'towncreek' }], ['⚓ Wreck Island', 'near', { k: 'wreck' }], ['🌿 Bluffs Maze Garden', 'near', { k: 'maze' }], ['♨ Granite Hot Springs', 'near', { k: 'springs' }], ['🌊 Splash Bay Water Park', 'near', { k: 'waterpark' }], ['🪵 Driftwood Point', 'near', { k: 'coastfalls' }],
  ] },
];
