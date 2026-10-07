// Gameplay rules shared by the authoritative server and the client (tutorial, HUD hints).
// Change a number here and both the game and the tutorial text follow automatically.

// Police force
export const ENFORCER_MIN_SAMARITAN = 25;     // Samaritan points needed for a badge (plus zero felonies)
export const HUNTER_MIN_SAMARITAN = 10;       // bounty hunter license
export const MISCONDUCT_GRACE = 3;            // forgiven offences while on duty
export const MISCONDUCT_RESET_MS = 10 * 60 * 1000; // each offence is forgotten after this long
export const FIRED_LOCKOUT_MS = 10 * 60 * 1000;    // fired officers can't re-apply for this long
export const MISCONDUCT_WEIGHT = { murder: 2, copMurder: 3, vehKill: 2 };
export const SERVICE_AMMO = 75;               // service pistol rounds issued / restocked at the armory
export const SERVICE_MAG = 15;
export const CALL_COOLDOWN_S = 15;            // wait before dispatch replaces a lost cruiser
export const SUBDUE_S = 6;                    // a floored suspect stays down this long for the cuffs
export const POLICE_RANKS = [
  { name: 'Officer', pts: 0 }, { name: 'Senior Officer', pts: 40 }, { name: 'Sergeant', pts: 120 },
  { name: 'Lieutenant', pts: 260 }, { name: 'Captain', pts: 480 }, { name: 'Chief of Police', pts: 800 },
];

// Getting caught / hurt
export const BUST_FINE_PER_STAR = 250;
export const ARREST_REWARD_PER_STAR = 150;
export const RESPAWN_SECONDS = 15;           // down: this long to pick where to wake up (unless you call for help)
// Downed, revives and the paid ambulance
export const HELP_S = 120;                    // Call for Help: you stay down (revivable) this long instead
export const HELP_PING_S = 10;                // pressing it again re-alerts nearby players at most this often
export const HELP_PING_PX = 2400;             // ...everyone within this range hears it
export const REVIVE_KIT_S = 3;                // hold this long over a downed player with a Revive Kit (full health)
export const REVIVE_HAND_S = 6;               // ...or bare-handed (they come round on low health)
export const REVIVE_LOW_HP = 0.15;            // bare-handed revive: back on this share of health...
export const REVIVE_LIMP_S = 10;              // ...limping and bleeding, healing to half over this long
export const REVIVE_LIMP_SPEED = 0.55;        // move speed while limping
export const FINISH_S = 2;                    // hold interact over a downed player this long to finish them
export const GIVE_AFTER_REVIVE_S = 15;        // after a revive you may hand them a bandage (to half) or med kit (full)
export const REVIVE_KIT_PRICE = 50;           // hospitals and pharmacies; never used up, only works on someone else
export const AMBULANCE_FEE = 200;             // paid from the bank, and only if the paramedics actually revive you
export const GHOST_SECONDS = 30;              // a disconnected player's body lingers this long
export const HOSPITAL_FEE = 150;
export const BAIL_SPEED = 140;                // bailing out faster than this means a tumble (slower: you just step out)
export const BAIL_HURT_SPEED = 330;           // ...but below this you only tuck and roll - no injury at all
export const BAIL_HURT_PER_PX = 0.2;          // above it, landing damage per px/s over the line (a faceplant hurts more)

// Phone job board: delivery jobs are priced by distance. $ = across the neighbourhood,
// $$ = across town, $$$ = island to island. Pay = base + distance * perPx; limit = seconds.
export const JOB_TIERS = [
  { name: '$', minDist: 0, maxDist: 3000, base: 120, perPx: 0.03, limit: 360 },
  { name: '$$', minDist: 3000, maxDist: 6500, base: 250, perPx: 0.05, limit: 540 },
  { name: '$$$', minDist: 6500, maxDist: 30000, base: 450, perPx: 0.07, limit: 780 },
];
export const PATROL_PAY = [250, 450];        // police patrol call reward range (paid to the bank)
export const PATROL_SEARCH_S = [6, 14];      // how long you look around before the crime kicks off

// Combat balance
export const NPC_GUN_MULT = 6;          // gun damage vs NPCs and police (1-2 shots most people, ~3 for SWAT / brutes)
export const NPC_GRIT = [[0.75, 30], [1, 45], [1.6, 17], [2.5, 8]]; // [how much more a bullet takes to drop them, % of people]: some go down at the first shot, a few take three or four
export const NPC_CRITICAL = 0.3;        // below this share of health people bleed; NPCs stop fighting and limp off
export const LIMP_SPEED = 0.35;         // a critically hurt NPC limps along at this fraction of walking pace
export const SHOTGUN_CLOSE_PX = 130;     // a shotgun blast (3+ pellets in) closer than this hits harder the closer it is and throws people off their feet...
export const SHOTGUN_CLOSE_MULT = 2.6;   // ...up to this many times its damage at point blank: almost always a kill, player or not
export const HIT_LIMP_S = 25;            // knocked off their feet by a bullet, people get back up limping this long
export const CRAWL_HP = 0.15;            // below this share of health the badly hurt may crawl off on their stomachs instead of limping
// Vehicle toughness: crash, gunfire and blast damage is divided by this, by kind (heavy: trucks, vans, buses -
// anything with mass 2.4 and up). Motorcycles are the most fragile but no longer take it all.
export const VEHICLE_TOUGH = { car: 1.8, heavy: 2.1, boat: 1.6, bike: 1.25 };
// A crash with a closing speed over CRASH_BOOM_IMPACT (px/s, a serious head-on or something very fast hitting you)
// blows a motorcycle up on the spot, and a car, truck or boat when it was already below CRASH_BOOM_HP of its
// health (or the crash takes the last of it). Anything else that runs out of health dies slowly: the engine cuts
// out and it rolls to a stop, smoking; it catches fire after DEAD_FIRE_S and explodes after DEAD_BOOM_S - time
// to get out and run (gunfire brings the end sooner, a blast or a rocket ends it at once).
export const CRASH_BOOM_IMPACT = 600;
export const CRASH_BOOM_HP = 0.35;
export const DEAD_FIRE_S = 3;
export const DEAD_BOOM_S = 9;
export const ARMORED_ROCKETS = 2;       // rockets to destroy an armored van / SWAT truck (everything else: one)
export const ARMORED_VEHICLES = ['armored', 'swat'];

// Hot springs (Granite Hot Springs): a soak in the hot water stops bleeding and brings health back quickly, even
// when badly hurt (out of the water, health only creeps back above the critical line).
export const SOAK_HEAL = 5;             // health per second while soaking
export const SOAK_AFTER_HIT_S = 3;      // ...once you've been out of the fight this long

// Wine (the winery, the golf club bar): health comes back this many times faster for WINE_S
export const WINE_S = 120;
export const WINE_REGEN = 2.5;

// Picking fruit (Willow River Orchard, the vineyard's vines): a tree or a vine gives a few, then it's bare a while
export const PICK_MAX = 3;              // up to this many from one tree or vine...
export const PICK_REGROW_S = 240;       // ...then nothing more on it for this long
export const PICK_REACH = 40;           // stand this close to the trunk / the row

// Foraging (shared/foraging.js, server/systems/foraging.js): mushrooms on the redwood floor, the tidepools' golden stars.
// A spot gives a few, then it's bare until it grows back (by kind, seconds)
export const FORAGE_REACH = 38;          // stand this close to it
export const FORAGE_REGROW_S = { goldTrumpet: 420, bunCap: 420, shelfOyster: 360, redcap: 300, ghostglass: 1200, goldStar: 2400 };
export const FORAGE_FENCE_GHOSTGLASS = 70;   // what the Back-Alley Exchange pays a cap (nobody else will touch them)

// Stripping the boneyard's stored airliners for parts (server/systems/places.js): stand by a fuselage and work at it
// a few seconds for component scrap (the yard office buys it); then that plane is stripped bare a while
export const SALVAGE_S = 4;             // standing still, working
export const SALVAGE_REGROW_S = 900;    // ...then nothing more on that plane for this long
export const SALVAGE_REACH = 58;        // this close to the fuselage's line
// ...chipping at the Old Granite Mine's seams with the old pick: quartz, and now and then a gold nugget
export const PROSPECT_S = 6;
export const PROSPECT_REGROW_S = 600;
export const PROSPECT_GOLD = 0.18;      // the chance of a nugget
// ...searching the wreck on Wreck Island: an old doubloon now and then
export const WRECK_S = 5;
export const WRECK_REGROW_S = 900;
export const WRECK_COIN = 0.4;          // the chance of a coin (a quarter of those: two)

// The Bluffs Maze against the clock (server/systems/places.js): in through a gate, the clock runs till you reach the
// gazebo in the middle; your best time is kept, and the first time you make it the gardeners pay you a prize
export const MAZE_PRIZE = 50;
// ...and a lap of the Stadium Lido's lanes (the shallow wall to the rope across the deep end and back)
export const LAP_PRIZE = 25;

// Rides (shared/rides.js, server/systems/rides.js): the Ferris wheel on Westport Pier (one turn of the wheel) and
// hot-air balloon flights from the Dry Creek Balloon Field (out over the country and back). Not while wanted.
export const FERRIS_PRICE = 5;
export const FERRIS_S = 40;             // one turn of the wheel (it turns all the time)
export const BALLOON_PRICE = 40;
export const BALLOON_S = 100;           // take-off to touch-down
export const BALLOONS_UP = 3;           // flights in the air at once (the field has three balloons)

// Clearing your record: pay the fines at the courthouse or Police HQ (not while wanted)
export const FELONY_FINE = 750;

// Gangs vs police
export const GANG_PROVOKE_SPEED = 330;     // a cop driving faster than this right past gang members sets them off
export const SHOOTOUT_EVERY_S = [180, 300]; // how often a gang-police shootout breaks out near turf (if a player is around)

// Lying low in the wilds (woods, farmland, desert): fewer eyes and more cover than in town
export const WILD_SIGHT = 0.7;       // the police spot a wanted suspect out there at this share of their town range...
export const COVER_SIGHT = 0.45;     // ...and on foot in thick trees or rocks, up to this much less again
export const WILD_COOL = 1.8;        // out of sight in the wilds, heat cools this many times faster
export const WILD_UNITS = 1;         // ...and once they've lost you, no more cars join the search beyond this many

// Spray & Go paint shops
export const PAINT_PRICE = 150;      // a new colour (no repairs)
export const PAINT_TIME_S = 3.5;     // shutter down this long while they spray

// Homes
export const HIDE_TIME_S = 2.5;      // standing at your own front door this long gets you inside (move = cancel)
export const SPAWN_PROTECT_S = 2;    // after spawning or stepping out of a home: you can move, but can't shoot or be hurt

// Police stations
export const POLICE_ARMORY = ['service', 'prifle', 'psniper', 'passault', 'pshotgun']; // department weapons in the HQ armory

// Out on the water
export const GANG_JOIN_FEE = 500;                       // Syndicate initiation (at any gang HQ) - opens the Smuggler's Rock compound
export const POACH_PAY = { turtle: 900, dolphin: 1300 }; // illegal hauls sold at the Smuggler's Den (a felony if anyone sees the netting)
export const NET_TIME_S = 4;                            // hold your boat still over the spot this long to haul the catch in
export const DEEPSEA_CATCH = 3;                         // offshore fish a deep-sea charter asks for
export const DEEPSEA_PAY = 500;                         // charter bonus on top of selling the fish

// Mini-games (soccer pitch, beach volleyball)
export const MATCH_COUNTDOWN_S = 5;   // once two or more players are on the pitch / court
export const SOCCER_GOALS = 3;        // first to this many goals (or most after SOCCER_MATCH_S)
export const SOCCER_MATCH_S = 180;
export const VOLLEY_POINTS = 5;       // first to this many points
export const MATCH_PRIZE = 100;       // each winner, paid to the bank

// Store robberies
export const ROB_WARMUP_S = 1.5;          // gun on the clerk this long before the money starts coming
export const ROB_TOSS_S = 0.8;            // the clerk throws another wad of cash this often
export const ROB_TAKE = { convenience: 25, gasstation: 25, bank: 120, default: 35 }; // per toss (it creeps up the longer you stay)
export const ROB_ALARM_S = [10, 15, 20];  // the silent alarm trips after one of these (you never know which)
export const ROB_RESPONSE_S = [10, 15];   // squad cars arrive this long after the alarm
export const ROB_ALARM_STARS = 3;         // wanted level the alarm puts you on

// Trains
export const TRAIN_HEADWAY_S = 60;       // a train pulls into each station about this often (the fleet size follows from the loop's run time)
export const TRAIN_SPEED = 560;          // cruising speed (px/s) - as quick as a fast car; nothing stops it, nothing damages it
export const TRAIN_ACCEL = 85;           // pulling away (px/s^2) - eased in and out, no lurch
export const TRAIN_BRAKE = 115;          // braking into a station
export const TRAIN_DWELL_S = 8;          // stop at each station this long
export const TRAIN_DRAG_EXPLODE_S = 3.5; // a vehicle shoved along in front of the engine this long blows up
export const CROSSING_WARN_PX = 2600;    // crossing gates come down when a train is this close
export const MAIL_WARN_S = 4;            // mail-car guards order you out this long before they open fire (they shout a warning at the door first)
export const GUARD_DRAW_S = 1;           // a guard who turns on you (you shot at them, or cracked the box) takes this long to draw and fire
export const TRAIN_JOB_PAY = 3000;       // the mail-car strongbox, fenced
export const STRONGBOX_CRACK_S = 5;      // stay on the mail car this long to crack it
export const TRAIN_ALARM_STARS = 3;      // crack it in town (off the Dry Creek run) and the alarm bell puts you here
export const HIGHWAY_SPEED = 560;          // traffic cruising speed up on the ring highway (px/s)
export const BARRIER_BREAK_SPEED = 300;    // ram a highway barrier this fast (px/s, straight into it) and it gives way
export const BARRIER_REPAIR_S = 300;       // the road crew puts a smashed barrier back after this long (when nobody's looking)

// Boats
export const BOAT_RENTAL_S = 300;          // a hired boat or jet ski is yours this long; bring it back to any rental dock
export const BOAT_RENTAL_GRACE_S = 45;     // overdue this long and the hire company reports it stolen
export const BOAT_RENTAL_PRICE = { jetski: 120, dinghy: 150, speedboat: 350 }; // per hire

// Police gear
export const SPIKE_STRIP_S = 45;           // a deployed spike strip stays across the road this long (one per officer)

// Money
export const ATM_DEPOSIT_PX = 48;          // walk up this close to an ATM with cash on you and it's banked automatically

// Gear
export const FLASHLIGHT_PRICE = 35;        // hardware stores, corner stores and gas stations; it goes in your bag and never wears out

// Lost pets
export const PET_EVERY_S = 150;            // roughly how often a pet goes missing somewhere near a player
export const PET_REWARD = 150;             // the owner's thank-you (cash) for bringing it home...
export const PET_SAMARITAN = 8;            // ...and the Samaritan points

// Getting unstuck
export const UNSTUCK_S = 5;                // stand still this long and you're moved to the nearest open ground
export const UNSTUCK_CALM_S = 20;          // ...only when you haven't fought, shot or been hurt for this long, and aren't wanted
