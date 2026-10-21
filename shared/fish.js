// Fishing (task #277; the owner's fishing concepts FC01-FC22, 2026-10-18): the fish and where they live, the rods and
// the baits, and the fishing itself - hold to charge the cast, let go, wait for the bite (a nibble or two first), strike,
// then play the fish: hold the button to raise your bar, let go and it sinks, keep the fish inside it until the catch
// meter fills (Stardew Valley's fishing, top-down). The server runs it (server/systems/fishing.js); the page predicts it
// with this same code (client/fishing.js), one step per input on both, so the bar answers your thumb at once and the
// server judges the strike in the page's own time. Everything about a fish's fight is a function of its seed and the
// time on the line (no random stream, no trigonometry: the same in every engine).
import { TILE } from './constants.js';

// ---- the waters ---------------------------------------------------------------------------------------------------
// pond (a small fresh water: a park's), lake, river, creek (a narrow river), swamp (the marshes: Heron Marsh, the Egret
// Coast's salt marsh), shore (the sea off a beach or the rocks), pier (off a pier or a dock: the pilings), reef (the warm
// sea round the southern keys), offshore (far out, from a boat), deep (far out after dark), cave (the cave's waters)
export const WATERS = ['pond', 'lake', 'river', 'creek', 'swamp', 'shore', 'pier', 'reef', 'offshore', 'deep', 'cave'];
export const WATER_NAME = { pond: 'a pond', lake: 'the lake', river: 'the river', creek: 'the creek', swamp: 'the marsh', shore: 'the shallows', pier: 'the pilings', reef: 'the reef', offshore: 'open water', deep: 'the deep', cave: 'the cave pool' };

// ---- the fish -----------------------------------------------------------------------------------------------------
// [id, name, waters, lb min, lb max, rarity 1-4, when (any day dusk night), fight (smooth dart sinker floater mixed),
//  difficulty 0-100, $ (the fish market's price for an average one), shape, [body, back, belly, fins], eats]
// shape: how it's drawn (client/fishart.js); eats: what takes it - w worms, i insects (crickets, a dry fly), m minnows
// and lures, s shrimp, q squid, d dough, c chum. Rarity: 1 common, 2 uncommon, 3 rare, 4 a trophy.
// (the concepts' dolphins, whale sharks and sea turtles are there to see, never to catch: FC11-FC13, FC19)
const ROWS = [
  // the pond and the lake (FC14)
  ['bluegill', 'Bluegill', 'pond lake swamp', 0.2, 1.4, 1, 'any', 'smooth', 12, 8, 'pan', ['#4a7ab0', '#2e4a6a', '#e8a040', '#3a5a8a'], 'wi'],
  ['pumpkinseed', 'Pumpkinseed', 'pond lake', 0.2, 1, 1, 'day', 'smooth', 14, 9, 'pan', ['#d88a3a', '#5a7a4a', '#f0c050', '#4a8aa8'], 'wi'],
  ['crappie', 'Black Crappie', 'pond lake', 0.4, 2.5, 2, 'dusk', 'dart', 24, 14, 'pan', ['#c8c8c0', '#3a3a38', '#e8e8e0', '#5a5a58'], 'mi'],
  ['perch', 'Yellow Perch', 'lake river', 0.3, 2, 1, 'day', 'smooth', 18, 11, 'perch', ['#d8c050', '#4a5a2a', '#f0e8b0', '#e07a30'], 'wm'],
  ['bass', 'Largemouth Bass', 'pond lake river swamp', 1, 11, 1, 'any', 'mixed', 34, 35, 'bass', ['#7a9a4a', '#3a5a2a', '#e8e8c0', '#6a8a3a'], 'wm'],
  ['smallmouth', 'Smallmouth Bass', 'lake river creek', 0.8, 7, 2, 'day', 'dart', 42, 40, 'bass', ['#9a7a4a', '#5a4a2a', '#e0d0a0', '#8a6a3a'], 'wmi'],
  ['walleye', 'Walleye', 'lake river', 1, 14, 2, 'night', 'sinker', 40, 48, 'perch', ['#b8a860', '#5a5a3a', '#f0f0d8', '#8a7a4a'], 'wm'],
  ['muskie', 'Muskellunge', 'lake', 8, 45, 4, 'dusk', 'dart', 78, 220, 'pike', ['#a8a878', '#5a6a4a', '#e8e8d0', '#b05a3a'], 'm'],
  ['pike', 'Northern Pike', 'lake river', 3, 30, 3, 'day', 'dart', 62, 90, 'pike', ['#6a8a4a', '#3a4a2a', '#e8e8c0', '#9a8a4a'], 'm'],
  ['carp', 'Common Carp', 'pond lake river', 2, 40, 1, 'any', 'sinker', 30, 18, 'carp', ['#a8884a', '#6a5a3a', '#e8d8a8', '#9a6a3a'], 'dw'],
  ['goldfish', 'Feral Goldfish', 'pond', 0.2, 4, 2, 'day', 'floater', 20, 22, 'carp', ['#f07a2a', '#e05a1a', '#f8c080', '#f08a3a'], 'd'],
  ['koi', 'Koi', 'pond', 2, 25, 3, 'day', 'floater', 45, 160, 'koi', ['#f0f0e8', '#e04a2a', '#f8f8f0', '#f0e0d8'], 'd'],
  ['catfish', 'Channel Catfish', 'lake river swamp', 2, 40, 1, 'night', 'sinker', 38, 40, 'cat', ['#7a7a80', '#4a4a50', '#e8e8e0', '#5a5a60'], 'wdc'],
  ['sturgeon', 'Lake Sturgeon', 'lake river', 20, 180, 4, 'any', 'sinker', 82, 380, 'sturgeon', ['#8a8a7a', '#5a5a4a', '#d8d8c8', '#6a6a5a'], 'ws'],
  // the river and the creek (FC15)
  ['brooktrout', 'Brook Trout', 'creek', 0.3, 4, 2, 'day', 'dart', 40, 30, 'trout', ['#5a6a3a', '#3a4a2a', '#e86a3a', '#e85a2a'], 'iw'],
  ['rainbow', 'Rainbow Trout', 'river creek lake', 0.6, 12, 1, 'day', 'mixed', 44, 38, 'trout', ['#a8b0a0', '#5a7a5a', '#f0f0e8', '#e07aa0'], 'iwm'],
  ['browntrout', 'Brown Trout', 'river creek', 0.8, 18, 2, 'dusk', 'mixed', 52, 46, 'trout', ['#b8944a', '#6a5a2a', '#f0e0a0', '#a87a3a'], 'imw'],
  ['cutthroat', 'Cutthroat Trout', 'creek river', 0.5, 9, 3, 'day', 'dart', 55, 60, 'trout', ['#b8a070', '#6a6a3a', '#f0e0c0', '#e04a3a'], 'i'],
  ['goldentrout', 'Golden Trout', 'creek', 0.3, 5, 4, 'day', 'dart', 70, 180, 'trout', ['#f0b830', '#c8a030', '#f8e080', '#e05a2a'], 'i'],
  ['steelhead', 'Steelhead', 'river', 4, 28, 3, 'dusk', 'mixed', 66, 110, 'trout', ['#c8d0d8', '#4a5a70', '#f8f8f8', '#d87aa0'], 'msw'],
  ['salmon', 'Sockeye Salmon', 'river', 4, 15, 3, 'day', 'mixed', 60, 120, 'salmon', ['#d8402a', '#3a6a4a', '#f0a080', '#c8302a'], 'ms'],
  ['bullhead', 'Brown Bullhead', 'river pond swamp', 0.5, 4, 1, 'night', 'sinker', 16, 9, 'cat', ['#7a5a3a', '#4a3a2a', '#d8c090', '#5a4a3a'], 'wd'],
  ['longnosegar', 'Longnose Gar', 'river swamp', 2, 30, 2, 'day', 'smooth', 48, 55, 'gar', ['#9a9a6a', '#5a5a3a', '#e8e8c8', '#7a7a4a'], 'm'],
  ['eel', 'American Eel', 'river swamp creek', 1, 8, 2, 'night', 'smooth', 50, 45, 'eel', ['#5a5a3a', '#3a3a2a', '#c8c088', '#4a4a30'], 'ws'],
  // the marshes (FC16)
  ['redfish', 'Redfish', 'swamp shore', 2, 40, 2, 'any', 'mixed', 46, 60, 'drum', ['#c87a4a', '#8a4a2a', '#f0d0b0', '#b0603a'], 'sm'],
  ['seatrout', 'Spotted Seatrout', 'swamp shore', 0.8, 9, 1, 'dusk', 'dart', 32, 24, 'trout', ['#a8b0b8', '#5a6a7a', '#f0f0f0', '#7a8a9a'], 'sm'],
  ['spottedgar', 'Spotted Gar', 'swamp', 1, 8, 2, 'day', 'smooth', 38, 40, 'gar', ['#8a8a5a', '#4a4a2a', '#d8d8a8', '#6a6a3a'], 'm'],
  ['bowfin', 'Bowfin', 'swamp', 2, 20, 2, 'dusk', 'dart', 52, 50, 'bowfin', ['#6a6a3a', '#3a3a20', '#c8c890', '#4a6a3a'], 'wm'],
  ['snook', 'Snook', 'swamp shore', 3, 45, 3, 'night', 'dart', 64, 95, 'snook', ['#c8c8b0', '#6a6a50', '#f0f0e8', '#d8c050'], 'sm'],
  ['alligatorgar', 'Alligator Gar', 'swamp', 30, 300, 4, 'any', 'sinker', 85, 420, 'gar', ['#8a8a5a', '#4a4a2a', '#c8c898', '#6a6a3a'], 'mc'],
  ['tarpon', 'Tarpon', 'swamp shore', 20, 220, 4, 'dusk', 'mixed', 88, 360, 'tarpon', ['#d8e0e8', '#6a7a8a', '#f8f8f8', '#9aa8b8'], 'ms'],
  // the pier and the inshore water (FC17)
  ['mackerel', 'Atlantic Mackerel', 'pier shore offshore', 0.5, 3, 1, 'day', 'dart', 30, 12, 'mack', ['#9ab8c0', '#2a5a5a', '#f0f0f0', '#5a8a90'], 'mqs'],
  ['herring', 'Atlantic Herring', 'pier shore', 0.2, 1.4, 1, 'any', 'smooth', 14, 6, 'mack', ['#b8c8d0', '#3a5a7a', '#f0f4f8', '#8aa0b0'], 'sd'],
  ['sardine', 'Pacific Sardine', 'pier', 0.1, 0.5, 1, 'day', 'floater', 10, 4, 'mack', ['#c0ccd8', '#2a4a6a', '#f4f8fc', '#90a8c0'], 'd'],
  ['seabass', 'Black Sea Bass', 'pier reef', 0.5, 8, 1, 'any', 'mixed', 34, 26, 'bass', ['#3a3a40', '#1e1e24', '#6a6a70', '#2a2a30'], 'sq'],
  ['stripedbass', 'Striped Bass', 'pier shore river', 3, 60, 2, 'dusk', 'mixed', 56, 85, 'bass', ['#c8ccd0', '#4a5a6a', '#f8f8f8', '#8a96a0'], 'msq'],
  ['menhaden', 'Menhaden', 'pier shore', 0.2, 1.2, 1, 'day', 'floater', 10, 5, 'mack', ['#c8c8b0', '#6a7a6a', '#f0f0e0', '#a8a890'], 'd'],
  ['flounder', 'Summer Flounder', 'pier shore', 1, 20, 2, 'day', 'sinker', 40, 45, 'flat', ['#9a8a6a', '#6a5a3a', '#e8e0d0', '#8a7a5a'], 'sm'],
  ['halibut', 'Pacific Halibut', 'pier', 20, 300, 4, 'any', 'sinker', 86, 450, 'flat', ['#7a7060', '#4a4030', '#f0f0e8', '#6a6050'], 'sq'],
  ['bonito', 'Atlantic Bonito', 'pier offshore', 3, 15, 2, 'day', 'dart', 58, 50, 'tuna', ['#6a8aa8', '#2a3a5a', '#e8eef0', '#4a6a8a'], 'mq'],
  ['sheepshead', 'Sheepshead', 'pier reef swamp', 1, 15, 2, 'day', 'mixed', 44, 40, 'drum', ['#d0d0c8', '#2a2a2a', '#f0f0e8', '#4a4a48'], 's'],
  ['mangrovesnapper', 'Mangrove Snapper', 'swamp pier reef', 0.5, 8, 1, 'any', 'dart', 36, 30, 'snapper', ['#b87a5a', '#6a4a3a', '#e8c8b0', '#c86a4a'], 'sm'],
  ['stingray', 'Southern Stingray', 'shore reef', 5, 90, 3, 'any', 'sinker', 58, 70, 'ray', ['#8a7a5a', '#5a4a3a', '#e8e0d0', '#6a5a40'], 'sc'],
  ['squid', 'Longfin Squid', 'pier offshore deep', 0.2, 2, 2, 'night', 'floater', 36, 20, 'squid', ['#e8b0a0', '#c87a6a', '#f8d8d0', '#d89080'], 'mq'],
  ['octopus', 'Common Octopus', 'pier reef', 2, 20, 3, 'night', 'sinker', 60, 90, 'octopus', ['#c8603a', '#8a3a2a', '#e8a080', '#b0502a'], 'sq'],
  // the reef (FC18)
  ['yellowtail', 'Yellowtail Snapper', 'reef', 0.5, 5, 1, 'day', 'dart', 36, 28, 'snapper', ['#e8e0c8', '#4a6a9a', '#f8f0e0', '#f0d030'], 'sq'],
  ['grunt', 'Bluestriped Grunt', 'reef', 0.3, 2, 1, 'day', 'smooth', 18, 10, 'snapper', ['#f0d050', '#3a7ab0', '#f8e890', '#e8c040'], 'sw'],
  ['butterflyfish', 'Foureye Butterflyfish', 'reef', 0.1, 0.4, 2, 'day', 'floater', 26, 24, 'angel', ['#f0f0e0', '#c8c8b0', '#f8f8f0', '#f0d040'], 's'],
  ['hogfish', 'Hogfish', 'reef', 1, 20, 3, 'day', 'mixed', 50, 70, 'wrasse', ['#e8a0a0', '#c86a6a', '#f8e0e0', '#d87070'], 's'],
  ['triggerfish', 'Queen Triggerfish', 'reef', 1, 12, 2, 'day', 'dart', 48, 42, 'trigger', ['#5a8a7a', '#2a4a5a', '#e8d8a0', '#4aa0c0'], 'sq'],
  ['barracuda', 'Great Barracuda', 'reef offshore', 5, 80, 3, 'day', 'dart', 72, 90, 'barracuda', ['#b8c0c8', '#4a5a6a', '#f0f4f8', '#7a8a9a'], 'm'],
  ['lionfish', 'Lionfish', 'reef', 0.3, 2.5, 2, 'any', 'floater', 30, 35, 'lion', ['#e8d8c8', '#a83a2a', '#f8f0e8', '#c84a3a'], 's'],
  ['bonefish', 'Bonefish', 'reef shore', 2, 15, 3, 'day', 'dart', 70, 80, 'bone', ['#e0e8f0', '#8a98a8', '#f8f8f8', '#b0b8c8'], 's'],
  ['permit', 'Permit', 'reef shore', 5, 50, 4, 'day', 'mixed', 80, 260, 'pompano', ['#d0d8e0', '#4a5a6a', '#f8f8f8', '#3a4a5a'], 's'],
  ['grouper', 'Red Grouper', 'reef offshore', 4, 40, 2, 'any', 'sinker', 54, 150, 'grouper', ['#b0603a', '#7a3a2a', '#e8b090', '#9a4a2a'], 'sqm'],
  ['clownfish', 'Clownfish', 'reef', 0.1, 0.3, 4, 'day', 'floater', 40, 140, 'clown', ['#f08a2a', '#f8f8f8', '#f8a040', '#2a2a2a'], 'si'],
  ['bluetang', 'Blue Tang', 'reef', 0.3, 1.5, 3, 'day', 'dart', 38, 70, 'tang', ['#2a5ad0', '#1a2a6a', '#3a7ae0', '#f0d030'], 's'],
  ['angelfish', 'Queen Angelfish', 'reef', 0.5, 3, 3, 'day', 'floater', 40, 75, 'angel', ['#3aa0c0', '#2a5aa0', '#f0d040', '#f0c030'], 's'],
  ['parrotfish', 'Rainbow Parrotfish', 'reef', 2, 20, 3, 'day', 'mixed', 46, 85, 'parrot', ['#3ab090', '#2a7a6a', '#f0a050', '#e86a30'], 's'],
  // the open water (FC19), from a boat
  ['skipjack', 'Skipjack Tuna', 'offshore', 3, 25, 1, 'day', 'dart', 50, 45, 'tuna', ['#5a6a8a', '#1e2a4a', '#e8e8f0', '#3a4a6a'], 'mq'],
  ['yellowfin', 'Yellowfin Tuna', 'offshore', 30, 300, 3, 'day', 'mixed', 80, 260, 'tuna', ['#4a5a8a', '#1a2a5a', '#e8eaf0', '#f0d030'], 'mqc'],
  ['tuna', 'Bluefin Tuna', 'offshore', 100, 900, 4, 'day', 'mixed', 92, 480, 'tuna', ['#3a4a6a', '#141e3a', '#e0e4ec', '#2a3a5a'], 'qc'],
  ['mahi', 'Mahi-Mahi', 'offshore', 8, 50, 2, 'day', 'dart', 66, 95, 'mahi', ['#5ac04a', '#2a8aa0', '#f0e040', '#4ab0c0'], 'mq'],
  ['wahoo', 'Wahoo', 'offshore', 15, 120, 3, 'day', 'dart', 78, 140, 'wahoo', ['#7a9ac0', '#2a3a6a', '#e8eef8', '#4a6a9a'], 'm'],
  ['sailfish', 'Sailfish', 'offshore', 40, 200, 4, 'day', 'mixed', 90, 420, 'sail', ['#3a5ab0', '#1a2a6a', '#e0e4f0', '#2a3aa0'], 'mq'],
  ['whitemarlin', 'White Marlin', 'offshore', 40, 180, 3, 'day', 'mixed', 84, 300, 'bill', ['#6a7aa0', '#2a3a6a', '#e8eaf0', '#4a5a8a'], 'mq'],
  ['marlin', 'Blue Marlin', 'offshore', 150, 1200, 4, 'day', 'mixed', 95, 600, 'bill', ['#2a4ab0', '#141e5a', '#e0e4f0', '#2a3a8a'], 'qc'],
  ['swordfish', 'Swordfish', 'offshore deep', 60, 650, 4, 'night', 'sinker', 90, 520, 'bill', ['#6a6a7a', '#3a3a4a', '#d8d8e0', '#4a4a5a'], 'q'],
  ['goliath', 'Goliath Grouper', 'offshore reef', 100, 800, 4, 'any', 'sinker', 88, 400, 'grouper', ['#7a6a4a', '#4a3a2a', '#c8b890', '#5a4a30'], 'qc'],
  ['mako', 'Shortfin Mako', 'offshore', 60, 1000, 4, 'any', 'dart', 94, 380, 'shark', ['#3a5a8a', '#1e2a4a', '#e8eef4', '#2a3a5a'], 'c'],
  // the deep, at night under the boat's light (FC20)
  ['lanternfish', 'Lanternfish', 'deep', 0.05, 0.3, 1, 'night', 'floater', 20, 12, 'mack', ['#3a4a6a', '#1a2030', '#7ab0e0', '#2a3a5a'], 'q'],
  ['rockfish', 'Red Rockfish', 'deep offshore', 1, 15, 1, 'night', 'sinker', 40, 35, 'rock', ['#d04a3a', '#8a2a2a', '#f0a080', '#c03a2a'], 'sq'],
  ['anglerfish', 'Anglerfish', 'deep', 2, 50, 3, 'night', 'sinker', 70, 160, 'angler', ['#5a3a2a', '#2a1a14', '#8a6a4a', '#f0a030'], 'q'],
  ['oarfish', 'Giant Oarfish', 'deep', 50, 600, 4, 'night', 'smooth', 86, 500, 'oar', ['#c8d0d8', '#6a7a8a', '#f0f4f8', '#d83a3a'], 'q'],
  ['coelacanth', 'Coelacanth', 'deep', 40, 200, 4, 'night', 'sinker', 90, 900, 'coel', ['#3a4a6a', '#1e2a3a', '#7a8aa0', '#3a4a5a'], 'q'],
  ['frilledshark', 'Frilled Shark', 'deep', 10, 40, 4, 'night', 'smooth', 84, 700, 'eel', ['#5a4a4a', '#2a2020', '#8a7a70', '#4a3a3a'], 'q'],
  ['vampiresquid', 'Vampire Squid', 'deep', 0.3, 1, 4, 'night', 'floater', 74, 650, 'squid', ['#8a2a3a', '#4a1a24', '#c86a7a', '#3a1a24'], 'q'],
  ['isopod', 'Giant Isopod', 'deep', 1, 4, 3, 'night', 'sinker', 50, 140, 'isopod', ['#c8b8b0', '#8a7a70', '#e8e0d8', '#a89890'], 'c'],
  ['sleepershark', 'Sleeper Shark', 'deep', 200, 1500, 4, 'night', 'sinker', 96, 600, 'shark', ['#4a4a50', '#2a2a30', '#7a7a80', '#3a3a40'], 'c'],
  // the cave's waters (underground)
  ['cavefish', 'Blind Cavefish', 'cave', 0.1, 0.5, 1, 'any', 'smooth', 30, 60, 'carp', ['#f0d8d8', '#e8c0c0', '#f8eeee', '#e8c8c8'], 'wi'],
  ['cavecat', 'Blind Cave Catfish', 'cave', 0.5, 6, 3, 'any', 'sinker', 56, 150, 'cat', ['#f0e8e0', '#d8c8c0', '#f8f4f0', '#e0d0c8'], 'wd'],
];
// The legendary catches (FC01, FC02): one of each, only in its own place, at its time, on a rod that can hold it (spot:
// what the water's spot has to be - server/systems/fishing.js habitatAt: lily (a park's pond or lake), drop (a lake's deep
// water), falls (below a waterfall), bridge (a river under a bridge), cave (the still pool), mangrove (the Egret
// Coast's salt marsh), pilings (a pier), blue (open water by day), night (the deep))
const LEGEND = [
  ['goldenkoi', 'The Golden Koi', 'pond lake', 18, 40, 'day', 'floater', 97, 2500, 'koi', ['#f0b820', '#e89a10', '#f8d860', '#f0c030'], 'd', 'lily'],
  ['oldsturgeon', 'Old Ironsides', 'lake', 300, 560, 'any', 'sinker', 98, 3000, 'sturgeon', ['#5a5a50', '#3a3a30', '#a8a898', '#4a4a40'], 'ws', 'drop'],
  ['rainbowking', 'The Rainbow King', 'river creek', 24, 44, 'day', 'mixed', 98, 2800, 'trout', ['#d8e0d8', '#4a8a6a', '#f8f8f0', '#f070c0'], 'i', 'falls'],
  ['bigmuddy', 'Big Muddy', 'river creek', 250, 540, 'night', 'sinker', 97, 2600, 'cat', ['#5a5040', '#3a3020', '#c8b890', '#4a4030'], 'dc', 'bridge'],
  ['ghostkoi', 'The Ghost Koi', 'cave', 15, 30, 'any', 'floater', 100, 4000, 'koi', ['#e8f8ff', '#a8e0f8', '#ffffff', '#c8f0ff'], 'd', 'cave'],
  ['gatorgar', 'The Swamp Dragon', 'swamp', 300, 400, 'any', 'dart', 99, 3200, 'gar', ['#6a7a3a', '#3a4a1a', '#b8c088', '#5a6a2a'], 'mc', 'mangrove'],
  ['barndoor', 'The Barn Door', 'pier', 400, 700, 'any', 'sinker', 98, 3000, 'flat', ['#6a6050', '#3a3020', '#f0f0e8', '#5a5040'], 'sq', 'pilings'],
  ['silverking', 'The Silver King', 'swamp', 250, 320, 'dusk', 'mixed', 99, 3400, 'tarpon', ['#e8f0f8', '#8a98b0', '#ffffff', '#b8c8d8'], 'ms', 'mangrove'],
  ['bluethunder', 'Blue Thunder', 'offshore', 1400, 1800, 'day', 'mixed', 100, 5000, 'bill', ['#2a5ae0', '#1a2a8a', '#e8eeff', '#3a4ae0'], 'qc', 'blue'],
  ['kraken', 'The Kraken', 'deep', 900, 2000, 'night', 'sinker', 100, 6000, 'squid', ['#a8402a', '#6a2018', '#e88a6a', '#8a3020'], 'qc', 'night'],
];
const mk = ([id, name, w, lo, hi, r, when, fight, diff, pay, shape, col, eats, spot]) => ({ id, name, waters: w.split(' '), lb: [lo, hi], rare: r, when, fight, diff, pay, shape, col, eats, spot: spot || null });
export const FISH = [...ROWS.map(mk), ...LEGEND.map((r) => mk([r[0], r[1], r[2], r[3], r[4], 5, ...r.slice(5)]))];
FISH.forEach((f, i) => { f.i = i; });
export const FISH_BY_ID = Object.fromEntries(FISH.map((f) => [f.id, f]));
export const RARITY = ['', 'Common', 'Uncommon', 'Rare', 'Trophy', 'Legendary'];
// what a fish of this weight fetches at the fish market (a big one of its kind more than a small one)
export function fishValue(f, lb) { const k = f.lb[1] > f.lb[0] ? (lb - f.lb[0]) / (f.lb[1] - f.lb[0]) : 0.5; return Math.max(1, Math.round(f.pay * (0.7 + 0.9 * Math.max(0, Math.min(1, k))))); }

// ---- the rods and the baits ---------------------------------------------------------------------------------------
// cast: how far it throws, in tiles at a full charge; bar: how much of the fight's track your bar covers; reel: how fast
// the catch meter fills; lb: the heaviest fish it's made for (past half as much again, the line snaps on the strike);
// best: the waters it's made for (a bigger bar there; the big-game rod is clumsy anywhere else). 'rod' is the Fishing Pole
// you may already have (a weapon slot: the spinning rod); the others are tools in the bag (shared/items.js).
export const RODS = {
  caneRod: { name: 'Cane Pole', cast: 3, bar: 0.25, reel: 0.9, lb: 10, best: ['pond', 'creek'] },
  rod: { name: 'Fishing Pole', cast: 6, bar: 0.26, reel: 1, lb: 50, best: ['pond', 'lake', 'river', 'pier', 'shore'] },
  baitcaster: { name: 'Baitcaster Rod', cast: 7, bar: 0.28, reel: 1.1, lb: 400, best: ['lake', 'river', 'swamp'] },
  flyRod: { name: 'Fly Rod', cast: 6, bar: 0.33, reel: 1.05, lb: 40, best: ['creek', 'river'] },
  surfRod: { name: 'Surf Rod', cast: 10, bar: 0.28, reel: 1.05, lb: 700, best: ['shore', 'pier', 'reef', 'swamp'] },
  gameRod: { name: 'Big-Game Rod', cast: 7, bar: 0.31, reel: 1.2, lb: 2500, best: ['offshore', 'deep'] },
};
export const ROD_IDS = Object.keys(RODS);
// which of your rods you fish with here: the strongest of those made for this water, else the strongest you have
export function rodFor(have, water) {
  const ids = ROD_IDS.filter((id) => have(id));
  if (!ids.length) return null;
  const made = ids.filter((id) => RODS[id].best.includes(water)), pool = made.length ? made : ids;
  return pool.reduce((a, b) => (RODS[b].lb > RODS[a].lb ? b : a));
}
// eats: what it brings to the hook (the fish's eats letters); x: how much likelier a fish that eats it is to bite; night:
// only worth it after dark. One goes on each cast, and it's used up once a fish is hooked.
export const BAITS = {
  worms: { eats: 'w', x: 2.4 }, crickets: { eats: 'i', x: 2.4 }, minnows: { eats: 'm', x: 2.2 }, shrimp: { eats: 's', x: 2.4 },
  squid: { eats: 'q', x: 2.6 }, doughballs: { eats: 'd', x: 2.6 }, chum: { eats: 'c', x: 3 }, lure: { eats: 'm', x: 1.8 },
  dryfly: { eats: 'i', x: 2.8 }, glowlure: { eats: 'mq', x: 2.4, night: true },
};
export const BAIT_IDS = Object.keys(BAITS);
// the bait that does most for this water and hour, of those you have (have(id) -> how many)
export function bestBait(have, water, o = {}) {
  let best = null, bw = 0;
  for (const id of BAIT_IDS) {
    if (!(have(id) > 0)) continue;
    const w = baitGain(id, water, o);
    if (w > bw) { bw = w; best = id; }
  }
  return best;
}
function baitGain(id, water, o) {
  const B = BAITS[id];
  if (B.night && !o.night) return 0;
  let w = 0;
  for (const f of FISH) if (f.rare < 5 && f.waters.includes(water) && [...B.eats].some((c) => f.eats.includes(c))) w += f.rare;
  return w * B.x;
}

// ---- what bites ------------------------------------------------------------------------------------------------------
// hab: { water, spot } (server/systems/fishing.js habitatAt); o: { when ('day' | 'dusk' | 'night'), bait, rodLb, far (0..1:
// how far out the cast went) }. The odds of each fish: rarer ones less often (a long cast, deeper water, brings the
// rare ones up a little), at their own hour, more if they eat the bait; a legendary only at its spot and its hour, on a
// rod that can hold it, now and then.
const RARE_W = [0, 10, 5, 2.2, 0.8, 0.1];
// a river's calm pocket (shared/world3-rapids.js; habitatAt's spot 'pocket'): the trout and the bass hold in its deep, slow
// water by the bank - each of them half again as likely there and the rarer ones twice, and they run heavier (weighFish's up)
export const POCKET = { hold: 1.5, rare: 2, heavy: 0.3 };
// a rock fishing point on the coast (shared/world3-coast.js: m.natureSites kind 'fishpoint'; habitatAt's spot 'point'):
// the striped bass, the redfish and the flounder feed in the wash off the rocks - each of them more likely there, the
// rarer ones more so, and heavier
export const POINT = { hold: 1.6, rare: 2, heavy: 0.3, shapes: ['bass', 'drum', 'flat'] };
export function biteTable(hab, o = {}) {
  const out = [], when = o.when || 'day';
  for (const f of FISH) {
    if (!f.waters.includes(hab.water)) continue;
    if (f.rare === 5 && (f.spot !== hab.spot || (f.when !== 'any' && f.when !== when) || (o.rodLb || 0) * 1.5 < f.lb[1])) continue;
    let w = RARE_W[f.rare] * (f.rare >= 3 ? 1 + (o.far || 0) * 0.6 : 1);
    if (f.when !== 'any' && f.when !== when) w *= when === 'dusk' ? 0.7 : f.when === 'dusk' ? 0.5 : 0.2;
    const B = o.bait && BAITS[o.bait];
    if (B && (!B.night || when === 'night') && [...B.eats].some((c) => f.eats.includes(c))) w *= B.x;
    if (hab.spot === 'pocket' && (f.shape === 'trout' || f.shape === 'bass')) w *= f.rare >= 2 ? POCKET.rare : POCKET.hold;
    if (hab.spot === 'point' && POINT.shapes.includes(f.shape)) w *= f.rare >= 2 ? POINT.rare : POINT.hold;
    out.push([f, w]);
  }
  return out;
}
export function pickFish(hab, o, rand) {
  const tab = biteTable(hab, o), total = tab.reduce((a, [, w]) => a + w, 0);
  if (!total) return null;
  let r = rand() * total;
  for (const [f, w] of tab) { r -= w; if (r <= 0) return f; }
  return tab[tab.length - 1][0];
}
// its weight: most near the low end, a few big ones (lb, one decimal); up: 0..1, heavier ones likelier (a calm pocket's)
export function weighFish(f, rand, up = 0) { const u = up + rand() * (1 - up), v = rand(); return Math.round((f.lb[0] + (f.lb[1] - f.lb[0]) * u * u * (0.35 + 0.65 * v)) * 10) / 10; }

// ---- the fishing itself ----------------------------------------------------------------------------------------------
// The state (F), stepped once per input (dt) with the action button held and pressed this step:
//   CHARGE: holding the button, the power swings 0 -> 1 -> 0 -> ...; let go and the line flies out that far (WAIT)
//   WAIT: the bobber out; a nibble or two (nibbles(P)); the bite at P.bite s - strike before it and the fish spooks
//   BITE: the bobber dives: strike (press) within P.win s, or it's gone
//   FIGHT: hold to push your bar up, let go and it falls (bouncing off the bottom); the fish swims its own way (fishY);
//          with the fish inside your bar the catch meter fills, outside it drains: full - landed, empty - it's off
//   DONE: out says how it ended: 1 landed, 2 got away, 3 missed or spooked, 4 the line snapped (the server acts on it)
// F: { ph, t (s in the phase), power, barY (the bar's bottom, 0..1 - bar), barV, prog (the catch meter, 0..1), out }.
// P (fixed when the line goes out: fightParams): { bar, reel, diff, fight, seed, bite, win, snap }.
export const PH = { NONE: 0, CHARGE: 1, WAIT: 2, BITE: 3, FIGHT: 4, DONE: 5 };
export const FIGHT = { chargeT: 1.1, up: 3.6, down: 2.8, vmax: 1.6, bounce: 0.35, start: 0.3, gain: 0.24, loss: 0.15, maxT: 90 };
export const newFight = () => ({ ph: PH.CHARGE, t: 0, power: 0, barY: 0, barV: 0, prog: FIGHT.start, out: 0 });
export const h01 = (a, b) => { let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
// the nibbles before the bite (s into the wait): one to three, the last a moment before it
export function nibbles(P) { const n = 1 + Math.floor(h01(P.seed, 7) * 3), out = []; for (let k = 0; k < n; k++) out.push(Math.max(0.5, P.bite - 0.55 - (n - k - 1) * (0.7 + h01(P.seed, 10 + k) * 0.9))); return out; }
// Where the fish is on the track (0 the bottom .. 1 the top) t s into the fight: a run of moves, each to a place of its
// own and as long as its own - shorter and further the harder it fights. A darter flicks there, the others glide; a
// sinker keeps low, a floater high, a mixed one now and then jumps right to an end.
function moveLen(P, i) { const d = P.diff / 100; return (P.fight === 'dart' ? 0.45 : P.fight === 'smooth' ? 1.15 : 0.75) * (1.35 - d * 0.7) * (0.55 + h01(P.seed, 100 + i) * 0.9); }
function moveTo(P, i) {
  let u = h01(P.seed, 300 + i);
  const d = P.diff / 100;
  if (P.fight === 'sinker') u = u * u * 0.9; else if (P.fight === 'floater') u = 1 - (1 - u) * (1 - u) * 0.9;
  else if (P.fight === 'mixed' && h01(P.seed, 500 + i) < d * 0.35) u = u < 0.5 ? 0.02 : 0.98;
  else u = 0.5 + (u - 0.5) * (0.45 + 0.55 * d);   // (an easy fish keeps nearer the middle)
  return 0.04 + u * 0.92;
}
export function fishY(P, t) {
  let s = 0, k = 0, y0 = 0.5;
  for (; k < 2000; k++) { const L = moveLen(P, k); if (s + L > t) break; s += L; y0 = moveTo(P, k); }
  const L = moveLen(P, k), u = Math.min(1, (t - s) / L), e = P.fight === 'dart' ? 1 - (1 - u) * (1 - u) * (1 - u) : u * u * (3 - 2 * u);
  return y0 + (moveTo(P, k) - y0) * e;
}
export function fightStep(F, P, held, pressed, dt) {
  F.t += dt;
  switch (F.ph) {
    case PH.CHARGE:
      if (held) { const k = (F.t / FIGHT.chargeT) % 2; F.power = k < 1 ? k : 2 - k; }
      else { F.ph = PH.WAIT; F.t = 0; }
      return;
    case PH.WAIT:
      if (pressed) { F.ph = PH.DONE; F.out = 3; F.t = 0; return; }   // (struck at nothing: it spooked)
      if (P && F.t >= P.bite) { F.ph = PH.BITE; F.t = 0; }
      return;
    case PH.BITE:
      if (pressed) {
        if (P.snap) { F.ph = PH.DONE; F.out = 4; F.t = 0; return; }
        F.ph = PH.FIGHT; F.t = 0; F.barY = Math.max(0, Math.min(1 - P.bar, fishY(P, 0) - P.bar / 2)); F.barV = 0; F.prog = FIGHT.start; return;
      }
      if (F.t > P.win) { F.ph = PH.DONE; F.out = 3; F.t = 0; }
      return;
    case PH.FIGHT: {
      const top = 1 - P.bar;
      F.barV = Math.max(-FIGHT.vmax, Math.min(FIGHT.vmax, F.barV + (held ? FIGHT.up : -FIGHT.down) * dt));
      F.barY += F.barV * dt;
      if (F.barY < 0) { F.barY = 0; F.barV = -F.barV * FIGHT.bounce; }
      if (F.barY > top) { F.barY = top; F.barV = 0; }
      const y = fishY(P, F.t), on = y >= F.barY && y <= F.barY + P.bar;
      F.prog += (on ? FIGHT.gain * P.reel : -FIGHT.loss * (0.6 + P.diff / 160)) * dt;
      if (F.prog >= 1) { F.prog = 1; F.ph = PH.DONE; F.out = 1; F.t = 0; }
      else if (F.prog <= 0 || F.t > FIGHT.maxT) { F.prog = 0; F.ph = PH.DONE; F.out = 2; F.t = 0; }
      return;
    }
  }
}
// The fight's parameters for a fish of lb on a rod in this water: the bar (the rod's; bigger in its own waters, smaller
// for a fish heavier than it's made for), how fast it reels, the bite's moment (sooner with bait) and its window
// (shorter for the hard ones), whether the line will snap, the seed
export function fightParams(f, lb, rodId, water, seed, o = {}) {
  const R = RODS[rodId] || RODS.rod, over = lb / R.lb, own = R.best.includes(water);
  const bar = R.bar * (own ? 1.12 : rodId === 'gameRod' ? 0.8 : 1) * (over > 0.6 ? 1 - Math.min(0.35, (over - 0.6) * 0.5) : 1);
  return {
    bar: Math.round(Math.max(0.12, bar) * 1000) / 1000, reel: R.reel * (over > 1 ? 0.75 : 1), diff: f.diff, fight: f.fight, seed: seed >>> 0,
    bite: Math.round((2 + h01(seed, 1) * (o.bait ? 4.5 : 8)) * 100) / 100, win: Math.round(Math.max(0.5, 1.15 - f.diff / 180) * 100) / 100, snap: lb > R.lb * 1.5,
  };
}
// Where the line lands: out from the water's edge (sx, sy) the way you face (a), as far as the power throws it (a rod's
// cast in tiles at full power), stopping where the water does (water(x, y): open water there) - the server and the page
// alike (the page draws your bobber there the moment you let go)
export function landing(sx, sy, a, power, cast, water) {
  const reach = (0.5 + power * (cast - 0.5)) * TILE, ux = Math.cos(a), uy = Math.sin(a);
  let bx = sx, by = sy;
  for (let s = 8; s <= reach; s += 8) { const x = sx + ux * s, y = sy + uy * s; if (!water(x, y)) break; bx = x; by = y; }
  return [bx, by];
}
// the snapshot's spare slots while fishing (the board's when riding: shared/board.js)
export const fishOut = (F) => [F.ph, F.t, F.power, F.barY, F.barV, F.prog, F.out];
export const fishIn = (F, k) => { F.ph = k[0] | 0; F.t = k[1]; F.power = k[2]; F.barY = k[3]; F.barV = k[4]; F.prog = k[5]; F.out = k[6] | 0; return F; };
