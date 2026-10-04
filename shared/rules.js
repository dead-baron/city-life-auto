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
export const RESPAWN_SECONDS = 7;
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
export const VEHICLE_TOUGHNESS = 1.35;  // cars and boats take this much less damage (motorcycles stay fragile)
export const ARMORED_ROCKETS = 2;       // rockets to destroy an armored van / SWAT truck (everything else: one)
export const ARMORED_VEHICLES = ['armored', 'swat'];

// Clearing your record: pay the fines at the courthouse or Police HQ (not while wanted)
export const FELONY_FINE = 750;

// Gangs vs police
export const GANG_PROVOKE_SPEED = 330;     // a cop driving faster than this right past gang members sets them off
export const SHOOTOUT_EVERY_S = [180, 300]; // how often a gang-police shootout breaks out near turf (if a player is around)

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
export const MAIL_WARN_S = 4;            // mail-car guards order you out this long before they open fire
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
